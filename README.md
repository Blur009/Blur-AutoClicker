# Blur Auto Clicker — Linux + Logitech Edition

<div align="center">
    <em>An accuracy and performance focused auto clicker with Logitech device control</em>
</div>

---

## Linux Rewrite

This branch (`linux-rewrite`) is a complete port of Blur Auto Clicker from Windows to **Linux (Arch/Wayland)** with integrated **Logitech G502/G502X** device control.

**What's new:**
- Ported to Tauri 2 + Rust backend for Linux (Wayland/X11 via `enigo`)
- Logitech HID++ device control — DPI, RGB lighting, battery status, report rate
- `enigo` for mouse/keyboard input simulation on Wayland
- `hidapi` crate for direct HID access to Logitech devices
- GTK overlay deactivated on Linux (Wayland click-through limitation)
- Autostart via XDG autostart (`~/.config/autostart/`)
- Build targets: `.deb`, `.AppImage`, `.rpm`

**Logitech Devices (G502 family):**
- G502 Lightspeed (0x407F)
- G502 Lightspeed wired (0x407E)
- G502X Plus (0x4099 / 0x409A)

### Dependencies (Arch Linux)
```bash
sudo pacman -S nodejs npm rust libwebkit2gtk-4.1 libhidapi xdotool libayatana-appindicator
```

### Build & Run
```bash
npm install
cd src-tauri && cargo build --release
```

## Original Windows Features

| Feature | Description |
|---------|-------------|
| Simple Mode | On/Off indicator, individual mouse buttons, keyboard key pressing, hold/toggle modes |
| Advanced Mode | Adjustable click timing, speed range, corner/edge stopping, click/set time limits, double clicks, position clicking, sequence mode |
| Click Stats | Total clicks, clicks per second, run duration |

## License

GNU General Public License v3.0

## Credits

- Original Windows version by [Blur009](https://github.com/Blur009/Blur-AutoClicker)
- Linux port + Logitech integration by Pandi (2026)
- Logitech HID++ protocol understanding from Ghub4Linux, Solaar, and libratbag