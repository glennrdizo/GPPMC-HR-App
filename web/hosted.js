/* ---------- website version (Supabase): sign-in by email replaces claude.ai sharing ---------- */
// HR editor access in the database follows the Users list: giving someone a role lets them see records; Delete takes it away.
{ const b = saveAccess; saveAccess = async (patch, msg) => {
    const before = { ...(S.access?.users || {}) }; await b(patch, msg); const after = S.access?.users || {};
    // "No access" keeps someone off the records in the database too, not just off the menu.
    const has = (u) => !!u?.role && u.role !== "none";
    for (const id of Object.keys(after)) if (has(after[id]) !== has(before[id])) window.__sb?.rpc("hr_set_editor", { target: id, allow: has(after[id]) });
    for (const id of Object.keys(before)) if (!after[id] && has(before[id])) window.__sb?.rpc("hr_set_editor", { target: id, allow: false });
  }; }
// Invitations are claimed by the email the person signed up with (or, as before, by name).
claimInvite = async () => {
  const a = S.access; if (!a || !S.myId || S.isOwner || !S.realEdit || a.users?.[S.myId]?.role) return;
  const my = (await window.__sb?.auth.getUser())?.data?.user?.email?.toLowerCase() || "";
  const hit = Object.entries(a.invites || {}).find(([, v]) => (my && String(v.email || "").toLowerCase() === my) || (S.myName && normName(v.name) === normName(S.myName))); if (!hit) return;
  const [k, v] = hit; const users = { ...(a.users || {}), [S.myId]: { ...(a.users?.[S.myId] || {}), role: v.role, empId: v.empId || null, email: v.email || my || null, ...(v.role === "custom" ? { views: Array.isArray(v.views) ? v.views : [], mods: Array.isArray(v.mods) ? v.mods : [], edit: v.edit !== false } : {}) } };
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
/* ---------- Applicant portal (Glenn 2026-10-14): careers page at /careers, online applications, requirements and documents ---------- */
const CAREERS = location.origin + "/careers";
const careersLink = (j, src) => `${CAREERS}?job=${encodeURIComponent(j.id)}${src ? `&src=${encodeURIComponent(src)}` : ""}`;
const prExt = (f) => (f.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || "bin").toLowerCase();
const prRand = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const blobUrl = (id) => "/_blob/" + String(id).split("/").map(encodeURIComponent).join("/");
// Every job ad carries the online apply link; each site's Post button tags it with that site so the applicant's source is recorded.
{ const b = jobAd; jobAd = (j) => b(j).replace("\nHow to apply:\n", `\nHow to apply:\nApply online: ${careersLink(j)}\n`); }
window.addEventListener("click", (ev) => {
  const t = ev.target.closest?.("[data-jp-post]"); if (!t) return; const [id, k] = t.dataset.jpPost.split("|"); const ta = document.getElementById("jp-text"); const j = S.jobs.get(id); if (!ta || !j) return;
  const line = `Apply online: ${careersLink(j, k)}`; ta.value = /^Apply online: .*$/m.test(ta.value) ? ta.value.replace(/^Apply online: .*$/m, line) : ta.value.replace("\nHow to apply:\n", `\nHow to apply:\n${line}\n`);
}, true);

// Recruitment page: the careers page link, channel links, forms applicants can download.
function careersCard() {
  const T = TSET(); const forms = T.portalForms || []; const ed = S.canEdit; const open = listOf(S.jobs).filter((j) => j.status === "OPEN" && !j.sample);
  const online = listOf(S.apps).filter((a) => a.portalUid); const waiting = online.filter((a) => Object.values(a.portal?.reqs || {}).some((r) => r.status === "SUBMITTED")).length;
  return `<section class="card" id="careers-card"><div class="card-head"><h2>Careers page and applicant portal</h2>${waiting ? `<span class="chip c-warn">${waiting} with requirements to check</span>` : ""}</div>
    <p class="t-muted" style="margin:0 0 12px;font-size:14px;max-width:95ch">Open jobs show on your careers page. Applicants apply online with their resume, follow their application, see interview schedules, send requirements and sign documents. Online applications appear in the job's applicant list with the site they came from. Add the link to gd-prime.com and your social pages.</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><a class="btn btn-primary btn-sm" href="${CAREERS}" target="_blank" rel="noopener">${icon("door", 16)}Open the careers page</a><button class="btn btn-ghost btn-sm" data-cr-copy="${CAREERS}">Copy link</button>
      <span class="t-muted" style="font-size:13px">${open.length} open job${open.length === 1 ? "" : "s"} listed · ${online.length} online applicant${online.length === 1 ? "" : "s"}</span></div>
    ${ed ? `<label class="check" style="margin-top:12px"><input type="checkbox" data-cr-hidepay ${T.careersHidePay ? "checked" : ""}><span>Hide pay rates on the careers page</span></label>` : ""}
    <h3 style="font-size:16px;margin:16px 0 6px">Forms applicants can download</h3>
    ${forms.length ? `<ul class="list">${forms.map((f) => `<li style="display:flex;gap:10px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span><a class="link" href="${blobUrl(f.file)}" target="_blank" rel="noopener">${esc(f.name)}</a>${f.note ? ` <span class="t-muted" style="font-size:13px">${esc(f.note)}</span>` : ""}</span>${ed ? `<button class="link danger" data-cr-delform="${esc(f.id)}">Remove</button>` : ""}</li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0;font-size:14px">None yet. Add your application form, ATM authorization, confidentiality agreement and other forms.</p>'}
    ${ed ? `<form id="cr-form" class="form-grid" style="margin-top:12px;align-items:end" data-keep><div class="field"><label for="cr-name">Form name</label><input class="input" id="cr-name" required placeholder="Application form"></div>
      <div class="field"><label for="cr-note">Note <span class="t-muted">(optional)</span></label><input class="input" id="cr-note" placeholder="Fill in and bring on your first day"></div>
      <div class="field"><label for="cr-file">File (PDF or Word)</label><input class="input" id="cr-file" type="file" accept="application/pdf,.doc,.docx,image/*" required></div><div><button class="btn btn-ghost">Add form</button></div></form>` : ""}</section>`;
}
{ const b = VIEWS.hiring; VIEWS.hiring = (...x) => { const h = b(...x); return S.view.name === "hiring" ? h + careersCard() : h; }; }
async function saveTalent(patch, msg) { const next = JSON.parse(JSON.stringify({ ...TSET(), ...patch })); await S.db.doc("org/talent").set(next); S.talent = next; if (msg) logActivity(msg); }

// Applicant page: what the applicant sent online, HR's review, and documents shared with them.
function portalCard(a) {
  const P = a.portal || {}; const R = P.reqs || {}; const ed = S.canEdit; const live = inProcess(a);
  if (!a.portalUid) return `<section class="card" id="ap-portal"><div class="card-head"><h2>Applicant portal</h2><span class="chip c-gray">Not linked</span></div><p class="t-muted" style="margin:0;font-size:14px">To let ${esc(a.first)} follow this application and send requirements online, ask them to create an account on the careers page${a.email ? ` with <b>${esc(a.email)}</b>` : " with the email on this record"}.</p>
    <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-cr-copy="${CAREERS}">Copy careers page link</button></div></section>`;
  const keys = [...PRE_REQS.map(([k, l]) => [k, l]), ...Object.keys(R).filter((k) => !PRE_REQS.some(([x]) => x === k)).map((k) => [k, k])];
  const ST = { SUBMITTED: ["To check", "c-warn"], ACCEPTED: ["Accepted", "c-ok"], REDO: ["Asked to send again", "c-bad"] };
  const rows = keys.map(([k, l]) => { const r = R[k]; const acc = r?.status === "ACCEPTED" || (!!a.reqs?.[k] && !r);
    return `<tr><td><b>${esc(l)}</b></td><td>${r ? `${r.file ? `<a class="link" href="${blobUrl(r.file)}" target="_blank" rel="noopener">${esc(r.name || "Open file")}</a>` : ""}${r.num ? `<div>${esc(r.num)}</div>` : ""}<div class="t-muted" style="font-size:12px">Sent ${fmtDate(manilaDay(r.at))}</div>` : '<span class="t-muted">Not sent</span>'}</td>
      <td>${r ? `<span class="chip ${ST[r.status]?.[1] || "c-gray"}">${ST[r.status]?.[0] || ""}</span>${r.status === "REDO" && r.note ? `<div class="t-muted" style="font-size:12px">${esc(r.note)}</div>` : ""}` : acc ? '<span class="chip c-ok">Received</span>' : ""}</td>
      <td class="num" style="white-space:nowrap">${ed && live && r && r.status !== "ACCEPTED" ? `<button class="btn btn-primary btn-sm" data-pr-ok="${a.id}:${k}">Accept</button>` : ""}${ed && live && r && r.status === "SUBMITTED" ? ` <input class="input" data-pr-note="${k}" placeholder="What to fix" aria-label="What to fix for ${esc(l)}" style="width:150px;padding:6px 8px;font-size:13px"> <button class="btn btn-ghost btn-sm" data-pr-redo="${a.id}:${k}">Ask to send again</button>` : ""}</td></tr>`; }).join("");
  const shared = P.shared || [];
  return `<section class="card" id="ap-portal"><div class="card-head"><h2>Applicant portal</h2><span class="chip c-ok">${P.via === "careers" ? "Applied online" : "Linked to their account"}</span></div>
    ${P.withdrawn ? `<p class="t-bad" style="margin:0 0 10px">Withdrew online on ${fmtDate(manilaDay(P.withdrawn))}.</p>` : ""}
    <p class="t-muted" style="margin:0 0 10px;font-size:14px">${esc(a.first)} sees the stage, interview schedules, the job offer once it is Sent, and the documents below. Accepting a requirement ticks it in the checklist; on hire, the files go to the 201 file.</p>
    <h3 style="font-size:16px;margin:6px 0">Requirements sent online</h3>
    <div class="table-wrap"><table><thead><tr><th>Requirement</th><th>Sent</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 style="font-size:16px;margin:16px 0 6px">Documents for ${esc(a.first)}</h3>
    ${shared.length ? `<ul class="list">${shared.map((s) => { const bk = P.back?.[s.id]; return `<li style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span><a class="link" href="${blobUrl(s.file)}" target="_blank" rel="noopener">${esc(s.name)}</a> ${s.sign ? (bk ? `<span class="chip c-ok">Signed copy received</span> <a class="link" href="${blobUrl(bk.file)}" target="_blank" rel="noopener">Open signed copy</a>` : '<span class="chip c-warn">Waiting for signature</span>') : '<span class="chip c-gray">For their information</span>'}</span>${ed ? `<button class="link danger" data-pr-unshare="${a.id}:${esc(s.id)}">Remove</button>` : ""}</li>`; }).join("")}</ul>` : '<p class="t-muted" style="margin:0;font-size:14px">Nothing shared yet. Share the offer letter, contract or other papers for them to download and sign.</p>'}
    ${ed && live ? `<form class="form-grid pr-share" data-app-id="${a.id}" style="margin-top:12px;align-items:end" data-keep><div class="field"><label for="pr-sname">Document name</label><input class="input" id="pr-sname" required placeholder="Job offer letter"></div>
      <div class="field"><label for="pr-sfile">File</label><input class="input" id="pr-sfile" type="file" accept="application/pdf,.doc,.docx,image/*" required></div>
      <label class="check" style="align-self:center"><input type="checkbox" id="pr-ssign" checked><span>Needs their signature</span></label><div><button class="btn btn-ghost">Share with ${esc(a.first)}</button></div></form>` : ""}</section>`;
}
{ const b = VIEWS.applicant; VIEWS.applicant = (...x) => { const h = b(...x); const a = S.apps.get(S.view.id); if (!a) return h; const i = h.indexOf('<div class="two">'); const c = portalCard(a); return i >= 0 ? h.slice(0, i) + c + h.slice(i) : h + c; }; }
async function prUpdate(a, patch) { await S.db.doc(`applicants/${a.id}`).update(JSON.parse(JSON.stringify(patch)));
  const deep = (x, y) => { const o = { ...(x || {}) }; for (const k in y) o[k] = y[k] && typeof y[k] === "object" && !Array.isArray(y[k]) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? deep(o[k], y[k]) : y[k]; return o; };
  S.apps.set(a.id, deep(a, patch)); S.ver++; }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-cr-copy],[data-cr-delform],[data-pr-ok],[data-pr-redo],[data-pr-unshare]"); if (!t) return; ev.preventDefault();
  if (t.dataset.crCopy) { try { await navigator.clipboard.writeText(t.dataset.crCopy); toast("Link copied."); } catch { toast(t.dataset.crCopy); } return; }
  if (!S.canEdit) return;
  try {
    if (t.dataset.crDelform) { const f = (TSET().portalForms || []).find((x) => x.id === t.dataset.crDelform); if (!f || !await askConfirm(`Remove ${f.name} from the careers page?`, "Remove", true)) return;
      await saveTalent({ portalForms: (TSET().portalForms || []).filter((x) => x.id !== f.id) }, `Removed the ${f.name} form from the careers page`); window.__sb?.storage.from("hr-files").remove([f.file]).catch(() => {}); toast("Removed."); render(); return; }
    const [id, k] = (t.dataset.prOk || t.dataset.prRedo || t.dataset.prUnshare).split(":"); const a = S.apps.get(id); if (!a) return;
    if (t.dataset.prOk) { const l = PRE_REQS.find(([x]) => x === k)?.[1] || k; await prUpdate(a, { portal: { reqs: { [k]: { status: "ACCEPTED", note: null, by: S.myId || null, d: todayISO() } } }, reqs: { [k]: a.reqs?.[k] || todayISO() } }); logActivity(`Accepted ${appName(a)}'s ${l}`); toast("Accepted."); render(); return; }
    if (t.dataset.prRedo) { const note = document.querySelector(`[data-pr-note="${k}"]`)?.value.trim(); if (!note) { toast("Say what to fix, like \"Photo is blurry\"."); document.querySelector(`[data-pr-note="${k}"]`)?.focus(); return; }
      await prUpdate(a, { portal: { reqs: { [k]: { status: "REDO", note: note.slice(0, 200) } } } }); logActivity(`Asked ${appName(a)} to send a requirement again`); toast(`${a.first} will see your note on the careers page.`); render(); return; }
    if (t.dataset.prUnshare) { const s = (a.portal?.shared || []).find((x) => x.id === k); if (!s || !await askConfirm(`Stop sharing ${s.name} with ${a.first}?`, "Remove", true)) return;
      await prUpdate(a, { portal: { shared: (a.portal?.shared || []).filter((x) => x.id !== k) } }); window.__sb?.storage.from("hr-files").remove([s.file]).catch(() => {}); toast("Removed."); render(); return; }
  } catch { toast("Couldn't save. Try again."); }
});
document.addEventListener("change", async (ev) => { if (!ev.target.matches?.("[data-cr-hidepay]") || !S.canEdit) return; try { await saveTalent({ careersHidePay: ev.target.checked }, `${ev.target.checked ? "Hid" : "Showed"} pay rates on the careers page`); toast("Saved."); } catch { toast("Couldn't save. Try again."); } });
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!(f.id === "cr-form" || f.classList?.contains("pr-share"))) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit || !window.__sb) return;
  const file = f.querySelector("input[type=file]")?.files?.[0]; if (!file) { toast("Choose the file."); return; } if (file.size > 20 * 1048576) { toast("That file is over 20 MB."); return; }
  const btn = f.querySelector("button"); btn.disabled = true; toast("Uploading…");
  try {
    if (f.id === "cr-form") { const name = $("#cr-name").value.trim(); if (!name) throw new Error("name"); const path = `forms/${prRand()}.${prExt(file)}`;
      const { error } = await window.__sb.storage.from("hr-files").upload(path, file, { contentType: file.type || "application/octet-stream" }); if (error) throw error;
      await saveTalent({ portalForms: [...(TSET().portalForms || []), { id: prRand(), name: name.slice(0, 120), note: $("#cr-note").value.trim().slice(0, 200) || null, file: path }] }, `Added the ${name} form to the careers page`); toast("Form added."); render(); return; }
    const a = S.apps.get(f.dataset.appId); const name = $("#pr-sname").value.trim(); if (!a?.portalUid || !name) throw new Error("name");
    const path = `share/${a.portalUid}/${prRand()}.${prExt(file)}`; const { error } = await window.__sb.storage.from("hr-files").upload(path, file, { contentType: file.type || "application/octet-stream" }); if (error) throw error;
    await prUpdate(a, { portal: { shared: [...(a.portal?.shared || []), { id: prRand(), name: name.slice(0, 120), file: path, sign: $("#pr-ssign").checked, at: todayISO() }] } });
    logActivity(`Shared ${name} with applicant ${appName(a)}`); toast(`Shared. ${a.first} can download it on the careers page.`); render();
  } catch (x) { btn.disabled = false; toast(x?.message === "name" ? "Enter the name." : "Couldn't upload. Try again."); }
}, true);
// Hiring carries what the applicant sent online into the 201 file: documents, signed copies and government numbers.
{ const b = hireApplicant; hireApplicant = async () => { const aid = S.view.id; await b(); const a = S.apps.get(aid); const e = a?.empId && S.emps.get(a.empId); if (!e || !a.portalUid) return;
    const P = a.portal || {}; const docs = [...(e.docs || [])]; const have = new Set(docs.map((d) => d.id)); const n = { ...e };
    for (const [k, r] of Object.entries(P.reqs || {})) { if (r.file && !have.has(r.file)) docs.push({ id: r.file, kind: PRE_REQS.find(([x]) => x === k)?.[1] || k, name: r.name || k, at: todayISO(), exp: null });
      if (r.num && ["sss", "philhealth", "pagibig", "tin"].includes(k) && !n[k]) n[k] = r.num; }
    for (const s of P.shared || []) { const bk = P.back?.[s.id]; if (bk?.file && !have.has(bk.file)) docs.push({ id: bk.file, kind: "Signed document", name: `${s.name} (signed)`, at: todayISO(), exp: null }); }
    n.docs = docs; try { await saveEmp(n); S.emps.set(n.id, n); } catch {} }; }
