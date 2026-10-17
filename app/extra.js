/* ---------- phone clock-in, biometric device files, FlexBen and fringe benefit tax ---------- */
Object.assign(S, {
  flex: new Map(), fringe: new Map(), clockDevs: new Map(), clockLinks: {}, clockDays: new Map(), clockLoaded: new Set(), clockLoading: new Set(),
  clockDate: null, clockTab: "punches", flexTab: "claims", flexFilter: { q: "", status: "PENDING", page: 1 }, balFilter: { q: "", page: 1 },
  kiosk: { site: null, q: "", emp: null, photo: null, photoUrl: null, geo: null, busy: false }, selfMode: false, self: null,
});
Object.assign(TCOLS, { flex: "flex", fringe: "fringe" });
Object.assign(ICON, {
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
});
{
  const tp = NAV.find(([g]) => g === "Time & Pay")[1];
  tp.splice(tp.findIndex(([v]) => v === "attendance") + 1, 0, ["clockin", "Phone Clock-in", "phone"]);
  tp.splice(tp.findIndex(([v]) => v === "loans") + 1, 0, ["flex", "FlexBen", "gift"]);
  Object.assign(SECTION_OF, { clockin: "clockin", kiosk: "clockin", flex: "flex", flexForm: "flex", fringeForm: "tax" });
}

function bootExtra(db) {
  for (const [col, n] of [["flex", 3000], ["fringe", 1000]])
    db.collection(col).limit(n).onSnapshot((snap) => { S[TCOLS[col]] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {});
  db.doc("org/clocklinks").onSnapshot((d) => { S.clockLinks = d.exists ? d.data().links || {} : {}; refresh(); }, () => {});
  let first = true;
  db.collection("clockins").limit(1000).onSnapshot((snap) => {
    S.clockDevs = new Map(snap.docs.map((d) => { const x = { id: d.id, ...d.data() }; if (!hrDev(d.id)) { delete x.kiosk; delete x.bio; delete x.adj; } return [d.id, x]; }));
    if (first) { first = false; loadClock(todayISO(), todayISO()); } else refresh();
  }, () => {});
}
async function clearExtraSample() {
  const links = Object.fromEntries(Object.entries(S.clockLinks).filter(([, id]) => !S.emps.get(id)?.sample));
  if (Object.keys(links).length !== Object.keys(S.clockLinks).length) await S.db.doc("org/clocklinks").set({ links });
  for (const dev of S.clockDevs.values()) if (dev.sample) {
    const snap = await S.db.collection(`clockins/${dev.id}/days`).limit(400).get();
    for (const d of snap.docs) await S.db.doc(`clockins/${dev.id}/days/${d.id}`).delete();
    await S.db.doc(`clockins/${dev.id}`).delete();
  }
  S.clockDays.clear(); S.clockLoaded.clear();
}

/* ---------- ranks (FlexBen tier and fringe benefit tax) ---------- */
const RANKS = [["RF", "Rank and file"], ["SUP", "Supervisory"], ["MGR", "Managerial"]];
function rankOf(e) {
  if (e.rank) return e.rank; const t = pos(e.posId)?.title || "";
  if (/manager|director|head|chief|president/i.test(t)) return "MGR";
  if (/supervisor|foreman|engineer|lead|architect|surveyor|accountant/i.test(t)) return "SUP";
  return "RF";
}
const rankName = (code) => RANKS.find(([c]) => c === code)?.[1] || "Rank and file";

/* ---------- sites and geofences ---------- */
const siteGeo = (id) => (id === "office" ? SET().officeGeo || null : S.projects.get(id)?.geo || null);
const siteName = (id) => (id === "office" ? "Head office" : S.projects.get(id)?.name || "Removed site");
const siteOf = (e) => (e?.projectId && S.projects.get(e.projectId) ? e.projectId : "office");
const siteList = () => [{ id: "office", name: "Head office" }, ...[...S.projects.values()].filter((p) => p.status !== "COMPLETED").sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name }))];
function meters(a, b) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const distText = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
/* Checks a punch against the site it was made at (kiosk) or the person's assigned site (own phone). */
function fence(p) {
  const site = p.site || siteOf(S.emps.get(p.empId)); const g = siteGeo(site);
  if (p.lat == null) return { state: "nogps", site, text: p.geoError || "No location" };
  if (!g) return { state: "nofence", site, text: `No area set for ${siteName(site)}` };
  const dist = meters(p, g); const ok = dist <= (g.radius || 150) + Math.min(p.acc || 0, 100);
  return { state: ok ? "in" : "out", site, dist, text: ok ? `Inside ${siteName(site)} (${distText(dist)})` : `${distText(dist)} from ${siteName(site)}` };
}
/* Where a phone punch was made: coordinates, accuracy and a map link. */
const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
const geoLine = (p) => (p?.lat == null ? "" : `<div class="geo-line"><a href="${esc(mapUrl(p))}" target="_blank" rel="noopener" title="Open this spot in Google Maps">${icon("pin", 12)}${esc(Number(p.lat).toFixed(5))}, ${esc(Number(p.lng).toFixed(5))}</a>${p.acc ? ` <span>±${esc(p.acc)} m</span>` : ""}</div>`);
const FENCE_CHIP = { in: "c-ok", out: "c-bad", nogps: "c-warn", nofence: "c-gray" };

/* ---------- photo and location capture ---------- */
async function shrinkCanvas(file, max) {
  const url = URL.createObjectURL(file); const img = new Image();
  try { await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c;
}
function getGeo() {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok({ error: "This browser can't share its location" });
    try {
      navigator.geolocation.getCurrentPosition((p) => ok({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
        (er) => ok({ error: er.code === 1 ? "Location permission refused" : "Location not found" }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    } catch { ok({ error: "This page can't read the location here" }); }
  });
}
const photoSrc = (p) => (!p.photo ? "" : p.photo.startsWith("data:") ? p.photo : "/_blob/" + p.photo);
const timeFmt = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const manilaDay = (iso) => new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 10);
async function savePunch(dev, punch, devInfo) {
  const date = manilaDay(punch.t); const id = uid(); const ref = S.db.doc(`clockins/${dev}/days/${date}`); const clean = JSON.parse(JSON.stringify(punch));
  if (devInfo && !S.clockDevs.has(dev)) { await S.db.doc(`clockins/${dev}`).set(devInfo); S.clockDevs.set(dev, { id: dev, ...devInfo }); }
  const cur = await ref.get();
  if (cur.exists) await ref.update({ punches: { [id]: clean } }); else await ref.set({ d: date, dev, punches: { [id]: clean } });
  const k = `${dev}/${date}`; const prev = S.clockDays.get(k) || { d: date, dev, punches: {} }; S.clockDays.set(k, { ...prev, punches: { ...prev.punches, [id]: clean } }); S.ver++;
  return id;
}

/* ---------- reading clock-ins (HR) ---------- */
// A second caller for the same range waits for the read already running instead of getting half-loaded punches.
const clockInflight = new Map();
function loadClock(from, to, force) {
  const key = `${from}:${to}`; if (clockInflight.has(key)) return clockInflight.get(key);
  const p = loadClock1(from, to, force).finally(() => clockInflight.delete(key)); clockInflight.set(key, p); return p;
}
async function loadClock1(from, to, force) {
  const key = `${from}:${to}`; if (!S.db || S.clockLoading.has(key) || (!force && S.clockLoaded.has(key))) return;
  S.clockLoading.add(key);
  try {
    await Promise.all([...S.clockDevs.keys()].map(async (dev) => {
      const snap = await S.db.collection(`clockins/${dev}/days`).where("d", ">=", from).where("d", "<=", to).get();
      for (const d of snap.docs) S.clockDays.set(`${dev}/${d.data().d}`, d.data());
    }));
    S.clockLoaded.add(key);
  } catch { /* shown as no punches */ } finally { S.clockLoading.delete(key); S.ver++; refresh(); }
}
function punchesIn(from, to) {
  const out = [];
  for (const [k, day] of S.clockDays) {
    if (day.d < from || day.d > to) continue; const dev = k.slice(0, k.lastIndexOf("/")); const info = S.clockDevs.get(dev) || {};
    const own = hrDev(dev);
    for (const [id, p0] of Object.entries(day.punches || {})) {
      if (!p0 || !["IN", "OUT"].includes(p0.type) || !/^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(p0.t || "") || isNaN(Date.parse(p0.t))) continue;
      const rv = S.punchRevs?.get(`${dev}|${day.d}|${id}`);
      const p = { ...p0, lat: Number.isFinite(Number(p0.lat)) && p0.lat !== null ? Number(p0.lat) : null, lng: Number.isFinite(Number(p0.lng)) && p0.lng !== null ? Number(p0.lng) : null,
        rev: rv?.rev ?? (own ? p0.rev : null), revBy: rv?.by ?? (own ? p0.revBy : null), revAt: rv?.at ?? (own ? p0.revAt : null), ...(own ? {} : { adj: null }) };
      const empId = (own ? p.empId : null) || S.clockLinks[dev] || null;
      out.push({ ...p, id, dev, d: day.d, empId, kiosk: !!info.kiosk, bio: !!info.bio, site: p.site || info.site || null, claim: info.kiosk ? null : info });
    }
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

VIEWS.clockin = () => {
  const tab = S.clockTab; const claims = [...S.clockDevs.values()].filter((d) => !d.kiosk && !d.bio);
  const waiting = claims.filter((c) => !S.clockLinks[c.id]).length;
  const tabs = `<div class="tabs on-blue" role="tablist">${[["punches", "Punches"], ["links", `Employee accounts${waiting ? ` (${waiting} waiting)` : ""}`], ["sites", "Site areas"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-clock-tab="${k}">${l}</button>`).join("")}</div>`;
  const actions = `${S.canEdit ? `<button class="btn btn-gold" data-go="kiosk">${icon("camera")}Open site kiosk</button>` : ""}`;
  const top = head("Time in and out from a phone, with a selfie and the location", "Phone Clock-in", actions) + tabs;
  if (tab === "links") return top + clockLinksTab(claims);
  if (tab === "sites") return top + clockSitesTab();
  const date = S.clockDate || todayISO(); loadClock(date, date);
  const list = punchesIn(date, date).filter((x) => !x.bio); const f = list.map(fence); const people = new Set(list.map((p) => p.empId).filter(Boolean)).size;
  const n = (s) => f.filter((x) => x.state === s).length;
  const pid = S.periodId || curPeriod(); const p = PAY.period(pid);
  return top + `
    <section class="stats">
      <div class="card stat"><span class="label">Punches on ${esc(fmtDate(date))}</span><span class="value">${list.length}</span><span class="note t-muted">${people} people</span></div>
      <div class="card stat"><span class="label">Outside the site area</span><span class="value">${n("out")}</span><span class="note ${n("out") ? "t-bad" : "t-muted"}">${n("out") ? "check before payroll" : "none"}</span></div>
      <div class="card stat"><span class="label">No location</span><span class="value">${n("nogps")}</span><span class="note t-muted">phone didn't share it</span></div>
      <div class="card stat"><span class="label">Kiosks and phones</span><span class="value">${[...S.clockDevs.values()].filter((d) => !d.bio).length}</span><span class="note t-muted">${[...S.clockDevs.values()].filter((d) => d.kiosk).length} site kiosks</span></div>
    </section>
    <section class="card"><div class="card-head"><h2>Punches</h2><span style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><label class="field" style="margin:0"><span class="lbl">Date</span><input class="input" type="date" id="clock-date" value="${date}" max="${todayISO()}"></label><button class="btn btn-ghost btn-sm" data-clock-refresh>Refresh</button></span></div>
      ${S.clockLoading.size ? '<p class="t-muted" style="margin:0 0 10px;font-size:14px">Loading punches…</p>' : ""}
      <div class="table-wrap"><table><thead><tr><th>Photo</th><th>Employee</th><th>Time</th><th>Type</th><th>Where</th><th>From</th></tr></thead><tbody>
      ${list.map((x, i) => { const e = S.emps.get(x.empId); const fz = f[i];
        return `<tr><td>${x.photo ? `<img src="${esc(photoSrc(x))}" alt="Selfie of ${esc(e ? fullName(e) : "unlinked account")}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block">` : '<span class="chip c-warn">No photo</span>'}</td>
          <td>${e ? `<b>${esc(fullName(e))}</b><div class="t-muted" style="font-size:13px">${esc(e.no)}</div>` : `<span class="chip c-warn">Not linked</span><div class="t-muted" style="font-size:13px">${esc(x.claim?.name || "")} ${esc(x.claim?.empNo || "")}</div>`}</td>
          <td class="num">${esc(timeFmt.format(new Date(x.t)))}</td><td><span class="chip ${x.type === "OUT" ? "c-gray" : "c-blue"}">${x.type === "OUT" ? "Out" : "In"}</span></td>
          <td><span class="chip ${FENCE_CHIP[fz.state]}">${esc(fz.text)}</span>${geoLine(x)}</td>
          <td class="t-muted" style="font-size:13px">${x.kiosk ? `Kiosk at ${esc(siteName(x.site))}` : "Own phone"}${x.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">No phone punches on this date.</td></tr>`}
      </tbody></table></div></section>
    ${S.canEdit ? `<section class="card"><div class="card-head"><h2>Send to the time sheet</h2></div>
      <p style="margin:0 0 12px;font-size:14px;max-width:80ch">Works out lateness, undertime, overtime, night hours and rest day or holiday hours for <b>${esc(p.label)}</b> from linked phone and kiosk punches, the same way as biometric files. You see a preview before anything is saved.${n("out") ? " Punches outside the site area are included; remove or correct them in the time sheet if they weren't valid." : ""}</p>
      <form id="clock-ts-form" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end" data-keep>
        ${periodSelect(pid, "att").replace('style="flex-direction:row;align-items:center;gap:8px;color:#fff"', 'style="flex-direction:row;align-items:center;gap:8px"').replace('style="color:var(--onblue)"', "")}
        <div class="field"><label for="ck-grace">Grace period (minutes)</label><input class="input" id="ck-grace" type="number" min="0" step="1" value="${grace()}" style="width:120px"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" id="ck-abs"> Count workdays with no punches as absences</label>
        <button class="btn btn-primary">Preview time sheet figures</button></form></section>` : ""}`;
};
function clockLinksTab(claims) {
  const byNo = new Map([...S.emps.values()].map((e) => [String(e.no).toLowerCase(), e]));
  return `<section class="card"><div class="card-head"><h2>Employee accounts</h2></div>
      <p style="margin:0 0 12px;font-size:14px;max-width:80ch">To let someone clock in on their own phone, share this page with them as <b>Contributor</b> from the Share menu. They see only the time clock, not employee records. The first time, they enter their employee number; confirm it here so their punches count. Before you confirm, check that the <b>Signed in as</b> name is really that employee, since anyone can type a number.</p>
      <div class="table-wrap"><table><thead><tr><th>Account says</th><th>Matches</th><th>Status</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${claims.map((c) => { const linked = S.emps.get(S.clockLinks[c.id]); const match = linked || byNo.get(String(c.empNo || "").toLowerCase());
        return `<tr><td><b>${esc(c.name || "No name given")}</b><div class="t-muted" style="font-size:13px">${esc(c.empNo || "")} · since ${esc(fmtDate((c.at || "").slice(0, 10)))}</div><div style="font-size:13px">Signed in as <b>${esc(personName(c.id))}</b></div>${!linked && match && Object.entries(S.clockLinks).some(([k, v]) => v === match.id && k !== c.id) ? '<div class="t-bad" style="font-size:13px">This employee already has a linked phone. Check before confirming.</div>' : ""}</td>
          <td>${match ? personCell(match, esc(match.no)) : '<span class="t-bad" style="font-size:14px">No employee with that number</span>'}</td>
          <td>${linked ? '<span class="chip c-ok">Confirmed</span>' + (S.meErr?.[c.id] ? `<div class="t-bad" style="font-size:13px">Dashboard not shared yet: ${esc(S.meErr[c.id])}</div>` : S.meSynced?.[c.id] != null ? '<div class="t-muted" style="font-size:13px">Dashboard shared</div>' : '<div class="t-muted" style="font-size:13px">Sharing their dashboard…</div>') : '<span class="chip c-warn">Waiting</span>'}${c.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td>
          ${S.canEdit ? `<td class="num">${linked ? `<button class="link danger" data-clock-unlink="${c.id}">Remove</button>` : match ? `<button class="btn btn-primary btn-sm" data-clock-link="${c.id}:${match.id}">Confirm</button>` : ""}</td>` : ""}</tr>`; }).join("") || `<tr><td colspan="4" class="empty">No one has linked a phone yet.</td></tr>`}
      </tbody></table></div></section>`;
}
function clockSitesTab() {
  const sites = siteList(); const ed = S.canEdit;
  return `<section class="card"><div class="card-head"><h2>Site areas</h2><span class="t-muted" style="font-size:13px;max-width:60ch">A punch counts as on site when the phone is within the radius of the site's pin, allowing for GPS accuracy.</span></div>
      <div class="table-wrap"><table><thead><tr><th>Site</th><th>Pin</th><th class="num">Radius</th><th class="num">People assigned</th></tr></thead><tbody>
      ${sites.map((s) => { const g = siteGeo(s.id); const n = active().filter((e) => siteOf(e) === s.id).length;
        return `<tr><td><b>${esc(s.name)}</b></td><td>${g ? `<a href="https://www.google.com/maps?q=${g.lat},${g.lng}" target="_blank" rel="noopener">${g.lat}, ${g.lng}</a>` : '<span class="chip c-warn">Not set</span>'}</td><td class="num">${g ? `${g.radius || 150} m` : "—"}</td><td class="num">${n}</td></tr>`; }).join("")}
      </tbody></table></div>
      ${ed ? `<form id="site-form" class="form-grid" style="margin-top:16px;align-items:end" data-keep>
        <div class="field"><label for="sg-site">Site</label><select class="input" id="sg-site">${opts(sites.map((s) => [s.id, s.name]), sites.find((s) => !siteGeo(s.id))?.id || "office")}</select></div>
        <div class="field"><label for="sg-lat">Latitude</label><input class="input" id="sg-lat" type="number" step="0.000001" min="-90" max="90" required placeholder="14.5869"></div>
        <div class="field"><label for="sg-lng">Longitude</label><input class="input" id="sg-lng" type="number" step="0.000001" min="-180" max="180" required placeholder="121.0614"></div>
        <div class="field"><label for="sg-rad">Radius (meters)</label><input class="input" id="sg-rad" type="number" min="30" step="10" value="150"></div>
        <button type="button" class="btn btn-ghost" data-geo-here>${icon("pin", 16)} Use this phone's location</button><button class="btn btn-primary">Save site area</button></form>
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">To get the pin from Google Maps, long-press the spot and copy the two numbers shown.</p>` : ""}</section>`;
}

/* ---------- site kiosk: a supervisor's phone at the gate ---------- */
VIEWS.kiosk = () => {
  const K = S.kiosk; if (!K.site) { try { K.site = localStorage.getItem("hr-kiosk-site") || "office"; } catch { K.site = "office"; } }
  if (!siteList().some((s) => s.id === K.site)) K.site = "office";
  const dev = "kiosk-" + K.site; const today = todayISO(); loadClock(today, today);
  const recent = punchesIn(today, today).filter((p) => p.dev === dev).reverse().slice(0, 8);
  const q = K.q.trim().toLowerCase(); const pool = active().sort((a, b) => (siteOf(a) === K.site ? 0 : 1) - (siteOf(b) === K.site ? 0 : 1) || a.last.localeCompare(b.last));
  const hits = q ? pool.filter((e) => `${fullName(e)} ${e.no}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const e = S.emps.get(K.emp); const g = K.geo;
  return backLink('data-go="clockin"', "Phone Clock-in") + head(esc(siteName(K.site)), "Site kiosk", `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="lbl" style="color:var(--onblue)">Site</span><select class="input" style="width:auto;color:var(--ink)" id="kiosk-site">${opts(siteList().map((s) => [s.id, s.name]), K.site)}</select></label>`) + `
    <section class="card" style="max-width:640px">
      ${e ? `<div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">${avatar(e, 56)}<div style="flex:1"><div style="font-weight:800;font-size:20px">${esc(fullName(e))}</div><div class="t-muted">${esc(e.no)} · ${esc(pos(e.posId)?.title || "")}</div></div><button class="link" data-kiosk-emp="">Change</button></div>
        <div class="stack" style="gap:12px">
          <label class="btn btn-ghost" style="justify-content:center;min-height:52px;cursor:pointer">${icon("camera")} ${K.photoUrl ? "Retake photo" : "Take a selfie"}<input type="file" id="kc-photo" accept="image/*" capture="user" style="position:absolute;width:1px;height:1px;opacity:0"></label>
          ${K.photoUrl ? `<img src="${K.photoUrl}" alt="Selfie preview" style="width:140px;height:140px;object-fit:cover;border-radius:16px;align-self:center">` : ""}
          <p style="margin:0;font-size:14px">${icon("pin", 16)} ${!g ? "Finding the location…" : g.error ? `<span class="t-warn">${esc(g.error)}. The punch is saved without it.</span>` : `Location found (±${g.acc} m). ${esc(fence({ ...g, site: K.site }).text)}`}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><button class="btn btn-primary" style="min-height:56px;font-size:17px" data-kiosk-in ${K.busy || !K.photo ? "disabled" : ""}>Time in</button><button class="btn btn-gold" style="min-height:56px;font-size:17px" data-kiosk-out ${K.busy || !K.photo ? "disabled" : ""}>Time out</button></div>
          ${!K.photo ? '<p class="t-muted" style="margin:0;font-size:13px">Take the selfie first.</p>' : ""}
        </div>`
      : `<div class="field"><label for="kiosk-q">Find the worker</label><input class="input" id="kiosk-q" type="search" value="${esc(K.q)}" placeholder="Name or employee no." autocomplete="off" style="min-height:52px;font-size:17px"></div>
        <ul class="list" style="margin-top:10px">${hits.map((x) => `<li><button class="btn btn-ghost" style="width:100%;justify-content:flex-start;min-height:52px" data-kiosk-emp="${x.id}">${avatar(x, 34)} <span style="text-align:left"><b>${esc(fullName(x))}</b><br><span class="t-muted" style="font-size:13px">${esc(x.no)} · ${esc(siteName(siteOf(x)))}</span></span></button></li>`).join("") || (q ? '<li class="t-muted">No one matches.</li>' : "")}</ul>`}
    </section>
    <section class="card" style="max-width:640px"><div class="card-head"><h2>Today at this site</h2></div>
      <ul class="list" style="font-size:14px">${recent.map((p) => `<li style="display:flex;gap:10px;align-items:center">${p.photo ? `<img src="${esc(photoSrc(p))}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : ""}<span style="flex:1"><b>${esc(empName(p.empId))}</b> · ${p.type === "OUT" ? "out" : "in"} at ${esc(timeFmt.format(new Date(p.t)))}</span></li>`).join("") || '<li class="t-muted">No punches yet today.</li>'}</ul></section>`;
};
after.kiosk = () => { const K = S.kiosk; if (K.emp && !K.geo && !K.geoAsked) { K.geoAsked = true; getGeo().then((g) => { K.geo = g; if (S.view.name === "kiosk") render(); }); } };
function resetKiosk() { const K = S.kiosk; if (K.photoUrl) URL.revokeObjectURL(K.photoUrl); Object.assign(K, { emp: null, photo: null, photoUrl: null, geo: null, geoAsked: false, q: "", busy: false }); }
async function kioskPunch(type) {
  const K = S.kiosk; const e = S.emps.get(K.emp); if (!e || !K.photo) return; K.busy = true; render();
  try {
    let photo = null;
    if (S.assets) { const c = await shrinkCanvas(K.photo, 480); const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.8)); photo = (await S.assets.upload(blob)).id; }
    else { const c = await shrinkCanvas(K.photo, 160); photo = c.toDataURL("image/jpeg", 0.6); }
    const g = K.geo || {}; const punch = { t: new Date().toISOString(), type, empId: e.id, site: K.site, photo, lat: g.lat ?? null, lng: g.lng ?? null, acc: g.acc ?? null, geoError: g.error || null };
    await savePunch("kiosk-" + K.site, punch, { kiosk: true, site: K.site, name: `Kiosk at ${siteName(K.site)}` });
    toast(`${type === "IN" ? "Time in" : "Time out"} saved for ${fullName(e)} at ${timeFmt.format(new Date(punch.t))}.`); resetKiosk(); render();
  } catch { K.busy = false; toast("Couldn't save the punch. Check the connection and try again."); render(); }
}

/* ---------- the employee's own phone (people shared as Contributor) ---------- */
async function bootSelf(db, user) {
  S.self = { uid: null, claim: undefined, today: null, photo: null, photoUrl: null, geo: null, busy: false };
  try { S.self.uid = await user?.id?.(); } catch { S.self.uid = null; }
  if (!S.self.uid) { S.self.error = "Sign in to claude.ai to use the time clock."; render(); return; }
  const me = `clockins/${S.self.uid}`;
  db.doc(me).onSnapshot((d) => { S.self.claim = d.exists ? d.data() : null; render(); }, () => { S.self.claim = null; render(); });
  db.doc(`${me}/days/${todayISO()}`).onSnapshot((d) => { S.self.today = d.exists ? d.data() : null; render(); }, () => {});
  getGeo().then((g) => { S.self.geo = g; render(); });
}
function selfNav() {
  return `<div class="nav-group"><span class="nav-label">Time clock</span><button class="nav-item" aria-current="page">${icon("phone")}My clock-in</button></div>
    <div class="me-card"><span class="avatar" style="width:40px;height:40px;background:var(--gold);color:var(--ink);font-size:15px" aria-hidden="true">C</span><div><b>Contributor</b><small>You can clock in and out</small></div></div>`;
}
function selfView() {
  const M = S.self; if (!M) return "";
  if (M.error) return head("Time clock", "My clock-in") + `<section class="card"><p style="margin:0">${esc(M.error)}</p></section>`;
  if (M.claim === undefined) return head("Time clock", "My clock-in") + '<section class="card"><p class="t-muted" style="margin:0">Loading…</p></section>';
  if (!M.claim) return head("Time clock", "Link your account") + `
    <form id="self-claim-form" class="card stack" style="gap:14px;max-width:520px" data-keep>
      <p style="margin:0;font-size:15px">Enter your employee number once. HR confirms it, then your punches go to your time sheet.</p>
      <div class="field"><label for="sc-no">Employee no.</label><input class="input" id="sc-no" required placeholder="EMP-0123" autocomplete="off"></div>
      <div class="field"><label for="sc-name">Full name</label><input class="input" id="sc-name" required autocomplete="name"></div>
      <button class="btn btn-primary" style="min-height:52px">Link my account</button></form>`;
  const today = Object.values(M.today?.punches || {}).sort((a, b) => a.t.localeCompare(b.t)); const last = today[today.length - 1]; const g = M.geo;
  return head(`${esc(M.claim.name || "")} · ${esc(M.claim.empNo || "")}`, "My clock-in") + `
    <section class="card stack" style="gap:14px;max-width:560px">
      <p style="margin:0;font-size:15px">${last ? `Last punch: <b>${last.type === "OUT" ? "time out" : "time in"} at ${esc(timeFmt.format(new Date(last.t)))}</b>.` : "No punches yet today."}</p>
      <label class="btn btn-ghost" style="justify-content:center;min-height:52px;cursor:pointer">${icon("camera")} ${M.photoUrl ? "Retake selfie" : "Take a selfie"}<input type="file" id="sc-photo" accept="image/*" capture="user" style="position:absolute;width:1px;height:1px;opacity:0"></label>
      ${M.photoUrl ? `<img src="${M.photoUrl}" alt="Selfie preview" style="width:140px;height:140px;object-fit:cover;border-radius:16px;align-self:center">` : ""}
      <p style="margin:0;font-size:14px">${icon("pin", 16)} ${!g ? "Finding your location…" : g.error ? `<span class="t-warn">${esc(g.error)}. Your punch is saved without it and HR checks it.</span>` : `Location found (±${g.acc} m).`}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><button class="btn btn-primary" style="min-height:56px;font-size:17px" data-self-punch="IN" ${M.busy || !M.photo ? "disabled" : ""}>Time in</button><button class="btn btn-gold" style="min-height:56px;font-size:17px" data-self-punch="OUT" ${M.busy || !M.photo ? "disabled" : ""}>Time out</button></div>
      ${!M.photo ? '<p class="t-muted" style="margin:0;font-size:13px">Take the selfie first.</p>' : ""}
    </section>
    <section class="card" style="max-width:560px"><div class="card-head"><h2>Today</h2></div><ul class="list" style="font-size:14px">${today.map((p) => `<li>${p.type === "OUT" ? "Time out" : "Time in"} at <b>${esc(timeFmt.format(new Date(p.t)))}</b> · <span class="t-muted">${p.lat != null ? "location recorded" : "no location"}</span></li>`).join("") || '<li class="t-muted">Nothing yet.</li>'}</ul>
      <p class="t-muted" style="margin:10px 0 0;font-size:13px">Your photo, time and location go to HR for your time sheet only.</p></section>`;
}
async function selfPunch(type) {
  const M = S.self; if (!M.photo) return; M.busy = true; render();
  try {
    const c = await shrinkCanvas(M.photo, 160); const g = M.geo || {};
    const punch = { t: new Date().toISOString(), type, photo: c.toDataURL("image/jpeg", 0.6), lat: g.lat ?? null, lng: g.lng ?? null, acc: g.acc ?? null, geoError: g.error || null };
    const date = manilaDay(punch.t); const ref = S.db.doc(`clockins/${M.uid}/days/${date}`); const id = uid(); const cur = await ref.get();
    if (cur.exists) await ref.update({ punches: { [id]: punch } }); else await ref.set({ d: date, dev: M.uid, punches: { [id]: punch } });
    if (M.photoUrl) URL.revokeObjectURL(M.photoUrl); Object.assign(M, { photo: null, photoUrl: null, busy: false });
    toast(`${type === "IN" ? "Time in" : "Time out"} saved at ${timeFmt.format(new Date(punch.t))}.`); getGeo().then((x) => { M.geo = x; render(); }); render();
  } catch { M.busy = false; toast("Couldn't save. Check your connection and try again."); render(); }
}

/* ---------- biometric terminal files (ZKTeco-style attlog) ---------- */
const isAttlog = (text) => /^\s*\S+\t\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/m.test(text) && !/employee/i.test(text.split(/\r?\n/)[0]);
function bioMatcher() {
  const byBio = new Map(), byNo = new Map(), byNum = new Map();
  for (const e of S.emps.values()) { if (e.bioId) byBio.set(String(e.bioId).trim(), e); byNo.set(String(e.no).toLowerCase(), e); const n = Number(String(e.no).replace(/\D/g, "")); if (n) byNum.set(n, e); }
  return (id) => { id = String(id || "").trim(); return byBio.get(id) || byNo.get(id.toLowerCase()) || (Number(id) ? byNum.get(Number(id)) : null) || null; };
}
/* One line per punch: device user ID, date and time, verify mode, punch state (0 in, 1 out, 4 OT in, 5 OT out), ... */
function attlogPunches(text) {
  const match = bioMatcher(); const punches = new Map(); let unmatched = 0, bad = 0, count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue; const c = line.split("\t").map((x) => x.trim());
    const e = match(c[0]); if (!e) { unmatched++; continue; }
    const t = parseStamp(c[1]); if (!t) { bad++; continue; }
    const st = c[3]; const type = st === "0" || st === "4" ? "IN" : st === "1" || st === "5" ? "OUT" : null;
    (punches.get(e.id) || punches.set(e.id, []).get(e.id)).push({ t, type }); count++;
  }
  return { punches, count, unmatched, bad };
}

/* ---------- FlexBen ---------- */
const FSTAT = { PENDING: ["Waiting", "c-warn"], APPROVED: ["Approved", "c-blue"], PAID: ["Paid", "c-ok"], REJECTED: ["Rejected", "c-gray"] };
const TREAT = { DEMIN: ["De minimis, tax-free", "c-ok"], EXEMPT: ["Not income (for the job)", "c-ok"], BENEFIT: ["Counts toward the ₱90,000 cap", "c-blue"], TAXABLE: ["Taxable", "c-warn"] };
const flexItem = (code) => SET().flexItems.find((i) => i.code === code) || { code, name: code, tax: "TAXABLE" };
const flexCredits = (e) => Number(SET().flexTiers.find((t) => t.code === rankOf(e))?.credits) || 0;
const flexUsed = (empId, y, except) => PAY.r2(listOf(S.flex).filter((c) => c.empId === empId && c.year === y && c.id !== except && c.status !== "REJECTED").reduce((a, c) => a + (c.amt || 0), 0));
/* Approved claims are paid in the first pay period that is still open. */
function openPeriodFrom(id) { let p = id; for (let i = 0; i < 6 && isFinal(p); i++) p = PAY.shiftPeriod(p, 1); return p; }
function flexFor(pid) { return (e) => listOf(S.flex).filter((c) => c.empId === e.id && c.payPid === pid && (c.status === "APPROVED" || c.status === "PAID")).map((c) => ({ id: c.id, amt: c.amt || 0, tax: c.tax || flexItem(c.item).tax })); }
async function recordFlexPaid(pid, lines) { for (const l of Object.values(lines)) for (const id of l.flex || []) { const c = S.flex.get(id); if (c && c.status !== "PAID") await put("flex", { ...c, status: "PAID", paid: PAY.period(pid).end }); } }
async function undoFlexPaid(pid) { for (const c of listOf(S.flex)) if (c.payPid === pid && c.status === "PAID") await put("flex", { ...c, status: "APPROVED", paid: null }); }

VIEWS.flex = () => {
  const tab = S.flexTab; const y = todayISO().slice(0, 4); const all = listOf(S.flex).filter((c) => c.year === y && S.emps.get(c.empId));
  const sum = (st) => PAY.r2(all.filter((c) => st.includes(c.status)).reduce((a, c) => a + (c.amt || 0), 0));
  const credits = PAY.r2(active().reduce((a, e) => a + flexCredits(e), 0));
  const tabs = `<div class="tabs on-blue" role="tablist">${[["claims", "Claims"], ["balances", "Balances"], ["setup", "Credits and items"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-flex-tab="${k}">${l}</button>`).join("")}</div>`;
  const top = head(`Benefit credits for ${y}`, "FlexBen", `<button class="btn btn-ghost" data-xx="flex">Download claims (CSV)</button>${S.canEdit ? `<button class="btn btn-gold" data-go="flexForm">${icon("plus")}New claim</button>` : ""}`) + tabs + `
    <section class="stats">
      <div class="card stat"><span class="label">Credits granted</span><span class="value" style="font-size:28px">${peso.format(credits)}</span><span class="note t-muted">${active().length} employees, by rank</span></div>
      <div class="card stat"><span class="label">Waiting for approval</span><span class="value">${all.filter((c) => c.status === "PENDING").length}</span><span class="note t-muted">${peso.format(sum(["PENDING"]))}</span></div>
      <div class="card stat"><span class="label">Approved, to be paid</span><span class="value" style="font-size:28px">${peso.format(sum(["APPROVED"]))}</span><span class="note t-muted">in the next open payroll</span></div>
      <div class="card stat"><span class="label">Paid this year</span><span class="value" style="font-size:28px">${peso.format(sum(["PAID"]))}</span><span class="note t-muted">through payroll</span></div>
    </section>`;
  if (tab === "setup") return top + flexSetup();
  if (tab === "balances") return top + flexBalances(y);
  const f = S.flexFilter; const q = f.q.trim().toLowerCase();
  const list = all.filter((c) => (!f.status || c.status === f.status) && (!q || `${empName(c.empId)} ${S.emps.get(c.empId).no}`.toLowerCase().includes(q))).sort((a, b) => (b.d || "").localeCompare(a.d || ""));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(f.page, pages); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return top + `<section class="card"><div class="card-head"><h2>Claims</h2><span class="t-muted" style="font-size:13px;max-width:62ch">Approved claims are paid in the next open payroll and taxed by item: de minimis and job-related items are tax-free, benefit items share the ₱90,000 yearly cap with the 13th month, the rest is taxable.</span></div>
      <div class="form-grid" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="field" style="grid-column:span 2"><label for="fx-q">Search</label><input class="input" id="fx-q" type="search" value="${esc(f.q)}" placeholder="Name or employee no." data-xfilter="flex:q"></div>
        <div class="field"><label for="fx-st">Status</label><select class="input" id="fx-st" data-xfilter="flex:status">${opts(Object.entries(FSTAT).map(([k, v]) => [k, v[0]]), f.status, "All")}</select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Item</th><th class="num">Amount</th><th>Tax</th><th>Status</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${rows.map((c) => { const e = S.emps.get(c.empId); const it = flexItem(c.item); const tr = TREAT[c.tax || it.tax];
        return `<tr><td>${personCell(e, `${esc(e.no)} · ${esc(fmtDate(c.d))}`, 190)}</td><td><b>${esc(it.name)}</b>${c.note ? `<div class="t-muted" style="font-size:13px">${esc(c.note)}</div>` : ""}${c.receipt ? `<div><a href="/_blob/${esc(c.receipt)}" target="_blank" rel="noopener" style="font-size:13px">Receipt</a></div>` : ""}</td>
          <td class="num"><b>${money(c.amt)}</b></td><td><span class="chip ${tr[1]}">${tr[0]}</span></td>
          <td><span class="chip ${FSTAT[c.status][1]}">${FSTAT[c.status][0]}</span>${c.payPid && c.status !== "REJECTED" ? `<div class="t-muted" style="font-size:12px">${c.status === "PAID" ? "paid" : "pay"} ${esc(PAY.period(c.payPid).label)}</div>` : ""}${c.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td>
          ${S.canEdit ? `<td class="num" style="white-space:nowrap">${c.status === "PENDING" ? `<button class="btn btn-primary btn-sm" data-flex-set="${c.id}:APPROVED">Approve</button> <button class="btn btn-ghost btn-sm" data-flex-set="${c.id}:REJECTED">Reject</button>` : c.status === "APPROVED" ? `<button class="link" data-flex-set="${c.id}:PENDING">Undo approval</button>` : ""}</td>` : ""}</tr>`; }).join("") || `<tr><td colspan="6" class="empty">No claims match.</td></tr>`}
      </tbody></table></div>
      <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} claims · page ${f.page} of ${pages}</span><span style="display:flex;gap:8px">${f.page > 1 ? '<button class="btn btn-ghost btn-sm" data-xpage="flex:-1">Previous</button>' : ""}${f.page < pages ? '<button class="btn btn-ghost btn-sm" data-xpage="flex:1">Next</button>' : ""}</span></nav></section>`;
};
function flexBalances(y) {
  const f = S.balFilter; const q = f.q.trim().toLowerCase();
  const list = active().filter((e) => !q || `${fullName(e)} ${e.no}`.toLowerCase().includes(q)).sort((a, b) => a.last.localeCompare(b.last));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); f.page = Math.min(f.page, pages); const rows = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  return `<section class="card"><div class="card-head"><h2>Balances for ${y}</h2></div>
      <div class="field" style="max-width:360px;margin-bottom:14px"><label for="fb-q">Search</label><input class="input" id="fb-q" type="search" value="${esc(f.q)}" placeholder="Name or employee no." data-xfilter="bal:q"></div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Rank</th><th class="num">Credits</th><th class="num">Claimed</th><th class="num">Left</th></tr></thead><tbody>
      ${rows.map((e) => { const cr = flexCredits(e); const used = flexUsed(e.id, y); return `<tr class="go" data-emp="${e.id}" tabindex="0"><td>${personCell(e, esc(e.no), 190)}</td><td>${esc(rankName(rankOf(e)))}</td><td class="num">${money(cr)}</td><td class="num">${money(used)}</td><td class="num"><b>${money(Math.max(0, cr - used))}</b></td></tr>`; }).join("")}
      </tbody></table></div>
      <nav aria-label="Pages" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px"><span class="t-muted">${list.length} people · page ${f.page} of ${pages}</span><span style="display:flex;gap:8px">${f.page > 1 ? '<button class="btn btn-ghost btn-sm" data-xpage="bal:-1">Previous</button>' : ""}${f.page < pages ? '<button class="btn btn-ghost btn-sm" data-xpage="bal:1">Next</button>' : ""}</span></nav></section>`;
}
function flexSetup() {
  const Sx = SET(); const ed = S.canEdit;
  return `<form id="flexset-form" class="card stack" style="gap:16px" data-keep>
      <h2 style="font-size:17px">Yearly credits by rank</h2>
      <div class="form-grid">${Sx.flexTiers.map((t) => `<div class="field"><label for="ft-${t.code}">${esc(t.name)}</label><input class="input" id="ft-${t.code}" data-tier="${t.code}" type="number" min="0" step="100" value="${t.credits}" ${ed ? "" : "disabled"}></div>`).join("")}</div>
      <p class="t-muted" style="margin:0;font-size:13px">Rank comes from the position title unless set on the employee's pay setup.</p>
      <h2 style="font-size:17px">Items people can claim</h2>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Tax treatment</th></tr></thead><tbody>
      ${Sx.flexItems.map((i) => `<tr><td><b>${esc(i.name)}</b></td><td>${ed ? `<select class="input" data-item-tax="${i.code}" aria-label="Tax treatment of ${esc(i.name)}">${opts(Object.entries(TREAT).map(([k, v]) => [k, v[0]]), i.tax)}</select>` : `<span class="chip ${TREAT[i.tax][1]}">${TREAT[i.tax][0]}</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      ${ed ? '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary">Save credits and items</button></div>' : ""}</form>`;
}
VIEWS.flexForm = () => {
  const y = todayISO().slice(0, 4); const Sx = SET();
  return backLink('data-go="flex"', "FlexBen") + head("FlexBen", "New claim") + `
    <form id="flex-form" class="card stack" style="gap:16px;max-width:760px" data-keep novalidate>
      <div class="form-grid">${empPicker("fx-emp", S.view.emp || "")}
        <div class="field"><label for="fx-item">Item <span class="req">*</span></label><select class="input" id="fx-item">${opts(Sx.flexItems.map((i) => [i.code, i.name]), "MED")}</select></div>
        <div class="field"><label for="fx-amt">Amount (PHP) <span class="req">*</span></label><input class="input" id="fx-amt" type="number" min="1" step="0.01" required></div>
        <div class="field"><label for="fx-d">Receipt date</label><input class="input" id="fx-d" type="date" value="${todayISO()}" max="${todayISO()}"></div>
        <div class="field"><label for="fx-note">Note</label><input class="input" id="fx-note" placeholder="Clinic, store or course"></div>
        ${S.assets ? '<div class="field"><label for="fx-rcpt">Receipt (photo or PDF)</label><input id="fx-rcpt" type="file" accept="image/*,application/pdf"></div>' : ""}</div>
      <p class="t-muted" id="fx-bal" style="margin:0;font-size:14px">Pick an employee to see their ${y} balance.</p>
      <p class="t-bad" id="fx-err" role="alert" style="margin:0;font-size:14px"></p>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-go="flex">Cancel</button><button class="btn btn-primary">Save claim</button></div></form>`;
};
after.flexForm = () => flexBalHint();
function flexBalHint() {
  const el = $("#fx-bal"); const e = S.emps.get($("#fx-emp")?.value); if (!el || !e) return; const y = todayISO().slice(0, 4);
  const cr = flexCredits(e); const used = flexUsed(e.id, y); el.textContent = `${rankName(rankOf(e))}: ${peso.format(cr)} credits for ${y}, ${peso.format(used)} claimed, ${peso.format(Math.max(0, cr - used))} left.`;
}
async function submitFlex() {
  const err = (m) => { $("#fx-err").textContent = m; };
  const e = S.emps.get($("#fx-emp").value); const amt = Number($("#fx-amt").value) || 0; if (!e) return err("Choose the employee."); if (!(amt > 0)) return err("Enter the amount.");
  const y = todayISO().slice(0, 4); const left = flexCredits(e) - flexUsed(e.id, y); if (amt > left + 0.001) return err(`${fullName(e)} has only ${peso.format(Math.max(0, left))} of credits left this year.`);
  let receipt = null; const file = $("#fx-rcpt")?.files?.[0];
  if (file && S.assets) { try { receipt = (await S.assets.upload(file)).id; } catch { return err("The receipt couldn't be uploaded. Try a smaller file or save without it."); } }
  const c = { id: uid(), empId: e.id, year: y, item: $("#fx-item").value, amt: PAY.r2(amt), d: $("#fx-d").value || todayISO(), note: $("#fx-note").value.trim() || null, receipt, status: "PENDING", filed: todayISO() };
  await put("flex", c); logActivity(`Filed a FlexBen claim of ${peso.format(c.amt)} for ${fullName(e)}`); toast("Claim saved. Approve it to pay it in the next payroll."); S.flexFilter.status = "PENDING"; go("flex");
}

/* ---------- fringe benefit tax (managerial and supervisory staff) ---------- */
const FBK = {
  HOUSING: ["Housing", 0.5, "50% of the monthly rent the company pays, or of 5% of the market value per year for company-owned housing"],
  VEHICLE: ["Vehicle for personal use", 0.5, "50% of the vehicle's cost ÷ 5 years when company-owned, or of the rent"],
  MEMBER: ["Club and gym memberships", 1, "full cost"], TRAVEL: ["Foreign travel beyond business needs", 1, "full cost of the personal part"],
  HOUSEHOLD: ["Household help, utilities and personal expenses", 1, "full cost"], EDUC: ["Education of dependents", 1, "full cost"],
  INS: ["Life or health insurance outside the group plan", 1, "premiums paid"], LOAN: ["Low-interest loan", 1, "interest below the 12% benchmark"], OTHER: ["Other fringe benefit", 1, "full value"],
};
const fbtCalc = (kind, amt) => { const mv = PAY.r2((Number(amt) || 0) * (FBK[kind]?.[1] ?? 1)); const gmv = PAY.r2(mv / (1 - SET().fbtRate)); return { mv, gmv, fbt: PAY.r2(gmv * SET().fbtRate) }; };
const quarterOf = (d) => Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
/* BIR 1603Q is filed by the last day of the month after the quarter. */
const fbtDue = (y, q) => { const m = q * 3 + 1; const yy = m > 12 ? Number(y) + 1 : Number(y); const mm = m > 12 ? 1 : m; return new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10); };
function fbtTab(y) {
  const list = listOf(S.fringe).filter((x) => (x.d || "").startsWith(y) && S.emps.get(x.empId)).sort((a, b) => b.d.localeCompare(a.d));
  const qs = [1, 2, 3, 4].map((q) => { const xs = list.filter((x) => quarterOf(x.d) === q); return { q, n: xs.length, gmv: PAY.r2(xs.reduce((a, x) => a + x.gmv, 0)), fbt: PAY.r2(xs.reduce((a, x) => a + x.fbt, 0)), due: fbtDue(y, q) }; });
  return `<section class="stats">${qs.map((x) => `<div class="card stat"><span class="label">Q${x.q} fringe benefit tax</span><span class="value" style="font-size:26px">${peso.format(x.fbt)}</span><span class="note t-muted">${x.n} items · BIR 1603Q due ${esc(fmtDate(x.due))}</span></div>`).join("")}</section>
    <section class="card"><div class="card-head"><h2>Fringe benefits of managers and supervisors</h2><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-xx="fbt">Download (CSV)</button>${S.canEdit ? `<button class="btn btn-primary btn-sm" data-go="fringeForm">${icon("plus")}Record a benefit</button>` : ""}</span></div>
      <p class="t-muted" style="margin:0 0 12px;font-size:14px;max-width:85ch">The company pays fringe benefit tax of ${Math.round(SET().fbtRate * 100)}% on the grossed-up value (value ÷ ${Math.round((1 - SET().fbtRate) * 100)}%). It is not taken from the employee's pay and the benefit is not added to their taxable compensation. Benefits of rank-and-file staff are pay instead and go through payroll.</p>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Benefit</th><th class="num">Amount</th><th class="num">Taxable value</th><th class="num">Grossed-up</th><th class="num">FBT</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.map((x) => { const e = S.emps.get(x.empId); return `<tr><td>${personCell(e, `${esc(rankName(rankOf(e)))} · ${esc(fmtDate(x.d))}`, 190)}</td><td><b>${esc(FBK[x.kind]?.[0] || x.kind)}</b>${x.note ? `<div class="t-muted" style="font-size:13px">${esc(x.note)}</div>` : ""}${x.sample ? ' <span class="chip c-warn">Sample</span>' : ""}</td>
        <td class="num">${money(x.amt)}</td><td class="num">${money(x.mv)}</td><td class="num">${money(x.gmv)}</td><td class="num"><b>${money(x.fbt)}</b></td>${S.canEdit ? `<td class="num"><button class="link danger" data-del-fringe="${x.id}">Delete</button></td>` : ""}</tr>`; }).join("") || `<tr><td colspan="7" class="empty">No fringe benefits recorded for ${y}.</td></tr>`}
      </tbody></table></div></section>`;
}
VIEWS.fringeForm = () => {
  const list = active().filter((e) => rankOf(e) !== "RF");
  return backLink('data-tax-go="fbt"', "Tax &amp; BIR") + head("Fringe benefit tax", "Record a fringe benefit") + `
    <form id="fringe-form" class="card stack" style="gap:16px;max-width:760px" data-keep novalidate>
      <div class="form-grid">${empPicker("fr-emp", "", list)}
        <div class="field"><label for="fr-kind">Benefit <span class="req">*</span></label><select class="input" id="fr-kind">${opts(Object.entries(FBK).map(([k, v]) => [k, v[0]]), "HOUSING")}</select></div>
        <div class="field"><label for="fr-amt">Amount the company paid or the basis (PHP) <span class="req">*</span></label><input class="input" id="fr-amt" type="number" min="1" step="0.01" required></div>
        <div class="field"><label for="fr-d">Date given</label><input class="input" id="fr-d" type="date" value="${todayISO()}"></div>
        <div class="field" style="grid-column:1/-1"><label for="fr-note">Note</label><input class="input" id="fr-note" placeholder="Unit, plate no. or period covered"></div></div>
      <p class="t-muted" id="fr-calc" style="margin:0;font-size:14px">Only managers and supervisors are listed. Taxable value: ${esc(FBK.HOUSING[2])}.</p>
      <p class="t-bad" id="fr-err" role="alert" style="margin:0;font-size:14px"></p>
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-tax-go="fbt">Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
};
function fringeHint() {
  const el = $("#fr-calc"); if (!el) return; const kind = $("#fr-kind").value; const c = fbtCalc(kind, $("#fr-amt").value);
  el.textContent = `Taxable value: ${FBK[kind][2]}. ${c.mv ? `Value ${peso.format(c.mv)}, grossed-up ${peso.format(c.gmv)}, fringe benefit tax ${peso.format(c.fbt)}.` : ""}`;
}
async function submitFringe() {
  const err = (m) => { $("#fr-err").textContent = m; };
  const e = S.emps.get($("#fr-emp").value); const amt = Number($("#fr-amt").value) || 0; if (!e) return err("Choose the employee."); if (!(amt > 0)) return err("Enter the amount.");
  const kind = $("#fr-kind").value; const x = { id: uid(), empId: e.id, d: $("#fr-d").value || todayISO(), kind, amt: PAY.r2(amt), note: $("#fr-note").value.trim() || null, ...fbtCalc(kind, amt) };
  await put("fringe", x); logActivity(`Recorded a fringe benefit for ${fullName(e)} (FBT ${peso.format(x.fbt)})`); toast("Saved."); S.taxTab = "fbt"; go("tax");
}

/* ---------- alerts and exports ---------- */
function extraAlerts(add, today) {
  const waiting = [...S.clockDevs.values()].filter((d) => !d.kiosk && !d.bio && !S.clockLinks[d.id]).length;
  if (waiting) add("info", "Clock-in", `${waiting} phone clock-in account${waiting > 1 ? "s are" : " is"} waiting for HR to confirm the employee.`, 'data-clock-tab="links"', "Review");
  const out = punchesIn(today, today).filter((p) => fence(p).state === "out").length;
  if (out) add("warn", "Clock-in", `${out} phone punch${out > 1 ? "es" : ""} today ${out > 1 ? "were" : "was"} made outside the site area.`, 'data-clock-tab="punches"', "Check");
  const pend = listOf(S.flex).filter((c) => c.status === "PENDING" && S.emps.get(c.empId)).length;
  if (pend) add("info", "FlexBen", `${pend} FlexBen claim${pend > 1 ? "s are" : " is"} waiting for approval.`, 'data-go="flex"', "Review");
  const y = today.slice(0, 4); const q = quarterOf(today) - 1 || 4; const qy = q === 4 && quarterOf(today) === 1 ? String(Number(y) - 1) : y;
  const due = fbtDue(qy, q); const xs = listOf(S.fringe).filter((x) => (x.d || "").startsWith(qy) && quarterOf(x.d) === q);
  if (xs.length && !(SET().fbtFiled || []).includes(`${qy}-Q${q}`)) {
    const left = daysBetween(today, due); const tax = PAY.r2(xs.reduce((a, x) => a + x.fbt, 0));
    if (left <= 31) add(left < 0 ? "crit" : "warn", "Tax", `File BIR 1603Q for Q${q} ${qy} and pay ${peso.format(tax)} fringe benefit tax ${left < 0 ? `(was due ${fmtDate(due)})` : `by ${fmtDate(due)}`}.`, `data-fbt-filed="${qy}-Q${q}"`, "Mark filed");
  }
}
function extraExport(kind) {
  const y = todayISO().slice(0, 4);
  if (kind === "flex") return offer(`flexben-${y}.csv`, toCSV([["Employee No", "Name", "Rank", "Item", "Tax treatment", "Amount", "Receipt date", "Status", "Pay period", "Note"],
    ...listOf(S.flex).filter((c) => c.year === y && S.emps.get(c.empId)).map((c) => { const e = S.emps.get(c.empId); const it = flexItem(c.item); return [e.no, fullName(e), rankName(rankOf(e)), it.name, TREAT[c.tax || it.tax][0], c.amt, c.d, FSTAT[c.status][0], c.payPid ? PAY.period(c.payPid).label : "", c.note || ""]; })]));
  if (kind === "fbt") { const ty = taxYear(); return offer(`fringe-benefit-tax-${ty}.csv`, toCSV([["Quarter", "Date", "Employee No", "TIN", "Name", "Rank", "Benefit", "Amount", "Taxable value", "Grossed-up value", "FBT", "Note"],
    ...listOf(S.fringe).filter((x) => (x.d || "").startsWith(ty) && S.emps.get(x.empId)).sort((a, b) => a.d.localeCompare(b.d)).map((x) => { const e = S.emps.get(x.empId); return [`Q${quarterOf(x.d)}`, x.d, e.no, e.tin || "", fullName(e), rankName(rankOf(e)), FBK[x.kind]?.[0] || x.kind, x.amt, x.mv, x.gmv, x.fbt, x.note || ""]; })])); }
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-clock-tab],[data-clock-refresh],[data-clock-link],[data-clock-unlink],[data-geo-here],[data-kiosk-emp],[data-kiosk-in],[data-kiosk-out],[data-self-punch],[data-flex-tab],[data-flex-set],[data-xx],[data-xpage],[data-del-fringe],[data-fbt-filed]");
  if (!t) return; const d = t.dataset; const has = (a) => t.hasAttribute("data-" + a);
  try {
    if (d.clockTab) { S.clockTab = d.clockTab; if (baseView(S.view.name) !== "clockin") go("clockin"); else render(); return; }
    if (has("clock-refresh")) { const date = S.clockDate || todayISO(); await loadClock(date, date, true); return; }
    if (d.clockLink) { const [dev, empId] = d.clockLink.split(":"); const links = { ...S.clockLinks, [dev]: empId }; await S.db.doc("org/clocklinks").set({ links }); S.clockLinks = links; S.ver++; logActivity(`Confirmed the phone clock-in account of ${empName(empId)}`); toast("Account confirmed."); render(); return; }
    if (d.clockUnlink) { if (!armed(t)) return; const links = { ...S.clockLinks }; const was = links[d.clockUnlink]; delete links[d.clockUnlink]; await S.db.doc("org/clocklinks").set({ links }); S.clockLinks = links; S.ver++; logActivity(`Removed the phone clock-in link of ${empName(was)}`); toast("Link removed."); render(); return; }
    if (has("geo-here")) { t.disabled = true; const g = await getGeo(); t.disabled = false; if (g.error) { toast(`${g.error}. Enter the pin from Google Maps instead.`); return; } $("#sg-lat").value = g.lat; $("#sg-lng").value = g.lng; toast(`Location found (±${g.acc} m).`); return; }
    if (has("kiosk-emp")) { resetKiosk(); S.kiosk.emp = d.kioskEmp || null; render(); return; }
    if (has("kiosk-in")) return kioskPunch("IN");
    if (has("kiosk-out")) return kioskPunch("OUT");
    if (d.selfPunch) return selfPunch(d.selfPunch);
    if (d.flexTab) { S.flexTab = d.flexTab; render(); return; }
    if (d.flexSet) {
      const [id, st] = d.flexSet.split(":"); const c = S.flex.get(id); const e = S.emps.get(c.empId); t.disabled = true;
      const n = { ...c, status: st, decided: st === "PENDING" ? null : todayISO() };
      if (st === "APPROVED") { n.payPid = openPeriodFrom(curPeriod()); n.tax = flexItem(c.item).tax; } else n.payPid = null;
      await put("flex", n); logActivity(`${st === "APPROVED" ? "Approved" : st === "REJECTED" ? "Rejected" : "Reopened"} a FlexBen claim of ${fullName(e)}`); toast(st === "APPROVED" ? `Approved. It's paid in the ${PAY.period(n.payPid).label} payroll.` : "Claim updated."); render(); return;
    }
    if (d.xx) return extraExport(d.xx);
    if (d.xpage) { const [k, n] = d.xpage.split(":"); const f = { flex: S.flexFilter, bal: S.balFilter }[k]; if (!f) return; f.page += Number(n); render(); return; }
    if (d.delFringe) { if (!armed(t)) return; await drop("fringe", d.delFringe); logActivity("Deleted a fringe benefit record"); toast("Deleted."); render(); return; }
    if (d.fbtFiled) { await saveSettings({ fbtFiled: [...(SET().fbtFiled || []), d.fbtFiled] }, `Filed BIR 1603Q for ${d.fbtFiled}`); return; }
  } catch { t.disabled = false; toast("Couldn't save. Check your connection and try again."); }
});
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "kiosk-q") { S.kiosk.q = t.value; render(); return; }
  if (t.dataset.xfilter && t.tagName !== "SELECT") { const [k, field] = t.dataset.xfilter.split(":"); const f = { flex: S.flexFilter, bal: S.balFilter }[k]; if (!f) return; f[field] = t.value; f.page = 1; render(); return; }
  if (t.id === "fr-amt") fringeHint();
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.dataset.xfilter && t.tagName === "SELECT") { const [k, field] = t.dataset.xfilter.split(":"); const f = { flex: S.flexFilter, bal: S.balFilter }[k]; if (!f) return; f[field] = t.value; f.page = 1; render(); return; }
  if (t.id === "clock-date") { S.clockDate = t.value || todayISO(); render(); return; }
  if (t.id === "kiosk-site") { resetKiosk(); S.kiosk.site = t.value; try { localStorage.setItem("hr-kiosk-site", t.value); } catch {} render(); return; }
  if (t.id === "kc-photo" || t.id === "sc-photo") {
    const file = t.files?.[0]; if (!file) return; const M = t.id === "kc-photo" ? S.kiosk : S.self;
    if (M.photoUrl) URL.revokeObjectURL(M.photoUrl); M.photo = file; M.photoUrl = URL.createObjectURL(file); render(); return;
  }
  if (t.id === "fx-emp") { flexBalHint(); return; }
  if (t.id === "fr-kind") { fringeHint(); return; }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["clock-ts-form", "site-form", "flex-form", "flexset-form", "fringe-form", "self-claim-form"].includes(f.id)) return; ev.preventDefault();
  try {
    if (f.id === "self-claim-form") {
      const no = $("#sc-no").value.trim(), name = $("#sc-name").value.trim(); if (!no || !name) return;
      await S.db.doc(`clockins/${S.self.uid}`).set({ empNo: no, name, at: new Date().toISOString() }); toast("Saved. You can clock in now."); return;
    }
    if (!S.canEdit) return;
    if (f.id === "clock-ts-form") {
      const pid = S.periodId || curPeriod(); const p = PAY.period(pid); await loadClock(p.start, p.end);
      const punches = new Map(); let count = 0, unmatched = 0;
      for (const x of punchesIn(p.start, p.end)) { if (x.bio) continue; if (!S.emps.get(x.empId)) { unmatched++; continue; } (punches.get(x.empId) || punches.set(x.empId, []).get(x.empId)).push({ t: new Date(x.t), type: x.type }); count++; }
      if (!count) { toast(`No linked phone punches in ${p.label}.`); return; }
      const r = computePunches(punches, pid, { grace: Number($("#ck-grace").value) || 0, absent: $("#ck-abs").checked });
      S.punchPreview = { pid, count, unmatched, bad: 0, people: Object.keys(r).length, patch: r, source: "phone" }; go("punches"); return;
    }
    if (f.id === "site-form") {
      const site = $("#sg-site").value; const lat = Number($("#sg-lat").value), lng = Number($("#sg-lng").value); const radius = Math.max(30, Number($("#sg-rad").value) || 150);
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (!lat && !lng)) { toast("Enter the latitude and longitude."); return; }
      const geo = { lat, lng, radius };
      if (site === "office") await saveSettings({ officeGeo: geo }, "Set the head office area for phone clock-in");
      else { await S.db.doc(`projects/${site}`).update({ geo }); S.projects.set(site, { ...S.projects.get(site), geo }); S.ver++; logActivity(`Set the clock-in area of ${siteName(site)}`); toast("Saved."); render(); }
      return;
    }
    if (f.id === "flex-form") return await submitFlex();
    if (f.id === "fringe-form") return await submitFringe();
    if (f.id === "flexset-form") {
      const Sx = SET(); const flexTiers = Sx.flexTiers.map((t) => ({ ...t, credits: Number($(`#ft-${t.code}`).value) || 0 }));
      const flexItems = Sx.flexItems.map((i) => ({ ...i, tax: document.querySelector(`[data-item-tax="${i.code}"]`)?.value || i.tax }));
      await saveSettings({ flexTiers, flexItems }, "Updated the FlexBen credits and items"); return;
    }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});
