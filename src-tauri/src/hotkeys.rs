use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;

use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::engine::worker::toggle_clicker_inner;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBinding {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_key: bool,
    pub main_vk: i32,
    pub key_token: String,
}

pub fn register_hotkey_inner(app: &AppHandle, hotkey: String) -> Result<String, String> {
    let binding = parse_hotkey_binding(&hotkey)?;
    let state = app.state::<ClickerState>();
    state
        .suppress_hotkey_until_ms
        .store(now_epoch_ms().saturating_add(250), Ordering::SeqCst);
    state
        .suppress_hotkey_until_release
        .store(true, Ordering::SeqCst);
    *state.registered_hotkey.lock().unwrap() = Some(binding.clone());

    Ok(format_hotkey_binding(&binding))
}

pub fn normalize_hotkey(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace("control", "ctrl")
        .replace("command", "super")
        .replace("meta", "super")
        .replace("win", "super")
}

pub fn parse_hotkey_binding(hotkey: &str) -> Result<HotkeyBinding, String> {
    let normalized = normalize_hotkey(hotkey);
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut super_key = false;
    let mut main_key: Option<(i32, String)> = None;

    for token in normalized.split('+').map(str::trim) {
        if token.is_empty() {
            return Err(format!("Invalid hotkey '{hotkey}': found empty key token"));
        }

        match token {
            "alt" | "option" => alt = true,
            "ctrl" | "control" => ctrl = true,
            "shift" => shift = true,
            "super" | "command" | "cmd" | "meta" | "win" => super_key = true,
            _ => {
                if main_key
                    .replace(parse_hotkey_main_key(token, hotkey)?)
                    .is_some()
                {
                    return Err(format!(
                        "Invalid hotkey '{hotkey}': use modifiers first and only one main key"
                    ));
                }
            }
        }
    }

    let (main_vk, key_token) =
        main_key.ok_or_else(|| format!("Invalid hotkey '{hotkey}': missing main key"))?;

    Ok(HotkeyBinding {
        ctrl,
        alt,
        shift,
        super_key,
        main_vk,
        key_token,
    })
}

pub fn parse_hotkey_main_key(token: &str, original_hotkey: &str) -> Result<(i32, String), String> {
    let lower = token.trim().to_lowercase();

    let mapped = match lower.as_str() {
        "<" | ">" | "intlbackslash" | "oem102" | "nonusbackslash" => {
            Some((VK_OEM_102 as i32, String::from("IntlBackslash")))
        }
        "space" | "spacebar" => Some((VK_SPACE as i32, String::from("space"))),
        "tab" => Some((VK_TAB as i32, String::from("tab"))),
        "enter" => Some((VK_RETURN as i32, String::from("enter"))),
        "backspace" => Some((VK_BACK as i32, String::from("backspace"))),
        "delete" => Some((VK_DELETE as i32, String::from("delete"))),
        "insert" => Some((VK_INSERT as i32, String::from("insert"))),
        "home" => Some((VK_HOME as i32, String::from("home"))),
        "end" => Some((VK_END as i32, String::from("end"))),
        "pageup" => Some((VK_PRIOR as i32, String::from("pageup"))),
        "pagedown" => Some((VK_NEXT as i32, String::from("pagedown"))),
        "up" => Some((VK_UP as i32, String::from("up"))),
        "down" => Some((VK_DOWN as i32, String::from("down"))),
        "left" => Some((VK_LEFT as i32, String::from("left"))),
        "right" => Some((VK_RIGHT as i32, String::from("right"))),
        "esc" | "escape" => Some((VK_ESCAPE as i32, String::from("escape"))),
        "/" | "slash" => Some((VK_OEM_2 as i32, String::from("/"))),
        "\\" | "backslash" => Some((VK_OEM_5 as i32, String::from("\\"))),
        ";" | "semicolon" => Some((VK_OEM_1 as i32, String::from(";"))),
        "'" | "quote" => Some((VK_OEM_7 as i32, String::from("'"))),
        "[" | "bracketleft" => Some((VK_OEM_4 as i32, String::from("["))),
        "]" | "bracketright" => Some((VK_OEM_6 as i32, String::from("]"))),
        "-" | "minus" => Some((VK_OEM_MINUS as i32, String::from("-"))),
        "=" | "equal" => Some((VK_OEM_PLUS as i32, String::from("="))),
        "`" | "backquote" => Some((VK_OEM_3 as i32, String::from("`"))),
        "," | "comma" => Some((VK_OEM_COMMA as i32, String::from(","))),
        "." | "period" => Some((VK_OEM_PERIOD as i32, String::from("."))),
        _ => None,
    };

    if let Some(binding) = mapped {
        return Ok(binding);
    }

    if lower.starts_with('f') && lower.len() <= 3 {
        if let Ok(number) = lower[1..].parse::<i32>() {
            let vk = match number {
                1..=24 => VK_F1 as i32 + (number - 1),
                _ => -1,
            };
            if vk >= 0 {
                return Ok((vk, lower));
            }
        }
    }

    if let Some(letter) = lower.strip_prefix("key") {
        if letter.len() == 1 {
            return parse_hotkey_main_key(letter, original_hotkey);
        }
    }

    if let Some(digit) = lower.strip_prefix("digit") {
        if digit.len() == 1 {
            return parse_hotkey_main_key(digit, original_hotkey);
        }
    }

    if lower.len() == 1 {
        let ch = lower.as_bytes()[0];
        if ch.is_ascii_lowercase() {
            return Ok((ch.to_ascii_uppercase() as i32, lower));
        }
        if ch.is_ascii_digit() {
            return Ok((ch as i32, lower));
        }
    }

    Err(format!(
        "Couldn't recognize '{token}' as a valid key in '{original_hotkey}'"
    ))
}

pub fn format_hotkey_binding(binding: &HotkeyBinding) -> String {
    let mut parts: Vec<String> = Vec::new();

    if binding.ctrl {
        parts.push(String::from("ctrl"));
    }
    if binding.alt {
        parts.push(String::from("alt"));
    }
    if binding.shift {
        parts.push(String::from("shift"));
    }
    if binding.super_key {
        parts.push(String::from("super"));
    }

    parts.push(binding.key_token.clone());
    parts.join("+")
}

pub fn start_hotkey_listener(app: AppHandle) {
    std::thread::spawn(move || {
        let mut was_pressed = false;

        loop {
            let binding = {
                let state = app.state::<ClickerState>();
                let binding = state.registered_hotkey.lock().unwrap().clone();
                binding
            };

            let currently_pressed = binding
                .as_ref()
                .map(is_hotkey_binding_pressed)
                .unwrap_or(false);

            let suppress_until = app
                .state::<ClickerState>()
                .suppress_hotkey_until_ms
                .load(Ordering::SeqCst);
            let suppress_until_release = app
                .state::<ClickerState>()
                .suppress_hotkey_until_release
                .load(Ordering::SeqCst);
            let hotkey_capture_active = app
                .state::<ClickerState>()
                .hotkey_capture_active
                .load(Ordering::SeqCst);

            if hotkey_capture_active {
                was_pressed = currently_pressed;
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if suppress_until_release {
                if currently_pressed {
                    was_pressed = true;
                    std::thread::sleep(Duration::from_millis(12));
                    continue;
                }

                app.state::<ClickerState>()
                    .suppress_hotkey_until_release
                    .store(false, Ordering::SeqCst);
                was_pressed = false;
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if now_epoch_ms() < suppress_until {
                was_pressed = currently_pressed;
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if currently_pressed && !was_pressed {
                handle_hotkey_pressed(&app);
            } else if !currently_pressed && was_pressed {
                handle_hotkey_released(&app);
            }

            was_pressed = currently_pressed;
            std::thread::sleep(Duration::from_millis(12));
        }
    });
}

pub fn handle_hotkey_pressed(app: &AppHandle) {
    let mode = {
        let state = app.state::<ClickerState>();
        let mode = state.settings.lock().unwrap().mode.clone();
        mode
    };

    if mode == "Toggle" {
        let _ = toggle_clicker_inner(app);
    } else if mode == "Hold" {
        let _ = start_clicker_inner(app);
    }
}

pub fn handle_hotkey_released(app: &AppHandle) {
    let mode = {
        let state = app.state::<ClickerState>();
        let mode = state.settings.lock().unwrap().mode.clone();
        mode
    };

    if mode == "Hold" {
        let _ = stop_clicker_inner(app, Some(String::from("Arrêté via raccourci maintenu")));
    }
}

pub fn is_hotkey_binding_pressed(binding: &HotkeyBinding) -> bool {
    let ctrl_down = is_vk_down(VK_CONTROL as i32);
    let alt_down = is_vk_down(VK_MENU as i32);
    let shift_down = is_vk_down(VK_SHIFT as i32);
    let super_down = is_vk_down(VK_LWIN as i32) || is_vk_down(VK_RWIN as i32);

    if ctrl_down != binding.ctrl
        || alt_down != binding.alt
        || shift_down != binding.shift
        || super_down != binding.super_key
    {
        return false;
    }

    is_vk_down(binding.main_vk)
}

pub fn is_vk_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}
