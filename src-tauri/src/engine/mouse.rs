use std::time::Duration;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SetCursorPos, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN,
};

use super::rng::SmallRng;
use super::worker::{sleep_interruptible, RunControl};

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
        self.left + self.width
    }

    #[inline]
    pub fn bottom(self) -> i32 {
        self.top + self.height
    }

    #[inline]
    pub fn contains(self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right() && y >= self.top && y < self.bottom()
    }

    #[inline]
    pub fn offset_from(self, origin: VirtualScreenRect) -> Self {
        Self::new(
            self.left - origin.left,
            self.top - origin.top,
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
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO};

    unsafe extern "system" fn enum_monitor_proc(
        monitor: isize,
        _hdc: isize,
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
            0,
            ptr::null(),
            Some(enum_monitor_proc),
            &mut monitors as *mut Vec<VirtualScreenRect> as isize,
        )
    };

    if ok == 0 || monitors.is_empty() {
        return current_virtual_screen_rect().map(|screen| vec![screen]);
    }

    monitors.sort_by_key(|monitor: &VirtualScreenRect| (monitor.top, monitor.left));
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
pub fn move_mouse(x: i32, y: i32) {
    unsafe { SetCursorPos(x, y) };
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
                dwExtraInfo: 0,
            },
        },
    }
}

#[inline]
pub fn send_mouse_event(flags: u32) {
    let input = make_input(flags, 0);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
}

pub fn send_batch(down: u32, up: u32, n: usize, _hold_ms: u32) {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(n * 2);
    for _ in 0..n {
        inputs.push(make_input(down, 0));
        inputs.push(make_input(up, 0));
    }
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
}

pub fn send_clicks(
    down: u32,
    up: u32,
    count: usize,
    hold_ms: u32,
    use_double_click_gap: bool,
    double_click_delay_ms: u32,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    if !use_double_click_gap && count > 1 && hold_ms == 0 {
        send_batch(down, up, count, hold_ms);
        return;
    }

    for index in 0..count {
        if !control.is_active() {
            return;
        }

        send_mouse_event(down);
        if hold_ms > 0 {
            sleep_interruptible(Duration::from_millis(hold_ms as u64), control);
            if !control.is_active() {
                return;
            }
        }
        send_mouse_event(up);

        if index + 1 < count && use_double_click_gap && double_click_delay_ms > 0 {
            sleep_interruptible(Duration::from_millis(double_click_delay_ms as u64), control);
        }
    }
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

pub fn smooth_move(
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
