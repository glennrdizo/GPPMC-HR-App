/* ---------- Employee dashboard: HR's app shares each linked employee's own summary to clockins/{phone}/me/summary (only that employee can read it); the phone shows it as its home screen ---------- */
Object.assign(S, { meSum: undefined, meSumSub: false, meSynced: null, selfTab: "home" });
const shortText = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
function buildSummary(e) {
  const today = todayISO(); const y = today.slice(0, 4); const ctx = tkCtx(); const m0 = `${today.slice(0, 7)}-01`;
  // attendance this month up to yesterday
  loadClock(m0, today); const pd = punchDays(m0, today); const att = { present: 0, late: 0, absent: 0, leave: 0, lateMin: 0 };
  for (let d = m0; d < today; d = addDays(d, 1)) { const r = dayRec(e, d, pd.get(e.id)?.get(d), ctx); if (r.status === "in" || r.status === "late") att.present++; if (r.status === "late") { att.late++; att.lateMin += r.late; } if (r.status === "absent") att.absent++; if (r.status === "leave") att.leave++; }
  const week = []; for (let i = 0; i < 7; i++) { const d = addDays(today, i); const c = planCode(e, d); const hol = ctx.hol.get(d) || []; const lv = ctx.leaves.find((l) => l.empId === e.id && l.from <= d && l.to >= d); const sp = typeof suspOf === "function" ? suspOf(e, d) : null;
    week.push({ d, label: lv ? leaveType(lv.type)?.name || "Leave" : sp ? `Work suspended: ${sp.reason}` : hol.length ? hol.map((h) => h.name).join(", ") : codeLabel(c), kind: lv ? "leave" : sp ? "susp" : hol.length ? "hol" : c === "R" ? "rest" : "work" }); }
  const leave = balances(e, y).filter((b) => b.left != null && (b.used || /vacation|sick|service/i.test(b.name))).map((b) => ({ name: b.name, left: b.left, used: b.used }));
  const slips = essSlips(e).slice(0, 3).map((s) => ({ label: s.p.label, gross: PAY.r2(s.l.gross), ded: PAY.r2(s.l.gross - s.l.net), net: PAY.r2(s.l.net), final: !!s.final }));
  const loans = listOf(S.loans).filter((ln) => ln.empId === e.id && ln.status === "ACTIVE").map((ln) => ({ label: loanLabel(ln.id), bal: loanBal(ln), amort: ln.amort || 0, end: ln.end || null })).filter((x) => x.bal > 0);
  const t = typeof t13Of === "function" ? t13Of(e, y) : null;
  const reqs = [];
  const add = (what, st, d, note) => reqs.push({ what, st, d: d || "", note: note || "" });
  for (const l of allLeaves()) if (l.empId === e.id && l.from >= addDays(today, -60)) add(`${leaveType(l.type)?.name || "Leave"} ${fmtDate(l.from)}${l.to !== l.from ? ` to ${fmtDate(l.to)}` : ""}`, l.status, l.filed || l.from);
  for (const r of listOf(S.attReqs || new Map())) if (r.empId === e.id && (r.filed || "") >= addDays(today, -60)) add(`${AR_KIND[r.kind]?.[0] || "Attendance request"}: ${arText(r)}`, r.status, r.filed);
  for (const r of listOf(S.otReqs || new Map())) if (r.empId === e.id && (r.filed || r.d || "") >= addDays(today, -60)) add(`Overtime ${fmtDate(r.d)}, ${r.hours} h`, r.status, r.filed || r.d);
  for (const r of listOf(S.reimbs || new Map())) if (r.empId === e.id && (r.filed || "").slice(0, 10) >= addDays(today, -60)) add(`Reimbursement ${money(r.amt)}`, r.status, (r.filed || "").slice(0, 10));
  for (const r of listOf(S.certReqs || new Map())) if (r.empId === e.id && (r.filed || "") >= addDays(today, -60)) add("Certificate request", r.status, r.filed);
  reqs.sort((a, b) => b.d.localeCompare(a.d));
  const anns = listOf(S.anns || new Map()).filter((a) => !a.sample && annState(a) === "LIVE" && annFor(a, e)).sort(annSort).slice(0, 5).map((a) => ({ title: a.title || "", body: shortText(a.body, 500), cat: annCat(a.cat)[1], urgent: a.cat === "URGENT", from: a.from || a.at || "" }));
  const hols = SET().holidays.filter((h) => h.d >= today).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 3).map((h) => ({ d: h.d, name: h.name, type: h.type }));
  const req = listOf(S.courses || new Map()).filter((c) => needs(c, e)); const sup = S.emps.get(e.supervisorId);
  return { v: 1, first: e.first, name: fullName(e), no: e.no, pos: pos(e.posId)?.title || "", unit: e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office", dept: deptName(e), hire: e.hire, status: STATUS[e.status]?.[0] || "", sup: sup ? fullName(sup) : "",
    shift: shiftOf(e) ? `${shiftOf(e).start}–${shiftOf(e).end}` : "", att, week, leave, slips, loans, t13: t ? { est: t.t13, paid: t.paid } : null, reqs: reqs.slice(0, 8), anns, hols, train: req.length ? { ok: req.filter((c) => trainState(c, e) === "OK").length, n: req.length } : null };
}
/* ---------- HR side: keep every linked phone's summary current ---------- */
let meBusy = false;
async function syncSummaries() {
  if (meBusy || !S.realEdit || !S.db || !S.clockDevs?.size || !S.emps.size) return; meBusy = true;
  try {
    if (S.meSynced == null) { try { const d = await S.db.doc("org/medash").get(); S.meSynced = d.exists ? d.data().h || {} : {}; } catch { S.meSynced = {}; } }
    { const m0 = `${todayISO().slice(0, 7)}-01`; await loadClock(m0, todayISO()); }
    // Nothing changed since the last round on the same day: every summary would come out the same.
    const key = `${S.ver}|${todayISO()}`; if (key === S.meKey) return;
    const changed = {}; let i = 0;
    for (const d of S.clockDevs.values()) { if (d.kiosk || d.bio || d.adjust) continue; if (++i % 20 === 0) await new Promise((r) => setTimeout(r, 0)); /* let the page breathe */ const e = S.emps.get(S.clockLinks[d.id]); if (!e || e.sample) continue;
      const sum = buildSummary(e); const json = JSON.stringify(sum); let h = 0; for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
      if (S.meSynced[d.id] === h) continue; await S.db.doc(`clockins/${d.id}/me/summary`).set(JSON.parse(JSON.stringify({ ...sum, at: new Date().toISOString() }))); S.meSynced[d.id] = h; changed[d.id] = h; }
    if (Object.keys(changed).length) await S.db.doc("org/medash").set({ h: S.meSynced, at: new Date().toISOString() });
    S.meKey = key;
  } catch {} finally { meBusy = false; }
}
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { syncSummaries(); setTimeout(tick, 60000); }, 25000); }; }

/* ---------- shared dashboard sections (phone and the Employee view preview) ---------- */
const RQ_CHIP = { PENDING: ["Waiting", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-bad"], CANCELLED: ["Cancelled", "c-gray"], PAID: ["Paid", "c-ok"], READY: ["Ready", "c-blue"], RELEASED: ["Released", "c-ok"] };
function dashSections(s, go) {
  const tile = (ic, label, value, note, to) => `<${to ? `button data-${go}="${to}"` : "div"} class="card stat kpi${to ? " ess-tile" : ""}" style="text-align:left"><span class="kpi-ic" style="background:var(--blue-soft);color:var(--blue)">${icon(ic, 20)}</span><span class="label">${label}</span><span class="value" style="font-size:26px">${value}</span><span class="note t-muted">${note}</span></${to ? "button" : "div"}>`;
  const vl = s.leave.find((l) => /vacation/i.test(l.name)) || s.leave[0]; const sl = s.leave.find((l) => /sick/i.test(l.name)); const slip = s.slips[0];
  return `<section class="stats kpis ed-kpis">
      ${tile("pay", "Latest net pay", slip ? peso.format(slip.net) : "—", slip ? `${esc(slip.label)}${slip.final ? "" : " · not final"}` : "No payslip yet", go === "ess" ? "esspay" : "")}
      ${tile("cal", vl ? `${esc(vl.name)} left` : "Leave left", vl ? vl.left : "—", sl ? `${esc(sl.name)}: ${sl.left} left` : "this year", go === "ess" ? "essleave" : "")}
      ${tile("clock", "This month", `${s.att.present} days`, `${s.att.late} late · ${s.att.absent} absent`, go === "ess" ? "essatt" : "clock")}
      ${tile("gift", "13th month so far", s.t13 ? peso.format(s.t13.est) : "—", s.t13?.paid ? `${peso.format(s.t13.paid)} released` : "estimate for the year", "")}</section>
    ${s.anns.length ? `<section class="card"><div class="card-head"><h2>${icon("alert", 18)} Announcements</h2></div><ul class="ed-anns">${s.anns.map((a) => `<li${a.urgent ? ' class="urgent"' : ""}><b>${esc(a.title)}</b>${a.urgent ? ' <span class="chip c-bad">Urgent</span>' : ""}<small class="t-muted"> ${a.from ? fmtDate(a.from.slice(0, 10)) : ""}</small><p>${esc(a.body)}</p></li>`).join("")}</ul></section>` : ""}
    <div class="two"><section class="card"><div class="card-head"><h2>My week</h2>${s.shift ? `<span class="t-muted" style="font-size:13px">Usual shift ${esc(s.shift)}</span>` : ""}</div><ul class="ed-week">${s.week.map((w) => `<li class="${w.kind}"><span>${esc(new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(w.d)))}</span><b>${esc(w.label)}</b></li>`).join("")}</ul></section>
      <section class="card"><div class="card-head"><h2>My requests</h2>${go === "ess" ? '<button class="link" data-ess="essreq">File a request</button>' : ""}</div>${s.reqs.length ? `<ul class="ed-reqs">${s.reqs.map((r) => `<li><span>${esc(r.what)}</span><span class="chip ${(RQ_CHIP[r.st] || RQ_CHIP.PENDING)[1]}">${(RQ_CHIP[r.st] || [r.st])[0]}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0;font-size:14px">No requests in the last 60 days.</p>'}</section></div>
    <div class="two"><section class="card"><div class="card-head"><h2>My payslips</h2></div>${s.slips.length ? `<div class="table-wrap"><table class="ed-slips"><thead><tr><th>Cutoff</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net</th></tr></thead><tbody>${s.slips.map((p) => `<tr><td>${esc(p.label)}${p.final ? "" : ' <span class="chip c-gray">Draft</span>'}</td><td class="num">${money(p.gross)}</td><td class="num">${money(p.ded)}</td><td class="num"><b>${money(p.net)}</b></td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No payslips yet.</p>'}</section>
      <section class="card"><div class="card-head"><h2>My leave and loans</h2></div><ul class="ed-reqs">${s.leave.map((l) => `<li><span>${esc(l.name)}</span><span><b>${l.left}</b> left <small class="t-muted">(${l.used} used)</small></span></li>`).join("")}
        ${s.loans.map((x) => `<li><span>${esc(x.label)}<small class="t-muted"> · ${money(x.amort)} a cutoff${x.end ? `, ends ${esc(PAY.period(x.end).label || x.end)}` : ""}</small></span><span><b>${money(x.bal)}</b> left</span></li>`).join("")}</ul>${!s.loans.length ? '<p class="t-muted" style="margin:8px 0 0;font-size:13px">No active loans.</p>' : ""}</section></div>
    <div class="two"><section class="card"><div class="card-head"><h2>Coming holidays</h2></div>${s.hols.length ? `<ul class="ed-reqs">${s.hols.map((h) => `<li><span>${esc(h.name)}</span><span>${fmtDate(h.d)}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">None listed.</p>'}</section>
      <section class="card"><div class="card-head"><h2>About me</h2></div><dl class="ed-facts"><dt>Position</dt><dd>${esc(s.pos || "—")}</dd><dt>Assignment</dt><dd>${esc(s.unit)}</dd><dt>Department</dt><dd>${esc(s.dept)}</dd><dt>Status</dt><dd>${esc(s.status)}</dd><dt>Hired</dt><dd>${s.hire ? fmtDate(s.hire) : "—"}</dd><dt>Supervisor</dt><dd>${esc(s.sup || "—")}</dd>${s.train ? `<dt>Required training</dt><dd>${s.train.ok} of ${s.train.n} current</dd>` : ""}</dl></section></div>`;
}

/* ---------- Employee view preview (HR) ---------- */
{ const b = ESS.esshome; ESS.esshome = (e) => { const h = b(e); let s; try { s = buildSummary(e); } catch { return h; } const i = h.indexOf('<section class="stats kpis">'); const j = i >= 0 ? h.indexOf("</section>", i) + 10 : -1;
  return (j > 0 ? h.slice(0, i) + h.slice(j) : h).replace(/<div class="row"><section class="card"><div class="card-head"><h2>My upcoming leave[\s\S]*$/, "") + dashSections(s, "ess")
    + `<p class="t-muted" style="font-size:13px;margin:0">Employees see this dashboard on their phone once HR links the phone on Phone clock-in. It refreshes each time someone from HR has the app open.</p>`; }; }

/* ---------- employee's own phone ---------- */
{ const bn = selfNav; selfNav = () => { const h = bn(); if (!S.self?.claim) return h; const cur = S.selfTab === "home";
    return h.replace(/<button class="nav-item" data-self-tab="clock"/, `<button class="nav-item" data-self-tab="home"${cur ? ' aria-current="page"' : ""}>${icon("dash")}My dashboard</button>$&`); };
  const bv = selfView; selfView = () => S.selfTab === "home" && S.self?.claim ? selfHome() : bv(); }
function selfHome() {
  if (!S.meSumSub && S.self?.uid && S.db) { S.meSumSub = true; S.db.doc(`clockins/${S.self.uid}/me/summary`).onSnapshot((d) => { S.meSum = d.exists ? d.data() : null; render(); }, () => { S.meSum = null; render(); }); }
  const c = S.self.claim; const s = S.meSum;
  const hero = `<section class="hero"><div class="hero-text"><span class="hero-date">${esc(new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date()))}</span>
      <h1>${greetWord()}, ${esc(s?.first || (c.name || "").split(" ")[0] || "there")}</h1><p>${esc([s?.pos, s?.unit, c.empNo].filter(Boolean).join(" · "))}</p></div>
      <div class="hero-actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-gold" data-self-tab="clock">${icon("clock")}Clock in or out</button><button class="btn btn-ghost" style="background:#fff" data-self-tab="ask">${icon("mail")}Ask HR</button><button class="btn btn-ghost" style="background:#fff" data-self-tab="loans">${icon("wallet")}My loans</button></div></section>`;
  if (s === undefined) return hero + '<section class="card"><p class="t-muted" style="margin:0">Loading your dashboard…</p></section>';
  if (!s) return hero + `<section class="card"><h2 style="font-size:18px;margin:0 0 6px">Your dashboard is on its way</h2><p style="margin:0;font-size:15px">HR needs to confirm your phone first. After that, your payslips, leave, schedule, requests and announcements show here. You can already clock in and ask HR.</p></section>`;
  return hero + dashSections(s, "self-tab") + `<p class="t-muted" style="font-size:13px;margin:0">Updated ${esc(timeAgo(s.at))}. For corrections, use Ask HR.</p>`;
}
