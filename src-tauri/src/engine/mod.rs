pub mod cycle;
pub mod failsafe;
pub mod keyboard;
pub mod mouse;
pub mod process;
pub mod rng;
pub mod stats;
pub mod worker;
use std::sync::atomic::AtomicI64;
pub use worker::start_clicker;
pub const AUTOCLICKER_EXTRA_INFO: usize = 0x800D_A5A5; //Just a random Identifier
use self::mouse::VirtualScreenRect;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessListMode {
    Whitelist,
    Blacklist,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InputType {
    Mouse,
    Keyboard,
}

impl InputType {
    pub fn is_keyboard(self) -> bool {
        matches!(self, InputType::Keyboard)
    }
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListEntry {
    pub name: String,
    pub enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClickPointTarget {
    pub x: i32,
    pub y: i32,
    pub clicks: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ZoneAction {
    Stop,
    Pause,
    Start,
}

#[derive(Clone, Copy, Debug)]
pub struct StopZoneConfig {
    pub rect: VirtualScreenRect,
    pub action: ZoneAction,
}

#[derive(Clone, Debug)]
pub struct ClickerConfig {
    pub interval_secs: f64,
    pub variation: f64,
    pub limit: i32,
    pub duty: f64,
    pub time_limit: f64,
    pub button: i32,
    pub double_click_enabled: bool,
    pub double_click_gap_ms: u32,
    pub click_points_enabled: bool,
    pub stop_zones_enabled: bool,
    pub stop_when_complete: bool,
    pub click_points: Vec<ClickPointTarget>,
    pub offset: f64,
    pub offset_chance: f64,
    pub smoothing: i32,
    pub stop_zones: Vec<StopZoneConfig>,
    pub corner_stop_enabled: bool,
    pub corner_stop_tl: i32,
    pub corner_stop_tr: i32,
    pub corner_stop_bl: i32,
    pub corner_stop_br: i32,
    pub edge_stop_enabled: bool,
    pub edge_stop_top: i32,
    pub edge_stop_right: i32,
    pub edge_stop_bottom: i32,
    pub edge_stop_left: i32,
    pub input_type: InputType,
    pub key_code: u16,
    pub keyboard_uppercase: bool,
    pub process_list_enabled: bool,
    pub process_list_mode: ProcessListMode,
    pub process_list_entries: Vec<ProcessListEntry>,
    pub task_switcher_stop_enabled: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunOutcome {
    pub stop_reason: String,
    pub click_count: i64,
    pub elapsed_secs: f64,
    pub avg_cpu: f64,
}
static CLICK_COUNT: AtomicI64 = AtomicI64::new(0);

#[link(name = "ntdll")]
extern "system" {
    fn NtSetTimerResolution(
        DesiredResolution: u32,
        SetResolution: u8,
        CurrentResolution: *mut u32,
    ) -> u32;
}
