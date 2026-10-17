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
