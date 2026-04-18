use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

static STATS_LOCK: Mutex<()> = Mutex::new(());

const MAX_NORMAL_RUNS: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeStats {
    pub total_clicks: i64,
    pub total_time_secs: f64,
    pub total_sessions: i64,
    pub avg_cpu: f64,
}

#[derive(Debug, Clone)]
pub struct RunRecord {
    pub id: u64,
    pub clicks: i64,
    pub time_secs: f64,
    pub avg_cpu: f64,
    pub runs: u32,
}

fn stats_file_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data)
        .join("BlurAutoClicker")
        .join("stats.csv")
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// -- CSV read/write --

fn read_all_runs() -> Result<Vec<RunRecord>, String> {
    let path = stats_file_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read stats file: {}", e))?;

    let mut runs = Vec::new();

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 5 {
            continue;
        }
        if parts[0] == "id" {
            continue;
        }

        let id = parts[0].parse::<u64>().unwrap_or(0);
        let clicks = parts[1].parse::<i64>().unwrap_or(0);
        let time_secs = parts[2].parse::<f64>().unwrap_or(0.0);
        let avg_cpu = parts[3].parse::<f64>().unwrap_or(-1.0);
        let run_count = parts
            .get(4)
            .map(|s| s.trim().parse::<u32>().unwrap_or(1))
            .unwrap_or(1);

        let record = RunRecord {
            id,
            clicks,
            time_secs,
            avg_cpu,
            runs: run_count,
        };

        runs.push(record);
    }

    Ok(runs)
}

fn write_all_runs(runs: &[RunRecord]) -> Result<(), String> {
    let path = stats_file_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create stats dir: {}", e))?;
    }

    let mut file =
        fs::File::create(&path).map_err(|e| format!("Failed to open stats file: {}", e))?;

    writeln!(file, "id,clicks,time_secs,avg_cpu,runs")
        .map_err(|e| format!("Failed to write header: {}", e))?;

    for r in runs {
        writeln!(
            file,
            "{},{},{},{},{}",
            r.id, r.clicks, r.time_secs, r.avg_cpu, r.runs
        )
        .map_err(|e| format!("Failed to write run: {}", e))?;
    }

    Ok(())
}

fn next_id(runs: &[RunRecord]) -> u64 {
    runs.iter().map(|r| r.id).max().unwrap_or(0) + 1
}

// -- Compaction --

fn compact_runs(runs: &mut Vec<RunRecord>) {
    if runs.len() < MAX_NORMAL_RUNS {
        return;
    }
    let compact_count = MAX_NORMAL_RUNS.min(runs.len());
    let to_compact: Vec<usize> = (0..compact_count).collect();

    let total_clicks: i64 = to_compact.iter().map(|&i| runs[i].clicks).sum();
    let total_time: f64 = round2(to_compact.iter().map(|&i| runs[i].time_secs).sum::<f64>());
    let total_sessions_u64: u64 = to_compact.iter().map(|&i| runs[i].runs as u64).sum();
    let total_sessions: u32 = total_sessions_u64.min(u32::MAX as u64) as u32;

    let valid_cpu: Vec<(f64, u32)> = to_compact
        .iter()
        .copied()
        .filter(|&i| runs[i].avg_cpu >= 0.0)
        .map(|i| (runs[i].avg_cpu, runs[i].runs))
        .collect();
    let avg_cpu = if valid_cpu.is_empty() {
        -1.0
    } else {
        let weighted_sum: f64 = valid_cpu
            .iter()
            .map(|(cpu, count)| cpu * *count as f64)
            .sum();
        let weight: u64 = valid_cpu.iter().map(|(_, count)| *count as u64).sum();
        round2(weighted_sum / weight as f64)
    };

    let mut remove_set: Vec<usize> = to_compact;
    remove_set.sort_unstable_by(|a, b| b.cmp(a));
    for &i in &remove_set {
        runs.remove(i);
    }

    let new_id = next_id(runs);
    let compacted = RunRecord {
        id: new_id,
        clicks: total_clicks,
        time_secs: total_time,
        avg_cpu,
        runs: total_sessions,
    };

    runs.insert(0, compacted);
}

pub fn record_run(click_count: i64, elapsed_secs: f64, avg_cpu: f64) {
    let _lock = STATS_LOCK.lock().unwrap();

    let mut runs = match read_all_runs() {
        Ok(r) => r,
        Err(e) => {
            log::error!("[stats] Failed to read runs: {}", e);
            return;
        }
    };

    let record = RunRecord {
        id: next_id(&runs),
        clicks: click_count,
        time_secs: round2(elapsed_secs),
        avg_cpu: if avg_cpu < 0.0 { -1.0 } else { round2(avg_cpu) },
        runs: 1,
    };

    runs.push(record);
    compact_runs(&mut runs);

    if let Err(e) = write_all_runs(&runs) {
        log::error!("[stats] Failed to save runs: {}", e);
    }
}

pub fn get_stats() -> Result<CumulativeStats, String> {
    let _lock = STATS_LOCK.lock().unwrap();

    let runs = read_all_runs()?;

    let total_clicks: i64 = runs.iter().map(|r| r.clicks).sum();
    let total_time_secs: f64 = runs.iter().map(|r| r.time_secs).sum();
    let total_sessions: u64 = runs.iter().map(|r| r.runs as u64).sum();

    let weighted_sum: f64 = runs
        .iter()
        .filter(|r| r.avg_cpu >= 0.0)
        .map(|r| r.avg_cpu * r.runs as f64)
        .sum();
    let weighted_count: u64 = runs
        .iter()
        .filter(|r| r.avg_cpu >= 0.0)
        .map(|r| r.runs as u64)
        .sum();
    let avg_cpu = if weighted_count == 0 {
        -1.0
    } else {
        round2(weighted_sum / weighted_count as f64)
    };

    Ok(CumulativeStats {
        total_clicks,
        total_time_secs,
        total_sessions: total_sessions as i64,
        avg_cpu,
    })
}

pub fn reset_stats() -> Result<CumulativeStats, String> {
    let _lock = STATS_LOCK.lock().unwrap();
    let path = stats_file_path();

    if path.exists() {
        let _ = fs::write(&path, "");
    }

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
}
