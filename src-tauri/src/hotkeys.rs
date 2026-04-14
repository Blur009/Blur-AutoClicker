use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
#[cfg(target_os = "windows")]
use std::sync::atomic::AtomicIsize;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
use std::time::Duration;
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::Manager;
#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
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
const MOD_X1: u8 = 1 << 4;
const MOD_X2: u8 = 1 << 5;

const WHEEL_DIR_NONE: i8 = 0;
const WHEEL_DIR_UP: i8 = 1;
const WHEEL_DIR_DOWN: i8 = -1;

static WHEEL_HOOK_STARTED: AtomicBool = AtomicBool::new(false);
static WHEEL_UP_SEQ: AtomicU64 = AtomicU64::new(0);
static WHEEL_DOWN_SEQ: AtomicU64 = AtomicU64::new(0);
static WHEEL_UP_MODS: AtomicU8 = AtomicU8::new(0);
static WHEEL_DOWN_MODS: AtomicU8 = AtomicU8::new(0);
static PHYSICAL_LBUTTON_DOWN: AtomicBool = AtomicBool::new(false);
static PHYSICAL_RBUTTON_DOWN: AtomicBool = AtomicBool::new(false);
static PHYSICAL_MBUTTON_DOWN: AtomicBool = AtomicBool::new(false);
static PHYSICAL_XBUTTON1_DOWN: AtomicBool = AtomicBool::new(false);
static PHYSICAL_XBUTTON2_DOWN: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static HOTKEY_CAPTURE_MENU_GUARD_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static MAIN_WNDPROC_GUARD_INSTALLED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static MAIN_WNDPROC_ORIGINAL: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static HOTKEY_CAPTURE_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
#[cfg(target_os = "windows")]
const HOTKEY_CAPTURE_SPECIAL_EVENT: &str = "hotkey-capture-special";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBinding {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_key: bool,
    pub xbutton1_modifier: bool,
    pub xbutton2_modifier: bool,
    pub main_vk: i32,
    pub wheel_direction: i8,
    pub key_token: String,
}

fn binding_modifier_mask(binding: &HotkeyBinding) -> u8 {
    (if binding.ctrl { MOD_CTRL } else { 0 })
        | (if binding.alt { MOD_ALT } else { 0 })
        | (if binding.shift { MOD_SHIFT } else { 0 })
        | (if binding.super_key { MOD_SUPER } else { 0 })
        | (if binding.xbutton1_modifier { MOD_X1 } else { 0 })
        | (if binding.xbutton2_modifier { MOD_X2 } else { 0 })
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
    if is_vk_down(VK_XBUTTON1 as i32) {
        mask |= MOD_X1;
    }
    if is_vk_down(VK_XBUTTON2 as i32) {
        mask |= MOD_X2;
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
    if code == HC_ACTION as i32 && l_param != 0 {
        let data = &*(l_param as *const MSLLHOOKSTRUCT);
        let event = w_param as u32;
        let injected = (data.flags & LLMHF_INJECTED as u32) != 0
            || (data.flags & LLMHF_LOWER_IL_INJECTED as u32) != 0;

        if !injected {
            match event {
                WM_LBUTTONDOWN => PHYSICAL_LBUTTON_DOWN.store(true, Ordering::SeqCst),
                WM_LBUTTONUP => PHYSICAL_LBUTTON_DOWN.store(false, Ordering::SeqCst),
                WM_RBUTTONDOWN => PHYSICAL_RBUTTON_DOWN.store(true, Ordering::SeqCst),
                WM_RBUTTONUP => PHYSICAL_RBUTTON_DOWN.store(false, Ordering::SeqCst),
                WM_MBUTTONDOWN => PHYSICAL_MBUTTON_DOWN.store(true, Ordering::SeqCst),
                WM_MBUTTONUP => PHYSICAL_MBUTTON_DOWN.store(false, Ordering::SeqCst),
                WM_XBUTTONDOWN | WM_XBUTTONUP => {
                    let is_down = event == WM_XBUTTONDOWN;
                    let xbutton = ((data.mouseData >> 16) & 0xffff) as u16;
                    if xbutton == XBUTTON1 as u16 {
                        PHYSICAL_XBUTTON1_DOWN.store(is_down, Ordering::SeqCst);
                    } else if xbutton == XBUTTON2 as u16 {
                        PHYSICAL_XBUTTON2_DOWN.store(is_down, Ordering::SeqCst);
                    }
                }
                _ => {}
            }
        }

        if event == WM_MOUSEWHEEL {
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
    }

    CallNextHookEx(0, code, w_param, l_param)
}

#[cfg(target_os = "windows")]
fn get_hwnd(window: &tauri::WebviewWindow) -> Result<isize, String> {
    let handle = window.window_handle().map_err(|e| e.to_string())?;
    match handle.as_raw() {
        RawWindowHandle::Win32(w) => Ok(w.hwnd.get()),
        _ => Err("Not a Win32 window".to_string()),
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn main_window_syscommand_guard_proc(
    hwnd: HWND,
    msg: u32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if msg == WM_SYSKEYDOWN && HOTKEY_CAPTURE_MENU_GUARD_ACTIVE.load(Ordering::SeqCst) {
        if w_param as u32 == VK_SPACE as u32 {
            let is_repeat = (l_param & (1isize << 30)) != 0;
            if !is_repeat {
                if let Some(app) = HOTKEY_CAPTURE_APP_HANDLE.get() {
                    let _ = app.emit(HOTKEY_CAPTURE_SPECIAL_EVENT, "alt+space");
                }
            }
            return 0;
        }
    }

    if msg == WM_SYSCHAR && HOTKEY_CAPTURE_MENU_GUARD_ACTIVE.load(Ordering::SeqCst) {
        if w_param as u32 == VK_SPACE as u32 {
            return 0;
        }
    }

    if msg == WM_SYSCOMMAND && HOTKEY_CAPTURE_MENU_GUARD_ACTIVE.load(Ordering::SeqCst) {
        let command = (w_param & 0xFFF0usize) as u32;
        if command == SC_KEYMENU {
            return 0;
        }
    }

    let previous = MAIN_WNDPROC_ORIGINAL.load(Ordering::SeqCst);
    if previous != 0 {
        let previous_proc: WNDPROC = Some(std::mem::transmute::<
            isize,
            unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
        >(previous));
        return CallWindowProcW(previous_proc, hwnd, msg, w_param, l_param);
    }

    DefWindowProcW(hwnd, msg, w_param, l_param)
}

#[cfg(target_os = "windows")]
pub fn install_main_window_sysmenu_guard(app: &AppHandle) -> Result<(), String> {
    if MAIN_WNDPROC_GUARD_INSTALLED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let _ = HOTKEY_CAPTURE_APP_HANDLE.set(app.clone());

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let hwnd = get_hwnd(&window)?;

    let previous = unsafe {
        SetWindowLongPtrW(
            hwnd,
            GWLP_WNDPROC,
            main_window_syscommand_guard_proc as *const () as isize,
        )
    };
    if previous == 0 {
        MAIN_WNDPROC_GUARD_INSTALLED.store(false, Ordering::SeqCst);
        return Err("Failed to install main window system menu guard".to_string());
    }
    MAIN_WNDPROC_ORIGINAL.store(previous, Ordering::SeqCst);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn install_main_window_sysmenu_guard(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn set_hotkey_capture_menu_guard_active(active: bool) {
    HOTKEY_CAPTURE_MENU_GUARD_ACTIVE.store(active, Ordering::SeqCst);
}

#[cfg(not(target_os = "windows"))]
pub fn set_hotkey_capture_menu_guard_active(_active: bool) {}

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

fn click_button_to_vk(mouse_button: &str) -> i32 {
    match mouse_button {
        "Right" => VK_RBUTTON as i32,
        "Middle" => VK_MBUTTON as i32,
        _ => VK_LBUTTON as i32,
    }
}

fn is_mouse_vk(vk: i32) -> bool {
    vk == VK_LBUTTON as i32 || vk == VK_RBUTTON as i32 || vk == VK_MBUTTON as i32
}

fn is_mouse_or_side_vk(vk: i32) -> bool {
    is_mouse_vk(vk) || vk == VK_XBUTTON1 as i32 || vk == VK_XBUTTON2 as i32
}

fn is_physical_mouse_vk_down(vk: i32) -> bool {
    match vk {
        vk if vk == VK_LBUTTON as i32 => PHYSICAL_LBUTTON_DOWN.load(Ordering::SeqCst),
        vk if vk == VK_RBUTTON as i32 => PHYSICAL_RBUTTON_DOWN.load(Ordering::SeqCst),
        vk if vk == VK_MBUTTON as i32 => PHYSICAL_MBUTTON_DOWN.load(Ordering::SeqCst),
        vk if vk == VK_XBUTTON1 as i32 => PHYSICAL_XBUTTON1_DOWN.load(Ordering::SeqCst),
        vk if vk == VK_XBUTTON2 as i32 => PHYSICAL_XBUTTON2_DOWN.load(Ordering::SeqCst),
        _ => is_vk_down(vk),
    }
}

fn should_ignore_main_button_while_running(
    app: &AppHandle,
    binding: &HotkeyBinding,
    mode: &str,
) -> bool {
    if mode != "Hold" {
        return false;
    }

    if !app.state::<ClickerState>().running.load(Ordering::SeqCst) {
        return false;
    }

    if !is_mouse_vk(binding.main_vk) {
        return false;
    }

    let click_button_vk = {
        let state = app.state::<ClickerState>();
        let settings = state.settings.lock().unwrap();
        click_button_to_vk(&settings.mouse_button)
    };

    binding.main_vk == click_button_vk
}

fn normalize_side_button_alias(token: &str) -> Option<&'static str> {
    match token {
        "xbutton1" | "mouse4" | "mb4" | "mouseback" | "browserback" => Some("xbutton1"),
        "xbutton2" | "mouse5" | "mb5" | "mouseforward" | "browserforward" => Some("xbutton2"),
        _ => None,
    }
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
    let mut xbutton1_modifier = false;
    let mut xbutton2_modifier = false;
    let mut main_key: Option<(i32, String, i8)> = None;
    let mut side_candidates: Vec<&'static str> = Vec::new();

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
                if let Some(side) = normalize_side_button_alias(token) {
                    side_candidates.push(side);
                    continue;
                }

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

    if main_key.is_none() {
        if let Some(side_main) = side_candidates.pop() {
            main_key = Some(parse_hotkey_main_key(side_main, hotkey)?);
        }
    }

    for side in side_candidates {
        if side == "xbutton1" {
            xbutton1_modifier = true;
        } else if side == "xbutton2" {
            xbutton2_modifier = true;
        }
    }

    let (main_vk, key_token, wheel_direction) =
        main_key.ok_or_else(|| format!("Invalid hotkey '{hotkey}': missing main key"))?;

    if main_vk == VK_XBUTTON1 as i32 {
        xbutton1_modifier = false;
    }
    if main_vk == VK_XBUTTON2 as i32 {
        xbutton2_modifier = false;
    }

    Ok(HotkeyBinding {
        ctrl,
        alt,
        shift,
        super_key,
        xbutton1_modifier,
        xbutton2_modifier,
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
        "lbutton" | "leftmouse" | "mouse1" | "mb1" => {
            Some((VK_LBUTTON as i32, String::from("lbutton")))
        }
        "rbutton" | "rightmouse" | "mouse2" | "mb2" => {
            Some((VK_RBUTTON as i32, String::from("rbutton")))
        }
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
        "numpad0" | "num0" => Some((VK_NUMPAD0 as i32, String::from("numpad0"))),
        "numpad1" | "num1" => Some((VK_NUMPAD1 as i32, String::from("numpad1"))),
        "numpad2" | "num2" => Some((VK_NUMPAD2 as i32, String::from("numpad2"))),
        "numpad3" | "num3" => Some((VK_NUMPAD3 as i32, String::from("numpad3"))),
        "numpad4" | "num4" => Some((VK_NUMPAD4 as i32, String::from("numpad4"))),
        "numpad5" | "num5" => Some((VK_NUMPAD5 as i32, String::from("numpad5"))),
        "numpad6" | "num6" => Some((VK_NUMPAD6 as i32, String::from("numpad6"))),
        "numpad7" | "num7" => Some((VK_NUMPAD7 as i32, String::from("numpad7"))),
        "numpad8" | "num8" => Some((VK_NUMPAD8 as i32, String::from("numpad8"))),
        "numpad9" | "num9" => Some((VK_NUMPAD9 as i32, String::from("numpad9"))),
        "numpaddecimal" | "numdecimal" | "numpaddec" => {
            Some((VK_DECIMAL as i32, String::from("numpaddecimal")))
        }
        "numpadadd" | "numpadplus" | "numadd" => {
            Some((VK_ADD as i32, String::from("numpadadd")))
        }
        "numpadsubtract" | "numpadminus" | "numsub" => {
            Some((VK_SUBTRACT as i32, String::from("numpadsubtract")))
        }
        "numpadmultiply" | "numpadtimes" | "nummul" => {
            Some((VK_MULTIPLY as i32, String::from("numpadmultiply")))
        }
        "numpaddivide" | "numpaddiv" | "numdiv" => {
            Some((VK_DIVIDE as i32, String::from("numpaddivide")))
        }
        "numpadenter" | "numenter" => Some((VK_RETURN as i32, String::from("numpadenter"))),
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
    if binding.xbutton1_modifier {
        parts.push(String::from("xbutton1"));
    }
    if binding.xbutton2_modifier {
        parts.push(String::from("xbutton2"));
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
            let mode = {
                let state = app.state::<ClickerState>();
                let settings = state.settings.lock().unwrap();
                settings.mode.clone()
            };

            let is_wheel_hotkey = binding.as_ref().map(is_wheel_binding).unwrap_or(false);
            let ignore_main_button = binding
                .as_ref()
                .map(|binding| should_ignore_main_button_while_running(&app, binding, &mode))
                .unwrap_or(false);
            let currently_pressed = binding
                .as_ref()
                .map(|binding| {
                    is_hotkey_binding_pressed(
                        binding,
                        &mut last_wheel_up_seq,
                        &mut last_wheel_down_seq,
                        ignore_main_button,
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
                let alt_space_pressed = is_vk_down(VK_MENU as i32) && is_vk_down(VK_SPACE as i32);
                if alt_space_pressed {
                    let _ = app.emit(HOTKEY_CAPTURE_SPECIAL_EVENT, "alt+space");
                }

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
    ignore_main_button: bool,
) -> bool {
    if binding.wheel_direction != WHEEL_DIR_NONE {
        return consume_wheel_trigger(binding, last_wheel_up_seq, last_wheel_down_seq);
    }

    let ctrl_down = is_vk_down(VK_CONTROL as i32);
    let alt_down = is_vk_down(VK_MENU as i32);
    let shift_down = is_vk_down(VK_SHIFT as i32);
    let super_down = is_vk_down(VK_LWIN as i32) || is_vk_down(VK_RWIN as i32);
    let xbutton1_down = is_physical_mouse_vk_down(VK_XBUTTON1 as i32);
    let xbutton2_down = is_physical_mouse_vk_down(VK_XBUTTON2 as i32);

    if ctrl_down != binding.ctrl
        || alt_down != binding.alt
        || shift_down != binding.shift
        || super_down != binding.super_key
    {
        return false;
    }

    if binding.main_vk != VK_XBUTTON1 as i32 && xbutton1_down != binding.xbutton1_modifier {
        return false;
    }
    if binding.main_vk != VK_XBUTTON2 as i32 && xbutton2_down != binding.xbutton2_modifier {
        return false;
    }

    if ignore_main_button {
        return is_physical_mouse_vk_down(binding.main_vk);
    }

    if is_mouse_or_side_vk(binding.main_vk) {
        return is_physical_mouse_vk_down(binding.main_vk);
    }

    is_vk_down(binding.main_vk)
}

pub fn is_vk_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}
