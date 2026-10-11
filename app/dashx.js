/* ---------- owner dashboard analysis: employees, attendance, overtime, leave per department, new employees, others ---------- */
S.dxTab = (() => { try { return localStorage.getItem("hr-dx-tab") || "emp"; } catch { return "emp"; } })();
const dxDays = 30;
const unitName = (e) => (e.projectId ? S.projects.get(e.projectId)?.name || "Project" : dept(e.deptId)?.name || "No department");
const deptName = (e) => dept(e.deptId)?.name || "No department";
const hourly = (e) => { const daily = e.payType === "DAILY" ? e.basicPay : ((e.basicPay || 0) * 12) / (SET().factor || 313); return (daily || 0) / 8; };
/* one vertical bar chart, single series, blue; tooltip via <title> */
function vbars(data, { h = 170, fmt = (n) => n, label = "" } = {}) {
  const W = Math.max(560, data.length * 44), pb = 24, pt = 14, pl = 28; const mx = Math.max(2, ...data.map((d) => d[1])); const bw = Math.min(28, (W - pl) / data.length - 10); const gw = (W - pl) / data.length;
  const y = (v) => h - pb - (v / mx) * (h - pb - pt);
  return `<svg viewBox="0 0 ${W} ${h}" class="rd-chart dx-chart" role="img" aria-label="${esc(label)}">${[0, 0.5, 1].map((f) => `<line x1="${pl}" x2="${W}" y1="${y(f * mx)}" y2="${y(f * mx)}" stroke="#e5e7eb"/><text x="${pl - 6}" y="${y(f * mx) + 4}" text-anchor="end" class="rd-ax">${Math.round(f * mx)}</text>`).join("")}
    ${data.map(([l, v, tip], i) => `<g><rect x="${pl + i * gw}" y="${pt}" width="${gw}" height="${h - pb - pt}" fill="transparent"><title>${esc(tip || `${l}: ${fmt(v)}`)}</title></rect><rect class="rd-fill" x="${pl + i * gw + (gw - bw) / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, h - pb - y(v))}" rx="3"><title>${esc(tip || `${l}: ${fmt(v)}`)}</title></rect><text x="${pl + i * gw + gw / 2}" y="${h - 7}" text-anchor="middle" class="rd-ax">${esc(l)}</text></g>`).join("")}</svg>`;
}
const hrows = (rows, fmt = (n) => n) => { const mx = Math.max(1, ...rows.map((r) => r[1])); return rows.map(([l, n, sub]) => `<div class="ra-row"><span class="ra-l">${esc(l)}${sub ? `<span class="t-muted"> · ${esc(sub)}</span>` : ""}</span><span class="ra-bar"><i style="width:${(n / mx) * 100}%"></i></span><b class="ra-n">${fmt(n)}</b></div>`).join(""); };
const dxTile = (l, v, n, cls = "t-muted") => `<div class="card stat"><span class="label">${l}</span><span class="value${String(v).length > 9 ? " dx-long" : ""}">${v}</span><span class="note ${cls}">${n}</span></div>`;
const monthsBack = (n) => { const out = []; const d = parseISO(todayISO()); d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push([PAY.iso(x).slice(0, 7), x.toLocaleDateString("en-PH", { month: "short" })]); } return out; };

function dxEmployees() {
  const today = todayISO(); const all = [...S.emps.values()]; const act = active(); const ms = monthsBack(12);
  const hires = ms.map(([m, l]) => [l, all.filter((e) => (e.hire || "").startsWith(m)).length]); const seps = ms.map(([m]) => all.filter((e) => (e.separated?.date || "").startsWith(m)).length);
  const head0 = all.filter((e) => e.hire && e.hire < ms[0][0] + "-01" && !(e.separated?.date && e.separated.date < ms[0][0] + "-01")).length;
  const sep12 = seps.reduce((s, x) => s + x, 0); const turn = (act.length + head0) / 2 ? (sep12 / ((act.length + head0) / 2)) * 100 : 0;
  const ages = act.filter((e) => e.birth).map((e) => daysBetween(e.birth, today) / 365.25); const tens = act.filter((e) => e.hire).map((e) => daysBetween(e.hire, today) / 365.25);
  const band = (xs, edges, labels) => labels.map((l, i) => [l, xs.filter((x) => x >= edges[i] && x < edges[i + 1]).length]);
  const male = act.filter((e) => e.gender === "M").length, fem = act.filter((e) => e.gender === "F").length;
  const newE = act.filter((e) => e.hire && e.hire >= addDays(today, -60)).sort((a, b) => b.hire.localeCompare(a.hire));
  const byUnit = {}; for (const e of act) byUnit[unitName(e)] = (byUnit[unitName(e)] || 0) + 1;
  return `<section class="stats kpis rd-kpis">
      ${dxTile("Active employees", act.length, `${male} male · ${fem} female${act.length - male - fem ? ` · ${act.length - male - fem} not set` : ""}`)}
      ${dxTile("New in 30 days", act.filter((e) => e.hire >= addDays(today, -30)).length, `${newE.length} in 60 days`, "t-ok")}
      ${dxTile("Separated in 12 months", sep12, `${all.filter((e) => (e.separated?.date || "") >= addDays(today, -30)).length} in the last 30 days`)}
      ${dxTile("Turnover rate", `${turn.toFixed(1)}%`, "separations ÷ average headcount, 12 months")}
      ${dxTile("Average age", ages.length ? Math.round(avgOf(ages)) : "—", `${ages.length} with birth dates`)}
      ${dxTile("Average tenure", tens.length ? `${avgOf(tens).toFixed(1)} yrs` : "—", "years with the company")}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>New employees per month</h2><span class="t-muted" style="font-size:13px">Last 12 months · ${hires.reduce((s, x) => s + x[1], 0)} hired, ${sep12} separated</span></div>${vbars(hires.map(([l, n], i) => [l, n, `${l}: ${n} hired, ${seps[i]} separated`]), { label: "New employees per month" })}</section>
      <section class="card"><div class="card-head"><h2>New employees</h2><span class="t-muted" style="font-size:13px">Last 60 days</span></div>
        ${newE.length ? `<ul class="list dx-new">${newE.slice(0, 8).map((e) => `<li><button class="person tile" style="border:0;padding:0" data-emp="${e.id}">${avatar(e, 34)}<span class="who"><span class="name" style="font-size:14px">${esc(fullName(e))}</span><span class="sub">${esc(pos(e.posId)?.title || "")} · ${esc(unitName(e))}</span></span><span class="t-muted" style="font-size:13px;margin-left:auto;white-space:nowrap">${fmtDate(e.hire)}</span></button></li>`).join("")}</ul>${newE.length > 8 ? `<p class="t-muted" style="margin:8px 0 0;font-size:13px">and ${newE.length - 8} more</p>` : ""}` : '<p class="t-muted" style="margin:0">No one joined in the last 60 days.</p>'}</section></div>
    <div class="three"><section class="card"><div class="card-head"><h2>Age</h2></div>${hrows(band(ages, [0, 25, 35, 45, 55, 200], ["Under 25", "25 to 34", "35 to 44", "45 to 54", "55 and over"]))}</section>
      <section class="card"><div class="card-head"><h2>Years with the company</h2></div>${hrows(band(tens, [0, 1, 3, 5, 10, 200], ["Under 1 year", "1 to 2", "3 to 4", "5 to 9", "10 or more"]))}</section>
      <section class="card"><div class="card-head"><h2>Where they work</h2></div>${hrows(Object.entries(byUnit).sort((a, b) => b[1] - a[1]).slice(0, 8))}</section></div>`;
}
let dxAttCache = null;
function dxAttendanceData() {
  const today = todayISO(); const from = addDays(today, -dxDays); const key = `${S.ver}|${from}|${S.clockDays?.size || 0}|${active().length}`;
  if (dxAttCache?.key === key) return dxAttCache.v;
  loadClock(from, today); const pd = punchDays(from, today); const ctx = tkCtx(); const days = []; for (let d = from; d < today; d = addDays(d, 1)) days.push(d);
  const per = new Map(); const byDay = days.map((d) => ({ d, present: 0, late: 0, absent: 0, exp: 0 }));
  for (const e of active()) { const s = { e, present: 0, late: 0, absent: 0, lateMin: 0, exp: 0, ot: 0, ut: 0 };
    const mine = pd.get(e.id); const first = mine ? [...mine.keys()].filter((d) => d >= from).sort()[0] : null; s.first = first; if (!first) { per.set(e.id, s); continue; }
    days.forEach((d, i) => { if (d < first) return; const r = dayRec(e, d, mine.get(d), ctx); if (["na", "rest", "hol", "leave", "due"].includes(r.status)) return; s.exp++; byDay[i].exp++;
      if (r.status === "absent") { s.absent++; byDay[i].absent++; } else { s.present++; byDay[i].present++; if (r.status === "late") { s.late++; s.lateMin += r.late; byDay[i].late++; } } s.ot += r.ot || 0; s.ut += r.ut || 0; });
    per.set(e.id, s); }
  const tracked = [...per.values()].filter((s) => s.present); const tid = new Set(tracked.map((s) => s.e.id));
  const byDay2 = days.map((d, i) => ({ d, present: 0, late: 0, absent: 0, exp: 0 }));
  for (const s of tracked) days.forEach((d, i) => { if (d < s.first) return; const r = dayRec(s.e, d, pd.get(s.e.id)?.get(d), ctx); if (["na", "rest", "hol", "leave", "due"].includes(r.status)) return; byDay2[i].exp++; if (r.status === "absent") byDay2[i].absent++; else { byDay2[i].present++; if (r.status === "late") byDay2[i].late++; } });
  const v = { days, per: tracked, byDay: byDay2, all: per.size, any: tracked.length > 0 }; dxAttCache = { key, v }; return v;
}
function dxAttendance() {
  const A = dxAttendanceData(); if (!A.any) return `<section class="card"><div class="empty-state"><span class="es-ic">${icon("clock", 22)}</span><p>No time records in the last ${dxDays} days yet. Attendance analysis fills in once people time in on the phone clock, the kiosk or the biometric import.</p></div></section>`;
  const exp = A.per.reduce((s, x) => s + x.exp, 0), pres = A.per.reduce((s, x) => s + x.present, 0), late = A.per.reduce((s, x) => s + x.late, 0), abs = A.per.reduce((s, x) => s + x.absent, 0), lateMin = A.per.reduce((s, x) => s + x.lateMin, 0);
  const byD = {}; for (const s of A.per) { const k = deptName(s.e); const o = (byD[k] = byD[k] || { exp: 0, pres: 0, late: 0, abs: 0 }); o.exp += s.exp; o.pres += s.present; o.late += s.late; o.abs += s.absent; }
  const wk = A.byDay.filter((x) => x.exp);
  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return `<section class="stats kpis rd-kpis">${dxTile("Attendance rate", pct(pres, exp), `last ${dxDays} days · ${A.per.length} of ${A.all} employees use the time clock, counted from their first time in`, pres / (exp || 1) >= 0.95 ? "t-ok" : "t-warn")}
      ${dxTile("Late arrivals", late, `${minsText(lateMin) || "0m"} late in total`)}${dxTile("Absences", abs, "scheduled days with no time in", abs ? "t-warn" : "t-ok")}
      ${dxTile("Perfect attendance", A.per.filter((s) => s.exp && !s.late && !s.absent).length, "no late or absence")}
      ${dxTile("Undertime", minsText(A.per.reduce((s, x) => s + x.ut, 0)) || "0m", "left before the shift ended")}
      ${dxTile("Present today", typeof dayBoard === "function" ? dayBoard(todayISO()).filter((x) => ["in", "late"].includes(x.r.status)).length : "—", "timed in so far")}</section>
    <section class="card"><div class="card-head"><h2>Attendance rate per day</h2><span class="t-muted" style="font-size:13px">Last ${dxDays} days, working days only</span></div>${vbars(wk.map((x) => [String(parseISO(x.d).getDate()), Math.round((x.present / x.exp) * 100), `${fmtDate(x.d)}: ${Math.round((x.present / x.exp) * 100)}% present, ${x.late} late, ${x.absent} absent`]), { fmt: (n) => n + "%", label: "Attendance rate per day" })}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>By department</h2></div><div class="table-wrap"><table><thead><tr><th>Department</th><th class="num">Attendance</th><th class="num">Late</th><th class="num">Absent</th></tr></thead><tbody>
      ${Object.entries(byD).sort((a, b) => b[1].exp - a[1].exp).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="num">${pct(o.pres, o.exp)}</td><td class="num">${o.late}</td><td class="num">${o.abs}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="card"><div class="card-head"><h2>Most late or absent</h2><button class="link" data-go="dtr">Daily time records</button></div>
      ${hrows(A.per.filter((s) => s.late + s.absent).sort((a, b) => b.absent * 3 + b.late - (a.absent * 3 + a.late)).slice(0, 8).map((s) => [fullName(s.e), s.late + s.absent, `${s.late} late, ${s.absent} absent`]))
        || '<p class="t-muted" style="margin:0">No late arrivals or absences.</p>'}</section></div>`;
}
function dxOvertime() {
  const today = todayISO(); const from = addDays(today, -dxDays); const ids = new Set(active().map((e) => e.id));
  const reqs = [...(S.otReqs || new Map()).values()].filter((r) => ids.has(r.empId)); const appr = reqs.filter((r) => r.status === "APPROVED" && r.d >= from && r.d <= today);
  const pend = reqs.filter((r) => r.status === "PENDING"); const hrs = appr.reduce((s, r) => s + (r.hours || 0), 0);
  const cost = appr.reduce((s, r) => { const e = S.emps.get(r.emp || r.empId); return s + (r.hours || 0) * hourly(e || {}) * 1.25; }, 0);
  const A = dxAttendanceData(); const worked = A.per.reduce((s, x) => s + x.ot, 0);
  const byDept = {}; for (const r of appr) { const k = deptName(S.emps.get(r.empId)); byDept[k] = (byDept[k] || 0) + r.hours; }
  const byEmp = {}; for (const r of appr) byEmp[r.empId] = (byEmp[r.empId] || 0) + r.hours;
  const ms = monthsBack(6); const perM = ms.map(([m, l]) => [l, PAY.r2(reqs.filter((r) => r.status === "APPROVED" && (r.d || "").startsWith(m)).reduce((s, r) => s + r.hours, 0))]);
  const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString("en-PH");
  return `<section class="stats kpis rd-kpis">${dxTile("Approved overtime", `${f1(hrs)} h`, `last ${dxDays} days · ${appr.length} requests`)}
      ${dxTile("Overtime cost", peso.format(cost), "estimate at 125% of the hourly rate")}${dxTile("Waiting for approval", pend.length, `${f1(pend.reduce((s, r) => s + r.hours, 0))} hours`, pend.length ? "t-warn" : "t-ok")}
      ${dxTile("People with overtime", Object.keys(byEmp).length, `of ${active().length} active`)}${dxTile("Worked past shift", `${f1(worked)} h`, "from time records, approved or not")}
      ${dxTile("Average per person", Object.keys(byEmp).length ? `${f1(hrs / Object.keys(byEmp).length)} h` : "—", "among those with overtime")}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>Approved overtime per month</h2><span class="t-muted" style="font-size:13px">Hours, last 6 months</span></div>${vbars(perM, { fmt: (n) => `${n} h`, label: "Approved overtime hours per month" })}</section>
      <section class="card"><div class="card-head"><h2>By department</h2><button class="link" data-go="ot">Overtime requests</button></div>${hrows(Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 8), (n) => `${f1(n)} h`) || '<p class="t-muted" style="margin:0">No approved overtime in this period.</p>'}</section></div>
    <section class="card"><div class="card-head"><h2>Most overtime</h2><span class="t-muted" style="font-size:13px">Last ${dxDays} days</span></div>${hrows(Object.entries(byEmp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, h]) => { const e = S.emps.get(id); return [fullName(e), h, deptName(e)]; }), (n) => `${f1(n)} h`) || '<p class="t-muted" style="margin:0">No approved overtime in this period.</p>'}</section>`;
}
function dxLeave() {
  const y = todayISO().slice(0, 4); const ids = new Set(active().map((e) => e.id)); const L = allLeaves().filter((l) => ids.has(l.empId) && l.status === "APPROVED" && (l.from || "").startsWith(y));
  const types = [...new Set(L.map((l) => l.type))].sort((a, b) => (a === "VL" ? -1 : a === "SL" && b !== "VL" ? -1 : 0) || a.localeCompare(b)); const rows = {};
  for (const l of L) { const k = deptName(S.emps.get(l.empId)); const r = (rows[k] = rows[k] || { tot: 0, people: new Set() }); r[l.type] = (r[l.type] || 0) + (l.days || 0); r.tot += l.days || 0; r.people.add(l.empId); }
  const heads = {}; for (const e of active()) heads[deptName(e)] = (heads[deptName(e)] || 0) + 1;
  const tot = L.reduce((s, l) => s + (l.days || 0), 0); const pend = allLeaves().filter((l) => ids.has(l.empId) && l.status === "PENDING");
  const list = Object.entries(rows).sort((a, b) => b[1].tot - a[1].tot); const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString("en-PH");
  return `<section class="stats kpis rd-kpis">${dxTile(`Leave days taken in ${y}`, f1(tot), `${L.length} approved requests`)}${dxTile("Per employee", active().length ? f1(tot / active().length) : "—", "average days this year")}
      ${dxTile("Vacation leave", f1(L.filter((l) => l.type === "VL").reduce((s, l) => s + l.days, 0)), "days")}${dxTile("Sick leave", f1(L.filter((l) => l.type === "SL").reduce((s, l) => s + l.days, 0)), "days")}
      ${dxTile("On leave today", typeof onLeave === "function" ? onLeave(todayISO()).length : "—", "approved leave")}${dxTile("Waiting for approval", pend.length, "leave requests", pend.length ? "t-warn" : "t-ok")}</section>
    <section class="card"><div class="card-head"><h2>Total leave per department</h2><span class="t-muted" style="font-size:13px">Approved days in ${y}</span><button class="link" data-go="leave">Leave</button></div>
      ${list.length ? `${hrows(list.map(([k, r]) => [k, PAY.r2(r.tot)]), (n) => `${f1(n)} d`)}
      <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Department</th>${types.map((t) => `<th class="num">${esc(leaveType(t)?.name || t)}</th>`).join("")}<th class="num">Total days</th><th class="num">People</th><th class="num">Days per head</th></tr></thead><tbody>
        ${list.map(([k, r]) => `<tr><td>${esc(k)}</td>${types.map((t) => `<td class="num">${r[t] ? f1(r[t]) : "—"}</td>`).join("")}<td class="num"><b>${f1(r.tot)}</b></td><td class="num">${r.people.size}</td><td class="num">${heads[k] ? f1(r.tot / heads[k]) : "—"}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th>Total</th>${types.map((t) => `<th class="num">${f1(L.filter((l) => l.type === t).reduce((s, l) => s + l.days, 0))}</th>`).join("")}<th class="num">${f1(tot)}</th><th class="num">${new Set(L.map((l) => l.empId)).size}</th><th class="num">${active().length ? f1(tot / active().length) : "—"}</th></tr></tfoot></table></div>`
        : '<p class="t-muted" style="margin:0">No approved leave this year yet.</p>'}</section>`;
}
function dxOthers() {
  const today = todayISO(); const act = active(); const in30 = addDays(today, 30);
  const ending = act.filter((e) => e.projectUntil && e.projectUntil >= today && e.projectUntil <= in30).sort((a, b) => a.projectUntil.localeCompare(b.projectUntil));
  const gov = act.filter((e) => !e.sss || !e.philhealth || !e.pagibig || !e.tin);
  const prob = act.filter((e) => e.status === "PROBATIONARY" && typeof regDue === "function" && regDue(e) <= in30);
  const noPhoto = act.filter((e) => !e.photo).length; const noBirth = act.filter((e) => !e.birth).length; const noEmerg = act.filter((e) => !e.emergencyPhone).length;
  const st = {}; for (const e of act) st[STATUS[e.status]?.[0] || e.status] = (st[STATUS[e.status]?.[0] || e.status] || 0) + 1;
  const pay = {}; for (const e of act) { const k = deptName(e); pay[k] = (pay[k] || 0) + monthlyOf(e.basicPay || 0, e.payType); }
  const li = (e, sub) => `<li><button class="person tile" style="border:0;padding:0" data-emp="${e.id}">${avatar(e, 32)}<span class="who"><span class="name" style="font-size:14px">${esc(fullName(e))}</span><span class="sub">${sub}</span></span></button></li>`;
  return `<section class="stats kpis rd-kpis">${dxTile("Contracts ending in 30 days", ending.length, "project-based end dates", ending.length ? "t-warn" : "t-ok")}${dxTile("Due for regularization", prob.length, "within 30 days", prob.length ? "t-warn" : "t-ok")}
      ${dxTile("Missing government numbers", gov.length, "SSS, PhilHealth, Pag-IBIG or TIN", gov.length ? "t-warn" : "t-ok")}${dxTile("Monthly basic payroll", peso.format(Object.values(pay).reduce((s, x) => s + x, 0)), "daily rates × 26 days")}
      ${dxTile("201 files without photo", noPhoto, `${noBirth} without birth date`)}${dxTile("No emergency contact", noEmerg, "phone number missing")}</section>
    <div class="three"><section class="card"><div class="card-head"><h2>Contracts ending</h2></div>${ending.length ? `<ul class="list">${ending.slice(0, 8).map((e) => li(e, `${esc(unitName(e))} · ends ${fmtDate(e.projectUntil)}`)).join("")}</ul>` : '<p class="t-muted" style="margin:0">None in the next 30 days.</p>'}</section>
      <section class="card"><div class="card-head"><h2>Employment status</h2></div>${hrows(Object.entries(st).sort((a, b) => b[1] - a[1]))}</section>
      <section class="card"><div class="card-head"><h2>Basic payroll per department</h2><span class="t-muted" style="font-size:13px">A month</span></div>${hrows(Object.entries(pay).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]), (n) => peso.format(n).replace(/\.00$/, ""))}</section></div>`;
}
function dashAnalysis() {
  const tabs = [["emp", "Employees", "People"], ["att", "Attendance", "Timekeeping"], ["ot", "Overtime", "Timekeeping"], ["leave", "Leave per department", "Timekeeping"], ["oth", "Others", "People"]].filter((t) => navAllowed(t[2]));
  if (!tabs.length || S.viewAs === "emp") return ""; const cur = tabs.some((t) => t[0] === S.dxTab) ? S.dxTab : tabs[0][0];
  const body = { emp: dxEmployees, att: dxAttendance, ot: dxOvertime, leave: dxLeave, oth: dxOthers }[cur]();
  return `<h2 class="dsec">Analysis</h2><div class="tabs dx-tabs" role="tablist" aria-label="Analysis">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${cur === k}" data-dx="${k}">${l}</button>`).join("")}</div><div class="dx-body">${body}</div>`;
}
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-dx]"); if (!t) return; ev.stopImmediatePropagation(); S.dxTab = t.dataset.dx; try { localStorage.setItem("hr-dx-tab", S.dxTab); } catch {} render(); }, true);
