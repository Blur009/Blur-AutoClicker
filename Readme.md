# Blur Auto Clicker

<div align="center">
    <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/Resources/AutoClickerPreview.png" alt="Blur Auto Clicker Preview" width="600"/>
    <br>
    <p><em>made for maximum performance and actual click-speed accuracy.</em></p>
</div>

---

## ⚡ High-Performance Auto-Clicker
Most auto-clickers suffer from a significant discrepancy between the **reported CPS** and the **actual hardware output**, especially at high frequencies. **Blur Auto Clicker** was developed to bridge this gap. 
This tool achieves what is likely the highest level of accuracy available today.

### Key Features
* **Go Engine:** backend ensures timing precision that typical Python or AutoHotkey scripts cannot match.
* **Variable Duty Cycle:** Control the "hold" duration of each click to mimic human-like behavior.
* **Advanced Randomization:** Adjustable variation and offset parameters to bypass rigid pattern detection.



## 🛠 Technical Stuff

* **Frontend:** Python 3.x + PySide6 (Qt)
* **Backend:** Go (Golang) using `syscall` for direct Windows API interaction (`SendInput`).


## 🚀 Why Accuracy Matters
During development, benchmarks revealed that popular alternatives often drift by up to 15-20% at speeds exceeding 50 CPS. Blur maintains a near 1:1 ratio between requested speed and actual execution by minimizing overhead in the click-loop.

<div align="center">
    <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/Resources/ErrorRate.png" alt="Accuracy Comparison" width="500"/>
</div>


## 📥 Installation & Usage
1.  Download the latest release from the [Releases](https://github.com/Blur009/Blur-AutoClicker/releases) tab.
2.  Run the executable.


## 🛡 License & Contribution
This project is licensed under the **GNU General Public License v3.0**. 

* **Bugs:** Please report issues via the GitHub Issue tracker.
* **Support:** If you find this tool helpful, consider supporting development on [Ko-Fi](https://ko-fi.com/blur009).

---
<p align="center">
    <em>"Made with Spite."</em>
</p>