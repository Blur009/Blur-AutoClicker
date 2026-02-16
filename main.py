import atexit
import sys
import threading
import time
from configparser import ConfigParser
from datetime import datetime
from os.path import exists
import keyboard
import requests
from PySide6.QtCore import (QTimer)
from PySide6.QtGui import QCursor
from PySide6.QtWidgets import (QApplication, QKeySequenceEdit, QCheckBox, QComboBox, QPushButton, QSpinBox, QLabel,
                               QMainWindow)

from Scripts import C_Clicker as AClicker
from ui_mainwindow import Ui_BlurAutoClicker

# TODO:
# max click speed dynamically changing depending on what interval is selected
"""
this update (v1.1.1 → v1.2.1) was to change the main clicker engine to run on GO istead of C.
"""

CURRENT_VERSION = "v1.2.1"

DEBUG_MODE = False
DEBUG_MODE_VERBOSE = False
def log(message):
    if DEBUG_MODE:
        print(message)

if DEBUG_MODE_VERBOSE:
    if DEBUG_MODE:
        def debug_log_v(messagev):
            print(f"[{current_time()}] {messagev}")
else:
    def debug_log_v(messagev):
        return


def current_time():
    return datetime.now().strftime('%H:%M:%S')

config = ConfigParser()


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
    window = QMainWindow()
    ui = Ui_BlurAutoClicker()
    ui.setupUi(window)
    ui_objects = UIObjects(window)


    is_clicking = False
    keybind_hotkey: str | None = None
    keybind_mode = "toggle"
    registered_hotkey: str | None = None
    hold_monitor_running = False

    if exists("config.ini"):
        config.read("config.ini")
        ui_objects.click_speed.setValue(config.getint("Settings", "Click_Speed", fallback= 15))
        ui_objects.click_interval_combobox.setCurrentIndex(config.getint("Settings", "Click_Interval", fallback= 0))
        ui_objects.mouse_button_combobox.setCurrentIndex(config.getint("Settings", "Mouse_Button", fallback= 0))
        ui_objects.limits_clicks.setValue(config.getint("Settings", "Click_Limit", fallback= 0))
        ui_objects.limits_seconds.setValue(config.getint("Settings", "Time_Limit", fallback= 0))
        ui_objects.activation_type_combobox.setCurrentIndex(config.getint("Settings", "Activation_Type", fallback= 0))
        ui_objects.speed_variation.setValue(config.getint("Settings", "Speed_Variation", fallback= 5))
        ui_objects.duty_cycle.setValue(config.getint("Settings", "Duty_Cycle", fallback= 25))
        ui_objects.pos_x.setValue(config.getint("Settings", "Pos_X", fallback= 0))
        ui_objects.pos_y.setValue(config.getint("Settings", "Pos_Y", fallback= 0))
        ui_objects.position_checkbox.setChecked(config.getboolean("Settings", "Position_Check", fallback= False))
        ui_objects.click_offset.setValue(config.getint("Settings", "Offset", fallback= 5))
        ui_objects.click_offset_checkbox.setChecked(config.getboolean("Settings", "Offset_Check", fallback= False))

        shortcut_string = config.get("Settings", "Keyboard_Sequence", fallback= "Ctrl+K")
        if shortcut_string == ("none", ""):
            shortcut_string = "Ctrl+K"
        ui_objects.key_sequence.setKeySequence(shortcut_string)

        DEBUG_MODE = config.getboolean("Settings", "Debug_Mode", fallback= False)

        #set keybind cuz it doesn't work if you don't for some reason (●'◡'●)
        keybind_hotkey = shortcut_string.lower().replace("meta", "win")
    else:
        shortcut_string = "Ctrl+K"
        keybind_hotkey = shortcut_string.lower().replace("meta", "win")




    def reset_defaults():
        log(f"[{current_time()}] --- Resetting all Values... ---")
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
        ui_objects.key_sequence.setKeySequence("Ctrl+K")

        end = time.perf_counter()
        log(f"[{current_time()}] All Settings reset to default. This took {end - start} Seconds")


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
                time.sleep(0.05)  # More responsive key release detection
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
            log(f"[{current_time()}] Clicker finished: Limit reached.")


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
                log(f"[{current_time()}] Clicker started")

            except Exception as e:
                log(f"[{current_time()}] Error starting clicker: {e}")
                is_clicking = False
        else:
            AClicker.stop_clicker()
            log(f"[{current_time()}] Clicker stopped")


    def on_keybind_changed():
        seq = ui_objects.key_sequence.keySequence()
        key_string = seq.toString().lower()
        key_string = key_string.replace("meta", "win")
        if key_string:
            global keybind_hotkey
            keybind_hotkey = key_string
            log(f"[{current_time()}] Keybind set to: {keybind_hotkey}")
            register_hotkey()
        else:
            log(f"[{current_time()}] Keybind cleared")

    def set_position_current():
        ui_objects.pos_changing.setVisible(True)
        start_countdown()

    def finish_position_pick():
        pos = QCursor.pos()
        ui_objects.pos_changing.setVisible(False)
        ui_objects.pos_x.setValue(pos.x())
        ui_objects.pos_y.setValue(pos.y())

    countdown_timer = None
    def start_countdown(seconds_left=4):
        global countdown_timer
        if countdown_timer:
            countdown_timer.stop()
        
        def countdown_tick():
            nonlocal seconds_left
            if seconds_left > 1:
                ui_objects.pos_changing.setText(f"Picking Cursor position in {seconds_left - 1}s")
                seconds_left -= 1
            else:
                countdown_timer.stop()
                finish_position_pick()
        
        countdown_timer = QTimer()
        countdown_timer.timeout.connect(countdown_tick)
        countdown_timer.start(1000)
        ui_objects.pos_changing.setText(f"Picking Cursor position in {seconds_left}s")


    ui_objects.update_status_label.setVisible(False)
    def get_newest_version():
        url = f"https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                return data["tag_name"]
            else:
                log(f"[{current_time()}] Error connecting to GitHub: {response.status_code}")
                return None
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
                html_text = '<html><head/><body><p><span style=" color:#1aff22;">Updates Available! Check my GitHub (Blur009)</span></p></body></html>'
                ui_objects.update_status_label.setVisible(True)
                ui_objects.update_status_label.setText(html_text)
            else:
                log(f"[{current_time()}] You are on the latest version.")
                ui_objects.update_status_label.setText("No Updates Found")
        else:
            log(f"[{current_time()}] Could not check versions.")

    perform_startup_update_check()


    def stop_clicker():
        # Used for emergency stop and keybind change stop.
        global is_clicking
        if is_clicking:
            is_clicking = False
        return

    # Update
    ui_objects.version_label.setText(f"{CURRENT_VERSION}")
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
    ui_objects.click_speed.valueChanged.connect(lambda val: log(f"[{current_time()}] Click Speed set to {val}"))
    ui_objects.limits_clicks.valueChanged.connect(lambda val: log(f"[{current_time()}] Click Limit set to {val}"))
    ui_objects.limits_seconds.valueChanged.connect(lambda val: log(f"[{current_time()}] Time Limit set to {val} seconds"))
    ui_objects.pos_x.valueChanged.connect(lambda val: log(f"[{current_time()}] Pos X set to {val}"))
    ui_objects.pos_y.valueChanged.connect(lambda val: log(f"[{current_time()}] Pos Y set to {val}"))
    ui_objects.speed_variation.valueChanged.connect(lambda val: log(f"[{current_time()}] Speed Randomization Value set to {val}%"))
    ui_objects.duty_cycle.valueChanged.connect(lambda val: log(f"[{current_time()}] Duty Cycle set to {val}%"))
    ui_objects.click_offset.valueChanged.connect(lambda val: log(f"[{current_time()}] Click Offset set to {val}"))
    ui_objects.activation_type_combobox.currentIndexChanged.connect(lambda val: log(f"[{current_time()}] Activation Type set to {val}"))
    ui_objects.click_interval_combobox.currentIndexChanged.connect(lambda val: log(f"[{current_time()}] Click Interval set to {val}"))
    ui_objects.mouse_button_combobox.currentIndexChanged.connect(lambda val: log(f"[{current_time()}] Mouse Button set to {val}"))
    ui_objects.position_checkbox.toggled.connect(lambda val: log(f"[{current_time()}] Position Activation set to {val}"))
    ui_objects.click_offset_checkbox.toggled.connect(lambda val: log(f"[{current_time()}] Click Offset Activation set to {val}"))

    register_hotkey()

    # Close UI and update config.
    window.show()
    def exit_handler():
        if not exists("config.ini"):
            config.add_section("Settings")
        elif "Settings" not in config:
            config["Settings"] = {}

        click_speed = ui_objects.click_speed.value()
        log(f"[{current_time()}] Click speed saved as {click_speed}")
        config["Settings"]["Click_Speed"] = str(click_speed)

        click_period = ui_objects.click_interval_combobox.currentIndex()
        log(f"[{current_time()}] Click interval saved as {click_period}")
        config["Settings"]["Click_Interval"] = str(click_period)

        mouse_button = ui_objects.mouse_button_combobox.currentIndex()
        log(f"[{current_time()}] Mouse button saved as {mouse_button}")
        config["Settings"]["Mouse_Button"] = str(mouse_button)

        click_limit = ui_objects.limits_clicks.value()
        log(f"[{current_time()}] Click limit saved as {click_limit}")
        config["Settings"]["Click_Limit"] = str(click_limit)

        time_limit = ui_objects.limits_seconds.value()
        log(f"[{current_time()}] Time limit saved as {time_limit}")
        config["Settings"]["Time_Limit"] = str(time_limit)

        activation_type = ui_objects.activation_type_combobox.currentIndex()
        log(f"[{current_time()}] Activation type saved as {activation_type}")
        config["Settings"]["Activation_Type"] = str(activation_type)

        speed_variation = ui_objects.speed_variation.value()
        log(f"[{current_time()}] Speed variation saved as {speed_variation}")
        config["Settings"]["Speed_Variation"] = str(speed_variation)

        duty_cycle = ui_objects.duty_cycle.value()
        log(f"[{current_time()}] Duty cycle saved as {duty_cycle}")
        config["Settings"]["Duty_Cycle"] = str(duty_cycle)

        pos_x = ui_objects.pos_x.value()
        log(f"[{current_time()}] Pos X saved as {pos_x}")
        config["Settings"]["Pos_X"] = str(pos_x)

        pos_y = ui_objects.pos_y.value()
        log(f"[{current_time()}] Pos Y saved as {pos_y}")
        config["Settings"]["Pos_Y"] = str(pos_y)

        position_check = ui_objects.position_checkbox.isChecked()
        log(f"[{current_time()}] Position check saved as {position_check}")
        config["Settings"]["Position_Check"] = str(position_check)

        offset = ui_objects.click_offset.value()
        log(f"[{current_time()}] Click offset saved as {offset}")
        config["Settings"]["Offset"] = str(offset)

        offset_check = ui_objects.click_offset_checkbox.isChecked()
        log(f"[{current_time()}] Offset check saved as {offset_check}")
        config["Settings"]["Offset_Check"] = str(offset_check)

        keybind = keybind_hotkey
        log(f"[{current_time()}] Keyboard sequence saved as {keybind}")
        config["Settings"]["Keyboard_Sequence"] = str(keybind)

        config["Settings"]["Debug_Mode"] = str(DEBUG_MODE)
        log(f"[{current_time()}] Debug mode saved as {DEBUG_MODE}")

        with open("config.ini", "w") as configfile:
            config.write(configfile)

    atexit.register(exit_handler)
    sys.exit(app.exec())
