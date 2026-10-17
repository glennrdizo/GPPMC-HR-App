/* Code review 2026-10-17 (screens and forms). Form checks and the one-save-per-tap guard are in guard.js. */
// The Overtime report's cost columns let anyone work out a person's pay rate: they show only to roles with Payroll.
{ const b = VIEWS.otrep; VIEWS.otrep = (...a) => { const html = b(...a); if (typeof navAllowed !== "function" || navAllowed("Payroll")) return html;
  const t = document.createElement("template"); t.innerHTML = html;
  for (const tb of t.content.querySelectorAll("table")) { const hs = [...tb.querySelectorAll("thead th")]; const cut = hs.map((h, i) => (/cost|₱|amount/i.test(h.textContent) ? i : -1)).filter((i) => i >= 0);
    if (!cut.length) continue; for (const tr of tb.querySelectorAll("tr")) { const cells = [...tr.children]; for (const i of cut) cells[i]?.remove(); } }
  for (const el of t.content.querySelectorAll(".stat")) if (/cost/i.test(el.textContent)) el.remove();
  return t.innerHTML; }; }
