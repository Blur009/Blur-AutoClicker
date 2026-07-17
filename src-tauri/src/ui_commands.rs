use std::sync::atomic::Ordering;
use tauri::Manager;

use tauri::AppHandle;

use crate::app_state::AppInfoPayload;
use crate::app_state::PositionPayload;
use crate::engine::stats::CumulativeStats;
use crate::error::poisoned_inner;
use crate::error::AppError;
use crate::error::AppResult;
use crate::settings::ClickerSettings;
use crate::ClickerState;
use crate::ClickerStatusPayload;

use crate::engine::mouse::current_cursor_position;
use crate::engine::worker::current_status;
use crate::engine::worker::emit_status;
use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::hotkeys::register_hotkey_inner;

#[tauri::command]
pub fn get_text_scale_factor() -> f64 {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu.open_subkey(r"Software\Microsoft\Accessibility").ok();

        if let Some(key) = key {
            let value: u32 = key.get_value("TextScaleFactor").unwrap_or(100);
            return value as f64 / 100.0;
        }
    }

    1.0
}

#[tauri::command]
pub fn set_webview_zoom(window: tauri::WebviewWindow, factor: f64) -> AppResult<()> {
    window.set_zoom(factor)?;
    Ok(())
}

#[tauri::command]
pub fn start_clicker(app: AppHandle) -> AppResult<ClickerStatusPayload> {
    start_clicker_inner(&app)
}

#[tauri::command]
pub fn stop_clicker(app: AppHandle) -> AppResult<ClickerStatusPayload> {
    stop_clicker_inner(&app, Some(String::from("Stopped for hotkey input")))
}

#[tauri::command]
pub fn toggle_clicker(app: AppHandle) -> AppResult<ClickerStatusPayload> {
    let state = app.state::<ClickerState>();
    if state.running.load(Ordering::SeqCst) {
        stop_clicker_inner(&app, Some(String::from("Stopped from toggle")))
    } else {
        start_clicker_inner(&app)
    }
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: ClickerSettings) -> AppResult<ClickerSettings> {
    let state = app.state::<ClickerState>();
    let was_initialized = state.settings_initialized.load(Ordering::SeqCst);
    let zone_changed: bool;
    let click_points_changed: bool;
    {
        let mut old = state.settings.lock().unwrap_or_else(poisoned_inner);
        zone_changed = old.edge_stop_enabled != settings.edge_stop_enabled
            || old.edge_stop_top != settings.edge_stop_top
            || old.edge_stop_right != settings.edge_stop_right
            || old.edge_stop_bottom != settings.edge_stop_bottom
            || old.edge_stop_left != settings.edge_stop_left
            || old.corner_stop_enabled != settings.corner_stop_enabled
            || old.corner_stop_tl != settings.corner_stop_tl
            || old.corner_stop_tr != settings.corner_stop_tr
            || old.corner_stop_bl != settings.corner_stop_bl
            || old.corner_stop_br != settings.corner_stop_br
            || old.stop_zones_enabled != settings.stop_zones_enabled
            || old.stop_zones != settings.stop_zones;
        click_points_changed = old.click_points_enabled != settings.click_points_enabled
            || old.click_points != settings.click_points;
        *old = settings.clone();
    }
    *state.warning.lock().unwrap_or_else(poisoned_inner) = None;

    if !was_initialized {
        state.settings_initialized.store(true, Ordering::SeqCst);
        log::info!("[Settings] First update_settings — initialized, skipping overlay");
        return Ok(settings);
    }

    if zone_changed {
        let _ = crate::overlay::show_overlay(&app);
    }
    if click_points_changed && settings.click_points_enabled {
        let _ = crate::overlay::show_click_points_overlay(&app);
    }

    Ok(settings)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppResult<ClickerSettings> {
    let state = app.state::<ClickerState>();
    let settings = state.settings.lock().unwrap_or_else(poisoned_inner).clone();
    Ok(settings)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle) -> AppResult<ClickerSettings> {
    let defaults = ClickerSettings::default();
    {
        let state = app.state::<ClickerState>();
        *state.settings.lock().unwrap_or_else(poisoned_inner) = defaults.clone();
    }
    register_hotkey_inner(&app, defaults.hotkey.clone())?;
    Ok(defaults)
}

#[tauri::command]
pub fn get_status(app: AppHandle) -> AppResult<ClickerStatusPayload> {
    Ok(current_status(&app))
}

#[tauri::command]
pub fn register_hotkey(app: AppHandle, hotkey: String) -> AppResult<String> {
    register_hotkey_inner(&app, hotkey)
}

#[tauri::command]
pub fn set_hotkey_capture_active(app: AppHandle, active: bool) -> AppResult<()> {
    let state = app.state::<ClickerState>();
    state.hotkey_capture_active.store(active, Ordering::SeqCst);

    if active {
        state
            .suppress_hotkey_until_ms
            .store(now_epoch_ms().saturating_add(250), Ordering::SeqCst);
    } else {
        state
            .suppress_hotkey_until_release
            .store(true, Ordering::SeqCst);
        *state.warning.lock().unwrap_or_else(poisoned_inner) = None;
        *state.stop_reason.lock().unwrap_or_else(poisoned_inner) = None;
        emit_status(&app);
    }

    Ok(())
}

#[tauri::command]
pub fn pick_position() -> AppResult<PositionPayload> {
    let (x, y) = current_cursor_position()
        .ok_or_else(|| AppError::State("Failed to read cursor position".into()))?;
    Ok(PositionPayload { x, y })
}

#[tauri::command]
pub fn start_click_point_pick(app: AppHandle) -> AppResult<()> {
    crate::click_point_picker::start_click_point_pick_inner(app)
}

#[tauri::command]
pub fn cancel_click_point_pick(app: AppHandle) -> AppResult<()> {
    crate::click_point_picker::cancel_click_point_pick_inner(&app);
    Ok(())
}

#[tauri::command]
pub fn start_custom_stop_zone_pick(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::start_custom_stop_zone_pick_inner(app)
}

#[tauri::command]
pub fn cancel_custom_stop_zone_pick(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(&app);
    Ok(())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppResult<AppInfoPayload> {
    let version = app.package_info().version.to_string();
    Ok(AppInfoPayload {
        version,
        update_status: String::from("Update checks are disabled in development"),
        screenshot_protection_supported: false,
    })
}

#[tauri::command]
pub fn get_stats() -> AppResult<CumulativeStats> {
    crate::engine::stats::get_stats()
}

#[tauri::command]
pub fn reset_stats() -> AppResult<CumulativeStats> {
    crate::engine::stats::reset_stats()
}

#[tauri::command]
pub fn get_autostart_enabled() -> bool {
    crate::autostart::get_autostart_enabled()
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> AppResult<()> {
    crate::autostart::set_autostart_enabled(enabled)?;
    Ok(())
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> AppResult<()> {
    crate::window_lifecycle::on_hide(&app);
    if let Some(window) = app.get_webview_window("main") {
        window.hide()?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::overlay::OVERLAY_THREAD_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
pub fn list_processes() -> AppResult<Vec<crate::engine::process::ProcessInfo>> {
    Ok(crate::engine::process::list_running_processes())
}

#[tauri::command]
pub fn was_autostart_launch() -> bool {
    std::env::args().any(|a| a == "--autostart")
}

#[tauri::command]
pub fn get_diagnostics_info() -> AppResult<crate::diagnostics::DiagnosticsInfo> {
    crate::diagnostics::get_diagnostics_info()
        .ok_or_else(|| AppError::State("Failed to resolve diagnostics info".into()))
}

#[tauri::command]
pub fn open_diagnostics_folder() -> AppResult<()> {
    let path = crate::diagnostics::diagnostics_root()
        .ok_or_else(|| AppError::State("Failed to resolve diagnostics root".into()))?;
    open::that(&path)?;
    Ok(())
}

#[tauri::command]
pub fn export_diagnostics_bundle() -> AppResult<String> {
    use std::io::Write;

    let exports_dir = crate::diagnostics::exports_dir()
        .ok_or_else(|| AppError::State("Failed to resolve exports path".into()))?;
    std::fs::create_dir_all(&exports_dir)?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let zip_path = exports_dir.join(format!("BlurAutoClicker-diagnostics-{ts}.zip"));

    let file = std::fs::File::create(&zip_path)?;
    let mut zip_writer = zip::ZipWriter::new(file);

    let root = crate::diagnostics::diagnostics_root()
        .ok_or_else(|| AppError::State("Failed to resolve diagnostics root".into()))?;

    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with("Exports"))
    {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                log::warn!("[Diagnostics] Skipping unreadable entry in export: {e}");
                continue;
            }
        };
        if entry.file_type().is_dir() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| AppError::Io(std::io::Error::other(e)))?;
        let name = relative.to_string_lossy().replace('\\', "/");
        let data = std::fs::read(entry.path())?;
        zip_writer
            .start_file(
                name,
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated),
            )
            .map_err(|e| AppError::Io(std::io::Error::other(e)))?;
        zip_writer.write_all(&data)?;
    }

    zip_writer
        .finish()
        .map_err(|e| AppError::Io(std::io::Error::other(e)))?;

    let mut entries: Vec<_> = std::fs::read_dir(&exports_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".zip"))
        .collect();
    entries.sort_by_key(|e| e.file_name());
    while entries.len() > 5 {
        if let Some(oldest) = entries.first() {
            let _ = std::fs::remove_file(oldest.path());
            entries.remove(0);
        }
    }

    Ok(zip_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn debug_trigger_panic() -> AppResult<()> {
    #[cfg(debug_assertions)]
    {
        log::error!("[Diagnostics] Triggering intentional panic for panic hook test");
        panic!("Intentional panic triggered for diagnostics verification");
    }
    #[cfg(not(debug_assertions))]
    {
        Err(AppError::State(
            "Panic trigger is only available in debug builds".into(),
        ))
    }
}

#[tauri::command]
pub fn debug_trigger_crash() -> AppResult<()> {
    #[cfg(debug_assertions)]
    {
        log::error!("[Diagnostics] Triggering intentional access violation for Crashpad test");
        unsafe {
            // Volatile write to null pointer produces an OS-level access violation.
            // Crashpad's out-of-process handler catches this and writes a minidump.
            // Safe to run — only the process terminates, not the system (at least that's the plan).

            let ptr: *mut u32 = std::ptr::null_mut();
            std::ptr::write_volatile(ptr, 42);
        }
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        Err(AppError::State(
            "Crash trigger is only available in debug builds".into(),
        ))
    }
}
