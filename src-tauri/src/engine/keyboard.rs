use std::time::Duration;

use crate::hotkeys::VK_NUMPAD_ENTER_PSEUDO;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_HOME, VK_INSERT, VK_LEFT, VK_NEXT, VK_PRIOR,
    VK_RCONTROL, VK_RETURN, VK_RIGHT, VK_RMENU, VK_UP,
};

use super::worker::{sleep_interruptible, RunControl};

fn make_keyboard_input(vk: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn keyboard_input_parts(vk: i32) -> Option<(u16, u32)> {
    if vk == VK_NUMPAD_ENTER_PSEUDO {
        return Some((VK_RETURN as u16, KEYEVENTF_EXTENDEDKEY));
    }

    let vk_u16 = u16::try_from(vk).ok()?;
    let extended = if is_extended_key(vk) {
        KEYEVENTF_EXTENDEDKEY
    } else {
        0
    };

    Some((vk_u16, extended))
}

fn is_extended_key(vk: i32) -> bool {
    matches!(
        vk,
        value
            if value == VK_INSERT as i32
                || value == VK_DELETE as i32
                || value == VK_HOME as i32
                || value == VK_END as i32
                || value == VK_PRIOR as i32
                || value == VK_NEXT as i32
                || value == VK_LEFT as i32
                || value == VK_RIGHT as i32
                || value == VK_UP as i32
                || value == VK_DOWN as i32
                || value == VK_DIVIDE as i32
                || value == VK_RMENU as i32
                || value == VK_RCONTROL as i32
    )
}

fn push_key_event(inputs: &mut Vec<INPUT>, vk: i32, key_up: bool) {
    let Some((vk_u16, base_flags)) = keyboard_input_parts(vk) else {
        return;
    };

    let flags = if key_up {
        base_flags | KEYEVENTF_KEYUP
    } else {
        base_flags
    };

    inputs.push(make_keyboard_input(vk_u16, flags));
}

fn modifier_vks(ctrl: bool, alt: bool, shift: bool, super_key: bool) -> Vec<i32> {
    let mut modifiers = Vec::with_capacity(4);
    if ctrl {
        modifiers.push(windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL as i32);
    }
    if alt {
        modifiers.push(windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_MENU as i32);
    }
    if shift {
        modifiers.push(windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_SHIFT as i32);
    }
    if super_key {
        modifiers.push(windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LWIN as i32);
    }
    modifiers
}

fn send_inputs(inputs: &[INPUT]) {
    if inputs.is_empty() {
        return;
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
    ctrl: bool,
    alt: bool,
    shift: bool,
    super_key: bool,
    main_vk: i32,
    count: usize,
    hold_ms: u32,
    use_double_click_gap: bool,
    double_click_delay_ms: u32,
    control: &RunControl,
) {
    if count == 0 {
        return;
    }

    let modifiers = modifier_vks(ctrl, alt, shift, super_key);

    for index in 0..count {
        if !control.is_active() {
            return;
        }

        let mut key_down_inputs = Vec::with_capacity(modifiers.len() + 1);
        for modifier in &modifiers {
            push_key_event(&mut key_down_inputs, *modifier, false);
        }
        push_key_event(&mut key_down_inputs, main_vk, false);
        send_inputs(&key_down_inputs);

        if hold_ms > 0 {
            sleep_interruptible(Duration::from_millis(hold_ms as u64), control);
            if !control.is_active() {
                return;
            }
        }

        let mut key_up_inputs = Vec::with_capacity(modifiers.len() + 1);
        push_key_event(&mut key_up_inputs, main_vk, true);
        for modifier in modifiers.iter().rev() {
            push_key_event(&mut key_up_inputs, *modifier, true);
        }
        send_inputs(&key_up_inputs);

        if index + 1 < count && use_double_click_gap && double_click_delay_ms > 0 {
            sleep_interruptible(Duration::from_millis(double_click_delay_ms as u64), control);
        }
    }
}
