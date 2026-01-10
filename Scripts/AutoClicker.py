import pydirectinput as pdi
import time

"""
1. Simple left click at current mouse position
pd.click()                          # left click once

2. Click at specific coordinates (absolute screen position)
pd.click(x=500, y=300)              # click at pixel (500, 300)

3. Right click
pd.rightClick()

4. Double click
pd.doubleClick()

5. Click and hold (useful for dragging or holding)
pd.mouseDown()                      # press left button down
time.sleep(0.5)                     # hold for half a second
pd.mouseUp()                        # release

6. Move mouse first, then click (safer/more natural)
pd.moveTo(800, 600, duration=0.2)   # move smoothly over 0.2 seconds
pd.click()                          # then click there
"""