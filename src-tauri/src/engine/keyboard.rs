use std::time::Duration;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX, VK_CAPITAL,
    VK_SHIFT,
};

use super::worker::{sleep_interruptible, RunControl};

#[inline]
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
pub fn send_key_event(vk: u16, flags: u32) {
    let input = make_keyboard_input(vk, flags);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
}

pub fn is_alphabetic_vk(vk: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&vk)
}

fn caps_lock_enabled() -> bool {
    unsafe { (GetKeyState(VK_CAPITAL as i32) & 1) != 0 }
}

fn should_hold_shift_for_case(vk: u16, uppercase: bool) -> bool {
    is_alphabetic_vk(vk) && (caps_lock_enabled() != uppercase)
}

fn push_key_press(inputs: &mut Vec<INPUT>, vk: u16, use_shift: bool) {
    if use_shift {
        inputs.push(make_keyboard_input(VK_SHIFT as u16, 0));
    }

    inputs.push(make_keyboard_input(vk, 0));
    inputs.push(make_keyboard_input(vk, KEYEVENTF_KEYUP));

    if use_shift {
        inputs.push(make_keyboard_input(VK_SHIFT as u16, KEYEVENTF_KEYUP));
    }
}

fn send_key_down(vk: u16, use_shift: bool) {
    if use_shift {
        send_key_event(VK_SHIFT as u16, 0);
    }
    send_key_event(vk, 0);
}

fn send_key_up(vk: u16, use_shift: bool) {
    send_key_event(vk, KEYEVENTF_KEYUP);
    if use_shift {
        send_key_event(VK_SHIFT as u16, KEYEVENTF_KEYUP);
    }
}

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

pub fn send_key_presses(
    vk: u16,
    count: usize,
    hold_ms: u32,
    uppercase: bool,
    use_double_press_gap: bool,
    double_press_delay_ms: u32,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    if !use_double_press_gap && count > 1 && hold_ms == 0 {
        send_key_batch(vk, count, uppercase);
        return;
    }

    for index in 0..count {
        if !control.is_active() {
            return;
        }

        let use_shift = should_hold_shift_for_case(vk, uppercase);
        send_key_down(vk, use_shift);
        if hold_ms > 0 {
            sleep_interruptible(Duration::from_millis(hold_ms as u64), control);
        }
        send_key_up(vk, use_shift);

        if !control.is_active() {
            return;
        }

        if index + 1 < count && use_double_press_gap && double_press_delay_ms > 0 {
            sleep_interruptible(Duration::from_millis(double_press_delay_ms as u64), control);
        }
    }
}
