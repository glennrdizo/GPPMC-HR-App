/* ---------- AI screening results (Glenn 2026-10-20) ----------
   On the website, the server job reads each new application's resume and answers to the job's qualification questions and saves
   a recommendation on the applicant (a.ai: score, rec, summary, strengths, gaps, answers, check, ask). It never moves or rejects
   anyone: HR decides. This module shows it on the applicant's page, the job page and the pipeline cards. */
const AI_REC = { INTERVIEW: ["Interview", "c-ok"], KEEP: ["Keep on file", "c-gold"], NOT_FIT: ["Not a fit for this job", "c-bad"] };
const aiChip = (ai) => { const r = AI_REC[ai?.rec]; return r ? `<span class="chip ${r[1]}">${r[0]}</span>` : ""; };
const aiWaiting = (a) => ["APPLIED", "SCREENING", "SCREEN"].includes(a.stage) && !a.ai && (a.aiTries || 0) < 3 && !!(a.resume?.id || Object.keys(a.answers || {}).length);
const aiList = (xs) => (xs?.length ? `<ul style="margin:4px 0 0;padding-left:20px">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="t-muted" style="margin:4px 0 0">None noted.</p>');
function aiCard(a) {
  const ai = a.ai; const ed = S.canEdit;
  if (!ai) {
    if (!window.__hosted) return "";
    const why = a.aiErr && (a.aiTries || 0) >= 3 ? `Couldn't screen this application: ${esc(a.aiErr)}` : aiWaiting(a) ? "Waiting for screening. The system reads new applications every 10 minutes once the AI key is set up." : "";
    return why ? `<section class="card"><div class="card-head"><h2>${icon("star", 18)} AI screening</h2></div><p class="t-muted" style="margin:0">${why}</p>${ed && a.aiErr ? '<p style="margin:10px 0 0"><button class="btn btn-ghost btn-sm" data-ai-again>Try again</button></p>' : ""}</section>` : "";
  }
  const ans = (ai.answers || []).filter((x) => x.q);
  return `<section class="card ai-card"><div class="card-head"><h2>${icon("star", 18)} AI screening</h2><span class="t-muted" style="font-size:13px">${fmtDate((ai.at || "").slice(0, 10))}${ai.resumeRead ? "" : " · resume not read"}</span></div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><div class="ai-score" aria-label="Score ${ai.score} out of 100"><b style="font-size:34px;line-height:1">${ai.score}</b><span class="t-muted" style="font-size:13px"> / 100</span></div>
      <div style="flex:1;min-width:220px">${aiChip(ai)}${ai.years != null ? ` <span class="chip c-gray">${esc(String(ai.years))} yrs relevant</span>` : ""}<p style="margin:8px 0 0">${esc(ai.summary || "")}</p></div></div>
    <div class="form-grid" style="margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div><b>Strengths</b>${aiList(ai.strengths)}</div><div><b>Missing or unclear</b>${aiList(ai.gaps)}</div>
      <div><b>HR should check</b>${aiList(ai.check)}</div><div><b>Ask at the interview</b>${aiList(ai.ask)}</div></div>
    ${ans.length ? `<details style="margin-top:10px"><summary>How the answers were rated</summary><div class="table-wrap"><table><thead><tr><th>Question</th><th>Answer</th><th class="num">Rating</th><th>Note</th></tr></thead><tbody>
      ${ans.map((x) => `<tr><td>${esc(x.q)}</td><td>${esc(a.answers?.[x.q] || "")}</td><td class="num">${x.rating ? `${x.rating} / 5` : "—"}</td><td>${esc(x.note || "")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    ${ai.note ? `<p class="t-muted" style="font-size:13px;margin:8px 0 0">${esc(ai.note)}</p>` : ""}
    <p class="t-muted" style="font-size:13px;margin:10px 0 0">A recommendation from the resume and answers only, for HR to weigh. It leaves out age, sex, civil status, religion and other personal details. HR makes every decision.${ed && window.__hosted ? ' <button class="link" data-ai-again>Screen again</button>' : ""}</p></section>`;
}
{ const b = VIEWS.applicant; VIEWS.applicant = (...x) => { let html = b(...x); const a = S.apps.get(S.view.id); if (!a) return html; const card = aiCard(a); if (!card) return html;
  const i = html.indexOf('<section class="card"><div class="steps"'); return i >= 0 ? html.slice(0, i) + card + html.slice(i) : html + card; }; }
{ const b = appCard; appCard = (a) => { const h = b(a); if (!a.ai) return h; const t = `<span class="chip ${AI_REC[a.ai.rec]?.[1] || "c-gray"}" title="AI screening score">AI ${a.ai.score}</span>`; return h.includes('<span class="chips">') ? h.replace('<span class="chips">', `<span class="chips">${t}`) : h; }; }
{ const b = VIEWS.job; VIEWS.job = (...x) => { const h = b(...x); const j = S.jobs.get(S.view.id); if (!j) return h;
  const mine = listOf(S.apps).filter((a) => a.jobId === j.id && !["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage));
  const done = mine.filter((a) => a.ai).sort((p, q) => q.ai.score - p.ai.score); const wait = mine.filter(aiWaiting).length;
  if (!done.length && !wait) return h;
  return h + `<section class="card"><div class="card-head"><h2>${icon("star", 18)} AI screening</h2><span class="t-muted" style="font-size:13px">${done.length} screened${wait ? ` · ${wait} waiting` : ""}</span></div>
    ${done.length ? `<div class="table-wrap"><table><thead><tr><th>Applicant</th><th class="num">Score</th><th>Recommendation</th><th>Summary</th></tr></thead><tbody>
      ${done.map((a) => `<tr class="go" data-app="${a.id}" tabindex="0"><td><b>${esc(appName(a))}</b><div class="t-muted" style="font-size:12px">${esc(STAGES.find(([k]) => k === a.stage)?.[1] || a.stage)}</div></td><td class="num"><b>${a.ai.score}</b></td><td>${aiChip(a.ai)}</td><td style="font-size:13px">${esc((a.ai.summary || "").slice(0, 220))}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">Applicants answer this job's qualification questions when they apply on the careers page. ${j.qAuto ? "The questions below were written by the system from the job description; change them as you like." : ""}</p></section>`; }; }
document.addEventListener("click", async (ev) => {
  if (!ev.target.closest?.("[data-ai-again]") || !S.canEdit) return; const a = S.apps.get(S.view.id); if (!a) return;
  const { ai, aiErr, aiTries, ...rest } = a;
  try { await put("applicants", { ...rest }); logActivity(`Asked for ${appName(a)}'s application to be screened again`); toast("It will be screened again within 10 minutes."); render(); } catch { toast("Couldn't save. Try again."); }
});
