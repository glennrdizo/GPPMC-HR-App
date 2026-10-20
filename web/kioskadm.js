// Kiosk tablets (Glenn 2026-10-20: full automation; audit 2026-10-17 H3), website only: a card on Timekeeping > Site kiosk.
// HR Managers make a key per gate tablet for one site, with a PIN. The tablet opens /kiosk with that key and can only save
// time in and out for that site's people (database functions hr_kiosk_roster and hr_kiosk_punch), so it needs no HR sign-in.
S.ksk = { list: null, err: null, at: 0, newKey: null };
async function kskLoad(force) {
  if (!window.__sb || !isPermAdmin() || (!force && Date.now() - S.ksk.at < 30000)) return; S.ksk.at = Date.now();
  const { data, error } = await window.__sb.rpc("hr_kiosk_list");
  S.ksk.err = error ? "Kiosk tablets aren't installed on the server yet." : null; S.ksk.list = error ? [] : data || [];
  if (S.view.name === "kiosk") render();
}
function kskCard() {
  if (!window.__sb || !isPermAdmin()) return ""; const B = S.ksk; if (!B.list && !B.err) { kskLoad(true).catch(() => {}); return ""; }
  const live = B.list.filter((s) => !s.revoked_at); const link = (k) => `${location.origin}/kiosk#k=${encodeURIComponent(k)}`;
  const row = (s) => `<tr><td><b>${esc(s.name)}</b><div class="t-muted" style="font-size:12px">${esc(siteName(s.site))} · made ${esc(fmtDate(String(s.created_at).slice(0, 10)))}</div></td>
    <td>${!s.last_at ? '<span class="chip c-warn">Not used yet</span>' : `<span class="chip c-ok">Last punch ${esc(bioAgo(s.last_at))}</span>`}${s.locked ? ' <span class="chip c-bad">PIN locked</span>' : ""}</td>
    <td class="num">${Number(s.total || 0).toLocaleString()}</td><td class="num"><button class="btn btn-ghost btn-sm" style="color:#a4262c" data-ksk-revoke="${esc(s.id)}">Revoke key</button></td></tr>`;
  return `<section class="card" id="ksk-card" style="max-width:900px"><div class="card-head"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>Kiosk tablets</h2>${live.length ? `<span class="chip c-blue">${live.length}</span>` : ""}</div><button class="btn btn-ghost btn-sm" data-ksk-refresh>Refresh</button></div>
    <p class="t-muted" style="font-size:13px;margin:0 0 10px;max-width:95ch">A gate tablet that needs no HR sign-in. It lists only its site's people (employee no. and first name) and saves time in and out with a photo, the location and the server's time, under the geofence rule. With no signal it keeps the punch and sends it later; those wait for you on Geofence review. Removing the key from the tablet needs the PIN.</p>
    ${B.err ? `<div class="notice"><span>${esc(B.err)}</span></div>` : ""}
    ${B.newKey ? `<div class="notice" style="display:block"><b>Tablet key for ${esc(B.newKey.name)}.</b> Open this link on the tablet now; it won't be shown again.
      <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap"><code style="font-size:13px;padding:6px 8px;background:var(--surface-2,#f4f4f2);border-radius:6px;word-break:break-all">${esc(link(B.newKey.key))}</code><button class="btn btn-primary btn-sm" data-ksk-copy>Copy link</button></div>
      <p style="margin:4px 0 0;font-size:13px">On the tablet, open the link in Chrome, allow the camera and location, then add it to the home screen. Keep the PIN with the site supervisor.</p>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-ksk-done>I've set up the tablet</button></div>` : ""}
    ${live.length ? `<div class="table-wrap"><table><thead><tr><th>Tablet</th><th>Status</th><th class="num">Punches</th><th></th></tr></thead><tbody>${live.map(row).join("")}</tbody></table></div>` : ""}
    ${B.err ? "" : `<form id="ksk-add" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:end">
      <label class="field" style="flex:1;min-width:180px;margin:0"><span class="lbl">Tablet name</span><input class="input" name="name" maxlength="80" required placeholder="e.g. Riverside main gate"></label>
      <label class="field" style="margin:0"><span class="lbl">Site</span><select class="input" name="site">${opts(siteList().map((s) => [s.id, s.name]), S.kiosk.site || "office")}</select></label>
      <label class="field" style="width:130px;margin:0"><span class="lbl">PIN (4 to 8 digits)</span><input class="input" name="pin" inputmode="numeric" pattern="\\d{4,8}" required autocomplete="off"></label>
      <button class="btn btn-primary" type="submit">Make a tablet key</button></form>`}</section>`;
}
{ const b = VIEWS.kiosk; VIEWS.kiosk = (...x) => { const h = b(...x); const c = S.kiosk.emp ? "" : kskCard(); return c ? h + c : h; }; }
document.addEventListener("click", async (ev) => {
  const t = ev.target; if (!isPermAdmin() || !window.__sb || !t.closest?.("#ksk-card")) return;
  if (t.closest("[data-ksk-refresh]")) { await kskLoad(true); toast("Refreshed."); return; }
  if (t.closest("[data-ksk-done]")) { S.ksk.newKey = null; render(); return; }
  if (t.closest("[data-ksk-copy]")) { try { await navigator.clipboard.writeText(`${location.origin}/kiosk#k=${encodeURIComponent(S.ksk.newKey?.key || "")}`); toast("Link copied."); } catch { toast("Select the link and copy it."); } return; }
  const r = t.closest("[data-ksk-revoke]"); if (r) { const s = (S.ksk.list || []).find((x) => x.id === r.dataset.kskRevoke); if (!s) return;
    if (!(await askConfirm(`Revoke the key for ${s.name}? That tablet stops saving punches until it gets a new key.`, "Revoke key", true))) return;
    const { error } = await window.__sb.rpc("hr_kiosk_revoke", { p_id: s.id }); if (error) { toast("Couldn't revoke the key."); return; }
    logActivity(`Revoked the kiosk tablet key for ${s.name}`); toast("Key revoked."); kskLoad(true); }
});
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "ksk-add") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!isPermAdmin() || !window.__sb) return;
  const fd = new FormData(f); const name = String(fd.get("name") || "").trim(); const site = String(fd.get("site") || ""); const pin = String(fd.get("pin") || "");
  if (!name || !/^\d{4,8}$/.test(pin)) { toast("Give the tablet a name and a PIN of 4 to 8 digits."); return; }
  const { data, error } = await window.__sb.rpc("hr_kiosk_add", { p_name: name, p_site: site, p_pin: pin }); if (error || !data) { toast("Couldn't make the key."); return; }
  S.ksk.newKey = { name, key: data }; logActivity(`Made a kiosk tablet key for ${name} (${siteName(site)})`); await kskLoad(true); render();
}, true);
