/* ---------- System audit 2026-10-17: payroll data checks ----------
   Payroll with no basic pay on file pays nothing and treats the person as a minimum wage earner, without any error.
   The Payroll page says who is missing pay or a region, and finalizing stops while anyone in the run has no basic pay. */
function payGaps(pid) {
  const p = PAY.period(pid); const act = [...S.emps.values()].filter((e) => !e.separated && !e.sample && (!e.hire || e.hire <= p.end));
  const noPay = act.filter((e) => !e.conf && !(Number(e.basicPay) > 0));
  const prjs = new Set(act.map((e) => e.projectId).filter(Boolean)); const noRegion = [...prjs].map((id) => S.projects.get(id)).filter((x) => x && !x.region);
  return { noPay, noRegion, noOrgRegion: !S.org?.region };
}
{ const b = VIEWS.payroll; VIEWS.payroll = (...a) => { const html = b(...a); const id = S.periodId || curPeriod(); if (isFinal(id) || !S.canEdit) return html;
    const g = payGaps(id); if (!g.noPay.length && !g.noRegion.length) return html;
    const box = `<div class="notice" role="status"><span>${g.noPay.length ? `<span class="chip c-bad">${g.noPay.length} without basic pay</span> ${g.noPay.length === 1 ? "This person gets" : "These people get"} zero pay, contributions and tax until their basic pay is entered in the 201 file. Payroll can't be finalized until then. ` : ""}${g.noRegion.length ? `<span class="chip c-warn">${g.noRegion.length} ${g.noRegion.length === 1 ? "project has" : "projects have"} no region</span> Their staff are checked against the ${esc(S.org?.region || "NCR")} minimum wage. Set the region on each project so provincial minimum wage earners are taxed correctly.` : ""}</span>${g.noPay.length ? `<button class="btn btn-ghost btn-sm" data-pay-gaps="1">See who</button>` : ""}</div>${S.payGapsOpen && g.noPay.length ? `<section class="card"><div class="card-head"><h2>No basic pay on file</h2></div><ul class="list" style="font-size:14px;columns:2">${g.noPay.slice(0, 400).map((e) => `<li><button class="link" data-emp="${e.id}">${esc(fullName(e))}</button> <span class="t-muted">${esc(e.no || "")}</span></li>`).join("")}</ul></section>` : ""}`;
    const i = html.indexOf("<section"); return i > 0 ? html.slice(0, i) + box + html.slice(i) : box + html; }; }
document.addEventListener("click", (ev) => { if (!ev.target.closest?.("[data-pay-gaps]")) return; S.payGapsOpen = !S.payGapsOpen; render(); });
{ const b = finalizePayroll; finalizePayroll = async (id, ...a) => { if ($("#final-ok")?.checked && !isFinal(id)) { const g = payGaps(id);
      if (g.noPay.length) { toast(`${g.noPay.length} ${g.noPay.length === 1 ? "person has" : "people have"} no basic pay. Enter it in the 201 file before finalizing.`); return; } }
    return b(id, ...a); }; }
