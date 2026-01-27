from logging import root

import dearpygui.dearpygui as dpg
import ctypes as ct
import tkinter as tk
import time
import keyboard
import threading
from datetime import datetime
from Scripts import Anti_AFK as Anti_AFK
from Scripts import C_Clicker as AClicker

# used to track if the clicker is running so we can toggle the Start/Stop button text


is_clicking = False

if __name__ == '__main__':
    # --- KEYBIND STATE ---
    DEFAULT_TEXT = "SET KEYBIND"
    keybind_hotkey: str | None = None  # Added type hint for clarity
    keybind_mode = "toggle"
    is_recording_bind = False
    held_keys = set()  # Defined here so no functions crash looking for it

    # Variables for the new hotkey system
    _registered_hotkey: str | None = None  # Added type hint
    _hold_monitor_running = False


    # --- NEW HOTKEY LOGIC ---

    def register_hotkey():
        """
        Registers the current keybind_hotkey with keyboard.add_hotkey.
        Handles switching between Toggle and Hold modes.
        """
        global _registered_hotkey, keybind_hotkey, keybind_mode, _hold_monitor_running

        # 1. Unregister existing hotkey
        # We check if it's a string to satisfy type checkers (linter)
        if _registered_hotkey and isinstance(_registered_hotkey, str):
            try: keyboard.remove_hotkey(_registered_hotkey)
            except KeyError: pass
            _registered_hotkey = None

        if not keybind_hotkey: return

        # 2. Define what happens when the hotkey is pressed
        def on_hotkey_trigger():
            # SAFETY CHECK: Only proceed if the FULL combination is currently pressed.
            # This prevents the clicker from firing if you just press the modifier (e.g. Alt) alone.
            if not keyboard.is_pressed(keybind_hotkey):
                return

            if keybind_mode == "toggle":
                # Toggle mode: Just flip the switch
                trigger_clicker()
            elif keybind_mode == "hold":
                # Hold mode: Start a monitor thread
                start_hold_monitor(keybind_hotkey)

        # 3. Register the new hotkey
        try:
            keyboard.add_hotkey(keybind_hotkey, on_hotkey_trigger)
            _registered_hotkey = keybind_hotkey
            print(f"[Hotkey] Registered: {keybind_hotkey} ({keybind_mode})")
        except Exception as e:
            print(f"[Hotkey] Failed to register '{keybind_hotkey}': {e}")


    def start_hold_monitor(hotkey_str: str):
        """
        Starts a background thread that keeps the clicker active
        only while the key combination is physically held down.
        """
        global _hold_monitor_running
        if _hold_monitor_running:
            return

        _hold_monitor_running = True
        t = threading.Thread(target=_hold_monitor_loop, args=(hotkey_str,), daemon=True)
        t.start()


    def _hold_monitor_loop(hotkey_str: str):
        """
        The actual loop for Hold mode.
        It turns the clicker ON, waits for the key to be released, then turns it OFF.
        """
        global _hold_monitor_running, is_clicking

        try:
            # Immediately start clicking if not already clicking
            if not is_clicking:
                trigger_clicker()

            # Loop while the specific hotkey combination is pressed
            while keyboard.is_pressed(hotkey_str):
                time.sleep(0.05)  # Check every 50ms

            # Key released -> Stop clicking
            if is_clicking:
                trigger_clicker()

        finally:
            _hold_monitor_running = False


    # --- UI FUNCTIONS ---

    def set_keybind_mode(sender, app_data, user_data):
        _ = sender
        _ = app_data
        _ = user_data

        global keybind_mode
        val = dpg.get_value("keybind_mode_combo")
        if isinstance(val, str): keybind_mode = val.lower()
        else: keybind_mode = "toggle"
        register_hotkey()



    def start_recording_keybind(sender, app_data, user_data):
        _ = sender
        _ = app_data
        _ = user_data

        global is_recording_bind, keybind_hotkey
        if is_recording_bind:
            # Cancel
            is_recording_bind = False
            update_button_text()
        else:
            # Start Recording (in a thread so GUI doesn't freeze)
            is_recording_bind = True
            dpg.set_item_label("SET KEYBIND", "PRESS KEYS NOW...")

            def record():
                global is_recording_bind, keybind_hotkey
                try:
                    # keyboard.read_hotkey() waits until a key combo is pressed AND released.
                    # This solves the issue of the clicker firing while holding the key.
                    hotkey = keyboard.read_hotkey()

                    if is_recording_bind:
                        keybind_hotkey = hotkey
                        is_recording_bind = False
                        update_button_text()
                        register_hotkey()  # Register the new hotkey immediately
                except (Exception, KeyboardInterrupt):
                    # Catch potential read errors or keyboard library issues
                    is_recording_bind = False
                    update_button_text()

            threading.Thread(target=record, daemon=True).start()


    def update_button_text():
        if keybind_hotkey:
            # Display the hotkey nicely (e.g., "ctrl+k")
            dpg.set_item_label("SET KEYBIND", f"KEYBIND: {keybind_hotkey}")
        else:
            dpg.set_item_label("SET KEYBIND", DEFAULT_TEXT)


    def trigger_clicker():
        # Just calls your toggle function
        toggle_clicker_start_stop(None, None, None)


    def on_key_event(event):
        global held_keys
        # Do NOT add any clicker triggers here.
        # The clicker triggers are now handled by register_hotkey() above.
        if event.event_type == keyboard.KEY_DOWN:
            held_keys.add(event.name)
        elif event.event_type == keyboard.KEY_UP:
            held_keys.discard(event.name)


    def enable_keybind_hook():
        try:
            keyboard.unhook_all()
        except (RuntimeError, AttributeError):
            pass
        # We still hook on_key_event if you want to track held_keys for other reasons,
        # but for the clicker trigger, we rely on register_hotkey().
        keyboard.hook(on_key_event)


    # Start the listener
    enable_keybind_hook()


    def clicker_monitor():
        global is_clicking
        while True:
            # Placeholder for future monitoring logic
            time.sleep(0.1)


    def reset_defaults(sender, app_data, user_data):
        _ = sender
        _ = app_data
        _ = user_data
        # Reset all inputs to default values
        dpg.set_value("input_click_amount", 10)
        dpg.set_value("input_click_unit", "second")
        dpg.set_value("input_variation", 0)
        dpg.set_value("input_limit", 0)
        dpg.set_value("input_time_limit", 0)
        dpg.set_value("input_duty", 50)
        dpg.set_value("input_button", "left")
        dpg.set_value("input_position", (0, 0))
        dpg.set_value("input_offset", 0)
        print("Defaults Reset.")


    def on_clicker_finished():
        """
        Called by C_Clicker when the thread finishes (e.g., limit reached).
        Resets the UI state without trying to stop an already stopped engine.
        """
        global is_clicking

        # Only update if the clicker thinks it's still running.
        # (This prevents conflict if the user manually pressed STOP)
        if is_clicking:
            is_clicking = False
            dpg.set_item_label("btn_start_stop", "START CLICKING")
            print("Clicker finished: Limit reached.")

    def toggle_clicker_start_stop(sender, app_data, user_data):
        _ = sender
        _ = app_data
        _ = user_data

        global is_clicking

        is_clicking = not is_clicking

        if is_clicking:
            # --- START ---
            try:
                amount = dpg.get_value("input_click_amount")
                unit = dpg.get_value("input_click_unit")

                variation = dpg.get_value("input_variation")
                limit = dpg.get_value("input_limit")
                time_limit = dpg.get_value("input_time_limit")

                duty = dpg.get_value("input_duty")
                button = dpg.get_value("input_button")

                pos = dpg.get_value("input_position")
                offset = dpg.get_value("input_offset")

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

                dpg.set_item_label("btn_start_stop", "STOP CLICKING")

            except Exception as e:
                print(f"Error starting clicker: {e}")
                is_clicking = False

        else:
            # --- STOP ---
            AClicker.stop_clicker()
            dpg.set_item_label("btn_start_stop", "START CLICKING")


    def set_position_current(sender, app_data, user_data):
        _ = sender
        _ = app_data
        _ = user_data
        temp_root = tk.Tk()
        pos_x = temp_root.winfo_pointerx()
        pos_y = temp_root.winfo_pointery()
        temp_root.destroy()

        dpg.set_value("input_position", (int(pos_x), int(pos_y)))
        print(f"Position set to: {pos_x}, {pos_y}")


    dpg.create_context()

    with dpg.font_registry():
        font_bold = dpg.add_font("Resources/Fonts/Nunito/Nunito-SemiBold.ttf", 20)
        # second_font = dpg.add_font("NotoSerifCJKjp-Medium.otf", 10)
    dpg.bind_font(font_bold)

    root = tk.Tk()
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    root.destroy()

    viewport_width = 900
    viewport_height = 600

    x = (screen_width - viewport_width) // 2
    y = (screen_height - viewport_height) // 2

    # noinspection PyNoneFunctionAssignment
    vp = dpg.create_viewport(title='Blur Utility', width=viewport_width, height=viewport_height,
                             large_icon="Resources/Icon.ico")
    # noinspection PyTypeChecker
    dpg.configure_viewport(vp, x_pos=x, y_pos=y)

### FUNCTIONS / DEFINITIONS ###

    def log(message, color="\033[90m"):  # 90m = gray
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"{color}[{ts}]\033[0m {message}")

    # Callback – sender is the group tag, value is the selected string
    def toggle_afk_radio(sender):
        selected = dpg.get_value(sender)

        if selected == "Anti-AFK On":
            Anti_AFK.start_afk()
        else:
            Anti_AFK.stop_afk()


    SETTING_MAP = {
        "input_min_hold": (lambda v: setattr(Anti_AFK, "Min_Hold", v), 3),
        "input_max_hold": (lambda v: setattr(Anti_AFK, "Max_Hold", v), 3),
        "input_min_wait": (lambda v: setattr(Anti_AFK, "Min_Wait", v), 2),
        "input_max_wait": (lambda v: setattr(Anti_AFK, "Max_Wait", v), 2),
        # "input_something": (lambda v: setattr(Anti_AFK, "Something", v), 2),
    }


    def update_afk_setting(sender):
        value = dpg.get_value(sender)

        if handler := SETTING_MAP.get(sender):
            rounded = round(value, handler[1])
            handler[0](rounded)

            # ───── Hold time ─────
            if Anti_AFK.Min_Hold < 0:
                Anti_AFK.Min_Hold = 0
                dpg.set_value("input_min_hold", 0.0)

            if Anti_AFK.Max_Hold < 0:
                Anti_AFK.Max_Hold = 0.01
                dpg.set_value("input_max_hold", 0.01)

            if Anti_AFK.Min_Hold > Anti_AFK.Max_Hold:
                Anti_AFK.Min_Hold = Anti_AFK.Max_Hold - 0.01
                dpg.set_value("input_min_hold", Anti_AFK.Min_Hold)

            if Anti_AFK.Max_Hold < Anti_AFK.Min_Hold:
                Anti_AFK.Max_Hold = Anti_AFK.Min_Hold + 0.01
                dpg.set_value("input_min_hold", Anti_AFK.Max_Hold)


            # ───── Wait time ─────
            if Anti_AFK.Min_Wait < 0:
                Anti_AFK.Min_Wait = 0
                dpg.set_value("input_min_wait", 0.0)

            if Anti_AFK.Max_Wait < 0:
                Anti_AFK.Max_Wait = 0.01
                dpg.set_value("input_max_wait", 0.01)

            if Anti_AFK.Min_Wait > Anti_AFK.Max_Wait:
                Anti_AFK.Min_Wait = Anti_AFK.Max_Wait - 0.01
                dpg.set_value("input_min_wait", Anti_AFK.Min_Wait)

            if Anti_AFK.Max_Wait < Anti_AFK.Min_Wait:
                Anti_AFK.Max_Wait = Anti_AFK.Min_Wait + 0.01
                dpg.set_value("input_max_wait", Anti_AFK.Max_Wait)

            # ───── Log ─────
            log(f"Settings updated → "
                f"MinHold: {Anti_AFK.Min_Hold:.3f}, MaxHold: {Anti_AFK.Max_Hold:.3f}, "
                f"MinWait: {Anti_AFK.Min_Wait:.2f}, MaxWait: {Anti_AFK.Max_Wait:.2f}")


    def labeled_float_input(label, tag, default, step, digits, parent):
        dpg.add_input_float(
            label=label,
            tag=tag,
            default_value=default,
            step=step, format=f"%.{digits}f",
            width=150,
            callback=update_afk_setting,
            parent=parent,
        )


    def toggle_section(sender):
        is_checked = dpg.get_value(sender)

        if sender == "chk_show_clicker":
            dpg.configure_item("collapse_clicker", show=is_checked)
        elif sender == "chk_show_mouse":
            dpg.configure_item("collapse_mouse", show=is_checked)
        elif sender == "chk_show_drag":
            dpg.configure_item("collapse_drag", show=is_checked)

    def toggle_main_window(_, __, user_data):
        all_windows = ["GameTools_Window", "Hotkeys_Window", "SideBarUtilities_Window", "ProgramOpener_Window"]
        for window in all_windows:
            dpg.configure_item(window, show=False)

        dpg.configure_item(user_data, show=True)

    """
    dark_theme = dpg_ext.create_theme_imgui_dark()
    dpg.bind_theme(dark_theme)
    """

### --------- UI --------- ###
    with dpg.window(tag="Main_Window", no_title_bar=True, no_resize=True):
        with dpg.group(tag="Main_Window_Group", horizontal=True):

            with dpg.child_window(tag="SideBarWindow", label="SideBar", width=140, show=True, parent="Main_Window_Group"):
                dpg.add_text("Blur Utility V1.0.1", tag="Blur Utility Tag")
                dpg.add_button(label="Game Tools", tag="sidebar_GameTools", callback=toggle_main_window, user_data="GameTools_Window")
                dpg.add_button(label="Hotkey's'", tag="sidebar_Hotkeys", callback=toggle_main_window, user_data="Hotkeys_Window")
                dpg.add_button(label="Utilities", tag="sidebar_Utilities", callback=toggle_main_window, user_data="SideBarUtilities_Window")
                dpg.add_button(label="Program Opener", tag="sidebar_ProgramOpener", callback=toggle_main_window, user_data="ProgramOpener_Window")

            with dpg.group(tag="Content_Window_Group"):
                with dpg.child_window(tag="GameTools_Window", show=True):

                    # Tab Bar and Tabs
                    tab_bar = dpg.add_tab_bar(tag="main_tab_bar")

                    Tab1 = dpg.add_tab(label="Auto-Clicker", tag="tab_AC", parent=tab_bar)
                    Tab2 = dpg.add_tab(label="Anti-AFK movement", tag="tab_AntiAFK",parent=tab_bar)

                    # Content for Tab 1 (Auto Clicker)
                    dpg.add_text("Auto Clicker with randomization features", tag="AutoClickerText", parent = Tab1, wrap=0)

                    # --- MAIN CONTROL ---
                    # The big Start/Stop Button
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_button(label="START CLICKING", tag="btn_start_stop", callback=toggle_clicker_start_stop, width=200, height=40)

                        # --- KEYBIND SECTION ---
                        with dpg.group(horizontal=True, parent=Tab1):
                            dpg.add_button(label="SET KEYBIND", tag="SET KEYBIND", callback=start_recording_keybind, width=200)
                            dpg.add_spacer(width=10)
                            dpg.add_text("Hotkey Mode:")
                            dpg.add_combo(label="", tag="keybind_mode_combo", items=["Toggle", "Hold"], default_value="Toggle", callback=set_keybind_mode, width=100)

                    dpg.add_spacer(height=10, parent=Tab1)

                    # --- CLICK SPEED ---
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_text("Mouse Button:")
                        dpg.add_combo(label="", tag="input_button", items=["Left Click", "Right Click", "Middle Click"], default_value="Left Click", width=130)

                    dpg.add_spacer(height=12, parent=Tab1)

                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_text("Click Speed Per:")

                        dpg.add_combo(tag="input_click_unit", items=["second", "minute", "hour", "day"], default_value="second", width=100)

                        labeled_float_input(label="Clicks", tag="input_click_amount", step=0, digits=2, default=10, parent=Tab1)
                        dpg.add_spacer(height=12, parent=Tab1)


                    # --- PRECISION SETTINGS ---
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_text("Variation in %:")
                        dpg.add_input_float(tag="input_variation", default_value=0, width=130, step=0, step_fast=0, min_value=0.0)

                        dpg.add_spacer(width=5)

                        dpg.add_text("Duty Cycle in %:")
                        dpg.add_input_float(label="", tag="input_duty", default_value=50, width=130, step=0, step_fast=0, min_value=0.0)

                    dpg.add_spacer(height=12, parent=Tab1)


                    # --- LIMITS ---
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_text("Click Limit:")
                        dpg.add_input_int(label="Clicks", tag="input_limit", default_value=0, width=130, step=0, step_fast=0, min_value=0)

                        dpg.add_spacer(width=5)

                        dpg.add_text("Time Limit:")
                        dpg.add_input_float(label="Seconds", tag="input_time_limit", default_value=0, width=130, step=0, step_fast=0, min_value=0.0, on_enter=True)

                    dpg.add_spacer(height=12, parent=Tab1)

                    # --- MOUSE BEHAVIOR ---

                    # Button Type

                    with dpg.group(horizontal=True, parent=Tab1):
                        # Position Picker
                        dpg.add_text("Screen(x,y):")
                        dpg.add_input_intx(label="", tag="input_position", size=2, default_value=[0, 0], width=120, min_value=0)
                        dpg.add_button(label="Pick Current", callback=set_position_current)

                    dpg.add_spacer(height=12, parent=Tab1)

                    # Position Offset (The jitter)
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_text("Offset (px):")
                        dpg.add_input_float(label="", tag="input_offset", default_value=0, width=130, step=1, min_value=0.0)

                    dpg.add_spacer(height=12, parent=Tab1)

                    # --- UTILS ---
                    with dpg.group(horizontal=True, parent=Tab1):
                        dpg.add_button(label="Reset To Defaults", callback=reset_defaults)


                    # Content for Tab 2 (Anti-AFK)
                    dpg.add_text(
                        "Anti-AFK script that presses w,a,s,d buttons randomly within the given parameters.", parent=Tab2, wrap=0)
                    dpg.add_text("In all honesty an auto clicker works way better than this, but here you go."
                                 "If you still get kicked for being afk in a game, try the auto clicker.",
                                 parent=Tab2, wrap=0)

                    dpg.add_radio_button(
                        ["Anti-AFK Off", "Anti-AFK On"],  # Radio Buttons
                        tag="afk_radio_group",
                        default_value="Anti-AFK Off",
                        callback=toggle_afk_radio,
                        horizontal=True,
                        parent=Tab2
                    )

                    dpg.add_text("AFK Script OPTIONS:", parent=Tab2, wrap=0)

                    labeled_float_input("Min Hold Down Time(Seconds)", "input_min_hold", Anti_AFK.Min_Hold, 0.01, 2, Tab2)
                    labeled_float_input("Max Hold Down Time(Seconds)", "input_max_hold", Anti_AFK.Max_Hold, 0.01, 2, Tab2)
                    labeled_float_input("Min Wait Between Keystrokes(Seconds)", "input_min_wait", Anti_AFK.Min_Wait, 0.01, 2, Tab2)
                    labeled_float_input("Max Wait Between Keystrokes(Seconds)", "input_max_wait", Anti_AFK.Max_Wait, 0.01, 2, Tab2)


                with dpg.child_window(tag="Hotkeys_Window", show=False):
                    dpg.add_text("something")


                with dpg.child_window(tag="SideBarUtilities_Window", show=False):
                    dpg.add_text("something else")


                with dpg.child_window(tag="ProgramOpener_Window", show=False):
                    dpg.add_text("something else entirely")

    enable_keybind_hook()
    register_hotkey()

    dpg.set_primary_window("Main_Window", True)
    dpg.setup_dearpygui()
    dpg.show_viewport()
    dpg.start_dearpygui()
    dpg.destroy_context()