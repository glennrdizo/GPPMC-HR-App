/* ---------- Government remittance files (Glenn 2026-10-20: full automation) ----------
   Once both cutoffs of a month are final, the scheduled run (runner.js) prepares the month's filing pack: it saves the totals,
   head count and anyone missing an SSS, PhilHealth, Pag-IBIG or TIN number on remit/<month>.pack, and the notice job emails
   HR that the month is ready to file. The Gov't Contributions page shows the pack: due date and status per agency, the upload
   file in each agency's layout (SSS R-3 list, PhilHealth RF-1 / EPRS, Pag-IBIG MCRF / eSRS), the BIR 1601-C figures, and the
   company's employer numbers. "Mark filed" (ops.js) records the filing and stops the reminders. */
const RM_ID = { sss: ["sss", "SSS"], ph: ["philhealth", "PhilHealth"], hdmf: ["pagibig", "Pag-IBIG"], bir: ["tin", "TIN"] };
const rmMonthOf = () => S.month || PAY.shiftPeriod(curPeriod(), -2).slice(0, 7);
const rmLabel = (m) => new Date(m + "-01T00:00:00").toLocaleString("en-PH", { month: "long", year: "numeric" });
const rmDigits = (s) => String(s || "").replace(/\D/g, "");
/* New hires and people who left in the month: SSS, PhilHealth and Pag-IBIG want them flagged on the list. */
function rmStatus(e, month) {
  const sep = e.separated?.date || ""; if (sep.startsWith(month)) return ["S", sep];
  if ((e.hire || "").startsWith(month)) return ["N", e.hire]; return ["", ""];
}
/* BIR 1601-C items 14 to 25 from the month's payroll lines. */
function bir1601c(runs) {
  const t = { gross: 0, mwe: 0, mweX: 0, b13: 0, dm: 0, gov: 0, otherN: 0, notSub: 0, tax: 0 };
  for (const r of runs) for (const l of Object.values(r.lines || {})) {
    t.gross += l.gross || 0; t.tax += l.tax || 0;
    const mwe = l.mwe ? regularPay(l) : 0; const mweX = l.mwe ? (l.hol || 0) + (l.ot || 0) + (l.nd || 0) + (l.rd || 0) + (l.rhw || 0) + (l.sh || 0) + (l.xp || 0) : 0;
    const dm = (l.allowN || 0) + (l.flexN || 0) + (l.flexE || 0) + (l.flexB || 0); const gov = (l.sss || 0) + (l.ph || 0) + (l.hd || 0);
    const nonTax = Math.max(0, (l.gross || 0) - (l.taxable || 0)); // gross less taxable is everything exempt, contributions included
    t.mwe += mwe; t.mweX += mweX; t.dm += dm; t.gov += gov; t.otherN += Math.max(0, nonTax - mwe - mweX - dm - gov);
    if (!l.mwe && !(l.tax > 0)) t.notSub += l.taxable || 0;
  }
  const r2 = PAY.r2; const nt = r2(t.mwe + t.mweX + t.b13 + t.dm + t.gov + t.otherN); const taxable = r2(Math.max(0, t.gross - nt));
  return [["14", "Total amount of compensation", r2(t.gross)], ["15", "Statutory minimum wage (minimum wage earners)", r2(t.mwe)],
    ["16", "Holiday, overtime, night differential and hazard pay (minimum wage earners)", r2(t.mweX)], ["17", "13th month pay and other benefits", r2(t.b13)],
    ["18", "De minimis benefits", r2(t.dm)], ["19", "SSS, PhilHealth, Pag-IBIG contributions and union dues (employee share)", r2(t.gov)],
    ["20", "Other non-taxable compensation", r2(t.otherN)], ["21", "Total non-taxable compensation", nt], ["22", "Total taxable compensation", taxable],
    ["23", "Less: taxable compensation not subject to withholding tax", r2(Math.min(taxable, t.notSub))], ["24", "Net taxable compensation", r2(Math.max(0, taxable - t.notSub))],
    ["25", "Total taxes withheld", r2(t.tax)]];
}
function rmMissing(rows) { const m = {}; for (const k of Object.keys(RM_ID)) m[k] = rows.filter((r) => !rmDigits(r.e[RM_ID[k][0]])).length; return m; }
function rmFile(kind, month) {
  const rows = contribRows([month + "-1", month + "-2"].map(payrun)); const O = S.org || {}; const ym = month.replace("-", ""); const mmyyyy = month.slice(5) + month.slice(0, 4);
  const nm = (e) => [String(e.last || "").toUpperCase(), String(e.first || "").toUpperCase(), String(e.middle || "").toUpperCase()];
  if (kind === "sss") return offer(`SSS-R3-${ym}.csv`, toCSV([["Employer No", rmDigits(O.sssEr), "Applicable month", mmyyyy, "Employer", O.companyName || CO_DEFAULT],
    ["SS Number", "Last Name", "First Name", "Middle Name", "Monthly Salary Credit", "SS Contribution (ER+EE)", "EC", "Total", "WISP (MPF)", "Remarks", "Date hired or separated"],
    ...rows.map((r) => { const [st, d] = rmStatus(r.e, month); const wisp = PAY.r2(Math.max(0, r.msc - 20000) * 0.15); return [rmDigits(r.e.sss), ...nm(r.e), r.msc, PAY.r2(r.sss + r.sssEr - wisp), r.ec, PAY.r2(r.sss + r.sssEr + r.ec), wisp, st, d]; })]));
  if (kind === "ph") return offer(`PhilHealth-RF1-${ym}.csv`, toCSV([["PhilHealth Employer No", rmDigits(O.phEr), "Applicable period", mmyyyy, "Employer", O.companyName || CO_DEFAULT],
    ["PhilHealth No", "Last Name", "First Name", "Middle Name", "Birth date", "Sex", "Monthly Basic Salary", "Personal Share (PS)", "Employer Share (ES)", "Total", "Status (NH new hire, S separated)", "Effectivity date"],
    ...rows.map((r) => { const [st, d] = rmStatus(r.e, month); return [rmDigits(r.e.philhealth), ...nm(r.e), r.e.birth || "", (r.e.gender || "").slice(0, 1).toUpperCase(), r.monthly, r.ph, r.phEr, PAY.r2(r.ph + r.phEr), st === "N" ? "NH" : st, d]; })]));
  if (kind === "hdmf") return offer(`PagIBIG-MCRF-${ym}.csv`, toCSV([["Pag-IBIG Employer ID", rmDigits(O.hdmfEr), "Period covered", ym, "Employer", O.companyName || CO_DEFAULT],
    ["Pag-IBIG MID No", "Employee No", "Membership Program", "Last Name", "First Name", "Name Extension", "Middle Name", "Period Covered", "Monthly Compensation", "Employee Share", "Employer Share", "Total", "TIN", "Birth date", "Remarks"],
    ...rows.map((r) => { const [st] = rmStatus(r.e, month); return [rmDigits(r.e.pagibig), r.e.no || "", "F1", ...nm(r.e).slice(0, 2), String(r.e.suffix || "").toUpperCase(), nm(r.e)[2], ym, r.monthly, r.hd, r.hdEr, PAY.r2(r.hd + r.hdEr), rmDigits(r.e.tin), r.e.birth || "", st === "N" ? "NEW" : st === "S" ? "SEPARATED" : ""]; })]));
  if (kind === "bir") return offer(`BIR-1601C-${ym}.csv`, toCSV([["Employer TIN", rmDigits(O.tin), "RDO", O.rdo || "", "Month", mmyyyy], ["Item", "Description", "Amount"], ...bir1601c([month + "-1", month + "-2"].map(payrun))]));
}

/* The month's filing pack, prepared by the scheduled run once both cutoffs are final. */
async function remitJob() {
  if (!S.realEdit || !S.canEdit) return; const month = addDays(todayISO().slice(0, 7) + "-01", -1).slice(0, 7); const ids = [month + "-1", month + "-2"];
  if (!ids.every(isFinal)) return; const done = S.remits.get(month) || {}; if (done.pack) return;
  for (const id of ids) await ensureRun(id); if (!ids.every((id) => S.runs.has(id))) return;
  const runs = ids.map(payrun); const rows = contribRows(runs); if (!rows.length) return;
  const T = (k) => PAY.r2(rows.reduce((a, r) => a + r[k], 0));
  const pack = { at: new Date().toISOString(), heads: rows.length, missing: rmMissing(rows), total: { sss: PAY.r2(T("sss") + T("sssEr") + T("ec")), ph: PAY.r2(T("ph") + T("phEr")), hdmf: PAY.r2(T("hd") + T("hdEr")), bir: T("tax") },
    due: Object.fromEntries(REMIT.map(([k]) => [k, remitDue(month, k)])) };
  const next = { ...done, month, pack }; await S.db.doc(`remit/${month}`).set(JSON.parse(JSON.stringify(next))); S.remits.set(month, next); S.ver++;
  logActivity(`Prepared the government remittance files for ${rmLabel(month)}`);
}
RUN_JOBS.push(["remit", "Government remittance files", () => remitJob()]);

/* Gov't Contributions page: filing pack and employer numbers above the per-employee table. */
{ const b = VIEWS.contrib; VIEWS.contrib = (...a) => { const html = b(...a); const month = rmMonthOf(); const ids = [month + "-1", month + "-2"];
  const runs = ids.map(payrun); const rows = contribRows(runs); const miss = rmMissing(rows); const done = S.remits.get(month) || {}; const today = todayISO(); const O = S.org || {}; const ed = S.canEdit;
  const tot = { sss: (r) => r.sss + r.sssEr + r.ec, ph: (r) => r.ph + r.phEr, hdmf: (r) => r.hd + r.hdEr, bir: (r) => r.tax };
  const erNo = { sss: O.sssEr, ph: O.phEr, hdmf: O.hdmfEr, bir: O.tin };
  const final = ids.every(isFinal);
  const pack = `<section class="card rm-pack"><div class="card-head"><h2>${icon("doc", 18)} Filing pack for ${esc(rmLabel(month))}</h2>${final ? done.pack ? `<span class="chip c-ok">Prepared ${esc(fmtDate(done.pack.at.slice(0, 10)))}</span>` : '<span class="chip c-gold">Ready</span>' : '<span class="chip c-warn">Waiting for both cutoffs to be final</span>'}</div>
    <div class="table-wrap"><table><thead><tr><th>Filing</th><th>Due</th><th class="num">Amount</th><th>Check</th><th>Status</th><th></th></tr></thead><tbody>
    ${REMIT.map(([k, l]) => { const due = remitDue(month, k); const f = done[k]; const left = daysBetween(today, due); const m = miss[k];
      return `<tr><td><b>${esc(l)}</b></td><td style="white-space:nowrap">${fmtDate(due)}</td><td class="num">${money(PAY.r2(rows.reduce((s, r) => s + tot[k](r), 0)))}</td>
      <td style="font-size:13px">${m ? `<span class="chip c-warn">${m} without ${k === "bir" ? "TIN" : RM_ID[k][1] + " no."}</span>` : '<span class="chip c-ok">All numbers on file</span>'}${erNo[k] ? "" : ` <span class="chip c-bad">Employer ${k === "bir" ? "TIN" : "number"} missing</span>`}</td>
      <td>${f ? `<span class="chip c-ok">Filed ${esc(fmtDate(String(f.at || "").slice(0, 10)))}</span>` : left < 0 ? `<span class="chip c-bad">${-left} days overdue</span>` : `<span class="chip c-gray">Due in ${left} days</span>`}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-rm-file="${k}">${k === "bir" ? "1601-C figures" : "Upload file"} (CSV)</button>${ed && !f && final ? ` <button class="btn btn-primary btn-sm" data-remit="${month}|${k}">Mark filed</button>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">The files follow each agency's upload columns (SSS R-3 list, PhilHealth RF-1 / EPRS, Pag-IBIG MCRF / eSRS). Check the first one against your portal's template; ask me if a column needs to move. New hires and people who left this month are flagged.${miss.sss || miss.ph || miss.hdmf || miss.bir ? " Add the missing ID numbers in each person's 201 file before filing." : ""}</p></section>
  <section class="card"><div class="card-head"><h2>BIR 1601-C for ${esc(rmLabel(month))}</h2></div><div class="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>
    ${bir1601c(runs).map(([i, d, v]) => `<tr${["21", "22", "25"].includes(i) ? ' style="font-weight:700"' : ""}><td>${i}</td><td>${esc(d)}</td><td class="num">${money(v)}</td></tr>`).join("")}</tbody></table></div>
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">13th month pay is paid outside the regular payroll, so item 17 counts only what went through these cutoffs. Item 23 is the taxable pay of employees with no tax withheld this month. Add any adjustment from earlier months on the return itself.</p></section>
  <section class="card"><div class="card-head"><h2>Employer numbers</h2></div>
    <form id="rm-er" class="form-grid">${[["tin", "Employer TIN"], ["rdo", "BIR RDO code"], ["sssEr", "SSS employer number"], ["phEr", "PhilHealth employer number (PEN)"], ["hdmfEr", "Pag-IBIG employer ID"]].map(([k, l]) => `<div class="field"><label for="rm-${k}">${l}</label><input class="input" id="rm-${k}" name="${k}" maxlength="40" value="${esc(O[k] || "")}" ${ed ? "" : "disabled"}></div>`).join("")}
    ${ed ? '<div class="field" style="align-self:end"><button class="btn btn-primary" type="submit">Save</button></div>' : ""}</form></section>`;
  const i = html.indexOf('<section class="card"><div class="card-head"><h2>Per employee'); return i >= 0 ? html.slice(0, i) + pack + html.slice(i) : html + pack; }; }
Object.assign(ICON, ICON.doc ? {} : { doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>' });
document.addEventListener("click", (ev) => { const t = ev.target.closest?.("[data-rm-file]"); if (t) rmFile(t.dataset.rmFile, rmMonthOf()); });
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "rm-er") return; ev.preventDefault(); if (!S.canEdit) return;
  const f = new FormData(ev.target); const org = JSON.parse(JSON.stringify(S.org || {}));
  for (const k of ["tin", "rdo", "sssEr", "phEr", "hdmfEr"]) org[k] = String(f.get(k) || "").trim().slice(0, 40);
  try { await S.db.doc("org/main").set(org); S.org = org; S.ver++; logActivity("Updated the employer registration numbers"); toast("Saved."); render(); } catch { toast("Couldn't save. Try again."); }
});
