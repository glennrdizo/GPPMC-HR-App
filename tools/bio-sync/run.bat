@echo off
rem Runs one sync. Task Scheduler calls this every 5 minutes.
cd /d "%~dp0"
python bio_sync.py >> nul 2>&1
