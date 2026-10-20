/* ---------- v59 Phase 3 automation (Glenn 2026-10-12): leave earned monthly, carry-over and year-end conversion;
   yearly review, document expiry and training renewal reminders; training auto-enrolment; applicant shortlist scoring. ---------- */
const LVP_DEF = { mode: "YEAR", reset: "01-15", carry: { VL: 0, SL: 0 }, conv: { VL: false, SL: false }, annual: true }; // Glenn 2026-10-20: no carry-over and no cash conversion; unused leave lapses when balances refresh every January 15
const LVP = () => { const o = S.ops?.lvp || {}; return { ...LVP_DEF, ...o, carry: { ...LVP_DEF.carry, ...(o.carry || {}) }, conv: { ...LVP_DEF.conv, ...(o.conv || {}) } }; };
const lvMonthEnd = (iso) => { const [y, m] = iso.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
/* Earned monthly: this year's VL and SL count only the months already completed (credited at each month end). */
{ const base = leaveCredit; leaveCredit = (e, t, year) => {
  if (LVP().mode !== "MONTH" || t.days == null || !["VL", "SL"].includes(t.code)) return base(e, t, year);
  const y = String(year), today = todayISO(), ly = leaveYear(today); if (y < ly) return base(e, t, year); if (y > ly) return 0;
  const cut = today === lvMonthEnd(today) ? today : addDays(`${today.slice(0, 7)}-01`, -1); if (cut < lyStart(y)) return 0;
  const out = e.separated?.date || S.offb?.get(e.id)?.last || null; const stop = out && out < cut ? out : cut;
  if (e.hire && e.hire > stop) return 0; return base({ ...e, separated: { ...(e.separated || {}), date: stop } }, t, year); }; }
/* Carry-over: unused VL and SL from last year, up to the cap, are added to this year's credits. */
{ const base = balances; const carried = (e, year) => { const P = LVP(); const rows = base(e, year); if (!(P.carry.VL > 0 || P.carry.SL > 0)) return rows;
  // Last year's balance includes what it carried in itself (from 2026, when the app started), so carry-over chains year to year.
  if (!e.hire || e.hire >= lyStart(year)) return rows; let prev = []; try { const py = String(Number(year) - 1); prev = Number(py) > 2026 ? carried(e, py) : base(e, py); } catch {}
  return rows.map((t) => { const cap = Number(P.carry[t.code]) || 0; if (!cap || t.left == null) return t; const p = prev.find((x) => x.code === t.code); const c = Math.min(cap, Math.max(0, p?.left || 0)); if (!c) return t;
    return { ...t, carry: c, days: (t.days || 0) + c, credit: (t.credit || 0) + c, left: (t.left || 0) + c }; }); }; balances = carried; }
const dailyOf = (e) => (e.payType === "DAILY" ? e.basicPay || 0 : ((e.basicPay || 0) * 12) / (SET().factor || 313));
function lvYearEnd(year) { const P = LVP(); const rows = [];
  for (const e of [...(S.allEmps || S.emps).values()]) { if (e.hire && e.hire > lyEnd(year)) continue; if (e.separated?.date && e.separated.date < lyStart(year)) continue; let b = []; try { b = balances(e, year); } catch { continue; }
    const vl = b.find((x) => x.code === "VL")?.left || 0, sl = b.find((x) => x.code === "SL")?.left || 0; if (!vl && !sl) continue;
    const gone = !!e.separated?.date && e.separated.date <= lyEnd(year);
    const cVL = gone ? 0 : Math.min(Number(P.carry.VL) || 0, vl), cSL = gone ? 0 : Math.min(Number(P.carry.SL) || 0, sl);
    const conv = (P.conv.VL ? vl - cVL : 0) + (P.conv.SL ? sl - cSL : 0); const daily = dailyOf(e);
    rows.push({ e, vl, sl, cVL, cSL, lapse: PAY.r2(vl - cVL + sl - cSL - conv), conv: PAY.r2(conv), daily: PAY.r2(daily), amt: gone ? 0 : PAY.r2(conv * daily), gone }); }
  return rows.sort((a, b) => fullName(a.e).localeCompare(fullName(b.e))); }
Object.assign(S, { lvye: new Map(), lvyeY: String(Number(leaveYear(todayISO())) - (todayISO() < addDays(lyStart(leaveYear(todayISO())), 180) ? 1 : 0)), shortN: {} });
VIEWS.lvye = () => {
  const y = S.lvyeY; const P = LVP(); const rows = lvYearEnd(y); const rec = S.lvye.get(y); const ed = S.canEdit; const cur = y === leaveYear(todayISO()); const tot = (f) => PAY.r2(rows.reduce((a, r) => a + r[f], 0));
  const years = [0, 1, 2].map((i) => String(Number(leaveYear(todayISO())) - i));
  return head("Leave", "Leave year-end", `<button class="btn btn-ghost" data-lvye-csv="${y}">Download (CSV)</button>`) + `
    <section class="card" style="padding-bottom:12px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(y, "lvye-y", years.map((x) => [x, x]))}
      <span class="t-muted" style="font-size:14px">${P.mode === "MONTH" ? "VL and SL are earned monthly" : `VL and SL are credited in full each leave year (from ${fmtDate(lyStart(y))} to ${fmtDate(lyEnd(y))})`} · carry over up to ${P.carry.VL} VL and ${P.carry.SL} SL days · converted to cash: ${[P.conv.VL && "VL", P.conv.SL && "SL"].filter(Boolean).join(" and ") || "none"}</span></div></section>
    <section class="stats kpis">${dxTile("Unused VL", tot("vl"), "days")}${dxTile("Unused SL", tot("sl"), "days")}${dxTile("Carried over", PAY.r2(tot("cVL") + tot("cSL")), `days into ${Number(y) + 1}`)}${dxTile("Converted to cash", peso.format(tot("amt")), `${tot("conv")} days`, "t-warn")}</section>
    <section class="card"><div class="card-head"><h2>Unused leave for ${y}</h2>${cur && !rec ? '<span class="t-muted" style="font-size:13px">So far: the year is not over yet</span>' : ""}${rec ? `<span class="chip c-ok">Recorded ${fmtDate(rec.at.slice(0, 10))} · ${peso.format(rec.total || 0)}</span>` : ed && rows.length && (!cur || todayISO() >= addDays(lyEnd(y), -30)) ? `<button class="btn btn-primary btn-sm" data-lvye-rec="${y}">Record the conversion</button>` : ""}</div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Unused VL</th><th class="num">Unused SL</th><th class="num">Carried over</th><th class="num">Lapses</th><th class="num">Converted days</th><th class="num">Daily rate</th><th class="num">Cash</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((r) => `<tr><td>${empCell(r.e, r.gone ? "Separated (paid in final pay)" : undefined)}</td><td class="num">${r.vl}</td><td class="num">${r.sl}</td><td class="num">${PAY.r2(r.cVL + r.cSL)}</td><td class="num">${r.lapse}</td><td class="num">${r.conv}</td><td class="num">${money(r.daily)}</td><td class="num"><b>${money(r.amt)}</b></td></tr>`).join("") || '<tr><td colspan="8" class="empty">No unused VL or SL for this year.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Recording saves this list with the date and your name, so payroll can pay it and the carry-over is fixed. Up to 10 days of converted VL a year are tax-free de minimis; the rest counts toward the ₱90,000 cap.</p></section>
    ${ed ? `<form id="lvp-form" class="card"><div class="card-head"><h2>Leave policy</h2></div><div class="form-grid">
      <div class="field"><label for="lvp-mode">How VL and SL are credited</label><select class="input" id="lvp-mode" name="mode"><option value="YEAR" ${P.mode === "YEAR" ? "selected" : ""}>In full each leave year (prorated for new hires)</option><option value="MONTH" ${P.mode === "MONTH" ? "selected" : ""}>Earned monthly, credited at each month end</option></select></div>
      <div class="field"><label for="lvp-reset">Balances refresh every</label><input class="input" id="lvp-reset" name="reset" type="date" value="${todayISO().slice(0, 4)}-${lvReset()}"><span class="t-muted" style="font-size:12px">Only the month and day are used. Every leave balance starts again on this day each year.</span></div>
      <div class="field"><label for="lvp-cvl">VL days carried to next year (max)</label><input class="input" id="lvp-cvl" name="cVL" type="number" min="0" max="60" step="0.5" value="${P.carry.VL}"></div>
      <div class="field"><label for="lvp-csl">SL days carried to next year (max)</label><input class="input" id="lvp-csl" name="cSL" type="number" min="0" max="60" step="0.5" value="${P.carry.SL}"></div>
      <label class="check"><input type="checkbox" name="convVL" ${P.conv.VL ? "checked" : ""}><span>Convert unused VL (not carried) to cash</span></label>
      <label class="check"><input type="checkbox" name="convSL" ${P.conv.SL ? "checked" : ""}><span>Convert unused SL (not carried) to cash</span></label>
      <label class="check"><input type="checkbox" name="annual" ${P.annual ? "checked" : ""}><span>Remind yearly performance reviews on each hire anniversary</span></label></div>
      <button class="btn btn-primary" type="submit">Save policy</button></form>` : ""}`;
};
{ const tk = NAV.find(([n]) => n === "Timekeeping"); if (tk) { const i = tk[1].findIndex(([v]) => v === "leave"); tk[1].splice(i >= 0 ? i + 1 : tk[1].length, 0, ["lvye", "Leave year-end", "cal"]); } SECTION_OF.lvye = "lvye"; }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-lvye-y],[data-lvye-csv],[data-lvye-rec],[data-trs-need],[data-short-more]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.lvyeY) { S.lvyeY = d.lvyeY; render(); return; }
  if (d.lvyeCsv) { const rows = lvYearEnd(d.lvyeCsv); offer(`leave-year-end-${d.lvyeCsv}.csv`, toCSV([["Employee No", "Name", "Unused VL", "Unused SL", "Carried VL", "Carried SL", "Lapses", "Converted days", "Daily rate", "Cash"], ...rows.map((r) => [r.e.no, fullName(r.e), r.vl, r.sl, r.cVL, r.cSL, r.lapse, r.conv, r.daily, r.amt])])); return; }
  if (d.lvyeRec && S.realEdit) { const y = d.lvyeRec; const rows = lvYearEnd(y); const total = PAY.r2(rows.reduce((a, r) => a + r.amt, 0));
    if (!(await askConfirm(`Record ${y} leave conversion: ${rows.filter((r) => r.amt).length} employees, ${peso.format(total)}?`, "Record"))) return;
    const doc = { year: y, at: new Date().toISOString(), by: S.myId || null, total, rows: rows.map((r) => ({ empId: r.e.id, vl: r.vl, sl: r.sl, cVL: r.cVL, cSL: r.cSL, conv: r.conv, daily: r.daily, amt: r.amt })) };
    try { await S.db.doc(`lvye/${y}`).set(JSON.parse(JSON.stringify(doc))); S.lvye.set(y, doc); S.ver++; logActivity(`Recorded the ${y} leave conversion (${peso.format(total)})`); toast("Recorded."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.trsNeed && S.realEdit) { const s = S.sessions.get(d.trsNeed); const c = S.courses.get(s?.courseId); if (!s || !c) return;
    const att = { ...(s.att || {}) }; const want = active().filter((e) => !att[e.id] && needs(c, e) && trainState(c, e) !== "OK").sort((a, b) => (c.recs?.[a.id]?.exp || "").localeCompare(c.recs?.[b.id]?.exp || ""));
    const room = s.cap ? Math.max(0, s.cap - Object.keys(att).length) : want.length; const pick = want.slice(0, room); if (!pick.length) { toast(want.length ? "No seats left." : "Everyone who needs this course is already enrolled or current."); return; }
    if (!(await askConfirm(`Enroll ${pick.length} ${pick.length === 1 ? "person" : "people"} who need ${c.title}${want.length > pick.length ? ` (${want.length - pick.length} more wait for the next session)` : ""}?`, "Enroll"))) return;
    for (const e of pick) att[e.id] = "ENROLLED"; await put("sessions", { ...s, att }); logActivity(`Enrolled ${pick.length} who need it in ${sesTitle(s)} on ${fmtDate(s.d)}`); toast(`Enrolled ${pick.length}.`); render(); return; }
  if (d.shortMore) { S.shortN[d.shortMore] = (S.shortN[d.shortMore] || 8) + 20; render(); }
});
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "lvp-form") return; ev.preventDefault(); if (!S.realEdit) return; const f = new FormData(ev.target);
  const rs = String(f.get("reset") || "").slice(5, 10); const lvp = { mode: f.get("mode") === "MONTH" ? "MONTH" : "YEAR", reset: /^\d{2}-\d{2}$/.test(rs) ? rs : "01-15", carry: { VL: Math.max(0, Number(f.get("cVL")) || 0), SL: Math.max(0, Number(f.get("cSL")) || 0) }, conv: { VL: !!f.get("convVL"), SL: !!f.get("convSL") }, annual: !!f.get("annual") };
  const next = { ...(S.ops || {}), lvp }; try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity("Updated the leave policy"); toast("Leave policy saved."); render(); } catch { toast("Couldn't save. Try again."); }
});
/* Session page: enroll everyone who needs the course, soonest expiry first, up to the seats */
{ const b = VIEWS.trsession; if (b) VIEWS.trsession = (...a) => { const h = b(...a); const s = S.sessions.get(S.view.id); if (!s || s.status !== "PLANNED" || !S.canEdit) return h;
  return h.replace('<h2>Enroll people</h2>', `<h2>Enroll people</h2><button class="btn btn-primary btn-sm" data-trs-need="${s.id}">Enroll everyone who needs it</button>`); }; }

/* ---------- reminders: yearly review on the hire anniversary, document expiry, training certificate renewal ---------- */
Object.assign(REM_KIND, { ANNUAL: ["Yearly performance review", "star"], DOCEXP: ["Document expiring", "file"], TRAINEXP: ["Training certificate renewal", "cap"] });
{ const base = remList; let cache = { v: -1, list: [] }; remList = () => { if (cache.v === S.ver) return cache.list; const out = [...base()]; const today = todayISO(); const lead = remLead(); const P = LVP();
  const add = (r) => { const dn = S.remDone.get(remKey(r.key)); out.push({ ...r, from: r.from || addDays(r.due, -lead), done: r.auto || dn?.done || null, by: dn?.by || null, sent: dn?.sent || [] }); };
  for (const e of active()) { const nm = fullName(e);
    if (P.annual && e.status === "REGULAR" && e.hire && e.hire < addDays(today, -300)) { let due = `${today.slice(0, 4)}${e.hire.slice(4)}`; if (due < addDays(today, -60)) due = `${Number(today.slice(0, 4)) + 1}${e.hire.slice(4)}`;
      if (due <= addDays(today, 30)) { const done = reviewsOf(e.id).find((r) => r.type === "ANNUAL" && (r.at || r.d || "").slice(0, 10) >= addDays(due, -90)); const ev = S.emps.get(e.supervisorId) || null;
        add({ key: `ANNUAL:${e.id}:${due.slice(0, 4)}`, kind: "ANNUAL", e, ev, due, from: addDays(due, -30), title: "Yearly performance review", to: ["HR", "EVAL"], auto: done ? (done.at || done.d || today) : null, act: "annual",
          msg: { HR: `${nm}'s yearly performance review is due on ${fmtDate(due)} (hire anniversary).`, EVAL: `Please complete the yearly performance review of ${nm} by ${fmtDate(due)}.`, EMP: `Your yearly performance review is due on ${fmtDate(due)}.` } }); } }
    for (const d of e.docs || []) { if (!d.exp || d.exp > addDays(today, 30)) continue;
      add({ key: `DOC:${e.id}:${d.id}:${d.exp}`, kind: "DOCEXP", e, due: d.exp, from: addDays(d.exp, -30), title: `${d.kind || "Document"} expires`, to: ["HR", "EMP"], act: "doc",
        msg: { HR: `${nm}'s ${d.kind || "document"} (${d.name}) expires on ${fmtDate(d.exp)}. Ask for a renewed copy.`, EMP: `Your ${d.kind || "document"} on file with HR expires on ${fmtDate(d.exp)}. Please submit a renewed copy.` } }); } }
  try { for (const c of listOf(S.courses)) { if (!c.valid) continue; for (const e of active()) { const r = c.recs?.[e.id]; if (!r?.exp || r.exp > addDays(today, 30) || !needs(c, e)) continue;
    const ses = listOf(S.sessions).find((s) => s.courseId === c.id && s.status === "PLANNED" && s.att?.[e.id]);
    add({ key: `TRAIN:${e.id}:${c.id}:${r.exp}`, kind: "TRAINEXP", e, due: r.exp, from: addDays(r.exp, -30), title: `${c.title} renewal`, to: ["HR", "EMP"], auto: ses ? ses.d : null, act: "train",
      msg: { HR: `${fullName(e)}'s ${c.title} expires on ${fmtDate(r.exp)}. Enroll them in the next session.`, EMP: `Your ${c.title} expires on ${fmtDate(r.exp)}. HR will enroll you in a refresher.` } }); } } } catch {}
  out.sort((a, b) => a.due.localeCompare(b.due)); cache = { v: S.ver, list: out }; return out; }; }

/* ---------- applicant fit score and suggested shortlist on each job ---------- */
const SHORT_STOP = new Set("and the for with from that this into your our are has have will must can of in on at to a an or as by be is it its per".split(" "));
function appFit(a, j) {
  const parts = []; const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 2 && !SHORT_STOP.has(w));
  const tv = (t) => (t.of > 0 && t.score != null ? Math.min(1, t.score / t.of) : t.result === "PASSED" ? 1 : t.result === "FAILED" ? 0 : null);
  const tests = (a.tests || []).map(tv).filter((v) => v != null); if (tests.length) parts.push(["Tests", 35, tests.reduce((s, v) => s + v, 0) / tests.length]);
  const ivs = (a.ivs || []).filter((i) => i.result); if (ivs.length) parts.push(["Interviews", 30, ivs.filter((i) => i.result === "PASSED").length / ivs.length]);
  const want = new Set(words(`${j.title} ${j.desc || ""} ${(j.skills || []).join(" ")}`)); const have = words(`${(a.skills || []).join(" ")} ${a.notes || ""}`);
  if (want.size && have.length) parts.push(["Skills match", 15, Math.min(1, new Set(have.filter((w) => want.has(w))).size / Math.min(5, want.size))]);
  const qs = j.questions?.length ? j.questions : DEF_QUESTIONS; const ans = a.answers || {}; if (Object.keys(ans).length) parts.push(["Questions answered", 10, qs.filter((q) => String(ans[q] || "").trim()).length / qs.length]);
  if (a.expRate && j.rate) parts.push(["Salary fit", 10, a.expRate <= j.rate ? 1 : Math.max(0, 1 - (a.expRate - j.rate) / j.rate / 0.3)]);
  const docs = typeof PRE_REQS !== "undefined" ? PRE_REQS.filter(([k]) => a.reqs?.[k]).length / PRE_REQS.length : 0; if (docs) parts.push(["Requirements", 10, docs]);
  const w = parts.reduce((s, p) => s + p[1], 0); return { score: w >= 25 ? Math.round((parts.reduce((s, p) => s + p[1] * p[2], 0) / w) * 100) : null, parts };
}
{ const b = VIEWS.job; VIEWS.job = (...x) => { const h = b(...x); const j = S.jobs.get(S.view.id); if (!j) return h;
  const apps = listOf(S.apps).filter((a) => a.jobId === j.id && !["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage) && !a.refused && !a.blacklist).map((a) => ({ a, ...appFit(a, j) })).filter((x) => x.score != null).sort((p, q) => q.score - p.score);
  if (!apps.length) return h; const n = Math.max(3, (j.slots || 1) * 3); const lim = S.shortN[j.id] || 8;
  return h + `<section class="card"><div class="card-head"><h2>${icon("star", 18)} Suggested shortlist</h2><span class="t-muted" style="font-size:13px">Top ${Math.min(n, apps.length)} of ${apps.length} by fit score</span></div>
    <div class="table-wrap"><table><thead><tr><th>Applicant</th><th>Stage</th><th class="num">Fit score</th><th>Based on</th></tr></thead><tbody>
    ${apps.slice(0, lim).map((x, i) => `<tr class="go" data-app="${x.a.id}" tabindex="0"><td><b>${esc(appName(x.a))}</b>${i < n ? ' <span class="chip c-ok">Shortlist</span>' : ""}</td><td>${esc(STAGES.find(([k]) => k === x.a.stage)?.[1] || x.a.stage)}</td><td class="num"><b>${x.score}</b></td><td class="t-muted" style="font-size:13px">${x.parts.map((p) => `${p[0]} ${Math.round(p[2] * 100)}%`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>
    ${apps.length > lim ? `<button class="link" data-short-more="${j.id}">Show more</button>` : ""}<p class="t-muted" style="font-size:13px;margin:8px 0 0">Score = tests 35%, interviews 30%, skills match 15%, questions answered, salary fit and requirements 10% each; only the parts with data count. A guide for the recruiter, not a decision.</p></section>`; }; }

{ const b = bootIO; bootIO = (db) => { b(db); db.collection("lvye").limit(20).onSnapshot((snap) => { S.lvye = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {}); }; }
