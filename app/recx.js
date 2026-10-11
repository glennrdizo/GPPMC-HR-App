/* ---------- recruitment extras: applicant file (skills, tests, videos, answers), recruiter, hire/refuse, blacklist, interview calendar, manpower requests ---------- */
Object.assign(TCOLS, { mpr: "mpr" });
Object.assign(S, { mpr: new Map(), ivMonth: null, blq: "", mprTab: "PENDING" });
Object.assign(ICON, {
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
});
{
  const tal = NAV.find(([g]) => g === "Talent"); const h = tal[1].find(([v]) => v === "hiring");
  if (h) { h[3] = [...(h[3] || []), ["ivcal", "Interview calendar", "cal"], ["blacklist", "Blacklisted applicants", "ban"]]; tal[1].splice(tal[1].indexOf(h) + 1, 0, ["mpr", "Manpower requests", "people"]); }
  Object.assign(SECTION_OF, { ivcal: "ivcal", blacklist: "blacklist", mpr: "mpr", mprForm: "mpr", mprView: "mpr" });
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("mpr").limit(1000).onSnapshot((snap) => { S.mpr = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {}); }; }

/* Recruiters are the people who use this app (from Users & permissions). Names come from their claude.ai profile at render time. */
function recruiterIds() { const a = S.access || {}; return [...new Set([S.myId, ...Object.keys(a.users || {}), ...Object.keys(a.seen || {}), ...listOf(S.apps).map((x) => x.recruiterId)].filter(Boolean))]; }
function recName(id) {
  if (!id) return ""; const n = S.profiles?.[id]?.name; if (n) return id === S.myId ? `${n} (you)` : n;
  if (!S.recProfReq?.has(id) && S.userCap?.profiles) { S.recProfReq = S.recProfReq || new Set(); const ids = recruiterIds().filter((x) => !S.recProfReq.has(x)); ids.forEach((x) => S.recProfReq.add(x));
    S.userCap.profiles(ids).then((ps) => { S.profiles = { ...(S.profiles || {}), ...ps }; render(); }).catch(() => {}); }
  return id === S.myId ? "You" : "A recruiter";
}
const isBL = (a) => !!a.blacklist;
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
function blMatches(a) {
  const nm = `${a.first} ${a.last}`.toLowerCase().trim();
  return listOf(S.apps).filter((b) => b.id !== a.id && isBL(b) && ((digits(a.mobile) && digits(a.mobile) === digits(b.mobile)) || (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase())
    || (`${b.first} ${b.last}`.toLowerCase().trim() === nm && (!a.birth || !b.birth || a.birth === b.birth))));
}
const DEF_QUESTIONS = ["How many years of experience do you have in this kind of work?", "Do you have the license, NC or certificate this job needs?", "When can you start?", "Are you willing to be assigned to any project site?"];
const TEST_RES = { PASSED: ["Passed", "c-ok"], FAILED: ["Did not pass", "c-bad"], PENDING: ["Waiting for result", "c-warn"] };
const MODES = [["IN_PERSON", "In person"], ["VIDEO", "Video call"], ["PHONE", "Phone"]];

/* ---------- applicant page: decision bar, recruiter, skills, answers, tests, videos ---------- */
function appDecision(a, j) {
  const ed = S.canEdit; const live = inProcess(a); const m = blMatches(a);
  return `${isBL(a) ? `<div class="notice rx-bl"><span>${icon("ban", 18)} <b>Blacklisted</b> on ${fmtDate(a.blacklist.d)}${a.blacklist.by ? ` by ${esc(recName(a.blacklist.by))}` : ""}. Reason: ${esc(a.blacklist.reason)}</span>${ed ? `<button class="btn btn-ghost btn-sm" data-rx-unbl="${a.id}">Remove from blacklist</button>` : ""}</div>` : ""}
    ${m.length ? `<div class="notice rx-bl"><span>${icon("alert", 18)} This applicant matches ${m.length === 1 ? "a blacklisted applicant" : `${m.length} blacklisted applicants`}: ${m.map((b) => `<button class="link" data-app="${b.id}">${esc(appName(b))}</button> (${esc(b.blacklist.reason)})`).join(", ")}. Check before going further.</span></div>` : ""}
    <section class="card rx-dec"><div class="rx-dec-row">
      <div class="field" style="min-width:220px;flex:1"><label for="rx-rec">Recruiter in charge</label>
        ${ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="rx-rec" data-rx-rec="${a.id}" style="flex:1;min-width:160px">${opts(recruiterIds().map((id) => [id, recName(id)]), a.recruiterId || "", "Not assigned")}</select>${S.myId && a.recruiterId !== S.myId ? `<button class="btn btn-ghost btn-sm" data-rx-me="${a.id}">Assign to me</button>` : ""}</div>`
          : `<div>${a.recruiterId ? esc(recName(a.recruiterId)) : '<span class="t-muted">Not assigned</span>'}</div>`}</div>
      ${ed && live && !isBL(a) ? `<div class="rx-acts"><button class="btn btn-gold" data-rx-hire="${a.id}">${icon("star", 16)}Hire</button><button class="btn btn-ghost" data-rx-refuse="${a.id}">Refuse</button></div>` : ""}
      ${ed && !isBL(a) ? `<button class="btn btn-danger btn-sm" data-rx-bl="${a.id}">${icon("ban", 16)}Blacklist</button>` : ""}</div>
      ${a.refused && a.stage === "REJECTED" ? `<p class="t-muted" style="margin:10px 0 0;font-size:14px">Refused on ${fmtDate(a.refused.d)}${a.refused.by ? ` by ${esc(recName(a.refused.by))}` : ""}${a.refused.reason ? `: ${esc(a.refused.reason)}` : ""}</p>` : ""}
      ${S.rxAsk?.id === a.id ? `<form id="rx-ask" class="panel" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:end" data-keep>
        <div class="field" style="flex:1;min-width:240px"><label for="rx-why">${S.rxAsk.kind === "bl" ? "Why is this applicant blacklisted?" : "Reason for refusing"}${S.rxAsk.kind === "bl" ? ' <span class="req">*</span>' : ""}</label>
        <input class="input" id="rx-why" list="rx-why-list" placeholder="${S.rxAsk.kind === "bl" ? "e.g. Falsified documents, failed drug test, previous dismissal for cause" : "e.g. Lacks required license"}" ${S.rxAsk.kind === "bl" ? "required" : ""}>
        <datalist id="rx-why-list">${(S.rxAsk.kind === "bl" ? ["Falsified documents or credentials", "Failed drug test", "Dismissed for just cause before", "Did not show up after accepting the offer", "Misconduct during the hiring process"] : ["Lacks the required experience", "Lacks the required license or certificate", "Did not pass the test", "Did not pass the interview", "Asked pay is above the budget", "Position already filled"]).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>
        <button class="btn ${S.rxAsk.kind === "bl" ? "btn-danger" : "btn-primary"}">${S.rxAsk.kind === "bl" ? "Blacklist applicant" : "Refuse applicant"}</button><button type="button" class="btn btn-ghost" data-rx-cancel="1">Cancel</button></form>` : ""}
    </section>`;
}
function appFile(a, j) {
  const ed = S.canEdit; const qs = j?.questions?.length ? j.questions : DEF_QUESTIONS; const ans = a.answers || {};
  const tests = a.tests || []; const vids = a.videos || []; const skills = a.skills || [];
  return `<div class="two">
    <section class="card"><div class="card-head"><h2>Skills</h2></div>
      <div class="chips" style="display:flex;flex-wrap:wrap;gap:6px">${skills.map((s, i) => `<span class="chip c-blue rx-skill">${esc(s)}${ed ? `<button class="rx-x" data-rx-skill-del="${a.id}:${i}" aria-label="Remove ${esc(s)}">×</button>` : ""}</span>`).join("") || '<span class="t-muted">No skills listed yet.</span>'}</div>
      ${ed ? `<form id="rx-skill" style="display:flex;gap:8px;margin-top:12px" data-keep><input class="input" id="rx-skill-in" placeholder="Add skills, separated by commas (e.g. AutoCAD, welding 6G, driving)" aria-label="Add skills" style="flex:1;min-width:0"><button class="btn btn-ghost btn-sm">Add</button></form>` : ""}
    </section>
    <section class="card"><div class="card-head"><h2>Test results</h2></div>
      ${tests.length ? `<div class="table-wrap"><table><thead><tr><th>Test</th><th>Date</th><th class="num">Score</th><th>Result</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>${tests.map((t, i) => `<tr><td><b>${esc(t.name)}</b>${t.notes ? `<div class="t-muted" style="font-size:13px">${esc(t.notes)}</div>` : ""}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(t.d)}</td><td class="num">${t.score != null ? `${t.score}${t.of ? ` / ${t.of}` : ""}` : "—"}</td><td><span class="chip ${TEST_RES[t.result]?.[1] || "c-gray"}">${TEST_RES[t.result]?.[0] || ""}</span></td>${ed ? `<td class="num"><button class="link danger" data-rx-test-del="${a.id}:${i}">Remove</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No tests recorded yet.</p>'}
      ${ed ? `<form id="rx-test" class="panel form-grid" style="margin-top:12px;align-items:end;grid-template-columns:repeat(auto-fill,minmax(130px,1fr))" data-keep>
        <div class="field" style="grid-column:1/-1"><label for="rx-t-name">Test</label><input class="input" id="rx-t-name" list="rx-t-list" required placeholder="e.g. Trade test, written exam, drug test"><datalist id="rx-t-list">${["Written exam", "Trade test", "Practical skills test", "Drug test", "Medical exam", "Personality test", "Typing test"].map((x) => `<option value="${x}">`).join("")}</datalist></div>
        <div class="field"><label for="rx-t-d">Date</label><input class="input" id="rx-t-d" type="date" value="${todayISO()}"></div>
        <div class="field"><label for="rx-t-score">Score</label><input class="input" id="rx-t-score" type="number" step="any"></div>
        <div class="field"><label for="rx-t-of">Out of</label><input class="input" id="rx-t-of" type="number" step="any"></div>
        <div class="field"><label for="rx-t-res">Result</label><select class="input" id="rx-t-res">${opts(Object.entries(TEST_RES).map(([k, v]) => [k, v[0]]), "PASSED")}</select></div>
        <div class="field" style="grid-column:1/-1"><label for="rx-t-notes">Notes</label><input class="input" id="rx-t-notes"></div>
        <div><button class="btn btn-ghost btn-sm">Add result</button></div></form>` : ""}
    </section></div>
    <div class="two">
    <section class="card"><div class="card-head"><h2>Qualification answers</h2>${ed && S.rxEditAns !== a.id ? `<button class="link" data-rx-ans-edit="${a.id}">${Object.keys(ans).length ? "Edit answers" : "Record answers"}</button>` : ""}</div>
      ${ed && S.rxEditAns === a.id ? `<form id="rx-ans" class="stack" style="gap:12px" data-keep>${qs.map((q, i) => `<div class="field"><label for="rx-q${i}">${esc(q)}</label><textarea class="input" id="rx-q${i}" rows="2" data-q="${esc(q)}">${esc(ans[q] || "")}</textarea></div>`).join("")}
        <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm">Save answers</button><button type="button" class="btn btn-ghost btn-sm" data-rx-ans-edit="">Cancel</button></div></form>`
        : `<dl class="rx-qa">${qs.map((q) => `<dt>${esc(q)}</dt><dd>${ans[q] ? esc(ans[q]) : '<span class="t-muted">No answer yet</span>'}</dd>`).join("")}</dl>`}
      ${j ? `<p class="t-muted" style="margin:12px 0 0;font-size:13px">${j.questions?.length ? "Questions" : "Standard questions"} come from the <button class="link" data-job="${j.id}">${esc(j.title)}</button> job page.</p>` : ""}
    </section>
    <section class="card"><div class="card-head"><h2>Interview videos</h2></div>
      ${vids.length ? `<div class="stack" style="gap:14px">${vids.map((v, i) => `<div class="rx-vid">${v.id ? `<video controls preload="metadata" src="/_blob/${esc(v.id)}"></video>` : ""}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:14px">${esc(v.name || "Interview video")}</b><span class="t-muted" style="font-size:13px">${fmtDate(v.d)}</span>${v.url ? `<a class="link" href="${esc(v.url)}" target="_blank" rel="noopener">Open video</a>` : ""}${ed ? `<button class="link danger" style="margin-left:auto" data-rx-vid-del="${a.id}:${i}">Remove</button>` : ""}</div></div>`).join("")}</div>` : '<p class="t-muted" style="margin:0">No interview videos yet.</p>'}
      ${ed ? `<div class="panel" style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
        ${S.assets ? `<label class="btn btn-ghost btn-sm" style="align-self:flex-start;cursor:pointer">${icon("video", 16)}Upload a video (MP4, WebM or MOV, up to 20 MB)<input type="file" id="rx-vid-file" accept="video/mp4,video/webm,video/quicktime" hidden></label>` : ""}
        <form id="rx-vid-link" style="display:flex;gap:8px;flex-wrap:wrap" data-keep><input class="input" id="rx-vid-url" type="url" placeholder="Or paste a link (Google Drive, Zoom, Teams recording)" aria-label="Video link" style="flex:1;min-width:200px"><button class="btn btn-ghost btn-sm">Add link</button></form>
        <span class="t-muted" style="font-size:13px">Longer recordings are best kept in Google Drive or Zoom and added as a link.</span></div>` : ""}
    </section></div>`;
}
{
  const base = VIEWS.applicant;
  VIEWS.applicant = () => {
    const a = S.apps.get(S.view.id); let html = base(); if (!a) return html; const j = S.jobs.get(a.jobId);
    const i = html.indexOf('<section class="card"><div class="steps"'); if (i >= 0) html = html.slice(0, i) + appDecision(a, j) + html.slice(i);
    html = html.replace(/(<div class="field"><label for="iv-by">)/, `<div class="field"><label for="iv-mode">How</label><select class="input" id="iv-mode">${opts(MODES, "IN_PERSON")}</select></div><div class="field"><label for="iv-where">Place or meeting link</label><input class="input" id="iv-where" placeholder="Room, site office or link"></div>$1`);
    html = html.replace('<input class="input" id="iv-by" placeholder="Name">', `<input class="input" id="iv-by" placeholder="Name" value="${esc(a.recruiterId ? recName(a.recruiterId).replace(/ \(you\)$/, "") : "")}">`);
    return html + appFile(a, j);
  };
  const baseCard = appCard;
  appCard = (a) => { let h = baseCard(a); const tags = `${isBL(a) ? '<span class="chip c-bad">Blacklisted</span>' : ""}${a.recruiterId ? `<span class="chip c-gray">${esc(recName(a.recruiterId))}</span>` : ""}`; return tags ? h.replace('<span class="chips">', `<span class="chips">${tags}`) : h; };
  const baseHire = VIEWS.hiring;
  VIEWS.hiring = () => {
    if (S.hireTab !== "mine") return baseHire().replace(/(data-hire-tab="jobs">Job openings<\/button>)/, `$1<button class="tab" role="tab" aria-selected="false" data-hire-tab="mine">Assigned to me</button>`);
    const all = S.apps; let html;
    try { S.apps = new Map([...all].filter(([, a]) => a.recruiterId && a.recruiterId === S.myId)); html = baseHire(); } finally { S.apps = all; }
    return html.replace(/(data-hire-tab="jobs">Job openings<\/button>)/, `$1<button class="tab" role="tab" aria-selected="true" data-hire-tab="mine">Assigned to me</button>`);
  };
}
/* screening questions on the job page */
{
  const base = VIEWS.job;
  VIEWS.job = () => { const j = S.jobs.get(S.view.id); const html = base(); if (!j) return html; const qs = j.questions || []; const ed = S.canEdit;
    return html + `<section class="card"><div class="card-head"><h2>Qualification questions</h2><span class="t-muted" style="font-size:13px">Asked of every applicant for this job</span></div>
      ${qs.length ? `<ol class="rx-qlist">${qs.map((q, i) => `<li><span>${esc(q)}</span>${ed ? `<button class="link danger" data-rx-q-del="${j.id}:${i}">Remove</button>` : ""}</li>`).join("")}</ol>` : `<p class="t-muted" style="margin:0 0 6px">None set, so the standard questions are used:</p><ol class="rx-qlist t-muted">${DEF_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`}
      ${ed ? `<form id="rx-q" style="display:flex;gap:8px;margin-top:12px" data-keep><input class="input" id="rx-q-in" required placeholder="Add a question, e.g. Do you have a TESDA NC II in welding?" aria-label="New question" style="flex:1;min-width:0"><button class="btn btn-ghost btn-sm">Add</button></form>` : ""}</section>`; };
}

/* ---------- blacklisted applicants ---------- */
VIEWS.blacklist = () => {
  const q = (S.blq || "").toLowerCase(); const all = listOf(S.apps).filter(isBL).sort((x, y) => (y.blacklist.d || "").localeCompare(x.blacklist.d || ""));
  const list = all.filter((a) => !q || [appName(a), a.mobile, a.email, a.blacklist.reason, S.jobs.get(a.jobId)?.title, ...(a.skills || [])].join(" ").toLowerCase().includes(q));
  return head("Recruitment", "Blacklisted applicants") + `
    <section class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><input class="input" type="search" id="bl-q" value="${esc(S.blq || "")}" placeholder="Search name, mobile, email, reason or skill" aria-label="Search blacklisted applicants" style="flex:1;min-width:220px">
      <span class="t-muted" style="font-size:14px">${all.length} blacklisted. New applicants with the same mobile, email or name are flagged on their page.</span></section>
    ${list.length ? list.map((a) => { const j = S.jobs.get(a.jobId); const t = a.tests || []; const ans = Object.entries(a.answers || {});
      return `<section class="card rx-blcard"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">${appAvatar(a, 56)}
        <div style="flex:1;min-width:220px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><h2 style="margin:0;font-size:19px"><button class="link" style="font-size:19px;font-weight:800" data-app="${a.id}">${esc([a.first, a.middle, a.last].filter(Boolean).join(" "))}</button></h2><span class="chip c-bad">Blacklisted ${fmtDate(a.blacklist.d)}</span></div>
          <div style="margin-top:4px"><b>Reason:</b> ${esc(a.blacklist.reason)}${a.blacklist.by ? ` <span class="t-muted">· by ${esc(recName(a.blacklist.by))}</span>` : ""}</div>
          <div class="t-muted" style="font-size:14px;margin-top:2px">Applied for ${esc(j ? jobLabel(j) : "no job")} on ${fmtDate(a.applied)}${a.source ? ` · ${esc(a.source)}` : ""}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${a.resume ? `<a class="btn btn-ghost btn-sm" href="/_blob/${esc(a.resume.id)}" target="_blank" rel="noopener">${icon("file", 16)}Resume / CV</a>` : '<span class="chip c-gray">No CV on file</span>'}<button class="btn btn-ghost btn-sm" data-app="${a.id}">Open full file</button></div></div>
        <dl class="facts rx-blfacts">${tfact("Mobile", esc(a.mobile))}${tfact("Email", esc(a.email))}${tfact("Birth date", fmtDate(a.birth))}${tfact("Address", esc(a.address))}
          ${tfact("Skills", (a.skills || []).map(esc).join(", "))}${tfact("Test results", t.map((x) => `${esc(x.name)}: ${TEST_RES[x.result]?.[0] || ""}${x.score != null ? ` (${x.score}${x.of ? "/" + x.of : ""})` : ""}`).join("<br>"))}
          ${tfact("Interview videos", (a.videos || []).length ? `${(a.videos || []).length} on file` : "")}${tfact("Interviews", (a.ivs || []).map((i) => `${esc(i.kind)} ${fmtDate(i.d)}`).join("<br>"))}</dl>
        ${ans.length ? `<details class="rx-det"><summary>Qualification answers (${ans.length})</summary><dl class="rx-qa">${ans.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>` : ""}
      </section>`; }).join("") : `<section class="card"><div class="empty-state"><span class="es-ic">${icon("ban", 22)}</span><p>${all.length ? "No blacklisted applicant matches your search." : "No applicants are blacklisted. Use the Blacklist button on an applicant's page to add one."}</p></div></section>`}`;
};

/* ---------- interview calendar ---------- */
function allInterviews() { return listOf(S.apps).flatMap((a) => (a.ivs || []).map((iv) => ({ a, iv }))).sort((x, y) => (x.iv.d + (x.iv.t || "")).localeCompare(y.iv.d + (y.iv.t || ""))); }
const hm12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
VIEWS.ivcal = () => {
  const today = todayISO(); const m = S.ivMonth || today.slice(0, 7); const [y, mo] = m.split("-").map(Number);
  const first = new Date(y, mo - 1, 1); const days = new Date(y, mo, 0).getDate(); const lead = first.getDay();
  const ivs = allInterviews(); const inMonth = ivs.filter((x) => x.iv.d.startsWith(m)); const byDay = {}; for (const x of inMonth) (byDay[x.iv.d] = byDay[x.iv.d] || []).push(x);
  const IVR = { PENDING: "c-warn", PASSED: "c-ok", FAILED: "c-bad" };
  const cells = []; for (let i = 0; i < lead; i++) cells.push('<div class="ivc-cell ivc-pad" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) { const iso = `${m}-${String(d).padStart(2, "0")}`; const xs = byDay[iso] || [];
    cells.push(`<div class="ivc-cell${iso === today ? " ivc-today" : ""}${S.ivDay === iso ? " ivc-sel" : ""}" data-ivday="${iso}" tabindex="0" aria-label="${fmtDate(iso)}: ${xs.length} ${xs.length === 1 ? "interview" : "interviews"}"><span class="ivc-d">${d}</span>
      ${xs.slice(0, 3).map((x) => `<button class="ivc-ev ${IVR[x.iv.result] || ""}" data-app="${x.a.id}" title="${esc(`${hm12(x.iv.t)} ${appName(x.a)} · ${x.iv.kind}${x.iv.by ? " with " + x.iv.by : ""}`)}"><b>${esc(hm12(x.iv.t).replace(":00", "").replace(" AM", "a").replace(" PM", "p"))}</b> ${esc(x.a.first)}</button>`).join("")}${xs.length > 3 ? `<span class="ivc-more">+${xs.length - 3} more</span>` : ""}${xs.length ? `<span class="ivc-dot">${xs.length}</span>` : ""}</div>`); }
  const label = first.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const dayList = S.ivDay && S.ivDay.startsWith(m) ? (byDay[S.ivDay] || []) : inMonth.filter((x) => x.iv.d >= today);
  const live = listOf(S.apps).filter((a) => inProcess(a) && !isBL(a)).sort((a, b) => appName(a).localeCompare(appName(b)));
  const conflicts = (x) => ivs.filter((o) => o !== x && o.iv.result === "PENDING" && o.iv.d === x.iv.d && o.iv.t && o.iv.t === x.iv.t && o.iv.by && x.iv.by && o.iv.by.toLowerCase() === x.iv.by.toLowerCase()).length;
  return head("Recruitment", "Interview calendar", S.canEdit ? `<button class="btn btn-primary" data-ivsched="1">${icon("plus")}Schedule interview</button>` : "") + `
    ${S.ivSched && S.canEdit ? `<section class="card"><div class="card-head"><h2>Schedule an interview</h2></div>
      <form id="ivc-form" class="form-grid" style="align-items:end" data-keep>
        <div class="field" style="grid-column:span 2"><label for="ivc-app">Applicant <span class="req">*</span></label><select class="input" id="ivc-app" required>${opts(live.map((a) => [a.id, `${appName(a)} · ${S.jobs.get(a.jobId)?.title || "no job"}`]), S.ivSched.app || "", "Choose…")}</select></div>
        <div class="field"><label for="ivc-d">Date <span class="req">*</span></label><input class="input" id="ivc-d" type="date" required value="${S.ivSched.d || addDays(today, 1)}"></div>
        <div class="field"><label for="ivc-t">Time</label><input class="input" id="ivc-t" type="time" value="09:00"></div>
        <div class="field"><label for="ivc-kind">Interview</label><select class="input" id="ivc-kind">${opts(["Initial interview", "Technical interview", "Trade test", "Final interview"].map((x) => [x, x]), "Initial interview")}</select></div>
        <div class="field"><label for="ivc-mode">How</label><select class="input" id="ivc-mode">${opts(MODES, "IN_PERSON")}</select></div>
        <div class="field"><label for="ivc-where">Place or meeting link</label><input class="input" id="ivc-where" placeholder="Room, site office or link"></div>
        <div class="field"><label for="ivc-by">Interviewer</label><input class="input" id="ivc-by" placeholder="Name" value="${esc(S.myId && S.profiles?.[S.myId]?.name || "")}"></div>
        <div class="field" style="grid-column:1/-1"><label for="ivc-notes">Notes</label><input class="input" id="ivc-notes"></div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary">Schedule</button><button type="button" class="btn btn-ghost" data-ivsched="">Cancel</button></div><p class="err" id="ivc-err" style="margin:0" hidden></p></form></section>` : ""}
    <div class="ivc-wrap">
    <section class="card ivc-card"><div class="card-head"><button class="btn btn-ghost btn-sm" data-ivmon="-1" aria-label="Previous month">‹</button><h2 style="flex:1;text-align:center">${esc(label)}</h2>${m !== today.slice(0, 7) ? `<button class="link" data-ivmon="0">Today</button>` : ""}<button class="btn btn-ghost btn-sm" data-ivmon="1" aria-label="Next month">›</button></div>
      <div class="ivc-grid" role="grid">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="ivc-h">${d}</div>`).join("")}${cells.join("")}</div>
      <div class="ivc-key t-muted"><span><i class="chip c-warn"></i> Scheduled</span><span><i class="chip c-ok"></i> Passed</span><span><i class="chip c-bad"></i> Did not pass</span></div></section>
    <section class="card"><div class="card-head"><h2>${S.ivDay && S.ivDay.startsWith(m) ? fmtDate(S.ivDay) : "Coming up this month"}</h2>${S.ivDay ? `<button class="link" data-ivday="">Show all</button>` : ""}</div>
      ${dayList.length ? `<ul class="list">${dayList.map((x) => { const c = conflicts(x); return `<li class="ivc-li"><button class="link" data-app="${x.a.id}" style="font-weight:700">${esc(appName(x.a))}</button>
        <div class="t-muted" style="font-size:13px">${fmtDate(x.iv.d)} ${esc(hm12(x.iv.t))} · ${esc(x.iv.kind)} · ${esc(S.jobs.get(x.a.jobId)?.title || "")}</div>
        <div style="font-size:13px">${esc(MODES.find((mm) => mm[0] === x.iv.mode)?.[1] || "In person")}${x.iv.where ? ` · ${/^https?:/i.test(x.iv.where) ? `<a class="link" href="${esc(x.iv.where)}" target="_blank" rel="noopener">Join link</a>` : esc(x.iv.where)}` : ""}${x.iv.by ? ` · with ${esc(x.iv.by)}` : ""}${x.a.recruiterId ? ` · recruiter ${esc(recName(x.a.recruiterId))}` : ""}</div>
        ${c ? `<span class="chip c-bad">Same interviewer, same time</span>` : ""}</li>`; }).join("")}</ul>` : '<p class="t-muted" style="margin:0">No interviews.</p>'}</section></div>`;
};

/* ---------- manpower requests ---------- */
const MPR_STATUS = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved", "c-blue"], OPENED: ["Job opened", "c-ok"], REJECTED: ["Not approved", "c-bad"], CANCELLED: ["Cancelled", "c-gray"] };
const MPR_TYPES = ["New position", "Replacement", "Additional manpower", "Project start-up", "Seasonal or peak work"];
const mprNo = () => `MRF-${String(Math.max(0, ...listOf(S.mpr).map((r) => Number(String(r.no || "").replace(/\D/g, "")) || 0)) + 1).padStart(4, "0")}`;
const mprFor = (r) => (r.projectId ? S.projects.get(r.projectId)?.name || "Project" : `Head Office${r.deptId && dept(r.deptId) ? ` · ${dept(r.deptId).name}` : ""}`);
VIEWS.mpr = () => {
  const all = listOf(S.mpr).sort((a, b) => (b.d || "").localeCompare(a.d || "") || (b.no || "").localeCompare(a.no || ""));
  const tab = S.mprTab || "PENDING"; const list = tab === "ALL" ? all : all.filter((r) => r.status === tab);
  const cnt = (s) => all.filter((r) => r.status === s).length; const y = todayISO().slice(0, 4);
  return head("Recruitment", "Manpower requests", S.canEdit ? `<button class="btn btn-primary" data-go="mprForm">${icon("plus")}New request</button>` : "") + `
    <section class="stats">
      <div class="card stat"><span class="label">Waiting for approval</span><span class="value">${cnt("PENDING")}</span><span class="note t-muted">${all.filter((r) => r.status === "PENDING").reduce((s, r) => s + (r.n || 0), 0)} people asked for</span></div>
      <div class="card stat"><span class="label">Approved, no job yet</span><span class="value">${cnt("APPROVED")}</span><span class="note t-muted">open a job to start hiring</span></div>
      <div class="card stat"><span class="label">Jobs opened</span><span class="value">${cnt("OPENED")}</span><span class="note t-muted">from requests</span></div>
      <div class="card stat"><span class="label">Requested in ${y}</span><span class="value">${all.filter((r) => (r.d || "").startsWith(y)).reduce((s, r) => s + (r.n || 0), 0)}</span><span class="note t-muted">people, all requests</span></div></section>
    ${tabsBar(tab, [["PENDING", `Waiting (${cnt("PENDING")})`], ["APPROVED", "Approved"], ["OPENED", "Job opened"], ["REJECTED", "Not approved"], ["ALL", "All"]], "mpr-tab")}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Request</th><th>Position</th><th>For</th><th class="num">People</th><th>Needed by</th><th>Requested by</th><th>Status</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="go" data-mpr="${r.id}" tabindex="0"><td><b>${esc(r.no)}</b><div class="t-muted" style="font-size:13px">${fmtDate(r.d)}</div></td><td><b>${esc(r.title)}</b><div class="t-muted" style="font-size:13px">${esc(r.type || "")}</div></td><td>${esc(mprFor(r))}</td><td class="num">${r.n}</td>
        <td style="white-space:nowrap" class="${r.needBy && r.needBy < todayISO() && ["PENDING", "APPROVED"].includes(r.status) ? "t-bad" : ""}">${fmtDate(r.needBy)}</td><td>${esc(r.by || "")}</td><td><span class="chip ${MPR_STATUS[r.status][1]}">${MPR_STATUS[r.status][0]}</span></td></tr>`).join("") || `<tr><td colspan="7" class="empty">${all.length ? "Nothing here." : "No manpower requests yet. Department heads and project managers can ask for people with New request."}</td></tr>`}
    </tbody></table></div></section>`;
};
VIEWS.mprForm = () => {
  const r = S.view.id ? S.mpr.get(S.view.id) : null;
  const v = r || { d: todayISO(), n: 1, type: "Additional manpower", empType: "PROBATIONARY", payType: "MONTHLY", by: (S.myId && S.profiles?.[S.myId]?.name) || "" };
  const P = S.org?.positions || []; const D = S.org?.departments || []; const projs = listOf(S.projects).filter((p) => p.status !== "DONE" || p.id === v.projectId);
  const F = (k, l, type = "text", req = false, extra = "") => `<div class="field"><label for="mf-${k}">${l}${req ? ' <span class="req">*</span>' : ""}</label><input class="input" id="mf-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
  return backLink(r ? `data-mpr="${r.id}"` : 'data-go="mpr"', "Back") + head("Manpower request", r ? esc(r.no) : "New manpower request") + `
    <form id="mpr-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${F("by", "Requested by", "text", true, 'placeholder="Name of the department head or project manager"')}${F("d", "Date of request", "date", true)}
      <div class="field"><label for="mf-projectId">For</label><select class="input" id="mf-projectId" name="projectId">${opts(projs.map((p) => [p.id, p.name]), v.projectId || "", "Head Office")}</select></div>
      <div class="field"><label for="mf-deptId">Department</label><select class="input" id="mf-deptId" name="deptId">${opts(D.map((d) => [d.id, d.name]), v.deptId || "", "—")}</select></div>
      <div class="field"><label for="mf-posId">Position</label><select class="input" id="mf-posId" name="posId">${opts(P.map((p) => [p.id, p.title]), v.posId || "", "Other (type the title)")}</select></div>
      ${F("title", "Job title", "text", true)}${F("n", "Number of people", "number", true, 'min="1" step="1"')}${F("needBy", "Needed by", "date")}
      <div class="field"><label for="mf-type">Type of request</label><select class="input" id="mf-type" name="type">${opts(MPR_TYPES.map((x) => [x, x]), v.type)}</select></div>
      ${F("replaces", "Replacing (name)", "text", false, 'placeholder="Only for a replacement"')}
      <div class="field"><label for="mf-empType">Employment status</label><select class="input" id="mf-empType" name="empType">${opts(Object.entries(STATUS).map(([k, x]) => [k, x[0]]), v.empType)}</select></div>
      <div class="field"><label for="mf-payType">Pay basis</label><select class="input" id="mf-payType" name="payType">${opts([["MONTHLY", "Monthly"], ["DAILY", "Daily"]], v.payType)}</select></div>
      ${F("rate", "Budgeted pay (PHP)", "number", false, 'min="0" step="0.01"')}
    </div>
    <div class="field"><label for="mf-reason">Reason for the request <span class="req">*</span></label><textarea class="input" id="mf-reason" name="reason" rows="3" placeholder="Why these people are needed now">${esc(v.reason || "")}</textarea></div>
    <div class="field"><label for="mf-quals">Qualifications</label><textarea class="input" id="mf-quals" name="quals" rows="3" placeholder="Education, experience, licenses, skills">${esc(v.quals || "")}</textarea></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="mf-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${r ? `data-mpr="${r.id}"` : 'data-go="mpr"'}>Cancel</button><button class="btn btn-primary">${r ? "Save changes" : "Submit request"}</button></div></form>`;
};
VIEWS.mprView = () => {
  const r = S.mpr.get(S.view.id); if (!r) return notFound("Recruitment", "Manpower request", "mpr");
  const ed = S.canEdit; const j = r.jobId ? S.jobs.get(r.jobId) : null;
  return backLink('data-go="mpr"', "Manpower requests") + head("Manpower request", `${esc(r.no)} · ${esc(r.title)}`, ed && ["PENDING", "APPROVED"].includes(r.status) ? `<button class="btn btn-ghost" data-mpr-edit="${r.id}">Edit</button>` : "") + `
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><span class="chip ${MPR_STATUS[r.status][1]}">${MPR_STATUS[r.status][0]}</span>${r.decided ? `<span class="t-muted" style="font-size:14px">${r.status === "REJECTED" ? "Not approved" : "Approved"} ${fmtDate(r.decided.d)}${r.decided.by ? ` by ${esc(recName(r.decided.by))}` : ""}${r.decided.note ? `: ${esc(r.decided.note)}` : ""}</span>` : ""}</div>
      <dl class="facts" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${tfact("Requested by", esc(r.by))}${tfact("Date", fmtDate(r.d))}${tfact("For", esc(mprFor(r)))}${tfact("Department", esc(dept(r.deptId)?.name || ""))}${tfact("People needed", String(r.n))}${tfact("Needed by", fmtDate(r.needBy))}
        ${tfact("Type", esc(r.type))}${tfact("Replacing", esc(r.replaces || ""))}${tfact("Employment status", esc(STATUS[r.empType]?.[0] || ""))}${tfact("Budgeted pay", r.rate ? payLabel(r.rate, r.payType) : "")}</dl>
      <h3 class="rx-h3">Reason</h3><p style="margin:0;white-space:pre-line">${esc(r.reason || "")}</p>
      ${r.quals ? `<h3 class="rx-h3">Qualifications</h3><p style="margin:0;white-space:pre-line">${esc(r.quals)}</p>` : ""}
      ${j ? `<div class="notice" style="margin-top:16px;box-shadow:none;background:var(--ok-soft)"><span>Job opening created ${fmtDate(r.opened)}: <b>${esc(jobLabel(j))}</b>, ${jobHired(j)} of ${j.slots} hired.</span><button class="btn btn-ghost btn-sm" data-job="${j.id}">Open the job</button></div>` : ""}
      ${ed && r.status === "PENDING" ? `<form id="mpr-dec" class="panel" style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:end" data-keep><div class="field" style="flex:1;min-width:220px"><label for="mpr-note">Note (optional)</label><input class="input" id="mpr-note" placeholder="e.g. Approved for 3 instead of 5"></div>
        <button class="btn btn-primary" name="act" value="APPROVED">Approve</button><button class="btn btn-ghost" name="act" value="REJECTED">Don't approve</button></form>` : ""}
      ${ed && r.status === "APPROVED" ? `<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-gold" data-mpr-open="${r.id}">${icon("search", 16)}Open a job for ${r.n} ${r.n === 1 ? "person" : "people"}</button></div>` : ""}
      ${ed && ["PENDING", "APPROVED"].includes(r.status) ? `<div style="margin-top:12px"><button class="link danger" data-mpr-cancel="${r.id}">Cancel this request</button></div>` : ""}
    </section>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-rx-me],[data-rx-hire],[data-rx-refuse],[data-rx-bl],[data-rx-unbl],[data-rx-cancel],[data-rx-skill-del],[data-rx-test-del],[data-rx-vid-del],[data-rx-ans-edit],[data-rx-q-del],[data-ivmon],[data-ivday],[data-ivsched],[data-mpr],[data-mpr-tab],[data-mpr-edit],[data-mpr-open],[data-mpr-cancel],[data-hire-tab]");
  if (!t) return; const d = t.dataset;
  if (d.hireTab !== undefined) { if (d.hireTab === "mine") { ev.stopImmediatePropagation(); S.hireTab = "mine"; render(); } return; }
  if (d.ivday !== undefined && ev.target.closest("[data-app]")) return;
  ev.stopImmediatePropagation();
  const A = (k) => S.apps.get(String(k).split(":")[0]);
  const save = async (a, msg, act) => { try { await put("applicants", a); if (act) logActivity(act); if (msg) toast(msg); render(); } catch { toast("Couldn't save. Try again."); } };
  if (d.rxMe) { const a = A(d.rxMe); return save({ ...a, recruiterId: S.myId }, "Assigned to you.", `Took over applicant ${appName(a)}`); }
  if (d.rxHire) { const a = A(d.rxHire); if (stageIdx(a.stage) < stageIdx("OFFER")) await save({ ...a, stage: "OFFER", stageAt: todayISO() }, null, `${appName(a)}: moved to job offer to hire`); setTimeout(() => $("#hire-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); toast("Fill in the hire form to finish."); return; }
  if (d.rxRefuse) { S.rxAsk = { id: d.rxRefuse, kind: "refuse" }; render(); $("#rx-why")?.focus(); return; }
  if (d.rxBl) { S.rxAsk = { id: d.rxBl, kind: "bl" }; render(); $("#rx-why")?.focus(); return; }
  if (d.rxCancel) { S.rxAsk = null; render(); return; }
  if (d.rxUnbl) { const a = A(d.rxUnbl); const { blacklist, ...rest } = a; return save(rest, "Removed from the blacklist.", `Removed ${appName(a)} from the blacklist`); }
  if (d.rxSkillDel) { const [, i] = d.rxSkillDel.split(":"); const a = A(d.rxSkillDel); return save({ ...a, skills: (a.skills || []).filter((_, k) => k !== Number(i)) }); }
  if (d.rxTestDel) { const [, i] = d.rxTestDel.split(":"); const a = A(d.rxTestDel); return save({ ...a, tests: (a.tests || []).filter((_, k) => k !== Number(i)) }, "Test removed."); }
  if (d.rxVidDel) { const [, i] = d.rxVidDel.split(":"); const a = A(d.rxVidDel); const v = (a.videos || [])[Number(i)]; await save({ ...a, videos: (a.videos || []).filter((_, k) => k !== Number(i)) }, "Video removed.", `Removed an interview video of ${appName(a)}`); if (v?.id) { try { await S.assets.delete(v.id); } catch {} } return; }
  if (d.rxAnsEdit !== undefined) { S.rxEditAns = d.rxAnsEdit || null; render(); return; }
  if (d.rxQDel) { const [id, i] = d.rxQDel.split(":"); const j = S.jobs.get(id); try { await put("jobs", { ...j, questions: (j.questions || []).filter((_, k) => k !== Number(i)) }); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.ivmon !== undefined) { const n = Number(d.ivmon); if (!n) S.ivMonth = null; else { const [y, m] = (S.ivMonth || todayISO().slice(0, 7)).split("-").map(Number); const x = new Date(y, m - 1 + n, 1); S.ivMonth = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; } S.ivDay = null; render(); return; }
  if (d.ivday !== undefined) { S.ivDay = d.ivday && S.ivDay !== d.ivday ? d.ivday : null; render(); return; }
  if (d.ivsched !== undefined) { S.ivSched = d.ivsched ? { d: S.ivDay || null } : null; render(); if (S.ivSched) $("#ivc-app")?.focus(); return; }
  if (d.mprTab) { S.mprTab = d.mprTab; render(); return; }
  if (d.mprEdit) return go("mprForm", { id: d.mprEdit });
  if (d.mpr) return go("mprView", { id: d.mpr });
  if (d.mprCancel) { const r = S.mpr.get(d.mprCancel); try { await put("mpr", { ...r, status: "CANCELLED" }); logActivity(`Cancelled manpower request ${r.no}`); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.mprOpen) {
    const r = S.mpr.get(d.mprOpen); const pp = pos(r.posId);
    const j = { id: uid(), title: r.title, posId: r.posId || "", deptId: r.deptId || pp?.deptId || "", projectId: r.projectId || "", slots: r.n, empType: r.empType, payType: r.payType, rate: r.rate || null, mgrId: "", status: "OPEN", opened: todayISO(), desc: r.quals || null, mprId: r.id };
    try { await put("jobs", j); await put("mpr", { ...r, status: "OPENED", jobId: j.id, opened: todayISO() }); logActivity(`Opened a job for ${r.title} from manpower request ${r.no}`); toast("Job opening created."); go("job", { id: j.id }); } catch { toast("Couldn't create the job. Try again."); }
  }
}, true);
document.addEventListener("change", async (ev) => {
  const s = ev.target.closest("[data-rx-rec]"); if (s) { const a = S.apps.get(s.dataset.rxRec); try { await put("applicants", { ...a, recruiterId: s.value || null }); logActivity(`${s.value ? `Assigned ${appName(a)} to ${recName(s.value)}` : `Unassigned ${appName(a)}`}`); toast(s.value ? "Recruiter assigned." : "Recruiter removed."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (ev.target.id === "rx-vid-file") { const f = ev.target.files?.[0]; ev.target.value = ""; if (!f) return; const a = S.apps.get(S.view.id);
    if (!/^video\//.test(f.type)) { toast("Choose a video file (MP4, WebM or MOV)."); return; } if (f.size > 20 * 1048576) { toast("That video is over 20 MB. Upload it to Google Drive or Zoom and add the link instead."); return; }
    toast("Uploading the video…"); try { const up = await S.assets.upload(f); await put("applicants", { ...a, videos: [...(a.videos || []), { id: up.id, name: f.name.slice(0, 120), d: todayISO() }] }); logActivity(`Added an interview video for ${appName(a)}`); toast("Video added."); render(); } catch { toast("Couldn't upload the video. Try again or add a link."); } }
});
document.addEventListener("input", (ev) => { if (ev.target.id === "bl-q") { S.blq = ev.target.value; const pos0 = ev.target.selectionStart; render(); const i = $("#bl-q"); if (i) { i.focus(); try { i.setSelectionRange(pos0, pos0); } catch {} } } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.matches?.("[data-mpr],[data-ivday]") && !ev.target.closest("button")) { ev.preventDefault(); ev.target.click(); } });
/* submit handlers run on window so they come before the older document handlers (iv-form gets mode and place) */
window.addEventListener("submit", async (ev) => {
  const f = ev.target; const id = f.id; if (!["rx-ask", "rx-skill", "rx-test", "rx-ans", "rx-vid-link", "rx-q", "ivc-form", "iv-form", "mpr-form", "mpr-dec"].includes(id)) return;
  ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const fail = (m) => toast(m);
  try {
    if (id === "rx-ask") { const a = S.apps.get(S.rxAsk.id); const why = $("#rx-why").value.trim(); const by = S.myId || null;
      if (S.rxAsk.kind === "bl") { if (!why) return fail("Give the reason for blacklisting."); await put("applicants", { ...a, blacklist: { d: todayISO(), reason: why, by }, ...(inProcess(a) ? { stage: "REJECTED", stageAt: todayISO() } : {}) }); logActivity(`Blacklisted applicant ${appName(a)}: ${why}`); toast("Applicant blacklisted."); }
      else { await put("applicants", { ...a, stage: "REJECTED", stageAt: todayISO(), refused: { d: todayISO(), reason: why || null, by } }); logActivity(`Refused applicant ${appName(a)}${why ? `: ${why}` : ""}`); toast(`${a.first} was refused.`); }
      S.rxAsk = null; render(); return; }
    if (id === "rx-skill") { const a = S.apps.get(S.view.id); const add = $("#rx-skill-in").value.split(",").map((x) => x.trim()).filter(Boolean); if (!add.length) return; const have = new Set((a.skills || []).map((x) => x.toLowerCase()));
      await put("applicants", { ...a, skills: [...(a.skills || []), ...add.filter((x) => !have.has(x.toLowerCase()))] }); render(); $("#rx-skill-in")?.focus(); return; }
    if (id === "rx-test") { const a = S.apps.get(S.view.id); const name = $("#rx-t-name").value.trim(); if (!name) return fail("Enter the test name."); const sc = $("#rx-t-score").value, of = $("#rx-t-of").value;
      await put("applicants", { ...a, tests: [...(a.tests || []), { name, d: $("#rx-t-d").value || todayISO(), score: sc === "" ? null : Number(sc), of: of === "" ? null : Number(of), result: $("#rx-t-res").value, notes: $("#rx-t-notes").value.trim() || null }] }); logActivity(`Recorded the ${name} result of ${appName(a)}`); toast("Test result added."); render(); return; }
    if (id === "rx-ans") { const a = S.apps.get(S.view.id); const answers = {}; f.querySelectorAll("textarea[data-q]").forEach((t) => { if (t.value.trim()) answers[t.dataset.q] = t.value.trim(); });
      await put("applicants", { ...a, answers }); S.rxEditAns = null; logActivity(`Recorded qualification answers of ${appName(a)}`); toast("Answers saved."); render(); return; }
    if (id === "rx-vid-link") { const a = S.apps.get(S.view.id); const u = $("#rx-vid-url").value.trim(); if (!/^https?:\/\/\S+$/i.test(u)) return fail("Paste a web link that starts with https://");
      let host = ""; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
      await put("applicants", { ...a, videos: [...(a.videos || []), { url: u, name: `Video link (${host || "web"})`, d: todayISO() }] }); logActivity(`Added an interview video link for ${appName(a)}`); toast("Video link added."); render(); return; }
    if (id === "rx-q") { const j = S.jobs.get(S.view.id); const q = $("#rx-q-in").value.trim(); if (!q) return; await put("jobs", { ...j, questions: [...(j.questions || []), q] }); render(); $("#rx-q-in")?.focus(); return; }
    if (id === "iv-form" || id === "ivc-form") { const p = id === "iv-form" ? "iv" : "ivc"; const a = S.apps.get(id === "iv-form" ? S.view.id : $("#ivc-app").value); if (!a) { const e = $("#ivc-err"); if (e) { e.textContent = "Choose the applicant."; e.hidden = false; } return; }
      const iv = { id: uid(), d: $(`#${p}-d`).value, t: $(`#${p}-t`).value, kind: $(`#${p}-kind`).value, mode: $(`#${p}-mode`)?.value || "IN_PERSON", where: $(`#${p}-where`)?.value.trim() || null, by: $(`#${p}-by`).value.trim() || null, notes: $(`#${p}-notes`).value.trim() || null, result: "PENDING" };
      if (!iv.d) return fail("Pick the date.");
      const clash = allInterviews().find((x) => x.iv.result === "PENDING" && x.iv.d === iv.d && iv.t && x.iv.t === iv.t && iv.by && (x.iv.by || "").toLowerCase() === iv.by.toLowerCase());
      const stage = stageIdx(a.stage) < stageIdx("INTERVIEW") ? "INTERVIEW" : a.stage;
      await put("applicants", { ...a, ivs: [...(a.ivs || []), iv], stage, stageAt: stage !== a.stage ? todayISO() : a.stageAt, recruiterId: a.recruiterId || S.myId || null });
      logActivity(`Scheduled a ${iv.kind.toLowerCase()} for ${appName(a)} on ${fmtDate(iv.d)}`);
      toast(clash ? `Scheduled. Note: ${iv.by} also interviews ${appName(clash.a)} at that time.` : "Interview scheduled."); if (id === "ivc-form") { S.ivSched = null; S.ivMonth = iv.d.slice(0, 7); S.ivDay = iv.d; } render(); return; }
    if (id === "mpr-form") { const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#mf-err"); const bad = (m) => { err.textContent = m; err.hidden = false; };
      if (!val("by")) return bad("Enter who is asking."); if (!val("title")) return bad("Enter the job title."); if (!(Number(val("n")) >= 1)) return bad("Enter how many people are needed."); if (!val("reason")) return bad("Give the reason for the request.");
      const prev = S.view.id ? S.mpr.get(S.view.id) : null; const r = { ...(prev || { id: uid(), no: mprNo(), status: "PENDING", reqBy: S.myId || null }) };
      for (const k of ["by", "d", "projectId", "deptId", "posId", "title", "needBy", "type", "replaces", "empType", "payType", "reason", "quals"]) r[k] = val(k) || null;
      r.n = Math.round(Number(val("n"))); r.rate = Number(val("rate")) || null;
      await put("mpr", r); logActivity(`${prev ? "Updated" : "Submitted"} manpower request ${r.no} for ${r.n} ${r.title}`); toast(prev ? "Request saved." : "Request submitted for approval."); go("mprView", { id: r.id }); return; }
    if (id === "mpr-dec") { const r = S.mpr.get(S.view.id); const act = ev.submitter?.value || "APPROVED";
      await put("mpr", { ...r, status: act, decided: { d: todayISO(), by: S.myId || null, note: $("#mpr-note").value.trim() || null } }); logActivity(`${act === "APPROVED" ? "Approved" : "Did not approve"} manpower request ${r.no}`); toast(act === "APPROVED" ? "Request approved." : "Request not approved."); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
}, true);
/* the position picked fills in the job title and department */
document.addEventListener("change", (ev) => { if (ev.target.id !== "mf-posId") return; const p = pos(ev.target.value); if (!p) return; const t = $("#mf-title"); if (t && !t.value) t.value = p.title; const dd = $("#mf-deptId"); if (dd && !dd.value && p.deptId) dd.value = p.deptId; });
