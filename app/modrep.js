/* ---------- v60 Monthly report: analysis for every module and submodule (Glenn 2026-10-12) ---------- */
const mrIn = (v, m) => typeof v === "string" && v.slice(0, 7) === m;
const MR_DATES = ["filed", "d", "date", "applied", "incident", "notice", "start", "eff", "effective", "from", "opened", "granted", "issued", "at", "created"];
const mrDate = (r) => { for (const k of MR_DATES) { const v = r?.[k]; if (typeof v === "string" && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 10); } return ""; };
const mrN = (n, one, many = one + "s") => `${Number(n).toLocaleString("en-PH")} ${n === 1 ? one : many}`;
const mrVs = (n, p) => (p == null ? "" : n === p ? " (same as last month)" : ` (${p} last month)`);
const mrList = (x) => { try { return x instanceof Map ? [...x.values()] : Array.isArray(x) ? x : []; } catch { return []; } };
/* Builds the analysis for one month and scope. Each row: { n, p, text, tone: good|watch|risk|info, act } */
function modAnalysis(m, sc) {
  const pm = prevMonth(m), today = todayISO(), mEnd = monthEnd(m);
  const empOk = (id) => { if (sc === "all" || !id) return true; const e = (S.allEmps || S.emps).get(id); if (!e) return false; return sc === "prj" ? !!e.projectId : !e.projectId; };
  const ok = (r) => empOk(r?.empId);
  const emps = [...S.emps.values()].filter((e) => empOk(e.id)); const act = emps.filter((e) => !e.separated && e.hire <= mEnd);
  let pend = [], dl = []; try { pend = opsPending().filter((x) => !x.e || empOk(x.e.id)); } catch {} try { dl = opsDeadlines().filter((x) => !x.e || empOk(x.e.id)); } catch {}
  const lateOf = (kind, f = () => true) => pend.filter((x) => x.kind === kind && f(x.r));
  /* Requests that go through approval (leave, overtime, claims, notices ...) */
  const req = (kind, f = () => true, noun = "request") => {
    let list = []; try { list = OPK_BY[kind][3]().filter((r) => ok(r) && f(r)); } catch { return null; }
    const filedOf = (r) => opFiled(r) || mrDate(r); const cur = list.filter((r) => mrIn(filedOf(r), m)), prv = list.filter((r) => mrIn(filedOf(r), pm));
    const st = (r) => String(r.status || "").toUpperCase(); const appr = cur.filter((r) => /APPROV|PAID|DONE|RELEAS|ISSU|POSTED|ACCEPT|APPLIED|CLOSED|ACKNOW/.test(st(r))).length;
    const dec = cur.filter((r) => /REJECT|DECLIN|DENI|CANCEL|WITHDR/.test(st(r))).length; const wait = list.filter((r) => st(r) === "PENDING");
    const days = cur.map((r) => { const d = opDecided(kind, r); return d ? daysBetween(filedOf(r), d) : null; }).filter((x) => x != null && x >= 0);
    const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null; const late = lateOf(kind, f).filter((x) => x.late > 0);
    const sla = Number(OPS().sla[kind]) || 3;
    const text = cur.length || wait.length ? `${mrN(cur.length, noun)} filed${mrVs(cur.length, prv.length)}: ${appr} approved, ${dec} declined.${wait.length ? ` ${wait.length} waiting for a decision.` : ""}${avg != null ? ` Decided in ${avg.toFixed(1)} days on average (target ${sla}).` : ""}` : `No ${noun}s filed this month.`;
    return { n: cur.length, p: prv.length, tone: late.length > 3 ? "risk" : late.length || (avg != null && avg > sla) ? "watch" : cur.length || wait.length ? "good" : "info", text: text + (late.length ? ` ${late.length} past the ${sla}-day target.` : ""),
      act: late.length ? `Decide the ${late.length} overdue ${late.length === 1 ? noun : noun + "s"} (see Needs action).` : avg != null && avg > sla ? `Speed up approvals to meet the ${sla}-day target.` : "" };
  };
  /* Plain records counted by month */
  const rec = (src, noun, f = () => true) => { const list = mrList(src).filter((r) => ok(r) && f(r)); const n = list.filter((r) => mrIn(mrDate(r), m)).length, p = list.filter((r) => mrIn(mrDate(r), pm)).length;
    return { n, p, tone: n ? "good" : "info", text: n ? `${mrN(n, noun)} recorded${mrVs(n, p)}; ${list.length} on file in total.` : `None recorded this month; ${list.length} on file.`, act: "" }; };
  const info = (text, n = null, tone = "info") => ({ n, p: null, tone, text, act: "" });
  const R = repMemo(m, sc), M = exMetrics(R), P = exMetrics(repMemo(pm, sc));
  const leaves = (() => { try { return allLeaves().filter(ok); } catch { return []; } })();
  const lvDays = (mm) => leaves.filter((l) => l.status === "APPROVED" && mrIn(l.from, mm)).reduce((a, l) => a + (l.days || 0), 0);
  const apps = mrList(S.apps), jobs = mrList(S.jobs), reviews = mrList(S.reviews).filter(ok), cases = mrList(S.cases).filter(ok), courses = mrList(S.courses);
  const train = () => { let need = 0, okN = 0, exp = 0; for (const c of courses) for (const e of act) { if (!needs(c, e)) continue; need++; const s = trainState(c, e); if (s === "OK") okN++; if (s === "EXPIRING" || s === "EXPIRED") exp++; } return { need, okN, exp }; };
  const T = {
    /* Overview */
    dash: () => info(`${M.end} active employees at month end, ${M.hires} hired and ${M.seps} separated. The dashboard tiles reflect these figures live.`, M.end, "good"),
    ann: () => { const list = mrList(S.anns); const n = list.filter((a) => mrIn(a.start || a.at || a.d, m)).length; const p = list.filter((a) => mrIn(a.start || a.at || a.d, pm)).length;
      const ackLow = list.filter((a) => mrIn(a.start || a.at || a.d, m) && a.ack && act.length && Object.keys(a.ack).length / act.length < 0.5).length;
      return { n, p, tone: ackLow ? "watch" : n ? "good" : "info", text: n ? `${mrN(n, "announcement")} posted${mrVs(n, p)}.${ackLow ? ` ${ackLow} read by fewer than half of staff.` : ""}` : "No announcements this month.", act: ackLow ? "Remind supervisors to have their teams acknowledge announcements." : "" }; },
    askhr: () => { let t = []; try { t = akAll().filter(ok); } catch {} const n = t.filter((x) => mrIn(x.at, m)).length, p = t.filter((x) => mrIn(x.at, pm)).length, open = t.filter((x) => x.status !== "CLOSED").length; const late = lateOf("ask").filter((x) => x.late > 0).length;
      return { n, p, tone: late ? "watch" : n ? "good" : "info", text: `${mrN(n, "question")} received${mrVs(n, p)}; ${open} still open${late ? `, ${late} past the reply target` : ""}.`, act: late ? "Answer the overdue Ask HR questions." : "" }; },
    reminders: () => { let r = []; try { r = remList().filter((x) => empOk(x.e?.id)); } catch {} const due = r.filter((x) => !x.done && x.due <= mEnd).length, done = r.filter((x) => x.done && mrIn(String(x.done), m)).length;
      return { n: due, p: null, tone: due > 20 ? "risk" : due ? "watch" : "good", text: `${due} reminders due by month end are not done; ${done} completed this month.`, act: due ? "Work through Overview > Reminders, starting with evaluations and contract ends." : "" }; },
    needs: () => { const late = pend.filter((x) => x.late > 0).length, dlate = dl.filter((x) => x.late > 0).length;
      return { n: pend.length, p: null, tone: late + dlate > 5 ? "risk" : late + dlate ? "watch" : "good", text: `${pend.length} approvals waiting (${late} overdue) and ${dl.length} deadlines in the next two weeks (${dlate} overdue).`, act: late + dlate ? "Clear the overdue items on Needs action; escalate those stuck with one approver." : "" }; },
    hrbot: () => info("Answers employees' questions from the company policies; no monthly records."),
    report: () => info("This report."),
    /* People */
    hrdash: () => info(`Headcount ${M.start} to ${M.end}; turnover ${pct(M.turnover)} for the month.`, M.end, M.turnover > 0.02 ? "risk" : M.turnover > 0.01 ? "watch" : "good"),
    employees: () => { const miss = act.filter((e) => !(e.tin && e.sss && e.philhealth && e.pagibig)).length;
      return { n: M.end, p: P.end, tone: miss > act.length * 0.1 ? "watch" : "good", text: `${M.end} active employees${mrVs(M.end, P.end)}; ${M.hires} new 201 files. ${miss} still missing a government number.`, act: miss ? "Complete missing TIN, SSS, PhilHealth and Pag-IBIG numbers before the next remittance." : "" }; },
    audit: () => { const list = mrList(S.audits).filter(ok); const n = list.filter((a) => mrIn(a.at, m)).length, p = list.filter((a) => mrIn(a.at, pm)).length; return { n, p, tone: n ? "good" : "info", text: `${mrN(n, "201 change")} logged${mrVs(n, p)}.`, act: "" }; },
    projects: () => { const pr = mrList(S.projects).filter((x) => x.status === "ACTIVE"); return { n: pr.length, p: null, tone: M.fill == null ? "info" : M.fill < 0.75 ? "risk" : M.fill < 0.9 ? "watch" : "good",
      text: `${mrN(pr.length, "active project")}${M.fill != null ? `, ${pct(M.fill, 0)} staffed (${M.have} of ${M.need})${M.short.length ? `; biggest gap ${M.short[0].name} (${M.short[0].gap})` : ""}` : ""}.`, act: M.fill != null && M.fill < 0.9 ? "Hire or redeploy for the projects with the largest gaps." : "" }; },
    org: () => { const d = (S.org?.departments || []).length, ps = (S.org?.positions || []).length; return info(`${d} departments and ${ps} positions defined.`, d); },
    /* Employees */
    emphome: () => info(`${M.end} active: ${act.filter((e) => e.status === "REGULAR").length} regular, ${M.prob} probationary, ${act.filter((e) => ["CONTRACTUAL", "PROJECT_BASED", "CASUAL"].includes(e.status)).length} contractual or project-based.`, M.end, "good"),
    directory: () => { const noMail = act.filter((e) => !e.email && !e.mobile).length; return { n: act.length, p: null, tone: noMail ? "watch" : "good", text: `${act.length} listed; ${noMail} without an email or mobile number.`, act: noMail ? "Collect contact details so reminders and payslips reach everyone." : "" }; },
    departments: () => { const by = {}; for (const e of act) { const k = unitName(e); by[k] = (by[k] || 0) + 1; } const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3); return info(top.length ? `Largest units: ${top.map(([k, v]) => `${k} (${v})`).join(", ")}.` : "No staff assigned yet.", Object.keys(by).length); },
    contracts: () => { const ending = act.filter((e) => { const c = ctrOf(e); return c?.end && c.end >= today && c.end <= addDays(today, 30); }).length; const lapsed = dl.filter((x) => x.kind === "ctr" || /contract/i.test(x.label || "")).length;
      return { n: ending, p: null, tone: lapsed ? "risk" : ending ? "watch" : "good", text: `${ending} contracts end in the next 30 days${lapsed ? `; ${lapsed} already lapsed with no decision` : ""}.`, act: lapsed || ending ? "Decide renewals before end dates to avoid regularization by default." : "" }; },
    joboffer: () => { const off = apps.filter((a) => a.stage === "OFFER").length; const hired = apps.filter((a) => a.stage === "HIRED" && mrIn(a.stageAt, m)).length; return { n: hired, p: null, tone: "good", text: `${off} offers outstanding; ${hired} accepted and hired this month.`, act: off > 3 ? "Follow up outstanding offers within a week." : "" }; },
    trprog: () => { const t = train(); return info(t.need ? `${pct(t.okN / t.need, 0)} of required training is current.` : "No required courses set.", t.need, t.need && t.okN / t.need < 0.8 ? "watch" : "good"); },
    emptraining: () => { let n = 0, p = 0; for (const c of courses) for (const [id, r] of Object.entries(c.recs || {})) { if (!empOk(id)) continue; if (mrIn(r.d, m)) n++; if (mrIn(r.d, pm)) p++; } return { n, p, tone: n ? "good" : "info", text: `${mrN(n, "course completion")} recorded${mrVs(n, p)}.`, act: "" }; },
    onboarding: () => { const o = mrList(S.onb).filter(ok); const open = o.filter((x) => !x.done); const stuck = open.filter((x) => x.start && daysBetween(x.start, today) > 30).length;
      return { n: o.filter((x) => mrIn(x.start, m)).length, p: o.filter((x) => mrIn(x.start, pm)).length, tone: stuck ? "watch" : "good", text: `${o.filter((x) => mrIn(x.start, m)).length} checklists started; ${open.length} still open${stuck ? `, ${stuck} older than 30 days` : ""}.`, act: stuck ? "Close the old onboarding items (contract, SSS/PhilHealth/Pag-IBIG reports, ID)." : "" }; },
    offboarding: () => { const o = mrList(S.offb).filter(ok); const n = o.filter((x) => mrIn(x.last, m)).length; const open = o.filter((x) => (x.items || []).some((i) => !i.done)).length; const fp = dl.filter((x) => x.kind === "fp").length;
      return { n, p: o.filter((x) => mrIn(x.last, pm)).length, tone: fp ? "watch" : "good", text: `${n} exits with a last day this month; ${open} clearances not finished${fp ? `; ${fp} final pays due soon` : ""}.`, act: fp ? "Release final pay within 30 days of the last day (DOLE Labor Advisory 06-20)." : "" }; },
    resign: () => req("rs", undefined, "resignation notice"),
    orient: () => rec(S.orients, "orientation request"),
    salinc: () => req("si", undefined, "salary increment"),
    paf: () => req("pf", undefined, "personnel action"),
    discipline: () => { const n = cases.filter((c) => mrIn(c.incident || c.nte, m)).length, p = cases.filter((c) => mrIn(c.incident || c.nte, pm)).length; const open = cases.filter((c) => !c.decision).length; const late = dl.filter((x) => /nte|dec/i.test(x.kind || "") && x.late > 0).length;
      return { n, p, tone: late ? "risk" : open ? "watch" : "good", text: `${mrN(n, "new case")}${mrVs(n, p)}; ${open} without a decision${late ? `, ${late} past a deadline` : ""}.`, act: late ? "Issue the overdue decisions; due process requires the 5-day reply period and a written decision." : "" }; },
    evaluation: () => { const n = reviews.filter((r) => mrIn(r.at || r.d, m)).length, p = reviews.filter((r) => mrIn(r.at || r.d, pm)).length; return { n, p, tone: M.prob && !n ? "watch" : "good", text: `${mrN(n, "evaluation")} completed${mrVs(n, p)}; ${M.prob} probationary employees to evaluate before six months.`, act: M.prob && !n ? "Schedule the probationary evaluations due this month." : "" }; },
    medical: () => rec(S.meds, "medical record"),
    accountability: () => { const pr = mrList(S.prop); const held = pr.filter((x) => x.holderId && (S.allEmps || S.emps).get(x.holderId)?.separated).length; return { n: pr.filter((x) => x.status === "ASSIGNED").length, p: null, tone: held ? "risk" : "good", text: `${pr.filter((x) => x.status === "ASSIGNED").length} assets issued; ${held} still held by separated employees.`, act: held ? "Recover assets from separated employees before releasing their clearance." : "" }; },
    empdocs: () => { const exp = act.reduce((a, e) => a + (e.docs || []).filter((d) => d.exp && d.exp <= addDays(today, 30)).length, 0); return { n: exp, p: null, tone: exp ? "watch" : "good", text: `${exp} employee documents expired or expiring within 30 days.`, act: exp ? "Ask the employees for renewed copies (licenses, NBI, permits)." : "" }; },
    chgreq: () => req("cq", undefined, "change request"),
    certreq: () => req("cert", undefined, "certificate request"),
    emprep: () => info("Report builder; no monthly records."),
    /* ID printing */
    idprint: () => { let n = 0, p = 0; for (const [id, r] of S.idCards || new Map()) { if (!empOk(id)) continue; for (const x of r.prints || []) { if (mrIn(x.d, m)) n++; if (mrIn(x.d, pm)) p++; } } return { n, p, tone: n ? "good" : "info", text: `${mrN(n, "ID")} printed${mrVs(n, p)}.`, act: "" }; },
    idmiss: () => { let miss = 0; try { miss = act.filter((e) => idMissing(e).length).length; } catch {} return { n: miss, p: null, tone: miss > act.length * 0.2 ? "watch" : "good", text: `${miss} employees cannot get an ID yet (missing photo, signature, address, emergency contact or government numbers).`, act: miss ? "Collect the missing ID details." : "" }; },
    idhist: () => info("Print log; see Print IDs for the month's count."),
    idset: () => info("Card design settings."),
    /* Recruitment */
    hiring: () => { const n = apps.filter((a) => mrIn(a.applied, m)).length, p = apps.filter((a) => mrIn(a.applied, pm)).length; const open = jobs.filter((j) => j.status === "OPEN").length;
      return { n, p, tone: open && n < open * 3 ? "watch" : "good", text: `${mrN(n, "applicant")}${mrVs(n, p)} for ${mrN(open, "open job")}; ${M.hiredRec} hired.`, act: open && n < open * 3 ? "Boost applicant flow: re-post ads and ask for referrals." : "" }; },
    rflow: () => { const stuck = apps.filter((a) => !["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage) && a.stageAt && daysBetween(a.stageAt, today) > 14).length; return { n: stuck, p: null, tone: stuck ? "watch" : "good", text: `${stuck} applicants have not moved stage in over two weeks.`, act: stuck ? "Move or close stalled applicants so good candidates are not lost." : "" }; },
    mplan: () => { const d = S.mplan?.get?.(m.slice(0, 4)); return info(d ? `Manpower plan for ${m.slice(0, 4)} has ${(d.rows || []).length} lines.` : `No manpower plan saved for ${m.slice(0, 4)}.`, null, d ? "good" : "watch"); },
    mpr: () => req("mpr", undefined, "manpower request"),
    olr: () => { const o = apps.filter((a) => a.offer && mrIn(a.offer.d || a.offer.at || a.offer.sent, m)).length; return info(`${mrN(o, "offer letter")} prepared this month.`, o, o ? "good" : "info"); },
    rtests: () => { const t = apps.flatMap((a) => (a.tests || []).filter((x) => mrIn(x.d, m))); const pass = t.filter((x) => x.result === "PASSED").length; return info(t.length ? `${t.length} tests taken; ${pct(pass / t.length, 0)} passed.` : "No tests recorded this month.", t.length, t.length ? "good" : "info"); },
    ranalysis: () => { const filled = jobs.filter((j) => j.status === "FILLED" && j.opened && j.filled); const ttf = filled.length ? filled.reduce((a, j) => a + daysBetween(j.opened, j.filled), 0) / filled.length : null;
      return info(`${M.openJobs} open jobs need ${M.needed} people.${ttf != null ? ` Average time to fill ${Math.round(ttf)} days.` : ""}`, M.openJobs, M.openJobs && M.needed > M.openJobs * 2 ? "watch" : "good"); },
    lifecycle: () => info(`${M.hires} joined and ${M.seps} left this month.`, M.hires + M.seps, "good"),
    perf: () => T.evaluation(),
    property: () => T.accountability(),
    /* Timekeeping */
    tk: () => info(`${M.abs} absence days, ${Math.round(M.late / 60)} hours late and ${M.ot.toLocaleString("en-PH")} overtime hours.`, null, M.absRate > 0.03 ? "risk" : M.absRate > 0.02 ? "watch" : "good"),
    attflow: () => req("ar", undefined, "attendance request"),
    dtr: () => ({ n: M.abs, p: P.abs, tone: M.absRate > 0.03 ? "risk" : M.absRate > 0.02 ? "watch" : "good", text: `Absence rate ${pct(M.absRate)}${P ? ` (${pct(P.absRate)} last month)` : ""}; ${M.abs} absence days and ${Math.round(M.ut / 60)} hours of undertime.`, act: M.absRate > 0.02 ? "Review repeat absences with supervisors." : "" }),
    roster: () => { const r = mrList(S.rosters).filter((x) => mrIn(x.month || x.id || x.d, m)).length; return info(r ? `${r} working calendars set for the month.` : "No working calendar saved for this month; default shifts apply.", r, r ? "good" : "info"); },
    attreqs: () => req("ar", (r) => !["OB", "UT", "SWAP", "SHIFT"].includes(r.kind), "attendance change"),
    chsched: () => req("ar", (r) => ["SWAP", "SHIFT"].includes(r.kind), "schedule change"),
    obreq: () => req("ar", (r) => r.kind === "OB", "official business request"),
    utreq: () => req("ar", (r) => r.kind === "UT", "undertime request"),
    suspend: () => rec(S.susps, "work suspension"),
    attrep: () => T.dtr(),
    attendance: () => { const per = mrList(S.periods).filter((x) => mrIn(x.start, m)); const fin = per.filter((x) => x.status === "FINAL").length; return info(`${per.length} cutoff time sheets for the month; ${fin} finalized.`, per.length, per.length && fin < per.length && monthEnd(m) < today ? "watch" : "good"); },
    clockin: () => { const k = mrList(S.clockDevs).length; return info(`${k} phones and kiosks set up for clock-in.`, k, k ? "good" : "info"); },
    geofence: () => { const r = mrList(S.punchRevs); const n = r.filter((x) => mrIn(x.d || x.at, m)).length; const open = r.filter((x) => !x.status || x.status === "PENDING").length; return { n, p: null, tone: open ? "watch" : "good", text: `${n} out-of-area punches reviewed this month; ${open} waiting.`, act: open ? "Review the waiting punches before the cutoff closes." : "" }; },
    punches: () => info("Biometric file imports feed the daily time records."),
    ot: () => { const r = req("ot", undefined, "overtime request"); if (r) r.text += ` ${M.ot.toLocaleString("en-PH")} overtime hours (${M.end ? (M.ot / M.end).toFixed(1) : 0} per person).`; if (r && M.end && M.ot / M.end > 8) { r.tone = "watch"; r.act = r.act || "Check whether sustained overtime means a staffing gap."; } return r; },
    otrep: () => ({ n: M.ot, p: P.ot, tone: M.end && M.ot / M.end > 8 ? "watch" : "good", text: `${M.ot.toLocaleString("en-PH")} overtime hours${mrVs(M.ot, P.ot)}; ${M.otApproved || 0} approved requests.`, act: "" }),
    otflow: () => T.ot(),
    leave: () => { const r = req("leave", undefined, "leave request"); const d = lvDays(m); if (r) r.text += ` ${d} leave days taken${mrVs(d, lvDays(pm))}.`; return r; },
    lvye: () => { const y = String(Number(m.slice(0, 4)) - 1); const rec_ = S.lvye?.get?.(y); return info(rec_ ? `${y} leave conversion recorded (₱${money(rec_.total || 0)}).` : m.slice(5) === "01" ? `${y} leave conversion not recorded yet.` : "Year-end conversion is done in January.", null, rec_ || m.slice(5) !== "01" ? "good" : "watch"); },
    timeSettings: () => info("Shifts, grace period and holidays; check the holiday list each year."),
    /* Payroll */
    payroll: () => ({ n: M.cost, p: P.cost, tone: P.cost && Math.abs(chg(M.cost, P.cost)) > 0.05 ? "watch" : "good", text: `Payroll cost ₱${money(M.cost)} (net ₱${money(M.net)}, ₱${money(M.perHead)} per head)${P.cost ? `, ${chgTxt(M.cost, P.cost, true)}` : ""}.`, act: P.cost && chg(M.cost, P.cost) > 0.05 ? "Explain the increase before approving the next payroll." : "", money: true }),
    payslips: () => info(`${M.paid} employees paid this month; payslips are released on finalizing each run.`, M.paid, "good"),
    t13: () => { const due = m.slice(5) === "12"; const rec_ = mrList(S.t13).find((x) => String(x.year || x.id) === m.slice(0, 4)); return info(due ? (rec_ ? "13th month pay computed for the year." : "13th month pay is due by December 24 and has not been recorded.") : "Accrues monthly; paid by December 24.", null, due && !rec_ ? "risk" : "good"); },
    finalpays: () => { const fp = dl.filter((x) => x.kind === "fp"); const late = fp.filter((x) => x.late > 0).length; return { n: fp.length, p: null, tone: late ? "risk" : fp.length ? "watch" : "good", text: `${fp.length} final pays due within two weeks${late ? `, ${late} past 30 days` : ""}.`, act: late ? "Release the overdue final pays now." : "" }; },
    wageinc: () => info("Apply new regional wage orders on their effective date; check after each RTWPB order.", null, "info"),
    reimb: () => req("rb", undefined, "reimbursement claim"),
    loans: () => { const l = mrList(S.loans).filter(ok); const a = l.filter((x) => x.status === "ACTIVE").length; const n = l.filter((x) => mrIn(x.granted, m)).length; return { n, p: l.filter((x) => mrIn(x.granted, pm)).length, tone: "good", text: `${a} active loans being deducted; ${n} new this month.`, act: "" }; },
    loanposts: () => req("lpost", undefined, "loan submission"),
    flex: () => req("flex", undefined, "FlexBen claim"),
    contrib: () => { const due = REMIT.map(([k, l]) => ({ l, d: remitDue(pm, k), done: !!S.remits?.get?.(pm)?.[k] })); const late = due.filter((x) => !x.done && x.d < today);
      return { n: due.filter((x) => x.done).length, p: null, tone: late.length ? "risk" : "good", text: `${monthLabel(pm)} filings: ${due.filter((x) => x.done).length} of ${due.length} marked filed${late.length ? `; overdue: ${late.map((x) => x.l).join(", ")}` : ""}.`, act: late.length ? "File and pay the overdue remittances to avoid penalties." : "" }; },
    tax: () => { const bir = S.remits?.get?.(pm)?.bir; return info(`BIR 1601-C for ${monthLabel(pm)} ${bir ? "is marked filed" : `is due ${fmtDate(remitDue(pm, "bir"))}`}.`, null, !bir && remitDue(pm, "bir") < today ? "risk" : "good"); },
    /* Training */
    trhome: () => { const t = train(); return { n: t.need ? Math.round((t.okN / t.need) * 100) : null, p: null, tone: t.need && t.okN / t.need < 0.8 ? "watch" : "good", text: t.need ? `${pct(t.okN / t.need, 0)} of required training current; ${t.exp} certificates expired or expiring.` : "No required courses set.", act: t.exp ? "Enroll the people with expiring certificates in the next sessions." : "" }; },
    trsessions: () => { const s = mrList(S.sessions).filter((x) => mrIn(x.d, m)); const done = s.filter((x) => x.status === "DONE").length; const open = s.filter((x) => x.status === "PLANNED" && x.d < today).length;
      return { n: s.length, p: mrList(S.sessions).filter((x) => mrIn(x.d, pm)).length, tone: open ? "watch" : "good", text: `${mrN(s.length, "session")} scheduled, ${done} completed${open ? `, ${open} past sessions still need attendance` : ""}.`, act: open ? "Mark attendance on past sessions so certificates are recorded." : "" }; },
    training: () => T.trhome(),
    trcourses: () => info(`${courses.length} courses in the catalog.`, courses.length),
    trmaterials: () => info(`${mrList(S.mats).length} training materials on file.`, mrList(S.mats).length),
    trrecords: () => T.emptraining(),
    /* Compliance */
    comply: () => ({ n: M.urgent + M.soon, p: P.urgent + P.soon, tone: M.urgent ? "risk" : M.soon ? "watch" : "good", text: `${M.urgent} urgent and ${M.soon} upcoming compliance items.`, act: M.urgent ? "Clear the urgent items this week." : "" }),
    safety: () => { const o = mrList(S.osh).filter((x) => !x.projectId || sc !== "ho"); const n = o.filter((x) => mrIn(x.d, m)).length, p = o.filter((x) => mrIn(x.d, pm)).length; const lost = o.filter((x) => mrIn(x.d, m)).reduce((a, x) => a + (x.daysLost || 0), 0); const unrep = o.filter((x) => mrIn(x.d, m) && x.daysLost && !x.reported).length;
      return { n, p, tone: unrep || lost ? "risk" : n ? "watch" : "good", text: n ? `${mrN(n, "incident")}${mrVs(n, p)}, ${lost} days lost${unrep ? `; ${unrep} lost-time incidents not yet reported to DOLE` : ""}.` : "No safety incidents this month.", act: unrep ? "Report lost-time incidents to DOLE (WAIR) and record corrective actions." : n ? "Confirm each incident has a root cause and corrective action." : "" }; },
    /* Records */
    activity: () => { const n = (S.log || []).filter((x) => mrIn(x.at, m)).length; return info(`${mrN(n, "change")} logged this month.`, n, "good"); },
    perms: () => { const u = Object.keys(S.access?.users || {}).length; return info(`${u} people have a role in the app; review access every quarter.`, u); },
  };
  const out = [];
  for (const [group, items] of NAV) {
    if (typeof navAllowed === "function" && !navAllowed(group)) continue;
    const rows = items.filter(([v]) => v !== "report").map(([v, label]) => { let r = null; try { r = T[v] ? T[v]() : null; } catch { r = null; } return { v, label, ...(r || info("No monthly figures for this page.")) }; });
    const rank = { risk: 3, watch: 2, good: 1, info: 0 }; const worst = rows.reduce((a, r) => (rank[r.tone] > rank[a] ? r.tone : a), "info");
    out.push({ group, label: GL(group), rows, tone: worst, risks: rows.filter((r) => r.tone === "risk").length, watch: rows.filter((r) => r.tone === "watch").length });
  }
  return out;
}
const MR_TONE = { ...TONE, info: ["For reference", "c-gray"] };
const mrMemo = new Map(); let mrVer = -1;
const modData = (m, sc) => { if (mrVer !== S.ver) { mrMemo.clear(); mrVer = S.ver; } const k = `${m}|${sc}`; if (!mrMemo.has(k)) mrMemo.set(k, modAnalysis(m, sc)); return mrMemo.get(k); };
const mrFig = (r) => (r.n == null ? "" : r.money ? `₱${money(r.n)}` : Number(r.n).toLocaleString("en-PH"));
function modSection(m, sc) {
  const D = modData(m, sc); const open = S.mrOpen || {};
  return `<section class="card mr"><div class="card-head"><h2>Analysis by module and submodule</h2><span class="t-muted" style="font-size:13px">${D.length} modules · ${D.reduce((a, g) => a + g.rows.length, 0)} submodules</span></div>
    <div class="mr-sum">${D.map((g) => `<button class="mr-pill" data-mr-jump="${esc(g.group)}"><span class="chip ${MR_TONE[g.tone][1]}">${MR_TONE[g.tone][0]}</span>${esc(g.label)}${g.risks ? ` <b class="t-bad">${g.risks}</b>` : ""}</button>`).join("")}</div>
    ${D.map((g) => `<details class="mr-mod" id="mr-${esc(g.group)}" ${open[g.group] ?? (g.tone === "risk" || g.tone === "watch") ? "open" : ""} data-mr-mod="${esc(g.group)}"><summary><span class="chip ${MR_TONE[g.tone][1]}">${MR_TONE[g.tone][0]}</span><b>${esc(g.label)}</b><span class="t-muted">${g.rows.length} submodules${g.risks ? ` · ${g.risks} act now` : ""}${g.watch ? ` · ${g.watch} to watch` : ""}</span></summary>
      <div class="table-wrap"><table class="mr-t"><thead><tr><th>Submodule</th><th class="num">This month</th><th class="num">Last month</th><th>Status</th><th>Analysis and action</th></tr></thead><tbody>
      ${g.rows.map((r) => `<tr><td><button class="link" data-go="${esc(r.v)}">${esc(r.label)}</button></td><td class="num" data-l="This month">${mrFig(r)}</td><td class="num" data-l="Last month">${r.p == null ? "" : r.money ? `₱${money(r.p)}` : Number(r.p).toLocaleString("en-PH")}</td><td class="mr-st"><span class="chip ${MR_TONE[r.tone][1]}">${MR_TONE[r.tone][0]}</span></td>
        <td>${esc(r.text)}${r.act ? `<div class="mr-act">→ ${esc(r.act)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div></details>`).join("")}</section>`;
}
{ const st = document.createElement("style"); st.textContent = `.mr-sum{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.mr-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line,#E3E6EE);background:transparent;border-radius:99px;padding:5px 12px 5px 6px;font:inherit;font-size:13.5px;font-weight:700;color:inherit;cursor:pointer}
.mr-mod{border-top:1px solid var(--line,#E3E6EE);padding:10px 0}.mr-mod summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;list-style:none;padding:4px 0}.mr-mod summary::-webkit-details-marker{display:none}.mr-mod summary b{font-size:16px}.mr-mod summary .t-muted{font-size:13px}
.mr-mod summary::after{content:"▾";margin-left:auto;color:var(--muted,#6A7080)}.mr-mod:not([open]) summary::after{content:"▸"}.mr-t td{vertical-align:top;font-size:14px}.mr-t td .link{text-align:left}.mr-t td:last-child{min-width:280px}.mr-t .chip{white-space:nowrap}.mr-act{margin-top:4px;font-size:13px;font-weight:600;color:#8A6A1F}
html[data-theme="dark"] .mr-act{color:#E0BE7A}@media (max-width:600px){.mr-pill{width:auto}.mr-t{min-width:0!important}.mr-t thead{display:none}.mr-t,.mr-t tbody,.mr-t tr,.mr-t td{display:block;width:auto!important}.mr-t tr{display:flex;flex-wrap:wrap;gap:4px 12px;padding:12px 0;border-bottom:1px solid var(--line,#E3E6EE)}.mr-t td{border:0!important;padding:0!important;text-align:left!important;min-width:0!important}.mr-t td:first-child{flex:1 1 100%}.mr-t td:last-child{flex:1 1 100%}.mr-t td:empty{display:none}.mr-t td.num::before{content:attr(data-l) ": ";color:var(--muted,#6A7080);font-weight:400}.mr-t td.num{font-size:13px;font-weight:700}.mr-t .mr-st{margin-left:auto}}@media print{.mr-mod{break-inside:avoid-page}.mr-mod:not([open]) > :not(summary){display:block}}`; document.head.appendChild(st); }
/* Insert the section after the Recommended actions card */
{ const b = VIEWS.report; VIEWS.report = (...a) => { const h = b(...a); const m = S.repMonth || todayISO().slice(0, 7), sc = S.repScope || "all"; let sec = ""; try { sec = modSection(m, sc); } catch (e) { sec = ""; }
  const k = '<section class="card"><div class="card-head"><h2>Management comments</h2>'; return h.includes(k) ? h.replace(k, sec + k) : h + sec; }; }
document.addEventListener("toggle", (ev) => { const d = ev.target; if (!d?.matches?.("[data-mr-mod]")) return; S.mrOpen = { ...(S.mrOpen || {}), [d.dataset.mrMod]: d.open }; }, true);
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-mr-jump]"); if (!t) return; const d = document.getElementById("mr-" + t.dataset.mrJump); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); } });
/* Downloads: Excel sheet, PDF pages and PowerPoint slides for the module analysis */
const mrRows = (m, sc) => modData(m, sc).flatMap((g) => g.rows.map((r) => [g.label, r.label, r.n == null ? "" : r.n, r.p == null ? "" : r.p, MR_TONE[r.tone][0], r.text, r.act || ""]));
{ const b = reportXlsx; reportXlsx = async (R, ...x) => { const sc = S.repScope || "all"; const rows = mrRows(R.month, sc);
  const R2 = { ...R, sections: [...R.sections, { title: "Module analysis", head: ["Module", "Submodule", "This month", "Last month", "Status", "Analysis", "Action"], rows, fmt: ["t", "t", "n", "n", "t", "t", "t"], note: "" }] }; return b(R2, ...x); }; }
const mrSecs = (m, sc, pdf) => modData(m, sc).map((g) => { const f = (v, r) => (v == null ? "" : r.money ? `${pdf ? "PHP " : "₱"}${money(v)}` : Number(v).toLocaleString("en-PH"));
  return { title: `Module analysis: ${g.label} (${MR_TONE[g.tone][0]})`, head: ["Submodule", "This month", "Last month", "Status", "Analysis and action"], fmt: ["t", "n", "n", "t", "t"], note: "",
    rows: g.rows.map((r) => [r.label, f(r.n, r), f(r.p, r), MR_TONE[r.tone][0], r.text + (r.act ? `  Action: ${r.act}` : "")]) }; });
{ const b = reportPdf; reportPdf = (R, ...x) => b({ ...R, sections: [...mrSecs(R.month, S.repScope || "all", true), ...R.sections] }, ...x); }
{ const b = reportPptx; reportPptx = (R, ...x) => b({ ...R, sections: [...mrSecs(R.month, S.repScope || "all"), ...R.sections] }, ...x); }
