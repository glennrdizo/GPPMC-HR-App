/* ---------- v57 colorful dashboard boxes + phone/tablet/desktop layouts (Glenn 2026-10-11) ---------- */
{ const st = document.createElement("style"); st.id = "look-css"; st.textContent = `
/* Key figure boxes (dashboards): deep gradients that keep white text readable (each stop is 5:1 or better against white) */
.kpis > .stat { --c1: #1E40AF; --c2: #2563EB; position: relative; overflow: hidden; isolation: isolate; color: #fff; border: 0 !important;
  background: linear-gradient(135deg, var(--c1) 0%, var(--c2) 100%) !important; box-shadow: 0 14px 30px -18px var(--c1), 0 2px 6px -2px rgba(15,23,42,.18) !important; }
.kpis > .stat::before { content: ""; position: absolute; z-index: -1; right: -38px; top: -46px; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 70%); }
.kpis > .stat::after { content: ""; position: absolute; z-index: -1; right: 18px; bottom: -30px; width: 80px; height: 80px; border-radius: 50%; border: 14px solid rgba(255,255,255,.08); }
.kpis > .stat:nth-child(6n+2) { --c1: #155E75; --c2: #0E7490; }
.kpis > .stat:nth-child(6n+3) { --c1: #9A3412; --c2: #C2410C; }
.kpis > .stat:nth-child(6n+4) { --c1: #5B21B6; --c2: #7C3AED; }
.kpis > .stat:nth-child(6n+5) { --c1: #065F46; --c2: #047857; }
.kpis > .stat:nth-child(6n+6) { --c1: #9F1239; --c2: #BE123C; }
.kpis > .stat .label, .kpis > .stat .value, .kpis > .stat .note, .kpis > .stat .note[class*="t-"], .kpis > .stat .kpi-split, .kpis > .stat .kpi-split b,
.kpis > .stat a, .kpis > .stat .link, .kpis > .stat b, .kpis > .stat span { color: #fff !important; }
.kpis > .stat .label { opacity: .92; letter-spacing: .09em; }
.kpis > .stat .note { opacity: .95; font-weight: 600; }
.kpis > .stat .note.t-ok, .kpis > .stat .note.t-warn, .kpis > .stat .note.t-bad { align-self: flex-start; background: rgba(255,255,255,.18); padding: 3px 10px; border-radius: 10px; opacity: 1; }
.kpis > .stat .kpi-ic { background: rgba(255,255,255,.18) !important; color: #fff !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }
.kpis > .stat .kpi-ic svg { color: #fff; stroke: currentColor; }
.kpis > .stat .kpi-bar { background: rgba(255,255,255,.25); } .kpis > .stat .kpi-bar i { background: #fff; }
.kpis > .stat:hover { transform: translateY(-3px); box-shadow: 0 22px 38px -20px var(--c1), 0 2px 6px -2px rgba(15,23,42,.2) !important; }
.kpis > .stat:focus-visible { outline: 3px solid #E0BE7A; outline-offset: 3px; }
html[data-theme="dark"] .kpis > .stat { background: linear-gradient(135deg, var(--c1) 0%, var(--c2) 100%) !important; color: #fff; }
html[data-theme="dark"] .kpis > .stat .label, html[data-theme="dark"] .kpis > .stat .note, html[data-theme="dark"] .kpis > .stat .t-muted { color: #fff !important; }
/* night mode: pop-up messages were light text on a light box */
html[data-theme="dark"] .toast { background: #22304F; color: #fff; border: 1px solid #3A4766; }
/* Other figure boxes: white card with a colored top edge and matching label */
.stats:not(.kpis) > .stat { --a: #2563EB; --at: #1E40AF; position: relative; overflow: hidden; border-top: 0; }
.stats:not(.kpis) > .stat::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, var(--a), var(--at)); }
.stats:not(.kpis) > .stat:nth-child(6n+2) { --a: #0891B2; --at: #155E75; }
.stats:not(.kpis) > .stat:nth-child(6n+3) { --a: #EA580C; --at: #9A3412; }
.stats:not(.kpis) > .stat:nth-child(6n+4) { --a: #7C3AED; --at: #5B21B6; }
.stats:not(.kpis) > .stat:nth-child(6n+5) { --a: #059669; --at: #065F46; }
.stats:not(.kpis) > .stat:nth-child(6n+6) { --a: #E11D48; --at: #9F1239; }
.stats:not(.kpis) > .stat > .label { color: var(--at) !important; }
html[data-theme="dark"] .stats:not(.kpis) > .stat > .label { color: #C9D2E6 !important; }
@media print { .kpis > .stat { background: #fff !important; color: #111 !important; box-shadow: none !important; border: 1px solid #ccc !important; }
  .kpis > .stat * { color: #111 !important; } .kpis > .stat::before, .kpis > .stat::after { display: none; } }

/* Desktop: wide screens keep lines readable */
@media (min-width: 1680px) { .main { max-width: 1560px; } .kpis { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); } }
/* Tablet landscape and small laptops: slimmer menu so pages get the room */
@media (min-width: 901px) and (max-width: 1180px) {
  .rail { width: 264px; flex: 0 0 264px; padding: 20px 10px; }
  .rail #nav [data-go], .rail .nav-label { font-size: 14px; }
  .rail .nav-mini { font-size: 12px; white-space: nowrap; }
  .main { padding: 20px 20px 36px; }
  .stats.kpis:has(> .stat) { gap: 14px; }
  .kpi .value { font-size: 32px; }
  .hero { padding: 24px; } .hero h1 { font-size: 30px; }
}
/* Tablet portrait: two or three boxes a row, the menu opens over the page */
@media (min-width: 601px) and (max-width: 900px) {
  .stats:has(> .stat) { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
  .kpi .value { font-size: 32px; }
  .two, .three { grid-template-columns: minmax(0, 1fr); }
}
/* Tablets: three boxes a row, the last row stretches so no gap is left */
@media (min-width: 601px) and (max-width: 1180px) {
  .stats.kpis:has(> .stat) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .kpis > .stat { grid-column: span 2; }
  .kpis > .stat:nth-last-child(2):nth-child(3n+1), .kpis > .stat:last-child:nth-child(3n+2) { grid-column: span 3; }
  .kpis > .stat:last-child:nth-child(3n+1) { grid-column: 1 / -1; }
}
/* Phone: two boxes a row, compact type, full-width forms and dialogs */
@media (max-width: 600px) {
  .stats:has(> .stat) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
  .stats:not(:has(> .stat)) { grid-template-columns: minmax(0, 1fr) !important; }
  .stats > .card > div[style*="display:flex"] { flex-wrap: wrap; }
  .stats > .stat { padding: 14px !important; gap: 4px; min-width: 0; }
  .stats > .stat:first-child:nth-last-child(odd) { grid-column: 1 / -1; }
  .stats > .stat .label { font-size: 11px; letter-spacing: .06em; overflow-wrap: anywhere; }
  .stats > .stat .value, .kpi .value { font-size: 26px !important; overflow-wrap: anywhere; }
  .stats > .stat .note { font-size: 12px; }
  .stats > .stat .value.v-long { font-size: 20px !important; }
  .stats > .stat .value.v-xlong { font-size: 16px !important; }
  .kpis > .stat .kpi-ic { width: 32px; height: 32px; border-radius: 10px; margin-bottom: 2px; }
  .kpis > .stat .kpi-split { flex-wrap: wrap; gap: 4px 12px; }
  .main { padding: 14px 12px 28px !important; gap: 16px; }
  .card { padding: 16px; border-radius: 16px; }
  .hero { padding: 20px 18px; border-radius: 18px; } .hero h1 { font-size: 26px !important; }
  .head h1, .main .head h1 { font-size: 24px !important; }
  .grid-tiles { grid-template-columns: minmax(0, 1fr) !important; }
  .form-grid, .fgrid { grid-template-columns: minmax(0, 1fr) !important; }
  .io-dlg, .ac-box { width: calc(100vw - 24px) !important; max-width: none !important; }
  input, select, textarea { font-size: 16px; }
}
/* Touch screens (phones and tablets): finger-sized buttons */
@media (pointer: coarse) {
  .btn, .chip-btn, .seg button, .tabs .tab, .hero-links button { min-height: 44px; }
  .btn-sm { min-height: 38px; }
}
`; document.head.appendChild(st); }
/* long figures (money) get a smaller size so they do not break across lines on phones */
{ let q = 0; const mark = () => { q = 0; for (const v of document.querySelectorAll("#main .stats > .stat .value")) { const n = v.textContent.trim().length; v.classList.toggle("v-long", n > 7 && n <= 10); v.classList.toggle("v-xlong", n > 10); } };
  new MutationObserver(() => { if (!q) q = requestAnimationFrame(mark); }).observe(document.body, { childList: true, subtree: true }); }
