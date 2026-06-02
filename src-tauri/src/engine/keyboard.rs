use enigo::{Direction, Enigo, Keyboard, Settings};

use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};

#[inline]
pub fn send_key_presses(
    vk: u16,
    count: usize,
    _uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    let key_char = vk_to_char(vk);

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        let mut enigo = Enigo::new(&Settings::default()).unwrap();
        for _ in 0..count {
            if let Some(ch) = key_char {
                let _ = enigo.text(&ch.to_string());
            }
        }
        return;
    }

    let is_active = || control.is_active();
    let mut sleep_for = |duration| sleep_interruptible(duration, control);

    for _ in 0..count {
        if !execute_click_cycle(
            plan,
            &mut || send_key_down(vk),
            &mut || send_key_up(vk),
            &mut sleep_for,
            &is_active,
        ) {
            return;
        }
    }
}

fn send_key_down(vk: u16) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let key = vk_to_enigo_key(vk);
    let _ = enigo.key(key, Direction::Press);
}

fn send_key_up(vk: u16) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let key = vk_to_enigo_key(vk);
    let _ = enigo.key(key, Direction::Release);
}

pub fn is_alphabetic_vk(vk: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&vk)
}

/// Convert a Windows VK code to a enigo Key.
/// Uses the ASCII value directly for letters/digits.
fn vk_to_enigo_key(vk: u16) -> enigo::Key {
    // For simple ASCII letters and digits, use the character directly
    if let Some(ch) = vk_to_char(vk) {
        return enigo::Key::Unicode(ch);
    }
    // Map well-known VK codes to enigo named keys
    match vk as i32 {
        // Function keys
        0x70 => enigo::Key::F1,
        0x71 => enigo::Key::F2,
        0x72 => enigo::Key::F3,
        0x73 => enigo::Key::F4,
        0x74 => enigo::Key::F5,
        0x75 => enigo::Key::F6,
        0x76 => enigo::Key::F7,
        0x77 => enigo::Key::F8,
        0x78 => enigo::Key::F9,
        0x79 => enigo::Key::F10,
        0x7A => enigo::Key::F11,
        0x7B => enigo::Key::F12,
        _ => enigo::Key::Unicode(' '),
    }
}

fn vk_to_char(vk: u16) -> Option<char> {
    let c = vk as u8;
    if c.is_ascii_alphanumeric() || c == b' ' || c.is_ascii_punctuation() {
        Some(c as char)
    } else {
        None
    }
}

/// Helper: map some common named keys to VK codes for the hotkey system.
/// This mirrors the Windows Virtual-Key codes for cross-platform compatibility.
pub const VK_SPACE: u16 = 0x20;
pub const VK_RETURN: u16 = 0x0D;
pub const VK_TAB: u16 = 0x09;
pub const VK_BACK: u16 = 0x08;
pub const VK_DELETE: u16 = 0x2E;
pub const VK_ESCAPE: u16 = 0x1B;
pub const VK_UP: u16 = 0x26;
pub const VK_DOWN: u16 = 0x28;
pub const VK_LEFT: u16 = 0x25;
pub const VK_RIGHT: u16 = 0x27;
pub const VK_SHIFT: u16 = 0x10;
pub const VK_CONTROL: u16 = 0x11;
pub const VK_MENU: u16 = 0x12; // Alt
pub const VK_CAPITAL: u16 = 0x14;
pub const VK_LWIN: u16 = 0x5B;
pub const VK_RWIN: u16 = 0x5C;
pub const VK_F1: u16 = 0x70;