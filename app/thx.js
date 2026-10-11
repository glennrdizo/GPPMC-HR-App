/* ---------- 13th month pay worksheet (PD 851) and final pay register ---------- */
Object.assign(S, { t13: new Map(), t13F: { y: todayISO().slice(0, 4), q: "", unit: "", st: "", page: 1, open: null }, fpF: { st: "OPEN", q: "" }, fpCalc: { emp: "", last: "", reason: "Resignation", cause: "REDUNDANCY" } });
{
  const g = NAV.find(([, it]) => it.some(([v]) => v === "payroll"));
  if (g) { const it = g[1]; const i = it.findIndex(([v]) => v === "payslips"); it.splice((i >= 0 ? i : it.findIndex(([v]) => v === "payroll")) + 1, 0, ["t13", "13th month pay", "gift"], ["finalpays", "Final pay", "wallet"]); }
  Object.assign(SECTION_OF, { t13: "t13", finalpays: "finalpays" });
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("t13").limit(20).onSnapshot((snap) => { S.t13 = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {}); }; }
const T13_SRC = { final: ["Final payroll", "c-ok"], draft: ["Draft payroll", "c-blue"], est: ["Estimated", "c-warn"], proj: ["Projected", "c-gray"] };
const t13Rec = (e, y) => S.t13.get(String(y))?.emps?.[e.id] || {};
const t13Paid = (e, y) => PAY.r2((t13Rec(e, y).pays || []).reduce((a, p) => a + (Number(p.amt) || 0), 0));
const t13Memo = new Map(); let t13MemoVer = -1;
/* 13th month = total basic pay actually earned in the calendar year ÷ 12. Basic pay is the regular pay on each payslip: basic, paid holidays and paid leave, less unpaid absences and lates.
   Overtime, night differential, holiday premiums and allowances are left out. Commissions count when they are part of the wage. Cutoffs not yet in a final payroll come from the draft payroll (the time records and calendar). */
function t13Of(e, y, upTo) {
  y = String(y); if (t13MemoVer !== S.ver) { t13Memo.clear(); t13MemoVer = S.ver; }
  const key = `${e.id}:${y}:${upTo || ""}`; if (t13Memo.has(key)) return t13Memo.get(key);
  const end = upTo || (e.separated?.date?.startsWith(y) ? e.separated.date : `${y}-12-31`); const today = todayISO(); const rows = [];
  let basic = 0, comm = 0, ben = 0;
  for (const id of yearPeriods(y)) {
    const p = PAY.period(id); if (p.start > end || e.hire > p.end || (e.separated?.date && e.separated.date < p.start)) continue;
    if (isFinal(id)) ensureRun(id); const r = payrun(id); const l = r.lines[e.id]; if (!l) continue;
    let part = 1; if (p.end > end) { const s = e.hire > p.start ? e.hire : p.start; const t = e.separated?.date && e.separated.date < p.end ? e.separated.date : p.end; part = Math.max(0, Math.min(1, (daysBetween(s, end) + 1) / (daysBetween(s, t) + 1))); }
    const b = PAY.r2(regularPay(l) * part); const c = e.comm13 === false ? 0 : PAY.r2((l.comm || 0) * part);
    const src = r.final ? "final" : p.start > today ? "proj" : S.periods.has(id) ? "draft" : "est";
    rows.push({ id, label: p.label, src, basic: b, comm: c, absent: PAY.r2(((l.absent || 0) + (l.tardy || 0)) * part) }); basic += b; comm += c; ben += (l.flexB || 0) * part;
  }
  const rec = t13Rec(e, y); const adj = Number(rec.adj) || 0; const paid = t13Paid(e, y); const cap = SET().exempt13;
  const t13 = PAY.r2(Math.max(0, basic + adj + comm) / 12); const exempt = Math.min(t13 + ben, cap);
  const out = { e, y, end, rows, basic: PAY.r2(basic), comm: PAY.r2(comm), adj, adjNote: rec.adjNote || "", ben: PAY.r2(ben), t13, paid, bal: PAY.r2(t13 - paid), pays: rec.pays || [], taxable: PAY.r2(Math.max(0, t13 + ben - exempt)), est: rows.some((r) => r.src === "est"), proj: rows.some((r) => r.src === "proj" || r.src === "draft") };
  t13Memo.set(key, out); return out;
}
/* Regular pay for the cutoff the last day falls in, cut at the last day (an estimate when the last salary is paid with the final pay). */
function lastSalary(e, last) {
  const id = PAY.periodOf(last); const p = PAY.period(id); const l = payrun(id).lines[e.id]; if (!l) return 0;
  const s = e.hire > p.start ? e.hire : p.start; const t = e.separated?.date && e.separated.date < p.end ? e.separated.date : p.end; if (last < s) return 0;
  return PAY.r2((regularPay(l) + premOf(l)) * Math.min(1, (daysBetween(s, last) + 1) / (daysBetween(s, t) + 1)));
}
const t13Status = (x) => x.t13 <= 0 ? ["Nothing due", "c-gray"] : x.paid <= 0 ? ["Not released", "c-warn"] : x.bal > 0.5 ? ["Partly released", "c-blue"] : x.bal < -0.5 ? ["Overpaid", "c-bad"] : ["Released", "c-ok"];
const t13Emps = (y) => [...(S.allEmps || S.emps).values()].filter((e) => !e.sample || S.emps.has(e.id)).filter((e) => inYear(e, y));
thirteenthRows = (year) => t13Emps(String(year)).map((e) => { const x = t13Of(e, year); const ys = `${year}-01-01`; const from = e.hire > ys ? e.hire : ys;
  return { e, months: PAY.r2(Math.max(0, daysBetween(from, x.end) + 1) / 365 * 12), monthly: PAY.r2(e.payType === "DAILY" ? (e.basicPay * SET().factor) / 12 : e.basicPay), paid: x.basic, comm: x.comm, est: x.t13 }; });
async function saveT13(y, empId, patch) { const doc = S.t13.get(String(y)) || { emps: {} }; const emps = { ...(doc.emps || {}), [empId]: { ...(doc.emps?.[empId] || {}), ...patch } };
  const next = { ...doc, emps, year: String(y) }; await S.db.doc(`t13/${y}`).set(JSON.parse(JSON.stringify(next))); S.t13.set(String(y), next); S.ver++; }

function t13Body() {
  const F = S.t13F; const y = F.y; const q = F.q.toLowerCase();
  const all = t13Emps(y).map((e) => t13Of(e, y)); const tot = (k) => PAY.r2(all.reduce((a, x) => a + x[k], 0));
  const list = all.filter((x) => (!F.unit || inUnit(x.e, F.unit)) && (!q || `${fullName(x.e)} ${x.e.no}`.toLowerCase().includes(q)) && (!F.st || t13Status(x)[0] === F.st)).sort((a, b) => fullName(a.e).localeCompare(fullName(b.e)));
  const open = F.open ? all.find((x) => x.e.id === F.open) : null; const over = all.filter((x) => x.taxable > 0); const estN = all.filter((x) => x.est).length;
  const years = [...new Set([String(Number(todayISO().slice(0, 4)) - 1), todayISO().slice(0, 4), ...S.t13.keys()])].sort().reverse();
  const pages = Math.max(1, Math.ceil(list.length / 50)); F.page = Math.min(F.page, pages);
  return `<section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><div class="field"><label for="t13-y">Year</label><select class="input" id="t13-y">${opts(years.map((v) => [v, v]), y)}</select></div>
      <div class="field" style="flex:1;min-width:160px"><label for="t13-q">Search</label><input class="input" type="search" id="t13-q" value="${esc(F.q)}" placeholder="Name or employee no."></div>
      <div class="field"><label for="t13-unit">Department or project</label><select class="input" id="t13-unit">${opts(unitOpts(), F.unit, "Everyone")}</select></div>
      <div class="field"><label for="t13-st">Status</label><select class="input" id="t13-st">${opts([["", "All"], ...["Not released", "Partly released", "Released", "Overpaid", "Nothing due"].map((s) => [s, s])], F.st)}</select></div>
      <button class="btn btn-ghost" data-t13x="csv">${icon("download")}Download</button><button class="btn btn-ghost" data-t13x="slips">${icon("file")}All 13th month slips</button></section>
    <section class="stats">${dxTile(`13th month pay, ${y}`, peso.format(tot("t13")), `${all.filter((x) => x.t13 > 0).length} employees`)}${dxTile("Released", peso.format(tot("paid")), `${all.filter((x) => x.paid > 0).length} employees`, "t-ok")}${dxTile("Still to release", peso.format(PAY.r2(all.reduce((a, x) => a + Math.max(0, x.bal), 0))), `due on or before Dec 24, ${y}`, "t-warn")}${dxTile("Above the ₱" + n2.format(SET().exempt13).replace(".00", "") + " tax-free cap", over.length, over.length ? `${money(over.reduce((a, x) => a + x.taxable, 0))} taxable` : "no one")}</section>
    ${estN ? `<div class="notice"><span><span class="chip c-warn">Estimated</span> ${estN} employees have cutoffs before payroll was run in this app. Those are estimated from the calendar. Enter the difference from your old payroll as an adjustment on each worksheet, or import it.</span></div>` : ""}
    ${open ? t13Sheet(open) : ""}
    <section class="card"><div class="card-head"><h2>Employees (${list.length})</h2>${S.canEdit ? `<form id="t13-bulk" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end" data-keep><div class="field"><label for="t13-bd">Release date</label><input class="input" type="date" id="t13-bd" value="${todayISO()}"></div><div class="field"><label for="t13-bk">Amount</label><select class="input" id="t13-bk">${opts([["BAL", "Full balance"], ["HALF", "Half (mid-year release)"]], "BAL")}</select></div><button class="btn btn-primary">Record release for the ${list.filter((x) => x.bal > 0.5).length} listed</button></form>` : ""}</div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Basic pay earned</th><th class="num">Commissions</th><th class="num">Adjustment</th><th class="num">13th month (÷ 12)</th><th class="num">Released</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
      ${list.slice((F.page - 1) * 50, F.page * 50).map((x) => { const st = t13Status(x); return `<tr class="go" data-t13-open="${x.e.id}" tabindex="0"><td>${empCell(x.e)}${x.e.separated ? ' <span class="chip c-bad">Separated</span>' : ""}</td><td class="num">${money(x.basic)}${x.est ? ' <span class="t-warn" title="Includes estimated cutoffs">*</span>' : ""}</td><td class="num">${x.comm ? money(x.comm) : '<span class="t-muted">—</span>'}</td><td class="num">${x.adj ? money(x.adj) : '<span class="t-muted">—</span>'}</td><td class="num"><b>${money(x.t13)}</b></td><td class="num">${money(x.paid)}</td><td class="num">${money(x.bal)}</td><td><span class="chip ${st[1]}">${st[0]}</span></td></tr>`; }).join("") || '<tr><td colspan="8" class="empty">No employees match.</td></tr>'}
      </tbody></table></div>${pagerN(F, list.length, "t13-pg", 50)}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">13th month pay is one twelfth of the basic pay actually earned from January to December (PD 851). Basic pay includes paid leave and regular holidays and leaves out unpaid absences and lates, overtime, night differential, holiday premiums and allowances. Rank-and-file employees who worked at least one month are covered. Pay it on or before December 24.</p></section>`;
}
function t13Sheet(x) {
  const e = x.e; const st = t13Status(x); const ed = S.canEdit;
  return `<section class="card ak-thread" id="t13-sheet"><div class="card-head"><h2>13th month worksheet: ${esc(fullName(e))}</h2><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-t13x="slip:${e.id}">${icon("file")}13th month slip</button><button class="link" data-t13-open="">Close</button></span></div>
    <p style="margin:0 0 10px;font-size:14px"><span class="chip ${st[1]}">${st[0]}</span> <span class="t-muted">${esc(e.no)} · hired ${fmtDate(e.hire)}${e.separated ? ` · separated ${fmtDate(e.separated.date)}` : ""} · ${e.payType === "DAILY" ? `daily rate ${money(e.basicPay)}` : `monthly rate ${money(e.basicPay)}`}</span></p>
    <div class="table-wrap"><table><thead><tr><th>Cutoff</th><th>Source</th><th class="num">Absences and lates</th><th class="num">Basic pay earned</th><th class="num">Commissions</th></tr></thead><tbody>
      ${x.rows.map((r) => `<tr><td>${esc(r.label)}</td><td><span class="chip ${T13_SRC[r.src][1]}">${T13_SRC[r.src][0]}</span></td><td class="num">${r.absent ? "(" + money(r.absent) + ")" : '<span class="t-muted">—</span>'}</td><td class="num">${money(r.basic)}</td><td class="num">${r.comm ? money(r.comm) : '<span class="t-muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>
    <div class="table-wrap" style="margin-top:12px"><table class="t13-calc"><tbody>
      <tr><td>Basic pay earned in ${x.y}</td><td class="num">${money(x.basic)}</td></tr>${x.comm ? `<tr><td>Commissions that are part of the wage</td><td class="num">${money(x.comm)}</td></tr>` : ""}${x.adj ? `<tr><td>Adjustment${x.adjNote ? `: ${esc(x.adjNote)}` : ""}</td><td class="num">${x.adj < 0 ? "(" + money(-x.adj) + ")" : money(x.adj)}</td></tr>` : ""}
      <tr><td><b>Total</b></td><td class="num"><b>${money(x.basic + x.comm + x.adj)}</b></td></tr><tr><td><b>13th month pay</b> (total ÷ 12)</td><td class="num"><b>${money(x.t13)}</b></td></tr>
      ${x.pays.map((p, i) => `<tr><td>Released ${fmtDate(p.d)}${p.note ? ` · ${esc(p.note)}` : ""}${ed ? ` <button class="link danger" data-t13-delpay="${e.id}:${i}">Remove</button>` : ""}</td><td class="num">(${money(p.amt)})</td></tr>`).join("")}
      <tr><td><b>${x.bal < 0 ? "Overpaid" : "Balance to release"}</b></td><td class="num"><b style="font-size:18px">${money(Math.abs(x.bal))}</b></td></tr></tbody></table></div>
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">${x.taxable > 0 ? `<b class="t-warn">${money(x.taxable)} is taxable</b>: 13th month and other benefits (${money(x.ben)} FlexBen) above ₱${n2.format(SET().exempt13)} a year. It is taxed in the year-end annualization.` : `Tax-free: 13th month and other benefits stay within ₱${n2.format(SET().exempt13)} a year.`}${x.proj ? " Cutoffs not yet final are projected from the draft payroll, so the amount can still change." : ""}${e.separated ? " For a separated employee, the balance is part of the final pay." : ""}</p>
    ${ed ? `<div class="two" style="margin-top:12px"><form id="t13-pay" class="panel stack" style="gap:8px" data-t13-emp="${e.id}" data-keep><b>Record a release</b><div class="form-grid"><div class="field"><label for="t13-pd">Date</label><input class="input" type="date" id="t13-pd" value="${todayISO()}" required></div><div class="field"><label for="t13-pa">Amount</label><input class="input" type="number" step="0.01" min="0" id="t13-pa" value="${Math.max(0, x.bal).toFixed(2)}" required></div></div><div class="field"><label for="t13-pn">Note</label><input class="input" id="t13-pn" placeholder="e.g. First half, May payroll"></div><button class="btn btn-primary">Record release</button></form>
      <form id="t13-adj" class="panel stack" style="gap:8px" data-t13-emp="${e.id}" data-keep><b>Adjust basic pay earned</b><div class="field"><label for="t13-aa">Amount to add (use minus to deduct)</label><input class="input" type="number" step="0.01" id="t13-aa" value="${x.adj || ""}" placeholder="0"></div><div class="field"><label for="t13-an">Reason</label><input class="input" id="t13-an" value="${esc(x.adjNote)}" placeholder="e.g. Jan to Sep basic from old payroll"></div><button class="btn btn-ghost">Save adjustment</button></form></div>` : ""}</section>`;
}
VIEWS.t13 = () => head("Worked out from basic pay earned, due on or before December 24", "13th month pay") + t13Body();
thirteenth = () => t13Body();
function t13Slip(x) { const e = x.e; const r = (k, v) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`;
  return `<div class="slip"><h2>13TH MONTH PAY ${x.y}</h2><p><b>${esc(fullName(e))}</b> · ${esc(e.no)} · ${esc(pos(e.posId)?.title || "")}</p><table><tbody>${r(`Basic pay earned, ${fmtDate(x.rows[0]?.id ? PAY.period(x.rows[0].id).start : `${x.y}-01-01`)} to ${fmtDate(x.end)}`, money(x.basic))}${x.comm ? r("Commissions", money(x.comm)) : ""}${x.adj ? r(`Adjustment${x.adjNote ? ": " + esc(x.adjNote) : ""}`, money(x.adj)) : ""}${r("<b>13th month pay (total ÷ 12)</b>", `<b>${money(x.t13)}</b>`)}${x.pays.map((p) => r(`Released ${fmtDate(p.d)}${p.note ? " · " + esc(p.note) : ""}`, `(${money(p.amt)})`)).join("")}${r("<b>Balance</b>", `<b>${money(x.bal)}</b>`)}</tbody></table>
    <p style="font-size:13px;color:#5A6478">${x.taxable > 0 ? `${money(x.taxable)} is above the ₱${n2.format(SET().exempt13)} tax-free cap and is taxed in the year-end annualization.` : "Tax-free under the ₱" + n2.format(SET().exempt13) + " cap."}</p><p style="margin-top:30px">Received by: ______________________ Date: __________</p></div>`; }

/* ---------- final pay register and calculator ---------- */
VIEWS.finalpays = () => {
  const F = S.fpF; const today = todayISO(); const q = F.q.toLowerCase();
  const all = [...S.offb.values()].map((o) => ({ o, e: (S.allEmps || S.emps).get(o.empId) })).filter((x) => x.e).map((x) => ({ ...x, f: finalPay(x.e, x.o), due: addDays(x.o.last, 30) }));
  const list = all.filter((x) => (F.st === "OPEN" ? !x.o.released : F.st === "DONE" ? !!x.o.released : true) && (!q || `${fullName(x.e)} ${x.e.no}`.toLowerCase().includes(q))).sort((a, b) => a.due.localeCompare(b.due));
  const toRel = all.filter((x) => !x.o.released); const late = toRel.filter((x) => x.e.separated && x.due < today);
  const C = S.fpCalc; const ce = S.emps.get(C.emp); let calc = "";
  if (ce && C.last) { const o = { empId: ce.id, last: C.last, reason: C.reason, cause: C.cause, pay: {} }; const f = finalPay(ce, o); const r = (k, v, neg) => v ? `<tr><td>${k}</td><td class="num">${neg ? "(" + money(v) + ")" : money(v)}</td></tr>` : "";
    calc = `<div class="table-wrap" style="margin-top:12px"><table><tbody>${r(`13th month pay for ${C.last.slice(0, 4)} (basic pay earned to the last day ÷ 12${f.paid13 ? `, less ${money(f.paid13)} released` : ""})`, f.t13)}${r(`Unused leave converted (${f.convDays} days at ${money(f.daily)} a day)`, f.leave)}${r(`${sepLabel(o)}`, f.sep)}<tr><td><b>Total earnings</b></td><td class="num"><b>${money(f.gross)}</b></td></tr>${f.taxAdj >= 0.5 ? r("Tax refund from annualization", f.taxAdj) : r("Tax still due from annualization", f.taxAdj <= -0.5 ? -f.taxAdj : 0, true)}${f.loanItems.filter((x) => x.on).map((x) => r(`Loan balance: ${esc(x.label)}`, x.bal, true)).join("")}
      <tr><td><b>Estimated final pay</b></td><td class="num"><b style="font-size:20px">${peso.format(f.net)}</b></td></tr></tbody></table></div><p class="t-muted" style="font-size:13px;margin:8px 0 0">${esc(f.sepNote)}. ${f.yrsExact} years of service; a fraction of at least six months counts as a whole year. Salary up to the last day goes through the regular payroll. Unreturned property and other deductions are added when offboarding starts.</p>`; }
  return head("Last pay of employees who leave, released within 30 days of the last day", "Final pay") + `
    <section class="stats">${dxTile("To release", toRel.length, peso.format(PAY.r2(toRel.reduce((a, x) => a + Math.max(0, x.f.net), 0))), "t-warn")}${dxTile("Overdue", late.length, "past 30 days from the last day", late.length ? "t-bad" : "t-muted")}${dxTile("Released this year", all.filter((x) => (x.o.released || "").startsWith(today.slice(0, 4))).length, peso.format(PAY.r2(all.filter((x) => (x.o.released || "").startsWith(today.slice(0, 4))).reduce((a, x) => a + Math.max(0, x.f.net), 0))), "t-ok")}</section>
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${stTabs(F.st, "fp-st", [["OPEN", `To release (${toRel.length})`], ["DONE", "Released"], ["", "All"]])}<input class="input" type="search" id="fp-q" value="${esc(F.q)}" placeholder="Search" aria-label="Search final pay" style="flex:1;min-width:160px"></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Reason</th><th>Last day</th><th>Release by</th><th class="num">13th month</th><th class="num">Leave</th><th class="num">Separation</th><th class="num">Tax</th><th class="num">Deductions</th><th class="num">Net final pay</th><th>Status</th></tr></thead><tbody>
      ${list.map(({ o, e, f, due }) => { const st = offStatus(o); return `<tr class="go" data-offb="${e.id}" tabindex="0"><td>${empCell(e)}</td><td>${esc(o.reason)}</td><td style="white-space:nowrap">${fmtDate(o.last)}</td><td style="white-space:nowrap" class="${!o.released && e.separated && due < today ? "t-bad" : ""}">${o.released ? `<span class="t-muted">released ${fmtDate(o.released)}</span>` : fmtDate(due)}</td><td class="num">${money(f.t13)}</td><td class="num">${money(f.leave)}</td><td class="num">${money(f.sep)}</td><td class="num">${f.taxAdj < 0 ? "(" + money(-f.taxAdj) + ")" : money(f.taxAdj)}</td><td class="num">${money(f.acct + f.ded + f.loanDed)}</td><td class="num"><b>${f.net < 0 ? "(" + money(-f.net) + ")" : money(f.net)}</b></td><td><span class="chip ${st[1]}">${st[0]}</span></td></tr>`; }).join("") || '<tr><td colspan="11" class="empty">No final pay here. Start offboarding from an employee\'s profile.</td></tr>'}
      </tbody></table></div></section>
    <div class="two"><section class="card"><div class="card-head"><h2>Final pay calculator</h2></div><p class="t-muted" style="margin:0 0 10px;font-size:14px">Estimate the last pay of anyone before they leave. Nothing is saved.</p>
      <div class="form-grid"><div class="field"><label for="fpc-emp">Employee</label><select class="input" id="fpc-emp">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), C.emp, "Choose employee…")}</select></div>
        <div class="field"><label for="fpc-last">Last day</label><input class="input" type="date" id="fpc-last" value="${esc(C.last)}"></div>
        <div class="field"><label for="fpc-reason">Reason</label><select class="input" id="fpc-reason">${opts(SEP_REASONS.map((r) => [r, r]), C.reason)}</select></div>
        ${C.reason === "Termination for authorized cause" ? `<div class="field"><label for="fpc-cause">Cause</label><select class="input" id="fpc-cause">${opts(CAUSES, C.cause)}</select></div>` : ""}</div>${calc}</section>
      <section class="card"><div class="card-head"><h2>What goes into final pay</h2></div><ol class="fp-how">
        <li><b>Salary</b> up to the last day, through the regular payroll.</li><li><b>13th month pay</b>: basic pay earned from January to the last day ÷ 12, less any part already released.</li>
        <li><b>Unused leave</b>: the 5-day service incentive leave, or more if company policy converts it, at the daily rate.</li><li><b>Separation pay</b>: authorized causes only. Redundancy gets 1 month per year; retrenchment, closure or disease gets half a month per year (at least 1 month). <b>Retirement pay</b> at 60 with 5 years is 22.5 days per year (RA 7641).</li>
        <li><b>Tax refund or tax due</b> from annualizing the year's tax to the last day, with the BIR 2316.</li><li><b>Less</b> loan balances, unreturned property and other amounts the employee agreed in writing to deduct.</li></ol>
        <p class="t-muted" style="font-size:13px;margin:8px 0 0">Release within 30 days of the last day and issue the Certificate of Employment within 3 days of the request (DOLE Labor Advisory 06-2020).</p></section></div>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-t13-open],[data-t13x],[data-t13-delpay],[data-t13-pg],[data-fp-st]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset; const F = S.t13F;
  if (d.t13Open !== undefined) { F.open = d.t13Open || null; render(); if (F.open) document.getElementById("t13-sheet")?.scrollIntoView({ block: "start" }); return; }
  if (d.t13Pg) { F.page = Math.max(1, F.page + Number(d.t13Pg)); render(); return; }
  if (d.fpSt !== undefined) { S.fpF.st = d.fpSt; render(); return; }
  if (d.t13Delpay) { const [id, i] = d.t13Delpay.split(":"); const e = S.emps.get(id) || S.allEmps?.get(id); if (!e || !await askConfirm("Remove this release?")) return; const pays = [...(t13Rec(e, F.y).pays || [])]; pays.splice(Number(i), 1);
    try { await saveT13(F.y, id, { pays }); logActivity(`Removed a 13th month release of ${fullName(e)}`); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.t13x === "csv") { const rows = t13Emps(F.y).map((e) => t13Of(e, F.y)).sort((a, b) => fullName(a.e).localeCompare(fullName(b.e)));
    if (!S.downloads) { toast("Downloads aren't available in this view."); return; }
    const csv = toCSV([["Employee No", "Name", "Basic pay earned", "Commissions", "Adjustment", "13th month", "Released", "Balance", "Taxable above cap", "Status"], ...rows.map((x) => [x.e.no, fullName(x.e), x.basic, x.comm, x.adj, x.t13, x.paid, x.bal, x.taxable, t13Status(x)[0]])]);
    try { await S.downloads.save({ filename: `13th-month-${F.y}.csv`, data: new Blob([csv], { type: "text/csv" }) }); } catch { toast("The download was cancelled."); } return; }
  if (d.t13x === "slips") { const rows = t13Emps(F.y).map((e) => t13Of(e, F.y)).filter((x) => x.t13 > 0).sort((a, b) => fullName(a.e).localeCompare(fullName(b.e))); return saveLetter(`13th-month-slips-${F.y}.html`, `13th month ${F.y}`, rows.map(t13Slip).join("")); }
  if (d.t13x?.startsWith("slip:")) { const e = S.emps.get(d.t13x.slice(5)) || S.allEmps?.get(d.t13x.slice(5)); if (e) return saveLetter(`13th-month-${F.y}-${e.no}.html`, `13th month ${e.no}`, t13Slip(t13Of(e, F.y))); }
}, true);
document.addEventListener("change", (ev) => { const t = ev.target; const F = S.t13F;
  if (t.id === "t13-y") { F.y = t.value; F.open = null; F.page = 1; render(); } if (t.id === "t13-unit") { F.unit = t.value; F.page = 1; render(); } if (t.id === "t13-st") { F.st = t.value; F.page = 1; render(); }
  if (["fpc-emp", "fpc-last", "fpc-reason", "fpc-cause"].includes(t.id)) { const k = t.id.slice(4); S.fpCalc[k] = t.value; if (k === "emp" && !S.fpCalc.last) S.fpCalc.last = addDays(todayISO(), 30); render(); } });
document.addEventListener("input", (ev) => { const t = ev.target; if (t.id !== "t13-q" && t.id !== "fp-q") return; if (t.id === "t13-q") { S.t13F.q = t.value; S.t13F.page = 1; } else S.fpF.q = t.value;
  const p0 = t.selectionStart; const id = t.id; render(); const i = document.getElementById(id); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["t13-pay", "t13-adj", "t13-bulk"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return; const F = S.t13F;
  try {
    if (f.id === "t13-bulk") { const d = $("#t13-bd").value || todayISO(); const half = $("#t13-bk").value === "HALF"; const q = F.q.toLowerCase();
      const rows = t13Emps(F.y).map((e) => t13Of(e, F.y)).filter((x) => x.bal > 0.5 && (!F.unit || inUnit(x.e, F.unit)) && (!q || `${fullName(x.e)} ${x.e.no}`.toLowerCase().includes(q)) && (!F.st || t13Status(x)[0] === F.st));
      if (!rows.length) { toast("No one in the list has a balance."); return; } if (!await askConfirm(`Record a ${half ? "half" : "full balance"} 13th month release on ${fmtDate(d)} for ${rows.length} employees?`)) return;
      const doc = S.t13.get(String(F.y)) || { emps: {} }; const emps = { ...(doc.emps || {}) };
      for (const x of rows) { const amt = PAY.r2(half ? Math.min(x.bal, x.t13 / 2) : x.bal); emps[x.e.id] = { ...(emps[x.e.id] || {}), pays: [...(emps[x.e.id]?.pays || []), { d, amt, note: half ? "Half release" : "Full release", by: S.myId || null }] }; }
      const next = { ...doc, emps, year: String(F.y) }; await S.db.doc(`t13/${F.y}`).set(JSON.parse(JSON.stringify(next))); S.t13.set(String(F.y), next); S.ver++;
      logActivity(`Recorded 13th month release for ${rows.length} employees`); toast(`Release recorded for ${rows.length} employees.`); render(); return; }
    const id = f.dataset.t13Emp; const e = S.emps.get(id) || S.allEmps?.get(id); if (!e) return;
    if (f.id === "t13-pay") { const amt = PAY.r2(Number($("#t13-pa").value) || 0); if (amt <= 0) { toast("Enter the amount released."); return; }
      await saveT13(F.y, id, { pays: [...(t13Rec(e, F.y).pays || []), { d: $("#t13-pd").value || todayISO(), amt, note: $("#t13-pn").value.trim() || null, by: S.myId || null }] }); logActivity(`Recorded 13th month release of ${money(amt)} for ${fullName(e)}`); toast("Release recorded."); }
    else { await saveT13(F.y, id, { adj: Number($("#t13-aa").value) || 0, adjNote: $("#t13-an").value.trim() || null }); logActivity(`Adjusted 13th month basic pay of ${fullName(e)}`); toast("Adjustment saved."); }
    render();
  } catch { toast("Couldn't save. Try again."); }
}, true);
