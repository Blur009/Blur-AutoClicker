import time
from Scripts import C_Clicker

print("--- Starting C Engine Test ---")

# 1. Define settings exactly like the GUI would
test_settings = {
    "click_amount": 10,     # 20 clicks per second
    "click_unit": 's',
    "click_variation": 10,    # 0 variation for pure speed test
    "click_limit": 0,      # Stop after 50 clicks
    "click_duty_cycle": 1, # 50% hold
    "click_time_limit": 5.05,
    "click_button": 'left',
    "click_position": (0, 0),    # Click current mouse position
    "click_position_offset": 5
}

# 2. Start the timer
start_time = time.time()
C_Clicker.start_clicker(test_settings)
time.sleep(3)
end_time = time.time()

print(f"--- Test Finished ---")
