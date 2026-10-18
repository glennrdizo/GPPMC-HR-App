/* ---------- Timekeeping: change schedule, official business, undertime (attendance requests), overtime, and work suspensions ---------- */
Object.assign(S, { susps: new Map(), spF: { new: false } });
Object.assign(TCOLS, { suspend: "susps" });
AR_KIND.SHIFT[0] = "Change schedule";
Object.assign(AR_KIND, { OB: ["Official business", "c-blue"], UT: ["Undertime", "c-warn"] });
{
  const tk = NAV.find(([g]) => g === "Timekeeping");
  if (tk) { const it = tk[1]; const i = it.findIndex(([v]) => v === "attreqs");
    it.splice(i >= 0 ? i + 1 : it.length, 0, ["chsched", "Change schedule", "cal"], ["obreq", "Official business", "pin"], ["utreq", "Undertime", "clock"], ["suspend", "Work suspension", "alert"]);
    const o = it.find(([v]) => v === "ot"); if (o) o[1] = "Overtime"; }
  Object.assign(SECTION_OF, { chsched: "chsched", obreq: "obreq", utreq: "utreq", suspend: "suspend" });
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("suspend").limit(500).onSnapshot((snap) => { S.susps = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }
alias("chsched", { before: () => { S.arF = { kind: "SHIFT", st: "PENDING" }; }, view: () => VIEWS.attreqs() });
alias("obreq", { before: () => { S.arF = { kind: "OB", st: "PENDING" }; }, view: () => VIEWS.attreqs() });
alias("utreq", { before: () => { S.arF = { kind: "UT", st: "PENDING" }; }, view: () => VIEWS.attreqs() });

/* ---------- official business and undertime forms ---------- */
{ const b = arText; arText = (r) => r.kind === "OB" ? `${fmtDate(r.from)}${r.to && r.to !== r.from ? ` to ${fmtDate(r.to)}` : ""}${r.tin ? `, ${r.tin}–${r.tout}` : ", whole day"} at ${r.place || "outside the office"}`
  : r.kind === "UT" ? `${fmtDate(r.d)}: leave at ${r.out}${r.mins ? ` (${r.mins} min early)` : ""}` : b(r); }
{ const b = arForm; arForm = (e, kind) => { if (kind !== "OB" && kind !== "UT") return b(e, kind); const today = todayISO(); const sh = shiftOf(e) || { start: "08:00", end: "17:00" };
  const body = kind === "OB" ? `<div class="field"><label for="ob-from">From <span class="req">*</span></label><input class="input" id="ob-from" type="date" required value="${today}"></div>
      <div class="field"><label for="ob-to">To <span class="req">*</span></label><input class="input" id="ob-to" type="date" required value="${today}"></div>
      <div class="field"><label for="ob-in">Time out of the office</label><input class="input" id="ob-in" type="time" value="${sh.start}"></div>
      <div class="field"><label for="ob-out">Time back or end</label><input class="input" id="ob-out" type="time" value="${sh.end}"></div>
      <div class="field"><label for="ob-place">Where <span class="req">*</span></label><input class="input" id="ob-place" required placeholder="e.g. BIR RDO 81, Cebu City"></div>
      <div class="field"><label for="ar2-why">Purpose <span class="req">*</span></label><input class="input" id="ar2-why" required placeholder="e.g. File the 1601-C"></div>`
    : `<div class="field"><label for="ut-d">Date <span class="req">*</span></label><input class="input" id="ut-d" type="date" required value="${today}"></div>
      <div class="field"><label for="ut-out">Leave at <span class="req">*</span></label><input class="input" id="ut-out" type="time" required value="${sh.end ? addMinutes(sh.end, -120) : "15:00"}"></div>
      <div class="field"><label for="ar2-why">Reason <span class="req">*</span></label><input class="input" id="ar2-why" required placeholder="e.g. Child's school meeting"></div>`;
  return `<form id="ar2-form" class="panel form-grid" style="align-items:end" data-kind="${kind}" data-ar-emp="${e.id}" data-keep>${body}<div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-ar-new="">Cancel</button></div>
    <p class="t-muted" style="grid-column:1/-1;margin:0;font-size:13px">${kind === "OB" ? "Once approved, the time out and back are added to the time records, so the days count as worked." : "Approved undertime is excused, but the hours not worked are still unpaid (no work, no pay)."}</p></form>`; }; }
function addMinutes(hhmm, m) { const [h, mm] = hhmm.split(":").map(Number); const t = Math.max(0, h * 60 + mm + m); return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }
{ const b = applyReq; applyReq = async (r) => { if (r.kind === "UT") return; if (r.kind !== "OB") return b(r); const e = S.emps.get(r.empId);
  for (let d = r.from; d <= (r.to || r.from); d = addDays(d, 1)) { if (planCode(e, d) === "R") continue; const sh = shiftById(planCode(e, d)) || shiftOf(e) || { start: "08:00", end: "17:00" };
    const tin = r.tin || sh.start, tout = r.tout || sh.end; // a time back earlier than the time out is the next morning
    for (const [type, hhmm] of [["IN", tin], ["OUT", tout]]) await savePunch("adjust", { t: new Date(atManila(type === "OUT" && tout < tin ? addDays(d, 1) : d, hhmm)).toISOString(), type, empId: r.empId, adj: r.id, note: `Official business: ${r.place || ""}` }, { name: "HR adjustments", kiosk: true, adjust: true }); }
  S.clockLoaded.clear(); }; }
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "ar2-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const kind = f.dataset.kind; const e = S.emps.get(f.dataset.arEmp); const why = $("#ar2-why").value.trim(); if (!why) { toast("Give the reason."); return; }
  const r = { empId: e.id, kind, reason: why, status: "PENDING", filed: todayISO(), by: S.myId || null };
  if (kind === "OB") { r.from = $("#ob-from").value; r.to = $("#ob-to").value || r.from; r.tin = $("#ob-in").value || null; r.tout = $("#ob-out").value || null; r.place = $("#ob-place").value.trim(); if (!r.from || r.to < r.from || !r.place) { toast("Check the dates and where."); return; } }
  if (kind === "UT") { r.d = $("#ut-d").value; r.out = $("#ut-out").value; if (!r.d || !r.out) { toast("Enter the date and time."); return; } const end = (shiftOf(e) || {}).end; if (end) { const [h1, m1] = end.split(":").map(Number), [h2, m2] = r.out.split(":").map(Number); r.mins = Math.max(0, h1 * 60 + m1 - (h2 * 60 + m2)); } }
  try { const id = uid(); await S.db.doc(`attreq/${id}`).set(JSON.parse(JSON.stringify(r))); S.attReqs.set(id, { id, ...r }); S.arNew = null; logActivity(`Filed ${AR_KIND[kind][0].toLowerCase()} for ${fullName(e)}`); toast("Sent for approval."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);

/* ---------- work suspension (typhoon, flooding, government advisory): no work that day for a site or everyone ---------- */
const SP_WHY = ["Typhoon or storm signal", "Flooding", "Earthquake", "Government advisory (LGU or Malacañang)", "Power or water outage", "Site safety stop", "Other"];
const suspOf = (e, d) => listOf(S.susps).find((s) => s.from <= d && (s.to || s.from) >= d && (!s.unit || inUnit(e, s.unit)));
{ const b = dayRec; dayRec = (e, d, rec, ctx) => { const r = b(e, d, rec, ctx); const s = e && d ? suspOf(e, d) : null; if (!s) return r; r.susp = s;
    if (!r.in && ["absent", "notin", "due"].includes(r.status) && (s.pay !== "UNPAID" || (e.payType || "MONTHLY") !== "DAILY")) { r.status = "hol"; r.hol = [...(r.hol || []), { d, name: `Work suspended: ${s.reason}`, type: "SUSP" }]; } return r; }; }
{ const b = remarks; remarks = (r) => { const x = b(r); if (!r.susp) return x; const t = `Work suspended (${r.susp.pay === "UNPAID" ? "no work, no pay" : "paid"})`; return r.status === "hol" ? x : x ? `${x} · ${t}` : t; }; }
VIEWS.suspend = () => {
  const all = listOf(S.susps).sort((a, b) => (b.from || "").localeCompare(a.from || "")); const today = todayISO(); const unitLabel = (u) => !u ? "Everyone" : unitOpts().find(([k]) => k === u)?.[1] || "Some employees";
  const cnt = (s) => active().filter((e) => !s.unit || inUnit(e, s.unit)).length;
  return head("Days with no work because of weather, disasters or advisories", "Work suspension", S.canEdit ? `<button class="btn btn-gold" data-sp-new>${icon("plus")}Declare a work suspension</button>` : "") + `
    <section class="stats">${dxTile("Today", all.filter((s) => s.from <= today && (s.to || s.from) >= today).length ? "Suspended" : "Normal", all.filter((s) => s.from <= today && (s.to || s.from) >= today).map((s) => unitLabel(s.unit)).join(", ") || "no suspension today", all.some((s) => s.from <= today && (s.to || s.from) >= today) ? "t-bad" : "t-ok")}${dxTile(`Suspensions in ${today.slice(0, 4)}`, all.filter((s) => s.from.startsWith(today.slice(0, 4))).length, "declared")}${dxTile("Paid by the company", all.filter((s) => s.pay !== "UNPAID" && s.from.startsWith(today.slice(0, 4))).length, "this year")}</section>
    ${S.spF.new && S.canEdit ? `<section class="card"><div class="card-head"><h2>Declare a work suspension</h2></div><form id="sp-form" class="stack" style="gap:12px" data-keep><div class="form-grid">
      <div class="field"><label for="sp-from">From <span class="req">*</span></label><input class="input" type="date" id="sp-from" value="${today}" required></div><div class="field"><label for="sp-to">To</label><input class="input" type="date" id="sp-to" value="${today}"></div>
      <div class="field"><label for="sp-time">Starting</label><select class="input" id="sp-time">${opts([["", "Whole day"], ["12:00", "From noon"], ["15:00", "From 3 PM"]], "")}</select></div>
      <div class="field"><label for="sp-unit">Who</label><select class="input" id="sp-unit">${opts(unitOpts(), "", "Everyone")}</select></div>
      <div class="field"><label for="sp-why">Reason</label><select class="input" id="sp-why">${opts(SP_WHY.map((v) => [v, v]), SP_WHY[0])}</select></div>
      <div class="field"><label for="sp-pay">Pay</label><select class="input" id="sp-pay">${opts([["UNPAID", "No work, no pay"], ["PAID", "Paid by the company"]], "UNPAID")}</select></div></div>
      <div class="field"><label for="sp-note">Advisory or remarks</label><input class="input" id="sp-note" placeholder="e.g. PAGASA Signal No. 3, Cebu City EO 25"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-sp-new>Cancel</button><button class="btn btn-primary">Declare</button></div></form></section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Who</th><th>Reason</th><th>Pay</th><th class="num">Employees</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${all.map((s) => `<tr><td style="white-space:nowrap">${fmtDate(s.from)}${s.to && s.to !== s.from ? ` to ${fmtDate(s.to)}` : ""}${s.time ? `<div class="t-muted" style="font-size:12px">from ${esc(s.time)}</div>` : ""}</td><td>${esc(unitLabel(s.unit))}</td><td>${esc(s.reason)}${s.note ? `<div class="t-muted" style="font-size:12px">${esc(s.note)}</div>` : ""}</td><td><span class="chip ${s.pay === "UNPAID" ? "c-gray" : "c-ok"}">${s.pay === "UNPAID" ? "No work, no pay" : "Paid"}</span></td><td class="num">${cnt(s)}</td>${S.canEdit ? `<td class="num"><button class="link danger" data-sp-del="${s.id}">Remove</button></td>` : ""}</tr>`).join("") || '<tr><td colspan="6" class="empty">No work suspensions declared.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Under DOLE rules, a work suspension is generally no work, no pay unless company policy or a CBA pays it; monthly-paid employees are usually still paid. Employees who report anyway are paid as usual. Suspended days are not counted as absences in the time records when the company pays them.</p></section>`;
};
document.addEventListener("click", async (ev) => { const t = ev.target.closest("[data-sp-new],[data-sp-del]"); if (!t) return; ev.stopImmediatePropagation();
  if (t.dataset.spNew !== undefined) { S.spF.new = !S.spF.new; render(); return; }
  if (!await askConfirm("Remove this work suspension?")) return; await S.db.doc(`suspend/${t.dataset.spDel}`).delete(); S.susps.delete(t.dataset.spDel); S.ver++; logActivity("Removed a work suspension"); render(); }, true);
window.addEventListener("submit", async (ev) => { const f = ev.target; if (f.id !== "sp-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const from = $("#sp-from").value; const to = $("#sp-to").value || from; if (!from || to < from) { toast("Check the dates."); return; }
  try { await saveRec("suspend", uid(), { from, to, time: $("#sp-time").value || null, unit: $("#sp-unit").value || null, reason: $("#sp-why").value, pay: $("#sp-pay").value, note: $("#sp-note").value.trim() || null, by: S.myId || null, at: todayISO() });
    logActivity(`Declared a work suspension on ${fmtDate(from)}`); S.spF.new = false; toast("Work suspension declared."); render(); } catch { toast("Couldn't save. Try again."); } }, true);
