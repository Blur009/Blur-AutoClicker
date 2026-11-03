//! Session-end guard for Windows shutdown, restart and logoff.
//!
//! tao 0.37 handles `WM_ENDSESSION` by dispatching `Event::LoopDestroyed` and
//! then calling `process::exit(0)` (src/platform_impl/windows/event_loop.rs).
//! Dispatching that event runs the whole Tauri exit path inside tao's event
//! handler: windows are dropped, `ICoreWebView2Controller::Close` runs, the
//! tray unregisters. Any of those pumps messages, so the messages still queued
//! for the same thread get delivered while tao has already taken its handler
//! out of the slot. `EventLoopRunner::call_event_handler` then aborts with
//! "either event handler is re-entrant (likely), or no event handler is
//! registered (very unlikely)" (runner.rs:246). Upstream: tauri-apps/tao#1345,
//! tauri-apps/tao#1180, fix PR tauri-apps/tao#1346 (unmerged).
//!
//! Windows is going to end the session either way, so the teardown buys
//! nothing. We subclass tao's thread event target window, which is the window
//! that receives `WM_ENDSESSION`, and terminate the process before tao sees
//! the message. Normal quits are untouched: they never send `WM_ENDSESSION`.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use windows_sys::core::BOOL;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentThreadId, TerminateProcess,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallWindowProcW, DefWindowProcW, EnumThreadWindows, GetClassNameW, SetWindowLongPtrW,
    GWLP_WNDPROC, WM_ENDSESSION, WM_QUERYENDSESSION, WNDPROC,
};

/// tao's window class for the per-thread event target. This window is a
/// top-level popup and is what receives the session-end messages.
const THREAD_EVENT_TARGET_CLASS: &str = "Tao Thread Event Target";

/// Window procedure we replaced, or 0 when the guard is not installed.
static PREVIOUS_WNDPROC: AtomicIsize = AtomicIsize::new(0);
/// Set as soon as Windows asks about ending the session, cleared never.
static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);
/// Whether the session is ending. The panic hook uses this to stay silent
/// instead of showing a modal dialog in the middle of a shutdown.
pub fn shutdown_requested() -> bool {
    SHUTDOWN_REQUESTED.load(Ordering::SeqCst)
}

fn is_thread_event_target(class: &str) -> bool {
    class == THREAD_EVENT_TARGET_CLASS
}

/// Result slot for the enumeration below. Only touched during `install`.
static FOUND_TARGET: AtomicIsize = AtomicIsize::new(0);

unsafe extern "system" fn find_thread_event_target(hwnd: HWND, _lparam: LPARAM) -> BOOL {
    let mut buffer = [0u16; 64];
    let length = GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    if length <= 0 {
        return 1;
    }
    let class = String::from_utf16_lossy(&buffer[..length as usize]);
    if !is_thread_event_target(&class) {
        return 1;
    }
    FOUND_TARGET.store(hwnd as isize, Ordering::SeqCst);
    0
}

fn find_thread_event_target_window() -> HWND {
    FOUND_TARGET.store(0, Ordering::SeqCst);
    unsafe {
        // Only this thread's windows, so a second copy of the app (which does
        // exist briefly during a restart-as-administrator) cannot hand us a
        // window we cannot subclass.
        EnumThreadWindows(GetCurrentThreadId(), Some(find_thread_event_target), 0);
    }
    FOUND_TARGET.swap(0, Ordering::SeqCst) as HWND
}

/// Takes over `WM_QUERYENDSESSION` / `WM_ENDSESSION` on tao's event target
/// window. Safe to call once, from the main thread, after the event loop
/// exists (Tauri's `setup` runs inside the loop).
pub fn install() {
    let hwnd = find_thread_event_target_window();
    if hwnd.is_null() {
        log::warn!("[Shutdown] tao event target window not found; session-end guard is inactive");
        return;
    }

    let previous =
        unsafe { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, session_end_proc as *const () as isize) };
    if previous == 0 {
        log::warn!(
            "[Shutdown] Could not subclass the event target window: {}",
            std::io::Error::last_os_error()
        );
        return;
    }

    PREVIOUS_WNDPROC.store(previous, Ordering::SeqCst);
    log::info!("[Shutdown] Session-end guard installed");
}

/// Leaves the process immediately. Windows is ending the session, so there is
/// nothing left to clean up that would outlive us, and every teardown step we
/// could run here is what re-enters the event loop.
fn leave_now() -> ! {
    log::error!("[Shutdown] Session ending; leaving before the event loop tears down");
    crate::diagnostics::write_shutdown_note("WM_ENDSESSION");

    unsafe {
        TerminateProcess(GetCurrentProcess(), 0);
    }

    // TerminateProcess only fails for handles without terminate access, and
    // the pseudo handle always has it. Keep a hard stop in case it does.
    std::process::abort()
}

unsafe extern "system" fn session_end_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_QUERYENDSESSION => {
            // Let the shutdown proceed, but remember it so a panic in between
            // does not open a modal dialog that holds the machine hostage.
            SHUTDOWN_REQUESTED.store(true, Ordering::SeqCst);
            log::warn!("[Shutdown] Windows asked to end the session");
        }
        WM_ENDSESSION if wparam != 0 => {
            // wParam == 0 means the shutdown was cancelled; keep running.
            leave_now();
        }
        _ => {}
    }

    let previous = PREVIOUS_WNDPROC.load(Ordering::SeqCst);
    if previous == 0 {
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    let proc: WNDPROC = std::mem::transmute(previous);
    CallWindowProcW(proc, hwnd, msg, wparam, lparam)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_without_a_window_does_not_panic() {
        // No event loop in a test binary, so this exercises the "window not
        // found" path that must degrade quietly instead of breaking startup.
        install();
        assert!(
            !shutdown_requested(),
            "installing the guard must not look like a shutdown"
        );
    }

    #[test]
    fn matches_only_tao_event_target_windows() {
        assert!(is_thread_event_target("Tao Thread Event Target"));
        assert!(!is_thread_event_target("Tauri Window"));
        assert!(!is_thread_event_target("Tao Thread Event Target "));
    }
}
