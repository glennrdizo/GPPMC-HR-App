@echo off
rem Runs one sync by hand (install.bat writes the copy in Program Files that Task Scheduler uses).
cd /d "%~dp0"
python bio_sync.py >> nul 2>&1
