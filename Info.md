# To Build Python EXE: 

1. make sure pyinstaller is installed (pip install pyinstaller / pyinstaller --v)
2. if not in venv: venv\Scripts\activate
3. Run Build Command: pyinstaller --onefile --noconsole --name "Blur Utility" --icon="Resources/Icon.ico" --add-data "Resources;Resources" --add-binary "clicker_engine.dll;." main.py

# To Build C into dll:
1. step 1
2. step 2 
3. step 3