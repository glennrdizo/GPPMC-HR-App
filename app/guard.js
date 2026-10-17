/* Code review 2026-10-17 (screens and forms). Loaded first in the chain so it runs before every form's own save listener.
   One save per tap: a second press of a form's Save while the first is still going is ignored (a double click on a slow
   connection used to save a loan, overtime or a pay raise twice, and both counted in payroll). The form's buttons come back
   when the person changes anything in it, or after 3 seconds. Forms re-sent by the app itself are not affected. */
// Small checks the forms missed: a project assignment can't end before it starts, and "already paid" on a loan can't be
// negative or more than the loan.
window.addEventListener("submit", (ev) => {
  const f = ev.target; const v = (sel) => f.querySelector(sel)?.value || "";
  const end = f.querySelector('[name="end"],[id$="-end"]'), start = f.querySelector('[name="start"],[id$="-start"],#as-from');
  if (end?.value && start?.value && /^\d{4}-\d{2}-\d{2}$/.test(end.value) && /^\d{4}-\d{2}-\d{2}$/.test(start.value) && end.value < start.value) {
    ev.preventDefault(); ev.stopImmediatePropagation(); toast("The end date is before the start date."); return; }
  const paid = f.querySelector("#lf2-before"); if (paid && v("#lf2-before") !== "") { const p = Number(v("#lf2-before")), amt = Number(v("#lf2-amt") || NaN);
    if (!(p >= 0) || (amt > 0 && p > amt)) { ev.preventDefault(); ev.stopImmediatePropagation(); toast("Already paid must be from 0 up to the loan amount."); } }
}, true);

{ const busy = new WeakMap();
  const free = (f) => { clearTimeout(busy.get(f)); busy.delete(f); f.removeAttribute("aria-busy"); f.querySelectorAll("button[data-sv-off]").forEach((b) => { b.disabled = false; b.removeAttribute("data-sv-off"); }); };
  window.addEventListener("submit", (ev) => {
    const f = ev.target; if (!(f instanceof HTMLFormElement) || !ev.isTrusted) return;
    if (busy.has(f)) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    busy.set(f, setTimeout(() => free(f), 3000)); f.setAttribute("aria-busy", "true");
    setTimeout(() => { if (busy.has(f)) f.querySelectorAll('button:not([type="button"]):not(:disabled)').forEach((b) => { b.disabled = true; b.setAttribute("data-sv-off", ""); }); }, 0);
  }, true);
  document.addEventListener("input", (ev) => { const f = ev.target?.form || ev.target?.closest?.("form"); if (f && busy.has(f)) free(f); }, true); }
