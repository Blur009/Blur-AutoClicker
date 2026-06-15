<div align="center">
  <p align="center">
    <a href="https://github.com/Blur009/Blur-AutoClicker/releases"><img src="https://img.shields.io/github/downloads/Blur009/Blur-AutoClicker/total?style=for-the-badge&label=downloads" alt="Downloads"></a>
    <img src="https://img.shields.io/github/package-json/v/Blur009/Blur-AutoClicker?style=for-the-badge&label=version" alt="Version">
    <img src="https://img.shields.io/github/license/Blur009/Blur-AutoClicker?style=for-the-badge" alt="License">
    <img src="https://img.shields.io/github/stars/Blur009/Blur-AutoClicker?style=for-the-badge&label=stars" alt="Stars">
    <a href="https://discord.gg/jhWEW747x5"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  </p>

  

  # Blur Auto Clicker


  <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/public/V3.0.0_UI.png" width="600"/>

  <p align="center"><em>An auto clicker that actually clicks at the speed you set.</em></p>
  
  <a href="https://ko-fi.com/blur009">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Donate on Ko-fi" width="350">
  </a>

  ---

  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#license">License</a>
  
  

</div>

---
Most auto clickers aren't accurate at high speeds. Set it to 50 CPS and you might get 40. Or 60. This one actually hits the speed you set. It also bundles the useful features from other auto clickers into one place, and adds a few extras. RAM is around 100mb and stays under 200mb (yes its a lot but sadly it cant be reduced due to Webview2).

---

## Features

**Simple Mode:**
- On/off indicator (logo turns green when running)
- Left, right, or middle mouse button
- Keyboard key pressing with case control
- Hold or toggle activation
- Customizable hotkeys

**Advanced Mode** (everything in Simple, plus):
- Adjustable click timing (duty cycle)
- Random CPS within a range
- Corner and edge stopping (auto-off near screen edges)
- Click and time limits
- Double clicks
- Position clicking (pick a spot, mouse moves and clicks there)
- Per second, minute, hour, or day


## Quick Start

<a href="https://github.com/Blur009/Blur-AutoClicker/releases/latest">
  <img src="https://github.com/machiav3lli/oandbackupx/blob/034b226cea5c1b30eb4f6a6f313e4dadcbb0ece4/badge_github.png" alt="Download from GitHub" height="50">
</a>

Installed to `%localappdata%/BlurAutoClicker/BlurAutoClicker.exe`.  
Config and stats are saved in `%appdata%/BlurAutoClicker`.

> On version 2.1.2 or below? Delete the old executable first — the installer won't do it. Old configs won't work with v3+, they'll be deleted on first launch.

---

## FAQ

<details>
<summary><b>Why is CPS capped at 500?</b></summary>

Windows has a limit of around 500 CPS for mouse events. The timer resolution bottoms out at about 1ms (1000 CPS), but Windows also needs to do other things, so the practical limit is around 800 CPS. Since I can't guarantee that on every machine, it's set to 500. (A 1000 cps setting is available but not recommended.)
</details>

<details>
<summary><b>Windows SmartScreen warning?</b></summary>

The installer isn't signed, so Windows may show a SmartScreen warning. Tauri updater signing is separate from Windows Authenticode signing. See <a href="docs/windows-release-trust.md">docs/windows-release-trust.md</a> for details.
</details>

<details>
<summary><b>Can I build from source?</b></summary>

Yes — see <a href="BUILDING.md">BUILDING.md</a> for setup, build, and validation commands. For contributing guidelines, see <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.
</details>

---

## License

Licensed under the [GNU General Public License](LICENSE).
