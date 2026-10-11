/* ---------- night mode (Glenn 2026-10-11): a switch at the bottom of the menu, remembered per device ---------- */
S.theme = (() => { try { return localStorage.getItem("hr-theme") || "light"; } catch { return "light"; } })();
function applyTheme() { document.documentElement.dataset.theme = S.theme === "dark" ? "dark" : "light"; document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", S.theme === "dark" ? "dark" : "light"); }
function setTheme(t) { S.theme = t; try { localStorage.setItem("hr-theme", t); } catch {} applyTheme(); renderNav(); }
applyTheme();
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-theme-set]"); if (!t) return; ev.preventDefault(); ev.stopImmediatePropagation(); setTheme(t.dataset.themeSet); }, true);
{ const b = renderNav; renderNav = (...a) => { const r = b(...a); const nav = $("#nav"); if (nav && !nav.querySelector(".theme-sw")) { const dk = S.theme === "dark"; const tl = S.lang === "tl";
    nav.insertAdjacentHTML("beforeend", `<div class="lang-sw theme-sw no-tl" role="group" aria-label="${tl ? "Kulay ng screen" : "Screen colors"}"><span>${tl ? "Night mode" : "Night mode"}</span><button data-theme-set="light" aria-pressed="${!dk}">${tl ? "Off" : "Off"}</button><button data-theme-set="dark" aria-pressed="${dk}">${tl ? "On" : "On"}</button></div>`); }
  return r; }; }
{ const st = document.createElement("style"); st.id = "dark-css"; st.textContent = `
html[data-theme="dark"] { color-scheme: dark;
  --ink: #E8ECF4; --muted: #A7B0C3; --line: #2A3550; --card: #141D30; --hover: #1B2640; --page: #0B1220;
  --blue: #3F68B5; --blue-dark: #2F579F; --blue-deep: #9DB9F2; --blue-soft: #1A2541; --blue-tint: #202D4D; --onblue: #C9D2E6;
  --gold: #D2AE68; --gold-deep: #E0BE7A; --gold-soft: #2E2716;
  --ok: #7BD6A2; --ok-soft: #133022; --warn: #F3BE6E; --warn-soft: #34270F; --bad: #FF9A9E; --bad-soft: #3B171B; --gray-soft: #1E2739;
  --shadow: 0 1px 2px rgba(0,0,0,.35), 0 14px 34px -22px rgba(0,0,0,.7); }
html[data-theme="dark"], html[data-theme="dark"] body, html[data-theme="dark"] .main { background: var(--page); color: var(--ink); }
html[data-theme="dark"] a:not(.btn):not(.nav-item):not(.lk-item) { color: #9DB9F2; }
html[data-theme="dark"] .card, html[data-theme="dark"] .tile, html[data-theme="dark"] .notice, html[data-theme="dark"] .rf-card, html[data-theme="dark"] .ak-row,
html[data-theme="dark"] .lk-item, html[data-theme="dark"] .io-dlg, html[data-theme="dark"] .perm-hits, html[data-theme="dark"] .voice-help, html[data-theme="dark"] .voice-bubble,
html[data-theme="dark"] .voice-type, html[data-theme="dark"] .page-drop > div, html[data-theme="dark"] .ac-box, html[data-theme="dark"] .ros .ros-name { background: var(--card); color: var(--ink); border-color: var(--line); }
html[data-theme="dark"] .panel { background: var(--blue-soft); color: var(--ink); }
html[data-theme="dark"] .input, html[data-theme="dark"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), html[data-theme="dark"] select, html[data-theme="dark"] textarea,
html[data-theme="dark"] .searchbox { background: #0F1727; color: var(--ink); border-color: #34415F; }
html[data-theme="dark"] ::placeholder { color: #7F8AA3; }
html[data-theme="dark"] .btn-ghost, html[data-theme="dark"] .chip-btn { background: transparent; color: var(--ink); border-color: #3A4766; }
html[data-theme="dark"] .btn-ghost:hover, html[data-theme="dark"] .chip-btn:hover, html[data-theme="dark"] .ak-row:hover { background: var(--hover); }
html[data-theme="dark"] .btn-danger { background: transparent; color: var(--bad); border-color: #6B2A30; }
html[data-theme="dark"] .btn-primary { background: var(--blue); color: #fff; }
html[data-theme="dark"] .btn-gold { color: #121A2C; }
html[data-theme="dark"] .seg, html[data-theme="dark"] .viewbar .seg { background: #0F1727; border-color: var(--line); }
html[data-theme="dark"] .seg button { color: var(--muted); }
html[data-theme="dark"] .seg button[aria-pressed="true"], html[data-theme="dark"] .tabs .tab[aria-selected="true"], html[data-theme="dark"] .tabs.on-blue .tab[aria-selected="true"] { background: var(--blue-tint); color: var(--ink); }
html[data-theme="dark"] .tab { color: var(--muted); }
html[data-theme="dark"] .viewbar { background: #111A2C; border-color: var(--line); color: var(--ink); }
html[data-theme="dark"] .vb-emp { background: #2E2716; } html[data-theme="dark"] .vb-note { color: var(--warn); }
html[data-theme="dark"] table, html[data-theme="dark"] .table { color: var(--ink); }
html[data-theme="dark"] .table-wrap thead th, html[data-theme="dark"] thead th, html[data-theme="dark"] .pm .pm-k, html[data-theme="dark"] .pm thead tr:first-child th,
html[data-theme="dark"] .table-wrap table.ts tbody td:first-child, html[data-theme="dark"] .table-wrap table.ts thead th:first-child { background: var(--card); color: #B7C0D3; border-color: var(--line); }
html[data-theme="dark"] td, html[data-theme="dark"] th { border-color: var(--line); }
html[data-theme="dark"] tbody tr:hover td { background: var(--hover); }
html[data-theme="dark"] .t-muted, html[data-theme="dark"] .muted { color: var(--muted); }
html[data-theme="dark"] .rx-bl { background: #3B171B; } html[data-theme="dark"] .rx-bl svg { color: #FF9A9E; } html[data-theme="dark"] .rx-det summary { color: #9DB9F2; }
html[data-theme="dark"] .ivc-sel, html[data-theme="dark"] .rf-ic, html[data-theme="dark"] .rf-now, html[data-theme="dark"] .lk-ic { background: var(--blue-soft); color: #A9C1F0; }
html[data-theme="dark"] .ra-bar { background: #1E2739; }
html[data-theme="dark"] .rf-who { color: var(--warn); } html[data-theme="dark"] .rf-what, html[data-theme="dark"] .ak-last { color: var(--muted); }
html[data-theme="dark"] .bday-today, html[data-theme="dark"] .c-gold { background: #34270F; color: #F3CF86; } html[data-theme="dark"] .bday-item.is-today { background: #2A2213; }
html[data-theme="dark"] .ak-row.unread, html[data-theme="dark"] .ed-anns li.urgent { background: #2E161A; }
html[data-theme="dark"] .ak-msgs li, html[data-theme="dark"] .bot-txt, html[data-theme="dark"] .ed-anns li { background: #1A2338; color: var(--ink); }
html[data-theme="dark"] .ak-msgs li.me { background: #1E3157; }
html[data-theme="dark"] .ed-week li.leave b { color: #9DB9F2; } html[data-theme="dark"] .ed-week li.susp b { color: #FF9A9E; }
html[data-theme="dark"] .ld-drop, html[data-theme="dark"] .ld-busy { background: #121B2E; color: var(--ink); border-color: #3A4766; }
html[data-theme="dark"] .ld-drop.drag, html[data-theme="dark"] .ld-drop:hover { background: #1A2541; }
html[data-theme="dark"] .dir-top b { color: var(--ink); }
html[data-theme="dark"] .ros-s, html[data-theme="dark"] .mcal-s { background: #1C2C52; color: #B9CCF5; } html[data-theme="dark"] .ros-r, html[data-theme="dark"] .mcal-d.is-rest { background: #1A2233; }
html[data-theme="dark"] .ros-today { background: #3A2F12; } html[data-theme="dark"] .ros-sun { color: #FF9A9E; } html[data-theme="dark"] .mcal-t { color: #C7CFDE; }
html[data-theme="dark"] .idp-table tr.idp-cur td { background: var(--blue-soft); }
html[data-theme="dark"] .empty-state, html[data-theme="dark"] .es-ic { color: var(--muted); }
html[data-theme="dark"] .ac-back { background: rgba(3,6,14,.72); }
html[data-theme="dark"] hr { border-color: var(--line); }
html[data-theme="dark"] svg text { fill: currentColor; }
html[data-theme="dark"] .label, html[data-theme="dark"] .stat .label, html[data-theme="dark"] .t-muted, html[data-theme="dark"] .ex-delta, html[data-theme="dark"] .ld-drop span { color: var(--muted); }
html[data-theme="dark"] .ex-delta.t-ok { color: var(--ok); } html[data-theme="dark"] .ex-delta.t-bad { color: var(--bad); }
html[data-theme="dark"] th { color: #B7C0D3; }
html[data-theme="dark"] .ex-legend { color: var(--muted); }
html[data-theme="dark"] svg [stroke="#E7E2D6"] { stroke: #2A3550; } html[data-theme="dark"] svg [fill="#1F3A68"] { fill: #5B82C9; } html[data-theme="dark"] svg [stroke="#1F3A68"] { stroke: #5B82C9; } html[data-theme="dark"] svg [stroke="#fff"] { stroke: var(--card); }
html[data-theme="dark"] .eyebrow, html[data-theme="dark"] .head .eyebrow { color: #E0BE7A !important; }
html[data-theme="dark"] .t-blue, html[data-theme="dark"] button.link, html[data-theme="dark"] .link { color: #9DB9F2; }
/* inline white panels written in page templates */
html[data-theme="dark"] [style*="background:#fff"], html[data-theme="dark"] [style*="background: #fff"], html[data-theme="dark"] [style*="background:#FFF"], html[data-theme="dark"] [style*="background:white"] { background: var(--card) !important; color: var(--ink); }
html[data-theme="dark"] [style*="color:#14213D"], html[data-theme="dark"] [style*="color: #14213D"], html[data-theme="dark"] [style*="color:#1B2333"], html[data-theme="dark"] [style*="color:#121A2C"] { color: var(--ink) !important; }
html[data-theme="dark"] [style*="color:#5A6478"], html[data-theme="dark"] [style*="color:#5F6472"], html[data-theme="dark"] [style*="color:#6B7280"] { color: var(--muted) !important; }
/* ID cards and printed sheets stay as they will look on paper */
html[data-theme="dark"] .idc, html[data-theme="dark"] .idt, html[data-theme="dark"] #idp-pad, html[data-theme="dark"] #idp-sheet { color-scheme: light; }
.theme-sw { margin-top: -8px; }
`; document.head.appendChild(st); }
