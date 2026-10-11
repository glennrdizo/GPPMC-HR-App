/* ---------- manpower plan, recruitment tests, recruitment analysis ---------- */
Object.assign(TCOLS, { mplan: "mplan" });
Object.assign(S, { mplan: new Map(), mpYear: null, raRange: "90" });
Object.assign(ICON, {
  quiz: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plan: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 14h4M7 17h7"/>',
});
{
  const tal = NAV.find(([g]) => g === "Talent"); const i = tal[1].findIndex(([v]) => v === "mpr");
  tal[1].splice(i, 0, ["mplan", "Manpower plan", "plan"]); tal[1].splice(i + 2, 0, ["rtests", "Recruitment tests", "quiz"], ["ranalysis", "Recruitment analysis", "chart"]);
  Object.assign(SECTION_OF, { mplan: "mplan", rtests: "rtests", rtest: "rtests", rtake: "rtests", ranalysis: "ranalysis" });
}
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("mplan").limit(50).onSnapshot((snap) => { S.mplan = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
  db.doc("org/rtests").onSnapshot((d) => { S.rtcfg = d.exists ? d.data() : null; refresh(); }, () => {}); }; }

/* ---------- manpower plan ---------- */
const monthlyOf = (rate, type) => (type === "DAILY" ? rate * 26 : rate) || 0;
function posRate(pid) {
  const hs = active().filter((e) => e.posId === pid && e.basicPay); if (hs.length) return hs.reduce((s, e) => s + monthlyOf(e.basicPay, e.payType), 0) / hs.length;
  const j = listOf(S.jobs).find((x) => x.posId === pid && x.rate); return j ? monthlyOf(j.rate, j.payType) : 0;
}
function planRows(year) {
  const plan = S.mplan.get(String(year))?.rows || {}; const rows = []; const emps = active();
  const pending = (f) => listOf(S.mpr).filter((r) => ["PENDING", "APPROVED"].includes(r.status) && f(r)).reduce((s, r) => s + (r.n || 0), 0);
  const hiring = (f) => listOf(S.jobs).filter((j) => ["OPEN", "ON_HOLD"].includes(j.status) && f(j)).reduce((s, j) => s + Math.max(0, j.slots - jobHired(j)), 0);
  for (const p of listOf(S.projects).filter((x) => ["ACTIVE", "PLANNING"].includes(x.status))) {
    const pids = new Set([...Object.keys(p.req || {}), ...emps.filter((e) => e.projectId === p.id && e.posId).map((e) => e.posId)]);
    for (const pid of pids) rows.push({ key: `prj|${p.id}|${pid}`, kind: "prj", unit: p.name, projectId: p.id, posId: pid, deptId: pos(pid)?.deptId || "", fromProject: true,
      now: emps.filter((e) => e.projectId === p.id && e.posId === pid).length, planned: Number(p.req?.[pid] || 0),
      hiring: hiring((j) => j.projectId === p.id && j.posId === pid), asked: pending((r) => r.projectId === p.id && r.posId === pid) });
  }
  const ho = emps.filter((e) => !e.projectId); const keys = new Set([...ho.filter((e) => e.posId).map((e) => `ho|${e.deptId || ""}|${e.posId}`), ...Object.keys(plan).filter((k) => k.startsWith("ho|"))]);
  for (const k of keys) { const [, did, pid] = k.split("|"); const pr = plan[k] || {};
    rows.push({ key: k, kind: "ho", unit: `Head Office${dept(did) ? ` · ${dept(did).name}` : ""}`, deptId: did, posId: pid, projectId: "", now: ho.filter((e) => (e.deptId || "") === did && e.posId === pid).length,
      planned: pr.n ?? ho.filter((e) => (e.deptId || "") === did && e.posId === pid).length, month: pr.month || "", note: pr.note || "",
      hiring: hiring((j) => !j.projectId && j.posId === pid), asked: pending((r) => !r.projectId && r.posId === pid) }); }
  for (const r of rows) { r.gap = r.planned - r.now; r.todo = Math.max(0, r.gap - r.hiring - r.asked); r.rate = posRate(r.posId); }
  return rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "ho" ? -1 : 1) || a.unit.localeCompare(b.unit) || (pos(a.posId)?.title || "").localeCompare(pos(b.posId)?.title || ""));
}
VIEWS.mplan = () => {
  const y = S.mpYear || Number(todayISO().slice(0, 4)); const rows = planRows(y); const ed = S.canEdit;
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0); const add = sum((r) => Math.max(0, r.gap)); const cost = sum((r) => Math.max(0, r.gap) * r.rate);
  const P = S.org?.positions || []; const D = S.org?.departments || [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const body = (list) => list.map((r) => `<tr><td><b>${esc(pos(r.posId)?.title || "Position")}</b><div class="t-muted" style="font-size:13px">${esc(r.unit)}</div></td>
      <td class="num">${r.now}</td>
      <td class="num">${r.fromProject ? `${r.planned}${ed ? `<div><button class="link" style="font-size:12px" data-project="${r.projectId}">Edit in project</button></div>` : ""}` : ed ? `<input class="input mp-n" type="number" min="0" step="1" value="${r.planned}" data-mp-n="${esc(r.key)}" aria-label="Planned for ${esc(pos(r.posId)?.title || "")}">` : r.planned}</td>
      <td class="num"><b class="${r.gap > 0 ? "t-warn" : r.gap < 0 ? "t-blue" : ""}">${r.gap > 0 ? "+" + r.gap : r.gap}</b></td>
      <td class="num">${r.hiring || "—"}</td><td class="num">${r.asked || "—"}</td>
      <td>${r.kind === "ho" && ed ? `<select class="input mp-m" data-mp-m="${esc(r.key)}" aria-label="Hire by month">${opts(MONTHS.map((m, i) => [String(i + 1), m]), r.month, "—")}</select>` : esc(r.month ? MONTHS[Number(r.month) - 1] : "")}</td>
      <td class="num">${r.gap > 0 && r.rate ? peso.format(r.gap * r.rate) : "—"}</td>
      <td class="num">${r.todo > 0 && ed ? `<button class="btn btn-ghost btn-sm" data-mp-req="${esc(r.key)}|${r.todo}">Request ${r.todo}</button>` : r.gap > 0 && !r.todo ? '<span class="chip c-ok">Covered</span>' : ""}</td></tr>`).join("");
  const head8 = `<thead><tr><th>Position</th><th class="num">Now</th><th class="num">Planned ${y}</th><th class="num">Gap</th><th class="num">Being hired</th><th class="num">Requested</th><th>Hire by</th><th class="num">Added pay a month</th><th></th></tr></thead>`;
  const hoR = rows.filter((r) => r.kind === "ho"), pjAll = rows.filter((r) => r.kind === "prj"), pjR = S.mpAll ? pjAll : pjAll.filter((r) => r.gap !== 0);
  return head("Recruitment", `Manpower plan ${y}`, `<div class="tabs on-blue" role="tablist">${[y - 1, y, y + 1].map((x) => `<button class="tab" aria-selected="${x === y}" data-mp-year="${x}">${x}</button>`).join("")}</div>`) + `
    <section class="stats">
      <div class="card stat"><span class="label">People now</span><span class="value">${sum((r) => r.now)}</span><span class="note t-muted">in the positions below</span></div>
      <div class="card stat"><span class="label">Planned headcount</span><span class="value">${sum((r) => r.planned)}</span><span class="note t-muted">Head Office plan plus project plans</span></div>
      <div class="card stat"><span class="label">People to add</span><span class="value">${add}</span><span class="note t-warn">${sum((r) => r.todo)} not yet requested or being hired</span></div>
      <div class="card stat"><span class="label">Added pay a month</span><span class="value" style="font-size:26px">${peso.format(cost)}</span><span class="note t-muted">estimate from current pay for each position</span></div></section>
    <section class="card"><div class="card-head"><h2>Head Office</h2><span class="t-muted" style="font-size:13px">Type the planned number for ${y}; it saves right away</span></div>
      <div class="table-wrap"><table>${head8}<tbody>${body(hoR) || '<tr><td colspan="9" class="empty">No Head Office positions yet.</td></tr>'}</tbody></table></div>
      ${ed ? `<form id="mp-add" class="panel form-grid" style="margin-top:14px;align-items:end" data-keep>
        <div class="field"><label for="mp-dept">Department</label><select class="input" id="mp-dept">${opts(D.map((d) => [d.id, d.name]), "", "—")}</select></div>
        <div class="field"><label for="mp-pos">Position <span class="req">*</span></label><select class="input" id="mp-pos" required>${opts(P.map((p) => [p.id, p.title]), "", "Choose…")}</select></div>
        <div class="field"><label for="mp-num">Planned number</label><input class="input" id="mp-num" type="number" min="0" value="1"></div>
        <div><button class="btn btn-ghost">Add to the plan</button></div></form>` : ""}</section>
    <section class="card"><div class="card-head"><h2>Projects</h2><span class="t-muted" style="font-size:13px">Planned numbers come from each project's manpower plan</span><button class="link" data-mp-all="1">${S.mpAll ? "Show only gaps" : `Show all ${pjAll.length} positions`}</button></div>
      <div class="table-wrap"><table>${head8}<tbody>${body(pjR) || `<tr><td colspan="9" class="empty">${pjAll.length ? "Every project position is filled to plan." : "No active projects with a manpower plan."}</td></tr>`}</tbody></table></div></section>
    <p class="t-muted" style="font-size:13px;margin:0">"Being hired" counts open job slots, and "Requested" counts manpower requests still waiting or approved. Daily rates are counted as 26 days a month.</p>`;
};

/* ---------- recruitment tests ---------- */
const RTESTS = {
  eng: { name: "Engineering test", area: "Engineering", mins: 20, qs: [
    ["Concrete compressive strength is normally specified at how many days?", ["7 days", "14 days", "28 days", "56 days"], 2],
    ["What does NSCP stand for?", ["National Structural Code of the Philippines", "National Safety Code of the Philippines", "National Standard Construction Plan", "National Structural Compliance Permit"], 0],
    ["The slump test of fresh concrete measures its…", ["Strength", "Workability", "Curing time", "Air content"], 1],
    ["Grade 40 reinforcing bar has a minimum yield strength of about…", ["230 MPa", "275 MPa", "415 MPa", "520 MPa"], 1],
    ["Minimum concrete cover for footings cast directly against earth is…", ["20 mm", "40 mm", "50 mm", "75 mm"], 3],
    ["Class A concrete mix by volume (cement : sand : gravel) is…", ["1 : 2 : 4", "1 : 2.5 : 5", "1 : 3 : 6", "1 : 1.5 : 3"], 0],
    ["Which document lists the quantities and unit costs of the work?", ["Gantt chart", "Bill of quantities", "Punch list", "As-built plan"], 1],
    ["The Occupational Safety and Health Standards law is…", ["RA 11058", "RA 9165", "RA 10173", "RA 11210"], 0],
    ["The unit weight of normal-weight concrete is about…", ["1,500 kg/m³", "1,900 kg/m³", "2,400 kg/m³", "3,100 kg/m³"], 2],
    ["The maximum moment of a simply supported beam with uniform load w over span L is…", ["wL/2", "wL²/2", "wL²/8", "wL²/12"], 2],
  ] },
  acct: { name: "Accounting test", area: "Accounting", mins: 20, qs: [
    ["The basic accounting equation is…", ["Assets = Liabilities + Equity", "Assets = Revenue − Expenses", "Liabilities = Assets + Equity", "Equity = Assets + Liabilities"], 0],
    ["The VAT rate in the Philippines is…", ["10%", "12%", "15%", "20%"], 1],
    ["The regular corporate income tax rate under the CREATE Act is…", ["20%", "25%", "30%", "32%"], 1],
    ["Which BIR form is used for the monthly remittance of tax withheld on compensation?", ["1601-C", "1701", "2550M", "0619-E"], 0],
    ["The certificate of compensation and tax withheld given to each employee is BIR Form…", ["2307", "2316", "1604-C", "2551Q"], 1],
    ["Which of these is NOT a depreciation method?", ["Straight-line", "Declining balance", "Units of production", "FIFO"], 3],
    ["A debit entry increases which account?", ["Revenue", "Liabilities", "Expenses", "Owner's equity"], 2],
    ["13th month pay must be paid no later than…", ["December 15", "December 24", "December 31", "January 15"], 1],
    ["In a bank reconciliation, a deposit in transit is…", ["Added to the bank balance", "Deducted from the bank balance", "Added to the book balance", "Deducted from the book balance"], 0],
    ["Under accrual accounting, revenue is recognized when it is…", ["Collected in cash", "Earned", "Invoiced to the client a month later", "Deposited in the bank"], 1],
  ] },
  ops: { name: "Operations test", area: "Operations", mins: 15, qs: [
    ["PDCA stands for…", ["Plan, Do, Check, Act", "Prepare, Deliver, Control, Audit", "Plan, Develop, Check, Approve", "Process, Do, Correct, Act"], 0],
    ["Which is NOT one of the 5S?", ["Sort", "Shine", "Schedule", "Sustain"], 2],
    ["KPI means…", ["Key performance indicator", "Known process input", "Key production item", "Kaizen process improvement"], 0],
    ["Issuing stock in the order it was received is called…", ["LIFO", "FIFO", "Just-in-time", "Kanban"], 1],
    ["The critical path of a project is the…", ["Cheapest set of tasks", "Shortest path through the schedule", "Longest path, which sets the shortest possible finish", "List of risky tasks"], 2],
    ["Before repairing electrical equipment, a worker should first…", ["Wear gloves only", "Lock out and tag out the power", "Ask a co-worker to watch", "Switch it off at the unit"], 1],
    ["A Gantt chart shows…", ["Costs against budget", "Tasks against time", "Defects by cause", "Staff by department"], 1],
    ["Which tool is used to find the root cause of a problem?", ["Fishbone (Ishikawa) diagram", "Pie chart", "Org chart", "Payroll register"], 0],
    ["Preventive maintenance is done…", ["Only after a breakdown", "On a schedule, before failure", "Once a year at closing", "When the operator has time"], 1],
    ["Productivity is measured as…", ["Input ÷ output", "Output ÷ input", "Output − input", "Sales ÷ headcount only"], 1],
  ] },
  hr: { name: "HR test", area: "HR", mins: 15, qs: [
    ["The longest allowed probationary period (Labor Code Art. 296) is…", ["3 months", "6 months", "9 months", "12 months"], 1],
    ["Normal hours of work per day are…", ["6 hours", "8 hours", "9 hours", "10 hours"], 1],
    ["Night shift differential is at least…", ["5% for work from 8 PM to 4 AM", "10% for work from 10 PM to 6 AM", "15% for work from 10 PM to 6 AM", "25% for work after midnight"], 1],
    ["Service incentive leave after one year of service is…", ["3 days", "5 days", "7 days", "10 days"], 1],
    ["Work on a regular holiday (not a rest day) is paid at…", ["100%", "130%", "150%", "200%"], 3],
    ["Overtime on an ordinary working day adds at least…", ["10% of the hourly rate", "25% of the hourly rate", "30% of the hourly rate", "50% of the hourly rate"], 1],
    ["Dismissal for just cause requires…", ["One verbal warning", "Two written notices and a chance to be heard", "Approval from DOLE first", "A 30-day notice to DOLE only"], 1],
    ["Maternity leave for a live birth under RA 11210 is…", ["60 days", "78 days", "105 days", "120 days"], 2],
    ["Paternity leave under RA 8187 is…", ["3 days", "5 days", "7 days", "15 days"], 2],
    ["The Data Privacy Act is…", ["RA 10173", "RA 11058", "RA 8187", "RA 6727"], 0],
  ] },
};
const rtCfg = () => S.rtcfg || {};
const rtQs = (k) => [...RTESTS[k].qs, ...((rtCfg().extra || {})[k] || []).map((x) => [x.q, x.o, x.a, true])];
const rtPass = (k) => rtCfg().pass?.[k] ?? 70;
const rtGiven = (k) => listOf(S.apps).flatMap((a) => (a.tests || []).filter((t) => t.key === k).map((t) => ({ a, t })));
VIEWS.rtests = () => head("Recruitment", "Recruitment tests") + `
  <p class="t-muted" style="margin:0 0 4px">Give a test on this screen (the applicant answers here and the score is saved to their file) or print it on paper.</p>
  <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">${Object.entries(RTESTS).map(([k, t]) => { const g = rtGiven(k); const pass = g.filter((x) => x.t.result === "PASSED").length;
    return `<section class="card rt-card"><span class="rt-area">${esc(t.area)}</span><h2 style="margin:6px 0 2px">${esc(t.name)}</h2>
      <div class="t-muted" style="font-size:14px">${rtQs(k).length} questions · ${t.mins} minutes · pass mark ${rtPass(k)}%</div>
      <div style="font-size:14px;margin:10px 0">${g.length ? `Given ${g.length} ${g.length === 1 ? "time" : "times"} · <b>${Math.round((pass / g.length) * 100)}%</b> passed` : '<span class="t-muted">Not given yet</span>'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto"><button class="btn btn-primary btn-sm" data-rt="${k}">Open</button></div></section>`; }).join("")}</div>`;
VIEWS.rtest = () => {
  const k = S.view.id; const t = RTESTS[k]; if (!t) return notFound("Recruitment", "Test", "rtests"); const ed = S.canEdit; const qs = rtQs(k);
  const live = listOf(S.apps).filter((a) => inProcess(a) && !isBL(a)).sort((a, b) => appName(a).localeCompare(appName(b))); const g = rtGiven(k).sort((x, y) => (y.t.d || "").localeCompare(x.t.d || ""));
  return backLink('data-go="rtests"', "Recruitment tests") + head(t.area, esc(t.name), `<button class="btn btn-ghost" data-rt-print="${k}">${icon("file")}Print test paper</button>`) + `
    ${ed ? `<section class="card"><div class="card-head"><h2>Give this test</h2></div><form id="rt-give" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end" data-keep>
      <div class="field" style="flex:1;min-width:240px"><label for="rt-app">Applicant</label><select class="input" id="rt-app" required>${opts(live.map((a) => [a.id, `${appName(a)} · ${S.jobs.get(a.jobId)?.title || ""}`]), "", "Choose…")}</select></div>
      <button class="btn btn-primary">Start the test</button></form><p class="t-muted" style="margin:10px 0 0;font-size:13px">Hand the device to the applicant. The answers stay hidden and the score is saved when they finish.</p></section>` : ""}
    <div class="two"><section class="card"><div class="card-head"><h2>Questions and answer key</h2>${ed ? `<form id="rt-pass" style="display:flex;gap:6px;align-items:center" data-keep><label for="rt-pm" style="font-size:13px;font-weight:700">Pass mark %</label><input class="input" id="rt-pm" type="number" min="1" max="100" value="${rtPass(k)}" style="width:80px;padding:6px 8px"><button class="btn btn-ghost btn-sm">Save</button></form>` : ""}</div>
      <ol class="rt-key">${qs.map(([q, o, a, custom], i) => `<li><b>${esc(q)}</b><ul>${o.map((x, j) => `<li class="${j === a ? "rt-right" : ""}">${j === a ? "✓ " : ""}${esc(x)}</li>`).join("")}</ul>${custom && ed ? `<button class="link danger" style="font-size:13px" data-rt-qdel="${k}:${i - t.qs.length}">Remove this question</button>` : ""}</li>`).join("")}</ol>
      ${ed ? `<form id="rt-addq" class="panel stack" style="gap:10px;margin-top:14px" data-keep><b>Add a question</b>
        <input class="input" id="rt-q" required placeholder="Question">${[0, 1, 2, 3].map((j) => `<label style="display:flex;gap:8px;align-items:center"><input type="radio" name="rt-a" value="${j}" ${j === 0 ? "checked" : ""} aria-label="Correct answer ${j + 1}"><input class="input" id="rt-o${j}" placeholder="Choice ${j + 1}${j < 2 ? " (required)" : ""}" style="flex:1"></label>`).join("")}
        <span class="t-muted" style="font-size:13px">Tick the correct choice.</span><div><button class="btn btn-ghost btn-sm">Add question</button></div></form>` : ""}</section>
    <section class="card"><div class="card-head"><h2>Results</h2></div>
      ${g.length ? `<div class="table-wrap"><table><thead><tr><th>Applicant</th><th>Date</th><th class="num">Score</th><th>Result</th></tr></thead><tbody>${g.map(({ a, t: r }) => `<tr class="go" data-app="${a.id}" tabindex="0"><td><b>${esc(appName(a))}</b><div class="t-muted" style="font-size:13px">${esc(S.jobs.get(a.jobId)?.title || "")}</div></td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.d)}</td><td class="num">${r.score} / ${r.of}</td><td><span class="chip ${TEST_RES[r.result]?.[1]}">${TEST_RES[r.result]?.[0]}</span></td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No one has taken this test yet.</p>'}</section></div>`;
};
VIEWS.rtake = () => {
  const k = S.view.test; const t = RTESTS[k]; const a = S.apps.get(S.view.app); if (!t || !a) return notFound("Recruitment", "Test", "rtests"); const qs = rtQs(k);
  return `<div class="rt-take">${head(esc(t.area), `${esc(t.name)} · ${esc(appName(a))}`)}
    <section class="card"><p style="margin:0 0 4px">${qs.length} questions. Choose one answer for each. You have about ${t.mins} minutes. <b>Started ${timeFmt.format(new Date(S.view.start))}</b>.</p></section>
    <form id="rt-take" class="stack" data-keep>${qs.map(([q, o], i) => `<fieldset class="card rt-q"><legend><b>${i + 1}.</b> ${esc(q)}</legend>${o.map((x, j) => `<label class="check"><input type="radio" name="q${i}" value="${j}"><span>${esc(x)}</span></label>`).join("")}</fieldset>`).join("")}
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-rt="${k}">Cancel</button><button class="btn btn-primary">Finish and submit</button></div></form></div>`;
};
function rtPrint(k) {
  const t = RTESTS[k]; const qs = rtQs(k); const co = S.org?.companyName || "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.name)}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:30px auto;color:#111;font-size:14px}h1{font-size:20px;margin:0}ol{padding-left:22px}li{margin:0 0 14px;break-inside:avoid}ul{list-style:none;padding:0;margin:6px 0 0}ul li{margin:3px 0}.l{display:flex;gap:30px;margin:16px 0 22px}.l span{flex:1;border-bottom:1px solid #111;padding-top:18px;font-size:12px}.key{page-break-before:always}</style></head><body>
    <div style="font-size:12px;color:#555">${esc(co)}</div><h1>${esc(t.name)}</h1><div>${qs.length} questions · ${t.mins} minutes · pass mark ${rtPass(k)}%</div>
    <div class="l"><span>Name</span><span>Position applied for</span><span>Date</span></div>
    <ol>${qs.map(([q, o]) => `<li><b>${esc(q)}</b><ul>${o.map((x, j) => `<li>( ) ${"ABCD"[j]}. ${esc(x)}</li>`).join("")}</ul></li>`).join("")}</ol>
    <div class="l"><span>Score</span><span>Checked by</span></div>
    <div class="key"><h1>Answer key (for HR only)</h1><ol>${qs.map(([q, o, a]) => `<li>${"ABCD"[a]}. ${esc(o[a])}</li>`).join("")}</ol></div><script>print()<\/script></body></html>`;
  const blob = new Blob([html], { type: "text/html" }); const u = URL.createObjectURL(blob); const w = window.open(u, "_blank");
  if (!w) { const x = document.createElement("a"); x.href = u; x.download = `${t.name}.html`; x.click(); toast("The test paper was downloaded. Open it and print."); }
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/* ---------- recruitment analysis ---------- */
const avgOf = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const hbarRows = (rows, fmt = (n) => n) => { const mx = Math.max(1, ...rows.map((r) => r[1])); return rows.map(([l, n, sub]) => `<div class="ra-row"><span class="ra-l">${esc(l)}${sub ? `<span class="t-muted"> · ${esc(sub)}</span>` : ""}</span><span class="ra-bar"><i style="width:${(n / mx) * 100}%"></i></span><b class="ra-n">${fmt(n)}</b></div>`).join(""); };
VIEWS.ranalysis = () => {
  const today = todayISO(); const R = S.raRange || "90"; const from = R === "year" ? today.slice(0, 4) + "-01-01" : R === "all" ? "0000" : addDays(today, -Number(R));
  const apps = listOf(S.apps).filter((a) => (a.applied || "") >= from && (a.applied || "") <= today);
  const hired = apps.filter((a) => a.stage === "HIRED"); const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const tth = avgOf(hired.filter((a) => a.stageAt).map((a) => daysBetween(a.applied, a.stageAt)));
  const fills = listOf(S.jobs).filter((j) => j.status === "FILLED" && j.opened >= from).map((j) => { const hs = listOf(S.apps).filter((a) => a.jobId === j.id && a.stage === "HIRED" && a.stageAt).map((a) => a.stageAt).sort(); return hs.length ? daysBetween(j.opened, hs[hs.length - 1]) : null; }).filter((x) => x != null);
  const offers = apps.filter((a) => ["ACCEPTED", "DECLINED"].includes(a.offer?.status)); const acc = offers.filter((a) => a.offer.status === "ACCEPTED").length;
  const reached = (k) => apps.filter((a) => (OUT[a.stage] ? (k === "APPLIED" || (k === "SCREENING") || (k === "INTERVIEW" && (a.ivs || []).length)) : stageIdx(a.stage) >= stageIdx(k))).length;
  const funnel = STAGES.map(([k, l]) => [l, reached(k)]);
  const bySrc = [...new Set(apps.map((a) => a.source || "Not recorded"))].map((s) => { const xs = apps.filter((a) => (a.source || "Not recorded") === s); const h = xs.filter((a) => a.stage === "HIRED").length; return { s, n: xs.length, h, rate: xs.length ? h / xs.length : 0 }; }).sort((a, b) => b.n - a.n);
  const unitOf = (a) => { const j = S.jobs.get(a.jobId); return j?.projectId ? S.projects.get(j.projectId)?.name || "Project" : `Head Office${dept(j?.deptId) ? " · " + dept(j.deptId).name : ""}`; };
  const byUnit = [...new Set(apps.map(unitOf))].map((u) => { const xs = apps.filter((a) => unitOf(a) === u); return { u, n: xs.length, h: xs.filter((a) => a.stage === "HIRED").length, act: xs.filter(inProcess).length, ref: xs.filter((a) => a.stage === "REJECTED").length }; }).sort((a, b) => b.n - a.n);
  const recs = [...new Set(apps.map((a) => a.recruiterId || ""))].map((id) => { const xs = apps.filter((a) => (a.recruiterId || "") === id); return { id, n: xs.length, act: xs.filter(inProcess).length, iv: xs.reduce((s, a) => s + (a.ivs || []).length, 0), h: xs.filter((a) => a.stage === "HIRED").length }; }).sort((a, b) => b.n - a.n);
  const why = {}; for (const a of apps.filter((x) => x.stage === "REJECTED")) { const r = a.refused?.reason || (a.blacklist ? "Blacklisted" : "No reason given"); why[r] = (why[r] || 0) + 1; }
  const tests = {}; for (const a of apps) for (const t of a.tests || []) { const k = t.name; tests[k] = tests[k] || { n: 0, p: 0, sc: [] }; tests[k].n++; if (t.result === "PASSED") tests[k].p++; if (t.score != null && t.of) tests[k].sc.push((t.score / t.of) * 100); }
  const months = []; for (let i = 5; i >= 0; i--) { const d = parseISO(today); d.setDate(1); d.setMonth(d.getMonth() - i); const m = PAY.iso(d).slice(0, 7); months.push([d.toLocaleDateString("en-PH", { month: "short" }), listOf(S.apps).filter((a) => (a.applied || "").startsWith(m)).length, listOf(S.apps).filter((a) => a.stage === "HIRED" && (a.stageAt || "").startsWith(m)).length]); }
  const mx = Math.max(1, ...months.map((m) => m[1]));
  const W = 380, H = 190, pb = 24, pl = 26, gw = (W - pl) / months.length, bw = Math.min(26, (gw - 14) / 2);
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="rd-chart" role="img" aria-label="Applicants and hires per month">${[0, 0.5, 1].map((f) => { const y = H - pb - f * (H - pb - 10); return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" class="rd-ax">${Math.round(f * mx)}</text>`; }).join("")}
    ${months.map(([l, n, h], i) => { const x = pl + i * gw + (gw - 2 * bw - 2) / 2; const y1 = (v) => H - pb - (v / mx) * (H - pb - 10); return `<g><rect x="${x}" y="${y1(n)}" width="${bw}" height="${H - pb - y1(n)}" rx="3" fill="#2a78d6"><title>${l}: ${n} applicants</title></rect><rect x="${x + bw + 2}" y="${y1(h)}" width="${bw}" height="${H - pb - y1(h)}" rx="3" fill="#11643C"><title>${l}: ${h} hired</title></rect><text x="${pl + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle" class="rd-ax">${l}</text></g>`; }).join("")}</svg>
    <div class="ra-legend"><span><i style="background:#2a78d6"></i>Applicants</span><span><i style="background:#11643C"></i>Hired</span></div>`;
  const tile = (l, v, n) => `<div class="card stat"><span class="label">${l}</span><span class="value">${v}</span><span class="note t-muted">${n}</span></div>`;
  return head("Recruitment", "Recruitment analysis", `<div class="tabs on-blue" role="tablist">${[["30", "30 days"], ["90", "90 days"], ["year", "This year"], ["all", "All time"]].map(([k, l]) => `<button class="tab" aria-selected="${R === k}" data-ra="${k}">${l}</button>`).join("")}</div>`) + `
    <section class="stats kpis rd-kpis">
      ${tile("Applicants", apps.length, "applied in this period")}${tile("Hired", hired.length, `${pct(hired.length, apps.length)} of applicants`)}
      ${tile("Days to hire", tth == null ? "—" : Math.round(tth), "average, application to hire")}${tile("Days to fill", fills.length ? Math.round(avgOf(fills)) : "—", "average, job opened to filled")}
      ${tile("Offers accepted", pct(acc, offers.length), `${acc} of ${offers.length} decided offers`)}${tile("Refused", apps.filter((a) => a.stage === "REJECTED").length, `${apps.filter(isBL).length} blacklisted`)}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>Hiring funnel</h2><span class="t-muted" style="font-size:13px">Applicants who reached each stage</span></div>${hbarRows(funnel.map(([l, n], i) => [l, n, i ? pct(n, funnel[0][1]) : ""]))}</section>
      <section class="card"><div class="card-head"><h2>Applicants and hires by month</h2><span class="t-muted" style="font-size:13px">Last 6 months</span></div>${chart}</section></div>
    <section class="card"><div class="card-head"><h2>Where the best applicants come from</h2></div><div class="table-wrap"><table><thead><tr><th>Source</th><th class="num">Applicants</th><th class="num">Hired</th><th class="num">Hire rate</th></tr></thead><tbody>
      ${bySrc.map((r) => `<tr><td><b>${esc(r.s)}</b></td><td class="num">${r.n}</td><td class="num">${r.h}</td><td class="num">${pct(r.h, r.n)}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No applicants in this period.</td></tr>'}</tbody></table></div></section>
    <div class="two"><section class="card"><div class="card-head"><h2>By department and project</h2></div><div class="table-wrap"><table><thead><tr><th>Unit</th><th class="num">Applicants</th><th class="num">Active</th><th class="num">Hired</th><th class="num">Refused</th></tr></thead><tbody>
      ${byUnit.map((r) => `<tr><td>${esc(r.u)}</td><td class="num">${r.n}</td><td class="num">${r.act}</td><td class="num">${r.h}</td><td class="num">${r.ref}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No data.</td></tr>'}</tbody></table></div></section>
      <section class="card"><div class="card-head"><h2>Recruiters</h2></div><div class="table-wrap"><table><thead><tr><th>Recruiter</th><th class="num">Applicants</th><th class="num">Active</th><th class="num">Interviews</th><th class="num">Hired</th></tr></thead><tbody>
      ${recs.map((r) => `<tr><td>${r.id ? esc(recName(r.id)) : '<span class="t-muted">Not assigned</span>'}</td><td class="num">${r.n}</td><td class="num">${r.act}</td><td class="num">${r.iv}</td><td class="num">${r.h}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No data.</td></tr>'}</tbody></table></div></section></div>
    <div class="two"><section class="card"><div class="card-head"><h2>Why applicants were refused</h2></div>${Object.keys(why).length ? hbarRows(Object.entries(why).sort((a, b) => b[1] - a[1])) : '<p class="t-muted" style="margin:0">No refused applicants in this period.</p>'}</section>
      <section class="card"><div class="card-head"><h2>Test results</h2></div>${Object.keys(tests).length ? `<div class="table-wrap"><table><thead><tr><th>Test</th><th class="num">Taken</th><th class="num">Passed</th><th class="num">Average score</th></tr></thead><tbody>${Object.entries(tests).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td class="num">${v.n}</td><td class="num">${pct(v.p, v.n)}</td><td class="num">${v.sc.length ? Math.round(avgOf(v.sc)) + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No tests recorded in this period.</p>'}</section></div>`;
};

/* ---------- events ---------- */
async function savePlan(y, key, patch) { const doc = S.mplan.get(String(y)) || { id: String(y), rows: {} }; const rows = { ...(doc.rows || {}) }; rows[key] = { ...(rows[key] || {}), ...patch }; await put("mplan", { ...doc, id: String(y), rows }); }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-mp-all],[data-mp-year],[data-mp-req],[data-rt],[data-rt-print],[data-rt-qdel],[data-ra]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.mpAll) { S.mpAll = !S.mpAll; render(); return; }
  if (d.mpYear) { S.mpYear = Number(d.mpYear); render(); return; }
  if (d.mpReq) { const [kind, a, b, n] = d.mpReq.split("|"); const pp = pos(b); go("mprForm", { pre: { projectId: kind === "prj" ? a : "", deptId: kind === "ho" ? a : pp?.deptId || "", posId: b, title: pp?.title || "", n: Number(n), type: kind === "prj" ? "Project start-up" : "Additional manpower" } }); return; }
  if (d.rt) return go("rtest", { id: d.rt });
  if (d.rtPrint) return rtPrint(d.rtPrint);
  if (d.ra) { S.raRange = d.ra; render(); return; }
  if (d.rtQdel) { const [k, i] = d.rtQdel.split(":"); const c = rtCfg(); const extra = { ...(c.extra || {}) }; extra[k] = (extra[k] || []).filter((_, j) => j !== Number(i)); try { await S.db.doc("org/rtests").set(JSON.parse(JSON.stringify({ ...c, extra }))); S.rtcfg = { ...c, extra }; render(); } catch { toast("Couldn't save. Try again."); } }
}, true);
document.addEventListener("change", async (ev) => {
  const n = ev.target.closest("[data-mp-n],[data-mp-m]"); if (!n || !S.canEdit) return; const y = S.mpYear || Number(todayISO().slice(0, 4));
  try { await savePlan(y, n.dataset.mpN || n.dataset.mpM, n.dataset.mpN ? { n: Math.max(0, Math.round(Number(n.value) || 0)) } : { month: n.value || null }); toast("Plan saved."); render(); } catch { toast("Couldn't save. Try again."); }
});
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["mp-add", "rt-give", "rt-take", "rt-pass", "rt-addq"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation();
  try {
    if (f.id === "rt-take") { const k = S.view.test; const qs = rtQs(k); const a = S.apps.get(S.view.app); const picks = qs.map((_, i) => f.querySelector(`input[name="q${i}"]:checked`)?.value);
      const blank = picks.filter((x) => x == null).length; if (blank && !await askConfirm(`${blank} ${blank === 1 ? "question has" : "questions have"} no answer. Submit anyway?`)) return;
      const score = qs.filter((q, i) => Number(picks[i]) === q[2]).length; const pctv = Math.round((score / qs.length) * 100);
      await put("applicants", { ...a, tests: [...(a.tests || []), { key: k, name: RTESTS[k].name, d: todayISO(), score, of: qs.length, result: pctv >= rtPass(k) ? "PASSED" : "FAILED", notes: `${pctv}% · took ${Math.max(1, Math.round((Date.now() - S.view.start) / 60000))} min`, picks: picks.map((x) => (x == null ? null : Number(x))) }] });
      logActivity(`${appName(a)} took the ${RTESTS[k].name}: ${score}/${qs.length}`); toast(`Test submitted. Thank you, ${a.first}.`); go("applicant", { id: a.id }); return; }
    if (!S.canEdit) return;
    if (f.id === "mp-add") { const pid = $("#mp-pos").value; if (!pid) return toast("Choose the position."); await savePlan(S.mpYear || Number(todayISO().slice(0, 4)), `ho|${$("#mp-dept").value}|${pid}`, { n: Math.max(0, Number($("#mp-num").value) || 0) }); logActivity(`Added ${pos(pid)?.title || "a position"} to the manpower plan`); toast("Added to the plan."); render(); return; }
    if (f.id === "rt-give") { const id = $("#rt-app").value; if (!id) return toast("Choose the applicant."); go("rtake", { test: S.view.id, app: id, start: Date.now() }); return; }
    if (f.id === "rt-pass") { const c = rtCfg(); const v = Math.min(100, Math.max(1, Number($("#rt-pm").value) || 70)); const next = { ...c, pass: { ...(c.pass || {}), [S.view.id]: v } }; await S.db.doc("org/rtests").set(JSON.parse(JSON.stringify(next))); S.rtcfg = next; toast("Pass mark saved."); render(); return; }
    if (f.id === "rt-addq") { const q = $("#rt-q").value.trim(); const o = [0, 1, 2, 3].map((j) => $(`#rt-o${j}`).value.trim()); const a = Number(f.querySelector('input[name="rt-a"]:checked')?.value || 0);
      const keep = o.map((x, j) => [x, j]).filter(([x]) => x); if (!q || keep.length < 2) return toast("Enter the question and at least two choices."); if (!o[a]) return toast("Tick a choice that has text as the correct answer.");
      const c = rtCfg(); const extra = { ...(c.extra || {}) }; extra[S.view.id] = [...(extra[S.view.id] || []), { q, o: keep.map(([x]) => x), a: keep.findIndex(([, j]) => j === a) }];
      await S.db.doc("org/rtests").set(JSON.parse(JSON.stringify({ ...c, extra }))); S.rtcfg = { ...c, extra }; logActivity(`Added a question to the ${RTESTS[S.view.id].name}`); toast("Question added."); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
}, true);
/* manpower request form accepts values from the plan */
{ const base = VIEWS.mprForm; VIEWS.mprForm = () => { const pre = S.view.pre; if (!pre || S.view.id) return base(); const keep = S.myId && S.profiles?.[S.myId]?.name;
  let html = base(); const setSel = (id, v) => { if (v) html = html.replace(new RegExp(`(<select class="input" id="${id}"[^>]*>[^]*?)<option value="${v}" `), `$1<option value="${v}" selected `); };
  setSel("mf-projectId", pre.projectId); setSel("mf-deptId", pre.deptId); setSel("mf-posId", pre.posId); setSel("mf-type", pre.type);
  html = html.replace(/(id="mf-title" name="title" type="text" value=")"/, `$1${esc(pre.title || "")}"`).replace(/(id="mf-n" name="n" type="number" value=")1"/, `$1${pre.n || 1}"`).replace(/(name="reason" rows="3" placeholder="[^"]*">)/, `$1To meet the ${S.mpYear || todayISO().slice(0, 4)} manpower plan.`);
  return html; }; }
