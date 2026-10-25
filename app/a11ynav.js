/* ---------- Back button, page titles, keyboard focus and unsaved forms (audit 2026-10-25) ----------
   Every page change becomes a browser history entry, so the phone's Back gesture and the browser's Back button go to the
   previous page instead of leaving the app. On the website the page is kept in the address (#/leave), so a refresh reopens it.
   After a page change the tab title names the page and keyboard focus moves to its heading (screen readers read it).
   Leaving a form with typed, unsaved text asks first. Form errors are announced, wide tables can be scrolled with the keyboard,
   and Reopen payroll asks before it removes the final figures. */
const NH_WEB = /^https?:$/.test(location.protocol);
const NH = { restoring: false, booted: false, typed: false, form: null, pass: false, base: "GD Prime HR" };
// Typing counts only while its form is still on the page (a form that was sent or closed is gone).
const nhDirty = () => { if (NH.typed && !NH.form?.isConnected && !(NH.form?.id && document.getElementById(NH.form.id))) NH.typed = false; return NH.typed; };
try { NH.base = (document.title || "").replace(/^\(\d+\) /, "").split(" · ").pop() || NH.base; } catch {}
const nhPlain = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (v == null || ["string", "number", "boolean"].includes(typeof v)) r[k] = v; return r; };
const nhState = () => (S.selfMode ? { self: S.selfTab || null } : nhPlain(S.view));
const nhHash = (v) => (v.self !== undefined || !v.name ? undefined : "#/" + encodeURIComponent(v.name) + (v.id != null && v.id !== "" ? "/" + encodeURIComponent(v.id) : ""));
function nhRecord(replace) {
  if (NH.restoring) return; const v = nhState(); const cur = history.state?.hrv;
  if (!replace && cur && JSON.stringify(cur) === JSON.stringify(v)) return;
  try { history[replace || !cur ? "replaceState" : "pushState"]({ ...(history.state || {}), hrv: v }, "", NH_WEB ? nhHash(v) : undefined); } catch {}
}
function nhTitle() {
  const h = $("#main h1")?.textContent?.trim(); const n = /^\(\d+\) /.exec(document.title || "")?.[0] || "";
  try { document.title = n + (h && !/^Good (morning|afternoon|evening)/i.test(h) ? `${h} · ` : "") + NH.base; } catch {}
}
function nhFocus() {
  const h = $("#main h1") || $("#main"); if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  try { h.focus({ preventScroll: true }); } catch {}
}
{ const b = go; go = function (name, extra = {}) {
  const r = b(name, extra); NH.typed = false;
  if (NH.booted) { nhRecord(false); if (!NH.restoring) setTimeout(nhFocus, 0); }
  nhTitle(); return r; }; }
// Employee pages switch with the menu's tabs.
document.addEventListener("click", (ev) => { if (!ev.target.closest?.("[data-self-tab]")) return; setTimeout(() => { if (!S.selfMode) return; NH.typed = false; nhRecord(false); nhTitle(); nhFocus(); }, 0); });

window.addEventListener("popstate", async (ev) => {
  const v = ev.state?.hrv; if (!v) return;
  if (nhDirty() && !(await askConfirm("Leave this page? What you typed here isn't saved yet.", "Leave page"))) { nhRecord(false); return; }
  NH.restoring = true;
  try { if (v.self !== undefined) { if (S.selfMode) { S.selfTab = v.self; S.navOpen = false; render(); } } else { const { name, ...rest } = v; if (name) go(name, rest); } }
  finally { NH.restoring = false; } NH.typed = false; nhTitle(); setTimeout(nhFocus, 0);
});

// Open the page named in the address once the records are loaded (website: #/leave or #/employee/<id>).
{ const m = NH_WEB && /^#\/([A-Za-z0-9_]+)(?:\/([^/?#&]+))?$/.exec(location.hash || ""); const t0 = Date.now();
  const tick = () => {
    if (S.selfMode || (S.db && S.loaded?.emps)) {
      NH.booted = true;
      if (m && !S.selfMode && VIEWS[m[1]] && S.view?.name === "dash") { let id = null; try { id = m[2] ? decodeURIComponent(m[2]) : null; } catch {} NH.restoring = true; try { go(m[1], id ? { id } : {}); } finally { NH.restoring = false; } }
      nhRecord(true); nhTitle(); return;
    }
    if (Date.now() - t0 < 120000) setTimeout(tick, 300); else NH.booted = true;
  };
  setTimeout(tick, 300); }

// Unsaved typing in a form: ask before a menu or link click takes the person away, or before the tab is closed or reloaded.
document.addEventListener("input", (ev) => { const f = ev.target.closest?.("#main form"); if (!f || ev.target.type === "search" || ev.target.dataset?.filter || f.matches("[data-nowarn]")) return; NH.typed = true; NH.form = f; }, true);
document.addEventListener("submit", () => { setTimeout(() => { NH.typed = false; }, 0); }, true);
window.addEventListener("click", async (ev) => {
  if (NH.pass || !nhDirty()) return; const t = ev.target.closest?.("[data-go],[data-emp],[data-self-tab]"); if (!t || t.closest("#main form") || t.closest(".ac-back")) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (!(await askConfirm("Leave this page? What you typed here isn't saved yet.", "Leave page"))) return;
  NH.typed = false; NH.pass = true; try { t.click(); } finally { NH.pass = false; }
}, true);
window.addEventListener("beforeunload", (ev) => { if (nhDirty()) { ev.preventDefault(); ev.returnValue = ""; } });

// After each draw: form error lines are announced, and boxes that scroll sideways can be reached with the keyboard.
function nhScan() { try {
  for (const e of document.querySelectorAll("#main .err:not([role])")) e.setAttribute("role", "alert");
  for (const w of document.querySelectorAll("#main .table-wrap, #main .board, #main .pm-wrap")) {
    if (w.scrollWidth > w.clientWidth + 2 || (w.scrollHeight > w.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(w).overflowY))) { if (!w.hasAttribute("tabindex")) { w.setAttribute("tabindex", "0"); w.setAttribute("role", "region"); w.setAttribute("aria-label", w.querySelector("caption,h2,h3")?.textContent?.trim() || w.closest("section")?.querySelector("h2")?.textContent?.trim() || "Table"); } }
    else if (w.getAttribute("tabindex") === "0" && w.getAttribute("role") === "region") { w.removeAttribute("tabindex"); w.removeAttribute("role"); w.removeAttribute("aria-label"); }
  } } catch {} }
{ const b = render; render = function (...a) { const r = b.apply(this, a); nhScan(); return r; }; }
// Parts drawn later (the Users grid, lazy tables) are checked once things settle.
{ let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(nhScan, 400); }).observe(document.getElementById("main") || document.body, { childList: true, subtree: true }); }
// Form errors written after the draw (most forms) are announced too.
new MutationObserver((ms) => { for (const m of ms) { const e = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (e?.classList?.contains("err") && !e.hasAttribute("role")) e.setAttribute("role", "alert"); } })
  .observe(document.getElementById("main") || document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true });

// Reopening a final payroll removes its pay run, loan payments and FlexBen payments: ask first.
window.addEventListener("click", async (ev) => {
  const t = ev.target.closest?.('[data-pay-act="reopen"]'); if (!t || t.dataset.ok === "1") return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (!(await askConfirm("Reopen this payroll? Its final figures, payslips and loan and FlexBen payments for this cutoff are removed until you finalize it again. Payslips already sent to employees stay with them.", "Reopen payroll", true))) return;
  t.dataset.ok = "1"; try { t.click(); } finally { delete t.dataset.ok; }
}, true);

{ const st = document.createElement("style"); st.textContent = `
html:not([data-theme="dark"]) .person .sub, html:not([data-theme="dark"]) .who .sub, html:not([data-theme="dark"]) #main .bday-item .sub, html:not([data-theme="dark"]) #main .bday-item small { color: #5E6575; }
#main .rf-eyebrow b, #main .rf-toc a b { color: #1D4ED8; }
/* Past birthdays were faded with opacity, which dropped their text below 4.5:1; they keep full contrast and a muted name. */
#main .bday-item.is-past { opacity: 1; } #main .bday-item.is-past .name { color: var(--muted); }
.seg button[aria-pressed="false"] { color: var(--ink, #121A2C); }
/* Touch targets at least 24 px on tablets and touch screens (WCAG 2.5.8); the phone layout already uses bigger ones. */
@media (max-width: 1100px), (pointer: coarse) {
  #main button.link { min-height: 28px; }
  #main input[type="checkbox"], #main input[type="radio"] { width: 22px; height: 22px; }
}
/* A menu item reached with Tab is scrolled clear of the sticky account box at the bottom of the menu (WCAG 2.4.11). */
.rail { scroll-padding-bottom: 112px; }
#main h1:focus { outline: none; }
#main h1:focus-visible { outline: 2px solid var(--gold, #C9A45C); outline-offset: 4px; }
#main .table-wrap[role="region"]:focus-visible, #main .board[role="region"]:focus-visible, #main .pm-wrap[role="region"]:focus-visible { outline: 2px solid var(--gold, #C9A45C); outline-offset: 2px; }`; document.head.appendChild(st); }
