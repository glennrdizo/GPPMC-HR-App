
/* ---------- HR assistant as Frequently Asked Questions (Glenn 2026-10-12): works without Claude. ---------- */
// Instant answers from the records (HR: who is on leave, absent, approvals...; employees: their own leave, pay, schedule, loans),
// plus company FAQs that HR can edit (pub/kb.faqs, readable by employees' phones). Claude's chat stays below when it is available.
Object.assign(S, { faqQ: "", faqEdit: false, faqRes: {}, faqOpen: new Set() });
const FAQ_CATS = ["Pay", "Leave", "Attendance", "Benefits and government", "Documents and requests", "Company rules"];
function faqDefaults() {
  const Sx = SET(); const y = todayISO().slice(0, 4); const lv = (Sx.leaveTypes || []).filter((t) => t.days != null);
  const hol = (Sx.holidays || []).filter((h) => h.d.startsWith(y)).sort((a, b) => a.d.localeCompare(b.d));
  const f = (cat, q, a) => ({ id: `d-${slug(q)}`, cat, q, a });
  return [
    f("Pay", "When is payday?", "Pay is semi-monthly, for two cutoffs: the 1st to the 15th, and the 16th to the end of the month. If payday falls on a weekend or holiday, HR announces the release date."),
    f("Pay", "Where can I see my payslip?", "Open My payslips in the HR app (on your phone, from your dashboard). Each cutoff shows your gross pay, every deduction and your net pay."),
    f("Pay", "Why is my net pay lower this cutoff?", "Common reasons: absences, lates or undertime; SSS, PhilHealth and Pag-IBIG contributions; withholding tax; loan payments (SSS, Pag-IBIG or company loans); and cash advances. Check the deductions on your payslip. If something looks wrong, send it to Payroll through Ask HR."),
    f("Pay", "How is my 13th month pay computed?", `13th month pay is the total basic salary you earned in the year divided by 12 (PD 851). It is paid on or before December 24. Up to ₱${n2.format(Sx.exempt13 || 90000)} of 13th month pay and other benefits is tax-free. Resigned employees get a prorated 13th month with their final pay.`),
    f("Pay", "How much is holiday pay?", "Regular holiday: you get 100% of your daily pay even without working (if you were present or on paid leave the workday before), and 200% if you work. Special non-working day: no work, no pay unless company policy says otherwise; 130% if you work. Work on a holiday that is also your rest day earns more (260% on a regular holiday, 150% on a special day)."),
    f("Pay", "How much is overtime and night shift pay?", "Overtime on a regular workday is your hourly rate plus 25%; on a rest day or special day, plus 30% of that day's rate. Night shift differential is at least 10% of your hourly rate for work between 10 PM and 6 AM. Overtime must be approved before it is paid."),
    f("Leave", "How many leave days do I get?", lv.length ? `Each year: ${lv.map((t) => `${t.name} ${t.days} day${t.days === 1 ? "" : "s"}${t.paid === false ? " (unpaid)" : ""}`).join("; ")}. Your balance is on My leave.` : "Your leave credits and balance are on My leave."),
    f("Leave", "How do I file leave?", "File it in My leave before the date, so your supervisor and HR can approve it and arrange cover. For sick leave, file it as soon as you are back, with a medical certificate if HR asks for one. You see the approval in the app."),
    f("Leave", "What leaves does the law give?", "Service Incentive Leave: 5 days a year after one year of service, convertible to cash if unused. Maternity leave: 105 days (SSS). Paternity leave: 7 days. Solo parent leave: 7 days. VAWC leave: up to 10 days. Special leave for women after gynecological surgery: up to 2 months (RA 9710). HR helps you with the requirements."),
    f("Attendance", "What are the work shifts and the grace period?", `Shifts: ${(Sx.shifts || []).map((s) => `${s.name} ${s.start} to ${s.end}`).join("; ") || "set by HR per site"}. Grace period for lates: ${grace()} minutes. Your own schedule is on your dashboard.`),
    f("Attendance", "I forgot to time in or out. What do I do?", "File an attendance correction in the app with the actual time and the reason. Your supervisor or HR approves it, and your time record is fixed before payroll."),
    f("Attendance", "How do I clock in on my phone?", "Open the time clock, take a selfie, then tap Time in or Time out. Your location is recorded, so clock in at your assigned site. If the app says you are outside the site, ask your supervisor."),
    f("Attendance", "How do I file overtime?", "File an overtime request with the date, hours and reason, ideally before you work it. Only approved overtime is paid."),
    f("Benefits and government", "How do I check my SSS, PhilHealth and Pag-IBIG contributions?", "Your share is deducted every payroll and shown on your payslip. To see what was posted, use My.SSS, the PhilHealth Member Portal and Virtual Pag-IBIG online. If a month is missing, tell Payroll through Ask HR."),
    f("Benefits and government", "How do I get an SSS or Pag-IBIG loan?", "Apply online at My.SSS or Virtual Pag-IBIG. Once approved, Payroll deducts the monthly payment from your salary. Send the approval notice to HR so the deduction starts on time."),
    f("Benefits and government", "How do I claim SSS sickness or maternity benefit?", "Tell HR right away: within 5 days of being confined for sickness, and as soon as you know you are pregnant for maternity. HR files the notice with SSS and tells you the documents to submit."),
    f("Documents and requests", "How do I get a Certificate of Employment?", "Request it in the app (certificate request) and say what it is for. The law requires it to be released within 3 days of your request."),
    f("Documents and requests", "When do I get my final pay?", "Final pay is released within 30 days from your last day (DOLE Labor Advisory 6-2020), after clearance. It includes unpaid salary, prorated 13th month, cash conversion of unused leave if applicable, and tax refund if any."),
    f("Documents and requests", "How do I update my address, civil status or beneficiaries?", "Send a change request from My profile with the new details and a supporting document (for example a marriage or birth certificate). HR updates your 201 file."),
    ...(hol.length ? [f("Company rules", `What are the holidays in ${y}?`, hol.map((h) => `${fmtDate(h.d)}: ${h.name} (${h.type === "REG" ? "regular" : "special"})`).join("\n"))] : []),
  ];
}
const faqList = () => (Array.isArray(S.kb?.faqs) ? S.kb.faqs : faqDefaults());

/* ---------- instant answers from the records ---------- */
const faqUl = (rows, empty) => (rows.length ? `<ul class="faq-ul">${rows.map((r) => `<li>${r}</li>`).join("")}</ul>` : `<p>${empty}</p>`);
const faqWeek = () => { const dow = (new Date(`${todayISO()}T00:00:00Z`).getUTCDay() + 6) % 7; const mon = addDays(todayISO(), -dow); return [mon, addDays(mon, 6)]; };
const faqTool = (name) => hrTools().find((x) => x.name === name);
const FAQ_HR = [
  ["leave", "Who is on leave this week?", async () => { const [a, b] = faqWeek(); const r = await faqTool("leave_between").execute({ from: a, to: b });
    return faqUl(r.map((l) => `<b>${esc(l.name)}</b>: ${esc(l.type)}, ${fmtDate(l.from)}${l.to !== l.from ? ` to ${fmtDate(l.to)}` : ""}${l.status === "PENDING" ? ' <span class="chip c-warn">Pending</span>' : ""}`), "Nobody is on leave this week."); }],
  ["att", "Who was absent or late yesterday?", async () => { const d = addDays(todayISO(), -1); const r = await faqTool("attendance_on").execute({ date: d });
    return `<p>${fmtDate(d)}: <b>${r.counts.present}</b> present, <b>${r.counts.late}</b> late, <b>${r.counts.absent}</b> absent, <b>${r.counts.leave}</b> on leave.</p>${r.absent.length ? `<p style="margin:6px 0 2px"><b>Absent</b></p>${faqUl(r.absent.map(esc), "")}` : ""}${r.late.length ? `<p style="margin:6px 0 2px"><b>Late</b></p>${faqUl(r.late.map(esc), "")}` : ""}`; }],
  ["appr", "What is waiting for my approval?", async () => { const r = await faqTool("pending_approvals").execute({}); const L = { leave: "Leave", attendanceRequests: "Attendance corrections", overtime: "Overtime", salaryIncrements: "Wage increases", personnelActions: "Personnel actions", reimbursements: "Reimbursements", resignations: "Resignations", certificates: "Certificate requests", changeRequests: "Profile change requests", askHrUnread: "Unread Ask HR questions", loanSubmissions: "Loan submissions" };
    const rows = Object.entries(r).filter(([, n]) => n > 0).map(([k, n]) => `${L[k] || k}: <b>${n}</b>`); return faqUl(rows, "Nothing is waiting. All caught up.") + (rows.length ? '<button class="link" data-go="needs">Open Needs action</button>' : ""); }],
  ["head", "How many active employees per project?", async () => { const r = await faqTool("headcount").execute({}); const rows = Object.entries(r.byAssignment).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)}: <b>${n}</b>`);
    return `<p><b>${r.active}</b> active employees. Hired this year: ${r.hiredThisYear}. Separated this year: ${r.separatedThisYear}.</p>${faqUl(rows, "")}`; }],
  ["jobs", "Which job openings are still unfilled?", async () => { const r = await faqTool("recruitment_overview").execute({}); const open = r.openJobs.filter((j) => (j.hired || 0) < (j.slots || 1));
    return faqUl(open.map((j) => `<b>${esc(j.title)}</b>, ${esc(j.assignment)}: ${j.hired || 0} of ${j.slots || 1} filled${j.daysOpen != null ? `, open ${j.daysOpen} days` : ""}`), "No unfilled openings."); }],
  ["iv", "What interviews are scheduled this week?", async () => { const [a, b] = faqWeek(); const r = await faqTool("interviews_between").execute({ from: a, to: b });
    return faqUl(r.map((i) => `${fmtDate(i.date)}${i.time ? ` ${esc(i.time)}` : ""}: <b>${esc(i.applicant)}</b> for ${esc(i.job)}${i.by ? `, with ${esc(i.by)}` : ""}`), "No interviews this week."); }],
];
function faqEmpSum() { if (S.selfMode) { if (typeof subMeSum === "function") subMeSum(); return S.meSum || null; } try { const e = essEmp(); return e ? buildSummary(e) : null; } catch { return null; } }
const FAQ_EMP = [
  ["leave", "How much leave do I have left?", (s) => faqUl((s.leave || []).map((b) => `${esc(b.name)}: <b>${b.left}</b> day${b.left === 1 ? "" : "s"} left${b.used ? `, ${b.used} used` : ""}`), "No leave balance yet. Ask HR.")],
  ["pay", "How much was my latest pay?", (s) => { const p = (s.slips || [])[0]; return p ? `<p>${esc(p.label)}: gross <b>${money(p.gross)}</b>, deductions ${money(p.ded)}, net pay <b>${money(p.net)}</b>.</p><p class="t-muted" style="font-size:13px">See every line in My payslips.</p>` : "<p>No payslip yet.</p>"; }],
  ["week", "What is my schedule this week?", (s) => `${s.shift ? `<p>Your shift: <b>${esc(s.shift)}</b>.</p>` : ""}${faqUl((s.week || []).map((w) => `${fmtDate(w.d)}: ${esc(w.label)}`), "No schedule yet.")}`],
  ["att", "How is my attendance this month?", (s) => { const a = s.att || {}; return `<p><b>${a.present || 0}</b> days present, <b>${a.late || 0}</b> late (${a.lateMin || 0} minutes), <b>${a.absent || 0}</b> absent, <b>${a.leave || 0}</b> on leave, up to yesterday.</p>`; }],
  ["loans", "How much do I still owe on loans?", (s) => faqUl((s.loans || []).map((l) => `${esc(l.label)}: <b>${money(l.bal)}</b> left, ${money(l.amort)} per payroll${l.end ? `, ends ${fmtDate(l.end)}` : ""}`), "You have no active loans.")],
  ["t13", "How much is my 13th month so far?", (s) => (s.t13 ? `<p>Estimated 13th month this year: <b>${money(s.t13.est)}</b>${s.t13.paid ? ` (already paid: ${money(s.t13.paid)})` : ""}.</p>` : "<p>Not computed yet.</p>")],
  ["reqs", "What is the status of my requests?", (s) => faqUl((s.reqs || []).map((r) => `${esc(r.what)}: <b>${esc(STATUS_WORD?.[r.st] || String(r.st || "").toLowerCase())}</b>`), "No requests in the last 60 days.")],
  ["who", "Who is my supervisor and where am I assigned?", (s) => `<p>${esc(s.pos || "")}${s.unit ? `, ${esc(s.unit)}` : ""}${s.dept ? ` (${esc(s.dept)})` : ""}. Supervisor: <b>${esc(s.sup || "not set")}</b>. Employee no. ${esc(s.no || "")}.</p>`],
];
const STATUS_WORD = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", DENIED: "denied", CANCELLED: "cancelled", DONE: "done", RELEASED: "released" };

/* ---------- page ---------- */
function faqPage(kind) {
  const emp = kind === "emp"; const sum = emp ? faqEmpSum() : null; const list = faqList();
  const quick = emp ? (sum ? FAQ_EMP.map(([k, q, fn]) => { let a; try { a = fn(sum); } catch { a = "<p>Not available yet.</p>"; } return `<details class="faq-it faq-mine" data-faq-s="${esc(q.toLowerCase())}"><summary>${esc(q)}</summary><div class="faq-a">${a}</div></details>`; }).join("")
      : '<p class="t-muted" style="margin:0">Your own answers (leave, pay, schedule, loans) appear here once HR confirms your phone.</p>')
    : FAQ_HR.map(([k, q]) => `<details class="faq-it faq-mine" data-faq-run="${k}" data-faq-s="${esc(q.toLowerCase())}" ${S.faqOpen.has(k) ? "open" : ""}><summary>${esc(q)}</summary><div class="faq-a" id="faq-r-${k}">${S.faqRes[k]?.html || '<i class="t-muted">Looking it up…</i>'}</div></details>`).join("");
  const cats = [...new Set([...FAQ_CATS, ...list.map((x) => x.cat || "Company rules")])];
  const groups = cats.map((c) => [c, list.filter((x) => (x.cat || "Company rules") === c)]).filter(([, xs]) => xs.length);
  const pol = String(S.kb?.text || "").trim();
  const askBtn = emp ? (S.selfMode ? '<button class="btn btn-primary" data-self-tab="ask">Ask HR</button>' : '<button class="btn btn-primary" data-ess="essask">Ask HR</button>') : '<button class="btn btn-primary" data-go="askhr">Open Ask HR</button>';
  return `<div class="faq stack" style="gap:16px">
    <div class="faq-search"><input class="input" type="search" id="faq-q" value="${esc(S.faqQ)}" placeholder="Search questions, e.g. payslip, leave, overtime" aria-label="Search questions">${S.canEdit && !emp ? `<button class="btn btn-ghost" data-faq-edit>${icon("sliders", 16)}Edit questions</button>` : ""}</div>
    ${S.faqEdit && S.canEdit && !emp ? faqEditor(list) : ""}
    <section class="card"><div class="card-head"><h2>${emp ? "Your answers" : "Quick answers from the records"}</h2></div><div class="faq-grp">${quick}</div></section>
    ${groups.map(([c, xs]) => `<section class="card faq-sec"><div class="card-head"><h2>${esc(c)}</h2></div><div class="faq-grp">${xs.map((x) => `<details class="faq-it" data-faq-s="${esc(`${x.q} ${x.a}`.toLowerCase())}"><summary>${esc(x.q)}</summary><div class="faq-a">${esc(x.a).replace(/\n/g, "<br>")}</div></details>`).join("")}</div></section>`).join("")}
    ${pol ? `<section class="card faq-sec"><div class="card-head"><h2>Company policies</h2></div><details class="faq-it" data-faq-s="${esc(pol.toLowerCase())}"><summary>Read the company policies</summary><div class="faq-a" style="white-space:pre-wrap">${esc(pol)}</div></details></section>` : ""}
    <p class="t-muted faq-none" id="faq-none" hidden>No question matches. Try another word, or ask HR.</p>
    <section class="card faq-ask"><div><b>Didn't find your answer?</b><p class="t-muted" style="margin:2px 0 0;font-size:14px">${emp ? "Send your question to HR. It goes straight to Payroll, Timekeeping or HR, and you see the reply in Ask HR." : "Employees' questions arrive in Ask HR, sorted by department."}</p></div>${askBtn}</section>
  </div>`;
}
function faqEditor(list) {
  const row = (x) => `<div class="faq-ed-row" data-faq-row="${esc(x.id)}"><select class="input" data-faq-f="cat" aria-label="Category">${opts(FAQ_CATS.map((c) => [c, c]), x.cat || "Company rules")}</select>
    <input class="input" data-faq-f="q" value="${esc(x.q)}" placeholder="Question" aria-label="Question"><textarea class="input" data-faq-f="a" rows="3" placeholder="Answer" aria-label="Answer">${esc(x.a)}</textarea><button type="button" class="link danger" data-faq-del>Remove</button></div>`;
  return `<section class="card"><div class="card-head"><h2>Edit questions</h2><button class="link" data-faq-edit>Close</button></div>
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">Employees see these on their phone. Write answers that fit your company (payday dates, filing rules, uniform, cash advance). Your own answers about pay, leave and schedules come from the records automatically.</p>
    <form id="faq-form" class="stack" style="gap:12px" data-keep><div id="faq-rows" class="stack" style="gap:12px">${list.map(row).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between"><button type="button" class="btn btn-ghost" data-faq-add>${icon("plus")}Add a question</button>
        <span style="display:flex;gap:8px;flex-wrap:wrap">${Array.isArray(S.kb?.faqs) ? '<button type="button" class="btn btn-ghost" data-faq-reset>Go back to the standard list</button>' : ""}<button class="btn btn-primary">Save questions</button></span></div></form></section>`;
}
async function faqSave(faqs, msg) {
  const next = { ...(S.kb || {}) }; if (faqs) next.faqs = faqs; else delete next.faqs;
  await S.db.doc("pub/kb").set(JSON.parse(JSON.stringify(next))); S.kb = next; logActivity(msg); toast("Saved. Employees see it on their phones.");
}

/* ---------- wiring: the HR assistant page becomes the FAQ; Claude's chat stays below when available ---------- */
VIEWS.hrbot = () => { loadKb(); return head("Frequently asked questions", "HR assistant") + faqPage("hr") + (S.sample ? `<h2 class="faq-chat-h">Ask Claude anything else</h2>` + botChat("hr", [], "Uses Claude. It reads the records you can see and can't change anything.") : "") + (S.canEdit && S.sample ? kbCard() : ""); };
ESS.essbot = (e) => { loadKb(); return head(`What ${esc(e.first)} sees on the phone`, "HR assistant") + faqPage("emp") + (S.sample ? `<h2 class="faq-chat-h">Ask Claude</h2>` + botChat("emp", [], `Preview with ${esc(fullName(e))}'s data.`) : ""); };
{ const bv = selfView; selfView = () => (S.selfTab === "bot" && S.self?.claim ? (loadKb(), head(esc(S.self.claim.name || ""), "HR assistant") + `<div style="max-width:720px">${faqPage("emp")}${S.sample ? `<h2 class="faq-chat-h">Ask Claude</h2>` + botChat("emp", [], "Uses your own Claude account, so the first question asks your permission.") : ""}</div>`) : bv()); }

/* ---------- events ---------- */
document.addEventListener("toggle", async (ev) => {
  const d = ev.target; if (!d.matches?.("details[data-faq-run]")) return; const k = d.dataset.faqRun;
  if (!d.open) { S.faqOpen.delete(k); return; } S.faqOpen.add(k); const c = S.faqRes[k]; if (c && (c.busy || Date.now() - c.at < 60000)) return;
  const it = FAQ_HR.find(([x]) => x === k); S.faqRes[k] = { ...(c || {}), busy: true };
  let html; try { html = await it[2](); } catch { html = '<p class="t-warn">Couldn\'t look this up. Try again.</p>'; }
  S.faqRes[k] = { html, at: Date.now() }; const box = document.getElementById(`faq-r-${k}`); if (box) box.innerHTML = html;
}, true);
function faqFilter() {
  const q = S.faqQ.trim().toLowerCase(); let shown = 0;
  for (const d of document.querySelectorAll(".faq [data-faq-s]")) { const ok = !q || q.split(/\s+/).every((w) => d.dataset.faqS.includes(w) || d.textContent.toLowerCase().includes(w)); d.hidden = !ok; if (ok) shown++; if (q && ok && !d.dataset.faqRun) d.open = true; if (!q) d.open = false; }
  for (const s of document.querySelectorAll(".faq .faq-sec, .faq section.card:has(.faq-mine)")) s.hidden = ![...s.querySelectorAll("[data-faq-s]")].some((d) => !d.hidden);
  const n = $("#faq-none"); if (n) n.hidden = shown > 0;
}
document.addEventListener("input", (ev) => { if (ev.target.id !== "faq-q") return; S.faqQ = ev.target.value; faqFilter(); });
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-faq-edit],[data-faq-add],[data-faq-del],[data-faq-reset]"); if (!t || !S.canEdit) return; ev.stopImmediatePropagation();
  if (t.hasAttribute("data-faq-edit")) { S.faqEdit = !S.faqEdit; render(); return; }
  if (t.hasAttribute("data-faq-add")) { const w = document.createElement("div"); w.innerHTML = faqEditor([{ id: uid(), cat: "Company rules", q: "", a: "" }]); const r = w.querySelector(".faq-ed-row"); $("#faq-rows").appendChild(r); r.querySelector('[data-faq-f="q"]').focus(); return; }
  if (t.hasAttribute("data-faq-del")) { t.closest(".faq-ed-row").remove(); return; }
  if (t.hasAttribute("data-faq-reset")) { if (!await askConfirm("Replace your questions with the standard list?", "Use standard list")) return; try { await faqSave(null, "Reset the HR assistant FAQs"); S.faqEdit = false; render(); } catch { toast("Couldn't save. Try again."); } }
}, true);
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "faq-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const faqs = [...ev.target.querySelectorAll(".faq-ed-row")].map((r) => ({ id: r.dataset.faqRow, cat: r.querySelector('[data-faq-f="cat"]').value, q: r.querySelector('[data-faq-f="q"]').value.trim().slice(0, 200), a: r.querySelector('[data-faq-f="a"]').value.trim().slice(0, 3000) })).filter((x) => x.q && x.a);
  if (!faqs.length) { toast("Write at least one question and answer."); return; }
  try { await faqSave(faqs, "Updated the HR assistant FAQs"); S.faqEdit = false; render(); } catch { toast("Couldn't save. Try again."); }
}, true);
{ const b = render; render = (...a) => { b(...a); if (document.querySelector(".faq") && S.faqQ) faqFilter(); }; }
{ const st = document.createElement("style"); st.textContent = `.faq-search{display:flex;gap:10px;flex-wrap:wrap}.faq-search .input{flex:1;min-width:220px;font-size:16px;padding:12px 14px}
.faq-grp{display:flex;flex-direction:column}.faq-it{border-bottom:1px solid var(--line,#E6E1D6)}.faq-it:last-child{border-bottom:0}
.faq-it summary{cursor:pointer;list-style:none;padding:12px 28px 12px 2px;font-weight:600;position:relative}.faq-it summary::-webkit-details-marker{display:none}
.faq-it summary::after{content:"+";position:absolute;right:4px;top:9px;font-size:20px;color:#9A7430;font-weight:400}.faq-it[open] summary::after{content:"–"}
.faq-a{padding:0 2px 14px;font-size:14.5px;line-height:1.6}.faq-a p{margin:0 0 6px}.faq-ul{margin:4px 0 6px;padding-left:20px}.faq-ul li{margin:2px 0}
.faq-mine summary{color:var(--navy,#0E1A33)}.faq-ask{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:rgba(201,164,92,.10)}
.faq-ed-row{display:grid;grid-template-columns:200px 1fr auto;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--line,#E6E1D6)}.faq-ed-row textarea{grid-column:1/-1}
.faq-chat-h{font-size:18px;margin:24px 0 10px}[data-theme=dark] .faq-mine summary{color:inherit}
@media (max-width:600px){.faq-ed-row{grid-template-columns:1fr}}`; document.head.appendChild(st); }
