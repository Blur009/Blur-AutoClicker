use super::ClickerConfig;
use std::collections::{HashMap, VecDeque};
use std::io::Cursor;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use crate::error::poisoned_inner;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_INSUFFICIENT_BUFFER, HWND, INVALID_HANDLE_VALUE, LPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetObjectW, SelectObject, BITMAP,
    BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::OpenProcess;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU, VK_TAB};
use windows_sys::Win32::UI::Shell::ExtractIconExW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, DrawIconEx, EnumWindows, GetClassNameW, GetForegroundWindow, GetIconInfo,
    GetWindowTextW, GetWindowThreadProcessId, ICONINFO,
};

use image::ImageEncoder;

const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const DI_NORMAL: u32 = 0x0003;
const PROCESS_DISPLAY_TITLE_MAX_CHARS: usize = 35;
const PROCESS_PATH_INITIAL_CHARS: usize = 260;
const PROCESS_PATH_MAX_CHARS: usize = 32768;
const ICON_CACHE_MAX_ENTRIES: usize = 128;
const FOREGROUND_CACHE_TTL: Duration = Duration::from_millis(1000);
const FOREGROUND_UNKNOWN_GRACE: Duration = Duration::from_millis(250);

extern "system" {
    fn QueryFullProcessImageNameW(
        hProcess: *mut std::ffi::c_void,
        dwFlags: u32,
        lpExeName: *mut u16,
        lpdwSize: *mut u32,
    ) -> i32;
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub name: String,
    pub display_name: String,
    pub pid: u32,
    pub icon_base64: Option<String>,
}

#[derive(Default)]
struct IconCache {
    entries: HashMap<String, Option<String>>,
    order: VecDeque<String>,
}

impl IconCache {
    fn get(&self, exe_name: &str) -> Option<Option<String>> {
        self.entries.get(exe_name).cloned()
    }

    fn insert(&mut self, exe_name: &str, icon: Option<String>) {
        if self.entries.contains_key(exe_name) {
            self.entries.insert(exe_name.to_string(), icon);
            return;
        }
        while self.entries.len() >= ICON_CACHE_MAX_ENTRIES {
            let Some(oldest) = self.order.pop_front() else {
                break;
            };
            self.entries.remove(&oldest);
        }
        self.entries.insert(exe_name.to_string(), icon);
        self.order.push_back(exe_name.to_string());
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.entries.len()
    }
}

fn icon_cache() -> &'static Mutex<IconCache> {
    static CACHE: OnceLock<Mutex<IconCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(IconCache::default()))
}

fn next_path_buffer_size(current: usize) -> Option<usize> {
    if current >= PROCESS_PATH_MAX_CHARS {
        return None;
    }
    Some(current.saturating_mul(2).min(PROCESS_PATH_MAX_CHARS))
}

fn query_process_image_path(process: *mut std::ffi::c_void) -> Option<String> {
    let mut capacity = PROCESS_PATH_INITIAL_CHARS;
    loop {
        let mut buffer = vec![0u16; capacity];
        let mut size = capacity as u32;
        let result =
            unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size) };
        if result != 0 {
            buffer.truncate(size as usize);
            return Some(String::from_utf16_lossy(&buffer));
        }
        let last_error = std::io::Error::last_os_error().raw_os_error();
        if last_error != Some(ERROR_INSUFFICIENT_BUFFER as i32) {
            return None;
        }
        capacity = next_path_buffer_size(capacity)?;
    }
}

fn get_process_exe_path(pid: u32) -> Option<String> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let path = query_process_image_path(process);
        CloseHandle(process);
        path
    }
}

fn exe_name_from_path(path: &str) -> Option<String> {
    path.rsplit(['\\', '/'])
        .next()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
}

fn encode_base64(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn extract_icon_pixels(exe_path: &str) -> Option<(Vec<u8>, u32, u32)> {
    unsafe {
        let wide: Vec<u16> = exe_path.encode_utf16().chain(Some(0)).collect();
        let mut hicon: *mut std::ffi::c_void = std::ptr::null_mut();
        let count = ExtractIconExW(wide.as_ptr(), 0, std::ptr::null_mut(), &mut hicon, 1);
        if count == 0 || hicon.is_null() {
            return None;
        }
        let mut ii: ICONINFO = std::mem::zeroed();
        if GetIconInfo(hicon, &mut ii) == 0 {
            DestroyIcon(hicon);
            return None;
        }
        let mut bm: BITMAP = std::mem::zeroed();
        GetObjectW(
            ii.hbmColor,
            std::mem::size_of::<BITMAP>() as i32,
            &mut bm as *mut _ as *mut _,
        );
        let w = bm.bmWidth as u32;
        let h = bm.bmHeight as u32;
        if w == 0 || h == 0 {
            DeleteObject(ii.hbmColor);
            DeleteObject(ii.hbmMask);
            DestroyIcon(hicon);
            return None;
        }
        let dc = CreateCompatibleDC(std::ptr::null_mut());
        if dc.is_null() {
            DeleteObject(ii.hbmColor);
            DeleteObject(ii.hbmMask);
            DestroyIcon(hicon);
            return None;
        }
        let mut header: BITMAPINFOHEADER = std::mem::zeroed();
        header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        header.biWidth = w as i32;
        header.biHeight = -(h as i32);
        header.biPlanes = 1;
        header.biBitCount = 32;
        header.biCompression = 0;
        let bmi = BITMAPINFO {
            bmiHeader: header,
            bmiColors: [std::mem::zeroed()],
        };
        let mut pixels: *mut u8 = std::ptr::null_mut();
        let dib = CreateDIBSection(
            dc,
            &bmi as *const _,
            DIB_RGB_COLORS,
            &mut pixels as *mut *mut u8 as *mut *mut std::ffi::c_void,
            std::ptr::null_mut(),
            0,
        );
        if dib.is_null() || pixels.is_null() {
            DeleteDC(dc);
            DeleteObject(ii.hbmColor);
            DeleteObject(ii.hbmMask);
            DestroyIcon(hicon);
            return None;
        }
        let old = SelectObject(dc, dib);
        DrawIconEx(
            dc,
            0,
            0,
            hicon,
            w as i32,
            h as i32,
            0,
            std::ptr::null_mut(),
            DI_NORMAL,
        );
        SelectObject(dc, old);
        let size = (w * h * 4) as usize;
        let mut buf = Vec::with_capacity(size);
        std::ptr::copy_nonoverlapping(pixels, buf.as_mut_ptr(), size);
        buf.set_len(size);
        DeleteObject(dib);
        DeleteDC(dc);
        DeleteObject(ii.hbmColor);
        DeleteObject(ii.hbmMask);
        DestroyIcon(hicon);
        Some((buf, w, h))
    }
}

fn extract_process_icon_base64(exe_path: &str) -> Option<String> {
    let (pixels, w, h) = extract_icon_pixels(exe_path)?;
    let mut rgba = pixels;
    for chunk in rgba.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }
    let mut png_bytes = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(Cursor::new(&mut png_bytes));
    encoder
        .write_image(&rgba, w, h, image::ColorType::Rgba8.into())
        .ok()?;
    let b64 = encode_base64(&png_bytes);
    Some(format!("data:image/png;base64,{}", b64))
}

fn get_icon_for_process(exe_name: &str, pid: u32) -> Option<String> {
    {
        let cache = icon_cache().lock().unwrap_or_else(poisoned_inner);
        if let Some(cached) = cache.get(exe_name) {
            return cached;
        }
    }
    let icon = get_process_exe_path(pid).and_then(|path| extract_process_icon_base64(&path));
    let mut cache = icon_cache().lock().unwrap_or_else(poisoned_inner);
    cache.insert(exe_name, icon.clone());
    icon
}

pub fn normalize_process_name(name: &str) -> String {
    let name = name.trim().to_lowercase();
    if name.ends_with(".exe") {
        name
    } else {
        format!("{}.exe", name)
    }
}

fn wide_array_to_string(wide: &[u16]) -> String {
    let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..len])
}

fn get_process_name_via_snapshot(target_pid: u32) -> Option<String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return None;
    }
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut result = None;
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            if entry.th32ProcessID == target_pid {
                result = Some(wide_array_to_string(&entry.szExeFile));
                break;
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }
    unsafe { CloseHandle(snapshot) };
    result
}

struct BuildWindowMap {
    map: HashMap<u32, String>,
}

unsafe extern "system" fn enum_window_title_proc(hwnd: HWND, lparam: LPARAM) -> i32 {
    let state = unsafe { &mut *(lparam as *mut BuildWindowMap) };
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return 1;
    }
    if state.map.contains_key(&pid) {
        return 1;
    }
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if len > 0 {
        let title = String::from_utf16_lossy(&buffer[..len as usize]);
        let trimmed = title.trim().to_string();
        if !trimmed.is_empty() {
            state.map.insert(pid, trimmed);
        }
    }
    1
}

fn build_pid_title_map() -> HashMap<u32, String> {
    let mut state = BuildWindowMap {
        map: HashMap::new(),
    };
    unsafe {
        EnumWindows(Some(enum_window_title_proc), &mut state as *mut _ as isize);
    }
    state.map
}

fn truncate_title_for_display(title: &str) -> String {
    match title.char_indices().nth(PROCESS_DISPLAY_TITLE_MAX_CHARS) {
        Some((idx, _)) => title[..idx].to_string(),
        None => title.to_string(),
    }
}

fn get_process_name_from_pid(pid: u32) -> Option<String> {
    if let Some(name) = get_process_exe_path(pid).and_then(|path| exe_name_from_path(&path)) {
        return Some(name);
    }
    get_process_name_via_snapshot(pid)
}

struct ForegroundEntry {
    hwnd: usize,
    pid: u32,
    name: String,
    captured: Instant,
}

fn foreground_unknown_persists(unidentified_for: Duration) -> bool {
    unidentified_for >= FOREGROUND_UNKNOWN_GRACE
}

#[derive(Default)]
struct ForegroundCache {
    entry: Option<ForegroundEntry>,
    unidentified_since: Option<Instant>,
}

impl ForegroundCache {
    fn note_identified(&mut self) {
        self.unidentified_since = None;
    }

    fn note_unidentified(&mut self, now: Instant) -> bool {
        let since = *self.unidentified_since.get_or_insert(now);
        foreground_unknown_persists(now.saturating_duration_since(since))
    }

    fn get(&self, hwnd: usize, pid: u32, now: Instant) -> Option<String> {
        let entry = self.entry.as_ref()?;
        if entry.hwnd != hwnd || entry.pid != pid {
            return None;
        }
        if now.saturating_duration_since(entry.captured) >= FOREGROUND_CACHE_TTL {
            return None;
        }
        Some(entry.name.clone())
    }

    fn store(&mut self, hwnd: usize, pid: u32, name: &str, now: Instant) {
        self.entry = Some(ForegroundEntry {
            hwnd,
            pid,
            name: name.to_string(),
            captured: now,
        });
    }
}

fn foreground_cache() -> &'static Mutex<ForegroundCache> {
    static CACHE: OnceLock<Mutex<ForegroundCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(ForegroundCache::default()))
}

pub fn reset_foreground_unknown_grace() {
    foreground_cache()
        .lock()
        .unwrap_or_else(poisoned_inner)
        .note_identified();
}

pub fn get_foreground_process_name() -> Option<String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return None;
    }
    let now = Instant::now();
    let key = hwnd as usize;
    {
        let cache = foreground_cache().lock().unwrap_or_else(poisoned_inner);
        if let Some(name) = cache.get(key, pid, now) {
            return Some(name);
        }
    }
    let name = get_process_name_from_pid(pid)?;
    let mut cache = foreground_cache().lock().unwrap_or_else(poisoned_inner);
    cache.store(key, pid, &name, now);
    Some(name)
}

fn prefer_titled_pid(existing: u32, candidate: u32, has_title: impl Fn(u32) -> bool) -> u32 {
    if !has_title(existing) && has_title(candidate) {
        candidate
    } else {
        existing
    }
}

pub fn list_running_processes() -> Vec<ProcessInfo> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return vec![];
    }
    let pid_title_map = build_pid_title_map();
    let mut unique_processes: HashMap<String, u32> = HashMap::new();
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            let exe_name = wide_array_to_string(&entry.szExeFile);
            if !exe_name.is_empty() && exe_name.ends_with(".exe") {
                let lower_name = exe_name.to_lowercase();
                let pid = entry.th32ProcessID;
                unique_processes
                    .entry(lower_name)
                    .and_modify(|existing| {
                        *existing =
                            prefer_titled_pid(*existing, pid, |p| pid_title_map.contains_key(&p));
                    })
                    .or_insert(pid);
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }
    unsafe { CloseHandle(snapshot) };

    let mut result: Vec<ProcessInfo> = unique_processes
        .into_iter()
        .filter_map(|(name, pid)| {
            let window_title = pid_title_map.get(&pid)?;
            let display_name = truncate_title_for_display(window_title);
            let icon_base64 = get_icon_for_process(&name, pid);
            Some(ProcessInfo {
                name,
                display_name,
                pid,
                icon_base64,
            })
        })
        .collect();
    result.sort_by_cached_key(|p| p.display_name.to_lowercase());
    debug_assert!(result
        .windows(2)
        .all(|w| w[0].display_name.to_lowercase() <= w[1].display_name.to_lowercase()));
    result
}

pub const PROCESS_LIST_BLOCKED_REASON: &str = "Blocked by process list";
pub const PROCESS_LIST_UNKNOWN_REASON: &str =
    "Blocked by process list: foreground application could not be identified";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ForegroundMatch {
    Identified { is_in_list: bool },
    Unidentified,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProcessListVerdict {
    Allow,
    Blocked,
    Unidentified,
}

fn process_list_verdict(
    mode: super::ProcessListMode,
    foreground: ForegroundMatch,
) -> ProcessListVerdict {
    match (mode, foreground) {
        (super::ProcessListMode::Whitelist, ForegroundMatch::Identified { is_in_list: true }) => {
            ProcessListVerdict::Allow
        }
        (super::ProcessListMode::Whitelist, ForegroundMatch::Identified { is_in_list: false }) => {
            ProcessListVerdict::Blocked
        }
        (super::ProcessListMode::Whitelist, ForegroundMatch::Unidentified) => {
            ProcessListVerdict::Unidentified
        }
        (super::ProcessListMode::Blacklist, ForegroundMatch::Identified { is_in_list: true }) => {
            ProcessListVerdict::Blocked
        }
        (super::ProcessListMode::Blacklist, ForegroundMatch::Identified { is_in_list: false }) => {
            ProcessListVerdict::Allow
        }
        (super::ProcessListMode::Blacklist, ForegroundMatch::Unidentified) => {
            ProcessListVerdict::Allow
        }
    }
}

pub fn check_process_list(config: &ClickerConfig) -> Option<String> {
    if !config.process_list_enabled {
        return None;
    }
    let foreground = match get_foreground_process_name() {
        Some(name) => {
            foreground_cache()
                .lock()
                .unwrap_or_else(poisoned_inner)
                .note_identified();
            let current = name.to_lowercase();
            ForegroundMatch::Identified {
                is_in_list: config
                    .process_list_entries
                    .iter()
                    .any(|entry| entry.enabled && entry.name == current),
            }
        }
        None => ForegroundMatch::Unidentified,
    };
    match process_list_verdict(config.process_list_mode, foreground) {
        ProcessListVerdict::Allow => {
            foreground_cache()
                .lock()
                .unwrap_or_else(poisoned_inner)
                .note_identified();
            None
        }
        ProcessListVerdict::Blocked => Some(String::from(PROCESS_LIST_BLOCKED_REASON)),
        ProcessListVerdict::Unidentified => {
            let persists = foreground_cache()
                .lock()
                .unwrap_or_else(poisoned_inner)
                .note_unidentified(Instant::now());
            persists.then(|| String::from(PROCESS_LIST_UNKNOWN_REASON))
        }
    }
}

const TASK_SWITCHER_CLASSES: &[&str] =
    &["TaskSwitcherWnd", "TaskViewWindow", "WindowsSwitchWindow"];

pub fn is_task_switcher_active() -> bool {
    let hwnd = unsafe { GetForegroundWindow() };
    if !hwnd.is_null() {
        let mut buf = [0u16; 128];
        let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        if len > 0 {
            let class_name = String::from_utf16_lossy(&buf[..len as usize]);
            if TASK_SWITCHER_CLASSES
                .iter()
                .any(|&c| class_name == c || class_name.starts_with(c))
            {
                return true;
            }
            if class_name.contains("CoreWindow") {
                return true;
            }
        }
    }

    let alt_down = unsafe { (GetAsyncKeyState(VK_MENU as i32) as u16 & 0x8000) != 0 };
    let tab_down = unsafe { (GetAsyncKeyState(VK_TAB as i32) as u16 & 0x8000) != 0 };
    alt_down && tab_down
}

pub fn is_process_running(name: &str) -> bool {
    let target = normalize_process_name(name);
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return false;
    }
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut found = false;
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            let exe_name = wide_array_to_string(&entry.szExeFile);
            if !exe_name.is_empty() && exe_name.to_lowercase() == target {
                found = true;
                break;
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }
    unsafe { CloseHandle(snapshot) };
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_title_preserves_ascii_behavior() {
        let title = "a".repeat(PROCESS_DISPLAY_TITLE_MAX_CHARS + 1);
        let truncated = truncate_title_for_display(&title);

        assert_eq!(truncated, "a".repeat(PROCESS_DISPLAY_TITLE_MAX_CHARS));
    }

    #[test]
    fn truncate_title_handles_multibyte_at_old_byte_boundary() {
        let title = format!(
            "{}Тест, привіт, дякую",
            "a".repeat(PROCESS_DISPLAY_TITLE_MAX_CHARS - 1)
        );
        let truncated = truncate_title_for_display(&title);

        assert_eq!(
            truncated,
            format!("{}Т", "a".repeat(PROCESS_DISPLAY_TITLE_MAX_CHARS - 1))
        );
        assert!(truncated.is_char_boundary(truncated.len()));
    }

    #[test]
    fn next_path_buffer_size_grows_to_cap_then_stops() {
        assert_eq!(next_path_buffer_size(260), Some(520));
        assert_eq!(next_path_buffer_size(16384), Some(PROCESS_PATH_MAX_CHARS));
        assert_eq!(next_path_buffer_size(PROCESS_PATH_MAX_CHARS), None);
        assert_eq!(next_path_buffer_size(PROCESS_PATH_MAX_CHARS + 1024), None);

        let mut capacity = PROCESS_PATH_INITIAL_CHARS;
        let mut steps = 0;
        while let Some(next) = next_path_buffer_size(capacity) {
            assert!(next <= PROCESS_PATH_MAX_CHARS);
            assert!(next > capacity);
            capacity = next;
            steps += 1;
            assert!(steps < 64);
        }
        assert_eq!(capacity, PROCESS_PATH_MAX_CHARS);
    }

    #[test]
    fn exe_name_from_path_strips_directories() {
        assert_eq!(
            exe_name_from_path("C:\\Program Files\\App\\app.exe").as_deref(),
            Some("app.exe")
        );
        assert_eq!(exe_name_from_path("app.exe").as_deref(), Some("app.exe"));
        assert_eq!(exe_name_from_path(""), None);
        assert_eq!(exe_name_from_path("C:\\dir\\"), None);
    }

    #[test]
    fn foreground_cache_reuses_entry_only_for_same_hwnd_and_pid() {
        let base = Instant::now();
        let mut cache = ForegroundCache::default();
        assert_eq!(cache.get(100, 7, base), None);

        cache.store(100, 7, "alpha.exe", base);
        assert_eq!(cache.get(100, 7, base).as_deref(), Some("alpha.exe"));
        assert_eq!(
            cache
                .get(100, 7, base + Duration::from_millis(999))
                .as_deref(),
            Some("alpha.exe")
        );
        assert_eq!(cache.get(100, 7, base + FOREGROUND_CACHE_TTL), None);

        assert_eq!(cache.get(200, 7, base), None);
        assert_eq!(cache.get(100, 8, base), None);

        cache.store(200, 9, "beta.exe", base);
        assert_eq!(cache.get(100, 7, base), None);
        assert_eq!(cache.get(200, 9, base).as_deref(), Some("beta.exe"));
    }

    #[test]
    fn foreground_unknown_persists_only_after_grace_window() {
        assert!(!foreground_unknown_persists(Duration::ZERO));
        assert!(!foreground_unknown_persists(Duration::from_millis(10)));
        assert!(!foreground_unknown_persists(
            FOREGROUND_UNKNOWN_GRACE - Duration::from_millis(1)
        ));
        assert!(foreground_unknown_persists(FOREGROUND_UNKNOWN_GRACE));
        assert!(foreground_unknown_persists(FOREGROUND_UNKNOWN_GRACE * 4));
    }

    #[test]
    fn unidentified_foreground_streak_needs_grace_and_resets_on_identification() {
        let base = Instant::now();
        let mut cache = ForegroundCache::default();

        assert!(!cache.note_unidentified(base));
        assert!(!cache.note_unidentified(base + Duration::from_millis(100)));
        assert!(
            !cache.note_unidentified(base + FOREGROUND_UNKNOWN_GRACE - Duration::from_millis(1))
        );
        assert!(cache.note_unidentified(base + FOREGROUND_UNKNOWN_GRACE));
        assert!(cache.note_unidentified(base + Duration::from_millis(900)));

        cache.note_identified();
        assert!(!cache.note_unidentified(base + Duration::from_millis(1000)));
        assert!(!cache.note_unidentified(base + Duration::from_millis(1200)));
        assert!(
            cache.note_unidentified(base + Duration::from_millis(1000) + FOREGROUND_UNKNOWN_GRACE)
        );
    }

    #[test]
    fn resetting_the_foreground_grace_restarts_the_streak() {
        let base = Instant::now();

        {
            let mut cache = foreground_cache().lock().unwrap_or_else(poisoned_inner);
            assert!(!cache.note_unidentified(base));
            assert!(cache.note_unidentified(base + FOREGROUND_UNKNOWN_GRACE));
        }

        reset_foreground_unknown_grace();

        {
            let mut cache = foreground_cache().lock().unwrap_or_else(poisoned_inner);
            assert!(!cache.note_unidentified(base + FOREGROUND_UNKNOWN_GRACE));
            assert!(cache.note_unidentified(base + FOREGROUND_UNKNOWN_GRACE * 2));
        }

        reset_foreground_unknown_grace();
    }

    #[test]
    fn icon_cache_evicts_oldest_entries_at_cap() {
        let mut cache = IconCache::default();
        for index in 0..ICON_CACHE_MAX_ENTRIES {
            cache.insert(&format!("app{}.exe", index), Some(String::from("icon")));
        }
        assert_eq!(cache.len(), ICON_CACHE_MAX_ENTRIES);
        assert_eq!(cache.get("app0.exe").map(|icon| icon.is_some()), Some(true));

        cache.insert("overflow.exe", Some(String::from("icon")));
        assert_eq!(cache.len(), ICON_CACHE_MAX_ENTRIES);
        assert_eq!(cache.get("app0.exe"), None);
        assert_eq!(
            cache.get("overflow.exe").map(|icon| icon.is_some()),
            Some(true)
        );
        assert_eq!(cache.get("app1.exe").map(|icon| icon.is_some()), Some(true));

        for index in 0..(ICON_CACHE_MAX_ENTRIES * 2) {
            cache.insert(&format!("extra{}.exe", index), None);
            assert_eq!(cache.len(), ICON_CACHE_MAX_ENTRIES);
        }
        assert_eq!(cache.get("missing.exe"), None);
    }

    #[test]
    fn process_list_verdict_covers_both_modes_and_foreground_states() {
        use crate::engine::ProcessListMode::{Blacklist, Whitelist};

        assert_eq!(
            process_list_verdict(Whitelist, ForegroundMatch::Identified { is_in_list: true }),
            ProcessListVerdict::Allow
        );
        assert_eq!(
            process_list_verdict(Whitelist, ForegroundMatch::Identified { is_in_list: false }),
            ProcessListVerdict::Blocked
        );
        assert_eq!(
            process_list_verdict(Whitelist, ForegroundMatch::Unidentified),
            ProcessListVerdict::Unidentified
        );
        assert_eq!(
            process_list_verdict(Blacklist, ForegroundMatch::Identified { is_in_list: true }),
            ProcessListVerdict::Blocked
        );
        assert_eq!(
            process_list_verdict(Blacklist, ForegroundMatch::Identified { is_in_list: false }),
            ProcessListVerdict::Allow
        );
        assert_eq!(
            process_list_verdict(Blacklist, ForegroundMatch::Unidentified),
            ProcessListVerdict::Allow
        );
    }

    #[test]
    fn prefer_titled_pid_upgrades_from_windowless_to_titled_instance() {
        let has_title = |pid: u32| pid == 2000;
        assert_eq!(prefer_titled_pid(1000, 2000, has_title), 2000);
        assert_eq!(prefer_titled_pid(2000, 3000, has_title), 2000);
        let none = |_pid: u32| false;
        assert_eq!(prefer_titled_pid(1000, 2000, none), 1000);
    }
}
