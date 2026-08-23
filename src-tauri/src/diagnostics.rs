use serde::Serialize;
use std::path::PathBuf;

#[cfg(test)]
std::thread_local! {
    static TEST_DATA_DIR: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    pub root: String,
    pub logs: String,
    pub crash_reports: String,
    pub panic_reports: String,
    pub app_events: String,
    pub exports: String,
}

fn data_dir() -> Option<PathBuf> {
    #[cfg(test)]
    {
        let result = TEST_DATA_DIR.with(|d| d.borrow().clone());
        if let Some(dir) = result {
            return Some(dir);
        }
    }
    if crate::portable::is_portable() {
        crate::portable::data_dir()
    } else {
        dirs::data_local_dir().map(|d| d.join("BlurAutoClicker"))
    }
}

pub fn diagnostics_root() -> Option<PathBuf> {
    data_dir().map(|d| diagnostics_root_of(&d))
}

fn diagnostics_root_of(base: &std::path::Path) -> PathBuf {
    base.join("Diagnostics")
}

pub fn logs_dir() -> Option<PathBuf> {
    diagnostics_root().map(|d| d.join("Logs"))
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn crash_reports_dir() -> Option<PathBuf> {
    diagnostics_root().map(|d| d.join("CrashReports"))
}

pub fn panic_reports_dir() -> Option<PathBuf> {
    diagnostics_root().map(|d| d.join("PanicReports"))
}

pub fn app_events_dir() -> Option<PathBuf> {
    diagnostics_root().map(|d| d.join("AppEvents"))
}

pub fn exports_dir() -> Option<PathBuf> {
    diagnostics_root().map(|d| d.join("Exports"))
}

pub fn ensure_diagnostics_dirs() -> std::io::Result<()> {
    let root = diagnostics_root().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "failed to resolve diagnostics root",
        )
    })?;
    std::fs::create_dir_all(root.join("Logs"))?;
    std::fs::create_dir_all(root.join("CrashReports"))?;
    std::fs::create_dir_all(root.join("PanicReports"))?;
    std::fs::create_dir_all(root.join("AppEvents"))?;
    std::fs::create_dir_all(root.join("Exports"))?;
    Ok(())
}

pub fn write_panic_report(report: &str) {
    if let Some(dir) = panic_reports_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let path = dir.join(format!("panic_{ts}.txt"));
        let _ = std::fs::write(&path, report);
    }
}

pub fn get_diagnostics_info() -> Option<DiagnosticsInfo> {
    let root = diagnostics_root()?;
    Some(DiagnosticsInfo {
        root: root.to_string_lossy().to_string(),
        logs: root.join("Logs").to_string_lossy().to_string(),
        crash_reports: root.join("CrashReports").to_string_lossy().to_string(),
        panic_reports: root.join("PanicReports").to_string_lossy().to_string(),
        app_events: root.join("AppEvents").to_string_lossy().to_string(),
        exports: root.join("Exports").to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_root_is_under_localappdata() {
        let root = diagnostics_root().expect("diagnostics root should resolve");
        let s = root.to_string_lossy();
        assert!(
            s.contains("BlurAutoClicker"),
            "root should contain BlurAutoClicker: {s}"
        );
        assert!(
            s.contains("Diagnostics"),
            "root should contain Diagnostics: {s}"
        );
    }

    #[test]
    fn subdirectories_are_stable() {
        let root = diagnostics_root().unwrap();
        assert_eq!(logs_dir().unwrap(), root.join("Logs"));
        assert_eq!(crash_reports_dir().unwrap(), root.join("CrashReports"));
        assert_eq!(panic_reports_dir().unwrap(), root.join("PanicReports"));
        assert_eq!(app_events_dir().unwrap(), root.join("AppEvents"));
        assert_eq!(exports_dir().unwrap(), root.join("Exports"));
    }

    #[test]
    fn portable_layout_resolves_single_level() {
        let exe_dir = std::path::Path::new("apps").join("Blur");
        let data = crate::portable::portable_data_dir_of(&exe_dir);
        assert_eq!(diagnostics_root_of(&data), exe_dir.join("Data/Diagnostics"));
    }

    fn with_test_dir(f: impl FnOnce()) {
        let temp = tempfile::tempdir().expect("tempdir");
        TEST_DATA_DIR.with(|d| {
            *d.borrow_mut() = Some(temp.path().join("BlurAutoClicker"));
        });
        f();
        TEST_DATA_DIR.with(|d| {
            *d.borrow_mut() = None;
        });
        drop(temp);
    }

    #[test]
    fn ensure_diagnostics_dirs_creates_all() {
        with_test_dir(|| {
            ensure_diagnostics_dirs().expect("ensure_diagnostics_dirs should succeed");
            let root = diagnostics_root().unwrap();
            assert!(root.join("Logs").exists());
            assert!(root.join("CrashReports").exists());
            assert!(root.join("PanicReports").exists());
            assert!(root.join("AppEvents").exists());
            assert!(root.join("Exports").exists());
        });
    }

    #[test]
    fn write_panic_report_creates_file() {
        with_test_dir(|| {
            write_panic_report("test panic content for unit test");
            let dir = panic_reports_dir().unwrap();
            let mut found = false;
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let s = name.to_string_lossy();
                    if s.starts_with("panic_") && s.ends_with(".txt") {
                        let content = std::fs::read_to_string(entry.path()).unwrap_or_default();
                        if content.contains("test panic content for unit test") {
                            found = true;
                        }
                    }
                }
            }
            assert!(
                found,
                "write_panic_report should create a file in PanicReports"
            );
        });
    }

    #[test]
    fn diagnostics_info_contains_all_fields() {
        let info = get_diagnostics_info().expect("diagnostics info should resolve");
        assert!(!info.root.is_empty());
        assert!(!info.logs.is_empty());
        assert!(!info.crash_reports.is_empty());
        assert!(!info.panic_reports.is_empty());
        assert!(!info.app_events.is_empty());
        assert!(!info.exports.is_empty());
        assert!(info.logs.contains("Logs"));
        assert!(info.crash_reports.contains("CrashReports"));
        assert!(info.panic_reports.contains("PanicReports"));
        assert!(info.app_events.contains("AppEvents"));
        assert!(info.exports.contains("Exports"));
    }

    #[test]
    fn diagnostics_info_serializes_camel_case() {
        let info = get_diagnostics_info().unwrap();
        let json = serde_json::to_string(&info).unwrap();
        assert!(
            json.contains("\"panicReports\""),
            "should be camelCase: {json}"
        );
        assert!(
            json.contains("\"crashReports\""),
            "should be camelCase: {json}"
        );
        assert!(
            json.contains("\"appEvents\""),
            "should be camelCase: {json}"
        );
    }
}
