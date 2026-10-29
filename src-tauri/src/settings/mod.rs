// Mirror of the descriptor-driven frontend schema in `src/settingsSchema.ts`.
// When adding or changing a backend-facing setting, keep the section and
// default in sync with the TypeScript field definitions.

#[derive(Clone, serde::Deserialize, serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickPoint {
    #[serde(default)]
    pub id: String,
    pub x: i32,
    pub y: i32,
    #[serde(default = "default_click_point_clicks")]
    pub clicks: u32,
    #[serde(default)]
    pub radius: u32,
}

fn default_click_point_clicks() -> u32 {
    1
}

fn default_keyboard_key_case() -> String {
    "lower".to_string()
}

fn default_true() -> bool {
    true
}

fn default_indicator_corner() -> String {
    "top-right".to_string()
}

fn default_indicator_color_mode() -> String {
    "theme".to_string()
}

fn default_indicator_custom_color() -> String {
    "#ffffff".to_string()
}

fn default_indicator_size() -> u32 {
    32
}

fn default_indicator_offset() -> u32 {
    24
}

fn default_indicator_flash_dim() -> u32 {
    25
}

fn default_indicator_countdown_mode() -> String {
    "words".to_string()
}

fn default_indicator_background_mode() -> String {
    "card".to_string()
}

fn default_indicator_background_strength() -> u32 {
    100
}

use crate::engine::ProcessListEntry;

#[derive(Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StopZoneConfig {
    #[serde(default)]
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default = "default_stop_zone_action")]
    pub action: String,
}

fn default_stop_zone_action() -> String {
    "stop".to_string()
}

#[derive(Clone, serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClickerSettings {
    // Meta
    pub version: u32,

    // Preset snapshot fields
    pub click_speed: f64,
    pub click_interval: String,
    pub input_type: String,
    pub keyboard_key: String,
    #[serde(default = "default_keyboard_key_case")]
    pub keyboard_key_case: String,
    pub mouse_button: String,
    pub mode: String,

    pub duty_cycle_mode: String,
    pub saved_click_speed: f64,
    pub saved_click_interval: String,

    pub duty_cycle_enabled: bool,
    pub duty_cycle: f64,

    pub speed_randomization_enabled: bool,
    pub speed_randomization: f64,

    pub double_click_enabled: bool,

    pub click_limit_enabled: bool,
    pub click_limit: i32,

    pub time_limit_enabled: bool,
    pub time_limit: f64,
    pub time_limit_unit: String,

    pub corner_stop_enabled: bool,
    #[serde(rename = "cornerStopTL")]
    pub corner_stop_tl: i32,
    #[serde(rename = "cornerStopTR")]
    pub corner_stop_tr: i32,
    #[serde(rename = "cornerStopBL")]
    pub corner_stop_bl: i32,
    #[serde(rename = "cornerStopBR")]
    pub corner_stop_br: i32,

    pub edge_stop_enabled: bool,
    pub edge_stop_top: i32,
    pub edge_stop_right: i32,
    pub edge_stop_bottom: i32,
    pub edge_stop_left: i32,

    pub click_points_enabled: bool,
    #[serde(rename = "stopZonesEnabled")]
    pub stop_zones_enabled: bool,
    #[serde(default)]
    pub stop_when_complete: bool,
    pub click_points: Vec<ClickPoint>,

    pub process_list_enabled: bool,
    pub process_list_mode: String,
    pub process_list_entries: Vec<ProcessListEntry>,

    // settings-only fields
    #[serde(default = "default_true")]
    pub task_switcher_stop_enabled: bool,
    pub hotkey: String,
    pub rate_input_mode: String,
    pub duration_hours: u32,
    pub duration_minutes: u32,
    pub duration_seconds: u32,
    pub duration_milliseconds: u32,

    #[serde(default)]
    pub stop_zones: Vec<StopZoneConfig>,

    pub disable_screenshots: bool,
    pub advanced_settings_enabled: bool,
    pub last_panel: String,
    pub show_stop_reason: bool,
    pub show_stop_overlay: bool,
    pub strict_hotkey_modifiers: bool,
    #[serde(default)]
    pub minimize_to_tray: bool,

    #[serde(default = "default_true")]
    pub indicator_enabled: bool,
    #[serde(default = "default_indicator_corner")]
    pub indicator_corner: String,
    #[serde(default = "default_indicator_color_mode")]
    pub indicator_color_mode: String,
    #[serde(default = "default_indicator_custom_color")]
    pub indicator_custom_color: String,
    #[serde(default = "default_indicator_size")]
    pub indicator_size: u32,
    #[serde(default = "default_indicator_offset")]
    pub indicator_offset_x: u32,
    #[serde(default = "default_indicator_offset")]
    pub indicator_offset_y: u32,
    #[serde(default)]
    pub indicator_flash_enabled: bool,
    #[serde(default = "default_indicator_flash_dim")]
    pub indicator_flash_dim: u32,
    #[serde(default)]
    pub indicator_countdown_enabled: bool,
    #[serde(default = "default_indicator_countdown_mode")]
    pub indicator_countdown_mode: String,
    #[serde(default = "default_indicator_background_mode")]
    pub indicator_background_mode: String,
    #[serde(default = "default_indicator_background_strength")]
    pub indicator_background_strength: u32,
}

// Frontend-only settings intentionally omitted from Rust:
// language, minimizeToTray, theme, alwaysOnTop, accentColor, presets,
// activePresetId.

impl Default for ClickerSettings {
    fn default() -> Self {
        Self {
            // Meta
            version: 11,

            // Preset snapshot fields
            click_speed: 25.0,
            click_interval: "s".to_string(),
            input_type: "mouse".to_string(),
            keyboard_key: String::new(),
            keyboard_key_case: default_keyboard_key_case(),
            mouse_button: "Left".to_string(),
            mode: "Toggle".to_string(),

            duty_cycle_mode: "Click".to_string(),
            saved_click_speed: 25.0,
            saved_click_interval: "s".to_string(),

            duty_cycle_enabled: true,
            duty_cycle: 45.0,

            speed_randomization_enabled: true,
            speed_randomization: 35.0,

            double_click_enabled: false,

            click_limit_enabled: false,
            click_limit: 1000,

            time_limit_enabled: false,
            time_limit: 60.0,
            time_limit_unit: "s".to_string(),

            corner_stop_enabled: true,
            corner_stop_tl: 50,
            corner_stop_tr: 50,
            corner_stop_bl: 50,
            corner_stop_br: 50,

            edge_stop_enabled: true,
            edge_stop_top: 40,
            edge_stop_right: 40,
            edge_stop_bottom: 40,
            edge_stop_left: 40,

            click_points_enabled: false,
            stop_zones_enabled: false,
            stop_when_complete: false,
            click_points: Vec::new(),

            process_list_enabled: false,
            process_list_mode: "whitelist".to_string(),
            process_list_entries: Vec::new(),

            // settings-only defaults
            task_switcher_stop_enabled: true,
            hotkey: "ctrl+y".to_string(),
            rate_input_mode: "rate".to_string(),
            duration_hours: 0,
            duration_minutes: 0,
            duration_seconds: 0,
            duration_milliseconds: 40,

            stop_zones: Vec::new(),

            disable_screenshots: false,
            advanced_settings_enabled: true,
            last_panel: "simple".to_string(),
            show_stop_reason: true,
            show_stop_overlay: true,
            strict_hotkey_modifiers: false,
            minimize_to_tray: false,

            indicator_enabled: true,
            indicator_corner: default_indicator_corner(),
            indicator_color_mode: default_indicator_color_mode(),
            indicator_custom_color: default_indicator_custom_color(),
            indicator_size: default_indicator_size(),
            indicator_offset_x: default_indicator_offset(),
            indicator_offset_y: default_indicator_offset(),
            indicator_flash_enabled: false,
            indicator_flash_dim: default_indicator_flash_dim(),
            indicator_countdown_enabled: false,
            indicator_countdown_mode: default_indicator_countdown_mode(),
            indicator_background_mode: default_indicator_background_mode(),
            indicator_background_strength: default_indicator_background_strength(),
        }
    }
}

/// Inclusive bounds mirroring the `limit` blocks in `src/settingsSchema.ts`. The
/// frontend clamps to these before sending, so a value outside them arrived by
/// walking around the UI.
mod limits {
    pub const CLICK_SPEED: (f64, f64) = (1.0, 1_000.0);
    pub const SAVED_CLICK_SPEED: (f64, f64) = (1.0, f64::MAX);
    pub const DUTY_CYCLE: (f64, f64) = (0.0, 100.0);
    pub const SPEED_RANDOMIZATION: (f64, f64) = (0.0, 200.0);
    pub const TIME_LIMIT: (f64, f64) = (1.0, f64::MAX);
    pub const CLICK_LIMIT: (i32, i32) = (1, 100_000_000);
    pub const STOP_BOUNDARY: (i32, i32) = (0, 10_000);
    pub const CLICK_POINT_CLICKS: (u32, u32) = (1, 999_999);
    pub const CLICK_POINT_RADIUS: (u32, u32) = (0, 9_999);
    pub const INDICATOR_SIZE: (u32, u32) = (16, 512);
    pub const INDICATOR_OFFSET: (u32, u32) = (0, 4_000);
    pub const INDICATOR_FLASH_DIM: (u32, u32) = (0, 100);
    pub const INDICATOR_CORNERS: [&str; 4] =
        ["top-right", "top-left", "bottom-right", "bottom-left"];
    pub const INDICATOR_COLOR_MODES: [&str; 4] = ["theme", "black", "white", "custom"];
    pub const INDICATOR_COUNTDOWN_MODES: [&str; 3] = ["plain", "words", "short"];
    pub const INDICATOR_BACKGROUND_MODES: [&str; 3] = ["off", "card", "shadow"];
    pub const STOP_ZONE_OFFSET: (i32, i32) = (-99_999, 99_999);
    pub const STOP_ZONE_SIZE: (i32, i32) = (1, 99_999);
    pub const STOP_ZONE_ACTIONS: [&str; 3] = ["stop", "pause", "start"];
    pub const STOP_ZONE_MAX_COUNT: usize = 64;
}

/// Non-finite input falls back to `min`: `f64::clamp` propagates NaN, and an
/// infinite interval is exactly what turns into a panic further down.
fn clamp_f64(field: &str, value: &mut f64, (min, max): (f64, f64)) {
    let clamped = if value.is_finite() {
        value.clamp(min, max)
    } else {
        min
    };
    if clamped != *value {
        log::warn!("[Settings] {field} = {value} is outside {min}..={max}, using {clamped}");
        *value = clamped;
    }
}

fn clamp_i32(field: &str, value: &mut i32, (min, max): (i32, i32)) {
    let clamped = (*value).clamp(min, max);
    if clamped != *value {
        log::warn!("[Settings] {field} = {value} is outside {min}..={max}, using {clamped}");
        *value = clamped;
    }
}

fn clamp_u32(field: &str, value: &mut u32, (min, max): (u32, u32)) {
    let clamped = (*value).clamp(min, max);
    if clamped != *value {
        log::warn!("[Settings] {field} = {value} is outside {min}..={max}, using {clamped}");
        *value = clamped;
    }
}

fn sanitize_choice(field: &str, value: &mut String, allowed: &[&str], fallback: &str) {
    if !allowed.contains(&value.as_str()) {
        log::warn!("[Settings] {field} = {value:?} is not one of {allowed:?}, using {fallback:?}");
        *value = fallback.to_string();
    }
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

impl ClickerSettings {
    /// Pin every numeric field to the range the frontend already enforces.
    ///
    /// IPC arguments arrive as JSON, where serde checks the type and nothing
    /// else. A caller that skips the UI can send `clickSpeed: 5e-20`, which
    /// `interval_secs_from_settings` turns into an interval above
    /// `Duration::MAX`; the clicker thread then dies on its first batch and the
    /// UI keeps reporting a run that is already over. Clamping rather than
    /// rejecting is what `sanitizeFields` does on the frontend, so both sides
    /// agree on what got saved.
    pub fn sanitize(&mut self) {
        clamp_f64("clickSpeed", &mut self.click_speed, limits::CLICK_SPEED);
        clamp_f64(
            "savedClickSpeed",
            &mut self.saved_click_speed,
            limits::SAVED_CLICK_SPEED,
        );
        clamp_f64("dutyCycle", &mut self.duty_cycle, limits::DUTY_CYCLE);
        clamp_f64(
            "speedRandomization",
            &mut self.speed_randomization,
            limits::SPEED_RANDOMIZATION,
        );
        clamp_f64("timeLimit", &mut self.time_limit, limits::TIME_LIMIT);

        clamp_i32("clickLimit", &mut self.click_limit, limits::CLICK_LIMIT);
        for (field, value) in [
            ("cornerStopTL", &mut self.corner_stop_tl),
            ("cornerStopTR", &mut self.corner_stop_tr),
            ("cornerStopBL", &mut self.corner_stop_bl),
            ("cornerStopBR", &mut self.corner_stop_br),
            ("edgeStopTop", &mut self.edge_stop_top),
            ("edgeStopRight", &mut self.edge_stop_right),
            ("edgeStopBottom", &mut self.edge_stop_bottom),
            ("edgeStopLeft", &mut self.edge_stop_left),
        ] {
            clamp_i32(field, value, limits::STOP_BOUNDARY);
        }

        for point in &mut self.click_points {
            clamp_u32(
                "clickPoints[].clicks",
                &mut point.clicks,
                limits::CLICK_POINT_CLICKS,
            );
            clamp_u32(
                "clickPoints[].radius",
                &mut point.radius,
                limits::CLICK_POINT_RADIUS,
            );
        }

        for zone in &mut self.stop_zones {
            clamp_i32("stopZones[].x", &mut zone.x, limits::STOP_ZONE_OFFSET);
            clamp_i32("stopZones[].y", &mut zone.y, limits::STOP_ZONE_OFFSET);
            clamp_i32("stopZones[].width", &mut zone.width, limits::STOP_ZONE_SIZE);
            clamp_i32(
                "stopZones[].height",
                &mut zone.height,
                limits::STOP_ZONE_SIZE,
            );
            sanitize_choice(
                "stopZones[].action",
                &mut zone.action,
                &limits::STOP_ZONE_ACTIONS,
                "stop",
            );
        }
        if self.stop_zones.len() > limits::STOP_ZONE_MAX_COUNT {
            log::warn!(
                "[Settings] stopZones has {} entries, keeping the first {}",
                self.stop_zones.len(),
                limits::STOP_ZONE_MAX_COUNT
            );
            self.stop_zones.truncate(limits::STOP_ZONE_MAX_COUNT);
        }

        clamp_u32(
            "indicatorSize",
            &mut self.indicator_size,
            limits::INDICATOR_SIZE,
        );
        clamp_u32(
            "indicatorOffsetX",
            &mut self.indicator_offset_x,
            limits::INDICATOR_OFFSET,
        );
        clamp_u32(
            "indicatorOffsetY",
            &mut self.indicator_offset_y,
            limits::INDICATOR_OFFSET,
        );
        clamp_u32(
            "indicatorFlashDim",
            &mut self.indicator_flash_dim,
            limits::INDICATOR_FLASH_DIM,
        );

        sanitize_choice(
            "indicatorCorner",
            &mut self.indicator_corner,
            &limits::INDICATOR_CORNERS,
            "top-right",
        );
        sanitize_choice(
            "indicatorColorMode",
            &mut self.indicator_color_mode,
            &limits::INDICATOR_COLOR_MODES,
            "theme",
        );
        if self.indicator_countdown_mode == "off" {
            self.indicator_countdown_mode = String::from("plain");
        }
        sanitize_choice(
            "indicatorCountdownMode",
            &mut self.indicator_countdown_mode,
            &limits::INDICATOR_COUNTDOWN_MODES,
            "plain",
        );
        sanitize_choice(
            "indicatorBackgroundMode",
            &mut self.indicator_background_mode,
            &limits::INDICATOR_BACKGROUND_MODES,
            "off",
        );
        clamp_u32(
            "indicatorBackgroundStrength",
            &mut self.indicator_background_strength,
            limits::INDICATOR_FLASH_DIM,
        );
        if !is_hex_color(&self.indicator_custom_color) {
            log::warn!(
                "[Settings] indicatorCustomColor = {:?} is not #RRGGBB, using default",
                self.indicator_custom_color
            );
            self.indicator_custom_color = default_indicator_custom_color();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zone(id: &str, x: i32, y: i32, width: i32, height: i32, action: &str) -> StopZoneConfig {
        StopZoneConfig {
            id: id.into(),
            x,
            y,
            width,
            height,
            action: action.into(),
        }
    }

    fn sanitized(mutate: impl FnOnce(&mut ClickerSettings)) -> ClickerSettings {
        let mut settings = ClickerSettings::default();
        mutate(&mut settings);
        settings.sanitize();
        settings
    }

    #[test]
    fn sanitize_leaves_the_defaults_alone() {
        let before = ClickerSettings::default();
        let after = sanitized(|_| {});
        assert_eq!(before.click_speed, after.click_speed);
        assert_eq!(before.speed_randomization, after.speed_randomization);
        assert_eq!(before.duty_cycle, after.duty_cycle);
        assert_eq!(before.click_limit, after.click_limit);
        assert_eq!(before.corner_stop_tl, after.corner_stop_tl);
    }

    #[test]
    fn sanitize_raises_a_click_speed_that_would_overflow_a_duration() {
        for value in [5e-20, 0.0, -3.0, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
            assert_eq!(sanitized(|s| s.click_speed = value).click_speed, 1.0);
        }
        assert_eq!(sanitized(|s| s.click_speed = 1e9).click_speed, 1_000.0);
    }

    #[test]
    fn sanitize_bounds_speed_randomization_and_duty_cycle() {
        assert_eq!(
            sanitized(|s| s.speed_randomization = 1e12).speed_randomization,
            200.0
        );
        assert_eq!(
            sanitized(|s| s.speed_randomization = -1.0).speed_randomization,
            0.0
        );
        assert_eq!(sanitized(|s| s.duty_cycle = 101.0).duty_cycle, 100.0);
    }

    #[test]
    fn sanitize_keeps_values_inside_the_range() {
        let settings = sanitized(|s| {
            s.click_speed = 500.0;
            s.speed_randomization = 35.0;
            s.duty_cycle = 45.0;
            s.time_limit = 60.0;
            s.click_limit = 1_000;
            s.corner_stop_tl = 50;
        });
        assert_eq!(settings.click_speed, 500.0);
        assert_eq!(settings.speed_randomization, 35.0);
        assert_eq!(settings.duty_cycle, 45.0);
        assert_eq!(settings.time_limit, 60.0);
        assert_eq!(settings.click_limit, 1_000);
        assert_eq!(settings.corner_stop_tl, 50);
    }

    #[test]
    fn sanitize_bounds_click_limits_and_boundaries() {
        assert_eq!(sanitized(|s| s.click_limit = 0).click_limit, 1);
        assert_eq!(
            sanitized(|s| s.click_limit = 100_000_001).click_limit,
            100_000_000
        );
        assert_eq!(sanitized(|s| s.edge_stop_left = -1).edge_stop_left, 0);
        assert_eq!(
            sanitized(|s| s.corner_stop_br = 20_000).corner_stop_br,
            10_000
        );
    }

    #[test]
    fn sanitize_bounds_click_points() {
        let settings = sanitized(|s| {
            s.click_points = vec![
                ClickPoint {
                    id: "a".into(),
                    x: 0,
                    y: 0,
                    clicks: 0,
                    radius: 50_000,
                },
                ClickPoint {
                    id: "b".into(),
                    x: 0,
                    y: 0,
                    clicks: u32::MAX,
                    radius: 10,
                },
            ];
        });
        assert_eq!(settings.click_points[0].clicks, 1);
        assert_eq!(settings.click_points[0].radius, 9_999);
        assert_eq!(settings.click_points[1].clicks, 999_999);
        assert_eq!(settings.click_points[1].radius, 10);
    }

    #[test]
    fn minimize_to_tray_survives_a_round_trip() {
        for value in [true, false] {
            let settings = ClickerSettings {
                minimize_to_tray: value,
                ..ClickerSettings::default()
            };
            let json = serde_json::to_string(&settings).unwrap();
            let restored: ClickerSettings = serde_json::from_str(&json).unwrap();
            assert_eq!(restored.minimize_to_tray, value);
        }
    }

    #[test]
    fn a_payload_without_minimize_to_tray_gets_the_default() {
        let mut payload = serde_json::to_value(ClickerSettings::default()).unwrap();
        let removed = payload.as_object_mut().unwrap().remove("minimizeToTray");
        assert_eq!(removed, Some(serde_json::Value::Bool(false)));

        let restored: ClickerSettings = serde_json::from_value(payload).unwrap();
        assert!(!restored.minimize_to_tray);
        assert_eq!(restored.click_speed, 25.0);
    }

    #[test]
    fn sanitize_leaves_the_minimize_to_tray_choice_alone() {
        assert!(!ClickerSettings::default().minimize_to_tray);
        assert!(sanitized(|s| s.minimize_to_tray = true).minimize_to_tray);
    }

    #[test]
    fn sanitize_leaves_the_indicator_defaults_alone() {
        let settings = sanitized(|_| {});
        assert!(settings.indicator_enabled);
        assert_eq!(settings.indicator_corner, "top-right");
        assert_eq!(settings.indicator_color_mode, "theme");
        assert_eq!(settings.indicator_custom_color, "#ffffff");
        assert_eq!(settings.indicator_size, 32);
        assert_eq!(settings.indicator_offset_x, 24);
        assert_eq!(settings.indicator_offset_y, 24);
        assert!(!settings.indicator_flash_enabled);
        assert_eq!(settings.indicator_flash_dim, 25);
        assert_eq!(settings.indicator_countdown_mode, "words");
        assert!(!settings.indicator_countdown_enabled);
        assert_eq!(settings.indicator_background_mode, "card");
        assert_eq!(settings.indicator_background_strength, 100);
    }

    #[test]
    fn sanitize_bounds_the_indicator_numbers() {
        assert_eq!(sanitized(|s| s.indicator_size = 0).indicator_size, 16);
        assert_eq!(sanitized(|s| s.indicator_size = 513).indicator_size, 512);
        assert_eq!(
            sanitized(|s| s.indicator_offset_x = 4_001).indicator_offset_x,
            4_000
        );
        assert_eq!(
            sanitized(|s| s.indicator_offset_y = u32::MAX).indicator_offset_y,
            4_000
        );
        assert_eq!(
            sanitized(|s| s.indicator_flash_dim = 101).indicator_flash_dim,
            100
        );

        let inside = sanitized(|s| {
            s.indicator_size = 128;
            s.indicator_offset_x = 0;
            s.indicator_offset_y = 4_000;
            s.indicator_flash_dim = 0;
        });
        assert_eq!(inside.indicator_size, 128);
        assert_eq!(inside.indicator_offset_x, 0);
        assert_eq!(inside.indicator_offset_y, 4_000);
        assert_eq!(inside.indicator_flash_dim, 0);
    }

    #[test]
    fn sanitize_repairs_the_indicator_strings() {
        assert_eq!(
            sanitized(|s| s.indicator_corner = "middle".into()).indicator_corner,
            "top-right"
        );
        assert_eq!(
            sanitized(|s| s.indicator_corner = String::new()).indicator_corner,
            "top-right"
        );
        assert_eq!(
            sanitized(|s| s.indicator_corner = "bottom-left".into()).indicator_corner,
            "bottom-left"
        );

        assert_eq!(
            sanitized(|s| s.indicator_color_mode = "rainbow".into()).indicator_color_mode,
            "theme"
        );
        assert_eq!(
            sanitized(|s| s.indicator_color_mode = "custom".into()).indicator_color_mode,
            "custom"
        );
    }

    #[test]
    fn sanitize_repairs_the_indicator_custom_color() {
        for bad in ["red", "#fff", "#GGGGGG", "22c55e", "#22c55e00", ""] {
            assert_eq!(
                sanitized(|s| s.indicator_custom_color = bad.into()).indicator_custom_color,
                "#ffffff"
            );
        }
        assert_eq!(
            sanitized(|s| s.indicator_custom_color = "#ABCDEF".into()).indicator_custom_color,
            "#ABCDEF"
        );
    }

    #[test]
    fn sanitize_repairs_an_unknown_stop_zone_action() {
        let settings = sanitized(|s| {
            s.stop_zones = vec![
                zone("a", 10, 20, 100, 200, "explode"),
                zone("b", 10, 20, 100, 200, ""),
                zone("c", 10, 20, 100, 200, "Start"),
                zone("d", 10, 20, 100, 200, "pause"),
                zone("e", 10, 20, 100, 200, "start"),
            ];
        });
        assert_eq!(
            settings.stop_zones,
            vec![
                zone("a", 10, 20, 100, 200, "stop"),
                zone("b", 10, 20, 100, 200, "stop"),
                zone("c", 10, 20, 100, 200, "stop"),
                zone("d", 10, 20, 100, 200, "pause"),
                zone("e", 10, 20, 100, 200, "start"),
            ]
        );
    }

    #[test]
    fn sanitize_raises_a_zero_stop_zone_size_to_one() {
        let settings = sanitized(|s| {
            s.stop_zones = vec![zone("a", 5, 6, 0, 0, "stop")];
        });
        assert_eq!(settings.stop_zones, vec![zone("a", 5, 6, 1, 1, "stop")]);
    }

    #[test]
    fn sanitize_raises_a_negative_stop_zone_size_to_one() {
        let settings = sanitized(|s| {
            s.stop_zones = vec![zone("a", -40, 7, -500, -1, "pause")];
        });
        assert_eq!(settings.stop_zones, vec![zone("a", -40, 7, 1, 1, "pause")]);
    }

    #[test]
    fn sanitize_clamps_stop_zone_coordinates_to_the_editable_range() {
        let settings = sanitized(|s| {
            s.stop_zones = vec![
                zone("a", i32::MAX, i32::MIN, 100_000, 1, "stop"),
                zone("b", -100_000, 100_000, 1, 100_000, "stop"),
                zone("c", 99_999, -99_999, 99_999, 99_999, "stop"),
            ];
        });
        assert_eq!(
            settings.stop_zones,
            vec![
                zone("a", 99_999, -99_999, 99_999, 1, "stop"),
                zone("b", -99_999, 99_999, 1, 99_999, "stop"),
                zone("c", 99_999, -99_999, 99_999, 99_999, "stop"),
            ]
        );
        for zone in &settings.stop_zones {
            assert!(zone.x.checked_add(zone.width).is_some());
            assert!(zone.y.checked_add(zone.height).is_some());
        }
    }

    #[test]
    fn sanitize_caps_the_stop_zone_count() {
        let settings = sanitized(|s| {
            s.stop_zones = (0..(limits::STOP_ZONE_MAX_COUNT as i32 + 6))
                .map(|i| zone(&format!("z{i}"), i, i, 10, 10, "stop"))
                .collect();
        });
        assert_eq!(settings.stop_zones.len(), limits::STOP_ZONE_MAX_COUNT);
        assert_eq!(
            settings.stop_zones.first(),
            Some(&zone("z0", 0, 0, 10, 10, "stop"))
        );
        assert_eq!(
            settings.stop_zones.last(),
            Some(&zone("z63", 63, 63, 10, 10, "stop"))
        );
    }
}
