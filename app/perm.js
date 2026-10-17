/* ---------- users & permissions: roles that decide which modules each editor sees and whether they can change records ---------- */
const PERM_MODS = ["People", "Talent", "Timekeeping", "Payroll", "Training", "Compliance", "Records"];
const ROLES = {
  admin: { name: "HR Admin", mods: PERM_MODS, edit: true, note: "Everything, including this page" },
  payroll: { name: "Payroll", mods: ["People", "Timekeeping", "Payroll"], edit: true, note: "Time sheets, payroll, loans, contributions, tax" },
  timekeeper: { name: "Timekeeper", mods: ["Timekeeping"], edit: true, note: "Daily time records, clock-ins, overtime, leave" },
  talent: { name: "Recruitment & Training", mods: ["People", "Talent", "Training"], edit: true, note: "Hiring, onboarding, performance, training" },
  viewer: { name: "View only", mods: PERM_MODS, edit: false, note: "Sees every module, changes nothing" },
  custom: { name: "Custom", mods: [], edit: true, note: "Pick the modules yourself" },
  none: { name: "No access", mods: [], edit: false, note: "Dashboard only" },
};
Object.assign(S, { access: null, perm: null, realEdit: false, myId: null, permQ: "", permHits: [] });
{
  const rec = NAV.find(([g]) => g === "Records"); if (rec) rec[1].push(["perms", "Users & permissions", "shield"]);
  SECTION_OF.perms = "perms";
}
/* Every menu page and sub-page, in menu order, for the access table. */
function navKeys() {
  const out = [];
  for (const [g, items] of NAV) for (const [v, l, ic, kids] of items) { if (!v || v === "perms") continue; out.push({ g, v, l, ic }); for (const [kv, kl, ki] of kids || []) out.push({ g, v: kv, l: kl, ic: ki, parent: v }); }
  return out;
}
const ALWAYS = new Set(["dash"]);
/* The pages a person may open: a ticked list for custom access, otherwise every page in the role's modules. */
function viewsOf(u, key) {
  const r = ROLES[key] || ROLES.admin;
  if (key === "custom" && Array.isArray(u?.views)) return new Set([...u.views, ...ALWAYS]);
  const mods = key === "custom" ? u?.mods || [] : r.mods;
  return new Set([...navKeys().filter((k) => ((k.og ?? k.g) === "Overview" && key !== "none" && (k.v !== "hrbot" || mods.includes("People"))) || mods.includes(k.og ?? k.g)).map((k) => k.v), ...ALWAYS]);
}
// Old access modules (saved with each user, and read by the website's database rules).
const modsOf = (views) => PERM_MODS.filter((g) => navKeys().some((k) => (k.og ?? k.g) === g && views.has(k.v)));
// Menu modules a set of pages covers, for display. Sub-pages tick with their page; a page ticks with its parents.
const menuModsOf = (views) => [...new Set(navKeys().filter((k) => k.g !== "Overview" && views.has(k.v)).map((k) => k.g))];
const descOf = (keys, v) => { const out = []; const walk = (p, n) => { if (n > 4) return; for (const k of keys) if (k.parent === p && !out.includes(k.v)) { out.push(k.v); walk(k.v, n + 1); } }; walk(v, 0); return out; };
const ancOf = (keys, v) => { const out = []; let p = keys.find((k) => k.v === v)?.parent; while (p && !out.includes(p)) { out.push(p); p = keys.find((k) => k.v === p)?.parent; } return out; };
const pmLvl = (k) => `pm-l${(k.d ?? (k.parent ? 1 : 0)) + 1}`;
/* What this viewer may do, from org/access. The owner is always HR Admin. */
function myRole() {
  if (S.isOwner) return { key: "admin", ...ROLES.admin, views: null };
  const a = S.access || {}; const u = S.myId ? a.users?.[S.myId] : null;
  const key = u?.role || a.defaultRole || "admin"; const r = ROLES[key] || ROLES.admin;
  const views = key === "admin" ? null : viewsOf(u, key);
  return { key, ...r, views, mods: views ? modsOf(views) : r.mods, edit: key === "custom" ? u?.edit !== false : r.edit };
}
const isPermAdmin = () => S.realEdit && myRole().key === "admin";
function applyPerm() {
  if (!S.realEdit) return; const r = myRole(); S.perm = r; S.canEdit = !!r.edit;
}
const navAllowed = (g) => !S.perm || g === "Overview" || S.perm.mods.includes(g) || (g === "Records" && isPermAdmin());
const itemAllowed = (v) => { if (v === "perms") return isPermAdmin(); const vs = S.perm?.views; if (!vs || ALWAYS.has(v) || !navKeys().some((k) => k.v === v)) return true; return vs.has(v) || navKeys().some((k) => k.parent === v && vs.has(k.v)); };
function viewGroup(name) {
  const v = SECTION_OF[name] || SECTION_OF[baseView(name)] || name;
  for (const [g, items] of NAV) for (const [iv, , , kids] of items) if (iv === v || (kids || []).some(([kv]) => kv === v)) return g;
  return null;
}
function viewAllowed(name) {
  if (!S.perm || name === "dash") return true; if (name === "perms") return isPermAdmin(); const g = viewGroup(name); if (g && !navAllowed(g)) return false;
  const vs = S.perm.views; if (!vs) return true; const key = SECTION_OF[name] || SECTION_OF[baseView(name)] || name;
  return !navKeys().some((k) => k.v === key) || vs.has(key);
}
const noAccess = () => head("Access", "This page isn't part of your role") + `<section class="card"><div class="empty-state"><span class="es-ic">${icon("shield", 22)}</span><p>Your role is <b>${esc(S.perm?.name || "")}</b>. Ask an HR Admin to add this module if you need it.</p><button class="btn btn-ghost btn-sm" data-go="dash">Go to the dashboard</button></div></section>`;

function bootPerm(db) {
  db.doc("org/access").onSnapshot((d) => {
    S.access = d.exists ? d.data() : {}; applyPerm(); refresh();
    const today = todayISO();
    const last = S.access.seenAt?.[S.myId]; const stale = !last || Date.now() - Date.parse(last) > 30 * 60000;
    if (S.myId && S.realEdit && (S.access.seen?.[S.myId] !== today || stale)) db.doc("org/access")[d.exists ? "update" : "set"]({ seen: { [S.myId]: today }, seenAt: { [S.myId]: new Date().toISOString() } }).catch(() => {});
  }, () => {});
}
async function saveAccess(patch, msg) {
  const next = { ...(S.access || {}), ...patch }; await S.db.doc("org/access").set(JSON.parse(JSON.stringify(next))); S.access = next; applyPerm(); logActivity(msg); toast("Saved."); render();
}

VIEWS.perms = () => {
  if (!isPermAdmin()) return noAccess();
  const a = S.access || {}; const users = a.users || {}; const seen = a.seen || {};
  const ids = [...new Set([...Object.keys(users), ...Object.keys(seen)])];
  const P = S.profiles || {}; const nm = (id) => P[id]?.name || (id === S.myId ? "You" : "Someone");
  (async () => { if (!S.userCap?.profiles || !ids.length) return; const ps = await S.userCap.profiles(ids); const changed = ids.some((id) => (S.profiles?.[id]?.name || "") !== (ps[id]?.name || "")); S.profiles = { ...(S.profiles || {}), ...ps }; if (changed && S.view.name === "perms") render(); })();
  const roleOpts = (cur) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(r.name)}</option>`).join("");
  const row = (id) => {
    const u = users[id] || {}; const key = u.role || a.defaultRole || "admin"; const listed = !!users[id]; const me = id === S.myId;
    const mods = me && S.isOwner || key === "admin" ? ["All modules"] : menuModsOf(viewsOf(u, key));
    return `<tr><td><span class="person" style="gap:10px">${P[id]?.avatarUrl ? `<img src="${esc(P[id].avatarUrl)}" alt="" width="34" height="34" style="border-radius:50%">` : `<span class="avatar" style="width:34px;height:34px;font-size:13px;background:var(--blue-soft);color:var(--blue)">?</span>`}<span class="who"><span class="name" style="font-size:14px" data-pname="${esc(id)}">${esc(nm(id))}${me ? " (you)" : ""}</span><span class="sub">${listed || (me && S.isOwner) ? "" : "Not set, uses the default · "}${seen[id] ? `last opened ${esc(fmtDate(seen[id]))}` : "hasn't opened the app yet"}</span></span></span></td>
      <td>${me && S.isOwner ? '<b>Owner</b><div class="t-muted" style="font-size:12px">Always full access</div>' : `<select class="input" data-perm-role="${esc(id)}" aria-label="Role" style="min-width:180px">${roleOpts(listed ? key : "")}${listed ? "" : `<option value="" selected>Default (${esc(ROLES[a.defaultRole || "admin"].name)})</option>`}</select>`}</td>
      <td>${`<span class="chips">${mods.length ? mods.map((m) => `<span class="chip c-blue">${esc(GL(m))}</span>`).join("") : '<span class="t-muted" style="font-size:13px">Dashboard only</span>'}</span>${(key === "custom" ? u.edit === false : ROLES[key] && !ROLES[key].edit) ? '<div class="t-muted" style="font-size:12px;margin-top:4px">View only</div>' : ""}${key === "custom" ? '<div class="t-muted" style="font-size:12px;margin-top:4px">Pages ticked in the table below</div>' : ""}`}</td>
      <td class="num">${listed && !me ? `<button class="btn btn-ghost btn-sm" data-perm-del="${esc(id)}">Remove</button>` : ""}</td></tr>`;
  };
  return head("Who sees which modules, and who can change records", "Users & permissions") + `
    <section class="card perm-how"><div class="card-head"><h2>How access works</h2></div>
      <ol style="margin:0;padding-left:20px;display:grid;gap:8px;font-size:14px;max-width:90ch">
        <li><b>Who can open the app</b> is set with the page's <b>Share</b> button on claude.ai. Give HR staff <b>Can edit</b>. Anyone shared at a lower level only gets their own phone time clock.</li>
        <li><b>What each HR staff member sees</b> is set here: pick a role for each person, or tick exactly which modules, sub-modules and sub-sub-modules they get, with <b>Change access</b> in the Users table or in the <b>Users &amp; Roles</b> tick boxes below. The side menu then shows only those pages, and people without "Can change records" can only look.</li>
        <li>You, as the owner, always have full access.</li>
      </ol>
      <p class="t-muted" style="margin:12px 0 0;font-size:13px;max-width:90ch">Roles control what the app shows and lets people do. Anyone with Can edit could still reach the data with technical tools, so give Can edit only to people you trust with all HR records.</p></section>
    <section class="card"><div class="card-head"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h2>Users</h2>${S.puAdd ? "" : `<button class="btn btn-gold btn-sm" data-pu-add>${icon("plus")}Add user</button>`}</div>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="lbl">Editors not listed get</span><select class="input" data-perm-default style="width:auto">${Object.entries(ROLES).filter(([k]) => k !== "custom").map(([k, r]) => `<option value="${k}" ${k === (a.defaultRole || "admin") ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label></div>
      <div class="perm-add"><div class="field" style="flex:1;min-width:220px;position:relative"><label for="perm-q">Or find someone already in your organization</label><input class="input" id="perm-q" type="search" autocomplete="off" placeholder="Type a name from your organization" value="${esc(S.permQ)}">
        ${S.permHits.length ? `<ul class="perm-hits" role="listbox">${S.permHits.map((h) => `<li><button data-perm-add="${esc(h.id)}" role="option"><img src="${esc(h.avatarUrl)}" alt="" width="26" height="26" style="border-radius:50%"><span data-hname="${esc(h.id)}">${esc(h.name)}</span></button></li>`).join("")}</ul>` : ""}</div>
        <div class="field"><label for="perm-new-role">Role</label><select class="input" id="perm-new-role">${roleOpts("viewer")}</select></div></div>
      ${S.userCap?.search ? "" : '<p class="t-muted" style="font-size:13px">Name search works when the app is opened on claude.ai. People also appear below once they open the app.</p>'}
      ${usersTable()}
    </section>
    <section class="card"><div class="card-head"><h2>Roles</h2></div><div class="table-wrap"><table><thead><tr><th>Role</th><th>Modules</th><th>Can change records</th><th>For</th></tr></thead><tbody>
      ${Object.entries(ROLES).map(([rk, r]) => { const all = NAV.filter(([g]) => g !== "Overview" && g !== "Users & Permissions").map(([g]) => g); const ms = rk === "custom" ? [] : rk === "admin" || rk === "owner" ? all : menuModsOf(viewsOf({}, rk)); return `<tr><td><b>${esc(r.name)}</b></td><td>${typeof rlModsCell === "function" ? rlModsCell(rk) : rk === "custom" ? "You choose" : ms.length >= all.length ? "All modules" : ms.length ? `${ms.length} of ${all.length} modules: ${esc(ms.map(GL).join(", "))}` : "Dashboard only"}</td><td>${r.edit ? "Yes" : "No"}</td><td class="t-muted" style="font-size:13px">${esc(typeof rlNoteOf === "function" ? rlNoteOf(rk, r) : r.note)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
};
document.addEventListener("input", async (ev) => {
  const t = ev.target; if (t.id !== "perm-q") return; S.permQ = t.value;
  const hits = t.value.trim() && S.userCap?.search ? await S.userCap.search(t.value) : []; if (S.permQ !== t.value) return;
  S.permHits = hits.filter((h) => h.name); const p0 = t.selectionStart; render(); const n = $("#perm-q"); if (n) { n.focus(); n.setSelectionRange(p0, p0); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target; if (!isPermAdmin()) return; const users = { ...(S.access?.users || {}) };
  try {
    if (t.hasAttribute("data-perm-default")) return await saveAccess({ defaultRole: t.value }, `Set the default role for unlisted editors to ${ROLES[t.value].name}`);
    if (t.dataset.permRole != null) { const id = t.dataset.permRole; if (!t.value) { const { role, views, mods, edit, ...rest } = users[id] || {}; if (Object.keys(rest).length) users[id] = rest; else delete users[id]; } else { const u0 = users[id] || {}; const k0 = u0.role || S.access?.defaultRole || "admin"; users[id] = { ...u0, role: t.value, ...(t.value === "custom" && !Array.isArray(u0.views) ? (() => { const vs = viewsOf(u0, k0); return { views: [...vs].filter((v) => !ALWAYS.has(v)), mods: modsOf(vs), edit: k0 === "custom" ? u0.edit !== false : !!ROLES[k0]?.edit }; })() : {}) }; } return await saveAccess({ users }, `Changed a role to ${ROLES[t.value]?.name || "default"}`); }
    if (t.dataset.permMod != null) { const id = t.dataset.permMod; const mods = [...document.querySelectorAll(`[data-perm-mod="${CSS.escape(id)}"]:checked`)].map((x) => x.value); users[id] = { ...users[id], role: "custom", mods }; return await saveAccess({ users }, "Changed custom role modules"); }
    if (t.dataset.permEdit != null) { const id = t.dataset.permEdit; users[id] = { ...users[id], role: "custom", edit: t.checked }; return await saveAccess({ users }, "Changed whether a custom role can change records"); }
  } catch { toast("Couldn't save. Check your connection and try again."); }
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-perm-add],[data-perm-del]"); if (!t || !isPermAdmin()) return; ev.stopImmediatePropagation(); const users = { ...(S.access?.users || {}) };
  try {
    if (t.dataset.permAdd) { const role = $("#perm-new-role")?.value || "viewer"; users[t.dataset.permAdd] = { role, ...(role === "custom" ? { views: [], mods: [], edit: true } : {}) }; S.permQ = ""; S.permHits = []; return await saveAccess({ users }, `Gave someone the ${ROLES[role].name} role`); }
    if (t.dataset.permDel) { if (!armed(t)) return; delete users[t.dataset.permDel]; return await saveAccess({ users }, "Removed someone's role (they use the default now)"); }
  } catch { toast("Couldn't save. Check your connection and try again."); }
}, true);

/* Access table: people across the top, every module and sub-module down the side, a tick box in each cell. */
function permMatrix(ids, users, a, nm) {
  if (!ids.length) return "";
  const keys = navKeys(); const groups = [...new Set(keys.map((k) => k.g))];
  const cols = ids.map((id) => { const u = users[id] || {}; const owner = id === S.myId && S.isOwner; const key = owner ? "admin" : u.role || a.defaultRole || "admin";
    return { id, owner, key, listed: !!users[id], views: owner || key === "admin" ? null : viewsOf(u, key), edit: owner ? true : key === "custom" ? u.edit !== false : !!ROLES[key]?.edit }; });
  const has = (c, v) => !c.views || c.views.has(v);
  const lock = (c, v) => c.owner || ALWAYS.has(v);
  const cell = (c, v, label) => `<td class="pm-c"><input type="checkbox" data-pv="${esc(c.id)}|${esc(v)}" ${has(c, v) ? "checked" : ""} ${lock(c, v) ? "disabled" : ""} aria-label="${esc(label)} for ${esc(nm(c.id))}"></td>`;
  const gcell = (c, g) => { const ks = keys.filter((k) => k.g === g && !ALWAYS.has(k.v)); const n = ks.filter((k) => has(c, k.v)).length;
    return `<td class="pm-c"><input type="checkbox" data-pg="${esc(c.id)}|${esc(g)}" ${n === ks.length && ks.length ? "checked" : ""} ${n && n < ks.length ? 'data-mixed="1"' : ""} ${c.owner || !ks.length ? "disabled" : ""} aria-label="All of ${esc(GL(g))} for ${esc(nm(c.id))}"></td>`; };
  const roleOpts = (cur) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(r.name)}</option>`).join("");
  return `<section class="card"><div class="card-head"><h2>Access table</h2><span class="t-muted" style="font-size:13px">Tick the modules and sub-modules each person can open. Changing a tick makes that person's role Custom.</span></div>
    <div class="table-wrap pm-wrap"><table class="pm"><thead>
      <tr><th class="pm-k">Person</th>${cols.map((c) => `<th class="pm-p">${esc(nm(c.id))}${c.id === S.myId ? " (you)" : ""}</th>`).join("")}</tr>
      <tr><th class="pm-k">Role</th>${cols.map((c) => `<td class="pm-c">${c.owner ? "<b>Owner</b>" : `<select class="input pm-role" data-perm-role="${esc(c.id)}" aria-label="Role for ${esc(nm(c.id))}">${roleOpts(c.listed ? c.key : "")}${c.listed ? "" : `<option value="" selected>Default (${esc(ROLES[a.defaultRole || "admin"].name)})</option>`}</select>`}</td>`).join("")}</tr>
      <tr><th class="pm-k">Can change records</th>${cols.map((c) => `<td class="pm-c"><input type="checkbox" data-pe="${esc(c.id)}" ${c.edit ? "checked" : ""} ${c.owner ? "disabled" : ""} aria-label="Can change records for ${esc(nm(c.id))}"></td>`).join("")}</tr>
    </thead><tbody>
      ${groups.map((g) => `<tr class="pm-g"><th class="pm-k"><span class="pm-gl">${icon(MOD_ICON[g] || "dash", 16)}${esc(GL(g))}</span></th>${cols.map((c) => gcell(c, g)).join("")}</tr>
        ${keys.filter((k) => k.g === g).map((k) => `<tr><th class="pm-k ${pmLvl(k)}">${icon(k.ic || "file", 15)}${esc(k.l)}${ALWAYS.has(k.v) ? ' <span class="t-muted" style="font-weight:400">(everyone)</span>' : ""}</th>${cols.map((c) => cell(c, k.v, k.l)).join("")}</tr>`).join("")}`).join("")}
      <tr><th class="pm-k pm-l1">${icon("shield", 15)}Users & permissions</th>${cols.map((c) => `<td class="pm-c"><input type="checkbox" disabled ${c.owner || c.key === "admin" ? "checked" : ""} aria-label="Users and permissions"></td>`).join("")}</tr>
    </tbody></table></div>
    <p class="t-muted" style="margin:10px 0 0;font-size:13px">Users & permissions is only for HR Admins. The dashboard is open to everyone, and shows only the sections of the modules a person has.</p></section>`;
}
document.addEventListener("change", async (ev) => {
  const t = ev.target; if (!(t.dataset.pv || t.dataset.pg || t.dataset.pe) || !isPermAdmin()) return; ev.stopImmediatePropagation();
  const a = S.access || {}; const users = { ...(a.users || {}) }; const id = (t.dataset.pv || t.dataset.pg || t.dataset.pe).split("|")[0];
  const u = users[id] || {}; const key = u.role || a.defaultRole || "admin";
  const views = viewsOf(u, key); const edit = key === "custom" ? u.edit !== false : !!ROLES[key]?.edit; const keys = navKeys();
  let what;
  if (t.dataset.pv) { const v = t.dataset.pv.slice(id.length + 1);
    for (const x of [v, ...descOf(keys, v)]) t.checked ? views.add(x) : views.delete(x); if (t.checked) for (const p of ancOf(keys, v)) views.add(p); what = `${t.checked ? "Gave" : "Removed"} access to ${keys.find((k) => k.v === v)?.l || v}`; }
  else if (t.dataset.pg) { const g = t.dataset.pg.slice(id.length + 1); for (const k of keys) if (k.g === g && !ALWAYS.has(k.v)) t.checked ? views.add(k.v) : views.delete(k.v); what = `${t.checked ? "Gave" : "Removed"} access to all of ${GL(g)}`; }
  else what = t.checked ? "Allowed someone to change records" : "Made someone view only";
  users[id] = { ...u, role: "custom", views: [...views].filter((v) => !ALWAYS.has(v)), mods: modsOf(views), edit: t.dataset.pe ? t.checked : edit };
  try { await saveAccess({ users }, what); } catch { toast("Couldn't save. Check your connection and try again."); }
}, true);
{ const prev = after.perms; after.perms = () => { prev?.(); document.querySelectorAll(".pm [data-mixed]").forEach((x) => (x.indeterminate = true)); }; }
