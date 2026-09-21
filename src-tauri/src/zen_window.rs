//! Zen mode's fullscreen on Windows for a window that is MAXIMIZED.
//!
//! tao (Tauri's windowing layer) enters fullscreen by dropping the window's frame styles and moving it to the
//! monitor's rectangle, but it leaves the WS_MAXIMIZE style set. While that style is present Windows keeps the
//! window inside the work area, so the strip where the taskbar was stays empty. Restoring the window first
//! (unmaximize, fullscreen, maximize again) works but is visibly jumpy. This command instead runs after the
//! normal `setFullscreen(true)` and only clears the WS_MAXIMIZE *style bit* (no restore animation, no
//! `ShowWindow`) and moves the window onto the monitor's full rectangle in one step. tao still remembers the
//! maximized placement, so leaving fullscreen puts the window back to maximized by itself.

#[cfg(windows)]
fn cover_monitor(hwnd: isize) -> Result<(), String> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, HWND_TOP, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, WS_MAXIMIZE,
    };

    let hwnd = HWND(hwnd as _);
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return Err("GetMonitorInfoW failed".into());
        }
        let RECT { left, top, right, bottom } = info.rcMonitor;

        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(WS_MAXIMIZE.0 as isize));
        SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            left,
            top,
            right - left,
            bottom - top,
            SWP_FRAMECHANGED | SWP_NOACTIVATE,
        )
        .map_err(|e| e.to_string())
    }
}

/// Makes a fullscreen window cover its whole monitor, including the taskbar area. Only needed (and only does
/// anything) on Windows; a no-op elsewhere.
#[tauri::command]
pub async fn zen_cover_monitor(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(cover_monitor(hwnd));
            })
            .map_err(|e| e.to_string())?;
        return rx.recv().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}
