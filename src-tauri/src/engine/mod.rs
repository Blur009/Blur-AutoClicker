pub mod failsafe;
pub mod mouse;
pub mod rng;
pub mod stats;
pub mod worker;
use std::sync::atomic::AtomicI64;
pub use worker::start_clicker;

#[derive(Clone, Copy, Debug)]
pub struct ClickerConfig {
    pub interval: f64,
    pub variation: f64,
    pub limit: i32,
    pub duty: f64,
    pub time_limit: f64,
    pub button: i32,
    pub double_click_enabled: bool,
    pub double_click_delay_ms: u32,
    pub position_enabled: bool,
    pub pos_x: i32,
    pub pos_y: i32,
    pub offset: f64,
    pub offset_chance: f64,
    pub smoothing: i32,
    pub corner_stop_enabled: bool,
    pub corner_stop_tl: i32,
    pub corner_stop_tr: i32,
    pub corner_stop_bl: i32,
    pub corner_stop_br: i32,
    pub edge_stop_enabled: bool,
    pub edge_stop_top: i32,
    pub edge_stop_right: i32,
    pub edge_stop_bottom: i32,
    pub edge_stop_left: i32,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunOutcome {
    pub stop_reason: String,
    pub click_count: i64,
    pub elapsed_secs: f64,
    pub avg_cpu: f64,
}
static CLICK_COUNT: AtomicI64 = AtomicI64::new(0);

#[link(name = "ntdll")]
extern "system" {
    fn NtSetTimerResolution(
        DesiredResolution: u32,
        SetResolution: u8,
        CurrentResolution: *mut u32,
    ) -> u32;
}
