import tkinter as tk
import os
import keyboard as kb
import logging
from datetime import datetime


import Anti_AFK as a_afk

root = tk.Tk()
root.title("Blur.Tools")
root.attributes("-topmost", True)
window_width = 600
window_height = 300
root.geometry(f'{window_width}x{window_height}+{550}+{330}')


def toggle_window():
    # 'withdrawn' means the window is currently hidden
    if root.state() == 'withdrawn':
        root.deiconify()
        root.attributes("-topmost", True)
        root.focus_force()  # Optional: steals focus so you can use it immediately
    else:
        root.withdraw()


kb.add_hotkey('ctrl+f10', toggle_window)


# -----APP-----


# AFK BUTTON AND FUNCTION


def toggle_afk():
    if a_afk.is_running:
        a_afk.stop_afk()
        # Update the button text and color to show it stopped
        btn_afk.config(text="AFK: Stopped",
                       bg="SystemButtonFace",
                       fg="black")
    else:
        a_afk.start_afk()
        # Update the button text and color to show it's running
        btn_afk.config(text="AFK: RUNNING",
                       bg="green",
                       fg="white")


kb.add_hotkey('esc', a_afk.stop_afk)

btn_afk = tk.Button(
    root,
    text="AFK: Stopped",  # Starting state
    command=toggle_afk,
    width=20,
    height=2
)
btn_afk.pack(pady=20)

# DEBUG TERMINAL WINDOW


class TkinterHandler(logging.Handler):
    def __init__(self, text_widget):
        logging.Handler.__init__(self)
        self.text_widget = text_widget

    def emit(self, record):
        msg = self.format(record)

        def append():
            self.text_widget.config(state='normal')
            self.text_widget.insert(tk.END, msg + "\n")
            self.text_widget.see(tk.END)
            self.text_widget.config(state='disabled')
        # This ensures the GUI doesn't crash if logs come from other threads
        self.text_widget.after(0, append)


debug_box = tk.Text(root, height=10, width=75, bg="white",
                    fg="black", font=("Consolas", 9,), borderwidth=1)
debug_box.pack(pady=10)
debug_box.config(state='disabled')  # Prevent user typing

logger = logging.getLogger()
logger.setLevel(logging.INFO)
handler = TkinterHandler(debug_box)
formatter = logging.Formatter('[%(asctime)s] %(message)s', '%H:%M:%S')
handler.setFormatter(formatter)
logger.addHandler(handler)

root.mainloop()
