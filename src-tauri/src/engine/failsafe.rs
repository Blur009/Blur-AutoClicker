use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::mouse::{current_cursor_position, current_monitor_rects, VirtualScreenRect};
use super::{ClickerConfig, ZoneAction};

pub fn detect_stop_zones(
    cursor: (i32, i32),
    config: &ClickerConfig,
) -> Option<(ZoneAction, usize)> {
    let mut result: Option<(ZoneAction, usize)> = None;
    for (i, zone) in config.stop_zones.iter().enumerate() {
        if !zone.rect.contains(cursor.0, cursor.1) {
            continue;
        }
        match zone.action {
            ZoneAction::Stop => return Some((zone.action, i)),
            ZoneAction::Start => result = Some((zone.action, i)),
            ZoneAction::Pause => {
                if result.is_none() {
                    result = Some((zone.action, i));
                }
            }
        }
    }
    result
}

fn detect_corner_failsafe(
    cursor: (i32, i32),
    monitor: VirtualScreenRect,
    config: &ClickerConfig,
) -> Option<String> {
    if !monitor.contains(cursor.0, cursor.1) {
        return None;
    }

    let left = monitor.left;
    let top = monitor.top;
    let right = monitor.right();
    let bottom = monitor.bottom();

    if cursor.0 <= left + config.corner_stop_tl && cursor.1 <= top + config.corner_stop_tl {
        return Some(String::from("Top-left corner failsafe"));
    }
    if cursor.0 >= right - config.corner_stop_tr && cursor.1 <= top + config.corner_stop_tr {
        return Some(String::from("Top-right corner failsafe"));
    }
    if cursor.0 <= left + config.corner_stop_bl && cursor.1 >= bottom - config.corner_stop_bl {
        return Some(String::from("Bottom-left corner failsafe"));
    }
    if cursor.0 >= right - config.corner_stop_br && cursor.1 >= bottom - config.corner_stop_br {
        return Some(String::from("Bottom-right corner failsafe"));
    }

    None
}

fn detect_edge_failsafe(
    cursor: (i32, i32),
    monitor: VirtualScreenRect,
    config: &ClickerConfig,
) -> Option<String> {
    if !monitor.contains(cursor.0, cursor.1) {
        return None;
    }

    let left = monitor.left;
    let top = monitor.top;
    let right = monitor.right();
    let bottom = monitor.bottom();

    if cursor.1 <= top + config.edge_stop_top {
        return Some(String::from("Top edge failsafe"));
    }
    if cursor.0 >= right - config.edge_stop_right {
        return Some(String::from("Right edge failsafe"));
    }
    if cursor.1 >= bottom - config.edge_stop_bottom {
        return Some(String::from("Bottom edge failsafe"));
    }
    if cursor.0 <= left + config.edge_stop_left {
        return Some(String::from("Left edge failsafe"));
    }

    None
}

pub fn detect_failsafe(
    cursor: (i32, i32),
    monitors: &[VirtualScreenRect],
    config: &ClickerConfig,
) -> Option<String> {
    if config.stop_zones_enabled {
        if let Some((ZoneAction::Stop, _)) = detect_stop_zones(cursor, config) {
            return Some(String::from("Custom stop zone failsafe"));
        }
    }

    if config.corner_stop_enabled {
        for monitor in monitors.iter().copied() {
            if let Some(reason) = detect_corner_failsafe(cursor, monitor, config) {
                return Some(reason);
            }
        }
    }

    if config.edge_stop_enabled {
        for monitor in monitors.iter().copied() {
            if let Some(reason) = detect_edge_failsafe(cursor, monitor, config) {
                return Some(reason);
            }
        }
    }

    None
}

pub const FAILSAFE_CURSOR_UNAVAILABLE: &str =
    "Failsafe unavailable: cursor position could not be read";
pub const FAILSAFE_MONITORS_UNAVAILABLE: &str =
    "Failsafe unavailable: monitor layout could not be read";

const CURSOR_UNREADABLE_GRACE: Duration = Duration::from_millis(500);

static CURSOR_UNREADABLE_SINCE: Mutex<Option<Instant>> = Mutex::new(None);

fn evaluate_cursor_failure(since: Option<Instant>, now: Instant) -> (Option<Instant>, bool) {
    let started = since.unwrap_or(now);
    let expired = now.saturating_duration_since(started) >= CURSOR_UNREADABLE_GRACE;
    (Some(started), expired)
}

fn note_cursor_read_failure() -> Option<String> {
    let now = Instant::now();
    let mut since = CURSOR_UNREADABLE_SINCE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let (started, expired) = evaluate_cursor_failure(*since, now);
    *since = started;
    if expired {
        Some(String::from(FAILSAFE_CURSOR_UNAVAILABLE))
    } else {
        None
    }
}

pub fn reset_cursor_unreadable_grace() {
    let mut since = CURSOR_UNREADABLE_SINCE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *since = None;
}

fn note_cursor_read_success() {
    reset_cursor_unreadable_grace();
}

pub fn should_stop_for_failsafe(config: &ClickerConfig) -> Option<String> {
    let stop_zone_gate = config.stop_zones_enabled
        && config
            .stop_zones
            .iter()
            .any(|zone| zone.action == ZoneAction::Stop);
    let needs_monitors = config.corner_stop_enabled || config.edge_stop_enabled;
    if !needs_monitors && !stop_zone_gate {
        return None;
    }

    let cursor = match current_cursor_position() {
        Some(cursor) => {
            note_cursor_read_success();
            cursor
        }
        None => return note_cursor_read_failure(),
    };

    let monitors = if needs_monitors {
        match current_monitor_rects() {
            Some(monitors) => monitors,
            None => return Some(String::from(FAILSAFE_MONITORS_UNAVAILABLE)),
        }
    } else {
        Vec::new()
    };

    detect_failsafe(cursor, &monitors, config)
}

#[cfg(test)]
mod tests {
    use super::super::StopZoneConfig;
    use super::*;

    fn sample_config() -> ClickerConfig {
        ClickerConfig {
            interval_secs: 0.04,
            variation: 0.0,
            limit: 0,
            duty: 45.0,
            time_limit: 0.0,
            button: 1,
            double_click_enabled: false,
            double_click_gap_ms: 450,
            click_points_enabled: false,
            stop_zones_enabled: false,
            stop_when_complete: false,
            click_points: Vec::new(),
            cursor_nudge_px: 0.0,
            cursor_nudge_chance_pct: 0.0,
            smoothing: 0,
            stop_zones: Vec::new(),
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
            input_type: crate::engine::InputType::Mouse,
            key_code: 0,
            keyboard_uppercase: false,
            process_list_enabled: false,
            process_list_mode: crate::engine::ProcessListMode::Whitelist,
            process_list_entries: Vec::new(),
            task_switcher_stop_enabled: false,
        }
    }

    #[test]
    fn first_unreadable_cursor_sample_does_not_stop_the_run() {
        let now = Instant::now();

        let (since, expired) = evaluate_cursor_failure(None, now);
        assert_eq!(since, Some(now));
        assert!(!expired);
    }

    #[test]
    fn unreadable_cursor_stops_after_the_grace_window() {
        let start = Instant::now();

        let (since, expired) =
            evaluate_cursor_failure(Some(start), start + Duration::from_millis(499));
        assert_eq!(since, Some(start));
        assert!(!expired);

        let (since, expired) =
            evaluate_cursor_failure(Some(start), start + CURSOR_UNREADABLE_GRACE);
        assert_eq!(since, Some(start));
        assert!(expired);

        let (_, expired) = evaluate_cursor_failure(Some(start), start + Duration::from_secs(30));
        assert!(expired);
    }

    #[test]
    fn successful_read_clears_the_unreadable_cursor_timestamp() {
        note_cursor_read_success();
        assert_eq!(note_cursor_read_failure(), None);
        assert!(CURSOR_UNREADABLE_SINCE.lock().unwrap().is_some());

        note_cursor_read_success();
        assert!(CURSOR_UNREADABLE_SINCE.lock().unwrap().is_none());
        assert_eq!(note_cursor_read_failure(), None);

        note_cursor_read_success();
    }

    #[test]
    fn reset_starts_a_fresh_grace_for_the_next_unreadable_cursor_sample() {
        let stale = Instant::now();
        *CURSOR_UNREADABLE_SINCE.lock().unwrap() = Some(stale);

        reset_cursor_unreadable_grace();
        assert!(CURSOR_UNREADABLE_SINCE.lock().unwrap().is_none());

        assert_eq!(note_cursor_read_failure(), None);

        note_cursor_read_success();
    }

    #[test]
    fn detects_edges_against_virtual_screen_offsets() {
        let config = sample_config();
        let monitors = [
            VirtualScreenRect::new(-1920, 0, 1920, 1080),
            VirtualScreenRect::new(0, 0, 1920, 1080),
        ];

        let reason = detect_failsafe((-1915, 500), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Left edge failsafe"));

        let reason = detect_failsafe((1915, 500), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Right edge failsafe"));
    }

    #[test]
    fn detects_edges_at_monitor_borders() {
        let config = sample_config();
        let monitors = [
            VirtualScreenRect::new(0, 0, 1920, 1080),
            VirtualScreenRect::new(1920, 0, 1920, 1080),
        ];

        let reason = detect_failsafe((1915, 540), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Right edge failsafe"));

        let reason = detect_failsafe((1925, 540), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Left edge failsafe"));
    }

    #[test]
    fn detects_corners_per_monitor_on_offset_layout() {
        let config = sample_config();
        let monitors = [
            VirtualScreenRect::new(-1280, -200, 1280, 1024),
            VirtualScreenRect::new(0, 120, 1920, 1080),
        ];

        let reason = detect_failsafe((-1275, -190), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Top-left corner failsafe"));

        let reason = detect_failsafe((5, 125), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Top-left corner failsafe"));

        let reason = detect_failsafe((1915, 1195), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Bottom-right corner failsafe"));
    }

    #[test]
    fn corner_failsafe_boundary_is_inclusive() {
        let config = sample_config();
        let monitors = [
            VirtualScreenRect::new(0, 0, 1920, 1080),
            VirtualScreenRect::new(-1920, -200, 1920, 1080),
        ];

        for monitor in monitors {
            let inside = (
                monitor.left + config.corner_stop_tl,
                monitor.top + config.corner_stop_tl,
            );
            assert_eq!(
                detect_failsafe(inside, &[monitor], &config).as_deref(),
                Some("Top-left corner failsafe")
            );
            assert_eq!(
                detect_failsafe((inside.0 + 1, inside.1 + 1), &[monitor], &config),
                None
            );
        }
    }

    #[test]
    fn left_edge_failsafe_boundary_is_inclusive() {
        let config = sample_config();
        let monitors = [
            VirtualScreenRect::new(0, 0, 1920, 1080),
            VirtualScreenRect::new(-1920, -200, 1920, 1080),
        ];

        for monitor in monitors {
            let inside = (monitor.left + config.edge_stop_left, monitor.top + 500);
            assert_eq!(
                detect_failsafe(inside, &[monitor], &config).as_deref(),
                Some("Left edge failsafe")
            );
            assert_eq!(
                detect_failsafe((inside.0 + 1, inside.1), &[monitor], &config),
                None
            );
        }
    }

    #[test]
    fn detects_custom_stop_zone_before_other_failsafes() {
        let mut config = sample_config();
        config.stop_zones_enabled = true;
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(100, 100, 200, 150),
            action: ZoneAction::Stop,
        });
        let monitors = [VirtualScreenRect::new(0, 0, 1920, 1080)];

        let reason = detect_failsafe((150, 120), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Custom stop zone failsafe"));
    }

    #[test]
    fn detects_custom_stop_zone_with_negative_coordinates() {
        let mut config = sample_config();
        config.stop_zones_enabled = true;
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(-300, -200, 150, 100),
            action: ZoneAction::Stop,
        });
        let monitors = [
            VirtualScreenRect::new(-1920, 0, 1920, 1080),
            VirtualScreenRect::new(0, 0, 1920, 1080),
        ];

        let reason = detect_failsafe((-250, -150), &monitors, &config);
        assert_eq!(reason.as_deref(), Some("Custom stop zone failsafe"));
    }

    #[test]
    fn pause_zone_does_not_trigger_failsafe_stop() {
        let mut config = sample_config();
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(100, 100, 200, 150),
            action: ZoneAction::Pause,
        });
        let monitors = [VirtualScreenRect::new(0, 0, 1920, 1080)];

        let reason = detect_failsafe((150, 120), &monitors, &config);
        assert_eq!(reason, None);

        let zone = detect_stop_zones((150, 120), &config);
        assert_eq!(zone, Some((ZoneAction::Pause, 0)));
    }

    #[test]
    fn stop_overrides_start_overrides_pause() {
        let mut config = sample_config();
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(0, 0, 100, 100),
            action: ZoneAction::Pause,
        });
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(0, 0, 100, 100),
            action: ZoneAction::Stop,
        });

        let zone = detect_stop_zones((50, 50), &config);
        assert_eq!(zone, Some((ZoneAction::Stop, 1)));
    }

    #[test]
    fn start_overrides_pause() {
        let mut config = sample_config();
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(0, 0, 200, 200),
            action: ZoneAction::Pause,
        });
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(50, 50, 100, 100),
            action: ZoneAction::Start,
        });

        // Cursor inside both zones → Start wins
        let zone = detect_stop_zones((75, 75), &config);
        assert_eq!(zone, Some((ZoneAction::Start, 1)));

        // Cursor inside pause zone but outside start zone → Pause
        let zone = detect_stop_zones((10, 10), &config);
        assert_eq!(zone, Some((ZoneAction::Pause, 0)));
    }

    #[test]
    fn none_when_no_zone_contains_cursor() {
        let mut config = sample_config();
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(0, 0, 100, 100),
            action: ZoneAction::Pause,
        });
        config.stop_zones.push(StopZoneConfig {
            rect: VirtualScreenRect::new(200, 200, 50, 50),
            action: ZoneAction::Start,
        });

        let zone = detect_stop_zones((500, 500), &config);
        assert_eq!(zone, None);
    }
}
