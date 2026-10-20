/* ---------- Automatic runs (Glenn 2026-10-20: full automation) ----------
   The app's background jobs (employee requests, timekeeping issues, time sheets, separations, regularization, back pay,
   employee dashboards) used to run only while someone in HR had the app open. hrRunAll() runs them all once, in order, and
   records the result in org/automation. The website's scheduled runner (tools/hr-runner) opens the app as the automation
   account and calls it every hour; HR can also press "Run now" on Overview > Automation status. */
const RUN_JOBS = [
  ["sep", "Separations and onboarding", () => applyDueSeparations().then(syncOnboarding)],
  ["reg", "Regularization after probation", () => autoRegularize()],
  ["bp", "Back pay for raises", () => lkBackPay()],
  ["rq", "Requests from employee accounts", () => rqProcess()],
  ["fx", "Timekeeping issues from phones", () => fxProcess()],
  ["ts", "Time sheets from time records", () => tkAutoSync({ force: true, reload: true })],
  ["me", "Employee dashboards", () => syncSummaries()],
];
window.__hrExtraJobs = window.__hrExtraJobs || []; // the website adds its own (account linking) as [key, label, fn]
const RUN_KEEP = 48;
let runBusy = false;
const runReady = () => !!(S.db && S.realEdit && !S.selfMode && S.loaded?.emps && S.clockDevs);
async function hrRunAll(by = "browser") {
  if (runBusy) return { busy: true }; runBusy = true; const t0 = Date.now(); const jobs = [];
  try {
    for (let i = 0; i < 60 && !runReady(); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!runReady()) return { ready: false };
    const all = [...RUN_JOBS, ...window.__hrExtraJobs];
    // Two passes: the first starts the listeners some jobs read from (phone requests, punches), the second acts on what they found.
    for (let pass = 0; pass < 2; pass++) {
      for (const [key, label, fn] of all) {
        const s = Date.now(); let err = "";
        try { await fn(); } catch (e) { err = String(e?.message || e || "error").slice(0, 200); }
        const j = jobs.find((x) => x.key === key) || (jobs.push({ key, label, ms: 0, err: "" }), jobs[jobs.length - 1]);
        j.ms += Date.now() - s; if (err) j.err = err;
      }
      if (pass === 0) await new Promise((r) => setTimeout(r, 6000));
    }
    if (typeof epSync === "function") for (let k = 0; k < 40; k++) { const before = JSON.stringify(S.epAt); await epSync(); if (JSON.stringify(S.epAt) === before) break; }
    const run = { at: new Date(t0).toISOString(), by, secs: Math.round((Date.now() - t0) / 100) / 10, jobs: jobs.map(({ key, label, ms, err }) => ({ key, label, ms, ...(err ? { err } : {}) })) };
    await runSave(run); return run;
  } finally { runBusy = false; }
}
window.__hrRunAll = hrRunAll;
async function runSave(run) {
  const ref = S.db.doc("org/automation"); let prev = {};
  try { const d = await ref.get(); prev = d.exists ? d.data() : {}; } catch {}
  const runs = [run, ...(Array.isArray(prev.runs) ? prev.runs : [])].slice(0, RUN_KEEP);
  const doc = { ...prev, runs, last: run.at, lastBy: run.by, ...(run.by === "server" ? { lastServer: run.at } : {}) };
  try { await ref.set(JSON.parse(JSON.stringify(doc))); S.autoDoc = doc; S.ver++; } catch (e) { console.warn("Automation run not recorded", e); }
}
{ const b = bootIO; bootIO = (db) => { b(db); db.doc("org/automation").onSnapshot((d) => { S.autoDoc = d.exists ? d.data() : null; refresh(); }, () => {}); }; }

/* Overview > Automation status: when each job last ran, how long it took, anything it couldn't finish. */
Object.assign(ICON, { robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/>' });
{ const g = NAV.find(([, items]) => items.some(([v]) => v === "needs")) || NAV[0]; const i = g[1].findIndex(([v]) => v === "needs");
  g[1].splice(i < 0 ? g[1].length : i + 1, 0, ["autostat", "Automation status", "robot"]);
  Object.assign(SECTION_OF, { autostat: "autostat" }); if (typeof HRD_PERM !== "undefined") HRD_PERM.autostat = HRD_PERM.needs || g[0]; }
const runAgo = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
VIEWS.autostat = () => {
  const A = S.autoDoc || {}; const runs = Array.isArray(A.runs) ? A.runs : []; const last = runs[0];
  const srvAge = A.lastServer ? (Date.now() - Date.parse(A.lastServer)) / 3600e3 : Infinity;
  const state = !window.__hosted ? ["c-gray", "This copy of the app runs the jobs only while it is open. The website runs them every hour on its own."]
    : srvAge <= 2.5 ? ["c-ok", `The scheduled runner is working. Last run ${runAgo(A.lastServer)}.`]
    : A.lastServer ? ["c-bad", `The scheduled runner hasn't run since ${runAgo(A.lastServer)}. Check the automation account and the runner settings.`]
    : ["c-gold", "The scheduled runner hasn't run yet. Until it does, the jobs run only while someone in HR has the app open."];
  const fails = runs.slice(0, 6).flatMap((r) => r.jobs.filter((j) => j.err).map((j) => ({ ...j, at: r.at })));
  return head("Overview", "Automation status", S.canEdit ? `<button class="btn btn-primary" data-run-now ${runBusy ? "disabled" : ""}>${icon("robot", 16)}${runBusy ? "Running…" : "Run now"}</button>` : "") + `
  <section class="card"><div class="card-head"><h2>Scheduled runs</h2></div><p><span class="chip ${state[0]}">${state[0] === "c-ok" ? "Working" : state[0] === "c-bad" ? "Stopped" : state[0] === "c-gold" ? "Not started" : "Open app only"}</span> ${esc(state[1])}</p>
    <p class="t-muted" style="font-size:13px">Every run files employees' phone requests and timekeeping fixes, fills open time sheets from the time records, applies separations, regularizations and back pay that are due, and refreshes everyone's phone dashboard.</p></section>
  ${fails.length ? `<section class="card"><div class="card-head"><h2>Couldn't finish</h2></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Job</th><th>What happened</th></tr></thead><tbody>
    ${fails.map((f) => `<tr><td style="white-space:nowrap">${esc(runAgo(f.at))}</td><td>${esc(f.label)}</td><td>${esc(f.err)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
  <section class="card"><div class="card-head"><h2>Last run</h2><span class="t-muted" style="font-size:13px">${last ? `${esc(runAgo(last.at))} · ${last.by === "server" ? "scheduled runner" : "from an HR browser"} · ${last.secs} s` : ""}</span></div>
    ${last ? `<div class="table-wrap"><table><thead><tr><th>Job</th><th class="num">Time</th><th>Result</th></tr></thead><tbody>
      ${last.jobs.map((j) => `<tr><td>${esc(j.label)}</td><td class="num">${(j.ms / 1000).toFixed(1)} s</td><td>${j.err ? `<span class="chip c-bad">Problem</span> ${esc(j.err)}` : '<span class="chip c-ok">Done</span>'}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty-state"><p>No run recorded yet.</p></div>'}</section>
  ${runs.length > 1 ? `<section class="card"><div class="card-head"><h2>Recent runs</h2></div><div class="table-wrap"><table><thead><tr><th>When</th><th>By</th><th class="num">Time</th><th>Problems</th></tr></thead><tbody>
    ${runs.slice(0, 24).map((r) => `<tr><td>${esc(new Date(r.at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }))}</td><td>${r.by === "server" ? "Scheduled runner" : "HR browser"}</td><td class="num">${r.secs} s</td><td>${r.jobs.filter((j) => j.err).length || "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
};
document.addEventListener("click", async (ev) => {
  if (!ev.target.closest?.("[data-run-now]") || runBusy) return; render();
  const r = await hrRunAll("browser"); toast(r?.ready === false ? "The app is still loading. Try again in a moment." : r?.jobs?.some((j) => j.err) ? "Run finished with problems. See the list below." : "All jobs ran."); render();
});
