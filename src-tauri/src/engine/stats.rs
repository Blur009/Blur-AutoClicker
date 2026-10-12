use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

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

pub fn record_run(click_count: i64, elapsed_secs: f64, avg_cpu: f64) {
    let result = (|| -> AppResult<()> {
        let conn = db()?.lock().unwrap_or_else(poisoned_inner);
        insert_run(
            &conn,
            click_count,
            elapsed_secs,
            avg_cpu,
            chrono::Utc::now().timestamp(),
        )
    })();
    if let Err(e) = result {
        log::error!("[stats] Failed to record run: {e}");
    }
}

pub fn get_stats() -> AppResult<CumulativeStats> {
    let conn = db()?.lock().unwrap_or_else(poisoned_inner);
    read_stats(&conn)
}

pub fn reset_stats() -> AppResult<CumulativeStats> {
    let conn = db()?.lock().unwrap_or_else(poisoned_inner);
    conn.execute("DELETE FROM runs", [])?;
    Ok(CumulativeStats {
        total_clicks: 0,
        total_time_secs: 0.0,
        total_sessions: 0,
        avg_cpu: -1.0,
    })
}

pub fn print_run_stats(click_count: i64, elapsed_secs: f64, avg_cpu: f64) {
    log::info!("=== Run Statistics ===");
    log::info!("Clicks: {}", click_count);
    log::info!("Duration: {:.1}s", elapsed_secs);
    if avg_cpu >= 0.0 {
        log::info!("Avg CPU: {:.1}%", avg_cpu);
    } else {
        log::info!("Avg CPU: N/A");
    }
    log::info!("======================");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_conn() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        MIGRATIONS.to_latest(&mut conn).expect("run migrations");
        conn
    }

    #[test]
    fn migrations_apply_to_fresh_database() {
        let conn = temp_conn();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM runs", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 0);
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
        insert_run(&conn, 10, 1.0, 1.0, 1_760_000_000).expect("row");
        conn.execute("DELETE FROM runs", []).expect("delete");
        let stats = read_stats(&conn).expect("stats");
        assert_eq!(stats.total_clicks, 0);
        assert_eq!(stats.avg_cpu, -1.0);
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
