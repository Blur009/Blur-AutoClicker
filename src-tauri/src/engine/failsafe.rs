use super::mouse::{current_cursor_position, current_monitor_rects, VirtualScreenRect};
use super::ClickerConfig;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> ClickerConfig {
        ClickerConfig {
            interval: 0.04,
            variation: 0.0,
            limit: 0,
            duty: 45.0,
            time_limit: 0.0,
            button: 1,
            double_click_enabled: false,
            double_click_delay_ms: 40,
            position_enabled: false,
            pos_x: 0,
            pos_y: 0,
            offset: 0.0,
            offset_chance: 0.0,
            smoothing: 0,
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
        }
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
}
