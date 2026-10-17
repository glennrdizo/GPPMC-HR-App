/* ---------- Timekeeping to payroll, automatic (Glenn 2026-10-17) ----------
   Open cutoffs' time sheets fill themselves from the daily time records (punches, approved OT/OB/undertime/schedule changes,
   work suspensions, discipline suspensions), so the payroll worked out from them is always current. Approved leave already
   reaches payroll on its own (PAY.run reads the leave records; unpaid leave is deducted).
   Each row keeps the last values filled in (row.dtrAuto). A box HR changes by hand differs from it and is never overwritten;
   "Load from daily time records" still replaces everything. Runs in the browser of any HR editor who has the app open. */
const tkAutoOn = () => SET().tkAuto !== false;
const TK_F = ["abs", "late", "ut", "ot", "rd", "rhw", "sh", "rdot", "rhot", "rhrd", "dhw", "rhrdot", "dhot", "shrd", "shrdot", "nd"];
S.tkAuto = { at: null, ver: -1, busy: false, n: 0, kept: 0 };
const tkOpenCutoffs = () => { const t = todayISO(); const cur = curPeriod(); const prev = PAY.periodOf(addDays(PAY.period(cur).start, -1)); return [prev, cur].filter((id) => !isFinal(id) && PAY.period(id).start <= t); };
const tkSame = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
// What the automatic fill would change in one cutoff: { patch, n (people changed), kept (boxes kept as typed) }.
function tkAutoPatch(pid, force) {
  const x = dtrSheet(pid); const rows = periodDoc(pid).rows || {}; const patch = {}; let kept = 0;
  for (const [id, v] of Object.entries(x.patch)) { const cur = rows[id] || {}; const last = cur.dtrAuto || null; const out = {}; let ch = false;
    for (const k of TK_F) { const nv = v[k] || 0;
      const typed = !force && (last ? !tkSame(cur[k], last[k]) : !!cur[k] && !tkSame(cur[k], nv)); // changed by hand since the last fill (or typed before automation)
      if (typed) { kept++; continue; }
      if (!tkSame(cur[k], nv)) { out[k] = nv; ch = true; } }
    const auto = Object.fromEntries(TK_F.map((k) => [k, v[k] || 0]));
    if (ch || !last || TK_F.some((k) => !tkSame(last[k], auto[k]))) patch[id] = { ...out, dtrAuto: auto }; }
  return { patch, n: Object.values(patch).filter((r) => Object.keys(r).length > 1).length, kept, people: x.people, noOut: x.noOut };
}
async function tkAutoSync(opts = {}) {
  const A = S.tkAuto; if (A.busy || !S.db || !S.realEdit || !S.canEdit || S.selfMode || !tkAutoOn()) return;
  if (!opts.force && A.ver === S.ver) return;
  A.busy = true; A.err = false; let changed = 0, kept = 0;
  try {
    for (const pid of opts.pid ? [opts.pid] : tkOpenCutoffs()) { if (isFinal(pid)) continue; const p = PAY.period(pid);
      const to = p.end < todayISO() ? p.end : todayISO();
      try { await loadClock(p.start, to, !!opts.reload); } catch {}
      // Never fill from half-read punches (a dropped connection would turn worked days into absences).
      if (!S.clockLoaded.has(`${p.start}:${to}`)) { A.err = true; continue; }
      const r = tkAutoPatch(pid); kept += r.kept;
      if (Object.keys(r.patch).length) { S.auSys = "Automatic time sheet"; try { await savePeriodRows(pid, r.patch); } finally { S.auSys = null; } changed += r.n; } }
    A.at = new Date().toISOString(); A.n = changed; A.kept = kept;
  } finally { A.ver = S.ver; A.busy = false; }
  if (changed && ["attendance", "payroll", "payslips"].includes(baseView(S.view?.name || "")) && !S.dirty && !document.activeElement?.closest?.("#ts-rows")) render();
}
// Every 20 s: refresh when anything changed (punches, approvals, leave, roster); every 10 min re-read the phones and kiosks too.
{ const b = bootIO; bootIO = (db) => { b(db); let k = 0; setTimeout(function tick() { k++; tkAutoSync({ force: k % 30 === 0, reload: k % 30 === 0 }).catch(() => {}); setTimeout(tick, 20000); }, 12000); }; }
// Payroll is finalized on the latest time records.
{ const b = finalizePayroll; finalizePayroll = async (id) => { if ($("#final-ok")?.checked && !isFinal(id) && tkAutoOn() && S.realEdit) { for (let i = 0; S.tkAuto.busy && i < 100; i++) await new Promise((r) => setTimeout(r, 200)); S.tkAuto.err = false; try { await tkAutoSync({ pid: id, force: true, reload: true }); } catch { S.tkAuto.err = true; }
    if (S.tkAuto.err && !(await askConfirm("The latest time records couldn't be read, so the time sheet may be out of date. Finalize anyway?", "Finalize anyway"))) return; }
  return b(id); }; }
// The manual button also records what it filled, so later automatic updates know which boxes HR changed.
{ const b = savePeriodRows; savePeriodRows = async (id, patch) => { if (S.tkManualFill) { for (const [k, v] of Object.entries(patch)) if (v && TK_F.every((f) => f in v)) patch[k] = { ...v, dtrAuto: Object.fromEntries(TK_F.map((f) => [f, v[f] || 0])) }; } return b(id, patch); }; }
{ const b = lkLoadDtr; lkLoadDtr = async (pid) => { S.tkManualFill = true; try { return await b(pid); } finally { S.tkManualFill = false; } }; }
const tkNote = (id) => { if (isFinal(id) || !S.realEdit) return ""; const A = S.tkAuto; const on = tkAutoOn();
  const when = A.at ? timeFmt.format(new Date(A.at)) : "";
  return `<div class="notice" id="tk-auto"><span>${icon("clock", 16)} ${on ? `<b>Filled automatically from the daily time records.</b> Absences, lateness, undertime, approved overtime, rest day, holiday and night hours update as punches come in and requests are approved; approved leave is counted by payroll.${when ? ` Last checked ${esc(when)}.` : ""}${A.kept ? ` ${A.kept} ${A.kept === 1 ? "box" : "boxes"} you changed by hand ${A.kept === 1 ? "is" : "are"} kept.` : ""}` : "<b>Automatic fill is off.</b> Use Load from daily time records to fill the time sheet."}</span>
    ${S.canEdit ? `<label style="display:flex;gap:8px;align-items:center;white-space:nowrap;font-size:14px"><input type="checkbox" id="tk-auto-on" ${on ? "checked" : ""}> Fill automatically</label>` : ""}</div>`; };
{ const b = VIEWS.attendance; VIEWS.attendance = () => { const html = b(); const id = S.periodId || curPeriod(); const n = tkNote(id); return n ? html.replace('<section class="stats">', n + '<section class="stats">') : html; }; }
{ const b = VIEWS.payroll; VIEWS.payroll = (...a) => { const html = b(...a); const id = S.periodId || curPeriod(); if (isFinal(id) || !S.realEdit || !tkAutoOn()) return html; const i = html.indexOf("<section");
    return i < 0 ? html : html.slice(0, i) + `<div class="notice"><span>${icon("clock", 16)} Days, lateness, undertime, overtime and leave come straight from Timekeeping and update on their own. <button class="link" data-go="attendance">See the time sheet</button></span></div>` + html.slice(i); }; }
document.addEventListener("change", async (ev) => { if (ev.target.id !== "tk-auto-on" || !S.canEdit) return; const on = ev.target.checked;
  await saveSettings({ tkAuto: on }, on ? "Turned on the automatic time sheet from the daily time records" : "Turned off the automatic time sheet from the daily time records");
  if (on) { await tkAutoSync({ force: true }); } render(); });
