use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
#[cfg(target_os = "macos")]
use core_graphics::event::{CGEvent, CGEventTapLocation, KeyCode};
#[cfg(target_os = "macos")]
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX, VK_CAPITAL,
    VK_SHIFT,
};

use super::worker::{sleep_interruptible, RunControl};

#[inline]
#[cfg(target_os = "windows")]
fn vk_to_scan(vk: u16) -> (u16, bool) {
    // MAPVK_VK_TO_VSC_EX returns the scan code in the low byte and, for
    // extended keys (arrows, Ins/Del/Home/End/PgUp/PgDn, numpad Enter, etc.),
    // a 0xE0/0xE1 prefix byte in the high byte. A non-zero high byte means
    // KEYEVENTF_EXTENDEDKEY must be set so apps that key off the extended
    // bit (or use raw input) see the correct key.
    let raw = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC_EX) };
    ((raw & 0xFF) as u16, (raw >> 8) != 0)
}

#[inline]
#[cfg(target_os = "windows")]
pub fn make_keyboard_input(vk: u16, flags: u32) -> INPUT {
    let (scan, extended) = vk_to_scan(vk);
    let ext_flag = if extended { KEYEVENTF_EXTENDEDKEY } else { 0 };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: scan,
                dwFlags: flags | KEYEVENTF_SCANCODE | ext_flag,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[inline]
#[cfg(target_os = "windows")]
pub fn send_key_event(vk: u16, flags: u32) {
    let input = make_keyboard_input(vk, flags);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
}

pub fn is_alphabetic_vk(vk: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&vk)
}

#[cfg(target_os = "windows")]
fn caps_lock_enabled() -> bool {
    unsafe { (GetKeyState(VK_CAPITAL as i32) & 1) != 0 }
}

#[cfg(not(target_os = "windows"))]
fn caps_lock_enabled() -> bool {
    false
}

fn should_hold_shift_for_case(vk: u16, uppercase: bool) -> bool {
    is_alphabetic_vk(vk) && (caps_lock_enabled() != uppercase)
}

#[cfg(target_os = "windows")]
fn push_key_press(inputs: &mut Vec<INPUT>, vk: u16, use_shift: bool) {
    if use_shift {
        inputs.push(make_keyboard_input(VK_SHIFT, 0));
    }

    inputs.push(make_keyboard_input(vk, 0));
    inputs.push(make_keyboard_input(vk, KEYEVENTF_KEYUP));

    if use_shift {
        inputs.push(make_keyboard_input(VK_SHIFT, KEYEVENTF_KEYUP));
    }
}

#[cfg(target_os = "windows")]
fn send_key_down(vk: u16, use_shift: bool) {
    if use_shift {
        send_key_event(VK_SHIFT, 0);
    }
    send_key_event(vk, 0);
}

#[cfg(target_os = "windows")]
fn send_key_up(vk: u16, use_shift: bool) {
    send_key_event(vk, KEYEVENTF_KEYUP);
    if use_shift {
        send_key_event(VK_SHIFT, KEYEVENTF_KEYUP);
    }
}

#[cfg(target_os = "windows")]
pub fn send_key_batch(vk: u16, n: usize, uppercase: bool) {
    let use_shift = should_hold_shift_for_case(vk, uppercase);
    let inputs_per_press = if use_shift { 4 } else { 2 };
    let mut inputs: Vec<INPUT> = Vec::with_capacity(n * inputs_per_press);
    for _ in 0..n {
        push_key_press(&mut inputs, vk, use_shift);
    }
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
}

#[cfg(target_os = "macos")]
fn mac_keycode_from_windows_vk(vk: u16) -> Option<u16> {
    Some(match vk {
        0x08 => KeyCode::DELETE,
        0x09 => KeyCode::TAB,
        0x0D => KeyCode::RETURN,
        0x1B => KeyCode::ESCAPE,
        0x20 => KeyCode::SPACE,
        0x21 => KeyCode::PAGE_UP,
        0x22 => KeyCode::PAGE_DOWN,
        0x23 => KeyCode::END,
        0x24 => KeyCode::HOME,
        0x25 => KeyCode::LEFT_ARROW,
        0x26 => KeyCode::UP_ARROW,
        0x27 => KeyCode::RIGHT_ARROW,
        0x28 => KeyCode::DOWN_ARROW,
        0x2D => KeyCode::HELP,
        0x2E => KeyCode::FORWARD_DELETE,
        0x30 => KeyCode::ANSI_0,
        0x31 => KeyCode::ANSI_1,
        0x32 => KeyCode::ANSI_2,
        0x33 => KeyCode::ANSI_3,
        0x34 => KeyCode::ANSI_4,
        0x35 => KeyCode::ANSI_5,
        0x36 => KeyCode::ANSI_6,
        0x37 => KeyCode::ANSI_7,
        0x38 => KeyCode::ANSI_8,
        0x39 => KeyCode::ANSI_9,
        0x41 => KeyCode::ANSI_A,
        0x42 => KeyCode::ANSI_B,
        0x43 => KeyCode::ANSI_C,
        0x44 => KeyCode::ANSI_D,
        0x45 => KeyCode::ANSI_E,
        0x46 => KeyCode::ANSI_F,
        0x47 => KeyCode::ANSI_G,
        0x48 => KeyCode::ANSI_H,
        0x49 => KeyCode::ANSI_I,
        0x4A => KeyCode::ANSI_J,
        0x4B => KeyCode::ANSI_K,
        0x4C => KeyCode::ANSI_L,
        0x4D => KeyCode::ANSI_M,
        0x4E => KeyCode::ANSI_N,
        0x4F => KeyCode::ANSI_O,
        0x50 => KeyCode::ANSI_P,
        0x51 => KeyCode::ANSI_Q,
        0x52 => KeyCode::ANSI_R,
        0x53 => KeyCode::ANSI_S,
        0x54 => KeyCode::ANSI_T,
        0x55 => KeyCode::ANSI_U,
        0x56 => KeyCode::ANSI_V,
        0x57 => KeyCode::ANSI_W,
        0x58 => KeyCode::ANSI_X,
        0x59 => KeyCode::ANSI_Y,
        0x5A => KeyCode::ANSI_Z,
        0x60 => KeyCode::ANSI_KEYPAD_0,
        0x61 => KeyCode::ANSI_KEYPAD_1,
        0x62 => KeyCode::ANSI_KEYPAD_2,
        0x63 => KeyCode::ANSI_KEYPAD_3,
        0x64 => KeyCode::ANSI_KEYPAD_4,
        0x65 => KeyCode::ANSI_KEYPAD_5,
        0x66 => KeyCode::ANSI_KEYPAD_6,
        0x67 => KeyCode::ANSI_KEYPAD_7,
        0x68 => KeyCode::ANSI_KEYPAD_8,
        0x69 => KeyCode::ANSI_KEYPAD_9,
        0x6A => KeyCode::ANSI_KEYPAD_MULTIPLY,
        0x6B => KeyCode::ANSI_KEYPAD_PLUS,
        0x6D => KeyCode::ANSI_KEYPAD_MINUS,
        0x6E => KeyCode::ANSI_KEYPAD_DECIMAL,
        0x6F => KeyCode::ANSI_KEYPAD_DIVIDE,
        0x70 => KeyCode::F1,
        0x71 => KeyCode::F2,
        0x72 => KeyCode::F3,
        0x73 => KeyCode::F4,
        0x74 => KeyCode::F5,
        0x75 => KeyCode::F6,
        0x76 => KeyCode::F7,
        0x77 => KeyCode::F8,
        0x78 => KeyCode::F9,
        0x79 => KeyCode::F10,
        0x7A => KeyCode::F11,
        0x7B => KeyCode::F12,
        0x7C => KeyCode::F13,
        0x7D => KeyCode::F14,
        0x7E => KeyCode::F15,
        0x7F => KeyCode::F16,
        0x80 => KeyCode::F17,
        0x81 => KeyCode::F18,
        0x82 => KeyCode::F19,
        0x83 => KeyCode::F20,
        0xBA => KeyCode::ANSI_SEMICOLON,
        0xBB => KeyCode::ANSI_EQUAL,
        0xBC => KeyCode::ANSI_COMMA,
        0xBD => KeyCode::ANSI_MINUS,
        0xBE => KeyCode::ANSI_PERIOD,
        0xBF => KeyCode::ANSI_SLASH,
        0xC0 => KeyCode::ANSI_GRAVE,
        0xDB => KeyCode::ANSI_LEFT_BRACKET,
        0xDC => KeyCode::ANSI_BACKSLASH,
        0xDD => KeyCode::ANSI_RIGHT_BRACKET,
        0xDE => KeyCode::ANSI_QUOTE,
        0xE2 => KeyCode::ISO_SECTION,
        _ => return None,
    })
}

#[cfg(target_os = "macos")]
fn post_macos_keycode(keycode: u16, keydown: bool) {
    if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(event) = CGEvent::new_keyboard_event(source, keycode, keydown) {
            event.post(CGEventTapLocation::HID);
        }
    }
}

#[cfg(target_os = "macos")]
fn post_key_event(vk: u16, keydown: bool) {
    let Some(keycode) = mac_keycode_from_windows_vk(vk) else {
        return;
    };
    post_macos_keycode(keycode, keydown);
}

#[cfg(target_os = "macos")]
fn send_key_down(vk: u16, use_shift: bool) {
    if use_shift {
        post_macos_keycode(KeyCode::SHIFT, true);
    }
    post_key_event(vk, true);
}

#[cfg(target_os = "macos")]
fn send_key_up(vk: u16, use_shift: bool) {
    post_key_event(vk, false);
    if use_shift {
        post_macos_keycode(KeyCode::SHIFT, false);
    }
}

#[cfg(target_os = "macos")]
pub fn send_key_batch(vk: u16, n: usize, uppercase: bool) {
    let use_shift = should_hold_shift_for_case(vk, uppercase);
    for _ in 0..n {
        send_key_down(vk, use_shift);
        send_key_up(vk, use_shift);
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn send_key_batch(_vk: u16, _n: usize, _uppercase: bool) {}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn send_key_down(_vk: u16, _use_shift: bool) {}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn send_key_up(_vk: u16, _use_shift: bool) {}

pub fn send_key_presses(
    vk: u16,
    count: usize,
    uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        send_key_batch(vk, count, uppercase);
        return;
    }

    let use_shift = should_hold_shift_for_case(vk, uppercase);
    let is_active = || control.is_active();
    let mut sleep_for = |duration| sleep_interruptible(duration, control);

    for _ in 0..count {
        if !execute_click_cycle(
            plan,
            &mut || send_key_down(vk, use_shift),
            &mut || send_key_up(vk, use_shift),
            &mut sleep_for,
            &is_active,
        ) {
            return;
        }
    }
}
