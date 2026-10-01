use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use tauri_plugin_log::fern;

const MAX_FILE_SIZE: u64 = 5_000_000;
const MAX_FILES: usize = 3;

pub static APP_EVENTS_SHUTDOWN: AtomicBool = AtomicBool::new(false);

pub fn create_app_events_target() -> fern::Dispatch {
    let (tx, rx) = mpsc::sync_channel::<String>(1024);

    std::thread::Builder::new()
        .name("app-events-writer".into())
        .spawn(move || {
            let dir = match crate::diagnostics::app_events_dir() {
                Some(d) => d,
                None => return,
            };
            let _ = std::fs::create_dir_all(&dir);

            let mut writer: Option<BufWriter<std::fs::File>> = None;
            let mut current_size = 0u64;

            for record_str in rx {
                if APP_EVENTS_SHUTDOWN.load(Ordering::SeqCst) {
                    break;
                }

                let record_len = record_str.len() as u64 + 1;
                if writer.is_none() || current_size.saturating_add(record_len) > MAX_FILE_SIZE {
                    if let Some(mut current) = writer.take() {
                        let _ = current.flush();
                    }
                    writer = create_telemetry_writer(&dir);
                    rotate_telemetry_files(&dir);
                    current_size = 0;
                }

                if let Some(current) = writer.as_mut() {
                    if writeln!(current, "{record_str}").is_ok() {
                        current_size = current_size.saturating_add(record_len);
                        let _ = current.flush();
                    }
                }
            }

            if let Some(mut current) = writer {
                let _ = current.flush();
            }
            rotate_telemetry_files(&dir);
        })
        .expect("failed to spawn telemetry writer thread");

    fern::Dispatch::new()
        .filter(telemetry_filter)
        .chain(fern::Output::call(move |record| {
            let json = serde_json::json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "level": record.level().to_string(),
                "target": record.target(),
                "message": record.args().to_string(),
            });
            let _ = tx.try_send(json.to_string());
        }))
}

fn create_telemetry_writer(dir: &std::path::Path) -> Option<BufWriter<std::fs::File>> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    for suffix in 0..16u8 {
        let path = dir.join(format!("events_{timestamp}_{suffix}.jsonl"));
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path);
        if let Ok(file) = file {
            return Some(BufWriter::new(file));
        }
    }

    None
}

fn telemetry_filter(metadata: &log::Metadata) -> bool {
    let target = metadata.target();
    (target.starts_with("blur_autoclicker")
        || target.starts_with("app_lib")
        || target.starts_with("BlurAutoClicker"))
        && metadata.level() <= log::Level::Warn
}

fn rotate_telemetry_files(dir: &std::path::Path) {
    let mut files: Vec<_> = match std::fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".jsonl"))
            .collect(),
        Err(_) => return,
    };
    files.sort_by_key(|e| {
        (
            e.metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(std::time::UNIX_EPOCH),
            e.file_name(),
        )
    });
    while files.len() > MAX_FILES {
        if let Some(oldest) = files.first() {
            let _ = std::fs::remove_file(oldest.path());
            files.remove(0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_accepts_blur_autoclicker_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Warn)
            .target("blur_autoclicker")
            .build();
        assert!(telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_accepts_app_lib_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Warn)
            .target("app_lib")
            .build();
        assert!(telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_accepts_blur_autoclicker_case_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Warn)
            .target("BlurAutoClicker")
            .build();
        assert!(telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_rejects_third_party_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Warn)
            .target("tauri_plugin::something")
            .build();
        assert!(!telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_rejects_info_level_for_app_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Info)
            .target("blur_autoclicker")
            .build();
        assert!(!telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_accepts_error_level_for_app_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Error)
            .target("blur_autoclicker")
            .build();
        assert!(telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_accepts_warn_level_for_app_target() {
        let record = log::Record::builder()
            .args(format_args!("test"))
            .level(log::Level::Warn)
            .target("blur_autoclicker")
            .build();
        assert!(telemetry_filter(record.metadata()));
    }

    #[test]
    fn filter_rejects_arbitrary_target_at_any_level() {
        for level in &[
            log::Level::Error,
            log::Level::Warn,
            log::Level::Info,
            log::Level::Debug,
            log::Level::Trace,
        ] {
            let record = log::Record::builder()
                .args(format_args!("test"))
                .level(*level)
                .target("some_random_crate")
                .build();
            assert!(!telemetry_filter(record.metadata()));
        }
    }

    #[test]
    fn rotate_keeps_max_files() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();

        for i in 0..5 {
            let path = dir.join(format!("old_events_{i}.jsonl"));
            std::fs::write(&path, "test").unwrap();
        }

        rotate_telemetry_files(dir);

        let remaining: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".jsonl"))
            .collect();
        assert_eq!(remaining.len(), MAX_FILES);
    }

    #[test]
    fn rotation_preserves_new_logs_when_legacy_names_sort_after_them() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        for i in 0..MAX_FILES {
            let path = dir.join(format!("events_999999999{i}.jsonl"));
            let mut file = std::fs::File::create(path).unwrap();
            writeln!(file, "legacy").unwrap();
            file.set_times(std::fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
                .unwrap();
        }
        let current = dir.join("events_1000000000000000000_0.jsonl");
        std::fs::write(&current, "current").unwrap();

        rotate_telemetry_files(dir);

        assert_eq!(std::fs::read_to_string(current).unwrap(), "current");
        assert_eq!(std::fs::read_dir(dir).unwrap().count(), MAX_FILES);
    }

    #[test]
    fn consecutive_writers_preserve_both_records() {
        let temp = tempfile::tempdir().unwrap();
        for message in ["first", "second"] {
            let mut writer = create_telemetry_writer(temp.path()).unwrap();
            writeln!(writer, "{message}").unwrap();
            writer.flush().unwrap();
        }
        let mut contents: Vec<_> = std::fs::read_dir(temp.path())
            .unwrap()
            .map(|entry| std::fs::read_to_string(entry.unwrap().path()).unwrap())
            .collect();
        contents.sort();
        assert_eq!(contents, ["first\n", "second\n"]);
    }
}
