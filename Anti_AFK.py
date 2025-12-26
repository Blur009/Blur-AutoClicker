import pydirectinput as pd
import time
import threading
import random
import logging

is_running = False


def afk_loop():
    global is_running
    keys = ['w', 'a', 's', 'd']

    while is_running:
        # Pick a random key from the list
        key = random.choice(keys)

        # Pick a random duration to hold the key (e.g., between 0.5 and 1.8 seconds)
        hold_time = random.uniform(0.121, 0.866)

        # Pick a random wait time before the next move (e.g., between 10 and 45 seconds)
        wait_time = random.uniform(22.323, 62.178)

        logging.info(
            f"Pressed '{key}' for {hold_time:.2f}s. Next move in {wait_time:.2f}s.")

        # Execute the move
        pd.keyDown(key)
        time.sleep(hold_time)
        pd.keyUp(key)

        # Wait the random interval
        # We check 'is_running' frequently so we can stop instantly
        stop_time = time.time() + wait_time
        while time.time() < stop_time and is_running:
            time.sleep(0.1)


def start_afk():
    time.sleep(5)
    global is_running
    if not is_running:
        is_running = True
        threading.Thread(target=afk_loop, daemon=True).start()
    time.sleep(1)


def stop_afk():
    global is_running
    is_running = False
    logging.info('## Stopped AFK Script ##')
