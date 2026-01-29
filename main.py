from PySide6.QtUiTools import QUiLoader
from PySide6.QtCore import (QFile, QTimer)
from PySide6.QtWidgets import (QApplication, QKeySequenceEdit, QCheckBox, QComboBox, QPushButton, QSpinBox, QLabel)
from PySide6.QtGui import QCursor
from datetime import datetime
import sys
import time
import keyboard
import threading
import requests
from Scripts import C_Clicker as AClicker

# TODO:
# Saving settings on exit.

CURRENT_VERSION = "v0.0.2"

DEBUG_MODE = False
def debug_log(message):
    if DEBUG_MODE:
        print(message)


def current_time():
    return datetime.now().strftime('%H:%M:%S')


class UIObjects:

    def __init__(self, ui):

        # Initializes all the buttons and stuff so they can be used in def.
        self.btn_reset = ui.findChild(QPushButton, "ResetSettingsButton")
        self.click_speed = ui.findChild(QSpinBox, "ClicksSpeedInputBox")
        self.limits_clicks = ui.findChild(QSpinBox, "ClicksLimitInputBox")
        self.limits_seconds = ui.findChild(QSpinBox, "SecondsLimitInputBox")
        self.pos_x = ui.findChild(QSpinBox, "PosXInputBox")
        self.pos_y = ui.findChild(QSpinBox, "PosYInputBox")
        self.pos_changing = ui.findChild(QPushButton, "PickingPosButton")
        self.activation_type_combobox = ui.findChild(QComboBox, "ActivationTypeComboBox")
        self.click_interval_combobox = ui.findChild(QComboBox, "ClickIntervalComboBox")
        self.mouse_button_combobox = ui.findChild(QComboBox, "MouseButtonComboBox")
        self.speed_variation = ui.findChild(QSpinBox, "SpeedVariationInputBox")
        self.duty_cycle = ui.findChild(QSpinBox, "DutyCycleInputBox")
        self.position_checkbox = ui.findChild(QCheckBox, "EnablePositionCheckBox")
        self.click_offset_checkbox = ui.findChild(QCheckBox, "ClickOffsetCheckBox")
        self.click_offset = ui.findChild(QSpinBox, "ClickOffsetInputBox")
        self.key_sequence = ui.findChild(QKeySequenceEdit, "KeySequenceEdit")
        self.btn_pick_position = ui.findChild(QPushButton, "pushButton_3")
        self.version_label = ui.findChild(QLabel, "VersionLabel")
        self.update_status_label = ui.findChild(QLabel, "UpdateStatusLabel")
        self.download_update_button = ui.findChild(QPushButton, "DownloadUpdateButton")
        self.download_updater = ui.findChild(QLabel, "downloadongithub")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    loader = QUiLoader()
    file = QFile("BlurAutoClicker.ui")
    file.open(QFile.ReadOnly)
    ui = loader.load(file)
    file.close()

    ui_objects = UIObjects(ui)

    is_clicking = False
    keybind_hotkey: str | None = None
    keybind_mode = "toggle"
    registered_hotkey: str | None = None
    hold_monitor_running = False

    def reset_defaults():
        debug_log("--- Resetting all Values... ---")
        start = time.perf_counter()

        ui_objects.click_speed.setValue(15)
        ui_objects.limits_clicks.setValue(0)
        ui_objects.limits_seconds.setValue(0)
        ui_objects.pos_x.setValue(0)
        ui_objects.pos_y.setValue(0)
        ui_objects.activation_type_combobox.setCurrentIndex(0)
        ui_objects.click_interval_combobox.setCurrentIndex(0)
        ui_objects.mouse_button_combobox.setCurrentIndex(0)
        ui_objects.speed_variation.setValue(5)
        ui_objects.duty_cycle.setValue(25)
        ui_objects.position_checkbox.setChecked(False)
        ui_objects.click_offset_checkbox.setChecked(False)
        ui_objects.click_offset.setValue(5)

        end = time.perf_counter()
        debug_log(f"All Settings reset to default. This took {end - start} Seconds")


    def register_hotkey():
        global registered_hotkey, keybind_hotkey, keybind_mode, hold_monitor_running
        if registered_hotkey and isinstance(registered_hotkey, str):
            try:
                keyboard.remove_hotkey(registered_hotkey)
            except KeyError:
                pass
            registered_hotkey = None
        if not keybind_hotkey: return

        def on_hotkey_trigger():
            if not keyboard.is_pressed(keybind_hotkey):
                return
            if keybind_mode == "toggle":
                toggle_clicker_start_stop()
            elif keybind_mode == "hold":
                start_hold_monitor(keybind_hotkey)

        try:
            keyboard.add_hotkey(keybind_hotkey, on_hotkey_trigger)
            registered_hotkey = keybind_hotkey
            debug_log(f"[Hotkey] Registered: {keybind_hotkey} ({keybind_mode})")
        except Exception as e:
            debug_log(f"[Hotkey] Failed to register '{keybind_hotkey}': {e}")


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
                time.sleep(0.15)
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
            debug_log("Clicker finished: Limit reached.")


    def toggle_clicker_start_stop():
        global is_clicking
        is_clicking = not is_clicking

        if is_clicking:
            try:
                # Get values from UI
                amount = ui_objects.click_speed.value()

                # Map the text from UI to the unit string expected by C_Clicker
                # UI has: "Second", "Minute", "Hour", "Day"
                unit_map = {
                    "Second": "second",
                    "Minute": "minute",
                    "Hour": "hour",
                    "Day": "day"
                }
                unit_text = ui_objects.click_interval_combobox.currentText()
                unit = unit_map.get(unit_text, "second")

                variation = ui_objects.speed_variation.value()
                limit = ui_objects.limits_clicks.value()
                time_limit = ui_objects.limits_seconds.value()

                duty = ui_objects.duty_cycle.value()

                # Map mouse button text
                btn_map = {
                    "Left Click": "left",
                    "Right Click": "right",
                    "Middle Click": "middle"
                }
                btn_text = ui_objects.mouse_button_combobox.currentText()
                button = btn_map.get(btn_text, "left")



                if ui_objects.position_checkbox.isChecked():
                    pos = (ui_objects.pos_x.value(), ui_objects.pos_y.value())
                else:
                    pos = (0,0)

                if ui_objects.click_offset_checkbox.isChecked():
                    offset = ui_objects.click_offset.value()
                else:
                    offset = 0

                settings = {
                    "click_amount": amount,
                    "click_unit": unit,
                    "click_variation": variation,
                    "click_limit": limit,
                    "click_duty_cycle": duty,
                    "click_time_limit": time_limit,
                    "click_button": button,
                    "click_position": pos,
                    "click_position_offset": offset
                }

                AClicker.start_clicker(settings, on_clicker_finished)
                debug_log("Clicker started")

            except Exception as e:
                debug_log(f"Error starting clicker: {e}")
                is_clicking = False
        else:
            AClicker.stop_clicker()
            debug_log("Clicker stopped")


    def on_keybind_changed():
        seq = ui_objects.key_sequence.keySequence()
        key_string = seq.toString().lower()
        key_string = key_string.replace("meta", "win")
        if key_string:
            global keybind_hotkey
            keybind_hotkey = key_string
            debug_log(f"Keybind set to: {keybind_hotkey}")
            register_hotkey()
        else:
            debug_log("Keybind cleared")

    def set_position_current():
        ui_objects.pos_changing.setVisible(True)
        start_countdown(4)

    def finish_position_pick():
        pos = QCursor.pos()
        ui_objects.pos_changing.setVisible(False)
        ui_objects.pos_x.setValue(pos.x())
        ui_objects.pos_y.setValue(pos.y())

    def start_countdown(seconds_left):
        ui_objects.pos_changing.setText(f"Picking Cursor position in {seconds_left}s")

        if seconds_left > 1:
            QTimer.singleShot(1000, lambda: start_countdown(seconds_left - 1))
        else:
            QTimer.singleShot(1000, finish_position_pick)


    def get_newest_version():
        url = f"https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                return data["tag_name"]
            else:
                debug_log(f"Error connecting to GitHub: {response.status_code}")
                return None
        except Exception as e:
            debug_log(f"An error occurred: {e}")
            return None


    def is_update_available(remote_version, local_version):
        debug_log(f"Comparing Remote: {remote_version} vs Local: {local_version}")
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
        debug_log("Checking for updates on startup...")
        github_version = get_newest_version()
        if github_version:
            if is_update_available(github_version, CURRENT_VERSION):
                debug_log("UPDATE AVAILABLE!")
                html_text = '<html><head/><body><p><span style=" color:#1aff22;">Updates Available! Check my GitHub (Blur009)</span></p></body></html>'
                ui_objects.update_status_label.setText(html_text)
                ui_objects.update_status_label.setVisible(True)
            else:
                debug_log("You are on the latest version.")
                ui_objects.update_status_label.setText("No Updates Found")
        else:
            debug_log("Could not check versions.")

    perform_startup_update_check()


    def stop_clicker():
        # Used for emergency stop and keybind change stop.
        global is_clicking
        if is_clicking:
            is_clicking = False
        return

    # Update
    ui_objects.version_label.setText(f"{CURRENT_VERSION}")
    ui_objects.update_status_label.setText("No Updates Found")
    ui_objects.update_status_label.setVisible(False)

    # Reset Button
    ui_objects.btn_reset.clicked.connect(reset_defaults)

    # Keybind
    ui_objects.key_sequence.keySequenceChanged.connect(on_keybind_changed)
    ui_objects.key_sequence.keySequenceChanged.connect(stop_clicker)

    # Pick Position
    ui_objects.pos_changing.setVisible(False)
    ui_objects.btn_pick_position.clicked.connect(set_position_current)

    # Click Interval ComboBox Change
    ui_objects.activation_type_combobox.currentIndexChanged.connect(set_keybind_mode)

    # Debug Logs (Value Changed)
    ui_objects.click_speed.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Speed set to {val}"))
    ui_objects.limits_clicks.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Limit set to {val}"))
    ui_objects.limits_seconds.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Time Limit set to {val} seconds"))
    ui_objects.pos_x.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Pos X set to {val}"))
    ui_objects.pos_y.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Pos Y set to {val}"))
    ui_objects.speed_variation.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Speed Randomization Value set to {val}%"))
    ui_objects.duty_cycle.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Duty Cycle set to {val}%"))
    ui_objects.click_offset.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Offset set to {val}"))
    ui_objects.activation_type_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Activation Type set to {val}"))
    ui_objects.click_interval_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Interval set to {val}"))
    ui_objects.mouse_button_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Mouse Button set to {val}"))
    ui_objects.position_checkbox.toggled.connect(lambda val: debug_log(f"[{current_time()}] Position Activation set to {val}"))
    ui_objects.click_offset_checkbox.toggled.connect(lambda val: debug_log(f"[{current_time()}] Click Offset Activation set to {val}"))

    # UI stuff idk
    ui.show()
    sys.exit(app.exec())