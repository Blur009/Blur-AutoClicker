use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClickCycleKind {
    Single,
    Double,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClickCyclePlan {
    pub kind: ClickCycleKind,
    pub first_hold_ms: u32,
    pub inter_click_gap_ms: u32,
    pub second_hold_ms: u32,
}

impl ClickCyclePlan {
    #[inline]
    pub fn single(hold_ms: u32) -> Self {
        Self {
            kind: ClickCycleKind::Single,
            first_hold_ms: hold_ms,
            inter_click_gap_ms: 0,
            second_hold_ms: 0,
        }
    }

    #[inline]
    pub fn double(requested_hold_ms: u32, cycle_ms: u32, inter_click_gap_ms: u32) -> Self {
        let clamped_gap_ms = inter_click_gap_ms.min(cycle_ms.saturating_sub(1));
        let second_hold_ms = requested_hold_ms.min(cycle_ms.saturating_sub(clamped_gap_ms));

        Self {
            kind: ClickCycleKind::Double,
            first_hold_ms: 0,
            inter_click_gap_ms: clamped_gap_ms,
            second_hold_ms,
        }
    }
}

fn dispatch_press_release<FPress, FRelease, FSleep, FActive>(
    hold_ms: u32,
    press: &mut FPress,
    release: &mut FRelease,
    sleep_for: &mut FSleep,
    is_active: &FActive,
) -> bool
where
    FPress: FnMut(),
    FRelease: FnMut(),
    FSleep: FnMut(Duration),
    FActive: Fn() -> bool,
{
    if !is_active() {
        return false;
    }

    press();
    if hold_ms > 0 {
        sleep_for(Duration::from_millis(hold_ms as u64));
        if !is_active() {
            release();
            return false;
        }
    }

    release();
    true
}

pub fn execute_click_cycle<FPress, FRelease, FSleep, FActive>(
    plan: ClickCyclePlan,
    press: &mut FPress,
    release: &mut FRelease,
    sleep_for: &mut FSleep,
    is_active: &FActive,
) -> bool
where
    FPress: FnMut(),
    FRelease: FnMut(),
    FSleep: FnMut(Duration),
    FActive: Fn() -> bool,
{
    if !dispatch_press_release(plan.first_hold_ms, press, release, sleep_for, is_active) {
        return false;
    }

    if plan.kind == ClickCycleKind::Double {
        if plan.inter_click_gap_ms > 0 {
            sleep_for(Duration::from_millis(plan.inter_click_gap_ms as u64));
            if !is_active() {
                return false;
            }
        }

        return dispatch_press_release(plan.second_hold_ms, press, release, sleep_for, is_active);
    }

    true
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::time::Duration;

    use super::{execute_click_cycle, ClickCyclePlan};

    #[test]
    fn single_cycle_uses_requested_hold() {
        let sleeps = RefCell::new(Vec::new());
        let mut press = || {};
        let mut release = || {};
        let mut sleep_for =
            |duration: Duration| sleeps.borrow_mut().push(duration.as_millis() as u32);
        let is_active = || true;

        let sent = execute_click_cycle(
            ClickCyclePlan::single(55),
            &mut press,
            &mut release,
            &mut sleep_for,
            &is_active,
        );

        assert!(sent);
        assert_eq!(&*sleeps.borrow(), &[55]);
    }

    #[test]
    fn double_cycle_sends_gap_then_long_hold() {
        let events = RefCell::new(Vec::new());
        let sleeps = RefCell::new(Vec::new());
        let mut press = || events.borrow_mut().push("down");
        let mut release = || events.borrow_mut().push("up");
        let mut sleep_for =
            |duration: Duration| sleeps.borrow_mut().push(duration.as_millis() as u32);
        let is_active = || true;

        let sent = execute_click_cycle(
            ClickCyclePlan::double(850, 1_000, 450),
            &mut press,
            &mut release,
            &mut sleep_for,
            &is_active,
        );

        assert!(sent);
        assert_eq!(&*events.borrow(), &["down", "up", "down", "up"]);
        assert_eq!(&*sleeps.borrow(), &[450, 550]);
    }

    #[test]
    fn double_cycle_clamps_gap_and_hold_to_cycle_length() {
        let plan = ClickCyclePlan::double(900, 300, 450);

        assert_eq!(plan.inter_click_gap_ms, 299);
        assert_eq!(plan.second_hold_ms, 1);
    }

    #[test]
    fn stopped_second_hold_releases_button() {
        let events = RefCell::new(Vec::new());
        let active = Cell::new(true);
        let mut press = || events.borrow_mut().push("down");
        let mut release = || events.borrow_mut().push("up");
        let mut sleep_count = 0usize;
        let mut sleep_for = |_| {
            sleep_count += 1;
            if sleep_count == 2 {
                active.set(false);
            }
        };
        let is_active = || active.get();

        let sent = execute_click_cycle(
            ClickCyclePlan::double(850, 1_000, 450),
            &mut press,
            &mut release,
            &mut sleep_for,
            &is_active,
        );

        assert!(!sent);
        assert_eq!(&*events.borrow(), &["down", "up", "down", "up"]);
    }
}
