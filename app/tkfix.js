/* ---------- Timekeeping issues go to the employee and the supervisor (Glenn 2026-10-17) ----------
   The app finds what would stop a correct time sheet (missing time in or out, absent with no leave filed, overtime worked but
   not filed, punches outside the site area waiting for approval) and puts it on the employee's phone dashboard ("To fix before
   payroll") and on the supervisor's ("My team"). The employee sends the fix from the phone (clockins/{uid}/fixes); HR's app turns
   it into the normal request (attendance change, leave or overtime), which the supervisor approves or rejects from the phone
   (clockins/{uid}/decide). HR sees what is still open only near the cutoff (Timekeeping issues page, Needs action). */
Object.assign(S, { fxPhone: new Map(), dcPhone: new Map(), fxSubs: new Set(), fxMine: new Map(), dcMine: new Map(), fxMineSub: false, fxOpen: null, fxMode: "work", tkiQ: "" });
const FX_KIND = { MISS: ["Missing time in or out", "c-bad"], ABS: ["Absent, no leave filed", "c-bad"], OT: ["Overtime not filed", "c-warn"], GEO: ["Punch outside the site area", "c-warn"] };
const tkNearDays = () => Number(SET().tkNearDays ?? 2);
const tkNear = () => { const t = todayISO(); return tkOpenCutoffs().some((id) => addDays(PAY.period(id).end, -tkNearDays()) <= t); };
const fxSafe = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, "_");
// Pending requests of an employee, by day: what is already on its way to a decision.
function tkWaiting() {
  const w = new Map(); const add = (eid, d, what) => w.set(`${eid}|${d}`, what);
  for (const r of listOf(S.attReqs || new Map())) if (r.status === "PENDING" && r.d) add(r.empId, r.d, "ar");
  for (const r of listOf(S.otReqs || new Map())) if (r.status === "PENDING") add(r.empId, r.d, "ot");
  for (const l of allLeaves()) if (l.status === "PENDING" && FX_DAY.test(String(l.from)) && FX_DAY.test(String(l.to))) for (let d = l.from, n = 0; d <= l.to && n < 400; d = addDays(d, 1), n++) add(l.empId, d, "lv");
  return w;
}
/* Every open issue of every employee in the open cutoffs, up to yesterday (computed once per change). */
let tkIssMemo = { ver: -1, by: new Map() };
function tkIssuesAll() {
  if (tkIssMemo.ver === S.ver && tkIssMemo.day === todayISO()) return tkIssMemo.by;
  const by = new Map(); const to = addDays(todayISO(), -1); const ctx = tkCtx(); const wait = tkWaiting(); const otA = otOnlyApproved();
  const otFiled = new Set(listOf(S.otReqs || new Map()).map((r) => `${r.empId}|${r.d}`));
  for (const pid of tkOpenCutoffs()) { const p = PAY.period(pid); const end = p.end < to ? p.end : to; if (end < p.start) continue;
    const pd = punchDays(p.start, end);
    let geo = []; S.geoAll = true; try { geo = punchesIn(p.start, end).filter((x) => x.needsOk && !x.rev); } catch {} finally { S.geoAll = false; }
    for (const e of active()) { const days = pd.get(e.id); const myGeo = geo.filter((x) => x.empId === e.id); if (!days && !myGeo.length) continue; // people not on the clock are left to HR's time sheet
      const list = by.get(e.id) || []; const push = (kind, d, text, x = {}) => list.push({ k: `${kind}|${d}`, kind, d, text, wait: wait.get(`${e.id}|${d}`) || null, pid, ...x });
      for (let d = p.start; d <= end; d = addDays(d, 1)) { if (d < e.hire) continue; const r = dayRec(e, d, days?.get(d), ctx);
        if (r.noOut) push("MISS", d, `Time in ${timeFmt.format(new Date(r.in))}, no time out`, { tin: manilaHM(r.in) });
        else if (r.noIn) push("MISS", d, `Time out ${timeFmt.format(new Date(r.out))}, no time in`, { tout: manilaHM(r.out) });
        else if (r.status === "absent") push("ABS", d, "No time in, and no leave filed");
        else if (otA && r.in && !otFiled.has(`${e.id}|${d}`)) { let h = r.ot || 0; if ((r.rest || r.hol.length) && r.hrs) h = r.hrs; if (h > 0) push("OT", d, `${PAY.r2(h)} h past the shift, not filed`, { hours: PAY.r2(h) }); } }
      for (const x of myGeo) list.push({ k: `GEO|${x.dev}|${x.d}|${x.id}`, kind: "GEO", d: x.d, text: `${x.type === "OUT" ? "Time out" : "Time in"} ${timeFmt.format(new Date(x.t))} outside the site area${x.why ? `: ${x.why}` : ""}`, wait: "geo", geo: `${x.dev}|${x.d}|${x.id}`, pid });
      if (list.length) by.set(e.id, list); } }
  for (const l of by.values()) l.sort((a, b) => a.d.localeCompare(b.d));
  tkIssMemo = { ver: S.ver, day: todayISO(), by }; return by;
}
const manilaHM = (iso) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).format(new Date(iso));
const tkReports = (supId) => active().filter((x) => x.supervisorId === supId);
const phoneOf = (empId) => Object.entries(S.clockLinks || {}).find(([, v]) => v === empId)?.[0] || null;
// Requests of the team waiting for the supervisor: attendance changes, overtime, leave, and outside-area punches.
function tkTeamReqs(supId) {
  const ids = new Set(tkReports(supId).map((e) => e.id)); const out = []; if (!ids.size) return out;
  for (const r of listOf(S.attReqs || new Map())) if (r.status === "PENDING" && ids.has(r.empId)) out.push({ key: `ar:${r.id}`, empId: r.empId, d: r.d || r.from || r.filed, what: `${AR_KIND[r.kind]?.[0] || "Attendance request"}: ${arText(r)}`, why: r.reason || "" });
  for (const r of listOf(S.otReqs || new Map())) if (r.status === "PENDING" && ids.has(r.empId)) out.push({ key: `ot:${r.id}`, empId: r.empId, d: r.d, what: `Overtime ${fmtDate(r.d)}, ${r.hours} h`, why: r.reason || "" });
  for (const l of allLeaves()) if (l.status === "PENDING" && ids.has(l.empId)) out.push({ key: `lv:${l.month}:${l.id}`, empId: l.empId, d: l.from, what: `${leaveType(l.type)?.name || "Leave"} ${fmtDate(l.from)}${l.to !== l.from ? ` to ${fmtDate(l.to)}` : ""} (${l.days} day${l.days === 1 ? "" : "s"})`, why: l.reason || "" });
  for (const [eid, list] of tkIssuesAll()) if (ids.has(eid)) for (const x of list) if (x.kind === "GEO") out.push({ key: `geo:${x.geo}`, empId: eid, d: x.d, what: x.text, why: "" });
  return out.sort((a, b) => String(a.d).localeCompare(String(b.d)));
}
/* ---------- the phone summary carries both lists ---------- */
{ const b = buildSummary; buildSummary = (e) => { const s = b(e); try {
    const items = (tkIssuesAll().get(e.id) || []).map(({ k, kind, d, text, wait, tin, tout, hours }) => ({ k, kind, d, text, wait, tin: tin || null, tout: tout || null, hours: hours || null }));
    const ends = tkOpenCutoffs().map((id) => PAY.period(id)); const sup = S.emps.get(e.supervisorId);
    s.fix = { items, due: ends.length ? ends[0].end : null, label: ends.map((p) => p.label).join(", "), sup: sup ? fullName(sup) : "", lv: SET().leaveTypes.filter((t) => !t.sex || !e.gender || t.sex === e.gender).map((t) => [t.code, t.name]) };
    const team = tkReports(e.id);
    if (team.length) { const iss = tkIssuesAll(); s.team = { n: team.length, reqs: tkTeamReqs(e.id).slice(0, 40).map((r) => ({ ...r, name: empName(r.empId) })),
      open: team.map((x) => ({ name: fullName(x), n: (iss.get(x.id) || []).filter((i) => !i.wait).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 20) }; }
  } catch {} return s; }; }
/* ---------- phone and Employee view: the two cards on top of the dashboard ---------- */
function fxForm(x, s) {
  const why = `<div class="field"><label for="fx-why">Reason <span class="req">*</span></label><input class="input" id="fx-why" maxlength="200" placeholder="${x.kind === "OT" ? "What the overtime was for" : "e.g. Forgot to time out"}"></div>`;
  if (x.kind === "OT") return `<div class="field"><label for="fx-h">Overtime hours</label><input class="input" id="fx-h" type="number" min="0.5" step="0.5" value="${x.hours || 1}"></div>${why}`;
  const mode = x.kind === "ABS" ? S.fxMode : "work";
  const pick = x.kind === "ABS" ? `<div class="field"><label for="fx-mode">What happened</label><select class="input" id="fx-mode"><option value="work"${mode === "work" ? " selected" : ""}>I worked that day</option><option value="leave"${mode === "leave" ? " selected" : ""}>I was on leave</option></select></div>` : "";
  if (mode === "leave") return pick + `<div class="field"><label for="fx-type">Leave type</label><select class="input" id="fx-type">${(s.fix.lv || []).map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join("")}</select></div>${why}`;
  return pick + `<div class="field"><label for="fx-in">Time in</label><input class="input" id="fx-in" type="time" value="${esc(x.tin || "08:00")}"></div><div class="field"><label for="fx-out">Time out</label><input class="input" id="fx-out" type="time" value="${esc(x.tout || "17:00")}"></div>${why}`;
}
function fxCards(s, live) {
  let h = "";
  const items = s.fix?.items || [];
  if (items.length) { const sent = (k) => [...S.fxMine.values()].some((f) => f.k === k && !f.done);
    h += `<section class="card" id="fx-card" style="border-left:4px solid var(--red, #c0392b)"><div class="card-head"><h2>${icon("alert", 18)} To fix before payroll</h2><span class="t-muted" style="font-size:13px">${esc(s.fix.label)}${s.fix.due ? ` · cutoff ends ${fmtDate(s.fix.due)}` : ""}</span></div>
      <p class="t-muted" style="margin:0 0 8px;font-size:14px">Fix these so your pay is right. ${s.fix.sup ? `${esc(s.fix.sup)} (your supervisor) approves them.` : "HR approves them."}</p>
      <ul class="ed-reqs">${items.map((x) => { const st = x.wait ? '<span class="chip c-warn">Waiting for approval</span>' : sent(x.k) ? '<span class="chip c-blue">Sent</span>' : live && x.kind !== "GEO" ? `<button class="btn btn-primary btn-sm" data-fx="${esc(x.k)}">Fix</button>` : `<span class="chip ${FX_KIND[x.kind][1]}">To fix</span>`;
        return `<li style="flex-wrap:wrap"><span><b>${fmtDate(x.d)}</b> · ${esc(FX_KIND[x.kind][0])}<small class="t-muted"> · ${esc(x.text)}</small></span>${st}${live && S.fxOpen === x.k && !x.wait ? `<form class="form-grid" id="fx-form" data-k="${esc(x.k)}" style="flex-basis:100%;margin-top:8px">${fxForm(x, s)}<div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn btn-primary" type="submit">Send to ${s.fix.sup ? "my supervisor" : "HR"}</button><button class="btn btn-ghost" type="button" data-fx="">Cancel</button></div></form>` : ""}</li>`; }).join("")}</ul></section>`; }
  const t = s.team;
  if (t && (t.reqs.length || t.open.length)) { const done = (key) => S.dcMine.get(fxSafe(key));
    h += `<section class="card" id="fx-team"><div class="card-head"><h2>${icon("people", 18)} My team</h2><span class="t-muted" style="font-size:13px">${t.n} ${t.n === 1 ? "person reports" : "people report"} to you</span></div>
      ${t.reqs.length ? `<p style="margin:0 0 6px;font-size:14px"><b>Waiting for your approval</b></p><ul class="ed-reqs">${t.reqs.map((r) => { const dc = done(r.key);
        return `<li style="flex-wrap:wrap"><span><b>${esc(r.name)}</b> · ${esc(r.what)}${r.why ? `<small class="t-muted"> · ${esc(r.why)}</small>` : ""}</span>${dc ? `<span class="chip ${dc.st === "APPROVED" ? "c-ok" : "c-bad"}">${dc.st === "APPROVED" ? "Approved" : "Rejected"}</span>` : live ? `<span style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" data-dc="${esc(r.key)}|APPROVED">Approve</button><button class="btn btn-ghost btn-sm" data-dc="${esc(r.key)}|REJECTED">Reject</button></span>` : '<span class="chip c-warn">Waiting</span>'}</li>`; }).join("")}</ul>` : ""}
      ${t.open.length ? `<p style="margin:10px 0 6px;font-size:14px"><b>Not fixed yet</b> <span class="t-muted">(they see these on their phone)</span></p><ul class="ed-reqs">${t.open.map((o) => `<li><span>${esc(o.name)}</span><span class="chip c-warn">${o.n} to fix</span></li>`).join("")}</ul>` : ""}</section>`; }
  return h;
}
{ const b = dashSections; dashSections = (s, go) => { const live = go === "self-tab" && S.selfMode;
    if (live && !S.fxMineSub && S.self?.uid && S.db) { S.fxMineSub = true;
      fxQ(S.self.uid, "fixes", 200).onSnapshot((snap) => { S.fxMine = new Map(snap.docs.map((d) => [d.id, d.data()])); render(); }, () => {});
      fxQ(S.self.uid, "decide", 300).onSnapshot((snap) => { S.dcMine = new Map(snap.docs.map((d) => [d.id, d.data()])); render(); }, () => {}); }
    let top = ""; try { top = fxCards(s, live); } catch {} return top + b(s, go); }; }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-fx],[data-dc]"); if (!t || !S.selfMode || !S.self?.uid) return; ev.stopImmediatePropagation();
  if (t.dataset.fx !== undefined) { S.fxOpen = t.dataset.fx || null; S.fxMode = "work"; render(); return; }
  const v = t.dataset.dc; const key = v.slice(0, v.lastIndexOf("|")), st = v.slice(v.lastIndexOf("|") + 1);
  t.disabled = true; const rec = { key, st, at: new Date().toISOString(), name: S.self.claim?.name || null };
  try { await S.db.doc(`clockins/${S.self.uid}/decide/${fxSafe(key)}`).set(rec); S.dcMine.set(fxSafe(key), rec); toast(st === "APPROVED" ? "Approved. It reaches the time sheet in a moment." : "Rejected."); render(); } catch { t.disabled = false; toast("Couldn't send. Check your connection and try again."); }
}, true);
document.addEventListener("change", (ev) => { if (ev.target.id === "fx-mode") { S.fxMode = ev.target.value; render(); } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "fx-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.selfMode || !S.self?.uid) return;
  const x = (S.meSum?.fix?.items || []).find((i) => i.k === f.dataset.k); if (!x) return;
  const why = $("#fx-why")?.value.trim(); if (!why) { toast("Give the reason."); return; }
  const rec = { k: x.k, kind: x.kind, d: x.d, reason: why, at: new Date().toISOString(), empNo: S.self.claim?.empNo || null, name: S.self.claim?.name || null };
  if (x.kind === "OT") { rec.hours = Number($("#fx-h").value) || 0; if (rec.hours <= 0) { toast("Enter the hours."); return; } }
  else if (x.kind === "ABS" && S.fxMode === "leave") { rec.mode = "leave"; rec.type = $("#fx-type").value; }
  else { rec.mode = "work"; rec.in = $("#fx-in").value || null; rec.out = $("#fx-out").value || null; if (!rec.in && !rec.out) { toast("Enter the time in or out."); return; } }
  const id = uid(); try { await S.db.doc(`clockins/${S.self.uid}/fixes/${id}`).set(JSON.parse(JSON.stringify(rec))); S.fxMine.set(id, rec); S.fxOpen = null; toast("Sent. You'll see it here once it's approved."); render(); } catch { toast("Couldn't send. Check your connection and try again."); }
}, true);

/* ---------- HR's app: pick up fixes and decisions from the phones ---------- */
// Newest first, so a phone's old, finished records never hide its new ones.
const fxQ = (dev, sub, n) => S.db.collection(`clockins/${dev}/${sub}`).orderBy("at", "desc").limit(n);
function fxWatch() {
  const live = new Set(active().map((e) => e.id));
  for (const d of S.clockDevs.values()) { if (d.kiosk || d.bio || d.adjust || hrDev(d.id) || S.fxSubs.has(d.id) || !live.has(S.clockLinks[d.id])) continue; S.fxSubs.add(d.id);
    fxQ(d.id, "fixes", 200).onSnapshot((snap) => { for (const k of [...S.fxPhone.keys()]) if (k.startsWith(d.id + ":")) S.fxPhone.delete(k); for (const x of snap.docs) S.fxPhone.set(`${d.id}:${x.id}`, { id: x.id, dev: d.id, ...x.data() }); refresh(); }, () => {});
    fxQ(d.id, "decide", 300).onSnapshot((snap) => { for (const k of [...S.dcPhone.keys()]) if (k.startsWith(d.id + ":")) S.dcPhone.delete(k); for (const x of snap.docs) S.dcPhone.set(`${d.id}:${x.id}`, { id: x.id, dev: d.id, ...x.data() }); refresh(); }, () => {}); }
}
const FX_DAY = /^\d{4}-\d\d-\d\d$/, FX_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const fxText = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
// Re-reads one phone's punches for a day's cutoff, so an issue that isn't found really is fixed (and not just not read yet).
async function fxReadDev(dev, d) { const p = PAY.period(PAY.periodOf(d));
  const snap = await S.db.collection(`clockins/${dev}/days`).where("d", ">=", p.start).where("d", "<=", p.end).get();
  for (const x of snap.docs) S.clockDays.set(`${dev}/${x.data().d}`, x.data()); S.ver++; }
const fxDone = async (f, extra) => { await S.db.doc(`clockins/${f.dev}/fixes/${f.id}`).update(extra); S.fxPhone.set(`${f.dev}:${f.id}`, { ...f, done: true, ...extra }); };
// Every open HR app runs this; a short claim on the phone's record makes sure only one of them acts on it.
const FX_TAB = uid();
async function fxClaim(path) {
  // On the website the database takes the claim in one step; if that isn't available yet, fall back to claim-and-recheck.
  if (window.__sb) { const { data, error } = await window.__sb.rpc("hr_take", { p: path, tab: FX_TAB }); if (!error) return data === true; }
  const ref = S.db.doc(path); const cur = await ref.get(); const x = cur.exists ? cur.data() : null; if (!x || x.done) return false;
  if (x.claim && x.claim.by !== FX_TAB && Date.now() - Date.parse(x.claim.at) < 60000) return false;
  await ref.update({ claim: { by: FX_TAB, at: new Date().toISOString() } }); await new Promise((r) => setTimeout(r, 1500));
  const y = await ref.get(); return !!y.exists && !y.data().done && y.data().claim?.by === FX_TAB;
}
/* One fix from a phone. Only what the app itself found for that person is accepted, with the values the app allows. */
async function fxOne(f) {
  const e = S.emps.get(S.clockLinks[f.dev]); if (!e) return false; const fixId = `${f.dev}:${f.id}`;
  if (!FX_DAY.test(String(f.d || "")) || isNaN(parseISO(f.d))) { await fxDone(f, { done: true, note: "Not a valid day. Ask HR." }); return true; }
  if (isFinal(PAY.periodOf(f.d))) { await fxDone(f, { done: true, note: "Payroll for that cutoff is already final. Ask HR." }); return true; }
  const find = () => (tkIssuesAll().get(e.id) || []).find((x) => x.k === f.k && x.kind !== "GEO");
  let iss = find(); if (!iss && tkOpenCutoffs().includes(PAY.periodOf(f.d))) { await fxReadDev(f.dev, f.d); iss = find(); } // a read error throws: tried again next round
  if (!iss) {
    await fxDone(f, { done: true, note: "This is already fixed or no longer open. Ask HR if it still needs a change." }); return true; }
  const reason = fxText(f.reason); const d = iss.d; let req = null;
  const dup = (m) => listOf(m || new Map()).find((r) => r.fixId === fixId);
  if (iss.kind === "OT") { const ex = dup(S.otReqs); if (ex) req = `ot:${ex.id}`;
    else { const h = Math.min(Number(iss.hours) || 0, Math.max(0, Math.round((Number(f.hours) || 0) * 2) / 2)); if (!(h > 0)) { await fxDone(f, { done: true, note: "Enter the overtime hours again." }); return true; }
      const id = `fx_${fxSafe(fixId)}`; await put("otreqs", { id, empId: e.id, d, hours: h, reason, status: "PENDING", filed: todayISO(), decided: null, src: "phone", fixId }); req = `ot:${id}`; } }
  else if (f.mode === "leave" && iss.kind === "ABS") { const ex = allLeaves().find((l) => l.fixId === fixId); if (ex) req = `lv:${ex.month}:${ex.id}`;
    else { const t = leaveType(f.type) || SET().leaveTypes[0]; const item = { empId: e.id, type: t.code, from: d, to: d, half: false, reason, status: "PENDING", filed: todayISO(), decided: null, src: "phone", fixId };
      item.days = PAY.leaveDays(item, SET(), t) || 1; const id = `fx_${fxSafe(fixId)}`; const month = d.slice(0, 7);
      if (S.leaveDocs.has(month)) await S.db.doc("leaves/" + month).update({ items: { [id]: item } }); else await S.db.doc("leaves/" + month).set({ month, items: { [id]: item } });
      const doc = S.leaveDocs.get(month) || { month, items: {} }; S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: item } }); S.ver++; req = `lv:${month}:${id}`; } }
  else { const tin = FX_HM.test(f.in || "") ? f.in : null, tout = FX_HM.test(f.out || "") ? f.out : null;
    if (!tin && !tout) { await fxDone(f, { done: true, note: "Enter the time in or out again." }); return true; }
    const ex = dup(S.attReqs); if (ex) req = `ar:${ex.id}`;
    else { const id = `fx_${fxSafe(fixId)}`; const r = { empId: e.id, kind: "ADJUST", d, in: tin, out: tout, reason, status: "PENDING", filed: todayISO(), by: null, src: "phone", fixId };
      await S.db.doc(`attreq/${id}`).set(JSON.parse(JSON.stringify(r))); S.attReqs.set(id, { id, ...r }); S.ver++; req = `ar:${id}`; } }
  await fxDone(f, { done: true, req });
  logActivity(`${fullName(e)} sent a timekeeping fix from the phone (${FX_KIND[iss.kind][0]}, ${fmtDate(d)})`); return true;
}
// With an approval chain set for that kind of request (Needs action > Rules), the supervisor's Approve fills the next step that
// anyone may endorse; a step kept for a named person, or any step left after it, stays with HR before the final approval.
const FX_OPK = { ar: "ar", ot: "ot", lv: "leave" };
async function fxChain(type, key, c, sup) {
  const kind = FX_OPK[type]; const ch = OPS().chains[kind] || []; const id = apprId(kind, key); const rec = S.apprs.get(id) || { kind, key, steps: [] };
  const at = new Date().toISOString(), by = `sup:${sup.id}`; let x = { ...rec, steps: [...(rec.steps || [])] };
  if (c.st === "APPROVED" && x.steps.length < ch.length) { const L = ch[x.steps.length];
    if (!L.uid) x.steps.push({ i: x.steps.length, name: L.name, by, sup: fullName(sup), at }); else x.sup = { name: fullName(sup), by, at }; }
  const held = c.st === "APPROVED" && x.steps.length < ch.length; if (!held) x.final = { st: c.st, at, by };
  S.apprs.set(id, x); try { await S.db.doc(`apprs/${id}`).set(JSON.parse(JSON.stringify(x))); } catch {}
  return held; // true: endorsed only, HR decides
}
async function dcOne(c) {
  const sup = S.emps.get(S.clockLinks[c.dev]); const ok = c.st === "APPROVED" || c.st === "REJECTED"; let note = null;
  const by = sup ? `sup:${sup.id}` : null; const mine = (empId) => sup && empId !== sup.id && S.emps.get(empId)?.supervisorId === sup.id;
  const [type, ...rest] = String(c.key || "").split(":");
  if (!sup || !ok) note = "Not allowed";
  else if (type === "ar") { const r = S.attReqs.get(rest.join(":")); if (!r || !mine(r.empId)) note = "Not your team"; else if (r.status !== "PENDING") note = "Already decided";
    else if (await fxChain("ar", r.id, c, sup)) note = "Endorsed; HR gives the final approval";
    else { if (c.st === "APPROVED") await applyReq(r); const nr = { ...r, status: c.st, decided: { d: todayISO(), by } }; await S.db.doc(`attreq/${r.id}`).set(JSON.parse(JSON.stringify((({ id: _, ...x }) => x)(nr)))); S.attReqs.set(r.id, nr); } }
  else if (type === "ot") { const r = S.otReqs?.get(rest.join(":")); if (!r || !mine(r.empId)) note = "Not your team"; else if (r.status !== "PENDING") note = "Already decided";
    else if (await fxChain("ot", r.id, c, sup)) note = "Endorsed; HR gives the final approval"; else await put("otreqs", { ...r, status: c.st, decided: todayISO(), decidedBy: by }); }
  else if (type === "lv") { const [month, id] = rest; const doc = S.leaveDocs.get(month); const l = doc?.items?.[id];
    if (!l || !mine(l.empId)) note = "Not your team"; else if (l.status !== "PENDING") note = "Already decided"; else if (c.st === "APPROVED" && isFinal(PAY.periodOf(l.from))) note = "Payroll is final; HR will decide";
    else { const b = c.st === "APPROVED" ? balances(S.emps.get(l.empId), yearOf(l.from)).find((x) => x.code === l.type) : null;
      if (b && b.left != null && l.days > b.left) note = "Not enough leave left; HR will decide";
      else if (await fxChain("lv", `${month}:${id}`, c, sup)) note = "Endorsed; HR gives the final approval";
      else { await S.db.doc("leaves/" + month).update({ items: { [id]: { status: c.st, decided: todayISO(), decidedBy: by } } }); S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: { ...l, status: c.st, decided: todayISO(), decidedBy: by } } }); S.ver++; } } }
  else if (type === "geo") { const [dev, d, id] = rest.join(":").split("|"); const p = S.clockDays.get(`${dev}/${d}`)?.punches?.[id]; const eid = p ? (hrDev(dev) ? p.empId : null) || S.clockLinks[dev] || null : null; // a phone's punches belong to HR's link, as in punchesIn()
    if (!p || !mine(eid)) note = "Not your team"; else if (S.punchRevs?.get(`${dev}|${d}|${id}`)) note = "Already decided";
    else { const r = { dev, d, id, rev: c.st === "APPROVED" ? "OK" : "REJ", by, at: new Date().toISOString() }; await S.db.doc(`punchrev/${revId(dev, d, id)}`).set(r); S.punchRevs.set(`${dev}|${d}|${id}`, r); S.ver++; } }
  else note = "Unknown request";
  await S.db.doc(`clockins/${c.dev}/decide/${c.id}`).update({ done: true, note }); S.dcPhone.set(`${c.dev}:${c.id}`, { ...c, done: true, note });
  if (!note) logActivity(`${fullName(sup)} (supervisor) ${c.st === "APPROVED" ? "approved" : "rejected"} a request from the phone`);
  else if (/^Endorsed/.test(note)) logActivity(`${fullName(sup)} (supervisor) endorsed a request from the phone`);
  return true;
}
let fxBusy = false;
async function fxProcess() {
  if (fxBusy || !S.db || !S.realEdit || !S.canEdit || S.selfMode) return; fxBusy = true; let moved = 0;
  S.auSys = "Phone fixes and approvals";
  try { fxWatch();
    // Each record on its own: one bad record never holds up everyone else's.
    for (const f of [...S.fxPhone.values()]) { if (f.done || !S.emps.get(S.clockLinks[f.dev])) continue; try { if (await fxClaim(`clockins/${f.dev}/fixes/${f.id}`) && await fxOne(f)) moved++; } catch {} }
    for (const c of [...S.dcPhone.values()]) { if (c.done) continue; try { if (await fxClaim(`clockins/${c.dev}/decide/${c.id}`) && await dcOne(c)) moved++; } catch {} }
  } catch {} finally { fxBusy = false; S.auSys = null; }
  // The other side sees it on their phone straight away, not at the next minute's refresh.
  if (moved) setTimeout(() => syncSummaries(), 300);
}
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { fxProcess().catch(() => {}); setTimeout(tick, 15000); }, 10000); }; }

/* ---------- HR: Timekeeping issues page (what is still open; urgent near the cutoff) ---------- */
function tkIssuesPage() {
  const by = tkIssuesAll(); const near = tkNear(); const q = S.tkiQ.toLowerCase(); const rows = [];
  for (const [eid, list] of by) { const e = S.emps.get(eid); if (!e) continue; const sup = S.emps.get(e.supervisorId); const ph = phoneOf(eid); const supPh = sup && phoneOf(sup.id);
    for (const x of list) rows.push({ e, x, sup, ph, supPh }); }
  const shown = rows.filter((r) => !q || [fullName(r.e), r.e.no, r.sup ? fullName(r.sup) : ""].join(" ").toLowerCase().includes(q));
  const n = (f) => rows.filter(f).length; const hr = (r) => !r.ph || (r.x.wait && !r.supPh);
  const who = (r) => r.x.wait ? (r.supPh ? `<span class="chip c-warn">Waiting for ${esc(fullName(r.sup))}</span>` : '<span class="chip c-bad">Waiting for HR (no supervisor phone)</span>') : r.ph ? `<span class="chip c-blue">Sent to ${esc(r.e.first || fullName(r.e))}'s phone</span>` : '<span class="chip c-bad">HR to fix (no phone linked)</span>';
  const ends = tkOpenCutoffs().map((id) => PAY.period(id));
  return head("Timekeeping", "Timekeeping issues", `<button class="btn btn-ghost" data-go="attreqs">Attendance requests</button><button class="btn btn-ghost" data-go="attendance">Time sheet</button>`) + `
    <div class="notice"><span>${icon("phone", 16)} Each problem goes to the employee's phone to fix, and their supervisor approves it from theirs. ${near ? "<b>The cutoff is near:</b> anything still open below needs HR now." : `HR only needs to step in from ${tkNearDays()} days before the cutoff ends${ends.length ? ` (${fmtDate(addDays(ends[ends.length - 1].end, -tkNearDays()))})` : ""}, or for people with no phone linked.`}</span></div>
    <section class="stats">
      <div class="card stat"><span class="label">Open issues</span><span class="value">${rows.length}</span><span class="note t-muted">${esc(ends.map((p) => p.label).join(", "))}</span></div>
      <div class="card stat"><span class="label">With the employee</span><span class="value">${n((r) => !r.x.wait && r.ph)}</span><span class="note t-muted">on their phone</span></div>
      <div class="card stat"><span class="label">With the supervisor</span><span class="value">${n((r) => r.x.wait && r.supPh)}</span><span class="note t-muted">waiting for approval</span></div>
      <div class="card stat"><span class="label">HR to handle</span><span class="value">${n(hr)}</span><span class="note t-bad">no phone linked</span></div></section>
    <section class="card"><div class="card-head"><h2>Open issues</h2><input class="input" id="tki-q" style="max-width:280px" placeholder="Name, employee no. or supervisor" value="${esc(S.tkiQ)}" aria-label="Search"></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Day</th><th>Problem</th><th>Supervisor</th><th>With</th></tr></thead><tbody>
      ${shown.slice(0, 500).map((r) => `<tr><td><button class="link" data-emp="${r.e.id}">${esc(fullName(r.e))}</button><div class="t-muted" style="font-size:12px">${esc(r.e.no || "")}</div></td><td>${fmtDate(r.x.d)}</td><td><span class="chip ${FX_KIND[r.x.kind][1]}">${esc(FX_KIND[r.x.kind][0])}</span><div class="t-muted" style="font-size:13px">${esc(r.x.text)}</div></td><td>${r.sup ? esc(fullName(r.sup)) : '<span class="t-bad">None set</span>'}</td><td>${who(r)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Nothing to fix. Every time record in the open cutoffs is complete.</td></tr>'}
      </tbody></table></div><p class="t-muted" style="margin:10px 0 0;font-size:13px">Set each person's supervisor on their 201 file. Phones are linked on Phone clock-in.</p></section>`;
}
VIEWS.tkissues = tkIssuesPage; SECTION_OF.tkissues = "tkissues"; HRD_PERM.tkissues = "Timekeeping"; HRD_LABEL.tkissues = "Timekeeping issues";
{ for (const [, items] of NAV) for (const it of items) if (it[0] === "tk" && Array.isArray(it[3]) && !it[3].some(([v]) => v === "tkissues")) { const i = it[3].findIndex(([v]) => v === "attreqs"); it[3].splice(i >= 0 ? i + 1 : it[3].length, 0, ["tkissues", "Timekeeping issues", "alert"]); } }
document.addEventListener("input", (ev) => { if (ev.target.id !== "tki-q") return; S.tkiQ = ev.target.value; const p0 = ev.target.selectionStart; render(); const i = $("#tki-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
// Needs action: overtime not filed waits on the employee until the cutoff is near; then one line per person still open.
{ const b = opsDeadlines; opsDeadlines = () => { const out = b(); const near = tkNear(); const keep = out.filter((x) => !(x.kind === "ot" && x.src === "dl" && !near));
    if (near) { try { const by = tkIssuesAll();
      for (const [eid, list] of by) { const e = S.emps.get(eid); const open = list.filter((x) => !x.wait || !phoneOf(e?.supervisorId)); if (!e || !open.length) continue; const due = PAY.period(open[0].pid).end; // the earliest cutoff with something open
        keep.push({ src: "dl", kind: "tki", label: "Timekeeping issue not fixed", what: `${open.length} open: ${[...new Set(open.map((x) => FX_KIND[x.kind][0].toLowerCase()))].join(", ")}`, e, due, late: Math.max(0, daysBetween(due, todayISO())), view: "tkissues", unit: unitName(e) }); } } catch {} }
    return keep.sort((a, b) => b.late - a.late || a.due.localeCompare(b.due)); }; }
