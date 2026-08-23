use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult, EventField, KeyCode,
};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::mouse::{current_virtual_screen_rect, VirtualScreenRect};
use crate::error::{poisoned_inner, AppError, AppResult};
use crate::ClickerState;

const CURSOR_EMIT_INTERVAL: Duration = Duration::from_millis(16);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPointPickedPayload {
    x: i32,
    y: i32,
    continue_picking: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPointDeleteRequestedPayload {
    x: i32,
    y: i32,
}

#[derive(Default)]
struct PickerRuntime {
    active: bool,
    app: Option<AppHandle>,
    last_cursor_emit: Option<Instant>,
    stop_after_right_up: bool,
}

static PICKER: OnceLock<Mutex<PickerRuntime>> = OnceLock::new();
fn picker() -> &'static Mutex<PickerRuntime> {
    PICKER.get_or_init(|| Mutex::new(PickerRuntime::default()))
}

pub fn start_click_point_pick_inner(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(&app);
    {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if runtime.active {
            return crate::overlay::show_click_point_pick_overlay(&app);
        }
        runtime.active = true;
        runtime.app = Some(app.clone());
        runtime.last_cursor_emit = None;
        runtime.stop_after_right_up = false;
    }
    app.state::<ClickerState>()
        .click_point_pick_active
        .store(true, std::sync::atomic::Ordering::SeqCst);
    crate::overlay::show_click_point_pick_overlay(&app)?;
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
                if matches!(
                    event_type,
                    CGEventType::MouseMoved | CGEventType::RightMouseDragged
                ) {
                    let point = event.location();
                    emit_cursor_position(point.x.round() as i32, point.y.round() as i32);
                    return CallbackResult::Keep;
                }
                if event_type as u32 == CGEventType::KeyDown as u32
                    && event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16
                        == KeyCode::ESCAPE
                {
                    cancel_click_point_pick_from_hook();
                    return CallbackResult::Drop;
                }
                if event_type as u32 == CGEventType::RightMouseDown as u32 {
                    let point = event.location();
                    let flags = event.get_flags();
                    if flags.contains(CGEventFlags::CGEventFlagControl) {
                        emit_delete_request(point.x.round() as i32, point.y.round() as i32);
                    } else {
                        let keep_picking = flags.contains(CGEventFlags::CGEventFlagShift);
                        emit_pick(point.x.round() as i32, point.y.round() as i32, keep_picking);
                        if !keep_picking {
                            picker()
                                .lock()
                                .unwrap_or_else(poisoned_inner)
                                .stop_after_right_up = true;
                        }
                    }
                    return CallbackResult::Drop;
                }
                if event_type as u32 == CGEventType::RightMouseUp as u32 {
                    let stop = {
                        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
                        let stop = runtime.stop_after_right_up;
                        runtime.stop_after_right_up = false;
                        stop
                    };
                    if stop {
                        stop_click_point_pick(None, true);
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
            cancel_click_point_pick_inner(&app);
            Err(AppError::State(String::from(
                "macOS Accessibility permission is required to pick click points",
            )))
        }
    }
}

pub fn cancel_click_point_pick_inner(app: &AppHandle) {
    stop_click_point_pick(Some(app.clone()), true);
    let _ = crate::overlay::hide_overlay(app.clone());
}

fn cancel_click_point_pick_from_hook() {
    if let Some(app) = stop_click_point_pick(None, true) {
        let _ = crate::overlay::hide_overlay(app);
    }
}

fn stop_click_point_pick(
    app_override: Option<AppHandle>,
    notify_overlay: bool,
) -> Option<AppHandle> {
    let app = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        let app = app_override.or_else(|| runtime.app.clone());
        runtime.active = false;
        runtime.app = None;
        runtime.last_cursor_emit = None;
        runtime.stop_after_right_up = false;
        app
    };
    if let Some(app) = &app {
        app.state::<ClickerState>()
            .click_point_pick_active
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("click-pick-ended", ());
        if notify_overlay {
            let _ = crate::overlay::set_click_point_pick_mode(app, false);
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
            .last_cursor_emit
            .is_some_and(|last| now.duration_since(last) < CURSOR_EMIT_INTERVAL)
        {
            return;
        }
        runtime.last_cursor_emit = Some(now);
        runtime.app.clone()
    };
    if let Some(app) = app {
        let (x, y) = current_virtual_screen_rect()
            .map(|bounds| {
                let point = VirtualScreenRect::new(x, y, 1, 1).offset_from(bounds);
                (point.left, point.top)
            })
            .unwrap_or((x, y));
        let _ = app.emit("click-pick-cursor", serde_json::json!({"x": x, "y": y}));
    }
}

fn emit_pick(x: i32, y: i32, continue_picking: bool) {
    let app = picker().lock().unwrap_or_else(poisoned_inner).app.clone();
    if let Some(app) = app {
        let _ = app.emit(
            "click-point-picked",
            ClickPointPickedPayload {
                x,
                y,
                continue_picking,
            },
        );
    }
}

fn emit_delete_request(x: i32, y: i32) {
    let app = picker().lock().unwrap_or_else(poisoned_inner).app.clone();
    if let Some(app) = app {
        let _ = app.emit(
            "click-point-delete-requested",
            ClickPointDeleteRequestedPayload { x, y },
        );
    }
}
