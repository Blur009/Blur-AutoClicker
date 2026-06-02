use enigo::{Coordinate, Direction, Enigo, Mouse, Settings};

use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};

/// Represents a rectangular region of the virtual screen.
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
        Self { left, top, width, height }
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
}

#[inline]
pub fn get_cursor_pos() -> (i32, i32) {
    current_cursor_position().unwrap_or((0, 0))
}

pub fn current_cursor_position() -> Option<(i32, i32)> {
    // We use the xdo-based approach (via command) since Wayland restricts
    // absolute pointer queries. On X11, enigo::Mouse::location() works,
    // but on Wayland we fall back to a known-working method.
    // For a real production build, this should use libxdo or a Wayland
    // protocol extension.
    let output = std::process::Command::new("xdotool")
        .args(["getmouselocation", "--shell"])
        .output()
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    let mut x = 0i32;
    let mut y = 0i32;
    for line in stdout.lines() {
        if let Some(val) = line.strip_prefix("X=") {
            x = val.trim().parse().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("Y=") {
            y = val.trim().parse().unwrap_or(0);
        }
    }
    Some((x, y))
}

pub fn current_virtual_screen_rect() -> Option<VirtualScreenRect> {
    // On Linux with single monitor, use a default 1920x1080.
    // In production, this should query via XRandR/Wayland.
    let output = std::process::Command::new("xdotool")
        .args(["getdisplaygeometry"])
        .output()
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
    if parts.len() >= 2 {
        let w: i32 = parts[0].parse().unwrap_or(1920);
        let h: i32 = parts[1].parse().unwrap_or(1080);
        Some(VirtualScreenRect::new(0, 0, w, h))
    } else {
        Some(VirtualScreenRect::new(0, 0, 1920, 1080))
    }
}

pub fn current_monitor_rects() -> Option<Vec<VirtualScreenRect>> {
    current_virtual_screen_rect().map(|screen| vec![screen])
}

fn with_enigo<F, R>(f: F) -> R
where
    F: FnOnce(&mut Enigo) -> R,
{
    let mut enigo = match Enigo::new(&Settings::default()) {
        Ok(e) => e,
        Err(_) => {
            log::error!("[mouse] Failed to create Enigo instance");
            // Return a dummy if we absolutely must — but this shouldn't fail.
            // We create one here per call to avoid holding state across threads.
            return f(&mut Enigo::new(&Settings::default()).unwrap());
        }
    };
    f(&mut enigo)
}

#[inline]
pub fn move_mouse(target_x: i32, target_y: i32) {
    with_enigo(|enigo| {
        let _ = enigo.move_mouse(target_x, target_y, Coordinate::Abs);
    });
}

fn press_button(button: i32) {
    let btn = match button {
        2 => enigo::Button::Right,
        3 => enigo::Button::Middle,
        _ => enigo::Button::Left,
    };
    with_enigo(|enigo| {
        let _ = enigo.button(btn, Direction::Click);
    });
}

fn press_button_down(button: i32) {
    let btn = match button {
        2 => enigo::Button::Right,
        3 => enigo::Button::Middle,
        _ => enigo::Button::Left,
    };
    with_enigo(|enigo| {
        let _ = enigo.button(btn, Direction::Press);
    });
}

fn press_button_up(button: i32) {
    let btn = match button {
        2 => enigo::Button::Right,
        3 => enigo::Button::Middle,
        _ => enigo::Button::Left,
    };
    with_enigo(|enigo| {
        let _ = enigo.button(btn, Direction::Release);
    });
}

#[inline]
pub fn get_button_flags(button: i32) -> (i32, i32) {
    // We still use the same interface: down_flag, up_flag
    // but on Linux we route through enigo's button system.
    (button, button)
}

pub fn send_mouse_event(button: i32) {
    press_button(button);
}

pub fn send_batch(button: i32, n: usize) {
    for _ in 0..n {
        press_button(button);
    }
}

pub fn send_clicks(
    button: i32,
    count: usize,
    plan: ClickCyclePlan,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        send_batch(button, count);
        return;
    }

    let is_active = || control.is_active();
    let mut sleep_for = |duration| sleep_interruptible(duration, control);

    for _ in 0..count {
        if !execute_click_cycle(
            plan,
            &mut || press_button_down(button),
            &mut || press_button_up(button),
            &mut sleep_for,
            &is_active,
        ) {
            return;
        }
    }
}

// Smooth mouse movement (bezier-based, same as Windows version but using Enigo)
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

    let tick_duration = std::time::Duration::from_millis(duration_ms) / steps as u32;
    let start_time = std::time::Instant::now();

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