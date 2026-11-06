use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Set once the frontend has signalled it booted.
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);
static WATCHDOG_THREAD: Mutex<Option<std::thread::Thread>> = Mutex::new(None);
static WINDOW_CREATED: AtomicBool = AtomicBool::new(false);
static FATAL_REPORTED: AtomicBool = AtomicBool::new(false);
static HEARTBEAT: Mutex<Option<Instant>> = Mutex::new(None);
const INTERFACE_TIMEOUT: Duration = Duration::from_secs(90);

fn poke_watchdog() {
    let thread = WATCHDOG_THREAD.lock().ok().and_then(|slot| slot.clone());
    if let Some(thread) = thread {
        thread.unpark();
    }
}
const READY_TIMEOUT: Duration = Duration::from_secs(20);
const WINDOW_TIMEOUT: Duration = Duration::from_secs(30);
const REVEAL_TIMEOUT: Duration = Duration::from_secs(10);
const REPORT_RETRY: Duration = Duration::from_secs(30);
const REPORT_RETRY_STEP: Duration = Duration::from_millis(500);

pub fn window_created() {
    WINDOW_CREATED.store(true, Ordering::SeqCst);
}

fn window_guard_expired(created: bool, elapsed: Duration) -> bool {
    !created && elapsed >= WINDOW_TIMEOUT
}

pub fn release_startup_report() {
    FATAL_REPORTED.store(false, Ordering::SeqCst);
}

pub fn claim_startup_report() -> bool {
    FATAL_REPORTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
}

pub fn fatal_exit() -> ! {
    crate::indicator::shutdown();
    crate::crash_handler::shutdown_crashpad();
    std::process::exit(1);
}

pub struct StartupFailure {
    pub code: &'static str,
    pub message: String,
}

impl StartupFailure {
    pub fn with_code(code: &'static str, body: String) -> Self {
        Self::new(code, body, &logs_path())
    }

    fn new(code: &'static str, body: String, logs: &str) -> Self {
        let log_line = if std::path::Path::new(logs).is_dir() {
            format!("\n\nA log is available at:\n{logs}")
        } else {
            String::new()
        };
        Self {
            code,
            message: format!("{body}\n\nError code: {code}{log_line}"),
        }
    }
}

pub const E_POLICY: &str = "E001";
pub const E_BUSY: &str = "E002";
pub const E_WEBVIEW_OTHER: &str = "E003";
pub const E_MISSING_RUNTIME_INSTALLING: &str = "E004";
pub const E_MISSING_RUNTIME: &str = "E005";
pub const E_UNWRITABLE_FOLDER: &str = "E006";
pub const E_WINDOW_TIMEOUT: &str = "E007";
pub const E_INTERFACE_NOT_READY: &str = "E008";
pub const E_PANIC: &str = "E009";

pub fn creation_failure(error: &str) -> StartupFailure {
    let logs = logs_path();
    match classify(error) {
        WebviewFailure::BlockedByPolicy => StartupFailure::new(
            E_POLICY,
            format!(
                "BlurAutoClicker could not start.\n\n\
                 Windows policy blocked the Microsoft Edge WebView2 runtime, which this app needs to \
                 draw its window.\n\n\
                 Details: {error}\n\n\
                 Software Restriction Policy, AppLocker, or a \"debloat\" / hardening tool blocking \
                 msedgewebview2.exe is the usual cause. On a PC you manage yourself, remove that rule. \
                 On a locked-down or work machine, ask your administrator to allow msedgewebview2.exe."
            ),
            &logs,
        ),
        WebviewFailure::RuntimeBusy => StartupFailure::new(
            E_BUSY,
            format!(
                "BlurAutoClicker could not start.\n\n\
                 The Microsoft Edge WebView2 runtime could not use a resource it needs.\n\n\
                 Details: {error}\n\n\
                 Another copy of BlurAutoClicker, or a msedgewebview2.exe process left behind by an \
                 earlier crash, can hold that folder open. Close any other copy, end any leftover \
                 msedgewebview2.exe processes in Task Manager, then start BlurAutoClicker again."
            ),
            &logs,
        ),
        WebviewFailure::Other => StartupFailure::new(
            E_WEBVIEW_OTHER,
            format!(
                "BlurAutoClicker could not start.\n\n\
                 The Microsoft Edge WebView2 runtime failed to start.\n\n\
                 Details: {error}\n\n\
                 If this keeps happening, download and run the WebView2 Evergreen installer (needs an \
                 internet connection):\n\
                 https://go.microsoft.com/fwlink/p/?LinkId=2124703"
            ),
            &logs,
        ),
    }
}

fn silent_startup_failure() -> StartupFailure {
    StartupFailure::new(
        E_INTERFACE_NOT_READY,
        String::from(
            "BlurAutoClicker could not finish starting.\n\n\
             Its window was created, but the interface never reported ready, so the app has to close.\n\n\
             A page that failed to load, a script error before the interface started, a browser \
             process that died after the window appeared, a slow or blocked disk, or a security tool \
             interfering with the app's files can cause this.\n\n\
             Start BlurAutoClicker again.",
        ),
        &logs_path(),
    )
}

fn window_timeout() -> StartupFailure {
    StartupFailure::new(
        E_WINDOW_TIMEOUT,
        format!(
            "BlurAutoClicker could not finish starting.\n\n\
             Creating the app window did not finish within {} seconds, so the app will close unless \
             the window appears.\n\n\
             A slow or blocked disk, a security tool scanning the app's own files, or a WebView2 \
             process that stopped responding can cause this.\n\n\
             Start BlurAutoClicker again.",
            WINDOW_TIMEOUT.as_secs()
        ),
        &logs_path(),
    )
}

#[tauri::command]
pub fn frontend_heartbeat() {
    if let Ok(mut slot) = HEARTBEAT.lock() {
        *slot = Some(Instant::now());
    }
}

fn last_heartbeat() -> Option<Instant> {
    HEARTBEAT.lock().ok().and_then(|slot| *slot)
}

fn interface_is_stale(window_visible: bool, window_hung: bool, last: Option<Instant>) -> bool {
    if !window_visible || window_hung {
        return false;
    }
    match last {
        Some(at) => at.elapsed() > INTERFACE_TIMEOUT,
        None => false,
    }
}

pub fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::SeqCst);
    poke_watchdog();
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WebviewFailure {
    /// Windows refused to run the runtime (Software Restriction Policy,
    /// AppLocker, or a similar control).
    BlockedByPolicy,
    RuntimeBusy,
    /// Anything else.
    Other,
}

fn classify(error: &str) -> WebviewFailure {
    let error = error.to_ascii_lowercase();
    if error.contains("0x800704ec") {
        WebviewFailure::BlockedByPolicy
    } else if error.contains("0x8007139f")
        || error.contains("0x800700aa")
        || error.contains("0x80070020")
    {
        WebviewFailure::RuntimeBusy
    } else {
        WebviewFailure::Other
    }
}

pub fn spawn_window_guard() {
    let spawned = std::thread::Builder::new()
        .name("window-guard".into())
        .spawn(|| {
            let started = Instant::now();
            while !window_guard_expired(WINDOW_CREATED.load(Ordering::SeqCst), started.elapsed()) {
                std::thread::sleep(Duration::from_millis(250));
            }
            if WINDOW_CREATED.load(Ordering::SeqCst) || !claim_startup_report() {
                return;
            }

            let failure = window_timeout();

            log::error!(
                "[WebView2] Window creation did not finish within {} s",
                WINDOW_TIMEOUT.as_secs()
            );

            #[cfg(target_os = "windows")]
            crate::portable::notify_fatal_error(failure.code, &failure.message);
            #[cfg(not(target_os = "windows"))]
            eprintln!("{}", failure.message);

            if WINDOW_CREATED.load(Ordering::SeqCst) {
                FATAL_REPORTED.store(false, Ordering::SeqCst);
                log::warn!("[WebView2] Window creation finished while the timeout dialog was open");
                return;
            }

            fatal_exit();
        });

    if let Err(error) = spawned {
        log::warn!("[WebView2] Window guard thread unavailable: {error}");
    }
}

pub fn spawn_watchdog(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("webview-watchdog".into())
        .spawn(move || {
            if let Ok(mut slot) = WATCHDOG_THREAD.lock() {
                *slot = Some(std::thread::current());
            }
            let started = Instant::now();
            loop {
                if FRONTEND_READY.load(Ordering::SeqCst) {
                    break;
                }
                let elapsed = started.elapsed();
                if elapsed >= READY_TIMEOUT {
                    if report() || elapsed >= READY_TIMEOUT + REPORT_RETRY {
                        return;
                    }
                    std::thread::park_timeout(REPORT_RETRY_STEP);
                    continue;
                }
                match READY_TIMEOUT.checked_sub(elapsed) {
                    Some(remaining) if !remaining.is_zero() => {
                        std::thread::park_timeout(remaining);
                    }
                    _ => continue,
                }
            }

            reveal_if_hidden(&app);
        })
        .ok();
}

fn should_reveal(window_visible: bool, autostart_launch: bool) -> bool {
    !window_visible && !autostart_launch
}

fn window_visible(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;

    app.get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn reveal_if_hidden(app: &tauri::AppHandle) {
    let started = Instant::now();
    while started.elapsed() < REVEAL_TIMEOUT {
        if !should_reveal(
            window_visible(app),
            crate::ui_commands::was_autostart_launch(),
        ) {
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if !should_reveal(
        window_visible(app),
        crate::ui_commands::was_autostart_launch(),
    ) {
        return;
    }

    log::warn!("[UI] Window was never shown after the frontend booted; showing it now");

    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.show() {
            log::error!("[UI] Showing the window failed: {error}");
        }
    }
}

fn report() -> bool {
    if !claim_startup_report() {
        return false;
    }

    let failure = silent_startup_failure();

    log::error!("[WebView2] Startup watchdog triggered: the frontend never reported ready");

    #[cfg(target_os = "windows")]
    crate::portable::notify_fatal_error(failure.code, &failure.message);
    #[cfg(not(target_os = "windows"))]
    eprintln!("{}", failure.message);

    if FRONTEND_READY.load(Ordering::SeqCst) {
        FATAL_REPORTED.store(false, Ordering::SeqCst);
        log::warn!("[UI] The frontend reported ready while the startup dialog was open");
        return true;
    }

    fatal_exit();
}

fn logs_path() -> String {
    crate::diagnostics::logs_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "the app's log folder".to_string())
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
            let mut stale = false;
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
                let responding = responds_to_messages(hwnd, PROBE_TIMEOUT_MS);

                if interface_is_stale(true, !responding, last_heartbeat()) {
                    if !stale {
                        log::error!(
                            "[UI] The interface stopped talking to the backend; the window is still alive"
                        );
                    }
                    stale = true;
                } else if stale {
                    if responding {
                        log::info!("[UI] The interface is talking to the backend again");
                    }
                    stale = false;
                }

                if responding {
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
    fn a_window_without_a_heartbeat_only_looks_stale_when_it_was_ever_alive() {
        assert!(!interface_is_stale(true, false, None));
        assert!(interface_is_stale(
            true,
            false,
            Some(Instant::now() - INTERFACE_TIMEOUT - Duration::from_secs(10))
        ));
        assert!(!interface_is_stale(
            true,
            false,
            Some(Instant::now() - Duration::from_secs(60))
        ));
        assert!(!interface_is_stale(
            false,
            false,
            Some(Instant::now() - INTERFACE_TIMEOUT - Duration::from_secs(10))
        ));
        assert!(!interface_is_stale(
            true,
            true,
            Some(Instant::now() - INTERFACE_TIMEOUT - Duration::from_secs(10))
        ));
    }

    #[test]
    fn reveal_only_when_the_window_stayed_hidden() {
        assert!(should_reveal(false, false));
        assert!(!should_reveal(true, false));
        assert!(!should_reveal(false, true));
        assert!(!should_reveal(true, true));
    }

    #[test]
    fn classifies_policy_block() {
        let msg = "failed to create webview: WebView2 error: WindowsError(Error { code: HRESULT(0x800704EC), message: \"blocked by group policy\" })";
        assert_eq!(classify(msg), WebviewFailure::BlockedByPolicy);
    }

    #[test]
    fn classifies_runtime_busy_codes() {
        assert_eq!(
            classify("failed to create webview: HRESULT(0x8007139F) invalid state"),
            WebviewFailure::RuntimeBusy
        );
        assert_eq!(
            classify(
                "failed to create webview: HRESULT(0x800700AA) the requested resource is in use"
            ),
            WebviewFailure::RuntimeBusy
        );
        assert_eq!(
            classify("failed to create webview: HRESULT(0x80070020) sharing violation"),
            WebviewFailure::RuntimeBusy
        );
    }

    #[test]
    fn busy_errors_tell_the_user_to_close_the_other_copy() {
        let failure = creation_failure("failed to create webview: HRESULT(0x800700AA)");

        assert_eq!(failure.code, E_BUSY);
        assert!(
            failure
                .message
                .to_ascii_lowercase()
                .contains("another copy"),
            "{}",
            failure.message
        );
        assert!(failure.message.contains("msedgewebview2.exe"));
        assert!(!failure
            .message
            .to_ascii_lowercase()
            .contains("only one copy"));
    }

    #[test]
    fn the_guard_expires_only_when_the_window_is_still_missing() {
        let timeout = Duration::from_secs(30);

        assert!(!window_guard_expired(
            true,
            timeout + Duration::from_secs(5)
        ));
        assert!(!window_guard_expired(
            false,
            timeout - Duration::from_millis(1)
        ));
        assert!(window_guard_expired(false, timeout));
    }

    #[test]
    fn only_the_first_startup_dialog_can_be_claimed() {
        assert!(claim_startup_report());
        assert!(!claim_startup_report());
    }

    #[test]
    fn every_message_carries_its_code() {
        let failures = [
            creation_failure("failed to create webview: HRESULT(0x800704EC) policy"),
            creation_failure("failed to create webview: HRESULT(0x800700AA) busy"),
            creation_failure("failed to create webview: HRESULT(0x80070123) other"),
            silent_startup_failure(),
            window_timeout(),
            window_timeout(),
        ];

        for failure in failures {
            assert!(
                failure
                    .message
                    .contains(&format!("Error code: {}", failure.code)),
                "{} missing its code",
                failure.code
            );
            assert!(failure.code.starts_with('E'), "{}", failure.code);
            assert_eq!(failure.code.len(), 4, "{}", failure.code);
        }
    }

    #[test]
    fn a_creation_failure_is_explained_by_its_error_code() {
        let failure = creation_failure(
            "runtime error: failed to create webview: WebView2 error: WindowsError(Error { code: HRESULT(0x800700AA), message: \"busy\" })",
        );

        assert!(failure.message.contains("msedgewebview2.exe"));
        assert!(failure.message.contains("0x800700AA"));
    }

    #[test]
    fn invalid_argument_is_not_reported_as_a_busy_data_folder() {
        assert_eq!(
            classify("failed to create webview: HRESULT(0x80070057) invalid arg"),
            WebviewFailure::Other
        );
    }

    #[test]
    fn a_creation_timeout_names_the_step_that_stalled() {
        let failure = window_timeout();

        assert!(failure.message.contains("did not finish within 30 seconds"));
        assert!(failure.message.contains("Error code: E007"));
    }

    #[test]
    fn a_silent_startup_does_not_blame_the_webview_runtime() {
        let failure = silent_startup_failure();

        assert_eq!(failure.code, E_INTERFACE_NOT_READY);
        assert!(failure
            .message
            .contains("the interface never reported ready"));
        assert!(failure.message.contains("Start BlurAutoClicker again"));
        assert!(!failure.message.contains("blocked or broken"));
        assert!(!failure.message.contains("msedgewebview2"));
    }

    #[test]
    fn an_unknown_webview_error_points_at_the_runtime() {
        let failure = creation_failure("failed to create webview: HRESULT(0x80070123)");

        assert_eq!(failure.code, E_WEBVIEW_OTHER);
        assert!(failure.message.contains("WebView2 Evergreen installer"));
        assert!(failure
            .message
            .contains("Details: failed to create webview"));
    }

    #[test]
    fn classifies_unknown_code_as_other() {
        assert_eq!(
            classify("failed to create webview: something unexpected"),
            WebviewFailure::Other
        );
    }
}
