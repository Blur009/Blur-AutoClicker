import dearpygui.dearpygui as dpg
import tkinter as tk
from datetime import datetime

from dearpygui.dearpygui import add_separator

from Scripts import Anti_AFK as Anti_AFK
from Scripts import AutoClicker as AClicker

if __name__ == '__main__':

    dpg.create_context()

    root = tk.Tk()
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    root.destroy()

    viewport_width = 900  # ← your desired width
    viewport_height = 600  # ← your desired height

    x = (screen_width - viewport_width) // 2
    y = (screen_height - viewport_height) // 2

    # noinspection PyNoneFunctionAssignment
    vp = dpg.create_viewport(title='Blur Utility ver.0.1', width=viewport_width, height=viewport_height, large_icon="Resources/Icon.ico")
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
        dpg.add_spacer(height=4)


    def toggle_section(sender):
        is_checked = dpg.get_value(sender)

        if sender == "chk_show_clicker":
            dpg.configure_item("collapse_clicker", show=is_checked)
        elif sender == "chk_show_mouse":
            dpg.configure_item("collapse_mouse", show=is_checked)
        elif sender == "chk_show_drag":
            dpg.configure_item("collapse_drag", show=is_checked)

### --------- UI --------- ###
    with dpg.window(tag="main_window", label="My App", no_title_bar=True, no_resize=True):
        # Tab Bar and Tabs
        tab_bar = dpg.add_tab_bar(tag="main_tab_bar")

        Tab2 = dpg.add_tab(label="Auto-Clicker", tag="tab_AC", parent=tab_bar)
        Tab1 = dpg.add_tab(label="Anti-AFK movement", tag="tab_AntiAFK",parent=tab_bar)

        # Content for Tab 1 (Anti-AFK)
        dpg.add_text("Anti-AFK script that presses w,a,s,d buttons randomly within the given parameters.", parent = Tab1, wrap=0)
        dpg.add_text("In all honesty an auto clicker works way better than this, but here you go. If you still get kicked for being afk in a game, try the auto clicker.", parent=Tab1, wrap=0)

        dpg.add_radio_button(
            ["Anti-AFK Off", "Anti-AFK On"],  # Radio Buttons
            tag="afk_radio_group",
            default_value="Anti-AFK Off",
            callback=toggle_afk_radio,
            horizontal=True,
            parent=Tab1
        )

        dpg.add_text("AFK Script OPTIONS:",
                     parent=Tab1,
                     wrap=0)

        labeled_float_input("Min Hold Down Time(Seconds)", "input_min_hold", Anti_AFK.Min_Hold, 0.01, 2, Tab1)
        labeled_float_input("Max Hold Down Time(Seconds)", "input_max_hold", Anti_AFK.Max_Hold, 0.01, 2, Tab1)
        labeled_float_input("Min Wait Between Keystrokes(Seconds)", "input_min_wait", Anti_AFK.Min_Wait, 0.01, 2, Tab1)
        labeled_float_input("Max Wait Between Keystrokes(Seconds)", "input_max_wait", Anti_AFK.Max_Wait,   0.01, 2, Tab1)


        # Content for Tab 2 (Auto Clicker)
        dpg.add_text("Auto Clicker with randomization features", tag="AutoClickerText", parent = Tab2, wrap=0)

        with dpg.group(tag="CheckBoxGroup1", horizontal=True, parent=Tab2):
            dpg.add_checkbox(label="Auto Clicker", tag="chk_show_clicker", default_value=True, callback=toggle_section)
            dpg.add_checkbox(label="Mouse Move", tag="chk_show_mouse", default_value=False, callback=toggle_section)


        dpg.add_spacer(height=40, parent="CheckBoxGroup1")

        with dpg.collapsing_header(label="Auto Clicker", default_open=True, parent=Tab2, tag="collapse_clicker", show=True):

            dpg.add_button(label="Keybind")
            dpg.add_button(label="Clicks / Second")
            dpg.add_button(label="reset to defaults")
            dpg.add_button(label="Click Variation toggle (average to cps)")
            dpg.add_button(label="select app (that the auto clicker works in, disables when tabbing, enables when going back")
            dpg.add_button(label="Click duration %")
            dpg.add_button(label="clicks limit")
            dpg.add_button(label="Time Limit")
            dpg.add_button(label="Click position (current / pick)")
            dpg.add_button(label="left / right / middle")
            dpg.add_button(label="hold / toggle")
            dpg.add_button(label="Click duration %")

            add_separator(parent="collapse_clicker")

        dpg.add_spacer(height=20, parent="collapse_clicker")

        with dpg.collapsing_header(label="Mouse Over", default_open=True, parent=Tab2, tag="collapse_mouse", show=False):
            dpg.add_button(label="Basically just jiggles")
            dpg.add_button(label="jiggle vertical")
            dpg.add_button(label="jiggle horizontal")
            dpg.add_button(label="speed")
            dpg.add_button(label="time between jiggles")


            add_separator(parent="collapse_mouse")




    dpg.set_primary_window("main_window", True)
    dpg.setup_dearpygui()
    dpg.show_viewport()
    dpg.start_dearpygui()
    dpg.destroy_context()