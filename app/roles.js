
/* ---------- Users & Roles grid (Glenn 2026-10-12): roles and users side by side, a tick box for every module and sub-module. ---------- */
// Role templates live in org/access.roles = { key: { name, views: [navKeys], edit } }: built-in roles can be re-ticked, new roles added.
// A user on a role follows that role's ticks; ticking a user's own box makes that user Custom (as before).
// Owner and Executive (Glenn 2026-10-12). Owners manage everyone's roles and access, HR Admins included; HR Admins manage everyone else.
{ const old = { ...ROLES }; for (const k of Object.keys(ROLES)) delete ROLES[k];
  Object.assign(ROLES, { owner: { name: "Owner", mods: PERM_MODS, edit: true, note: "Everything. Only Owners can change HR Admins and Owners" }, exec: { name: "Executive", mods: PERM_MODS, edit: false, note: "Sees every module and report" } }, old); }
const ROLES_BASE = JSON.parse(JSON.stringify(ROLES));
const RL_FIXED = new Set(["owner", "custom", "none"]);
const RL_TOP = new Set(["owner", "admin"]);
const iAmOwner = () => !!S.isOwner || S.access?.users?.[S.myId]?.role === "owner";
const rlRoleOf = (id) => { const a = S.access || {}; return a.users?.[id]?.role || a.defaultRole || "admin"; };
const rlLocked = (id) => !iAmOwner() && (RL_TOP.has(rlRoleOf(id)) || id === S.myId);
// Built-in roles on the new menu (Glenn 2026-10-15): whole modules (mods) plus single sub-modules (subs, with everything under them).
// A role re-ticked in Users & Roles (org/access.roles) keeps its own ticks; Reset brings back these.
const RL_MENU = {
  payroll: { mods: ["HR Operations"], subs: ["Employee Records & 201 Files", "Employee Movement", "Separation & Offboarding"], bot: true, note: "HR Operations (timekeeping, leave, payroll, compensation, benefits), plus 201 files, employee movement and separation" },
  timekeeper: { mods: [], subs: ["Timekeeping & Attendance", "Leave Administration"], bot: false, note: "Timekeeping & attendance and leave, in HR Operations" },
  talent: { mods: ["Talent Management", "Employee Development"], subs: ["Manpower Planning", "Employee Records & 201 Files"], bot: true, note: "Talent Management and Employee Development, plus manpower planning and 201 files" },
};
function rlMenuViews(spec) {
  const keys = navKeys(); const out = new Set(keys.filter((k) => (k.g === "Overview" && (spec.bot || k.v !== "hrbot")) || spec.mods.includes(k.g)).map((k) => k.v));
  for (const l of spec.subs) for (const k of keys.filter((x) => x.d === 0 && x.l === l)) { out.add(k.v); for (const v of descOf(keys, k.v)) out.add(v); }
  return out;
}
function rlSync() {
  const R = S.access?.roles || {};
  for (const k of Object.keys(ROLES)) if (!ROLES_BASE[k]) delete ROLES[k];
  for (const [k, b] of Object.entries(ROLES_BASE)) ROLES[k] = { ...b, mods: [...b.mods] };
  for (const [k, spec] of Object.entries(RL_MENU)) if (ROLES[k]) { const v = rlMenuViews(spec); ROLES[k] = { ...ROLES[k], views: [...v], mods: modsOf(v), note: spec.note }; }
  for (const [k, r] of Object.entries(R)) { if (RL_FIXED.has(k) || !r) continue; const views = Array.isArray(r.views) ? r.views : null; const base = ROLES_BASE[k];
    ROLES[k] = { name: r.name || base?.name || "Role", edit: r.edit ?? base?.edit ?? false, note: r.note || (views ? "" : ROLES[k]?.note) || base?.note || "Made in Users & Roles", views: views || ROLES[k]?.views || null, mods: views ? modsOf(new Set(views)) : ROLES[k]?.mods || base?.mods || [], made: !base }; if (!ROLES[k].views) delete ROLES[k].views; }
}
{ const b = myRole; myRole = (...x) => { const r = b(...x); const a = S.access || {}; const u = S.myId ? a.users?.[S.myId] : null; const key = S.isOwner ? "owner" : u?.role || a.defaultRole || "admin";
    if (key === "owner") return { ...ROLES.admin, ...r, key: "admin", ownerRole: true, name: "Owner", views: null, mods: PERM_MODS, edit: true };
    if (r.key === "admin" && Array.isArray(ROLES.admin?.views)) { const v = viewsOf({}, "admin"); return { ...r, views: v, mods: modsOf(v), edit: !!ROLES.admin.edit }; }
    return r; }; }
{ const b = applyPerm; applyPerm = (...x) => { rlSync(); return b(...x); }; }
{ const b = viewsOf; viewsOf = (u, key) => { const r = ROLES[key]; if (key !== "custom" && Array.isArray(r?.views)) return new Set([...r.views, ...ALWAYS]); return b(u, key); }; }
S.permTab = "list"; S.rlNew = false;

function rlGrid() {
  const a = S.access || {}; const users = a.users || {}; const P = S.profiles || {};
  const ids = [...new Set([...(S.myId ? [S.myId] : []), ...Object.keys(users), ...Object.keys(a.seen || {})])];
  const nm = (id) => users[id]?.name || P[id]?.name || (id === S.myId ? "You" : "Someone");
  const keys = navKeys(); const groups = [...new Set(keys.map((k) => k.g))];
  const roleCols = Object.entries(ROLES).filter(([k]) => !RL_FIXED.has(k) && (k !== "admin" || iAmOwner())).map(([k, r]) => ({ k, r, views: viewsOf({}, k), edit: !!r.edit }));
  const userCols = ids.map((id) => { const u = users[id] || {}; const owner = id === S.myId && S.isOwner; const key = owner ? "admin" : u.role || a.defaultRole || "admin";
    return { id, owner, key, listed: !!users[id], views: owner || key === "admin" ? null : viewsOf(u, key), edit: owner ? true : key === "custom" ? u.edit !== false : !!ROLES[key]?.edit }; });
  const has = (vs, v) => !vs || vs.has(v);
  const gState = (vs, g) => { const ks = keys.filter((k) => k.g === g && !ALWAYS.has(k.v)); const n = ks.filter((k) => has(vs, k.v)).length; return { all: ks.length && n === ks.length, mixed: n && n < ks.length, none: !ks.length }; };
  const roleOpts = (cur, listed) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(r.name)}</option>`).join("") + (listed ? "" : `<option value="" selected>Default (${esc(ROLES[a.defaultRole || "admin"]?.name || "HR Admin")})</option>`);
  const rCell = (c, v, l) => `<td class="pm-c pm-rc"><input type="checkbox" data-rv="${esc(c.k)}|${esc(v)}" ${has(c.views, v) ? "checked" : ""} ${ALWAYS.has(v) ? "disabled" : ""} aria-label="${esc(l)} for the ${esc(c.r.name)} role"></td>`;
  const uCell = (c, v, l) => `<td class="pm-c"><input type="checkbox" data-pv="${esc(c.id)}|${esc(v)}" ${has(c.views, v) ? "checked" : ""} ${c.owner || ALWAYS.has(v) ? "disabled" : ""} aria-label="${esc(l)} for ${esc(nm(c.id))}"></td>`;
  const rG = (c, g) => { const s = gState(c.views, g); return `<td class="pm-c pm-rc"><input type="checkbox" data-rg="${esc(c.k)}|${esc(g)}" ${s.all ? "checked" : ""} ${s.mixed ? 'data-mixed="1"' : ""} ${s.none ? "disabled" : ""} aria-label="All of ${esc(GL(g))} for the ${esc(c.r.name)} role"></td>`; };
  const uG = (c, g) => { const s = gState(c.views, g); return `<td class="pm-c"><input type="checkbox" data-pg="${esc(c.id)}|${esc(g)}" ${s.all ? "checked" : ""} ${s.mixed ? 'data-mixed="1"' : ""} ${c.owner || s.none ? "disabled" : ""} aria-label="All of ${esc(GL(g))} for ${esc(nm(c.id))}"></td>`; };
  const count = (k) => userCols.filter((c) => c.key === k).length;
  return `<section class="card rl-card"><div class="card-head"><h2>Users &amp; Roles</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${S.rlNew ? `<form id="rl-new" style="display:flex;gap:6px" data-keep><input class="input" id="rl-name" placeholder="New role name, e.g. Site HR Officer" maxlength="40" style="min-width:240px" required><button class="btn btn-primary btn-sm">Add role</button><button type="button" class="btn btn-ghost btn-sm" data-rl-new>Cancel</button></form>` : `<button class="btn btn-gold btn-sm" data-rl-new>${icon("plus")}New role</button>`}</div></div>
    <p class="t-muted" style="margin:0 0 12px;font-size:13.5px;max-width:110ch"><b>Roles</b> (gold columns) are templates: tick what each role can open, and everyone on that role follows it. <b>People</b> (white columns): pick a role, or tick boxes for that person only, which makes them <b>Custom</b>. The list follows the menu: each module, its sub-modules, and their sub-sub-modules (indented). A module's row ticks or clears everything under it, and a page's tick includes the pages under it. Every change saves right away.</p>
    <div class="table-wrap pm-wrap rl-wrap"><table class="pm rl"><thead>
      <tr class="rl-kind"><th class="pm-k"></th>${roleCols.length ? `<th class="rl-kh rl-kr" colspan="${roleCols.length}">Roles</th>` : ""}<th class="rl-kh" colspan="${userCols.length}">People</th></tr>
      <tr><th class="pm-k">Name</th>${roleCols.map((c) => `<th class="pm-p pm-rc"><span class="rl-rn">${esc(c.r.name)}</span><small class="t-muted">${count(c.k)} ${count(c.k) === 1 ? "person" : "people"}</small>${c.r.made ? `<button class="link danger rl-x" data-rl-del="${esc(c.k)}" aria-label="Delete the ${esc(c.r.name)} role">Delete</button>` : S.access?.roles?.[c.k] ? `<button class="link rl-x" data-rl-reset="${esc(c.k)}">Reset</button>` : ""}</th>`).join("")}${userCols.map((c) => `<th class="pm-p">${esc(nm(c.id))}${c.id === S.myId ? " (you)" : ""}</th>`).join("")}</tr>
      <tr><th class="pm-k">Role</th>${roleCols.map(() => '<td class="pm-c pm-rc"><span class="t-muted" style="font-size:12px">template</span></td>').join("")}${userCols.map((c) => `<td class="pm-c">${c.owner ? "<b>Owner</b>" : `<select class="input pm-role" data-perm-role="${esc(c.id)}" aria-label="Role for ${esc(nm(c.id))}">${roleOpts(c.listed ? c.key : "", c.listed)}</select>`}</td>`).join("")}</tr>
      <tr><th class="pm-k">Can change records</th>${roleCols.map((c) => `<td class="pm-c pm-rc"><input type="checkbox" data-re="${esc(c.k)}" ${c.edit ? "checked" : ""} aria-label="The ${esc(c.r.name)} role can change records"></td>`).join("")}${userCols.map((c) => `<td class="pm-c"><input type="checkbox" data-pe="${esc(c.id)}" ${c.edit ? "checked" : ""} ${c.owner ? "disabled" : ""} aria-label="Can change records for ${esc(nm(c.id))}"></td>`).join("")}</tr>
    </thead><tbody>
      ${groups.map((g) => `<tr class="pm-g"><th class="pm-k"><span class="pm-gl">${icon(MOD_ICON[g] || "dash", 16)}${esc(GL(g))}</span></th>${roleCols.map((c) => rG(c, g)).join("")}${userCols.map((c) => uG(c, g)).join("")}</tr>
        ${keys.filter((k) => k.g === g).map((k) => `<tr><th class="pm-k ${pmLvl(k)}">${icon(k.ic || "file", 15)}${esc(k.l)}${ALWAYS.has(k.v) ? ' <span class="t-muted" style="font-weight:400">(everyone)</span>' : ""}</th>${roleCols.map((c) => rCell(c, k.v, k.l)).join("")}${userCols.map((c) => uCell(c, k.v, k.l)).join("")}</tr>`).join("")}`).join("")}
      <tr><th class="pm-k pm-l1">${icon("shield", 15)}Users &amp; permissions</th>${roleCols.map(() => '<td class="pm-c pm-rc"><input type="checkbox" disabled aria-label="Users and permissions"></td>').join("")}${userCols.map((c) => `<td class="pm-c"><input type="checkbox" disabled ${c.owner || c.key === "admin" ? "checked" : ""} aria-label="Users and permissions"></td>`).join("")}</tr>
    </tbody></table></div>
    <p class="t-muted" style="margin:10px 0 0;font-size:13px">${iAmOwner() ? "Owners always see everything. You can narrow the HR Admin role here; HR Admins keep this page." : "Owners and HR Admins manage this page. Only an Owner can change HR Admins and Owners, so their columns are locked for you."} The dashboard is open to everyone and shows only the parts of the modules a person has. To add someone, use Add user on the Users list tab.</p></section>`;
}
{ const b = VIEWS.perms; VIEWS.perms = (...x) => { const h = b(...x); if (!isPermAdmin()) return h;
  const tabs = `<div class="tabs rl-tabs" role="tablist"><button class="tab" role="tab" aria-selected="${S.permTab !== "grid"}" data-perm-tab="list">Users list</button><button class="tab" role="tab" aria-selected="${S.permTab === "grid"}" data-perm-tab="grid">Users &amp; Roles (tick boxes)</button></div>`;
  const i = h.indexOf("</header>"); if (i < 0) return h; const top = h.slice(0, i + 9);
  return S.permTab === "grid" ? top + tabs + rlGrid() : top + tabs + h.slice(i + 9); }; }
{ const prev = after.perms; after.perms = () => { prev?.(); document.querySelectorAll(".pm [data-mixed]").forEach((x) => (x.indeterminate = true)); }; }

async function rlSave(roles, msg) { await saveAccess({ roles: JSON.parse(JSON.stringify(roles)) }, msg); }
document.addEventListener("change", async (ev) => {
  const t = ev.target; if (!(t.dataset.rv || t.dataset.rg || t.dataset.re) || !isPermAdmin()) return; ev.stopImmediatePropagation();
  const k = (t.dataset.rv || t.dataset.rg || t.dataset.re).split("|")[0]; const roles = { ...(S.access?.roles || {}) }; const r = ROLES[k]; if (!r) return;
  const views = viewsOf({}, k); const keys = navKeys(); let what;
  if (t.dataset.rv) { const v = t.dataset.rv.slice(k.length + 1);
    for (const x of [v, ...descOf(keys, v)]) t.checked ? views.add(x) : views.delete(x); if (t.checked) for (const p of ancOf(keys, v)) views.add(p); what = `${t.checked ? "Gave" : "Removed"} ${keys.find((x) => x.v === v)?.l || v} ${t.checked ? "to" : "from"} the ${r.name} role`; }
  else if (t.dataset.rg) { const g = t.dataset.rg.slice(k.length + 1); for (const x of keys) if (x.g === g && !ALWAYS.has(x.v)) t.checked ? views.add(x.v) : views.delete(x.v); what = `${t.checked ? "Gave" : "Removed"} all of ${GL(g)} ${t.checked ? "to" : "from"} the ${r.name} role`; }
  else what = `The ${r.name} role ${t.checked ? "can change records" : "is view only"}`;
  roles[k] = { ...(roles[k] || {}), name: r.name, views: [...views].filter((v) => !ALWAYS.has(v)), edit: t.dataset.re ? t.checked : !!r.edit };
  try { await rlSave(roles, what); } catch { toast("Couldn't save. Check your connection and try again."); }
}, true);
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-perm-tab],[data-rl-new],[data-rl-del],[data-rl-reset]"); if (!t || !isPermAdmin()) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.permTab) { S.permTab = d.permTab; render(); return; }
  if (d.rlNew !== undefined) { S.rlNew = !S.rlNew; render(); if (S.rlNew) $("#rl-name")?.focus(); return; }
  const roles = { ...(S.access?.roles || {}) };
  if (d.rlReset) { if (!await askConfirm(`Put the ${ROLES[d.rlReset]?.name} role back to its standard modules?`, "Reset")) return; delete roles[d.rlReset]; try { await rlSave(roles, `Reset the ${ROLES_BASE[d.rlReset]?.name} role`); } catch { toast("Couldn't save. Try again."); } return; }
  if (d.rlDel) { const k = d.rlDel; const n = Object.values(S.access?.users || {}).filter((u) => u.role === k).length;
    if (!await askConfirm(`Delete the ${ROLES[k]?.name} role?${n ? ` ${n} ${n === 1 ? "person is" : "people are"} on it and will become View only.` : ""}`, "Delete role")) return;
    delete roles[k]; const users = Object.fromEntries(Object.entries(S.access?.users || {}).map(([id, u]) => [id, u.role === k ? { ...u, role: "viewer" } : u]));
    const invites = Object.fromEntries(Object.entries(S.access?.invites || {}).map(([id, v]) => [id, v.role === k ? { ...v, role: "viewer" } : v]));
    try { await saveAccess({ roles: JSON.parse(JSON.stringify(roles)), users, invites }, `Deleted the ${ROLES[k]?.name} role`); } catch { toast("Couldn't save. Try again."); } }
}, true);
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "rl-new") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!isPermAdmin()) return;
  const name = $("#rl-name").value.trim().replace(/\s+/g, " ").slice(0, 40); if (!name) return;
  if (Object.values(ROLES).some((r) => normName(r.name) === normName(name))) { toast("There is already a role with that name."); return; }
  const k = `r_${slug(name).replace(/-/g, "_").slice(0, 24)}_${uid().slice(-4)}`; const roles = { ...(S.access?.roles || {}), [k]: { name, views: [], edit: true } };
  try { S.rlNew = false; await rlSave(roles, `Made the ${name} role`); toast(`Role added. Tick what ${name} can open.`); } catch { toast("Couldn't save. Try again."); }
}, true);
{ const st = document.createElement("style"); st.textContent = `.pm .pm-l3{padding-left:70px;font-size:13.5px;font-weight:400}.pm .pm-l3 svg{vertical-align:-3px;margin-right:8px;color:var(--blue)}.rl-tabs{margin:0 0 14px}.rl-wrap{max-height:76vh;overflow:auto}
.rl thead th,.rl thead td{position:sticky;z-index:2;background:var(--card,#fff)}.rl thead tr:nth-child(1)>*{top:0}.rl thead tr:nth-child(2)>*{top:30px}.rl thead tr:nth-child(3)>*{top:96px}.rl thead tr:nth-child(4)>*{top:148px}
.rl .pm-k{position:sticky;left:0;z-index:1;background:var(--card,#fff);min-width:230px}.rl thead .pm-k{z-index:3}
.rl .pm-rc{background:rgba(201,164,92,.10) !important}.rl thead .pm-rc{background:#F6EEDC !important}.rl-kh{text-align:center;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#6A7080)}.rl-kr{background:#F6EEDC !important;color:#7a5a1c}
.rl .pm-p{min-width:120px;vertical-align:bottom}.rl .pm-p small{display:block;font-weight:400}.rl-rn{display:block;color:#7a5a1c}.rl-x{font-size:12px;margin-top:2px}
.rl input[type=checkbox]{width:18px;height:18px;accent-color:#C9A45C;cursor:pointer}.rl input[type=checkbox]:disabled{cursor:not-allowed}
[data-theme=dark] .rl thead th,[data-theme=dark] .rl thead td,[data-theme=dark] .rl .pm-k{background:#13203A}[data-theme=dark] .rl thead .pm-rc,[data-theme=dark] .rl-kr{background:#2A2A22 !important;color:#E4C98E}[data-theme=dark] .rl-rn{color:#E4C98E}`; document.head.appendChild(st); }

/* ---------- only Owners change HR Admins and Owners ---------- */
const RL_MSG = "Only an Owner can change HR Admins and Owners.";
function rlLockUi() {
  if (iAmOwner()) return;
  const idOf = (el) => (el.dataset.permRole || el.dataset.pv || el.dataset.pg || el.dataset.pe || el.dataset.permDel || el.dataset.puDel || el.closest("#pu-form")?.dataset.id || "").split("|")[0];
  for (const el of document.querySelectorAll("#main [data-perm-role], #main [data-pv], #main [data-pg], #main [data-pe], #main [data-perm-del], #main [data-pu-del], #pu-form #pu-role")) { const id = idOf(el); if (id && rlLocked(id)) { el.disabled = true; el.title = RL_MSG; } }
  for (const sel of document.querySelectorAll("#main [data-perm-role], #pu-role, #pa-role, #perm-new-role, [data-perm-default]")) for (const o of [...sel.options]) if (RL_TOP.has(o.value) && !o.selected) o.remove();
  for (const el of document.querySelectorAll("[data-perm-default]")) { el.disabled = true; el.title = "Only an Owner can change this."; }
}
new MutationObserver(() => { if (S.view.name === "perms") rlLockUi(); }).observe(document.body, { childList: true, subtree: true });
const rlBlock = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); toast(RL_MSG); setTimeout(render, 0); };
window.addEventListener("change", (ev) => { const t = ev.target; if (iAmOwner() || S.view.name !== "perms") return;
  const id = (t.dataset.permRole || t.dataset.pv || t.dataset.pg || t.dataset.pe || "").split("|")[0];
  if ((id && rlLocked(id)) || (t.dataset.permRole != null && RL_TOP.has(t.value)) || t.hasAttribute?.("data-perm-default") || /^(admin|owner)\|/.test(t.dataset.rv || t.dataset.rg || t.dataset.re || "")) rlBlock(ev); }, true);
window.addEventListener("click", (ev) => { if (iAmOwner()) return; const t = ev.target.closest?.("[data-perm-del],[data-pu-del],[data-perm-add]"); if (!t) return;
  const id = t.dataset.permDel || t.dataset.puDel; if ((id && rlLocked(id)) || (t.dataset.permAdd && RL_TOP.has($("#perm-new-role")?.value))) rlBlock(ev); }, true);
window.addEventListener("submit", (ev) => { if (iAmOwner()) return; const f = ev.target; const r = f.querySelector?.("#pu-role, #pa-role"); if (!r) return;
  if ((f.id === "pu-form" && rlLocked(f.dataset.id)) || (RL_TOP.has(r.value) && !(f.id === "pu-form" && rlRoleOf(f.dataset.id) === r.value))) rlBlock(ev); }, true);
// The page owner shows as Owner on everyone's screen.
let rlOwnerSet = false;
{ const b = applyPerm; applyPerm = (...x) => { const r = b(...x); const a = S.access; if (!rlOwnerSet && S.isOwner && S.myId && a && S.realEdit && S.db && a.users?.[S.myId]?.role !== "owner") { rlOwnerSet = true;
    const next = { ...a, users: { ...(a.users || {}), [S.myId]: { ...(a.users?.[S.myId] || {}), role: "owner" } } }; S.db.doc("org/access").set(JSON.parse(JSON.stringify(next))).then(() => { S.access = next; }).catch(() => {}); } return r; }; }
