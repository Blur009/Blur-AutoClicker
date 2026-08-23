use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};
use core_graphics::display::CGDisplay;
use core_graphics::event::{CGEvent, CGEventTapLocation, CGEventType, CGMouseButton, EventField};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGPoint;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::macos::input::{event_is_ours, post_mouse_event};

const LEFT_DOWN: u32 = 1;
const LEFT_UP: u32 = 2;
const RIGHT_DOWN: u32 = 3;
const RIGHT_UP: u32 = 4;
const MIDDLE_DOWN: u32 = 5;
const MIDDLE_UP: u32 = 6;

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
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let event = CGEvent::new(source).ok()?;
    let point = event.location();
    Some((point.x.round() as i32, point.y.round() as i32))
}

pub fn current_monitor_rects() -> Option<Vec<VirtualScreenRect>> {
    let ids = CGDisplay::active_displays().ok()?;
    let mut monitors: Vec<_> = ids
        .into_iter()
        .filter_map(|id| {
            let bounds = CGDisplay::new(id).bounds();
            let width = bounds.size.width.round() as i32;
            let height = bounds.size.height.round() as i32;
            (width > 0 && height > 0).then(|| {
                VirtualScreenRect::new(
                    bounds.origin.x.round() as i32,
                    bounds.origin.y.round() as i32,
                    width,
                    height,
                )
            })
        })
        .collect();
    monitors.sort_by_key(|monitor| (monitor.top, monitor.left));
    monitors.dedup();
    (!monitors.is_empty()).then_some(monitors)
}

pub fn current_virtual_screen_rect() -> Option<VirtualScreenRect> {
    let monitors = current_monitor_rects()?;
    let left = monitors.iter().map(|m| m.left).min()?;
    let top = monitors.iter().map(|m| m.top).min()?;
    let right = monitors.iter().map(|m| m.right()).max()?;
    let bottom = monitors.iter().map(|m| m.bottom()).max()?;
    Some(VirtualScreenRect::new(
        left,
        top,
        right - left,
        bottom - top,
    ))
}

#[inline]
pub fn get_cursor_pos() -> (i32, i32) {
    current_cursor_position().unwrap_or((0, 0))
}

#[inline]
pub fn move_mouse(target_x: i32, target_y: i32) {
    post_mouse_event(
        CGEventType::MouseMoved,
        CGMouseButton::Left,
        CGPoint::new(target_x as f64, target_y as f64),
    );
}

#[derive(Clone, Copy)]
struct ClickState {
    at: Option<Instant>,
    x: i32,
    y: i32,
    count: i64,
}

static CLICK_STATE: Mutex<[ClickState; 3]> = Mutex::new([
    ClickState {
        at: None,
        x: 0,
        y: 0,
        count: 0,
    },
    ClickState {
        at: None,
        x: 0,
        y: 0,
        count: 0,
    },
    ClickState {
        at: None,
        x: 0,
        y: 0,
        count: 0,
    },
]);

fn event_parts(flag: u32) -> Option<(CGEventType, CGMouseButton, usize, bool)> {
    match flag {
        LEFT_DOWN => Some((CGEventType::LeftMouseDown, CGMouseButton::Left, 0, true)),
        LEFT_UP => Some((CGEventType::LeftMouseUp, CGMouseButton::Left, 0, false)),
        RIGHT_DOWN => Some((CGEventType::RightMouseDown, CGMouseButton::Right, 1, true)),
        RIGHT_UP => Some((CGEventType::RightMouseUp, CGMouseButton::Right, 1, false)),
        MIDDLE_DOWN => Some((CGEventType::OtherMouseDown, CGMouseButton::Center, 2, true)),
        MIDDLE_UP => Some((CGEventType::OtherMouseUp, CGMouseButton::Center, 2, false)),
        _ => None,
    }
}

#[inline]
pub fn send_mouse_event(flag: u32) {
    let Some((event_type, button, index, is_down)) = event_parts(flag) else {
        return;
    };
    let (x, y) = get_cursor_pos();
    let source = match CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        Ok(source) => source,
        Err(_) => return,
    };
    let event = match CGEvent::new_mouse_event(
        source,
        event_type,
        CGPoint::new(x as f64, y as f64),
        button,
    ) {
        Ok(event) => event,
        Err(_) => return,
    };
    event.set_integer_value_field(
        EventField::EVENT_SOURCE_USER_DATA,
        crate::engine::AUTOCLICKER_EXTRA_INFO as i64,
    );

    let mut states = CLICK_STATE.lock().unwrap_or_else(|e| e.into_inner());
    let state = &mut states[index];
    if is_down {
        let is_continuation = state
            .at
            .is_some_and(|at| at.elapsed() <= Duration::from_millis(500))
            && (state.x - x).abs() <= 4
            && (state.y - y).abs() <= 4;
        state.count = if is_continuation {
            (state.count + 1).min(3)
        } else {
            1
        };
        state.at = Some(Instant::now());
        state.x = x;
        state.y = y;
    }
    event.set_integer_value_field(EventField::MOUSE_EVENT_CLICK_STATE, state.count.max(1));
    drop(states);

    debug_assert!(event_is_ours(&event));
    event.post(CGEventTapLocation::HID);
}

pub fn send_batch(down: u32, up: u32, n: usize) {
    for _ in 0..n {
        send_mouse_event(down);
        send_mouse_event(up);
    }
}

pub fn send_clicks(
    down: u32,
    up: u32,
    count: usize,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) {
    if count == 0 || should_abort() {
        return;
    }

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        send_batch(down, up, count);
        return;
    }

    let is_active = || control.is_active() && !should_abort();
    let mut sleep_for = |duration| sleep_interruptible(duration, control, should_abort);
    for _ in 0..count {
        if should_abort()
            || !execute_click_cycle(
                plan,
                &mut || send_mouse_event(down),
                &mut || send_mouse_event(up),
                &mut sleep_for,
                &is_active,
            )
        {
            return;
        }
    }
}

#[inline]
pub fn get_button_flags(button: i32) -> (u32, u32) {
    match button {
        2 => (RIGHT_DOWN, RIGHT_UP),
        3 => (MIDDLE_DOWN, MIDDLE_UP),
        _ => (LEFT_DOWN, LEFT_UP),
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
        let ease = ease_in_out_quad(i as f64 / steps as f64);
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
        let over_x = (target_x + delta_x / distance * overshoot_amount) as i32;
        let over_y = (target_y + delta_y / distance * overshoot_amount) as i32;
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
