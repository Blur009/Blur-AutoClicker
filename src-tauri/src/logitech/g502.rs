use super::device::{BatteryStatus, DeviceCapabilities, DPISettings, LightingSettings, RGBColor};
use super::hid::{self, discover_features, send_feature_request, HIDDeviceInfo};
use crate::logitech::hid::FEATURE_ADJUSTABLE_DPI;

pub const G502_LIGHTSPEED_PID: u16 = 0x407F;
pub const G502_LIGHTSPEED_WIRED_PID: u16 = 0x407E;
pub const G502X_PLUS_PID: u16 = 0x4099;
pub const G502X_PLUS_RECEIVER_PID: u16 = 0x409A;

/// All Logitech product IDs we know about
pub const SUPPORTED_PIDS: &[u16] = &[
    G502_LIGHTSPEED_PID,
    G502_LIGHTSPEED_WIRED_PID,
    G502X_PLUS_PID,
    G502X_PLUS_RECEIVER_PID,
];

pub fn is_supported(pid: u16) -> bool {
    SUPPORTED_PIDS.contains(&pid)
}

/// Try to identify a Logitech device and return its capabilities
pub fn probe_device(info: &HIDDeviceInfo) -> Result<DeviceCapabilities, String> {
    if !is_supported(info.product_id) {
        return Ok(DeviceCapabilities::none());
    }

    // Open device and discover HID++ features
    let device = hid::open_device(&info.path).map_err(|e| format!("Failed to open device: {}", e))?;
    let features = discover_features(&device).map_err(|e| format!("Feature discovery failed: {}", e))?;

    Ok(DeviceCapabilities {
        has_dpi: features.contains_key(&crate::logitech::hid::FEATURE_ADJUSTABLE_DPI),
        has_rgb: features.contains_key(&crate::logitech::hid::FEATURE_RGB_EFFECTS),
        has_battery: features.contains_key(&crate::logitech::hid::FEATURE_BATTERY_STATUS)
            || features.contains_key(&crate::logitech::hid::FEATURE_UNIFIED_BATTERY),
        has_report_rate: features.contains_key(&crate::logitech::hid::FEATURE_REPORT_RATE),
        has_onboard_profiles: features.contains_key(&crate::logitech::hid::FEATURE_ONBOARD_PROFILES),
    })
}

pub fn get_battery(info: &HIDDeviceInfo) -> Result<BatteryStatus, String> {
    let device = hid::open_device(&info.path).map_err(|e| format!("Open: {}", e))?;
    let features = discover_features(&device).map_err(|e| format!("Features: {}", e))?;

    let battery_idx = features
        .get(&crate::logitech::hid::FEATURE_BATTERY_STATUS)
        .or_else(|| features.get(&crate::logitech::hid::FEATURE_UNIFIED_BATTERY))
        .or_else(|| features.get(&crate::logitech::hid::FEATURE_BATTERY_VOLTAGE))
        .copied();

    match battery_idx {
        Some(idx) => {
            let resp = send_feature_request(&device, idx, 0x00, &[])
                .map_err(|e| format!("Battery req: {}", e))?;
            if resp.len() >= 6 {
                let level = resp[4];
                let status = resp[5];
                let charging = (status & 0x80) != 0;
                Ok(BatteryStatus {
                    level,
                    charging,
                    voltage: None,
                })
            } else {
                Ok(BatteryStatus {
                    level: 0,
                    charging: false,
                    voltage: None,
                })
            }
        }
        None => Ok(BatteryStatus {
            level: 100,
            charging: false,
            voltage: None,
        }),
    }
}

pub fn set_dpi(info: &HIDDeviceInfo, dpi: u32) -> Result<(), String> {
    let device = hid::open_device(&info.path).map_err(|e| format!("Open: {}", e))?;
    let features = discover_features(&device).map_err(|e| format!("Features: {}", e))?;

    let dpi_idx = features
        .get(&crate::logitech::hid::FEATURE_ADJUSTABLE_DPI)
        .copied()
        .ok_or("DPI feature not found")?;

    // Use DPI step of 50 for G502
    let dpi_encoded = (dpi / 50) as u16;
    let params = vec![0x00, (dpi_encoded >> 8) as u8, (dpi_encoded & 0xFF) as u8];

    send_feature_request(&device, dpi_idx, 0x01, &params)
        .map_err(|e| format!("DPI set failed: {}", e))?;

    Ok(())
}

pub fn set_lighting(info: &HIDDeviceInfo, settings: &LightingSettings) -> Result<(), String> {
    let device = hid::open_device(&info.path).map_err(|e| format!("Open: {}", e))?;
    let features = discover_features(&device).map_err(|e| format!("Features: {}", e))?;

    let rgb_idx = features
        .get(&crate::logitech::hid::FEATURE_RGB_EFFECTS)
        .copied()
        .ok_or("RGB feature not found")?;

    if !settings.enabled {
        send_feature_request(&device, rgb_idx, 0x00, &[0x00])
            .map_err(|e| format!("Lighting off failed: {}", e))?;
        return Ok(());
    }

    let effect_code = match settings.effect.as_str() {
        "off" => 0x00,
        "static" => 0x01,
        "breathing" => 0x02,
        "cycle" => 0x03,
        "wave" => 0x04,
        _ => 0x01,
    };

    let params = vec![
        effect_code,
        settings.color.r,
        settings.color.g,
        settings.color.b,
        settings.speed,
        settings.brightness,
    ];

    send_feature_request(&device, rgb_idx, 0x01, &params)
        .map_err(|e| format!("Lighting set failed: {}", e))?;

    Ok(())
}

pub fn set_report_rate(info: &HIDDeviceInfo, rate: u32) -> Result<(), String> {
    let valid_rates = [125, 250, 500, 1000];
    if !valid_rates.contains(&rate) {
        return Err(format!("Invalid report rate: {}. Use 125, 250, 500, or 1000", rate));
    }

    let device = hid::open_device(&info.path).map_err(|e| format!("Open: {}", e))?;
    let features = discover_features(&device).map_err(|e| format!("Features: {}", e))?;

    let rate_idx = features
        .get(&crate::logitech::hid::FEATURE_REPORT_RATE)
        .copied()
        .ok_or("Report rate feature not found")?;

    let rate_code = match rate {
        125 => 0x03,
        250 => 0x02,
        500 => 0x01,
        1000 => 0x00,
        _ => 0x00,
    };

    send_feature_request(&device, rate_idx, 0x00, &[rate_code])
        .map_err(|e| format!("Rate set failed: {}", e))?;

    Ok(())
}