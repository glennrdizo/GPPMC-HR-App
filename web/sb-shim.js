/* GD Prime HR website: provides the same window.claude.use() capabilities the app uses on claude.ai
   (db, user, assets, downloads, sample), backed by Supabase. Loaded before the app script. */
(() => {
  const SB_URL = "https://dkrxetzvzxkmhdnvrnqd.supabase.co";
  const SB_KEY = "sb_publishable_BacTOm5RH5cw7ruQO9KHUw_ocKoTBkX";
  const BUCKET = "hr-files";
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.__sb = sb;
  window.__hosted = true;

  let me = null; // { id, email, name, editor, owner }
  let readyOk; const ready = new Promise((r) => (readyOk = r));
  const fail = (code, message) => { const e = new Error(message || code); e.code = code; return e; };
  const mapErr = (e) => {
    const m = `${e?.code || ""} ${e?.message || e || ""}`;
    if (/P0002|not_found/.test(m)) return fail("not_found", "The record doesn't exist.");
    if (/42501|permission|policy|not_granted/i.test(m)) return fail("permission_denied", "Not allowed.");
    if (/payload|too large|413/i.test(m)) return fail("quota_exceeded", "Too large.");
    return fail("unavailable", e?.message || "The database couldn't be reached.");
  };
  const parent = (p) => p.replace(/\/[^/]+$/, "");
  const docSnap = (path, row) => ({ id: path.split("/").pop(), exists: !!row, data: () => (row ? structuredClone(row.data) : undefined) });

  /* ---------- live updates: one channel, listeners re-read what changed ---------- */
  const listeners = new Set();
  let chan = null;
  function ensureChannel() {
    if (chan) return;
    chan = sb.channel("hr-docs").on("postgres_changes", { event: "*", schema: "public", table: "hr_docs" }, (ev) => {
      const p = ev.new?.path || ev.old?.path; if (!p) return;
      for (const l of listeners) if (l.match(p)) l.kick();
    }).subscribe();
  }
  function listen(match, load, cb, onErr) {
    let alive = true, t = null, busy = false, again = false;
    const run = async () => {
      if (!alive) return; if (busy) { again = true; return; } busy = true;
      try { const v = await load(); if (alive) cb(v); } catch (e) { if (alive) onErr?.(mapErr(e)); }
      busy = false; if (again) { again = false; run(); }
    };
    const l = { match, kick: () => { clearTimeout(t); t = setTimeout(run, 120); } };
    listeners.add(l); ensureChannel(); run();
    return () => { alive = false; listeners.delete(l); };
  }

  /* ---------- db ---------- */
  async function getDoc(path) {
    const { data, error } = await sb.from("hr_docs").select("data,version").eq("path", path).maybeSingle();
    if (error) throw error; return docSnap(path, data);
  }
  async function runQuery(c, o) {
    const { data, error } = await sb.rpc("hr_query", { c, w: o.w || [], ob: o.ob || null, dir: o.dir || "asc", lim: o.n || 1000 });
    if (error) throw error;
    return { docs: (data || []).map((r) => docSnap(r.path, r)), size: (data || []).length, empty: !(data || []).length };
  }
  const query = (c, o) => ({
    where: (f, op, v) => query(c, { ...o, w: [...(o.w || []), [f, op, v]] }),
    orderBy: (f, dir = "asc") => query(c, { ...o, ob: f, dir }),
    limit: (n) => query(c, { ...o, n }),
    get: () => runQuery(c, o).catch((e) => { throw mapErr(e); }),
    onSnapshot: (cb, onErr) => listen((p) => parent(p) === c, () => runQuery(c, o), cb, onErr),
  });
  const db = {
    doc: (path) => ({
      id: path.split("/").pop(), path,
      get: () => getDoc(path).catch((e) => { throw mapErr(e); }),
      set: async (v) => { const { error } = await sb.from("hr_docs").upsert({ path, col: parent(path), data: JSON.parse(JSON.stringify(v ?? {})) }); if (error) throw mapErr(error); },
      update: async (v) => { const { error } = await sb.rpc("hr_update", { p: path, patch: JSON.parse(JSON.stringify(v ?? {})) }); if (error) throw mapErr(error); },
      delete: async () => { const { error } = await sb.from("hr_docs").delete().eq("path", path); if (error) throw mapErr(error); },
      onSnapshot: (cb, onErr) => listen((p) => p === path, () => getDoc(path), cb, onErr),
    }),
    collection: (c) => query(c, {}),
  };

  /* ---------- user ---------- */
  const user = {
    isOwner: async () => !!me?.owner,
    canEdit: async () => !!me?.editor,
    id: async () => me?.id || null,
    me: async () => ({ id: me?.id, name: me?.name || me?.email || "" }),
    profiles: async (ids) => {
      const out = {}; for (const id of ids || []) out[id] = { id, name: "" };
      if (me) out[me.id] = { id: me.id, name: me.name || me.email };
      if (!me?.editor) return out;
      const { data } = await sb.rpc("hr_people", { q: "" });
      for (const p of data || []) if (out[p.user_id]) out[p.user_id] = { id: p.user_id, name: p.name || p.email || "", email: p.email };
      return out;
    },
    search: async (q) => {
      if (!me?.editor) return [];
      const { data } = await sb.rpc("hr_people", { q: String(q || "").trim() });
      return (data || []).map((p) => ({ id: p.user_id, name: p.name || p.email || "", email: p.email }));
    },
  };

  /* ---------- files: stored privately; /_blob/<id> is served by sw.js with the signed-in token ---------- */
  const extOf = (t) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf", "image/svg+xml": "svg" }[t] || "bin");
  const assets = {
    upload: async (blob, opts) => {
      const type = opts?.type || blob?.type || "application/octet-stream";
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.${extOf(type)}`;
      const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: type, upsert: false });
      if (error) throw fail(/size|large/i.test(error.message) ? "too_large" : "unavailable", error.message);
      return { id, url: "/_blob/" + id, sizeBytes: blob.size, contentType: type };
    },
    delete: async (id) => { const { error } = await sb.storage.from(BUCKET).remove([id]); if (error) throw fail("unavailable", error.message); },
    list: async () => { const { data } = await sb.storage.from(BUCKET).list("", { limit: 1000 }); const assets = (data || []).map((f) => ({ id: f.name, url: "/_blob/" + f.name, sizeBytes: f.metadata?.size || 0, contentType: f.metadata?.mimetype || "" })); return { assets, usage: { bytes: assets.reduce((s, a) => s + a.sizeBytes, 0) } }; },
  };

  /* ---------- downloads ---------- */
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename || "download";
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    },
  };

  /* ---------- Claude (HR assistant, loan reading, report analysis) through the hr-ai function ---------- */
  const toB64 = (b) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(b); });
  async function callAi(body, signal) {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(`${SB_URL}/functions/v1/hr-ai`, { method: "POST", signal, headers: { "content-type": "application/json", apikey: SB_KEY, authorization: `Bearer ${s?.session?.access_token}` }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: res.status === 429 ? "rate_limited" : res.status === 503 ? "not_granted" : "unavailable", message: j.error || res.statusText };
    return j;
  }
  function makeSample() {
    const sample = async (input, opts = {}) => {
      const signal = opts.signal; if (signal?.aborted) throw { code: "cancelled", message: "Stopped." };
      let messages = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m) => ({ role: m.role, content: m.content }));
      if (opts.images) {
        const imgs = opts.images instanceof Blob ? [opts.images] : [...opts.images];
        const parts = await Promise.all(imgs.slice(0, 5).map(async (b) => ({ type: "image", source: { type: "base64", media_type: b.type || "image/jpeg", data: await toB64(b) } })));
        const last = messages[messages.length - 1]; messages[messages.length - 1] = { role: "user", content: [...parts, { type: "text", text: last.content }] };
      }
      const tools = (opts.tools || []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: "object", properties: {} } }));
      let text = "";
      try {
        for (let round = 0; round < 6; round++) {
          const r = await callAi({ messages, tools, tier: opts.modelTier || "default", last: round === 5 }, signal);
          const said = (r.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
          if (said) { text = text ? `${text}\n\n${said}` : said; opts.onText?.({ text, delta: said }); }
          const uses = (r.content || []).filter((c) => c.type === "tool_use");
          if (!uses.length || r.stop_reason !== "tool_use") break;
          messages = [...messages, { role: "assistant", content: r.content }];
          const results = [];
          for (const u of uses) {
            const t = (opts.tools || []).find((x) => x.name === u.name);
            try { const out = t ? await t.execute(u.input || {}, { signal }) : { error: "Unknown tool" }; results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out ?? null).slice(0, 20000) }); }
            catch (e) { results.push({ type: "tool_result", tool_use_id: u.id, content: String(e?.message || e), is_error: true }); }
          }
          messages = [...messages, { role: "user", content: results }];
        }
      } catch (e) { if (e?.name === "AbortError" || signal?.aborted) throw { code: "cancelled", message: "Stopped.", text }; throw { ...e, text: text || undefined }; }
      return { text, truncated: false };
    };
    sample.json = async (input, opts = {}) => {
      const r = await sample(input, opts); const m = r.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      try { return JSON.parse(m ? m[0] : r.text); } catch { throw { code: "invalid_json", message: "The answer wasn't JSON.", text: r.text }; }
    };
    sample.limits = async () => ({ maxPromptBytes: 200000, images: { maxCount: 5, maxInputBytes: 5 * 1024 * 1024, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] }, tools: { maxCount: 20 } });
    return sample;
  }
  let sampleP = null;
  const getSample = () => (sampleP ||= callAi({ ping: true }).then((r) => (r.ok ? makeSample() : null)).catch(() => null));

  window.claude = {
    use: async (name) => {
      await ready;
      if (name === "db") return db;
      if (name === "user") return user;
      if (name === "assets") return assets;
      if (name === "downloads") return downloads;
      if (name === "sample") return getSample();
      return null;
    },
  };

  /* ---------- service worker for private files ---------- */
  const swToken = (t) => navigator.serviceWorker?.controller?.postMessage({ hrToken: t || null, url: SB_URL, key: SB_KEY, bucket: BUCKET });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", async () => { const { data } = await sb.auth.getSession(); swToken(data?.session?.access_token); });
  }
  sb.auth.onAuthStateChange((_ev, session) => { swToken(session?.access_token); if (session) sb.realtime.setAuth(session.access_token); });

  /* ---------- sign-in screen ---------- */
  const css = `.sb-gate{position:fixed;inset:0;z-index:9999;background:linear-gradient(160deg,#0D1729,#16233F);display:grid;place-items:center;padding:16px;font-family:Manrope,system-ui,sans-serif;overflow:auto}
.sb-card{background:#fff;border-radius:18px;max-width:400px;width:100%;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#14213D}
.sb-card img{display:block;margin:0 auto 10px;border-radius:50%}.sb-card h1{font-family:"Playfair Display",Georgia,serif;font-size:24px;text-align:center;margin:0 0 4px}
.sb-card .sub{text-align:center;color:#5F6472;margin:0 0 18px;font-size:14px}.sb-card label{display:block;font-weight:700;font-size:13px;margin:12px 0 5px}
.sb-card input{width:100%;box-sizing:border-box;border:1px solid #CBD2E1;border-radius:10px;padding:12px;font:inherit;font-size:16px}
.sb-card button.go{width:100%;margin-top:18px;min-height:48px;border:0;border-radius:12px;background:#1B2B4B;color:#fff;font:inherit;font-weight:800;font-size:16px;cursor:pointer}
.sb-card .links{display:flex;justify-content:space-between;gap:10px;margin-top:14px;font-size:14px;flex-wrap:wrap}.sb-card .links a{color:#8A6A1F;font-weight:700;cursor:pointer;text-decoration:underline}
.sb-msg{margin-top:12px;font-size:14px;padding:10px 12px;border-radius:10px;display:none}.sb-msg.err{display:block;background:#FDECEC;color:#9B1C1C}.sb-msg.ok{display:block;background:#EAF6EE;color:#1E6B3A}
.sb-out{display:block;margin:10px 12px 18px;background:transparent;border:1px solid rgba(201,164,92,.45);color:#C9D2E6;border-radius:99px;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;text-align:left}`;
  let mode = "in";
  function gate(msg, kind) {
    let g = document.querySelector(".sb-gate");
    if (!g) { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); g = document.createElement("div"); g.className = "sb-gate"; document.body.appendChild(g); }
    const logo = window.CO_LOGO_URL || "";
    const title = { in: "Sign in", up: "Create your account", reset: "Reset your password", newpw: "Set a new password" }[mode];
    g.innerHTML = `<form class="sb-card" novalidate>${logo ? `<img src="${logo}" width="64" height="64" alt="">` : ""}<h1>GD Prime HR</h1><p class="sub">${title}</p>
      ${mode === "up" ? `<label for="sb-name">Full name</label><input id="sb-name" autocomplete="name" required>` : ""}
      ${mode !== "newpw" ? `<label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="email" required>` : ""}
      ${mode !== "reset" ? `<label for="sb-pw">${mode === "newpw" ? "New password" : "Password"}</label><input id="sb-pw" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="8" required>` : ""}
      <button class="go" type="submit">${{ in: "Sign in", up: "Create account", reset: "Send reset link", newpw: "Save password" }[mode]}</button>
      <div class="sb-msg ${kind || ""}" role="status">${msg || ""}</div>
      <div class="links">${mode === "in" ? `<a data-sb="up">Create an account</a><a data-sb="reset">Forgot password?</a>` : mode !== "newpw" ? `<a data-sb="in">Back to sign in</a>` : ""}</div></form>`;
    g.querySelector("input")?.focus();
  }
  document.addEventListener("click", (ev) => { const a = ev.target.closest("[data-sb]"); if (!a) return; ev.preventDefault(); mode = a.dataset.sb; gate(); });
  document.addEventListener("submit", async (ev) => {
    const f = ev.target.closest(".sb-card"); if (!f) return; ev.preventDefault();
    const v = (id) => f.querySelector(id)?.value.trim() || ""; const btn = f.querySelector("button.go"); btn.disabled = true;
    try {
      if (mode === "in") { const { error } = await sb.auth.signInWithPassword({ email: v("#sb-email"), password: f.querySelector("#sb-pw").value }); if (error) throw error; }
      else if (mode === "up") {
        if (!v("#sb-name")) throw new Error("Enter your full name.");
        const { data, error } = await sb.auth.signUp({ email: v("#sb-email"), password: f.querySelector("#sb-pw").value, options: { data: { full_name: v("#sb-name") }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { mode = "in"; gate("Check your email and tap the confirmation link, then sign in here.", "ok"); return; }
      } else if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(v("#sb-email"), { redirectTo: location.origin + location.pathname }); if (error) throw error;
        mode = "in"; gate("If that email has an account, a reset link is on its way.", "ok"); return;
      } else if (mode === "newpw") { const { error } = await sb.auth.updateUser({ password: f.querySelector("#sb-pw").value }); if (error) throw error; location.reload(); return; }
    } catch (e) { btn.disabled = false; const m = String(e?.message || e); gate(/Invalid login/i.test(m) ? "Wrong email or password." : /not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you." : m, "err"); }
  });

  async function start(session) {
    const u = session.user; const name = u.user_metadata?.full_name || u.user_metadata?.name || "";
    const { data, error } = await sb.rpc("hr_claim", { display_name: name || null });
    if (error) { gate("Couldn't reach the HR database. Check your connection and reload.", "err"); return; }
    me = { id: u.id, email: u.email, name: name || u.email, editor: !!data?.editor, owner: !!data?.owner };
    sb.realtime.setAuth(session.access_token); swToken(session.access_token);
    document.querySelector(".sb-gate")?.remove(); readyOk();
  }
  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { mode = "newpw"; gate(); return; }
    if (session && !started && ev !== "PASSWORD_RECOVERY") { started = true; start(session); }
    if (ev === "SIGNED_OUT") location.reload();
  });
  const boot = async () => { const { data } = await sb.auth.getSession(); if (!data.session && !started && mode !== "newpw") gate(); };
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);

  // Sign out, at the bottom of the menu.
  new MutationObserver(() => {
    const nav = document.getElementById("nav"); if (!nav || !me || nav.querySelector(".sb-out")) return;
    const b = document.createElement("button"); b.className = "sb-out no-tl"; b.type = "button"; b.textContent = `Sign out · ${me.email}`;
    b.onclick = () => sb.auth.signOut(); nav.appendChild(b);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
