
// Announcements: send to chosen locations, project codes or project names (Glenn 2026-10-12).
// aud keeps its old values (all, ho, prj, p:<id>, d:<id>) and adds loc:<a>,<b> / pc:<ids> / pn:<ids> (values URI-encoded).
const AX_TYPES = [["all", "Everyone"], ["ho", "Head Office only"], ["prj", "All project sites"], ["loc", "By location"], ["pc", "By project code"], ["pn", "By project name"], ["d", "By department"]];
const axSplit = (t) => { const i = String(t || "all").indexOf(":"); return i < 0 ? [t || "all", []] : [t.slice(0, i), t.slice(i + 1).split(",").filter(Boolean).map(decodeURIComponent)]; };
const axLoc = (p) => String(p?.location || p?.region || "").trim();
const axProjs = () => listOf(S.projects).filter((p) => p.status !== "DONE").sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name)));
const axLocs = () => [...new Set(axProjs().map(axLoc).filter(Boolean))].sort();
{ const b = annAudience; annAudience = (a) => { const [k, v] = axSplit(a.aud); if (!["loc", "pc", "pn"].includes(k)) return b(a);
    const names = k === "loc" ? v : v.map((id) => { const p = S.projects.get(id); return p ? (k === "pc" ? p.code || p.name : p.name) : "a project"; });
    return `${k === "loc" ? "Location" : k === "pc" ? "Project code" : "Project"}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3} more` : ""}`; }; }
{ const b = annFor; annFor = (a, e) => { const [k, v] = axSplit(a.aud); if (!["loc", "pc", "pn"].includes(k)) return b(a, e);
    if (!e?.projectId) return false; if (k === "loc") return v.includes(axLoc(S.projects.get(e.projectId))); return v.includes(e.projectId); }; }
function axPicker(aud) {
  const [k0, v0] = axSplit(aud); const k = k0 === "p" ? "pn" : k0; const v = new Set(k0 === "p" ? v0 : v0);
  const box = (val, label, sub) => `<label class="ax-opt"><input type="checkbox" data-ax-v value="${esc(val)}" ${v.has(val) ? "checked" : ""}><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></label>`;
  const list = k === "loc" ? axLocs().map((l) => { const n = axProjs().filter((p) => axLoc(p) === l).length; return box(l, l, `${n} project${n === 1 ? "" : "s"}`); })
    : k === "pc" ? axProjs().map((p) => box(p.id, p.code || "(no code)", p.name)) : k === "pn" ? axProjs().map((p) => box(p.id, p.name, [p.code, axLoc(p)].filter(Boolean).join(" · ")))
    : k === "d" ? (S.org?.departments || []).map((d) => box(d.id, d.name, "")) : [];
  const empty = { loc: "No project locations yet. Add a location on each project.", pc: "No projects yet.", pn: "No projects yet.", d: "No departments yet." }[k];
  return `<div class="field ax-field" style="grid-column:1/-1"><label for="ax-type">Who should see it</label><select class="input" id="ax-type" style="max-width:320px">${opts(AX_TYPES, k)}</select>
    ${["loc", "pc", "pn", "d"].includes(k) ? `<div class="ax-head"><input class="input" id="ax-q" type="search" placeholder="Search" aria-label="Search the list" style="max-width:260px"> <button type="button" class="link" data-ax-all>Select all</button> <button type="button" class="link" data-ax-none>Clear</button> <span class="t-muted" id="ax-n" style="font-size:13px"></span></div>
      <div class="ax-list">${list.join("") || `<p class="t-muted" style="margin:0">${empty}</p>`}</div>` : ""}
    <input type="hidden" id="an-aud" value="${esc(aud || "all")}"></div>`;
}
function axSync() {
  const t = $("#ax-type")?.value; const hid = $("#an-aud"); if (!t || !hid) return;
  const vals = [...document.querySelectorAll("[data-ax-v]:checked")].map((x) => x.value);
  hid.value = ["all", "ho", "prj"].includes(t) ? t : t === "d" ? (vals[0] ? `d:${vals[0]}` : "all") : vals.length ? `${t}:${vals.map(encodeURIComponent).join(",")}` : "";
  const n = $("#ax-n"); if (n) n.textContent = ["all", "ho", "prj"].includes(t) ? "" : `${vals.length} selected`;
}
{ const b = VIEWS.annForm; VIEWS.annForm = (...x) => { const h = b(...x); const a = S.view.id ? S.anns.get(S.view.id) : null; const key = S.view.id || "new"; if (S.axFor !== key) { S.axFor = key; S.axAud = null; } const aud = S.axAud ?? a?.aud ?? "all";
    return h.replace(/<div class="field"><label for="an-aud">[\s\S]*?<\/select><\/div>/, axPicker(aud)); }; }
// Department keeps one choice (as before): ticking one clears the others.
document.addEventListener("change", (ev) => {
  if (ev.target.id === "ax-type") { const t = ev.target.value; S.axAud = ["all", "ho", "prj"].includes(t) ? t : `${t}:`;
    const f = ev.target.closest(".ax-field"); const w = document.createElement("div"); w.innerHTML = axPicker(S.axAud); f.replaceWith(w.firstElementChild); axSync(); $("#ax-type")?.focus(); return; }
  if (ev.target.matches?.("[data-ax-v]")) { if ($("#ax-type")?.value === "d" && ev.target.checked) document.querySelectorAll("[data-ax-v]").forEach((x) => { if (x !== ev.target) x.checked = false; }); axSync(); S.axAud = $("#an-aud").value || `${$("#ax-type").value}:`; }
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "ax-q") return; const q = ev.target.value.toLowerCase(); document.querySelectorAll(".ax-opt").forEach((o) => { o.hidden = q && !o.textContent.toLowerCase().includes(q); }); });
document.addEventListener("click", (ev) => { const all = ev.target.closest("[data-ax-all]"), none = ev.target.closest("[data-ax-none]"); if (!all && !none) return;
  document.querySelectorAll(".ax-opt:not([hidden]) [data-ax-v]").forEach((x) => { x.checked = !!all; }); axSync(); S.axAud = $("#an-aud").value || `${$("#ax-type").value}:`; });
// Keep the choice while the form is open; check it before saving.
{ const b = VIEWS.ann; VIEWS.ann = (...x) => { S.axAud = null; S.axFor = null; return b(...x); }; }
document.addEventListener("submit", (ev) => { if (ev.target.id !== "ann-form") return; axSync(); if (!$("#an-aud")?.value) { ev.preventDefault(); ev.stopImmediatePropagation(); toast("Tick at least one location, project or department."); } else S.axAud = null; }, true);
new MutationObserver(() => { if ($("#ax-type") && !$("#ax-n")?.dataset.done) { const n = $("#ax-n"); if (n) n.dataset.done = 1; axSync(); } }).observe(document.body, { childList: true, subtree: true });
{ const st = document.createElement("style"); st.textContent = `.ax-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:10px 0 8px}
.ax-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;max-height:300px;overflow:auto;padding:10px;border:1px solid var(--line,#E6E1D6);border-radius:12px;background:var(--panel,#FAF7F0)}
.ax-opt{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;cursor:pointer;font-weight:500}.ax-opt:hover{background:rgba(201,164,92,.12)}.ax-opt input{margin-top:3px}.ax-opt span{display:flex;flex-direction:column}.ax-opt small{color:var(--muted,#6A7080);font-size:12px}
[data-theme=dark] .ax-list{background:rgba(255,255,255,.03)}`; document.head.appendChild(st); }
