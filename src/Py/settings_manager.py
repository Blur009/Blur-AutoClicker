"""
 * Blur Auto Clicker - settings_manager.py
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

"""
settings_manager.py

Declarative settings registry. To add a new setting:
  1. Add one entry to SETTINGS_REGISTRY below.
  2. done

Each entry is a dict with these keys:
  widget_attr  : attribute name on the UIObjects instance
  config_key   : key string used in config.ini  (under [Settings])
  default      : the default value
  widget_type  : "spinbox" | "combobox" | "checkbox" | "groupbox" | "keysequence"
"""
from pathlib import Path
from configparser import ConfigParser
import os

CONFIG_DIR = Path.home() / "AppData" / "Roaming" / "blur009" / "autoclicker"
CONFIG_FILE = str(CONFIG_DIR / "config.ini")
CONFIG_SECTION = "Settings"


def ensure_config_dir():
    if not CONFIG_DIR.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)


CONFIG_SECTION = "Settings"
# ---------------------------------------------------------------------------
# The registry — one row per setting
# ---------------------------------------------------------------------------
# fmt: off
SETTINGS_REGISTRY = [
     # widget_attr                          config_key               default     widget_type
     ("click_speed_input",                 "Click_Speed",            25,         "spinbox"),
     ("click_interval_combobox",           "Click_Interval",         0,          "combobox"),
     ("mouse_button_combobox",             "Mouse_Button",           0,          "combobox"),
     ("click_limit_input",                 "Click_Limit",            1000,       "spinbox"),
     ("time_limit_input",                  "Time_Limit",             60,         "spinbox"),
     ("time_limit_combobox",               "Time_Limit_Modifier",    0,          "combobox"),
     ("activation_type_combobox",          "Activation_Type",        0,          "combobox"),
     ("speed_variation_input",             "Speed_Variation",        35,         "spinbox"),
     ("duty_cycle_input",                  "Duty_Cycle",             45,         "spinbox"),
     ("pos_x_input",                       "Pos_X",                  0,          "spinbox"),
     ("pos_y_input",                       "Pos_Y",                  0,          "spinbox"),
     ("position_options_checkbox",         "Position_Check",         False,      "groupbox"),
     ("click_offset_input",                "Offset",                 15,         "spinbox"),
     ("click_offset_checkbox",             "Offset_Check",           True,      "checkbox"),
     ("telemetry_checkbox",                "Telemetry",              True,       "checkbox"),
     ("speed_variation_checkbox",          "Speed_Variation_Check",  True,      "checkbox"),
     ("click_limit_checkbox",              "Click_Limit_Check",      False,      "checkbox"),
     ("time_limit_checkbox",               "Time_Limit_Check",       False,      "checkbox"),
     ("advanced_options_checkbox",         "Advanced_Options",       False,      "checkbox"),
     ("click_offset_chance_input",         "Offset_Chance",          80,         "spinbox"),
     ("click_offset_chance_input_checkbox","Offset_Chance_Check",    True,      "checkbox"),
     ("click_offset_smoothing_input_checkbox","Smoothing_Check",     True,      "checkbox"),
     # keysequence and tab index are handled separately below
]
# fmt: on
# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_widget(ui_objects, attr):
    return getattr(ui_objects, attr, None)


def _read_widget(widget, widget_type):
    if widget_type == "spinbox":
        return widget.value()
    elif widget_type == "combobox":
        return widget.currentIndex()
    elif widget_type in ("checkbox", "groupbox"):
        return widget.isChecked()
    return None


def _write_widget(widget, widget_type, value):
    if widget_type == "spinbox":
        widget.setValue(int(value))
    elif widget_type == "combobox":
        widget.setCurrentIndex(int(value))
    elif widget_type in ("checkbox", "groupbox"):
        if isinstance(value, str):
            value = value.lower() in ("true", "1", "yes")
        widget.setChecked(bool(value))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
shortcut = "Ctrl+K"


def load_settings(ui_objects, config: ConfigParser, log=None) -> str:
    """
    Read config.ini and push every registered setting into the UI.
    Returns the keyboard sequence string.
    """
    global shortcut

    if not os.path.exists(CONFIG_FILE):
        if log:
            log(f"No config found at {CONFIG_FILE}, using defaults.")
        return shortcut

    config.read(CONFIG_FILE)

    for attr, key, default, wtype in SETTINGS_REGISTRY:
        widget = _get_widget(ui_objects, attr)
        if widget is None:
            continue

        if isinstance(default, bool):
            value = config.getboolean(CONFIG_SECTION, key, fallback=default)
        elif isinstance(default, int):
            value = config.getint(CONFIG_SECTION, key, fallback=default)
        else:
            value = config.get(CONFIG_SECTION, key, fallback=default)

        _write_widget(widget, wtype, value)
        if log:
            log(f"Loaded {key} = {value}")

    raw_shortcut = config.get(
        CONFIG_SECTION, "Keyboard_Sequence", fallback="Ctrl+K")
    if raw_shortcut and raw_shortcut.strip() != "":
        shortcut = raw_shortcut

    ui_objects.key_sequence.blockSignals(True)
    ui_objects.key_sequence.setKeySequence(shortcut)
    ui_objects.key_sequence.blockSignals(False)

    ui_objects.key_sequence.setKeySequence(shortcut)

    tab_index = config.getint(CONFIG_SECTION, "Tab_Index", fallback=0)
    ui_objects.tabs.setCurrentIndex(tab_index)

    if log:
        log(f"Loaded Tab_Index = {tab_index}")

    return shortcut


def save_settings(ui_objects, config: ConfigParser, keybind_hotkey, debug_mode, log=None):
    ensure_config_dir()

    if CONFIG_SECTION not in config:
        config[CONFIG_SECTION] = {}

    for attr, key, _default, wtype in SETTINGS_REGISTRY:
        widget = _get_widget(ui_objects, attr)
        if widget is None:
            continue
        value = _read_widget(widget, wtype)
        config[CONFIG_SECTION][key] = str(value)

    config[CONFIG_SECTION]["Keyboard_Sequence"] = str(keybind_hotkey)
    config[CONFIG_SECTION]["Debug_Mode"] = str(debug_mode)
    config[CONFIG_SECTION]["Tab_Index"] = str(ui_objects.tabs.currentIndex())

    with open(CONFIG_FILE, "w") as f:
        config.write(f)

    if log:
        log(f"Settings saved to {CONFIG_FILE}")


def reset_defaults(ui_objects, log=None):
    """
    Reset every registered setting to its declared default value.
    """
    for attr, _key, default, wtype in SETTINGS_REGISTRY:
        widget = _get_widget(ui_objects, attr)
        if widget is None:
            continue
        _write_widget(widget, wtype, default)

    # Keyboard sequence default
    ui_objects.key_sequence.setKeySequence(shortcut)

    # Tab index default
    ui_objects.tabs.setCurrentIndex(0)

    if log:
        log("All settings reset to defaults.")


def get_debug_mode(config: ConfigParser) -> bool:
    """Convenience: read Debug_Mode from an already-loaded config."""
    return config.getboolean(CONFIG_SECTION, "Debug_Mode", fallback=False)
