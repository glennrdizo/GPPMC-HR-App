/* ---------- Audit Trail (Glenn 2026-10-14): who added, changed, deleted or downloaded what, when, and from which page ---------- */
// Every save made by HR staff goes through S.db, so the recorder sits on the database: each set/update/delete is compared with the record
// before it and written to audit/<YYYY-MM-DD>--<user>--<session>[-n] = { date, uid, name, role, sess, started, items: [{ at, act, path, col, label, page, pageL, mod, changes: [{ f, from, to }] }] }.
// Pay and bank figures are never copied into the log (shown as "changed (hidden)"). One doc per person per browser session, so two open tabs never overwrite each other.
const AU = { sess: Math.random().toString(36).slice(2, 8), buf: [], doc: null, id: "", n: 0, t: 0, raw: null, inflight: 0, opened: false, fails: 0, busy: false, data: new Map(), key: "", loading: false, err: "", srv: null, srvKey: "", srvErr: "" };
Object.assign(S, { auF: { from: addDays(todayISO(), -6), to: todayISO(), who: "", act: "", mod: "", q: "" }, auX: new Set(), auShow: 200 });
Object.assign(ICON, { audit: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 13l2 2 4-4"/>' });
const AU_VIEWS = new Set(["audtrail", "audsum", "audsrv"]);
const AU_ACT = { create: ["Added", "c-ok"], update: ["Changed", "c-gold"], delete: ["Deleted", "c-bad"], open: ["Opened the app", "c-gray"], download: ["Downloaded", "c-blue"] };
const AU_COL = { employees: "Employee 201 file", m201: "Full 201 file", projects: "Project", org: "Settings", leaves: "Leave", leavereq: "Leave request", payruns: "Payroll run", periods: "Payroll period", loans: "Loan", loanposts: "Loan submission", t13: "13th month", attreq: "Attendance request", roster: "Working calendar", suspend: "Work suspension", jobs: "Job opening", applicants: "Applicant", offboard: "Offboarding", cases: "Admin case", contracts: "Contract", training: "Training", courses: "Course", assets: "Company asset", ann: "Announcement", meetings: "Meeting notes", tickets: "Ask HR ticket", clockins: "Time clock", hrdreg: "HRD register", empaudit: "Employee change log", conf: "Confidential pay", apprs: "Approval", remit: "Remittance", paf: "Personnel action form", suspend: "Work suspension", medical: "Medical record", contracts: "Contract", doctpl: "Document format", hrdreg: "HRD register" };
// Field names that hold pay, bank or government numbers: the log says they changed, never the values.
const AU_SENS = new Set(["pay", "salary", "allow", "allowance", "allowances", "bank", "acct", "account", "sss", "tin", "philhealth", "pagibig", "hdmf", "rate", "rates", "amount", "amort", "wage", "wages", "deduct", "deduction", "deductions", "tax", "bonus", "commission", "comm", "comm13", "gross", "net", "balance", "loan", "loans", "prev", "lines", "totals", "cash", "ecola", "de", "minimis", "flex", "fringe"]);
const AU_PAYCOL = new Set(["payruns", "periods", "t13", "loans", "loanposts", "conf", "remit", "confpay", "finalpay", "flex", "fringe"]);
const auWords = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
const auSens = (f) => String(f).split(".").some((s) => auSeg(s) === s && auWords(s).some((w) => AU_SENS.has(w)));
const auOn = () => !!S.realEdit && !S.selfMode;
const auMe = () => (S.myId && (S.access?.users?.[S.myId]?.name || S.access?.names?.[S.myId])) || S.meName || "";
const auWho = (uid, name) => (uid && (S.access?.users?.[uid]?.name || S.profiles?.[uid]?.name)) || name || "Someone";
const auOk = () => { if (!S.realEdit || S.selfMode) return false; if (S.isOwner || isPermAdmin()) return true; const r = myRole(); return ["owner", "exec"].includes(r.key) || !!r.views?.has?.("audtrail"); };
const auSkip = (p) => /^(audit|activity|pub|empaudit)\//.test(p) || /^clockins\/(kiosk-[^/]*|[^/]+\/me)(\/|$)/.test(p) || p === "org/medash";
const AU_ORG = { access: "Users & permissions", main: "Departments & positions", settings: "Company settings", doctpl: "Contract & job offer formats", ops: "Rules & deadlines", hrd: "HRD platform checklist", f201: "201 form layout", clocklinks: "Time clock links", rtests: "Recruitment tests", talent: "Recruitment settings" };
const auPlain = (v) => v && typeof v === "object" && !Array.isArray(v);
const auSeg = (s) => { const e = S.emps?.get?.(s); if (e) return fullName(e); const u = S.access?.users?.[s]; if (u) return u.name || "a user"; const p = S.projects?.get?.(s); if (p) return p.name; return s; };
const auField = (col, f) => { const top = f.split(".")[0]; const known = col === "employees" && typeof AUD_FIELDS !== "undefined" && f === top ? AUD_FIELDS[f]?.[1] : ""; return known || f.split(".").map((s) => { const n = auSeg(s); return n !== s ? n : auWords(s).join(" "); }).join(" › "); };
const auItemLabel = (x) => (x && typeof x === "object" ? x.name || x.title || x.label || x.text || (x.first || x.last ? `${x.first || ""} ${x.last || ""}`.trim() : "") || x.id || "" : String(x));
function auShort(v) {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") { const k = Object.keys(v).length; return `${k} field${k === 1 ? "" : "s"}`; }
  const s = String(v).replace(/(₱|PHP)\s?-?[\d,]+(\.\d+)?/gi, "₱•••"); return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
function auArr(a, b) {
  const key = (x) => (x && typeof x === "object" ? x.id ?? JSON.stringify(x) : String(x));
  const A = new Map((a || []).map((x) => [key(x), x])), B = new Map((b || []).map((x) => [key(x), x]));
  const add = [...B.keys()].filter((k) => !A.has(k)), del = [...A.keys()].filter((k) => !B.has(k));
  const chg = [...B.keys()].filter((k) => A.has(k) && JSON.stringify(A.get(k)) !== JSON.stringify(B.get(k)));
  const names = (ks, m) => { const l = ks.slice(0, 3).map((k) => auShort(auItemLabel(m.get(k)))).filter(Boolean); return l.length ? ` (${l.join(", ")}${ks.length > 3 ? ", …" : ""})` : ""; };
  const out = [];
  if (add.length) out.push(`${add.length} added${names(add, B)}`);
  if (del.length) out.push(`${del.length} removed${names(del, A)}`);
  if (chg.length) out.push(`${chg.length} changed${names(chg, B)}`);
  return out.join("; ");
}
// Compare before and after, down to three levels. "partial" (an update) only looks at the fields being written.
function auDiff(a, b, partial, pre = "", depth = 0, out = []) {
  const keys = new Set([...Object.keys(b || {}), ...(partial ? [] : Object.keys(a || {}))]);
  for (const k of keys) {
    if (out.length >= 30) break;
    const f = pre ? `${pre}.${k}` : k; const x = a?.[k], y = b?.[k];
    if (JSON.stringify(x) === JSON.stringify(y) || ((x == null || x === "") && (y == null || y === ""))) continue;
    if (auPlain(x) && auPlain(y) && depth < 2) { auDiff(x, y, partial, f, depth + 1, out); continue; }
    if (Array.isArray(x) || Array.isArray(y)) { out.push({ f, from: "", to: auArr(Array.isArray(x) ? x : [], Array.isArray(y) ? y : []), list: true }); continue; }
    out.push({ f, from: auShort(x), to: auShort(y) });
  }
  return out;
}
function auLabel(col, id, d) {
  if (col === "org") return AU_ORG[id] || `Settings: ${auWords(id).join(" ")}`;
  if (col === "employees" || col === "m201" || col === "conf") { const e = S.emps?.get?.(String(id).replace(/^employees--/, "")); if (e) return `${fullName(e)}${e.no ? " · " + e.no : ""}`; if (d?.first || d?.last) return `${d.first || ""} ${d.last || ""}`.trim(); }
  if (col === "projects") { const p = S.projects?.get?.(id) || d; if (p?.name) return p.name; }
  if (col === "applicants" && (d?.first || d?.last)) return `${d.first || ""} ${d.last || ""}`.trim();
  const n = d && (d.name || d.title || d.label || d.subject || d.reason); const e = d?.empId && S.emps?.get?.(d.empId);
  if (e) return `${fullName(e)}${n ? " · " + auShort(n) : ""}`; if (n) return auShort(n);
  if (d?.from || d?.date || d?.month) return fmtDate(String(d.from || d.date || d.month + "-01").slice(0, 10));
  return id;
}
function auPage() {
  const n = S.view?.name || ""; const k = typeof navKeys === "function" ? navKeys().find((x) => x.v === n || x.v === SECTION_OF[n]) : null;
  const l = (typeof HRD_LABEL !== "undefined" && HRD_LABEL[n]) || k?.l || n; let g = ""; try { g = viewGroup(n) || ""; } catch {}
  if (n === "perms") return { page: n, pageL: "Users & permissions", mod: "Users & Permissions" };
  return { page: n, pageL: l, mod: g === "Overview" ? "Overview" : g || "Other" };
}
function auRecord(kind, path, before, val, opt) {
  const parts = path.split("/"); const col = parts[0], id = parts[parts.length - 1];
  const after = kind === "delete" ? null : val; const partial = kind === "update" || !!opt?.merge;
  const act = kind === "delete" ? "delete" : kind === "set" && before === null ? "create" : "update";
  let changes = act === "update" ? auDiff(before || {}, after || {}, partial || before === undefined) : [];
  if (path === "org/access") changes = changes.filter((c) => !/^(seen|seenAt|names)(\.|$)/.test(c.f) && !/^users\.[^.]+\.lang$/.test(c.f));
  if (act === "update" && !changes.length) return;
  const hide = AU_PAYCOL.has(col) || before?.conf === true || after?.conf === true;
  changes = changes.map((c) => ({ f: auField(col, c.f), ...(hide || auSens(c.f) ? { from: "", to: "changed (hidden)", hid: true } : { from: c.from, to: c.to, ...(c.list ? { list: true } : {}) }), ...(before === undefined ? { nb: true } : {}) }));
  auPush({ act, path, col, label: auLabel(col, id, after || before), ...(changes.length ? { changes } : {}) });
}
function auPush(it) {
  if (!auOn()) return;
  AU.buf.push({ at: new Date().toISOString(), ...auPage(), ...(S.auSys ? { pageL: `${S.auSys} (done by the app)`, auto: true } : {}), ...it });
  clearTimeout(AU.t); AU.t = setTimeout(auFlush, 1500);
}
async function auFlush() {
  if (!AU.raw || !AU.buf.length || AU.busy || AU.fails > 3) return; AU.busy = true;
  const day = todayISO(); const keep = { doc: AU.doc, id: AU.id, n: AU.n };
  if (!AU.doc || AU.doc.date !== day || AU.doc.items.length >= 400) {
    AU.n = AU.doc && AU.doc.date === day ? AU.n + 1 : 0;
    AU.id = `${day}--${String(S.myId || "anon").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}--${AU.sess}${AU.n ? "-" + AU.n : ""}`;
    AU.doc = { date: day, uid: S.myId || null, name: auMe(), role: (() => { try { const r = myRole(); return S.isOwner || r.ownerRole ? "owner" : r.key; } catch { return ""; } })(), sess: AU.sess, started: new Date().toISOString(), items: [] };
  }
  const take = AU.buf.splice(0, 400 - AU.doc.items.length); const doc = { ...AU.doc, name: auMe() || AU.doc.name, items: [...AU.doc.items, ...take] };
  try { await AU.raw.doc(`audit/${AU.id}`).set(doc); AU.doc = doc; AU.fails = 0; if (AU.data.size || AU.key) { AU.data.set(AU.id, { id: AU.id, ...doc }); if (AU_VIEWS.has(S.view?.name)) refresh(); } }
  catch { AU.buf.unshift(...take); Object.assign(AU, keep); AU.fails++; }
  finally { AU.busy = false; if (AU.buf.length && AU.fails <= 3) { clearTimeout(AU.t); AU.t = setTimeout(auFlush, 1500 * (AU.fails + 1)); } }
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") auFlush(); });
addEventListener("pagehide", () => auFlush());

/* The recorder: wraps the database after the confidential-pay wrapper, so it sees the real paths. */
function auRef(ref, path) {
  const p = String(path);
  const before = async () => { if (AU.inflight > 8) return undefined; AU.inflight++;
    try { return await Promise.race([ref.get().then((d) => (d.exists ? d.data() : null)), new Promise((r) => setTimeout(() => r(undefined), 700))]); } catch { return undefined; } finally { AU.inflight--; } };
  const W = {};
  for (const kind of ["set", "update", "delete"]) W[kind] = async (v, ...rest) => {
    if (!auOn() || auSkip(p)) return ref[kind](v, ...rest);
    const b = await before(); const r = await ref[kind](v, ...rest);
    try { auRecord(kind, p, b, v, rest[0]); } catch {}
    return r;
  };
  return new Proxy({}, { get: (t, k) => (k in W ? W[k] : typeof ref[k] === "function" ? ref[k].bind(ref) : ref[k]) });
}
{ const prev = S.wrapDb; S.wrapDb = (raw) => {
  const db = prev ? prev(raw) : raw; if (!db) return db; AU.raw = db;
  return new Proxy({}, { get: (t, k) => { if (k === "doc") return (p) => auRef(db.doc(p), p); const v = db[k]; return typeof v === "function" ? v.bind(db) : v; } });
}; }
// "Opened the app" once per visit, and every file downloaded from the app.
{ const b = applyPerm; applyPerm = (...a) => { const r = b(...a);
  if (S.perm && Array.isArray(S.perm.mods)) S.perm.mods = auOk() ? [...new Set([...S.perm.mods, "Audit Trail"])] : S.perm.mods.filter((g) => g !== "Audit Trail");
  if (!AU.opened && S.realEdit && !S.selfMode && S.myId) { AU.opened = true; auPush({ act: "open", path: "", col: "", label: "Opened the HR app", page: "", pageL: "", mod: "" }); }
  if (S.downloads && !S.downloads.__au) { const d = S.downloads; S.downloads = { __au: true, save: async (o) => { const res = await d.save(o); auPush({ act: "download", path: "", col: "", label: String(o?.filename || "a file") }); return res; } }; }
  return r; }; }
{ const b = viewAllowed; viewAllowed = function (name, ...x) { if (AU_VIEWS.has(name)) return auOk() && (name !== "audsrv" || !!window.__hosted); return b(name, ...x); }; }

/* Menu: Audit Trail, just before Users & Permissions. */
{ const i = NAV.findIndex(([g]) => g === "Users & Permissions");
  NAV.splice(i < 0 ? NAV.length : i, 0, ["Audit Trail", [["audtrail", "Audit log", "audit"], ["audsum", "Summary & alerts", "chart"], ...(window.__hosted ? [["audsrv", "Server record", "shield"]] : [])]]);
  MOD_ICON["Audit Trail"] = "audit"; Object.assign(SECTION_OF, { audtrail: "audtrail", audsum: "audsum", audsrv: "audsrv" });
  if (typeof HRD_PERM !== "undefined") HRD_PERM.audtrail = HRD_PERM.audsum = HRD_PERM.audsrv = "Records"; }

/* Loading: the log is read when the page opens, for the chosen dates. */
async function auLoad(force) {
  const F = S.auF; const key = `${F.from}|${F.to}`; if (AU.loading || (!force && AU.key === key)) return;
  AU.loading = true; await auFlush();
  try { const snap = await S.db.collection("audit").where("date", ">=", F.from).where("date", "<=", F.to).limit(3000).get();
    AU.data = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); AU.key = key; AU.err = ""; }
  catch { AU.err = "Couldn't read the audit log. Reload the page and try again."; AU.key = key; }
  AU.loading = false; if (AU_VIEWS.has(S.view?.name)) render();
}
function auRows() {
  const F = S.auF; const q = F.q.trim().toLowerCase(); const out = [];
  const docs = [...AU.data.values()]; if (AU.doc && !AU.data.has(AU.id) && AU.doc.date >= F.from && AU.doc.date <= F.to) docs.push({ id: AU.id, ...AU.doc });
  for (const d of docs) (d.items || []).forEach((it, i) => out.push({ ...it, key: `${d.id}:${i}`, uid: d.uid, who: auWho(d.uid, d.name), role: d.role || "" }));
  for (const it of AU.buf) out.push({ ...it, key: `buf:${it.at}`, uid: S.myId, who: auWho(S.myId, auMe()), role: "" });
  return out.filter((r) => (!F.who || r.uid === F.who) && (!F.act || r.act === F.act) && (!F.mod || (r.mod || "Other") === F.mod)
    && (!q || `${r.who} ${r.label} ${r.pageL} ${r.mod} ${AU_COL[r.col] || r.col} ${(r.changes || []).map((c) => `${c.f} ${c.from} ${c.to}`).join(" ")}`.toLowerCase().includes(q)))
    .sort((a, b) => b.at.localeCompare(a.at));
}
const auWhen = (at) => `${fmtDate(manilaDay(at))}<div class="t-muted" style="font-size:12px">${esc(timeFmt.format(new Date(at)))}</div>`;
const auChip = (a) => `<span class="chip ${AU_ACT[a]?.[1] || "c-gray"}">${esc(AU_ACT[a]?.[0] || a)}</span>`;
function auChanges(r) {
  const ch = r.changes || []; if (!ch.length) return r.act === "delete" ? '<span class="t-muted">Whole record removed</span>' : r.act === "create" ? '<span class="t-muted">New record</span>' : "";
  const open = S.auX.has(r.key); const show = open ? ch : ch.slice(0, 3);
  return `<ul class="au-ch">${show.map((c) => `<li><b>${esc(c.f)}</b>: ${c.hid ? `<span class="chip c-gray">${icon("lock", 12)}changed (hidden)</span>` : c.list || c.nb ? esc(c.to || "blank") : `<span class="t-muted">${esc(c.from || "blank")}</span> → ${esc(c.to || "blank")}`}</li>`).join("")}</ul>${ch.length > 3 ? `<button class="link au-more" data-au-x="${esc(r.key)}">${open ? "Show less" : `Show all ${ch.length} changes`}</button>` : ""}`;
}
function auFilters(withAct = true) {
  const F = S.auF; const all = auRowsAll();
  const people = [...new Map(all.filter((r) => r.uid).map((r) => [r.uid, r.who])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const mods = [...new Set(all.map((r) => r.mod || "Other"))].sort();
  return `<section class="card au-filters">
    <label class="au-f"><span>From</span><input class="input" type="date" id="au-from" value="${esc(F.from)}" max="${todayISO()}"></label>
    <label class="au-f"><span>To</span><input class="input" type="date" id="au-to" value="${esc(F.to)}" max="${todayISO()}"></label>
    <div class="au-quick">${[["0", "Today"], ["6", "7 days"], ["29", "30 days"], ["89", "90 days"]].map(([n, l]) => `<button class="btn btn-ghost btn-sm" data-au-range="${n}">${l}</button>`).join("")}</div>
    <label class="au-f"><span>Person</span><select class="input" id="au-who">${opts(people, F.who, "Everyone")}</select></label>
    ${withAct ? `<label class="au-f"><span>Action</span><select class="input" id="au-act">${opts(Object.entries(AU_ACT).map(([k, v]) => [k, v[0]]), F.act, "All actions")}</select></label>
    <label class="au-f"><span>Module</span><select class="input" id="au-mod">${opts(mods.map((m) => [m, GL(m)]), F.mod, "All modules")}</select></label>
    <label class="au-f au-q"><span>Search</span><input class="input" type="search" id="au-q" value="${esc(F.q)}" placeholder="Name, record, field or value"></label>` : ""}
  </section>`;
}
function auRowsAll() { const F = S.auF; const keep = { ...F }; Object.assign(F, { who: "", act: "", mod: "", q: "" }); try { return auRows(); } finally { Object.assign(F, keep); } }
const auNote = () => `<p class="t-muted au-note">Recording started on 14 Oct 2026, so earlier changes aren't here. Older 201 file changes are in the <button class="link" data-go="audit">Employee change log</button>. Pay, bank and government numbers are never copied into this log.</p>`;
const auState = () => AU.loading ? `<section class="card"><p class="t-muted" style="margin:0">Reading the audit log…</p></section>` : AU.err ? `<section class="card"><p style="margin:0">${esc(AU.err)}</p></section>` : "";

VIEWS.audtrail = () => {
  if (AU.key !== `${S.auF.from}|${S.auF.to}`) setTimeout(() => auLoad(), 0);
  const rows = auRows(); const shown = rows.slice(0, S.auShow);
  return head("Audit Trail", "Audit log", `<button class="btn btn-ghost" data-au-reload>${icon("back", 16)}Refresh</button><button class="btn btn-primary" data-au-csv ${rows.length ? "" : "disabled"}>${icon("file", 16)}Download (Excel)</button>`) + auNote() + auFilters() + auState() + `
    <section class="card"><div class="card-head"><h2>${rows.length} ${rows.length === 1 ? "entry" : "entries"}</h2><span class="t-muted" style="font-size:13px">${fmtDate(S.auF.from)} to ${fmtDate(S.auF.to)}</span></div>
    ${rows.length ? `<div class="table-wrap"><table class="au-t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Page</th><th>What changed</th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td style="white-space:nowrap">${auWhen(r.at)}</td><td><b>${esc(r.who)}</b></td><td>${auChip(r.act)}</td>
        <td>${esc(r.label || "")}${r.col ? `<div class="t-muted" style="font-size:12px">${esc(AU_COL[r.col] || r.col)}</div>` : ""}</td>
        <td>${r.pageL ? `${r.page && navKeys().some((k) => k.v === r.page) && viewAllowed(r.page) ? `<button class="link" data-go="${esc(r.page)}">${esc(r.pageL)}</button>` : esc(r.pageL)}<div class="t-muted" style="font-size:12px">${esc(GL(r.mod || ""))}</div>` : '<span class="t-muted">—</span>'}</td>
        <td>${auChanges(r)}</td></tr>`).join("")}</tbody></table></div>
      ${rows.length > shown.length ? `<p style="margin:12px 0 0"><button class="btn btn-ghost btn-sm" data-au-more>Show 200 more</button> <span class="t-muted" style="font-size:13px">Showing ${shown.length} of ${rows.length}</span></p>` : ""}`
      : AU.loading ? "" : `<div class="empty-state"><span class="es-ic">${icon("audit", 22)}</span><p>Nothing recorded for these dates and filters.</p></div>`}</section>`;
};

VIEWS.audsum = () => {
  if (AU.key !== `${S.auF.from}|${S.auF.to}`) setTimeout(() => auLoad(), 0);
  const rows = auRows(); const cnt = (a) => rows.filter((r) => r.act === a).length;
  const by = (keyOf) => { const m = new Map(); for (const r of rows) { const k = keyOf(r); const o = m.get(k) || { k, n: 0, create: 0, update: 0, delete: 0, open: 0, download: 0, last: "" }; o.n++; o[r.act] = (o[r.act] || 0) + 1; if (r.at > o.last) o.last = r.at; m.set(k, o); } return [...m.values()].sort((a, b) => b.n - a.n); };
  const people = by((r) => r.uid || "?").map((o) => ({ ...o, name: rows.find((r) => (r.uid || "?") === o.k)?.who || "Someone", role: rows.find((r) => (r.uid || "?") === o.k && r.role)?.role || "" }));
  const mods = by((r) => r.mod || "Other").filter((o) => o.k);
  const alerts = rows.filter((r) => r.act === "delete" || r.path === "org/access" || r.act === "download" || (r.changes || []).some((c) => c.hid)).slice(0, 40);
  const why = (r) => r.act === "delete" ? "Record deleted" : r.path === "org/access" ? "Users or permissions changed" : r.act === "download" ? "File downloaded" : "Pay or bank details changed";
  const recs = new Set(rows.filter((r) => r.path).map((r) => r.path)).size;
  const roleName = (k) => ROLES?.[k]?.name || k || "";
  const num = (n) => (n ? String(n) : '<span class="t-muted">0</span>');
  return head("Audit Trail", "Summary & alerts", `<button class="btn btn-ghost" data-go="audtrail">${icon("audit", 16)}Open the full log</button>`) + auNote() + auFilters(false) + auState() + `
    <section class="stats">
      <div class="card stat"><span class="label">Actions recorded</span><span class="value">${rows.length}</span></div>
      <div class="card stat"><span class="label">People active</span><span class="value">${people.length}</span></div>
      <div class="card stat"><span class="label">Records touched</span><span class="value">${recs}</span></div>
      <button class="card stat kpi-btn" data-au-jump="delete"><span class="label">Deletions</span><span class="value">${cnt("delete")}</span></button>
      <button class="card stat kpi-btn" data-au-jump="download"><span class="label">Downloads</span><span class="value">${cnt("download")}</span></button>
    </section>
    <section class="card"><div class="card-head"><h2>Needs a look</h2><span class="t-muted" style="font-size:13px">Deletions, permission changes, downloads and pay or bank changes</span></div>
      ${alerts.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th></tr></thead><tbody>
      ${alerts.map((r) => `<tr><td style="white-space:nowrap">${auWhen(r.at)}</td><td><b>${esc(r.who)}</b></td><td>${auChip(r.act)} <span style="font-size:13px">${esc(why(r))}</span></td><td>${esc(r.label || "")}${r.col ? `<div class="t-muted" style="font-size:12px">${esc(AU_COL[r.col] || r.col)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="t-muted" style="margin:0">Nothing to look at for these dates.</p>'}</section>
    <section class="card"><div class="card-head"><h2>By person</h2></div>
      ${people.length ? `<div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th class="num">Opened</th><th class="num">Added</th><th class="num">Changed</th><th class="num">Deleted</th><th class="num">Downloads</th><th>Last action</th></tr></thead><tbody>
      ${people.map((o) => `<tr><td><button class="link" data-au-who="${esc(o.k)}"><b>${esc(o.name)}</b></button></td><td class="t-muted">${esc(roleName(o.role))}</td><td class="num">${num(o.open)}</td><td class="num">${num(o.create)}</td><td class="num">${num(o.update)}</td><td class="num">${num(o.delete)}</td><td class="num">${num(o.download)}</td><td style="white-space:nowrap">${auWhen(o.last)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No one has used the app on these dates.</p>'}</section>
    <section class="card"><div class="card-head"><h2>By module</h2></div>
      ${mods.length ? `<div class="table-wrap"><table><thead><tr><th>Module</th><th class="num">Added</th><th class="num">Changed</th><th class="num">Deleted</th><th class="num">Downloads</th><th>Last action</th></tr></thead><tbody>
      ${mods.map((o) => `<tr><td><button class="link" data-au-mod="${esc(o.k)}"><b>${esc(GL(o.k))}</b></button></td><td class="num">${num(o.create)}</td><td class="num">${num(o.update)}</td><td class="num">${num(o.delete)}</td><td class="num">${num(o.download)}</td><td style="white-space:nowrap">${auWhen(o.last)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Nothing recorded yet.</p>'}</section>`;
};

/* Website only: the database's own record of every save, written by the server, which no one in the app can edit or delete. */
async function auSrvLoad(force) {
  const F = S.auF; const key = `${F.from}|${F.to}`; if (!window.__sb || AU.loading || (!force && AU.srvKey === key)) return; AU.loading = true;
  try { const { data, error } = await window.__sb.rpc("hr_audit_list", { p_from: F.from, p_to: F.to }); if (error) throw error; AU.srv = data || []; AU.srvErr = ""; }
  catch { AU.srv = null; AU.srvErr = "The server record isn't switched on yet. It starts once the audit update is applied to the website's database."; }
  AU.srvKey = key; AU.loading = false; if (S.view?.name === "audsrv") render();
}
VIEWS.audsrv = () => {
  if (AU.srvKey !== `${S.auF.from}|${S.auF.to}`) setTimeout(() => auSrvLoad(), 0);
  const F = S.auF; const list = (AU.srv || []).filter((r) => !F.who || r.uid === F.who);
  const op = { INSERT: "create", UPDATE: "update", DELETE: "delete" };
  const what = (p) => { const [c, id] = String(p).split("/"); return { col: AU_COL[c] || c, label: id ? auLabel(c, id, null) : p }; };
  return head("Audit Trail", "Server record", `<button class="btn btn-ghost" data-au-srv>${icon("back", 16)}Refresh</button>`) + `
    <p class="t-muted au-note">The website's database writes this list itself, for every save from any screen, phone or tool. Nobody can change or delete it from the app. It shows who and which fields, not the values. Use the <button class="link" data-go="audtrail">Audit log</button> for the before and after.</p>
    ${auFilters(false)}${AU.loading ? auState() : ""}
    <section class="card">${AU.srvErr ? `<p style="margin:0">${esc(AU.srvErr)}</p>` : list.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Fields</th></tr></thead><tbody>
      ${list.slice(0, 500).map((r) => { const w = what(r.path); return `<tr><td style="white-space:nowrap">${auWhen(r.at)}</td><td><b>${esc(r.uid ? auWho(r.uid, r.name) : "System")}</b></td><td>${auChip(op[r.op] || r.op)}</td><td>${esc(w.label)}<div class="t-muted" style="font-size:12px">${esc(w.col)}</div></td><td style="font-size:13px">${esc((r.keys || []).slice(0, 12).map((k) => auWords(k).join(" ")).join(", "))}${(r.keys || []).length > 12 ? "…" : ""}</td></tr>`; }).join("")}</tbody></table></div>${list.length > 500 ? `<p class="t-muted" style="margin:10px 0 0;font-size:13px">Showing the latest 500 of ${list.length}. Pick fewer days to see the rest.</p>` : ""}`
      : AU.loading ? "" : '<p class="t-muted" style="margin:0">Nothing recorded for these dates.</p>'}</section>`;
};

/* Events */
const auReload = () => { AU.key = ""; AU.srvKey = ""; S.auShow = 200; if (S.view?.name === "audsrv") auSrvLoad(true); else auLoad(true); render(); };
document.addEventListener("change", (ev) => {
  const t = ev.target; if (!t.id?.startsWith?.("au-")) return; const F = S.auF;
  if (t.id === "au-from" || t.id === "au-to") { const v = t.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; F[t.id === "au-from" ? "from" : "to"] = v; if (F.from > F.to) [F.from, F.to] = [F.to, F.from]; auReload(); return; }
  if (t.id === "au-who") F.who = t.value; else if (t.id === "au-act") F.act = t.value; else if (t.id === "au-mod") F.mod = t.value; else return;
  S.auShow = 200; render(); document.getElementById(t.id)?.focus();
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "au-q") return; S.auF.q = ev.target.value; S.auShow = 200; clearTimeout(AU.qt); AU.qt = setTimeout(() => render(), 250); });
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-au-x],[data-au-more],[data-au-range],[data-au-reload],[data-au-srv],[data-au-csv],[data-au-who],[data-au-mod],[data-au-jump]"); if (!t) return;
  const F = S.auF; const d = t.dataset;
  if (d.auX != null) { S.auX.has(d.auX) ? S.auX.delete(d.auX) : S.auX.add(d.auX); render(); document.querySelector(`[data-au-x="${CSS.escape(d.auX)}"]`)?.focus(); return; }
  if (d.auMore != null) { S.auShow += 200; render(); return; }
  if (d.auRange != null) { F.to = todayISO(); F.from = addDays(F.to, -Number(d.auRange)); auReload(); return; }
  if (d.auReload != null || d.auSrv != null) { auReload(); return; }
  if (d.auWho != null) { Object.assign(F, { who: d.auWho, act: "", mod: "", q: "" }); go("audtrail"); return; }
  if (d.auMod != null) { Object.assign(F, { who: "", act: "", mod: d.auMod, q: "" }); go("audtrail"); return; }
  if (d.auJump != null) { Object.assign(F, { who: "", act: d.auJump, mod: "", q: "" }); go("audtrail"); return; }
  if (d.auCsv != null) {
    const rows = auRows(); const out = [["Date", "Time", "Person", "Action", "Module", "Page", "Record", "Record type", "Field", "From", "To"]];
    for (const r of rows) { const base = [manilaDay(r.at), timeFmt.format(new Date(r.at)), r.who, AU_ACT[r.act]?.[0] || r.act, GL(r.mod || ""), r.pageL || "", r.label || "", AU_COL[r.col] || r.col || ""];
      if (r.changes?.length) for (const c of r.changes) out.push([...base, c.f, c.hid ? "" : c.from, c.hid ? "changed (hidden)" : c.to]); else out.push([...base, "", "", ""]); }
    offer(`Audit trail ${F.from} to ${F.to}.csv`, toCSV(out));
  }
});
{ const st = document.createElement("style"); st.textContent = `
.au-filters{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-end}
.au-f{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);min-width:140px}.au-f .input{width:auto;min-width:140px}
.au-q{flex:1;min-width:200px}.au-q .input{width:100%}
.au-quick{display:flex;gap:6px;flex-wrap:wrap}
.au-note{margin:0 0 14px;font-size:13px}
.au-ch{margin:0;padding-left:16px;font-size:13px;display:flex;flex-direction:column;gap:3px}.au-ch li{overflow-wrap:anywhere}
.au-more{font-size:12px;margin-top:4px}
.au-t td{vertical-align:top}.au-t .chip{white-space:nowrap}
@media (max-width:600px){.au-f,.au-f .input{min-width:0;width:100%}.au-f{flex:1 1 45%}}`; document.head.appendChild(st); }
// The log is read-only: no Excel import or attachments bar on its pages (it has its own Download button).
{ const b = ioBar; ioBar = (...a) => (AU_VIEWS.has(S.view?.name) ? "" : b(...a)); }
