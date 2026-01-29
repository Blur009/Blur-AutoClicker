from asyncio import wait
from PySide6.QtUiTools import QUiLoader
from PySide6.QtCore import (QFile, QTimer)
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QPushButton, QSpinBox)
from PySide6.QtGui import QCursor
import sys
from datetime import datetime
import time
import keyboard
import threading
from Scripts import C_Clicker as AClicker

DEBUG_MODE = False
def debug_log(message):
    if DEBUG_MODE:
        print(message)


def current_time():
    return datetime.now().strftime('%H:%M:%S')


if __name__ == "__main__":
    app = QApplication(sys.argv)
    loader = QUiLoader()
    file = QFile("BlurAutoClicker.ui")
    file.open(QFile.ReadOnly)
    ui = loader.load(file)
    file.close()

    is_clicking = False
    DEFAULT_TEXT = "SET KEYBIND"
    keybind_hotkey: str | None = None
    keybind_mode = "toggle"
    is_recording_bind = False
    held_keys = set()
    registered_hotkey: str | None = None
    hold_monitor_running = False


    # ==========================================
    # 1. UI Objects Definition
    # ==========================================

    class UIObjects:
        # Initializes all the buttons and stuff so they can be used in def.
        btn_reset = ui.findChild(QPushButton, "ResetSettingsButton")
        click_speed = ui.findChild(QSpinBox, "ClicksSpeedInputBox")
        limits_clicks = ui.findChild(QSpinBox, "ClicksLimitInputBox")
        limits_seconds = ui.findChild(QSpinBox, "SecondsLimitInputBox")
        pos_x = ui.findChild(QSpinBox, "PosXInputBox")
        pos_y = ui.findChild(QSpinBox, "PosYInputBox")
        pos_changing = ui.findChild(QPushButton, "PickingPosButton")
        activation_type_combobox = ui.findChild(QComboBox, "ActivationTypeComboBox")
        click_interval_combobox = ui.findChild(QComboBox, "ClickIntervalComboBox")
        mouse_button_combobox = ui.findChild(QComboBox, "MouseButtonComboBox")
        speed_variation = ui.findChild(QSpinBox, "SpeedVariationInputBox")
        duty_cycle = ui.findChild(QSpinBox, "DutyCycleInputBox")
        position_checkbox = ui.findChild(QCheckBox, "EnablePositionCheckBox")
        click_offset_checkbox = ui.findChild(QCheckBox, "ClickOffsetCheckBox")
        click_offset = ui.findChild(QSpinBox, "ClickOffsetInputBox")
        btn_set_keybind = ui.findChild(QPushButton, "pushButton_2")
        btn_pick_position = ui.findChild(QPushButton, "pushButton_3")


    # ==========================================
    # 2. Logic Functions
    # ==========================================

    def reset_defaults():
        debug_log("--- Resetting all Values... ---")
        start = time.perf_counter()

        UIObjects.click_speed.setValue(15)
        UIObjects.limits_clicks.setValue(0)
        UIObjects.limits_seconds.setValue(0)
        UIObjects.pos_x.setValue(0)
        UIObjects.pos_y.setValue(0)
        UIObjects.activation_type_combobox.setCurrentIndex(0)
        UIObjects.click_interval_combobox.setCurrentIndex(0)
        UIObjects.mouse_button_combobox.setCurrentIndex(0)
        UIObjects.speed_variation.setValue(5)
        UIObjects.duty_cycle.setValue(25)
        UIObjects.position_checkbox.setChecked(False)
        UIObjects.click_offset_checkbox.setChecked(False)
        UIObjects.click_offset.setValue(5)

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
                trigger_clicker()
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
                trigger_clicker()
            while keyboard.is_pressed(hotkey_str):
                time.sleep(0.15)
            if is_clicking:
                trigger_clicker()
        finally:
            hold_monitor_running = False


    def set_keybind_mode(*args):
        global keybind_mode
        # We assume the combo box sends the new index or text.
        # In your UI, the items are "Toggle" and "Hold".
        # Let's grab the text directly from the widget to be safe.
        mode_text = UIObjects.activation_type_combobox.currentText().lower()
        if "hold" in mode_text:
            keybind_mode = "hold"
        else:
            keybind_mode = "toggle"
        register_hotkey()


    def start_recording_keybind(*args):
        global is_recording_bind, keybind_hotkey
        if is_recording_bind:
            is_recording_bind = False
            update_button_text()
        else:
            is_recording_bind = True
            UIObjects.btn_set_keybind.setText("PRESS KEYS NOW...")

            def record():
                global is_recording_bind, keybind_hotkey
                try:
                    hotkey = keyboard.read_hotkey()
                    if is_recording_bind:
                        keybind_hotkey = hotkey
                        is_recording_bind = False
                        update_button_text()
                        register_hotkey()
                except (Exception, KeyboardInterrupt):
                    is_recording_bind = False
                    update_button_text()

            threading.Thread(target=record, daemon=True).start()


    def update_button_text():
        if keybind_hotkey:
            UIObjects.btn_set_keybind.setText(f"KEYBIND: {keybind_hotkey}")
        else:
            UIObjects.btn_set_keybind.setText(DEFAULT_TEXT)


    def trigger_clicker():
        toggle_clicker_start_stop()


    def on_key_event(event):
        global held_keys
        if event.event_type == keyboard.KEY_DOWN:
            held_keys.add(event.name)
        elif event.event_type == keyboard.KEY_UP:
            held_keys.discard(event.name)


    def enable_keybind_hook():
        try:
            keyboard.unhook_all()
        except (RuntimeError, AttributeError):
            pass
        keyboard.hook(on_key_event)


    def on_clicker_finished():
        global is_clicking
        if is_clicking:
            is_clicking = False
            debug_log("Clicker finished: Limit reached.")


    def toggle_clicker_start_stop(*args):
        global is_clicking
        is_clicking = not is_clicking

        if is_clicking:
            try:
                # Get values from UI
                amount = UIObjects.click_speed.value()

                # Map the text from UI to the unit string expected by C_Clicker
                # Your UI has: "Second", "Minute", "Hour", "Day"
                unit_map = {
                    "Second": "second",
                    "Minute": "minute",
                    "Hour": "hour",
                    "Day": "day"
                }
                unit_text = UIObjects.click_interval_combobox.currentText()
                unit = unit_map.get(unit_text, "second")

                variation = UIObjects.speed_variation.value()
                limit = UIObjects.limits_clicks.value()
                time_limit = UIObjects.limits_seconds.value()

                duty = UIObjects.duty_cycle.value()

                # Map mouse button text
                btn_map = {
                    "Left Click": "left",
                    "Right Click": "right",
                    "Middle Click": "middle"
                }
                btn_text = UIObjects.mouse_button_combobox.currentText()
                button = btn_map.get(btn_text, "left")



                if UIObjects.position_checkbox.isChecked():
                    pos = (UIObjects.pos_x.value(), UIObjects.pos_y.value())
                else:
                    pos = (0,0)

                if UIObjects.click_offset_checkbox.isChecked():
                    offset = UIObjects.click_offset.value()
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


    def set_position_current(*args):
        UIObjects.pos_changing.setVisible(True)
        start_countdown(4)

    def finish_position_pick():
        pos = QCursor.pos()

        UIObjects.pos_changing.setVisible(False)
        UIObjects.pos_x.setValue(pos.x())
        UIObjects.pos_y.setValue(pos.y())

    def start_countdown(seconds_left):
        UIObjects.pos_changing.setText(f"Picking Cursor position in {seconds_left}s")

        if seconds_left > 1:
            QTimer.singleShot(1000, lambda: start_countdown(seconds_left - 1))
        else:
            QTimer.singleShot(1000, finish_position_pick)



    # ==========================================
    # 3. Make Buttons Work
    # ==========================================

    # Reset Button
    UIObjects.btn_reset.clicked.connect(reset_defaults)

    # Keybind Recording
    UIObjects.btn_set_keybind.clicked.connect(start_recording_keybind)

    # Pick Position
    UIObjects.pos_changing.setVisible(False)
    UIObjects.btn_pick_position.clicked.connect(set_position_current)

    # Click Interval ComboBox Change -> Update Mode
    UIObjects.activation_type_combobox.currentIndexChanged.connect(set_keybind_mode)

    # Debug Logs (Value Changed)
    UIObjects.click_speed.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Speed set to {val}"))
    UIObjects.limits_clicks.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Limit set to {val}"))
    UIObjects.limits_seconds.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Time Limit set to {val} seconds"))
    UIObjects.pos_x.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Pos X set to {val}"))
    UIObjects.pos_y.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Pos Y set to {val}"))
    UIObjects.speed_variation.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Speed Randomization Value set to {val}%"))
    UIObjects.duty_cycle.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Duty Cycle set to {val}%"))
    UIObjects.click_offset.valueChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Offset set to {val}"))
    UIObjects.activation_type_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Activation Type set to {val}"))
    UIObjects.click_interval_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Click Interval set to {val}"))
    UIObjects.mouse_button_combobox.currentIndexChanged.connect(lambda val: debug_log(f"[{current_time()}] Mouse Button set to {val}"))
    UIObjects.position_checkbox.toggled.connect(lambda val: debug_log(f"[{current_time()}] Position Activation set to {val}"))
    UIObjects.click_offset_checkbox.toggled.connect(lambda val: debug_log(f"[{current_time()}] Click Offset Activation set to {val}"))


    enable_keybind_hook()
    register_hotkey()

    ui.show()
    sys.exit(app.exec())