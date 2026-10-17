/* ---------- Employees module, part 2: evaluation, medical history, personnel action, training records, accountability, resignation notices ---------- */
Object.assign(S, { meds: new Map(), pafs: new Map(), resigns: new Map(), mdF: { tab: "records", kind: "", q: "" }, pfF: { st: "PENDING" }, rsF: { st: "PENDING" }, acF: { q: "", unit: "", open: null } });
Object.assign(TCOLS, { medical: "meds", paf: "pafs", resign: "resigns" });
{
  const g = NAV.find(([n]) => n === "Employees"); if (g) { const it = g[1]; const after = (k, ...items) => { const i = it.findIndex(([v]) => v === k); it.splice(i >= 0 ? i + 1 : it.length, 0, ...items); };
    after("trprog", ["emptraining", "Training history", "cap"]); after("offboarding", ["resign", "Resignation notices", "door"]); after("salinc", ["paf", "Personnel action", "log"]);
    after("discipline", ["evaluation", "Evaluation", "star"], ["medical", "Medical history", "shield"], ["accountability", "Accountability", "laptop"]); }
  Object.assign(SECTION_OF, { emptraining: "emptraining", resign: "resign", paf: "paf", evaluation: "evaluation", medical: "medical", accountability: "accountability" });
}
{ const b = bootIO; bootIO = (db) => { b(db);
  for (const [col, key] of [["medical", "meds"], ["paf", "pafs"], ["resign", "resigns"]])
    db.collection(col).limit(5000).onSnapshot((snap) => { S[key] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; if (key === "pafs") applyDuePafs(); refresh(); }, () => {}); }; }
alias("evaluation", { before: () => (S.perfTab = "reviews"), view: () => VIEWS.perf() });
alias("emptraining", { view: () => VIEWS.trrecords() });
const empOf = (r) => S.emps.get(r.empId) || S.allEmps?.get(r.empId);
const empSel = (id, cur) => `<select class="input" id="${id}" aria-label="Employee">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), cur, "Choose employee…")}</select>`;

/* ---------- medical history (sensitive personal information under the Data Privacy Act: HR and the company clinic only) ---------- */
const MD_KIND = [["PRE_EMP", "Pre-employment medical"], ["APE", "Annual physical exam"], ["DRUG", "Drug test"], ["XRAY", "Chest X-ray"], ["VACCINE", "Vaccination"], ["CONSULT", "Clinic visit"], ["SICK", "Illness or hospitalization"], ["RTW", "Fit-to-work clearance"], ["OTHER", "Other"]];
const MD_RES = { FIT: ["Fit to work", "c-ok"], RESTRICT: ["Fit with restrictions", "c-warn"], UNFIT: ["Not fit", "c-bad"], PENDING: ["Waiting for results", "c-blue"], NA: ["Recorded", "c-gray"] };
const mdKind = (k) => MD_KIND.find((x) => x[0] === k)?.[1] || "Record";
const mdRecs = () => listOf(S.meds).filter((r) => r.kind !== "PROFILE" && empOf(r));
const mdProf = (e) => S.meds.get(`prof-${e.id}`) || {};
const lastApe = (e) => mdRecs().filter((r) => r.empId === e.id && ["APE", "PRE_EMP"].includes(r.kind)).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
const apeDue = (e) => { const l = lastApe(e); return l ? l.nextDue || addDays(l.date, 365) : addDays(e.hire, 30); };
VIEWS.medical = () => {
  const F = S.mdF; const q = F.q.toLowerCase(); const today = todayISO(); const fe = S.emps.get(S.empFor); const recs = mdRecs().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const due = active().map((e) => ({ e, d: apeDue(e), last: lastApe(e) })).filter((x) => x.d <= addDays(today, 30)).sort((a, b) => a.d.localeCompare(b.d));
  const list = recs.filter((r) => (!F.kind || r.kind === F.kind) && (!q || `${fullName(empOf(r))} ${empOf(r).no} ${r.clinic || ""} ${r.findings || ""}`.toLowerCase().includes(q)));
  const prof = fe ? mdProf(fe) : null; const mine = fe ? recs.filter((r) => r.empId === fe.id) : [];
  return head("Medical exams, clinic visits and fitness to work", "Medical history") + `
    <section class="stats">${dxTile("Annual physical due", due.filter((x) => x.d >= today).length, "in the next 30 days", "t-warn")}${dxTile("Overdue", due.filter((x) => x.last && x.d < today).length, "last exam over a year ago", due.some((x) => x.last && x.d < today) ? "t-bad" : "t-muted")}${dxTile("No exam on file", active().filter((e) => !lastApe(e)).length, "pre-employment or annual")}${dxTile("Not fit or restricted", recs.filter((r) => ["UNFIT", "RESTRICT"].includes(r.result) && recs.find((x) => x.empId === r.empId) === r).length, "latest result")}</section>
    <div class="notice"><span>${icon("shield", 16)} Health information is sensitive personal information under the Data Privacy Act. Only people with access to the Employees module see this page.</span></div>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.tab, "md-tab", [["records", "All records"], ["due", `Exams due (${due.length})`]])}${S.canEdit ? `<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">${empSel("emp-for", S.empFor)}</span>` : ""}</section>
    ${fe ? `<section class="card ak-thread"><div class="card-head"><h2>${esc(fullName(fe))}</h2><button class="link" data-md-close>Close</button></div>
      <div class="two"><form id="md-prof" class="panel stack" style="gap:8px" data-md-emp="${fe.id}" data-keep><b>Health profile</b><div class="form-grid">
        <div class="field"><label for="mdp-blood">Blood type</label><select class="input" id="mdp-blood">${opts(["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((v) => [v, v || "Unknown"]), prof.blood || "")}</select></div>
        <div class="field"><label for="mdp-allergy">Allergies</label><input class="input" id="mdp-allergy" value="${esc(prof.allergies || "")}" placeholder="None known"></div></div>
        <div class="field"><label for="mdp-cond">Existing conditions</label><input class="input" id="mdp-cond" value="${esc(prof.conditions || "")}" placeholder="e.g. Hypertension, asthma"></div>
        <div class="field"><label for="mdp-meds">Maintenance medicines</label><input class="input" id="mdp-meds" value="${esc(prof.meds || "")}"></div>
        <div class="field"><label for="mdp-pwd">PWD ID or special needs</label><input class="input" id="mdp-pwd" value="${esc(prof.pwd || "")}"></div>
        ${S.canEdit ? '<button class="btn btn-ghost">Save profile</button>' : ""}</form>
      ${S.canEdit ? `<form id="md-new" class="panel stack" style="gap:8px" data-md-emp="${fe.id}" data-keep><b>Add a record</b><div class="form-grid">
        <div class="field"><label for="md-kind">Kind</label><select class="input" id="md-kind">${opts(MD_KIND, "APE")}</select></div><div class="field"><label for="md-date">Date</label><input class="input" type="date" id="md-date" value="${today}" required></div>
        <div class="field"><label for="md-res">Result</label><select class="input" id="md-res">${opts(Object.entries(MD_RES).map(([k, v]) => [k, v[0]]), "FIT")}</select></div><div class="field"><label for="md-clinic">Clinic or doctor</label><input class="input" id="md-clinic"></div>
        <div class="field"><label for="md-next">Next exam due</label><input class="input" type="date" id="md-next"></div></div>
        <div class="field"><label for="md-find">Findings and restrictions</label><textarea class="input" id="md-find" rows="2"></textarea></div><button class="btn btn-primary">Add record</button><small class="t-muted">Attach the results with the Attachments button at the top.</small></form>` : ""}</div>
      <h3 style="font-size:16px;margin:14px 0 6px">History</h3>${mdTable(mine, false)}</section>` : ""}
    <section class="card">${F.tab === "due" ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Last exam</th><th>Due</th><th></th></tr></thead><tbody>${due.map((x) => `<tr><td>${empCell(x.e)}</td><td>${x.last ? `${esc(mdKind(x.last.kind))}, ${fmtDate(x.last.date)}` : '<span class="t-muted">None on file</span>'}</td><td class="${x.d < today ? "t-bad" : "t-warn"}" style="white-space:nowrap">${fmtDate(x.d)}</td><td class="num"><button class="btn btn-ghost btn-sm" data-md-open="${x.e.id}">Open</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No exams due.</td></tr>'}</tbody></table></div><p class="t-muted" style="font-size:13px;margin:10px 0 0">An annual physical exam is due a year after the last one (DOLE OSH Standards). New hires without a pre-employment medical show as due 30 days after hiring.</p>`
      : `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><select class="input" id="md-fk" style="width:auto" aria-label="Kind">${opts(MD_KIND, F.kind, "All kinds")}</select><input class="input" type="search" id="md-q" value="${esc(F.q)}" placeholder="Search" aria-label="Search records" style="flex:1;min-width:160px"></div>${mdTable(list.slice(0, 300), true)}`}</section>`;
};
const mdTable = (rows, who) => `<div class="table-wrap"><table><thead><tr>${who ? "<th>Employee</th>" : ""}<th>Date</th><th>Kind</th><th>Result</th><th>Clinic</th><th>Findings</th><th>Next due</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
  ${rows.map((r) => `<tr>${who ? `<td>${empCell(empOf(r))}</td>` : ""}<td style="white-space:nowrap">${fmtDate(r.date)}</td><td>${esc(mdKind(r.kind))}</td><td><span class="chip ${(MD_RES[r.result] || MD_RES.NA)[1]}">${(MD_RES[r.result] || MD_RES.NA)[0]}</span></td><td>${esc(r.clinic || "")}</td><td style="max-width:260px">${esc(r.findings || "")}</td><td style="white-space:nowrap">${r.nextDue ? fmtDate(r.nextDue) : ""}</td>${S.canEdit ? `<td class="num">${who ? `<button class="link" data-md-open="${r.empId}">Open</button>` : `<button class="link danger" data-md-del="${r.id}">Delete</button>`}</td>` : ""}</tr>`).join("") || `<tr><td colspan="8" class="empty">No records yet.</td></tr>`}</tbody></table></div>`;

/* ---------- personnel action (PAF): promotion, transfer, reassignment, status change; applied to the 201 file on the effective date ---------- */
const PF_TYPE = [["PROMOTION", "Promotion"], ["TRANSFER", "Transfer of department"], ["REASSIGN", "Project reassignment"], ["SALARY", "Salary adjustment"], ["STATUS", "Change of employment status"], ["DEMOTION", "Demotion"], ["OTHER", "Other"]];
const PF_FIELDS = [["posId", "Position"], ["deptId", "Department"], ["projectId", "Assignment"], ["status", "Employment status"], ["basicPay", "Basic pay"], ["supervisorId", "Supervisor"]];
const pfVal = (k, v, e) => k === "posId" ? pos(v)?.title || "—" : k === "deptId" ? dept(v)?.name || "—" : k === "projectId" ? (v ? S.projects.get(v)?.name || "Project" : "Head Office") : k === "status" ? STATUS[v]?.[0] || "—" : k === "basicPay" ? payLabel(Number(v), e?.payType) : k === "supervisorId" ? (S.emps.get(v) ? fullName(S.emps.get(v)) : "—") : String(v ?? "");
const pfType = (k) => PF_TYPE.find((x) => x[0] === k)?.[1] || "Personnel action";
async function applyPaf(r) {
  const e = S.emps.get(r.empId); if (!e) return; const ch = Object.entries(r.to || {}).filter(([k, v]) => v !== undefined && v !== null && v !== "" && String(e[k] ?? "") !== String(v));
  const ne = { ...e }; for (const [k, v] of ch) ne[k] = k === "basicPay" ? Number(v) : v === "HO" ? null : v; if ("projectId" in (r.to || {}) && r.to.projectId !== undefined) ne.projectSince = r.effective;
  ne.history = [...(e.history || []), { d: r.effective, kind: pfType(r.type), text: ch.map(([k, v]) => `${PF_FIELDS.find((f) => f[0] === k)[1].toLowerCase()} ${pfVal(k, e[k], e)} to ${pfVal(k, v === "HO" ? null : v, e)}`).join("; ") + (r.reason ? ` (${r.reason})` : "") }];
  await saveEmp(ne); S.emps.set(e.id, ne); await saveRec("paf", r.id, { ...r, applied: todayISO() });
}
let pfBusy = false;
async function applyDuePafs() { if (pfBusy || !S.realEdit) return; pfBusy = true;
  try { for (const r of listOf(S.pafs)) if (r.status === "APPROVED" && !r.applied && r.effective <= todayISO() && S.emps.get(r.empId)) { await applyPaf(r); logActivity(`Applied the personnel action for ${fullName(S.emps.get(r.empId))}`); } } catch {} finally { pfBusy = false; } }
function pafForm(e) {
  const sel = (k, list, cur) => `<select class="input" id="pf-${k}">${opts([["", "No change"], ...list.filter(([v]) => String(v) !== String(cur ?? ""))], "")}</select>`;
  return `<form id="pf-form" class="panel stack" style="gap:10px" data-pf-emp="${e.id}" data-keep><div class="form-grid">
    <div class="field"><label for="pf-type">Action</label><select class="input" id="pf-type">${opts(PF_TYPE, "PROMOTION")}</select></div><div class="field"><label for="pf-eff">Effective <span class="req">*</span></label><input class="input" type="date" id="pf-eff" required value="${todayISO()}"></div></div>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th>Now</th><th>Change to</th></tr></thead><tbody>
      <tr><td>Position</td><td>${esc(pfVal("posId", e.posId))}</td><td>${sel("posId", (S.org?.positions || []).map((p) => [p.id, p.title]), e.posId)}</td></tr>
      <tr><td>Department</td><td>${esc(pfVal("deptId", e.deptId))}</td><td>${sel("deptId", (S.org?.departments || []).map((d) => [d.id, d.name]), e.deptId)}</td></tr>
      <tr><td>Assignment</td><td>${esc(pfVal("projectId", e.projectId))}</td><td>${sel("projectId", [["HO", "Head Office"], ...listOf(S.projects).filter((p) => p.status !== "DONE").map((p) => [p.id, p.name])], e.projectId || "HO")}</td></tr>
      <tr><td>Employment status</td><td>${esc(pfVal("status", e.status))}</td><td>${sel("status", Object.entries(STATUS).map(([k, v]) => [k, v[0]]), e.status)}</td></tr>
      <tr><td>Basic pay (${e.payType === "DAILY" ? "a day" : "a month"})</td><td>${money(e.basicPay)}</td><td><input class="input" type="number" min="0" step="0.01" id="pf-basicPay" placeholder="No change"></td></tr>
      <tr><td>Supervisor</td><td>${esc(pfVal("supervisorId", e.supervisorId))}</td><td>${sel("supervisorId", active().filter((x) => x.id !== e.id).sort((a, b) => fullName(a).localeCompare(fullName(b))).map((x) => [x.id, fullName(x)]), e.supervisorId)}</td></tr></tbody></table></div>
    <div class="field"><label for="pf-why">Reason</label><input class="input" id="pf-why" placeholder="e.g. Very satisfactory rating, new project"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button><button class="btn btn-primary">Send for approval</button></div></form>`;
}
VIEWS.paf = () => {
  const F = S.pfF; const all = listOf(S.pafs).filter((r) => empOf(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const list = all.filter((r) => !F.st || r.status === F.st); const fe = S.emps.get(S.empFor); const y = todayISO().slice(0, 4);
  const doneY = all.filter((r) => r.status === "APPROVED" && (r.effective || "").startsWith(y));
  return head("Promotions, transfers, reassignments and status changes", "Personnel action") + `
    <section class="stats">${dxTile("Waiting for approval", all.filter((r) => r.status === "PENDING").length, "personnel actions", "t-warn")}${dxTile(`Promotions in ${y}`, doneY.filter((r) => r.type === "PROMOTION").length, "approved")}${dxTile(`Transfers and reassignments in ${y}`, doneY.filter((r) => ["TRANSFER", "REASSIGN"].includes(r.type)).length, "approved")}${dxTile("Taking effect soon", all.filter((r) => r.status === "APPROVED" && !r.applied).length, "approved, effective later")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "pf-st", [["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]])}${forPicker("paf", "New personnel action")}</section>
    ${S.empNew === "paf" && fe ? `<section class="card"><div class="card-head"><h2>Personnel action for ${esc(fullName(fe))}</h2></div>${pafForm(fe)}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Action</th><th>Changes</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => { const e = empOf(r); return `<tr><td>${empCell(e, pos(e.posId)?.title || "")}</td><td>${esc(pfType(r.type))}${r.reason ? `<div class="t-muted" style="font-size:12px;max-width:200px">${esc(r.reason)}</div>` : ""}</td>
        <td style="font-size:13px">${Object.entries(r.to || {}).map(([k, v]) => `<div><b>${esc(PF_FIELDS.find((f) => f[0] === k)?.[1] || k)}:</b> ${esc(pfVal(k, (r.from || {})[k], e))} → ${esc(pfVal(k, v === "HO" ? null : v, e))}</div>`).join("")}</td>
        <td style="white-space:nowrap">${fmtDate(r.effective)}</td><td>${stChip(r.status)}${r.status === "APPROVED" ? `<div class="t-muted" style="font-size:12px">${r.applied ? "Applied to the 201 file" : "Applies on the effective date"}</div>` : ""}</td>
        <td class="num" style="white-space:nowrap">${r.status === "PENDING" && S.canEdit ? `<button class="btn btn-primary btn-sm" data-pf-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-pf-set="${r.id}:REJECTED">Reject</button> ` : ""}<button class="btn btn-ghost btn-sm" data-pf-print="${r.id}">Print form</button></td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No personnel actions here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Approved actions update the 201 file on the effective date and add a line to the employee's history and the Employee change log.</p></section>`;
};

/* ---------- resignation notices ---------- */
const RS_ST = { PENDING: ["Received", "c-warn"], ACCEPTED: ["Accepted", "c-ok"], WITHDRAWN: ["Withdrawn", "c-gray"] };
const rsDays = (r) => daysBetween(r.filed, r.last);
function rsForm(e, idp) {
  return `<form id="${idp}" class="panel stack" style="gap:10px" data-rs-emp="${e.id}" data-keep><div class="form-grid">
    <div class="field"><label for="${idp}-filed">Date of the letter</label><input class="input" type="date" id="${idp}-filed" value="${todayISO()}" required></div>
    <div class="field"><label for="${idp}-last">Last working day <span class="req">*</span></label><input class="input" type="date" id="${idp}-last" value="${addDays(todayISO(), 30)}" required></div></div>
    <div class="field"><label for="${idp}-why">Reason</label><select class="input" id="${idp}-why">${opts(["Better opportunity", "Further studies", "Family reasons", "Health reasons", "Relocation", "Career change", "Personal reasons", "Other"].map((v) => [v, v]), "Personal reasons")}</select></div>
    <div class="field"><label for="${idp}-text">Letter</label><textarea class="input" id="${idp}-text" rows="4" placeholder="Paste or type the resignation letter. Attach the signed copy with the Attachments button."></textarea></div>
    <p class="t-muted" style="font-size:13px;margin:0">The Labor Code (Art. 300) asks for at least 30 days' written notice. A shorter notice needs the company's agreement.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button><button class="btn btn-primary">Submit resignation notice</button></div></form>`;
}
VIEWS.resign = () => {
  const F = S.rsF; const all = listOf(S.resigns).filter((r) => empOf(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const list = all.filter((r) => !F.st || r.status === F.st); const fe = S.emps.get(S.empFor); const y = todayISO().slice(0, 4);
  const yr = all.filter((r) => r.status !== "WITHDRAWN" && (r.filed || "").startsWith(y)); const avgHead = active().length || 1;
  return head("Letters received, notice period and hand-off to offboarding", "Resignation notices") + `
    <section class="stats">${dxTile("To act on", all.filter((r) => r.status === "PENDING").length, "received, not yet accepted", "t-warn")}${dxTile(`Resignations in ${y}`, yr.length, `${((yr.length / avgHead) * 100).toFixed(1)}% of active headcount`)}${dxTile("Short notice", all.filter((r) => r.status === "PENDING" && rsDays(r) < 30).length, "less than 30 days", "t-bad")}${dxTile("Leaving in 30 days", all.filter((r) => r.status === "ACCEPTED" && r.last >= todayISO() && r.last <= addDays(todayISO(), 30)).length, "accepted")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "rs-st", [["PENDING", "Received"], ["ACCEPTED", "Accepted"], ["WITHDRAWN", "Withdrawn"], ["", "All"]])}${forPicker("resign", "Log a resignation")}</section>
    ${S.empNew === "resign" && fe ? `<section class="card"><div class="card-head"><h2>Resignation of ${esc(fullName(fe))}</h2></div>${rsForm(fe, "rs-form")}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Letter dated</th><th>Last day</th><th>Notice</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((r) => { const e = empOf(r); const n = rsDays(r); const st = RS_ST[r.status] || RS_ST.PENDING; return `<tr><td>${empCell(e, pos(e.posId)?.title || "")}</td><td style="white-space:nowrap">${fmtDate(r.filed)}</td><td style="white-space:nowrap">${fmtDate(r.last)}</td>
        <td>${n >= 30 ? `<span class="chip c-ok">${n} days</span>` : `<span class="chip c-bad">${n} days, short</span>`}</td><td>${esc(r.reason || "")}${fzLinks(r.files)}${r.text ? `<details><summary class="t-muted" style="font-size:12px;cursor:pointer">Letter</summary><p style="white-space:pre-wrap;font-size:13px;max-width:320px">${esc(r.text)}</p></details>` : ""}</td>
        <td><span class="chip ${st[1]}">${st[0]}</span>${S.offb.has(r.empId) ? '<div class="t-muted" style="font-size:12px">Offboarding started</div>' : ""}</td>
        <td class="num" style="white-space:nowrap">${S.canEdit && r.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-rs-set="${r.id}:ACCEPTED">Accept</button> <button class="btn btn-ghost btn-sm" data-rs-set="${r.id}:WITHDRAWN">Withdrawn</button> ` : ""}${r.status === "ACCEPTED" && !S.offb.has(r.empId) && S.canEdit ? `<button class="btn btn-primary btn-sm" data-rs-offb="${r.id}">Start offboarding</button> ` : ""}${r.status === "ACCEPTED" ? `<button class="btn btn-ghost btn-sm" data-rs-letter="${r.id}">Acceptance letter</button>` : ""}</td></tr>`; }).join("") || '<tr><td colspan="7" class="empty">No resignation notices here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Employees can also submit their resignation from Requests to HR in the Employee view. Accepting opens offboarding with the last day filled in.</p></section>`;
};
{ const b = ESS.esshr; ESS.esshr = (e) => { const h = b(e); const mine = listOf(S.resigns).filter((r) => r.empId === e.id && r.status !== "WITHDRAWN");
  return h + `<section class="card"><div class="card-head"><h2>Resignation notice</h2>${!mine.length ? `<button class="btn ${S.empNew === "essresign" ? "btn-primary" : "btn-ghost"} btn-sm" data-emp-new="essresign">Submit a resignation</button>` : ""}</div>
    ${mine.length ? mine.map((r) => `<p style="margin:0;font-size:14px"><span class="chip ${(RS_ST[r.status] || RS_ST.PENDING)[1]}">${(RS_ST[r.status] || RS_ST.PENDING)[0]}</span> Dated ${fmtDate(r.filed)}, last day ${fmtDate(r.last)}.</p>`).join("") : S.empNew === "essresign" && S.realEdit ? rsForm(e, "rse-form") : '<p class="t-muted" style="margin:0;font-size:14px">Give HR at least 30 days\' written notice.</p>'}</section>`; }; }
{ const b = submitOffboard; submitOffboard = async (f) => { const empId = $("#ob-emp")?.value; const r = await b(f); const rs = listOf(S.resigns).find((x) => x.empId === empId && x.status !== "WITHDRAWN");
  if (rs && S.offb.has(empId) && !rs.offb) saveRec("resign", rs.id, { ...rs, status: "ACCEPTED", offb: todayISO() }).catch(() => {}); return r; }; }

/* ---------- accountability: company property held, loans and cash advances, with a printable acknowledgment ---------- */
const acOf = (e) => { const prop = heldBy(e.id); const loans = listOf(S.loans).filter((ln) => ln.empId === e.id && ["ACTIVE", "HOLD"].includes(ln.status) && !isGovLoan(ln)).map((ln) => ({ ln, bal: loanBal(ln) })).filter((x) => x.bal > 0);
  return { e, prop, loans, pv: PAY.r2(prop.reduce((a, x) => a + (x.value || 0), 0)), lb: PAY.r2(loans.reduce((a, x) => a + x.bal, 0)) }; };
VIEWS.accountability = () => {
  const F = S.acF; const q = F.q.toLowerCase(); const all = [...S.emps.values()].map(acOf).filter((x) => x.prop.length || x.loans.length);
  const list = all.filter((x) => (!F.unit || inUnit(x.e, F.unit)) && (!q || `${fullName(x.e)} ${x.e.no} ${x.prop.map((p) => p.tag + " " + p.name).join(" ")}`.toLowerCase().includes(q))).sort((a, b) => b.pv + b.lb - (a.pv + a.lb));
  const open = F.open ? acOf(S.emps.get(F.open) || {}) : null; const leaving = all.filter((x) => S.offb.has(x.e.id) && !S.offb.get(x.e.id).closed);
  return head("Company property, cash advances and company loans each employee is answerable for", "Accountability") + `
    <section class="stats">${dxTile("Employees with accountabilities", all.length, "property or company loans")}${dxTile("Property issued", peso.format(PAY.r2(all.reduce((a, x) => a + x.pv, 0))), `${all.reduce((a, x) => a + x.prop.length, 0)} items at cost`)}${dxTile("Company loans and cash advances", peso.format(PAY.r2(all.reduce((a, x) => a + x.lb, 0))), "balance left")}${dxTile("Leaving with accountabilities", leaving.length, "settle before final pay", leaving.length ? "t-bad" : "t-muted")}</section>
    ${open?.e?.id ? `<section class="card ak-thread"><div class="card-head"><h2>${esc(fullName(open.e))}</h2><span style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-ac-print="${open.e.id}">${icon("file")}Accountability form</button><button class="link" data-ac-open="">Close</button></span></div>
      <h3 style="font-size:16px;margin:0 0 6px">Company property (${open.prop.length})</h3>${open.prop.length ? `<div class="table-wrap"><table><thead><tr><th>Tag</th><th>Item</th><th>Serial</th><th>Issued</th><th class="num">Value</th></tr></thead><tbody>${open.prop.map((p) => `<tr class="go" data-asset="${p.id}" tabindex="0"><td>${esc(p.tag)}</td><td>${esc(p.name)}</td><td>${esc(p.serial || "")}</td><td>${p.since ? fmtDate(p.since) : ""}</td><td class="num">${money(p.value)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted">None.</p>'}
      <h3 style="font-size:16px;margin:14px 0 6px">Company loans and cash advances</h3>${open.loans.length ? `<div class="table-wrap"><table><thead><tr><th>Loan</th><th>Granted</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>${open.loans.map(({ ln, bal }) => `<tr><td>${esc(loanLabel(ln.id))}</td><td>${ln.granted ? fmtDate(ln.granted) : ""}</td><td class="num">${money(ln.principal)}</td><td class="num"><b>${money(bal)}</b></td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted">None.</p>'}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Issue or return property on Company Assets. Unsettled items show on the clearance and can be deducted from final pay with the employee's written consent.</p></section>` : ""}
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><input class="input" type="search" id="ac-q" value="${esc(F.q)}" placeholder="Search name or property" aria-label="Search" style="flex:1;min-width:160px"><select class="input" id="ac-unit" style="width:auto" aria-label="Department or project">${opts(unitOpts(), F.unit, "Everyone")}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Property</th><th class="num">Property value</th><th class="num">Loans and advances</th><th class="num">Total</th><th></th></tr></thead><tbody>
      ${list.slice(0, 300).map((x) => `<tr class="go" data-ac-open="${x.e.id}" tabindex="0"><td>${empCell(x.e)}${S.offb.has(x.e.id) && !S.offb.get(x.e.id).closed ? ' <span class="chip c-bad">Leaving</span>' : ""}</td><td style="font-size:13px">${x.prop.slice(0, 3).map((p) => esc(p.name)).join(", ")}${x.prop.length > 3 ? ` and ${x.prop.length - 3} more` : ""}</td><td class="num">${money(x.pv)}</td><td class="num">${money(x.lb)}</td><td class="num"><b>${money(x.pv + x.lb)}</b></td><td class="num"><button class="btn btn-ghost btn-sm" data-ac-print="${x.e.id}">Form</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">No accountabilities.</td></tr>'}</tbody></table></div></section>`;
};

/* ---------- Employees home cards ---------- */
{ const b = VIEWS.emphome; VIEWS.emphome = () => { const h = b(); const today = todayISO();
  const c = (v, ic, title, val, note, cls = "t-muted") => `<button class="card stat kpi-btn" data-go="${v}" style="text-align:left"><span class="label" style="display:flex;gap:6px;align-items:center">${icon(ic, 16)}${title}</span><span class="value">${val}</span><span class="note ${cls}">${note}</span></button>`;
  const ape = active().filter((e) => lastApe(e) && apeDue(e) < today).length; const pr = listOf(S.pafs).filter((r) => r.status === "PENDING" && empOf(r)).length; const rs = listOf(S.resigns).filter((r) => r.status === "PENDING" && empOf(r)).length;
  const due = listOf(S.reviews || new Map()).filter((r) => r.status !== "DONE").length;
  const cards = c("evaluation", "star", "Evaluation", due, "reviews in progress") + c("medical", "shield", "Medical history", ape, "annual physical overdue", ape ? "t-warn" : "t-muted") + c("paf", "log", "Personnel action", pr, "waiting for approval", pr ? "t-warn" : "t-muted")
    + c("emptraining", "cap", "Training records", listOf(S.courses || new Map()).length, "courses on record") + c("accountability", "laptop", "Accountability", [...S.emps.values()].filter((e) => heldBy(e.id).length).length, "employees holding company property") + c("resign", "door", "Resignation notices", rs, "received, not yet accepted", rs ? "t-warn" : "t-muted");
  const i = h.indexOf('<button class="card stat kpi-btn" data-go="emprep"'); return i >= 0 ? h.slice(0, i) + cards + h.slice(i) : h; }; }

/* ---------- printing ---------- */
function pafPrint(r) { const e = empOf(r);
  return saveLetter(`personnel-action-${e.no}-${r.effective}.html`, `Personnel action ${e.no}`, `<h2>PERSONNEL ACTION FORM</h2><p><b>${esc(fullName(e))}</b> · ${esc(e.no)}<br>Action: <b>${esc(pfType(r.type))}</b> · effective ${fmtDate(r.effective)}</p>
    <table><tbody><tr><td><b>Item</b></td><td><b>From</b></td><td><b>To</b></td></tr>${Object.entries(r.to || {}).map(([k, v]) => `<tr><td>${esc(PF_FIELDS.find((f) => f[0] === k)?.[1] || k)}</td><td>${esc(pfVal(k, (r.from || {})[k], e))}</td><td>${esc(pfVal(k, v === "HO" ? null : v, e))}</td></tr>`).join("")}</tbody></table>
    ${r.reason ? `<p>Reason: ${esc(r.reason)}</p>` : ""}<p style="margin-top:40px">Requested by: ______________________ &nbsp; Approved by: ______________________</p><p style="margin-top:30px">Conforme (employee): ______________________ Date: __________</p>`); }
function acPrint(e) { const x = acOf(e);
  return saveLetter(`accountability-${e.no}.html`, `Accountability ${e.no}`, `<h2>ACKNOWLEDGMENT OF ACCOUNTABILITY</h2><p>I, <b>${esc(fullName(e))}</b> (${esc(e.no)}), ${esc(pos(e.posId)?.title || "")}, acknowledge that I received and am answerable for the following, as of ${fmtDate(todayISO())}:</p>
    <table><tbody><tr><td><b>Company property</b></td><td><b>Serial</b></td><td class="num"><b>Value</b></td></tr>${x.prop.map((p) => `<tr><td>${esc(p.tag)} ${esc(p.name)}</td><td>${esc(p.serial || "")}</td><td class="num">${money(p.value)}</td></tr>`).join("") || '<tr><td colspan="3">None</td></tr>'}
    <tr><td><b>Company loans and cash advances</b></td><td></td><td class="num"><b>Balance</b></td></tr>${x.loans.map(({ ln, bal }) => `<tr><td>${esc(loanLabel(ln.id))}</td><td>${ln.granted ? fmtDate(ln.granted) : ""}</td><td class="num">${money(bal)}</td></tr>`).join("") || '<tr><td colspan="3">None</td></tr>'}
    <tr><td><b>Total</b></td><td></td><td class="num"><b>${money(x.pv + x.lb)}</b></td></tr></tbody></table>
    <p>I will take good care of the property, use it only for work, and return it in good condition when asked or when I leave. I agree that the cost of property lost or damaged through my fault, and any unpaid balance above, may be deducted from my pay or final pay.</p>
    <p style="margin-top:40px">Employee: ______________________ Date: __________</p><p style="margin-top:30px">Issued by: ${signer()}</p>`); }
function rsLetter(r) { const e = empOf(r);
  return saveLetter(`resignation-acceptance-${e.no}.html`, `Resignation acceptance ${e.no}`, `<p style="text-align:right">${fmtDate(todayISO())}</p><p><b>${esc(fullName(e))}</b><br>${esc(pos(e.posId)?.title || "")}</p><p>Dear ${esc(e.first)},</p>
    <p>We received your resignation letter dated ${fmtDate(r.filed)} and accept your resignation effective at the end of your working day on <b>${fmtDate(r.last)}</b>.</p>
    <p>Before your last day, please turn over your work and return all company property. HR will process your clearance, and your final pay will be released within 30 days of your last day. You may request your Certificate of Employment at any time.</p>
    <p>Thank you for your service, and we wish you well.</p><p style="margin-top:40px">${signer()}</p><p style="margin-top:30px">Received by: ______________________ Date: __________</p>`); }

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-md-tab],[data-md-open],[data-md-close],[data-md-del],[data-pf-st],[data-pf-set],[data-pf-print],[data-rs-st],[data-rs-set],[data-rs-offb],[data-rs-letter],[data-ac-open],[data-ac-print]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.mdTab) { S.mdF.tab = d.mdTab; render(); return; }
  if (d.mdOpen) { S.empFor = d.mdOpen; render(); window.scrollTo({ top: 0 }); return; }
  if (d.mdClose !== undefined) { S.empFor = ""; render(); return; }
  if (d.mdDel) { if (!await askConfirm("Delete this medical record?")) return; await S.db.doc(`medical/${d.mdDel}`).delete(); S.meds.delete(d.mdDel); S.ver++; logActivity("Deleted a medical record"); render(); return; }
  if (d.pfSt !== undefined) { S.pfF.st = d.pfSt; render(); return; }
  if (d.rsSt !== undefined) { S.rsF.st = d.rsSt; render(); return; }
  if (d.pfPrint) return pafPrint(S.pafs.get(d.pfPrint));
  if (d.rsLetter) return rsLetter(S.resigns.get(d.rsLetter));
  if (d.acOpen !== undefined) { S.acF.open = d.acOpen || null; render(); if (d.acOpen) window.scrollTo({ top: 0 }); return; }
  if (d.acPrint) { const e = S.emps.get(d.acPrint); if (e) return acPrint(e); }
  if (d.rsOffb) { const r = S.resigns.get(d.rsOffb); go("offboardForm", { emp: r.empId, reason: "Resignation", notice: r.filed, last: r.last }); return; }
  try {
    if (d.pfSet) { const [id, st] = d.pfSet.split(":"); const r = S.pafs.get(id); await saveRec("paf", id, { ...r, status: st, decided: todayISO(), decidedBy: S.myId || null }); const e = empOf(r);
      if (st === "APPROVED" && r.effective <= todayISO()) await applyPaf(S.pafs.get(id)); logActivity(`${st === "APPROVED" ? "Approved" : "Rejected"} the ${pfType(r.type).toLowerCase()} of ${fullName(e)}`); toast(st === "APPROVED" ? (r.effective <= todayISO() ? "Approved and applied to the 201 file." : `Approved. Applies on ${fmtDate(r.effective)}.`) : "Rejected."); render(); return; }
    if (d.rsSet) { const [id, st] = d.rsSet.split(":"); const r = S.resigns.get(id); await saveRec("resign", id, { ...r, status: st, decided: todayISO() }); logActivity(`${st === "ACCEPTED" ? "Accepted" : "Marked withdrawn"} the resignation of ${fullName(empOf(r))}`);
      if (st === "ACCEPTED" && !S.offb.has(r.empId)) { toast("Accepted. Check the details and start offboarding."); go("offboardForm", { emp: r.empId, reason: "Resignation", notice: r.filed, last: r.last }); return; } toast(st === "ACCEPTED" ? "Accepted." : "Marked withdrawn."); render(); }
  } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("change", (ev) => { const t = ev.target; if (t.id === "md-fk") { S.mdF.kind = t.value; render(); } if (t.id === "ac-unit") { S.acF.unit = t.value; render(); } });
document.addEventListener("input", (ev) => { const t = ev.target; if (t.id !== "md-q" && t.id !== "ac-q") return; (t.id === "md-q" ? S.mdF : S.acF).q = t.value; const p0 = t.selectionStart; const id = t.id; render(); const i = document.getElementById(id); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["md-prof", "md-new", "pf-form", "rs-form", "rse-form"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const v = (id) => $("#" + id)?.value.trim() || null;
  try {
    if (f.id === "md-prof") { const id = f.dataset.mdEmp; await saveRec("medical", `prof-${id}`, { kind: "PROFILE", empId: id, blood: v("mdp-blood"), allergies: v("mdp-allergy"), conditions: v("mdp-cond"), meds: v("mdp-meds"), pwd: v("mdp-pwd"), updated: todayISO() }); toast("Health profile saved."); render(); return; }
    if (f.id === "md-new") { const id = f.dataset.mdEmp; const e = S.emps.get(id); await saveRec("medical", uid(), { empId: id, kind: v("md-kind"), date: v("md-date") || todayISO(), result: v("md-res"), clinic: v("md-clinic"), nextDue: v("md-next") || (["APE", "PRE_EMP"].includes(v("md-kind")) ? addDays(v("md-date") || todayISO(), 365) : null), findings: v("md-find"), by: S.myId || null });
      logActivity(`Added a medical record for ${fullName(e)}`); toast("Record added."); render(); return; }
    if (f.id === "pf-form") { const e = S.emps.get(f.dataset.pfEmp); const to = {}; for (const [k] of PF_FIELDS) { const x = v("pf-" + k); if (x) to[k] = k === "basicPay" ? Number(x) : x; }
      if (!Object.keys(to).length) { toast("Choose at least one change."); return; } const from = Object.fromEntries(Object.keys(to).map((k) => [k, e[k] ?? null]));
      await saveRec("paf", uid(), { empId: e.id, type: v("pf-type"), effective: v("pf-eff") || todayISO(), to, from, reason: v("pf-why"), status: "PENDING", filed: todayISO(), by: S.myId || null }); logActivity(`Filed a ${pfType(v("pf-type")).toLowerCase()} for ${fullName(e)}`); S.empNew = null; toast("Sent for approval."); render(); return; }
    const p = f.id; const e = S.emps.get(f.dataset.rsEmp); const filed = v(`${p}-filed`) || todayISO(); const last = v(`${p}-last`); if (!last || last < filed) { toast("The last day must be on or after the letter date."); return; }
    await saveRec("resign", uid(), { empId: e.id, filed, last, reason: v(`${p}-why`), text: v(`${p}-text`), status: "PENDING", by: S.myId || null }); logActivity(`Logged the resignation of ${fullName(e)}`); S.empNew = null; toast(daysBetween(filed, last) < 30 ? "Saved. The notice is shorter than 30 days." : "Resignation notice saved."); render();
  } catch { toast("Couldn't save. Try again."); }
}, true);
