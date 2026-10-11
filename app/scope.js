/* ---------- Head Office / Projects split: each listed page gets two filtered copies ---------- */
const SPLIT = { ho: "Head Office", prj: "Projects" };
const SCOPED = ["perf", "property", "tk", "dtr", "attendance", "clockin", "punches", "ot", "leave", "timeSettings", "payroll", "loans", "flex"];
const baseView = (n) => (n || "").replace(/_(ho|prj)$/, "");
const inScope = (e, sc) => (sc === "prj" ? !!e?.projectId : !e?.projectId);
const scopeTabs = (v) => `<div class="tabs on-blue" role="tablist" aria-label="Head Office or Projects">${[[v, "All"], [v + "_ho", "Head Office"], [v + "_prj", "Projects"]].map(([x, l]) => `<button class="tab" role="tab" data-go="${x}" aria-selected="${S.view.name === x}">${l}</button>`).join("")}</div>`;
const withTabs = (html, v) => { const i = html.indexOf("</header>"); return i < 0 ? scopeTabs(v) + html : html.slice(0, i + 9) + scopeTabs(v) + html.slice(i + 9); };
{
  for (const v of SCOPED) {
    const base = VIEWS[v]; if (!base) continue;
    VIEWS[v] = () => (S.view.name === v ? withTabs(base(), v) : base());
    for (const sc of Object.keys(SPLIT)) {
      const name = `${v}_${sc}`;
      VIEWS[name] = () => {
        const all = S.emps, prop = S.prop; S.allEmps = all; S.emps = new Map([...all].filter(([, e]) => inScope(e, sc))); S.scope = sc;
        if (prop) S.prop = new Map([...prop].filter(([, x]) => (x.holderId && all.has(x.holderId) ? S.emps.has(x.holderId) : inScope({ projectId: x.projectId || null }, sc))));
        let html; try { html = base(); } finally { S.emps = all; S.allEmps = null; S.prop = prop; S.scope = null; }
        return withTabs(html.replace("</h1>", ` · ${SPLIT[sc]}</h1>`), v);
      };
      SECTION_OF[name] = name;
      if (after[v]) after[name] = after[v];
    }
    for (const [, items] of NAV) { const it = items.find(([x]) => x === v); if (it) it[3] = Object.entries(SPLIT).map(([sc, l]) => [`${v}_${sc}`, l, sc === "ho" ? "building" : "project"]); }
  }
}
/* Payroll totals for just the people on a Head Office or Projects page. */
function scopeTotals(lines, emps) {
  const ls = emps.map((e) => lines[e.id]).filter(Boolean); const T = { count: ls.length };
  for (const k of ["gross", "net", "tax", "sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "ded", "basic", "ot", "rd", "rhw", "sh", "nd", "xp", "comm", "allowN", "allowT", "flexN", "flexE", "flexB", "flexT", "loanTot", "taxable"]) T[k] = PAY.r2(ls.reduce((a, l) => a + (Number(l[k]) || 0), 0));
  T.employer = PAY.r2(T.sssEr + T.ec + T.phEr + T.hdEr); T.cost = PAY.r2(T.gross + T.employer);
  return T;
}
