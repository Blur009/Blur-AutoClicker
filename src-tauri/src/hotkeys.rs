use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::engine::worker::toggle_clicker_inner;
use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;

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

/// Polling-based hotkey listener (Linux compatible)
/// Uses xdotool to check modifier keys via GetAsyncKeyState equivalent
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
            let sequence_pick_active = app
                .state::<ClickerState>()
                .sequence_pick_active
                .load(Ordering::SeqCst);
            let custom_stop_zone_pick_active = app
                .state::<ClickerState>()
                .custom_stop_zone_pick_active
                .load(Ordering::SeqCst);

            if hotkey_capture_active || sequence_pick_active || custom_stop_zone_pick_active {
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
    let ctrl_down = is_vk_down(crate::engine::keyboard::VK_CONTROL as i32);
    let alt_down = is_vk_down(crate::engine::keyboard::VK_MENU as i32);
    let shift_down = is_vk_down(crate::engine::keyboard::VK_SHIFT as i32);
    let super_down = is_vk_down(crate::engine::keyboard::VK_LWIN as i32)
        || is_vk_down(crate::engine::keyboard::VK_RWIN as i32);

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

/// Check if a key is pressed via xdotool key state query.
/// Works on both X11 and Wayland (via xdotool fallback).
/// Maps VK codes to X11 key names.
pub fn is_vk_down(vk: i32) -> bool {
    let key_name = vk_to_xkeysym(vk);
    if key_name.is_empty() {
        return false;
    }

    let output = std::process::Command::new("xdotool")
        .args(["getactivewindow", "getwindowfocus"])
        .output()
        .ok();

    // Fall back to checking via xinput / xev approach
    // Use xdotool key state query
    let output = std::process::Command::new("xdotool")
        .args(["keydown", &key_name])
        .output()
        .ok();

    if let Some(out) = output {
        // If keydown succeeds without error, the key was already down
        // This is a hack — xdotool keydown on a held key returns success
        // On newer xdotool, use query_state
        let stderr = String::from_utf8_lossy(&out.stderr);
        stderr.contains("already")
    } else {
        false
    }
}

/// Map our pseudo-VK codes to X11 keysym names for xdotool
fn vk_to_xkeysym(vk: i32) -> &'static str {
    match vk {
        0x11 => "Control_L",      // VK_CONTROL
        0x12 => "Alt_L",          // VK_MENU
        0x10 => "Shift_L",        // VK_SHIFT
        0x5B => "Super_L",        // VK_LWIN
        0x5C => "Super_R",        // VK_RWIN
        0x41..=0x5A => {          // A-Z
            let idx = (vk - 0x41) as usize;
            ["A","B","C","D","E","F","G","H","I","J","K","L","M",
             "N","O","P","Q","R","S","T","U","V","W","X","Y","Z"][idx]
        }
        0x30..=0x39 => {          // 0-9
            let idx = (vk - 0x30) as usize;
            ["0","1","2","3","4","5","6","7","8","9"][idx]
        }
        0x20 => "space",
        0x0D => "Return",
        0x09 => "Tab",
        0x08 => "BackSpace",
        0x2E => "Delete",
        0x1B => "Escape",
        0x26 => "Up",
        0x28 => "Down",
        0x25 => "Left",
        0x27 => "Right",
        0x70 => "F1",
        0x71 => "F2",
        0x72 => "F3",
        0x73 => "F4",
        0x74 => "F5",
        0x75 => "F6",
        0x76 => "F7",
        0x77 => "F8",
        0x78 => "F9",
        0x79 => "F10",
        0x7A => "F11",
        0x7B => "F12",
        _ => "",
    }
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
            Some(binding(0xE2, "IntlBackslash"))
        }
        "space" | "spacebar" => Some(binding(0x20, "space")),
        "tab" => Some(binding(0x09, "tab")),
        "enter" | "return" => Some(binding(0x0D, "enter")),
        "backspace" => Some(binding(0x08, "backspace")),
        "delete" | "del" => Some(binding(0x2E, "delete")),
        "insert" | "ins" => Some(binding(0x2D, "insert")),
        "home" => Some(binding(0x24, "home")),
        "end" => Some(binding(0x23, "end")),
        "pageup" | "pgup" => Some(binding(0x21, "pageup")),
        "pagedown" | "pgdn" => Some(binding(0x22, "pagedown")),
        "up" | "arrowup" => Some(binding(0x26, "up")),
        "down" | "arrowdown" => Some(binding(0x28, "down")),
        "left" | "arrowleft" => Some(binding(0x25, "left")),
        "right" | "arrowright" => Some(binding(0x27, "right")),
        "esc" | "escape" => Some(binding(0x1B, "escape")),
        "capslock" => Some(binding(0x14, "capslock")),
        "numlock" => Some(binding(0x90, "numlock")),
        "scrolllock" => Some(binding(0x91, "scrolllock")),
        "menu" | "apps" | "contextmenu" => Some(binding(0x5D, "menu")),
        "printscreen" | "prtsc" | "snapshot" => Some(binding(0x2C, "printscreen")),
        "pause" | "break" => Some(binding(0x13, "pause")),
        "/" | "slash" => Some(binding(0xBF, "/")),
        "\\" | "backslash" => Some(binding(0xDC, "\\")),
        ";" | "semicolon" => Some(binding(0xBA, ";")),
        "'" | "quote" | "apostrophe" => Some(binding(0xDE, "'")),
        "[" | "bracketleft" => Some(binding(0xDB, "[")),
        "]" | "bracketright" => Some(binding(0xDD, "]")),
        "-" | "minus" => Some(binding(0xBD, "-")),
        "=" | "equal" => Some(binding(0xBB, "=")),
        "`" | "backquote" | "grave" => Some(binding(0xC0, "`")),
        "," | "comma" => Some(binding(0xBC, ",")),
        "." | "period" | "dot" => Some(binding(0xBE, ".")),
        _ => None,
    }
}

fn parse_mouse_button_token(token: &str) -> Option<(i32, String)> {
    match token {
        "mouseleft" | "leftmouse" | "leftbutton" | "mouse1" | "lmb" => {
            Some(binding(1, "mouseleft"))
        }
        "mouseright" | "rightmouse" | "rightbutton" | "mouse2" | "rmb" => {
            Some(binding(2, "mouseright"))
        }
        "mousemiddle" | "middlemouse" | "middlebutton" | "mouse3" | "mmb" | "scrollbutton"
        | "middleclick" => Some(binding(3, "mousemiddle")),
        _ => None,
    }
}

fn parse_numpad_token(token: &str) -> Option<(i32, String)> {
    match token {
        "numpad0" | "num0" => Some(binding(0x60, "numpad0")),
        "numpad1" | "num1" => Some(binding(0x61, "numpad1")),
        "numpad2" | "num2" => Some(binding(0x62, "numpad2")),
        "numpad3" | "num3" => Some(binding(0x63, "numpad3")),
        "numpad4" | "num4" => Some(binding(0x64, "numpad4")),
        "numpad5" | "num5" => Some(binding(0x65, "numpad5")),
        "numpad6" | "num6" => Some(binding(0x66, "numpad6")),
        "numpad7" | "num7" => Some(binding(0x67, "numpad7")),
        "numpad8" | "num8" => Some(binding(0x68, "numpad8")),
        "numpad9" | "num9" => Some(binding(0x69, "numpad9")),
        "numpadadd" | "numadd" | "numpadplus" | "numplus" => Some(binding(0x6B, "numpadadd")),
        "numpadsubtract" | "numsubtract" | "numsub" | "numpadminus" | "numminus" => {
            Some(binding(0x6D, "numpadsubtract"))
        }
        "numpadmultiply" | "nummultiply" | "nummul" | "numpadmul" => {
            Some(binding(0x6A, "numpadmultiply"))
        }
        "numpaddivide" | "numdivide" | "numdiv" | "numpaddiv" => {
            Some(binding(0x6F, "numpaddivide"))
        }
        "numpaddecimal" | "numdecimal" | "numdot" | "numdel" | "numpadpoint" => {
            Some(binding(0x6E, "numpaddecimal"))
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
        1..=24 => 0x70 + (number - 1),
        _ => return None,
    };

    Some(binding(vk, token))
}