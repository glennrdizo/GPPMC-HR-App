/* ---------- dashboard: recruitment figures, weekly applications chart, pipeline, and a table per open job ---------- */
function recDash() {
  const today = todayISO(); const d30 = addDays(today, -29), d7 = addDays(today, -6); const sc = S.dashScope || "all";
  const jobs = listOf(S.jobs).filter((j) => sc === "all" || (sc === "prj" ? !!j.projectId : !j.projectId)); const jid = new Set(jobs.map((j) => j.id));
  const apps = listOf(S.apps).filter((a) => jid.has(a.jobId)); const open = jobs.filter((j) => j.status === "OPEN");
  const in30 = apps.filter((a) => a.applied >= d30 && a.applied <= today), in7 = apps.filter((a) => a.applied >= d7 && a.applied <= today);
  const act = apps.filter(inProcess), ref = apps.filter((a) => a.stage === "REJECTED"), wd = apps.filter((a) => a.stage === "WITHDRAWN").length;
  const left = open.reduce((a, j) => a + Math.max(0, (j.slots || 0) - jobHired(j)), 0);
  const tile = (ic, label, v, note, go) => `<button class="card stat kpi rd-tile" ${go}><span class="kpi-ic" style="background:var(--blue-soft);color:var(--blue)">${icon(ic, 20)}</span><span class="label">${label}</span><span class="value">${v}</span><span class="note t-muted">${note}</span></button>`;
  // Applications per week, last 12 weeks (week ends today).
  const weeks = [...Array(12).keys()].reverse().map((i) => { const end = addDays(today, -7 * i), start = addDays(end, -6); return { start, end, n: apps.filter((a) => a.applied >= start && a.applied <= end).length }; });
  const max = Math.max(1, ...weeks.map((w) => w.n)); const W = 600, H = 200, padL = 28, padB = 26, bw = (W - padL) / 12;
  const nice = Math.max(1, Math.ceil(max / 4)); const top = nice * 4; const y = (v) => H - padB - (v / top) * (H - padB - 10);
  const short = (iso) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(parseISO(iso));
  const chart = `<svg class="rd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Applicants per week for the last 12 weeks">
    ${[0, 1, 2, 3, 4].map((k) => `<line x1="${padL}" x2="${W}" y1="${y(k * nice)}" y2="${y(k * nice)}" class="rd-grid"/><text x="${padL - 6}" y="${y(k * nice) + 4}" text-anchor="end" class="rd-ax">${k * nice}</text>`).join("")}
    ${weeks.map((w, i) => { const x = padL + i * bw + 4, h = H - padB - y(w.n); return `<g class="rd-bar"><rect x="${padL + i * bw}" y="0" width="${bw}" height="${H - padB}" fill="transparent"><title>${short(w.start)} to ${short(w.end)}: ${w.n} ${w.n === 1 ? "applicant" : "applicants"}</title></rect>
      ${w.n ? `<path d="M${x},${H - padB} v${-(h - 4)} q0,-4 4,-4 h${bw - 16} q4,0 4,4 v${h - 4} z" class="rd-fill"><title>${short(w.start)} to ${short(w.end)}: ${w.n}</title></path>` : ""}
      ${i % 2 === 1 || i === 11 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="rd-ax">${short(w.end)}</text>` : ""}</g>`; }).join("")}
  </svg>`;
  const stages = [...STAGES.map(([k, l]) => [l, apps.filter((a) => a.stage === k).length]), ["Not selected", ref.length], ["Withdrew", wd]];
  const smax = Math.max(1, ...stages.map((s) => s[1]));
  const rows = open.map((j) => { const xs = apps.filter((a) => a.jobId === j.id); const p = S.projects.get(j.projectId);
    return `<tr class="go" data-job="${j.id}" tabindex="0"><td><b>${esc(j.title)}</b></td><td class="t-muted">${esc(p ? p.name : "Head Office")}</td><td>${pubChip(j)}</td><td class="num">${Math.max(0, (j.slots || 0) - jobHired(j))}</td><td class="num">${xs.length}</td><td class="num">${xs.filter((a) => a.applied >= d30 && a.applied <= today).length}</td><td class="num">${xs.filter((a) => a.applied >= d7 && a.applied <= today).length}</td><td class="num">${xs.filter(inProcess).length}</td><td class="num">${xs.filter((a) => a.stage === "REJECTED").length}</td></tr>`; }).join("");
  return `<section class="stats kpis rd-kpis" aria-label="Recruitment figures">
      ${tile("search", "Job openings", open.length, `${left} ${left === 1 ? "person" : "people"} still to hire${open.some((j) => !jobPosted(j).length) ? ` · ${open.filter((j) => !jobPosted(j).length).length} not yet posted` : ""}`, 'data-go="hiring"')}
      ${tile("people", "Total applicants", apps.length, `${act.length} still in process`, 'data-go="hiring"')}
      ${tile("cal", "Applicants, last 30 days", in30.length, `since ${short(d30)}`, 'data-go="hiring"')}
      ${tile("star", "Active applicants", act.length, "from Applied to Job offer", 'data-go="hiring"')}
      ${tile("clock", "Applicants, last 7 days", in7.length, `since ${short(d7)}`, 'data-go="hiring"')}
      ${tile("door", "Refused applicants", ref.length, wd ? `${wd} more withdrew` : "not selected", 'data-go="hiring"')}
    </section>
    <div class="row">
      <section class="card wide"><div class="card-head"><h2>Applicants per week</h2><span class="t-muted" style="font-size:13px">Last 12 weeks · ${apps.filter((a) => a.applied >= weeks[0].start).length} applicants</span></div>${chart}</section>
      <section class="card"><div class="card-head"><h2>Where applicants are now</h2></div>
        <div class="list">${stages.map(([l, n]) => `<div class="hbar" title="${esc(l)}: ${n}"><span style="font-weight:600">${esc(l)}</span><div class="bar" style="height:10px"><i style="width:${(n / smax) * 100}%"></i></div><b class="num" style="text-align:right">${n}</b></div>`).join("")}</div></section>
    </div>
    <section class="card" style="margin-bottom:20px"><div class="card-head"><h2>Open jobs</h2><button class="link" data-go="hiring">All jobs</button></div>
      ${open.length ? `<div class="table-wrap"><table><thead><tr><th>Job</th><th>Site</th><th>Posting</th><th class="num">Openings</th><th class="num">Total applicants</th><th class="num">Last 30 days</th><th class="num">Last 7 days</th><th class="num">Active</th><th class="num">Refused</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th colspan="2">Total</th><th>${open.filter((j) => jobPosted(j).length).length} of ${open.length} published</th><th class="num">${left}</th><th class="num">${apps.filter((a) => open.some((j) => j.id === a.jobId)).length}</th><th class="num">${in30.filter((a) => open.some((j) => j.id === a.jobId)).length}</th><th class="num">${in7.filter((a) => open.some((j) => j.id === a.jobId)).length}</th><th class="num">${act.filter((a) => open.some((j) => j.id === a.jobId)).length}</th><th class="num">${ref.filter((a) => open.some((j) => j.id === a.jobId)).length}</th></tr></tfoot></table></div>`
        : `<div class="empty-state"><span class="es-ic">${icon("search", 22)}</span><p>No open jobs. Open one under Recruitment to start taking applicants.</p></div>`}
    </section>`;
}
