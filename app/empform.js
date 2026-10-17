/* ---------- Shift picker (Glenn 2026-10-17): Day shift 08:30 to 17:30, and shift times typed in by hand ----------
   Every employee shift list offers the standard shifts even where HR saved its own list before they existed, plus
   "Other times". A standard shift that isn't in the saved list, or typed times, are added to the company's shifts
   (Time settings) when the form is saved, so schedules, lates and overtime read them like any other shift. */
const SH_STD = [{ id: "day830", name: "Day shift", start: "08:30", end: "17:30" }];
const SH_OTHER = "__other";
const shLabel = (s) => `${s.name} (${s.start} to ${s.end})`;
const shSame = (a, b) => a.start === b.start && a.end === b.end;
function shDecorate(root) {
  for (const sel of root.querySelectorAll('select[name="shiftId"]:not([data-shx])')) {
    sel.dataset.shx = "1"; const have = SET().shifts;
    for (const s of SH_STD) if (!have.some((h) => h.id === s.id || shSame(h, s))) sel.add(new Option(shLabel(s), s.id));
    sel.add(new Option("Other times (type them)…", SH_OTHER));
  }
}
function shTimes(sel, on) {
  const box = sel.closest(".field"); let t = box?.nextElementSibling?.classList.contains("shx-times") ? box.nextElementSibling : null;
  if (!on) { t?.remove(); return; } if (t || !box) return;
  box.insertAdjacentHTML("afterend", `<div class="field shx-times"><label for="shx-start">Shift times <span class="req">*</span></label><div style="display:flex;gap:8px;align-items:center"><input class="input" type="time" id="shx-start" required aria-label="Shift start"><span>to</span><input class="input" type="time" id="shx-end" required aria-label="Shift end"></div></div>`);
  document.getElementById("shx-start")?.focus();
}
{ const b = render; render = (...a) => { const r = b(...a); try { shDecorate(document); } catch {} return r; }; }
document.addEventListener("change", (ev) => { const sel = ev.target; if (sel?.name === "shiftId" && sel.dataset.shx) shTimes(sel, sel.value === SH_OTHER); });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; const sel = f.querySelector?.('select[name="shiftId"][data-shx]'); if (!sel) return;
  const have = SET().shifts; let want = null;
  if (sel.value === SH_OTHER) { const start = f.querySelector("#shx-start")?.value, end = f.querySelector("#shx-end")?.value;
    if (!start || !end) { ev.preventDefault(); ev.stopImmediatePropagation(); toast("Type the shift's start and end times."); return; }
    if (start === end) { ev.preventDefault(); ev.stopImmediatePropagation(); toast("The shift can't start and end at the same time."); return; }
    want = have.find((h) => shSame(h, { start, end })) || { id: uid(), name: "Shift", start, end };
  } else { const std = SH_STD.find((s) => s.id === sel.value); if (std && !have.some((h) => h.id === std.id)) want = have.find((h) => shSame(h, std)) || std; }
  if (!want) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (!have.some((h) => h.id === want.id)) {
    if (!S.canEdit) { toast("Only HR can add a shift."); return; }
    try { const next = { ...SET(), shifts: [...have, want] }; await S.db.doc("org/settings").set(JSON.parse(JSON.stringify(next))); S.settings = next; S.ver++; logActivity(`Added shift ${shLabel(want)}`); }
    catch { toast("Couldn't add the shift. Check your connection and try again."); return; }
  }
  if (![...sel.options].some((o) => o.value === want.id)) sel.add(new Option(shLabel(want), want.id));
  sel.value = want.id; shTimes(sel, false); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); // the form's own save runs with the saved shift
}, true);

/* Pay type (Glenn 2026-10-17): Semi-monthly is monthly-rated (Basic pay is the monthly rate) and paid half each cutoff,
   so pay, 13th month and leave conversion treat it like Monthly; only the label differs. */
function ptLabel(t) { return t === "DAILY" ? "Daily" : t === "SEMI" ? "Semi-monthly" : "Monthly"; }

/* 201 file photo (Glenn 2026-10-17): drag a picture onto the photo card instead of browsing for it. The dropped file goes
   into the Photo field, so the preview and the save work exactly as if it had been picked. */
const PH_OK = ["image/jpeg", "image/png", "image/webp"];
function phDecorate() {
  const inp = document.getElementById("ef-photo"); const card = inp?.closest("section"); if (!card || card.dataset.drop) return;
  card.dataset.drop = "photo"; card.classList.add("ph-drop");
  inp.closest(".field")?.insertAdjacentHTML("beforeend", '<span class="t-muted" style="font-size:13px">or drag a photo onto this box</span>');
}
{ const b = render; render = (...a) => { const r = b(...a); try { phDecorate(); } catch {} return r; }; }
const phZone = (ev) => ev.target.closest?.('[data-drop="photo"]');
for (const type of ["dragenter", "dragover"]) document.addEventListener(type, (ev) => { const z = phZone(ev); if (!z || !hasFiles(ev)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; z.classList.add("drag"); });
document.addEventListener("dragleave", (ev) => { const z = phZone(ev); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", (ev) => {
  const z = phZone(ev); if (!z) return; ev.preventDefault(); ev.stopImmediatePropagation(); z.classList.remove("drag");
  const f = [...(ev.dataTransfer?.files || [])].find((x) => PH_OK.includes(x.type)); const inp = document.getElementById("ef-photo");
  if (!f) { toast("Drop a JPG, PNG or WebP picture."); return; } if (!inp) return;
  const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); S.dirty = true;
}, true);
{ const st = document.createElement("style"); st.textContent = ".ph-drop{transition:box-shadow .15s,background .15s}.ph-drop.drag{box-shadow:0 0 0 2px var(--gold) inset;background:var(--blue-soft)}"; document.head.appendChild(st); }
