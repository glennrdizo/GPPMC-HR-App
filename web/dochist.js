// Earlier versions of records (Glenn 2026-10-20: full automation; review 2026-10-17 DB2), website only: a card on
// Audit Trail > Server record. Every change keeps the version before it for 90 days (migration 20261020e). HR Managers,
// Owners and Executives can look at a version and put it back; putting one back keeps the current version too.
S.dh = { list: null, err: null, col: "", q: "", busy: false, open: null, key: "" };
async function dhLoad() {
  if (!window.__sb || !isPermAdmin()) return; const H = S.dh; const key = H.col; H.key = key; H.busy = true;
  const { data, error } = await window.__sb.rpc("hr_history_list", { p_path: null, p_col: H.col || null, p_lim: 500 });
  if (H.key !== key) return; H.busy = false; H.err = error ? "Earlier versions aren't installed on the server yet." : null; H.list = error ? [] : data || [];
  if (S.view.name === "audsrv") render();
}
function dhLabel(path) {
  const [col, id] = path.split("/"); if (col === "employees" && S.emps?.get(id)) return fullName(S.emps.get(id));
  if (col === "pay" && id?.startsWith("employees--")) { const e = S.emps?.get(id.slice(11)); return e ? `Pay of ${fullName(e)}` : "Pay of an employee"; }
  if (col === "projects" && S.projects?.get(id)) return S.projects.get(id).name; return path;
}
function dhCard() {
  if (!window.__sb || !isPermAdmin()) return ""; const H = S.dh; if (!H.list && !H.err && !H.busy) { dhLoad(); return ""; }
  const q = H.q.trim().toLowerCase(); const rows = (H.list || []).filter((r) => !q || `${dhLabel(r.path)} ${r.path} ${r.changed_by}`.toLowerCase().includes(q)).slice(0, 200);
  const cols = [...new Set((H.list || []).map((r) => r.col))].sort();
  const diff = (o) => { const a = o.data || {}, b = o.now || {}; const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    const show = (v) => { const s = v === undefined ? "(none)" : typeof v === "object" ? JSON.stringify(v) : String(v); return esc(s.length > 140 ? s.slice(0, 140) + "…" : s); };
    return !o.now ? `<p style="margin:0">This record was deleted. Putting this version back brings it back.</p>` : ks.length ? `<div class="table-wrap"><table><thead><tr><th>Field</th><th>This version</th><th>Now</th></tr></thead><tbody>${ks.slice(0, 40).map((k) => `<tr><td><b>${esc(k)}</b></td><td>${show(a[k])}</td><td>${show(b[k])}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Same as now.</p>'; };
  return `<section class="card" id="dh-card"><div class="card-head"><h2>Earlier versions of records</h2><button class="btn btn-ghost btn-sm" data-dh-reload>Refresh</button></div>
    <p class="t-muted" style="font-size:13px;margin:0 0 10px;max-width:95ch">Each change keeps the version before it for 90 days. If a record was saved wrong or deleted, open the version before that change and put it back. Putting one back keeps the current version here too, so it can be undone the same way.</p>
    ${H.err ? `<div class="notice"><span>${esc(H.err)}</span></div>` : `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><select class="input" style="width:auto" data-dh-col aria-label="Kind of record"><option value="">All records</option>${cols.concat(H.col && !cols.includes(H.col) ? [H.col] : []).map((c) => `<option value="${esc(c)}"${c === H.col ? " selected" : ""}>${esc(AU_COL[c] || c)}</option>`).join("")}</select>
      <input class="input" type="search" style="flex:1;min-width:200px" placeholder="Name or record" value="${esc(H.q)}" data-dh-q aria-label="Search"></div>
      ${H.busy && !H.list ? '<p class="t-muted">Reading…</p>' : rows.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Changed by</th><th>Record</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td style="white-space:nowrap">${esc(new Date(r.changed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }))}</td>
        <td>${esc(r.changed_by)}</td><td><b>${esc(dhLabel(r.path))}</b><div class="t-muted" style="font-size:12px">${esc(AU_COL[r.col] || r.col)} · ${r.op === "D" ? "deleted" : "changed"}${r.gone ? " · not there now" : ""}</div></td>
        <td class="num" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-dh-open="${r.id}">${H.open?.id === r.id ? "Hide" : "Compare"}</button> <button class="btn btn-ghost btn-sm" data-dh-put="${r.id}">Put back</button></td></tr>
        ${H.open?.id === r.id ? `<tr><td colspan="4">${H.open.v ? diff(H.open.v) : '<span class="t-muted">Reading…</span>'}</td></tr>` : ""}`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No earlier versions yet.</p>'}`}</section>`;
}
{ const b = VIEWS.audsrv; if (b) VIEWS.audsrv = (...x) => b(...x) + dhCard(); }
document.addEventListener("change", (ev) => { const t = ev.target.closest?.("[data-dh-col]"); if (!t) return; S.dh.col = t.value; S.dh.list = null; S.dh.open = null; dhLoad(); render(); });
document.addEventListener("input", (ev) => { const t = ev.target.closest?.("[data-dh-q]"); if (!t) return; S.dh.q = t.value; clearTimeout(S.dh.t); S.dh.t = setTimeout(() => { render(); const i = document.querySelector("[data-dh-q]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); });
document.addEventListener("click", async (ev) => {
  const t = ev.target; if (!t.closest?.("#dh-card") || !window.__sb || !isPermAdmin()) return; const H = S.dh;
  if (t.closest("[data-dh-reload]")) { H.list = null; dhLoad(); render(); return; }
  const o = t.closest("[data-dh-open]"); if (o) { const id = Number(o.dataset.dhOpen); if (H.open?.id === id) { H.open = null; render(); return; }
    H.open = { id, v: null }; render(); const { data, error } = await window.__sb.rpc("hr_history_get", { p_id: id }); if (H.open?.id !== id) return;
    if (error) { H.open = null; toast("Couldn't read that version."); } else H.open.v = data; render(); return; }
  const p = t.closest("[data-dh-put]"); if (p) { const r = (H.list || []).find((x) => x.id === Number(p.dataset.dhPut)); if (!r) return;
    if (!(await askConfirm(`Put back the version of ${dhLabel(r.path)} from ${new Date(r.changed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}? What it says now is kept here, so this can be undone.`, "Put back"))) return;
    const { error } = await window.__sb.rpc("hr_history_restore", { p_id: r.id }); if (error) { toast("Couldn't put that version back."); return; }
    logActivity(`Put back an earlier version of ${dhLabel(r.path)}`); toast("Put back."); H.list = null; H.open = null; dhLoad(); render(); }
});
