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
    pub icons_applied: bool,
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
    pub elevation_blocked_window: Mutex<Option<crate::elevation::BlockedWindow>>,
    pub elevation_prompt_generation: AtomicU64,
    pub engine_busy: AtomicBool,
    pub elevation_suppressed: Mutex<Vec<(isize, u32)>>,
    pub elevation_notice_enabled: AtomicBool,
    pub last_master_allowed: AtomicBool,
    pub settings_initialized: AtomicBool,
    pub paused: Arc<AtomicBool>,
    pub paused_by_zone: AtomicBool,
    pub zone_started_generation: AtomicU64,
    pub warning: Mutex<Option<String>>,
    pub icon_state: Mutex<IconState>,
    pub icon_cache: Mutex<IconCache>,
}

pub fn apply_blocked_window_label(
    blocked: &mut Option<crate::elevation::BlockedWindow>,
    generation_matches: bool,
    handle: isize,
    pid: u32,
    window: &crate::elevation::BlockedWindow,
) -> bool {
    if !generation_matches {
        return false;
    }
    match blocked.as_mut() {
        Some(current) if current.handle == handle && current.pid == pid => {
            current.name.clone_from(&window.name);
            current.title.clone_from(&window.title);
            true
        }
        _ => false,
    }
}

pub fn claim_blocked_window(
    blocked: &mut Option<crate::elevation::BlockedWindow>,
    generation_matches: bool,
    notices_enabled: bool,
    handle: isize,
    pid: u32,
) -> bool {
    if blocked.is_some() || !generation_matches || !notices_enabled {
        return false;
    }
    *blocked = Some(crate::elevation::BlockedWindow {
        handle,
        pid,
        name: String::new(),
        title: String::new(),
    });
    true
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
    pub elevation_blocked: bool,
    pub elevation_blocked_window: Option<crate::elevation::BlockedWindow>,
}

static RECOVERY_NOTICE: Mutex<Option<String>> = Mutex::new(None);

pub fn set_recovery_notice(notice: Option<String>) {
    *RECOVERY_NOTICE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = notice;
}

pub fn recovery_notice() -> Option<String> {
    RECOVERY_NOTICE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub fn clear_transient_warning(warning: &Mutex<Option<String>>) {
    *warning
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
}

pub fn status_warning(transient_warning: Option<String>) -> Option<String> {
    transient_warning.or_else(recovery_notice)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn blocked(handle: isize, pid: u32) -> crate::elevation::BlockedWindow {
        crate::elevation::BlockedWindow {
            handle,
            pid,
            name: String::new(),
            title: String::new(),
        }
    }

    #[test]
    fn claim_stores_a_fresh_window() {
        let mut slot = None;
        assert!(claim_blocked_window(&mut slot, true, true, 12, 34));
        assert_eq!(slot, Some(blocked(12, 34)));
    }

    #[test]
    fn claim_refuses_when_a_prompt_is_already_open() {
        let mut slot = Some(blocked(1, 2));
        assert!(!claim_blocked_window(&mut slot, true, true, 12, 34));
        assert_eq!(slot, Some(blocked(1, 2)));
    }

    #[test]
    fn claim_refuses_a_stale_generation() {
        let mut slot = None;
        assert!(!claim_blocked_window(&mut slot, false, true, 12, 34));
        assert!(slot.is_none());
    }

    #[test]
    fn claim_refuses_when_notices_are_disabled() {
        let mut slot = None;
        assert!(!claim_blocked_window(&mut slot, true, false, 12, 34));
        assert!(slot.is_none());
    }

    fn labeled(name: &str, title: &str) -> crate::elevation::BlockedWindow {
        crate::elevation::BlockedWindow {
            handle: 12,
            pid: 34,
            name: String::from(name),
            title: String::from(title),
        }
    }

    #[test]
    fn label_applies_to_the_matching_window() {
        let mut slot = Some(blocked(12, 34));
        assert!(apply_blocked_window_label(
            &mut slot,
            true,
            12,
            34,
            &labeled("Task Manager", "Task Manager")
        ));
        assert_eq!(slot, Some(labeled("Task Manager", "Task Manager")));
    }

    #[test]
    fn label_is_refused_for_a_stale_generation() {
        let mut slot = Some(blocked(12, 34));
        assert!(!apply_blocked_window_label(
            &mut slot,
            false,
            12,
            34,
            &labeled("Task Manager", "Task Manager")
        ));
        assert_eq!(slot, Some(blocked(12, 34)));
    }

    #[test]
    fn label_is_refused_for_a_different_window_or_process() {
        let mut slot = Some(blocked(12, 34));
        assert!(!apply_blocked_window_label(
            &mut slot,
            true,
            99,
            34,
            &labeled("Task Manager", "Task Manager")
        ));
        assert!(!apply_blocked_window_label(
            &mut slot,
            true,
            12,
            99,
            &labeled("Task Manager", "Task Manager")
        ));
        assert_eq!(slot, Some(blocked(12, 34)));
    }

    #[test]
    fn label_is_refused_when_no_prompt_is_open() {
        let mut slot = None;
        assert!(!apply_blocked_window_label(
            &mut slot,
            true,
            12,
            34,
            &labeled("Task Manager", "Task Manager")
        ));
        assert!(slot.is_none());
    }

    #[test]
    fn status_payload_carries_the_blocked_window_label() {
        let payload = ClickerStatusPayload {
            running: false,
            paused: false,
            click_count: 0,
            last_error: None,
            stop_reason: None,
            warning: None,
            active_click_point_index: None,
            active_click_point_tick: 0,
            master_allowed: true,
            elevation_blocked: true,
            elevation_blocked_window: Some(crate::elevation::BlockedWindow {
                handle: 1,
                pid: 2,
                name: String::from("Task Manager"),
                title: String::from("Administrator: Task Manager"),
            }),
        };
        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&payload).expect("serializes"))
                .expect("valid json");
        assert_eq!(value["elevationBlocked"], serde_json::json!(true));
        assert_eq!(
            value["elevationBlockedWindow"]["name"],
            serde_json::json!("Task Manager")
        );
        assert_eq!(
            value["elevationBlockedWindow"]["title"],
            serde_json::json!("Administrator: Task Manager")
        );
        assert!(value["elevationBlockedWindow"].get("handle").is_none());
        assert!(value["elevationBlockedWindow"].get("pid").is_none());
    }

    #[test]
    fn status_payload_reports_no_blocked_window() {
        let payload = ClickerStatusPayload {
            running: false,
            paused: false,
            click_count: 0,
            last_error: None,
            stop_reason: None,
            warning: None,
            active_click_point_index: None,
            active_click_point_tick: 0,
            master_allowed: true,
            elevation_blocked: false,
            elevation_blocked_window: None,
        };
        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&payload).expect("serializes"))
                .expect("valid json");
        assert_eq!(value["elevationBlocked"], serde_json::json!(false));
        assert!(value["elevationBlockedWindow"].is_null());
    }
}
