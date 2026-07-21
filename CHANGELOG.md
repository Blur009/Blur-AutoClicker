# v3.9.1 - 21.07.2026 (d.m.y)
## Fixed
- Fixed Presets not saving the clicker activation hotkey.

# v3.9.0 - 18.07.2026 (d.m.y)
## New
- Added Hold mode in duty cycle since people couldn't figure out that 100% is the same as Holding down the mouse continuously.
- Added slider for window opacity in the appearance settings.
- Added Keybind section in settings.
- Added Keybinds for switching between all pages.(1 to 5 for simple, advanced, zones, click points, settings)
- Added the ability to customize each page individually in the appearance settings.
- Added 'Stop when Complete' toggle to Sequence clicking (which has been re-named to Click Points).
- Added the ability to have multiple custom stop zones.
- Added a radius to the click points that randomizes the click position within that radius.
- Added Task-bar icon customization in the appearance settings. The Icon now follows the theme color, and accent color on activation. You can toggle all of these options in the settings.
- Added Remember window position toggle (Settings → Behaviour → Startup) On by default.
- Added Status bar at the bottom of the window to show the current status of the clicker, and the reason for stopping if it is stopped.
## Changed
- Overhauled Advanced panel.
- Settings panel now has a side menu for easier navigation and organization of settings.
- Font switch from DM Sans to RobotoFlex to support tabular enums (e.g. numbers that don't shift when changing values).
- Lowered maximum double click CPS from 50 to 10.
- Click limit maximum increased from 10mil to 100mil.
- Changed scroll behaviour for number inputs to be: shift = 5, ctrl = 25, shift + ctrl = 100.
- Made settings icon 1px bigger because size matters and the settings icon was feeling very insecure about its 1 pixel size disadvantage. I hope it feels better now. 
- Moved Process (white/black)list to the settings.
- Overhauled Custom Stop Zones.
- Zones overlay now shows a different color for disabled state of zones
- Replaced On/Off toggles with switches in the settings panel and gave them an animation cuz im fancy like that.
- Added animations to some ui elements and icons
## Fixed
- Fixed alt menu opening when the autoclicker is launched while tabbed into another app.
- Fixed simple tab button in the title bar showing the wrong background color when a custom accent color is selected.
- Fixed click points picker overlay persisting when the click points are toggled off while the overlay is open.
- Fixed click speed not being reached at high CPS. Now it turns out that i fixed it somehow on accident, but im just going to say that i fixed it on purpose because i am a genius and i am very smart and very good at programming.
- Window position and size appearing in the wrong location on launch for about 1 second, should now just appear normally.

# v3.8.3 - 28.06.2026 (d.m.y)
## Changed
- Changed max Process list title length to 35 characters to hopefully prevent ui clipping.
## Fixed
- Fixed stop reason falsely showing up when switching from settings to another panel.
- Fixed behaviour of the cps input field to be more gooder.
- Fixed title bar not having the background image blur effect applied.
- Hopefully fixed application startup crash when RTSS is running.

# v3.8.2 - 25.06.2026 (d.m.y)
## New
- Added verbose logging and crash reporting. This should make debugging much easier. You can find the logs in the settings panel all the way at the bottom. For now they are local only, hence the Export button that combines all your logs into a single zip.
## Changed
- Right aligned Items in Limits section in advanced panel. (ik, big change)
## Fixed
- Fixed program sometimes launching with a blank window.
- Fixed program crash when clicking into Zones panel.
## Info
as for some information for any devs. I have added a new command 'npm run check' and 'npm run fix' which will check and try to fix most common issues. Make sure to check out package.json for the commands. I really recommend running 'npm run check' before any sort of commit as it will make everyone's life easier when code is formatted consistently.

# v3.8.1 - 23.06.2026 (d.m.y)
## Changed
- Updated wording for extended click speed limit description.
- Updated wording on task switcher -> Alt+Tab
- Hotkey field now accepts modifier keys, ESC and Return.
- Keyboard Clicker now accepts modifier keys, ESC and Return.
## Fixed
- Fixed mouse cursor behaving erratically while application is running.

# v3.8.0 - 21.06.2026 (d.m.y)
## New
- SUPPORT FOR CUSTOM BACKGROUND IMAGES! (Settings → Appearance → Background Image).
- Process whitelist/blacklist with per-application Stop/Pause behavior in the Zones panel.
- Automatic stopping on Alt+Tab / Win+Tab (On/Off toggle in Settings → Behavior).
- Autoclicker automatically stops when clicking into the hotkey field.
- Hotkey input now has a button to clear the current hotkey.
## Changed
- Stop reason now visible in simple mode (not just advanced/zones).
- Pre-click abort checks now run before every individual click (failsafe, time limit, process list, task switcher).
- Failsafe (corner + edge) and custom stop zone sections have moved slightly.
- Zero-click runs are no longer recorded to stats or printed to console in dev mode.
- Flipped around On/Off toggle to Off/On in the settings.
- Slightly reduced ram usage (-40% to -65% when no settings have been changed for about 30 seconds).
- Removed Translations due to the complexity of maintaining them (~80% user vote on removing them).
## Fixed
- Click speed not being reached at high CPS (this time for real)
- Position picking overlay appearing under main autoclicker window.
- UI elements turning white when shift is pressed.
- Fixed rare Flashing of toggles when setting is changed.
- Window sizing to the wrong size on startup should now be fixed.
- Window sizing should now be smoother between modes.

# v3.7.2 - 15.06.2026 (d.m.y)
## Fixed
- clicker not clicking.
- clicker not reaching accurate cps at higher speeds.

# v3.7.1 - 15.06.2026 (d.m.y)
## New
- Scrolling on drop-down fields now supported.
- Scrolling on number fields now supports Shift and Shift + Ctrl for bigger increments (5 and 10 respectively)
- Added ```Check for update``` button in the settings.
- Added changelog in the App settings page.
## Fixed
- Added Scrolling block for Sequence clicking items closing [#220](https://github.com/Blur009/Blur-AutoClicker/issues/220)
- Removed text weight difference for light mode fixing issue [#139](https://github.com/Blur009/Blur-AutoClicker/issues/139)
- Added font setting to the overlay to close issue [#138](https://github.com/Blur009/Blur-AutoClicker/issues/138)
- Fixed hotkey self-triggering during auto-clicks by flagging synthetic input and filtering it out in hotkey detection.
- Fixed stop reason repeating when switching between simple and advanced mode.
- Behaviour of multiple windows was changed back to 3.6.1 | This makes close to Tray behaviour inconsistent but the multiple window feature seems to be more demanded.
## Changed
- Changed Github issue templates, Readme, and contributing files.
- Updated dependencies.

# v3.7.0 - 21.05.2026 (d.m.y)
## New
- Added Sequence picking instead of a timer.
- Added Sequence picking showing dots where clicks will happen. They only show if you change the value, and will disappear after a few seconds.
- Added 1000 cps mode with warning (note that your click duration is now clamped to 1% at >500cps and <99% at >50cps otherwise you would not be able to achive those speeds)
## Fixed
- Removed dynamic adjustment of the panel size of the hotkey field in simple mode to prevent a scroll bar from showing up.
- Refactored double click to use Windows double-click timing and made it work correctly with click duration / duty cycle.

# v3.6.1 - 12.05.2026 (d.m.y)
## Fixed
- fixed sequence clicking not going through items correctly & movement with pointer precision issues should now be fixed as well. Within that fix i added always on movement & click randomization
## Changed
- made batch clicking work better with sequence clicking so cps can go up to 500 when sequence clicking items don't have a too low click count. 

# v3.6.0 - 11.05.2026 (d.m.y)
## New
- Added the ability to choose between mouse clicking and keyboard clicking
- Added the ability to choose a vertical or horizontal layout for Advanced mode (feedback on this would be appriciated)
## Changed
- Made batching more dynamic
- Increased the maximum Sequence Click repetition amount to 100000 from 1000
- Increased the corner and edge stop zones maximum value to 10000 from 999
## Fixed
- Fixed Sequence clicking not working as intended.

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
## Fixed
- Fixed mouse button staying down after stopping the clicker
- Fixed safe zone scaling with Windows display scaling
- Custom stop zone failsafe now takes priority over other failsafes
- Custom stop zone overlay now scales correctly with device pixel ratio

# v3.4.1 - 16.04.2026 (d.m.y)
## New
- Added a settings toggle for relaxed/strict keybind mode
## Changed
- PX values now support scaling correctly (thank you rorky47)
- Changed size and style of ko-fi donation button
- Made CSS more consistent (thank you lulkebit)
- Added CI checks (thank you Rorky47)
- Added Windows signing support (thank you David-T-Campos)
## Fixed
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
## Fixed
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
## Fixed
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
## Fixed
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
## Fixed
1. Probably fixed a few things along the way
## Performance Updates
1. Moving to Rust entirely eliminated the Python runtime, which should slightly increase performance
## Removed
1. Mouse move options for now until the Macro panel is ready
2. Old stats because of the new encryption method


# v2.1.2 - 22.03.2026 (d.m.y)
## Fixed
- Drop-down selector for Second/Minute/Hour/Day used to always return per second, meaning sub-1 CPS could not be achieved
- Minimum Duty cycle has been reduced from 1% to 0.1% to help with the mouse being held down for too long during sub-1s click times

# v2.1.1 - 24.02.2026 (d.m.y)
## Fixed
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
## Fixed
- Fixed the Offset to apply in the radius of a circle instead of a square around the set position
## Performance Updates
- Introduced click batching at higher CPS to send multiple clicks every call
- Variables are initialized outside the `isRunning` loop
