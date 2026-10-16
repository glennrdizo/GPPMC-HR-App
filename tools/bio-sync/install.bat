@echo off
rem GD Prime HR biometric sync: one-time setup. Right-click > Run as administrator.
cd /d "%~dp0"
where python >nul 2>&1 || (echo Python is not installed. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH" & echo. & pause & exit /b 1)
python -m pip install --upgrade pyzk==0.9 || (echo Could not install pyzk. Check the internet connection. & pause & exit /b 1)
if not exist config.ini (copy config.example.ini config.ini >nul & echo Fill in config.ini first: the site key and each terminal's IP. & notepad config.ini & pause)
echo Testing the terminals and the site key...
python bio_sync.py --test || (echo. & echo Fix the problem above, then run install.bat again. & pause & exit /b 1)
echo Sending the last 31 days once...
python bio_sync.py --days 31
schtasks /Create /SC MINUTE /MO 5 /TN "GD Prime HR biometric sync" /TR "\"%~dp0run.bat\"" /RU SYSTEM /RL HIGHEST /F || (echo Could not create the scheduled task. Run this file as administrator. & pause & exit /b 1)
echo.
echo Done. Punches now go to the HR website every 5 minutes, even when nobody is signed in.
echo The log is in bio_sync.log in this folder.
pause
