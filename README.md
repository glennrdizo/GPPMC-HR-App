# GD Prime HR App

HR and payroll system for GD Prime Property Management Corporation.

## Layout

| Folder | What it is |
|---|---|
| `public/` | The website Vercel publishes: `index.html` (the app), `supabase.js`, `sw.js`. Generated; don't edit by hand. |
| `app/` | The app source. Each `*.js` file is a module spliced into `app/index.html` by `app/rebuild.py`. |
| `web/` | The website layer: `sb-shim.js` (sign-in screen and the Supabase data, file and AI connections), `hosted.js` (website-only tweaks), `sw.js` (serves private files), `build.py` (builds `public/`). |
| `supabase/` | Database migrations and the `hr-ai` edge function for the Supabase project **gd-prime-hr**. |

## Making a change

```sh
cd app && python3 rebuild.py && node --check chk.js   # rebuild the app after editing a module
cd ../web && npm install && python3 build.py        # rebuild the website into public/ (minified)
```

Commit and push to `main`; Vercel redeploys automatically.

## Deploy settings

- Vercel: import this repository, Framework preset **Other**, no build command. `vercel.json` points it at `public/`.
- Supabase (gd-prime-hr): Authentication > URL Configuration > Site URL = the Vercel address.
- Optional: Edge Functions > Secrets > `ANTHROPIC_API_KEY` turns on the HR assistant, loan reading and report analysis.

## Security

- The website is published minified, with a copyright notice, a strict Content-Security-Policy and other security headers (`vercel.json`). Third-party libraries load with integrity fingerprints (`LIB_SRI` in `app/io.js`).
- `app/sec.js` drops records whose ids could break out of the page, ignores odd role names, and keeps Owner and Executive out of the default role. The database applies the same rules (`supabase/migrations/20261015_hr_security_hardening.sql`).
- This code is proprietary. See `LICENSE`. Keep this repository private.
