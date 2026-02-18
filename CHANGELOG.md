# v2.0.0 - 18.02.2026 (d/m/y)
## ❇️ New Features:
- Added On / Off hint next to the shortcut field.
- Added smoothing to the mouse movement to combat the "teleporting" of the cursor.
- Added an Offset Chance button that makes the Click Offset only happen sometimes.
- Added Anonymous Telemetry to find the most common settings people use/don't use
- Added Info about Telemetry and support options in Program Settings
- Added an Advanced Options button that makes the gui simpler for ppl who need a simple auto clicker :3

## 🔹 Changed:
- Changed the UI to be less complex and more user-friendly (I hope).
- Changed UI to adjust to the window size when enabling/disabling Advanced options (took 4ever)
- Increased Click Speed cap to different values depending on the selected time frame (second, minute, hour, day). It is not recommended to use speeds over 500 even though it is technically possible.
- Renamed Scripts folder to src
- Split some UI and Settings features into settings_manager.py to clean up main.py
- very sneaky shark emoji hidden somewhere in the code. You get a cookie if you find it.

## 🔺 Fix:
- Fixed the Offset to apply in the radius of a circle instead of a square around the set position  
(not really a "bug" but this is the way I wanted it to work when I thought of the feature).

## 🔸 Performance Updates:
- Introduced click batching at higher cps to send multiple clicks every call. This allows for more clicks than before because windows pointer resolution was limiting the amount of calls that the clicker was able to make.
- Variables are initialized outside the isRunning loop
- more that I probably forgot because I've been sitting here for 10h making this work :3

## 🪦 Removed:
