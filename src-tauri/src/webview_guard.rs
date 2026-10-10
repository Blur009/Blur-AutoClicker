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

/// Grace period after a captured error before we give up. Covers a slow but
/// eventually successful webview start.
const ERROR_GRACE: Duration = Duration::from_secs(3);
/// Hard cap when no error was captured but the frontend never boots.
const READY_TIMEOUT: Duration = Duration::from_secs(20);

pub fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::SeqCst);
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
            let message = record.args().to_string();
            if !is_webview_failure(&message) {
                return;
            }
            if let Ok(mut slot) = WEBVIEW_ERROR.lock() {
                if slot.is_none() {
                    *slot = Some(message);
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
            let started = Instant::now();
            loop {
                if FRONTEND_READY.load(Ordering::SeqCst) {
                    return;
                }
                let elapsed = started.elapsed();

                match captured_error() {
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

                std::thread::sleep(Duration::from_millis(250));
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
