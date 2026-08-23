use super::ClickerConfig;
use base64::Engine;
use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use crate::error::poisoned_inner;
use crate::macos::input::{VK_LWIN, VK_RWIN, VK_TAB};

const PROCESS_DISPLAY_TITLE_MAX_CHARS: usize = 35;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub name: String,
    pub display_name: String,
    pub pid: u32,
    pub icon_base64: Option<String>,
}

fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn normalize_process_name(name: &str) -> String {
    name.trim()
        .to_ascii_lowercase()
        .trim_end_matches(".exe")
        .trim_end_matches(".app")
        .to_string()
}

fn executable_name(app: &NSRunningApplication) -> Option<String> {
    let path = app.executableURL()?.path()?.to_string();
    Path::new(&path)
        .file_name()
        .map(|name| normalize_process_name(&name.to_string_lossy()))
}

fn display_name(app: &NSRunningApplication, fallback: &str) -> String {
    let value = app
        .localizedName()
        .map(|name| name.to_string())
        .unwrap_or_else(|| fallback.to_string());
    match value.char_indices().nth(PROCESS_DISPLAY_TITLE_MAX_CHARS) {
        Some((index, _)) => value[..index].to_string(),
        None => value,
    }
}

fn icon_for_app(app: &NSRunningApplication, name: &str) -> Option<String> {
    if let Some(cached) = icon_cache()
        .lock()
        .unwrap_or_else(poisoned_inner)
        .get(name)
        .cloned()
    {
        return cached;
    }
    let encoded = app.icon().and_then(|icon| {
        let data = icon.TIFFRepresentation()?;
        let bytes = data.to_vec();
        Some(format!(
            "data:image/tiff;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    });
    icon_cache()
        .lock()
        .unwrap_or_else(poisoned_inner)
        .insert(name.to_string(), encoded.clone());
    encoded
}

pub fn get_foreground_process_name() -> Option<String> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    executable_name(&app)
}

pub fn list_running_processes() -> Vec<ProcessInfo> {
    let workspace = NSWorkspace::sharedWorkspace();
    let mut unique: HashMap<String, ProcessInfo> = HashMap::new();
    for app in workspace.runningApplications().to_vec() {
        if app.activationPolicy() != NSApplicationActivationPolicy::Regular {
            continue;
        }
        let Some(name) = executable_name(&app) else {
            continue;
        };
        let display_name = display_name(&app, &name);
        let icon_base64 = icon_for_app(&app, &name);
        unique.entry(name.clone()).or_insert(ProcessInfo {
            name,
            display_name,
            pid: app.processIdentifier().max(0) as u32,
            icon_base64,
        });
    }
    let mut result: Vec<_> = unique.into_values().collect();
    result.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    result
}

pub fn check_process_list(config: &ClickerConfig) -> Option<()> {
    if !config.process_list_enabled {
        return None;
    }
    let current = get_foreground_process_name()?;
    let is_in_list = config
        .process_list_entries
        .iter()
        .any(|entry| entry.enabled && normalize_process_name(&entry.name) == current);
    let triggered = match config.process_list_mode {
        super::ProcessListMode::Whitelist => !is_in_list,
        super::ProcessListMode::Blacklist => is_in_list,
    };
    triggered.then_some(())
}

pub fn is_task_switcher_active() -> bool {
    (crate::hotkeys::is_vk_down(VK_LWIN as i32) || crate::hotkeys::is_vk_down(VK_RWIN as i32))
        && crate::hotkeys::is_vk_down(VK_TAB as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_names_are_platform_normalized() {
        assert_eq!(normalize_process_name("Safari.app"), "safari");
        assert_eq!(normalize_process_name("RTSS.exe"), "rtss");
    }
}
