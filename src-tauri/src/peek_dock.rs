//! Peek docked to the bottom of the screen (§393, experimental): the window registers as an application desktop
//! toolbar ("AppBar", like the taskbar), so Windows reserves a strip along the bottom of its monitor and every other
//! window treats the rest as the whole screen: a maximized Teams call fills the top part, Peek the strip below it.
//!
//! While docked the window's own messages are watched (a subclass, §394): during any move or resize it stays full
//! width with its bottom on the strip (so the header cannot move it, and dragging the top edge only changes the
//! height, live), and when the drag ends the strip is reserved again at the new height, which is sent to the page
//! (`peek-dock-height`) to remember. Corners are square while docked, like a maximized window.
//!
//! When the screens change while docked (a monitor plugged in or out, a docking station, §398/§404), the strip is given
//! back and the page is told (`peek-dock-lost`) so it floats Peek instead. §404: the check runs on every signal Windows
//! gives during such a change (the move of the window off a monitor that went away, the display change, the DPI change,
//! the AppBar notification), and the hold on the window is dropped at once, before Windows moves it: holding it to the
//! strip of a monitor that no longer exists put the window off screen. A move onto another monitor counts as a change
//! too, and re-reserving after a move never adopts a new screen layout silently.
//!
//! The strip must always be given back (`peek_undock`, and `release` when the window is destroyed): a registration
//! that outlives the window can leave the space reserved until Explorer notices. Docking is all or nothing (§404): if
//! any step fails, everything done so far is undone.
//!
//! Logging (§404): dock, undock, a lost dock and every screen check that finds a change are written to the app log
//! (level PEEK); the window moves held to the strip and the notifications from Windows go to the flight recorder.

/// The strip's height is kept between these (physical pixels): never so thin that it cannot be grabbed, never more than
/// half the monitor.
const MIN_HEIGHT: i32 = 60;

pub type Rect = (i32, i32, i32, i32);

#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// What the page can ask about the native side (§404), to compare with what it believes and repair a mismatch.
#[derive(serde::Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    /// The native side holds the window (subclass installed, state kept).
    pub docked: bool,
    /// Registered as an AppBar now (false while minimized).
    pub registered: bool,
    /// A screen change was found and the undock is on its way.
    pub lost_pending: bool,
    /// The window's outer rectangle and the work area of its monitor, `[left, top, right, bottom]`.
    pub window: Option<[i32; 4]>,
    pub work: Option<[i32; 4]>,
    pub monitors: u32,
}

/// The wanted strip along the bottom of a monitor (`left, top, right, bottom`, physical pixels), before Windows moves
/// it above the taskbar: full width, `height` tall, clamped.
pub fn bottom_strip(monitor: Rect, height: i32) -> Rect {
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

/// The screens when the strip was reserved: every monitor's rectangle (sorted) and the one the strip is on.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Screens {
    pub monitors: Vec<Rect>,
    pub strip: Rect,
}

/// Whether the dock has to go (§398, §404), and why: the set of monitors changed (one came or went, moved, or changed
/// size), or the window is now on another monitor than the strip's. `None` = still valid. `window_monitor` is the
/// monitor the window is on now, if known.
pub fn dock_lost_reason(saved: &Screens, monitors_now: &[Rect], window_monitor: Option<Rect>) -> Option<&'static str> {
    let mut now = monitors_now.to_vec();
    now.sort();
    if now != saved.monitors {
        return Some(if now.len() != saved.monitors.len() { "a monitor came or went" } else { "a monitor moved or changed size" });
    }
    match window_monitor {
        Some(m) if m != saved.strip => Some("the window is on another monitor now"),
        _ => None,
    }
}

fn fmt_rect(r: Rect) -> String {
    format!("[{},{} {}x{}]", r.0, r.1, r.2 - r.0, r.3 - r.1)
}

fn fmt_monitors(ms: &[Rect]) -> String {
    ms.iter().map(|&m| fmt_rect(m)).collect::<Vec<_>>().join(" ")
}

#[cfg(windows)]
mod native {
    use super::*;
    use crate::applog;
    use std::sync::Mutex;
    use tauri::Emitter;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
    };
    use windows::Win32::Graphics::Gdi::{
        ClientToScreen, EnumDisplayMonitors, GetMonitorInfoW, MonitorFromRect, MonitorFromWindow, HDC, HMONITOR,
        MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::Shell::{
        DefSubclassProc, RemoveWindowSubclass, SHAppBarMessage, SetWindowSubclass, ABE_BOTTOM, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE,
        ABM_SETPOS, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowRect, IsIconic, PostMessageW, SetWindowPos, SIZE_MINIMIZED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_NOZORDER, WINDOWPOS, WM_APP, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_ENTERSIZEMOVE, WM_EXITSIZEMOVE,
        WM_NCDESTROY, WM_POWERBROADCAST, WM_SIZE, WM_WINDOWPOSCHANGED, WM_WINDOWPOSCHANGING,
    };

    /// WM_POWERBROADCAST: resumed after sleep (automatic, and after user input).
    const PBT_APMRESUMEAUTOMATIC: usize = 0x12;
    const PBT_APMRESUMESUSPEND: usize = 0x7;

    const SUBCLASS_ID: usize = 0x5045_454b; // "PEEK"
    /// Windows sends this to an AppBar when the taskbar, another AppBar or the screen layout changes.
    const APPBAR_CALLBACK: u32 = WM_APP + 0x51;
    /// Posted to ourselves to undock after a screen change, outside the message that found it.
    const DOCK_LOST: u32 = WM_APP + 0x52;
    /// `ABN_POSCHANGED`: the AppBar should check its position again.
    const ABN_POSCHANGED: usize = 1;

    struct State {
        hwnd: isize,
        /// None while the window is being placed by `dock` itself, and once a screen change was found.
        anchor: Option<Anchor>,
        /// Content height the strip is reserved at now.
        height: i32,
        /// Inside a mouse move/resize (between WM_ENTERSIZEMOVE and WM_EXITSIZEMOVE).
        dragging: bool,
        /// Registered as an AppBar now. False while the window is minimized (§395): a minimized Peek reserves nothing.
        registered: bool,
        /// For telling the page the new height after a drag, and that the dock was lost.
        window: tauri::WebviewWindow,
        /// The screens when the strip was last reserved (§398, §404).
        screens: Option<Screens>,
        /// A screen change was found; the undock is posted (§404).
        lost_pending: bool,
        /// The strip last reserved, so a repeat of the same reservation is not logged as an event (§404).
        last_strip: Option<Rect>,
    }

    static STATE: Mutex<Option<State>> = Mutex::new(None);

    fn rect(r: RECT) -> Rect {
        (r.left, r.top, r.right, r.bottom)
    }

    fn data(hwnd: HWND) -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            uCallbackMessage: APPBAR_CALLBACK,
            uEdge: ABE_BOTTOM,
            ..Default::default()
        }
    }

    unsafe extern "system" fn collect_monitor(m: HMONITOR, _hdc: HDC, _rc: *mut RECT, out: LPARAM) -> BOOL {
        let list = unsafe { &mut *(out.0 as *mut Vec<Rect>) };
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if unsafe { GetMonitorInfoW(m, &mut info) }.as_bool() {
            list.push(rect(info.rcMonitor));
        }
        BOOL(1)
    }

    /// Every monitor's rectangle, sorted.
    fn monitors_now() -> Vec<Rect> {
        let mut list: Vec<Rect> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(collect_monitor), LPARAM(&mut list as *mut Vec<Rect> as isize));
        }
        list.sort();
        list
    }

    /// The monitor the window is on now and its work area.
    fn window_monitor(hwnd: HWND) -> Option<(Rect, Rect)> {
        unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            GetMonitorInfoW(monitor, &mut info).as_bool().then(|| (rect(info.rcMonitor), rect(info.rcWork)))
        }
    }

    fn window_rect(hwnd: HWND) -> Option<Rect> {
        let mut r = RECT::default();
        unsafe { GetWindowRect(hwnd, &mut r) }.ok().map(|_| rect(r))
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
        let (m, work_before) = window_monitor(hwnd).ok_or("couldn't read the screen Peek is on")?;
        unsafe {
            let mut abd = data(hwnd);
            let (l, t, r, b) = bottom_strip(m, height);
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
                max_cy: ((m.3 - m.1) / 2).max(MIN_HEIGHT) + it + ib,
            };
            let monitors = monitors_now();
            let strip = rect(abd.rc);
            let same_as_before = STATE.lock().unwrap().as_mut().map(|s| {
                let same = s.last_strip == Some(strip);
                s.anchor = Some(anchor);
                s.height = abd.rc.bottom - abd.rc.top;
                s.screens = Some(Screens { monitors: monitors.clone(), strip: m });
                s.last_strip = Some(strip);
                same
            });
            let work_after = window_monitor(hwnd).map(|(_, w)| w);
            let line = format!(
                "reserve: strip {} on monitor {} (monitors {}), work area {} -> {}",
                fmt_rect(strip),
                fmt_rect(m),
                fmt_monitors(&monitors),
                fmt_rect(work_before),
                work_after.map(fmt_rect).unwrap_or_else(|| "?".into())
            );
            // Windows answers our own reservation with an AppBar notification, and we take the same strip again: only
            // a strip that changed is an event; the repeats go to the flight recorder.
            if same_as_before == Some(true) {
                applog::detail(&line);
            } else {
                applog::write("PEEK", &line);
            }
            Ok(DockRect {
                x: abd.rc.left,
                y: abd.rc.top,
                width: abd.rc.right - abd.rc.left,
                height: abd.rc.bottom - abd.rc.top,
            })
        }
    }

    /// §404: whether the screens changed since the strip was reserved. If they did, the hold on the window is dropped
    /// at once (so Windows can move it onto a screen that exists) and the undock is posted. Returns true then.
    /// `target` = the monitor a move is about to put the window on (checked instead of where it is now); `force` = a
    /// reason that loses the dock whatever the comparison says (a display-scaling change).
    fn check_screens(hwnd: HWND, why: &str, target: Option<Rect>, force: Option<&'static str>) -> bool {
        let monitors = monitors_now();
        let on = target.or_else(|| window_monitor(hwnd).map(|(m, _)| m));
        let mut lost: Option<(&'static str, Screens)> = None;
        if let Ok(mut s) = STATE.lock() {
            if let Some(s) = s.as_mut() {
                if s.lost_pending {
                    return true;
                }
                if let Some(saved) = s.screens.as_ref() {
                    // While minimized the window's own monitor says nothing; only the monitor set counts then.
                    let window_mon = if unsafe { IsIconic(hwnd) }.as_bool() { None } else { on };
                    if let Some(reason) = force.or_else(|| dock_lost_reason(saved, &monitors, window_mon)) {
                        s.anchor = None;
                        s.lost_pending = true;
                        lost = Some((reason, saved.clone()));
                    }
                }
            }
        }
        match lost {
            Some((reason, saved)) => {
                applog::write(
                    "PEEK",
                    &format!(
                        "screen change ({why}): {reason}; monitors {} -> {}, strip was on {}, window on {}: undocking",
                        fmt_monitors(&saved.monitors),
                        fmt_monitors(&monitors),
                        fmt_rect(saved.strip),
                        on.map(fmt_rect).unwrap_or_else(|| "?".into())
                    ),
                );
                unsafe {
                    let _ = PostMessageW(Some(hwnd), DOCK_LOST, WPARAM(0), LPARAM(0));
                }
                true
            }
            None => false,
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
                    // §404: Windows moving the window off a monitor that went away arrives here first, and so does a
                    // move onto another monitor (Win+Shift+Arrow). Judge by where the move is going, not where the
                    // window is now; hold it to the strip only while the screens are the same.
                    let target = moves.then(|| {
                        let (cx, cy) = if sizes { (wp.cx, wp.cy) } else { (current.right - current.left, current.bottom - current.top) };
                        let to = RECT { left: wp.x, top: wp.y, right: wp.x + cx, bottom: wp.y + cy };
                        let m = unsafe { MonitorFromRect(&to, MONITOR_DEFAULTTONEAREST) };
                        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                        unsafe { GetMonitorInfoW(m, &mut info) }.as_bool().then(|| rect(info.rcMonitor))
                    });
                    if (sizes || moves) && check_screens(hwnd, "window move", target.flatten(), None) {
                        return unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                    }
                    let req = (wp.x, wp.y, wp.cx, wp.cy);
                    let (x, y, cx, cy, move_now) = anchored(a, current.bottom - current.top, req, sizes, moves);
                    // Moves Windows makes on its own are worth keeping; the many steps of the user's own drag are not
                    // (they would push everything else out of the flight recorder).
                    let dragging = STATE.lock().ok().and_then(|s| s.as_ref().map(|s| s.dragging)).unwrap_or(false);
                    if (sizes || moves) && (x, y, cx, cy) != req && !dragging {
                        applog::detail(&format!("held to strip: asked {req:?} -> {:?}", (x, y, cx, cy)));
                    }
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
                    if !check_screens(hwnd, "end of drag", None, None) {
                        rereserve(hwnd, &window);
                    }
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
                // §404: never re-reserve onto a new screen layout without saying so: check first.
                if let Some(window) = changed {
                    if !check_screens(hwnd, "size change", None, None) {
                        rereserve(hwnd, &window);
                    }
                }
                return result;
            }
            WM_SIZE => {
                // §395: minimizing gives the strip back; restoring reserves it again at the height it had.
                let minimized = wparam.0 as u32 == SIZE_MINIMIZED;
                let action = STATE.lock().ok().and_then(|mut s| {
                    s.as_mut().and_then(|s| {
                        if s.lost_pending {
                            None
                        } else if minimized && s.registered && s.screens.is_some() {
                            s.registered = false;
                            Some((false, s.height))
                        } else if !minimized && !s.registered && s.screens.is_some() {
                            // Registered again only after the screen check below passes (§404).
                            Some((true, s.height))
                        } else {
                            None
                        }
                    })
                });
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                match action {
                    Some((false, _)) => unsafe {
                        applog::write("PEEK", "minimized: strip given back");
                        let mut abd = data(hwnd);
                        SHAppBarMessage(ABM_REMOVE, &mut abd);
                    },
                    Some((true, height)) => unsafe {
                        // §404: the screens may have changed while minimized (a dock unplugged overnight).
                        if !check_screens(hwnd, "restore", None, None) {
                            if let Some(s) = STATE.lock().unwrap().as_mut() {
                                s.registered = true;
                            }
                            applog::write("PEEK", "restored: reserving the strip again");
                            let mut abd = data(hwnd);
                            SHAppBarMessage(ABM_NEW, &mut abd);
                            if let Err(e) = reserve(hwnd, height) {
                                applog::write("WARN", &format!("peek: reserving after restore failed: {e}"));
                            }
                        }
                    },
                    None => {}
                }
                return result;
            }
            WM_DISPLAYCHANGE => {
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                applog::detail(&format!("WM_DISPLAYCHANGE {}x{}", lparam.0 & 0xffff, (lparam.0 >> 16) & 0xffff));
                check_screens(hwnd, "display change", None, None);
                return result;
            }
            WM_DPICHANGED => {
                // §404: the strip's height is physical pixels for the old scale; after a scaling change (or a move onto
                // a monitor with other scaling) it no longer matches the page. Float; one click docks again.
                applog::detail(&format!("WM_DPICHANGED dpi {}", wparam.0 & 0xffff));
                check_screens(hwnd, "scale change", None, Some("display scaling changed"));
            }
            WM_POWERBROADCAST => {
                // §404: waking from sleep after the docking station was unplugged may bring no display-change message.
                if wparam.0 == PBT_APMRESUMEAUTOMATIC || wparam.0 == PBT_APMRESUMESUSPEND {
                    applog::detail(&format!("resume from sleep ({})", wparam.0));
                    check_screens(hwnd, "resume from sleep", None, None);
                }
            }
            APPBAR_CALLBACK => {
                applog::detail(&format!("AppBar notification {}", wparam.0));
                if wparam.0 == ABN_POSCHANGED && !check_screens(hwnd, "AppBar notification", None, None) {
                    // The taskbar or another AppBar moved: take the strip again at the same height (standard AppBar
                    // behaviour), on the same screens.
                    let window = STATE.lock().ok().and_then(|s| {
                        s.as_ref().filter(|s| s.registered && !s.dragging && s.anchor.is_some()).map(|s| s.window.clone())
                    });
                    if let Some(window) = window {
                        rereserve(hwnd, &window);
                    }
                }
                return LRESULT(0);
            }
            DOCK_LOST => {
                let window = STATE.lock().ok().and_then(|s| s.as_ref().map(|s| s.window.clone()));
                undock(hwnd.0 as isize, "screens changed");
                if let Some(window) = window {
                    let _ = window.emit("peek-dock-lost", ());
                }
                return LRESULT(0);
            }
            WM_NCDESTROY => {
                // §404: give the strip back while the window handle is still valid (undock also removes this hook).
                undock(hwnd.0 as isize, "window destroyed");
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
            match reserve(hwnd, client.bottom) {
                Ok(rc) => {
                    let _ = window.emit("peek-dock-height", rc.height);
                }
                Err(e) => applog::write("WARN", &format!("peek: reserving the strip again failed: {e}")),
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
                    applog::write("WARN", "peek: Windows did not accept Peek as a docked window (ABM_NEW)");
                    return Err("Windows did not accept Peek as a docked window".into());
                }
                unsafe {
                    let _ = SetWindowSubclass(h, Some(subclass_proc), SUBCLASS_ID, 0);
                }
                set_corners(h, true);
                *state = Some(State {
                    hwnd,
                    anchor: None,
                    height,
                    dragging: false,
                    registered: true,
                    window,
                    screens: None,
                    lost_pending: false,
                    last_strip: None,
                });
            }
        }
        applog::write(
            "PEEK",
            &format!("dock: height {height}, window {}", window_rect(h).map(fmt_rect).unwrap_or_else(|| "?".into())),
        );
        // §404: all or nothing. A failed reserve used to leave the window registered and held while the page believed
        // it was floating (half docked).
        match reserve(h, height) {
            Ok(rc) => Ok(rc),
            Err(e) => {
                applog::write("WARN", &format!("peek: docking failed, undoing it: {e}"));
                undock(hwnd, "docking failed");
                Err(e)
            }
        }
    }

    pub fn undock(hwnd: isize, reason: &str) {
        let was = STATE.lock().ok().and_then(|mut s| s.take());
        match was {
            Some(s) => {
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
                let work = window_monitor(h).map(|(_, w)| fmt_rect(w)).unwrap_or_else(|| "?".into());
                applog::write("PEEK", &format!("undock ({reason}): strip given back, work area now {work}"));
            }
            None => applog::detail(&format!("undock ({reason}): was not docked")),
        }
    }

    pub fn state(hwnd: isize) -> DockState {
        let h = HWND(hwnd as _);
        let (docked, registered, lost_pending) = STATE
            .lock()
            .ok()
            .and_then(|s| s.as_ref().map(|s| (true, s.registered, s.lost_pending)))
            .unwrap_or((false, false, false));
        let to4 = |r: Rect| [r.0, r.1, r.2, r.3];
        DockState {
            docked,
            registered,
            lost_pending,
            window: window_rect(h).map(to4),
            work: window_monitor(h).map(|(_, w)| to4(w)),
            monitors: monitors_now().len() as u32,
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
    return on_main_thread(&window, |hwnd| native::undock(hwnd, "asked by the page"));
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

/// §404: what the native side holds now, for the page's consistency check.
#[tauri::command]
pub async fn peek_dock_state(window: tauri::WebviewWindow) -> Result<DockState, String> {
    #[cfg(windows)]
    return on_main_thread(&window, native::state);
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(DockState::default())
    }
}

/// For the window's Destroyed event: never leave a strip reserved behind a closed window.
pub fn release(window: &tauri::Window) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::undock(hwnd.0 as isize, "window closed");
    }
    #[cfg(not(windows))]
    let _ = window;
}

/// §404: for exits that skip the window's Destroyed event (the updater ends the process itself): give the strip back.
/// Safe from any thread and when not docked.
pub fn release_app(app: &tauri::AppHandle, reason: &str) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        if let Some(w) = app.get_webview_window("main") {
            if let Ok(hwnd) = w.hwnd() {
                native::undock(hwnd.0 as isize, reason);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = (app, reason);
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

    const LAPTOP: Rect = (0, 0, 2560, 1600);
    const EXT_RIGHT: Rect = (2560, 0, 4480, 1080);
    const EXT_LEFT: Rect = (-1920, 0, 0, 1080);

    fn saved(monitors: &[Rect], strip: Rect) -> Screens {
        let mut m = monitors.to_vec();
        m.sort();
        Screens { monitors: m, strip }
    }

    #[test]
    fn the_same_screens_keep_the_dock_in_any_order() {
        let s = saved(&[LAPTOP, EXT_RIGHT], EXT_RIGHT);
        assert_eq!(dock_lost_reason(&s, &[EXT_RIGHT, LAPTOP], Some(EXT_RIGHT)), None);
        // The window's monitor unknown: only the set counts.
        assert_eq!(dock_lost_reason(&s, &[LAPTOP, EXT_RIGHT], None), None);
    }

    #[test]
    fn a_monitor_coming_or_going_loses_the_dock() {
        let s = saved(&[LAPTOP, EXT_RIGHT], EXT_RIGHT);
        assert_eq!(dock_lost_reason(&s, &[LAPTOP], Some(LAPTOP)), Some("a monitor came or went"));
        assert_eq!(dock_lost_reason(&s, &[LAPTOP, EXT_RIGHT, EXT_LEFT], Some(EXT_RIGHT)), Some("a monitor came or went"));
    }

    #[test]
    fn a_monitor_moving_or_changing_size_loses_the_dock() {
        let s = saved(&[LAPTOP, EXT_RIGHT], LAPTOP);
        // The external moved from the right to the left of the laptop: same count, other rectangles.
        assert_eq!(dock_lost_reason(&s, &[LAPTOP, EXT_LEFT], Some(LAPTOP)), Some("a monitor moved or changed size"));
        // A resolution change of the strip's own monitor.
        assert_eq!(dock_lost_reason(&s, &[(0, 0, 1920, 1200), EXT_RIGHT], None), Some("a monitor moved or changed size"));
    }

    #[test]
    fn the_window_landing_on_another_monitor_loses_the_dock() {
        // §404: re-reserving after Windows moved the window used to adopt the new monitor silently.
        let s = saved(&[LAPTOP, EXT_RIGHT], EXT_RIGHT);
        assert_eq!(dock_lost_reason(&s, &[LAPTOP, EXT_RIGHT], Some(LAPTOP)), Some("the window is on another monitor now"));
    }

    #[test]
    fn a_plain_move_is_refused() {
        // Dragging the header: the position goes back to the strip, the size is untouched.
        assert_eq!(anchored(A, 250, (300, 400, 1942, 250), false, true), (-11, 801, 1942, 250, true));
        // Neither moving nor sizing: left alone.
        assert_eq!(anchored(A, 250, (1, 2, 3, 4), false, false), (1, 2, 3, 4, false));
    }
}
