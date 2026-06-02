mod settings;
use settings::ClickerSettings;
mod app_state;
mod autostart;
mod custom_stop_zone_picker;
mod engine;
mod hotkeys;
mod overlay;
mod sequence_picker;
mod single_instance;
mod ui_commands;

// Logitech HID++ module
pub mod logitech;

use crate::app_state::ClickerState;
use crate::app_state::ClickerStatusPayload;
use crate::engine::worker::emit_status;
use crate::hotkeys::register_hotkey_inner;
use crate::hotkeys::start_hotkey_listener;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const STATUS_EVENT: &str = "clicker-status";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _single_instance_guard = match single_instance::acquire() {
        Some(guard) => guard,
        None => return,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(ClickerState {
            running: Arc::new(AtomicBool::new(false)),
            run_generation: AtomicU64::new(0),
            settings: Mutex::new(ClickerSettings::default()),
            last_error: Mutex::new(None),
            stop_reason: Mutex::new(None),
            active_sequence_index: AtomicI64::new(-1),
            active_sequence_tick: AtomicU64::new(0),
            registered_hotkey: Mutex::new(None),
            suppress_hotkey_until_ms: AtomicU64::new(0),
            suppress_hotkey_until_release: AtomicBool::new(false),
            hotkey_capture_active: AtomicBool::new(false),
            sequence_pick_active: AtomicBool::new(false),
            custom_stop_zone_pick_active: AtomicBool::new(false),
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

            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("BlurAutoClicker")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        crate::overlay::OVERLAY_THREAD_RUNNING
                            .store(false, std::sync::atomic::Ordering::SeqCst);
                        crate::sequence_picker::cancel_sequence_point_pick_inner(app);
                        crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let auto_hide_handle = app.handle().clone();
            std::thread::spawn(move || {
                while crate::overlay::OVERLAY_THREAD_RUNNING
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    overlay::check_auto_hide(&auto_hide_handle);
                }
            });

            // Update checks disabled on Linux

            let initial_hotkey = {
                let state = app.state::<ClickerState>();
                let hotkey = state.settings.lock().unwrap().hotkey.clone();
                hotkey
            };

            let handle = app.handle().clone();
            start_hotkey_listener(handle.clone());
            register_hotkey_inner(&handle, initial_hotkey).map_err(std::io::Error::other)?;
            emit_status(&handle);
            overlay::init_overlay(app.handle())?;

            if std::env::args().any(|a| a == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

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
            ui_commands::start_sequence_point_pick,
            ui_commands::cancel_sequence_point_pick,
            ui_commands::start_custom_stop_zone_pick,
            ui_commands::cancel_custom_stop_zone_pick,
            ui_commands::get_app_info,
            ui_commands::get_stats,
            ui_commands::reset_stats,
            overlay::hide_overlay,
            ui_commands::quit_app,
            ui_commands::get_autostart_enabled,
            ui_commands::set_autostart_enabled,
            // Logitech commands
            logitech::commands::scan_devices,
            logitech::commands::get_device_info,
            logitech::commands::set_dpi,
            logitech::commands::get_battery,
            logitech::commands::set_lighting,
            logitech::commands::set_report_rate,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                label,
                ..
            } = &event
            {
                if label == "main" {
                    api.prevent_close();
                    crate::overlay::OVERLAY_THREAD_RUNNING
                        .store(false, std::sync::atomic::Ordering::SeqCst);
                    crate::sequence_picker::cancel_sequence_point_pick_inner(app_handle);
                    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(app_handle);
                    app_handle.exit(0);
                }
            }
        });
}