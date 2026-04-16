# v3.4.0 - 15.05.2026 (d.m.y)
## ❇️ New:
- Added Light Mode with Light / Dark toggle in the settings
- Added support for Mouse Buttons and Numpads
## 🔹 Changed:
- Hotkey recognition should now be more reliable.
- Adjusted fonts and colors for light mode
- Edge / Corner stop now supports multiple monitors
- Added vertical bars to Simple mode Hold and Randomization fields for consistency.
## 🔺 Fix:
- Fixed Time Limit hover card being split in 2

# v3.3.0 - 14.04.2026 (d.m.y)
## ❇️ New:
- added Github link icon
- added Scroll bar for settings page
## 🔹 Changed:
- Simple Mode UI
- Icons for top bar instead of text buttons
- Resize animation for horizontal resizing
- Randomization and Duty cycle are now in simple mode. 
## 🔺 Fix:
- Fixed double click on top bar maximizing the window.
- Speed Variation not graying out when off
- Speed Variation should act more like intended
## 🪦 Removed:
- Removed Telemetry. Your local data will also be reset but it is what it is
- Duty Cycle On/Off button
- Local verification for stats (if you want to make your own fake stats, go ahead ig)

# v3.2.0 - 11.04.2026 (d.m.y)
## ❇️ New Features:
- Added an Overlay for the edge / corner stop features. This was a major pain and i am not done with it yet. the current implementation is more of a test.
## 🔹 Changed:
- Replaced GetProcessTimes with QueryThreadCycleTime for CPU usage measurement. This gives a more accurate representation of the CPU time used by the clicker. All runs should now output accurate CPU usage, even if the clicker only ran for a single millisecond. The trade-off is that CPU usage is now measured for only the clicker thread instead of the entire app, though the clicker thread is the main source of CPU usage anyway.
- Polling for update every hour instead of on app launch.
## 🔺 Fix:
- Added timeout for writing settings, this prevents settings race condition. (Usually a non-issue, but it's best practice)
## 🔸 Performance Updates:
- Changed sending telemetry from its own tokio runtime to using the tauri async runtime.
## 🪦 Removed:
- Removed unused stop_clicker() function (stopping is handled via the running atomic flag)


# v3.1.0 - 07.04.2026 (d.m.y)
## ❇️ New Features:
- Added AUTO UPDATES (this is a big one, I know :3)
- Added social links in the settings page
- Added clicker stop reasoning in advanced mode (title turns into whatever reason stopped the clicker)
## 🔹 Changed:
- Replaced printl with logging module (not really relevant for uesers)
  
# v3.0.0 - 04.04.2026 (d.m.y)
## ❇️ New Features:
1. Mode pages (Simple, Advanced, Macro) to make the UI less cluttered and more user friendly.
2. Added dedicated Settings page to make it easier to find and change settings.
3. Added explanations for each setting in the Advanced mode to make it easier for new users to understand what each setting does.
4. Encryption key for stats so it can not be modified by the user (this stops people from cheating the stats by modifying the local data.)
5. Added Edge Stop to disable the clicker near screen edges.
6. Added Corner Stop to disable the clicker near screen corners. that could've been combined with the Edge stop point but this way there is a higher number in the changelog which means im better at coding.
7. Added a "Clear" button to the stats page to clear local data.
8. Telemetry now only sends data collected while enabled (turns out sending old data isn’t exactly legal :/)
9. On / Off buttons for most advanced settings have been added.
10. Added double click feature. Limited to a max of 50cps to prevent.. stuff not working
## 🔹 Changed:
1. local data storage has been revamped to consolidate results every 100 lines so file size doesn't get out of hand (very minor issue, would have only taken up a few mb every month, but I wanted to do it anyway :3)
2. Preparations for Auto Updater (not implemented yet, but the backend is there for when I do implement it)
3. Entire UI has been redone and moved from python pyside6 to rust and the Tauri framework. This should make the UI easier to look at, and expand for future features.
4. Stored data does not get sent to the backend anymore if telemetry is not enabled, but it is still stored locally and can be viewed in the stats page.
5. I won't list every single UI change, but everything is different (and hopefully better)
6. Version number has been moved to the settings page only.
7. No more dropdowns which should make it a bit easier to see all the options at a glance.
8. Multi monitor support added! you can now click on your secondary monitor :)
9. Made a total of 5 files from the previous version into almost 40 files, but the code is hopefully easier to navigate for me now.
## 🔺 Fix:
1. Probably fixed a few things along the way (6000+ lines of NEW code will do that :3)
## 🔸 Performance Updates:
1. moving to rust entirely eliminated the Python runtime, which should slightly increase performance.
## 🪦 Removed:
1. Mouse move options for now until I work on the Macro panel.
2. your old stats (sorry :3) because of the new encryption method, but you can still see them in the old stats file if you want to cry over your lost 100billion clicks.

---

# v2.1.2 - 22.03.2026 (d.m.y)
## 🔺 Fix:
- Drop down selector for Second / Minute / Hour / Day used to always return per second, meaning sub 1cps could not be achieved.
selector has been fixed by removing ".lower()" from the code :3 (thats coding for ya)
- Minimum Duty cycle has been reduced from 1% to 0.1% to help with the mouse being held down for too long during sub 1s click times.

# v2.1.1 - 24.02.2026 (d.m.y)
## 🔺 Fix:
- CPU logging does not report 0.0% value if no samples are made (previously lowered average cpu usage artificially)
- CPU logging frequency is dynamic, making the averages more accurate at lower runtimes.

# v2.1.0 - 23.02.2026 (d.m.y)
## ❇️ New Features:
- Added Opt-in Telemetry Popup (Honestly didn't wanna do that but EU laws and stuff :3)
- measure and log cpu usage
- Changed Data collection from Google to Supabase
- Moved ENTIE backend to Rust for better peformance
- logging of clicker session time and total time, session clicks and total clicks
- click status has a greer outline while active, making it more obvious that the auto clicker has been turned on.

## 🔹 Changed:
- Keybind field automatically unfocuses so that it doesn't bug out when you instantly try to activate the autoclicker without removing focus from the field.
- Refractor of:
     - main.py
     - settings_manager.py
     - hotkey_manager.py
     - rust_translation.py
- updated file structure
- Config.ini now saves at %appdata%/blur009/autoclicker/config.ini
- split up main.py into individual files to reduce line count per file.
- ReadMe Updated

## 🔺 Fix:

## 🔸 Performance Updates:
- switching to rust massively increased performance, dropping cpu usage by ceveral percent. (down to ~1%avg during use on my system)

## 🪦 Removed:
- Switch to Go was good, but I realized after way too much debugging that syscall took 84% of my runtime performance. So, to Rust we go.. (Go was basically talking to itsself over and over to do the clicks, while Rust is doing it directly, which is why the performance increase is so big).


# v2.0.0 - 18.02.2026 (d.m.y)

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


## ❇️ New Features:

# v0.0.0 - ..202 (d.m.y)
(just an empty template for me here)
## 🔹 Changed:

## 🔺 Fix:

## 🔸 Performance Updates:

## 🪦 Removed:

