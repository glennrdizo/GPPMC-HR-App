/* GD Prime site kiosk (website only, /kiosk). Glenn 2026-10-20: full automation; audit 2026-10-17 H3.
   A gate tablet at one site, with no HR sign-in. HR makes a kiosk key for the site (Timekeeping > Site kiosk on the website)
   and pastes it here once. The tablet can only list that site's people (employee no. and short name) and save a time in or out
   with a photo and the location (hr_kiosk_roster, hr_kiosk_punch). The time is the server's. With no signal the punch is kept
   on the tablet and sent when the signal is back; HR checks those. Removing the key from the tablet needs the PIN set by HR.
   Loaded after supabase.js. */
(() => {
  const SB_URL = "https://dkrxetzvzxkmhdnvrnqd.supabase.co";
  const SB_KEY = "sb_publishable_BacTOm5RH5cw7ruQO9KHUw_ocKoTBkX";
  const sb = window.__sbKiosk || window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const LOGO = window.CO_LOGO_URL || "";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tFmt = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  const dFmt = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Manila" });
  const day = (t) => new Date(new Date(t).getTime() + 8 * 3600e3).toISOString().slice(0, 10);
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
  const K_KEY = "gdp-kiosk-key", K_ROSTER = "gdp-kiosk-roster", K_BOX = "gdp-kiosk-outbox", K_RECENT = "gdp-kiosk-recent";
  const netErr = (e) => navigator.onLine === false || /fetch|network|timed? ?out|abort|load failed|connection/i.test(String(e?.message || e || ""));
  const ERR = { outside: "This tablet is outside the site area, so the punch can't be saved. Ask HR.", not_here: "This person isn't on this site's list. Ask HR to check their assigned site.",
    bad_key: "This tablet's key was removed by HR. Ask HR for a new one.", rate_limited: "Too many punches in the last hour. Wait a few minutes.", closed: "That cutoff is already closed. Tell HR the time.",
    bad_photo: "The photo couldn't be read. Try again.", reason_needed: "Give the reason first." };
  const errText = (e) => { const m = String(e?.message || e || ""); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k] : "Couldn't save the punch. Try again."; };

  let key = store.get(K_KEY, null), roster = store.get(K_ROSTER, null), q = "", pick = null, busy = false, msg = null, ask = false, geo = null, stream = null, idle = null, setupErr = null, forget = false;
  if (/[#&]k=([^&]+)/.test(location.hash)) { const m = /[#&]k=([^&]+)/.exec(location.hash); store.set(K_KEY, (key = decodeURIComponent(m[1]))); history.replaceState(null, "", location.pathname); }

  const css = `:root{--navy:#0D1729;--gold:#B8955A;--ink:#141a26;--mut:#5d6575;--line:#e3e1dc;--ok:#1e7b4a;--bad:#a4262c;--warn:#8a5a00}
  body{margin:0;font-family:Manrope,system-ui,sans-serif;background:#f6f5f2;color:var(--ink)}
  header{background:var(--navy);color:#fff;padding:14px 18px;display:flex;gap:12px;align-items:center}header img{height:36px}
  header h1{font-family:"Playfair Display",serif;font-size:22px;margin:0;flex:1}header .clk{font-size:28px;font-weight:800;text-align:right}header .clk small{display:block;font-size:12px;font-weight:500;opacity:.8}
  main{max-width:720px;margin:0 auto;padding:16px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
  input,textarea{font:inherit;font-size:18px;width:100%;box-sizing:border-box;padding:14px;border:1px solid var(--line);border-radius:10px}
  button{font:inherit;cursor:pointer;border-radius:12px;border:1px solid var(--line);background:#fff;padding:12px 16px;font-size:16px}
  .big{min-height:64px;font-size:20px;font-weight:800;border:0;color:#fff}.in{background:var(--navy)}.out{background:var(--gold)}button:disabled{opacity:.5;cursor:default}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}.list button{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;min-height:56px}
  .mut{color:var(--mut);font-size:14px}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.msg{font-size:17px;font-weight:700;margin:0 0 12px}
  video{width:100%;max-height:300px;background:#000;border-radius:12px;object-fit:cover;transform:scaleX(-1)}a.lnk,button.lnk{border:0;background:none;color:var(--mut);text-decoration:underline;padding:4px;font-size:13px}`;

  function render() {
    const r = $("#app"); const box = store.get(K_BOX, []);
    const head = `<header>${LOGO ? `<img src="${esc(LOGO)}" alt="GD Prime">` : ""}<h1>${esc(roster?.siteName || "Site kiosk")}</h1><div class="clk">${esc(tFmt.format(new Date()))}<small>${esc(dFmt.format(new Date()))}</small></div></header>`;
    if (!key || !roster) { r.innerHTML = head + `<main><section class="card"><h2 style="margin-top:0">Set up this tablet</h2>
      <p class="mut">Paste the kiosk key HR made for this site. Get it from HR (Timekeeping › Site kiosk on the HR website).</p>
      <form id="k-setup"><input name="key" autocomplete="off" placeholder="ksk_…" aria-label="Kiosk key" required><p class="bad">${esc(setupErr || "")}</p><button class="big in" style="width:100%">Use this key</button></form></section></main>`; return; }
    const p = pick && roster.people.find((x) => x.id === pick);
    const hits = q.trim() ? roster.people.filter((x) => `${x.no} ${x.name}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
    const recent = store.get(K_RECENT, []).filter((x) => day(x.t) === day(new Date().toISOString())).slice(-8).reverse();
    r.innerHTML = head + `<main>${msg ? `<p class="msg ${msg[1]}" role="status">${esc(msg[0])}</p>` : ""}
      ${box.length ? `<p class="warn" style="font-weight:700">${box.length} ${box.length === 1 ? "punch is" : "punches are"} kept on this tablet until there's signal. They're sent by themselves.</p>` : ""}
      <section class="card">${p ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div><div style="font-size:24px;font-weight:800">${esc(p.name)}</div><div class="mut">${esc(p.no)}</div></div><button data-k-back>Not me</button></div>
        <video id="k-cam" autoplay playsinline muted></video><p class="mut" id="k-camnote">Look at the camera. The photo is taken when you tap.</p>
        <p class="mut">${!geo ? "Finding the location…" : geo.error ? `<span class="warn">${esc(geo.error)}</span>` : `Location found (±${geo.acc} m).`}</p>
        ${ask ? `<label class="mut" for="k-why">Reason (HR checks this punch)</label><textarea id="k-why" rows="2" maxlength="300"></textarea>` : ""}
        <div class="row" style="margin-top:12px"><button class="big in" data-k-punch="IN" ${busy ? "disabled" : ""}>Time in</button><button class="big out" data-k-punch="OUT" ${busy ? "disabled" : ""}>Time out</button></div>`
      : `<label for="k-q" style="font-weight:700;font-size:18px">Type your employee no. or name</label><input id="k-q" type="search" autocomplete="off" value="${esc(q)}" style="margin-top:8px">
        <ul class="list">${hits.map((x) => `<li><button data-k-pick="${esc(x.id)}"><b>${esc(x.name)}</b><span class="mut">${esc(x.no)}</span></button></li>`).join("") || (q.trim() ? '<li class="mut">No one matches on this site. Ask HR.</li>' : "")}</ul>`}</section>
      <section class="card"><h3 style="margin-top:0">Today on this tablet</h3><ul class="list" style="gap:4px">${recent.map((x) => `<li>${esc(x.name)} · ${x.type === "OUT" ? "out" : "in"} at <b>${esc(tFmt.format(new Date(x.t)))}</b>${x.off ? ' <span class="warn">(no signal, waiting)</span>' : ""}</li>`).join("") || '<li class="mut">No punches yet today.</li>'}</ul></section>
      ${forget ? `<form id="k-pin" class="card"><label for="k-pinv" style="font-weight:700">HR's PIN for this tablet</label><input id="k-pinv" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" style="margin:8px 0">
        <div class="row"><button type="button" data-k-forget-no>Cancel</button><button class="big in" style="min-height:48px;font-size:16px">Remove the key</button></div></form>`
      : `<p style="text-align:center"><button class="lnk" data-k-forget>Remove this tablet's key</button></p>`}</main>`;
    if (p) camOn(); else camOff();
    const qi = $("#k-q"); if (qi && !forget && document.activeElement !== qi) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  async function camOn() {
    const v = $("#k-cam"); if (!v) return;
    try { if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false }); v.srcObject = stream; }
    catch { const n = $("#k-camnote"); if (n) { n.className = "bad"; n.textContent = "The camera isn't allowed. Allow the camera for this page in the browser settings."; } }
  }
  function camOff() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
  function snap() {
    const v = $("#k-cam"); if (!v || !v.videoWidth) return null; const k = 160 / Math.max(v.videoWidth, v.videoHeight); const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.6);
  }
  function locate() {
    if (!navigator.geolocation) { geo = { error: "This tablet can't share its location" }; return; }
    navigator.geolocation.getCurrentPosition((p) => { geo = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }; if (pick) render(); },
      (e) => { geo = { error: e.code === 1 ? "Location permission refused" : "Location not found" }; if (pick) render(); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  async function loadRoster(k) {
    const { data, error } = await sb.rpc("hr_kiosk_roster", { p_key: k }); if (error) throw error;
    roster = data; store.set(K_ROSTER, data); return data;
  }
  const args = (it) => ({ p_key: key, p_emp: it.emp, p_type: it.type, p_photo: it.photo, p_lat: it.lat ?? null, p_lng: it.lng ?? null, p_acc: it.acc ?? null, p_geo_error: it.geoError || null, p_why: it.why || null, p_t: it.t, p_offline: !!it.off });
  function remember(name, type, t, off) { const l = store.get(K_RECENT, []).filter((x) => day(x.t) === day(new Date().toISOString())); l.push({ name, type, t, off }); store.set(K_RECENT, l.slice(-50)); }
  function reset(m) { pick = null; q = ""; ask = false; busy = false; msg = m || null; camOff(); clearTimeout(idle); render(); if (m) setTimeout(() => { if (msg === m) { msg = null; render(); } }, 8000); }
  async function punch(type) {
    const p = roster.people.find((x) => x.id === pick); if (!p || busy) return;
    const photo = snap(); if (!photo) { msg = ["Look at the camera first. If it stays dark, allow the camera.", "bad"]; render(); return; }
    const why = ask ? ($("#k-why")?.value || "").trim() : ""; if (ask && !why) { msg = [ERR.reason_needed, "bad"]; render(); $("#k-why")?.focus(); return; }
    busy = true; render(); const g = geo || {}; const it = { emp: p.id, type, photo, lat: g.lat, lng: g.lng, acc: g.acc, geoError: g.error, why, t: new Date().toISOString() };
    try {
      const { data, error } = await sb.rpc("hr_kiosk_punch", args(it)); if (error) throw error;
      remember(p.name, type, data.t, false);
      reset([`${type === "IN" ? "Time in" : "Time out"} saved for ${p.name} at ${tFmt.format(new Date(data.t))}.${data.waits ? " HR checks it." : ""}`, "ok"]);
    } catch (e) {
      if (netErr(e)) { const box = store.get(K_BOX, []); box.push({ ...it, off: true }); store.set(K_BOX, box.slice(-200)); remember(p.name, type, it.t, true);
        reset([`No signal. ${p.name}'s ${type === "IN" ? "time in" : "time out"} at ${tFmt.format(new Date(it.t))} is kept on this tablet and sent by itself.`, "warn"]); return; }
      busy = false; if (/reason_needed/.test(String(e?.message))) ask = true; msg = [errText(e), "bad"]; render();
    }
  }
  let flushing = false;
  async function flush() {
    if (flushing || !key || navigator.onLine === false) return; let box = store.get(K_BOX, []); if (!box.length) return; flushing = true; let sent = 0; const done = new Set();
    const bk = (x) => `${x.t}|${x.emp}|${x.type}`; // punches queued while this runs are kept (audit 2026-10-25)
    try {
      for (const it of [...box]) {
        const { error } = await sb.rpc("hr_kiosk_punch", args({ ...it, why: it.why || null }));
        if (error && netErr(error)) break;
        box = box.filter((x) => x !== it); done.add(bk(it)); if (!error) { sent++; store.set(K_RECENT, store.get(K_RECENT, []).map((x) => (x.t === it.t ? { ...x, off: false } : x))); } // a refused one (e.g. too old) can't be fixed here: HR is told by the person
      }
    } catch { /* still offline */ } finally { store.set(K_BOX, store.get(K_BOX, []).filter((x) => !done.has(bk(x)))); flushing = false; }
    if (sent && !pick) { msg = [`${sent} ${sent === 1 ? "punch" : "punches"} made with no signal ${sent === 1 ? "was" : "were"} sent.`, "ok"]; render(); }
  }

  document.addEventListener("input", (ev) => { if (ev.target.id === "k-q") { q = ev.target.value; render(); } });
  document.addEventListener("click", async (ev) => {
    const t = ev.target; clearTimeout(idle); if (pick) idle = setTimeout(() => reset(), 45000);
    const pk = t.closest("[data-k-pick]"); if (pk) { pick = pk.dataset.kPick; msg = null; ask = false; locate(); render(); idle = setTimeout(() => reset(), 45000); return; }
    if (t.closest("[data-k-back]")) { reset(); return; }
    const pu = t.closest("[data-k-punch]"); if (pu) { punch(pu.dataset.kPunch); return; }
    if (t.closest("[data-k-forget]")) { forget = true; render(); $("#k-pinv")?.focus(); return; }
    if (t.closest("[data-k-forget-no]")) { forget = false; render(); }
  });
  document.addEventListener("submit", async (ev) => {
    if (ev.target.id === "k-pin") { ev.preventDefault(); const pin = String(new FormData(ev.target).get("pin") || "");
      try { const { data, error } = await sb.rpc("hr_kiosk_pin", { p_key: key, p_pin: pin }); if (error) throw error;
        if (!data) { msg = ["Wrong PIN.", "bad"]; render(); return; }
        if (store.get(K_BOX, []).length) { forget = false; msg = ["Some punches are still waiting for signal. Remove the key once they're sent.", "bad"]; render(); return; }
        store.set(K_KEY, null); store.set(K_ROSTER, null); store.set(K_RECENT, null); key = roster = null; forget = false; reset(); }
      catch (e) { msg = [/locked/.test(String(e?.message)) ? "Too many wrong PINs. HR can revoke this key and make a new one." : "Couldn't check the PIN. Check the signal.", "bad"]; render(); }
      return; }
    if (ev.target.id !== "k-setup") return; ev.preventDefault(); const k = String(new FormData(ev.target).get("key") || "").trim(); if (!k) return;
    try { await loadRoster(k); key = k; store.set(K_KEY, k); setupErr = null; render(); }
    catch (e) { setupErr = /bad_key/.test(String(e?.message)) ? "That key doesn't work. Check it with HR." : "Couldn't reach the server. Check the signal and try again."; render(); }
  });
  window.addEventListener("online", () => setTimeout(flush, 1500));
  setInterval(flush, 30000);
  setInterval(() => { if (key) loadRoster(key).catch((e) => { if (/bad_key/.test(String(e?.message))) { roster = null; setupErr = ERR.bad_key; render(); } }); }, 30 * 60000);
  setInterval(() => { const c = $("header .clk"); if (c) c.innerHTML = `${esc(tFmt.format(new Date()))}<small>${esc(dFmt.format(new Date()))}</small>`; }, 15000);

  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  render();
  if (key) loadRoster(key).then(() => { render(); flush(); }).catch((e) => { if (/bad_key/.test(String(e?.message))) { roster = null; setupErr = ERR.bad_key; } render(); });
})();
