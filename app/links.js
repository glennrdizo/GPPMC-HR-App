/* ---------- Module links: what one module does now updates the others (separation, hiring, regularization, pay changes, overtime, final pay, onboarding, projects, ID cards) ---------- */
const lkPaf = async (e, to, from, type, effective, reason, applied) => {
  const id = uid(); const rec = { empId: e.id, type, effective, to, from, reason, status: "APPROVED", filed: todayISO(), decided: todayISO(), by: S.myId || null, applied: applied ? todayISO() : null, auto: true };
  try { await saveRec("paf", id, rec); } catch {} return id; };
const pfTypeFor = (ch) => ("posId" in ch ? "PROMOTION" : "status" in ch ? "STATUS" : "projectId" in ch ? "REASSIGN" : "deptId" in ch ? "TRANSFER" : "basicPay" in ch ? "SALARY" : "OTHER");
const PF_KEYS = ["posId", "deptId", "projectId", "status", "basicPay", "supervisorId"];
const diffOf = (a, b) => { const to = {}, from = {}; for (const k of PF_KEYS) if (String(a[k] ?? "") !== String(b[k] ?? "")) { to[k] = b[k] ?? (k === "projectId" ? "HO" : null); from[k] = a[k] ?? null; } return { to, from, n: Object.keys(to).length }; };

/* 1. Separation: a last day in the future takes effect on that day by itself, and the 201 "Record separation" form opens the full offboarding (clearance, final pay, loans). */
let sepBusy = false;
async function applyDueSeparations() {
  if (sepBusy || !S.realEdit || !S.offb) return; sepBusy = true;
  try { for (const o of listOf(S.offb)) { const e = S.emps.get(o.empId); if (e && !e.separated && o.last && o.last <= todayISO()) { await markSeparated(e.id, true); logActivity(`Separation of ${fullName(e)} took effect on the last day, ${fmtDate(o.last)}`); } } } catch {} finally { sepBusy = false; }
}
{ const b = markSeparated; markSeparated = async (id, quiet) => { const had = S.emps.get(id); await b(id, quiet); const e = S.emps.get(id); if (!had || had.separated || !e?.separated) return;
    /* their own phone stops clocking in and stops getting a dashboard */
    const links = Object.fromEntries(Object.entries(S.clockLinks || {}).filter(([, v]) => v !== id));
    if (Object.keys(links).length !== Object.keys(S.clockLinks || {}).length) { try { await S.db.doc("org/clocklinks").set({ links }); S.clockLinks = links; } catch {} } }; }
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "sep-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const e = S.emps.get(S.view.id); const last = $("#sep-date").value; const reason = $("#sep-reason").value;
  if (!e || !last || !reason || !$("#sep-confirm").checked) { toast("Enter the date and reason, and tick the confirmation."); return; }
  if (!S.offb.get(e.id)) await put("offboard", { id: e.id, empId: e.id, notice: todayISO(), last, reason, cause: null, notes: null, items: TSET().offboard.map(({ k, label, who }) => ({ k, label, who, done: null })), pay: {}, released: null, closed: null });
  if (last <= todayISO()) await markSeparated(e.id, true);
  logActivity(`Recorded separation of ${fullName(e)}: ${reason}, last day ${fmtDate(last)}`);
  toast(last <= todayISO() ? "Separation recorded. Finish the clearance and final pay here." : `Saved. ${e.first} leaves payroll after ${fmtDate(last)}. Finish the clearance and final pay here.`); go("offboard", { id: e.id });
}, true);

/* 2. Payroll uses what is due: separations, approved salary increments and personnel actions are applied before a payroll is finalized. */
{ const b = finalizePayroll; finalizePayroll = async (id) => { if ($("#final-ok")?.checked && S.realEdit) { await applyDueSeparations(); try { await applyDueIncrements(); } catch {} try { await applyDuePafs(); } catch {} }
    return b(id); }; }

/* 3. A raise filed against an older pay keeps its amount on top of the current pay, so two raises don't overwrite each other. */
{ const b = applyIncrement; applyIncrement = async (r) => { const e = S.emps.get(r.empId);
    if (e && r.from != null && Number(r.from) !== Number(e.basicPay || 0)) { const add = Number(r.to) - Number(r.from);
      return b({ ...r, from: Number(e.basicPay || 0), to: PAY.r2(Number(e.basicPay || 0) + add), reason: `${r.reason ? r.reason + "; " : ""}added to the current pay, which changed after filing` }); }
    return b(r); }; }

/* 4. Pay, position, status or assignment changed straight in the 201 file or by a movement is kept as a personnel action, so the wage history and the PAF list stay complete. A movement dated in the future waits for its date. */
{ const b = submitEmployee; submitEmployee = async (form) => { const prev = S.view.id ? S.emps.get(S.view.id) : null; await b(form); const now = prev && S.emps.get(prev.id);
    if (prev && now && now !== prev) { const d = diffOf(prev, now); if (d.n) await lkPaf(now, d.to, d.from, pfTypeFor(d.to), todayISO(), "Changed in the 201 file", true); } }; }
{ const b = submitMove; submitMove = async (f) => { const e = S.emps.get(f.dataset.empId); const d = $("#mv-d").value || todayISO();
    const want = { ...e, posId: $("#mv-pos").value || e.posId, deptId: $("#mv-dept").value || e.deptId, basicPay: Number($("#mv-pay").value) || e.basicPay, status: $("#mv-st").value || e.status }; const df = diffOf(e, want);
    if (df.n && d > todayISO()) { await lkPaf(e, df.to, df.from, pfTypeFor(df.to), d, $("#mv-why").value.trim() || "Movement", false); logActivity(`Scheduled a movement for ${fullName(e)} on ${fmtDate(d)}`); toast(`Saved. It takes effect on ${fmtDate(d)}.`); render(); return; }
    await b(f); if (df.n && S.emps.get(e.id) !== e) await lkPaf(e, df.to, df.from, pfTypeFor(df.to), d, $("#mv-why").value?.trim() || "Movement", true); }; }

/* 5. Hiring: the hire also files the first contract, closes the manpower request, and carries the approved offer's allowances. */
{ const b = hireApplicant; hireApplicant = async () => { const aid = S.view.id; await b(); const a = S.apps.get(aid); const e = a?.empId && S.emps.get(a.empId); if (!e) return;
    const j = S.jobs.get(a.jobId); const end = e.status === "PROBATIONARY" ? regDue(e) : e.status === "PROJECT_BASED" ? e.projectUntil || null : null;
    try { const id = uid(); const rec = { empId: e.id, type: e.status, start: e.hire, end, notes: "First contract, from hiring", at: todayISO(), by: S.myId || null }; await S.db.doc(`contracts/${id}`).set(JSON.parse(JSON.stringify(rec))); S.ctrs?.set(id, { id, ...rec }); } catch {}
    if (a.olr?.allow && !e.allow && Array.isArray(a.olr.allow)) { const n = { ...e, allow: a.olr.allow }; await saveEmp(n); S.emps.set(n.id, n); }
    const m = j?.mprId && S.mpr?.get(j.mprId); if (m && m.status !== "FILLED" && (S.jobs.get(j.id)?.status === "FILLED")) { try { await put("mpr", { ...m, status: "FILLED", filled: todayISO() }); } catch {} } }; }
if (typeof MPR_STATUS === "object" && !MPR_STATUS.FILLED) MPR_STATUS.FILLED = ["Filled", "c-ok"];

/* 6. Regularization: a passing review is also filed as a status change and a regular contract, dated the day probation ends. */
{ const b = submitReview; submitReview = async (status) => { const empId = $("#rv-emp")?.value; const was = S.emps.get(empId); await b(status); const now = S.emps.get(empId);
    if (was?.status === "PROBATIONARY" && now?.status === "REGULAR") { const d = regDue(was) < todayISO() ? regDue(was) : todayISO();
      await lkPaf(now, { status: "REGULAR" }, { status: "PROBATIONARY" }, "STATUS", d, "Passed the regularization evaluation", true);
      try { const id = uid(); const rec = { empId: now.id, type: "REGULAR", start: d, end: null, notes: "Regularized after evaluation", at: todayISO(), by: S.myId || null }; await S.db.doc(`contracts/${id}`).set(rec); S.ctrs?.set(id, { id, ...rec }); } catch {} } }; }

/* 7. Final pay: loans deducted from the final pay are closed when it is released. */
{ const b = put; put = async (col, rec) => { const prev = col === "offboard" ? S.offb?.get(rec.id) : col === "otreqs" ? S.otReqs?.get(rec.id) : null; const out = await b(col, rec);
    if (col === "offboard" && rec.released && !prev?.released) { const e = S.emps.get(rec.empId);
      for (const ln of listOf(S.loans)) { if (ln.empId !== rec.empId || !["ACTIVE", "HOLD"].includes(ln.status)) continue; const on = rec.pay?.loans?.[ln.id] ?? !isGovLoan(ln); const bal = loanBal(ln); if (!on || bal <= 0) continue;
        try { await b("loans", { ...ln, payments: { ...(ln.payments || {}), [`final-${rec.empId}`]: bal }, status: "PAID", paidOff: rec.released }); } catch {} }
      if (e) logActivity(`Closed the loans of ${fullName(e)} paid from the final pay`); }
    if (col === "otreqs") syncOt(rec, prev).catch(() => {});
    return out; }; }

/* 8. Overtime: only approved overtime is paid. Approving, rejecting or reopening a request updates that cutoff's time sheet right away; punches alone don't add overtime. */
const otOnlyApproved = () => SET().otApproval !== false;
const otSums = (empId, p) => { const v = { ot: 0, rdot: 0, rhot: 0, rhrdot: 0, dhot: 0, shrdot: 0 }; for (const r of listOf(S.otReqs)) if (r.empId === empId && r.status === "APPROVED" && (r.latePid ? r.latePid === p.id : r.d >= p.start && r.d <= p.end)) { const k = otKind(r.d)[0]; v[k] = PAY.r2(v[k] + (r.hours || 0)); } return v; };
/* Overtime approved after its cutoff is final is paid in the open cutoff (latePid). */
async function syncOt(rec, prev) {
  if (!otOnlyApproved() || !S.realEdit || !rec) return; const open = curPeriod();
  if (rec.status === "APPROVED" && !rec.latePid && rec.d && isFinal(PAY.periodOf(rec.d)) && !isFinal(open)) { await put("otreqs", { ...rec, latePid: open }); logActivity(`Overtime of ${empName(rec.empId)} on ${fmtDate(rec.d)} was approved after that payroll was final; it is paid in the ${PAY.period(open).label} payroll`); return; }
  const pidOf = (r) => r && (r.latePid || (r.d && PAY.periodOf(r.d))); const ids = new Set([pidOf(rec), pidOf(prev)].filter(Boolean));
  for (const pid of ids) { if (isFinal(pid)) continue; await savePeriodRows(pid, { [rec.empId]: otSums(rec.empId, PAY.period(pid)) }); }
}
{ const b = computePunches; computePunches = (punches, pid, o) => { const patch = b(punches, pid, o); if (!otOnlyApproved()) return patch; const p = PAY.period(pid);
    for (const eid of Object.keys(patch)) Object.assign(patch[eid], otSums(eid, p)); return patch; }; }

/* 9. Onboarding ticks itself when the proof is in: ID printed, signed contract filed, orientation attended, bank account set. */
async function syncOnboarding() {
  if (!S.realEdit || !S.onb) return;
  for (const o of listOf(S.onb)) { if (o.done) continue; const e = S.emps.get(o.empId); if (!e || e.separated) continue;
    const proof = { id: !!idLast(e), contract: listOf(S.ctrs || new Map()).some((c) => c.empId === e.id && c.signed), orient: listOf(S.orients || new Map()).some((x) => x.status === "DONE" && (x.empIds || []).includes(e.id) && (x.att?.[e.id] ?? true)), bank: !!e.bankAcct };
    let ch = false; const items = o.items.map((it) => (!it.done && proof[it.k] ? ((ch = true), { ...it, done: todayISO(), auto: true }) : it));
    if (ch) { const all = items.every((it) => it.done); try { await put("onboard", { ...o, items, done: all ? todayISO() : null }); } catch {} } }
}
/* 10. Clearance: the company property item can't be ticked while the person still holds company property. */
{ const b = toggleCheck; toggleCheck = async (kind, empId, i, on) => { const o = (kind === "onboard" ? S.onb : S.offb)?.get(empId); const it = o?.items?.[i];
    if (kind !== "onboard" && on && it && /asset|property|equip/i.test(`${it.k} ${it.label}`) && heldBy(empId).length) { toast(`${empName(empId)} still holds ${heldBy(empId).length} company item${heldBy(empId).length === 1 ? "" : "s"}. Mark them returned in Company Assets first.`); render(); return; }
    return b(kind, empId, i, on); }; }

/* 11. Projects: when a project is completed, its people are moved off it (project-based staff keep it until their contract ends), and a new end date carries to project-based contracts. */
window.addEventListener("submit", (ev) => { if (ev.target.id !== "project-form" && ev.target.id !== "proj-form") return; const prev = S.view.id ? S.projects.get(S.view.id) : null; S.lkProj = prev ? { id: prev.id, status: prev.status, end: prev.end } : null; }, true);
{ let last = null; const b = refresh; refresh = (...a) => { const r = b(...a); const pv = S.lkProj; if (pv) { const p = S.projects.get(pv.id); if (p && (p.status !== pv.status || p.end !== pv.end)) { S.lkProj = null; projFollow(p, pv).catch(() => {}); } } return r; }; }
async function projFollow(p, pv) {
  if (!S.realEdit) return; const on = active().filter((e) => e.projectId === p.id);
  if (p.end !== pv.end && p.end) for (const e of on) if (e.status === "PROJECT_BASED" && (!e.projectUntil || e.projectUntil === pv.end)) { const n = { ...e, projectUntil: p.end }; await saveEmp(n); S.emps.set(n.id, n); }
  if (p.status === "COMPLETED" && pv.status !== "COMPLETED" && on.length) {
    const pb = on.filter((e) => e.status === "PROJECT_BASED"), rest = on.filter((e) => e.status !== "PROJECT_BASED");
    if (!await askConfirm(`${p.name} is completed. ${rest.length ? `Move ${rest.length} ${rest.length === 1 ? "person" : "people"} back to Head Office` : ""}${rest.length && pb.length ? " and " : ""}${pb.length ? `end the project assignment of ${pb.length} project-based ${pb.length === 1 ? "employee" : "employees"} on ${fmtDate(p.end || todayISO())}` : ""}?`)) return;
    for (const e of rest) { const n = { ...e, projectId: null, projectRole: null, projectSince: null, projectUntil: null, history: [...(e.history || []), { d: todayISO(), kind: "Project reassignment", text: `${p.name} completed; back to Head Office` }] }; await saveEmp(n); S.emps.set(n.id, n); }
    for (const e of pb) { const n = { ...e, projectUntil: p.end || todayISO() }; await saveEmp(n); S.emps.set(n.id, n); }
    logActivity(`Completed project ${p.name}: ${on.length} people updated`); toast("Project people updated. Project-based contracts ending now show in Contracts."); render(); }
}

/* 12. Renamed or renumbered employees: their phone records follow. ID cards show "Reprint" when the photo, name, position or assignment changed after printing. */
{ const b = saveEmp; saveEmp = async (e) => { const prev = S.emps.get(e.id); const out = await b(e);
    if (prev && (fullName(prev) !== fullName(e) || prev.no !== e.no) && S.realEdit) for (const [dev, id] of Object.entries(S.clockLinks || {})) if (id === e.id) { try { await S.db.doc(`clockins/${dev}`).update({ empNo: e.no, name: fullName(e) }); } catch {} }
    return out; }; }
const idSnap = (e) => [e.photo || "", completeName(e), e.posId || "", e.projectId || "", e.no || ""].join("|");
const idStale = (e) => { const l = idLast(e); return !!(l && l.snap && l.snap !== idSnap(e)); };
{ const b = printIds; printIds = async () => { const ids = [...S.idF.pick]; await b(); if (!S.realEdit) return;
    for (const id of ids) { const e = S.emps.get(id); const rec = S.idCards.get(id); if (!e || !rec?.prints?.length) continue; const prints = rec.prints.map((p, i) => (i === rec.prints.length - 1 ? { ...p, snap: idSnap(e) } : p));
      try { await S.db.doc(`idcards/${id}`).set({ empId: id, prints }); S.idCards.set(id, { ...rec, prints }); } catch {} } S.ver++; render(); }; }
{ const b = remList; remList = () => { const l = b(); if (l._id) return l; const today = todayISO();
    for (const e of active()) if (idStale(e)) { const key = `IDRE:${e.id}:${idLast(e).d}`; const dn = S.remDone.get(remKey(key));
      l.push({ key, kind: "IDEXP", e, due: today, from: today, title: "Reprint the ID card", to: ["HR", "EMP"], act: "id", done: dn?.done || null, by: dn?.by || null, sent: dn?.sent || [],
        msg: { HR: `${fullName(e)}'s photo, name, position or assignment changed after the ID was printed. Print a new one.`, EMP: "Your details changed since your ID was printed. HR will print you a new one." } }); }
    l.sort((a, c) => a.due.localeCompare(c.due)); l._id = 1; return l; }; }

/* Housekeeping that runs while someone from HR has the app open. */
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { applyDueSeparations().then(syncOnboarding).catch(() => {}); setTimeout(tick, 60000); }, 9000); }; }

/* Overtime rule switch, on the Overtime page. */
{ const b = VIEWS.ot; VIEWS.ot = (...a) => { const h = b(...a); const on = otOnlyApproved();
    const box = `<div class="notice"><span>${icon("clock", 16)} ${on ? "Only <b>approved</b> overtime is paid. Approving or rejecting a request updates that cutoff's time sheet right away." : "Overtime from punches is paid even without a request."}${S.canEdit ? ` <label style="margin-left:8px;white-space:nowrap"><input type="checkbox" id="lk-otap" ${on ? "checked" : ""}> Pay only approved overtime</label>` : ""}</span></div>`;
    const i = h.indexOf("</header>"); return i > 0 ? h.slice(0, i + 9) + box + h.slice(i + 9) : box + h; }; }
document.addEventListener("change", async (ev) => { if (ev.target.id !== "lk-otap" || !S.canEdit) return; await saveSettings({ otApproval: ev.target.checked }, ev.target.checked ? "Set overtime to be paid only when approved" : "Set overtime from punches to be paid without approval"); });

/* Every 201 file shows the records other modules keep for this person, with a link to each. */
{ const b = VIEWS.employee; VIEWS.employee = (...a) => { const h = b(...a); const e = S.emps.get(S.view.id); if (!e || !S.realEdit) return h;
    const L = (m) => listOf(m || new Map()); const mine = (m) => L(m).filter((r) => r.empId === e.id); const y = todayISO().slice(0, 4);
    const lv = allLeaves().filter((l) => l.empId === e.id && (l.from || "").startsWith(y)); const lns = L(S.loans).filter((x) => x.empId === e.id && ["ACTIVE", "HOLD"].includes(x.status));
    const rem = (() => { try { return remList().filter((r) => !r.done && r.e.id === e.id && r.kind !== "MISSING"); } catch { return []; } })();
    const items = [
      ["cal", "Leave this year", lv.length, `${lv.filter((l) => l.status === "PENDING").length} waiting`, "leave"],
      ["clock", "Overtime requests", mine(S.otReqs).length, `${mine(S.otReqs).filter((r) => r.status === "PENDING").length} waiting`, "ot"],
      ["wallet", "Active loans", lns.length, lns.length ? money(lns.reduce((s, x) => s + loanBal(x), 0)) + " left" : "none", "loans"],
      ["star", "Reviews", reviewsOf(e.id).length, reviewsOf(e.id)[0] ? `last ${fmtDate(reviewsOf(e.id)[0].at)}` : "none yet", "evaluation"],
      ["file", "Contracts", mine(S.ctrs).length, e.contractEnd || e.projectUntil ? `ends ${fmtDate(e.contractEnd || e.projectUntil)}` : "", "contracts"],
      ["log", "Personnel actions", mine(S.pafs).length + mine(S.salincs).length, "incl. salary increments", "paf"],
      ["shield", "Medical records", mine(S.meds).filter((r) => r.kind !== "PROFILE").length, typeof lastApe === "function" && lastApe(e) ? `APE due ${fmtDate(apeDue(e))}` : "no exam on file", "medical"],
      ["idcard", "ID card", idLast(e) ? 1 : 0, idLast(e) ? `${idStale(e) ? "reprint needed" : `valid to ${fmtDate(idLast(e).until)}`}` : "not printed", "idprint"],
      ["laptop", "Company property held", typeof heldBy === "function" ? heldBy(e.id).length : 0, "", "accountability"],
      ["alert", "Discipline cases", mine(S.cases).length, "", "discipline"],
      ["receipt", "Reimbursements", mine(S.reimbs).length, `${mine(S.reimbs).filter((r) => r.status === "PENDING").length} waiting`, "reimb"],
      ["bell", "Open reminders", rem.length, rem[0] ? rem[0].title : "none", "reminders"],
    ];
    const card = `<section class="card lk-card"><div class="card-head"><h2>${icon("org", 18)} Linked records</h2><span class="t-muted" style="font-size:13px">Kept in other modules, updated together</span></div>
      <div class="lk-grid">${items.map(([ic, l, n, sub, go]) => `<button class="lk-item" data-lk-go="${go}" data-lk-emp="${e.id}"><span class="lk-ic">${icon(ic, 18)}</span><span><b>${n}</b> ${esc(l)}${sub ? `<small>${esc(String(sub))}</small>` : ""}</span></button>`).join("")}</div></section>`;
    const i = h.lastIndexOf("</section>"); return i > 0 ? h.slice(0, i + 10) + card + h.slice(i + 10) : h + card; }; }
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-lk-go]"); if (!t) return; ev.stopImmediatePropagation(); const id = t.dataset.lkEmp; const g = t.dataset.lkGo;
  S.empFor = id; if (g === "idprint") { S.idF.pick = [id]; S.idF.show = id; } if (g === "reminders") S.remF.q = S.emps.get(id)?.no || ""; go(g); }, true);

/* 13. Disciplinary suspension: the working days after the decision (or from the chosen start) show as "Suspended" in the time records and are unpaid. */
const discMemo = { v: -1, m: new Map() };
function discDays(c) {
  const dc = c?.decision; if (dc?.penalty !== "SUSPENSION" || !(dc.days > 0)) return [];
  const out = []; let d = dc.from || addDays(dc.d, 1);
  for (let i = 0; out.length < dc.days && i < 120; i++, d = addDays(d, 1)) if (!PAY.isRest(parseISO(d), SET()) && !SET().holidays.some((h) => h.d === d)) out.push(d);
  return out;
}
function discSet(empId) {
  if (discMemo.v !== S.ver) { discMemo.v = S.ver; discMemo.m = new Map(); for (const c of listOf(S.cases || new Map())) for (const d of discDays(c)) (discMemo.m.get(c.empId) || discMemo.m.set(c.empId, new Set()).get(c.empId)).add(d); }
  return discMemo.m.get(empId);
}
TK_STATUS.dsusp = ["Suspended", "c-bad"];
{ const b = dayRec; dayRec = (e, d, rec, ctx) => { const r = b(e, d, rec, ctx); if (e && d && !r.in && ["absent", "notin", "due"].includes(r.status) && discSet(e.id)?.has(d)) { r.status = "dsusp"; r.dsusp = true; } return r; }; }
{ const b = remarks; remarks = (r) => { const x = b(r); return r.dsusp ? (x ? `${x} · ` : "") + "Disciplinary suspension, unpaid" : x; }; }
// A new suspension decision puts the unpaid days straight into each open cutoff's time sheet.
{ const b = put; put = async (col, rec) => { const prev = col === "cases" ? S.cases?.get(rec.id) : null; const out = await b(col, rec);
    if (col === "cases" && S.realEdit && rec.decision?.penalty === "SUSPENSION" && !prev?.decision?.d) { const by = new Map();
      for (const d of discDays(rec)) { const pid = PAY.periodOf(d); by.set(pid, (by.get(pid) || 0) + 1); }
      let n = 0; for (const [pid, k] of by) { if (isFinal(pid)) continue; const cur = periodDoc(pid).rows?.[rec.empId]?.abs || 0; await savePeriodRows(pid, { [rec.empId]: { abs: cur + k } }); n += k; }
      if (n) { logActivity(`Marked ${n} unpaid suspension day${n === 1 ? "" : "s"} for ${empName(rec.empId)} in the time sheet`); setTimeout(() => toast(`${n} unpaid suspension day${n === 1 ? "" : "s"} added to the time sheet.`), 600); } }
    return out; }; }

/* 14. Time sheet from the daily time records: absences, lateness, undertime, rest day, holiday, night and overtime hours, all from the punches. */
function ndHours(rec) {
  if (!rec?.pairs?.length) return 0; const bio = rec.pairs.filter((p) => p.in.bio); let h = 0;
  for (const p of bio.length ? bio : rec.pairs) { const a = Date.parse(p.in.t), b = Date.parse(p.out.t), d = manilaDay(p.in.t);
    for (const [s, t] of [[atManila(addDays(d, -1), "22:00"), atManila(d, "06:00")], [atManila(d, "22:00"), atManila(addDays(d, 1), "06:00")]]) h += Math.max(0, Math.min(b, t) - Math.max(a, s)) / 36e5; }
  return Math.floor(h * 2) / 2;
}
function dtrSheet(pid) {
  const p = PAY.period(pid); const today = todayISO(); const end = p.end < today ? p.end : today;
  const pd = punchDays(p.start, end); const ctx = tkCtx(); const otA = otOnlyApproved(); const patch = {}; let skipped = 0, noOut = 0;
  const people = [...S.emps.values()].filter((e) => e.hire <= end && !(e.separated?.date && e.separated.date < p.start));
  for (const e of people) { const days = pd.get(e.id); const ds = discSet(e.id); const stop = e.separated?.date && e.separated.date < end ? e.separated.date : end;
    if (!days && ![...(ds || [])].some((d) => d >= p.start && d <= p.end)) { skipped++; continue; }
    const v = { abs: 0, late: 0, ut: 0, ot: 0, rd: 0, rhw: 0, sh: 0, rdot: 0, rhot: 0, rhrd: 0, dhw: 0, rhrdot: 0, dhot: 0, shrd: 0, shrdot: 0, nd: 0 };
    // Disciplinary suspension days later in the cutoff are unpaid too.
    if (stop < p.end && !(e.separated?.date && e.separated.date < p.end)) PAY.eachDay(addDays(stop, 1), p.end, (_, d) => { if (ds?.has(d)) v.abs++; });
    PAY.eachDay(p.start, stop, (_, d) => { if (d < e.hire) return; const r = dayRec(e, d, days?.get(d), ctx);
      if (r.status === "absent" || r.status === "dsusp") { v.abs++; return; }
      if (!r.in) return; if (r.noOut) noOut++;
      if (r.status === "late") v.late += r.late; v.ut += r.ut || 0;
      const hol = (r.hol || []).filter((h) => h.type !== "SUSP"); const reg = hol.filter((h) => h.type === "REG").length; const h8 = Math.min(8, r.hrs || 0);
      if (reg >= 2) v.dhw += h8; else if (reg && r.rest) v.rhrd += h8; else if (reg) v.rhw += h8; else if (hol.length && r.rest) v.shrd += h8; else if (hol.length) v.sh += h8; else if (r.rest) v.rd += h8;
      // Night differential is 10% of the day's rate, so night hours on premium days count at that day's multiple.
      v.nd += ndHours(days?.get(d)) * (reg >= 2 ? 3 : reg && r.rest ? 2.6 : reg ? 2 : hol.length && r.rest ? 1.5 : hol.length || r.rest ? 1.3 : 1);
      if (!otA && r.ot) v[otKind(d)[0]] += r.ot; });
    if (otA) Object.assign(v, otSums(e.id, p));
    for (const k in v) v[k] = PAY.r2(v[k]); patch[e.id] = v; }
  return { p, end, patch, people: Object.keys(patch).length, skipped, noOut };
}
async function lkLoadDtr(pid) {
  if (!S.canEdit) return; if (isFinal(pid)) { toast("Payroll for this period is final. Reopen it first."); return; }
  const p = PAY.period(pid); if (p.start > todayISO()) { toast("This cutoff hasn't started yet."); return; }
  try { await loadClock(p.start, p.end, true); } catch {}
  const x = dtrSheet(pid);
  if (!x.people) { toast("No time records yet for this cutoff. Link phones or import biometric punches first."); return; }
  if (!await askConfirm(`Fill the ${p.label} time sheet for ${x.people} ${x.people === 1 ? "person" : "people"} from their daily time records (up to ${fmtDate(x.end)})?\n\nAbsences, lateness, undertime, overtime, rest day, holiday and night hours are replaced. Commissions, adjustments and deductions stay.${x.skipped ? `\n\n${x.skipped} ${x.skipped === 1 ? "person has" : "people have"} no time records and will be left as is.` : ""}`)) return;
  await savePeriodRows(pid, x.patch);
  logActivity(`Loaded the ${p.label} time sheet from the daily time records for ${x.people} people`);
  toast(`Time sheet filled for ${x.people} ${x.people === 1 ? "person" : "people"}.${x.noOut ? ` ${x.noOut} day${x.noOut === 1 ? " has" : "s have"} no time out; check them in Daily time records.` : ""}`); render();
}
{ const b = VIEWS.attendance; VIEWS.attendance = () => { const html = b(); const id = S.periodId || curPeriod(); if (!S.canEdit || isFinal(id)) return html;
    return html.replace('<button class="btn btn-ghost" data-go="punches">Biometric import</button>', `<button class="btn btn-gold" data-lk-dtr="${id}">${icon("clock")}Load from daily time records</button><button class="btn btn-ghost" data-go="punches">Biometric import</button>`); }; }
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-lk-dtr]"); if (!t) return; ev.stopImmediatePropagation(); t.disabled = true; lkLoadDtr(t.dataset.lkDtr).finally(() => { t.disabled = false; }); }, true);

/* 15. Effective-dated pay: a raise dated mid-cutoff is prorated by day, and a raise dated in an already-paid cutoff is paid as back pay in the next open payroll. */
const LK_BP_SINCE = "2026-10-09";
const payChanges = () => { const m = new Map(); for (const x of wiAll()) if (x.applied && x.d) (m.get(x.e.id) || m.set(x.e.id, []).get(x.e.id)).push(x); return m; };
const rateAsOf = (e, d, ch) => { let r = Number(e.basicPay) || 0; for (const x of ch || []) if (x.d > d) r -= x.to - x.from; return Math.max(0, r); };
{ const b = PAY.run; PAY.run = (emps, p, ...rest) => { const m = payChanges();
    const list = emps.map((e) => { const ch = m.get(e.id); if (!ch || !ch.some((x) => x.d > p.start)) return e; let s = 0, n = 0; PAY.eachDay(p.start, p.end, (_, d) => { s += rateAsOf(e, d, ch); n++; });
      const avg = PAY.r2(s / (n || 1)); return avg === Number(e.basicPay) ? e : { ...e, basicPay: avg }; });
    return b(list, p, ...rest); }; }
const dayDiff = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
async function lkBackPay() {
  if (!S.realEdit || !S.runs) return; const open = curPeriod(); if (isFinal(open)) return; const p0 = PAY.period(open); let paid = 0;
  for (const x of wiAll()) { if (!x.applied || x.rec.backpaid || !x.d || x.d >= p0.start || x.to === x.from || String(x.rec.applied) < LK_BP_SINCE) continue;
    const e = x.e; const dOld = e.payType === "DAILY" ? x.from : (x.from * 12) / SET().factor; let amt = 0; const pids = [];
    // Every final payroll from the change date to now must be loaded before the back pay is worked out; otherwise try again later.
    const need = []; for (let pid = PAY.periodOf(x.d); PAY.period(pid).start < p0.start; pid = PAY.shiftPeriod(pid, 1)) if (isFinal(pid)) need.push(pid);
    for (const pid of need) if (!S.runs.has(pid)) { try { await ensureRun(pid); } catch {} }
    if (need.some((pid) => !S.runs.has(pid))) continue;
    for (const pid of need) { const run = S.runs.get(pid); const L = run.lines?.[e.id]; if (!L || run.end < x.d || Math.abs(L.daily - dOld) > 0.05) continue;
      const from = x.d > run.start ? x.d : run.start; const frac = (dayDiff(from, run.end) + 1) / (dayDiff(run.start, run.end) + 1);
      amt += e.payType === "DAILY" ? (x.to - x.from) * (L.days || 0) * frac : ((x.to - x.from) / 2) * frac; pids.push(pid); }
    amt = PAY.r2(amt);
    if (amt) { const cur = periodDoc(open).rows?.[e.id]?.bp || 0; await savePeriodRows(open, { [e.id]: { bp: PAY.r2(cur + amt) } }); paid++;
      logActivity(`Added back pay of ${peso.format(amt)} for ${fullName(e)} (pay change from ${fmtDate(x.d)}) to the ${p0.label} payroll`); }
    try { await saveRec(x.src, x.rec.id, { ...x.rec, backpaid: { d: todayISO(), amt, pid: open, periods: pids } }); } catch {} }
  if (paid) toast(`Back pay added to the ${p0.label} payroll for ${paid} ${paid === 1 ? "person" : "people"} (under Back pay).`);
}
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { lkBackPay().catch(() => {}); setTimeout(tick, 60000); }, 12000); }; }
{ const b = finalizePayroll; finalizePayroll = async (id) => { if ($("#final-ok")?.checked && S.realEdit && id === curPeriod()) { try { await lkBackPay(); } catch {} } return b(id); }; }

/* 16. Payroll lines carry the project the person was charged to, so each finalized payroll keeps its cost per project even after people move. */
{ const b = PAY.run; PAY.run = (emps, ...rest) => { const out = b(emps, ...rest); for (const e of emps) { const l = out.lines[e.id]; if (l) { l.projectId = e.projectId || null; l.deptId = e.deptId || null; } } return out; }; }
const chargeOf = (l, e) => (l && "projectId" in l ? l.projectId : e?.projectId) || null;
function chargeName(l, e) { const pid = chargeOf(l, e); return pid ? S.projects.get(pid)?.name || "Project" : "Head Office"; }
{ const b = VIEWS.payroll; VIEWS.payroll = () => { const html = b(); if ((S.payTab || "register") !== "register") return html;
    const id = S.periodId || curPeriod(); const run = payrun(id); const by = new Map();
    for (const [eid, l] of Object.entries(run.lines || {})) { const e = S.emps.get(eid) || S.allEmps?.get(eid); if (S.scope && e && !inScope(e, S.scope)) continue; const k = chargeOf(l, e) || "";
      const x = by.get(k) || by.set(k, { k, n: 0, gross: 0, er: 0, net: 0 }).get(k); x.n++; x.gross += l.gross; x.er += (l.sssEr || 0) + (l.ec || 0) + (l.phEr || 0) + (l.hdEr || 0); x.net += l.net; }
    if (!by.size) return html;
    const rows = [...by.values()].sort((a, b) => (a.k ? 1 : 0) - (b.k ? 1 : 0) || b.gross - a.gross); const T = rows.reduce((a, x) => ({ n: a.n + x.n, gross: a.gross + x.gross, er: a.er + x.er }), { n: 0, gross: 0, er: 0 });
    const card = `<section class="card"><div class="card-head"><h2>Cost per project</h2><span class="t-muted" style="font-size:13px">${run.final ? "As charged when this payroll was finalized" : "Based on each person's current assignment"}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Charged to</th><th class="num">People</th><th class="num">Gross pay</th><th class="num">Employer share</th><th class="num">Total cost</th><th class="num">Share</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td><b>${esc(x.k ? S.projects.get(x.k)?.name || "Project" : "Head Office")}</b>${x.k && S.projects.get(x.k)?.code ? ` <span class="t-muted" style="font-size:12px">${esc(S.projects.get(x.k).code)}</span>` : ""}</td><td class="num">${x.n}</td><td class="num">${money(x.gross)}</td><td class="num">${money(x.er)}</td><td class="num"><b>${money(x.gross + x.er)}</b></td><td class="num">${T.gross + T.er ? (((x.gross + x.er) / (T.gross + T.er)) * 100).toFixed(1) + "%" : ""}</td></tr>`).join("")}
      <tr><td><b>Total</b></td><td class="num"><b>${T.n}</b></td><td class="num"><b>${money(T.gross)}</b></td><td class="num"><b>${money(T.er)}</b></td><td class="num"><b>${money(T.gross + T.er)}</b></td><td></td></tr></tbody></table></div></section>`;
    return html + card; }; }
