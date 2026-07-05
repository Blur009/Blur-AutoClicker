use super::ClickerConfig;
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::sync::OnceLock;

use crate::error::poisoned_inner;
use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM};
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

fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_process_exe_path(pid: u32) -> Option<String> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let mut buffer = [0u16; 260];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if result == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buffer[..size as usize]))
    }
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
            return cached.clone();
        }
    }
    let icon = get_process_exe_path(pid).and_then(|path| extract_process_icon_base64(&path));
    let mut cache = icon_cache().lock().unwrap_or_else(poisoned_inner);
    cache.insert(exe_name.to_string(), icon.clone());
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

fn get_process_name_from_pid(target_pid: u32) -> Option<String> {
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
    let state = &mut *(lparam as *mut BuildWindowMap);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 {
        return 1;
    }
    if state.map.contains_key(&pid) {
        return 1;
    }
    let mut buffer = [0u16; 512];
    let len = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
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
    get_process_name_from_pid(pid)
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
    result.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    result
}

pub fn check_process_list(config: &ClickerConfig) -> Option<super::ProcessListBehavior> {
    if !config.process_list_enabled {
        return None;
    }
    let current = get_foreground_process_name()?.to_lowercase();
    let matching_entry = config
        .process_list_entries
        .iter()
        .find(|e| e.enabled && e.name == current);
    let is_in_list = matching_entry.is_some();
    let triggered = match config.process_list_mode {
        super::ProcessListMode::Whitelist => !is_in_list,
        super::ProcessListMode::Blacklist => is_in_list,
    };
    if triggered {
        let behavior = match matching_entry {
            Some(entry) => entry.behavior,
            None => super::ProcessListBehavior::Stop,
        };
        Some(behavior)
    } else {
        None
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
    fn prefer_titled_pid_upgrades_from_windowless_to_titled_instance() {
        let has_title = |pid: u32| pid == 2000;
        assert_eq!(prefer_titled_pid(1000, 2000, has_title), 2000);
        assert_eq!(prefer_titled_pid(2000, 3000, has_title), 2000);
        let none = |_pid: u32| false;
        assert_eq!(prefer_titled_pid(1000, 2000, none), 1000);
    }
}
