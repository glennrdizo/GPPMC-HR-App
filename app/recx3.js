/* ---------- offer letter requests (with approval) and the recruitment flow ---------- */
Object.assign(S, { olrTab: "PENDING" });
Object.assign(ICON, { flow: '<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v4h11v4"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' });
{
  const tal = NAV.find(([g]) => g === "Talent"); const i = tal[1].findIndex(([v]) => v === "mplan");
  tal[1].splice(i, 0, ["rflow", "Recruitment flow", "flow"]); const k = tal[1].findIndex(([v]) => v === "mpr"); tal[1].splice(k + 1, 0, ["olr", "Offer letter requests", "mail"]);
  Object.assign(SECTION_OF, { rflow: "rflow", olr: "olr" });
}
const OLR = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved, letter ready", "c-blue"], REJECTED: ["Not approved", "c-bad"], SENT: ["Sent to applicant", "c-blue"], ACCEPTED: ["Accepted", "c-ok"], DECLINED: ["Declined", "c-gray"] };
const olrList = () => listOf(S.apps).filter((a) => a.olr).sort((x, y) => (y.olr.d || "").localeCompare(x.olr.d || ""));
function olrCard(a, j) {
  const r = a.olr; const ed = S.canEdit; const live = inProcess(a) && !isBL(a);
  const form = (v) => `<form id="olr-form" class="form-grid" style="align-items:end" data-keep>
      <div class="field"><label for="ol-title">Position</label><input class="input" id="ol-title" value="${esc(v.title || pos(j?.posId)?.title || j?.title || "")}" required></div>
      <div class="field"><label for="ol-emp">Employment status</label><select class="input" id="ol-emp">${opts(Object.entries(STATUS).map(([k, x]) => [k, x[0]]), v.empType || j?.empType || "PROBATIONARY")}</select></div>
      <div class="field"><label for="ol-rate">Pay (PHP, ${(v.payType || j?.payType) === "DAILY" ? "a day" : "a month"}) <span class="req">*</span></label><input class="input" id="ol-rate" type="number" min="0" step="0.01" required value="${v.rate ?? a.offer?.rate ?? j?.rate ?? ""}"></div>
      <div class="field"><label for="ol-allow">Allowances (PHP a month)</label><input class="input" id="ol-allow" type="number" min="0" step="0.01" value="${v.allow ?? ""}"></div>
      <div class="field"><label for="ol-start">Start date <span class="req">*</span></label><input class="input" id="ol-start" type="date" required value="${v.start || a.offer?.start || addDays(todayISO(), 14)}"></div>
      <div class="field"><label for="ol-site">Work location</label><input class="input" id="ol-site" value="${esc(v.site || (j?.projectId ? S.projects.get(j.projectId)?.name || "" : "Head Office"))}"></div>
      <div class="field" style="grid-column:1/-1"><label for="ol-notes">Notes for the approver</label><input class="input" id="ol-notes" value="${esc(v.notes || "")}" placeholder="e.g. Applicant asked ₱2,000 more; matches the budget in the manpower request"></div>
      <div style="display:flex;gap:8px"><button class="btn btn-primary">${r ? "Send the request again" : "Request offer letter"}</button>${S.olrEdit ? `<button type="button" class="btn btn-ghost" data-olr-edit="">Cancel</button>` : ""}</div></form>`;
  const facts = r ? `<dl class="facts" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${tfact("Position", esc(r.title))}${tfact("Status", esc(STATUS[r.empType]?.[0] || ""))}${tfact("Pay", payLabel(r.rate, r.payType))}${tfact("Allowances", r.allow ? peso.format(r.allow) + " a month" : "")}${tfact("Start", fmtDate(r.start))}${tfact("Location", esc(r.site))}</dl>
    <p class="t-muted" style="margin:10px 0 0;font-size:13px">Requested ${fmtDate(r.d)}${r.by ? ` by ${esc(recName(r.by))}` : ""}${r.notes ? ` · ${esc(r.notes)}` : ""}${r.decided ? ` · ${r.status === "REJECTED" ? "not approved" : "approved"} ${fmtDate(r.decided.d)}${r.decided.by ? ` by ${esc(recName(r.decided.by))}` : ""}${r.decided.note ? `: ${esc(r.decided.note)}` : ""}` : ""}</p>` : "";
  let acts = "";
  if (r && ed) {
    if (r.status === "PENDING") acts = `<form id="olr-dec" class="panel" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:end" data-keep><div class="field" style="flex:1;min-width:200px"><label for="olr-note">Approver's note (optional)</label><input class="input" id="olr-note"></div><button class="btn btn-primary" value="APPROVED">Approve</button><button class="btn btn-ghost" value="REJECTED">Don't approve</button></form>`;
    else if (["APPROVED", "SENT", "ACCEPTED"].includes(r.status)) acts = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-gold" data-olr-letter="${a.id}">${icon("download", 16)}Download offer letter</button>
      ${r.status === "APPROVED" ? `<button class="btn btn-ghost" data-olr-set="${a.id}:SENT">Mark as sent</button>` : ""}${r.status === "SENT" ? `<button class="btn btn-primary" data-olr-set="${a.id}:ACCEPTED">Applicant accepted</button><button class="btn btn-ghost" data-olr-set="${a.id}:DECLINED">Applicant declined</button>` : ""}</div>`;
    if (["REJECTED", "DECLINED"].includes(r.status) && live && !S.olrEdit) acts += `<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-olr-edit="1">Make a new request</button></div>`;
  }
  return `<section class="card"><div class="card-head"><h2>Offer letter</h2>${r ? `<span class="chip ${OLR[r.status][1]}">${OLR[r.status][0]}</span>` : ""}</div>
    ${r ? facts + acts : ""}${ed && live && (!r || S.olrEdit) ? (r ? '<hr class="rx-hr">' : '<p class="t-muted" style="margin:0 0 12px;font-size:14px">Ask for approval of the offer. Once approved, the letter can be downloaded and sent.</p>') + form(r || {}) : !r ? '<p class="t-muted" style="margin:0">No offer letter request yet.</p>' : ""}</section>`;
}
{
  const base = VIEWS.applicant;
  VIEWS.applicant = () => { const a = S.apps.get(S.view.id); let html = base(); if (!a) return html; const j = S.jobs.get(a.jobId);
    if (!a.olr && !(inProcess(a) && !isBL(a) && S.canEdit) ) return html;
    const i = html.indexOf('<div class="two">'); return i >= 0 ? html.slice(0, i) + olrCard(a, j) + html.slice(i) : html + olrCard(a, j); };
}
function offerLetter(a) {
  const r = a.olr; const j = S.jobs.get(a.jobId); const co = esc(S.org?.companyName || "the company"); const T = TSET();
  return saveLetter(`Offer-${a.last}-${a.first}.html`.replace(/\s+/g, ""), `Offer letter ${appName(a)}`, `<p>${fmtDate(todayISO())}</p>
    <p><b>${esc([a.first, a.middle, a.last].filter(Boolean).join(" "))}</b>${a.address ? `<br>${esc(a.address)}` : ""}</p>
    <p>Dear ${esc(a.first)},</p>
    <p>We are pleased to offer you the position of <b>${esc(r.title)}</b> at ${co}, assigned to <b>${esc(r.site || "Head Office")}</b>, under the following terms:</p>
    <table><tr><td>Employment status</td><td><b>${esc(STATUS[r.empType]?.[0] || "")}</b>${r.empType === "PROBATIONARY" ? " (up to six months, Labor Code Art. 296)" : ""}</td></tr>
      <tr><td>Basic pay</td><td><b>${payLabel(r.rate, r.payType)}</b></td></tr>${r.allow ? `<tr><td>Allowances</td><td><b>${peso.format(r.allow)} a month</b></td></tr>` : ""}
      <tr><td>Start date</td><td><b>${fmtDate(r.start)}</b></td></tr>
      <tr><td>Benefits</td><td>SSS, PhilHealth and Pag-IBIG coverage, 13th month pay, service incentive leave, and other benefits under company policy</td></tr></table>
    ${r.empType === "PROBATIONARY" ? "<p>The standards for regularization will be explained to you on your first day. You will become a regular employee if you meet them within the probationary period.</p>" : ""}
    ${r.empType === "PROJECT_BASED" ? `<p>Your employment is for the duration of the project${j?.projectId && S.projects.get(j.projectId)?.end ? ` (expected to end ${fmtDate(S.projects.get(j.projectId).end)})` : ""} or the phase of work assigned to you.</p>` : ""}
    <p>This offer depends on your completion of the pre-employment requirements (NBI clearance, medical exam and government numbers). Please sign below to accept this offer${T.applyHow ? "" : ""} within five (5) days.</p>
    <p style="margin-top:48px">${signer()}</p>
    <p style="margin-top:48px">Accepted by: ______________________________ Date: ______________<br><span style="font-size:13px">${esc(appName(a))}</span></p>`);
}
VIEWS.olr = () => {
  const all = olrList(); const tab = S.olrTab || "PENDING"; const list = tab === "ALL" ? all : all.filter((a) => a.olr.status === tab); const n = (s) => all.filter((a) => a.olr.status === s).length;
  return head("Recruitment", "Offer letter requests") + `
    <section class="stats"><div class="card stat"><span class="label">Waiting for approval</span><span class="value">${n("PENDING")}</span><span class="note t-muted">ask from recruiters</span></div>
      <div class="card stat"><span class="label">Approved, not sent</span><span class="value">${n("APPROVED")}</span><span class="note t-muted">download and send the letter</span></div>
      <div class="card stat"><span class="label">Sent, waiting for answer</span><span class="value">${n("SENT")}</span><span class="note t-muted">applicant still deciding</span></div>
      <div class="card stat"><span class="label">Accepted</span><span class="value">${n("ACCEPTED")}</span><span class="note t-muted">${n("DECLINED")} declined</span></div></section>
    ${tabsBar(tab, [["PENDING", `Waiting (${n("PENDING")})`], ["APPROVED", "Approved"], ["SENT", "Sent"], ["ACCEPTED", "Accepted"], ["ALL", "All"]], "olr-tab")}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Applicant</th><th>Position</th><th class="num">Pay</th><th>Start</th><th>Requested</th><th>Status</th></tr></thead><tbody>
      ${list.map((a) => `<tr class="go" data-app="${a.id}" tabindex="0"><td><b>${esc(appName(a))}</b><div class="t-muted" style="font-size:13px">${esc(a.olr.site || "")}</div></td><td>${esc(a.olr.title)}</td><td class="num">${payLabel(a.olr.rate, a.olr.payType)}</td><td style="white-space:nowrap">${fmtDate(a.olr.start)}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(a.olr.d)}${a.olr.by ? `<div style="font-size:13px">${esc(recName(a.olr.by))}</div>` : ""}</td><td><span class="chip ${OLR[a.olr.status][1]}">${OLR[a.olr.status][0]}</span></td></tr>`).join("") || `<tr><td colspan="6" class="empty">${all.length ? "Nothing here." : "No offer letter requests yet. Recruiters request one from the applicant's page."}</td></tr>`}
    </tbody></table></div></section>`;
};

/* ---------- recruitment flow ---------- */
VIEWS.rflow = () => {
  const today = todayISO(); const apps = listOf(S.apps); const jobs = listOf(S.jobs); const y = Number(today.slice(0, 4));
  const plan = typeof planRows === "function" ? planRows(y) : []; const st = (k) => apps.filter((a) => a.stage === k).length;
  const open = jobs.filter((j) => j.status === "OPEN"); const unposted = open.filter((j) => !jobPosted(j).length).length;
  const ivWeek = apps.flatMap((a) => (a.ivs || []).filter((i) => i.result === "PENDING" && i.d >= today && i.d <= addDays(today, 7))).length;
  const olr = (s) => apps.filter((a) => a.olr?.status === s).length;
  const steps = [
    ["plan", "Plan the manpower", "HR with department heads", "Set how many people each department and project needs this year.", `${plan.reduce((s, r) => s + Math.max(0, r.gap), 0)} people to add`, "mplan"],
    ["people", "Request manpower", "Department head or project manager", "Fill in a manpower request: position, number, needed-by date and reason.", `${listOf(S.mpr).filter((r) => r.status === "PENDING").length} waiting for approval`, "mpr"],
    ["shield", "Approve the request", "HR manager or general manager", "Approve or decline. An approved request becomes a job opening in one click.", `${listOf(S.mpr).filter((r) => r.status === "APPROVED").length} approved, no job yet`, "mpr"],
    ["search", "Open and post the job", "Recruiter", "Write the ad and post it on Indeed, LinkedIn, Facebook, JobStreet and the company website.", `${open.length} open · ${unposted} not yet posted`, "hiring"],
    ["file", "Receive and screen applicants", "Recruiter", "Record the CV, skills and qualification answers. Check the blacklist. Assign a recruiter.", `${st("APPLIED") + st("SCREENING")} to screen`, "hiring"],
    ["quiz", "Give the recruitment test", "Recruiter, applicant", "Engineering, Accounting, Operations or HR test, on screen or on paper.", `${apps.reduce((s, a) => s + (a.tests || []).length, 0)} tests recorded`, "rtests"],
    ["cal", "Interview", "Recruiter and hiring manager", "Schedule on the interview calendar, record the result and the video.", `${ivWeek} in the next 7 days`, "ivcal"],
    ["mail", "Request the offer letter", "Recruiter, then approver", "Propose pay, allowances and start date. The approver approves, then the letter is downloaded and sent.", `${olr("PENDING")} waiting · ${olr("APPROVED")} to send`, "olr"],
    ["star", "Job offer", "Applicant", "Applicant signs and accepts, or declines.", `${olr("SENT")} waiting for answer`, "olr"],
    ["shield", "Pre-employment requirements", "Applicant, HR", "NBI clearance, medical exam, PSA birth certificate, SSS, PhilHealth, Pag-IBIG and TIN.", `${st("REQUIREMENTS") + st("OFFER")} in progress`, "hiring"],
    ["door", "Hire and onboard", "HR", "Hire creates the 201 file and starts the onboarding checklist.", `${apps.filter((a) => a.stage === "HIRED" && (a.stageAt || "") >= addDays(today, -30)).length} hired in 30 days`, "lifecycle"],
  ];
  return head("Recruitment", "Recruitment flow") + `<p class="t-muted" style="margin:0 0 6px">The steps from planning to hiring, with who does each one and what is waiting now. Click a step to go there.</p>
    <ol class="rf">${steps.map(([ic, t, who, what, now, v], i) => `<li class="rf-step"><button class="rf-card" data-go="${v}"><span class="rf-n">${i + 1}</span><span class="rf-ic">${icon(ic, 20)}</span>
      <span class="rf-body"><b class="rf-t">${esc(t)}</b><span class="rf-who">${esc(who)}</span><span class="rf-what">${esc(what)}</span></span><span class="rf-now">${esc(now)}</span></button></li>`).join("")}</ol>
    <section class="card rf-side"><b>At any step:</b> the recruiter can <b>refuse</b> an applicant (with a reason) or <b>blacklist</b> them. Blacklisted applicants are listed under <button class="link" data-go="blacklist">Blacklisted applicants</button>, and anyone applying again with the same mobile, email or name is flagged. Progress is measured on <button class="link" data-go="ranalysis">Recruitment analysis</button>.</section>`;
};

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-olr-edit],[data-olr-letter],[data-olr-set],[data-olr-tab]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.olrTab) { S.olrTab = d.olrTab; render(); return; }
  if (d.olrEdit !== undefined) { S.olrEdit = !!d.olrEdit; render(); return; }
  if (d.olrLetter) return offerLetter(S.apps.get(d.olrLetter));
  if (d.olrSet) { const [id, s] = d.olrSet.split(":"); const a = S.apps.get(id); const r = { ...a.olr, status: s, [s.toLowerCase()]: todayISO() };
    const offer = { ...(a.offer || {}), rate: r.rate, start: r.start, status: s === "SENT" ? "SENT" : s }; const stage = stageIdx(a.stage) < stageIdx("OFFER") ? "OFFER" : a.stage;
    try { await put("applicants", { ...a, olr: r, offer, stage, stageAt: stage !== a.stage ? todayISO() : a.stageAt }); logActivity(`Offer letter for ${appName(a)}: ${OLR[s][0].toLowerCase()}`); toast(s === "ACCEPTED" ? `${a.first} accepted. Finish the requirements, then hire.` : s === "DECLINED" ? "Marked as declined." : "Marked as sent."); render(); } catch { toast("Couldn't save. Try again."); }
  }
}, true);
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["olr-form", "olr-dec"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const a = S.apps.get(S.view.id); const j = S.jobs.get(a.jobId);
  try {
    if (f.id === "olr-form") { const rate = Number($("#ol-rate").value); const start = $("#ol-start").value; if (!rate || !start) return toast("Enter the pay and start date.");
      const r = { status: "PENDING", d: todayISO(), by: S.myId || null, title: $("#ol-title").value.trim(), empType: $("#ol-emp").value, rate, payType: j?.payType || "MONTHLY", allow: Number($("#ol-allow").value) || null, start, site: $("#ol-site").value.trim() || null, notes: $("#ol-notes").value.trim() || null };
      await put("applicants", { ...a, olr: r, recruiterId: a.recruiterId || S.myId || null }); S.olrEdit = false; logActivity(`Requested an offer letter for ${appName(a)}`); toast("Offer letter request sent for approval."); render(); return; }
    if (f.id === "olr-dec") { const s = ev.submitter?.value || "APPROVED";
      await put("applicants", { ...a, olr: { ...a.olr, status: s, decided: { d: todayISO(), by: S.myId || null, note: $("#olr-note").value.trim() || null } }, offer: s === "APPROVED" ? { ...(a.offer || {}), rate: a.olr.rate, start: a.olr.start, status: "DRAFT" } : a.offer });
      logActivity(`${s === "APPROVED" ? "Approved" : "Did not approve"} the offer letter for ${appName(a)}`); toast(s === "APPROVED" ? "Approved. The offer letter can now be downloaded." : "Marked as not approved."); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
}, true);

/* ---------- dashboard: regular employees shortcut and birthdays ---------- */
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-dash-reg],[data-bday-m]"); if (!t) return; ev.stopImmediatePropagation();
  if (t.dataset.dashReg) { S.empFilter = { ...S.empFilter, status: "REGULAR", show: "active", page: 1 }; go("employees"); return; }
  S.bdayNext = t.dataset.bdayM === "next"; render(); }, true);
function dashBirthdays(emps) {
  const today = todayISO(); const d0 = parseISO(today); const next = !!S.bdayNext; const ref = new Date(d0.getFullYear(), d0.getMonth() + (next ? 1 : 0), 1);
  const m = ref.getMonth(); const y = ref.getFullYear(); const mmdd = today.slice(5);
  const list = emps.filter((e) => e.birth && parseISO(e.birth).getMonth() === m).map((e) => { const b = parseISO(e.birth); return { e, day: b.getDate(), age: y - b.getFullYear(), md: e.birth.slice(5) }; }).sort((a, b) => a.day - b.day || fullName(a.e).localeCompare(fullName(b.e)));
  const todays = next ? [] : list.filter((x) => x.md === mmdd); const label = ref.toLocaleDateString("en-PH", { month: "long" });
  return `<section class="card bday"><div class="card-head"><h2>🎂 Birthdays in ${esc(label)}</h2><span class="t-muted" style="font-size:13px">${list.length} ${list.length === 1 ? "celebrant" : "celebrants"}</span>
      <div class="tabs" role="tablist" style="margin-left:auto"><button class="tab" role="tab" aria-selected="${!next}" data-bday-m="this">This month</button><button class="tab" role="tab" aria-selected="${next}" data-bday-m="next">Next month</button></div></div>
    ${todays.length ? `<div class="bday-today">🎉 Happy birthday today to ${todays.map((x) => `<button class="link" data-emp="${x.e.id}">${esc(fullName(x.e))}</button>`).join(", ")}!</div>` : ""}
    ${list.length ? `<div class="bday-grid">${list.map((x) => { const past = !next && x.md < mmdd; const isToday = !next && x.md === mmdd;
      return `<button class="bday-item${isToday ? " is-today" : ""}${past ? " is-past" : ""}" data-emp="${x.e.id}">${avatar(x.e, 40)}<span class="who"><span class="name">${esc(fullName(x.e))}</span><span class="sub">${esc(pos(x.e.posId)?.title || "")}${x.e.projectId ? ` · ${esc(S.projects.get(x.e.projectId)?.name || "")}` : ""}</span></span>
        <span class="bday-d"><b>${esc(label.slice(0, 3))} ${x.day}</b><small>${isToday ? "Today" : `turns ${x.age}`}</small></span></button>`; }).join("")}</div>` : `<div class="empty-state"><span class="es-ic">${icon("cal", 22)}</span><p>No birthdays in ${esc(label)}. Add birth dates on the 201 files to see them here.</p></div>`}
  </section>`;
}
