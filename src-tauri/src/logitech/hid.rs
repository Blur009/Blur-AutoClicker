/// Logitech HID++ protocol constants and communication
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// Logitech vendor ID
pub const LOGITECH_VENDOR_ID: u16 = 0x046D;

// HID++ protocol constants
pub const HIDPP_SHORT_MESSAGE: u8 = 0x10;
pub const HIDPP_LONG_MESSAGE: u8 = 0x11;
pub const HIDPP_VERY_LONG_MESSAGE: u8 = 0x12;

// Common feature IDs (HID++ 2.0)
pub const FEATURE_ROOT: u16 = 0x0000;
pub const FEATURE_FEATURE_SET: u16 = 0x0001;
pub const FEATURE_DEVICE_INFO: u16 = 0x0003;
pub const FEATURE_DEVICE_NAME: u16 = 0x0005;
pub const FEATURE_BATTERY_STATUS: u16 = 0x1000;
pub const FEATURE_BATTERY_VOLTAGE: u16 = 0x1001;
pub const FEATURE_UNIFIED_BATTERY: u16 = 0x1004;
pub const FEATURE_LED_CONTROL: u16 = 0x1300;
pub const FEATURE_RGB_EFFECTS: u16 = 0x8071;
pub const FEATURE_ADJUSTABLE_DPI: u16 = 0x2201;
pub const FEATURE_ONBOARD_PROFILES: u16 = 0x8100;
pub const FEATURE_REPORT_RATE: u16 = 0x8060;

#[derive(Clone, Debug)]
pub struct HIDDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub serial_number: String,
    pub product: String,
    pub path: Vec<u8>,
    pub interface_number: i32,
}

#[derive(Debug)]
pub struct HIDError(pub String);

impl std::fmt::Display for HIDError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HID error: {}", self.0)
    }
}

impl std::error::Error for HIDError {}

/// Global HIDAPI context for thread safety
static HID_API: Mutex<Option<hidapi::HidApi>> = Mutex::new(None);

fn ensure_hid_api() -> Result<std::sync::MutexGuard<'static, Option<hidapi::HidApi>>, HIDError> {
    let mut guard = HID_API.lock().map_err(|e| HIDError(e.to_string()))?;
    if guard.is_none() {
        *guard = Some(hidapi::HidApi::new().map_err(|e| HIDError(e.to_string()))?);
    }
    Ok(guard)
}

/// Enumerate all Logitech devices
pub fn enumerate_logitech_devices() -> Result<Vec<HIDDeviceInfo>, HIDError> {
    let guard = ensure_hid_api()?;
    let api = guard.as_ref().unwrap();

    let devices = api
        .device_list()
        .filter(|d| d.vendor_id() == LOGITECH_VENDOR_ID)
        .map(|d| HIDDeviceInfo {
            vendor_id: d.vendor_id(),
            product_id: d.product_id(),
            serial_number: d.serial_number().unwrap_or("").to_string(),
            product: d.product_string().unwrap_or("Unknown Logitech Device").to_string(),
            path: d.path().to_bytes_with_nul().to_vec(),
            interface_number: d.interface_number(),
        })
        .collect();

    Ok(devices)
}

/// Open a HID connection to a device
pub fn open_device(path: &[u8]) -> Result<hidapi::HidDevice, HIDError> {
    use std::ffi::CStr;
    let guard = ensure_hid_api()?;
    let api = guard.as_ref().unwrap();
    let cstr = CStr::from_bytes_with_nul(path).map_err(|e| HIDError(format!("Invalid path: {}", e)))?;
    api.open_path(cstr).map_err(|e| HIDError(e.to_string()))
}

/// Send a HID++ 2.0 feature request and get response
pub fn send_feature_request(
    device: &hidapi::HidDevice,
    feature_index: u8,
    function_id: u8,
    params: &[u8],
) -> Result<Vec<u8>, HIDError> {
    let msg_type = if params.len() > 3 {
        HIDPP_LONG_MESSAGE
    } else {
        HIDPP_SHORT_MESSAGE
    };
    let msg_len = if msg_type == HIDPP_LONG_MESSAGE { 20 } else { 7 };

    let mut message = vec![0u8; msg_len];
    message[0] = msg_type;
    message[1] = 0xFF; // device index = broadcast
    message[2] = feature_index;
    message[3] = function_id << 4;

    for (i, b) in params.iter().enumerate() {
        if i + 4 < msg_len {
            message[4 + i] = *b;
        }
    }

    device
        .write(&message)
        .map_err(|e| HIDError(format!("Write failed: {}", e)))?;

    let mut buf = vec![0u8; msg_len];
    let n = device
        .read_timeout(&mut buf, 1000)
        .map_err(|e| HIDError(format!("Read failed: {}", e)))?;

    buf.truncate(n);
    Ok(buf)
}

/// Discover HID++ 2.0 feature indexes via IRoot (0x0000)
pub fn discover_features(
    device: &hidapi::HidDevice,
) -> Result<std::collections::HashMap<u16, u8>, HIDError> {
    let mut features = std::collections::HashMap::new();
    let feature_ids = [
        FEATURE_ADJUSTABLE_DPI,
        FEATURE_BATTERY_STATUS,
        FEATURE_BATTERY_VOLTAGE,
        FEATURE_UNIFIED_BATTERY,
        FEATURE_LED_CONTROL,
        FEATURE_RGB_EFFECTS,
        FEATURE_ONBOARD_PROFILES,
        FEATURE_REPORT_RATE,
    ];

    for &fid in &feature_ids {
        let params = vec![(fid >> 8) as u8, (fid & 0xFF) as u8];
        match send_feature_request(device, 0x00, 0x00, &params) {
            Ok(response) if response.len() >= 5 && response[4] != 0 => {
                features.insert(fid, response[4]);
            }
            _ => {}
        }
    }

    Ok(features)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDescriptor {
    pub device_id: String,
    pub product: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub serial: String,
    pub connected: bool,
}