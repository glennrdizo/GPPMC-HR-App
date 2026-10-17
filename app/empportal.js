/* ---------- Full Employee menu on the employee's own account (Glenn 2026-10-17) ----------
   The "Employee" preview builds each page from HR's records, which an employee's account can't read. HR's app now draws the
   same pages for each confirmed employee and saves them to that employee's own folder (clockins/{uid}/me/pages), the same way
   it already shares the dashboard. The employee's account shows the full Employee menu from those pages. Requests the employee
   files there (leave, attendance change, overtime, certificate) go to clockins/{uid}/reqs; HR's app turns them into the
   usual records, which wait for approval like any other request. */
const EP_TAB = { esshome: "home", essask: "ask", essbot: "bot", essloans: "loans" }; // pages the employee's account already has
const EP_FORM = { essleave: "leave", essreq: "adjust", essot: "ot", esshr: "cert" };
const epPrevMonth = (m) => { const [y, n] = m.split("-").map(Number); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`; };
// What the HR app's page has that only works for HR: forms, HR buttons and the preview's own period pickers.
function epClean(h) {
  return h.replace(/<form\b[\s\S]*?<\/form>/g, "").replace(/<select\b[^>]*data-ess-period[\s\S]*?<\/select>/g, "")
    .replace(/<label\b[^>]*>\s*<span class="lbl"[^>]*>Pay period<\/span>\s*<\/label>/g, "")
    .replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (m, attrs, inner) => {
      const ess = attrs.match(/data-ess="([a-z]+)"/); if (ess) { const v = ess[1]; return `<button${attrs.replace(ess[0], `data-self-tab="${EP_TAB[v] || "p:" + v}"`)}>${inner}</button>`; }
      const slip = attrs.match(/data-ess-slip="([^"]+)"/); if (slip) return `<button${attrs.replace(slip[0], `data-self-tab="p:esspay@${slip[1]}"`)}>${inner}</button>`;
      return /\bdata-[a-z-]+=/.test(attrs) || /\bdisabled\b/.test(attrs) ? "" : m; });
}
function epRender(e) {
  const keep = { realEdit: S.realEdit, viewAs: S.viewAs, essView: S.essView, essM: S.essM, periodId: S.periodId, essSlip: S.essSlip, arNew: S.arNew, lrNew: S.lrNew, empNew: S.empNew, viewEmp: S.viewEmp };
  const pages = {}; const one = (key, fn) => { try { pages[key] = epClean(fn()); } catch (err) { console.warn("Employee page not drawn", key, err); } };
  try {
    Object.assign(S, { realEdit: false, viewAs: "emp", viewEmp: e.id, arNew: null, lrNew: null, empNew: null });
    for (const [v] of ESS_NAV) { if (EP_TAB[v] || !ESS[v]) continue;
      if (v === "esspay") { if (e.conf) { pages.esspay = head("Employee", "My payslips") + '<section class="card"><p style="margin:0">Your payslips come from Management. Ask HR if you need a copy.</p></section>'; continue; }
        const slips = essSlips(e).slice(0, 3); pages.esspay = ""; for (const s of slips) { S.essSlip = s.id; one(`esspay@${s.id}`, () => ESS.esspay(e)); } if (slips[0]) { const kept = new Set(slips.map((s) => s.id)); // only the payslips shared here get a tab
          for (const s of slips) { const k = `esspay@${s.id}`; if (pages[k]) pages[k] = pages[k].replace(/<button\b[^>]*data-self-tab="p:esspay@([^"]+)"[^>]*>[\s\S]*?<\/button>/g, (m, id) => (kept.has(id) ? m : "")).replace(/\d+ recent pay periods?/, `${slips.length} recent pay ${slips.length === 1 ? "period" : "periods"}`); }
          pages.esspay = pages[`esspay@${slips[0].id}`] || ""; } else one("esspay", () => ESS.esspay(e)); continue; }
      if (v === "esstime") { const c = curPeriod(); S.periodId = c; one("esstime", () => ESS.esstime(e)); S.periodId = PAY.shiftPeriod(c, -1); one(`esstime@${S.periodId}`, () => ESS.esstime(e)); pages.esstimePrev = S.periodId; continue; }
      if (v === "essatt") { const m = todayISO().slice(0, 7); S.essM = m; one("essatt", () => ESS.essatt(e)); S.essM = epPrevMonth(m); one(`essatt@${S.essM}`, () => ESS.essatt(e)); pages.essattPrev = S.essM; continue; }
      one(v, () => ESS[v](e)); }
  } finally { Object.assign(S, keep); }
  return { v: 1, nav: ESS_NAV.map(([v, l, ic]) => [v, l, ic]), pages, conf: !!e.conf, curPeriod: curPeriod(), month: todayISO().slice(0, 7) };
}
/* ---------- HR side: keep each confirmed employee's pages current ---------- */
// Drawing one person's pages takes about a second, so each round does a few seconds' worth, oldest first: everyone is
// refreshed about every half hour, and someone HR just confirmed, or whose request HR just filed, goes first.
S.epSynced = S.epSynced || {}; S.epAt = S.epAt || {}; S.epDue = S.epDue || new Set(); let epBusy = false;
const EP_EVERY = 30 * 60000, EP_BUDGET = 3000;
async function epSync(only) {
  if (epBusy || !S.realEdit || !S.db || !S.clockDevs?.size || !S.emps.size || S.selfMode) return; epBusy = true;
  try {
    if (only) S.epDue.add(only); const now = Date.now();
    const devs = [...S.clockDevs.values()].filter((d) => { if (d.kiosk || d.bio || d.adjust) return false; const e = S.emps.get(S.clockLinks[d.id]); return !!e && !e.sample && !e.separated; })
      .filter((d) => S.epDue.has(d.id) || !(now - (S.epAt[d.id] || 0) < EP_EVERY)).sort((x, y) => (S.epDue.has(y.id) - S.epDue.has(x.id)) || ((S.epAt[x.id] || 0) - (S.epAt[y.id] || 0)));
    if (!devs.length) return;
    const to = todayISO(); await loadClock(`${epPrevMonth(to.slice(0, 7))}-01`, to); await loadClock(addDays(PAY.period(PAY.shiftPeriod(curPeriod(), -1)).start, -1), addDays(to, 1));
    const t0 = performance.now();
    for (const d of devs) { if (performance.now() - t0 > EP_BUDGET) break; const e = S.emps.get(S.clockLinks[d.id]);
      await new Promise((r) => setTimeout(r, 0)); // let the page breathe between people
      try {
        const doc = epRender(e); const json = JSON.stringify(doc); let h = 0; for (let k = 0; k < json.length; k++) h = (h * 31 + json.charCodeAt(k)) | 0;
        if (S.epSynced[d.id] === undefined) { try { const x = await S.db.doc(`clockins/${d.id}/me/pages`).get(); S.epSynced[d.id] = x.exists ? x.data().h ?? null : null; } catch { S.epSynced[d.id] = null; } }
        if (S.epSynced[d.id] !== h) { await S.db.doc(`clockins/${d.id}/me/pages`).set({ ...doc, h, at: new Date().toISOString() }); S.epSynced[d.id] = h; }
        S.epAt[d.id] = Date.now(); S.epDue.delete(d.id);
      } catch (err) { S.epAt[d.id] = Date.now() - EP_EVERY + 5 * 60000; console.warn("Employee pages not shared", d.id, err); } // tried again in 5 minutes
    }
  } catch (err) { console.warn("Employee pages not shared", err); } finally { epBusy = false; }
}
{ const b = syncSummaries; syncSummaries = async (...a) => { await b(...a); await epSync(); }; }
window.addEventListener("click", (ev) => { const t = ev.target.closest?.("[data-clock-link]"); if (!t) return; const dev = t.dataset.clockLink.split(":")[0]; setTimeout(() => epSync(dev), 2500); });

/* ---------- HR side: requests the employees file from their own account ---------- */
S.rqPhone = S.rqPhone || new Map(); S.rqSubs = S.rqSubs || new Set();
function rqWatch() {
  for (const d of S.clockDevs.values()) { if (d.kiosk || d.bio || d.adjust || hrDev(d.id) || S.rqSubs.has(d.id) || !S.emps.get(S.clockLinks[d.id])) continue; S.rqSubs.add(d.id);
    fxQ(d.id, "reqs", 200).onSnapshot((snap) => { for (const k of [...S.rqPhone.keys()]) if (k.startsWith(d.id + ":")) S.rqPhone.delete(k); for (const x of snap.docs) S.rqPhone.set(`${d.id}:${x.id}`, { id: x.id, dev: d.id, ...x.data() }); refresh(); }, () => {}); }
}
const rqDone = async (f, extra) => { await S.db.doc(`clockins/${f.dev}/reqs/${f.id}`).update(extra); S.rqPhone.set(`${f.dev}:${f.id}`, { ...f, done: true, ...extra }); };
async function rqOne(f) {
  const e = S.emps.get(S.clockLinks[f.dev]); if (!e) return false; const rqId = `${f.dev}:${f.id}`; const id = `rq_${fxSafe(rqId)}`; const reason = fxText(f.reason); const today = todayISO();
  const bad = (note) => rqDone(f, { done: true, note }).then(() => true);
  const day = (v) => FX_DAY.test(String(v || "")) && !isNaN(parseISO(v)) && v >= addDays(today, -120) && v <= addDays(today, 370);
  if (f.kind === "leave") {
    if (allLeaves().some((l) => l.rqId === rqId)) return rqDone(f, { done: true, req: "leave" }).then(() => true);
    const t = leaveType(f.type); if (!t) return bad("Choose the leave type again.");
    if (!day(f.from) || !day(f.to) || f.to < f.from) return bad("Check the dates.");
    if (!reason) return bad("Give the reason.");
    const item = { empId: e.id, type: t.code, from: f.from, to: f.to, half: !!f.half && f.from === f.to, reason, status: "PENDING", filed: today, decided: null, src: "phone", rqId };
    item.days = PAY.leaveDays(item, SET(), t) || (item.half ? 0.5 : 1); const month = f.from.slice(0, 7);
    if (S.leaveDocs.has(month)) await S.db.doc("leaves/" + month).update({ items: { [id]: item } }); else await S.db.doc("leaves/" + month).set({ month, items: { [id]: item } });
    const doc = S.leaveDocs.get(month) || { month, items: {} }; S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: item } }); S.ver++;
    await rqDone(f, { done: true, req: `lv:${month}:${id}` }); logActivity(`${fullName(e)} filed ${t.name.toLowerCase()} from their account (${fmtDate(f.from)}${f.to !== f.from ? ` to ${fmtDate(f.to)}` : ""})`); return true; }
  if (f.kind === "adjust" || f.kind === "ot") {
    if (!day(f.d) || f.d > today) return bad("Check the date.");
    if (isFinal(PAY.periodOf(f.d))) return bad("Payroll for that cutoff is already final. Ask HR.");
    if (!reason) return bad("Give the reason.");
    if (f.kind === "adjust") { if (S.attReqs.has(id)) return rqDone(f, { done: true, req: `ar:${id}` }).then(() => true);
      const tin = FX_HM.test(f.in || "") ? f.in : null, tout = FX_HM.test(f.out || "") ? f.out : null; if (!tin && !tout) return bad("Enter the time in or out.");
      const r = { empId: e.id, kind: "ADJUST", d: f.d, in: tin, out: tout, reason, status: "PENDING", filed: today, by: null, src: "phone", rqId };
      await S.db.doc(`attreq/${id}`).set(JSON.parse(JSON.stringify(r))); S.attReqs.set(id, { id, ...r }); S.ver++;
      await rqDone(f, { done: true, req: `ar:${id}` }); logActivity(`${fullName(e)} asked for an attendance change from their account (${fmtDate(f.d)})`); return true; }
    if (S.otReqs.has(id)) return rqDone(f, { done: true, req: `ot:${id}` }).then(() => true);
    const h = Math.round((Number(f.hours) || 0) * 2) / 2; if (!(h > 0 && h <= 16)) return bad("Enter the overtime hours again.");
    await put("otreqs", { id, empId: e.id, d: f.d, hours: h, reason, status: "PENDING", filed: today, decided: null, src: "phone", rqId });
    await rqDone(f, { done: true, req: `ot:${id}` }); logActivity(`${fullName(e)} filed ${h} h of overtime from their account (${fmtDate(f.d)})`); return true; }
  if (f.kind === "cert") {
    if (S.certReqs.has(id)) return rqDone(f, { done: true, req: `cq:${id}` }).then(() => true);
    if (!CERTS.some((c) => c[0] === f.type)) return bad("Choose the certificate again."); const purpose = fxText(f.purpose, 120); if (!purpose) return bad("Give the purpose.");
    await saveRec("certreq", id, { status: "PENDING", filed: today, by: null, empId: e.id, type: f.type, purpose, copies: Math.min(10, Math.max(1, Math.round(Number(f.copies) || 1))), need: day(f.need) ? f.need : null, src: "phone", rqId });
    await rqDone(f, { done: true, req: `cq:${id}` }); logActivity(`${fullName(e)} asked for a ${certName(f.type).toLowerCase()} from their account`); return true; }
  return bad("This kind of request can't be sent from here. Use Ask HR.");
}
let rqBusy = false;
async function rqProcess() {
  if (rqBusy || !S.db || !S.realEdit || !S.canEdit || S.selfMode) return; rqBusy = true; let moved = 0; S.auSys = "Requests from employee accounts";
  try { rqWatch(); for (const f of [...S.rqPhone.values()]) { if (f.done || !S.emps.get(S.clockLinks[f.dev])) continue; try { if (await fxClaim(`clockins/${f.dev}/reqs/${f.id}`) && await rqOne(f)) { moved++; S.epDue.add(f.dev); } } catch (err) { console.warn("Employee request not filed", f.id, err); } } }
  catch {} finally { rqBusy = false; S.auSys = null; }
  if (moved) setTimeout(() => syncSummaries(), 300);
}
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { rqProcess().catch(() => {}); setTimeout(tick, 15000); }, 12000); }; }

/* ---------- The employee's own account ---------- */
function epSub() {
  if (S.epSub || !S.self?.uid || !S.db) return; S.epSub = true;
  S.db.doc(`clockins/${S.self.uid}/me/pages`).onSnapshot((d) => { S.mePages = d.exists ? d.data() : null; render(); }, () => { S.mePages = null; render(); });
  fxQ(S.self.uid, "reqs", 100).onSnapshot((snap) => { S.rqMine = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, () => {});
  if (!S.meSumSub && typeof subMeSum === "function") subMeSum();
}
{ const bn = selfNav; selfNav = () => { const h = bn(); if (!S.self?.claim) return h; epSub(); const P = S.mePages; if (!P?.nav) return h;
    const cur = S.selfTab || "home"; const isCur = (t) => (cur === t || cur.split("@")[0] === t ? ' aria-current="page"' : "");
    const items = P.nav.map(([v, l, ic]) => { const t = EP_TAB[v] || "p:" + v; if (!EP_TAB[v] && P.pages?.[v] == null && !(v === "esspay" && Object.keys(P.pages || {}).some((k) => k.startsWith("esspay@")))) return "";
      return `<button class="nav-item" data-self-tab="${t}"${isCur(t)}>${icon(ic)}${esc(t === "home" ? "My home" : l)}</button>`; }).join("");
    const clock = `<button class="nav-item" data-self-tab="clock"${isCur("clock")}>${icon("phone")}Clock in or out</button>`;
    const me = h.slice(h.indexOf('<div class="me-card">'));
    return `<div class="nav-group"><span class="nav-label" style="cursor:default"><span class="mod-ic" aria-hidden="true">${icon("people", 18)}</span><span style="flex:1">Employee</span></span><div class="nav-sub">${clock}${items}</div></div>${me.startsWith('<div class="me-card">') ? me : ""}`; };
  const bv = selfView; selfView = () => { if (!S.self?.claim) return bv(); epSub(); const t = S.selfTab || "home"; if (!t.startsWith("p:")) return bv(); return epView(t.slice(2)); }; }
function epView(key) {
  const P = S.mePages; if (P === undefined) return head("Employee", "Loading…") + '<section class="card"><p class="t-muted" style="margin:0">Loading…</p></section>';
  if (!P) return head("Employee", "Your pages are on their way") + '<section class="card"><p style="margin:0;font-size:15px">HR needs to confirm your account first. You can already clock in and ask HR.</p></section>';
  const [v, variant] = key.split("@"); const pages = P.pages || {};
  let html = pages[key] ?? pages[v]; if (html == null) return head("Employee", "Not available") + '<section class="card"><p style="margin:0">This page isn\'t ready yet. Try again in a minute.</p></section>';
  let sw = "";
  if (v === "esstime" && P.pages.esstimePrev) sw = epSwitch([["esstime", "This pay period"], [`esstime@${P.pages.esstimePrev}`, "Previous pay period"]], key);
  if (v === "essatt" && P.pages.essattPrev) sw = epSwitch([["essatt", "This month"], [`essatt@${P.pages.essattPrev}`, "Previous month"]], key);
  const form = EP_FORM[v] ? epForm(EP_FORM[v]) : v === "essreimb" ? '<section class="card"><p style="margin:0;font-size:15px">To get back what you spent, send the receipt through <button class="link" data-self-tab="ask">Ask HR</button>.</p></section>' : "";
  const i = html.indexOf("</section>"); const hi = html.indexOf('<section class="hero'); const at = hi === 0 ? i + 10 : html.indexOf("<section", 1);
  html = at > 0 ? html.slice(0, at) + sw + form + html.slice(at) : html + sw + form;
  return html + `<p class="t-muted" style="font-size:13px;margin:0">Updated ${esc(timeAgo(P.at))}. For corrections, use Ask HR.</p>`;
}
const epSwitch = (opts, key) => `<div class="tabs" role="tablist" style="margin:0 0 12px">${opts.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${k === key}" data-self-tab="p:${k}">${esc(l)}</button>`).join("")}</div>`;
const EP_KIND = { leave: "Leave", adjust: "Attendance change", ot: "Overtime", cert: "Certificate" };
function epForm(kind) {
  const open = S.epOpen === kind; const sent = (S.rqMine || []).filter((r) => r.kind === kind).slice(0, 5);
  const label = { leave: "File a leave", adjust: "Ask for an attendance change", ot: "File overtime", cert: "Request a certificate" }[kind];
  const today = todayISO(); const lt = (SET().leaveTypes || []).map((t) => [t.code, t.name]);
  const body = kind === "leave" ? `<div class="field"><label for="rq-type">Leave</label><select class="input" id="rq-type">${opts(lt, lt[0]?.[0])}</select></div>
      <div class="field"><label for="rq-from">From</label><input class="input" type="date" id="rq-from" value="${today}" required></div><div class="field"><label for="rq-to">To</label><input class="input" type="date" id="rq-to" value="${today}" required></div>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="rq-half"> Half day</label>`
    : kind === "adjust" ? `<div class="field"><label for="rq-d">Date</label><input class="input" type="date" id="rq-d" max="${today}" required></div><div class="field"><label for="rq-in">Time in</label><input class="input" type="time" id="rq-in"></div><div class="field"><label for="rq-out">Time out</label><input class="input" type="time" id="rq-out"></div>`
    : kind === "ot" ? `<div class="field"><label for="rq-d">Date</label><input class="input" type="date" id="rq-d" max="${today}" required></div><div class="field"><label for="rq-h">Hours</label><input class="input" type="number" id="rq-h" min="0.5" max="16" step="0.5" required></div>`
    : `<div class="field"><label for="rq-ct">Certificate</label><select class="input" id="rq-ct">${opts(CERTS, "COE")}</select></div><div class="field"><label for="rq-pp">Purpose</label><input class="input" id="rq-pp" required placeholder="e.g. Bank loan"></div>
      <div class="field"><label for="rq-cp">Copies</label><input class="input" type="number" id="rq-cp" min="1" max="10" value="1"></div><div class="field"><label for="rq-need">Needed by</label><input class="input" type="date" id="rq-need" value="${addDays(today, 3)}"></div>`;
  const why = kind === "cert" ? "" : `<div class="field" style="grid-column:1/-1"><label for="rq-why">Reason</label><input class="input" id="rq-why" required maxlength="200"></div>`;
  return `<section class="card"><div class="card-head"><h2>${esc(label)}</h2>${open ? "" : `<button class="btn btn-primary btn-sm" data-rq-open="${kind}">${esc(label)}</button>`}</div>
    ${open ? `<form id="rq-form" class="panel form-grid" style="align-items:end" data-kind="${kind}" data-keep>${body}${why}<div style="display:flex;gap:8px"><button class="btn btn-primary">Send to HR</button><button type="button" class="btn btn-ghost" data-rq-open="">Cancel</button></div></form>` : '<p class="t-muted" style="margin:0;font-size:14px">It goes to HR for approval. You see the result here.</p>'}
    ${sent.length ? `<ul class="list" style="font-size:14px;margin-top:10px">${sent.map((r) => `<li style="display:flex;justify-content:space-between;gap:10px"><span>${esc(EP_KIND[r.kind] || "Request")} · ${esc(fmtDate((r.from || r.d || r.at || "").slice(0, 10)))}${r.note ? `<div class="t-bad" style="font-size:13px">${esc(r.note)}</div>` : ""}</span><span class="chip ${r.done ? (r.note ? "c-bad" : "c-ok") : "c-warn"}">${r.done ? (r.note ? "Not filed" : "With HR") : "Waiting for HR"}</span></li>`).join("")}</ul>` : ""}</section>`;
}
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-rq-open]"); if (!t || !S.selfMode) return; ev.stopImmediatePropagation(); S.epOpen = t.dataset.rqOpen || null; render(); }, true);
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "rq-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.selfMode || !S.self?.uid) return;
  const kind = f.dataset.kind; const v = (id) => $(`#${id}`)?.value?.trim() || ""; const rec = { kind, at: new Date().toISOString(), empNo: S.self.claim?.empNo || null, name: S.self.claim?.name || null };
  if (kind !== "cert") { rec.reason = v("rq-why"); if (!rec.reason) { toast("Give the reason."); return; } }
  if (kind === "leave") { Object.assign(rec, { type: v("rq-type"), from: v("rq-from"), to: v("rq-to"), half: !!$("#rq-half")?.checked }); if (!rec.from || !rec.to || rec.to < rec.from) { toast("Check the dates."); return; } }
  if (kind === "adjust") { Object.assign(rec, { d: v("rq-d"), in: v("rq-in") || null, out: v("rq-out") || null }); if (!rec.d || (!rec.in && !rec.out)) { toast("Enter the date and at least one time."); return; } }
  if (kind === "ot") { Object.assign(rec, { d: v("rq-d"), hours: Number(v("rq-h")) || 0 }); if (!rec.d || !(rec.hours > 0)) { toast("Enter the date and hours."); return; } }
  if (kind === "cert") { Object.assign(rec, { type: v("rq-ct"), purpose: v("rq-pp"), copies: Number(v("rq-cp")) || 1, need: v("rq-need") || null }); if (!rec.purpose) { toast("Give the purpose."); return; } }
  const id = uid(); try { await S.db.doc(`clockins/${S.self.uid}/reqs/${id}`).set(JSON.parse(JSON.stringify(rec))); S.rqMine = [{ id, ...rec }, ...(S.rqMine || [])]; S.epOpen = null; toast("Sent to HR."); render(); } catch { toast("Couldn't send. Check your connection and try again."); }
}, true);

/* ---------- The employee's account builds its own pages (website, Glenn 2026-10-17) ----------
   hr_my_data() returns only the signed-in employee's own slice of HR's records. The account loads that slice into a read-only
   copy of the database and starts the same loaders HR's app starts, so the Employee pages and the home summary are drawn here,
   current, without an HR browser open. The employee's own folder (clockins/{uid}) and pub/ still go to the real database.
   If the function isn't there or the account isn't linked yet, the pages HR's app saved are shown as before. */
const MY = { rows: null, at: 0, busy: false, off: false, booted: false, subs: new Set(), pv: -1, live: null, calc: false };
const MY_EVERY = 2 * 60000;
async function myLoad() {
  if (MY.busy || MY.off || !window.__sb || !S.selfMode || !S.self?.uid || !S.self.claim) return; MY.busy = true;
  try {
    const { data, error } = await window.__sb.rpc("hr_my_data"); if (error) throw error;
    if (!Array.isArray(data)) { MY.rows = null; MY.pv = -1; render(); return; } // not linked to an active employee yet
    MY.rows = new Map(data.filter((r) => r && typeof r.path === "string").map((r) => [r.path, r.data])); MY.at = Date.now(); MY.pv = -1;
    if (!MY.booted) myBoot(); else { for (const f of MY.subs) try { f(); } catch {} }
    S.ver++; render();
  } catch (err) { if (/PGRST202|42883|does not exist|Could not find the function/i.test(`${err?.code} ${err?.message}`)) MY.off = true; console.warn("Couldn't load my records", err); }
  finally { MY.busy = false; }
}
function myDb(real) {
  const mine = (p) => p === `clockins/${S.self.uid}` || p.startsWith(`clockins/${S.self.uid}/`) || p.startsWith("pub/");
  const par = (p) => p.replace(/\/[^/]+$/, "");
  const val = (v, f) => String(f).split(".").reduce((x, k) => x?.[k], v);
  const snap = (p, v) => ({ id: p.split("/").pop(), exists: v != null, data: () => (v == null ? undefined : structuredClone(v)) });
  const cmp = (a, op, b) => op === "==" ? a === b : op === "!=" ? a !== b : op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : op === ">=" ? a >= b
    : op === "in" ? (b || []).includes(a) : op === "array-contains" ? Array.isArray(a) && a.includes(b) : false;
  const run = (c, o) => {
    let docs = [...(MY.rows || new Map())].filter(([p, v]) => par(p) === c && o.w.every(([f, op, x]) => cmp(val(v, f), op, x)));
    if (o.ob) docs.sort(([, a], [, b]) => { const x = val(a, o.ob), y = val(b, o.ob); return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === "desc" ? -1 : 1); });
    if (o.n) docs = docs.slice(0, o.n); const ds = docs.map(([p, v]) => snap(p, v));
    return { docs: ds, size: ds.length, empty: !ds.length, forEach: (fn) => ds.forEach(fn) };
  };
  const watch = (fn) => { MY.subs.add(fn); try { fn(); } catch {} return () => MY.subs.delete(fn); };
  const no = async () => { const e = new Error("Not allowed."); e.code = "permission_denied"; throw e; };
  const q = (c, o) => ({ where: (f, op, v) => q(c, { ...o, w: [...o.w, [f, op, v]] }), orderBy: (f, dir = "asc") => q(c, { ...o, ob: f, dir }), limit: (n) => q(c, { ...o, n }),
    get: async () => run(c, o), onSnapshot: (cb) => watch(() => cb(run(c, o))) });
  return { mine: true, real,
    doc: (p) => (mine(p) ? real.doc(p) : { id: p.split("/").pop(), path: p, get: async () => snap(p, MY.rows?.get(p)), set: no, update: no, delete: no,
      onSnapshot: (cb) => watch(() => cb(snap(p, MY.rows?.get(p)))) }),
    collection: (c) => (mine(c) ? real.collection(c) : q(c, { w: [] })) };
}
function myBoot() {
  MY.booted = true; const db = myDb(S.db); S.db = db; const map = (snap) => new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  // the loaders HR's app starts with, reading the employee's own slice
  db.collection("employees").limit(50).onSnapshot((snap) => { S.emps = map(snap); S.loaded.emps = true; refresh(); });
  db.collection("projects").limit(50).onSnapshot((snap) => { S.projects = map(snap); S.loaded.projects = true; refresh(); });
  db.doc("org/main").onSnapshot((d) => { const o = d.exists ? d.data() : { companyName: CO_DEFAULT, departments: [], positions: [] }; S.org = !o.companyName || o.companyName === "HR System" ? { ...o, companyName: CO_DEFAULT } : o; S.loaded.org = true; refresh(); });
  db.doc("org/settings").onSnapshot((d) => { S.settings = d.exists ? d.data() : null; refresh(); });
  db.collection("leaves").orderBy("month", "desc").limit(24).onSnapshot((snap) => { S.leaveDocs = new Map(snap.docs.map((d) => [d.id, d.data()])); refresh(); });
  db.collection("periods").orderBy("start", "desc").limit(48).onSnapshot((snap) => { S.periods = new Map(snap.docs.map((d) => [d.id, d.data()])); refresh(); });
  db.collection("payruns").orderBy("start", "desc").limit(12).onSnapshot((snap) => { S.runs = new Map(snap.docs.map((d) => [d.id, d.data()])); refresh(); });
  for (const b of [bootTalent, bootComply, bootExtra, bootTk, bootTr]) try { b(db); } catch (err) { console.warn("Loader skipped", err); }
  setInterval(() => { if (document.visibilityState === "visible") myLoad(); }, MY_EVERY);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - MY.at > 30000) myLoad(); });
}
// The pages and home summary drawn here from the employee's own records, redrawn when the records change.
function myLive() {
  if (!MY.rows || MY.calc || !S.selfMode) return null; const e = S.emps.get(S.clockLinks?.[S.self?.uid]); if (!e) return null;
  if (MY.pv === S.ver && MY.live) return MY.live; MY.calc = true;
  try { const at = new Date(MY.at).toISOString(); const sum = JSON.parse(JSON.stringify({ ...buildSummary(e), at }));
    if (MY.stSum?.team) sum.team = MY.stSum.team; // the people a supervisor approves for come from HR's copy
    MY.live = { P: { ...epRender(e), at, live: true }, sum }; MY.pv = S.ver; }
  catch (err) { console.warn("Couldn't draw my pages", err); MY.live = null; MY.off = true; }
  finally { MY.calc = false; }
  return MY.live;
}
{ const had = { P: S.mePages, sum: S.meSum };
  Object.defineProperty(S, "mePages", { configurable: true, enumerable: true, get: () => myLive()?.P ?? MY.stP, set: (v) => { MY.stP = v; } });
  Object.defineProperty(S, "meSum", { configurable: true, enumerable: true, get: () => myLive()?.sum ?? MY.stSum, set: (v) => { MY.stSum = v; } });
  MY.stP = had.P; MY.stSum = had.sum; }
{ const b = epSub; epSub = () => { const first = !S.epSub; b(); if (first && S.epSub) myLoad(); }; }
