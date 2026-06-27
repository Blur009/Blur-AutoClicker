// Mirror of the descriptor-driven frontend schema in `src/settingsSchema.ts`.
// When adding or changing a backend-facing setting, keep the section and
// default in sync with the TypeScript field definitions.

#[derive(Clone, Copy, serde::Deserialize, serde::Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SequencePointAction {
    #[default]
    Mouse,
    Key,
}

#[derive(Clone, serde::Deserialize, serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SequencePoint {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub action: SequencePointAction,
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
    #[serde(default)]
    pub key: String,
    #[serde(default = "default_keyboard_key_case")]
    pub key_case: String,
    #[serde(default = "default_sequence_key_hold_ms")]
    pub hold_ms: u32,
    #[serde(default = "default_sequence_point_clicks")]
    pub clicks: u32,
}

fn default_sequence_point_clicks() -> u32 {
    1
}

fn default_sequence_key_hold_ms() -> u32 {
    30
}

fn default_keyboard_key_case() -> String {
    "lower".to_string()
}

fn default_true() -> bool {
    true
}

use crate::engine::ProcessListEntry;

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

    pub duty_cycle_enabled: bool,
    pub duty_cycle: f64,

    pub speed_variation_enabled: bool,
    pub speed_variation: f64,

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

    pub sequence_enabled: bool,
    pub sequence_points: Vec<SequencePoint>,

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

    pub custom_stop_zone_enabled: bool,
    pub custom_stop_zone_x: i32,
    pub custom_stop_zone_y: i32,
    pub custom_stop_zone_width: i32,
    pub custom_stop_zone_height: i32,

    pub disable_screenshots: bool,
    pub advanced_settings_enabled: bool,
    pub last_panel: String,
    pub show_stop_reason: bool,
    pub show_stop_overlay: bool,
    pub strict_hotkey_modifiers: bool,
}

// Frontend-only settings intentionally omitted from Rust:
// language, minimizeToTray, theme, advancedSequenceLayout, alwaysOnTop,
// accentColor, presets, activePresetId.

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

            duty_cycle_enabled: true,
            duty_cycle: 45.0,

            speed_variation_enabled: true,
            speed_variation: 35.0,

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

            sequence_enabled: false,
            sequence_points: Vec::new(),

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

            custom_stop_zone_enabled: false,
            custom_stop_zone_x: 0,
            custom_stop_zone_y: 0,
            custom_stop_zone_width: 100,
            custom_stop_zone_height: 100,

            disable_screenshots: false,
            advanced_settings_enabled: true,
            last_panel: "simple".to_string(),
            show_stop_reason: true,
            show_stop_overlay: true,
            strict_hotkey_modifiers: false,
        }
    }
}
