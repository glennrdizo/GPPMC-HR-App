/* ---------- v54 Executive monthly report: summary, figures against last month, six-month trends, analysis and recommendations ---------- */
if (!ICON.spark) ICON.spark = '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>';
const prevMonth = (m, n = 1) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const exMemo = new Map(); let exMemoVer = -1;
function repMemo(m, sc) { if (exMemoVer !== S.ver) { exMemo.clear(); exMemoVer = S.ver; } const k = `${m}|${sc}`; if (!exMemo.has(k)) exMemo.set(k, reportData(m, sc)); return exMemo.get(k); }
const workDays = (m) => { let n = 0; PAY.eachDay(`${m}-01`, monthEnd(m), (dt) => { if (dt.getDay() !== 0) n++; }); return n; };
/* The figures an executive needs, read from the monthly report's own tables. */
function exMetrics(R) {
  const k = (label) => R.kpis.find((x) => x.label === label)?.value ?? 0; const sec = (t) => R.sections.find((s) => s.title === t)?.rows || [];
  const hcRows = sec("Headcount"); const hc = hcRows.find((r) => r[0] === "Total") || hcRows[0] || ["", 0, 0, 0, 0, 0];
  const att = sec("Attendance").find((r) => r[0] === "Month") || ["", 0, 0, 0, 0, 0]; const pay = sec("Payroll").find((r) => r[0] === "Month") || [];
  const rec = Object.fromEntries(sec("Recruitment").map((r) => [r[0], r[1]])); const mp = sec("Manpower per project");
  const need = mp.reduce((a, r) => a + (r[4] || 0), 0), have = mp.reduce((a, r) => a + Math.min(r[4] || 0, r[5] || 0), 0);
  const end = hc[4] || k("Headcount at month end"), start = hc[1] || 0, avg = (start + end) / 2 || end || 1; const wd = workDays(R.month);
  const alerts = sec("Compliance alerts");
  return { month: R.month, label: R.label, start, end, hires: hc[2] || 0, seps: hc[3] || 0, turnover: avg ? (hc[3] || 0) / avg : 0,
    abs: att[1] || 0, late: att[2] || 0, ut: att[3] || 0, ot: att[4] || 0, absRate: end ? (att[1] || 0) / (end * wd) : 0, otApproved: k("Overtime approved"), leaveDays: k("Leave days approved"),
    gross: pay[3] || 0, net: pay[7] || 0, cost: pay[9] || 0, paid: pay[2] || 0, perHead: end ? (pay[9] || 0) / end : 0,
    openJobs: rec["Open jobs"] || 0, needed: rec["People still needed on open jobs"] || 0, apps: rec["Applicants received this month"] || 0, hiredRec: rec["Hired this month"] || 0,
    need, have, fill: need ? have / need : null, short: mp.filter((r) => (r[4] || 0) > (r[5] || 0)).map((r) => ({ name: r[1], gap: r[4] - r[5] })).sort((a, b) => b.gap - a.gap),
    prob: (sec("Employment status").find((r) => r[0] === "Probationary") || [])[1] || 0, safety: k("Safety incidents"), urgent: alerts.filter((r) => r[0] === "Urgent").length, soon: alerts.filter((r) => r[0] === "Soon").length,
    sepReasons: sec("Separations").reduce((o, r) => { o[r[4] || "Not given"] = (o[r[4] || "Not given"] || 0) + 1; return o; }, {}) };
}
const pct = (v, d = 1) => `${(Math.round(v * 100 * 10 ** d) / 10 ** d).toFixed(d)}%`;
const chg = (a, b) => (b ? (a - b) / b : null);
const chgTxt = (a, b, money_ = false) => { const c = chg(a, b); if (c == null) return ""; const up = c > 0; return `${up ? "up" : "down"} ${pct(Math.abs(c))} from ${money_ ? "₱" + money(b) : Number(b).toLocaleString("en-PH")} last month`; };
/* Rule-based analysis: each finding has an area, a tone (good, watch, risk), what happened, and what to do. */
function exAnalysis(M, P) {
  const F = []; const add = (area, tone, text, act) => F.push({ area, tone, text, act });
  // Workforce
  const net = M.end - M.start;
  add("Workforce", net < 0 ? "watch" : "good", `Headcount closed at ${M.end}, ${net === 0 ? "unchanged" : `${net > 0 ? "up" : "down"} ${Math.abs(net)}`} from ${M.start} at the start of the month (${M.hires} hired, ${M.seps} separated).`, net < 0 ? "Check that the open jobs cover the people who left." : "");
  const ann = M.turnover * 12;
  if (M.seps) add("Workforce", M.turnover > 0.02 ? "risk" : M.turnover > 0.01 ? "watch" : "good", `Turnover was ${pct(M.turnover)} for the month (about ${pct(ann, 0)} a year).${Object.keys(M.sepReasons).length ? ` Reasons: ${Object.entries(M.sepReasons).map(([r, n]) => `${r.toLowerCase()} (${n})`).join(", ")}.` : ""}`,
    M.turnover > 0.01 ? "Hold exit interviews and look for a pattern by site, position or supervisor." : "");
  if (M.prob) add("Workforce", "watch", `${M.prob} ${M.prob === 1 ? "employee is" : "employees are"} still probationary.`, "Finish the 5th-month evaluations before each probation end date; the app makes them regular automatically at six months.");
  // Manpower
  if (M.fill != null) add("Manpower", M.fill < 0.75 ? "risk" : M.fill < 0.9 ? "watch" : "good", `Projects are ${pct(M.fill, 0)} staffed (${M.have} of ${M.need} planned positions filled).${M.short.length ? ` Biggest gaps: ${M.short.slice(0, 3).map((s) => `${s.name} (${s.gap})`).join(", ")}.` : ""}`,
    M.fill < 0.9 ? "Prioritise hiring for the projects with the largest gaps, or move staff from fully staffed sites." : "");
  if (M.openJobs) add("Recruitment", M.apps < M.openJobs * 3 ? "watch" : "good", `${M.openJobs} open ${M.openJobs === 1 ? "job" : "jobs"} still need ${M.needed} ${M.needed === 1 ? "person" : "people"}; ${M.apps} applicants came in and ${M.hiredRec} were hired this month.`,
    M.apps < M.openJobs * 3 ? "Applicant flow is thin. Re-post the ads on more job sites and ask for employee referrals." : "");
  // Attendance
  if (M.end) {
    add("Attendance", M.absRate > 0.03 ? "risk" : M.absRate > 0.02 ? "watch" : "good", `Absences were ${M.abs} days, an absence rate of ${pct(M.absRate)}${P ? ` (${pct(P.absRate)} last month)` : ""}. Lateness totalled ${Math.round(M.late / 60)} hours.`,
      M.absRate > 0.02 ? "Review repeat absences with supervisors and apply the attendance policy consistently." : "");
    const otH = M.ot / M.end; const c = P ? chg(M.ot, P.ot) : null;
    if (M.ot) add("Overtime", otH > 8 || (c != null && c > 0.25) ? "watch" : "good", `Overtime reached ${M.ot.toLocaleString("en-PH")} hours, about ${otH.toFixed(1)} hours per person${c != null ? `, ${c > 0 ? "up" : "down"} ${pct(Math.abs(c), 0)} from last month` : ""}.`,
      otH > 8 || (c != null && c > 0.25) ? "Check whether the overtime is planned work or a staffing gap; hiring may cost less than sustained overtime." : "");
  }
  // Payroll
  if (M.cost) { const c = P?.cost ? chg(M.cost, P.cost) : null;
    add("Payroll cost", c != null && Math.abs(c) > 0.05 ? "watch" : "good", `Total payroll cost was ₱${money(M.cost)} (net pay ₱${money(M.net)}), or ₱${money(M.perHead)} per employee${c != null ? `, ${chgTxt(M.cost, P.cost, true)}` : ""}.`,
      c != null && c > 0.05 ? "Explain the increase (raises, overtime, new hires or back pay) before approving the next payroll." : ""); }
  // Compliance and safety
  if (M.urgent || M.soon) add("Compliance", M.urgent ? "risk" : "watch", `${M.urgent} urgent and ${M.soon} upcoming compliance ${M.urgent + M.soon === 1 ? "item" : "items"} (contracts, permits, 201 files, contributions).`, M.urgent ? "Clear the urgent items on the Compliance alerts page this week." : "");
  if (M.safety) add("Safety", "watch", `${M.safety} safety ${M.safety === 1 ? "incident was" : "incidents were"} recorded.`, "Confirm each incident has a root cause and a corrective action, and report to DOLE where required.");
  return F;
}
function exSummary(M, P, F) {
  const risks = F.filter((f) => f.tone === "risk"), watch = F.filter((f) => f.tone === "watch");
  const out = [`The company ended ${M.label} with ${M.end} active employees${P ? ` (${M.end - P.end >= 0 ? "+" : ""}${M.end - P.end} vs last month)` : ""}, after ${M.hires} hires and ${M.seps} separations.`];
  if (M.cost) out.push(`Payroll cost for the month was ₱${money(M.cost)}${P?.cost ? `, ${chgTxt(M.cost, P.cost, true)}` : ""}.`);
  if (M.fill != null) out.push(`Project manpower is ${pct(M.fill, 0)} filled${M.short.length ? `, with the largest gap at ${M.short[0].name}` : ""}.`);
  out.push(risks.length ? `${risks.length} ${risks.length === 1 ? "area needs" : "areas need"} attention now: ${risks.map((r) => r.area.toLowerCase()).join(", ")}.` : watch.length ? `No urgent risks; ${watch.length} ${watch.length === 1 ? "item" : "items"} to watch.` : "No risks or watch items this month.");
  return out;
}
function exData(m, sc) {
  const R = repMemo(m, sc); const M = exMetrics(R); const P = exMetrics(repMemo(prevMonth(m), sc));
  const trend = [5, 4, 3, 2, 1, 0].map((i) => (i ? exMetrics(repMemo(prevMonth(m, i), sc)) : M));
  const F = exAnalysis(M, P); return { R, M, P, trend, F, sum: exSummary(M, P, F), note: S.repNotes?.get(`${m}_${sc}`) || null };
}
S.repNotes = new Map();
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("repnotes").limit(500).onSnapshot((snap) => { S.repNotes = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {}); }; }

/* Small inline charts: one hue, thin marks, labels in text colours, hover titles. */
const EXC = { navy: "#1F3A68", gold: "#B8913F", red: "#B4462F", grid: "#E7E2D6", ink: "#1B2333", mute: "#5F6472" };
function exBars(title, labels, series, fmt = (v) => Number(v).toLocaleString("en-PH")) {
  const W = 520, H = 210, L = 44, B = 28, T = 16; const max = Math.max(1, ...series.flatMap((s) => s.values)); const n = labels.length, g = (W - L - 10) / n; const bw = Math.min(26, (g - 10) / series.length);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="${EXC.grid}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="${EXC.mute}">${esc(fmt(Math.round(v)))}</text>`).join("");
  const bars = labels.map((lab, i) => series.map((s, j) => { const v = s.values[i] || 0; const x = L + i * g + (g - bw * series.length - 2 * (series.length - 1)) / 2 + j * (bw + 2);
    return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, H - B - y(v))}" rx="3" fill="${s.color}"><title>${esc(`${s.name}, ${lab}: ${fmt(v)}`)}</title></rect>`; }).join("") + `<text x="${L + i * g + g / 2}" y="${H - 9}" text-anchor="middle" font-size="11" fill="${EXC.mute}">${esc(lab)}</text>`).join("");
  const legend = series.length > 1 ? `<div class="ex-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<figure class="ex-chart"><figcaption>${esc(title)}</figcaption>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${ticks}${bars}</svg></figure>`;
}
function exLine(title, labels, values, fmt = (v) => Number(v).toLocaleString("en-PH")) {
  const W = 520, H = 210, L = 44, B = 28, T = 16; const lo = Math.min(...values), hi = Math.max(...values); const pad = Math.max(1, (hi - lo) * 0.2); const min = Math.max(0, lo - pad), max = hi + pad;
  const x = (i) => L + 12 + i * ((W - L - 30) / Math.max(1, labels.length - 1)); const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
  const ticks = [min, (min + max) / 2, max].map((v) => `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="${EXC.grid}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="${EXC.mute}">${esc(fmt(Math.round(v)))}</text>`).join("");
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<figure class="ex-chart"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${ticks}<polyline points="${pts}" fill="none" stroke="${EXC.navy}" stroke-width="2"/>
    ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${EXC.navy}" stroke="#fff" stroke-width="2"><title>${esc(`${labels[i]}: ${fmt(v)}`)}</title></circle><text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="${EXC.mute}">${esc(labels[i])}</text>`).join("")}
    <text x="${x(values.length - 1)}" y="${y(values[values.length - 1]) - 10}" text-anchor="middle" font-size="12" font-weight="700" fill="${EXC.ink}">${esc(fmt(values[values.length - 1]))}</text></svg></figure>`;
}
const mShort = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleString("en-PH", { month: "short" });
const TONE = { good: ["On track", "c-ok"], watch: ["Watch", "c-warn"], risk: ["Act now", "c-bad"] };
function exKpis(M, P) {
  const tile = (label, v, pv, f = "n", better = "up") => { const c = pv ? chg(v, pv) : null; const good = c == null || c === 0 ? null : (c > 0) === (better === "up");
    return `<div class="card ex-kpi"><span class="label">${esc(label)}</span><span class="value">${f === "m" ? "₱" + money(v) : f === "p" ? pct(v) : Number(v).toLocaleString("en-PH")}</span>
      <span class="ex-delta ${good == null ? "" : good ? "t-ok" : "t-bad"}">${c == null ? "No figure last month" : c === 0 ? "Same as last month" : `${c > 0 ? "▲" : "▼"} ${pct(Math.abs(c))} vs last month`}</span></div>`; };
  return `<section class="ex-kpis">${tile("Active employees", M.end, P.end)}${tile("New hires", M.hires, P.hires)}${tile("Separations", M.seps, P.seps, "n", "down")}${tile("Turnover (month)", M.turnover, P.turnover, "p", "down")}
    ${tile("Absence rate", M.absRate, P.absRate, "p", "down")}${tile("Overtime hours", M.ot, P.ot, "n", "down")}${tile("Payroll cost", M.cost, P.cost, "m", "down")}${tile("Projects staffed", M.fill ?? 0, P.fill ?? 0, "p", "up")}</section>`;
}
VIEWS.report = () => {
  const m = S.repMonth || todayISO().slice(0, 7); const sc = S.repScope || "all"; const X = exData(m, sc); const { R, M, P, trend, F } = X; const labs = trend.map((t) => mShort(t.month));
  const areas = [...new Set(F.map((f) => f.area))]; const acts = F.filter((f) => f.act && f.tone !== "good");
  return `<section class="ex-cover"><img src="${CO_LOGO}" alt="" class="ex-logo"><div><span class="ex-eyebrow">Executive HR report</span><h1>${esc(R.label)}</h1><p>${esc(R.company)} · ${esc(R.scope)} · Prepared ${esc(fmtDate(todayISO()))}</p></div>
      <label class="field rep-month"><span class="sr-only">Month</span><input class="input" type="month" id="rep-month" value="${m}" max="${todayISO().slice(0, 7)}"></label></section>
    <div class="iobar no-print" role="toolbar" aria-label="Report downloads">
      <span class="seg" role="group" aria-label="Report covers">${REP_SCOPES.map(([k, l]) => `<button data-rep-scope="${k}" aria-pressed="${sc === k}">${l}</button>`).join("")}</span>
      <button class="btn btn-ghost btn-sm" data-rep="pdf">${icon("pdf", 16)}Download PDF</button>
      <button class="btn btn-ghost btn-sm" data-rep="pptx">${icon("slides", 16)}Download PowerPoint</button>
      <button class="btn btn-ghost btn-sm" data-rep="xlsx">${icon("download", 16)}Export to Excel</button>
      <button class="btn btn-ghost btn-sm" data-io="att">${icon("clip", 16)}Attachments${attsFor("report").length ? `<span class="io-count">${attsFor("report").length}</span>` : ""}</button>
    </div>
    <section class="card ex-summary"><div class="card-head"><h2>Executive summary</h2></div><ul>${X.sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      ${X.note?.ai ? `<div class="ex-ai"><b>Analysis by Claude</b>${X.note.ai.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p.replace(/^[-*•]\s*/, ""))}</p>`).join("")}<small class="t-muted">Written ${esc(fmtDate((X.note.aiAt || "").slice(0, 10)))}. Check the figures before sharing.</small></div>` : ""}
      ${S.canEdit && S.sample ? `<button class="btn btn-ghost btn-sm" data-ex-ai ${S.exBusy ? "disabled" : ""}>${icon("spark", 16)}${S.exBusy ? "Writing…" : X.note?.ai ? "Rewrite the analysis with Claude" : "Write a deeper analysis with Claude"}</button>` : ""}</section>
    ${exKpis(M, P)}
    <section class="card"><div class="card-head"><h2>Six-month trends</h2></div><div class="ex-charts">
      ${exLine("Active employees at month end", labs, trend.map((t) => t.end))}
      ${exBars("Hires and separations", labs, [{ name: "Hires", color: EXC.navy, values: trend.map((t) => t.hires) }, { name: "Separations", color: EXC.gold, values: trend.map((t) => t.seps) }])}
      ${exBars("Payroll cost (₱)", labs, [{ name: "Payroll cost", color: EXC.navy, values: trend.map((t) => t.cost) }], (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v))))}
      ${exBars("Overtime hours and absence days", labs, [{ name: "Overtime hours", color: EXC.navy, values: trend.map((t) => t.ot) }, { name: "Absence days", color: EXC.gold, values: trend.map((t) => t.abs) }])}
    </div></section>
    <section class="card"><div class="card-head"><h2>Analysis</h2></div><div class="ex-findings">${areas.map((a) => `<div class="ex-area"><h3>${esc(a)}</h3>${F.filter((f) => f.area === a).map((f) => `<p><span class="chip ${TONE[f.tone][1]}">${TONE[f.tone][0]}</span> ${esc(f.text)}</p>`).join("")}</div>`).join("") || '<p class="t-muted">Not enough records this month for an analysis.</p>'}</div></section>
    <section class="card"><div class="card-head"><h2>Recommended actions</h2></div>${acts.length ? `<ol class="ex-acts">${acts.map((f) => `<li><b>${esc(f.area)}:</b> ${esc(f.act)}</li>`).join("")}</ol>` : '<p class="t-muted" style="margin:0">Nothing needs action this month.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Management comments</h2></div>${S.canEdit ? `<textarea class="input" id="ex-note" aria-label="Management comments" rows="3" placeholder="Add your own comments for management; they print in the report.">${esc(X.note?.text || "")}</textarea><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" data-ex-note>Save comments</button></div>` : `<p style="margin:0">${esc(X.note?.text || "None.")}</p>`}</section>
    <details class="card ex-appendix"><summary><h2 style="display:inline">Appendix: detailed tables</h2> <span class="t-muted" style="font-size:13px">${R.sections.length} tables</span></summary>
    <div class="rep-grid" style="margin-top:12px">${R.sections.map((s) => `<section class="card rep-sec${s.head.length > 5 || s.title === "Compliance alerts" ? " rep-wide" : ""}"><div class="card-head"><h2>${esc(s.title)}</h2></div>
      ${s.rows.length ? `<div class="table-wrap"><table><thead><tr>${s.head.map((h, i) => `<th${s.fmt[i] && s.fmt[i] !== "t" && s.fmt[i] !== "d" ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((v, i) => `<td${s.fmt[i] && s.fmt[i] !== "t" && s.fmt[i] !== "d" ? ' class="num"' : ""}>${esc(fmtV(v, s.fmt[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Nothing recorded for this month.</p>'}
      ${s.note ? `<p class="t-muted" style="margin:10px 0 0;font-size:13px">${esc(s.note)}</p>` : ""}</section>`).join("")}</div></details>`;
};
{ const st = document.createElement("style"); st.textContent = `.ex-cover{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:24px 28px;border-radius:20px;color:#fff;background:linear-gradient(135deg,#0D1729 0%,#152B50 60%,#1F3A68 100%);border:1px solid rgba(201,164,92,.35)}
.ex-cover>div{flex:1;min-width:220px}.ex-cover h1{font-family:var(--display,serif);font-size:34px;margin:2px 0;color:#fff}.ex-cover p{margin:0;color:#D9DEEA;font-size:14px}
.ex-eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#E4C98E;font-weight:700}.ex-logo{width:64px;height:64px;border-radius:50%;background:#fff;padding:3px}
.ex-cover .rep-month input{background:#fff;color:#1B2333}
.ex-summary ul{margin:0;padding-left:20px;display:grid;gap:6px;font-size:15px;line-height:1.55}.ex-ai{margin:14px 0 10px;padding:12px 14px;border-left:3px solid #B8913F;background:#FAF7F0;border-radius:8px}.ex-ai p{margin:6px 0;font-size:14.5px;line-height:1.55}
.ex-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.ex-kpi{display:flex;flex-direction:column;gap:4px;padding:14px 16px}.ex-kpi .value{font-size:24px;font-weight:700;font-family:var(--display,serif)}.ex-delta{font-size:12.5px;color:#5F6472}.ex-delta.t-ok{color:var(--ok)}.ex-delta.t-bad{color:var(--bad)}
.ex-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}.ex-chart{margin:0}.ex-chart figcaption{font-weight:700;font-size:14px;margin-bottom:4px}.ex-chart svg{width:100%;height:auto;display:block}
.ex-legend{display:flex;gap:14px;font-size:12px;color:#5F6472;margin-bottom:2px}.ex-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.ex-findings{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.ex-area h3{font-size:15px;margin:0 0 6px}.ex-area p{margin:0 0 8px;font-size:14px;line-height:1.5}
.ex-acts{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14.5px}.ex-appendix summary{cursor:pointer;list-style:revert}
@media print{.ex-cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}.ex-appendix{display:block}}`; document.head.appendChild(st); }
document.addEventListener("click", async (ev) => { const t = ev.target.closest("[data-ex-note],[data-ex-ai]"); if (!t) return; ev.stopImmediatePropagation();
  const m = S.repMonth || todayISO().slice(0, 7); const sc = S.repScope || "all"; const key = `${m}_${sc}`; const cur = S.repNotes.get(key) || {};
  if (t.hasAttribute("data-ex-note")) { const text = $("#ex-note").value.trim(); const n = { ...cur, text, at: new Date().toISOString(), by: S.myId || "hr" };
    try { await S.db.doc(`repnotes/${key}`).set(n); S.repNotes.set(key, n); S.ver++; logActivity(`Saved management comments for the ${monthLabel(m)} report`); toast("Comments saved."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (!S.sample || S.exBusy) return; S.exBusy = true; render();
  try { const X = exData(m, sc); const brief = { month: X.M.label, scope: X.R.scope, thisMonth: X.M, lastMonth: X.P, sixMonths: X.trend.map((t) => ({ month: t.label, end: t.end, hires: t.hires, seps: t.seps, cost: Math.round(t.cost), ot: t.ot, abs: t.abs })), findings: X.F.map((f) => `${f.area}: ${f.text}`) };
    const res = await S.sample(`You are the HR analytics adviser to the President of GD Prime Property Management Corporation, a Philippine property management company. Write the analysis section of the monthly executive HR report from the figures below.
Write 4 to 6 short paragraphs in plain business English: the overall picture, workforce and turnover, manpower and recruitment, attendance and overtime, payroll cost, then risks and the 3 most important actions. Compare with last month and the six-month trend. Use only these figures; if a figure is zero or missing, say there are not enough records rather than inventing numbers. Use ₱ for money. No headings, no bullet symbols, no markdown.
DATA: ${JSON.stringify(brief)}`, { modelTier: "default", cache: false });
    const n = { ...cur, ai: String(res?.text || "").trim(), aiAt: new Date().toISOString() }; if (n.ai) { await S.db.doc(`repnotes/${key}`).set(n); S.repNotes.set(key, n); S.ver++; logActivity(`Claude wrote the analysis for the ${monthLabel(m)} report`); }
  } catch (e) { if (e?.code === "not_granted") S.sample = null; toast("Couldn't write the analysis. Try again."); } finally { S.exBusy = false; render(); } }, true);

/* Downloads in the executive format. */
async function exPdf(R) {
  let J; try { J = await loadLib("pdf"); await loadLib("pdfTable"); } catch { toast("Couldn't load the PDF tools. Check your connection and try again."); return false; }
  const X = exData(R.month, S.repScope || "all"); const { M, P, F, trend } = X;
  const doc = new J({ orientation: "portrait", unit: "pt", format: "a4" }); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const navy = [21, 43, 80], gold = [184, 145, 63], ink = [27, 35, 51], muted = [95, 100, 114]; const peso = (v) => `PHP ${money(v)}`; const clean = (s) => String(s).replace(/₱/g, "PHP ");
  // Cover
  doc.setFillColor(...navy); doc.rect(0, 0, W, H, "F");
  try { const im = new Image(); im.src = CO_LOGO; await im.decode(); const cv = document.createElement("canvas"); cv.width = cv.height = 280; const g = cv.getContext("2d"); g.fillStyle = "#152B50"; g.fillRect(0, 0, 280, 280); g.fillStyle = "#fff"; g.beginPath(); g.arc(140, 140, 138, 0, 7); g.fill(); g.drawImage(im, 8, 8, 264, 264); doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 50, 70, 70, 70); } catch {}
  doc.setTextColor(228, 201, 142); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("EXECUTIVE HR REPORT", 50, 200);
  doc.setTextColor(255, 255, 255); doc.setFont("times", "bold"); doc.setFontSize(40); doc.text(R.label, 50, 250);
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.text(`${R.company}`, 50, 285); doc.text(`${R.scope} · Prepared ${fmtDate(todayISO())}`, 50, 305);
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(50, 330, 250, 330);
  // Summary page
  doc.addPage(); let y = 60; const h2 = (t) => { if (y > H - 120) { doc.addPage(); y = 60; } else if (y > 70) y += 10; doc.setTextColor(...navy); doc.setFont("times", "bold"); doc.setFontSize(18); doc.text(t, 50, y); doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(50, y + 6, 110, y + 6); y += 26; };
  const para = (t, size = 11, color = ink, indent = 0) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...color); for (const ln of doc.splitTextToSize(clean(t), W - 100 - indent)) { if (y > H - 60) { doc.addPage(); y = 60; } doc.text(ln, 50 + indent, y); y += size * 1.45; } y += 4; };
  h2("Executive summary"); for (const s of X.sum) para(`•  ${s}`);
  if (X.note?.ai) { y += 4; h2("Analysis"); for (const p of X.note.ai.split(/\n+/).filter(Boolean)) para(p.replace(/^[-*•]\s*/, "")); }
  y += 6; h2("Key figures");
  const kp = [["Active employees", M.end, P.end, "n"], ["New hires", M.hires, P.hires, "n"], ["Separations", M.seps, P.seps, "n"], ["Turnover (month)", M.turnover, P.turnover, "p"], ["Absence rate", M.absRate, P.absRate, "p"], ["Overtime hours", M.ot, P.ot, "n"], ["Payroll cost", M.cost, P.cost, "m"], ["Projects staffed", M.fill ?? 0, P.fill ?? 0, "p"]];
  const fv = (v, f) => (f === "m" ? peso(v) : f === "p" ? pct(v) : Number(v).toLocaleString("en-PH"));
  { const JW = [[21, 43, 80], [11, 122, 90], [163, 32, 79], [109, 40, 217], [15, 118, 110], [163, 65, 15], [43, 79, 184], [21, 43, 80]]; const tw = (W - 100 - 30) / 4, th = 74;
    kp.forEach(([l, v, pv, f], i) => { const x = 50 + (i % 4) * (tw + 10), ty = y + Math.floor(i / 4) * (th + 10); doc.setFillColor(...JW[i]); doc.roundedRect(x, ty, tw, th, 8, 8, "F"); doc.setFillColor(...gold); doc.rect(x + 8, ty, tw - 16, 2.5, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(l.toUpperCase(), x + 10, ty + 18); doc.setFont("times", "bold"); doc.setFontSize(f === "m" ? 13 : 20); doc.text(fv(v, f), x + 10, ty + 44);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(228, 201, 142); doc.text(pv ? `${chg(v, pv) > 0 ? "+" : ""}${pct(chg(v, pv))} vs last month` : "No figure last month", x + 10, ty + 62); });
    y += 2 * (th + 10) + 8; }
  doc.autoTable({ startY: y, head: [["Figure", "This month", "Last month", "Change"]], body: kp.map(([l, v, pv, f]) => [l, fv(v, f), fv(pv, f), pv ? `${chg(v, pv) > 0 ? "+" : ""}${pct(chg(v, pv))}` : "—"]), theme: "grid", headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold" }, styles: { fontSize: 10, textColor: ink }, columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } }, margin: { left: 50, right: 50 } });
  y = doc.lastAutoTable.finalY + 26;
  // Trend chart: payroll cost and headcount, drawn as simple bars.
  if (y > H - 240) { doc.addPage(); y = 60; } h2("Six-month trend");
  const chart = (title, vals, fmt, x0, w) => { const top = y + 14, hh = 110, max = Math.max(1, ...vals), bw = w / vals.length; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...ink); doc.text(title, x0, y);
    vals.forEach((v, i) => { const bh = (hh * v) / max; doc.setFillColor(...(i === vals.length - 1 ? navy : [150, 165, 195])); doc.rect(x0 + i * bw + 6, top + hh - bh, bw - 12, bh, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(mShort(trend[i].month), x0 + i * bw + bw / 2, top + hh + 12, { align: "center" }); doc.text(fmt(v), x0 + i * bw + bw / 2, top + hh - bh - 4, { align: "center" }); }); };
  if (y > H - 190) { doc.addPage(); y = 60; }
  chart("Active employees", trend.map((t) => t.end), (v) => String(v), 50, (W - 120) / 2); chart("Payroll cost (PHP)", trend.map((t) => t.cost), (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v))), 70 + (W - 120) / 2, (W - 120) / 2);
  y += 160;
  h2("Findings"); for (const f of F) para(`${TONE[f.tone][0].toUpperCase()} · ${f.area}: ${f.text}`, 10.5);
  const acts = F.filter((f) => f.act && f.tone !== "good"); if (acts.length) { y += 4; h2("Recommended actions"); acts.forEach((f, i) => para(`${i + 1}. ${f.area}: ${f.act}`, 10.5)); }
  if (X.note?.text) { y += 4; h2("Management comments"); para(X.note.text); }
  // Appendix
  doc.addPage(); y = 60; h2("Appendix: detailed tables");
  for (const s of R.sections) { if (y > H - 100) { doc.addPage(); y = 60; } doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(s.title, 50, y); y += 6;
    const cs = {}; s.fmt.forEach((f, i) => { if (f && f !== "t" && f !== "d") cs[i] = { halign: "right" }; });
    doc.autoTable({ startY: y, head: [s.head], body: s.rows.length ? s.rows.map((r) => r.map((v, i) => fmtV(v, s.fmt[i], true))) : [["Nothing recorded for this month."]], theme: "striped", headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold" }, styles: { fontSize: 8, textColor: ink, cellPadding: 3 }, columnStyles: cs, margin: { left: 50, right: 50 } });
    y = doc.lastAutoTable.finalY + 22; }
  const n = doc.internal.getNumberOfPages(); for (let i = 2; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(`${R.company} · Executive HR report · ${R.label}`, 50, H - 24); doc.text(`Page ${i - 1} of ${n - 1}`, W - 50, H - 24, { align: "right" }); }
  return saveBlob(repFile(R, "pdf"), doc.output("blob"));
}
async function exPptx(R) {
  let Pp; try { Pp = await loadLib("pptx"); } catch { toast("Couldn't load the PowerPoint tools. Check your connection and try again."); return false; }
  const X = exData(R.month, S.repScope || "all"); const { M, P, F, trend } = X; const p = new Pp(); p.layout = "LAYOUT_WIDE"; p.title = `Executive HR report ${R.label}`; p.company = R.company;
  const NAVY = "152B50", GOLD = "B8913F", INK = "1B2333", MUTED = "5F6472"; const labs = trend.map((t) => mShort(t.month));
  p.defineSlideMaster({ title: "BODY", background: { color: "FFFFFF" }, objects: [{ rect: { x: 0, y: 0, w: 13.33, h: 0.1, fill: { color: NAVY } } }, { text: { text: `${R.company} · Executive HR report · ${R.label}`, options: { x: 0.5, y: 7.05, w: 9, h: 0.3, fontSize: 9, color: MUTED } } }], slideNumber: { x: 12.4, y: 7.05, fontSize: 9, color: MUTED } });
  const title = (s, t) => { s.addText(t, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontSize: 28, bold: true, color: NAVY, fontFace: "Georgia" }); s.addShape(p.ShapeType.rect, { x: 0.5, y: 1.0, w: 1.0, h: 0.04, fill: { color: GOLD }, line: { color: GOLD } }); };
  const c = p.addSlide(); c.background = { color: NAVY }; try { c.addImage({ data: CO_LOGO, x: 0.7, y: 0.8, w: 1.1, h: 1.1 }); } catch {}
  c.addText("EXECUTIVE HR REPORT", { x: 0.7, y: 2.6, w: 12, h: 0.4, fontSize: 14, bold: true, color: "E4C98E", charSpacing: 4 });
  c.addText(R.label, { x: 0.7, y: 3.0, w: 12, h: 1.0, fontSize: 48, bold: true, color: "FFFFFF", fontFace: "Georgia" });
  c.addText(`${R.company} · ${R.scope} · Prepared ${fmtDate(todayISO())}`, { x: 0.7, y: 4.1, w: 12, h: 0.5, fontSize: 16, color: "D9DEEA" });
  const s1 = p.addSlide({ masterName: "BODY" }); title(s1, "Executive summary"); s1.addText(X.sum.map((t) => ({ text: t, options: { bullet: true, paraSpaceAfter: 10 } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.4, fontSize: 18, color: INK, valign: "top" });
  if (X.note?.ai) { const s = p.addSlide({ masterName: "BODY" }); title(s, "Analysis"); s.addText(X.note.ai.split(/\n+/).filter(Boolean).map((t) => ({ text: t.replace(/^[-*•]\s*/, ""), options: { paraSpaceAfter: 8 } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.5, fontSize: 13, color: INK, valign: "top", fit: "shrink" }); }
  const s2 = p.addSlide({ masterName: "BODY" }); title(s2, "Key figures");
  const kp = [["Active employees", M.end, P.end, "n", "up"], ["New hires", M.hires, P.hires, "n", "up"], ["Separations", M.seps, P.seps, "n", "down"], ["Turnover (month)", M.turnover, P.turnover, "p", "down"], ["Absence rate", M.absRate, P.absRate, "p", "down"], ["Overtime hours", M.ot, P.ot, "n", "down"], ["Payroll cost", M.cost, P.cost, "m", "down"], ["Projects staffed", M.fill ?? 0, P.fill ?? 0, "p", "up"]];
  kp.forEach(([l, v, pv, f, better], i) => { const x = 0.5 + (i % 4) * 3.1, y = 1.35 + Math.floor(i / 4) * 2.7; const ch = pv ? chg(v, pv) : null; const good = ch == null || ch === 0 ? null : (ch > 0) === (better === "up");
    const JC = ["152B50", "0B7A5A", "A3204F", "6D28D9", "0F766E", "A3410F", "2B4FB8", "152B50"][i]; s2.addShape(p.ShapeType.roundRect, { x, y, w: 2.9, h: 2.4, fill: { color: JC }, line: { color: "E4C98E", width: 0.75 }, rectRadius: 0.12 }); s2.addShape(p.ShapeType.rect, { x: x + 0.2, y: y + 0.06, w: 2.5, h: 0.04, fill: { color: "E4C98E" }, line: { color: "E4C98E" } });
    s2.addText(l, { x: x + 0.2, y: y + 0.15, w: 2.5, h: 0.4, fontSize: 13, color: "E8ECF5" });
    s2.addText(f === "m" ? `₱${money(v)}` : f === "p" ? pct(v) : Number(v).toLocaleString("en-PH"), { x: x + 0.2, y: y + 0.65, w: 2.6, h: 0.8, fontSize: f === "m" ? 20 : 30, bold: true, color: "FFFFFF", fontFace: "Georgia" });
    s2.addText(ch == null ? "No figure last month" : ch === 0 ? "Same as last month" : `${ch > 0 ? "▲" : "▼"} ${pct(Math.abs(ch))} vs last month`, { x: x + 0.2, y: y + 1.6, w: 2.6, h: 0.4, fontSize: 12, bold: true, color: good == null ? "E4C98E" : good ? "A7F3D0" : "FECDD3" }); });
  const s3 = p.addSlide({ masterName: "BODY" }); title(s3, "Six-month trends");
  const co = { showLegend: true, legendPos: "b", legendFontSize: 10, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, valGridLine: { color: "E7E2D6", size: 0.5 }, showTitle: true, titleFontSize: 12, titleColor: INK };
  s3.addChart(p.ChartType.line, [{ name: "Active employees", labels: labs, values: trend.map((t) => t.end) }], { ...co, x: 0.5, y: 1.25, w: 6.1, h: 2.8, chartColors: [NAVY], lineSize: 2, lineDataSymbolSize: 7, title: "Active employees", showLegend: false });
  s3.addChart(p.ChartType.bar, [{ name: "Hires", labels: labs, values: trend.map((t) => t.hires) }, { name: "Separations", labels: labs, values: trend.map((t) => t.seps) }], { ...co, x: 6.8, y: 1.25, w: 6.0, h: 2.8, chartColors: [NAVY, GOLD], barDir: "col", title: "Hires and separations" });
  s3.addChart(p.ChartType.bar, [{ name: "Payroll cost", labels: labs, values: trend.map((t) => Math.round(t.cost)) }], { ...co, x: 0.5, y: 4.2, w: 6.1, h: 2.7, chartColors: [NAVY], barDir: "col", title: "Payroll cost (₱)", showLegend: false, valAxisLabelFormatCode: "#,##0" });
  s3.addChart(p.ChartType.bar, [{ name: "Overtime hours", labels: labs, values: trend.map((t) => t.ot) }, { name: "Absence days", labels: labs, values: trend.map((t) => t.abs) }], { ...co, x: 6.8, y: 4.2, w: 6.0, h: 2.7, chartColors: [NAVY, GOLD], barDir: "col", title: "Overtime and absences" });
  const s4 = p.addSlide({ masterName: "BODY" }); title(s4, "Findings");
  s4.addTable([[{ text: "Status", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }, { text: "Area", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }, { text: "Finding", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }],
    ...F.map((f) => [{ text: TONE[f.tone][0], options: { bold: true, color: f.tone === "risk" ? "B4462F" : f.tone === "watch" ? "9A6B00" : "15803D" } }, { text: f.area }, { text: f.text }])], { x: 0.5, y: 1.3, w: 12.3, colW: [1.4, 1.8, 9.1], fontSize: 11, color: INK, border: { type: "solid", pt: 0.5, color: "E7E2D6" }, autoPage: true, autoPageRepeatHeader: true, newSlideStartY: 1.3, masterName: "BODY" });
  const acts = F.filter((f) => f.act && f.tone !== "good");
  const s5 = p.addSlide({ masterName: "BODY" }); title(s5, "Recommended actions");
  s5.addText(acts.length ? acts.map((f) => ({ text: `${f.area}: ${f.act}`, options: { bullet: { type: "number" }, paraSpaceAfter: 10 } })) : [{ text: "Nothing needs action this month." }], { x: 0.6, y: 1.3, w: 12.1, h: 4.2, fontSize: 16, color: INK, valign: "top", fit: "shrink" });
  if (X.note?.text) s5.addText([{ text: "Management comments: ", options: { bold: true } }, { text: X.note.text }], { x: 0.6, y: 5.6, w: 12.1, h: 1.2, fontSize: 13, color: INK, fill: { color: "FAF7F0" }, valign: "top" });
  const ap = p.addSlide({ masterName: "BODY" }); title(ap, "Appendix"); ap.addText("Detailed tables follow.", { x: 0.6, y: 1.4, w: 12, h: 0.5, fontSize: 16, color: MUTED });
  for (const sec of R.sections) { if (!sec.rows.length) continue; const s = p.addSlide({ masterName: "BODY" }); s.addText(sec.title, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: NAVY, fontFace: "Georgia" });
    const al = (i) => (sec.fmt[i] && sec.fmt[i] !== "t" && sec.fmt[i] !== "d" ? "right" : "left");
    s.addTable([sec.head.map((h, i) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: al(i) } })), ...sec.rows.map((r) => r.map((v, i) => ({ text: fmtV(v, sec.fmt[i]), options: { align: al(i) } })))], { x: 0.5, y: 1.1, w: 12.3, fontSize: sec.head.length > 7 ? 9 : 11, color: INK, border: { type: "solid", pt: 0.5, color: "E7E2D6" }, autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 1.1, newSlideStartY: 1.1, masterName: "BODY" }); }
  const blob = await p.write({ outputType: "blob" }); return saveBlob(repFile(R, "pptx"), blob);
}
{ const b = reportXlsx; reportXlsx = async (R) => { const X = exData(R.month, S.repScope || "all"); const { M, P } = X;
  const fx = [["Active employees", M.end, P.end], ["New hires", M.hires, P.hires], ["Separations", M.seps, P.seps], ["Turnover (month)", M.turnover, P.turnover], ["Absence rate", M.absRate, P.absRate], ["Overtime hours", M.ot, P.ot], ["Payroll cost", PAY.r2(M.cost), PAY.r2(P.cost)], ["Projects staffed", M.fill ?? "", P.fill ?? ""]];
  const ex = [[`${R.company} · Executive HR report`], [`${R.label} · ${R.scope}`], [], ["Executive summary"], ...X.sum.map((s) => [s]), [], ["Figure", "This month", "Last month"], ...fx, [], ["Status", "Area", "Finding", "Recommended action"], ...X.F.map((f) => [TONE[f.tone][0], f.area, f.text, f.act || ""]),
    ...(X.note?.ai ? [[], ["Analysis by Claude"], ...X.note.ai.split(/\n+/).filter(Boolean).map((p) => [p])] : []), ...(X.note?.text ? [[], ["Management comments"], [X.note.text]] : []), [], ["Six-month trend", "Active employees", "Hires", "Separations", "Payroll cost", "Overtime hours", "Absence days"], ...X.trend.map((t) => [t.label, t.end, t.hires, t.seps, PAY.r2(t.cost), t.ot, t.abs])];
  const orig = saveBook; saveBook = (name, sheets) => { saveBook = orig; return orig(name, [{ name: "Executive summary", rows: ex }, ...sheets]); }; return b(R); }; }
reportPdf = exPdf; reportPptx = exPptx;
