import ctypes
import os
import threading

DEBUG_MODE = False
def debug_log(message):
    if DEBUG_MODE:
        print(message)

try:
    # 1. Find dll
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    dll_path = os.path.join(project_root, "clicker_engine.dll")

    clicker_lib = ctypes.WinDLL(dll_path)

    # 2. CONFIGURE TYPES
    clicker_lib.start_clicker.argtypes = [
        ctypes.c_double,  # interval
        ctypes.c_double,  # variation
        ctypes.c_int,  # limit
        ctypes.c_double,  # duty
        ctypes.c_double,  # time limit
        ctypes.c_int,  # button (1=Left, 2=Right, 3=Middle)
        ctypes.c_int,  # pos x
        ctypes.c_int,  # pos y
        ctypes.c_double  # offset
    ]
    clicker_lib.start_clicker.restype = None

    clicker_lib.stop_clicker.argtypes = []
    clicker_lib.stop_clicker.restype = None

    debug_log("[C_Clicker] Engine loaded successfully.")

except Exception as e:
    debug_log(f"[C_Clicker] CRITICAL ERROR: {e}")


    # Create a dummy class to prevent script crash if DLL is missing
    class DummyLib:
        def start_clicker(self, *args): pass
        def stop_clicker(self): pass


    clicker_lib = DummyLib()

def start_clicker(settings_dict, callback=None):

    # 1. Convert 'clicks per unit' to 'interval seconds'
    raw_amount = settings_dict.get('click_amount', 1)
    raw_unit = settings_dict.get('click_unit', 's')

    amount = float(raw_amount)
    if amount <= 0: amount = 1

    unit = raw_unit.lower()
    if unit == 'second': real_interval = 1 / amount
    elif unit == 'minute': real_interval = 60 / amount
    elif unit == 'hour': real_interval = 3600 / amount
    elif unit == 'day': real_interval = 86400 / amount
    else: real_interval = 1 / amount

    # 2. Map Button String to Int
    btn_str = settings_dict.get('click_button', 'left')
    if btn_str == 'Left Click': btn_int = 1
    elif btn_str == 'Right Click': btn_int = 2
    elif btn_str == 'Middle Click': btn_int = 3
    else: btn_int = 1

    # 3. Prepare Thread arguments
    def run_thread():
        try: clicker_lib.start_clicker(
            real_interval,
            settings_dict.get('click_variation', 0),
            settings_dict.get('click_limit', 0),
            settings_dict.get('click_duty_cycle', 50),
            settings_dict.get('click_time_limit', 0),
            btn_int,
            int(settings_dict.get('click_position', (0, 0))[0]),
            int(settings_dict.get('click_position', (0, 0))[1]),
            settings_dict.get('click_position_offset', 0)
        )
        finally:
            if callback:
                callback()

    # 4. Start Thread
    t = threading.Thread(target=run_thread)
    t.start()

def stop_clicker():
    clicker_lib.stop_clicker()
