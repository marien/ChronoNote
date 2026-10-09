//! Windows 11 Snap Layouts for the custom maximize button (§B1). Recipe (and its pitfalls) after
//! https://dev.to/zbrooklyn/windows-11-snap-layouts-in-a-frameless-tauri-app-the-part-every-guide-gets-wrong-2fjh
//!
//! The title bar is drawn by the page (`decorations: false`), so Windows never learns where the maximize button is:
//! the Snap Layouts flyout appears when a window answers `WM_NCHITTEST` with `HTMAXBUTTON`, and here the WebView2
//! child window receives the pointer, not our window. The usual fix (Windows Terminal, VS Code, Electron) is a small
//! invisible native child window over the page's maximize button whose window procedure answers `HTMAXBUTTON`. It
//! then also gets the clicks, so it maximizes/restores the window itself, and it tells the page when the pointer
//! enters or leaves it (`snap-overlay-hover`), because the page no longer sees the pointer there.
//!
//! The page reports the button's rectangle (client-area physical pixels) with `snap_overlay_set_rect` whenever the
//! layout changes, and hides the overlay (zero size) in Zen, Peek and on other platforms nothing happens at all.

#[cfg(windows)]
mod imp {
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, NULL_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, GetParent, IsZoomed, RegisterClassW, SetWindowPos, ShowWindow, HTMAXBUTTON,
        HWND_TOP, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_MAXIMIZE, SW_RESTORE, WINDOW_EX_STYLE,
        WM_ERASEBKGND, WM_NCHITTEST, WM_NCLBUTTONDBLCLK, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE,
        WM_NCMOUSEMOVE, WNDCLASSW, WS_CHILD, WS_CLIPSIBLINGS,
    };

    /// The overlay's HWND (as isize so the static is Send), created on first use.
    static OVERLAY: Mutex<Option<isize>> = Mutex::new(None);
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static HOVERING: Mutex<bool> = Mutex::new(false);
    static PRESSED: Mutex<bool> = Mutex::new(false);

    const CLASS_NAME: PCWSTR = w!("ChronoNoteSnapOverlay");

    fn set_hover(on: bool) {
        let mut h = HOVERING.lock().unwrap();
        if *h != on {
            *h = on;
            if let Some(app) = APP.get() {
                let _ = app.emit("snap-overlay-hover", on);
            }
        }
    }

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            // The one answer that makes Windows 11 offer Snap Layouts on hover.
            WM_NCHITTEST => LRESULT(HTMAXBUTTON as isize),
            // Never paints (null brush, no erase), so the page's own button shows through.
            WM_ERASEBKGND => LRESULT(1),
            WM_NCMOUSEMOVE => {
                if !*HOVERING.lock().unwrap() {
                    let mut tme = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE | TME_NONCLIENT,
                        hwndTrack: hwnd,
                        dwHoverTime: 0,
                    };
                    let _ = TrackMouseEvent(&mut tme);
                    set_hover(true);
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_NCMOUSELEAVE => {
                set_hover(false);
                *PRESSED.lock().unwrap() = false;
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            // Handled here, not by DefWindowProc: on a child window that would try to maximize the child itself.
            WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK => {
                *PRESSED.lock().unwrap() = true;
                LRESULT(0)
            }
            WM_NCLBUTTONUP => {
                let was_pressed = std::mem::replace(&mut *PRESSED.lock().unwrap(), false);
                if was_pressed {
                    if let Ok(parent) = GetParent(hwnd) {
                        let _ = ShowWindow(parent, if IsZoomed(parent).as_bool() { SW_RESTORE } else { SW_MAXIMIZE });
                    }
                }
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe fn create(parent: HWND) -> Result<HWND, String> {
        let instance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let class = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: instance.into(),
            lpszClassName: CLASS_NAME,
            hbrBackground: HBRUSH(GetStockObject(NULL_BRUSH).0),
            ..Default::default()
        };
        // Registering twice (a second window) fails harmlessly; the class exists.
        RegisterClassW(&class);
        // No extended styles: WS_EX_LAYERED makes Windows skip the window in the caption hit test (and a layered
        // child also needs a Windows 8+ manifest), WS_EX_TRANSPARENT makes it hit-test-transparent outright.
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            CLASS_NAME,
            w!(""),
            WS_CHILD | WS_CLIPSIBLINGS,
            0,
            0,
            0,
            0,
            Some(parent),
            None,
            Some(instance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;
        Ok(hwnd)
    }

    pub fn set_rect(window: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
        let _ = APP.set(window.app_handle().clone());
        let parent = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let result = (|| unsafe {
                    let parent = HWND(parent as _);
                    let mut slot = OVERLAY.lock().unwrap();
                    let hwnd = match *slot {
                        Some(h) => HWND(h as _),
                        None => {
                            let h = create(parent)?;
                            *slot = Some(h.0 as isize);
                            h
                        }
                    };
                    if width <= 0 || height <= 0 {
                        set_hover(false);
                        SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_HIDEWINDOW | SWP_NOACTIVATE)
                            .map_err(|e| e.to_string())
                    } else {
                        // HWND_TOP among the window's children: above the WebView2 host window.
                        SetWindowPos(hwnd, Some(HWND_TOP), x, y, width, height, SWP_SHOWWINDOW | SWP_NOACTIVATE)
                            .map_err(|e| e.to_string())
                    }
                })();
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
}

/// Places the Snap Layouts overlay over the page's maximize button: client-area physical pixels; a zero size hides
/// it. Windows only; elsewhere a no-op.
#[tauri::command]
pub async fn snap_overlay_set_rect(window: tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    #[cfg(windows)]
    return imp::set_rect(&window, x, y, width, height);
    #[cfg(not(windows))]
    {
        let _ = (window, x, y, width, height);
        Ok(())
    }
}
