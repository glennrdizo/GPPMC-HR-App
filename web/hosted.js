/* ---------- website version (Supabase): sign-in by email replaces claude.ai sharing ---------- */
// HR editor access in the database follows the Users list: giving someone a role lets them see records; Delete takes it away.
{ const b = saveAccess; saveAccess = async (patch, msg) => {
    const before = { ...(S.access?.users || {}) }; await b(patch, msg); const after = S.access?.users || {};
    for (const id of Object.keys(after)) if (after[id]?.role && !before[id]?.role) window.__sb?.rpc("hr_set_editor", { target: id, allow: true });
    for (const id of Object.keys(before)) if (!after[id]) window.__sb?.rpc("hr_set_editor", { target: id, allow: false });
  }; }
// Invitations are claimed by the email the person signed up with (or, as before, by name).
claimInvite = async () => {
  const a = S.access; if (!a || !S.myId || S.isOwner || !S.realEdit || a.users?.[S.myId]?.role) return;
  const my = (await window.__sb?.auth.getUser())?.data?.user?.email?.toLowerCase() || "";
  const hit = Object.entries(a.invites || {}).find(([, v]) => (my && String(v.email || "").toLowerCase() === my) || (S.myName && normName(v.name) === normName(S.myName))); if (!hit) return;
  const [k, v] = hit; const users = { ...(a.users || {}), [S.myId]: { ...(a.users?.[S.myId] || {}), role: v.role, empId: v.empId || null, email: v.email || my || null, ...(v.role === "custom" ? { views: [], mods: [], edit: true } : {}) } };
  const invites = { ...a.invites }; delete invites[k]; const next = { ...a, users, invites };
  await S.db.doc("org/access").set(JSON.parse(JSON.stringify(next))); S.access = next; applyPerm(); logActivity(`${v.name} signed in and got the ${ROLES[v.role]?.name || ""} role`); render();
};
// Wording: there is no claude.ai Share menu on the website.
{ const swap = [
    [/To let someone clock in on their own phone, share this page with them as <b>Contributor<\/b> from the Share menu\./g, "To let someone clock in on their own phone, have them open this website and create an account with their email."],
    [/<b>Who can open the app<\/b> is set with the page's <b>Share<\/b> button on claude\.ai\. Give HR staff <b>Can edit<\/b>\. Anyone shared at a lower level only gets their own phone time clock\./g, "<b>Who can see records</b>: anyone with a role on this list. Everyone else who signs in gets only their own phone time clock."],
    [/Name search works when the app is opened on claude\.ai\. People also appear below once they open the app\./g, "People appear here once they have signed in to the website."],
    [/Next, share the app with them as <b>Can edit<\/b> from the Share menu\. The first time they open it, they get this role\. The name must match their claude\.ai account name\./g, "Next, send them this website's address. They create an account with this email; after they confirm it and sign in, they get this role."],
    [/ To stop them opening the app at all, also remove them from the page's Share settings on claude\.ai\./g, " They can still sign in, but only see their own time clock."],
    [/As shown on their claude\.ai account/g, "Their full name"],
    [/Sign in to claude\.ai to use the time clock\./g, "Sign in to use the time clock."],
  ];
  new MutationObserver(() => { const m = document.getElementById("main"); if (!m || !/claude\.ai|Share menu/.test(m.innerHTML)) return; for (const el of m.querySelectorAll("p,li,input[placeholder]")) { if (el.tagName === "INPUT") { const p = el.getAttribute("placeholder"); let q = p; for (const [rx, to] of swap) q = q.replace(rx, to); if (q !== p) el.setAttribute("placeholder", q); continue; } const h = el.innerHTML; if (!/claude\.ai|Share menu/.test(h)) continue; let n = h; for (const [rx, to] of swap) n = n.replace(rx, to); if (n !== h) el.innerHTML = n; } }).observe(document.body, { childList: true, subtree: true });
}
// New accounts wait for HR approval (Glenn 2026-10-12): HR checks each request against the employee records, then approves or rejects.
S.signups = null; S.suAll = false; let suAt = 0;
async function loadSignups(force) {
  if (!window.__sb || !isPermAdmin() || (!force && Date.now() - suAt < 30000)) return; suAt = Date.now();
  const { data, error } = await window.__sb.rpc("hr_signup_list"); if (error) { if (!S.signups) { S.suOff = true; render(); } return; }
  const before = JSON.stringify(S.signups); S.signups = data || []; if (JSON.stringify(S.signups) !== before) render();
}
setInterval(() => loadSignups().catch(() => {}), 60000);
const suPending = () => (S.signups || []).filter((r) => r.status === "pending");
function suMatch(r) {
  const no = normH(r.emp_no || ""); if (!no) return '<span class="chip c-gray">No employee number given</span>';
  const e = [...(S.allEmps || S.emps).values()].find((x) => normH(x.no) === no); if (!e) return `<span class="chip c-bad">No employee with number ${esc(r.emp_no)}</span>`;
  const same = normName(fullName(e)).split(" ").filter((w) => w.length > 1 && normName(r.name).split(" ").includes(w)).length >= 2;
  return same ? `<span class="chip c-ok">Matches ${esc(fullName(e))} · ${esc(e.no)}</span>${e.mobile || e.phone ? `<div class="t-muted" style="font-size:12px">Mobile on file: ${esc(e.mobile || e.phone)}</div>` : ""}`
    : `<span class="chip c-warn">Name differs: record says ${esc(fullName(e))}</span>`;
}
function signupCard() {
  if (S.suOff) return ""; const all = S.signups; if (!all) { loadSignups(true).catch(() => {}); return `<section class="card"><div class="card-head"><h2>Account requests</h2></div><p class="t-muted">Loading…</p></section>`; }
  const pend = suPending(); const done = all.filter((r) => r.status !== "pending"); const when = (t) => t ? `${fmtDate(manilaDay(t))}` : "";
  const row = (r) => `<tr><td><b>${esc(r.name || "")}</b><div class="t-muted" style="font-size:13px">${esc(r.email || "")}</div></td><td>${esc(r.emp_no || "") || '<span class="t-muted">—</span>'}<div>${suMatch(r)}</div></td>
    <td>${esc(r.position || "") || '<span class="t-muted">—</span>'}${r.note ? `<div class="t-muted" style="font-size:13px">“${esc(r.note)}”</div>` : ""}</td><td style="white-space:nowrap">${esc(r.mobile || "") || '<span class="t-muted">—</span>'}</td><td style="white-space:nowrap">${esc(when(r.requested_at))}</td>
    <td>${r.status === "pending" ? '<span class="chip c-warn">Waiting</span>' : r.status === "approved" ? `<span class="chip c-ok">Approved</span><div class="t-muted" style="font-size:12px">${esc(when(r.decided_at))}</div>` : `<span class="chip c-bad">Rejected</span><div class="t-muted" style="font-size:12px">${esc(when(r.decided_at))}</div>`}</td>
    <td class="num" style="white-space:nowrap">${r.status !== "approved" ? `<button class="btn btn-primary btn-sm" data-su-ok="${esc(r.user_id)}">Approve</button>` : ""} ${r.status !== "rejected" ? `<button class="btn btn-ghost btn-sm" style="color:#a4262c" data-su-no="${esc(r.user_id)}">${r.status === "approved" ? "Remove access" : "Reject"}</button>` : ""}</td></tr>`;
  const head = "<thead><tr><th>Name</th><th>Employee no.</th><th>Position and site</th><th>Mobile</th><th>Requested</th><th>Status</th><th></th></tr></thead>";
  return `<section class="card" id="su-card"><div class="card-head"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>Account requests</h2>${pend.length ? `<span class="chip c-warn">${pend.length} waiting</span>` : ""}</div>
    <button class="btn btn-ghost btn-sm" data-su-refresh>Refresh</button></div>
    <p class="t-muted" style="font-size:13px;margin:0 0 10px;max-width:95ch">Everyone who creates an account on this website waits here until HR checks who they are. Compare their details with the employee record (the app checks the employee number and name for you), and call their mobile number if anything looks off. Approved people get their own time clock and payslips; HR staff also need a role in the Users list above.</p>
    ${pend.length ? `<div class="table-wrap"><table>${head}<tbody>${pend.map(row).join("")}</tbody></table></div>` : '<p class="t-muted">No accounts are waiting for approval.</p>'}
    ${done.length ? `<details style="margin-top:12px" ${S.suAll ? "open" : ""}><summary data-su-all style="cursor:pointer;font-weight:700">Approved and rejected (${done.length})</summary><div class="table-wrap"><table>${head}<tbody>${done.map(row).join("")}</tbody></table></div></details>` : ""}</section>`;
}
{ const b = VIEWS.perms; VIEWS.perms = (...x) => { const h = b(...x); if (!isPermAdmin() || !window.__sb) return h; const k = h.lastIndexOf("<section", h.indexOf("<h2>Users</h2>")); return k >= 0 ? h.slice(0, k) + signupCard() + h.slice(k) : h + signupCard(); }; }
{ const b = VIEWS.dash; VIEWS.dash = (...x) => { const h = b(...x); if (!isPermAdmin() || !window.__sb) return h; loadSignups().catch(() => {}); const n = suPending().length; if (!n) return h;
    const card = `<div class="card su-alert" role="status"><b>${n} new account${n === 1 ? " is" : "s are"} waiting for your approval.</b> <span class="t-muted">Check who they are before they can open the portal.</span> <button class="btn btn-gold btn-sm" data-go="perms">Review</button></div>`;
    const i = h.indexOf('<section class="hero'); const j = i >= 0 ? h.indexOf("</section>", i) : -1; return j > 0 ? h.slice(0, j + 10) + card + h.slice(j + 10) : card + h; }; }
document.addEventListener("click", async (ev) => {
  if (ev.target.closest("[data-su-all]")) { S.suAll = !S.suAll; return; }
  if (ev.target.closest("[data-su-refresh]")) { await loadSignups(true); toast("Up to date."); return; }
  const t = ev.target.closest("[data-su-ok],[data-su-no]"); if (!t || !isPermAdmin()) return; const id = t.dataset.suOk || t.dataset.suNo; const ok = !!t.dataset.suOk;
  const r = (S.signups || []).find((x) => x.user_id === id); const nm = r?.name || r?.email || "this person";
  if (!await askConfirm(ok ? `Approve ${nm}? They can then sign in and use their own time clock and payslips.` : r?.status === "approved" ? `Remove ${nm}'s access? They will see the approval screen again.` : `Reject ${nm}'s account? They will be asked to check their details or contact HR.`, ok ? "Approve" : r?.status === "approved" ? "Remove access" : "Reject", !ok)) return;
  t.disabled = true; const { error } = await window.__sb.rpc("hr_decide_access", { target: id, approve: ok, p_note: null });
  if (error) { t.disabled = false; toast("Couldn't save. Try again."); return; }
  logActivity(`${ok ? "Approved" : r?.status === "approved" ? "Removed access for" : "Rejected"} the account of ${nm}`); toast(ok ? `${nm} is approved.` : "Saved."); await loadSignups(true); render(); });
{ const st = document.createElement("style"); st.textContent = ".su-alert{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:14px 0;border-left:4px solid #C9A45C}.su-alert .btn{margin-left:auto}"; document.head.appendChild(st); }
// HR assistant wording on the website: Claude runs through the company's key (hr-ai function), not the viewer's own account.
{ const off = () => (S.realEdit ? "The HR assistant isn't switched on yet. HR needs to add the company's Claude API key (ANTHROPIC_API_KEY) in Supabase, Edge Functions, Secrets." : "The HR assistant isn't switched on yet. Use Ask HR instead.");
  const swap = [[/^(The assistant needs Claude, which isn't available in this view\. Use Ask HR instead\.|Kailangan ng assistant ang Claude, na hindi available dito\. Gamitin ang Magtanong sa HR\.)$/, off],
    [/^Uses your own Claude account\.\s*/, () => "Uses the company's Claude service. "], [/^Uses your own Claude account, so the first question asks your permission\.\s*/, () => "Uses the company's Claude service. "],
    [/^Gumagamit ng sarili mong Claude account, kaya hihingi ito ng pahintulot sa unang tanong\.\s*/, () => "Gumagamit ng Claude service ng kumpanya. "]];
  const fix = () => { const m = document.getElementById("main"); if (!m || !/Claude/.test(m.textContent)) return;
    for (const el of m.querySelectorAll("p,small,span")) { if (el.children.length) continue; const t = el.textContent; let q = t; for (const [rx, to] of swap) q = q.replace(rx, to); if (q !== t) el.textContent = q; } };
  new MutationObserver(fix).observe(document.body, { childList: true, subtree: true });
  const b = toast; toast = (msg) => b(/isn't available in this view|hindi available dito/.test(String(msg)) ? off() : msg); }
