/*
 * Blur Auto Clicker - clicker_engine.rs
 * Copyright (C) 2026  [Blur009]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Made with Spite. (the emotion)
*/

// Imports
use std::f64::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{FILETIME, POINT};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos};

static IS_RUNNING: AtomicBool = AtomicBool::new(false);
static CLICK_COUNT: AtomicI64 = AtomicI64::new(0);

type StatsCallback = extern "C" fn(i64, f64, f64);
static ON_STOP: OnceLock<StatsCallback> = OnceLock::new();

#[no_mangle] // Register a callback to receive final stats when the clicker stops
pub extern "C" fn set_stats_callback(cb: StatsCallback) {
    let _ = ON_STOP.set(cb);
}

#[no_mangle] // Get the current click count (safe to call from Python at any time)
pub extern "C" fn get_click_count() -> i64 {
    CLICK_COUNT.load(Ordering::Relaxed)
}

// --- Mouse ---
#[inline] // Get current cursor position
fn get_cursor_pos() -> (i32, i32) {
    let mut pt = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut pt) };
    (pt.x, pt.y)
}

#[inline] // Move cursor to (x, y)
fn move_mouse(x: i32, y: i32) {
    unsafe { SetCursorPos(x, y) };
}

#[inline] // Create an INPUT structure for a mouse event with given flags
fn make_input(flags: u32, time: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time,
                dwExtraInfo: 0,
            },
        },
    }
}

#[inline] // Send a single mouse event (down or up)
fn send_mouse_event(flags: u32) {
    let input = make_input(flags, 0);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
}

// Send a batch of mouse events with optional hold duration
fn send_batch(down: u32, up: u32, n: usize, hold_ms: u32) {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(n * 2);
    for _ in 0..n {
        inputs.push(make_input(down, 0));
        inputs.push(make_input(up, hold_ms));
    }
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
}

#[inline] // Get correct mouse button flags
fn get_button_flags(button: i32) -> (u32, u32) {
    match button {
        2 => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        3 => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    }
}

// --- CPU Sampling ---

// Read system-wide idle/kernel/user times and return CPU usage % since last call
fn cpu_usage_percent(prev_idle: &mut u64, prev_total: &mut u64) -> f64 {
    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut kernel = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut user = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };

    unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    };

    let to_u64 = |ft: FILETIME| (ft.dwHighDateTime as u64) << 32 | ft.dwLowDateTime as u64;

    let process_time = to_u64(kernel) + to_u64(user);

    let d_process = process_time.saturating_sub(*prev_idle);
    *prev_idle = process_time;

    // wall clock time in 100ns units
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
        / 100;
    let d_wall = now.saturating_sub(*prev_total);
    *prev_total = now;

    if d_wall == 0 {
        return 0.0;
    }
    (d_process as f64 / d_wall as f64) * 100.0
}

// --- Movement ---

#[inline] // Easing function for smooth movement (ease-in-out quadratic)
fn ease_in_out_quad(t: f64) -> f64 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

#[inline] // Cubic Bezier interpolation for smooth movement
fn cubic_bezier(t: f64, p0: f64, p1: f64, p2: f64, p3: f64) -> f64 {
    let u = 1.0 - t;
    u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
}

fn smooth_move(
    // Smoothly move mouse from (start_x, start_y) to (end_x, end_y) over duration_ms milliseconds
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
    rng: &mut SmallRng,
) {
    if duration_ms < 5 {
        move_mouse(end_x, end_y);
        return;
    }

    let (sx, sy) = (start_x as f64, start_y as f64);
    let (ex, ey) = (end_x as f64, end_y as f64);
    let (dx, dy) = (ex - sx, ey - sy);
    let distance = (dx * dx + dy * dy).sqrt();
    if distance < 1.0 {
        return;
    }

    let (perp_x, perp_y) = (-dy / distance, dx / distance);
    let sign = |b: bool| if b { 1.0f64 } else { -1.0 };
    let o1 = (rng.next_f64() * 0.3 + 0.15) * distance * sign(rng.next_f64() >= 0.5);
    let o2 = (rng.next_f64() * 0.3 + 0.15) * distance * sign(rng.next_f64() >= 0.5);

    let cp1x = sx + dx * 0.33 + perp_x * o1;
    let cp1y = sy + dy * 0.33 + perp_y * o1;
    let cp2x = sx + dx * 0.66 + perp_x * o2;
    let cp2y = sy + dy * 0.66 + perp_y * o2;

    let steps = (duration_ms as usize).clamp(10, 200);
    let step_dur = Duration::from_millis(duration_ms / steps as u64);

    for i in 0..=steps {
        let t = ease_in_out_quad(i as f64 / steps as f64);
        move_mouse(
            cubic_bezier(t, sx, cp1x, cp2x, ex) as i32,
            cubic_bezier(t, sy, cp1y, cp2y, ey) as i32,
        );
        if i < steps {
            std::thread::sleep(step_dur);
        }
    }
}

// --- RNG (xorshift64) ---

struct SmallRng {
    state: u64,
    cached_gaussian: Option<f64>,
}

impl SmallRng {
    fn new() -> Self {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos() as u64 ^ d.as_secs())
            .unwrap_or(12345);
        let seed = t ^ (std::process::id() as u64 * 0x9e3779b97f4a7c15);
        Self {
            state: seed,
            cached_gaussian: None,
        }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }

    #[inline]
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn next_gaussian(&mut self, mean: f64, std_dev: f64) -> f64 {
        let z = if let Some(cached) = self.cached_gaussian.take() {
            cached
        } else {
            let u1 = (self.next_f64() + 1e-10).min(1.0);
            let u2 = self.next_f64();
            let mag = (-2.0 * u1.ln()).sqrt();
            self.cached_gaussian = Some(mag * (2.0 * PI * u2).sin());
            mag * (2.0 * PI * u2).cos()
        };
        (mean + z * std_dev).max(0.001)
    }
}

// --- Exported API ---
#[link(name = "ntdll")] // Import Timer Resolution
extern "system" {
    fn NtSetTimerResolution(
        DesiredResolution: u32,
        SetResolution: u8,
        CurrentResolution: *mut u32,
    ) -> u32;
}

#[no_mangle] // Main function to start the clicker with given parameters
pub extern "C" fn start_clicker(
    interval: f64,      // Base interval between clicks in seconds
    variation: f64,     // Percentage variation in click timing (0-100)
    limit: i32,         // Total number of clicks to perform (0 for unlimited)
    duty: f64,          // Percentage of time the button is held down during each click (0-100)
    time_limit: f64,    // Maximum time to run the clicker in seconds (0 for unlimited)
    button: i32,        // Which mouse button to click (1=left, 2=right, 3=middle)
    pos_x: i32,         // X coordinate for clicking (0 to ignore)
    pos_y: i32,         // Y coordinate for clicking (0 to ignore)
    offset: f64,        // Maximum random offset radius in pixels for click position
    offset_chance: f64, // Chance (0-100) to apply random offset to click position
    smoothing: i32,     // Whether to use smooth movement when moving the cursor (0 or 1)
) {
    CLICK_COUNT.store(0, Ordering::SeqCst);
    IS_RUNNING.store(true, Ordering::SeqCst);

    let mut current = 0u32; // Request high timer resolution (in nanoseconds)
    unsafe { NtSetTimerResolution(10000, 1, &mut current) };

    let mut rng = SmallRng::new();
    let start_time = Instant::now();
    let mut click_count: i64 = 0;

    // --- CPU tracking ---
    let mut prev_idle: u64 = 0;
    let mut prev_total: u64 = 0;
    let mut cpu_samples: Vec<f64> = Vec::new();
    let mut last_cpu_sample = Instant::now();
    cpu_usage_percent(&mut prev_idle, &mut prev_total);

    let (down_flag, up_flag) = get_button_flags(button);
    let cps = if interval > 0.0 { 1.0 / interval } else { 0.0 };
    let batch_size = if cps >= 50.0 { 2usize } else { 1 };
    let batch_interval = interval * batch_size as f64;
    let hold_ms = (interval * (duty / 100.0) * 1000.0) as u32;
    let use_smoothing = smoothing == 1 && cps < 50.0;
    let has_position = pos_x != 0 || pos_y != 0;

    let mut target_x = pos_x;
    let mut target_y = pos_y;

    if has_position {
        move_mouse(target_x, target_y);
    }

    let mut next_batch_time = Instant::now();
    let mut fatigue: f64 = 0.0;
    let mut next_pause: i64 = 180 + (rng.next_u64() % 120) as i64;

    while IS_RUNNING.load(Ordering::SeqCst) {
        // Introduce random pauses to simulate fatigue if variation is enabled
        if variation > 0.0 && click_count >= next_pause {
            let pause_ms = 50 + (rng.next_u64() % 200) as u64;
            std::thread::sleep(Duration::from_millis(pause_ms));
            next_pause = click_count + 180 + (rng.next_u64() % 120) as i64;
            fatigue = 0.0;
        }

        // Increase fatigue based on variation and whether speed variation is enabled
        fatigue = if variation > 0.0 {
            (fatigue + 0.0000002).min(0.15)
        } else {
            0.0
        };

        // Check limits
        if (limit > 0 && click_count >= limit as i64)
            || (time_limit > 0.0 && start_time.elapsed().as_secs_f64() >= time_limit)
        {
            break;
        }

        // Apply timing variation for this interval
        let batch_duration = if variation > 0.0 {
            let std_dev = batch_interval * (variation / 100.0) * 0.5;
            rng.next_gaussian(batch_interval, std_dev) * (1.0 + fatigue)
        } else {
            batch_interval
        };

        next_batch_time += Duration::from_secs_f64(batch_duration);

        if has_position {
            if offset_chance <= 0.0 || rng.next_f64() * 100.0 <= offset_chance {
                let angle = rng.next_f64() * 2.0 * PI;
                let radius = rng.next_f64().sqrt() * offset;
                target_x = (pos_x as f64 + radius * angle.cos()) as i32;
                target_y = (pos_y as f64 + radius * angle.sin()) as i32;
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

        if batch_size > 1 {
            send_batch(down_flag, up_flag, batch_size, hold_ms);
        } else {
            send_mouse_event(down_flag);
            if hold_ms > 0 {
                std::thread::sleep(Duration::from_millis(hold_ms as u64));
            }
            send_mouse_event(up_flag);
        }

        click_count += batch_size as i64;
        CLICK_COUNT.store(click_count, Ordering::Relaxed);

        // Sample CPU usage ~once per second
        if last_cpu_sample.elapsed() >= Duration::from_secs(1) {
            cpu_samples.push(cpu_usage_percent(&mut prev_idle, &mut prev_total));
            last_cpu_sample = Instant::now();
        }

        let remaining = next_batch_time.saturating_duration_since(Instant::now());
        if remaining > Duration::ZERO {
            std::thread::sleep(remaining);
        }
    }

    unsafe { NtSetTimerResolution(10000, 0, &mut current) };

    let elapsed = start_time.elapsed().as_secs_f64();

    let avg_cpu = if cpu_samples.is_empty() {
        0.0
    } else {
        let sum: f64 = cpu_samples.iter().sum();
        let avg = sum / cpu_samples.len() as f64;
        cpu_samples.clear(); // free memory immediately after use
        avg
    };

    println!(
        "\x1b[32m[Stats]\x1b[0m Time: {:.2}s, Clicks: {}, Avg CPU: {:.1}%",
        elapsed, click_count, avg_cpu,
    );

    // Fire the Python callback with final stats
    if let Some(cb) = ON_STOP.get() {
        cb(click_count, elapsed, avg_cpu);
    }
}

#[no_mangle]
pub extern "C" fn stop_clicker() {
    IS_RUNNING.store(false, Ordering::SeqCst);
}
