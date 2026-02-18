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
import sys
import threading
import time
from configparser import ConfigParser
from datetime import datetime
from os.path import exists
import keyboard
import requests
from PySide6.QtCore import QTimer
from PySide6.QtGui import QCursor
from PySide6.QtWidgets import (QApplication, QKeySequenceEdit, QCheckBox, QComboBox,
                               QPushButton, QSpinBox, QLabel, QMainWindow, QGroupBox, QMessageBox,
                               QTabWidget)

from src import C_Clicker as AClicker
from ui_BlurAutoClicker import Ui_BlurAutoClicker
from src.settings_manager import load_settings, save_settings, reset_defaults, get_debug_mode

# TODO:
"""
Change logs are now in Changelog.md
"""
CURRENT_VERSION = "v2.0.0"
DEBUG_MODE = False

def log(message):
    if DEBUG_MODE:
        print(message)

def current_time():
    return datetime.now().strftime('%H:%M:%S')

config = ConfigParser()


class UIObjects:
    def __init__(self, ui):
        # Top Section
        self.clickerstatus                  = ui.findChild(QPushButton,     "ClickerStatusButton")
        self.key_sequence                   = ui.findChild(QKeySequenceEdit,"KeySequence")
        self.activation_type_combobox       = ui.findChild(QComboBox,       "ActivationTypeComboBox")
        self.click_speed_input              = ui.findChild(QSpinBox,        "ClicksSpeedInput")
        self.click_interval_combobox        = ui.findChild(QComboBox,       "ClickIntervalComboBox")
        self.mouse_button_combobox          = ui.findChild(QComboBox,       "MouseButtonComboBox")
        self.duty_cycle_input               = ui.findChild(QSpinBox,        "DutyCycleInput")
        self.speed_variation_checkbox       = ui.findChild(QCheckBox,       "SpeedVariationCheckBox")
        self.speed_variation_input          = ui.findChild(QSpinBox,        "SpeedVariationInput")

        self.tabs = ui.findChild(QTabWidget, "Tabs")
        # Limits
        self.time_limit_checkbox            = ui.findChild(QCheckBox,       "TimeLimitCheckBox")
        self.time_limit_input               = ui.findChild(QSpinBox,        "TimeLimitInput")
        self.time_limit_combobox            = ui.findChild(QComboBox,       "TimeComboBox")
        self.click_limit_checkbox           = ui.findChild(QCheckBox,       "ClickLimitCheckBox")
        self.click_limit_input              = ui.findChild(QSpinBox,        "ClickLimitInput")

        # Position
        self.position_options_checkbox      = ui.findChild(QGroupBox,       "PositionGroupBox")
        self.pos_x_input                    = ui.findChild(QSpinBox,        "PosXInput")
        self.pos_y_input                    = ui.findChild(QSpinBox,        "PosYInput")
        self.pick_position_button           = ui.findChild(QPushButton,     "PickPositionButton")
        self.click_offset_input             = ui.findChild(QSpinBox,        "OffsetInput")
        self.click_offset_checkbox          = ui.findChild(QCheckBox,       "OffsetCheckBox")
        self.click_offset_chance_input           = ui.findChild(QSpinBox,   "OffsetChanceInput")
        self.click_offset_chance_input_checkbox  = ui.findChild(QCheckBox,  "OffsetChanceCheckBox")
        self.click_offset_smoothing_input_checkbox = ui.findChild(QCheckBox,"SmoothingCheckBox")

        # Other
        self.btn_reset                      = ui.findChild(QPushButton,     "ResetSettingsButton")
        self.telemetry_checkbox             = ui.findChild(QCheckBox,       "TelemetryCheckBox")

        # Labels / misc
        self.version_label                  = ui.findChild(QLabel,          "VersionLabel")
        self.update_status_label            = ui.findChild(QLabel,          "UpdateStatusLabel")
        self.advanced_options_checkbox      = ui.findChild(QCheckBox,       "AdvancedOptionsCheckBox")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = QMainWindow()
    ui = Ui_BlurAutoClicker()
    ui.setupUi(window)
    ui_objects = UIObjects(window)

    is_clicking = False
    keybind_hotkey: str | None = None
    keybind_mode = "toggle"
    registered_hotkey: str | None = None
    hold_monitor_running = False
    warn_high_click_speed = True

    # -----------------------------------------------------------------------
    # Load settings
    # -----------------------------------------------------------------------
    # Never Gonna Give You Up -- Get Rick Rolled Buddy 🎵 
    shortcut_string = load_settings(ui_objects, config, log=lambda m: log(f"[{current_time()}] {m}"))
    keybind_hotkey = shortcut_string.lower().replace("meta", "win")
    if exists("config.ini"):
        DEBUG_MODE = get_debug_mode(config)
    
    for attr in vars(ui_objects).values():
        if isinstance(attr, (QCheckBox, QGroupBox)):
            attr.toggled.emit(attr.isChecked())
    # -----------------------------------------------------------------------
    # Window / UI Changes
    # -----------------------------------------------------------------------
    def shrinkWindow(advanced_visible):
        if advanced_visible:
            window.setMaximumSize(430, 410)
            window.setMinimumSize(430, 410)
            window.adjustSize()
        else:
            window.setMaximumSize(430, 190)
            window.setMinimumSize(430, 190)
            window.adjustSize()

    ui_objects.advanced_options_checkbox.toggled.connect(shrinkWindow)
    shrinkWindow(ui_objects.advanced_options_checkbox.isChecked())
    ui_objects.advanced_options_checkbox.toggled.connect(ui.Tabs.setEnabled)
    ui.Tabs.setEnabled(ui_objects.advanced_options_checkbox.isChecked())

    # -----------------------------------------------------------------------
    # Hotkey / clicker logic
    # -----------------------------------------------------------------------
    def register_hotkey():
        global registered_hotkey, keybind_hotkey, keybind_mode, hold_monitor_running
        if registered_hotkey and isinstance(registered_hotkey, str):
            try:
                keyboard.remove_hotkey(registered_hotkey)
            except KeyError:
                pass
            registered_hotkey = None
        if not keybind_hotkey:
            return

        def on_hotkey_trigger():
            if not keyboard.is_pressed(str(keybind_hotkey)):
                return
            if keybind_mode == "toggle":
                toggle_clicker_start_stop()
            elif keybind_mode == "hold":
                start_hold_monitor(str(keybind_hotkey))

        try:
            keyboard.add_hotkey(keybind_hotkey, on_hotkey_trigger)
            registered_hotkey = keybind_hotkey
            log(f"[{current_time()}] [Hotkey] Registered: {keybind_hotkey} ({keybind_mode})")
        except Exception as e:
            log(f"[{current_time()}] [Hotkey] Failed to register '{keybind_hotkey}': {e}")


    def start_hold_monitor(hotkey_str: str):
        global hold_monitor_running
        if hold_monitor_running:
            return
        hold_monitor_running = True
        t = threading.Thread(target=_hold_monitor_loop, args=(hotkey_str,), daemon=True)
        t.start()


    def _hold_monitor_loop(hotkey_str: str):
        global hold_monitor_running, is_clicking
        try:
            if not is_clicking:
                toggle_clicker_start_stop()
            while keyboard.is_pressed(hotkey_str):
                time.sleep(0.05)
            if is_clicking:
                toggle_clicker_start_stop()
        finally:
            hold_monitor_running = False


    def set_keybind_mode():
        global keybind_mode
        mode_text = ui_objects.activation_type_combobox.currentText().lower()
        if "hold" in mode_text:
            keybind_mode = "hold"
        else:
            keybind_mode = "toggle"
        register_hotkey()


    def on_clicker_finished():
        global is_clicking
        if is_clicking:
            is_clicking = False
            ui_objects.clickerstatus.setText("Off")
            ui_objects.clickerstatus.setDefault(False)
            ui_objects.btn_reset.setDefault(True)
            log(f"[{current_time()}] Clicker finished: Limit reached.")


    def toggle_clicker_start_stop():
        global is_clicking
        is_clicking = not is_clicking

        if is_clicking:
            ui_objects.clickerstatus.setText("On")
            ui_objects.clickerstatus.setDefault(True)
            ui_objects.btn_reset.setDefault(False)
            try:
                advanced = ui_objects.advanced_options_checkbox.isChecked()

                speed = ui_objects.click_speed_input.value()
                unit_map = {"Second": "second", "Minute": "minute", "Hour": "hour", "Day": "day"}
                
                variation     = ui_objects.speed_variation_input.value() if (advanced and ui_objects.speed_variation_checkbox.isChecked()) else 0
                duty          = ui_objects.duty_cycle_input.value()
                btn_map       = {"Left Click": "left", "Right Click": "right", "Middle Click": "middle"}
                button        = btn_map.get(ui_objects.mouse_button_combobox.currentText(), "left")
                pos           = (ui_objects.pos_x_input.value(), ui_objects.pos_y_input.value()) \
                                if (advanced and ui_objects.position_options_checkbox.isChecked()) else (0, 0)
                offset_chance = ui_objects.click_offset_chance_input.value() if (advanced and ui_objects.click_offset_chance_input_checkbox.isChecked()) else 0
                smoothing      = ui_objects.click_offset_smoothing_input_checkbox.isChecked() if advanced else False
                offset        = ui_objects.click_offset_input.value() if (advanced and ui_objects.click_offset_checkbox.isChecked()) else 0
                limit         = ui_objects.click_limit_input.value() if (advanced and ui_objects.click_limit_checkbox.isChecked()) else 0

                if advanced and ui_objects.time_limit_checkbox.isChecked():
                    raw_time_limit = ui_objects.time_limit_input.value()
                    raw_modifier = ui_objects.time_limit_combobox.currentText()

                    amount = float(raw_time_limit)
                    if amount <= 0: amount = 1

                    unit = raw_modifier.lower()
                    if unit == 'seconds':   calculated_time_limit = 1 * amount
                    elif unit == 'minutes': calculated_time_limit = 60 * amount
                    elif unit == 'hours':   calculated_time_limit = 3600 * amount
                    elif unit == 'days':    calculated_time_limit = 86400 * amount
                    else:                   calculated_time_limit = 1 * amount

                    time_limit = calculated_time_limit
                else:
                    time_limit = 0

                unit = unit_map.get(ui_objects.click_interval_combobox.currentText(), "second")
                settings = {
                    "click_amount":                 speed,
                    "click_unit":                   unit,
                    "click_variation":              variation,
                    "click_limit":                  limit,
                    "click_duty_cycle":             duty,
                    "click_time_limit":             time_limit,
                    "click_button":                 button,
                    "click_position":               pos,
                    "click_position_offset":        offset,
                    "click_position_offset_chance": offset_chance,
                    "click_position_smoothing":     smoothing,
                }
                AClicker.start_clicker(settings, on_clicker_finished)
                log(f"[{current_time()}] Clicker started")
            except Exception as e:
                log(f"[{current_time()}] Error starting clicker: {e}")
                is_clicking = False
        else:
            ui_objects.clickerstatus.setText("Off")
            ui_objects.clickerstatus.setDefault(False)
            ui_objects.btn_reset.setDefault(True)
            AClicker.stop_clicker()
            log(f"[{current_time()}] Clicker stopped")


    def on_keybind_changed():
        global keybind_hotkey
        seq = ui_objects.key_sequence.keySequence()
        key_string = seq.toString().lower().replace("meta", "win")
        if key_string:
            keybind_hotkey = key_string
            log(f"[{current_time()}] Keybind set to: {keybind_hotkey}")
            register_hotkey()
        else:
            log(f"[{current_time()}] Keybind cleared")

    def stop_clicker():
        global is_clicking
        if is_clicking:
            is_clicking = False
        return

    def set_click_speed_limit():
        interval = ui_objects.click_interval_combobox.currentText().lower()

        if interval == "second":
            ui_objects.click_speed_input.setMaximum(1000)
        elif interval == "minute":
            ui_objects.click_speed_input.setMaximum(10000)
        elif interval == "hour":
            ui_objects.click_speed_input.setMaximum(100000)
        elif interval == "day":
            ui_objects.click_speed_input.setMaximum(1000000)
        else:
            ui_objects.click_speed_input.setMaximum(1000)
    set_click_speed_limit()
    ui_objects.click_interval_combobox.currentIndexChanged.connect(set_click_speed_limit)

    def click_speed_warn():
        global warn_high_click_speed
        if not warn_high_click_speed:
            return

        raw_cps = ui_objects.click_speed_input.value()
        raw_modifier = ui_objects.click_interval_combobox.currentText()

        cps = float(raw_cps)
        if cps <= 0: cps = 1

        unit = raw_modifier.lower()
        if unit == 'second':    calculated_click_speed = cps / 1
        elif unit == 'minute':  calculated_click_speed = cps / 60
        elif unit == 'hour':    calculated_click_speed = cps / 3600
        elif unit == 'day':     calculated_click_speed = cps / 86400
        else:                   calculated_click_speed = cps / 1

        if calculated_click_speed >= 500:
            warning = QMessageBox()
            warning.setWindowTitle("High Click Speed")
            warning.setText("Warning: Click speed is very high, this may cause issues.")
            warning.setIcon(QMessageBox.Icon.Warning)
            warning.setWindowIcon(window.windowIcon())

            dont_show_checkbox = QCheckBox("Do not show again")
            warning.setCheckBox(dont_show_checkbox)

            warning.exec()

            if dont_show_checkbox.isChecked():
                warn_high_click_speed = False
    
    ui_objects.click_speed_input.valueChanged.connect(click_speed_warn)
        
        
    def set_position_current():
        start_countdown(int(4))

    def finish_position_pick():
        pos = QCursor.pos()
        ui_objects.pos_x_input.setValue(pos.x())
        ui_objects.pos_y_input.setValue(pos.y())

    countdown_timer = None
    def start_countdown(seconds_left):
        global countdown_timer
        if countdown_timer:
            countdown_timer.stop()

        def countdown_tick():
            nonlocal seconds_left
            if seconds_left > 1:
                ui_objects.pick_position_button.setText(f"Picking Cursor position in {seconds_left - 1}s")
                seconds_left -= 1
            else:
                if countdown_timer is not None:
                    countdown_timer.stop()
                    finish_position_pick()
                    ui_objects.pick_position_button.setText("Pick Position")

        countdown_timer = QTimer()
        countdown_timer.timeout.connect(countdown_tick)
        countdown_timer.start(1000)
        ui_objects.pick_position_button.setText(f"Picking Cursor position in {seconds_left}s")


    # -----------------------------------------------------------------------
    # Update check
    # -----------------------------------------------------------------------
    ui_objects.update_status_label.setVisible(False)

    def get_newest_version():
        url = "https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest"
        try: #deez nuts 🦈
            response = requests.get(url)
            if response.status_code == 200:
                return response.json()["tag_name"]
            log(f"[{current_time()}] Error connecting to GitHub: {response.status_code}")
        except Exception as e:
            log(f"[{current_time()}] An error occurred: {e}")
        return None

    def is_update_available(remote_version, local_version):
        r = remote_version.replace("v", "")
        l = local_version.replace("v", "")

        r_parts = r.split(".")
        l_parts = l.split(".")

        max_len = max(len(r_parts), len(l_parts))
        r_parts += ['0'] * (max_len - len(r_parts))
        l_parts += ['0'] * (max_len - len(l_parts))

        for i in range(max_len):
            try: r_num = int(r_parts[i])
            except ValueError: r_num = 0
            try: l_num = int(l_parts[i])
            except ValueError: l_num = 0

            if r_num > l_num:
                return True
            elif r_num < l_num:
                return False
        return False

    def perform_startup_update_check():
        log(f"[{current_time()}] Checking for updates on startup...")
        github_version = get_newest_version()
        if github_version:
            if is_update_available(github_version, CURRENT_VERSION):
                log(f"[{current_time()}] UPDATE AVAILABLE!")
                ui_objects.update_status_label.setVisible(True)
                ui_objects.update_status_label.setText(
                    '<html><head/><body><p><span style=" color:#1aff22;">'
                    'Updates Available! Check my GitHub (Blur009)</span></p></body></html>'
                )
            else:
                log(f"[{current_time()}] You are on the latest version.")
                ui_objects.update_status_label.setText("No Updates Found")
        else:
            log(f"[{current_time()}] Could not check versions.")

    perform_startup_update_check()


    # -----------------------------------------------------------------------
    # Wire up signals
    # -----------------------------------------------------------------------
    ui_objects.version_label.setText(CURRENT_VERSION)
    ui_objects.btn_reset.clicked.connect(
        lambda: reset_defaults(ui_objects, log=lambda m: log(f"[{current_time()}] {m}"))
    )
    ui_objects.btn_reset.clicked.connect(lambda: ui.Tabs.setCurrentIndex(0))
    ui_objects.key_sequence.keySequenceChanged.connect(on_keybind_changed)
    ui_objects.key_sequence.keySequenceChanged.connect(stop_clicker)
    ui_objects.pick_position_button.clicked.connect(set_position_current)
    ui_objects.activation_type_combobox.currentIndexChanged.connect(set_keybind_mode)

    register_hotkey()

    # -----------------------------------------------------------------------
    # Telemetry
    # -----------------------------------------------------------------------
    try:
        from src.telemetry_url import TELEMETRY_URL
    except ImportError:
        TELEMETRY_URL = None

    def _send_telemetry_request():
        if not TELEMETRY_URL:
            return
        try:
            data = {
                "entry.792808795":  str(ui_objects.click_speed_input.value()),
                "entry.257389526":  ui_objects.click_interval_combobox.currentText(),
                "entry.659741022":  ui_objects.mouse_button_combobox.currentText(),
                "entry.964587225":  str(ui_objects.duty_cycle_input.value()),
                "entry.359025507":  ui_objects.activation_type_combobox.currentText(),
                "entry.1938309947": str(ui_objects.speed_variation_checkbox.isChecked()),
                "entry.1535524490": str(ui_objects.speed_variation_input.value()),
                "entry.1934518849": str(ui_objects.click_limit_checkbox.isChecked()),
                "entry.222747900":  str(ui_objects.click_limit_input.value()),
                "entry.1501626126": str(ui_objects.time_limit_checkbox.isChecked()),
                "entry.496999174":  str(ui_objects.time_limit_input.value()),
                "entry.406161779":  ui_objects.time_limit_combobox.currentText(),
                "entry.1211580613": str(ui_objects.position_options_checkbox.isChecked()),
                "entry.698651897":  str(ui_objects.click_offset_checkbox.isChecked()),
                "entry.1474968609": str(ui_objects.click_offset_input.value()),
                "entry.708601130":  str(ui_objects.click_offset_chance_input_checkbox.isChecked()),
                "entry.611438215":  str(ui_objects.click_offset_chance_input.value()),
                "entry.724252267":  str(ui_objects.click_offset_smoothing_input_checkbox.isChecked()),
                "entry.2101917692": str(ui_objects.advanced_options_checkbox.isChecked()),
                "entry.2054917748": CURRENT_VERSION,
            }
            requests.post(TELEMETRY_URL, data=data, timeout=5)
            log(f"[{current_time()}] Telemetry sent.")
        except Exception as e:
            log(f"[{current_time()}] Telemetry failed: {e}")

    def send_telemetry():
        if not TELEMETRY_URL or not ui_objects.telemetry_checkbox.isChecked():
            return
        threading.Thread(target=_send_telemetry_request, daemon=True).start()
        
    # -----------------------------------------------------------------------
    # Save on exit
    # -----------------------------------------------------------------------
    def exit_handler():
        t = None
        if TELEMETRY_URL and ui_objects.telemetry_checkbox.isChecked():
            t = threading.Thread(target=_send_telemetry_request)
            t.start()
        save_settings(
            ui_objects, config,
            keybind_hotkey=keybind_hotkey,
            debug_mode=DEBUG_MODE,
            log=lambda m: log(f"[{current_time()}] {m}"),
        )
        if t:
            t.join(timeout=6)  # wait up to 6 seconds for telemetry to send
    
    atexit.register(exit_handler)
    window.show()
    sys.exit(app.exec())