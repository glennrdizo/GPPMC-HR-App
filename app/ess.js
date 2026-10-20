/* ---------- "Viewing as Employee": an editor previews the app from one employee's side (read-only) ---------- */
const ESS_NAV = [["esshome", "My home", "dash"], ["esstime", "My time records", "clock"], ["essleave", "My leave", "cal"], ["esspay", "My payslips", "pay"], ["esstrain", "My training", "cap"], ["essprofile", "My profile", "people"]];
const essEmp = () => { let e = S.emps.get(S.viewEmp); if (!e || e.separated) { e = active().sort((a, b) => a.last.localeCompare(b.last))[0] || null; S.viewEmp = e?.id || null; } return e; };
function essNav() {
  const cur = S.essView || "esshome";
  return `<div class="nav-group"><span class="nav-label" style="cursor:default"><span class="mod-ic" aria-hidden="true">${icon("people", 18)}</span><span style="flex:1">Employee</span></span><div class="nav-sub">
    ${ESS_NAV.map(([v, l, ic]) => `<button class="nav-item" data-ess="${v}" ${cur === v ? 'aria-current="page"' : ""}>${icon(ic)}${l}</button>`).join("")}</div></div>
    <div class="me-card"><span class="avatar" style="width:40px;height:40px;background:var(--gold);color:var(--ink);font-size:15px" aria-hidden="true">P</span><div><b>Preview</b><small>Read-only. Switch back to Editor to make changes.</small></div></div>`;
}
const essTile = (ic, label, value, note, go) => `<button class="card stat kpi ess-tile" data-ess="${go}"><span class="kpi-ic" style="background:var(--blue-soft);color:var(--blue)">${icon(ic, 20)}</span><span class="label">${label}</span><span class="value" style="font-size:30px">${value}</span><span class="note t-muted">${note}</span></button>`;
function essToday(e) {
  const d = todayISO(); loadClock(addDays(d, -1), addDays(d, 1));
  return dayRec(e, d, punchDays(d, d).get(e.id)?.get(d), tkCtx());
}
function essSlips(e) {
  const c = curPeriod(); const out = [];
  for (let i = 0; i > -6; i--) { const id = PAY.shiftPeriod(c, i); ensureRun(id); const run = payrun(id); const l = run.lines?.[e.id]; if (l) out.push({ id, p: PAY.period(id), l, final: run.final }); }
  return out;
}
const ESS = {};
ESS.esshome = (e) => {
  const r = essToday(e); const y = todayISO().slice(0, 4); const bal = balances(e, leaveYear(todayISO()));
  const vl = bal.find((b) => b.code === "VL"), sl = bal.find((b) => b.code === "SL");
  const slip = essSlips(e)[0]; const req = listOf(S.courses).filter((c) => needs(c, e)); const okN = req.filter((c) => trainState(c, e) === "OK").length;
  const mine = allLeaves().filter((l) => l.empId === e.id && l.to >= todayISO() && ["PENDING", "APPROVED"].includes(l.status)).sort((a, b) => a.from.localeCompare(b.from));
  const st = TK_STATUS[r.status] || ["", "c-gray"];
  return `<section class="hero"><div class="hero-text"><span class="hero-date">${esc(new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date()))}</span>
      <h1>${greetWord()}, ${esc(e.first)}</h1><p>${esc(pos(e.posId)?.title || "Employee")}${e.projectId ? ` · ${esc(S.projects.get(e.projectId)?.name || "")}` : " · Head Office"} · ${esc(e.no)}</p></div>
      <div class="hero-actions"><span class="ess-today"><span class="chip ${st[1]}">${st[0]}</span> ${r.in ? `In <b>${esc(hm(r.in))}</b>` : "Not timed in"}${r.out ? ` · Out <b>${esc(hm(r.out))}</b>` : ""}</span></div></section>
    <section class="stats kpis">
      ${essTile("clock", "Today", r.in ? esc(hm(r.in)) : "—", r.shift ? `Shift ${esc(r.shift.start)}–${esc(r.shift.end)}` : "No shift today", "esstime")}
      ${essTile("cal", "Vacation leave left", vl?.left ?? "—", `Sick leave left: ${sl?.left ?? "—"}`, "essleave")}
      ${essTile("pay", "Latest net pay", slip ? peso.format(slip.l.net) : "—", slip ? `${esc(slip.p.label)}${slip.final ? "" : " · draft"}` : "No payslip yet", "esspay")}
      ${essTile("cap", "Required training", req.length ? `${okN}/${req.length}` : "—", req.length ? "current" : "None required", "esstrain")}
    </section>
    <div class="row"><section class="card"><div class="card-head"><h2>My upcoming leave</h2></div>
      ${mine.length ? `<ul class="list" style="font-size:14px">${mine.slice(0, 5).map((l) => `<li style="display:flex;justify-content:space-between;gap:10px"><span><b>${esc(SET().leaveTypes.find((t) => t.code === l.type)?.name || l.type)}</b><div class="t-muted" style="font-size:13px">${esc(fmtDate(l.from))}${l.to !== l.from ? ` to ${esc(fmtDate(l.to))}` : ""} · ${l.days} ${l.days === 1 ? "day" : "days"}</div></span><span class="chip ${LSTATUS[l.status][1]}">${LSTATUS[l.status][0]}</span></li>`).join("")}</ul>` : '<div class="empty-state"><span class="es-ic">' + icon("cal", 22) + "</span><p>No leave coming up.</p></div>"}</section>
    <section class="card"><div class="card-head"><h2>My supervisor and site</h2></div>${essFacts(e, true)}</section></div>`;
};
function essFacts(e, short) {
  const sup = e.supervisorId ? S.emps.get(e.supervisorId) : null; const pj = e.projectId ? S.projects.get(e.projectId) : null;
  const rows = [["Position", pos(e.posId)?.title], ["Department", dept(e.deptId)?.name], ["Site", pj ? `${pj.name}${pj.location ? `, ${pj.location}` : ""}` : "Head Office"], ["Supervisor", sup ? fullName(sup) : ""], ["Status", STATUS[e.status]?.[0]], ["Date hired", fmtDate(e.hire)]];
  if (!short) rows.push(["Employee no.", e.no], ["Email", e.email], ["Mobile", e.mobile], ["Address", e.address], ["Birthday", fmtDate(e.birth)], ["Civil status", e.civil], ["TIN", mask(e.tin)], ["SSS", mask(e.sss)], ["PhilHealth", mask(e.philhealth)], ["Pag-IBIG", mask(e.pagibig)], ["Bank account", mask(e.bankAcct)], ["Emergency contact", [e.emergencyName, e.emergencyRelation, e.emergencyPhone].filter(Boolean).join(" · ")]);
  return `<dl class="ess-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? esc(v) : '<span class="t-muted">—</span>'}</dd></div>`).join("")}</dl>`;
}
const mask = (v) => (!v ? "" : String(v).length <= 4 ? String(v) : "•••• " + String(v).slice(-4));
ESS.esstime = (e) => {
  const pid = S.periodId || curPeriod(); const p = PAY.period(pid); loadClock(addDays(p.start, -1), addDays(p.end, 1));
  const rows = dtrRows(e, pid); const T = rows.reduce((a, r) => ({ hrs: a.hrs + (r.hrs || 0), late: a.late + (r.late || 0), ot: a.ot + (r.ot || 0) }), { hrs: 0, late: 0, ot: 0 });
  return head(`Pay period ${esc(p.label)}`, "My time records", `<label class="field" style="flex-direction:row;align-items:center;gap:8px;color:#fff"><span class="lbl" style="color:var(--onblue)">Pay period</span><select class="input" style="width:auto;color:var(--ink)" data-ess-period>${opts(periodChoices(pid), pid)}</select></label>`) + `
    <section class="stats"><div class="card stat"><span class="label">Hours worked</span><span class="value">${PAY.r2(T.hrs)}</span></div><div class="card stat"><span class="label">Late</span><span class="value">${minsText(T.late) || "0"}</span></div><div class="card stat"><span class="label">Overtime</span><span class="value">${minsText(T.ot) || "0"}</span></div></section>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Shift</th><th>Time in</th><th>Time out</th><th class="num">Hours</th><th>Late</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => { const st = TK_STATUS[r.status] || ["", "c-gray"]; const gi = r.geo?.in?.t === r.in ? r.geo.in : null, go2 = r.geo?.out?.t === r.out ? r.geo.out : null;
        return `<tr><td style="white-space:nowrap"><b>${esc(fmtDate(r.d))}</b></td><td class="t-muted">${r.rest ? "Rest day" : r.hol.length ? "Holiday" : r.shift ? `${esc(r.shift.start)}–${esc(r.shift.end)}` : ""}</td>
        <td>${r.in ? `<b>${esc(hm(r.in))}</b>${gi ? geoLine(gi) : ""}` : '<span class="t-muted">—</span>'}</td><td>${r.out ? `<b>${esc(hm(r.out))}</b>${go2 ? geoLine(go2) : ""}` : '<span class="t-muted">—</span>'}</td>
        <td class="num">${r.hrs || ""}</td><td>${minsText(r.late)}</td><td>${st[0] ? `<span class="chip ${st[1]}">${st[0]}</span>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div></section>`;
};
ESS.essleave = (e) => {
  const y = todayISO().slice(0, 4); const bal = balances(e, leaveYear(todayISO())).filter((t) => !t.sex || t.sex === e.gender?.[0]?.toUpperCase());
  const mine = allLeaves().filter((l) => l.empId === e.id).sort((a, b) => b.from.localeCompare(a.from));
  return head(`Leave credits for ${y}`, "My leave") + `
    <section class="card"><div class="card-head"><h2>Balances</h2></div><div class="table-wrap"><table><thead><tr><th>Leave</th><th class="num">Credits</th><th class="num">Used</th><th class="num">Left</th></tr></thead><tbody>
      ${bal.map((t) => `<tr><td><b>${esc(t.name)}</b>${t.note ? `<div class="t-muted" style="font-size:13px">${esc(t.note)}</div>` : ""}</td><td class="num">${t.days ?? "As needed"}</td><td class="num">${t.used}</td><td class="num"><b>${t.left ?? "—"}</b></td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>My requests</h2></div>${mine.length ? `<div class="table-wrap"><table><thead><tr><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Status</th></tr></thead><tbody>
      ${mine.map((l) => `<tr><td>${esc(SET().leaveTypes.find((t) => t.code === l.type)?.name || l.type)}</td><td>${esc(fmtDate(l.from))}${l.to !== l.from ? ` to ${esc(fmtDate(l.to))}` : ""}${fzLinks(l.files)}</td><td class="num">${l.days}</td><td><span class="chip ${LSTATUS[l.status][1]}">${LSTATUS[l.status][0]}</span></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state"><span class="es-ic">' + icon("cal", 22) + "</span><p>No leave requests yet.</p></div>"}</section>`;
};
ESS.esspay = (e) => {
  const slips = essSlips(e); const open = slips.find((s) => s.id === S.essSlip) || slips[0];
  return head(`${slips.length} recent pay ${slips.length === 1 ? "period" : "periods"}`, "My payslips") + `
    ${slips.length ? `<div class="tabs on-blue" role="tablist">${slips.map((s) => `<button class="tab" role="tab" aria-selected="${s.id === open.id}" data-ess-slip="${s.id}">${esc(s.p.label)}${s.final ? "" : " (draft)"}</button>`).join("")}</div>
    <section class="card">${slipHTML(e, open.l, open.p, open.final)}</section>` : '<section class="card"><div class="empty-state"><span class="es-ic">' + icon("pay", 22) + "</span><p>No payslips yet.</p></div></section>"}`;
};
ESS.esstrain = (e) => {
  const req = listOf(S.courses).filter((c) => needs(c, e)).sort((a, b) => a.title.localeCompare(b.title));
  const done = listOf(S.courses).filter((c) => c.recs?.[e.id] && !needs(c, e));
  const row = (c) => { const st = trainState(c, e); const r = c.recs?.[e.id]; return `<tr><td><b>${esc(c.title)}</b><div class="t-muted" style="font-size:13px">${esc(c.code || "")}</div></td><td>${r ? esc(fmtDate(r.d)) : '<span class="t-muted">—</span>'}</td><td>${r?.exp ? esc(fmtDate(r.exp)) : '<span class="t-muted">—</span>'}</td><td><span class="chip ${TSTATE[st][1]}">${TSTATE[st][0]}</span></td></tr>`; };
  const tbl = (list) => `<div class="table-wrap"><table><thead><tr><th>Course</th><th>Completed</th><th>Expires</th><th>Status</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>`;
  return head("Courses and certificates", "My training") + `<section class="card"><div class="card-head"><h2>Required for my job</h2></div>${req.length ? tbl(req) : '<div class="empty-state"><span class="es-ic">' + icon("cap", 22) + "</span><p>No required training.</p></div>"}</section>
    ${done.length ? `<section class="card"><div class="card-head"><h2>Other completed training</h2></div>${tbl(done)}</section>` : ""}`;
};
ESS.essprofile = (e) => head(esc(e.no), "My profile") + `<section class="card" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">${avatar(e, 96)}<div style="display:grid;gap:8px"><h2 style="font-size:22px">${esc(fullName(e))}</h2><div class="t-muted">${esc(pos(e.posId)?.title || "")}</div>
    ${S.realEdit && S.assets ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn btn-primary btn-sm" style="cursor:pointer">${icon("camera", 16)}${e.photo ? "Change photo" : "Add photo"}<input type="file" id="ess-photo" accept="image/jpeg,image/png,image/webp" capture="user" hidden></label>${e.photo ? `<button class="btn btn-ghost btn-sm" data-ess-photo-del="1">Remove photo</button>` : ""}</div><span class="t-muted" style="font-size:13px" id="ess-photo-msg">JPG, PNG or WebP. It is cropped to a square and shows on the 201 file and project manpower.</span>` : ""}</div></section>
  <section class="card">${essFacts(e, false)}<p class="t-muted" style="margin:14px 0 0;font-size:13px">ID and bank numbers are masked in this view.</p></section>`;
function essView() {
  const e = essEmp(); if (!e) return `<section class="card"><div class="empty-state"><span class="es-ic">${icon("people", 22)}</span><p>Add employees first, then preview the app as one of them.</p></div></section>`;
  return (ESS[S.essView] || ESS.esshome)(e);
}
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-ess],[data-view-as],[data-ess-slip]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.viewAs) { S.viewAs = d.viewAs; if (S.viewAs === "emp") S.essView = "esshome"; S.navOpen = false; render(); window.scrollTo({ top: 0 }); return; }
  if (d.essSlip) { S.essSlip = d.essSlip; render(); return; }
  if (d.ess) { S.essView = d.ess; S.navOpen = false; render(); window.scrollTo({ top: 0 }); }
}, true);
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "va-emp") { S.viewEmp = t.value; render(); return; }
  if (t.hasAttribute("data-ess-period")) { S.periodId = t.value; render(); }
});

/* My profile: the photo is the one change allowed in the employee preview. It updates the 201 file photo. */
document.addEventListener("change", async (ev) => {
  const t = ev.target; if (t.id !== "ess-photo" || !t.files?.[0] || !S.realEdit) return; const f = t.files[0]; const e = essEmp(); const msg = $("#ess-photo-msg");
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { if (msg) msg.textContent = "Use a JPG, PNG or WebP photo."; return; }
  if (msg) msg.textContent = "Uploading…";
  try { const blob = await shrinkPhoto(f); const up = await S.assets.upload(blob, { type: "image/jpeg" }); const old = e.photo; const n = { ...e, photo: up.id }; await saveEmp(n); S.emps.set(n.id, n);
    if (old) { try { await S.assets.delete(old); } catch {} } logActivity(`Updated the photo of ${fullName(e)}`); toast("Photo saved."); render(); }
  catch (x) { if (msg) msg.textContent = x?.code === "unsupported_type" ? "That photo type isn't supported. Use JPG, PNG or WebP." : "Couldn't upload the photo. Try again."; }
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ess-photo-del]"); if (!t || !S.realEdit) return; ev.stopImmediatePropagation(); if (!armed(t)) return;
  const e = essEmp(); const old = e.photo; const n = { ...e, photo: null }; await saveEmp(n); S.emps.set(n.id, n); if (old) { try { await S.assets?.delete(old); } catch {} } logActivity(`Removed the photo of ${fullName(e)}`); render();
}, true);
