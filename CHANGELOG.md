# v2.1.0 - 22.02.2026 (d/m/y)
## ❇️ New Features:

## 🔹 Changed:
- updated file structure
- Config.ini now saves at %appdata%/blur009/autoclicker/config.ini
- split up main.py into individual files to reduce line count per file.

## 🔺 Fix:

## 🔸 Performance Updates:

## 🪦 Removed:
- Switch to Go was good, but I realized after way too much debugging that "runtime.cgocallback" took 84% of my runtime performance. So, back to C we go..

## TODO:
- button for going to config folder
- statistics (cpu, ram amount, cpu usage, ram usage, average cpu usage, clicker run time session/total, session clicks)
- put statistics in telemetry
- measure and log cpu time
- Clicks centered around actual cursor position (free cursor click offset, smoothing support).


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


# v2.0.0 - 18.02.2026 (d/m/y) (just an empty template for me here)
## ❇️ New Features:

## 🔹 Changed:

## 🔺 Fix:

## 🔸 Performance Updates:

## 🪦 Removed:

