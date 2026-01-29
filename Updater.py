import os
import time
import requests
import subprocess
import sys
from PySide6.QtUiTools import QUiLoader
from PySide6.QtCore import (QFile,QTimer)
from PySide6.QtWidgets import (QApplication, QTextEdit)

DEBUG_MODE = True
def debug_log(message):
    if DEBUG_MODE:
        print(message)

def get_latest_exe_url():
    url = "https://api.github.com/repos/Blur009/Blur-AutoClicker/releases/latest"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            # Look through assets for the .exe file
            for asset in data['assets']:
                if asset['name'].endswith('.exe'):
                    return asset['browser_download_url']
    except Exception as e:
        debug_log(f"Error contacting GitHub: {e}")
    return None

def debug_log_console():
    console = ui.findChild(QTextEdit,"ConsoleBox" )
    console.debug_log()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    loader = QUiLoader()
    file = QFile("BlurAutoClickerUpdater.ui")
    file.open(QFile.ReadOnly)
    ui = loader.load(file)
    file.close()
    ui.show()


    debug_log("--- Blur AutoClicker Updater ---")

    # 1. Determine Target File
    # If run from Main App: updater.exe BlurAutoClicker.exe
    # If run manually (double click): No arguments, so we assume the name.
    if len(sys.argv) > 1:
        target_filename = sys.argv[1]
    else:
        target_filename = "BlurAutoClicker.exe"

    debug_log(f"Target: {target_filename}")

    # 2. Get Download URL
    download_url = get_latest_exe_url()

    if not download_url:
        debug_log("Error: Could not find a .exe file in the latest GitHub release.")
        sys.exit(1)

    # 3. Download
    temp_filename = f"{target_filename}_new"
    debug_log(f"Downloading latest version from GitHub...")

    try:
        r = requests.get(download_url, stream=True)
        with open(temp_filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        debug_log("Download complete.")
    except Exception as e:
        debug_log(f"Download failed: {e}")
        sys.exit(1)

    # 4. Wait and Replace
    debug_log("Waiting for main application to close (5 seconds)...")
    time.sleep(5)  # Give the main app time to fully quit and unlock the file

    try:
        debug_log(f"Replacing {target_filename} with new version...")
        os.replace(temp_filename, target_filename)
        debug_log("Update successful!")
    except PermissionError:
        debug_log("\n[ERROR] Could not replace the file.")
        debug_log("The application might still be running or is open elsewhere.")
        debug_log(f"Please close '{target_filename}' manually and try again.")
        # We leave the downloaded file there so they can try again manually if needed
        sys.exit(1)
    except Exception as e:
        debug_log(f"An unexpected error occurred: {e}")
        sys.exit(1)

    # 5. Restart
    debug_log(f"Starting {target_filename}...")
    subprocess.Popen(target_filename)

    sys.exit(0)
