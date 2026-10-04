//! Peek mode's window placement: size and position in ONE native call.
//!
//! Peek resizes its window often (the "on hover" header strip grows and shrinks it as the pointer enters and
//! leaves). Tauri only offers `set_size` and `set_position` separately, and an undecorated window comes out a little
//! larger than asked for the invisible resize border, which had to be read back and corrected with yet another
//! `set_size` - together three or four visible steps, with the bottom edge of the window moving between them. This
//! command takes the wanted CLIENT size and the outer position and applies them with a single `SetWindowPos`.

/// `width`/`height`: the size of the content area (what the page gets); `x`/`y`: the outer top-left corner (what
/// `outerPosition` reports). All physical pixels.
#[cfg(windows)]
fn place(hwnd: isize, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };

    let hwnd = HWND(hwnd as _);
    unsafe {
        let mut outer = RECT::default();
        let mut client = RECT::default();
        GetWindowRect(hwnd, &mut outer).map_err(|e| e.to_string())?;
        GetClientRect(hwnd, &mut client).map_err(|e| e.to_string())?;
        // What the window adds around its content (frame, invisible resize border), measured as it is now.
        let extra_w = (outer.right - outer.left) - (client.right - client.left);
        let extra_h = (outer.bottom - outer.top) - (client.bottom - client.top);
        SetWindowPos(
            hwnd,
            None,
            x,
            y,
            (width + extra_w).max(1),
            (height + extra_h).max(1),
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
        .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
fn on_main_thread(window: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(place(hwnd, x, y, width, height));
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

/// Moves and resizes the window in one step. Windows only; elsewhere it falls back to the two Tauri calls.
#[tauri::command]
pub async fn peek_set_bounds(window: tauri::WebviewWindow, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    #[cfg(windows)]
    return on_main_thread(&window, x, y, width as i32, height as i32);
    #[cfg(not(windows))]
    {
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())
    }
}
