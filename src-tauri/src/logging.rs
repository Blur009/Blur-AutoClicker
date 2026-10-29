use std::fmt::{Arguments, Display};

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
        message,
        width = TARGET_WIDTH,
    )
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
