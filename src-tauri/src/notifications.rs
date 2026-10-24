use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn elevation_blocked(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let result = app
            .notification()
            .builder()
            .title("Blur Auto Clicker")
            .body("This window runs as administrator. Restart Blur AutoClicker as administrator to click it.")
            .show();
        if let Err(err) = result {
            log::warn!("[Notifications] elevation toast failed: {err}");
        }
    });
}
