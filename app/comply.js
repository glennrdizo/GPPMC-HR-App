/* ---------- compliance: loans, tax and BIR, 201 files, movements, safety, punches and alerts ---------- */
Object.assign(S, {
  loans: new Map(), osh: new Map(), f201: {}, yearsLoaded: new Set(), yearsLoading: new Set(), punchPreview: null,
  taxYear: null, taxTab: "annual", compTab: "alerts", loanFilter: { q: "", type: "", status: "ACTIVE", page: 1 }, f201Filter: { q: "", show: "missing", page: 1 }, taxFilter: { q: "", page: 1 },
});
Object.assign(TCOLS, { loans: "loans", osh: "osh" });
Object.assign(ICON, {
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2l-1 1-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  hardhat: '<path d="M2 18h20v2H2z"/><path d="M4 18v-3a8 8 0 0 1 16 0v3"/><path d="M10 7V4h4v3"/>',
});
const premOf = (l) => l.ot + l.rd + l.rhw + l.sh + l.nd + (l.xp || 0);
const allowOf = (l) => l.adj + l.adjN + (l.allowN || 0) + (l.allowT || 0) + (l.comm || 0) + flexOf(l);
const flexOf = (l) => (l.flexN || 0) + (l.flexE || 0) + (l.flexB || 0) + (l.flexT || 0);

function bootComply(db) {
  db.doc("org/f201").onSnapshot((d) => { S.f201 = d.exists ? d.data().items || {} : {}; refresh(); }, () => {});
  for (const [col, n] of [["loans", 1500], ["osh", 1000]])
    db.collection(col).limit(n).onSnapshot((snap) => { S[TCOLS[col]] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
}
async function clearComplySample() {
  const keep = Object.fromEntries(Object.entries(S.f201).filter(([id]) => !S.emps.get(id)?.sample));
  if (Object.keys(keep).length !== Object.keys(S.f201).length) await S.db.doc("org/f201").set({ items: keep });
}

/* ---------- regional minimum wage and allowances (shown on the pay rules page) ---------- */
const REGIONS = ["NCR", "CAR", "Region I", "Region II", "Region III", "Region IV-A", "Region IV-B", "Region V", "Region VI", "Region VII", "Region VIII", "Region IX", "Region X", "Region XI", "Region XII", "Region XIII", "BARMM"];
function wageFor(e) {
  const Sx = SET(); const region = S.projects.get(e.projectId)?.region || S.org?.region || "NCR";
  const w = Number((Sx.regionWages || []).find((x) => x.region === region)?.wage); if (w) return w;
  // The general minimum wage stands for the company's own region only; elsewhere an unknown wage means nobody is treated as a minimum wage earner.
  return region === (S.org?.region || "NCR") ? Sx.minWage : 0;
}
function wageCard() {
  const Sx = SET(); const ed = S.canEdit; const used = new Set([...S.projects.values()].map((p) => p.region).filter(Boolean));
  return `<section class="card"><div class="card-head"><h2>Minimum wage by region</h2><span class="t-muted" style="font-size:13px;max-width:60ch">Each project uses the wage of its region (set on the project). Head office uses ${esc(S.org?.region || "NCR")}. Regions without a figure use the default above.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Region</th><th class="num">Daily minimum wage</th><th>Used by</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
    ${(Sx.regionWages || []).map((w) => `<tr><td><b>${esc(w.region)}</b></td><td class="num">${money(w.wage)}</td><td class="t-muted">${[...S.projects.values()].filter((p) => p.region === w.region).map((p) => esc(p.name)).join(", ") || (w.region === (S.org?.region || "NCR") ? "Head office" : "—")}</td>${ed ? `<td class="num"><button class="link danger" data-del-wage="${esc(w.region)}">Remove</button></td>` : ""}</tr>`).join("")}
    </tbody></table></div>
    ${[...used].filter((r) => !(Sx.regionWages || []).some((w) => w.region === r)).length ? `<p class="t-warn" style="font-size:14px;margin:10px 0 0">No wage entered yet for ${[...used].filter((r) => !(Sx.regionWages || []).some((w) => w.region === r)).map(esc).join(", ")}. Enter it from the latest regional wage order.</p>` : ""}
    ${ed ? `<form id="wage-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px" data-keep>
      <div class="field"><label for="w-region">Region</label><select class="input" id="w-region">${opts(REGIONS.map((r) => [r, r]), [...used].find((r) => !(Sx.regionWages || []).some((w) => w.region === r)) || "NCR")}</select></div>
      <div class="field"><label for="w-wage">Daily wage (PHP)</label><input class="input" id="w-wage" type="number" min="0" step="0.01" required></div>
      <button class="btn btn-ghost">Save wage</button></form>` : ""}</section>`;
}
function allowCard() {
  const Sx = SET();
  return `<section class="card"><div class="card-head"><h2>Allowances and de minimis caps</h2><span class="t-muted" style="font-size:13px;max-width:60ch">Set each person's recurring allowances on their 201 file. Amounts up to the cap are tax-free; anything above is taxed. Caps follow RR 4-2025; check them when BIR issues new rules.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Recurring allowance</th><th class="num">Tax-free cap</th><th>Per</th><th class="num">People</th></tr></thead><tbody>
    ${Sx.allowTypes.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td class="num">${t.cap ? money(t.cap) : '<span class="t-muted">Taxable</span>'}</td><td>${t.cap ? esc(t.per) : ""}</td><td class="num">${active().filter((e) => (e.allow || []).some((a) => a.code === t.code && a.amt > 0)).length}</td></tr>`).join("")}
    </tbody></table></div>
    <h3 style="font-size:15px;margin:16px 0 6px">One-time de minimis benefits</h3>
    <p class="t-muted" style="margin:0 0 8px;font-size:14px">Enter these in the time sheet's non-taxable column when paid. Amounts above the cap go to the ₱${n2.format(Sx.exempt13).replace(".00", "")} yearly exemption for 13th month and other benefits.</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7">${Sx.deMinOnce.map((t) => `<li>${esc(t.name)}: ${t.cap ? `up to ${peso.format(t.cap)} a ${esc(t.per)}` : esc(t.per)}</li>`).join("")}</ul></section>`;
}

/* ---------- leave requirements (checked when leave is filed) ---------- */
const LEAVE_RULES = {
  ML: { text: "SSS maternity notification filed and proof of pregnancy or delivery. 105 days with full pay, 120 for solo parents; up to 7 days can be passed to the father.", docs: true },
  PL: { text: "Married employee, for the first four deliveries of his lawful wife. Marriage contract and the child's birth certificate or medical certificate.", docs: true, married: true },
  SP: { text: "Valid Solo Parent ID and at least 6 months of service.", docs: true, months: 6 },
  VW: { text: "Barangay protection order, court protection order, or a certification that the case is pending. Available from the first day of work.", docs: true },
  SW: { text: "At least 6 months of service in the last 12 months and a medical certificate for gynecological surgery. Up to 2 months with full pay.", docs: true, months: 6 },
};
function leaveRuleError(e, d) {
  const r = LEAVE_RULES[d.type]; if (!r) return null; const t = leaveType(d.type);
  if (r.months && addMonths(e.hire, r.months) > d.from) return `${t.name} needs at least ${r.months} months of service. ${fullName(e)} reaches that on ${fmtDate(addMonths(e.hire, r.months))}.`;
  if (r.married && e.civil && e.civil !== "Married") return "Paternity leave is for married employees. Update the civil status on the 201 file if it has changed.";
  if (r.docs && !d.docsOk) return "Tick the box once the supporting documents are on file.";
  return null;
}

/* ---------- loans ---------- */
const LTYPE = Object.fromEntries(PAY.LOAN_TYPES);
const LORDER = PAY.LOAN_TYPES.map(([k]) => k);
const isGovLoan = (ln) => /^(SSS|HDMF)/.test(ln.type);
const LSTAT = { ACTIVE: ["Active", "c-ok"], HOLD: ["On hold", "c-warn"], PAID: ["Paid", "c-blue"], CLOSED: ["Closed", "c-gray"] };
const loanPaid = (ln, except) => Object.entries(ln.payments || {}).reduce((a, [pid, v]) => a + (pid === except ? 0 : v), 0) + (ln.paidBefore || 0);
const loanBal = (ln, except) => PAY.r2(Math.max(0, (ln.principal || 0) - loanPaid(ln, except)));
const loanLabel = (id) => { const ln = S.loans.get(id); return ln ? `${LTYPE[ln.type] || "Loan"}${ln.ref ? " " + ln.ref : ""}` : "Loan"; };
function payExt(pid) {
  return {
    minWageFor: wageFor,
    loansFor: (e) => listOf(S.loans).filter((ln) => ln.empId === e.id && ln.status === "ACTIVE" && ln.start <= pid)
      .sort((a, b) => LORDER.indexOf(a.type) - LORDER.indexOf(b.type) || (a.start || "").localeCompare(b.start || ""))
      .map((ln) => ({ id: ln.id, amort: ln.amort || 0, balance: loanBal(ln, pid) })).filter((x) => x.balance > 0),
    flexFor: flexFor(pid),
  };
}
async function recordLoanPayments(pid, lines) {
  for (const l of Object.values(lines)) for (const [lid, amt] of Object.entries(l.loans || {})) {
    const ln = S.loans.get(lid); if (!ln) continue;
    const n = { ...ln, payments: { ...(ln.payments || {}), [pid]: amt } };
    if (loanBal(n) <= 0) { n.status = "PAID"; n.paidOff = PAY.period(pid).end; }
    await put("loans", n);
  }
}
async function undoLoanPayments(pid) {
  for (const ln of listOf(S.loans)) if (ln.payments?.[pid] != null) {
    const payments = { ...ln.payments }; delete payments[pid];
    await put("loans", { ...ln, payments, status: ln.status === "PAID" ? "ACTIVE" : ln.status, paidOff: ln.status === "PAID" ? null : ln.paidOff || null });
  }
}
VIEWS.loans = () => {
  const f = S.loanFilter; const all = listOf(S.loans).filter((ln) => S.emps.get(ln.empId)); const q = f.q.trim().toLowerCase();
  const list = all.filter((ln) => (!f.type || ln.type === f.type) && (!f.status || ln.status === f.status) && (!q || `${empName(ln.empId)} ${S.emps.get(ln.empId).no} ${ln.ref || ""}`.toLowerCase().includes(q)))
    .sort((a, b) => empName(a.empId).localeCompare(empName(b.empId)));
  const act = all.filter((ln) => ln.status === "ACTIVE"); const bal = PAY.r2(act.reduce((a, ln) => a + loanBal(ln), 0));
  const run = payrun(curPeriod()); const thisCut = run.totals.loanTot || 0;
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(f.page, pages); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return head("Taken off net pay every cutoff", "Loans &amp; Deductions", `<button class="btn btn-ghost" data-cmx="loans">Download loans (CSV)</button><button class="btn btn-ghost" data-cmx="loanremit">Loan remittance list (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="loanForm">${icon("plus")}New loan</button>` : ""}`) + `
    <section class="stats">
      <div class="card stat"><span class="label">Active loans</span><span class="value">${act.length}</span><span class="note t-muted">${act.filter(isGovLoan).length} government, ${act.length - act.filter(isGovLoan).length} company</span></div>
      <div class="card stat"><span class="label">Outstanding balance</span><span class="value" style="font-size:28px">${peso.format(bal)}</span><span class="note t-muted">still to be deducted</span></div>
      <div class="card stat"><span class="label">This cutoff</span><span class="value" style="font-size:28px">${peso.format(thisCut)}</span><span class="note t-muted">${esc(PAY.period(curPeriod()).label)}${run.final ? "" : ", draft"}</span></div>
      <div class="card stat"><span class="label">On hold</span><span class="value">${all.filter((ln) => ln.status === "HOLD").length}</span><span class="note t-muted">not deducted until resumed</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Loans</h2><span class="t-muted" style="font-size:13px;max-width:62ch">Deducted after contributions and tax, government loans first. When net pay runs out, the rest waits for the next cutoff. Payments are recorded when payroll is finalized.</span></div>
      <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="field" style="grid-column:span 2"><label for="ln-q">Search</label><input class="input" id="ln-q" type="search" value="${esc(f.q)}" placeholder="Name, employee no. or loan no." data-cfilter="loan:q"></div>
        <div class="field"><label for="ln-type">Type</label><select class="input" id="ln-type" data-cfilter="loan:type">${opts(PAY.LOAN_TYPES, f.type, "All")}</select></div>
        <div class="field"><label for="ln-st">Status</label><select class="input" id="ln-st" data-cfilter="loan:status">${opts(Object.entries(LSTAT).map(([k, v]) => [k, v[0]]), f.status, "All")}</select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Loan</th><th class="num">Amount</th><th class="num">Per cutoff</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
      ${rows.map((ln) => { const e = S.emps.get(ln.empId); return `<tr class="go" data-loan="${ln.id}" tabindex="0"><td><div class="person" style="min-width:190px">${avatar(e, 34)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${esc(e.no)}</span></span></div></td>
        <td><b>${esc(LTYPE[ln.type])}</b><div class="t-muted" style="font-size:13px">${ln.ref ? esc(ln.ref) + " · " : ""}from ${esc(PAY.period(ln.start).label)}</div></td><td class="num">${money(ln.principal)}</td><td class="num">${money(ln.amort)}</td><td class="num"><b>${money(loanBal(ln))}</b></td>
        <td><span class="chip ${LSTAT[ln.status][1]}">${LSTAT[ln.status][0]}</span>${ln.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No loans match.</td></tr>'}
      </tbody></table></div>
      <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} loans · page ${f.page} of ${pages}</span><span style="display:flex;gap:8px">${f.page > 1 ? '<button class="btn btn-ghost btn-sm" data-cpage="loan:-1">Previous</button>' : ""}${f.page < pages ? '<button class="btn btn-ghost btn-sm" data-cpage="loan:1">Next</button>' : ""}</span></nav></section>`;
};
VIEWS.loan = () => {
  const ln = S.loans.get(S.view.id); const e = ln && S.emps.get(ln.empId); if (!ln || !e) return notFound("Loans", "Loan", "loans");
  const pays = Object.entries(ln.payments || {}).sort((a, b) => b[0].localeCompare(a[0])); const ed = S.canEdit;
  return backLink('data-go="loans"', "Loans &amp; Deductions") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">${avatar(e, 72)}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="t-muted" style="font-size:13px;font-weight:700">${esc(LTYPE[ln.type]).toUpperCase()}</span><h1 style="font-size:26px;font-weight:800"><button class="link" style="color:var(--ink);font-size:inherit;font-weight:inherit" data-emp="${e.id}">${esc(fullName(e))}</button></h1>
        <div class="chips" style="align-items:center;font-size:14px"><span class="chip ${LSTAT[ln.status][1]}">${LSTAT[ln.status][0]}</span>${ln.sample ? '<span class="chip c-warn">Sample</span>' : ""}<span class="t-muted">${ln.ref ? "No. " + esc(ln.ref) + " · " : ""}granted ${fmtDate(ln.granted)}</span></div></div>
      ${ed ? `<div class="head-actions">${ln.status === "ACTIVE" ? `<button class="btn btn-ghost" data-loan-set="${ln.id}:HOLD">Put on hold</button>` : ln.status === "HOLD" ? `<button class="btn btn-ghost" data-loan-set="${ln.id}:ACTIVE">Resume deductions</button>` : ""}${["ACTIVE", "HOLD"].includes(ln.status) ? `<button class="btn btn-ghost" data-loan-set="${ln.id}:CLOSED">Close (settled outside payroll)</button>` : ""}<button class="btn btn-ghost" data-edit-loan="${ln.id}">Edit</button>${!pays.length ? `<button class="btn btn-ghost danger" data-del-loan="${ln.id}">Delete</button>` : ""}</div>` : ""}</section>
    <div class="two"><section class="card"><div class="card-head"><h2>Summary</h2></div><dl class="facts">
        ${tfact("Loan amount", money(ln.principal))}${tfact("Paid before this system", money(ln.paidBefore || 0))}${tfact("Deducted in payroll", money(loanPaid(ln) - (ln.paidBefore || 0)))}${tfact("Balance", `<b>${money(loanBal(ln))}</b>`)}
        ${tfact("Per cutoff", money(ln.amort))}${tfact("Starts", esc(PAY.period(ln.start).label))}${tfact("Cutoffs left", ln.amort ? String(Math.ceil(loanBal(ln) / ln.amort)) : "")}${ln.paidOff ? tfact("Paid off", fmtDate(ln.paidOff)) : ""}
      </dl>${ln.notes ? `<p style="margin:12px 0 0;font-size:14px;white-space:pre-line">${esc(ln.notes)}</p>` : ""}</section>
      <section class="card"><div class="card-head"><h2>Payroll deductions (${pays.length})</h2></div>
        ${pays.length ? `<div class="table-wrap"><table><thead><tr><th>Pay period</th><th class="num">Deducted</th></tr></thead><tbody>${pays.map(([pid, v]) => `<tr><td>${esc(PAY.period(pid).label)}</td><td class="num">${money(v)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Nothing deducted yet. The first deduction is recorded when that payroll is finalized.</p>'}</section></div>`;
};
VIEWS.loanForm = () => {
  const ln = S.view.id ? S.loans.get(S.view.id) : null; const v = ln || { type: "SSS_SAL", start: curPeriod(), granted: todayISO(), empId: S.view.emp || "" };
  const periods = []; for (let i = -2; i <= 6; i++) periods.push(PAY.shiftPeriod(curPeriod(), i)); if (!periods.includes(v.start)) periods.unshift(v.start);
  const cancel = ln ? `data-loan="${ln.id}"` : 'data-go="loans"';
  return backLink(cancel, ln ? "Loan" : "Loans &amp; Deductions") + head("Loans &amp; Deductions", ln ? "Edit loan" : "New loan") + `
    <form id="loan-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      ${ln ? `<div class="field"><span class="lbl">Employee</span><b>${esc(empName(ln.empId))}</b></div>` : empPicker("lf2-emp", v.empId)}
      <div class="field"><label for="lf2-type">Type</label><select class="input" id="lf2-type">${opts(PAY.LOAN_TYPES, v.type)}</select></div>
      <div class="field"><label for="lf2-ref">Loan or reference no.</label><input class="input" id="lf2-ref" value="${esc(v.ref || "")}"></div>
      <div class="field"><label for="lf2-granted">Date granted</label><input class="input" id="lf2-granted" type="date" value="${esc(v.granted || "")}"></div>
      <div class="field"><label for="lf2-amt">Loan amount to repay (PHP) <span class="req">*</span></label><input class="input" id="lf2-amt" type="number" min="0" step="0.01" value="${v.principal ?? ""}" required></div>
      <div class="field"><label for="lf2-before">Already paid before this system</label><input class="input" id="lf2-before" type="number" min="0" step="0.01" value="${v.paidBefore || ""}" placeholder="0"></div>
      <div class="field"><label for="lf2-amort">Deduction per cutoff <span class="req">*</span></label><input class="input" id="lf2-amort" type="number" min="0" step="0.01" value="${v.amort ?? ""}" required placeholder="Half the monthly amortization"></div>
      <div class="field"><label for="lf2-start">First deduction</label><select class="input" id="lf2-start">${opts(periods.map((p) => [p, PAY.period(p).label]), v.start)}</select></div></div>
      <div class="field"><label for="lf2-notes">Notes</label><textarea class="input" id="lf2-notes" rows="2" placeholder="Terms, consent form on file">${esc(v.notes || "")}</textarea></div>
      <p class="t-muted" style="margin:0;font-size:13px">For SSS and Pag-IBIG loans, use the amortization on the lender's billing. Company loans and cash advances need the employee's written consent to deduct.</p>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="lf2-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save loan</button></div></form>`;
};
async function submitLoan() {
  const err = $("#lf2-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const prev = S.view.id ? S.loans.get(S.view.id) : null; const empId = prev ? prev.empId : $("#lf2-emp").value;
  const principal = Number($("#lf2-amt").value) || 0; const amort = Number($("#lf2-amort").value) || 0;
  if (!S.emps.get(empId)) return fail("Choose the employee."); if (!(principal > 0) || !(amort > 0)) return fail("Enter the loan amount and the deduction per cutoff.");
  const ln = { ...(prev || { id: uid(), empId, payments: {}, status: "ACTIVE" }), type: $("#lf2-type").value, ref: $("#lf2-ref").value.trim() || null, granted: $("#lf2-granted").value || null,
    principal, paidBefore: Number($("#lf2-before").value) || 0, amort, start: $("#lf2-start").value, notes: $("#lf2-notes").value.trim() || null };
  if (loanBal(ln) <= 0 && ln.status === "ACTIVE") ln.status = "PAID";
  await put("loans", ln); logActivity(`${prev ? "Updated" : "Added"} a ${LTYPE[ln.type].toLowerCase()} for ${empName(empId)}`); toast("Loan saved."); go("loan", { id: ln.id });
}

/* ---------- year-end tax: annualization, BIR 2316 and alphalist ---------- */
async function ensureYear(y) {
  if (S.yearsLoaded.has(y) || S.yearsLoading.has(y) || !S.db) return;
  S.yearsLoading.add(y);
  try { const snap = await S.db.collection("payruns").where("start", ">=", `${y}-01-01`).where("start", "<=", `${y}-12-31`).get(); for (const d of snap.docs) S.runs.set(d.id, d.data()); S.yearsLoaded.add(y); S.ver++; render(); }
  catch { S.yearsLoaded.add(y); } finally { S.yearsLoading.delete(y); }
}
const yearPeriods = (y) => { const out = []; for (let m = 1; m <= 12; m++) for (const h of [1, 2]) out.push(`${y}-${String(m).padStart(2, "0")}-${h}`); return out; };
/* Year-to-date figures from final payrolls, with draft payroll for the cutoffs not yet final (so the result is a projection until December closes). */
function annualize(e, y, upTo) {
  const sepEnd = e.separated?.date && e.separated.date.startsWith(y) ? e.separated.date : null;
  const end = upTo || sepEnd || `${y}-12-31`; const Sx = SET();
  const a = { gross: 0, taxable: 0, tax: 0, contrib: 0, deMin: 0, ben: 0, comm: 0, basic: 0, prem: 0, finals: 0, drafts: 0, mwe: false };
  for (const id of yearPeriods(y)) {
    const p = PAY.period(id); if (p.start > end || e.hire > p.end) continue;
    const r = payrun(id); const l = r.lines[e.id]; if (!l) continue; r.final ? a.finals++ : a.drafts++;
    a.gross += l.gross; a.taxable += l.taxable; a.tax += l.tax; a.contrib += l.sss + l.ph + l.hd; a.deMin += (l.allowN || 0) + l.adjN + (l.flexN || 0); a.ben += l.flexB || 0; a.comm += l.comm || 0; a.basic += regularPay(l); a.prem += premOf(l); if (l.mwe) a.mwe = true;
  }
  const from = e.hire > `${y}-01-01` ? e.hire : `${y}-01-01`;
  const monthly = e.payType === "DAILY" ? ((e.basicPay || 0) * Sx.factor) / 12 : e.basicPay || 0;
  // 13th month is a twelfth of basic pay, plus a twelfth of commissions when they are part of the wage. FlexBen benefit items share the same yearly cap.
  a.t13 = from <= end ? t13Of(e, y, end).t13 : 0;
  a.t13Ex = Math.min(a.t13 + a.ben, Sx.exempt13); a.t13Tax = PAY.r2(a.t13 + a.ben - a.t13Ex);
  a.prev = e.prev?.year === y && !e.prev.none ? e.prev : null;
  a.ntOther = PAY.r2(Math.max(0, a.gross - a.taxable - a.contrib - a.deMin - a.ben));
  a.annualTaxable = PAY.r2(a.taxable + a.t13Tax + (Number(a.prev?.taxable) || 0));
  a.due = PAY.r2(PAY.annualTax(a.annualTaxable)); a.withheld = PAY.r2(a.tax + (Number(a.prev?.tax) || 0));
  a.adj = PAY.r2(a.due - a.withheld); a.end = end; a.from = from;
  for (const k of ["gross", "taxable", "tax", "contrib", "deMin", "ben", "comm", "basic", "prem"]) a[k] = PAY.r2(a[k]);
  return a;
}
const taxYear = () => S.taxYear || todayISO().slice(0, 4);
const inYear = (e, y) => e.hire <= `${y}-12-31` && (!e.separated || e.separated.date >= `${y}-01-01`);
VIEWS.tax = () => {
  const y = taxYear(); ensureYear(y); const tab = S.taxTab;
  const years = [Number(todayISO().slice(0, 4)), Number(todayISO().slice(0, 4)) - 1].map(String);
  const tabs = `<div class="tabs on-blue" role="tablist">${[["annual", "Annualization and BIR 2316"], ["prev", "Previous employers"], ["fbt", "Fringe benefit tax"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tax-tab="${k}">${l}</button>`).join("")}</div>`;
  const pick = `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="lbl" style="color:var(--onblue)">Year</span><select class="input" style="width:auto;color:var(--ink)" data-tax-year>${opts(years.map((v) => [v, v]), y)}</select></label>`;
  if (!S.yearsLoaded.has(y)) return head(`Tax year ${y}`, "Tax &amp; BIR", pick) + tabs + '<section class="card"><p class="t-muted" style="margin:0">Loading the payrolls for the year…</p></section>';
  if (tab === "fbt") return head(`Tax year ${y}`, "Tax &amp; BIR", pick) + tabs + fbtTab(y);
  return head(`Tax year ${y}`, "Tax &amp; BIR", pick + `<button class="btn btn-ghost" data-cmx="alphalist">Alphalist (CSV)</button><button class="btn btn-ghost" data-cmx="annual">Annualization (CSV)</button>`) + tabs + (tab === "prev" ? prevTab(y) : annualTab(y));
};
function annualRows(y) {
  const memo = `${y}:${S.ver}`; if (annualRows.k === memo) return annualRows.v;
  const v = [...S.emps.values()].filter((e) => inYear(e, y)).sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first)).map((e) => ({ e, a: annualize(e, y) }));
  annualRows.k = memo; annualRows.v = v; return v;
}
function annualTab(y) {
  const rows = annualRows(y); const f = S.taxFilter; const q = f.q.trim().toLowerCase();
  const list = rows.filter((r) => !q || `${fullName(r.e)} ${r.e.no}`.toLowerCase().includes(q));
  const T = (fn) => PAY.r2(rows.reduce((s, r) => s + fn(r), 0)); const cur = rows.filter((r) => !r.e.separated);
  const refunds = cur.filter((r) => r.a.adj < -0.5), collect = cur.filter((r) => r.a.adj > 0.5);
  const proj = rows.some((r) => r.a.drafts); const dec = `${y}-12-2`; const decFinal = isFinal(dec);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(f.page, pages); const page = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return `${proj ? `<div class="notice"><span><span class="chip c-warn">Projection</span> Cutoffs that are not final yet are estimated from the current time sheets and rates. The figures settle once December payroll is final.</span></div>` : ""}
    <section class="stats">
      <div class="card stat"><span class="label">Tax due for ${y}</span><span class="value" style="font-size:28px">${peso.format(T((r) => r.a.due))}</span><span class="note t-muted">annual BIR table on taxable pay</span></div>
      <div class="card stat"><span class="label">Tax withheld</span><span class="value" style="font-size:28px">${peso.format(T((r) => r.a.withheld))}</span><span class="note t-muted">including previous employers</span></div>
      <div class="card stat"><span class="label">Refunds due</span><span class="value" style="font-size:28px">${peso.format(-PAY.r2(refunds.reduce((s, r) => s + r.a.adj, 0)))}</span><span class="note t-muted">${refunds.length} employees</span></div>
      <div class="card stat"><span class="label">Still to collect</span><span class="value" style="font-size:28px">${peso.format(PAY.r2(collect.reduce((s, r) => s + r.a.adj, 0)))}</span><span class="note t-muted">${collect.length} employees</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Year-end annualization</h2>${decFinal ? '<span class="chip c-ok">December payroll is final</span>' : S.canEdit && todayISO() >= `${y}-12-01` ? `<button class="btn btn-primary btn-sm" data-apply-annual="${y}">Apply to the December 16-31 payroll</button>` : y === todayISO().slice(0, 4) ? '<span class="t-muted" style="font-size:13px">Apply the adjustments in December</span>' : ""}</div>
      <p class="t-muted" style="margin:0 0 12px;font-size:14px;max-width:80ch">Taxable pay for the year, plus 13th month and other benefits above ₱${n2.format(SET().exempt13).replace(".00", "")} and any previous employer's taxable pay, is run through the annual tax table. The difference from tax withheld is refunded or collected in the last payroll of the year. People who left are settled in their final pay.</p>
      <div class="field" style="max-width:380px;margin-bottom:12px"><label for="tx-q">Search</label><input class="input" id="tx-q" type="search" value="${esc(f.q)}" placeholder="Name or employee no." data-cfilter="tax:q"></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Taxable pay</th><th class="num">Previous employer</th><th class="num">13th month over cap</th><th class="num">Tax due</th><th class="num">Withheld</th><th class="num">Refund (collect)</th><th></th></tr></thead><tbody>
      ${page.map(({ e, a }) => `<tr><td><button class="link" style="color:var(--ink);text-align:left" data-emp="${e.id}"><b>${esc(fullName(e))}</b></button><div class="t-muted" style="font-size:13px">${esc(e.no)}${a.mwe ? " · minimum wage earner" : ""}${e.separated ? " · left " + fmtDate(e.separated.date) : ""}</div></td>
        <td class="num">${money(a.taxable)}</td><td class="num">${a.prev ? money(a.prev.taxable) : e.hire > `${y}-01-01` && !e.prev?.none ? '<span class="chip c-warn">Missing</span>' : '<span class="t-muted">—</span>'}</td><td class="num">${money(a.t13Tax)}</td><td class="num">${money(a.due)}</td><td class="num">${money(a.withheld)}</td>
        <td class="num"><b class="${a.adj < -0.5 ? "t-ok" : a.adj > 0.5 ? "t-warn" : ""}">${Math.abs(a.adj) < 0.5 ? "—" : a.adj < 0 ? money(-a.adj) : "(" + money(a.adj) + ")"}</b>${e.separated ? '<div class="t-muted" style="font-size:12px">in final pay</div>' : ""}</td>
        <td class="num"><button class="btn btn-ghost btn-sm" data-bir2316="${e.id}:${y}">BIR 2316</button></td></tr>`).join("") || '<tr><td colspan="8" class="empty">No one matches.</td></tr>'}
      </tbody></table></div>
      <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} people · page ${f.page} of ${pages}</span><span style="display:flex;gap:8px">${f.page > 1 ? '<button class="btn btn-ghost btn-sm" data-cpage="tax:-1">Previous</button>' : ""}${f.page < pages ? '<button class="btn btn-ghost btn-sm" data-cpage="tax:1">Next</button>' : ""}</span></nav></section>
    <section class="card"><div class="card-head"><h2>Filing reminders</h2></div><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7">
      <li>BIR 1601-C: monthly withholding return. The monthly totals are on the Gov't Contributions page.</li>
      <li>BIR 2316: give each employee a signed copy by January 31, and within 30 days of separation for people who leave.</li>
      <li>BIR 1604-C with the alphalist: file by January 31 for the previous year. Schedule 1 lists people who left during the year; Schedule 2 everyone employed on December 31.</li></ul></section>`;
}
function prevTab(y) {
  const hires = [...S.emps.values()].filter((e) => e.hire > `${y}-01-01` && e.hire <= `${y}-12-31`).sort((a, b) => b.hire.localeCompare(a.hire));
  const missing = hires.filter((e) => !(e.prev?.year === y));
  return `<section class="card"><div class="card-head"><h2>People hired in ${y} (${hires.length})</h2><span class="t-muted" style="font-size:14px">${missing.length} without previous employer figures</span></div>
    <p class="t-muted" style="margin:0 0 12px;font-size:14px;max-width:80ch">Ask every mid-year hire for the BIR 2316 from their previous employer this year, so their pay can be annualized correctly. Record "No previous employer" for first-time workers.</p>
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Hired</th><th>Previous employer</th><th class="num">Taxable pay</th><th class="num">Tax withheld</th></tr></thead><tbody>
    ${hires.map((e) => { const p = e.prev?.year === y ? e.prev : null; return `<tr class="go" data-emp="${e.id}" tabindex="0"><td><b>${esc(fullName(e))}</b><div class="t-muted" style="font-size:13px">${esc(e.no)}</div></td><td>${fmtDate(e.hire)}</td>
      <td>${p ? (p.none ? '<span class="chip c-gray">None (first job this year)</span>' : esc(p.employer || "Recorded")) : '<span class="chip c-warn">Waiting for BIR 2316</span>'}</td><td class="num">${p && !p.none ? money(p.taxable) : ""}</td><td class="num">${p && !p.none ? money(p.tax) : ""}</td></tr>`; }).join("") || '<tr><td colspan="5" class="empty">No one was hired this year.</td></tr>'}
    </tbody></table></div><p class="t-muted" style="margin:12px 0 0;font-size:13px">Select a person, then use Pay setup on their 201 file to enter the figures.</p></section>`;
}
async function applyAnnual(y) {
  const id = `${y}-12-2`; const run = payrun(id); const patch = {}; let n = 0;
  for (const { e, a } of annualRows(y)) {
    if (e.separated || !run.lines[e.id]) continue;
    const cur = Number(periodDoc(id).rows?.[e.id]?.taxAdj) || 0; const adj = PAY.r2(a.adj + cur);
    if (Math.abs(adj - cur) < 0.01) continue; patch[e.id] = { taxAdj: adj }; n++;
  }
  if (!n) { toast("Nothing to change: December already carries the year-end adjustments."); return; }
  await savePeriodRows(id, patch); logActivity(`Applied year-end tax annualization for ${n} employees to ${PAY.period(id).label}`); toast(`Year-end adjustments added for ${n} people.`); render();
}
function bir2316(empId, y) {
  const e = S.emps.get(empId); if (!e) return; const a = annualize(e, y); const r = (k, v) => `<tr><td>${k}</td><td class="num">${money(v)}</td></tr>`;
  const nt = PAY.r2(a.t13Ex + a.deMin + a.contrib + a.ntOther); const presentGross = PAY.r2(a.gross + a.t13);
  const body = `<h2>BIR FORM 2316 · CERTIFICATE OF COMPENSATION PAYMENT / TAX WITHHELD</h2>
    <p class="muted" style="margin-top:-12px">For the year ${y}, ${fmtDate(a.from)} to ${fmtDate(a.end)}. Prepared from payroll records; transfer to the official BIR form for signing.${a.drafts ? " Includes projected cutoffs that are not final yet." : ""}</p>
    <h3>Part I: Employee</h3><table><tbody>${[["TIN", e.tin], ["Name", `${e.last}, ${e.first} ${e.middle || ""}`], ["Address", e.address], ["Birth date", fmtDate(e.birth)], ["Minimum wage earner", a.mwe ? "Yes, at " + money(wageFor(e)) + " a day" : "No"]].map(([k, v]) => `<tr><td>${k}</td><td class="num">${esc(v || "—")}</td></tr>`).join("")}</tbody></table>
    <h3>Part II: Present employer</h3><table><tbody><tr><td>Name</td><td class="num">${esc(S.org?.companyName || "")}</td></tr><tr><td>TIN</td><td class="num">${esc(S.org?.tin || "—")}</td></tr></tbody></table>
    ${a.prev ? `<h3>Part III: Previous employer</h3><table><tbody><tr><td>Name</td><td class="num">${esc(a.prev.employer || "")}</td></tr><tr><td>TIN</td><td class="num">${esc(a.prev.tin || "—")}</td></tr>${r("Taxable compensation", a.prev.taxable)}${r("Tax withheld", a.prev.tax)}</tbody></table>` : ""}
    <h3>Part IV-A: Summary</h3><table><tbody>${r("Gross compensation, present employer", presentGross)}${r("Less non-taxable compensation", nt)}${r("Taxable compensation, present employer", PAY.r2(a.taxable + a.t13Tax))}${a.prev ? r("Add taxable compensation, previous employer", a.prev.taxable) : ""}
      ${r("Gross taxable compensation", a.annualTaxable)}${r("Tax due", a.due)}${r("Tax withheld, present employer", a.tax)}${a.prev ? r("Tax withheld, previous employer", a.prev.tax) : ""}${r("Total tax withheld", a.withheld)}
      <tr><td><b>${a.adj < 0 ? "Over-withheld, to be refunded" : "Still due, to be withheld"}</b></td><td class="num"><b>${money(Math.abs(a.adj))}</b></td></tr></tbody></table>
    <h3>Part IV-B: Details</h3><table><tbody><tr><td colspan="2"><b>Non-taxable</b></td></tr>${a.mwe ? r("Basic, holiday, overtime and night pay of a minimum wage earner", a.ntOther) : r("Other non-taxable pay", a.ntOther)}${r("13th month pay and other benefits (up to the cap)", a.t13Ex)}${r("De minimis benefits", a.deMin)}${r("SSS, PhilHealth and Pag-IBIG employee shares", a.contrib)}
      <tr><td colspan="2"><b>Taxable</b></td></tr>${r("Basic salary and regular pay", a.mwe ? 0 : a.basic)}${r("Overtime, holiday and night pay", a.mwe ? 0 : a.prem)}${r("13th month pay and other benefits above the cap", a.t13Tax)}</tbody></table>
    <p style="margin-top:28px">I declare that this certificate has been made in good faith and is true and correct.</p>
    <div style="display:flex;gap:40px;flex-wrap:wrap;margin-top:40px"><div style="flex:1;min-width:220px;border-top:1px solid #14213D;padding-top:6px">${signer()}<br><span class="muted">Employer's authorized representative</span></div><div style="flex:1;min-width:220px;border-top:1px solid #14213D;padding-top:6px"><b>${esc(fullName(e))}</b><br><span class="muted">Employee</span></div></div>`;
  return saveLetter(`BIR-2316-${y}-${e.no}.html`, `BIR 2316 ${y} ${fullName(e)}`, body);
}

/* ---------- 201 file checklist ---------- */
const F201 = [["pds", "Personal data sheet or resume", "Resume"], ["birth", "PSA birth certificate", "Birth certificate"], ["nbi", "NBI clearance", "NBI clearance"], ["med", "Pre-employment medical exam", "Medical certificate"],
  ["govids", "TIN, SSS, PhilHealth and Pag-IBIG numbers", null], ["edu", "Diploma or transcript", "Diploma / TOR"], ["contract", "Signed employment contract", "Employment contract"], ["jd", "Signed job description and standards", null],
  ["privacy", "Data privacy consent", null], ["prev2316", "BIR 2316 from previous employer, or none", null], ["photo", "ID photo", null]];
function f201Status(e) {
  const kinds = new Set((e.docs || []).map((d) => d.kind)); const paper = S.f201[e.id] || {};
  return F201.map(([k, label, kind]) => {
    let done = paper[k] || (kind && kinds.has(kind) ? "uploaded" : null);
    if (k === "govids" && e.tin && e.sss && e.philhealth && e.pagibig) done = done || "on record";
    if (k === "photo" && e.photo) done = done || "uploaded";
    if (k === "prev2316" && (e.prev || e.hire.slice(0, 4) < todayISO().slice(0, 4) && paper[k])) done = done || "recorded";
    return { k, label, done, auto: !paper[k] && !!done };
  });
}
const f201Pct = (e) => { const s = f201Status(e); return Math.round((s.filter((x) => x.done).length / s.length) * 100); };
async function toggle201(empId, k, on) {
  const v = on ? todayISO() : null;
  await S.db.doc("org/f201").update({ items: { [empId]: { [k]: v } } }).catch(async () => S.db.doc("org/f201").set({ items: { ...S.f201, [empId]: { ...(S.f201[empId] || {}), [k]: v } } }));
  S.f201 = { ...S.f201, [empId]: { ...(S.f201[empId] || {}), [k]: v } }; S.ver++;
}

/* ---------- movements and pay setup on the 201 file ---------- */
const MOVES = [["PROMOTION", "Promotion"], ["LATERAL", "Lateral transfer"], ["DEMOTION", "Demotion"], ["SALARY", "Salary adjustment"], ["STATUS", "Change of employment status"]];
function compPanels(e) {
  const ed = S.canEdit && !e.separated; const y = todayISO().slice(0, 4); const Sx = SET();
  const st = f201Status(e); const done = st.filter((x) => x.done).length;
  const loans = listOf(S.loans).filter((ln) => ln.empId === e.id && ["ACTIVE", "HOLD"].includes(ln.status));
  const inc = listOf(S.osh).filter((x) => x.empId === e.id).sort((a, b) => b.d.localeCompare(a.d));
  const prev = e.prev?.year === y ? e.prev : null;
  return `<section class="card"><div class="card-head"><h2>201 file checklist</h2><span class="chip ${done === st.length ? "c-ok" : "c-warn"}">${done} of ${st.length}</span></div>
      ${st.map((x) => `<label class="check"><input type="checkbox" data-f201="${e.id}:${x.k}" ${x.done ? "checked" : ""} ${ed && !x.auto ? "" : "disabled"}><span style="flex:1"><b style="font-weight:600">${esc(x.label)}</b>${x.done ? `<div class="t-muted" style="font-size:13px">${x.auto ? esc(x.done) : "on file since " + fmtDate(x.done)}</div>` : ""}</span></label>`).join("")}
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Uploaded documents and filled-in government numbers tick their item automatically. Tick the rest when the paper copy is in the 201 folder.</p></section>
    <section class="card"><div class="card-head"><h2>Pay setup</h2>${ed ? `<button class="btn btn-ghost btn-sm" data-pay-setup="${e.id}">Edit</button>` : ""}</div><dl class="facts">
      ${tfact("Regular allowances", (e.allow || []).filter((a) => a.amt > 0).map((a) => `${esc(Sx.allowTypes.find((t) => t.code === a.code)?.name || a.code)} ${money(a.amt)}`).join("<br>") + ((e.allow || []).some((a) => a.amt > 0) ? '<div class="t-muted" style="font-size:12px">per cutoff</div>' : ""))}
      ${tfact("Pag-IBIG", e.hdmfVol ? `Voluntary ${money(e.hdmfVol)} a month` : "Standard")}${tfact("Minimum wage used", money(wageFor(e)))}
      ${tfact(`Previous employer (${y})`, prev ? (prev.none ? "None this year" : `${esc(prev.employer || "")}<br>taxable ${money(prev.taxable)}, tax ${money(prev.tax)}`) : e.hire > `${y}-01-01` ? '<span class="chip c-warn">Waiting for BIR 2316</span>' : "")}
      ${tfact("Loans", loans.length ? loans.map((ln) => `<button class="link" data-loan="${ln.id}">${esc(LTYPE[ln.type])}</button> ${money(loanBal(ln))} left`).join("<br>") : "")}
    </dl>${ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-ghost btn-sm" data-new-loan="${e.id}">Add loan</button><button class="btn btn-ghost btn-sm" data-bir2316="${e.id}:${y}">BIR 2316 for ${y}</button></div>` : ""}</section>
    ${ed ? `<section class="card"><div class="card-head"><h2>Record a movement</h2></div>
      <form id="move-form" class="stack" style="gap:12px" data-keep data-emp-id="${e.id}"><div class="form-grid">
        <div class="field"><label for="mv-kind">Movement</label><select class="input" id="mv-kind">${opts(MOVES, "PROMOTION")}</select></div>
        <div class="field"><label for="mv-d">Effective</label><input class="input" id="mv-d" type="date" value="${todayISO()}" required></div>
        <div class="field"><label for="mv-pos">New position</label><select class="input" id="mv-pos">${opts(S.org.positions.map((p) => [p.id, p.title]), e.posId)}</select></div>
        <div class="field"><label for="mv-dept">Department</label><select class="input" id="mv-dept">${opts(S.org.departments.map((d) => [d.id, d.name]), e.deptId)}</select></div>
        <div class="field"><label for="mv-pay">Basic pay (${e.payType === "DAILY" ? "daily" : "monthly"})</label><input class="input" id="mv-pay" type="number" min="0" step="0.01" value="${e.basicPay || ""}"></div>
        <div class="field"><label for="mv-st">Employment status</label><select class="input" id="mv-st">${opts(Object.entries(STATUS).map(([k, v]) => [k, v[0]]), e.status)}</select></div></div>
        <div class="field"><label for="mv-why">Reason or reference (memo, appraisal)</label><input class="input" id="mv-why"></div>
        <p class="t-muted" style="margin:0;font-size:13px">A demotion needs the employee's written consent, or due process when it is a penalty. A pay cut is not allowed without consent.</p>
        <div><button class="btn btn-primary btn-sm">Save movement</button></div></form></section>` : ""}
    ${inc.length ? `<section class="card"><div class="card-head"><h2>Safety incidents (${inc.length})</h2></div><ul class="list" style="font-size:14px">${inc.slice(0, 5).map((x) => `<li><button class="link" data-osh="${x.id}">${esc(OSHK[x.kind][0])}</button> <span class="t-muted">${fmtDate(x.d)}${x.daysLost ? ` · ${x.daysLost} days lost` : ""}</span></li>`).join("")}</ul></section>` : ""}`;
}
VIEWS.paySetup = () => {
  const e = S.emps.get(S.view.id); if (!e) return notFound("Employees", "Employee", "employees"); const Sx = SET(); const y = todayISO().slice(0, 4); const p = e.prev?.year === y ? e.prev : {};
  const amt = (code) => (e.allow || []).find((a) => a.code === code)?.amt || "";
  return backLink(`data-emp="${e.id}"`, esc(fullName(e))) + head("Pay setup", esc(fullName(e))) + `
    <form id="paysetup-form" class="card stack" style="gap:16px" data-keep novalidate>
      <h2 style="font-size:17px">Allowances per cutoff</h2>
      <div class="form-grid">${Sx.allowTypes.map((t) => `<div class="field"><label for="al-${t.code}">${esc(t.name)}${t.cap ? ` <span class="t-muted">(tax-free up to ${money(t.cap / PAY.PER_CUTOFF[t.per])})</span>` : ' <span class="t-muted">(taxable)</span>'}</label><input class="input" id="al-${t.code}" data-allow="${t.code}" type="number" min="0" step="0.01" value="${amt(t.code)}" placeholder="0"></div>`).join("")}</div>
      <h2 style="font-size:17px">Rank, commissions and time clock</h2>
      <div class="form-grid"><div class="field"><label for="ps-rank">Rank (FlexBen credits and fringe benefit tax)</label><select class="input" id="ps-rank">${opts(RANKS, e.rank || "", `From the position title (${rankName(rankOf({ ...e, rank: null }))})`)}</select></div>
        <div class="field"><label for="ps-bio">Biometric ID (user number on the time clock)</label><input class="input" id="ps-bio" value="${esc(e.bioId || "")}" placeholder="${esc(String(Number(String(e.no).replace(/\D/g, "")) || ""))}"></div></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="ps-comm13" ${e.comm13 === false ? "" : "checked"}> Commissions are part of the wage and count toward 13th month pay</label>
      <p class="t-muted" style="margin:-8px 0 0;font-size:13px">Untick for productivity or profit-sharing incentives that aren't part of the wage. Enter commissions in the time sheet's Commission column.</p>
      <h2 style="font-size:17px">Pag-IBIG</h2>
      <div class="form-grid"><div class="field"><label for="ps-hdmf">Voluntary monthly contribution (blank for the standard ₱200)</label><input class="input" id="ps-hdmf" type="number" min="0" step="1" value="${e.hdmfVol || ""}" placeholder="200"></div></div>
      <h2 style="font-size:17px">Previous employer in ${y}</h2>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="ps-none" ${p.none ? "checked" : ""}> No previous employer this year</label>
      <div class="form-grid"><div class="field"><label for="ps-emp">Employer name</label><input class="input" id="ps-emp" value="${esc(p.employer || "")}"></div><div class="field"><label for="ps-tin">Employer TIN</label><input class="input" id="ps-tin" value="${esc(p.tin || "")}"></div>
        <div class="field"><label for="ps-gross">Gross compensation</label><input class="input" id="ps-gross" type="number" min="0" step="0.01" value="${p.gross ?? ""}"></div><div class="field"><label for="ps-nt">Non-taxable compensation</label><input class="input" id="ps-nt" type="number" min="0" step="0.01" value="${p.nontax ?? ""}"></div>
        <div class="field"><label for="ps-tx">Taxable compensation</label><input class="input" id="ps-tx" type="number" min="0" step="0.01" value="${p.taxable ?? ""}"></div><div class="field"><label for="ps-tax">Tax withheld</label><input class="input" id="ps-tax" type="number" min="0" step="0.01" value="${p.tax ?? ""}"></div></div>
      <p class="t-muted" style="margin:0;font-size:13px">Copy these from the BIR 2316 the previous employer issued for this year.</p>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-emp="${e.id}">Cancel</button><button class="btn btn-primary">Save pay setup</button></div></form>`;
};
async function submitPaySetup() {
  const e = S.emps.get(S.view.id); const y = todayISO().slice(0, 4); const num = (id) => Number($(id).value) || 0;
  const allow = [...document.querySelectorAll("[data-allow]")].map((x) => ({ code: x.dataset.allow, amt: Number(x.value) || 0 })).filter((a) => a.amt > 0);
  const none = $("#ps-none").checked; const hasPrev = none || $("#ps-emp").value.trim() || num("#ps-tx") || num("#ps-tax");
  const prev = hasPrev ? (none ? { year: y, none: true } : { year: y, employer: $("#ps-emp").value.trim() || null, tin: $("#ps-tin").value.trim() || null, gross: num("#ps-gross"), nontax: num("#ps-nt"), taxable: num("#ps-tx"), tax: num("#ps-tax") }) : e.prev?.year === y ? null : e.prev || null;
  const ne = { ...e, allow, hdmfVol: num("#ps-hdmf") || null, prev, rank: $("#ps-rank").value || null, bioId: $("#ps-bio").value.trim() || null, comm13: $("#ps-comm13").checked ? null : false };
  await saveEmp(ne); S.emps.set(e.id, ne); logActivity(`Updated the pay setup of ${fullName(e)}`); toast("Pay setup saved."); go("employee", { id: e.id });
}
async function submitMove(f) {
  const e = S.emps.get(f.dataset.empId); const kind = $("#mv-kind").value; const d = $("#mv-d").value || todayISO();
  const ne = { ...e, posId: $("#mv-pos").value || e.posId, deptId: $("#mv-dept").value || e.deptId, basicPay: Number($("#mv-pay").value) || e.basicPay, status: $("#mv-st").value || e.status };
  const bits = [];
  if (ne.posId !== e.posId) bits.push(`${pos(e.posId)?.title || "No position"} to ${pos(ne.posId)?.title}`);
  if (ne.deptId !== e.deptId) bits.push(`${dept(e.deptId)?.name || "no department"} to ${dept(ne.deptId)?.name}`);
  if (ne.basicPay !== e.basicPay) bits.push(`pay ${peso.format(e.basicPay || 0)} to ${peso.format(ne.basicPay)}`);
  if (ne.status !== e.status) bits.push(`${STATUS[e.status]?.[0]} to ${STATUS[ne.status]?.[0]}`);
  if (!bits.length) { toast("Nothing changed. Pick the new position, department, pay or status."); return; }
  const why = $("#mv-why").value.trim();
  ne.history = [...(e.history || []), { d, kind: MOVES.find((m) => m[0] === kind)[1], text: bits.join("; ") + (why ? ` (${why})` : "") }];
  await saveEmp(ne); S.emps.set(e.id, ne); logActivity(`Recorded a ${MOVES.find((m) => m[0] === kind)[1].toLowerCase()} for ${fullName(e)}`); toast("Movement saved."); render();
}

/* ---------- safety (OSH) ---------- */
const OSHK = { NEAR_MISS: ["Near miss", "c-gray"], FIRST_AID: ["First aid case", "c-blue"], MEDICAL: ["Medical treatment case", "c-warn"], LOST_TIME: ["Lost-time injury", "c-bad"], ILLNESS: ["Occupational illness", "c-bad"], FATAL: ["Fatality", "c-bad"], DANGEROUS: ["Dangerous occurrence", "c-warn"] };
const mustReport = (x) => ["LOST_TIME", "ILLNESS", "FATAL", "DANGEROUS"].includes(x.kind);
function oshStats(y) {
  const list = listOf(S.osh).filter((x) => x.d.startsWith(y)); const today = todayISO(); const end = y === today.slice(0, 4) ? today : `${y}-12-31`;
  const days = daysBetween(`${y}-01-01`, end) + 1; const hours = Math.round(active().length * 8 * days * (SET().factor / 365));
  const lti = list.filter((x) => ["LOST_TIME", "FATAL"].includes(x.kind)); const lost = list.reduce((a, x) => a + (Number(x.daysLost) || 0), 0);
  const lastLti = listOf(S.osh).filter((x) => ["LOST_TIME", "FATAL"].includes(x.kind)).map((x) => x.d).sort().pop();
  return { list, hours, lti: lti.length, lost, fr: hours ? PAY.r2((lti.length * 1e6) / hours) : 0, sr: hours ? PAY.r2((lost * 1e6) / hours) : 0, since: lastLti ? daysBetween(lastLti, today) : null, unreported: list.filter((x) => mustReport(x) && !x.reported).length };
}
VIEWS.safety = () => {
  const y = todayISO().slice(0, 4); const st = oshStats(y); const list = listOf(S.osh).sort((a, b) => b.d.localeCompare(a.d));
  return head("Occupational safety and health (RA 11058)", "Safety (OSH)", `<button class="btn btn-ghost" data-cmx="osh">Download log (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="oshForm">${icon("plus")}Log incident</button>` : ""}`) + `
    <section class="stats">
      <div class="card stat"><span class="label">Days without lost-time injury</span><span class="value">${st.since ?? "—"}</span><span class="note t-muted">${st.since == null ? "none recorded" : "since the last one"}</span></div>
      <div class="card stat"><span class="label">Incidents in ${y}</span><span class="value">${st.list.length}</span><span class="note t-muted">${st.lti} lost-time, ${st.lost} days lost</span></div>
      <div class="card stat"><span class="label">Frequency and severity</span><span class="value" style="font-size:28px">${st.fr} · ${st.sr}</span><span class="note t-muted">per million hours (about ${n2.format(st.hours).replace(".00", "")} hours worked)</span></div>
      <div class="card stat"><span class="label">Not yet reported to DOLE</span><span class="value">${st.unreported}</span><span class="note ${st.unreported ? "t-warn" : "t-ok"}">${st.unreported ? "file the WAIR form" : "all reported"}</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Incident log</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>What happened</th><th>Who and where</th><th class="num">Days lost</th><th>DOLE report</th></tr></thead><tbody>
      ${list.map((x) => { const e = S.emps.get(x.empId); return `<tr class="go" data-osh="${x.id}" tabindex="0"><td style="white-space:nowrap">${fmtDate(x.d)}</td><td><span class="chip ${OSHK[x.kind][1]}">${OSHK[x.kind][0]}</span>${x.sample ? ' <span class="chip c-warn">Sample</span>' : ""}<div style="font-size:14px;margin-top:4px">${esc(x.desc)}</div></td>
        <td style="font-size:14px">${e ? esc(fullName(e)) : '<span class="t-muted">No one hurt</span>'}<div class="t-muted" style="font-size:13px">${esc(S.projects.get(x.projectId)?.name || "Head office")}</div></td><td class="num">${x.daysLost || 0}</td>
        <td>${mustReport(x) ? (x.reported ? `<span class="chip c-ok">Filed ${fmtDate(x.reported)}</span>` : '<span class="chip c-bad">Not filed</span>') : '<span class="t-muted">Not required</span>'}</td></tr>`; }).join("") || '<tr><td colspan="5" class="empty">No incidents logged.</td></tr>'}
      </tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>What the law asks</h2></div><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7">
      <li>Report lost-time injuries, occupational illnesses, fatalities and dangerous occurrences to the DOLE regional office on the Work Accident/Illness Report (WAIR).</li>
      <li>Submit the Annual Medical Report and keep a safety officer and first-aider on every site, in proportion to headcount and risk (DOLE DO 198-18).</li>
      <li>Every worker needs the 8-hour mandatory OSH orientation; track it on the Training page.</li></ul></section>`;
};
VIEWS.oshForm = () => {
  const x = S.view.id ? S.osh.get(S.view.id) : null; const v = x || { d: todayISO(), kind: "FIRST_AID" }; const cancel = x ? `data-osh="${x.id}"` : 'data-go="safety"';
  const projs = [...S.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  return backLink(cancel, x ? "Incident" : "Safety (OSH)") + head("Safety (OSH)", x ? "Edit incident" : "Log an incident") + `
    <form id="osh-form" class="card stack" style="gap:16px" data-keep novalidate><div class="form-grid">
      <div class="field"><label for="os-d">Date <span class="req">*</span></label><input class="input" id="os-d" type="date" value="${esc(v.d)}" required></div>
      <div class="field"><label for="os-kind">Type</label><select class="input" id="os-kind">${opts(Object.entries(OSHK).map(([k, a]) => [k, a[0]]), v.kind)}</select></div>
      <div class="field"><label for="os-proj">Site</label><select class="input" id="os-proj">${opts(projs.map((p) => [p.id, p.name]), v.projectId || "", "Head office")}</select></div>
      ${empPicker("os-emp", v.empId || "")}
      <div class="field"><label for="os-lost">Days lost</label><input class="input" id="os-lost" type="number" min="0" step="1" value="${v.daysLost || ""}" placeholder="0"></div>
      <div class="field"><label for="os-rep">Reported to DOLE on</label><input class="input" id="os-rep" type="date" value="${esc(v.reported || "")}"></div></div>
      <div class="field"><label for="os-desc">What happened <span class="req">*</span></label><textarea class="input" id="os-desc" rows="2" required>${esc(v.desc || "")}</textarea></div>
      <div class="field"><label for="os-cause">Cause</label><input class="input" id="os-cause" value="${esc(v.cause || "")}"></div>
      <div class="field"><label for="os-act">Corrective action</label><textarea class="input" id="os-act" rows="2">${esc(v.action || "")}</textarea></div>
      <p class="t-muted" style="margin:0;font-size:13px">Leave the employee blank for a near miss or dangerous occurrence where no one was hurt.</p>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="os-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" ${cancel}>Cancel</button><button class="btn btn-primary">Save incident</button></div></form>`;
};
VIEWS.osh = () => {
  const x = S.osh.get(S.view.id); if (!x) return notFound("Safety (OSH)", "Incident", "safety"); const e = S.emps.get(x.empId);
  return backLink('data-go="safety"', "Safety (OSH)") + head(fmtDate(x.d), OSHK[x.kind][0], S.canEdit ? `<button class="btn btn-ghost" data-edit-osh="${x.id}">Edit</button><button class="btn btn-ghost danger" data-del-osh="${x.id}">Delete</button>` : "") + `
    <section class="card"><dl class="facts">${tfact("Employee", e ? `<button class="link" data-emp="${e.id}">${esc(fullName(e))}</button>` : "No one hurt")}${tfact("Site", esc(S.projects.get(x.projectId)?.name || "Head office"))}${tfact("Days lost", String(x.daysLost || 0))}
      ${tfact("DOLE report", mustReport(x) ? (x.reported ? "Filed " + fmtDate(x.reported) : '<span class="chip c-bad">Not filed</span>') : "Not required")}${tfact("Cause", esc(x.cause))}</dl>
      <p style="margin:14px 0 0;font-size:15px;white-space:pre-line">${esc(x.desc)}</p>${x.action ? `<h3 style="font-size:15px;margin:14px 0 4px">Corrective action</h3><p style="margin:0;font-size:14px;white-space:pre-line">${esc(x.action)}</p>` : ""}
      ${S.canEdit && mustReport(x) && !x.reported ? `<button class="btn btn-primary btn-sm" style="margin-top:14px" data-osh-rep="${x.id}">Mark WAIR filed today</button>` : ""}</section>`;
};
async function submitOsh() {
  const err = $("#os-err"); const fail = (m) => { err.textContent = m; err.hidden = false; }; const prev = S.view.id ? S.osh.get(S.view.id) : null;
  const d = $("#os-d").value; const desc = $("#os-desc").value.trim(); if (!d || !desc) return fail("Enter the date and what happened.");
  const x = { ...(prev || { id: uid() }), d, kind: $("#os-kind").value, projectId: $("#os-proj").value || null, empId: $("#os-emp").value || null, daysLost: Number($("#os-lost").value) || 0, reported: $("#os-rep").value || null, desc, cause: $("#os-cause").value.trim() || null, action: $("#os-act").value.trim() || null };
  await put("osh", x); logActivity(`${prev ? "Updated" : "Logged"} a ${OSHK[x.kind][0].toLowerCase()} on ${fmtDate(d)}`); toast("Incident saved."); go("osh", { id: x.id });
}

/* ---------- biometric punch import ---------- */
const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
function parseStamp(s) {
  s = (s || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if (m) { let h = +m[4]; if (m[6]) h = (h % 12) + (/pm/i.test(m[6]) ? 12 : 0); return new Date(+m[3], +m[1] - 1, +m[2], h, +m[5]); }
  return null;
}
/* Turns IN/OUT punches into time sheet figures: lateness and undertime against the shift, overtime past the shift in 30-minute blocks,
   night hours from 10 PM to 6 AM, and hours on rest days and holidays in their own columns. */
function processPunches(rows, pid, o) {
  const byNo = new Map([...S.emps.values()].map((e) => [String(e.no).toLowerCase(), e])); const match = bioMatcher();
  const h = rows[0].map((x) => x.trim().toLowerCase()); const ci = (...names) => h.findIndex((x) => names.some((n) => x.includes(n)));
  const cNo = ci("employee no", "emp no", "id"), cTime = ci("date time", "datetime", "timestamp", "time"), cDate = h.indexOf("date"), cType = ci("type", "state", "in/out");
  if (cNo < 0 || cTime < 0) return { error: "The file needs an Employee No column and a Date Time column." };
  const punches = new Map(); let unmatched = 0, bad = 0, count = 0;
  for (const r of rows.slice(1)) {
    const e = byNo.get((r[cNo] || "").trim().toLowerCase()) || match(r[cNo]); if (!e) { unmatched++; continue; }
    const stamp = parseStamp(cDate >= 0 && cDate !== cTime ? `${r[cDate]} ${r[cTime]}` : r[cTime]); if (!stamp) { bad++; continue; }
    const type = cType >= 0 ? (/out/i.test(r[cType] || "") ? "OUT" : /in/i.test(r[cType] || "") ? "IN" : null) : null;
    (punches.get(e.id) || punches.set(e.id, []).get(e.id)).push({ t: stamp, type }); count++;
  }
  const patch = computePunches(punches, pid, o);
  return { patch, count, unmatched, bad, people: Object.keys(patch).length, raw: punches };
}
/* punches: Map of employee id to [{ t: Date, type: "IN" | "OUT" | null }], from a CSV, a terminal's attlog or phone clock-ins. */
function computePunches(punches, pid, o) {
  const p = PAY.period(pid); const Sx = SET();
  const hol = new Map(); for (const x of Sx.holidays) { hol.set(x.d, [...(hol.get(x.d) || []), x.type]); }
  const patch = {}; const leaves = allLeaves();
  for (const [eid, list] of punches) {
    const e = S.emps.get(eid); list.sort((a, b) => a.t - b.t); const shift = Sx.shifts.find((s) => s.id === (e.shiftId || "day")) || Sx.shifts[0];
    const v = { late: 0, ut: 0, ot: 0, rd: 0, rhw: 0, sh: 0, rdot: 0, rhot: 0, rhrd: 0, dhw: 0, nd: 0, abs: 0 }; const worked = new Set();
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.type === "OUT") continue; const b = list[i + 1]; if (!b || b.type === "IN" || b.t - a.t > 20 * 36e5) continue; i++;
      const day = PAY.iso(a.t); if (day < p.start || day > p.end) continue; worked.add(day);
      const base = new Date(a.t); base.setHours(0, 0, 0, 0); const sStart = new Date(base.getTime() + mins(shift.start) * 6e4);
      let sEnd = new Date(base.getTime() + mins(shift.end) * 6e4); if (sEnd <= sStart) sEnd = new Date(sEnd.getTime() + 864e5);
      const span = (b.t - a.t) / 36e5; const hrs = Math.min(8, Math.max(0, span > 5 ? span - 1 : span));
      const late = Math.max(0, (a.t - sStart) / 6e4); const ut = Math.max(0, (sEnd - b.t) / 6e4); const ot = Math.floor(Math.max(0, (b.t - sEnd) / 18e5)) / 2;
      let nd = 0; for (const off of [-1, 0]) { const ns = new Date(base.getTime() + (off * 24 + 22) * 36e5), ne = new Date(ns.getTime() + 8 * 36e5); nd += Math.max(0, (Math.min(b.t, ne) - Math.max(a.t, ns)) / 36e5); }
      v.nd += Math.round(nd * 2) / 2;
      const types = hol.get(day) || []; const regs = types.filter((x) => x === "REG").length; const rest = PAY.isRest(new Date(a.t), Sx);
      if (regs >= 2) { v.dhw += hrs; v.rhot += ot; } else if (regs === 1) { if (rest) v.rhrd += hrs; else v.rhw += hrs; v.rhot += ot; }
      else if (types.length || rest) { if (types.length) v.sh += hrs; else v.rd += hrs; v.rdot += ot; }
      else { v.late += late > o.grace ? Math.round(late) : 0; v.ut += Math.round(ut); v.ot += ot; }
    }
    if (o.absent) {
      const from = e.hire > p.start ? e.hire : p.start; const to = e.separated?.date && e.separated.date < p.end ? e.separated.date : p.end;
      if (from <= to) PAY.eachDay(from, to, (d, s) => { if (PAY.isRest(d, Sx) || hol.has(s) || worked.has(s)) return; if (leaves.some((l) => l.empId === eid && ["APPROVED"].includes(l.status) && l.from <= s && l.to >= s)) return; v.abs++; });
    }
    for (const k in v) v[k] = PAY.r2(v[k]);
    patch[eid] = v;
  }
  return patch;
}
VIEWS.punches = () => {
  const id = S.periodId || curPeriod(); const pv = S.punchPreview?.pid === id ? S.punchPreview : null; const final = isFinal(id);
  const keys = [["late", "Late (min)"], ["ut", "Undertime (min)"], ["ot", "OT (hrs)"], ["nd", "Night (hrs)"], ["rd", "Rest day"], ["sh", "Special day"], ["rhw", "Reg. holiday"], ["abs", "Absent"]];
  return head(`Pay period ${esc(PAY.period(id).label)}`, "Biometric import", `${periodSelect(id, "att")}<button class="btn btn-ghost" data-cmx="punchtpl">Download sample file</button>`) + `
    ${final ? '<div class="notice"><span><span class="chip c-ok">Final</span> This payroll is final. Reopen it to load punches.</span></div>' : ""}
    <section class="card"><div class="card-head"><h2>Load the time clock export</h2></div>
      <p style="margin:0 0 12px;font-size:14px;max-width:80ch">Export the attendance log from your biometric or face-recognition terminals as CSV with one row per punch: <b>Employee No</b>, <b>Date Time</b> (2026-10-01 07:58) and optionally <b>Type</b> (IN or OUT). Terminal attendance logs (attlog .dat files from ZKTeco and similar devices: user ID, date and time, verify mode, in/out state) load as they are; the device user ID is matched to the Biometric ID on each person's pay setup, or else to the employee number. Each IN is paired with the next OUT. Lateness and undertime are measured against each person's shift; overtime counts in 30-minute blocks after the shift; hours on rest days and holidays go to their own columns.</p>
      ${S.canEdit && !final ? `<form id="punch-form" class="form-grid" style="align-items:end" data-keep>
        <div class="field"><label for="pu-file">Punch file (CSV)</label><input id="pu-file" type="file" accept=".csv,.dat,.txt,text/csv,text/plain" required></div>
        <div class="field"><label for="pu-grace">Grace period for lateness (minutes)</label><input class="input" id="pu-grace" type="number" min="0" step="1" value="${grace()}"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="pu-abs" checked> Count workdays with no punches as absences</label>
        <button class="btn btn-primary">Read punches</button></form>` : ""}
      <p class="t-muted" style="margin:12px 0 0;font-size:13px">A live link that pulls punches from the terminals automatically needs the server version of the system; until then, export the log from the terminal or its software at each cutoff. Overtime still needs approval under company policy; adjust the time sheet before finalizing payroll if some of it wasn't authorized.</p></section>
    ${pv ? `<section class="card"><div class="card-head"><h2>Preview: ${pv.people} people from ${pv.count} ${pv.source === "phone" ? "phone clock-in " : ""}punches</h2>${S.canEdit && !final ? '<button class="btn btn-primary" data-punch-save>Save to time sheet</button>' : ""}</div>
      ${pv.unmatched || pv.bad ? `<p class="t-warn" style="margin:0 0 10px;font-size:14px">${pv.unmatched ? `${pv.unmatched} rows had an employee no. that isn't in the system. ` : ""}${pv.bad ? `${pv.bad} rows had a date and time that couldn't be read.` : ""}</p>` : ""}
      <div class="table-wrap"><table><thead><tr><th>Employee</th>${keys.map(([, l]) => `<th class="num">${l}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(pv.patch).slice(0, 60).map(([eid, v]) => `<tr><td>${esc(empName(eid))}</td>${keys.map(([k]) => `<td class="num">${v[k] || '<span class="t-muted">0</span>'}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>${pv.people > 60 ? `<p class="t-muted" style="margin:10px 0 0;font-size:13px">Showing 60 of ${pv.people}.</p>` : ""}
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Saving replaces these columns for these people in the time sheet. Allowances and other deductions already entered stay.</p></section>` : ""}`;
};

/* ---------- compliance alerts ---------- */
function alerts() {
  const out = []; const today = todayISO(); const y = today.slice(0, 4); const emps = active();
  const add = (sev, area, text, act, label) => out.push({ sev, area, text, act, label });
  for (const e of emps) {
    const days = daysBetween(e.hire, today);
    if (e.status === "PROBATIONARY") {
      const done = listOf(S.reviews).some((r) => r.empId === e.id && r.type === "REGULARIZATION" && r.status === "DONE");
      if (!done && days >= 150) add("crit", "Probation", `${fullName(e)} is in month 5 of probation. Evaluate before ${fmtDate(regDue(e))}, when they become regular by law.`, `data-new-review="REGULARIZATION:${e.id}"`, "Evaluate");
      else if (!done && days >= 120) add("warn", "Probation", `${fullName(e)} reached month 4 of probation. Plan the regularization evaluation (due ${fmtDate(regDue(e))}).`, `data-emp="${e.id}"`, "Open");
    }
    if (e.status === "CASUAL") {
      if (days >= 365) add("crit", "Casual", `${fullName(e)} has worked over a year as casual and is now a regular employee by law (Art. 295). Update the status.`, `data-edit-emp="${e.id}"`, "Update");
      else if (days >= 330) add("warn", "Casual", `${fullName(e)} reaches one year as casual on ${fmtDate(addDays(e.hire, 365))}. Decide on regularization.`, `data-emp="${e.id}"`, "Open");
    }
    if (days <= 30 && (!e.sss || !e.philhealth || !e.pagibig || !e.tin)) add("warn", "Government", `Register ${fullName(e)} with SSS, PhilHealth and Pag-IBIG within 30 days of hiring (by ${fmtDate(addDays(e.hire, 30))}). Numbers missing.`, `data-emp="${e.id}"`, "Open");
  }
  for (const c of listOf(S.cases)) {
    const e = S.emps.get(c.empId); if (!e || c.decision?.d) continue; const day = daysBetween(c.nte, today) + 1;
    if (!c.reply?.d && day <= 5) add("info", "Discipline", `${fullName(e)}: reply period day ${Math.max(1, day)} of 5 on "${c.offense}". No decision before ${fmtDate(addDays(c.nte, 5))}.`, `data-case="${c.id}"`, "Open");
    else add("warn", "Discipline", `${fullName(e)}: decide the case on "${c.offense}" and serve the notice of decision.`, `data-case="${c.id}"`, "Open");
  }
  for (const o of listOf(S.offb)) {
    const e = S.emps.get(o.empId); if (!e || o.closed) continue;
    if (e.separated && !o.released) { const left = daysBetween(today, addDays(o.last, 30)); add(left < 0 ? "crit" : left <= 7 ? "warn" : "info", "Final pay", `${fullName(e)}: final pay ${left < 0 ? `was due ${fmtDate(addDays(o.last, 30))}` : `due in ${left} days (${fmtDate(addDays(o.last, 30))})`}, with the COE and BIR 2316.`, `data-offb="${o.empId}"`, "Open"); }
    if (o.reason === "Termination for authorized cause" && o.notice && o.last < addDays(o.notice, 30)) add("crit", "Separation", `${fullName(e)}: the last day is less than 30 days after the notice to the employee and DOLE (${fmtDate(o.notice)}). Move it to ${fmtDate(addDays(o.notice, 30))} or later.`, `data-offb="${o.empId}"`, "Open");
  }
  for (const x of listOf(S.osh)) if (mustReport(x) && !x.reported) add("crit", "Safety", `${OSHK[x.kind][0]} on ${fmtDate(x.d)}${S.emps.get(x.empId) ? " (" + fullName(S.emps.get(x.empId)) + ")" : ""} is not reported to DOLE yet.`, `data-osh="${x.id}"`, "Open");
  for (const l of allLeaves()) if (l.type === "SL" && l.status !== "REJECTED" && l.status !== "CANCELLED" && l.days >= 4 && !l.sssFiled && daysBetween(l.from, today) <= 30 && daysBetween(l.from, today) >= -5) {
    const e = S.emps.get(l.empId); if (e) add("warn", "SSS", `${fullName(e)} is on ${l.days} days of sick leave from ${fmtDate(l.from)}. File the SSS sickness notification so they can claim the benefit.`, `data-sss-filed="${l.month}:${l.id}"`, "Mark filed");
  }
  for (const p of S.projects.values()) {
    const ended = p.status === "COMPLETED" || (p.end && p.end < today); const n = emps.filter((e) => e.projectId === p.id).length;
    if (ended && n) add("warn", "Projects", `${p.name} has ended but ${n} people are still assigned. End or move their project contracts, and file the termination report with DOLE for project-based workers released.`, `data-project="${p.id}"`, "Open");
  }
  const noPrev = emps.filter((e) => e.hire > `${y}-01-01` && !(e.prev?.year === y)).length;
  if (noPrev) add("info", "Tax", `${noPrev} people hired this year have no previous-employer BIR 2316 recorded, so year-end tax can't be annualized correctly.`, `data-tax-go="prev"`, "Review");
  const inc201 = emps.filter((e) => f201Pct(e) < 100).length;
  if (inc201) add("info", "201 files", `${inc201} employees have incomplete 201 files.`, `data-comp-tab="f201"`, "Review");
  extraAlerts(add, today);
  const rank = { crit: 0, warn: 1, info: 2 }; return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}
const SEV = { crit: ["Act now", "c-bad"], warn: ["Due soon", "c-warn"], info: ["Heads-up", "c-blue"] };
function complyTicker() {
  const list = alerts(); if (!list.length) return ""; const n = (s) => list.filter((a) => a.sev === s).length;
  return `<section class="card" aria-label="Compliance alerts"><div class="card-head"><h2>${icon("alert", 18)} Compliance alerts</h2><span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${n("crit") ? `<span class="chip c-bad">${n("crit")} act now</span>` : ""}${n("warn") ? `<span class="chip c-warn">${n("warn")} due soon</span>` : ""}<button class="link" data-go="comply">See all ${list.length}</button></span></div>
    <ul class="list" style="font-size:14px">${list.slice(0, 4).map((a) => `<li style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap"><span style="flex:1;min-width:220px"><span class="chip ${SEV[a.sev][1]}" style="margin-right:6px">${esc(a.area)}</span>${esc(a.text)}</span><button class="btn btn-ghost btn-sm" ${a.act}>${esc(a.label)}</button></li>`).join("")}</ul></section>`;
}
VIEWS.comply = () => {
  const tab = S.compTab; const list = alerts();
  const tabs = `<div class="tabs on-blue" role="tablist">${[["alerts", `Alerts (${list.length})`], ["f201", "201 files"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-comp-tab="${k}">${l}</button>`).join("")}</div>`;
  if (tab === "f201") return head("Documents every employee's 201 file needs", "Compliance", '<button class="btn btn-ghost" data-cmx="f201">Download 201 status (CSV)</button>') + tabs + f201Tab();
  const areas = [...new Set(list.map((a) => a.area))];
  return head("Labor law deadlines across the company", "Compliance") + tabs + `
    <section class="stats">${["crit", "warn", "info"].map((s) => `<div class="card stat"><span class="label">${SEV[s][0]}</span><span class="value">${list.filter((a) => a.sev === s).length}</span><span class="note t-muted">${{ crit: "overdue or legally at risk", warn: "deadline coming", info: "worth a look" }[s]}</span></div>`).join("")}</section>
    ${areas.map((ar) => `<section class="card"><div class="card-head"><h2>${esc(ar)}</h2></div><ul class="list" style="font-size:14px">${list.filter((a) => a.area === ar).map((a) => `<li style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:10px"><span style="flex:1;min-width:220px"><span class="chip ${SEV[a.sev][1]}" style="margin-right:6px">${SEV[a.sev][0]}</span>${esc(a.text)}</span>${a.act && (S.canEdit || !/sss-filed|edit-emp|new-review/.test(a.act)) ? `<button class="btn btn-ghost btn-sm" ${a.act}>${esc(a.label)}</button>` : ""}</li>`).join("")}</ul></section>`).join("") || '<section class="card"><p class="t-ok" style="margin:0">Nothing needs attention.</p></section>'}`;
};
function f201Tab() {
  const f = S.f201Filter; const q = f.q.trim().toLowerCase();
  const all = active().map((e) => ({ e, st: f201Status(e) })).map((r) => ({ ...r, n: r.st.filter((x) => x.done).length }));
  const list = all.filter((r) => (f.show !== "missing" || r.n < F201.length) && (!q || `${fullName(r.e)} ${r.e.no}`.toLowerCase().includes(q))).sort((a, b) => a.n - b.n || a.e.last.localeCompare(b.e.last));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(f.page, pages); const page = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const byItem = F201.map(([k, label]) => ({ label, miss: all.filter((r) => !r.st.find((x) => x.k === k).done).length }));
  return `<section class="stats"><div class="card stat"><span class="label">Complete 201 files</span><span class="value">${all.filter((r) => r.n === F201.length).length}</span><span class="note t-muted">of ${all.length} active employees</span></div>
      ${byItem.filter((b) => b.miss).sort((a, b) => b.miss - a.miss).slice(0, 3).map((b) => `<div class="card stat"><span class="label">Missing: ${esc(b.label)}</span><span class="value">${b.miss}</span><span class="note t-muted">employees</span></div>`).join("")}</section>
    <section class="card"><div class="card-head"><h2>201 files</h2></div>
      <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div class="field" style="grid-column:span 2"><label for="f2-q">Search</label><input class="input" id="f2-q" type="search" value="${esc(f.q)}" data-cfilter="f201:q" placeholder="Name or employee no."></div>
        <div class="field"><label for="f2-show">Show</label><select class="input" id="f2-show" data-cfilter="f201:show">${opts([["missing", "Incomplete only"], ["all", "Everyone"]], f.show)}</select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Complete</th><th>Missing</th></tr></thead><tbody>
      ${page.map((r) => `<tr class="go" data-emp="${r.e.id}" tabindex="0"><td><b>${esc(fullName(r.e))}</b><div class="t-muted" style="font-size:13px">${esc(r.e.no)} · hired ${fmtDate(r.e.hire)}</div></td><td class="num">${r.n} of ${F201.length}</td><td style="font-size:14px">${r.st.filter((x) => !x.done).map((x) => esc(x.label)).join(", ") || '<span class="t-ok">Nothing</span>'}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">Every 201 file is complete.</td></tr>'}
      </tbody></table></div>
      <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} people · page ${f.page} of ${pages}</span><span style="display:flex;gap:8px">${f.page > 1 ? '<button class="btn btn-ghost btn-sm" data-cpage="f201:-1">Previous</button>' : ""}${f.page < pages ? '<button class="btn btn-ghost btn-sm" data-cpage="f201:1">Next</button>' : ""}</span></nav></section>`;
}

/* ---------- CSV ---------- */
function complyExport(kind) {
  const y = taxYear(); const name = (e) => [e.last, e.first, e.middle || ""];
  if (kind === "loans") return offer(`loans-${todayISO()}.csv`, toCSV([["Employee No", "Name", "Type", "Loan No", "Granted", "Amount", "Paid", "Balance", "Per Cutoff", "First Deduction", "Status"],
    ...listOf(S.loans).filter((ln) => S.emps.get(ln.empId)).map((ln) => { const e = S.emps.get(ln.empId); return [e.no, fullName(e), LTYPE[ln.type], ln.ref, ln.granted, ln.principal, PAY.r2(loanPaid(ln)), loanBal(ln), ln.amort, PAY.period(ln.start).label, LSTAT[ln.status][0]]; })]));
  if (kind === "loanremit") {
    const month = PAY.shiftPeriod(curPeriod(), -2).slice(0, 7); const ids = [month + "-1", month + "-2"];
    return offer(`loan-remittance-${month}.csv`, toCSV([["Lender", "Member No", "Last Name", "First Name", "Middle Name", "Loan Type", "Loan No", "Amount Deducted"],
      ...listOf(S.loans).filter((ln) => isGovLoan(ln) && S.emps.get(ln.empId)).map((ln) => { const e = S.emps.get(ln.empId); const amt = PAY.r2(ids.reduce((a, id) => a + (ln.payments?.[id] || 0), 0)); return amt ? [ln.type.startsWith("SSS") ? "SSS" : "Pag-IBIG", ln.type.startsWith("SSS") ? e.sss : e.pagibig, ...name(e), LTYPE[ln.type], ln.ref, amt] : null; }).filter(Boolean)]));
  }
  if (kind === "annual") return offer(`tax-annualization-${y}.csv`, toCSV([["Employee No", "TIN", "Name", "From", "To", "Gross", "Non-taxable 13th month and benefits", "De minimis", "Employee contributions", "Taxable present employer", "Taxable previous employer", "13th month over cap", "Annual taxable", "Tax due", "Tax withheld", "Refund (-) or collect (+)", "Projected"],
    ...annualRows(y).map(({ e, a }) => [e.no, e.tin, fullName(e), a.from, a.end, a.gross, a.t13Ex, a.deMin, a.contrib, a.taxable, a.prev?.taxable || 0, a.t13Tax, a.annualTaxable, a.due, a.withheld, a.adj, a.drafts ? "Yes" : "No"])]));
  if (kind === "alphalist") return offer(`alphalist-${y}.csv`, toCSV([["Schedule", "Seq No", "TIN", "Last Name", "First Name", "Middle Name", "Employment From", "Employment To", "Gross Compensation", "13th Month and Other Benefits (Non-taxable)", "De Minimis", "SSS/PhilHealth/Pag-IBIG", "Salaries and Other Non-taxable", "Taxable Basic and Others", "Previous Employer Taxable", "Total Taxable", "Tax Due", "Tax Withheld", "Over/(Under) Withheld", "Minimum Wage Earner"],
    ...annualRows(y).map(({ e, a }, i) => [e.separated ? "1 (separated)" : "2 (employed Dec 31)", String(i + 1).padStart(5, "0"), (e.tin || "").replace(/\D/g, "").slice(0, 9), ...name(e).map((s) => s.toUpperCase()), a.from, a.end, PAY.r2(a.gross + a.t13), a.t13Ex, a.deMin, a.contrib, a.ntOther, PAY.r2(a.taxable + a.t13Tax), a.prev?.taxable || 0, a.annualTaxable, a.due, a.withheld, PAY.r2(-a.adj), a.mwe ? "Yes" : "No"])]));
  if (kind === "osh") return offer(`osh-log-${todayISO()}.csv`, toCSV([["Date", "Type", "Employee No", "Name", "Site", "Days Lost", "What Happened", "Cause", "Corrective Action", "Reported to DOLE"],
    ...listOf(S.osh).sort((a, b) => a.d.localeCompare(b.d)).map((x) => { const e = S.emps.get(x.empId); return [x.d, OSHK[x.kind][0], e?.no || "", e ? fullName(e) : "", S.projects.get(x.projectId)?.name || "Head office", x.daysLost || 0, x.desc, x.cause, x.action, x.reported || (mustReport(x) ? "Not filed" : "Not required")]; })]));
  if (kind === "f201") return offer(`201-files-${todayISO()}.csv`, toCSV([["Employee No", "Name", ...F201.map(([, l]) => l)], ...active().map((e) => [e.no, fullName(e), ...f201Status(e).map((x) => (x.done ? "Yes" : "Missing"))])]));
  if (kind === "punchtpl") { const p = PAY.period(S.periodId || curPeriod()); const e = active().slice(0, 2); return offer("punches-sample.csv", toCSV([["Employee No", "Date Time", "Type"], ...e.flatMap((x) => [[x.no, `${p.start} 07:58`, "IN"], [x.no, `${p.start} 18:35`, "OUT"]])])); }
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-loan],[data-edit-loan],[data-new-loan],[data-loan-set],[data-del-loan],[data-cmx],[data-cpage],[data-tax-tab],[data-tax-go],[data-apply-annual],[data-bir2316],[data-comp-tab],[data-osh],[data-edit-osh],[data-del-osh],[data-osh-rep],[data-pay-setup],[data-punch-save],[data-del-wage],[data-sss-filed]");
  if (!t) return; const d = t.dataset; const has = (a) => t.hasAttribute("data-" + a);
  try {
    if (d.loan) { go("loan", { id: d.loan }); return; }
    if (d.editLoan) { go("loanForm", { id: d.editLoan }); return; }
    if (has("new-loan")) { go("loanForm", { emp: d.newLoan || "" }); return; }
    if (d.loanSet) { const [id, st] = d.loanSet.split(":"); const ln = S.loans.get(id); await put("loans", { ...ln, status: st }); logActivity(`${LSTAT[st][0]}: ${LTYPE[ln.type].toLowerCase()} of ${empName(ln.empId)}`); toast("Loan updated."); render(); return; }
    if (d.delLoan) { if (!armed(t)) return; await drop("loans", d.delLoan); logActivity("Deleted a loan"); toast("Loan deleted."); go("loans"); return; }
    if (d.cmx) return complyExport(d.cmx);
    if (d.cpage) { const [k, n] = d.cpage.split(":"); const f = { loan: S.loanFilter, tax: S.taxFilter, f201: S.f201Filter }[k]; f.page += Number(n); render(); return; }
    if (d.taxTab) { S.taxTab = d.taxTab; render(); return; }
    if (d.taxGo) { S.taxTab = d.taxGo; go("tax"); return; }
    if (d.applyAnnual) { t.disabled = true; await applyAnnual(d.applyAnnual); return; }
    if (d.bir2316) { const [id, y] = d.bir2316.split(":"); if (!S.yearsLoaded.has(y)) { await ensureYear(y); } return bir2316(id, y); }
    if (d.compTab) { S.compTab = d.compTab; if (S.view.name !== "comply") go("comply"); else render(); return; }
    if (d.osh) { go("osh", { id: d.osh }); return; }
    if (d.editOsh) { go("oshForm", { id: d.editOsh }); return; }
    if (d.delOsh) { if (!armed(t)) return; await drop("osh", d.delOsh); logActivity("Deleted a safety incident"); toast("Incident deleted."); go("safety"); return; }
    if (d.oshRep) { const x = S.osh.get(d.oshRep); await put("osh", { ...x, reported: todayISO() }); logActivity(`Filed the DOLE report for the ${OSHK[x.kind][0].toLowerCase()} on ${fmtDate(x.d)}`); toast("Marked filed."); render(); return; }
    if (d.paySetup) { go("paySetup", { id: d.paySetup }); return; }
    if (has("punch-save")) { const pv = S.punchPreview; t.disabled = true; await savePeriodRows(pv.pid, pv.patch); if (pv.raw) await saveBioPunches(pv.raw); logActivity(`Loaded biometric punches for ${pv.people} people (${PAY.period(pv.pid).label})`); S.punchPreview = null; toast(`Time sheet updated for ${pv.people} people.`); go("attendance"); return; }
    if (d.delWage) { await saveSettings({ regionWages: SET().regionWages.filter((w) => w.region !== d.delWage) }, `Removed the minimum wage for ${d.delWage}`); return; }
    if (d.sssFiled) { const [month, id] = d.sssFiled.split(":"); const doc = S.leaveDocs.get(month); await S.db.doc("leaves/" + month).update({ items: { [id]: { sssFiled: todayISO() } } }); S.leaveDocs.set(month, { ...doc, items: { ...doc.items, [id]: { ...doc.items[id], sssFiled: todayISO() } } }); S.ver++; logActivity("Filed an SSS sickness notification"); toast("Marked filed."); render(); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return; const t = ev.target; if (!t.matches?.("tr.go")) return;
  if (t.dataset.loan) go("loan", { id: t.dataset.loan }); else if (t.dataset.osh) go("osh", { id: t.dataset.osh });
});
document.addEventListener("input", (ev) => {
  const t = ev.target; if (!t.dataset.cfilter || t.tagName === "SELECT") return;
  const [k, field] = t.dataset.cfilter.split(":"); const f = { loan: S.loanFilter, tax: S.taxFilter, f201: S.f201Filter }[k]; f[field] = t.value; f.page = 1; render();
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.dataset.cfilter && t.tagName === "SELECT") { const [k, field] = t.dataset.cfilter.split(":"); const f = { loan: S.loanFilter, tax: S.taxFilter, f201: S.f201Filter }[k]; f[field] = t.value; f.page = 1; render(); return; }
  if (t.hasAttribute("data-tax-year")) { S.taxYear = t.value; S.taxFilter.page = 1; render(); return; }
  if (t.dataset.f201 && S.canEdit) { const [id, k] = t.dataset.f201.split(":"); t.disabled = true; try { await toggle201(id, k, t.checked); render(); } catch { toast("Couldn't save. Try again."); render(); } return; }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["loan-form", "osh-form", "paysetup-form", "move-form", "punch-form", "wage-form"].includes(f.id)) return; ev.preventDefault(); if (!S.canEdit) return;
  try {
    if (f.id === "loan-form") return await submitLoan();
    if (f.id === "osh-form") return await submitOsh();
    if (f.id === "paysetup-form") return await submitPaySetup();
    if (f.id === "move-form") return await submitMove(f);
    if (f.id === "wage-form") { const region = $("#w-region").value; const wage = Number($("#w-wage").value) || 0; if (!wage) return; await saveSettings({ regionWages: [...SET().regionWages.filter((w) => w.region !== region), { region, wage }].sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region)) }, `Set the ${region} minimum wage to ${peso.format(wage)}`); return; }
    if (f.id === "punch-form") {
      const file = $("#pu-file").files[0]; if (!file) return; const text = await file.text(); const pid = S.periodId || curPeriod(); const o = { grace: Number($("#pu-grace").value) || 0, absent: $("#pu-abs").checked };
      let r;
      if (isAttlog(text)) { const a = attlogPunches(text); const patch = computePunches(a.punches, pid, o); r = { ...a, punches: undefined, raw: a.punches, patch, people: Object.keys(patch).length }; }
      else { const rows = parseCSV(text); if (rows.length < 2) { toast("That file has no rows."); return; } r = processPunches(rows, pid, o); }
      if (r.error) { toast(r.error); return; } if (!r.people) { toast(`No punches in ${PAY.period(pid).label} matched an employee.`); return; }
      S.punchPreview = { pid, ...r }; render(); return;
    }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});
