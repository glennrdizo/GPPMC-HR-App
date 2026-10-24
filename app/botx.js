/* ---------- HR assistant chatbot: employees ask about their own pay, leave and policies on the phone; HR staff ask about records. Runs on Claude through the viewer's own account (sample capability). ---------- */
Object.assign(S, { bot: { emp: [], hr: [] }, botBusy: null, botAbort: null, kb: null, kbSub: false, kbEdit: false, botHandoff: null });
{
  const ov = NAV.find(([g]) => g === "Overview"); const i = ov[1].findIndex(([v]) => v === "askhr"); ov[1].splice(i >= 0 ? i + 1 : 1, 0, ["hrbot", "HR assistant", "quiz"]);
  Object.assign(SECTION_OF, { hrbot: "hrbot" });
  const j = ESS_NAV.findIndex(([v]) => v === "essask"); ESS_NAV.splice(j >= 0 ? j + 1 : 1, 0, ["essbot", "HR assistant", "quiz"]);
}
/* ---------- knowledge: policies HR writes, plus facts from Settings; stored in pub/kb so employees' phones can read it ---------- */
function kbFacts() {
  const Sx = SET(); const y = todayISO().slice(0, 4);
  return [`Company: ${S.org?.companyName || "the company"}, Philippines.`,
    `Leave credits a year: ${Sx.leaveTypes.filter((t) => t.days != null).map((t) => `${t.name} ${t.days} days${t.paid === false ? " (unpaid)" : ""}`).join("; ")}.`,
    `Shifts: ${Sx.shifts.map((s) => `${s.name} ${s.start}-${s.end}`).join("; ")}. Grace period for lates: ${grace()} minutes.`,
    `Payroll is semi-monthly: cutoffs 1-15 and 16-end of month.`,
    `Holidays ${y}: ${Sx.holidays.filter((h) => h.d.startsWith(y)).map((h) => `${h.d} ${h.name} (${h.type === "REG" ? "regular" : "special"})`).join("; ")}.`,
    `13th month pay is basic pay earned in the year divided by 12, paid on or before December 24; up to PHP ${n2.format(Sx.exempt13)} of 13th month and other benefits is tax-free.`,
    `Employees ask HR through the Ask HR tab; requests (leave, overtime, official business, undertime, schedule change, reimbursements, certificates) are filed with HR for approval.`].join("\n");
}
let kbBusy = false;
async function syncKbFacts() { if (kbBusy || !S.realEdit || !S.db) return; const f = kbFacts(); if (S.kb && S.kb.facts === f) return; kbBusy = true;
  try { await S.db.doc("pub/kb").set(JSON.parse(JSON.stringify({ ...(S.kb || {}), facts: f, factsAt: new Date().toISOString() }))); } catch {} finally { kbBusy = false; } }
function loadKb() { if (S.kbSub || !S.db) return; S.kbSub = true; S.db.doc("pub/kb").onSnapshot((d) => { S.kb = d.exists ? d.data() : {}; if (S.realEdit) syncKbFacts(); }, () => { S.kb = {}; }); }
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(loadKb, 3000); }; }

/* ---------- prompts ---------- */
const BOT_RULES = `Rules:
- Be brief, warm and clear. Use plain words. Reply in the language the person writes in (English, Filipino/Tagalog, Cebuano or Taglish).
- Use only the data and policies given here and Philippine labor law (Labor Code, DOLE advisories, SSS, PhilHealth, Pag-IBIG, BIR). Never invent amounts, dates or policies. If something is not in the data, say so.
- Amounts are in Philippine pesos (PHP).`;
function empPrompt(sum, first) {
  return `You are the HR assistant of ${S.org?.companyName || "the company"}, chatting in the HR app with employee ${sum?.name || "an employee"}.
${BOT_RULES}
- You only see this one employee's data. Never discuss other employees.
- ${S.selfMode ? "You can PREPARE a leave, overtime, time correction or certificate request, or a message to HR, with the tools. The employee confirms on screen before anything is sent, and HR or their supervisor approves it. Ask for missing details first, one short question at a time. Never say a request was sent or approved." : "You cannot approve, file or change anything. For requests (leave, overtime, corrections, certificates, loans), tell them which tab to use or that HR will help."}
- Leave codes: ${(SET().leaveTypes || []).map((t) => `${t.code} = ${t.name}`).join("; ")}. Today is ${todayISO()}.
- When the question needs a person (a complaint, a correction, a decision, something not in the data, or they ask for HR), say HR will follow up and put [[ASK_HR]] alone on the last line.

COMPANY POLICIES (written by HR):
${S.kb?.text || "(none written yet)"}

FACTS FROM SETTINGS:
${S.kb?.facts || "(not available)"}

THIS EMPLOYEE'S DATA (as of ${sum?.at ? sum.at.slice(0, 16).replace("T", " ") : "today"}; today is ${todayISO()}):
${sum ? JSON.stringify({ ...sum, at: undefined }) : "(not shared yet; HR has not linked this phone. Answer policy questions only.)"}

The employee asks:
${first}`;
}
function hrPrompt(first) {
  return `You are the HR assistant inside ${S.org?.companyName || "the company"}'s HR system, helping HR staff. Today is ${todayISO()}.
${BOT_RULES}
- Use the tools to look up employees, leave, attendance, headcount, pending approvals, job openings, applicants and interviews. You may also draft job ads, interview questions and HR letters. Call tools instead of guessing. Keep answers short; use short lists for several people.
- You cannot change records. Tell the user which page does it (for example Leave, Payroll, Employees > Personnel action).

COMPANY POLICIES (written by HR):
${S.kb?.text || "(none written yet)"}

FACTS FROM SETTINGS:
${S.kb?.facts || kbFacts()}

The HR user asks:
${first}`;
}
const empBrief = (e) => ({ id: e.id, name: fullName(e), no: e.no, position: pos(e.posId)?.title || "", assignment: e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office", department: deptName(e), status: STATUS[e.status]?.[0] || "", hired: e.hire });
function hrTools() {
  const findE = (q) => { q = String(q || "").toLowerCase(); return active().filter((e) => `${fullName(e)} ${e.no} ${pos(e.posId)?.title || ""} ${deptName(e)}`.toLowerCase().includes(q)); };
  const status = (s) => (x) => x.status === s;
  return [
    { name: "search_employees", description: "Find active employees by name, employee number, position or department. Returns up to 15.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: ({ query }) => { const r = findE(query); return { total: r.length, employees: r.slice(0, 15).map(empBrief) }; } },
    { name: "employee_details", description: "Full summary of one employee by id: pay rate, leave balances, payslips, attendance this month, loans, requests, schedule.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, execute: ({ id }) => { const e = S.emps.get(id); if (!e) throw new Error("No employee with that id"); return { ...empBrief(e), payType: e.payType, basicPay: e.basicPay, mobile: e.mobile, email: e.email, ...buildSummary(e) }; } },
    { name: "leave_between", description: "Approved and pending leave overlapping a date range (YYYY-MM-DD).", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] }, execute: ({ from, to }) => allLeaves().filter((l) => l.from <= to && l.to >= from && ["APPROVED", "PENDING"].includes(l.status) && S.emps.get(l.empId)).slice(0, 80).map((l) => ({ name: fullName(S.emps.get(l.empId)), type: leaveType(l.type)?.name || l.type, from: l.from, to: l.to, status: l.status })) },
    { name: "attendance_on", description: "Who was present, late or absent on a date (YYYY-MM-DD), from the time records.", inputSchema: { type: "object", properties: { date: { type: "string" } }, required: ["date"] }, execute: async ({ date }) => { await loadClock(addDays(date, -1), addDays(date, 1)); const pd = punchDays(date, date); const ctx = tkCtx(); const g = { present: [], late: [], absent: [], leave: [] };
      for (const e of active()) { const r = dayRec(e, date, pd.get(e.id)?.get(date), ctx); if (r.status === "in") g.present.push(fullName(e)); else if (r.status === "late") g.late.push(`${fullName(e)} (${r.late} min)`); else if (r.status === "absent") g.absent.push(fullName(e)); else if (r.status === "leave") g.leave.push(fullName(e)); }
      return { date, counts: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.length])), late: g.late.slice(0, 40), absent: g.absent.slice(0, 40), leave: g.leave.slice(0, 40), presentSample: g.present.slice(0, 15) }; } },
    { name: "headcount", description: "Active headcount by assignment, department and employment status, plus hires and separations this year.", inputSchema: { type: "object", properties: {} }, execute: () => { const act = active(); const by = (f) => act.reduce((o, e) => { const k = f(e); o[k] = (o[k] || 0) + 1; return o; }, {}); const y = todayISO().slice(0, 4);
      return { active: act.length, byAssignment: by((e) => e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office"), byDepartment: by(deptName), byStatus: by((e) => STATUS[e.status]?.[0] || "Other"), hiredThisYear: act.filter((e) => (e.hire || "").startsWith(y)).length, separatedThisYear: [...S.emps.values()].filter((e) => (e.separated?.date || "").startsWith(y)).length }; } },
    { name: "pending_approvals", description: "Counts of items waiting for HR approval in every module.", inputSchema: { type: "object", properties: {} }, execute: () => ({ leave: allLeaves().filter(status("PENDING")).length, attendanceRequests: listOf(S.attReqs || new Map()).filter(status("PENDING")).length, overtime: listOf(S.otReqs || new Map()).filter(status("PENDING")).length,
      salaryIncrements: listOf(S.salincs || new Map()).filter(status("PENDING")).length, personnelActions: listOf(S.pafs || new Map()).filter(status("PENDING")).length, reimbursements: listOf(S.reimbs || new Map()).filter(status("PENDING")).length, resignations: listOf(S.resigns || new Map()).filter(status("PENDING")).length,
      certificates: listOf(S.certReqs || new Map()).filter(status("PENDING")).length, changeRequests: listOf(S.chgReqs || new Map()).filter(status("PENDING")).length, askHrUnread: typeof akAll === "function" ? akAll().filter((t) => akUnread(t)).length : 0, loanSubmissions: listOf(S.lposts || new Map()).filter(status("PENDING")).length }) },
    { name: "recruitment_overview", description: "Open job openings with slots, hired so far, days open and applicants per stage; plus totals by source.", inputSchema: { type: "object", properties: {} }, execute: () => { const apps = listOf(S.apps || new Map()); const today = todayISO();
      const jobs = listOf(S.jobs || new Map()).filter((j) => j.status === "OPEN").map((j) => { const a = apps.filter((x) => x.jobId === j.id); return { id: j.id, title: j.title, assignment: j.projectId ? S.projects.get(j.projectId)?.name || "Project" : "Head Office", slots: j.slots, hired: a.filter((x) => x.stage === "HIRED").length, daysOpen: j.opened ? daysBetween(j.opened, today) : null, rate: j.rate, byStage: a.reduce((o, x) => { o[x.stage] = (o[x.stage] || 0) + 1; return o; }, {}) }; });
      return { openJobs: jobs, applicantsBySource: apps.reduce((o, x) => { o[x.source || "Unknown"] = (o[x.source || "Unknown"] || 0) + 1; return o; }, {}), stages: STAGES.map((x) => x[1]) }; } },
    { name: "search_applicants", description: "Find applicants by name, job title or stage (APPLIED, SCREENING, INTERVIEW, REQUIREMENTS, OFFER, HIRED, REJECTED). Returns up to 20 with interviews, offer, missing requirements.", inputSchema: { type: "object", properties: { query: { type: "string" }, stage: { type: "string" } } }, execute: ({ query, stage }) => { const q = String(query || "").toLowerCase();
      const r = listOf(S.apps || new Map()).filter((a) => (!stage || a.stage === stage) && (!q || `${a.first} ${a.last} ${S.jobs?.get(a.jobId)?.title || ""}`.toLowerCase().includes(q)));
      return { total: r.length, applicants: r.slice(0, 20).map((a) => ({ name: `${a.first} ${a.last}`, job: S.jobs?.get(a.jobId)?.title || "", stage: a.stage, applied: a.applied, source: a.source, expectedRate: a.expRate, interviews: (a.ivs || []).map((i) => ({ date: i.d, time: i.t, kind: i.kind, by: i.by, result: i.result })), offer: a.offer || null, requirementsDone: Object.keys(a.reqs || {}).filter((k) => a.reqs[k]) })) }; } },
    { name: "interviews_between", description: "Interviews scheduled in a date range (YYYY-MM-DD).", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] }, execute: ({ from, to }) => listOf(S.apps || new Map()).flatMap((a) => (a.ivs || []).filter((i) => i.d >= from && i.d <= to).map((i) => ({ date: i.d, time: i.t, applicant: `${a.first} ${a.last}`, job: S.jobs?.get(a.jobId)?.title || "", kind: i.kind, by: i.by, result: i.result || "Scheduled" }))).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)) },
  ];
}

/* ---------- chat ---------- */
const botFmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
async function botSend(kind, text) {
  if (S.botBusy) return; const sample = S.sample; if (!sample) { toast("The assistant isn't available in this view."); return; }
  const list = S.bot[kind]; list.push({ role: "user", content: text }); list.push({ role: "assistant", content: "", pending: true }); S.botBusy = kind; S.botHandoff = null; render(); botScroll();
  const turns = list.slice(0, -1).slice(-12).map((m) => ({ role: m.role, content: m.content })); while (turns.length && turns[0].role !== "user") turns.shift();
  let sum = null; if (kind === "emp") sum = S.selfMode ? S.meSum : (() => { try { const e = essEmp(); return e ? { ...buildSummary(e), at: new Date().toISOString() } : null; } catch { return null; } })();
  turns[0] = { role: "user", content: kind === "emp" ? empPrompt(sum, turns[0].content) : hrPrompt(turns[0].content) };
  const ac = new AbortController(); S.botAbort = ac; const last = list[list.length - 1];
  const paint = () => { const el = document.querySelector(`#bot-${kind} li:last-child .bot-txt`); if (el) el.innerHTML = botFmt(last.content.replace(/\[\[ASK_HR\]\]/g, "").trim()) || "<i>Thinking…</i>"; botScroll(); };
  try {
    const res = await sample(turns, { modelTier: kind === "hr" ? "default" : "quick", cache: false, signal: ac.signal, onText: ({ text }) => { last.content = text; paint(); }, ...(kind === "hr" ? { tools: hrTools() } : S.selfMode && typeof empBotTools === "function" ? { tools: empBotTools((p) => { last.prop = p; }) } : {}) });
    last.content = res.text || last.content;
  } catch (e) { last.content = e?.text || ""; last.err = e?.code === "not_granted" ? "You declined the assistant for this visit. Reload to allow it." : e?.code === "cancelled" ? "Stopped." : e?.code === "rate_limited" ? "Too many questions at once. Wait a moment and try again." : "The assistant couldn't answer. Try again or use Ask HR."; }
  last.pending = false; if (/\[\[ASK_HR\]\]/.test(last.content)) { last.content = last.content.replace(/\[\[ASK_HR\]\]/g, "").trim(); last.handoff = true; }
  S.botBusy = null; S.botAbort = null; render(); botScroll(); $("#bot-in")?.focus();
}
function botScroll() { const ol = document.querySelector(".bot-msgs"); if (ol) ol.scrollTop = ol.scrollHeight; }
function botChat(kind, starters, note) {
  const list = S.bot[kind]; const can = !!S.sample;
  return `<section class="card bot-card"><ol class="bot-msgs" id="bot-${kind}" aria-live="polite">
      <li class="bot"><div class="bot-txt">${kind === "hr" ? "Hi! Ask me about employees, leave, attendance, headcount, recruitment and applicants, or what's waiting for approval. I can also draft job ads and interview questions." : "Hi! I'm the HR assistant. Ask me about your pay, leave, schedule, loans or company policies."}</div></li>
      ${list.map((m) => `<li class="${m.role === "user" ? "me" : "bot"}"><div class="bot-txt">${m.pending && !m.content ? "<i>Thinking…</i>" : botFmt(m.content)}</div>${m.err ? `<small class="t-warn">${esc(m.err)}</small>` : ""}${m.handoff && kind === "emp" ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" data-bot-handoff>${icon("mail")}Send this to HR</button>` : ""}${m.prop && typeof botPropCard === "function" ? botPropCard(m.prop, list.indexOf(m)) : ""}</li>`).join("")}</ol>
    ${!list.length ? `<div class="bot-starters">${starters.map((s) => `<button class="chip-btn" data-bot-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
    ${can ? `<form id="bot-form" class="bot-form" data-kind="${kind}" data-keep><label class="sr-only" for="bot-in">Your question</label><textarea class="input" id="bot-in" rows="1" maxlength="1500" placeholder="Type your question" ${S.botBusy ? "disabled" : ""}></textarea>
      ${S.botBusy ? '<button type="button" class="btn btn-ghost" data-bot-stop>Stop</button>' : '<button class="btn btn-primary">Ask</button>'}</form>` : '<p class="t-muted" style="margin:10px 0 0;font-size:14px">The assistant needs Claude, which isn\'t available in this view. Use Ask HR instead.</p>'}
    <p class="t-muted" style="font-size:12px;margin:8px 0 0">${note} Answers can be wrong; HR has the final say.${list.length ? ' <button class="link" data-bot-clear>Start over</button>' : ""}</p></section>`;
}
const EMP_STARTERS = ["How much leave do I have left?", "When is the next payday?", "Why is my net pay lower this cutoff?", "How is my 13th month computed?", "What do I do if I forgot to time in?"];
VIEWS.hrbot = () => head("Ask about employees, leave, attendance, recruitment and approvals", "HR assistant") + botChat("hr", ["Who is on leave this week?", "Who was absent or late yesterday?", "What is waiting for my approval?", "How many active employees per project?", "Which job openings are still unfilled?", "What interviews are scheduled this week?"], "Uses your own Claude account. It reads the records you can see and can't change anything.") + kbCard();
ESS.essbot = (e) => head(`What ${esc(e.first)} sees on the phone`, "HR assistant") + botChat("emp", EMP_STARTERS, `Preview with ${esc(fullName(e))}'s data. Employees use it from their phone.`);
function kbCard() {
  const k = S.kb || {};
  return `<section class="card"><div class="card-head"><h2>What the assistant knows</h2>${S.canEdit && !S.kbEdit ? '<button class="btn btn-ghost btn-sm" data-kb-edit>Edit company policies</button>' : ""}</div>
    ${S.kbEdit ? `<form id="kb-form" class="stack" style="gap:10px" data-keep><label for="kb-text" style="font-weight:600">Company policies and FAQs</label><textarea class="input" id="kb-text" rows="14" maxlength="20000" placeholder="e.g.\nPayday: 15th and last day of the month, by bank transfer.\nLeave must be filed 3 days before, except sick leave.\nUniform: company shirt Monday to Friday.\nCash advance: up to PHP 5,000, deducted over 2 cutoffs.">${esc(k.text || "")}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-kb-edit="0">Cancel</button><button class="btn btn-primary">Save policies</button></div></form>`
      : `<p style="margin:0 0 8px;font-size:14px">${k.text ? `Company policies: ${k.text.length.toLocaleString()} characters${k.at ? `, updated ${fmtDate(k.at.slice(0, 10))}` : ""}.` : '<span class="t-warn">No company policies written yet.</span> Add payday, leave filing rules, uniform, cash advance and other rules so the assistant can answer them.'}</p>
      <details><summary class="t-muted" style="cursor:pointer;font-size:14px">Facts it takes from Settings automatically</summary><p style="white-space:pre-wrap;font-size:13px;margin:8px 0 0">${esc(k.facts || kbFacts())}</p></details>`}
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">Employees' assistant also sees their own pay, leave, schedule, loans and requests from their dashboard, and nobody else's.</p></section>`;
}
/* ---------- employee's phone ---------- */
{ const bn = selfNav; selfNav = () => { const h = bn(); if (!S.self?.claim) return h; return h.replace(/<button class="nav-item" data-self-tab="clock"/, `<button class="nav-item" data-self-tab="bot"${S.selfTab === "bot" ? ' aria-current="page"' : ""}>${icon("quiz")}HR assistant</button>$&`); };
  const bv = selfView; selfView = () => S.selfTab === "bot" && S.self?.claim ? (loadKb(), head(`${esc(S.self.claim.name || "")}`, "HR assistant") + `<div style="max-width:720px">${botChat("emp", EMP_STARTERS, "Uses your own Claude account, so the first question asks your permission.")}</div>`) : bv(); }
{ const b = selfHome; selfHome = () => b().replace('<button class="btn btn-ghost" style="background:#fff" data-self-tab="ask">', `<button class="btn btn-ghost" style="background:#fff" data-self-tab="bot">${icon("quiz")}HR assistant</button>$&`); }

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-bot-ask],[data-bot-stop],[data-bot-clear],[data-bot-handoff],[data-kb-edit]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  const kind = document.querySelector(".bot-msgs")?.id === "bot-hr" ? "hr" : "emp";
  if (d.botAsk) return botSend(kind, d.botAsk);
  if (d.botStop !== undefined) { S.botAbort?.abort(); return; }
  if (d.botClear !== undefined) { S.bot[kind] = []; render(); return; }
  if (d.kbEdit !== undefined) { S.kbEdit = d.kbEdit !== "0"; render(); return; }
  if (d.botHandoff !== undefined) { const list = S.bot.emp; const q = [...list].reverse().find((m) => m.role === "user")?.content || "Question"; const now = new Date().toISOString();
    const text = `${q}\n\n(From the HR assistant chat)\n` + list.slice(-6).map((m) => `${m.role === "user" ? "Me" : "Assistant"}: ${m.content}`).join("\n").slice(0, 2800);
    const rec = { subject: shortText(q, 110), cat: "OTHER", tags: [], status: "OPEN", created: now, updated: now, msgs: [{ by: "emp", t: now, text }], seenEmp: now };
    try { if (S.selfMode) { await S.db.doc(`clockins/${S.self.uid}/tickets/${uid()}`).set(JSON.parse(JSON.stringify({ ...rec, empNo: S.self.claim.empNo || null, name: S.self.claim.name || null }))); S.selfTab = "ask"; }
      else { const e = essEmp(); if (!e || !S.realEdit) return; await saveRec("tickets", uid(), { ...rec, empId: e.id, by: S.myId || null, seen: { [S.myId]: now } }); }
      for (const m of list) m.handoff = false; toast("Sent to HR. You'll see their answer in Ask HR."); render(); } catch { toast("Couldn't send. Try again."); } }
}, true);
document.addEventListener("keydown", (ev) => { if (ev.target.id === "bot-in" && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ev.target.form?.requestSubmit(); } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "bot-form" && f.id !== "kb-form") return; ev.preventDefault(); ev.stopImmediatePropagation();
  if (f.id === "kb-form") { if (!S.canEdit) return; const text = $("#kb-text").value.trim(); try { await S.db.doc("pub/kb").set(JSON.parse(JSON.stringify({ ...(S.kb || {}), text, at: new Date().toISOString(), by: S.myId || null, facts: kbFacts() }))); S.kb = { ...(S.kb || {}), text, at: new Date().toISOString() }; S.kbEdit = false; logActivity("Updated the HR assistant's company policies"); toast("Policies saved. The assistant uses them right away."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  const q = $("#bot-in").value.trim(); if (!q) return; botSend(f.dataset.kind, q);
}, true);
