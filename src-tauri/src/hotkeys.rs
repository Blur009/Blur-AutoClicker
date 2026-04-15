use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::engine::worker::toggle_clicker_inner;
use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;

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
    value.trim().to_ascii_lowercase()
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

        match normalize_modifier_token(token) {
            Some("ctrl") => ctrl = true,
            Some("alt") => alt = true,
            Some("shift") => shift = true,
            Some("super") => super_key = true,
            Some(_) => {}
            None => {
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
    let lower = token.trim().to_ascii_lowercase();

    if let Some(binding) = parse_named_key_token(&lower) {
        return Ok(binding);
    }

    if let Some(binding) = parse_mouse_button_token(&lower) {
        return Ok(binding);
    }

    if let Some(binding) = parse_numpad_token(&lower) {
        return Ok(binding);
    }

    if let Some(binding) = parse_function_key_token(&lower) {
        return Ok(binding);
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
            let (binding, strict) = {
                let state = app.state::<ClickerState>();
                let binding = state.registered_hotkey.lock().unwrap().clone();
                let strict = state.settings.lock().unwrap().strict_hotkey_modifiers;
                (binding, strict)
            };

            let currently_pressed = binding
                .as_ref()
                .map(|binding| is_hotkey_binding_pressed(binding, strict))
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
        let _ = stop_clicker_inner(app, Some(String::from("Stopped from hold hotkey")));
    }
}

pub fn is_hotkey_binding_pressed(binding: &HotkeyBinding, strict: bool) -> bool {
    let ctrl_down = is_vk_down(VK_CONTROL as i32);
    let alt_down = is_vk_down(VK_MENU as i32);
    let shift_down = is_vk_down(VK_SHIFT as i32);
    let super_down = is_vk_down(VK_LWIN as i32) || is_vk_down(VK_RWIN as i32);

    if !modifiers_match(binding, ctrl_down, alt_down, shift_down, super_down, strict) {
        return false;
    }

    is_vk_down(binding.main_vk)
}

fn modifiers_match(
    binding: &HotkeyBinding,
    ctrl_down: bool,
    alt_down: bool,
    shift_down: bool,
    super_down: bool,
    strict: bool,
) -> bool {
    if binding.ctrl && !ctrl_down {
        return false;
    }
    if binding.alt && !alt_down {
        return false;
    }
    if binding.shift && !shift_down {
        return false;
    }
    if binding.super_key && !super_down {
        return false;
    }

    if strict {
        if ctrl_down && !binding.ctrl {
            return false;
        }
        if alt_down && !binding.alt {
            return false;
        }
        if shift_down && !binding.shift {
            return false;
        }
        if super_down && !binding.super_key {
            return false;
        }
    }

    true
}

pub fn is_vk_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn normalize_modifier_token(token: &str) -> Option<&'static str> {
    match token {
        "alt" | "option" => Some("alt"),
        "ctrl" | "control" => Some("ctrl"),
        "shift" => Some("shift"),
        "super" | "command" | "cmd" | "meta" | "win" => Some("super"),
        _ => None,
    }
}

fn binding(vk: i32, token: &str) -> (i32, String) {
    (vk, token.to_string())
}

fn parse_named_key_token(token: &str) -> Option<(i32, String)> {
    match token {
        "<" | ">" | "intlbackslash" | "oem102" | "nonusbackslash" => {
            Some(binding(VK_OEM_102 as i32, "IntlBackslash"))
        }
        "space" | "spacebar" => Some(binding(VK_SPACE as i32, "space")),
        "tab" => Some(binding(VK_TAB as i32, "tab")),
        "enter" | "return" => Some(binding(VK_RETURN as i32, "enter")),
        "backspace" => Some(binding(VK_BACK as i32, "backspace")),
        "delete" | "del" => Some(binding(VK_DELETE as i32, "delete")),
        "insert" | "ins" => Some(binding(VK_INSERT as i32, "insert")),
        "home" => Some(binding(VK_HOME as i32, "home")),
        "end" => Some(binding(VK_END as i32, "end")),
        "pageup" | "pgup" => Some(binding(VK_PRIOR as i32, "pageup")),
        "pagedown" | "pgdn" => Some(binding(VK_NEXT as i32, "pagedown")),
        "up" | "arrowup" => Some(binding(VK_UP as i32, "up")),
        "down" | "arrowdown" => Some(binding(VK_DOWN as i32, "down")),
        "left" | "arrowleft" => Some(binding(VK_LEFT as i32, "left")),
        "right" | "arrowright" => Some(binding(VK_RIGHT as i32, "right")),
        "esc" | "escape" => Some(binding(VK_ESCAPE as i32, "escape")),
        "capslock" => Some(binding(VK_CAPITAL as i32, "capslock")),
        "numlock" => Some(binding(VK_NUMLOCK as i32, "numlock")),
        "scrolllock" => Some(binding(VK_SCROLL as i32, "scrolllock")),
        "menu" | "apps" | "contextmenu" => Some(binding(VK_APPS as i32, "menu")),
        "printscreen" | "prtsc" | "snapshot" => Some(binding(VK_SNAPSHOT as i32, "printscreen")),
        "pause" | "break" => Some(binding(VK_PAUSE as i32, "pause")),
        "/" | "slash" => Some(binding(VK_OEM_2 as i32, "/")),
        "\\" | "backslash" => Some(binding(VK_OEM_5 as i32, "\\")),
        ";" | "semicolon" => Some(binding(VK_OEM_1 as i32, ";")),
        "'" | "quote" | "apostrophe" => Some(binding(VK_OEM_7 as i32, "'")),
        "[" | "bracketleft" => Some(binding(VK_OEM_4 as i32, "[")),
        "]" | "bracketright" => Some(binding(VK_OEM_6 as i32, "]")),
        "-" | "minus" => Some(binding(VK_OEM_MINUS as i32, "-")),
        "=" | "equal" => Some(binding(VK_OEM_PLUS as i32, "=")),
        "`" | "backquote" | "grave" => Some(binding(VK_OEM_3 as i32, "`")),
        "," | "comma" => Some(binding(VK_OEM_COMMA as i32, ",")),
        "." | "period" | "dot" => Some(binding(VK_OEM_PERIOD as i32, ".")),
        _ => None,
    }
}

fn parse_mouse_button_token(token: &str) -> Option<(i32, String)> {
    match token {
        "mouseleft" | "leftmouse" | "leftbutton" | "mouse1" | "lmb" => {
            Some(binding(VK_LBUTTON as i32, "mouseleft"))
        }
        "mouseright" | "rightmouse" | "rightbutton" | "mouse2" | "rmb" => {
            Some(binding(VK_RBUTTON as i32, "mouseright"))
        }
        "mousemiddle"
        | "middlemouse"
        | "middlebutton"
        | "mouse3"
        | "mmb"
        | "scrollbutton"
        | "middleclick" => Some(binding(VK_MBUTTON as i32, "mousemiddle")),
        "mouse4" | "xbutton1" | "mouseback" | "browserback" | "backbutton" => {
            Some(binding(VK_XBUTTON1 as i32, "mouse4"))
        }
        "mouse5" | "xbutton2" | "mouseforward" | "browserforward" | "forwardbutton" => {
            Some(binding(VK_XBUTTON2 as i32, "mouse5"))
        }
        _ => None,
    }
}

fn parse_numpad_token(token: &str) -> Option<(i32, String)> {
    match token {
        "numpad0" | "num0" => Some(binding(VK_NUMPAD0 as i32, "numpad0")),
        "numpad1" | "num1" => Some(binding(VK_NUMPAD1 as i32, "numpad1")),
        "numpad2" | "num2" => Some(binding(VK_NUMPAD2 as i32, "numpad2")),
        "numpad3" | "num3" => Some(binding(VK_NUMPAD3 as i32, "numpad3")),
        "numpad4" | "num4" => Some(binding(VK_NUMPAD4 as i32, "numpad4")),
        "numpad5" | "num5" => Some(binding(VK_NUMPAD5 as i32, "numpad5")),
        "numpad6" | "num6" => Some(binding(VK_NUMPAD6 as i32, "numpad6")),
        "numpad7" | "num7" => Some(binding(VK_NUMPAD7 as i32, "numpad7")),
        "numpad8" | "num8" => Some(binding(VK_NUMPAD8 as i32, "numpad8")),
        "numpad9" | "num9" => Some(binding(VK_NUMPAD9 as i32, "numpad9")),
        "numpadadd" | "numadd" | "numpadplus" | "numplus" => {
            Some(binding(VK_ADD as i32, "numpadadd"))
        }
        "numpadsubtract" | "numsubtract" | "numsub" | "numpadminus" | "numminus" => {
            Some(binding(VK_SUBTRACT as i32, "numpadsubtract"))
        }
        "numpadmultiply" | "nummultiply" | "nummul" | "numpadmul" => {
            Some(binding(VK_MULTIPLY as i32, "numpadmultiply"))
        }
        "numpaddivide" | "numdivide" | "numdiv" | "numpaddiv" => {
            Some(binding(VK_DIVIDE as i32, "numpaddivide"))
        }
        "numpaddecimal" | "numdecimal" | "numdot" | "numdel" | "numpadpoint" => {
            Some(binding(VK_DECIMAL as i32, "numpaddecimal"))
        }
        _ => None,
    }
}

fn parse_function_key_token(token: &str) -> Option<(i32, String)> {
    if !token.starts_with('f') || token.len() > 3 {
        return None;
    }

    let number = token[1..].parse::<i32>().ok()?;
    let vk = match number {
        1..=24 => VK_F1 as i32 + (number - 1),
        _ => return None,
    };

    Some(binding(vk, token))
}

#[cfg(test)]
mod tests {
    use super::{format_hotkey_binding, modifiers_match, parse_hotkey_binding};

    #[test]
    fn numpad_tokens_round_trip() {
        for token in [
            "numpad0",
            "numpad1",
            "numpad2",
            "numpad3",
            "numpad4",
            "numpad5",
            "numpad6",
            "numpad7",
            "numpad8",
            "numpad9",
            "numpadadd",
            "numpadsubtract",
            "numpadmultiply",
            "numpaddivide",
            "numpaddecimal",
        ] {
            let hotkey = format!("ctrl+shift+{token}");
            let binding = parse_hotkey_binding(&hotkey).expect("token should parse");
            assert_eq!(binding.key_token, token);
            assert_eq!(format_hotkey_binding(&binding), hotkey);
        }
    }

    #[test]
    fn empty_hotkeys_are_rejected() {
        assert!(parse_hotkey_binding("").is_err());
        assert!(parse_hotkey_binding("ctrl+").is_err());
    }

    #[test]
    fn extra_modifiers_do_not_block_hotkeys_in_relaxed_mode() {
        let binding = parse_hotkey_binding("f11").expect("hotkey should parse");
        assert!(modifiers_match(&binding, false, false, true, false, false));
        assert!(modifiers_match(&binding, true, true, true, true, false));
    }

    #[test]
    fn extra_modifiers_block_hotkeys_in_strict_mode() {
        let binding = parse_hotkey_binding("f11").expect("hotkey should parse");
        assert!(!modifiers_match(&binding, false, false, true, false, true));
        assert!(!modifiers_match(&binding, true, true, true, true, true));
        assert!(modifiers_match(&binding, false, false, false, false, true));
    }
}
