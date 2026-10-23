use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};

use crate::engine::mouse::{current_cursor_position, current_monitor_rects, VirtualScreenRect};
use crate::error::poisoned_inner;
use crate::ClickerState;

pub const WINDOW_LABEL: &str = "indicator";
pub const CONFIG_EVENT: &str = "indicator-config";
pub const PULSE_EVENT: &str = "indicator-pulse";
pub const SCHEDULE_EVENT: &str = "indicator-schedule";

const MIN_PULSE_GAP_MS: u64 = 16;
const MONITOR_CACHE_MS: u64 = 1000;
const DEFAULT_ACCENT: &str = "#22c55e";
const PREVIEW_HOLD: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndicatorConfig {
    pub enabled: bool,
    pub corner: String,
    pub size: u32,
    pub offset_x: u32,
    pub offset_y: u32,
    pub color_mode: String,
    pub accent_hex: String,
    pub custom_hex: String,
    pub flash_enabled: bool,
    pub flash_dim: u32,
    pub countdown_enabled: bool,
    pub countdown_mode: String,
    pub background_mode: String,
    pub background_strength: u32,
    pub theme: String,
}

impl Default for IndicatorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            corner: String::from("top-right"),
            size: 32,
            offset_x: 24,
            offset_y: 24,
            color_mode: String::from("theme"),
            accent_hex: String::from(DEFAULT_ACCENT),
            custom_hex: String::from("#ffffff"),
            flash_enabled: false,
            flash_dim: 25,
            countdown_enabled: false,
            countdown_mode: String::from("words"),
            background_mode: String::from("card"),
            background_strength: 100,
            theme: String::from("dark"),
        }
    }
}

impl IndicatorConfig {
    fn sanitized(mut self) -> Self {
        self.size = self.size.clamp(16, 512);
        self.flash_dim = self.flash_dim.min(100);
        self
    }

    fn same_indicator_settings(&self, other: &Self) -> bool {
        self.enabled == other.enabled
            && self.corner == other.corner
            && self.size == other.size
            && self.offset_x == other.offset_x
            && self.offset_y == other.offset_y
            && self.color_mode == other.color_mode
            && self.custom_hex == other.custom_hex
            && self.flash_enabled == other.flash_enabled
            && self.flash_dim == other.flash_dim
            && self.countdown_enabled == other.countdown_enabled
            && self.countdown_mode == other.countdown_mode
            && self.background_mode == other.background_mode
            && self.background_strength == other.background_strength
    }

    pub fn color_hex(&self) -> String {
        match self.color_mode.as_str() {
            "black" => String::from("#000000"),
            "white" => String::from("#ffffff"),
            "custom" => normalize_hex(&self.custom_hex).unwrap_or_else(|| String::from("#ffffff")),
            _ => normalize_hex(&self.accent_hex).unwrap_or_else(|| String::from(DEFAULT_ACCENT)),
        }
    }
}

pub fn normalize_hex(value: &str) -> Option<String> {
    let digits = value.strip_prefix('#').unwrap_or(value);
    if digits.len() != 6 {
        return None;
    }
    let (r, g, b) = (digits.get(0..2)?, digits.get(2..4)?, digits.get(4..6)?);
    if !r
        .bytes()
        .chain(g.bytes())
        .chain(b.bytes())
        .all(|b| b.is_ascii_hexdigit())
    {
        return None;
    }
    Some(format!("#{}", digits.to_ascii_lowercase()))
}

pub fn scale_px(value: f64, dpi: u32) -> i32 {
    (value * (dpi as f64) / 96.0).round() as i32
}

pub const COUNTDOWN_GAP: f64 = 4.0;
pub const COUNTDOWN_LINE: f64 = 1.15;
pub const COUNTDOWN_PAD_V: f64 = 2.0;
pub const COUNTDOWN_PAD_H: f64 = 12.0;
pub const COUNTDOWN_WIDTH_EM: f64 = 7.6;
pub const COUNTDOWN_SHORT_WIDTH_EM: f64 = 8.8;
pub const COUNTDOWN_WORDS_WIDTH_EM: f64 = 12.0;

pub fn countdown_font(size: u32) -> f64 {
    ((size as f64) * 0.30).clamp(10.0, 24.0)
}

pub fn countdown_width_em(mode: &str) -> Option<f64> {
    match mode {
        "words" => Some(COUNTDOWN_WORDS_WIDTH_EM),
        "short" => Some(COUNTDOWN_SHORT_WIDTH_EM),
        "plain" => Some(COUNTDOWN_WIDTH_EM),
        _ => None,
    }
}

pub fn countdown_active(config: &IndicatorConfig) -> bool {
    config.countdown_enabled
}

pub const CARD_PAD_RATIO: f64 = 0.12;
pub const CARD_PAD_MIN: f64 = 6.0;
pub const CARD_PAD_MAX: f64 = 18.0;
pub const SHADOW_PAD_RATIO: f64 = 0.22;
pub const SHADOW_PAD_MIN: f64 = 4.0;
pub const SHADOW_PAD_MAX: f64 = 26.0;

pub fn background_pad(config: &IndicatorConfig) -> f64 {
    let size = config.size.clamp(16, 512) as f64;
    match config.background_mode.as_str() {
        "card" => (size * CARD_PAD_RATIO).clamp(CARD_PAD_MIN, CARD_PAD_MAX),
        "shadow" => (size * SHADOW_PAD_RATIO).clamp(SHADOW_PAD_MIN, SHADOW_PAD_MAX),
        _ => 0.0,
    }
}

fn content_size(config: &IndicatorConfig) -> (f64, f64) {
    let glyph = config.size.clamp(16, 512) as f64;
    if !countdown_active(config) {
        return (glyph, glyph);
    }
    let Some(width_em) = countdown_width_em(&config.countdown_mode) else {
        return (glyph, glyph);
    };
    let font = countdown_font(config.size);
    let height = glyph + COUNTDOWN_GAP + font * COUNTDOWN_LINE + COUNTDOWN_PAD_V;
    let width = glyph.max(font * width_em + COUNTDOWN_PAD_H);
    (width, height)
}

pub fn block_size(config: &IndicatorConfig) -> (f64, f64) {
    let (width, height) = content_size(config);
    let pad = background_pad(config);
    (width + pad * 2.0, height + pad * 2.0)
}

pub fn corner_position(
    corner: &str,
    monitor: VirtualScreenRect,
    width: i32,
    height: i32,
    offset_x: i32,
    offset_y: i32,
) -> (i32, i32) {
    let left = monitor.left;
    let top = monitor.top;
    let right = monitor.right();
    let bottom = monitor.bottom();

    let (x, y) = match corner {
        "top-left" => (left + offset_x, top + offset_y),
        "bottom-right" => (right - offset_x - width, bottom - offset_y - height),
        "bottom-left" => (left + offset_x, bottom - offset_y - height),
        _ => (right - offset_x - width, top + offset_y),
    };

    let max_x = (monitor.width - width).max(0);
    let max_y = (monitor.height - height).max(0);
    (x.clamp(left, left + max_x), y.clamp(top, top + max_y))
}

pub fn block_position(
    corner: &str,
    monitor: VirtualScreenRect,
    glyph: i32,
    width: i32,
    height: i32,
    offset_x: i32,
    offset_y: i32,
) -> (i32, i32) {
    let (ax, ay) = corner_position(corner, monitor, glyph, glyph, offset_x, offset_y);
    let x = ax - (width - glyph) / 2;
    let y = if corner.starts_with("bottom") {
        ay - (height - glyph)
    } else {
        ay
    };
    (x, y)
}

fn should_pulse(last_ms: u64, now_ms: u64) -> bool {
    last_ms == 0 || now_ms.saturating_sub(last_ms) >= MIN_PULSE_GAP_MS
}

fn hold_clamped(hold_ms: u32) -> u64 {
    hold_ms.max(16) as u64
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static CONFIG: Mutex<Option<IndicatorConfig>> = Mutex::new(None);
static VISIBLE: AtomicBool = AtomicBool::new(false);
static PULSE_LAST_MS: AtomicU64 = AtomicU64::new(0);
static START: OnceLock<Instant> = OnceLock::new();

static CURRENT_MONITOR: Mutex<Option<VirtualScreenRect>> = Mutex::new(None);
static MONITORS: Mutex<Vec<VirtualScreenRect>> = Mutex::new(Vec::new());
static MONITORS_AT: AtomicU64 = AtomicU64::new(0);
static PREVIEW_DEADLINE_MS: AtomicU64 = AtomicU64::new(0);
static PREVIEW_TIMER_ACTIVE: AtomicBool = AtomicBool::new(false);
static ENABLED: AtomicBool = AtomicBool::new(false);
static FLASH_ENABLED: AtomicBool = AtomicBool::new(false);
static COUNTDOWN: AtomicBool = AtomicBool::new(false);
static SCHEDULE_LAST_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn current_config() -> IndicatorConfig {
    CONFIG
        .lock()
        .unwrap_or_else(poisoned_inner)
        .clone()
        .unwrap_or_default()
}

fn store_config(config: &IndicatorConfig) {
    *CONFIG.lock().unwrap_or_else(poisoned_inner) = Some(config.clone());
}

fn pick_monitor(
    monitors: &[VirtualScreenRect],
    point: Option<(i32, i32)>,
) -> Option<VirtualScreenRect> {
    point
        .and_then(|(x, y)| monitors.iter().find(|m| m.contains(x, y)))
        .or_else(|| monitors.first())
        .copied()
}

fn monitor_at(point: Option<(i32, i32)>) -> Option<VirtualScreenRect> {
    let now = now_ms();
    {
        let monitors = MONITORS.lock().unwrap_or_else(poisoned_inner);
        let fresh = !monitors.is_empty()
            && now.saturating_sub(MONITORS_AT.load(Ordering::Relaxed)) < MONITOR_CACHE_MS;
        if fresh {
            return pick_monitor(&monitors, point);
        }
    }
    if let Some(list) = current_monitor_rects() {
        if !list.is_empty() {
            *MONITORS.lock().unwrap_or_else(poisoned_inner) = list;
            MONITORS_AT.store(now, Ordering::Relaxed);
        }
    }
    pick_monitor(&MONITORS.lock().unwrap_or_else(poisoned_inner), point)
}

#[cfg(target_os = "windows")]
fn dpi_for_monitor(monitor: VirtualScreenRect) -> u32 {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONEAREST};
    use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    let point = POINT {
        x: monitor.left + monitor.width / 2,
        y: monitor.top + monitor.height / 2,
    };
    unsafe {
        let handle = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
        if handle.is_null() {
            return 96;
        }
        let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
        let hr = GetDpiForMonitor(handle, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        if hr < 0 || dpi_x == 0 {
            96
        } else {
            dpi_x
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn dpi_for_monitor(_monitor: VirtualScreenRect) -> u32 {
    96
}

pub fn init(app: &AppHandle) {
    if APP.get().is_some() {
        return;
    }
    let _ = APP.set(app.clone());

    if app.get_webview_window(WINDOW_LABEL).is_some() {
        return;
    }

    let data_dir = crate::portable::webview_dir("indicator").unwrap_or_else(|| {
        app.path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("EBWebView-indicator")
    });

    let built = tauri::WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::App("indicator.html".into()),
    )
    .title("Click Indicator")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .visible(false)
    .skip_taskbar(true)
    .focusable(false)
    .shadow(false)
    .resizable(false)
    .inner_size(32.0, 32.0)
    .data_directory(data_dir)
    .build();

    match built {
        Ok(window) => {
            if let Err(e) = window.set_ignore_cursor_events(true) {
                log::warn!("[indicator] ignore_cursor_events failed: {e}");
            }
            watch_scale_factor(app, &window);
        }
        Err(e) => log::warn!("[indicator] window creation failed: {e}"),
    }
}

fn watch_scale_factor(app: &AppHandle, window: &tauri::WebviewWindow) {
    let handle = app.clone();
    window.on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. }) {
            return;
        }
        let Some(monitor) = *CURRENT_MONITOR.lock().unwrap_or_else(poisoned_inner) else {
            return;
        };
        place(&handle, monitor, &current_config());
    });
}

pub fn apply_config(config: IndicatorConfig) {
    let config = config.sanitized();
    let changed = {
        let stored = CONFIG.lock().unwrap_or_else(poisoned_inner);
        stored
            .as_ref()
            .is_none_or(|previous| !previous.same_indicator_settings(&config))
    };
    store_config(&config);
    ENABLED.store(config.enabled, Ordering::SeqCst);
    FLASH_ENABLED.store(config.flash_enabled, Ordering::SeqCst);
    COUNTDOWN.store(countdown_active(&config), Ordering::SeqCst);
    emit_config(&config);

    let Some(app) = APP.get() else {
        return;
    };

    if !config.enabled {
        hide(app);
        return;
    }

    if is_clicker_running(app) {
        if VISIBLE.load(Ordering::SeqCst) {
            let monitor = *CURRENT_MONITOR.lock().unwrap_or_else(poisoned_inner);
            if let Some(monitor) = monitor {
                place(app, monitor, &config);
            }
        } else {
            present(app, &config);
        }
        return;
    }

    if changed && settings_initialized(app) {
        present(app, &config);
        start_preview_timer(app);
    }
}

pub fn set_active(active: bool) {
    let Some(app) = APP.get() else {
        return;
    };
    if !active {
        if now_ms() < PREVIEW_DEADLINE_MS.load(Ordering::SeqCst) {
            return;
        }
        hide(app);
        return;
    }
    let config = current_config();
    if !config.enabled {
        log::info!("[indicator] activate ignored: disabled");
        hide(app);
        return;
    }

    log::info!("[indicator] activate");
    emit_config(&config);
    present(app, &config);
}

fn present(app: &AppHandle, config: &IndicatorConfig) {
    if let Some(monitor) = monitor_at(current_cursor_position()) {
        *CURRENT_MONITOR.lock().unwrap_or_else(poisoned_inner) = Some(monitor);
        place(app, monitor, config);
    }
    VISIBLE.store(true, Ordering::SeqCst);
    show(app);
}

fn start_preview_timer(app: &AppHandle) {
    PREVIEW_DEADLINE_MS.store(now_ms() + PREVIEW_HOLD.as_millis() as u64, Ordering::SeqCst);
    if PREVIEW_TIMER_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }

    let handle = app.clone();
    let spawned = std::thread::Builder::new()
        .name("indicator-preview".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(50));
            if now_ms() < PREVIEW_DEADLINE_MS.load(Ordering::SeqCst) {
                continue;
            }

            let hide_handle = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                if now_ms() < PREVIEW_DEADLINE_MS.load(Ordering::SeqCst) {
                    return;
                }
                if is_clicker_running(&hide_handle) {
                    PREVIEW_DEADLINE_MS.store(0, Ordering::SeqCst);
                    return;
                }
                hide(&hide_handle);
            });

            PREVIEW_TIMER_ACTIVE.store(false, Ordering::SeqCst);
            if now_ms() < PREVIEW_DEADLINE_MS.load(Ordering::SeqCst) {
                if PREVIEW_TIMER_ACTIVE.swap(true, Ordering::SeqCst) {
                    return;
                }
                continue;
            }
            return;
        });

    if spawned.is_err() {
        PREVIEW_TIMER_ACTIVE.store(false, Ordering::SeqCst);
        PREVIEW_DEADLINE_MS.store(0, Ordering::SeqCst);
    }
}

fn is_clicker_running(app: &AppHandle) -> bool {
    app.state::<ClickerState>().running.load(Ordering::SeqCst)
}

fn settings_initialized(app: &AppHandle) -> bool {
    app.state::<ClickerState>()
        .settings_initialized
        .load(Ordering::SeqCst)
}

pub fn pulse(hold_ms: u32, x: i32, y: i32) {
    if !VISIBLE.load(Ordering::SeqCst) || !ENABLED.load(Ordering::SeqCst) {
        return;
    }

    let Some(app) = APP.get() else {
        return;
    };

    if let Some(monitor) = monitor_at(Some((x, y))) {
        let changed = {
            let mut current = CURRENT_MONITOR.lock().unwrap_or_else(poisoned_inner);
            if *current == Some(monitor) {
                false
            } else {
                *current = Some(monitor);
                true
            }
        };
        if changed {
            place(app, monitor, &current_config());
        }
    }

    if !FLASH_ENABLED.load(Ordering::SeqCst) {
        return;
    }
    let now = now_ms();
    if !should_pulse(PULSE_LAST_MS.load(Ordering::Relaxed), now) {
        return;
    }
    PULSE_LAST_MS.store(now, Ordering::Relaxed);

    let payload = PulsePayload {
        hold_ms: hold_clamped(hold_ms) as u32,
    };
    if let Err(e) = app.emit_to(WINDOW_LABEL, PULSE_EVENT, payload) {
        log::warn!("[indicator] pulse emit failed: {e}");
    }
}

pub fn schedule(cycle_start_ms: u64, hold_ms: u64, wait_ms: u64) {
    if !VISIBLE.load(Ordering::SeqCst) || !COUNTDOWN.load(Ordering::SeqCst) {
        return;
    }
    let now = now_ms();
    if !should_pulse(SCHEDULE_LAST_MS.load(Ordering::Relaxed), now) {
        return;
    }
    SCHEDULE_LAST_MS.store(now, Ordering::Relaxed);

    let Some(app) = APP.get() else {
        return;
    };
    let payload = SchedulePayload {
        cycle_start_ms,
        hold_ms,
        wait_ms,
    };
    if let Err(e) = app.emit_to(WINDOW_LABEL, SCHEDULE_EVENT, payload) {
        log::warn!("[indicator] schedule emit failed: {e}");
    }
}

pub fn shutdown() {
    if let Some(app) = APP.get() {
        hide(app);
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorStatus {
    pub enabled: bool,
    pub color: String,
    pub flash_enabled: bool,
    pub flash_dim: u32,
    pub size: u32,
    pub active: bool,
    pub theme: String,
    pub corner: String,
    pub countdown: bool,
    pub countdown_mode: String,
    pub countdown_font: f64,
    pub background_mode: String,
    pub background_strength: u32,
    pub background_pad: f64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PulsePayload {
    hold_ms: u32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SchedulePayload {
    cycle_start_ms: u64,
    hold_ms: u64,
    wait_ms: u64,
}

fn config_payload(config: &IndicatorConfig) -> IndicatorStatus {
    IndicatorStatus {
        enabled: config.enabled,
        color: config.color_hex(),
        flash_enabled: config.flash_enabled,
        flash_dim: config.flash_dim.min(100),
        size: config.size.clamp(16, 512),
        active: VISIBLE.load(Ordering::SeqCst),
        theme: config.theme.clone(),
        corner: config.corner.clone(),
        countdown: countdown_active(config),
        countdown_mode: config.countdown_mode.clone(),
        countdown_font: countdown_font(config.size),
        background_mode: config.background_mode.clone(),
        background_strength: config.background_strength.min(100),
        background_pad: background_pad(config),
    }
}

fn emit_config(config: &IndicatorConfig) {
    let Some(app) = APP.get() else {
        return;
    };
    if let Err(e) = app.emit_to(WINDOW_LABEL, CONFIG_EVENT, config_payload(config)) {
        log::warn!("[indicator] config emit failed: {e}");
    }
}

pub fn config_snapshot() -> IndicatorStatus {
    config_payload(&current_config())
}

fn place(app: &AppHandle, monitor: VirtualScreenRect, config: &IndicatorConfig) {
    let dpi = dpi_for_monitor(monitor);
    let (logical_w, logical_h) = block_size(config);
    let width = scale_px(logical_w, dpi).max(1);
    let height = scale_px(logical_h, dpi).max(1);
    let (x, y) = if background_pad(config) > 0.0 {
        corner_position(
            &config.corner,
            monitor,
            width,
            height,
            scale_px(config.offset_x as f64, dpi),
            scale_px(config.offset_y as f64, dpi),
        )
    } else {
        let glyph = scale_px(config.size.clamp(16, 512) as f64, dpi).max(1);
        block_position(
            &config.corner,
            monitor,
            glyph,
            width,
            height,
            scale_px(config.offset_x as f64, dpi),
            scale_px(config.offset_y as f64, dpi),
        )
    };

    let handle = app.clone();
    log::debug!(
        "[indicator] place monitor={:?} dpi={} block={}x{} at {},{}",
        monitor,
        dpi,
        width,
        height,
        x,
        y
    );
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window(WINDOW_LABEL) else {
            return;
        };
        if let Err(e) = window.set_size(PhysicalSize::new(width as u32, height as u32)) {
            log::warn!("[indicator] set_size failed: {e}");
        }
        if let Err(e) = window.set_position(PhysicalPosition::new(x, y)) {
            log::warn!("[indicator] set_position failed: {e}");
        }
    });
}

fn show(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window(WINDOW_LABEL) else {
            return;
        };
        if let Err(e) = window.show() {
            log::warn!("[indicator] show failed: {e}");
        }
    });
}

fn hide(app: &AppHandle) {
    if !VISIBLE.swap(false, Ordering::SeqCst) {
        return;
    }
    PULSE_LAST_MS.store(0, Ordering::Relaxed);
    SCHEDULE_LAST_MS.store(0, Ordering::Relaxed);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window(WINDOW_LABEL) else {
            return;
        };
        if let Err(e) = window.hide() {
            log::warn!("[indicator] hide failed: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor() -> VirtualScreenRect {
        VirtualScreenRect::new(0, 0, 1920, 1080)
    }

    #[test]
    fn pick_monitor_uses_the_containing_rect_and_falls_back_to_the_first() {
        let left = VirtualScreenRect::new(-1920, 0, 1920, 1080);
        let right = monitor();
        let monitors = [left, right];

        assert_eq!(pick_monitor(&monitors, Some((10, 10))), Some(right));
        assert_eq!(pick_monitor(&monitors, Some((-10, 10))), Some(left));
        assert_eq!(pick_monitor(&monitors, Some((9000, 9000))), Some(left));
        assert_eq!(pick_monitor(&monitors, None), Some(left));
        assert_eq!(pick_monitor(&[], Some((0, 0))), None);
    }

    #[test]
    fn normalize_hex_accepts_hash_and_plain() {
        assert_eq!(normalize_hex("#22C55E"), Some(String::from("#22c55e")));
        assert_eq!(normalize_hex("22c55e"), Some(String::from("#22c55e")));
        assert_eq!(normalize_hex("#ffffff"), Some(String::from("#ffffff")));
    }

    #[test]
    fn normalize_hex_rejects_bad_input() {
        for bad in ["", "red", "#fff", "#22c55", "#22c55e00", "#zzzzzz"] {
            assert_eq!(normalize_hex(bad), None, "{bad} should be rejected");
        }
        assert_eq!(normalize_hex("aééb"), None);
    }

    #[test]
    fn color_modes_resolve_to_hex() {
        let mut config = IndicatorConfig {
            color_mode: String::from("theme"),
            accent_hex: String::from("#123456"),
            ..IndicatorConfig::default()
        };
        assert_eq!(config.color_hex(), "#123456");
        config.color_mode = String::from("black");
        assert_eq!(config.color_hex(), "#000000");
        config.color_mode = String::from("white");
        assert_eq!(config.color_hex(), "#ffffff");
        config.color_mode = String::from("custom");
        config.custom_hex = String::from("#abcdef");
        assert_eq!(config.color_hex(), "#abcdef");
        config.color_mode = String::from("rainbow");
        config.accent_hex = String::from("nope");
        assert_eq!(config.color_hex(), DEFAULT_ACCENT);
        config.color_mode = String::from("custom");
        config.custom_hex = String::from("nope");
        assert_eq!(config.color_hex(), "#ffffff");
    }

    #[test]
    fn corners_place_the_window_against_the_right_edges() {
        let m = monitor();
        assert_eq!(
            corner_position("top-right", m, 100, 100, 24, 24),
            (1796, 24)
        );
        assert_eq!(corner_position("top-left", m, 100, 100, 24, 24), (24, 24));
        assert_eq!(
            corner_position("bottom-right", m, 100, 100, 24, 24),
            (1796, 956)
        );
        assert_eq!(
            corner_position("bottom-left", m, 100, 100, 24, 24),
            (24, 956)
        );
        assert_eq!(corner_position("middle", m, 100, 100, 24, 24), (1796, 24));
    }

    #[test]
    fn corners_clamp_absurd_offsets_inside_the_monitor() {
        let m = monitor();
        assert_eq!(
            corner_position("top-right", m, 100, 100, 5000, 5000),
            (0, 980)
        );
        assert_eq!(corner_position("bottom-left", m, 100, 100, 0, 5000), (0, 0));
        let left = VirtualScreenRect::new(-1920, 0, 1920, 1080);
        assert_eq!(
            corner_position("top-right", left, 100, 100, 24, 24),
            (-124, 24)
        );
        assert_eq!(
            corner_position("bottom-left", left, 100, 100, 24, 24),
            (-1896, 956)
        );
    }

    #[test]
    fn scale_px_handles_dpi_steps() {
        assert_eq!(scale_px(72.0, 96), 72);
        assert_eq!(scale_px(72.0, 144), 108);
        assert_eq!(scale_px(72.0, 192), 144);
        assert_eq!(scale_px(0.0, 144), 0);
        assert_eq!(scale_px(76.6, 120), 96);
    }

    #[test]
    fn background_pad_follows_the_mode() {
        let mut config = IndicatorConfig {
            size: 32,
            background_mode: String::from("off"),
            ..IndicatorConfig::default()
        };
        assert_eq!(background_pad(&config), 0.0);

        config.background_mode = String::from("card");
        assert!(close(background_pad(&config), 6.0));

        config.background_mode = String::from("shadow");
        assert!(close(background_pad(&config), 7.04));

        config.size = 132;
        assert!(close(background_pad(&config), 26.0));

        config.background_mode = String::from("card");
        assert!(close(background_pad(&config), 15.84));
    }

    #[test]
    fn block_size_grows_with_the_card_padding() {
        let config = IndicatorConfig {
            size: 32,
            background_mode: String::from("card"),
            ..IndicatorConfig::default()
        };
        let (width, height) = block_size(&config);
        assert!(close(width, 44.0), "width was {width}");
        assert!(close(height, 44.0), "height was {height}");
    }

    #[test]
    fn countdown_font_scales_with_the_glyph() {
        assert_eq!(countdown_font(16), 10.0);
        assert_eq!(countdown_font(32), 10.0);
        assert_eq!(countdown_font(64), 19.2);
        assert_eq!(countdown_font(512), 24.0);
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 0.001
    }

    #[test]
    fn block_size_only_grows_for_the_countdown() {
        let plain = IndicatorConfig {
            size: 32,
            background_mode: String::from("off"),
            ..IndicatorConfig::default()
        };
        assert_eq!(block_size(&plain), (32.0, 32.0));

        let with_text = IndicatorConfig {
            size: 32,
            countdown_enabled: true,
            countdown_mode: String::from("short"),
            background_mode: String::from("off"),
            ..IndicatorConfig::default()
        };
        let (width, height) = block_size(&with_text);
        assert!(close(width, 100.0), "width was {width}");
        assert!(close(height, 49.5), "height was {height}");

        let short = IndicatorConfig {
            size: 16,
            countdown_enabled: true,
            countdown_mode: String::from("words"),
            background_mode: String::from("off"),
            ..IndicatorConfig::default()
        };
        let (width, height) = block_size(&short);
        assert!(close(width, 132.0), "width was {width}");
        assert!(close(height, 33.5), "height was {height}");

        let large = IndicatorConfig {
            size: 120,
            countdown_enabled: true,
            countdown_mode: String::from("short"),
            background_mode: String::from("off"),
            ..IndicatorConfig::default()
        };
        let (width, height) = block_size(&large);
        assert!(close(width, 223.2), "width was {width}");
        assert!(close(height, 153.6), "height was {height}");
    }

    #[test]
    fn block_position_keeps_the_glyph_on_its_offset() {
        let m = monitor();
        let (x, y) = block_position("top-right", m, 32, 88, 50, 24, 24);
        assert_eq!((x, y), (1836, 24));
        assert_eq!(x + 44, 1864 + 16);

        let (x, y) = block_position("top-left", m, 32, 88, 50, 24, 24);
        assert_eq!((x, y), (-4, 24));

        let (x, y) = block_position("bottom-right", m, 32, 88, 50, 24, 24);
        assert_eq!((x, y), (1836, 1006));

        let (x, y) = block_position("bottom-left", m, 32, 88, 50, 24, 24);
        assert_eq!((x, y), (-4, 1006));
    }

    #[test]
    fn pulse_gate_allows_one_pulse_per_frame() {
        assert!(should_pulse(0, 5_000));
        assert!(!should_pulse(1_000, 1_015));
        assert!(should_pulse(1_000, 1_016));
        assert!(should_pulse(1_000, 2_000));
    }

    #[test]
    fn hold_is_clamped_to_visible_bounds() {
        assert_eq!(hold_clamped(0), 16);
        assert_eq!(hold_clamped(16), 16);
        assert_eq!(hold_clamped(250), 250);
        assert_eq!(hold_clamped(2_500), 2_500);
        assert_eq!(hold_clamped(120_000), 120_000);
    }

    #[test]
    fn sanitize_clamps_size_and_dim() {
        let config = IndicatorConfig {
            size: 5000,
            flash_dim: 900,
            ..IndicatorConfig::default()
        }
        .sanitized();
        assert_eq!(config.size, 512);
        assert_eq!(config.flash_dim, 100);

        let small = IndicatorConfig {
            size: 0,
            ..IndicatorConfig::default()
        }
        .sanitized();
        assert_eq!(small.size, 16);
    }

    #[test]
    fn accent_and_theme_changes_do_not_count_as_indicator_changes() {
        let base = IndicatorConfig::default();
        let recolored = IndicatorConfig {
            accent_hex: String::from("#123456"),
            theme: String::from("light"),
            ..base.clone()
        };
        assert!(base.same_indicator_settings(&recolored));

        let resized = IndicatorConfig {
            size: 40,
            ..base.clone()
        };
        assert!(!base.same_indicator_settings(&resized));

        let countdown = IndicatorConfig {
            countdown_enabled: true,
            ..base.clone()
        };
        assert!(!base.same_indicator_settings(&countdown));
    }

    #[test]
    fn default_config_matches_the_settings_contract() {
        let config = IndicatorConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.corner, "top-right");
        assert_eq!(config.size, 32);
        assert_eq!((config.offset_x, config.offset_y), (24, 24));
        assert_eq!(config.color_mode, "theme");
        assert_eq!(config.accent_hex, DEFAULT_ACCENT);
        assert!(!config.flash_enabled);
        assert_eq!(config.flash_dim, 25);
        assert_eq!(config.countdown_mode, "words");
        assert!(!config.countdown_enabled);
        assert_eq!(config.background_mode, "card");
        assert_eq!(config.background_strength, 100);
    }
}
