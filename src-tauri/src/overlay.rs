/// Linux stub: overlay is skipped on Linux where native hooks aren't easily available.
/// The Tauri overlay HTML window still renders, but we skip the Win32 hook setup.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

static LAST_ZONE_SHOW: Mutex<Option<Instant>> = Mutex::new(None);
static SEQUENCE_PICK_OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
static CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static OVERLAY_THREAD_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(true);

pub fn init_overlay(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;

    log::info!("[Overlay] Linux mode: overlay window created but native hooks disabled");

    // Make overlay click-through via CSS
    let _ = window.eval("document.body.style.pointerEvents = 'none';");

    window.hide().map_err(|e| e.to_string())
}

pub fn check_auto_hide(app: &AppHandle) {
    let running = app
        .state::<crate::ClickerState>()
        .running
        .load(Ordering::SeqCst);

    if !running {
        if let Some(window) = app.get_webview_window("overlay") {
            if window.is_visible().unwrap_or(false) {
                let mut last = LAST_ZONE_SHOW.lock().unwrap();
                if let Some(time) = *last {
                    if time.elapsed().as_secs() > 10 {
                        let _ = window.hide();
                        *last = None;
                    }
                }
            }
        }
    }
}

pub fn show_overlay_inner(app: &AppHandle, _zone: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        if !window.is_visible().unwrap_or(false) {
            window.show().map_err(|e| e.to_string())?;
        }
        *LAST_ZONE_SHOW.lock().unwrap() = Some(Instant::now());
    }
    Ok(())
}

pub fn show_overlay(app: &AppHandle) -> Result<(), String> {
    show_overlay_inner(app, String::from("zone"))
}

pub fn show_sequence_points_overlay(app: &AppHandle) -> Result<(), String> {
    show_overlay_inner(app, String::from("sequence"))
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}