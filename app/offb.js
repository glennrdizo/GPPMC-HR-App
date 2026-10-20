/* ---------- Offboarding on its own (Glenn 2026-10-20: full automation) ----------
   1. An accepted resignation starts offboarding by itself on the next scheduled run (runner.js), with the last day from the
      notice; the last day still takes effect by itself (links.js applyDueSeparations).
   2. Clearance is routed: HR sets who signs each clearance step (Exit clearance > Who signs clearance, org/ops.clrTo). The notice
      job emails each signer their steps with a one-tap link (#clr=<empId>:<step>); the link opens the offboarding record and
      asks "Mark as cleared?". When every clearance step before final pay is done, the approvers are told the final pay can be
      released. Final pay itself is computed from the 201 file and payroll as before (talent.js finalPay). */
async function offbJob() {
  if (!S.realEdit || !S.canEdit || !S.resigns || !S.offb) return;
  for (const r of listOf(S.resigns)) {
    if (r.status !== "ACCEPTED" || !r.last || S.offb.has(r.empId) || r.offbAuto) continue; const e = S.emps.get(r.empId); if (!e || e.separated || r.last < e.hire) continue;
    const o = { id: e.id, empId: e.id, notice: r.filed || todayISO(), last: r.last, reason: "Resignation", cause: null, notes: r.reason ? String(r.reason).slice(0, 500) : null,
      items: TSET().offboard.map(({ k, label, who }) => ({ k, label, who, done: k === "notice" ? r.filed || todayISO() : null })), pay: {}, released: null, closed: null, auto: true };
    await put("offboard", o); await put("resign", { ...r, offbAuto: todayISO() });
    logActivity(`Started offboarding for ${fullName(e)} by itself: resignation accepted, last day ${fmtDate(r.last)}`);
    if (r.last <= todayISO()) await markSeparated(e.id, true);
  }
}
RUN_JOBS.push(["offb", "Offboarding from accepted resignations", () => offbJob()]);

/* Who signs each clearance step */
const clrWhos = () => [...new Set(TSET().offboard.map((i) => i.who).filter(Boolean))];
{ const k = VIEWS.offboarding ? "offboarding" : "lifecycle"; const b = VIEWS[k]; VIEWS[k] = (...x) => { const h = b(...x); if (!S.canEdit || (k === "lifecycle" && (S.lifeTab || "onboard") !== "offboard")) return h;
  const to = OPS().clrTo || {}; const users = opUserIds();
  return h + `<section class="card"><div class="card-head"><h2>${icon("door", 18)} Who signs clearance</h2></div>
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">Each person gets an email with their clearance steps and a one-tap link to mark them cleared. Steps with no one set stay with HR.</p>
    <form id="clr-form" class="form-grid">${clrWhos().map((w, i) => `<div class="field"><label for="clr-${i}">${esc(w)}</label><select class="input" id="clr-${i}" name="${esc(w)}">${opts(users.map((u) => [u, personName(u)]), to[w] || "", "HR (no one set)")}</select></div>`).join("")}
    <div class="field" style="align-self:end"><button class="btn btn-primary" type="submit">Save</button></div></form></section>`; }; }
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "clr-form") return; ev.preventDefault(); if (!S.canEdit) return;
  const f = new FormData(ev.target); const clrTo = {}; for (const w of clrWhos()) { const u = f.get(w); if (u) clrTo[w] = String(u); }
  const next = { ...(S.ops || {}), clrTo }; try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity("Updated who signs each clearance step"); toast("Saved."); render(); } catch { toast("Couldn't save. Try again."); }
});

/* One-tap clearance link: #clr=<empId>:<step key> */
const CLR_KEY = "hr-clr";
{ const m = /[#&]clr=([^&]+)/.exec(location.hash || ""); if (m) { try { sessionStorage.setItem(CLR_KEY, decodeURIComponent(m[1])); } catch {} history.replaceState(null, "", location.pathname + location.search); } }
window.addEventListener("hashchange", () => { const m = /[#&]clr=([^&]+)/.exec(location.hash || ""); if (!m) return; try { sessionStorage.setItem(CLR_KEY, decodeURIComponent(m[1])); } catch {} history.replaceState(null, "", location.pathname + location.search); clrTry(); });
let clrBusy = false;
async function clrTry() {
  let v = null; try { v = sessionStorage.getItem(CLR_KEY); } catch {} if (!v || clrBusy || !S.db || !S.loaded?.emps || !S.offb) return;
  clrBusy = true; try { sessionStorage.removeItem(CLR_KEY); } catch {}
  try {
    const [empId, k] = v.split(":"); const o = S.offb.get(empId); const e = S.emps.get(empId);
    if (!o || !e) { toast("That offboarding record was not found."); return; } go("offboard", { id: empId }); await new Promise((r) => setTimeout(r, 300));
    const i = o.items.findIndex((x) => x.k === k); if (i < 0) return; const it = o.items[i];
    if (it.done) { toast(`"${it.label}" was already cleared on ${fmtDate(it.done)}.`); return; }
    if (!S.canEdit) { toast("Ask HR to mark this step cleared."); return; }
    if (!(await askConfirm(`Mark "${it.label}" as cleared for ${fullName(e)}?`, "Cleared"))) return;
    await toggleCheck("offboard", empId, i, true); logActivity(`Cleared "${it.label}" for ${fullName(e)} from the clearance email`); toast("Marked as cleared.");
  } finally { clrBusy = false; }
}
{ const b = render; render = (...a) => { const r = b(...a); if (!clrBusy) { let v = null; try { v = sessionStorage.getItem(CLR_KEY); } catch {} if (v) setTimeout(clrTry, 0); } return r; }; }
