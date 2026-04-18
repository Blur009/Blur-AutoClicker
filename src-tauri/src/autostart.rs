use std::io;

const APP_NAME: &str = "BlurAutoClicker";
const RUN_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";

pub fn get_autostart_enabled() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(run_key) = hkcu.open_subkey(RUN_KEY) else {
        return false;
    };
    run_key.get_value::<String, _>(APP_NAME).is_ok()
}

pub fn set_autostart_enabled(enabled: bool) -> io::Result<()> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu.open_subkey_with_flags(RUN_KEY, KEY_WRITE)?;

    if enabled {
        let exe_path = std::env::current_exe()?;
        let value = format!("\"{}\" --autostart", exe_path.display());
        run_key.set_value(APP_NAME, &value)?;
    } else {
        let _ = run_key.delete_value(APP_NAME);
    }

    Ok(())
}
