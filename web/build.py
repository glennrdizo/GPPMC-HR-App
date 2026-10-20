# Builds the website (public/) from the app (app/index.html) plus the Supabase layer in web/.
import os, re, shutil, subprocess
W = os.path.dirname(os.path.abspath(__file__))
app = open(os.path.join(W, '..', 'app', 'index.html')).read()
end = '\nboot();\n})();\n</script>'
assert app.count(end) == 1, 'app end marker'
app = app.replace(end, '\n' + open(os.path.join(W, 'hosted.js')).read() + '\n' + open(os.path.join(W, 'autojobs.js')).read() + '\n' + open(os.path.join(W, 'biosync.js')).read() + '\n' + open(os.path.join(W, 'kioskadm.js')).read() + '\n' + open(os.path.join(W, 'dochist.js')).read() + end)
logo = re.search(r'const CO_LOGO = "([^"]+)"', app).group(1)
sbjs = open(os.path.join(W, '..', 'public', 'supabase.js')).read()  # @supabase/supabase-js 2.45.4 UMD
shim = open(os.path.join(W, 'sb-shim.js')).read()
NOTICE = ('<!-- Copyright (c) 2026 GD Prime Property Management Corporation. All rights reserved. '
          'Proprietary and confidential: copying, reuse or redistribution of this code is not permitted. -->')
head = ('<!doctype html><html lang="en"><head>' + NOTICE + '<meta charset="utf-8"><meta name="robots" content="noindex, nofollow">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#0D1729"><link rel="icon" href="' + logo + '">'
        '<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style>'
        '<script src="supabase.js"></script><script>window.CO_LOGO_URL="' + logo + '";\n' + shim + '</script></head><body>')
out = os.path.join(W, '..', 'public'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(head + app + '</body></html>')
shutil.copy(os.path.join(W, 'sw.js'), os.path.join(out, 'sw.js'))
open(os.path.join(out, 'supabase.js'), 'w').write(sbjs)
# Careers page and applicant portal (/careers): a light page of its own, sharing the same Supabase project and sign-in.
car = ('<!doctype html><html lang="en"><head>' + NOTICE + '<meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       '<title>Careers · GD Prime</title><meta name="description" content="Job openings at GD Prime Property Management Corporation. Apply online and follow your application.">'
       '<meta property="og:title" content="Careers at GD Prime"><meta property="og:description" content="Job openings at GD Prime Property Management Corporation. Apply online.">'
       '<meta name="theme-color" content="#0D1729"><link rel="icon" href="' + logo + '">'
       '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=Playfair+Display:ital,wght@0,700;1,700&display=swap">'
       '<script src="supabase.js"></script></head><body><div id="app"></div><script>window.CO_LOGO_URL="' + logo + '";\n' + open(os.path.join(W, 'careers.js')).read() + '</script></body></html>')
open(os.path.join(out, 'careers.html'), 'w').write(car)
# Site kiosk (/kiosk): a gate tablet that saves time in and out with a site key, no HR sign-in.
ksk = ('<!doctype html><html lang="en"><head>' + NOTICE + '<meta charset="utf-8"><meta name="robots" content="noindex, nofollow">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       '<title>Site kiosk · GD Prime</title><meta name="theme-color" content="#0D1729"><link rel="icon" href="' + logo + '">'
       '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=Playfair+Display:wght@700&display=swap">'
       '<script src="supabase.js"></script></head><body><div id="app"></div><script>window.CO_LOGO_URL="' + logo + '";\n' + open(os.path.join(W, 'kiosk.js')).read() + '</script></body></html>')
open(os.path.join(out, 'kiosk.html'), 'w').write(ksk)
m = re.findall(r'<script[^>]*>(.*?)</script>', head + app, re.S)
open('/tmp/chk-shim.js', 'w').write(m[1]); open('/tmp/chk-app.js', 'w').write(m[-1])
# The biometric sync program HR downloads for each site computer (tools/bio-sync, without local settings or logs).
import zipfile
T = os.path.join(W, '..', 'tools', 'bio-sync')
with zipfile.ZipFile(os.path.join(out, 'bio-sync.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(T)):
        if f in ('config.ini', 'bio_sync.log') or f.startswith(('__', '.')) or not os.path.isfile(os.path.join(T, f)): continue
        z.write(os.path.join(T, f), 'bio-sync/' + f)
# Minify the published scripts (needs `npm install` in web/ once).
if not os.path.exists(os.path.join(W, 'node_modules', 'terser')):
    raise SystemExit('Run `npm install` in web/ first: the website is published minified.')
subprocess.run(['node', os.path.join(W, 'minify.cjs')], check=True)
print('built', os.path.getsize(os.path.join(out, 'index.html')))
