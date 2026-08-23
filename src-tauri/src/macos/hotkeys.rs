use crate::engine::worker::{
    emit_status, now_epoch_ms, start_clicker_inner, stop_clicker_inner, toggle_clicker_inner,
};
use crate::error::{poisoned_inner, AppError, AppResult};
use crate::macos::input::*;
use crate::{AppHandle, ClickerState};
use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult, EventField,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::Manager;

const POLL_INTERVAL: Duration = Duration::from_millis(4);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBinding {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_key: bool,
    pub main_vk: Option<i32>,
    pub key_token: String,
}

pub fn register_hotkey_inner(app: &AppHandle, hotkey: String) -> AppResult<String> {
    let state = app.state::<ClickerState>();
    state
        .suppress_hotkey_until_ms
        .store(now_epoch_ms().saturating_add(250), Ordering::SeqCst);
    state
        .suppress_hotkey_until_release
        .store(true, Ordering::SeqCst);
    if hotkey.is_empty() {
        *state
            .registered_hotkey
            .lock()
            .unwrap_or_else(poisoned_inner) = None;
        return Ok(String::new());
    }
    let binding = parse_hotkey_binding(&hotkey)?;
    *state
        .registered_hotkey
        .lock()
        .unwrap_or_else(poisoned_inner) = Some(binding.clone());
    Ok(format_hotkey_binding(&binding))
}

pub fn register_master_inner(app: &AppHandle, hotkey: String, hold_mode: bool) -> AppResult<()> {
    let state = app.state::<ClickerState>();
    let binding = if hotkey.is_empty() {
        None
    } else {
        Some(parse_hotkey_binding(&hotkey)?)
    };
    let previous = state
        .master_key
        .lock()
        .unwrap_or_else(poisoned_inner)
        .as_ref()
        .map(format_hotkey_binding);
    let next = binding.as_ref().map(format_hotkey_binding);
    let changed = previous != next;
    *state.master_key.lock().unwrap_or_else(poisoned_inner) = binding;
    state.master_hold_mode.store(hold_mode, Ordering::SeqCst);
    if next.is_none() {
        state.master_allowed.store(true, Ordering::SeqCst);
        state.last_master_allowed.store(true, Ordering::SeqCst);
    } else if changed {
        state.master_enabled.store(true, Ordering::SeqCst);
        state.master_allowed.store(true, Ordering::SeqCst);
        state.last_master_allowed.store(true, Ordering::SeqCst);
    }
    emit_status(app);
    Ok(())
}

pub fn normalize_hotkey(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn parse_hotkey_binding(hotkey: &str) -> AppResult<HotkeyBinding> {
    let normalized = normalize_hotkey(hotkey);
    let (mut ctrl, mut alt, mut shift, mut super_key) = (false, false, false, false);
    let mut main_key: Option<(i32, String)> = None;
    for token in normalized.split('+').map(str::trim) {
        if token.is_empty() {
            return Err(AppError::Hotkey(format!(
                "Invalid hotkey '{hotkey}': found empty key token"
            )));
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
                    return Err(AppError::Hotkey(format!(
                        "Invalid hotkey '{hotkey}': use modifiers first and only one main key"
                    )));
                }
            }
        }
    }
    Ok(HotkeyBinding {
        ctrl,
        alt,
        shift,
        super_key,
        main_vk: main_key.as_ref().map(|(vk, _)| *vk),
        key_token: main_key.map(|(_, token)| token).unwrap_or_default(),
    })
}

pub fn parse_hotkey_main_key(token: &str, original_hotkey: &str) -> AppResult<(i32, String)> {
    let lower = token.trim().to_ascii_lowercase();
    if let Some(binding) = parse_named_key_token(&lower)
        .or_else(|| parse_mouse_button_token(&lower))
        .or_else(|| parse_numpad_token(&lower))
        .or_else(|| parse_function_key_token(&lower))
    {
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
    Err(AppError::Hotkey(format!(
        "Couldn't recognize '{token}' as a valid key in '{original_hotkey}'"
    )))
}

pub fn format_hotkey_binding(binding: &HotkeyBinding) -> String {
    let mut parts = Vec::new();
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
    if !binding.key_token.is_empty() {
        parts.push(binding.key_token.clone());
    }
    parts.join("+")
}

static PHYSICAL_KEY_STATE: OnceLock<&'static [AtomicBool; 256]> = OnceLock::new();

fn physical_key_state() -> &'static [AtomicBool; 256] {
    PHYSICAL_KEY_STATE
        .get_or_init(|| Box::leak(Box::new(std::array::from_fn(|_| AtomicBool::new(false)))))
}

fn set_key_state(vk: i32, down: bool) {
    if (0..256).contains(&vk) {
        physical_key_state()[vk as usize].store(down, Ordering::Relaxed);
    }
    let generic = match vk as u16 {
        VK_LCONTROL | VK_RCONTROL => Some(VK_CONTROL),
        VK_LMENU | VK_RMENU => Some(VK_MENU),
        VK_LSHIFT | VK_RSHIFT => Some(VK_SHIFT),
        _ => None,
    };
    if let Some(generic) = generic {
        let group_down = match generic {
            VK_CONTROL => is_vk_down(VK_LCONTROL as i32) || is_vk_down(VK_RCONTROL as i32),
            VK_MENU => is_vk_down(VK_LMENU as i32) || is_vk_down(VK_RMENU as i32),
            VK_SHIFT => is_vk_down(VK_LSHIFT as i32) || is_vk_down(VK_RSHIFT as i32),
            _ => down,
        };
        physical_key_state()[generic as usize].store(group_down, Ordering::Relaxed);
    }
}

fn install_event_tap() -> Result<CGEventTap<'static>, ()> {
    CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![
            CGEventType::KeyDown,
            CGEventType::KeyUp,
            CGEventType::FlagsChanged,
            CGEventType::LeftMouseDown,
            CGEventType::LeftMouseUp,
            CGEventType::RightMouseDown,
            CGEventType::RightMouseUp,
            CGEventType::OtherMouseDown,
            CGEventType::OtherMouseUp,
        ],
        |_proxy, event_type, event| {
            if event_is_ours(event) {
                return CallbackResult::Keep;
            }
            match event_type {
                CGEventType::KeyDown | CGEventType::KeyUp => {
                    let code =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                    if let Some(vk) = vk_for_mac_keycode(code) {
                        set_key_state(vk, matches!(event_type, CGEventType::KeyDown));
                    }
                }
                CGEventType::FlagsChanged => {
                    let code =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                    if let (Some(vk), Some(flag)) = (
                        vk_for_mac_keycode(code),
                        modifier_flag_for_mac_keycode(code),
                    ) {
                        set_key_state(vk, event.get_flags().contains(flag));
                    }
                }
                _ => {
                    if let Some((vk, down)) = mouse_vk_for_event(event_type, event) {
                        set_key_state(vk, down);
                    }
                }
            }
            CallbackResult::Keep
        },
    )
}

pub fn start_hotkey_listener(app: AppHandle) {
    std::thread::spawn(move || {
        if !crate::macos::request_accessibility_permission() {
            log::warn!("[Hotkeys] macOS Accessibility permission is required for global input");
        }
        let event_tap = loop {
            match install_event_tap() {
                Ok(tap) => break tap,
                Err(()) => {
                    std::thread::sleep(Duration::from_secs(1));
                    if !crate::overlay::OVERLAY_THREAD_RUNNING.load(Ordering::SeqCst) {
                        return;
                    }
                }
            }
        };
        let source = match event_tap.mach_port().create_runloop_source(0) {
            Ok(source) => source,
            Err(()) => return,
        };
        CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopDefaultMode });
        event_tap.enable();

        let state = app.state::<ClickerState>();
        let mut was_pressed = false;
        let mut was_suppressed = false;
        let mut master_was_pressed = false;
        let mut last_check = Instant::now();

        while crate::overlay::OVERLAY_THREAD_RUNNING.load(Ordering::SeqCst) {
            CFRunLoop::run_in_mode(unsafe { kCFRunLoopDefaultMode }, POLL_INTERVAL, false);
            event_tap.enable();
            if last_check.elapsed() < POLL_INTERVAL {
                continue;
            }
            last_check = Instant::now();
            let (binding, strict) = {
                let binding = state
                    .registered_hotkey
                    .lock()
                    .unwrap_or_else(poisoned_inner)
                    .clone();
                let strict = state
                    .settings
                    .lock()
                    .unwrap_or_else(poisoned_inner)
                    .strict_hotkey_modifiers;
                (binding, strict)
            };
            let currently_pressed = binding
                .as_ref()
                .map(|binding| is_hotkey_binding_pressed(binding, strict))
                .unwrap_or(false);
            let master_binding = state
                .master_key
                .lock()
                .unwrap_or_else(poisoned_inner)
                .clone();
            let master_hold = state.master_hold_mode.load(Ordering::SeqCst);
            let mut master_enabled = state.master_enabled.load(Ordering::SeqCst);
            let master_binding_pressed = master_binding
                .as_ref()
                .map(|binding| is_hotkey_binding_pressed(binding, strict))
                .unwrap_or(false);
            if !master_hold && master_binding_pressed && !master_was_pressed {
                master_enabled = !master_enabled;
                state.master_enabled.store(master_enabled, Ordering::SeqCst);
            }
            master_was_pressed = master_binding_pressed;
            let master_allowed = match master_binding {
                None => true,
                Some(_) if master_hold => master_binding_pressed,
                Some(_) => master_enabled,
            };
            if master_allowed != state.last_master_allowed.load(Ordering::SeqCst) {
                state.master_allowed.store(master_allowed, Ordering::SeqCst);
                state
                    .last_master_allowed
                    .store(master_allowed, Ordering::SeqCst);
                emit_status(&app);
            }
            if state.running.load(Ordering::SeqCst) && !master_allowed {
                let _ = stop_clicker_inner(&app, Some(String::from("Stopped by master switch")));
            }

            let capture_active = state.hotkey_capture_active.load(Ordering::SeqCst);
            if capture_active
                || state.click_point_pick_active.load(Ordering::SeqCst)
                || state.custom_stop_zone_pick_active.load(Ordering::SeqCst)
            {
                if currently_pressed && !was_pressed && capture_active {
                    let mut warning = state.warning.lock().unwrap_or_else(poisoned_inner);
                    if warning.is_none() {
                        *warning = Some(String::from("Finish setting hotkey first"));
                        drop(warning);
                        emit_status(&app);
                    }
                }
                was_pressed = currently_pressed;
                continue;
            }
            if state.suppress_hotkey_until_release.load(Ordering::SeqCst) {
                if currently_pressed {
                    was_pressed = true;
                    continue;
                }
                state
                    .suppress_hotkey_until_release
                    .store(false, Ordering::SeqCst);
                was_pressed = false;
                was_suppressed = false;
                continue;
            }
            if now_epoch_ms() < state.suppress_hotkey_until_ms.load(Ordering::SeqCst) {
                was_pressed = currently_pressed;
                continue;
            }
            let suppress_mouse = binding.as_ref().is_some_and(is_mouse_hotkey_binding)
                && is_cursor_over_own_window(&app);
            if currently_pressed && !was_pressed {
                if suppress_mouse {
                    was_suppressed = true;
                } else {
                    was_suppressed = false;
                    if master_allowed {
                        handle_hotkey_pressed(&app);
                    }
                }
            } else if !currently_pressed && was_pressed {
                if !was_suppressed {
                    handle_hotkey_released(&app);
                }
                was_suppressed = false;
            }
            was_pressed = currently_pressed;
        }
    });
}

fn is_cursor_over_own_window(app: &AppHandle) -> bool {
    let Some((x, y)) = crate::engine::mouse::current_cursor_position() else {
        return false;
    };
    app.webview_windows().values().any(|window| {
        if !window.is_visible().unwrap_or(false) {
            return false;
        }
        let Ok(position) = window.outer_position() else {
            return false;
        };
        let Ok(size) = window.outer_size() else {
            return false;
        };
        let Ok(scale) = window.scale_factor() else {
            return false;
        };
        let left = position.x as f64 / scale;
        let top = position.y as f64 / scale;
        let width = size.width as f64 / scale;
        let height = size.height as f64 / scale;
        (x as f64) >= left
            && (x as f64) < left + width
            && (y as f64) >= top
            && (y as f64) < top + height
    })
}

pub fn handle_hotkey_pressed(app: &AppHandle) {
    let mode = app
        .state::<ClickerState>()
        .settings
        .lock()
        .unwrap_or_else(poisoned_inner)
        .mode
        .clone();
    if mode == "Toggle" {
        if let Err(error) = toggle_clicker_inner(app) {
            log::error!("[Hotkey] Toggle failed: {error}");
        }
    } else if mode == "Hold" {
        if let Err(error) = start_clicker_inner(app) {
            log::error!("[Hotkey] Start failed: {error}");
        }
    }
}

pub fn handle_hotkey_released(app: &AppHandle) {
    let mode = app
        .state::<ClickerState>()
        .settings
        .lock()
        .unwrap_or_else(poisoned_inner)
        .mode
        .clone();
    if mode == "Hold" {
        if let Err(error) = stop_clicker_inner(app, Some(String::from("Stopped from hold hotkey")))
        {
            log::error!("[Hotkey] Stop failed: {error}");
        }
    }
}

pub fn is_hotkey_binding_pressed(binding: &HotkeyBinding, strict: bool) -> bool {
    let ctrl = is_vk_down(VK_CONTROL as i32);
    let alt = is_vk_down(VK_MENU as i32);
    let shift = is_vk_down(VK_SHIFT as i32);
    let super_key = is_vk_down(VK_LWIN as i32) || is_vk_down(VK_RWIN as i32);
    modifiers_match(binding, ctrl, alt, shift, super_key, strict)
        && binding.main_vk.is_none_or(is_vk_down)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ModifierGroup {
    Ctrl,
    Alt,
    Shift,
    Super,
}

fn modifier_group_for_vk(vk: i32) -> Option<ModifierGroup> {
    if [VK_CONTROL as i32, VK_LCONTROL as i32, VK_RCONTROL as i32].contains(&vk) {
        Some(ModifierGroup::Ctrl)
    } else if [VK_MENU as i32, VK_LMENU as i32, VK_RMENU as i32].contains(&vk) {
        Some(ModifierGroup::Alt)
    } else if [VK_SHIFT as i32, VK_LSHIFT as i32, VK_RSHIFT as i32].contains(&vk) {
        Some(ModifierGroup::Shift)
    } else if [VK_LWIN as i32, VK_RWIN as i32].contains(&vk) {
        Some(ModifierGroup::Super)
    } else {
        None
    }
}

fn modifiers_match(
    binding: &HotkeyBinding,
    ctrl: bool,
    alt: bool,
    shift: bool,
    super_key: bool,
    strict: bool,
) -> bool {
    if (binding.ctrl && !ctrl)
        || (binding.alt && !alt)
        || (binding.shift && !shift)
        || (binding.super_key && !super_key)
    {
        return false;
    }
    if strict {
        let main = binding.main_vk.and_then(modifier_group_for_vk);
        if ctrl && !binding.ctrl && main != Some(ModifierGroup::Ctrl) {
            return false;
        }
        if alt && !binding.alt && main != Some(ModifierGroup::Alt) {
            return false;
        }
        if shift && !binding.shift && main != Some(ModifierGroup::Shift) {
            return false;
        }
        if super_key && !binding.super_key && main != Some(ModifierGroup::Super) {
            return false;
        }
    }
    true
}

pub fn is_vk_down(vk: i32) -> bool {
    (0..256).contains(&vk) && physical_key_state()[vk as usize].load(Ordering::Relaxed)
}

fn is_mouse_hotkey_binding(binding: &HotkeyBinding) -> bool {
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON, VK_XBUTTON1, VK_XBUTTON2]
        .map(i32::from)
        .contains(&binding.main_vk.unwrap_or(-1))
}

fn normalize_modifier_token(token: &str) -> Option<&'static str> {
    match token {
        "alt" | "option" | "leftalt" | "rightalt" | "altleft" | "altright" | "lalt" | "ralt" => {
            Some("alt")
        }
        "ctrl" | "control" | "leftctrl" | "rightctrl" | "ctrlleft" | "ctrlright" | "lctrl"
        | "rctrl" => Some("ctrl"),
        "shift" | "leftshift" | "rightshift" | "shiftleft" | "shiftright" | "lshift" | "rshift" => {
            Some("shift")
        }
        "super" | "command" | "cmd" | "meta" | "win" | "leftsuper" | "rightsuper" | "superleft"
        | "superright" | "leftwin" | "rightwin" | "winleft" | "winright" | "lwin" | "rwin" => {
            Some("super")
        }
        _ => None,
    }
}

fn binding(vk: u16, token: &str) -> (i32, String) {
    (vk as i32, token.to_string())
}

fn parse_named_key_token(token: &str) -> Option<(i32, String)> {
    match token {
        "<" | ">" | "intlbackslash" | "oem102" | "nonusbackslash" => {
            Some(binding(VK_OEM_102, "IntlBackslash"))
        }
        "space" | "spacebar" => Some(binding(VK_SPACE, "space")),
        "tab" => Some(binding(VK_TAB, "tab")),
        "enter" | "return" => Some(binding(VK_RETURN, "enter")),
        "backspace" => Some(binding(VK_BACK, "backspace")),
        "delete" | "del" => Some(binding(VK_DELETE, "delete")),
        "insert" | "ins" => Some(binding(VK_INSERT, "insert")),
        "home" => Some(binding(VK_HOME, "home")),
        "end" => Some(binding(VK_END, "end")),
        "pageup" | "pgup" => Some(binding(VK_PRIOR, "pageup")),
        "pagedown" | "pgdn" => Some(binding(VK_NEXT, "pagedown")),
        "up" | "arrowup" => Some(binding(VK_UP, "up")),
        "down" | "arrowdown" => Some(binding(VK_DOWN, "down")),
        "left" | "arrowleft" => Some(binding(VK_LEFT, "left")),
        "right" | "arrowright" => Some(binding(VK_RIGHT, "right")),
        "esc" | "escape" => Some(binding(VK_ESCAPE, "escape")),
        "leftctrl" | "ctrlleft" | "lctrl" => Some(binding(VK_LCONTROL, "leftctrl")),
        "rightctrl" | "ctrlright" | "rctrl" => Some(binding(VK_RCONTROL, "rightctrl")),
        "leftshift" | "shiftleft" | "lshift" => Some(binding(VK_LSHIFT, "leftshift")),
        "rightshift" | "shiftright" | "rshift" => Some(binding(VK_RSHIFT, "rightshift")),
        "leftalt" | "altleft" | "lalt" => Some(binding(VK_LMENU, "leftalt")),
        "rightalt" | "altright" | "ralt" | "altgr" => Some(binding(VK_RMENU, "rightalt")),
        "leftsuper" | "superleft" | "leftwin" | "winleft" | "lwin" => {
            Some(binding(VK_LWIN, "leftsuper"))
        }
        "rightsuper" | "superright" | "rightwin" | "winright" | "rwin" => {
            Some(binding(VK_RWIN, "rightsuper"))
        }
        "capslock" => Some(binding(VK_CAPITAL, "capslock")),
        "numlock" => Some(binding(VK_NUMLOCK, "numlock")),
        "scrolllock" => Some(binding(VK_SCROLL, "scrolllock")),
        "menu" | "apps" | "contextmenu" => Some(binding(VK_APPS, "menu")),
        "printscreen" | "prtsc" | "snapshot" => Some(binding(VK_SNAPSHOT, "printscreen")),
        "pause" | "break" => Some(binding(VK_PAUSE, "pause")),
        "/" | "slash" => Some(binding(VK_OEM_2, "/")),
        "\\" | "backslash" => Some(binding(VK_OEM_5, "\\")),
        ";" | "semicolon" => Some(binding(VK_OEM_1, ";")),
        "'" | "quote" | "apostrophe" => Some(binding(VK_OEM_7, "'")),
        "[" | "bracketleft" => Some(binding(VK_OEM_4, "[")),
        "]" | "bracketright" => Some(binding(VK_OEM_6, "]")),
        "-" | "minus" => Some(binding(VK_OEM_MINUS, "-")),
        "=" | "equal" => Some(binding(VK_OEM_PLUS, "=")),
        "`" | "backquote" | "grave" => Some(binding(VK_OEM_3, "`")),
        "," | "comma" => Some(binding(VK_OEM_COMMA, ",")),
        "." | "period" | "dot" => Some(binding(VK_OEM_PERIOD, ".")),
        _ => None,
    }
}

fn parse_mouse_button_token(token: &str) -> Option<(i32, String)> {
    match token {
        "mouseleft" | "leftmouse" | "leftbutton" | "mouse1" | "lmb" => {
            Some(binding(VK_LBUTTON, "mouseleft"))
        }
        "mouseright" | "rightmouse" | "rightbutton" | "mouse2" | "rmb" => {
            Some(binding(VK_RBUTTON, "mouseright"))
        }
        "mousemiddle" | "middlemouse" | "middlebutton" | "mouse3" | "mmb" | "scrollbutton"
        | "middleclick" => Some(binding(VK_MBUTTON, "mousemiddle")),
        "mouse4" | "xbutton1" | "mouseback" | "browserback" | "backbutton" => {
            Some(binding(VK_XBUTTON1, "mouse4"))
        }
        "mouse5" | "xbutton2" | "mouseforward" | "browserforward" | "forwardbutton" => {
            Some(binding(VK_XBUTTON2, "mouse5"))
        }
        _ => None,
    }
}

fn parse_numpad_token(token: &str) -> Option<(i32, String)> {
    let pair = match token {
        "numpad0" | "num0" => (VK_NUMPAD0, "numpad0"),
        "numpad1" | "num1" => (VK_NUMPAD1, "numpad1"),
        "numpad2" | "num2" => (VK_NUMPAD2, "numpad2"),
        "numpad3" | "num3" => (VK_NUMPAD3, "numpad3"),
        "numpad4" | "num4" => (VK_NUMPAD4, "numpad4"),
        "numpad5" | "num5" => (VK_NUMPAD5, "numpad5"),
        "numpad6" | "num6" => (VK_NUMPAD6, "numpad6"),
        "numpad7" | "num7" => (VK_NUMPAD7, "numpad7"),
        "numpad8" | "num8" => (VK_NUMPAD8, "numpad8"),
        "numpad9" | "num9" => (VK_NUMPAD9, "numpad9"),
        "numpadadd" | "numadd" | "numpadplus" | "numplus" => (VK_ADD, "numpadadd"),
        "numpadsubtract" | "numsubtract" | "numsub" | "numpadminus" | "numminus" => {
            (VK_SUBTRACT, "numpadsubtract")
        }
        "numpadmultiply" | "nummultiply" | "nummul" | "numpadmul" => {
            (VK_MULTIPLY, "numpadmultiply")
        }
        "numpaddivide" | "numdivide" | "numdiv" | "numpaddiv" => (VK_DIVIDE, "numpaddivide"),
        "numpaddecimal" | "numdecimal" | "numdot" | "numdel" | "numpadpoint" => {
            (VK_DECIMAL, "numpaddecimal")
        }
        _ => return None,
    };
    Some(binding(pair.0, pair.1))
}

fn parse_function_key_token(token: &str) -> Option<(i32, String)> {
    if !token.starts_with('f') || token.len() > 3 {
        return None;
    }
    let number = token[1..].parse::<u16>().ok()?;
    (1..=24)
        .contains(&number)
        .then(|| binding(VK_F1 + number - 1, token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_hotkeys_round_trip() {
        for value in ["f8", "ctrl+shift+a", "super+space", "mouse4", "numpad7"] {
            let parsed = parse_hotkey_binding(value).unwrap();
            assert_eq!(format_hotkey_binding(&parsed), value);
        }
    }
}
