use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "theme";

pub fn close_if_open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if let Err(e) = window.close() {
            log::warn!("[theme] failed to close the theme window: {e}");
        }
    }
}

pub fn open(app: &AppHandle) -> Result<(), String> {
    log::info!("[theme] opening theme window");
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        return reveal(app, &window);
    }

    match build(app) {
        Ok(window) => reveal(app, &window),
        Err(e) => {
            log::error!("[theme] theme window creation failed: {e}");
            match app.get_webview_window(WINDOW_LABEL) {
                Some(window) => reveal(app, &window),
                None => Err(format!("theme window could not be created: {e}")),
            }
        }
    }
}

#[tauri::command]
pub async fn open_theme_window(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = open(&handle);
        if let Err(e) = &result {
            log::error!("[theme] theme window could not be opened: {e}");
        }
        let _ = sender.send(result);
    })
    .map_err(|e| format!("theme window dispatch failed: {e}"))?;

    match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Ok(()),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err("theme window open result was lost".to_string())
        }
    }
}

#[tauri::command]
pub fn close_theme_window(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(WINDOW_LABEL) {
        Some(window) => window
            .destroy()
            .map_err(|e| format!("theme window could not be closed: {e}")),
        None => Ok(()),
    }
}

fn main_is_on_top(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|main| main.is_always_on_top().ok())
        .unwrap_or(false)
}

fn reveal(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let on_top = main_is_on_top(app);
    if let Err(e) = window.set_always_on_top(on_top) {
        log::warn!("[theme] failed to match the main window z-order: {e}");
    }
    window
        .show()
        .map_err(|e| format!("theme window could not be shown: {e}"))?;
    window
        .unminimize()
        .map_err(|e| format!("theme window could not be restored: {e}"))?;
    if let Err(e) = window.set_focus() {
        log::warn!("[theme] failed to focus the theme window: {e}");
    } else {
        log::info!("[theme] theme window shown and focused (always_on_top={on_top})");
    }
    Ok(())
}

fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let mut builder =
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("theme.html".into()))
            .title("Theme")
            .inner_size(980.0, 720.0)
            .min_inner_size(720.0, 520.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .visible(true)
            .always_on_top(false)
            .skip_taskbar(false)
            .center()
            .data_directory(data_dir(app));

    #[cfg(target_os = "windows")]
    {
        builder = builder.on_page_load(|window, _| {
            crate::disable_browser_accelerator_keys(&window);
        });
    }

    if let Some(icon) = crate::icon::default_icon_image() {
        builder = builder.icon(icon)?;
    }

    builder.build()
}

fn data_dir(app: &AppHandle) -> PathBuf {
    crate::portable::webview_dir(WINDOW_LABEL)
        .unwrap_or_else(|| fallback_dir(app.path().app_local_data_dir().ok()))
}

fn fallback_dir(local: Option<PathBuf>) -> PathBuf {
    local
        .unwrap_or_else(|| PathBuf::from("."))
        .join(format!("EBWebView-{WINDOW_LABEL}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_dir_appends_the_label_to_the_local_data_dir() {
        let local = PathBuf::from("C:/Users/Test/AppData/Local/BlurAutoClicker");
        assert_eq!(
            fallback_dir(Some(local.clone())),
            local.join("EBWebView-theme")
        );
    }

    #[test]
    fn fallback_dir_defaults_to_the_current_directory() {
        assert_eq!(
            fallback_dir(None),
            PathBuf::from(".").join("EBWebView-theme")
        );
    }

    #[test]
    fn capability_file_scopes_the_permissions_to_the_theme_window() {
        let raw = include_str!("../capabilities/theme.json");
        let capability: serde_json::Value =
            serde_json::from_str(raw).expect("theme capability is valid json");

        assert_eq!(capability["identifier"], "theme");
        assert_eq!(
            capability["windows"],
            serde_json::json!([WINDOW_LABEL]),
            "capability must target the theme window label"
        );

        let permissions = capability["permissions"]
            .as_array()
            .expect("permissions is an array");
        let expected = [
            "core:default",
            "core:event:default",
            "core:window:allow-close",
            "core:window:allow-destroy",
            "core:window:allow-minimize",
            "core:window:allow-show",
            "core:window:allow-hide",
            "core:window:allow-set-focus",
            "core:window:allow-start-dragging",
            "core:window:allow-start-resize-dragging",
            "store:allow-get",
            "store:allow-load",
            "log:default",
        ];
        assert_eq!(permissions.len(), expected.len());
        let actual: Vec<&str> = permissions
            .iter()
            .map(|p| p.as_str().expect("permission is a string"))
            .collect();
        assert_eq!(actual.as_slice(), expected);
    }
}
