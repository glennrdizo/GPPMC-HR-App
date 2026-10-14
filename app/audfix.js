/* ---------- Audit fixes, 2026-10-14 (frontend) ---------- */
{ const st = document.createElement("style"); st.textContent = `
@media (max-width:480px){.card > .btn,.card-head .btn,.page-actions .btn{white-space:normal;height:auto;min-height:44px;text-align:left}}
:root:not([data-theme="dark"]) .dsec{color:#7a5a20}`; document.head.appendChild(st); }
