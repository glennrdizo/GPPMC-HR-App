/* ---------- Speed (audit 2026-10-17) ----------
   Punches by person, and the leave and holiday context, are worked out once per change instead of once per employee:
   the phone summaries (every minute) and Overtime reports called them for every person, which took about 5 and 11 seconds. */
{ const b = punchDays; const memo = new Map(); let ver = -1, emps = null;
  punchDays = (from, to) => { if (ver !== S.ver || emps !== S.emps) { memo.clear(); ver = S.ver; emps = S.emps; } // S.emps is narrowed for some pages
    const k = `${from}|${to}|${S.geoAll ? 1 : 0}`; let v = memo.get(k); if (!v) { if (memo.size > 40) memo.clear(); v = b(from, to); memo.set(k, v); } return v; }; }
{ const b = tkCtx; let c = null, key = "";
  tkCtx = () => { const k = `${S.ver}|${todayISO()}`; if (k !== key || !c) { c = b(); key = k; } return { ...c, now: Date.now() }; }; }
// A final payroll whose run record doesn't exist was fetched again on every look; try it again after 5 minutes instead.
{ const b = ensureRun; const miss = new Map(); ensureRun = async (id) => { if (Date.now() - (miss.get(id) || 0) < 3e5) return; const had = S.runs.has(id); await b(id); if (!had && !S.runs.has(id) && isFinal(id)) miss.set(id, Date.now()); }; }
