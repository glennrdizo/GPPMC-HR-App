/* ===== HRD Platform: process, workflow and automation per function (Glenn, 2026-10-14) =====
   Each of the 45 functions gets its procedure (steps, who does each, the page where it is done), what the app does on its own,
   and what is still done by hand. Shown on each function page and together on Overview > Processes & automation.
   Step page: a view name, "r:Deliverable" for that function's register page, or "" for work done outside the app. */
const HRD_WHO = { HR: "HRD", OPS: "Operations / Cluster Head", EX: "Executive Management", EMP: "Employee", FIN: "Accounting / Finance", APP: "Applicant" };
const HRD_FLOW = {
  1: { s: [["Draft the annual HR strategic plan from company goals", "HR", "r:Annual HR Strategic Plan"], ["Break it into the HR operational plan with owners and dates", "HR", "r:HR Operational Plan"], ["Approve the plan and HR priorities", "EX", "r:Annual HR Strategic Plan"], ["Track HR KPIs every month", "HR", "hrd_kpi"], ["Review the HR dashboard and correct course", "EX", "hrdash"], ["Write the year-end HR performance report", "HR", "r:HR Annual Performance Report"]],
    a: ["HR dashboard and Monthly report are built from live records", "5 of the 20 KPIs fill in by themselves (201 completeness, onboarding, manpower fulfillment, turnover, training)", "Overdue plan items show in red on the register"],
    m: ["Writing the plan itself", "The other 15 KPIs are typed in each month"] },
  2: { s: [["Keep the company and property org charts current", "HR", "org"], ["Set up departments and reporting lines", "HR", "departments"], ["Classify positions and write job descriptions", "HR", "r:Approved Job Descriptions"], ["Review structure changes with Operations", "OPS", "r:Organizational Development Plan"], ["Approve new or changed positions", "EX", "r:Position Classification Matrix"]],
    a: ["Org charts redraw from employee records (position, department, project)", "Employee photos and positions appear on each project's manpower chart"],
    m: ["Job descriptions and the classification matrix are kept as register entries with files attached"] },
  3: { s: [["Set the approved headcount per project and position", "HR", "projects"], ["Prepare the annual manpower plan", "HR", "mplan"], ["Monitor vacancies against the approved complement", "HR", "r:Vacancy Monitoring Report"], ["Request manpower for gaps", "OPS", "mpr"], ["Approve the manpower request", "EX", "mpr"], ["Review utilization and the forecast", "HR", "r:Workforce Forecast"]],
    a: ["Vacancies = approved headcount minus active staff, per project", "Manpower fulfillment KPI is computed", "Ending a project asks HR where its staff go"],
    m: ["Forecasts and utilization reports"] },
  4: { s: [["File a manpower request", "OPS", "mpr"], ["Approve the request", "EX", "mpr"], ["Post the job (Indeed, LinkedIn, Facebook, JobStreet, careers page)", "HR", "hiring"], ["Screen applicants and give tests", "HR", "rtests"], ["Schedule and hold interviews", "HR", "ivcal"], ["Recommend the hire through an offer letter request", "HR", "olr"], ["Approve the offer", "EX", "olr"], ["Send the job offer", "HR", "joboffer"], ["Mark hired", "HR", "hiring"]],
    a: ["Applicants apply on the careers page and track their own status (website)", "Suggested shortlist ranks applicants by fit", "Blacklisted applicants are flagged", "Approvals follow the endorsement chain with deadlines and escalation in Needs action", "Hiring marks the manpower request filled, files the first contract and copies the offer allowance into pay setup", "Time-to-fill and funnel figures on Recruitment analysis"],
    m: ["Background and reference checks"] },
  5: { s: [["Give the pre-employment checklist to the new hire", "HR", "r:Pre-Employment Checklist"], ["Collect government numbers and documents", "EMP", "empdocs"], ["Fill in the employee information sheet (201)", "HR", "employees"], ["Prepare and sign the contract", "HR", "contracts"], ["Issue the deployment clearance", "HR", "r:Deployment Clearance"]],
    a: ["Contracts fill in from the employee or applicant record (name, position, pay, dates)", "Missing SSS, PhilHealth, Pag-IBIG or TIN shows on the 201 completeness KPI"],
    m: ["Medical exam results and NBI clearance are attached by hand"] },
  6: { s: [["Open the onboarding checklist for the new hire", "HR", "onboarding"], ["Schedule the orientation", "HR", "orient"], ["Have the employee acknowledge policies", "EMP", "r:Policy Acknowledgment Forms"], ["Issue the ID", "HR", "idprint"], ["Evaluate onboarding after 30 days", "OPS", "r:Onboarding Evaluation"]],
    a: ["Checklist items for ID, contract, orientation and bank account tick themselves when the proof exists", "Onboarding completion KPI is computed"],
    m: ["Policy acknowledgments are signed on paper and attached"] },
  7: { s: [["Assign the employee to a property", "HR", "employees"], ["Issue the deployment notice", "HR", "r:Deployment Notice"], ["Confirm reporting at the site", "OPS", "r:Employee Deployment Tracker"], ["Record transfers between properties", "HR", "paf"], ["Report deployment status", "HR", "r:Deployment Status Report"]],
    a: ["Changing an employee's project files a Personnel Action Form by itself", "A future-dated transfer waits and applies on its date", "The phone clock-in follows the new site's geofence"],
    m: ["Deployment notices and the assignment matrix"] },
  8: { s: [["Set shifts, rest days and holidays", "HR", "timeSettings"], ["Employees clock in (phone, kiosk or biometric)", "EMP", "clockin"], ["Import biometric logs", "HR", "punches"], ["Review daily time records", "HR", "dtr"], ["Approve attendance, OB, undertime and schedule requests", "OPS", "attreqs"], ["Approve overtime", "OPS", "ot"], ["Load the time sheet for payroll", "HR", "attendance"]],
    a: ["Late, undertime, absences, night differential and holidays are computed from punches", "Clock-ins outside the site's geofence are held for review", "Only approved overtime is paid", "Time sheet loads from daily time records in one click", "Suspensions show as Suspended in the DTR", "Unfiled overtime this cutoff shows in Needs action"],
    m: ["Live push from biometric devices needs the website version"] },
  9: { s: [["Employee files leave", "EMP", "leave"], ["Supervisor approves", "OPS", "leave"], ["HR checks the balance and records it", "HR", "leave"], ["Close the year: carry over or convert", "HR", "lvye"]],
    a: ["Balances, proration and service incentive leave are computed", "Approved leave appears in the DTR and time sheet", "Year-end carry-over and conversion follow the leave policy"],
    m: ["Year-end conversion is not yet posted as a payroll line"] },
  10: { s: [["Close the cutoff's time sheet", "HR", "attendance"], ["Run payroll", "HR", "payroll"], ["Review the register and variances", "FIN", "payroll"], ["Finalize the payroll", "HR", "payroll"], ["Release payslips", "HR", "payslips"], ["File and pay SSS, PhilHealth, Pag-IBIG and BIR", "FIN", "tax"]],
    a: ["SSS, PhilHealth, Pag-IBIG and withholding tax are computed", "Finalizing first applies due separations, raises and personnel actions", "Raises in the middle of a cutoff are prorated; late raises add back pay", "Loans are deducted and closed when paid", "Cost per project is recorded on each line", "Employees see their payslip on their phone", "Remittance deadlines show in Needs action", "Confidential payroll is run separately by Owners and Executives"],
    m: ["Bank upload file", "Monthly SSS computation and one-cutoff months wait for your decision"] },
  11: { s: [["Maintain the salary grade matrix", "HR", "r:Salary Grade Matrix"], ["Benchmark salaries", "HR", "r:Salary Benchmarking Report"], ["Recommend increases", "OPS", "salinc"], ["Approve increases and the budget", "EX", "salinc"], ["Apply on the effective date", "HR", "wageinc"]],
    a: ["Increases apply by themselves on their effective date", "Pay below the regional minimum wage is flagged once the region's wage is entered", "Back pay is added when an approved raise is dated before a paid cutoff"],
    m: ["Grade matrix and benchmarking"] },
  12: { s: [["Enroll government contributions and HMO", "HR", "contrib"], ["Set up FlexBen and allowances", "HR", "flex"], ["Record loans", "HR", "loans"], ["Process benefit claims", "HR", "r:Benefits Claims Tracker"], ["Compute the 13th month pay", "HR", "t13"]],
    a: ["Contributions follow the current SSS, PhilHealth and Pag-IBIG tables", "Loan documents are read by Claude and posted as loans", "13th month pay is computed, including commissions", "De minimis and the ₱90,000 exemption are applied to tax"],
    m: ["HMO enrollment and claims"] },
  13: { s: [["Set KPIs for each employee", "OPS", "r:Employee KPI Scorecards"], ["Evaluate probationary staff before the 6th month", "OPS", "evaluation"], ["Hold the regular appraisal", "OPS", "perf"], ["Place low performers on an improvement plan", "HR", "r:Performance Improvement Plans"], ["Summarize ratings", "HR", "perf"]],
    a: ["Probation due dates remind HR in advance", "Regularizing files the status change and a regular contract", "Hire anniversaries remind HR of the yearly review"],
    m: ["KPI scorecards and improvement plans"] },
  14: { s: [["Find who needs which training", "HR", "training"], ["Plan the training calendar", "HR", "trsessions"], ["Enroll and hold sessions", "HR", "trsessions"], ["Record attendance and results", "HR", "trrecords"], ["Evaluate effectiveness", "HR", "r:Training Effectiveness Report"]],
    a: ["Required trainings per position are checked against records", "\"Enroll everyone who needs it\" fills a session", "Expiring certificates remind HR", "Training compliance KPI is computed"],
    m: ["Competency matrix and effectiveness reports"] },
  15: { s: [["Identify critical positions and successors", "HR", "r:Succession Planning Matrix"], ["List high-potential employees", "OPS", "r:High-Potential Employee Register"], ["Agree development plans", "HR", "r:Leadership Development Plan"], ["Review readiness yearly", "EX", "r:Leadership Readiness Report"]],
    a: ["Register entries track due dates and status"], m: ["The whole process is recorded by hand"] },
  16: { s: [["Receive the concern or grievance", "HR", "r:Grievance Register"], ["Investigate and consult", "HR", "r:Employee Relations Case Tracker"], ["Resolve and inform the employee", "HR", "r:Employee Relations Case Tracker"], ["Monitor recurring concerns", "HR", "r:Workplace Concern Monitoring"]],
    a: ["Employees can send concerns through Ask HR", "Overdue cases show in red"], m: ["Consultation reports"] },
  17: { s: [["Record the incident", "OPS", "r:Incident Report Register"], ["Issue the notice to explain", "HR", "discipline"], ["Hold the hearing", "HR", "r:Hearing Documentation"], ["Issue the decision", "HR", "discipline"], ["Apply the penalty", "HR", "discipline"]],
    a: ["NTE reply and decision deadlines show in Needs action", "A suspension marks those days Suspended in the DTR and deducts them from open cutoffs"],
    m: ["Legal review of high-risk cases"] },
  18: { s: [["Keep the statutory compliance calendar", "HR", "r:Statutory Compliance Calendar"], ["Check wages, contributions and records", "HR", "comply"], ["Prepare for DOLE inspection", "HR", "r:Labor Inspection Readiness Report"], ["Audit employment compliance", "HR", "r:Employment Compliance Audit"]],
    a: ["Minimum wage, contribution and holiday pay checks run on the Compliance page", "Lapsed contracts and remittance deadlines show in Needs action"],
    m: ["DOLE reports and inspection files"] },
  19: { s: [["Draft or revise a policy", "HR", "r:HR Policy Register"], ["Review with Operations and Legal", "OPS", "r:Policy Revision Tracker"], ["Approve the policy", "EX", "r:HR Policy Register"], ["Announce it to employees", "HR", "ann"], ["Load it into the HR assistant", "HR", "hrbot"]],
    a: ["Announcements reach employees by site, project or name", "The HR assistant answers employees from the company policies"],
    m: ["Writing the manual and handbook"] },
  20: { s: [["Create the employee record", "HR", "employees"], ["Attach documents", "HR", "empdocs"], ["Handle change requests from employees", "HR", "chgreq"], ["Print IDs", "HR", "idprint"], ["Audit the 201 files", "HR", "r:Personnel Records Audit"]],
    a: ["Every change is logged in the Employee change log", "Pay or position edits file a Personnel Action Form", "Expiring documents remind HR", "A changed name or position asks for an ID reprint", "Masterlist imports from Excel"],
    m: ["Scanning paper files"] },
  21: { s: [["Give each user a role", "HR", "perms"], ["Review system access", "HR", "perms"], ["Check data accuracy", "HR", "idmiss"], ["Review the activity log", "HR", "activity"]],
    a: ["Roles limit which pages a person sees", "On the website the database blocks changes by View only roles", "Confidential pay is locked in the database", "Activity is logged"], m: ["HR automation report"] },
  22: { s: [["Plan the engagement calendar", "HR", "r:Employee Engagement Calendar"], ["Announce activities", "HR", "ann"], ["Run the satisfaction survey", "HR", "r:Employee Satisfaction Survey"], ["Recognize employees", "OPS", "r:Employee Recognition Program"], ["Report results", "HR", "r:Engagement Activity Reports"]],
    a: ["Birthdays on the dashboard", "Yearly review reminders for regular staff", "Announcements by site"], m: ["Survey and recognition"] },
  23: { s: [["Plan the welfare program", "HR", "r:Employee Welfare Program"], ["Schedule wellness activities", "HR", "r:Wellness Activity Calendar"], ["Assist employees in need", "HR", "r:Employee Assistance Monitoring"], ["Report well-being", "HR", "r:Employee Well-Being Report"]],
    a: ["Register entries track due dates and status"], m: ["The whole process is recorded by hand"] },
  24: { s: [["Record medical history and fitness", "HR", "medical"], ["Run safety trainings", "HR", "r:Safety Training Register"], ["Record workplace incidents", "OPS", "r:Employee Incident Records"], ["Monitor OSH training", "HR", "r:OSH Training Monitoring"]],
    a: ["Expiring medical and safety certificates remind HR"], m: ["Incident investigation"] },
  25: { s: [["Prepare the Personnel Action Form", "HR", "paf"], ["Endorse", "OPS", "paf"], ["Approve", "EX", "paf"], ["Apply the movement on its date", "HR", "paf"]],
    a: ["Edits to position, pay or project file a PAF by themselves", "Future-dated movements wait and apply on their date", "Regularization due dates remind HR"], m: ["Promotion register"] },
  26: { s: [["Receive the resignation", "HR", "resign"], ["Open offboarding and clearance", "HR", "offboarding"], ["Return company assets", "EMP", "property"], ["Hold the exit interview", "HR", "r:Exit Interview Report"], ["Compute and release final pay", "FIN", "finalpays"], ["Issue the certificate of employment", "HR", "certreq"]],
    a: ["The employee is separated on the last day by themselves", "Clearance is blocked while assets are still held", "Final pay is due within 30 days (Needs action)", "Releasing final pay closes deducted loans", "Their phone clock-in stops"], m: ["Exit interview and attrition analysis"] },
  27: { s: [["Prepare the HR audit checklist", "HR", "r:HR Audit Checklist"], ["Audit HR processes", "HR", "r:HR Audit Report"], ["Record noncompliance", "HR", "r:Noncompliance Register"], ["Track corrective actions", "HR", "r:Corrective Action Tracker"]],
    a: ["On-time report in Needs action shows which approvals met their target"], m: ["The audit itself"] },
  28: { s: [["Submit the reports on schedule", "HR", "hrd_reports"], ["Update the KPI scorecard", "HR", "hrd_kpi"], ["Send the monthly report", "HR", "report"], ["Review with management", "EX", "hrdash"]],
    a: ["Monthly report exports to Excel, PowerPoint and PDF", "Executive monthly report is generated", "5 KPIs computed"], m: ["Quarterly and annual analysis"] },
  29: { s: [["Prepare the HR budget", "HR", "r:Annual HR Budget"], ["Approve the budget", "EX", "r:Annual HR Budget"], ["Track recruitment and training costs", "HR", "r:HR Cost Analysis"], ["Report utilization", "FIN", "r:HR Budget Utilization Report"]],
    a: ["Payroll cost per project is recorded"], m: ["Budget and cost reports"] },
  30: { s: [["Keep the privacy compliance checklist", "HR", "r:HR Data Privacy Compliance Checklist"], ["Have staff sign confidentiality forms", "HR", "r:Confidentiality Acknowledgments"], ["Review records access", "HR", "perms"], ["Assess HR risks", "HR", "r:HR Risk Register"]],
    a: ["Privacy notice consent is recorded at sign-in (website)", "Confidential pay is enforced in the database", "Uploaded files open safely"], m: ["Risk assessment"] },
};
// Property management functions (31-45): the same four-step cycle, done per property and cluster.
for (const n of [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]) HRD_FLOW[n] = {
  s: [["Receive the property's request or schedule", "OPS", `hrd_${n}`], ["Plan and assign the HR action", "HR", `hrd_${n}`], ["Carry it out and record it in the activity log", "HR", `hrd_${n}`], ["Report to the cluster head", "OPS", `hrd_${n}`]],
  a: { 31: ["Manpower per property and vacancies from Projects & Manpower"], 32: ["Headcount, attendance and overtime per project"], 33: ["New project codes, manpower requests and hiring"], 34: ["Ending a project asks HR where its staff go"], 35: ["Manpower requests, suggested shortlist"], 36: ["Evaluations per project"], 37: ["Discipline deadlines in Needs action"], 38: ["Announcements and meeting notes per project"], 39: ["Compliance checks per project"], 40: ["Activity log with due dates"], 41: ["Transfers file a PAF and move the clock-in site"], 42: ["Overtime and attendance reports per project"], 43: ["Monthly report per project"], 44: ["Orientation requests and onboarding checklist"], 45: ["Activity log with due dates"] }[n],
  m: ["Recording each activity"] };

const hrdFlowView = (n, v) => (v.startsWith("r:") ? `hrdr_${n}_${hrdSlug(v.slice(2))}` : v);
function hrdFlowCard(n, compact) {
  const f = HRD_FLOW[n]; if (!f) return "";
  const steps = f.s.map(([t, w, v], i) => { const to = v && hrdFlowView(n, v); return `<li><span class="hrd-fn">${i + 1}</span><span class="hrd-ft"><b>${esc(t)}</b><span class="t-muted">${esc(HRD_WHO[w] || w)}</span></span>${to && (VIEWS[to] || navHas(to)) && to !== S.view?.name && !(compact && to === `hrd_${n}`) ? `<button class="btn btn-ghost btn-sm" data-go="${esc(to)}" aria-label="Open ${esc(labelOf(to))} for: ${esc(t)}">Open</button>` : ""}</li>`; }).join("");
  return `<section class="card" style="margin-top:16px"><div class="card-head"><h2>${compact ? esc(hrdTitle(n)) : "Process and workflow"}</h2>${compact ? `<button class="btn btn-ghost btn-sm" data-go="hrd_${n}" aria-label="Open ${esc(hrdTitle(n))}">Open</button>` : ""}</div>
    <ol class="hrd-flow">${steps}</ol>
    <div class="hrd-auto"><div><h3>${icon("flow", 16)}Done by the app</h3><ul>${f.a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div><h3>${icon("sheet", 16)}Still done by hand</h3><ul>${f.m.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></section>`;
}
// On each function page: after the objective (core functions) or after the description (property functions).
for (const n of Object.keys(HRD_FLOW)) { const v = `hrd_${n}`; const b = VIEWS[v]; if (!b) continue;
  VIEWS[v] = (...x) => { const h = b(...x); const card = hrdFlowCard(Number(n)); const k = h.indexOf('<section class="card" style="margin-top:16px"><div class="card-head"><h2>Key deliverables'); if (k >= 0) return h.slice(0, k) + card + h.slice(k); const e = h.indexOf("</section>"); return e >= 0 ? h.slice(0, e + 10) + card + h.slice(e + 10) : h + card; }; }

// Overview > Processes & automation: every function's workflow in one place.
S.hrdFlowCat = "";
function hrdFlowPage() {
  const all = Object.keys(HRD_FLOW).map(Number); const autoN = all.reduce((s, n) => s + HRD_FLOW[n].a.length, 0); const stepN = all.reduce((s, n) => s + HRD_FLOW[n].s.length, 0);
  const cats = HRD_CATS.filter(([c]) => !S.hrdFlowCat || c === S.hrdFlowCat);
  return head("Overview", "Processes & automation") + `
    <section class="stats kpis">
      <div class="card stat"><span class="label">Functions</span><span class="value">${all.length}</span><span class="note">in ${HRD_CATS.length} modules</span></div>
      <div class="card stat"><span class="label">Workflow steps</span><span class="value">${stepN}</span><span class="note">each linked to its page</span></div>
      <div class="card stat"><span class="label">Automations</span><span class="value">${autoN}</span><span class="note">done by the app</span></div></section>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Summary</h2><select class="input" style="max-width:280px" aria-label="Module" data-hrd-fcat>${opts([["", "All modules"], ...HRD_CATS.map(([c]) => [c, GL(c)])], S.hrdFlowCat)}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Module</th><th>Function</th><th>Steps</th><th>Done by the app</th><th>Still done by hand</th></tr></thead><tbody>
      ${cats.map(([c, , ns]) => ns.map((n) => `<tr><td>${esc(GL(c))}</td><td><button class="link" data-go="hrd_${n}">${esc(hrdTitle(n))}</button></td><td>${HRD_FLOW[n].s.length}</td><td>${esc(HRD_FLOW[n].a.join("; "))}</td><td>${esc(HRD_FLOW[n].m.join("; "))}</td></tr>`).join("")).join("")}
      </tbody></table></div></section>
    ${cats.map(([c, , ns]) => `<h2 class="dsec" style="margin:24px 0 0">${esc(GL(c))}</h2>${ns.map((n) => hrdFlowCard(n, true)).join("")}`).join("")}`;
}
VIEWS.hrd_flow = hrdFlowPage; SECTION_OF.hrd_flow = "hrd_flow"; HRD_PERM.hrd_flow = "Overview"; HRD_LABEL.hrd_flow = "Processes & automation";
{ const ov = NAV.find(([g]) => g === "Overview"); if (ov && !ov[1].some(([v]) => v === "hrd_flow")) { const i = ov[1].findIndex(([v]) => v === "report"); ov[1].splice(i >= 0 ? i + 1 : ov[1].length, 0, ["hrd_flow", "Processes & automation", "flow"]); } }
document.addEventListener("change", (ev) => { if (ev.target.matches?.("[data-hrd-fcat]")) { S.hrdFlowCat = ev.target.value; render(); } });
{ const st = document.createElement("style"); st.textContent = `
.hrd-flow{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.hrd-flow li{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.hrd-flow li:last-child{border-bottom:0}
.hrd-fn{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--ink,#14213d);color:#fff;font-weight:700;font-size:13px}
.hrd-ft{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}.hrd-ft .t-muted{font-size:13px}
.hrd-auto{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:14px}
.hrd-auto h3{display:flex;gap:6px;align-items:center;font-size:14px;margin:0 0 6px}.hrd-auto ul{margin:0;padding-left:20px;font-size:14px;display:flex;flex-direction:column;gap:4px}
.hrd-auto>div{background:var(--panel,#f7f5ef);border-radius:12px;padding:12px 14px}
html[data-theme="dark"] .hrd-auto>div{background:rgba(255,255,255,.05)}`; document.head.appendChild(st); }
