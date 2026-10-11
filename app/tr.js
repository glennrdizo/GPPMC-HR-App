/* ---------- training module: home, sessions, required training, catalog, records ---------- */
Object.assign(S, {
  sessions: new Map(), mats: new Map(), matFilter: { q: "", course: "", type: "", page: 1 }, sesFilter: { q: "", status: "UPCOMING", page: 1 }, recFilter: { q: "", dept: "", project: "", year: "", course: "", page: 1 },
});
Object.assign(TCOLS, { sessions: "sessions", trmaterials: "mats" });
Object.assign(ICON, { book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>' });
{
  // Training becomes its own module, just before Talent.
  const tal = NAV.find(([g]) => g === "Talent"); const i = tal[1].findIndex(([v]) => v === "training"); if (i >= 0) tal[1].splice(i, 1);
  NAV.splice(NAV.indexOf(tal), 0, ["Training", [["trhome", "Training home", "cap"], ["trsessions", "Sessions & schedule", "cal"], ["training", "Who needs what", "shield"], ["trcourses", "Course catalog", "file"], ["trmaterials", "Training materials", "book"], ["trrecords", "Training records", "log"]]]);
  Object.assign(SECTION_OF, { trhome: "trhome", trsessions: "trsessions", trsession: "trsessions", trsessionForm: "trsessions", training: "training", trcourses: "trcourses", course: "trcourses", courseForm: "trcourses", trrecords: "trrecords", trmaterials: "trmaterials", trmaterialForm: "trmaterials" });
  // Talent sits right after People, ahead of Timekeeping.
  NAV.splice(NAV.indexOf(tal), 1); NAV.splice(NAV.findIndex(([g]) => g === "People") + 1, 0, tal);
}
function bootTr(db) {
  db.collection("trmaterials").limit(2000).onSnapshot((snap) => { S.mats = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
  db.collection("sessions").limit(2000).onSnapshot((snap) => { S.sessions = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
}
const SES = { PLANNED: ["Scheduled", "c-blue"], DONE: ["Completed", "c-ok"], CANCELLED: ["Cancelled", "c-gray"] };
const ATT = { ENROLLED: ["Enrolled", "c-gray"], ATTENDED: ["Attended", "c-ok"], ABSENT: ["Absent", "c-bad"] };
const sesTitle = (s) => S.courses.get(s.courseId)?.title || s.title || "Training session";
const sesHours = (s) => Number(s.hours) || Number(S.courses.get(s.courseId)?.hours) || 0;
const sesWhen = (s) => `${fmtDate(s.d)}${s.to && s.to !== s.d ? ` to ${fmtDate(s.to)}` : ""}${s.start ? ` · ${s.start}${s.end ? `–${s.end}` : ""}` : ""}`;
/* Every completion on record: one row per person per course. */
function allRecs() {
  const out = [];
  for (const c of listOf(S.courses)) for (const [empId, r] of Object.entries(c.recs || {})) { const e = S.emps.get(empId); if (e) out.push({ c, e, ...r }); }
  return out;
}

/* ---------- training home ---------- */
VIEWS.trhome = () => {
  const today = todayISO(); const y = today.slice(0, 4); const { rows, T, pct } = compliance(active());
  const ses = listOf(S.sessions); const upcoming = ses.filter((s) => s.status === "PLANNED" && (s.to || s.d) >= today).sort((a, b) => a.d.localeCompare(b.d));
  const month = today.slice(0, 7); const thisMonth = ses.filter((s) => s.status !== "CANCELLED" && s.d.startsWith(month)).length;
  const recs = allRecs().filter((r) => (r.d || "").startsWith(y)); const hours = PAY.r2(recs.reduce((a, r) => a + (Number(r.c.hours) || 0), 0));
  const spend = PAY.r2(ses.filter((s) => s.status !== "CANCELLED" && s.d.startsWith(y)).reduce((a, s) => a + (Number(s.cost) || 0), 0));
  const people = new Set(recs.map((r) => r.e.id)).size;
  const renew = rows.flatMap((r) => r.items.filter((i) => i.st === "EXPIRING" || i.st === "EXPIRED").map((i) => ({ e: r.e, c: i.c, st: i.st, exp: i.c.recs?.[r.e.id]?.exp }))).sort((a, b) => (a.exp || "").localeCompare(b.exp || ""));
  const gaps = listOf(S.courses).map((c) => { const req = active().filter((e) => needs(c, e)); const gap = req.filter((e) => trainState(c, e) !== "OK" && trainState(c, e) !== "EXPIRING").length; return { c, req: req.length, gap }; }).filter((x) => x.gap).sort((a, b) => b.gap - a.gap);
  const bySite = siteList().map((s) => { const emps = active().filter((e) => siteOf(e) === s.id); const r = compliance(emps); return { s, n: emps.length, pct: r.pct, gaps: r.T.MISSING + r.T.EXPIRED }; }).filter((x) => x.n);
  const needSched = gaps.filter((g) => !upcoming.some((s) => s.courseId === g.c.id));
  return head(`${pct}% of required training is current`, "Training", `${S.canEdit ? `<button class="btn btn-gold" data-go="trsessionForm">${icon("plus")}Schedule a session</button><button class="btn btn-ghost" data-edit-course="">New course</button>` : ""}`) + `
    <section class="stats" aria-label="Training figures">
      <div class="card stat"><span class="label">Compliance</span><span class="value">${pct}%</span><span class="note t-muted">of ${T.req} required trainings</span></div>
      <div class="card stat"><span class="label">Missing or expired</span><span class="value">${T.MISSING + T.EXPIRED}</span><span class="note ${T.EXPIRED ? "t-bad" : "t-muted"}">${T.EXPIRED} expired</span></div>
      <div class="card stat"><span class="label">Expiring in 60 days</span><span class="value">${T.EXPIRING}</span><span class="note t-warn">schedule renewals</span></div>
      <div class="card stat"><span class="label">Sessions this month</span><span class="value">${thisMonth}</span><span class="note t-blue">${upcoming.length} coming up</span></div>
      <div class="card stat"><span class="label">Training hours ${y}</span><span class="value">${hours}</span><span class="note t-muted">${people} people trained · ${peso.format(spend)} spent</span></div>
    </section>
    <div class="row">
      <section class="card wide"><div class="card-head"><h2>Coming up</h2><button class="link" data-go="trsessions">All sessions</button></div>
        ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 6).map((s) => { const n = Object.keys(s.att || {}).length;
          return `<li><button class="tile person" style="border:0;padding:0" data-trs="${s.id}"><span class="datebox"><small>${parseISO(s.d).toLocaleString("en-PH", { month: "short" })}</small><b>${parseISO(s.d).getDate()}</b></span>
            <span class="who"><span class="name" style="font-size:14px">${esc(sesTitle(s))}</span><span class="sub">${esc(sesWhen(s))}${s.venue ? ` · ${esc(s.venue)}` : ""} · ${n}${s.cap ? ` of ${s.cap}` : ""} enrolled</span></span></button></li>`; }).join("")}</ul>`
          : `<p class="t-muted" style="margin:0">Nothing scheduled. ${S.canEdit ? '<button class="link" data-go="trsessionForm">Schedule a session</button>' : ""}</p>`}
      </section>
      <section class="card"><div class="card-head"><h2>Needs attention</h2></div>
        ${needSched.length || renew.length ? `<ul class="list" style="font-size:14px">
          ${needSched.slice(0, 4).map((g) => `<li><button class="link" style="text-align:left;color:var(--ink);font-weight:600" data-go="trsessionForm" data-trs-course="${g.c.id}">${g.gap} ${g.gap === 1 ? "person needs" : "people need"} ${esc(g.c.title)}, and no session is scheduled</button></li>`).join("")}
          ${renew.length ? `<li><button class="link" style="text-align:left;color:var(--ink);font-weight:600" data-go="training">${renew.length} ${renew.length === 1 ? "certificate is" : "certificates are"} expired or expiring soon</button></li>` : ""}</ul>`
          : '<p class="t-muted" style="margin:0">Everyone is current on required training.</p>'}
      </section>
    </div>
    <div class="row">
      <section class="card"><div class="card-head"><h2>Renewals due</h2><button class="link" data-talx="training">Download gaps (CSV)</button></div>
        ${renew.length ? `<ul class="list" style="font-size:14px">${renew.slice(0, 7).map((x) => `<li style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span><button class="link" style="color:var(--ink);text-align:left;font-weight:600" data-emp="${x.e.id}">${esc(fullName(x.e))}</button><div class="t-muted" style="font-size:13px">${esc(x.c.title)}</div></span><span class="chip ${TSTATE[x.st][1]}">${x.st === "EXPIRED" ? "Expired" : "Until"} ${esc(fmtDate(x.exp))}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">No renewals due in 60 days.</p>'}
      </section>
      <section class="card"><div class="card-head"><h2>Courses with the most gaps</h2><button class="link" data-go="trcourses">Catalog</button></div>
        ${gaps.length ? `<div class="list">${gaps.slice(0, 7).map((g) => `<button class="hbar" style="background:none;border:0;padding:0;text-align:left;cursor:pointer;width:100%" data-course="${g.c.id}"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.c.code)} ${esc(g.c.title)}</span><div class="bar" style="height:12px"><i style="width:${(g.gap / Math.max(1, g.req)) * 100}%;background:var(--bad, #c0392b)"></i></div><b class="num">${g.gap}</b></button>`).join("")}</div>` : `<p class="t-muted" style="margin:0">${S.courses.size ? "No gaps." : "Add courses to the catalog to track required training."}</p>`}
      </section>
      <section class="card"><div class="card-head"><h2>Compliance by site</h2></div>
        ${bySite.length ? `<ul class="list" style="font-size:14px">${bySite.map((x) => `<li><div style="display:flex;justify-content:space-between;gap:10px"><b style="font-weight:600">${esc(x.s.name)}</b><span class="num">${x.pct}%</span></div><div class="bar" style="height:8px;margin-top:6px"><i style="width:${x.pct}%"></i></div></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">Add employees to see compliance by site.</p>'}
      </section>
    </div>`;
};

/* ---------- required training and the catalog as their own pages ---------- */
VIEWS.training = () => {
  const { rows, T, pct } = compliance(active());
  return head(`${pct}% current · ${T.MISSING} missing · ${T.EXPIRED} expired · ${T.EXPIRING} expiring`, "Who needs what", `<button class="btn btn-ghost" data-talx="training">Download gaps (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="trsessionForm">${icon("plus")}Schedule a session</button>` : ""}`) + complianceTab(rows);
};
VIEWS.trcourses = () => head(`${S.courses.size} courses and certificates`, "Course catalog", `${S.canEdit ? `<button class="btn btn-gold" data-edit-course="">${icon("plus")}New course</button>` : ""}`) +
  (S.courses.size ? coursesTab() : `<section class="card"><p class="empty" style="margin:0">No courses yet. Add the trainings your people must have, such as BOSH/COSH, first aid, fire safety or work at height, and who needs each one.</p></section>`);

/* ---------- sessions ---------- */
VIEWS.trsessions = () => {
  const f = S.sesFilter; const q = f.q.trim().toLowerCase(); const today = todayISO();
  const all = listOf(S.sessions);
  const pick = (s) => f.status === "UPCOMING" ? s.status === "PLANNED" && (s.to || s.d) >= today : f.status === "PAST" ? s.status === "DONE" || (s.status === "PLANNED" && (s.to || s.d) < today) : f.status === "CANCELLED" ? s.status === "CANCELLED" : true;
  const list = all.filter((s) => pick(s) && (!q || `${sesTitle(s)} ${s.venue || ""} ${s.trainer || ""}`.toLowerCase().includes(q))).sort((a, b) => (f.status === "UPCOMING" ? a.d.localeCompare(b.d) : b.d.localeCompare(a.d)));
  const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE); const toClose = all.filter((s) => s.status === "PLANNED" && (s.to || s.d) < today).length;
  return head(`${toClose ? `${toClose} past ${toClose === 1 ? "session needs" : "sessions need"} attendance marked` : "Schedule, enroll and record attendance"}`, "Sessions &amp; schedule", `<button class="btn btn-ghost" data-trx="sessions">Download (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="trsessionForm">${icon("plus")}Schedule a session</button>` : ""}`) + `
    ${tabsBar(f.status, [["UPCOMING", "Upcoming"], ["PAST", "Past"], ["CANCELLED", "Cancelled"], ["", "All"]], "ses-status")}
    <section class="card">
      <div style="margin-bottom:12px"><input class="input" type="search" id="ses-q" value="${esc(f.q)}" placeholder="Search course, venue or trainer" style="max-width:340px" aria-label="Search sessions"></div>
      <div class="table-wrap"><table><thead><tr><th>Course</th><th>When</th><th>Venue</th><th>Trainer</th><th class="num">People</th><th class="num">Cost</th><th>Status</th></tr></thead><tbody>
        ${rows.map((s) => { const a = Object.values(s.att || {}); const past = s.status === "PLANNED" && (s.to || s.d) < today;
          return `<tr class="clickable" data-trs="${s.id}"><td><b>${esc(sesTitle(s))}</b>${S.courses.get(s.courseId) ? `<div class="t-muted" style="font-size:13px">${esc(S.courses.get(s.courseId).code)}</div>` : ""}</td><td style="white-space:nowrap">${esc(sesWhen(s))}</td><td>${esc(s.venue || "")}</td><td>${esc(s.trainer || "")}</td>
          <td class="num">${s.status === "DONE" ? `${a.filter((x) => x === "ATTENDED").length} of ${a.length}` : `${a.length}${s.cap ? ` / ${s.cap}` : ""}`}</td><td class="num">${s.cost ? peso.format(s.cost) : ""}</td>
          <td><span class="chip ${past ? "c-warn" : SES[s.status][1]}">${past ? "Mark attendance" : SES[s.status][0]}</span></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">${all.length ? "No sessions here." : "No sessions yet."}</td></tr>`}
      </tbody></table></div>
      ${list.length > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-sespage="-1" ${f.page <= 1 ? "disabled" : ""}>Previous</button><span class="t-muted">${(f.page - 1) * PAGE + 1}–${Math.min(list.length, f.page * PAGE)} of ${list.length}</span><button class="btn btn-ghost btn-sm" data-sespage="1" ${f.page * PAGE >= list.length ? "disabled" : ""}>Next</button></div>` : ""}
    </section>`;
};
VIEWS.trsessionForm = () => {
  const s = S.view.id ? S.sessions.get(S.view.id) : null; const v = s || { courseId: S.view.courseId || "", d: todayISO(), start: "08:00", end: "17:00" };
  const F = (k, label, type = "text", extra = "") => `<div class="field"><label for="sf-${k}">${label}</label><input class="input" id="sf-${k}" type="${type}" value="${esc(v[k] ?? "")}" ${extra}></div>`;
  const back = s ? `data-trs="${s.id}"` : 'data-go="trsessions"';
  return backLink(back, s ? "Session" : "Sessions") + head("Training", s ? "Edit session" : "Schedule a session") + `
    <form id="ses-form" class="card stack" style="gap:16px" data-keep><div class="form-grid">
      <div class="field"><label for="sf-course">Course <span class="req">*</span></label><select class="input" id="sf-course" required>${opts(listOf(S.courses).sort((a, b) => a.title.localeCompare(b.title)).map((c) => [c.id, `${c.code} · ${c.title}`]), v.courseId, "Choose…")}</select></div>
      ${F("d", 'Date <span class="req">*</span>', "date", "required")}${F("to", "Last day (if more than one day)", "date")}
      ${F("start", "Starts", "time")}${F("end", "Ends", "time")}${F("hours", "Hours (blank = the course's hours)", "number", 'min="0" step="0.5"')}
      ${F("venue", "Venue", "text", 'placeholder="Head office training room, or online"')}${F("trainer", "Trainer or provider", "text", 'placeholder="OSHC accredited trainer"')}
      ${F("cap", "Seats", "number", 'min="0" step="1"')}${F("cost", "Total cost (PHP)", "number", 'min="0" step="0.01"')}
    </div>
    <div class="field"><label for="sf-notes">Notes</label><textarea class="input" id="sf-notes" rows="2">${esc(v.notes || "")}</textarea></div>
    ${S.courses.size ? "" : '<p class="t-warn" style="margin:0">Add a course to the catalog first.</p>'}
    <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="sf-err" style="margin:0 auto 0 0" hidden></p>${s ? `<button type="button" class="btn btn-danger" data-trs-del="${s.id}">Delete session</button>` : ""}<button type="button" class="btn btn-ghost" ${back}>Cancel</button><button class="btn btn-primary">${s ? "Save session" : "Schedule session"}</button></div></form>`;
};
VIEWS.trsession = () => {
  const s = S.sessions.get(S.view.id); if (!s) return notFound("Training", "Session", "trsessions"); const ed = S.canEdit; const c = S.courses.get(s.courseId);
  const att = Object.entries(s.att || {}).map(([id, st]) => ({ e: S.emps.get(id), st })).filter((x) => x.e).sort((a, b) => a.e.last.localeCompare(b.e.last));
  const open = s.status === "PLANNED"; const n = (k) => att.filter((x) => x.st === k).length;
  return backLink('data-go="trsessions"', "Sessions") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="t-muted" style="font-size:13px;font-weight:700">${esc(c?.code || "")} <span class="chip ${SES[s.status][1]}">${SES[s.status][0]}</span></span><h1 style="font-size:26px;font-weight:800">${esc(sesTitle(s))}</h1>
        <div class="t-muted" style="font-size:14px">${esc(sesWhen(s))}${s.venue ? ` · ${esc(s.venue)}` : ""}${s.trainer ? ` · ${esc(s.trainer)}` : ""}${sesHours(s) ? ` · ${sesHours(s)} hours` : ""}${s.cost ? ` · ${peso.format(s.cost)}` : ""}</div>
        ${s.notes ? `<p style="margin:4px 0 0;font-size:14px;white-space:pre-line">${esc(s.notes)}</p>` : ""}</div>
      <div class="head-actions"><button class="btn btn-ghost" data-trx="roster">Attendance sheet (CSV)</button>${ed ? `${open ? `<button class="btn btn-ghost" data-trs-cancel="${s.id}">Cancel session</button>` : `<button class="btn btn-ghost" data-trs-reopen="${s.id}">Reopen</button>`}<button class="btn btn-primary" data-trs-edit="${s.id}">Edit</button>` : ""}</div></section>
    <section class="stats"><div class="card stat"><span class="label">Enrolled</span><span class="value">${att.length}</span><span class="note t-muted">${s.cap ? `of ${s.cap} seats` : "no seat limit"}</span></div>
      <div class="card stat"><span class="label">Attended</span><span class="value">${n("ATTENDED")}</span><span class="note t-ok">get the certificate on completion</span></div>
      <div class="card stat"><span class="label">Absent</span><span class="value">${n("ABSENT")}</span><span class="note t-muted">re-enroll in a later session</span></div></section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Attendance</h2>${ed && open && att.length ? '<button class="link" data-trs-allin>Mark everyone attended</button>' : ""}</div>
        <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Needs it?</th><th>Attendance</th>${ed && open ? "<th></th>" : ""}</tr></thead><tbody>
          ${att.map(({ e, st }) => `<tr><td>${personCell(e, esc(pos(e.posId)?.title || ""), 180)}</td><td>${c && needs(c, e) ? `<span class="chip ${TSTATE[trainState(c, e)][1]}">${TSTATE[trainState(c, e)][0]}</span>` : '<span class="t-muted">Optional</span>'}</td>
            <td>${ed && open ? `<div style="display:flex;gap:6px">${["ATTENDED", "ABSENT"].map((k) => `<button class="btn btn-sm ${st === k ? (k === "ATTENDED" ? "btn-primary" : "btn-danger") : "btn-ghost"}" data-trs-att="${e.id}:${st === k ? "ENROLLED" : k}" aria-pressed="${st === k}">${ATT[k][0]}</button>`).join("")}</div>` : `<span class="chip ${ATT[st][1]}">${ATT[st][0]}</span>`}</td>
            ${ed && open ? `<td class="num"><button class="link quiet" data-trs-drop="${e.id}">Remove</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="4" class="empty">No one enrolled yet.</td></tr>`}
        </tbody></table></div>
        ${ed && open ? `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:14px"><button class="btn btn-primary" data-trs-done="${s.id}" ${n("ATTENDED") && s.d <= todayISO() ? "" : "disabled"}>Complete session</button><span class="t-muted" style="font-size:13px;max-width:56ch">${s.d > todayISO() ? `You can complete it from ${esc(fmtDate(s.d))}. ` : ""}Records ${esc(c?.title || "the course")} for the ${n("ATTENDED")} who attended, dated ${esc(fmtDate(s.to || s.d))}${c?.valid ? `, valid until ${esc(fmtDate(addMonths(s.to || s.d, c.valid)))}` : ""}.</span></div>` : ""}
      </section>
      ${ed && open ? `<section class="card"><div class="card-head"><h2>Enroll people</h2></div>
        <form id="enr-form" class="stack" style="gap:12px" data-keep>
          <div class="field"><label for="enr-q">Find people</label><input class="input" id="enr-q" type="search" placeholder="Name, employee no. or position"></div>
          <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="enr-need" ${c ? "checked" : "disabled"}> Only people who need this course</label>
          <div id="enr-list">${enrList(s)}</div>
          <button class="btn btn-primary">Enroll selected</button></form></section>` : ""}
    </div>`;
};
function enrList(s) {
  const c = S.courses.get(s.courseId); const q = ($("#enr-q")?.value || "").toLowerCase(); const onlyNeed = c && ($("#enr-need") ? $("#enr-need").checked : true);
  const list = active().filter((e) => !s.att?.[e.id] && (!onlyNeed || (needs(c, e) && trainState(c, e) !== "OK")) && (!q || `${fullName(e)} ${e.no} ${pos(e.posId)?.title || ""}`.toLowerCase().includes(q))).sort((a, b) => a.last.localeCompare(b.last));
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:6px"><span class="t-muted">${list.length} people</span>${list.length ? '<button type="button" class="link" data-enr-all>Select all shown</button>' : ""}</div>
    <div style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:0 12px">${list.slice(0, 300).map((e) => `<label class="check" style="padding:8px 0"><input type="checkbox" name="enr-emp" value="${e.id}"><span style="flex:1"><b style="font-weight:600">${esc(fullName(e))}</b> <span class="t-muted" style="font-size:13px">${esc(pos(e.posId)?.title || "")} · ${esc(siteName(siteOf(e)))}${c && needs(c, e) ? ` · ${TSTATE[trainState(c, e)][0].toLowerCase()}` : ""}</span></span></label>`).join("") || `<p class="t-muted" style="font-size:14px">${onlyNeed ? "Everyone who needs this is current or already enrolled." : "No one matches."}</p>`}</div>`;
}
async function submitSession() {
  const g = (k) => ($("#sf-" + k)?.value || "").trim(); const err = $("#sf-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!g("course") || !g("d")) return fail("Choose the course and the date."); if (g("to") && g("to") < g("d")) return fail("The last day is before the first day.");
  const prev = S.view.id ? S.sessions.get(S.view.id) : null;
  const s = { ...(prev || { id: uid(), status: "PLANNED", att: {} }), courseId: g("course"), d: g("d"), to: g("to") || null, start: g("start") || null, end: g("end") || null, hours: Number(g("hours")) || null,
    venue: g("venue") || null, trainer: g("trainer") || null, cap: Math.max(0, Math.floor(Number(g("cap")) || 0)) || null, cost: Number(g("cost")) || null, notes: g("notes") || null };
  try { await put("sessions", s); logActivity(`${prev ? "Updated" : "Scheduled"} ${sesTitle(s)} on ${fmtDate(s.d)}`); toast(prev ? "Session saved." : "Session scheduled. Enroll people next."); go("trsession", { id: s.id }); } catch { fail("Couldn't save. Try again."); }
}
async function completeSession(s) {
  const c = S.courses.get(s.courseId); const d = s.to || s.d; const ids = Object.entries(s.att || {}).filter(([, st]) => st === "ATTENDED").map(([id]) => id);
  if (c && ids.length) { const exp = c.valid ? addMonths(d, c.valid) : null; const add = Object.fromEntries(ids.map((id) => [id, { d, exp, ses: s.id }]));
    await S.db.doc("courses/" + c.id).update({ recs: add }); S.courses.set(c.id, { ...c, recs: { ...(c.recs || {}), ...add } }); }
  await put("sessions", { ...s, status: "DONE", done: todayISO() });
  logActivity(`Completed ${sesTitle(s)} (${ids.length} attended)`); toast(`Done. ${c?.title || "The course"} is recorded for ${ids.length} ${ids.length === 1 ? "person" : "people"}.`); render();
}

/* ---------- training records ---------- */
function filteredRecs() {
  const f = S.recFilter; const q = f.q.trim().toLowerCase();
  return allRecs().filter((r) => (!f.year || (r.d || "").startsWith(f.year)) && (!f.course || r.c.id === f.course) && (!f.dept || r.e.deptId === f.dept) && (!f.project || (f.project === "none" ? !r.e.projectId : r.e.projectId === f.project))
    && (!q || `${fullName(r.e)} ${r.e.no} ${r.c.title} ${r.c.code}`.toLowerCase().includes(q))).sort((a, b) => (b.d || "").localeCompare(a.d || ""));
}
VIEWS.trrecords = () => {
  const f = S.recFilter; const list = filteredRecs(); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const years = [...new Set(allRecs().map((r) => (r.d || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const hrs = PAY.r2(list.reduce((a, r) => a + (Number(r.c.hours) || 0), 0)); const ppl = new Set(list.map((r) => r.e.id)).size;
  const projs = [...S.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  return head(`${list.length} completions · ${ppl} people · ${hrs} hours`, "Training records", `<button class="btn btn-ghost" data-trx="records">Download (CSV)</button>`) + `
    <section class="card">
      <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="field" style="grid-column:span 2"><label for="rec-q">Search</label><input class="input" id="rec-q" type="search" value="${esc(f.q)}" placeholder="Name, employee no. or course"></div>
        <div class="field"><label for="rec-course">Course</label><select class="input" id="rec-course" data-recf="course">${opts(listOf(S.courses).sort((a, b) => a.title.localeCompare(b.title)).map((c) => [c.id, c.title]), f.course, "All")}</select></div>
        <div class="field"><label for="rec-year">Year</label><select class="input" id="rec-year" data-recf="year">${opts(years.map((y) => [y, y]), f.year, "All")}</select></div>
        <div class="field"><label for="rec-dept">Department</label><select class="input" id="rec-dept" data-recf="dept">${opts(S.org.departments.map((d) => [d.id, d.name]), f.dept, "All")}</select></div>
        <div class="field"><label for="rec-proj">Project</label><select class="input" id="rec-proj" data-recf="project">${opts([["none", "Head office"], ...projs.map((p) => [p.id, p.name])], f.project, "All")}</select></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Course</th><th>Completed</th><th>Expires</th><th class="num">Hours</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r) => { const st = trainState(r.c, r.e); return `<tr class="clickable" data-emp="${r.e.id}"><td>${personCell(r.e, esc(pos(r.e.posId)?.title || ""), 190)}</td><td><b>${esc(r.c.title)}</b><div class="t-muted" style="font-size:13px">${esc(r.c.code)}${r.ses && S.sessions.get(r.ses) ? ` · ${esc(S.sessions.get(r.ses).venue || "session")}` : ""}</div></td>
          <td style="white-space:nowrap">${esc(fmtDate(r.d))}</td><td style="white-space:nowrap">${r.exp ? esc(fmtDate(r.exp)) : '<span class="t-muted">No expiry</span>'}</td><td class="num">${r.c.hours || ""}</td><td><span class="chip ${TSTATE[st][1]}">${TSTATE[st][0]}</span></td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">No training records yet. They're added when you complete a session or record completions on a course.</td></tr>`}
      </tbody></table></div>
      ${list.length > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-recpage="-1" ${f.page <= 1 ? "disabled" : ""}>Previous</button><span class="t-muted">${(f.page - 1) * PAGE + 1}–${Math.min(list.length, f.page * PAGE)} of ${list.length}</span><button class="btn btn-ghost btn-sm" data-recpage="1" ${f.page * PAGE >= list.length ? "disabled" : ""}>Next</button></div>` : ""}
    </section>`;
};

/* ---------- exports ---------- */
function trExport(kind) {
  if (kind === "sessions") return offer(`training-sessions-${todayISO()}.csv`, toCSV([["Course", "Date", "Last day", "Start", "End", "Hours", "Venue", "Trainer", "Seats", "Enrolled", "Attended", "Cost", "Status"],
    ...listOf(S.sessions).sort((a, b) => a.d.localeCompare(b.d)).map((s) => { const a = Object.values(s.att || {}); return [sesTitle(s), s.d, s.to || "", s.start || "", s.end || "", sesHours(s) || "", s.venue || "", s.trainer || "", s.cap || "", a.length, a.filter((x) => x === "ATTENDED").length, s.cost || "", SES[s.status][0]]; })]));
  if (kind === "roster") { const s = S.sessions.get(S.view.id); if (!s) return;
    return offer(`attendance-${(S.courses.get(s.courseId)?.code || "session").toLowerCase()}-${s.d}.csv`, toCSV([["Employee No", "Name", "Position", "Site", "Attendance", "Signature"],
      ...Object.entries(s.att || {}).map(([id, st]) => ({ e: S.emps.get(id), st })).filter((x) => x.e).sort((a, b) => a.e.last.localeCompare(b.e.last)).map(({ e, st }) => [e.no, fullName(e), pos(e.posId)?.title || "", siteName(siteOf(e)), ATT[st][0], ""])])); }
  if (kind === "records") return offer(`training-records-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Position", "Course code", "Course", "Completed", "Expires", "Hours", "Status"],
    ...filteredRecs().map((r) => [r.e.no, fullName(r.e), pos(r.e.posId)?.title || "", r.c.code, r.c.title, r.d || "", r.exp || "", r.c.hours || "", TSTATE[trainState(r.c, r.e)][0]])]));
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-trs],[data-trs-course],[data-trs-edit],[data-trs-del],[data-trs-cancel],[data-trs-reopen],[data-trs-att],[data-trs-drop],[data-trs-allin],[data-trs-done],[data-enr-all],[data-ses-status],[data-sespage],[data-recpage],[data-trx]");
  if (!t) return; const d = t.dataset; const has = (a) => t.hasAttribute("data-" + a);
  try {
    if (d.trs) { go("trsession", { id: d.trs }); return; }
    if (d.trsCourse) { ev.stopImmediatePropagation(); go("trsessionForm", { courseId: d.trsCourse }); return; }
    if (d.sesStatus != null) { Object.assign(S.sesFilter, { status: d.sesStatus, page: 1 }); render(); return; }
    if (d.sespage) { S.sesFilter.page += Number(d.sespage); render(); return; }
    if (d.recpage) { S.recFilter.page += Number(d.recpage); render(); return; }
    if (d.trx) return trExport(d.trx);
    if (has("enr-all")) { document.querySelectorAll('input[name="enr-emp"]').forEach((x) => { x.checked = true; }); return; }
    if (!S.canEdit) return;
    if (d.trsEdit) { go("trsessionForm", { id: d.trsEdit }); return; }
    const s = S.sessions.get(S.view.id);
    if (d.trsDel) { if (!armed(t)) return; const x = S.sessions.get(d.trsDel); await drop("sessions", x.id); logActivity(`Deleted the ${sesTitle(x)} session on ${fmtDate(x.d)}`); toast("Session deleted."); go("trsessions"); return; }
    if (!s) return;
    if (d.trsCancel) { await put("sessions", { ...s, status: "CANCELLED" }); logActivity(`Cancelled ${sesTitle(s)} on ${fmtDate(s.d)}`); toast("Session cancelled."); render(); return; }
    if (d.trsReopen) { await put("sessions", { ...s, status: "PLANNED" }); toast("Session reopened. Completions already recorded stay on file."); render(); return; }
    if (d.trsAtt) { const [id, st] = d.trsAtt.split(":"); await put("sessions", { ...s, att: { ...(s.att || {}), [id]: st } }); render(); return; }
    if (d.trsDrop) { const att = { ...(s.att || {}) }; delete att[d.trsDrop]; await put("sessions", { ...s, att }); render(); return; }
    if (has("trs-allin")) { await put("sessions", { ...s, att: Object.fromEntries(Object.entries(s.att || {}).map(([id, st]) => [id, st === "ABSENT" ? st : "ATTENDED"])) }); render(); return; }
    if (d.trsDone) { t.disabled = true; await completeSession(s); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
}, true);
document.addEventListener("input", (ev) => {
  const t = ev.target; const keep = (id) => { const p0 = t.selectionStart; render(); const n = document.getElementById(id); if (n) { n.focus(); n.setSelectionRange(p0, p0); } };
  if (t.id === "ses-q") { S.sesFilter.q = t.value; S.sesFilter.page = 1; keep("ses-q"); return; }
  if (t.id === "rec-q") { S.recFilter.q = t.value; S.recFilter.page = 1; keep("rec-q"); return; }
  if (t.id === "enr-q") { const s = S.sessions.get(S.view.id); if (s) $("#enr-list").innerHTML = enrList(s); return; }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.recf) { S.recFilter[t.dataset.recf] = t.value; S.recFilter.page = 1; render(); return; }
  if (t.id === "enr-need") { const s = S.sessions.get(S.view.id); if (s) $("#enr-list").innerHTML = enrList(s); return; }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["ses-form", "enr-form"].includes(f.id)) return; ev.preventDefault(); if (!S.canEdit) return;
  try {
    if (f.id === "ses-form") return await submitSession();
    if (f.id === "enr-form") {
      const s = S.sessions.get(S.view.id); const ids = [...document.querySelectorAll('input[name="enr-emp"]:checked')].map((x) => x.value); if (!s || !ids.length) { toast("Tick at least one person."); return; }
      const att = { ...(s.att || {}) }; for (const id of ids) att[id] = "ENROLLED";
      if (s.cap && Object.keys(att).length > s.cap) { toast(`Only ${s.cap} seats. Remove some people or raise the seat count.`); return; }
      await put("sessions", { ...s, att }); logActivity(`Enrolled ${ids.length} in ${sesTitle(s)} on ${fmtDate(s.d)}`); toast(`Enrolled ${ids.length} ${ids.length === 1 ? "person" : "people"}.`); render(); return;
    }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});

/* ---------- training materials: handouts, slides, videos and links, filed by course ---------- */
const MAT = { MODULE: "Handout / module", SLIDES: "Slides", VIDEO: "Video", FORM: "Form / quiz", POLICY: "Policy / SOP", LINK: "Web link", OTHER: "Other" };
const matHref = (m) => (m.file ? "/_blob/" + m.file.id : m.url || "");
const matSize = (n) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function filteredMats() {
  const f = S.matFilter; const q = f.q.trim().toLowerCase();
  return listOf(S.mats).filter((m) => (!f.course || (f.course === "none" ? !m.courseId : m.courseId === f.course)) && (!f.type || m.type === f.type)
    && (!q || [m.title, m.desc, m.file?.name, S.courses.get(m.courseId)?.title].some((x) => (x || "").toLowerCase().includes(q)))).sort((a, b) => (b.at || "").localeCompare(a.at || "") || a.title.localeCompare(b.title));
}
const matRow = (m, withCourse = true) => { const c = S.courses.get(m.courseId); const href = matHref(m);
  return `<tr><td><b>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : esc(m.title)}</b>${m.desc ? `<div class="t-muted" style="font-size:13px">${esc(m.desc)}</div>` : ""}</td>
    ${withCourse ? `<td>${c ? `<button class="link" style="text-align:left" data-course="${c.id}">${esc(c.title)}</button>` : '<span class="t-muted">General</span>'}</td>` : ""}
    <td><span class="chip c-blue">${esc(MAT[m.type] || "Other")}</span></td><td class="t-muted" style="font-size:13px">${m.file ? `${esc(m.file.name)}${m.file.size ? ` · ${matSize(m.file.size)}` : ""}` : m.url ? "Link" : ""}</td>
    <td style="white-space:nowrap" class="t-muted">${m.at ? esc(fmtDate(m.at)) : ""}</td>
    <td style="white-space:nowrap">${href ? `<a class="btn btn-ghost btn-sm" href="${esc(href)}" target="_blank" rel="noopener">Open</a>` : ""}${S.canEdit ? ` <button class="btn btn-ghost btn-sm" data-mat-edit="${m.id}">Edit</button> <button class="btn btn-ghost btn-sm" data-mat-del="${m.id}">Delete</button>` : ""}</td></tr>`; };
const matHead = (withCourse = true) => `<thead><tr><th>Material</th>${withCourse ? "<th>Course</th>" : ""}<th>Type</th><th>File</th><th>Added</th><th></th></tr></thead>`;

VIEWS.trmaterials = () => {
  const f = S.matFilter; const list = filteredMats(); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const files = listOf(S.mats).filter((m) => m.file).length;
  return head(`${S.mats.size} materials · ${files} uploaded files · ${S.mats.size - files} links`, "Training materials", S.canEdit ? `<button class="btn btn-gold" data-go="trmaterialForm">${icon("plus")}Add material</button>` : "") + `
    <section class="card">
      <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="field" style="grid-column:span 2"><label for="mat-q">Search</label><input class="input" id="mat-q" type="search" value="${esc(f.q)}" placeholder="Title, file name or course"></div>
        <div class="field"><label for="mat-course">Course</label><select class="input" id="mat-course" data-matf="course">${opts([["none", "General (no course)"], ...listOf(S.courses).sort((a, b) => a.title.localeCompare(b.title)).map((c) => [c.id, c.title])], f.course, "All")}</select></div>
        <div class="field"><label for="mat-type">Type</label><select class="input" id="mat-type" data-matf="type">${opts(Object.entries(MAT), f.type, "All")}</select></div>
      </div>
      ${list.length ? `<div class="table-wrap"><table>${matHead()}<tbody>${rows.map((m) => matRow(m)).join("")}</tbody></table></div>`
        : `<p class="empty">${S.mats.size ? "No materials match these filters." : `No training materials yet.${S.canEdit ? ' Upload handouts, slides or videos, or save a link to files kept elsewhere such as Google Drive.' : ""}`}</p>`}
      ${list.length > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-matpage="-1" ${f.page <= 1 ? "disabled" : ""}>Previous</button><span class="t-muted">${(f.page - 1) * PAGE + 1}–${Math.min(list.length, f.page * PAGE)} of ${list.length}</span><button class="btn btn-ghost btn-sm" data-matpage="1" ${f.page * PAGE >= list.length ? "disabled" : ""}>Next</button></div>` : ""}
    </section>`;
};

VIEWS.trmaterialForm = () => {
  const m = S.view.id ? S.mats.get(S.view.id) : null; const courseId = m?.courseId || S.view.courseId || "";
  if (!S.canEdit) return backLink('data-go="trmaterials"', "Training materials") + '<section class="card"><p class="empty">Only editors can add materials.</p></section>';
  return backLink('data-go="trmaterials"', "Training materials") + `
    <section class="card"><h2 style="margin-bottom:14px">${m ? "Edit material" : "Add training material"}</h2>
      <form id="mat-form" class="form-grid" novalidate>
        <div class="field" style="grid-column:1/-1"><label for="mt-title">Title *</label><input class="input" id="mt-title" name="title" required value="${esc(m?.title || "")}" placeholder="e.g. Fire safety handout 2026"></div>
        <div class="field"><label for="mt-course">Course</label><select class="input" id="mt-course" name="courseId">${opts(listOf(S.courses).sort((a, b) => a.title.localeCompare(b.title)).map((c) => [c.id, c.title]), courseId, "General (no course)")}</select></div>
        <div class="field"><label for="mt-type">Type</label><select class="input" id="mt-type" name="type">${opts(Object.entries(MAT), m?.type || "MODULE")}</select></div>
        <div class="field" style="grid-column:1/-1"><label for="mt-desc">Description</label><textarea class="input" id="mt-desc" name="desc" rows="3" placeholder="What it covers and who it's for">${esc(m?.desc || "")}</textarea></div>
        ${S.assets ? `<div class="field"><label for="mt-file">${m?.file ? `Replace file (now: ${esc(m.file.name)})` : "Upload a file"}</label><input id="mt-file" type="file" accept="application/pdf,image/*,video/*,text/plain,text/csv,text/markdown"><span class="t-muted" style="font-size:13px">PDF, image, video or text, up to 20 MB.</span></div>` : ""}
        <div class="field"><label for="mt-url">${S.assets ? "Or a link" : "Link"}</label><input class="input" id="mt-url" name="url" type="url" value="${esc(m?.url || "")}" placeholder="https://drive.google.com/…"><span class="t-muted" style="font-size:13px">Use a link for Word or PowerPoint files kept in Google Drive or OneDrive.</span></div>
        <p class="err" id="mt-err" role="alert" hidden style="grid-column:1/-1"></p>
        <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" id="mt-save">Save</button><button type="button" class="btn btn-ghost" data-go="trmaterials">Cancel</button></div>
      </form>
    </section>`;
};

async function submitMaterial(f) {
  const err = $("#mt-err"); err.hidden = true; const say = (t) => { err.textContent = t; err.hidden = false; };
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const prev = S.view.id ? S.mats.get(S.view.id) : null;
  const file = $("#mt-file")?.files?.[0]; const url = val("url");
  if (!val("title")) return say("Enter a title.");
  if (url && !/^https?:\/\/\S+$/i.test(url)) return say("Enter a full link starting with https://");
  if (!file && !url && !prev?.file) return say(S.assets ? "Upload a file or enter a link." : "Enter a link.");
  const btn = $("#mt-save"); btn.disabled = true; btn.textContent = file ? "Uploading…" : "Saving…";
  let up = prev?.file || null;
  if (file) {
    try { const r = await S.assets.upload(file); up = { id: r.id, name: file.name.slice(0, 120), size: r.sizeBytes || file.size }; }
    catch (x) { btn.disabled = false; btn.textContent = "Save"; return say(x?.code === "unsupported_type" ? "That file type can't be uploaded. Use PDF, image, video or text, or save a link instead." : x?.code === "too_large" ? "That file is over 20 MB. Save a link to it instead." : "Upload failed. Try again."); }
  }
  const m = { ...(prev || { id: uid(), at: todayISO() }), title: val("title"), courseId: val("courseId") || null, type: val("type") || "OTHER", desc: val("desc") || null, url: url || null, file: up };
  await put("trmaterials", m);
  if (file && prev?.file && prev.file.id !== up.id) { try { await S.assets.delete(prev.file.id); } catch {} }
  logActivity(`${prev ? "Updated" : "Added"} training material ${m.title}`); toast("Material saved."); S.dirty = false; go("trmaterials");
}

/* Course pages list the materials filed under that course. */
{
  const base = VIEWS.course;
  VIEWS.course = () => { const c = S.courses.get(S.view.id); const html = base(); if (!c) return html;
    const ms = listOf(S.mats).filter((m) => m.courseId === c.id).sort((a, b) => a.title.localeCompare(b.title));
    return html + `<section class="card"><div class="card-head"><h2>Training materials</h2>${S.canEdit ? `<button class="btn btn-ghost btn-sm" data-mat-add="${c.id}">${icon("plus", 16)}Add material</button>` : ""}</div>
      ${ms.length ? `<div class="table-wrap"><table>${matHead(false)}<tbody>${ms.map((m) => matRow(m, false)).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No materials filed under this course yet.</p>'}</section>`; };
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-mat-edit],[data-mat-del],[data-mat-add],[data-matpage]"); if (!t) return; const d = t.dataset;
  try {
    if (d.matpage) { S.matFilter.page += Number(d.matpage); render(); return; }
    if (!S.canEdit) return;
    if (d.matAdd) { go("trmaterialForm", { courseId: d.matAdd }); return; }
    if (d.matEdit) { go("trmaterialForm", { id: d.matEdit }); return; }
    if (d.matDel) { if (!armed(t)) return; const m = S.mats.get(d.matDel); if (!m) return; await drop("trmaterials", m.id); if (m.file) { try { await S.assets?.delete(m.file.id); } catch {} }
      logActivity(`Deleted training material ${m.title}`); toast("Material deleted."); render(); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
}, true);
document.addEventListener("input", (ev) => { const t = ev.target; if (t.id !== "mat-q") return; const p0 = t.selectionStart; S.matFilter.q = t.value; S.matFilter.page = 1; render(); const n = $("#mat-q"); if (n) { n.focus(); n.setSelectionRange(p0, p0); } });
document.addEventListener("change", (ev) => { const t = ev.target; if (t.dataset.matf) { S.matFilter[t.dataset.matf] = t.value; S.matFilter.page = 1; render(); } });
document.addEventListener("submit", async (ev) => { const f = ev.target; if (f.id !== "mat-form") return; ev.preventDefault(); if (!S.canEdit) return;
  try { await submitMaterial(f); } catch { const b = $("#mt-save"); if (b) { b.disabled = false; b.textContent = "Save"; } toast("Couldn't save. Check your connection and try again."); } });

/* ---------- recruitment split: Head Office jobs (no project) and Projects jobs ---------- */
function hiringScoped(scope) {
  const all = { jobs: S.jobs, apps: S.apps };
  const keep = (j) => (scope === "prj") === !!j?.projectId;
  const jobs = new Map([...S.jobs].filter(([, j]) => keep(j)));
  const apps = new Map([...S.apps].filter(([, a]) => keep(S.jobs.get(a.jobId))));
  if (S.hireJob && !jobs.has(S.hireJob)) S.hireJob = "";
  let html;
  try { S.jobs = jobs; S.apps = apps; S.hireScope = scope; html = VIEWS.hiring(); } finally { S.jobs = all.jobs; S.apps = all.apps; S.hireScope = null; }
  const name = scope === "prj" ? "Recruitment · Projects" : "Recruitment · Head Office";
  return html.replace(/(<h1[^>]*>)Recruitment(<\/h1>)/, `$1${name}$2`).replace(/(<div class="stats|<section class="stats)/, `${hireTabs()}$1`);
}
const hireTabs = () => `<div class="tabs on-blue" role="tablist">${[["hiring", "All"], ["hireho", "Head Office"], ["hireprj", "Projects"]].map(([v, l]) => `<button class="tab" role="tab" data-go="${v}" aria-selected="${S.view.name === v}">${l}</button>`).join("")}</div>`;
{
  const base = VIEWS.hiring;
  VIEWS.hiring = () => { const html = base(); return S.view.name === "hiring" ? html.replace(/(<section class="stats)/, `${hireTabs()}$1`) : html; };
}
VIEWS.hireho = () => hiringScoped("ho");
VIEWS.hireprj = () => hiringScoped("prj");

