# v3.5.0 - 29.04.2026 (d.m.y)
## New
- Added named presets for saving and reusing clicker configurations
- Added persistent Always on Top preference
- Added accent color customization
- Info icons instead of always visible explanations for settings to reduce clutter
- Sequence clicking with configurable clicks per target
- Custom Stop Zones with visual overlay and device pixel ratio scaling
- Delay/Rate toggle for clicks per time and time per click modes
- Added a new tab for Safety settings (Edge/Corner Stop, Stop Zones, etc.)
- System tray icon with menu (Show/Quit options)
- Windows autostart registry support

## Changed
- Colors slightly adjusted for better visibility and consistency
- Simple panel look to be consistent with the rest of the UI with drop-downs instead of buttons
- UI layout made more compact overall
- On/Off buttons redesigned for better visibility at a glance
- Settings Panel reorganized into sections
- Centralized frontend settings bounds, options, and preset helpers
- Cleaned up runtime stats logging output and fixed changelog encoding
- Split Advanced page into better organized files
- Improved hotkey parsing with better modifier and key token normalization
- Replaced `tauri-plugin-shell` with `tauri-plugin-opener` for better URL/file handling
- Enhanced sequence engine with per-point click counting and rotation
- Refactored interval calculation to support duration mode
- CI workflow improved with format checks, concurrency controls, and timeouts
- Build optimizations added (strip + thin LTO)

## Removed
- Position picking (use Sequence clicking instead)
- Low-level keyboard/mouse hooks for hotkey detection (simplified approach)
- `tauri-plugin-shell` dependency

## Fix
- Fixed mouse button staying down after stopping the clicker
- Fixed safe zone scaling with Windows display scaling
- Custom stop zone failsafe now takes priority over other failsafes
- Custom stop zone overlay now scales correctly with device pixel ratio

---

# v3.4.1 - 16.04.2026 (d.m.y)
## New
- Added a settings toggle for relaxed/strict keybind mode

## Changed
- PX values now support scaling correctly (thank you rorky47)
- Changed size and style of ko-fi donation button
- Made CSS more consistent (thank you lulkebit)
- Added CI checks (thank you Rorky47)
- Added Windows signing support (thank you David-T-Campos)

## Fix
- Windows Text Scaling should now work properly (thank you Rorky47 & David-T-Campos for the help)

# v3.4.0 - 15.04.2026 (d.m.y)
## New
- Added Light Mode with Light/Dark toggle in the settings
- Added support for Mouse Buttons and Numpads

## Changed
- Hotkey recognition should now be more reliable
- Adjusted fonts and colors for light mode
- Edge/Corner stop now supports multiple monitors
- Added vertical bars to Simple mode Hold and Randomization fields for consistency

## Fix
- Fixed Time Limit hover card being split in 2

# v3.3.0 - 14.04.2026 (d.m.y)
## New
- Added GitHub link icon
- Added scroll bar for settings page

## Changed
- Simple Mode UI
- Icons for top bar instead of text buttons
- Resize animation for horizontal resizing
- Randomization and Duty cycle are now in simple mode

## Fix
- Fixed double click on top bar maximizing the window
- Speed Variation not graying out when off
- Speed Variation should act more like intended

## Removed
- Removed Telemetry. Your local data will also be reset but it is what it is
- Duty Cycle On/Off button
- Local verification for stats

# v3.2.0 - 11.04.2026 (d.m.y)
## New Features
- Added an overlay for the edge/corner stop features

## Changed
- Replaced GetProcessTimes with QueryThreadCycleTime for CPU usage measurement
- Polling for update every hour instead of on app launch

## Fix
- Added timeout for writing settings to prevent a settings race condition

## Performance Updates
- Changed sending telemetry from its own tokio runtime to using the Tauri async runtime

## Removed
- Removed unused `stop_clicker()` function

# v3.1.0 - 07.04.2026 (d.m.y)
## New Features
- Added auto updates
- Added social links in the settings page
- Added clicker stop reasoning in advanced mode

## Changed
- Replaced `println!` with the logging module

# v3.0.0 - 04.04.2026 (d.m.y)
## New Features
1. Mode pages (Simple, Advanced, Macro) to make the UI less cluttered and more user friendly
2. Added dedicated Settings page to make it easier to find and change settings
3. Added explanations for each setting in the Advanced mode to make it easier for new users to understand what each setting does
4. Encryption key for stats so it cannot be modified by the user
5. Added Edge Stop to disable the clicker near screen edges
6. Added Corner Stop to disable the clicker near screen corners
7. Added a "Clear" button to the stats page to clear local data
8. Telemetry now only sends data collected while enabled
9. On/Off buttons for most advanced settings have been added
10. Added double click feature. Limited to a max of 50 CPS

## Changed
1. Local data storage has been revamped to consolidate results every 100 lines so file size does not get out of hand
2. Preparations for Auto Updater
3. Entire UI has been redone and moved from Python/PySide6 to Rust and Tauri
4. Stored data does not get sent to the backend anymore if telemetry is not enabled, but it is still stored locally and can be viewed in the stats page
5. Everything in the UI has changed
6. Version number has been moved to the settings page only
7. No more dropdowns which should make it easier to see all the options at a glance
8. Multi-monitor support added
9. The codebase was split into many more files to make it easier to navigate

## Fix
1. Probably fixed a few things along the way

## Performance Updates
1. Moving to Rust entirely eliminated the Python runtime, which should slightly increase performance

## Removed
1. Mouse move options for now until the Macro panel is ready
2. Old stats because of the new encryption method

---

# v2.1.2 - 22.03.2026 (d.m.y)
## Fix
- Drop-down selector for Second/Minute/Hour/Day used to always return per second, meaning sub-1 CPS could not be achieved
- Minimum Duty cycle has been reduced from 1% to 0.1% to help with the mouse being held down for too long during sub-1s click times

# v2.1.1 - 24.02.2026 (d.m.y)
## Fix
- CPU logging does not report 0.0% if no samples are made
- CPU logging frequency is dynamic, making the averages more accurate at lower runtimes

# v2.1.0 - 23.02.2026 (d.m.y)
## New Features
- Added opt-in telemetry popup
- Measure and log CPU usage
- Changed data collection from Google to Supabase
- Moved the entire backend to Rust for better performance
- Added logging of clicker session time and total time, session clicks, and total clicks
- Click status has a greener outline while active

## Changed
- Keybind field automatically unfocuses so that it does not bug out when you instantly try to activate the autoclicker without removing focus from the field
- Refactor of:
  - `main.py`
  - `settings_manager.py`
  - `hotkey_manager.py`
  - `rust_translation.py`
- Updated file structure
- `Config.ini` now saves at `%appdata%/blur009/autoclicker/config.ini`
- Split up `main.py` into individual files to reduce line count per file
- README updated

## Performance Updates
- Switching to Rust massively increased performance, dropping CPU usage by several percent

## Removed
- Switched away from Go after debugging showed syscall overhead was too expensive

# v2.0.0 - 18.02.2026 (d.m.y)
## New Features
- Added On/Off hint next to the shortcut field
- Added smoothing to the mouse movement to combat the "teleporting" of the cursor
- Added an Offset Chance button that makes the Click Offset only happen sometimes
- Added anonymous telemetry to find the most common settings people use or do not use
- Added info about telemetry and support options in Program Settings
- Added an Advanced Options button that makes the GUI simpler for people who need a simple auto clicker

## Changed
- Changed the UI to be less complex and more user-friendly
- Changed UI to adjust to the window size when enabling and disabling Advanced options
- Increased Click Speed cap to different values depending on the selected time frame
- Renamed Scripts folder to `src`
- Split some UI and Settings features into `settings_manager.py` to clean up `main.py`

## Fix
- Fixed the Offset to apply in the radius of a circle instead of a square around the set position

## Performance Updates
- Introduced click batching at higher CPS to send multiple clicks every call
- Variables are initialized outside the `isRunning` loop