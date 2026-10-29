use std::sync::atomic::{AtomicBool, Ordering};

use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};
use super::SendResult;
use super::AUTOCLICKER_EXTRA_INFO;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX, VK_CAPITAL,
    VK_SHIFT,
};

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
fn make_keyboard_input_with_scan(scan: u16, extended: bool, flags: u32) -> INPUT {
    let ext_flag = if extended { KEYEVENTF_EXTENDEDKEY } else { 0 };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: 0,
                wScan: scan,
                dwFlags: flags | KEYEVENTF_SCANCODE | ext_flag,
                time: 0,
                dwExtraInfo: AUTOCLICKER_EXTRA_INFO,
            },
        },
    }
}

#[inline]
pub fn make_keyboard_input(vk: u16, flags: u32) -> INPUT {
    let (scan, extended) = vk_to_scan(vk);
    make_keyboard_input_with_scan(scan, extended, flags)
}

#[inline]
pub fn send_key_event(vk: u16, flags: u32) -> bool {
    let input = make_keyboard_input(vk, flags);
    let sent = unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
    if sent == 1 && flags & KEYEVENTF_KEYUP != 0 {
        crate::hotkeys::note_injected_key(vk as i32);
    }
    sent == 1
}

pub fn is_alphabetic_vk(vk: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&vk)
}

fn caps_lock_enabled() -> bool {
    unsafe { (GetKeyState(VK_CAPITAL as i32) & 1) != 0 }
}

fn should_hold_shift_for_case(vk: u16, uppercase: bool) -> bool {
    shift_needed_for_case(vk, uppercase, caps_lock_enabled())
}

fn shift_needed_for_case(vk: u16, uppercase: bool, caps_lock_on: bool) -> bool {
    is_alphabetic_vk(vk) && (caps_lock_on != uppercase)
}

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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct KeyDown {
    pub use_shift: bool,
    pub shift_down: bool,
    pub key_down: bool,
}

impl KeyDown {
    pub(crate) fn accepted(self) -> bool {
        self.key_down
    }

    pub(crate) fn held(self) -> bool {
        self.shift_down || self.key_down
    }

    pub(crate) fn latch(&mut self, press: KeyDown) {
        if press.shift_down {
            self.use_shift = press.use_shift;
        }
        self.shift_down |= press.shift_down;
        self.key_down |= press.key_down;
    }
}

pub(crate) fn send_key_down(vk: u16, uppercase: bool) -> KeyDown {
    let use_shift = should_hold_shift_for_case(vk, uppercase);
    if use_shift && !send_key_event(VK_SHIFT, 0) {
        return KeyDown {
            use_shift,
            shift_down: false,
            key_down: false,
        };
    }
    KeyDown {
        use_shift,
        shift_down: use_shift,
        key_down: send_key_event(vk, 0),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct KeyUpPlan {
    key: bool,
    shift: bool,
}

fn key_up_plan(down: KeyDown) -> KeyUpPlan {
    KeyUpPlan {
        key: down.key_down,
        shift: down.use_shift && down.shift_down,
    }
}

pub(crate) fn send_key_up(vk: u16, down: KeyDown) -> bool {
    let plan = key_up_plan(down);
    let key_ok = !plan.key || send_key_event(vk, KEYEVENTF_KEYUP);
    let shift_ok = !plan.shift || send_key_event(VK_SHIFT, KEYEVENTF_KEYUP);
    key_ok && shift_ok
}

pub(crate) fn after_release(down: KeyDown, released: bool) -> KeyDown {
    if released {
        KeyDown::default()
    } else {
        down
    }
}

static PARTIAL_KEYBOARD_INSERT_WARNED: AtomicBool = AtomicBool::new(false);

pub fn send_key_batch(vk: u16, n: usize, uppercase: bool) -> bool {
    let use_shift = should_hold_shift_for_case(vk, uppercase);
    let inputs_per_press = if use_shift { 4 } else { 2 };
    let mut inputs: Vec<INPUT> = Vec::with_capacity(n * inputs_per_press);
    for _ in 0..n {
        push_key_press(&mut inputs, vk, use_shift);
    }
    debug_assert_eq!(inputs.len(), n * inputs_per_press);
    let expected = inputs.len() as u32;
    let sent = unsafe {
        SendInput(
            expected,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    let accepted = sent == expected;
    if sent > 0 {
        crate::hotkeys::note_injected_key(vk as i32);
        if use_shift {
            crate::hotkeys::note_injected_key(VK_SHIFT as i32);
        }
    }
    if accepted {
        PARTIAL_KEYBOARD_INSERT_WARNED.store(false, Ordering::Relaxed);
    } else if !PARTIAL_KEYBOARD_INSERT_WARNED.swap(true, Ordering::Relaxed) {
        log::warn!("[engine] Windows accepted {sent} of {expected} keyboard input events");
    }
    accepted
}

pub fn send_key_presses(
    vk: u16,
    count: usize,
    uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) -> SendResult {
    let (result, residual) =
        send_key_presses_inner(vk, count, uppercase, plan, control, should_abort);
    if result.is_blocked() && residual.held() {
        let _ = send_key_up(vk, residual);
    }
    result
}

fn send_key_presses_inner(
    vk: u16,
    count: usize,
    uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) -> (SendResult, KeyDown) {
    if count == 0 {
        return (SendResult::Sent, KeyDown::default());
    }

    if should_abort() {
        return (SendResult::Sent, KeyDown::default());
    }

    if plan.kind == ClickCycleKind::Single && plan.first_hold_ms == 0 {
        if count > 1 {
            return (
                batch_result(send_key_batch(vk, count, uppercase)),
                KeyDown::default(),
            );
        }
        if !control.is_active() {
            return (SendResult::Sent, KeyDown::default());
        }
        return (
            batch_result(send_key_batch(vk, count, uppercase)),
            KeyDown::default(),
        );
    }

    let blocked = std::cell::Cell::new(false);
    let down = std::cell::Cell::new(KeyDown::default());
    let is_active = || control.is_active() && !should_abort();
    let mut sleep_for = |duration| sleep_interruptible(duration, control, should_abort);

    for _ in 0..count {
        if should_abort() {
            break;
        }
        let mut press = || {
            let press = send_key_down(vk, uppercase);
            let mut held = down.get();
            held.latch(press);
            down.set(held);
            if !press.accepted() {
                blocked.set(true);
            }
        };
        let mut release = || {
            let held = down.get();
            if !held.held() {
                return;
            }
            let released = send_key_up(vk, held);
            down.set(after_release(held, released));
            if !released {
                blocked.set(true);
            }
        };
        if !execute_click_cycle(plan, &mut press, &mut release, &mut sleep_for, &is_active) {
            break;
        }
    }

    let result = if blocked.get() {
        SendResult::Blocked
    } else {
        SendResult::Sent
    };
    (result, down.get())
}

#[inline]
fn batch_result(sent: bool) -> SendResult {
    if sent {
        SendResult::Sent
    } else {
        SendResult::Blocked
    }
}

#[cfg(test)]
mod tests {
    use super::{after_release, key_up_plan, shift_needed_for_case, KeyDown, KeyUpPlan};

    fn down(use_shift: bool, shift_down: bool, key_down: bool) -> KeyDown {
        KeyDown {
            use_shift,
            shift_down,
            key_down,
        }
    }

    #[test]
    fn a_partial_press_still_releases_the_shift_it_pressed() {
        let partial = down(true, true, false);

        assert!(!partial.accepted());
        assert!(partial.held());
        assert_eq!(
            key_up_plan(partial),
            KeyUpPlan {
                key: false,
                shift: true
            }
        );
    }

    #[test]
    fn a_rejected_shift_press_leaves_nothing_to_release() {
        let rejected = down(true, false, false);

        assert!(!rejected.held());
        assert_eq!(
            key_up_plan(rejected),
            KeyUpPlan {
                key: false,
                shift: false
            }
        );
    }

    #[test]
    fn a_failed_repeat_press_keeps_the_earlier_press_releasable() {
        let mut held = KeyDown::default();
        held.latch(down(true, true, true));
        held.latch(down(true, false, false));

        assert_eq!(
            key_up_plan(held),
            KeyUpPlan {
                key: true,
                shift: true
            }
        );
    }

    #[test]
    fn a_failed_release_keeps_the_key_latched_for_a_retry() {
        let held = down(true, true, true);

        assert_eq!(after_release(held, false), held);
        assert_eq!(after_release(held, true), KeyDown::default());
    }

    #[test]
    fn release_uses_the_shift_state_captured_at_press_time() {
        let vk = b'A' as u16;
        let mut held = KeyDown::default();
        held.latch(down(shift_needed_for_case(vk, true, false), true, true));

        assert!(!shift_needed_for_case(vk, true, true));
        assert_eq!(
            key_up_plan(held),
            KeyUpPlan {
                key: true,
                shift: true
            }
        );
    }
}
