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
use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetDoubleClickTime;

use super::cycle::ClickCyclePlan;
use super::failsafe::should_stop_for_failsafe;
use super::keyboard::{is_alphabetic_vk, send_key_presses};
use super::mouse::{
    get_button_flags, get_cursor_pos, move_mouse, send_clicks, smooth_move, VirtualScreenRect,
};
use super::rng::SmallRng;
use super::ClickerConfig;
use super::NtSetTimerResolution;
use super::RunOutcome;
use super::SequenceTarget;
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

impl ClickerConfig {
    pub fn use_sequence(&self) -> bool {
        self.sequence_enabled && !self.sequence_points.is_empty()
    }
}

fn calibrate_cycle_freq() -> f64 {
    let start_cycles = thread_cycles();
    let start = Instant::now();

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

    // Prevent feedback loop: keyboard key must not match a modifier-free hotkey
    if config.input_type == 1 && config.key_code > 0 {
        let hotkey_binding = state.registered_hotkey.lock().unwrap().clone();
        if let Some(binding) = hotkey_binding {
            if binding.main_vk == config.key_code as i32 {
                let conflicts_with_plain_key =
                    !binding.ctrl && !binding.alt && !binding.shift && !binding.super_key;
                let conflicts_with_uppercase_key = config.keyboard_uppercase
                    && binding.shift
                    && !binding.ctrl
                    && !binding.alt
                    && !binding.super_key;

                if conflicts_with_plain_key || conflicts_with_uppercase_key {
                    return Err(String::from(
                        "The auto-press key conflicts with your hotkey. Use a modifier on the hotkey (e.g. Ctrl+key) or pick a different key.",
                    ));
                }
            }
        }
    }

    if config.use_sequence() {
        state.active_sequence_index.store(0, Ordering::SeqCst);
        state.active_sequence_tick.store(0, Ordering::SeqCst);
    }
    let expected_generation = state.run_generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);
    let control = RunControl::new(app.clone(), expected_generation);
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let outcome = engine_start(config, control.clone());

        print_run_stats(outcome.click_count, outcome.elapsed_secs, outcome.avg_cpu);
        record_run(outcome.click_count, outcome.elapsed_secs, outcome.avg_cpu);

        if !control.is_current_generation() {
            return;
        }

        let state = app_handle.state::<ClickerState>();
        state.running.store(false, Ordering::SeqCst);
        state.active_sequence_index.store(-1, Ordering::SeqCst);
        state.active_sequence_tick.store(0, Ordering::SeqCst);

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
    state.active_sequence_index.store(-1, Ordering::SeqCst);
    state.active_sequence_tick.store(0, Ordering::SeqCst);
    state.run_generation.fetch_add(1, Ordering::SeqCst);
    if let Some(reason) = stop_reason {
        *state.stop_reason.lock().unwrap() = Some(reason);
    }
    let payload = current_status(app);
    emit_status(app);
    Ok(payload)
}

fn duration_interval_secs(settings: &ClickerSettings) -> f64 {
    let total_millis = u64::from(settings.duration_hours) * 3_600_000
        + u64::from(settings.duration_minutes) * 60_000
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

fn system_double_click_gap_ms() -> u32 {
    let system_timeout_ms = unsafe { GetDoubleClickTime() };
    ((system_timeout_ms as f64) * 0.9).floor() as u32
}

fn current_cycle_target(config: &ClickerConfig, sequence_index: usize) -> SequenceTarget {
    if config.use_sequence() {
        let safe_index = sequence_index % config.sequence_points.len();
        config.sequence_points[safe_index]
    } else {
        let (x, y) = get_cursor_pos();
        SequenceTarget { x, y, clicks: 1 }
    }
}

pub fn build_config(settings: &ClickerSettings) -> Result<ClickerConfig, String> {
    let base_interval_secs = interval_secs_from_settings(settings)?;

    let button = match settings.mouse_button.as_str() {
        "Right" => 2,
        "Middle" => 3,
        _ => 1,
    };

    let is_keyboard = settings.input_type == "keyboard";
    let key_code = if is_keyboard && !settings.keyboard_key.is_empty() {
        match crate::hotkeys::parse_hotkey_main_key(&settings.keyboard_key, &settings.keyboard_key)
        {
            Ok((vk, _)) => vk as u16,
            Err(_) => return Err(format!("Unknown keyboard key: '{}'", settings.keyboard_key)),
        }
    } else {
        0u16
    };

    if is_keyboard && key_code == 0 {
        return Err(String::from("Keyboard mode requires a key to be selected"));
    }
    let keyboard_uppercase =
        is_keyboard && settings.keyboard_key_case == "upper" && is_alphabetic_vk(key_code);

    let time_limit_secs = if settings.time_limit_enabled {
        Some(match settings.time_limit_unit.as_str() {
            "m" => settings.time_limit * 60.0,
            "h" => settings.time_limit * 3600.0,
            _ => settings.time_limit,
        })
    } else {
        None
    };

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
        double_click_gap_ms: system_double_click_gap_ms(),
        sequence_enabled: settings.sequence_enabled,
        sequence_points: settings
            .sequence_points
            .iter()
            .map(|point| SequenceTarget {
                x: point.x,
                y: point.y,
                clicks: point.clicks.clamp(1, 100000) as usize,
            })
            .collect(),
        offset: 2.0,
        offset_chance: 21.6,
        smoothing: 1,
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
        input_type: if is_keyboard { 1 } else { 0 },
        key_code,
        keyboard_uppercase,
    })
}

pub fn current_status(app: &AppHandle) -> ClickerStatusPayload {
    let state = app.state::<ClickerState>();
    let last_error = state.last_error.lock().unwrap().clone();
    let stop_reason = state.stop_reason.lock().unwrap().clone();
    let active_sequence_index = state.active_sequence_index.load(Ordering::SeqCst);
    let active_sequence_tick = state.active_sequence_tick.load(Ordering::SeqCst);

    ClickerStatusPayload {
        running: state.running.load(Ordering::SeqCst),
        click_count: get_click_count(),
        last_error,
        stop_reason,
        active_sequence_index: if active_sequence_index >= 0 {
            Some(active_sequence_index as usize)
        } else {
            None
        },
        active_sequence_tick,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CycleBatchPlan {
    cycles: usize,
    double_cycles: usize,
    single_cycles: usize,
    physical_clicks: usize,
}

fn plan_cycle_batch(
    requested_cycles: usize,
    remaining_clicks: usize,
    double_click_enabled: bool,
) -> CycleBatchPlan {
    if !double_click_enabled {
        let cycles = requested_cycles.min(remaining_clicks);
        return CycleBatchPlan {
            cycles,
            double_cycles: 0,
            single_cycles: cycles,
            physical_clicks: cycles,
        };
    }

    let max_cycles_for_remaining = remaining_clicks / 2 + (remaining_clicks % 2);
    let cycles = requested_cycles.min(max_cycles_for_remaining);
    let double_cycles = cycles.min(remaining_clicks / 2);
    let single_cycles = cycles.saturating_sub(double_cycles);

    CycleBatchPlan {
        cycles,
        double_cycles,
        single_cycles,
        physical_clicks: double_cycles.saturating_mul(2) + single_cycles,
    }
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
    let is_keyboard = config.input_type == 1 && config.key_code > 0;
    let (down_flag, up_flag) = if is_keyboard {
        (0u32, 0u32)
    } else {
        get_button_flags(config.button)
    };
    let cps = if config.interval_secs > 0.0 {
        1.0 / config.interval_secs
    } else {
        0.0
    };
    let batch_size = if !config.double_click_enabled && cps > 500.0 {
        3usize
    } else if !config.double_click_enabled && cps >= 50.0 {
        2usize
    } else {
        1usize
    };
    let effective_duty = if cps > 500.0 {
        config.duty.min(1.0)
    } else if cps >= 50.0 {
        config.duty.min(99.0)
    } else {
        config.duty
    };

    let has_position = config.use_sequence();
    let use_smoothing = config.smoothing == 1 && cps < 50.0;

    let mut sequence_index = 0usize;
    let mut cycle_target = current_cycle_target(&config, sequence_index);
    let mut sequence_clicks_remaining = cycle_target.clicks.max(1);
    let (mut target_x, mut target_y) = if has_position {
        (cycle_target.x, cycle_target.y)
    } else {
        get_cursor_pos()
    };
    let mut next_batch_time = Instant::now();
    let mut stop_reason = String::from("Stopped");
    let mut moved_sequence_index: Option<usize> = None;

    if has_position {
        move_mouse(target_x, target_y);
        moved_sequence_index = Some(sequence_index);
    }

    if config.use_sequence() {
        let state = control.app.state::<ClickerState>();
        state
            .active_sequence_index
            .store(sequence_index as i64, Ordering::SeqCst);
        state.active_sequence_tick.fetch_add(1, Ordering::SeqCst);
        emit_status(&control.app);
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

        cycle_target = current_cycle_target(&config, sequence_index);

        if has_position {
            let (base_x, base_y) = (cycle_target.x, cycle_target.y);
            if config.offset_chance > 0.0 && rng.next_f64() * 100.0 <= config.offset_chance {
                let angle = rng.next_f64() * 2.0 * PI;
                let radius = rng.next_f64().sqrt() * config.offset;
                target_x = (base_x as f64 + radius * angle.cos()) as i32;
                target_y = (base_y as f64 + radius * angle.sin()) as i32;
            } else {
                target_x = base_x;
                target_y = base_y;
            }

            let should_move_to_target =
                moved_sequence_index != Some(sequence_index) || config.offset > 0.0;

            if use_smoothing && should_move_to_target {
                let (cur_x, cur_y) = get_cursor_pos();
                if cur_x != target_x || cur_y != target_y {
                    let smooth_dur =
                        ((config.interval_secs * (0.2 + rng.next_f64() * 0.4)) * 1000.0) as u64;
                    smooth_move(
                        cur_x,
                        cur_y,
                        target_x,
                        target_y,
                        smooth_dur.clamp(1, 200),
                        &mut rng,
                    );
                }
                moved_sequence_index = Some(sequence_index);
            } else if should_move_to_target {
                move_mouse(target_x, target_y);
                moved_sequence_index = Some(sequence_index);
            }
        }

        let requested_cycles = if config.use_sequence() {
            sequence_clicks_remaining.min(batch_size)
        } else {
            batch_size
        };

        let remaining_clicks = if config.limit > 0 {
            (config.limit as i64 - click_count).max(0) as usize
        } else {
            usize::MAX
        };

        let cycle_batch = plan_cycle_batch(
            requested_cycles,
            remaining_clicks,
            config.double_click_enabled,
        );

        if cycle_batch.cycles == 0 {
            stop_reason = format!("Click limit reached ({})", config.limit);
            break;
        }

        let variation_ratio = config.variation / 100.0;
        let hold_factor = effective_duty.max(0.0) / 100.0 * 1000.0;
        let actual_duration_base = config.interval_secs * cycle_batch.cycles as f64;
        let batch_duration = if config.variation > 0.0 {
            rng.next_gaussian(actual_duration_base, actual_duration_base * variation_ratio)
        } else {
            actual_duration_base
        };
        let cycle_ms = (config.interval_secs * 1000.0).max(1.0) as u32;
        let hold_ms = ((config.interval_secs * hold_factor) as u32).min(cycle_ms);
        next_batch_time += Duration::from_secs_f64(batch_duration.max(0.001));

        let single_cycle_plan = ClickCyclePlan::single(hold_ms);
        let double_cycle_plan =
            ClickCyclePlan::double(hold_ms, cycle_ms, config.double_click_gap_ms);

        if is_keyboard {
            if cycle_batch.double_cycles > 0 {
                send_key_presses(
                    config.key_code,
                    cycle_batch.double_cycles,
                    config.keyboard_uppercase,
                    double_cycle_plan,
                    &control,
                );
            }
            if cycle_batch.single_cycles > 0 {
                send_key_presses(
                    config.key_code,
                    cycle_batch.single_cycles,
                    config.keyboard_uppercase,
                    single_cycle_plan,
                    &control,
                );
            }
        } else {
            if cycle_batch.double_cycles > 0 {
                send_clicks(
                    down_flag,
                    up_flag,
                    cycle_batch.double_cycles,
                    double_cycle_plan,
                    &control,
                );
            }
            if cycle_batch.single_cycles > 0 {
                send_clicks(
                    down_flag,
                    up_flag,
                    cycle_batch.single_cycles,
                    single_cycle_plan,
                    &control,
                );
            }
        }

        if !control.is_active() {
            break;
        }

        click_count += cycle_batch.physical_clicks as i64;
        CLICK_COUNT.store(click_count, Ordering::Relaxed);

        let remaining = next_batch_time.saturating_duration_since(Instant::now());
        if remaining > Duration::ZERO {
            sleep_interruptible(remaining, &control);
        }

        if config.use_sequence() {
            sequence_clicks_remaining = sequence_clicks_remaining.saturating_sub(cycle_batch.cycles);
            if sequence_clicks_remaining == 0 {
                sequence_index = (sequence_index + 1) % config.sequence_points.len();
                sequence_clicks_remaining = config.sequence_points[sequence_index].clicks.max(1);
                let state = control.app.state::<ClickerState>();
                state
                    .active_sequence_index
                    .store(sequence_index as i64, Ordering::SeqCst);
                state.active_sequence_tick.fetch_add(1, Ordering::SeqCst);
                emit_status(&control.app);
            }
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
            double_click_gap_ms: 450,
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
            input_type: 0,
            key_code: 0,
            keyboard_uppercase: false,
        }
    }

    #[test]
    fn double_click_batch_uses_single_cycle_when_only_one_click_remains() {
        assert_eq!(
            plan_cycle_batch(1, 1, true),
            CycleBatchPlan {
                cycles: 1,
                double_cycles: 0,
                single_cycles: 1,
                physical_clicks: 1,
            }
        );
    }

    #[test]
    fn double_click_batch_prefers_full_double_cycles_when_possible() {
        assert_eq!(
            plan_cycle_batch(2, 3, true),
            CycleBatchPlan {
                cycles: 2,
                double_cycles: 1,
                single_cycles: 1,
                physical_clicks: 3,
            }
        );
    }

    #[test]
    fn duration_mode_interval_calculation_uses_one_millisecond_minimum() {
        let mut settings = sample_settings();
        settings.rate_input_mode = "duration".to_string();
        settings.duration_hours = 0;

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
        settings.duration_hours = 0;
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
        config.sequence_points = vec![
            SequenceTarget {
                x: 10,
                y: 10,
                clicks: 1,
            },
            SequenceTarget {
                x: 20,
                y: 20,
                clicks: 1,
            },
        ];

        assert_eq!(
            current_cycle_target(&config, 0),
            SequenceTarget {
                x: 10,
                y: 10,
                clicks: 1
            }
        );
        assert_eq!(
            current_cycle_target(&config, 1),
            SequenceTarget {
                x: 20,
                y: 20,
                clicks: 1
            }
        );
        assert_eq!(
            current_cycle_target(&config, 2),
            SequenceTarget {
                x: 10,
                y: 10,
                clicks: 1
            }
        );
    }

    #[test]
    fn keyboard_uppercase_is_enabled_only_for_letter_keys() {
        let mut settings = sample_settings();
        settings.input_type = "keyboard".to_string();
        settings.keyboard_key = "a".to_string();
        settings.keyboard_key_case = "upper".to_string();

        let config = build_config(&settings).expect("letter key should parse");
        assert_eq!(config.key_code, b'A' as u16);
        assert!(config.keyboard_uppercase);

        settings.keyboard_key = "1".to_string();
        let config = build_config(&settings).expect("digit key should parse");
        assert_eq!(config.key_code, b'1' as u16);
        assert!(!config.keyboard_uppercase);
    }
}
