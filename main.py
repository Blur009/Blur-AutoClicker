"""
 * Blur Auto Clicker - main.py
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
import atexit
import os
import sys
import time
import threading
import ctypes
import requests
from configparser import ConfigParser
from datetime import datetime
from os.path import exists
from PySide6.QtCore import QTimer
from PySide6.QtGui import QCursor
from PySide6.QtWidgets import (QApplication, QKeySequenceEdit, QCheckBox, QComboBox,
                               QPushButton, QSpinBox, QLabel, QMainWindow, QGroupBox, QMessageBox,
                               QTabWidget)
from src.Private.telemetry_url import TELEMETRY_URL, SUPABASE_URL, SUPABASE_KEY
from src.Py.settings_manager import load_settings, save_settings, reset_defaults, get_debug_mode
from src.Py import go_translation
from src.Py import update_checker
from src.Py import hotkey_manager
from src.Py import telemetry
from UI.ui_main_window import Ui_BlurAutoClicker as ui_main_window

# --- Constants ---
CURRENT_VERSION = "v2.0.0"
DEBUG_MODE = True

os.system("")

# --- DLL ---
if getattr(sys, 'frozen', False):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
else:
    base = os.path.dirname(os.path.abspath(__file__))

dll = ctypes.CDLL(os.path.join(base, "src", "Rust", "clicker_engine.dll"))
dll.get_click_count.restype = ctypes.c_int64
STATS_CB = ctypes.CFUNCTYPE(
    None, ctypes.c_int64, ctypes.c_double, ctypes.c_double)

# --- Supabase ---
_supabase_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def log(message):
    if not DEBUG_MODE:
        return
    TIME_COLOR = "\033[96m"
    RESET = "\033[0m"
    if message.startswith("[") and "]" in message:
        split_idx = message.find("]") + 1
        print(f"{TIME_COLOR}{message[:split_idx]}{RESET}{message[split_idx:]}")
    else:
        print(message)


def current_time():
    return datetime.now().strftime('%H:%M:%S')


config = ConfigParser()

# fmt: off
class UIWidgets:
    def __init__(self, ui):
        f = ui.findChild

        # Top Section
        self.clickerstatus                       = f(QPushButton,    "ClickerStatusButton")
        self.key_sequence                        = f(QKeySequenceEdit, "KeySequence")
        self.activation_type_combobox            = f(QComboBox,      "ActivationTypeComboBox")
        self.click_speed_input                   = f(QSpinBox,       "ClicksSpeedInput")
        self.click_interval_combobox             = f(QComboBox,      "ClickIntervalComboBox")
        self.mouse_button_combobox               = f(QComboBox,      "MouseButtonComboBox")
        self.duty_cycle_input                    = f(QSpinBox,       "DutyCycleInput")
        self.speed_variation_checkbox            = f(QCheckBox,      "SpeedVariationCheckBox")
        self.speed_variation_input               = f(QSpinBox,       "SpeedVariationInput")
        self.tabs                                = f(QTabWidget,     "Tabs")

        # Limits
        self.time_limit_checkbox                 = f(QCheckBox,      "TimeLimitCheckBox")
        self.time_limit_input                    = f(QSpinBox,       "TimeLimitInput")
        self.time_limit_combobox                 = f(QComboBox,      "TimeComboBox")
        self.click_limit_checkbox                = f(QCheckBox,      "ClickLimitCheckBox")
        self.click_limit_input                   = f(QSpinBox,       "ClickLimitInput")

        # Position
        self.position_options_checkbox           = f(QGroupBox,      "PositionGroupBox")
        self.pos_x_input                         = f(QSpinBox,       "PosXInput")
        self.pos_y_input                         = f(QSpinBox,       "PosYInput")
        self.pick_position_button                = f(QPushButton,    "PickPositionButton")
        self.click_offset_input                  = f(QSpinBox,       "OffsetInput")
        self.click_offset_checkbox               = f(QCheckBox,      "OffsetCheckBox")
        self.click_offset_chance_input           = f(QSpinBox,       "OffsetChanceInput")
        self.click_offset_chance_input_checkbox  = f(QCheckBox,      "OffsetChanceCheckBox")
        self.click_offset_smoothing_checkbox     = f(QCheckBox,      "SmoothingCheckBox")

        # Other
        self.btn_reset                           = f(QPushButton,    "ResetSettingsButton")
        self.telemetry_checkbox                  = f(QCheckBox,      "TelemetryCheckBox")

        # Labels
        self.version_label                       = f(QLabel,         "VersionLabel")
        self.update_status_label                 = f(QLabel,         "UpdateStatusLabel")
        self.advanced_options_checkbox           = f(QCheckBox,      "AdvancedOptionsCheckBox")
# fmt: on


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = QMainWindow()
    ui = ui_main_window()
    ui.setupUi(window)
    ui_widgets = UIWidgets(window)

    is_clicking = False
    show_high_speed_warn = True

    # -----------------------------------------------------------------------
    # Load settings
    # -----------------------------------------------------------------------
    shortcut_string = load_settings(
        ui_widgets, config, log=lambda m: log(f"[{current_time()}] {m}"))
    keybind_hotkey = shortcut_string.lower().replace("meta", "win")
    if exists("config.ini"):
        DEBUG_MODE = get_debug_mode(config)

    for attr in vars(ui_widgets).values():
        if isinstance(attr, (QCheckBox, QGroupBox)):
            attr.toggled.emit(attr.isChecked())

    # -----------------------------------------------------------------------
    # Window / UI
    # -----------------------------------------------------------------------

    def toggle_window_size(advanced_visible):
        size = (430, 410) if advanced_visible else (430, 190)
        window.setMaximumSize(*size)
        window.setMinimumSize(*size)
        window.adjustSize()

    ui_widgets.advanced_options_checkbox.toggled.connect(toggle_window_size)
    toggle_window_size(ui_widgets.advanced_options_checkbox.isChecked())
    ui_widgets.advanced_options_checkbox.toggled.connect(ui.Tabs.setEnabled)
    ui.Tabs.setEnabled(ui_widgets.advanced_options_checkbox.isChecked())

    # -----------------------------------------------------------------------
    # Supabase
    # -----------------------------------------------------------------------

    # Session totals (accumulates across runs until app closes)
    _session = {"clicks": 0, "elapsed": 0.0, "cpu_samples": []}

    def log_session_summary():
        if _session["clicks"] == 0:
            return
        total_clicks = _session["clicks"]
        total_elapsed = _session["elapsed"]
        avg_cpu = sum(_session["cpu_samples"]) / \
            len(_session["cpu_samples"]) if _session["cpu_samples"] else 0.0
        log(f"[{current_time()}] --- Session Summary ---")
        log(f"[{current_time()}] Total Clicks : {total_clicks}")
        log(f"[{current_time()}] Total Time   : {total_elapsed:.2f}s")
        log(f"[{current_time()}] Total Avg CPU: {avg_cpu:.1f}%")
        log(f"[{current_time()}] -----------------------")

    def send_stats(clicks, elapsed, avg_cpu):
        for attempt in range(3):
            try:
                response = requests.post(
                    f"{SUPABASE_URL}/rest/v1/quick_updates",
                    headers=_supabase_headers,
                    json={
                        "clicks": clicks,
                        "time": round(elapsed, 2),
                        "avg_cpu": round(avg_cpu, 2),
                    },
                    timeout=10,
                )
                if not response.ok:
                    log(f"[{current_time()}] Supabase error detail: {response.text}")
                    response.raise_for_status()
                log(f"[{current_time()}] Stats sent to Supabase")
                return
            except Exception as e:
                log(f"[{current_time()}] Supabase attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    time.sleep(2)
        log(f"[{current_time()}] Stats failed to send after 3 attempts")

    # -----------------------------------------------------------------------
    # Clicker logic
    # -----------------------------------------------------------------------

    def on_clicker_finished():
        global is_clicking
        if is_clicking:
            is_clicking = False
            ui_widgets.clickerstatus.setText("Off")
            ui_widgets.clickerstatus.setDefault(False)
            ui_widgets.btn_reset.setDefault(True)
            log(f"[{current_time()}] Clicker finished: Limit reached.")

    def on_stop(clicks, elapsed, avg_cpu):
        _session["clicks"] += clicks
        _session["elapsed"] += elapsed
        _session["cpu_samples"].append(avg_cpu)
        log(f"[{current_time()}] Clicker finished: {clicks} clicks in {elapsed:.2f}s, CPU: {avg_cpu:.1f}%")
        log_session_summary()
        threading.Thread(target=send_stats, args=(
            clicks, elapsed, avg_cpu)).start()

    _cb_ref = STATS_CB(on_stop)
    dll.set_stats_callback(_cb_ref)

    def toggle_clicker_start_stop():
        global is_clicking
        is_clicking = not is_clicking

        if is_clicking:
            ui_widgets.clickerstatus.setText("On")
            ui_widgets.clickerstatus.setDefault(True)
            ui_widgets.btn_reset.setDefault(False)
            try:
                advanced_mode = ui_widgets.advanced_options_checkbox.isChecked()
                speed = ui_widgets.click_speed_input.value()
                unit_map = {"Second": "second", "Minute": "minute",
                            "Hour": "hour", "Day": "day"}
                btn_map = {"Left Click": "left",
                           "Right Click": "right", "Middle Click": "middle"}

                variation = ui_widgets.speed_variation_input.value() if (
                    advanced_mode and ui_widgets.speed_variation_checkbox.isChecked()) else 0
                duty = ui_widgets.duty_cycle_input.value()
                button = btn_map.get(
                    ui_widgets.mouse_button_combobox.currentText(), "left")
                limit = ui_widgets.click_limit_input.value() if (
                    advanced_mode and ui_widgets.click_limit_checkbox.isChecked()) else 0

                pos = (ui_widgets.pos_x_input.value(), ui_widgets.pos_y_input.value()) if (
                    advanced_mode and ui_widgets.position_options_checkbox.isChecked()) else (0, 0)
                if pos != (0, 0):
                    sw = app.primaryScreen().size().width()
                    sh = app.primaryScreen().size().height()
                    x, y = pos
                    if x < 0 or x >= sw or y < 0 or y >= sh:
                        ui_widgets.pos_x_input.setValue(0)
                        ui_widgets.pos_y_input.setValue(0)
                        pos = (0, 0)
                        log(f"[{current_time()}] Position out of bounds, reset to (0, 0)")

                offset = ui_widgets.click_offset_input.value() if (
                    advanced_mode and ui_widgets.click_offset_checkbox.isChecked()) else 0
                offset_chance = ui_widgets.click_offset_chance_input.value() if (
                    advanced_mode and ui_widgets.click_offset_chance_input_checkbox.isChecked()) else 0
                smoothing = ui_widgets.click_offset_smoothing_checkbox.isChecked(
                ) if advanced_mode else False

                if advanced_mode and ui_widgets.time_limit_checkbox.isChecked():
                    amount = max(float(ui_widgets.time_limit_input.value()), 1)
                    unit = ui_widgets.time_limit_combobox.currentText().lower()
                    multipliers = {"seconds": 1, "minutes": 60,
                                   "hours": 3600, "days": 86400}
                    time_limit = amount * multipliers.get(unit, 1)
                else:
                    time_limit = 0

                unit = unit_map.get(
                    ui_widgets.click_interval_combobox.currentText(), "second")
                settings = {
                    "click_amount": speed,
                    "click_unit": unit,
                    "click_variation": variation,
                    "click_limit": limit,
                    "click_duty_cycle": duty,
                    "click_time_limit": time_limit,
                    "click_button": button,
                    "click_position": pos,
                    "click_position_offset": offset,
                    "click_position_offset_chance": offset_chance,
                    "click_position_smoothing": smoothing,
                }
                go_translation.start_clicker(settings, on_clicker_finished)
                log(f"[{current_time()}] Clicker started")
            except Exception as e:
                log(f"[{current_time()}] Error starting clicker: {e}")
                is_clicking = False
        else:
            ui_widgets.clickerstatus.setText("Off")
            ui_widgets.clickerstatus.setDefault(False)
            ui_widgets.btn_reset.setDefault(True)
            go_translation.stop_clicker()
            log(f"[{current_time()}] Clicker stopped")

    hotkey_manager.set_toggle_callback(toggle_clicker_start_stop)

    # -----------------------------------------------------------------------
    # Click speed limit / warning
    # -----------------------------------------------------------------------

    def set_click_speed_limit():
        limits = {"second": 1000, "minute": 10000,
                  "hour": 100000, "day": 1000000}
        ui_widgets.click_speed_input.setMaximum(
            limits.get(ui_widgets.click_interval_combobox.currentText().lower(), 1000))

    set_click_speed_limit()
    ui_widgets.click_interval_combobox.currentIndexChanged.connect(
        set_click_speed_limit)

    def click_speed_warn():
        global show_high_speed_warn
        if not show_high_speed_warn:
            return
        cps = max(float(ui_widgets.click_speed_input.value()), 1)
        divisors = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
        unit = ui_widgets.click_interval_combobox.currentText().lower()
        if cps / divisors.get(unit, 1) >= 500:
            warning = QMessageBox()
            warning.setWindowTitle("High Click Speed")
            warning.setText(
                "Warning: Click speed is very high, this may cause issues.")
            warning.setIcon(QMessageBox.Icon.Warning)
            warning.setWindowIcon(window.windowIcon())
            dont_show_checkbox = QCheckBox("Do not show again")
            warning.setCheckBox(dont_show_checkbox)
            warning.exec()
            if dont_show_checkbox.isChecked():
                show_high_speed_warn = False

    ui_widgets.click_speed_input.valueChanged.connect(click_speed_warn)

    # -----------------------------------------------------------------------
    # Position picker
    # -----------------------------------------------------------------------

    countdown_timer: QTimer | None = None

    def start_countdown(seconds, tick_callback, finish_callback):
        global countdown_timer
        if countdown_timer:
            countdown_timer.stop()
        remaining = seconds

        def tick():
            nonlocal remaining
            if remaining > 0:
                tick_callback(remaining)
                remaining -= 1
            else:
                if countdown_timer:
                    countdown_timer.stop()
                finish_callback()

        countdown_timer = QTimer()
        countdown_timer.timeout.connect(tick)
        countdown_timer.start(1000)
        tick()

    def start_position_picker():
        def on_tick(seconds_left):
            ui_widgets.pick_position_button.setText(
                f"Picking Cursor position in {seconds_left - 1}s")

        def on_finish():
            pos = QCursor.pos()
            ui_widgets.pos_x_input.setValue(pos.x())
            ui_widgets.pos_y_input.setValue(pos.y())
            ui_widgets.pick_position_button.setText("Pick Position")
            log(f"Position picked: {pos.x()}, {pos.y()}, success")

        start_countdown(4, on_tick, on_finish)

    ui_widgets.pick_position_button.clicked.connect(start_position_picker)

    # -----------------------------------------------------------------------
    # Wire up signals
    # -----------------------------------------------------------------------

    ui_widgets.version_label.setText(CURRENT_VERSION)
    ui_widgets.update_status_label.setVisible(False)
    ui_widgets.btn_reset.clicked.connect(lambda: reset_defaults(
        ui_widgets, log=lambda m: log(f"[{current_time()}] {m}")))
    ui_widgets.btn_reset.clicked.connect(lambda: ui.Tabs.setCurrentIndex(0))
    ui_widgets.key_sequence.keySequenceChanged.connect(
        hotkey_manager.on_keybind_changed)
    ui_widgets.key_sequence.keySequenceChanged.connect(
        hotkey_manager.stop_clicker)
    ui_widgets.activation_type_combobox.currentIndexChanged.connect(
        hotkey_manager.set_keybind_mode)

    # -----------------------------------------------------------------------
    # Initialize managers
    # -----------------------------------------------------------------------

    def log_func(m): return log(f"[{current_time()}] {m}")

    update_checker.initialize(ui_widgets, log_func, CURRENT_VERSION)
    telemetry.initialize(ui_widgets, log_func, CURRENT_VERSION, TELEMETRY_URL)
    hotkey_manager.initialize(ui_widgets, log_func)
    hotkey_manager.set_keybind(keybind_hotkey)
    hotkey_manager.set_keybind_mode()

    # -----------------------------------------------------------------------
    # Save on exit
    # -----------------------------------------------------------------------

    def exit_handler():
        t = None
        if TELEMETRY_URL and ui_widgets.telemetry_checkbox.isChecked():
            t = threading.Thread(target=telemetry.send_telemetry_data)
            t.start()
        save_settings(ui_widgets, config, keybind_hotkey=hotkey_manager.get_keybind(),
                      debug_mode=DEBUG_MODE, log=lambda m: log(f"[{current_time()}] {m}"))
        if t:
            t.join(timeout=6)

    atexit.register(exit_handler)
    window.show()
    sys.exit(app.exec())
