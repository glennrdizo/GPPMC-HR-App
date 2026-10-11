# Builds the website (public/) from the app (app/index.html) plus the Supabase layer in web/.
import os, re, shutil
W = os.path.dirname(os.path.abspath(__file__))
app = open(os.path.join(W, '..', 'app', 'index.html')).read()
end = '\nboot();\n})();\n</script>'
assert app.count(end) == 1, 'app end marker'
app = app.replace(end, '\n' + open(os.path.join(W, 'hosted.js')).read() + end)
logo = re.search(r'const CO_LOGO = "([^"]+)"', app).group(1)
sbjs = open(os.path.join(W, '..', 'public', 'supabase.js')).read()  # @supabase/supabase-js 2.45.4 UMD
shim = open(os.path.join(W, 'sb-shim.js')).read()
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#0D1729"><link rel="icon" href="' + logo + '">'
        '<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style>'
        '<script src="supabase.js"></script><script>window.CO_LOGO_URL="' + logo + '";\n' + shim + '</script></head><body>')
out = os.path.join(W, '..', 'public'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(head + app + '</body></html>')
shutil.copy(os.path.join(W, 'sw.js'), os.path.join(out, 'sw.js'))
open(os.path.join(out, 'supabase.js'), 'w').write(sbjs)
m = re.findall(r'<script[^>]*>(.*?)</script>', head + app, re.S)
open('/tmp/chk-shim.js', 'w').write(m[1]); open('/tmp/chk-app.js', 'w').write(m[-1])
print('built', os.path.getsize(os.path.join(out, 'index.html')))
