use std::fmt::{Arguments, Display};
use std::sync::OnceLock;

const TARGET_WIDTH: usize = 16;

pub fn format_line(
    out: tauri_plugin_log::fern::FormatCallback<'_>,
    message: &Arguments<'_>,
    record: &log::Record<'_>,
) {
    out.finish(format_args!(
        "{}",
        render_line(record.level(), record.target(), message)
    ));
}

pub fn render_line(level: log::Level, target: &str, message: impl Display) -> String {
    format!(
        "{}  {:<5}  {:<width$}  {}",
        timestamp(),
        level.as_str(),
        short_target(target),
        redact_profile(&message.to_string()),
        width = TARGET_WIDTH,
    )
}

fn profile_paths() -> &'static (String, String) {
    static PATHS: OnceLock<(String, String)> = OnceLock::new();
    PATHS.get_or_init(|| {
        let raw = std::env::var("USERPROFILE").unwrap_or_default();
        let redacted = match std::path::Path::new(&raw).parent() {
            Some(parent) if !raw.is_empty() => {
                format!("{}{}<user>", parent.display(), std::path::MAIN_SEPARATOR)
            }
            _ => String::new(),
        };
        (raw, redacted)
    })
}

pub fn redact_profile(text: &str) -> String {
    let (raw, redacted) = profile_paths();
    if raw.is_empty() || redacted.is_empty() || !text.contains(raw.as_str()) {
        return text.to_string();
    }
    text.replace(raw.as_str(), redacted)
}

pub fn short_target(target: &str) -> &str {
    target.strip_prefix("app_lib::").unwrap_or(target)
}

fn timestamp() -> String {
    chrono::Local::now()
        .format("%y-%m-%d %H:%M:%S%.3f")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_profile_name_is_replaced_in_rendered_lines() {
        let raw = std::env::var("USERPROFILE").unwrap_or_default();
        let leaf = std::path::Path::new(&raw)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if leaf.is_empty() {
            return;
        }

        let line = render_line(
            log::Level::Info,
            "app_lib::startup",
            format_args!("crash reports directory: {raw}"),
        );

        assert!(line.contains("<user>"), "{line}");
        assert!(!line.contains(leaf), "{line}");
    }

    #[test]
    fn strips_only_the_crate_prefix() {
        assert_eq!(short_target("app_lib::engine::stats"), "engine::stats");
        assert_eq!(short_target("app_lib"), "app_lib");
        assert_eq!(short_target("rusqlite_migration"), "rusqlite_migration");
    }

    #[test]
    fn pads_level_and_target_into_columns() {
        let line = render_line(log::Level::Info, "app_lib::engine::stats", "run ended");

        assert_eq!(&line[21..], &expected("INFO", "engine::stats", "run ended"));
    }

    #[test]
    fn pads_short_levels_and_leaves_long_targets_intact() {
        let warn = render_line(log::Level::Warn, "app_lib::hotkeys", "press detected");
        assert_eq!(&warn[21..], &expected("WARN", "hotkeys", "press detected"));

        let long = render_line(log::Level::Debug, "rusqlite_migration", "migrated");
        assert_eq!(
            &long[21..],
            &expected("DEBUG", "rusqlite_migration", "migrated")
        );
    }

    fn expected(level: &str, target: &str, message: &str) -> String {
        let padding = TARGET_WIDTH.saturating_sub(target.len());
        format!(
            "  {:<5}  {}{}  {}",
            level,
            target,
            " ".repeat(padding),
            message
        )
    }

    #[test]
    fn starts_with_a_shorthand_local_timestamp() {
        let line = render_line(log::Level::Info, "app_lib", "hello");
        let stamp = line.split("  ").next().expect("timestamp column");

        assert_eq!(stamp.len(), 21, "unexpected width: {stamp}");
        assert_eq!(&stamp[2..3], "-");
        assert_eq!(&stamp[5..6], "-");
        assert_eq!(&stamp[8..9], " ");
        assert_eq!(&stamp[11..12], ":");
        assert_eq!(&stamp[14..15], ":");
        assert_eq!(&stamp[17..18], ".");
    }
}
