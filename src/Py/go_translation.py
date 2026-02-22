"""
 * Blur Auto Clicker - go_translation.py
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
import ctypes
import os
import threading
import sys

DEBUG_MODE = True


def debug_log(message):
    if DEBUG_MODE:
        print(message)


try:

    def get_base_dir():
        if getattr(sys, 'frozen', False):
            return os.path.join(getattr(sys, '_MEIPASS', os.path.dirname(sys.executable)), "src", "Rust")
        else:
            py_dir = os.path.dirname(os.path.abspath(__file__))
            src_dir = os.path.dirname(py_dir)
            return os.path.join(src_dir, "Rust")

    dll_dir = get_base_dir()
    dll_path = os.path.join(dll_dir, "clicker_engine.dll")

    print(f"Looking for DLL at: {dll_path}")
    print(f"File exists: {os.path.exists(dll_path)}")

    if not os.path.exists(dll_path):
        raise FileNotFoundError(f"DLL not found at: {dll_path}")

    clicker_lib = ctypes.WinDLL(dll_path)

    clicker_lib.start_clicker.argtypes = [
        ctypes.c_double,
        ctypes.c_double,
        ctypes.c_int,
        ctypes.c_double,
        ctypes.c_double,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_double,
        ctypes.c_double,
        ctypes.c_int,
    ]
    clicker_lib.start_clicker.restype = None

    clicker_lib.stop_clicker.argtypes = []
    clicker_lib.stop_clicker.restype = None

    debug_log("[go_translation] Engine loaded successfully.")

except Exception as e:
    debug_log(f"[go_translation] CRITICAL ERROR: Could not load DLL - {e}")

    class DummyLib:
        def start_clicker(self, *args): pass
        def stop_clicker(self): pass
    clicker_lib = DummyLib()


def start_clicker(settings_dict, callback=None):
    raw_amount = settings_dict.get('click_amount', 1)
    raw_unit = settings_dict.get('click_unit', 's')

    amount = float(raw_amount)
    if amount <= 0:
        amount = 1

    unit = raw_unit.lower()
    if unit == 'second':
        real_interval = 1 / amount
    elif unit == 'minute':
        real_interval = 60 / amount
    elif unit == 'hour':
        real_interval = 3600 / amount
    elif unit == 'day':
        real_interval = 86400 / amount
    else:
        real_interval = 1 / amount

    btn_str = settings_dict.get('click_button', 'left')
    if btn_str == 'left':
        btn_int = 1
    elif btn_str == 'right':
        btn_int = 2
    elif btn_str == 'middle':
        btn_int = 3
    else:
        btn_int = 1

    smoothing_enabled = 1 if settings_dict.get(
        'click_position_smoothing', False) else 0

    def run_thread():
        try:
            clicker_lib.start_clicker(
                real_interval,
                settings_dict.get('click_variation', 0),
                settings_dict.get('click_limit', 0),
                settings_dict.get('click_duty_cycle', 50),
                settings_dict.get('click_time_limit', 0),
                btn_int,
                int(settings_dict.get('click_position', (0, 0))[0]),
                int(settings_dict.get('click_position', (0, 0))[1]),
                settings_dict.get('click_position_offset', 0),
                settings_dict.get('click_position_offset_chance', 0),
                smoothing_enabled,
            )
        finally:
            if callback:
                callback()

    t = threading.Thread(target=run_thread)
    t.start()


def stop_clicker():
    clicker_lib.stop_clicker()
