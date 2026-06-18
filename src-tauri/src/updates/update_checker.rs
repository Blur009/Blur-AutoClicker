use reqwest::header::USER_AGENT;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<CheckUpdateResult>, String> {
    let current_version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.0.0".into());
    let url = "https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest";
    let client = reqwest::Client::new();

    let response = client
        .get(url)
        .header(USER_AGENT, "BlurAutoClicker")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?
        .error_for_status()
        .map_err(|e| format!("HTTP error: {}", e))?;

    if response.status().is_success() {
        let release: GithubRelease = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse release: {}", e))?;

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
