use tauri::AppHandle;

#[cfg(target_os = "windows")]
type TrimMaps = Option<(
    std::collections::HashMap<u32, Vec<u32>>,
    std::collections::HashMap<u32, bool>,
)>;

#[cfg(target_os = "windows")]
static TRIM_MAPS: std::sync::Mutex<TrimMaps> = std::sync::Mutex::new(None);

#[cfg(target_os = "windows")]
fn trim_webview_processes() {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    use windows_sys::Win32::System::Threading::*;

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry) == 0 {
            CloseHandle(snapshot);
            return;
        }

        let target: Vec<u16> = std::ffi::OsStr::new("msedgewebview2.exe")
            .encode_wide()
            .collect();
        let our_pid = std::process::id();

        let mut maps = TRIM_MAPS.lock().unwrap_or_else(|e| e.into_inner());
        let (children_of, is_webview2) = maps.get_or_insert_with(Default::default);
        children_of.clear();
        is_webview2.clear();

        loop {
            let name_end = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            let is_target = name_end == target.len() && entry.szExeFile[..name_end] == target[..];
            is_webview2.insert(entry.th32ProcessID, is_target);
            children_of
                .entry(entry.th32ParentProcessID)
                .or_default()
                .push(entry.th32ProcessID);

            if Process32NextW(snapshot, &mut entry) == 0 {
                break;
            }
        }

        CloseHandle(snapshot);

        let mut descendant_pids: Vec<u32> = Vec::new();
        let mut visited: std::collections::HashSet<u32> =
            std::collections::HashSet::from([our_pid]);
        let mut queue: Vec<u32> = vec![our_pid];
        while let Some(pid) = queue.pop() {
            if let Some(children) = children_of.get(&pid) {
                for &child in children {
                    if visited.insert(child) {
                        descendant_pids.push(child);
                        queue.push(child);
                    }
                }
            }
        }

        for &pid in &descendant_pids {
            if *is_webview2.get(&pid).unwrap_or(&false) {
                let process = OpenProcess(PROCESS_SET_QUOTA, 0, pid);
                if !process.is_null() {
                    SetProcessWorkingSetSize(process, usize::MAX, usize::MAX);
                    CloseHandle(process);
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn trim_webview_processes() {}

pub fn start_periodic_trimming(interval_secs: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        while crate::overlay::OVERLAY_THREAD_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_secs(interval_secs));
            trim_webview_processes();
        }
    });
}

pub fn on_hide(app: &AppHandle) {
    crate::theme_window::close_if_open(app);
    trim_webview_processes();
}

pub fn on_show(_app: &AppHandle) {}
