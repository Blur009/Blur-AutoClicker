use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

const UNSET: u64 = u64::MAX;

static START: OnceLock<Instant> = OnceLock::new();
static PRE_MAIN_MS: AtomicU64 = AtomicU64::new(UNSET);
static STATE_MS: AtomicU64 = AtomicU64::new(UNSET);
static WEBVIEW_MS: AtomicU64 = AtomicU64::new(UNSET);
static SETUP_MS: AtomicU64 = AtomicU64::new(UNSET);
static REPORTED: AtomicBool = AtomicBool::new(false);

pub fn mark_start() {
    if let Some(age_ms) = process_age_ms() {
        PRE_MAIN_MS.store(age_ms, Ordering::SeqCst);
    }
    START.get_or_init(Instant::now);
}

fn app_elapsed_ms() -> u64 {
    START
        .get()
        .map_or(0, |start| start.elapsed().as_millis() as u64)
}

pub fn mark_state_ready() {
    STATE_MS.store(app_elapsed_ms(), Ordering::SeqCst);
}

pub fn mark_webview_ready() {
    WEBVIEW_MS.store(app_elapsed_ms(), Ordering::SeqCst);
}

pub fn mark_setup_done() {
    SETUP_MS.store(app_elapsed_ms(), Ordering::SeqCst);
}

fn milestone_summary(
    pre_main_ms: u64,
    state_ms: u64,
    webview_ms: u64,
    setup_ms: u64,
    frontend_boot_ms: u64,
) -> String {
    let mut parts = Vec::new();
    if pre_main_ms != UNSET {
        parts.push(format!("pre-main {pre_main_ms} ms"));
    }
    if state_ms != UNSET {
        parts.push(format!("state {state_ms} ms"));
    }
    if webview_ms != UNSET {
        parts.push(format!("webview {webview_ms} ms"));
    }
    if setup_ms != UNSET {
        parts.push(format!("setup {setup_ms} ms"));
    }
    parts.push(format!("frontend boot {frontend_boot_ms} ms"));
    parts.join(", ")
}

pub fn report_ui_ready(visible: bool, frontend_boot_ms: u64, boot_phases: &str) {
    let pre_main_ms = PRE_MAIN_MS.load(Ordering::SeqCst);
    let pre_main_offset = if pre_main_ms == UNSET { 0 } else { pre_main_ms };
    let total_ms = pre_main_offset.saturating_add(app_elapsed_ms());
    if REPORTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let label = if visible {
        "window visible"
    } else {
        "tray start ready"
    };
    let phases = if boot_phases.is_empty() {
        String::new()
    } else {
        format!("; {boot_phases}")
    };
    log::info!(
        "[Startup] {label} after {total_ms} ms from process start ({}{phases})",
        milestone_summary(
            PRE_MAIN_MS.load(Ordering::SeqCst),
            STATE_MS.load(Ordering::SeqCst),
            WEBVIEW_MS.load(Ordering::SeqCst),
            SETUP_MS.load(Ordering::SeqCst),
            frontend_boot_ms
        )
    );
}

#[cfg(windows)]
fn process_age_ms() -> Option<u64> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};

    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut kernel = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut user = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };

    let ok = unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    };
    if ok == 0 {
        return None;
    }

    let created_ticks = ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?;
    let now_ticks = (now.as_secs() + 11_644_473_600) * 10_000_000 + now.subsec_nanos() as u64 / 100;
    Some(now_ticks.saturating_sub(created_ticks) / 10_000)
}

#[cfg(not(windows))]
fn process_age_ms() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_lists_recorded_milestones_in_order() {
        assert_eq!(
            milestone_summary(14, 61, 290, 322, 663),
            String::from(
                "pre-main 14 ms, state 61 ms, webview 290 ms, setup 322 ms, frontend boot 663 ms"
            )
        );
        assert_eq!(
            milestone_summary(UNSET, UNSET, 290, UNSET, 663),
            String::from("webview 290 ms, frontend boot 663 ms")
        );
        assert_eq!(
            milestone_summary(UNSET, UNSET, UNSET, UNSET, 663),
            String::from("frontend boot 663 ms")
        );
    }
}
