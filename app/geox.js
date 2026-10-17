/* ---------- Geofence: rules (record, needs HR approval, or block), live area check on the phone and kiosk, and HR's review of punches made outside a site area ---------- */
Object.assign(S, { geoAll: false, geoF: { from: null, to: null, st: "WAIT" } });
const FENCE_MODES = [["RECORD", "Record only: allow the punch and flag it for HR"], ["APPROVE", "Needs HR approval: the employee gives a reason, and the punch counts once HR approves"], ["BLOCK", "Block: no time in or out outside the site area"], ["MIXED", "Block outside, approve without location: no time in or out outside the site area, and a punch with no location counts once HR approves"]];
const fenceMode = () => SET().fenceMode || "RECORD";
{
  const tk = NAV.find(([g]) => g === "Timekeeping");
  if (tk) { const it = tk[1]; const i = it.findIndex(([v]) => v === "clockin"); it.splice(i >= 0 ? i + 1 : it.length, 0, ["geofence", "Geofence review", "pin"]); }
  SECTION_OF.geofence = "clockin";
}

/* Inside any company site counts when that rule is on. */
{ const b = fence; fence = (p) => {
    let f = b(p);
    if (f.state === "out" && SET().fenceAnySite) for (const s of siteList()) { const g = siteGeo(s.id); if (!g || s.id === f.site) continue; const d = meters(p, g); if (d <= (g.radius || 150) + Math.min(p.acc || 0, 100)) { f = { state: "in", site: s.id, dist: d, text: `Inside ${s.name} (${distText(d)})`, other: true }; break; } }
    if (p.rev === "REJ") f = { ...f, text: `${f.text} · rejected by HR` }; else if (p.rev === "OK" && f.state !== "in") f = { ...f, text: `${f.text} · approved by HR` }; else if (p.needsOk) f = { ...f, text: `${f.text} · waiting for HR` };
    return f; }; }
/* Rejected punches, and punches still waiting for approval, stay off the time sheet. */
/* HR decides from the punch's own location whether it needs approval; the phone's own "needs approval" flag is not trusted. */
const punchNeedsOk = (p) => hrDev(p.dev) ? !!p.needsOk : fenceMode() !== "RECORD" && ["out", "nogps"].includes(fence({ ...p, rev: null, needsOk: false }).state);
{ const b = punchesIn; punchesIn = (from, to) => { const l = b(from, to).map((p) => ({ ...p, needsOk: punchNeedsOk(p) })); return S.geoAll ? l : l.filter((p) => p.rev !== "REJ" && !(p.needsOk && p.rev !== "OK")); }; }
for (const v of ["clockin", "kiosk"]) { const b = VIEWS[v]; VIEWS[v] = (...a) => { S.geoAll = true; try { return b(...a); } finally { S.geoAll = false; } }; }

/* The phone can't read site records, so HR's app sends the areas with each employee's summary. */
{ const b = buildSummary; buildSummary = (e) => { const s = b(e); const mine = siteOf(e); const any = !!SET().fenceAnySite;
    s.fences = siteList().map((x) => { const g = siteGeo(x.id); return g && (any || x.id === mine) ? { name: x.name, lat: g.lat, lng: g.lng, radius: g.radius || 150, mine: x.id === mine } : null; }).filter(Boolean);
    s.fenceMode = fenceMode(); return s; }; }
function phoneFence(g, s) {
  const fs = s?.fences || [];
  if (!g) return { state: "wait", text: "Finding your location…" };
  if (g.lat == null) return { state: "nogps", text: g.error || "No location" };
  if (!fs.length) return { state: "nofence", text: `Location found (±${g.acc} m). No site area set yet.` };
  const rows = fs.map((f) => ({ f, d: meters(g, f), ok: meters(g, f) <= f.radius + Math.min(g.acc || 0, 100) }));
  const hit = rows.find((r) => r.ok && r.f.mine) || rows.find((r) => r.ok);
  if (hit) return { state: "in", site: hit.f.name, dist: hit.d, f: hit.f, text: `You're inside ${hit.f.name} (${distText(hit.d)} from the pin)` };
  const near = rows.find((r) => r.f.mine) || rows.sort((a, b) => a.d - b.d)[0];
  return { state: "out", site: near.f.name, dist: near.d, f: near.f, text: `You're ${distText(Math.max(0, near.d - near.f.radius))} outside ${near.f.name}` };
}
/* A small map: the site circle, the pin, and you with your GPS accuracy. */
function fenceRadar(g, f) {
  if (!g || g.lat == null || !f) return `<div class="gf-radar gf-none">${icon("pin", 28)}</div>`;
  const dx = (g.lng - f.lng) * 111320 * Math.cos((f.lat * Math.PI) / 180), dy = (g.lat - f.lat) * 110540; const d = Math.hypot(dx, dy);
  const span = Math.max(f.radius * 1.5, Math.min(d, f.radius * 5) * 1.15 + Math.min(g.acc || 0, f.radius)); const k = 88 / span;
  const far = d > span; const ux = far ? (dx / d) * 84 : dx * k, uy = far ? (dy / d) * 84 : dy * k; const inside = d <= f.radius + Math.min(g.acc || 0, 100);
  return `<svg class="gf-radar" viewBox="-100 -100 200 200" role="img" aria-label="${inside ? "You are inside the site area" : "You are outside the site area"}">
    <circle r="96" class="gf-bg"/><circle r="${(f.radius * k).toFixed(1)}" class="gf-area${inside ? " in" : ""}"/><circle r="3" class="gf-pin"/>
    ${g.acc && !far ? `<circle cx="${ux.toFixed(1)}" cy="${(-uy).toFixed(1)}" r="${Math.min(90, g.acc * k).toFixed(1)}" class="gf-acc"/>` : ""}
    <circle cx="${ux.toFixed(1)}" cy="${(-uy).toFixed(1)}" r="7" class="gf-me${inside ? " in" : ""}"/>${far ? `<text x="${ux.toFixed(1)}" y="${(-uy + (uy > 0 ? 20 : -12)).toFixed(1)}" text-anchor="middle" class="gf-far">${esc(distText(Math.round(d)))}</text>` : ""}</svg>`;
}
function fencePanel(fz, mode, g, forKiosk) {
  const cls = fz.state === "in" ? "in" : fz.state === "out" || (fz.state === "nogps" && mode !== "RECORD") ? "out" : "";
  const blocked = fz.state !== "wait" && fenceBlocks(fz, mode); const ask = fenceAsks(fz, mode);
  const who = forKiosk ? "This worker" : "You";
  const note = fz.state === "in" ? (g?.acc ? `GPS accuracy ±${g.acc} m.` : "") : blocked ? (fz.state === "nogps" ? "Turn on location for this page, then refresh. Time in and out only work inside the site area." : `Time in and out only work inside the site area. Move closer, or ${forKiosk ? "check the worker's assignment" : "use Ask HR if you're on official business"}.`)
    : ask ? `${who} can still punch, but HR has to approve it before it counts.` : fz.state === "out" ? "The punch is saved and flagged for HR." : fz.state === "nogps" ? "The punch is saved without a location and HR checks it." : "";
  return `<div class="gf-panel ${cls}" data-fence="${fz.state}">${fenceRadar(g, fz.f)}<div class="gf-text"><b>${esc(fz.text)}</b>${note ? `<span>${esc(note)}</span>` : ""}
    <button type="button" class="link" data-geo-refresh="${forKiosk ? "kiosk" : "self"}">Refresh location</button></div></div>
    ${ask ? `<div class="field"><label for="${forKiosk ? "kc-why" : "sf-why"}">${fz.state === "nogps" ? "Reason there's no location" : "Reason for punching outside the area"} <span class="req">*</span></label><input class="input" id="${forKiosk ? "kc-why" : "sf-why"}" maxlength="200" placeholder="e.g. Site meeting at the client's office" autocomplete="off"></div>` : ""}`;
}
// MIXED (Glenn 2026-10-17): outside the area is blocked; no location is allowed with a reason and waits for HR's approval.
const fenceBlocks = (fz, mode) => ((mode === "BLOCK" && (fz.state === "out" || fz.state === "nogps")) || (mode === "MIXED" && fz.state === "out")) || (mode !== "RECORD" && fz.state === "wait");
const fenceAsks = (fz, mode) => (mode === "APPROVE" && (fz.state === "out" || fz.state === "nogps")) || (mode === "MIXED" && fz.state === "nogps");
const GRID = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

/* ---------- employee's own phone ---------- */
function subMeSum() { if (!S.meSumSub && S.self?.uid && S.db) { S.meSumSub = true; S.db.doc(`clockins/${S.self.uid}/me/summary`).onSnapshot((d) => { S.meSum = d.exists ? d.data() : null; render(); }, () => { S.meSum = null; render(); }); } }
{ const bv = selfView; selfView = () => {
    const h = bv(); const M = S.self; if (!M?.claim || M.error || !h.includes('data-self-punch="IN"')) return h;
    subMeSum(); const s = S.meSum; const mode = s?.fenceMode || "RECORD"; const fz = phoneFence(M.geo, s);
    const wait = Object.values(M.today?.punches || {}).filter((p) => p.needsOk && !p.rev).length;
    let out = h.replace(/<p style="margin:0;font-size:14px">[\s\S]*?<\/p>\s*(?=<div style="display:grid)/, "").replace(GRID, fencePanel(fz, mode, M.geo, false) + (wait ? `<p class="t-warn" style="margin:0;font-size:13px">${wait} punch${wait > 1 ? "es" : ""} today waiting for HR approval.</p>` : "") + GRID);
    if (fenceBlocks(fz, mode)) out = out.replace(/data-self-punch="(IN|OUT)"/g, "$& disabled");
    return out; }; }
selfPunch = async function (type) {
  const M = S.self; if (!M.photo) return; const s = S.meSum; const mode = s?.fenceMode || "RECORD"; const fz = phoneFence(M.geo, s);
  if (fenceBlocks(fz, mode)) { toast(fz.state === "nogps" ? "Turn on location first. Time in and out only work inside the site area." : "You're outside the site area, so this punch can't be saved."); return; }
  let why = null; if (fenceAsks(fz, mode)) { why = ($("#sf-why")?.value || "").trim(); if (!why) { toast(fz.state === "nogps" ? "Give the reason there's no location." : "Give the reason for punching outside the site area."); $("#sf-why")?.focus(); return; } }
  M.busy = true; render();
  try {
    const c = await shrinkCanvas(M.photo, 160); const g = M.geo || {};
    const punch = { t: new Date().toISOString(), type, photo: c.toDataURL("image/jpeg", 0.6), lat: g.lat ?? null, lng: g.lng ?? null, acc: g.acc ?? null, geoError: g.error || null,
      fstate: fz.state, dist: fz.dist ?? null, fsite: fz.site || null, why, needsOk: why ? true : null };
    const date = manilaDay(punch.t); const ref = S.db.doc(`clockins/${M.uid}/days/${date}`); const id = uid(); const cur = await ref.get();
    if (cur.exists) await ref.update({ punches: { [id]: punch } }); else await ref.set({ d: date, dev: M.uid, punches: { [id]: punch } });
    if (M.photoUrl) URL.revokeObjectURL(M.photoUrl); Object.assign(M, { photo: null, photoUrl: null, busy: false });
    toast(`${type === "IN" ? "Time in" : "Time out"} saved at ${timeFmt.format(new Date(punch.t))}.${why ? " HR will review it." : ""}`); getGeo().then((x) => { M.geo = x; render(); }); render();
  } catch { M.busy = false; toast("Couldn't save. Check your connection and try again."); render(); }
};

/* ---------- site kiosk ---------- */
{ const b = VIEWS.kiosk; VIEWS.kiosk = (...a) => { let h = b(...a); const K = S.kiosk; if (!K.emp || !h.includes("data-kiosk-in")) return h;
    const g = K.geo; const mode = fenceMode(); const fz = !g ? { state: "wait", text: "Finding the location…" } : fence({ ...g, site: K.site }); const ar = siteGeo(K.site);
    fz.f = ar ? { ...ar, radius: ar.radius || 150 } : null; if (fz.other) { const og = siteGeo(fz.site); fz.f = og ? { ...og, radius: og.radius || 150 } : fz.f; }
    h = h.replace(/<p style="margin:0;font-size:14px">[\s\S]*?<\/p>\s*(?=<div style="display:grid)/, "").replace(GRID, fencePanel(fz, mode, g, true) + GRID);
    if (fenceBlocks(fz, mode)) h = h.replace(/data-kiosk-(in|out) /g, "$&disabled ");
    return h; }; }
kioskPunch = async function (type) {
  const K = S.kiosk; const e = S.emps.get(K.emp); if (!e || !K.photo) return; const g = K.geo || {}; const mode = fenceMode(); const fz = fence({ ...g, lat: g.lat ?? null, site: K.site });
  if (fenceBlocks(fz, mode)) { toast("This phone is outside the site area, so the punch can't be saved."); return; }
  let why = null; if (fenceAsks(fz, mode)) { why = ($("#kc-why")?.value || "").trim(); if (!why) { toast(fz.state === "nogps" ? "Give the reason there's no location." : "Give the reason for punching outside the site area."); $("#kc-why")?.focus(); return; } }
  K.busy = true; render();
  try {
    let photo = null;
    if (S.assets) { const c = await shrinkCanvas(K.photo, 480); const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.8)); photo = (await S.assets.upload(blob)).id; }
    else { const c = await shrinkCanvas(K.photo, 160); photo = c.toDataURL("image/jpeg", 0.6); }
    const punch = { t: new Date().toISOString(), type, empId: e.id, site: K.site, photo, lat: g.lat ?? null, lng: g.lng ?? null, acc: g.acc ?? null, geoError: g.error || null, fstate: fz.state, dist: fz.dist ?? null, why, needsOk: why ? true : null };
    await savePunch("kiosk-" + K.site, punch, { kiosk: true, site: K.site, name: `Kiosk at ${siteName(K.site)}` });
    toast(`${type === "IN" ? "Time in" : "Time out"} saved for ${fullName(e)} at ${timeFmt.format(new Date(punch.t))}.${why ? " Waiting for HR approval." : ""}`); resetKiosk(); render();
  } catch { K.busy = false; toast("Couldn't save the punch. Check the connection and try again."); render(); }
};

/* ---------- HR: rules on the Site areas tab ---------- */
{ const b = clockSitesTab; clockSitesTab = () => { const Sx = SET(); const sites = siteList(); const set = sites.filter((s) => siteGeo(s.id)).length;
    return b() + `<section class="card"><div class="card-head"><h2>Geofence rules</h2><span class="t-muted" style="font-size:13px">${set} of ${sites.length} sites have an area</span></div>
      ${S.canEdit ? `<form id="geo-rules-form" class="stack" style="gap:12px" data-keep>
        <fieldset class="gf-modes"><legend class="lbl">When someone punches outside their site area</legend>${FENCE_MODES.map(([k, l]) => `<label><input type="radio" name="gf-mode" value="${k}"${fenceMode() === k ? " checked" : ""}> ${esc(l)}</label>`).join("")}</fieldset>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="gf-any"${Sx.fenceAnySite ? " checked" : ""}> Being inside any company site counts, not only the assigned one</label>
        <div><button class="btn btn-primary">Save rules</button></div></form>`
      : `<p style="margin:0;font-size:14px">${esc(FENCE_MODES.find(([k]) => k === fenceMode())[1])}.</p>`}
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Phones check the area live before the punch, and HR reviews flagged punches on <button class="link" data-go="geofence">Geofence review</button>. Sites with no area set are never blocked.</p></section>`; }; }
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "geo-rules-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const mode = document.querySelector('[name="gf-mode"]:checked')?.value || "RECORD";
  await saveSettings({ fenceMode: mode, fenceAnySite: $("#gf-any").checked }, `Set the geofence rule to ${FENCE_MODES.find(([k]) => k === mode)[1].split(":")[0].toLowerCase()}`);
}, true);

/* ---------- HR: Geofence review ---------- */
VIEWS.geofence = () => {
  const F = S.geoF; const to = F.to || todayISO(), from = F.from || addDays(to, -6); loadClock(from, to);
  S.geoAll = true; let all; try { all = punchesIn(from, to).filter((p) => !p.bio); } finally { S.geoAll = false; }
  const rows = all.map((p) => ({ p, f: fence(p) })); const flagged = rows.filter(({ p, f }) => f.state === "out" || f.state === "nogps" || p.needsOk || p.rev);
  const waiting = flagged.filter(({ p }) => !p.rev); const n = (s) => rows.filter(({ f }) => f.state === s).length; const fenced = rows.filter(({ f }) => f.state !== "nofence" && f.state !== "nogps").length;
  const list = (F.st === "WAIT" ? waiting : F.st === "OUT" ? flagged.filter(({ f }) => f.state === "out") : F.st === "GPS" ? flagged.filter(({ f }) => f.state === "nogps") : flagged).slice().reverse();
  const stChip = (p) => p.rev === "OK" ? '<span class="chip c-ok">Approved</span>' : p.rev === "REJ" ? '<span class="chip c-bad">Rejected</span>' : p.needsOk ? '<span class="chip c-warn">Waiting</span>' : '<span class="chip c-gray">Not reviewed</span>';
  const ed = S.canEdit;
  return head("Punches made outside a site area or without a location", "Geofence review", `<button class="btn btn-ghost" style="background:#fff" data-go="clockin">${icon("phone")}Phone clock-in</button>`) + `
    <section class="stats">${dxTile("Inside the area", fenced ? `${Math.round((n("in") / fenced) * 100)}%` : "—", `${n("in")} of ${fenced} punches with an area`, "t-ok")}${dxTile("Outside the area", n("out"), "in this date range", n("out") ? "t-bad" : "t-muted")}${dxTile("No location", n("nogps"), "phone didn't share it", n("nogps") ? "t-warn" : "t-muted")}${dxTile("Waiting for review", waiting.length, ["APPROVE", "MIXED"].includes(fenceMode()) ? "not on the time sheet yet" : "flagged punches", waiting.length ? "t-warn" : "t-muted")}</section>
    <section class="card"><div class="card-head"><h2>Flagged punches</h2><span style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      <label class="field" style="margin:0"><span class="lbl">From</span><input class="input" type="date" id="gf-from" value="${from}" max="${to}"></label><label class="field" style="margin:0"><span class="lbl">To</span><input class="input" type="date" id="gf-to" value="${to}" max="${todayISO()}"></label></span></div>
      <div class="tabs" role="tablist" style="margin-bottom:12px">${[["WAIT", `Waiting (${waiting.length})`], ["OUT", "Outside"], ["GPS", "No location"], ["ALL", "All flagged"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${F.st === k}" data-gf-st="${k}">${l}</button>`).join("")}</div>
      <p class="t-muted" style="margin:0 0 10px;font-size:13px">Rule now: ${esc(FENCE_MODES.find(([k]) => k === fenceMode())[1].split(":")[0])}. Rejected punches are left off the time sheet${["APPROVE", "MIXED"].includes(fenceMode()) ? ", and punches waiting for approval stay off until approved" : ""}. <button class="link" data-clock-tab="sites">Change the rule</button></p>
      ${S.clockLoading.size ? '<p class="t-muted" style="margin:0 0 10px;font-size:14px">Loading punches…</p>' : ""}
      <div class="table-wrap"><table class="gf-table"><thead><tr><th>Photo</th><th>Employee</th><th>When</th><th>Where</th><th>Reason</th><th>Status</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.map(({ p, f }) => { const e = S.emps.get(p.empId); const key = `${p.dev}|${p.d}|${p.id}`;
        return `<tr><td>${p.photo ? `<img src="${esc(photoSrc(p))}" alt="Selfie of ${esc(e ? fullName(e) : "unlinked account")}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block">` : '<span class="chip c-warn">No photo</span>'}</td>
          <td>${e ? `<b>${esc(fullName(e))}</b><div class="t-muted" style="font-size:13px">${esc(e.no)} · ${esc(siteName(siteOf(e)))}</div>` : '<span class="chip c-warn">Not linked</span>'}</td>
          <td style="white-space:nowrap">${esc(fmtDate(p.d))}<div class="t-muted" style="font-size:13px">${p.type === "OUT" ? "Out" : "In"} at ${esc(timeFmt.format(new Date(p.t)))}</div></td>
          <td><span class="chip ${FENCE_CHIP[f.state]}">${esc(f.text.replace(/ · (waiting for HR|approved by HR|rejected by HR)$/, ""))}</span>${geoLine(p)}<div class="t-muted" style="font-size:12px">${p.kiosk ? `Kiosk at ${esc(siteName(p.site))}` : "Own phone"}</div></td>
          <td style="max-width:240px;font-size:14px">${p.why ? esc(p.why) : '<span class="t-muted">—</span>'}</td><td>${stChip(p)}${p.revBy ? `<div class="t-muted" style="font-size:12px">${esc(empName(p.revBy) || "HR")}</div>` : ""}</td>
          ${ed ? `<td class="num" style="white-space:nowrap">${p.rev !== "OK" ? `<button class="btn btn-primary btn-sm" data-gf-ok="${esc(key)}">Approve</button> ` : ""}${p.rev !== "REJ" ? `<button class="btn btn-ghost btn-sm" data-gf-rej="${esc(key)}">Reject</button>` : ""}</td>` : ""}</tr>`; }).join("") || `<tr><td colspan="${ed ? 7 : 6}" class="empty">${F.st === "WAIT" ? "Nothing waiting for review in these dates." : "No flagged punches in these dates."}</td></tr>`}
      </tbody></table></div></section>`;
};
async function reviewPunch(key, rev) {
  const [dev, d, id] = key.split("|"); const k = `${dev}/${d}`; const day = S.clockDays.get(k); const p = day?.punches?.[id]; if (!p) return;
  // Reviews are kept in an HR-only collection so an employee can't approve or un-reject their own punch.
  const r = { dev, d, id, rev, by: S.myId || null, at: new Date().toISOString() };
  try { await S.db.doc(`punchrev/${revId(dev, d, id)}`).set(r); } catch { toast("Couldn't save. Try again."); return; }
  S.punchRevs.set(`${dev}|${d}|${id}`, r); S.ver++;
  const e = S.emps.get(p.empId || S.clockLinks[dev]); logActivity(`${rev === "OK" ? "Approved" : "Rejected"} an outside-area punch${e ? ` of ${fullName(e)}` : ""} on ${fmtDate(d)}`); toast(rev === "OK" ? "Approved. It counts on the time sheet." : "Rejected. It's left off the time sheet."); render();
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-geo-refresh],[data-gf-ok],[data-gf-rej],[data-gf-st]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.geoRefresh) { const tgt = d.geoRefresh === "kiosk" ? S.kiosk : S.self; if (!tgt) return; tgt.geo = null; render(); const g = await getGeo(); tgt.geo = g; render(); return; }
  if (d.gfSt) { S.geoF.st = d.gfSt; render(); return; }
  if (!S.canEdit) return;
  if (d.gfOk) return reviewPunch(d.gfOk, "OK");
  if (d.gfRej) return reviewPunch(d.gfRej, "REJ");
}, true);
document.addEventListener("change", (ev) => { const t = ev.target; if (t.id !== "gf-from" && t.id !== "gf-to") return;
  S.geoF[t.id === "gf-from" ? "from" : "to"] = t.value || null; if (S.geoF.from && S.geoF.to && S.geoF.from > S.geoF.to) S.geoF.from = S.geoF.to; render(); });
