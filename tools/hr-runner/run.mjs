// Scheduled HR runner (2026-10-20): opens the HR website as the automation account in a headless browser and runs every
// background job once (window.__hrRunAll in app/runner.js), so nothing waits for someone in HR to open the app.
// Env: HR_BOT_EMAIL, HR_BOT_PASSWORD (required), HR_URL (default the Vercel address), HR_LOOP_MIN (repeat every N minutes, for
// an always-on host; omit for a single run, as in the GitHub Actions schedule).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SB_URL = "https://dkrxetzvzxkmhdnvrnqd.supabase.co";
const SB_KEY = "sb_publishable_BacTOm5RH5cw7ruQO9KHUw_ocKoTBkX"; // publishable key, same as the website's
const STORE = "sb-dkrxetzvzxkmhdnvrnqd-auth-token";
const SITE = process.env.HR_URL || "https://gppmc-hr-app1.vercel.app/";
const shim = readFileSync(fileURLToPath(new URL("../../web/sb-shim.js", import.meta.url)), "utf8");
const DPA_V = (shim.match(/const DPA_V = "([^"]+)"/) || [])[1];

async function signIn() {
  const email = process.env.HR_BOT_EMAIL, password = process.env.HR_BOT_PASSWORD;
  if (!email || !password) throw new Error("Set HR_BOT_EMAIL and HR_BOT_PASSWORD.");
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SB_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const s = await r.json(); if (!r.ok || !s.access_token) throw new Error(`Sign-in refused: ${s.error_description || s.msg || r.status}`);
  if (DPA_V && s.user?.user_metadata?.dpa_v !== DPA_V) { // the automation account accepts the privacy notice like any user
    const u = await fetch(`${SB_URL}/auth/v1/user`, { method: "PUT", headers: { apikey: SB_KEY, authorization: `Bearer ${s.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ data: { dpa_v: DPA_V, dpa_at: new Date().toISOString() } }) });
    if (u.ok) s.user = await u.json();
  }
  return { ...s, expires_at: Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
}

async function once() {
  const session = await signIn();
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ timezoneId: "Asia/Manila", viewport: { width: 1280, height: 900 } })).newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e).slice(0, 200)));
    await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch {} }, [STORE, JSON.stringify(session)]);
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => typeof window.__hrRunAll === "function", null, { timeout: 120000 });
    const res = await page.evaluate(() => window.__hrRunAll("server"));
    if (!res || res.ready === false) throw new Error("The app didn't finish loading as an HR account. Check that the automation account is approved and has an HR role.");
    if (res.busy) { console.log("Another run is in progress."); return 0; }
    for (const j of res.jobs) console.log(`${j.err ? "PROBLEM" : "ok     "} ${j.label} (${(j.ms / 1000).toFixed(1)} s)${j.err ? `: ${j.err}` : ""}`);
    if (errs.length) console.log("Page errors:", errs.slice(0, 5).join(" | "));
    console.log(`Run finished in ${res.secs} s.`);
    return res.jobs.some((j) => j.err) ? 1 : 0;
  } finally { await browser.close(); }
}

const every = Number(process.env.HR_LOOP_MIN || 0);
if (!every) process.exit(await once().catch((e) => { console.error(e.message || e); return 1; }));
for (;;) { await once().catch((e) => console.error(e.message || e)); await new Promise((r) => setTimeout(r, every * 60000)); }
