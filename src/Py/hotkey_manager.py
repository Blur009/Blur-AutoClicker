"""
 * Blur Auto Clicker - hotkey_manager.py
 * Copyright (C) 2026  [Blur009]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Made with Spite. (the emotion)
 *
"""
import threading
import keyboard
import time

# Module-level state
_registered_hotkey = None
_keybind_hotkey = None
_keybind_mode = "toggle"
_hold_monitor_running = False
_toggle_callback = None
_log_func = None
_ui_widgets = None
_is_clicking = False


def initialize(ui_widgets, log_func):
    #Initialize the hotkey manager with UI widgets and logging function.
    global _ui_widgets, _log_func
    _ui_widgets = ui_widgets
    _log_func = log_func


def set_keybind(hotkey_str):
    #Set the current keybind.
    global _keybind_hotkey
    _keybind_hotkey = hotkey_str


def set_toggle_callback(callback):
    #Set the callback function for toggling the clicker.
    global _toggle_callback
    _toggle_callback = callback


def get_keybind():
    #Get the current keybind.
    return _keybind_hotkey


def register_hotkey():
    #Register the hotkey with the keyboard module.
    global _registered_hotkey

    if _registered_hotkey and isinstance(_registered_hotkey, str):
        try:
            keyboard.remove_hotkey(_registered_hotkey)
        except KeyError:
            pass
        _registered_hotkey = None

    if not _keybind_hotkey:
        return

    def on_hotkey_trigger():
        if not keyboard.is_pressed(str(_keybind_hotkey)):
            return
        if _keybind_mode == "toggle":
            if _toggle_callback:
                _toggle_callback()
        elif _keybind_mode == "hold":
            _start_hold_monitor(str(_keybind_hotkey))

    try:
        keyboard.add_hotkey(_keybind_hotkey, on_hotkey_trigger)
        _registered_hotkey = _keybind_hotkey
        if _log_func:
            _log_func(
                f"[Hotkey] Registered: {_keybind_hotkey} ({_keybind_mode})")
    except Exception as e:
        if _log_func:
            _log_func(f"[Hotkey] Failed to register '{_keybind_hotkey}': {e}")


def _start_hold_monitor(hotkey_str):
    #Start monitoring for hold mode.
    global _hold_monitor_running
    if _hold_monitor_running:
        return
    _hold_monitor_running = True
    t = threading.Thread(target=_hold_monitor_loop,
                         args=(hotkey_str,), daemon=True)
    t.start()


def _hold_monitor_loop(hotkey_str):
    #Monitor loop for hold mode.
    global _hold_monitor_running
    try:
        if _toggle_callback:
            _toggle_callback()
        while keyboard.is_pressed(hotkey_str):
            time.sleep(0.05)
        if _toggle_callback:
            _toggle_callback()
    finally:
        _hold_monitor_running = False


def set_keybind_mode():
    #Update keybind mode based on UI selection.
    global _keybind_mode
    if not _ui_widgets:
        return

    mode_text = _ui_widgets.activation_type_combobox.currentText().lower()
    if "hold" in mode_text:
        _keybind_mode = "hold"
    else:
        _keybind_mode = "toggle"
    register_hotkey()


def on_keybind_changed():
    #Handle keybind change from UI.
    global _keybind_hotkey
    if not _ui_widgets:
        return

    seq = _ui_widgets.key_sequence.keySequence()
    key_string = seq.toString().lower().replace("meta", "win")
    if key_string:
        _keybind_hotkey = key_string
        if _log_func:
            _log_func(f"Keybind set to: {_keybind_hotkey}")
        register_hotkey()
    else:
        if _log_func:
            _log_func("Keybind cleared")


def stop_clicker():
    global _is_clicking
    if _is_clicking:
        _is_clicking = False
