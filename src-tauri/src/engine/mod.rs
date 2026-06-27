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
pub enum ProcessListBehavior {
    Pause,
    Stop,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListEntry {
    pub name: String,
    pub behavior: ProcessListBehavior,
    pub enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SequenceTargetKind {
    Mouse {
        x: i32,
        y: i32,
    },
    Key {
        key_code: u16,
        keyboard_uppercase: bool,
        hold_ms: u32,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SequenceTarget {
    pub kind: SequenceTargetKind,
    pub clicks: usize,
}

impl SequenceTarget {
    pub fn mouse(x: i32, y: i32, clicks: usize) -> Self {
        Self {
            kind: SequenceTargetKind::Mouse { x, y },
            clicks,
        }
    }

    pub fn key(key_code: u16, keyboard_uppercase: bool, hold_ms: u32, clicks: usize) -> Self {
        Self {
            kind: SequenceTargetKind::Key {
                key_code,
                keyboard_uppercase,
                hold_ms,
            },
            clicks,
        }
    }

    pub fn mouse_position(self) -> Option<(i32, i32)> {
        match self.kind {
            SequenceTargetKind::Mouse { x, y } => Some((x, y)),
            SequenceTargetKind::Key { .. } => None,
        }
    }

    pub fn key_press(self) -> Option<(u16, bool, u32)> {
        match self.kind {
            SequenceTargetKind::Key {
                key_code,
                keyboard_uppercase,
                hold_ms,
            } => Some((key_code, keyboard_uppercase, hold_ms)),
            SequenceTargetKind::Mouse { .. } => None,
        }
    }
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
    pub sequence_enabled: bool,
    pub sequence_points: Vec<SequenceTarget>,
    pub offset: f64,
    pub offset_chance: f64,
    pub smoothing: i32,
    pub custom_stop_zone_enabled: bool,
    pub custom_stop_zone: VirtualScreenRect,
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
    pub input_type: i32,
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
