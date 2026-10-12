/* ---------- v65 the dashboard greeting always carries a name (Glenn 2026-10-12: "at Good Morning, add the Name") ----------
   Order: the employee linked to this user (Users & permissions), an employee with the same email, the account name (never an email), the invite name. */
const isMail = (s) => /@/.test(String(s || ""));
const firstOf = (s) => String(s || "").trim().split(/\s+/)[0] || "";
function myFirstName() {
  const u = S.access?.users?.[S.myId] || {};
  // The name exactly as Users & permissions shows it (Glenn 2026-10-12).
  const listed = u.name || S.profiles?.[S.myId]?.name || S.access?.names?.[S.myId] || (S.myName && !isMail(S.myName) ? S.myName : "");
  if (listed && !isMail(listed)) return String(listed).trim(); const emps = S.allEmps || S.emps;
  const e = (u.empId && emps?.get(u.empId)) || ((u.email || S.myEmail) && [...(emps?.values() || [])].find((x) => x.email && String(x.email).toLowerCase() === String(u.email || S.myEmail).toLowerCase()));
  if (e?.first) return e.first;
  if (S.access?.names?.[S.myId]) return firstOf(S.access.names[S.myId]);
  if (S.myName && !isMail(S.myName)) return firstOf(S.myName);
  const inv = Object.values(S.access?.invites || {}).find((i) => S.myEmail && String(i.email || "").toLowerCase() === S.myEmail.toLowerCase());
  if (inv?.name) return firstOf(inv.name);
  if (u.name && !isMail(u.name)) return firstOf(u.name);
  return "";
}
{ const b = VIEWS.dash; VIEWS.dash = (...a) => { const f = myFirstName(); S.myFirst = f || (isMail(S.myFirst) ? "" : S.myFirst); const h = b(...a); if (S.myFirst || !S.realEdit) return h;
  // No name known yet: offer to add it right in the greeting.
  return h.replace(/(<h1[^>]*>\s*Good (?:Morning|Afternoon|Evening))(\s*<\/h1>)/, S.gnEdit ? `$1, <input class="input gn-in" id="gn-in" placeholder="Your name" aria-label="Your name" autocomplete="name"> <button class="btn btn-primary btn-sm" data-gn-save>Save</button>$2`
    : `$1 <button class="link gn-add" data-gn-add>Add your name</button>$2`); }; }
document.addEventListener("click", async (ev) => { if (ev.target.closest("[data-gn-add]")) { S.gnEdit = true; render(); setTimeout(() => document.getElementById("gn-in")?.focus(), 50); return; }
  if (!ev.target.closest("[data-gn-save]")) return; const nm = String(document.getElementById("gn-in")?.value || "").trim().replace(/\s+/g, " ").slice(0, 60); if (!nm) return;
  const a = S.access || {}; const next = { ...a, users: { ...(a.users || {}), [S.myId]: { ...(a.users?.[S.myId] || {}), name: nm } } };
  try { await S.db.doc("org/access").set(JSON.parse(JSON.stringify(next))); S.access = next; S.myName = nm; S.gnEdit = false; toast(`Hello, ${nm}!`); render(); } catch { toast("Couldn't save your name. Try again."); } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "gn-in") document.querySelector("[data-gn-save]")?.click(); });
{ const st = document.createElement("style"); st.textContent = `.gn-add{font-size:15px;font-weight:700;margin-left:10px;vertical-align:middle;color:#E4C98E !important;text-decoration:underline}.gn-in{display:inline-block;width:min(240px,60vw);vertical-align:middle;font-size:16px;margin-left:6px}`; document.head.appendChild(st); }
/* learn the account email too (the website gives it; claude.ai may not) */
setTimeout(async function mail(n = 0) { if (!S.userCap?.profiles || !S.myId) { if (n < 30) setTimeout(() => mail(n + 1), 1000); return; }
  try { const me = await S.userCap.me?.().catch(() => null); if (me?.name && !isMail(me.name)) S.myName = String(me.name).trim(); else if (isMail(me?.name)) S.myEmail = me.name;
    const ps = await S.userCap.profiles([S.myId]); const p = ps?.[S.myId] || {}; const em = p.email || (isMail(p.name) ? p.name : ""); if (em) S.myEmail = String(em).trim();
    if (p.name && !isMail(p.name)) S.myName = String(p.name).trim(); if (S.view?.name === "dash") render(); } catch {} }, 1800);
