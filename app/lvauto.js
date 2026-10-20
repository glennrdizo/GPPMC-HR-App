/* ---------- Leave year-end on its own (Glenn 2026-10-20: full automation; balances refresh every January 15, no carry-over) ----------
   Leave credits are earned and refreshed by themselves (time.js leaveCredit over the leave year). On the reset day the
   scheduled run (runner.js) records the year-end list for the leave year that just ended (as "Record the conversion" does on
   Leave year-end) and, where the leave policy converts unused leave to cash, pays it in the first open cutoff: up to 10 VL days
   a year tax-free (de minimis), the rest counted with the 13th month and other benefits. Leave years before 2026 are left to HR. */
const LVA_FROM = "2026";
const lvaPid = () => { let id = curPeriod(); for (let i = 0; i < 4 && isFinal(id); i++) id = PAY.shiftPeriod(id, 1); return id; };
async function lvAutoJob() {
  if (!S.realEdit || !S.canEdit || !S.lvye) return; const y = String(Number(leaveYear(todayISO())) - 1);
  if (y < LVA_FROM || S.lvye.has(y) || todayISO() <= lyEnd(y)) return;
  const rows = lvYearEnd(y); const total = PAY.r2(rows.reduce((a, r) => a + r.amt, 0)); const payPid = total ? lvaPid() : null;
  const doc = { year: y, at: new Date().toISOString(), by: null, auto: true, total, payPid, rows: rows.map((r) => ({ empId: r.e.id, vl: r.vl, sl: r.sl, cVL: r.cVL, cSL: r.cSL, conv: r.conv, daily: r.daily, amt: r.amt })) };
  await S.db.doc(`lvye/${y}`).set(JSON.parse(JSON.stringify(doc))); S.lvye.set(y, doc); S.ver++;
  logActivity(`Recorded the ${y} leave year-end by itself${total ? `; ${peso.format(total)} of converted leave goes into the ${PAY.period(payPid).label} payroll` : ""}`);
}
RUN_JOBS.push(["lvye", "Leave year-end", () => lvAutoJob()]);
/* Converted leave in payroll: paid through the same list as FlexBen claims, with its own id (lv:<year>:<employee>). */
{ const b = payExt; payExt = (pid) => { const x = b(pid); const ff = x.flexFor; return { ...x, flexFor: (e, p) => {
  const out = ff ? ff(e, p) : [];
  for (const d of S.lvye?.values?.() || []) { if (d.payPid !== pid) continue; const r = (d.rows || []).find((z) => z.empId === e.id); if (!r?.amt) continue;
    const dm = PAY.r2(Math.min(r.amt, Math.min(10, Math.max(0, (r.vl || 0) - (r.cVL || 0))) * (r.daily || 0)));
    if (dm) out.push({ id: `lv:${d.year}:${e.id}:d`, amt: dm, tax: "DEMIN" }); if (r.amt - dm > 0) out.push({ id: `lv:${d.year}:${e.id}:b`, amt: PAY.r2(r.amt - dm), tax: "BENEFIT" }); }
  return out; } }; }; }
function lvOf(l) { let t = 0; for (const id of l?.flex || []) { const m = /^lv:(\d{4}):([^:]+):([db])$/.exec(String(id)); if (!m) continue; const r = (S.lvye.get(m[1])?.rows || []).find((z) => z.empId === m[2]); if (!r) continue;
  const dm = PAY.r2(Math.min(r.amt, Math.min(10, Math.max(0, (r.vl || 0) - (r.cVL || 0))) * (r.daily || 0))); t += m[3] === "d" ? dm : PAY.r2(r.amt - dm); } return PAY.r2(t); }
/* Leave year-end page: say what the scheduled run did. */
{ const b = VIEWS.lvye; VIEWS.lvye = (...a) => { const h = b(...a); const rec = S.lvye.get(S.lvyeY); if (!rec?.auto) return h;
  const note = `<div class="notice"><span><span class="chip c-blue">Recorded by itself</span> The scheduled run recorded this list on ${fmtDate(rec.at.slice(0, 10))}, the day after the leave year ended.${rec.payPid ? ` The converted leave is paid in the ${esc(PAY.period(rec.payPid).label)} payroll.` : ""}</span></div>`;
  const i = h.indexOf('<section class="card"'); return i >= 0 ? h.slice(0, i) + note + h.slice(i) : h + note; }; }
