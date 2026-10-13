/* ---------- Confidential payroll (Glenn 2026-10-13): only Owners and Executives see or enter the pay of employees marked Confidential. ---------- */
// The amounts of a confidential employee are kept apart under conf/<collection>--<id>; the rest of the record stays where it was,
// so HR still keeps their 201 file, leave and attendance. Owners and Executives get the two put back together when they load.
// On the website the database itself refuses conf/ to everyone else (supabase/migrations/20261013_hr_confidential_pay.sql);
// on claude.ai it is hidden on screen only.
const CF_EMP = ["basicPay", "allow", "hdmfVol", "prev", "bank", "bankAcct"];
const CF_ROW = ["bp", "comm", "adj", "adjN", "ded"];
const CF_REC = new Set(["salinc", "paf", "flex", "fringe", "reimb", "loans", "loanposts"]);
const CF_MAP = { payruns: "lines", t13: "emps" };
const CF_COLS = new Set(["employees", "periods", "offboard", "empaudit", ...CF_REC, ...Object.keys(CF_MAP)]);
const CF_VIEWS = new Set(["payroll", "payslips", "payslip", "t13", "finalpays", "finalpay", "wageinc", "reimb", "loans", "loanposts", "flex", "flexForm", "fringeForm", "contrib", "tax", "thirteenth", "salinc", "paf"]);
const C = { emp: new Set(), store: new Map(), loaded: false, wait: null, started: false, live: new Set(), raw: null, lastT: {} };
// Owners and Executives, plus HR staff an Owner or Executive designated (org/access users[id].conf).
const cfTop = () => !!S.isOwner || ["owner", "exec"].includes(S.access?.users?.[S.myId]?.role);
const canConf = () => cfTop() || S.access?.users?.[S.myId]?.conf === true;
const cfCanAct = () => canConf() && !!S.realEdit;
const cfPath = (col, id) => `conf/${col}--${id}`;
const cfPick = (o, ks) => { const r = {}; for (const k of ks) if (o && o[k] !== undefined) r[k] = o[k]; return r; };
const cfOmit = (o, ks) => { const r = { ...(o || {}) }; for (const k of ks) delete r[k]; return r; };
const cfEmpty = (o) => !o || !Object.keys(o).length;
const cfPayHist = (h) => !!h && (/pay|salary|wage|allowance/i.test(h.kind || "") || /₱/.test(h.text || ""));
const cfPafPay = (r) => r && ((r.to && r.to.basicPay != null) || (r.from && r.from.basicPay != null));
const cfSum = (lines) => scopeTotals(lines || {}, Object.keys(lines || {}).map((id) => ({ id })));
const cfAddT = (a, b) => { if (!b) return a; if (!a) return b; const r = { ...a }; for (const [k, v] of Object.entries(b)) if (typeof v === "number") r[k] = PAY.r2((Number(r[k]) || 0) + v); return r; };
const cfClone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const cfDoc = (id, data) => ({ id, exists: data != null, data: () => (data == null ? undefined : cfClone(data)) });
const cfSnap = (docs) => ({ docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) });
const cfEmps = () => [...C.emp].map((id) => S.emps.get(id)).filter(Boolean).sort((a, b) => String(a.last).localeCompare(String(b.last)));
function cfNoAccess() { toast("This employee's pay is confidential. Only an Owner or Executive can enter it."); return new Error("confidential"); }

/* Load conf/ once an Owner or Executive is signed in. */
function cfStart() {
  if (C.started || !C.raw || !canConf()) return C.wait || Promise.resolve();
  C.started = true;
  C.wait = new Promise((res) => {
    C.raw.collection("conf").limit(5000).onSnapshot((s) => { C.store = new Map(s.docs.map((d) => ["conf/" + d.id, d.data()])); C.loaded = true; res(); cfKick(); },
      () => { C.loaded = true; res(); });
    setTimeout(res, 8000);
  });
  return C.wait;
}
const cfReady = () => (canConf() ? cfStart() : Promise.resolve());
function cfKick() { for (const f of C.live) { try { f(); } catch {} } S.ver++; refresh(); }
function cfSee(col, docs, whole) {
  if (col !== "employees") return;
  if (whole) C.emp = new Set(docs.filter((d) => d.data?.conf === true).map((d) => d.id));
  else for (const d of docs) { if (d.data?.conf === true) C.emp.add(d.id); else if (d.data) C.emp.delete(d.id); }
}

/* Owners and Executives: put the record back together. */
function cfMerge(col, id, d) {
  if (!canConf() || !d) return d;
  const c = C.store.get(cfPath(col, id));
  if (col === "employees") { if (!c) return d; const history = [...(d.history || []), ...(c.hist || [])].sort((a, b) => String(a.d || "").localeCompare(String(b.d || ""))); return { ...d, ...(c.f || {}), history }; }
  if (CF_MAP[col]) { if (!c) return d; const f = CF_MAP[col]; const out = { ...d, [f]: { ...(d[f] || {}), ...(c[f] || {}) } }; if (col === "payruns") out.totals = cfAddT(d.totals, c.totals); return out; }
  if (col === "periods") {
    let out = d; if (c?.rows) { const rows = { ...(d.rows || {}) }; for (const [k, v] of Object.entries(c.rows)) rows[k] = { ...(rows[k] || {}), ...v }; out = { ...out, rows }; }
    const run = C.store.get(cfPath("payruns", id)); if (run?.totals && d.totals && d.status === "FINAL") out = { ...out, totals: cfAddT(d.totals, run.totals) };
    return out;
  }
  if (col === "offboard") return c ? { ...d, ...(c.f || {}) } : d;
  return d;
}
const cfMatch = (data, w) => (w || []).every(([f, op, v]) => { const x = data?.[f]; return op === "==" ? x === v : op === "!=" ? x !== v : op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : op === ">=" ? x >= v : true; });
function cfDocs(col, raw, q) {
  const out = raw.map(({ id, data }) => ({ id, data: cfMerge(col, id, data) }));
  if (!canConf()) return out;
  const have = new Map(out.map((d, i) => [d.id, i])); const pre = `conf/${col}--`;
  for (const [p, data] of C.store) {
    if (!p.startsWith(pre)) continue; let id = p.slice(pre.length);
    if (col === "empaudit") id += "~c"; else if (!CF_REC.has(col) && col !== "payruns") continue;
    if (col === "payruns" && have.has(id)) continue;
    if (!cfMatch(data, q?.w)) continue;
    if (have.has(id)) out[have.get(id)] = { id, data }; else out.push({ id, data });
  }
  return out;
}

/* Writes: amounts of confidential employees go to conf/, the rest where it always went. */
async function cfRows(id, v) {
  if (!v?.rows) return v; const rows = {}; const mine = {};
  for (const [k, r] of Object.entries(v.rows)) { if (C.emp.has(k) && r && typeof r === "object") { const p = cfPick(r, CF_ROW); if (!cfEmpty(p)) mine[k] = p; rows[k] = cfOmit(r, CF_ROW); } else rows[k] = r; }
  if (!cfEmpty(mine)) {
    if (!canConf()) throw cfNoAccess();
    const path = cfPath("periods", id); const cur = C.store.get(path) || { rows: {} }; const next = { rows: { ...(cur.rows || {}) } };
    for (const [k, p] of Object.entries(mine)) next.rows[k] = { ...(next.rows[k] || {}), ...p };
    await C.raw.doc(path).set(next); C.store.set(path, next);
  }
  return { ...v, rows };
}
async function cfSet(ref, col, id, v) {
  const ok = canConf(); const cref = () => C.raw.doc(cfPath(col, id)); const path = cfPath(col, id);
  if (col === "employees") {
    const was = C.emp.has(id); v = { ...v };
    if (!ok) { if (was) v.conf = true; else delete v.conf; }
    if (v.conf !== true) {
      await ref.set(was && ok ? { ...v, conf: false } : v);
      if (was && ok) { C.emp.delete(id); await cref().delete().catch(() => {}); C.store.delete(path); }
      return;
    }
    const hist = Array.isArray(v.history) ? v.history : [];
    await ref.set({ ...cfOmit(v, CF_EMP), conf: true, history: hist.filter((h) => !cfPayHist(h)) }); C.emp.add(id);
    if (ok) { const c = { f: cfPick(v, CF_EMP), hist: hist.filter(cfPayHist) }; await cref().set(cfClone(c)); C.store.set(path, c); }
    return;
  }
  if (col === "periods") { const x = await cfRows(id, v); if (x.totals && C.lastT[id]) x.totals = C.lastT[id]; return ref.set(x); }
  if (CF_MAP[col]) {
    const f = CF_MAP[col]; const mine = {}, rest = {};
    for (const [k, x] of Object.entries(v?.[f] || {})) (C.emp.has(k) ? mine : rest)[k] = x;
    if (cfEmpty(mine)) return ref.set(v);
    if (!ok) return ref.set({ ...v, [f]: rest });
    const raw = { ...v, [f]: rest }; const c = { ...cfOmit(v, [f, "totals"]), [f]: mine };
    if (col === "payruns") { raw.totals = cfSum(rest); C.lastT[id] = raw.totals; c.totals = cfSum(mine); }
    else { const cur = C.store.get(path); if (cur?.[f]) c[f] = { ...cur[f], ...mine }; }
    await ref.set(raw); await cref().set(cfClone(c)); C.store.set(path, c); return;
  }
  if (col === "offboard") {
    if (!C.emp.has(id) || !("final" in (v || {}))) return ref.set(v);
    await ref.set(cfOmit(v, ["final"])); if (ok) { const c = { f: { final: v.final } }; await cref().set(cfClone(c)); C.store.set(path, c); } return;
  }
  if (col === "empaudit") {
    if (!C.emp.has(v?.empId)) return ref.set(v);
    const pay = (v.changes || []).filter((c) => CF_EMP.includes(c.f)); const rest = (v.changes || []).filter((c) => !CF_EMP.includes(c.f));
    if (rest.length) await ref.set({ ...v, changes: rest });
    if (pay.length && ok) { const c = { ...v, changes: pay }; await cref().set(cfClone(c)); C.store.set(path, c); }
    return;
  }
  if (CF_REC.has(col)) {
    const conf = C.emp.has(v?.empId) && (col !== "paf" || cfPafPay(v));
    if (!conf) { if (ok && C.store.has(path)) { await cref().delete().catch(() => {}); C.store.delete(path); } return ref.set(v); }
    if (!ok) throw cfNoAccess();
    await cref().set(cfClone(v)); C.store.set(path, cfClone(v)); await ref.delete().catch(() => {}); return;
  }
  return ref.set(v);
}
async function cfUpdate(ref, col, id, patch) {
  const ok = canConf(); const path = cfPath(col, id);
  if (col === "employees" && C.emp.has(id)) {
    const mine = cfPick(patch, CF_EMP); const p = cfOmit(patch, ok ? CF_EMP : [...CF_EMP, "conf"]);
    if (!cfEmpty(mine) && ok) { const cur = C.store.get(path) || { f: {}, hist: [] }; const next = { ...cur, f: { ...(cur.f || {}), ...mine } }; await C.raw.doc(path).set(cfClone(next)); C.store.set(path, next); }
    return cfEmpty(p) ? undefined : ref.update(p);
  }
  if (col === "periods") { const x = await cfRows(id, patch); if (x.totals && C.lastT[id]) x.totals = C.lastT[id]; return ref.update(x); }
  if (CF_REC.has(col) && ok && C.store.has(path)) { const next = { ...C.store.get(path), ...cfClone(patch) }; await C.raw.doc(path).set(next); C.store.set(path, next); return; }
  if (CF_MAP[col] && patch?.[CF_MAP[col]]) { const f = CF_MAP[col]; const rest = {}; for (const [k, x] of Object.entries(patch[f])) if (!C.emp.has(k)) rest[k] = x; return ref.update({ ...patch, [f]: rest }); }
  if (col === "offboard" && C.emp.has(id) && patch && "final" in patch) { if (ok) { const c = { f: { final: patch.final } }; await C.raw.doc(path).set(cfClone(c)); C.store.set(path, c); } const p = cfOmit(patch, ["final"]); return cfEmpty(p) ? undefined : ref.update(p); }
  return ref.update(patch);
}
async function cfDelete(ref, col, id) {
  const path = cfPath(col, id);
  await ref.delete().catch((e) => { if (!(CF_REC.has(col) && C.store.has(path))) throw e; });
  if (canConf() && C.store.has(path) && (CF_REC.has(col) || col === "payruns" || col === "offboard")) { await C.raw.doc(path).delete().catch(() => {}); C.store.delete(path); }
}

/* The database handed to the app: only the collections above are touched. */
function cfQuery(rq, col, q) {
  const o = {
    where: (f, op, v) => cfQuery(rq.where(f, op, v), col, { ...q, w: [...q.w, [f, op, v]] }),
    orderBy: (...a) => cfQuery(rq.orderBy(...a), col, { ...q, o: true }),
    limit: (n) => cfQuery(rq.limit(n), col, q),
    get: async () => { const s = await rq.get(); const raw = s.docs.map((d) => ({ id: d.id, data: d.data() })); cfSee(col, raw, !q.w.length); await cfReady(); return cfSnap(cfDocs(col, raw, q).map((d) => cfDoc(d.id, d.data))); },
    onSnapshot: (cb, err) => {
      let last = null; const emit = () => { if (last) cb(cfSnap(cfDocs(col, last, q).map((d) => cfDoc(d.id, d.data)))); };
      C.live.add(emit);
      const un = rq.onSnapshot((s) => { last = s.docs.map((d) => ({ id: d.id, data: d.data() })); cfSee(col, last, !q.w.length); emit(); }, err);
      return () => { C.live.delete(emit); if (typeof un === "function") un(); };
    },
  };
  return new Proxy(o, { get: (t, k) => (k in t ? t[k] : typeof rq[k] === "function" ? rq[k].bind(rq) : rq[k]) });
}
function cfRef(ref, col, id) {
  const read = async (s) => {
    const d = s.exists ? s.data() : null; if (col === "employees" && d) cfSee(col, [{ id, data: d }], false); await cfReady();
    if (canConf() && (CF_REC.has(col) || col === "payruns") && C.store.has(cfPath(col, id)) && (CF_REC.has(col) || !d)) return cfDoc(id, C.store.get(cfPath(col, id)));
    return cfDoc(id, d ? cfMerge(col, id, d) : null);
  };
  const o = {
    id, path: `${col}/${id}`,
    get: async () => read(await ref.get()),
    set: (v) => cfSet(ref, col, id, v),
    update: (v) => cfUpdate(ref, col, id, v),
    delete: () => cfDelete(ref, col, id),
    onSnapshot: (cb, err) => { let last = null; const emit = async () => { if (last) cb(await read(last)); }; C.live.add(emit); const un = ref.onSnapshot((s) => { last = s; emit(); }, err); return () => { C.live.delete(emit); if (typeof un === "function") un(); }; },
  };
  return new Proxy(o, { get: (t, k) => (k in t ? t[k] : typeof ref[k] === "function" ? ref[k].bind(ref) : ref[k]) });
}
S.wrapDb = (raw) => {
  if (!raw) return raw; C.raw = raw;
  const two = (p) => { const s = String(p).split("/"); return s.length === 2 && CF_COLS.has(s[0]) ? s : null; };
  return new Proxy({}, { get: (t, k) => {
    if (k === "doc") return (p) => { const s = two(p); const r = raw.doc(p); return s ? cfRef(r, s[0], s[1]) : r; };
    if (k === "collection") return (p) => { const r = raw.collection(p); return CF_COLS.has(String(p)) ? cfQuery(r, String(p), { w: [] }) : r; };
    const v = raw[k]; return typeof v === "function" ? v.bind(raw) : v;
  } });
};

/* Who can do what. Executives on View only can still enter and run confidential pay. */
const cfEditCtx = () => { if (!S.realEdit || !S.view || !canConf()) return false; const v = S.view; if (v.name === "confpay") return true; const id = v.id || v.emp; return !!id && C.emp.has(id); };
{ let ce = S.canEdit; Object.defineProperty(S, "canEdit", { configurable: true, enumerable: true, get: () => ce || cfEditCtx(), set: (v) => { ce = v; } }); }
{ const b = applyPerm; applyPerm = (...a) => { const r = b(...a); if (canConf()) cfStart(); return r; }; }

/* Payroll runs: HR and Payroll staff run everyone else; Owners and Executives see everyone. */
{ const b = PAY.run; PAY.run = (emps, ...r) => b(canConf() || !C.emp.size ? emps : emps.filter((e) => !C.emp.has(e.id)), ...r); }
function cfLive(id) { const list = cfEmps(); if (!list.length) return { lines: {}, totals: null }; return PAY.run(list, PAY.period(id), periodDoc(id).rows || {}, SET(), allLeaves(), payExt(id)); }
function cfRun(id) { const d = C.store.get(cfPath("payruns", id)); if (d?.lines) return { ...d, final: true }; const x = cfLive(id); return { lines: x.lines, totals: x.totals, final: false }; }
const cfMemo = new Map();
{ const b = payrun; payrun = (id) => {
  const r = b(id); if (!canConf() || !C.emp.size) return r;
  const key = id + ":" + S.ver + ":" + C.store.size; if (cfMemo.has(key)) return cfMemo.get(key); if (cfMemo.size > 40) cfMemo.clear();
  const c = cfRun(id); const lines = { ...r.lines }; let totals = r.totals; let add = null;
  for (const [k, l] of Object.entries(c.lines || {})) { if (r.final && r.lines?.[k] && c.final) continue; lines[k] = l; add = add || {}; add[k] = l; }
  if (add && !r.final) { totals = cfAddT(cfSum(Object.fromEntries(Object.entries(r.lines || {}).filter(([k]) => !C.emp.has(k)))), cfSum(Object.fromEntries(Object.entries(lines).filter(([k]) => C.emp.has(k))))); }
  else if (add) totals = cfAddT(r.totals, cfSum(add));
  const out = { ...r, lines, totals }; cfMemo.set(key, out); return out; }; }
{ const b = finalizePayroll; finalizePayroll = async (...a) => { S.cfCtx = canConf() && C.emp.size > 0; try { return await b(...a); } finally { S.cfCtx = false; } }; }
{ const b = logActivity; logActivity = (text, ...r) => {
  if (C.emp.size && typeof text === "string" && /₱/.test(text)) { const names = cfEmps().map(fullName); if (S.cfCtx || names.some((n) => text.includes(n))) text = text.replace(/₱\s?[\d,]+(\.\d+)?/g, "(amount kept confidential)"); }
  return b(text, ...r); }; }
// Employees' phones never carry confidential payslips: the summary is readable by HR.
{ const b = buildSummary; buildSummary = (e) => { const s = b(e); return e?.conf ? { ...s, slips: [], t13: null, loans: [], reqs: (s.reqs || []).filter((x) => !/₱/.test(x.what || "")), confPay: true } : s; }; }

/* Screens for HR and Payroll staff: confidential people are left out of pay pages, and their amounts read Confidential. */
const cfPayView = (n) => { n = String(n || "").replace(/_(ho|prj)$/, ""); return CF_VIEWS.has(n) || CF_VIEWS.has(SECTION_OF[n] || ""); };
const cfLock = (txt) => `<span class="chip c-gray cf-lock">${icon("lock", 13)}${txt || "Confidential"}</span>`;
{ const b = render; render = (...a) => {
  const n = S.view?.name; const hide = !canConf() && C.emp.size > 0 && cfPayView(n) && !S.selfMode && S.viewAs !== "emp";
  if (!hide) { const r = b(...a); cfAfter(false); return r; }
  const all = S.emps; S.emps = new Map([...all].filter(([id]) => !C.emp.has(id)));
  try { return b(...a); } finally { S.emps = all; cfAfter(true); } }; }
function cfAfter(hidden) {
  const main = $("#main"); if (!main || S.selfMode) return; const n = S.view?.name;
  if (hidden && !main.querySelector(".cf-note")) {
    const hd = main.querySelector("header.head"); const k = C.emp.size;
    const html = `<div class="notice cf-note">${cfLock()}<span>${k} ${k === 1 ? "employee has" : "employees have"} confidential pay. An Owner or Executive handles their payroll, payslips, loans, 13th month and their lines in BIR and government remittances, so they aren't listed here.</span></div>`;
    if (hd) hd.insertAdjacentHTML("afterend", html); else main.insertAdjacentHTML("afterbegin", html);
  }
  const id = S.view?.id || S.view?.emp; if (!id || !C.emp.has(id)) return; const mine = canConf();
  if (n === "employee") {
    const h1 = main.querySelector("h1"); if (h1 && !main.querySelector(".cf-tag")) h1.insertAdjacentHTML("afterend", `<span class="chip c-gold cf-tag" title="Only Owners and Executives see this person's pay">${icon("lock", 13)}Confidential pay</span>`);
    if (!mine) {
      for (const dt of main.querySelectorAll("dt")) if (/^(Basic pay|Bank account)$/.test(dt.textContent.trim())) dt.nextElementSibling.innerHTML = cfLock();
      for (const h2 of main.querySelectorAll(".card-head h2")) if (/^Pay setup$/.test(h2.textContent.trim())) { const card = h2.closest(".card"); card.innerHTML = `<div class="card-head"><h2>Pay setup</h2>${cfLock()}</div><p class="t-muted" style="margin:0">This person's pay, allowances, loans, payslips and tax figures are confidential. Only an Owner or Executive can see or change them.</p>`; }
      main.querySelector("#mv-pay")?.closest(".field")?.remove();
    }
  }
  if (n === "employeeForm" && !mine) for (const k of ["basicPay", "bank", "bankAcct"]) { const i = main.querySelector("#ef-" + k); if (i) { i.value = ""; i.disabled = true; i.placeholder = "Confidential"; } }
}
{ const b = VIEWS.paySetup; VIEWS.paySetup = () => (C.emp.has(S.view.id) && !canConf() ? head("Pay setup", "Confidential") + `<section class="card"><p style="margin:0">This person's pay is confidential. Only an Owner or Executive can see or change it.</p></section>` : b()); }

/* Menu: Payroll > Confidential payroll, for Owners and Executives. */
Object.assign(ICON, { lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' });
SECTION_OF.confpay = "confpay";
{ const b = renderNav; renderNav = (...a) => { const r = b(...a); if (S.selfMode || S.viewAs === "emp" || !S.realEdit || !canConf()) return r;
  const nav = $("#nav"); if (!nav || nav.querySelector('[data-go="confpay"]')) return r;
  const after = nav.querySelector('[data-go="tax"]') || nav.querySelector('[data-go="contrib"]'); if (!after) return r;
  after.insertAdjacentHTML("afterend", `<button class="nav-item" data-go="confpay" ${S.view?.name === "confpay" ? 'aria-current="page"' : ""}>${icon("lock")}Confidential payroll</button>`); return r; }; }

/* The Confidential payroll page. */
S.cfAdd = "";
VIEWS.confpay = () => {
  if (!canConf()) return head("Payroll", "Confidential payroll") + `<section class="card"><div class="empty-state"><span class="es-ic">${icon("lock", 22)}</span><p>Only Owners, Executives and the HR staff they choose can open this page.</p></div></section>`;
  if (!C.loaded) { cfStart(); return head("Payroll", "Confidential payroll") + '<section class="card"><p class="t-muted" style="margin:0">Loading…</p></section>'; }
  const act = cfCanAct(); const list = cfEmps(); const id = S.periodId || curPeriod(); const p = PAY.period(id); const run = cfRun(id);
  const pids = []; for (let i = 1; i > -10; i--) pids.push(PAY.shiftPeriod(curPeriod(), i));
  const T = run.totals || cfSum(run.lines); const lines = list.filter((e) => run.lines?.[e.id]);
  const hrFinal = isFinal(id);
  const others = active().filter((e) => !C.emp.has(e.id)).sort((a, b) => String(a.last).localeCompare(String(b.last)));
  const ded = PAY.r2((T.gross || 0) - (T.net || 0));
  const month = p.start.slice(0, 7); const mids = [`${month}-1`, `${month}-2`].filter((x) => { try { return PAY.period(x).start; } catch { return false; } });
  const mruns = mids.map((x) => ({ x, r: cfRun(x) }));
  const gov = list.map((e) => { const o = { e, sss: 0, sssEr: 0, ec: 0, ph: 0, phEr: 0, hd: 0, hdEr: 0, tax: 0, gross: 0 }; for (const { r } of mruns) { const l = r.lines?.[e.id]; if (l) for (const k of Object.keys(o)) if (k !== "e") o[k] = PAY.r2(o[k] + (Number(l[k]) || 0)); } return o; }).filter((g) => g.gross || g.tax || g.sss);
  const gt = {}; for (const k of ["sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "tax"]) gt[k] = PAY.r2(gov.reduce((a, g) => a + g[k], 0));
  const mFinal = mruns.length && mruns.every(({ r }) => r.final);
  return head("Payroll", "Confidential payroll", `<button class="btn btn-ghost" data-cf-csv="register"${lines.length ? "" : " disabled"}>Download register (CSV)</button>`) + `
    <div class="notice">${cfLock("Owners, Executives and chosen staff only")}<span>Other HR and Payroll staff still see these people's 201 files, leave and attendance, but their pay, payslips, loans, 13th month and tax and contribution lines are hidden from them.${S.realEdit ? "" : " You can view only."}</span></div>
    <section class="card"><div class="card-head"><h2>People with confidential pay</h2><span class="chip c-gray">${list.length}</span></div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Position</th><th class="num">Basic pay</th><th></th></tr></thead><tbody>
        ${list.map((e) => `<tr><td>${empCell(e, e.no)}</td><td>${esc(pos(e.posId)?.title || "")}</td><td class="num">${esc(payLabel(e.basicPay, e.payType)) || '<span class="chip c-warn">Not set</span>'}</td>
          <td style="white-space:nowrap;text-align:right">${act ? `<button class="btn btn-ghost btn-sm" data-pay-setup="${e.id}">Pay setup</button> <button class="btn btn-ghost btn-sm" data-edit-emp="${e.id}">Edit 201 file</button> <button class="btn btn-ghost btn-sm" data-cf-off="${e.id}">Remove</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : '<p class="t-muted" style="margin:0">No one yet. Add the people whose pay should be confidential, for example executives and managers.</p>'}
      ${act ? `<form id="cf-add" class="stack" style="gap:8px;margin-top:14px"><div style="display:flex;gap:10px;flex-wrap:wrap"><select class="input" id="cf-emp" style="flex:1;min-width:220px" aria-label="Employee">${opts(others.map((e) => [e.id, `${fullName(e)} · ${pos(e.posId)?.title || e.no}`]), S.cfAdd, "Choose an employee")}</select><button class="btn btn-primary">Make pay confidential</button></div>
        <p class="t-muted" style="margin:0;font-size:13px">Their current pay, bank account, past payslips, loans and pay history move to the confidential side. Basic pay and bank account are set in their 201 file (Edit 201 file), and allowances in Pay setup.</p></form>` : ""}
    </section>
    ${cfWhoCard()}
    <section class="card"><div class="card-head"><h2>Payroll</h2><select class="input" style="width:auto" data-period-pick="1" aria-label="Pay period">${opts(pids.map((x) => [x, PAY.period(x).label]), id)}</select></div>
      <div class="chips" style="margin-bottom:12px">${run.final ? `<span class="chip c-ok">Confidential payroll final${run.at ? " · " + esc(fmtDate(run.at.slice(0, 10))) : ""}</span>` : '<span class="chip c-warn">Confidential payroll not final</span>'}<span class="chip ${hrFinal ? "c-ok" : "c-gray"}">HR payroll ${hrFinal ? "final" : "open"}</span></div>
      <section class="stats" style="margin:0 0 14px">
        <div class="card stat"><span class="label">Gross pay</span><span class="value" style="font-size:24px">${peso.format(T.gross || 0)}</span><span class="note t-muted">${lines.length} ${lines.length === 1 ? "person" : "people"}</span></div>
        <div class="card stat"><span class="label">Deductions</span><span class="value" style="font-size:24px">${peso.format(ded)}</span><span class="note t-muted">Tax ${peso.format(T.tax || 0)}</span></div>
        <div class="card stat"><span class="label">Net pay</span><span class="value" style="font-size:24px">${peso.format(T.net || 0)}</span></div>
        <div class="card stat"><span class="label">Employer share</span><span class="value" style="font-size:24px">${peso.format(T.employer || 0)}</span></div></section>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Days</th><th class="num">Gross</th><th class="num">SSS</th><th class="num">PhilHealth</th><th class="num">Pag-IBIG</th><th class="num">Tax</th><th class="num">Loans &amp; other</th><th class="num">Net pay</th></tr></thead><tbody>
        ${lines.map((e) => { const l = run.lines[e.id]; return `<tr class="go" data-slip="${e.id}" tabindex="0"><td>${esc(fullName(e))}<div class="t-muted" style="font-size:12px">${esc(e.no)}</div></td><td class="num">${PAY.r2(l.days)}</td><td class="num"><b>${money(l.gross)}</b></td><td class="num">${money(l.sss)}</td><td class="num">${money(l.ph)}</td><td class="num">${money(l.hd)}</td><td class="num">${money(l.tax)}</td><td class="num">${money((l.ded || 0) + (l.loanTot || 0))}</td><td class="num"><b>${money(l.net)}</b></td></tr>`; }).join("") || `<tr><td colspan="9" class="empty">No confidential pay for ${esc(p.label)}.</td></tr>`}
      </tbody></table></div>
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Select a row to open the payslip. Attendance, leave and approved overtime come from HR's records.</p>
      ${act ? (run.final ? `<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-ghost" data-cf-reopen="${id}">Reopen confidential payroll</button></div>`
        : lines.length ? `<div style="display:flex;gap:12px;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-top:12px"><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="cf-ok"> Time records are complete</label><button class="btn btn-primary" data-cf-final="${id}">Finalize confidential payroll</button></div>` : "") : ""}
    </section>
    ${list.length ? `<section class="card"><div class="card-head"><h2>Time sheet entries</h2><span class="t-muted" style="font-size:13px">${esc(p.label)}</span></div>${cfSheet(id, list, run, !act || run.final)}</section>` : ""}
    <section class="card"><div class="card-head"><h2>BIR and government remittances, ${esc(fmtMonth(month))}</h2><button class="btn btn-ghost btn-sm" data-cf-csv="gov"${gov.length ? "" : " disabled"}>Download (CSV)</button></div>
      ${mFinal ? "" : '<p style="margin:0 0 10px"><span class="chip c-warn">Includes a cutoff that is not final yet</span></p>'}
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">SSS (employee)</th><th class="num">SSS (employer)</th><th class="num">EC</th><th class="num">PhilHealth (employee)</th><th class="num">PhilHealth (employer)</th><th class="num">Pag-IBIG (employee)</th><th class="num">Pag-IBIG (employer)</th><th class="num">Tax withheld</th></tr></thead><tbody>
        ${gov.map((g) => `<tr><td>${esc(fullName(g.e))}</td>${["sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "tax"].map((k) => `<td class="num">${money(g[k])}</td>`).join("")}</tr>`).join("") || '<tr><td colspan="9" class="empty">Nothing for this month yet.</td></tr>'}
        ${gov.length ? `<tr><td><b>Add to HR's totals</b></td>${["sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "tax"].map((k) => `<td class="num"><b>${money(gt[k])}</b></td>`).join("")}</tr>` : ""}
      </tbody></table></div>
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">HR prepares the company's 1601-C and SSS, PhilHealth and Pag-IBIG payments without these people. Add the totals above before you file and pay. Payroll &gt; Tax &amp; BIR and Gov't Contributions show you the complete 2316, alphalist and remittance lists with these people included.</p>
    </section>`;
};
const fmtMonth = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-PH", { month: "long", year: "numeric" });
function cfSheet(id, list, run, lock) {
  const doc = periodDoc(id); const F = PAY.FIELDS;
  return `<div class="table-wrap"><table class="ts"><thead><tr><th>Employee</th><th class="num">Days paid</th>${F.map(([, l]) => `<th class="num">${l.replace(" (", "<br>(")}</th>`).join("")}</tr></thead><tbody>
    ${list.map((e) => { const r = doc.rows?.[e.id] || {}; const l = run.lines?.[e.id]; return `<tr><td style="white-space:nowrap">${esc(fullName(e))}</td><td class="num" id="tsd-${e.id}"><b>${l ? PAY.r2(l.days) : "—"}</b></td>
      ${F.map(([k, lab]) => `<td class="num">${lock ? (r[k] ? `<b>${r[k]}</b>` : '<span class="t-muted">0</span>') : `<input class="input cell" id="ts-${e.id}-${k}" data-ts="${e.id}:${k}" type="number" min="0" step="any" inputmode="decimal" value="${r[k] || ""}" placeholder="0" aria-label="${esc(lab)} for ${esc(fullName(e))}">`}</td>`).join("")}</tr>`; }).join("")}
  </tbody></table></div>`;
}

/* Marking and unmarking: move what is already on file. */
async function cfMark(e) {
  const id = e.id; const raw = C.raw; if (!raw || !cfCanAct()) return;
  await saveEmp({ ...e, conf: true }); C.emp.add(id); S.emps.set(id, { ...e, conf: true });
  for (const col of CF_REC) {
    const s = await raw.collection(col).where("empId", "==", id).get().catch(() => null);
    for (const d of s?.docs || []) { const v = d.data(); if (col === "paf" && !cfPafPay(v)) continue; const path = cfPath(col, d.id); await raw.doc(path).set(cfClone(v)); C.store.set(path, v); await raw.doc(`${col}/${d.id}`).delete().catch(() => {}); }
  }
  for (const [col, f] of Object.entries(CF_MAP)) {
    const s = await raw.collection(col).limit(2000).get().catch(() => null);
    for (const d of s?.docs || []) { const v = d.data(); const x = v?.[f]?.[id]; if (!x) continue;
      const path = cfPath(col, d.id); const cur = C.store.get(path) || { ...cfOmit(v, [f, "totals"]), [f]: {} }; const c = { ...cur, [f]: { ...(cur[f] || {}), [id]: x } };
      const rest = { ...v[f] }; delete rest[id]; const nv = { ...v, [f]: rest };
      if (col === "payruns") { c.totals = cfSum(c[f]); nv.totals = cfSum(rest); }
      await raw.doc(path).set(cfClone(c)); C.store.set(path, c); await raw.doc(`${col}/${d.id}`).set(cfClone(nv));
      if (col === "payruns") { const pd = await raw.doc(`periods/${d.id}`).get().catch(() => null); if (pd?.exists && pd.data().totals) await raw.doc(`periods/${d.id}`).update({ totals: nv.totals }).catch(() => {}); } }
  }
  { const s = await raw.collection("periods").limit(500).get().catch(() => null);
    for (const d of s?.docs || []) { const v = d.data(); const r = v?.rows?.[id]; const peso = cfPick(r, CF_ROW); if (cfEmpty(peso)) continue;
      const path = cfPath("periods", d.id); const cur = C.store.get(path) || { rows: {} }; const c = { rows: { ...(cur.rows || {}), [id]: { ...(cur.rows?.[id] || {}), ...peso } } };
      await raw.doc(path).set(c); C.store.set(path, c); await raw.doc(`periods/${d.id}`).set(cfClone({ ...v, rows: { ...v.rows, [id]: cfOmit(r, CF_ROW) } })); } }
  { const s = await raw.collection("empaudit").where("empId", "==", id).get().catch(() => null);
    for (const d of s?.docs || []) { const v = d.data(); const pay = (v.changes || []).filter((c) => CF_EMP.includes(c.f)); if (!pay.length) continue; const rest = (v.changes || []).filter((c) => !CF_EMP.includes(c.f));
      const path = cfPath("empaudit", d.id); await raw.doc(path).set(cfClone({ ...v, changes: pay })); C.store.set(path, { ...v, changes: pay });
      if (rest.length) await raw.doc(`empaudit/${d.id}`).set(cfClone({ ...v, changes: rest })); else await raw.doc(`empaudit/${d.id}`).delete().catch(() => {}); } }
  { const d = await raw.doc(`offboard/${id}`).get().catch(() => null); const v = d?.exists ? d.data() : null;
    if (v && "final" in v) { const path = cfPath("offboard", id); const c = { f: { final: v.final } }; await raw.doc(path).set(cfClone(c)); C.store.set(path, c); await raw.doc(`offboard/${id}`).set(cfClone(cfOmit(v, ["final"]))); } }
}
async function cfUnmark(e) { if (!cfCanAct()) return; await saveEmp({ ...e, conf: false }); C.emp.delete(e.id); S.emps.set(e.id, { ...e, conf: false }); }
function cfCsv(kind) {
  const id = S.periodId || curPeriod(); const p = PAY.period(id); const list = cfEmps();
  if (kind === "register") { const run = cfRun(id); return offer(`confidential-payroll-${id}.csv`, toCSV([["Employee No", "Name", "Pay type", "Rate", "Days", "Gross", "SSS", "PhilHealth", "Pag-IBIG", "Tax", "Loans & other", "Net pay", "Bank", "Account No", "Status"],
    ...list.filter((e) => run.lines?.[e.id]).map((e) => { const l = run.lines[e.id]; return [e.no, fullName(e), e.payType === "DAILY" ? "Daily" : "Monthly", e.basicPay || 0, l.days, l.gross, l.sss, l.ph, l.hd, l.tax, PAY.r2((l.ded || 0) + (l.loanTot || 0)), l.net, e.bank || "", e.bankAcct || "", run.final ? "Final" : "Draft"]; })])); }
  const month = p.start.slice(0, 7); const rows = [];
  for (const e of list) { const o = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (const x of [`${month}-1`, `${month}-2`]) { const l = cfRun(x).lines?.[e.id]; if (l) ["gross", "sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "tax"].forEach((k, i) => { o[i] = PAY.r2(o[i] + (Number(l[k]) || 0)); }); } if (o.some(Boolean)) rows.push([e.no, fullName(e), e.tin || "", e.sss || "", e.philhealth || "", e.pagibig || "", ...o]); }
  return offer(`confidential-remittances-${month}.csv`, toCSV([["Employee No", "Name", "TIN", "SSS No", "PhilHealth No", "Pag-IBIG No", "Gross", "SSS (employee)", "SSS (employer)", "EC", "PhilHealth (employee)", "PhilHealth (employer)", "Pag-IBIG (employee)", "Pag-IBIG (employer)", "Tax withheld"], ...rows]));
}
async function cfFinalize(id) {
  if (!$("#cf-ok")?.checked) { toast("Tick the box to confirm the time records are complete."); return; }
  const x = cfLive(id); if (cfEmpty(x.lines)) { toast("No confidential pay for this cutoff."); return; }
  const p = PAY.period(id); const at = new Date().toISOString(); const path = cfPath("payruns", id); const c = { start: p.start, end: p.end, at, lines: x.lines, totals: cfSum(x.lines) };
  await C.raw.doc(path).set(cfClone(c)); C.store.set(path, c); S.ver++;
  await recordLoanPayments(id, x.lines); await recordFlexPaid(id, x.lines);
  logActivity(`Finalized the confidential payroll for ${p.label}`); toast("Confidential payroll finalized."); render();
}
async function cfReopen(id) {
  if (!await askConfirm(`Reopen the confidential payroll for ${PAY.period(id).label}? Its loan payments are taken back until you finalize again.`, "Reopen")) return;
  const path = cfPath("payruns", id); await C.raw.doc(path).delete(); C.store.delete(path);
  for (const ln of listOf(S.loans)) if (C.emp.has(ln.empId) && ln.payments?.[id] != null) { const payments = { ...ln.payments }; delete payments[id]; await put("loans", { ...ln, payments, status: ln.status === "PAID" ? "ACTIVE" : ln.status, paidOff: ln.status === "PAID" ? null : ln.paidOff || null }); }
  for (const f of listOf(S.flex)) if (C.emp.has(f.empId) && f.payPid === id && f.status === "PAID") await put("flex", { ...f, status: "APPROVED", paid: null });
  S.ver++; logActivity(`Reopened the confidential payroll for ${PAY.period(id).label}`); toast("Confidential payroll reopened."); render();
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-cf-final],[data-cf-reopen],[data-cf-off],[data-cf-csv]"); if (!t) return; const d = t.dataset;
  if (d.cfCsv) { cfCsv(d.cfCsv); return; }
  if (!cfCanAct()) return;
  try {
    if (d.cfFinal) { t.disabled = true; await cfFinalize(d.cfFinal); return; }
    if (d.cfReopen) { await cfReopen(d.cfReopen); return; }
    if (d.cfOff) { const e = S.emps.get(d.cfOff); if (!e || !await askConfirm(`Make ${fullName(e)}'s pay visible to HR and Payroll again? From now on HR runs their payroll. Past confidential payslips and records stay confidential.`, "Make visible")) return;
      await cfUnmark(e); logActivity(`Made the pay of ${fullName(e)} visible to HR again`); toast("Done."); render(); }
  } catch (err) { if (err?.message !== "confidential") toast("Couldn't save. Try again."); t.disabled = false; }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "cf-add") return; ev.preventDefault(); if (!cfCanAct()) return;
  const e = S.emps.get($("#cf-emp").value); if (!e) { toast("Choose an employee."); return; }
  if (!await askConfirm(`Make ${fullName(e)}'s pay confidential? HR and Payroll staff will no longer see their pay, payslips, loans or tax lines, and you will run their payroll here.`, "Make confidential")) return;
  const btn = f.querySelector("button.btn-primary"); if (btn) { btn.disabled = true; btn.textContent = "Moving their pay records…"; }
  try { await cfMark(e); S.cfAdd = ""; logActivity(`Made the pay of ${fullName(e)} confidential`); toast(`${e.first}'s pay is now confidential.`); }
  catch { toast("Couldn't finish. Try again."); }
  S.ver++; render();
});
document.addEventListener("change", (ev) => { if (ev.target.id === "cf-emp") S.cfAdd = ev.target.value; });
// A confidential payslip is final once its own run is final, whatever HR's cutoff says.
const cfFinalAt = (start) => canConf() && [...C.store.entries()].some(([k, v]) => k.startsWith("conf/payruns--") && v?.start === start && v.lines);
{ const b = slipHTML; slipHTML = (e, l, p, final) => b(e, l, p, final || (C.emp.has(e?.id) && cfFinalAt(p?.start))); }
{ const b = cfAfter; cfAfter = (hidden) => { b(hidden); if (S.view?.name === "payslip" && C.emp.has(S.view.emp) && cfFinalAt(PAY.period(S.view.pid).start)) { const h1 = $("#main h1"); if (h1) h1.innerHTML = h1.innerHTML.replace(" · draft", ""); } }; }

/* Who may handle confidential pay: Owners and Executives always; they can add trusted HR staff. */
function cfWhoCard() {
  const a = S.access || {}; const users = a.users || {}; const P = S.profiles || {}; const top = cfTop() && S.realEdit;
  const nm = (id) => users[id]?.name || P[id]?.name || (id === S.myId ? "You" : "Someone");
  const auto = Object.keys(users).filter((id) => ["owner", "exec"].includes(users[id]?.role));
  const chosen = Object.keys(users).filter((id) => users[id]?.conf === true && !auto.includes(id));
  const pool = [...new Set([...Object.keys(users), ...Object.keys(a.seen || {})])].filter((id) => !auto.includes(id) && !chosen.includes(id) && id !== S.myId);
  const rn = (id) => ROLES[users[id]?.role || a.defaultRole || "admin"]?.name || "";
  return `<section class="card"><div class="card-head"><h2>Who can do confidential payroll</h2></div>
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">Owners and Executives always can. They can also choose HR staff to encode these people's salaries, allowances and bank details and run their payroll.</p>
    <div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
      ${S.isOwner && !auto.includes(S.myId) ? `<tr><td>${esc(nm(S.myId))}</td><td>Owner</td><td><span class="chip c-ok">Always</span></td><td></td></tr>` : ""}
      ${auto.map((id) => `<tr><td>${esc(nm(id))}</td><td>${esc(rn(id))}</td><td><span class="chip c-ok">Always</span></td><td></td></tr>`).join("")}
      ${chosen.map((id) => `<tr><td>${esc(nm(id))}</td><td>${esc(rn(id))}</td><td><span class="chip c-gold">Chosen</span></td><td style="text-align:right">${top ? `<button class="btn btn-ghost btn-sm" data-cf-who-off="${esc(id)}">Remove</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${top ? (pool.length ? `<form id="cf-who" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><select class="input" id="cf-who-id" style="flex:1;min-width:220px" aria-label="Staff member">${opts(pool.map((id) => [id, `${nm(id)}${rn(id) ? " · " + rn(id) : ""}`]), "", "Choose a staff member")}</select><button class="btn btn-primary">Give access</button></form>` : '<p class="t-muted" style="margin:12px 0 0;font-size:13px">Everyone else who uses the app is listed in Users &amp; permissions. Add them there first.</p>')
      : '<p class="t-muted" style="margin:12px 0 0;font-size:13px">Only an Owner or Executive can change this list.</p>'}
  </section>`;
}
async function cfWho(id, on) {
  if (!cfTop() || !S.realEdit || !id) return; const a = cfClone(S.access || {}); a.users = a.users || {};
  const u = { ...(a.users[id] || {}) }; if (on) u.conf = true; else delete u.conf; a.users[id] = u;
  await S.db.doc("org/access").set(a); S.access = a; applyPerm();
}
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "cf-who") return; ev.preventDefault(); const id = $("#cf-who-id").value; if (!id) { toast("Choose a staff member."); return; }
  try { await cfWho(id, true); logActivity("Gave someone access to confidential payroll"); toast("Access given."); } catch { toast("Couldn't save. Only an Owner or Executive can change this."); } render();
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-cf-who-off]"); if (!t) return;
  if (!await askConfirm("Remove this person's access to confidential payroll?", "Remove")) return;
  try { await cfWho(t.dataset.cfWhoOff, false); logActivity("Removed someone's access to confidential payroll"); toast("Access removed."); } catch { toast("Couldn't save. Only an Owner or Executive can change this."); } render();
});
