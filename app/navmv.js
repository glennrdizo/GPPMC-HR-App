/* Menu (Glenn 2026-10-14): Performance and Company Assets move from Recruitment to People, right after Organization.
   Same pages and view names, so saved roles and links keep working. */
{ const ppl = NAV.find(([g]) => g === "People"); const tal = NAV.find(([g]) => g === "Talent");
  if (ppl && tal) { const moved = ["perf", "property"].map((v) => { const i = tal[1].findIndex(([x]) => x === v); return i >= 0 ? tal[1].splice(i, 1)[0] : null; }).filter(Boolean);
    const o = ppl[1].findIndex(([v]) => v === "org"); ppl[1].splice(o >= 0 ? o + 1 : ppl[1].length, 0, ...moved); } }
