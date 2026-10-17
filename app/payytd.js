/* ---------- My payslips: year-to-date totals (Glenn 2026-10-17) ----------
   Under each payslip: what the employee has earned, paid in contributions and tax, and taken home from January up to
   that payroll. Only final payrolls count, plus the payslip on screen. On the employee's own account the totals need the
   whole year's payslips from hr_my_data (marker me/ytd); without it the box stays hidden rather than showing a short total. */
const YTD_ROWS = [["gross", "Gross pay", true], ["taxable", "Taxable income"], ["sss", "SSS"], ["ph", "PhilHealth"], ["hd", "Pag-IBIG"], ["tax", "Withholding tax"], ["loanTot", "Loan payments"], ["ded", "Other deductions"], ["net", "Net pay", true]];
function slipYTD(e, pid, cur) {
  const live = typeof MY !== "undefined" && MY.rows ? MY.rows : null; if (live && !live.has("me/ytd")) return "";
  const year = pid.slice(0, 4); const T = Object.fromEntries(YTD_ROWS.map(([k]) => [k, 0])); let n = 0, wait = false;
  for (let id = `${year}-01-1`; id <= pid && n < 30; id = PAY.shiftPeriod(id, 1)) {
    let l = null;
    if (id === pid) l = cur;
    else if (live) l = live.get(`payruns/${id}`)?.lines?.[e.id] || null;
    else if (isFinal(id)) { if (S.runs.has(id)) l = S.runs.get(id).lines?.[e.id] || null; else { ensureRun(id); wait = true; } }
    if (!l) continue; n++; for (const [k] of YTD_ROWS) T[k] += Number(l[k]) || 0;
  }
  const head = `Year to date, January to ${esc(PAY.period(pid).label)}`;
  if (wait) return `<section class="card ytd"><h2 style="font-size:16px;margin:0 0 8px">${head}</h2><p class="t-muted" style="margin:0">Adding up this year's payrolls…</p></section>`;
  return `<section class="card ytd"><div class="card-head"><h2 style="font-size:16px">${head}</h2><span class="t-muted" style="font-size:13px">${n} ${n === 1 ? "payroll" : "payrolls"}</span></div>
    <div class="ytd-grid">${YTD_ROWS.map(([k, label, strong]) => `<div><span class="t-muted">${label}</span>${strong ? `<b>${money(PAY.r2(T[k]))}</b>` : `<span>${money(PAY.r2(T[k]))}</span>`}</div>`).join("")}</div>
    <p class="t-muted" style="font-size:12px;margin:10px 0 0">Final payrolls this year plus this payslip${cur && !isFinal(pid) ? " (still a draft)" : ""}. Your BIR 2316 at year end shows the official totals.</p></section>`;
}
{ const base = ESS.esspay; ESS.esspay = (e) => { const h = base(e); const slips = essSlips(e); const open = slips.find((s) => s.id === S.essSlip) || slips[0];
    return open ? h + slipYTD(e, open.id, open.l) : h; }; }
{ const st = document.createElement("style"); st.textContent = `.ytd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 16px}.ytd-grid>div{display:flex;flex-direction:column;gap:2px;font-size:14px}.ytd-grid b,.ytd-grid span:last-child{font-variant-numeric:tabular-nums}`; document.head.appendChild(st); }
