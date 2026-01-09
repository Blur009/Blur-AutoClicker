import pydirectinput as pd
import time
import threading
import random


IS_RUNNING = False
Min_Hold = 0.21
Max_Hold = 0.16
Min_Wait = 2.12
Max_Wait = 2.37


def afk_loop():
    global IS_RUNNING, Min_Hold, Max_Hold, Min_Wait, Max_Wait
    keys = ['w', 'a', 's', 'd']

    while IS_RUNNING:
        key = random.choice(keys)

        hold_time = random.uniform(Min_Hold, Max_Hold)
        wait_time = random.uniform(Min_Wait, Max_Wait)

        pd.keyDown(key)
        time.sleep(hold_time)
        pd.keyUp(key)

        stop_time = time.time() + wait_time
        while time.time() < stop_time and IS_RUNNING:
            time.sleep(0.1)


def start_afk():
    global IS_RUNNING
    if IS_RUNNING:
        return

    IS_RUNNING = True
    threading.Thread(target=afk_loop, daemon=True).start()


def stop_afk():
    global IS_RUNNING
    IS_RUNNING = False
