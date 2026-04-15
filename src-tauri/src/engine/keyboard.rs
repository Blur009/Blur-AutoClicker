use std::time::Duration;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE,
    MapVirtualKeyW, MAPVK_VK_TO_VSC,
};

use super::worker::{sleep_interruptible, RunControl};

#[inline]
fn vk_to_scan(vk: u16) -> u16 {
    unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) as u16 }
}

#[inline]
pub fn make_keyboard_input(vk: u16, flags: u32) -> INPUT {
    let scan = vk_to_scan(vk);
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: scan,
                dwFlags: flags | KEYEVENTF_SCANCODE,
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

pub fn send_key_batch(vk: u16, n: usize) {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(n * 2);
    for _ in 0..n {
        inputs.push(make_keyboard_input(vk, 0));
        inputs.push(make_keyboard_input(vk, KEYEVENTF_KEYUP));
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
    use_double_press_gap: bool,
    double_press_delay_ms: u32,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    if !use_double_press_gap && count > 1 && hold_ms == 0 {
        send_key_batch(vk, count);
        return;
    }

    for index in 0..count {
        if !control.is_active() {
            return;
        }

        send_key_event(vk, 0);
        if hold_ms > 0 {
            sleep_interruptible(Duration::from_millis(hold_ms as u64), control);
            if !control.is_active() {
                return;
            }
        }
        send_key_event(vk, KEYEVENTF_KEYUP);

        if index + 1 < count && use_double_press_gap && double_press_delay_ms > 0 {
            sleep_interruptible(Duration::from_millis(double_press_delay_ms as u64), control);
        }
    }
}
