#[cfg(target_os = "windows")]
mod platform {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    const MUTEX_NAME: &str = r"Local\MrSchnirschuhHub.SingleInstance";
    const MAIN_WINDOW_TITLE: &str = "MrSchnirschuhHub";

    pub struct SingleInstanceGuard {
        mutex: HANDLE,
    }

    pub fn acquire() -> Option<SingleInstanceGuard> {
        acquire_named(MUTEX_NAME, MAIN_WINDOW_TITLE)
    }

    fn acquire_named(mutex_name: &str, window_title: &str) -> Option<SingleInstanceGuard> {
        let mutex_name = wide_null(mutex_name);
        let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name.as_ptr()) };

        if mutex == 0 {
            return Some(SingleInstanceGuard { mutex });
        }

        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            activate_existing_instance(window_title);
            unsafe {
                CloseHandle(mutex);
            }
            return None;
        }

        Some(SingleInstanceGuard { mutex })
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            if self.mutex != 0 {
                unsafe {
                    CloseHandle(self.mutex);
                }
            }
        }
    }

    fn activate_existing_instance(window_title: &str) {
        let title = wide_null(window_title);
        let hwnd = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };

        if hwnd == 0 {
            return;
        }

        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
    }

    fn wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub struct SingleInstanceGuard;

    pub fn acquire() -> Option<SingleInstanceGuard> {
        Some(SingleInstanceGuard)
    }
}

pub use platform::acquire;
