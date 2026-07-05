use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_SHIFT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK,
    KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_MOUSEMOVE,
    WM_QUIT, WM_RBUTTONDBLCLK, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN,
};

use crate::engine::mouse::{current_virtual_screen_rect, VirtualScreenRect};
use crate::error::poisoned_inner;
use crate::error::AppError;
use crate::error::AppResult;
use crate::ClickerState;

const CURSOR_EMIT_INTERVAL: Duration = Duration::from_millis(16);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SequencePointPickedPayload {
    x: i32,
    y: i32,
    continue_picking: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SequencePointDeleteRequestedPayload {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MouseHookDecision {
    Pass,
    Swallow,
    Pick { continue_picking: bool },
    Delete,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum KeyboardHookDecision {
    Pass,
    Cancel,
}

#[derive(Default)]
struct PickerRuntime {
    active: bool,
    mouse_hook: HHOOK,
    keyboard_hook: HHOOK,
    thread_id: u32,
    app: Option<AppHandle>,
    last_cursor_emit: Option<Instant>,
    stop_after_right_up: bool,
}

unsafe impl Send for PickerRuntime {}
unsafe impl Sync for PickerRuntime {}

static PICKER: OnceLock<Mutex<PickerRuntime>> = OnceLock::new();

fn picker() -> &'static Mutex<PickerRuntime> {
    PICKER.get_or_init(|| Mutex::new(PickerRuntime::default()))
}

fn classify_mouse_message(message: u32, shift_down: bool, ctrl_down: bool) -> MouseHookDecision {
    match message {
        WM_RBUTTONDOWN if ctrl_down => MouseHookDecision::Delete,
        WM_RBUTTONDOWN => MouseHookDecision::Pick {
            continue_picking: shift_down,
        },
        WM_RBUTTONUP | WM_RBUTTONDBLCLK => MouseHookDecision::Swallow,
        _ => MouseHookDecision::Pass,
    }
}

fn classify_keyboard_message(message: u32, virtual_key: u32) -> KeyboardHookDecision {
    match (message, virtual_key) {
        (WM_KEYDOWN | WM_SYSKEYDOWN, key) if key == VK_ESCAPE as u32 => {
            KeyboardHookDecision::Cancel
        }
        _ => KeyboardHookDecision::Pass,
    }
}

pub fn start_sequence_point_pick_inner(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(&app);

    {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if runtime.active {
            crate::overlay::show_sequence_pick_overlay(&app)?;
            return Ok(());
        }

        runtime.active = true;
        runtime.app = Some(app.clone());
        runtime.last_cursor_emit = None;
        runtime.stop_after_right_up = false;
    }

    app.state::<ClickerState>()
        .sequence_pick_active
        .store(true, std::sync::atomic::Ordering::SeqCst);

    crate::overlay::show_sequence_pick_overlay(&app)?;

    let (ready_tx, ready_rx) = mpsc::channel();
    std::thread::spawn(move || unsafe {
        let thread_id = GetCurrentThreadId();
        let mouse_hook =
            SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), std::ptr::null_mut(), 0);
        if mouse_hook.is_null() {
            let err = GetLastError();
            let _ = ready_tx.send(Err(AppError::WindowsSystem(err)));
            return;
        }

        let keyboard_hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            std::ptr::null_mut(),
            0,
        );
        if keyboard_hook.is_null() {
            let err = GetLastError();
            UnhookWindowsHookEx(mouse_hook);
            let _ = ready_tx.send(Err(AppError::WindowsSystem(err)));
            return;
        }

        {
            let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
            runtime.mouse_hook = mouse_hook;
            runtime.keyboard_hook = keyboard_hook;
            runtime.thread_id = thread_id;
        }
        let _ = ready_tx.send(Ok(()));

        let mut msg = std::mem::zeroed::<MSG>();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}

        UnhookWindowsHookEx(mouse_hook);
        UnhookWindowsHookEx(keyboard_hook);
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if runtime.mouse_hook == mouse_hook {
            runtime.mouse_hook = std::ptr::null_mut();
        }
        if runtime.keyboard_hook == keyboard_hook {
            runtime.keyboard_hook = std::ptr::null_mut();
        }
        if runtime.mouse_hook.is_null() && runtime.keyboard_hook.is_null() {
            runtime.thread_id = 0;
        }
    });

    match ready_rx.recv_timeout(Duration::from_secs(1)) {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => {
            cancel_sequence_point_pick_inner(&app);
            Err(error)
        }
        Err(_) => {
            cancel_sequence_point_pick_inner(&app);
            Err(AppError::ChannelFailure)
        }
    }
}

fn cancel_sequence_point_pick_from_hook() {
    let app = stop_sequence_point_pick(None, true);
    if let Some(app) = app {
        let _ = crate::overlay::hide_overlay(app);
    }
}

pub fn cancel_sequence_point_pick_inner(app: &AppHandle) {
    stop_sequence_point_pick(Some(app.clone()), true);
    let _ = crate::overlay::hide_overlay(app.clone());
}

fn stop_sequence_point_pick(
    app_override: Option<AppHandle>,
    notify_overlay: bool,
) -> Option<AppHandle> {
    let (app, thread_id) = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        let app = app_override.or_else(|| runtime.app.clone());
        let thread_id = runtime.thread_id;
        runtime.active = false;
        runtime.app = None;
        runtime.last_cursor_emit = None;
        runtime.stop_after_right_up = false;
        (app, thread_id)
    };

    if let Some(app) = &app {
        app.state::<ClickerState>()
            .sequence_pick_active
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("sequence-pick-ended", ());
        if notify_overlay {
            let _ = crate::overlay::set_sequence_pick_mode(app, false);
        }
    }

    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }

    app
}
unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let message = wparam as u32;
    let mouse = &*(lparam as *const MSLLHOOKSTRUCT);

    if message == WM_MOUSEMOVE {
        emit_cursor_position(mouse.pt.x, mouse.pt.y);
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let shift_down = (GetAsyncKeyState(VK_SHIFT as i32) & 0x8000u16 as i16) != 0;
    let ctrl_down = (GetAsyncKeyState(VK_CONTROL as i32) & 0x8000u16 as i16) != 0;

    match classify_mouse_message(message, shift_down, ctrl_down) {
        MouseHookDecision::Pass => CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam),
        MouseHookDecision::Swallow => {
            if message == WM_RBUTTONUP {
                let should_stop = {
                    let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
                    let should_stop = runtime.stop_after_right_up;
                    runtime.stop_after_right_up = false;
                    should_stop
                };
                if should_stop {
                    stop_sequence_point_pick(None, true);
                }
            }
            1
        }
        MouseHookDecision::Delete => {
            emit_delete_request(mouse.pt.x, mouse.pt.y);
            1
        }
        MouseHookDecision::Pick { continue_picking } => {
            emit_pick(mouse.pt.x, mouse.pt.y, continue_picking);
            if !continue_picking {
                let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
                runtime.stop_after_right_up = true;
            }
            1
        }
    }
}
unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let message = wparam as u32;
    let keyboard = &*(lparam as *const KBDLLHOOKSTRUCT);

    match classify_keyboard_message(message, keyboard.vkCode) {
        KeyboardHookDecision::Pass => CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam),
        KeyboardHookDecision::Cancel => {
            cancel_sequence_point_pick_from_hook();
            1
        }
    }
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
        let (overlay_x, overlay_y) = current_virtual_screen_rect()
            .map(|bounds| {
                let offset = VirtualScreenRect::new(x, y, 1, 1).offset_from(bounds);
                (offset.left, offset.top)
            })
            .unwrap_or((x, y));

        let _ = app.emit(
            "sequence-pick-cursor",
            serde_json::json!({
                "x": overlay_x,
                "y": overlay_y,
            }),
        );
    }
}

fn emit_pick(x: i32, y: i32, continue_picking: bool) {
    let app = {
        let runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if !runtime.active {
            return;
        }
        runtime.app.clone()
    };

    if let Some(app) = app {
        let _ = app.emit(
            "sequence-point-picked",
            SequencePointPickedPayload {
                x,
                y,
                continue_picking,
            },
        );
    }
}

fn emit_delete_request(x: i32, y: i32) {
    let app = {
        let runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if !runtime.active {
            return;
        }
        runtime.app.clone()
    };

    if let Some(app) = app {
        let _ = app.emit(
            "sequence-point-delete-requested",
            SequencePointDeleteRequestedPayload { x, y },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        classify_keyboard_message, classify_mouse_message, KeyboardHookDecision, MouseHookDecision,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{VK_ESCAPE, VK_SPACE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN,
    };

    #[test]
    fn right_button_down_picks_and_exits_without_shift() {
        assert_eq!(
            classify_mouse_message(WM_RBUTTONDOWN, false, false),
            MouseHookDecision::Pick {
                continue_picking: false
            }
        );
    }

    #[test]
    fn shift_right_button_down_keeps_pick_mode_active() {
        assert_eq!(
            classify_mouse_message(WM_RBUTTONDOWN, true, false),
            MouseHookDecision::Pick {
                continue_picking: true
            }
        );
    }

    #[test]
    fn right_button_up_is_swallowed() {
        assert_eq!(
            classify_mouse_message(WM_RBUTTONUP, false, false),
            MouseHookDecision::Swallow
        );
    }

    #[test]
    fn non_right_clicks_pass_through() {
        assert_eq!(
            classify_mouse_message(WM_LBUTTONDOWN, false, false),
            MouseHookDecision::Pass
        );
    }

    #[test]
    fn ctrl_right_button_down_deletes_point() {
        assert_eq!(
            classify_mouse_message(WM_RBUTTONDOWN, false, true),
            MouseHookDecision::Delete
        );
    }

    #[test]
    fn ctrl_wins_over_shift_for_right_button_down() {
        assert_eq!(
            classify_mouse_message(WM_RBUTTONDOWN, true, true),
            MouseHookDecision::Delete
        );
    }

    #[test]
    fn escape_key_down_cancels_picker() {
        assert_eq!(
            classify_keyboard_message(WM_KEYDOWN, VK_ESCAPE as u32),
            KeyboardHookDecision::Cancel
        );
    }

    #[test]
    fn escape_sys_key_down_cancels_picker() {
        assert_eq!(
            classify_keyboard_message(WM_SYSKEYDOWN, VK_ESCAPE as u32),
            KeyboardHookDecision::Cancel
        );
    }

    #[test]
    fn escape_key_up_passes_through() {
        assert_eq!(
            classify_keyboard_message(WM_KEYUP, VK_ESCAPE as u32),
            KeyboardHookDecision::Pass
        );
    }

    #[test]
    fn other_keys_pass_through() {
        assert_eq!(
            classify_keyboard_message(WM_KEYDOWN, VK_SPACE as u32),
            KeyboardHookDecision::Pass
        );
    }
}
