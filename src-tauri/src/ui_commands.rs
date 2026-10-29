use std::sync::atomic::Ordering;
use tauri::Emitter;
use tauri::Manager;

use tauri::AppHandle;

use crate::app_state::AppInfoPayload;
use crate::app_state::PositionPayload;
use crate::engine::stats::{CumulativeStats, StatsOverview};
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
use crate::engine::worker::start_clicker_from_start_zone;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::hotkeys::register_hotkey_inner;
use crate::hotkeys::register_master_inner;

#[tauri::command]
pub fn get_elevation_state() -> crate::elevation::ElevationState {
    crate::elevation::state()
}

#[tauri::command]
pub fn relaunch_as_admin(app: AppHandle) -> bool {
    let state = crate::elevation::state();
    if state.elevated || !state.can_elevate {
        return false;
    }
    let clicker = app.state::<ClickerState>();
    let was_running = clicker.running.load(Ordering::SeqCst);
    let zone_started = clicker.zone_started_generation.load(Ordering::SeqCst) != 0;
    if was_running || clicker.engine_busy.load(Ordering::SeqCst) {
        let _ = stop_clicker_inner(&app, Some(String::from("Restarting as administrator")));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while clicker.engine_busy.load(Ordering::SeqCst) && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
    if !crate::elevation::relaunch_elevated() {
        if was_running {
            let resumed = if zone_started {
                start_clicker_from_start_zone(&app)
            } else {
                start_clicker_inner(&app)
            };
            if let Err(error) = resumed {
                log::warn!(
                    "[Elevation] Could not resume clicking after a refused restart: {error}"
                );
            }
        }
        return false;
    }
    true
}

#[tauri::command]
pub fn set_elevation_notice_enabled(app: AppHandle, enabled: bool) {
    let state = app.state::<ClickerState>();
    let previous = state
        .elevation_notice_enabled
        .swap(enabled, Ordering::SeqCst);
    if previous != enabled {
        state
            .elevation_prompt_generation
            .fetch_add(1, Ordering::SeqCst);
    }
    if !enabled {
        let cleared = state
            .elevation_blocked_window
            .lock()
            .unwrap_or_else(poisoned_inner)
            .take();
        if cleared.is_some() {
            emit_status(&app);
        }
    }
}

#[tauri::command]
pub fn clear_elevation_blocked(app: AppHandle) {
    let state = app.state::<ClickerState>();
    state
        .elevation_prompt_generation
        .fetch_add(1, Ordering::SeqCst);
    *state
        .elevation_blocked_window
        .lock()
        .unwrap_or_else(poisoned_inner) = None;
    emit_status(&app);
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        #[cfg(target_os = "windows")]
        crate::force_foreground(&window);
    }
    Ok(())
}

#[tauri::command]
pub fn list_font_families() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        enumerate_font_families()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn enumerate_font_families() -> Vec<String> {
    use std::collections::HashSet;
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };

    unsafe extern "system" fn collect(
        logfont: *const LOGFONTW,
        _metric: *const TEXTMETRICW,
        _font_type: u32,
        lparam: LPARAM,
    ) -> i32 {
        let names = &mut *(lparam as *mut HashSet<String>);
        let wide = &(*logfont).lfFaceName;
        let end = wide
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(wide.len());
        let name = String::from_utf16_lossy(&wide[..end]);
        if !name.is_empty() && !name.starts_with('@') {
            names.insert(name);
        }
        1
    }

    let mut names: HashSet<String> = HashSet::new();
    unsafe {
        let hdc = GetDC(std::ptr::null_mut());
        if hdc.is_null() {
            return Vec::new();
        }
        let mut logfont: LOGFONTW = std::mem::zeroed();
        logfont.lfCharSet = DEFAULT_CHARSET;
        EnumFontFamiliesExW(
            hdc,
            &logfont,
            Some(collect),
            &mut names as *mut _ as LPARAM,
            0,
        );
        ReleaseDC(std::ptr::null_mut(), hdc);
    }

    let mut families: Vec<String> = names.into_iter().collect();
    families.sort_by_key(|name| name.to_lowercase());
    families
}

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
pub fn update_settings(
    app: AppHandle,
    mut settings: ClickerSettings,
) -> AppResult<ClickerSettings> {
    // The payload is not trusted. `sanitizeSettings` on the frontend is the only
    // thing bounding these values today, and a direct `invoke` walks around it.
    settings.sanitize();
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
    crate::app_state::clear_transient_warning(&state.warning);
    crate::sync_indicator_config(&app);
    if !was_initialized {
        state.settings_initialized.store(true, Ordering::SeqCst);
        log::info!("[Settings] First update_settings — initialized, skipping overlay");
        return Ok(settings);
    }

    if !zone_changed && !click_points_changed {
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
    crate::sync_indicator_config(&app);
    register_hotkey_inner(&app, defaults.hotkey.clone())?;
    Ok(defaults)
}

#[tauri::command]
pub fn register_master(app: AppHandle, hotkey: String, hold_mode: bool) -> AppResult<()> {
    register_master_inner(&app, hotkey, hold_mode)
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
pub async fn cancel_click_point_pick(app: AppHandle) -> AppResult<()> {
    crate::click_point_picker::cancel_click_point_pick_inner(&app);
    Ok(())
}

#[tauri::command]
pub fn start_custom_stop_zone_pick(app: AppHandle) -> AppResult<()> {
    crate::custom_stop_zone_picker::start_custom_stop_zone_pick_inner(app)
}

#[tauri::command]
pub async fn cancel_custom_stop_zone_pick(app: AppHandle) -> AppResult<()> {
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
        portable: crate::portable::is_portable(),
    })
}

fn settings_file_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    if crate::portable::is_portable() {
        if let Some(dir) = crate::portable::data_dir() {
            return Ok(dir.join("settings.json"));
        }
    }

    app.path()
        .app_data_dir()
        .map(|dir| dir.join("settings.json"))
        .map_err(|err| AppError::State(format!("app data directory unavailable: {err}")))
}

fn backup_unparseable_settings_file(path: &std::path::Path) -> AppResult<Option<String>> {
    if !path.is_file() {
        return Ok(None);
    }

    let bytes = std::fs::read(path)?;
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Ok(None);
    }

    if matches!(
        serde_json::from_slice::<serde_json::Value>(&bytes),
        Ok(serde_json::Value::Object(_))
    ) {
        return Ok(None);
    }

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup = path.with_file_name(format!("settings.recovered-{stamp}.json"));
    std::fs::copy(path, &backup)?;
    Ok(Some(backup.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn backup_unreadable_settings(app: AppHandle) -> AppResult<Option<String>> {
    let path = settings_file_path(&app)?;
    backup_unparseable_settings_file(&path)
}

#[tauri::command]
pub fn allow_local_media(app: AppHandle, path: String) -> AppResult<()> {
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|err| AppError::InvalidSetting(format!("local media path rejected: {err}")))
}

#[tauri::command]
pub fn export_preset_file(path: String, preset: serde_json::Value) -> AppResult<()> {
    let payload = serde_json::json!({
        "type": "blur-autoclicker-preset",
        "version": 1,
        "preset": preset,
    });
    let body = serde_json::to_string_pretty(&payload)
        .map_err(|err| AppError::InvalidSetting(format!("preset could not be written: {err}")))?;
    std::fs::write(&path, body)?;
    Ok(())
}

#[tauri::command]
pub fn import_preset_file(path: String) -> AppResult<serde_json::Value> {
    let body = std::fs::read_to_string(&path)?;
    serde_json::from_str(&body)
        .map_err(|err| AppError::InvalidSetting(format!("preset file could not be parsed: {err}")))
}

fn record_settings_recovery_notice(warning: Option<String>) {
    crate::app_state::set_recovery_notice(warning);
}

#[tauri::command]
pub fn set_settings_warning(app: AppHandle, warning: Option<String>) {
    record_settings_recovery_notice(warning);
    emit_status(&app);
}

#[tauri::command]
pub fn get_portable_info() -> crate::app_state::PortableInfo {
    crate::app_state::PortableInfo {
        portable: crate::portable::is_portable(),
        data_dir: crate::portable::data_dir().map(|p| p.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub fn get_stats() -> AppResult<CumulativeStats> {
    crate::engine::stats::get_stats()
}

#[tauri::command]
pub fn get_stats_overview() -> AppResult<StatsOverview> {
    crate::engine::stats::get_overview()
}

#[tauri::command]
pub fn reset_stats(app: AppHandle) -> AppResult<CumulativeStats> {
    let stats = crate::engine::stats::reset_stats()?;
    if let Err(e) = app.emit("stats-updated", stats.clone()) {
        log::warn!("[stats] Failed to emit stats-updated after reset: {e}");
    }
    Ok(stats)
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
    if !crate::TRAY_AVAILABLE.load(Ordering::SeqCst) {
        log::warn!("[Window] No tray icon available, quitting instead of hiding");
        app.exit(0);
        return Ok(());
    }

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
    std::env::args().any(|a| a == "--autostart") && crate::TRAY_AVAILABLE.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn prepare_main_window(app: AppHandle) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    if let Some(window) = app.get_webview_window("main") {
        crate::apply_ws_ex_noactivate(&window, false);
    }
    Ok(())
}

#[tauri::command]
pub fn report_startup_ready(visible: bool, frontend_boot_ms: u64, boot_phases: String) {
    crate::startup::report_ui_ready(visible, frontend_boot_ms, &boot_phases);
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

fn is_already_compressed(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "zip"
            | "gz"
            | "bz2"
            | "xz"
            | "zst"
            | "7z"
            | "rar"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "ico"
            | "mp4"
            | "webm"
            | "mp3"
            | "ogg"
    )
}

#[tauri::command]
pub fn export_diagnostics_bundle() -> AppResult<String> {
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
        let stored = is_already_compressed(&name);
        let options = zip::write::SimpleFileOptions::default().compression_method(if stored {
            zip::CompressionMethod::Stored
        } else {
            zip::CompressionMethod::Deflated
        });
        let options = if stored {
            options
        } else {
            options.compression_level(Some(1))
        };
        zip_writer
            .start_file(name, options)
            .map_err(|e| AppError::Io(std::io::Error::other(e)))?;
        let file = std::fs::File::open(entry.path())?;
        let mut reader = std::io::BufReader::with_capacity(64 * 1024, file);
        std::io::copy(&mut reader, &mut zip_writer)?;
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

/// `compute_tinted` reads six hex digits after an optional `#`. Reject anything
/// else here so a bad colour never reaches the icon pipeline or the state it
/// keeps for later redraws.
fn is_hex_color(value: &str) -> bool {
    let digits = value.strip_prefix('#').unwrap_or(value);
    digits.len() == 6 && digits.bytes().all(|b| b.is_ascii_hexdigit())
}

#[tauri::command]
pub fn set_accent_color(
    app: AppHandle,
    color: String,
    theme: String,
    icon_enabled: bool,
    icon_theme: String,
    icon_color: String,
) -> AppResult<()> {
    if !is_hex_color(&color) {
        return Err(AppError::InvalidSetting(format!(
            "accent colour '{color}' is not #RRGGBB"
        )));
    }
    let handle = app.clone();
    let closure_handle = handle.clone();
    let _ = handle.run_on_main_thread(move || {
        crate::icon::set_icon_theme(
            &closure_handle,
            &color,
            &theme,
            icon_enabled,
            &icon_theme,
            &icon_color,
        );
    });
    Ok(())
}

#[tauri::command]
pub fn get_indicator_config() -> crate::indicator::IndicatorStatus {
    crate::indicator::config_snapshot()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_notice_survives_a_settings_update() {
        let notice = String::from(
            "Settings could not be read and were reset. Your old file is saved as settings.recovered-20240101-120000.json.",
        );
        record_settings_recovery_notice(Some(notice.clone()));

        let warning =
            std::sync::Mutex::new(Some(String::from("Whitelist mode has no entries selected")));
        crate::app_state::clear_transient_warning(&warning);

        assert_eq!(
            crate::app_state::status_warning(warning.into_inner().unwrap_or_else(poisoned_inner)),
            Some(notice)
        );

        record_settings_recovery_notice(None);
    }

    fn write_settings(dir: &std::path::Path, body: &[u8]) -> std::path::PathBuf {
        let path = dir.join("settings.json");
        std::fs::write(&path, body).expect("write settings");
        path
    }

    fn recoveries(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
        std::fs::read_dir(dir)
            .expect("read dir")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("settings.recovered-"))
            })
            .collect()
    }

    #[test]
    fn valid_settings_are_not_backed_up() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = write_settings(temp.path(), br#"{"settings":{"cps":12}}"#);

        assert!(backup_unparseable_settings_file(&path)
            .expect("backup decision")
            .is_none());
        assert!(recoveries(temp.path()).is_empty());
    }

    #[test]
    fn unparseable_settings_are_copied_to_a_timestamped_backup() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = write_settings(temp.path(), br#"{"settings":{"cps":"#);

        let backup = backup_unparseable_settings_file(&path)
            .expect("backup decision")
            .expect("backup path");

        let backup = std::path::PathBuf::from(backup);
        assert!(backup.starts_with(temp.path()));
        assert_eq!(
            std::fs::read(&backup).expect("read backup"),
            std::fs::read(&path).expect("read settings")
        );
        assert_eq!(recoveries(temp.path()).len(), 1);
    }

    #[test]
    fn missing_settings_file_is_not_backed_up() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");

        assert!(backup_unparseable_settings_file(&path)
            .expect("backup decision")
            .is_none());
        assert!(recoveries(temp.path()).is_empty());
    }

    #[test]
    fn non_object_json_settings_are_copied_to_a_timestamped_backup() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = write_settings(temp.path(), br#"[{"cps":12}]"#);

        let backup = backup_unparseable_settings_file(&path)
            .expect("backup decision")
            .expect("backup path");

        let backup = std::path::PathBuf::from(backup);
        assert!(backup.starts_with(temp.path()));
        assert_eq!(
            std::fs::read(&backup).expect("read backup"),
            std::fs::read(&path).expect("read settings")
        );
        assert_eq!(recoveries(temp.path()).len(), 1);
    }

    #[test]
    fn empty_settings_file_is_not_backed_up() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = write_settings(temp.path(), b"");

        assert!(backup_unparseable_settings_file(&path)
            .expect("backup decision")
            .is_none());
        assert!(recoveries(temp.path()).is_empty());
    }
}
