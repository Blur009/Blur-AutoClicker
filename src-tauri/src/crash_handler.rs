#[cfg(feature = "crashpad")]
use std::path::PathBuf;
#[cfg(feature = "crashpad")]
use std::sync::Mutex;

#[cfg(feature = "crashpad")]
use crashpad_rs::CrashpadClient;

// Held in a static so the client is never dropped during abnormal termination
// (a drop during a crash can hang). The static is deliberately not dropped at
// process exit; graceful shutdown goes through `shutdown_crashpad()`.
#[cfg(feature = "crashpad")]
static CRASHPAD_CLIENT: Mutex<Option<CrashpadClient>> = Mutex::new(None);

#[cfg(feature = "crashpad")]
static CRASHPAD_INIT: Mutex<Option<std::thread::JoinHandle<()>>> = Mutex::new(None);

#[cfg(feature = "crashpad")]
pub fn initialize_crashpad() -> Result<(), Box<dyn std::error::Error>> {
    let client = crashpad_rs::CrashpadClient::new()?;

    let crash_database = crate::diagnostics::crash_reports_dir()
        .ok_or("Failed to resolve crash reports directory")?;
    std::fs::create_dir_all(&crash_database)?;

    let handler_path = resolve_handler_path()?;
    verify_handler_integrity(&handler_path)?;

    let config = crashpad_rs::CrashpadConfig::builder()
        .handler_path(&handler_path)
        .database_path(&crash_database)
        .build();

    client.start_with_config(&config, &std::collections::HashMap::new())?;
    log::info!(
        "[Crashpad] Initialized, crash reports directory: {}",
        crash_database.display()
    );

    let mut slot = CRASHPAD_CLIENT.lock().unwrap_or_else(|e| e.into_inner());
    *slot = Some(client);
    Ok(())
}

#[cfg(feature = "crashpad")]
pub fn initialize_crashpad_async() {
    let handle = std::thread::spawn(|| {
        if let Err(e) = initialize_crashpad() {
            log::warn!("[Crashpad] Failed to initialize: {e}");
        }
    });
    *CRASHPAD_INIT.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
}

#[cfg(feature = "crashpad")]
pub fn shutdown_crashpad() {
    if let Some(handle) = CRASHPAD_INIT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
    {
        let _ = handle.join();
    }
    let mut slot = CRASHPAD_CLIENT.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(client) = slot.take() {
        // Dropping the client calls crashpad_client_delete, which tells the
        // handler process to shut down. Without this the handler stays alive
        // as an orphan after the app exits.
        drop(client);
        log::info!("[Crashpad] Shut down.");
    }
}

#[cfg(feature = "crashpad")]
fn resolve_handler_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Some(path) = option_env!("CRASHPAD_HANDLER_PATH") {
        return Ok(PathBuf::from(path));
    }
    let exe_dir = std::env::current_exe()?
        .parent()
        .ok_or("Failed to get executable parent directory")?
        .to_path_buf();
    let bundled = exe_dir.join("crashpad_handler.exe");
    if bundled.exists() {
        return Ok(bundled);
    }
    let resource_dir = exe_dir.join("resources").join("crashpad_handler.exe");
    if resource_dir.exists() {
        return Ok(resource_dir);
    }
    Err("crashpad_handler.exe not found. Ensure the crashpad-rs 'prebuilt' feature is enabled or set CRASHPAD_HANDLER_PATH.".into())
}

#[cfg(feature = "crashpad")]
fn verify_handler_integrity(handler: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    let Some(pinned) = option_env!("CRASHPAD_HANDLER_SHA256") else {
        return Ok(());
    };
    let stamp_path = {
        let mut s = handler.as_os_str().to_owned();
        s.push(".verified");
        PathBuf::from(s)
    };
    let current_fp: Option<(u128, u64)> = std::fs::metadata(handler)
        .and_then(|m| m.modified().map(|t| (t, m.len())))
        .map(|(t, len)| {
            (
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0),
                len,
            )
        })
        .ok();
    if let Some((mtime_nanos, size)) = current_fp {
        if let Ok(stamp) = std::fs::read_to_string(&stamp_path) {
            let mut parts = stamp.split_ascii_whitespace();
            if let (Some(s_mtime), Some(s_size), Some(s_digest)) =
                (parts.next(), parts.next(), parts.next())
            {
                if s_mtime == mtime_nanos.to_string()
                    && s_size == size.to_string()
                    && s_digest.eq_ignore_ascii_case(pinned)
                {
                    return Ok(());
                }
            }
        }
    }
    let bytes = std::fs::read(handler)?;
    use sha2::Digest;
    let digest = hex::encode(sha2::Sha256::digest(&bytes));
    if !digest.eq_ignore_ascii_case(pinned) {
        return Err(format!("crashpad_handler.exe integrity check failed (expected {pinned}, got {digest}); refusing to spawn").into());
    }
    if let Some((mtime_nanos, size)) = current_fp {
        let contents = format!("{mtime_nanos} {size} {digest}");
        if std::fs::write(&stamp_path, contents).is_err() {
            let _ = std::fs::remove_file(&stamp_path);
        }
    }
    Ok(())
}

#[cfg(not(feature = "crashpad"))]
pub fn initialize_crashpad() -> Result<(), Box<dyn std::error::Error>> {
    log::warn!(
        "[Crashpad] Not available — compile with 'crashpad' feature for out-of-process crash dumps."
    );
    Ok(())
}

#[cfg(not(feature = "crashpad"))]
pub fn initialize_crashpad_async() {
    let _ = initialize_crashpad();
}

#[cfg(not(feature = "crashpad"))]
pub fn shutdown_crashpad() {}

#[cfg(test)]
mod tests {

    #[test]
    #[cfg(not(feature = "crashpad"))]
    fn crashpad_stub_returns_ok() {
        let result = super::initialize_crashpad();
        assert!(result.is_ok());
    }
}
