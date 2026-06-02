use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryStatus {
    pub level: u8,    // 0-100
    pub charging: bool,
    pub voltage: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DPISettings {
    pub levels: Vec<u32>,
    pub active_level: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RGBColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightingSettings {
    pub enabled: bool,
    pub effect: String, // static, breathing, cycle, wave, off
    pub color: RGBColor,
    pub brightness: u8,
    pub speed: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCapabilities {
    pub has_dpi: bool,
    pub has_rgb: bool,
    pub has_battery: bool,
    pub has_report_rate: bool,
    pub has_onboard_profiles: bool,
}

impl DeviceCapabilities {
    pub fn none() -> Self {
        Self {
            has_dpi: false,
            has_rgb: false,
            has_battery: false,
            has_report_rate: false,
            has_onboard_profiles: false,
        }
    }
}