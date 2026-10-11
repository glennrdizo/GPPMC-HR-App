/* ---------- time, leave and payroll ---------- */
const n2 = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v) => n2.format(v || 0);
const SET = () => PAY.settings(S.settings);
const LSTATUS = { PENDING: ["Pending", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-bad"], CANCELLED: ["Cancelled", "c-gray"] };
const leaveType = (code) => SET().leaveTypes.find((t) => t.code === code);
const allLeaves = () => [...S.leaveDocs.values()].flatMap((d) => Object.entries(d.items || {}).map(([id, l]) => ({ id, month: d.month, ...l })));
const curPeriod = () => PAY.periodOf(todayISO());
const periodDoc = (id) => S.periods.get(id) || { rows: {}, status: "OPEN" };
const isFinal = (id) => periodDoc(id).status === "FINAL";
const regularPay = (l) => l.basic + l.hol + l.leave - l.absent - l.tardy + (l.bp || 0);
const yearOf = (s) => s.slice(0, 4);

/* Payroll for a period: the saved final run when there is one, otherwise worked out live from time records and leave. */
const runMemo = new Map();
function payrun(id) {
  if (isFinal(id) && S.runs.has(id)) return { ...S.runs.get(id), final: true };
  const key = id + ":" + S.ver;
  if (!runMemo.has(key)) { if (runMemo.size > 40) runMemo.clear(); runMemo.set(key, PAY.run([...(S.allEmps || S.emps).values()], PAY.period(id), periodDoc(id).rows || {}, SET(), allLeaves(), payExt(id))); }
  return { ...runMemo.get(key), final: false, missing: isFinal(id) };
}
async function ensureRun(id) {
  if (!isFinal(id) || S.runs.has(id) || S.fetching.has(id)) return;
  S.fetching.add(id);
  try { const d = await S.db.doc("payruns/" + id).get(); if (d.exists) { S.runs.set(id, d.data()); S.ver++; render(); } } finally { S.fetching.delete(id); }
}

/* Vacation and sick leave credits are prorated by month in the hire year and the exit year (a cutoff started after the 15th counts as half a month). */
function leaveCredit(e, t, year) {
  if (t.days == null || !["VL", "SL"].includes(t.code)) return t.days; year = String(year);
  const s = e.hire && e.hire > `${year}-01-01` ? e.hire : `${year}-01-01`; const out = e.separated?.date || S.offb?.get(e.id)?.last || null;
  const end = out && out.startsWith(year) ? out : `${year}-12-31`; if (s > end) return 0;
  if (s === `${year}-01-01` && end === `${year}-12-31`) return t.days;
  const months = Number(end.slice(5, 7)) - Number(s.slice(5, 7)) + 1 - (Number(s.slice(8)) > 15 ? 0.5 : 0) - (Number(end.slice(8)) < 15 ? 0.5 : 0);
  return Math.round(((t.days * Math.max(0, months)) / 12) * 2) / 2;
}
function balances(e, year) {
  const used = {}, pend = {};
  for (const l of allLeaves()) if (l.empId === e.id && yearOf(l.from) === year) { if (l.status === "APPROVED") used[l.type] = (used[l.type] || 0) + l.days; else if (l.status === "PENDING") pend[l.type] = (pend[l.type] || 0) + l.days; }
  return SET().leaveTypes.map((t) => { const credit = leaveCredit(e, t, year); return { ...t, credit, used: used[t.code] || 0, pend: pend[t.code] || 0, left: credit == null ? null : Math.max(0, credit - (used[t.code] || 0)) }; });
}
const onLeave = (date) => allLeaves().filter((l) => l.status === "APPROVED" && l.from <= date && l.to >= date && S.emps.get(l.empId) && !S.emps.get(l.empId).separated);

function periodChoices(sel) {
  const ids = new Set([...S.periods.keys()]); const c = curPeriod();
  for (let i = -6; i <= 1; i++) ids.add(PAY.shiftPeriod(c, i));
  ids.add(sel);
  return [...ids].sort().reverse().map((id) => [id, PAY.period(id).label + (isFinal(id) ? " (final)" : id === c ? " (current)" : "")]);
}
const periodSelect = (id, name) => `<label class="field" style="flex-direction:row;align-items:center;gap:8px;color:#fff"><span class="lbl" style="color:var(--onblue)">Pay period</span><select class="input" style="width:auto;color:var(--ink)" data-period-pick="${name}">${opts(periodChoices(id), id)}</select></label>`;

function refilter(list, f) {
  const q = (f.q || "").trim().toLowerCase();
  return list.filter((e) => !f.dept || e.deptId === f.dept).filter((e) => !f.project || (f.project === "none" ? !e.projectId : e.projectId === f.project))
    .filter((e) => !q || `${e.first} ${e.last} ${e.no} ${pos(e.posId)?.title || ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
}
function filterBar(f, key) {
  const projs = [...S.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="field" style="grid-column:span 2"><label for="${key}-q">Search</label><input class="input" id="${key}-q" type="search" value="${esc(f.q)}" placeholder="Name, employee no. or position" data-tfilter="${key}:q"></div>
    <div class="field"><label for="${key}-dept">Department</label><select class="input" id="${key}-dept" data-tfilter="${key}:dept">${opts(S.org.departments.map((d) => [d.id, d.name]), f.dept, "All")}</select></div>
    <div class="field"><label for="${key}-proj">Project</label><select class="input" id="${key}-proj" data-tfilter="${key}:project">${opts([["none", "Head office"], ...projs.map((p) => [p.id, p.name])], f.project, "All")}</select></div>
  </div>`;
}
function pager(f, total, key) {
  const pages = Math.max(1, Math.ceil(total / PAGE)); f.page = Math.min(Math.max(1, f.page), pages);
  return `<nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${total} people · page ${f.page} of ${pages}</span>
    <span style="display:flex;gap:8px">${f.page > 1 ? `<button class="btn btn-ghost btn-sm" data-tpage="${key}:-1">Previous</button>` : ""}${f.page < pages ? `<button class="btn btn-ghost btn-sm" data-tpage="${key}:1">Next</button>` : ""}</span></nav>`;
}

/* ---------- attendance ---------- */
VIEWS.attendance = () => {
  const id = S.periodId || curPeriod(); const p = PAY.period(id); const Sx = SET(); const final = isFinal(id);
  const holidays = Sx.holidays.filter((h) => h.d >= p.start && h.d <= p.end);
  const run = payrun(id);
  const emps = [...S.emps.values()].filter((e) => run.lines[e.id]);
  const list = refilter(emps, S.tsFilter);
  const full = PAY.autoRow({ id: "-", hire: "2000-01-01" }, p, Sx, []);
  const leaveCount = emps.filter((e) => allLeaves().some((l) => l.empId === e.id && l.status === "APPROVED" && l.from <= p.end && l.to >= p.start)).length;
  const otTotal = Object.values(periodDoc(id).rows || {}).reduce((a, r) => a + (r.ot || 0), 0);
  return head(`Timekeeping for ${esc(p.label)}`, "Time sheet", `${periodSelect(id, "att")}
      <button class="btn btn-ghost" data-tsx="template">Download time sheet (CSV)</button>
      ${S.canEdit && !final ? `<label class="btn btn-ghost">Import time sheet<input type="file" id="ts-file" accept=".csv,text/csv" hidden></label><button class="btn btn-ghost" data-go="punches">Biometric import</button>` : ""}
      <button class="btn btn-ghost" data-go="timeSettings">Shifts &amp; holidays</button>`) + `
    ${final ? `<div class="notice"><span><span class="chip c-ok">Final</span> Payroll for this period is final, so time records are locked. Reopen it on the Payroll page to make changes.</span><button class="btn btn-ghost btn-sm" data-go="payroll">Open payroll</button></div>` : ""}
    <section class="stats">
      <div class="card stat"><span class="label">Working days in period</span><span class="value">${full.wd}</span><span class="note t-muted">${Sx.factor <= 261 ? "Monday to Friday" : "Monday to Saturday"}, holidays excluded</span></div>
      <div class="card stat"><span class="label">Holidays</span><span class="value">${holidays.length}</span><span class="note t-blue">${holidays.length ? holidays.map((h) => `${esc(h.name)} (${h.type === "REG" ? "regular" : "special"})`).join(", ") : "None this period"}</span></div>
      <div class="card stat"><span class="label">On approved leave</span><span class="value">${leaveCount}</span><span class="note t-muted">filled in from the Leave page</span></div>
      <div class="card stat"><span class="label">Overtime logged</span><span class="value">${PAY.r2(otTotal)}</span><span class="note t-muted">hours this period</span></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Time sheet</h2><span class="t-muted" style="font-size:13px;max-width:60ch">Enter only exceptions. Everyone is paid for the full schedule unless you log absences, lateness or undertime. ${S.canEdit && !final ? "Changes save as you leave each box." : ""}</span></div>
      ${filterBar(S.tsFilter, "ts")}
      <div id="ts-rows">${tsRows(id, list, run)}</div>
    </section>
    <section class="card"><div class="card-head"><h2>Shifts</h2><button class="link" data-go="timeSettings">Manage shifts</button></div>
      <div class="grid-tiles">${Sx.shifts.map((s) => `<div class="tile"><b>${esc(s.name)}</b><div class="t-muted" style="font-size:14px">${esc(s.start)} to ${esc(s.end)} · ${active().filter((e) => (e.shiftId || "day") === s.id).length} people</div></div>`).join("")}</div>
      <p class="t-muted" style="margin:12px 0 0;font-size:13px">Assign a shift on each person's 201 file. Night shift hours from 10 PM to 6 AM earn a 10% night differential.</p></section>`;
};
function tsRows(id, list, run) {
  const f = S.tsFilter; const total = list.length; const html = pager(f, total, "ts");
  const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE); const doc = periodDoc(id); const lock = !S.canEdit || isFinal(id);
  const shift = (e) => SET().shifts.find((s) => s.id === (e.shiftId || "day"))?.name || "Day shift";
  return `<div class="table-wrap"><table class="ts"><thead><tr><th>Employee</th><th class="num">Days paid</th><th class="num">Leave</th>${PAY.FIELDS.map(([, l]) => `<th class="num">${l.replace(" (", "<br>(")}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((e) => { const r = doc.rows?.[e.id] || {}; const l = run.lines[e.id];
      return `<tr><td><div class="person" style="min-width:210px">${avatar(e, 34)}<span class="who"><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}">${esc(fullName(e))}</button><span class="sub">${esc(e.no)} · ${esc(shift(e))}${e.payType === "DAILY" ? " · daily" : ""}</span></span></div></td>
        <td class="num" id="tsd-${e.id}"><b>${PAY.r2(l.days)}</b></td><td class="num">${lvCell(e, id)}</td>
        ${PAY.FIELDS.map(([k]) => `<td class="num">${lock ? (r[k] ? `<b>${r[k]}</b>` : '<span class="t-muted">0</span>') : `<input class="input cell" id="ts-${e.id}-${k}" data-ts="${e.id}:${k}" type="number" min="0" step="any" inputmode="decimal" value="${r[k] || ""}" placeholder="0" aria-label="${esc(PAY.FIELDS.find((x) => x[0] === k)[1])} for ${esc(fullName(e))}">`}</td>`).join("")}</tr>`; }).join("") || `<tr><td colspan="${PAY.FIELDS.length + 3}" class="empty">No one matches these filters.</td></tr>`}
  </tbody></table></div>${html}`;
}
function lvCell(e, id) {
  const a = PAY.autoRow(e, PAY.period(id), SET(), allLeaves());
  return a.lv || a.lwop ? `<span class="chip c-blue" title="Paid ${a.lv}, unpaid ${a.lwop}">${a.lv + a.lwop}${a.lwop ? " (" + a.lwop + " unpaid)" : ""}</span>` : '<span class="t-muted">0</span>';
}
async function savePeriodRows(id, patch) {
  const p = PAY.period(id); const ref = S.db.doc("periods/" + id);
  const cur = S.periods.get(id);
  if (cur) await ref.update({ rows: patch });
  else await ref.set({ start: p.start, end: p.end, status: "OPEN", rows: patch });
  const next = { ...(cur || { start: p.start, end: p.end, status: "OPEN" }), rows: { ...(cur?.rows || {}) } };
  for (const [k, v] of Object.entries(patch)) next.rows[k] = { ...(next.rows[k] || {}), ...v };
  S.periods.set(id, next); S.ver++;
}
function swap(sel, html) {
  const box = $(sel); if (!box) return;
  const f = document.activeElement?.id; box.innerHTML = html;
  if (f) document.getElementById(f)?.focus();
}
const redrawTs = () => { const id = S.periodId || curPeriod(); const run = payrun(id); swap("#ts-rows", tsRows(id, refilter([...S.emps.values()].filter((e) => run.lines[e.id]), S.tsFilter), run)); };

/* ---------- pay rules, holidays and shifts ---------- */
VIEWS.timeSettings = () => {
  const Sx = SET(); const ed = S.canEdit;
  const yr = String(new Date().getFullYear());
  return head("Used by timekeeping, leave and payroll", "Shifts, holidays &amp; pay rules") + `
    <section class="card"><div class="card-head"><h2>Pay rules</h2></div>
      <form id="rules-form" class="form-grid" style="align-items:end">
        <div class="field"><label for="r-factor">Work week (sets the daily rate of monthly-paid staff)</label><select class="input" id="r-factor" ${ed ? "" : "disabled"}>${opts([["313", "Six days a week (313 days a year)"], ["261", "Five days a week (261 days a year)"]], Sx.factor)}</select></div>
        <div class="field"><label for="r-min">Minimum daily wage (PHP)</label><input class="input" id="r-min" type="number" min="0" step="0.01" value="${Sx.minWage}" ${ed ? "" : "disabled"}></div>
        ${ed ? `<button class="btn btn-primary">Save pay rules</button>` : ""}
      </form>
      <ul style="margin:16px 0 0;padding-left:18px;font-size:14px;line-height:1.6" class="t-muted">
        <li>Paid twice a month: the 1st to 15th and the 16th to month end. Monthly-paid staff get half their rate each cutoff.</li>
        <li>Overtime 125%, rest day 130%, special day worked 130%, regular holiday worked 200%, night differential +10% of the hourly rate. Stacked: overtime on a rest or special day 169%, overtime on a regular holiday 260%, a regular holiday on a rest day 260%, a double holiday 300%.</li>
        <li>SSS 15% of the monthly salary credit (5% employee, 10% employer, plus EC), PhilHealth 5% split equally (₱10,000 floor, ₱100,000 ceiling), Pag-IBIG 2% each up to ₱10,000. Half is deducted each cutoff.</li>
        <li>Withholding tax uses the BIR semi-monthly table (TRAIN, 2023 onward). Anyone at or below the minimum wage for their region is exempt. Taxable pay is gross less contributions; de minimis allowances up to their caps are left out.</li>
        <li>Deduction order: contributions, withholding tax, other deductions, then government loans (SSS, Pag-IBIG) and company loans or cash advances. Net pay never goes below zero.</li>
      </ul>
    </section>
    ${wageCard()}${allowCard()}
    <section class="card"><div class="card-head"><h2>Holidays</h2><span class="t-muted" style="font-size:13px">Check against the official proclamation each year; movable holidays like Eid'l Fitr are added when declared.</span></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Holiday</th><th>Type</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
        ${Sx.holidays.slice().sort((a, b) => a.d.localeCompare(b.d)).map((h) => `<tr><td style="white-space:nowrap">${fmtDate(h.d)}</td><td>${esc(h.name)}</td><td><span class="chip ${h.type === "REG" ? "c-blue" : "c-gray"}">${h.type === "REG" ? "Regular" : "Special non-working"}</span></td>${ed ? `<td class="num"><button class="link danger" data-del-hol="${esc(h.d)}">Remove</button></td>` : ""}</tr>`).join("")}
      </tbody></table></div>
      ${ed ? `<form id="hol-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px">
        <div class="field"><label for="h-d">Date</label><input class="input" id="h-d" type="date" required min="${yr}-01-01"></div>
        <div class="field" style="flex:1;min-width:200px"><label for="h-name">Name</label><input class="input" id="h-name" required></div>
        <div class="field"><label for="h-type">Type</label><select class="input" id="h-type">${opts([["REG", "Regular"], ["SPE", "Special non-working"]], "REG")}</select></div>
        <button class="btn btn-primary">Add holiday</button></form>` : ""}
    </section>
    <section class="card"><div class="card-head"><h2>Shifts</h2></div>
      <ul class="list">${Sx.shifts.map((s) => `<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px"><span><b>${esc(s.name)}</b> <span class="t-muted">${esc(s.start)} to ${esc(s.end)}</span></span><span class="t-muted" style="font-size:14px">${active().filter((e) => (e.shiftId || "day") === s.id).length} people</span></li>`).join("")}</ul>
      ${ed ? `<form id="shift-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px">
        <div class="field" style="flex:1;min-width:180px"><label for="s-name">Shift name</label><input class="input" id="s-name" required placeholder="Mid shift"></div>
        <div class="field"><label for="s-start">Starts</label><input class="input" id="s-start" type="time" required value="08:00"></div>
        <div class="field"><label for="s-end">Ends</label><input class="input" id="s-end" type="time" required value="17:00"></div>
        <button class="btn btn-primary">Add shift</button></form>` : ""}
      <form id="grace-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
        <div class="field"><label for="g-min">Grace period for lateness (minutes)</label><input class="input" id="g-min" type="number" min="0" step="1" value="${Number(Sx.lateGrace) || 0}" style="width:140px" ${ed ? "" : "disabled"}></div>
        ${ed ? '<button class="btn btn-ghost">Save grace period</button>' : ""}<span class="t-muted" style="font-size:13px;max-width:50ch">Used by Timekeeping home, daily time records and punch imports. Time in within the grace period isn't counted as late.</span></form>
    </section>`;
};
async function saveSettings(patch, what) {
  const next = { ...SET(), ...patch };
  await S.db.doc("org/settings").set(JSON.parse(JSON.stringify(next))); S.settings = next; S.ver++;
  logActivity(what); toast("Saved."); render();
}

/* ---------- leave ---------- */
VIEWS.leave = () => {
  const tab = S.leaveTab || "requests"; const all = allLeaves();
  const pending = all.filter((l) => l.status === "PENDING").length;
  return head(`${pending} waiting for a decision`, "Leave", `<button class="btn btn-ghost" data-lvx="list">Download leave list (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="leaveForm">${icon("plus")}File leave</button>` : ""}`) + `
    <div class="tabs on-blue" role="tablist">${[["requests", "Requests"], ["balances", "Balances"], ["types", "Leave types"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-leave-tab="${k}">${l}</button>`).join("")}</div>
    ${tab === "requests" ? leaveRequests(all) : tab === "balances" ? leaveBalances() : leaveTypesCard()}`;
};
function leaveRequests(all) {
  const f = S.leaveFilter; const q = (f.q || "").toLowerCase();
  const list = all.filter((l) => !f.status || l.status === f.status).filter((l) => { const e = S.emps.get(l.empId); return e && (!q || `${e.first} ${e.last} ${e.no}`.toLowerCase().includes(q)); })
    .sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1) || b.from.localeCompare(a.from));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(Math.max(1, f.page), pages);
  const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return `<section class="card">
    <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="field"><label for="lv-q">Search</label><input class="input" id="lv-q" type="search" value="${esc(f.q)}" placeholder="Name or employee no." data-lfilter="q"></div>
      <div class="field"><label for="lv-st">Status</label><select class="input" id="lv-st" data-lfilter="status">${opts(Object.entries(LSTATUS).map(([k, v]) => [k, v[0]]), f.status, "All")}</select></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Reason</th><th>Status</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${rows.map((l) => { const e = S.emps.get(l.empId); const t = leaveType(l.type);
        return `<tr><td><div class="person" style="min-width:200px">${avatar(e, 34)}<span class="who"><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}">${esc(fullName(e))}</button><span class="sub">${esc(pos(e.posId)?.title || "")}</span></span></div></td>
          <td>${esc(t?.name || l.type)}${l.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td><td style="white-space:nowrap">${fmtDate(l.from)}${l.to !== l.from ? " to " + fmtDate(l.to) : ""}${l.half ? " (half day)" : ""}</td>
          <td class="num">${l.days}</td><td class="t-muted" style="max-width:240px">${esc(l.reason || "")}</td><td><span class="chip ${LSTATUS[l.status][1]}">${LSTATUS[l.status][0]}</span></td>
          ${S.canEdit ? `<td style="white-space:nowrap">${l.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-lv-set="${l.month}:${l.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-lv-set="${l.month}:${l.id}:REJECTED">Reject</button>` : l.status === "APPROVED" && !isFinal(PAY.periodOf(l.from)) ? `<button class="link danger" data-lv-set="${l.month}:${l.id}:CANCELLED">Cancel</button>` : ""}</td>` : ""}</tr>`; }).join("") || `<tr><td colspan="7" class="empty">No leave requests match.</td></tr>`}
    </tbody></table></div>
    <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} requests · page ${f.page} of ${pages}</span>
      <span style="display:flex;gap:8px">${f.page > 1 ? `<button class="btn btn-ghost btn-sm" data-lpage="-1">Previous</button>` : ""}${f.page < pages ? `<button class="btn btn-ghost btn-sm" data-lpage="1">Next</button>` : ""}</span></nav>
  </section>`;
}
function leaveBalances() {
  const year = String(new Date().getFullYear()); const f = S.balFilter;
  const list = refilter(active(), f); const rows = list.slice((Math.max(1, f.page) - 1) * PAGE, Math.max(1, f.page) * PAGE);
  const html = pager(f, list.length, "bal");
  return `<section class="card"><div class="card-head"><h2>Leave balances for ${year}</h2><button class="btn btn-ghost btn-sm" data-lvx="balances">Download balances (CSV)</button></div>
    ${filterBar(f, "bal")}
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Vacation left</th><th class="num">Sick left</th><th class="num">Other leave taken</th><th class="num">Without pay</th></tr></thead><tbody>
    ${rows.map((e) => { const b = Object.fromEntries(balances(e, year).map((x) => [x.code, x])); const other = Object.values(b).filter((x) => !["VL", "SL", "LW"].includes(x.code)).reduce((a, x) => a + x.used, 0);
      return `<tr class="go" data-emp="${e.id}" tabindex="0"><td><div class="person" style="min-width:200px">${avatar(e, 34)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${esc(e.no)}</span></span></div></td>
        <td class="num"><b>${b.VL?.left ?? "—"}</b> <span class="t-muted">of ${b.VL?.days ?? "—"}</span></td><td class="num"><b>${b.SL?.left ?? "—"}</b> <span class="t-muted">of ${b.SL?.days ?? "—"}</span></td><td class="num">${other}</td><td class="num">${b.LW?.used || 0}</td></tr>`; }).join("")}
    </tbody></table></div>${html}</section>`;
}
function leaveTypesCard() {
  const ed = S.canEdit;
  return `<section class="card"><div class="card-head"><h2>Leave types and yearly credits</h2></div>
    <form id="lt-form"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Leave</th><th class="num">Days a year</th><th>Paid</th><th>Notes</th></tr></thead><tbody>
      ${SET().leaveTypes.map((t, i) => `<tr><td><b>${esc(t.code)}</b></td><td>${esc(t.name)}${t.sex ? ` <span class="t-muted">(${t.sex === "F" ? "women" : "men"})</span>` : ""}</td>
        <td class="num">${t.days == null ? "No limit" : ed ? `<input class="input cell" name="lt-${i}" type="number" min="0" step="0.5" value="${t.days}" aria-label="Days for ${esc(t.name)}">` : t.days}${t.cal ? '<div class="t-muted" style="font-size:12px">calendar days</div>' : ""}</td>
        <td>${t.paid ? '<span class="chip c-ok">Paid</span>' : '<span class="chip c-gray">Unpaid</span>'}</td><td class="t-muted" style="font-size:13px">${esc(t.note || "")}</td></tr>`).join("")}
    </tbody></table></div>${ed ? `<div style="margin-top:14px"><button class="btn btn-primary">Save leave credits</button></div>` : ""}</form></section>`;
}

VIEWS.leaveForm = () => {
  const pre = S.view.emp ? S.emps.get(S.view.emp) : null;
  const list = active().sort((a, b) => a.last.localeCompare(b.last));
  return `<div><button class="link" style="color:#fff" ${pre ? `data-emp="${pre.id}"` : 'data-go="leave"'}>${icon("back", 16)} Back</button></div>` + head("Leave", "File leave") + `
    <form id="leave-form" class="card stack" style="gap:16px">
      <div class="form-grid">
        <div class="field"><label for="lf-filter">Find employee</label><input class="input" id="lf-filter" type="search" placeholder="Name or employee no."></div>
        <div class="field"><label for="lf-emp">Employee <span class="req">*</span></label><select class="input" id="lf-emp" required>${leaveEmpOptions(list, pre?.id)}</select></div>
        <div class="field"><label for="lf-type">Leave type <span class="req">*</span></label><select class="input" id="lf-type" required>${opts(SET().leaveTypes.map((t) => [t.code, t.name]), "VL")}</select></div>
        <div class="field"><label for="lf-from">From <span class="req">*</span></label><input class="input" id="lf-from" type="date" required value="${todayISO()}"></div>
        <div class="field"><label for="lf-to">To <span class="req">*</span></label><input class="input" id="lf-to" type="date" required value="${todayISO()}"></div>
        <div class="field"><label for="lf-status">Status</label><select class="input" id="lf-status">${opts([["PENDING", "Pending approval"], ["APPROVED", "Approved"]], "PENDING")}</select></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="lf-half"> Half day (one-day leave only)</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="lf-docs"> The supporting documents for this leave are on file</label>
      <div class="field"><label for="lf-reason">Reason</label><textarea class="input" id="lf-reason" rows="2"></textarea></div>
      <div class="panel" id="lf-hint" aria-live="polite">${leaveHint()}</div>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="lf-err" style="margin:0 auto 0 0" hidden></p>
        <button type="button" class="btn btn-ghost" ${pre ? `data-emp="${pre.id}"` : 'data-go="leave"'}>Cancel</button><button class="btn btn-primary" id="lf-save">Save leave</button></div>
    </form>`;
};
const leaveEmpOptions = (list, cur) => `<option value="">Choose…</option>` + list.slice(0, 400).map((e) => `<option value="${e.id}" ${e.id === cur ? "selected" : ""}>${esc(fullName(e))} · ${esc(e.no)}</option>`).join("");
function leaveDraft() {
  const g = (id) => document.getElementById(id);
  if (!g("lf-emp")) return null;
  const from = g("lf-from").value, to = g("lf-to").value || from;
  return { empId: g("lf-emp").value, type: g("lf-type").value, from, to, half: g("lf-half").checked && from === to, reason: g("lf-reason").value.trim(), status: g("lf-status").value, docsOk: g("lf-docs").checked };
}
function leaveHint() {
  const d = leaveDraft(); const e = d && S.emps.get(d.empId);
  if (!d || !e || !d.from) return '<span class="t-muted">Choose an employee and dates to see the days used and the balance left.</span>';
  if (d.to < d.from) return '<span class="err">The end date is before the start date.</span>';
  const t = leaveType(d.type); const days = PAY.leaveDays(d, SET(), t);
  const b = balances(e, yearOf(d.from)).find((x) => x.code === d.type);
  const rule = LEAVE_RULES[d.type];
  return `<b>${days} ${days === 1 ? "day" : "days"}</b> of ${esc(t.name.toLowerCase())}${t.cal ? " (calendar days)" : " (rest days and holidays not counted)"}. ${b.left == null ? "No yearly limit." : `${b.left} of ${b.days} left for ${yearOf(d.from)} before this request.`}${rule ? `<div style="margin-top:6px;font-size:14px"><b>Requirements:</b> ${esc(rule.text)}</div>` : ""}${d.type === "SL" && days >= 4 ? '<div style="margin-top:6px;font-size:14px" class="t-warn">Sick leave of 4 days or more: notify SSS of the sickness within 5 days of the employee\'s notice so they can claim the SSS sickness benefit.</div>' : ""}`;
}
async function submitLeave() {
  const err = $("#lf-err"); err.hidden = true; const d = leaveDraft(); const e = S.emps.get(d.empId); const t = leaveType(d.type);
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!e) return fail("Choose an employee.");
  if (!d.from || d.to < d.from) return fail("Check the dates.");
  if (t.sex && e.gender && e.gender !== t.sex) return fail(`${t.name} applies to ${t.sex === "F" ? "women" : "men"} only.`);
  const ruleErr = leaveRuleError(e, d); if (ruleErr) return fail(ruleErr);
  const days = PAY.leaveDays(d, SET(), t); if (!days) return fail("Those dates fall on rest days or holidays only.");
  const clash = allLeaves().find((l) => l.empId === e.id && ["PENDING", "APPROVED"].includes(l.status) && l.from <= d.to && l.to >= d.from);
  if (clash) return fail(`${fullName(e)} already has ${leaveType(clash.type)?.name.toLowerCase() || "leave"} on ${fmtDate(clash.from)}.`);
  const b = balances(e, yearOf(d.from)).find((x) => x.code === d.type);
  if (b.left != null && days > b.left - b.pend) return fail(`Only ${Math.max(0, b.left - b.pend)} ${t.name.toLowerCase()} days are left for ${yearOf(d.from)}${b.pend ? ` after ${b.pend} days waiting for approval` : ""}. File the rest as leave without pay.`);
  if (isFinal(PAY.periodOf(d.from)) && d.status === "APPROVED") return fail("Payroll for that period is already final. Reopen it first, or file this as pending.");
  const btn = $("#lf-save"); btn.disabled = true; btn.textContent = "Saving…";
  const id = uid(); const month = d.from.slice(0, 7);
  const item = { ...d, days, filed: todayISO(), decided: d.status === "APPROVED" ? todayISO() : null };
  try {
    if (S.leaveDocs.has(month)) await S.db.doc("leaves/" + month).update({ items: { [id]: item } });
    else await S.db.doc("leaves/" + month).set({ month, items: { [id]: item } });
    const doc = S.leaveDocs.get(month) || { month, items: {} }; S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: item } }); S.ver++;
    logActivity(`Filed ${days} ${days === 1 ? "day" : "days"} of ${t.name.toLowerCase()} for ${fullName(e)}`);
    toast("Leave saved."); S.view.emp ? go("employee", { id: e.id }) : go("leave");
  } catch { fail("Couldn't save. Try again."); btn.disabled = false; btn.textContent = "Save leave"; }
}
async function setLeaveStatus(month, id, status) {
  const doc = S.leaveDocs.get(month); const l = doc?.items?.[id]; if (!l) return;
  if (status === "APPROVED" && isFinal(PAY.periodOf(l.from))) { toast("Payroll for that period is final. Reopen it first."); return; }
  if (status === "APPROVED" && l.status !== "APPROVED") { const e0 = S.emps.get(l.empId); const b = e0 && balances(e0, yearOf(l.from)).find((x) => x.code === l.type);
    if (b && b.left != null && l.days > b.left) { toast(`Only ${b.left} ${String(b.name).toLowerCase()} days are left. Return it, or ask for leave without pay for the rest.`); return; } }
  await S.db.doc("leaves/" + month).update({ items: { [id]: { status, decided: todayISO() } } });
  S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: { ...l, status, decided: todayISO() } } }); S.ver++;
  const e = S.emps.get(l.empId); logActivity(`${LSTATUS[status][0]} ${leaveType(l.type)?.name.toLowerCase() || "leave"} for ${e ? fullName(e) : "an employee"}`);
  toast(`Leave ${LSTATUS[status][0].toLowerCase()}.`); render();
}

/* ---------- payroll ---------- */
VIEWS.payroll = () => {
  const tab = S.payTab || "register";
  const tabs = `<div class="tabs on-blue" role="tablist">${[["register", "Payroll register"], ["thirteenth", "13th month pay"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-pay-tab="${k}">${l}</button>`).join("")}</div>`;
  if (tab === "thirteenth") return head("Due on or before December 24", "Payroll") + tabs + thirteenth();
  const id = S.periodId || curPeriod(); const p = PAY.period(id); ensureRun(id);
  const run = payrun(id); const final = run.final;
  const emps = [...S.emps.values()].filter((e) => run.lines[e.id]); const T = S.scope ? scopeTotals(run.lines, emps) : run.totals; const list = refilter(emps, S.payFilter);
  const f = S.payFilter; const html = pager(f, list.length, "pay"); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const deductions = PAY.r2(T.sss + T.ph + T.hd + T.tax + T.ded + (T.loanTot || 0));
  return head(`Pay period ${esc(p.label)}`, "Payroll", `${periodSelect(id, "pay")}
      <button class="btn btn-ghost" data-payx="register">Download register (CSV)</button><button class="btn btn-ghost" data-payx="bank">Bank file (CSV)</button>`) + tabs + `
    <div class="notice"><span>${final ? '<span class="chip c-ok">Final</span> Saved on ' + esc(fmtDate((S.runs.get(id)?.at || "").slice(0, 10))) + ". Payslips and remittances use these figures." : run.missing ? '<span class="chip c-warn">Loading</span> Fetching the saved payroll…' : '<span class="chip c-warn">Draft</span> Worked out live from the time sheet and approved leave. It changes as records change until you finalize it.'}</span>
      ${S.canEdit ? final ? `<button class="btn btn-ghost btn-sm" data-pay-act="reopen">Reopen payroll</button>` : `<span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="final-ok"> Time records are complete</label><button class="btn btn-primary btn-sm" data-pay-act="finalize">Finalize payroll</button></span>` : ""}</div>
    <section class="stats">
      <div class="card stat"><span class="label">Gross pay</span><span class="value" style="font-size:28px">${peso.format(T.gross)}</span><span class="note t-muted">${T.count} employees</span></div>
      <div class="card stat"><span class="label">Deductions</span><span class="value" style="font-size:28px">${peso.format(deductions)}</span><span class="note t-muted">Tax ${peso.format(T.tax)} · contributions ${peso.format(PAY.r2(T.sss + T.ph + T.hd))}${T.loanTot ? ` · loans ${peso.format(T.loanTot)}` : ""}</span></div>
      <div class="card stat"><span class="label">Net pay</span><span class="value" style="font-size:28px">${peso.format(T.net)}</span><span class="note t-ok">to be credited</span></div>
      <div class="card stat"><span class="label">Employer share</span><span class="value" style="font-size:28px">${peso.format(T.employer)}</span><span class="note t-muted">SSS, EC, PhilHealth, Pag-IBIG</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Payroll register</h2><button class="link" data-go="attendance">Edit time sheet</button></div>
      ${filterBar(f, "pay")}
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Days</th><th class="num">Regular pay</th><th class="num">OT &amp; premiums</th><th class="num">Allowances &amp; other</th><th class="num">Gross</th><th class="num">SSS</th><th class="num">PhilHealth</th><th class="num">Pag-IBIG</th><th class="num">Tax</th><th class="num">Loans &amp; other</th><th class="num">Net pay</th></tr></thead><tbody>
      ${rows.map((e) => { const l = run.lines[e.id];
        return `<tr class="go" data-slip="${e.id}" tabindex="0"><td><div class="person" style="min-width:200px">${avatar(e, 34)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${esc(e.no)} · ${e.payType === "DAILY" ? "Daily " + money(l.daily) : "Monthly " + money(l.monthly)}</span></span></div></td>
          <td class="num">${PAY.r2(l.days)}</td><td class="num">${money(regularPay(l))}</td><td class="num">${money(premOf(l))}</td><td class="num">${money(allowOf(l))}</td><td class="num"><b>${money(l.gross)}</b></td>
          <td class="num">${money(l.sss)}</td><td class="num">${money(l.ph)}</td><td class="num">${money(l.hd)}</td><td class="num">${l.mwe && !l.tax ? '<span class="chip c-gray" title="Minimum wage earner">MWE</span>' : money(l.tax)}</td><td class="num">${money(l.ded + (l.loanTot || 0))}</td><td class="num"><b>${money(l.net)}</b></td></tr>`; }).join("") || `<tr><td colspan="12" class="empty">No one matches these filters.</td></tr>`}
      </tbody></table></div>${html}
      <p class="t-muted" style="margin:12px 0 0;font-size:13px">Select a row to open the payslip.</p></section>`;
};
function thirteenth() {
  const year = String(new Date().getFullYear()); const rows = thirteenthRows(year);
  const total = PAY.r2(rows.reduce((a, r) => a + r.est, 0));
  return `<section class="stats"><div class="card stat"><span class="label">Estimated 13th month pay, ${year}</span><span class="value" style="font-size:28px">${peso.format(total)}</span><span class="note t-muted">${rows.length} employees, including those who left this year</span></div>
      <div class="card stat"><span class="label">How it's computed</span><span class="note" style="font-weight:500;font-size:14px;line-height:1.5">One twelfth of basic pay earned in the year, prorated for people hired or separated during the year, plus one twelfth of commissions that form part of the wage. Up to ₱90,000 is tax-exempt.</span></div></section>
    <section class="card"><div class="card-head"><h2>13th month pay for ${year}</h2><button class="btn btn-ghost btn-sm" data-payx="13th">Download (CSV)</button></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Months in ${year}</th><th class="num">Monthly basic</th><th class="num">Basic paid so far (final payrolls)</th><th class="num">Commissions (final payrolls)</th><th class="num">Estimated 13th month</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((r) => `<tr class="go" data-emp="${r.e.id}" tabindex="0"><td>${esc(fullName(r.e))}${r.e.separated ? ' <span class="chip c-bad">Separated</span>' : ""}</td><td class="num">${r.months}</td><td class="num">${money(r.monthly)}</td><td class="num">${money(r.paid)}</td><td class="num">${r.comm ? money(r.comm) : '<span class="t-muted">—</span>'}</td><td class="num"><b>${money(r.est)}</b></td></tr>`).join("")}
      </tbody></table></div></section>`;
}
function thirteenthRows(year) {
  const Sx = SET(); const ys = `${year}-01-01`, ye = `${year}-12-31`;
  const finals = [...S.runs.entries()].filter(([id]) => id.startsWith(year) && isFinal(id));
  return [...S.emps.values()].filter((e) => e.hire <= ye && (!e.separated || e.separated.date >= ys)).sort((a, b) => a.last.localeCompare(b.last)).map((e) => {
    const from = e.hire > ys ? e.hire : ys; const to = e.separated?.date && e.separated.date < ye ? e.separated.date : ye;
    const months = PAY.r2(Math.max(0, daysBetween(from, to) + 1) / 365 * 12);
    const monthly = e.payType === "DAILY" ? (e.basicPay * Sx.factor) / 12 : e.basicPay;
    const paid = PAY.r2(finals.reduce((a, [, r]) => a + (r.lines[e.id] ? regularPay(r.lines[e.id]) : 0), 0));
    const comm = e.comm13 === false ? 0 : PAY.r2(finals.reduce((a, [, r]) => a + (r.lines[e.id]?.comm || 0), 0));
    return { e, months, monthly: PAY.r2(monthly), paid, comm, est: PAY.r2((monthly * months) / 12 + comm / 12) };
  });
}
async function finalizePayroll(id) {
  if (!$("#final-ok")?.checked) { toast("Tick the box to confirm the time records are complete."); return; }
  const p = PAY.period(id); const { lines, totals } = PAY.run([...S.emps.values()], p, periodDoc(id).rows || {}, SET(), allLeaves(), payExt(id));
  const at = new Date().toISOString();
  await S.db.doc("payruns/" + id).set({ start: p.start, end: p.end, at, lines, totals });
  if (S.periods.has(id)) await S.db.doc("periods/" + id).update({ status: "FINAL", finalAt: at, totals });
  else await S.db.doc("periods/" + id).set({ start: p.start, end: p.end, status: "FINAL", finalAt: at, totals, rows: {} });
  S.runs.set(id, { start: p.start, end: p.end, at, lines, totals }); S.periods.set(id, { ...periodDoc(id), start: p.start, end: p.end, status: "FINAL", finalAt: at, totals }); S.ver++;
  await recordLoanPayments(id, lines); await recordFlexPaid(id, lines);
  logActivity(`Finalized payroll for ${p.label}: net ${peso.format(totals.net)}`); toast("Payroll finalized."); render();
}
async function reopenPayroll(id) {
  await S.db.doc("periods/" + id).update({ status: "OPEN" }); await S.db.doc("payruns/" + id).delete(); await undoLoanPayments(id); await undoFlexPaid(id);
  S.runs.delete(id); S.periods.set(id, { ...periodDoc(id), status: "OPEN" }); S.ver++;
  logActivity(`Reopened payroll for ${PAY.period(id).label}`); toast("Payroll reopened."); render();
}

/* ---------- payslip ---------- */
VIEWS.payslip = () => {
  const { pid, emp } = S.view; const e = S.emps.get(emp); const p = PAY.period(pid); ensureRun(pid);
  const run = payrun(pid); const l = run.lines[emp];
  if (!e || !l) return head("Payroll", "Payslip not found") + `<section class="card"><button class="link" data-go="payroll">Back to payroll</button></section>`;
  return `<div class="no-print"><button class="link" style="color:#fff" data-go="payroll">${icon("back", 16)} Payroll</button></div>` +
    head(`${esc(p.label)}${run.final ? "" : " · draft"}`, "Payslip", `<button class="btn btn-ghost" data-slipx="print">Print</button><button class="btn btn-gold" data-slipx="save">Download payslip</button>`) +
    `<section class="card" id="slip">${slipHTML(e, l, p, run.final)}</section>`;
};
function slipHTML(e, l, p, final) {
  const row = (k, v, strong) => (v || strong ? `<tr><td>${k}</td><td class="num">${strong ? `<b>${money(v)}</b>` : money(v)}</td></tr>` : "");
  return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid var(--blue);padding-bottom:14px;margin-bottom:14px">
      <div style="display:flex;gap:12px;align-items:center"><img src="${CO_LOGO}" alt="" width="48" height="48" style="flex:none"><div><div style="font-weight:800;font-size:20px">${esc(S.org?.companyName || CO_DEFAULT)}</div><div class="t-muted" style="font-size:14px">Payslip for ${esc(p.label)}${final ? "" : " (draft)"}</div></div></div>
      <div style="text-align:right"><div style="font-weight:800;font-size:18px">${esc(fullName(e))}</div><div class="t-muted" style="font-size:14px">${esc(e.no)} · ${esc(pos(e.posId)?.title || "")} · ${esc(dept(e.deptId)?.name || "")}</div>
      <div class="t-muted" style="font-size:13px">TIN ${esc(e.tin || "—")} · SSS ${esc(e.sss || "—")} · PhilHealth ${esc(e.philhealth || "—")} · Pag-IBIG ${esc(e.pagibig || "—")}</div></div>
    </div>
    <div class="row" style="gap:24px">
      <div style="flex:1 1 260px"><h3 style="font-size:15px;margin-bottom:6px">Earnings</h3><table><tbody>
        ${row(e.payType === "DAILY" ? `Basic pay (${PAY.r2(l.days)} days at ${money(l.daily)})` : "Basic pay (half month)", l.basic, true)}${row("Regular holiday pay", l.hol)}${row("Back pay (pay change)", l.bp || 0)}${row("Paid leave", l.leave)}
        ${l.absent ? `<tr><td>Less absences and unpaid leave</td><td class="num">(${money(l.absent)})</td></tr>` : ""}${l.tardy ? `<tr><td>Less late and undertime</td><td class="num">(${money(l.tardy)})</td></tr>` : ""}
        ${row("Overtime", l.ot)}${row("Rest day work", l.rd)}${row("Regular holiday worked", l.rhw)}${row("Special day worked", l.sh)}${row("Holiday and rest day overtime, double holiday", l.xp)}${row("Night differential", l.nd)}${row("Commission", l.comm)}${row("Taxable adjustment", l.adj)}${row("Non-taxable allowance", l.adjN)}
        ${row("FlexBen, tax-free", PAY.r2((l.flexN || 0) + (l.flexE || 0) + (l.flexB || 0) - rbOf(l)))}${row("Reimbursements", rbOf(l))}${row("FlexBen, taxable", l.flexT)}
        ${(e.allow || []).length && (l.allowN || l.allowT) ? `${row("Allowances, tax-free (de minimis)", l.allowN)}${row("Allowances, taxable", l.allowT)}` : ""}
        <tr><td><b>Gross pay</b></td><td class="num"><b>${money(l.gross)}</b></td></tr></tbody></table></div>
      <div style="flex:1 1 260px"><h3 style="font-size:15px;margin-bottom:6px">Deductions</h3><table><tbody>
        ${row("SSS", l.sss, true)}${row("PhilHealth", l.ph, true)}${row("Pag-IBIG", l.hd, true)}<tr><td>Withholding tax${l.mwe ? " (minimum wage earner)" : ""}${l.taxAdj ? ` (includes ${l.taxAdj < 0 ? "refund" : "year-end catch-up"} of ${money(Math.abs(l.taxAdj))})` : ""}</td><td class="num">${money(l.tax)}</td></tr>${row("Other deductions", l.ded)}
        ${Object.entries(l.loans || {}).map(([lid, amt]) => row(esc(loanLabel(lid)), amt)).join("")}
        <tr><td><b>Total deductions</b></td><td class="num"><b>${money(l.sss + l.ph + l.hd + l.tax + l.ded + (l.loanTot || 0))}</b></td></tr></tbody></table>
        <div class="panel" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center"><b>Net pay</b><b style="font-size:24px">${peso.format(l.net)}</b></div></div>
    </div>
    <p class="t-muted" style="font-size:12px;margin:14px 0 0">Employer share this cutoff: SSS ${money(l.sssEr)}, EC ${money(l.ec)}, PhilHealth ${money(l.phEr)}, Pag-IBIG ${money(l.hdEr)}. Monthly salary credit ${money(l.msc)}.</p>`;
}

/* ---------- government contributions ---------- */
VIEWS.contrib = () => {
  const month = S.month || PAY.shiftPeriod(curPeriod(), -2).slice(0, 7);
  const ids = [month + "-1", month + "-2"]; ids.forEach(ensureRun);
  const runs = ids.map(payrun); const label = new Date(month + "-01T00:00:00").toLocaleString("en-PH", { month: "long", year: "numeric" });
  const rows = contribRows(runs);
  const T = (k) => PAY.r2(rows.reduce((a, r) => a + r[k], 0));
  const months = []; for (let i = 0; i < 12; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(PAY.iso(d).slice(0, 7)); }
  const draft = runs.some((r) => !r.final);
  return head(`Monthly remittances for ${label}`, "Gov't Contributions", `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="lbl" style="color:var(--onblue)">Month</span><select class="input" style="width:auto;color:var(--ink)" data-month-pick>${opts(months.map((m) => [m, new Date(m + "-01T00:00:00").toLocaleString("en-PH", { month: "long", year: "numeric" })]), month)}</select></label>`) + `
    ${draft ? `<div class="notice"><span><span class="chip c-warn">Includes draft payroll</span> ${runs.filter((r) => !r.final).length === 2 ? "Neither cutoff" : "One cutoff"} of ${esc(label)} is not final yet, so these amounts can still change.</span><button class="btn btn-ghost btn-sm" data-go="payroll">Open payroll</button></div>` : ""}
    <section class="stats">
      <div class="card stat"><span class="label">SSS</span><span class="value" style="font-size:28px">${peso.format(T("sss") + T("sssEr") + T("ec"))}</span><span class="note t-muted">Employee ${money(T("sss"))} · employer ${money(T("sssEr"))} · EC ${money(T("ec"))}</span></div>
      <div class="card stat"><span class="label">PhilHealth</span><span class="value" style="font-size:28px">${peso.format(T("ph") + T("phEr"))}</span><span class="note t-muted">Employee ${money(T("ph"))} · employer ${money(T("phEr"))}</span></div>
      <div class="card stat"><span class="label">Pag-IBIG</span><span class="value" style="font-size:28px">${peso.format(T("hd") + T("hdEr"))}</span><span class="note t-muted">Employee ${money(T("hd"))} · employer ${money(T("hdEr"))}</span></div>
      <div class="card stat"><span class="label">Tax withheld (BIR 1601-C)</span><span class="value" style="font-size:28px">${peso.format(T("tax"))}</span><span class="note t-muted">on ${peso.format(T("taxable"))} taxable pay</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Per employee</h2><span style="display:flex;gap:8px;flex-wrap:wrap">${[["sss", "SSS"], ["ph", "PhilHealth"], ["hdmf", "Pag-IBIG"], ["bir", "BIR"]].map(([k, l]) => `<button class="btn btn-ghost btn-sm" data-ctx="${k}">${l} list (CSV)</button>`).join("")}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>SSS no.</th><th class="num">SSS EE</th><th class="num">SSS ER + EC</th><th class="num">PhilHealth EE</th><th class="num">PhilHealth ER</th><th class="num">Pag-IBIG EE</th><th class="num">Pag-IBIG ER</th><th class="num">Tax</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((r) => `<tr class="go" data-emp="${r.e.id}" tabindex="0"><td>${esc(fullName(r.e))}</td><td class="t-muted">${esc(r.e.sss || "—")}</td><td class="num">${money(r.sss)}</td><td class="num">${money(r.sssEr + r.ec)}</td><td class="num">${money(r.ph)}</td><td class="num">${money(r.phEr)}</td><td class="num">${money(r.hd)}</td><td class="num">${money(r.hdEr)}</td><td class="num">${money(r.tax)}</td></tr>`).join("") || '<tr><td colspan="9" class="empty">No payroll for this month yet.</td></tr>'}
      </tbody></table></div></section>`;
};
function contribRows(runs) {
  const by = new Map();
  for (const r of runs) for (const [id, l] of Object.entries(r.lines)) {
    const e = S.emps.get(id); if (!e) continue;
    const a = by.get(id) || { e, msc: l.msc, monthly: l.monthly, sss: 0, sssEr: 0, ec: 0, ph: 0, phEr: 0, hd: 0, hdEr: 0, tax: 0, taxable: 0, gross: 0 };
    for (const k of ["sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "tax", "taxable", "gross"]) a[k] = PAY.r2(a[k] + l[k]);
    by.set(id, a);
  }
  return [...by.values()].sort((a, b) => a.e.last.localeCompare(b.e.last));
}

/* ---------- dashboard and profile panels ---------- */
function timePanels() {
  const today = todayISO(); const out = onLeave(today); const id = curPeriod(); const p = PAY.period(id); const run = payrun(id);
  const pending = allLeaves().filter((l) => l.status === "PENDING");
  return `<div class="row">
    ${navAllowed("Timekeeping") ? `    <section class="card"><div class="card-head"><h2>On leave today (${out.length})</h2><button class="link" data-go="leave">Leave</button></div>
      ${out.length ? `<ul class="list">${out.slice(0, 6).map((l) => { const e = S.emps.get(l.empId); return `<li><button class="person tile" style="border:0;padding:0" data-emp="${e.id}">${avatar(e, 36)}<span class="who"><span class="name" style="font-size:14px">${esc(fullName(e))}</span><span class="sub">${esc(leaveType(l.type)?.name || l.type)} until ${fmtDate(l.to)}</span></span></button></li>`; }).join("")}</ul>` : '<p class="t-muted" style="margin:0">Everyone is in today.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Leave waiting for approval</h2></div>
      <div class="stat"><span class="value">${pending.length}</span><span class="note ${pending.length ? "t-warn" : "t-ok"}">${pending.length ? "requests to approve or reject" : "nothing waiting"}</span></div>
      ${pending.length ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" data-leave-pending>Review requests</button>` : ""}</section>
` : ""}
    ${navAllowed("Payroll") ? `    <section class="card"><div class="card-head"><h2>This pay period</h2><button class="link" data-go="payroll">Payroll</button></div>
      <div class="stat"><span class="label">${esc(p.label)}</span><span class="value" style="font-size:28px">${peso.format((S.scope ? scopeTotals(run.lines, active()) : run.totals).net)}</span><span class="note ${run.final ? "t-ok" : "t-muted"}">${run.final ? "Final net pay" : "Estimated net pay, still a draft"}</span></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-go="attendance">Open time sheet</button></section>
` : ""}
  </div>`;
}
function profilePanels(e) {
  const year = String(new Date().getFullYear()); const b = balances(e, year);
  const mine = allLeaves().filter((l) => l.empId === e.id).sort((a, c) => c.from.localeCompare(a.from));
  const slips = [...S.runs.entries()].filter(([id, r]) => r.lines[e.id] && isFinal(id)).sort((a, c) => c[0].localeCompare(a[0])).slice(0, 6);
  return `<section class="card"><div class="card-head"><h2>Leave in ${year}</h2>${S.canEdit && !e.separated ? `<button class="btn btn-ghost btn-sm" data-file-leave="${e.id}">File leave</button>` : ""}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">${b.filter((x) => ["VL", "SL"].includes(x.code)).map((x) => `<div class="panel" style="flex:1;min-width:120px;padding:12px"><div class="t-muted" style="font-size:13px;font-weight:700">${esc(x.name)}</div><b style="font-size:22px">${x.left}</b> <span class="t-muted" style="font-size:13px">of ${x.days} left</span></div>`).join("")}</div>
      ${mine.length ? `<ul class="list" style="font-size:14px">${mine.slice(0, 5).map((l) => `<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><b>${esc(leaveType(l.type)?.name || l.type)}</b> <span class="t-muted">${fmtDate(l.from)}${l.to !== l.from ? " to " + fmtDate(l.to) : ""} · ${l.days} d</span></span><span class="chip ${LSTATUS[l.status][1]}">${LSTATUS[l.status][0]}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">No leave filed.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Payslips</h2></div>
      ${slips.length ? `<ul class="list">${slips.map(([id, r]) => `<li><button class="tile" style="display:flex;justify-content:space-between;gap:12px" data-slip-open="${id}:${e.id}"><span>${esc(PAY.period(id).label)}</span><b>${peso.format(r.lines[e.id].net)}</b></button></li>`).join("")}</ul>` : `<p class="t-muted" style="margin:0">No final payslips yet. <button class="link" data-slip-open="${curPeriod()}:${e.id}">See this period's draft</button></p>`}</section>`;
}

/* ---------- CSV for time and pay ---------- */
function timeExport(kind) {
  const id = S.periodId || curPeriod(); const p = PAY.period(id);
  if (kind === "template") {
    const run = payrun(id); const doc = periodDoc(id);
    const list = refilter([...S.emps.values()].filter((e) => run.lines[e.id]), { q: "", dept: "", project: "" });
    return offer(`timesheet-${id}.csv`, toCSV([["Employee No", "Name", ...PAY.FIELDS.map(([, l]) => l)], ...list.map((e) => [e.no, fullName(e), ...PAY.FIELDS.map(([k]) => doc.rows?.[e.id]?.[k] || 0)])]));
  }
  const run = payrun(id); const emps = refilter([...S.emps.values()].filter((e) => run.lines[e.id]), { q: "", dept: "", project: "" });
  if (kind === "register") return offer(`payroll-register-${id}.csv`, toCSV([["Employee No", "Name", "Charged to", "Pay type", "Rate", "Days", "Basic", "Holiday pay", "Leave pay", "Absences", "Late/undertime", "Overtime", "Rest day", "Reg. holiday worked", "Special day worked", "Holiday/rest day OT, double holiday", "Night diff", "Taxable adj.", "Non-taxable allowance", "De minimis allowances", "Taxable allowances", "Commission", "FlexBen non-taxable", "FlexBen taxable", "Gross", "SSS", "PhilHealth", "Pag-IBIG", "Taxable", "Tax", "Other deductions", "Loans", "Net pay", "SSS ER", "EC", "PhilHealth ER", "Pag-IBIG ER"],
    ...emps.map((e) => { const l = run.lines[e.id]; return [e.no, fullName(e), chargeName(l, e), e.payType === "DAILY" ? "Daily" : "Monthly", e.basicPay, l.days, l.basic, l.hol, l.leave, l.absent, l.tardy, l.ot, l.rd, l.rhw, l.sh, l.xp || 0, l.nd, l.adj, l.adjN, l.allowN || 0, l.allowT || 0, l.comm || 0, PAY.r2((l.flexN || 0) + (l.flexE || 0) + (l.flexB || 0)), l.flexT || 0, l.gross, l.sss, l.ph, l.hd, l.taxable, l.tax, l.ded, l.loanTot || 0, l.net, l.sssEr, l.ec, l.phEr, l.hdEr]; })]));
  if (kind === "bank") return offer(`bank-file-${id}.csv`, toCSV([["Employee No", "Name", "Bank", "Account No", "Net pay", "Pay period"], ...emps.map((e) => [e.no, fullName(e), e.bank || "", e.bankAcct || "", run.lines[e.id].net, p.label])]));
  if (kind === "13th") { const y = String(new Date().getFullYear()); return offer(`13th-month-${y}.csv`, toCSV([["Employee No", "Name", "Months in year", "Monthly basic", "Basic paid (final payrolls)", "Commissions (final payrolls)", "Estimated 13th month"], ...thirteenthRows(y).map((r) => [r.e.no, fullName(r.e), r.months, r.monthly, r.paid, r.comm, r.est])])); }
}
function contribExport(kind) {
  const month = S.month || PAY.shiftPeriod(curPeriod(), -2).slice(0, 7); const rows = contribRows([month + "-1", month + "-2"].map(payrun));
  const name = (e) => [e.last, e.first, e.middle || ""];
  const files = {
    sss: [["SSS No", "Last Name", "First Name", "Middle Name", "Monthly Salary Credit", "Employee Share", "Employer Share", "EC", "Total", "Of which WISP (MSC above 20,000)"], ...rows.map((r) => [r.e.sss, ...name(r.e), r.msc, r.sss, r.sssEr, r.ec, PAY.r2(r.sss + r.sssEr + r.ec), PAY.r2(Math.max(0, r.msc - 20000) * 0.15)])],
    ph: [["PhilHealth No", "Last Name", "First Name", "Middle Name", "Monthly Basic Salary", "Employee Share", "Employer Share", "Total"], ...rows.map((r) => [r.e.philhealth, ...name(r.e), r.monthly, r.ph, r.phEr, PAY.r2(r.ph + r.phEr)])],
    hdmf: [["Pag-IBIG MID No", "Last Name", "First Name", "Middle Name", "Monthly Compensation", "Employee Share", "Employer Share", "Total"], ...rows.map((r) => [r.e.pagibig, ...name(r.e), r.monthly, r.hd, r.hdEr, PAY.r2(r.hd + r.hdEr)])],
    bir: [["TIN", "Last Name", "First Name", "Middle Name", "Gross Compensation", "Taxable Compensation", "Tax Withheld"], ...rows.map((r) => [r.e.tin, ...name(r.e), r.gross, r.taxable, r.tax])],
  };
  return offer(`${kind}-${month}.csv`, toCSV(files[kind]));
}
function leaveExport(kind) {
  if (kind === "list") return offer(`leave-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Leave", "From", "To", "Days", "Status", "Reason", "Filed"], ...allLeaves().sort((a, b) => b.from.localeCompare(a.from)).map((l) => { const e = S.emps.get(l.empId); return [e?.no, e ? fullName(e) : "", leaveType(l.type)?.name || l.type, l.from, l.to, l.days, LSTATUS[l.status][0], l.reason, l.filed]; })]));
  const y = String(new Date().getFullYear());
  return offer(`leave-balances-${y}.csv`, toCSV([["Employee No", "Name", ...SET().leaveTypes.flatMap((t) => [`${t.name} used`, ...(t.days == null ? [] : [`${t.name} left`])])],
    ...active().sort((a, b) => a.last.localeCompare(b.last)).map((e) => [e.no, fullName(e), ...balances(e, y).flatMap((b) => [b.used, ...(b.days == null ? [] : [b.left])])])]));
}
async function importTimesheet(text) {
  const id = S.periodId || curPeriod(); const rows = parseCSV(text);
  if (rows.length < 2) { toast("That file has no rows."); return; }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const byNo = new Map([...S.emps.values()].map((e) => [String(e.no).toLowerCase(), e]));
  const ci = (label) => header.indexOf(label.toLowerCase());
  const noCol = ci("Employee No"); if (noCol < 0) { toast("The file needs an Employee No column. Download the time sheet to get the layout."); return; }
  const patch = {}; let skipped = 0;
  for (const r of rows.slice(1)) {
    const e = byNo.get((r[noCol] || "").trim().toLowerCase()); if (!e) { skipped++; continue; }
    const v = {}; for (const [k, l] of PAY.FIELDS) { const i = ci(l); if (i >= 0) v[k] = Math.max(0, Number(String(r[i] || "0").replace(/[^0-9.]/g, "")) || 0); }
    patch[e.id] = v;
  }
  const n = Object.keys(patch).length; if (!n) { toast("No employee numbers in the file matched."); return; }
  try { await savePeriodRows(id, patch); logActivity(`Imported time records for ${n} employees (${PAY.period(id).label})`); toast(`Time records loaded for ${n} people${skipped ? `, ${skipped} rows skipped` : ""}.`); render(); }
  catch { toast("Couldn't save the time sheet. Try again."); }
}

/* ---------- events for time and pay ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-tpage],[data-leave-tab],[data-pay-tab],[data-lpage],[data-lv-set],[data-pay-act],[data-slip],[data-slip-open],[data-slipx],[data-tsx],[data-payx],[data-ctx],[data-lvx],[data-del-hol],[data-file-leave],[data-leave-pending]");
  if (!t) return;
  const d = t.dataset;
  if (d.tpage) { const [k, n] = d.tpage.split(":"); const f = { ts: S.tsFilter, pay: S.payFilter, bal: S.balFilter }[k]; f.page += Number(n); k === "ts" ? redrawTs() : render(); return; }
  if (d.leaveTab) { S.leaveTab = d.leaveTab; render(); return; }
  if (d.payTab) { S.payTab = d.payTab; render(); return; }
  if (d.lpage) { S.leaveFilter.page += Number(d.lpage); render(); return; }
  if (t.hasAttribute("data-leave-pending")) { S.leaveTab = "requests"; S.leaveFilter = { ...S.leaveFilter, status: "PENDING", page: 1 }; go("leave"); return; }
  if (d.fileLeave) { go("leaveForm", { emp: d.fileLeave }); return; }
  if (d.lvSet) { const [m, id, st] = d.lvSet.split(":"); t.disabled = true; try { await setLeaveStatus(m, id, st); } catch { t.disabled = false; toast("Couldn't update. Try again."); } return; }
  if (d.payAct) { t.disabled = true; const id = S.periodId || curPeriod(); try { d.payAct === "finalize" ? await finalizePayroll(id) : await reopenPayroll(id); } catch { toast("Couldn't save. Try again."); } t.disabled = false; return; }
  if (d.slip) { go("payslip", { pid: S.periodId || curPeriod(), emp: d.slip }); return; }
  if (d.slipOpen) { const [pid, emp] = d.slipOpen.split(":"); go("payslip", { pid, emp }); return; }
  if (d.slipx === "print") { window.print(); return; }
  if (d.slipx === "save") {
    const e = S.emps.get(S.view.emp); const p = PAY.period(S.view.pid); const run = payrun(S.view.pid);
    const html = `<!doctype html><meta charset="utf-8"><title>Payslip ${esc(e.no)} ${esc(p.label)}</title><style>body{font-family:system-ui,sans-serif;color:#14213D;max-width:820px;margin:24px auto;padding:0 16px}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-bottom:1px solid #E1E6F2}.num{text-align:right}.t-muted{color:#5A6478}.panel{background:#EEF2FF;border-radius:12px;padding:12px}.row{display:flex;flex-wrap:wrap}h3{margin:0}</style>${slipHTML(e, run.lines[e.id], p, run.final)}`;
    if (!S.downloads) { toast("Downloads aren't available in this view."); return; }
    try { await S.downloads.save({ filename: `payslip-${e.no}-${S.view.pid}.html`, data: new Blob([html], { type: "text/html" }) }); } catch { toast("The download was cancelled."); }
    return;
  }
  if (d.tsx) return timeExport(d.tsx);
  if (d.payx) return timeExport(d.payx);
  if (d.ctx) return contribExport(d.ctx);
  if (d.lvx) return leaveExport(d.lvx);
  if (d.delHol) { await saveSettings({ holidays: SET().holidays.filter((h) => h.d !== d.delHol) }, "Removed a holiday"); return; }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.matches("tr[data-slip]")) go("payslip", { pid: S.periodId || curPeriod(), emp: ev.target.dataset.slip }); });
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.tfilter) { const [k, field] = t.dataset.tfilter.split(":"); const f = { ts: S.tsFilter, pay: S.payFilter, bal: S.balFilter }[k]; f[field] = t.value; f.page = 1; k === "ts" ? redrawTs() : render(); return; }
  if (t.dataset.lfilter) { S.leaveFilter[t.dataset.lfilter] = t.value; S.leaveFilter.page = 1; render(); return; }
  if (t.id === "lf-filter") { const q = t.value.toLowerCase(); $("#lf-emp").innerHTML = leaveEmpOptions(active().filter((e) => `${fullName(e)} ${e.no}`.toLowerCase().includes(q)).sort((a, b) => a.last.localeCompare(b.last))); }
  if (t.closest("#leave-form")) { const h = $("#lf-hint"); if (h) h.innerHTML = leaveHint(); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.dataset.periodPick) { S.periodId = t.value; render(); return; }
  if (t.hasAttribute("data-month-pick")) { S.month = t.value; render(); return; }
  if (t.closest("#leave-form")) { const h = $("#lf-hint"); if (h) h.innerHTML = leaveHint(); }
  if (t.id === "ts-file" && t.files[0]) { importTimesheet(await t.files[0].text()); t.value = ""; return; }
  if (t.dataset.ts) {
    const [empId, k] = t.dataset.ts.split(":"); const id = S.periodId || curPeriod();
    const v = Math.max(0, Number(t.value) || 0);
    try { await savePeriodRows(id, { [empId]: { [k]: v } }); const c = document.getElementById("tsd-" + empId); if (c) c.innerHTML = `<b>${PAY.r2(payrun(id).lines[empId]?.days || 0)}</b>`; }
    catch { toast("Couldn't save that entry. Try again."); }
  }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!S.canEdit) return;
  if (f.id === "leave-form") return submitLeave();
  if (f.id === "lt-form") {
    const types = SET().leaveTypes.map((x, i) => (x.days == null ? x : { ...x, days: Math.max(0, Number(f.elements["lt-" + i]?.value) || 0) }));
    return saveSettings({ leaveTypes: types }, "Updated leave credits");
  }
  if (f.id === "rules-form") return saveSettings({ factor: Number($("#r-factor").value), minWage: Math.max(0, Number($("#r-min").value) || 0) }, "Updated pay rules");
  if (f.id === "hol-form") { const dd = $("#h-d").value, name = $("#h-name").value.trim(); if (!dd || !name) return; return saveSettings({ holidays: [...SET().holidays.filter((h) => h.d !== dd), { d: dd, name, type: $("#h-type").value }] }, `Added holiday ${name}`); }
  if (f.id === "shift-form") { const name = $("#s-name").value.trim(); if (!name) return; return saveSettings({ shifts: [...SET().shifts, { id: uid(), name, start: $("#s-start").value, end: $("#s-end").value }] }, `Added shift ${name}`); }
});
