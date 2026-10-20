/* ---------- Approvals everywhere (Glenn 2026-10-20: full automation) ----------
   1. One-tap approve: approval emails carry a link to the app ending in #apv=<kind>:<key>. The app opens that request and asks
      "Approve?"; yes presses the request's own Approve button, so the approval chain (ops.js) and every module's checks and
      follow-up steps still run. The link approves nothing by itself, and only HR editors can approve.
   2. Filing leave as "Approved", or overtime with "Approve now", is not offered when an approval chain is set for that kind
      (review F5): the request is filed as waiting and goes through the chain. */
const APV_KEY = "hr-apv";
{ const m = /[#&]apv=([^&]+)/.exec(location.hash || ""); if (m) { try { sessionStorage.setItem(APV_KEY, decodeURIComponent(m[1])); } catch {} history.replaceState(null, "", location.pathname + location.search); } }
window.addEventListener("hashchange", () => { const m = /[#&]apv=([^&]+)/.exec(location.hash || ""); if (!m) return; try { sessionStorage.setItem(APV_KEY, decodeURIComponent(m[1])); } catch {} history.replaceState(null, "", location.pathname + location.search); apvTry(); });
let apvBusy = false;
async function apvTry() {
  let v = null; try { v = sessionStorage.getItem(APV_KEY); } catch {} if (!v || apvBusy) return;
  if (!S.db || !S.loaded?.emps || !S.realEdit && !S.selfMode) return;
  apvBusy = true; try { sessionStorage.removeItem(APV_KEY); } catch {}
  try {
    const i = v.indexOf(":"); const kind = v.slice(0, i), key = v.slice(i + 1); const K = OPK_BY[kind];
    if (!K || S.selfMode) { toast("This link is for HR approvers."); return; }
    let r = null; try { r = K[3]().find((x) => String(x.key || x.id) === key); } catch {}
    go(K[2](r || {})); await new Promise((res) => setTimeout(res, 300));
    if (!r) { toast("That request was not found. It may have been deleted."); return; }
    const who = r.empId ? opEmp(r) : null; const label = `${K[1].toLowerCase()}${who ? ` of ${fullName(who)}` : ""}`;
    if (r.status !== "PENDING") { toast(`This ${label} is already ${String(r.status || "").toLowerCase()}.`); return; }
    if (!S.canEdit || !K[4]) { toast(`Open the ${label} below to decide on it.`); return; }
    const ch = OPS().chains[kind] || []; const done = S.apprs.get(apprId(kind, key))?.steps?.length || 0; const step = ch[done];
    if (!(await askConfirm(step ? `Endorse the ${label} as ${step.name}?` : `Approve the ${label}?${r.from ? ` (${fmtDate(r.from)}${r.to && r.to !== r.from ? ` to ${fmtDate(r.to)}` : ""})` : r.d ? ` (${fmtDate(r.d)})` : ""}`, step ? "Endorse" : "Approve"))) return;
    const b = document.createElement("button"); b.hidden = true; b.setAttribute(`data-${K[4]}-set`, `${key}:APPROVED`); (document.getElementById("main") || document.body).appendChild(b);
    S.apvOk = !!step; b.click(); S.apvOk = false; setTimeout(() => b.remove(), 0);
  } finally { apvBusy = false; }
}
{ const b = render; render = (...a) => { const r = b(...a); if (!apvBusy) { let v = null; try { v = sessionStorage.getItem(APV_KEY); } catch {} if (v) setTimeout(apvTry, 0); } return r; }; }

/* F5: no straight-to-approved filing where a chain is set */
function apvChainForms(root) {
  let O; try { O = OPS(); } catch { return; } if (!Object.keys(O.chains || {}).length) return;
  if (O.chains.leave?.length) for (const sel of root.querySelectorAll?.("#lf-status") || []) {
    const op = sel.querySelector('option[value="APPROVED"]'); if (!op) continue; op.remove(); sel.value = "PENDING";
    if (!sel.parentElement.querySelector(".apv-note")) sel.insertAdjacentHTML("afterend", `<small class="t-muted apv-note">Goes through the approval chain: ${esc(O.chains.leave.map((c) => c.name).join(", then "))}.</small>`); }
  if (O.chains.ot?.length) for (const cb of root.querySelectorAll?.("#ot-ok") || []) {
    if (cb.disabled) continue; cb.checked = false; cb.disabled = true; const lab = cb.closest("label");
    if (lab && !lab.querySelector(".apv-note")) lab.insertAdjacentHTML("beforeend", ` <small class="t-muted apv-note">(off: overtime goes through the approval chain)</small>`); }
}
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) apvChainForms(n.querySelector ? n : document); }).observe(document.body, { childList: true, subtree: true });
