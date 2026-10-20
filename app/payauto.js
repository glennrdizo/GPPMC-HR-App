/* ---------- Payroll cutoff autopilot (Glenn 2026-10-20: full automation) ----------
   After each cutoff ends, the scheduled run (runner.js) checks whether the cutoff is ready to pay: time records read, time
   sheets filled, no requests still waiting inside the cutoff, no timekeeping issues, everyone with basic pay. It saves the
   check on the period (periods/<id>.auto) so the approvers get one email when it turns ready, and the Payroll page shows the
   list with an "Approve and finalize" button. If HR switches on "Finalize by itself", the scheduled run finalizes a ready
   cutoff on its own on the set day; finalizing releases payslips, as before. Settings: org/ops.payAuto. */
const PA_DEF = { on: true, readyDays: 1, autoFinal: false, finalDays: 3 };
const PA = () => ({ ...PA_DEF, ...(S.ops?.payAuto || {}) });
const paPrev = () => PAY.periodOf(addDays(PAY.period(curPeriod()).start, -1));
function payReady(pid) {
  const p = PAY.period(pid); const inP = (d) => d && d >= p.start && d <= p.end; const items = [];
  const add = (key, ok, label, n, go, bad, info) => items.push({ key, ok, label, n, go, bad: bad || label, info: !!info });
  add("ended", todayISO() > p.end, "The cutoff has ended", 0);
  add("punches", S.clockLoaded?.has?.(`${p.start}:${p.end}`) || [...(S.clockLoaded || [])].some((k) => { const [a, b] = k.split(":"); return a <= p.start && b >= p.end; }), "Time records for the whole cutoff are read", 0);
  const g = typeof payGaps === "function" ? payGaps(pid) : { noPay: [] }; add("pay", !g.noPay.length, "Everyone has basic pay in the 201 file", g.noPay.length, "payroll", `${g.noPay.length} without basic pay in the 201 file`);
  const lv = allLeaves().filter((l) => l.status === "PENDING" && l.from <= p.end && l.to >= p.start && S.emps.get(l.empId)).length; add("leave", !lv, "No leave waiting for approval in the cutoff", lv, "leave", `${lv} leave ${lv === 1 ? "request" : "requests"} waiting for approval`);
  const ot = listOf(S.otReqs || new Map()).filter((r) => r.status === "PENDING" && inP(r.d) && S.emps.get(r.empId)).length; add("ot", !ot, "No overtime waiting for approval in the cutoff", ot, "ot", `${ot} overtime ${ot === 1 ? "request" : "requests"} waiting for approval`);
  const ar = listOf(S.attReqs || new Map()).filter((r) => r.status === "PENDING" && (inP(r.d) || inP(r.from)) && S.emps.get(r.empId)).length; add("att", !ar, "No attendance changes waiting for approval", ar, "attreq", `${ar} attendance ${ar === 1 ? "change" : "changes"} waiting for approval`);
  const ph = [...(S.rqPhone?.values?.() || [])].filter((f) => !f.done).length; add("phone", !ph, "No employee requests still to file", ph, "tkissues", `${ph} employee ${ph === 1 ? "request" : "requests"} still to file`);
  // Missing time in or out and punches outside the site area block payroll; an absence with no leave is a normal outcome (unpaid), shown only.
  let iss = 0, abs = 0; try { for (const l of tkIssuesAll().values()) for (const x of l) if (x.pid === pid) { if (x.kind === "MISS" || x.kind === "GEO") iss++; else if (x.kind === "ABS") abs++; } } catch {}
  add("issues", !iss, "No missing time in or out, or punches outside the site area", iss, "tkissues", `${iss} missing time in or out, or punches outside the site area`);
  if (abs) add("abs", true, `${abs} absent ${abs === 1 ? "day" : "days"} with no leave filed (unpaid unless leave is filed)`, abs, "tkissues", "", true);
  return { pid, label: p.label, ok: items.every((x) => x.ok), items };
}
async function payAutoJob(by) {
  const P = PA(); if (!P.on || !S.realEdit || !S.canEdit) return; const pid = paPrev(); if (isFinal(pid)) return;
  const p = PAY.period(pid); if (todayISO() < addDays(p.end, P.readyDays)) return;
  await loadClock(p.start, p.end); await new Promise((r) => setTimeout(r, 0));
  const r = payReady(pid); const run = payrun(pid); const prev = periodDoc(pid).auto || {};
  const auto = { at: new Date().toISOString(), ready: r.ok, readyAt: r.ok ? prev.readyAt || new Date().toISOString() : null, open: r.items.filter((x) => !x.ok).map((x) => ({ key: x.key, label: x.bad, n: x.n })), count: run.totals?.count || 0 };
  const same = prev.ready === auto.ready && JSON.stringify(prev.open || []) === JSON.stringify(auto.open);
  if (!same || !prev.at || Date.now() - Date.parse(prev.at) > 6 * 3600e3) {
    if (S.periods.has(pid)) await S.db.doc("periods/" + pid).update({ auto }); else await S.db.doc("periods/" + pid).set({ start: p.start, end: p.end, status: "OPEN", rows: {}, auto });
    S.periods.set(pid, { ...periodDoc(pid), auto }); S.ver++;
  }
  // Finalize by itself: only the scheduled runner, only when ready, and only from the set day after the cutoff.
  if (by === "server" && P.autoFinal && r.ok && !run.missing && todayISO() >= addDays(p.end, P.finalDays)) await payFinalizeNow(pid, "Finalized by the scheduled run (cutoff autopilot)");
}
async function payFinalizeNow(pid, why) {
  S.payTab = "register"; S.periodId = pid; go("payroll"); await new Promise((r) => setTimeout(r, 300));
  const ok = $("#final-ok"); if (!ok) return false; ok.checked = true; S.auSys = why || null;
  try { await finalizePayroll(pid); } finally { S.auSys = null; }
  return isFinal(pid);
}
RUN_JOBS.push(["pay", "Payroll cutoff check", () => payAutoJob(runBy)]);
let runBy = "browser"; { const b = hrRunAll; hrRunAll = async (by = "browser", ...a) => { runBy = by; try { return await b(by, ...a); } finally { runBy = "browser"; } }; window.__hrRunAll = hrRunAll; }

/* Payroll page: the ready check for the cutoff on screen, with Approve and finalize. */
{ const b = VIEWS.payroll; VIEWS.payroll = (...a) => { const html = b(...a); if ((S.payTab || "register") !== "register" || !S.realEdit) return html;
  const id = S.periodId || curPeriod(); if (isFinal(id) || todayISO() <= PAY.period(id).end) return html;
  const r = payReady(id); const P = PA(); const ed = S.canEdit;
  const card = `<section class="card pa-card"><div class="card-head"><h2>${icon("robot", 18)} Cutoff check</h2>${r.ok ? '<span class="chip c-ok">Ready to pay</span>' : `<span class="chip c-gold">${r.items.filter((x) => !x.ok).length} to clear</span>`}</div>
    <ul style="list-style:none;margin:0;padding:0;display:grid;gap:6px">${r.items.map((x) => `<li>${x.info ? '<span class="chip c-gray">i</span>' : x.ok ? '<span class="chip c-ok">✓</span>' : '<span class="chip c-bad">!</span>'} ${esc(x.ok ? x.label : x.bad)}${(!x.ok || x.info) && x.go ? ` <button class="link" data-go="${x.go}">Open</button>` : ""}</li>`).join("")}</ul>
    ${ed ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px"><button class="btn btn-primary" data-pa-final="${esc(id)}" ${r.ok ? "" : "disabled"}>Approve and finalize</button>
      <label class="check"><input type="checkbox" data-pa-set="autoFinal" ${P.autoFinal ? "checked" : ""}><span>Finalize by itself when ready, ${P.finalDays} days after the cutoff ends</span></label></div>` : ""}
    <p class="t-muted" style="font-size:13px;margin:8px 0 0">Checked every hour by the scheduled run. Approvers get an email when the cutoff is ready. Finalizing releases the payslips and fixes the figures for remittances.</p></section>`;
  const i = html.indexOf('<section class="stats">'); return i >= 0 ? html.slice(0, i) + card + html.slice(i) : html + card; }; }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest?.("[data-pa-final]"); if (!t || !S.canEdit) return; const pid = t.dataset.paFinal;
  if (!(await askConfirm(`Finalize payroll for ${PAY.period(pid).label}? Payslips will be released to employees.`, "Finalize"))) return;
  t.disabled = true; await payFinalizeNow(pid, null); render();
});
document.addEventListener("change", async (ev) => {
  const t = ev.target.closest?.("[data-pa-set]"); if (!t || !S.canEdit) return; const k = t.dataset.paSet;
  const next = { ...(S.ops || {}), payAuto: { ...PA(), [k]: t.checked } };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity(`${t.checked ? "Turned on" : "Turned off"} finalizing payroll by itself`); toast("Saved."); render(); } catch { toast("Couldn't save. Try again."); render(); }
});
