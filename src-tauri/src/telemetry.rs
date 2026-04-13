use crate::engine::stats::RunRecord;
use crate::ClickerSettings;
use serde::Serialize;

#[derive(Serialize)]
pub struct TelemetryData {
    pub click_speed: f64,
    pub click_interval: String,
    pub mouse_button: String,
    pub duty_cycle: f64,
    pub activation_type: String,
    pub speed_variation_enabled: bool,
    pub speed_variation_amount: f64,
    pub click_limit_enabled: bool,
    pub click_limit_value: i32,
    pub time_limit_enabled: bool,
    pub time_limit_value: f64,
    pub time_limit_unit: String,
    pub position_enabled: bool,
    pub offset_enabled: bool,
    pub offset_value: f64,
    pub offset_chance_enabled: bool,
    pub offset_chance_value: f64,
    pub smoothing_enabled: bool,
    pub advanced_used: bool,
    pub version: String,
    pub hotkey: String,
    pub duty_cycle_enabled: bool,
    pub double_click_enabled: bool,
    pub double_click_delay: u32,
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
    pub position_x: i32,
    pub position_y: i32,
    pub disable_screenshots: bool,
}

impl TelemetryData {
    pub fn from_settings(s: &ClickerSettings, version: String) -> Self {
        Self {
            click_speed: s.click_speed,
            click_interval: s.click_interval.clone(),
            mouse_button: s.mouse_button.clone(),
            duty_cycle: s.duty_cycle,
            activation_type: s.mode.clone(),
            speed_variation_enabled: s.speed_variation_enabled,
            speed_variation_amount: s.speed_variation,
            click_limit_enabled: s.click_limit_enabled,
            click_limit_value: s.click_limit,
            time_limit_enabled: s.time_limit_enabled,
            time_limit_value: s.time_limit,
            time_limit_unit: s.time_limit_unit.clone(),
            position_enabled: s.position_enabled,
            offset_enabled: false,
            offset_value: 0.0,
            offset_chance_enabled: false,
            offset_chance_value: 0.0,
            smoothing_enabled: false,
            advanced_used: s.advanced_settings_enabled,
            version,
            hotkey: s.hotkey.clone(),
            duty_cycle_enabled: s.duty_cycle_enabled,
            double_click_enabled: s.double_click_enabled,
            double_click_delay: s.double_click_delay,
            corner_stop_enabled: s.corner_stop_enabled,
            corner_stop_tl: s.corner_stop_tl,
            corner_stop_tr: s.corner_stop_tr,
            corner_stop_bl: s.corner_stop_bl,
            corner_stop_br: s.corner_stop_br,
            edge_stop_enabled: s.edge_stop_enabled,
            edge_stop_top: s.edge_stop_top,
            edge_stop_right: s.edge_stop_right,
            edge_stop_bottom: s.edge_stop_bottom,
            edge_stop_left: s.edge_stop_left,
            position_x: s.position_x,
            position_y: s.position_y,
            disable_screenshots: s.disable_screenshots,
        }
    }
}

pub async fn send_settings_telemetry(data: TelemetryData) -> Result<(), String> {
    let (url, key) = parse_supabase_creds()?;
    let full_url = format!("{}/rest/v1/Main%20v3.0.0%2B", url.trim());

    let client = reqwest::Client::new();
    client
        .post(&full_url)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&data)
        .send()
        .await
        .map_err(|e| format!("Settings telemetry failed: {}", e))?;

    Ok(())
}

#[derive(Serialize)]
pub struct StatsRow {
    pub clicks: i64,
    pub time: f64,
    pub avg_cpu: f64,
    pub runs: u32,
}

pub async fn send_stats_rows(rows: &[RunRecord]) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }

    let (url, key) = parse_supabase_creds()?;
    let full_url = format!("{}/rest/v1/quick_updates", url.trim());

    let payload: Vec<StatsRow> = rows
        .iter()
        .map(|r| StatsRow {
            clicks: r.clicks,
            time: r.time_secs,
            avg_cpu: r.avg_cpu,
            runs: r.runs,
        })
        .collect();

    let client = reqwest::Client::new();
    client
        .post(&full_url)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Stats telemetry failed: {}", e))?;

    Ok(())
}

fn parse_supabase_creds() -> Result<(String, String), String> {
    let raw = include_str!("../.tauri/Supabase.py");
    let mut url = None;
    let mut key = None;

    for line in raw.lines() {
        let line: &str = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let lower = line.to_lowercase();
        if lower.contains("url") && line.contains('=') {
            if let Some(val) = line.split('=').nth(1) {
                let val: &str = val.trim().trim_matches('"').trim_matches('\'').trim();
                if val.starts_with("http") {
                    url = Some(val.to_string());
                }
            }
        }
        if lower.contains("key") && line.contains('=') && !lower.contains("url") {
            if let Some(val) = line.split('=').nth(1) {
                let val: &str = val.trim().trim_matches('"').trim_matches('\'').trim();
                if !val.is_empty() {
                    key = Some(val.to_string());
                }
            }
        }
    }

    match (url, key) {
        (Some(u), Some(k)) => Ok((u, k)),
        _ => Err("Failed to parse Supabase credentials".to_string()),
    }
}
