use crate::hotkeys::HotkeyBinding;
use crate::icon::IconCache;
use crate::ClickerSettings;

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::{Arc, Mutex};

pub struct IconState {
    pub accent_color: String,
    pub theme: String,
    pub icon_enabled: bool,
    pub icon_theme: String,
    pub icon_color: String,
}

pub struct ClickerState {
    pub running: Arc<AtomicBool>,
    pub run_generation: AtomicU64,
    pub settings: Mutex<ClickerSettings>,
    pub last_error: Mutex<Option<String>>,
    pub stop_reason: Mutex<Option<String>>,
    pub active_click_point_index: AtomicI64,
    pub active_click_point_tick: AtomicU64,
    pub suppress_hotkey_until_ms: AtomicU64,
    pub suppress_hotkey_until_release: AtomicBool,
    pub hotkey_capture_active: AtomicBool,
    pub click_point_pick_active: AtomicBool,
    pub custom_stop_zone_pick_active: AtomicBool,
    pub registered_hotkey: Mutex<Option<HotkeyBinding>>,
    pub master_key: Mutex<Option<HotkeyBinding>>,
    pub master_hold_mode: AtomicBool,
    pub master_enabled: AtomicBool,
    pub master_allowed: AtomicBool,
    pub last_master_allowed: AtomicBool,
    pub settings_initialized: AtomicBool,
    pub paused: Arc<AtomicBool>,
    pub paused_by_zone: AtomicBool,
    pub zone_started_generation: AtomicU64,
    pub warning: Mutex<Option<String>>,
    pub icon_state: Mutex<IconState>,
    pub icon_cache: Mutex<IconCache>,
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
    pub active_click_point_index: Option<usize>,
    pub active_click_point_tick: u64,
    pub master_allowed: bool,
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
    pub portable: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableInfo {
    pub portable: bool,
    pub data_dir: Option<String>,
}
