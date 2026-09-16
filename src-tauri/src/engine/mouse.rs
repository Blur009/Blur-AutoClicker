use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};
use std::cell::Cell;
use std::time::Duration;
use std::time::Instant;

use super::AUTOCLICKER_EXTRA_INFO;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_VIRTUALDESK, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VirtualScreenRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

impl VirtualScreenRect {
    #[inline]
    pub fn new(left: i32, top: i32, width: i32, height: i32) -> Self {
        Self {
            left,
            top,
            width,
            height,
        }
    }

    #[inline]
    pub fn right(self) -> i32 {
        self.left.saturating_add(self.width)
    }

    #[inline]
    pub fn bottom(self) -> i32 {
        self.top.saturating_add(self.height)
    }

    #[inline]
    pub fn contains(self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right() && y >= self.top && y < self.bottom()
    }

    fn normalize_axis(pixel: i32, origin: i32, span: i32) -> i32 {
        if span <= 1 {
            return 0;
        }
        let max_offset = span - 1;
        let offset = pixel.saturating_sub(origin).clamp(0, max_offset);
        ((offset as f64 / max_offset as f64) * 65535.0).round() as i32
    }

    fn normalize_x(&self, pixel_x: i32) -> i32 {
        Self::normalize_axis(pixel_x, self.left, self.width)
    }

    fn normalize_y(&self, pixel_y: i32) -> i32 {
        Self::normalize_axis(pixel_y, self.top, self.height)
    }

    #[inline]
    pub fn offset_from(self, origin: VirtualScreenRect) -> Self {
        Self::new(
            self.left.saturating_sub(origin.left),
            self.top.saturating_sub(origin.top),
            self.width,
            self.height,
        )
    }
}

pub fn current_cursor_position() -> Option<(i32, i32)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT { x: 0, y: 0 };
    let ok = unsafe { GetCursorPos(&mut point) };
    if ok == 0 {
        None
    } else {
        Some((point.x, point.y))
    }
}

pub fn current_virtual_screen_rect() -> Option<VirtualScreenRect> {
    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
    if width <= 0 || height <= 0 {
        return None;
    }

    Some(VirtualScreenRect::new(left, top, width, height))
}

#[cfg(target_os = "windows")]
pub fn current_monitor_rects() -> Option<Vec<VirtualScreenRect>> {
    use std::ptr;
    use std::sync::{Mutex, OnceLock};
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO};

    static CACHE: OnceLock<Mutex<Option<(Instant, VirtualScreenRect, Vec<VirtualScreenRect>)>>> =
        OnceLock::new();

    let screen = current_virtual_screen_rect()?;
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    {
        let cached = cache.lock().unwrap_or_else(|error| error.into_inner());
        if let Some((cached_at, cached_screen, monitors)) = cached.as_ref() {
            if *cached_screen == screen && cached_at.elapsed() < Duration::from_secs(1) {
                return Some(monitors.clone());
            }
        }
    }

    unsafe extern "system" fn enum_monitor_proc(
        monitor: *mut std::ffi::c_void,
        _hdc: *mut std::ffi::c_void,
        _clip_rect: *mut RECT,
        user_data: isize,
    ) -> i32 {
        let monitors = &mut *(user_data as *mut Vec<VirtualScreenRect>);
        let mut info = std::mem::zeroed::<MONITORINFO>();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;

        if GetMonitorInfoW(monitor, &mut info as *mut MONITORINFO as *mut _) == 0 {
            return 1;
        }

        let rect = info.rcMonitor;
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width > 0 && height > 0 {
            monitors.push(VirtualScreenRect::new(rect.left, rect.top, width, height));
        }

        1
    }

    let mut monitors = Vec::new();
    let ok = unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            ptr::null(),
            Some(enum_monitor_proc),
            &mut monitors as *mut Vec<VirtualScreenRect> as isize,
        )
    };

    if ok == 0 || monitors.is_empty() {
        monitors.push(screen);
    } else {
        monitors.sort_by_key(|monitor: &VirtualScreenRect| (monitor.top, monitor.left));
    }

    *cache.lock().unwrap_or_else(|error| error.into_inner()) =
        Some((Instant::now(), screen, monitors.clone()));
    Some(monitors)
}

#[cfg(not(target_os = "windows"))]
pub fn current_monitor_rects() -> Option<Vec<VirtualScreenRect>> {
    current_virtual_screen_rect().map(|screen| vec![screen])
}

#[inline]
pub fn get_cursor_pos() -> (i32, i32) {
    current_cursor_position().unwrap_or((0, 0))
}

#[inline]
pub fn move_mouse(target_x: i32, target_y: i32) -> bool {
    if let Some(screen_rect) = current_virtual_screen_rect() {
        let end_x = screen_rect.normalize_x(target_x);
        let end_y = screen_rect.normalize_y(target_y);

        let movement = make_movement(end_x, end_y);
        let sent = unsafe { SendInput(1, &movement, std::mem::size_of::<INPUT>() as i32) == 1 };
        if sent {
            log::debug!("moved cursor x:{end_x}, y:{end_y}")
        }
        sent
    } else {
        false
    }
}

#[inline]
pub fn make_movement(end_x: i32, end_y: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            mi: MOUSEINPUT {
                dx: end_x,
                dy: end_y,
                mouseData: 0,
                dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[inline]
pub fn make_input(flags: u32, time: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time,
                dwExtraInfo: AUTOCLICKER_EXTRA_INFO,
            },
        },
    }
}

#[inline]
pub fn send_mouse_event(flags: u32) -> bool {
    let input = make_input(flags, 0);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) == 1 }
}

fn release_mouse_button(up: u32) -> bool {
    for _ in 0..3 {
        if send_mouse_event(up) {
            return true;
        }
    }
    false
}

fn completed_batch_clicks(inserted: usize, cleanup_up_succeeded: bool) -> usize {
    inserted / 2 + usize::from(inserted % 2 != 0 && cleanup_up_succeeded)
}

pub fn send_batch(down: u32, up: u32, n: usize) -> usize {
    const MAX_BATCH_CLICKS: usize = 8;
    const MAX_BATCH_INPUTS: usize = MAX_BATCH_CLICKS * 2;

    let mut sent = 0usize;
    while sent < n {
        let chunk = (n - sent).min(MAX_BATCH_CLICKS);
        let mut inputs: [INPUT; MAX_BATCH_INPUTS] = std::array::from_fn(|_| make_input(0, 0));
        for index in 0..chunk {
            inputs[index * 2] = make_input(down, 0);
            inputs[index * 2 + 1] = make_input(up, 0);
        }

        let inserted = unsafe {
            SendInput(
                (chunk * 2) as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            ) as usize
        };
        let cleanup_up_succeeded = inserted % 2 == 0 || release_mouse_button(up);
        let completed = completed_batch_clicks(inserted, cleanup_up_succeeded);
        sent += completed;

        if inserted != chunk * 2 {
            break;
        }
    }
    sent
}

pub fn send_clicks(
    down: u32,
    up: u32,
    count: usize,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) -> usize {
    if count == 0 || should_abort() {
        return 0;
    }

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        return send_batch(down, up, count);
    }

    let mut sent = 0usize;

    for _ in 0..count {
        if should_abort() {
            break;
        }

        let down_succeeded = Cell::new(false);
        let failed = Cell::new(false);
        let completed_clicks = Cell::new(0usize);
        let is_active = || control.is_active() && !should_abort() && !failed.get();
        let mut sleep_for = |duration| sleep_interruptible(duration, control, should_abort);
        let mut press = || {
            let succeeded = send_mouse_event(down);
            down_succeeded.set(succeeded);
            if !succeeded {
                failed.set(true);
            }
        };
        let mut release = || {
            let succeeded = release_mouse_button(up);
            if down_succeeded.get() && succeeded {
                completed_clicks.set(completed_clicks.get() + 1);
                down_succeeded.set(false);
            }
            if !succeeded {
                failed.set(true);
            }
        };

        let completed =
            execute_click_cycle(plan, &mut press, &mut release, &mut sleep_for, &is_active);
        if down_succeeded.get() && release_mouse_button(up) {
            completed_clicks.set(completed_clicks.get() + 1);
            down_succeeded.set(false);
        }
        sent += completed_clicks.get();
        if !completed || failed.get() || down_succeeded.get() {
            break;
        }
    }

    sent
}

#[inline]
pub fn get_button_flags(button: i32) -> (u32, u32) {
    match button {
        2 => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        3 => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    }
}

#[inline]
pub fn ease_in_out_quad(t: f64) -> f64 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

#[inline]
pub fn cubic_bezier(t: f64, p0: f64, p1: f64, p2: f64, p3: f64) -> f64 {
    let u = 1.0 - t;
    u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
}

fn smooth_move_inner(
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
    rng: &mut crate::engine::rng::SmallRng,
    allow_overshoot: bool,
) {
    if duration_ms < 3 || (start_x == end_x && start_y == end_y) {
        move_mouse(end_x, end_y);
        return;
    }

    let (start_x, start_y) = (start_x as f64, start_y as f64);
    let (target_x, target_y) = (end_x as f64, end_y as f64);
    let delta_x = target_x - start_x;
    let delta_y = target_y - start_y;
    let distance = delta_x.hypot(delta_y);

    if distance < 3.0 {
        move_mouse(end_x, end_y);
        return;
    }

    let steps = if duration_ms <= 12 {
        (duration_ms / 3).clamp(1, 4) as usize
    } else {
        ((duration_ms / 8) as usize).clamp(4, 75)
    };

    let tick_duration = Duration::from_millis(duration_ms) / steps as u32;
    let start_time = Instant::now();

    let cp1_ratio = rng.next_f64() * 0.28 + 0.20;
    let cp2_ratio = rng.next_f64() * 0.24 + 0.55;

    let max_perp_offset = (distance * 0.29).min(76.0);

    let perp_x = -delta_y / distance;
    let perp_y = delta_x / distance;

    let offset_1 = (rng.next_f64() * 0.41 + 0.07)
        * max_perp_offset
        * (if rng.next_f64() >= 0.5 { 1.0 } else { -1.0 });
    let offset_2 = (rng.next_f64() * 0.41 + 0.07)
        * max_perp_offset
        * (if rng.next_f64() >= 0.5 { 1.0 } else { -1.0 });

    let control_1x = start_x + delta_x * cp1_ratio + perp_x * offset_1;
    let control_1y = start_y + delta_y * cp1_ratio + perp_y * offset_1;
    let control_2x = start_x + delta_x * cp2_ratio + perp_x * offset_2;
    let control_2y = start_y + delta_y * cp2_ratio + perp_y * offset_2;

    let mid_wobble = rng.next_f64() < 0.37 && duration_ms > 22;
    let wobble_step = if mid_wobble { steps / 2 } else { 0 };

    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let ease = ease_in_out_quad(t);

        let mut current_x = cubic_bezier(ease, start_x, control_1x, control_2x, target_x);
        let mut current_y = cubic_bezier(ease, start_y, control_1y, control_2y, target_y);

        if mid_wobble && i == wobble_step {
            let wobble = rng.next_f64() * 1.7 + 0.7;
            let sign = if rng.next_f64() >= 0.5 { 1.0 } else { -1.0 };
            current_x += perp_x * wobble * sign;
            current_y += perp_y * wobble * sign;
        }

        move_mouse(current_x as i32, current_y as i32);

        if i < steps {
            let elapsed = start_time.elapsed();
            let expected = tick_duration * (i + 1) as u32;

            if expected > elapsed {
                std::thread::sleep(expected - elapsed);
            }
        }
    }

    if allow_overshoot && duration_ms > 16 && rng.next_f64() < 0.47 {
        let overshoot_amount = rng.next_f64() * 6.3 + 2.2;
        let dir_x = delta_x / distance;
        let dir_y = delta_y / distance;

        let over_x = (target_x + dir_x * overshoot_amount) as i32;
        let over_y = (target_y + dir_y * overshoot_amount) as i32;

        let correction_ms = (duration_ms as f64 * 0.19).max(4.0) as u64;

        smooth_move_inner(end_x, end_y, over_x, over_y, correction_ms, rng, false);
        smooth_move_inner(
            over_x,
            over_y,
            end_x,
            end_y,
            (correction_ms * 2 / 3).max(3),
            rng,
            false,
        );
    }
}

pub fn smooth_move(
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
    rng: &mut crate::engine::rng::SmallRng,
) {
    smooth_move_inner(start_x, start_y, end_x, end_y, duration_ms, rng, true);
}

#[cfg(test)]
mod tests {
    use super::{completed_batch_clicks, VirtualScreenRect};

    #[test]
    fn absolute_coordinates_cover_full_virtual_screen_range() {
        let screen = VirtualScreenRect::new(-1920, -200, 3840, 1280);
        assert_eq!(screen.normalize_x(-1920), 0);
        assert_eq!(screen.normalize_x(1919), 65535);
        assert_eq!(screen.normalize_y(-200), 0);
        assert_eq!(screen.normalize_y(1079), 65535);
    }

    #[test]
    fn absolute_coordinates_clamp_outside_virtual_screen() {
        let screen = VirtualScreenRect::new(0, 0, 1920, 1080);
        assert_eq!(screen.normalize_x(-100), 0);
        assert_eq!(screen.normalize_x(5000), 65535);
        assert_eq!(screen.normalize_y(-100), 0);
        assert_eq!(screen.normalize_y(5000), 65535);
    }

    #[test]
    fn absolute_coordinates_handle_single_pixel_span() {
        assert_eq!(VirtualScreenRect::normalize_axis(10, 10, 1), 0);
    }

    #[test]
    fn partial_mouse_batch_counts_cleanup_completed_click() {
        assert_eq!(completed_batch_clicks(3, true), 2);
        assert_eq!(completed_batch_clicks(3, false), 1);
        assert_eq!(completed_batch_clicks(4, false), 2);
    }

    #[test]
    fn virtual_screen_edges_saturate() {
        let rect = VirtualScreenRect::new(i32::MAX - 5, i32::MAX - 5, 10, 10);
        assert_eq!(rect.right(), i32::MAX);
        assert_eq!(rect.bottom(), i32::MAX);
    }
}
