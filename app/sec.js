/* ---------- Security audit #4 (2026-10-15): page-side guards. The database applies the same rules on the website. ---------- */
// Record ids and role keys end up inside the page, so anything that could break out of an attribute is never shown.
const SEC_BAD_ID = /[<>"'`&\\\u0000-\u001f]/;
const secOkId = (id) => typeof id === "string" && id.length > 0 && id.length <= 300 && !SEC_BAD_ID.test(id);
const SEC_ROLE_KEY = /^[a-z][a-z0-9_]{0,40}$/;
function secSnap(s) {
  if (!s || !Array.isArray(s.docs) || s.docs.every((d) => secOkId(d.id))) return s;
  const docs = s.docs.filter((d) => secOkId(d.id));
  return new Proxy(s, { get: (t, k) => {
    if (k === "docs") return docs; if (k === "size") return docs.length; if (k === "empty") return !docs.length;
    if (k === "forEach") return (f, th) => docs.forEach(f, th);
    if (k === "docChanges") return (...a) => (typeof t.docChanges === "function" ? t.docChanges(...a) : []).filter((c) => secOkId(c?.doc?.id));
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
}
function secQuery(q) {
  if (!q || typeof q !== "object") return q;
  return new Proxy(q, { get: (t, k) => {
    if (k === "onSnapshot") return (cb, ...r) => t.onSnapshot((s) => cb(secSnap(s)), ...r);
    if (k === "get") return async (...a) => secSnap(await t.get(...a));
    const v = t[k]; if (typeof v !== "function") return v;
    if (k === "doc" || k === "add") return v.bind(t);
    return (...a) => { const r = v.apply(t, a); return r && typeof r === "object" && typeof r.onSnapshot === "function" ? secQuery(r) : r; };
  } });
}
{ const prev = S.wrapDb; S.wrapDb = (raw) => {
  const db = prev ? prev(raw) : raw; if (!db) return db;
  return new Proxy({}, { get: (t, k) => { if (k === "collection") return (p) => secQuery(db.collection(p)); const v = db[k]; return typeof v === "function" ? v.bind(db) : v; } });
}; }

// Saved roles with odd keys are ignored.
{ const b = rlSync; rlSync = (...a) => { const r = b(...a); for (const k of Object.keys(ROLES)) if (!SEC_ROLE_KEY.test(k)) delete ROLES[k]; return r; }; }

// Executive is a top role too: only an Owner gives it.
RL_TOP.add("exec");

// Nobody becomes Owner or Executive through the default role. On the website the database gives View only instead.
{ const b = myRole; myRole = (...x) => { const a = S.access; const d = a?.defaultRole;
  if (!a || S.isOwner || !S.myId || a.users?.[S.myId]?.role || !(d === "owner" || d === "exec" || (window.__hosted && d === "admin"))) return b(...x);
  a.defaultRole = window.__hosted ? "viewer" : "admin"; try { return b(...x); } finally { a.defaultRole = d; } }; }

// Removing someone drops them to the default role. While that is a top role, only an Owner may remove people.
window.addEventListener("click", (ev) => { if (iAmOwner()) return; const t = ev.target.closest?.("[data-perm-del],[data-pu-del]"); if (!t) return;
  const d = S.access?.defaultRole || "admin"; if (RL_TOP.has(d)) { ev.preventDefault(); ev.stopImmediatePropagation(); toast("Only an Owner can remove people while the default role is " + (ROLES[d]?.name || "HR Manager") + "."); } }, true);

// Audit log: entries with a bad date or name are skipped instead of blanking the page.
{ let data = AU.data; Object.defineProperty(AU, "data", { configurable: true, enumerable: true, get: () => data, set: (m) => {
  if (m instanceof Map) for (const [k, d] of m) { if (!d || typeof d !== "object") { m.delete(k); continue; }
    if (d.name != null && typeof d.name !== "string") d.name = String(d.name); if (d.role != null && typeof d.role !== "string") d.role = "";
    d.items = Array.isArray(d.items) ? d.items.filter((it) => it && typeof it.at === "string" && !Number.isNaN(Date.parse(it.at))) : []; }
  data = m; } }); AU.data = data; }
