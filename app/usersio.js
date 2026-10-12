
// Users & permissions: Excel export and import of the Users list (Glenn 2026-10-12).
// Export: one row per user and invitation. Import: rows with a User ID update that user; rows without one become invitations (matched by name).
const UIO_COLS = ["User ID", "Name", "Status", "Role", "Can change records", "Access", "Email", "Employee no.", "Position", "Last signed in"];
const uioRoleKey = (v) => { const n = normH(v); if (!n) return ""; return Object.entries(ROLES).find(([k, r]) => normH(k) === n || normH(r.name) === n)?.[0] || null; };
const uioGroup = (v) => { const n = normH(v); return PERM_MODS.find((g) => normH(g) === n || normH(GL(g)) === n) || null; };
function uioRows() {
  const a = S.access || {}; const users = a.users || {}; const P = S.profiles || {};
  const ids = [...new Set([...Object.keys(users), ...Object.keys(a.seen || {}), ...(S.myId ? [S.myId] : [])])];
  const empOf = (x) => S.emps.get(x) || S.allEmps?.get?.(x);
  const out = ids.map((id) => { const u = users[id] || {}; const owner = id === S.myId && S.isOwner; const st = puState(id, owner); const e = empOf(u.empId);
    const t = a.seenAt?.[id] || a.seen?.[id] || "";
    return { "User ID": id, Name: u.name || P[id]?.name || "", Status: "Active", Role: owner ? "Owner" : ROLES[st.key]?.name || "", "Can change records": st.edit ? "Yes" : "No",
      Access: st.views ? modsOf(st.views).map(GL).join(", ") || "Dashboard only" : "All modules", Email: u.email || P[id]?.email || e?.email || "", "Employee no.": e?.no || "",
      Position: e ? pos(e.posId)?.title || "" : "", "Last signed in": t ? String(t).slice(0, 16).replace("T", " ") : "Not yet" }; });
  for (const [, v] of Object.entries(a.invites || {})) { const e = empOf(v.empId);
    out.push({ "User ID": "", Name: v.name || "", Status: "Invited", Role: ROLES[v.role]?.name || "", "Can change records": ROLES[v.role]?.edit ? "Yes" : "No", Access: "", Email: v.email || e?.email || "",
      "Employee no.": e?.no || "", Position: e ? pos(e.posId)?.title || "" : "", "Last signed in": "Not yet" }); }
  return out.sort((x, y) => x.Status.localeCompare(y.Status) || x.Name.localeCompare(y.Name));
}
async function uioExport() {
  const X = await loadLib("xlsx"); const rows = uioRows(); const ws = X.utils.json_to_sheet(rows, { header: UIO_COLS });
  ws["!cols"] = [14, 26, 10, 22, 12, 46, 30, 14, 24, 18].map((w) => ({ wch: w }));
  const help = X.utils.aoa_to_sheet([["How to import"], ["Keep the User ID column as it is. It tells the app which person a row belongs to."], ["Rows without a User ID become invitations: the person gets the role the first time they open the app."],
    ["Role: " + Object.values(ROLES).map((r) => r.name).join(", ") + "."], ["Access and Can change records are used only when Role is Custom. List modules separated by commas: " + PERM_MODS.map(GL).join(", ") + "."],
    ["Employee no. links the person to their employee record. The owner's role cannot be changed."]]); help["!cols"] = [{ wch: 120 }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Users"); X.utils.book_append_sheet(wb, help, "How to import");
  if (await saveBlob(`Users and permissions ${todayISO()}.xlsx`, new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_TYPE }))) toast("Users list downloaded.");
}
async function uioImport(file) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast("Choose an Excel (.xlsx or .xls) or CSV file."); return; }
  const X = await loadLib("xlsx"); const wb = X.read(await file.arrayBuffer(), { type: "array", cellNF: true });
  let rows = null; const want = new Set(UIO_COLS.map(normH));
  for (const n of wb.SheetNames) { const r = sheetRows(X, wb.Sheets[n]); for (let h = 0; h < Math.min(6, r.length); h++) { const hits = r[h].filter((c) => want.has(normH(c))).length; if (hits >= 2 && (!rows || hits > rows.hits)) rows = { hits, r: r.slice(h) }; } }
  if (!rows) { toast("No Users list found. Use a file from Export to Excel."); return; }
  const head = rows.r[0].map(normH); const col = (row, c) => String(row[head.indexOf(normH(c))] ?? "").trim();
  const a = S.access || {}; const users = { ...(a.users || {}) }; const invites = { ...(a.invites || {}) }; const P = S.profiles || {};
  const byNo = new Map([...S.emps.values()].map((e) => [normH(e.no), e]));
  let upd = 0, inv = 0; const bad = [];
  for (const [i, row] of rows.r.slice(1).entries()) {
    const name = col(row, "Name").replace(/\s+/g, " ").slice(0, 80); const id = col(row, "User ID"); const ln = i + 2;
    if (!name && !id) continue; const roleTxt = col(row, "Role"); const rk = uioRoleKey(roleTxt); const email = col(row, "Email"); const no = col(row, "Employee no.");
    if (roleTxt && rk === null && normH(roleTxt) !== "owner") { bad.push(`Row ${ln}: unknown role "${roleTxt}"`); continue; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { bad.push(`Row ${ln}: check the email "${email}"`); continue; }
    const emp = no ? byNo.get(normH(no)) : null; if (no && !emp) { bad.push(`Row ${ln}: no employee with number ${no}`); continue; }
    if (id) {
      if (!users[id] && !a.seen?.[id] && id !== S.myId) { bad.push(`Row ${ln}: User ID not found`); continue; }
      const u = { ...(users[id] || {}) }; const owner = id === S.myId && S.isOwner;
      if (name) u.name = name !== (P[id]?.name || "") ? name : null; u.email = email || null; if (no) u.empId = emp.id; else if (head.includes(normH("Employee no."))) u.empId = null;
      if (!owner && rk) { u.role = rk;
        if (rk === "custom") { const acc = col(row, "Access"); const gs = acc && !/^(all modules|dashboard only)$/i.test(acc) ? acc.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];
          const miss = gs.filter((g) => !uioGroup(g)); if (miss.length) { bad.push(`Row ${ln}: unknown module ${miss.join(", ")}`); continue; }
          const mods = gs.map(uioGroup); if (acc || !Array.isArray(u.views)) { u.mods = mods; u.views = navKeys().filter((k) => mods.includes(k.g) || (k.g === "Overview" && mods.length)).map((k) => k.v).filter((v) => !ALWAYS.has(v)); }
          const ce = col(row, "Can change records"); if (ce) u.edit = !/^(no|n|false|0)$/i.test(ce); }
        else { delete u.views; delete u.mods; delete u.edit; } }
      users[id] = u; upd++;
    } else {
      if (!name) { bad.push(`Row ${ln}: name is missing`); continue; }
      const known = Object.keys({ ...users, ...(a.seen || {}) }).find((x) => normName(users[x]?.name || P[x]?.name) === normName(name)); if (known) { bad.push(`Row ${ln}: ${name} already uses the app; add their User ID to change them`); continue; }
      const k = Object.keys(invites).find((x) => normName(invites[x].name) === normName(name)) || uid();
      invites[k] = { ...(invites[k] || {}), name, email: email || null, empId: emp?.id || invites[k]?.empId || null, role: rk && rk !== "custom" ? rk : invites[k]?.role || "viewer", at: invites[k]?.at || todayISO() }; inv++;
    }
  }
  if (!upd && !inv) { toast(bad.length ? `Nothing imported. ${bad.slice(0, 3).join("; ")}` : "The file has no users."); return; }
  const msg = `Import ${upd} user${upd === 1 ? "" : "s"}${inv ? ` and ${inv} invitation${inv === 1 ? "" : "s"}` : ""}?${bad.length ? `\n\nSkipped ${bad.length} row${bad.length === 1 ? "" : "s"}:\n${bad.slice(0, 8).join("\n")}${bad.length > 8 ? "\n…" : ""}` : ""}`;
  if (!await askConfirm(msg, "Import")) return;
  try { await saveAccess({ users: JSON.parse(JSON.stringify(users)), invites: JSON.parse(JSON.stringify(invites)) }, `Imported the Users list (${upd} updated, ${inv} invited)`); } catch { toast("Couldn't save. Try again."); }
}
{ const b = VIEWS.perms; VIEWS.perms = (...x) => { const h = b(...x); if (!isPermAdmin()) return h;
  const btns = `<button class="btn btn-ghost btn-sm" data-uio-exp>${icon("download")}Export to Excel</button><button class="btn btn-ghost btn-sm" data-uio-imp>${icon("upload")}Import from Excel</button><input type="file" id="uio-file" accept=".xlsx,.xls,.csv" hidden>`;
  return h.replace(/(<h2>Users<\/h2>(?:<button[^>]*data-pu-add[^>]*>[\s\S]*?<\/button>)?)/, `$1${btns}`); }; }
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-uio-exp],[data-uio-imp]"); if (!t || !isPermAdmin()) return;
  if (t.hasAttribute("data-uio-exp")) uioExport().catch(() => toast("Couldn't make the Excel file.")); else document.getElementById("uio-file")?.click(); });
document.addEventListener("change", (ev) => { if (ev.target.id !== "uio-file") return; const f = ev.target.files?.[0]; ev.target.value = ""; if (f) uioImport(f).catch(() => toast("Couldn't read that file.")); });
{ const st = document.createElement("style"); st.textContent = "#ac-msg{white-space:pre-line}"; document.head.appendChild(st); }
