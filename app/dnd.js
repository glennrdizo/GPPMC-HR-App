/* ---------- Drag and drop on every upload (Glenn 2026-10-17) ----------
   Any file box in the app also takes files dragged onto it, or onto the field, card or row around it, as long as that
   holds just one file box. Boxes with a drop area of their own (attachments, loan documents, 201 photo, imports, job
   photo) keep theirs; the clock-in selfie stays camera-only. A dropped file goes through the box's usual change handler. */
const DZ_OWN = '[data-drop],.io-drop,.ld-drop,#jp-photo-drop,.fz';
const DZ_SKIP = new Set(["kc-photo", "sc-photo"]);
const dzOk = (inp) => inp && !inp.disabled && !DZ_SKIP.has(inp.id) && !inp.closest(DZ_OWN);
function dzInput(t) {
  for (let a = t?.nodeType === 1 ? t : t?.parentElement; a && a !== document.body; a = a.parentElement) {
    if (a.matches(DZ_OWN)) return null;
    if (a.matches('input[type="file"]')) return dzOk(a) ? { zone: a.closest(".field,label") || a, input: a } : null;
    if (a.matches(".field,label,td,li,form,section,.card,.modal,.idp-tools > div")) {
      const ins = [...a.querySelectorAll('input[type="file"]')].filter(dzOk);
      if (ins.length === 1) return { zone: a, input: ins[0] }; if (ins.length > 1) return null;
      if (a.matches("section,.card,.modal,form")) return null;
    }
  }
  return null;
}
function dzAccepts(f, accept) {
  const list = String(accept || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); if (!list.length) return true;
  const name = f.name.toLowerCase(), type = (f.type || "").toLowerCase();
  return list.some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}
let dzCur = null;
const dzMark = (z) => { if (dzCur && dzCur !== z) dzCur.classList.remove("dz-on"); dzCur = z; z?.classList.add("dz-on"); };
for (const type of ["dragenter", "dragover"]) window.addEventListener(type, (ev) => { if (!hasFiles(ev)) return; const d = dzInput(ev.target); if (!d) { dzMark(null); return; }
  ev.preventDefault(); ev.stopImmediatePropagation(); ev.dataTransfer.dropEffect = "copy"; dzMark(d.zone); }, true);
window.addEventListener("dragleave", (ev) => { if (dzCur && !dzCur.contains(ev.relatedTarget)) dzMark(null); }, true);
window.addEventListener("drop", (ev) => {
  if (!hasFiles(ev)) return; const d = dzInput(ev.target); dzMark(null); if (!d) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const ok = [...(ev.dataTransfer.files || [])].filter((f) => dzAccepts(f, d.input.accept)); if (!ok.length) { toast("That type of file can't go here."); return; }
  const dt = new DataTransfer(); for (const f of d.input.multiple ? ok : ok.slice(0, 1)) dt.items.add(f);
  d.input.files = dt.files; d.input.dispatchEvent(new Event("input", { bubbles: true })); d.input.dispatchEvent(new Event("change", { bubbles: true }));
  const n = d.input.closest(".field")?.querySelector(".dz-name"); if (n) n.textContent = [...dt.files].map((f) => f.name).join(", ");
}, true);
// a short "or drop a file here" note beside the boxes that had none
function dzHints() {
  for (const inp of document.querySelectorAll('input[type="file"]:not([data-dz])')) { inp.dataset.dz = "1"; if (!dzOk(inp) || inp.closest("td")) continue;
    const host = inp.closest("label") || inp; host.insertAdjacentHTML("afterend", `<span class="dz-hint">${icon("upload", 13)}or drag and drop a file${inp.multiple ? "s" : ""} here <span class="dz-name"></span></span>`); }
}
{ let q = false; new MutationObserver(() => { if (q) return; q = true; requestAnimationFrame(() => { q = false; dzHints(); }); }).observe(document.body, { childList: true, subtree: true }); }
{ const st = document.createElement("style"); st.textContent = `.dz-on{outline:2px dashed var(--gold);outline-offset:3px;border-radius:10px;background:var(--blue-soft)}
  .dz-hint{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted,#667);margin:2px 0 0 6px}.dz-hint .dz-name{font-weight:600;color:var(--ink)}.field>.dz-hint{margin-left:0}`; document.head.appendChild(st); }
