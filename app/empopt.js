/* ---------- Employee list options (Glenn 2026-10-13) ---------- */
// Employment status "Project - Regular": a project employee who has become regular. Listed right after Project-based.
{ const old = { ...STATUS }; for (const k of Object.keys(STATUS)) delete STATUS[k];
  for (const [k, v] of Object.entries(old)) { STATUS[k] = v; if (k === "PROJECT_BASED") STATUS.PROJECT_REGULAR = ["Project - Regular", "c-ok"]; }
  if (!STATUS.PROJECT_REGULAR) STATUS.PROJECT_REGULAR = ["Project - Regular", "c-ok"]; }
STATUS_COLORS.PROJECT_REGULAR = "#0e7c86";
// AWOL is its own separation reason, so the list can show In-Active (AWOL) apart from those who resigned or were separated.
if (!SEP_REASONS.some((r) => /awol/i.test(r))) SEP_REASONS.splice(1, 0, "AWOL (absence without official leave)");
const isAwol = (e) => !!e?.separated && /awol|abandon/i.test(e.separated.reason || "");
{ const b = filteredEmployees; filteredEmployees = (...a) => {
  const f = S.empFilter; const want = f.show;
  if (want !== "awol" && want !== "separated") return b(...a);
  f.show = "separated"; try { return b(...a).filter((e) => (want === "awol" ? isAwol(e) : !isAwol(e))); } finally { f.show = want; } }; }
// Needs action sits right after the Dashboard in Overview.
{ const ov = NAV.find(([n]) => n === "Overview"); if (ov) { const i = ov[1].findIndex(([v]) => v === "needs"); if (i > 0) { const [it] = ov[1].splice(i, 1); const d = ov[1].findIndex(([v]) => v === "dash"); ov[1].splice(d + 1, 0, it); } } }
