/* ---------- Payroll > Wage increases (history with remarks, wage orders) and Reimbursements (paid tax-free through payroll) ---------- */
Object.assign(S, { reimbs: new Map(), wiF: { tab: "history", q: "", y: "", unit: "", emp: "" }, wiEdit: null, wo: { unit: "", pt: "DAILY", mode: "MIN", amt: "", eff: "", ref: "", note: "" }, rbF: { st: "PENDING", q: "" } });
Object.assign(TCOLS, { reimb: "reimbs" });
{
  const g = NAV.find(([, it]) => it.some(([v]) => v === "payroll"));
  if (g) { const it = g[1]; const i = it.findIndex(([v]) => v === "finalpays"); it.splice(i >= 0 ? i + 1 : it.length, 0, ["wageinc", "Wage increases", "chart"], ["reimb", "Reimbursements", "receipt"]); }
  Object.assign(SECTION_OF, { wageinc: "wageinc", reimb: "reimb" });
  const j = ESS_NAV.findIndex(([v]) => v === "esshr"); ESS_NAV.splice(j >= 0 ? j + 1 : ESS_NAV.length, 0, ["essreimb", "Reimbursements", "receipt"]);
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("reimb").limit(5000).onSnapshot((snap) => { S.reimbs = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }

/* ---------- wage increase history: salary increments, personnel actions that changed pay, and wage orders ---------- */
function wiAll() {
  const out = [];
  for (const r of listOf(S.salincs)) { const e = S.emps.get(r.empId) || S.allEmps?.get(r.empId); if (!e || r.status !== "APPROVED") continue;
    out.push({ key: `si:${r.id}`, src: "salinc", rec: r, e, d: r.effective, from: Number(r.from) || 0, to: Number(r.to) || 0, kind: r.kind === "WAGE_ORDER" ? "Wage order" : SI_KIND.find((k) => k[0] === r.kind)?.[1] || "Increase", why: r.reason || "", remarks: r.remarks || "", ref: r.ref || "", applied: !!r.applied }); }
  for (const r of listOf(S.pafs || new Map())) { const e = S.emps.get(r.empId); if (!e || r.status !== "APPROVED" || r.to?.basicPay == null) continue;
    out.push({ key: `pf:${r.id}`, src: "paf", rec: r, e, d: r.effective, from: Number(r.from?.basicPay) || 0, to: Number(r.to.basicPay), kind: pfType(r.type), why: r.reason || "", remarks: r.remarks || "", ref: "", applied: !!r.applied }); }
  return out.sort((a, b) => (b.d || "").localeCompare(a.d || ""));
}
const wiPct = (x) => x.from ? ((x.to - x.from) / x.from) * 100 : 0;
const wiMonthly = (x) => (x.to - x.from) * (x.e.payType === "DAILY" ? 26 : 1);
const wiRemarks = (x) => S.canEdit && S.wiEdit === x.key ? `<form id="wi-note" data-key="${esc(x.key)}" style="display:flex;gap:6px;min-width:220px" data-keep><input class="input" id="wi-note-t" value="${esc(x.remarks)}" aria-label="Remarks" style="flex:1"><button class="btn btn-primary btn-sm">Save</button></form>`
  : `${x.remarks ? `<span style="font-size:13px">${esc(x.remarks)}</span>` : '<span class="t-muted" style="font-size:13px">—</span>'}${S.canEdit ? ` <button class="link" data-wi-edit="${esc(x.key)}">${x.remarks ? "Edit" : "Add"}</button>` : ""}`;
VIEWS.wageinc = () => {
  const F = S.wiF; const W = S.wo; const q = F.q.toLowerCase(); const all = wiAll(); const y = todayISO().slice(0, 4);
  const list = all.filter((x) => (!F.y || (x.d || "").startsWith(F.y)) && (!F.unit || inUnit(x.e, F.unit)) && (!F.emp || x.e.id === F.emp) && (!q || `${fullName(x.e)} ${x.e.no} ${x.kind} ${x.why} ${x.remarks} ${x.ref}`.toLowerCase().includes(q)));
  const yr = all.filter((x) => (x.d || "").startsWith(y)); const years = [...new Set(all.map((x) => (x.d || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const tabs = stTabs(F.tab, "wi-tab", [["history", "History"], ["emp", "By employee"], ...(S.canEdit ? [["order", "Wage order"]] : [])]);
  let body = "";
  if (F.tab === "emp") { const e = S.emps.get(F.emp); const mine = e ? all.filter((x) => x.e.id === e.id).sort((a, b) => (a.d || "").localeCompare(b.d || "")) : [];
    body = `<section class="card"><div class="field" style="max-width:360px;margin-bottom:12px"><label for="wi-emp">Employee</label>${empSel("wi-emp", F.emp)}</div>
      ${e ? `<p style="margin:0 0 10px;font-size:14px">Hired ${fmtDate(e.hire)} · now <b>${esc(payLabel(e.basicPay, e.payType))}</b>${mine.length ? ` · started at ${esc(payLabel(mine[0].from, e.payType))}, up ${(((e.basicPay - mine[0].from) / (mine[0].from || 1)) * 100).toFixed(1)}%` : ""}</p>
        <ol class="wi-time">${mine.length ? mine.map((x) => `<li><span class="wi-d">${fmtDate(x.d)}</span><div><b>${esc(x.kind)}</b> ${money(x.from)} → <b>${money(x.to)}</b> <span class="chip ${x.to >= x.from ? "c-ok" : "c-bad"}">${x.to >= x.from ? "+" : ""}${wiPct(x).toFixed(1)}%</span>${x.why ? `<div class="t-muted" style="font-size:13px">Reason: ${esc(x.why)}</div>` : ""}<div>Remarks: ${wiRemarks(x)}</div></div></li>`).join("") : '<li class="t-muted">No pay changes recorded yet.</li>'}</ol>` : '<p class="t-muted" style="margin:0">Choose an employee to see every pay change with remarks.</p>'}</section>`; }
  else if (F.tab === "order" && S.canEdit) { const cand = active().filter((e) => (!W.unit || inUnit(e, W.unit)) && (!W.pt || e.payType === W.pt)); const amt = Number(W.amt) || 0;
    const newOf = (e) => W.mode === "MIN" ? Math.max(e.basicPay, amt) : W.mode === "ADD" ? e.basicPay + amt : PAY.r2(e.basicPay * (1 + amt / 100)); const hit = amt ? cand.filter((e) => newOf(e) > e.basicPay) : [];
    const cost = PAY.r2(hit.reduce((a, e) => a + (newOf(e) - e.basicPay) * (e.payType === "DAILY" ? 26 : 1), 0));
    body = `<section class="card"><div class="card-head"><h2>Apply a wage order or across-the-board increase</h2></div>
      <form id="wo-form" class="stack" style="gap:12px" data-keep><div class="form-grid">
        <div class="field"><label for="wo-unit">Who</label><select class="input" id="wo-unit">${opts(unitOpts(), W.unit, "Everyone")}</select></div>
        <div class="field"><label for="wo-pt">Pay type</label><select class="input" id="wo-pt">${opts([["DAILY", "Daily-paid"], ["MONTHLY", "Monthly-paid"], ["", "Both"]], W.pt)}</select></div>
        <div class="field"><label for="wo-mode">Increase</label><select class="input" id="wo-mode">${opts([["MIN", "Raise to a new minimum"], ["ADD", "Add a fixed amount"], ["PCT", "Add a percentage"]], W.mode)}</select></div>
        <div class="field"><label for="wo-amt">${W.mode === "MIN" ? "New minimum rate" : W.mode === "ADD" ? "Amount to add" : "Percent to add"} <span class="req">*</span></label><input class="input" type="number" min="0" step="0.01" id="wo-amt" value="${esc(W.amt)}" required></div>
        <div class="field"><label for="wo-eff">Effective <span class="req">*</span></label><input class="input" type="date" id="wo-eff" value="${esc(W.eff || todayISO())}" required></div>
        <div class="field"><label for="wo-ref">Wage order no.</label><input class="input" id="wo-ref" value="${esc(W.ref)}" placeholder="e.g. RB VII-25"></div></div>
        <div class="field"><label for="wo-note">Remarks</label><input class="input" id="wo-note" value="${esc(W.note)}" placeholder="e.g. Cebu new minimum wage, published Sep 2026"></div>
        <div class="panel" style="font-size:14px">${amt ? `<b>${hit.length}</b> of ${cand.length} employees get a raise. Added cost about <b>${peso.format(cost)}</b> a month (daily rates × 26).` : `${cand.length} employees match. Enter the amount to preview.`}</div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" ${hit.length ? "" : "disabled"}>Apply to ${hit.length} employees</button></div></form>
      ${hit.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Employee</th><th class="num">Now</th><th class="num">New</th></tr></thead><tbody>${hit.slice(0, 50).map((e) => `<tr><td>${empCell(e)}</td><td class="num">${money(e.basicPay)}</td><td class="num"><b>${money(newOf(e))}</b></td></tr>`).join("")}</tbody></table></div>${hit.length > 50 ? `<p class="t-muted" style="font-size:13px">and ${hit.length - 50} more</p>` : ""}` : ""}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Each raise is saved as an approved salary increment and changes the basic pay on the effective date. Update the regional minimum wage under Settings so payroll checks use the new rate.</p></section>`; }
  else body = `<section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><input class="input" type="search" id="wi-q" value="${esc(F.q)}" placeholder="Search name, reason or remarks" aria-label="Search" style="flex:1;min-width:180px">
      <select class="input" id="wi-y" style="width:auto" aria-label="Year">${opts(years.map((v) => [v, v]), F.y, "All years")}</select><select class="input" id="wi-unit" style="width:auto" aria-label="Department or project">${opts(unitOpts(), F.unit, "Everyone")}</select><button class="btn btn-ghost" data-wi-csv>${icon("download")}Download</button></div>
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Effective</th><th>Kind</th><th class="num">From</th><th class="num">To</th><th class="num">Increase</th><th>Reason</th><th>Remarks</th></tr></thead><tbody>
      ${list.slice(0, 300).map((x) => `<tr><td>${empCell(x.e)}</td><td style="white-space:nowrap">${fmtDate(x.d)}${x.applied ? "" : '<div class="t-muted" style="font-size:12px">not yet in effect</div>'}</td><td>${esc(x.kind)}${x.ref ? `<div class="t-muted" style="font-size:12px">${esc(x.ref)}</div>` : ""}</td><td class="num">${money(x.from)}</td><td class="num"><b>${money(x.to)}</b></td><td class="num">${wiPct(x).toFixed(1)}%</td><td style="font-size:13px;max-width:200px">${esc(x.why)}</td><td>${wiRemarks(x)}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">No wage increases yet.</td></tr>'}</tbody></table></div></section>`;
  return head("Every salary and wage increase, with reasons and remarks", "Wage increases", S.canEdit ? `<button class="btn btn-gold" data-go="salinc">${icon("plus")}New salary increment</button>` : "") + `
    <section class="stats">${dxTile(`Increases in ${y}`, yr.length, `${new Set(yr.map((x) => x.e.id)).size} employees`)}${dxTile("Average increase", yr.length ? `${(yr.reduce((a, x) => a + wiPct(x), 0) / yr.length).toFixed(1)}%` : "—", `in ${y}`)}${dxTile("Added monthly cost", peso.format(PAY.r2(yr.reduce((a, x) => a + wiMonthly(x), 0))), `${y}, daily rates × 26`)}${dxTile("Waiting for approval", listOf(S.salincs).filter((r) => r.status === "PENDING").length, "salary increments", "t-warn")}</section>
    <section class="card">${tabs}</section>${body}`;
};

/* ---------- reimbursements ---------- */
const RB_CAT = [["TRANSPO", "Transportation"], ["FUEL", "Fuel and toll"], ["MEALS", "Meals (business)"], ["LODGING", "Lodging and travel"], ["PHONE", "Phone and internet load"], ["SUPPLIES", "Supplies and materials"], ["MEDICAL", "Medical (company policy)"], ["TRAINING", "Training and permits"], ["OTHER", "Other"]];
const RB_ST = { PENDING: ["Waiting for approval", "c-warn"], APPROVED: ["Approved, to be paid", "c-blue"], PAID: ["Paid", "c-ok"], REJECTED: ["Rejected", "c-bad"] };
const rbCat = (k) => RB_CAT.find((c) => c[0] === k)?.[1] || "Expense";
/* Approved reimbursements ride on the payroll as a tax-free item (they repay a business expense; they are not pay). */
function rbOf(l) { return PAY.r2((l?.flex || []).filter((id) => String(id).startsWith("rb:")).reduce((a, id) => a + (Number(S.reimbs.get(id.slice(3))?.amt) || 0), 0)); }
{ const b = payExt; payExt = (pid) => { const x = b(pid); const ff = x.flexFor; return { ...x, flexFor: (e, p) => [...(ff ? ff(e, p) : []), ...listOf(S.reimbs).filter((r) => r.empId === e.id && r.payVia !== "CASH" && r.payPid === pid && ["APPROVED", "PAID"].includes(r.status)).map((r) => ({ id: `rb:${r.id}`, amt: Number(r.amt) || 0, tax: "EXEMPT" }))] }; }; }
{ const b = recordFlexPaid; recordFlexPaid = async (pid, lines) => { await b(pid, lines); for (const r of listOf(S.reimbs)) if (r.payPid === pid && r.status === "APPROVED" && r.payVia !== "CASH") await saveRec("reimb", r.id, { ...r, status: "PAID", paid: PAY.period(pid).end }); }; }
{ const b = undoFlexPaid; undoFlexPaid = async (pid) => { await b(pid); for (const r of listOf(S.reimbs)) if (r.payPid === pid && r.status === "PAID" && r.payVia !== "CASH") await saveRec("reimb", r.id, { ...r, status: "APPROVED", paid: null }); }; }
const nextOpenPid = () => { let id = curPeriod(); for (let i = 0; i < 6 && isFinal(id); i++) id = PAY.shiftPeriod(id, 1); return id; };
function rbForm(e, idp) {
  return `<form id="${idp}" class="panel stack" style="gap:10px" data-rb-emp="${e.id}" data-keep><div class="form-grid">
    <div class="field"><label for="${idp}-cat">Expense</label><select class="input" id="${idp}-cat">${opts(RB_CAT, "TRANSPO")}</select></div>
    <div class="field"><label for="${idp}-date">Date spent <span class="req">*</span></label><input class="input" type="date" id="${idp}-date" value="${todayISO()}" required></div>
    <div class="field"><label for="${idp}-amt">Amount <span class="req">*</span></label><input class="input" type="number" min="1" step="0.01" id="${idp}-amt" required></div>
    <div class="field"><label for="${idp}-proj">Charge to</label><select class="input" id="${idp}-proj">${opts([["", "Head Office"], ...listOf(S.projects).filter((p) => p.status !== "COMPLETED").map((p) => [p.id, p.name])], e.projectId || "")}</select></div></div>
    <div class="field"><label for="${idp}-desc">What it was for <span class="req">*</span></label><input class="input" id="${idp}-desc" required maxlength="300" placeholder="e.g. Grab to BIR Cebu to file 1601-C"></div>
    <div class="field"><label for="${idp}-file">Receipt</label><input class="input" type="file" id="${idp}-file" accept="image/*,application/pdf"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-emp-new="">Cancel</button><button class="btn btn-primary">Submit for approval</button></div></form>`;
}
const rbRow = (r, staff) => { const e = empOf(r); const st = RB_ST[r.status] || RB_ST.PENDING;
  return `<tr>${staff ? `<td>${empCell(e)}</td>` : ""}<td style="white-space:nowrap">${fmtDate(r.date)}</td><td>${esc(rbCat(r.cat))}<div class="t-muted" style="font-size:12px;max-width:240px">${esc(r.desc || "")}</div>${r.remarks ? `<div style="font-size:12px">HR: ${esc(r.remarks)}</div>` : ""}</td><td>${r.receipt ? `<a href="/_blob/${esc(r.receipt.id)}" target="_blank" rel="noopener">${esc(r.receipt.name || "Receipt")}</a>` : '<span class="t-warn" style="font-size:13px">No receipt</span>'}</td>
    <td class="num"><b>${money(r.amt)}</b></td><td><span class="chip ${st[1]}">${st[0]}</span>${r.status === "APPROVED" || r.status === "PAID" ? `<div class="t-muted" style="font-size:12px">${r.payVia === "CASH" ? "Cash" : `Payroll ${esc(PAY.period(r.payPid).label)}`}${r.paid ? `, ${fmtDate(r.paid)}` : ""}</div>` : ""}</td>
    ${staff && S.canEdit ? `<td class="num" style="white-space:nowrap">${r.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-rb-set="${r.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-rb-set="${r.id}:REJECTED">Reject</button>` : r.status === "APPROVED" && r.payVia === "CASH" ? `<button class="btn btn-ghost btn-sm" data-rb-set="${r.id}:PAID">Mark paid</button>` : ""}</td>` : staff ? "<td></td>" : ""}</tr>`; };
VIEWS.reimb = () => {
  const F = S.rbF; const q = F.q.toLowerCase(); const all = listOf(S.reimbs).filter((r) => empOf(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const fe = S.emps.get(S.empFor); const y = todayISO().slice(0, 4);
  const list = all.filter((r) => (!F.st || r.status === F.st) && (!q || `${fullName(empOf(r))} ${empOf(r).no} ${r.desc} ${rbCat(r.cat)}`.toLowerCase().includes(q))); const sum = (a) => peso.format(PAY.r2(a.reduce((s, r) => s + (Number(r.amt) || 0), 0)));
  const pend = all.filter((r) => r.status === "PENDING"); const appr = all.filter((r) => r.status === "APPROVED"); const paidY = all.filter((r) => r.status === "PAID" && (r.paid || "").startsWith(y));
  return head("Business expenses employees paid for, approved and paid back tax-free", "Reimbursements") + `
    <section class="stats">${dxTile("Waiting for approval", pend.length, sum(pend), "t-warn")}${dxTile("Approved, to be paid", appr.length, sum(appr))}${dxTile(`Paid in ${y}`, paidY.length, sum(paidY), "t-ok")}${dxTile("Without a receipt", all.filter((r) => r.status === "PENDING" && !r.receipt).length, "waiting for approval")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "rb-st", [["PENDING", "Waiting"], ["APPROVED", "To be paid"], ["PAID", "Paid"], ["REJECTED", "Rejected"], ["", "All"]])}<input class="input" type="search" id="rb-q" value="${esc(F.q)}" placeholder="Search" aria-label="Search reimbursements" style="flex:1;min-width:150px">${forPicker("reimb", "New reimbursement")}</section>
    ${S.empNew === "reimb" && fe ? `<section class="card"><div class="card-head"><h2>Reimbursement for ${esc(fullName(fe))}</h2></div>${rbForm(fe, "rb-form")}</section>` : ""}
    ${S.canEdit && pend.length ? `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><div class="field"><label for="rb-pay">Approvals are paid</label><select class="input" id="rb-pay">${opts([["PAYROLL", `In payroll ${PAY.period(nextOpenPid()).label}`], ["CASH", "In cash or bank transfer"]], S.rbPay || "PAYROLL")}</select></div><div class="field" style="flex:1;min-width:200px"><label for="rb-rem">Remarks for approvals and rejections</label><input class="input" id="rb-rem" placeholder="Optional"></div></section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Date</th><th>Expense</th><th>Receipt</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice(0, 300).map((r) => rbRow(r, true)).join("") || '<tr><td colspan="7" class="empty">No reimbursements here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Reimbursements paid through payroll show on the payslip as a tax-free line and are not counted as pay. Keep official receipts under the company's name for the expense to be deductible.</p></section>`;
};
ESS.essreimb = (e) => { const mine = listOf(S.reimbs).filter((r) => r.empId === e.id).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  return head("Get back what you spent for work", "Reimbursements", S.realEdit ? `<button class="btn btn-gold" data-emp-new="essreimb">${icon("plus")}New reimbursement</button>` : "") + `
    ${S.empNew === "essreimb" && S.realEdit ? `<section class="card"><div class="card-head"><h2>New reimbursement</h2></div>${rbForm(e, "rbe-form")}</section>` : ""}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Expense</th><th>Receipt</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${mine.map((r) => rbRow(r, false)).join("") || '<tr><td colspan="5" class="empty">Nothing filed yet.</td></tr>'}</tbody></table></div></section>`; };

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-wi-tab],[data-wi-edit],[data-wi-csv],[data-rb-st],[data-rb-set]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.wiTab) { S.wiF.tab = d.wiTab; render(); return; }
  if (d.wiEdit) { S.wiEdit = d.wiEdit; render(); $("#wi-note-t")?.focus(); return; }
  if (d.rbSt !== undefined) { S.rbF.st = d.rbSt; render(); return; }
  if (d.wiCsv !== undefined) { if (!S.downloads) { toast("Downloads aren't available in this view."); return; }
    const csv = toCSV([["Employee No", "Name", "Effective", "Kind", "Reference", "From", "To", "Increase %", "Reason", "Remarks"], ...wiAll().map((x) => [x.e.no, fullName(x.e), x.d, x.kind, x.ref, x.from, x.to, wiPct(x).toFixed(2), x.why, x.remarks])]);
    try { await S.downloads.save({ filename: "wage-increases.csv", data: new Blob([csv], { type: "text/csv" }) }); } catch { toast("The download was cancelled."); } return; }
  if (d.rbSet) { const [id, st] = d.rbSet.split(":"); const r = S.reimbs.get(id); if (!r) return; const via = $("#rb-pay")?.value || r.payVia || "PAYROLL"; const rem = $("#rb-rem")?.value.trim() || r.remarks || null;
    try { await saveRec("reimb", id, { ...r, status: st, remarks: rem, decided: todayISO(), decidedBy: S.myId || null, ...(st === "APPROVED" ? { payVia: via, payPid: via === "CASH" ? null : nextOpenPid() } : {}), ...(st === "PAID" ? { paid: todayISO() } : {}) });
      logActivity(`${st === "APPROVED" ? "Approved" : st === "PAID" ? "Paid" : "Rejected"} a ${money(r.amt)} reimbursement of ${fullName(empOf(r))}`); toast(st === "APPROVED" ? (via === "CASH" ? "Approved. Mark it paid once released." : `Approved. It's paid in the ${PAY.period(nextOpenPid()).label} payroll.`) : st === "PAID" ? "Marked paid." : "Rejected."); render(); } catch { toast("Couldn't save. Try again."); } }
}, true);
document.addEventListener("change", (ev) => { const t = ev.target; const F = S.wiF;
  if (t.id === "wi-y") { F.y = t.value; render(); } if (t.id === "wi-unit") { F.unit = t.value; render(); } if (t.id === "wi-emp") { F.emp = t.value; render(); } if (t.id === "rb-pay") S.rbPay = t.value;
  if (t.id?.startsWith("wo-") && t.id !== "wo-note" && t.id !== "wo-ref") { S.wo[t.id.slice(3)] = t.value; render(); } if (t.id === "wo-note" || t.id === "wo-ref") S.wo[t.id.slice(3)] = t.value; });
document.addEventListener("input", (ev) => { const t = ev.target; if (t.id !== "wi-q" && t.id !== "rb-q") return; (t.id === "wi-q" ? S.wiF : S.rbF).q = t.value; const p0 = t.selectionStart; const id = t.id; render(); const i = document.getElementById(id); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["wi-note", "wo-form", "rb-form", "rbe-form"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.realEdit) return; const btn = f.querySelector("button.btn-primary");
  try {
    if (f.id === "wi-note") { const [src, id] = f.dataset.key.split(":"); const col = src === "si" ? "salinc" : "paf"; const m = src === "si" ? S.salincs : S.pafs; const r = m.get(id); if (!r) return;
      await saveRec(col, id, { ...r, remarks: $("#wi-note-t").value.trim() || null }); S.wiEdit = null; toast("Remarks saved."); render(); return; }
    if (f.id === "wo-form") { const W = S.wo; for (const k of ["unit", "pt", "mode", "amt", "eff", "ref", "note"]) W[k] = $("#wo-" + k).value.trim(); const amt = Number(W.amt) || 0; if (!amt || !W.eff) { toast("Enter the amount and the effective date."); return; }
      const newOf = (e) => PAY.r2(W.mode === "MIN" ? Math.max(e.basicPay, amt) : W.mode === "ADD" ? e.basicPay + amt : e.basicPay * (1 + amt / 100));
      const hit = active().filter((e) => (!W.unit || inUnit(e, W.unit)) && (!W.pt || e.payType === W.pt) && newOf(e) > e.basicPay); if (!hit.length || !await askConfirm(`Raise the pay of ${hit.length} employees effective ${fmtDate(W.eff)}?`)) return;
      if (btn) btn.disabled = true; for (const e of hit) await saveRec("salinc", uid(), { empId: e.id, kind: "WAGE_ORDER", from: e.basicPay, to: newOf(e), payType: e.payType, effective: W.eff, reason: W.ref ? `Wage order ${W.ref}` : "Across-the-board increase", ref: W.ref || null, remarks: W.note || null, status: "APPROVED", filed: todayISO(), decided: { d: todayISO(), by: S.myId || null } });
      await applyDueIncrements(); logActivity(`Applied a wage increase to ${hit.length} employees`); toast(`Saved for ${hit.length} employees.`); Object.assign(W, { amt: "", ref: "", note: "" }); S.wiF.tab = "history"; render(); return; }
    const e = S.emps.get(f.dataset.rbEmp); const p = f.id; const amt = PAY.r2(Number($(`#${p}-amt`).value) || 0); const desc = $(`#${p}-desc`).value.trim(); if (!amt || !desc) { toast("Enter the amount and what it was for."); return; }
    if (btn) btn.disabled = true; let receipt = null; const file = $(`#${p}-file`).files?.[0];
    if (file) { if (!S.assets) { toast("Uploads aren't available in this view."); if (btn) btn.disabled = false; return; } const u = await S.assets.upload(file); receipt = { id: u.id, name: file.name.slice(0, 120) }; }
    await saveRec("reimb", uid(), { empId: e.id, cat: $(`#${p}-cat`).value, date: $(`#${p}-date`).value || todayISO(), amt, desc, projectId: $(`#${p}-proj`).value || null, receipt, status: "PENDING", filed: new Date().toISOString(), by: S.myId || null });
    logActivity(`Filed a ${money(amt)} reimbursement for ${fullName(e)}`); S.empNew = null; toast("Sent for approval."); render();
  } catch { toast("Couldn't save. Try again."); if (btn) btn.disabled = false; }
}, true);
