use serde::Serialize;
use serde::Serializer;
use std::sync::PoisonError;

pub fn poisoned_inner<T>(e: PoisonError<T>) -> T {
    log::warn!("[Mutex] Recovering from poisoned lock — application state may be inconsistent");
    e.into_inner()
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Clicker is already running")]
    AlreadyRunning,

    #[error("{0}")]
    Hotkey(String),

    #[error("Overlay window not found")]
    OverlayNotFound,

    #[error("{0}")]
    State(String),

    #[error("{0}")]
    Network(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error("Click speed must be greater than zero")]
    ZeroCps,

    #[error("Unknown keyboard key: '{0}'")]
    UnknownKey(String),

    #[error("Keyboard mode requires a key to be selected")]
    NoKeySelected,

    #[error("{0}")]
    HotkeyConflict(String),

    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    #[error("Windows API call failure. System Error Code: {0}")]
    WindowsSystem(u32),

    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    #[error("High-precision hardware timer unavailable on this machine")]
    TimerPrecision,

    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    #[error("Inter-thread channel communication disconnected")]
    ChannelFailure,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let payload = match self {
            AppError::AlreadyRunning => ErrorPayload {
                code: "ALREADY_RUNNING",
                message: self.to_string(),
            },
            AppError::Hotkey(msg) => ErrorPayload {
                code: "HOTKEY_ERROR",
                message: msg.clone(),
            },
            AppError::OverlayNotFound => ErrorPayload {
                code: "OVERLAY_NOT_FOUND",
                message: self.to_string(),
            },
            AppError::State(msg) => ErrorPayload {
                code: "STATE_ERROR",
                message: msg.clone(),
            },
            AppError::Network(msg) => ErrorPayload {
                code: "NETWORK_ERROR",
                message: msg.clone(),
            },
            AppError::Io(err) => ErrorPayload {
                code: "IO_ERROR",
                message: err.to_string(),
            },
            AppError::Tauri(err) => ErrorPayload {
                code: "TAURI_ERROR",
                message: err.to_string(),
            },
            AppError::ZeroCps => ErrorPayload {
                code: "ZERO_CPS",
                message: self.to_string(),
            },
            AppError::UnknownKey(key) => ErrorPayload {
                code: "UNKNOWN_KEY",
                message: format!("Unknown keyboard key: '{}'", key),
            },
            AppError::NoKeySelected => ErrorPayload {
                code: "NO_KEY_SELECTED",
                message: self.to_string(),
            },
            AppError::HotkeyConflict(msg) => ErrorPayload {
                code: "HOTKEY_CONFLICT",
                message: msg.clone(),
            },
            AppError::WindowsSystem(code) => ErrorPayload {
                code: "WIN_API_FAILURE",
                message: format!("Windows API error code: {:#X}", code),
            },
            AppError::TimerPrecision => ErrorPayload {
                code: "TIMER_UNAVAILABLE",
                message: "Failed to establish sub-millisecond Windows timer resolution."
                    .to_string(),
            },
            AppError::ChannelFailure => ErrorPayload {
                code: "THREAD_SYNC_FAILURE",
                message: "Active communication between automation threads was severed.".to_string(),
            },
        };
        payload.serialize(serializer)
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_already_running_serializes_correctly() {
        let err = AppError::AlreadyRunning;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "ALREADY_RUNNING");
        assert!(val["message"].as_str().unwrap().contains("already running"));
    }

    #[test]
    fn app_error_hotkey_serializes_correctly() {
        let err = AppError::Hotkey("test binding".into());
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "HOTKEY_ERROR");
        assert_eq!(val["message"], "test binding");
    }

    #[test]
    fn app_error_overlay_not_found_serializes_correctly() {
        let err = AppError::OverlayNotFound;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "OVERLAY_NOT_FOUND");
        assert!(val["message"]
            .as_str()
            .unwrap()
            .contains("Overlay window not found"));
    }

    #[test]
    fn app_error_state_serializes_correctly() {
        let err = AppError::State("bad state".into());
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "STATE_ERROR");
        assert_eq!(val["message"], "bad state");
    }

    #[test]
    fn app_error_network_serializes_correctly() {
        let err = AppError::Network("timeout".into());
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "NETWORK_ERROR");
        assert_eq!(val["message"], "timeout");
    }

    #[test]
    fn app_error_io_serializes_correctly() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = AppError::Io(io_err);
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "IO_ERROR");
        assert!(val["message"].as_str().unwrap().contains("file not found"));
    }

    #[test]
    fn app_error_tauri_serializes_correctly() {
        let err = AppError::Tauri(tauri::Error::InvokeKey);
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "TAURI_ERROR");
        assert!(!val["message"].as_str().unwrap().is_empty());
    }

    #[test]
    fn app_error_zero_cps_serializes_correctly() {
        let err = AppError::ZeroCps;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "ZERO_CPS");
        assert!(val["message"]
            .as_str()
            .unwrap()
            .contains("greater than zero"));
    }

    #[test]
    fn app_error_unknown_key_serializes_correctly() {
        let err = AppError::UnknownKey("F13".into());
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "UNKNOWN_KEY");
        assert!(val["message"].as_str().unwrap().contains("F13"));
    }

    #[test]
    fn app_error_no_key_selected_serializes_correctly() {
        let err = AppError::NoKeySelected;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "NO_KEY_SELECTED");
        assert!(val["message"]
            .as_str()
            .unwrap()
            .contains("key to be selected"));
    }

    #[test]
    fn app_error_hotkey_conflict_serializes_correctly() {
        let err = AppError::HotkeyConflict("conflict with Ctrl+K".into());
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "HOTKEY_CONFLICT");
        assert_eq!(val["message"], "conflict with Ctrl+K");
    }

    #[test]
    fn app_error_windows_system_serializes_correctly() {
        let err = AppError::WindowsSystem(5);
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "WIN_API_FAILURE");
        assert!(val["message"].as_str().unwrap().contains("0x5"));
    }

    #[test]
    fn app_error_timer_precision_serializes_correctly() {
        let err = AppError::TimerPrecision;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "TIMER_UNAVAILABLE");
        assert!(val["message"].as_str().unwrap().contains("sub-millisecond"));
    }

    #[test]
    fn app_error_channel_failure_serializes_correctly() {
        let err = AppError::ChannelFailure;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "THREAD_SYNC_FAILURE");
        assert!(val["message"]
            .as_str()
            .unwrap()
            .contains("automation threads"));
    }

    #[test]
    fn error_payload_is_camel_case() {
        let err = AppError::Io(std::io::Error::other("test"));
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"code\""));
        assert!(json.contains("\"message\""));
        // Should NOT have snake_case keys
        assert!(!json.contains("\"error_code\""));
    }

    #[test]
    fn io_error_from_into_works() {
        fn returns_app_result() -> AppResult<()> {
            let _contents = std::fs::read_to_string("/nonexistent/file")?;
            Ok(())
        }
        let result = returns_app_result();
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            AppError::Io(_) => {}
            _ => panic!("Expected Io variant, got {:?}", err),
        }
    }

    #[test]
    fn app_error_implements_display() {
        let msg = AppError::State("display test".into()).to_string();
        assert_eq!(msg, "display test");
    }

    #[test]
    fn app_error_implements_debug() {
        let debug = format!("{:?}", AppError::ZeroCps);
        assert!(debug.contains("ZeroCps"));
    }
}
