/* ---------- leave: allocation requests, cancellation requests, balances by type, leave count ---------- */
Object.assign(S, { lvReqs: new Map(), lrNew: null, lrFor: "", lrSt: "PENDING", lcY: null, lrCancel: null });
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("leavereq").limit(3000).onSnapshot((snap) => { S.lvReqs = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }
const LR_ST = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved", "c-ok"], REJECTED: ["Rejected", "c-bad"], CANCELLED: ["Withdrawn", "c-gray"] };
const creditTypes = () => SET().leaveTypes.filter((t) => t.days != null && !/maternity|paternity|solo|vawc|violence|magna|special|gynec|without pay/i.test(t.name));
const extraCredits = (empId, year, code) => listOf(S.lvReqs).filter((r) => r.kind === "ALLOC" && r.status === "APPROVED" && r.empId === empId && r.year === year && (!code || r.type === code)).reduce((s, r) => s + (Number(r.days) || 0), 0);
{ const base = balances; balances = (e, year) => base(e, year).map((t) => { const x = t.days == null ? 0 : extraCredits(e.id, year, t.code); if (!x) return t; const days = t.days + x; return { ...t, days, extra: x, left: Math.max(0, days - t.used) }; }); }
const leaveById = (month, id) => { const l = S.leaveDocs.get(month)?.items?.[id]; return l ? { id, month, ...l } : null; };
const lvText = (l) => l ? `${leaveType(l.type)?.name || l.type}, ${fmtDate(l.from)}${l.to !== l.from ? ` to ${fmtDate(l.to)}` : ""} (${l.days} ${l.days === 1 ? "day" : "days"})` : "Leave no longer on file";
const lrText = (r) => r.kind === "ALLOC" ? `${r.days} extra ${r.days === 1 ? "day" : "days"} of ${(leaveType(r.type)?.name || r.type).toLowerCase()} for ${r.year}` : `Cancel ${lvText(leaveById(r.month, r.leaveId))}`;

function lrForm(e, kind) {
  if (kind === "ALLOC") return `<form id="lr-form" class="panel form-grid" style="align-items:end" data-kind="ALLOC" data-lr-emp="${e.id}" data-keep>
    <div class="field"><label for="lr-type">Leave type <span class="req">*</span></label><select class="input" id="lr-type">${opts(creditTypes().map((t) => [t.code, t.name]), "VL")}</select></div>
    <div class="field"><label for="lr-days">Extra days <span class="req">*</span></label><input class="input" id="lr-days" type="number" min="0.5" max="30" step="0.5" value="1" required></div>
    <div class="field"><label for="lr-year">For year</label><select class="input" id="lr-year">${opts([todayISO().slice(0, 4), String(Number(todayISO().slice(0, 4)) + 1)].map((y) => [y, y]), todayISO().slice(0, 4))}</select></div>
    <div class="field"><label for="lr-why">Reason <span class="req">*</span></label><input class="input" id="lr-why" required placeholder="e.g. Service award, carried-over credits"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-lr-new="">Cancel</button></div></form>`;
  const mine = allLeaves().filter((l) => l.empId === e.id && ["APPROVED", "PENDING"].includes(l.status) && l.to >= addDays(todayISO(), -30)).sort((a, b) => a.from.localeCompare(b.from));
  const taken = new Set(listOf(S.lvReqs).filter((r) => r.kind === "CANCEL" && r.status === "PENDING").map((r) => r.leaveId));
  const choices = mine.filter((l) => !taken.has(l.id));
  if (!choices.length) return `<p class="t-muted" style="font-size:14px">${esc(fullName(e))} has no approved or pending leave to cancel. <button type="button" class="link" data-lr-new="">Close</button></p>`;
  return `<form id="lr-form" class="panel form-grid" style="align-items:end" data-kind="CANCEL" data-lr-emp="${e.id}" data-keep>
    <div class="field" style="grid-column:span 2"><label for="lr-leave">Leave to cancel <span class="req">*</span></label><select class="input" id="lr-leave">${opts(choices.map((l) => [`${l.month}:${l.id}`, `${lvText(l)} · ${LSTATUS[l.status][0]}`]), S.lrCancel || "")}</select></div>
    <div class="field"><label for="lr-why">Reason <span class="req">*</span></label><input class="input" id="lr-why" required placeholder="e.g. Trip moved, reported for work"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary">Send for approval</button><button type="button" class="btn btn-ghost" data-lr-new="">Close</button></div></form>`;
}
const lrRow = (r, mgr) => { const e = S.emps.get(r.empId);
  return `<tr>${mgr ? `<td><div class="person" style="min-width:190px">${avatar(e, 32)}<span class="who"><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}">${esc(fullName(e))}</button><span class="sub">${esc(unitName(e))}</span></span></div></td>` : ""}
    <td>${esc(lrText(r))}</td><td class="t-muted" style="max-width:240px">${esc(r.reason || "")}</td><td class="t-muted" style="white-space:nowrap">${fmtDate(r.filed)}</td>
    <td><span class="chip ${LR_ST[r.status][1]}">${LR_ST[r.status][0]}</span>${r.decided ? `<div class="t-muted" style="font-size:12px">${fmtDate(r.decided.d)}</div>` : ""}</td>
    <td class="num" style="white-space:nowrap">${r.status === "PENDING" ? mgr && S.canEdit ? `<button class="btn btn-primary btn-sm" data-lr-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-lr-set="${r.id}:REJECTED">Reject</button>` : !mgr && S.realEdit ? `<button class="link danger" data-lr-set="${r.id}:CANCELLED">Withdraw</button>` : "" : ""}</td></tr>`; };

function lrTab(kind) {
  const all = listOf(S.lvReqs).filter((r) => r.kind === kind && S.emps.get(r.empId)); const list = all.filter((r) => !S.lrSt || r.status === S.lrSt).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  const intro = kind === "ALLOC" ? "Extra leave credits on top of the yearly allowance, such as service awards or carried-over days. Approved days are added to the employee's balance." : "Requests to cancel leave that was already filed. Approving one marks the leave Cancelled, so the days go back to the balance and payroll no longer counts them.";
  const fe = S.emps.get(S.lrFor);
  return `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="tabs" role="tablist">${[["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["", "All"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.lrSt === k}" data-lr-st="${k}">${l} ${k === "PENDING" ? `(${all.filter((r) => r.status === "PENDING").length})` : ""}</button>`).join("")}</div>
      ${S.canEdit ? `<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="lr-for" style="width:auto" aria-label="File for employee">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), S.lrFor, "File for…")}</select><button class="btn btn-ghost btn-sm" data-lr-new="${kind}">${kind === "ALLOC" ? "New allocation request" : "New cancellation request"}</button></span>` : ""}</section>
    ${S.lrNew === kind && fe ? `<section class="card"><div class="card-head"><h2>${kind === "ALLOC" ? "Extra credits" : "Cancel leave"} for ${esc(fullName(fe))}</h2></div>${lrForm(fe, kind)}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Request</th><th>Reason</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map((r) => lrRow(r, true)).join("") || '<tr><td colspan="6" class="empty">No requests here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">${intro}</p></section>`;
}

function lvBalances() {
  const year = todayISO().slice(0, 4); const f = S.balFilter; const types = creditTypes();
  const list = refilter(active(), f); const rows = list.slice((Math.max(1, f.page) - 1) * PAGE, Math.max(1, f.page) * PAGE);
  const tot = Object.fromEntries(types.map((t) => [t.code, { left: 0, used: 0 }]));
  for (const e of list) for (const b of balances(e, year)) if (tot[b.code]) { tot[b.code].left += b.left || 0; tot[b.code].used += b.used; }
  return `<section class="stats">${types.slice(0, 4).map((t) => dxTile(`${esc(t.name)} left, average`, list.length ? Math.round(tot[t.code].left / list.length * 10) / 10 : 0, `days per employee · ${PAY.r2(tot[t.code].used)} days used in ${year}`)).join("")}</section>
    <section class="card"><div class="card-head"><h2>Leave balance for ${year}</h2><button class="btn btn-ghost btn-sm" data-lvx="balances">Download balances (CSV)</button></div>
    ${filterBar(f, "bal")}
    <div class="table-wrap"><table><thead><tr><th>Employee</th>${types.map((t) => `<th class="num">${esc(t.name.replace(/ leave$/i, ""))}<div class="t-muted" style="font-weight:400;font-size:11px">left of credits</div></th>`).join("")}<th class="num">Without pay</th></tr></thead><tbody>
    ${rows.map((e) => { const b = Object.fromEntries(balances(e, year).map((x) => [x.code, x]));
      return `<tr class="go" data-emp="${e.id}" tabindex="0"><td><div class="person" style="min-width:200px">${avatar(e, 34)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${esc(e.no)}</span></span></div></td>
        ${types.map((t) => { const x = b[t.code]; return `<td class="num"><b>${x?.left ?? "—"}</b> <span class="t-muted">of ${x?.days ?? "—"}</span>${x?.extra ? `<div class="t-muted" style="font-size:11px">+${x.extra} extra</div>` : ""}</td>`; }).join("")}<td class="num">${b.LW?.used || 0}</td></tr>`; }).join("") || `<tr><td colspan="${types.length + 2}" class="empty">No employees found.</td></tr>`}
    </tbody></table></div>${pager(f, list.length, "bal")}</section>`;
}

function lvCount() {
  const ys = [...new Set(allLeaves().map((l) => yearOf(l.from)).concat(todayISO().slice(0, 4)))].sort().reverse(); const y = S.lcY || ys[0];
  const ls = allLeaves().filter((l) => yearOf(l.from) === y && S.emps.get(l.empId)); const ok = ls.filter((l) => l.status === "APPROVED");
  const sum = (xs) => PAY.r2(xs.reduce((s, l) => s + (l.days || 0), 0));
  const byType = SET().leaveTypes.map((t) => { const xs = ls.filter((l) => l.type === t.code); const a = xs.filter((l) => l.status === "APPROVED"); return [t, xs.length, sum(a), new Set(a.map((l) => l.empId)).size, xs.filter((l) => l.status === "PENDING").length, xs.filter((l) => ["REJECTED", "CANCELLED"].includes(l.status)).length]; }).filter((r) => r[1]);
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  const perM = months.map((m) => { const xs = ok.filter((l) => l.from.startsWith(m)); return [parseISO(m + "-01").toLocaleDateString("en-PH", { month: "short" }), sum(xs), `${monthLabel(m)}: ${sum(xs)} days, ${xs.length} requests`]; });
  const top = byType.slice().sort((a, b) => b[2] - a[2]).slice(0, 3).map((r) => r[0]);
  const depts = new Map(); for (const l of ok) { const k = deptName(S.emps.get(l.empId)); const d = depts.get(k) || { n: 0, days: 0, t: {} }; d.n++; d.days += l.days || 0; d.t[l.type] = (d.t[l.type] || 0) + (l.days || 0); depts.set(k, d); }
  const dl = [...depts.entries()].sort((a, b) => b[1].days - a[1].days);
  return `<section class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label for="lc-y" style="font-weight:600">Year</label><select class="input" id="lc-y" style="width:auto">${opts(ys.map((x) => [x, x]), y)}</select></section>
    <section class="stats">${dxTile("Leave requests", ls.length, `filed for ${y}`)}${dxTile("Approved days", sum(ok), `${ok.length} approved requests`, "t-ok")}${dxTile("Waiting", ls.filter((l) => l.status === "PENDING").length, "requests for a decision", "t-warn")}${dxTile("Cancelled or rejected", ls.filter((l) => ["REJECTED", "CANCELLED"].includes(l.status)).length, "requests")}</section>
    <section class="card"><div class="card-head"><h2>Approved leave days per month</h2><span class="t-muted" style="font-size:13px">${y}, by start date</span></div>${vbars(perM, { fmt: (n) => `${n} days`, label: `Approved leave days per month in ${y}` })}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>By leave type</h2></div><div class="table-wrap"><table><thead><tr><th>Leave type</th><th class="num">Requests</th><th class="num">Days approved</th><th class="num">People</th><th class="num">Waiting</th><th class="num">Not taken</th></tr></thead><tbody>
      ${byType.map(([t, n, d, p, w, x]) => `<tr><td>${esc(t.name)}</td><td class="num">${n}</td><td class="num"><b>${d}</b></td><td class="num">${p}</td><td class="num">${w}</td><td class="num">${x}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">No leave filed for this year.</td></tr>'}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>By department</h2><span class="t-muted" style="font-size:13px">Approved days</span></div><div class="table-wrap"><table><thead><tr><th>Department</th>${top.map((t) => `<th class="num">${esc(t.name.replace(/ leave$/i, ""))}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
      ${dl.map(([k, d]) => `<tr><td>${esc(k)}</td>${top.map((t) => `<td class="num">${PAY.r2(d.t[t.code] || 0)}</td>`).join("")}<td class="num"><b>${PAY.r2(d.days)}</b></td></tr>`).join("") || `<tr><td colspan="${top.length + 2}" class="empty">No approved leave yet.</td></tr>`}</tbody></table></div></section></div>`;
}

VIEWS.leave = () => {
  const tab = S.leaveTab || "requests"; const all = allLeaves();
  const pending = all.filter((l) => l.status === "PENDING").length; const np = (k) => listOf(S.lvReqs).filter((r) => r.kind === k && r.status === "PENDING" && S.emps.get(r.empId)).length;
  const tabs = [["requests", `Leave requests${pending ? ` (${pending})` : ""}`], ["alloc", `Allocation requests${np("ALLOC") ? ` (${np("ALLOC")})` : ""}`], ["cancel", `Cancellation requests${np("CANCEL") ? ` (${np("CANCEL")})` : ""}`], ["balances", "Leave balance"], ["count", "Leave count"], ["types", "Leave types"]];
  return head(`${pending + np("ALLOC") + np("CANCEL")} waiting for a decision`, "Leave", `<button class="btn btn-ghost" data-lvx="list">Download leave list (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="leaveForm">${icon("plus")}File leave</button>` : ""}`) + `
    <div class="tabs on-blue" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-leave-tab="${k}">${l}</button>`).join("")}</div>
    ${tab === "requests" ? leaveRequests(all) : tab === "alloc" ? lrTab("ALLOC") : tab === "cancel" ? lrTab("CANCEL") : tab === "balances" ? lvBalances() : tab === "count" ? lvCount() : leaveTypesCard()}`;
};

{ const base = ESS.essleave; ESS.essleave = (e) => {
  const mine = listOf(S.lvReqs).filter((r) => r.empId === e.id).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  const upcoming = allLeaves().filter((l) => l.empId === e.id && ["APPROVED", "PENDING"].includes(l.status) && l.to >= todayISO());
  return base(e) + `<section class="card"><div class="card-head"><h2>Allocation and cancellation requests</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ${S.lrNew === "ALLOC" ? "btn-primary" : "btn-ghost"} btn-sm" data-lr-new="ALLOC">Ask for extra credits</button><button class="btn ${S.lrNew === "CANCEL" ? "btn-primary" : "btn-ghost"} btn-sm" data-lr-new="CANCEL"${upcoming.length ? "" : " disabled"}>Cancel a leave</button></div>
    ${S.lrNew && S.realEdit ? `<div style="margin-top:12px">${lrForm(e, S.lrNew)}</div>` : '<p class="t-muted" style="margin:10px 0 0;font-size:14px">Ask HR for extra leave credits, or to cancel a leave you already filed. Each request needs HR approval.</p>'}
    ${mine.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Request</th><th>Reason</th><th>Filed</th><th>Status</th><th></th></tr></thead><tbody>${mine.map((r) => lrRow(r, false)).join("")}</tbody></table></div>` : ""}</section>`;
}; }

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-lr-new],[data-lr-st],[data-lr-set]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.lrSt !== undefined) { S.lrSt = d.lrSt; render(); return; }
  if (d.lrNew !== undefined) { if (d.lrNew && S.viewAs !== "emp" && !S.lrFor) { toast("Choose the employee first."); $("#lr-for")?.focus(); return; } S.lrNew = d.lrNew || null; render(); return; }
  if (!S.realEdit) return;
  try {
    const [id, st] = d.lrSet.split(":"); const r = S.lvReqs.get(id); const e = S.emps.get(r.empId);
    if (st === "APPROVED" && r.kind === "CANCEL") { const l = leaveById(r.month, r.leaveId);
      if (l && l.status !== "CANCELLED") { if (isFinal(PAY.periodOf(l.from)) && l.status === "APPROVED" && !await askConfirm("Payroll for that period is already final. Cancel the leave anyway? Fix the pay in the next payroll.")) return; await setLeaveStatus(r.month, r.leaveId, "CANCELLED"); } }
    const nr = { ...r, status: st, decided: { d: todayISO(), by: S.myId || null } };
    await S.db.doc(`leavereq/${id}`).set(JSON.parse(JSON.stringify((({ id: _, ...x }) => x)(nr)))); S.lvReqs.set(id, nr); S.ver++;
    logActivity(`${LR_ST[st][0]} ${r.kind === "ALLOC" ? "leave allocation" : "leave cancellation"} request for ${fullName(e)}`);
    toast(st === "APPROVED" ? (r.kind === "ALLOC" ? "Approved. Credits added to the balance." : "Approved. The leave is cancelled.") : `Request ${LR_ST[st][0].toLowerCase()}.`); render();
  } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("change", (ev) => { const id = ev.target.id;
  if (id === "lr-for") { S.lrFor = ev.target.value; render(); } else if (id === "lc-y") { S.lcY = ev.target.value; render(); } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "lr-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return;
  const e = S.emps.get(f.dataset.lrEmp); const kind = f.dataset.kind; const why = $("#lr-why").value.trim(); if (!why) { toast("Give the reason."); return; }
  const r = { empId: e.id, kind, reason: why, status: "PENDING", filed: todayISO(), by: S.myId || null };
  if (kind === "ALLOC") { r.type = $("#lr-type").value; r.days = Number($("#lr-days").value); r.year = $("#lr-year").value; if (!(r.days > 0)) { toast("Enter the number of days."); return; } }
  else { const [m, lid] = ($("#lr-leave").value || "").split(":"); if (!lid) { toast("Choose the leave."); return; } r.month = m; r.leaveId = lid; }
  try { const id = uid(); await S.db.doc(`leavereq/${id}`).set(JSON.parse(JSON.stringify(r))); S.lvReqs.set(id, { id, ...r }); S.lrNew = null; S.ver++;
    logActivity(`Filed a leave ${kind === "ALLOC" ? "allocation" : "cancellation"} request for ${fullName(e)}`); toast("Sent for approval."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
