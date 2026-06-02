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