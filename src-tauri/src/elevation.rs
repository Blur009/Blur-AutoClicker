use std::os::windows::ffi::OsStringExt;
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, HANDLE, HWND};
use windows_sys::Win32::Security::{
    GetTokenInformation, TokenElevation, TokenElevationType, TOKEN_ADJUST_DEFAULT,
    TOKEN_ADJUST_SESSIONID, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_ELEVATION,
    TOKEN_ELEVATION_TYPE, TOKEN_QUERY,
};
use windows_sys::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows_sys::Win32::System::Threading::{
    CreateProcessWithTokenW, GetCurrentProcess, OpenProcess, OpenProcessToken,
    QueryFullProcessImageNameW, PROCESS_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION,
    STARTUPINFOW,
};
use windows_sys::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetShellWindow, GetSystemMetrics, GetWindow, GetWindowLongW,
    GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    GWL_EXSTYLE, GW_OWNER, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, WS_EX_TOOLWINDOW,
};

pub const MAX_SUPPRESSED_WINDOWS: usize = 16;
pub const MAX_LABEL_CHARS: usize = 120;
const MAX_WINDOW_TITLE_CHARS: i32 = 4096;
const MAX_VERSION_BLOCK_BYTES: u32 = 1 << 20;
const MAX_VERSION_STRING_CHARS: usize = 1024;
const MAX_VERSION_TRANSLATIONS: usize = 16;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationState {
    pub elevated: bool,
    pub can_elevate: bool,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedWindow {
    #[serde(skip_serializing)]
    pub handle: isize,
    #[serde(skip_serializing)]
    pub pid: u32,
    pub name: String,
    pub title: String,
}

fn token_elevation(process: HANDLE) -> Option<TOKEN_ELEVATION> {
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return None;
        }
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut returned: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        );
        CloseHandle(token);
        (ok != 0).then_some(elevation)
    }
}

fn token_elevation_type(process: HANDLE) -> Option<TOKEN_ELEVATION_TYPE> {
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return None;
        }
        let mut elevation_type: TOKEN_ELEVATION_TYPE = 0;
        let mut returned: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevationType,
            &mut elevation_type as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION_TYPE>() as u32,
            &mut returned,
        );
        CloseHandle(token);
        (ok != 0).then_some(elevation_type)
    }
}

pub fn process_is_elevated(pid: u32) -> bool {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return std::io::Error::last_os_error().raw_os_error()
                == Some(ERROR_ACCESS_DENIED as i32);
        }
        let elevated = match token_elevation(process) {
            Some(elevation) => elevation.TokenIsElevated != 0,
            None => true,
        };
        CloseHandle(process);
        elevated
    }
}

pub fn current_process_elevated() -> bool {
    token_elevation(unsafe { GetCurrentProcess() })
        .map(|elevation| elevation.TokenIsElevated != 0)
        .unwrap_or(false)
}

pub fn can_elevate() -> bool {
    !current_process_elevated()
        && token_elevation_type(unsafe { GetCurrentProcess() })
            == Some(windows_sys::Win32::Security::TokenElevationTypeLimited)
}

pub fn state() -> ElevationState {
    ElevationState {
        elevated: current_process_elevated(),
        can_elevate: can_elevate(),
    }
}

pub fn clean_label(raw: &str) -> String {
    let filtered: String = raw
        .chars()
        .map(|character| {
            if character.is_control() || is_bidi_control(character) {
                ' '
            } else {
                character
            }
        })
        .collect();
    let collapsed = filtered.split_whitespace().collect::<Vec<_>>().join(" ");
    let stripped = collapsed
        .strip_prefix("Administrator: ")
        .or_else(|| collapsed.strip_prefix("Administrator - "))
        .unwrap_or(collapsed.as_str());
    if stripped.chars().count() <= MAX_LABEL_CHARS {
        return stripped.to_string();
    }
    let mut truncated: String = stripped.chars().take(MAX_LABEL_CHARS).collect();
    let keep = truncated.trim_end().len();
    truncated.truncate(keep);
    truncated.push('…');
    truncated
}

fn is_bidi_control(character: char) -> bool {
    matches!(
        character,
        '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'
    )
}

fn window_title(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return String::new();
    }
    let length = length.min(MAX_WINDOW_TITLE_CHARS);
    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if written <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..written as usize])
}

fn process_path(pid: u32) -> Option<Vec<u16>> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let mut buffer = vec![0u16; 4096];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if ok == 0 || size == 0 {
            return None;
        }
        buffer.truncate(size as usize);
        Some(buffer)
    }
}

fn file_description(path: &[u16]) -> Option<String> {
    let mut terminated = path.to_vec();
    terminated.push(0);
    let mut handle: u32 = 0;
    let size = unsafe { GetFileVersionInfoSizeW(terminated.as_ptr(), &mut handle) };
    if size == 0 || size > MAX_VERSION_BLOCK_BYTES {
        return None;
    }
    let mut block = vec![0u8; size as usize];
    if unsafe { GetFileVersionInfoW(terminated.as_ptr(), 0, size, block.as_mut_ptr().cast()) } == 0
    {
        return None;
    }
    let mut pointer: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut length: u32 = 0;
    let translations = wide(std::ffi::OsStr::new("\\VarFileInfo\\Translation"));
    if unsafe {
        VerQueryValueW(
            block.as_ptr().cast(),
            translations.as_ptr(),
            &mut pointer,
            &mut length,
        )
    } == 0
        || pointer.is_null()
        || length < 4
    {
        return version_string(&block, 0x0409, 0x04b0)
            .or_else(|| version_string(&block, 0x0000, 0x04b0));
    }
    let pairs = ((length / 4) as usize).min(MAX_VERSION_TRANSLATIONS);
    for index in 0..pairs {
        let pair = unsafe { (pointer as *const u16).add(index * 2) };
        let language = unsafe { std::ptr::read_unaligned(pair) };
        let codepage = unsafe { std::ptr::read_unaligned(pair.add(1)) };
        if let Some(description) = version_string(&block, language, codepage) {
            return Some(description);
        }
    }
    None
}

fn version_string(block: &[u8], language: u16, codepage: u16) -> Option<String> {
    let query = wide(std::ffi::OsStr::new(&format!(
        "\\StringFileInfo\\{language:04x}{codepage:04x}\\FileDescription"
    )));
    let mut pointer: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut length: u32 = 0;
    if unsafe {
        VerQueryValueW(
            block.as_ptr().cast(),
            query.as_ptr(),
            &mut pointer,
            &mut length,
        )
    } == 0
        || pointer.is_null()
        || length == 0
    {
        return None;
    }
    let start = block.as_ptr() as usize;
    let offset = (pointer as usize).checked_sub(start).unwrap_or(usize::MAX);
    let available = block.len().saturating_sub(offset) / 2;
    let count = (length as usize)
        .min(MAX_VERSION_STRING_CHARS)
        .min(available);
    if count == 0 {
        return None;
    }
    let mut buffer = Vec::with_capacity(count);
    for index in 0..count {
        buffer.push(unsafe { std::ptr::read_unaligned((pointer as *const u16).add(index)) });
    }
    let value = String::from_utf16_lossy(&buffer);
    let value = value.trim_matches('\0').trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub fn window_label(description: Option<String>, stem: Option<String>, title: &str) -> String {
    let picked = description
        .map(|value| clean_label(&value))
        .filter(|value| !value.is_empty())
        .or_else(|| {
            stem.map(|value| clean_label(&value))
                .filter(|value| !value.is_empty())
        });
    picked.unwrap_or_else(|| title.to_string())
}

pub fn describe_window(handle: isize, pid: u32) -> BlockedWindow {
    let title = clean_label(&window_title(handle as HWND));
    let (description, stem) = process_labels(pid);
    let name = window_label(description, stem, &title);
    BlockedWindow {
        handle,
        pid,
        name,
        title,
    }
}

fn process_labels(pid: u32) -> (Option<String>, Option<String>) {
    let Some(path) = process_path(pid) else {
        return (None, None);
    };
    let description = file_description(&path);
    let full = std::ffi::OsString::from_wide(&path);
    let stem = std::path::Path::new(&full)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned());
    (description, stem)
}

fn window_pid(hwnd: HWND) -> u32 {
    let mut pid: u32 = 0;
    if !hwnd.is_null() {
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
    }
    pid
}

pub fn remember_suppressed(list: &mut Vec<(isize, u32)>, entry: (isize, u32)) {
    if list.contains(&entry) {
        return;
    }
    if list.len() >= MAX_SUPPRESSED_WINDOWS {
        list.remove(0);
    }
    list.push(entry);
}

pub fn foreground_needs_prompt(suppressed: &[(isize, u32)]) -> Option<(isize, u32)> {
    if current_process_elevated() {
        return None;
    }
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let pid = window_pid(hwnd);
        if suppressed.contains(&(hwnd as isize, pid)) {
            return None;
        }
        if IsWindowVisible(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
            return None;
        }
        if (GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) != 0 {
            return None;
        }
        if GetWindowTextLengthW(hwnd) <= 0 {
            return None;
        }
        let mut rect: windows_sys::Win32::Foundation::RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return None;
        }
        let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
        let screen_area = GetSystemMetrics(SM_CXVIRTUALSCREEN) as i64
            * GetSystemMetrics(SM_CYVIRTUALSCREEN) as i64;
        if screen_area > 0 && area < screen_area / 4 {
            return None;
        }
        process_is_elevated(pid).then_some((hwnd as isize, pid))
    }
}

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(std::iter::once(0)).collect()
}

fn quote_argument(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        return arg.to_string();
    }
    let mut quoted = String::with_capacity(arg.len() + 2);
    quoted.push('"');
    let mut backslashes = 0;
    for character in arg.chars() {
        match character {
            '\\' => {
                backslashes += 1;
                quoted.push('\\');
            }
            '"' => {
                for _ in 0..=backslashes {
                    quoted.push('\\');
                }
                backslashes = 0;
                quoted.push('"');
            }
            other => {
                backslashes = 0;
                quoted.push(other);
            }
        }
    }
    for _ in 0..backslashes {
        quoted.push('\\');
    }
    quoted.push('"');
    quoted
}

pub fn elevated_parameters<I: IntoIterator<Item = String>>(
    args: I,
    keep_autostart: bool,
) -> String {
    args.into_iter()
        .filter(|arg| keep_autostart || arg != "--autostart")
        .map(|arg| quote_argument(&arg))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn relaunch_elevated(keep_autostart: bool) -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let parameters = elevated_parameters(std::env::args().skip(1), keep_autostart);
    let operation = wide(std::ffi::OsStr::new("runas"));
    let file = wide(exe.as_os_str());
    let arguments = wide(std::ffi::OsStr::new(&parameters));
    const SW_SHOWNORMAL: i32 = 1;
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.lpVerb = operation.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = arguments.as_ptr();
    info.nShow = SW_SHOWNORMAL;
    let launched = unsafe { ShellExecuteExW(&mut info) } != 0;
    if !info.hProcess.is_null() {
        unsafe { CloseHandle(info.hProcess) };
    }
    launched
}

fn token_is_elevated(token: HANDLE) -> Option<bool> {
    unsafe {
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut returned: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        );
        (ok != 0).then_some(elevation.TokenIsElevated != 0)
    }
}

pub fn relaunch_unelevated(keep_autostart: bool) -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let parameters = elevated_parameters(std::env::args().skip(1), keep_autostart);
    let mut command: Vec<u16> = if parameters.is_empty() {
        quote_argument(&exe.display().to_string())
    } else {
        format!(
            "{} {parameters}",
            quote_argument(&exe.display().to_string())
        )
    }
    .encode_utf16()
    .chain(std::iter::once(0))
    .collect();
    let application = wide(exe.as_os_str());

    unsafe {
        let shell = GetShellWindow();
        if shell.is_null() {
            log::warn!("[Elevation] No shell window, cannot drop administrator rights");
            return false;
        }
        let mut shell_pid: u32 = 0;
        GetWindowThreadProcessId(shell, &mut shell_pid);
        let shell_process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, shell_pid);
        if shell_process.is_null() {
            log::warn!(
                "[Elevation] Cannot open the shell process: {}",
                std::io::Error::last_os_error()
            );
            return false;
        }
        let mut token: HANDLE = std::ptr::null_mut();
        let opened = OpenProcessToken(
            shell_process,
            TOKEN_DUPLICATE
                | TOKEN_QUERY
                | TOKEN_ASSIGN_PRIMARY
                | TOKEN_ADJUST_DEFAULT
                | TOKEN_ADJUST_SESSIONID,
            &mut token,
        ) != 0;
        let open_error = std::io::Error::last_os_error();
        CloseHandle(shell_process);
        if !opened || token.is_null() {
            log::warn!("[Elevation] Cannot read the shell token: {open_error}");
            return false;
        }
        if token_is_elevated(token) != Some(false) {
            log::warn!(
                "[Elevation] The shell token is not unprivileged, cannot drop administrator rights"
            );
            CloseHandle(token);
            return false;
        }
        let mut startup: STARTUPINFOW = std::mem::zeroed();
        startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let mut process_info: PROCESS_INFORMATION = std::mem::zeroed();
        let created = CreateProcessWithTokenW(
            token,
            0,
            application.as_ptr(),
            command.as_mut_ptr(),
            0,
            std::ptr::null(),
            std::ptr::null(),
            &startup,
            &mut process_info,
        ) != 0;
        let create_error = std::io::Error::last_os_error();
        CloseHandle(token);
        if !process_info.hProcess.is_null() {
            CloseHandle(process_info.hProcess);
        }
        if !process_info.hThread.is_null() {
            CloseHandle(process_info.hThread);
        }
        if !created {
            log::warn!("[Elevation] Relaunch without administrator rights failed: {create_error}");
        }
        created
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_process_elevation_matches_token_query() {
        assert_eq!(
            current_process_elevated(),
            process_is_elevated(std::process::id())
        );
    }

    #[test]
    fn protected_process_is_treated_as_elevated() {
        assert!(process_is_elevated(4));
    }

    #[test]
    fn blocked_window_serializes_only_its_labels() {
        let window = BlockedWindow {
            handle: 42,
            pid: 7,
            name: String::from("Task Manager"),
            title: String::from("Task Manager"),
        };
        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&window).expect("serializes"))
                .expect("valid json");
        assert_eq!(
            value,
            serde_json::json!({ "name": "Task Manager", "title": "Task Manager" })
        );
    }

    #[test]
    fn suppressed_list_dedupes_and_caps() {
        let mut list: Vec<(isize, u32)> = Vec::new();
        remember_suppressed(&mut list, (1, 10));
        remember_suppressed(&mut list, (1, 10));
        assert_eq!(list, vec![(1, 10)]);

        for index in 0..MAX_SUPPRESSED_WINDOWS + 5 {
            remember_suppressed(&mut list, (index as isize + 2, 20));
        }
        assert_eq!(list.len(), MAX_SUPPRESSED_WINDOWS);
        assert_eq!(list.first(), Some(&(7, 20)));
        assert_eq!(
            list.last(),
            Some(&((MAX_SUPPRESSED_WINDOWS + 6) as isize, 20))
        );
    }

    #[test]
    fn window_label_prefers_the_file_description() {
        assert_eq!(
            window_label(
                Some(String::from("Task Manager")),
                Some(String::from("Taskmgr")),
                "Task Manager"
            ),
            "Task Manager"
        );
        assert_eq!(
            window_label(
                Some(String::from("   ")),
                Some(String::from("Taskmgr")),
                "Task Manager"
            ),
            "Taskmgr"
        );
        assert_eq!(
            window_label(None, Some(String::from("Taskmgr")), "Task Manager"),
            "Taskmgr"
        );
        assert_eq!(
            window_label(None, None, "Administrator: Task Manager"),
            "Administrator: Task Manager"
        );
        assert_eq!(window_label(None, None, ""), "");
    }

    #[test]
    fn window_label_cleans_the_description_it_picks() {
        assert_eq!(
            window_label(Some(String::from("Acme  Tool\n")), None, "x"),
            "Acme Tool"
        );
    }

    #[test]
    fn clean_label_drops_admin_prefix_and_extra_space() {
        assert_eq!(
            clean_label("Administrator:  Command   Prompt "),
            "Command Prompt"
        );
        assert_eq!(
            clean_label("Administrator - Registry Editor"),
            "Registry Editor"
        );
        assert_eq!(clean_label("Task Manager"), "Task Manager");
        assert_eq!(clean_label("   "), "");
    }

    #[test]
    fn clean_label_caps_long_titles_without_splitting_chars() {
        let exact: String = "a".repeat(MAX_LABEL_CHARS);
        assert_eq!(clean_label(&exact), exact);

        let long: String = "é".repeat(MAX_LABEL_CHARS + 10);
        let label = clean_label(&long);
        assert_eq!(label.chars().count(), MAX_LABEL_CHARS + 1);
        assert!(label.ends_with('…'));

        let mixed: String = format!("{}{}", "a".repeat(MAX_LABEL_CHARS - 1), "é".repeat(4));
        let label = clean_label(&mixed);
        assert_eq!(
            label.chars().count(),
            MAX_LABEL_CHARS + 1,
            "a two byte char straddling the cap must not split or vanish"
        );
        assert!(label.contains('é'));
        assert!(label.ends_with('…'));
    }

    #[test]
    fn clean_label_strips_control_and_bidi_characters() {
        assert_eq!(
            clean_label("Task\u{0}Manager\u{202e}\u{2066} Pro"),
            "Task Manager Pro"
        );
        assert_eq!(clean_label("\u{202e}Admin"), "Admin");
        assert_eq!(clean_label("Line\r\nBreak"), "Line Break");
    }

    #[test]
    fn own_process_gets_a_stem() {
        let (_, stem) = process_labels(std::process::id());
        assert!(stem.is_some_and(|value| !value.is_empty()));
    }

    #[test]
    fn missing_version_resource_is_not_an_error() {
        let path = wide(std::ffi::OsStr::new("C:\\definitely\\not\\here.exe"));
        assert!(file_description(&path).is_none());
    }

    #[test]
    fn elevated_parameters_quote_for_the_windows_parser() {
        let args = vec![
            String::from("--autostart"),
            String::from("--profile"),
            String::from("My Profile"),
            String::from("plain"),
        ];
        assert_eq!(
            elevated_parameters(args.clone(), true),
            "--autostart --profile \"My Profile\" plain"
        );
        assert_eq!(
            elevated_parameters(args, false),
            "--profile \"My Profile\" plain"
        );
        assert_eq!(elevated_parameters(Vec::<String>::new(), true), "");
    }

    #[test]
    fn elevated_parameters_survive_quotes_backslashes_and_empty_arguments() {
        assert_eq!(quote_argument("plain"), "plain");
        assert_eq!(quote_argument("a b"), "\"a b\"");
        assert_eq!(quote_argument("a\tb"), "\"a\tb\"");
        assert_eq!(quote_argument("a\" b"), "\"a\\\" b\"");
        assert_eq!(quote_argument("C:\\Some Dir\\"), "\"C:\\Some Dir\\\\\"");
        assert_eq!(quote_argument(""), "\"\"");
    }

    #[test]
    #[cfg_attr(not(target_pointer_width = "64"), ignore)]
    fn system_executable_reports_a_file_description() {
        let Some(root) = std::env::var_os("SystemRoot") else {
            return;
        };
        let path = wide(std::ffi::OsStr::new(&format!(
            "{}\\System32\\taskmgr.exe",
            root.to_string_lossy()
        )));
        let description = file_description(&path).expect("version resource resolves");
        assert!(!description.trim().is_empty());
    }
}
