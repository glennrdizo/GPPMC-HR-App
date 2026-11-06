/* ---------- Users & Sign-Ins and Users Activity Logs (Glenn 2026-11-06, "like the one in the GD Prime One Portal") ----------
   Two Overview pages for HR Managers, laid out like One Portal's EM Department pages:
   · Users & Sign-Ins: registered accounts by type (HR staff, employee accounts, requests waiting), who signed in today and
     this month, sign-ins per day and per month, and the list of users with their last sign-in.
   · Users Activity Logs: for the dates chosen, who signed in, every sign-in (time, device, network address), and each
     person's records added, changed and deleted and their downloads from the Audit Trail; a person opens their own log.
   Every box opens the list behind its figure and names the page where those records live, with a link to it.
   Website: sign-ins come from hr_user_signins() (migration 20261106b_hr_ai_agents.sql). Without it (or in the Claude app)
   the pages fall back to Users & permissions (HR staff, last time each opened the app) and the account requests. */
Object.assign(S, { usYm: "", usQ: "", usT: "", uaWho: "", uaShow: 100 });
Object.assign(ICON, { usersign: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a5 5 0 0 1 3 6"/>', useract: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', golink: '<path d="M7 17 17 7M9 7h8v8"/>' });
const US = { cache: new Map(), busy: new Set(), err: "" };
const US_VIEWS = new Set(["usrsign", "usract"]);
const usAdmin = () => !!S.realEdit && !S.selfMode && ((typeof isPermAdmin === "function" && isPermAdmin()) || !!S.isOwner);
const usActOk = () => usAdmin() || (typeof auOk === "function" && auOk());
const usYmNow = () => todayISO().slice(0, 7);
const usYmLab = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }); };
const usYmEnd = (ym) => { const [y, m] = ym.split("-").map(Number); const e = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return e > todayISO() ? todayISO() : e; };
const usDT = (iso) => (iso ? `${fmtDate(manilaDay(iso))} ${timeFmt.format(new Date(iso))}` : "");
const usDev = (ua) => (typeof aiDevice === "function" ? aiDevice(ua) : String(ua || "").slice(0, 40));
const usN = (n) => (n ? String(n) : '<span class="t-muted">0</span>');
const usRole = (uid) => { const u = S.access?.users?.[uid]; if (uid && uid === S.access?.ownerId) return "Owner"; const k = u?.role || S.access?.defaultRole || ""; return (typeof ROLES !== "undefined" && ROLES[k]?.name) || (k ? k : ""); };

/* sign-in record for a date range (website) */
function usLoad(from, to, force) {
  const k = `${from}|${to}`; if (!window.__sb || !usAdmin()) return null;
  if (!force && US.cache.has(k)) return US.cache.get(k); if (US.busy.has(k)) return null;
  US.busy.add(k);
  window.__sb.rpc("hr_user_signins", { p_from: from, p_to: to }).then(({ data, error }) => {
    US.busy.delete(k); US.cache.set(k, error ? { err: /not_granted/.test(error.message || "") ? "only" : "off" } : data || {}); if (US_VIEWS.has(S.view?.name)) render();
  }).catch(() => { US.busy.delete(k); US.cache.set(k, { err: "off" }); if (US_VIEWS.has(S.view?.name)) render(); });
  return null;
}
const usLive = (r) => !!(r && !r.err && Array.isArray(r.users));
let usRegion = null; try { usRegion = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}
// "Makati City, Philippines" from the city, region and country Vercel reports for the network (not the exact position)
const usPlace = (x) => { if (!x) return ""; const c = String(x.country || "").toUpperCase(); let cn = c; try { cn = (c && usRegion?.of(c)) || c; } catch {} const rg = /^[A-Za-z][A-Za-z .'-]+$/.test(x.region || "") && x.region !== x.city && x.region.length > 3 ? x.region : ""; return [x.city, rg, cn].filter(Boolean).join(", "); };
// pages opened and buttons pressed for a date range (website), and one person's visits
const UU = { cache: new Map(), busy: new Set() };
function usUse(from, to, uid) {
  const k = `${from}|${to}|${uid || ""}`; if (!window.__sb || !usAdmin()) return null; if (UU.cache.has(k)) return UU.cache.get(k); if (UU.busy.has(k)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 864e5; if (!(days >= 0) || days > 120) { UU.cache.set(k, { err: "range" }); return UU.cache.get(k); }
  UU.busy.add(k);
  window.__sb.rpc("hr_user_usage", { p_from: from, p_to: to, p_uid: uid || null }).then(({ data, error }) => { UU.busy.delete(k); UU.cache.set(k, error ? { err: "off" } : data || {}); if (US_VIEWS.has(S.view?.name)) render(); })
    .catch(() => { UU.busy.delete(k); UU.cache.set(k, { err: "off" }); if (US_VIEWS.has(S.view?.name)) render(); });
  return null;
}
const usUseLive = (u) => !!(u && !u.err && Array.isArray(u.byUser));
const usDur = (sec) => { sec = Math.round(sec || 0); if (!sec) return "—"; if (sec < 60) return `${sec}s`; const m = Math.round(sec / 60); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return `${h} h ${m % 60} min`; };

/* every account: from the server when it can, else HR staff from Users & permissions and the account requests */
function usUsers(r) {
  const A = S.access || {}; const out = new Map();
  if (usLive(r)) for (const u of r.users) out.set(u.uid, { uid: u.uid, name: A.users?.[u.uid]?.name || u.name || u.email || "Someone", email: u.email || "", staff: !!u.staff, owner: !!u.owner, status: u.status, empNo: u.empNo || "", position: u.position || "", lastSignIn: u.lastSignIn || "", lastSeen: u.lastSeen || "", requested: u.requested || "", created: u.created || "", place: usPlace(u.lastPlace), device: u.lastPlace?.ua ? usDev(u.lastPlace.ua) : "" });
  else {
    const ids = new Set([...Object.keys(A.users || {}), ...Object.keys(A.seen || {})]);
    for (const id of ids) { if (String(id).startsWith("inv:")) continue; out.set(id, { uid: id, name: A.users?.[id]?.name || S.profiles?.[id]?.name || A.names?.[id] || (id === S.myId ? S.meName || "You" : "Someone"), email: A.users?.[id]?.email || S.profiles?.[id]?.email || "", staff: true, owner: id === A.ownerId, status: "approved", lastSeen: A.seenAt?.[id] || "", lastSignIn: "" }); }
    for (const s of S.signups || []) if (!out.has(s.user_id)) out.set(s.user_id, { uid: s.user_id, name: s.name || s.email || "Someone", email: s.email || "", staff: false, status: s.status, empNo: s.emp_no || "", position: s.position || "", requested: s.requested_at || "", lastSeen: "", lastSignIn: "" });
  }
  for (const u of out.values()) { u.type = u.staff ? "HR staff" : "Employee"; u.role = u.staff ? (u.owner ? "Owner" : usRole(u.uid)) : u.empNo ? `Employee no. ${u.empNo}` : ""; u.last = [u.lastSignIn, u.lastSeen].filter(Boolean).sort().pop() || ""; }
  return [...out.values()];
}
// days each person opened the app: { uid: Set(days) }, from the server record, else today's from Users & permissions
function usDays(r, users) {
  const m = new Map(); const add = (uid, d) => { if (!m.has(uid)) m.set(uid, new Set()); m.get(uid).add(d); };
  if (usLive(r)) for (const x of r.days || []) add(x.uid, String(x.day).slice(0, 10));
  else for (const u of users) { const t = u.last && manilaDay(u.last); if (t) add(u.uid, t); }
  return m;
}

/* ---------- the boxes: a figure, what it counts, the list behind it, and the page where those records are ---------- */
const US_LISTS = new Map();
function usBox(key, label, value, sub, list, where) {
  if (list) US_LISTS.set(key, list);
  const w = where ? `<button type="button" class="link us-where" ${where.go ? `data-go="${esc(where.go)}"` : ""}${where.act ? ` data-ua-audit="${esc(where.act)}"` : ""}${where.scroll ? ` data-us-scroll="${esc(where.scroll)}"` : ""}>${icon("golink", 12)}${esc(where.label)}</button>` : "";
  return `<div class="card stat us-box${list ? " us-open" : ""}"${list ? ` data-us-box="${esc(key)}" role="button" tabindex="0" aria-label="${esc(`${label}: ${value}. Show the list`)}"` : ""}>
    <span class="label">${esc(label)}</span><span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ""}${w}</div>`;
}
const US_PAGE = { perms: "Users & permissions", usract: "Users Activity Logs", usrsign: "Users & Sign-Ins", audtrail: "Audit log" };
const usLink = (v) => (typeof viewAllowed !== "function" || viewAllowed(v) ? v : "");
function usListDlg(key) {
  const L = US_LISTS.get(key); if (!L) return; S.usDlg = key;
  openModal(`<h2 id="io-title">${esc(L.title)}</h2>
    <p class="t-muted" style="margin:0 0 10px;font-size:13px">${L.rows.length} ${L.rows.length === 1 ? "person" : "people"}${L.where ? ` · from ${esc(L.where)}` : ""}</p>
    ${L.rows.length > 8 ? `<input class="input" id="us-dq" type="search" placeholder="Search names" aria-label="Search names" style="margin-bottom:10px">` : ""}
    <div class="table-wrap us-dlg-t">${usTable(L.cols, L.rows, { max: 500, rowAttr: L.rowAttr })}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">${L.go && usLink(L.go) ? `<button type="button" class="btn btn-ghost" data-us-goto="${esc(L.go)}">${icon("golink", 16)}Open ${esc(US_PAGE[L.go] || "the page")}</button>` : ""}<button type="button" class="btn btn-ghost" data-us-csv="${esc(key)}">${icon("file", 16)}Download (Excel)</button><button type="button" class="btn btn-primary" data-us-close>Close</button></div>`, "us-list");
}
function usTable(cols, rows, o = {}) {
  if (!rows.length) return `<p class="t-muted" style="margin:0">${esc(o.empty || "No one yet.")}</p>`;
  const shown = rows.slice(0, o.max || rows.length);
  return `<table class="us-t"><thead><tr>${cols.map((c) => `<th${c.num ? ' class="num"' : ""}>${esc(c.l)}</th>`).join("")}</tr></thead><tbody>
    ${shown.map((r) => `<tr${o.rowAttr ? " " + o.rowAttr(r) : ""} data-us-name="${esc(String(r.name || "").toLowerCase())}">${cols.map((c) => `<td${c.num ? ' class="num"' : c.nw ? ' style="white-space:nowrap"' : ""}>${c.h ? c.h(r) : esc(c.v(r) ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${rows.length > shown.length ? `<p class="t-muted" style="font-size:13px;margin:8px 0 0">Showing ${shown.length} of ${rows.length}. Download for the full list.</p>` : ""}`;
}
const usTxt = (c, r) => String(c.csv ? c.csv(r) : c.v ? c.v(r) ?? "" : "").trim();

/* ---------- Users & Sign-Ins ---------- */
const US_PCOLS = () => [
  { l: "Person", v: (r) => r.name, h: (r) => `<button type="button" class="link" data-ua-who="${esc(r.uid)}"><b>${esc(r.name)}</b></button>${r.email ? `<div class="t-muted" style="font-size:12px">${esc(r.email)}</div>` : ""}` },
  { l: "Account type", v: (r) => r.type }, { l: "Role or employee no.", v: (r) => r.role },
  { l: "Signed in today", v: (r) => (r.today ? "Yes" : "—") }, { l: "Days this month", num: true, v: (r) => r.mDays, h: (r) => usN(r.mDays) },
  { l: "Last sign-in", nw: true, v: (r) => usDT(r.last) || "—" }, { l: "Place", v: (r) => r.place || "—" }, { l: "Device", v: (r) => r.device || "—" }];
VIEWS.usrsign = () => {
  if (!usAdmin()) return noAccess();
  const cur = usYmNow(); const ym = /^\d{4}-\d{2}$/.test(S.usYm) && S.usYm <= cur ? S.usYm : cur; S.usYm = ym;
  const from = (ym < cur ? ym : cur) + "-01"; const r = usLoad(from, todayISO()); const live = usLive(r); const loading = !r && window.__sb;
  const users = usUsers(r); const D = usDays(r, users); const today = todayISO();
  const reg = users.filter((u) => u.status === "approved"); const pend = users.filter((u) => u.status === "pending");
  const inM = (uid, m) => [...(D.get(uid) || [])].filter((d) => d.startsWith(m)).length;
  for (const u of users) { u.today = (D.get(u.uid) || new Set()).has(today); u.mDays = inM(u.uid, cur); u.selDays = inM(u.uid, ym); }
  const staff = reg.filter((u) => u.staff), emp = reg.filter((u) => !u.staff);
  const on = (L) => L.filter((u) => u.today), onM = (L) => L.filter((u) => u.mDays > 0);
  const never = reg.filter((u) => !u.last);
  const sortLast = (L) => L.slice().sort((a, b) => String(b.last).localeCompare(String(a.last)) || a.name.localeCompare(b.name));
  const P = US_PCOLS(); const rowAttr = (u) => `data-ua-who-row="${esc(u.uid)}"`;
  const L = (title, rows, where, go) => ({ title, rows: sortLast(rows), cols: P, where, go, rowAttr });
  const perms = { label: "Users & permissions", go: usLink("perms") };
  const actL = { label: "Users Activity Logs", go: "usract" };
  // per day and per month (by account type)
  const [yy, mm] = ym.split("-").map(Number); const lastD = ym === cur ? Number(today.slice(8, 10)) : new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const dayRows = Array.from({ length: lastD }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`).reverse().map((d) => { const ppl = reg.filter((u) => (D.get(u.uid) || new Set()).has(d)); return { d, ppl, s: ppl.filter((u) => u.staff).length, e: ppl.filter((u) => !u.staff).length }; });
  const months = live ? (() => { const M = new Map(); for (const x of r.months || []) { if (!M.has(x.ym)) M.set(x.ym, new Set()); M.get(x.ym).add(x.uid); } const out = []; for (let i = 0; i < 12; i++) { const [y0, m0] = cur.split("-").map(Number); const dt = new Date(Date.UTC(y0, m0 - 1 - i, 1)); const k = dt.toISOString().slice(0, 7); const ids = M.get(k) || new Set(); const ppl = reg.filter((u) => ids.has(u.uid)); out.push({ ym: k, ppl, s: ppl.filter((u) => u.staff).length, e: ppl.filter((u) => !u.staff).length }); } return out; })() : [];
  const ymOpts = live ? months.map((m) => m.ym) : [cur]; if (!ymOpts.includes(ym)) ymOpts.unshift(ym);
  const maxD = Math.max(1, ...dayRows.map((x) => x.s + x.e)); const bar = (x, mx) => `<span class="us-bar" aria-hidden="true"><i style="width:${(x.s / mx) * 100}%"></i><b style="width:${(x.e / mx) * 100}%"></b></span>`;
  dayRows.forEach((x) => US_LISTS.set(`day:${x.d}`, L(`Signed in on ${fmtDate(x.d)}`, x.ppl, "the sign-in record", "usract")));
  months.forEach((x) => US_LISTS.set(`mon:${x.ym}`, L(`Signed in, ${usYmLab(x.ym)}`, x.ppl, "the sign-in record", "usract")));
  const q = S.usQ.trim().toLowerCase(); const listAll = sortLast(users.filter((u) => (!S.usT || (S.usT === "pending" ? u.status === "pending" : S.usT === "staff" ? u.staff && u.status === "approved" : S.usT === "emp" ? !u.staff && u.status === "approved" : S.usT === "never" ? u.status === "approved" && !u.last : true)) && (!q || `${u.name} ${u.email} ${u.role} ${u.position}`.toLowerCase().includes(q))));
  const status = (u) => (u.status === "approved" ? '<span class="chip c-ok">Has access</span>' : u.status === "pending" ? '<span class="chip c-gold">Waiting for approval</span>' : u.status === "rejected" ? '<span class="chip c-bad">Turned down</span>' : `<span class="chip c-gray">${esc(u.status || "")}</span>`);
  US_LISTS.set("all-users", { title: "List of users", rows: listAll, cols: [...P.slice(0, 3), { l: "Status", v: (u) => u.status }, ...P.slice(3)], where: "Users & Sign-Ins" });
  return head("Overview", "Users & Sign-Ins Overview", `<button class="btn btn-ghost" data-us-reload>${icon("back", 16)}Refresh</button><button class="btn btn-ghost" data-go="usract">${icon("useract", 16)}Users Activity Logs</button>`) + `
    <p class="t-muted us-intro">HR staff and employee accounts · who signed in each day and each month (each person counted once a day) · select a box for the people behind it, or the link under it for the page where those records are kept.</p>
    ${loading ? `<div class="notice"><span>Reading the sign-in record…</span></div>` : r?.err === "off" ? `<div class="notice"><span>The sign-in record starts once the website's database update for this page is applied. Until then HR staff show the last time they opened the app, and employee accounts show no sign-ins.</span></div>` : !window.__sb ? `<div class="notice"><span>Sign-in times are kept on the website. Here HR staff show the last time they opened the app.</span></div>` : ""}
    <h2 class="us-h">Registered in the HR system</h2>
    <section class="stats kpis us-kpis">
      ${usBox("reg", "All accounts", reg.length, pend.length ? `${pend.length} waiting for approval` : "none waiting for approval", L("All accounts", reg, "Users & permissions", "perms"), perms)}
      ${usBox("staff", "HR staff", staff.length, "can open the HR app", L("HR staff", staff, "Users & permissions", "perms"), perms)}
      ${usBox("emp", "Employee accounts", emp.length, "employee pages on their phones", L("Employee accounts", emp, "Users & permissions › Account requests", "perms"), { label: "Account requests", go: usLink("perms") })}
      ${usBox("pend", "Waiting for approval", pend.length, pend.length ? "needs an HR Manager" : "nothing waiting", L("Waiting for approval", pend, "Users & permissions › Account requests", "perms"), { label: "Approve in Users & permissions", go: usLink("perms") })}
    </section>
    <h2 class="us-h">Online</h2>
    <section class="stats kpis us-kpis">
      ${usBox("today", "Signed in today", on(reg).length, fmtDate(today), L(`Signed in today, ${fmtDate(today)}`, on(reg), "the sign-in record", "usract"), actL)}
      ${usBox("stoday", "HR staff today", on(staff).length, `${onM(staff).length} this month`, L("HR staff signed in today", on(staff), "the sign-in record", "usract"), actL)}
      ${usBox("etoday", "Employees today", on(emp).length, `${onM(emp).length} this month`, L("Employees signed in today", on(emp), "the sign-in record", "usract"), actL)}
      ${usBox("month", "Signed in this month", onM(reg).length, `${usYmLab(cur)} · each person once`, L(`Signed in, ${usYmLab(cur)}`, onM(reg), "the sign-in record", "usract"), actL)}
      ${usBox("never", "Never signed in", never.length, "approved but no sign-in on record", L("Approved but never signed in", never, "Users & permissions", "perms"), { label: "List of users below", scroll: "us-list" })}
    </section>
    <div class="us-bar-row"><label class="au-f" for="us-ym">Month<select class="input" id="us-ym">${ymOpts.map((x) => `<option value="${x}"${x === ym ? " selected" : ""}>${esc(usYmLab(x))}</option>`).join("")}</select></label>
      <span class="us-legend"><i></i>HR staff <b></b>Employees</span></div>
    <section class="card"><div class="card-head"><h2>Online per day · ${esc(usYmLab(ym))}</h2><span class="t-muted" style="font-size:13px">People who opened the HR system that day · select a day for the names</span></div>
      <div class="table-wrap"><table class="us-t"><thead><tr><th>Day</th><th class="num">HR staff</th><th class="num">Employees</th><th class="num">Total</th><th class="us-bar-h"><span class="sr-only">Chart</span></th></tr></thead><tbody>
      ${dayRows.map((x) => `<tr class="us-row" data-us-box="day:${x.d}" tabindex="0"><td style="white-space:nowrap">${fmtDate(x.d)}</td><td class="num">${usN(x.s)}</td><td class="num">${usN(x.e)}</td><td class="num"><b>${x.s + x.e}</b></td><td>${bar(x, maxD)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>Who signed in · ${esc(usYmLab(ym))}</h2><span class="t-muted" style="font-size:13px">Most recent first · select a person to open their activity log</span></div>
      <div class="table-wrap">${usTable([...P.slice(0, 4), { l: "Days that month", num: true, v: (u) => u.selDays, h: (u) => usN(u.selDays) }, ...P.slice(5)], sortLast(reg.filter((u) => u.selDays > 0)), { max: 150, rowAttr, empty: live ? "Nobody signed in this month yet." : "No sign-in record yet for this month." })}</div></section>
    ${live ? `<section class="card"><div class="card-head"><h2>Online per month</h2><span class="t-muted" style="font-size:13px">Different people who opened the HR system at least once that month (last 12 months)</span></div>
      <div class="table-wrap"><table class="us-t"><thead><tr><th>Month</th><th class="num">HR staff</th><th class="num">Employees</th><th class="num">Total</th></tr></thead><tbody>
      ${months.map((x) => `<tr class="us-row" data-us-box="mon:${x.ym}" tabindex="0"><td>${esc(usYmLab(x.ym))}</td><td class="num">${usN(x.s)}</td><td class="num">${usN(x.e)}</td><td class="num"><b>${x.s + x.e}</b></td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="card" id="us-list"><div class="card-head"><h2>List of users</h2><button type="button" class="btn btn-ghost btn-sm" data-us-csv="all-users">${icon("file", 14)}Download (Excel)</button></div>
      <div class="au-filters" style="margin-bottom:12px"><label class="au-f au-q" for="us-q">Search<input class="input" id="us-q" type="search" value="${esc(S.usQ)}" placeholder="Name, email or role"></label>
        <div class="seg" role="group" aria-label="Show">${[["", "Everyone"], ["staff", "HR staff"], ["emp", "Employees"], ["pending", "Waiting"], ["never", "Never signed in"]].map(([k, l]) => `<button type="button" data-us-t="${k}" aria-pressed="${S.usT === k}">${l}</button>`).join("")}</div></div>
      <div class="table-wrap">${usTable([...P.slice(0, 3), { l: "Status", v: (u) => u.status, h: status }, ...P.slice(3)], listAll, { max: 400, rowAttr, empty: "No accounts match." })}</div></section>
    <p class="t-muted us-note">HR staff = people listed in Users & permissions; employee accounts = employees whose account request was approved. Signed in counts each day a person opened the HR system${live ? "; the record starts when the website's database update for this page was applied, and last sign-ins before that come from the sign-in service" : ""}. The automation runner is not counted.</p>`;
};

/* ---------- Users Activity Logs ---------- */
VIEWS.usract = () => {
  if (!usActOk()) return noAccess();
  const F = S.auF; if (typeof AU !== "undefined" && AU.key !== `${F.from}|${F.to}` && !AU.loading) setTimeout(() => auLoad().then(() => { if (S.view?.name === "usract") render(); }), 0);
  const r = usAdmin() ? usLoad(F.from, F.to) : null; const live = usLive(r);
  const users = usUsers(r); const byId = new Map(users.map((u) => [u.uid, u]));
  const use = usAdmin() ? usUse(F.from, F.to) : null; const uLive = usUseLive(use);
  const rows = typeof auRowsAll === "function" ? auRowsAll() : [];
  const D = new Map(); if (live) for (const x of r.days || []) { const o = D.get(x.uid) || { days: 0, sin: 0, opens: 0, last: "" }; o.days++; o.sin += x.signins || 0; o.opens += x.opens || 0; if (x.last > o.last) o.last = x.last; D.set(x.uid, o); }
  const P = new Map(); const per = (uid) => { if (!P.has(uid)) { const u = byId.get(uid); P.set(uid, { uid, name: u?.name || rows.find((x) => x.uid === uid)?.who || "Someone", type: u?.type || "HR staff", role: u?.role || "", days: 0, sin: 0, open: 0, create: 0, update: 0, delete: 0, download: 0, last: "" }); } return P.get(uid); };
  for (const [uid, o] of D) { const p = per(uid); p.days = o.days; p.sin = o.sin; if (o.last > p.last) p.last = o.last; }
  const dayOpen = new Map(); for (const x of rows) { if (!x.uid) continue; const p = per(x.uid); p[x.act] = (p[x.act] || 0) + 1; if (x.at > p.last) p.last = x.at; if (x.act === "open") { const k = x.uid; if (!dayOpen.has(k)) dayOpen.set(k, new Set()); dayOpen.get(k).add(manilaDay(x.at)); } }
  if (!live) for (const [uid, s] of dayOpen) per(uid).days = s.size;
  if (uLive) for (const x of use.byUser) { const p = per(x.uid); p.pages = x.pages || 0; p.clicks = x.clicks || 0; p.secs = x.secs || 0; p.mods = x.modules || 0; if (x.last > p.last) p.last = x.last; }
  const people = [...P.values()].sort((a, b) => (b.create + b.update + b.delete + b.days + b.open) - (a.create + a.update + a.delete + a.days + a.open) || a.name.localeCompare(b.name));
  const reg = users.filter((u) => u.status === "approved");
  const sum = (k) => people.reduce((a, p) => a + (p[k] || 0), 0);
  const signed = people.filter((p) => p.days > 0);
  const sRows = live ? (r.list || []).map((x) => ({ uid: x.uid, name: byId.get(x.uid)?.name || "Someone", type: byId.get(x.uid)?.type || "", at: x.at, ip: x.ip || "", dev: usDev(x.ua), place: usPlace(x), kind: x.kind === "signin" ? "Signed in" : "Opened the app" })) : [];
  const PC = [{ l: "Person", v: (p) => p.name, h: (p) => `<button type="button" class="link" data-ua-who="${esc(p.uid)}"><b>${esc(p.name)}</b></button>` }, { l: "Account type", v: (p) => p.type }, { l: "Days signed in", num: true, v: (p) => p.days, h: (p) => usN(p.days) }, ...(live ? [{ l: "Sign-ins", num: true, v: (p) => p.sin, h: (p) => usN(p.sin) }] : []), { l: "Added", num: true, v: (p) => p.create, h: (p) => usN(p.create) }, { l: "Changed", num: true, v: (p) => p.update, h: (p) => usN(p.update) }, { l: "Deleted", num: true, v: (p) => p.delete, h: (p) => usN(p.delete) }, { l: "Downloads", num: true, v: (p) => p.download, h: (p) => usN(p.download) }, ...(uLive ? [{ l: "Pages opened", num: true, v: (p) => p.pages || 0, h: (p) => usN(p.pages) }, { l: "Clicks", num: true, v: (p) => p.clicks || 0, h: (p) => usN(p.clicks) }, { l: "Time in the app", nw: true, v: (p) => usDur(p.secs) }] : []), { l: "Last activity", nw: true, v: (p) => usDT(p.last) || "—" }];
  const SC = [{ l: "When", nw: true, v: (s) => usDT(s.at) }, { l: "Person", v: (s) => s.name, h: (s) => `<button type="button" class="link" data-ua-who="${esc(s.uid)}"><b>${esc(s.name)}</b></button>` }, { l: "Account type", v: (s) => s.type }, { l: "What", v: (s) => s.kind }, { l: "Place", v: (s) => s.place || "—" }, { l: "Device", v: (s) => s.dev }, { l: "Network address", v: (s) => s.ip || "—" }];
  const rowAttr = (p) => `data-ua-who-row="${esc(p.uid)}"`;
  const LP = (title, list, where, go) => ({ title, rows: list, cols: PC, where, go, rowAttr });
  const byAct = (a) => people.filter((p) => p[a] > 0).sort((x, y) => y[a] - x[a]);
  const audit = { label: "Audit log", go: usLink("audtrail") };
  US_LISTS.set("ua-people", LP("By person", people, "the Audit Trail and sign-in record"));
  if (live) US_LISTS.set("ua-sign", { title: "Sign-ins", rows: sRows, cols: SC, where: "the sign-in record", rowAttr: (s) => `data-ua-who-row="${esc(s.uid)}"` });
  const range = `${fmtDate(F.from)} to ${fmtDate(F.to)}`;
  return head("Overview", "Users Activity Logs Overview", `<button class="btn btn-ghost" data-us-reload>${icon("back", 16)}Refresh</button><button class="btn btn-ghost" data-go="usrsign">${icon("usersign", 16)}Users & Sign-Ins</button>`) + `
    <p class="t-muted us-intro">For the dates chosen: who signed in, every sign-in with its device and network address, and the records each person added, changed and deleted and the files they downloaded · select a person to see everything they did and when.</p>
    <div class="au-filters us-range"><label class="au-f" for="ua-from">From<input class="input" type="date" id="ua-from" value="${esc(F.from)}" max="${todayISO()}"></label><label class="au-f" for="ua-to">To<input class="input" type="date" id="ua-to" value="${esc(F.to)}" max="${todayISO()}"></label>
      <div class="au-quick"><button type="button" class="btn btn-ghost btn-sm" data-ua-range="0">Today</button><button type="button" class="btn btn-ghost btn-sm" data-ua-range="6">Last 7 days</button><button type="button" class="btn btn-ghost btn-sm" data-ua-range="29">Last 30 days</button></div></div>
    ${F.from > F.to ? `<div class="notice"><span>The end date is before the start date.</span></div>` : ""}
    ${typeof AU !== "undefined" && AU.loading ? `<div class="notice"><span>Reading the Audit Trail…</span></div>` : ""}
    ${usAdmin() && window.__sb && !r ? `<div class="notice"><span>Reading the sign-in record…</span></div>` : r?.err === "off" ? `<div class="notice"><span>Sign-ins with their time, device and network address show once the website's database update for this page is applied. Until then, days signed in count the days each person opened the HR app.</span></div>` : ""}
    <h2 class="us-h">Activity · ${esc(range)}</h2>
    <section class="stats kpis us-kpis">
      ${usBox("ua-acc", "Accounts", reg.length || people.length, "HR staff and employee accounts", reg.length ? { title: "Accounts", rows: reg.map((u) => P.get(u.uid) || { uid: u.uid, name: u.name, type: u.type, days: 0, sin: 0, create: 0, update: 0, delete: 0, download: 0, last: u.last }), cols: PC, where: "Users & Sign-Ins", go: "usrsign", rowAttr } : null, { label: "Users & Sign-Ins", go: "usrsign" })}
      ${usBox("ua-on", "Signed in", signed.length, `of ${reg.length || people.length} · at least one day`, LP("Signed in during these dates", signed, "the sign-in record", "usrsign"), { label: "Users & Sign-Ins", go: "usrsign" })}
      ${live ? usBox("ua-sin", "Sign-ins", sum("sin"), "each with time, device and address", US_LISTS.get("ua-sign"), { label: "Sign-ins list below", scroll: "ua-signs" }) : ""}
      ${usBox("ua-c", "Records added", sum("create"), "new records saved", LP("Added records", byAct("create"), "Audit Trail › Audit log", "audtrail"), { ...audit, act: "create" })}
      ${usBox("ua-u", "Records changed", sum("update"), "edits and approvals", LP("Changed records", byAct("update"), "Audit Trail › Audit log", "audtrail"), { ...audit, act: "update" })}
      ${usBox("ua-d", "Records deleted", sum("delete"), sum("delete") ? "worth a look" : "none", LP("Deleted records", byAct("delete"), "Audit Trail › Audit log", "audtrail"), { ...audit, act: "delete" })}
      ${uLive ? usBox("ua-pg", "Pages opened", sum("pages"), `${(use.byModule || []).filter((m) => m.module).length} modules · ${usDur(sum("secs"))} in the app`, LP("Pages opened", people.filter((p) => p.pages).sort((a, b) => b.pages - a.pages), "the page log"), { label: "By module below", scroll: "ua-mods" }) : ""}
      ${uLive ? usBox("ua-ck", "Clicks", sum("clicks"), "buttons and links pressed", LP("Clicks", people.filter((p) => p.clicks).sort((a, b) => b.clicks - a.clicks), "the page log"), { label: "By person below", scroll: "ua-by" }) : ""}
      ${usBox("ua-dl", "Downloads", sum("download"), "files and reports saved", LP("Downloads", byAct("download"), "Audit Trail › Audit log", "audtrail"), { ...audit, act: "download" })}
    </section>
    <div style="display:flex;justify-content:flex-end;margin:-4px 0 12px"><button type="button" class="btn btn-ghost btn-sm" data-us-csv="ua-people">${icon("file", 14)}Download by person (Excel)</button></div>
    ${live ? `<section class="card" id="ua-signs"><div class="card-head"><h2>Sign-ins</h2><span class="t-muted" style="font-size:13px">Every sign-in and opening for the dates chosen, newest first · select a row for the person's log</span></div>
      <div class="table-wrap">${usTable(SC, sRows, { max: S.uaShow, rowAttr: (s) => `data-ua-who-row="${esc(s.uid)}"`, empty: "Nobody signed in during these dates." })}</div>
      ${sRows.length > S.uaShow ? `<p style="margin:10px 0 0"><button class="btn btn-ghost btn-sm" data-ua-more>Show 100 more</button></p>` : ""}</section>` : ""}
    ${uLive ? `<section class="card" id="ua-mods"><div class="card-head"><h2>By module</h2><span class="t-muted" style="font-size:13px">Pages opened in each module for the dates chosen, by everyone</span></div>
      <div class="table-wrap">${usTable([{ l: "Module", v: (m) => m.module || "Other", h: (m) => `<b>${esc(GL(m.module || "Other"))}</b>` }, { l: "Pages opened", num: true, v: (m) => m.pages, h: (m) => usN(m.pages) }, { l: "People", num: true, v: (m) => m.people, h: (m) => usN(m.people) }, { l: "Clicks", num: true, v: (m) => m.clicks, h: (m) => usN(m.clicks) }, { l: "Time spent", nw: true, v: (m) => usDur(m.secs) }], use.byModule || [], { empty: "No pages opened on these dates." })}</div></section>` : use?.err === "off" ? `<div class="notice"><span>Pages opened and clicks show once the website's database update for this page is applied.</span></div>` : ""}
    <section class="card" id="ua-by"><div class="card-head"><h2>By person</h2><span class="t-muted" style="font-size:13px">Most active first · select a name to see everything the person did and when</span></div>
      <div class="table-wrap">${usTable(PC, people, { rowAttr, empty: "No one used the HR system on these dates." })}</div></section>
    <div id="ua-detail">${S.uaWho ? usDetail(S.uaWho, { users: byId, rows, live, r, per: P.get(S.uaWho), use: usAdmin() && uLive ? usUse(F.from, F.to, S.uaWho) : null }) : ""}</div>
    <p class="t-muted us-note">Records added, changed and deleted and downloads come from the Audit Trail, which records the work of HR staff from 14 Oct 2026; employees' own requests are filed by HR and show under the HR person who filed them. Pay, bank and government numbers are never copied into the log. Sign-ins (with the city of the network, not the exact position), pages opened and buttons pressed are recorded on the website from the day its database update for this page was applied; pages are kept 90 days, and what people type is never recorded.</p>`;
};
function usDetail(uid, X) {
  const u = X.users.get(uid); const p = X.per || {}; const name = u?.name || p.name || X.rows.find((x) => x.uid === uid)?.who || "Someone";
  const mine = X.rows.filter((x) => x.uid === uid).slice(0, 200); const signs = X.live ? (X.r.list || []).filter((x) => x.uid === uid).slice(0, 200) : [];
  const devs = new Set(signs.map((s) => usDev(s.ua))); const ips = new Set(signs.map((s) => s.ip).filter(Boolean));
  return `<section class="card us-detail"><div class="card-head"><h2>${icon("useract", 18)} ${esc(name)}</h2><div style="display:flex;gap:8px;flex-wrap:wrap">${usLink("audtrail") ? `<button type="button" class="btn btn-ghost btn-sm" data-au-who="${esc(uid)}">${icon("audit", 14)}Open in the Audit log</button>` : ""}<button type="button" class="btn btn-ghost btn-sm" data-ua-close>Close</button></div></div>
    <p class="t-muted" style="margin:-6px 0 12px;font-size:13px">${esc([u?.type, u?.role, u?.email, u?.last ? `last sign-in ${usDT(u.last)}` : ""].filter(Boolean).join(" · "))}</p>
    <section class="stats us-mini">
      <div class="card stat"><span class="label">Days signed in</span><span class="value">${p.days || 0}</span></div>
      ${X.live ? `<div class="card stat"><span class="label">Sign-ins</span><span class="value">${p.sin || 0}</span><span class="sub">${devs.size} device${devs.size === 1 ? "" : "s"} · ${ips.size} address${ips.size === 1 ? "" : "es"}</span></div>` : ""}
      <div class="card stat"><span class="label">Added</span><span class="value">${p.create || 0}</span></div><div class="card stat"><span class="label">Changed</span><span class="value">${p.update || 0}</span></div>
      <div class="card stat"><span class="label">Deleted</span><span class="value">${p.delete || 0}</span></div><div class="card stat"><span class="label">Downloads</span><span class="value">${p.download || 0}</span></div>
      ${usUseLive(X.use) ? `<div class="card stat"><span class="label">Pages opened</span><span class="value">${p.pages || 0}</span><span class="sub">${p.mods || 0} modules · ${usDur(p.secs)}</span></div><div class="card stat"><span class="label">Clicks</span><span class="value">${p.clicks || 0}</span></div>` : ""}</section>
    ${X.live ? `<h3 class="us-h3">Sign-ins</h3><div class="table-wrap">${usTable([{ l: "When", nw: true, v: (s) => usDT(s.at) }, { l: "What", v: (s) => (s.kind === "signin" ? "Signed in" : "Opened the app") }, { l: "Place", v: (s) => usPlace(s) || "—" }, { l: "Device", v: (s) => usDev(s.ua) }, { l: "Network address", v: (s) => s.ip || "—" }], signs, { empty: "No sign-ins on these dates." })}</div>` : ""}
    ${usUseLive(X.use) ? `<h3 class="us-h3">Modules and pages opened</h3><div class="table-wrap">${usTable([{ l: "When", nw: true, v: (v) => usDT(v.at) }, { l: "Module", v: (v) => GL(v.module || "") || "—" }, { l: "Page", v: (v) => v.label || v.page }, { l: "Time there", nw: true, v: (v) => usDur(v.secs) }, { l: "Clicks", num: true, v: (v) => v.clicks, h: (v) => usN(v.clicks) }, { l: "Buttons pressed", v: (v) => (v.taps || []).join(", "), h: (v) => (v.taps?.length ? `<span class="us-taps">${v.taps.map((t) => `<span class="chip c-gray">${esc(t)}</span>`).join(" ")}</span>` : '<span class="t-muted">—</span>') }], X.use.items || [], { max: 300, empty: "No pages opened on these dates." })}</div>` : X.use === null && usAdmin() && window.__sb ? '<p class="t-muted">Reading the pages opened…</p>' : ""}
    <h3 class="us-h3">What they did</h3>
    ${mine.length ? `<div class="table-wrap"><table class="us-t"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Page</th><th>What changed</th></tr></thead><tbody>
      ${mine.map((x) => `<tr><td style="white-space:nowrap">${auWhen(x.at)}</td><td>${auChip(x.act)}</td><td>${esc(x.label || "")}${x.col ? `<div class="t-muted" style="font-size:12px">${esc(AU_COL[x.col] || x.col)}</div>` : ""}</td><td>${esc(x.pageL || "")}</td><td>${auChanges(x)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Nothing recorded for this person on these dates.</p>'}</section>`;
}

/* ---------- menu, access and events ---------- */
{ const ov = NAV.find(([g]) => g === "Overview") || NAV[0]; const i = ov[1].findIndex(([v]) => v === "aiagents");
  ov[1].splice(i >= 0 ? i + 1 : ov[1].length, 0, ["usrsign", "Users & Sign-Ins", "usersign"], ["usract", "Users Activity Logs", "useract"]);
  for (const v of US_VIEWS) { SECTION_OF[v] = v; try { HRD_PERM[v] = "Overview"; } catch {} } }
{ const b = viewAllowed; viewAllowed = (name) => (name === "usrsign" ? usAdmin() : name === "usract" ? usActOk() : b(name)); }
const usOpenWho = (uid) => { S.uaWho = uid; if (S.view?.name !== "usract") { const F = S.auF; if (!F.from) { F.to = todayISO(); F.from = addDays(F.to, -29); } go("usract"); } else render(); setTimeout(() => document.getElementById("ua-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-us-box],[data-us-close],[data-us-csv],[data-us-goto],[data-us-reload],[data-us-t],[data-us-scroll],[data-ua-range],[data-ua-who],[data-ua-who-row],[data-ua-close],[data-ua-more],[data-ua-audit]"); if (!t) return;
  if (t.matches("[data-ua-who-row]") && ev.target.closest("button,a,input,select")) return;
  if (t.matches("[data-us-box]") && ev.target.closest(".us-where")) return;
  const d = t.dataset;
  if (d.usBox != null) { usListDlg(d.usBox); return; }
  if (d.usClose != null) { closeModal(); return; }
  if (d.usGoto != null) { closeModal(); go(d.usGoto); return; }
  if (d.usCsv != null) { const L = US_LISTS.get(d.usCsv); if (!L) return; offer(`${L.title}.csv`, toCSV([L.cols.map((c) => c.l), ...L.rows.map((r) => L.cols.map((c) => usTxt(c, r)))])); return; }
  if (d.usReload != null) { US.cache.clear(); UU.cache.clear(); if (typeof auLoad === "function" && S.view?.name === "usract") auLoad(true).then(() => { if (S.view?.name === "usract") render(); }); render(); return; }
  if (d.usT != null) { S.usT = d.usT; render(); return; }
  if (d.usScroll != null) { document.getElementById(d.usScroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (d.uaRange != null) { const F = S.auF; F.to = todayISO(); F.from = addDays(F.to, -Number(d.uaRange)); render(); return; }
  if (d.uaWho != null || d.uaWhoRow != null) { const id = d.uaWho ?? d.uaWhoRow; if ($("#io-modal") && !$("#io-modal").hidden) closeModal(); usOpenWho(id); return; }
  if (d.uaClose != null) { S.uaWho = ""; render(); return; }
  if (d.uaMore != null) { S.uaShow += 100; render(); return; }
  if (d.uaAudit != null && d.go == null) return;
}, true);
// the Audit log link under a box opens it filtered to that action (runs before the page change)
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-ua-audit][data-go]"); if (t) Object.assign(S.auF, { who: "", act: t.dataset.uaAudit, mod: "", q: "" }); }, true);
document.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.("[data-us-box],[data-ua-who-row]")) { ev.preventDefault(); ev.target.click(); } });
document.addEventListener("change", (ev) => {
  const t = ev.target; if (t.id === "us-ym") { S.usYm = t.value; render(); }
  else if (t.id === "ua-from" || t.id === "ua-to") { if (t.value) { S.auF[t.id === "ua-from" ? "from" : "to"] = t.value; render(); } }
});
document.addEventListener("input", (ev) => {
  const t = ev.target; if (t.id === "us-q") { S.usQ = t.value; clearTimeout(usrsignQ); usrsignQ = setTimeout(() => { render(); const q = document.getElementById("us-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
  else if (t.id === "us-dq") { const q = t.value.trim().toLowerCase(); document.querySelectorAll(".us-dlg-t tbody tr").forEach((tr) => { tr.hidden = !!q && !(tr.dataset.usName || "").includes(q); }); }
});
let usrsignQ = 0;
{ const st = document.createElement("style"); st.textContent = `
.us-intro{margin:-6px 0 14px;font-size:14px;max-width:900px}
.us-h{font-size:17px;margin:18px 0 10px}.us-h3{font-size:15px;margin:16px 0 8px}
.us-box{display:flex;flex-direction:column;gap:4px;position:relative}
.us-box.us-open{cursor:pointer}.us-box.us-open:hover,.us-box.us-open:focus-visible{transform:translateY(-1px);box-shadow:0 6px 18px rgba(15,23,42,.18);outline:2px solid transparent}
.us-box.us-open:focus-visible{outline:3px solid var(--gold,#c9a54c);outline-offset:2px}
.us-box .sub{font-size:12px;opacity:.9}
.us-where{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:12px;font-weight:600;color:inherit!important;text-decoration:underline;text-underline-offset:2px;align-self:flex-start;background:none;border:0;padding:2px 0;cursor:pointer}
.us-bar-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 12px}
.us-legend{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px}.us-legend i,.us-legend b{display:inline-block;width:12px;height:12px;border-radius:3px;background:#1d4ed8}.us-legend b{background:#0f9d76;margin-left:8px}
.us-bar{display:flex;height:10px;min-width:120px;background:var(--line,#e5e7eb);border-radius:6px;overflow:hidden}.us-bar i{background:#1d4ed8}.us-bar b{background:#0f9d76}
.us-row,.us-t tr[data-ua-who-row]{cursor:pointer}.us-row:hover td,.us-t tr[data-ua-who-row]:hover td{background:var(--hover,rgba(29,78,216,.06))}
.us-row:focus-visible,.us-t tr[data-ua-who-row]:focus-visible{outline:2px solid var(--gold,#c9a54c);outline-offset:-2px}
.us-note{font-size:13px;margin:12px 0 0;max-width:900px}
.us-detail{scroll-margin-top:16px}.us-mini{margin-bottom:6px}
.us-dlg-t{max-height:min(60vh,520px);overflow:auto}
.us-taps{display:flex;flex-wrap:wrap;gap:4px;max-width:420px}.us-taps .chip{font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
@media (max-width:600px){.us-bar{min-width:70px}.us-range .au-f{min-width:0;flex:1 1 140px}.us-range .au-f .input{width:100%;min-width:0}.us-range .au-quick{width:100%}}
`; document.head.appendChild(st); }

/* ---------- the page log (website): each page a signed-in person opens, its module, the time there and the buttons pressed ----------
   One row per page visit, sent in batches every 20 seconds and when the tab is hidden. Only names of buttons and links are
   kept, never what is typed; fields, passwords and file boxes are skipped. Employees' phone pages count too. */
const UT = { cur: null, q: [], busy: false };
const utOn = () => !!(window.__sb && window.__hosted && S.myId && S.db);
const utPage = () => (S.selfMode ? `me:${S.selfView || S.essView || "home"}` : S.viewAs === "emp" && S.realEdit ? `ess:${S.essView || "esshome"}` : S.view?.name || "");
const utModule = () => { if (S.selfMode || S.viewAs === "emp") return "Employee pages"; try { const v = S.view?.name; if (v === "perms") return "Users & Permissions"; const k = navKeys().find((x) => x.v === v) || navKeys().find((x) => x.v === SECTION_OF[v]); const g = k?.g || viewGroup(v); return g ? GL(g) : "Overview"; } catch { return ""; } };
function utClose() { const c = UT.cur; if (!c) return; UT.cur = null; c.secs = Math.min(3600, Math.round((Date.now() - c.t0) / 1000)); delete c.t0; UT.q.push(c); if (UT.q.length > 200) UT.q.splice(0, UT.q.length - 200); }
function utFlush() {
  if (!utOn() || UT.busy || !UT.q.length) return; UT.busy = true; const batch = UT.q.splice(0, 50);
  window.__sb.rpc("hr_usage_note", { p_items: batch }).then(({ error }) => { UT.busy = false; if (error && !/PGRST202|does not exist|not find/i.test(error.message || "")) UT.q.unshift(...batch.slice(0, 50)); }, () => { UT.busy = false; });
}
{ const b = render; render = (...a) => { const r = b(...a); try { if (utOn() && !document.hidden) { const pg = utPage(); if (pg && UT.cur?.page !== pg) { utClose(); UT.cur = { at: new Date().toISOString(), page: pg, label: "", module: utModule(), clicks: 0, taps: [], t0: Date.now() }; }
  if (UT.cur && !UT.cur.label) UT.cur.label = (document.querySelector("#main h1")?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120); } } catch {} return r; }; }
document.addEventListener("click", (ev) => {
  if (!UT.cur || !ev.isTrusted) return; const el = ev.target.closest?.("button,a,[role=button],[role=tab],[data-go],summary,[data-emp]"); if (!el || el.closest("input,textarea,select,[type=password],[type=file]")) return;
  UT.cur.clicks++; const t = String(el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (t && UT.cur.taps.length < 30 && UT.cur.taps[UT.cur.taps.length - 1] !== t) UT.cur.taps.push(t);
}, true);
document.addEventListener("visibilitychange", () => { if (document.hidden) { utClose(); utFlush(); } else if (utOn()) render(); });
window.addEventListener("pagehide", () => { utClose(); utFlush(); });
setInterval(() => { if (UT.cur && Date.now() - UT.cur.t0 > 600000) { const pg = UT.cur.page, lb = UT.cur.label, md = UT.cur.module; utClose(); UT.cur = { at: new Date().toISOString(), page: pg, label: lb, module: md, clicks: 0, taps: [], t0: Date.now() }; } utFlush(); }, 20000);
