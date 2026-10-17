/* ---------- timekeeping module: home, daily time records, overtime requests ---------- */
Object.assign(S, {
  otReqs: new Map(), otFilter: { q: "", status: "PENDING", page: 1 },
  dtr: { tab: "day", date: null, emp: null, q: "", site: "", status: "", page: 1 },
});
Object.assign(TCOLS, { otreqs: "otReqs" });
Object.assign(ICON, {
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  fp: '<path d="M12 11v3a8 8 0 0 1-1 4"/><path d="M8 13a4 4 0 0 1 8 0c0 2-.3 3.6-1 5"/><path d="M5 16c-.6-1-1-2.3-1-4a8 8 0 0 1 14.5-4.7"/><path d="M20 12c0 1.5-.1 3-.5 4.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  watch: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
});
{
  // Timekeeping becomes its own module; what's left of "Time & Pay" is payroll.
  const tp = NAV.find(([g]) => g === "Time & Pay"); const take = (v) => { const i = tp[1].findIndex(([x]) => x === v); return i < 0 ? null : tp[1].splice(i, 1)[0]; };
  take("attendance"); take("clockin"); const leave = take("leave"); tp[0] = "Payroll";
  NAV.splice(NAV.indexOf(tp), 0, ["Timekeeping", [["tk", "Timekeeping home", "clock"], ["dtr", "Daily time records", "sheet"], ["attendance", "Time sheet", "cal"], ["clockin", "Phone clock-in", "phone"], ["punches", "Biometric import", "fp"], ["ot", "Overtime requests", "watch"], leave || ["leave", "Leave", "cal"], ["timeSettings", "Shifts & holidays", "sliders"]]]);
  Object.assign(SECTION_OF, { tk: "tk", dtr: "dtr", punches: "punches", ot: "ot", otForm: "ot", timeSettings: "timeSettings" });
}
function bootTk(db) {
  db.collection("otreqs").limit(3000).onSnapshot((snap) => { S.otReqs = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
}

/* ---------- working out a day from punches ---------- */
const grace = () => Number(SET().lateGrace) || 0;
const shiftOf = (e) => SET().shifts.find((s) => s.id === (e?.shiftId || "day")) || SET().shifts[0];
const atManila = (d, hhmm) => Date.parse(`${d}T${hhmm}:00+08:00`);
const hm = (iso) => (iso ? timeFmt.format(new Date(iso)) : "");
const weekday = new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "Asia/Manila" });
function shiftSpan(e, d) { const s = shiftOf(e); const a = atManila(d, s.start); let b = atManila(d, s.end); if (b <= a) b += 864e5; return { s, a, b }; }
/* Pairs each person's punches the way the time sheet import does (an IN with the next OUT within 20 hours) and files each pair under the day it started,
   so a night shift's time out lands on the night it began. */
function punchDays(from, to) {
  const by = new Map();
  for (const p of punchesIn(addDays(from, -1), addDays(to, 1))) { if (!S.emps.get(p.empId)) continue; (by.get(p.empId) || by.set(p.empId, []).get(p.empId)).push(p); }
  const out = new Map();
  for (const [eid, list] of by) {
    const days = new Map(); const day = (d) => days.get(d) || days.set(d, { pairs: [], lone: [] }).get(d);
    // Biometric and GPS punches are paired separately, so one person using both doesn't scramble the pairs.
    for (const src of [list.filter((p) => p.bio), list.filter((p) => !p.bio)]) {
      src.sort((a, b) => a.t.localeCompare(b.t));
      for (let i = 0; i < src.length; i++) {
        const a = src[i]; if (a.type === "OUT") { day(manilaDay(a.t)).lone.push({ out: a }); continue; }
        const b = src[i + 1];
        if (b && b.type !== "IN" && Date.parse(b.t) - Date.parse(a.t) <= 20 * 36e5) { day(manilaDay(a.t)).pairs.push({ in: a, out: b }); i++; } else day(manilaDay(a.t)).lone.push({ in: a });
      }
    }
    out.set(eid, days);
  }
  return out;
}
function tkCtx() {
  const hol = new Map(); for (const h of SET().holidays) hol.set(h.d, [...(hol.get(h.d) || []), h]);
  return { hol, leaves: allLeaves().filter((l) => l.status === "APPROVED"), now: Date.now(), today: todayISO(), grace: grace() };
}
const TK_STATUS = {
  in: ["Present", "c-ok"], late: ["Late", "c-warn"], notin: ["Not in yet", "c-bad"], absent: ["Absent", "c-bad"], due: ["Scheduled", "c-gray"],
  leave: ["On leave", "c-blue"], rest: ["Rest day", "c-gray"], hol: ["Holiday", "c-gray"], na: ["Not employed", "c-gray"],
};
function dayRec(e, d, rec, ctx) {
  const hol = ctx.hol.get(d) || []; const rest = PAY.isRest(parseISO(d), SET()); const lv = ctx.leaves.find((l) => l.empId === e.id && l.from <= d && l.to >= d);
  const { s, a, b } = shiftSpan(e, d); const pairs = rec?.pairs || [], lone = rec?.lone || [];
  const ins = [...pairs.map((p) => p.in), ...lone.filter((x) => x.in).map((x) => x.in)].map((p) => p.t).sort();
  const outs = [...pairs.map((p) => p.out), ...lone.filter((x) => x.out).map((x) => x.out)].map((p) => p.t).sort();
  const r = { d, shift: s, hol, rest, lv, in: ins[0] || null, out: outs[outs.length - 1] || null, hrs: 0, late: 0, ut: 0, ot: 0, noOut: false, noIn: false, src: [...new Set([...pairs.flatMap((p) => [p.in, p.out]), ...lone.map((x) => x.in || x.out)].map((p) => (p.bio ? "Biometric" : p.kiosk ? "Kiosk" : "Phone")))] };
  const hrsBy = { bio: 0, geo: 0 };
  for (const p of pairs) { const span = (Date.parse(p.out.t) - Date.parse(p.in.t)) / 36e5; hrsBy[p.in.bio ? "bio" : "geo"] += span > 5 ? span - 1 : span; }
  r.hrs = PAY.r2(Math.max(hrsBy.bio, hrsBy.geo));
  const all = [...pairs.flatMap((p) => [p.in, p.out]), ...lone.map((x) => x.in || x.out)].sort((x, y) => x.t.localeCompare(y.t));
  const firstLast = (list) => { const i = list.filter((p) => p.type !== "OUT"), o = list.filter((p) => p.type === "OUT" || (p.type == null && p !== i[0]));
    return { in: i[0] || null, out: o.length ? o[o.length - 1] : null }; };
  r.bio = firstLast(all.filter((p) => p.bio)); r.geo = firstLast(all.filter((p) => !p.bio));
  const workday = !rest && !hol.length && !lv;
  if (r.in && workday) r.late = Math.max(0, Math.round((Date.parse(r.in) - a) / 6e4));
  if (r.out && pairs.length && workday) { r.ut = Math.max(0, Math.round((b - Date.parse(r.out)) / 6e4)); r.ot = Math.floor(Math.max(0, (Date.parse(r.out) - b) / 18e5)) / 2; }
  r.noOut = lone.some((x) => x.in) && !pairs.length && (d < ctx.today || ctx.now >= b + 4 * 36e5); r.noIn = lone.some((x) => x.out) && !pairs.length;
  const employed = (!e.hire || e.hire <= d) && (!e.separated?.date || e.separated.date >= d);
  r.status = !employed ? "na" : lv ? "leave" : r.in ? (workday && r.late > ctx.grace ? "late" : "in") : hol.length ? "hol" : rest ? "rest"
    : d > ctx.today || ctx.now < a ? "due" : d === ctx.today && ctx.now < b ? "notin" : "absent";
  return r;
}
function remarks(r) {
  const x = [];
  if (r.lv) x.push(leaveType(r.lv.type)?.name || "Leave");
  if (r.hol.length) x.push(r.hol.map((h) => h.name).join(", "));
  if (r.rest && r.in) x.push("Worked on a rest day"); else if (r.hol.length && r.in) x.push("Worked on a holiday");
  if (r.noOut) x.push("No time out"); if (r.noIn) x.push("No time in");
  return x.join(" · ");
}
/* A biometric or GPS time with, for GPS, where it was made. */
function srcCell(p, geo) {
  if (!p) return '<span class="t-muted">—</span>';
  if (!geo) return `<b>${esc(hm(p.t))}</b>`;
  const fz = fence(p);
  return `<b>${esc(hm(p.t))}</b><div style="margin-top:3px"><span class="chip ${FENCE_CHIP[fz.state]}" style="font-size:11px" title="${esc(fz.text)}">${fz.state === "in" ? "In area" : fz.state === "out" ? `${esc(distText(fz.dist))} away` : fz.state === "nogps" ? "No GPS" : "No area set"}</span>${p.kiosk ? ' <span class="t-muted" style="font-size:11px">kiosk</span>' : ""}</div>${geoLine(p)}`;
}
const geoText = (p) => { if (!p) return ""; const fz = fence(p); return `${hm(p.t)} (${fz.text}${p.lat != null ? `; ${p.lat}, ${p.lng}` : ""})`; };
const minsText = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : "");
/* Everyone's day: [{ e, r }] for active employees. */
function dayBoard(d) {
  const pd = punchDays(d, d); const ctx = tkCtx();
  return active().map((e) => ({ e, r: dayRec(e, d, pd.get(e.id)?.get(d), ctx) })).filter((x) => x.r.status !== "na");
}

/* ---------- timekeeping home ---------- */
VIEWS.tk = () => {
  const today = todayISO(); const yday = addDays(today, -1); const pid = curPeriod(); const p = PAY.period(pid);
  loadClock(yday, today); loadClock(p.start, p.end);
  const board = dayBoard(today); const n = (st) => board.filter((x) => x.r.status === st).length;
  const expected = board.filter((x) => !["rest", "hol", "leave"].includes(x.r.status)).length;
  const timedIn = n("in") + n("late");
  const ydayOpen = dayBoard(yday).filter((x) => x.r.noOut);
  const outside = punchesIn(today, today).filter((x) => !x.bio).map(fence).filter((f) => f.state === "out").length;
  const waiting = [...S.clockDevs.values()].filter((d) => !d.kiosk && !d.bio && !S.clockLinks[d.id]).length;
  const otWait = listOf(S.otReqs).filter((r) => r.status === "PENDING" && S.emps.get(r.empId)).length;
  const lvWait = allLeaves().filter((l) => l.status === "PENDING").length;
  const daysLeft = Math.round((parseISO(p.end) - parseISO(today)) / 864e5);
  const longDate = new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date());

  const sites = new Map();
  for (const x of board) { const id = siteOf(x.e); const s = sites.get(id) || sites.set(id, { id, exp: 0, in: 0, late: 0, notin: 0, leave: 0 }).get(id);
    if (!["rest", "hol", "leave"].includes(x.r.status)) s.exp++; if (x.r.status === "in" || x.r.status === "late") s.in++; if (x.r.status === "late") s.late++; if (x.r.status === "notin" || x.r.status === "absent") s.notin++; if (x.r.status === "leave") s.leave++; }
  const siteRows = [...sites.values()].sort((a, b) => (a.id === "office" ? -1 : b.id === "office" ? 1 : siteName(a.id).localeCompare(siteName(b.id))));

  const per = punchDays(p.start, p.end); const ctx = tkCtx(); let lateM = 0, abs = 0, otH = 0, people = 0;
  for (const e of active()) { const days = per.get(e.id); if (days) people++;
    PAY.eachDay(p.start, p.end < today ? p.end : today, (_, d) => { const r = dayRec(e, d, days?.get(d), ctx); if (r.status === "late") lateM += r.late; if (r.status === "absent" && d < today && days) abs++; otH += r.ot; }); }
  const otApproved = PAY.r2(listOf(S.otReqs).filter((r) => r.status === "APPROVED" && r.d >= p.start && r.d <= p.end && S.emps.get(r.empId)).reduce((a, r) => a + (r.hours || 0), 0));

  const todo = [
    [ydayOpen.length, `${ydayOpen.length} ${ydayOpen.length === 1 ? "person has" : "people have"} no time out for yesterday`, `data-tk-day="${yday}:"`],
    [outside, `${outside} phone ${outside === 1 ? "punch was" : "punches were"} made outside the site area today`, 'data-clock-tab="punches"'],
    [waiting, `${waiting} phone ${waiting === 1 ? "account is" : "accounts are"} waiting to be linked to an employee`, 'data-clock-tab="links"'],
    [otWait, `${otWait} overtime ${otWait === 1 ? "request is" : "requests are"} waiting for approval`, 'data-go="ot"'],
    [lvWait, `${lvWait} leave ${lvWait === 1 ? "request is" : "requests are"} waiting for a decision`, 'data-go="leave"'],
    [isFinal(pid) ? 0 : daysLeft <= 2 ? 1 : 0, `Cutoff for ${p.label} is ${daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}: send punches and approved overtime to the time sheet`, 'data-go="attendance"'],
  ].filter(([k]) => k);
  const people5 = (st) => board.filter((x) => x.r.status === st).sort((a, b) => (b.r.late - a.r.late) || a.e.last.localeCompare(b.e.last));
  const mini = (list, sub) => list.length ? `<ul class="list">${list.slice(0, 6).map((x) => `<li><button class="tile person" style="border:0;padding:0" data-dtr-emp="${x.e.id}">${avatar(x.e, 36)}<span class="who"><span class="name" style="font-size:14px">${esc(fullName(x.e))}</span><span class="sub">${sub(x)}</span></span></button></li>`).join("")}</ul>${list.length > 6 ? `<button class="link" style="margin-top:10px" data-tk-day="${today}:${list[0].r.status}">See all ${list.length}</button>` : ""}` : '<p class="t-muted" style="margin:0">No one.</p>';

  return head(longDate, "Timekeeping", `${S.canEdit ? `<button class="btn btn-gold" data-go="kiosk">${icon("camera")}Open site kiosk</button><button class="btn btn-ghost" data-go="punches">Import biometric file</button><button class="btn btn-ghost" data-go="otForm">File overtime</button>` : ""}`) + `
    <section class="stats" aria-label="Attendance today">
      <div class="card stat"><span class="label">Expected at work today</span><span class="value">${expected}</span><span class="note t-muted">${n("rest") + n("hol")} on rest day or holiday</span></div>
      <div class="card stat"><span class="label">Timed in</span><span class="value">${timedIn}</span><span class="note t-ok">${expected ? Math.round((timedIn / expected) * 100) : 0}% of expected · ${board.filter((x) => x.r.bio.in).length} biometric, ${board.filter((x) => x.r.geo.in).length} GPS</span></div>
      <div class="card stat"><span class="label">Late</span><span class="value">${n("late")}</span><span class="note ${n("late") ? "t-warn" : "t-muted"}">${grace() ? `after a ${grace()}-minute grace period` : "after shift start"}</span></div>
      <div class="card stat"><span class="label">Not in yet</span><span class="value">${n("notin")}</span><span class="note t-muted">${n("due")} shifts start later today</span></div>
      <div class="card stat"><span class="label">On leave</span><span class="value">${n("leave")}</span><span class="note t-blue">approved leave today</span></div>
    </section>
    ${S.clockLoading.size ? '<p style="color:var(--onblue);margin:0;font-weight:600">Loading punches…</p>' : ""}
    <div class="row">
      <section class="card wide"><div class="card-head"><h2>Today by site</h2><button class="link" data-tk-day="${today}:">Today's attendance</button></div>
        ${siteRows.length ? `<div class="table-wrap"><table><thead><tr><th>Site</th><th class="num">Expected</th><th class="num">Timed in</th><th class="num">Late</th><th class="num">Not in</th><th class="num">On leave</th></tr></thead><tbody>
          ${siteRows.map((s) => `<tr class="clickable" data-tk-site="${esc(s.id)}"><td><b>${esc(siteName(s.id))}</b></td><td class="num">${s.exp}</td><td class="num">${s.in}</td><td class="num">${s.late ? `<span class="t-warn">${s.late}</span>` : 0}</td><td class="num">${s.notin ? `<span class="t-bad">${s.notin}</span>` : 0}</td><td class="num">${s.leave}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Add employees to see who's at work.</p>`}
      </section>
      <section class="card"><div class="card-head"><h2>Needs attention</h2></div>
        ${todo.length ? `<ul class="list" style="font-size:14px">${todo.map(([, t, a]) => `<li><button class="link" style="text-align:left;color:var(--ink);font-weight:600" ${a}>${esc(t)}</button></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">Nothing needs a decision right now.</p>'}
      </section>
    </div>
    <div class="row">
      <section class="card"><div class="card-head"><h2>Late today</h2></div>${mini(people5("late"), (x) => `${esc(hm(x.r.in))} · ${minsText(x.r.late)} late`)}</section>
      <section class="card"><div class="card-head"><h2>Not in yet</h2></div>${mini(people5("notin"), (x) => `${esc(x.r.shift.name)} from ${esc(x.r.shift.start)} · ${esc(siteName(siteOf(x.e)))}`)}</section>
      <section class="card"><div class="card-head"><h2>Pay period ${esc(p.label)}</h2><button class="link" data-go="attendance">Time sheet</button></div>
        <ul class="list" style="font-size:14px">
          <li style="display:flex;justify-content:space-between;gap:10px"><span>Cutoff</span><b>${esc(fmtDate(p.end))}${isFinal(pid) ? ' <span class="chip c-ok">Final</span>' : ""}</b></li>
          <li style="display:flex;justify-content:space-between;gap:10px"><span>People with punches</span><b class="num">${people}</b></li>
          <li style="display:flex;justify-content:space-between;gap:10px"><span>Late so far</span><b class="num">${minsText(lateM) || "0m"}</b></li>
          <li style="display:flex;justify-content:space-between;gap:10px"><span>Absences so far</span><b class="num">${abs}</b></li>
          <li style="display:flex;justify-content:space-between;gap:10px"><span>Overtime punched</span><b class="num">${PAY.r2(otH)} hrs</b></li>
          <li style="display:flex;justify-content:space-between;gap:10px"><span>Overtime approved</span><b class="num">${otApproved} hrs</b></li>
        </ul>
        <p class="t-muted" style="margin:12px 0 0;font-size:13px">Counted from phone, kiosk and biometric punches. Absences count only for people who use the time clock.</p></section>
    </div>`;
};

/* ---------- daily time records ---------- */
VIEWS.dtr = () => {
  const D = S.dtr; const tabs = tabsBar(D.tab, [["day", "By day"], ["emp", "By employee"]], "dtr-tab");
  return head("Biometric and GPS (phone and kiosk) time in and time out", "Daily time records") + tabs + (D.tab === "emp" ? dtrEmp() : dtrDay());
};
function dtrDay() {
  const D = S.dtr; const d = D.date || todayISO(); loadClock(addDays(d, -1), addDays(d, 1));
  const board = dayBoard(d); const q = D.q.trim().toLowerCase();
  const list = board.filter((x) => (!D.site || siteOf(x.e) === D.site) && (!D.status || x.r.status === D.status || (D.status === "missing" && (x.r.noOut || x.r.noIn))) && (!q || `${fullName(x.e)} ${x.e.no}`.toLowerCase().includes(q)))
    .sort((a, b) => a.e.last.localeCompare(b.e.last));
  const count = (st) => board.filter((x) => x.r.status === st).length;
  const rows = list.slice((D.page - 1) * PAGE, D.page * PAGE);
  return `<section class="card">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
      <label class="field" style="margin:0"><span class="lbl">Date</span><input class="input" type="date" id="dtr-date" value="${d}" max="${addDays(todayISO(), 31)}"></label>
      <label class="field" style="margin:0"><span class="lbl">Site</span><select class="input" id="dtr-site">${opts(siteList().map((s) => [s.id, s.name]), D.site, "All sites")}</select></label>
      <label class="field" style="margin:0"><span class="lbl">Status</span><select class="input" id="dtr-status">${opts([...Object.entries(TK_STATUS).filter(([k]) => k !== "na").map(([k, [l]]) => [k, `${l} (${count(k)})`]), ["missing", "Missing time in or out"]], D.status, "Everyone")}</select></label>
      <label class="field" style="margin:0;flex:1;min-width:180px"><span class="lbl">Search</span><input class="input" type="search" id="dtr-q" value="${esc(D.q)}" placeholder="Name or employee no."></label>
      <button class="btn btn-ghost" data-tkx="day">Download (CSV)</button>
    </div>
    ${S.clockLoading.size ? '<p class="t-muted" style="margin:0 0 10px;font-size:14px">Loading punches…</p>' : ""}
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Site</th><th>Shift</th><th class="num">Biometric in</th><th class="num">Biometric out</th><th class="num">GPS in</th><th class="num">GPS out</th><th class="num">Hours</th><th class="num">Late</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map(({ e, r }) => `<tr class="clickable" data-dtr-emp="${e.id}"><td>${personCell(e, esc(e.no), 190)}</td><td>${esc(siteName(siteOf(e)))}</td><td class="t-muted" style="white-space:nowrap">${esc(r.shift.start)}–${esc(r.shift.end)}</td>
        <td class="num">${srcCell(r.bio.in)}</td><td class="num">${srcCell(r.bio.out)}</td><td class="num">${srcCell(r.geo.in, true)}</td><td class="num">${srcCell(r.geo.out, true)}</td><td class="num">${r.hrs || ""}</td><td class="num">${r.late && r.status === "late" ? `<span class="t-warn">${minsText(r.late)}</span>` : ""}</td>
        <td><span class="chip ${TK_STATUS[r.status][1]}">${TK_STATUS[r.status][0]}</span></td><td class="t-muted" style="font-size:13px">${esc(remarks(r))}</td></tr>`).join("") || `<tr><td colspan="11" class="empty">${board.length ? "No one matches these filters." : "No employees yet."}</td></tr>`}
    </tbody></table></div>
    ${list.length > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-tkpage="-1" ${D.page <= 1 ? "disabled" : ""}>Previous</button><span class="t-muted">${(D.page - 1) * PAGE + 1}–${Math.min(list.length, D.page * PAGE)} of ${list.length}</span><button class="btn btn-ghost btn-sm" data-tkpage="1" ${D.page * PAGE >= list.length ? "disabled" : ""}>Next</button></div>` : ""}
  </section>`;
}
function dtrRows(e, pid) {
  const p = PAY.period(pid); const days = punchDays(p.start, p.end).get(e.id); const ctx = tkCtx(); const out = [];
  PAY.eachDay(p.start, p.end, (_, d) => out.push(dayRec(e, d, days?.get(d), ctx)));
  return out;
}
function dtrEmp() {
  const D = S.dtr; const pid = S.periodId || curPeriod(); const p = PAY.period(pid); loadClock(addDays(p.start, -1), addDays(p.end, 1));
  if (D.emp && !S.emps.get(D.emp)) D.emp = null; const e = S.emps.get(D.emp);
  const pick = `<form id="dtr-pick" data-keep style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">${empPicker("dtr-emp", D.emp)}
    <label class="field"><span class="lbl">Pay period</span><select class="input" data-period-pick="att">${opts(periodChoices(pid), pid)}</select></label></form>`;
  if (!e) return `<section class="card">${pick}<p class="t-muted" style="margin:14px 0 0">Choose an employee to see their daily time record.</p></section>`;
  const rows = dtrRows(e, pid); const sum = (k) => PAY.r2(rows.reduce((a, r) => a + (k === "late" ? (r.status === "late" ? r.late : 0) : r[k]), 0));
  const absent = rows.filter((r) => r.status === "absent").length; const ot = listOf(S.otReqs).filter((r) => r.empId === e.id && r.status === "APPROVED" && r.d >= p.start && r.d <= p.end);
  return `<section class="card no-print">${pick}</section>
    <section class="card"><div class="card-head"><div>${personCell(e, `${esc(e.no)} · ${esc(shiftOf(e).name)} ${esc(shiftOf(e).start)}–${esc(shiftOf(e).end)} · ${esc(siteName(siteOf(e)))}`, 260)}</div>
      <span class="no-print" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-tkx="emp">Download (CSV)</button><button class="btn btn-ghost btn-sm" data-tk-print>Print</button>${S.canEdit ? `<button class="btn btn-ghost btn-sm" data-go="otForm" data-ot-emp="${e.id}">File overtime</button>` : ""}</span></div>
      <h2 style="margin:4px 0 12px;font-size:16px">Daily time record, ${esc(p.label)}</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Schedule</th><th class="num">Biometric in</th><th class="num">Biometric out</th><th class="num">GPS in</th><th class="num">GPS out</th><th class="num">Hours</th><th class="num">Late</th><th class="num">Undertime</th><th class="num">OT (hrs)</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td style="white-space:nowrap"><b>${esc(weekday.format(new Date(atManila(r.d, "12:00"))))}</b> ${esc(fmtDate(r.d))}</td>
          <td class="t-muted" style="white-space:nowrap">${r.rest ? "Rest day" : r.hol.length ? "Holiday" : `${esc(r.shift.start)}–${esc(r.shift.end)}`}</td>
          <td class="num">${srcCell(r.bio.in)}</td><td class="num">${srcCell(r.bio.out)}</td><td class="num">${srcCell(r.geo.in, true)}</td><td class="num">${srcCell(r.geo.out, true)}</td><td class="num">${r.hrs || ""}</td><td class="num">${r.status === "late" ? minsText(r.late) : ""}</td><td class="num">${minsText(r.ut)}</td><td class="num">${r.ot || ""}</td>
          <td><span class="chip ${TK_STATUS[r.status][1]}">${TK_STATUS[r.status][0]}</span></td><td class="t-muted" style="font-size:13px">${esc([remarks(r)].filter(Boolean).join(" · "))}</td></tr>`).join("")}
      </tbody><tfoot><tr><th colspan="6">Totals</th><th class="num">${sum("hrs")}</th><th class="num">${minsText(sum("late"))}</th><th class="num">${minsText(sum("ut"))}</th><th class="num">${sum("ot")}</th><th colspan="2">${absent} absent</th></tr></tfoot></table></div>
      <p class="t-muted" style="margin:12px 0 0;font-size:13px">Time in counts the earliest punch of the day from either source and time out the latest. GPS times show whether the phone or kiosk was inside the site area. Hours leave out a 1-hour break on stretches longer than 5 hours. Overtime counts in 30-minute blocks after the shift. ${ot.length ? `Approved overtime this period: ${PAY.r2(ot.reduce((a, r) => a + (r.hours || 0), 0))} hrs.` : "No approved overtime this period."}</p>
      <div class="print-only" style="margin-top:40px;display:none;gap:60px"><span>Employee signature ____________________</span><span>Verified by ____________________</span></div>
    </section>`;
}

/* ---------- overtime requests ---------- */
const OT_STATUS = { PENDING: ["Waiting", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-gray"] };
function otKind(d) { const h = SET().holidays.filter((x) => x.d === d); const reg = h.filter((x) => x.type === "REG").length; const rest = PAY.isRest(parseISO(d), SET());
  if (reg >= 2) return ["dhot", "Double holiday"]; if (reg && rest) return ["rhrdot", "Regular holiday on a rest day"]; if (reg) return ["rhot", "Regular holiday"];
  if (h.length && rest) return ["shrdot", "Special day on a rest day"]; if (h.length) return ["rdot", "Special day"]; if (rest) return ["rdot", "Rest day"]; return ["ot", "Regular day"]; }
VIEWS.ot = () => {
  const f = S.otFilter; const q = f.q.trim().toLowerCase(); const pid = S.periodId || curPeriod(); const p = PAY.period(pid);
  const all = listOf(S.otReqs).filter((r) => S.emps.get(r.empId));
  const list = all.filter((r) => (!f.status || r.status === f.status) && (!q || `${fullName(S.emps.get(r.empId))} ${S.emps.get(r.empId).no}`.toLowerCase().includes(q))).sort((a, b) => b.d.localeCompare(a.d));
  const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE); const n = (st) => all.filter((r) => r.status === st).length;
  const inP = all.filter((r) => r.status === "APPROVED" && r.d >= p.start && r.d <= p.end); const ppl = new Set(inP.map((r) => r.empId)).size;
  return head(`${n("PENDING")} waiting for approval`, "Overtime requests", `<button class="btn btn-ghost" data-tkx="ot">Download (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="otForm">${icon("plus")}File overtime</button>` : ""}`) + `
    ${tabsBar(f.status, [["PENDING", `Waiting (${n("PENDING")})`], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]], "ot-status")}
    <section class="card">
      <div style="display:flex;gap:12px;margin-bottom:12px"><input class="input" type="search" id="ot-q" value="${esc(f.q)}" placeholder="Search name or employee no." style="max-width:340px" aria-label="Search overtime requests"></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Date</th><th class="num">Hours</th><th>Day</th><th>Reason</th><th>Status</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
        ${rows.map((r) => { const e = S.emps.get(r.empId);
          return `<tr><td>${personCell(e, esc(e.no), 190)}</td><td style="white-space:nowrap">${esc(fmtDate(r.d))}</td><td class="num"><b>${r.hours}</b></td><td class="t-muted">${esc(otKind(r.d)[1])}</td><td style="max-width:280px">${esc(r.reason || "")}${fzLinks(r.files)}</td>
          <td><span class="chip ${OT_STATUS[r.status][1]}">${OT_STATUS[r.status][0]}</span>${r.decided ? `<div class="t-muted" style="font-size:12px">${esc(fmtDate(r.decided))}</div>` : ""}</td>
          ${S.canEdit ? `<td class="num" style="white-space:nowrap">${r.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-ot-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-ot-set="${r.id}:REJECTED">Reject</button>` : `<button class="link" data-ot-set="${r.id}:PENDING">Reopen</button>`} <button class="link danger" data-del-ot="${r.id}">Delete</button></td>` : ""}</tr>`; }).join("") || `<tr><td colspan="7" class="empty">No overtime requests here.</td></tr>`}
      </tbody></table></div>
      ${list.length > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-otpage="-1" ${f.page <= 1 ? "disabled" : ""}>Previous</button><span class="t-muted">${(f.page - 1) * PAGE + 1}–${Math.min(list.length, f.page * PAGE)} of ${list.length}</span><button class="btn btn-ghost btn-sm" data-otpage="1" ${f.page * PAGE >= list.length ? "disabled" : ""}>Next</button></div>` : ""}
    </section>
    <section class="card"><div class="card-head"><h2>Use approved overtime in the time sheet</h2>${periodSelect(pid, "att").replace('style="flex-direction:row;align-items:center;gap:8px;color:#fff"', 'style="flex-direction:row;align-items:center;gap:8px"').replace('style="color:var(--onblue)"', "")}</div>
      <p style="margin:0 0 12px;font-size:14px;max-width:80ch"><b>${PAY.r2(inP.reduce((a, r) => a + (r.hours || 0), 0))} hours</b> approved for <b>${ppl}</b> ${ppl === 1 ? "person" : "people"} in ${esc(p.label)}. This sets their overtime columns (regular day, rest or special day, regular holiday) in the time sheet to the approved hours, replacing overtime worked out from punches. Everyone else's time sheet is left as it is.</p>
      ${S.canEdit ? (isFinal(pid) ? '<p class="t-muted" style="margin:0">Payroll for this period is final. Reopen it to change overtime.</p>' : `<button class="btn btn-primary" data-ot-apply ${ppl ? "" : "disabled"}>Put approved overtime in the time sheet</button>`) : ""}
    </section>`;
};
VIEWS.otForm = () => {
  const empId = S.view.empId || ""; const d = todayISO();
  return backLink('data-go="ot"', "Overtime requests") + head("Approve it now, or leave it waiting for a manager", "File overtime") + `
    <section class="card"><form id="ot-form" class="form-grid" style="align-items:end">
      ${empPicker("ot-emp", empId)}
      <div class="field"><label for="ot-d">Date <span class="req">*</span></label><input class="input" id="ot-d" type="date" required value="${d}"></div>
      <div class="field"><label for="ot-h">Hours <span class="req">*</span></label><input class="input" id="ot-h" type="number" min="0.5" max="16" step="0.5" required placeholder="2"></div>
      <div class="field" style="grid-column:1/-1"><label for="ot-r">Reason <span class="req">*</span></label><input class="input" id="ot-r" required placeholder="Concrete pouring at Tower 2 ran past 5 PM"></div>
      ${fileZone("ot")}
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="ot-ok"> Approve now</label>
      <p id="ot-hint" class="t-muted" style="grid-column:1/-1;margin:0;font-size:13px"></p>
      <div style="grid-column:1/-1;display:flex;gap:10px"><button class="btn btn-primary">Save overtime</button><button type="button" class="btn btn-ghost" data-go="ot">Cancel</button></div>
    </form></section>`;
};
after.otForm = () => otHint();
function otHint() {
  const box = $("#ot-hint"); if (!box) return; const e = S.emps.get($("#ot-emp")?.value); const d = $("#ot-d")?.value;
  if (!e || !d) { box.textContent = ""; return; } loadClock(addDays(d, -1), addDays(d, 1));
  const r = dayRec(e, d, punchDays(d, d).get(e.id)?.get(d), tkCtx());
  box.textContent = `${otKind(d)[1]}. ${r.in ? `Punches show ${hm(r.in)} to ${hm(r.out) || "no time out"}${r.ot ? `, ${r.ot} hrs past the shift` : ""}.` : "No punches found for this day."}`;
}
async function submitOt() {
  const empId = $("#ot-emp").value, d = $("#ot-d").value, hours = Number($("#ot-h").value) || 0, reason = $("#ot-r").value.trim();
  if (!empId || !d || !hours || !reason) { toast("Fill in the employee, date, hours and reason."); return; }
  const ok = $("#ot-ok").checked; const e = S.emps.get(empId);
  let files = []; try { files = await fzUpload("ot"); } catch { toast("Couldn't upload the attachments. Check your connection and try again."); return; }
  await put("otreqs", { id: uid(), empId, d, hours: PAY.r2(hours), reason, status: ok ? "APPROVED" : "PENDING", filed: todayISO(), decided: ok ? todayISO() : null, ...(files.length ? { files } : {}) });
  logActivity(`Filed ${hours} hrs of overtime for ${fullName(e)} on ${fmtDate(d)}${ok ? " (approved)" : ""}`); toast(ok ? "Overtime saved and approved." : "Overtime saved. It's waiting for approval."); go("ot");
}
async function applyOt(pid) {
  const p = PAY.period(pid); const patch = {};
  for (const r of listOf(S.otReqs)) {
    if (r.status !== "APPROVED" || r.d < p.start || r.d > p.end || !S.emps.get(r.empId)) continue;
    const v = patch[r.empId] || (patch[r.empId] = { ot: 0, rdot: 0, rhot: 0 }); v[otKind(r.d)[0]] = PAY.r2(v[otKind(r.d)[0]] + (r.hours || 0));
  }
  const n = Object.keys(patch).length; if (!n) return;
  await savePeriodRows(pid, patch); logActivity(`Put approved overtime in the ${p.label} time sheet for ${n} people`); toast(`Time sheet updated for ${n} ${n === 1 ? "person" : "people"}.`); render();
}

/* ---------- keeping biometric punches for the daily time records ---------- */
async function saveBioPunches(punches) {
  const dev = "biometric"; const byDay = new Map();
  for (const [empId, list] of punches) for (const x of list) {
    const t = x.t.toISOString(); const d = manilaDay(t);
    (byDay.get(d) || byDay.set(d, {}).get(d))[`${empId}-${x.t.getTime().toString(36)}`] = { empId, t, type: x.type || null };
  }
  if (!S.clockDevs.has(dev)) { const info = { bio: true, name: "Biometric terminals" }; await S.db.doc(`clockins/${dev}`).set(info); S.clockDevs.set(dev, { id: dev, ...info }); }
  const days = [...byDay];
  for (let i = 0; i < days.length; i += 6) await Promise.all(days.slice(i, i + 6).map(async ([d, add]) => {
    const ref = S.db.doc(`clockins/${dev}/days/${d}`); const cur = await ref.get();
    if (cur.exists) await ref.update({ punches: add }); else await ref.set({ d, dev, punches: add });
    const k = `${dev}/${d}`; const prev = S.clockDays.get(k) || { d, dev, punches: {} }; S.clockDays.set(k, { ...prev, punches: { ...prev.punches, ...add } });
  }));
  S.ver++;
}

/* ---------- exports ---------- */
function tkExport(kind) {
  if (kind === "day") { const d = S.dtr.date || todayISO();
    return offer(`attendance-${d}.csv`, toCSV([["Employee No", "Name", "Site", "Shift", "Biometric in", "Biometric out", "GPS in", "GPS out", "Time in (counted)", "Time out (counted)", "Hours", "Late (min)", "Status", "Remarks"],
      ...dayBoard(d).sort((a, b) => a.e.last.localeCompare(b.e.last)).map(({ e, r }) => [e.no, fullName(e), siteName(siteOf(e)), `${r.shift.start}-${r.shift.end}`, hm(r.bio.in?.t), hm(r.bio.out?.t), geoText(r.geo.in), geoText(r.geo.out), hm(r.in), hm(r.out), r.hrs || "", r.status === "late" ? r.late : "", TK_STATUS[r.status][0], remarks(r)])])); }
  if (kind === "emp") { const e = S.emps.get(S.dtr.emp); if (!e) return; const pid = S.periodId || curPeriod();
    return offer(`dtr-${e.no}-${pid}.csv`, toCSV([["Date", "Schedule", "Biometric in", "Biometric out", "GPS in", "GPS out", "Time in (counted)", "Time out (counted)", "Hours", "Late (min)", "Undertime (min)", "OT (hrs)", "Status", "Remarks"],
      ...dtrRows(e, pid).map((r) => [r.d, r.rest ? "Rest day" : r.hol.length ? "Holiday" : `${r.shift.start}-${r.shift.end}`, hm(r.bio.in?.t), hm(r.bio.out?.t), geoText(r.geo.in), geoText(r.geo.out), hm(r.in), hm(r.out), r.hrs || "", r.status === "late" ? r.late : "", r.ut || "", r.ot || "", TK_STATUS[r.status][0], remarks(r)])])); }
  if (kind === "ot") return offer(`overtime-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Date", "Hours", "Day", "Reason", "Status", "Decided"],
    ...listOf(S.otReqs).filter((r) => S.emps.get(r.empId)).sort((a, b) => a.d.localeCompare(b.d)).map((r) => { const e = S.emps.get(r.empId); return [e.no, fullName(e), r.d, r.hours, otKind(r.d)[1], r.reason || "", OT_STATUS[r.status][0], r.decided || ""]; })]));
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-dtr-tab],[data-dtr-emp],[data-tk-day],[data-tk-site],[data-tkpage],[data-tkx],[data-tk-print],[data-ot-status],[data-ot-set],[data-del-ot],[data-otpage],[data-ot-apply],[data-ot-emp]");
  if (!t) return; const d = t.dataset;
  try {
    if (d.dtrTab) { S.dtr.tab = d.dtrTab; render(); return; }
    if (d.dtrEmp) { Object.assign(S.dtr, { tab: "emp", emp: d.dtrEmp }); go("dtr"); return; }
    if (d.tkDay != null) { const [day, st] = d.tkDay.split(":"); Object.assign(S.dtr, { tab: "day", date: day, status: st || "", site: "", q: "", page: 1 }); go("dtr"); return; }
    if (d.tkSite != null) { Object.assign(S.dtr, { tab: "day", date: todayISO(), status: "", site: d.tkSite, q: "", page: 1 }); go("dtr"); return; }
    if (d.tkpage) { S.dtr.page += Number(d.tkpage); render(); return; }
    if (d.tkx) return tkExport(d.tkx);
    if (t.hasAttribute("data-tk-print")) { window.print(); return; }
    if (d.otStatus != null) { Object.assign(S.otFilter, { status: d.otStatus, page: 1 }); render(); return; }
    if (d.otpage) { S.otFilter.page += Number(d.otpage); render(); return; }
    if (d.otEmp) { ev.stopImmediatePropagation(); go("otForm", { empId: d.otEmp }); return; }
    if (!S.canEdit) return;
    if (d.otSet) { const [id, st] = d.otSet.split(":"); const r = S.otReqs.get(id); if (!r) return; t.disabled = true;
      await put("otreqs", { ...r, status: st, decided: st === "PENDING" ? null : todayISO() }); logActivity(`${st === "APPROVED" ? "Approved" : st === "REJECTED" ? "Rejected" : "Reopened"} ${r.hours} hrs of overtime of ${empName(r.empId)}`); toast(st === "APPROVED" ? "Approved." : st === "REJECTED" ? "Rejected." : "Reopened."); render(); return; }
    if (d.delOt) { if (!armed(t)) return; await drop("otreqs", d.delOt); logActivity("Deleted an overtime request"); toast("Deleted."); render(); return; }
    if (t.hasAttribute("data-ot-apply")) { t.disabled = true; await applyOt(S.periodId || curPeriod()); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
}, true);
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "dtr-q") { S.dtr.q = t.value; S.dtr.page = 1; const pos0 = t.selectionStart; render(); const n = $("#dtr-q"); if (n) { n.focus(); n.setSelectionRange(pos0, pos0); } return; }
  if (t.id === "ot-q") { S.otFilter.q = t.value; S.otFilter.page = 1; const pos0 = t.selectionStart; render(); const n = $("#ot-q"); if (n) { n.focus(); n.setSelectionRange(pos0, pos0); } return; }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "dtr-date") { S.dtr.date = t.value || todayISO(); S.dtr.page = 1; render(); return; }
  if (t.id === "dtr-site") { S.dtr.site = t.value; S.dtr.page = 1; render(); return; }
  if (t.id === "dtr-status") { S.dtr.status = t.value; S.dtr.page = 1; render(); return; }
  if (t.id === "dtr-emp") { S.dtr.emp = t.value || null; render(); return; }
  if (t.id === "ot-emp" || t.id === "ot-d") { otHint(); return; }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["ot-form", "grace-form", "dtr-pick"].includes(f.id)) return; ev.preventDefault(); if (f.id === "dtr-pick" || !S.canEdit) return;
  try {
    if (f.id === "ot-form") return await submitOt();
    if (f.id === "grace-form") { const g = Math.max(0, Math.round(Number($("#g-min").value) || 0)); await saveSettings({ lateGrace: g }, `Set the grace period for lateness to ${g} minutes`); return; }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});
