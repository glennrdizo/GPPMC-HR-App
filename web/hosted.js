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
