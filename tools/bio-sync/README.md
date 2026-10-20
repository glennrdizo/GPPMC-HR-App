# GD Prime HR biometric sync

Sends punches from ZKTeco terminals (TX628 and other models on port 4370) to the HR website every 5 minutes.
Run it on one computer per site that stays on and is on the same network as the terminals.

1. HR creates a key for the site: website > Timekeeping > Biometric import > Live sync from the terminals > Create a site key.
2. Install Python 3 from https://www.python.org/downloads/ for all users (Customize installation: tick "Install Python
   for all users" and "Add python.exe to PATH").
3. Unzip this folder anywhere. Optionally copy `config.example.ini` to `config.ini` and fill it in now (the site key and
   each terminal's IP address, on the terminal: Menu > Comm. > Ethernet); otherwise the installer opens it for you.
4. Right-click `install.bat` > Run as administrator. It installs pyzk, copies the program to
   `C:\Program Files\GD Prime\bio-sync` (only administrators can change it; only administrators and the sync's
   account can read the key), tests every terminal and the key, sends the last 31 days, and adds a scheduled task that
   runs every 5 minutes as the low-rights NT AUTHORITY\LOCAL SERVICE account, even when nobody is signed in.

The program only reads from the terminals; it never deletes their records. The website keeps each punch once and never
changes a punch it already has, so overlapping runs are harmless. A site key only sends punches for the people assigned
to the sites it was made for, from the last 35 days, into cutoffs that aren't final yet, at most 30 times an hour. Each employee's Biometric ID in their 201 file must match their user id on the terminal
(the website also tries the employee no.). The page shows device user ids it couldn't match. Logs: `bio_sync.log` in the Program Files folder.
