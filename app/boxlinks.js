/* ---------- Figure boxes open their records (2026-11-06) ----------
   Every figure box (.stat) on a page opens a panel with the records it counts. Each row links to its record
   (201 file, applicant, job, request page), the panel links to the page the figure comes from, and the list
   downloads as CSV. Rules: bx(view, label, fn). view is a page name, a list, a RegExp or "*" (any page);
   label is a RegExp tested on the box label. fn(c) returns { rows, cols, open, title, note } or a page name.
   Head Office / Projects copies (_ho, _prj) run the rule with the same people filter the page used. */
const BX = [];
const bx = (v, l, fn) => BX.push([v, l, fn]);
const bxView = (v, name, base) => v === "*" || (v instanceof RegExp ? v.test(name) : Array.isArray(v) ? v.includes(name) || v.includes(base) : v === name || v === base);
const bxName = () => (S.viewAs === "emp" && S.essView ? S.essView : S.view?.name);
const bxBase = (n) => String(n || "").replace(/_(ho|prj)$/, "");
const bxLabel = (el) => (el.querySelector(".label")?.textContent || el.querySelector(".value")?.nextElementSibling?.textContent || "").replace(/\s+/g, " ").trim();
const bxFind = (name, label) => { const base = bxBase(name); /* page-specific rules first, then the ones for any page */
  for (const [v, l, fn] of BX) if (v !== "*" && bxView(v, name, base) && l.test(label)) return fn;
  for (const [v, l, fn] of BX) if (v === "*" && l.test(label)) return fn; return null; };
const bxSpecific = (name, label) => { const base = bxBase(name); return BX.some(([v, l]) => v !== "*" && bxView(v, name, base) && l.test(label)); };
/* row helpers */
const bxPos = (e) => pos(e?.posId)?.title || e?.title || "";
const bxUnit = (e) => (typeof unitName === "function" ? unitName(e) : e?.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office");
const eR = (e, ...c) => (e ? { t: fullName(e), s: [e.no, bxPos(e), bxUnit(e)].filter(Boolean).join(" · "), c, emp: e.id } : null);
const idR = (id, ...c) => eR(S.emps.get(id), ...c);
const bxD = (d) => (d ? fmtDate(String(d).slice(0, 10)) : "");
const bxM = (n) => peso.format(Number(n) || 0);
const bxList = (m) => (m instanceof Map ? [...m.values()] : Array.isArray(m) ? m : []);
const bxEmps = (xs, cols = [], f = () => []) => ({ cols: ["Employee", ...cols], rows: xs.filter(Boolean).map((e) => eR(e, ...f(e))) });
const bxStat = (st, map) => (map?.[st]?.[0] || st || "");
const bxMine = (r) => S.emps.get(r?.empId || r?.emp || r?.empIds?.[0]);

/* ---------- the panel ---------- */
function bxOpen(el) {
  const name = bxName(); const label = bxLabel(el); const fn = bxFind(name, label); if (!fn) return false;
  let spec; const base = bxBase(name); const sc = name !== base && typeof SCOPED !== "undefined" && SCOPED.includes(base) ? name.slice(base.length + 1) : typeof DT_KINDS !== "undefined" && DT_KINDS[name]?.kind === "ctr" ? DT_KINDS[name].scope : null;
  const all = S.emps, prop = S.prop;
  try {
    if (sc) { S.allEmps = all; S.emps = new Map([...all].filter(([, e]) => inScope(e, sc))); S.scope = sc; }
    spec = fn({ name, base, label, value: el.querySelector(".value")?.textContent.trim() || "", el, sc });
  } catch (err) { console.warn("box", label, err); spec = null; } finally { if (sc) { S.emps = all; S.allEmps = null; S.scope = null; S.prop = prop; } }
  if (!spec) return false;
  if (typeof spec === "string") { go(spec); return true; }
  if (typeof spec === "function") { spec(); return true; }
  if (spec.go) { spec.set?.(); go(spec.go, spec.params || {}); return true; }
  bxPanel({ title: spec.title || label, value: el.querySelector(".value")?.textContent.trim() || "", note: spec.note || "", cols: spec.cols || ["Record"], rows: (spec.rows || []).filter(Boolean), open: spec.open === undefined ? (base === "dash" ? null : base) : spec.open, openSet: spec.openSet, openLabel: spec.openLabel });
  return true;
}
function bxPanel(P) {
  document.querySelector(".bx-back")?.remove();
  const back = document.createElement("div"); back.className = "bx-back";
  const openName = P.open ? (typeof labelOf === "function" ? labelOf(P.open) : P.open) : "";
  const cols = P.cols.length ? P.cols : ["Record"]; const prev = document.activeElement; let q = "";
  const cell = (v) => (v == null ? "" : typeof v === "object" && v.h != null ? v.h : esc(String(v)));
  const txt = (v) => (v == null ? "" : typeof v === "object" && v.h != null ? String(v.t ?? v.h.replace(/<[^>]+>/g, "")) : String(v));
  const rowsHtml = () => { const list = P.rows.filter((r) => !q || [r.t, r.s, ...(r.c || []).map(txt)].join(" ").toLowerCase().includes(q));
    return list.length ? list.slice(0, 500).map((r) => { const i = P.rows.indexOf(r); const link = r.emp || r.app || r.go || r.act;
      return `<tr${link ? ` class="go" tabindex="0" data-bx-row="${i}"` : ""}><td><b>${esc(r.t || "")}</b>${r.s ? `<div class="t-muted bx-sub">${esc(r.s)}</div>` : ""}</td>${(r.c || []).map((v) => `<td>${cell(v)}</td>`).join("")}${link ? `<td class="bx-arrow" aria-hidden="true">›</td>` : "<td></td>"}</tr>`; }).join("") + (list.length > 500 ? `<tr><td colspan="${cols.length + 1}" class="t-muted">Showing the first 500 of ${list.length}. Download the list for all of them.</td></tr>` : "")
      : `<tr><td colspan="${cols.length + 1}" class="empty">${P.rows.length ? "Nothing matches." : esc(P.empty || "No records behind this figure right now.")}</td></tr>`; };
  back.innerHTML = `<div class="bx-box" role="dialog" aria-modal="true" aria-labelledby="bx-h">
    <div class="bx-head"><div><p class="bx-k">${P.value ? `<b>${esc(P.value)}</b> · ` : ""}${P.rows.length} record${P.rows.length === 1 ? "" : "s"}${openName ? ` · from ${esc(openName)}` : ""}</p><h2 id="bx-h">${esc(P.title)}</h2>${P.note ? `<p class="t-muted bx-note">${esc(P.note)}</p>` : ""}</div><button class="btn btn-ghost btn-sm bx-x" data-bx-close aria-label="Close">✕</button></div>
    ${P.rows.length > 8 ? `<input class="input bx-q" type="search" placeholder="Search these records" aria-label="Search these records">` : ""}
    <div class="table-wrap bx-tw"><table class="bx-t"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th></th></tr></thead><tbody>${rowsHtml()}</tbody></table></div>
    <div class="bx-foot">${openName ? `<button class="btn btn-primary btn-sm" data-bx-page>Open ${esc(P.openLabel || openName)}</button>` : ""}${P.rows.length ? '<button class="btn btn-ghost btn-sm" data-bx-csv>Download list (CSV)</button>' : ""}<button class="btn btn-ghost btn-sm" data-bx-close>Close</button></div></div>`;
  const done = () => { document.removeEventListener("keydown", key, true); back.remove(); try { prev?.focus?.(); } catch {} };
  const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(); }
    else if (ev.key === "Enter" && ev.target.matches?.("[data-bx-row]")) { ev.preventDefault(); ev.target.click(); }
    else if (ev.key === "Tab") { const fs = [...back.querySelectorAll("button,input,[tabindex='0']")].filter((x) => x.offsetParent); const i = fs.indexOf(document.activeElement); if (i < 0 || (ev.shiftKey && i === 0) || (!ev.shiftKey && i === fs.length - 1)) { ev.preventDefault(); fs[ev.shiftKey ? fs.length - 1 : 0]?.focus(); } } };
  back.addEventListener("click", (ev) => {
    if (ev.target === back || ev.target.closest("[data-bx-close]")) return done();
    if (ev.target.closest("[data-bx-page]")) { done(); P.openSet?.(); go(P.open); return; }
    if (ev.target.closest("[data-bx-csv]")) { const slug = P.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "records";
      offer(`${slug}-${todayISO()}.csv`, toCSV([[cols[0], "Details", ...cols.slice(1)], ...P.rows.map((r) => [r.t || "", r.s || "", ...(r.c || []).map(txt)])])); return; }
    const tr = ev.target.closest("[data-bx-row]"); if (!tr || ev.target.closest("a,button:not([data-bx-row])")) return; const r = P.rows[Number(tr.dataset.bxRow)]; done();
    if (r.act) return r.act(); if (r.go) return go(r.go[0], r.go[1] || {}); if (r.app) return go("applicant", { id: r.app }); if (r.emp) return go("employee", { id: r.emp });
  });
  back.addEventListener("input", (ev) => { if (!ev.target.matches(".bx-q")) return; q = ev.target.value.trim().toLowerCase(); back.querySelector(".bx-t tbody").innerHTML = rowsHtml(); });
  document.addEventListener("keydown", key, true); document.body.appendChild(back); (back.querySelector(".bx-q") || back.querySelector(".bx-x")).focus();
}

/* ---------- wiring: which boxes are links, and the click ---------- */
const bxOwn = (el) => el.matches("button,a,[data-go],[data-ar-kind],[data-aud-kind],[data-au-jump],[data-dash-reg]") || el.querySelector("[data-go],a[href],button");
function bxMark() {
  const main = document.getElementById("main"); if (!main) return; const name = bxName();
  for (const el of main.querySelectorAll(".stat")) {
    if (el.dataset.bxDone === name) continue; el.dataset.bxDone = name; const label = bxLabel(el);
    /* a box that already opens a page keeps it, unless this page has its own record list for it (then the list wins) */
    if (bxOwn(el) && !(el.matches("[data-go]") && bxSpecific(name, label))) continue;
    if (!label || !bxFind(name, label)) { el.removeAttribute("data-bx"); continue; }
    el.setAttribute("data-bx", ""); if (!el.matches("button")) { el.setAttribute("role", "button"); el.tabIndex = 0; } el.setAttribute("aria-label", `${label}: ${el.querySelector(".value")?.textContent.trim() || ""}. Show the records`); el.title = "Show the records";
  }
}
{ const b = render; render = function (...a) { const r = b.apply(this, a); try { bxMark(); } catch {} return r; }; }
{ let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { try { bxMark(); } catch {} }, 60); }).observe(document.documentElement, { childList: true, subtree: true }); }
document.addEventListener("click", (ev) => {
  const el = ev.target.closest?.("#main .stat[data-bx]"); if (!el) return; const inner = ev.target.closest("a,button,input,select,textarea,label"); if (inner && inner !== el && el.contains(inner)) return;
  if (bxOpen(el)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
}, true);
document.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.("#main .stat[data-bx]")) { ev.preventDefault(); bxOpen(ev.target); } });
{ const st = document.createElement("style"); st.textContent = `
#main .stat[data-bx]{cursor:pointer;position:relative;transition:transform .12s ease,box-shadow .12s ease}
#main .stat[data-bx]:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(13,23,41,.18)}
#main .stat[data-bx]:focus-visible{outline:3px solid #C9A961;outline-offset:2px}
#main .stat[data-bx]::after{content:"View ›";position:absolute;right:12px;bottom:10px;font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.0;transition:opacity .12s}
#main .stat[data-bx]:hover::after,#main .stat[data-bx]:focus-visible::after{opacity:.85}
@media (hover:none){#main .stat[data-bx]::after{opacity:.7}}
.bx-back{position:fixed;inset:0;background:rgba(10,18,40,.45);display:flex;justify-content:flex-end;z-index:9998}
.bx-box{background:var(--card,#fff);color:var(--ink,#0D1729);width:min(760px,100%);height:100%;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.25);border-left:3px solid #C9A961}
.bx-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:20px 22px 12px;border-bottom:1px solid var(--line,#E5E7EB)}
.bx-head h2{margin:2px 0 0;font-size:22px}.bx-k{margin:0;font-size:13px;color:var(--muted,#5B6475)}.bx-note{margin:6px 0 0;font-size:13px}
.bx-q{display:block;box-sizing:border-box;margin:12px 22px 0;width:calc(100% - 44px)!important;max-width:calc(100% - 44px)}
.bx-tw{flex:1;overflow:auto;margin:12px 0 0;padding:0 22px}
.bx-t{width:100%}.bx-t td{vertical-align:top}.bx-sub{font-size:12px}.bx-t tr.go{cursor:pointer}.bx-t tr.go:hover td{background:var(--blue-soft,#EEF3FF)}
.bx-arrow{color:var(--muted,#5B6475);font-size:18px;width:20px;text-align:right}
.bx-foot{display:flex;gap:8px;flex-wrap:wrap;padding:14px 22px;border-top:1px solid var(--line,#E5E7EB)}
@media (max-width:600px){.bx-back{align-items:flex-end}.bx-box{height:88vh;border-left:0;border-top:3px solid #C9A961;border-radius:18px 18px 0 0}.bx-head{padding:16px 16px 10px}.bx-q{margin:10px 16px 0;width:calc(100% - 32px)!important;max-width:calc(100% - 32px)}.bx-tw{padding:0 16px}.bx-foot{padding:12px 16px}.bx-head h2{font-size:19px}}
@media print{.bx-back{display:none}}
`; document.head.appendChild(st); }

/* ---------- people: headcount, status, movement ---------- */
const bxAge = (e) => (e.birth ? Math.floor(daysBetween(e.birth, todayISO()) / 365.25) : null);
const bxYrs = (e) => (e.hire ? daysBetween(e.hire, todayISO()) / 365.25 : 0);
const bxStatusCell = (e) => STATUS[e.status]?.[0] || e.status || "";
const bxPeople = (xs, cols = ["Status", "Hired"], f = (e) => [bxStatusCell(e), bxD(e.hire)]) => ({ ...bxEmps(xs.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))), cols, f), open: "employees" });
const bxEmpFilter = (patch) => () => { S.empFilter = { q: "", dept: "", status: "", project: "", show: "active", ...patch, page: 1 }; };
bx("*", /^(active employees|total employees|active|employees)$/i, (c) => ({ ...bxPeople(active()), openSet: bxEmpFilter({}), open: c.base === "idprint" || c.base === "idmiss" || c.base === "idhist" ? c.base : "employees" }));
bx("*", /^head office( active employees)?$/i, () => ({ ...bxPeople(active().filter((e) => !e.projectId), ["Department", "Status"], (e) => [deptName(e), bxStatusCell(e)]), openSet: bxEmpFilter({ project: "none" }) }));
bx("*", /^projects( active employees)?$/i, () => ({ ...bxPeople(active().filter((e) => e.projectId), ["Project", "Status"], (e) => [S.projects.get(e.projectId)?.name || "", bxStatusCell(e)]), open: "projects" }));
bx("*", /^(regular|regular employees)$/i, () => ({ ...bxPeople(active().filter((e) => e.status === "REGULAR")), openSet: bxEmpFilter({ status: "REGULAR" }) }));
bx("*", /^(probationary|on probation)$/i, () => ({ ...bxPeople(active().filter((e) => e.status === "PROBATIONARY"), ["Hired", "Regularization due"], (e) => [bxD(e.hire), bxD(regDue(e))]), openSet: bxEmpFilter({ status: "PROBATIONARY" }) }));
bx("dash", /^on active projects$/i, () => ({ ...bxPeople(active().filter((e) => e.projectId && (S.projects.get(e.projectId)?.status || "ACTIVE") === "ACTIVE"), ["Project", "Role"], (e) => [S.projects.get(e.projectId)?.name || "", e.projectRole || bxPos(e)]), open: "projects" }));
bx("dash", /^open project slots$/i, () => { const rows = [];
  for (const p of listOf(S.projects).filter((p) => (p.status || "ACTIVE") === "ACTIVE")) for (const [pid, k] of Object.entries(p.req || {})) { const have = active().filter((e) => e.projectId === p.id && e.posId === pid).length; const gap = (Number(k) || 0) - have; if (gap > 0) rows.push({ t: pos(pid)?.title || "Position", s: p.name, c: [k, have, gap], go: ["project", { id: p.id }] }); }
  return { cols: ["Position", "Planned", "Assigned", "Open"], rows, open: "projects", note: "Per project and position, planned manpower less the people assigned." }; });
bx("*", /^(new hires this month|new this month)$/i, () => bxPeople(active().filter((e) => (e.hire || "") >= todayISO().slice(0, 8) + "01"), ["Hired", "Status"], (e) => [bxD(e.hire), bxStatusCell(e)]));
bx("*", /^new in 30 days$/i, () => bxPeople(active().filter((e) => e.hire >= addDays(todayISO(), -30)), ["Hired", "Status"], (e) => [bxD(e.hire), bxStatusCell(e)]));
bx("*", /^hired in 12 months$/i, () => bxPeople([...S.emps.values()].filter((e) => e.hire >= addDays(todayISO(), -365)), ["Hired", "Status"], (e) => [bxD(e.hire), e.separated ? "Separated" : bxStatusCell(e)]));
const bxSeps = (days) => ({ ...bxEmps([...S.emps.values()].filter((e) => e.separated?.date >= addDays(todayISO(), -days)).sort((a, b) => b.separated.date.localeCompare(a.separated.date)), ["Last day", "Reason"], (e) => [bxD(e.separated.date), e.separated.reason || e.separated.type || ""]), open: "offboarding", openSet: bxEmpFilter({ show: "separated" }) });
bx("*", /^separated in 12 months$/i, () => bxSeps(365));
bx("*", /^turnover rate$/i, () => ({ ...bxSeps(365), note: "People who left in the last 12 months. The rate divides them by the average headcount." }));
bx("*", /^average age$/i, () => ({ ...bxPeople(active().filter((e) => e.birth).sort((a, b) => bxAge(b) - bxAge(a)), ["Age", "Birth date"], (e) => [bxAge(e), bxD(e.birth)]), note: "Active employees with a birth date on file." }));
bx("*", /^average tenure$/i, () => ({ ...bxPeople(active().filter((e) => e.hire), ["Years", "Hired"], (e) => [bxYrs(e).toFixed(1), bxD(e.hire)]), note: "Years with the company for each active employee." }));
bx("*", /^under 1 year$/i, () => bxPeople(active().filter((e) => bxYrs(e) < 1), ["Hired", "Years"], (e) => [bxD(e.hire), bxYrs(e).toFixed(1)]));
bx("*", /^5 years or more$/i, () => bxPeople(active().filter((e) => bxYrs(e) >= 5), ["Hired", "Years"], (e) => [bxD(e.hire), bxYrs(e).toFixed(1)]));
bx("*", /^due for regularization$/i, (c) => bxPeople(active().filter((e) => e.status === "PROBATIONARY" && (c.base === "emprep" && S.erTab === "tenure" ? bxYrs(e) >= 0.4 : regDue(e) <= addDays(todayISO(), 30))), ["Hired", "Regularization due"], (e) => [bxD(e.hire), bxD(regDue(e))]));
bx("*", /^movements in 12 months$/i, () => { const rows = []; for (const e of S.emps.values()) for (const h of e.history || []) if (h.d >= addDays(todayISO(), -365) && h.kind !== "Hired") rows.push(eR(e, h.kind, h.text || "", bxD(h.d)));
  return { cols: ["Employee", "Movement", "Details", "Date"], rows: rows.sort((a, b) => String(b.c[2]).localeCompare(String(a.c[2]))), open: "paf" }; });
bx("*", /^contracts ending in 30 days$/i, (c) => { if (c.base === "contracts") return null; const t = todayISO();
  return { ...bxPeople(active().filter((e) => e.projectUntil && e.projectUntil >= t && e.projectUntil <= addDays(t, 30)), ["Site", "Ends"], (e) => [bxUnit(e), bxD(e.projectUntil)]), open: "contracts" }; });
bx("*", /^missing government numbers$/i, () => bxPeople(active().filter((e) => !e.sss || !e.philhealth || !e.pagibig || !e.tin), ["Missing"], (e) => [[!e.sss && "SSS", !e.philhealth && "PhilHealth", !e.pagibig && "Pag-IBIG", !e.tin && "TIN"].filter(Boolean).join(", ")]));
bx("*", /^201 files without photo$/i, () => bxPeople(active().filter((e) => !e.photo), ["Birth date"], (e) => [e.birth ? bxD(e.birth) : "Not on file"]));
bx("*", /^no emergency contact$/i, () => bxPeople(active().filter((e) => !e.emergencyPhone), ["Contact name"], (e) => [e.emergencyName || "—"]));
bx("*", /^monthly basic payroll$/i, () => ({ ...bxPeople(active().filter((e) => e.basicPay), ["Rate", "A month"], (e) => [`${bxM(e.basicPay)}${e.payType === "DAILY" ? " a day" : ""}`, bxM(monthlyOf(e.basicPay || 0, e.payType))]), note: "Daily rates are counted at 26 days a month." }));
bx("*", /^departments$/i, () => ({ cols: ["Department", "People", "Positions"], rows: (S.org?.departments || []).map((d) => ({ t: d.name, s: d.code || "", c: [active().filter((e) => e.deptId === d.id).length, (S.org?.positions || []).filter((p) => p.deptId === d.id).length], act: () => { S.empFilter = { q: "", dept: d.id, status: "", project: "", show: "active", page: 1 }; go("employees"); } })), open: "departments" }));
bx("*", /^job positions$/i, () => ({ cols: ["Position", "Department", "People"], rows: (S.org?.positions || []).map((p) => { const n = active().filter((e) => e.posId === p.id).length; return { t: p.title, s: n ? "" : "Vacant", c: [dept(p.deptId)?.name || "", n], act: () => { S.empFilter = { q: p.title, dept: "", status: "", project: "", show: "active", page: 1 }; go("employees"); } }; }).sort((a, b) => b.c[1] - a.c[1]), open: "org" }));
bx("*", /^(birthdays|birthdays this month)$/i, () => { const m = todayISO().slice(5, 7); return bxPeople(active().filter((e) => (e.birth || "").slice(5, 7) === m).sort((a, b) => a.birth.slice(8).localeCompare(b.birth.slice(8))), ["Birthday"], (e) => [bxD(e.birth).replace(/,? \d{4}$/, "")]); });

/* ---------- dashboard cards, Needs action, Ask HR, reminders ---------- */
const bxLeaveRow = (l) => idR(l.empId, leaveType(l.type)?.name || l.type, `${bxD(l.from)}${l.to && l.to !== l.from ? " to " + bxD(l.to) : ""}`, l.days ?? "", bxStat(l.status, typeof LR_ST !== "undefined" ? LR_ST : null));
const bxLeaves = (xs) => ({ cols: ["Employee", "Leave", "Dates", "Days", "Status"], rows: xs.sort((a, b) => (b.from || "").localeCompare(a.from || "")).map(bxLeaveRow), open: "leave" });
bx("dash", /^(requests to approve or reject|nothing waiting)$/i, () => ({ ...bxLeaves(allLeaves().filter((l) => l.status === "PENDING" && S.emps.get(l.empId))), title: "Leave waiting for approval" }));
bx(["dash", "tk"], /^[A-Z][a-z]{2} \d{1,2}[-–]\d{1,2}, \d{4}$/, () => { const id = curPeriod(); const run = payrun(id); const ls = Object.entries(run.lines || {}).map(([k, l]) => [S.emps.get(k), l]).filter(([e]) => e && (!S.scope || inScope(e, S.scope)));
  return { title: `Pay for ${PAY.period(id).label}`, cols: ["Employee", "Gross", "Deductions", "Net pay"], rows: ls.sort((a, b) => fullName(a[0]).localeCompare(fullName(b[0]))).map(([e, l]) => eR(e, money(l.gross), money(PAY.r2((l.gross || 0) - (l.net || 0))), money(l.net))), open: "payroll", note: run.final ? "Final payroll." : "Estimated from the current time sheet; payroll is still a draft." }; });
bx("dash", /^people to hire on/i, () => bxJobsOpen());
bx("dash", /^onboarding$/i, () => bxOnb());
bx("dash", /^offboarding$/i, () => bxOffb());
bx("dash", /^\d+% ?current|^current ·/i, () => bxTrainGaps(["MISSING", "EXPIRED", "EXPIRING"]));
bx("needs", /^overdue$/i, () => { const t = todayISO(); return bxOps([...opsPending().filter((x) => x.late > 0), ...opsDeadlines().filter((x) => x.due < t)], "late"); });
bx("needs", /^waiting for approval$/i, () => bxOps(opsPending(), "appr"));
bx("needs", /^deadlines in 14 days$/i, () => bxOps(opsDeadlines().filter((x) => x.due >= todayISO()), "dl"));
bx("needs", /^reminders overdue$/i, () => { const keys = new Set(remUrgent().filter((r) => r.due < todayISO()).map((r) => r.key)); return bxRem((r) => keys.has(r.key), "DUE"); });
function bxOps(list, tab) { return { cols: ["Employee or unit", "What", "Date", "Status"], rows: list.map((x) => ({ t: x.e ? fullName(x.e) : x.unit || "", s: x.e ? [x.e.no, x.unit].filter(Boolean).join(" · ") : "", c: [x.label + (x.what ? ` · ${x.what}` : ""), x.src === "appr" ? `Filed ${bxD(x.filed)}` : bxD(x.due), x.src === "dl" ? (x.due < todayISO() ? `${x.late} days late` : `Due ${bxD(x.due)}`) : x.late ? `${x.late} days past target` : "Within target"], go: x.view ? [x.view] : null, emp: x.e?.id })), open: "needs", openSet: () => { S.opsF.tab = tab; }, note: "Each row opens the page where it is handled." }; }
function bxRem(f, tab) { let all = []; try { all = remList(); } catch {} return { cols: ["Employee", "Reminder", "Due"], rows: all.filter(f).sort((a, b) => (a.due || "").localeCompare(b.due || "")).map((r) => eR(r.e, r.title, bxD(r.due))), open: "reminders", openSet: () => { S.remF.tab = tab; } }; }
bx("reminders", /^due now$/i, () => bxRem((r) => !r.done && r.kind !== "MISSING" && r.from <= todayISO(), "DUE"));
bx("reminders", /^probation evaluations$/i, () => bxRem((r) => !r.done && r.kind === "EVAL" && r.due <= addDays(todayISO(), 30), "DUE"));
bx("reminders", /^regularization notices$/i, () => bxRem((r) => !r.done && r.kind === "REGNOTICE" && r.due <= addDays(todayISO(), 30), "DUE"));
bx("reminders", /^ape and medical$/i, () => bxRem((r) => !r.done && ["APE", "MED"].includes(r.kind) && r.due <= addDays(todayISO(), 30), "DUE"));
const bxAk = (f, st) => () => ({ cols: ["Question", "From", "Status", "Updated"], rows: akAll().filter(f).sort((a, b) => (b.updated || b.created || "").localeCompare(a.updated || a.created || "")).map((t) => ({ t: t.subject || "Question", s: akDesk?.(t) || "", c: [akWho(t), t.status === "CLOSED" ? "Resolved" : t.status === "FOLLOWUP" ? "Followed up" : "Open", bxD(t.updated || t.created)], act: () => { S.akOpen = t.key; go("askhr"); } })), open: "askhr", openSet: () => { if (st !== undefined) S.akF.st = st; } });
bx("askhr", /^unread for you$/i, bxAk((t) => akUnread(t)));
bx("askhr", /^waiting for an answer$/i, bxAk((t) => ["OPEN", "FOLLOWUP"].includes(t.status), "OPEN"));
bx("askhr", /^tagged you$/i, bxAk((t) => (t.tags || []).includes(S.myId) && t.status !== "CLOSED"));
bx("askhr", /^resolved in 30 days$/i, bxAk((t) => t.status === "CLOSED" && (t.closed || "") >= addDays(todayISO(), -30), "CLOSED"));

/* ---------- recruitment ---------- */
const bxApp = (a, ...c) => { const j = S.jobs.get(a.jobId); return { t: appName(a), s: [j?.title, j?.projectId ? S.projects.get(j.projectId)?.name : "Head Office"].filter(Boolean).join(" · "), c, app: a.id }; };
const bxStage = (a) => OUT[a.stage]?.[0] || STAGES.find((x) => x[0] === a.stage)?.[1] || a.stage || "";
const bxApps = (xs, cols = ["Stage", "Applied"], f = (a) => [bxStage(a), bxD(a.applied)]) => ({ cols: ["Applicant", ...cols], rows: xs.sort((a, b) => (b.applied || "").localeCompare(a.applied || "")).map((a) => bxApp(a, ...f(a))), open: "hiring" });
const bxHireScope = (name) => (j) => { if (!j) return false; if (name === "hireho") return !j.projectId; if (/^hireprj/.test(name)) { if (!j.projectId) return false; if (name === "hireprj_om") return (j.level || "rf") === "om"; if (name === "hireprj_rf") return (j.level || "rf") !== "om"; } return true; };
function bxJobsOpen(name = "hiring") { const ok = bxHireScope(name); const jobs = listOf(S.jobs).filter((j) => j.status === "OPEN" && ok(j));
  return { title: "Open jobs and people still to hire", cols: ["Job", "Slots", "Hired", "Still to hire", "Applicants"], rows: jobs.map((j) => ({ t: j.title || pos(j.posId)?.title || "Job", s: j.projectId ? S.projects.get(j.projectId)?.name || "Project" : "Head Office", c: [j.slots || 0, jobHired(j), Math.max(0, (j.slots || 0) - jobHired(j)), listOf(S.apps).filter((a) => a.jobId === j.id && inProcess(a)).length], go: ["job", { id: j.id }] })), open: name }; }
const bxHire = ["hiring", "hireho", "hireprj", "hireprj_om", "hireprj_rf"];
bx(bxHire, /^people still to hire$/i, (c) => bxJobsOpen(c.name));
bx(bxHire, /^applicants in process$/i, (c) => { const ok = bxHireScope(c.name); return { ...bxApps(listOf(S.apps).filter((a) => inProcess(a) && ok(S.jobs.get(a.jobId)))), open: c.name }; });
bx(bxHire, /^interviews in 7 days$/i, (c) => { const ok = bxHireScope(c.name); return { cols: ["Applicant", "Interview", "Date", "Time"], rows: upcomingInterviews().filter((x) => x.iv.d <= addDays(todayISO(), 7) && ok(S.jobs.get(x.a.jobId))).map(({ a, iv }) => bxApp(a, iv.kind || "Interview", bxD(iv.d), iv.t || "")), open: "ivcal" }; });
bx(bxHire, /^hired in 30 days$/i, (c) => { const ok = bxHireScope(c.name); return { ...bxApps(listOf(S.apps).filter((a) => a.stage === "HIRED" && a.stageAt >= addDays(todayISO(), -30) && ok(S.jobs.get(a.jobId))), ["Hired on"], (a) => [bxD(a.stageAt)]), open: c.name }; });
bx("dash", /^job openings$/i, () => bxJobsOpen());
const bxMpr = (st) => () => { const all = listOf(S.mpr); const xs = st === "YEAR" ? all.filter((r) => (r.d || "").startsWith(todayISO().slice(0, 4))) : all.filter((r) => r.status === st);
  return { cols: ["Request", "People", "Requested", "Status"], rows: xs.sort((a, b) => (b.d || "").localeCompare(a.d || "")).map((r) => ({ t: `${r.no || "Request"} · ${pos(r.posId)?.title || r.title || "Position"}`, s: mprFor(r), c: [r.n || 0, bxD(r.d), bxStat(r.status, MPR_STATUS)], act: () => { S.mprTab = r.status || "ALL"; go("mpr"); } })), open: "mpr", openSet: () => { S.mprTab = st === "YEAR" ? "ALL" : st; } }; };
bx("mpr", /^waiting for approval$/i, bxMpr("PENDING")); bx("mpr", /^approved, no job yet$/i, bxMpr("APPROVED")); bx("mpr", /^jobs opened$/i, bxMpr("OPENED")); bx("mpr", /^requested in \d{4}$/i, bxMpr("YEAR"));
const bxOlr = (sts) => (c) => ({ cols: ["Applicant", "Requested", "Status"], rows: olrList().filter((a) => sts.includes(a.olr.status)).filter((a) => { if (!/_(ho|prj)$/.test(c.name)) return true; const j = S.jobs.get(a.jobId); return c.name.endsWith("_ho") ? !j?.projectId : !!j?.projectId; }).map((a) => bxApp(a, bxD(a.olr.d), bxStat(a.olr.status, OLR))), open: c.base, openSet: () => { S.olrTab = sts[0]; } });
const bxOl = ["olr", "joboffer", "joboffer_ho", "joboffer_prj"];
bx(bxOl, /^waiting for approval$/i, bxOlr(["PENDING"])); bx(bxOl, /^approved, not sent$/i, bxOlr(["APPROVED"])); bx(bxOl, /^sent, waiting for answer$/i, bxOlr(["SENT"])); bx(bxOl, /^accepted$/i, bxOlr(["ACCEPTED", "DECLINED"]));
const bxRaApps = () => { const today = todayISO(); const R = S.raRange || "90"; const from = R === "year" ? today.slice(0, 4) + "-01-01" : R === "all" ? "0000" : addDays(today, -Number(R)); return listOf(S.apps).filter((a) => (a.applied || "") >= from && (a.applied || "") <= today); };
bx("ranalysis", /^applicants$/i, () => ({ ...bxApps(bxRaApps()), open: "ranalysis" }));
bx("ranalysis", /^hired$/i, () => ({ ...bxApps(bxRaApps().filter((a) => a.stage === "HIRED"), ["Applied", "Hired", "Days"], (a) => [bxD(a.applied), bxD(a.stageAt), a.stageAt ? daysBetween(a.applied, a.stageAt) : ""]), open: "ranalysis" }));
bx("ranalysis", /^days to hire$/i, () => ({ ...bxApps(bxRaApps().filter((a) => a.stage === "HIRED" && a.stageAt), ["Applied", "Hired", "Days"], (a) => [bxD(a.applied), bxD(a.stageAt), daysBetween(a.applied, a.stageAt)]), open: "ranalysis", note: "Days from application to hiring, for each person hired." }));
bx("ranalysis", /^days to fill$/i, () => ({ cols: ["Job", "Opened", "Filled", "Days"], rows: listOf(S.jobs).filter((j) => j.status === "FILLED").map((j) => { const hs = listOf(S.apps).filter((a) => a.jobId === j.id && a.stage === "HIRED" && a.stageAt).map((a) => a.stageAt).sort(); const last = hs[hs.length - 1]; return { t: j.title || "Job", s: j.projectId ? S.projects.get(j.projectId)?.name || "" : "Head Office", c: [bxD(j.opened), bxD(last), last ? daysBetween(j.opened, last) : ""], go: ["job", { id: j.id }] }; }), open: "ranalysis" }));
bx("ranalysis", /^offers accepted$/i, () => ({ ...bxApps(bxRaApps().filter((a) => ["ACCEPTED", "DECLINED"].includes(a.offer?.status)), ["Offer", "Stage"], (a) => [a.offer.status === "ACCEPTED" ? "Accepted" : "Declined", bxStage(a)]), open: "ranalysis" }));
bx("ranalysis", /^refused$/i, () => ({ ...bxApps(bxRaApps().filter((a) => a.stage === "REJECTED"), ["Reason", "Applied"], (a) => [a.refused?.reason || (a.blacklist ? "Blacklisted" : "No reason given"), bxD(a.applied)]), open: "ranalysis" }));
bx("dash", /^total applicants$/i, () => bxApps(listOf(S.apps)));
bx("dash", /^applicants, last (\d+) days$/i, (c) => { const n = Number(c.label.match(/(\d+)/)[1]); return bxApps(listOf(S.apps).filter((a) => (a.applied || "") >= addDays(todayISO(), -n))); });
bx("dash", /^active applicants$/i, () => bxApps(listOf(S.apps).filter(inProcess)));
bx("dash", /^refused applicants$/i, () => bxApps(listOf(S.apps).filter((a) => a.stage === "REJECTED")));

/* ---------- onboarding, offboarding, resignations, final pay ---------- */
function bxOnb() { return { cols: ["Employee", "Started", "Steps done"], rows: listOf(S.onb).filter((o) => !o.done && S.emps.get(o.empId)).map((o) => { const it = (o.items || []).filter((i) => !i.na); const r = idR(o.empId, bxD(o.start), `${it.filter((i) => i.done).length} of ${it.length}`); r.go = ["onboard", { id: o.id }]; return r; }), open: "onboarding" }; }
function bxOffb(f = (o) => !o.closed) { return { cols: ["Employee", "Last day", "Reason", "Stage"], rows: listOf(S.offb).filter((o) => S.emps.get(o.empId) && f(o)).map((o) => { const r = idR(o.empId, bxD(o.last), o.reason || "", offStatus(o)[0]); r.go = ["offboard", { id: o.id }]; return r; }), open: "offboarding" }; }
const bxLife = ["onboarding", "offboarding", "lifecycle"];
bx(bxLife, /^onboarding in progress$/i, () => bxOnb());
bx(bxLife, /^leaving$/i, () => bxOffb());
bx(bxLife, /^final pay to release$/i, () => ({ ...bxOffb((o) => !o.closed && !o.released && S.emps.get(o.empId)?.separated), open: "finalpays" }));
const bxRs = (f, st) => () => ({ cols: ["Employee", "Letter dated", "Last day", "Notice"], rows: listOf(S.resigns).filter((r) => empOf(r) && f(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")).map((r) => idR(r.empId, bxD(r.filed), bxD(r.last), `${rsDays(r)} days`)), open: "resign", openSet: () => { S.rsF.st = st; } });
bx("resign", /^to act on$/i, bxRs((r) => r.status === "PENDING", "PENDING"));
bx("resign", /^resignations in \d{4}$/i, bxRs((r) => r.status !== "WITHDRAWN" && (r.filed || "").startsWith(todayISO().slice(0, 4)), ""));
bx("resign", /^short notice$/i, bxRs((r) => r.status === "PENDING" && rsDays(r) < 30, "PENDING"));
bx("resign", /^leaving in 30 days$/i, bxRs((r) => r.status === "ACCEPTED" && r.last >= todayISO() && r.last <= addDays(todayISO(), 30), "ACCEPTED"));
const bxFp = (f, st) => () => { const all = [...S.offb.values()].map((o) => ({ o, e: S.emps.get(o.empId) })).filter((x) => x.e).map((x) => { let f = { net: 0 }; try { f = finalPay(x.e, x.o); } catch {} return { ...x, f, due: addDays(x.o.last || todayISO(), 30) }; });
  return { cols: ["Employee", "Last day", "Due", "Final pay"], rows: all.filter(f).map((x) => { const r = eR(x.e, bxD(x.o.last), bxD(x.due), bxM(Math.max(0, x.f?.net || 0))); r.go = ["offboard", { id: x.o.id }]; return r; }), open: "finalpays", openSet: () => { S.fpF.st = st; } }; };
bx("finalpays", /^to release$/i, bxFp((x) => !x.o.released, "OPEN"));
bx("finalpays", /^overdue$/i, bxFp((x) => !x.o.released && x.e.separated && x.due < todayISO(), "OPEN"));
bx("finalpays", /^released this year$/i, bxFp((x) => (x.o.released || "").startsWith(todayISO().slice(0, 4)), "DONE"));

/* ---------- timekeeping ---------- */
const bxBoard = (f, cols = ["Shift", "Time in", "Status"]) => { let board = []; try { board = dayBoard(todayISO()); } catch {} const ok = (e) => S.emps.has(e.id);
  return { cols: ["Employee", ...cols], rows: board.filter((x) => ok(x.e) && f(x.r)).map((x) => eR(x.e, x.r.shift ? `${x.r.shift.start || ""}–${x.r.shift.end || ""}` : "", hm(x.r.in) || "—", (TK_STATUS[x.r.status] || [x.r.status])[0] + (x.r.status === "late" && x.r.late ? ` ${x.r.late}m` : ""))), open: "dtr", note: "Today's daily time records. Each row opens the 201 file." }; };
const bxTk = ["tk", "tk_ho", "tk_prj"];
bx(bxTk, /^expected at work today$/i, () => bxBoard((r) => !["rest", "hol", "leave"].includes(r.status)));
bx(bxTk, /^timed in$/i, () => bxBoard((r) => r.status === "in" || r.status === "late"));
bx(bxTk, /^late$/i, () => bxBoard((r) => r.status === "late"));
bx(bxTk, /^not in yet$/i, () => bxBoard((r) => r.status === "notin"));
bx(bxTk, /^on leave$/i, () => bxBoard((r) => r.status === "leave"));
bx("*", /^present today$/i, () => bxBoard((r) => r.status === "in" || r.status === "late"));
bx("*", /^on leave today$/i, () => ({ ...bxLeaves(onLeave(todayISO()).filter((l) => S.emps.get(l.empId))), title: "On leave today" }));
bx(["hrdash", "dash"], /^(leave requests waiting|waiting for approval)$/i, (c) => (c.base === "dash" && S.dxTab === "ot" ? bxOtReq((r) => r.status === "PENDING") : { ...bxLeaves(allLeaves().filter((l) => l.status === "PENDING" && S.emps.get(l.empId))), title: "Leave waiting for approval" }));
bx("*", /^leave days (taken )?in \d{4}$/i, () => { const y = todayISO().slice(0, 4); return { ...bxLeaves(allLeaves().filter((l) => l.status === "APPROVED" && (l.from || "").startsWith(y) && S.emps.get(l.empId))), title: `Approved leave in ${y}` }; });
bx("*", /^per employee$/i, (c) => (c.base === "dash" ? { ...bxLeaves(allLeaves().filter((l) => l.status === "APPROVED" && (l.from || "").startsWith(todayISO().slice(0, 4)) && S.emps.get(l.empId))), note: "Approved leave this year; the figure divides the days by active headcount." } : null));
bx("*", /^vacation leave$/i, () => bxLeaves(allLeaves().filter((l) => l.status === "APPROVED" && l.type === "VL" && (l.from || "").startsWith(todayISO().slice(0, 4)) && S.emps.get(l.empId))));
bx("*", /^sick leave$/i, () => bxLeaves(allLeaves().filter((l) => l.status === "APPROVED" && l.type === "SL" && (l.from || "").startsWith(todayISO().slice(0, 4)) && S.emps.get(l.empId))));
const bxAr = (f) => () => ({ cols: ["Employee", "Request", "Details", "Filed", "Status"], rows: listOf(S.attReqs).filter((r) => S.emps.get(r.empId) && f(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")).map((r) => idR(r.empId, (AR_KIND[r.kind] || [r.kind])[0], typeof arText === "function" ? arText(r) : r.reason || "", bxD(r.filed), bxStat(r.status, AR_ST))), open: "attreqs" });
bx(["attreqs", "chsched", "obreq", "utreq"], /^approved in 30 days$/i, bxAr((r) => r.status === "APPROVED" && r.decided?.d >= addDays(todayISO(), -30)));
const bxTki = (f) => () => { const rows = []; try { for (const [eid, list] of tkIssuesAll()) { const e = S.emps.get(eid); if (!e) continue; const sup = S.emps.get(e.supervisorId); const ph = phoneOf(eid); const supPh = sup && phoneOf(sup.id);
    for (const x of list) if (f({ e, x, sup, ph, supPh })) rows.push(eR(e, bxD(x.d), (FX_KIND[x.kind] || [x.kind])[0], sup ? fullName(sup) : "—")); } } catch {}
  return { cols: ["Employee", "Day", "Problem", "Supervisor"], rows, open: "tkissues" }; };
bx("tkissues", /^open issues$/i, bxTki(() => true));
bx("tkissues", /^with the employee$/i, bxTki((r) => !r.x.wait && r.ph));
bx("tkissues", /^with the supervisor$/i, bxTki((r) => r.x.wait && r.supPh));
bx("tkissues", /^hr to handle$/i, bxTki((r) => !r.ph || (r.x.wait && !r.supPh)));
const bxSusp = (f) => () => ({ cols: ["Suspension", "From", "To", "Pay"], rows: listOf(S.susps).filter(f).sort((a, b) => (b.from || "").localeCompare(a.from || "")).map((s) => ({ t: s.reason || "Work suspension", s: !s.unit ? "Everyone" : unitOpts().find(([k]) => k === s.unit)?.[1] || "Some employees", c: [bxD(s.from), bxD(s.to || s.from), s.pay === "UNPAID" ? "No work, no pay" : "Paid"], go: ["suspend"] })), open: "suspend" });
bx("suspend", /^today$/i, bxSusp((s) => s.from <= todayISO() && (s.to || s.from) >= todayISO()));
bx("suspend", /^suspensions in \d{4}$/i, bxSusp((s) => (s.from || "").startsWith(todayISO().slice(0, 4))));
bx("suspend", /^paid by the company$/i, bxSusp((s) => s.pay !== "UNPAID" && (s.from || "").startsWith(todayISO().slice(0, 4))));
const bxAtt = ["attendance", "attendance_ho", "attendance_prj"];
const bxPid = () => S.periodId || curPeriod();
bx(bxAtt, /^working days in period$/i, () => { const p = PAY.period(bxPid()); const Sx = SET(); const rows = []; PAY.eachDay(p.start, p.end, (dt, d) => { const h = Sx.holidays.find((x) => x.d === d); const rest = PAY.isRest ? PAY.isRest(dt, Sx) : false; if (!h && !rest) rows.push({ t: fmtDate(d), s: parseISO(d).toLocaleDateString("en-PH", { weekday: "long" }), c: ["Working day"] }); });
  return { cols: ["Day", "Counts as"], rows, open: "attendance", note: `Working days in ${p.label}. Holidays and rest days are left out.` }; });
bx(bxAtt, /^holidays$/i, () => { const p = PAY.period(bxPid()); return { cols: ["Holiday", "Date", "Type"], rows: SET().holidays.filter((h) => h.d >= p.start && h.d <= p.end).map((h) => ({ t: h.name, c: [bxD(h.d), h.type === "REG" ? "Regular" : "Special"], go: ["timeSettings"] })), open: "timeSettings" }; });
bx(bxAtt, /^on approved leave$/i, () => { const p = PAY.period(bxPid()); return bxLeaves(allLeaves().filter((l) => l.status === "APPROVED" && l.from <= p.end && l.to >= p.start && S.emps.get(l.empId))); });
bx(bxAtt, /^overtime logged$/i, () => { const id = bxPid(); const rows = Object.entries(periodDoc(id).rows || {}).filter(([k, r]) => r.ot && S.emps.get(k)).map(([k, r]) => idR(k, `${PAY.r2(r.ot)} h`)); return { cols: ["Employee", "Overtime"], rows, open: "attendance" }; });
const bxClk = ["clockin", "clockin_ho", "clockin_prj"];
const bxPunch = (f) => () => { const date = S.clockDate || todayISO(); let list = []; try { list = punchesIn(date, date).filter((x) => !x.bio); } catch {}
  return { cols: ["Employee", "Time", "Kind", "Location"], rows: list.map((p) => ({ p, f: fence(p) })).filter(f).map(({ p, f }) => { const e = S.emps.get(p.empId); const r = e ? eR(e) : { t: p.name || "Unlinked phone", s: p.empNo || "" }; r.c = [hm(p.t) || "", p.type === "OUT" ? "Time out" : "Time in", f.state === "out" ? "Outside the site area" : f.state === "nogps" ? "No location" : f.state === "in" ? "Inside the area" : "No area set"]; return r; }), open: "clockin" }; };
bx(bxClk, /^punches on /i, bxPunch(() => true));
bx(bxClk, /^outside the site area$/i, bxPunch(({ f }) => f.state === "out"));
bx(bxClk, /^no location$/i, bxPunch(({ f }) => f.state === "nogps"));
bx(bxClk, /^kiosks and phones$/i, () => ({ cols: ["Device", "Kind", "Linked to"], rows: [...S.clockDevs.values()].filter((d) => !d.bio).map((d) => { const e = S.emps.get(S.clockLinks?.[d.id]); return { t: d.name || d.label || (d.kiosk ? "Site kiosk" : "Phone"), s: d.email || "", c: [d.kiosk ? "Site kiosk" : "Phone", e ? fullName(e) : d.kiosk ? "—" : "Not linked"], emp: e?.id, act: e ? null : () => { S.clockTab = "links"; go("clockin"); } }; }), open: "clockin", openSet: () => { S.clockTab = "links"; } }));
const bxGeo = (f) => () => { const F = S.geoF; const to = F.to || todayISO(), from = F.from || addDays(to, -6); let all = []; S.geoAll = true; try { all = punchesIn(from, to).filter((p) => !p.bio); } catch {} finally { S.geoAll = false; }
  return { cols: ["Employee", "Date", "Time", "Review"], rows: all.map((p) => ({ p, f: fence(p) })).filter(f).reverse().map(({ p }) => { const e = S.emps.get(p.empId); const r = e ? eR(e) : { t: p.name || "Unlinked phone" }; r.c = [bxD(p.d || (p.t || "").slice(0, 10)), hm(p.t) || "", p.rev === "OK" ? "Approved" : p.rev === "REJ" ? "Rejected" : p.needsOk ? "Waiting" : "Not reviewed"]; r.act = () => go("geofence"); return r; }), open: "geofence" }; };
bx("geofence", /^inside the area$/i, bxGeo(({ f }) => f.state === "in"));
bx("geofence", /^outside the area$/i, bxGeo(({ f }) => f.state === "out"));
bx("geofence", /^no location$/i, bxGeo(({ f }) => f.state === "nogps"));
bx("geofence", /^waiting for review$/i, bxGeo(({ p, f }) => (f.state === "out" || f.state === "nogps" || p.needsOk) && !p.rev));
/* overtime */
const bxOtReq = (f, cols) => ({ cols: ["Employee", "Date", "Hours", "Status"], rows: listOf(S.otReqs).filter((r) => S.emps.get(r.empId) && f(r)).sort((a, b) => (b.d || "").localeCompare(a.d || "")).map((r) => idR(r.empId, bxD(r.d), r.hours, bxStat(r.status, OT_STATUS))), open: "ot" });
const bxOtR = () => { const today = todayISO(); const from = S.otFrom || addDays(today, -30), to = S.otTo || today; const reqs = listOf(S.otReqs).filter((r) => S.emps.get(r.empId) && r.d >= from && r.d <= to); let users = []; try { users = usesClock(addDays(from, -1), addDays(to, 1)); } catch {}
  const act = new Map(users.map((e) => [e.id, actualOT(e, from, to < today ? to : addDays(today, -1)).reduce((s, x) => s + x.h, 0)])); const ids = [...new Set([...reqs.map((r) => r.empId), ...[...act.keys()].filter((k) => act.get(k) > 0)])];
  return { from, to, reqs, rows: ids.map((id) => S.emps.get(id)).filter(Boolean).map((e) => { const a = reqs.filter((r) => r.empId === e.id && r.status === "APPROVED").reduce((s, r) => s + r.hours, 0); const p = reqs.filter((r) => r.empId === e.id && r.status === "PENDING").reduce((s, r) => s + r.hours, 0); const x = act.get(e.id) || 0; return { e, a, p, x, cost: a * hourly(e) * 1.25 }; }) }; };
const bxOtRows = (f, val) => () => { const R = bxOtR(); return { cols: ["Employee", "Actual", "Approved", "Waiting", "Cost (est.)"], rows: R.rows.filter(f).sort((a, b) => val(b) - val(a)).map((x) => eR(x.e, `${PAY.r2(x.x)} h`, `${PAY.r2(x.a)} h`, `${PAY.r2(x.p)} h`, bxM(x.cost))), open: "otrep", note: `Overtime from ${fmtDate(R.from)} to ${fmtDate(R.to)}.` }; };
bx("otrep", /^actual overtime$/i, bxOtRows((x) => x.x > 0, (x) => x.x));
bx("otrep", /^approved$/i, bxOtRows((x) => x.a > 0, (x) => x.a));
bx("otrep", /^waiting$/i, bxOtRows((x) => x.p > 0, (x) => x.p));
bx("otrep", /^not filed$/i, bxOtRows((x) => x.x - x.a - x.p > 0, (x) => x.x - x.a - x.p));
bx("otrep", /^cost \(est\.\)$/i, bxOtRows((x) => x.cost > 0, (x) => x.cost));
bx("otrep", /^people$/i, bxOtRows((x) => x.a || x.x, (x) => x.a + x.x));
bx("dash", /^approved overtime$/i, () => bxOtReq((r) => r.status === "APPROVED" && r.d >= addDays(todayISO(), -dxDays) && r.d <= todayISO()));
bx("dash", /^overtime cost$/i, () => ({ ...bxOtReq((r) => r.status === "APPROVED" && r.d >= addDays(todayISO(), -dxDays) && r.d <= todayISO()), note: "Approved overtime in the last 30 days; cost is estimated at 125% of the hourly rate." }));
bx("dash", /^people with overtime$|^average per person$/i, () => { const by = {}; for (const r of listOf(S.otReqs)) if (r.status === "APPROVED" && r.d >= addDays(todayISO(), -dxDays) && r.d <= todayISO() && S.emps.get(r.empId)) by[r.empId] = (by[r.empId] || 0) + (r.hours || 0);
  return { cols: ["Employee", "Approved hours"], rows: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, h]) => idR(id, `${PAY.r2(h)} h`)), open: "otrep" }; });
bx("dash", /^worked past shift$/i, () => ({ cols: ["Employee", "Hours past shift"], rows: dxAttendanceData().per.filter((s) => s.ot > 0).sort((a, b) => b.ot - a.ot).map((s) => eR(s.e, `${PAY.r2(s.ot)} h`)), open: "otrep" }));
/* attendance analysis (dashboard and attendance reports) */
const bxAttA = (f, val, cols, cells) => () => { const A = dxAttendanceData(); return { cols: ["Employee", ...cols], rows: A.per.filter(f).sort((a, b) => val(b) - val(a)).map((s) => eR(s.e, ...cells(s))), open: "attrep", note: `Last ${dxDays} days, people who use the time clock.` }; };
bx("*", /^attendance rate$/i, bxAttA((s) => s.exp, (s) => -(s.present / s.exp), ["Present", "Scheduled", "Rate"], (s) => [s.present, s.exp, `${Math.round((s.present / s.exp) * 100)}%`]));
bx("*", /^late arrivals$/i, bxAttA((s) => s.late, (s) => s.lateMin, ["Times late", "Late time"], (s) => [s.late, minsText(s.lateMin) || ""]));
bx("*", /^absences$/i, bxAttA((s) => s.absent, (s) => s.absent, ["Absences"], (s) => [s.absent]));
bx("*", /^perfect attendance$/i, bxAttA((s) => s.exp && !s.late && !s.absent, (s) => s.exp, ["Days scheduled"], (s) => [s.exp]));
bx("*", /^undertime$/i, (c) => (c.base === "dash" || c.base === "attrep" ? bxAttA((s) => s.ut, (s) => s.ut, ["Undertime"], (s) => [minsText(s.ut) || ""])() : null));

/* ---------- payroll and pay records ---------- */
const bxRunRows = (id, cols, cells) => { const run = payrun(id); const ls = Object.entries(run.lines || {}).map(([k, l]) => [S.emps.get(k), l]).filter(([e]) => e);
  return { cols: ["Employee", ...cols], rows: ls.sort((a, b) => fullName(a[0]).localeCompare(fullName(b[0]))).map(([e, l]) => eR(e, ...cells(l))), note: `${PAY.period(id).label}${run.final ? ", final payroll" : ", draft payroll"}.` }; };
const bxPay = ["payroll", "payroll_ho", "payroll_prj"];
const bxDed = (l) => PAY.r2((l.sss || 0) + (l.ph || 0) + (l.hd || 0) + (l.tax || 0) + (l.ded || 0) + (l.loanTot || 0));
bx(bxPay, /^gross pay$/i, () => ({ ...bxRunRows(bxPid(), ["Basic", "Overtime and premiums", "Gross"], (l) => [money(l.basic), money(PAY.r2((l.ot || 0) + (l.rd || 0) + (l.rhw || 0) + (l.sh || 0) + (l.nd || 0))), money(l.gross)]), open: "payroll" }));
bx(bxPay, /^deductions$/i, () => ({ ...bxRunRows(bxPid(), ["Contributions", "Tax", "Loans and other", "Total"], (l) => [money(PAY.r2((l.sss || 0) + (l.ph || 0) + (l.hd || 0))), money(l.tax), money(PAY.r2((l.ded || 0) + (l.loanTot || 0))), money(bxDed(l))]), open: "payroll" }));
bx(bxPay, /^net pay$/i, () => ({ ...bxRunRows(bxPid(), ["Bank", "Account", "Net pay"], (l) => ["", "", money(l.net)]), open: "payroll" }));
bx(bxPay, /^employer share$/i, () => ({ ...bxRunRows(bxPid(), ["SSS + EC", "PhilHealth", "Pag-IBIG", "Total"], (l) => [money(PAY.r2((l.sssEr || 0) + (l.ec || 0))), money(l.phEr), money(l.hdEr), money(PAY.r2((l.sssEr || 0) + (l.ec || 0) + (l.phEr || 0) + (l.hdEr || 0)))]), open: "payroll" }));
{ const fixNet = (spec) => { for (const r of spec.rows) { const e = S.emps.get(r.emp); r.c[0] = e?.bank || ""; r.c[1] = e?.bankAcct ? `••••${String(e.bankAcct).slice(-4)}` : ""; } return spec; };
  const i = BX.findIndex(([v, l]) => v === bxPay && l.test("net pay")); const fn = BX[i][2]; BX[i][2] = (c) => fixNet(fn(c)); }
const bxSlips = (cells, cols) => () => { const id = bxPid(); const { run, list } = psList(id); return { cols: ["Employee", ...cols], rows: list.map((e) => { const r = eR(e, ...cells(run.lines[e.id])); r.act = () => go("employee", { id: e.id }); return r; }), open: "payslips", note: `${PAY.period(id).label}.` }; };
bx("payslips", /^payslips$/i, bxSlips((l) => [money(l.gross), money(l.net)], ["Gross", "Net pay"]));
bx("payslips", /^gross pay$/i, bxSlips((l) => [money(l.gross)], ["Gross"]));
bx("payslips", /^deductions$/i, bxSlips((l) => [money(PAY.r2(l.gross - l.net))], ["Deductions"]));
bx("payslips", /^net pay$/i, bxSlips((l) => [money(l.net)], ["Net pay"]));
bx("confpay", /^(gross pay|deductions|net pay|employer share)$/i, () => "confpay");
const bxContrib = (cols, cells) => () => { const month = S.month || PAY.shiftPeriod(curPeriod(), -2).slice(0, 7); const ids = [month + "-1", month + "-2"]; const rows = contribRows(ids.map(payrun));
  return { cols: ["Employee", ...cols], rows: rows.map((r) => eR(r.e, ...cells(r))), open: "contrib", note: new Date(month + "-01T00:00:00").toLocaleString("en-PH", { month: "long", year: "numeric" }) }; };
bx("contrib", /^sss$/i, bxContrib(["SSS no.", "Employee", "Employer + EC"], (r) => [r.e.sss || "—", money(r.sss), money(PAY.r2(r.sssEr + r.ec))]));
bx("contrib", /^philhealth$/i, bxContrib(["PhilHealth no.", "Employee", "Employer"], (r) => [r.e.philhealth || "—", money(r.ph), money(r.phEr)]));
bx("contrib", /^pag-ibig$/i, bxContrib(["Pag-IBIG no.", "Employee", "Employer"], (r) => [r.e.pagibig || "—", money(r.hd), money(r.hdEr)]));
bx("contrib", /^tax withheld/i, bxContrib(["TIN", "Taxable pay", "Tax"], (r) => [r.e.tin || "—", money(r.taxable), money(r.tax)]));
const bxTax = (f, cells, cols) => () => { const y = taxYear(); let rows = []; try { rows = annualRows(y); } catch {} return { cols: ["Employee", ...cols], rows: rows.filter(f).map((r) => eR(r.e, ...cells(r))), open: "tax", note: `Tax year ${y}.` }; };
bx("tax", /^tax due for/i, bxTax(() => true, (r) => [money(r.a.due)], ["Tax due"]));
bx("tax", /^tax withheld$/i, bxTax(() => true, (r) => [money(r.a.withheld)], ["Withheld"]));
bx("tax", /^refunds due$/i, bxTax((r) => !r.e.separated && r.a.adj < -0.5, (r) => [money(-r.a.adj)], ["Refund"]));
bx("tax", /^still to collect$/i, bxTax((r) => !r.e.separated && r.a.adj > 0.5, (r) => [money(r.a.adj)], ["To collect"]));
const bxT13 = (f, cells, cols) => () => { const y = S.t13F?.y || todayISO().slice(0, 4); const all = t13Emps(y).map((e) => t13Of(e, y));
  return { cols: ["Employee", ...cols], rows: all.filter(f).map((x) => { const r = eR(x.e, ...cells(x)); r.act = () => { S.payTab = "thirteenth"; S.t13F.open = x.e.id; go("t13"); }; return r; }), open: "t13", note: `13th month pay for ${y}.` }; };
bx("t13", /^13th month pay/i, bxT13((x) => x.t13 > 0, (x) => [money(x.t13), money(x.paid)], ["13th month", "Released"]));
bx("t13", /^released$/i, bxT13((x) => x.paid > 0, (x) => [money(x.paid)], ["Released"]));
bx("t13", /^still to release$/i, bxT13((x) => x.bal > 0, (x) => [money(x.bal)], ["Still to release"]));
bx("t13", /^above the/i, bxT13((x) => x.taxable > 0, (x) => [money(x.taxable)], ["Taxable part"]));
const bxFlexRows = (f) => () => { const y = todayISO().slice(0, 4); return { cols: ["Employee", "Item", "Amount", "Status"], rows: listOf(S.flex).filter((c) => c.year === y && S.emps.get(c.empId) && f(c)).map((c) => idR(c.empId, flexItem(c.item)?.name || c.item || "", money(c.amt), c.status === "PAID" ? "Paid" : c.status === "APPROVED" ? "Approved" : c.status === "PENDING" ? "Waiting" : c.status)), open: "flex" }; };
const bxFlex = ["flex", "flex_ho", "flex_prj"];
bx(bxFlex, /^credits granted$/i, () => ({ ...bxPeople(active().filter((e) => flexCredits(e) > 0), ["Rank", "Credits"], (e) => [rankName?.(rankOf(e)) || "", money(flexCredits(e))]), open: "flex" }));
bx(bxFlex, /^waiting for approval$/i, bxFlexRows((c) => c.status === "PENDING"));
bx(bxFlex, /^approved, to be paid$/i, bxFlexRows((c) => c.status === "APPROVED"));
bx(bxFlex, /^paid this year$/i, bxFlexRows((c) => c.status === "PAID"));
const bxLoans = (f, extra = []) => () => ({ cols: ["Employee", "Loan", "Amortization", "Balance", "Status", ...extra.map((x) => x[0])], rows: listOf(S.loans).filter((ln) => S.emps.get(ln.empId) && f(ln)).sort((a, b) => empName(a.empId).localeCompare(empName(b.empId))).map((ln) => { const r = idR(ln.empId, loanLabel(ln.id), money(ln.amort), money(loanBal(ln)), ln.status === "HOLD" ? "On hold" : ln.status === "ACTIVE" ? "Active" : ln.status, ...extra.map((x) => x[1](ln))); r.act = () => go("loans"); r.emp = ln.empId; return r; }), open: "loans" });
const bxLn = ["loans", "loans_ho", "loans_prj"];
bx(bxLn, /^active loans$/i, bxLoans((ln) => ln.status === "ACTIVE"));
bx(bxLn, /^outstanding balance$/i, bxLoans((ln) => ln.status === "ACTIVE" && loanBal(ln) > 0));
bx(bxLn, /^on hold$/i, bxLoans((ln) => ln.status === "HOLD"));
bx(bxLn, /^this cutoff$/i, () => { const id = curPeriod(); return { ...bxRunRows(id, ["Loans this cutoff"], (l) => [money(l.loanTot)]), open: "loans" }; });
{ const i = BX.findIndex(([v, l]) => v === bxLn && l.test("this cutoff")); const fn = BX[i][2]; BX[i][2] = (c) => { const s = fn(c); s.rows = s.rows.filter((r) => r.c[0] !== money(0)); return s; }; }
const bxLp = (f) => () => ({ cols: ["Employee", "Loan", "Monthly", "Status"], rows: lpAll().filter(f).map((p) => { const e = lpEmp(p); const r = e ? eR(e) : { t: p.name || "Employee", s: p.empNo || "" }; r.c = [p.kind || p.type || p.lender || "Loan", money(p.monthly), p.status === "APPROVED" ? "Approved" : p.status === "PENDING" ? "Waiting for HR" : p.status || ""]; r.act = () => { S.lpOpen = p.key; go("loanposts"); }; return r; }), open: "loanposts" });
bx("loanposts", /^waiting for hr$/i, bxLp((p) => p.status === "PENDING"));
bx("loanposts", /^approved$/i, bxLp((p) => p.status === "APPROVED"));
bx("loanposts", /^monthly total$/i, bxLp((p) => p.status === "APPROVED"));
bx("loanposts", /^read automatically$/i, bxLp((p) => p.read?.by && p.read.by !== "none"));
const bxRb = (f, st) => () => ({ cols: ["Employee", "Expense", "Amount", "Filed", "Status"], rows: listOf(S.reimbs).filter((r) => empOf(r) && f(r)).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")).map((r) => idR(r.empId, `${rbCat(r.cat)}${r.desc ? " · " + r.desc : ""}`, money(r.amt), bxD(r.filed), bxStat(r.status, RB_ST))), open: "reimb", openSet: () => { S.rbF.st = st; } });
bx("reimb", /^waiting for approval$/i, bxRb((r) => r.status === "PENDING", "PENDING"));
bx("reimb", /^approved, to be paid$/i, bxRb((r) => r.status === "APPROVED", "APPROVED"));
bx("reimb", /^paid in \d{4}$/i, bxRb((r) => r.status === "PAID" && (r.paid || "").startsWith(todayISO().slice(0, 4)), "PAID"));
bx("reimb", /^without a receipt$/i, bxRb((r) => r.status === "PENDING" && !r.receipt, "PENDING"));
/* salary increments and wage increases */
const bxSi = (f, st) => () => ({ cols: ["Employee", "Kind", "From", "To", "Effective", "Status"], rows: listOf(S.salincs).filter((r) => S.emps.get(r.empId) && f(r)).sort((a, b) => (b.effective || "").localeCompare(a.effective || "")).map((r) => idR(r.empId, SI_KIND.find((k) => k[0] === r.kind)?.[1] || r.kind || "", money(r.from), money(r.to), bxD(r.effective), bxStat(r.status, RQ_ST))), open: "salinc", openSet: () => { if (st !== undefined) S.siF.st = st; } });
const bxSiY = (r) => r.status === "APPROVED" && (r.effective || "").startsWith(todayISO().slice(0, 4));
bx(["salinc", "wageinc", "emphome"], /^waiting for approval$/i, bxSi((r) => r.status === "PENDING", "PENDING"));
bx("salinc", /^approved in \d{4}$/i, bxSi(bxSiY, "APPROVED"));
bx("salinc", /^(average increase|added monthly cost)$/i, bxSi(bxSiY, "APPROVED"));
const bxWi = () => { let all = []; try { all = wiAll(); } catch {} const y = todayISO().slice(0, 4); return all.filter((x) => (x.d || "").startsWith(y)); };
bx("wageinc", /^(increases in \d{4}|average increase|added monthly cost)$/i, () => ({ cols: ["Employee", "Effective", "Kind", "From", "To", "Increase"], rows: bxWi().map((x) => eR(x.e, bxD(x.d), x.kind || "", money(x.from), money(x.to), `${wiPct(x).toFixed(1)}%`)), open: "wageinc" }));
bx("emprep", /^increments approved$/i, bxSi((r) => r.status === "APPROVED"));
bx("emprep", /^average increase$/i, bxSi((r) => r.status === "APPROVED"));
bx("emprep", /^employees never raised$/i, () => { const ok = listOf(S.salincs).filter((r) => r.status === "APPROVED"); return bxPeople(active().filter((e) => bxYrs(e) >= 1 && !ok.some((r) => r.empId === e.id) && !(e.history || []).some((h) => /salary/i.test(h.kind))), ["Hired", "Years"], (e) => [bxD(e.hire), bxYrs(e).toFixed(1)]); });
/* leave year-end */
const bxLy = (f, cells, cols) => () => { const y = S.lvyeY; let rows = []; try { rows = lvYearEnd(y); } catch {} return { cols: ["Employee", ...cols], rows: rows.filter(f).map((r) => eR(r.e, ...cells(r))), open: "lvye", note: `Leave year ${y}.` }; };
bx("lvye", /^unused vl$/i, bxLy((r) => r.vl > 0, (r) => [r.vl], ["Unused VL"]));
bx("lvye", /^unused sl$/i, bxLy((r) => r.sl > 0, (r) => [r.sl], ["Unused SL"]));
bx("lvye", /^carried over$/i, bxLy((r) => r.cVL + r.cSL > 0, (r) => [r.cVL, r.cSL], ["VL carried", "SL carried"]));
bx("lvye", /^converted to cash$/i, bxLy((r) => r.conv > 0, (r) => [r.conv, money(r.amt)], ["Days", "Amount"]));

/* ---------- training and performance ---------- */
const TR_ST = { OK: "Current", EXPIRING: "Expiring in 60 days", EXPIRED: "Expired", MISSING: "Missing" };
function bxTrainGaps(sts) { const { rows } = compliance(active()); const out = [];
  for (const r of rows) for (const i of r.items) if (sts.includes(i.st)) out.push(eR(r.e, i.c.name || i.c.title || "Course", TR_ST[i.st] || i.st, bxD(i.c.recs?.[r.e.id]?.exp)));
  return { cols: ["Employee", "Training", "Status", "Expires"], rows: out, open: "training", note: "Required trainings per person." }; }
bx(["trhome", "training", "trprog"], /^compliance$/i, () => bxTrainGaps(["OK", "EXPIRING", "EXPIRED", "MISSING"]));
bx("*", /^missing or expired$/i, () => bxTrainGaps(["MISSING", "EXPIRED"]));
bx(["trhome", "training", "trprog"], /^missing$/i, () => bxTrainGaps(["MISSING"]));
bx(["trhome", "training", "trprog"], /^expired$/i, () => bxTrainGaps(["EXPIRED"]));
bx(["trhome", "training", "trprog"], /^expiring in 60 days$/i, () => bxTrainGaps(["EXPIRING"]));
bx("*", /^sessions this month$/i, () => { const m = todayISO().slice(0, 7); return { cols: ["Session", "Date", "Status"], rows: listOf(S.sessions).filter((s) => s.status !== "CANCELLED" && (s.d || "").startsWith(m)).map((s) => ({ t: S.courses.get(s.courseId)?.name || s.title || "Session", s: s.venue || "", c: [bxD(s.d), s.status === "PLANNED" ? "Planned" : s.status === "DONE" ? "Done" : s.status || ""], go: ["trsessions"] })), open: "trsessions" }; });
bx("*", /^training hours \d{4}$/i, () => { const y = todayISO().slice(0, 4); return { cols: ["Employee", "Training", "Date", "Hours"], rows: allRecs().filter((r) => (r.d || "").startsWith(y)).sort((a, b) => (b.d || "").localeCompare(a.d || "")).map((r) => eR(r.e, r.c.name || "Course", bxD(r.d), r.c.hours || "")), open: "trrecords" }; });
const bxPerfP = ["perf", "perf_ho", "perf_prj", "evaluation"];
bx(bxPerfP, /^probation ends in 30 days$/i, () => bxPeople(active().filter((e) => e.status === "PROBATIONARY" && regDue(e) >= todayISO() && regDue(e) <= addDays(todayISO(), 30)), ["Hired", "Probation ends"], (e) => [bxD(e.hire), bxD(regDue(e))]));
bx(bxPerfP, /^past 6 months$/i, () => bxPeople(active().filter((e) => e.status === "PROBATIONARY" && regDue(e) < todayISO()), ["Hired", "Probation ended"], (e) => [bxD(e.hire), bxD(regDue(e))]));
const bxRevs = (f) => () => { const all = listOf(S.reviews); const yr = todayISO().slice(0, 4); const cycles = [...new Set([`${yr} Annual`, ...all.map((r) => r.cycle).filter(Boolean)])].sort().reverse(); const cyc = S.cycle && cycles.includes(S.cycle) ? S.cycle : cycles.find((c) => all.some((r) => r.cycle === c)) || cycles[0];
  return { cols: ["Employee", "Review", "Rating", "Status"], rows: all.filter((r) => r.cycle === cyc && S.emps.get(r.empId) && f(r)).map((r) => { const x = idR(r.empId, r.type === "REGULARIZATION" ? "Regularization" : r.cycle || "Review", r.status === "DONE" ? `${PAY.r2(r.overall || 0).toFixed(2)} · ${ratingOf(r.overall || 0)[1]}` : "—", r.status === "DONE" ? "Completed" : "Draft"); x.act = () => { S.perfTab = "reviews"; go("review", { id: r.id }); }; return x; }), open: "evaluation", note: `Review cycle ${cyc}.` }; };
bx(bxPerfP, /^completed$/i, bxRevs((r) => r.status === "DONE"));
bx(bxPerfP, /^(average rating|spread)$/i, bxRevs((r) => r.status === "DONE"));

/* ---------- compliance, safety, medical ---------- */
const bxAlerts = (sev) => () => { const list = alerts().filter((a) => a.sev === sev); return { cols: ["Alert", "Area"], rows: list.map((a) => { const m = /data-([a-z-]+)="([^"]*)"/.exec(a.act || ""); const r = { t: a.text, c: [a.area] };
  if (m) { const [, k, v] = m; if (k === "go") r.go = [v]; else if (k === "emp") r.emp = v; else if (k === "project") r.go = ["project", { id: v }]; else if (k === "edit-emp") r.go = ["employeeForm", { id: v }]; else r.act = () => { go("comply"); setTimeout(() => document.querySelector(`#main [data-${k}="${CSS.escape(v)}"]`)?.click(), 60); }; }
  return r; }), open: "comply" }; };
bx("comply", /^act now$/i, bxAlerts("crit")); bx("comply", /^due soon$/i, bxAlerts("warn")); bx("comply", /^heads-up$/i, bxAlerts("info"));
bx("comply", /^complete 201 files$/i, () => bxF201((e) => f201Pct(e) === 100));
bx("comply", /^missing: /i, (c) => { const lab = c.label.replace(/^missing:\s*/i, ""); const k = F201.find(([, l]) => l === lab)?.[0]; return bxF201((e) => !f201Status(e).find((x) => x.k === k)?.done); });
function bxF201(f) { return { cols: ["Employee", "Complete", "Missing"], rows: active().filter(f).map((e) => { const st = f201Status(e); return eR(e, `${st.filter((x) => x.done).length} of ${st.length}`, st.filter((x) => !x.done).map((x) => x.label).join(", ") || "Nothing"); }), open: "empdocs" }; }
bx("empdocs", /^complete 201 files$/i, () => bxF201((e) => f201Pct(e) === 100));
bx("empdocs", /^incomplete$/i, () => bxF201((e) => f201Pct(e) < 100));
const bxExpDocs = (f) => () => { const t = todayISO(); const rows = active().flatMap((e) => (e.docs || []).filter((d) => d.exp && d.exp <= addDays(t, 60) && f(d, t)).map((d) => eR(e, d.kind, bxD(d.exp)))); return { cols: ["Employee", "Document", "Expires"], rows, open: "empdocs" }; };
bx("empdocs", /^expiring in 60 days$/i, bxExpDocs((d, t) => d.exp >= t));
bx("empdocs", /^expired$/i, bxExpDocs((d, t) => d.exp < t));
const bxOsh = (f) => () => { const y = todayISO().slice(0, 4); return { cols: ["Incident", "Date", "Kind", "Days lost"], rows: listOf(S.osh).filter((x) => (x.d || "").startsWith(y) && f(x)).sort((a, b) => b.d.localeCompare(a.d)).map((x) => { const e = S.emps.get(x.empId); return { t: x.title || x.what || (e ? fullName(e) : "Incident"), s: e ? fullName(e) : x.site || "", c: [bxD(x.d), (x.kind || "").replace(/_/g, " ").toLowerCase(), x.daysLost || 0], emp: e?.id, go: e ? null : ["safety"] }; }), open: "safety" }; };
bx("safety", /^incidents in \d{4}$/i, bxOsh(() => true));
bx("safety", /^(days without lost-time injury|frequency and severity)$/i, bxOsh((x) => ["LOST_TIME", "FATAL"].includes(x.kind)));
bx("safety", /^not yet reported to dole$/i, bxOsh((x) => mustReport(x) && !x.reported));
const bxMed = (f, cols, cells) => () => ({ cols: ["Employee", ...cols], rows: active().map((e) => ({ e, d: apeDue(e), last: lastApe(e) })).filter(f).sort((a, b) => a.d.localeCompare(b.d)).map((x) => eR(x.e, ...cells(x))), open: "medical" });
bx("medical", /^annual physical due$/i, bxMed((x) => x.d >= todayISO() && x.d <= addDays(todayISO(), 30), ["Due", "Last exam"], (x) => [bxD(x.d), x.last ? bxD(x.last.date) : "None"]));
bx("medical", /^overdue$/i, bxMed((x) => x.last && x.d < todayISO(), ["Was due", "Last exam"], (x) => [bxD(x.d), bxD(x.last.date)]));
bx("medical", /^no exam on file$/i, bxMed((x) => !x.last, ["Hired"], (x) => [bxD(x.e.hire)]));
bx("medical", /^not fit or restricted$/i, () => { const recs = mdRecs().sort((a, b) => (b.date || "").localeCompare(a.date || "")); return { cols: ["Employee", "Result", "Date", "Clinic"], rows: recs.filter((r) => ["UNFIT", "RESTRICT"].includes(r.result) && recs.find((x) => x.empId === r.empId) === r).map((r) => idR(r.empId, r.result === "UNFIT" ? "Not fit" : "Restricted", bxD(r.date), r.clinic || "")), open: "medical" }; });

/* ---------- employee records pages ---------- */
bx("emphome", /^requests waiting$/i, () => { const rows = []; const add = (m, kind, f) => { for (const r of listOf(m)) if (r.status === "PENDING" && S.emps.get(r.empId)) rows.push({ ...idR(r.empId, kind, f(r), bxD(r.filed)), go: null }); };
  add(S.salincs, "Salary increment", (r) => `${money(r.from)} to ${money(r.to)}`); add(S.chgReqs, "Change request", (r) => r.field || r.what || ""); add(S.certReqs, "Certificate request", (r) => certName(r.type));
  for (const r of rows) { const k = r.c[0]; r.act = () => go(k === "Salary increment" ? "salinc" : k === "Change request" ? "chgreq" : "certreq"); } return { cols: ["Employee", "Request", "Details", "Filed"], rows, open: "emphome", note: "Each row opens the page where it is approved." }; });
const bxOr = (f) => () => ({ cols: ["Orientation", "Date", "People", "Status"], rows: listOf(S.orients).filter(f).sort((a, b) => (b.date || b.filed || "").localeCompare(a.date || a.filed || "")).map((o) => ({ t: o.title || "Orientation", s: o.reqBy || "", c: [bxD(o.date), (o.empIds || []).length, bxStat(o.status, OR_ST)], go: ["orient"] })), open: "orient" });
bx("orient", /^new hires not yet oriented$/i, () => bxPeople(newHiresNoOrient(), ["Hired"], (e) => [bxD(e.hire)]));
bx("orient", /^requested$/i, bxOr((o) => o.status === "REQUESTED"));
bx("orient", /^scheduled$/i, bxOr((o) => o.status === "SCHEDULED"));
bx("orient", /^oriented this year$/i, () => { const y = todayISO().slice(0, 4); const rows = []; for (const o of listOf(S.orients)) if (o.status === "DONE" && (o.date || "").startsWith(y)) for (const [id, v] of Object.entries(o.att || {})) if (v) rows.push(idR(id, o.title || "Orientation", bxD(o.date))); return { cols: ["Employee", "Orientation", "Date"], rows, open: "orient" }; });
const bxCtr = (f, tab) => () => ({ cols: ["Employee", "Contract", "Start", "End", "Signed copy"], rows: active().map(ctrOf).filter(f).sort((a, b) => (a.end || "9").localeCompare(b.end || "9")).map((c) => eR(c.e, STATUS[c.type]?.[0] || c.type || "", bxD(c.start), c.end ? bxD(c.end) : "No end date", c.signed ? bxD(c.signed) : "Not on file")), open: "contracts", openSet: () => { S.ctrTab = tab; } });
const bxCt = ["contracts", "contracts_ho", "contracts_prj"];
bx(bxCt, /^contracts ending in 30 days$/i, bxCtr((c) => c.end && c.left >= 0 && c.left <= 30 && c.type !== "PROBATIONARY", "expiring"));
bx(bxCt, /^probation ending in 30 days$/i, bxCtr((c) => c.type === "PROBATIONARY" && c.left != null && c.left <= 30, "prob"));
bx(bxCt, /^fixed-term and project-based$/i, bxCtr((c) => ["PROJECT_BASED", "CONTRACTUAL", "CASUAL"].includes(c.type), "fixed"));
bx(bxCt, /^signed copies on file$/i, bxCtr((c) => c.signed, "all"));
const bxId = (f, tab) => () => ({ ...bxPeople(active().filter(f), ["Missing", "Last printed"], (e) => [idMissing(e).join(", ") || "Nothing", idLast(e)?.at ? bxD(idLast(e).at) : idLast(e) ? "Yes" : "Never"]), open: "idprint", openSet: () => { S.idF.tab = tab; } });
const bxIdP = ["idprint", "idmiss", "idhist"];
bx(bxIdP, /^employees$/i, bxId(() => true, "ALL"));
bx(bxIdP, /^ready to print$/i, bxId((e) => !idMissing(e).length, "READY"));
bx(bxIdP, /^missing details$/i, bxId((e) => idMissing(e).length, "MISS"));
bx(bxIdP, /^ids printed$/i, bxId((e) => idLast(e), "DONE"));
const bxPaf = (f, st) => () => ({ cols: ["Employee", "Action", "Effective", "Status"], rows: listOf(S.pafs).filter((r) => empOf(r) && f(r)).sort((a, b) => (b.effective || "").localeCompare(a.effective || "")).map((r) => idR(r.empId, pfType(r.type), bxD(r.effective), r.status === "APPROVED" ? (r.applied ? "Applied" : "Approved, not yet in effect") : bxStat(r.status, RQ_ST))), open: "paf", openSet: () => { S.pfF.st = st; } });
const bxPafY = (r) => r.status === "APPROVED" && (r.effective || "").startsWith(todayISO().slice(0, 4));
bx("paf", /^waiting for approval$/i, bxPaf((r) => r.status === "PENDING", "PENDING"));
bx("paf", /^promotions in \d{4}$/i, bxPaf((r) => bxPafY(r) && r.type === "PROMOTION", "APPROVED"));
bx("paf", /^transfers and reassignments in \d{4}$/i, bxPaf((r) => bxPafY(r) && ["TRANSFER", "REASSIGN"].includes(r.type), "APPROVED"));
bx("paf", /^taking effect soon$/i, bxPaf((r) => r.status === "APPROVED" && !r.applied, "APPROVED"));
const bxAc = (f, cols, cells) => () => { const all = [...S.emps.values()].map(acOf).filter((x) => x.prop.length || x.loans.length).filter(f); return { cols: ["Employee", ...cols], rows: all.map((x) => { const r = eR(x.e, ...cells(x)); r.act = () => { S.acF.open = x.e.id; go("accountability"); }; return r; }), open: "accountability" }; };
bx("accountability", /^employees with accountabilities$/i, bxAc(() => true, ["Property", "Loans left"], (x) => [`${x.prop.length} · ${money(x.pv)}`, money(x.lb)]));
bx("accountability", /^property issued$/i, bxAc((x) => x.prop.length, ["Items", "Value"], (x) => [x.prop.map((p) => p.name).join(", "), money(x.pv)]));
bx("accountability", /^company loans and cash advances$/i, bxAc((x) => x.loans.length, ["Loans", "Balance"], (x) => [x.loans.map((l) => loanLabel(l.ln.id)).join(", "), money(x.lb)]));
bx("accountability", /^leaving with accountabilities$/i, bxAc((x) => S.offb.has(x.e.id) && !S.offb.get(x.e.id).closed, ["Property", "Loans left"], (x) => [money(x.pv), money(x.lb)]));
const bxProp = (f) => () => ({ cols: ["Item", "Tag", "Held by", "Status", "Value"], rows: listOf(S.prop).filter((x) => x.status !== "RETIRED" && f(x)).sort((a, b) => (a.tag || "").localeCompare(b.tag || "")).map((x) => { const h = S.emps.get(x.holderId); return { t: x.name || "Item", s: x.serial || "", c: [x.tag || "", h ? fullName(h) : "—", (x.status || "").replace(/_/g, " ").toLowerCase(), money(x.value)], go: ["asset", { id: x.id }] }; }), open: "property" });
const bxPr = ["property", "property_ho", "property_prj"];
bx(bxPr, /^assigned to people$/i, bxProp((x) => x.status === "ASSIGNED"));
bx(bxPr, /^book value$/i, bxProp(() => true));
bx(bxPr, /^held by people leaving$/i, bxProp((x) => x.status === "ASSIGNED" && (S.emps.get(x.holderId)?.separated || S.offb.has(x.holderId))));
bx(bxPr, /^in repair or lost$/i, bxProp((x) => ["REPAIR", "LOST"].includes(x.status)));
const bxCert = (f, st) => () => ({ cols: ["Employee", "Certificate", "Needed by", "Status"], rows: listOf(S.certReqs).filter((r) => S.emps.get(r.empId) && f(r)).sort((a, b) => (a.need || "9").localeCompare(b.need || "9")).map((r) => idR(r.empId, certName(r.type), bxD(r.need), bxStat(r.status, RQ_ST))), open: "certreq", openSet: () => { S.cqF.st = st; } });
bx("certreq", /^to prepare$/i, bxCert((r) => r.status === "PENDING", "PENDING"));
bx("certreq", /^ready for release$/i, bxCert((r) => r.status === "READY", "PENDING"));
bx("certreq", /^overdue$/i, bxCert((r) => ["PENDING", "READY"].includes(r.status) && r.need && r.need < todayISO(), "PENDING"));
bx("certreq", /^released this month$/i, bxCert((r) => r.status === "RELEASED" && (r.released || "").startsWith(todayISO().slice(0, 7)), "RELEASED"));

/* ---------- manpower plan, processes, audit trail ---------- */
bx("mplan", /^(people now|planned headcount|people to add|added pay a month)$/i, (c) => { let rows = []; try { rows = planRows(S.mpYear || Number(todayISO().slice(0, 4))); } catch { return "mplan"; }
  const want = /people now/i.test(c.label) ? (r) => r.now : /planned/i.test(c.label) ? (r) => r.planned : (r) => r.gap > 0;
  return { cols: ["Position", "Now", "Planned", "Gap", "Added pay a month"], rows: rows.filter(want).map((r) => ({ t: pos(r.posId)?.title || "Position", s: r.unit, c: [r.now, r.planned, r.gap > 0 ? `+${r.gap}` : r.gap, r.gap > 0 && r.rate ? money(r.gap * r.rate) : "—"], go: r.projectId ? ["project", { id: r.projectId }] : ["mplan"] })), open: "mplan" }; });
bx("hrd_flow", /^(functions|workflow steps|automations)$/i, (c) => ({ cols: ["Function", "Module", c.label === "Automations" ? "Automations" : "Steps"], rows: Object.keys(HRD_FLOW).map(Number).map((n) => ({ t: hrdTitle(n) || `Function ${n}`, s: `No. ${n}`, c: [GL(hrdCatOf(n)), c.label === "Automations" ? HRD_FLOW[n].a.length : HRD_FLOW[n].s.length], go: [`hrd_${n}`] })), open: "hrd_flow" }));
bx("audsum", /^(actions recorded|people active|records touched)$/i, () => "audtrail");

/* ---------- HRD function pages and their registers ---------- */
const bxHrdN = (name) => Number(String(name).match(/^hrd_(\d+)$/)?.[1] || 0);
const bxRegOf = (name) => (HRD_REG[name] ? name : null);
const bxRegRows = (regs, f) => regs.flatMap((reg) => hrdRows(reg).filter(f).map((r) => ({ t: r.title || "Entry", s: [HRD_REG[reg]?.label, hrdScope(r), r.owner].filter(Boolean).join(" · "), c: [bxD(r.d), r.due ? bxD(r.due) + (hrdOverdue(r) ? " (overdue)" : "") : "", HRD_ST[r.status]?.[0] || r.status || "", r.empId ? empNm(r.empId) : ""],
  act: () => { S.hrdForm = S.canEdit ? { reg, id: r.id } : null; go(reg); } })));
const bxRegCols = ["Entry", "Date", "Due", "Status", "Employee"];
const bxReg = (f) => (c) => { const reg = bxRegOf(c.name); if (!reg) return null; return { cols: bxRegCols, rows: bxRegRows([reg], f), open: null, note: "Each row opens the entry." }; };
const bxRegV = /^(hrdr_|hrd_\d+$)/;
bx(bxRegV, /^entries$/i, bxReg(() => true));
bx(bxRegV, /^open$/i, bxReg((r) => r.status !== "DONE"));
bx(bxRegV, /^overdue$/i, bxReg((r) => hrdOverdue(r)));
bx(bxRegV, /^done$/i, bxReg((r) => r.status === "DONE"));
bx(/^hrd_\d+$/, /^responsibilities in place$/i, (c) => { const n = bxHrdN(c.name); const a = hrdAreaOf(n); if (!a) return null; const st = S.hrd?.resp?.[n] || {};
  return { cols: ["Responsibility", "Status"], rows: a.resp.map((x, i) => ({ t: x, c: [(HRD_RS[st[i] || ""] || HRD_RS[""])[0]], act: () => setTimeout(() => { const el = document.querySelector(`[data-hrd-rs="${n}|${i}"]`) || document.querySelectorAll(".hrd-resp li")[i]; el?.scrollIntoView({ block: "center" }); el?.focus?.(); }, 30) })), open: null, note: "In place or not applicable counts as done. Pick a row to set its status." }; });
bx(/^hrd_\d+$/, /^deliverables$/i, (c) => { const n = bxHrdN(c.name); if (!HRD_AREAS[n]) return null; const subs = HRD_AREAS[n][4] || [];
  const delivs = subs.filter((s) => !info0(s) && !HRD_EXTRA[s]).map((s) => { const [lab, to] = s.split("="); const v = to || `hrdr_${n}_${hrdSlug(lab)}`; return { lab, v, cnt: HRD_REG[v] ? hrdRows(v).length : null }; });
  return { cols: ["Deliverable", "Kept in", "Entries"], rows: delivs.map((d) => ({ t: d.lab, c: [HRD_REG[d.v] ? "Register" : labelOf(d.v), d.cnt ?? "—"], go: [d.v] })), open: null }; });
bx(/^hrd_\d+$/, /^open entries$/i, (c) => { const n = bxHrdN(c.name); const regs = Object.keys(HRD_REG).filter((v) => HRD_REG[v].n === n); return { cols: bxRegCols, rows: bxRegRows(regs, (r) => r.status !== "DONE"), open: null }; });

/* ---------- employee's own pages (Employee view and employee accounts): the days behind each figure ---------- */
const bxDay = (r, ...c) => ({ t: fmtDate(r.d), s: parseISO(r.d).toLocaleDateString("en-PH", { weekday: "long" }), c });
const bxMyTime = (f, cols, cells) => () => { const e = essEmp(); if (!e) return null; const pid = S.periodId || curPeriod(); const rows = dtrRows(e, pid).filter(f);
  return { cols: ["Date", ...cols], rows: rows.map((r) => bxDay(r, ...cells(r))), open: null, note: `Pay period ${PAY.period(pid).label}.` }; };
bx("esstime", /^hours worked$/i, bxMyTime((r) => r.hrs > 0, ["Time in", "Time out", "Hours"], (r) => [hm(r.in), hm(r.out), PAY.r2(r.hrs)]));
bx("esstime", /^late$/i, bxMyTime((r) => r.late > 0, ["Time in", "Late"], (r) => [hm(r.in), minsText(r.late)]));
bx("esstime", /^overtime$/i, bxMyTime((r) => r.ot > 0, ["Time out", "Overtime"], (r) => [hm(r.out), minsText(r.ot)]));
const bxMyAtt = (sts) => () => { const e = essEmp(); if (!e) return null; const m = S.essM || todayISO().slice(0, 7); const days = monthDays(m); const pd = punchDays(days[0], days[days.length - 1]); const ctx = tkCtx();
  const recs = days.map((d) => ({ d, r: dayRec(e, d, pd.get(e.id)?.get(d), ctx) })).filter((x) => sts.includes(x.r.status));
  return { cols: ["Date", "Time in", "Time out", "Status"], rows: recs.map((x) => bxDay(x, hm(x.r.in) || "—", hm(x.r.out) || "—", (TK_STATUS[x.r.status] || [x.r.status])[0] + (x.r.status === "late" && x.r.late ? ` ${x.r.late}m` : ""))), open: null, note: monthLabel(m) }; };
bx("essatt", /^present$/i, bxMyAtt(["in", "late"])); bx("essatt", /^late$/i, bxMyAtt(["late"])); bx("essatt", /^absent$/i, bxMyAtt(["absent"])); bx("essatt", /^on leave$/i, bxMyAtt(["leave"]));
const bxMyOt = (kind) => () => { const e = essEmp(); if (!e) return null; const to = todayISO(), from = addDays(to, -45); const reqs = listOf(S.otReqs).filter((r) => r.empId === e.id).sort((a, b) => b.d.localeCompare(a.d));
  if (kind === "actual" || kind === "unfiled") { const act = actualOT(e, from, to).filter((x) => kind === "actual" || !reqs.find((r) => r.d === x.d)); return { cols: ["Date", "Time out", "Overtime"], rows: act.reverse().map((x) => bxDay(x, hm(x.r.out), `${x.h} h`)), open: null }; }
  const xs = reqs.filter((r) => (kind === "approved" ? r.status === "APPROVED" && r.d >= from : r.status === "PENDING"));
  return { cols: ["Date", "Hours", "Reason", "Status"], rows: xs.map((r) => bxDay(r, r.hours, r.reason || "", bxStat(r.status, OT_STATUS))), open: null }; };
bx("essot", /^my actual overtime$/i, bxMyOt("actual")); bx("essot", /^approved$/i, bxMyOt("approved")); bx("essot", /^waiting for approval$/i, bxMyOt("waiting")); bx("essot", /^not yet filed$/i, bxMyOt("unfiled"));
/* attendance change analysis (Attendance reports) */
const bxArU = (f) => () => { const U = S.repUnit || ""; return bxAr((r) => inUnit(S.emps.get(r.empId), U) && f(r))(); };
bx("attrep", /^requests$/i, bxArU(() => true));
bx("attrep", /^approved$/i, bxArU((r) => r.status === "APPROVED"));
bx("attrep", /^rejected$/i, bxArU((r) => r.status === "REJECTED"));
bx("attrep", /^waiting$/i, bxArU((r) => r.status === "PENDING"));
bx("attrep", /^days to decide$/i, () => { const s = bxArU((r) => r.decided?.d)(); s.cols = [...s.cols, "Days to decide"]; const xs = listOf(S.attReqs).filter((r) => S.emps.get(r.empId) && r.decided?.d && inUnit(S.emps.get(r.empId), S.repUnit || "")).sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); s.rows.forEach((row, i) => row.c.push(xs[i] ? daysBetween(xs[i].filed, xs[i].decided.d) : "")); return s; });
bx("attrep", /^people who asked$/i, () => { const by = {}; for (const r of listOf(S.attReqs)) if (S.emps.get(r.empId) && inUnit(S.emps.get(r.empId), S.repUnit || "")) by[r.empId] = (by[r.empId] || 0) + 1; return { cols: ["Employee", "Requests"], rows: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, n]) => idR(id, n)), open: "attreqs" }; });
