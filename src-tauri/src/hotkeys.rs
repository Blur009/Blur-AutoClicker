use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
use std::time::Duration;
use tauri::Manager;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::engine::worker::toggle_clicker_inner;

const MOD_CTRL: u8 = 1 << 0;
const MOD_ALT: u8 = 1 << 1;
const MOD_SHIFT: u8 = 1 << 2;
const MOD_SUPER: u8 = 1 << 3;

const WHEEL_DIR_NONE: i8 = 0;
const WHEEL_DIR_UP: i8 = 1;
const WHEEL_DIR_DOWN: i8 = -1;

static WHEEL_HOOK_STARTED: AtomicBool = AtomicBool::new(false);
static WHEEL_UP_SEQ: AtomicU64 = AtomicU64::new(0);
static WHEEL_DOWN_SEQ: AtomicU64 = AtomicU64::new(0);
static WHEEL_UP_MODS: AtomicU8 = AtomicU8::new(0);
static WHEEL_DOWN_MODS: AtomicU8 = AtomicU8::new(0);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBinding {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_key: bool,
    pub main_vk: i32,
    pub wheel_direction: i8,
    pub key_token: String,
}

fn binding_modifier_mask(binding: &HotkeyBinding) -> u8 {
    (if binding.ctrl { MOD_CTRL } else { 0 })
        | (if binding.alt { MOD_ALT } else { 0 })
        | (if binding.shift { MOD_SHIFT } else { 0 })
        | (if binding.super_key { MOD_SUPER } else { 0 })
}

fn current_modifier_mask() -> u8 {
    let mut mask = 0;
    if is_vk_down(VK_CONTROL as i32) {
        mask |= MOD_CTRL;
    }
    if is_vk_down(VK_MENU as i32) {
        mask |= MOD_ALT;
    }
    if is_vk_down(VK_SHIFT as i32) {
        mask |= MOD_SHIFT;
    }
    if is_vk_down(VK_LWIN as i32) || is_vk_down(VK_RWIN as i32) {
        mask |= MOD_SUPER;
    }
    mask
}

fn start_wheel_hook_thread_once() {
    if WHEEL_HOOK_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(wheel_hook_proc), 0, 0);
        if hook == 0 {
            log::error!("[Hotkey] Failed to install global mouse wheel hook");
            WHEEL_HOOK_STARTED.store(false, Ordering::SeqCst);
            return;
        }

        let mut msg: MSG = std::mem::zeroed();
        loop {
            let result = GetMessageW(&mut msg, 0, 0, 0);
            if result <= 0 {
                break;
            }
        }

        let _ = UnhookWindowsHookEx(hook);
        WHEEL_HOOK_STARTED.store(false, Ordering::SeqCst);
    });
}

unsafe extern "system" fn wheel_hook_proc(
    code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 && w_param as u32 == WM_MOUSEWHEEL && l_param != 0 {
        let data = &*(l_param as *const MSLLHOOKSTRUCT);
        let wheel_delta = ((data.mouseData >> 16) & 0xffff) as i16;
        let modifiers = current_modifier_mask();

        if wheel_delta > 0 {
            WHEEL_UP_MODS.store(modifiers, Ordering::SeqCst);
            WHEEL_UP_SEQ.fetch_add(1, Ordering::SeqCst);
        } else if wheel_delta < 0 {
            WHEEL_DOWN_MODS.store(modifiers, Ordering::SeqCst);
            WHEEL_DOWN_SEQ.fetch_add(1, Ordering::SeqCst);
        }
    }

    CallNextHookEx(0, code, w_param, l_param)
}

fn consume_wheel_trigger(
    binding: &HotkeyBinding,
    last_wheel_up_seq: &mut u64,
    last_wheel_down_seq: &mut u64,
) -> bool {
    if binding.wheel_direction == WHEEL_DIR_UP {
        let seq = WHEEL_UP_SEQ.load(Ordering::SeqCst);
        if seq == *last_wheel_up_seq {
            return false;
        }
        *last_wheel_up_seq = seq;
        return WHEEL_UP_MODS.load(Ordering::SeqCst) == binding_modifier_mask(binding);
    }

    if binding.wheel_direction == WHEEL_DIR_DOWN {
        let seq = WHEEL_DOWN_SEQ.load(Ordering::SeqCst);
        if seq == *last_wheel_down_seq {
            return false;
        }
        *last_wheel_down_seq = seq;
        return WHEEL_DOWN_MODS.load(Ordering::SeqCst) == binding_modifier_mask(binding);
    }

    false
}

fn is_wheel_binding(binding: &HotkeyBinding) -> bool {
    binding.wheel_direction != WHEEL_DIR_NONE
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
    let mut main_key: Option<(i32, String, i8)> = None;

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

    let (main_vk, key_token, wheel_direction) =
        main_key.ok_or_else(|| format!("Invalid hotkey '{hotkey}': missing main key"))?;

    Ok(HotkeyBinding {
        ctrl,
        alt,
        shift,
        super_key,
        main_vk,
        wheel_direction,
        key_token,
    })
}

pub fn parse_hotkey_main_key(
    token: &str,
    original_hotkey: &str,
) -> Result<(i32, String, i8), String> {
    let lower = token.trim().to_lowercase();

    match lower.as_str() {
        "wheelup" | "scrollup" | "mousewheelup" | "mwheelup" => {
            return Ok((0, String::from("wheelup"), WHEEL_DIR_UP));
        }
        "wheeldown" | "scrolldown" | "mousewheeldown" | "mwheeldown" => {
            return Ok((0, String::from("wheeldown"), WHEEL_DIR_DOWN));
        }
        _ => {}
    }

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
        "mbutton" | "middle" | "middlemouse" | "mouse3" | "mb3" | "wheelclick" => {
            Some((VK_MBUTTON as i32, String::from("mbutton")))
        }
        "xbutton1" | "mouse4" | "mb4" | "mouseback" | "browserback" => {
            Some((VK_XBUTTON1 as i32, String::from("xbutton1")))
        }
        "xbutton2" | "mouse5" | "mb5" | "mouseforward" | "browserforward" => {
            Some((VK_XBUTTON2 as i32, String::from("xbutton2")))
        }
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
        return Ok((binding.0, binding.1, WHEEL_DIR_NONE));
    }

    if lower.starts_with('f') && lower.len() <= 3 {
        if let Ok(number) = lower[1..].parse::<i32>() {
            let vk = match number {
                1..=24 => VK_F1 as i32 + (number - 1),
                _ => -1,
            };
            if vk >= 0 {
                return Ok((vk, lower, WHEEL_DIR_NONE));
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
            return Ok((ch.to_ascii_uppercase() as i32, lower, WHEEL_DIR_NONE));
        }
        if ch.is_ascii_digit() {
            return Ok((ch as i32, lower, WHEEL_DIR_NONE));
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
    start_wheel_hook_thread_once();

    std::thread::spawn(move || {
        let mut was_pressed = false;
        let mut last_wheel_up_seq = WHEEL_UP_SEQ.load(Ordering::SeqCst);
        let mut last_wheel_down_seq = WHEEL_DOWN_SEQ.load(Ordering::SeqCst);

        loop {
            let binding = {
                let state = app.state::<ClickerState>();
                let binding = state.registered_hotkey.lock().unwrap().clone();
                binding
            };

            let is_wheel_hotkey = binding.as_ref().map(is_wheel_binding).unwrap_or(false);
            let currently_pressed = binding
                .as_ref()
                .map(|binding| {
                    is_hotkey_binding_pressed(
                        binding,
                        &mut last_wheel_up_seq,
                        &mut last_wheel_down_seq,
                    )
                })
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
                if !is_wheel_hotkey {
                    was_pressed = currently_pressed;
                }
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if suppress_until_release {
                if currently_pressed {
                    if !is_wheel_hotkey {
                        was_pressed = true;
                    }
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
                if !is_wheel_hotkey {
                    was_pressed = currently_pressed;
                }
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if is_wheel_hotkey {
                if currently_pressed {
                    handle_hotkey_pressed(&app, true);
                }
                was_pressed = false;
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }

            if currently_pressed && !was_pressed {
                handle_hotkey_pressed(&app, false);
            } else if !currently_pressed && was_pressed {
                handle_hotkey_released(&app);
            }

            was_pressed = currently_pressed;
            std::thread::sleep(Duration::from_millis(12));
        }
    });
}

pub fn handle_hotkey_pressed(app: &AppHandle, from_wheel: bool) {
    let mode = {
        let state = app.state::<ClickerState>();
        let mode = state.settings.lock().unwrap().mode.clone();
        mode
    };

    if mode == "Toggle" || (mode == "Hold" && from_wheel) {
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

pub fn is_hotkey_binding_pressed(
    binding: &HotkeyBinding,
    last_wheel_up_seq: &mut u64,
    last_wheel_down_seq: &mut u64,
) -> bool {
    if binding.wheel_direction != WHEEL_DIR_NONE {
        return consume_wheel_trigger(binding, last_wheel_up_seq, last_wheel_down_seq);
    }

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
