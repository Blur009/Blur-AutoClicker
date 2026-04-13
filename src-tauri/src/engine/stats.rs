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
    pub sent: bool,
    pub runs: u32,
    pub telemetry_enabled: bool,
    pub hash: String,
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

// -- Row hashing (HMAC-SHA256) --

fn get_signing_key() -> &'static str {
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/.tauri/StatsKey.py"))
}

fn parse_key() -> Vec<u8> {
    let raw = get_signing_key();
    for line in raw.lines() {
        let line: &str = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let lower = line.to_lowercase();
        if lower.contains("key") && line.contains('=') {
            if let Some(val) = line.split('=').nth(1) {
                let val: &str = val.trim().trim_matches('"').trim_matches('\'').trim();
                if !val.is_empty() {
                    return val.as_bytes().to_vec();
                }
            }
        }
    }
    b"fallback-key-do-not-use".to_vec()
}

fn compute_hmac(record: &RunRecord, key: &[u8]) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let data = format!(
        "{}|{}|{}|{}|{}|{}|{}",
        record.id,
        record.clicks,
        record.time_secs,
        record.avg_cpu,
        record.sent,
        record.runs,
        record.telemetry_enabled
    );

    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

fn verify_hash(record: &RunRecord, key: &[u8]) -> bool {
    compute_hmac(record, key) == record.hash
}

// -- CSV read/write --

fn read_all_runs() -> Result<Vec<RunRecord>, String> {
    let path = stats_file_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read stats file: {}", e))?;

    let key = parse_key();
    let mut runs = Vec::new();
    let mut invalid_indices: Vec<usize> = Vec::new();

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
        let sent = parts.get(4).map(|s| s.trim() == "1").unwrap_or(false);
        let run_count = parts
            .get(5)
            .map(|s| s.trim().parse::<u32>().unwrap_or(1))
            .unwrap_or(1);
        let telemetry_enabled = parts.get(6).map(|s| s.trim() == "1").unwrap_or(false);

        // Backwards compatible: old rows without hash column get a new one
        let hash = if let Some(h) = parts.get(7) {
            h.trim().to_string()
        } else {
            let temp = RunRecord {
                id,
                clicks,
                time_secs,
                avg_cpu,
                sent,
                runs: run_count,
                telemetry_enabled,
                hash: String::new(),
            };
            compute_hmac(&temp, &key)
        };

        let record = RunRecord {
            id,
            clicks,
            time_secs,
            avg_cpu,
            sent,
            runs: run_count,
            telemetry_enabled,
            hash,
        };

        if !verify_hash(&record, &key) {
            invalid_indices.push(runs.len());
            log::error!(
                "[stats] Invalid hash on row id={}, marking for removal",
                record.id
            );
        }

        runs.push(record);
    }

    // Remove invalid rows and rewrite the file
    if !invalid_indices.is_empty() {
        log::error!(
            "[stats] Found {} rows with invalid hashes, removing them",
            invalid_indices.len()
        );
        let valid_runs: Vec<RunRecord> = runs
            .into_iter()
            .enumerate()
            .filter(|(i, _)| !invalid_indices.contains(i))
            .map(|(_, r)| r)
            .collect();
        if let Err(e) = write_all_runs(&valid_runs) {
            log::error!(
                "[stats] Failed to rewrite file after removing invalid rows: {}",
                e
            );
        }
        return Ok(valid_runs);
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

    writeln!(
        file,
        "id,clicks,time_secs,avg_cpu,sent,runs,telemetry_enabled,hash"
    )
    .map_err(|e| format!("Failed to write header: {}", e))?;

    for r in runs {
        writeln!(
            file,
            "{},{},{},{},{},{},{},{}",
            r.id,
            r.clicks,
            r.time_secs,
            r.avg_cpu,
            if r.sent { 1 } else { 0 },
            r.runs,
            if r.telemetry_enabled { 1 } else { 0 },
            r.hash
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
    let mut unsent_indices: Vec<usize> = Vec::new();
    let mut sent_indices: Vec<usize> = Vec::new();

    for (i, r) in runs.iter().enumerate() {
        if r.runs != 1 {
            continue;
        }
        if r.sent {
            sent_indices.push(i);
        } else {
            unsent_indices.push(i);
        }
    }

    let to_compact = if unsent_indices.len() >= MAX_NORMAL_RUNS {
        &unsent_indices[..MAX_NORMAL_RUNS]
    } else if sent_indices.len() >= MAX_NORMAL_RUNS {
        &sent_indices[..MAX_NORMAL_RUNS]
    } else {
        return;
    };

    let total_clicks: i64 = to_compact.iter().map(|&i| runs[i].clicks).sum();
    let total_time: f64 = round2(to_compact.iter().map(|&i| runs[i].time_secs).sum::<f64>());
    let total_sessions: u32 = to_compact.len() as u32;

    let valid_cpu: Vec<usize> = to_compact
        .iter()
        .copied()
        .filter(|&i| runs[i].avg_cpu >= 0.0)
        .collect();
    let avg_cpu = if valid_cpu.is_empty() {
        -1.0
    } else {
        round2(valid_cpu.iter().map(|&i| runs[i].avg_cpu).sum::<f64>() / valid_cpu.len() as f64)
    };

    let sent = runs[to_compact[0]].sent;
    let telemetry_enabled = runs[to_compact[0]].telemetry_enabled;
    let all_same_telemetry = to_compact
        .iter()
        .all(|&i| runs[i].telemetry_enabled == telemetry_enabled);

    let mut remove_set: Vec<usize> = to_compact.to_vec();
    remove_set.sort_unstable_by(|a, b| b.cmp(a));
    for &i in &remove_set {
        runs.remove(i);
    }

    let key = parse_key();
    let new_id = next_id(runs);
    let compacted = RunRecord {
        id: new_id,
        clicks: total_clicks,
        time_secs: total_time,
        avg_cpu,
        sent,
        runs: total_sessions,
        telemetry_enabled: all_same_telemetry,
        hash: String::new(),
    };
    let hash = compute_hmac(&compacted, &key);

    runs.insert(0, RunRecord { hash, ..compacted });
}

// -- Public API --

pub fn record_run(click_count: i64, elapsed_secs: f64, avg_cpu: f64, telemetry_enabled: bool) {
    let _lock = STATS_LOCK.lock().unwrap();

    let mut runs = match read_all_runs() {
        Ok(r) => r,
        Err(e) => {
            log::error!("[stats] Failed to read runs: {}", e);
            return;
        }
    };

    let key = parse_key();

    let record = RunRecord {
        id: next_id(&runs),
        clicks: click_count,
        time_secs: round2(elapsed_secs),
        avg_cpu: if avg_cpu < 0.0 { -1.0 } else { round2(avg_cpu) },
        sent: false,
        runs: 1,
        telemetry_enabled,
        hash: String::new(),
    };
    let hash = compute_hmac(&record, &key);

    runs.push(RunRecord { hash, ..record });
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
    log::info!("╔══════════════════════════════════════╗");
    log::info!("║          RUN STATISTICS              ║");
    log::info!("╠══════════════════════════════════════╣");
    log::info!("║  Clicks:  {:>20}       ║", click_count);
    log::info!("║  Duration:   {:>17.1}s      ║", elapsed_secs);
    if avg_cpu >= 0.0 {
        log::info!("║  Avg CPU:    {:>17.1}%      ║", avg_cpu);
    } else {
        log::info!("║  Avg CPU:    {:>20}      ║", "N/A");
    }
    log::info!("╚══════════════════════════════════════╝");
}

pub fn get_unsent_runs() -> Vec<RunRecord> {
    let _lock = STATS_LOCK.lock().unwrap();

    match read_all_runs() {
        Ok(runs) => runs
            .into_iter()
            .filter(|r| !r.sent && r.telemetry_enabled)
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn mark_runs_sent(ids: &[u64]) -> Result<(), String> {
    let _lock = STATS_LOCK.lock().unwrap();

    let mut runs = read_all_runs()?;
    let key = parse_key();

    for run in &mut runs {
        if ids.contains(&run.id) {
            run.sent = true;
            run.hash = compute_hmac(run, &key);
        }
    }
    write_all_runs(&runs)
}
