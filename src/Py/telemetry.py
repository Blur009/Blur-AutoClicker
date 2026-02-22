"""
 * Blur Auto Clicker - telemetry.py
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
import requests
import threading

# Module-level state
_ui_widgets = None
_log_func = None
_current_version = None
_telemetry_url = None


def initialize(ui_widgets, log_func, current_version, telemetry_url=None):
    #Initialize telemetry with UI widgets, logging, version, and URL.
    global _ui_widgets, _log_func, _current_version, _telemetry_url
    _ui_widgets = ui_widgets
    _log_func = log_func
    _current_version = current_version
    _telemetry_url = telemetry_url


def send_telemetry_data():
    #Send telemetry data to the configured URL.
    if not _telemetry_url or not _ui_widgets:
        return

    try:
        data = {
            "entry.792808795":  str(_ui_widgets.click_speed_input.value()),
            "entry.257389526":  _ui_widgets.click_interval_combobox.currentText(),
            "entry.659741022":  _ui_widgets.mouse_button_combobox.currentText(),
            "entry.964587225":  str(_ui_widgets.duty_cycle_input.value()),
            "entry.359025507":  _ui_widgets.activation_type_combobox.currentText(),
            "entry.1938309947": str(_ui_widgets.speed_variation_checkbox.isChecked()),
            "entry.1535524490": str(_ui_widgets.speed_variation_input.value()),
            "entry.1934518849": str(_ui_widgets.click_limit_checkbox.isChecked()),
            "entry.222747900":  str(_ui_widgets.click_limit_input.value()),
            "entry.1501626126": str(_ui_widgets.time_limit_checkbox.isChecked()),
            "entry.496999174":  str(_ui_widgets.time_limit_input.value()),
            "entry.406161779":  _ui_widgets.time_limit_combobox.currentText(),
            "entry.1211580613": str(_ui_widgets.position_options_checkbox.isChecked()),
            "entry.698651897":  str(_ui_widgets.click_offset_checkbox.isChecked()),
            "entry.1474968609": str(_ui_widgets.click_offset_input.value()),
            "entry.708601130":  str(_ui_widgets.click_offset_chance_input_checkbox.isChecked()),
            "entry.611438215":  str(_ui_widgets.click_offset_chance_input.value()),
            "entry.724252267":  str(_ui_widgets.click_offset_smoothing_input_checkbox.isChecked()),
            "entry.2101917692": str(_ui_widgets.advanced_options_checkbox.isChecked()),
            "entry.2054917748": _current_version,
        }
        requests.post(_telemetry_url, data=data, timeout=5)
        if _log_func:
            _log_func("Telemetry sent.")
    except Exception as e:
        if _log_func:
            _log_func(f"Telemetry failed: {e}")


def send_telemetry():
    #Send telemetry in a background thread if enabled.
    if not _telemetry_url or not _ui_widgets:
        return
    if not _ui_widgets.telemetry_checkbox.isChecked():
        return
    threading.Thread(target=send_telemetry_data, daemon=True).start()
