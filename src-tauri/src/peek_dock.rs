//! Peek docked to the bottom of the screen (§393, experimental): the window registers as an application desktop
//! toolbar ("AppBar", like the taskbar), so Windows reserves a strip along the bottom of its monitor and every other
//! window treats the rest as the whole screen: a maximized Teams call fills the top part, Peek the strip below it.
//!
//! The strip must always be given back (`peek_undock`, and `release` when the window is destroyed): a registration
//! that outlives the window can leave the space reserved until Explorer notices.

#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};

/// Whether this window is registered as an AppBar now.
#[cfg(windows)]
static DOCKED: AtomicBool = AtomicBool::new(false);

/// The strip's height is kept between these (physical pixels): never so thin that it cannot be grabbed, never more than
/// half the monitor.
const MIN_HEIGHT: i32 = 60;

#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// The wanted strip along the bottom of a monitor (`left, top, right, bottom`, physical pixels), before Windows moves
/// it above the taskbar: full width, `height` tall, clamped.
pub fn bottom_strip(monitor: (i32, i32, i32, i32), height: i32) -> (i32, i32, i32, i32) {
    let (left, top, right, bottom) = monitor;
    let max = ((bottom - top) / 2).max(MIN_HEIGHT);
    let h = height.clamp(MIN_HEIGHT, max);
    (left, bottom - h, right, bottom)
}

#[cfg(windows)]
mod native {
    use super::*;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA};
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER, WM_APP};

    fn data(hwnd: HWND) -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            // Windows sends this when the taskbar or the screen layout changes; nothing handles it (yet): Peek re-docks
            // when it is resized or entered again.
            uCallbackMessage: WM_APP + 0x51,
            uEdge: ABE_BOTTOM,
            ..Default::default()
        }
    }

    /// Puts the window's CONTENT exactly on `rc`: the frame around it (the invisible resize border of an undecorated
    /// window) is measured and added outside. Repeated like `peek_window::place`, for a move onto a monitor with other
    /// scaling.
    fn place_client(hwnd: HWND, rc: RECT) -> Result<(), String> {
        unsafe {
            for _ in 0..3 {
                let mut outer = RECT::default();
                let mut client = RECT::default();
                GetWindowRect(hwnd, &mut outer).map_err(|e| e.to_string())?;
                GetClientRect(hwnd, &mut client).map_err(|e| e.to_string())?;
                let mut origin = POINT::default();
                let _ = ClientToScreen(hwnd, &mut origin);
                let inset_left = origin.x - outer.left;
                let inset_top = origin.y - outer.top;
                let inset_right = outer.right - (origin.x + client.right);
                let inset_bottom = outer.bottom - (origin.y + client.bottom);
                SetWindowPos(
                    hwnd,
                    None,
                    rc.left - inset_left,
                    rc.top - inset_top,
                    (rc.right - rc.left) + inset_left + inset_right,
                    (rc.bottom - rc.top) + inset_top + inset_bottom,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                )
                .map_err(|e| e.to_string())?;
                let mut after = POINT::default();
                let mut after_client = RECT::default();
                let _ = ClientToScreen(hwnd, &mut after);
                GetClientRect(hwnd, &mut after_client).map_err(|e| e.to_string())?;
                if after.x == rc.left
                    && after.y == rc.top
                    && after_client.right == rc.right - rc.left
                    && after_client.bottom == rc.bottom - rc.top
                {
                    break;
                }
            }
        }
        Ok(())
    }

    pub fn dock(hwnd: isize, height: i32) -> Result<DockRect, String> {
        let hwnd = HWND(hwnd as _);
        unsafe {
            let mut abd = data(hwnd);
            if !DOCKED.load(Ordering::SeqCst) {
                if SHAppBarMessage(ABM_NEW, &mut abd) == 0 {
                    return Err("Windows did not accept Peek as a docked window".into());
                }
                DOCKED.store(true, Ordering::SeqCst);
            }
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Err("couldn't read the screen Peek is on".into());
            }
            let m = info.rcMonitor;
            let (l, t, r, b) = bottom_strip((m.left, m.top, m.right, m.bottom), height);
            abd.rc = RECT { left: l, top: t, right: r, bottom: b };
            // Windows moves the proposed strip clear of other docked windows (the taskbar), then it is fixed at our
            // height again from that bottom and reserved.
            SHAppBarMessage(ABM_QUERYPOS, &mut abd);
            abd.rc.top = abd.rc.bottom - (b - t);
            SHAppBarMessage(ABM_SETPOS, &mut abd);
            place_client(hwnd, abd.rc)?;
            Ok(DockRect {
                x: abd.rc.left,
                y: abd.rc.top,
                width: abd.rc.right - abd.rc.left,
                height: abd.rc.bottom - abd.rc.top,
            })
        }
    }

    pub fn undock(hwnd: isize) {
        if DOCKED.swap(false, Ordering::SeqCst) {
            let mut abd = data(HWND(hwnd as _));
            unsafe {
                SHAppBarMessage(ABM_REMOVE, &mut abd);
            }
        }
    }
}

#[cfg(windows)]
fn on_main_thread<T: Send + 'static>(
    window: &tauri::WebviewWindow,
    job: impl FnOnce(isize) -> T + Send + 'static,
) -> Result<T, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(job(hwnd));
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())
}

/// Docks the window to the bottom of its monitor, `height` physical pixels tall (clamped), and returns the strip the
/// window now fills. Calling it again (a new height, another monitor) moves the reservation.
#[tauri::command]
pub async fn peek_dock_bottom(window: tauri::WebviewWindow, height: u32) -> Result<DockRect, String> {
    #[cfg(windows)]
    return on_main_thread(&window, move |hwnd| native::dock(hwnd, height as i32))?;
    #[cfg(not(windows))]
    {
        let _ = (window, height);
        Err("docking Peek is only available on Windows".into())
    }
}

/// Gives the reserved strip back. Safe to call when not docked.
#[tauri::command]
pub async fn peek_undock(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    return on_main_thread(&window, native::undock);
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

/// For the window's Destroyed event: never leave a strip reserved behind a closed window.
pub fn release(window: &tauri::Window) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::undock(hwnd.0 as isize);
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_strip_is_full_width_at_the_bottom_of_the_monitor() {
        assert_eq!(bottom_strip((0, 0, 1920, 1080), 240), (0, 840, 1920, 1080));
        // A second monitor to the left, at negative coordinates.
        assert_eq!(bottom_strip((-2560, 0, 0, 1440), 300), (-2560, 1140, 0, 1440));
    }

    #[test]
    fn the_height_is_kept_between_a_grabbable_minimum_and_half_the_monitor() {
        assert_eq!(bottom_strip((0, 0, 1920, 1080), 10), (0, 1080 - MIN_HEIGHT, 1920, 1080));
        assert_eq!(bottom_strip((0, 0, 1920, 1080), 900), (0, 540, 1920, 1080));
    }
}
