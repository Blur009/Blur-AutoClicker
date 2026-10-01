use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};
use super::AUTOCLICKER_EXTRA_INFO;
use std::cell::Cell;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX, VK_APPS,
    VK_CAPITAL, VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_HOME, VK_INSERT, VK_LEFT, VK_LWIN,
    VK_NEXT, VK_NUMLOCK, VK_PAUSE, VK_PRIOR, VK_RCONTROL, VK_RIGHT, VK_RMENU, VK_RWIN, VK_SHIFT,
    VK_SNAPSHOT, VK_UP,
};

#[inline]
fn vk_to_scan(vk: u16) -> (u16, bool) {
    if vk == VK_SNAPSHOT {
        return (0x37, true);
    }
    let raw = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC_EX) };
    let extended = raw >> 8 == 0xE0
        || matches!(
            vk,
            VK_APPS
                | VK_DELETE
                | VK_DIVIDE
                | VK_DOWN
                | VK_END
                | VK_HOME
                | VK_INSERT
                | VK_LEFT
                | VK_LWIN
                | VK_NEXT
                | VK_NUMLOCK
                | VK_PRIOR
                | VK_RCONTROL
                | VK_RIGHT
                | VK_RMENU
                | VK_RWIN
                | VK_UP
        );
    ((raw & 0xFF) as u16, extended)
}

#[inline]
pub fn make_keyboard_input(vk: u16, flags: u32) -> INPUT {
    let (scan, extended) = vk_to_scan(vk);
    let ext_flag = if extended { KEYEVENTF_EXTENDEDKEY } else { 0 };
    // Pause uses an E1 sequence, which KEYEVENTF_EXTENDEDKEY cannot represent.
    let use_scan_code = scan != 0 && vk != VK_PAUSE;
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: if use_scan_code { 0 } else { vk },
                wScan: if use_scan_code { scan } else { 0 },
                dwFlags: flags | if use_scan_code { KEYEVENTF_SCANCODE } else { 0 } | ext_flag,
                time: 0,
                dwExtraInfo: AUTOCLICKER_EXTRA_INFO,
            },
        },
    }
}

#[inline]
pub fn send_key_event(vk: u16, flags: u32) -> bool {
    let input = make_keyboard_input(vk, flags);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) == 1 }
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

fn key_press_inputs(vk: u16, use_shift: bool) -> ([INPUT; 4], usize) {
    let down = make_keyboard_input(vk, 0);
    let up = make_keyboard_input(vk, KEYEVENTF_KEYUP);
    if use_shift {
        (
            [
                make_keyboard_input(VK_SHIFT, 0),
                down,
                up,
                make_keyboard_input(VK_SHIFT, KEYEVENTF_KEYUP),
            ],
            4,
        )
    } else {
        ([down, up, up, up], 2)
    }
}

fn release_key_event(vk: u16) -> bool {
    for _ in 0..3 {
        if send_key_event(vk, KEYEVENTF_KEYUP) {
            return true;
        }
    }
    false
}

fn release_key_state(vk: u16, use_shift: bool) -> bool {
    let key_released = release_key_event(vk);
    let shift_released = !use_shift || release_key_event(VK_SHIFT);
    key_released && shift_released
}

pub(crate) fn send_key_down(vk: u16, uppercase: bool) -> Option<bool> {
    let use_shift = should_hold_shift_for_case(vk, uppercase);
    if use_shift && !send_key_event(VK_SHIFT, 0) {
        return None;
    }
    if !send_key_event(vk, 0) {
        if use_shift {
            let _ = release_key_event(VK_SHIFT);
        }
        return None;
    }
    Some(use_shift)
}

pub(crate) fn send_key_repeat(vk: u16) -> bool {
    send_key_event(vk, 0)
}

pub(crate) fn send_key_up(vk: u16, use_shift: bool) -> bool {
    release_key_state(vk, use_shift)
}

fn send_key_down_inner(vk: u16, use_shift: bool) -> bool {
    if use_shift && !send_key_event(VK_SHIFT, 0) {
        return false;
    }
    if !send_key_event(vk, 0) {
        if use_shift {
            let _ = release_key_event(VK_SHIFT);
        }
        return false;
    }
    true
}

fn send_key_up_inner(vk: u16, use_shift: bool) -> bool {
    release_key_state(vk, use_shift)
}

fn completed_batch_presses(
    inserted: usize,
    inputs_per_press: usize,
    use_shift: bool,
    cleanup_key_up_succeeded: bool,
    cleanup_shift_up_succeeded: bool,
) -> usize {
    let completed = inserted / inputs_per_press;
    let remainder = inserted % inputs_per_press;
    if remainder == 0 {
        return completed;
    }
    if use_shift && !cleanup_shift_up_succeeded {
        return completed;
    }

    let partial_completed = if use_shift {
        remainder >= 3 || (remainder >= 2 && cleanup_key_up_succeeded)
    } else {
        cleanup_key_up_succeeded
    };
    completed + usize::from(partial_completed)
}

pub fn send_key_batch(vk: u16, n: usize, uppercase: bool) -> usize {
    const MAX_BATCH_PRESSES: usize = 8;
    const MAX_BATCH_INPUTS: usize = MAX_BATCH_PRESSES * 4;

    let use_shift = should_hold_shift_for_case(vk, uppercase);
    let (press_inputs, inputs_per_press) = key_press_inputs(vk, use_shift);
    let mut inputs = [press_inputs[0]; MAX_BATCH_INPUTS];
    for press in inputs.chunks_exact_mut(inputs_per_press) {
        press.copy_from_slice(&press_inputs[..inputs_per_press]);
    }
    let mut sent = 0usize;

    while sent < n {
        let chunk = (n - sent).min(MAX_BATCH_PRESSES);
        let requested = chunk * inputs_per_press;
        let inserted = unsafe {
            SendInput(
                requested as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            ) as usize
        };
        let remainder = inserted % inputs_per_press;
        let key_was_pressed = remainder != 0 && (!use_shift || remainder >= 2);
        let key_was_released = use_shift && remainder >= 3;
        let cleanup_key_up_succeeded = if key_was_pressed && !key_was_released {
            release_key_event(vk)
        } else {
            true
        };
        let cleanup_shift_up_succeeded =
            !use_shift || remainder == 0 || release_key_event(VK_SHIFT);

        let completed = completed_batch_presses(
            inserted,
            inputs_per_press,
            use_shift,
            cleanup_key_up_succeeded,
            cleanup_shift_up_succeeded,
        );
        sent += completed;

        if inserted != requested {
            break;
        }
    }

    sent
}

pub fn send_key_presses(
    vk: u16,
    count: usize,
    uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) -> usize {
    if count == 0 || !control.is_active() || should_abort() {
        return 0;
    }

    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        return send_key_batch(vk, count, uppercase);
    }

    let use_shift = should_hold_shift_for_case(vk, uppercase);
    let mut sent = 0usize;

    for _ in 0..count {
        if should_abort() {
            break;
        }

        let down_succeeded = Cell::new(false);
        let failed = Cell::new(false);
        let completed_presses = Cell::new(0usize);
        let is_active = || control.is_active() && !should_abort() && !failed.get();
        let mut sleep_for = |duration| sleep_interruptible(duration, control, should_abort);
        let mut press = || {
            let succeeded = send_key_down_inner(vk, use_shift);
            down_succeeded.set(succeeded);
            if !succeeded {
                failed.set(true);
            }
        };
        let mut release = || {
            if !down_succeeded.get() {
                return;
            }
            let succeeded = send_key_up_inner(vk, use_shift);
            if down_succeeded.get() && succeeded {
                completed_presses.set(completed_presses.get() + 1);
                down_succeeded.set(false);
            }
            if !succeeded {
                failed.set(true);
            }
        };

        let completed =
            execute_click_cycle(plan, &mut press, &mut release, &mut sleep_for, &is_active);
        if down_succeeded.get() && release_key_state(vk, use_shift) {
            completed_presses.set(completed_presses.get() + 1);
            down_succeeded.set(false);
        }
        sent += completed_presses.get();
        if !completed || failed.get() || down_succeeded.get() {
            break;
        }
    }

    sent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_key_template_contains_balanced_scan_code_events() {
        let (inputs, count) = key_press_inputs(b'A' as u16, false);
        assert_eq!(count, 2);
        let down = unsafe { inputs[0].Anonymous.ki };
        let up = unsafe { inputs[1].Anonymous.ki };
        assert_ne!(down.wScan, 0);
        assert_eq!(down.wScan, up.wScan);
        assert_eq!(down.dwFlags, KEYEVENTF_SCANCODE);
        assert_eq!(up.dwFlags, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP);
        assert_eq!(down.dwExtraInfo, AUTOCLICKER_EXTRA_INFO);
        assert_eq!(up.dwExtraInfo, AUTOCLICKER_EXTRA_INFO);
    }

    #[test]
    fn shifted_key_template_releases_key_before_shift() {
        let (inputs, count) = key_press_inputs(b'A' as u16, true);
        assert_eq!(count, 4);
        let keys = inputs.map(|input| unsafe { input.Anonymous.ki });
        assert_ne!(keys[0].wScan, keys[1].wScan);
        assert_eq!(keys[0].wScan, keys[3].wScan);
        assert_eq!(keys[1].wScan, keys[2].wScan);
        assert_eq!(keys[0].dwFlags, KEYEVENTF_SCANCODE);
        assert_eq!(keys[1].dwFlags, KEYEVENTF_SCANCODE);
        assert_eq!(keys[2].dwFlags, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP);
        assert_eq!(keys[3].dwFlags, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP);
    }

    #[test]
    fn extended_key_template_preserves_extended_flag_on_release() {
        let (inputs, count) = key_press_inputs(
            windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LEFT,
            false,
        );
        assert_eq!(count, 2);
        for input in &inputs[..count] {
            let key = unsafe { input.Anonymous.ki };
            assert_ne!(key.dwFlags & KEYEVENTF_EXTENDEDKEY, 0);
        }
    }

    #[test]
    fn pause_is_sent_as_a_virtual_key_instead_of_extended_control() {
        let (inputs, count) = key_press_inputs(VK_PAUSE, false);
        assert_eq!(count, 2);
        let down = unsafe { inputs[0].Anonymous.ki };
        let up = unsafe { inputs[1].Anonymous.ki };
        assert_eq!(down.wVk, VK_PAUSE);
        assert_eq!(up.wVk, VK_PAUSE);
        assert_eq!(down.wScan, 0);
        assert_eq!(up.wScan, 0);
        assert_eq!(down.dwFlags, 0);
        assert_eq!(up.dwFlags, KEYEVENTF_KEYUP);
    }

    #[test]
    fn print_screen_uses_its_extended_scan_code() {
        let (inputs, _) = key_press_inputs(VK_SNAPSHOT, false);
        let down = unsafe { inputs[0].Anonymous.ki };
        let up = unsafe { inputs[1].Anonymous.ki };
        assert_eq!(down.wScan, 0x37);
        assert_eq!(up.wScan, 0x37);
        assert_eq!(down.dwFlags, KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY);
        assert_eq!(up.dwFlags, down.dwFlags | KEYEVENTF_KEYUP);
    }

    #[test]
    fn partial_plain_key_batch_counts_cleanup_completed_press() {
        assert_eq!(completed_batch_presses(1, 2, false, true, true), 1);
        assert_eq!(completed_batch_presses(1, 2, false, false, true), 0);
        assert_eq!(completed_batch_presses(4, 2, false, false, true), 2);
    }

    #[test]
    fn partial_shifted_batch_only_counts_an_actual_key_press() {
        assert_eq!(completed_batch_presses(1, 4, true, true, true), 0);
        assert_eq!(completed_batch_presses(2, 4, true, true, true), 1);
        assert_eq!(completed_batch_presses(2, 4, true, false, true), 0);
        assert_eq!(completed_batch_presses(3, 4, true, false, true), 1);
        assert_eq!(completed_batch_presses(4, 4, true, false, true), 1);
    }

    #[test]
    fn failed_shift_cleanup_forces_partial_batch_failure() {
        assert_eq!(completed_batch_presses(2, 4, true, true, false), 0);
        assert_eq!(completed_batch_presses(3, 4, true, true, false), 0);
        assert_eq!(completed_batch_presses(6, 4, true, true, false), 1);
    }
}
