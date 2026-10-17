/* ---------- PH pay rules (pure functions; also run by Node to build sample payroll) ---------- */
const PAY = (() => {
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = (s) => new Date(s + "T00:00:00");

  const DEFAULTS = {
    factor: 313, // working days a year: 313 for a six-day week, 261 for five days
    minWage: 695, // NCR daily minimum wage; earners at or below it are tax-exempt
    holidays: [
      { d: "2026-01-01", name: "New Year's Day", type: "REG" }, { d: "2026-02-17", name: "Chinese New Year", type: "SPE" },
      { d: "2026-04-02", name: "Maundy Thursday", type: "REG" }, { d: "2026-04-03", name: "Good Friday", type: "REG" },
      { d: "2026-04-04", name: "Black Saturday", type: "SPE" }, { d: "2026-04-09", name: "Araw ng Kagitingan", type: "REG" },
      { d: "2026-05-01", name: "Labor Day", type: "REG" }, { d: "2026-06-12", name: "Independence Day", type: "REG" },
      { d: "2026-08-21", name: "Ninoy Aquino Day", type: "SPE" }, { d: "2026-08-31", name: "National Heroes Day", type: "REG" },
      { d: "2026-11-01", name: "All Saints' Day", type: "SPE" }, { d: "2026-11-02", name: "All Souls' Day", type: "SPE" },
      { d: "2026-11-30", name: "Bonifacio Day", type: "REG" }, { d: "2026-12-08", name: "Immaculate Conception", type: "SPE" },
      { d: "2026-12-24", name: "Christmas Eve", type: "SPE" }, { d: "2026-12-25", name: "Christmas Day", type: "REG" },
      { d: "2026-12-30", name: "Rizal Day", type: "REG" }, { d: "2026-12-31", name: "Last day of the year", type: "SPE" },
    ],
    leaveTypes: [
      { code: "VL", name: "Vacation leave", days: 15, paid: true, note: "Covers the 5-day Service Incentive Leave" },
      { code: "SL", name: "Sick leave", days: 15, paid: true },
      { code: "ML", name: "Maternity leave", days: 105, paid: true, cal: true, sex: "F", note: "RA 11210" },
      { code: "PL", name: "Paternity leave", days: 7, paid: true, sex: "M", note: "RA 8187" },
      { code: "SP", name: "Solo parent leave", days: 7, paid: true, note: "RA 8972 as amended by RA 11861" },
      { code: "VW", name: "VAWC leave", days: 10, paid: true, sex: "F", note: "RA 9262" },
      { code: "SW", name: "Special leave for women", days: 60, paid: true, cal: true, sex: "F", note: "RA 9710" },
      { code: "LW", name: "Leave without pay", days: null, paid: false },
    ],
    shifts: [
      { id: "day", name: "Day shift", start: "08:00", end: "17:00" },
      { id: "night", name: "Night shift", start: "22:00", end: "07:00" },
    ],
    /* Recurring allowances. De minimis items are tax-free up to the cap (RR 2-98 as amended by RR 4-2025); the rest is taxable. */
    allowTypes: [
      { code: "RICE", name: "Rice subsidy", cap: 2500, per: "month" },
      { code: "LAUNDRY", name: "Laundry allowance", cap: 400, per: "month" },
      { code: "MEDCASH", name: "Medical cash allowance to dependents", cap: 2000, per: "semester" },
      { code: "TRANSPO", name: "Transportation allowance", cap: 0, per: "month" },
      { code: "COMM", name: "Communication allowance", cap: 0, per: "month" },
      { code: "SITE", name: "Site or field allowance", cap: 0, per: "month" },
    ],
    /* One-time de minimis items, entered in the time sheet's non-taxable column when paid. */
    deMinOnce: [
      { name: "Uniform and clothing allowance", cap: 8000, per: "year" }, { name: "Actual medical assistance", cap: 12000, per: "year" },
      { name: "Employee achievement awards", cap: 12000, per: "year" }, { name: "Christmas and anniversary gifts", cap: 6000, per: "year" },
      { name: "Daily meal allowance for overtime or night work", cap: null, per: "25% of the basic minimum wage" }, { name: "CBA and productivity incentives", cap: 12000, per: "year" },
    ],
    exempt13: 90000, // 13th month and other benefits exempt from tax each year
    regionWages: [{ region: "NCR", wage: 695 }],
    /* Flexible benefits: yearly credits per tier and what each item counts as for tax. */
    flexTiers: [{ code: "RF", name: "Rank and file", credits: 12000 }, { code: "SUP", name: "Supervisory", credits: 24000 }, { code: "MGR", name: "Managerial", credits: 40000 }],
    flexItems: [
      { code: "MED", name: "Medical, dental and optical", tax: "BENEFIT" }, { code: "WELL", name: "Gym and wellness", tax: "BENEFIT" },
      { code: "LEISURE", name: "Travel and leisure", tax: "BENEFIT" }, { code: "TRAIN", name: "Job-related training and certification", tax: "EXEMPT" },
      { code: "GADGET", name: "Gadgets and home appliances", tax: "TAXABLE" }, { code: "INS", name: "Personal insurance premiums", tax: "TAXABLE" },
      { code: "CASH", name: "Unused credits paid in cash", tax: "BENEFIT" },
    ],
    fbtRate: 0.35, // fringe benefit tax on the grossed-up value (RA 10963); the employer pays it, not the employee
  };
  const settings = (s) => ({ ...DEFAULTS, ...(s || {}) });

  /* Monthly contribution tables in force for 2025 onward. */
  function sss(m) {
    if (!(m > 0)) return { msc: 0, ee: 0, er: 0, ec: 0 };
    const msc = m < 5250 ? 5000 : m >= 34750 ? 35000 : 5500 + 500 * Math.floor((m - 5250) / 500);
    return { msc, ee: msc * 0.05, er: msc * 0.10, ec: msc < 15000 ? 10 : 30, wisp: Math.max(0, msc - 20000) * 0.05, wispEr: Math.max(0, msc - 20000) * 0.10 };
  }
  function philhealth(m) {
    if (!(m > 0)) return { ee: 0, er: 0 };
    const p = Math.min(Math.max(m, 10000), 100000) * 0.05;
    return { ee: p / 2, er: p / 2 };
  }
  /* vol: a higher monthly employee contribution the employee asked for (voluntary upgrade). */
  function pagibig(m, vol) {
    if (!(m > 0)) return { ee: 0, er: 0 };
    const b = Math.min(m, 10000); const ee = b * (m <= 1500 ? 0.01 : 0.02);
    return { ee: Math.max(ee, Number(vol) || 0), er: b * 0.02 };
  }
  /* BIR semi-monthly withholding table (TRAIN, 2023 onward). */
  const TAX_SEMI = [[10417, 0, 0.15], [16667, 937.5, 0.20], [33333, 4270.70, 0.25], [83333, 16770.70, 0.30], [333333, 91770.70, 0.35]];
  function taxSemi(t) {
    let tax = 0;
    for (const [lo, base, rate] of TAX_SEMI) if (t > lo) tax = base + (t - lo) * rate;
    return tax;
  }
  /* BIR annual table (TRAIN, 2023 onward), used for year-end and exit annualization. */
  function annualTax(t) {
    if (t <= 250000) return 0; if (t <= 400000) return (t - 250000) * 0.15; if (t <= 800000) return 22500 + (t - 400000) * 0.2;
    if (t <= 2000000) return 102500 + (t - 800000) * 0.25; if (t <= 8000000) return 402500 + (t - 2000000) * 0.3; return 2202500 + (t - 8000000) * 0.35;
  }
  const PER_CUTOFF = { month: 2, semester: 12, year: 24 };
  /* Order loans come off net pay: government loans first, then company loans and cash advances. */
  const LOAN_TYPES = [["SSS_SAL", "SSS salary loan"], ["SSS_CAL", "SSS calamity loan"], ["HDMF_MPL", "Pag-IBIG multi-purpose loan"], ["HDMF_CAL", "Pag-IBIG calamity loan"], ["HDMF_HOU", "Pag-IBIG housing loan"], ["COMPANY", "Company loan"], ["VALE", "Cash advance (vale)"]];

  /* Pay periods are semi-monthly: id "2026-10-1" is Oct 1-15, "2026-10-2" is Oct 16 to month end. */
  // Cached: building the label with toLocaleString is slow, and yearly pages ask for each cutoff thousands of times.
  const periodCache = new Map();
  function period(id) { let p = periodCache.get(id); if (!p) { p = periodRaw(id); periodCache.set(id, p); } return { ...p }; }
  function periodRaw(id) {
    const [y, m, h] = id.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return { id, y, m, half: h, start: `${y}-${mm}-${h === 1 ? "01" : "16"}`, end: `${y}-${mm}-${h === 1 ? "15" : last}`,
      label: `${new Date(y, m - 1, 1).toLocaleString("en-PH", { month: "short" })} ${h === 1 ? "1-15" : "16-" + last}, ${y}` };
  }
  const periodOf = (isoDate) => { const [y, m, d] = isoDate.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${d <= 15 ? 1 : 2}`; };
  const shiftPeriod = (id, n) => { const p = period(id); let k = p.y * 24 + (p.m - 1) * 2 + (p.half - 1) + n; return `${Math.floor(k / 24)}-${String(Math.floor((k % 24) / 2) + 1).padStart(2, "0")}-${(k % 2) + 1}`; };

  const isRest = (d, S) => d.getDay() === 0 || (S.factor <= 261 && d.getDay() === 6);
  function eachDay(from, to, fn) { for (let d = day(from), n = 0; !isNaN(d) && iso(d) <= to && n < 4000; d.setDate(d.getDate() + 1), n++) fn(new Date(d), iso(d)); } // a bad date or a span over 10 years stops

  /* Days a leave uses: working days (no rest days or holidays), or calendar days for long statutory leaves. */
  function leaveDays(lv, S, lt) {
    if (lv.half) return 0.5;
    let n = 0; const hol = new Set(S.holidays.map((h) => h.d));
    eachDay(lv.from, lv.to, (d, s) => { if (lt?.cal || (!isRest(d, S) && !hol.has(s))) n++; });
    return n;
  }

  /* What the calendar and approved leave say about one person in one period. */
  function autoRow(e, p, S, leaves) {
    const from = e.hire > p.start ? e.hire : p.start;
    const to = e.separated?.date && e.separated.date < p.end ? e.separated.date : p.end;
    const reg = new Set(S.holidays.filter((h) => h.type === "REG").map((h) => h.d));
    const allHol = new Set(S.holidays.map((h) => h.d));
    const types = Object.fromEntries(S.leaveTypes.map((t) => [t.code, t]));
    let wd = 0, rh = 0, lv = 0, lwop = 0;
    if (from <= to) eachDay(from, to, (d, s) => { if (isRest(d, S)) return; if (reg.has(s)) rh++; else if (!allHol.has(s)) wd++; });
    for (const l of leaves) {
      if (l.empId !== e.id || l.status !== "APPROVED" || l.to < from || l.from > to) continue;
      let n = 0;
      if (l.half) n = l.from >= from && l.from <= to ? 0.5 : 0;
      else eachDay(l.from > from ? l.from : from, l.to < to ? l.to : to, (d, s) => { if (!isRest(d, S) && !allHol.has(s)) n++; });
      if (types[l.type]?.paid === false) lwop += n; else lv += n;
    }
    const partial = from > p.start || to < p.end;
    return { wd, rh, lv, lwop, partial };
  }

  const ZERO = { abs: 0, late: 0, ut: 0, ot: 0, rd: 0, rhw: 0, sh: 0, rdot: 0, rhot: 0, rhrd: 0, dhw: 0, rhrdot: 0, dhot: 0, shrd: 0, shrdot: 0, rhx: 0, nd: 0, bp: 0, comm: 0, adj: 0, adjN: 0, ded: 0, taxAdj: 0 };
  const FIELDS = [
    ["abs", "Absent days"], ["late", "Late (min)"], ["ut", "Undertime (min)"], ["ot", "Overtime (hrs)"], ["rd", "Rest day (hrs)"],
    ["rhw", "Regular holiday worked (hrs)"], ["sh", "Special day worked (hrs)"], ["rdot", "Rest or special day OT (hrs)"], ["rhot", "Regular holiday OT (hrs)"],
    ["rhrd", "Regular holiday on rest day (hrs)"], ["dhw", "Double holiday worked (hrs)"], ["rhrdot", "Regular holiday on rest day OT (hrs)"], ["dhot", "Double holiday OT (hrs)"],
    ["shrd", "Special day on rest day (hrs)"], ["shrdot", "Special day on rest day OT (hrs)"], ["rhx", "Unpaid regular holidays (days)"], ["nd", "Night diff (hrs)"],
    ["bp", "Back pay"], ["comm", "Commission"], ["adj", "Taxable adjustment"], ["adjN", "Non-taxable allowance"], ["ded", "Other deductions"],
  ];

  /* One payslip line. Monthly-paid people get half their monthly rate each cutoff, less absences.
     Daily-paid people get days worked, paid leave and unworked regular holidays. */
  function line(e, manual, auto, S, p, x = {}) {
    const r = { ...ZERO, ...(manual || {}) };
    const isM = e.payType !== "DAILY";
    const rate = Number(e.basicPay) || 0;
    const monthly = isM ? rate : (rate * S.factor) / 12;
    const daily = isM ? (rate * 12) / S.factor : rate;
    const hourly = daily / 8;
    let basic, hol = 0, leave = 0, absent = 0, days = 0;
    if (isM) {
      const full = monthly / 2;
      const scheduled = auto.wd + auto.rh;
      basic = auto.partial ? daily * scheduled : full;
      absent = daily * (r.abs + auto.lwop);
      days = scheduled - r.abs - auto.lwop;
    } else {
      days = Math.max(0, auto.wd - auto.lv - auto.lwop - r.abs);
      basic = daily * days; hol = daily * Math.max(0, auto.rh - (Number(r.rhx) || 0)); leave = daily * auto.lv;
    }
    const tardy = (hourly * (r.late + r.ut)) / 60;
    const ot = hourly * r.ot * 1.25, rd = hourly * r.rd * 1.3, rhw = hourly * r.rhw, sh = hourly * r.sh * (isM ? 0.3 : 1.3), nd = hourly * r.nd * 0.1;
    // Regular holiday worked: 200%. The holiday's own 100% is already in the pay (monthly rate, or the daily holiday pay), so the hours add 100%.
    // Stacked premiums: OT on a rest or special day is 130% x 130%, on a regular holiday 200% x 130%, on a regular holiday that is a rest day 260% x 130%,
    // on a double holiday 300% x 130%; a special day on a rest day is 150% (x 130% for OT); a regular holiday on a rest day is 260%; a double holiday worked 300%.
    // Daily-paid staff already get 100% for an unworked regular holiday, so a worked one adds 200% for a double holiday; monthly rates already include the base day.
    const xp = hourly * (r.rdot * 1.69 + r.rhot * 2.6 + r.rhrd * (isM ? 1.6 : 2.6) + r.dhw * 2 + r.rhrdot * 3.38 + r.dhot * 3.9 + r.shrd * (isM ? 0.5 : 1.5) + r.shrdot * 1.95);
    const bp = Number(r.bp) || 0;
    const regular = Math.max(0, basic + hol + leave - absent - tardy + bp);
    const premiums = ot + rd + rhw + sh + nd + xp;
    let allowN = 0, allowT = 0;
    for (const a of e.allow || []) {
      const amt = Number(a.amt) || 0; if (!(amt > 0)) continue;
      const t = (S.allowTypes || []).find((y) => y.code === a.code); const cap = t?.cap ? t.cap / (PER_CUTOFF[t.per] || 2) : 0;
      allowN += Math.min(amt, cap); allowT += Math.max(0, amt - cap);
    }
    // FlexBen claims paid this cutoff: de minimis items are tax-free, benefit items count toward the yearly 13th month cap, the rest is taxable.
    let flexN = 0, flexE = 0, flexB = 0, flexT = 0;
    for (const f of x.flex || []) { const amt = Number(f.amt) || 0; if (f.tax === "DEMIN") flexN += amt; else if (f.tax === "EXEMPT") flexE += amt; else if (f.tax === "BENEFIT") flexB += amt; else flexT += amt; }
    const comm = Number(r.comm) || 0;
    const gross = regular + premiums + comm + r.adj + r.adjN + allowN + allowT + flexN + flexE + flexB + flexT;
    const worked = regular > 0 || premiums > 0;
    const sssBase = Math.max(monthly, 2 * (regular - bp + premiums + comm + allowT)); const c1 = sss(sssBase), c2 = philhealth(monthly), c3 = pagibig(monthly, e.hdmfVol);
    const half = worked ? 0.5 : 0;
    const L = { sss: c1.ee * half, sssEr: c1.er * half, ec: c1.ec * half, wisp: c1.wisp * half, ph: c2.ee * half, phEr: c2.er * half, hd: c3.ee * half, hdEr: c3.er * half };
    const contrib = L.sss + L.ph + L.hd;
    const mwe = daily <= (x.minWage || S.minWage);
    const taxable = Math.max(0, (mwe ? 0 : regular + premiums - contrib) + comm + r.adj + allowT + flexT);
    const tax = taxSemi(taxable) + (Number(r.taxAdj) || 0);
    // Loans come off what is left after contributions, tax and other deductions, never below zero.
    let room = gross - contrib - tax - r.ded; const loans = {}; let loanTot = 0;
    for (const ln of x.loans || []) {
      const amt = r2(Math.max(0, Math.min(ln.amort, ln.balance, room))); if (!(amt > 0)) continue;
      loans[ln.id] = amt; loanTot += amt; room -= amt;
    }
    const net = gross - contrib - tax - r.ded - loanTot;
    const out = { days, daily, basic, hol, leave, absent, tardy, bp, ot, rd, rhw, sh, nd, xp, comm, adj: r.adj, adjN: r.adjN, allowN, allowT, flexN, flexE, flexB, flexT, gross, ...L, taxable, tax, taxAdj: Number(r.taxAdj) || 0, ded: r.ded, loanTot, net, msc: c1.msc, monthly };
    for (const k in out) out[k] = r2(out[k]);
    out.mwe = mwe; if (loanTot) out.loans = loans; if ((x.flex || []).length) out.flex = x.flex.map((f) => f.id);
    return out;
  }

  /* ext.loansFor(e, p) lists loans due this period; ext.minWageFor(e) gives the regional minimum wage; ext.flexFor(e, p) lists FlexBen claims to pay. */
  function run(emps, p, rows, S, leaves, ext = {}) {
    const lines = {};
    for (const e of emps) {
      if (e.hire > p.end || (e.separated?.date && e.separated.date < p.start)) continue;
      lines[e.id] = line(e, rows[e.id], autoRow(e, p, S, leaves), S, p, { loans: ext.loansFor?.(e, p) || [], minWage: ext.minWageFor?.(e), flex: ext.flexFor?.(e, p) || [] });
    }
    const sum = (k) => r2(Object.values(lines).reduce((a, l) => a + l[k], 0));
    const totals = { count: Object.keys(lines).length };
    for (const k of ["gross", "net", "tax", "bp", "sss", "sssEr", "ec", "ph", "phEr", "hd", "hdEr", "ded", "basic", "ot", "rd", "rhw", "sh", "nd", "xp", "comm", "allowN", "allowT", "flexN", "flexE", "flexB", "flexT", "loanTot", "taxable"]) totals[k] = sum(k);
    totals.employer = r2(totals.sssEr + totals.ec + totals.phEr + totals.hdEr);
    totals.cost = r2(totals.gross + totals.employer);
    return { lines, totals };
  }

  return { r2, iso, DEFAULTS, settings, sss, philhealth, pagibig, taxSemi, annualTax, PER_CUTOFF, LOAN_TYPES, period, periodOf, shiftPeriod, isRest, eachDay, leaveDays, autoRow, line, run, ZERO, FIELDS };
})();
if (typeof module !== "undefined") module.exports = PAY;
