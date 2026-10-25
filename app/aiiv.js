/* ---------- AI first-round interview and recruitment rules (Glenn 2026-10-25) ----------
   On the website, an invited applicant answers a short interview on the careers page (hr-bot ?ch=iv): a few questions about
   their work, typed or spoken, with at most one follow-up each. A stronger model scores the transcript (a.aiiv.result) for HR.
   The scheduled job (hr-jobs) can also apply Recruitment > Automatic rules (org/ops.recRules): a high screening score sends the
   interview invitation (or moves to Interview), a high interview score moves to Interview, and a low score only suggests
   rejection (a.suggest), which HR confirms. Every rule action is noted on the applicant (a.ruleLog). */
for (const [k, v] of Object.entries({ chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>' })) if (!ICON[k]) ICON[k] = v;
const RR_DEF = { on: false, invite: 70, reject: 40, aiiv: true, pass: 70 };
const RR = () => ({ ...RR_DEF, ...(S.ops?.recRules || {}) });
const IV_DIMS = [["skills", "Skills and experience"], ["behavior", "Work attitude and behavior"], ["comm", "Communication"], ["fit", "Job fit and availability"]];
const IV_REC = { NEXT: ["Invite to the next interview", "c-ok"], MAYBE: ["Maybe", "c-gold"], NOT_FIT: ["Not a fit for this job", "c-bad"] };
const IV_ST = { INVITED: ["Invited", "c-blue"], STARTED: ["In progress", "c-gold"], DONE: ["Done", "c-ok"], EXPIRED: ["Expired", "c-gray"], DECLINED: ["Asked for a person", "c-warn"], CANCELLED: ["Cancelled", "c-gray"] };
const ivLive = (a) => ["APPLIED", "SCREENING", "SCREEN", "INTERVIEW"].includes(a.stage || "APPLIED") && !a.blacklist;
const ivAddDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ivBar = (n) => `<span class="iv-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(n) || 0))}%"></i></span>`;
(() => { const x = document.createElement("style"); x.textContent = `.iv-bar{display:inline-block;width:120px;height:8px;border-radius:99px;background:var(--line,#E6E1D6);vertical-align:middle;overflow:hidden}.iv-bar i{display:block;height:100%;background:var(--gold,#C9A45C)}
.iv-tr{display:flex;flex-direction:column;gap:8px;margin-top:8px}.iv-tr p{margin:0;padding:8px 12px;border-radius:10px;max-width:92%;white-space:pre-wrap;font-size:14px}.iv-tr .ai{background:var(--surface-2,#F3F1EC)}.iv-tr .me{align-self:flex-end;background:#EAF0FB}
.iv-dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:12px}.iv-dims>div{border:1px solid var(--line,#E6E1D6);border-radius:12px;padding:10px 12px}`; document.head.appendChild(x); })();

function ivCard(a) {
  const s = a.aiiv; const ed = S.canEdit; const hosted = !!window.__hosted; const j = S.jobs.get(a.jobId);
  const sug = a.suggest && ivLive(a) ? `<div class="notice" style="margin:0 0 12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span>${icon("alert", 18)} <b>Suggested by the rules: not a fit.</b> ${esc(a.suggest.why || "")}. Nothing was sent to the applicant.</span>${ed ? `<span style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-rx-refuse="${a.id}">Refuse</button><button class="btn btn-ghost btn-sm" data-iv-keep="${a.id}">Keep in the process</button></span>` : ""}</div>` : "";
  const log = (a.ruleLog || []).length ? `<details style="margin-top:10px"><summary>What the automatic rules did</summary><ul style="margin:6px 0 0;padding-left:20px">${a.ruleLog.slice().reverse().map((x) => `<li>${esc(fmtDate((x.at || "").slice(0, 10)))}: ${esc(x.text)}</li>`).join("")}</ul></details>` : "";
  if (!s) {
    if (!ivLive(a)) return sug || log ? `<section class="card">${sug}${log}</section>` : "";
    const can = ed && hosted && j?.aiiv !== false;
    return `<section class="card"><div class="card-head"><h2>${icon("chat", 18)} Online interview</h2></div>${sug}
      <p class="t-muted" style="margin:0">${hosted ? "A short first interview the applicant answers on the careers page, by typing or speaking, in English or Filipino. An AI interviewer asks the questions and may ask one follow-up each; you get the transcript and a score. You decide what happens next." : "Online interviews run on the HR website, where applicants use the careers page."}${j?.aiiv === false ? " It is switched off for this job." : ""}</p>
      ${can ? `<p style="margin:12px 0 0"><button class="btn btn-primary btn-sm" data-iv-invite="${a.id}">${icon("send", 16)}Invite to the online interview</button></p>` : ""}${log}</section>`;
  }
  const st = IV_ST[s.status] || [s.status, "c-gray"]; const r = s.result; const turns = s.turns || [];
  const head = `<div class="card-head"><h2>${icon("chat", 18)} Online interview</h2><span class="chip ${st[1]}">${st[0]}</span></div>`;
  let body = "";
  if (s.status === "INVITED") body = `<p style="margin:0">Invited ${esc(fmtDate((s.at || "").slice(0, 10)))}${s.by === "rule" ? " by the automatic rules" : ""}. Open until ${esc(fmtDate(s.until))}. The applicant gets an email and sees it on the careers page.</p>`;
  else if (s.status === "STARTED") body = `<p style="margin:0">Started ${esc(fmtDate((s.started || "").slice(0, 10)))}: question ${(s.qi || 0) + 1} of ${(s.qs || []).length}.</p>`;
  else if (s.status === "DECLINED") body = `<p style="margin:0">The applicant asked for an interview with a person instead${s.declined ? ` on ${esc(fmtDate(s.declined.slice(0, 10)))}` : ""}. Schedule one below.</p>`;
  else if (s.status === "EXPIRED") body = `<p style="margin:0">The invitation closed on ${esc(fmtDate(s.until))} without an answer.</p>`;
  else if (s.status === "DONE" && !r) body = `<p style="margin:0">Finished ${esc(fmtDate((s.done || "").slice(0, 10)))}. ${s.err && (s.tries || 0) >= 3 ? `Scoring failed: ${esc(s.err)}` : "The score is being prepared; it appears within 10 minutes."}</p>`;
  else if (r) body = `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><div class="ai-score" aria-label="Score ${r.score} out of 100"><b style="font-size:34px;line-height:1">${r.score}</b><span class="t-muted" style="font-size:13px"> / 100</span></div>
      <div style="flex:1;min-width:220px"><span class="chip ${IV_REC[r.rec]?.[1] || "c-gray"}">${IV_REC[r.rec]?.[0] || ""}</span><p style="margin:8px 0 0">${esc(r.summary || "")}</p></div></div>
    <div class="iv-dims">${IV_DIMS.map(([k, l]) => { const d = r.dims?.[k] || {}; return `<div><b>${l}</b><div style="margin:4px 0">${ivBar(d.score)} <b>${d.score ?? "—"}</b></div><div class="t-muted" style="font-size:13px">${esc(d.why || "")}</div></div>`; }).join("")}</div>
    <div class="form-grid" style="margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))"><div><b>Strengths</b>${aiList(r.strengths)}</div><div><b>Concerns</b>${aiList(r.concerns)}</div>
      ${r.flags?.length ? `<div><b>Check these</b>${aiList(r.flags)}</div>` : ""}<div><b>Ask at the next interview</b>${aiList(r.ask)}</div></div>`;
  const tr = turns.length ? `<details style="margin-top:12px" ${r ? "" : "open"}><summary>Transcript (${turns.filter((t) => t.role === "me").length} answers)</summary><div class="iv-tr">${turns.map((t) => `<p class="${t.role === "me" ? "me" : "ai"}"><b>${t.role === "me" ? esc(appName(a)) : "Interviewer"}:</b> ${esc(t.text)}</p>`).join("")}</div></details>` : "";
  const acts = ed && hosted ? [["INVITED", "STARTED"].includes(s.status) ? `<button class="btn btn-ghost btn-sm" data-iv-cancel="${a.id}">Cancel the invitation</button>` : "",
    ["EXPIRED", "CANCELLED"].includes(s.status) && ivLive(a) ? `<button class="btn btn-ghost btn-sm" data-iv-invite="${a.id}">Invite again</button>` : "",
    s.status === "DONE" && !r && (s.tries || 0) >= 3 ? `<button class="btn btn-ghost btn-sm" data-iv-rescore="${a.id}">Score again</button>` : ""].filter(Boolean).join("") : "";
  return `<section class="card">${head}${sug}${body}${tr}${acts ? `<p style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap">${acts}</p>` : ""}
    <p class="t-muted" style="font-size:13px;margin:10px 0 0">The AI scores only the answers, not age, sex, civil status, religion or other personal details, and doesn't mark down answers in Filipino. HR makes every decision.</p>${log}</section>`;
}
{ const b = VIEWS.applicant; VIEWS.applicant = (...x) => { const html = b(...x); const a = S.apps.get(S.view.id); if (!a) return html; const card = ivCard(a); if (!card) return html;
  const i = html.indexOf('<section class="card"><div class="steps"'); return i >= 0 ? html.slice(0, i) + card + html.slice(i) : html + card; }; }
{ const b = appCard; appCard = (a) => { const h = b(a); const r = a.aiiv?.result; const t = r ? `<span class="chip ${IV_REC[r.rec]?.[1] || "c-gray"}" title="Online interview score">Interview ${r.score}</span>` : a.aiiv && IV_ST[a.aiiv.status] ? `<span class="chip ${IV_ST[a.aiiv.status][1]}" title="Online interview">Interview: ${IV_ST[a.aiiv.status][0].toLowerCase()}</span>` : "";
  const s = a.suggest && ivLive(a) ? '<span class="chip c-bad" title="Suggested by the automatic rules">Suggested: not a fit</span>' : "";
  return t || s ? h.replace('<span class="chips">', `<span class="chips">${t}${s}`) : h; }; }

/* Job page: the interview questions, and switching the interview off for one job. */
{ const b = VIEWS.job; VIEWS.job = (...x) => { const h = b(...x); const j = S.jobs.get(S.view.id); if (!j || !window.__hosted) return h; const ed = S.canEdit; const qs = j.aiivQs || [];
  return h + `<section class="card"><div class="card-head"><h2>${icon("chat", 18)} Online interview questions</h2>${ed ? `<label class="check" style="margin:0"><input type="checkbox" data-iv-jobon="${j.id}" ${j.aiiv !== false ? "checked" : ""}><span>Use the online interview for this job</span></label>` : ""}</div>
    ${qs.length ? `<ol class="rx-qlist">${qs.map((q, i) => `<li><span>${esc(q)}</span>${ed ? `<button class="link danger" data-iv-qdel="${j.id}:${i}">Remove</button>` : ""}</li>`).join("")}</ol>${j.aiivAuto ? '<p class="t-muted" style="font-size:13px;margin:6px 0 0">Written by the system from the job description when the first applicant started. Change them as you like.</p>' : ""}`
      : '<p class="t-muted" style="margin:0">None yet. When the first applicant starts, the system writes 6 questions from the job description (recent work, hands-on experience, handling problems, teamwork, site and shift assignment, motivation). You can also add your own; with 3 or more, yours are used.</p>'}
    ${ed ? `<form id="iv-q" style="display:flex;gap:8px;margin-top:12px" data-keep><input class="input" id="iv-q-in" required maxlength="300" placeholder="Add a question, e.g. Tell me about a time you handled a tenant complaint." aria-label="New interview question" style="flex:1;min-width:0"><button class="btn btn-ghost btn-sm">Add</button></form>` : ""}</section>`; }; }

/* Recruitment page: the automatic rules. */
{ const b = VIEWS.hiring; VIEWS.hiring = (...x) => { const h = b(...x); if (!S.canEdit || !window.__hosted) return h; const R = RR();
  const wait = listOf(S.apps).filter((a) => a.suggest && ivLive(a)).length;
  return h + `<section class="card"><div class="card-head"><h2>${icon("bolt", 18)} Automatic rules</h2>${R.on ? '<span class="chip c-ok">On</span>' : '<span class="chip c-gray">Off</span>'}</div>
    <form id="rr-form" class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))" data-keep>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="on" ${R.on ? "checked" : ""}><span><b>Move applicants along by their scores</b><div class="t-muted" style="font-size:13px">Checked every 10 minutes after the AI screening and the online interview. Each step happens once per applicant and is noted on their page.</div></span></label>
      <div class="field"><label for="rr-invite">Screening score to go ahead</label><input class="input" id="rr-invite" name="invite" type="number" min="0" max="100" value="${R.invite}"><span class="hint">or more</span></div>
      <label class="check"><input type="checkbox" name="aiiv" ${R.aiiv ? "checked" : ""}><span>Go ahead means the online interview first<div class="t-muted" style="font-size:13px">Unticked, they go straight to the Interview stage.</div></span></label>
      <div class="field"><label for="rr-pass">Online interview score for the Interview stage</label><input class="input" id="rr-pass" name="pass" type="number" min="0" max="100" value="${R.pass}"><span class="hint">or more; they can then pick an interview time you offer on the job</span></div>
      <div class="field"><label for="rr-reject">Suggest "not a fit" under</label><input class="input" id="rr-reject" name="reject" type="number" min="0" max="100" value="${R.reject}"><span class="hint">only a suggestion: you confirm each one</span></div>
      <div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary">Save rules</button>${wait ? `<span class="t-muted">${wait} ${wait === 1 ? "applicant is" : "applicants are"} suggested "not a fit" and waiting for you.</span>` : ""}</div></form>
    <p class="t-muted" style="font-size:13px;margin:10px 0 0">Scores between the two numbers are left for HR. The rules never reject anyone and skip blacklisted and refused applicants.</p></section>`; }; }

async function ivSave(a, patch, msg, log) {
  try { await S.db.doc(`applicants/${a.id}`).update(JSON.parse(JSON.stringify(patch))); S.apps.set(a.id, { ...a, ...patch, aiiv: patch.aiiv === null ? null : patch.aiiv ? { ...(a.aiiv || {}), ...patch.aiiv } : a.aiiv }); S.ver++;
    if (log) logActivity(log); toast(msg); render(); } catch { toast("Couldn't save. Try again."); }
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest?.("[data-iv-invite],[data-iv-cancel],[data-iv-rescore],[data-iv-keep],[data-iv-qdel]"); if (!t || !S.canEdit) return; const d = t.dataset;
  if (d.ivQdel) { const [jid, i] = d.ivQdel.split(":"); const j = S.jobs.get(jid); if (!j) return; const qs = (j.aiivQs || []).filter((_, k) => k !== Number(i));
    try { await put("jobs", { ...j, aiivQs: qs, aiivAuto: false }); toast("Question removed."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  const a = S.apps.get(d.ivInvite || d.ivCancel || d.ivRescore || d.ivKeep); if (!a) return;
  if (d.ivInvite) { if (!await askConfirm(`Invite ${appName(a)} to the online interview? They get an email and have 7 days to answer on the careers page.`, "Invite")) return;
    const now = new Date().toISOString(); return ivSave(a, { aiiv: { status: "INVITED", by: `hr:${S.myName || ""}`.slice(0, 80), at: now, until: ivAddDays(todayISO(), 7), qs: [], qi: 0, turns: [], result: null, err: null, tries: 0 }, ...(a.stage === "APPLIED" ? { stage: "SCREENING", stageAt: todayISO() } : {}) }, "Invitation sent.", `Invited ${appName(a)} to the online interview`); }
  if (d.ivCancel) { if (!await askConfirm(`Cancel ${appName(a)}'s online interview invitation?`, "Cancel invitation")) return; return ivSave(a, { aiiv: { status: "CANCELLED" } }, "Invitation cancelled.", `Cancelled ${appName(a)}'s online interview invitation`); }
  if (d.ivRescore) return ivSave(a, { aiiv: { tries: 0, err: null } }, "It will be scored again within 10 minutes.");
  if (d.ivKeep) return ivSave(a, { suggest: null }, "Kept in the process.", `Kept ${appName(a)} in the process (rules had suggested not a fit)`);
});
document.addEventListener("change", async (ev) => {
  const t = ev.target.closest?.("[data-iv-jobon]"); if (!t || !S.canEdit) return; const j = S.jobs.get(t.dataset.ivJobon); if (!j) return;
  try { await put("jobs", { ...j, aiiv: t.checked }); toast(t.checked ? "The online interview is on for this job." : "The online interview is off for this job."); render(); } catch { toast("Couldn't save. Try again."); render(); }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "iv-q" && f.id !== "rr-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  if (f.id === "iv-q") { const j = S.jobs.get(S.view.id); const q = f.querySelector("#iv-q-in").value.trim().slice(0, 300); if (!j || !q) return;
    try { await put("jobs", { ...j, aiivQs: [...(j.aiivAuto ? [] : j.aiivQs || []), q], aiivAuto: false }); toast(j.aiivAuto ? "Added. The questions written by the system were replaced by yours." : "Question added."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  const v = (n) => Math.max(0, Math.min(100, Math.round(Number(f.querySelector(`[name=${n}]`).value) || 0)));
  const rr = { on: f.querySelector("[name=on]").checked, aiiv: f.querySelector("[name=aiiv]").checked, invite: v("invite"), pass: v("pass"), reject: v("reject") };
  if (rr.reject > rr.invite) { toast('"Not a fit" must be lower than the score to go ahead.'); return; }
  const next = { ...(S.ops || {}), recRules: rr };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity(`${rr.on ? "Turned on" : "Updated"} the automatic recruitment rules`); toast("Rules saved."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
