use crate::hotkeys::HotkeyBinding;
use crate::ClickerSettings;

use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};

pub struct ClickerState {
    pub running: Arc<AtomicBool>,
    pub run_generation: AtomicU64,
    pub settings: Mutex<ClickerSettings>,
    pub last_error: Mutex<Option<String>>,
    pub stop_reason: Mutex<Option<String>>,
    pub suppress_hotkey_until_ms: AtomicU64,
    pub suppress_hotkey_until_release: AtomicBool,
    pub hotkey_capture_active: AtomicBool,
    pub registered_hotkey: Mutex<Option<HotkeyBinding>>,
    pub settings_initialized: AtomicBool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerStatusPayload {
    pub running: bool,
    pub click_count: i64,
    pub last_error: Option<String>,
    pub stop_reason: Option<String>,
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
