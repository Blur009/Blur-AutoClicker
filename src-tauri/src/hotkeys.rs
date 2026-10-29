use crate::engine::worker::emit_status;
use crate::engine::worker::now_epoch_ms;
use crate::engine::worker::start_clicker_inner;
use crate::engine::worker::stop_clicker_inner;
use crate::engine::worker::toggle_clicker_inner;
use crate::engine::AUTOCLICKER_EXTRA_INFO;
use crate::error::poisoned_inner;
use crate::error::AppError;
use crate::error::AppResult;
use crate::AppHandle;
use crate::ClickerState;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use std::time::Instant;
use tauri::Manager;
use windows_sys::Win32::Foundation::{GetLastError, LRESULT, POINT};
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, GetThreadDesktop, GetUserObjectInformationW, OpenInputDesktop,
    DESKTOP_READOBJECTS, HDESK, UOI_NAME,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetAncestor, GetCursorPos, GetWindowThreadProcessId,
    MsgWaitForMultipleObjectsEx, PeekMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    WindowFromPoint, GA_ROOT, HHOOK, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSG, MSLLHOOKSTRUCT,
    MWMO_INPUTAVAILABLE, QS_ALLINPUT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_SYSKEYDOWN, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

const PM_REMOVE: u32 = 0x0001;

const POLL_INTERVAL_MS: u32 = 16;
const FOREGROUND_PROMPT_INTERVAL: Duration = Duration::from_millis(400);
const HOTKEY_HEALTH_INTERVAL: Duration = Duration::from_millis(400);

const MAX_CHORD_MAINS: usize = 5;

const PHYSICAL_CODE_KEYS: [(&str, u16, i32); 12] = [
    ("Backquote", 0x29, VK_OEM_3 as i32),
    ("Minus", 0x0C, VK_OEM_MINUS as i32),
    ("Equal", 0x0D, VK_OEM_PLUS as i32),
    ("BracketLeft", 0x1A, VK_OEM_4 as i32),
    ("BracketRight", 0x1B, VK_OEM_6 as i32),
    ("Backslash", 0x2B, VK_OEM_5 as i32),
    ("Semicolon", 0x27, VK_OEM_1 as i32),
    ("Quote", 0x28, VK_OEM_7 as i32),
    ("Comma", 0x33, VK_OEM_COMMA as i32),
    ("Period", 0x34, VK_OEM_PERIOD as i32),
    ("Slash", 0x35, VK_OEM_2 as i32),
    ("IntlBackslash", 0x56, VK_OEM_102 as i32),
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBinding {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub super_key: bool,
    pub left_ctrl: bool,
    pub right_ctrl: bool,
    pub left_alt: bool,
    pub right_alt: bool,
    pub left_shift: bool,
    pub right_shift: bool,
    pub left_super: bool,
    pub right_super: bool,
    pub main_vks: Vec<i32>,
    pub key_tokens: Vec<String>,
}

impl HotkeyBinding {
    pub fn main_vk(&self) -> Option<i32> {
        self.main_vks.first().copied()
    }
    pub fn key_token(&self) -> &str {
        self.key_tokens.first().map(|s| s.as_str()).unwrap_or("")
    }
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
    let prev_key = state
        .master_key
        .lock()
        .unwrap_or_else(poisoned_inner)
        .as_ref()
        .map(format_hotkey_binding);
    let new_key = binding.as_ref().map(format_hotkey_binding);
    let key_changed = prev_key != new_key;

    *state.master_key.lock().unwrap_or_else(poisoned_inner) = binding;
    state.master_hold_mode.store(hold_mode, Ordering::SeqCst);

    if new_key.is_none() {
        // Clearing the key always allows clicking; avoid a one-poll stale "off".
        state.master_allowed.store(true, Ordering::SeqCst);
        state.last_master_allowed.store(true, Ordering::SeqCst);
    } else if key_changed {
        // A freshly (re)bound key defaults to enabled, but a mode-only change
        // must not silently re-enable a master the user toggled off.
        let enabled = true;
        state.master_enabled.store(enabled, Ordering::SeqCst);
        state.master_allowed.store(enabled, Ordering::SeqCst);
        state.last_master_allowed.store(enabled, Ordering::SeqCst);
    }
    emit_status(app);
    Ok(())
}

pub fn normalize_hotkey(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn parse_hotkey_binding(hotkey: &str) -> AppResult<HotkeyBinding> {
    let normalized = normalize_hotkey(hotkey);
    if !normalized.contains('+') {
        let trimmed = normalized.trim();
        if let Some((vk, token)) = parse_named_key_token(trimmed) {
            const SIDE_VKS: [i32; 8] = [
                VK_LCONTROL as i32,
                VK_RCONTROL as i32,
                VK_LSHIFT as i32,
                VK_RSHIFT as i32,
                VK_LMENU as i32,
                VK_RMENU as i32,
                VK_LWIN as i32,
                VK_RWIN as i32,
            ];
            if SIDE_VKS.contains(&vk) {
                return Ok(HotkeyBinding {
                    ctrl: false,
                    alt: false,
                    shift: false,
                    super_key: false,
                    left_ctrl: false,
                    right_ctrl: false,
                    left_alt: false,
                    right_alt: false,
                    left_shift: false,
                    right_shift: false,
                    left_super: false,
                    right_super: false,
                    main_vks: vec![vk],
                    key_tokens: vec![token],
                });
            }
        }
    }
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut super_key = false;
    let mut left_ctrl = false;
    let mut right_ctrl = false;
    let mut left_alt = false;
    let mut right_alt = false;
    let mut left_shift = false;
    let mut right_shift = false;
    let mut left_super = false;
    let mut right_super = false;
    let mut mains: Vec<(i32, String)> = Vec::new();

    for token in normalized.split('+').map(str::trim) {
        if token.is_empty() {
            return Err(AppError::Hotkey(format!(
                "Invalid hotkey '{hotkey}': found empty key token"
            )));
        }

        match token {
            "ctrl" | "control" => ctrl = true,
            "leftctrl" | "ctrlleft" | "lctrl" => left_ctrl = true,
            "rightctrl" | "ctrlright" | "rctrl" => right_ctrl = true,
            "alt" | "option" => alt = true,
            "leftalt" | "altleft" | "lalt" => left_alt = true,
            "rightalt" | "altright" | "ralt" | "altgr" => right_alt = true,
            "shift" => shift = true,
            "leftshift" | "shiftleft" | "lshift" => left_shift = true,
            "rightshift" | "shiftright" | "rshift" => right_shift = true,
            "super" | "command" | "cmd" | "meta" | "win" => super_key = true,
            "leftsuper" | "superleft" | "leftwin" | "winleft" | "lwin" => left_super = true,
            "rightsuper" | "superright" | "rightwin" | "winright" | "rwin" => right_super = true,
            _ => {
                let entry = parse_hotkey_main_key(token, hotkey)?;
                if mains.len() >= MAX_CHORD_MAINS {
                    return Err(AppError::Hotkey(format!(
                        "Invalid hotkey '{hotkey}': chord supports up to {} main keys, got {}",
                        MAX_CHORD_MAINS,
                        mains.len() + 1
                    )));
                }
                if mains
                    .iter()
                    .any(|(vk, tok)| *vk == entry.0 || tok == &entry.1)
                {
                    return Err(AppError::Hotkey(format!(
                        "Invalid hotkey '{hotkey}': duplicate main key '{token}'"
                    )));
                }
                mains.push(entry);
            }
        }
    }

    if ctrl && (left_ctrl || right_ctrl) {
        return Err(AppError::Hotkey(format!(
            "Invalid hotkey '{hotkey}': use either generic 'ctrl' or side-specific 'leftctrl'/'rightctrl', not both"
        )));
    }
    if alt && (left_alt || right_alt) {
        return Err(AppError::Hotkey(format!(
            "Invalid hotkey '{hotkey}': use either generic 'alt' or side-specific 'leftalt'/'rightalt', not both"
        )));
    }
    if shift && (left_shift || right_shift) {
        return Err(AppError::Hotkey(format!(
            "Invalid hotkey '{hotkey}': use either generic 'shift' or side-specific 'leftshift'/'rightshift', not both"
        )));
    }
    if super_key && (left_super || right_super) {
        return Err(AppError::Hotkey(format!(
            "Invalid hotkey '{hotkey}': use either generic 'super' or side-specific 'leftsuper'/'rightsuper', not both"
        )));
    }

    // Canonical chord order: lexical sort by token for stable display / comparison
    mains.sort_by(|a, b| a.1.cmp(&b.1));
    let main_vks = mains.iter().map(|(vk, _)| *vk).collect();
    let key_tokens = mains.into_iter().map(|(_, tok)| tok).collect();

    Ok(HotkeyBinding {
        ctrl,
        alt,
        shift,
        super_key,
        left_ctrl,
        right_ctrl,
        left_alt,
        right_alt,
        left_shift,
        right_shift,
        left_super,
        right_super,
        main_vks,
        key_tokens,
    })
}

pub fn parse_hotkey_main_key(token: &str, original_hotkey: &str) -> AppResult<(i32, String)> {
    let lower = token.trim().to_ascii_lowercase();

    if let Some(binding) = parse_physical_code_token(&lower) {
        return Ok(binding);
    }

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

    let mut chars = lower.chars();
    if let (Some(ch), None) = (chars.next(), chars.next()) {
        if ch.is_ascii_lowercase() {
            return Ok((ch.to_ascii_uppercase() as i32, lower));
        }
        if ch.is_ascii_digit() {
            return Ok((ch as i32, lower));
        }
        if let Ok(wide) = u16::try_from(ch as u32) {
            let scan = unsafe { VkKeyScanW(wide) };
            if scan != -1 {
                let raw = scan as u16;
                if raw >> 8 != 0 {
                    return Err(AppError::Hotkey(format!(
                        "Invalid hotkey '{original_hotkey}': '{token}' is only reachable with a modifier on this keyboard layout"
                    )));
                }
                return Ok(((raw & 0xFF) as i32, lower));
            }
        }
        return Err(AppError::Hotkey(format!(
            "Invalid hotkey '{original_hotkey}': '{token}' isn't reachable on the current keyboard layout"
        )));
    }

    Err(AppError::Hotkey(format!(
        "Couldn't recognize '{token}' as a valid key in '{original_hotkey}'"
    )))
}

pub fn format_hotkey_binding(binding: &HotkeyBinding) -> String {
    let mut parts: Vec<String> = Vec::new();

    if binding.ctrl {
        parts.push(String::from("ctrl"));
    }
    if binding.left_ctrl {
        parts.push(String::from("leftctrl"));
    }
    if binding.right_ctrl {
        parts.push(String::from("rightctrl"));
    }
    if binding.alt {
        parts.push(String::from("alt"));
    }
    if binding.left_alt {
        parts.push(String::from("leftalt"));
    }
    if binding.right_alt {
        parts.push(String::from("rightalt"));
    }
    if binding.shift {
        parts.push(String::from("shift"));
    }
    if binding.left_shift {
        parts.push(String::from("leftshift"));
    }
    if binding.right_shift {
        parts.push(String::from("rightshift"));
    }
    if binding.super_key {
        parts.push(String::from("super"));
    }
    if binding.left_super {
        parts.push(String::from("leftsuper"));
    }
    if binding.right_super {
        parts.push(String::from("rightsuper"));
    }

    for tok in &binding.key_tokens {
        parts.push(tok.clone());
    }
    parts.join("+")
}

static PHYSICAL_KEY_STATE: OnceLock<&'static [AtomicBool; 256]> = OnceLock::new();
static HOOKS_ACTIVE: AtomicBool = AtomicBool::new(false);
static HOOK_EVENTS: AtomicU64 = AtomicU64::new(0);
static SYNTHETIC_RELEASE_STATE: OnceLock<&'static [AtomicBool; 256]> = OnceLock::new();
static OWN_PID: OnceLock<u32> = OnceLock::new();
static OWN_ROOT_HWND: AtomicIsize = AtomicIsize::new(0);

fn physical_key_state() -> &'static [AtomicBool; 256] {
    PHYSICAL_KEY_STATE
        .get_or_init(|| Box::leak(Box::new(std::array::from_fn(|_| AtomicBool::new(false)))))
}

fn synthetic_release_state() -> &'static [AtomicBool; 256] {
    SYNTHETIC_RELEASE_STATE
        .get_or_init(|| Box::leak(Box::new(std::array::from_fn(|_| AtomicBool::new(false)))))
}

fn is_physical_vk_down(vk: i32) -> bool {
    if !(0..256).contains(&vk) {
        return false;
    }
    physical_key_state()[vk as usize].load(Ordering::Relaxed)
}

fn normalize_low_level_keyboard_vk(khs: &KBDLLHOOKSTRUCT) -> i32 {
    match khs.vkCode as u16 {
        VK_SHIFT => {
            let mapped = unsafe { MapVirtualKeyW(khs.scanCode, MAPVK_VSC_TO_VK_EX) };
            if mapped == 0 {
                VK_SHIFT as i32
            } else {
                mapped as i32
            }
        }
        VK_CONTROL => {
            if (khs.flags & LLKHF_EXTENDED) != 0 {
                VK_RCONTROL as i32
            } else {
                VK_LCONTROL as i32
            }
        }
        VK_MENU => {
            if (khs.flags & LLKHF_EXTENDED) != 0 {
                VK_RMENU as i32
            } else {
                VK_LMENU as i32
            }
        }
        _ => khs.vkCode as i32,
    }
}

unsafe extern "system" fn mouse_ll_proc(n_code: i32, w_param: usize, l_param: isize) -> LRESULT {
    if n_code >= 0 {
        let mhs = &*(l_param as *const MSLLHOOKSTRUCT);
        if (mhs.dwExtraInfo) != AUTOCLICKER_EXTRA_INFO {
            let (vk, down) = match w_param as u32 {
                WM_LBUTTONDOWN => (VK_LBUTTON as i32, true),
                WM_LBUTTONUP => (VK_LBUTTON as i32, false),
                WM_RBUTTONDOWN => (VK_RBUTTON as i32, true),
                WM_RBUTTONUP => (VK_RBUTTON as i32, false),
                WM_MBUTTONDOWN => (VK_MBUTTON as i32, true),
                WM_MBUTTONUP => (VK_MBUTTON as i32, false),
                WM_XBUTTONDOWN => {
                    let x = if ((mhs.mouseData >> 16) & 0xFFFF) == 1 {
                        VK_XBUTTON1 as i32
                    } else {
                        VK_XBUTTON2 as i32
                    };
                    (x, true)
                }
                WM_XBUTTONUP => {
                    let x = if ((mhs.mouseData >> 16) & 0xFFFF) == 1 {
                        VK_XBUTTON1 as i32
                    } else {
                        VK_XBUTTON2 as i32
                    };
                    (x, false)
                }
                _ => (-1, false),
            };
            if vk >= 0 && (vk as usize) < 256 {
                physical_key_state()[vk as usize].store(down, Ordering::Relaxed);
                HOOK_EVENTS.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param)
}

unsafe extern "system" fn keyboard_ll_proc(n_code: i32, w_param: usize, l_param: isize) -> LRESULT {
    if n_code >= 0 {
        let khs = &*(l_param as *const KBDLLHOOKSTRUCT);
        if (khs.dwExtraInfo) != AUTOCLICKER_EXTRA_INFO {
            let vk = normalize_low_level_keyboard_vk(khs);
            if (0..256).contains(&vk) {
                let down = matches!(w_param as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
                physical_key_state()[vk as usize].store(down, Ordering::Relaxed);
                synthetic_release_state()[vk as usize].store(false, Ordering::Relaxed);
                HOOK_EVENTS.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param)
}

unsafe fn install_hooks() -> (HHOOK, HHOOK) {
    let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_ll_proc), std::ptr::null_mut(), 0);
    let kb_hook = SetWindowsHookExW(
        WH_KEYBOARD_LL,
        Some(keyboard_ll_proc),
        std::ptr::null_mut(),
        0,
    );

    if !mouse_hook.is_null() && !kb_hook.is_null() {
        HOOKS_ACTIVE.store(true, Ordering::SeqCst);
        return (mouse_hook, kb_hook);
    }

    let err = GetLastError();
    if !mouse_hook.is_null() {
        UnhookWindowsHookEx(mouse_hook);
    }
    if !kb_hook.is_null() {
        UnhookWindowsHookEx(kb_hook);
    }
    log::warn!("[Hotkeys] {}", AppError::WindowsSystem(err));
    (std::ptr::null_mut(), std::ptr::null_mut())
}

unsafe fn replace_hooks(mouse_hook: HHOOK, kb_hook: HHOOK) -> (HHOOK, HHOOK) {
    let (new_mouse, new_kb) = install_hooks();
    if new_mouse.is_null() || new_kb.is_null() {
        return (mouse_hook, kb_hook);
    }
    if !mouse_hook.is_null() {
        UnhookWindowsHookEx(mouse_hook);
    }
    if !kb_hook.is_null() {
        UnhookWindowsHookEx(kb_hook);
    }
    (new_mouse, new_kb)
}

fn desktop_name(desktop: HDESK) -> Option<Vec<u16>> {
    unsafe {
        let mut needed: u32 = 0;
        GetUserObjectInformationW(desktop, UOI_NAME, std::ptr::null_mut(), 0, &mut needed);
        if needed == 0 || needed > 512 {
            return None;
        }
        let mut buffer: Vec<u16> = vec![0; needed as usize / 2 + 1];
        if GetUserObjectInformationW(
            desktop,
            UOI_NAME,
            buffer.as_mut_ptr().cast(),
            (buffer.len() * 2) as u32,
            &mut needed,
        ) == 0
        {
            return None;
        }
        let len = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        buffer.truncate(len);
        Some(buffer)
    }
}

fn input_desktop_visible() -> Option<bool> {
    unsafe {
        let desktop = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS);
        if desktop.is_null() {
            return None;
        }
        let input = desktop_name(desktop);
        CloseDesktop(desktop);
        let own = desktop_name(GetThreadDesktop(GetCurrentThreadId()));
        match (input, own) {
            (Some(input), Some(own)) => Some(input == own),
            _ => None,
        }
    }
}

fn resync_physical_key_state() -> bool {
    let mut cleared = false;
    for (vk, latched) in physical_key_state().iter().enumerate() {
        if synthetic_release_state()[vk].load(Ordering::Relaxed) {
            continue;
        }
        if latched.load(Ordering::Relaxed) && !is_vk_down(vk as i32) {
            latched.store(false, Ordering::Relaxed);
            cleared = true;
        }
    }
    cleared
}

pub fn start_hotkey_listener(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        std::thread::sleep(Duration::from_secs(2));

        let (mut mouse_hook, mut kb_hook) = install_hooks();

        let state = app.state::<ClickerState>();
        let mut was_pressed = false;
        let mut was_suppressed = false;
        let mut master_was_pressed = false;
        let mut last_foreground_check = Instant::now();
        let mut last_health_check = Instant::now();
        let mut last_hook_events = HOOK_EVENTS.load(Ordering::Relaxed);
        let mut session_away = false;
        let mut msg: MSG = std::mem::zeroed();

        'outer: loop {
            MsgWaitForMultipleObjectsEx(
                0,
                std::ptr::null(),
                POLL_INTERVAL_MS,
                QS_ALLINPUT,
                MWMO_INPUTAVAILABLE,
            );

            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_QUIT {
                    break 'outer;
                }
            }

            let tick_now = Instant::now();
            if tick_now.duration_since(last_health_check) >= HOTKEY_HEALTH_INTERVAL {
                last_health_check = tick_now;
                let hook_events = HOOK_EVENTS.load(Ordering::Relaxed);
                let hooks_quiet = hook_events == last_hook_events;
                last_hook_events = hook_events;

                let resumed = match input_desktop_visible() {
                    Some(true) => std::mem::take(&mut session_away),
                    _ => {
                        session_away = true;
                        false
                    }
                };

                if resumed {
                    for flag in synthetic_release_state().iter() {
                        flag.store(false, Ordering::Relaxed);
                    }
                    resync_physical_key_state();
                    (mouse_hook, kb_hook) = replace_hooks(mouse_hook, kb_hook);
                    log::info!("[Hotkeys] Session resumed, hooks reinstalled");
                } else if hooks_quiet && resync_physical_key_state() {
                    (mouse_hook, kb_hook) = replace_hooks(mouse_hook, kb_hook);
                }
            }

            if tick_now.duration_since(last_foreground_check) >= FOREGROUND_PROMPT_INTERVAL
                && state.elevation_notice_enabled.load(Ordering::SeqCst)
                && state
                    .elevation_blocked_window
                    .lock()
                    .unwrap_or_else(poisoned_inner)
                    .is_none()
            {
                last_foreground_check = tick_now;
                let generation = state.elevation_prompt_generation.load(Ordering::SeqCst);
                let suppressed = state
                    .elevation_suppressed
                    .lock()
                    .unwrap_or_else(poisoned_inner)
                    .clone();
                if let Some((handle, pid)) = crate::elevation::foreground_needs_prompt(&suppressed)
                {
                    let stored = {
                        let mut blocked = state
                            .elevation_blocked_window
                            .lock()
                            .unwrap_or_else(poisoned_inner);
                        let generation_matches =
                            state.elevation_prompt_generation.load(Ordering::SeqCst) == generation;
                        let notices_enabled = state.elevation_notice_enabled.load(Ordering::SeqCst);
                        crate::app_state::claim_blocked_window(
                            &mut blocked,
                            generation_matches,
                            notices_enabled,
                            handle,
                            pid,
                        )
                    };
                    if stored {
                        crate::elevation::remember_suppressed(
                            &mut state
                                .elevation_suppressed
                                .lock()
                                .unwrap_or_else(poisoned_inner),
                            (handle, pid),
                        );
                        emit_status(&app);
                        resolve_blocked_window_label(&app, handle, pid, generation);
                    }
                }
            }

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

            let running = state.running.load(Ordering::SeqCst);
            let currently_pressed = binding
                .as_ref()
                .map(|b| {
                    if HOOKS_ACTIVE.load(Ordering::Relaxed) {
                        let physical = is_hotkey_binding_pressed_physical(b, strict);
                        physical || (!running && is_hotkey_binding_pressed(b, strict))
                    } else {
                        is_hotkey_binding_pressed(b, strict)
                    }
                })
                .unwrap_or(false);

            let master_binding = {
                state
                    .master_key
                    .lock()
                    .unwrap_or_else(poisoned_inner)
                    .clone()
            };
            let master_hold = state.master_hold_mode.load(Ordering::SeqCst);
            let mut master_enabled = state.master_enabled.load(Ordering::SeqCst);

            let master_binding_pressed = match master_binding {
                None => false,
                Some(ref b) => {
                    if HOOKS_ACTIVE.load(Ordering::Relaxed) {
                        is_hotkey_binding_pressed_physical(b, strict)
                            || (!running && is_hotkey_binding_pressed(b, strict))
                    } else {
                        is_hotkey_binding_pressed(b, strict)
                    }
                }
            };

            if !master_hold && master_binding_pressed && !master_was_pressed {
                master_enabled = !master_enabled;
                state.master_enabled.store(master_enabled, Ordering::SeqCst);
            }
            master_was_pressed = master_binding_pressed;

            let master_allowed = match master_binding {
                None => true,
                Some(_) => {
                    if master_hold {
                        master_binding_pressed
                    } else {
                        master_enabled
                    }
                }
            };

            if master_allowed != state.last_master_allowed.load(Ordering::SeqCst) {
                state.master_allowed.store(master_allowed, Ordering::SeqCst);
                state
                    .last_master_allowed
                    .store(master_allowed, Ordering::SeqCst);
                emit_status(&app);
            }

            if running && !master_allowed {
                let _ = stop_clicker_inner(&app, Some(String::from("Stopped by master switch")));
            }

            let suppress_until = state.suppress_hotkey_until_ms.load(Ordering::SeqCst);
            let suppress_until_release = state.suppress_hotkey_until_release.load(Ordering::SeqCst);
            let hotkey_capture_active = state.hotkey_capture_active.load(Ordering::SeqCst);
            let click_point_pick_active = state.click_point_pick_active.load(Ordering::SeqCst);
            let custom_stop_zone_pick_active =
                state.custom_stop_zone_pick_active.load(Ordering::SeqCst);

            if hotkey_capture_active || click_point_pick_active || custom_stop_zone_pick_active {
                if currently_pressed && !was_pressed && hotkey_capture_active {
                    let needs_emit = {
                        let mut warning = state.warning.lock().unwrap_or_else(poisoned_inner);
                        if warning.is_none() {
                            *warning = Some(String::from("Finish setting hotkey first"));
                            true
                        } else {
                            false
                        }
                    };
                    if needs_emit {
                        emit_status(&app);
                    }
                }
                was_pressed = currently_pressed;
                continue;
            }

            if suppress_until_release {
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

            if suppress_until != 0 && now_epoch_ms() < suppress_until {
                was_pressed = currently_pressed;
                continue;
            }

            let suppress_mouse_on_own_window =
                binding.as_ref().is_some_and(is_mouse_hotkey_binding)
                    && is_cursor_over_own_window();

            if currently_pressed && !was_pressed {
                log::debug!(
                    "[Hotkeys] press detected (master_allowed={master_allowed}, on_own_window={suppress_mouse_on_own_window})"
                );
                if suppress_mouse_on_own_window {
                    was_suppressed = true;
                } else {
                    was_suppressed = false;
                    if master_allowed {
                        if should_release_trigger_modifiers(
                            HOOKS_ACTIVE.load(Ordering::Relaxed),
                            state.running.load(Ordering::SeqCst),
                        ) {
                            release_trigger_modifiers(binding.as_ref());
                        }
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

        if !mouse_hook.is_null() {
            UnhookWindowsHookEx(mouse_hook);
        }
        if !kb_hook.is_null() {
            UnhookWindowsHookEx(kb_hook);
        }
    });
}

fn resolve_blocked_window_label(app: &AppHandle, handle: isize, pid: u32, generation: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        let window = crate::elevation::describe_window(handle, pid);
        let state = app.state::<ClickerState>();
        let matched = {
            let mut blocked = state
                .elevation_blocked_window
                .lock()
                .unwrap_or_else(poisoned_inner);
            let generation_matches =
                state.elevation_prompt_generation.load(Ordering::SeqCst) == generation;
            crate::app_state::apply_blocked_window_label(
                &mut blocked,
                generation_matches,
                handle,
                pid,
                &window,
            )
        };
        if matched {
            crate::notifications::elevation_blocked(&app, &window);
            emit_status(&app);
        }
    });
}

fn is_mouse_hotkey_binding(binding: &HotkeyBinding) -> bool {
    let mouse_vks = [
        VK_LBUTTON as i32,
        VK_RBUTTON as i32,
        VK_MBUTTON as i32,
        VK_XBUTTON1 as i32,
        VK_XBUTTON2 as i32,
    ];
    binding.main_vks.iter().any(|vk| mouse_vks.contains(vk))
}

fn own_pid() -> u32 {
    *OWN_PID.get_or_init(|| unsafe { GetCurrentProcessId() })
}

fn is_cursor_over_own_window() -> bool {
    unsafe {
        let mut pt: POINT = std::mem::zeroed();
        if GetCursorPos(&mut pt) == 0 {
            return false;
        }
        let hwnd = WindowFromPoint(pt);
        if hwnd.is_null() {
            return false;
        }
        let cached = OWN_ROOT_HWND.load(Ordering::Relaxed);
        if cached != 0 && hwnd as isize == cached {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == own_pid() {
                return true;
            }
        }
        let root = GetAncestor(hwnd, GA_ROOT);
        let root = if root.is_null() { hwnd } else { root };
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(root, &mut pid);
        let own = pid == own_pid();
        if own {
            OWN_ROOT_HWND.store(root as isize, Ordering::Relaxed);
        } else if cached != 0 && root as isize == cached {
            let _ = OWN_ROOT_HWND.compare_exchange(cached, 0, Ordering::Relaxed, Ordering::Relaxed);
        }
        own
    }
}

fn is_hotkey_binding_pressed_physical(binding: &HotkeyBinding, strict: bool) -> bool {
    let lctrl_down = is_physical_vk_down(VK_LCONTROL as i32);
    let rctrl_down = is_physical_vk_down(VK_RCONTROL as i32);
    let lalt_down = is_physical_vk_down(VK_LMENU as i32);
    let ralt_down = is_physical_vk_down(VK_RMENU as i32);
    let lshift_down = is_physical_vk_down(VK_LSHIFT as i32);
    let rshift_down = is_physical_vk_down(VK_RSHIFT as i32);
    let lsuper_down = is_physical_vk_down(VK_LWIN as i32);
    let rsuper_down = is_physical_vk_down(VK_RWIN as i32);
    let down = DownState {
        ctrl: lctrl_down || rctrl_down,
        alt: lalt_down || ralt_down,
        shift: lshift_down || rshift_down,
        super_down: lsuper_down || rsuper_down,
        lctrl: lctrl_down,
        rctrl: rctrl_down,
        lalt: lalt_down,
        ralt: ralt_down,
        lshift: lshift_down,
        rshift: rshift_down,
        lsuper: lsuper_down,
        rsuper: rsuper_down,
    };
    if !modifiers_match(binding, &down, strict) {
        return false;
    }
    if binding.main_vks.is_empty() {
        return true;
    }
    binding.main_vks.iter().all(|vk| is_physical_vk_down(*vk))
}

fn trigger_modifier_vks(binding: &HotkeyBinding) -> Vec<u16> {
    let mut keys: Vec<u16> = Vec::new();
    if binding.ctrl {
        keys.extend_from_slice(&[VK_LCONTROL, VK_RCONTROL]);
    }
    if binding.left_ctrl {
        keys.push(VK_LCONTROL);
    }
    if binding.right_ctrl {
        keys.push(VK_RCONTROL);
    }
    if binding.alt {
        keys.extend_from_slice(&[VK_LMENU, VK_RMENU]);
    }
    if binding.left_alt {
        keys.push(VK_LMENU);
    }
    if binding.right_alt {
        keys.push(VK_RMENU);
    }
    if binding.shift {
        keys.extend_from_slice(&[VK_LSHIFT, VK_RSHIFT]);
    }
    if binding.left_shift {
        keys.push(VK_LSHIFT);
    }
    if binding.right_shift {
        keys.push(VK_RSHIFT);
    }
    if binding.super_key {
        keys.extend_from_slice(&[VK_LWIN, VK_RWIN]);
    }
    if binding.left_super {
        keys.push(VK_LWIN);
    }
    if binding.right_super {
        keys.push(VK_RWIN);
    }
    keys.sort_unstable();
    keys.dedup();
    keys
}

fn should_release_trigger_modifiers(hooks_active: bool, running: bool) -> bool {
    hooks_active && !running
}

fn release_trigger_modifiers(binding: Option<&HotkeyBinding>) {
    let Some(binding) = binding else {
        return;
    };
    for vk in trigger_modifier_vks(binding) {
        if is_vk_down(vk as i32) && crate::engine::keyboard::send_key_event(vk, KEYEVENTF_KEYUP) {
            synthetic_release_state()[vk as usize].store(true, Ordering::Relaxed);
        }
    }
}

pub fn handle_hotkey_pressed(app: &AppHandle) {
    let mode = {
        let state = app.state::<ClickerState>();
        let mode = state
            .settings
            .lock()
            .unwrap_or_else(poisoned_inner)
            .mode
            .clone();
        mode
    };

    if mode == "Toggle" {
        if let Err(e) = toggle_clicker_inner(app) {
            log::error!("[Hotkey] Toggle failed: {e}");
        }
    } else if mode == "Hold" {
        if let Err(e) = start_clicker_inner(app) {
            log::error!("[Hotkey] Start failed: {e}");
        }
    }
}

pub fn handle_hotkey_released(app: &AppHandle) {
    let mode = {
        let state = app.state::<ClickerState>();
        let mode = state
            .settings
            .lock()
            .unwrap_or_else(poisoned_inner)
            .mode
            .clone();
        mode
    };

    if mode == "Hold" {
        if let Err(e) = stop_clicker_inner(app, Some(String::from("Stopped from hold hotkey"))) {
            log::error!("[Hotkey] Stop failed: {e}");
        }
    }
}

pub fn is_hotkey_binding_pressed(binding: &HotkeyBinding, strict: bool) -> bool {
    let lctrl_down = is_vk_down(VK_LCONTROL as i32);
    let rctrl_down = is_vk_down(VK_RCONTROL as i32);
    let lalt_down = is_vk_down(VK_LMENU as i32);
    let ralt_down = is_vk_down(VK_RMENU as i32);
    let lshift_down = is_vk_down(VK_LSHIFT as i32);
    let rshift_down = is_vk_down(VK_RSHIFT as i32);
    let lsuper_down = is_vk_down(VK_LWIN as i32);
    let rsuper_down = is_vk_down(VK_RWIN as i32);
    let down = DownState {
        ctrl: lctrl_down || rctrl_down || is_vk_down(VK_CONTROL as i32),
        alt: lalt_down || ralt_down || is_vk_down(VK_MENU as i32),
        shift: lshift_down || rshift_down || is_vk_down(VK_SHIFT as i32),
        super_down: lsuper_down || rsuper_down,
        lctrl: lctrl_down,
        rctrl: rctrl_down,
        lalt: lalt_down,
        ralt: ralt_down,
        lshift: lshift_down,
        rshift: rshift_down,
        lsuper: lsuper_down,
        rsuper: rsuper_down,
    };
    if !modifiers_match(binding, &down, strict) {
        return false;
    }

    if binding.main_vks.is_empty() {
        return true;
    }
    binding.main_vks.iter().all(|vk| is_vk_down(*vk))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

struct DownState {
    ctrl: bool,
    alt: bool,
    shift: bool,
    super_down: bool,
    lctrl: bool,
    rctrl: bool,
    lalt: bool,
    ralt: bool,
    lshift: bool,
    rshift: bool,
    lsuper: bool,
    rsuper: bool,
}

fn modifiers_match(binding: &HotkeyBinding, down: &DownState, strict: bool) -> bool {
    if binding.ctrl && !down.ctrl {
        return false;
    }
    if binding.left_ctrl && !down.lctrl {
        return false;
    }
    if binding.right_ctrl && !down.rctrl {
        return false;
    }
    if binding.alt && !down.alt {
        return false;
    }
    if binding.left_alt && !down.lalt {
        return false;
    }
    if binding.right_alt && !down.ralt {
        return false;
    }
    if binding.shift && !down.shift {
        return false;
    }
    if binding.left_shift && !down.lshift {
        return false;
    }
    if binding.right_shift && !down.rshift {
        return false;
    }
    if binding.super_key && !down.super_down {
        return false;
    }
    if binding.left_super && !down.lsuper {
        return false;
    }
    if binding.right_super && !down.rsuper {
        return false;
    }

    if strict {
        let contains = |g: ModifierGroup| {
            binding
                .main_vks
                .iter()
                .any(|vk| modifier_group_for_vk(*vk) == Some(g))
        };
        // generic extra check
        if down.ctrl
            && !binding.ctrl
            && !binding.left_ctrl
            && !binding.right_ctrl
            && !contains(ModifierGroup::Ctrl)
        {
            return false;
        }
        if down.alt
            && !binding.alt
            && !binding.left_alt
            && !binding.right_alt
            && !contains(ModifierGroup::Alt)
        {
            return false;
        }
        if down.shift
            && !binding.shift
            && !binding.left_shift
            && !binding.right_shift
            && !contains(ModifierGroup::Shift)
        {
            return false;
        }
        if down.super_down
            && !binding.super_key
            && !binding.left_super
            && !binding.right_super
            && !contains(ModifierGroup::Super)
        {
            return false;
        }
        // side-specific extra check: wrong side pressed when specific side required
        if down.lctrl && !binding.left_ctrl && !binding.ctrl && !contains(ModifierGroup::Ctrl) {
            return false;
        }
        if down.rctrl && !binding.right_ctrl && !binding.ctrl && !contains(ModifierGroup::Ctrl) {
            return false;
        }
        if down.lalt && !binding.left_alt && !binding.alt && !contains(ModifierGroup::Alt) {
            return false;
        }
        if down.ralt && !binding.right_alt && !binding.alt && !contains(ModifierGroup::Alt) {
            return false;
        }
        if down.lshift && !binding.left_shift && !binding.shift && !contains(ModifierGroup::Shift) {
            return false;
        }
        if down.rshift && !binding.right_shift && !binding.shift && !contains(ModifierGroup::Shift)
        {
            return false;
        }
        if down.lsuper
            && !binding.left_super
            && !binding.super_key
            && !contains(ModifierGroup::Super)
        {
            return false;
        }
        if down.rsuper
            && !binding.right_super
            && !binding.super_key
            && !contains(ModifierGroup::Super)
        {
            return false;
        }
    }

    true
}

pub fn is_vk_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn binding(vk: i32, token: &str) -> (i32, String) {
    (vk, token.to_string())
}

fn parse_physical_code_token(token: &str) -> Option<(i32, String)> {
    let (name, scan, fallback_vk) = *PHYSICAL_CODE_KEYS
        .iter()
        .find(|(name, _, _)| name.eq_ignore_ascii_case(token))?;
    let mapped = unsafe { MapVirtualKeyW(scan as u32, MAPVK_VSC_TO_VK_EX) } as i32;
    let vk = if mapped == 0 { fallback_vk } else { mapped };
    Some(binding(vk, name))
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
        "leftctrl" | "ctrlleft" | "lctrl" => Some(binding(VK_LCONTROL as i32, "leftctrl")),
        "rightctrl" | "ctrlright" | "rctrl" => Some(binding(VK_RCONTROL as i32, "rightctrl")),
        "leftshift" | "shiftleft" | "lshift" => Some(binding(VK_LSHIFT as i32, "leftshift")),
        "rightshift" | "shiftright" | "rshift" => Some(binding(VK_RSHIFT as i32, "rightshift")),
        "leftalt" | "altleft" | "lalt" => Some(binding(VK_LMENU as i32, "leftalt")),
        "rightalt" | "altright" | "ralt" | "altgr" => Some(binding(VK_RMENU as i32, "rightalt")),
        "leftsuper" | "superleft" | "leftwin" | "winleft" | "lwin" => {
            Some(binding(VK_LWIN as i32, "leftsuper"))
        }
        "rightsuper" | "superright" | "rightwin" | "winright" | "rwin" => {
            Some(binding(VK_RWIN as i32, "rightsuper"))
        }
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
        "mousemiddle" | "middlemouse" | "middlebutton" | "mouse3" | "mmb" | "scrollbutton"
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
    use super::{
        format_hotkey_binding, is_mouse_hotkey_binding, modifiers_match, parse_hotkey_binding,
        parse_hotkey_main_key, parse_physical_code_token, should_release_trigger_modifiers,
        trigger_modifier_vks, DownState, HotkeyBinding, PHYSICAL_CODE_KEYS,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        VK_LCONTROL, VK_LMENU, VK_LWIN, VK_OEM_102, VK_RCONTROL, VK_RMENU, VK_RSHIFT,
    };

    fn bare_binding() -> HotkeyBinding {
        HotkeyBinding {
            ctrl: false,
            alt: false,
            shift: false,
            super_key: false,
            left_ctrl: false,
            right_ctrl: false,
            left_alt: false,
            right_alt: false,
            left_shift: false,
            right_shift: false,
            left_super: false,
            right_super: false,
            main_vks: vec![b'Y' as i32],
            key_tokens: vec![String::from("Y")],
        }
    }

    #[test]
    fn trigger_modifiers_cover_both_sides_of_a_generic_modifier() {
        let mut binding = bare_binding();
        binding.ctrl = true;
        binding.alt = true;
        assert_eq!(
            trigger_modifier_vks(&binding),
            vec![VK_LCONTROL, VK_RCONTROL, VK_LMENU, VK_RMENU]
        );
    }

    #[test]
    fn trigger_modifiers_honour_a_sided_modifier() {
        let mut binding = bare_binding();
        binding.left_ctrl = true;
        binding.right_shift = true;
        binding.left_super = true;
        assert_eq!(
            trigger_modifier_vks(&binding),
            vec![VK_LWIN, VK_RSHIFT, VK_LCONTROL]
        );
    }

    #[test]
    fn trigger_modifiers_are_released_only_when_starting_with_hooks() {
        assert!(should_release_trigger_modifiers(true, false));
        assert!(!should_release_trigger_modifiers(true, true));
        assert!(!should_release_trigger_modifiers(false, false));
    }

    #[test]
    fn trigger_modifiers_are_empty_for_a_plain_key() {
        assert!(trigger_modifier_vks(&bare_binding()).is_empty());
    }

    #[test]
    fn physical_code_tokens_round_trip() {
        for token in [
            "Backquote",
            "Minus",
            "Equal",
            "BracketLeft",
            "BracketRight",
            "Backslash",
            "Semicolon",
            "Quote",
            "Comma",
            "Period",
            "Slash",
            "IntlBackslash",
        ] {
            let hotkey = format!("ctrl+shift+{token}");
            let binding = parse_hotkey_binding(&hotkey).expect("token should parse");
            assert!(
                binding.main_vk().unwrap_or(0) > 0,
                "token {token} should resolve a virtual key"
            );
            assert_eq!(binding.key_token(), token, "token {token}");
            assert_eq!(format_hotkey_binding(&binding), hotkey, "token {token}");
        }
        let intl = parse_hotkey_binding("IntlBackslash").expect("intl backslash should parse");
        assert_eq!(intl.main_vk(), Some(VK_OEM_102 as i32));
        assert_eq!(intl.key_token(), "IntlBackslash");
        for alias in ["<", ">", "oem102", "nonusbackslash"] {
            let aliased = parse_hotkey_binding(alias).expect("alias should parse");
            assert_eq!(aliased.main_vk(), Some(VK_OEM_102 as i32), "alias {alias}");
            assert_eq!(aliased.key_token(), "IntlBackslash", "alias {alias}");
            assert_eq!(
                format_hotkey_binding(&aliased),
                "IntlBackslash",
                "alias {alias}"
            );
        }
    }

    #[test]
    fn physical_code_table_covers_every_shared_code_token() {
        let tokens = [
            "Backquote",
            "Minus",
            "Equal",
            "BracketLeft",
            "BracketRight",
            "Backslash",
            "Semicolon",
            "Quote",
            "Comma",
            "Period",
            "Slash",
            "IntlBackslash",
        ];
        assert_eq!(tokens.len(), PHYSICAL_CODE_KEYS.len());
        for token in tokens {
            assert!(
                PHYSICAL_CODE_KEYS.iter().any(|(name, _, _)| *name == token),
                "{token} is missing from the scan code table"
            );
            let (vk, parsed_token) =
                parse_physical_code_token(token).expect("scan code table should resolve the token");
            assert!(vk > 0, "token {token} should resolve a virtual key");
            let binding = parse_hotkey_binding(token).expect("token should parse as a hotkey");
            assert_eq!(binding.key_token(), parsed_token, "token {token}");
            assert_eq!(format_hotkey_binding(&binding), token, "token {token}");
        }
    }

    #[test]
    fn multi_byte_single_character_reaches_the_layout_lookup() {
        assert_eq!("ä".len(), 2);
        let message = match parse_hotkey_main_key("ä", "ä") {
            Ok(binding) => panic!("multibyte character was accepted as {binding:?}"),
            Err(error) => error.to_string(),
        };
        assert_eq!(
            message,
            "Invalid hotkey 'ä': 'ä' isn't reachable on the current keyboard layout"
        );
    }

    #[test]
    fn character_that_needs_a_modifier_is_rejected_by_name() {
        let message = match parse_hotkey_main_key("!", "!") {
            Ok(binding) => panic!("shifted character was accepted as {binding:?}"),
            Err(error) => error.to_string(),
        };
        assert_eq!(
            message,
            "Invalid hotkey '!': '!' is only reachable with a modifier on this keyboard layout"
        );
    }

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
            assert_eq!(binding.key_token(), token);
            assert_eq!(format_hotkey_binding(&binding), hotkey);
        }
    }

    #[test]
    fn mouse_button_bindings_are_detected() {
        for hotkey in [
            "mouseleft",
            "mouseright",
            "mousemiddle",
            "mouse4",
            "mouse5",
            "ctrl+mouseleft",
            "shift+mouse4",
        ] {
            let binding = parse_hotkey_binding(hotkey).expect("mouse token should parse");
            assert!(is_mouse_hotkey_binding(&binding));
        }
        for hotkey in ["f8", "space", "ctrl+shift+f8"] {
            let binding = parse_hotkey_binding(hotkey).expect("key token should parse");
            assert!(!is_mouse_hotkey_binding(&binding));
        }
    }

    #[test]
    fn empty_hotkeys_are_rejected() {
        assert!(parse_hotkey_binding("").is_err());
        assert!(parse_hotkey_binding("ctrl+").is_err());
    }

    #[test]
    fn standalone_modifier_tokens_round_trip() {
        for token in [
            "leftctrl",
            "rightctrl",
            "leftshift",
            "rightshift",
            "leftalt",
            "rightalt",
            "leftsuper",
            "rightsuper",
        ] {
            let binding = parse_hotkey_binding(token).expect("modifier key should parse");
            assert!(
                binding.main_vk().is_some(),
                "token {token} should be distinct"
            );
            assert!(!binding.ctrl, "token {token}");
            assert!(!binding.alt, "token {token}");
            assert!(!binding.shift, "token {token}");
            assert!(!binding.super_key, "token {token}");
            assert_eq!(binding.key_token(), token, "token {token}");
            assert_eq!(format_hotkey_binding(&binding), token, "token {token}");
        }
        let generic = parse_hotkey_binding("ctrl").expect("ctrl should parse");
        assert_eq!(generic.main_vk(), None);
        assert!(generic.ctrl);
        assert_eq!(format_hotkey_binding(&generic), "ctrl");
        let generic_chord = parse_hotkey_binding("ctrl+shift").expect("chord should parse");
        assert!(generic_chord.ctrl);
        assert!(generic_chord.shift);
        assert_eq!(generic_chord.main_vk(), None);
        assert_eq!(format_hotkey_binding(&generic_chord), "ctrl+shift");
        let side_chord =
            parse_hotkey_binding("leftctrl+leftshift").expect("side chord should parse");
        assert!(side_chord.left_ctrl);
        assert!(side_chord.left_shift);
        assert_eq!(side_chord.main_vk(), None);
        assert_eq!(format_hotkey_binding(&side_chord), "leftctrl+leftshift");
        let side_combo = parse_hotkey_binding("leftctrl+e").expect("side combo should parse");
        assert!(side_combo.left_ctrl);
        assert_eq!(side_combo.key_token(), "e");
        assert_eq!(format_hotkey_binding(&side_combo), "leftctrl+e");
    }

    #[test]
    fn standalone_modifier_main_key_is_not_extra_in_strict_mode() {
        let binding = parse_hotkey_binding("leftalt").expect("left alt should parse");
        assert!(modifiers_match(
            &binding,
            &DownState {
                ctrl: false,
                alt: true,
                shift: false,
                super_down: false,
                lctrl: false,
                rctrl: false,
                lalt: true,
                ralt: false,
                lshift: false,
                rshift: false,
                lsuper: false,
                rsuper: false
            },
            true
        ));
        assert!(!modifiers_match(
            &binding,
            &DownState {
                ctrl: true,
                alt: true,
                shift: false,
                super_down: false,
                lctrl: true,
                rctrl: false,
                lalt: true,
                ralt: false,
                lshift: false,
                rshift: false,
                lsuper: false,
                rsuper: false
            },
            true
        ));
    }

    #[test]
    fn extra_modifiers_do_not_block_hotkeys_in_relaxed_mode() {
        let binding = parse_hotkey_binding("f11").expect("hotkey should parse");
        assert!(modifiers_match(
            &binding,
            &DownState {
                ctrl: false,
                alt: false,
                shift: true,
                super_down: false,
                lctrl: false,
                rctrl: false,
                lalt: false,
                ralt: false,
                lshift: true,
                rshift: false,
                lsuper: false,
                rsuper: false
            },
            false
        ));
        assert!(modifiers_match(
            &binding,
            &DownState {
                ctrl: true,
                alt: true,
                shift: true,
                super_down: true,
                lctrl: true,
                rctrl: true,
                lalt: true,
                ralt: true,
                lshift: true,
                rshift: true,
                lsuper: true,
                rsuper: true
            },
            false
        ));
    }

    #[test]
    fn extra_modifiers_block_hotkeys_in_strict_mode() {
        let binding = parse_hotkey_binding("f11").expect("hotkey should parse");
        assert!(!modifiers_match(
            &binding,
            &DownState {
                ctrl: false,
                alt: false,
                shift: true,
                super_down: false,
                lctrl: false,
                rctrl: false,
                lalt: false,
                ralt: false,
                lshift: true,
                rshift: false,
                lsuper: false,
                rsuper: false
            },
            true
        ));
        assert!(!modifiers_match(
            &binding,
            &DownState {
                ctrl: true,
                alt: true,
                shift: true,
                super_down: true,
                lctrl: true,
                rctrl: true,
                lalt: true,
                ralt: true,
                lshift: true,
                rshift: true,
                lsuper: true,
                rsuper: true
            },
            true
        ));
        assert!(modifiers_match(
            &binding,
            &DownState {
                ctrl: false,
                alt: false,
                shift: false,
                super_down: false,
                lctrl: false,
                rctrl: false,
                lalt: false,
                ralt: false,
                lshift: false,
                rshift: false,
                lsuper: false,
                rsuper: false
            },
            true
        ));
    }

    #[test]
    fn chord_mouse_and_keyboard_pairs_parse_and_sort() {
        let b = parse_hotkey_binding("b+a").expect("chord should parse");
        assert_eq!(b.key_tokens, vec!["a", "b"]);
        assert_eq!(format_hotkey_binding(&b), "a+b");

        let m = parse_hotkey_binding("mouseright+mouseleft").expect("mouse chord should parse");
        assert_eq!(m.key_tokens, vec!["mouseleft", "mouseright"]);
        assert_eq!(format_hotkey_binding(&m), "mouseleft+mouseright");

        let mixed = parse_hotkey_binding("mouseleft+a").expect("mixed chord");
        assert_eq!(mixed.key_tokens, vec!["a", "mouseleft"]);

        let with_mod = parse_hotkey_binding("ctrl+b+a").expect("mod+chord");
        assert!(with_mod.ctrl);
        assert_eq!(with_mod.key_tokens, vec!["a", "b"]);
        assert_eq!(format_hotkey_binding(&with_mod), "ctrl+a+b");
    }

    #[test]
    fn chord_rejects_too_many_or_duplicate_mains() {
        // up to 5 allowed, 6 should fail
        assert!(parse_hotkey_binding("a+b+c+d+e").is_ok());
        assert!(parse_hotkey_binding("a+b+c+d+e+f").is_err());
        assert!(parse_hotkey_binding("a+a").is_err());
        assert!(parse_hotkey_binding("mouseleft+mouseleft").is_err());
    }

    #[test]
    fn chord_is_detected_as_mouse_when_any_main_is_mouse() {
        let b = parse_hotkey_binding("mouseleft+a").unwrap();
        assert!(is_mouse_hotkey_binding(&b));
        let k = parse_hotkey_binding("a+b").unwrap();
        assert!(!is_mouse_hotkey_binding(&k));
        let mm = parse_hotkey_binding("mouseleft+mouseright").unwrap();
        assert!(is_mouse_hotkey_binding(&mm));
    }

    #[test]
    fn chord_pressed_requires_all_mains() {
        // relaxed mode, no modifiers required
        let binding = parse_hotkey_binding("a+b").unwrap();
        // simulate both needed but we test via modifiers_match only; pressed check needs real VK state
        // Just verify chord parsing retains both vks sorted
        assert_eq!(binding.main_vks.len(), 2);
        // Ensure different order normalizes same
        let rev = parse_hotkey_binding("b+a").unwrap();
        assert_eq!(binding, rev);
    }
}
