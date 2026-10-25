/* ---------- Punches with no signal (Glenn 2026-10-20: full automation; audit 2026-10-17 H4) ----------
   A time in or out made on the employee's phone, or on a site kiosk, when there's no signal is kept on that device and sent
   by itself when the signal is back (every minute, and as soon as the device is online). It keeps the time it was made and
   is marked offline. On the website the server keeps that time only for punches from the last 48 hours in an open cutoff
   (migration 20261020c); every offline punch waits for HR on Geofence review before it counts, like a punch without a
   location, because its time came from the device. */
const FC_KEY = "hr-punch-outbox";
const fcRead = () => { try { const v = JSON.parse(localStorage.getItem(FC_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const fcWrite = (l) => { try { localStorage.setItem(FC_KEY, JSON.stringify(l.slice(-40))); return true; } catch { return false; } };
const fcNet = (er) => navigator.onLine === false || /fetch|network|timed? ?out|abort|offline|load failed|connection/i.test(String(er?.message || er || ""));
function fcQueue(item) {
  const l = fcRead(); const why = `No signal: kept on the ${item.kind === "self" ? "phone" : "kiosk"} at ${timeFmt.format(new Date(item.punch.t))} and sent when the signal came back`;
  item.punch = { ...item.punch, offline: true, why: item.punch.why ? `${item.punch.why} (${why.toLowerCase()})` : why, ...(item.kind === "kiosk" ? { needsOk: true } : {}) };
  if (!fcWrite([...l, { ...item, tries: 0 }])) throw new Error("no room on this device");
  S.fcN = l.length + 1; return "queued";
}
{ const b = selfSave; selfSave = async (u, id, punch) => { try { return await b(u, id, punch); } catch (er) { if (!fcNet(er)) throw er; return fcQueue({ kind: "self", u, id, punch }); } }; }
{ const b = savePunch; savePunch = async (dev, punch, devInfo) => {
  try { return await b(dev, punch, devInfo); } catch (er) { if (!String(dev).startsWith("kiosk-") || !fcNet(er)) throw er; return fcQueue({ kind: "kiosk", dev, devInfo, id: uid(), punch }); } }; }
let fcBusy = false;
async function fcFlush() {
  if (fcBusy || navigator.onLine === false || !S.db) return; let l = fcRead(); if (!l.length) { S.fcN = 0; return; }
  fcBusy = true; let sent = 0, dropped = 0; const ids0 = new Set(l.map((x) => x.id));
  try {
    for (const it of [...l]) {
      if (it.kind === "self" ? S.self?.uid !== it.u : !(S.realEdit && S.canEdit)) continue; // only the account that made it sends it
      try {
        if (it.kind === "self") { const date = manilaDay(it.punch.t); const ref = S.db.doc(`clockins/${it.u}/days/${date}`); const cur = await ref.get();
          if (cur.exists) await ref.update({ punches: { [it.id]: it.punch } }); else await ref.set({ d: date, dev: it.u, punches: { [it.id]: it.punch } }); }
        else { const date = manilaDay(it.punch.t); const ref = S.db.doc(`clockins/${it.dev}/days/${date}`); const cur = await ref.get();
          if (!S.clockDevs.has(it.dev)) { await S.db.doc(`clockins/${it.dev}`).set(it.devInfo || { kiosk: true }); S.clockDevs.set(it.dev, { id: it.dev, ...(it.devInfo || {}) }); }
          if (cur.exists && cur.data().punches?.[it.id]) { /* already saved */ } else if (cur.exists) await ref.update({ punches: { [it.id]: it.punch } }); else await ref.set({ d: date, dev: it.dev, punches: { [it.id]: it.punch } });
          S.clockLoaded.clear(); }
        l = l.filter((x) => x !== it); sent++;
      } catch (er) {
        if (fcNet(er)) break;
        if (/can.t be changed|already/i.test(String(er?.message || er))) { l = l.filter((x) => x !== it); sent++; continue; } // it got there before
        it.tries = (it.tries || 0) + 1; if (it.tries >= 5) { l = l.filter((x) => x !== it); dropped++; }
      }
    }
  } finally { // punches queued while this ran are kept (audit 2026-10-25)
    const keep = new Map(l.map((x) => [x.id, x])); const now = fcRead().filter((x) => !ids0.has(x.id) || keep.has(x.id)).map((x) => keep.get(x.id) || x); fcWrite(now); S.fcN = now.length; fcBusy = false; }
  if (sent) { toast(`${sent} ${sent === 1 ? "punch" : "punches"} made with no signal ${sent === 1 ? "was" : "were"} sent. HR checks ${sent === 1 ? "it" : "them"}.`); S.ver++; render(); }
  if (dropped) toast(`${dropped} ${dropped === 1 ? "punch" : "punches"} made with no signal couldn't be saved. Tell HR the time.`);
}
window.addEventListener("online", () => setTimeout(fcFlush, 1500));
setInterval(fcFlush, 60000); setTimeout(fcFlush, 8000);
S.fcN = fcRead().length;

/* What's still waiting on this device */
const fcNote = () => { const n = S.fcN || 0; return n ? `<p class="t-warn" style="margin:0;font-size:13px">${n} ${n === 1 ? "punch is" : "punches are"} kept on this device until there's signal. Keep this page open; ${n === 1 ? "it's" : "they're"} sent by itself.</p>` : ""; };
{ const b = selfView; selfView = () => { const h = b(); return S.fcN && h.includes(GRID) ? h.replace(GRID, fcNote() + GRID) : h; }; }
{ const b = VIEWS.kiosk; VIEWS.kiosk = (...a) => { const h = b(...a); return S.fcN && h.includes(GRID) ? h.replace(GRID, fcNote() + GRID) : h; }; }

/* HR: an offline punch waits for HR like one without a location, whatever the geofence rule. */
{ const b = punchesIn; punchesIn = (from, to) => { const l = b(from, to).map((p) => (p.offline && !p.rev ? { ...p, needsOk: true } : p)); return S.geoAll ? l : l.filter((p) => !(p.offline && p.rev !== "OK")); }; }
