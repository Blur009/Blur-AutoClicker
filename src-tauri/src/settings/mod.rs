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
}

// Frontend-only settings intentionally omitted from Rust:
// language, minimizeToTray, theme, alwaysOnTop, accentColor, presets,
// activePresetId.

impl Default for ClickerSettings {
    fn default() -> Self {
        Self {
            // Meta
            version: 10,

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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
