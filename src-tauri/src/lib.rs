mod settings;
use settings::ClickerSettings;
mod app_state;
mod engine;
mod hotkeys;
mod overlay;
mod ui_commands;
mod updates;

use crate::app_state::ClickerState;
use crate::app_state::ClickerStatusPayload;
use crate::engine::worker::emit_status;
use crate::hotkeys::register_hotkey_inner;
use crate::hotkeys::start_hotkey_listener;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
const STATUS_EVENT: &str = "clicker-status";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ClickerState {
            running: Arc::new(AtomicBool::new(false)),
            run_generation: AtomicU64::new(0),
            settings: Mutex::new(ClickerSettings::default()),
            last_error: Mutex::new(None),
            stop_reason: Mutex::new(None),
            registered_hotkey: Mutex::new(None),
            suppress_hotkey_until_ms: AtomicU64::new(0),
            suppress_hotkey_until_release: AtomicBool::new(false),
            hotkey_capture_active: AtomicBool::new(false),
            settings_initialized: AtomicBool::new(false),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }

            let auto_hide_handle = app.handle().clone();
            std::thread::spawn(move || {
                while crate::overlay::OVERLAY_THREAD_RUNNING
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    overlay::check_auto_hide(&auto_hide_handle);
                }
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match updates::update_checker::check_for_updates(handle.clone()).await {
                    Ok(Some(result)) => {
                        if result.update_available {
                            log::info!(
                                "[Updates] Update available: {} → {}",
                                result.current_version,
                                result.latest_version
                            );
                            let _ = handle.emit("update-available", &result);
                        } else {
                            log::info!("[Updates] App is up to date (v{})", result.current_version);
                        }
                    }
                    Ok(None) => log::info!("[Updates] Check returned none"),
                    Err(e) => log::info!("[Updates] Check failed: {}", e),
                }
            });

            let initial_hotkey = {
                let state = app.state::<ClickerState>();
                let hotkey = state.settings.lock().unwrap().hotkey.clone();
                hotkey
            };

            let handle = app.handle().clone();
            start_hotkey_listener(handle.clone());
            hotkeys::start_scroll_hook();
            register_hotkey_inner(&handle, initial_hotkey).map_err(std::io::Error::other)?;
            emit_status(&handle);
            overlay::init_overlay(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ui_commands::set_webview_zoom,
            ui_commands::get_text_scale_factor,
            ui_commands::start_clicker,
            ui_commands::stop_clicker,
            ui_commands::toggle_clicker,
            ui_commands::update_settings,
            ui_commands::get_settings,
            ui_commands::reset_settings,
            ui_commands::get_status,
            ui_commands::register_hotkey,
            ui_commands::set_hotkey_capture_active,
            ui_commands::pick_position,
            ui_commands::get_app_info,
            ui_commands::get_stats,
            ui_commands::reset_stats,
            updates::update_checker::check_for_updates,
            overlay::hide_overlay,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { .. },
                label,
                ..
            } = &event
            {
                if label == "main" {
                    crate::overlay::OVERLAY_THREAD_RUNNING
                        .store(false, std::sync::atomic::Ordering::SeqCst);
                    if let Some(overlay) = app_handle.get_webview_window("overlay") {
                        let _ = overlay.destroy();
                    }
                }
            }
            if let tauri::RunEvent::ExitRequested { .. } = &event {
                crate::overlay::OVERLAY_THREAD_RUNNING
                    .store(false, std::sync::atomic::Ordering::SeqCst);
                if let Some(overlay) = app_handle.get_webview_window("overlay") {
                    let _ = overlay.destroy();
                }
            }
        });
}
