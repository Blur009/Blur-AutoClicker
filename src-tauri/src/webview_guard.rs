//! Surfaces WebView2 startup failures instead of leaving the app running as a
//! windowless tray process.
//!
//! The main window is created hidden and only shown once the frontend boots
//! and calls `window.show()`. If the WebView2 runtime cannot start (most often
//! because a policy blocks `msedgewebview2.exe`), the frontend never runs, the
//! window never appears, and the user is left staring at a tray icon. wry logs
//! the real error, so we capture it through the log pipeline and report it.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri_plugin_log::fern;

/// Set once the frontend has signalled it booted.
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);
/// The wry error captured from the log, if the webview failed to create.
static WEBVIEW_ERROR: Mutex<Option<String>> = Mutex::new(None);
static WEBVIEW_ERROR_SET: AtomicBool = AtomicBool::new(false);
static WATCHDOG_THREAD: Mutex<Option<std::thread::Thread>> = Mutex::new(None);

fn poke_watchdog() {
    let thread = WATCHDOG_THREAD.lock().ok().and_then(|slot| slot.clone());
    if let Some(thread) = thread {
        thread.unpark();
    }
}
/// Grace period after a captured error before we give up. Covers a slow but
/// eventually successful webview start.
const ERROR_GRACE: Duration = Duration::from_secs(3);
/// Hard cap when no error was captured but the frontend never boots.
const READY_TIMEOUT: Duration = Duration::from_secs(20);

pub fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::SeqCst);
    poke_watchdog();
}

fn captured_error() -> Option<String> {
    WEBVIEW_ERROR.lock().ok().and_then(|slot| slot.clone())
}

fn is_webview_target(target: &str) -> bool {
    fn is_crate_or_module(target: &str, root: &str) -> bool {
        target == root
            || target
                .strip_prefix(root)
                .is_some_and(|rest| rest.starts_with("::"))
    }
    is_crate_or_module(target, "tauri_runtime_wry") || is_crate_or_module(target, "wry")
}

fn is_webview_failure(message: &str) -> bool {
    message.contains("failed to create webview")
}

/// How a captured WebView2 startup failure should be explained to the user.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WebviewFailure {
    /// Windows refused to run the runtime (Software Restriction Policy,
    /// AppLocker, or a similar control).
    BlockedByPolicy,
    /// The runtime could not open its user data folder, which a live copy of
    /// the app already holds open.
    RuntimeBusy,
    /// Anything else.
    Other,
}

fn classify(error: &str) -> WebviewFailure {
    let error = error.to_ascii_lowercase();
    if error.contains("0x800704ec") {
        WebviewFailure::BlockedByPolicy
    } else if error.contains("0x80070057") || error.contains("0x8007139f") {
        WebviewFailure::RuntimeBusy
    } else {
        WebviewFailure::Other
    }
}

/// Log target that records WebView2 creation failures so the watchdog can
/// report the real error text rather than a generic message.
pub fn create_watch_target() -> fern::Dispatch {
    fern::Dispatch::new()
        .filter(|metadata| is_webview_target(metadata.target()))
        .chain(fern::Output::call(|record| {
            if WEBVIEW_ERROR_SET.load(Ordering::SeqCst) {
                return;
            }
            let message = record.args().to_string();
            if !is_webview_failure(&message) {
                return;
            }
            if let Ok(mut slot) = WEBVIEW_ERROR.lock() {
                if slot.is_none() {
                    *slot = Some(message);
                    WEBVIEW_ERROR_SET.store(true, Ordering::SeqCst);
                    poke_watchdog();
                }
            }
        }))
}

/// Watch for a startup that never becomes visible. If the webview died, show
/// the captured error; if the frontend just never booted, say so. Either way
/// the app exits instead of lingering with no window.
pub fn spawn_watchdog() {
    std::thread::Builder::new()
        .name("webview-watchdog".into())
        .spawn(|| {
            if let Ok(mut slot) = WATCHDOG_THREAD.lock() {
                *slot = Some(std::thread::current());
            }
            let started = Instant::now();
            loop {
                if FRONTEND_READY.load(Ordering::SeqCst) {
                    return;
                }
                let elapsed = started.elapsed();

                let error = if WEBVIEW_ERROR_SET.load(Ordering::SeqCst) {
                    captured_error()
                } else {
                    None
                };

                let has_error = error.is_some();
                match error {
                    Some(error) if elapsed >= ERROR_GRACE => {
                        report(Some(&error));
                        return;
                    }
                    None if elapsed >= READY_TIMEOUT => {
                        report(None);
                        return;
                    }
                    _ => {}
                }

                let deadline = if has_error {
                    ERROR_GRACE
                } else {
                    READY_TIMEOUT
                };
                match deadline.checked_sub(elapsed) {
                    Some(remaining) if !remaining.is_zero() => {
                        std::thread::park_timeout(remaining);
                    }
                    _ => continue,
                }
            }
        })
        .ok();
}

fn report(error: Option<&str>) {
    let logs = crate::diagnostics::logs_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "the app's log folder".to_string());

    let failure = error.map(classify);

    let message = match (error, failure) {
        (Some(err), Some(WebviewFailure::BlockedByPolicy)) => format!(
            "BlurAutoClicker could not start.\n\n\
             Windows blocked the Microsoft Edge WebView2 runtime, which this app needs to draw its window.\n\n\
             Details: {err}\n\n\
             This is almost always a Software Restriction Policy, an AppLocker rule, or a \"debloat\" / hardening tool \
             blocking msedgewebview2.exe. On a PC you manage yourself, remove that rule. On a locked-down or work \
             machine, ask your administrator to allow msedgewebview2.exe.\n\n\
             A log is available at:\n{logs}"
        ),
        (Some(err), Some(WebviewFailure::RuntimeBusy)) => format!(
            "BlurAutoClicker could not start.\n\n\
             The Microsoft Edge WebView2 runtime could not open its data folder. This usually means another copy of \
             BlurAutoClicker is already running, because only one copy can use that folder at a time for now.\n\n\
             Close the other copy and start BlurAutoClicker again.\n\n\
             Details: {err}\n\n\
             A log is available at:\n{logs}"
        ),
        (Some(err), _) => format!(
            "BlurAutoClicker could not start.\n\n\
             The Microsoft Edge WebView2 runtime failed to start.\n\n\
             Details: {err}\n\n\
             If this keeps happening, repair or reinstall the WebView2 runtime:\n\
             https://go.microsoft.com/fwlink/p/?LinkId=2124703\n\n\
             A log is available at:\n{logs}"
        ),
        (None, _) => format!(
            "BlurAutoClicker could not start.\n\n\
             Its interface never became ready. This usually means the Microsoft Edge WebView2 runtime is blocked \
             or broken.\n\n\
             A log is available at:\n{logs}"
        ),
    };

    log::error!(
        "[WebView2] Startup watchdog triggered (captured webview error: {}, class: {:?})",
        error.is_some(),
        failure
    );

    #[cfg(target_os = "windows")]
    crate::portable::notify_fatal_error(&message);
    #[cfg(not(target_os = "windows"))]
    eprintln!("{message}");

    std::process::exit(1);
}

/// Pokes the main window every so often so an unresponsive interface leaves a
/// trace in the log instead of only a user report. A run-as-administrator bug
/// that leaves the window visible but deaf is otherwise invisible: the process
/// is alive, the clicker keeps working, and nothing is written down.
#[cfg(target_os = "windows")]
pub fn spawn_ui_watchdog(app: tauri::AppHandle) {
    use std::time::Duration;

    const INTERVAL: Duration = Duration::from_secs(20);
    /// Long enough that a slow frame does not count, short enough to catch a
    /// thread that is actually stuck.
    const PROBE_TIMEOUT_MS: u32 = 2_000;

    let spawned = std::thread::Builder::new()
        .name("ui-watchdog".into())
        .spawn(move || {
            let mut hung = false;
            let mut baseline_logged = false;
            loop {
                std::thread::sleep(INTERVAL);
                let Some(hwnd) = main_window_handle(&app) else {
                    continue;
                };
                // A hidden window is normal (autostart, minimized to tray), and
                // the startup watchdog already covers "never became visible".
                if !window_is_visible(hwnd) {
                    continue;
                }
                if !baseline_logged {
                    log_window_state(hwnd, "baseline");
                    baseline_logged = true;
                }
                if responds_to_messages(hwnd, PROBE_TIMEOUT_MS) {
                    if hung {
                        log::info!("[UI] Main window responds again");
                        hung = false;
                    }
                } else {
                    if !hung {
                        log::error!("[UI] Main window stopped responding to window messages");
                    }
                    hung = true;
                    log_window_state(hwnd, "unresponsive");
                }
            }
        });

    if spawned.is_err() {
        log::warn!("[UI] Watchdog thread unavailable");
    }
}

#[cfg(not(target_os = "windows"))]
pub fn spawn_ui_watchdog(_app: tauri::AppHandle) {}

#[cfg(target_os = "windows")]
fn main_window_handle(app: &tauri::AppHandle) -> Option<*mut core::ffi::c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::Manager;

    let window = app.get_webview_window("main")?;
    let handle = window.window_handle().ok()?;
    let RawWindowHandle::Win32(raw) = handle.as_raw() else {
        return None;
    };
    Some(raw.hwnd.get() as *mut core::ffi::c_void)
}

#[cfg(target_os = "windows")]
fn window_is_visible(hwnd: *mut core::ffi::c_void) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::IsWindowVisible;

    unsafe { IsWindowVisible(hwnd) != 0 }
}

#[cfg(target_os = "windows")]
fn responds_to_messages(hwnd: *mut core::ffi::c_void, timeout_ms: u32) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, SMTO_ABORTIFHUNG, SMTO_BLOCK, WM_NULL,
    };

    let mut result: usize = 0;
    let ok = unsafe {
        SendMessageTimeoutW(
            hwnd,
            WM_NULL,
            0,
            0,
            SMTO_ABORTIFHUNG | SMTO_BLOCK,
            timeout_ms,
            &mut result,
        )
    };
    ok != 0
}

/// Writes the facts that separate the ways a window can be unreachable:
/// hidden, off-screen, not activatable, or owned by a hung thread.
#[cfg(target_os = "windows")]
fn log_window_state(hwnd: *mut core::ffi::c_void, phase: &str) {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, IsHungAppWindow,
        IsWindowVisible, GWL_EXSTYLE, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_EX_TRANSPARENT,
    };

    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let mut flags: Vec<&str> = Vec::new();
        if ex_style & WS_EX_NOACTIVATE != 0 {
            flags.push("NOACTIVATE");
        }
        if ex_style & WS_EX_APPWINDOW != 0 {
            flags.push("APPWINDOW");
        }
        if ex_style & WS_EX_TOOLWINDOW != 0 {
            flags.push("TOOLWINDOW");
        }
        if ex_style & WS_EX_LAYERED != 0 {
            flags.push("LAYERED");
        }
        if ex_style & WS_EX_TRANSPARENT != 0 {
            flags.push("TRANSPARENT");
        }

        let mut rect: RECT = std::mem::zeroed();
        let has_rect = GetWindowRect(hwnd, &mut rect) != 0;
        let screen_w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let screen_h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        let screen_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let screen_y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let on_screen = has_rect
            && screen_w > 0
            && screen_h > 0
            && rect.right > screen_x
            && rect.left < screen_x + screen_w
            && rect.bottom > screen_y
            && rect.top < screen_y + screen_h;

        log::info!(
            "[UI] {phase}: visible={} foreground={} hung={} on_screen={} exstyle=0x{ex_style:08x} [{}] rect={}x{}+{},{} virtual_screen={}x{}+{},{} elevated={}",
            IsWindowVisible(hwnd) != 0,
            GetForegroundWindow() == hwnd,
            IsHungAppWindow(hwnd) != 0,
            on_screen,
            flags.join(","),
            rect.right - rect.left,
            rect.bottom - rect.top,
            rect.left,
            rect.top,
            screen_w,
            screen_h,
            screen_x,
            screen_y,
            crate::elevation::current_process_elevated(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_wry_webview_failure() {
        let msg = "failed to create webview: WebView2 error: WindowsError(Error { code: HRESULT(0x800704EC) })";
        assert!(is_webview_failure(msg));
    }

    #[test]
    fn ignores_unrelated_messages() {
        assert!(!is_webview_failure(
            "[Window] Frontend ready, initializing overlay..."
        ));
        assert!(!is_webview_failure("[Crashpad] Initialized"));
    }

    #[test]
    fn matches_only_wry_targets() {
        assert!(is_webview_target("tauri_runtime_wry"));
        assert!(is_webview_target("wry::webview"));
        assert!(!is_webview_target("app_lib"));
        assert!(!is_webview_target("tauri_runtime_wry_extra"));
    }

    #[test]
    fn classifies_policy_block() {
        let msg = "failed to create webview: WebView2 error: WindowsError(Error { code: HRESULT(0x800704EC), message: \"blocked by group policy\" })";
        assert_eq!(classify(msg), WebviewFailure::BlockedByPolicy);
    }

    #[test]
    fn classifies_runtime_busy_codes() {
        assert_eq!(
            classify("failed to create webview: HRESULT(0x80070057) parameter is incorrect"),
            WebviewFailure::RuntimeBusy
        );
        assert_eq!(
            classify("failed to create webview: HRESULT(0x8007139F) invalid state"),
            WebviewFailure::RuntimeBusy
        );
    }

    #[test]
    fn classifies_unknown_code_as_other() {
        assert_eq!(
            classify("failed to create webview: something unexpected"),
            WebviewFailure::Other
        );
    }
}
