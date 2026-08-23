use std::io;
use std::path::PathBuf;

const LABEL: &str = "com.blur009.blurautoclicker";

fn launch_agent_path() -> io::Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "home directory not found"))?;
    Ok(home
        .join("Library")
        .join("LaunchAgents")
        .join(format!("{LABEL}.plist")))
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn get_autostart_enabled() -> bool {
    !crate::portable::is_portable() && launch_agent_path().is_ok_and(|path| path.is_file())
}

pub fn set_autostart_enabled(enabled: bool) -> io::Result<()> {
    if crate::portable::is_portable() {
        return Ok(());
    }
    let path = launch_agent_path()?;
    if !enabled {
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        return Ok(());
    }
    let executable = std::env::current_exe()?;
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("invalid LaunchAgents path"))?;
    std::fs::create_dir_all(parent)?;
    let plist = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
<plist version=\"1.0\">\n<dict>\n\
  <key>Label</key><string>{LABEL}</string>\n\
  <key>ProgramArguments</key><array><string>{}</string><string>--autostart</string></array>\n\
  <key>RunAtLoad</key><true/>\n\
  <key>ProcessType</key><string>Interactive</string>\n\
</dict>\n</plist>\n",
        xml_escape(&executable.to_string_lossy())
    );
    std::fs::write(path, plist)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plist_values_are_escaped() {
        assert_eq!(xml_escape("a&<b>\"'"), "a&amp;&lt;b&gt;&quot;&apos;");
    }
}
