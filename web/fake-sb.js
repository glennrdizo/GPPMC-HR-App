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
  const rpc = (name, a) => { const pr = rpcImpl(name, a); pr.range = (f, t) => pr.then((r) => (Array.isArray(r.data) ? { ...r, data: r.data.slice(f, t + 1) } : r)); return pr; };
  const rpcImpl = async (name, a) => {
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
    // Applicant portal (mirrors supabase/migrations/20261014_hr_applicant_portal.sql).
    if (name === "hr_careers") { const t = D["org/talent"] || {}; return { data: { company: D["org/main"]?.companyName || "GD Prime", how: t.applyHow || null, reqs: t.portalReqs || null, forms: t.portalForms || [],
      jobs: Object.keys(D).filter((k) => parent(k) === "jobs" && D[k].status === "OPEN" && !D[k].sample && !D[k].careersHide).map((k) => { const j = D[k]; const p = D["projects/" + j.projectId]; return { id: k.split("/")[1], title: j.title, desc: j.desc || null, empType: j.empType || null, payType: j.payType || null, rate: t.careersHidePay ? null : j.rate ?? null, slots: j.slots ?? null, opened: j.opened || null, site: p?.name || null, location: p?.location || t.hoAddress || "Head Office" }; }) } }; }
    if (!session && /^hr_(apply|my_apps|portal)/.test(name)) return denied;
    const me = session?.user.id; const myApps = () => Object.keys(D).filter((k) => parent(k) === "applicants" && D[k].portalUid === me);
    if (name === "hr_portal_link") { let n = 0; for (const k of Object.keys(D)) if (parent(k) === "applicants" && !D[k].portalUid && (D[k].email || "").toLowerCase() === session.user.email.toLowerCase() && !["HIRED", "REJECTED", "WITHDRAWN"].includes(D[k].stage)) { D[k].portalUid = me; n++; } return { data: n }; }
    if (name === "hr_apply") { const j = D["jobs/" + a.p_job], p = a.p; if (!j || j.status !== "OPEN") return { error: { message: "job_closed" } }; if (!p.consent) return { error: { message: "consent_required" } }; if (!p.first || !p.last || !p.mobile) return { error: { message: "missing_fields" } };
      const src = { linkedin: "LinkedIn", facebook: "Facebook", jobstreet: "JobStreet", indeed: "Indeed", referral: "Referral" }[(p.src || "").toLowerCase()] || "Company website";
      const d = { first: p.first, middle: p.middle || null, last: p.last, mobile: p.mobile, email: session.user.email, address: p.address || null, birth: p.birth || null, gender: p.gender || null, expRate: Number(p.expRate) || null, notes: p.notes || null, ...(p.resume && String(p.resume.id).startsWith(`apply/${me}/`) ? { resume: { id: p.resume.id, name: p.resume.name } } : {}) };
      const cur = myApps().find((k) => D[k].jobId === a.p_job); if (cur) { if (D[cur].stage === "APPLIED") Object.assign(D[cur], d); fire(cur); return { data: cur.split("/")[1] }; }
      const id = "ap" + Math.random().toString(36).slice(2, 10); const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      D["applicants/" + id] = { ...d, id, jobId: a.p_job, stage: "APPLIED", stageAt: day, applied: day, source: src, ivs: [], reqs: {}, portalUid: me, portal: { via: "careers", consent: { v: p.dpaV, at: new Date().toISOString() } } }; V["applicants/" + id] = 1; window.__writes.push(["apply", id, src]); fire("applicants/" + id); return { data: id }; }
    if (name === "hr_my_apps") return { data: myApps().map((k) => { const x = D[k], j = D["jobs/" + x.jobId] || {}, p = D["projects/" + j.projectId] || {}; return { id: k.split("/")[1], jobId: x.jobId, job: j.title, site: p.name || null, location: p.location || null, stage: x.stage, applied: x.applied, stageAt: x.stageAt, first: x.first, middle: x.middle, last: x.last, mobile: x.mobile, address: x.address, birth: x.birth, gender: x.gender, expRate: x.expRate, resume: x.resume || null,
      ivs: (x.ivs || []).map((i) => ({ d: i.d, t: i.t, kind: i.kind, result: i.result })), offer: ["SENT", "ACCEPTED", "DECLINED"].includes(x.offer?.status) ? { status: x.offer.status, rate: x.offer.rate, start: x.offer.start, payType: j.payType } : null, reqs: x.reqs || {}, portal: x.portal || {} }; }) };
    if (name === "hr_portal_put") { const k = "applicants/" + a.p_app, x = D[k]; if (!x || x.portalUid !== me) return { error: { code: "P0002", message: "not_found" } }; if (["HIRED", "REJECTED", "WITHDRAWN"].includes(x.stage)) return { error: { message: "application_closed" } };
      x.portal = x.portal || {}; const v = a.p_val || {}; if (v.file && !String(v.file).startsWith(`apply/${me}/`)) return { error: { message: "bad_file" } };
      if (a.p_kind === "withdraw") { x.stage = "WITHDRAWN"; x.portal.withdrawn = new Date().toISOString(); }
      else if (a.p_kind === "req") { if (x.portal.reqs?.[a.p_key]?.status === "ACCEPTED") return { error: { message: "already_accepted" } }; x.portal.reqs = { ...(x.portal.reqs || {}), [a.p_key]: { ...(v.file ? { file: v.file, name: v.name } : {}), num: v.num || null, at: new Date().toISOString(), status: "SUBMITTED" } }; }
      else if (a.p_kind === "back") { if (!(x.portal.shared || []).some((s) => s.id === a.p_key)) return { error: { code: "P0002", message: "not_found" } }; x.portal.back = { ...(x.portal.back || {}), [a.p_key]: { file: v.file, name: v.name, at: new Date().toISOString() } }; }
      window.__writes.push(["portal", a.p_kind, a.p_key]); fire(k); return { data: null }; }
    if (name === "hr_job_runs_list" || name === "hr_outbox_list") { const A = window.__AJ; if (!A) return { error: { code: "PGRST202", message: "function not found" } }; window.__writes.push(["rpc", name]); return { data: name === "hr_outbox_list" ? A.out : A.runs }; }
    if (name.startsWith("hr_bio_site_")) { const B = window.__BIO; if (!B) return { error: { code: "PGRST202", message: "function not found" } }; window.__writes.push(["rpc", name, JSON.stringify(a || {})]);
      if (name === "hr_bio_site_list") return { data: B };
      if (name === "hr_bio_site_add") { B.push({ id: "s" + B.length, name: a.p_name, projects: a.p_projects, created_at: new Date().toISOString(), total_saved: 0, last_unmatched: [] }); return { data: "bio_" + "f".repeat(64) }; }
      if (name === "hr_bio_site_revoke") { const x = B.find((s) => s.id === a.p_id); if (x) x.revoked_at = new Date().toISOString(); return { data: null }; } }
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
    functions: { invoke: async (fn, o) => { window.__writes.push(["fn", fn, JSON.stringify(o?.body || {})]); const A = window.__AJ; if (!A) return { data: null, error: { message: "Failed to send a request to the Edge Function" } };
      const b = o?.body || {}; return { data: b.status ? A.status : b.test ? { ok: true, to: session?.user.email } : { ok: true, sent: 3, digestAt: b.digest ? new Date().toISOString() : null, digestItems: 4 }, error: null }; } },
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session?.user || null } }),
      onAuthStateChange: (cb) => { authCbs.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email }) => { const u = window.__LOGIN?.[email]; if (!u) return { error: { message: "Invalid login credentials" } }; session = { access_token: "tok", user: { id: u.id, email, user_metadata: { full_name: u.name } } }; if (u.editor) editors.add(u.id); authCbs.forEach((cb) => cb("SIGNED_IN", session)); return { data: { session }, error: null }; },
      signUp: async (o) => { window.__writes.push(["signup", o.email, o.options?.data?.applicant || false, o.options?.emailRedirectTo || ""]); return { data: { session: null, user: { identities: [{}] } }, error: null }; },
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => { session = null; authCbs.forEach((cb) => cb("SIGNED_OUT", null)); },
    },
    storage: { from: () => ({ upload: async (id) => { window.__writes.push(["upload", id]); return { error: null }; }, download: async (id) => ({ data: new Blob(["file " + id], { type: "text/plain" }), error: null }), remove: async () => ({ error: null }), list: async () => ({ data: [] }) }) },
    channel: () => { const ch = { on: (_e, _f, cb) => { subs.push(cb); return ch; }, subscribe: () => ch }; return ch; },
    realtime: { setAuth() {} },
  };
  const fake = { createClient: () => client };
  Object.defineProperty(window, "supabase", { configurable: true, get: () => fake, set: () => {} });
})();
