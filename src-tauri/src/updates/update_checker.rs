use std::sync::OnceLock;
use std::time::Duration;

use reqwest::header::USER_AGENT;
use serde::Deserialize;
use tauri::AppHandle;

use crate::error::AppError;
use crate::error::AppResult;

const MAX_RESPONSE_BYTES: u64 = 1_000_000;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("HTTP client builder with fixed 10s timeout should not fail")
    })
}

fn ensure_size(len: Option<u64>) -> Result<(), AppError> {
    if let Some(n) = len {
        if n > MAX_RESPONSE_BYTES {
            return Err(AppError::Network("Response too large".into()));
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
}

#[tauri::command]
pub async fn fetch_changelog() -> AppResult<String> {
    let url = "https://raw.githubusercontent.com/Blur009/Blur-AutoClicker/main/CHANGELOG.md";
    let client = http_client();

    let response = client
        .get(url)
        .header(USER_AGENT, "BlurAutoClicker")
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?
        .error_for_status()
        .map_err(|e| AppError::Network(format!("HTTP error: {}", e)))?;

    ensure_size(response.content_length())?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Network(format!("Failed to read changelog: {}", e)))?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err(AppError::Network(format!(
            "Changelog too large (>{} bytes)",
            MAX_RESPONSE_BYTES
        )));
    }
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| AppError::Network(format!("Changelog not valid UTF-8: {}", e)))?;

    Ok(text.trim().to_owned())
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> AppResult<Option<CheckUpdateResult>> {
    let current_version = app.config().version.clone().unwrap_or("0.0.0".into());
    let url = "https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest";
    let client = http_client();

    let response = client
        .get(url)
        .header(USER_AGENT, "BlurAutoClicker")
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?
        .error_for_status()
        .map_err(|e| AppError::Network(format!("HTTP error: {}", e)))?;

    ensure_size(response.content_length())?;

    if response.status().is_success() {
        let bytes = response
            .bytes()
            .await
            .map_err(|e| AppError::Network(format!("Failed to read release: {}", e)))?;
        if bytes.len() as u64 > MAX_RESPONSE_BYTES {
            return Err(AppError::Network(format!(
                "Release response too large (>{} bytes)",
                MAX_RESPONSE_BYTES
            )));
        }
        let text = std::str::from_utf8(&bytes)
            .map_err(|e| AppError::Network(format!("Release not valid UTF-8: {}", e)))?
            .trim();

        let release: GithubRelease = serde_json::from_slice(text.as_bytes())
            .map_err(|e| AppError::Network(format!("Failed to parse release: {}", e)))?;

        if is_update_available(&release.tag_name, &current_version) {
            return Ok(Some(CheckUpdateResult {
                current_version: current_version.clone(),
                latest_version: release.tag_name,
                update_available: true,
            }));
        }
    }

    Ok(Some(CheckUpdateResult {
        current_version,
        latest_version: String::new(),
        update_available: false,
    }))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
}

fn is_update_available(remote: &str, local: &str) -> bool {
    let r_ver = remote.trim_start_matches('v');
    let l_ver = local.trim_start_matches('v');

    let r_parts: Vec<&str> = r_ver.split('.').collect();
    let l_parts: Vec<&str> = l_ver.split('.').collect();

    let max_len = std::cmp::max(r_parts.len(), l_parts.len());

    for i in 0..max_len {
        let r_num = r_parts
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let l_num = l_parts
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        if r_num > l_num {
            return true;
        }
        if r_num < l_num {
            return false;
        }
    }
    false
}
