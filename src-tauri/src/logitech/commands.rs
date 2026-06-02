use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::logitech::device::{BatteryStatus, DeviceCapabilities, LightingSettings};
use crate::logitech::g502;
use crate::logitech::hid::{self, DeviceDescriptor, HIDDeviceInfo};

static DEVICES: std::sync::Mutex<Vec<HIDDeviceInfo>> = std::sync::Mutex::new(Vec::new());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogitechDeviceInfo {
    pub descriptor: DeviceDescriptor,
    pub capabilities: DeviceCapabilities,
    pub battery: Option<BatteryStatus>,
}

#[tauri::command]
pub fn scan_devices(_app: AppHandle) -> Result<Vec<LogitechDeviceInfo>, String> {
    let devices = hid::enumerate_logitech_devices().map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    // Filter to supported devices
    let supported: Vec<HIDDeviceInfo> = devices
        .into_iter()
        .filter(|d| g502::is_supported(d.product_id))
        .collect();

    // Store for later commands
    {
        let mut store = DEVICES.lock().map_err(|e| e.to_string())?;
        *store = supported.clone();
    }

    for device in &supported {
        let capabilities = g502::probe_device(device).unwrap_or(DeviceCapabilities::none());
        let battery = if capabilities.has_battery {
            g502::get_battery(device).ok()
        } else {
            None
        };

        result.push(LogitechDeviceInfo {
            descriptor: DeviceDescriptor {
                device_id: format!("{:04x}:{:04x}:{}", device.vendor_id, device.product_id, device.serial_number),
                product: device.product.clone(),
                vendor_id: device.vendor_id,
                product_id: device.product_id,
                serial: device.serial_number.clone(),
                connected: true,
            },
            capabilities,
            battery,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_device_info(device_id: String) -> Result<LogitechDeviceInfo, String> {
    let store = DEVICES.lock().map_err(|e| e.to_string())?;
    let device = store
        .iter()
        .find(|d| {
            format!("{:04x}:{:04x}:{}", d.vendor_id, d.product_id, d.serial_number) == device_id
        })
        .ok_or("Device not found")?;

    let capabilities = g502::probe_device(device).unwrap_or(DeviceCapabilities::none());
    let battery = if capabilities.has_battery {
        g502::get_battery(device).ok()
    } else {
        None
    };

    Ok(LogitechDeviceInfo {
        descriptor: DeviceDescriptor {
            device_id: device_id.clone(),
            product: device.product.clone(),
            vendor_id: device.vendor_id,
            product_id: device.product_id,
            serial: device.serial_number.clone(),
            connected: true,
        },
        capabilities,
        battery,
    })
}

#[tauri::command]
pub fn set_dpi(device_id: String, dpi: u32) -> Result<String, String> {
    let store = DEVICES.lock().map_err(|e| e.to_string())?;
    let device = store
        .iter()
        .find(|d| {
            format!("{:04x}:{:04x}:{}", d.vendor_id, d.product_id, d.serial_number) == device_id
        })
        .ok_or("Device not found")?;

    g502::set_dpi(device, dpi)?;
    Ok(format!("DPI set to {}", dpi))
}

#[tauri::command]
pub fn get_battery(device_id: String) -> Result<BatteryStatus, String> {
    let store = DEVICES.lock().map_err(|e| e.to_string())?;
    let device = store
        .iter()
        .find(|d| {
            format!("{:04x}:{:04x}:{}", d.vendor_id, d.product_id, d.serial_number) == device_id
        })
        .ok_or("Device not found")?;

    g502::get_battery(device)
}

#[tauri::command]
pub fn set_lighting(device_id: String, settings: LightingSettings) -> Result<String, String> {
    let store = DEVICES.lock().map_err(|e| e.to_string())?;
    let device = store
        .iter()
        .find(|d| {
            format!("{:04x}:{:04x}:{}", d.vendor_id, d.product_id, d.serial_number) == device_id
        })
        .ok_or("Device not found")?;

    g502::set_lighting(device, &settings)?;
    Ok("Lighting applied".to_string())
}

#[tauri::command]
pub fn set_report_rate(device_id: String, rate: u32) -> Result<String, String> {
    let store = DEVICES.lock().map_err(|e| e.to_string())?;
    let device = store
        .iter()
        .find(|d| {
            format!("{:04x}:{:04x}:{}", d.vendor_id, d.product_id, d.serial_number) == device_id
        })
        .ok_or("Device not found")?;

    g502::set_report_rate(device, rate)?;
    Ok(format!("Report rate set to {} Hz", rate))
}