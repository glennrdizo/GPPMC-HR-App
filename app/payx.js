/* ---------- Payroll > Employee payslips: every employee's payslip for a pay period ---------- */
Object.assign(S, { psF: { q: "", unit: "", page: 1 } });
{
  const g = NAV.find(([, it]) => it.some(([v]) => v === "payroll"));
  if (g) { const it = g[1]; it.splice(it.findIndex(([v]) => v === "payroll") + 1, 0, ["payslips", "Employee payslips", "pay"]); }
  Object.assign(SECTION_OF, { payslips: "payslips" });
}
const SLIP_CSS = "body{font-family:system-ui,sans-serif;color:#14213D;max-width:820px;margin:24px auto;padding:0 16px}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-bottom:1px solid #E1E6F2}.num{text-align:right}.t-muted{color:#5A6478}.panel{background:#EEF2FF;border-radius:12px;padding:12px}.row{display:flex;flex-wrap:wrap}h3{margin:0}.slip{page-break-after:always;padding-bottom:28px;margin-bottom:28px;border-bottom:1px dashed #C9D1E4}.slip:last-child{page-break-after:auto;border:0}";
function psList(id) {
  const run = payrun(id); const F = S.psF; const q = (F.q || "").toLowerCase();
  const list = [...S.emps.values()].filter((e) => run.lines[e.id]).filter((e) => !F.unit || inUnit(e, F.unit)).filter((e) => !q || `${fullName(e)} ${e.no} ${pos(e.posId)?.title || ""}`.toLowerCase().includes(q)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return { run, list };
}
VIEWS.payslips = () => {
  const id = S.periodId || curPeriod(); const p = PAY.period(id); ensureRun(id); const { run, list } = psList(id); const F = S.psF;
  const sum = (k) => PAY.r2(list.reduce((s, e) => s + (run.lines[e.id][k] || 0), 0)); const per = 25; const pages = Math.max(1, Math.ceil(list.length / per)); F.page = Math.min(Math.max(1, F.page), pages);
  const ded = (l) => PAY.r2(l.gross - l.net);
  return head(`Pay period ${esc(p.label)}`, "Employee payslips", `${periodSelect(id, "slips")}`) + `
    <div class="notice"><span>${run.final ? '<span class="chip c-ok">Final</span> These payslips use the saved payroll.' : run.missing ? '<span class="chip c-warn">Loading</span> Fetching the saved payroll…' : '<span class="chip c-warn">Draft</span> Payroll for this period is not final yet, so these payslips can still change.'}</span></div>
    <section class="stats">${dxTile("Payslips", list.length, F.q || F.unit ? "matching the filter" : "employees paid this period")}${dxTile("Gross pay", peso.format(sum("gross")), "total for the list")}${dxTile("Deductions", peso.format(PAY.r2(sum("gross") - sum("net"))), "government, tax, loans and others")}${dxTile("Net pay", peso.format(sum("net")), "take-home total", "t-ok")}</section>
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input class="input" type="search" id="ps-q" value="${esc(F.q)}" placeholder="Find employee" aria-label="Find employee" style="flex:1;min-width:180px">
      <select class="input" id="ps-unit" style="width:auto" aria-label="Site or department">${opts(unitOpts(), F.unit, "Everyone")}</select>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-ps-all="print"${list.length ? "" : " disabled"}>Print all</button><button class="btn btn-primary btn-sm" data-ps-all="save"${list.length ? "" : " disabled"}>Download all (${list.length})</button></span></section>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Site or department</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net pay</th><th></th></tr></thead><tbody>
      ${list.slice((F.page - 1) * per, F.page * per).map((e) => { const l = run.lines[e.id];
        return `<tr><td><div class="person" style="min-width:200px">${avatar(e, 32)}<span class="who"><span class="name">${esc(fullName(e))}</span><span class="sub">${esc(e.no)} · ${esc(pos(e.posId)?.title || "")}</span></span></div></td><td class="t-muted">${esc(unitName(e))}</td>
          <td class="num">${money(l.gross)}</td><td class="num">${money(ded(l))}</td><td class="num"><b>${money(l.net)}</b></td><td class="num" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-slip-open="${id}:${e.id}">View payslip</button></td></tr>`; }).join("") || '<tr><td colspan="6" class="empty">No payslips for this period yet.</td></tr>'}</tbody></table></div>
      ${pages > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:14px"><span class="t-muted">${(F.page - 1) * per + 1}–${Math.min(F.page * per, list.length)} of ${list.length}</span><span style="display:flex;gap:8px">${F.page > 1 ? '<button class="btn btn-ghost btn-sm" data-ps-p="-1">Previous</button>' : ""}${F.page < pages ? '<button class="btn btn-ghost btn-sm" data-ps-p="1">Next</button>' : ""}</span></div>` : ""}</section>
    <p class="t-muted" style="font-size:13px;margin:0">Employees see their own payslips under My payslips. "Download all" saves one file with a page per employee, ready to print or send.</p>`;
};
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ps-all],[data-ps-p]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.psP) { S.psF.page += Number(d.psP); render(); return; }
  const id = S.periodId || curPeriod(); const p = PAY.period(id); const { run, list } = psList(id);
  const html = `<!doctype html><meta charset="utf-8"><title>Payslips ${esc(p.label)}</title><style>${SLIP_CSS}</style>${list.map((e) => `<div class="slip">${slipHTML(e, run.lines[e.id], p, run.final)}</div>`).join("")}`;
  if (d.psAll === "print") { const w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to print, or use Download all."); return; } w.document.write(html); w.document.close(); w.focus(); w.print(); return; }
  if (!S.downloads) { toast("Downloads aren't available in this view."); return; }
  try { await S.downloads.save({ filename: `payslips-${id}.html`, data: new Blob([html], { type: "text/html" }) }); logActivity(`Downloaded ${list.length} payslips for ${p.label}`); } catch { toast("The download was cancelled."); }
}, true);
document.addEventListener("change", (ev) => { if (ev.target.id === "ps-unit") { S.psF = { ...S.psF, unit: ev.target.value, page: 1 }; render(); } });
document.addEventListener("input", (ev) => { if (ev.target.id !== "ps-q") return; S.psF = { ...S.psF, q: ev.target.value, page: 1 }; const p0 = ev.target.selectionStart; render(); const i = $("#ps-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
