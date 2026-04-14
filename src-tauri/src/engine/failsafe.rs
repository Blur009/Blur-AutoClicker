use super::mouse::current_screen_size;
use super::ClickerConfig;
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

pub fn should_stop_for_failsafe(config: &ClickerConfig) -> Option<String> {
    pub fn current_cursor_position() -> Option<(i32, i32)> {
        let mut point = POINT { x: 0, y: 0 };
        let ok = unsafe { GetCursorPos(&mut point) };
        if ok == 0 {
            None
        } else {
            Some((point.x, point.y))
        }
    }

    let cursor = current_cursor_position()?;
    let screen = current_screen_size()?;

    if config.corner_stop_enabled {
        if cursor.0 <= config.corner_stop_tl && cursor.1 <= config.corner_stop_tl {
            return Some(String::from("Sécurité coin haut-gauche"));
        }
        if cursor.0 >= screen.0 - config.corner_stop_tr && cursor.1 <= config.corner_stop_tr {
            return Some(String::from("Sécurité coin haut-droit"));
        }
        if cursor.0 <= config.corner_stop_bl && cursor.1 >= screen.1 - config.corner_stop_bl {
            return Some(String::from("Sécurité coin bas-gauche"));
        }
        if cursor.0 >= screen.0 - config.corner_stop_br
            && cursor.1 >= screen.1 - config.corner_stop_br
        {
            return Some(String::from("Sécurité coin bas-droit"));
        }
    }

    if config.edge_stop_enabled {
        if cursor.1 <= config.edge_stop_top {
            return Some(String::from("Sécurité bord haut"));
        }
        if cursor.0 >= screen.0 - config.edge_stop_right {
            return Some(String::from("Sécurité bord droit"));
        }
        if cursor.1 >= screen.1 - config.edge_stop_bottom {
            return Some(String::from("Sécurité bord bas"));
        }
        if cursor.0 <= config.edge_stop_left {
            return Some(String::from("Sécurité bord gauche"));
        }
    }

    None
}
