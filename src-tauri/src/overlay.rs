use crate::app_state::ClickerState;
use crate::engine::mouse::{
    current_cursor_position, current_monitor_rects, current_virtual_screen_rect, VirtualScreenRect,
};
use crate::error::poisoned_inner;
use crate::error::AppError;
use crate::error::AppResult;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

static LAST_ZONE_SHOW: Mutex<Option<Instant>> = Mutex::new(None);
static CLICK_POINT_PICK_OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
static CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static OVERLAY_THREAD_RUNNING: AtomicBool = AtomicBool::new(true);

static LAST_ZONE_PAYLOAD: Mutex<Option<(VirtualScreenRect, Vec<u8>)>> = Mutex::new(None);
static LAST_CLICK_POINTS_PAYLOAD: Mutex<Option<(VirtualScreenRect, Vec<u8>)>> = Mutex::new(None);

struct OverlayZoneSnapshot {
    edge_stop_enabled: bool,
    edge_stop_top: i32,
    edge_stop_right: i32,
    edge_stop_bottom: i32,
    edge_stop_left: i32,
    corner_stop_enabled: bool,
    corner_stop_tl: i32,
    corner_stop_tr: i32,
    corner_stop_bl: i32,
    corner_stop_br: i32,
    stop_zones_enabled: bool,
    stop_zones: Vec<crate::settings::StopZoneConfig>,
}

#[derive(serde::Serialize)]
struct OverlayZoneStopZone {
    id: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    action: String,
}

#[derive(serde::Serialize)]
struct OverlayZoneMonitor {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(serde::Serialize)]
struct OverlayZoneData {
    #[serde(rename = "edgeStopEnabled")]
    edge_stop_enabled: bool,
    #[serde(rename = "edgeStopTop")]
    edge_stop_top: i32,
    #[serde(rename = "edgeStopRight")]
    edge_stop_right: i32,
    #[serde(rename = "edgeStopBottom")]
    edge_stop_bottom: i32,
    #[serde(rename = "edgeStopLeft")]
    edge_stop_left: i32,
    #[serde(rename = "cornerStopEnabled")]
    corner_stop_enabled: bool,
    #[serde(rename = "cornerStopTL")]
    corner_stop_tl: i32,
    #[serde(rename = "cornerStopTR")]
    corner_stop_tr: i32,
    #[serde(rename = "cornerStopBL")]
    corner_stop_bl: i32,
    #[serde(rename = "cornerStopBR")]
    corner_stop_br: i32,
    #[serde(rename = "stopZones")]
    stop_zones: Vec<OverlayZoneStopZone>,
    #[serde(rename = "stopZonesEnabled")]
    stop_zones_enabled: bool,
    #[serde(rename = "screenWidth")]
    screen_width: i32,
    #[serde(rename = "screenHeight")]
    screen_height: i32,
    monitors: Vec<OverlayZoneMonitor>,
    #[serde(rename = "_showDisabledEdges")]
    show_disabled_edges: bool,
    #[serde(rename = "_showDisabledCorners")]
    show_disabled_corners: bool,
}

#[derive(serde::Serialize)]
struct OverlayClickPoint {
    id: String,
    x: i32,
    y: i32,
    radius: u32,
}

#[derive(serde::Serialize)]
struct OverlayClickPointsData {
    points: Vec<OverlayClickPoint>,
    #[serde(rename = "screenWidth")]
    screen_width: i32,
    #[serde(rename = "screenHeight")]
    screen_height: i32,
    persistent: bool,
}

fn payload_changed(
    cache: &Mutex<Option<(VirtualScreenRect, Vec<u8>)>>,
    bounds: VirtualScreenRect,
    bytes: &[u8],
) -> bool {
    let mut last = cache.lock().unwrap_or_else(poisoned_inner);
    if let Some((last_bounds, last_bytes)) = last.as_ref() {
        if *last_bounds == bounds && last_bytes == bytes {
            return false;
        }
    }
    *last = Some((bounds, bytes.to_vec()));
    true
}

fn invalidate_overlay_caches() {
    *LAST_ZONE_PAYLOAD.lock().unwrap_or_else(poisoned_inner) = None;
    *LAST_CLICK_POINTS_PAYLOAD
        .lock()
        .unwrap_or_else(poisoned_inner) = None;
}

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMNCRP_DISABLED};

pub fn init_overlay(app: &AppHandle) -> AppResult<()> {
    let window = match app.get_webview_window("overlay") {
        Some(w) => w,
        None => {
            let overlay_data_dir = crate::portable::webview_dir("overlay").unwrap_or_else(|| {
                app.path()
                    .app_local_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("EBWebView-overlay")
            });

            log::info!(
                "[Overlay] Creating overlay window (user data: {})",
                overlay_data_dir.display()
            );

            tauri::WebviewWindowBuilder::new(
                app,
                "overlay",
                tauri::WebviewUrl::App("overlay.html".into()),
            )
            .title("Overlay")
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .visible(false)
            .skip_taskbar(true)
            .focusable(false)
            .shadow(false)
            .data_directory(overlay_data_dir)
            .build()?
        }
    };

    log::info!("[Overlay] Running one-time init...");

    window.set_ignore_cursor_events(true)?;
    let _ = window.set_decorations(false);

    #[cfg(target_os = "windows")]
    {
        apply_win32_styles(&window)?;
        let _ = sync_overlay_bounds(&window)?;
    }

    log::info!("[Overlay] Init complete — window configured but hidden");
    Ok(())
}

pub fn show_overlay(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<ClickerState>();
    if !state.settings_initialized.load(Ordering::SeqCst) {
        return Ok(());
    }
    {
        let settings = state.settings.lock().unwrap_or_else(poisoned_inner);
        if !settings.show_stop_overlay {
            return Ok(());
        }
    }

    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| AppError::OverlayNotFound)?;
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| AppError::State("Virtual screen bounds not available".into()))?;

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        let visible = window.is_visible().unwrap_or(false);
        if !visible {
            show_overlay_window(&window)?;
        }
    }

    *LAST_ZONE_SHOW.lock().unwrap_or_else(poisoned_inner) = Some(Instant::now());

    let snapshot = {
        let settings = state.settings.lock().unwrap_or_else(poisoned_inner);
        OverlayZoneSnapshot {
            edge_stop_enabled: settings.edge_stop_enabled,
            edge_stop_top: settings.edge_stop_top,
            edge_stop_right: settings.edge_stop_right,
            edge_stop_bottom: settings.edge_stop_bottom,
            edge_stop_left: settings.edge_stop_left,
            corner_stop_enabled: settings.corner_stop_enabled,
            corner_stop_tl: settings.corner_stop_tl,
            corner_stop_tr: settings.corner_stop_tr,
            corner_stop_bl: settings.corner_stop_bl,
            corner_stop_br: settings.corner_stop_br,
            stop_zones_enabled: settings.stop_zones_enabled,
            stop_zones: settings.stop_zones.clone(),
        }
    };
    let monitors = current_monitor_rects().unwrap_or_else(|| vec![bounds]);
    let stop_zones_payload: Vec<OverlayZoneStopZone> = snapshot
        .stop_zones
        .iter()
        .map(|zone| {
            let offset =
                VirtualScreenRect::new(zone.x, zone.y, zone.width.max(1), zone.height.max(1))
                    .offset_from(bounds);
            OverlayZoneStopZone {
                id: zone.id.clone(),
                x: offset.left,
                y: offset.top,
                width: offset.width,
                height: offset.height,
                action: zone.action.clone(),
            }
        })
        .collect();
    let monitor_payload: Vec<OverlayZoneMonitor> = monitors
        .into_iter()
        .map(|monitor| {
            let offset = monitor.offset_from(bounds);
            OverlayZoneMonitor {
                x: offset.left,
                y: offset.top,
                width: offset.width,
                height: offset.height,
            }
        })
        .collect();
    let payload = OverlayZoneData {
        edge_stop_enabled: snapshot.edge_stop_enabled,
        edge_stop_top: snapshot.edge_stop_top,
        edge_stop_right: snapshot.edge_stop_right,
        edge_stop_bottom: snapshot.edge_stop_bottom,
        edge_stop_left: snapshot.edge_stop_left,
        corner_stop_enabled: snapshot.corner_stop_enabled,
        corner_stop_tl: snapshot.corner_stop_tl,
        corner_stop_tr: snapshot.corner_stop_tr,
        corner_stop_bl: snapshot.corner_stop_bl,
        corner_stop_br: snapshot.corner_stop_br,
        stop_zones: stop_zones_payload,
        stop_zones_enabled: snapshot.stop_zones_enabled,
        screen_width: bounds.width,
        screen_height: bounds.height,
        monitors: monitor_payload,
        show_disabled_edges: !snapshot.edge_stop_enabled,
        show_disabled_corners: !snapshot.corner_stop_enabled,
    };
    match serde_json::to_vec(&payload) {
        Ok(bytes) => {
            if !payload_changed(&LAST_ZONE_PAYLOAD, bounds, &bytes) {
                return Ok(());
            }
            let _ = window.emit("zone-data", &payload);
        }
        Err(_) => {
            *LAST_ZONE_PAYLOAD.lock().unwrap_or_else(poisoned_inner) = None;
            let _ = window.emit("zone-data", &payload);
        }
    };

    Ok(())
}

pub fn show_click_points_overlay(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<ClickerState>();
    if !state.settings_initialized.load(Ordering::SeqCst) {
        return Ok(());
    }

    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| AppError::OverlayNotFound)?;
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| AppError::State("Virtual screen bounds not available".into()))?;
    let points = {
        let settings = state.settings.lock().unwrap_or_else(poisoned_inner);
        settings.click_points.clone()
    };

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        if !points.is_empty() {
            show_overlay_window(&window)?;
        }
    }

    emit_click_points(&window, bounds, &points, false);
    if points.is_empty() && !CLICK_POINT_PICK_OVERLAY_ACTIVE.load(Ordering::SeqCst) {
        *LAST_ZONE_SHOW.lock().unwrap_or_else(poisoned_inner) = None;
        hide_overlay_window(&window);
    } else {
        *LAST_ZONE_SHOW.lock().unwrap_or_else(poisoned_inner) = Some(Instant::now());
    }
    Ok(())
}

pub fn show_click_point_pick_overlay(app: &AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| AppError::OverlayNotFound)?;
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| AppError::State("Virtual screen bounds not available".into()))?;

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        show_overlay_window(&window)?;
    }

    CLICK_POINT_PICK_OVERLAY_ACTIVE.store(true, Ordering::SeqCst);

    let state = app.state::<ClickerState>();
    let click_points = {
        let settings = state.settings.lock().unwrap_or_else(poisoned_inner);
        settings.click_points.clone()
    };
    emit_click_points(&window, bounds, &click_points, true);
    set_click_point_pick_mode(app, true)?;

    if let Some((x, y)) = current_cursor_position() {
        let offset = VirtualScreenRect::new(x, y, 1, 1).offset_from(bounds);
        let _ = window.emit(
            "click-pick-cursor",
            serde_json::json!({
                "x": offset.left,
                "y": offset.top,
            }),
        );
    }

    Ok(())
}

pub fn set_click_point_pick_mode(app: &AppHandle, active: bool) -> AppResult<()> {
    CLICK_POINT_PICK_OVERLAY_ACTIVE.store(active, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit(
            "click-pick-mode",
            serde_json::json!({
                "active": active,
            }),
        );
    }
    Ok(())
}

pub fn show_custom_stop_zone_pick_overlay(app: &AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| AppError::OverlayNotFound)?;
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| AppError::State("Virtual screen bounds not available".into()))?;

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        show_overlay_window(&window)?;
    }

    CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE.store(true, Ordering::SeqCst);
    show_overlay(app)?;
    set_custom_stop_zone_pick_mode(app, true)?;

    if let Some((x, y)) = current_cursor_position() {
        let offset = VirtualScreenRect::new(x, y, 1, 1).offset_from(bounds);
        let _ = window.emit(
            "custom-stop-zone-preview",
            serde_json::json!({
                "cursorX": offset.left,
                "cursorY": offset.top,
            }),
        );
    }

    Ok(())
}

pub fn set_custom_stop_zone_pick_mode(app: &AppHandle, active: bool) -> AppResult<()> {
    CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE.store(active, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit(
            "custom-stop-zone-pick-mode",
            serde_json::json!({
                "active": active,
            }),
        );
    }
    Ok(())
}

pub fn hide_custom_stop_zone_pick_overlay(app: &AppHandle) -> AppResult<()> {
    set_custom_stop_zone_pick_mode(app, false)?;
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("custom-stop-zone-clear-preview", ());
        hide_overlay_window(&window);
    }
    Ok(())
}

fn emit_click_points(
    window: &tauri::WebviewWindow,
    bounds: VirtualScreenRect,
    points: &[crate::settings::ClickPoint],
    persistent: bool,
) {
    let points_payload: Vec<OverlayClickPoint> = points
        .iter()
        .map(|point| {
            let offset = VirtualScreenRect::new(point.x, point.y, 1, 1).offset_from(bounds);
            OverlayClickPoint {
                id: point.id.clone(),
                x: offset.left,
                y: offset.top,
                radius: point.radius,
            }
        })
        .collect();

    let payload = OverlayClickPointsData {
        points: points_payload,
        screen_width: bounds.width,
        screen_height: bounds.height,
        persistent,
    };
    match serde_json::to_vec(&payload) {
        Ok(bytes) => {
            if !payload_changed(&LAST_CLICK_POINTS_PAYLOAD, bounds, &bytes) {
                return;
            }
            let _ = window.emit("click-points-data", &payload);
        }
        Err(_) => {
            *LAST_CLICK_POINTS_PAYLOAD
                .lock()
                .unwrap_or_else(poisoned_inner) = None;
            let _ = window.emit("click-points-data", &payload);
        }
    }
}

// ---- Background timer ----

pub fn check_auto_hide(app: &AppHandle) {
    if CLICK_POINT_PICK_OVERLAY_ACTIVE.load(Ordering::SeqCst)
        || CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE.load(Ordering::SeqCst)
    {
        return;
    }

    let mut last = LAST_ZONE_SHOW.lock().unwrap_or_else(poisoned_inner);
    if let Some(instant) = *last {
        if instant.elapsed() >= Duration::from_secs(3) {
            // ↑ auto-hide after timer

            *last = None;
            if let Some(window) = app.get_webview_window("overlay") {
                log::info!("[Overlay] Auto-hide: hiding window");
                hide_overlay_window(&window);
            }
        }
    }
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> AppResult<()> {
    *LAST_ZONE_SHOW.lock().unwrap_or_else(poisoned_inner) = None;
    CLICK_POINT_PICK_OVERLAY_ACTIVE.store(false, Ordering::SeqCst);
    CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("overlay") {
        hide_overlay_window(&window);
    }
    Ok(())
}

fn hide_overlay_window(window: &tauri::WebviewWindow) {
    invalidate_overlay_caches();
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = get_hwnd(window) {
            unsafe { ShowWindow(hwnd, 0) };
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = window.hide();
}

#[cfg(target_os = "windows")]
fn get_hwnd(window: &tauri::WebviewWindow) -> AppResult<*mut std::ffi::c_void> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window
        .window_handle()
        .map_err(|e| AppError::State(e.to_string()))?;
    match handle.as_raw() {
        RawWindowHandle::Win32(w) => Ok(w.hwnd.get() as *mut std::ffi::c_void),
        _ => Err(AppError::State("Not a Win32 window".into())),
    }
}

#[cfg(target_os = "windows")]
fn apply_win32_styles(window: &tauri::WebviewWindow) -> AppResult<()> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        SetWindowLongW(hwnd, GWL_STYLE, ((style as u32) | 0x8000_0000) as i32);

        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_ex =
            ((ex as u32) | 0x0800_0000 | 0x0000_0080 | 0x0000_0020 | 0x0000_0008) & !0x0004_0000;
        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);

        let policy = DWMNCRP_DISABLED;
        DwmSetWindowAttribute(
            hwnd,
            2,
            &policy as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );

        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        );
    }

    log::info!("[Overlay] Win32 styles applied");
    Ok(())
}

#[cfg(target_os = "windows")]
fn sync_overlay_bounds(window: &tauri::WebviewWindow) -> AppResult<VirtualScreenRect> {
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| AppError::State("Virtual screen bounds not available".into()))?;
    let hwnd = get_hwnd(window)?;

    unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            bounds.left,
            bounds.top,
            bounds.width,
            bounds.height,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }

    Ok(bounds)
}

#[cfg(target_os = "windows")]
fn show_overlay_window(window: &tauri::WebviewWindow) -> AppResult<()> {
    invalidate_overlay_caches();
    let _ = window.eval(
        "document.getElementById('zone-layer').innerHTML = ''; \
         document.getElementById('click-points-layer').innerHTML = '';",
    );

    let hwnd = get_hwnd(window)?;

    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
    }

    Ok(())
}
