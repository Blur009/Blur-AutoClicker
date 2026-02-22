"""
 * Blur Auto Clicker - update_checker.py
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

# Module-level state
_ui_widgets = None
_log_func = None
_current_version = None


def initialize(ui_widgets, log_func, current_version):
    # Initialize the update checker with UI widgets, logging, and version.
    global _ui_widgets, _log_func, _current_version
    _ui_widgets = ui_widgets
    _log_func = log_func
    _current_version = current_version


def get_newest_version():
    # Fetch the latest version from GitHub.
    url = "https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()["tag_name"]
        if _log_func:
            _log_func(f"Error connecting to GitHub: {response.status_code}")
    except Exception as e:
        if _log_func:
            _log_func(f"An error occurred: {e}")
    return None


def is_update_available(remote_version, local_version):
    # Compare two version strings.
    r = remote_version.replace("v", "")
    l = local_version.replace("v", "")

    r_parts = r.split(".")
    l_parts = l.split(".")

    max_len = max(len(r_parts), len(l_parts))
    r_parts += ['0'] * (max_len - len(r_parts))
    l_parts += ['0'] * (max_len - len(l_parts))

    for i in range(max_len):
        try:
            r_num = int(r_parts[i])
        except ValueError:
            r_num = 0
        try:
            l_num = int(l_parts[i])
        except ValueError:
            l_num = 0

        if r_num > l_num:
            return True
        elif r_num < l_num:
            return False
    return False


def perform_startup_update_check():
    # Check for updates on startup and update UI.
    if not _ui_widgets or not _log_func or not _current_version:
        return

    _log_func("Checking for updates on startup...")
    github_version = get_newest_version()
    if github_version:
        if is_update_available(github_version, _current_version):
            _log_func("UPDATE AVAILABLE!")
            _ui_widgets.update_status_label.setVisible(True)
            _ui_widgets.update_status_label.setText(
                '<html><head/><body><p><span style=" color:#1aff22;">'
                'Updates Available! Check my GitHub (Blur009)</span></p></body></html>'
            )
        else:
            _log_func("You are on the latest version.")
            _ui_widgets.update_status_label.setText("No Updates Found")
    else:
        _log_func("Could not check versions.")
