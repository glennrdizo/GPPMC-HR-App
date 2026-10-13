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
    // The API returns at most 1000 rows per call, so larger reads (the 201 masterlist has 1,200+ people) come in pages.
    const lim = o.n || 1000; let data = [];
    for (let from = 0; from < lim; from += 1000) {
      const to = Math.min(lim, from + 1000) - 1;
      const { data: page, error } = await sb.rpc("hr_query", { c, w: o.w || [], ob: o.ob || null, dir: o.dir || "asc", lim }).range(from, to);
      if (error) throw error; data = data.concat(page || []); if (!page || page.length < to - from + 1) break;
    }
    const seen = new Set(); data = data.filter((r) => !seen.has(r.path) && seen.add(r.path));
    return { docs: data.map((r) => docSnap(r.path, r)), size: data.length, empty: !data.length };
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
  const extOf = (t) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf", "image/svg+xml": "svg", "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "m4a", "video/mp4": "mp4", "audio/ogg": "ogg" }[t] || "bin");
  const assets = {
    upload: async (blob, opts) => {
      const type = (opts?.type || blob?.type || "application/octet-stream").replace(/;.*$/, "");
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
  const css = `.sb-gate{position:fixed;inset:0;z-index:9999;overflow:auto;font-family:Manrope,system-ui,sans-serif;color:#F4EFE4;background:#0A1222;
  background-image:radial-gradient(900px 520px at 18% 8%,rgba(46,84,160,.30),transparent 65%),radial-gradient(700px 420px at 92% 0%,rgba(201,164,92,.12),transparent 60%),radial-gradient(900px 700px at 110% 110%,rgba(46,84,160,.35),transparent 60%),linear-gradient(160deg,#0A1222 0%,#101C35 55%,#0B1427 100%)}
.sb-gate::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.35;background-image:linear-gradient(rgba(201,164,92,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(201,164,92,.07) 1px,transparent 1px);background-size:72px 72px;-webkit-mask-image:radial-gradient(ellipse at 30% 40%,#000 0%,transparent 70%);mask-image:radial-gradient(ellipse at 30% 40%,#000 0%,transparent 70%)}
.sb-wrap{position:relative;min-height:100%;max-width:1240px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,440px);gap:64px;align-items:center;align-content:center;padding:48px 40px;box-sizing:border-box}
.sb-hero{display:flex;flex-direction:column;gap:26px;animation:sbIn .8s ease both}
.sb-brand{display:flex;align-items:center;gap:14px}.sb-brand img{width:56px;height:56px;border-radius:50%;box-shadow:0 0 0 1px rgba(224,190,122,.55),0 0 0 6px rgba(224,190,122,.08)}
.sb-brand b{display:block;font-family:"Playfair Display",Georgia,serif;font-size:18px;letter-spacing:.01em;color:#fff}.sb-brand span{display:block;font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:#E0BE7A;font-weight:700;margin-top:3px}
.sb-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:#E0BE7A;font-weight:700}.sb-eyebrow::before{content:"";width:34px;height:1px;background:linear-gradient(90deg,#E0BE7A,transparent)}
.sb-hero h2{font-family:"Playfair Display",Georgia,serif;font-weight:700;font-size:clamp(34px,4.4vw,58px);line-height:1.06;margin:0;color:#fff;letter-spacing:-.01em}
.sb-hero h2 em{font-style:italic;background:linear-gradient(100deg,#F3DDA6,#C9A45C 60%,#F3DDA6);-webkit-background-clip:text;background-clip:text;color:transparent}
.sb-lead{margin:0;max-width:52ch;font-size:16.5px;line-height:1.65;color:#C8CFDE}
.sb-feats{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:620px}
.sb-feats li{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(224,190,122,.16);backdrop-filter:blur(6px)}
.sb-feats svg{flex:0 0 auto;width:34px;height:34px;padding:7px;box-sizing:border-box;border-radius:10px;background:rgba(224,190,122,.12);color:#E0BE7A}
.sb-feats b{display:block;font-size:14.5px;color:#fff}.sb-feats small{display:block;font-size:13px;color:#AEB7CA;margin-top:2px;line-height:1.45}
.sb-foot{grid-column:1;margin-top:-40px;font-size:12.5px;color:#8C96AD;letter-spacing:.02em}.sb-foot a{color:#E0BE7A;text-decoration:none}
.sb-card{position:relative;background:linear-gradient(180deg,#FFFFFF,#FBF8F1);border-radius:24px;width:100%;padding:36px 32px 30px;box-sizing:border-box;color:#14213D;box-shadow:0 40px 90px -30px rgba(0,0,0,.65),0 0 0 1px rgba(224,190,122,.35);animation:sbIn .8s .12s ease both}
.sb-card::before{content:"";position:absolute;left:32px;right:32px;top:0;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,transparent,#C9A45C,transparent)}
.sb-card img{display:none}.sb-card h1{font-family:"Playfair Display",Georgia,serif;font-size:30px;margin:0 0 6px;color:#0F1B33}
.sb-card .sub{color:#6A7080;margin:0 0 20px;font-size:14.5px;line-height:1.5}.sb-card label{display:block;font-weight:700;font-size:12.5px;letter-spacing:.04em;margin:14px 0 6px;color:#2A3550}
.sb-card input{width:100%;box-sizing:border-box;border:1px solid #D9DCE5;background:#fff;border-radius:12px;padding:13px 14px;font:inherit;font-size:16px;color:#14213D;transition:border-color .15s,box-shadow .15s}
.sb-card input:focus{outline:0;border-color:#C9A45C;box-shadow:0 0 0 4px rgba(201,164,92,.18)}
.sb-card button.go{width:100%;margin-top:22px;min-height:52px;border:0;border-radius:14px;background:linear-gradient(135deg,#0F1B33,#22365F);color:#fff;font:inherit;font-weight:800;font-size:16px;letter-spacing:.02em;cursor:pointer;box-shadow:0 12px 26px -12px rgba(15,27,51,.8),inset 0 -2px 0 rgba(224,190,122,.55);transition:transform .15s,box-shadow .15s}
.sb-card button.go:hover{transform:translateY(-1px);box-shadow:0 16px 30px -12px rgba(15,27,51,.9),inset 0 -2px 0 #E0BE7A}.sb-card button.go:disabled{opacity:.6;cursor:wait;transform:none}
.sb-card .links{display:flex;justify-content:space-between;gap:10px;margin-top:18px;font-size:14px;flex-wrap:wrap}.sb-card .links a{color:#8A6A1F;font-weight:700;cursor:pointer;text-decoration:none;border-bottom:1px solid rgba(138,106,31,.35)}.sb-card .links a:hover{border-color:#8A6A1F}
.sb-secure{display:flex;align-items:center;justify-content:center;gap:6px;margin:18px 0 0;font-size:12px;color:#7A8090}
.sb-card label small{font-weight:500;letter-spacing:0;color:#8A8F9C;text-transform:none}.sb-wait{background:#F6F1E6;border:1px solid #E4D3AC;border-radius:12px;padding:14px 16px;margin:4px 0 8px;font-size:14px;line-height:1.5;color:#2A3550}.sb-wait b{display:block;word-break:break-all}.sb-wait p{margin:8px 0 0}.sb-msg{margin-top:12px;font-size:14px;padding:10px 12px;border-radius:10px;display:none}.sb-msg.err{display:block;background:#FDECEC;color:#9B1C1C}.sb-msg.ok{display:block;background:#EAF6EE;color:#1E6B3A}
.sb-gate.seen .sb-hero,.sb-gate.seen .sb-card{animation:none}
.sb-dpa{display:flex;gap:10px;align-items:flex-start;margin:18px 0 0;padding:12px 14px;border-radius:12px;background:#F6F1E4;border:1px solid #E8DCBC;font-size:13px;line-height:1.5;color:#3A4560;cursor:pointer}
.sb-dpa input{width:20px;height:20px;flex:0 0 auto;margin:1px 0 0;padding:0;accent-color:#1B2B4B;cursor:pointer}.sb-dpa a,.sb-foot button,.sb-pnl{color:#8A6A1F;font-weight:700;text-decoration:underline;cursor:pointer}
.sb-card label.sb-dpa{font-weight:500;letter-spacing:0;font-size:13px;margin:18px 0 0}.sb-card .sb-dpa input{-webkit-appearance:auto;appearance:auto;border:0;border-radius:4px;box-shadow:none;padding:0;width:20px;height:20px}.sb-card .sb-dpa span{flex:1}
.sb-dpa.bad{border-color:#D9534F;background:#FDF1F0}
.sb-foot button{background:none;border:0;padding:0;font:inherit;color:#E0BE7A}
.sb-pn{position:fixed;inset:0;z-index:10000;background:rgba(6,11,22,.72);display:grid;place-items:center;padding:16px;backdrop-filter:blur(4px)}
.sb-pn>div{background:#FFFDF8;color:#1F2A44;max-width:680px;width:100%;max-height:min(86vh,820px);overflow:auto;border-radius:20px;padding:28px 28px 22px;box-sizing:border-box;box-shadow:0 30px 80px rgba(0,0,0,.5);font-size:14.5px;line-height:1.6}
.sb-pn h2{font-family:"Playfair Display",Georgia,serif;font-size:26px;margin:0 0 4px;color:#0F1B33}.sb-pn h3{font-size:15px;margin:18px 0 4px;color:#0F1B33}.sb-pn p,.sb-pn ul{margin:0 0 8px}.sb-pn ul{padding-left:20px}.sb-pn .meta{color:#6A7080;font-size:13px;margin-bottom:14px}
.sb-pn .close{position:sticky;bottom:-22px;display:block;width:100%;margin-top:18px;min-height:48px;border:0;border-radius:12px;background:#1B2B4B;color:#fff;font:inherit;font-weight:800;cursor:pointer}
@keyframes sbIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.sb-hero,.sb-card{animation:none}}
@media (max-width:960px){.sb-wrap{grid-template-columns:minmax(0,1fr);gap:28px;padding:28px 18px 32px;max-width:560px}.sb-hero{gap:16px}.sb-lead{font-size:15px}.sb-feats{gap:8px}.sb-feats li{padding:10px 12px}.sb-feats small{display:none}.sb-foot{margin-top:0;text-align:center}}
@media (max-width:600px){.sb-wrap{gap:22px;padding-top:22px}.sb-feats,.sb-eyebrow{display:none}.sb-hero h2{font-size:32px}.sb-brand img{width:46px;height:46px}.sb-brand b{font-size:15.5px}}
@media (max-width:420px){.sb-feats svg{width:30px;height:30px;padding:6px}.sb-feats b{font-size:13px}.sb-card{padding:30px 20px 24px}.sb-card::before{left:20px;right:20px}}
.sb-acct{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 4px 0;padding:10px 10px 10px 12px;border:1px solid rgba(201,164,92,.4);border-radius:14px;background:#13213D;box-shadow:0 -14px 20px -6px #0D1729,0 30px 0 6px #172B4E}
.sb-ini{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#B8913F,#E4C98E);color:#152B50;font-weight:800;font-size:13px}
.sb-who{min-width:0;flex:1 1 150px;display:flex;flex-direction:column;line-height:1.25}.sb-who b{color:#fff;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-who small{color:#AFC0DD;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-out{flex:1 0 auto;justify-content:center;display:inline-flex;align-items:center;gap:6px;min-height:36px;background:transparent;border:1px solid rgba(228,201,142,.7);color:#F3E3BF;border-radius:99px;padding:6px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.sb-out:hover,.sb-out:focus-visible{background:#E4C98E;color:#152B50;outline:none}.sb-out:disabled{opacity:.7;cursor:progress}
@media (max-width:900px){.rail:not(:has(#nav[data-open="true"])) .sb-acct{display:none}.sb-acct{margin:12px 0 4px;position:static;box-shadow:none}}`;
  let mode = "in";
  /* Data Privacy Act of 2012 (RA 10173): consent is required at sign-in and saved on the account with the notice version and time. */
  const DPA_V = "2026-10-12"; let dpaNow = false, held = null;
  const NOTICE = `<h2>Privacy Notice</h2><p class="meta">GD Prime Property Management Corporation · Human Resources Portal · Version ${DPA_V}</p>
    <p>We respect your privacy and protect your personal information under the <b>Data Privacy Act of 2012 (Republic Act No. 10173)</b>, its Implementing Rules and Regulations, and the issuances of the National Privacy Commission (NPC).</p>
    <h3>What we collect</h3><ul><li>Personal and contact details: name, birth date, civil status, address, phone, email and emergency contacts.</li><li>Employment records: position, assignment, contracts, evaluations, training, disciplinary and separation records.</li><li>Government numbers: TIN, SSS, PhilHealth and Pag-IBIG.</li><li>Pay records: salary, allowances, deductions, loans, bank details and payslips.</li><li>Attendance: clock-in and out times, and when you clock in by phone, a selfie and your location at that moment.</li><li>Health information, such as medical exam results and medical certificates for leave. This is sensitive personal information and is handled with extra care.</li></ul>
    <h3>Why we use it</h3><ul><li>To manage your employment, attendance, leave, training and benefits.</li><li>To compute and pay your salary, 13th month pay and final pay.</li><li>To meet our legal duties to SSS, PhilHealth, Pag-IBIG, BIR and DOLE.</li><li>To keep our workplaces safe and our records accurate.</li></ul>
    <h3>Who sees it</h3><p>Only authorized HR, payroll and management staff, each limited to what their role needs. You see your own records. We share data only with government agencies as the law requires, and with partners that help us pay or cover you (such as banks and HMOs), under agreements that protect it. We do not sell your data.</p>
    <h3>How we protect and keep it</h3><p>Records are stored encrypted with access controls, and every change is logged. We keep them for as long as you work with us and afterward only as long as labor, tax and social security laws require, then dispose of them securely.</p>
    <h3>Your rights</h3><p>You have the right to be informed, to access your data, to object, to have it corrected, to have it erased or blocked when allowed by law, to data portability, to be indemnified for damages, and to file a complaint with the National Privacy Commission (privacy.gov.ph).</p>
    <h3>Contact us</h3><p>For questions or requests about your personal data, please contact HR at the Head Office.</p>
    <p><b>Consent.</b> By ticking the box and continuing, you confirm that you have read this notice and agree to the collection and processing of your personal and sensitive personal information for the purposes above.</p>
    <button type="button" class="close" data-sb-pn-close>I understand</button>`;
  const showNotice = () => { if (document.querySelector(".sb-pn")) return; const d = document.createElement("div"); d.className = "sb-pn"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Privacy Notice"); d.innerHTML = `<div tabindex="-1">${NOTICE}</div>`; document.body.appendChild(d); d.firstChild.focus(); };
  const dpaBox = () => `<label class="sb-dpa"><input type="checkbox" id="sb-dpa" required ${dpaNow ? "checked" : ""}><span>I have read the <a data-sb-pn>Privacy Notice</a> and agree to GD Prime processing my personal information under the Data Privacy Act of 2012 (RA 10173).</span></label>`;
  const dpaSave = async () => { try { await sb.auth.updateUser({ data: { dpa_v: DPA_V, dpa_at: new Date().toISOString() } }); } catch {} };
  function gate(msg, kind) {
    let g = document.querySelector(".sb-gate"); g?.classList.add("seen");
    if (!g) { cssOnce(); g = document.createElement("div"); g.className = "sb-gate"; document.body.appendChild(g); }
    const logo = window.CO_LOGO_URL || "";
    const title = { verify: "Verify your identity", wait: "Waiting for approval", dpa: "Privacy consent", in: "Sign in", up: "Create your account", reset: "Reset your password", newpw: "Set a new password" }[mode];
    const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const feats = [[ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), "Clock in from your phone", "Selfie and location, right at your site"], [ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'), "Payslips and pay", "Every cutoff, 13th month and loans"], [ic('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'), "Leave and requests", "File, track and get approvals fast"], [ic('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'), "Ask HR anytime", "Answers on policies, benefits and forms"]];
    const hello = { in: ["Welcome back", "Sign in with your work email to continue."], up: ["Join GD Prime HR", "Create your account with the email HR has on file."], reset: ["Reset your password", "We'll email you a secure link."], newpw: ["Set a new password", "Choose at least 8 characters."], dpa: ["Your privacy matters", "Before you continue, please read our Privacy Notice and confirm your consent."],
      verify: ["Verify your identity", "HR checks every new account before it opens. Tell us who you are so we can match you to our records."],
      wait: [acc?.status === "rejected" ? "Not approved yet" : "Waiting for HR approval", acc?.status === "rejected" ? "HR could not verify your account." : "Thanks! HR is checking your details. You can use the portal as soon as they approve your account."] }[mode];
    const vfy = mode === "verify" ? `<label for="sb-vname">Full name</label><input id="sb-vname" autocomplete="name" required value="${esc(acc?.name || "")}">
      <label for="sb-vno">Employee number <small>(leave blank if you are newly hired)</small></label><input id="sb-vno" autocomplete="off" placeholder="EMP-0123" value="${esc(acc?.emp_no || "")}">
      <label for="sb-vpos">Position and site or department</label><input id="sb-vpos" required placeholder="Security Guard, Riverside Tower" value="${esc(acc?.position || "")}">
      <label for="sb-vmob">Mobile number</label><input id="sb-vmob" type="tel" autocomplete="tel" required placeholder="09XX XXX XXXX" value="${esc(acc?.mobile || "")}">
      <label for="sb-vnote">Anything HR should know <small>(optional)</small></label><input id="sb-vnote" value="">` : "";
    const waitBox = mode === "wait" ? `<div class="sb-wait"><b>${esc(acc?.email || "")}</b>${acc?.status === "rejected" ? `${acc?.hr_note ? `<p>HR's note: ${esc(acc.hr_note)}</p>` : ""}<p>Check your details and send them again, or contact HR at the Head Office.</p>` : `<p>Sent ${esc(acc?.at || "just now")}. We'll open the portal for you once HR approves. Come back and tap <b>Check again</b>.</p>`}</div>` : "";
    g.innerHTML = `<div class="sb-wrap"><aside class="sb-hero"><div class="sb-brand">${logo ? `<img src="${logo}" width="56" height="56" alt="">` : ""}<div><b>GD Prime Property Management Corporation</b><span>Human Resources Portal</span></div></div>
      <span class="sb-eyebrow">For every GD Prime employee</span><h2>Your work life,<br><em>beautifully</em> in one place.</h2>
      <p class="sb-lead">Time, pay, leave and HR help for our people at the head office and every project site, from your phone or desk.</p>
      <ul class="sb-feats">${feats.map(([i, t, d]) => `<li>${i}<div><b>${t}</b><small>${d}</small></div></li>`).join("")}</ul>
      </aside>
      <form class="sb-card" novalidate><h1>${hello[0]}</h1><p class="sub" aria-label="${title}">${hello[1]}</p>
      ${vfy}${waitBox}
      ${mode === "up" ? `<label for="sb-name">Full name</label><input id="sb-name" autocomplete="name" required>` : ""}
      ${!["newpw", "dpa", "verify", "wait"].includes(mode) ? `<label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="email" required>` : ""}
      ${!["reset", "dpa", "verify", "wait"].includes(mode) ? `<label for="sb-pw">${mode === "newpw" ? "New password" : "Password"}</label><input id="sb-pw" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="8" required>` : ""}
      ${["in", "up", "dpa"].includes(mode) ? dpaBox() : ""}
      <button class="go" type="submit">${{ verify: "Send to HR for approval", wait: acc?.status === "rejected" ? "Update my details" : "Check again", dpa: "Agree and continue", in: "Sign in", up: "Create account", reset: "Send reset link", newpw: "Save password" }[mode]}</button>
      <div class="sb-msg ${kind || ""}" role="status">${msg || ""}</div>
      <div class="links">${mode === "verify" || mode === "wait" ? `${mode === "wait" && acc?.status !== "rejected" ? `<a data-sb-edit>Edit my details</a>` : ""}<a data-sb-out>Sign out</a>` : mode === "dpa" ? `<a data-sb-pn>Read the Privacy Notice</a><a data-sb-out>Sign out</a>` : mode === "in" ? `<a data-sb="up">Create an account</a><a data-sb="reset">Forgot password?</a>` : mode !== "newpw" ? `<a data-sb="in">Back to sign in</a>` : ""}</div>
      <p class="sb-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Private and secure. Only you and HR see your records.</p></form>
      <div class="sb-foot">© ${new Date().getFullYear()} GD Prime Property Management Corporation · <a href="https://www.gd-prime.com" target="_blank" rel="noopener">www.gd-prime.com</a> · <button type="button" data-sb-pn>Privacy Notice</button></div></div>`;
    g.querySelector("input")?.focus();
  }
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-sb-pn]")) { ev.preventDefault(); showNotice(); return; }
    if (ev.target.closest("[data-sb-pn-close]") || ev.target.classList?.contains("sb-pn")) { document.querySelector(".sb-pn")?.remove(); document.getElementById("sb-dpa")?.focus(); return; }
    if (ev.target.closest("[data-sb-edit]")) { ev.preventDefault(); mode = "verify"; gate(); return; }
    if (ev.target.closest("[data-sb-out]")) { ev.preventDefault(); signOutNow(); return; } }, true);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") document.querySelector(".sb-pn")?.remove(); });
  document.addEventListener("click", (ev) => { const a = ev.target.closest("[data-sb]"); if (!a) return; ev.preventDefault(); mode = a.dataset.sb; gate(); });
  document.addEventListener("submit", async (ev) => {
    const f = ev.target.closest(".sb-card"); if (!f) return; ev.preventDefault();
    const v = (id) => f.querySelector(id)?.value.trim() || ""; const btn = f.querySelector("button.go");
    const ck = f.querySelector("#sb-dpa"); if (ck && !ck.checked) { ck.closest(".sb-dpa").classList.add("bad"); const m = f.querySelector(".sb-msg"); m.className = "sb-msg err"; m.textContent = "Please read the Privacy Notice and tick the box to continue."; ck.focus(); return; }
    if (ck) dpaNow = true; btn.disabled = true;
    try {
      if (mode === "verify") {
        if (!v("#sb-vname") || !v("#sb-vpos") || !v("#sb-vmob")) throw new Error("Fill in your name, position and mobile number.");
        if (!/^[+\d][\d\s-]{6,}$/.test(v("#sb-vmob"))) throw new Error("Check your mobile number.");
        const { error } = await sb.rpc("hr_request_access", { p_name: v("#sb-vname"), p_emp_no: v("#sb-vno") || null, p_position: v("#sb-vpos"), p_mobile: v("#sb-vmob"), p_note: v("#sb-vnote") || null });
        if (error) throw error; acc = { ...(acc || {}), status: "pending", name: v("#sb-vname"), emp_no: v("#sb-vno"), position: v("#sb-vpos"), mobile: v("#sb-vmob"), at: "just now" }; mode = "wait"; gate(); return; }
      if (mode === "wait") { if (acc?.status === "rejected") { mode = "verify"; gate(); return; } const s0 = held; await start(s0, true); return; }
      if (mode === "dpa") { await dpaSave(); const s0 = held; held = null; mode = "in"; await start(s0); return; }
      if (mode === "in") { const { error } = await sb.auth.signInWithPassword({ email: v("#sb-email"), password: f.querySelector("#sb-pw").value }); if (error) throw error; }
      else if (mode === "up") {
        if (!v("#sb-name")) throw new Error("Enter your full name.");
        const { data, error } = await sb.auth.signUp({ email: v("#sb-email"), password: f.querySelector("#sb-pw").value, options: { data: { full_name: v("#sb-name"), dpa_v: DPA_V, dpa_at: new Date().toISOString() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        // Supabase answers a sign-up for an existing email with an empty identity list and sends no email.
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { mode = "in"; gate("This email already has an account. Sign in, or tap Forgot password? to set a new password.", "err"); return; }
        if (!data.session) { mode = "in"; gate("Check your email and tap the confirmation link, then sign in here.", "ok"); return; }
      } else if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(v("#sb-email"), { redirectTo: location.origin + location.pathname }); if (error) throw error;
        mode = "in"; gate("If that email has an account, a reset link is on its way.", "ok"); return;
      } else if (mode === "newpw") { const { error } = await sb.auth.updateUser({ password: f.querySelector("#sb-pw").value }); if (error) throw error; location.reload(); return; }
    } catch (e) { btn.disabled = false; const m = String(e?.message || e); gate(/Invalid login/i.test(m) ? "Wrong email or password." : /not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you." : m, "err"); }
  });

  let acc = null;
  async function start(session, again) {
    const u = session.user; const name = u.user_metadata?.full_name || u.user_metadata?.name || "";
    if (u.user_metadata?.dpa_v !== DPA_V) { if (dpaNow) dpaSave(); else { held = session; mode = "dpa"; gate(); return; } }
    const { data, error } = await sb.rpc("hr_claim", { display_name: name || null });
    if (error) { gate("Couldn't reach the HR database. Check your connection and reload.", "err"); return; }
    // New accounts wait for HR approval (Glenn 2026-10-12). Older databases without approvals send no "access" and open as before.
    if (!data?.editor && data?.access && data.access !== "approved") {
      held = session; acc = { status: data.access, email: u.email, hr_note: data.hr_note || "", name: acc?.name || name };
      if (data.access === "none") { mode = "verify"; gate(); return; }
      mode = "wait"; gate(again && data.access === "pending" ? "Not approved yet. Please check again later." : "", again ? "err" : ""); return; }
    me = { id: u.id, email: u.email, name: name || u.email, editor: !!data?.editor, owner: !!data?.owner };
    sb.realtime.setAuth(session.access_token); swToken(session.access_token);
    document.querySelector(".sb-gate")?.remove(); readyOk();
  }
  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { mode = "newpw"; gate(); return; }
    if (session && !started && ev !== "PASSWORD_RECOVERY") { started = true; start(session); }
    if (ev === "SIGNED_OUT" && !leaving) location.reload();
  });
  const boot = async () => { const { data } = await sb.auth.getSession(); if (!data.session && !started && mode !== "newpw") gate(); };
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);

  // Sign out: an account bar pinned to the bottom of the menu (Glenn 2026-10-12).
  let leaving = false; const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function cssOnce() { if (document.getElementById("sb-css")) return; const st = document.createElement("style"); st.id = "sb-css"; st.textContent = css; document.head.appendChild(st); }
  async function signOutNow(btn) {
    if (leaving) return; leaving = true; if (btn) { btn.disabled = true; btn.querySelector("b") ? (btn.querySelector("b").textContent = "Signing out…") : (btn.textContent = "Signing out…"); }
    try { await Promise.race([sb.auth.signOut({ scope: "local" }), new Promise((r) => setTimeout(r, 4000))]); } catch {}
    try { for (const k of Object.keys(localStorage)) if (/^sb-|supabase/i.test(k)) localStorage.removeItem(k); } catch {}
    try { swToken(null); } catch {}
    location.reload();
  }
  window.hrSignOut = signOutNow;
  new MutationObserver(() => {
    const nav = document.getElementById("nav"); if (!nav || !me || document.querySelector(".sb-acct")) return;
    const ini = String(me.name || me.email || "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
    cssOnce(); const d = document.createElement("div"); d.className = "sb-acct no-tl";
    d.innerHTML = `<span class="sb-ini" aria-hidden="true">${esc(ini)}</span><span class="sb-who">${me.name && me.name !== me.email ? `<b>${esc(me.name)}</b><small>${esc(me.email || "")}</small>` : `<b>${esc(me.email || "Signed in")}</b>`}</span>
      <button type="button" class="sb-out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><b>Sign out</b></button>`;
    d.querySelector(".sb-out").addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); signOutNow(ev.currentTarget); });
    nav.after(d);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
