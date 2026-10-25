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
    pub fn double(requested_hold_ms: u32, cycle_ms: u32, max_gap_ms: u32) -> Self {
        let hold_ms = requested_hold_ms.min(cycle_ms / 2).min(max_gap_ms);
        let gap_ms = cycle_ms
            .saturating_sub(hold_ms.saturating_mul(2))
            .min(max_gap_ms.saturating_sub(hold_ms));

        Self {
            kind: ClickCycleKind::Double,
            first_hold_ms: hold_ms,
            inter_click_gap_ms: gap_ms,
            second_hold_ms: hold_ms,
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

    use super::{execute_click_cycle, ClickCycleKind, ClickCyclePlan};

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
    fn double_cycle_at_five_cps_runs_hold_gap_hold() {
        let events = RefCell::new(Vec::new());
        let sleeps = RefCell::new(Vec::new());
        let mut press = || events.borrow_mut().push("down");
        let mut release = || events.borrow_mut().push("up");
        let mut sleep_for =
            |duration: Duration| sleeps.borrow_mut().push(duration.as_millis() as u32);
        let is_active = || true;

        let plan = ClickCyclePlan::double(90, 200, 450);
        assert_eq!(plan.first_hold_ms, 90);
        assert_eq!(plan.inter_click_gap_ms, 20);
        assert_eq!(plan.second_hold_ms, 90);

        let sent = execute_click_cycle(plan, &mut press, &mut release, &mut sleep_for, &is_active);

        assert!(sent);
        assert_eq!(&*events.borrow(), &["down", "up", "down", "up"]);
        assert_eq!(&*sleeps.borrow(), &[90, 20, 90]);
    }

    #[test]
    fn double_cycle_at_one_hundred_cps_keeps_both_holds() {
        let plan = ClickCyclePlan::double(4, 10, 450);

        assert_eq!(plan.first_hold_ms, 4);
        assert_eq!(plan.inter_click_gap_ms, 2);
        assert_eq!(plan.second_hold_ms, 4);
    }

    #[test]
    fn double_cycle_at_one_thousand_cps_has_no_hold() {
        let plan = ClickCyclePlan::double(0, 1, 450);

        assert_eq!(plan.first_hold_ms, 0);
        assert_eq!(plan.inter_click_gap_ms, 1);
        assert_eq!(plan.second_hold_ms, 0);
    }

    #[test]
    fn double_cycle_caps_the_hold_at_half_the_cycle() {
        let plan = ClickCyclePlan::double(900, 300, 450);

        assert_eq!(plan.first_hold_ms, 150);
        assert_eq!(plan.inter_click_gap_ms, 0);
        assert_eq!(plan.second_hold_ms, 150);
    }

    #[test]
    fn double_cycle_caps_the_press_pair_at_the_double_click_window() {
        let plan = ClickCyclePlan::double(100, 1_000, 450);

        assert_eq!(plan.first_hold_ms, 100);
        assert_eq!(plan.inter_click_gap_ms, 350);
        assert_eq!(plan.second_hold_ms, 100);
        assert_eq!(plan.first_hold_ms + plan.inter_click_gap_ms, 450);
    }

    #[test]
    fn double_cycle_at_one_cps_forty_five_percent_fits_the_double_click_window() {
        let plan = ClickCyclePlan::double(225, 1_000, 450);

        assert_eq!(plan.first_hold_ms, 225);
        assert_eq!(plan.inter_click_gap_ms, 225);
        assert_eq!(plan.second_hold_ms, 225);
        assert_eq!(plan.first_hold_ms + plan.second_hold_ms, 450);
        assert!(plan.first_hold_ms + plan.inter_click_gap_ms <= 450);
    }

    #[test]
    fn double_cycle_at_one_cps_ninety_percent_fits_the_double_click_window() {
        let plan = ClickCyclePlan::double(450, 1_000, 450);

        assert_eq!(plan.first_hold_ms, 450);
        assert_eq!(plan.inter_click_gap_ms, 0);
        assert_eq!(plan.second_hold_ms, 450);
        assert_eq!(plan.first_hold_ms + plan.second_hold_ms, 900);
        assert_eq!(plan.first_hold_ms + plan.inter_click_gap_ms, 450);
        assert!(plan.first_hold_ms + plan.inter_click_gap_ms <= 450);
        assert!(plan.first_hold_ms * 2 + plan.inter_click_gap_ms <= 1_000);
    }

    #[test]
    fn double_cycles_across_speeds_keep_the_press_pair_inside_window_and_cycle() {
        for cps in [1u32, 2, 5, 10, 100] {
            let cycle_ms = 1_000 / cps;
            for duty_percent in [45u32, 90] {
                let requested_hold_ms = cycle_ms * duty_percent / 200;
                let plan = ClickCyclePlan::double(requested_hold_ms, cycle_ms, 450);
                let press_gap = plan.first_hold_ms + plan.inter_click_gap_ms;
                let total = plan.first_hold_ms * 2 + plan.inter_click_gap_ms;
                let down = plan.first_hold_ms + plan.second_hold_ms;

                assert_eq!(plan.kind, ClickCycleKind::Double);
                assert_eq!(plan.first_hold_ms, plan.second_hold_ms);
                assert!(plan.first_hold_ms > 0, "cps={cps} duty={duty_percent}");
                assert!(
                    press_gap <= 450,
                    "cps={cps} duty={duty_percent} hold={} gap={}",
                    plan.first_hold_ms,
                    plan.inter_click_gap_ms
                );
                assert!(
                    total <= cycle_ms,
                    "cps={cps} duty={duty_percent} hold={} gap={} cycle_ms={cycle_ms}",
                    plan.first_hold_ms,
                    plan.inter_click_gap_ms
                );
                assert!(
                    down * 100 <= cycle_ms * duty_percent,
                    "cps={cps} duty={duty_percent} down={down} cycle_ms={cycle_ms}"
                );
            }
        }
    }

    #[test]
    fn double_cycle_never_exceeds_the_cycle_length() {
        for cycle_ms in 1..=40u32 {
            for hold_ms in [0u32, 1, 3, 7, 20, 40, 100] {
                for max_gap_ms in [0u32, 450, 5_000] {
                    let plan = ClickCyclePlan::double(hold_ms, cycle_ms, max_gap_ms);
                    let total = plan.first_hold_ms + plan.inter_click_gap_ms + plan.second_hold_ms;

                    assert_eq!(plan.first_hold_ms, plan.second_hold_ms);
                    assert!(
                        total <= cycle_ms,
                        "cycle_ms={cycle_ms} hold_ms={hold_ms} max_gap_ms={max_gap_ms} total={total}"
                    );
                    if plan.first_hold_ms <= max_gap_ms {
                        let press_gap = plan.first_hold_ms + plan.inter_click_gap_ms;
                        assert!(
                            press_gap <= max_gap_ms,
                            "cycle_ms={cycle_ms} hold_ms={hold_ms} max_gap_ms={max_gap_ms} press_gap={press_gap}"
                        );
                    }
                }
            }
        }
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
            if sleep_count == 3 {
                active.set(false);
            }
        };
        let is_active = || active.get();

        let sent = execute_click_cycle(
            ClickCyclePlan::double(90, 200, 450),
            &mut press,
            &mut release,
            &mut sleep_for,
            &is_active,
        );

        assert!(!sent);
        assert_eq!(&*events.borrow(), &["down", "up", "down", "up"]);
    }
}
