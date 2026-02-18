# vx.x.x - 01.02.2026 (d/m/y)
## ❇️ New Features:
- Added On / Off hint next to the shortcut field.
- Added Smoothing to the mouse movement to combat the "teleporting" of the cursor.
- Added An Offset Chance button that makes the Click Offest only happen sometimes.
- Added Anonymous Telemetry to find the most common settings people use / don't use
- Added Info about Telemetry and support options in Program Settings
- Added An Advanced Options button that makes the gui simpler for ppl who need a simple auto clicker :3

## 🔹 Changed:
- Changed The UI to be less complex and more user friendly (I hope).
- Changed UI to adjust to the window size when enabling / disabling Advanced options (took 4ever)
- Increased Click Speed cap to different values depening on selected time fram (second, minute, hour, day). It is not recommended to use speeds over 500 even though it is technically possible.
- Renamed Scripts folder to src
- Split some UI and Settings features into settings_manager.py to clean up main.py
- very sneaky shark emoji hidden somwhere in the code. You get a cookie if you find it.

## 🔺 Fix:
- Fixed the Offset to apply in the radius of a circle instead of a square around the set position  
(not really a "bug" but this is the way I wanted it to work when I thought of the feature).

## 🔸 Performance Updates:
- Introduced click batching at higher cps to send multiple clicks every call. This allows for more clicks than before because windows pointer resolution was limiting the amount of calls that the clicker was able to make.
- variables are initialized outside the isRunning loop
- more that i probably forgot because ive been sitting here for 10h making this work :3

## 🪦 Removed: