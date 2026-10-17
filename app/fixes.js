/* ---------- v50 audit fixes (October 11, 2026) ---------- */
/* Security helpers. */
function hrDev(id) { id = String(id || ""); return id === "biometric" || id === "adjust" || id.startsWith("kiosk-"); }
function safeImgUrl(u) { return typeof u === "string" && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || /^\/_blob\/[A-Za-z0-9_-]+$/.test(u)); }
function safeDocUrl(u) { return typeof u === "string" && (safeImgUrl(u) || /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(u)); }
function revId(dev, d, id) { return `${dev}_${d}_${id}`.replace(/[^A-Za-z0-9_-]/g, "_"); }
S.punchRevs = new Map(); S.tickLedger = new Map();
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("punchrev").limit(5000).onSnapshot((snap) => { S.punchRevs = new Map(snap.docs.map((d) => { const r = d.data(); return [`${r.dev}|${r.d}|${r.id}`, r]; })); S.ver++; refresh(); }, () => {});
  db.collection("tickhr").limit(2000).onSnapshot((snap) => { S.tickLedger = new Map(snap.docs.map((d) => [d.id, d.data()])); S.ver++; refresh(); }, () => {}); }; }

/* One confirm style everywhere. The page viewer blocks the browser's own confirm box, so this is an in-page dialog. */
function askConfirm(msg, ok = "OK", danger = false) {
  return new Promise((resolve) => {
    const back = document.createElement("div"); back.className = "ac-back";
    back.innerHTML = `<div class="ac-box" role="alertdialog" aria-modal="true" aria-labelledby="ac-msg"><p id="ac-msg"></p><div class="ac-row"><button class="btn" data-ac="0">Cancel</button><button class="btn ${danger || /^(delete|remove)/i.test(msg) ? "btn-danger" : "btn-primary"}" data-ac="1"></button></div></div>`;
    back.querySelector("#ac-msg").textContent = msg; back.querySelector('[data-ac="1"]').textContent = ok;
    const prev = document.activeElement;
    const done = (v) => { document.removeEventListener("keydown", key, true); back.remove(); try { prev?.focus?.(); } catch {} resolve(v); };
    const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(false); } else if (ev.key === "Tab") { const bs = [...back.querySelectorAll("button")]; const i = bs.indexOf(document.activeElement); ev.preventDefault(); bs[(i + (ev.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); } };
    back.addEventListener("click", (ev) => { const b = ev.target.closest("[data-ac]"); if (b) done(b.dataset.ac === "1"); else if (ev.target === back) done(false); });
    document.addEventListener("keydown", key, true); document.body.appendChild(back); back.querySelector('[data-ac="1"]').focus();
  });
}
{ const st = document.createElement("style"); st.textContent = `.ac-back{position:fixed;inset:0;background:rgba(10,18,40,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.ac-box{background:#fff;border-radius:10px;max-width:440px;width:100%;padding:20px 20px 16px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.ac-box p{margin:0 0 16px;white-space:pre-line;font-size:15px;line-height:1.5;color:#1b2333}
.ac-row{display:flex;justify-content:flex-end;gap:8px}
.btn-danger{background:#a4262c;color:#fff;border-color:#a4262c}`; document.head.appendChild(st); }

/* Ask HR: messages on a phone's ticket are written by the phone. Only HR's own ledger says which messages HR wrote, who has seen it, and its status. */
const tickKey = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, "_");
function akClean(t) {
  const L = S.tickLedger.get(tickKey(t.key)) || null; const hr = new Set(L?.hr || []);
  const msgs = (t.msgs || []).map((m) => m && m.by !== "emp" && !hr.has(m.t) ? { ...m, by: "emp" } : m);
  let status = t.status; if (["ANSWERED"].includes(status) && L?.status !== status) status = "OPEN";
  return { ...t, msgs, status, seen: L?.seen || {}, tags: L?.tags || [] };
}
{ const b = saveTix; saveTix = async (t, patch) => { const full = await b(t, patch);
  if (t.src === "self" && !S.selfMode) { const L = S.tickLedger.get(tickKey(t.key)) || {}; const hr = new Set(L.hr || []);
    for (const m of patch.msgs || []) if (m && m.by !== "emp") hr.add(m.t);
    const next = { key: t.key, hr: [...hr], status: patch.status || full.status || L.status || "OPEN", seen: patch.seen || L.seen || {}, tags: patch.tags || L.tags || [] };
    S.tickLedger.set(tickKey(t.key), next); S.db.doc(`tickhr/${tickKey(t.key)}`).set(next).catch(() => {}); }
  return full; }; }

/* HR assistant: pay figures only for roles with Payroll. */
const PAY_KEYS = /^(basicPay|slips|loans|t13|payslips?|net|gross|ded|pay|salary|rate|amort|bal|allowances?|commission)$/i;
function scrubPay(x) { if (Array.isArray(x)) return x.map(scrubPay); if (x && typeof x === "object") { const o = {}; for (const [k, v] of Object.entries(x)) if (!PAY_KEYS.test(k)) o[k] = scrubPay(v); return o; } return x; }
const canSeePay = () => !S.perm || !S.perm.mods || S.perm.mods.includes("Payroll");
{ const b = hrTools; hrTools = () => { const ts = b(); if (canSeePay()) return ts;
  return ts.filter((t) => !/payslip|payroll|loan|salary|pay_/i.test(t.name)).map((t) => ({ ...t, description: t.description.replace(/pay rate, |payslips, |loans, /g, ""), execute: async (a) => scrubPay(await t.execute(a)) })); }; }

/* Payroll and HR rules. */
// Deleting an approved overtime request takes its hours off the time sheet.
{ const b = drop; drop = async (col, id) => { const prev = col === "otreqs" ? S.otReqs?.get(id) : null; await b(col, id); if (prev?.status === "APPROVED") syncOt({ ...prev, status: "DELETED" }, prev).catch(() => {}); }; }
// Final pay is frozen when it is released, so later loan payoffs and 13th month records don't change the statement.
{ const b = finalPay; finalPay = (e, o) => (o?.released && o.final ? o.final : b(e, o)); }
// Probation ends by law after six months: a probationary employee becomes regular on the due date.
const LK_REG_SINCE = "2026-10-11";
const regOverdue = () => active().filter((e) => e.status === "PROBATIONARY" && e.hire && regDue(e) <= todayISO() && !(S.offb?.get(e.id) && !S.offb.get(e.id).closed));
async function regularize(e, why) {
  const d = regDue(e); const n = { ...e, status: "REGULAR", history: [...(e.history || []), { d, kind: "Regularized", text: why }] };
  await saveEmp(n); S.emps.set(n.id, n); try { await lkPaf(n, { status: "REGULAR" }, { status: "PROBATIONARY" }, "STATUS", d, why, true); } catch {} logActivity(`Regularized ${fullName(e)}: ${why}`);
}
async function autoRegularize() {
  if (!S.realEdit || !S.canEdit) return; let n = 0;
  for (const e of regOverdue()) if (regDue(e) >= LK_REG_SINCE) { await regularize(e, "Six months of probation completed (regular by law)"); n++; }
  if (n) { toast(`${n} ${n === 1 ? "employee is" : "employees are"} now regular after six months of probation.`); render(); }
}
{ const b = bootIO; bootIO = (db) => { b(db); setTimeout(function tick() { autoRegularize().catch(() => {}); setTimeout(tick, 60000); }, 14000); }; }
{ const b = VIEWS.reminders; VIEWS.reminders = () => { const h = b(); const old = regOverdue().filter((e) => regDue(e) < LK_REG_SINCE); if (!old.length) return h;
  const card = `<section class="card notice-card" style="border-left:3px solid var(--warn,#b7791f)"><div class="card-head"><h2>Past probation, still marked probationary</h2>${S.canEdit ? `<button class="btn btn-primary btn-sm" data-reg-all>Make all ${old.length} regular</button>` : ""}</div>
    <p style="margin:0 0 8px;font-size:14px;max-width:80ch">These employees passed six months of service, so they are regular by law. Update their status, or check their hire dates.</p>
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Hired</th><th>Probation ended</th></tr></thead><tbody>${old.slice(0, 50).map((e) => `<tr><td>${personCell(e, esc(e.no))}</td><td>${fmtDate(e.hire)}</td><td>${fmtDate(regDue(e))}</td></tr>`).join("")}</tbody></table></div></section>`;
  const i = h.indexOf("<section"); return i < 0 ? h + card : h.slice(0, i) + card + h.slice(i); }; }
document.addEventListener("click", async (ev) => { const t = ev.target.closest("[data-reg-all]"); if (!t) return; ev.stopImmediatePropagation(); const old = regOverdue().filter((e) => regDue(e) < LK_REG_SINCE);
  if (!old.length || !await askConfirm(`Change ${old.length} ${old.length === 1 ? "employee" : "employees"} from Probationary to Regular, effective on each one's probation end date?`)) return; t.disabled = true;
  for (const e of old) await regularize(e, "Six months of probation completed (regular by law)").catch(() => {}); toast("Status updated."); render(); }, true);

/* Keyboard and screen reader fixes. */
document.body.insertAdjacentHTML("afterbegin", '<a class="skip-link" href="#main">Skip to content</a>');
document.addEventListener("click", (ev) => { const a = ev.target.closest(".skip-link"); if (!a) return; ev.preventDefault(); ev.stopImmediatePropagation(); $("#main")?.focus(); }, true);
// Phone menu drawer: Escape closes it and focus moves into it when it opens.
document.addEventListener("keydown", (ev) => { if (ev.key !== "Escape" || !S.navOpen || document.querySelector(".ac-back")) return; S.navOpen = false; renderNav(); $("#menu-toggle")?.focus(); });
document.addEventListener("click", (ev) => { if (!ev.target.closest("#menu-toggle")) return; setTimeout(() => { if (S.navOpen) $("#nav [data-go], #nav button")?.focus(); }, 0); });
// Tabs that open another page are page links, not tabs; real tabs move with the arrow keys.
function fixTabs(root) { for (const t of root.querySelectorAll('[role="tab"][data-go]')) { t.removeAttribute("role"); if (t.getAttribute("aria-selected") === "true") t.setAttribute("aria-current", "page"); t.removeAttribute("aria-selected"); }
  for (const l of root.querySelectorAll('[role="tablist"]')) if (!l.querySelector('[role="tab"]')) l.removeAttribute("role"); }
// Menu sub-items named only "Head Office" or "Projects" say which page they belong to.
function fixNav(nav) { for (const b of nav.querySelectorAll('[data-go$="_ho"]:not([aria-label]),[data-go$="_prj"]:not([aria-label])')) { const base = b.dataset.go.replace(/_(ho|prj)$/, ""); const p = nav.querySelector(`[data-go="${base}"]`); if (p) b.setAttribute("aria-label", `${p.textContent.trim()}: ${b.textContent.trim()}`); } }
new MutationObserver(() => { const m = $("#main"); if (m) fixTabs(m); const n = $("#nav"); if (n) fixNav(n); }).observe(document.body, { childList: true, subtree: true });
document.addEventListener("keydown", (ev) => { if (!["ArrowLeft", "ArrowRight"].includes(ev.key)) return; const t = ev.target.closest('[role="tab"]'); const l = t?.closest('[role="tablist"]'); if (!l) return;
  const all = [...l.querySelectorAll('[role="tab"]')]; const n = all[(all.indexOf(t) + (ev.key === "ArrowRight" ? 1 : all.length - 1)) % all.length]; ev.preventDefault(); n.focus(); n.click(); });
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-idp-pg]"); if (!t) return; ev.stopImmediatePropagation(); S.idF.page = (S.idF.page || 1) + Number(t.dataset.idpPg); render(); }, true);
// The dashboard greets the signed-in person by first name.
setTimeout(async function who(n = 0) { if (!S.userCap?.profiles || !S.myId) { if (n < 20) setTimeout(() => who(n + 1), 1000); return; }
  try { const ps = await S.userCap.profiles([S.myId]); const nm = String(ps?.[S.myId]?.name || "").trim(); if (nm) { S.myName = nm; S.myFirst = nm.split(/\s+/)[0]; claimInvite().catch(() => {}); if (S.view?.name === "dash") render(); } } catch {} }, 1500);

/* Users & permissions: a table of the people who use the app, with their position, email, ID number and last sign-in. */
S.puEdit = null; S.puAcc = null; S.puDraft = null;
// Keep typed edits while the form redraws (e.g. after opening the tick boxes).
document.addEventListener("input", (ev) => { const f = ev.target.closest?.("#pu-form"); if (!f) return; S.puDraft = { id: f.dataset.id, name: $("#pu-name")?.value, role: $("#pu-role")?.value, emp: $("#pu-emp")?.value, email: $("#pu-email")?.value }; }, true);
document.addEventListener("change", (ev) => { const f = ev.target.closest?.("#pu-form"); if (!f) return; S.puDraft = { id: f.dataset.id, name: $("#pu-name")?.value, role: $("#pu-role")?.value, emp: $("#pu-emp")?.value, email: $("#pu-email")?.value }; }, true);
// The modules and sub-modules a user can open, as tick boxes (same boxes as the Access table; a change saves at once and makes the role Custom).
function puState(id, owner) { const a = S.access || {}; const u = a.users?.[id] || {}; const key = owner ? "admin" : u.role || a.defaultRole || "admin";
  return { key, views: owner || key === "admin" || key === "owner" ? null : viewsOf(u, key), edit: owner ? true : key === "custom" ? u.edit !== false : !!ROLES[key]?.edit }; }
function puMods(id, owner) { const st = puState(id, owner); if (!st.views) return '<span class="chip c-ok">All modules</span>'; const m = menuModsOf(st.views);
  return m.length ? `<span class="chips">${m.map((g) => `<span class="chip c-blue">${esc(GL(g))}</span>`).join("")}</span>${st.edit ? "" : '<div class="t-muted" style="font-size:12px">View only</div>'}` : '<span class="t-muted" style="font-size:13px">Dashboard only</span>'; }
function puAccess(id, owner) {
  const st = puState(id, owner); const keys = navKeys(); const groups = [...new Set(keys.map((k) => k.g))]; const has = (v) => !st.views || st.views.has(v);
  const box = (attr, val, on, label, dis, extra = "") => `<label class="pu-tick"><input type="checkbox" data-${attr}="${esc(id)}|${esc(val)}" ${on ? "checked" : ""} ${dis ? "disabled" : ""} ${extra}> <span>${label}</span></label>`;
  return `<div class="pu-acc"><div class="pu-acc-head"><b>Access</b><span class="t-muted" style="font-size:13px">${owner ? "The owner always has full access." : "Tick the modules, sub-modules and sub-sub-modules this person can open. Changes save right away and make the role Custom."}</span>
      <label class="pu-tick"><input type="checkbox" data-pe="${esc(id)}" ${st.edit ? "checked" : ""} ${owner ? "disabled" : ""}> <span><b>Can change records</b></span></label></div>
    <div class="pu-grid">${groups.map((g) => { const ks = keys.filter((k) => k.g === g); const free = ks.filter((k) => !ALWAYS.has(k.v)); const n = free.filter((k) => has(k.v)).length;
      return `<fieldset class="pu-g"><legend>${box("pg", g, free.length && n === free.length, `<b>${esc(GL(g))}</b>`, owner || !free.length, n && n < free.length ? 'data-mixed="1"' : "")}</legend>
        ${ks.map((k) => `<div class="pu-d${k.d ?? (k.parent ? 1 : 0)}">${box("pv", k.v, has(k.v), esc(k.l) + (ALWAYS.has(k.v) ? ' <span class="t-muted">(everyone)</span>' : ""), owner || ALWAYS.has(k.v))}</div>`).join("")}</fieldset>`; }).join("")}</div></div>`;
}
{ const st = document.createElement("style"); st.textContent = `.pu-acc{margin-top:16px;border-top:1px solid var(--line,#E5E7EB);padding-top:12px}
.pu-acc-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px}
.pu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.pu-g{border:1px solid var(--line,#E5E7EB);border-radius:10px;padding:8px 12px;margin:0;min-width:0}
.pu-g legend{padding:0 4px}.pu-tick{display:inline-flex;gap:8px;align-items:center;font-size:14px;padding:3px 0;cursor:pointer}
.pu-l2,.pu-d1{padding-left:22px}.pu-d2{padding-left:44px;font-size:13.5px}.pu-tick input{width:18px;height:18px}`; document.head.appendChild(st); }
{ const prev = after.perms; after.perms = () => { prev?.(); document.querySelectorAll(".pu-acc [data-mixed]").forEach((x) => (x.indeterminate = true)); }; }
function usersTable() {
  const a = S.access || {}; const users = a.users || {}; const P = S.profiles || {};
  const ids = [...new Set([...Object.keys(users), ...Object.keys(a.seen || {})])];
  const nm = (id) => users[id]?.name || P[id]?.name || (id === S.myId ? "You" : "Someone");
  ids.sort((x, y) => nm(x).localeCompare(nm(y)));
  const fmtSeen = (id) => { const t = a.seenAt?.[id]; if (t) return `${fmtDate(manilaDay(t))} ${new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(t))}`; return a.seen?.[id] ? fmtDate(a.seen[id]) : "Not yet"; };
  const empOpts = (cur) => `<option value="">Not linked</option>${active().sort((x, y) => fullName(x).localeCompare(fullName(y))).map((e) => `<option value="${e.id}" ${e.id === cur ? "selected" : ""}>${esc(fullName(e))} · ${esc(e.no || "")}</option>`).join("")}`;
  const row = (id) => { const u = users[id] || {}; const e = S.emps.get(u.empId); const me = id === S.myId; const owner = me && S.isOwner;
    if (S.puEdit === id) { const dr = S.puDraft?.id === id ? S.puDraft : null; const rk = dr ? dr.role : u.role; return `<tr><td colspan="8"><form id="pu-form" data-id="${esc(id)}" class="form-grid" style="align-items:end" data-keep>
      <div class="field"><label for="pu-name">Name</label><input class="input" id="pu-name" value="${esc(dr ? dr.name : users[id]?.name || P[id]?.name || "")}" placeholder="Full name" autocomplete="off"></div>
      <div class="field"><label for="pu-role">Role</label>${owner ? '<input class="input" value="Owner (always full access)" disabled>' : `<select class="input" id="pu-role">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === rk ? "selected" : ""}>${esc(r.name)}</option>`).join("")}${u.role ? "" : `<option value="" ${rk ? "" : "selected"}>Default (${esc(ROLES[a.defaultRole || "admin"].name)})</option>`}</select>`}</div>
      <div class="field"><label for="pu-emp">Employee record (gives position and ID number)</label><select class="input" id="pu-emp">${empOpts(dr ? dr.emp : u.empId)}</select></div>
      <div class="field"><label for="pu-email">Email address</label><input class="input" id="pu-email" type="email" value="${esc(dr ? dr.email : u.email || P[id]?.email || e?.email || "")}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm">Save</button><button type="button" class="btn btn-ghost btn-sm" data-pu-cancel>Cancel</button><button type="button" class="btn btn-ghost btn-sm" data-pu-acc="${esc(id)}">${owner ? "See access" : "Change access (tick boxes)"}</button></div></form></td></tr>${S.puAcc === id ? `<tr><td colspan="8">${puAccess(id, owner)}</td></tr>` : ""}`; }
    return `<tr><td style="min-width:180px"><b>${esc(nm(id))}</b>${me ? " (you)" : ""}<div><button class="link pu-edit-l" style="font-size:13px;white-space:nowrap" data-pu-edit="${esc(id)}">Edit name, role, email</button></div></td><td>${owner ? "<b>Owner</b>" : `<select class="input" data-perm-role="${esc(id)}" aria-label="Role for ${esc(nm(id))}" style="min-width:150px">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === u.role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}${u.role ? "" : `<option value="" selected>Default (${esc(ROLES[a.defaultRole || "admin"].name)})</option>`}</select>`}</td>
      <td style="min-width:170px">${puMods(id, owner)}<div><button class="link" style="font-size:13px" data-pu-acc="${esc(id)}" aria-expanded="${S.puAcc === id}">${S.puAcc === id ? "Hide tick boxes" : owner ? "See access" : "Change access"}</button></div></td><td>${esc(e ? pos(e.posId)?.title || "" : "") || '<span class="t-muted">—</span>'}</td><td>${esc(u.email || P[id]?.email || e?.email || "") || '<span class="t-muted">—</span>'}</td>
      <td>${esc(e?.no || "") || '<span class="t-muted">—</span>'}</td><td style="white-space:nowrap">${esc(fmtSeen(id))}</td>
      <td class="num" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-pu-edit="${esc(id)}">Edit</button> ${owner ? "" : `<button class="btn btn-ghost btn-sm" style="color:#a4262c" data-pu-del="${esc(id)}">Delete</button>`}</td></tr>${S.puAcc === id ? `<tr class="pu-accrow"><td colspan="8">${puAccess(id, owner)}</td></tr>` : ""}`; };
  const inv = Object.entries(a.invites || {}).sort((x, y) => String(x[1].name).localeCompare(String(y[1].name)));
  const invRow = ([k, v]) => { const e = S.emps.get(v.empId);
    return `<tr><td><b>${esc(v.name)}</b><div><span class="chip c-warn">Invited</span></div></td><td>${esc(ROLES[v.role]?.name || "")}</td><td><span class="t-muted" style="font-size:13px">${v.role === "custom" ? "Custom pages, set in Users &amp; Roles" : "Their pages can be ticked in Users &amp; Roles"}. They get them when they first sign in.</span></td>
      <td>${esc(e ? pos(e.posId)?.title || "" : "") || '<span class="t-muted">—</span>'}</td><td>${esc(v.email || e?.email || "") || '<span class="t-muted">—</span>'}</td><td>${esc(e?.no || "") || '<span class="t-muted">—</span>'}</td>
      <td class="t-muted">Not signed in yet</td><td class="num" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-inv-edit="${esc(k)}">Edit</button> <button class="btn btn-ghost btn-sm" style="color:#a4262c" data-inv-del="${esc(k)}">Delete</button></td></tr>`; };
  const iv = S.puAdd && S.puAdd !== true ? a.invites?.[S.puAdd] || {} : {};
  const addForm = S.puAdd ? `<form id="pu-add" data-id="${S.puAdd === true ? "" : esc(S.puAdd)}" class="card" style="margin:0 0 12px;background:var(--panel,#FAF7F0)" data-keep><h3 style="margin:0 0 10px;font-size:16px">${S.puAdd === true ? "Add a user" : "Edit invited user"}</h3><div class="form-grid" style="align-items:end">
      <div class="field"><label for="pa-emp">Employee record</label><select class="input" id="pa-emp">${empOpts(iv.empId)}</select></div>
      <div class="field"><label for="pa-name">Full name <span class="req">*</span></label><input class="input" id="pa-name" required value="${esc(iv.name || "")}" placeholder="As shown on their claude.ai account"></div>
      <div class="field"><label for="pa-email">Email address</label><input class="input" id="pa-email" type="email" value="${esc(iv.email || "")}"></div>
      <div class="field"><label for="pa-role">Role</label><select class="input" id="pa-role">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === (iv.role || "viewer") ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
      <div style="display:flex;gap:8px"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-ghost" data-pu-addx>Cancel</button></div></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Next, share the app with them as <b>Can edit</b> from the Share menu. The first time they open it, they get this role. The name must match their claude.ai account name.</p></form>` : "";
  return `${addForm}<div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Position</th><th>Email address</th><th>ID #</th><th>Last signed in</th><th></th></tr></thead><tbody>
    ${ids.map(row).join("")}${inv.map(invRow).join("")}${ids.length || inv.length ? "" : '<tr><td colspan="8" class="empty">No one yet. Add a user, or people appear here after they open the app.</td></tr>'}</tbody></table></div>
    <p class="t-muted" style="font-size:13px;margin:10px 0 0">Delete removes the person's role and takes them off this list. To stop them opening the app at all, also remove them from the page's Share settings on claude.ai.</p>`;
}
document.addEventListener("click", async (ev) => { const t = ev.target.closest("[data-pu-edit],[data-pu-del],[data-pu-cancel],[data-pu-acc]"); if (!t || !isPermAdmin()) return; ev.stopImmediatePropagation();
  if (t.dataset.puEdit) { S.puEdit = t.dataset.puEdit; S.puDraft = null; render(); return; }
  if (t.dataset.puAcc) { S.puAcc = S.puAcc === t.dataset.puAcc ? null : t.dataset.puAcc; render(); return; }
  if (t.hasAttribute("data-pu-cancel")) { S.puEdit = null; S.puDraft = null; render(); return; }
  const id = t.dataset.puDel; const name = S.profiles?.[id]?.name || "this person";
  if (!await askConfirm(`Delete ${name} from the users list? Their role is removed.`, "Delete", true)) return;
  const a = S.access || {}; const users = { ...(a.users || {}) }; const seen = { ...(a.seen || {}) }; const seenAt = { ...(a.seenAt || {}) }; delete users[id]; delete seen[id]; delete seenAt[id];
  try { await saveAccess({ users, seen, seenAt }, `Deleted ${name} from the users list`); } catch { toast("Couldn't save. Try again."); } }, true);
document.addEventListener("submit", async (ev) => { const f = ev.target; if (f.id !== "pu-form" || !isPermAdmin()) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const id = f.dataset.id; const a = S.access || {}; const users = { ...(a.users || {}) }; const u = { ...(users[id] || {}) };
  const email = $("#pu-email").value.trim(); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Check the email address."); return; }
  u.empId = $("#pu-emp").value || null; u.email = email || null; { const n = String($("#pu-name")?.value || "").trim().replace(/\s+/g, " ").slice(0, 80); u.name = n && n !== (S.profiles?.[id]?.name || "") ? n : u.name && n ? n : null; }
  const rs = $("#pu-role"); if (rs && !(id === S.myId && S.isOwner)) { const k0 = u.role || a.defaultRole || "admin"; if (!rs.value) { delete u.role; delete u.views; delete u.mods; delete u.edit; } else if (rs.value !== u.role) { if (rs.value === "custom" && !Array.isArray(u.views)) { const vs = viewsOf(u, k0); u.views = [...vs].filter((v) => !ALWAYS.has(v)); u.mods = modsOf(vs); u.edit = k0 === "custom" ? u.edit !== false : !!ROLES[k0]?.edit; } u.role = rs.value; } }
  users[id] = u; S.puEdit = null; S.puDraft = null; try { await saveAccess({ users }, `Updated the user details of ${u.name || S.profiles?.[id]?.name || "someone"}`); } catch { toast("Couldn't save. Try again."); } }, true);

// Add user: an invitation by name; the person gets the role the first time they open the app.
S.puAdd = null;
const normName = (x) => String(x || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
async function claimInvite() {
  const a = S.access; if (!a || !S.myId || !S.myName || S.isOwner || !S.realEdit || a.users?.[S.myId]?.role) return;
  const hit = Object.entries(a.invites || {}).find(([, v]) => normName(v.name) === normName(S.myName)); if (!hit) return;
  const [k, v] = hit; const users = { ...(a.users || {}), [S.myId]: { ...(a.users?.[S.myId] || {}), role: v.role, empId: v.empId || null, email: v.email || null, ...(v.role === "custom" ? { views: Array.isArray(v.views) ? v.views : [], mods: Array.isArray(v.mods) ? v.mods : [], edit: v.edit !== false } : {}) } };
  const invites = { ...a.invites }; delete invites[k]; const next = { ...a, users, invites };
  await S.db.doc("org/access").set(JSON.parse(JSON.stringify(next))); S.access = next; applyPerm(); logActivity(`${v.name} opened the app and got the ${ROLES[v.role]?.name || ""} role`); render();
}
setInterval(() => claimInvite().catch(() => {}), 30000);
document.addEventListener("click", async (ev) => { const t = ev.target.closest("[data-pu-add],[data-pu-addx],[data-inv-edit],[data-inv-del]"); if (!t || !isPermAdmin()) return; ev.stopImmediatePropagation();
  if (t.hasAttribute("data-pu-add")) { S.puAdd = true; render(); $("#pa-emp")?.focus(); return; }
  if (t.hasAttribute("data-pu-addx")) { S.puAdd = null; render(); return; }
  if (t.dataset.invEdit) { S.puAdd = t.dataset.invEdit; render(); return; }
  const k = t.dataset.invDel; const v = S.access?.invites?.[k]; if (!v || !await askConfirm(`Delete the invitation for ${v.name}?`, "Delete", true)) return;
  const invites = { ...(S.access.invites || {}) }; delete invites[k]; try { await saveAccess({ invites }, `Deleted the invitation for ${v.name}`); } catch { toast("Couldn't save. Try again."); } }, true);
document.addEventListener("change", (ev) => { if (ev.target.id !== "pa-emp") return; const e = S.emps.get(ev.target.value); if (!e) return; const n = $("#pa-name"), m = $("#pa-email"); if (n && !n.value) n.value = fullName(e); if (m && !m.value && e.email) m.value = e.email; });
document.addEventListener("submit", async (ev) => { const f = ev.target; if (f.id !== "pu-add" || !isPermAdmin()) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const name = $("#pa-name").value.trim(); const email = $("#pa-email").value.trim(); if (!name) { toast("Enter the person's full name."); return; }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Check the email address."); return; }
  const P = S.profiles || {}; const same = Object.keys({ ...(S.access?.users || {}), ...(S.access?.seen || {}) }).find((id) => normName(P[id]?.name) === normName(name));
  if (same) { toast(`${name} already uses the app. Change their role in the table instead.`); return; }
  const k = f.dataset.id || uid(); const invites = { ...(S.access?.invites || {}), [k]: { name, email: email || null, empId: $("#pa-emp").value || null, role: $("#pa-role").value, at: todayISO() } };
  S.puAdd = null; try { await saveAccess({ invites }, `${f.dataset.id ? "Updated the invitation for" : "Added"} ${name} as ${ROLES[$("#pa-role")?.value]?.name || "a user"}`); } catch { toast("Couldn't save. Try again."); } }, true);
function greetWord() { const h = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date())); return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening"; }
