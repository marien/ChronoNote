//! Peek docked to the bottom of the screen (§393, experimental): the window registers as an application desktop
//! toolbar ("AppBar", like the taskbar), so Windows reserves a strip along the bottom of its monitor and every other
//! window treats the rest as the whole screen: a maximized Teams call fills the top part, Peek the strip below it.
//!
//! While docked the window's own messages are watched (a subclass, §394): during any move or resize it stays full
//! width with its bottom on the strip (so the header cannot move it, and dragging the top edge only changes the
//! height, live), and when the drag ends the strip is reserved again at the new height, which is sent to the page
//! (`peek-dock-height`) to remember. Corners are square while docked, like a maximized window.
//!
//! The strip must always be given back (`peek_undock`, and `release` when the window is destroyed): a registration
//! that outlives the window can leave the space reserved until Explorer notices.

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

/// Where a docked window may be while it is moved or resized, in OUTER coordinates (frame included): the left edge
/// and width stay, the bottom stays on the strip, only the height may change, within `min_cy..=max_cy`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Anchor {
    pub left: i32,
    pub width: i32,
    pub bottom: i32,
    pub min_cy: i32,
    pub max_cy: i32,
}

/// What a move/resize request (`x, y, cx, cy` and whether it moves / sizes) becomes for a docked window: a resize keeps
/// the bottom on the strip and the full width; a plain move is refused (the position stays). Returns the new
/// `(x, y, cx, cy, moves)`.
pub fn anchored(a: Anchor, current_cy: i32, req: (i32, i32, i32, i32), sizes: bool, moves: bool) -> (i32, i32, i32, i32, bool) {
    let (x, y, cx, cy) = req;
    if sizes {
        let cy = cy.clamp(a.min_cy, a.max_cy.max(a.min_cy));
        (a.left, a.bottom - cy, a.width, cy, true)
    } else if moves {
        (a.left, a.bottom - current_cy, cx, cy, true)
    } else {
        (x, y, cx, cy, false)
    }
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::sync::Mutex;
    use tauri::Emitter;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
    };
    use windows::Win32::Graphics::Gdi::{ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, RemoveWindowSubclass, SHAppBarMessage, SetWindowSubclass, ABE_BOTTOM, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE,
        ABM_SETPOS, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowRect, IsIconic, SetWindowPos, SIZE_MINIMIZED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOZORDER, WINDOWPOS, WM_APP, WM_ENTERSIZEMOVE, WM_EXITSIZEMOVE, WM_NCDESTROY, WM_SIZE, WM_WINDOWPOSCHANGED,
        WM_WINDOWPOSCHANGING,
    };

    const SUBCLASS_ID: usize = 0x5045_454b; // "PEEK"

    struct State {
        hwnd: isize,
        /// None while the window is being placed by `dock` itself.
        anchor: Option<Anchor>,
        /// Content height the strip is reserved at now.
        height: i32,
        /// Inside a mouse move/resize (between WM_ENTERSIZEMOVE and WM_EXITSIZEMOVE).
        dragging: bool,
        /// Registered as an AppBar now. False while the window is minimized (§395): a minimized Peek reserves nothing.
        registered: bool,
        /// For telling the page the new height after a drag.
        window: tauri::WebviewWindow,
    }

    static STATE: Mutex<Option<State>> = Mutex::new(None);

    fn data(hwnd: HWND) -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            // Windows sends this when the taskbar or the screen layout changes; not handled (yet).
            uCallbackMessage: WM_APP + 0x51,
            uEdge: ABE_BOTTOM,
            ..Default::default()
        }
    }

    /// The frame around the content: (left, top, right, bottom) insets from the outer rectangle.
    fn insets(hwnd: HWND) -> Result<(i32, i32, i32, i32), String> {
        unsafe {
            let mut outer = RECT::default();
            let mut client = RECT::default();
            GetWindowRect(hwnd, &mut outer).map_err(|e| e.to_string())?;
            GetClientRect(hwnd, &mut client).map_err(|e| e.to_string())?;
            let mut origin = POINT::default();
            let _ = ClientToScreen(hwnd, &mut origin);
            Ok((
                origin.x - outer.left,
                origin.y - outer.top,
                outer.right - (origin.x + client.right),
                outer.bottom - (origin.y + client.bottom),
            ))
        }
    }

    /// Puts the window's CONTENT exactly on `rc` (the frame is added outside); repeated like `peek_window::place`, for
    /// a move onto a monitor with other scaling.
    fn place_client(hwnd: HWND, rc: RECT) -> Result<(), String> {
        for _ in 0..3 {
            let (l, t, r, b) = insets(hwnd)?;
            unsafe {
                SetWindowPos(
                    hwnd,
                    None,
                    rc.left - l,
                    rc.top - t,
                    (rc.right - rc.left) + l + r,
                    (rc.bottom - rc.top) + t + b,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                )
                .map_err(|e| e.to_string())?;
                let mut origin = POINT::default();
                let mut client = RECT::default();
                let _ = ClientToScreen(hwnd, &mut origin);
                GetClientRect(hwnd, &mut client).map_err(|e| e.to_string())?;
                if origin.x == rc.left && origin.y == rc.top && client.right == rc.right - rc.left && client.bottom == rc.bottom - rc.top {
                    break;
                }
            }
        }
        Ok(())
    }

    fn set_corners(hwnd: HWND, square: bool) {
        let pref: DWM_WINDOW_CORNER_PREFERENCE = if square { DWMWCP_DONOTROUND } else { DWMWCP_DEFAULT };
        unsafe {
            // Windows 10 has no rounded corners and answers with an error: nothing to do there.
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &pref as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
            );
        }
    }

    /// Reserves the strip at `height` (content pixels) and places the window on it. Called on the UI thread.
    fn reserve(hwnd: HWND, height: i32) -> Result<DockRect, String> {
        unsafe {
            let mut abd = data(hwnd);
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Err("couldn't read the screen Peek is on".into());
            }
            let m = info.rcMonitor;
            let (l, t, r, b) = bottom_strip((m.left, m.top, m.right, m.bottom), height);
            abd.rc = RECT { left: l, top: t, right: r, bottom: b };
            // Windows moves the proposed strip clear of other docked windows (the taskbar); then it is fixed at our
            // height again from that bottom and reserved.
            SHAppBarMessage(ABM_QUERYPOS, &mut abd);
            abd.rc.top = abd.rc.bottom - (b - t);
            SHAppBarMessage(ABM_SETPOS, &mut abd);

            // Placing it must not be held by the anchor of the previous height.
            if let Some(s) = STATE.lock().unwrap().as_mut() {
                s.anchor = None;
            }
            place_client(hwnd, abd.rc)?;
            let (il, it, ir, ib) = insets(hwnd)?;
            let anchor = Anchor {
                left: abd.rc.left - il,
                width: (abd.rc.right - abd.rc.left) + il + ir,
                bottom: abd.rc.bottom + ib,
                min_cy: MIN_HEIGHT + it + ib,
                max_cy: ((m.bottom - m.top) / 2).max(MIN_HEIGHT) + it + ib,
            };
            if let Some(s) = STATE.lock().unwrap().as_mut() {
                s.anchor = Some(anchor);
                s.height = abd.rc.bottom - abd.rc.top;
            }
            Ok(DockRect {
                x: abd.rc.left,
                y: abd.rc.top,
                width: abd.rc.right - abd.rc.left,
                height: abd.rc.bottom - abd.rc.top,
            })
        }
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        match msg {
            WM_WINDOWPOSCHANGING if !unsafe { IsIconic(hwnd) }.as_bool() => {
                let anchor = STATE.lock().ok().and_then(|s| s.as_ref().and_then(|s| s.anchor));
                if let Some(a) = anchor {
                    let wp = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
                    let sizes = (wp.flags & SWP_NOSIZE).0 == 0;
                    let moves = (wp.flags & SWP_NOMOVE).0 == 0;
                    let mut current = RECT::default();
                    let _ = unsafe { GetWindowRect(hwnd, &mut current) };
                    let (x, y, cx, cy, move_now) =
                        anchored(a, current.bottom - current.top, (wp.x, wp.y, wp.cx, wp.cy), sizes, moves);
                    wp.x = x;
                    wp.y = y;
                    wp.cx = cx;
                    wp.cy = cy;
                    if move_now {
                        wp.flags &= !SWP_NOMOVE;
                    }
                }
            }
            WM_ENTERSIZEMOVE => {
                if let Some(s) = STATE.lock().unwrap().as_mut() {
                    s.dragging = true;
                }
            }
            WM_EXITSIZEMOVE => {
                // The drag is over: reserve the strip at the height the window has now, and tell the page.
                let docked = STATE.lock().ok().and_then(|mut s| {
                    s.as_mut().map(|s| {
                        s.dragging = false;
                        (s.anchor.is_some(), s.window.clone())
                    })
                });
                if let Some((true, window)) = docked {
                    rereserve(hwnd, &window);
                }
            }
            WM_WINDOWPOSCHANGED => {
                // A size change outside a mouse drag (a keyboard shortcut, another program): follow it as well.
                let changed = STATE.lock().ok().and_then(|s| {
                    s.as_ref().and_then(|s| {
                        // Minimized, the window reports a height of 0: that is not a new strip height.
                        if s.anchor.is_none() || s.dragging || !s.registered || unsafe { IsIconic(hwnd) }.as_bool() {
                            return None;
                        }
                        let mut client = RECT::default();
                        let ok = unsafe { GetClientRect(hwnd, &mut client) }.is_ok();
                        (ok && (client.bottom - s.height).abs() > 1).then(|| s.window.clone())
                    })
                });
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                if let Some(window) = changed {
                    rereserve(hwnd, &window);
                }
                return result;
            }
            WM_SIZE => {
                // §395: minimizing gives the strip back; restoring reserves it again at the height it had.
                let minimized = wparam.0 as u32 == SIZE_MINIMIZED;
                let action = STATE.lock().ok().and_then(|mut s| {
                    s.as_mut().and_then(|s| {
                        if s.anchor.is_none() {
                            None
                        } else if minimized && s.registered {
                            s.registered = false;
                            Some((false, s.height, s.window.clone()))
                        } else if !minimized && !s.registered {
                            s.registered = true;
                            Some((true, s.height, s.window.clone()))
                        } else {
                            None
                        }
                    })
                });
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                match action {
                    Some((false, _, _)) => unsafe {
                        let mut abd = data(hwnd);
                        SHAppBarMessage(ABM_REMOVE, &mut abd);
                    },
                    Some((true, height, _window)) => unsafe {
                        let mut abd = data(hwnd);
                        SHAppBarMessage(ABM_NEW, &mut abd);
                        let _ = reserve(hwnd, height);
                    },
                    None => {}
                }
                return result;
            }
            WM_NCDESTROY => {
                let _ = unsafe { RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID) };
            }
            _ => {}
        }
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    /// Reserves the strip again at the window's current content height and tells the page the height it got.
    fn rereserve(hwnd: HWND, window: &tauri::WebviewWindow) {
        let mut client = RECT::default();
        if unsafe { GetClientRect(hwnd, &mut client) }.is_ok() {
            if let Ok(rc) = reserve(hwnd, client.bottom) {
                let _ = window.emit("peek-dock-height", rc.height);
            }
        }
    }

    pub fn dock(window: tauri::WebviewWindow, hwnd: isize, height: i32) -> Result<DockRect, String> {
        let h = HWND(hwnd as _);
        {
            let mut state = STATE.lock().unwrap();
            if state.is_none() {
                let mut abd = data(h);
                if unsafe { SHAppBarMessage(ABM_NEW, &mut abd) } == 0 {
                    return Err("Windows did not accept Peek as a docked window".into());
                }
                unsafe {
                    let _ = SetWindowSubclass(h, Some(subclass_proc), SUBCLASS_ID, 0);
                }
                set_corners(h, true);
                *state = Some(State { hwnd, anchor: None, height, dragging: false, registered: true, window });
            }
        }
        reserve(h, height)
    }

    pub fn undock(hwnd: isize) {
        let was = STATE.lock().ok().and_then(|mut s| s.take());
        if let Some(s) = was {
            let h = HWND(s.hwnd as _);
            let _ = hwnd;
            unsafe {
                let _ = RemoveWindowSubclass(h, Some(subclass_proc), SUBCLASS_ID);
                if s.registered {
                    let mut abd = data(h);
                    SHAppBarMessage(ABM_REMOVE, &mut abd);
                }
            }
            set_corners(h, false);
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
    {
        let w = window.clone();
        on_main_thread(&window, move |hwnd| native::dock(w, hwnd, height as i32))?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, height);
        Err("docking Peek is only available on Windows".into())
    }
}

/// Gives the reserved strip back (and the normal corners). Safe to call when not docked.
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

    const A: Anchor = Anchor { left: -11, width: 1942, bottom: 1051, min_cy: 70, max_cy: 550 };

    #[test]
    fn dragging_the_top_edge_only_changes_the_height_and_keeps_the_bottom_on_the_strip() {
        // The window asks for its top 100 px higher and 100 px taller: it gets exactly that, at full width.
        assert_eq!(anchored(A, 250, (-11, 701, 1942, 350), true, true), (-11, 701, 1942, 350, true));
        // Dragging a side or the bottom edge: still full width, bottom on the strip.
        assert_eq!(anchored(A, 250, (200, 801, 900, 400), true, false), (-11, 651, 1942, 400, true));
    }

    #[test]
    fn the_height_stays_between_the_limits_while_dragging() {
        assert_eq!(anchored(A, 250, (-11, 0, 1942, 2000), true, true), (-11, 1051 - 550, 1942, 550, true));
        assert_eq!(anchored(A, 250, (-11, 1040, 1942, 11), true, true), (-11, 1051 - 70, 1942, 70, true));
    }

    #[test]
    fn a_plain_move_is_refused() {
        // Dragging the header: the position goes back to the strip, the size is untouched.
        assert_eq!(anchored(A, 250, (300, 400, 1942, 250), false, true), (-11, 801, 1942, 250, true));
        // Neither moving nor sizing: left alone.
        assert_eq!(anchored(A, 250, (1, 2, 3, 4), false, false), (1, 2, 3, 4, false));
    }
}
