#[cfg(feature = "crashpad")]
use std::path::PathBuf;

#[cfg(feature = "crashpad")]
pub fn initialize_crashpad() -> Result<(), Box<dyn std::error::Error>> {
    let client = crashpad_rs::CrashpadClient::new()?;

    let crash_database = crate::diagnostics::crash_reports_dir()
        .ok_or("Failed to resolve crash reports directory")?;
    std::fs::create_dir_all(&crash_database)?;

    let handler_path = resolve_handler_path()?;

    let config = crashpad_rs::CrashpadConfig::builder()
        .handler_path(&handler_path)
        .database_path(&crash_database)
        .build();

    client.start_with_config(&config, &std::collections::HashMap::new())?;
    log::info!(
        "[Crashpad] Initialized, crash reports directory: {}",
        crash_database.display()
    );
    std::mem::forget(client);
    Ok(())
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

#[cfg(not(feature = "crashpad"))]
pub fn initialize_crashpad() -> Result<(), Box<dyn std::error::Error>> {
    log::warn!(
        "[Crashpad] Not available — compile with 'crashpad' feature for out-of-process crash dumps."
    );
    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    #[cfg(not(feature = "crashpad"))]
    fn crashpad_stub_returns_ok() {
        let result = initialize_crashpad();
        assert!(result.is_ok());
    }
}
