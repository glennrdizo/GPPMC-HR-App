@echo off
rem GD Prime HR biometric sync: one-time setup. Right-click > Run as administrator.
rem Installs to Program Files (only administrators can change the program), locks the key file so only administrators and
rem the sync's own low-rights account can read it, and runs the sync every 5 minutes as NT AUTHORITY\LOCAL SERVICE.
setlocal
net session >nul 2>&1 || (echo Right-click install.bat and choose "Run as administrator". & pause & exit /b 1)
set "SRC=%~dp0"
set "DEST=%ProgramFiles%\GD Prime\bio-sync"
set "PY="
for /f "delims=" %%p in ('where python 2^>nul') do if not defined PY set "PY=%%p"
if not defined PY (echo Python is not installed. Install it from https://www.python.org/downloads/ with "Install Python for all users" and "Add python.exe to PATH" ticked, then run this again. & pause & exit /b 1)
echo "%PY%" | findstr /i /c:"%ProgramFiles%" >nul || (echo Python is installed for one user only: %PY%. The sync runs under a Windows service account, which can't use it. Reinstall Python with "Install Python for all users" ticked, then run this again. & pause & exit /b 1)
"%PY%" -m pip install --upgrade pyzk==0.9 || (echo Could not install pyzk. Check the internet connection. & pause & exit /b 1)
if not exist "%DEST%" mkdir "%DEST%" || (echo Could not create %DEST%. & pause & exit /b 1)
copy /y "%SRC%bio_sync.py" "%DEST%\" >nul & copy /y "%SRC%config.example.ini" "%DEST%\" >nul
> "%DEST%\run.bat" echo @echo off
>> "%DEST%\run.bat" echo cd /d "%DEST%"
>> "%DEST%\run.bat" echo "%PY%" bio_sync.py ^>^> nul 2^>^&1
if exist "%SRC%config.ini" if not exist "%DEST%\config.ini" copy /y "%SRC%config.ini" "%DEST%\" >nul
if not exist "%DEST%\config.ini" (copy /y "%DEST%\config.example.ini" "%DEST%\config.ini" >nul & echo Fill in config.ini: the site key and each terminal's IP. Save it, close Notepad, then come back here. & notepad "%DEST%\config.ini" & pause)
if exist "%SRC%config.ini" del /q "%SRC%config.ini"
if not exist "%DEST%\bio_sync.log" type nul > "%DEST%\bio_sync.log"
rem Administrators and SYSTEM: full control. LOCAL SERVICE: read and run; it may only write its log.
icacls "%DEST%" /inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F *S-1-5-19:(OI)(CI)RX >nul || (echo Could not set folder permissions. & pause & exit /b 1)
icacls "%DEST%\bio_sync.log" /grant *S-1-5-19:M >nul
cd /d "%DEST%"
echo Testing the terminals and the site key...
"%PY%" bio_sync.py --test || (echo. & echo Fix the problem above in "%DEST%\config.ini", then run install.bat again. & pause & exit /b 1)
echo Sending the last 31 days once...
"%PY%" bio_sync.py --days 31
schtasks /Create /SC MINUTE /MO 5 /TN "GD Prime HR biometric sync" /TR "\"%DEST%\run.bat\"" /RU "NT AUTHORITY\LOCAL SERVICE" /F || (echo Could not create the scheduled task. & pause & exit /b 1)
echo.
echo Done. Punches now go to the HR website every 5 minutes, even when nobody is signed in.
echo The program and its log are in %DEST%. You can delete the unzipped folder.
pause
