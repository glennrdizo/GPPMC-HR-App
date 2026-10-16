# GD Prime HR biometric sync

Sends punches from ZKTeco terminals (TX628 and other models on port 4370) to the HR website every 5 minutes.
Run it on one computer per site that stays on and is on the same network as the terminals.

1. HR creates a key for the site: website > Timekeeping > Biometric import > Live sync from the terminals > Create a site key.
2. Install Python 3 from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
3. Unzip this folder (for example to `C:\GDPrime\bio-sync`), copy `config.example.ini` to `config.ini`, paste the site key
   and set each terminal's IP address (on the terminal: Menu > Comm. > Ethernet).
4. Right-click `install.bat` > Run as administrator. It installs pyzk, tests every terminal and the key, sends the last
   31 days, and adds a Windows scheduled task that runs every 5 minutes, even when nobody is signed in.

The program only reads from the terminals; it never deletes their records. The website keeps each punch once, so
overlapping runs are harmless. Each employee's Biometric ID in their 201 file must match their user id on the terminal
(the website also tries the employee no.). The page shows device user ids it couldn't match. Logs: `bio_sync.log`.
