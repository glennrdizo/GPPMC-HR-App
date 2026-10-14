/* Contract and job offer formats (Glenn 2026-10-14): Contracts - Head Office / Projects and Job Offer - Head Office / Projects,
   indented under Contracts and Job offers. HR keeps a fill-in-the-blanks format for each; picking an employee or applicant fills
   every {{Field}} from the records, asks only for what is missing, and downloads the finished document. Formats live in org/doctpl. */
const DT_KINDS = {
  contracts_ho: { kind: "ctr", scope: "ho", key: "ctr_ho", label: "Contracts - Head Office", short: "Head Office contract" },
  contracts_prj: { kind: "ctr", scope: "prj", key: "ctr_prj", label: "Contracts - Projects", short: "Project contract" },
  joboffer_ho: { kind: "jo", scope: "ho", key: "jo_ho", label: "Job Offer - Head Office", short: "Head Office job offer" },
  joboffer_prj: { kind: "jo", scope: "prj", key: "jo_prj", label: "Job Offer - Projects", short: "Project job offer" },
};
{ const g = NAV.find(([n]) => n === "Employees");
  for (const [parent, ho, prj] of [["contracts", "contracts_ho", "contracts_prj"], ["joboffer", "joboffer_ho", "joboffer_prj"]]) {
    const it = g?.[1].find(([v]) => v === parent); if (it) it[3] = [[ho, DT_KINDS[ho].label, "building"], [prj, DT_KINDS[prj].label, "project"]]; }
  // Glenn 2026-10-14: Contracts and Job offers sit in People, right before Offer letter requests.
  const ppl = NAV.find(([n]) => n === "People");
  if (g && ppl) { const moved = ["contracts", "joboffer"].map((v) => { const i = g[1].findIndex(([x]) => x === v); return i >= 0 ? g[1].splice(i, 1)[0] : null; }).filter(Boolean);
    const at = ppl[1].findIndex(([v]) => v === "olr"); ppl[1].splice(at >= 0 ? at : ppl[1].length, 0, ...moved); }
  Object.assign(SECTION_OF, { contracts_ho: "contracts_ho", contracts_prj: "contracts_prj", joboffer_ho: "joboffer_ho", joboffer_prj: "joboffer_prj" }); }
S.doctpl = null; S.dtPick = {}; S.dtVals = {}; S.dtEdit = null;
{ const b = bootIO; bootIO = (db) => { b(db); db.doc("org/doctpl").onSnapshot((d) => { S.doctpl = d.exists ? d.data() : {}; refresh(); }, () => {}); }; }

/* Fields the app fills by itself. Names are matched without regard to case, spaces or punctuation. */
// Common other spellings of a blank in Word formats, so {{Full name}} or {{Salary}} fill like {{Employee name}} or {{Basic pay}}.
const DT_ALIAS = { fullname: "employeename", name: "employeename", employee: "employeename", employeesname: "employeename", empno: "employeeno", employeenumber: "employeeno", idno: "employeeno", date: "datetoday", today: "datetoday", salary: "basicpay", monthlysalary: "basicpay", rate: "basicpay", designation: "position", jobtitle: "position", company: "companyname", department: "department", dept: "department" };
const dtNorm = (s) => { const k = String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return DT_ALIAS[k] || k; };
const dtPayWord = (t) => (t === "DAILY" ? "a day" : "a month");
const dtMoney = (n) => (n ? peso.format(n) : "");
function dtCommon() {
  const T = TSET(); const hr = active().find((e) => pos(e.posId)?.title === "HR Manager");
  return { "Date today": fmtDate(todayISO()), "Company name": S.org?.companyName && !/^hr system$/i.test(S.org.companyName) ? S.org.companyName : CO_DEFAULT, "Company address": T.hoAddress || "", "HR Manager": hr ? fullName(hr) : "" };
}
function dtEmpFields(e) {
  const p = e.projectId ? S.projects.get(e.projectId) : null; const c = typeof ctrOf === "function" ? ctrOf(e) : {}; const allow = 2 * (Array.isArray(e.allow) ? e.allow.reduce((s, x) => s + (Number(x.amt ?? x.amount) || 0), 0) : Number(e.allow) || 0); // per cutoff → a month
  return { ...dtCommon(), "Employee name": fullName(e), "First name": e.first, "Middle name": e.middle || "", "Last name": e.last, "Employee no": e.no, "Position": pos(e.posId)?.title || e.projectRole || "",
    "Department": dept(e.deptId)?.name || "", "Project": p?.name || "", "Project code": p?.code || "", "Work location": p ? [p.name, p.location].filter(Boolean).join(", ") : TSET().hoAddress || "Head Office", "Address": e.address || "",
    "Employment status": STATUS[e.status]?.[0] || "", "Start date": fmtDate(c?.start || e.hire), "Hire date": fmtDate(e.hire), "End date": c?.end ? fmtDate(c.end) : e.projectUntil ? fmtDate(e.projectUntil) : "",
    "Basic pay": dtMoney(e.basicPay), "Pay basis": dtPayWord(e.payType), "Daily rate": e.payType === "DAILY" ? dtMoney(e.basicPay) : "", "Monthly rate": e.payType === "DAILY" ? "" : dtMoney(e.basicPay), "Allowance": allow ? dtMoney(allow) : "",
    "Civil status": e.civil || "", "Birth date": fmtDate(e.birth), "SSS": e.sss || "", "PhilHealth": e.philhealth || "", "Pag-IBIG": e.pagibig || "", "TIN": e.tin || "", "Supervisor": e.supervisorId && S.emps.get(e.supervisorId) ? fullName(S.emps.get(e.supervisorId)) : "" };
}
function dtAppFields(a) {
  const j = S.jobs.get(a.jobId); const p = j?.projectId ? S.projects.get(j.projectId) : null; const r = a.olr || {}; const o = a.offer || {}; const payType = r.payType || j?.payType;
  return { ...dtCommon(), "Applicant name": [a.first, a.middle, a.last].filter(Boolean).join(" "), "Employee name": [a.first, a.middle, a.last].filter(Boolean).join(" "), "First name": a.first, "Middle name": a.middle || "", "Last name": a.last, "Address": a.address || "",
    "Position": r.title || pos(j?.posId)?.title || j?.title || "", "Department": dept(j?.deptId)?.name || "", "Project": p?.name || "", "Work location": r.site || (p ? [p.name, p.location].filter(Boolean).join(", ") : TSET().hoAddress || "Head Office"),
    "Employment status": STATUS[r.empType || j?.empType]?.[0] || "", "Start date": fmtDate(r.start || o.start), "Basic pay": dtMoney(r.rate || o.rate || j?.rate), "Pay basis": dtPayWord(payType),
    "Daily rate": payType === "DAILY" ? dtMoney(r.rate || o.rate || j?.rate) : "", "Monthly rate": payType === "DAILY" ? "" : dtMoney(r.rate || o.rate || j?.rate), "Allowance": r.allow ? dtMoney(r.allow) : "", "Reply by": fmtDate(addDays(todayISO(), 5)) };
}
const DT_FIELDS = { ctr: Object.keys(dtEmpFields({ first: "", last: "", no: "" })), jo: Object.keys(dtAppFields({ first: "", last: "" })) };

/* Starting formats; HR replaces them with the company's own wording. */
const DT_SAMPLE = {
  ctr_ho: `# PROBATIONARY EMPLOYMENT CONTRACT

This contract is made on {{Date today}} between {{Company name}}, with office at {{Company address}} (the "Company"), and {{Employee name}}, of legal age, {{Civil status}}, residing at {{Address}} (the "Employee").

1. Position. The Employee is hired as {{Position}} in the {{Department}} department, reporting to {{Supervisor}}.

2. Term. Employment starts on {{Start date}} on probation for up to six (6) months. The standards for regularization have been explained to the Employee on hiring.

3. Pay. Basic pay is {{Basic pay}} {{Pay basis}}, paid twice a month, with allowance of {{Allowance}} a month, less lawful deductions.

4. Benefits. SSS, PhilHealth and Pag-IBIG coverage, 13th month pay, service incentive leave and other benefits under company policy.

5. Company rules. The Employee agrees to follow the Company's Code of Conduct and policies, and to keep company information confidential.

Signed on {{Date today}}.

{{Company name}}
By: {{HR Manager}}, HR Manager

Conforme:
{{Employee name}}
Employee no. {{Employee no}}`,
  ctr_prj: `# PROJECT EMPLOYMENT CONTRACT

This contract is made on {{Date today}} between {{Company name}} (the "Company") and {{Employee name}}, residing at {{Address}} (the "Employee").

1. Project. The Employee is hired as {{Position}} for the {{Project}} project at {{Work location}}.

2. Term. Employment starts on {{Start date}} and ends on {{End date}}, or on completion of the project or of the phase of work assigned, whichever comes first. The Employee was told of the project's duration and scope when hired.

3. Pay. Basic pay is {{Basic pay}} {{Pay basis}}, with allowance of {{Allowance}}, less lawful deductions.

4. Benefits. SSS, PhilHealth and Pag-IBIG coverage, 13th month pay and service incentive leave as the law requires.

5. Site rules. The Employee agrees to follow site safety rules, the Company's Code of Conduct, and the instructions of the project supervisor.

Signed on {{Date today}}.

{{Company name}}
By: {{HR Manager}}, HR Manager

Conforme:
{{Employee name}}`,
  jo_ho: `# JOB OFFER

{{Date today}}

{{Applicant name}}
{{Address}}

Dear {{First name}},

We are pleased to offer you the position of {{Position}} at {{Company name}}, {{Department}} department, under these terms:

Employment status: {{Employment status}}
Basic pay: {{Basic pay}} {{Pay basis}}
Allowance: {{Allowance}}
Start date: {{Start date}}
Work location: {{Work location}}

This offer depends on your completion of the pre-employment requirements. Please sign below to accept on or before {{Reply by}}.

Sincerely,
{{HR Manager}}
HR Manager

Accepted by: ______________________ Date: __________
{{Applicant name}}`,
  jo_prj: `# JOB OFFER (PROJECT)

{{Date today}}

{{Applicant name}}
{{Address}}

Dear {{First name}},

We are pleased to offer you the position of {{Position}} for our {{Project}} project at {{Work location}}, under these terms:

Employment status: {{Employment status}}
Basic pay: {{Basic pay}} {{Pay basis}}
Allowance: {{Allowance}}
Start date: {{Start date}}

Your employment is for the duration of the project or the phase of work assigned to you. This offer depends on your completion of the pre-employment requirements. Please sign below to accept on or before {{Reply by}}.

Sincerely,
{{HR Manager}}
HR Manager

Accepted by: ______________________ Date: __________
{{Applicant name}}`,
};
const dtTpl = (key) => S.doctpl?.[key] || null;
const dtBody = (key) => dtTpl(key)?.body || DT_SAMPLE[key];
const dtSlots = (body) => [...new Set([...String(body).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim()))];
function dtFill(body, vals) { const by = {}; for (const [k, v] of Object.entries(vals)) by[dtNorm(k)] = v; return String(body).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k) => by[dtNorm(k)] ?? ""); }
function dtHtml(text) {
  return String(text).split(/\n{2,}/).map((blk) => { const t = blk.trim(); if (!t) return ""; if (/^#\s/.test(t)) return `<h2>${esc(t.replace(/^#\s+/, ""))}</h2>`; return `<p>${esc(t).replace(/\n/g, "<br>")}</p>`; }).join("");
}

/* People the format can be filled for: contracts use employees, job offers use applicants; Head Office has no project, Projects has one. */
function dtPeople(d) {
  if (d.kind === "ctr") return active().filter((e) => (d.scope === "prj") === !!e.projectId).sort((a, b) => a.last.localeCompare(b.last)).map((e) => [e.id, `${fullName(e)} · ${e.no}`]);
  return listOf(S.apps || new Map()).filter((a) => { const j = S.jobs.get(a.jobId); return (d.scope === "prj") === !!j?.projectId && !["REJECTED", "WITHDRAWN"].includes(a.stage); })
    .sort((a, b) => (b.applied || "").localeCompare(a.applied || "")).map((a) => [a.id, `${appName(a)} · ${S.jobs.get(a.jobId)?.title || ""}${a.olr ? ` · offer ${OLR[a.olr.status]?.[0].toLowerCase() || ""}` : ""}`]);
}
function dtValsFor(d, id) { if (!id) return dtCommon(); if (d.kind === "ctr") { const e = S.emps.get(id); return e ? dtEmpFields(e) : dtCommon(); } const a = S.apps.get(id); return a ? dtAppFields(a) : dtCommon(); }

function dtPage(v) {
  const d = DT_KINDS[v]; const ed = S.canEdit; const tpl = dtTpl(d.key); const body = dtBody(d.key); const slots = dtSlots(body);
  const pick = S.dtPick[v] || ""; const auto = dtValsFor(d, pick); const autoN = {}; for (const [k, x] of Object.entries(auto)) autoN[dtNorm(k)] = x;
  const typed = S.dtVals[v] || {}; const missing = slots.filter((s) => !autoN[dtNorm(s)]); const people = dtPeople(d);
  const editing = S.dtEdit === v;
  const known = DT_FIELDS[d.kind];
  const tplCard = `<section class="card"><div class="card-head"><h2>Format</h2>${tpl ? `<span class="chip c-ok">Company format · saved ${fmtDate(tpl.at)}</span>` : '<span class="chip c-warn">Sample format, replace with yours</span>'}
      ${ed && !editing ? `<button class="btn btn-ghost btn-sm" data-dt-edit="${v}">Edit format</button>` : ""}</div>
    ${editing ? `<form class="dt-form stack" data-dt="${v}" style="gap:10px" data-keep>
        <p class="t-muted" style="margin:0;font-size:14px">Paste your format from Word. Put each blank in double curly braces, like <code>{{Employee name}}</code>. Start a line with <code># </code> for a centered title. Click a field below to insert it.</p>
        <div class="dt-chips">${known.map((k) => `<button type="button" class="chip c-blue" data-dt-ins="${esc(k)}">{{${esc(k)}}}</button>`).join("")}</div>
        <textarea class="input" id="dt-body" rows="22" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:13.5px;line-height:1.5">${esc(body)}</textarea>
        <p class="t-muted" style="margin:0;font-size:13px">Any other blank you add, like <code>{{Probation standards}}</code>, is asked for each time you fill the format.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary">Save format</button><button type="button" class="btn btn-ghost" data-dt-cancel>Cancel</button>${tpl ? `<button type="button" class="btn btn-ghost" data-dt-sample="${v}">Start over from the sample</button>` : ""}</div></form>`
      : `<div class="dt-doc dt-tpl">${dtHtml(body).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k) => `<mark>${k}</mark>`)}</div>
        <p class="t-muted" style="margin:10px 0 0;font-size:13px">${slots.length} blank${slots.length === 1 ? "" : "s"}: ${slots.filter((s) => known.some((k) => dtNorm(k) === dtNorm(s))).length} filled from the records, ${slots.filter((s) => !known.some((k) => dtNorm(k) === dtNorm(s))).length} typed in each time.</p>`}</section>`;
  const fillCard = `<section class="card"><div class="card-head"><h2>Fill in for ${d.kind === "ctr" ? "an employee" : "an applicant"}</h2></div>
    <div class="form-grid" style="align-items:end"><div class="field" style="grid-column:1/-1"><label for="dt-who">${d.kind === "ctr" ? `${d.scope === "prj" ? "Project" : "Head Office"} employee` : `${d.scope === "prj" ? "Project" : "Head Office"} applicant`}</label>
      <select class="input" id="dt-who" data-dt-who="${v}">${opts(people, pick, people.length ? "Choose…" : d.kind === "ctr" ? "No employees here yet" : "No applicants here yet")}</select></div>
      ${missing.map((s, i) => `<div class="field"><label for="dt-in-${v}-${i}">${esc(s)}</label><input class="input" id="dt-in-${v}-${i}" data-dt-val="${v}|${esc(s)}" value="${esc(typed[s] || "")}" placeholder="Type it here"></div>`).join("")}</div>
    ${pick ? `<div class="dt-doc" id="dt-prev" style="margin-top:14px">${dtHtml(dtFill(body, { ...auto, ...typed })) || ""}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-gold" data-dt-dl="${v}">${icon("download", 16)}Download ${d.kind === "ctr" ? "contract" : "job offer"}</button>
        ${missing.filter((s) => !typed[s]).length ? `<span class="t-muted" style="font-size:13px;align-self:center">${missing.filter((s) => !typed[s]).length} blank${missing.filter((s) => !typed[s]).length === 1 ? "" : "s"} still empty</span>` : ""}</div>` : ""}</section>`;
  const list = (() => {
    const all = { emps: S.emps, apps: S.apps }; let h = "";
    try {
      if (d.kind === "ctr") { S.emps = new Map([...S.emps].filter(([, e]) => (d.scope === "prj") === !!e.projectId)); h = VIEWS.contracts(); }
      else { S.apps = new Map([...S.apps].filter(([, a]) => (d.scope === "prj") === !!S.jobs.get(a.jobId)?.projectId)); h = VIEWS.olr(); }
    } finally { S.emps = all.emps; S.apps = all.apps; }
    return h.replace(/^[\s\S]*?<\/header>/, "").replace(/<div class="page-head[\s\S]*?<\/div>\s*<\/div>/, "");
  })();
  return head(d.kind === "ctr" ? "Contracts" : "Job offers", esc(d.label)) + `<div class="two">${tplCard}${fillCard}</div>` + `<h2 style="margin:22px 0 10px;font-size:20px">${d.kind === "ctr" ? `${d.scope === "prj" ? "Project" : "Head Office"} employees' contracts` : `${d.scope === "prj" ? "Project" : "Head Office"} offer letter requests`}</h2>` + list;
}
for (const v of Object.keys(DT_KINDS)) VIEWS[v] = () => dtPage(v);
{ const st = document.createElement("style"); st.textContent = `.dt-doc{border:1px solid var(--line);border-radius:12px;padding:22px 24px;background:#fff;color:#14213D;font-family:Georgia,"Times New Roman",serif;font-size:14.5px;line-height:1.6;max-height:520px;overflow:auto}
.dt-doc h2{text-align:center;font-size:17px;letter-spacing:.06em;margin:0 0 14px}.dt-doc p{margin:0 0 10px}.dt-doc mark{background:#F6EBD3;color:#7A5A12;border-radius:4px;padding:0 3px;font-family:system-ui,sans-serif;font-size:12.5px;font-weight:700}
.dt-chips{display:flex;flex-wrap:wrap;gap:6px}.dt-chips .chip{border:0;cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:12px}`; document.head.appendChild(st); }

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-dt-edit],[data-dt-cancel],[data-dt-ins],[data-dt-sample],[data-dt-dl]"); if (!t) return; ev.preventDefault(); const d = t.dataset;
  if (d.dtEdit) { S.dtEdit = d.dtEdit; render(); $("#dt-body")?.focus(); return; }
  if (d.dtCancel !== undefined) { S.dtEdit = null; render(); return; }
  if (d.dtIns) { const ta = $("#dt-body"); if (!ta) return; const s = ta.selectionStart ?? ta.value.length; const ins = `{{${d.dtIns}}}`; ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; return; }
  if (d.dtSample) { const k = DT_KINDS[d.dtSample]; if (!await askConfirm(`Replace the saved ${k.short} format with the sample? Your wording will be lost.`, "Use the sample", true)) return;
    const next = { ...(S.doctpl || {}) }; delete next[k.key]; try { await S.db.doc("org/doctpl").set(JSON.parse(JSON.stringify(next))); S.doctpl = next; S.dtEdit = null; logActivity(`Reset the ${k.short} format to the sample`); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.dtDl) { const v = d.dtDl; const k = DT_KINDS[v]; const id = S.dtPick[v]; if (!id) return; const vals = { ...dtValsFor(k, id), ...(S.dtVals[v] || {}) };
    const who = k.kind === "ctr" ? S.emps.get(id) : S.apps.get(id); const nm = `${who?.last || ""}-${who?.first || ""}`.replace(/\s+/g, "");
    await saveLetter(`${k.kind === "ctr" ? "Contract" : "JobOffer"}-${nm}.html`, `${k.short} ${who ? `${who.first} ${who.last}` : ""}`, dtHtml(dtFill(dtBody(k.key), vals)));
    logActivity(`Prepared the ${k.short} for ${who ? `${who.first} ${who.last}` : "someone"}`); }
});
document.addEventListener("change", (ev) => { const v = ev.target.dataset?.dtWho; if (!v) return; S.dtPick[v] = ev.target.value; render(); }); // typed blanks stay; the new person's record fills the rest
// Typing updates the preview in place, so focus and Tab order stay where they are.
document.addEventListener("input", (ev) => { const k = ev.target.dataset?.dtVal; if (!k) return; const [v, s] = k.split("|"); S.dtVals[v] = { ...(S.dtVals[v] || {}), [s]: ev.target.value };
  const pv = document.getElementById("dt-prev"); const d = DT_KINDS[v]; if (pv && d && S.dtPick[v]) pv.innerHTML = dtHtml(dtFill(dtBody(d.key), { ...dtValsFor(d, S.dtPick[v]), ...S.dtVals[v] })); });
document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest?.(".dt-form"); if (!f) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const v = f.dataset.dt; const k = DT_KINDS[v]; const body = $("#dt-body").value.replace(/\r/g, "").trim(); if (!body) { toast("The format is empty."); return; }
  const next = { ...(S.doctpl || {}), [k.key]: { body: body.slice(0, 60000), at: todayISO(), by: S.myId || null } };
  try { await S.db.doc("org/doctpl").set(JSON.parse(JSON.stringify(next))); S.doctpl = next; S.dtEdit = null; logActivity(`Saved the ${k.short} format`); toast("Format saved."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);

// Menu link check (2026-10-14): pages that reuse another page's screen get the title of the menu item that opened them.
{ const T = { joboffer: "Job offers", discipline: "Disciplinary", evaluation: "Evaluation", onboarding: "New hire checklist", offboarding: "Exit clearance", chsched: "Change schedule", obreq: "Official business", utreq: "Undertime", trprog: "Training program", emptraining: "Training history", orgho: "Head Office organization" };
  for (const [v, t] of Object.entries(T)) { const base = VIEWS[v]; if (!base) continue;
    VIEWS[v] = (...a) => { const h = base(...a); return S.view.name === v && typeof h === "string" ? h.replace(/(<h1[^>]*>)([^<]*)(<\/h1>)/, (m, o, x, c) => o + esc(t) + c) : h; }; } }
