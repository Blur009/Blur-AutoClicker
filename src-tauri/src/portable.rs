use std::path::PathBuf;
use std::sync::OnceLock;

const MARKER_FILE: &str = "portable.txt";
const MARKER_CONTENT: &str = "BlurAutoClicker Portable Mode";
#[cfg(target_os = "windows")]
const BOOTSTRAPPER_FILE: &str = "MicrosoftEdgeWebview2Setup.exe";

#[cfg(target_os = "windows")]
const WEBVIEW2_CLIENT_KEYS: [&str; 2] = [
    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
];

static PORTABLE: OnceLock<bool> = OnceLock::new();
static PORTABLE_DIR: OnceLock<PathBuf> = OnceLock::new();
#[cfg(target_os = "windows")]
static BOOTSTRAPPER_SPAWNED: OnceLock<bool> = OnceLock::new();

/// Detect portable mode and initialize portable paths. Must run before any
/// code that resolves data directories (settings, logs, crashpad, webview).
pub fn init() {
    let portable = detect_portable();
    PORTABLE.get_or_init(|| portable);

    if portable {
        if let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        {
            PORTABLE_DIR.get_or_init(|| dir);
        }
        let _ = ensure_data_dir();
        #[cfg(target_os = "windows")]
        ensure_webview2();
    }
}

fn detect_portable() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Some(dir) = exe.parent() else {
        return false;
    };
    detect_marker(dir)
}

fn detect_marker(dir: &std::path::Path) -> bool {
    let marker = dir.join(MARKER_FILE);
    if !marker.is_file() {
        return false;
    }
    match std::fs::read_to_string(&marker) {
        Ok(content) => content.trim() == MARKER_CONTENT,
        Err(_) => false,
    }
}

pub fn is_portable() -> bool {
    *PORTABLE.get_or_init(|| false)
}

/// Root folder for all portable app data (settings, diagnostics, webview).
pub fn data_dir() -> Option<PathBuf> {
    if is_portable() {
        PORTABLE_DIR.get().map(|d| portable_data_dir_of(d))
    } else {
        None
    }
}

/// Per-window WebView2 user data folder for portable mode.
pub fn webview_dir(label: &str) -> Option<PathBuf> {
    data_dir().map(|d| webview_dir_of(&d, label))
}

pub(crate) fn portable_data_dir_of(exe_dir: &std::path::Path) -> PathBuf {
    exe_dir.join("Data")
}

fn webview_dir_of(data: &std::path::Path, label: &str) -> PathBuf {
    data.join(format!("EBWebView-{label}"))
}

pub fn ensure_data_dir() -> std::io::Result<()> {
    if let Some(dir) = data_dir() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn webview2_installed() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    WEBVIEW2_CLIENT_KEYS
        .iter()
        .any(|key| hklm.open_subkey(key).is_ok())
}

/// Whether the Evergreen bootstrapper was actually launched (the packaged
/// download can be missing or the spawn can fail, so "present" is not enough).
#[cfg(target_os = "windows")]
pub(crate) fn webview2_bootstrapper_started() -> bool {
    *BOOTSTRAPPER_SPAWNED.get().unwrap_or(&false)
}

/// If the Evergreen WebView2 runtime is missing and the bootstrapper sits next
/// to the exe, kick off a silent install without blocking startup.
#[cfg(target_os = "windows")]
fn ensure_webview2() {
    if webview2_installed() {
        return;
    }
    let Some(dir) = PORTABLE_DIR.get() else {
        return;
    };
    let bootstrapper = dir.join(BOOTSTRAPPER_FILE);
    if !bootstrapper.is_file() {
        return;
    }

    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    if let Ok(_child) = Command::new(&bootstrapper)
        .args(["/silent", "/install"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        let _ = BOOTSTRAPPER_SPAWNED.set(true);
        // Detach: on Windows dropping Child does not kill the process, it
        // only closes our handle. The install continues while the app starts.
    }
}

/// Show a fatal error to the user. Used for both portable and non-portable
/// startup failures where the main window could not be created.
#[cfg(target_os = "windows")]
pub(crate) fn notify_fatal_error(msg: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND,
    };

    let title: Vec<u16> = "BlurAutoClicker".encode_utf16().chain(Some(0)).collect();
    let body: Vec<u16> = msg.encode_utf16().chain(Some(0)).collect();

    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONWARNING | MB_SETFOREGROUND,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_marker(dir: &std::path::Path, content: &str) {
        std::fs::write(dir.join(MARKER_FILE), content).expect("write marker");
    }

    #[test]
    fn marker_content_must_match_exactly() {
        let temp = tempfile::tempdir().expect("tempdir");
        with_marker(temp.path(), "BlurAutoClicker Portable Mode");
        assert!(detect_marker(temp.path()));
    }

    #[test]
    fn empty_or_foreign_marker_is_not_portable() {
        let temp = tempfile::tempdir().expect("tempdir");
        with_marker(temp.path(), "");
        assert!(!detect_marker(temp.path()));

        let temp2 = tempfile::tempdir().expect("tempdir");
        with_marker(temp2.path(), "something else");
        assert!(!detect_marker(temp2.path()));
    }

    #[test]
    fn no_marker_is_not_portable() {
        let temp = tempfile::tempdir().expect("tempdir");
        assert!(!detect_marker(temp.path()));
    }

    #[test]
    fn layout_resolves_under_exe_data() {
        let exe_dir = std::path::Path::new("apps").join("Blur");
        let data = portable_data_dir_of(&exe_dir);
        assert_eq!(data, exe_dir.join("Data"));
        let webview = webview_dir_of(&data, "main");
        assert_eq!(webview, exe_dir.join("Data").join("EBWebView-main"));
    }
}
