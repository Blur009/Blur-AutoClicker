/// Linux stub: sequence point picking uses Win32 hooks which aren't available on Linux.
/// We provide a no-op implementation.
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::mouse::current_virtual_screen_rect;

pub fn start_sequence_point_pick_inner(app: AppHandle) -> Result<(), String> {
    // On Linux, we can't use global mouse hooks easily.
    // For now, stub as no-op — the feature works via the clicker engine's
    // sequence system without interactive picking.
    log::info!("[SequencePicker] Interactive picking not available on Linux; use settings panel.");
    app.state::<crate::ClickerState>()
        .sequence_pick_active
        .store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

pub fn cancel_sequence_point_pick_inner(app: &AppHandle) {
    app.state::<crate::ClickerState>()
        .sequence_pick_active
        .store(false, std::sync::atomic::Ordering::SeqCst);
}