     1|     1|# Blur Auto Clicker — Linux + Logitech Edition
     2|     2|
     3|     3|<div align="center">
     4|     4|    <em>An accuracy and performance focused auto clicker with Logitech device control</em>
     5|     5|</div>
     6|     6|
     7|     7|---
     8|     8|
     9|     9|## Linux Rewrite
    10|    10|
    11|    11|This branch (`linux-rewrite`) is a complete port of Blur Auto Clicker from Windows to **Linux (Arch/Wayland)** with integrated **Logitech G502/G502X** device control.
    12|    12|
    13|    13|**What's new:**
    14|    14|- Ported to Tauri 2 + Rust backend for Linux (Wayland/X11 via `enigo`)
    15|    15|- Logitech HID++ device control — DPI, RGB lighting, battery status, report rate
    16|    16|- `enigo` for mouse/keyboard input simulation on Wayland
    17|    17|- `hidapi` crate for direct HID access to Logitech devices
    18|    18|- GTK overlay deactivated on Linux (Wayland click-through limitation)
    19|    19|- Autostart via XDG autostart (`~/.config/autostart/`)
    20|    20|- Build targets: `.deb`, `.AppImage`, `.rpm`
    21|    21|
    22|    22|**Logitech Devices (G502 family):**
    23|    23|- G502 Lightspeed (0x407F)
    24|    24|- G502 Lightspeed wired (0x407E)
    25|    25|- G502X Plus (0x4099 / 0x409A)
    26|    26|
    27|    27|### Dependencies (Arch Linux)
    28|    28|```bash
    29|    29|sudo pacman -S nodejs npm rust libwebkit2gtk-4.1 libhidapi xdotool libayatana-appindicator
    30|    30|```
    31|    31|
    32|    32|### Build & Run
    33|    33|```bash
    34|    34|npm install
    35|    35|cd src-tauri && cargo build --release
    36|    36|```
    37|    37|
    38|    38|## Original Windows Features
    39|    39|
    40|    40|| Feature | Description |
    41|    41||---------|-------------|
    42|    42|| Simple Mode | On/Off indicator, individual mouse buttons, keyboard key pressing, hold/toggle modes |
    43|    43|| Advanced Mode | Adjustable click timing, speed range, corner/edge stopping, click/set time limits, double clicks, position clicking, sequence mode |
    44|    44|| Click Stats | Total clicks, clicks per second, run duration |
    45|    45|
    46|    46|## License
    47|    47|
    48|    48|GNU General Public License v3.0
    49|    49|
    50|    50|## Credits
    51|    51|
    52|    52|
    53|- Fork & Linux rewrite by [MrSchnirschuh](https://github.com/MrSchnirschuh)
    54|    53|- Linux port + Logitech integration by Pandi (2026)
    55|    54|- Logitech HID++ protocol understanding from Ghub4Linux, Solaar, and libratbag