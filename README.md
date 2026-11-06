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

## Automatic notices (`supabase/functions/hr-jobs`)

- `supabase/migrations/20261016_hr_auto_jobs.sql` adds a trigger that notes changes to requests, payroll runs and applicants (`hr_events`), the message log (`hr_outbox`), daily run notes (`hr_job_runs`) and a pg_cron job that calls `hr-jobs` every 10 minutes with a secret kept in the vault.
- Deploy `hr-jobs` with JWT verification off (`supabase/config.toml`); it accepts only the scheduler's secret or a signed-in HR Admin.
- Secrets: `RESEND_API_KEY` (or `BREVO_API_KEY`) and `MAIL_FROM`, e.g. `GD Prime HR <hr@gd-prime.com>`. Optional `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER` for SMS.
- HR Admins switch notices on and pick recipients in Users & Permissions > Automatic notices (`web/autojobs.js`, settings in `org/notify`). Rules and message wording: `supabase/functions/hr-jobs/logic.ts`; tests: `node --experimental-strip-types web/test-jobs.mjs`.

## AI agents (`app/aiagents.js`)

- Overview > AI agents: morning briefing, payroll watch, document and licence checker, attendance pattern watch, workforce budget draft, exit and survey themes, sign-in watch and AI usage. On forms: Fill from a document, Write with AI (English, Tagalog, Taglish), and the incident and NTE writer on Discipline. The HR assistant can find records and open a filled-in case, job opening, applicant or announcement. Meeting action items show in Reminders; Ask HR questions get a suggested topic, desk and priority.
- The AI only drafts and flags. Nothing it fills in is saved, approved, paid or sent until a person checks it.
- The daily checks run with the Automation runner (job `ai`). Results: `aiwatch/<kind>--<day>`; payroll and budget ones in `pay/` (Payroll roles only).
- `supabase/migrations/20261106b_hr_ai_agents.sql`: monthly AI budget and daily limits (`hr_ai_settings`, `hr_ai_log`, `hr_ai_report`, `hr_ai_set`), used by `hr-ai`, `hr-bot` and `hr-jobs`; sign-in log for the sign-in watch (`hr_signin_log`, 13 months).
- Overview > Users & Sign-Ins and Users Activity Logs (`app/usersign.js`, HR Managers): accounts by type, who signed in per day and month, the list of users, and each person's sign-ins and Audit Trail activity. Each box opens the people behind it and links to the page that holds those records. Sign-ins come from `hr_user_signins()` in the same migration.
- Readable local test build: `HR_NOMIN=1 python3 build.py` (publish only the minified build).

## Live biometric sync (`tools/bio-sync`)

- ZKTeco TX628 terminals: a Python program (pyzk) on a computer at each site reads punches over port 4370 every 5 minutes and calls `hr_bio_push` with that site's key (`supabase/migrations/20261016b_hr_bio_sync.sql`). Punches land in `clockins/biometric/days/<date>`, the same place as the file import.
- HR Admins create and revoke site keys on Timekeeping > Biometric import (`web/biosync.js`); `web/build.py` publishes the program as `public/bio-sync.zip`.

## Security

- The website is published minified, with a copyright notice, a strict Content-Security-Policy and other security headers (`vercel.json`). Third-party libraries load with integrity fingerprints (`LIB_SRI` in `app/io.js`).
- `app/sec.js` drops records whose ids could break out of the page, ignores odd role names, and keeps Owner and Executive out of the default role. The database applies the same rules (`supabase/migrations/20261015_hr_security_hardening.sql`).
- This code is proprietary. See `LICENSE`. Keep this repository private.
