/* ---------- Bots (Glenn 2026-10-24: "all 1,2,3,4") ----------
   In the app itself:
   - The employee's HR assistant (app/botx.js) prepares requests: leave, overtime, a time correction, a certificate or a message
     to HR. Nothing is sent until the employee presses "Send to HR" on the card under the answer; it then goes exactly where the
     forms send it (clockins/<uid>/reqs and tickets), and HR or the supervisor approves it as usual.
   - Job openings get "Interview times applicants can pick" (jobs.ivSlots, website): an applicant in the interview stage picks
     one on the careers page and it becomes an interview on their record (hr_portal_put 'book').
   The Viber and Messenger bot, the HR helper's chat messages and the careers page assistant are on the website (web/botsweb.js,
   supabase/functions/hr-bot). */
ICON.check ||= '<path d="M5 12l5 5L20 7"/>'; ICON.x ||= '<path d="M18 6L6 18M6 6l12 12"/>';
ICON.chat ||= '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>';
const BOT_ISO = /^\d{4}-\d{2}-\d{2}$/, BOT_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const botTxt = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
// Same checks as supabase/functions/hr-bot/logic.ts checkProposal, with this app's leave types and certificates.
function botCheck(name, x) {
  const today = todayISO(); const reason = botTxt(x.reason, 200); const at = new Date().toISOString();
  if (name === "ask_hr") { const subject = botTxt(x.subject, 110), text = botTxt(x.message, 2000); if (!subject || !text) return { error: "Ask for the subject and the message." };
    return { what: "ticket", subject, text, summary: `Send this to HR (Ask HR)?\n\n"${subject}"\n${shortText(text, 400)}` }; }
  if (name !== "file_request") return { error: "Unknown action." };
  if (x.kind === "leave") {
    const t = (SET().leaveTypes || []).find((l) => l.code === String(x.leave_type || "").toUpperCase()); const from = String(x.from || ""), to = String(x.to || x.from || "");
    if (!t) return { error: `Ask which leave: ${(SET().leaveTypes || []).map((l) => `${l.name} (${l.code})`).join(", ")}.` };
    if (!BOT_ISO.test(from) || !BOT_ISO.test(to) || to < from) return { error: "Ask for the leave dates (first and last day)." };
    if (from < addDays(today, -60) || to > addDays(today, 366)) return { error: "Those dates are too far from today. Check them with the employee." };
    if (!reason) return { error: "Ask for the reason." };
    const half = !!x.half_day && from === to;
    return { what: "req", rec: { kind: "leave", type: t.code, from, to, half, reason, at }, summary: `File ${t.name} ${from === to ? `on ${fmtDate(from)}${half ? " (half day)" : ""}` : `from ${fmtDate(from)} to ${fmtDate(to)}`}?\nReason: ${reason}` };
  }
  if (x.kind === "ot" || x.kind === "adjust") {
    const d = String(x.date || ""); if (!BOT_ISO.test(d) || d > today || d < addDays(today, -45)) return { error: `Ask for the ${x.kind === "ot" ? "overtime date" : "date to correct"} (today or earlier, within the last 45 days).` };
    if (!reason) return { error: x.kind === "ot" ? "Ask what the overtime was for." : "Ask why the time needs correcting (for example, forgot to time out)." };
    if (x.kind === "ot") { const h = Math.round(Number(x.hours) * 2) / 2; if (!(h >= 0.5 && h <= 16)) return { error: "Ask how many overtime hours (0.5 to 16)." };
      return { what: "req", rec: { kind: "ot", d, hours: h, reason, at }, summary: `File ${h} hour${h === 1 ? "" : "s"} of overtime on ${fmtDate(d)}?\nReason: ${reason}` }; }
    const tin = BOT_HM.test(x.time_in || "") ? x.time_in : null, tout = BOT_HM.test(x.time_out || "") ? x.time_out : null;
    if (!tin && !tout) return { error: "Ask for the correct time in and/or time out (like 08:00 or 17:30)." };
    return { what: "req", rec: { kind: "adjust", d, in: tin, out: tout, reason, at }, summary: `Ask HR to correct ${fmtDate(d)}: ${[tin && `time in ${tin}`, tout && `time out ${tout}`].filter(Boolean).join(", ")}?\nReason: ${reason}` };
  }
  if (x.kind === "cert") {
    const c = CERTS.find((k) => k[0] === x.cert_type) || CERTS[0]; const purpose = botTxt(x.purpose, 120); const copies = Math.min(10, Math.max(1, Math.round(Number(x.copies) || 1)));
    if (!purpose) return { error: "Ask what the certificate is for (for example, bank loan, visa)." };
    return { what: "req", rec: { kind: "cert", type: c[0], purpose, copies, need: addDays(today, 3), at }, summary: `Request this from HR: ${c[1]}, ${copies} cop${copies === 1 ? "y" : "ies"}, for ${purpose}?` };
  }
  return { error: "That kind of request can't be filed from the chat. Point the employee to the right page." };
}
function empBotTools(onProp) {
  const tool = (name, description, properties, required) => ({ name, description, inputSchema: { type: "object", properties, required },
    execute: (input) => { const r = botCheck(name, input || {}); if (r.error) throw new Error(r.error); onProp(r); return { shown: true, note: "Shown to the employee with Send to HR and Cancel buttons. Ask them to check it and press Send to HR. Don't say it was sent." }; } });
  return [
    tool("file_request", "Prepare a request for this employee: leave, overtime, a time correction (attendance change) or a certificate. It is NOT sent: the employee checks it and presses Send to HR. Ask for missing details first.", {
      kind: { type: "string", enum: ["leave", "ot", "adjust", "cert"] }, leave_type: { type: "string", description: "Leave code, for kind=leave" },
      from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, half_day: { type: "boolean" },
      date: { type: "string", description: "YYYY-MM-DD, for overtime or a time correction" }, hours: { type: "number" },
      time_in: { type: "string", description: "HH:MM, 24-hour" }, time_out: { type: "string", description: "HH:MM, 24-hour" },
      cert_type: { type: "string", enum: CERTS.map((c) => c[0]), description: CERTS.map((c) => `${c[0]} = ${c[1]}`).join("; ") },
      purpose: { type: "string" }, copies: { type: "number" }, reason: { type: "string" } }, ["kind"]),
    tool("ask_hr", "Prepare a message to a person in HR (Ask HR), for complaints, corrections, decisions or anything not in the data. Not sent until the employee presses Send to HR.", { subject: { type: "string" }, message: { type: "string" } }, ["subject", "message"]),
  ];
}
function botPropCard(p, i) {
  if (p.done) return `<p class="t-ok" style="margin:6px 0 0;font-size:14px">${icon("check", 15)} Sent to HR. You can follow it in the HR app.</p>`;
  if (p.cancel) return '<p class="t-muted" style="margin:6px 0 0;font-size:14px">Not sent.</p>';
  return `<div class="panel" style="margin-top:8px;padding:12px;border-left:3px solid var(--gold, #C9A45C)"><p style="margin:0 0 10px;white-space:pre-line;font-size:14px">${esc(p.summary)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-bot-prop="${i}:send" ${p.busy ? "disabled" : ""}>${icon("check", 15)}Send to HR</button><button class="btn btn-ghost btn-sm" data-bot-prop="${i}:cancel">Cancel</button></div></div>`;
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-bot-prop]"); if (!t) return; ev.stopImmediatePropagation();
  const [i, act] = t.dataset.botProp.split(":"); const m = S.bot.emp[Number(i)]; const p = m?.prop; if (!p || p.done || p.busy) return;
  if (act === "cancel") { p.cancel = true; render(); return; }
  if (!S.selfMode || !S.self?.uid) { toast("Employees send this from their own account."); return; }
  p.busy = true; render(); const now = new Date().toISOString(); const who = { empNo: S.self.claim?.empNo || null, name: S.self.claim?.name || null };
  try {
    if (p.what === "req") { const id = uid(); const rec = { ...p.rec, ...who, via: "assistant" }; await S.db.doc(`clockins/${S.self.uid}/reqs/${id}`).set(JSON.parse(JSON.stringify(rec))); S.rqMine = [{ id, ...rec }, ...(S.rqMine || [])]; }
    else await S.db.doc(`clockins/${S.self.uid}/tickets/${uid()}`).set(JSON.parse(JSON.stringify({ subject: p.subject, cat: "OTHER", tags: [], status: "OPEN", created: now, updated: now, msgs: [{ by: "emp", t: now, text: `${p.text}\n\n(From the HR assistant chat)` }], seenEmp: now, ...who })));
    p.done = true; toast("Sent to HR.");
  } catch { toast("Couldn't send. Check your connection and try again."); } finally { p.busy = false; render(); }
}, true);

/* ---------- interview times applicants pick on the careers page (website) ---------- */
const IV_KINDS = ["Interview", "Initial interview", "Final interview", "Exam", "Practical test"];
function ivSlotsCard(j) {
  const slots = (j.ivSlots || []).slice().sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t)); const today = todayISO();
  const taken = new Map(); for (const a of listOf(S.apps)) if (a.jobId === j.id) for (const iv of a.ivs || []) if (iv.slot && iv.result === "PENDING") taken.set(iv.slot, a);
  const free = slots.filter((s) => s.d > today && !taken.has(s.id)).length;
  return `<section class="card" id="ivslots"><div class="card-head"><h2>Interview times applicants can pick</h2><span class="t-muted" style="font-size:13px">${free} open</span></div>
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">Applicants you move to the interview stage pick one of these on the careers page, unless you already scheduled their interview. Each time is for one applicant. They get the schedule by email, and you see it on their record.</p>
    ${slots.length ? `<ul class="list" style="font-size:14px">${slots.map((s) => { const a = taken.get(s.id); return `<li style="display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap"><span><b>${fmtDate(s.d)}</b> ${esc(s.t || "")} · ${esc(s.kind || "Interview")}${s.by ? ` · ${esc(s.by)}` : ""}</span>
      <span style="display:flex;gap:8px;align-items:center">${a ? `<button class="link" data-app="${a.id}">${esc(appName(a))}</button>` : s.d <= today ? '<span class="t-muted">Past</span>' : '<span class="chip c-ok">Open</span>'}${S.canEdit && !a ? `<button class="btn btn-ghost btn-sm" data-ivslot-del="${esc(s.id)}" aria-label="Remove this time">${icon("x", 14)}</button>` : ""}</span></li>`; }).join("")}</ul>` : '<p class="t-muted" style="margin:0;font-size:14px">No times offered yet.</p>'}
    ${S.canEdit ? `<form id="ivslot-form" class="form-grid" style="margin-top:12px;align-items:end" data-keep><div class="field"><label for="ivs-d">Date</label><input class="input" type="date" id="ivs-d" min="${addDays(today, 1)}" required></div>
      <div class="field"><label for="ivs-t">Time</label><input class="input" type="time" id="ivs-t" required></div><div class="field"><label for="ivs-k">Kind</label><select class="input" id="ivs-k">${IV_KINDS.map((k) => `<option>${k}</option>`).join("")}</select></div>
      <div class="field"><label for="ivs-by">Interviewer</label><input class="input" id="ivs-by" maxlength="80"></div><div class="field"><label for="ivs-n">How many times</label><select class="input" id="ivs-n">${[1, 2, 3, 4, 6, 8].map((n) => `<option value="${n}">${n === 1 ? "Just this one" : `${n}, every 30 minutes`}</option>`).join("")}</select></div>
      <div><button class="btn btn-primary">${icon("plus")}Add</button></div></form>` : ""}</section>`;
}
{ const b = VIEWS.job; VIEWS.job = (...x) => { const h = b(...x); const j = S.jobs.get(S.view.id); if (!j || !window.__hosted || !["OPEN", "ON_HOLD"].includes(j.status)) return h; return h + ivSlotsCard(j); }; }
const hmAdd = (t, m) => { const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return x >= 1440 ? null : `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "ivslot-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const j = S.jobs.get(S.view.id); if (!j) return; const d = $("#ivs-d").value, t0 = $("#ivs-t").value, n = Number($("#ivs-n").value) || 1;
  if (!d || d <= todayISO() || !BOT_HM.test(t0)) { toast("Pick a date from tomorrow on and a time."); return; }
  const have = new Set((j.ivSlots || []).map((s) => `${s.d} ${s.t}`)); const add = [];
  for (let k = 0; k < n; k++) { const t = hmAdd(t0, 30 * k); if (!t || have.has(`${d} ${t}`)) continue; add.push({ id: uid().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20), d, t, kind: $("#ivs-k").value, by: $("#ivs-by").value.trim() || null }); }
  if (!add.length) { toast("Those times are already offered."); return; }
  const keep = (j.ivSlots || []).filter((s) => s.d >= addDays(todayISO(), -30)); // older times drop off
  try { await put("jobs", { ...j, ivSlots: [...keep, ...add].slice(-80) }); logActivity(`Offered ${add.length} interview time${add.length === 1 ? "" : "s"} for ${j.title} on ${fmtDate(d)}`); toast(add.length === 1 ? "Time added." : `${add.length} times added.`); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ivslot-del]"); if (!t || !S.canEdit) return; ev.stopImmediatePropagation(); const j = S.jobs.get(S.view.id); if (!j) return;
  try { await put("jobs", { ...j, ivSlots: (j.ivSlots || []).filter((s) => s.id !== t.dataset.ivslotDel) }); toast("Time removed."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
