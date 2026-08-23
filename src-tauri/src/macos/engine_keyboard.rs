use super::cycle::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};
use super::worker::{sleep_interruptible, RunControl};
use crate::macos::input::{caps_lock_enabled, post_keyboard_event};

pub fn is_alphabetic_vk(vk: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&vk)
}

fn should_shift_for_case(vk: u16, uppercase: bool) -> bool {
    is_alphabetic_vk(vk) && (caps_lock_enabled() != uppercase)
}

pub(crate) fn send_key_down(vk: u16, uppercase: bool) {
    post_keyboard_event(vk, true, should_shift_for_case(vk, uppercase));
}

pub(crate) fn send_key_up(vk: u16, uppercase: bool) {
    post_keyboard_event(vk, false, should_shift_for_case(vk, uppercase));
}

fn send_key_down_inner(vk: u16, use_shift: bool) {
    post_keyboard_event(vk, true, use_shift);
}

fn send_key_up_inner(vk: u16, use_shift: bool) {
    post_keyboard_event(vk, false, use_shift);
}

pub fn send_key_batch(vk: u16, n: usize, uppercase: bool) {
    let use_shift = should_shift_for_case(vk, uppercase);
    for _ in 0..n {
        send_key_down_inner(vk, use_shift);
        send_key_up_inner(vk, use_shift);
    }
}

pub fn send_key_presses(
    vk: u16,
    count: usize,
    uppercase: bool,
    plan: ClickCyclePlan,
    control: &RunControl,
    should_abort: &dyn Fn() -> bool,
) {
    if count == 0 || should_abort() {
        return;
    }
    if plan.kind == ClickCycleKind::Single && count > 1 && plan.first_hold_ms == 0 {
        send_key_batch(vk, count, uppercase);
        return;
    }

    let use_shift = should_shift_for_case(vk, uppercase);
    let is_active = || control.is_active() && !should_abort();
    let mut sleep_for = |duration| sleep_interruptible(duration, control, should_abort);
    for _ in 0..count {
        if should_abort()
            || !execute_click_cycle(
                plan,
                &mut || send_key_down_inner(vk, use_shift),
                &mut || send_key_up_inner(vk, use_shift),
                &mut sleep_for,
                &is_active,
            )
        {
            return;
        }
    }
}
