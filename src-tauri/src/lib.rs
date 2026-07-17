mod crash_handler;
mod diagnostics;
mod error;
mod settings;
pub use settings::ClickerSettings;
mod app_events;
mod app_state;
mod autostart;
mod click_point_picker;
mod custom_stop_zone_picker;
mod engine;
mod hotkeys;
mod overlay;
mod ui_commands;
mod updates;
mod window_lifecycle;

pub use crate::app_state::ClickerState;
pub use crate::app_state::ClickerStatusPayload;
use crate::engine::worker::emit_status;
use crate::error::poisoned_inner;
use crate::hotkeys::register_hotkey_inner;
use crate::hotkeys::start_hotkey_listener;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager};

pub static ZONE_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

const STATUS_EVENT: &str = "clicker-status";

#[cfg(target_os = "windows")]
fn apply_ws_ex_noactivate(window: &tauri::WebviewWindow, enable: bool) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE,
    };

    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(w) = handle.as_raw() {
            let hwnd = w.hwnd.get() as *mut std::ffi::c_void;
            unsafe {
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
                let new_ex = if enable {
                    (ex as u32 | 0x08000000) as i32
                } else {
                    (ex as u32 & !0x08000000) as i32
                };
                SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex);
            }
        }
    }
}

fn is_rtss_running() -> bool {
    crate::engine::process::is_process_running("RTSS.exe")
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let msg = info.to_string();
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let backtrace = std::backtrace::Backtrace::force_capture();
        let report = format!("Panic: {msg}\nLocation: {location}\nBacktrace:\n{backtrace}");

        log::error!("[Crash] {report}");

        crate::diagnostics::write_panic_report(&report);

        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW;
            use windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR;
            let wide: Vec<u16> = "BlurAutoClicker encountered a fatal error and needs to close.\nPlease check the log for details.\n\n"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let title: Vec<u16> = "BlurAutoClicker - Fatal Error"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            MessageBoxW(
                std::ptr::null_mut(),
                wide.as_ptr(),
                title.as_ptr(),
                MB_ICONERROR,
            );
        }
    }));
}

fn setup_logging(app: &AppHandle) {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

    let _ = crate::diagnostics::ensure_diagnostics_dirs();

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Trace
    } else {
        log::LevelFilter::Info
    };
    let log_dir = crate::diagnostics::logs_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("BlurAutoClicker-logs"));
    let _ = app.plugin(
        tauri_plugin_log::Builder::default()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::Folder {
                    path: log_dir,
                    file_name: Some("session".to_string()),
                }),
                Target::new(TargetKind::Webview),
                Target::new(TargetKind::Dispatch(
                    crate::app_events::create_app_events_target(),
                )),
            ])
            .level(log_level)
            .level_for("tao", log::LevelFilter::Warn)
            .max_file_size(2_500_000)
            .rotation_strategy(RotationStrategy::KeepSome(1))
            .timezone_strategy(TimezoneStrategy::UseLocal)
            .build(),
    );
}

fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("BlurAutoClicker")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                crate::window_lifecycle::on_show(app);
                if let Some(window) = app.get_webview_window("main") {
                    #[cfg(target_os = "windows")]
                    apply_ws_ex_noactivate(&window, false);
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                crate::app_events::APP_EVENTS_SHUTDOWN
                    .store(true, std::sync::atomic::Ordering::SeqCst);
                crate::overlay::OVERLAY_THREAD_RUNNING
                    .store(false, std::sync::atomic::Ordering::SeqCst);
                crate::click_point_picker::cancel_click_point_pick_inner(app);
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
                crate::window_lifecycle::on_show(app);
                if let Some(window) = app.get_webview_window("main") {
                    #[cfg(target_os = "windows")]
                    apply_ws_ex_noactivate(&window, false);
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn spawn_overlay_auto_hide(app: &AppHandle) {
    let auto_hide_handle = app.clone();
    std::thread::spawn(move || {
        while crate::overlay::OVERLAY_THREAD_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_secs(1));
            overlay::check_auto_hide(&auto_hide_handle);
        }
    });
}

fn spawn_start_zone_monitor(app: &AppHandle) {
    let handle = app.clone();
    ZONE_MONITOR_RUNNING.store(true, std::sync::atomic::Ordering::SeqCst);
    std::thread::spawn(move || {
        let mut prev_in_start_zone = false;
        while ZONE_MONITOR_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(100));

            let state = handle.state::<ClickerState>();
            let settings = state.settings.lock().unwrap_or_else(poisoned_inner).clone();

            let has_start_zones = settings.stop_zones_enabled
                && settings.stop_zones.iter().any(|z| z.action == "start");
            if !has_start_zones {
                prev_in_start_zone = false;
                continue;
            }

            let cursor = match crate::engine::mouse::current_cursor_position() {
                Some(c) => c,
                None => continue,
            };

            let in_start_zone = settings.stop_zones.iter().any(|z| {
                z.action == "start"
                    && cursor.0 >= z.x
                    && cursor.0 < z.x + z.width
                    && cursor.1 >= z.y
                    && cursor.1 < z.y + z.height
            });

            let running = state.running.load(std::sync::atomic::Ordering::SeqCst);
            let zone_started = state
                .zone_started_clicker
                .load(std::sync::atomic::Ordering::SeqCst);

            // Transition: outside → inside, start clicker if off
            if in_start_zone && !prev_in_start_zone && !running {
                if let Err(e) = crate::engine::worker::start_clicker_inner(&handle) {
                    log::error!("[ZoneMonitor] start failed: {e}");
                } else {
                    state
                        .zone_started_clicker
                        .store(true, std::sync::atomic::Ordering::SeqCst);
                }
            }
            // Transition: inside → outside, stop clicker if we started it
            else if !in_start_zone && prev_in_start_zone && zone_started {
                if running {
                    if let Err(e) = crate::engine::worker::stop_clicker_inner(
                        &handle,
                        Some(String::from("Left start zone")),
                    ) {
                        log::error!("[ZoneMonitor] stop failed: {e}");
                    }
                }
                state
                    .zone_started_clicker
                    .store(false, std::sync::atomic::Ordering::SeqCst);
            }

            prev_in_start_zone = in_start_zone;
        }
    });
}

fn setup_hotkeys(app: &AppHandle) -> Result<(), std::io::Error> {
    let initial_hotkey = {
        let state = app.state::<ClickerState>();
        let hotkey = state
            .settings
            .lock()
            .unwrap_or_else(poisoned_inner)
            .hotkey
            .clone();
        hotkey
    };

    start_hotkey_listener(app.clone());
    register_hotkey_inner(app, initial_hotkey).map_err(std::io::Error::other)?;
    emit_status(app);
    Ok(())
}

fn setup_frontend_listener(app: &AppHandle) {
    let overlay_init_handle = app.clone();
    app.listen("frontend-ready", move |_| {
        log::info!("[Window] Frontend ready, initializing overlay...");
        if let Err(e) = overlay::init_overlay(&overlay_init_handle) {
            log::error!("[Window] Overlay init failed: {e}");
        }
        #[cfg(target_os = "windows")]
        if let Some(window) = overlay_init_handle.get_webview_window("main") {
            apply_ws_ex_noactivate(&window, false);
            log::info!("[Window] Cleared WS_EX_NOACTIVATE on main window");
        }
    });
}

fn setup_close_handler(app: &AppHandle) {
    if std::env::args().any(|a| a == "--autostart") {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }
}

fn create_clicker_state() -> ClickerState {
    ClickerState {
        running: Arc::new(AtomicBool::new(false)),
        run_generation: AtomicU64::new(0),
        settings: Mutex::new(ClickerSettings::default()),
        last_error: Mutex::new(None),
        stop_reason: Mutex::new(None),
        active_click_point_index: AtomicI64::new(-1),
        active_click_point_tick: AtomicU64::new(0),
        registered_hotkey: Mutex::new(None),
        suppress_hotkey_until_ms: AtomicU64::new(0),
        suppress_hotkey_until_release: AtomicBool::new(false),
        hotkey_capture_active: AtomicBool::new(false),
        click_point_pick_active: AtomicBool::new(false),
        custom_stop_zone_pick_active: AtomicBool::new(false),
        settings_initialized: AtomicBool::new(false),
        paused: Arc::new(AtomicBool::new(false)),
        paused_by_zone: AtomicBool::new(false),
        zone_started_clicker: AtomicBool::new(false),
        warning: Mutex::new(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_panic_hook();

    let rtss_detected = is_rtss_running();
    if rtss_detected {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(create_clicker_state())
        .setup(move |app| {
            let handle = app.handle().clone();
            setup_logging(&handle);

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                apply_ws_ex_noactivate(&window, true);
                log::info!("[Window] Applied WS_EX_NOACTIVATE to main window");
            }

            if rtss_detected {
                log::warn!(
                    "[RTSS] RivaTuner Statistics Server detected. \
                     WebView2 GPU acceleration disabled to prevent crashes. \
                     To fix permanently, exclude 'msedgewebview2.exe' in RTSS settings."
                );
            }
            if let Err(e) = crate::crash_handler::initialize_crashpad() {
                log::warn!("[Crashpad] Failed to initialize: {e}");
            }
            setup_tray(&handle)?;
            spawn_overlay_auto_hide(&handle);
            spawn_start_zone_monitor(&handle);
            window_lifecycle::start_periodic_trimming(30);
            setup_hotkeys(&handle)?;
            setup_frontend_listener(&handle);
            setup_close_handler(&handle);
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
            ui_commands::start_click_point_pick,
            ui_commands::cancel_click_point_pick,
            ui_commands::start_custom_stop_zone_pick,
            ui_commands::cancel_custom_stop_zone_pick,
            ui_commands::get_app_info,
            ui_commands::get_stats,
            ui_commands::reset_stats,
            updates::update_checker::check_for_updates,
            overlay::hide_overlay,
            ui_commands::hide_main_window,
            ui_commands::quit_app,
            ui_commands::get_autostart_enabled,
            ui_commands::set_autostart_enabled,
            ui_commands::list_processes,
            ui_commands::was_autostart_launch,
            ui_commands::get_diagnostics_info,
            ui_commands::open_diagnostics_folder,
            ui_commands::export_diagnostics_bundle,
            ui_commands::debug_trigger_panic,
            ui_commands::debug_trigger_crash,
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
                    crate::app_events::APP_EVENTS_SHUTDOWN
                        .store(true, std::sync::atomic::Ordering::SeqCst);
                    crate::overlay::OVERLAY_THREAD_RUNNING
                        .store(false, std::sync::atomic::Ordering::SeqCst);
                    ZONE_MONITOR_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
                    crate::click_point_picker::cancel_click_point_pick_inner(app_handle);
                    crate::custom_stop_zone_picker::cancel_custom_stop_zone_pick_inner(app_handle);
                    app_handle.exit(0);
                }
            }
        });
}
