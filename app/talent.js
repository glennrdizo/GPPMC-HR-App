/* ---------- talent and lifecycle: recruitment, onboarding, offboarding, performance, training, company assets ---------- */
Object.assign(S, {
  talent: null, jobs: new Map(), apps: new Map(), onb: new Map(), offb: new Map(), reviews: new Map(), courses: new Map(), prop: new Map(), cases: new Map(),
  hireTab: "pipeline", hireJob: "", lifeTab: "onboard", perfTab: "regular", cycle: null, trainTab: "compliance",
  trainFilter: { q: "", dept: "", project: "", show: "gaps", page: 1 }, propFilter: { q: "", kind: "", status: "", page: 1 },
});
const TCOLS = { jobs: "jobs", applicants: "apps", onboard: "onb", offboard: "offb", reviews: "reviews", courses: "courses", property: "prop", cases: "cases" };
const TDEF = {
  onboard: [
    { k: "contract", label: "Sign the employment contract, with the job description and probationary standards explained", who: "HR" },
    { k: "docs", label: "File pre-employment requirements in the 201 file", who: "HR" },
    { k: "gov", label: "Report to SSS (R-1A), PhilHealth (ER2) and Pag-IBIG within 30 days", who: "HR" },
    { k: "bir", label: "Get BIR 2316 from the previous employer, or register the TIN (BIR 1902)", who: "Payroll" },
    { k: "bank", label: "Open the payroll bank account", who: "Payroll" },
    { k: "id", label: "Issue the company ID and system access", who: "Admin" },
    { k: "orient", label: "Company orientation and employee handbook", who: "HR" },
    { k: "safety", label: "Site safety induction", who: "Safety", site: true },
    { k: "ppe", label: "Issue PPE and tools", who: "Warehouse", site: true },
    { k: "team", label: "Introduce to the supervisor and team", who: "Supervisor" },
  ],
  offboard: [
    { k: "notice", label: "Receive the resignation letter or serve the notice", who: "HR" },
    { k: "turnover", label: "Turn over work, files and documents", who: "Supervisor" },
    { k: "assets", label: "Return company property", who: "Admin" },
    { k: "it", label: "Disable email and system access", who: "IT" },
    { k: "finance", label: "Settle cash advances and loans", who: "Finance" },
    { k: "exit", label: "Exit interview", who: "HR" },
    { k: "finalpay", label: "Release final pay (within 30 days of the last day)", who: "Payroll" },
    { k: "coe", label: "Issue the Certificate of Employment (within 3 days of request)", who: "HR" },
    { k: "bir2316", label: "Issue BIR 2316", who: "Payroll" },
  ],
  competencies: ["Job knowledge", "Quality of work", "Productivity", "Safety compliance", "Attendance and punctuality", "Teamwork", "Communication", "Initiative"],
  convertVL: "SIL",
};
const TSET = () => ({ ...TDEF, ...(S.talent || {}) });
const listOf = (m) => [...m.values()];
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return PAY.iso(d); };
const tfact = (l, v) => `<div><dt>${l}</dt><dd>${v || '<span class="t-muted" style="font-weight:400">—</span>'}</dd></div>`;
const tabsBar = (cur, list, attr) => `<div class="tabs on-blue" role="tablist">${list.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${cur === k}" data-${attr}="${k}">${l}</button>`).join("")}</div>`;
const backLink = (attrs, label) => `<div class="no-print"><button class="link" style="color:#fff" ${attrs}>${icon("back", 16)} ${label}</button></div>`;
const notFound = (section, what, goTo) => head(section, `${what} not found`) + `<section class="card"><p style="margin:0">This record was removed. <button class="link" data-go="${goTo}">Back</button></p></section>`;
const personCell = (e, sub = "", w = 200) => e ? `<div class="person" style="min-width:${w}px">${avatar(e, 34)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${sub}</span></span></div>` : '<span class="t-muted">Removed record</span>';
const progress = (n, of) => `<div style="display:flex;gap:10px;align-items:center;min-width:150px"><div class="bar" style="flex:1"><i style="width:${of ? Math.round((n / of) * 100) : 0}%"></i></div><span class="t-muted num" style="font-size:13px;white-space:nowrap">${n} of ${of}</span></div>`;
const nextEmpNo = () => `EMP-${String(Math.max(0, ...[...S.emps.values()].map((x) => Number(String(x.no).replace(/\D/g, "")) || 0)) + 1).padStart(4, "0")}`;
const empPicker = (id, cur, list = active()) => `<div class="field"><label for="${id}-q">Find employee</label><input class="input" id="${id}-q" type="search" placeholder="Name or employee no." data-pick="${id}"></div>
  <div class="field"><label for="${id}">Employee <span class="req">*</span></label><select class="input" id="${id}" name="empId" required>${leaveEmpOptions(list.slice().sort((a, b) => a.last.localeCompare(b.last)), cur)}</select></div>`;

async function put(col, rec) {
  const { id, ...body } = rec; const clean = JSON.parse(JSON.stringify(body));
  await S.db.doc(`${col}/${id}`).set(clean);
  S[TCOLS[col]].set(id, { id, ...clean }); S.ver++;
}
async function drop(col, id) { await S.db.doc(`${col}/${id}`).delete(); S[TCOLS[col]].delete(id); S.ver++; }

function bootTalent(db) {
  db.doc("org/talent").onSnapshot((d) => { S.talent = d.exists ? d.data() : null; refresh(); }, () => {});
  for (const [col, n] of [["jobs", 300], ["applicants", 1000], ["onboard", 600], ["offboard", 600], ["reviews", 1500], ["courses", 200], ["property", 1500], ["cases", 500]])
    db.collection(col).limit(n).onSnapshot((snap) => { S[TCOLS[col]] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
}
async function clearTalentSample() {
  const sampleEmp = new Set([...S.emps.values()].filter((e) => e.sample).map((e) => e.id));
  for (const col of Object.keys(TCOLS)) {
    if (col === "courses") continue;
    const ids = listOf(S[TCOLS[col]]).filter((x) => x.sample || sampleEmp.has(x.empId)).map((x) => x.id);
    for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map((id) => S.db.doc(`${col}/${id}`).delete()));
  }
  for (const c of listOf(S.courses)) {
    const recs = Object.fromEntries(Object.entries(c.recs || {}).filter(([id]) => !sampleEmp.has(id)));
    if (Object.keys(recs).length !== Object.keys(c.recs || {}).length) await put("courses", { ...c, recs });
  }
}

/* ---------- letters (downloaded as printable HTML) ---------- */
const signer = () => { const m = active().find((e) => pos(e.posId)?.title === "HR Manager"); return m ? `<b>${esc(fullName(m))}</b><br><span class="muted">HR Manager</span>` : "<b>HR Manager</b>"; };
async function saveLetter(filename, title, body) {
  if (!S.downloads) { toast("Downloads aren't available in this view."); return; }
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;color:#14213D;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.6}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-bottom:1px solid #E1E6F2}.num{text-align:right}.muted{color:#5A6478}h2{text-align:center;letter-spacing:.08em;margin:8px 0 24px}</style>
    <div style="border-bottom:2px solid #34489A;padding-bottom:10px;margin-bottom:24px"><span style="display:flex;gap:12px;align-items:center"><img src="${CO_LOGO}" alt="" width="52" height="52"><b style="font-size:20px">${esc(S.org?.companyName || CO_DEFAULT)}</b></span></div>${body}`;
  try { await S.downloads.save({ filename, data: new Blob([html], { type: "text/html" }) }); } catch { toast("The download was cancelled."); }
}
function letter(kind, id) {
  const today = fmtDate(todayISO()); const co = esc(S.org?.companyName || "the company");
  if (kind === "coe") {
    const e = S.emps.get(id); const o = S.offb.get(id); const end = e.separated?.date || (o && o.last <= todayISO() ? o.last : null);
    return saveLetter(`COE-${e.no}.html`, `Certificate of Employment ${e.no}`, `<h2>CERTIFICATE OF EMPLOYMENT</h2>
      <p>This is to certify that <b>${esc(fullName(e))}</b> ${end ? "was" : "has been"} employed by ${co} as <b>${esc(pos(e.posId)?.title || "employee")}</b> from <b>${fmtDate(e.hire)}</b> ${end ? `to <b>${fmtDate(end)}</b>` : "up to the present"}.</p>
      <p>This certification is issued on ${today} upon the request of ${esc(e.first)} ${esc(e.last)} for whatever legal purpose it may serve.</p><p style="margin-top:56px">${signer()}</p>`);
  }
  if (kind === "finalpay") {
    const e = S.emps.get(id); const o = S.offb.get(id); const f = finalPay(e, o);
    const row = (k, v, neg) => (v ? `<tr><td>${k}</td><td class="num">${neg ? "(" + money(v) + ")" : money(v)}</td></tr>` : "");
    return saveLetter(`final-pay-${e.no}.html`, `Final pay ${e.no}`, `<h2>FINAL PAY COMPUTATION</h2>
      <p><b>${esc(fullName(e))}</b> · ${esc(e.no)} · ${esc(pos(e.posId)?.title || "")}<br>Hired ${fmtDate(e.hire)} · last day ${fmtDate(o.last)} · ${esc(o.reason)}</p>
      <table><tbody>${row("Unpaid salary for the last cutoff", f.sal)}${row(`13th month pay for ${o.last.slice(0, 4)} (basic pay earned ÷ 12${f.paid13 ? `, less ${money(f.paid13)} already released` : ""})`, f.t13)}${row(`Unused leave converted to cash (${f.convDays} days at ${money(f.daily)})`, f.leave)}${row(sepLabel(o), f.sep)}${row(o.pay?.otherLabel || "Other earnings", f.other)}
      <tr><td><b>Total earnings</b></td><td class="num"><b>${money(f.gross)}</b></td></tr>${f.taxAdj >= 0.5 ? row("Tax refund from annualization", f.taxAdj) : row("Tax still due from annualization", f.taxAdj <= -0.5 ? -f.taxAdj : 0, true)}${row("Unreturned company property", f.acct, true)}${row(o.pay?.dedLabel || "Other deductions", f.ded, true)}${f.loanItems.filter((x) => x.on).map((x) => row(`Outstanding loan balance: ${esc(x.label)}`, x.bal, true)).join("")}
      <tr><td><b>${f.net < 0 ? "Amount the employee owes" : "Net final pay"}</b></td><td class="num"><b>${peso.format(Math.abs(f.net))}</b></td></tr></tbody></table>
      <p class="muted" style="font-size:13px">${f.sal ? "Salary for the last cutoff is included above." : "Salary up to the last day is paid in the regular payroll for that cutoff."} Tax for the year is annualized to the last day and shown on the BIR 2316 issued with this final pay. ${esc(f.sepNote)}.</p>
      <p style="margin-top:40px">Prepared by:<br>${signer()}</p><p style="margin-top:40px">Received by: ______________________ Date: __________</p>`);
  }
  if (kind === "nte" || kind === "decision") {
    const c = S.cases.get(id); const e = S.emps.get(c.empId);
    const to = `<p>Date: ${fmtDate(kind === "nte" ? c.nte : c.decision?.d)}<br>To: <b>${esc(fullName(e))}</b>, ${esc(pos(e.posId)?.title || "")}</p>`;
    if (kind === "nte") return saveLetter(`NTE-${e.no}-${c.nte}.html`, "Notice to Explain", `<h2>NOTICE TO EXPLAIN</h2>${to}
      <p>We received a report that on ${fmtDate(c.incident)}: ${esc(c.details || c.offense)}.</p><p>This may be a violation of ${esc(c.rule || "company rules")} (${esc(c.offense)}).</p>
      <p>Please submit a written explanation within five (5) calendar days of receiving this notice, on or before <b>${fmtDate(addDays(c.nte, 5))}</b>, on why no disciplinary action should be taken against you. You may ask for a conference or hearing and bring a representative of your choice.</p>
      <p style="margin-top:48px">${signer()}</p><p style="margin-top:40px">Received by: ______________________ Date: __________</p>`);
    const pen = PENALTY.find((x) => x[0] === c.decision?.penalty)?.[1] || "";
    return saveLetter(`decision-${e.no}-${c.decision?.d}.html`, "Notice of Decision", `<h2>NOTICE OF DECISION</h2>${to}
      <p>This refers to the Notice to Explain served on ${fmtDate(c.nte)} about ${esc(c.offense)}.${c.reply?.d ? ` We received your explanation on ${fmtDate(c.reply.d)}.` : " We did not receive a written explanation within the period given."}${c.hearing?.d ? ` A conference was held on ${fmtDate(c.hearing.d)}.` : ""}</p>
      <p>After considering the facts and your side, management has decided: <b>${esc(pen)}${c.decision?.penalty === "SUSPENSION" ? ` for ${c.decision.days} working days${c.decision.from ? `, starting ${fmtDate(c.decision.from)}` : ""}, without pay` : ""}</b>.</p>${c.decision?.text ? `<p>${esc(c.decision.text)}</p>` : ""}
      <p style="margin-top:48px">${signer()}</p><p style="margin-top:40px">Received by: ______________________ Date: __________</p>`);
  }
}

/* ---------- recruitment ---------- */
const STAGES = [["APPLIED", "Applied"], ["SCREENING", "Screening"], ["INTERVIEW", "Interview"], ["REQUIREMENTS", "Requirements"], ["OFFER", "Job offer"], ["HIRED", "Hired"]];
const OUT = { REJECTED: ["Not selected", "c-bad"], WITHDRAWN: ["Withdrew", "c-gray"] };
const JSTATUS = { OPEN: ["Open", "c-ok"], ON_HOLD: ["On hold", "c-warn"], FILLED: ["Filled", "c-blue"], CLOSED: ["Closed", "c-gray"] };
const PRE_REQS = [["nbi", "NBI clearance"], ["medical", "Medical exam result"], ["birth", "PSA birth certificate"], ["sss", "SSS number"], ["philhealth", "PhilHealth number"], ["pagibig", "Pag-IBIG MID number"], ["tin", "TIN"], ["school", "Diploma, TOR or TESDA certificate"], ["photo", "2x2 ID photo"]];
const SOURCES = ["Walk-in", "Referral", "JobStreet", "Facebook", "Indeed", "PESO job fair", "Agency", "Former employee"];
const stageIdx = (s) => STAGES.findIndex((x) => x[0] === s);
const stageLabel = (s) => STAGES.find((x) => x[0] === s)?.[1] || OUT[s]?.[0] || s;
const stageChip = (s) => `<span class="chip ${s === "HIRED" ? "c-ok" : OUT[s]?.[1] || "c-blue"}">${esc(stageLabel(s))}</span>`;
const inProcess = (a) => !["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage);
const jobHired = (j) => listOf(S.apps).filter((a) => a.jobId === j.id && a.stage === "HIRED").length;
const appName = (a) => `${a.first} ${a.last}`;
const appAvatar = (a, size = 34) => `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px;background:${tint(a.id)}">${esc(((a.first || "?")[0] + (a.last || "")[0]).toUpperCase())}</span>`;
const jobLabel = (j) => `${j.title}${j.projectId ? " · " + (S.projects.get(j.projectId)?.name || "") : ""}`;
const payLabel = (rate, type) => (rate ? peso.format(rate) + (type === "DAILY" ? " a day" : " a month") : "");
const nextInterview = (a) => (a.ivs || []).filter((i) => i.result === "PENDING" && i.d >= todayISO()).sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t))[0];
const upcomingInterviews = () => listOf(S.apps).filter(inProcess).flatMap((a) => (a.ivs || []).filter((i) => i.result === "PENDING" && i.d >= todayISO()).map((iv) => ({ a, iv }))).sort((x, y) => (x.iv.d + x.iv.t).localeCompare(y.iv.d + y.iv.t));

VIEWS.hiring = () => {
  const today = todayISO(); const jobs = listOf(S.jobs); const apps = listOf(S.apps);
  const open = jobs.filter((j) => j.status === "OPEN");
  const slots = open.reduce((a, j) => a + Math.max(0, (j.slots || 0) - jobHired(j)), 0);
  const ivs = upcomingInterviews().filter((x) => x.iv.d <= addDays(today, 7));
  const hired30 = apps.filter((a) => a.stage === "HIRED" && a.stageAt >= addDays(today, -30)).length;
  const tab = S.hireTab || "pipeline";
  return head(`${open.length} open ${open.length === 1 ? "job" : "jobs"}`, "Recruitment", `<button class="btn btn-ghost" data-talx="applicants">Download applicants (CSV)</button>${S.canEdit ? `<button class="btn btn-ghost" data-new-app="">${icon("plus")}Add applicant</button><button class="btn btn-gold" data-new-job="">${icon("plus")}New job opening</button>` : ""}`) + `
    <section class="stats">
      <div class="card stat"><span class="label">People still to hire</span><span class="value">${slots}</span><span class="note t-blue">across ${open.length} open jobs</span></div>
      <div class="card stat"><span class="label">Applicants in process</span><span class="value">${apps.filter(inProcess).length}</span><span class="note t-muted">${apps.filter((a) => a.stage === "OFFER").length} with a job offer</span></div>
      <div class="card stat"><span class="label">Interviews in 7 days</span><span class="value">${ivs.length}</span><span class="note t-muted">${ivs[0] ? `next ${fmtDate(ivs[0].iv.d)} ${esc(ivs[0].iv.t || "")}` : "none scheduled"}</span></div>
      <div class="card stat"><span class="label">Hired in 30 days</span><span class="value">${hired30}</span><span class="note t-ok">moved into onboarding</span></div>
    </section>
    ${tabsBar(tab, [["pipeline", "Pipeline"], ["jobs", "Job openings"]], "hire-tab")}
    ${tab === "jobs" ? jobsTab(jobs) : pipeline(apps)}`;
};
function pipeline(apps) {
  const jf = S.hireJob || ""; const list = apps.filter((a) => !jf || a.jobId === jf); const since = addDays(todayISO(), -30);
  const jobs = listOf(S.jobs).filter((j) => j.status !== "CLOSED").sort((a, b) => a.title.localeCompare(b.title));
  const cols = STAGES.map(([k, l]) => ({ k, l, items: list.filter((a) => a.stage === k && (k !== "HIRED" || a.stageAt >= since)).sort((a, b) => (a.stageAt || "").localeCompare(b.stageAt || "")) }));
  const closed = list.filter((a) => OUT[a.stage]).length;
  return `<section class="card"><div class="card-head"><h2>Applicant pipeline</h2><label class="field" style="flex-direction:row;align-items:center;gap:8px;max-width:100%"><span class="lbl">Job</span><select class="input" style="width:auto;max-width:100%" data-hire-job>${opts(jobs.map((j) => [j.id, jobLabel(j)]), jf, "All jobs")}</select></label></div>
    <div class="board">${cols.map((c) => `<div class="col"><h3><span>${c.l}</span><span>${c.items.length}</span></h3>
      ${c.items.slice(0, 25).map(appCard).join("") || '<p class="t-muted" style="font-size:13px;margin:4px">None</p>'}${c.items.length > 25 ? `<p class="t-muted" style="font-size:13px;margin:4px">and ${c.items.length - 25} more</p>` : ""}</div>`).join("")}</div>
    <p class="t-muted" style="margin:12px 0 0;font-size:13px">Open an applicant to schedule interviews, check requirements and move them along. Hired shows the last 30 days.${closed ? ` ${closed} not selected or withdrawn are kept on each job's page.` : ""}</p></section>`;
}
function appCard(a) {
  const j = S.jobs.get(a.jobId); const nx = nextInterview(a); const days = daysBetween(a.stageAt || a.applied, todayISO());
  return `<button class="tile kcard" data-app="${a.id}"><span class="person" style="gap:10px">${appAvatar(a, 32)}<span class="who"><span class="name" style="font-size:14px">${esc(appName(a))}</span><span class="sub">${esc(j?.title || "No job")}</span></span></span>
    <span class="chips">${nx ? `<span class="chip c-warn">Interview ${fmtDate(nx.d)}</span>` : ""}${a.stage !== "HIRED" ? `<span class="chip ${days > 14 ? "c-bad" : "c-gray"}">${days} ${days === 1 ? "day" : "days"} here</span>` : ""}</span></button>`;
}
function manpowerGaps() {
  const out = [];
  for (const p of listOf(S.projects).filter((x) => ["ACTIVE", "PLANNING"].includes(x.status))) for (const [pid, n] of Object.entries(p.req || {})) {
    const have = active().filter((e) => e.projectId === p.id && e.posId === pid).length;
    const covering = listOf(S.jobs).filter((j) => j.projectId === p.id && j.posId === pid && ["OPEN", "ON_HOLD"].includes(j.status)).reduce((a, j) => a + Math.max(0, j.slots - jobHired(j)), 0);
    if (n - have - covering > 0) out.push({ p, pid, n: n - have - covering });
  }
  return out.sort((a, b) => b.n - a.n);
}
function jobsTab(jobs) {
  const rank = { OPEN: 0, ON_HOLD: 1, FILLED: 2, CLOSED: 3 }; const gaps = S.hireScope === "ho" ? [] : manpowerGaps();
  const list = jobs.slice().sort((a, b) => rank[a.status] - rank[b.status] || (b.opened || "").localeCompare(a.opened || ""));
  return `<section class="card"><div class="card-head"><h2>Job openings</h2></div><div class="table-wrap"><table><thead><tr><th>Job</th><th>Project</th><th class="num">Hired</th><th class="num">In process</th><th>Status</th><th>Posting</th><th>Opened</th></tr></thead><tbody>
    ${list.map((j) => `<tr class="go" data-job="${j.id}" tabindex="0"><td><b>${esc(j.title)}</b><div class="t-muted" style="font-size:13px">${esc(dept(j.deptId)?.name || "")}${j.rate ? " · " + payLabel(j.rate, j.payType) : ""}</div></td>
      <td>${j.projectId ? esc(S.projects.get(j.projectId)?.name || "") : '<span class="t-muted">Head office</span>'}</td><td class="num"><b>${jobHired(j)}</b> <span class="t-muted">of ${j.slots}</span></td>
      <td class="num">${listOf(S.apps).filter((a) => a.jobId === j.id && inProcess(a)).length}</td><td><span class="chip ${JSTATUS[j.status][1]}">${JSTATUS[j.status][0]}</span></td><td>${pubChip(j)}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(j.opened)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No job openings yet.</td></tr>'}
    </tbody></table></div></section>
    ${gaps.length ? `<section class="card"><div class="card-head"><h2>Project manpower still needed</h2><span class="t-muted" style="font-size:13px">Planned minus assigned, less what open jobs already cover</span></div>
      <div class="table-wrap"><table><thead><tr><th>Project</th><th>Position</th><th class="num">Short</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${gaps.slice(0, 30).map((g) => `<tr><td>${esc(g.p.name)}</td><td>${esc(pos(g.pid)?.title || "")}</td><td class="num"><b>${g.n}</b></td>${S.canEdit ? `<td class="num"><button class="btn btn-ghost btn-sm" data-new-job="${g.p.id}:${g.pid}:${g.n}">Open a job</button></td>` : ""}</tr>`).join("")}
      </tbody></table></div></section>` : ""}`;
}

VIEWS.job = () => {
  const j = S.jobs.get(S.view.id); if (!j) return notFound("Recruitment", "Job opening", "hiring");
  const rk = (a) => (OUT[a.stage] ? -1 : stageIdx(a.stage)); const apps = listOf(S.apps).filter((a) => a.jobId === j.id).sort((a, b) => rk(b) - rk(a) || a.last.localeCompare(b.last));
  const p = S.projects.get(j.projectId); const mgr = S.emps.get(j.mgrId);
  return backLink('data-go="hiring"', "Recruitment") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="t-muted" style="font-size:13px;font-weight:700">${esc(dept(j.deptId)?.name || "No department")}</span><h1 style="font-size:28px;font-weight:800">${esc(j.title)}</h1>
        <div class="chips" style="align-items:center;font-size:14px"><span class="chip ${JSTATUS[j.status][1]}">${JSTATUS[j.status][0]}</span>${j.sample ? '<span class="chip c-warn">Sample</span>' : ""}<span class="t-muted">${jobHired(j)} of ${j.slots} hired · opened ${fmtDate(j.opened)}</span></div></div>
      ${S.canEdit ? `<div class="head-actions"><button class="btn btn-ghost" data-new-app="${j.id}">${icon("plus")}Add applicant</button><button class="btn btn-primary" data-edit-job="${j.id}">Edit job</button></div>` : ""}
    </section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Applicants (${apps.length})</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Applicant</th><th>Stage</th><th>Applied</th><th>Source</th></tr></thead><tbody>
        ${apps.map((a) => `<tr class="go" data-app="${a.id}" tabindex="0"><td><div class="person" style="min-width:180px">${appAvatar(a)}<span class="who"><span class="name">${esc(appName(a))}</span><span class="sub">${esc(a.mobile || a.email || "")}</span></span></div></td><td>${stageChip(a.stage)}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(a.applied)}</td><td class="t-muted">${esc(a.source || "")}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No applicants yet.</td></tr>'}
        </tbody></table></div></section>
      <section class="card"><div class="card-head"><h2>Details</h2></div><dl class="facts" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${tfact("Position", esc(pos(j.posId)?.title))}${tfact("Project", p ? `<button class="link" data-project="${p.id}">${esc(p.name)}</button>` : "Head office")}${tfact("Employment", esc(STATUS[j.empType]?.[0]))}${tfact("Pay", payLabel(j.rate, j.payType))}${tfact("Hiring manager", mgr ? esc(fullName(mgr)) : "")}${tfact("People needed", String(j.slots))}</dl>
        ${j.desc ? `<h3 style="font-size:15px;margin:16px 0 6px">Qualifications and duties</h3><p style="margin:0;white-space:pre-line;font-size:14px">${esc(j.desc)}</p>` : ""}</section>
    </div>`;
};

VIEWS.jobForm = () => {
  const j = S.view.id ? S.jobs.get(S.view.id) : null; const pre = S.view.pre || {};
  const pp = pre.pid ? pos(pre.pid) : null;
  const v = j || { status: "OPEN", slots: pre.n || 1, posId: pre.pid || "", projectId: pre.proj || "", empType: pre.proj ? "PROJECT_BASED" : "PROBATIONARY", payType: pre.proj ? "DAILY" : "MONTHLY", opened: todayISO(), deptId: pp?.deptId || "", title: pp?.title || "" };
  const F = (k, label, type = "text", req = false, extra = "") => `<div class="field"><label for="jf-${k}">${label}${req ? ' <span class="req">*</span>' : ""}</label><input class="input" id="jf-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
  const Sel = (k, label, list, blank) => `<div class="field"><label for="jf-${k}">${label}</label><select class="input" id="jf-${k}" name="${k}">${opts(list, v[k] ?? "", blank)}</select></div>`;
  const mgrs = active().filter((e) => ["Project Manager", "General Manager", "HR Manager", "Finance Manager", "Site Engineer"].includes(pos(e.posId)?.title)).sort((a, b) => a.last.localeCompare(b.last));
  const cancel = j ? `data-job="${j.id}"` : 'data-go="hiring"';
  return backLink(cancel, j ? "Back to job" : "Recruitment") + head(j ? "Edit job opening" : "Recruitment", j ? esc(j.title) : "New job opening") + `
    <form id="job-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${Sel("posId", "Position", S.org.positions.slice().sort((a, b) => a.title.localeCompare(b.title)).map((x) => [x.id, x.title]), "Choose…")}${F("title", "Job title", "text", true)}
      ${Sel("deptId", "Department", S.org.departments.map((d) => [d.id, d.name]), "—")}${Sel("projectId", "Project", listOf(S.projects).filter((x) => x.status !== "COMPLETED").map((x) => [x.id, x.name]), "Head office")}
      ${F("slots", "People needed", "number", true, 'min="1" step="1"')}${Sel("empType", "Employment", [["PROBATIONARY", "Probationary (up to 6 months)"], ["PROJECT_BASED", "Project-based"], ["CONTRACTUAL", "Contractual"]])}
      ${Sel("payType", "Pay type", [["MONTHLY", "Monthly"], ["DAILY", "Daily"]])}${F("rate", "Pay rate (PHP)", "number", false, 'min="0" step="0.01"')}
      ${Sel("mgrId", "Hiring manager", mgrs.map((e) => [e.id, `${fullName(e)}, ${pos(e.posId)?.title}`]), "—")}${Sel("status", "Status", Object.entries(JSTATUS).map(([k, x]) => [k, x[0]]))}${F("opened", "Opened", "date", true)}
    </div>
    <div class="field"><label for="jf-desc">Qualifications and duties</label><textarea class="input" id="jf-desc" name="desc" rows="4">${esc(v.desc || "")}</textarea></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="jf-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save job</button></div></form>`;
};
async function submitJob(f) {
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#jf-err");
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!val("title")) return fail("Enter the job title."); const slots = Math.floor(Number(val("slots"))); if (!(slots >= 1)) return fail("People needed must be at least 1.");
  if (!val("opened")) return fail("Enter the date the job opened.");
  const prev = S.view.id ? S.jobs.get(S.view.id) : null;
  const j = { ...(prev || { id: uid() }), title: val("title"), posId: val("posId") || null, deptId: val("deptId") || null, projectId: val("projectId") || null, slots, empType: val("empType"), payType: val("payType"), rate: Number(val("rate")) || 0, mgrId: val("mgrId") || null, status: val("status"), opened: val("opened"), desc: val("desc") || null };
  try { await put("jobs", j); logActivity(`${prev ? "Updated" : "Opened"} job ${j.title}`); toast("Job saved."); go("job", { id: j.id }); } catch { fail("Couldn't save. Try again."); }
}

VIEWS.applicant = () => {
  const a = S.apps.get(S.view.id); if (!a) return notFound("Recruitment", "Applicant", "hiring");
  const j = S.jobs.get(a.jobId); const idx = stageIdx(a.stage); const ed = S.canEdit; const live = inProcess(a);
  const nx = STAGES[idx + 1]; const emp = a.empId ? S.emps.get(a.empId) : null;
  const ivs = (a.ivs || []).slice().sort((x, y) => (y.d + y.t).localeCompare(x.d + x.t)); const IVR = { PENDING: ["Scheduled", "c-warn"], PASSED: ["Passed", "c-ok"], FAILED: ["Did not pass", "c-bad"] };
  const reqsDone = PRE_REQS.filter(([k]) => a.reqs?.[k]).length;
  return backLink(j ? `data-job="${j.id}"` : 'data-go="hiring"', j ? esc(j.title) : "Recruitment") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">
      ${appAvatar(a, 88)}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h1 style="font-size:28px;font-weight:800">${esc([a.first, a.middle, a.last].filter(Boolean).join(" "))}</h1>${stageChip(a.stage)}${a.sample ? '<span class="chip c-warn">Sample</span>' : ""}</div>
        <div style="font-weight:600">Applying for ${j ? `<button class="link" data-job="${j.id}">${esc(jobLabel(j))}</button>` : "no job"}</div>
        <div class="t-muted" style="font-size:14px">Applied ${fmtDate(a.applied)}${a.source ? " · " + esc(a.source) : ""} · in this stage since ${fmtDate(a.stageAt || a.applied)}</div>
      </div>
      ${ed ? `<button class="btn btn-ghost" data-edit-app="${a.id}">Edit details</button>` : ""}
    </section>
    <section class="card"><div class="steps" aria-label="Hiring stages">${STAGES.map(([k, l], i) => `<span class="step ${OUT[a.stage] ? "" : i < idx ? "done" : i === idx ? "cur" : ""}">${i + 1}. ${l}</span>`).join("")}</div>
      ${emp ? `<div class="notice" style="margin-top:14px;box-shadow:none;background:var(--ok-soft)"><span>Hired on ${fmtDate(emp.hire)} as ${esc(emp.no)}.</span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-emp="${emp.id}">Open 201 file</button>${S.onb.has(emp.id) ? `<button class="btn btn-ghost btn-sm" data-onb="${emp.id}">Onboarding</button>` : ""}</span></div>` : ""}
      ${ed && live ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">${nx && nx[0] !== "HIRED" ? `<button class="btn btn-primary" data-app-stage="${a.id}:${nx[0]}">Move to ${nx[1].toLowerCase()}</button>` : ""}
        <button class="btn btn-ghost" data-app-stage="${a.id}:REJECTED">Not selected</button><button class="btn btn-ghost" data-app-stage="${a.id}:WITHDRAWN">Applicant withdrew</button></div>` : ""}
      ${ed && OUT[a.stage] ? `<div style="margin-top:14px"><button class="btn btn-ghost" data-app-stage="${a.id}:SCREENING">Return to the pipeline</button></div>` : ""}
    </section>
    ${ed && a.stage === "OFFER" ? hirePanel(a, j) : ""}
    <div class="two">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Interviews</h2></div>
          ${ivs.length ? `<ul class="list">${ivs.map((i) => `<li style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px">
            <span style="min-width:0"><b>${esc(i.kind)}</b> <span class="t-muted">${fmtDate(i.d)} ${esc(i.t || "")}${i.by ? " · " + esc(i.by) : ""}</span>${i.notes ? `<div style="font-size:14px">${esc(i.notes)}</div>` : ""}</span>
            <span style="display:flex;gap:8px;align-items:center"><span class="chip ${IVR[i.result][1]}">${IVR[i.result][0]}</span>${ed && i.result === "PENDING" ? `<button class="link" data-iv="${a.id}:${i.id}:PASSED">Passed</button><button class="link danger" data-iv="${a.id}:${i.id}:FAILED">Did not pass</button>` : ""}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">No interviews yet.</p>'}
          ${ed && live ? `<form id="iv-form" class="panel form-grid" style="margin-top:14px;align-items:end" data-keep>
            <div class="field"><label for="iv-d">Date</label><input class="input" id="iv-d" type="date" required value="${addDays(todayISO(), 1)}"></div>
            <div class="field"><label for="iv-t">Time</label><input class="input" id="iv-t" type="time" value="09:00"></div>
            <div class="field"><label for="iv-kind">Interview</label><select class="input" id="iv-kind">${opts(["Initial interview", "Technical interview", "Trade test", "Final interview"].map((x) => [x, x]), "Initial interview")}</select></div>
            <div class="field"><label for="iv-by">Interviewer</label><input class="input" id="iv-by" placeholder="Name"></div>
            <div class="field" style="grid-column:1/-1"><label for="iv-notes">Notes</label><input class="input" id="iv-notes"></div>
            <button class="btn btn-primary">Schedule interview</button></form>` : ""}
        </section>
        <section class="card"><div class="card-head"><h2>Pre-employment requirements</h2><span class="t-muted" style="font-size:14px">${reqsDone} of ${PRE_REQS.length}</span></div>
          ${PRE_REQS.map(([k, l]) => `<label class="check"><input type="checkbox" data-req="${a.id}:${k}" ${a.reqs?.[k] ? "checked" : ""} ${ed && !emp ? "" : "disabled"}><span style="flex:1"><b>${l}</b>${a.reqs?.[k] ? `<div class="t-muted" style="font-size:12px">Received ${fmtDate(a.reqs[k])}</div>` : ""}</span></label>`).join("")}
        </section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Job offer</h2>${a.offer?.status ? `<span class="chip ${{ ACCEPTED: "c-ok", DECLINED: "c-bad" }[a.offer.status] || "c-blue"}">${esc({ DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", DECLINED: "Declined" }[a.offer.status])}</span>` : ""}</div>
          ${ed && live ? `<form id="offer-form" class="stack" style="gap:12px" data-keep>
            <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))"><div class="field"><label for="of-rate">Pay rate (PHP)</label><input class="input" id="of-rate" type="number" min="0" step="0.01" value="${a.offer?.rate ?? j?.rate ?? ""}"></div>
            <div class="field"><label for="of-start">Start date</label><input class="input" id="of-start" type="date" value="${a.offer?.start || addDays(todayISO(), 14)}"></div>
            <div class="field"><label for="of-status">Status</label><select class="input" id="of-status">${opts([["DRAFT", "Draft"], ["SENT", "Sent"], ["ACCEPTED", "Accepted"], ["DECLINED", "Declined"]], a.offer?.status || "DRAFT")}</select></div></div>
            <div><button class="btn btn-ghost">Save offer</button></div></form>` : a.offer ? `<dl class="facts">${tfact("Rate", payLabel(a.offer.rate, j?.payType))}${tfact("Start", fmtDate(a.offer.start))}</dl>` : '<p class="t-muted" style="margin:0">No offer yet.</p>'}
          ${j?.rate && a.expRate ? `<p class="t-muted" style="margin:12px 0 0;font-size:13px">Asked for ${payLabel(a.expRate, j.payType)}; the job pays ${payLabel(j.rate, j.payType)}.</p>` : ""}
        </section>
        <section class="card"><div class="card-head"><h2>Contact and background</h2></div><dl class="facts" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${tfact("Mobile", esc(a.mobile))}${tfact("Email", esc(a.email))}${tfact("Address", esc(a.address))}${tfact("Birth date", fmtDate(a.birth))}${tfact("Sex", a.gender === "M" ? "Male" : a.gender === "F" ? "Female" : "")}${tfact("Expected pay", a.expRate ? peso.format(a.expRate) : "")}</dl>
          ${a.notes ? `<p style="margin:14px 0 0;font-size:14px;white-space:pre-line">${esc(a.notes)}</p>` : ""}
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">${a.resume ? `<a class="btn btn-ghost btn-sm" href="/_blob/${esc(a.resume.id)}" target="_blank" rel="noopener">${icon("file", 16)}Open resume</a>` : '<span class="t-muted" style="font-size:14px">No resume on file.</span>'}
            ${ed && S.assets ? `<label class="btn btn-ghost btn-sm">Upload resume (PDF or image)<input type="file" id="ap-file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label>` : ""}</div>
        </section>
      </div>
    </div>`;
};
function hirePanel(a, j) {
  const proj = S.projects.get(j?.projectId);
  return `<section class="card" style="border:2px solid var(--gold)"><div class="card-head"><h2>Hire ${esc(a.first)}</h2></div>
    <form id="hire-form" class="stack" style="gap:12px" data-keep><div class="form-grid">
      <div class="field"><label for="hf-no">Employee ID no. <span class="req">*</span></label><input class="input" id="hf-no" required value="" placeholder="Type the employee ID"></div>
      <div class="field"><label for="hf-start">First day</label><input class="input" id="hf-start" type="date" required value="${a.offer?.start || todayISO()}"></div>
      <div class="field"><label for="hf-status">Employment status</label><select class="input" id="hf-status">${opts(Object.entries(STATUS).map(([k, x]) => [k, x[0]]), j?.empType || "PROBATIONARY")}</select></div>
      <div class="field"><label for="hf-pay">Basic pay (${j?.payType === "DAILY" ? "a day" : "a month"})</label><input class="input" id="hf-pay" type="number" min="0" step="0.01" value="${a.offer?.rate ?? j?.rate ?? ""}"></div>
    </div>
    <p class="t-muted" style="margin:0;font-size:13px">This creates the 201 file${proj ? `, assigns ${esc(a.first)} to ${esc(proj.name)}` : ""} and starts the onboarding checklist. Government numbers and the photo are added on the 201 file.</p>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn btn-gold">Hire and start onboarding</button><p class="err" id="hf-err" style="margin:0" hidden></p></div></form></section>`;
}

VIEWS.applicantForm = () => {
  const a = S.view.id ? S.apps.get(S.view.id) : null;
  const v = a || { jobId: S.view.job || "", applied: todayISO(), source: "Walk-in" };
  const F = (k, label, type = "text", req = false, extra = "") => `<div class="field"><label for="af-${k}">${label}${req ? ' <span class="req">*</span>' : ""}</label><input class="input" id="af-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
  const jobs = listOf(S.jobs).filter((j) => j.status !== "CLOSED" || j.id === v.jobId).sort((x, y) => x.title.localeCompare(y.title));
  const cancel = a ? `data-app="${a.id}"` : v.jobId ? `data-job="${v.jobId}"` : 'data-go="hiring"';
  return backLink(cancel, "Back") + head("Recruitment", a ? esc(appName(a)) : "Add applicant") + `
    <form id="app-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      <div class="field"><label for="af-jobId">Job <span class="req">*</span></label><select class="input" id="af-jobId" name="jobId" required>${opts(jobs.map((j) => [j.id, jobLabel(j)]), v.jobId, "Choose…")}</select></div>
      ${F("first", "First name", "text", true)}${F("middle", "Middle name")}${F("last", "Last name", "text", true)}
      ${F("mobile", "Mobile", "tel", false, 'placeholder="09XX XXX XXXX"')}${F("email", "Email", "email")}${F("address", "Address")}
      ${F("birth", "Birth date", "date")}<div class="field"><label for="af-gender">Sex</label><select class="input" id="af-gender" name="gender">${opts([["M", "Male"], ["F", "Female"]], v.gender || "", "—")}</select></div>
      <div class="field"><label for="af-source">Source</label><select class="input" id="af-source" name="source">${opts(SOURCES.map((x) => [x, x]), v.source)}</select></div>
      ${F("applied", "Date applied", "date", true)}${F("expRate", "Expected pay (PHP)", "number", false, 'min="0" step="0.01"')}
    </div>
    <div class="field"><label for="af-notes">Notes (experience, skills, licenses)</label><textarea class="input" id="af-notes" name="notes" rows="3">${esc(v.notes || "")}</textarea></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="af-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save applicant</button></div></form>`;
};
async function submitApplicant(f) {
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#af-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!val("jobId")) return fail("Choose the job."); if (!val("first") || !val("last")) return fail("Enter the first and last name."); if (!val("applied")) return fail("Enter the date applied.");
  const prev = S.view.id ? S.apps.get(S.view.id) : null;
  const a = { ...(prev || { id: uid(), stage: "APPLIED", stageAt: val("applied"), ivs: [], reqs: {} }) };
  for (const k of ["jobId", "first", "middle", "last", "mobile", "email", "address", "birth", "gender", "source", "applied", "notes"]) a[k] = val(k) || null;
  a.expRate = Number(val("expRate")) || null;
  try { await put("applicants", a); logActivity(`${prev ? "Updated" : "Added"} applicant ${appName(a)}`); toast("Applicant saved."); go("applicant", { id: a.id }); } catch { fail("Couldn't save. Try again."); }
}
async function setStage(id, stage) {
  const a = S.apps.get(id); await put("applicants", { ...a, stage, stageAt: todayISO() });
  logActivity(`${appName(a)}: ${stageLabel(stage).toLowerCase()}`); toast(`${a.first} moved to ${stageLabel(stage).toLowerCase()}.`); render();
}
async function hireApplicant() {
  const a = S.apps.get(S.view.id); const j = S.jobs.get(a.jobId); const err = $("#hf-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const no = $("#hf-no").value.trim(); const start = $("#hf-start").value; const status = $("#hf-status").value;
  if (!no || !start) return fail("Enter the employee no. and first day.");
  if ([...S.emps.values()].some((x) => x.no.toLowerCase() === no.toLowerCase())) return fail(`Employee no. ${no} is already used.`);
  const proj = j?.projectId ? S.projects.get(j.projectId) : null; const title = pos(j?.posId)?.title || j?.title || "employee";
  const e = { id: uid(), no, first: a.first, middle: a.middle || null, last: a.last, suffix: null, title: null, photo: null, birth: a.birth || null, gender: a.gender || null, civil: null, email: a.email || null, mobile: a.mobile || null, address: a.address || null,
    emergencyName: null, emergencyRelation: null, emergencyPhone: null, tin: null, sss: null, philhealth: null, pagibig: null, hire: start, status, payType: j?.payType || "MONTHLY", basicPay: Number($("#hf-pay").value) || 0,
    deptId: j?.deptId || null, posId: j?.posId || null, supervisorId: j?.mgrId || null, projectId: proj?.id || null, projectRole: proj ? title : null, projectSince: proj ? start : null, projectUntil: proj && status === "PROJECT_BASED" ? proj.end || null : null,
    separated: null, shiftId: "day", bank: null, bankAcct: null, docs: a.resume ? [{ id: a.resume.id, kind: "Resume", name: a.resume.name || "Resume", at: todayISO(), exp: null }] : [],
    history: [{ d: start, kind: "Hired", text: `Hired as ${title} (${STATUS[status][0]}) from the ${j?.title || ""} job opening` }] };
  try {
    await saveEmp(e); S.emps.set(e.id, e);
    await startOnboarding(e);
    await put("applicants", { ...a, stage: "HIRED", stageAt: todayISO(), empId: e.id });
    if (j && jobHired(j) >= j.slots && j.status === "OPEN") await put("jobs", { ...j, status: "FILLED" });
    logActivity(`Hired ${fullName(e)} (${e.no}) as ${title}`); toast(`${a.first} is hired. Onboarding has started.`); go("onboard", { id: e.id });
  } catch { fail("Couldn't finish the hire. Check the 201 file before trying again."); }
}

/* ---------- onboarding and offboarding ---------- */
const SEP_REASONS = ["Resignation", "End of project / contract", "Did not meet probationary standards", "Retirement", "Termination for just cause", "Termination for authorized cause", "Death"];
const CAUSES = [["REDUNDANCY", "Redundancy or labor-saving devices (1 month per year)"], ["RETRENCH", "Retrenchment, closure or disease (half a month per year)"]];
const doneCount = (o) => (o.items || []).filter((i) => i.done).length;
async function startOnboarding(e) {
  const rec = { id: e.id, empId: e.id, start: e.hire, items: TSET().onboard.filter((i) => !i.site || e.projectId).map(({ k, label, who }) => ({ k, label, who, done: null })), done: null };
  await put("onboard", rec);
}
function offStatus(o) {
  const e = S.emps.get(o.empId);
  if (o.closed) return ["Closed", "c-gray"]; if (o.released) return ["Final pay released", "c-ok"]; if (e?.separated) return ["Clearance", "c-blue"]; return ["Serving notice", "c-warn"];
}
VIEWS.lifecycle = () => {
  const tab = S.lifeTab || "onboard"; const today = todayISO();
  const onb = listOf(S.onb).filter((o) => S.emps.get(o.empId)); const offb = listOf(S.offb).filter((o) => S.emps.get(o.empId));
  const openOn = onb.filter((o) => !o.done); const openOff = offb.filter((o) => !o.closed);
  const lateGov = openOn.filter((o) => o.items.some((i) => i.k === "gov" && !i.done) && addDays(o.start, 30) < today).length;
  const payDue = openOff.filter((o) => !o.released && S.emps.get(o.empId)?.separated).length;
  return head(`${openOn.length} joining · ${openOff.length} leaving`, "Onboarding &amp; Offboarding", S.canEdit ? `<button class="btn btn-gold" data-start-offb="">${icon("plus")}Start offboarding</button>` : "") + `
    <section class="stats">
      <div class="card stat"><span class="label">Onboarding in progress</span><span class="value">${openOn.length}</span><span class="note ${lateGov ? "t-bad" : "t-muted"}">${lateGov ? `${lateGov} past the 30-day SSS, PhilHealth and Pag-IBIG deadline` : "government reporting on time"}</span></div>
      <div class="card stat"><span class="label">Leaving</span><span class="value">${openOff.length}</span><span class="note t-muted">${openOff.filter((o) => !S.emps.get(o.empId)?.separated).length} still serving notice</span></div>
      <div class="card stat"><span class="label">Final pay to release</span><span class="value">${payDue}</span><span class="note t-muted">due within 30 days of the last day</span></div>
    </section>
    ${tabsBar(tab, [["onboard", "Onboarding"], ["offboard", "Offboarding"], ["templates", "Checklists"]], "life-tab")}
    ${tab === "offboard" ? offList(offb) : tab === "templates" ? templatesTab() : onList(onb)}`;
};
function onList(onb) {
  const today = todayISO(); const list = onb.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.start.localeCompare(a.start));
  const without = active().filter((e) => !S.onb.has(e.id) && e.hire >= addDays(today, -60));
  return `<section class="card"><div class="card-head"><h2>New hires</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>First day</th><th>Checklist</th><th>Government reporting</th><th>Status</th></tr></thead><tbody>
    ${list.slice(0, 200).map((o) => { const e = S.emps.get(o.empId); const gov = o.items.find((i) => i.k === "gov"); const due = addDays(o.start, 30);
      return `<tr class="go" data-onb="${e.id}" tabindex="0"><td>${personCell(e, esc(pos(e.posId)?.title || ""))}</td><td style="white-space:nowrap">${fmtDate(o.start)}</td><td>${progress(doneCount(o), o.items.length)}</td>
        <td>${!gov ? "" : gov.done ? `<span class="chip c-ok">Reported ${fmtDate(gov.done)}</span>` : `<span class="chip ${due < today ? "c-bad" : "c-warn"}">${due < today ? "Overdue since" : "Due"} ${fmtDate(due)}</span>`}</td>
        <td>${o.done ? `<span class="chip c-ok">Complete</span>` : '<span class="chip c-blue">In progress</span>'}</td></tr>`; }).join("") || '<tr><td colspan="5" class="empty">No one is onboarding. Hiring an applicant starts a checklist here.</td></tr>'}
    </tbody></table></div>
    ${S.canEdit && without.length ? `<form id="onb-new-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)" data-keep>
      <div class="field" style="flex:1;min-width:220px"><label for="on-emp">Start a checklist for someone hired in the last 60 days</label><select class="input" id="on-emp" required>${leaveEmpOptions(without.sort((a, b) => a.last.localeCompare(b.last)))}</select></div><button class="btn btn-ghost">Start onboarding</button></form>` : ""}
  </section>`;
}
function offList(offb) {
  const list = offb.slice().sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || b.last.localeCompare(a.last));
  return `<section class="card"><div class="card-head"><h2>People leaving</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Last day</th><th>Reason</th><th>Clearance</th><th class="num">Final pay</th><th>Status</th></tr></thead><tbody>
    ${list.map((o) => { const e = S.emps.get(o.empId); const st = offStatus(o);
      return `<tr class="go" data-offb="${e.id}" tabindex="0"><td>${personCell(e, esc(pos(e.posId)?.title || ""))}</td><td style="white-space:nowrap">${fmtDate(o.last)}</td><td>${esc(o.reason)}</td><td>${progress(doneCount(o), o.items.length)}</td><td class="num">${money(finalPay(e, o).net)}</td><td><span class="chip ${st[1]}">${st[0]}</span></td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No one is leaving.</td></tr>'}
    </tbody></table></div></section>`;
}
function templatesTab() {
  const T = TSET(); const ed = S.canEdit;
  const card = (key, title, note) => `<section class="card"><div class="card-head"><h2>${title}</h2><span class="t-muted" style="font-size:13px">${note}</span></div>
    <ul class="list" style="gap:0">${T[key].map((i, n) => `<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span><b style="font-weight:600">${esc(i.label)}</b> <span class="chip c-gray">${esc(i.who)}</span>${i.site ? ' <span class="chip c-blue">Site staff only</span>' : ""}</span>${ed ? `<button class="link danger" data-tpl-del="${key}:${n}">Remove</button>` : ""}</li>`).join("")}</ul>
    ${ed ? `<form class="tpl-form" data-tpl="${key}" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px" data-keep><div class="field" style="flex:1;min-width:220px"><label for="tpl-${key}">New step</label><input class="input" id="tpl-${key}" name="label" required></div>
      <div class="field" style="width:150px"><label for="tplw-${key}">Done by</label><input class="input" id="tplw-${key}" name="who" value="HR" required></div><button class="btn btn-ghost">Add step</button></form>` : ""}</section>`;
  return card("onboard", "Onboarding checklist", "Copied to each new hire. Changes apply to new checklists.") + card("offboard", "Offboarding clearance", "Copied to each person leaving.") + `
    <section class="card"><div class="card-head"><h2>Final pay policy</h2></div>
      <form id="conv-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end" data-keep><div class="field" style="flex:1;min-width:240px"><label for="conv">Unused vacation leave converted to cash</label><select class="input" id="conv" ${ed ? "" : "disabled"}>${opts([["SIL", "Up to 5 days (the Service Incentive Leave the law requires)"], ["ALL", "All unused vacation leave"], ["NONE", "None"]], T.convertVL)}</select></div>${ed ? '<button class="btn btn-ghost">Save</button>' : ""}</form></section>`;
}

VIEWS.onboard = () => {
  const o = S.onb.get(S.view.id); const e = S.emps.get(S.view.id); if (!o || !e) return notFound("Onboarding", "Checklist", "lifecycle");
  const p = S.projects.get(e.projectId); const ed = S.canEdit;
  return backLink('data-go="lifecycle"', "Onboarding &amp; Offboarding") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">${avatar(e, 80)}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="t-muted" style="font-size:13px;font-weight:700">ONBOARDING</span><h1 style="font-size:26px;font-weight:800">${esc(fullName(e))}</h1>
        <div class="t-muted" style="font-size:14px">${esc(pos(e.posId)?.title || "")}${p ? " · " + esc(p.name) : " · Head office"} · first day ${fmtDate(o.start)}</div></div>
      <div style="min-width:200px">${progress(doneCount(o), o.items.length)}${o.done ? `<div class="okmsg" style="margin-top:6px">Completed ${fmtDate(o.done)}</div>` : ""}</div></section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Checklist</h2></div>
        ${o.items.map((it, i) => `<label class="check"><input type="checkbox" data-check="onboard:${e.id}:${i}" ${it.done ? "checked" : ""} ${ed ? "" : "disabled"}><span style="flex:1"><b style="font-weight:600">${esc(it.label)}</b><div class="t-muted" style="font-size:13px">${esc(it.who)}${it.done ? " · done " + fmtDate(it.done) : ""}</div></span></label>`).join("")}
      </section>
      <div class="stack"><section class="card"><div class="card-head"><h2>Key dates</h2></div><ul class="list" style="font-size:14px">
        <li><b>${fmtDate(addDays(o.start, 30))}</b><div class="t-muted">Deadline to report to SSS, PhilHealth and Pag-IBIG</div></li>
        ${e.status === "PROBATIONARY" ? `<li><b>${fmtDate(regDue(e))}</b><div class="t-muted">End of probation. Evaluate before this date, or the law treats them as regular.</div></li>` : ""}
        ${e.projectUntil ? `<li><b>${fmtDate(e.projectUntil)}</b><div class="t-muted">Project assignment ends</div></li>` : ""}</ul></section>
        <section class="card"><div class="card-head"><h2>201 file</h2></div><p class="t-muted" style="margin:0 0 12px;font-size:14px">${(e.docs || []).length} documents on file. Government numbers: ${["tin", "sss", "philhealth", "pagibig"].filter((k) => e[k]).length} of 4 entered.</p>
          <button class="btn btn-ghost btn-sm" data-emp="${e.id}">Open 201 file</button></section></div>
    </div>`;
};

VIEWS.offboardForm = () => {
  const pre = S.view.emp ? S.emps.get(S.view.emp) : null; const list = active().filter((e) => !S.offb.has(e.id) || S.offb.get(e.id).closed);
  const reason = S.view.reason || "Resignation";
  return backLink(pre ? `data-emp="${pre.id}"` : 'data-go="lifecycle"', "Back") + head("Offboarding", "Start offboarding") + `
    <form id="offb-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${empPicker("ob-emp", pre?.id, list)}
      <div class="field"><label for="ob-reason">Reason <span class="req">*</span></label><select class="input" id="ob-reason" required>${opts(SEP_REASONS.map((r) => [r, r]), reason)}</select></div>
      <div class="field"><label for="ob-cause">Authorized cause (only for that reason)</label><select class="input" id="ob-cause">${opts(CAUSES, "REDUNDANCY")}</select></div>
      <div class="field"><label for="ob-notice">Notice date</label><input class="input" id="ob-notice" type="date" value="${S.view.notice || todayISO()}"></div>
      <div class="field"><label for="ob-last">Last working day <span class="req">*</span></label><input class="input" id="ob-last" type="date" required value="${S.view.last || addDays(todayISO(), reason === "Resignation" ? 30 : 0)}"></div>
    </div>
    <div class="field"><label for="ob-notes">Notes</label><textarea class="input" id="ob-notes" rows="2"></textarea></div>
    <div class="panel" style="font-size:14px">Resigning employees give 30 days' written notice. Authorized-cause separations need a written notice to the employee and to DOLE at least 30 days before the last day. Dismissal for just cause follows the two-notice process on the Performance page.</div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="ob-err" style="margin:0 auto 0 0" hidden></p><button class="btn btn-primary">Start offboarding</button></div></form>`;
};
async function submitOffboard(f) {
  const err = $("#ob-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const e = S.emps.get($("#ob-emp").value); const last = $("#ob-last").value; const reason = $("#ob-reason").value;
  if (!e) return fail("Choose the employee."); if (!last) return fail("Enter the last working day."); if (last < e.hire) return fail("The last day is before the hire date.");
  if (reason === "Did not meet probationary standards" && last >= regDue(e)) return fail(`Probation ends on ${fmtDate(regDue(e))}. After that the employee is regular by law, so this reason can't be used. Choose a just or authorized cause instead.`);
  const o = { id: e.id, empId: e.id, notice: $("#ob-notice").value || todayISO(), last, reason, cause: reason === "Termination for authorized cause" ? $("#ob-cause").value : null, notes: $("#ob-notes").value.trim() || null,
    items: TSET().offboard.map(({ k, label, who }) => ({ k, label, who, done: null })), pay: {}, released: null, closed: null };
  try {
    await put("offboard", o);
    logActivity(`Started offboarding for ${fullName(e)}: ${reason}, last day ${fmtDate(last)}`);
    if (last <= todayISO()) await markSeparated(e.id, true);
    toast("Offboarding started."); go("offboard", { id: e.id });
  } catch { fail("Couldn't save. Try again."); }
}
async function markSeparated(id, quiet) {
  const e = S.emps.get(id); const o = S.offb.get(id); if (!e || !o || e.separated) return;
  const n = { ...e, separated: { date: o.last, reason: o.reason }, projectId: null, projectRole: null, projectSince: null, projectUntil: null, history: [...(e.history || []), { d: o.last, kind: "Separated", text: o.reason }] };
  await saveEmp(n); S.emps.set(id, n); logActivity(`Recorded separation of ${fullName(e)}: ${o.reason}`);
  if (!quiet) { toast("Separation recorded."); render(); }
}
const heldBy = (id) => listOf(S.prop).filter((x) => x.holderId === id && x.status === "ASSIGNED");
const sepLabel = (o) => o.reason === "Retirement" ? "Retirement pay (RA 7641)" : "Separation pay";
function finalPay(e, o) {
  const Sx = SET(); const pay = o.pay || {}; const last = o.last; const year = last.slice(0, 4);
  const monthly = e.payType === "DAILY" ? (e.basicPay * Sx.factor) / 12 : e.basicPay || 0;
  const daily = e.payType === "DAILY" ? e.basicPay || 0 : ((e.basicPay || 0) * 12) / Sx.factor;
  const from = e.hire > `${year}-01-01` ? e.hire : `${year}-01-01`;
  const months = PAY.r2((Math.max(0, daysBetween(from, last) + 1) / 365) * 12);
  // Year-to-date tax is annualized at exit: over-withholding is refunded, under-withholding is collected.
  // Its 13th month figure also carries a twelfth of commissions that are part of the wage.
  const ann = annualize(e, year, last);
  const paid13 = pay.paid13 || t13Paid(e, year); const t13 = PAY.r2(Math.max(0, ann.t13 - paid13));
  // Salary for the last cutoff, only when it is paid with the final pay instead of the regular payroll.
  const salEst = lastSalary(e, last); const sal = PAY.r2(pay.sal || 0);
  // Company loans are deducted by default (the loan agreement is the written consent); SSS and Pag-IBIG balances only when ticked.
  const loanItems = listOf(S.loans).filter((ln) => ln.empId === e.id && ["ACTIVE", "HOLD"].includes(ln.status)).map((ln) => ({ id: ln.id, label: loanLabel(ln.id), bal: loanBal(ln), gov: isGovLoan(ln), on: pay.loans?.[ln.id] ?? !isGovLoan(ln) })).filter((x) => x.bal > 0);
  const loanDed = PAY.r2(loanItems.filter((x) => x.on).reduce((a, x) => a + x.bal, 0));
  const yrsExact = (daysBetween(e.hire, last) + 1) / 365.25; const whole = Math.floor(yrsExact); const yrs = whole + (yrsExact - whole >= 0.5 ? 1 : 0);
  const left = balances(e, year).find((b) => b.code === "VL")?.left ?? 0; const conv = TSET().convertVL;
  const autoDays = conv === "ALL" ? left : conv === "SIL" && yrsExact >= 1 ? Math.min(5, left) : 0;
  const convDays = pay.conv != null ? pay.conv : autoDays; const leave = PAY.r2(convDays * daily);
  const age = e.birth ? Math.floor(daysBetween(e.birth, last) / 365.25) : null;
  let sep = 0, sepNote;
  if (o.reason === "Termination for authorized cause") {
    if (o.cause === "RETRENCH") { sep = Math.max(monthly, (monthly / 2) * yrs); sepNote = `Separation pay is half a month per year of service (${yrs} counted), at least one month`; }
    else { sep = Math.max(monthly, monthly * yrs); sepNote = `Separation pay is one month per year of service (${yrs} counted), at least one month`; }
  } else if (o.reason === "Retirement") {
    if (age != null && age >= 60 && yrsExact >= 5) { sep = 22.5 * daily * yrs; sepNote = `Retirement pay is 22.5 days per year of service under RA 7641 (${yrs} counted)`; }
    else sepNote = "No RA 7641 retirement pay: it needs age 60 and 5 years of service, unless a company plan grants more";
  } else sepNote = { "Resignation": "No separation pay for resignation unless a policy or contract grants it", "End of project / contract": "No separation pay at the end of a project unless the contract grants it", "Did not meet probationary standards": "No separation pay when probationary standards are not met", "Termination for just cause": "No separation pay for dismissal for just cause", "Death": "No separation pay from the employer; the family claims SSS and Pag-IBIG death benefits" }[o.reason] || "";
  sep = PAY.r2(sep);
  const other = PAY.r2(pay.other || 0); const acct = PAY.r2(pay.acct || 0); const ded = PAY.r2(pay.ded || 0);
  const gross = PAY.r2(sal + t13 + leave + sep + other);
  // Exit tax also counts converted leave above the 10-day de minimis and other taxable earnings paid with the final pay.
  const exitTaxable = ann.mwe ? 0 : PAY.r2(Math.max(0, leave - 10 * daily) + other);
  const taxAdj = exitTaxable ? PAY.r2(-(PAY.annualTax(ann.annualTaxable + exitTaxable) - ann.withheld)) : PAY.r2(-ann.adj);
  return { monthly: PAY.r2(monthly), daily: PAY.r2(daily), months, t13, exitTaxable, left, autoDays, convDays, leave, sep, sepNote, other, acct, ded, gross, taxAdj, ann, net: PAY.r2(gross + taxAdj - acct - ded - loanDed), paid13, t13Full: ann.t13, sal, salEst, loanItems, loanDed, yrs, yrsExact: PAY.r2(yrsExact), age };
}
VIEWS.offboard = () => {
  const o = S.offb.get(S.view.id); const e = S.emps.get(S.view.id); if (!o || !e) return notFound("Offboarding", "Offboarding record", "lifecycle");
  const ed = S.canEdit && !o.closed; const f = finalPay(e, o); const st = offStatus(o); const held = heldBy(e.id); const today = todayISO(); const pay = o.pay || {};
  const line = (k, v, neg) => `<tr><td>${k}</td><td class="num">${neg ? (v ? "(" + money(v) + ")" : money(0)) : money(v)}</td></tr>`;
  return backLink('data-go="lifecycle"', "Onboarding &amp; Offboarding") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">${avatar(e, 80)}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="t-muted" style="font-size:13px;font-weight:700">OFFBOARDING</span><h1 style="font-size:26px;font-weight:800">${esc(fullName(e))}</h1>
        <div class="chips" style="align-items:center;font-size:14px"><span class="chip ${st[1]}">${st[0]}</span>${o.sample ? '<span class="chip c-warn">Sample</span>' : ""}<span class="t-muted">${esc(o.reason)} · last day ${fmtDate(o.last)} · ${f.yrsExact} years of service</span></div></div>
      <div class="head-actions"><button class="btn btn-ghost" data-letter="coe:${e.id}">Certificate of Employment</button><button class="btn btn-ghost" data-letter="finalpay:${e.id}">Final pay statement</button><button class="btn btn-ghost" data-bir2316="${e.id}:${o.last.slice(0, 4)}">BIR 2316</button></div></section>
    ${o.reason === "Termination for authorized cause" ? `<div class="notice"><span>${o.notice && o.last >= addDays(o.notice, 30) ? `<span class="chip c-ok">30-day notice met</span> Written notice to the employee and to DOLE (RKS Form 5) on ${fmtDate(o.notice)}.` : `<span class="chip c-bad">Notice too short</span> An authorized-cause termination needs written notice to the employee and to DOLE (RKS Form 5) at least 30 days before the last day${o.notice ? `; notice was ${fmtDate(o.notice)}, so the earliest last day is ${fmtDate(addDays(o.notice, 30))}` : ""}.`}</span></div>` : ""}
    ${!e.separated ? `<div class="notice"><span>${o.last > today ? `Still working until ${fmtDate(o.last)}. Their payroll runs as usual until then.` : `The last day has passed. Record the separation to take them off payroll and the project.`}</span>${S.canEdit ? `<button class="btn btn-primary btn-sm" data-sep-now="${e.id}">Record separation now</button>` : ""}</div>` : ""}
    <div class="two">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Clearance</h2><span class="t-muted" style="font-size:14px">${doneCount(o)} of ${o.items.length}</span></div>
          ${o.items.map((it, i) => `<label class="check"><input type="checkbox" data-check="offboard:${e.id}:${i}" ${it.done ? "checked" : ""} ${ed ? "" : "disabled"}><span style="flex:1"><b style="font-weight:600">${esc(it.label)}</b><div class="t-muted" style="font-size:13px">${esc(it.who)}${it.done ? " · done " + fmtDate(it.done) : ""}</div></span></label>`).join("")}</section>
        <section class="card"><div class="card-head"><h2>Company property to return (${held.length})</h2>${held.length ? `<span class="t-muted" style="font-size:13px">${money(held.reduce((a, x) => a + (x.value || 0), 0))} at cost</span>` : ""}</div>
          ${held.length ? `<ul class="list">${held.map((x) => `<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><button class="link" style="color:var(--ink);text-align:left" data-asset="${x.id}"><b>${esc(x.tag)}</b> ${esc(x.name)}</button><span style="display:flex;gap:10px;align-items:center"><span class="t-muted num">${money(x.value)}</span>${S.canEdit ? `<button class="btn btn-ghost btn-sm" data-return="${x.id}">Mark returned</button>` : ""}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">Nothing outstanding.</p>'}</section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Final pay</h2>${o.released ? `<span class="chip c-ok">Released ${fmtDate(o.released)}</span>` : e.separated ? `<span class="chip ${addDays(o.last, 30) < today ? "c-bad" : "c-warn"}">Due ${fmtDate(addDays(o.last, 30))}</span>` : ""}</div>
          <div class="table-wrap"><table><tbody>
            ${f.sal ? line("Unpaid salary for the last cutoff", f.sal) : ""}${line(`13th month pay (${money(f.t13Full)} for ${o.last.slice(0, 4)}${f.paid13 ? `, less ${money(f.paid13)} released` : ""})`, f.t13)}${line(`Leave converted (${f.convDays} of ${f.left} vacation days left)`, f.leave)}${line(sepLabel(o), f.sep)}${f.other ? line(esc(pay.otherLabel || "Other earnings"), f.other) : ""}
            <tr><td><b>Total earnings</b></td><td class="num"><b>${money(f.gross)}</b></td></tr>${Math.abs(f.taxAdj) >= 0.5 ? (f.taxAdj > 0 ? line("Tax refund from annualization", f.taxAdj) : line("Tax still due from annualization", -f.taxAdj, true)) : ""}${line("Unreturned property", f.acct, true)}${line(esc(pay.dedLabel || "Other deductions"), f.ded, true)}${f.loanItems.filter((x) => x.on).map((x) => line(`Loan balance: ${esc(x.label)}`, x.bal, true)).join("")}
            <tr><td><b>${f.net < 0 ? "Employee owes" : "Net final pay"}</b></td><td class="num" style="white-space:nowrap"><b style="font-size:20px">${peso.format(Math.abs(f.net))}</b></td></tr></tbody></table></div>
          <p class="t-muted" style="font-size:13px;margin:10px 0 0">${esc(f.sepNote)}. ${f.sal ? "Salary for the last cutoff is included above." : "Salary up to the last day goes through the regular payroll."} Monthly rate ${money(f.monthly)}, daily rate ${money(f.daily)}. Tax for ${o.last.slice(0, 4)} is annualized to the last day: ${money(f.ann.due)} due against ${money(f.ann.withheld)} withheld${f.ann.drafts ? " (includes cutoffs not final yet)" : ""}.${f.sep && o.reason === "Termination for authorized cause" ? " Separation pay for an authorized cause is tax-exempt." : ""}</p>
          ${ed && !o.released ? `<form id="fp-form" class="panel form-grid" style="margin-top:14px;align-items:end;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))" data-keep>
            <div class="field"><label for="fp-conv">Leave days to convert</label><input class="input" id="fp-conv" type="number" min="0" step="0.5" value="${pay.conv ?? ""}" placeholder="${f.autoDays}"></div>
            <div class="field"><label for="fp-paid13">13th month already released this year</label><input class="input" id="fp-paid13" type="number" min="0" step="0.01" value="${pay.paid13 || ""}" placeholder="${money(t13Paid(e, o.last.slice(0, 4)))}"></div>
            <div class="field"><label for="fp-sal">Unpaid salary for the last cutoff</label><input class="input" id="fp-sal" type="number" min="0" step="0.01" value="${pay.sal || ""}" placeholder="0"><small class="t-muted">Only if not paid in regular payroll. Estimate ${money(f.salEst)}</small></div>
            ${f.loanItems.length ? `<fieldset class="or-fs" style="grid-column:1/-1"><legend>Deduct loan balances</legend>${f.loanItems.map((x) => `<label class="or-p"><input type="checkbox" name="fp-loan" value="${x.id}" ${x.on ? "checked" : ""}>${esc(x.label)} <small class="t-muted">${money(x.bal)} left${x.gov ? " · government loan, the employee may settle it directly" : ""}</small></label>`).join("")}</fieldset>` : ""}
            <div class="field"><label for="fp-other">Other earnings</label><input class="input" id="fp-other" type="number" min="0" step="0.01" value="${pay.other || ""}" placeholder="0"></div>
            <div class="field"><label for="fp-otherl">Other earnings are for</label><input class="input" id="fp-otherl" value="${esc(pay.otherLabel || "")}" placeholder="Unpaid allowance"></div>
            <div class="field"><label for="fp-acct">Unreturned property to deduct</label><input class="input" id="fp-acct" type="number" min="0" step="0.01" value="${pay.acct || ""}" placeholder="0"></div>
            <div class="field"><label for="fp-ded">Other deductions</label><input class="input" id="fp-ded" type="number" min="0" step="0.01" value="${pay.ded || ""}" placeholder="0"></div>
            <div class="field"><label for="fp-dedl">Other deductions are for</label><input class="input" id="fp-dedl" value="${esc(pay.dedLabel || "")}" placeholder="Cash advance"></div>
            <button class="btn btn-ghost">Update final pay</button>
            <p class="t-muted" style="grid-column:1/-1;margin:0;font-size:13px">A blank leave box uses the computed days. Deduct for unreturned property or loans only with the employee's written consent.</p></form>` : ""}
          ${S.canEdit && e.separated && !o.released ? `<form id="rel-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px" data-keep><div class="field"><label for="rel-d">Released on</label><input class="input" id="rel-d" type="date" value="${today}" required></div><button class="btn btn-primary">Mark final pay released</button></form>` : ""}
        </section>
        ${o.notes ? `<section class="card"><div class="card-head"><h2>Notes</h2></div><p style="margin:0;white-space:pre-line;font-size:14px">${esc(o.notes)}</p></section>` : ""}
      </div>
    </div>`;
};
async function toggleCheck(kind, empId, i, on) {
  const col = kind === "onboard" ? "onboard" : "offboard"; const o = S[TCOLS[col]].get(empId); if (!o) return;
  const items = o.items.map((it, n) => (n === i ? { ...it, done: on ? todayISO() : null } : it));
  const all = items.every((it) => it.done);
  const next = col === "onboard" ? { ...o, items, done: all ? todayISO() : null } : { ...o, items, closed: all && o.released ? todayISO() : null };
  await put(col, next);
  if (col === "onboard" && all && !o.done) { logActivity(`Completed onboarding for ${empName(empId)}`); toast("Onboarding complete."); }
  if (col === "offboard" && next.closed && !o.closed) { logActivity(`Closed offboarding for ${empName(empId)}`); toast("Offboarding closed."); }
  render();
}
const empName = (id) => { const e = S.emps.get(id); return e ? fullName(e) : "an employee"; };

/* ---------- performance ---------- */
const RATING = [[4.5, "Outstanding", "c-ok"], [3.5, "Very satisfactory", "c-ok"], [2.5, "Satisfactory", "c-blue"], [1.5, "Needs improvement", "c-warn"], [0, "Poor", "c-bad"]];
const ratingOf = (v) => RATING.find((r) => v >= r[0]);
const ratingChip = (v) => (v ? `<span class="chip ${ratingOf(v)[2]}">${PAY.r2(v).toFixed(2)} · ${ratingOf(v)[1]}</span>` : '<span class="chip c-gray">Not rated</span>');
const RTYPES = { REGULARIZATION: "Regularization", ANNUAL: "Annual review", MIDYEAR: "Mid-year review", PROJECT: "End of project" };
const RECS = { REGULARIZE: "Regularize", EXTEND: "Keep on probation (decide before 6 months)", END: "End employment: standards not met", KEEP: "Keep in role", PROMOTE: "Recommend promotion", RAISE: "Recommend pay increase", PIP: "Performance improvement plan" };
/* Just causes for dismissal under Labor Code Art. 297. */
const GROUNDS = [["", "Company rule only (not a ground for dismissal)"], ["MISCONDUCT", "Serious misconduct or willful disobedience (Art. 297a)"], ["NEGLECT", "Gross and habitual neglect of duties (Art. 297b)"], ["FRAUD", "Fraud or willful breach of trust (Art. 297c)"], ["CRIME", "Crime against the employer, its family or representative (Art. 297d)"], ["ANALOGOUS", "Analogous causes (Art. 297e)"]];
const PENALTY = [["NONE", "Cleared, no penalty"], ["VERBAL", "Verbal warning"], ["WRITTEN", "Written warning"], ["SUSPENSION", "Suspension"], ["DISMISSAL", "Dismissal"]];
const caseStatus = (c) => (c.decision?.d ? ["Decided", "c-gray"] : c.hearing?.d ? ["Hearing held", "c-blue"] : c.reply?.d ? ["Explanation received", "c-blue"] : addDays(c.nte, 5) < todayISO() ? ["No reply yet", "c-bad"] : ["Waiting for explanation", "c-warn"]);
const reviewsOf = (id) => listOf(S.reviews).filter((r) => r.empId === id).sort((a, b) => (b.at || "").localeCompare(a.at || ""));

VIEWS.perf = () => {
  const tab = S.perfTab || "regular";
  const actions = S.canEdit ? (tab === "cases" ? `<button class="btn btn-gold" data-new-case="">${icon("plus")}New case</button>` : `<button class="btn btn-gold" data-new-review="">${icon("plus")}New review</button>`) : "";
  const body = tab === "reviews" ? reviewsTab() : tab === "cases" ? casesTab() : regularTab();
  return head("Reviews, regularization and discipline", "Performance", `<button class="btn btn-ghost" data-talx="reviews">Download reviews (CSV)</button>${actions}`) + tabsBar(tab, [["regular", "Regularization"], ["reviews", "Reviews"], ["cases", "Discipline"]], "perf-tab") + body;
};
function regularTab() {
  const today = todayISO(); const prob = active().filter((e) => e.status === "PROBATIONARY").sort((a, b) => a.hire.localeCompare(b.hire));
  const due30 = prob.filter((e) => regDue(e) >= today && regDue(e) <= addDays(today, 30)).length; const past = prob.filter((e) => regDue(e) < today).length;
  return `<section class="stats">
      <div class="card stat"><span class="label">On probation</span><span class="value">${prob.length}</span><span class="note t-muted">up to 6 months from hiring</span></div>
      <div class="card stat"><span class="label">Probation ends in 30 days</span><span class="value">${due30}</span><span class="note t-warn">evaluate before the end date</span></div>
      <div class="card stat"><span class="label">Past 6 months</span><span class="value">${past}</span><span class="note ${past ? "t-bad" : "t-ok"}">${past ? "already regular by law; update their status" : "none"}</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Probationary employees</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Hired</th><th>Probation ends</th><th>Evaluation</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${prob.map((e) => { const r = reviewsOf(e.id).find((x) => x.type === "REGULARIZATION"); const left = daysBetween(today, regDue(e));
        return `<tr><td>${personCell(e, esc(pos(e.posId)?.title || ""))}</td><td style="white-space:nowrap">${fmtDate(e.hire)}</td><td style="white-space:nowrap">${fmtDate(regDue(e))} <span class="chip ${left < 0 ? "c-bad" : left <= 30 ? "c-warn" : "c-gray"}">${left < 0 ? `${-left} days past` : `${left} days left`}</span></td>
          <td>${r ? `${r.status === "DONE" ? ratingChip(r.overall) + " " + esc(RECS[r.rec] || "") : '<span class="chip c-blue">Draft</span>'}` : left <= 30 ? '<span class="chip c-warn">Evaluate now</span>' : '<span class="t-muted">Not started</span>'}</td>
          ${S.canEdit ? `<td class="num">${r ? `<button class="btn btn-ghost btn-sm" data-review="${r.id}">Open</button>` : `<button class="btn btn-primary btn-sm" data-new-review="REGULARIZATION:${e.id}">Evaluate</button>`}</td>` : ""}</tr>`; }).join("") || '<tr><td colspan="5" class="empty">No one is on probation.</td></tr>'}
    </tbody></table></div>
    <p class="t-muted" style="margin:12px 0 0;font-size:13px">Probation can last up to 6 months (Labor Code Art. 296). The standards for regularization must be explained at hiring. Anyone still working past 6 months is a regular employee.</p></section>`;
}
function reviewsTab() {
  const all = listOf(S.reviews); const yr = todayISO().slice(0, 4);
  const cycles = [...new Set([`${yr} Annual`, ...all.map((r) => r.cycle).filter(Boolean)])].sort().reverse();
  const cyc = S.cycle && cycles.includes(S.cycle) ? S.cycle : cycles.find((c) => all.some((r) => r.cycle === c)) || cycles[0];
  const list = all.filter((r) => r.cycle === cyc && S.emps.get(r.empId)).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const done = list.filter((r) => r.status === "DONE"); const avg = done.length ? done.reduce((a, r) => a + (r.overall || 0), 0) / done.length : 0;
  const bands = RATING.map(([min, l, c]) => ({ l, c, n: done.filter((r) => ratingOf(r.overall || 0)[1] === l).length }));
  const COL = { "c-ok": "#11643C", "c-blue": "#2348C7", "c-warn": "#F5B841", "c-bad": "#A3242B" };
  return `<section class="card"><div class="card-head"><h2>Review cycle</h2><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="lbl">Cycle</span><select class="input" style="width:auto" data-cycle>${opts(cycles.map((c) => [c, c]), cyc)}</select></label></div>
      <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="stat"><span class="label">Completed</span><span class="value">${done.length}</span><span class="note t-muted">${list.length - done.length} drafts · ${active().length} active employees</span></div>
        <div class="stat"><span class="label">Average rating</span><span class="value">${done.length ? PAY.r2(avg).toFixed(2) : "—"}</span><span class="note t-muted">${done.length ? ratingOf(avg)[1] : "no completed reviews"}</span></div>
        <div class="stat" style="grid-column:span 2;min-width:0"><span class="label">Spread</span>
          <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;gap:2px;margin-top:8px" role="img" aria-label="${bands.map((b) => `${b.l} ${b.n}`).join(", ")}">${bands.filter((b) => b.n).map((b) => `<i style="width:${(b.n / Math.max(1, done.length)) * 100}%;background:${b.l === "Outstanding" ? "#0B4A2C" : COL[b.c]}"></i>`).join("") || '<i style="width:100%;background:var(--blue-soft)"></i>'}</div>
          <span class="note t-muted" style="margin-top:6px">${bands.filter((b) => b.n).map((b) => `${b.l} ${b.n}`).join(" · ") || "No ratings yet"}</span></div>
      </div></section>
    <section class="card"><div class="card-head"><h2>${esc(cyc)} reviews (${list.length})</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Review</th><th>Reviewer</th><th>Date</th><th>Rating</th><th>Recommendation</th></tr></thead><tbody>
      ${list.slice(0, 300).map((r) => { const e = S.emps.get(r.empId); const rv = S.emps.get(r.reviewerId);
        return `<tr class="go" data-review="${r.id}" tabindex="0"><td>${personCell(e, esc(pos(e.posId)?.title || ""))}</td><td>${esc(RTYPES[r.type] || r.type)}</td><td class="t-muted">${rv ? esc(fullName(rv)) : ""}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.at)}</td><td>${r.status === "DONE" ? ratingChip(r.overall) : '<span class="chip c-blue">Draft</span>'}</td><td>${esc(RECS[r.rec] || "")}</td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No reviews in this cycle yet.</td></tr>'}
    </tbody></table></div></section>`;
}
function casesTab() {
  const list = listOf(S.cases).filter((c) => S.emps.get(c.empId)).sort((a, b) => (a.decision?.d ? 1 : 0) - (b.decision?.d ? 1 : 0) || b.nte.localeCompare(a.nte));
  return `<section class="card"><div class="card-head"><h2>Disciplinary cases</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Offense</th><th>Notice to explain</th><th>Reply due</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map((c) => { const e = S.emps.get(c.empId); const st = caseStatus(c);
      return `<tr class="go" data-case="${c.id}" tabindex="0"><td>${personCell(e, esc(pos(e.posId)?.title || ""))}</td><td>${esc(c.offense)}</td><td style="white-space:nowrap">${fmtDate(c.nte)}</td><td style="white-space:nowrap">${fmtDate(addDays(c.nte, 5))}</td><td><span class="chip ${st[1]}">${st[0]}</span></td><td>${c.decision?.penalty ? esc(PENALTY.find((x) => x[0] === c.decision.penalty)?.[1]) : ""}</td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No cases on record.</td></tr>'}
    </tbody></table></div>
    <p class="t-muted" style="margin:12px 0 0;font-size:13px">Due process for just causes uses two written notices: a notice to explain with at least 5 calendar days to answer, a chance to be heard, then a notice of decision (DOLE Department Order 147-15).</p></section>`;
}

VIEWS.review = () => {
  const r = S.view.id ? S.reviews.get(S.view.id) : null;
  const type = r?.type || S.view.type || "ANNUAL"; const empId = r?.empId || S.view.emp || ""; const e = S.emps.get(empId);
  const comps = r?.comps || TSET().competencies; const ed = S.canEdit; const dis = ed ? "" : "disabled";
  const goals = r?.goals?.length ? r.goals : [{ t: "", s: null }, { t: "", s: null }, { t: "", s: null }];
  const yr = todayISO().slice(0, 4); const regular = type === "REGULARIZATION";
  const reviewers = active().filter((x) => ["Project Manager", "General Manager", "HR Manager", "Finance Manager", "Site Engineer", "Foreman"].includes(pos(x.posId)?.title)).sort((a, b) => a.last.localeCompare(b.last));
  const seg = (name, cur) => `<div class="seg" role="radiogroup">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${name}" value="${n}" ${Number(cur) === n ? "checked" : ""} ${dis}><span>${n}</span></label>`).join("")}</div>`;
  return backLink(e ? `data-emp="${e.id}"` : 'data-go="perf"', e ? esc(fullName(e)) : "Performance") + head(r ? `${esc(RTYPES[type])} · ${r.status === "DONE" ? "completed " + fmtDate(r.at) : "draft"}` : "Performance", r ? esc(e ? fullName(e) : "Review") : `New ${RTYPES[type].toLowerCase()}`) + `
    <form id="review-form" class="stack" data-keep novalidate>
      <section class="card"><div class="form-grid">
        ${r ? `<div class="field"><span class="lbl">Employee</span><b>${e ? esc(fullName(e)) : ""}</b><span class="t-muted" style="font-size:13px">${e ? esc(pos(e.posId)?.title || "") : ""}</span></div><input type="hidden" id="rv-emp" value="${esc(empId)}">` : `<div class="field"><label for="rv-emp-q">Find employee</label><input class="input" id="rv-emp-q" type="search" data-pick="rv-emp" placeholder="Name or employee no."></div><div class="field"><label for="rv-emp">Employee <span class="req">*</span></label><select class="input" id="rv-emp" required>${leaveEmpOptions(active().sort((a, b) => a.last.localeCompare(b.last)), empId)}</select></div>`}
        <div class="field"><label for="rv-type">Review</label><select class="input" id="rv-type" ${dis}>${opts(Object.entries(RTYPES), type)}</select></div>
        <div class="field"><label for="rv-cycle">Cycle</label><input class="input" id="rv-cycle" value="${esc(r?.cycle || (regular ? `${yr} Regularization` : `${yr} Annual`))}" ${dis}></div>
        <div class="field"><label for="rv-by">Reviewer</label><select class="input" id="rv-by" ${dis}>${opts(reviewers.map((x) => [x.id, `${fullName(x)}, ${pos(x.posId)?.title}`]), r?.reviewerId || e?.supervisorId || "", "—")}</select></div>
      </div></section>
      <section class="card"><div class="card-head"><h2>Competencies</h2><span class="t-muted" style="font-size:13px">1 poor · 2 needs improvement · 3 satisfactory · 4 very satisfactory · 5 outstanding</span></div>
        <ul class="list" style="gap:0">${comps.map((c, i) => `<li class="score-row"><span style="font-weight:600;flex:1;min-width:160px">${esc(c)}</span>${seg("sc-" + i, r?.scores?.[c])}</li>`).join("")}</ul></section>
      <section class="card"><div class="card-head"><h2>Goals</h2><span class="t-muted" style="font-size:13px">Optional. Scored goals count toward the overall rating.</span></div>
        <ul class="list" style="gap:0">${goals.map((g, i) => `<li class="score-row"><input class="input" style="flex:1;min-width:200px" id="g-t-${i}" value="${esc(g.t)}" placeholder="Goal ${i + 1}" ${dis}>${seg("g-s-" + i, g.s)}</li>`).join("")}</ul></section>
      <section class="card"><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        <div class="field"><label for="rv-str">Strengths</label><textarea class="input" id="rv-str" rows="3" ${dis}>${esc(r?.strengths || "")}</textarea></div>
        <div class="field"><label for="rv-imp">Areas to improve</label><textarea class="input" id="rv-imp" rows="3" ${dis}>${esc(r?.improve || "")}</textarea></div>
        <div class="field"><label for="rv-rec">Recommendation</label><select class="input" id="rv-rec" ${dis}>${opts((regular ? ["REGULARIZE", "EXTEND", "END"] : ["KEEP", "PROMOTE", "RAISE", "PIP"]).map((k) => [k, RECS[k]]), r?.rec || (regular ? "REGULARIZE" : "KEEP"))}</select></div>
      </div></section>
      <div class="card sticky-actions"><span style="margin-right:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="lbl">Overall</span><span id="rv-overall">${ratingChip(r?.overall)}</span></span>
        <p class="err" id="rv-err" style="margin:0" hidden></p>
        ${ed ? `${r ? `<button type="button" class="btn btn-danger" data-del-review="${r.id}">Delete</button>` : ""}<button class="btn btn-ghost" value="DRAFT">Save draft</button><button class="btn btn-primary" value="DONE">Complete review</button>` : ""}</div>
    </form>`;
};
function reviewDraft() {
  const r = S.view.id ? S.reviews.get(S.view.id) : null; const comps = r?.comps || TSET().competencies;
  const pick = (n) => Number(document.querySelector(`input[name="${n}"]:checked`)?.value) || null;
  const scores = {}; comps.forEach((c, i) => { const v = pick("sc-" + i); if (v) scores[c] = v; });
  const goals = []; for (let i = 0; document.getElementById("g-t-" + i); i++) { const t = $("#g-t-" + i).value.trim(); const s = pick("g-s-" + i); if (t || s) goals.push({ t, s }); }
  const nums = [...Object.values(scores), ...goals.map((g) => g.s).filter(Boolean)];
  return { comps, scores, goals, overall: nums.length ? PAY.r2(nums.reduce((a, n) => a + n, 0) / nums.length) : null };
}
async function submitReview(status) {
  const err = $("#rv-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const prev = S.view.id ? S.reviews.get(S.view.id) : null; const e = S.emps.get($("#rv-emp").value); if (!e) return fail("Choose the employee.");
  const d = reviewDraft(); if (status === "DONE" && Object.keys(d.scores).length < d.comps.length) return fail("Score every competency to complete the review.");
  const r = { ...(prev || { id: uid() }), empId: e.id, type: $("#rv-type").value, cycle: $("#rv-cycle").value.trim() || `${todayISO().slice(0, 4)} Annual`, reviewerId: $("#rv-by").value || null, ...d,
    strengths: $("#rv-str").value.trim() || null, improve: $("#rv-imp").value.trim() || null, rec: $("#rv-rec").value, status, at: todayISO() };
  try {
    await put("reviews", r);
    logActivity(`${status === "DONE" ? "Completed" : "Saved a draft"} ${RTYPES[r.type].toLowerCase()} for ${fullName(e)}`);
    if (status === "DONE" && r.type === "REGULARIZATION" && r.rec === "REGULARIZE" && e.status === "PROBATIONARY") {
      const n = { ...e, status: "REGULAR", history: [...(e.history || []), { d: todayISO(), kind: "Regularized", text: `Probationary to Regular after evaluation (${ratingOf(r.overall || 0)[1].toLowerCase()})` }] };
      await saveEmp(n); S.emps.set(n.id, n); logActivity(`Regularized ${fullName(e)}`); toast(`${e.first} is now a regular employee.`); go("employee", { id: e.id }); return;
    }
    if (status === "DONE" && r.rec === "END" && todayISO() >= regDue(e)) { toast(`Review saved. Probation ended on ${fmtDate(regDue(e))}, so ${e.first} is already regular by law. Ending the employment now needs a just or authorized cause.`); S.perfTab = "regular"; go("perf"); return; }
    if (status === "DONE" && r.rec === "END") { toast("Review saved. Next, record the separation with a written notice before probation ends."); go("offboardForm", { emp: e.id, reason: "Did not meet probationary standards" }); return; }
    toast(status === "DONE" ? "Review completed." : "Draft saved."); S.perfTab = r.type === "REGULARIZATION" ? "regular" : "reviews"; S.cycle = r.cycle; go("perf");
  } catch { fail("Couldn't save. Try again."); }
}

VIEWS.caseForm = () => {
  const pre = S.view.emp || "";
  return backLink('data-go="perf"', "Performance") + head("Discipline", "New case") + `
    <form id="case-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${empPicker("cs-emp", pre)}
      <div class="field"><label for="cs-inc">Date of incident <span class="req">*</span></label><input class="input" id="cs-inc" type="date" required value="${todayISO()}"></div>
      <div class="field"><label for="cs-off">Offense <span class="req">*</span></label><input class="input" id="cs-off" required placeholder="Absent without leave"></div>
      <div class="field"><label for="cs-rule">Rule violated</label><input class="input" id="cs-rule" placeholder="Code of Conduct, Section 4.2"></div>
      <div class="field"><label for="cs-ground">Ground under the Labor Code</label><select class="input" id="cs-ground">${opts(GROUNDS, "")}</select></div>
      <div class="field"><label for="cs-nte">Notice to explain served on <span class="req">*</span></label><input class="input" id="cs-nte" type="date" required value="${todayISO()}"></div>
    </div>
    <div class="field"><label for="cs-det">What happened</label><textarea class="input" id="cs-det" rows="3" placeholder="Facts, place, witnesses"></textarea></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="cs-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" data-go="perf">Cancel</button><button class="btn btn-primary">Save and open the case</button></div></form>`;
};
VIEWS.caseView = () => {
  const c = S.cases.get(S.view.id); if (!c) return notFound("Discipline", "Case", "perf"); const e = S.emps.get(c.empId); const st = caseStatus(c); const ed = S.canEdit && !c.decision?.d;
  const step = (n, title, done, body) => `<section class="card"><div class="card-head"><h2><span class="chip ${done ? "c-ok" : "c-gray"}" style="margin-right:8px">${done ? "Done" : "Step " + n}</span>${title}</h2></div>${body}</section>`;
  return backLink('data-go="perf"', "Performance") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">${e ? avatar(e, 72) : ""}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="t-muted" style="font-size:13px;font-weight:700">DISCIPLINARY CASE</span><h1 style="font-size:26px;font-weight:800">${esc(c.offense)}</h1>
        <div class="chips" style="align-items:center;font-size:14px"><span class="chip ${st[1]}">${st[0]}</span>${c.sample ? '<span class="chip c-warn">Sample</span>' : ""}<span class="t-muted">${e ? `<button class="link" data-emp="${e.id}">${esc(fullName(e))}</button>` : ""} · incident ${fmtDate(c.incident)}</span></div></div>
      <div class="head-actions"><button class="btn btn-ghost" data-letter="nte:${c.id}">Notice to explain</button>${c.decision?.d ? `<button class="btn btn-ghost" data-letter="decision:${c.id}">Notice of decision</button>` : ""}</div></section>
    ${step(1, "Notice to explain", true, `<dl class="facts">${tfact("Served", fmtDate(c.nte))}${tfact("Reply due", fmtDate(addDays(c.nte, 5)))}${tfact("Rule", esc(c.rule))}${c.ground ? tfact("Ground", esc(GROUNDS.find((g) => g[0] === c.ground)?.[1])) : ""}</dl>${c.details ? `<p style="margin:12px 0 0;font-size:14px;white-space:pre-line">${esc(c.details)}</p>` : ""}`)}
    ${step(2, "Employee's explanation", !!c.reply?.d, c.reply?.d ? `<p style="margin:0;font-size:14px"><b>Received ${fmtDate(c.reply.d)}.</b> ${esc(c.reply.text || "")}</p>` : ed ? `<form class="case-step stack" data-step="reply" style="gap:12px" data-keep><div class="form-grid"><div class="field"><label for="cr-d">Received on</label><input class="input" id="cr-d" type="date" required value="${todayISO()}"></div></div><div class="field"><label for="cr-t">Summary of the explanation</label><textarea class="input" id="cr-t" rows="2"></textarea></div><div><button class="btn btn-ghost">Save explanation</button></div></form>` : '<p class="t-muted" style="margin:0">Not received.</p>')}
    ${step(3, "Conference or hearing (if requested or needed)", !!c.hearing?.d, c.hearing?.d ? `<p style="margin:0;font-size:14px"><b>Held ${fmtDate(c.hearing.d)}.</b> ${esc(c.hearing.text || "")}</p>` : ed ? `<form class="case-step stack" data-step="hearing" style="gap:12px" data-keep><div class="form-grid"><div class="field"><label for="ch-d">Date held</label><input class="input" id="ch-d" type="date" required value="${todayISO()}"></div></div><div class="field"><label for="ch-t">Minutes or notes</label><textarea class="input" id="ch-t" rows="2"></textarea></div><div><button class="btn btn-ghost">Save hearing</button></div></form>` : '<p class="t-muted" style="margin:0">None held.</p>')}
    ${step(4, "Notice of decision", !!c.decision?.d, c.decision?.d ? `<p style="margin:0;font-size:14px"><b>${esc(PENALTY.find((x) => x[0] === c.decision.penalty)?.[1] || "")}${c.decision.penalty === "SUSPENSION" ? ` for ${c.decision.days} working days${c.decision.from ? ` from ${fmtDate(c.decision.from)}` : ""} (unpaid)` : ""}</b>, served ${fmtDate(c.decision.d)}. ${esc(c.decision.text || "")}</p>
        ${c.decision.penalty === "DISMISSAL" && e && !e.separated && S.canEdit && !S.offb.has(e.id) ? `<button class="btn btn-primary btn-sm" style="margin-top:12px" data-start-offb="${e.id}|Termination for just cause">Start offboarding</button>` : ""}`
      : ed && caseLocked(c) ? `<p style="margin:0;font-size:14px"><span class="chip c-warn">Locked until ${fmtDate(addDays(c.nte, 5))}</span> The employee has 5 calendar days to reply to the notice to explain. A decision can be recorded once they reply or the period ends.</p>`
      : ed ? `<form class="case-step stack" data-step="decision" style="gap:12px" data-keep><div class="form-grid"><div class="field"><label for="cd-d">Served on</label><input class="input" id="cd-d" type="date" required value="${todayISO()}"></div>
        <div class="field"><label for="cd-p">Decision</label><select class="input" id="cd-p">${opts(PENALTY, "WRITTEN")}</select></div><div class="field"><label for="cd-n">Suspension days</label><input class="input" id="cd-n" type="number" min="0" step="1" value="0"></div><div class="field"><label for="cd-from">Suspension starts</label><input class="input" id="cd-from" type="date" value="${addDays(todayISO(), 1)}"></div></div>
        <div class="field"><label for="cd-t">Reasons for the decision</label><textarea class="input" id="cd-t" rows="2"></textarea></div><div><button class="btn btn-primary">Record decision</button></div>
        ${!c.ground ? '<p class="t-muted" style="margin:0;font-size:13px">No Labor Code ground was cited, so dismissal is not available for this case.</p>' : ""}</form>` : "")}`;
};
async function submitCase() {
  const err = $("#cs-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const e = S.emps.get($("#cs-emp").value); const inc = $("#cs-inc").value; const off = $("#cs-off").value.trim(); const nte = $("#cs-nte").value;
  if (!e) return fail("Choose the employee."); if (!inc || !off || !nte) return fail("Enter the incident date, offense and the date the notice was served.");
  const c = { id: uid(), empId: e.id, incident: inc, offense: off, rule: $("#cs-rule").value.trim() || null, ground: $("#cs-ground").value || null, details: $("#cs-det").value.trim() || null, nte, reply: null, hearing: null, decision: null };
  try { await put("cases", c); logActivity(`Opened a disciplinary case for ${fullName(e)}: ${off}`); toast("Case saved. Download the notice to explain for signing."); go("caseView", { id: c.id }); } catch { fail("Couldn't save. Try again."); }
}
const caseLocked = (c) => !c.reply?.d && addDays(c.nte, 5) >= todayISO();
async function submitCaseStep(step) {
  const c = S.cases.get(S.view.id); const n = { ...c };
  if (step === "decision" && caseLocked(c)) { toast(`The reply period runs until ${fmtDate(addDays(c.nte, 5))}.`); return; }
  if (step === "decision") { const dd = $("#cd-d").value; const min = c.reply?.d && c.reply.d < addDays(c.nte, 5) ? c.reply.d : addDays(c.nte, 5);
    if (!dd || dd < min) { toast(`The decision date can't be before ${fmtDate(min)}, when the reply period ends${c.reply?.d ? " or the reply was received" : ""}.`); return; }
    const fr = $("#cd-from")?.value; if (fr && fr < dd) { toast("The suspension can't start before the decision date."); return; } }
  if (step === "decision" && $("#cd-p").value === "DISMISSAL" && !c.ground) { toast("Dismissal needs a just cause under Art. 297. Cite the ground on the case first."); return; }
  if (step === "reply") n.reply = { d: $("#cr-d").value, text: $("#cr-t").value.trim() || null };
  if (step === "hearing") n.hearing = { d: $("#ch-d").value, text: $("#ch-t").value.trim() || null };
  if (step === "decision") n.decision = { d: $("#cd-d").value, penalty: $("#cd-p").value, days: Math.max(0, Number($("#cd-n").value) || 0), from: $("#cd-from")?.value || null, text: $("#cd-t").value.trim() || null };
  await put("cases", n);
  if (step === "decision") { const e = S.emps.get(c.empId); if (e) { const pen = PENALTY.find((x) => x[0] === n.decision.penalty)[1]; const ne = { ...e, history: [...(e.history || []), { d: n.decision.d, kind: "Disciplinary action", text: `${pen}: ${c.offense}` }] }; if (n.decision.penalty !== "NONE") { await saveEmp(ne); S.emps.set(e.id, ne); } } }
  logActivity(`Updated the case on ${c.offense} (${step})`); toast("Saved."); render();
}

/* ---------- training ---------- */
const SCOPES = [["ALL", "Everyone"], ["SITE", "Everyone on a project site"], ["OFFICE", "Head office staff"], ["POS", "Specific positions"]];
const TSTATE = { OK: ["Current", "c-ok"], EXPIRING: ["Expiring", "c-warn"], EXPIRED: ["Expired", "c-bad"], MISSING: ["Missing", "c-gray"] };
const needs = (c, e) => c.scope === "ALL" || (c.scope === "SITE" && !!e.projectId) || (c.scope === "OFFICE" && !e.projectId) || (c.scope === "POS" && (c.pos || []).includes(e.posId));
function trainState(c, e, today = todayISO()) { const r = c.recs?.[e.id]; if (!r) return "MISSING"; if (r.exp && r.exp < today) return "EXPIRED"; if (r.exp && r.exp <= addDays(today, 60)) return "EXPIRING"; return "OK"; }
function compliance(emps) {
  const courses = listOf(S.courses); const T = { req: 0, OK: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 };
  const rows = emps.map((e) => { const items = courses.filter((c) => needs(c, e)).map((c) => ({ c, st: trainState(c, e) })); for (const i of items) { T.req++; T[i.st]++; } return { e, items }; });
  return { rows, T, pct: T.req ? Math.round(((T.OK + T.EXPIRING) / T.req) * 100) : 100 };
}
const scopeLabel = (c) => (c.scope === "POS" ? (c.pos || []).map((p) => pos(p)?.title).filter(Boolean).join(", ") || "No positions chosen" : SCOPES.find((x) => x[0] === c.scope)?.[1]);
VIEWS.training = () => {
  const tab = S.trainTab || "compliance"; const { rows, T, pct } = compliance(active());
  return head("Required training and certificates", "Training", `<button class="btn btn-ghost" data-talx="training">Download gaps (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-edit-course="">${icon("plus")}New course</button>` : ""}`) + `
    <section class="stats">
      <div class="card stat"><span class="label">Compliance</span><span class="value">${pct}%</span><span class="note t-muted">of ${T.req} required trainings are current</span></div>
      <div class="card stat"><span class="label">Missing</span><span class="value">${T.MISSING}</span><span class="note t-muted">never taken</span></div>
      <div class="card stat"><span class="label">Expired</span><span class="value">${T.EXPIRED}</span><span class="note ${T.EXPIRED ? "t-bad" : "t-ok"}">${T.EXPIRED ? "renew before site work" : "none"}</span></div>
      <div class="card stat"><span class="label">Expiring in 60 days</span><span class="value">${T.EXPIRING}</span><span class="note t-warn">schedule renewals</span></div>
    </section>
    ${tabsBar(tab, [["compliance", "Who needs what"], ["courses", "Courses"]], "train-tab")}
    ${tab === "courses" ? coursesTab() : complianceTab(rows)}`;
};
function xfilterBar(f, key, extra = "") {
  const projs = [...S.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="field" style="grid-column:span 2"><label for="${key}-q">Search</label><input class="input" id="${key}-q" type="search" value="${esc(f.q)}" placeholder="Name, employee no. or position" data-xfilter="${key}:q"></div>
    <div class="field"><label for="${key}-dept">Department</label><select class="input" id="${key}-dept" data-xfilter="${key}:dept">${opts(S.org.departments.map((d) => [d.id, d.name]), f.dept, "All")}</select></div>
    <div class="field"><label for="${key}-proj">Project</label><select class="input" id="${key}-proj" data-xfilter="${key}:project">${opts([["none", "Head office"], ...projs.map((p) => [p.id, p.name])], f.project, "All")}</select></div>${extra}</div>`;
}
function xpager(f, total, key, noun = "people") {
  const pages = Math.max(1, Math.ceil(total / PAGE)); f.page = Math.min(Math.max(1, f.page), pages);
  return `<nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${total} ${noun} · page ${f.page} of ${pages}</span>
    <span style="display:flex;gap:8px">${f.page > 1 ? `<button class="btn btn-ghost btn-sm" data-xpage="${key}:-1">Previous</button>` : ""}${f.page < pages ? `<button class="btn btn-ghost btn-sm" data-xpage="${key}:1">Next</button>` : ""}</span></nav>`;
}
function complianceTab(rows) {
  const f = S.trainFilter; const keep = new Set(refilter(rows.map((r) => r.e), f).map((e) => e.id));
  const list = rows.filter((r) => keep.has(r.e.id) && (f.show !== "gaps" || r.items.some((i) => i.st !== "OK"))).sort((a, b) => a.e.last.localeCompare(b.e.last));
  const html = xpager(f, list.length, "tr"); const page = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return `<section class="card">${xfilterBar(f, "tr", `<div class="field"><label for="tr-show">Show</label><select class="input" id="tr-show" data-xfilter="tr:show">${opts([["gaps", "People with gaps"], ["all", "Everyone"]], f.show)}</select></div>`)}
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Required</th><th class="num">Current</th><th>Gaps</th></tr></thead><tbody>
    ${page.map((r) => `<tr class="go" data-emp="${r.e.id}" tabindex="0"><td>${personCell(r.e, esc(pos(r.e.posId)?.title || ""))}</td><td class="num">${r.items.length}</td><td class="num">${r.items.filter((i) => i.st === "OK").length}</td>
      <td><div class="chips">${r.items.filter((i) => i.st !== "OK").map((i) => `<span class="chip ${TSTATE[i.st][1]}" title="${esc(i.c.title)}">${esc(i.c.code)} ${TSTATE[i.st][0].toLowerCase()}</span>`).join("") || '<span class="chip c-ok">All current</span>'}</div></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No one matches.</td></tr>'}
    </tbody></table></div>${html}</section>`;
}
function coursesTab() {
  const emps = active(); const list = listOf(S.courses).sort((a, b) => a.title.localeCompare(b.title));
  return `<div class="grid-tiles" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:20px">${list.map((c) => {
    const req = emps.filter((e) => needs(c, e)); const cur = req.filter((e) => ["OK", "EXPIRING"].includes(trainState(c, e))).length; const pct = req.length ? Math.round((cur / req.length) * 100) : 100;
    return `<button class="card tile" style="display:flex;flex-direction:column;gap:12px;border:0" data-course="${c.id}">
      <span style="display:flex;justify-content:space-between;gap:12px;width:100%;align-items:flex-start"><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="t-muted" style="font-size:12px;font-weight:700">${esc(c.code)}</span><b style="font-size:17px;font-weight:800">${esc(c.title)}</b><span class="t-muted" style="font-size:13px">${esc(c.provider || "")}${c.hours ? ` · ${c.hours} hours` : ""}</span></span><span class="chip c-gray">${c.valid ? `Renew every ${c.valid % 12 ? c.valid + " months" : c.valid / 12 + (c.valid === 12 ? " year" : " years")}` : "No expiry"}</span></span>
      <span style="font-size:13px" class="t-muted">For: ${esc(scopeLabel(c))}</span>
      <span style="width:100%;display:flex;flex-direction:column;gap:6px"><span style="display:flex;justify-content:space-between;font-size:14px"><span><b>${cur}</b> <span class="t-muted">of ${req.length} current</span></span><b>${pct}%</b></span><span class="bar"><i style="width:${pct}%"></i></span></span></button>`; }).join("") || '<p class="empty" style="color:#fff">No courses yet.</p>'}</div>`;
}
VIEWS.course = () => {
  const c = S.courses.get(S.view.id); if (!c) return notFound("Training", "Course", "training"); const ed = S.canEdit; const today = todayISO();
  const recs = Object.entries(c.recs || {}).map(([id, r]) => ({ e: S.emps.get(id), ...r })).filter((x) => x.e && !x.e.separated).sort((a, b) => (a.exp || "9999").localeCompare(b.exp || "9999"));
  const req = active().filter((e) => needs(c, e)); const gap = req.filter((e) => trainState(c, e) !== "OK");
  return backLink('data-go="trcourses"', "Course catalog") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="t-muted" style="font-size:13px;font-weight:700">${esc(c.code)}</span><h1 style="font-size:26px;font-weight:800">${esc(c.title)}</h1>
        <div class="t-muted" style="font-size:14px">${esc(c.provider || "")}${c.hours ? ` · ${c.hours} hours` : ""} · ${c.valid ? `valid ${c.valid} months` : "no expiry"} · for ${esc(scopeLabel(c))}</div></div>
      ${ed ? `<div class="head-actions"><button class="btn btn-primary" data-edit-course="${c.id}">Edit course</button></div>` : ""}</section>
    <section class="stats"><div class="card stat"><span class="label">Must take it</span><span class="value">${req.length}</span><span class="note t-muted">active employees</span></div>
      <div class="card stat"><span class="label">Current</span><span class="value">${req.length - gap.length}</span><span class="note t-ok">certificate valid</span></div>
      <div class="card stat"><span class="label">Need it now</span><span class="value">${gap.length}</span><span class="note t-warn">missing, expired or expiring</span></div></section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Completed (${recs.length})</h2></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Completed</th><th>Expires</th><th>Status</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
        ${recs.slice(0, 400).map((x) => { const st = trainState(c, x.e, today); return `<tr><td>${personCell(x.e, esc(pos(x.e.posId)?.title || ""), 180)}</td><td style="white-space:nowrap">${fmtDate(x.d)}</td><td style="white-space:nowrap">${x.exp ? fmtDate(x.exp) : '<span class="t-muted">No expiry</span>'}</td><td><span class="chip ${TSTATE[st][1]}">${TSTATE[st][0]}</span></td>${ed ? `<td class="num"><button class="link quiet" data-del-rec="${c.id}:${x.e.id}">Remove</button></td>` : ""}</tr>`; }).join("") || '<tr><td colspan="5" class="empty">No one has completed this yet.</td></tr>'}
      </tbody></table></div></section>
      ${ed ? `<section class="card"><div class="card-head"><h2>Record completion</h2></div>
        <form id="rc-form" class="stack" style="gap:12px" data-keep>
          <div class="field"><label for="rc-d">Completed on</label><input class="input" id="rc-d" type="date" required value="${today}"></div>
          <div class="field"><label for="rc-q">Find people</label><input class="input" id="rc-q" type="search" placeholder="Name or position"></div>
          <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="rc-need" checked> Only people who need it</label>
          <div id="rc-list">${rcList(c)}</div>
          <button class="btn btn-primary">Save completions</button><p class="err" id="rc-err" style="margin:0" hidden></p>
        </form></section>` : ""}
    </div>`;
};
function rcList(c) {
  const q = ($("#rc-q")?.value || "").toLowerCase(); const onlyNeed = $("#rc-need") ? $("#rc-need").checked : true;
  const list = active().filter((e) => (!onlyNeed || (needs(c, e) && trainState(c, e) !== "OK")) && (!q || `${fullName(e)} ${e.no} ${pos(e.posId)?.title || ""}`.toLowerCase().includes(q))).sort((a, b) => a.last.localeCompare(b.last));
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:6px"><span class="t-muted">${list.length} people</span>${list.length ? `<button type="button" class="link" data-rc-all>Select all shown</button>` : ""}</div>
    <div style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:0 12px">${list.slice(0, 300).map((e) => `<label class="check" style="padding:8px 0"><input type="checkbox" name="rc-emp" value="${e.id}"><span style="flex:1"><b style="font-weight:600">${esc(fullName(e))}</b> <span class="t-muted" style="font-size:13px">${esc(pos(e.posId)?.title || "")}${needs(c, e) ? ` · ${TSTATE[trainState(c, e)][0].toLowerCase()}` : ""}</span></span></label>`).join("") || '<p class="t-muted" style="font-size:14px">Everyone who needs this is current.</p>'}</div>`;
}
VIEWS.courseForm = () => {
  const c = S.view.id ? S.courses.get(S.view.id) : null; const v = c || { scope: "ALL", valid: 12, pos: [] };
  const F = (k, label, type = "text", req = false, extra = "") => `<div class="field"><label for="cf-${k}">${label}${req ? ' <span class="req">*</span>' : ""}</label><input class="input" id="cf-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
  const cancel = c ? `data-course="${c.id}"` : 'data-go="trcourses"';
  return backLink(cancel, "Back") + head("Training", c ? esc(c.title) : "New course") + `
    <form id="course-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${F("code", "Short code", "text", true, 'placeholder="WAH"')}${F("title", "Course or certificate", "text", true)}${F("provider", "Provider", "text", false, 'placeholder="TESDA, OSHC, Red Cross"')}
      ${F("hours", "Hours", "number", false, 'min="0" step="0.5"')}${F("valid", "Valid for (months, 0 = no expiry)", "number", false, 'min="0" step="1"')}
      <div class="field"><label for="cf-scope">Required for</label><select class="input" id="cf-scope" name="scope">${opts(SCOPES, v.scope)}</select></div></div>
    <fieldset class="panel" id="cf-pos" ${v.scope === "POS" ? "" : "hidden"} style="border:0"><legend class="lbl" style="padding:0 0 8px">Positions that must take it</legend>
      <div class="grid-tiles" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">${S.org.positions.slice().sort((a, b) => a.title.localeCompare(b.title)).map((p) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="cf-p" value="${p.id}" ${(v.pos || []).includes(p.id) ? "checked" : ""}> ${esc(p.title)}</label>`).join("")}</div></fieldset>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="cf-err" style="margin:0 auto 0 0" hidden></p>${c ? `<button type="button" class="btn btn-danger" data-del-course="${c.id}">Delete course</button>` : ""}<button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save course</button></div></form>`;
};
async function submitCourse(f) {
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#cf-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!val("code") || !val("title")) return fail("Enter a short code and the course name.");
  const prev = S.view.id ? S.courses.get(S.view.id) : null;
  const c = { ...(prev || { id: uid(), recs: {} }), code: val("code").toUpperCase().slice(0, 8), title: val("title"), provider: val("provider") || null, hours: Number(val("hours")) || null, valid: Math.max(0, Math.floor(Number(val("valid")) || 0)), scope: val("scope"), pos: [...f.querySelectorAll('input[name="cf-p"]:checked')].map((x) => x.value) };
  if (c.scope === "POS" && !c.pos.length) return fail("Choose at least one position.");
  const months = c.valid; if (prev && prev.valid !== months) for (const r of Object.values(c.recs)) r.exp = months ? addMonths(r.d, months) : null;
  try { await put("courses", c); logActivity(`${prev ? "Updated" : "Added"} course ${c.title}`); toast("Course saved."); go("course", { id: c.id }); } catch { fail("Couldn't save. Try again."); }
}
async function submitCompletions() {
  const c = S.courses.get(S.view.id); const d = $("#rc-d").value; const ids = [...document.querySelectorAll('input[name="rc-emp"]:checked')].map((x) => x.value);
  const err = $("#rc-err"); if (!d || !ids.length) { err.textContent = "Pick the date and at least one person."; err.hidden = false; return; }
  const exp = c.valid ? addMonths(d, c.valid) : null; const add = Object.fromEntries(ids.map((id) => [id, { d, exp }]));
  try { await S.db.doc("courses/" + c.id).update({ recs: add }); S.courses.set(c.id, { ...c, recs: { ...(c.recs || {}), ...add } }); S.ver++;
    logActivity(`Recorded ${c.title} for ${ids.length} ${ids.length === 1 ? "person" : "people"}`); toast(`Saved for ${ids.length} ${ids.length === 1 ? "person" : "people"}.`); render(); }
  catch { err.textContent = "Couldn't save. Try again."; err.hidden = false; }
}

/* ---------- company assets ---------- */
const AKINDS = [["Laptop", "LAP"], ["Desktop computer", "DSK"], ["Mobile phone", "PHN"], ["Two-way radio", "RAD"], ["Vehicle", "VEH"], ["Power tool", "PTL"], ["Welding machine", "WLD"], ["Generator", "GEN"], ["Survey instrument", "SRV"], ["Other", "OTH"]];
const ASTATUS = { AVAILABLE: ["Available", "c-ok"], ASSIGNED: ["Assigned", "c-blue"], REPAIR: ["In repair", "c-warn"], LOST: ["Lost", "c-bad"], RETIRED: ["Retired", "c-gray"] };
const nextTag = (kind) => { const pre = AKINDS.find((k) => k[0] === kind)?.[1] || "OTH"; const n = Math.max(0, ...listOf(S.prop).filter((x) => x.tag?.startsWith(pre + "-")).map((x) => Number(x.tag.split("-")[1]) || 0)); return `${pre}-${String(n + 1).padStart(4, "0")}`; };
function filteredProps() {
  const f = S.propFilter; const q = f.q.trim().toLowerCase();
  return listOf(S.prop).filter((x) => (!f.kind || x.kind === f.kind) && (!f.status || x.status === f.status))
    .filter((x) => { if (!q) return true; const h = S.emps.get(x.holderId); return `${x.tag} ${x.name} ${x.serial || ""} ${h ? fullName(h) : ""}`.toLowerCase().includes(q); })
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
VIEWS.property = () => {
  const all = listOf(S.prop).filter((x) => x.status !== "RETIRED"); const f = S.propFilter; const list = filteredProps();
  const html = xpager(f, list.length, "pr", "items"); const page = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const value = all.reduce((a, x) => a + (x.value || 0), 0); const withLeavers = all.filter((x) => x.status === "ASSIGNED" && (S.emps.get(x.holderId)?.separated || S.offb.has(x.holderId))).length;
  return head(`${all.length} items in use or on hand`, "Company Assets", `<button class="btn btn-ghost" data-talx="property">Download register (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-edit-asset="">${icon("plus")}Add item</button>` : ""}`) + `
    <section class="stats">
      <div class="card stat"><span class="label">Assigned to people</span><span class="value">${all.filter((x) => x.status === "ASSIGNED").length}</span><span class="note t-muted">${all.filter((x) => x.status === "AVAILABLE").length} available in stock</span></div>
      <div class="card stat"><span class="label">Book value</span><span class="value" style="font-size:28px">${peso.format(value)}</span><span class="note t-muted">at purchase cost</span></div>
      <div class="card stat"><span class="label">Held by people leaving</span><span class="value">${withLeavers}</span><span class="note ${withLeavers ? "t-warn" : "t-ok"}">${withLeavers ? "collect during clearance" : "nothing to collect"}</span></div>
      <div class="card stat"><span class="label">In repair or lost</span><span class="value">${all.filter((x) => ["REPAIR", "LOST"].includes(x.status)).length}</span><span class="note t-muted">needs follow-up</span></div>
    </section>
    <section class="card"><div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="field" style="grid-column:span 2"><label for="pr-q">Search</label><input class="input" id="pr-q" type="search" value="${esc(f.q)}" placeholder="Tag, item, serial no. or holder" data-xfilter="pr:q"></div>
        <div class="field"><label for="pr-kind">Type</label><select class="input" id="pr-kind" data-xfilter="pr:kind">${opts(AKINDS.map(([k]) => [k, k]), f.kind, "All")}</select></div>
        <div class="field"><label for="pr-st">Status</label><select class="input" id="pr-st" data-xfilter="pr:status">${opts(Object.entries(ASTATUS).map(([k, v]) => [k, v[0]]), f.status, "All")}</select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Tag</th><th>Item</th><th>Held by</th><th>Since</th><th>Status</th><th class="num">Value</th></tr></thead><tbody>
      ${page.map((x) => { const h = S.emps.get(x.holderId); return `<tr class="go" data-asset="${x.id}" tabindex="0"><td><b>${esc(x.tag)}</b></td><td style="min-width:180px">${esc(x.name)}<div class="t-muted" style="font-size:13px">${esc(x.kind)}${x.serial ? " · " + esc(x.serial) : ""}</div></td>
        <td>${h && x.status === "ASSIGNED" ? personCell(h, esc(h.no) + (h.separated ? " · separated" : ""), 180) : '<span class="t-muted">—</span>'}</td><td class="t-muted" style="white-space:nowrap">${x.status === "ASSIGNED" ? fmtDate(x.since) : ""}</td><td><span class="chip ${ASTATUS[x.status][1]}">${ASTATUS[x.status][0]}</span></td><td class="num">${money(x.value)}</td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No items match.</td></tr>'}
      </tbody></table></div>${html}</section>`;
};
VIEWS.asset = () => {
  const x = S.prop.get(S.view.id); if (!x) return notFound("Company Assets", "Item", "property"); const h = S.emps.get(x.holderId); const ed = S.canEdit;
  return backLink('data-go="property"', "Company Assets") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="t-muted" style="font-size:13px;font-weight:700">${esc(x.tag)} · ${esc(x.kind)}</span><h1 style="font-size:26px;font-weight:800">${esc(x.name)}</h1>
        <div class="chips" style="align-items:center;font-size:14px"><span class="chip ${ASTATUS[x.status][1]}">${ASTATUS[x.status][0]}</span>${x.sample ? '<span class="chip c-warn">Sample</span>' : ""}${h && x.status === "ASSIGNED" ? `<span class="t-muted">with <button class="link" data-emp="${h.id}">${esc(fullName(h))}</button> since ${fmtDate(x.since)}</span>` : ""}</div></div>
      ${ed ? `<div class="head-actions"><button class="btn btn-ghost" data-edit-asset="${x.id}">Edit item</button></div>` : ""}</section>
    <div class="two">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Details</h2></div><dl class="facts">${tfact("Serial no.", esc(x.serial))}${tfact("Value", money(x.value))}${tfact("Bought", fmtDate(x.bought))}${tfact("Notes", esc(x.notes))}</dl></section>
        ${ed && x.status === "AVAILABLE" ? `<section class="card"><div class="card-head"><h2>Assign to someone</h2></div><form id="asg-form" class="form-grid" style="align-items:end" data-keep>${empPicker("as2-emp", "")}<div class="field"><label for="as2-d">Date issued</label><input class="input" id="as2-d" type="date" value="${todayISO()}" required></div><button class="btn btn-primary">Assign</button></form></section>` : ""}
        ${ed && x.status === "ASSIGNED" ? `<section class="card"><div class="card-head"><h2>Return</h2></div><form id="ret-form" class="form-grid" style="align-items:end" data-keep><div class="field"><label for="rt-d">Returned on</label><input class="input" id="rt-d" type="date" value="${todayISO()}" required></div><div class="field"><label for="rt-c">Condition</label><select class="input" id="rt-c">${opts([["Good", "Good"], ["Damaged", "Damaged, send to repair"], ["Not returned", "Not returned, mark lost"]], "Good")}</select></div><button class="btn btn-primary">Record return</button></form></section>` : ""}
        ${ed && x.status !== "ASSIGNED" ? `<section class="card"><div class="card-head"><h2>Change status</h2></div><div style="display:flex;gap:10px;flex-wrap:wrap">${Object.entries(ASTATUS).filter(([k]) => k !== x.status && k !== "ASSIGNED").map(([k, v]) => `<button class="btn btn-ghost btn-sm" data-asset-set="${x.id}:${k}">${k === "AVAILABLE" ? "Back in stock" : "Mark " + v[0].toLowerCase()}</button>`).join("")}</div></section>` : ""}
      </div>
      <section class="card"><div class="card-head"><h2>History</h2></div><ol class="timeline">${(x.hist || []).slice().reverse().map((t) => `<li><div style="font-size:14px">${esc(t.text)}</div><div class="t-muted" style="font-size:12px">${fmtDate(t.d)}</div></li>`).join("") || "<li>No history yet.</li>"}</ol></section>
    </div>`;
};
VIEWS.assetForm = () => {
  const x = S.view.id ? S.prop.get(S.view.id) : null; const v = x || { kind: "Laptop", bought: todayISO() };
  const F = (k, label, type = "text", req = false, extra = "") => `<div class="field"><label for="pf2-${k}">${label}${req ? ' <span class="req">*</span>' : ""}</label><input class="input" id="pf2-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
  const cancel = x ? `data-asset="${x.id}"` : 'data-go="property"';
  return backLink(cancel, "Back") + head("Company Assets", x ? esc(x.name) : "Add item") + `
    <form id="asset-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      <div class="field"><label for="pf2-kind">Type</label><select class="input" id="pf2-kind" name="kind">${opts(AKINDS.map(([k]) => [k, k]), v.kind)}</select></div>
      ${F("tag", "Asset tag", "text", true, `placeholder="${nextTag(v.kind)}"`)}${F("name", "Item", "text", true, 'placeholder="Lenovo ThinkPad E14"')}${F("serial", "Serial no.")}${F("value", "Value (PHP)", "number", false, 'min="0" step="0.01"')}${F("bought", "Bought", "date")}</div>
    <div class="field"><label for="pf2-notes">Notes</label><input class="input" id="pf2-notes" name="notes" value="${esc(v.notes || "")}"></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="pf2-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save item</button></div></form>`;
};
async function submitAsset(f) {
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#pf2-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const prev = S.view.id ? S.prop.get(S.view.id) : null; const tag = (val("tag") || nextTag(val("kind"))).toUpperCase();
  if (!val("name")) return fail("Enter the item.");
  if (listOf(S.prop).some((x) => x.tag === tag && x.id !== prev?.id)) return fail(`Tag ${tag} is already used.`);
  const x = { ...(prev || { id: uid(), status: "AVAILABLE", holderId: null, since: null, hist: [{ d: todayISO(), text: "Added to the register" }] }), tag, kind: val("kind"), name: val("name"), serial: val("serial") || null, value: Number(val("value")) || 0, bought: val("bought") || null, notes: val("notes") || null };
  try { await put("property", x); logActivity(`${prev ? "Updated" : "Added"} ${x.tag} ${x.name}`); toast("Item saved."); go("asset", { id: x.id }); } catch { fail("Couldn't save. Try again."); }
}
async function moveAsset(id, change, text) {
  const x = S.prop.get(id); await put("property", { ...x, ...change, hist: [...(x.hist || []), { d: change.since || todayISO(), text }] }); logActivity(`${x.tag}: ${text}`); render();
}
async function returnAsset(id, d = todayISO(), cond = "Good") {
  const x = S.prop.get(id); const h = S.emps.get(x.holderId); const who = h ? fullName(h) : "the holder";
  const status = cond === "Damaged" ? "REPAIR" : cond === "Not returned" ? "LOST" : "AVAILABLE";
  await put("property", { ...x, status, holderId: status === "LOST" ? x.holderId : null, since: null, hist: [...(x.hist || []), { d, text: cond === "Not returned" ? `Not returned by ${who}; marked lost` : `Returned by ${who}${cond === "Damaged" ? ", damaged" : ""}` }] });
  logActivity(`${x.tag} ${cond === "Not returned" ? "marked lost" : "returned"} by ${who}`); toast(cond === "Not returned" ? "Marked lost." : "Return recorded."); render();
}

/* ---------- dashboard, profile and calendar panels ---------- */
function talentDash() {
  const today = todayISO(); const open = listOf(S.jobs).filter((j) => j.status === "OPEN"); const slots = open.reduce((a, j) => a + Math.max(0, j.slots - jobHired(j)), 0);
  const ivs = upcomingInterviews().slice(0, 3); const prob = active().filter((e) => e.status === "PROBATIONARY" && regDue(e) <= addDays(today, 45)).sort((a, b) => a.hire.localeCompare(b.hire));
  const onb = listOf(S.onb).filter((o) => !o.done && S.emps.get(o.empId)).length; const off = listOf(S.offb).filter((o) => !o.closed && S.emps.get(o.empId)).length;
  const { T, pct } = compliance(active());
  return `<div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px">
    <section class="card"><div class="card-head"><h2>Hiring</h2><button class="link" data-go="hiring">Recruitment</button></div>
      <div class="stat"><span class="value">${slots}</span><span class="note t-blue">people to hire on ${open.length} open jobs · ${listOf(S.apps).filter(inProcess).length} applicants</span></div>
      ${ivs.length ? `<ul class="list" style="margin-top:12px;font-size:14px">${ivs.map(({ a, iv }) => `<li><button class="link" style="color:var(--ink);text-align:left" data-app="${a.id}"><b>${esc(appName(a))}</b></button> <span class="t-muted">${esc(iv.kind.toLowerCase())}, ${fmtDate(iv.d)} ${esc(iv.t || "")}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:12px 0 0;font-size:14px">No interviews scheduled.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Joining and leaving</h2><button class="link" data-go="lifecycle">Checklists</button></div>
      <div style="display:flex;gap:24px"><div class="stat"><span class="value">${onb}</span><span class="note t-muted">onboarding</span></div><div class="stat"><span class="value">${off}</span><span class="note t-muted">offboarding</span></div></div></section>
    <section class="card"><div class="card-head"><h2>Probation ending</h2><button class="link" data-perf-go="regular">Performance</button></div>
      ${prob.length ? `<ul class="list" style="font-size:14px">${prob.slice(0, 4).map((e) => `<li style="display:flex;justify-content:space-between;gap:8px"><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}">${esc(fullName(e))}</button><span class="chip ${regDue(e) < today ? "c-bad" : "c-warn"}">${fmtDate(regDue(e))}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">No probation ends in the next 45 days.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Training</h2><button class="link" data-go="training">Training</button></div>
      <div class="stat"><span class="value">${pct}%</span><span class="note ${T.EXPIRED ? "t-bad" : "t-muted"}">current · ${T.EXPIRED} expired · ${T.EXPIRING} expiring in 60 days</span></div></section>
  </div>`;
}
function talentUpcoming(today, in30) {
  const out = [];
  for (const { a, iv } of upcomingInterviews()) if (iv.d <= in30) out.push({ d: iv.d, t: "Interview", s: `${appName(a)}, ${S.jobs.get(a.jobId)?.title || ""}`, app: a.id });
  for (const o of listOf(S.offb)) { const e = S.emps.get(o.empId); if (!e || o.closed) continue;
    if (!e.separated && o.last >= today && o.last <= in30) out.push({ d: o.last, t: "Last working day", s: `${fullName(e)}, ${o.reason.toLowerCase()}`, id: e.id });
    if (e.separated && !o.released && addDays(o.last, 30) <= in30) out.push({ d: addDays(o.last, 30), t: "Final pay due", s: fullName(e), id: e.id }); }
  return out;
}
function talentPanels(e) {
  const held = heldBy(e.id); const courses = listOf(S.courses).filter((c) => needs(c, e) || c.recs?.[e.id]); const revs = reviewsOf(e.id); const cs = listOf(S.cases).filter((c) => c.empId === e.id).sort((a, b) => b.nte.localeCompare(a.nte));
  const o = S.offb.get(e.id); const on = S.onb.get(e.id); const ed = S.canEdit;
  return `${on && !on.done ? `<section class="card"><div class="card-head"><h2>Onboarding</h2><button class="link" data-onb="${e.id}">Open checklist</button></div>${progress(doneCount(on), on.items.length)}</section>` : ""}
    <section class="card"><div class="card-head"><h2>Training</h2></div>${courses.length ? `<ul class="list" style="gap:8px;font-size:14px">${courses.map((c) => { const st = needs(c, e) ? trainState(c, e) : "OK"; const r = c.recs?.[e.id];
      return `<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="link" style="color:var(--ink);text-align:left" data-course="${c.id}">${esc(c.title)}</button><span class="chip ${TSTATE[st][1]}">${r ? (r.exp ? `${st === "EXPIRED" ? "Expired" : "Until"} ${fmtDate(r.exp)}` : `Done ${fmtDate(r.d)}`) : "Missing"}</span></li>`; }).join("")}</ul>` : '<p class="t-muted" style="margin:0">No required training.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Performance</h2>${ed && !e.separated ? `<button class="btn btn-ghost btn-sm" data-new-review="${e.status === "PROBATIONARY" ? "REGULARIZATION" : "ANNUAL"}:${e.id}">New review</button>` : ""}</div>
      ${revs.length ? `<ul class="list" style="font-size:14px">${revs.slice(0, 3).map((r) => `<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="link" style="color:var(--ink);text-align:left" data-review="${r.id}">${esc(r.cycle || RTYPES[r.type])}</button>${r.status === "DONE" ? ratingChip(r.overall) : '<span class="chip c-blue">Draft</span>'}</li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">No reviews yet.</p>'}
      ${cs.length ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:14px"><b>Disciplinary cases</b><ul class="list" style="margin-top:8px">${cs.slice(0, 3).map((c) => `<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="link" style="color:var(--ink);text-align:left" data-case="${c.id}">${esc(c.offense)}</button><span class="chip ${caseStatus(c)[1]}">${caseStatus(c)[0]}</span></li>`).join("")}</ul></div>` : ""}
      ${ed && !e.separated ? `<div style="margin-top:12px"><button class="link" data-new-case="${e.id}">Open a disciplinary case</button></div>` : ""}</section>
    <section class="card"><div class="card-head"><h2>Company property (${held.length})</h2>${ed && !e.separated ? `<button class="link" data-go="property">Assign an item</button>` : ""}</div>
      ${held.length ? `<ul class="list" style="font-size:14px">${held.map((x) => `<li style="display:flex;justify-content:space-between;gap:8px"><button class="link" style="color:var(--ink);text-align:left" data-asset="${x.id}"><b>${esc(x.tag)}</b> ${esc(x.name)}</button><span class="t-muted">since ${fmtDate(x.since)}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">None issued.</p>'}</section>
    <section class="card"><div class="card-head"><h2>${o ? "Offboarding" : "Leaving the company"}</h2></div>
      ${o ? `<p style="margin:0 0 12px;font-size:14px"><span class="chip ${offStatus(o)[1]}">${offStatus(o)[0]}</span> ${esc(o.reason)}, last day ${fmtDate(o.last)}</p><button class="btn btn-ghost btn-sm" data-offb="${e.id}">Open offboarding</button>`
        : ed && !e.separated ? `<p class="t-muted" style="margin:0 0 12px;font-size:14px">Starts the clearance checklist and works out the final pay.</p><button class="btn btn-danger btn-sm" data-start-offb="${e.id}">Start offboarding</button>` : '<p class="t-muted" style="margin:0">—</p>'}
      <div style="margin-top:12px"><button class="link" data-letter="coe:${e.id}">Download Certificate of Employment</button></div></section>`;
}

/* ---------- CSV ---------- */
function talentExport(kind) {
  if (kind === "applicants") return offer(`applicants-${todayISO()}.csv`, toCSV([["Last Name", "First Name", "Job", "Project", "Stage", "Applied", "Source", "Mobile", "Email", "Expected Pay", "Requirements Received", "Next Interview"],
    ...listOf(S.apps).sort((a, b) => b.applied.localeCompare(a.applied)).map((a) => { const j = S.jobs.get(a.jobId); const nx = nextInterview(a); return [a.last, a.first, j?.title, S.projects.get(j?.projectId)?.name || "Head office", stageLabel(a.stage), a.applied, a.source, a.mobile, a.email, a.expRate, PRE_REQS.filter(([k]) => a.reqs?.[k]).length, nx ? `${nx.d} ${nx.t || ""}` : ""]; })]));
  if (kind === "training") { const { rows } = compliance(active()); return offer(`training-gaps-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Position", "Project", "Course", "Status", "Completed", "Expires"],
    ...rows.flatMap((r) => r.items.filter((i) => i.st !== "OK").map((i) => [r.e.no, fullName(r.e), pos(r.e.posId)?.title, S.projects.get(r.e.projectId)?.name || "Head office", i.c.title, TSTATE[i.st][0], i.c.recs?.[r.e.id]?.d || "", i.c.recs?.[r.e.id]?.exp || ""]))])); }
  if (kind === "property") return offer(`asset-register-${todayISO()}.csv`, toCSV([["Tag", "Item", "Type", "Serial No", "Status", "Held By", "Employee No", "Since", "Value", "Bought"],
    ...filteredProps().map((x) => { const h = S.emps.get(x.holderId); return [x.tag, x.name, x.kind, x.serial, ASTATUS[x.status][0], h && x.status === "ASSIGNED" ? fullName(h) : "", h && x.status === "ASSIGNED" ? h.no : "", x.since, x.value, x.bought]; })]));
  if (kind === "reviews") return offer(`reviews-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Review", "Cycle", "Reviewer", "Date", "Status", "Overall", "Rating", "Recommendation"],
    ...listOf(S.reviews).filter((r) => S.emps.get(r.empId)).sort((a, b) => (b.at || "").localeCompare(a.at || "")).map((r) => { const e = S.emps.get(r.empId); return [e.no, fullName(e), RTYPES[r.type], r.cycle, empName(r.reviewerId), r.at, r.status === "DONE" ? "Completed" : "Draft", r.overall, r.overall ? ratingOf(r.overall)[1] : "", RECS[r.rec]]; })]));
}

/* ---------- events for talent and lifecycle ---------- */
// Destructive buttons ask for a second tap instead of a browser dialog, which embedded pages may block.
const armed = (t) => { if (t.dataset.armed === "1") return true; t.dataset.armed = "1"; const orig = t.innerHTML; t.textContent = "Tap again to delete"; setTimeout(() => { if (t.isConnected) { t.dataset.armed = ""; t.innerHTML = orig; } }, 4000); return false; };
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-hire-tab],[data-job],[data-edit-job],[data-new-job],[data-app],[data-new-app],[data-edit-app],[data-app-stage],[data-iv],[data-life-tab],[data-onb],[data-offb],[data-sep-now],[data-return],[data-perf-tab],[data-perf-go],[data-review],[data-new-review],[data-del-review],[data-case],[data-new-case],[data-train-tab],[data-course],[data-edit-course],[data-del-course],[data-del-rec],[data-asset],[data-edit-asset],[data-asset-set],[data-talx],[data-letter],[data-xpage],[data-tpl-del],[data-start-offb],[data-rc-all]");
  if (!t) return; const d = t.dataset; const has = (a) => t.hasAttribute("data-" + a);
  try {
    if (d.hireTab) { S.hireTab = d.hireTab; render(); return; }
    if (d.job) { go("job", { id: d.job }); return; }
    if (d.editJob) { go("jobForm", { id: d.editJob }); return; }
    if (has("new-job")) { const [proj, pid, n] = d.newJob.split(":"); go("jobForm", { pre: proj ? { proj, pid, n: Number(n) } : {} }); return; }
    if (d.app) { go("applicant", { id: d.app }); return; }
    if (has("new-app")) { go("applicantForm", { job: d.newApp || "" }); return; }
    if (d.editApp) { go("applicantForm", { id: d.editApp }); return; }
    if (d.appStage) { const [id, st] = d.appStage.split(":"); t.disabled = true; await setStage(id, st); return; }
    if (d.iv) { const [aid, iid, res] = d.iv.split(":"); const a = S.apps.get(aid); await put("applicants", { ...a, ivs: a.ivs.map((i) => (i.id === iid ? { ...i, result: res } : i)) }); logActivity(`Interview result for ${appName(a)}: ${res === "PASSED" ? "passed" : "did not pass"}`); render(); return; }
    if (d.lifeTab) { S.lifeTab = d.lifeTab; render(); return; }
    if (d.onb) { go("onboard", { id: d.onb }); return; }
    if (d.offb) { go("offboard", { id: d.offb }); return; }
    if (has("start-offb")) { const [emp, reason] = (d.startOffb || "").split("|"); go("offboardForm", { emp: emp || null, reason: reason || null }); return; }
    if (d.sepNow) { t.disabled = true; await markSeparated(d.sepNow); return; }
    if (d.return) { t.disabled = true; await returnAsset(d.return); return; }
    if (d.perfTab) { S.perfTab = d.perfTab; render(); return; }
    if (d.perfGo) { S.perfTab = d.perfGo; go("perf"); return; }
    if (d.review) { go("review", { id: d.review }); return; }
    if (has("new-review")) { const [type, emp] = (d.newReview || "").split(":"); go("review", { type: type || "ANNUAL", emp: emp || null }); return; }
    if (d.delReview) { if (!armed(t)) return; await drop("reviews", d.delReview); logActivity("Deleted a performance review"); toast("Review deleted."); go("perf"); return; }
    if (d.case) { go("caseView", { id: d.case }); return; }
    if (has("new-case")) { go("caseForm", { emp: d.newCase || "" }); return; }
    if (d.trainTab) { S.trainTab = d.trainTab; render(); return; }
    if (d.course) { go("course", { id: d.course }); return; }
    if (has("edit-course")) { go("courseForm", { id: d.editCourse || null }); return; }
    if (d.delCourse) { if (!armed(t)) return; const c = S.courses.get(d.delCourse); await drop("courses", c.id); logActivity(`Deleted course ${c.title}`); toast("Course deleted."); go("trcourses"); return; }
    if (d.delRec) { const [cid, eid] = d.delRec.split(":"); const c = S.courses.get(cid); const recs = { ...(c.recs || {}) }; delete recs[eid]; await put("courses", { ...c, recs }); logActivity(`Removed a ${c.title} record for ${empName(eid)}`); render(); return; }
    if (d.asset) { go("asset", { id: d.asset }); return; }
    if (has("edit-asset")) { go("assetForm", { id: d.editAsset || null }); return; }
    if (d.assetSet) { const [id, st] = d.assetSet.split(":"); await moveAsset(id, { status: st, holderId: null, since: null }, st === "AVAILABLE" ? "Back in stock" : `Marked ${ASTATUS[st][0].toLowerCase()}`); toast("Status changed."); return; }
    if (d.talx) return talentExport(d.talx);
    if (d.letter) { const [k, id] = d.letter.split(":"); return letter(k, id); }
    if (d.xpage) { const [k, n] = d.xpage.split(":"); const f = { tr: S.trainFilter, pr: S.propFilter }[k]; if (!f) return; f.page += Number(n); render(); return; }
    if (d.tplDel) { const [key, n] = d.tplDel.split(":"); const T = TSET(); const next = { ...T, [key]: T[key].filter((_, i) => i !== Number(n)) }; await S.db.doc("org/talent").set(JSON.parse(JSON.stringify(next))); S.talent = next; logActivity(`Removed a step from the ${key === "onboard" ? "onboarding" : "offboarding"} checklist`); render(); return; }
    if (has("rc-all")) { document.querySelectorAll('input[name="rc-emp"]').forEach((x) => (x.checked = true)); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return; const t = ev.target; if (!t.matches?.("tr.go")) return;
  const d = t.dataset; if (d.job) go("job", { id: d.job }); else if (d.app) go("applicant", { id: d.app }); else if (d.onb) go("onboard", { id: d.onb }); else if (d.offb) go("offboard", { id: d.offb });
  else if (d.review) go("review", { id: d.review }); else if (d.case) go("caseView", { id: d.case }); else if (d.asset) go("asset", { id: d.asset });
});
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.xfilter) { const [k, field] = t.dataset.xfilter.split(":"); const f = { tr: S.trainFilter, pr: S.propFilter }[k]; if (!f) return; f[field] = t.value; f.page = 1; render(); return; }
  if (t.dataset.pick) { const q = t.value.toLowerCase(); const sel = document.getElementById(t.dataset.pick); if (sel) sel.innerHTML = leaveEmpOptions(active().filter((e) => `${fullName(e)} ${e.no}`.toLowerCase().includes(q)).sort((a, b) => a.last.localeCompare(b.last))); return; }
  if (t.id === "rc-q" || t.id === "rc-need") { const c = S.courses.get(S.view.id); if (c) $("#rc-list").innerHTML = rcList(c); return; }
  if (t.closest("#review-form")) { const o = $("#rv-overall"); if (o) o.innerHTML = ratingChip(reviewDraft().overall); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.hasAttribute("data-hire-job")) { S.hireJob = t.value; render(); return; }
  if (t.hasAttribute("data-cycle")) { S.cycle = t.value; render(); return; }
  if (t.id === "rc-need") { const c = S.courses.get(S.view.id); if (c) $("#rc-list").innerHTML = rcList(c); return; }
  if (t.id === "cf-scope") { $("#cf-pos").hidden = t.value !== "POS"; return; }
  if (t.id === "jf-posId") { const p = pos(t.value); if (p) { const ti = $("#jf-title"); if (!ti.value) ti.value = p.title; if (p.deptId) $("#jf-deptId").value = p.deptId; } return; }
  if (t.id === "pf2-kind") { const tag = $("#pf2-tag"); if (tag) tag.placeholder = nextTag(t.value); return; }
  if (!S.canEdit) return;
  try {
    if (t.dataset.check) { const [kind, id, i] = t.dataset.check.split(":"); t.disabled = true; await toggleCheck(kind, id, Number(i), t.checked); return; }
    if (t.dataset.req) { const [id, k] = t.dataset.req.split(":"); const a = S.apps.get(id); const reqs = { ...(a.reqs || {}) }; if (t.checked) reqs[k] = todayISO(); else delete reqs[k]; await put("applicants", { ...a, reqs }); render(); return; }
    if (t.id === "ap-file" && t.files[0]) {
      const file = t.files[0]; if (file.size > 10 * 1024 * 1024) { toast("Files must be 10 MB or smaller."); return; }
      const up = await S.assets.upload(file); const a = S.apps.get(S.view.id); await put("applicants", { ...a, resume: { id: up.id, name: file.name.slice(0, 120) } }); logActivity(`Uploaded a resume for ${appName(a)}`); toast("Resume uploaded."); render(); return;
    }
  } catch (x) { toast(x?.code === "unsupported_type" ? "Use a PDF, JPG, PNG or WebP file." : "Couldn't save. Try again."); render(); }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; ev.preventDefault(); if (!S.canEdit) return;
  try {
    if (f.id === "job-form") return await submitJob(f);
    if (f.id === "app-form") return await submitApplicant(f);
    if (f.id === "hire-form") return await hireApplicant();
    if (f.id === "iv-form") {
      const a = S.apps.get(S.view.id); const iv = { id: uid(), d: $("#iv-d").value, t: $("#iv-t").value, kind: $("#iv-kind").value, by: $("#iv-by").value.trim() || null, notes: $("#iv-notes").value.trim() || null, result: "PENDING" };
      if (!iv.d) return; const stage = stageIdx(a.stage) < stageIdx("INTERVIEW") ? "INTERVIEW" : a.stage;
      await put("applicants", { ...a, ivs: [...(a.ivs || []), iv], stage, stageAt: stage !== a.stage ? todayISO() : a.stageAt }); logActivity(`Scheduled a ${iv.kind.toLowerCase()} for ${appName(a)} on ${fmtDate(iv.d)}`); toast("Interview scheduled."); render(); return;
    }
    if (f.id === "offer-form") { const a = S.apps.get(S.view.id); const offerRec = { rate: Number($("#of-rate").value) || 0, start: $("#of-start").value || null, status: $("#of-status").value };
      const stage = offerRec.status !== "DRAFT" && stageIdx(a.stage) < stageIdx("OFFER") ? "OFFER" : a.stage;
      await put("applicants", { ...a, offer: offerRec, stage, stageAt: stage !== a.stage ? todayISO() : a.stageAt }); logActivity(`Saved a job offer for ${appName(a)}`); toast("Offer saved."); render(); return; }
    if (f.id === "onb-new-form") { const e = S.emps.get($("#on-emp").value); if (!e) return; await startOnboarding(e); logActivity(`Started onboarding for ${fullName(e)}`); go("onboard", { id: e.id }); return; }
    if (f.id === "offb-form") return await submitOffboard(f);
    if (f.id === "fp-form") { const o = S.offb.get(S.view.id); const num = (id) => { const v = $(id).value.trim(); return v === "" ? null : Math.max(0, Number(v) || 0); };
      await put("offboard", { ...o, pay: { conv: num("#fp-conv"), paid13: num("#fp-paid13"), sal: num("#fp-sal") || 0, loans: Object.fromEntries([...document.querySelectorAll('[name="fp-loan"]')].map((x) => [x.value, x.checked])), other: num("#fp-other") || 0, otherLabel: $("#fp-otherl").value.trim() || null, acct: num("#fp-acct"), ded: num("#fp-ded") || 0, dedLabel: $("#fp-dedl").value.trim() || null } });
      toast("Final pay updated."); render(); return; }
    if (f.id === "rel-form") { const o = S.offb.get(S.view.id); const d = $("#rel-d").value || todayISO(); const items = o.items.map((i) => (i.k === "finalpay" && !i.done ? { ...i, done: d } : i));
      const fe = S.emps.get(o.empId); const fp = finalPay(fe, o); const frozen = JSON.parse(JSON.stringify({ ...fp, ann: { ...fp.ann }, at: d }));
      await put("offboard", { ...o, items, released: d, final: frozen, closed: items.every((i) => i.done) ? todayISO() : null });
      // The 13th month paid with the final pay is recorded as a release, so the December release doesn't pay it again.
      if (fp.t13 > 0) { const y = o.last.slice(0, 4); try { await saveT13(y, o.empId, { pays: [...(t13Rec(fe, y).pays || []), { d, amt: fp.t13, note: "Paid with the final pay", by: S.myId || "hr", fp: true }] }); } catch {} }
      logActivity(`Released final pay of ${peso.format(fp.net)} to ${empName(o.empId)}`); toast("Final pay marked released."); render(); return; }
    if (f.id === "review-form") return await submitReview(ev.submitter?.value === "DRAFT" ? "DRAFT" : "DONE");
    if (f.id === "case-form") return await submitCase();
    if (f.classList.contains("case-step")) return await submitCaseStep(f.dataset.step);
    if (f.id === "course-form") return await submitCourse(f);
    if (f.id === "rc-form") return await submitCompletions();
    if (f.id === "asset-form") return await submitAsset(f);
    if (f.id === "asg-form") { const e = S.emps.get($("#as2-emp").value); const dd = $("#as2-d").value || todayISO(); if (!e) { toast("Choose the employee."); return; } await moveAsset(S.view.id, { status: "ASSIGNED", holderId: e.id, since: dd }, `Issued to ${fullName(e)}`); toast(`Assigned to ${fullName(e)}.`); return; }
    if (f.id === "ret-form") return await returnAsset(S.view.id, $("#rt-d").value || todayISO(), $("#rt-c").value);
    if (f.classList.contains("tpl-form")) { const key = f.dataset.tpl; const label = f.elements.label.value.trim(); const who = f.elements.who.value.trim() || "HR"; if (!label) return;
      const T = TSET(); const next = { ...T, [key]: [...T[key], { k: uid(), label, who }] }; await S.db.doc("org/talent").set(JSON.parse(JSON.stringify(next))); S.talent = next; logActivity(`Added "${label}" to the ${key === "onboard" ? "onboarding" : "offboarding"} checklist`); toast("Step added."); render(); return; }
    if (f.id === "conv-form") { const next = { ...TSET(), convertVL: $("#conv").value }; await S.db.doc("org/talent").set(JSON.parse(JSON.stringify(next))); S.talent = next; logActivity("Updated the leave conversion policy"); toast("Saved."); render(); return; }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});
