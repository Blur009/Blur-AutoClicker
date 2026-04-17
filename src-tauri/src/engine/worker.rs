use std::f64::consts::PI;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

use crate::engine::start_clicker as engine_start;
use crate::engine::stats::{print_run_stats, record_run};
use crate::ClickerSettings;
use crate::ClickerState;
use crate::ClickerStatusPayload;
use crate::STATUS_EVENT;

use super::failsafe::should_stop_for_failsafe;
use super::mouse::{
    get_button_flags, get_cursor_pos, move_mouse, send_clicks, smooth_move, VirtualScreenRect,
};
use super::rng::SmallRng;
use super::ClickerConfig;
use super::NtSetTimerResolution;
use super::RunOutcome;
use super::CLICK_COUNT;

// -- CPU measurement --
// changed from normal cpu measurement because it was not accurately
// showing cpu usage for short clicker run times.

windows_targets::link!(
    "kernel32.dll" "system" fn QueryThreadCycleTime(thread: *mut core::ffi::c_void, cycles: *mut u64) -> i32
);
windows_targets::link!(
    "kernel32.dll" "system" fn GetCurrentThread() -> *mut core::ffi::c_void
);

#[inline]
fn thread_cycles() -> u64 {
    let mut cycles: u64 = 0;
    unsafe {
        QueryThreadCycleTime(GetCurrentThread(), &mut cycles);
    }
    cycles
}

// Calibrates the CPU cycle frequency
fn calibrate_cycle_freq() -> f64 {
    let start_cycles = thread_cycles();
    let start = Instant::now();

    // Spin for ~5ms
    while start.elapsed().as_millis() < 5 {
        std::hint::spin_loop();
    }

    let cycle_delta = thread_cycles().saturating_sub(start_cycles);
    let wall_secs = start.elapsed().as_secs_f64();

    if wall_secs > 0.0 && cycle_delta > 0 {
        let freq = cycle_delta as f64 / wall_secs;
        log::info!("CPU: calibrated at {:.0} MHz", freq / 1_000_000.0);
        freq
    } else {
        3_000_000_000.0 // fallback 3 GHz
    }
}

#[derive(Clone)]
pub struct RunControl {
    app: AppHandle,
    expected_generation: u64,
}

impl RunControl {
    pub fn new(app: AppHandle, expected_generation: u64) -> Self {
        Self {
            app,
            expected_generation,
        }
    }

    pub fn is_current_generation(&self) -> bool {
        self.app
            .state::<ClickerState>()
            .run_generation
            .load(Ordering::SeqCst)
            == self.expected_generation
    }

    pub fn is_active(&self) -> bool {
        let state = self.app.state::<ClickerState>();
        state.running.load(Ordering::SeqCst)
            && state.run_generation.load(Ordering::SeqCst) == self.expected_generation
    }
}

pub fn start_clicker_inner(app: &AppHandle) -> Result<ClickerStatusPayload, String> {
    let state = app.state::<ClickerState>();
    if state.running.load(Ordering::SeqCst) {
        return Err(String::from("Clicker is already running"));
    }

    {
        *state.last_error.lock().unwrap() = None;
        *state.stop_reason.lock().unwrap() = None;
    }

    let settings = state.settings.lock().unwrap().clone();
    let config = build_config(&settings)?;
    let expected_generation = state.run_generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);
    let control = RunControl::new(app.clone(), expected_generation);
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let outcome = engine_start(config, control.clone());
        if !control.is_current_generation() {
            return;
        }

        let state = app_handle.state::<ClickerState>();
        state.running.store(false, Ordering::SeqCst);

        print_run_stats(outcome.click_count, outcome.elapsed_secs, outcome.avg_cpu);

        record_run(outcome.click_count, outcome.elapsed_secs, outcome.avg_cpu);

        *state.stop_reason.lock().unwrap() = Some(outcome.stop_reason.clone());
        *state.last_error.lock().unwrap() = None;
        emit_status(&app_handle);
    });

    let payload = current_status(app);
    emit_status(app);
    Ok(payload)
}
pub fn stop_clicker_inner(
    app: &AppHandle,
    stop_reason: Option<String>,
) -> Result<ClickerStatusPayload, String> {
    let state = app.state::<ClickerState>();
    state.running.store(false, Ordering::SeqCst);
    state.run_generation.fetch_add(1, Ordering::SeqCst);
    if let Some(reason) = stop_reason {
        *state.stop_reason.lock().unwrap() = Some(reason);
    }
    let payload = current_status(app);
    emit_status(app);
    Ok(payload)
}

fn duration_interval_secs(settings: &ClickerSettings) -> f64 {
    let total_millis = u64::from(settings.duration_minutes) * 60_000
        + u64::from(settings.duration_seconds) * 1_000
        + u64::from(settings.duration_milliseconds);
    (total_millis.max(1) as f64) / 1000.0
}

fn interval_secs_from_settings(settings: &ClickerSettings) -> Result<f64, String> {
    if settings.rate_input_mode == "duration" {
        return Ok(duration_interval_secs(settings));
    }

    if settings.click_speed <= 0.0 {
        return Err(String::from("Click speed must be greater than zero"));
    }

    Ok(match settings.click_interval.as_str() {
        "m" => 60.0 / settings.click_speed,
        "h" => 3600.0 / settings.click_speed,
        "d" => 86400.0 / settings.click_speed,
        _ => 1.0 / settings.click_speed,
    })
}

fn current_cycle_target(config: &ClickerConfig, sequence_index: usize) -> (i32, i32) {
    if config.sequence_enabled && !config.sequence_points.is_empty() {
        let safe_index = sequence_index % config.sequence_points.len();
        config.sequence_points[safe_index]
    } else {
        (config.pos_x, config.pos_y)
    }
}

pub fn build_config(settings: &ClickerSettings) -> Result<ClickerConfig, String> {
    let base_interval_secs = interval_secs_from_settings(settings)?;

    let button = match settings.mouse_button.as_str() {
        "Right" => 2,
        "Middle" => 3,
        _ => 1,
    };

    let time_limit_secs = if settings.time_limit_enabled {
        Some(match settings.time_limit_unit.as_str() {
            "m" => settings.time_limit * 60.0,
            "h" => settings.time_limit * 3600.0,
            _ => settings.time_limit,
        })
    } else {
        None
    };

    if settings.sequence_enabled && settings.sequence_points.is_empty() {
        return Err(String::from(
            "Add at least one sequence point before starting sequence clicking",
        ));
    }

    Ok(ClickerConfig {
        interval_secs: base_interval_secs,
        variation: if settings.speed_variation_enabled {
            settings.speed_variation
        } else {
            0.0
        },
        limit: if settings.click_limit_enabled {
            settings.click_limit
        } else {
            0
        },
        duty: if settings.duty_cycle_enabled {
            settings.duty_cycle
        } else {
            0.01
        },
        time_limit: time_limit_secs.unwrap_or(0.0),
        button,
        double_click_enabled: settings.double_click_enabled,
        double_click_delay_ms: settings.double_click_delay,
        position_enabled: settings.position_enabled,
        pos_x: settings.position_x,
        pos_y: settings.position_y,
        sequence_enabled: settings.sequence_enabled,
        sequence_points: settings
            .sequence_points
            .iter()
            .map(|point| (point.x, point.y))
            .collect(),
        offset: 0.0,
        offset_chance: 0.0,
        smoothing: 0,
        custom_stop_zone_enabled: settings.custom_stop_zone_enabled,
        custom_stop_zone: VirtualScreenRect::new(
            settings.custom_stop_zone_x,
            settings.custom_stop_zone_y,
            settings.custom_stop_zone_width.max(1),
            settings.custom_stop_zone_height.max(1),
        ),
        corner_stop_enabled: settings.corner_stop_enabled,
        corner_stop_tl: settings.corner_stop_tl,
        corner_stop_tr: settings.corner_stop_tr,
        corner_stop_bl: settings.corner_stop_bl,
        corner_stop_br: settings.corner_stop_br,
        edge_stop_enabled: settings.edge_stop_enabled,
        edge_stop_top: settings.edge_stop_top,
        edge_stop_right: settings.edge_stop_right,
        edge_stop_bottom: settings.edge_stop_bottom,
        edge_stop_left: settings.edge_stop_left,
    })
}

pub fn current_status(app: &AppHandle) -> ClickerStatusPayload {
    let state = app.state::<ClickerState>();
    let last_error = state.last_error.lock().unwrap().clone();
    let stop_reason = state.stop_reason.lock().unwrap().clone();

    ClickerStatusPayload {
        running: state.running.load(Ordering::SeqCst),
        click_count: get_click_count(),
        last_error,
        stop_reason,
    }
}

pub fn emit_status(app: &AppHandle) {
    let _ = app.emit(STATUS_EVENT, current_status(app));
}

pub fn toggle_clicker_inner(app: &AppHandle) -> Result<ClickerStatusPayload, String> {
    let state = app.state::<ClickerState>();
    if state.running.load(Ordering::SeqCst) {
        stop_clicker_inner(app, Some(String::from("Stopped from hotkey")))
    } else {
        start_clicker_inner(app)
    }
}

pub fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// -- Engine loop --

pub fn start_clicker(config: ClickerConfig, control: RunControl) -> RunOutcome {
    CLICK_COUNT.store(0, Ordering::SeqCst);

    let mut current = 0u32;
    unsafe { NtSetTimerResolution(10000, 1, &mut current) };

    let cycle_freq = calibrate_cycle_freq();
    let cpu_cycles_start = thread_cycles();
    let start_time = Instant::now();

    let mut rng = SmallRng::new();
    let mut click_count: i64 = 0;
    let (down_flag, up_flag) = get_button_flags(config.button);
    let cps = if config.interval_secs > 0.0 {
        1.0 / config.interval_secs
    } else {
        0.0
    };
    let batch_size = if !config.double_click_enabled && cps >= 50.0 {
        2usize
    } else {
        1usize
    };

    let batch_interval = config.interval_secs * batch_size as f64;
    let has_position = config.position_enabled || config.sequence_enabled;
    let use_smoothing = config.smoothing == 1 && cps < 50.0;

    let mut sequence_index = 0usize;
    let (mut target_x, mut target_y) = current_cycle_target(&config, sequence_index);
    let mut next_batch_time = Instant::now();
    let mut stop_reason = String::from("Stopped");

    if has_position {
        move_mouse(target_x, target_y);
    }

    while control.is_active() {
        if let Some(reason) = should_stop_for_failsafe(&config) {
            stop_reason = reason;
            break;
        }

        if config.limit > 0 && click_count >= config.limit as i64 {
            stop_reason = format!("Click limit reached ({})", config.limit);
            break;
        }

        if config.time_limit > 0.0 && start_time.elapsed().as_secs_f64() >= config.time_limit {
            stop_reason = format!("Time limit reached ({:.1}s)", config.time_limit);
            break;
        }

        let batch_duration = if config.variation > 0.0 {
            let std_dev = batch_interval * (config.variation / 100.0);
            rng.next_gaussian(batch_interval, std_dev)
        } else {
            batch_interval
        };
        let hold_ms =
            (config.interval_secs * (config.duty.max(0.0) / 100.0) * 1000.0) as u32;

        next_batch_time += Duration::from_secs_f64(batch_duration.max(0.001));

        if has_position {
            let (base_x, base_y) = current_cycle_target(&config, sequence_index);
            if config.offset_chance <= 0.0 || rng.next_f64() * 100.0 <= config.offset_chance {
                let angle = rng.next_f64() * 2.0 * PI;
                let radius = rng.next_f64().sqrt() * config.offset;
                target_x = (base_x as f64 + radius * angle.cos()) as i32;
                target_y = (base_y as f64 + radius * angle.sin()) as i32;
            } else {
                target_x = base_x;
                target_y = base_y;
            }

            if use_smoothing {
                let (cur_x, cur_y) = get_cursor_pos();
                if cur_x != target_x || cur_y != target_y {
                    let smooth_dur =
                        ((batch_duration * (0.2 + rng.next_f64() * 0.4)) * 1000.0) as u64;
                    smooth_move(
                        cur_x,
                        cur_y,
                        target_x,
                        target_y,
                        smooth_dur.clamp(15, 200),
                        &mut rng,
                    );
                }
            } else {
                move_mouse(target_x, target_y);
            }
        }

        let remaining_clicks = if config.limit > 0 {
            (config.limit as i64 - click_count).max(0) as usize
        } else {
            usize::MAX
        };

        let clicks_this_cycle = if config.double_click_enabled {
            remaining_clicks.min(2)
        } else {
            remaining_clicks.min(batch_size)
        };

        if clicks_this_cycle == 0 {
            stop_reason = format!("Click limit reached ({})", config.limit);
            break;
        }

        send_clicks(
            down_flag,
            up_flag,
            clicks_this_cycle,
            hold_ms,
            config.double_click_enabled,
            config.double_click_delay_ms,
            &control,
        );

        if !control.is_active() {
            break;
        }

        click_count += clicks_this_cycle as i64;
        CLICK_COUNT.store(click_count, Ordering::Relaxed);

        if config.sequence_enabled && !config.sequence_points.is_empty() {
            sequence_index = (sequence_index + 1) % config.sequence_points.len();
        }

        let remaining = next_batch_time.saturating_duration_since(Instant::now());
        if remaining > Duration::ZERO {
            sleep_interruptible(remaining, &control);
        }
    }

    unsafe { NtSetTimerResolution(10000, 0, &mut current) };

    let elapsed_secs = start_time.elapsed().as_secs_f64();
    let cpu_cycles_end = thread_cycles();
    let cycle_delta = cpu_cycles_end.saturating_sub(cpu_cycles_start);

    let avg_cpu: f64 = if elapsed_secs < 0.001 {
        -1.0
    } else {
        let cpu_seconds = cycle_delta as f64 / cycle_freq;
        let pct = (cpu_seconds / elapsed_secs) * 100.0;
        if pct < 0.001 {
            -1.0
        } else {
            pct
        }
    };

    RunOutcome {
        stop_reason,
        click_count,
        elapsed_secs,
        avg_cpu,
    }
}

pub fn get_click_count() -> i64 {
    CLICK_COUNT.load(Ordering::Relaxed)
}

pub fn sleep_interruptible(remaining: Duration, control: &RunControl) {
    let tick = Duration::from_millis(5);
    let start = Instant::now();
    while control.is_active() && start.elapsed() < remaining {
        let left = remaining.saturating_sub(start.elapsed());
        std::thread::sleep(left.min(tick));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_settings() -> ClickerSettings {
        ClickerSettings::default()
    }

    fn sample_config() -> ClickerConfig {
        ClickerConfig {
            interval_secs: 0.04,
            variation: 0.0,
            limit: 0,
            duty: 45.0,
            time_limit: 0.0,
            button: 1,
            double_click_enabled: false,
            double_click_delay_ms: 40,
            position_enabled: false,
            pos_x: 0,
            pos_y: 0,
            sequence_enabled: false,
            sequence_points: Vec::new(),
            offset: 0.0,
            offset_chance: 0.0,
            smoothing: 0,
            custom_stop_zone_enabled: false,
            custom_stop_zone: VirtualScreenRect::new(0, 0, 100, 100),
            corner_stop_enabled: true,
            corner_stop_tl: 50,
            corner_stop_tr: 50,
            corner_stop_bl: 50,
            corner_stop_br: 50,
            edge_stop_enabled: true,
            edge_stop_top: 40,
            edge_stop_right: 40,
            edge_stop_bottom: 40,
            edge_stop_left: 40,
        }
    }

    #[test]
    fn duration_mode_interval_calculation_uses_one_millisecond_minimum() {
        let mut settings = sample_settings();
        settings.rate_input_mode = "duration".to_string();

        let interval = interval_secs_from_settings(&settings).expect("duration should work");
        assert!((interval - 0.040).abs() < f64::EPSILON);

        settings.duration_milliseconds = 0;
        let minimum_interval =
            interval_secs_from_settings(&settings).expect("duration should work");
        assert!((minimum_interval - 0.001).abs() < f64::EPSILON);
    }

    #[test]
    fn duration_mode_interval_calculation_handles_multi_part_duration() {
        let mut settings = sample_settings();
        settings.rate_input_mode = "duration".to_string();
        settings.duration_minutes = 1;
        settings.duration_seconds = 35;
        settings.duration_milliseconds = 250;

        let interval = interval_secs_from_settings(&settings).expect("duration should work");
        assert!((interval - 95.25).abs() < f64::EPSILON);
    }

    #[test]
    fn sequence_point_rotation_is_round_robin() {
        let mut config = sample_config();
        config.sequence_enabled = true;
        config.sequence_points = vec![(10, 10), (20, 20)];

        assert_eq!(current_cycle_target(&config, 0), (10, 10));
        assert_eq!(current_cycle_target(&config, 1), (20, 20));
        assert_eq!(current_cycle_target(&config, 2), (10, 10));
    }
}
