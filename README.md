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

> [!WARNING]
> **Unofficial AI-made macOS experiment:** The macOS port in this fork was made with AI purely for fun. It is not endorsed by the original author, has not received a professional security audit, should not be taken seriously, and should not be relied on for important work. Review the code and use it at your own risk. This warning applies to the experimental macOS port, not the original Windows project.

---
Most auto clickers aren't accurate at high speeds. Set it to 50 CPS and you might get 40. Or 60. This one actually hits the speed you set. It also bundles the useful features from other auto clickers into one place, and adds a few extras. RAM is around 100mb and stays under 200mb. The interface uses the system webview: WebView2 on Windows and WKWebView on macOS.

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

### Windows

Installed to `%localappdata%/BlurAutoClicker/BlurAutoClicker.exe`. Config and stats are saved in `%appdata%/BlurAutoClicker`.

### macOS

Build the `.app` or `.dmg` from source using the instructions in [BUILDING.md](BUILDING.md). On first launch, allow BlurAutoClicker in **System Settings → Privacy & Security → Accessibility** so global hotkeys, clicking, key pressing, point selection, and stop-zone selection can work outside the app.

> On version 2.1.2 or below? Delete the old executable first — the installer won't do it. Old configs won't work with v3+, they'll be deleted on first launch.

---

## FAQ

<details>
<summary><b>Why is CPS capped at 500?</b></summary>

The practical event-delivery limit varies by operating system, hardware, and the target application. The default cap remains 500 CPS for predictable behavior. A 1000 CPS setting is available but not recommended.
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

## Note
This project has been accepted into Windows Package Manager (winget). You can install it with the command:

```powershell
winget install -e --id Blur009.BlurAutoClicker --source winget --silent
```
---
It has also been accepted into **Chris Titus Tech's winutils**.
https://github.com/ChrisTitusTech/winutil/pull/4383

---
This project is not code signed, so Windows may show a SmartScreen warning. See [microsoft](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) for information on SmartScreen. Importantly, a SmartScreen warning does not mean the software is malicious, it just means it is not code signed which is an expensive process.
