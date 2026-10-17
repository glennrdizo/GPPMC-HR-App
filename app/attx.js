/* ---------- attendance flow: working calendar (roster), my attendance, requests with approval, adjustments, reports; overtime flow ---------- */
Object.assign(TCOLS, { attreq: "attReqs", roster: "rosters" });
Object.assign(S, { attReqs: new Map(), rosters: new Map(), rosM: null, rosF: { unit: "", q: "", page: 1 }, arF: { kind: "", st: "PENDING" }, repTab: "daily", repD: null, repFrom: null, repTo: null, otrTab: "emp", essM: null });
{
  const tk = NAV.find(([g]) => g === "Timekeeping");
  if (tk) { const it = tk[1]; const at = (v) => it.findIndex(([x]) => x === v);
    it.splice(1, 0, ["attflow", "Attendance flow", "flow"]);
    it.splice(at("dtr") + 1, 0, ["roster", "Working calendar", "cal"], ["attreqs", "Attendance requests", "log"], ["attrep", "Attendance reports", "report"]);
    it.splice(at("ot") + 1, 0, ["otrep", "Overtime reports", "chart"], ["otflow", "Overtime flow", "flow"]); }
  Object.assign(SECTION_OF, { attflow: "attflow", roster: "roster", attreqs: "attreqs", attrep: "attrep", otrep: "otrep", otflow: "otflow" });
  const i = ESS_NAV.findIndex(([v]) => v === "esstime");
  ESS_NAV.splice(i, 1, ["essatt", "My attendance", "cal"], ["esstime", "My time records", "clock"], ["essraw", "My raw attendance", "fp"], ["essreq", "My attendance requests", "log"], ["essot", "My overtime", "watch"]);
}
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("attreq").limit(3000).onSnapshot((snap) => { S.attReqs = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
  db.collection("roster").limit(60).onSnapshot((snap) => { S.rosters = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }

/* ---------- roster: per month, per employee, per day: a shift id or "R" for rest ---------- */
const rosterCode = (empId, d) => S.rosters.get(d.slice(0, 7))?.days?.[empId]?.[d.slice(8)] || null;
const defaultCode = (e, d) => (PAY.isRest(parseISO(d), SET()) ? "R" : e.shiftId || "day");
const planCode = (e, d) => rosterCode(e.id, d) || defaultCode(e, d);
const shiftById = (id) => SET().shifts.find((s) => s.id === id);
const codeLabel = (c) => (c === "R" ? "Rest day" : shiftById(c) ? `${shiftById(c).name} ${shiftById(c).start}–${shiftById(c).end}` : "Shift");
const codeShort = (c) => (c === "R" ? "R" : (shiftById(c)?.name || "S").replace(/shift/i, "").trim().slice(0, 2).toUpperCase() || "S");
{ // dayRec follows the roster: a rostered rest day or a rostered shift replaces the default for that date
  const base = dayRec; const isRest0 = PAY.isRest;
  dayRec = (e, d, rec, ctx) => { const c = e && d ? rosterCode(e.id, d) : null; if (!c) return base(e, d, rec, ctx);
    PAY.isRest = (date, s) => (PAY.iso ? PAY.iso(date) === d : false) ? c === "R" : isRest0(date, s);
    try { return base(c === "R" ? e : { ...e, shiftId: c }, d, rec, ctx); } finally { PAY.isRest = isRest0; } };
}
async function saveRoster(m, patch) { // patch: {empId: {DD: code|null}}
  const cur = S.rosters.get(m) || { id: m, m, days: {} }; const days = { ...(cur.days || {}) };
  for (const [eid, dd] of Object.entries(patch)) { const x = { ...(days[eid] || {}) }; for (const [k, v] of Object.entries(dd)) { if (v) x[k] = v; else delete x[k]; } days[eid] = x; }
  const doc = { m, days }; await S.db.doc(`roster/${m}`).set(JSON.parse(JSON.stringify(doc))); S.rosters.set(m, { id: m, ...doc }); S.ver++;
}
const monthDays = (m) => { const [y, mo] = m.split("-").map(Number); const n = new Date(y, mo, 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`); };
const shiftMonth = (m, n) => { const d = parseISO(m + "-01"); d.setMonth(d.getMonth() + n); return PAY.iso(d).slice(0, 7); };
const unitOpts = () => [["ho", "Head Office"], ...listOf(S.projects).filter((p) => p.status !== "DONE").map((p) => [`p:${p.id}`, p.name]), ...(S.org?.departments || []).map((d) => [`d:${d.id}`, `Dept: ${d.name}`])];
const inUnit = (e, u) => !u || (u === "ho" ? !e.projectId : u.startsWith("p:") ? e.projectId === u.slice(2) : u.startsWith("d:") ? e.deptId === u.slice(2) : true);
VIEWS.roster = () => {
  const m = S.rosM || todayISO().slice(0, 7); const F = S.rosF; const days = monthDays(m); const ed = S.canEdit;
  const list = active().filter((e) => inUnit(e, F.unit) && (!F.q || `${fullName(e)} ${e.no}`.toLowerCase().includes(F.q.toLowerCase()))).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const per = 30; const rows = list.slice((F.page - 1) * per, F.page * per); const has = S.rosters.get(m);
  const codes = [...SET().shifts.map((s) => s.id), "R"];
  return head("Timekeeping", "Working calendar", ed ? `<button class="btn btn-gold" data-ros-gen="1">Generate for ${esc(monthLabel(m))}</button>` : "") + `
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-ghost btn-sm" data-ros-m="-1" aria-label="Previous month">‹</button><b style="min-width:150px;text-align:center">${esc(monthLabel(m))}</b><button class="btn btn-ghost btn-sm" data-ros-m="1" aria-label="Next month">›</button>
      <select class="input" id="ros-unit" style="width:auto" aria-label="Site or department">${opts(unitOpts(), F.unit, "Everyone")}</select>
      <input class="input" type="search" id="ros-q" value="${esc(F.q)}" placeholder="Find employee" aria-label="Find employee" style="flex:1;min-width:160px">
      <span class="t-muted" style="font-size:13px">${has ? "Roster saved for this month." : "No roster saved yet: showing each person's usual shift and rest days."}</span></section>
    <section class="card"><div class="ros-key">${SET().shifts.map((s) => `<span><i class="ros-c ros-s">${esc(codeShort(s.id))}</i>${esc(s.name)} ${esc(s.start)}–${esc(s.end)}</span>`).join("")}<span><i class="ros-c ros-r">R</i>Rest day</span>${ed ? '<span class="t-muted">Click a cell to change it.</span>' : ""}</div>
      <div class="table-wrap ros-wrap"><table class="ros"><thead><tr><th class="ros-name">Employee</th>${days.map((d) => { const w = parseISO(d).getDay(); return `<th class="${w === 0 ? "ros-sun" : ""}${d === todayISO() ? " ros-today" : ""}">${Number(d.slice(8))}<small>${"SMTWTFS"[w]}</small></th>`; }).join("")}</tr></thead><tbody>
      ${rows.map((e) => `<tr><td class="ros-name"><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button><small>${esc(unitName(e))}</small></td>${days.map((d) => { const c = planCode(e, d); const set = !!rosterCode(e.id, d);
        return `<td><${ed ? `button data-ros-cell="${e.id}|${d}"` : "span"} class="ros-c ${c === "R" ? "ros-r" : "ros-s"}${set ? "" : " ros-def"}" title="${esc(`${fullName(e)} · ${fmtDate(d)}: ${codeLabel(c)}${set ? "" : " (usual)"}`)}">${esc(codeShort(c))}</${ed ? "button" : "span"}></td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="${days.length + 1}" class="empty">No employees found.</td></tr>`}
      </tbody></table></div>
      ${list.length > per ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:14px"><span class="t-muted">${(F.page - 1) * per + 1}–${Math.min(F.page * per, list.length)} of ${list.length}</span><span style="display:flex;gap:8px">${F.page > 1 ? '<button class="btn btn-ghost btn-sm" data-ros-p="-1">Previous</button>' : ""}${F.page * per < list.length ? '<button class="btn btn-ghost btn-sm" data-ros-p="1">Next</button>' : ""}</span></div>` : ""}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Late, absences and rest-day work in the time records follow this calendar. Generate fills ${F.unit ? "the people shown" : "everyone"} with their usual shift and rest days; you can then change single days. Approved schedule exchanges and shift changes update it automatically.</p></section>`;
};

/* ---------- requests: ADJUST (attendance change), SWAP (schedule exchange), SHIFT (shift schedule change) ---------- */
const AR_KIND = { ADJUST: ["Attendance change", "c-blue"], SWAP: ["Schedule exchange", "c-gold"], SHIFT: ["Shift change", "c-gray"] };
const AR_ST = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-bad"], CANCELLED: ["Cancelled", "c-gray"] };
const ADJ_WHY = ["Forgot to time in", "Forgot to time out", "Phone or biometric not working", "Official business outside the site", "Wrong time recorded", "Worked from another site"];
function arText(r) {
  if (r.kind === "ADJUST") return `${fmtDate(r.d)}: ${r.in ? `in ${r.in}` : ""}${r.in && r.out ? ", " : ""}${r.out ? `out ${r.out}` : ""}`;
  if (r.kind === "SWAP") { const w = S.emps.get(r.withId); return `${fmtDate(r.d)}${r.d2 && r.d2 !== r.d ? ` ↔ ${fmtDate(r.d2)}` : ""} with ${w ? fullName(w) : "a co-worker"}`; }
  return `${fmtDate(r.from)}${r.to !== r.from ? ` to ${fmtDate(r.to)}` : ""} → ${codeLabel(r.shiftId)}`;
}
function arForm(e, kind) {
  const today = todayISO(); const mates = active().filter((x) => x.id !== e.id && (e.projectId ? x.projectId === e.projectId : !x.projectId)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const body = kind === "ADJUST" ? `<div class="field"><label for="ar-d">Date <span class="req">*</span></label><input class="input" id="ar-d" type="date" required max="${today}" value="${addDays(today, -1)}"></div>
      <div class="field"><label for="ar-in">Correct time in</label><input class="input" id="ar-in" type="time" value="${shiftOf(e)?.start || "08:00"}"></div>
      <div class="field"><label for="ar-out">Correct time out</label><input class="input" id="ar-out" type="time" value="${shiftOf(e)?.end || "17:00"}"></div>
      <div class="field"><label for="ar-why">Reason <span class="req">*</span></label><input class="input" id="ar-why" list="ar-why-l" required><datalist id="ar-why-l">${ADJ_WHY.map((x) => `<option value="${x}">`).join("")}</datalist></div>`
    : kind === "SWAP" ? `<div class="field"><label for="ar-with">Exchange with <span class="req">*</span></label><select class="input" id="ar-with" required>${opts(mates.map((x) => [x.id, fullName(x)]), "", "Choose co-worker…")}</select></div>
      <div class="field"><label for="ar-d">My day <span class="req">*</span></label><input class="input" id="ar-d" type="date" required min="${today}" value="${addDays(today, 1)}"></div>
      <div class="field"><label for="ar-d2">Their day (leave the same to swap shifts on one day)</label><input class="input" id="ar-d2" type="date" min="${today}" value="${addDays(today, 1)}"></div>
      <div class="field"><label for="ar-why">Reason <span class="req">*</span></label><input class="input" id="ar-why" required placeholder="e.g. Family event"></div>`
    : `<div class="field"><label for="ar-from">From <span class="req">*</span></label><input class="input" id="ar-from" type="date" required min="${today}" value="${addDays(today, 1)}"></div>
      <div class="field"><label for="ar-to">To <span class="req">*</span></label><input class="input" id="ar-to" type="date" required min="${today}" value="${addDays(today, 7)}"></div>
      <div class="field"><label for="ar-shift">New shift</label><select class="input" id="ar-shift">${opts(SET().shifts.map((s) => [s.id, `${s.name} ${s.start}–${s.end}`]), SET().shifts.find((s) => s.id !== (e.shiftId || "day"))?.id || "day")}</select></div>
      <div class="field"><label for="ar-why">Reason <span class="req">*</span></label><input class="input" id="ar-why" required placeholder="e.g. Night pour at the site"></div>`;
  return `<form id="ar-form" class="panel form-grid" style="align-items:end" data-kind="${kind}" data-ar-emp="${e.id}" data-keep>${body}<div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-ar-new="">Cancel</button></div></form>`;
}
const arRow = (r, mgr) => { const e = S.emps.get(r.empId); return `<tr><td>${mgr ? `<button class="link" data-emp="${e.id}">${esc(fullName(e))}</button><div class="t-muted" style="font-size:12px">${esc(unitName(e))}</div>` : `<span class="chip ${AR_KIND[r.kind][1]}">${AR_KIND[r.kind][0]}</span>`}</td>
  ${mgr ? `<td><span class="chip ${AR_KIND[r.kind][1]}">${AR_KIND[r.kind][0]}</span></td>` : ""}<td>${esc(arText(r))}</td><td class="t-muted" style="max-width:220px">${esc(r.reason || "")}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.filed)}</td>
  <td><span class="chip ${AR_ST[r.status][1]}">${AR_ST[r.status][0]}</span>${r.decided ? `<div class="t-muted" style="font-size:12px">${fmtDate(r.decided.d)}${r.decided.note ? ` · ${esc(r.decided.note)}` : ""}</div>` : ""}</td>
  ${mgr && S.canEdit ? `<td class="num" style="white-space:nowrap">${r.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-ar-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-ar-set="${r.id}:REJECTED">Reject</button>` : ""}</td>` : !mgr && S.realEdit && r.status === "PENDING" ? `<td><button class="link danger" data-ar-set="${r.id}:CANCELLED">Cancel</button></td>` : mgr ? "<td></td>" : "<td></td>"}</tr>`; };
VIEWS.attreqs = () => {
  const F = S.arF; const all = listOf(S.attReqs).filter((r) => S.emps.get(r.empId)); const list = all.filter((r) => (!F.kind || r.kind === F.kind) && (!F.st || r.status === F.st)).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  const n = (k) => all.filter((r) => r.status === "PENDING" && r.kind === k).length;
  return head("Timekeeping", "Attendance requests") + `
    <section class="stats">${Object.entries(AR_KIND).map(([k, v]) => `<button class="card stat kpi-btn" data-ar-kind="${k}"><span class="label">${v[0]}</span><span class="value">${n(k)}</span><span class="note ${n(k) ? "t-warn" : "t-muted"}">waiting for approval</span></button>`).join("")}
      <div class="card stat"><span class="label">Approved in 30 days</span><span class="value">${all.filter((r) => r.status === "APPROVED" && r.decided?.d >= addDays(todayISO(), -30)).length}</span><span class="note t-muted">adjustments applied to time records</span></div></section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="tabs" role="tablist">${[["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${F.st === k}" data-ar-st="${k}">${l}</button>`).join("")}</div>
      <select class="input" id="ar-kindsel" style="width:auto" aria-label="Kind">${opts(Object.entries(AR_KIND).map(([k, v]) => [k, v[0]]), F.kind, "All kinds")}</select>
      ${S.canEdit ? `<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="ar-for" style="width:auto" aria-label="File for employee">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), S.arFor || "", "File for…")}</select>${Object.entries(AR_KIND).map(([k, v]) => `<button class="btn btn-ghost btn-sm" data-ar-new="${k}">${v[0]}</button>`).join("")}</span>` : ""}</section>
    ${S.arNew && S.arFor && S.emps.get(S.arFor) ? `<section class="card"><div class="card-head"><h2>${AR_KIND[S.arNew][0]} for ${esc(fullName(S.emps.get(S.arFor)))}</h2></div>${arForm(S.emps.get(S.arFor), S.arNew)}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Request</th><th>Details</th><th>Reason</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => arRow(r, true)).join("") || '<tr><td colspan="7" class="empty">No requests here.</td></tr>'}</tbody></table></div></section>
    <p class="t-muted" style="font-size:13px;margin:0">Approving an attendance change adds the corrected time in and out to the time records (marked as an HR adjustment). Approving a schedule exchange or shift change updates the working calendar.</p>`;
};
async function applyReq(r) {
  if (r.kind === "ADJUST") {
    for (const [type, hhmm] of [["IN", r.in], ["OUT", r.out]]) if (hhmm) await savePunch("adjust", { t: new Date(atManila(r.d, hhmm)).toISOString(), type, empId: r.empId, adj: r.id, note: r.reason || null }, { name: "HR adjustments", kiosk: true, adjust: true });
    if (r.out && r.in && r.out < r.in) { /* overnight: the out time belongs to the next day */ }
    S.clockLoaded.clear(); return;
  }
  if (r.kind === "SWAP") {
    const a = S.emps.get(r.empId), b = S.emps.get(r.withId); const d2 = r.d2 || r.d; const ca = planCode(a, r.d), cb = planCode(b, d2);
    if (r.d === d2) { await saveRoster(r.d.slice(0, 7), { [a.id]: { [r.d.slice(8)]: planCode(b, r.d) }, [b.id]: { [r.d.slice(8)]: ca } }); }
    else { const ca2 = planCode(a, d2), cb1 = planCode(b, r.d);
      await saveRoster(r.d.slice(0, 7), { [a.id]: { [r.d.slice(8)]: cb1 === "R" ? "R" : ca === "R" ? (b.shiftId || "day") : cb1 }, [b.id]: { [r.d.slice(8)]: ca === "R" ? "R" : ca } });
      await saveRoster(d2.slice(0, 7), { [a.id]: { [d2.slice(8)]: cb }, [b.id]: { [d2.slice(8)]: ca2 } }); }
    return;
  }
  if (r.kind === "SHIFT") { const e = S.emps.get(r.empId); for (let d = r.from; d <= r.to; d = addDays(d, 1)) { if (planCode(e, d) === "R") continue; await saveRoster(d.slice(0, 7), { [e.id]: { [d.slice(8)]: r.shiftId } }); } }
}

/* ---------- employee side ---------- */
ESS.essatt = (e) => {
  const m = S.essM || todayISO().slice(0, 7); const days = monthDays(m); loadClock(addDays(days[0], -1), addDays(days[days.length - 1], 1));
  const pd = punchDays(days[0], days[days.length - 1]); const ctx = tkCtx(); const lead = parseISO(days[0]).getDay();
  const recs = days.map((d) => ({ d, c: planCode(e, d), r: dayRec(e, d, pd.get(e.id)?.get(d), ctx) }));
  const n = (st) => recs.filter((x) => x.r.status === st).length;
  return head("Employee", `My attendance · ${esc(monthLabel(m))}`, `<span style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-ess-m="-1">‹ Previous</button><button class="btn btn-ghost btn-sm" data-ess-m="1">Next ›</button></span>`) + `
    <section class="stats">${[["Present", n("in") + n("late"), "t-ok"], ["Late", n("late"), "t-warn"], ["Absent", n("absent"), "t-bad"], ["On leave", n("leave"), "t-blue"]].map(([l, v, c]) => `<div class="card stat"><span class="label">${l}</span><span class="value">${v}</span><span class="note ${c}">days this month</span></div>`).join("")}</section>
    <section class="card"><div class="card-head"><h2>My working calendar</h2><span class="t-muted" style="font-size:13px">Planned shift, time in and time out</span></div>
      <div class="mcal">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<div class="mcal-h">${x}</div>`).join("")}${'<div class="mcal-pad"></div>'.repeat(lead)}
      ${recs.map(({ d, c, r }) => { const st = TK_STATUS[r.status] || ["", "c-gray"]; return `<div class="mcal-d${d === todayISO() ? " is-today" : ""}${c === "R" ? " is-rest" : ""}"><b>${Number(d.slice(8))}</b><span class="mcal-s">${esc(c === "R" ? "Rest day" : codeLabel(c))}</span>
        ${r.in || r.out ? `<span class="mcal-t">In ${esc(hm(r.in) || "—")}<br>Out ${esc(hm(r.out) || "—")}</span>` : ""}${["na", "due", "rest"].includes(r.status) ? "" : `<span class="chip ${st[1]}">${st[0]}${r.late && r.status === "late" ? ` ${r.late}m` : ""}</span>`}</div>`; }).join("")}</div></section>`;
};
ESS.essraw = (e) => {
  const to = todayISO(), from = addDays(to, -30); loadClock(from, to); const ps = punchesIn(from, to).filter((p) => p.empId === e.id).sort((a, b) => b.t.localeCompare(a.t));
  return head("Employee", "My raw attendance") + `<section class="card"><p class="t-muted" style="margin:0 0 10px;font-size:14px">Every time in and time out recorded in the last 30 days, exactly as captured.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Source</th><th>Location</th></tr></thead><tbody>
    ${ps.map((p) => `<tr><td style="white-space:nowrap">${fmtDate(manilaDay(p.t))}</td><td><b>${esc(hm(p.t))}</b></td><td>${p.type === "OUT" ? "Time out" : "Time in"}</td><td>${p.adj ? '<span class="chip c-gold">HR adjustment</span>' : p.bio ? "Biometric" : p.kiosk ? "Site kiosk" : "Phone"}</td><td class="t-muted">${p.lat != null ? `<a class="link" href="https://maps.google.com/?q=${Number(p.lat)},${Number(p.lng)}" target="_blank" rel="noopener">Map</a>` : p.note ? esc(p.note) : "—"}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No time records in the last 30 days.</td></tr>'}</tbody></table></div></section>`;
};
ESS.essreq = (e) => {
  const mine = listOf(S.attReqs).filter((r) => r.empId === e.id).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  return head("Employee", "My attendance requests") + `<section class="card"><div class="card-head"><h2>New request</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(AR_KIND).map(([k, v]) => `<button class="btn ${S.arNew === k ? "btn-primary" : "btn-ghost"} btn-sm" data-ar-new="${k}">${v[0]}</button>`).join("")}</div>
    ${S.arNew ? `<div style="margin-top:12px">${S.realEdit ? arForm(e, S.arNew) : ""}</div>` : '<p class="t-muted" style="margin:10px 0 0;font-size:14px">Attendance change: fix a missing or wrong time in or out. Schedule exchange: trade a day or shift with a co-worker. Shift change: work a different shift for some days. Each goes to HR for approval.</p>'}</section>
    <section class="card"><div class="card-head"><h2>My requests</h2></div><div class="table-wrap"><table><thead><tr><th>Request</th><th>Details</th><th>Reason</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>${mine.map((r) => arRow(r, false)).join("") || '<tr><td colspan="6" class="empty">No requests yet.</td></tr>'}</tbody></table></div></section>`;
};
function actualOT(e, from, to) {
  loadClock(addDays(from, -1), addDays(to, 1)); const pd = punchDays(from, to); const ctx = tkCtx(); const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const r = dayRec(e, d, pd.get(e.id)?.get(d), ctx); let h = r.ot || 0; if ((r.rest || r.hol.length) && r.hrs) h = r.hrs; if (h > 0) out.push({ d, h: PAY.r2(h), r }); }
  return out;
}
ESS.essot = (e) => {
  const to = todayISO(), from = addDays(to, -45); const act = actualOT(e, from, to); const reqs = listOf(S.otReqs).filter((r) => r.empId === e.id).sort((a, b) => b.d.localeCompare(a.d));
  const filed = (d) => reqs.find((r) => r.d === d); const sum = (xs, f) => PAY.r2(xs.reduce((s, x) => s + f(x), 0));
  return head("Employee", "My overtime") + `
    <section class="stats"><div class="card stat"><span class="label">My actual overtime</span><span class="value">${sum(act, (x) => x.h)} h</span><span class="note t-muted">worked past the shift, last 45 days</span></div>
      <div class="card stat"><span class="label">Approved</span><span class="value">${sum(reqs.filter((r) => r.status === "APPROVED" && r.d >= from), (r) => r.hours)} h</span><span class="note t-ok">paid in payroll</span></div>
      <div class="card stat"><span class="label">Waiting for approval</span><span class="value">${sum(reqs.filter((r) => r.status === "PENDING"), (r) => r.hours)} h</span><span class="note t-warn">${reqs.filter((r) => r.status === "PENDING").length} requests</span></div>
      <div class="card stat"><span class="label">Not yet filed</span><span class="value">${sum(act.filter((x) => !filed(x.d)), (x) => x.h)} h</span><span class="note t-muted">actual overtime with no request</span></div></section>
    <section class="card"><div class="card-head"><h2>My actual overtime</h2><span class="t-muted" style="font-size:13px">From my time in and time out</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Shift</th><th>In</th><th>Out</th><th class="num">Overtime</th><th>Request</th></tr></thead><tbody>
      ${act.slice().reverse().map((x) => { const f = filed(x.d); return `<tr><td style="white-space:nowrap">${fmtDate(x.d)}</td><td class="t-muted">${x.r.rest ? "Rest day" : x.r.hol.length ? "Holiday" : esc(`${x.r.shift.start}–${x.r.shift.end}`)}</td><td>${esc(hm(x.r.in))}</td><td>${esc(hm(x.r.out))}</td><td class="num"><b>${x.h} h</b></td>
        <td>${f ? `<span class="chip ${OT_STATUS[f.status][1]}">${OT_STATUS[f.status][0]} ${f.hours} h</span>` : S.realEdit ? `<button class="btn btn-ghost btn-sm" data-ot-file="${x.d}|${x.h}">File ${x.h} h</button>` : '<span class="t-muted">Not filed</span>'}</td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No time worked past the shift in the last 45 days.</td></tr>'}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>My overtime requests</h2></div><div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Hours</th><th>Reason</th><th>Status</th></tr></thead><tbody>
      ${reqs.slice(0, 40).map((r) => `<tr><td>${fmtDate(r.d)}</td><td class="num">${r.hours}</td><td class="t-muted">${esc(r.reason || "")}${fzLinks(r.files)}</td><td><span class="chip ${OT_STATUS[r.status][1]}">${OT_STATUS[r.status][0]}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No overtime requests.</td></tr>'}</tbody></table></div></section>`;
};

/* ---------- reports ---------- */
function rangeRecs(from, to, list) {
  loadClock(addDays(from, -1), addDays(to, 1)); const pd = punchDays(from, to); const ctx = tkCtx();
  return list.map((e) => { const s = { e, sched: 0, present: 0, late: 0, lateMin: 0, absent: 0, leave: 0, rest: 0, hrs: 0, ut: 0, ot: 0, noOut: 0 };
    for (let d = from; d <= to; d = addDays(d, 1)) { const r = dayRec(e, d, pd.get(e.id)?.get(d), ctx); if (r.status === "na" || r.status === "due") continue;
      if (r.status === "leave") s.leave++; else if (["rest", "hol"].includes(r.status)) s.rest++; else { s.sched++; if (r.status === "absent") s.absent++; else if (r.in) { s.present++; if (r.status === "late") { s.late++; s.lateMin += r.late; } } }
      s.hrs += r.hrs || 0; s.ut += r.ut || 0; s.ot += r.ot || 0; if (r.noOut) s.noOut++; }
    return s; });
}
const usesClock = (from, to) => { const ids = new Set(punchesIn(from, to).map((p) => p.empId)); return active().filter((e) => ids.has(e.id)); };
VIEWS.attrep = () => {
  const tab = S.repTab || "daily"; const today = todayISO(); const U = S.repUnit || "";
  const tabs = [["daily", "Daily attendance"], ["report", "Attendance report"], ["summary", "Attendance summary"], ["changes", "Attendance change analysis"], ["roster", "Roster calendar"], ["analysis", "Attendance analysis"]];
  let body = "";
  const unitSel = `<select class="input" id="rep-unit" style="width:auto" aria-label="Site or department">${opts(unitOpts(), U, "Everyone")}</select>`;
  if (tab === "daily") { const d = S.repD || today; loadClock(addDays(d, -1), addDays(d, 1)); const board = dayBoard(d).filter((x) => inUnit(x.e, U)).sort((a, b) => fullName(a.e).localeCompare(fullName(b.e)));
    const n = (st) => board.filter((x) => x.r.status === st).length;
    body = `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>Date</span><input class="input" type="date" id="rep-d" value="${d}" max="${today}"></label>${unitSel}
        <span class="t-muted" style="font-size:14px">${n("in") + n("late")} present · ${n("late")} late · ${n("absent") + n("notin")} absent or not in · ${n("leave")} on leave · ${n("rest") + n("hol")} rest or holiday</span></section>
      <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Site</th><th>Shift</th><th>In</th><th>Out</th><th class="num">Hours</th><th class="num">Late</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
      ${board.slice(0, 400).map(({ e, r }) => `<tr><td><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button></td><td class="t-muted">${esc(unitName(e))}</td><td class="t-muted" style="white-space:nowrap">${r.rest ? "Rest day" : esc(`${r.shift.start}–${r.shift.end}`)}</td><td>${esc(hm(r.in))}</td><td>${esc(hm(r.out))}</td><td class="num">${r.hrs || ""}</td><td class="num">${r.late ? minsText(r.late) : ""}</td><td><span class="chip ${TK_STATUS[r.status][1]}">${TK_STATUS[r.status][0]}</span></td><td class="t-muted">${esc(remarks(r))}</td></tr>`).join("")}</tbody></table></div></section>`; }
  if (tab === "report" || tab === "summary") { const from = S.repFrom || addDays(today, -14), to = S.repTo || addDays(today, -1);
    const only = S.repAll ? active() : usesClock(addDays(from, -1), addDays(to, 1)); const R = rangeRecs(from, to, only.filter((e) => inUnit(e, U)));
    const pick = `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>From</span><input class="input" type="date" id="rep-from" value="${from}"></label><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>To</span><input class="input" type="date" id="rep-to" value="${to}" max="${today}"></label>${unitSel}
      <label class="check" style="margin:0"><input type="checkbox" id="rep-all" ${S.repAll ? "checked" : ""}><span>Include people with no time records</span></label></section>`;
    if (tab === "report") body = pick + `<section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th class="num">Scheduled days</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Late</th><th class="num">Late time</th><th class="num">Undertime</th><th class="num">Overtime</th><th class="num">Leave</th><th class="num">Hours</th><th class="num">No time out</th></tr></thead><tbody>
      ${R.sort((a, b) => fullName(a.e).localeCompare(fullName(b.e))).map((s) => `<tr><td><button class="link" data-emp="${s.e.id}">${esc(fullName(s.e))}</button></td><td class="t-muted">${esc(deptName(s.e))}</td><td class="num">${s.sched}</td><td class="num">${s.present}</td><td class="num ${s.absent ? "t-bad" : ""}">${s.absent}</td><td class="num">${s.late}</td><td class="num">${minsText(s.lateMin) || "—"}</td><td class="num">${minsText(s.ut) || "—"}</td><td class="num">${s.ot ? s.ot + " h" : "—"}</td><td class="num">${s.leave}</td><td class="num">${PAY.r2(s.hrs)}</td><td class="num">${s.noOut || ""}</td></tr>`).join("") || '<tr><td colspan="12" class="empty">No one with time records in this range.</td></tr>'}</tbody></table></div></section>`;
    else { const g = {}; for (const s of R) { const k = deptName(s.e); const o = (g[k] = g[k] || { n: 0, sched: 0, present: 0, absent: 0, late: 0, lateMin: 0, ot: 0, leave: 0 }); o.n++; for (const f of ["sched", "present", "absent", "late", "lateMin", "ot", "leave"]) o[f] += s[f]; }
      const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—"); const T = Object.values(g).reduce((t, o) => { for (const f in o) t[f] = (t[f] || 0) + o[f]; return t; }, {});
      body = pick + `<section class="card"><div class="table-wrap"><table><thead><tr><th>Department</th><th class="num">People</th><th class="num">Attendance rate</th><th class="num">Absences</th><th class="num">Late arrivals</th><th class="num">Late time</th><th class="num">Overtime</th><th class="num">Leave days</th></tr></thead><tbody>
        ${Object.entries(g).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr><td><b>${esc(k)}</b></td><td class="num">${o.n}</td><td class="num">${pct(o.present, o.sched)}</td><td class="num">${o.absent}</td><td class="num">${o.late}</td><td class="num">${minsText(o.lateMin) || "—"}</td><td class="num">${PAY.r2(o.ot)} h</td><td class="num">${o.leave}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">No data.</td></tr>'}</tbody>
        ${R.length ? `<tfoot><tr><th>Total</th><th class="num">${T.n}</th><th class="num">${pct(T.present, T.sched)}</th><th class="num">${T.absent}</th><th class="num">${T.late}</th><th class="num">${minsText(T.lateMin) || "—"}</th><th class="num">${PAY.r2(T.ot)} h</th><th class="num">${T.leave}</th></tr></tfoot>` : ""}</table></div></section>`; } }
  if (tab === "changes") { const all = listOf(S.attReqs).filter((r) => S.emps.get(r.empId) && inUnit(S.emps.get(r.empId), U)); const dec = all.filter((r) => r.decided?.d);
    const byKind = Object.entries(AR_KIND).map(([k, v]) => [v[0], all.filter((r) => r.kind === k).length]); const why = {}; for (const r of all.filter((x) => x.kind === "ADJUST")) why[r.reason || "No reason"] = (why[r.reason || "No reason"] || 0) + 1;
    const byDept = {}; for (const r of all) { const k = deptName(S.emps.get(r.empId)); byDept[k] = (byDept[k] || 0) + 1; } const byEmp = {}; for (const r of all) byEmp[r.empId] = (byEmp[r.empId] || 0) + 1;
    const ms = monthsBack(6).map(([m, l]) => [l, all.filter((r) => (r.filed || "").startsWith(m)).length]);
    body = `<section class="stats kpis rd-kpis">${dxTile("Requests", all.length, "all time")}${dxTile("Approved", all.filter((r) => r.status === "APPROVED").length, `${dec.length ? Math.round((all.filter((r) => r.status === "APPROVED").length / dec.length) * 100) : 0}% of decided`)}
        ${dxTile("Rejected", all.filter((r) => r.status === "REJECTED").length, "")}${dxTile("Waiting", all.filter((r) => r.status === "PENDING").length, "for approval", all.some((r) => r.status === "PENDING") ? "t-warn" : "t-ok")}
        ${dxTile("Days to decide", dec.length ? (dec.reduce((s, r) => s + daysBetween(r.filed, r.decided.d), 0) / dec.length).toFixed(1) : "—", "average")}${dxTile("People who asked", Object.keys(byEmp).length, `of ${active().length}`)}</section>
      <div class="two"><section class="card"><div class="card-head"><h2>Requests per month</h2></div>${vbars(ms, { label: "Attendance requests per month" })}</section><section class="card"><div class="card-head"><h2>By kind</h2></div>${hrows(byKind)}<h3 class="rx-h3">Reasons for attendance changes</h3>${hrows(Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 6)) || '<p class="t-muted" style="margin:0">None yet.</p>'}</section></div>
      <div class="two"><section class="card"><div class="card-head"><h2>By department</h2></div>${hrows(Object.entries(byDept).sort((a, b) => b[1] - a[1])) || '<p class="t-muted" style="margin:0">None yet.</p>'}</section><section class="card"><div class="card-head"><h2>Most requests</h2></div>${hrows(Object.entries(byEmp).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => [fullName(S.emps.get(id)), n, deptName(S.emps.get(id))])) || '<p class="t-muted" style="margin:0">None yet.</p>'}</section></div>`; }
  if (tab === "roster") body = VIEWS.roster().replace(/^[^]*?<\/header>/, "");
  if (tab === "analysis") body = `<div class="dx-body">${dxAttendance()}</div>`;
  return head("Timekeeping", "Attendance reports") + `<div class="tabs dx-tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-rep-tab="${k}">${l}</button>`).join("")}</div>${body}`;
};
VIEWS.otrep = () => {
  const tab = S.otrTab || "emp"; const today = todayISO(); const from = S.otFrom || addDays(today, -30), to = S.otTo || today;
  const reqs = listOf(S.otReqs).filter((r) => S.emps.get(r.empId) && r.d >= from && r.d <= to); const ap = reqs.filter((r) => r.status === "APPROVED");
  const users = usesClock(addDays(from, -1), addDays(to, 1)); const act = new Map(users.map((e) => [e.id, actualOT(e, from, to < today ? to : addDays(today, -1)).reduce((s, x) => s + x.h, 0)]));
  const emps = [...new Set([...reqs.map((r) => r.empId), ...[...act.keys()].filter((k) => act.get(k) > 0)])].map((id) => S.emps.get(id));
  const row = (e) => { const a = ap.filter((r) => r.empId === e.id).reduce((s, r) => s + r.hours, 0); const p = reqs.filter((r) => r.empId === e.id && r.status === "PENDING").reduce((s, r) => s + r.hours, 0); const x = act.get(e.id) || 0; return { e, a, p, x, cost: a * hourly(e) * 1.25 }; };
  const R = emps.map(row).sort((a, b) => b.a - a.a || b.x - a.x); const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString("en-PH");
  const pick = `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>From</span><input class="input" type="date" id="otr-from" value="${from}"></label><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>To</span><input class="input" type="date" id="otr-to" value="${to}"></label>
    <div class="tabs" role="tablist">${[["emp", "By employee"], ["dept", "By department"], ["month", "By month"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-otr-tab="${k}">${l}</button>`).join("")}</div></section>`;
  let body = "";
  if (tab === "emp") body = `<section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th class="num">Actual overtime</th><th class="num">Approved</th><th class="num">Waiting</th><th class="num">Not filed</th><th class="num">Cost (est.)</th></tr></thead><tbody>
    ${R.map((x) => `<tr><td><button class="link" data-emp="${x.e.id}">${esc(fullName(x.e))}</button></td><td class="t-muted">${esc(deptName(x.e))}</td><td class="num">${f1(x.x)} h</td><td class="num"><b>${f1(x.a)} h</b></td><td class="num">${f1(x.p)} h</td><td class="num">${f1(Math.max(0, x.x - x.a - x.p))} h</td><td class="num">${peso.format(x.cost)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No overtime in this range.</td></tr>'}</tbody></table></div></section>`;
  if (tab === "dept") { const g = {}; for (const x of R) { const k = deptName(x.e); const o = (g[k] = g[k] || { n: 0, a: 0, p: 0, x: 0, cost: 0 }); o.n++; o.a += x.a; o.p += x.p; o.x += x.x; o.cost += x.cost; }
    body = `<div class="two"><section class="card"><div class="card-head"><h2>Approved hours by department</h2></div>${hrows(Object.entries(g).sort((a, b) => b[1].a - a[1].a).map(([k, o]) => [k, PAY.r2(o.a)]), (n) => `${f1(n)} h`) || '<p class="t-muted" style="margin:0">No approved overtime.</p>'}</section>
      <section class="card"><div class="table-wrap"><table><thead><tr><th>Department</th><th class="num">People</th><th class="num">Actual</th><th class="num">Approved</th><th class="num">Cost (est.)</th></tr></thead><tbody>${Object.entries(g).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="num">${o.n}</td><td class="num">${f1(o.x)} h</td><td class="num">${f1(o.a)} h</td><td class="num">${peso.format(o.cost)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No data.</td></tr>'}</tbody></table></div></section></div>`; }
  if (tab === "month") { const ms = monthsBack(12); const all = listOf(S.otReqs).filter((r) => r.status === "APPROVED" && S.emps.get(r.empId));
    const data = ms.map(([m, l]) => { const xs = all.filter((r) => (r.d || "").startsWith(m)); return [l, PAY.r2(xs.reduce((s, r) => s + r.hours, 0)), xs.reduce((s, r) => s + r.hours * hourly(S.emps.get(r.empId)) * 1.25, 0)]; });
    body = `<section class="card"><div class="card-head"><h2>Approved overtime per month</h2><span class="t-muted" style="font-size:13px">Last 12 months</span></div>${vbars(data.map(([l, h, c]) => [l, h, `${l}: ${h} hours, about ${peso.format(c)}`]), { fmt: (n) => `${n} h`, label: "Approved overtime per month" })}
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Month</th><th class="num">Hours</th><th class="num">Cost (est.)</th></tr></thead><tbody>${data.map(([l, h, c]) => `<tr><td>${l}</td><td class="num">${f1(h)}</td><td class="num">${peso.format(c)}</td></tr>`).join("")}</tbody></table></div></section>`; }
  const tot = (f) => R.reduce((s, x) => s + x[f], 0);
  return head("Timekeeping", "Overtime reports", `<button class="btn btn-ghost" data-go="ot">Manage overtime</button>`) + `
    <section class="stats kpis rd-kpis">${dxTile("Actual overtime", `${f1(tot("x"))} h`, "worked past the shift, from time records")}${dxTile("Approved", `${f1(tot("a"))} h`, `${ap.length} requests`)}${dxTile("Waiting", `${f1(tot("p"))} h`, "for approval", tot("p") ? "t-warn" : "t-ok")}
      ${dxTile("Not filed", `${f1(Math.max(0, tot("x") - tot("a") - tot("p")))} h`, "actual overtime with no request")}${dxTile("Cost (est.)", peso.format(tot("cost")), "approved hours at 125%")}${dxTile("People", R.filter((x) => x.a || x.x).length, "with overtime")}</section>${pick}${body}
    <p class="t-muted" style="font-size:13px;margin:0">Cost is an estimate at 125% of the hourly rate (ordinary-day overtime). Rest-day and holiday overtime are paid higher in payroll.</p>`;
};

/* ---------- flows ---------- */
function flowPage(title, intro, steps, foot = "") {
  return head("Timekeeping", title) + `<p class="t-muted" style="margin:0 0 6px">${intro}</p><ol class="rf">${steps.map(([ic, t, who, what, now, go], i) => `<li class="rf-step"><button class="rf-card" ${go.startsWith("ess:") ? `data-flow-ess="${go.slice(4)}"` : `data-go="${go}"`}><span class="rf-n">${i + 1}</span><span class="rf-ic">${icon(ic, 20)}</span>
    <span class="rf-body"><b class="rf-t">${esc(t)}</b><span class="rf-who">${esc(who)}</span><span class="rf-what">${esc(what)}</span></span><span class="rf-now">${esc(now)}</span></button></li>`).join("")}</ol>${foot ? `<section class="card rf-side">${foot}</section>` : ""}`;
}
VIEWS.attflow = () => { const P = (k) => listOf(S.attReqs).filter((r) => r.status === "PENDING" && r.kind === k).length; const m = todayISO().slice(0, 7);
  return flowPage("Attendance flow", "How attendance moves from the working calendar to payroll. Click a step to go there.", [
    ["cal", "Generate the working calendar", "HR or timekeeper", "Fill each person's shifts and rest days for the month, then adjust single days.", S.rosters.get(m) ? "This month generated" : "Not yet generated", "roster"],
    ["phone", "Time in and time out", "Employee", "Phone selfie with GPS, site kiosk or biometric. Everyone can see their own record.", `${punchesIn(todayISO(), todayISO()).length} punches today`, "clockin"],
    ["people", "My attendance", "Employee", "My working calendar, my time in and out, and my raw attendance.", "Employee view", "ess:essatt"],
    ["log", "Ask for a change", "Employee", "Attendance change (missing or wrong time), schedule exchange with a co-worker, or a shift change.", `${P("ADJUST") + P("SWAP") + P("SHIFT")} waiting`, "ess:essreq"],
    ["shield", "Approve", "Supervisor or HR", "Approve or reject each request.", `${P("ADJUST")} changes · ${P("SWAP")} exchanges · ${P("SHIFT")} shift changes`, "attreqs"],
    ["sliders", "Attendance adjustment", "Automatic on approval", "Approved changes are added to the time records as HR adjustments; exchanges and shift changes update the calendar.", "", "dtr"],
    ["sheet", "Daily time records", "Timekeeper", "Check late, undertime, overtime and missing time outs for the pay period.", "", "dtr"],
    ["report", "Reports", "HR and owner", "Daily attendance, attendance report, summary, roster calendar and change analysis.", "", "attrep"],
    ["pay", "Payroll", "Payroll", "The time sheet feeds the pay period.", "", "payroll"],
  ]); };
VIEWS.otflow = () => { const p = listOf(S.otReqs).filter((r) => r.status === "PENDING").length;
  return flowPage("Overtime flow", "How overtime is worked, filed, approved and paid. Click a step to go there.", [
    ["clock", "Work past the shift", "Employee", "The time out after the shift end is counted as actual overtime (in 30-minute blocks).", "", "dtr"],
    ["watch", "My overtime", "Employee", "See my actual overtime, file a request for it, and follow its status.", "Employee view", "ess:essot"],
    ["shield", "Manage overtime", "Supervisor or HR", "Approve or reject overtime requests.", `${p} waiting`, "ot"],
    ["sheet", "Use in the time sheet", "Payroll", "Approved hours go to the pay period's time sheet as ordinary, rest-day or holiday overtime.", "", "ot"],
    ["chart", "Reports", "HR and owner", "Actual against approved overtime by employee, department and month, with cost.", "", "otrep"],
  ]); };

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ros-m],[data-ros-p],[data-ros-cell],[data-ros-gen],[data-ar-new],[data-ar-set],[data-ar-kind],[data-ar-st],[data-ess-m],[data-ot-file],[data-rep-tab],[data-otr-tab],[data-flow-ess]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.rosM) { S.rosM = shiftMonth(S.rosM || todayISO().slice(0, 7), Number(d.rosM)); render(); return; }
  if (d.rosP) { S.rosF.page += Number(d.rosP); render(); return; }
  if (d.essM) { S.essM = shiftMonth(S.essM || todayISO().slice(0, 7), Number(d.essM)); render(); return; }
  if (d.repTab) { S.repTab = d.repTab; render(); return; }
  if (d.otrTab) { S.otrTab = d.otrTab; render(); return; }
  if (d.flowEss) { S.viewAs = "emp"; S.essView = d.flowEss; render(); window.scrollTo({ top: 0 }); return; }
  if (d.arKind) { S.arF = { kind: d.arKind, st: "PENDING" }; render(); return; }
  if (d.arSt !== undefined) { S.arF = { ...S.arF, st: d.arSt }; render(); return; }
  if (d.arNew !== undefined) { if (d.arNew && S.viewAs !== "emp" && !S.arFor) { toast("Choose the employee first."); $("#ar-for")?.focus(); return; } S.arNew = d.arNew || null; render(); return; }
  if (!S.realEdit) return;
  try {
    if (d.rosCell) { const [eid, day] = d.rosCell.split("|"); const e = S.emps.get(eid); const codes = [...SET().shifts.map((s) => s.id), "R"]; const cur = planCode(e, day); const next = codes[(codes.indexOf(cur) + 1) % codes.length];
      await saveRoster(day.slice(0, 7), { [eid]: { [day.slice(8)]: next } }); render(); return; }
    if (d.rosGen) { const m = S.rosM || todayISO().slice(0, 7); const list = active().filter((e) => inUnit(e, S.rosF.unit)); const has = list.some((e) => monthDays(m).some((x) => rosterCode(e.id, x)));
      if (has && !await askConfirm(`Replace the saved calendar for ${list.length} people in ${monthLabel(m)}? Single-day changes for them will be reset.`)) return;
      const patch = {}; for (const e of list) { patch[e.id] = {}; for (const x of monthDays(m)) patch[e.id][x.slice(8)] = defaultCode(e, x); }
      await saveRoster(m, patch); logActivity(`Generated the working calendar for ${monthLabel(m)} (${list.length} people)`); toast("Working calendar generated."); render(); return; }
    if (d.arSet) { const [id, st] = d.arSet.split(":"); const r = S.attReqs.get(id); const nr = { ...r, status: st, decided: { d: todayISO(), by: S.myId || null } };
      if (st === "APPROVED") await applyReq(r);
      await S.db.doc(`attreq/${id}`).set(JSON.parse(JSON.stringify((({ id: _, ...x }) => x)(nr)))); S.attReqs.set(id, nr);
      logActivity(`${AR_ST[st][0]} ${AR_KIND[r.kind][0].toLowerCase()} for ${fullName(S.emps.get(r.empId))}`); toast(st === "APPROVED" ? "Approved and applied." : `Request ${AR_ST[st][0].toLowerCase()}.`); render(); return; }
    if (d.otFile) { const [day, h] = d.otFile.split("|"); const e = essEmp(); await put("otreqs", { id: uid(), empId: e.id, d: day, hours: Number(h), reason: "Actual overtime from time records", status: "PENDING", filed: todayISO(), decided: null }); logActivity(`Filed ${h} hours overtime for ${fullName(e)} on ${fmtDate(day)}`); toast("Overtime request filed."); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("change", (ev) => {
  const id = ev.target.id; const v = ev.target.value;
  if (id === "ros-unit") { S.rosF = { ...S.rosF, unit: v, page: 1 }; render(); } else if (id === "ar-kindsel") { S.arF.kind = v; render(); } else if (id === "ar-for") { S.arFor = v; render(); }
  else if (id === "rep-d") { S.repD = v; render(); } else if (id === "rep-unit") { S.repUnit = v; render(); } else if (id === "rep-from") { S.repFrom = v; render(); } else if (id === "rep-to") { S.repTo = v; render(); } else if (id === "rep-all") { S.repAll = ev.target.checked; render(); }
  else if (id === "otr-from") { S.otFrom = v; render(); } else if (id === "otr-to") { S.otTo = v; render(); }
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "ros-q") return; S.rosF = { ...S.rosF, q: ev.target.value, page: 1 }; const p0 = ev.target.selectionStart; render(); const i = $("#ros-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "ar-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const kind = f.dataset.kind; const e = S.emps.get(f.dataset.arEmp); const why = $("#ar-why").value.trim(); if (!why) { toast("Give the reason."); return; }
  const r = { empId: e.id, kind, reason: why, status: "PENDING", filed: todayISO(), by: S.myId || null };
  if (kind === "ADJUST") { r.d = $("#ar-d").value; r.in = $("#ar-in").value || null; r.out = $("#ar-out").value || null; if (!r.d || (!r.in && !r.out)) { toast("Enter the date and at least one time."); return; } }
  if (kind === "SWAP") { r.withId = $("#ar-with").value; r.d = $("#ar-d").value; r.d2 = $("#ar-d2").value || r.d; if (!r.withId || !r.d) { toast("Choose the co-worker and the day."); return; } }
  if (kind === "SHIFT") { r.from = $("#ar-from").value; r.to = $("#ar-to").value; r.shiftId = $("#ar-shift").value; if (!r.from || !r.to || r.to < r.from) { toast("Check the dates."); return; } }
  try { const id = uid(); await S.db.doc(`attreq/${id}`).set(JSON.parse(JSON.stringify(r))); S.attReqs.set(id, { id, ...r }); S.arNew = null; logActivity(`Filed a ${AR_KIND[kind][0].toLowerCase()} for ${fullName(e)}`); toast("Sent for approval."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
