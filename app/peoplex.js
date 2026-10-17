/* ---------- People: HR dashboard, contracts, employee change log ---------- */
Object.assign(TCOLS, { contracts: "ctrs", empaudit: "audits" });
Object.assign(S, { ctrs: new Map(), audits: new Map(), ctrTab: "expiring", audF: { kind: "", q: "", days: "90" }, hrdLv: { st: "PENDING", page: 1 }, hrdAl: { dept: "", q: "", page: 1 } });
{
  const ppl = NAV.find(([g]) => g === "People"); ppl[1].unshift(["hrdash", "HR dashboard", "dash"]);
  const i = ppl[1].findIndex(([v]) => v === "employees"); ppl[1].splice(i + 1, 0, ["contracts", "Contracts", "file"], ["audit", "Employee change log", "log"]);
  Object.assign(SECTION_OF, { hrdash: "hrdash", contracts: "contracts", audit: "audit" });
}
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("contracts").limit(3000).onSnapshot((snap) => { S.ctrs = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
  db.collection("empaudit").orderBy("at", "desc").limit(3000).onSnapshot((snap) => { S.audits = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {}); }; }

/* ---------- employee change audit: every save of a 201 file records what changed ---------- */
const AUD_FIELDS = {
  first: ["Name", "First name"], middle: ["Name", "Middle name"], last: ["Name", "Last name"], civil: ["Personal", "Civil status"], birth: ["Personal", "Birth date"],
  address: ["Address and contact", "Address"], mobile: ["Address and contact", "Mobile number"], email: ["Address and contact", "Email"],
  emergencyName: ["Address and contact", "Emergency contact"], emergencyPhone: ["Address and contact", "Emergency phone"],
  posId: ["Position", "Position"], title: ["Position", "Title"], rank: ["Position", "Rank"], status: ["Position", "Employment status"],
  deptId: ["Assignment", "Department"], projectId: ["Assignment", "Project"], projectRole: ["Assignment", "Project role"], projectUntil: ["Assignment", "Project end"], supervisorId: ["Assignment", "Supervisor"], shiftId: ["Assignment", "Shift"],
  basicPay: ["Pay rate", "Basic pay"], payType: ["Pay rate", "Pay basis"], allow: ["Pay rate", "Allowances"],
  sss: ["Government numbers", "SSS"], philhealth: ["Government numbers", "PhilHealth"], pagibig: ["Government numbers", "Pag-IBIG"], tin: ["Government numbers", "TIN"],
  bank: ["Bank", "Bank"], bankAcct: ["Bank", "Account number"], separated: ["Separation", "Separation"], contractEnd: ["Assignment", "Contract end"],
};
const AUD_KINDS = ["Address and contact", "Position", "Assignment", "Pay rate", "Government numbers", "Bank", "Personal", "Name", "Separation"];
function audVal(f, v) {
  if (v == null || v === "") return "";
  if (f === "posId") return pos(v)?.title || v; if (f === "deptId") return dept(v)?.name || v; if (f === "projectId") return S.projects.get(v)?.name || v;
  if (f === "supervisorId") { const s = S.emps.get(v); return s ? fullName(s) : v; } if (f === "status") return STATUS[v]?.[0] || v;
  if (f === "shiftId") return SET().shifts.find((s) => s.id === v)?.name || v; if (f === "payType") return ptLabel(v);
  if (f === "basicPay") return peso.format(v); if (f === "allow") return Array.isArray(v) ? v.map((a) => `${a.name || a.code || ""} ${a.amt != null ? peso.format(a.amt) : ""}`.trim()).join(", ") : JSON.stringify(v);
  if (f === "separated") return v.date ? `${fmtDate(v.date)} · ${v.reason || ""}` : ""; if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmtDate(v);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
{
  const base = saveEmp;
  saveEmp = async (e) => {
    const prev = S.emps.get(e.id); await base(e);
    if (!prev || !S.db) return;
    const changes = []; for (const f of Object.keys(AUD_FIELDS)) { const pv = prev[f] === "" ? null : prev[f] ?? null, nv = e[f] === "" ? null : e[f] ?? null; if (f === "shiftId" && pv == null && nv === "day") continue; const a = JSON.stringify(pv), b = JSON.stringify(nv); if (a !== b) changes.push({ f, from: prev[f] ?? null, to: e[f] ?? null }); }
    if (!changes.length) return;
    const rec = { empId: e.id, at: new Date().toISOString(), by: S.myId || null, changes: JSON.parse(JSON.stringify(changes)) };
    const id = uid(); try { await S.db.doc(`empaudit/${id}`).set(rec); S.audits.set(id, { id, ...rec }); } catch {}
  };
}
function audRows(list) {
  return list.flatMap((r) => r.changes.map((c) => ({ r, c, kind: AUD_FIELDS[c.f]?.[0] || "Other", label: AUD_FIELDS[c.f]?.[1] || c.f })));
}
function audTable(rows, showEmp = true) {
  if (!rows.length) return '<p class="t-muted" style="margin:0">No changes recorded yet. Changes are recorded from now on, each time a 201 file is saved.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>When</th>${showEmp ? "<th>Employee</th>" : ""}<th>What changed</th><th>From</th><th>To</th><th>By</th></tr></thead><tbody>
    ${rows.map(({ r, c, kind, label }) => { const e = S.emps.get(r.empId); let to = esc(audVal(c.f, c.to)) || '<span class="t-muted">blank</span>';
      if (c.f === "basicPay" && c.from && c.to) { const p = ((c.to - c.from) / c.from) * 100; to += ` <span class="chip ${p >= 0 ? "c-ok" : "c-bad"}">${p >= 0 ? "+" : ""}${p.toFixed(1)}%</span>`; }
      return `<tr><td class="t-muted" style="white-space:nowrap">${fmtDate(r.at.slice(0, 10))}<div style="font-size:12px">${esc(timeFmt.format(new Date(r.at)))}</div></td>
        ${showEmp ? `<td>${e ? `<button class="link" data-emp="${e.id}">${esc(fullName(e))}</button>` : "Removed employee"}</td>` : ""}<td><b>${esc(label)}</b><div class="t-muted" style="font-size:12px">${esc(kind)}</div></td>
        <td class="t-muted">${esc(audVal(c.f, c.from)) || "blank"}</td><td>${to}</td><td class="t-muted">${r.by ? esc(recName(r.by).replace(/ \(you\)$/, "")) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`;
}
VIEWS.audit = () => {
  const F = S.audF; const since = F.days === "all" ? "" : addDays(todayISO(), -Number(F.days)); const q = F.q.toLowerCase();
  let rows = audRows(listOf(S.audits).filter((r) => r.at.slice(0, 10) >= since).sort((a, b) => b.at.localeCompare(a.at)));
  if (F.kind) rows = rows.filter((x) => x.kind === F.kind);
  if (q) rows = rows.filter((x) => { const e = S.emps.get(x.r.empId); return `${e ? fullName(e) + " " + e.no : ""} ${x.label} ${audVal(x.c.f, x.c.from)} ${audVal(x.c.f, x.c.to)}`.toLowerCase().includes(q); });
  const cnt = (k) => audRows(listOf(S.audits).filter((r) => r.at.slice(0, 10) >= since)).filter((x) => x.kind === k).length;
  return head("People", "Employee change log") + `
    <section class="stats">${["Address and contact", "Position", "Assignment", "Pay rate"].map((k) => `<button class="card stat kpi-btn" data-aud-kind="${k}"><span class="label">${k === "Pay rate" ? "Pay rate changes" : k}</span><span class="value">${cnt(k)}</span><span class="note t-muted">${F.days === "all" ? "all time" : `last ${F.days} days`}</span></button>`).join("")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input class="input" type="search" id="aud-q" value="${esc(F.q)}" placeholder="Search name, number or value" aria-label="Search changes" style="flex:1;min-width:200px">
      <select class="input" id="aud-kind" style="width:auto" aria-label="Kind of change">${opts(AUD_KINDS.map((k) => [k, k]), F.kind, "All changes")}</select>
      <select class="input" id="aud-days" style="width:auto" aria-label="Period">${opts([["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]], F.days)}</select></section>
    <section class="card">${audTable(rows.slice(0, 300))}${rows.length > 300 ? `<p class="t-muted" style="margin:10px 0 0;font-size:13px">Showing the latest 300 of ${rows.length}. Narrow the search to see more.</p>` : ""}</section>`;
};
{ const base = VIEWS.employee; VIEWS.employee = () => { const html = base(); const e = S.emps.get(S.view.id); if (!e) return html;
  const rows = audRows(listOf(S.audits).filter((r) => r.empId === e.id).sort((a, b) => b.at.localeCompare(a.at)));
  return html + `<section class="card"><div class="card-head"><h2>Change history</h2><span class="t-muted" style="font-size:13px">Address, contact, position, assignment and pay changes</span></div>${audTable(rows.slice(0, 40), false)}</section>`; }; }

/* ---------- contracts ---------- */
const CTYPES = { PROBATIONARY: "Probationary", PROJECT_BASED: "Project-based", CONTRACTUAL: "Fixed-term", CASUAL: "Casual", REGULAR: "Regular" };
function ctrOf(e) {
  const recs = listOf(S.ctrs).filter((c) => c.empId === e.id).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  let start = e.hire, end = null;
  if (e.status === "PROBATIONARY") end = regDue(e);
  else if (e.status === "PROJECT_BASED") { start = e.projectSince || e.hire; end = e.projectUntil || S.projects.get(e.projectId)?.end || null; }
  else if (["CONTRACTUAL", "CASUAL"].includes(e.status)) { start = recs[0]?.start || e.hire; end = e.contractEnd || recs[0]?.end || null; }
  const left = end ? daysBetween(todayISO(), end) : null;
  return { e, type: e.status, start, end, left, recs, signed: recs.find((r) => r.signed)?.signed || null };
}
const leftChip = (c) => c.end == null ? (c.type === "REGULAR" ? '<span class="chip c-ok">No end date</span>' : '<span class="chip c-warn">End date not set</span>')
  : c.left < 0 ? `<span class="chip c-bad">Ended ${-c.left} ${c.left === -1 ? "day" : "days"} ago</span>` : `<span class="chip ${c.left <= 15 ? "c-bad" : c.left <= 30 ? "c-warn" : "c-gray"}">${c.left === 0 ? "Ends today" : `${c.left} ${c.left === 1 ? "day" : "days"} left`}</span>`;
VIEWS.contracts = () => {
  const all = active().map(ctrOf); const tab = S.ctrTab || "expiring"; const ed = S.canEdit;
  const exp = all.filter((c) => c.end && c.left <= 60 && c.left >= -30 && c.type !== "PROBATIONARY").sort((a, b) => a.left - b.left);
  const prob = all.filter((c) => c.type === "PROBATIONARY").sort((a, b) => (a.end || "").localeCompare(b.end || ""));
  const fixed = all.filter((c) => ["PROJECT_BASED", "CONTRACTUAL", "CASUAL"].includes(c.type)).sort((a, b) => (a.end || "9").localeCompare(b.end || "9"));
  const noEnd = fixed.filter((c) => !c.end);
  const list = { expiring: exp, prob, fixed, all: all.slice().sort((a, b) => fullName(a.e).localeCompare(fullName(b.e))) }[tab] || exp;
  return head("People", "Contracts") + `
    <section class="stats">
      <div class="card stat"><span class="label">Contracts ending in 30 days</span><span class="value">${exp.filter((c) => c.left >= 0 && c.left <= 30).length}</span><span class="note t-warn">${exp.filter((c) => c.left < 0).length} already ended, not yet renewed or closed</span></div>
      <div class="card stat"><span class="label">Probation ending in 30 days</span><span class="value">${prob.filter((c) => c.left != null && c.left <= 30).length}</span><span class="note t-muted">${prob.length} on probation · decide before 6 months</span></div>
      <div class="card stat"><span class="label">Fixed-term and project-based</span><span class="value">${fixed.length}</span><span class="note ${noEnd.length ? "t-warn" : "t-muted"}">${noEnd.length} without an end date</span></div>
      <div class="card stat"><span class="label">Signed copies on file</span><span class="value">${all.filter((c) => c.signed).length}</span><span class="note t-muted">of ${all.length} employees</span></div></section>
    ${tabsBar(tab, [["expiring", `Expiring (${exp.length})`], ["prob", `Probation ending (${prob.length})`], ["fixed", "Fixed-term and project"], ["all", "All employees"]], "ctr-tab")}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Contract</th><th>Start</th><th>End</th><th>Status</th><th>Signed copy</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.slice(0, 200).map((c) => `<tr><td>${personCell(c.e, `${esc(pos(c.e.posId)?.title || "")} · ${esc(unitName(c.e))}`, 200)}</td><td><span class="chip ${STATUS[c.type]?.[1] || "c-gray"}">${esc(CTYPES[c.type] || c.type)}</span>${c.recs.length ? `<div class="t-muted" style="font-size:12px">${c.recs.length} ${c.recs.length === 1 ? "renewal" : "renewals"} on record</div>` : ""}</td>
        <td style="white-space:nowrap">${fmtDate(c.start)}</td><td style="white-space:nowrap">${c.end ? fmtDate(c.end) : "—"}</td><td>${leftChip(c)}</td>
        <td>${c.signed ? `<a class="link" href="/_blob/${esc(c.signed.id)}" target="_blank" rel="noopener">${esc(c.signed.name || "Open")}</a>` : ed && S.assets ? `<label class="link" style="cursor:pointer">Upload<input type="file" data-ctr-up="${c.e.id}" accept="application/pdf,image/jpeg,image/png" hidden></label>` : '<span class="t-muted">—</span>'}</td>
        ${ed ? `<td class="num" style="white-space:nowrap">${c.type === "PROBATIONARY" ? `<button class="btn btn-ghost btn-sm" data-go="perf">Evaluate</button>` : c.type !== "REGULAR" ? `<button class="btn btn-ghost btn-sm" data-ctr-ext="${c.e.id}">${c.end ? "Renew or extend" : "Set end date"}</button>` : ""} <button class="link" data-ctr-print="${c.e.id}">Contract</button></td>` : ""}</tr>
        ${S.ctrExt === c.e.id ? `<tr><td colspan="7"><form id="ctr-form" class="panel" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end" data-keep>
          <div class="field"><label for="ct-start">New term starts</label><input class="input" id="ct-start" type="date" value="${c.end && c.end >= todayISO() ? addDays(c.end, 1) : todayISO()}"></div>
          <div class="field"><label for="ct-end">New term ends <span class="req">*</span></label><input class="input" id="ct-end" type="date" required value="${addMonths(c.end && c.end >= todayISO() ? addDays(c.end, 1) : todayISO(), c.type === "PROJECT_BASED" ? 3 : 6)}"></div>
          <div class="field" style="flex:1;min-width:200px"><label for="ct-notes">Notes</label><input class="input" id="ct-notes" placeholder="e.g. Extended for Phase 2"></div>
          <button class="btn btn-primary">Save new term</button><button type="button" class="btn btn-ghost" data-ctr-ext="">Cancel</button></form></td></tr>` : ""}`).join("") || `<tr><td colspan="7" class="empty">${tab === "expiring" ? "No contracts ending in the next 60 days." : "No employees here."}</td></tr>`}
    </tbody></table></div>${list.length > 200 ? `<p class="t-muted" style="font-size:13px;margin:10px 0 0">Showing 200 of ${list.length}.</p>` : ""}</section>
    <p class="t-muted" style="font-size:13px;margin:0">Probation can't go past 6 months (Labor Code Art. 296): evaluate before the end date. A fixed-term or project contract renewed again and again for regular work can be treated as regular employment.</p>`;
};
function ctrLetter(e) {
  const c = ctrOf(e); const co = esc(S.org?.companyName || "the company"); const p = S.projects.get(e.projectId);
  return saveLetter(`Contract-${e.no}.html`, `Employment contract ${e.no}`, `<h2 style="text-align:center">CONTRACT OF EMPLOYMENT (${esc((CTYPES[c.type] || "").toUpperCase())})</h2>
    <p>This contract is made on ${fmtDate(todayISO())} between <b>${co}</b> (the Employer) and <b>${esc(fullName(e))}</b>${e.address ? `, of ${esc(e.address)}` : ""} (the Employee).</p>
    <table><tr><td>Position</td><td><b>${esc(pos(e.posId)?.title || "")}</b></td></tr><tr><td>Assignment</td><td>${esc(p ? p.name : dept(e.deptId)?.name || "Head Office")}</td></tr>
      <tr><td>Employment status</td><td>${esc(CTYPES[c.type] || "")}</td></tr><tr><td>Term</td><td>${fmtDate(c.start)}${c.end ? ` to ${fmtDate(c.end)}` : " with no fixed end"}</td></tr>
      <tr><td>Basic pay</td><td><b>${payLabel(e.basicPay, e.payType)}</b></td></tr></table>
    ${c.type === "PROBATIONARY" ? "<p>The Employee is on probation for up to six (6) months. The standards for regularization have been explained and given in writing. Meeting them within the probationary period makes the Employee a regular employee.</p>" : ""}
    ${c.type === "PROJECT_BASED" ? `<p>The Employee is engaged for the project ${esc(p?.name || "")}. Employment ends on completion of the project or of the phase of work assigned, which is expected on the date above.</p>` : ""}
    <p>The Employee will receive the benefits required by law, including SSS, PhilHealth and Pag-IBIG coverage, 13th month pay and service incentive leave, and will follow company rules and policies.</p>
    <div style="display:flex;justify-content:space-between;margin-top:64px;gap:40px"><div>${signer()}<br>For the Employer</div><div><b>${esc(fullName(e))}</b><br>Employee</div></div>`);
}

/* ---------- HR dashboard ---------- */
const PAGE_N = 25;
const hrPager = (cur, total, attr) => total <= PAGE_N ? "" : `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:14px"><span class="t-muted">Page ${cur} of ${Math.ceil(total / PAGE_N)}</span><span style="display:flex;gap:8px">${cur > 1 ? `<button class="btn btn-ghost btn-sm" data-${attr}="-1">Previous</button>` : ""}${cur * PAGE_N < total ? `<button class="btn btn-ghost btn-sm" data-${attr}="1">Next</button>` : ""}</span></div>`;
VIEWS.hrdash = () => {
  const act = active(); const y = todayISO().slice(0, 4); const P = S.org?.positions || []; const D = S.org?.departments || [];
  const ho = act.filter((e) => !e.projectId).length; const filledPos = new Set(act.map((e) => e.posId).filter(Boolean));
  const deptN = {}; for (const e of act) { const k = deptName(e); deptN[k] = (deptN[k] || 0) + 1; }
  const L = allLeaves().filter((l) => S.emps.get(l.empId)); const Ly = L.filter((l) => (l.from || "").startsWith(y));
  const posRows = P.map((p) => ({ p, n: act.filter((e) => e.posId === p.id).length })).sort((a, b) => b.n - a.n || a.p.title.localeCompare(b.p.title));
  const F = S.hrdLv; const lv = L.filter((l) => !F.st || l.status === F.st).sort((a, b) => (b.filed || b.from || "").localeCompare(a.filed || a.from || ""));
  const A = S.hrdAl; const types = SET().leaveTypes.filter((t) => t.days != null && !/maternity|paternity|solo|vawc|violence|magna|special|gynec|without pay/i.test(t.name)).slice(0, 4);
  const al = act.filter((e) => (!A.dept || e.deptId === A.dept) && (!A.q || `${fullName(e)} ${e.no}`.toLowerCase().includes(A.q.toLowerCase()))).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const alPage = al.slice((A.page - 1) * PAGE_N, A.page * PAGE_N); const lvPage = lv.slice((F.page - 1) * PAGE_N, F.page * PAGE_N);
  return head("People", "HR dashboard") + `
    <section class="stats kpis rd-kpis">
      ${dxTile("Total employees", act.length, `Head Office ${ho} · Projects ${act.length - ho}`)}
      ${dxTile("Job positions", P.length, `${filledPos.size} filled · ${P.length - [...filledPos].filter((id) => P.some((p) => p.id === id)).length} vacant`)}
      ${dxTile("Departments", D.length, `${Object.keys(deptN).length} with people`)}
      ${dxTile(`Leave days in ${y}`, PAY.r2(Ly.filter((l) => l.status === "APPROVED").reduce((s, l) => s + (l.days || 0), 0)), `${Ly.filter((l) => l.status === "APPROVED").length} approved requests`)}
      ${dxTile("Leave requests waiting", L.filter((l) => l.status === "PENDING").length, "to approve or reject", L.some((l) => l.status === "PENDING") ? "t-warn" : "t-ok")}
      ${dxTile("On leave today", onLeave(todayISO()).length, "approved leave")}</section>
    <div class="three"><section class="card"><div class="card-head"><h2>Employees by department</h2><button class="link" data-go="org">Organization</button></div>${hrows(Object.entries(deptN).sort((a, b) => b[1] - a[1]))}</section>
      <section class="card"><div class="card-head"><h2>Job positions</h2><span class="t-muted" style="font-size:13px">${P.length} positions</span></div><div class="table-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Position</th><th>Department</th><th class="num">People</th></tr></thead><tbody>${posRows.map((r) => `<tr><td><b>${esc(r.p.title)}</b></td><td class="t-muted">${esc(dept(r.p.deptId)?.name || "")}</td><td class="num">${r.n || '<span class="t-muted">vacant</span>'}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="card"><div class="card-head"><h2>Leaves by department</h2><span class="t-muted" style="font-size:13px">Approved days in ${y}</span></div>${(() => { const m = {}; for (const l of Ly.filter((x) => x.status === "APPROVED")) { const k = deptName(S.emps.get(l.empId)); m[k] = (m[k] || 0) + (l.days || 0); } return hrows(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, PAY.r2(v)]), (n) => `${n} d`) || '<p class="t-muted" style="margin:0">No approved leave this year yet.</p>'; })()}</section></div>
    <section class="card"><div class="card-head"><h2>Leave requests</h2><div class="tabs" role="tablist" style="margin-left:auto">${[["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${F.st === k}" data-hrd-st="${k}">${l} (${k ? L.filter((x) => x.status === k).length : L.length})</button>`).join("")}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Reason</th><th>Status</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${lvPage.map((l) => { const e = S.emps.get(l.empId); return `<tr><td><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button></td><td class="t-muted">${esc(deptName(e))}</td><td>${esc(leaveType(l.type)?.name || l.type)}</td><td style="white-space:nowrap">${fmtDate(l.from)}${l.to !== l.from ? ` to ${fmtDate(l.to)}` : ""}</td><td class="num">${l.days}</td><td class="t-muted" style="max-width:220px">${esc(l.reason || "")}</td><td><span class="chip ${LSTATUS[l.status][1]}">${LSTATUS[l.status][0]}</span></td>
        ${S.canEdit ? `<td class="num" style="white-space:nowrap">${l.status === "PENDING" ? `<button class="btn btn-ghost btn-sm" data-lv-set="${l.month}:${l.id}:APPROVED">Approve</button> <button class="link danger" data-lv-set="${l.month}:${l.id}:REJECTED">Reject</button>` : ""}</td>` : ""}</tr>`; }).join("") || '<tr><td colspan="8" class="empty">No leave requests here.</td></tr>'}</tbody></table></div>${hrPager(F.page, lv.length, "hrd-lp")}</section>
    <section class="card"><div class="card-head"><h2>Leave allocation ${y}</h2><span class="t-muted" style="font-size:13px">Credits, used and left per employee</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><input class="input" type="search" id="hrd-q" value="${esc(A.q)}" placeholder="Find employee" aria-label="Find employee" style="flex:1;min-width:180px"><select class="input" id="hrd-dept" style="width:auto" aria-label="Department">${opts(D.map((d) => [d.id, d.name]), A.dept, "All departments")}</select></div>
      <div class="table-wrap"><table><thead><tr><th rowspan="2">Employee</th>${types.map((t) => `<th colspan="3" style="text-align:center">${esc(t.name)}</th>`).join("")}</tr><tr>${types.map(() => `<th class="num">Credits</th><th class="num">Used</th><th class="num">Left</th>`).join("")}</tr></thead><tbody>
      ${alPage.map((e) => { const b = balances(e, y); return `<tr><td><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button><div class="t-muted" style="font-size:12px">${esc(deptName(e))}</div></td>${types.map((t) => { const x = b.find((z) => z.code === t.code) || {}; return `<td class="num">${x.days ?? "—"}</td><td class="num">${x.used || 0}</td><td class="num"><b class="${x.left === 0 ? "t-bad" : ""}">${x.left ?? "—"}</b></td>`; }).join("")}</tr>`; }).join("") || `<tr><td colspan="${1 + types.length * 3}" class="empty">No employees found.</td></tr>`}</tbody></table></div>${hrPager(A.page, al.length, "hrd-ap")}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Credits come from the leave types in Shifts &amp; holidays.</p></section>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-aud-kind],[data-ctr-tab],[data-ctr-ext],[data-ctr-print],[data-hrd-st],[data-hrd-lp],[data-hrd-ap]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.audKind) { S.audF = { ...S.audF, kind: S.audF.kind === d.audKind ? "" : d.audKind }; render(); return; }
  if (d.ctrTab) { S.ctrTab = d.ctrTab; S.ctrExt = null; render(); return; }
  if (d.ctrExt !== undefined) { S.ctrExt = d.ctrExt || null; render(); $("#ct-end")?.focus(); return; }
  if (d.ctrPrint) return ctrLetter(S.emps.get(d.ctrPrint));
  if (d.hrdSt !== undefined) { S.hrdLv = { st: d.hrdSt, page: 1 }; render(); return; }
  if (d.hrdLp) { S.hrdLv.page += Number(d.hrdLp); render(); return; }
  if (d.hrdAp) { S.hrdAl.page += Number(d.hrdAp); render(); return; }
}, true);
document.addEventListener("input", (ev) => {
  const id = ev.target.id; if (!["aud-q", "hrd-q"].includes(id)) return; const p0 = ev.target.selectionStart;
  if (id === "aud-q") S.audF.q = ev.target.value; else S.hrdAl = { ...S.hrdAl, q: ev.target.value, page: 1 };
  render(); const i = $(`#${id}`); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} }
});
document.addEventListener("change", async (ev) => {
  const id = ev.target.id;
  if (id === "aud-kind") { S.audF.kind = ev.target.value; render(); return; } if (id === "aud-days") { S.audF.days = ev.target.value; render(); return; }
  if (id === "hrd-dept") { S.hrdAl = { ...S.hrdAl, dept: ev.target.value, page: 1 }; render(); return; }
  const up = ev.target.closest?.("[data-ctr-up]"); if (up && S.canEdit) { const f = up.files?.[0]; if (!f) return; const e = S.emps.get(up.dataset.ctrUp);
    if (f.size > 20 * 1048576) { toast("That file is over 20 MB."); return; }
    try { toast("Uploading…"); const u = await S.assets.upload(f); const c = ctrOf(e); const id2 = uid(); const rec = { empId: e.id, type: c.type, start: c.start, end: c.end, signed: { id: u.id, name: f.name.slice(0, 120) }, at: todayISO(), by: S.myId || null };
      await S.db.doc(`contracts/${id2}`).set(JSON.parse(JSON.stringify(rec))); S.ctrs.set(id2, { id: id2, ...rec }); logActivity(`Filed the signed contract of ${fullName(e)}`); toast("Signed copy saved."); render(); } catch { toast("Couldn't upload. Try again."); } }
});
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "ctr-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const e = S.emps.get(S.ctrExt); const start = $("#ct-start").value || todayISO(); const end = $("#ct-end").value; if (!end || end < start) { toast("Pick an end date after the start."); return; }
  try {
    const ne = e.status === "PROJECT_BASED" ? { ...e, projectUntil: end } : { ...e, contractEnd: end };
    ne.history = [...(e.history || []), { d: todayISO(), kind: "Contract renewed", text: `${CTYPES[e.status] || ""} contract ${fmtDate(start)} to ${fmtDate(end)}${$("#ct-notes").value.trim() ? ` (${$("#ct-notes").value.trim()})` : ""}` }];
    await saveEmp(ne); S.emps.set(e.id, ne);
    const id = uid(); const rec = { empId: e.id, type: e.status, start, end, notes: $("#ct-notes").value.trim() || null, at: todayISO(), by: S.myId || null };
    await S.db.doc(`contracts/${id}`).set(JSON.parse(JSON.stringify(rec))); S.ctrs.set(id, { id, ...rec });
    S.ctrExt = null; logActivity(`Renewed the contract of ${fullName(e)} to ${fmtDate(end)}`); toast("New term saved."); render();
  } catch { toast("Couldn't save. Try again."); }
}, true);
