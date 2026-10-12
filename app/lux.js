/* ---------- v61 jewel-tone boxes on every page and report (Glenn 2026-10-12: "make all dashboard boxes colorful, luxury") ---------- */
{ const st = document.createElement("style"); st.id = "lux-css"; st.textContent = `
/* Every figure box: deep jewel gradient, champagne-gold top line and hairline, serif figures. All gradient stops are 5:1+ against white. */
:is(#main, body) :is(.stat, .ex-kpi) { --c1: #152B50; --c2: #22407A; position: relative; overflow: hidden; isolation: isolate; color: #fff; border: 0 !important; border-radius: 18px;
  background: linear-gradient(90deg, #B8913F, #E4C98E 50%, #B8913F) top / 100% 3px no-repeat, linear-gradient(135deg, var(--c1) 0%, var(--c2) 100%) !important;
  box-shadow: inset 0 0 0 1px rgba(228,201,142,.35), 0 14px 30px -18px var(--c1), 0 2px 6px -2px rgba(15,23,42,.18) !important; transition: transform .18s ease, box-shadow .18s ease; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+2) { --c1: #064E3B; --c2: #0B7A5A; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+3) { --c1: #7F1D3A; --c2: #A3204F; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+4) { --c1: #4C1D95; --c2: #6D28D9; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+5) { --c1: #134E4A; --c2: #0F766E; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+6) { --c1: #7C2D12; --c2: #A3410F; }
:is(#main, body) :is(.stat, .ex-kpi):nth-child(7n+7) { --c1: #1E3A8A; --c2: #2B4FB8; }
:is(#main, body) :is(.stat, .ex-kpi)::before { content: ""; position: absolute; z-index: -1; left: auto; right: -38px; top: -46px; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.2) 0%, rgba(255,255,255,0) 70%) !important; }
:is(#main, body) :is(.stat, .ex-kpi)::after { content: ""; position: absolute; z-index: -1; right: 18px; bottom: -30px; width: 80px; height: 80px; border-radius: 50%; border: 14px solid rgba(228,201,142,.1); }
:is(#main, body) :is(.stat, .ex-kpi) *:not(svg):not(svg *):not(.chip) { color: #fff !important; }
:is(#main, body) :is(.stat, .ex-kpi) .label { opacity: .9; letter-spacing: .09em; }
:is(#main, body) :is(.stat, .ex-kpi) .value { font-family: "Playfair Display", Georgia, serif; font-weight: 700; }
:is(#main, body) :is(.stat, .ex-kpi) .note { opacity: .95; font-weight: 600; }
:is(#main, body) :is(.stat, .ex-kpi) .note.t-ok, :is(#main, body) :is(.stat, .ex-kpi) .note.t-warn, :is(#main, body) :is(.stat, .ex-kpi) .note.t-bad { align-self: flex-start; background: rgba(255,255,255,.18); padding: 3px 10px; border-radius: 10px; opacity: 1; }
:is(#main, body) :is(.stat, .ex-kpi) .chip { background: rgba(255,255,255,.18) !important; color: #fff !important; border-color: rgba(255,255,255,.3) !important; }
:is(#main, body) :is(.stat, .ex-kpi) svg { color: #fff; }
:is(#main, body) :is(.stat, .ex-kpi) a, :is(#main, body) :is(.stat, .ex-kpi) .link { text-decoration: underline; text-decoration-color: rgba(228,201,142,.8); }
:is(#main, body) .stat[data-go], :is(#main, body) .stat.kpi-btn, :is(#main, body) button.stat { cursor: pointer; }
:is(#main, body) :is(.stat, .ex-kpi):hover { transform: translateY(-3px); box-shadow: inset 0 0 0 1px rgba(228,201,142,.55), 0 22px 38px -20px var(--c1), 0 2px 6px -2px rgba(15,23,42,.2) !important; }
:is(#main, body) :is(.stat, .ex-kpi):focus-visible { outline: 3px solid #E0BE7A; outline-offset: 3px; }
/* Monthly report figure boxes: the change line becomes a pill, green-tinted when better, rose when worse */
:is(#main, body) .ex-kpi .ex-delta { align-self: flex-start; background: rgba(255,255,255,.16); padding: 3px 10px; border-radius: 10px; font-weight: 600; }
:is(#main, body) .ex-kpi .ex-delta.t-ok { color: #BBF7D0 !important; } :is(#main, body) .ex-kpi .ex-delta.t-bad { color: #FECDD3 !important; }
:is(#main, body) .ex-kpi .label { text-transform: uppercase; font-size: 12px; font-weight: 700; }
/* Monthly report: module analysis gets a jewel band per module and colored jump pills */
.mr-mod { --mc: #152B50; border-left: 4px solid var(--mc); padding-left: 14px !important; margin-top: 10px; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--mc) 6%, transparent), transparent 40%); }
.mr-mod:nth-of-type(7n+2), .mr-pill:nth-child(7n+2) { --mc: #0B7A5A; } .mr-mod:nth-of-type(7n+3), .mr-pill:nth-child(7n+3) { --mc: #A3204F; } .mr-mod:nth-of-type(7n+4), .mr-pill:nth-child(7n+4) { --mc: #6D28D9; }
.mr-mod:nth-of-type(7n+5), .mr-pill:nth-child(7n+5) { --mc: #0F766E; } .mr-mod:nth-of-type(7n+6), .mr-pill:nth-child(7n+6) { --mc: #A3410F; } .mr-mod:nth-of-type(7n+7), .mr-pill:nth-child(7n+7) { --mc: #2B4FB8; }
.mr-pill { --mc: #152B50; border-color: color-mix(in srgb, var(--mc) 45%, transparent) !important; background: color-mix(in srgb, var(--mc) 8%, transparent) !important; }
html[data-theme="dark"] .mr-mod { background: linear-gradient(90deg, color-mix(in srgb, var(--mc) 22%, transparent), transparent 45%); }
html[data-theme="dark"] .mr-pill { background: color-mix(in srgb, var(--mc) 25%, transparent) !important; }
@media print { :is(#main, body) :is(.stat, .ex-kpi) { background: #fff !important; color: #111 !important; box-shadow: none !important; border: 1px solid #ccc !important; }
  :is(#main, body) :is(.stat, .ex-kpi) *:not(svg):not(svg *) { color: #111 !important; } :is(#main, body) :is(.stat, .ex-kpi)::before, :is(#main, body) :is(.stat, .ex-kpi)::after { display: none; } }
`; document.head.appendChild(st); }
