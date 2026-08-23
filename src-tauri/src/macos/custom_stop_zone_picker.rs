use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult, EventField, KeyCode,
};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::mouse::{current_virtual_screen_rect, VirtualScreenRect};
use crate::error::{poisoned_inner, AppError, AppResult};
use crate::ClickerState;

const PREVIEW_EMIT_INTERVAL: Duration = Duration::from_millis(16);

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopZoneRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Default)]
struct PickerRuntime {
    active: bool,
    drawing_start: Option<(i32, i32)>,
    app: Option<AppHandle>,
    last_preview_emit: Option<Instant>,
}

static PICKER: OnceLock<Mutex<PickerRuntime>> = OnceLock::new();
fn picker() -> &'static Mutex<PickerRuntime> {
    PICKER.get_or_init(|| Mutex::new(PickerRuntime::default()))
}

fn normalize_rect(start: (i32, i32), end: (i32, i32)) -> StopZoneRect {
    let left = start.0.min(end.0);
    let top = start.1.min(end.1);
    StopZoneRect {
        x: left,
        y: top,
        width: start.0.max(end.0) - left + 1,
        height: start.1.max(end.1) - top + 1,
    }
}

pub fn start_custom_stop_zone_pick_inner(app: AppHandle) -> AppResult<()> {
    crate::click_point_picker::cancel_click_point_pick_inner(&app);
    {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if runtime.active {
            return crate::overlay::show_custom_stop_zone_pick_overlay(&app);
        }
        runtime.active = true;
        runtime.drawing_start = None;
        runtime.app = Some(app.clone());
        runtime.last_preview_emit = None;
    }
    app.state::<ClickerState>()
        .custom_stop_zone_pick_active
        .store(true, std::sync::atomic::Ordering::SeqCst);
    crate::overlay::show_custom_stop_zone_pick_overlay(&app)?;
    crate::macos::request_accessibility_permission();

    let (ready_tx, ready_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            vec![
                CGEventType::MouseMoved,
                CGEventType::RightMouseDragged,
                CGEventType::RightMouseDown,
                CGEventType::RightMouseUp,
                CGEventType::KeyDown,
            ],
            |_proxy, event_type, event| {
                if event_type as u32 == CGEventType::KeyDown as u32
                    && event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16
                        == KeyCode::ESCAPE
                {
                    cancel_custom_stop_zone_pick_from_hook();
                    return CallbackResult::Drop;
                }
                let point = event.location();
                let point = (point.x.round() as i32, point.y.round() as i32);
                if matches!(
                    event_type,
                    CGEventType::MouseMoved | CGEventType::RightMouseDragged
                ) {
                    let start = picker().lock().unwrap_or_else(poisoned_inner).drawing_start;
                    if let Some(start) = start {
                        emit_preview(start, point, false);
                    } else {
                        emit_cursor_position(point.0, point.1);
                    }
                    return CallbackResult::Keep;
                }
                if event_type as u32 == CGEventType::RightMouseDown as u32 {
                    {
                        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
                        runtime.drawing_start = Some(point);
                        runtime.last_preview_emit = None;
                    }
                    emit_preview(point, point, true);
                    return CallbackResult::Drop;
                }
                if event_type as u32 == CGEventType::RightMouseUp as u32 {
                    let start = picker().lock().unwrap_or_else(poisoned_inner).drawing_start;
                    if let Some(start) = start {
                        finish_custom_stop_zone_pick(normalize_rect(start, point));
                    }
                    return CallbackResult::Drop;
                }
                CallbackResult::Keep
            },
        );
        let Ok(tap) = tap else {
            let _ = ready_tx.send(false);
            return;
        };
        let Ok(source) = tap.mach_port().create_runloop_source(0) else {
            let _ = ready_tx.send(false);
            return;
        };
        CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopDefaultMode });
        tap.enable();
        let _ = ready_tx.send(true);
        while picker().lock().unwrap_or_else(poisoned_inner).active {
            CFRunLoop::run_in_mode(
                unsafe { kCFRunLoopDefaultMode },
                Duration::from_millis(16),
                false,
            );
            tap.enable();
        }
    });

    match ready_rx.recv_timeout(Duration::from_secs(1)) {
        Ok(true) => Ok(()),
        _ => {
            cancel_custom_stop_zone_pick_inner(&app);
            Err(AppError::State(String::from(
                "macOS Accessibility permission is required to pick stop zones",
            )))
        }
    }
}

pub fn cancel_custom_stop_zone_pick_inner(app: &AppHandle) {
    stop_custom_stop_zone_pick(Some(app.clone()), true);
    let _ = crate::overlay::hide_custom_stop_zone_pick_overlay(app);
}

fn cancel_custom_stop_zone_pick_from_hook() {
    if let Some(app) = stop_custom_stop_zone_pick(None, true) {
        let _ = crate::overlay::hide_custom_stop_zone_pick_overlay(&app);
    }
}

fn finish_custom_stop_zone_pick(rect: StopZoneRect) {
    let app = picker().lock().unwrap_or_else(poisoned_inner).app.clone();
    if let Some(app) = &app {
        let _ = app.emit("custom-stop-zone-picked", rect);
    }
    stop_custom_stop_zone_pick(None, true);
}

fn stop_custom_stop_zone_pick(
    app_override: Option<AppHandle>,
    notify_overlay: bool,
) -> Option<AppHandle> {
    let app = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        let app = app_override.or_else(|| runtime.app.clone());
        runtime.active = false;
        runtime.drawing_start = None;
        runtime.app = None;
        runtime.last_preview_emit = None;
        app
    };
    if let Some(app) = &app {
        app.state::<ClickerState>()
            .custom_stop_zone_pick_active
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("custom-stop-zone-pick-ended", ());
        if notify_overlay {
            let _ = crate::overlay::set_custom_stop_zone_pick_mode(app, false);
        }
    }
    app
}

fn emit_cursor_position(x: i32, y: i32) {
    let app = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if !runtime.active {
            return;
        }
        let now = Instant::now();
        if runtime
            .last_preview_emit
            .is_some_and(|last| now.duration_since(last) < PREVIEW_EMIT_INTERVAL)
        {
            return;
        }
        runtime.last_preview_emit = Some(now);
        runtime.app.clone()
    };
    if let (Some(app), Some(bounds)) = (app, current_virtual_screen_rect()) {
        let cursor = VirtualScreenRect::new(x, y, 1, 1).offset_from(bounds);
        let _ = app.emit(
            "custom-stop-zone-preview",
            serde_json::json!({"cursorX": cursor.left, "cursorY": cursor.top}),
        );
    }
}

fn emit_preview(start: (i32, i32), end: (i32, i32), force: bool) {
    let app = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if !runtime.active {
            return;
        }
        let now = Instant::now();
        if !force
            && runtime
                .last_preview_emit
                .is_some_and(|last| now.duration_since(last) < PREVIEW_EMIT_INTERVAL)
        {
            return;
        }
        runtime.last_preview_emit = Some(now);
        runtime.app.clone()
    };
    if let (Some(app), Some(bounds)) = (app, current_virtual_screen_rect()) {
        let rect = normalize_rect(start, end);
        let offset =
            VirtualScreenRect::new(rect.x, rect.y, rect.width, rect.height).offset_from(bounds);
        let cursor = VirtualScreenRect::new(end.0, end.1, 1, 1).offset_from(bounds);
        let _ = app.emit(
            "custom-stop-zone-preview",
            serde_json::json!({
                "x": offset.left, "y": offset.top, "width": offset.width, "height": offset.height,
                "cursorX": cursor.left, "cursorY": cursor.top,
            }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rectangle_is_normalized() {
        assert_eq!(
            normalize_rect((10, 20), (5, 8)),
            StopZoneRect {
                x: 5,
                y: 8,
                width: 6,
                height: 13
            }
        );
    }
}
