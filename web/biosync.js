// Live biometric sync (Glenn 2026-10-16), website only: a card on Timekeeping > Biometric import.
// HR Admins create a key per site; the sync program (bio-sync.zip, from tools/bio-sync) on a computer at the site sends
// the ZKTeco TX628 punches with it every 5 minutes (database function hr_bio_push). Keys are shown once.
S.bio = { list: null, err: null, at: 0, newKey: null };
async function bioLoad(force) {
  if (!window.__sb || !isPermAdmin() || (!force && Date.now() - S.bio.at < 30000)) return; S.bio.at = Date.now();
  const { data, error } = await window.__sb.rpc("hr_bio_site_list");
  S.bio.err = error ? "Live sync isn't installed on the server yet." : null; S.bio.list = error ? [] : data || [];
  if (S.view.name === "punches") render();
}
const bioAgo = (t) => { if (!t) return "never"; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
function bioCard() {
  if (!window.__sb || !isPermAdmin()) return ""; const B = S.bio; if (!B.list && !B.err) { bioLoad(true).catch(() => {}); return ""; }
  const live = B.list.filter((s) => !s.revoked_at);
  const chip = (s) => !s.last_at ? '<span class="chip c-warn">Not connected yet</span>' : Date.now() - Date.parse(s.last_at) < 20 * 60000 ? '<span class="chip c-ok">Syncing</span>' : `<span class="chip c-bad">Last sync ${esc(bioAgo(s.last_at))}</span>`;
  const row = (s) => `<tr><td><b>${esc(s.name)}</b><div class="t-muted" style="font-size:12px">Key made ${esc(fmtDate(String(s.created_at).slice(0, 10)))}${(s.projects || []).length ? ` · for ${esc(s.projects.map((p) => (p === "HO" ? "Head office" : S.projects.get(p)?.name || "a removed site")).join(", "))}` : ""}</div></td>
    <td>${chip(s)}${s.last_at ? `<div class="t-muted" style="font-size:12px">${esc(bioAgo(s.last_at))}${s.last_device?.name ? ` · ${esc(s.last_device.name)}` : ""}${s.last_device?.ip ? ` (${esc(s.last_device.ip)})` : ""}</div>` : ""}</td>
    <td class="num">${Number(s.total_saved || 0).toLocaleString()}</td>
    <td>${(s.last_unmatched || []).length ? `<span class="chip c-warn">${s.last_unmatched.length} not linked</span><div class="t-muted" style="font-size:12px;max-width:260px">Device user ids ${esc(s.last_unmatched.slice(0, 12).join(", "))}${s.last_unmatched.length > 12 ? "…" : ""}. Put each id in that employee's 201 file as the Biometric ID.</div>` : '<span class="t-muted">All linked</span>'}</td>
    <td class="num"><button class="btn btn-ghost btn-sm" style="color:#a4262c" data-bio-revoke="${esc(s.id)}">Revoke key</button></td></tr>`;
  return `<section class="card" id="bio-card"><div class="card-head"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>Live sync from the terminals</h2>${live.length ? `<span class="chip c-blue">${live.length} site${live.length === 1 ? "" : "s"}</span>` : ""}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="bio-sync.zip" download>Download the sync program</a><button class="btn btn-ghost btn-sm" data-bio-refresh>Refresh</button></div></div>
    <p class="t-muted" style="font-size:13px;margin:0 0 10px;max-width:95ch">For the ZKTeco TX628 terminals. A computer at each site, on the same network as its terminals, runs the sync program every 5 minutes. Punches go straight into Daily time records, so you don't need to import files from that site. Each site gets its own key; revoke it if that computer is lost or replaced.</p>
    ${B.err ? `<div class="notice"><span>${esc(B.err)}</span></div>` : ""}
    ${B.newKey ? `<div class="notice" style="display:block"><b>Key for ${esc(B.newKey.name)}.</b> Copy it now; it won't be shown again.
      <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap"><code style="font-size:13px;padding:6px 8px;background:var(--surface-2,#f4f4f2);border-radius:6px;word-break:break-all">${esc(B.newKey.key)}</code><button class="btn btn-primary btn-sm" data-bio-copy>Copy key</button></div>
      <ol style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.6"><li>On the site computer, install Python from python.org for all users (Customize installation › tick “Install Python for all users” and “Add python.exe to PATH”).</li><li>Download the sync program above and unzip it anywhere, for example to Downloads.</li><li>Open config.example.ini, paste this key as <b>site_key</b>, set each terminal's IP (on the terminal: Menu › Comm. › Ethernet) and save it as <b>config.ini</b>.</li><li>Right-click install.bat › Run as administrator. It copies the program to Program Files where only administrators can change it, locks the key file, tests the terminals, sends the last 31 days, then runs every 5 minutes under a low-rights Windows account.</li></ol>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-bio-done>I've saved the key</button></div>` : ""}
    ${B.list.length ? `<div class="table-wrap"><table><thead><tr><th>Site</th><th>Status</th><th class="num">Punches received</th><th>Device users</th><th></th></tr></thead><tbody>${live.map(row).join("") || '<tr><td colspan="5" class="empty">No active keys.</td></tr>'}</tbody></table></div>` : ""}
    ${B.err ? "" : `<form id="bio-add" style="display:grid;gap:8px;margin-top:12px"><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" name="site" maxlength="80" required placeholder="Site name, e.g. Riverside Tower" aria-label="Site name" style="flex:1;min-width:220px"><button class="btn btn-primary" type="submit">Create a site key</button></div>
      <fieldset style="border:1px solid var(--line);border-radius:8px;padding:8px 12px"><legend style="font-size:13px;padding:0 4px">Whose punches this key may send (the people assigned to these sites)</legend><div style="display:flex;flex-wrap:wrap;gap:4px 16px;max-height:180px;overflow:auto">
      <label class="check"><input type="checkbox" name="prj" value="HO"><span>Head office</span></label>${listOf(S.projects).filter((p) => p.status !== "DONE").sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => `<label class="check"><input type="checkbox" name="prj" value="${esc(p.id)}"><span>${esc(p.name)}</span></label>`).join("")}</div></fieldset></form>`}</section>`;
}
{ const b = VIEWS.punches; VIEWS.punches = (...x) => { const h = b(...x); const c = bioCard(); if (!c) return h; const i = h.indexOf("</header>"); return i < 0 ? c + h : h.slice(0, i + 9) + c + h.slice(i + 9); }; }
document.addEventListener("click", async (ev) => {
  const t = ev.target; if (!isPermAdmin() || !window.__sb) return;
  if (t.closest("[data-bio-refresh]")) { await bioLoad(true); toast("Refreshed."); return; }
  if (t.closest("[data-bio-done]")) { S.bio.newKey = null; render(); return; }
  if (t.closest("[data-bio-copy]")) { try { await navigator.clipboard.writeText(S.bio.newKey?.key || ""); toast("Key copied."); } catch { toast("Select the key and copy it."); } return; }
  const r = t.closest("[data-bio-revoke]"); if (r) { const s = (S.bio.list || []).find((x) => x.id === r.dataset.bioRevoke); if (!s) return;
    if (!(await askConfirm(`Revoke the key for ${s.name}? That site's computer stops sending punches until it gets a new key.`, "Revoke key", true))) return;
    const { error } = await window.__sb.rpc("hr_bio_site_revoke", { p_id: s.id }); if (error) { toast("Couldn't revoke the key."); return; }
    logActivity(`Revoked the biometric sync key for ${s.name}`); toast("Key revoked."); bioLoad(true); }
});
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "bio-add") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!isPermAdmin() || !window.__sb) return;
  const fd = new FormData(f); const name = String(fd.get("site") || "").trim(); if (!name) return; const prj = fd.getAll("prj").map(String);
  if (!prj.length) { toast("Tick the site or sites this terminal is for."); return; }
  const { data, error } = await window.__sb.rpc("hr_bio_site_add", { p_name: name, p_projects: prj }); if (error || !data) { toast("Couldn't create the key."); return; }
  S.bio.newKey = { name, key: data }; logActivity(`Created a biometric sync key for ${name}`); await bioLoad(true); render();
}, true);
