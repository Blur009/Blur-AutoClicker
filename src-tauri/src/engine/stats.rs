use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use chrono::{Local, NaiveDate, TimeZone};
use rusqlite::{params, Connection};
use rusqlite_migration::{Migrations, M};

use crate::error::poisoned_inner;
use crate::error::{AppError, AppResult};

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();
static INIT_LOCK: Mutex<()> = Mutex::new(());

const MIGRATIONS_SLICE: &[M] = &[M::up(
    "CREATE TABLE runs (
         id         INTEGER PRIMARY KEY,
         clicks     INTEGER NOT NULL,
         time_secs  REAL NOT NULL,
         avg_cpu    REAL,
         sessions   INTEGER NOT NULL DEFAULT 1,
         started_at INTEGER NOT NULL
     );
     CREATE INDEX idx_runs_started_at ON runs(started_at);",
)];
const MIGRATIONS: Migrations<'static> = Migrations::from_slice(MIGRATIONS_SLICE);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeStats {
    pub total_clicks: i64,
    pub total_time_secs: f64,
    pub total_sessions: i64,
    pub avg_cpu: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub day: String,
    pub clicks: i64,
    pub time_secs: f64,
    pub sessions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunHighlight {
    pub clicks: i64,
    pub time_secs: f64,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub totals: CumulativeStats,
    pub clicks_per_sec: f64,
    pub active_days: i64,
    pub legacy_runs: i64,
    pub legacy_clicks: i64,
    pub longest_run: Option<RunHighlight>,
    pub current_streak_days: i64,
    pub longest_streak_days: i64,
    pub clicked_today: bool,
    pub daily: Vec<DayStat>,
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn app_dir() -> PathBuf {
    if crate::portable::is_portable() {
        if let Some(dir) = crate::portable::data_dir() {
            return dir;
        }
    }
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data).join("BlurAutoClicker")
}

fn stats_db_path() -> PathBuf {
    app_dir().join("stats.db")
}

fn legacy_csv_path() -> PathBuf {
    app_dir().join("stats.csv")
}

fn open_db(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;",
    )?;
    MIGRATIONS
        .to_latest(&mut conn)
        .map_err(|e| AppError::DbMigration(e.to_string()))?;
    Ok(conn)
}

fn db() -> AppResult<&'static Mutex<Connection>> {
    if let Some(existing) = DB.get() {
        return Ok(existing);
    }
    let _guard = INIT_LOCK.lock().unwrap_or_else(poisoned_inner);
    if DB.get().is_none() {
        let conn = open_db(&stats_db_path())?;
        import_legacy_csv(&conn, &legacy_csv_path())?;
        let _ = DB.set(Mutex::new(conn));
    }
    DB.get()
        .ok_or_else(|| AppError::State("stats database unavailable".into()))
}

/// Open the stats database, apply schema migrations, and import a legacy
/// `stats.csv` if one is present. Safe to call more than once.
pub fn init() -> AppResult<()> {
    db().map(|_| ())
}

fn import_legacy_csv(conn: &Connection, csv_path: &Path) -> AppResult<()> {
    if !csv_path.exists() {
        return Ok(());
    }

    let existing: i64 = conn.query_row("SELECT COUNT(*) FROM runs", [], |row| row.get(0))?;
    if existing > 0 {
        log::warn!(
            "[stats] {} is present but the database already holds {} rows; skipping import",
            csv_path.display(),
            existing
        );
        return Ok(());
    }

    let contents = fs::read_to_string(csv_path)?;

    let tx = conn.unchecked_transaction()?;
    let mut imported = 0u64;
    let mut skipped = 0u64;
    {
        let mut insert = tx.prepare(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (?1, ?2, ?3, ?4, 0)",
        )?;
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() < 5 || parts[0] == "id" {
                continue;
            }
            let clicks = match parts[1].parse::<i64>() {
                Ok(v) => v,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            let time_secs = match parts[2].parse::<f64>() {
                Ok(v) => v,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            let avg_cpu = match parts[3].parse::<f64>() {
                Ok(v) if v >= 0.0 => Some(v),
                Ok(_) => None,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            let sessions = parts[4].trim().parse::<i64>().unwrap_or(1).max(1);
            insert.execute(params![clicks, time_secs, avg_cpu, sessions])?;
            imported += 1;
        }
    }
    tx.commit()?;

    let file_name = csv_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("stats.csv");
    let migrated_path = csv_path.with_file_name(format!("{file_name}.migrated"));
    fs::rename(csv_path, &migrated_path)?;

    log::info!(
        "[stats] Imported {} rows from {} ({} skipped); old file kept at {}",
        imported,
        csv_path.display(),
        skipped,
        migrated_path.display()
    );
    Ok(())
}

fn insert_run(
    conn: &Connection,
    clicks: i64,
    time_secs: f64,
    avg_cpu: f64,
    started_at: i64,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO runs (clicks, time_secs, avg_cpu, started_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            clicks,
            round2(time_secs),
            if avg_cpu < 0.0 {
                None
            } else {
                Some(round2(avg_cpu))
            },
            started_at,
        ],
    )?;
    Ok(())
}

fn read_stats(conn: &Connection) -> AppResult<CumulativeStats> {
    let (total_clicks, total_time_secs, total_sessions): (i64, f64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(clicks), 0),
                COALESCE(SUM(time_secs), 0.0),
                COALESCE(SUM(sessions), 0)
         FROM runs",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let avg_cpu: Option<f64> = conn.query_row(
        "SELECT SUM(avg_cpu * sessions) / SUM(sessions)
         FROM runs
         WHERE avg_cpu IS NOT NULL",
        [],
        |row| row.get(0),
    )?;

    Ok(CumulativeStats {
        total_clicks,
        total_time_secs,
        total_sessions,
        avg_cpu: avg_cpu.map(round2).unwrap_or(-1.0),
    })
}

fn run_started_at(finished_secs: i64, elapsed_secs: f64) -> i64 {
    let elapsed = if elapsed_secs.is_finite() {
        elapsed_secs.max(0.0).round() as i64
    } else {
        0
    };
    finished_secs.saturating_sub(elapsed)
}

fn record_run_ending_at(
    conn: &Connection,
    finished_secs: i64,
    click_count: i64,
    elapsed_secs: f64,
    avg_cpu: f64,
) -> AppResult<i64> {
    let started_at = run_started_at(finished_secs, elapsed_secs);
    insert_run(conn, click_count, elapsed_secs, avg_cpu, started_at)?;
    Ok(started_at)
}

pub fn record_run(click_count: i64, elapsed_secs: f64, avg_cpu: f64) {
    let result = (|| -> AppResult<()> {
        let conn = db()?.lock().unwrap_or_else(poisoned_inner);
        record_run_ending_at(
            &conn,
            chrono::Utc::now().timestamp(),
            click_count,
            elapsed_secs,
            avg_cpu,
        )?;
        Ok(())
    })();
    if let Err(e) = result {
        log::error!("[stats] Failed to record run: {e}");
    }
}

pub fn get_stats() -> AppResult<CumulativeStats> {
    let conn = db()?.lock().unwrap_or_else(poisoned_inner);
    read_stats(&conn)
}

fn streak_summary(days: &[NaiveDate], today: NaiveDate) -> (i64, i64, bool) {
    let mut longest = 0i64;
    let mut run = 0i64;
    let mut prev: Option<NaiveDate> = None;

    for day in days {
        run = if prev.and_then(|p| p.succ_opt()) == Some(*day) {
            run + 1
        } else {
            1
        };
        longest = longest.max(run);
        prev = Some(*day);
    }

    let clicked_today = days.last() == Some(&today);
    let current = match days.last() {
        Some(last) if *last == today || last.succ_opt() == Some(today) => run,
        _ => 0,
    };

    (current, longest, clicked_today)
}

fn read_overview(conn: &Connection, today: NaiveDate) -> AppResult<StatsOverview> {
    let totals = read_stats(conn)?;
    let mut days: BTreeMap<NaiveDate, DayStat> = BTreeMap::new();
    let mut longest_run: Option<RunHighlight> = None;

    let mut stmt = conn
        .prepare("SELECT started_at, clicks, time_secs, sessions FROM runs WHERE started_at > 0")?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let started_at: i64 = row.get(0)?;
        let clicks: i64 = row.get(1)?;
        let time_secs: f64 = row.get(2)?;
        let sessions: i64 = row.get(3)?;
        let Some(stamp) = Local.timestamp_opt(started_at, 0).single() else {
            continue;
        };

        let day = stamp.date_naive();
        let entry = days.entry(day).or_insert_with(|| DayStat {
            day: day.format("%Y-%m-%d").to_string(),
            clicks: 0,
            time_secs: 0.0,
            sessions: 0,
        });
        entry.clicks += clicks;
        entry.time_secs += time_secs;
        entry.sessions += sessions;

        if sessions == 1 && longest_run.as_ref().is_none_or(|r| time_secs > r.time_secs) {
            longest_run = Some(RunHighlight {
                clicks,
                time_secs,
                started_at,
            });
        }
    }
    drop(rows);
    drop(stmt);

    let (legacy_runs, legacy_clicks): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(clicks), 0) FROM runs WHERE started_at = 0",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let tracked_days: Vec<NaiveDate> = days.keys().copied().collect();
    let (current_streak_days, longest_streak_days, clicked_today) =
        streak_summary(&tracked_days, today);
    let clicks_per_sec = if totals.total_time_secs > 0.0 {
        round2(totals.total_clicks as f64 / totals.total_time_secs)
    } else {
        -1.0
    };

    Ok(StatsOverview {
        totals,
        clicks_per_sec,
        active_days: tracked_days.len() as i64,
        legacy_runs,
        legacy_clicks,
        longest_run,
        current_streak_days,
        longest_streak_days,
        clicked_today,
        daily: days.into_values().collect(),
    })
}

pub fn get_overview() -> AppResult<StatsOverview> {
    let conn = db()?.lock().unwrap_or_else(poisoned_inner);
    read_overview(&conn, Local::now().date_naive())
}

fn reset_runs(conn: &Connection) -> AppResult<CumulativeStats> {
    conn.execute("DELETE FROM runs", [])?;
    Ok(CumulativeStats {
        total_clicks: 0,
        total_time_secs: 0.0,
        total_sessions: 0,
        avg_cpu: -1.0,
    })
}

pub fn reset_stats() -> AppResult<CumulativeStats> {
    let conn = db()?.lock().unwrap_or_else(poisoned_inner);
    reset_runs(&conn)
}

pub fn print_run_stats(click_count: i64, elapsed_secs: f64, avg_cpu: f64) {
    let cpu = if avg_cpu >= 0.0 {
        format!("{avg_cpu:.1}% cpu")
    } else {
        String::from("cpu n/a")
    };
    log::info!(
        "run ended · {} clicks · {:.1}s · {}",
        click_count,
        elapsed_secs,
        cpu
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_conn() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        MIGRATIONS.to_latest(&mut conn).expect("run migrations");
        conn
    }

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").expect("valid date")
    }

    #[test]
    fn streak_summary_counts_consecutive_days() {
        let today = day("2026-10-12");
        let days = vec![
            day("2026-10-08"),
            day("2026-10-09"),
            day("2026-10-11"),
            day("2026-10-12"),
        ];
        assert_eq!(streak_summary(&days, today), (2, 2, true));
    }

    #[test]
    fn streak_survives_until_the_day_ends() {
        let today = day("2026-10-12");
        let days = vec![day("2026-10-10"), day("2026-10-11")];
        assert_eq!(streak_summary(&days, today), (2, 2, false));
    }

    #[test]
    fn a_gap_breaks_the_current_streak() {
        let today = day("2026-10-12");
        let days = vec![day("2026-10-01"), day("2026-10-02"), day("2026-10-03")];
        assert_eq!(streak_summary(&days, today), (0, 3, false));
    }

    #[test]
    fn empty_history_has_no_streak() {
        assert_eq!(streak_summary(&[], day("2026-10-12")), (0, 0, false));
    }

    #[test]
    fn overview_skips_legacy_rows_for_charts_and_records() {
        let conn = temp_conn();
        conn.execute(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (2891660, 190439.48, 2.29, 2080, 0)",
            [],
        )
        .expect("legacy row");
        insert_run(&conn, 300, 30.0, 1.0, 1_760_000_000).expect("long run");
        insert_run(&conn, 100, 10.0, 1.0, 1_760_003_600).expect("short run");

        let overview = read_overview(&conn, day("2026-10-12")).expect("overview");

        assert_eq!(overview.totals.total_clicks, 2_892_060);
        assert_eq!(
            overview.daily.iter().map(|d| d.clicks).sum::<i64>(),
            400,
            "legacy rows must not leak into the daily series"
        );
        assert_eq!(overview.active_days, overview.daily.len() as i64);
        assert_eq!(overview.longest_run.as_ref().map(|r| r.clicks), Some(300));
        assert_eq!(overview.clicks_per_sec, 15.18);
    }

    #[test]
    fn run_is_bucketed_to_the_day_it_started() {
        assert_eq!(run_started_at(1_760_000_000, 5400.0), 1_759_994_600);
        assert_eq!(run_started_at(1_760_000_000, -30.0), 1_760_000_000);
        assert_eq!(run_started_at(1_760_000_000, f64::NAN), 1_760_000_000);

        let finished = Local
            .with_ymd_and_hms(2026, 3, 15, 1, 0, 0)
            .single()
            .expect("local 01:00 exists");
        let conn = temp_conn();
        let started_at = record_run_ending_at(&conn, finished.timestamp(), 1200, 5400.0, 1.0)
            .expect("crossing run");

        assert_eq!(started_at, finished.timestamp() - 5400);
        let stored: i64 = conn
            .query_row("SELECT started_at FROM runs", [], |row| row.get(0))
            .expect("stored start stamp");
        assert_eq!(stored, finished.timestamp() - 5400);

        let overview = read_overview(&conn, day("2026-03-15")).expect("overview");

        assert_eq!(overview.daily.len(), 1);
        assert_eq!(overview.daily[0].day, "2026-03-14");
        assert_eq!(overview.daily[0].clicks, 1200);
        assert_eq!(
            overview.longest_run.as_ref().map(|run| run.started_at),
            Some(started_at)
        );
    }

    #[test]
    fn overview_without_timed_runs_stays_empty() {
        let conn = temp_conn();
        conn.execute(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (1000, 100.0, 1.0, 1, 0)",
            [],
        )
        .expect("legacy row");

        let overview = read_overview(&conn, day("2026-10-12")).expect("overview");

        assert_eq!(overview.active_days, 0);
        assert!(overview.daily.is_empty());
        assert!(overview.longest_run.is_none());
        assert_eq!(overview.totals.total_clicks, 1000);
        assert_eq!(overview.legacy_runs, 1);
        assert_eq!(overview.legacy_clicks, 1000);
    }

    #[test]
    fn migrations_apply_to_fresh_database() {
        let conn = temp_conn();

        let mut columns_stmt = conn.prepare("PRAGMA table_info(runs)").expect("table_info");
        let columns: Vec<String> = columns_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("column rows")
            .collect::<Result<Vec<String>, _>>()
            .expect("column names");
        assert_eq!(
            columns,
            vec![
                "id",
                "clicks",
                "time_secs",
                "avg_cpu",
                "sessions",
                "started_at"
            ]
        );

        let mut indexes_stmt = conn.prepare("PRAGMA index_list(runs)").expect("index_list");
        let indexes: Vec<String> = indexes_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("index rows")
            .collect::<Result<Vec<String>, _>>()
            .expect("index names");
        assert!(
            indexes.iter().any(|name| name == "idx_runs_started_at"),
            "missing idx_runs_started_at, found {indexes:?}"
        );
    }

    #[test]
    fn sessions_are_summed_not_counted() {
        let conn = temp_conn();
        conn.execute(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (2891660, 190439.48, 2.29, 2080, 0)",
            [],
        )
        .expect("blob row");
        insert_run(&conn, 330, 4.77, 0.88, 1_760_000_000).expect("live row");

        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.total_clicks, 2_891_990);
        assert_eq!(stats.total_sessions, 2081);
    }

    #[test]
    fn cpu_average_is_weighted_by_sessions() {
        let conn = temp_conn();
        conn.execute(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (1000, 100.0, 2.0, 100, 0)",
            [],
        )
        .expect("blob row");
        insert_run(&conn, 10, 1.0, 3.0, 1_760_000_000).expect("live row");

        let stats = read_stats(&conn).expect("stats");
        // (2.0 * 100 + 3.0 * 1) / 101 = 2.0099..., not the naive 2.5
        assert_eq!(stats.avg_cpu, 2.01);
    }

    #[test]
    fn unknown_cpu_is_ignored_in_average() {
        let conn = temp_conn();
        conn.execute(
            "INSERT INTO runs (clicks, time_secs, avg_cpu, sessions, started_at)
             VALUES (100, 10.0, NULL, 1, 0)",
            [],
        )
        .expect("null cpu row");
        insert_run(&conn, 10, 1.0, 4.0, 1_760_000_000).expect("live row");

        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.avg_cpu, 4.0);
    }

    #[test]
    fn empty_database_reports_unknown_cpu() {
        let conn = temp_conn();
        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.total_clicks, 0);
        assert_eq!(stats.total_sessions, 0);
        assert_eq!(stats.avg_cpu, -1.0);
    }

    #[test]
    fn negative_cpu_is_stored_as_null() {
        let conn = temp_conn();
        insert_run(&conn, 10, 1.0, -1.0, 1_760_000_000).expect("row");
        let stored: Option<f64> = conn
            .query_row("SELECT avg_cpu FROM runs", [], |row| row.get(0))
            .expect("read cpu");
        assert_eq!(stored, None);
    }

    #[test]
    fn reset_clears_every_row() {
        let conn = temp_conn();
        insert_run(&conn, 100, 10.0, 1.0, 1_760_000_000).expect("row");
        insert_run(&conn, 200, 20.0, 2.0, 1_760_003_600).expect("row");
        insert_run(&conn, 300, 30.0, 3.0, 1_760_007_200).expect("row");

        let seeded: i64 = conn
            .query_row("SELECT COUNT(*) FROM runs", [], |row| row.get(0))
            .expect("count seeded");
        assert_eq!(seeded, 3);

        let stats = reset_runs(&conn).expect("reset");
        assert_eq!(stats.total_clicks, 0);
        assert_eq!(stats.total_time_secs, 0.0);
        assert_eq!(stats.total_sessions, 0);
        assert_eq!(stats.avg_cpu, -1.0);

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM runs", [], |row| row.get(0))
            .expect("count after reset");
        assert_eq!(remaining, 0);
    }

    #[test]
    fn open_db_creates_the_database_file_under_the_given_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nested").join("stats.db");

        let conn = open_db(&path).expect("open db");
        let columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('runs')",
                [],
                |row| row.get(0),
            )
            .expect("runs table exists");
        drop(conn);

        assert_eq!(columns, 6);
        assert!(path.exists(), "stats db not created at {}", path.display());
    }

    #[test]
    fn csv_import_maps_legacy_rows() {
        let conn = temp_conn();
        let dir = tempfile::tempdir().expect("tempdir");
        let csv = dir.path().join("stats.csv");
        fs::write(
            &csv,
            "# legacy stats\nid,clicks,time_secs,avg_cpu,runs\n\
             1,2891660,190439.48,2.29,2080\n\
             2,330,4.77,0.88,1\n\
             3,610,8.01,-1.0,1\n\
             not,a,valid,row,here\n",
        )
        .expect("write csv");

        import_legacy_csv(&conn, &csv).expect("import");

        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.total_clicks, 2_892_600);
        assert_eq!(stats.total_sessions, 2082);
        assert!((stats.total_time_secs - 190_452.26).abs() < 1e-6);

        let legacy_stamps: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM runs WHERE started_at = 0",
                [],
                |row| row.get(0),
            )
            .expect("count legacy");
        assert_eq!(legacy_stamps, 3);

        let null_cpu: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM runs WHERE avg_cpu IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("count null cpu");
        assert_eq!(null_cpu, 1);

        assert!(!csv.exists(), "original csv should be renamed");
        assert!(dir.path().join("stats.csv.migrated").exists());
    }

    #[test]
    fn csv_import_skips_when_rows_exist() {
        let conn = temp_conn();
        insert_run(&conn, 10, 1.0, 1.0, 1_760_000_000).expect("row");

        let dir = tempfile::tempdir().expect("tempdir");
        let csv = dir.path().join("stats.csv");
        fs::write(&csv, "id,clicks,time_secs,avg_cpu,runs\n9,9,9.0,9.0,9\n").expect("write csv");

        import_legacy_csv(&conn, &csv).expect("import");

        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.total_clicks, 10);
        assert!(csv.exists(), "csv should be left alone when db has rows");
    }
}
