use crate::hotkeys::HotkeyBinding;
use crate::ClickerSettings;

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::{Arc, Mutex};

pub struct ClickerState {
    pub running: Arc<AtomicBool>,
    pub run_generation: AtomicU64,
    pub settings: Mutex<ClickerSettings>,
    pub last_error: Mutex<Option<String>>,
    pub stop_reason: Mutex<Option<String>>,
    pub active_sequence_index: AtomicI64,
    pub active_sequence_tick: AtomicU64,
    pub suppress_hotkey_until_ms: AtomicU64,
    pub suppress_hotkey_until_release: AtomicBool,
    pub hotkey_capture_active: AtomicBool,
    pub sequence_pick_active: AtomicBool,
    pub custom_stop_zone_pick_active: AtomicBool,
    pub registered_hotkey: Mutex<Option<HotkeyBinding>>,
    pub settings_initialized: AtomicBool,
    pub paused: Arc<AtomicBool>,
    pub warning: Mutex<Option<String>>,
    pub session_started_at_ms: AtomicU64,
    pub last_session_duration_ms: AtomicU64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerStatusPayload {
    pub running: bool,
    pub paused: bool,
    pub click_count: i64,
    pub last_error: Option<String>,
    pub stop_reason: Option<String>,
    pub warning: Option<String>,
    pub active_sequence_index: Option<usize>,
    pub active_sequence_tick: u64,
    pub session_started_at_ms: Option<u64>,
    pub last_session_duration_ms: u64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionPayload {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfoPayload {
    pub version: String,
    pub update_status: String,
    pub screenshot_protection_supported: bool,
}
