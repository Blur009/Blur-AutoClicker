use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_SHIFT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
    UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, WH_KEYBOARD_LL,
    WH_MOUSE_LL, WM_KEYDOWN, WM_MOUSEMOVE, WM_QUIT, WM_RBUTTONDBLCLK, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_SYSKEYDOWN,
};

use crate::engine::mouse::{current_virtual_screen_rect, VirtualScreenRect};
use crate::error::poisoned_inner;
use crate::error::AppError;
use crate::error::AppResult;
use crate::ClickerState;

const CURSOR_EMIT_INTERVAL: Duration = Duration::from_millis(16);
const HOOK_THREAD_EXIT_TIMEOUT: Duration = Duration::from_millis(250);

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
    starting: bool,
    generation: u64,
    hook_generation: u64,
    mouse_hook: HHOOK,
    keyboard_hook: HHOOK,
    thread_id: u32,
    hook_thread_exit: Option<mpsc::Receiver<()>>,
    app: Option<AppHandle>,
    last_cursor_emit: Option<Instant>,
    stop_after_right_up: bool,
}

struct CancelRequest {
    app: Option<AppHandle>,
    thread_id: u32,
    generation: u64,
    hook_thread_exit: Option<mpsc::Receiver<()>>,
}

impl PickerRuntime {
    fn claim_start(&mut self) -> Option<u64> {
        if self.starting || self.active {
            return None;
        }
        self.starting = true;
        self.active = true;
        self.last_cursor_emit = None;
        self.stop_after_right_up = false;
        self.generation = self.generation.wrapping_add(1);
        Some(self.generation)
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation == generation
    }

    fn begin_cancel(&mut self, app_override: Option<AppHandle>) -> CancelRequest {
        let app = app_override.or_else(|| self.app.clone());
        self.active = false;
        self.starting = false;
        self.app = None;
        self.last_cursor_emit = None;
        self.stop_after_right_up = false;
        self.generation = self.generation.wrapping_add(1);
        CancelRequest {
            app,
            thread_id: self.thread_id,
            generation: self.generation,
            hook_thread_exit: self.hook_thread_exit.take(),
        }
    }

    fn has_live_hook_thread(&self) -> bool {
        self.thread_id != 0 || !self.mouse_hook.is_null() || !self.keyboard_hook.is_null()
    }
}

unsafe impl Send for PickerRuntime {}
unsafe impl Sync for PickerRuntime {}

static PICKER: OnceLock<Mutex<PickerRuntime>> = OnceLock::new();

fn picker() -> &'static Mutex<PickerRuntime> {
    PICKER.get_or_init(|| Mutex::new(PickerRuntime::default()))
}

struct PickStartGuard {
    armed: bool,
}

impl PickStartGuard {
    fn arm() -> Self {
        Self { armed: true }
    }

    fn disarm(mut self) {
        self.armed = false;
    }
}

impl Drop for PickStartGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        if let Some(app) = stop_click_point_pick(None, true) {
            let _ = crate::overlay::hide_overlay(app);
        }
    }
}

struct HookThreadExitGuard(mpsc::Sender<()>);

impl Drop for HookThreadExitGuard {
    fn drop(&mut self) {
        let _ = self.0.send(());
    }
}

fn create_thread_message_queue() {
    unsafe {
        let mut msg = std::mem::zeroed::<MSG>();
        PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
    }
}

fn clear_hook_thread(thread_id: u32) {
    let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
    if runtime.thread_id == thread_id {
        runtime.thread_id = 0;
    }
}

fn hook_thread_is_current(generation: u64) -> bool {
    picker()
        .lock()
        .unwrap_or_else(poisoned_inner)
        .is_current(generation)
}

fn retire_stale_hook() -> bool {
    let stale = {
        let runtime = picker().lock().unwrap_or_else(poisoned_inner);
        runtime.hook_generation != runtime.generation
    };
    if stale {
        unsafe {
            PostThreadMessageW(GetCurrentThreadId(), WM_QUIT, 0, 0);
        }
    }
    stale
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

pub fn start_click_point_pick_inner(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(&app);

    let claimed = {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        let claimed = runtime.claim_start();
        if claimed.is_some() {
            runtime.app = Some(app.clone());
        }
        claimed
    };
    let Some(generation) = claimed else {
        crate::overlay::show_click_point_pick_overlay(&app)?;
        return Ok(());
    };

    app.state::<ClickerState>()
        .click_point_pick_active
        .store(true, std::sync::atomic::Ordering::SeqCst);

    let guard = PickStartGuard::arm();

    crate::overlay::show_click_point_pick_overlay(&app)?;

    let (ready_tx, ready_rx) = mpsc::channel();
    let (exit_tx, exit_rx) = mpsc::channel();
    {
        let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
        runtime.hook_thread_exit = Some(exit_rx);
    }

    std::thread::spawn(move || unsafe {
        let _exit = HookThreadExitGuard(exit_tx);
        create_thread_message_queue();
        let thread_id = GetCurrentThreadId();

        {
            let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
            if !runtime.is_current(generation) {
                let _ = ready_tx.send(Err(AppError::ChannelFailure));
                return;
            }
            runtime.thread_id = thread_id;
        }

        let mouse_hook =
            SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), std::ptr::null_mut(), 0);
        if mouse_hook.is_null() {
            let err = GetLastError();
            clear_hook_thread(thread_id);
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
            clear_hook_thread(thread_id);
            let _ = ready_tx.send(Err(AppError::WindowsSystem(err)));
            return;
        }

        let installed = {
            let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
            if runtime.is_current(generation) {
                runtime.mouse_hook = mouse_hook;
                runtime.keyboard_hook = keyboard_hook;
                runtime.hook_generation = generation;
                runtime.starting = false;
                true
            } else {
                false
            }
        };
        if !installed {
            UnhookWindowsHookEx(mouse_hook);
            UnhookWindowsHookEx(keyboard_hook);
            clear_hook_thread(thread_id);
            let _ = ready_tx.send(Err(AppError::ChannelFailure));
            return;
        }
        let _ = ready_tx.send(Ok(()));

        let mut msg = std::mem::zeroed::<MSG>();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if !hook_thread_is_current(generation) {
                break;
            }
        }

        UnhookWindowsHookEx(mouse_hook);
        UnhookWindowsHookEx(keyboard_hook);
        {
            let mut runtime = picker().lock().unwrap_or_else(poisoned_inner);
            if runtime.mouse_hook == mouse_hook {
                runtime.mouse_hook = std::ptr::null_mut();
            }
            if runtime.keyboard_hook == keyboard_hook {
                runtime.keyboard_hook = std::ptr::null_mut();
            }
        }
        clear_hook_thread(thread_id);
    });

    let ready = ready_rx.recv_timeout(Duration::from_secs(1));
    if !hook_thread_is_current(generation) {
        guard.disarm();
        return Ok(());
    }

    match ready {
        Ok(Ok(())) => {
            guard.disarm();
            Ok(())
        }
        Ok(Err(error)) => Err(error),
        Err(_) => Err(AppError::ChannelFailure),
    }
}

fn cancel_click_point_pick_from_hook() {
    let app = stop_click_point_pick(None, true);
    if let Some(app) = app {
        let _ = crate::overlay::hide_overlay(app);
    }
}

pub fn cancel_click_point_pick_inner(app: &AppHandle) {
    stop_click_point_pick(Some(app.clone()), true);
    let _ = crate::overlay::hide_overlay(app.clone());
}

fn stop_click_point_pick(
    app_override: Option<AppHandle>,
    notify_overlay: bool,
) -> Option<AppHandle> {
    let cancel = picker()
        .lock()
        .unwrap_or_else(poisoned_inner)
        .begin_cancel(app_override);

    if let Some(app) = &cancel.app {
        app.state::<ClickerState>()
            .click_point_pick_active
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("click-pick-ended", ());
        if notify_overlay {
            let _ = crate::overlay::set_click_point_pick_mode(app, false);
        }
    }

    let on_hook_thread =
        cancel.thread_id != 0 && unsafe { GetCurrentThreadId() } == cancel.thread_id;
    let mut hook_thread_stopped = cancel.thread_id == 0;
    if cancel.thread_id != 0 {
        unsafe {
            PostThreadMessageW(cancel.thread_id, WM_QUIT, 0, 0);
        }
        if !on_hook_thread {
            if let Some(exit) = cancel.hook_thread_exit {
                hook_thread_stopped = exit.recv_timeout(HOOK_THREAD_EXIT_TIMEOUT).is_ok();
                if !hook_thread_stopped {
                    log::warn!(
                        "[picker] click point hook thread still running {} ms after WM_QUIT; it exits on its next generation check",
                        HOOK_THREAD_EXIT_TIMEOUT.as_millis()
                    );
                }
            }
        }
    }

    if !on_hook_thread && hook_thread_stopped {
        let runtime = picker().lock().unwrap_or_else(poisoned_inner);
        debug_assert!(
            runtime.generation != cancel.generation || !runtime.has_live_hook_thread(),
            "click point picker cancel left a live hook thread"
        );
    }

    cancel.app
}
unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 || retire_stale_hook() {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let message = wparam as u32;
    let mouse = &*(lparam as *const MSLLHOOKSTRUCT);

    if message == WM_MOUSEMOVE {
        emit_cursor_position(mouse.pt.x, mouse.pt.y);
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let (shift_down, ctrl_down) = if message == WM_RBUTTONDOWN {
        (
            (GetAsyncKeyState(VK_SHIFT as i32) & 0x8000u16 as i16) != 0,
            (GetAsyncKeyState(VK_CONTROL as i32) & 0x8000u16 as i16) != 0,
        )
    } else {
        (false, false)
    };

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
                    stop_click_point_pick(None, true);
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
    if code < 0 || retire_stale_hook() {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }

    let message = wparam as u32;
    let keyboard = &*(lparam as *const KBDLLHOOKSTRUCT);

    match classify_keyboard_message(message, keyboard.vkCode) {
        KeyboardHookDecision::Pass => CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam),
        KeyboardHookDecision::Cancel => {
            cancel_click_point_pick_from_hook();
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
            "click-pick-cursor",
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
    let app = {
        let runtime = picker().lock().unwrap_or_else(poisoned_inner);
        if !runtime.active {
            return;
        }
        runtime.app.clone()
    };

    if let Some(app) = app {
        let _ = app.emit(
            "click-point-delete-requested",
            ClickPointDeleteRequestedPayload { x, y },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        classify_keyboard_message, classify_mouse_message, picker, KeyboardHookDecision,
        MouseHookDecision, PickStartGuard, PickerRuntime,
    };
    use crate::error::poisoned_inner;
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

    #[test]
    fn click_picker_start_guard_clears_active_flag_unless_disarmed() {
        let set_active = || {
            picker().lock().unwrap_or_else(poisoned_inner).active = true;
        };
        let is_active = || picker().lock().unwrap_or_else(poisoned_inner).active;

        set_active();
        PickStartGuard::arm().disarm();
        assert!(is_active());

        set_active();
        {
            let _guard = PickStartGuard::arm();
        }
        assert!(!is_active());
    }

    #[test]
    fn second_start_while_starting_is_refused() {
        let mut runtime = PickerRuntime::default();
        assert!(runtime.claim_start().is_some());
        assert!(runtime.claim_start().is_none());
    }

    #[test]
    fn start_while_installed_is_refused() {
        let mut runtime = PickerRuntime::default();
        let generation = runtime.claim_start().expect("first start claims");
        runtime.starting = false;
        assert!(runtime.claim_start().is_none());
        assert!(runtime.is_current(generation));
    }

    #[test]
    fn cancel_before_install_leaves_no_hooks() {
        let mut runtime = PickerRuntime::default();
        let generation = runtime.claim_start().expect("first start claims");
        let cancel = runtime.begin_cancel(None);

        assert_eq!(cancel.thread_id, 0);
        assert_eq!(cancel.generation, runtime.generation);
        assert!(!runtime.has_live_hook_thread());
        assert!(!runtime.active);
        assert!(!runtime.starting);
        assert!(!runtime.is_current(generation));
    }

    #[test]
    fn cancel_makes_installed_hook_generation_stale() {
        let mut runtime = PickerRuntime::default();
        let generation = runtime.claim_start().expect("first start claims");
        runtime.starting = false;
        runtime.hook_generation = generation;
        runtime.thread_id = 4242;

        runtime.begin_cancel(None);

        assert_ne!(runtime.hook_generation, runtime.generation);
        assert!(!runtime.is_current(generation));
    }

    #[test]
    fn stale_generation_ends_hook_loop() {
        let mut runtime = PickerRuntime::default();
        let generation = runtime.claim_start().expect("first start claims");
        assert!(runtime.is_current(generation));

        runtime.begin_cancel(None);

        assert!(!runtime.is_current(generation));
    }
}
