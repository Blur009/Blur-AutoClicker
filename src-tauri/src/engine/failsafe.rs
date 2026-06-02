use super::mouse::{current_cursor_position, current_monitor_rects, VirtualScreenRect};
use super::ClickerConfig;

fn detect_custom_stop_zone(cursor: (i32, i32), config: &ClickerConfig) -> Option<String> {
    if config.custom_stop_zone_enabled && config.custom_stop_zone.contains(cursor.0, cursor.1) {
        return Some(String::from("Custom stop zone failsafe"));
    }

    None
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
    if let Some(reason) = detect_custom_stop_zone(cursor, config) {
        return Some(reason);
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

pub fn should_stop_for_failsafe(config: &ClickerConfig) -> Option<String> {
    let cursor = current_cursor_position()?;
    let monitors = current_monitor_rects()?;
    detect_failsafe(cursor, &monitors, config)
}