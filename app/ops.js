/* ---------- v58 Phase 1 automation (Glenn 2026-10-12): Needs action page (overdue approvals and deadlines across modules),
   endorsement levels before approval, escalation, target days per request type, on-time report. Settings in org/ops,
   endorsements and decision times in collection apprs, government filing marks in collection remit. ---------- */
try { if (!TDEF.careersUrl) TDEF.careersUrl = "https://www.gd-prime.com"; } catch {}
const OPS_DEF = { sla: { leave: 2, lvreq: 3, ot: 2, ar: 2, flex: 5, rb: 5, si: 5, pf: 5, cq: 3, cert: 3, rs: 2, mpr: 5, lpost: 3, ask: 2 },
  escDays: 2, escTo: null, chains: {}, due: { sss: 0, ph: 15, hdmf: 15, bir: 10 }, nteDays: 5, decDays: 15 };
Object.assign(S, { ops: null, apprs: new Map(), remits: new Map(), opsF: { tab: "late", q: "", span: 90 }, opsOT: null });
const OPS = () => { const o = S.ops || {}; return { ...OPS_DEF, ...o, sla: { ...OPS_DEF.sla, ...(o.sla || {}) }, due: { ...OPS_DEF.due, ...(o.due || {}) }, chains: { ...(o.chains || {}) } }; };
const arView = (r) => ({ OB: "obreq", UT: "utreq", SHIFT: "chsched" }[r.kind] || "attreqs");
/* Every request type that waits for an approval: [kind, label, view, records, button prefix (data-<p>-set)] */
const OPK = [
  ["leave", "Leave", () => "leave", () => allLeaves().map((l) => ({ ...l, key: `${l.month}:${l.id}` })), "lv"],
  ["lvreq", "Leave credit or cancellation", () => "leave", () => listOf(S.lvReqs || new Map()), "lr"],
  ["ot", "Overtime", () => "ot", () => listOf(S.otReqs || new Map()), "ot"],
  ["ar", "Attendance request", arView, () => listOf(S.attReqs || new Map()), "ar"],
  ["flex", "FlexBen claim", () => "flex", () => listOf(S.flex || new Map()), "flex"],
  ["rb", "Reimbursement", () => "reimb", () => listOf(S.reimbs || new Map()), "rb"],
  ["si", "Salary increment", () => "salinc", () => listOf(S.salincs || new Map()), "si"],
  ["pf", "Personnel action", () => "paf", () => listOf(S.pafs || new Map()), "pf"],
  ["cq", "Change request", () => "chgreq", () => listOf(S.chgReqs || new Map()), "cq"],
  ["cert", "Certificate request", () => "certreq", () => listOf(S.certReqs || new Map()), "cert"],
  ["rs", "Resignation notice", () => "resign", () => listOf(S.resigns || new Map()), "rs"],
  ["mpr", "Manpower request", () => "mpr", () => listOf(S.mpr || new Map()), null],
  ["lpost", "Loan submission", () => "loanposts", () => listOf(S.lposts || new Map()), null],
];
const OPK_BY = Object.fromEntries(OPK.map((k) => [k[0], k]));
const OPK_PFX = Object.fromEntries(OPK.filter((k) => k[4]).map((k) => [k[4], k[0]]));
const opDay = (v) => (typeof v === "string" ? v.slice(0, 10) : "");
const opFiled = (r) => opDay(r.filed) || opDay(r.d) || opDay(r.date) || "";
const apprId = (kind, key) => `${kind}--${String(key).replace(/[/:]/g, "_")}`;
function opDecided(kind, r) {
  const d = r.decided; const x = typeof d === "string" ? d : d?.d || r.decidedOn || r.approvedOn || (r.status === "RELEASED" ? r.released : null);
  return opDay(x) || opDay(S.apprs.get(apprId(kind, r.key || r.id))?.final?.at) || "";
}
const opEmp = (r) => (S.allEmps || S.emps).get(r.empId) || null;
const opUserIds = () => { const a = S.access || {}; return [...new Set([...Object.keys(a.users || {}), ...Object.keys(a.seen || {}), ...(S.myId ? [S.myId] : [])])].sort((x, y) => personName(x).localeCompare(personName(y))); };
const opWho = (id) => (id ? personName(id) : "HR Manager");

/* Pending approvals with age, target and escalation */
function opsPending() {
  const O = OPS(), today = todayISO(), out = [];
  for (const [kind, label, view, recs] of OPK) { let list = []; try { list = recs(); } catch { continue; }
    for (const r of list) { if (r.status !== "PENDING") continue; const e = r.empId ? opEmp(r) : null; if (r.empId && !e) continue; const filed = opFiled(r) || today;
      const sla = Number(O.sla[kind]) || 3; const due = addDays(filed, sla); const late = Math.max(0, daysBetween(due, today)); const key = r.key || r.id;
      const ch = O.chains[kind] || []; const steps = S.apprs.get(apprId(kind, key))?.steps || [];
      out.push({ src: "appr", kind, label: kind === "ar" ? ({ OB: "Official business", UT: "Undertime", SHIFT: "Change schedule" }[r.kind] || label) : label, view: view(r), r, e, key, filed, due, late,
        esc: late > (Number(O.escDays) || 0), chain: ch, done: steps.length, unit: e ? unitName(e) : r.projectId ? S.projects.get(r.projectId)?.name || "Projects" : "Head Office" }); } }
  try { for (const t of akAll()) { if (t.status === "CLOSED") continue; const filed = opDay(t.at) || opDay(t.msgs?.[0]?.t) || today; const due = addDays(filed, Number(O.sla.ask) || 2); const late = Math.max(0, daysBetween(due, today)); const e = t.empId ? opEmp(t) : null;
    out.push({ src: "appr", kind: "ask", label: "Ask HR question", view: "askhr", r: t, e, key: t.key || t.id, filed, due, late, esc: late > (Number(O.escDays) || 0), chain: [], done: 0, unit: e ? unitName(e) : "Head Office", what: t.subject }); } } catch {}
  return out.sort((a, b) => b.late - a.late || a.filed.localeCompare(b.filed));
}
/* Government filing due dates for a month's contributions and withholding (filed in the next month) */
const REMIT = [["sss", "SSS contributions"], ["ph", "PhilHealth premiums"], ["hdmf", "Pag-IBIG contributions"], ["bir", "BIR 1601-C withholding tax"]];
function remitDue(month, k) { const [y, m] = month.split("-").map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; const day = Number(OPS().due[k]) || 0;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); return `${ny}-${String(nm).padStart(2, "0")}-${String(day > 0 ? Math.min(day, last) : last).padStart(2, "0")}`; }
/* Deadlines: final pay, disciplinary replies and decisions, filings, lapsed contracts, certificates to release, unfiled overtime */
function opsDeadlines() {
  const O = OPS(), today = todayISO(), soon = addDays(today, 14), out = [];
  const add = (x) => { x.late = Math.max(0, daysBetween(x.due, today)); if (x.due <= soon) out.push({ src: "dl", ...x, unit: x.e ? unitName(x.e) : x.unit || "Head Office" }); };
  try { for (const o of S.offb.values()) { const e = opEmp(o); if (!e || o.released || !o.last || !e.separated && o.last > today) continue; add({ kind: "fp", label: "Release final pay", what: `Last day ${fmtDate(o.last)}; 30-day rule`, e, due: addDays(o.last, 30), view: "finalpays" }); } } catch {}
  try { for (const c of S.cases.values()) { const e = opEmp(c); if (!e || !c.nte || c.decision) continue;
    if (!c.reply) add({ kind: "nte", label: "Employee's written reply", what: `${c.offense || "Case"}; notice served ${fmtDate(c.nte)}`, e, due: addDays(c.nte, Number(O.nteDays) || 5), view: "discipline" });
    add({ kind: "dec", label: "Decision on disciplinary case", what: c.offense || "Case", e, due: addDays(c.reply?.d || addDays(c.nte, Number(O.nteDays) || 5), Number(O.decDays) || 15), view: "discipline" }); } } catch {}
  try { const m0 = today.slice(0, 7); const prev = addDays(`${m0}-01`, -1).slice(0, 7); 
    for (const month of [prev, m0]) { const done = S.remits.get(month) || {}; for (const [k, l] of REMIT) { if (done[k]) continue; const due = remitDue(month, k); if (month === m0 && due > soon) continue;
      add({ kind: "remit", rk: k, month, label: `File ${l}`, what: `For ${new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(parseISO(`${month}-01`))}`, e: null, unit: "Accounting", due, view: "contrib" }); } } } catch {}
  try { const hasOff = new Set([...S.offb.keys()]); for (const e of active()) { if (!["CONTRACTUAL", "CASUAL", "PROJECT_BASED"].includes(e.status) || hasOff.has(e.id)) continue; const c = ctrOf(e); if (!c?.end || c.end >= today) continue;
    add({ kind: "ctr", label: "Contract ended, no renewal or exit", what: `Ended ${fmtDate(c.end)}`, e, due: c.end, view: "contracts" }); } } catch {}
  try { for (const r of listOf(S.certReqs || new Map())) { const e = opEmp(r); if (!e || r.status !== "READY" || !r.need) continue; add({ kind: "certrel", label: "Release certificate", what: certName(r.type), e, due: r.need, view: "certreq" }); } } catch {}
  for (const x of opsUnfiledOT()) add(x);
  return out.sort((a, b) => b.late - a.late || a.due.localeCompare(b.due));
}
/* Overtime worked past the shift in the open cutoff with no overtime request (computed when the page opens) */
function opsUnfiledOT() {
  if (S.view.name !== "needs") return S.opsOT?.list || [];
  const p = PAY.period(curPeriod()); const to = addDays(todayISO(), -1); if (to < p.start) return [];
  const sig = `${S.ver}|${p.start}|${to}`; if (S.opsOT?.sig === sig) return S.opsOT.list;
  const list = [];
  try { loadClock(addDays(p.start, -1), addDays(to, 1)); const pd = punchDays(p.start, to); const ctx = tkCtx(); const filed = new Set(listOf(S.otReqs || new Map()).map((r) => `${r.empId}|${r.d}`));
    for (const e of active()) { const days = pd.get(e.id); if (!days) continue; let h = 0, n = 0;
      for (let d = p.start; d <= to; d = addDays(d, 1)) { if (filed.has(`${e.id}|${d}`)) continue; const r = dayRec(e, d, days.get(d), ctx); let x = r.ot || 0; if ((r.rest || r.hol.length) && r.hrs) x = r.hrs; if (x > 0) { h += x; n++; } }
      if (h > 0) list.push({ kind: "ot", label: "Overtime worked but not filed", what: `${PAY.r2(h)} h on ${n} day${n === 1 ? "" : "s"} this cutoff`, e, due: p.end, view: "ot" }); } } catch {}
  S.opsOT = { sig, list }; return list;
}
const opsLate = () => { let a = [], b = []; try { a = opsPending().filter((x) => x.late > 0); } catch {} try { b = opsDeadlines().filter((x) => x.due < todayISO()); } catch {} return [...a, ...b].sort((x, y) => y.late - x.late); };

/* ---------- page ---------- */
const opChip = (x) => x.src === "dl" ? (x.due < todayISO() ? `<span class="chip c-bad">${x.late} day${x.late === 1 ? "" : "s"} late</span>` : x.due === todayISO() ? '<span class="chip c-warn">Due today</span>' : `<span class="chip c-blue">In ${daysBetween(todayISO(), x.due)} days</span>`)
  : x.late ? `<span class="chip ${x.esc ? "c-bad" : "c-warn"}">${x.late} day${x.late === 1 ? "" : "s"} past target</span>` : '<span class="chip c-ok">Within target</span>';
const opChain = (x) => !x.chain?.length ? "" : `<div class="t-muted" style="font-size:12px;margin-top:4px">${x.chain.map((c, i) => `${i < x.done ? "✓" : i === x.done ? "●" : "○"} ${esc(c.name || `Level ${i + 1}`)}`).join(" → ")} → final approval</div>`;
const opRow = (x) => `<tr><td>${x.e ? empCell(x.e) : `<b>${esc(x.unit)}</b>`}</td><td><b>${esc(x.label)}</b>${x.what ? `<div class="t-muted" style="font-size:13px">${esc(x.what)}</div>` : ""}${x.src === "appr" ? opChain(x) : ""}</td>
  <td style="white-space:nowrap">${x.src === "appr" ? `Filed ${fmtDate(x.filed)}<div class="t-muted" style="font-size:12px">target ${fmtDate(x.due)}</div>` : fmtDate(x.due)}</td><td>${opChip(x)}</td>
  <td>${x.src === "appr" ? (x.esc ? `<b>${esc(opWho(OPS().escTo))}</b><div class="t-muted" style="font-size:12px">escalated</div>` : x.chain?.length && x.done < x.chain.length ? esc(x.chain[x.done].uid ? opWho(x.chain[x.done].uid) : x.chain[x.done].name || "Endorser") : "Approver") : x.kind === "remit" ? "Accounting" : x.kind === "ot" ? "Supervisor" : "HR"}</td>
  <td style="white-space:nowrap">${x.kind === "remit" && S.canEdit ? `<button class="btn btn-primary btn-sm" data-remit="${x.month}|${x.rk}">Mark filed</button> ` : ""}<button class="btn btn-ghost btn-sm" data-go="${x.view}">Open</button></td></tr>`;
const opTable = (list, empty) => `<div class="table-wrap"><table class="ops-t"><thead><tr><th>Employee or unit</th><th>What</th><th>Date</th><th>Status</th><th>Waiting on</th><th></th></tr></thead><tbody>${list.map(opRow).join("") || `<tr><td colspan="6" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
VIEWS.needs = () => {
  const F = S.opsF; const q = F.q.toLowerCase(); const today = todayISO(); const O = OPS();
  const pend = opsPending(); const dls = opsDeadlines(); const late = [...pend.filter((x) => x.late > 0), ...dls.filter((x) => x.due < today)].sort((a, b) => b.late - a.late);
  const hit = (x) => !q || `${x.e ? `${fullName(x.e)} ${x.e.no}` : ""} ${x.label} ${x.what || ""} ${x.unit}`.toLowerCase().includes(q);
  let rem = 0; try { rem = remUrgent().filter((r) => r.due < today).length; } catch {}
  const tabs = stTabs(F.tab, "ops-tab", [["late", `Overdue (${late.length})`], ["appr", `Approvals (${pend.length})`], ["dl", `Deadlines (${dls.length})`], ["report", "On-time report"], ...(S.canEdit ? [["rules", "Rules"]] : [])]);
  let body = "";
  if (F.tab === "late") { const byUnit = {}; for (const x of late) byUnit[x.unit] = (byUnit[x.unit] || 0) + 1;
    body = `<section class="card">${opTable(late.filter(hit), "Nothing is overdue. Everything is within its target.")}</section>
      ${late.length ? `<section class="card"><div class="card-head"><h2>Overdue by department or project</h2></div><div class="table-wrap"><table><thead><tr><th>Department or project</th><th class="num">Overdue items</th></tr></thead><tbody>${Object.entries(byUnit).sort((a, b) => b[1] - a[1]).map(([u, n]) => `<tr><td>${esc(u)}</td><td class="num"><b>${n}</b></td></tr>`).join("")}</tbody></table></div></section>` : ""}`; }
  else if (F.tab === "appr") body = `<section class="card"><p class="t-muted" style="margin:0 0 10px;font-size:14px">Every request still waiting for a decision, oldest first. Past its target plus ${O.escDays} days, an item is escalated to ${esc(opWho(O.escTo))}.</p>${opTable(pend.filter(hit), "No requests are waiting for approval.")}</section>`;
  else if (F.tab === "dl") body = `<section class="card"><p class="t-muted" style="margin:0 0 10px;font-size:14px">Deadlines due in the next 14 days or already past: final pay (30 days from the last day), disciplinary replies and decisions, government filings, contracts that ended with no renewal, certificates to release and overtime worked but not filed this cutoff.</p>${opTable(dls.filter(hit), "No deadlines in the next 14 days.")}</section>`;
  else if (F.tab === "report") body = opsReport();
  else body = opsRules();
  return head("Overview", "Needs action") + `
    <section class="stats kpis">${dxTile("Overdue", late.length, "past target or deadline", late.length ? "t-bad" : "t-ok")}${dxTile("Waiting for approval", pend.length, `${pend.filter((x) => x.esc).length} escalated`)}${dxTile("Deadlines in 14 days", dls.filter((x) => x.due >= today).length, "final pay, filings, cases, contracts")}${dxTile("Reminders overdue", rem, "on the Reminders page")}</section>
    <section class="card" style="padding-bottom:12px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${tabs}${["late", "appr", "dl"].includes(F.tab) ? `<input class="input" type="search" id="ops-q" value="${esc(F.q)}" placeholder="Search name, request or unit" aria-label="Search" style="flex:1;min-width:180px">` : ""}</div></section>${body}`;
};
function opsReport() {
  const F = S.opsF; const O = OPS(); const from = F.span === "year" ? `${todayISO().slice(0, 4)}-01-01` : addDays(todayISO(), -F.span);
  const rows = OPK.map(([kind, label, , recs]) => { let list = []; try { list = recs(); } catch {} list = list.filter((r) => (opFiled(r) || "") >= from);
    const dec = list.filter((r) => r.status !== "PENDING").map((r) => { const f = opFiled(r), d = opDecided(kind, r); return f && d ? Math.max(0, daysBetween(f, d)) : null; }).filter((x) => x != null);
    const sla = Number(O.sla[kind]) || 3; const ok = dec.filter((x) => x <= sla).length; const pend = list.filter((r) => r.status === "PENDING");
    return { label, n: list.length, dec: dec.length, ok, avg: dec.length ? dec.reduce((a, x) => a + x, 0) / dec.length : null, sla, pend: pend.length, latep: pend.filter((r) => daysBetween(addDays(opFiled(r) || todayISO(), sla), todayISO()) > 0).length }; }).filter((r) => r.n);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  return `<section class="card"><div class="card-head"><h2>Decided within target</h2>${stTabs(String(F.span), "ops-span", [["30", "Last 30 days"], ["90", "Last 90 days"], ["year", "This year"]])}</div>
    <div class="table-wrap"><table><thead><tr><th>Request type</th><th class="num">Filed</th><th class="num">Target (days)</th><th class="num">Decided</th><th class="num">On time</th><th class="num">Average days</th><th class="num">Still waiting</th><th class="num">Waiting past target</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.n}</td><td class="num">${r.sla}</td><td class="num">${r.dec}</td><td class="num"><b class="${r.dec && r.ok / r.dec < 0.8 ? "t-bad" : "t-ok"}">${pct(r.ok, r.dec)}</b></td><td class="num">${r.avg == null ? "–" : r.avg.toFixed(1)}</td><td class="num">${r.pend}</td><td class="num">${r.latep ? `<b class="t-bad">${r.latep}</b>` : 0}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">No requests filed in this period.</td></tr>'}</tbody></table></div>
    <p class="t-muted" style="font-size:13px;margin:10px 0 0">Days are calendar days from filing to decision. Below 80% on time shows in red. Targets are set on the Rules tab.</p></section>`;
}
function opsRules() {
  const O = OPS(); const ids = opUserIds(); const sel = (name, cur, any = "Anyone with access") => `<select class="input" name="${name}"><option value="">${any}</option>${ids.map((id) => `<option value="${id}" ${id === cur ? "selected" : ""}>${esc(personName(id))}</option>`).join("")}</select>`;
  const kinds = [...OPK.map((k) => [k[0], k[1], !!k[4]]), ["ask", "Ask HR question", false]];
  return `<form id="ops-rules" data-keep><section class="card"><div class="card-head"><h2>Target days and endorsements</h2></div>
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">Target: days from filing to a decision. Endorsements: who must endorse before the final Approve button works. Leave a level name blank for none.</p>
    <div class="table-wrap"><table><thead><tr><th>Request type</th><th class="num">Target days</th><th>Endorsement 1</th><th>Endorsed by</th><th>Endorsement 2</th><th>Endorsed by</th></tr></thead><tbody>
    ${kinds.map(([k, l, can]) => { const ch = O.chains[k] || []; return `<tr><td>${esc(l)}</td><td class="num"><input class="input" type="number" min="1" max="60" name="sla-${k}" value="${O.sla[k]}" style="width:76px"></td>
      ${can ? [0, 1].map((i) => `<td><input class="input" name="ch-${k}-${i}-n" value="${esc(ch[i]?.name || "")}" placeholder="${i ? "e.g. HR Manager" : "e.g. Department head"}" style="min-width:150px"></td><td>${sel(`ch-${k}-${i}-u`, ch[i]?.uid)}</td>`).join("") : '<td colspan="4" class="t-muted">No endorsement step; decided on its own page</td>'}</tr>`; }).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>Escalation and deadlines</h2></div><div class="form-grid">
      <div class="field"><label for="ops-escd">Escalate after this many days past target</label><input class="input" id="ops-escd" name="escDays" type="number" min="0" max="30" value="${O.escDays}"></div>
      <div class="field"><label>Escalate to</label>${sel("escTo", O.escTo, "HR Manager (anyone with full access)")}</div>
      <div class="field"><label for="ops-nte">Days for the employee's reply to a notice to explain</label><input class="input" id="ops-nte" name="nteDays" type="number" min="5" max="30" value="${O.nteDays}"></div>
      <div class="field"><label for="ops-dec">Days to decide a case after the reply</label><input class="input" id="ops-dec" name="decDays" type="number" min="1" max="60" value="${O.decDays}"></div>
      ${REMIT.map(([k, l]) => `<div class="field"><label for="ops-due-${k}">${esc(l)}: day of the next month it is due (0 = last day)</label><input class="input" id="ops-due-${k}" name="due-${k}" type="number" min="0" max="31" value="${O.due[k]}"></div>`).join("")}
    </div><p class="t-muted" style="font-size:13px">Filing days follow common practice (SSS by month end, PhilHealth and Pag-IBIG by the 15th, BIR 1601-C by the 10th). Check them against your employer numbers and eFPS group.</p>
    <button class="btn btn-primary" type="submit">Save rules</button></section></form>`;
}
/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ops-tab],[data-ops-span],[data-remit]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.opsTab) { S.opsF.tab = d.opsTab; render(); return; }
  if (d.opsSpan) { S.opsF.span = d.opsSpan === "year" ? "year" : Number(d.opsSpan); render(); return; }
  if (d.remit && S.realEdit) { const [month, k] = d.remit.split("|"); const l = REMIT.find((x) => x[0] === k)?.[1] || k;
    if (!(await askConfirm(`Mark ${l} for ${month} as filed and paid?`, "Mark filed"))) return;
    const prev = S.remits.get(month) || {}; const next = { ...prev, month, [k]: { at: new Date().toISOString(), by: S.myId || null } };
    try { await S.db.doc(`remit/${month}`).set(JSON.parse(JSON.stringify(next))); S.remits.set(month, next); S.ver++; logActivity(`Marked ${l} for ${month} as filed`); toast("Marked as filed."); render(); } catch { toast("Couldn't save. Try again."); } }
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "ops-q") return; S.opsF.q = ev.target.value; const pos = ev.target.selectionStart; render(); const i = $("#ops-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "ops-rules") return; ev.preventDefault(); if (!S.realEdit) return; const f = new FormData(ev.target); const O = OPS();
  const sla = { ...O.sla }; for (const k of Object.keys(OPS_DEF.sla)) { const v = Number(f.get(`sla-${k}`)); if (v > 0) sla[k] = v; }
  const chains = {}; for (const [k, , , , p] of OPK) { if (!p) continue; const ch = [0, 1].map((i) => ({ name: String(f.get(`ch-${k}-${i}-n`) || "").trim(), uid: f.get(`ch-${k}-${i}-u`) || null })).filter((c) => c.name); if (ch.length) chains[k] = ch; }
  const due = {}; for (const [k] of REMIT) due[k] = Math.max(0, Math.min(31, Number(f.get(`due-${k}`)) || 0));
  const next = { sla, chains, due, escDays: Math.max(0, Number(f.get("escDays")) || 0), escTo: f.get("escTo") || null, nteDays: Math.max(5, Number(f.get("nteDays")) || 5), decDays: Math.max(1, Number(f.get("decDays")) || 15) };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity("Updated the approval and deadline rules"); toast("Rules saved."); render(); } catch { toast("Couldn't save. Try again."); }
});
/* Endorsements before approval: runs before every module's own Approve handler */
window.addEventListener("click", async (ev) => {
  const sel = Object.keys(OPK_PFX).map((p) => `[data-${p}-set]`).join(","); const t = ev.target.closest?.(sel); if (!t || !S.realEdit) return;
  const p = Object.keys(OPK_PFX).find((x) => t.hasAttribute(`data-${x}-set`)); const kind = OPK_PFX[p]; const v = t.getAttribute(`data-${p}-set`); const i = v.lastIndexOf(":"); const key = v.slice(0, i), st = v.slice(i + 1);
  const id = apprId(kind, key); const rec = S.apprs.get(id) || { kind, key, steps: [] };
  const save = async (x) => { S.apprs.set(id, x); try { await S.db.doc(`apprs/${id}`).set(JSON.parse(JSON.stringify(x))); } catch {} };
  if (st === "APPROVED") { const ch = OPS().chains[kind] || []; const done = rec.steps?.length || 0;
    if (done < ch.length) { ev.preventDefault(); ev.stopImmediatePropagation(); const L = ch[done]; const mine = !L.uid || L.uid === S.myId;
      if (!mine) { toast(`Waiting for ${L.name} (${personName(L.uid)}) to endorse this first.`); return; }
      if (!(await askConfirm(`This needs endorsement by ${L.name} before approval. Endorse it now as ${L.name}?`, "Endorse"))) return;
      await save({ ...rec, steps: [...(rec.steps || []), { i: done, name: L.name, by: S.myId || null, at: new Date().toISOString() }] }); logActivity(`Endorsed a ${(OPK_BY[kind]?.[1] || "request").toLowerCase()} as ${L.name}`);
      if (done + 1 < ch.length) { toast(`Endorsed. Next: ${ch[done + 1].name}.`); render(); return; }
      if (await askConfirm("Endorsed. Approve it now?", "Approve")) { const nb = [...document.querySelectorAll(`[data-${p}-set]`)].find((x) => x.getAttribute(`data-${p}-set`) === v); (nb || t).click(); } else render(); return; } }
  if (["APPROVED", "REJECTED", "RELEASED", "CANCELLED"].includes(st)) save({ ...rec, final: { st, at: new Date().toISOString(), by: S.myId || null } });
}, true);
/* Shows each Approve button's endorsement progress */
{ const b = render; render = (...a) => { const r = b(...a); try { const O = OPS(); if (!Object.keys(O.chains).length || S.selfMode) return r;
  for (const [p, kind] of Object.entries(OPK_PFX)) { const ch = O.chains[kind]; if (!ch?.length) continue;
    for (const btn of document.querySelectorAll(`#main [data-${p}-set$=":APPROVED"]`)) { if (btn.nextElementSibling?.classList.contains("ops-ch")) continue; const v = btn.getAttribute(`data-${p}-set`); const done = S.apprs.get(apprId(kind, v.slice(0, v.lastIndexOf(":"))))?.steps?.length || 0;
      btn.insertAdjacentHTML("afterend", `<span class="ops-ch chip ${done >= ch.length ? "c-ok" : "c-warn"}" title="${esc(ch.map((c) => c.name).join(" → "))}">${done >= ch.length ? "Endorsed" : `Needs ${esc(ch[done].name)}`}</span>`); } } } catch {} return r; }; }
/* ---------- menu, badge, dashboard card, data ---------- */
{ const ov = NAV.find(([n]) => n === "Overview"); if (ov) { const i = ov[1].findIndex(([v]) => v === "reminders"); ov[1].splice(i >= 0 ? i + 1 : 1, 0, ["needs", "Needs action", "alert"]); } SECTION_OF.needs = "needs"; }
{ const bn = renderNav; renderNav = (...a) => { const r = bn(...a); if (S.selfMode || !S.realEdit || S.viewAs === "emp") return r; let n = 0; try { n = opsLate().length; } catch {}
    if (n) for (const el of document.querySelectorAll('#nav [data-go="needs"]')) if (!el.querySelector(".ak-badge")) el.insertAdjacentHTML("beforeend", `<span class="ak-badge" aria-label="${n} overdue">${n}</span>`);
    if (!S.escToasted && S.emps.size && S.myId) { let mine = 0; try { const O = OPS(); mine = O.escTo === S.myId ? opsPending().filter((x) => x.esc).length : 0; } catch {} if (mine) { S.escToasted = true; setTimeout(() => toast(`${mine} request${mine === 1 ? " was" : "s were"} escalated to you. See Overview > Needs action.`), 4500); } }
    return r; }; }
{ const b = VIEWS.dash; VIEWS.dash = (...a) => { const h = b(...a); if (!S.realEdit || S.viewAs === "emp") return h; let l = []; try { l = opsLate(); } catch { return h; } if (!l.length) return h;
    const card = `<section class="card rem-dash"><div class="card-head"><h2>${icon("alert", 18)} Needs action</h2><button class="link" data-go="needs">See all ${l.length}</button></div><ul class="ed-reqs">${l.slice(0, 5).map((x) => `<li><span><b>${esc(x.label)}</b>${x.e ? ` · ${esc(fullName(x.e))}` : ""}<small class="t-muted"> · ${esc(x.unit)}</small></span>${opChip(x)}</li>`).join("")}</ul></section>`;
    const i = h.indexOf('<section class="hero'); const j = i >= 0 ? h.indexOf("</section>", i) : -1; return j > 0 ? h.slice(0, j + 10) + card + h.slice(j + 10) : card + h; }; }
{ const b = bootIO; bootIO = (db) => { b(db);
  db.doc("org/ops").onSnapshot((d) => { S.ops = d.exists ? d.data() : null; S.ver++; refresh(); }, () => {});
  db.collection("apprs").limit(5000).onSnapshot((snap) => { S.apprs = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {});
  db.collection("remit").limit(120).onSnapshot((snap) => { S.remits = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {}); }; }
{ const st = document.createElement("style"); st.textContent = `.ops-t .chip { white-space: nowrap; } .ops-t td:last-child { white-space: nowrap; }`; document.head.appendChild(st); }
