// Automatic notices (Glenn 2026-10-16), website only: Users & Permissions > Automatic notices.
// The hr-jobs server function runs every 10 minutes, emails people when their requests are decided, payslips are
// ready or an applicant moves on, tells approvers about new requests, and sends HR a morning to-do digest.
// Settings live in org/notify; sent messages and run notes come from hr_outbox_list() and hr_job_runs_list().
S.aj = { status: null, runs: null, out: null, cfg: null, err: null, at: 0, busy: false, q: "", open: null };
{ const g = NAV.find(([n]) => n === "Users & Permissions"); if (g && !g[1].some(([v]) => v === "autojobs")) g[1].push(["autojobs", "Automatic notices", "bell"]);
  try { HRD_PERM.autojobs = "Records"; } catch {} SECTION_OF.autojobs = "autojobs"; }
{ const b = viewAllowed; viewAllowed = function (name, ...x) { if (name === "autojobs") return isPermAdmin(); return b(name, ...x); }; }
const AJ_DEF = { on: false, company: "GD Prime Property Management Corporation", appUrl: location.origin, careersUrl: `${location.origin}/careers`, digestHour: 7, digestTo: [], approverTo: [], sms: false,
  kinds: { decided: true, approval: true, payslip: true, applicant: true, digest: true } };
const ajCfg = () => { const c = S.aj.cfg || {}; return { ...AJ_DEF, ...c, kinds: { ...AJ_DEF.kinds, ...(c.kinds || {}) } }; };
async function ajCall(body) {
  const { data, error } = await window.__sb.functions.invoke("hr-jobs", { body });
  if (!error) return data;
  let msg = error.message || "The server job didn't answer."; try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch {}
  if (/not found|404|Failed to send/i.test(msg)) msg = "The automatic jobs aren't installed on the server yet.";
  throw new Error(msg);
}
async function ajLoad(force) {
  if (!window.__sb || !isPermAdmin() || S.aj.busy || (!force && Date.now() - S.aj.at < 20000)) return; S.aj.busy = true; S.aj.at = Date.now();
  try {
    const [cfg, runs, out] = await Promise.all([window.__sb.from("hr_docs").select("data").eq("path", "org/notify").maybeSingle(), window.__sb.rpc("hr_job_runs_list"), window.__sb.rpc("hr_outbox_list", { lim: 300 })]);
    S.aj.cfg = cfg.data?.data || {}; S.aj.runs = runs.error ? null : runs.data || []; S.aj.out = out.error ? null : out.data || [];
    S.aj.err = runs.error || out.error ? "The automatic jobs aren't installed on the server yet." : null;
    if (!S.aj.err) S.aj.status = await ajCall({ status: true }).catch((e) => ({ error: e.message }));
  } catch (e) { S.aj.err = e.message; } finally { S.aj.busy = false; }
  if (S.view.name === "autojobs") render();
}
const ajAgo = (t) => { if (!t) return "never"; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const ajWhen = (t) => (t ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(t)) : "");
const AJ_ST = { SENT: ["Sent", "c-ok"], QUEUED: ["Waiting to send", "c-blue"], NO_SENDER: ["Not sent: no email sender yet", "c-warn"], FAILED: ["Failed", "c-bad"], SKIPPED: ["No email on file", "c-gray"] };
const AJ_KIND = { decided: "Request decided", approval: "Needs a decision", payslip: "Payslip ready", applicant: "Applicant update", digest: "HR digest" };
const ajStep = (ok, title, sub) => `<li style="display:flex;gap:10px;align-items:flex-start;margin:0 0 10px"><span class="chip ${ok ? "c-ok" : "c-warn"}" style="min-width:64px;justify-content:center">${ok ? "Done" : "To do"}</span><div><b>${title}</b><div class="t-muted" style="font-size:13px">${sub}</div></div></li>`;
VIEWS.autojobs = () => {
  if (!isPermAdmin()) return noAccess();
  const A = S.aj; if (!A.cfg && !A.err) { ajLoad(true).catch(() => {}); return head("Users & Permissions", "Automatic notices") + '<section class="card"><p class="t-muted">Loading…</p></section>'; }
  const c = ajCfg(), st = A.status || {}, last = (A.runs || [])[0]?.data; const live = last?.lastAt && Date.now() - Date.parse(last.lastAt) < 25 * 60000;
  const list = (A.out || []).filter((m) => !A.q || `${m.to_email || ""} ${m.subject} ${AJ_KIND[m.kind] || ""}`.toLowerCase().includes(A.q.toLowerCase()));
  const chk = (k, label, sub) => `<label class="check" style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" name="k_${k}" ${c.kinds[k] ? "checked" : ""}><span><b>${label}</b><span class="t-muted" style="display:block;font-size:13px">${sub}</span></span></label>`;
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${Number(c.digestHour) === h ? "selected" : ""}>${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}</option>`).join("");
  return head("Users & Permissions", "Automatic notices") + `
  ${A.err ? `<section class="card" style="border-left:4px solid #c27c0e"><b>${esc(A.err)}</b><p class="t-muted" style="margin:6px 0 0;font-size:14px">Claude installs the server part (database schedule and the hr-jobs function) when you say "execute". The settings below can be filled in already.</p></section>` : ""}
  <section class="card"><div class="card-head"><h2>Setup</h2><button class="btn btn-ghost btn-sm" data-aj="refresh">Refresh</button></div>
    <ul style="list-style:none;padding:0;margin:0">
      ${ajStep(!A.err && live, "Schedule running", A.err ? "Not installed yet." : live ? `Runs every 10 minutes. Last run ${esc(ajAgo(last.lastAt))}.` : `Last run ${esc(ajAgo(last?.lastAt))}. It should run every 10 minutes; if this stays old, the schedule is off.`)}
      ${ajStep(!!st.sender && !!st.from, "Email sender connected", st.sender ? `Sending through ${st.sender === "resend" ? "Resend" : "Brevo"} as ${esc(st.from || "(MAIL_FROM not set)")}.` : "Add RESEND_API_KEY (or BREVO_API_KEY) and MAIL_FROM in Supabase > Edge Functions > Secrets. Until then nothing can be emailed.")}
      ${ajStep(c.on, "Notices switched on", c.on ? "People get emails as things happen." : "Tick “Send automatic notices” below when you're ready.")}
      ${ajStep(c.digestTo.length > 0, "HR digest recipients", c.digestTo.length ? esc(c.digestTo.join(", ")) : "Add at least one HR email address for the morning to-do list.")}
      ${c.sms ? ajStep(!!st.sms, "SMS account", st.sms ? "Texts go out through Semaphore." : "Add SEMAPHORE_API_KEY in the Supabase secrets, or untick SMS.") : ""}
    </ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-ghost btn-sm" data-aj="test" ${st.sender ? "" : "disabled"}>Send me a test email</button><button class="btn btn-ghost btn-sm" data-aj="run" ${A.err ? "disabled" : ""}>Run now</button><button class="btn btn-ghost btn-sm" data-aj="digest" ${A.err || !c.on ? "disabled" : ""}>Send today's digest now</button></div></section>
  <section class="card"><div class="card-head"><h2>Settings</h2></div>
    <form id="aj-form" class="form" style="display:grid;gap:12px;max-width:760px">
      <label class="check" style="display:flex;gap:8px;align-items:center;font-size:16px"><input type="checkbox" name="on" ${c.on ? "checked" : ""}><b>Send automatic notices</b></label>
      <div><b>What to send</b>
        ${chk("decided", "Request decided", "Tells the employee when their leave, overtime, attendance, reimbursement, FlexBen, change or certificate request is approved, not approved or ready.")}
        ${chk("approval", "New request to decide", "Tells the first approver in the approval chain (Needs action > Rules) and the approvers below when a request is filed.")}
        ${chk("payslip", "Payslip ready", "Tells each employee when a payroll is finalized. No amounts are put in the email.")}
        ${chk("applicant", "Applicant updates", "Thanks applicants for applying, sends interview schedules and tells them about requirements, a job offer, hiring or a decision not to proceed.")}
        ${chk("digest", "HR morning digest", "One email a day: overdue approvals, government filings, payroll cutoffs, final pay, contracts, regularization, expiring documents and disciplinary deadlines.")}
      </div>
      <label class="field"><span>HR digest goes to</span><textarea class="input" name="digestTo" rows="2" placeholder="hr@gd-prime.com, payroll@gd-prime.com">${esc(c.digestTo.join(", "))}</textarea></label>
      <label class="field"><span>Also tell these approvers about every new request</span><textarea class="input" name="approverTo" rows="2" placeholder="Leave empty to tell only the approval chain">${esc(c.approverTo.join(", "))}</textarea></label>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><label class="field" style="min-width:160px"><span>Digest time (Philippine time)</span><select class="input" name="digestHour">${hours}</select></label>
        <label class="field" style="flex:1;min-width:240px"><span>App address in emails</span><input class="input" name="appUrl" value="${esc(c.appUrl)}"></label>
        <label class="field" style="flex:1;min-width:240px"><span>Careers page address</span><input class="input" name="careersUrl" value="${esc(c.careersUrl)}"></label></div>
      <label class="field"><span>Company name in emails</span><input class="input" name="company" value="${esc(c.company)}"></label>
      <label class="check" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="sms" ${c.sms ? "checked" : ""}><span>Also send a short SMS to employees with a mobile number (needs a Semaphore account)</span></label>
      <div><button class="btn btn-primary" type="submit" ${S.canEdit ? "" : "disabled"}>Save settings</button></div>
    </form></section>
  ${(A.runs || []).length ? `<section class="card"><div class="card-head"><h2>Recent days</h2></div><div class="table-wrap"><table><thead><tr><th>Day</th><th class="num">Runs</th><th class="num">Changes checked</th><th class="num">Emails sent</th><th class="num">Failed</th><th>HR digest</th></tr></thead><tbody>
    ${A.runs.slice(0, 14).map(({ day, data: d }) => `<tr><td>${esc(fmtDate(day))}</td><td class="num">${d.runs || 0}</td><td class="num">${d.events || 0}</td><td class="num">${d.sent || 0}</td><td class="num">${d.failed ? `<b style="color:#a4262c">${d.failed}</b>` : 0}</td><td>${d.digestAt ? `${esc(ajWhen(d.digestAt))} · ${d.digestItems || 0} items` : '<span class="t-muted">Not sent</span>'}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
  <section class="card"><div class="card-head"><h2>Messages</h2><input class="input" type="search" id="aj-q" value="${esc(A.q)}" placeholder="Search address or subject" aria-label="Search messages" style="max-width:280px"></div>
    ${A.out == null ? '<p class="t-muted">Nothing yet.</p>' : `<div class="table-wrap"><table><thead><tr><th>When</th><th>To</th><th>What</th><th>Status</th></tr></thead><tbody>
    ${list.slice(0, 300).map((m) => { const s = AJ_ST[m.status] || [m.status, "c-gray"]; return `<tr><td style="white-space:nowrap">${esc(ajWhen(m.at))}</td><td>${esc(m.to_email || m.mobile || "")}${m.mobile && m.to_email ? `<div class="t-muted" style="font-size:12px">SMS ${esc(m.mobile)}${m.sms_status ? ` · ${esc((AJ_ST[m.sms_status] || [m.sms_status])[0])}` : ""}</div>` : ""}</td>
      <td><details${A.open === m.id ? " open" : ""}><summary data-aj-open="${esc(m.id)}" style="cursor:pointer"><b>${esc(m.subject)}</b><span class="t-muted" style="font-size:12px"> · ${esc(AJ_KIND[m.kind] || m.kind)}</span></summary><pre style="white-space:pre-wrap;font:inherit;font-size:13px;margin:8px 0 0">${esc(m.body)}</pre></details></td>
      <td><span class="chip ${s[1]}">${esc(s[0])}</span>${m.err ? `<div class="t-muted" style="font-size:12px;max-width:260px">${esc(m.err)}</div>` : ""}</td></tr>`; }).join("") || '<tr><td colspan="4" class="empty">No messages yet.</td></tr>'}</tbody></table></div>`}</section>`;
};
document.addEventListener("click", async (ev) => {
  const o = ev.target.closest("[data-aj-open]"); if (o) { S.aj.open = S.aj.open === o.dataset.ajOpen ? null : o.dataset.ajOpen; return; }
  const t = ev.target.closest("[data-aj]"); if (!t || !isPermAdmin()) return; const k = t.dataset.aj;
  if (k === "refresh") { await ajLoad(true); toast("Refreshed."); return; }
  t.disabled = true;
  try {
    if (k === "test") { const r = await ajCall({ test: true }); toast(`Test email sent to ${r.to}. Check the inbox (and spam folder).`); }
    else { const r = await ajCall(k === "digest" ? { digest: true } : { run: true }); toast(k === "digest" ? (r.digestAt ? `Digest done: ${r.digestItems || 0} items.` : "Today's digest was already sent.") : `Done: ${r.sent || 0} sent today so far.`); }
  } catch (e) { toast(e.message); } finally { t.disabled = false; }
  ajLoad(true).catch(() => {});
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "aj-q") return; S.aj.q = ev.target.value; const pos = ev.target.selectionStart; render(); const i = document.getElementById("aj-q"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "aj-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!isPermAdmin() || !S.canEdit) return;
  const fd = new FormData(f); const emails = (s) => [...new Set(String(s || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(x)))];
  const url = (s, d) => (/^https:\/\/[^\s<>"']+$/i.test(String(s || "").trim()) ? String(s).trim().replace(/\/+$/, "") : d);
  const bad = String(fd.get("digestTo") || "").split(/[,;\s]+/).filter((x) => x.trim() && !emails(x).length);
  if (bad.length) { toast(`Check these email addresses: ${bad.slice(0, 3).join(", ")}`); return; }
  const data = { on: fd.get("on") === "on", sms: fd.get("sms") === "on", digestHour: Number(fd.get("digestHour")) || 0, digestTo: emails(fd.get("digestTo")), approverTo: emails(fd.get("approverTo")),
    appUrl: url(fd.get("appUrl"), AJ_DEF.appUrl), careersUrl: url(fd.get("careersUrl"), AJ_DEF.careersUrl), company: String(fd.get("company") || "").trim().slice(0, 120) || AJ_DEF.company,
    kinds: Object.fromEntries(Object.keys(AJ_DEF.kinds).map((k) => [k, fd.get(`k_${k}`) === "on"])) };
  try { await S.db.doc("org/notify").set(data); S.aj.cfg = data; logActivity(`Updated automatic notice settings (${data.on ? "on" : "off"})`); toast(data.on ? "Saved. Automatic notices are on." : "Saved. Automatic notices are off."); render(); }
  catch (e) { toast(`Couldn't save: ${e.message || e}`); }
}, true);
