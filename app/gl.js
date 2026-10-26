/* ---------- Payroll journal entry for accounting (Glenn 2026-10-26) ----------
   Payroll › Payroll journal entry turns a cutoff's payroll into the entry the books need: pay and the employer's SSS,
   PhilHealth and Pag-IBIG share as expenses, charged to each project or Head Office, against what is owed to employees
   (net pay), the agencies, BIR and the loan lenders. Debits always equal credits. Account codes are set once on the page
   (org/ops.gl) and the entry downloads as a CSV the accounting system can import. Confidential pay is left out for
   everyone else; Owners, Executives and chosen staff can download it separately. */
const GL_ACCTS = [
  ["sal", "Salaries and wages", "D"], ["prem", "Overtime, holiday and night differential pay", "D"], ["comm", "Commissions", "D"],
  ["allow", "Allowances and benefits", "D"], ["sssx", "SSS and EC contributions (employer)", "D"], ["phx", "PhilHealth contributions (employer)", "D"],
  ["hdx", "Pag-IBIG contributions (employer)", "D"],
  ["netp", "Salaries payable (net pay)", "C"], ["sssp", "SSS payable", "C"], ["php", "PhilHealth payable", "C"], ["hdp", "Pag-IBIG payable", "C"],
  ["wtax", "Withholding tax payable (compensation)", "C"], ["sssl", "SSS loans payable", "C"], ["hdl", "Pag-IBIG loans payable", "C"],
  ["advr", "Company loans and cash advances (receivable)", "C"], ["othd", "Other payroll deductions", "C"], ["rnd", "Rounding difference", "D"],
];
const GL_EXP = new Set(["sal", "prem", "comm", "allow", "sssx", "phx", "hdx", "rnd"]); // charged to a project or Head Office
const glCfg = () => S.ops?.gl || {};
const glName = (k) => glCfg().names?.[k] || GL_ACCTS.find(([x]) => x === k)?.[1] || k;
const glCode = (k) => glCfg().codes?.[k] || "";
function glLoanAcct(lid) { const t = S.loans?.get?.(lid)?.type || ""; return /^SSS/.test(t) ? "sssl" : /^HDMF/.test(t) ? "hdl" : "advr"; }
/* One entry from a run's lines: { rows: [{k, cc, dr, cr}], dr, cr }. */
function glEntry(lines, empOf) {
  const m = new Map(); const add = (k, cc, amt) => { amt = PAY.r2(amt); if (!amt) return; const key = k + "|" + (GL_EXP.has(k) ? cc : ""); m.set(key, PAY.r2((m.get(key) || 0) + amt)); };
  for (const [id, l] of Object.entries(lines || {})) {
    const e = empOf(id); const cc = typeof chargeName === "function" ? chargeName(l, e) : "Head Office"; const n = (x) => Number(l[x]) || 0;
    const prem = n("ot") + n("rd") + n("rhw") + n("sh") + n("nd") + n("xp"); const comm = n("comm");
    const allow = n("allowN") + n("allowT") + n("flexN") + n("flexE") + n("flexB") + n("flexT");
    add("sal", cc, n("gross") - prem - comm - allow); add("prem", cc, prem); add("comm", cc, comm); add("allow", cc, allow);
    add("sssx", cc, n("sssEr") + n("ec")); add("phx", cc, n("phEr")); add("hdx", cc, n("hdEr"));
    add("netp", cc, n("net")); add("sssp", cc, n("sss") + n("sssEr") + n("ec")); add("php", cc, n("ph") + n("phEr")); add("hdp", cc, n("hd") + n("hdEr"));
    add("wtax", cc, n("tax")); add("othd", cc, n("ded"));
    let ln = 0; for (const [lid, amt] of Object.entries(l.loans || {})) { add(glLoanAcct(lid), cc, amt); ln += Number(amt) || 0; }
    if (PAY.r2(n("loanTot") - ln)) add("advr", cc, n("loanTot") - ln); // loan amounts without a breakdown
  }
  const side = (k) => GL_ACCTS.find(([x]) => x === k)[2];
  let rows = [...m].map(([key, amt]) => { const [k, cc] = key.split("|"); const d = side(k) === "D"; return { k, cc, dr: d ? amt : 0, cr: d ? 0 : amt }; });
  const sum = (f) => PAY.r2(rows.reduce((a, r) => a + r[f], 0)); const diff = PAY.r2(sum("cr") - sum("dr"));
  // Each payslip figure is rounded to the centavo on its own, so a large payroll can be a few centavos apart.
  if (diff) rows.push({ k: "rnd", cc: "", dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 });
  const order = (k) => GL_ACCTS.findIndex(([x]) => x === k);
  rows.sort((a, b) => order(a.k) - order(b.k) || String(a.cc).localeCompare(String(b.cc)));
  return { rows, dr: sum("dr"), cr: sum("cr") };
}
const glEmp = (id) => S.allEmps?.get?.(id) || S.emps.get(id);
function glCsv(entry, pid, ref) {
  const p = PAY.period(pid);
  return toCSV([["Date", "Reference", "Account code", "Account name", "Cost center", "Debit", "Credit", "Description"],
    ...entry.rows.map((r) => [p.end, ref, glCode(r.k), glName(r.k), r.cc, r.dr || "", r.cr || "", `Payroll ${p.label}`])]);
}
VIEWS.payje = () => {
  const id = S.periodId || curPeriod(); const p = PAY.period(id); ensureRun(id); const run = payrun(id);
  const E = glEntry(run.lines, glEmp); const ok = Math.abs(E.dr - E.cr) < 0.005;
  const byAcct = new Map(); for (const r of E.rows) { const x = byAcct.get(r.k) || { dr: 0, cr: 0 }; x.dr = PAY.r2(x.dr + r.dr); x.cr = PAY.r2(x.cr + r.cr); byAcct.set(r.k, x); }
  const detail = !!S.glDetail; const show = detail ? E.rows : [...byAcct].map(([k, x]) => ({ k, cc: "", ...x }));
  const confN = [...(S.allEmps || S.emps).values()].filter((e) => e.conf).length;
  const cfOk = typeof canConf === "function" && canConf() && typeof cfRun === "function" && Object.keys(cfRun(id)?.lines || {}).length;
  const ed = S.canEdit && S.realEdit;
  return head(`Pay period ${esc(p.label)}`, "Payroll journal entry", `${periodSelect(id, "pay")}<button class="btn btn-ghost" data-gl-csv="main"${E.rows.length ? "" : " disabled"}>Download entry (CSV)</button>${cfOk ? '<button class="btn btn-ghost" data-gl-csv="conf">Confidential entry (CSV)</button>' : ""}`) + `
    <div class="notice"><span>${run.final ? '<span class="chip c-ok">Final</span> From the finalized payroll.' : run.missing ? '<span class="chip c-warn">Loading</span> Fetching the saved payroll…' : '<span class="chip c-warn">Draft</span> Payroll isn\'t final yet, so these figures can still change. Book the entry after you finalize.'}
      ${ok ? '<span class="chip c-ok">Debits equal credits</span>' : '<span class="chip c-bad">Out of balance</span>'}${confN && !cfOk ? ` ${confN} ${confN === 1 ? "person has" : "people have"} confidential pay, which isn't included here.` : ""}</span></div>
    <section class="card"><div class="card-head"><h2>Entry</h2><div class="seg" role="group" aria-label="Show"><button aria-pressed="${!detail}" data-gl-detail="0">By account</button><button aria-pressed="${detail}" data-gl-detail="1">By project</button></div></div>
      ${E.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Account code</th><th>Account</th>${detail ? "<th>Charged to</th>" : ""}<th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
        ${show.map((r) => `<tr><td>${esc(glCode(r.k)) || '<span class="t-muted">—</span>'}</td><td>${esc(glName(r.k))}</td>${detail ? `<td>${esc(r.cc)}</td>` : ""}<td class="num">${r.dr ? money(r.dr) : ""}</td><td class="num">${r.cr ? money(r.cr) : ""}</td></tr>`).join("")}
        <tr><td></td><td><b>Total</b></td>${detail ? "<td></td>" : ""}<td class="num"><b>${money(E.dr)}</b></td><td class="num"><b>${money(E.cr)}</b></td></tr></tbody></table></div>`
        : '<p class="t-muted" style="margin:0">No payroll lines for this cutoff yet.</p>'}
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Expenses are charged to each person's project, or Head Office. Amounts owed to employees, SSS, PhilHealth, Pag-IBIG, BIR and lenders are in total. Dated the last day of the cutoff.</p></section>
    <section class="card"><div class="card-head"><h2>Account codes</h2><span class="t-muted" style="font-size:13px">Use the codes and names from your chart of accounts</span></div>
      ${ed ? `<form id="gl-form"><div class="table-wrap"><table><thead><tr><th>Account</th><th>Code</th><th>Name in your books</th></tr></thead><tbody>
        ${GL_ACCTS.map(([k, l, s]) => `<tr><td>${esc(l)} <span class="chip c-gray">${s === "D" ? "Debit" : "Credit"}</span></td><td><input class="input" name="c_${k}" value="${esc(glCfg().codes?.[k] || "")}" maxlength="30" style="width:120px" aria-label="Code for ${esc(l)}"></td><td><input class="input" name="n_${k}" value="${esc(glCfg().names?.[k] || "")}" maxlength="80" placeholder="${esc(l)}" aria-label="Name for ${esc(l)}"></td></tr>`).join("")}
      </tbody></table></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-primary">Save account codes</button></div></form>`
        : `<p class="t-muted" style="margin:0">${Object.keys(glCfg().codes || {}).length ? "Set by Payroll." : "Not set yet. Payroll staff set them here."}</p>`}</section>`;
};
document.addEventListener("click", (ev) => {
  const t = ev.target.closest?.("[data-gl-csv],[data-gl-detail]"); if (!t || S.view?.name !== "payje") return;
  if (t.dataset.glDetail) { S.glDetail = t.dataset.glDetail === "1"; render(); return; }
  const id = S.periodId || curPeriod();
  if (t.dataset.glCsv === "conf") { if (!(typeof canConf === "function" && canConf())) return; return offer(`journal-entry-confidential-${id}.csv`, glCsv(glEntry(cfRun(id).lines, glEmp), id, `PAYROLL-${id}-C`)); }
  const E = glEntry(payrun(id).lines, glEmp); if (!E.rows.length) return;
  logActivity(`Downloaded the payroll journal entry for ${PAY.period(id).label}`);
  return offer(`journal-entry-${id}.csv`, glCsv(E, id, `PAYROLL-${id}`));
});
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "gl-form") return; ev.preventDefault(); if (!S.canEdit) return; if (S.ops === undefined) { toast("Settings are still loading. Try again."); return; }
  const f = new FormData(ev.target); const codes = {}, names = {};
  for (const [k] of GL_ACCTS) { const c = String(f.get("c_" + k) || "").trim().slice(0, 30), n = String(f.get("n_" + k) || "").trim().slice(0, 80); if (c) codes[k] = c; if (n) names[k] = n; }
  const next = { ...(S.ops || {}), gl: { codes, names } };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity("Updated the payroll account codes"); toast("Account codes saved."); render(); }
  catch { toast("Couldn't save. Try again."); }
});
// Payroll page: a button to the entry next to the bank file.
{ const b = VIEWS.payroll; VIEWS.payroll = (...a) => b(...a).replace('<button class="btn btn-ghost" data-payx="bank">Bank file (CSV)</button>', '$&<button class="btn btn-ghost" data-go="payje">Journal entry</button>'); }
