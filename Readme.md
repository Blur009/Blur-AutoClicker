# Blur Auto Clicker

<div align="center">
    <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/Resources/AutoClickerPreview.png" alt="Blur Auto Clicker Preview" width="600"/>
    <br>
    <p><em>made for maximum performance and accuracy.</em></p>
</div>

---

## ⚡ High-Performance Auto-Clicker
Most auto-clickers suffer from a significant discrepancy between **reported CPS** and **actual output**, especially at high frequencies. **Blur Auto Clicker** was built to be as accurate as your system allows — not drifting even at the Windows CPS ceiling of ~800 CPS*¹. 

### Key Features
* **Go Engine:** backend ensures timing precision that typical Python or AutoHotkey scripts cannot match.
* **Variable Duty Cycle:** Control the "hold" duration of each click to mimic human-like behavior.
* **Advanced Randomization:** Adjustable variation and offset parameters to bypass rigid pattern detection.



## 🛠 Technical Stuff

* **Frontend:** Python 3.12.10 + PySide6 (Qt)
* **Backend:** Go (Golang) using `syscall` for direct Windows API interaction (`SendInput`).


## 🚀 Why Accuracy Matters
During development, my insanely complex and accurate benchmarks (randomly testing stuff) revealed that popular alternatives often drift by up to 15-20% at speeds exceeding 50 CPS. This Autocilcker maintains a *near* 1:1 ratio between requested speed and actual execution.

<div align="center">
    <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/Resources/ErrorRate.png" alt="Accuracy Comparison" width="500"/>
</div>


## 📥 Installation & Usage
1.  Download the latest release from the [Releases](https://github.com/Blur009/Blur-AutoClicker/releases) tab.
2.  Run the executable.
> config.ini gets saved in %appdata%/blur009/autoclicker


## 🛡 License & Contribution
This project is licensed under the **GNU General Public License v3.0**. 

* **Bugs:** Please report issues via the GitHub Issue tracker.
* **Support:** If you find this tool helpful, consider supporting development on [Ko-Fi](https://ko-fi.com/blur009).

---


> ¹ Windows has a system timer that controls how precisely the OS can schedule events. The minimum stable resolution is 1ms, giving a theoretical ceiling of 1000 CPS. In practice, system overhead brings this to ~800 CPS (1.2ms effective interval). This is a Windows architectural limit — Linux and macOS support far finer timer resolution, allowing significantly higher click rates. This tool currently supports Windows only.

---

<p align="center">
    <em>"Made with confusion 😕. And Love, ofc"</em>
    <img src="https://tenor.com/view/witch-watch-witch-watch-anime-nico-gif-17809044814573598781" width="250">
</p>