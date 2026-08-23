//! Icon selection logic + Tauri glue. Window/tray writes are marshaled to the
//! main thread (issue #273 fix: cross-thread `set_icon` could wedge the UI).

use std::sync::atomic::Ordering;

use image::RgbaImage;
use tauri::image::Image;
use tauri::{AppHandle, Manager};

use crate::error::poisoned_inner;
use crate::{ClickerState, IconState};

// `include_bytes!` resolves relative to this file; CARGO_MANIFEST_DIR is
// `src-tauri`, so the assets live in `src-tauri/icons`.
const ICON_ACTIVATED_DARK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/icon-activated-dark.ico"
));
const ICON_ACTIVATED_LIGHT: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/Icon-activated-light.ico"
));
const ICON_DEACTIVATED_DARK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/icon-deactivated-dark.ico"
));
const ICON_DEACTIVATED_LIGHT: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/Icon-deactivated-light.ico"
));
const MASK_PNG_BYTES: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/icon-mask.png"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconThemePref {
    Auto,
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolvedTheme {
    Dark,
    Light,
}

pub struct IconDecision {
    pub image: RgbaImage,
}

pub struct IconCache {
    pub activated_dark: Option<RgbaImage>,
    pub activated_light: Option<RgbaImage>,
    pub deactivated_dark: Option<RgbaImage>,
    pub deactivated_light: Option<RgbaImage>,
    pub active_tint_dark: Option<RgbaImage>,
    pub active_tint_light: Option<RgbaImage>,
}

#[derive(Debug, Clone)]
pub enum IconError {
    Decode(String),
    Backend(String),
}

impl std::fmt::Display for IconError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IconError::Decode(m) => write!(f, "icon decode error: {m}"),
            IconError::Backend(m) => write!(f, "icon backend error: {m}"),
        }
    }
}

pub trait IconBackend {
    fn set_window_icon(&self, img: &RgbaImage) -> Result<(), IconError>;
    fn set_tray_icon(&self, img: &RgbaImage) -> Result<(), IconError>;
}

pub struct TauriIconBackend {
    window: Option<Box<dyn IconBackend>>,
    tray: Option<Box<dyn IconBackend>>,
}

impl TauriIconBackend {
    pub fn new(window: Option<Box<dyn IconBackend>>, tray: Option<Box<dyn IconBackend>>) -> Self {
        Self { window, tray }
    }
}

impl IconBackend for TauriIconBackend {
    fn set_window_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
        if let Some(window) = &self.window {
            window.set_window_icon(img)?;
        }
        Ok(())
    }

    fn set_tray_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
        if let Some(tray) = &self.tray {
            tray.set_tray_icon(img)?;
        }
        Ok(())
    }
}

pub fn resolve_theme(pref: &IconThemePref, app_theme: &str) -> ResolvedTheme {
    match pref {
        IconThemePref::Auto => {
            if app_theme == "dark" {
                ResolvedTheme::Dark
            } else {
                ResolvedTheme::Light
            }
        }
        IconThemePref::Dark => ResolvedTheme::Dark,
        IconThemePref::Light => ResolvedTheme::Light,
    }
}

fn compute_tinted(hex: &str, base: &[u8], mask: &[u8]) -> Option<RgbaImage> {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;

    let base_img = image::load_from_memory(base).ok()?.to_rgba8();
    let mask_img = image::load_from_memory(mask).ok()?.to_rgba8();
    let (w, h) = base_img.dimensions();
    let mw = mask_img.width().min(w);
    let mh = mask_img.height().min(h);

    let mut out = base_img;
    for y in 0..mh {
        for x in 0..mw {
            let mp = mask_img.get_pixel(x, y);
            if mp[0] > 200 && mp[1] > 200 && mp[2] > 200 && mp[3] > 128 {
                let p = out.get_pixel_mut(x, y);
                p[0] = r;
                p[1] = g;
                p[2] = b;
            }
        }
    }

    Some(out)
}

pub fn decode_icon(bytes: &[u8]) -> Result<RgbaImage, IconError> {
    image::load_from_memory(bytes)
        .map(|img| img.to_rgba8())
        .map_err(|e| IconError::Decode(e.to_string()))
}

/// Default (deactivated) icon as a Tauri `Image`. Used to set the window/tray
/// icon at creation time so Windows never associates the running app with the
/// bundled EXE icon resource (which can shadow later runtime updates).
pub fn default_icon_image() -> Option<Image<'static>> {
    let img = decode_icon(ICON_DEACTIVATED_DARK).ok()?;
    let (w, h) = (img.width(), img.height());
    Some(Image::new_owned(img.into_raw(), w, h))
}

pub fn recompute_tint(
    icon_enabled: bool,
    icon_color: &str,
    hex: &str,
) -> (Option<RgbaImage>, Option<RgbaImage>) {
    if !icon_enabled || icon_color != "theme" {
        (None, None)
    } else {
        (
            compute_tinted(hex, ICON_ACTIVATED_DARK, MASK_PNG_BYTES),
            compute_tinted(hex, ICON_ACTIVATED_LIGHT, MASK_PNG_BYTES),
        )
    }
}

pub fn decide_icon(
    running: bool,
    icon_enabled: bool,
    is_dark: bool,
    cache: &IconCache,
) -> Option<IconDecision> {
    let (deact_same, deact_other) = if is_dark {
        (
            cache.deactivated_dark.clone(),
            cache.deactivated_light.clone(),
        )
    } else {
        (
            cache.deactivated_light.clone(),
            cache.deactivated_dark.clone(),
        )
    };
    let (emb_same, emb_other) = if is_dark {
        (cache.activated_dark.clone(), cache.activated_light.clone())
    } else {
        (cache.activated_light.clone(), cache.activated_dark.clone())
    };
    let (tint_same, tint_other) = if is_dark {
        (
            cache.active_tint_dark.clone(),
            cache.active_tint_light.clone(),
        )
    } else {
        (
            cache.active_tint_light.clone(),
            cache.active_tint_dark.clone(),
        )
    };

    if !running || !icon_enabled {
        let chosen = deact_same
            .or_else(|| deact_other.clone())
            .or_else(|| emb_same.clone())
            .or_else(|| emb_other.clone())
            .or_else(|| tint_same.clone())
            .or_else(|| tint_other.clone());
        chosen.map(|image| IconDecision { image })
    } else {
        let chosen = tint_same
            .or_else(|| emb_same.clone())
            .or_else(|| deact_same.clone())
            .or_else(|| deact_other.clone());
        chosen.map(|image| IconDecision { image })
    }
}

pub fn apply_icon<B: IconBackend>(backend: &B, decision: &IconDecision) -> Vec<IconError> {
    let mut errs = Vec::new();

    match backend.set_window_icon(&decision.image) {
        Ok(()) => {}
        Err(e) => {
            log::warn!("[icon] set_window_icon failed: {e}");
            errs.push(e);
        }
    }

    match backend.set_tray_icon(&decision.image) {
        Ok(()) => {}
        Err(e) => {
            log::warn!("[icon] set_tray_icon failed: {e}");
            errs.push(e);
        }
    }

    errs
}

pub fn init_icon_cache() -> IconCache {
    let activated_dark = decode_icon(ICON_ACTIVATED_DARK).ok();
    let activated_light = decode_icon(ICON_ACTIVATED_LIGHT).ok();
    let deactivated_dark = decode_icon(ICON_DEACTIVATED_DARK).ok();
    let deactivated_light = decode_icon(ICON_DEACTIVATED_LIGHT).ok();

    if activated_dark.is_none() {
        log::warn!("[icon] failed to decode icon-activated-dark.ico");
    }
    if activated_light.is_none() {
        log::warn!("[icon] failed to decode Icon-activated-light.ico");
    }
    if deactivated_dark.is_none() {
        log::warn!("[icon] failed to decode icon-deactivated-dark.ico");
    }
    if deactivated_light.is_none() {
        log::warn!("[icon] failed to decode Icon-deactivated-light.ico");
    }

    let (dark_tint, light_tint) = recompute_tint(true, "theme", "#22c55e");

    if dark_tint.is_none() {
        log::warn!("[icon] failed to decode active tint (dark)");
    }
    if light_tint.is_none() {
        log::warn!("[icon] failed to decode active tint (light)");
    }

    IconCache {
        activated_dark,
        activated_light,
        deactivated_dark,
        deactivated_light,
        active_tint_dark: dark_tint,
        active_tint_light: light_tint,
    }
}

// `IconBackend` is defined in this crate, so we impl it for local newtype
// wrappers around the foreign Tauri handle types.
struct WindowSink(tauri::WebviewWindow);
impl IconBackend for WindowSink {
    fn set_window_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
        let image = Image::new_owned(img.clone().into_raw(), img.width(), img.height());
        self.0
            .set_icon(image)
            .map_err(|e| IconError::Backend(e.to_string()))?;
        // Tauri's set_icon updates the in-memory icon but Windows keeps showing
        // the EXE's bundled icon on the taskbar button (which is ICON_BIG). Push
        // ICON_BIG explicitly so the taskbar reflects the tinted icon.
        #[cfg(windows)]
        force_window_icon_big(&self.0, img);
        Ok(())
    }

    fn set_tray_icon(&self, _img: &RgbaImage) -> Result<(), IconError> {
        Ok(())
    }
}

struct TraySink(tauri::tray::TrayIcon);
impl IconBackend for TraySink {
    fn set_window_icon(&self, _img: &RgbaImage) -> Result<(), IconError> {
        Ok(())
    }

    fn set_tray_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
        let image = Image::new_owned(img.clone().into_raw(), img.width(), img.height());
        // Windows Explorer caches tray icons by the HICON identity. A plain
        // NIM_MODIFY won't repaint in many cases (notably release builds), so
        // remove then re-add to force a fresh notification-area icon.
        let _ = self.0.set_icon(None);
        self.0
            .set_icon(Some(image))
            .map_err(|e| IconError::Backend(e.to_string()))
    }
}

#[cfg(windows)]
fn force_window_icon_big(window: &tauri::WebviewWindow, img: &RgbaImage) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, SendMessageW, ICON_BIG, ICON_SMALL, WM_SETICON,
    };

    // Create distinct handles for small and big so each taskbar slot owns its
    // own icon and neither handle is double-freed on window teardown.
    let Some(hicon_small) = rgba_to_hicon(img) else {
        log::warn!("[icon] force_window_icon_big: small HICON creation failed");
        return;
    };
    let Some(hicon_big) = rgba_to_hicon(img) else {
        log::warn!("[icon] force_window_icon_big: big HICON creation failed");
        unsafe { DestroyIcon(hicon_small) };
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        log::warn!("[icon] force_window_icon_big: hwnd unavailable");
        unsafe {
            DestroyIcon(hicon_small);
            DestroyIcon(hicon_big);
        }
        return;
    };
    // Tauri returns the `windows` crate's HWND (newtype over *mut c_void);
    // `windows-sys` SendMessageW takes its HWND alias (= *mut c_void).
    let hwnd = hwnd.0;
    unsafe {
        // Returns the previous icon handle for each size; destroy it to avoid
        // exhausting the GDI handle heap across repeated runtime updates.
        let prev_small = SendMessageW(hwnd, WM_SETICON, ICON_SMALL as usize, hicon_small as isize);
        let prev_big = SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, hicon_big as isize);
        if prev_small != 0 && prev_small != hicon_small as isize {
            DestroyIcon(prev_small as windows_sys::Win32::UI::WindowsAndMessaging::HICON);
        }
        if prev_big != 0 && prev_big != hicon_big as isize && prev_big != prev_small {
            DestroyIcon(prev_big as windows_sys::Win32::UI::WindowsAndMessaging::HICON);
        }
    }
}

// Premultiply straight RGBA (as the `image` crate stores it) into the BGRA
// byte order Windows icon bitmaps require, with alpha premultiplied.
#[cfg(target_os = "windows")]
fn premultiply_rgba_to_bgra(raw: &[u8]) -> Vec<u8> {
    let mut px = Vec::with_capacity(raw.len());
    for p in raw.chunks_exact(4) {
        let (r, g, b, a) = (p[0] as u32, p[1] as u32, p[2] as u32, p[3] as u32);
        px.push(((b * a + 127) / 255) as u8);
        px.push(((g * a + 127) / 255) as u8);
        px.push(((r * a + 127) / 255) as u8);
        px.push(a as u8);
    }
    px
}

// Build an HICON from RGBA via a premultiplied-alpha color bitmap
// (BITMAPV5HEADER + BI_BITFIELDS + alpha mask). Negative height = top-down
// DIB, matching the `image` crate's row 0 = top ordering.
#[cfg(windows)]
fn rgba_to_hicon(img: &RgbaImage) -> Option<windows_sys::Win32::UI::WindowsAndMessaging::HICON> {
    use windows_sys::Win32::Graphics::Gdi::{
        CreateBitmap, CreateDIBSection, DeleteObject, GetDC, ReleaseDC, BITMAPV5HEADER,
        BI_BITFIELDS, DIB_RGB_COLORS, HBITMAP,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, ICONINFO};

    let (w, h) = (img.width() as i32, img.height() as i32);
    let px = premultiply_rgba_to_bgra(img.as_raw());

    let mut bmi: BITMAPV5HEADER = unsafe { std::mem::zeroed() };
    bmi.bV5Size = std::mem::size_of::<BITMAPV5HEADER>() as u32;
    bmi.bV5Width = w;
    bmi.bV5Height = -h; // top-down
    bmi.bV5Planes = 1;
    bmi.bV5BitCount = 32;
    bmi.bV5Compression = BI_BITFIELDS;
    bmi.bV5RedMask = 0x00FF_0000;
    bmi.bV5GreenMask = 0x0000_FF00;
    bmi.bV5BlueMask = 0x0000_00FF;
    bmi.bV5AlphaMask = 0xFF00_0000;

    let hdc = unsafe { GetDC(std::ptr::null_mut()) };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let hbmp = unsafe {
        CreateDIBSection(
            hdc,
            &bmi as *const _ as *const _,
            DIB_RGB_COLORS,
            &mut bits,
            core::ptr::null_mut(),
            0,
        )
    };
    if hbmp.is_null() {
        if !hdc.is_null() {
            unsafe { ReleaseDC(std::ptr::null_mut(), hdc) };
        }
        return None;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(px.as_ptr(), bits as *mut u8, px.len());
        ReleaseDC(std::ptr::null_mut(), hdc);
    }

    // Fully-transparent (all-zero) 1bpp mask: the color bitmap's alpha channel
    // drives transparency.
    let mask_bytes = (((w + 15) / 16) * 16 / 8 * h) as usize;
    let mask = vec![0u8; mask_bytes.max(1)];
    let hmask = unsafe { CreateBitmap(w, h, 1, 1, mask.as_ptr() as *const _) };

    let ii = ICONINFO {
        fIcon: 1,
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: hmask,
        hbmColor: hbmp,
    };
    let hicon = unsafe { CreateIconIndirect(&ii) };
    unsafe {
        DeleteObject(hbmp as HBITMAP);
        DeleteObject(hmask as HBITMAP);
    }
    if hicon.is_null() {
        None
    } else {
        Some(hicon)
    }
}

fn tauri_backend(app: &AppHandle) -> TauriIconBackend {
    let window = app
        .get_webview_window("main")
        .map(|w| Box::new(WindowSink(w)) as Box<dyn IconBackend>);
    let tray = app
        .tray_by_id("main")
        .map(|t| Box::new(TraySink(t)) as Box<dyn IconBackend>);
    TauriIconBackend::new(window, tray)
}

pub fn set_app_icons(app: &AppHandle) {
    let handle = app.clone();
    // `Err` means the app is shutting down and the main-thread queue is gone.
    if let Err(e) = app.run_on_main_thread(move || {
        let state = handle.state::<ClickerState>();
        let running = state.running.load(Ordering::SeqCst);

        let (icon_enabled, is_dark) = {
            let icon_state = state.icon_state.lock().unwrap_or_else(poisoned_inner);
            let pref = match icon_state.icon_theme.as_str() {
                "dark" => IconThemePref::Dark,
                "light" => IconThemePref::Light,
                _ => IconThemePref::Auto,
            };
            let is_dark = resolve_theme(&pref, &icon_state.theme) == ResolvedTheme::Dark;
            (icon_state.icon_enabled, is_dark)
        };

        let cache = state.icon_cache.lock().unwrap_or_else(poisoned_inner);
        let decision = decide_icon(running, icon_enabled, is_dark, &cache);
        if let Some(decision) = decision {
            let _errs = apply_icon(&tauri_backend(&handle), &decision);
        }
    }) {
        log::warn!("[icon] run_on_main_thread failed (closure never ran): {e}");
    }
}

pub fn set_icon_theme(
    app: &AppHandle,
    hex_color: &str,
    theme: &str,
    icon_enabled: bool,
    icon_theme: &str,
    icon_color: &str,
) {
    let state = app.state::<ClickerState>();

    let (dark, light) = recompute_tint(icon_enabled, icon_color, hex_color);

    {
        let mut icon_state: std::sync::MutexGuard<'_, IconState> =
            state.icon_state.lock().unwrap_or_else(poisoned_inner);
        icon_state.accent_color = hex_color.to_string();
        icon_state.theme = theme.to_string();
        icon_state.icon_enabled = icon_enabled;
        icon_state.icon_theme = icon_theme.to_string();
        icon_state.icon_color = icon_color.to_string();
    }

    {
        let mut cache = state.icon_cache.lock().unwrap_or_else(poisoned_inner);
        cache.active_tint_dark = dark;
        cache.active_tint_light = light;
        if cache.active_tint_dark.is_none() && icon_enabled && icon_color == "theme" {
            log::warn!("[icon] recomputed active tint (dark) was empty");
        }
        if cache.active_tint_light.is_none() && icon_enabled && icon_color == "theme" {
            log::warn!("[icon] recomputed active tint (light) was empty");
        }
    }

    set_app_icons(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageEncoder;

    struct RecordingBackend {
        window_ok: bool,
        tray_ok: bool,
        window_calls: std::sync::Mutex<Vec<Vec<u8>>>,
        tray_calls: std::sync::Mutex<Vec<Vec<u8>>>,
    }

    impl RecordingBackend {
        fn new(window_ok: bool, tray_ok: bool) -> Self {
            Self {
                window_ok,
                tray_ok,
                window_calls: std::sync::Mutex::new(Vec::new()),
                tray_calls: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn window_calls(&self) -> Vec<Vec<u8>> {
            self.window_calls.lock().unwrap().clone()
        }

        fn tray_calls(&self) -> Vec<Vec<u8>> {
            self.tray_calls.lock().unwrap().clone()
        }
    }

    impl IconBackend for RecordingBackend {
        fn set_window_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
            self.window_calls
                .lock()
                .unwrap()
                .push(img.clone().into_raw());
            if self.window_ok {
                Ok(())
            } else {
                Err(IconError::Backend("window-fail".to_string()))
            }
        }

        fn set_tray_icon(&self, img: &RgbaImage) -> Result<(), IconError> {
            self.tray_calls.lock().unwrap().push(img.clone().into_raw());
            if self.tray_ok {
                Ok(())
            } else {
                Err(IconError::Backend("tray-fail".to_string()))
            }
        }
    }

    fn cache_from_real_icons() -> IconCache {
        IconCache {
            activated_dark: decode_icon(ICON_ACTIVATED_DARK).ok(),
            activated_light: decode_icon(ICON_ACTIVATED_LIGHT).ok(),
            deactivated_dark: decode_icon(ICON_DEACTIVATED_DARK).ok(),
            deactivated_light: decode_icon(ICON_DEACTIVATED_LIGHT).ok(),
            active_tint_dark: recompute_tint(true, "theme", "#22c55e").0.as_ref().cloned(),
            active_tint_light: recompute_tint(true, "theme", "#22c55e").1.as_ref().cloned(),
        }
    }

    fn empty_cache() -> IconCache {
        IconCache {
            activated_dark: None,
            activated_light: None,
            deactivated_dark: None,
            deactivated_light: None,
            active_tint_dark: None,
            active_tint_light: None,
        }
    }

    fn make_png(w: u32, h: u32, rgba: &[u8]) -> Vec<u8> {
        let mut buf = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut buf);
        encoder
            .write_image(rgba, w, h, image::ExtendedColorType::Rgba8)
            .expect("png encode");
        buf
    }

    fn load_rgba(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
        let img = image::load_from_memory(bytes).expect("decode");
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        (w, h, rgba.into_raw())
    }

    fn rgba_of(img: &RgbaImage) -> Vec<u8> {
        img.clone().into_raw()
    }

    #[test]
    fn resolve_theme_auto_dark() {
        assert_eq!(
            resolve_theme(&IconThemePref::Auto, "dark"),
            ResolvedTheme::Dark
        );
    }
    #[test]
    fn resolve_theme_auto_light() {
        assert_eq!(
            resolve_theme(&IconThemePref::Auto, "light"),
            ResolvedTheme::Light
        );
    }
    #[test]
    fn resolve_theme_explicit_dark() {
        assert_eq!(
            resolve_theme(&IconThemePref::Dark, "light"),
            ResolvedTheme::Dark
        );
    }
    #[test]
    fn resolve_theme_explicit_light() {
        assert_eq!(
            resolve_theme(&IconThemePref::Light, "dark"),
            ResolvedTheme::Light
        );
    }

    #[test]
    fn compute_tinted_valid_differs_from_base() {
        let base = make_png(1, 1, &[10, 20, 30, 255]);
        let mask = make_png(1, 1, &[255, 255, 255, 255]);
        let out = compute_tinted("#ff0000", &base, &mask).expect("should tint");
        let opx = out.into_raw();
        assert!(!opx.is_empty());
        let (_w, _h, bpx) = load_rgba(&base);
        assert_ne!(opx, bpx);
        assert_eq!(&opx[0..4], &[255, 0, 0, 255]);
    }

    #[test]
    fn compute_tinted_short_hex_is_none() {
        let base = make_png(1, 1, &[10, 20, 30, 255]);
        let mask = make_png(1, 1, &[255, 255, 255, 255]);
        assert!(compute_tinted("#ff", &base, &mask).is_none());
    }

    #[test]
    fn compute_tinted_bad_chars_hex_is_none() {
        let base = make_png(1, 1, &[10, 20, 30, 255]);
        let mask = make_png(1, 1, &[255, 255, 255, 255]);
        assert!(compute_tinted("#zz0000", &base, &mask).is_none());
        assert!(compute_tinted("gggggg", &base, &mask).is_none());
    }

    #[test]
    fn compute_tinted_unreadable_base_is_none() {
        let mask = make_png(1, 1, &[255, 255, 255, 255]);
        assert!(compute_tinted("#ff0000", b"not an image", &mask).is_none());
    }

    #[test]
    fn compute_tinted_unreadable_mask_is_none() {
        let base = make_png(1, 1, &[10, 20, 30, 255]);
        assert!(compute_tinted("#ff0000", &base, b"not an image").is_none());
    }

    #[test]
    fn compute_tinted_qualifying_and_nonqualifying_pixels() {
        let base = make_png(2, 1, &[10, 10, 10, 255, 20, 20, 20, 255]);
        let mask = make_png(2, 1, &[255, 255, 255, 255, 0, 0, 0, 255]);
        let out = compute_tinted("#00ff00", &base, &mask).expect("should tint");
        let opx = out.into_raw();
        assert_eq!(&opx[0..4], &[0, 255, 0, 255]);
        assert_eq!(&opx[4..8], &[20, 20, 20, 255]);
    }

    #[test]
    fn compute_tinted_mismatched_mask_size() {
        let base = make_png(
            2,
            2,
            &[
                10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255,
            ],
        );
        let mask = make_png(1, 2, &[255, 255, 255, 255, 255, 255, 255, 255]);
        let out = compute_tinted("#0000ff", &base, &mask).expect("should tint");
        let (w, h) = out.dimensions();
        let opx = out.into_raw();
        assert_eq!((w, h), (2, 2));
        assert_eq!(&opx[0..4], &[0, 0, 255, 255]);
        assert_eq!(&opx[4..8], &[20, 20, 20, 255]);
        assert_eq!(&opx[8..12], &[0, 0, 255, 255]);
        assert_eq!(&opx[12..16], &[40, 40, 40, 255]);
    }

    #[test]
    fn recompute_tint_t1_disabled() {
        assert_eq!(recompute_tint(false, "theme", "#22c55e"), (None, None));
    }
    #[test]
    fn recompute_tint_t2_color_not_theme() {
        assert_eq!(recompute_tint(true, "default", "#22c55e"), (None, None));
    }
    #[test]
    fn recompute_tint_t3_enabled_theme() {
        let (d, l) = recompute_tint(true, "theme", "#22c55e");
        assert!(d.is_some());
        assert!(l.is_some());
    }

    #[test]
    fn decide_icon_inactive_dark() {
        let cache = cache_from_real_icons();
        let d = decide_icon(false, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.deactivated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_inactive_light() {
        let cache = cache_from_real_icons();
        let d = decide_icon(false, true, false, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.deactivated_light.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_active_with_tint_dark() {
        let cache = cache_from_real_icons();
        let d = decide_icon(true, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.active_tint_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_active_with_tint_light() {
        let cache = cache_from_real_icons();
        let d = decide_icon(true, true, false, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.active_tint_light.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_active_no_tint_falls_to_embedded() {
        let mut cache = cache_from_real_icons();
        cache.active_tint_dark = None;
        cache.active_tint_light = None;
        let d = decide_icon(true, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.activated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_active_icon_disabled_is_never_active() {
        let cache = cache_from_real_icons();
        let d = decide_icon(true, false, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.deactivated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_active_tint_none_falls_to_embedded() {
        let mut cache = cache_from_real_icons();
        cache.active_tint_dark = None;
        let d = decide_icon(true, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.activated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_embedded_none_falls_to_deactivated() {
        let mut cache = cache_from_real_icons();
        cache.active_tint_dark = None;
        cache.activated_dark = None;
        let d = decide_icon(true, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.deactivated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_asymmetric_cache_dark_missing_tint() {
        let mut cache = cache_from_real_icons();
        cache.active_tint_dark = None;
        let d = decide_icon(true, true, true, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.activated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_asymmetric_cache_light_missing_tint() {
        let mut cache = cache_from_real_icons();
        cache.active_tint_light = None;
        let d = decide_icon(true, true, false, &cache).expect("some");
        assert_eq!(
            rgba_of(&d.image),
            rgba_of(cache.activated_light.as_ref().unwrap())
        );
    }

    #[test]
    fn decide_icon_all_none_returns_none() {
        assert!(decide_icon(true, true, true, &empty_cache()).is_none());
        assert!(decide_icon(false, true, true, &empty_cache()).is_none());
        assert!(decide_icon(true, false, true, &empty_cache()).is_none());
    }

    #[test]
    fn decode_icon_valid_ico() {
        assert!(decode_icon(ICON_ACTIVATED_DARK).is_ok());
    }
    #[test]
    fn decode_icon_garbage_err() {
        assert!(decode_icon(b"this is not an image at all").is_err());
    }

    #[test]
    fn apply_icon_inactive_sets_both_with_deactivated() {
        let cache = cache_from_real_icons();
        let decision = decide_icon(false, true, true, &cache).unwrap();
        let backend = RecordingBackend::new(true, true);
        let errs = apply_icon(&backend, &decision);
        assert!(errs.is_empty());
        assert_eq!(backend.window_calls().len(), 1);
        assert_eq!(backend.tray_calls().len(), 1);
        assert_eq!(
            backend.window_calls()[0],
            rgba_of(cache.deactivated_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn apply_icon_active_sets_both_with_active() {
        let cache = cache_from_real_icons();
        let decision = decide_icon(true, true, true, &cache).unwrap();
        let backend = RecordingBackend::new(true, true);
        let errs = apply_icon(&backend, &decision);
        assert!(errs.is_empty());
        assert_eq!(backend.window_calls().len(), 1);
        assert_eq!(backend.tray_calls().len(), 1);
        assert_eq!(
            backend.window_calls()[0],
            rgba_of(cache.active_tint_dark.as_ref().unwrap())
        );
    }

    #[test]
    fn apply_icon_window_ok_tray_fails_collects_tray_error() {
        let cache = cache_from_real_icons();
        let decision = decide_icon(true, true, true, &cache).unwrap();
        let backend = RecordingBackend::new(true, false);
        let errs = apply_icon(&backend, &decision);
        assert_eq!(errs.len(), 1);
        assert!(matches!(errs[0], IconError::Backend(_)));
        assert_eq!(backend.window_calls().len(), 1);
        assert_eq!(backend.tray_calls().len(), 1);
    }

    #[test]
    fn apply_icon_window_fails_tray_ok_collects_window_error() {
        let cache = cache_from_real_icons();
        let decision = decide_icon(true, true, true, &cache).unwrap();
        let backend = RecordingBackend::new(false, true);
        let errs = apply_icon(&backend, &decision);
        assert_eq!(errs.len(), 1);
        assert!(matches!(errs[0], IconError::Backend(_)));
        assert_eq!(backend.tray_calls().len(), 1);
        assert_eq!(backend.window_calls().len(), 1);
    }

    #[test]
    fn apply_icon_both_fail_collects_both_errors() {
        let cache = cache_from_real_icons();
        let decision = decide_icon(true, true, true, &cache).unwrap();
        let backend = RecordingBackend::new(false, false);
        let errs = apply_icon(&backend, &decision);
        assert_eq!(errs.len(), 2);
        assert_eq!(backend.window_calls().len(), 1);
        assert_eq!(backend.tray_calls().len(), 1);
    }

    #[test]
    fn tauri_backend_none_window_and_tray_noop_ok() {
        let backend = TauriIconBackend::new(None, None);
        assert!(backend
            .set_window_icon(&decode_icon(ICON_ACTIVATED_DARK).unwrap())
            .is_ok());
        assert!(backend
            .set_tray_icon(&decode_icon(ICON_ACTIVATED_DARK).unwrap())
            .is_ok());
    }

    #[test]
    fn decode_failure_path_covered_by_garbage() {
        let cache = empty_cache();
        let none_decision = decide_icon(true, true, true, &cache);
        assert!(none_decision.is_none());
        let backend = RecordingBackend::new(true, true);
        if let Some(d) = none_decision {
            let _ = apply_icon(&backend, &d);
        }
        assert!(decide_icon(false, true, false, &cache).is_none());
    }

    #[test]
    fn init_icon_cache_decodes_real_assets() {
        let cache = init_icon_cache();
        assert!(cache.activated_dark.is_some());
        assert!(cache.activated_light.is_some());
        assert!(cache.deactivated_dark.is_some());
        assert!(cache.deactivated_light.is_some());
        assert!(cache.active_tint_dark.is_some());
        assert!(cache.active_tint_light.is_some());
    }

    #[test]
    #[cfg(windows)]
    fn premultiply_rgba_to_bgra_opaque_red() {
        // opaque red: B/G swapped to front, premultiplied by 255 == unchanged
        assert_eq!(
            premultiply_rgba_to_bgra(&[255, 0, 0, 255]),
            vec![0, 0, 255, 255]
        );
    }

    #[test]
    #[cfg(windows)]
    fn premultiply_rgba_to_bgra_partial_alpha() {
        // straight (10,20,30,128) -> premultiplied (b,g,r,a) ~ (15,10,5,128)
        assert_eq!(
            premultiply_rgba_to_bgra(&[10, 20, 30, 128]),
            vec![15, 10, 5, 128]
        );
    }

    #[test]
    #[cfg(windows)]
    fn premultiply_rgba_to_bgra_zero_alpha() {
        assert_eq!(premultiply_rgba_to_bgra(&[10, 20, 30, 0]), vec![0, 0, 0, 0]);
    }

    #[test]
    #[cfg(windows)]
    fn premultiply_rgba_to_bgra_multiple_pixels() {
        // (255,0,0,255) -> [0,0,255,255]; (0,0,255,128) -> [128,0,0,128]
        assert_eq!(
            premultiply_rgba_to_bgra(&[255, 0, 0, 255, 0, 0, 255, 128]),
            vec![0, 0, 255, 255, 128, 0, 0, 128]
        );
    }

    #[test]
    fn compute_tinted_applies_color() {
        // #b930df -> (185, 48, 223): high R, low G, high B
        let out = compute_tinted("#b930df", ICON_ACTIVATED_DARK, MASK_PNG_BYTES)
            .expect("compute_tinted returned None");
        let mut tinted = 0u32;
        let mut total = 0u32;
        for p in out.pixels() {
            total += 1;
            if p[0] > 120 && p[1] < 120 && p[2] > 120 {
                tinted += 1;
            }
        }
        assert!(total > 0, "icon had no pixels");
        assert!(
            tinted > 0,
            "compute_tinted produced NO tinted (purple) pixels; mask check likely failing (tinted={tinted}/{total})"
        );
    }
}
