/* ---------- Employees module: directory, departments, orientation, salary increments, documents, change requests, certificate requests, reports ---------- */
Object.assign(S, { orients: new Map(), salincs: new Map(), chgReqs: new Map(), certReqs: new Map(), dirF: { q: "", unit: "", dept: "", page: 1 }, edF: { q: "", only: true, page: 1 },
  siF: { st: "PENDING" }, crF: { st: "PENDING" }, cqF: { st: "PENDING" }, orF: { st: "OPEN" }, erTab: "head", empFor: "", empNew: null });
Object.assign(TCOLS, { orient: "orients", salinc: "salincs", empchg: "chgReqs", certreq: "certReqs" });
{
  const ppl = NAV.find(([g]) => g === "People"); if (ppl) { const i = ppl[1].findIndex(([v]) => v === "contracts"); if (i >= 0) ppl[1].splice(i, 1); }
  const at = NAV.findIndex(([g]) => g === "People");
  NAV.splice(at + 1, 0, ["Employees", [["emphome", "Employees home", "dash"], ["directory", "Employee directory", "people"], ["departments", "Departments", "org"], ["contracts", "Contracts", "file"], ["joboffer", "Job offers", "mail"],
    ["trprog", "Training program", "cap"], ["onboarding", "New hire checklist", "door"], ["offboarding", "Exit clearance", "door"], ["orient", "Orientation requests", "cal"], ["salinc", "Salary increments", "pay"],
    ["discipline", "Disciplinary", "alert"], ["empdocs", "Employee documents", "clip"], ["chgreq", "Change requests", "log"], ["certreq", "Certificate requests", "receipt"], ["emprep", "Employee reports", "report"]]]);
  MOD_ICON.Employees = "people"; if (!PERM_MODS.includes("Employees")) PERM_MODS.splice(1, 0, "Employees"); for (const k of ["payroll", "talent"]) if (ROLES[k] && !ROLES[k].mods.includes("Employees")) ROLES[k].mods.push("Employees");
  Object.assign(SECTION_OF, { emphome: "emphome", directory: "directory", departments: "departments", contracts: "contracts", joboffer: "joboffer", trprog: "trprog", onboarding: "onboarding", offboarding: "offboarding", orient: "orient", salinc: "salinc", discipline: "discipline", empdocs: "empdocs", chgreq: "chgreq", certreq: "certreq", emprep: "emprep" });
  const i = ESS_NAV.findIndex(([v]) => v === "esspay"); ESS_NAV.splice(i >= 0 ? i : ESS_NAV.length, 0, ["esshr", "Requests to HR", "receipt"]);
}
{ const b = bootIO; bootIO = (db) => { b(db);
  for (const [col, key] of [["orient", "orients"], ["salinc", "salincs"], ["empchg", "chgReqs"], ["certreq", "certReqs"]])
    db.collection(col).limit(3000).onSnapshot((snap) => { S[key] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; if (key === "salincs") applyDueIncrements(); refresh(); }, () => {}); }; }

const RQ_ST = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-bad"], CANCELLED: ["Withdrawn", "c-gray"], READY: ["Ready for release", "c-blue"], RELEASED: ["Released", "c-ok"] };
const stChip = (s) => `<span class="chip ${(RQ_ST[s] || ["", "c-gray"])[1]}">${(RQ_ST[s] || [s])[0]}</span>`;
const empCell = (e, sub) => `<div class="person" style="min-width:190px">${avatar(e, 32)}<span class="who"><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}">${esc(fullName(e))}</button><span class="sub">${esc(sub ?? unitName(e))}</span></span></div>`;
const stTabs = (cur, attr, list) => `<div class="tabs" role="tablist">${list.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${cur === k}" data-${attr}="${k}">${l}</button>`).join("")}</div>`;
const forPicker = (key, label) => S.canEdit ? `<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="emp-for" style="width:auto" aria-label="Employee">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), S.empFor, "Choose employee…")}</select><button class="btn btn-primary btn-sm" data-emp-new="${key}">${label}</button></span>` : "";
const pagerN = (F, n, attr, per = 25) => n <= per ? "" : `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:14px"><span class="t-muted">${(F.page - 1) * per + 1}–${Math.min(F.page * per, n)} of ${n}</span><span style="display:flex;gap:8px">${F.page > 1 ? `<button class="btn btn-ghost btn-sm" data-${attr}="-1">Previous</button>` : ""}${F.page * per < n ? `<button class="btn btn-ghost btn-sm" data-${attr}="1">Next</button>` : ""}</span></div>`;
async function saveRec(col, id, rec) { const { id: _, ...x } = rec; await S.db.doc(`${col}/${id}`).set(JSON.parse(JSON.stringify(x))); S[TCOLS[col]].set(id, { id, ...x }); S.ver++; }

/* ---------- aliases to pages that already exist ---------- */
const alias = (name, fn) => (VIEWS[name] = () => { if (!S.view._al) { S.view._al = 1; fn.before?.(); } return fn.view(); });
alias("joboffer", { view: () => VIEWS.olr() });
alias("trprog", { view: () => VIEWS.trhome() });
alias("onboarding", { before: () => (S.lifeTab = "onboard"), view: () => VIEWS.lifecycle() });
alias("offboarding", { before: () => (S.lifeTab = "offboard"), view: () => VIEWS.lifecycle() });
alias("discipline", { before: () => (S.perfTab = "cases"), view: () => VIEWS.perf() });

/* ---------- home ---------- */
VIEWS.emphome = () => {
  const act = active(); const today = todayISO(); const n = (m, st) => listOf(m).filter((r) => st.includes(r.status) && S.emps.get(r.empId || r.empIds?.[0])).length;
  const docsLow = act.filter((e) => f201Pct(e) < 100).length; const newNo = newHiresNoOrient().length;
  const card = (v, ic, title, val, note, cls = "t-muted") => `<button class="card stat kpi-btn" data-go="${v}" style="text-align:left"><span class="label" style="display:flex;gap:6px;align-items:center">${icon(ic, 16)}${title}</span><span class="value">${val}</span><span class="note ${cls}">${note}</span></button>`;
  const ctrSoon = typeof ctrOf === "function" ? act.filter((e) => { const c = ctrOf(e); return c.end && c.end >= today && c.end <= addDays(today, 30); }).length : 0;
  return head(`${act.length} active employees`, "Employees") + `
    <section class="stats">${dxTile("Active employees", act.length, `${act.filter((e) => e.status === "REGULAR").length} regular`)}${dxTile("New this month", act.filter((e) => (e.hire || "").startsWith(today.slice(0, 7))).length, "hired since the 1st", "t-ok")}${dxTile("Departments", (S.org?.departments || []).length, `${(S.org?.positions || []).length} positions`)}${dxTile("Requests waiting", n(S.salincs, ["PENDING"]) + n(S.chgReqs, ["PENDING"]) + n(S.certReqs, ["PENDING"]), "increments, changes and certificates", "t-warn")}</section>
    <section class="emh-grid">
      ${card("directory", "people", "Employee directory", act.length, "photos, positions and contacts")}
      ${card("departments", "org", "Departments", (S.org?.departments || []).length, "headcount and heads")}
      ${card("contracts", "file", "Contracts", ctrSoon, "ending in 30 days", ctrSoon ? "t-warn" : "t-muted")}
      ${card("joboffer", "mail", "Job offers", listOf(S.apps || new Map()).filter((a) => a.olr && a.olr.status === "PENDING").length, "offer letters waiting")}
      ${card("trprog", "cap", "Training program", listOf(S.courses || new Map()).length, "courses in the catalog")}
      ${card("onboarding", "door", "Onboarding", listOf(S.onb || new Map()).filter((o) => !o.done && S.emps.get(o.empId)).length, "new hires being onboarded")}
      ${card("offboarding", "door", "Offboarding", listOf(S.offb || new Map()).filter((o) => !o.closed && S.emps.get(o.empId)).length, "leaving employees")}
      ${card("orient", "cal", "Orientation requests", newNo, "new hires not yet oriented", newNo ? "t-warn" : "t-muted")}
      ${card("salinc", "pay", "Salary increments", n(S.salincs, ["PENDING"]), "waiting for approval", n(S.salincs, ["PENDING"]) ? "t-warn" : "t-muted")}
      ${card("discipline", "alert", "Disciplinary", listOf(S.cases || new Map()).filter((c) => !c.decision?.d).length, "open cases")}
      ${card("empdocs", "clip", "Employee documents", docsLow, "201 files not complete", docsLow ? "t-warn" : "t-muted")}
      ${card("chgreq", "log", "Change requests", n(S.chgReqs, ["PENDING"]), "profile changes to approve")}
      ${card("certreq", "receipt", "Certificate requests", n(S.certReqs, ["PENDING", "READY"]), "to prepare or release")}
      ${card("emprep", "report", "Employee reports", "6", "headcount, movement, tenure and more")}
    </section>`;
};

/* ---------- directory ---------- */
VIEWS.directory = () => {
  const F = S.dirF; const q = (F.q || "").toLowerCase(); const per = 24;
  const list = active().filter((e) => inUnit(e, F.unit) && (!F.dept || e.deptId === F.dept) && (!q || `${fullName(e)} ${e.no} ${pos(e.posId)?.title || ""} ${e.title || ""} ${e.mobile || ""} ${e.email || ""}`.toLowerCase().includes(q))).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  F.page = Math.min(Math.max(1, F.page), Math.max(1, Math.ceil(list.length / per)));
  return head(`${list.length} of ${active().length} employees`, "Employee directory") + `
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><input class="input" type="search" id="dir-q" value="${esc(F.q)}" placeholder="Name, position, number or phone" aria-label="Search" style="flex:1;min-width:200px">
      <select class="input" id="dir-unit" style="width:auto" aria-label="Site">${opts(unitOpts(), F.unit, "All sites")}</select><select class="input" id="dir-dept" style="width:auto" aria-label="Department">${opts((S.org?.departments || []).map((d) => [d.id, d.name]), F.dept, "All departments")}</select></section>
    <section class="dir-grid">${list.slice((F.page - 1) * per, F.page * per).map((e) => `<article class="card dir-card"><button class="dir-top" data-emp="${e.id}">${avatar(e, 64)}<span><b>${esc(fullName(e))}</b><span class="t-muted">${esc(pos(e.posId)?.title || e.title || "")}</span></span></button>
      <dl><dt>Department</dt><dd>${esc(deptName(e))}</dd><dt>Assignment</dt><dd>${esc(e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office")}</dd><dt>Employee no.</dt><dd>${esc(e.no)}</dd>
      ${e.mobile ? `<dt>Mobile</dt><dd><a href="tel:${esc(e.mobile)}">${esc(e.mobile)}</a></dd>` : ""}${e.email ? `<dt>Email</dt><dd><a href="mailto:${esc(e.email)}">${esc(e.email)}</a></dd>` : ""}</dl><span class="chip ${STATUS[e.status]?.[1] || "c-gray"}">${STATUS[e.status]?.[0] || ""}</span></article>`).join("") || '<section class="card"><p class="empty">No employees match.</p></section>'}</section>
    ${pagerN(F, list.length, "dir-p", per)}`;
};

/* ---------- departments ---------- */
VIEWS.departments = () => {
  const act = active(); const ds = S.org?.departments || []; const today = todayISO();
  const rows = ds.map((d) => { const xs = act.filter((e) => e.deptId === d.id); const head_ = S.emps.get(d.headId);
    const ten = xs.length ? xs.reduce((s, e) => s + daysBetween(e.hire, today) / 365, 0) / xs.length : 0;
    return { d, xs, head: head_, ten, pos: (S.org?.positions || []).filter((p) => p.deptId === d.id).length, newN: xs.filter((e) => e.hire >= addDays(today, -90)).length, open: listOf(S.jobs || new Map()).filter((j) => j.deptId === d.id && j.status === "OPEN").length }; });
  const mx = Math.max(1, ...rows.map((r) => r.xs.length));
  return head(`${ds.length} departments`, "Departments", S.canEdit ? `<button class="btn btn-ghost" data-go="org">Edit departments and positions</button>` : "") + `
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Department</th><th>Department head</th><th class="num">Employees</th><th style="min-width:120px"></th><th class="num">Positions</th><th class="num">New in 90 days</th><th class="num">Open jobs</th><th class="num">Average years</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.d.name)}</b><div class="t-muted" style="font-size:12px">${esc(r.d.code || "")}</div></td>
        <td>${S.canEdit ? `<select class="input" style="min-width:180px" data-dept-head="${r.d.id}" aria-label="Head of ${esc(r.d.name)}">${opts(r.xs.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, `${fullName(e)} · ${pos(e.posId)?.title || ""}`]), r.d.headId || "", "Not set")}</select>` : esc(r.head ? fullName(r.head) : "Not set")}</td>
        <td class="num"><button class="link" data-dept-dir="${r.d.id}">${r.xs.length}</button></td><td><span class="ra-bar"><i style="width:${(r.xs.length / mx) * 100}%"></i></span></td><td class="num">${r.pos}</td><td class="num">${r.newN}</td><td class="num">${r.open}</td><td class="num">${r.ten.toFixed(1)}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">No departments yet.</td></tr>'}
    </tbody></table></div></section>`;
};

/* ---------- orientation requests ---------- */
const OR_TOPICS = ["Company profile, vision and org chart", "Code of conduct and company policies", "Pay days, payslips, leave and benefits", "Safety and health (OSH)", "Timekeeping and phone clock-in", "IT accounts and data privacy", "Department or site orientation"];
const OR_ST = { REQUESTED: ["Requested", "c-warn"], SCHEDULED: ["Scheduled", "c-blue"], DONE: ["Done", "c-ok"], CANCELLED: ["Cancelled", "c-gray"] };
const newHiresNoOrient = () => { const done = new Set(listOf(S.orients).filter((o) => o.status !== "CANCELLED").flatMap((o) => o.empIds || [])); return active().filter((e) => e.hire >= addDays(todayISO(), -60) && !done.has(e.id)); };
VIEWS.orient = () => {
  const F = S.orF; const all = listOf(S.orients).sort((a, b) => (b.date || b.filed || "").localeCompare(a.date || a.filed || "")); const list = all.filter((o) => F.st === "OPEN" ? ["REQUESTED", "SCHEDULED"].includes(o.status) : !F.st || o.status === F.st);
  const nh = newHiresNoOrient(); const ed = S.canEdit; const o = S.orEdit ? S.orients.get(S.orEdit) : null;
  return head("Employees", "Orientation requests", ed ? `<button class="btn btn-gold" data-or-new="1">${icon("plus")}New orientation request</button>` : "") + `
    <section class="stats">${dxTile("New hires not yet oriented", nh.length, "hired in the last 60 days", nh.length ? "t-warn" : "t-muted")}${dxTile("Requested", all.filter((x) => x.status === "REQUESTED").length, "to schedule")}${dxTile("Scheduled", all.filter((x) => x.status === "SCHEDULED").length, "coming up")}${dxTile("Oriented this year", all.filter((x) => x.status === "DONE" && (x.date || "").startsWith(todayISO().slice(0, 4))).reduce((s, x) => s + Object.values(x.att || {}).filter(Boolean).length, 0), "employees attended", "t-ok")}</section>
    ${S.orNew || o ? orForm(o, nh) : ""}
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "or-st", [["OPEN", "Open"], ["DONE", "Done"], ["CANCELLED", "Cancelled"], ["", "All"]])}</section>
    ${list.map((x) => { const st = OR_ST[x.status]; const es = (x.empIds || []).map((id) => S.emps.get(id)).filter(Boolean);
      return `<section class="card"><div class="card-head"><h2>${esc(x.title || "New hire orientation")}</h2><span class="chip ${st[1]}">${st[0]}</span></div>
        <p style="margin:0 0 8px;font-size:14px">${x.date ? `<b>${fmtDate(x.date)}${x.time ? `, ${esc(x.time)}` : ""}</b> · ${esc(x.venue || "Venue to follow")}` : '<span class="t-warn">No date yet</span>'}${x.facId && S.emps.get(x.facId) ? ` · Facilitator ${esc(fullName(S.emps.get(x.facId)))}` : ""}${x.reqBy ? ` · Requested by ${esc(x.reqBy)}` : ""}</p>
        <p class="t-muted" style="margin:0 0 8px;font-size:13px">${(x.topics || []).map(esc).join(" · ")}</p>
        <div class="or-people">${es.map((e) => `<label class="or-p">${x.status === "SCHEDULED" && ed ? `<input type="checkbox" data-or-att="${x.id}|${e.id}" ${x.att?.[e.id] ? "checked" : ""}>` : x.status === "DONE" ? `<span class="chip ${x.att?.[e.id] ? "c-ok" : "c-bad"}">${x.att?.[e.id] ? "Attended" : "Absent"}</span>` : ""}${avatar(e, 26)}<span>${esc(fullName(e))}<small class="t-muted"> ${esc(pos(e.posId)?.title || "")}</small></span></label>`).join("")}</div>
        ${ed && ["REQUESTED", "SCHEDULED"].includes(x.status) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-ghost btn-sm" data-or-edit="${x.id}">${x.status === "REQUESTED" ? "Schedule" : "Change"}</button>${x.status === "SCHEDULED" ? `<button class="btn btn-primary btn-sm" data-or-set="${x.id}:DONE">Mark done (ticked people attended)</button>` : ""}<button class="btn btn-ghost btn-sm" data-or-set="${x.id}:CANCELLED">Cancel</button></div>` : ""}</section>`; }).join("") || '<section class="card"><p class="empty">No orientation requests here.</p></section>'}`;
};
function orForm(o, nh) {
  const sel = new Set(o ? o.empIds : nh.map((e) => e.id)); const pool = [...new Map([...nh, ...(o?.empIds || []).map((id) => S.emps.get(id)).filter(Boolean)].map((e) => [e.id, e])).values()];
  const topics = new Set(o ? o.topics : OR_TOPICS);
  return `<section class="card"><div class="card-head"><h2>${o ? "Schedule orientation" : "New orientation request"}</h2></div><form id="or-form" class="stack" style="gap:14px" data-id="${o?.id || ""}" data-keep>
    <div class="form-grid"><div class="field"><label for="or-title">Title</label><input class="input" id="or-title" value="${esc(o?.title || "New hire orientation")}"></div>
      <div class="field"><label for="or-req">Requested by</label><input class="input" id="or-req" value="${esc(o?.reqBy || "")}" placeholder="Department or supervisor"></div>
      <div class="field"><label for="or-date">Date</label><input class="input" id="or-date" type="date" value="${esc(o?.date || "")}"></div><div class="field"><label for="or-time">Time</label><input class="input" id="or-time" type="time" value="${esc(o?.time || "08:00")}"></div>
      <div class="field"><label for="or-venue">Venue or link</label><input class="input" id="or-venue" value="${esc(o?.venue || "")}" placeholder="Head Office training room"></div>
      <div class="field"><label for="or-fac">Facilitator</label><select class="input" id="or-fac">${opts(active().filter((e) => /hr|human/i.test(deptName(e)) || /hr|human|training/i.test(pos(e.posId)?.title || "")).map((e) => [e.id, fullName(e)]), o?.facId || "", "Choose…")}</select></div></div>
    <fieldset class="or-fs"><legend>Employees to orient</legend>${pool.length ? pool.map((e) => `<label class="or-p"><input type="checkbox" name="or-emp" value="${e.id}" ${sel.has(e.id) ? "checked" : ""}>${avatar(e, 24)}${esc(fullName(e))} <small class="t-muted">hired ${fmtDate(e.hire)}</small></label>`).join("") : '<p class="t-muted" style="margin:0">Everyone hired in the last 60 days already has an orientation. Add someone below.</p>'}
      <div class="field" style="margin-top:8px"><label for="or-add">Add another employee</label><select class="input" id="or-add">${opts(active().filter((e) => !pool.includes(e)).sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), "", "Choose…")}</select></div></fieldset>
    <fieldset class="or-fs"><legend>Topics</legend>${OR_TOPICS.map((t) => `<label class="or-p"><input type="checkbox" name="or-topic" value="${esc(t)}" ${topics.has(t) ? "checked" : ""}>${esc(t)}</label>`).join("")}</fieldset>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-or-close="1">Cancel</button><button class="btn btn-primary">${o ? "Save schedule" : "Save request"}</button></div></form></section>`;
}

/* ---------- salary increments ---------- */
const SI_KIND = [["MERIT", "Merit increase"], ["PROMOTION", "Promotion"], ["REGULARIZATION", "Regularization"], ["WAGE_ORDER", "Wage order"], ["ADJUSTMENT", "Salary adjustment"]];
async function applyIncrement(r) {
  const e = S.emps.get(r.empId); if (!e) return;
  const ne = { ...e, basicPay: Number(r.to), history: [...(e.history || []), { d: r.effective, kind: "Salary adjustment", text: `pay ${peso.format(r.from || 0)} to ${peso.format(r.to)} (${SI_KIND.find((k) => k[0] === r.kind)?.[1] || "Increase"}${r.reason ? `: ${r.reason}` : ""})` }] };
  await saveEmp(ne); S.emps.set(e.id, ne); await saveRec("salinc", r.id, { ...r, applied: todayISO() });
}
let siBusy = false;
async function applyDueIncrements() {
  if (siBusy || !S.realEdit) return; siBusy = true;
  try { for (const r of listOf(S.salincs)) if (r.status === "APPROVED" && !r.applied && r.effective <= todayISO() && S.emps.get(r.empId)) { await applyIncrement(r); logActivity(`Applied the salary increase of ${fullName(S.emps.get(r.empId))}`); } } catch {} finally { siBusy = false; }
}
VIEWS.salinc = () => {
  const F = S.siF; const all = listOf(S.salincs).filter((r) => S.emps.get(r.empId)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const list = all.filter((r) => !F.st || r.status === F.st);
  const fe = S.emps.get(S.empFor); const y = todayISO().slice(0, 4); const doneY = all.filter((r) => r.status === "APPROVED" && (r.effective || "").startsWith(y));
  const pct = (r) => r.from ? ((r.to - r.from) / r.from) * 100 : 0; const monthly = (r) => { const e = S.emps.get(r.empId); return (r.to - (r.from || 0)) * ((r.payType || e.payType) === "DAILY" ? 26 : 1); };
  return head("Employees", "Salary increments") + `
    <section class="stats">${dxTile("Waiting for approval", all.filter((r) => r.status === "PENDING").length, "increment requests", "t-warn")}${dxTile(`Approved in ${y}`, doneY.length, "employees with a raise", "t-ok")}${dxTile("Average increase", doneY.length ? `${(doneY.reduce((s, r) => s + pct(r), 0) / doneY.length).toFixed(1)}%` : "—", "approved this year")}${dxTile("Added monthly cost", peso.format(PAY.r2(doneY.reduce((s, r) => s + monthly(r), 0))), "approved this year, daily rates × 26")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "si-st", [["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]])}${forPicker("salinc", "New increment")}</section>
    ${S.empNew === "salinc" && fe ? `<section class="card"><div class="card-head"><h2>Salary increment for ${esc(fullName(fe))}</h2><span class="t-muted" style="font-size:13px">Now ${esc(payLabel(fe.basicPay, fe.payType))}</span></div>
      <form id="si-form" class="panel form-grid" style="align-items:end" data-emp-id="${fe.id}" data-keep>
        <div class="field"><label for="si-kind">Kind</label><select class="input" id="si-kind">${opts(SI_KIND, "MERIT")}</select></div>
        <div class="field"><label for="si-to">New basic pay (${fe.payType === "DAILY" ? "a day" : "a month"}) <span class="req">*</span></label><input class="input" id="si-to" type="number" min="1" step="0.01" required value="${PAY.r2((fe.basicPay || 0) * 1.05)}"></div>
        <div class="field"><label for="si-eff">Effective <span class="req">*</span></label><input class="input" id="si-eff" type="date" required value="${todayISO().slice(0, 8)}${todayISO().slice(8) <= "15" ? "16" : "01"}"></div>
        <div class="field"><label for="si-why">Reason</label><input class="input" id="si-why" placeholder="e.g. Very satisfactory rating"></div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button></div></form></section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Kind</th><th class="num">From</th><th class="num">To</th><th class="num">Increase</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => { const e = S.emps.get(r.empId); return `<tr><td>${empCell(e, pos(e.posId)?.title || "")}</td><td>${esc(SI_KIND.find((k) => k[0] === r.kind)?.[1] || "")}${r.reason ? `<div class="t-muted" style="font-size:12px;max-width:200px">${esc(r.reason)}</div>` : ""}</td>
        <td class="num">${money(r.from)}</td><td class="num"><b>${money(r.to)}</b></td><td class="num">${pct(r).toFixed(1)}%</td><td style="white-space:nowrap">${fmtDate(r.effective)}</td>
        <td>${stChip(r.status)}${r.status === "APPROVED" ? `<div class="t-muted" style="font-size:12px">${r.applied ? "Applied to pay" : "Applies on the effective date"}</div>` : ""}</td>
        <td class="num" style="white-space:nowrap">${r.status === "PENDING" && S.canEdit ? `<button class="btn btn-primary btn-sm" data-si-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-si-set="${r.id}:REJECTED">Reject</button>` : r.status === "APPROVED" ? `<button class="btn btn-ghost btn-sm" data-si-letter="${r.id}">Notice</button>` : ""}</td></tr>`; }).join("") || '<tr><td colspan="8" class="empty">No increments here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Approved increments change the basic pay on the effective date, add a line to the employee's history and appear in the Employee change log.</p></section>`;
};

/* ---------- employee documents (201 file completeness) ---------- */
VIEWS.empdocs = () => {
  const F = S.edF; const q = (F.q || "").toLowerCase(); const act = active(); const today = todayISO();
  const rows = act.map((e) => ({ e, st: f201Status(e), pct: f201Pct(e) })).filter((r) => (!F.only || r.pct < 100) && (!q || `${fullName(r.e)} ${r.e.no}`.toLowerCase().includes(q))).sort((a, b) => a.pct - b.pct || fullName(a.e).localeCompare(fullName(b.e)));
  const exp = act.flatMap((e) => (e.docs || []).filter((d) => d.exp && d.exp <= addDays(today, 60)).map((d) => ({ e, d }))).sort((a, b) => a.d.exp.localeCompare(b.d.exp));
  const miss = F201.map(([k, label]) => [label, act.filter((e) => !f201Status(e).find((x) => x.k === k)?.done).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  F.page = Math.min(Math.max(1, F.page), Math.max(1, Math.ceil(rows.length / 25)));
  return head("Employees", "Employee documents") + `
    <section class="stats">${dxTile("Complete 201 files", act.filter((e) => f201Pct(e) === 100).length, `of ${act.length} active employees`, "t-ok")}${dxTile("Incomplete", act.filter((e) => f201Pct(e) < 100).length, "missing at least one document", "t-warn")}${dxTile("Expiring in 60 days", exp.filter((x) => x.d.exp >= today).length, "licenses, IDs, clearances")}${dxTile("Expired", exp.filter((x) => x.d.exp < today).length, "need a new copy", exp.some((x) => x.d.exp < today) ? "t-bad" : "t-muted")}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>Most often missing</h2></div>${hrows(miss.slice(0, 8)) || '<p class="empty">Every 201 file is complete.</p>'}</section>
      <section class="card"><div class="card-head"><h2>Expiring or expired</h2></div>${exp.length ? `<ul class="list" style="font-size:14px">${exp.slice(0, 10).map(({ e, d }) => `<li style="display:flex;justify-content:space-between;gap:10px"><span><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button> · ${esc(d.kind)}</span><span class="chip ${d.exp < today ? "c-bad" : "c-warn"}">${d.exp < today ? "Expired" : "Expires"} ${fmtDate(d.exp)}</span></li>`).join("")}</ul>` : '<p class="empty">Nothing expiring.</p>'}</section></div>
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><input class="input" type="search" id="ed-q" value="${esc(F.q)}" placeholder="Find employee" aria-label="Find employee" style="flex:1;min-width:180px"><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="ed-only" ${F.only ? "checked" : ""}> Incomplete only</label></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th style="min-width:140px">201 file</th><th>Missing</th></tr></thead><tbody>
      ${rows.slice((F.page - 1) * 25, F.page * 25).map(({ e, st, pct }) => `<tr><td>${empCell(e)}</td><td><span class="ra-bar"><i style="width:${pct}%"></i></span><span class="t-muted" style="font-size:12px">${pct}%</span></td><td class="t-muted" style="font-size:13px">${st.filter((x) => !x.done).map((x) => esc(x.label)).join(", ") || "Complete"}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">No employees here.</td></tr>'}</tbody></table></div>
      ${pagerN(F, rows.length, "ed-p")}<p class="t-muted" style="font-size:13px;margin:10px 0 0">Open an employee to upload a document or tick a paper copy as received.</p></section>`;
};

/* ---------- change requests ---------- */
const CHG_FIELDS = [["address", "Address"], ["mobile", "Mobile number"], ["email", "Email"], ["civil", "Civil status"], ["last", "Last name (marriage or court order)"], ["emergencyName", "Emergency contact"], ["emergencyPhone", "Emergency phone"], ["tin", "TIN"], ["sss", "SSS number"], ["philhealth", "PhilHealth number"], ["pagibig", "Pag-IBIG number"]];
const chgLabel = (k) => CHG_FIELDS.find((x) => x[0] === k)?.[1] || k;
function chgForm(e) {
  return `<form id="cq-form" class="panel form-grid" style="align-items:end" data-emp-id="${e.id}" data-keep>
    <div class="field"><label for="cq-field">What to change</label><select class="input" id="cq-field">${opts(CHG_FIELDS, S.cqField || "address")}</select></div>
    <div class="field"><label>Now on file</label><div class="input" style="background:transparent" id="cq-now">${esc(e[S.cqField || "address"] || "—")}</div></div>
    <div class="field"><label for="cq-to">Change to <span class="req">*</span></label><input class="input" id="cq-to" required></div>
    <div class="field"><label for="cq-why">Reason</label><input class="input" id="cq-why" placeholder="e.g. Moved house, got married"></div>
    <div class="field"><label for="cq-file">Proof (optional)</label><input class="input" id="cq-file" type="file" accept="image/*,application/pdf"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button></div></form>`;
}
const chgRow = (r, mgr) => { const e = S.emps.get(r.empId); return `<tr>${mgr ? `<td>${empCell(e)}</td>` : ""}<td><b>${esc(chgLabel(r.field))}</b></td><td class="t-muted">${esc(r.from || "—")}</td><td>${esc(r.to)}</td><td class="t-muted" style="max-width:200px">${esc(r.reason || "")}${r.proof && !(r.files || []).length ? ` · <a href="/_blob/${esc(r.proof.id)}" target="_blank" rel="noopener">${esc(r.proof.name)}</a>` : ""}${fzLinks(r.files)}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.filed)}</td><td>${stChip(r.status)}</td>
  <td class="num" style="white-space:nowrap">${r.status === "PENDING" ? mgr && S.canEdit ? `<button class="btn btn-primary btn-sm" data-cq-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-cq-set="${r.id}:REJECTED">Reject</button>` : !mgr && S.realEdit ? `<button class="link danger" data-cq-set="${r.id}:CANCELLED">Withdraw</button>` : "" : ""}</td></tr>`; };
VIEWS.chgreq = () => {
  const F = S.crF; const all = listOf(S.chgReqs).filter((r) => S.emps.get(r.empId)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const list = all.filter((r) => !F.st || r.status === F.st); const fe = S.emps.get(S.empFor);
  return head("Employees", "Change requests") + `
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "cr-st", [["PENDING", `Waiting (${all.filter((r) => r.status === "PENDING").length})`], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]])}${forPicker("chgreq", "New change request")}</section>
    ${S.empNew === "chgreq" && fe ? `<section class="card"><div class="card-head"><h2>Change request for ${esc(fullName(fe))}</h2></div>${chgForm(fe)}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Change</th><th>From</th><th>To</th><th>Reason and proof</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => chgRow(r, true)).join("") || '<tr><td colspan="8" class="empty">No change requests here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Approving a request updates the employee's record and adds it to the Employee change log.</p></section>`;
};

/* ---------- certificate requests ---------- */
const CERTS = [["COE", "Certificate of employment"], ["COEC", "Certificate of employment with compensation"], ["SERVICE", "Service record"], ["CLEAR", "Clearance certificate"], ["2316", "BIR 2316 copy"], ["CONTRIB", "Certificate of SSS, PhilHealth and Pag-IBIG contributions"]];
const certName = (k) => CERTS.find((c) => c[0] === k)?.[1] || k;
function certForm(e) {
  return `<form id="cert-form" class="panel form-grid" style="align-items:end" data-emp-id="${e.id}" data-keep>
    <div class="field"><label for="ct-type">Certificate</label><select class="input" id="ct-type">${opts(CERTS, "COE")}</select></div>
    <div class="field"><label for="ct-purpose">Purpose <span class="req">*</span></label><input class="input" id="ct-purpose" required list="ct-pl" placeholder="e.g. Bank loan, visa application"><datalist id="ct-pl">${["Bank loan", "Housing loan (Pag-IBIG)", "Visa application", "SSS or PhilHealth claim", "New employment", "School requirement"].map((x) => `<option value="${x}">`).join("")}</datalist></div>
    <div class="field"><label for="ct-copies">Copies</label><input class="input" id="ct-copies" type="number" min="1" max="10" value="1"></div>
    <div class="field"><label for="ct-need">Needed by</label><input class="input" id="ct-need" type="date" value="${addDays(todayISO(), 3)}"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary">Send request</button><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button></div></form>`;
}
const certRow = (r, mgr) => { const e = S.emps.get(r.empId); const late = ["PENDING", "READY"].includes(r.status) && r.need && r.need < todayISO();
  return `<tr>${mgr ? `<td>${empCell(e)}</td>` : ""}<td><b>${esc(certName(r.type))}</b>${r.copies > 1 ? ` <span class="t-muted">× ${r.copies}</span>` : ""}</td><td class="t-muted">${esc(r.purpose || "")}${fzLinks(r.files)}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.filed)}</td><td style="white-space:nowrap"${late ? ' class="t-bad"' : ""}>${r.need ? fmtDate(r.need) : "—"}</td><td>${stChip(r.status)}${r.released ? `<div class="t-muted" style="font-size:12px">${fmtDate(r.released)}</div>` : ""}</td>
  <td class="num" style="white-space:nowrap">${mgr && S.canEdit ? `${["PENDING", "READY", "RELEASED"].includes(r.status) ? `<button class="btn btn-ghost btn-sm" data-cert-print="${r.id}">Print</button> ` : ""}${r.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-cert-set="${r.id}:READY">Ready</button> <button class="btn btn-ghost btn-sm" data-cert-set="${r.id}:REJECTED">Reject</button>` : r.status === "READY" ? `<button class="btn btn-primary btn-sm" data-cert-set="${r.id}:RELEASED">Released</button>` : ""}` : !mgr && S.realEdit && r.status === "PENDING" ? `<button class="link danger" data-cert-set="${r.id}:CANCELLED">Withdraw</button>` : ""}</td></tr>`; };
VIEWS.certreq = () => {
  const F = S.cqF; const all = listOf(S.certReqs).filter((r) => S.emps.get(r.empId)).sort((a, b) => (a.need || "9").localeCompare(b.need || "9")); const list = all.filter((r) => F.st === "PENDING" ? ["PENDING", "READY"].includes(r.status) : !F.st || r.status === F.st); const fe = S.emps.get(S.empFor);
  const m = todayISO().slice(0, 7);
  return head("Employees", "Certificate requests") + `
    <section class="stats">${dxTile("To prepare", all.filter((r) => r.status === "PENDING").length, "new requests", "t-warn")}${dxTile("Ready for release", all.filter((r) => r.status === "READY").length, "waiting for pick-up")}${dxTile("Overdue", all.filter((r) => ["PENDING", "READY"].includes(r.status) && r.need && r.need < todayISO()).length, "past the needed-by date", "t-bad")}${dxTile("Released this month", all.filter((r) => r.status === "RELEASED" && (r.released || "").startsWith(m)).length, "certificates", "t-ok")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "cq-st", [["PENDING", "Open"], ["RELEASED", "Released"], ["REJECTED", "Rejected"], ["", "All"]])}${forPicker("certreq", "New certificate request")}</section>
    ${S.empNew === "certreq" && fe ? `<section class="card"><div class="card-head"><h2>Certificate request for ${esc(fullName(fe))}</h2></div>${certForm(fe)}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Certificate</th><th>Purpose</th><th>Filed</th><th>Needed by</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => certRow(r, true)).join("") || '<tr><td colspan="7" class="empty">No certificate requests here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Print makes the certificate with the HR Manager's signature block, ready to sign. DOLE expects a certificate of employment within 3 days of the request.</p></section>`;
};
function certLetter(r) {
  const e = S.emps.get(r.empId); const co = esc(S.org?.companyName || "the company"); const today = fmtDate(todayISO()); const end = e.separated?.date;
  const sig = `<div style="margin-top:56px">${signer()}</div>`; const purpose = r.purpose ? `<p>This certification is issued upon the request of ${esc(fullName(e))} for ${esc(r.purpose.toLowerCase())}.</p>` : "";
  const intro = `<p>This is to certify that <b>${esc(fullName(e))}</b> ${end ? "was" : "is"} employed by ${co} as <b>${esc(pos(e.posId)?.title || "employee")}</b> from <b>${fmtDate(e.hire)}</b> ${end ? `to <b>${fmtDate(end)}</b>` : "up to the present"}.</p>`;
  const y = todayISO().slice(0, 4); const pays = []; for (let i = 0; i > -12; i--) { const id = PAY.shiftPeriod(curPeriod(), i - 1); const l = payrun(id).lines?.[e.id]; if (l) pays.push([PAY.period(id).label, l]); }
  let body;
  if (r.type === "COE") body = `<h2>CERTIFICATE OF EMPLOYMENT</h2><p style="text-align:right">${today}</p>${intro}${purpose}${sig}`;
  else if (r.type === "COEC") body = `<h2>CERTIFICATE OF EMPLOYMENT AND COMPENSATION</h2><p style="text-align:right">${today}</p>${intro}<p>${end ? "Their" : "Their present"} basic pay ${end ? "was" : "is"} <b>${payLabel(e.basicPay, e.payType)}</b>${e.payType === "DAILY" ? `, or about <b>${peso.format(PAY.r2(e.basicPay * 26))}</b> a month` : ""}, with the benefits required by law, including 13th month pay.</p>${purpose}${sig}`;
  else if (r.type === "SERVICE") body = `<h2>SERVICE RECORD</h2><p style="text-align:right">${today}</p><p><b>${esc(fullName(e))}</b> · ${esc(e.no)}</p><table><tr><td><b>Date</b></td><td><b>Movement</b></td><td><b>Details</b></td></tr>${(e.history || []).map((h) => `<tr><td>${fmtDate(h.d)}</td><td>${esc(h.kind)}</td><td>${esc(h.text || "")}</td></tr>`).join("") || `<tr><td>${fmtDate(e.hire)}</td><td>Hired</td><td>${esc(pos(e.posId)?.title || "")}</td></tr>`}</table>${purpose}${sig}`;
  else if (r.type === "CLEAR") body = `<h2>CLEARANCE CERTIFICATE</h2><p style="text-align:right">${today}</p>${intro}<p>This is to further certify that ${esc(fullName(e))} has no pending accountabilities with the company as of this date${end ? " and has been cleared of all company property, cash advances and loans" : ""}.</p>${purpose}${sig}`;
  else if (r.type === "CONTRIB") body = `<h2>CERTIFICATE OF CONTRIBUTIONS</h2><p style="text-align:right">${today}</p>${intro}<p>SSS ${esc(e.sss || "—")} · PhilHealth ${esc(e.philhealth || "—")} · Pag-IBIG ${esc(e.pagibig || "—")}</p><table><tr><td><b>Pay period</b></td><td class="num"><b>SSS</b></td><td class="num"><b>PhilHealth</b></td><td class="num"><b>Pag-IBIG</b></td></tr>${pays.map(([p, l]) => `<tr><td>${esc(p)}</td><td class="num">${money(l.sss + (l.sssEr || 0) + (l.ec || 0))}</td><td class="num">${money(l.ph + (l.phEr || 0))}</td><td class="num">${money(l.hd + (l.hdEr || 0))}</td></tr>`).join("")}</table><p class="muted">Employee and employer shares combined, last ${pays.length} pay periods.</p>${purpose}${sig}`;
  else body = `<h2>REQUEST FOR BIR 2316 COPY</h2><p style="text-align:right">${today}</p>${intro}<p>A certified copy of BIR Form 2316 for ${y} is attached. Generate it from Tax &amp; BIR.</p>${sig}`;
  return saveLetter(`${r.type}-${e.no}.html`, `${certName(r.type)} ${e.no}`, body);
}

/* ---------- reports ---------- */
VIEWS.emprep = () => {
  const tab = S.erTab; const act = active(); const all = [...S.emps.values()]; const today = todayISO(); const T = [["head", "Headcount"], ["demo", "Demographics"], ["tenure", "Tenure"], ["move", "Movement"], ["pay", "Pay increases"], ["req", "Requests"]];
  const count = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const age = (e) => e.birth ? Math.floor(daysBetween(e.birth, today) / 365.25) : null; const yrs = (e) => daysBetween(e.hire, today) / 365.25;
  const band = (v, bs) => v == null ? "Not on file" : bs.find(([mx]) => v < mx)?.[1] || bs[bs.length - 1][1];
  let body = "";
  if (tab === "head") body = `<section class="stats">${dxTile("Active", act.length, "employees")}${dxTile("Head Office", act.filter((e) => !e.projectId).length, "employees")}${dxTile("Projects", act.filter((e) => e.projectId).length, "employees")}${dxTile("Regular", act.filter((e) => e.status === "REGULAR").length, `${act.length ? Math.round(act.filter((e) => e.status === "REGULAR").length / act.length * 100) : 0}% of active`)}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>By department</h2></div>${hrows(count(act, deptName))}</section><section class="card"><div class="card-head"><h2>By site</h2></div>${hrows(count(act, unitName).slice(0, 12))}</section></div>
    <div class="two"><section class="card"><div class="card-head"><h2>By employment status</h2></div>${hrows(count(act, (e) => STATUS[e.status]?.[0] || "Not set"))}</section><section class="card"><div class="card-head"><h2>By position</h2></div>${hrows(count(act, (e) => pos(e.posId)?.title || "Not set").slice(0, 12))}</section></div>`;
  else if (tab === "demo") body = `<div class="two"><section class="card"><div class="card-head"><h2>By sex</h2></div>${hrows(count(act, (e) => ({ M: "Male", F: "Female" })[e.gender?.[0]?.toUpperCase()] || "Not on file"))}</section><section class="card"><div class="card-head"><h2>By civil status</h2></div>${hrows(count(act, (e) => e.civil || "Not on file"))}</section></div>
    <section class="card"><div class="card-head"><h2>By age</h2></div>${hrows(["Under 25", "25–34", "35–44", "45–54", "55 and over", "Not on file"].map((l) => [l, act.filter((e) => band(age(e), [[25, "Under 25"], [35, "25–34"], [45, "35–44"], [55, "45–54"], [999, "55 and over"]]) === l).length]).filter((x) => x[1]))}</section>`;
  else if (tab === "tenure") { const bs = [[0.5, "Under 6 months"], [1, "6–12 months"], [3, "1–3 years"], [5, "3–5 years"], [10, "5–10 years"], [999, "10 years or more"]];
    body = `<section class="stats">${dxTile("Average tenure", act.length ? `${(act.reduce((s, e) => s + yrs(e), 0) / act.length).toFixed(1)} yrs` : "—", "active employees")}${dxTile("Under 1 year", act.filter((e) => yrs(e) < 1).length, "employees")}${dxTile("5 years or more", act.filter((e) => yrs(e) >= 5).length, "employees")}${dxTile("Due for regularization", act.filter((e) => e.status === "PROBATIONARY" && yrs(e) >= 0.4).length, "probation ending soon", "t-warn")}</section>
    <section class="card"><div class="card-head"><h2>By length of service</h2></div>${hrows(bs.map(([, l]) => [l, act.filter((e) => band(yrs(e), bs) === l).length]))}</section>`; }
  else if (tab === "move") { const ms = monthsBack(12); const hires = ms.map(([m, l]) => [l, all.filter((e) => (e.hire || "").startsWith(m)).length]); const seps = ms.map(([m, l]) => [l, all.filter((e) => (e.separated?.date || "").startsWith(m)).length]);
    const sep12 = all.filter((e) => e.separated?.date >= addDays(today, -365)).length; const avg = (act.length + sep12 / 2) || 1;
    body = `<section class="stats">${dxTile("Hired in 12 months", hires.reduce((s, x) => s + x[1], 0), "new employees", "t-ok")}${dxTile("Separated in 12 months", sep12, "resigned, ended or dismissed")}${dxTile("Turnover rate", `${((sep12 / avg) * 100).toFixed(1)}%`, "separations ÷ average headcount")}${dxTile("Movements in 12 months", all.reduce((s, e) => s + (e.history || []).filter((h) => h.d >= addDays(today, -365) && h.kind !== "Hired").length, 0), "promotions, transfers, pay changes")}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>New employees per month</h2></div>${vbars(hires, { label: "New employees per month" })}</section><section class="card"><div class="card-head"><h2>Separations per month</h2></div>${vbars(seps, { label: "Separations per month" })}</section></div>
    <section class="card"><div class="card-head"><h2>Separations by reason</h2></div>${hrows(count(all.filter((e) => e.separated?.date >= addDays(today, -365)), (e) => e.separated?.reason || e.separated?.type || "Not given")) || '<p class="empty">No separations in 12 months.</p>'}</section>`; }
  else if (tab === "pay") { const ok = listOf(S.salincs).filter((r) => r.status === "APPROVED" && S.emps.get(r.empId)); const pct = (r) => r.from ? ((r.to - r.from) / r.from) * 100 : 0;
    body = `<section class="stats">${dxTile("Increments approved", ok.length, "all time")}${dxTile("Average increase", ok.length ? `${(ok.reduce((s, r) => s + pct(r), 0) / ok.length).toFixed(1)}%` : "—", "per increment")}${dxTile("Employees never raised", act.filter((e) => yrs(e) >= 1 && !ok.some((r) => r.empId === e.id) && !(e.history || []).some((h) => /salary/i.test(h.kind))).length, "with a year or more of service", "t-warn")}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>By kind</h2></div>${hrows(count(ok, (r) => SI_KIND.find((k) => k[0] === r.kind)?.[1] || "Other")) || '<p class="empty">No increments yet.</p>'}</section><section class="card"><div class="card-head"><h2>By department</h2></div>${hrows(count(ok, (r) => deptName(S.emps.get(r.empId)))) || '<p class="empty">No increments yet.</p>'}</section></div>`; }
  else { const reqs = [["Salary increments", S.salincs], ["Change requests", S.chgReqs], ["Certificate requests", S.certReqs], ["Orientation requests", S.orients]];
    body = `<section class="card"><div class="table-wrap"><table><thead><tr><th>Request</th><th class="num">Total</th><th class="num">Waiting</th><th class="num">Done</th><th class="num">Rejected or cancelled</th></tr></thead><tbody>${reqs.map(([l, m]) => { const xs = listOf(m); return `<tr><td>${l}</td><td class="num">${xs.length}</td><td class="num">${xs.filter((r) => ["PENDING", "REQUESTED", "READY", "SCHEDULED"].includes(r.status)).length}</td><td class="num">${xs.filter((r) => ["APPROVED", "RELEASED", "DONE"].includes(r.status)).length}</td><td class="num">${xs.filter((r) => ["REJECTED", "CANCELLED"].includes(r.status)).length}</td></tr>`; }).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>Certificates by type</h2></div>${hrows(count(listOf(S.certReqs), (r) => certName(r.type))) || '<p class="empty">No certificate requests yet.</p>'}</section>`; }
  return head("Employees", "Employee reports") + `<div class="tabs on-blue" role="tablist">${T.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-er-tab="${k}">${l}</button>`).join("")}</div>` + body;
};

/* ---------- employee side: requests to HR ---------- */
ESS.esshr = (e) => {
  const cs = listOf(S.certReqs).filter((r) => r.empId === e.id).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const ch = listOf(S.chgReqs).filter((r) => r.empId === e.id).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  return head("Employee", "Requests to HR") + `
    <section class="card"><div class="card-head"><h2>Certificates</h2><button class="btn ${S.empNew === "certreq" ? "btn-primary" : "btn-ghost"} btn-sm" data-emp-new="certreq">Request a certificate</button></div>
      ${S.empNew === "certreq" && S.realEdit ? certForm(e) : '<p class="t-muted" style="margin:0;font-size:14px">Certificate of employment, with compensation, service record, clearance, BIR 2316 or contributions.</p>'}
      ${cs.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Certificate</th><th>Purpose</th><th>Filed</th><th>Needed by</th><th>Status</th><th></th></tr></thead><tbody>${cs.map((r) => certRow(r, false)).join("")}</tbody></table></div>` : ""}</section>
    <section class="card"><div class="card-head"><h2>Changes to my record</h2><button class="btn ${S.empNew === "chgreq" ? "btn-primary" : "btn-ghost"} btn-sm" data-emp-new="chgreq">Request a change</button></div>
      ${S.empNew === "chgreq" && S.realEdit ? chgForm(e) : '<p class="t-muted" style="margin:0;font-size:14px">New address, phone, civil status, name or government numbers. HR checks and approves each change.</p>'}
      ${ch.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Change</th><th>From</th><th>To</th><th>Reason</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>${ch.map((r) => chgRow(r, false)).join("")}</tbody></table></div>` : ""}</section>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-emp-new],[data-dir-p],[data-ed-p],[data-dept-dir],[data-or-new],[data-or-edit],[data-or-close],[data-or-st],[data-or-set],[data-si-st],[data-si-set],[data-si-letter],[data-cr-st],[data-cq-set],[data-cq-st],[data-cert-set],[data-cert-print],[data-er-tab]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.empNew !== undefined) { if (d.empNew && S.viewAs !== "emp" && !S.empFor) { toast("Choose the employee first."); $("#emp-for")?.focus(); return; } S.empNew = d.empNew || null; S.cqField = null; render(); return; }
  if (d.dirP) { S.dirF.page += Number(d.dirP); render(); window.scrollTo({ top: 0 }); return; }
  if (d.edP) { S.edF.page += Number(d.edP); render(); return; }
  if (d.deptDir) { S.dirF = { q: "", unit: "", dept: d.deptDir, page: 1 }; go("directory"); return; }
  if (d.orNew) { S.orNew = true; S.orEdit = null; render(); return; }
  if (d.orEdit) { S.orEdit = d.orEdit; S.orNew = false; render(); window.scrollTo({ top: 0 }); return; }
  if (d.orClose) { S.orNew = false; S.orEdit = null; render(); return; }
  if (d.orSt !== undefined) { S.orF.st = d.orSt; render(); return; }
  if (d.siSt !== undefined) { S.siF.st = d.siSt; render(); return; }
  if (d.crSt !== undefined) { S.crF.st = d.crSt; render(); return; }
  if (d.cqSt !== undefined) { S.cqF.st = d.cqSt; render(); return; }
  if (d.erTab) { S.erTab = d.erTab; render(); return; }
  if (d.certPrint) { certLetter(S.certReqs.get(d.certPrint)); return; }
  if (d.siLetter) { const r = S.salincs.get(d.siLetter); const e = S.emps.get(r.empId);
    saveLetter(`Salary-notice-${e.no}.html`, `Notice of salary adjustment ${e.no}`, `<h2>NOTICE OF SALARY ADJUSTMENT</h2><p style="text-align:right">${fmtDate(todayISO())}</p><p>Dear <b>${esc(fullName(e))}</b>,</p>
      <p>We are pleased to inform you that your basic pay is adjusted from <b>${payLabel(r.from, r.payType || e.payType)}</b> to <b>${payLabel(r.to, r.payType || e.payType)}</b>, effective <b>${fmtDate(r.effective)}</b>${r.reason ? `, in recognition of ${esc(r.reason.charAt(0).toLowerCase() + r.reason.slice(1))}` : ""}.</p><p>All other terms of your employment stay the same. Thank you for your continued service.</p>
      <div style="display:flex;justify-content:space-between;margin-top:64px;gap:40px"><div>${signer()}</div><div><b>${esc(fullName(e))}</b><br>Received by the employee</div></div>`); return; }
  if (!S.realEdit) return;
  try {
    if (d.orSet) { const [id, st] = d.orSet.split(":"); const o = S.orients.get(id); await saveRec("orient", id, { ...o, status: st, doneOn: st === "DONE" ? todayISO() : null }); logActivity(`${st === "DONE" ? "Completed" : "Cancelled"} the orientation ${o.title || ""} (${(o.empIds || []).length} people)`); toast(st === "DONE" ? "Orientation marked done." : "Orientation cancelled."); render(); return; }
    if (d.siSet) { const [id, st] = d.siSet.split(":"); const r = S.salincs.get(id); const e = S.emps.get(r.empId); const nr = { ...r, status: st, decided: { d: todayISO(), by: S.myId || null } }; await saveRec("salinc", id, nr);
      if (st === "APPROVED" && r.effective <= todayISO()) await applyIncrement(nr);
      logActivity(`${RQ_ST[st][0]} a salary increment for ${fullName(e)}`); toast(st === "APPROVED" ? (r.effective <= todayISO() ? "Approved. The new pay applies now." : `Approved. The new pay applies on ${fmtDate(r.effective)}.`) : "Increment rejected."); render(); return; }
    if (d.cqSet) { const [id, st] = d.cqSet.split(":"); const r = S.chgReqs.get(id); const e = S.emps.get(r.empId);
      if (st === "APPROVED") { if (!e || !CHG_FIELDS.some((c) => c[0] === r.field)) { toast("This change can't be applied from here. Edit the 201 file instead."); return; }
        const ne = { ...e, [r.field]: String(r.to ?? "").slice(0, 200) }; await saveEmp(ne); S.emps.set(e.id, ne); }
      await saveRec("empchg", id, { ...r, status: st, decided: { d: todayISO(), by: S.myId || null } }); logActivity(`${RQ_ST[st][0]} a change of ${chgLabel(r.field).toLowerCase()} for ${fullName(e)}`); toast(st === "APPROVED" ? "Approved. The record is updated." : `Request ${RQ_ST[st][0].toLowerCase()}.`); render(); return; }
    if (d.certSet) { const [id, st] = d.certSet.split(":"); const r = S.certReqs.get(id); await saveRec("certreq", id, { ...r, status: st, released: st === "RELEASED" ? todayISO() : r.released || null }); logActivity(`${RQ_ST[st][0]}: ${certName(r.type).toLowerCase()} for ${fullName(S.emps.get(r.empId))}`); toast(`${RQ_ST[st][0]}.`); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("change", async (ev) => {
  const t = ev.target; const id = t.id;
  if (id === "emp-for") { S.empFor = t.value; render(); return; }
  if (id === "dir-unit") { S.dirF = { ...S.dirF, unit: t.value, page: 1 }; render(); return; } if (id === "dir-dept") { S.dirF = { ...S.dirF, dept: t.value, page: 1 }; render(); return; }
  if (id === "ed-only") { S.edF = { ...S.edF, only: t.checked, page: 1 }; render(); return; }
  if (id === "cq-field") { S.cqField = t.value; const e = S.emps.get(t.closest("form").dataset.empId); const n = $("#cq-now"); if (n) n.textContent = e[t.value] || "—"; return; }
  if (id === "or-add" && t.value) { const fs = t.closest("fieldset"); const e = S.emps.get(t.value); const l = document.createElement("label"); l.className = "or-p"; l.innerHTML = `<input type="checkbox" name="or-emp" value="${e.id}" checked>${avatar(e, 24)}${esc(fullName(e))}`; fs.insertBefore(l, t.closest(".field")); t.value = ""; return; }
  if (t.dataset.orAtt && S.realEdit) { const [oid, eid] = t.dataset.orAtt.split("|"); const o = S.orients.get(oid); try { await saveRec("orient", oid, { ...o, att: { ...(o.att || {}), [eid]: t.checked } }); } catch { toast("Couldn't save. Try again."); } return; }
  if (t.dataset.deptHead && S.realEdit) { const org = JSON.parse(JSON.stringify(S.org)); const dd = org.departments.find((x) => x.id === t.dataset.deptHead); dd.headId = t.value || null;
    try { await S.db.doc("org/main").set(org); S.org = org; S.ver++; logActivity(`Set the head of ${dd.name}`); toast("Department head saved."); render(); } catch { toast("Couldn't save. Try again."); } }
});
document.addEventListener("input", (ev) => { const id = ev.target.id; if (!["dir-q", "ed-q"].includes(id)) return; const p0 = ev.target.selectionStart;
  if (id === "dir-q") S.dirF = { ...S.dirF, q: ev.target.value, page: 1 }; else S.edF = { ...S.edF, q: ev.target.value, page: 1 };
  render(); const i = $(`#${id}`); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["or-form", "si-form", "cq-form", "cert-form"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const base = { status: "PENDING", filed: todayISO(), by: S.myId || null };
  try {
    if (f.id === "or-form") { const empIds = [...f.querySelectorAll('[name="or-emp"]:checked')].map((x) => x.value); if (!empIds.length) { toast("Tick at least one employee."); return; }
      const old = f.dataset.id ? S.orients.get(f.dataset.id) : null; const date = $("#or-date").value || null;
      const rec = { ...(old || {}), title: $("#or-title").value.trim() || "New hire orientation", reqBy: $("#or-req").value.trim() || null, date, time: $("#or-time").value || null, venue: $("#or-venue").value.trim() || null, facId: $("#or-fac").value || null, empIds, topics: [...f.querySelectorAll('[name="or-topic"]:checked')].map((x) => x.value), status: date ? "SCHEDULED" : "REQUESTED", filed: old?.filed || todayISO() };
      await saveRec("orient", old?.id || uid(), rec); S.orNew = false; S.orEdit = null; logActivity(`${date ? "Scheduled" : "Requested"} an orientation for ${empIds.length} employees`); toast(date ? "Orientation scheduled." : "Orientation requested."); render(); return; }
    const e = S.emps.get(f.dataset.empId);
    if (f.id === "si-form") { const to = Number($("#si-to").value); if (!(to > 0)) { toast("Enter the new basic pay."); return; } if (to === e.basicPay) { toast("That is the same as the current pay."); return; }
      await saveRec("salinc", uid(), { ...base, empId: e.id, kind: $("#si-kind").value, from: e.basicPay || 0, to, payType: e.payType, effective: $("#si-eff").value || todayISO(), reason: $("#si-why").value.trim() || null }); logActivity(`Filed a salary increment for ${fullName(e)}`); }
    if (f.id === "cq-form") { const field = $("#cq-field").value; const to = $("#cq-to").value.trim(); if (!to) { toast("Enter the new value."); return; }
      let proof = null; const file = $("#cq-file").files?.[0]; if (file) { if (!S.assets) { toast("Uploads aren't available in this view."); return; } const u = await S.assets.upload(file); proof = { id: u.id, name: file.name.slice(0, 120) }; }
      await saveRec("empchg", uid(), { ...base, empId: e.id, field, from: e[field] || null, to, reason: $("#cq-why").value.trim() || null, proof }); logActivity(`Filed a change of ${chgLabel(field).toLowerCase()} for ${fullName(e)}`); }
    if (f.id === "cert-form") { const purpose = $("#ct-purpose").value.trim(); if (!purpose) { toast("Give the purpose."); return; }
      await saveRec("certreq", uid(), { ...base, empId: e.id, type: $("#ct-type").value, purpose, copies: Math.max(1, Number($("#ct-copies").value) || 1), need: $("#ct-need").value || null }); logActivity(`Filed a ${certName($("#ct-type").value).toLowerCase()} request for ${fullName(e)}`); }
    S.empNew = null; toast("Sent."); render();
  } catch { toast("Couldn't save. Try again."); }
}, true);
