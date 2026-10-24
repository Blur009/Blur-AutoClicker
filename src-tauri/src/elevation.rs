use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, HANDLE, HWND};
use windows_sys::Win32::Security::{
    GetTokenInformation, TokenElevation, TokenElevationType, TOKEN_ELEVATION, TOKEN_ELEVATION_TYPE,
    TOKEN_QUERY,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetSystemMetrics, GetWindow, GetWindowLongW, GetWindowRect,
    GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, WS_EX_TOOLWINDOW,
};

pub const MAX_SUPPRESSED_WINDOWS: usize = 16;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationState {
    pub elevated: bool,
    pub can_elevate: bool,
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

pub fn relaunch_elevated() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let args: Vec<String> = std::env::args()
        .skip(1)
        .filter(|arg| arg != "--autostart")
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{arg}\"")
            } else {
                arg
            }
        })
        .collect();
    let operation = wide(std::ffi::OsStr::new("runas"));
    let file = wide(exe.as_os_str());
    let parameters = wide(std::ffi::OsStr::new(&args.join(" ")));
    const SW_SHOWNORMAL: i32 = 1;
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            parameters.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    result as isize > 32
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
    fn suppressed_list_dedupes_and_caps() {
        let mut list: Vec<(isize, u32)> = Vec::new();
        remember_suppressed(&mut list, (1, 10));
        remember_suppressed(&mut list, (1, 10));
        assert_eq!(list, vec![(1, 10)]);

        for index in 0..MAX_SUPPRESSED_WINDOWS + 5 {
            remember_suppressed(&mut list, (index as isize + 2, 20));
        }
        assert_eq!(list.len(), MAX_SUPPRESSED_WINDOWS);
        assert_eq!(
            list.last(),
            Some(&((MAX_SUPPRESSED_WINDOWS + 6) as isize, 20))
        );
    }
}
