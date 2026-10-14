/* ---------- Audit fixes, 2026-10-14 (frontend) ---------- */
{ const st = document.createElement("style"); st.textContent = `
@media (max-width:480px){.card > .btn,.card-head .btn,.page-actions .btn{white-space:normal;height:auto;min-height:44px;text-align:left}}
:root:not([data-theme="dark"]) .dsec{color:#7a5a20}`; document.head.appendChild(st); }
/* Colored boxes placed inside a card (dashboard Hiring, Joining and leaving, Training, and the like) had no inner padding and a
   fixed height, so their text touched the edge and was cut off. They now pad like the other tiles and grow with their text. */
{ const st = document.createElement("style"); st.textContent = `
#main .stat:not(.stats > .stat):not(.kpis > .stat),#main .card .stats:not(.kpis) > .stat{padding:16px 18px;height:auto;min-height:0;box-sizing:border-box;justify-content:flex-start;gap:4px}
#main .stat:not(.stats > .stat):not(.kpis > .stat) .note,#main .card .stats:not(.kpis) > .stat .note{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.35}
#main .stat .label{white-space:normal;overflow-wrap:anywhere}
#main .card > div[style*="display:flex"]:has(> .stat){flex-wrap:wrap;gap:14px!important}
#main .card > div[style*="display:flex"] > .stat{flex:1 1 100px;min-width:0;padding:16px 14px!important}`; document.head.appendChild(st); }
