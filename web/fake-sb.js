// Test double for supabase-js used by the website build (in-memory, emulates hr_* RPCs and row rules).
(() => {
  const D = window.__D || {}; // path -> data
  const V = {}; for (const k in D) V[k] = 1;
  const U = window.__U; // { id, email, name, editor, owner } or null (signed out)
  let session = U ? { access_token: "tok", user: { id: U.id, email: U.email, user_metadata: { full_name: U.name, ...(U.dpa ? { dpa_v: U.dpa } : {}) } } } : null;
  const editors = new Set(window.__EDITORS || []); if (U?.editor) editors.add(U.id);
  const subs = []; window.__writes = [];
  const isEd = () => session && editors.has(session.user.id);
  const SU = window.__SIGNUPS || []; if (U && !SU.some((r) => r.user_id === U.id) && (U.access || "approved") !== "none") SU.push({ user_id: U.id, status: U.access || "approved", email: U.email, name: U.name, requested_at: new Date().toISOString() });
  const ok = () => isEd() || SU.some((r) => r.user_id === session?.user.id && r.status === "approved");
  const self = (p) => session && (p === "clockins/" + session.user.id || p.startsWith("clockins/" + session.user.id + "/"));
  const canRead = (p) => isEd() || (ok() && (self(p) || p.startsWith("pub/")));
  const canWrite = (p) => isEd() || (ok() && self(p));
  const fire = (path) => setTimeout(() => subs.forEach((f) => f({ new: { path } })), 5);
  const parent = (p) => p.replace(/\/[^/]+$/, "");
  const denied = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
  const cmp = (a, op, b) => ({ "==": a === b, "!=": a !== b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b }[op]);
  const rpc = async (name, a) => {
    if (name === "hr_claim") { const r = SU.find((x) => x.user_id === session?.user.id); return { data: { editor: isEd(), owner: !!U?.owner, email: U?.email, access: isEd() ? "approved" : r?.status || "none", hr_note: r?.hr_note || null } }; }
    if (name === "hr_request_access") { let r = SU.find((x) => x.user_id === session.user.id); if (!r) SU.push(r = { user_id: session.user.id, email: session.user.email }); Object.assign(r, { status: "pending", name: a.p_name, emp_no: a.p_emp_no, position: a.p_position, mobile: a.p_mobile, note: a.p_note, requested_at: new Date().toISOString() }); window.__writes.push(["request", a]); return { data: "pending" }; }
    if (name === "hr_signup_list") return { data: isEd() ? JSON.parse(JSON.stringify(SU)) : [] };
    if (name === "hr_decide_access") { if (!isEd()) return denied; const r = SU.find((x) => x.user_id === a.target); if (r) Object.assign(r, { status: a.approve ? "approved" : "rejected", decided_at: new Date().toISOString() }); window.__writes.push(["decide", a.target, a.approve]); return { data: null }; }
    if (name === "hr_query") {
      let ks = Object.keys(D).filter((k) => parent(k) === a.c && canRead(k));
      for (const [f, op, v] of a.w || []) ks = ks.filter((k) => D[k][f] !== undefined && cmp(D[k][f], op, v));
      if (a.ob) ks.sort((x, y) => (D[x][a.ob] > D[y][a.ob] ? 1 : D[x][a.ob] < D[y][a.ob] ? -1 : 0) * (a.dir === "desc" ? -1 : 1));
      return { data: ks.slice(0, a.lim || 1000).map((k) => ({ path: k, data: JSON.parse(JSON.stringify(D[k])), version: V[k] })) };
    }
    if (name === "hr_update") {
      if (!D[a.p] || !canRead(a.p)) return { error: { code: "P0002", message: "not_found" } };
      if (!canWrite(a.p)) return denied;
      const merge = (x, y) => { for (const k in y) { if (y[k] && typeof y[k] === "object" && !Array.isArray(y[k]) && x[k] && typeof x[k] === "object" && !Array.isArray(x[k])) merge(x[k], y[k]); else x[k] = y[k]; } return x; };
      merge(D[a.p], a.patch); V[a.p]++; window.__writes.push(["update", a.p]); fire(a.p); return { data: V[a.p] };
    }
    if (name === "hr_people") return { data: isEd() ? (window.__PEOPLE || []).filter((p) => !a.q || p.name.toLowerCase().includes(a.q.toLowerCase())) : [] };
    if (name === "hr_set_editor") { window.__writes.push(["editor", a.target, a.allow]); if (a.allow) editors.add(a.target); else editors.delete(a.target); return { data: null }; }
    return { error: { message: "unknown rpc " + name } };
  };
  const from = (t) => {
    const st = { path: null };
    const api = {
      select: () => api,
      eq: (f, v) => { st.path = v; return api; },
      maybeSingle: async () => ({ data: D[st.path] && canRead(st.path) ? { data: JSON.parse(JSON.stringify(D[st.path])), version: V[st.path] } : null }),
      upsert: async (row) => { if (!canWrite(row.path)) return denied; D[row.path] = row.data; V[row.path] = (V[row.path] || 0) + 1; window.__writes.push(["set", row.path]); fire(row.path); return { error: null }; },
      delete: () => ({ eq: async (f, p) => { if (!canWrite(p)) return denied; delete D[p]; window.__writes.push(["delete", p]); fire(p); return { error: null }; } }),
    };
    return api;
  };
  const authCbs = [];
  const client = {
    from, rpc,
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session?.user || null } }),
      onAuthStateChange: (cb) => { authCbs.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email }) => { const u = window.__LOGIN?.[email]; if (!u) return { error: { message: "Invalid login credentials" } }; session = { access_token: "tok", user: { id: u.id, email, user_metadata: { full_name: u.name } } }; if (u.editor) editors.add(u.id); authCbs.forEach((cb) => cb("SIGNED_IN", session)); return { data: { session }, error: null }; },
      signUp: async () => ({ data: { session: null }, error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => { session = null; authCbs.forEach((cb) => cb("SIGNED_OUT", null)); },
    },
    storage: { from: () => ({ upload: async (id) => { window.__writes.push(["upload", id]); return { error: null }; }, remove: async () => ({ error: null }), list: async () => ({ data: [] }) }) },
    channel: () => { const ch = { on: (_e, _f, cb) => { subs.push(cb); return ch; }, subscribe: () => ch }; return ch; },
    realtime: { setAuth() {} },
  };
  const fake = { createClient: () => client };
  Object.defineProperty(window, "supabase", { configurable: true, get: () => fake, set: () => {} });
})();
