use std::io;

const APP_NAME: &str = "BlurAutoClicker";
const AUTOSTART_DIR: &str = ".config/autostart";
const DESKTOP_FILE: &str = "BlurAutoClicker.desktop";

pub fn get_autostart_enabled() -> bool {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = std::path::PathBuf::from(&home)
        .join(AUTOSTART_DIR)
        .join(DESKTOP_FILE);
    path.exists()
}

pub fn set_autostart_enabled(enabled: bool) -> io::Result<()> {
    let home = std::env::var("HOME").map_err(|e| io::Error::new(io::ErrorKind::NotFound, e))?;
    let autostart_dir = std::path::PathBuf::from(&home).join(AUTOSTART_DIR);
    let desktop_path = autostart_dir.join(DESKTOP_FILE);

    if enabled {
        let exe_path = std::env::current_exe()?;
        std::fs::create_dir_all(&autostart_dir)?;
        let content = format!(
            "[Desktop Entry]\n\
            Type=Application\n\
            Name={}\n\
            Exec={} --autostart\n\
            X-GNOME-Autostart-enabled=true\n\
            NoDisplay=true\n",
            APP_NAME,
            exe_path.display()
        );
        std::fs::write(&desktop_path, content)?;
    } else if desktop_path.exists() {
        std::fs::remove_file(&desktop_path)?;
    }

    Ok(())
}