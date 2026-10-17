/* ---------- Overtime and leave attachments (Glenn 2026-10-17) ----------
   An overtime or leave request can carry photos or PDFs (a signed OT slip, a medical certificate), picked or dragged onto the box,
   on the employee's own account and on HR's "File overtime" and "File a leave" forms. Files go to the app's private file store; the request
   keeps only {id, name, type, size}, and every file is opened through /_blob/<id>. */
const FZ_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const FZ_MAX = 5, FZ_SIZE = 10 * 1048576;
S.fz = S.fz || {}; S.fzAt = {};
function fileZone(key) {
  if (!S.assets) return "";
  // a freshly opened form starts empty (files picked on an earlier, unsent form are dropped)
  const at = S.fzAt[key]; if (!at || at.v !== S.view || at.o !== S.epOpen) { S.fz[key] = []; S.fzAt[key] = { v: S.view, o: S.epOpen }; }
  const L = S.fz[key];
  return `<div class="field fz" style="grid-column:1/-1" data-drop="files" data-fz="${key}"><span class="lbl">Attachments <span class="t-muted" style="font-weight:400;text-transform:none">(photos or PDF, up to ${FZ_MAX})</span></span>
    <label class="fz-box">${icon("clip", 18)}<span>Drag files here, or <u>choose files</u></span><input type="file" multiple accept="image/*,application/pdf" data-fz-in="${key}" style="position:absolute;width:1px;height:1px;opacity:0"></label>
    ${L.length ? `<ul class="fz-list">${L.map((f, i) => `<li><span>${esc(f.name)} <span class="t-muted">${Math.max(1, Math.round(f.size / 1024))} KB</span></span><button type="button" class="link" data-fz-del="${key}:${i}">Remove</button></li>`).join("")}</ul>` : ""}</div>`;
}
function fzRedraw(key) { const z = document.querySelector(`[data-fz="${key}"]`); if (z) z.outerHTML = fileZone(key); }
function fzAdd(key, files) {
  const L = (S.fz[key] = S.fz[key] || []); let bad = 0;
  for (const f of files) { if (!FZ_TYPES.includes(f.type) || f.size > FZ_SIZE || L.length >= FZ_MAX) { bad++; continue; } L.push(f); }
  if (bad) toast(`Only photos or PDFs up to 10 MB, ${FZ_MAX} files at most.`); fzRedraw(key);
}
async function fzUpload(key) {
  const L = S.fz[key] || []; const out = [];
  for (const f of L) { const r = await S.assets.upload(f); out.push({ id: r.id, name: String(f.name).slice(0, 120), type: f.type, size: f.size }); }
  S.fz[key] = []; return out;
}
// Only what the app wrote: a plain file id and a name. Anything else from an employee's request is dropped.
const fzClean = (xs) => (Array.isArray(xs) ? xs : []).filter((x) => x && /^[A-Za-z0-9_.-]{1,120}$/.test(String(x.id || "")) && !/^\.+$/.test(x.id)).slice(0, FZ_MAX)
  .map((x) => ({ id: String(x.id), name: String(x.name || "File").slice(0, 120), type: FZ_TYPES.includes(x.type) ? x.type : null, size: Number(x.size) || null }));
const fzLinks = (xs) => { const L = fzClean(xs); return L.length ? `<div class="fz-links">${L.map((f) => `<a href="/_blob/${esc(f.id)}" target="_blank" rel="noopener">${icon("clip", 12)}${esc(f.name)}</a>`).join("")}</div>` : ""; };
document.addEventListener("change", (ev) => { const t = ev.target; const k = t?.dataset?.fzIn; if (!k) return; fzAdd(k, [...(t.files || [])]); });
document.addEventListener("click", (ev) => { const t = ev.target.closest?.("[data-fz-del]"); if (!t) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const [k, i] = t.dataset.fzDel.split(":"); (S.fz[k] || []).splice(Number(i), 1); fzRedraw(k); }, true);
const fzZone = (ev) => ev.target.closest?.('[data-drop="files"]');
for (const type of ["dragenter", "dragover"]) document.addEventListener(type, (ev) => { const z = fzZone(ev); if (!z || !hasFiles(ev)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; z.classList.add("drag"); });
document.addEventListener("dragleave", (ev) => { const z = fzZone(ev); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", (ev) => { const z = fzZone(ev); if (!z) return; ev.preventDefault(); ev.stopImmediatePropagation(); z.classList.remove("drag"); fzAdd(z.dataset.fz, [...(ev.dataTransfer?.files || [])]); }, true);
{ const st = document.createElement("style"); st.textContent = `.fz-box{position:relative;display:flex;gap:10px;align-items:center;justify-content:center;min-height:64px;padding:12px;border:1.5px dashed var(--line);border-radius:12px;cursor:pointer;font-size:14px;color:var(--muted,inherit)}
  .fz.drag .fz-box,.fz-box:hover{border-color:var(--gold);background:var(--blue-soft)}.fz-list{list-style:none;margin:8px 0 0;padding:0;font-size:14px}.fz-list li{display:flex;justify-content:space-between;gap:10px;padding:4px 0}
  .fz-links{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:13px}.fz-links a{display:inline-flex;gap:4px;align-items:center}`; document.head.appendChild(st); }
/* On the employee's own account the pages redraw when fresh records arrive (every 2 minutes, and right after sign-in).
   A form being filled in keeps what was typed through that redraw, as long as the same form is still open. */
{ const base = render; render = (...a) => {
    if (!S.selfMode) return base(...a);
    const at = [S.view, S.selfTab, S.epOpen]; const keep = [...document.querySelectorAll("form[data-keep] [id]")].filter((x) => "value" in x && x.type !== "file" && x.type !== "submit").map((x) => [x.id, x.type === "checkbox" ? x.checked : x.value]);
    const r = base(...a);
    if (at[0] === S.view && at[1] === S.selfTab && at[2] === S.epOpen) for (const [id, v] of keep) { const x = document.getElementById(id); if (!x || !x.closest("form[data-keep]")) continue; if (x.type === "checkbox") x.checked = v; else if (v !== "") x.value = v; }
    return r; }; }
