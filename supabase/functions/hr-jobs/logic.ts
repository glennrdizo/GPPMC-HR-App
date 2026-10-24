// GD Prime HR automatic jobs: pure rules (no network), shared by the edge function and its tests.
// Turns record changes into notices for employees, approvers and applicants, and builds HR's morning digest.
// Emails carry no pay amounts or government numbers: they say what happened and link to the app.

export type Doc = Record<string, any>;
// empId: the employee it is about, so it also reaches their linked chat (hr-bot); chatOnly: no email or SMS.
export type Notice = { id: string; kind: string; to: string; mobile?: string | null; subject: string; text: string; sms?: string; empId?: string; chat?: string };
export type Settings = {
  on: boolean; company: string; appUrl: string; careersUrl: string; digestHour: number;
  digestTo: string[]; approverTo: string[]; sms: boolean;
  kinds: { decided: boolean; approval: boolean; payslip: boolean; applicant: boolean; digest: boolean };
};
export type Ctx = {
  today: string; settings: Settings; emps: Map<string, Doc>; jobs: Map<string, Doc>;
  ops: Doc; leaveTypes: Record<string, string>; userEmail: (uid: string) => string | null;
};

export const NOTIFY_DEF: Settings = {
  on: false, company: "GD Prime Property Management Corporation", appUrl: "https://gppmc-hr-app1.vercel.app",
  careersUrl: "https://gppmc-hr-app1.vercel.app/careers", digestHour: 7, digestTo: [], approverTo: [], sms: false,
  kinds: { decided: true, approval: true, payslip: true, applicant: true, digest: true },
};
export const URL_HOSTS = ["gppmc-hr-app1.vercel.app", "hr.gd-prime.com"];
export function readSettings(d: Doc | null | undefined): Settings {
  const o = d || {};
  const list = (x: unknown) => (Array.isArray(x) ? x : String(x || "").split(/[,;\s]+/)).map((s) => String(s).trim().toLowerCase()).filter(isEmail);
  // Links and the company name go into every email: only our own https addresses, and a plain name.
  const okUrl = (u: unknown, def: string) => { try { const x = new URL(String(u || "")); return x.protocol === "https:" && URL_HOSTS.includes(x.hostname) ? x.href : def; } catch { return def; } };
  const company = String(o.company || "").replace(/[\u0000-\u001f\u007f<>]|https?:\/\/\S*/gi, " ").replace(/\s+/g, " ").trim().slice(0, 120) || NOTIFY_DEF.company;
  return { ...NOTIFY_DEF, ...o, company, appUrl: okUrl(o.appUrl, NOTIFY_DEF.appUrl), careersUrl: okUrl(o.careersUrl, NOTIFY_DEF.careersUrl), on: o.on === true, sms: o.sms === true, digestHour: Math.min(23, Math.max(0, Number(o.digestHour ?? 7) || 0)),
    digestTo: list(o.digestTo), approverTo: list(o.approverTo), kinds: { ...NOTIFY_DEF.kinds, ...(o.kinds || {}) } };
}
export const isEmail = (s: unknown) => typeof s === "string" && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(s.trim());

/* ---------- dates (Philippine time) ---------- */
export const manila = (d = new Date()) => { const t = new Date(d.getTime() + 8 * 3600e3); return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() }; };
export const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const addMonths = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmt = (s: string) => { const d = day(s); if (!d) return ""; const [y, m, dd] = d.split("-").map(Number); return `${MON[m - 1]} ${dd}, ${y}`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------- requests that wait for a decision ---------- */
// collection -> [ops kind (for target days and approval chain), label]
export const REQ: Record<string, [string, string]> = {
  leaves: ["leave", "Leave"], leavereq: ["lvreq", "Leave credit or cancellation request"], otreqs: ["ot", "Overtime request"],
  attreq: ["ar", "Attendance request"], flex: ["flex", "FlexBen claim"], reimb: ["rb", "Reimbursement"],
  empchg: ["cq", "Change request"], certreq: ["cert", "Certificate request"], resign: ["rs", "Resignation notice"],
};
const AR_KIND: Record<string, string> = { OB: "Official business request", UT: "Undertime request", SHIFT: "Change of schedule request" };
const SLA_DEF: Record<string, number> = { leave: 2, lvreq: 3, ot: 2, ar: 2, flex: 5, rb: 5, cq: 3, cert: 3, rs: 2 };
export const WATCHED = [...Object.keys(REQ), "payruns", "applicants", "periods", "remit", "apprs", "offboard"];
const DONE: Record<string, string> = { APPROVED: "was approved", REJECTED: "was not approved", DECLINED: "was not approved", DENIED: "was not approved", READY: "is ready for release", RELEASED: "was released", ACCEPTED: "was accepted" };

const nameOf = (e: Doc | null | undefined) => (e ? [e.first, e.last].filter(Boolean).join(" ") || e.name || "an employee" : "an employee");
const reqLabel = (col: string, r: Doc) => (col === "attreq" && AR_KIND[r.kind]) || REQ[col]?.[1] || "Request";
function reqWhat(col: string, r: Doc, ctx: Ctx) {
  if (col === "leaves") { const t = ctx.leaveTypes[r.type] || r.type || "Leave"; const d = r.from ? (r.to && r.to !== r.from ? `${fmt(r.from)} to ${fmt(r.to)}` : fmt(r.from)) : ""; return [t, d].filter(Boolean).join(", "); }
  const d = day(r.d) || day(r.date) || day(r.from) || ""; return d ? `for ${fmt(d)}` : "";
}
const footer = (s: Settings) => `\n\nOpen the HR app: ${s.appUrl}\n\n${s.company} · Human Resources\nThis is an automatic message. Please don't reply to it; contact HR if you have a question.`;

// A link that opens the request in the app and asks "Approve?" (app/appr.js reads #apv=<kind>:<key>). The app still applies the
// approval chain and every check; the link itself approves nothing.
export const apvLink = (s: Settings, kind: string, key: string) => `${s.appUrl.replace(/\/?$/, "/")}#apv=${encodeURIComponent(`${kind}:${key}`)}`;

function reqNotices(col: string, id: string, oldR: Doc | null, r: Doc, ctx: Ctx, key = id): Notice[] {
  const S = ctx.settings, out: Notice[] = []; const e = r.empId ? ctx.emps.get(r.empId) : null; const label = reqLabel(col, r); const what = reqWhat(col, r, ctx);
  const was = oldR?.status, now = r.status;
  if (now === "PENDING" && was !== "PENDING" && S.kinds.approval) {
    const kind = REQ[col]?.[0]; const first = (ctx.ops?.chains?.[kind] || [])[0]; const lead = first?.uid ? ctx.userEmail(first.uid) : null;
    const to = [...new Set([...(lead ? [lead] : []), ...S.approverTo])];
    for (const t of to) out.push({ id: `apv-${col}-${id}-${t}`, kind: "approval", to: t, subject: `${label} from ${nameOf(e)} needs a decision`,
      text: `${nameOf(e)}${e?.no ? ` (${e.no})` : ""} filed a ${label.toLowerCase()}${what ? ` (${what})` : ""}. It's waiting for your ${first ? `endorsement as ${first.name || "the first approver"}` : "decision"}.\n\nApprove it in one tap (sign in if asked): ${apvLink(S, kind, key)}${footer(S)}` });
  }
  if (was === "PENDING" && now && DONE[now] && S.kinds.decided && e) {
    const line = `Your ${label.toLowerCase()}${what ? ` (${what})` : ""} ${DONE[now]}.`;
    out.push({ id: `dec-${col}-${id}-${now}`, kind: "decided", to: isEmail(e.email) ? e.email.trim().toLowerCase() : "", mobile: S.sms ? e.mobile || null : null, empId: e.id, chat: `${line}${r.note || r.remarks ? `\nNote from HR: ${String(r.note || r.remarks).slice(0, 300)}` : ""}`,
      subject: `${label}: ${DONE[now].replace(/^(was|is) /, "")}`, text: `Hi ${e.first || nameOf(e)},\n\n${line}${r.note || r.remarks ? `\nNote from HR: ${String(r.note || r.remarks).slice(0, 300)}` : ""}${footer(S)}`,
      sms: `${S.company.split(" ")[0]} HR: ${line} Details in the HR app.` });
  }
  return out;
}

/* ---------- applicants ---------- */
const STAGE_MSG: Record<string, [string, string]> = {
  APPLIED: ["We received your application", "Thank you for applying for {job}. We received your application and our HR team will review it. You can follow it on our careers page."],
  REQUIREMENTS: ["Please prepare your requirements", "Good news: your application for {job} moved to the requirements stage. Please sign in to the careers page to see the documents to prepare and upload."],
  OFFER: ["Job offer for {job}", "We are pleased to let you know that we'd like to offer you the position of {job}. HR will contact you with the offer details."],
  HIRED: ["Welcome to {company}", "Welcome aboard! You are now hired for {job}. HR will send your first-day details and onboarding steps."],
  REJECTED: ["Update on your application", "Thank you for your interest in {job}. After careful review, we will not be moving forward with your application at this time. We'll keep your details on file for future openings."],
};
function appNotices(id: string, oldA: Doc | null, a: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.applicant || !isEmail(a.email) || a.sample) return [];
  const to = a.email.trim().toLowerCase(); const job = ctx.jobs.get(a.jobId)?.title || "the position"; const hi = `Hi ${a.first || "there"},\n\n`;
  const sub = (s: string) => s.replace("{job}", job).replace("{company}", S.company); const out: Notice[] = [];
  const end = `\n\nCareers page: ${S.careersUrl}\n\n${S.company} · Human Resources\nThis is an automatic message.`;
  const stage = a.stage || "APPLIED";
  if (stage !== (oldA ? oldA.stage || "APPLIED" : null) && STAGE_MSG[stage]) { const [s, t] = STAGE_MSG[stage]; const e = stage === "HIRED" && a.empId ? ctx.emps.get(a.empId) : null;
    // New hires get their employee number and how to open their employee account (approved by itself when made with this email).
    const acct = e?.no ? `\n\nYour employee number is ${e.no}${e.hire ? ` and your first day is ${fmt(e.hire)}` : ""}. To see your schedule, time records, payslips and leave on your phone, open ${S.appUrl}, sign in with the same email you used on the careers page (${to}), fill in your details with your employee number and press "Send to HR for approval". It is approved automatically.` : "";
    out.push({ id: `app-${id}-${stage}`, kind: "applicant", to, subject: sub(s), text: hi + sub(t) + acct + end }); }
  const had = new Set((oldA?.ivs || []).map((i: Doc) => i.id));
  for (const iv of a.ivs || []) { if (had.has(iv.id) || iv.result !== "PENDING" || !day(iv.d) || day(iv.d) < ctx.today) continue;
    const k = String(iv.kind || "Interview"); out.push({ id: `iv-${id}-${iv.id}`, kind: "applicant", to, subject: `${k} schedule for ${job}`,
      text: `${hi}Your ${k.toLowerCase()} for ${job} is set on ${fmt(iv.d)}${iv.t ? ` at ${iv.t}` : ""}${iv.by ? ` with ${iv.by}` : ""}. Please be on time and bring a valid ID. If you can't make it, please reply through the careers page or contact HR.${end}` }); }
  return out;
}
// The applicant answered the job offer on the careers page: tell HR (the approvers and the digest list).
function offerNotices(id: string, oldA: Doc | null, a: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; const st = a.offer?.status; if (!S.kinds.approval || a.sample || a.offer?.via !== "careers" || !["ACCEPTED", "DECLINED"].includes(st) || oldA?.offer?.status === st) return [];
  const job = ctx.jobs.get(a.jobId)?.title || "the position"; const who = [a.first, a.last].filter(Boolean).join(" ") || "An applicant";
  return [...new Set([...S.approverTo, ...S.digestTo])].map((addr) => ({ id: `offer-${id}-${st}-${addr}`, kind: "approval", to: addr,
    subject: `${who} ${st === "ACCEPTED" ? "accepted" : "declined"} the job offer for ${job}`,
    text: `${who} ${st === "ACCEPTED" ? "accepted" : "declined"} the job offer for ${job} on the careers page.${st === "ACCEPTED" ? "\n\nOnce every pre-employment requirement is accepted in the app, the 201 file and onboarding are made by itself (unless hiring by itself is switched off)." : ""}${footer(S)}` }));
}

/* ---------- payslips ---------- */
function payNotices(id: string, oldP: Doc | null, p: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.payslip) return [];
  const before = new Set(Object.keys(oldP?.lines || {})); const out: Notice[] = []; const period = p.start && p.end ? `${fmt(p.start)} to ${fmt(p.end)}` : id;
  for (const empId of Object.keys(p.lines || {})) { if (before.has(empId)) continue; const e = ctx.emps.get(empId); if (!e) continue;
    out.push({ id: `pay-${id}-${empId}`, kind: "payslip", to: isEmail(e.email) ? e.email.trim().toLowerCase() : "", mobile: S.sms ? e.mobile || null : null, empId, chat: `Your payslip for ${period} is ready. Open My payslips in the HR app to view it.`,
      subject: `Your payslip for ${period} is ready`, text: `Hi ${e.first || nameOf(e)},\n\nYour payslip for ${period} is ready. Sign in to the HR app and open My payslips to view it.${footer(S)}`,
      sms: `${S.company.split(" ")[0]} HR: Your payslip for ${period} is ready in the HR app.` }); }
  return out;
}

/* ---------- payroll cutoff ready for approval (app/payauto.js writes periods/<id>.auto) ---------- */
function periodNotices(id: string, oldP: Doc | null, p: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.approval || !p.auto?.ready || oldP?.auto?.ready || p.status === "FINAL") return [];
  const to = [...new Set([...S.approverTo, ...S.digestTo])]; const period = p.start && p.end ? `${fmt(p.start)} to ${fmt(p.end)}` : id;
  return to.map((addr) => ({ id: `payready-${id}-${addr}`, kind: "approval", to: addr, subject: `Payroll for ${period} is ready for approval`,
    text: `Payroll for ${period} has passed every check: time records read, no requests waiting, no timekeeping issues, and everyone has basic pay${p.auto.count ? ` (${p.auto.count} employees)` : ""}.\n\nOpen Payroll in the HR app to review it and press Approve and finalize. Payslips are released when it is finalized.${footer(S)}` }));
}

/* ---------- the month's government filing pack is ready (app/remit.js writes remit/<month>.pack) ---------- */
function remitNotices(month: string, oldR: Doc | null, r: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.digest || !r.pack || oldR?.pack) return [];
  const due = r.pack.due || {}; const miss = r.pack.missing || {}; const nMiss = Object.values(miss).reduce((a: number, b) => a + (Number(b) || 0), 0);
  const label = (() => { const [y, m] = month.split("-").map(Number); return `${MON_LONG[m - 1] || month} ${y}`; })();
  const lines = REMIT.map(([k, l]) => `- ${l}: due ${due[k] ? fmt(due[k]) : "see the app"}${miss[k] ? ` (${miss[k]} ${Number(miss[k]) === 1 ? "person" : "people"} without an ID number)` : ""}`).join("\n");
  return S.digestTo.map((addr) => ({ id: `remit-${month}-${addr}`, kind: "digest", to: addr, subject: `Government remittances for ${label} are ready to file`,
    text: `Both payroll cutoffs for ${label} are final, and the filing files are ready on the Gov't Contributions page of the HR app:\n\n${lines}\n\n${nMiss ? "Add the missing ID numbers in the 201 files before uploading. " : ""}Press Mark filed on each one after filing to stop the reminders.${footer(S)}` }));
}

/* ---------- an endorsement was recorded (app/ops.js apprs/<kind>--<key>): tell the next level, or the final approvers ---------- */
const KIND_LABEL: Record<string, string> = { ...Object.fromEntries(Object.values(REQ).map(([k, l]) => [k, l])), si: "Salary increment", pf: "Personnel action" };
function apprNotices(oldA: Doc | null, a: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.approval || a.final || !a.kind || a.key == null) return [];
  const n = (a.steps || []).length; if (n <= (oldA?.steps || []).length) return [];
  const chain = ctx.ops?.chains?.[a.kind] || []; const next = chain[n]; const label = KIND_LABEL[a.kind] || "Request"; const by = a.steps[n - 1]?.name || "the previous level";
  const to = next ? [next.uid ? ctx.userEmail(next.uid) : null].filter(Boolean) as string[] : S.approverTo;
  const fallback = next && !to.length ? S.approverTo : [];
  return [...new Set([...to, ...fallback])].map((addr) => ({ id: `apv-${a.kind}-${String(a.key)}-${n}-${addr}`, kind: "approval", to: addr,
    subject: `${label} endorsed by ${by}: ${next ? `needs ${next.name || "your endorsement"}` : "ready for final approval"}`,
    text: `A ${label.toLowerCase()} was endorsed by ${by} and now ${next ? `needs endorsement by ${next.name || "you"}` : "needs the final decision"}.\n\nApprove it in one tap (sign in if asked): ${apvLink(S, a.kind, String(a.key))}${footer(S)}` }));
}

/* ---------- exit clearance (app/offb.js): each signer gets their steps; approvers hear when clearance is done ---------- */
export const CLR_AFTER = ["finalpay", "coe", "bir2316"]; // steps that come after clearance
function offbNotices(empId: string, oldO: Doc | null, o: Doc, ctx: Ctx): Notice[] {
  const S = ctx.settings; if (!S.kinds.approval || o.closed || o.sample) return []; const e = ctx.emps.get(o.empId || empId); if (!e) return [];
  const who = `${nameOf(e)}${e.no ? ` (${e.no})` : ""}`; const out: Notice[] = []; const clrTo = ctx.ops?.clrTo || {};
  const had = new Set((oldO?.items || []).map((i: Doc) => i.k)); const fresh = (o.items || []).filter((i: Doc) => !i.done && !had.has(i.k) && !CLR_AFTER.includes(i.k));
  const byWho = new Map<string, Doc[]>(); for (const i of fresh) { const to = clrTo[i.who] ? ctx.userEmail(clrTo[i.who]) : null; if (to) byWho.set(to, [...(byWho.get(to) || []), i]); }
  for (const [to, items] of byWho) out.push({ id: `clr-${empId}-${items.map((i) => i.k).join(".")}-${to}`, kind: "approval", to, subject: `Exit clearance for ${who}: ${plural(items.length, "step")} for you`,
    text: `${who} is leaving${o.last ? ` (last day ${fmt(o.last)})` : ""}. Please clear these steps:\n\n${items.map((i) => `- ${i.label}\n  Mark it cleared in one tap (sign in if asked): ${S.appUrl.replace(/\/?$/, "/")}#clr=${encodeURIComponent(`${empId}:${i.k}`)}`).join("\n")}${footer(S)}` });
  const clr = (x: Doc | null) => !!x && (x.items || []).filter((i: Doc) => !CLR_AFTER.includes(i.k)).every((i: Doc) => i.done);
  if (clr(o) && !clr(oldO) && !o.released) for (const to of new Set([...S.approverTo, ...S.digestTo]))
    out.push({ id: `clrdone-${empId}-${to}`, kind: "approval", to, subject: `Exit clearance done for ${who}: final pay can be released`,
      text: `Every clearance step for ${who} is done. Open Final pay in the HR app to check and release the final pay${o.last ? ` (due by ${fmt(addDays(o.last, 30))}, 30 days after the last day)` : ""}, then issue the Certificate of Employment and BIR 2316.${footer(S)}` });
  return out;
}

/* ---------- one changed record -> notices ---------- */
export function eventNotices(ev: { path: string; col: string; old: Doc | null; new: Doc | null }, ctx: Ctx): Notice[] {
  const n = ev.new; if (!n) return []; const id = ev.path.split("/").slice(1).join("_");
  if (ev.col === "leaves") { const out: Notice[] = []; const was = ev.old?.items || {};
    for (const [k, l] of Object.entries(n.items || {})) if (l && typeof l === "object" && !(l as Doc).sample) out.push(...reqNotices("leaves", k, was[k] || null, l as Doc, ctx, `${ev.path.split("/")[1]}:${k}`)); return out; }
  if (n.sample) return [];
  if (REQ[ev.col]) return reqNotices(ev.col, id, ev.old, n, ctx);
  if (ev.col === "applicants") return [...appNotices(id, ev.old, n, ctx), ...offerNotices(id, ev.old, n, ctx)];
  if (ev.col === "payruns") return payNotices(id, ev.old, n, ctx);
  if (ev.col === "periods") return periodNotices(id, ev.old, n, ctx);
  if (ev.col === "remit") return remitNotices(id, ev.old, n, ctx);
  if (ev.col === "apprs") return apprNotices(ev.old, n, ctx);
  if (ev.col === "offboard") return offbNotices(id, ev.old, n, ctx);
  return [];
}

/* ---------- HR's morning digest ---------- */
// pay: pay/employees--<id> records (basic pay), when read; apprs: endorsements recorded so far (app/ops.js).
export type All = { emps: Doc[]; leaves: Doc[]; reqs: Record<string, Doc[]>; offboard: Doc[]; contracts: Doc[]; cases: Doc[]; remit: Map<string, Doc>; payruns: Set<string>; projects: Map<string, Doc>; pay?: Map<string, Doc>; apprs?: Map<string, Doc> };
const REMIT: [string, string][] = [["sss", "SSS contributions"], ["ph", "PhilHealth premiums"], ["hdmf", "Pag-IBIG contributions"], ["bir", "BIR 1601-C withholding tax"]];
export function remitDue(month: string, k: string, due: Record<string, number>) {
  const [y, m] = month.split("-").map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; const d = Number(due[k]) || 0;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); return `${ny}-${String(nm).padStart(2, "0")}-${String(d > 0 ? Math.min(d, last) : last).padStart(2, "0")}`;
}
export function cutoffOf(dateISO: string) { const [y, m, d] = dateISO.split("-").map(Number); const mm = `${y}-${String(m).padStart(2, "0")}`; const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= 15 ? { id: `${mm}-1`, start: `${mm}-01`, end: `${mm}-15` } : { id: `${mm}-2`, start: `${mm}-16`, end: `${mm}-${last}` }; }

export function digestSections(A: All, ctx: Ctx) {
  const T = ctx.today, O = ctx.ops || {}, sla = { ...SLA_DEF, ...(O.sla || {}) }, due = { sss: 0, ph: 15, hdmf: 15, bir: 10, ...(O.due || {}) };
  const emp = new Map(A.emps.map((e) => [e.id, e])); const act = A.emps.filter((e) => !e.separated && !e.sample);
  const who = (e: Doc | undefined) => (e ? `${nameOf(e)}${e.no ? ` (${e.no})` : ""}` : "Unknown employee");
  const sec: { title: string; lines: string[] }[] = []; const add = (title: string, lines: [number, string][]) => { if (lines.length) sec.push({ title, lines: lines.sort((a, b) => b[0] - a[0]).map((x) => x[1]) }); };

  const late: [number, string][] = [];
  const pend = (col: string, r: Doc) => { if (r.status !== "PENDING" || r.sample) return; const e = emp.get(r.empId); if (r.empId && (!e || e.separated)) return;
    const filed = day(r.filed) || day(r.d) || day(r.date); if (!filed) return; const kind = REQ[col][0]; const over = daysBetween(addDays(filed, Number(sla[kind]) || 3), T);
    if (over > 0) late.push([over, `${reqLabel(col, r)}: ${who(e)}, filed ${fmt(filed)}, ${plural(over, "day")} past target`]); };
  for (const l of A.leaves) pend("leaves", l); for (const [col, list] of Object.entries(A.reqs)) for (const r of list) pend(col, r);
  add("Requests past their target time", late);

  const gov: [number, string][] = []; const m0 = T.slice(0, 7), prev = addDays(`${m0}-01`, -1).slice(0, 7);
  for (const month of [prev, m0]) { const done = A.remit.get(month) || {}; for (const [k, l] of REMIT) { if (done[k]) continue; const d = remitDue(month, k, due); const left = daysBetween(T, d); if (left > 5) continue;
    gov.push([-left, `${l} for ${month}: ${left < 0 ? `${plural(-left, "day")} overdue (due ${fmt(d)})` : left === 0 ? "due today" : `due ${fmt(d)}`}`]); } }
  if (act.length) add("Government filings not yet marked filed", gov);

  const pay: [number, string][] = []; const c = cutoffOf(T), pc = cutoffOf(addDays(c.start, -1));
  if (act.length && !A.payruns.has(pc.id)) pay.push([daysBetween(pc.end, T), `Payroll for ${fmt(pc.start)} to ${fmt(pc.end)} is not finalized yet (cutoff ended ${fmt(pc.end)})`]);
  if (act.length && daysBetween(T, c.end) <= 1 && !A.payruns.has(c.id)) pay.push([0, `Cutoff ${fmt(c.start)} to ${fmt(c.end)} ends ${c.end === T ? "today" : "tomorrow"}: check time records, overtime and leave`]);
  // HR helper: what would hold up the payroll that is due next (the open cutoff ending within 3 days, or the last one not finalized).
  const nx = !A.payruns.has(pc.id) ? pc : daysBetween(T, c.end) <= 3 && !A.payruns.has(c.id) ? c : null;
  if (act.length && nx) {
    const label = `${fmt(nx.start)} to ${fmt(nx.end)}`;
    if (A.pay) { const none = act.filter((e) => !(Number(A.pay!.get(e.id)?.basicPay) > 0) && !(Number(e.basicPay) > 0) && (!day(e.hire) || e.hire <= nx.end));
      if (none.length) pay.push([1, `${plural(none.length, "employee")} without basic pay for the ${label} payroll${none.length <= 5 ? `: ${none.map(who).join(", ")}` : ` (for example ${none.slice(0, 3).map(who).join(", ")})`}`]); }
    const inCut = (r: Doc) => { const d = day(r.from) || day(r.d) || day(r.date); const d2 = day(r.to) || d; return !!d && d <= nx.end && d2 >= nx.start; };
    const waiting = [...A.leaves.filter((l) => l.status === "PENDING" && inCut(l)), ...["otreqs", "attreq"].flatMap((k) => (A.reqs[k] || []).filter((r) => r.status === "PENDING" && inCut(r)))].filter((r) => !r.sample && emp.get(r.empId) && !emp.get(r.empId)!.separated);
    if (waiting.length) pay.push([1, `${plural(waiting.length, "leave, overtime or attendance request")} for ${label} still waiting for a decision`]);
  }
  add("Payroll", pay);

  const fp: [number, string][] = [];
  for (const o of A.offboard) { const e = emp.get(o.empId); if (!e || o.released || !day(o.last) || o.sample) continue; if (!e.separated && o.last > T) continue;
    const d = addDays(o.last, 30), left = daysBetween(T, d); if (left <= 7) fp.push([-left, `Final pay for ${who(e)}: ${left < 0 ? `${plural(-left, "day")} past the 30-day deadline` : `due ${fmt(d)}`} (last day ${fmt(o.last)})`]); }
  add("Final pay", fp);

  const ctr: [number, string][] = []; const offIds = new Set(A.offboard.map((o) => o.empId)); const soon = addDays(T, 14);
  const latest = new Map<string, Doc>(); for (const k of A.contracts) { const p = latest.get(k.empId); if (!p || (k.start || "") > (p.start || "")) latest.set(k.empId, k); }
  for (const e of act) { if (offIds.has(e.id)) continue; let end = "";
    if (e.status === "PROBATIONARY" && day(e.hire)) { const r = addMonths(e.hire, 6); if (r <= soon) ctr.push([-daysBetween(T, r), `Regularization of ${who(e)}: ${r < T ? `was due ${fmt(r)}` : `due ${fmt(r)}`} (6 months from hire)`]); continue; }
    if (e.status === "PROJECT_BASED") end = day(e.projectUntil) || day(A.projects.get(e.projectId)?.end);
    else if (e.status === "CONTRACTUAL" || e.status === "CASUAL") end = day(e.contractEnd) || day(latest.get(e.id)?.end);
    if (end && end <= soon) ctr.push([-daysBetween(T, end), `Contract of ${who(e)} ${end < T ? `ended ${fmt(end)} with no renewal or exit recorded` : `ends ${fmt(end)}`}`]); }
  add("Contracts and regularization", ctr);

  const docs: [number, string][] = []; const in30 = addDays(T, 30);
  for (const e of act) for (const d of e.docs || []) { const x = day(d?.exp); if (x && x <= in30) docs.push([-daysBetween(T, x), `${d.name || d.kind || "Document"} of ${who(e)} ${x < T ? "expired" : "expires"} ${fmt(x)}`]); }
  add("Documents expiring in 30 days", docs.slice(0, 200));

  const er: [number, string][] = []; const nteDays = Number(O.nteDays) || 5, decDays = Number(O.decDays) || 15;
  for (const k of A.cases) { const e = emp.get(k.empId); if (!e || !day(k.nte) || k.decision || k.sample) continue;
    if (!k.reply) { const d = addDays(k.nte, nteDays); if (d <= addDays(T, 1)) er.push([-daysBetween(T, d), `Written reply of ${who(e)} to the notice to explain ${d < T ? `was due ${fmt(d)}` : `is due ${fmt(d)}`}`]); }
    const dd = addDays(day(k.reply?.d) || addDays(k.nte, nteDays), decDays); if (dd <= addDays(T, 3)) er.push([-daysBetween(T, dd), `Decision on the case of ${who(e)} ${dd < T ? `was due ${fmt(dd)}` : `is due ${fmt(dd)}`}`]); }
  add("Disciplinary cases", er);
  return sec;
}
/* ---------- requests past target + escalation days: one email per request to the person set in Needs action > Rules ---------- */
export function escalationNotices(A: All, ctx: Ctx): Notice[] {
  const S = ctx.settings, O = ctx.ops || {}; if (!S.kinds.approval || !O.escTo) return [];
  const to = ctx.userEmail(O.escTo); if (!to) return []; const sla = { ...SLA_DEF, ...(O.sla || {}) }; const escDays = Number(O.escDays) || 0;
  const emp = new Map(A.emps.map((e) => [e.id, e])); const out: Notice[] = [];
  const one = (col: string, r: Doc, key: string) => { if (r.status !== "PENDING" || r.sample) return; const e = emp.get(r.empId); if (r.empId && (!e || e.separated)) return;
    const filed = day(r.filed) || day(r.d) || day(r.date); if (!filed) return; const kind = REQ[col][0]; const late = daysBetween(addDays(filed, Number(sla[kind]) || 3), ctx.today);
    if (late <= escDays) return; const label = reqLabel(col, r);
    out.push({ id: `esc-${col}-${key}`, kind: "approval", to, subject: `Escalated: ${label} from ${nameOf(e)}, ${plural(late, "day")} past target`,
      text: `${nameOf(e)}${e?.no ? ` (${e.no})` : ""} filed a ${label.toLowerCase()}${reqWhat(col, r, ctx) ? ` (${reqWhat(col, r, ctx)})` : ""} on ${fmt(filed)}. It is ${plural(late, "day")} past its target and was escalated to you.\n\nApprove it in one tap (sign in if asked): ${apvLink(S, kind, key)}${footer(S)}` }); };
  for (const l of A.leaves) one("leaves", l, `${l.month}:${l.id}`);
  for (const [col, list] of Object.entries(A.reqs)) for (const r of list) one(col, r, String(r.id));
  return out.slice(0, 60);
}

/* ---------- HR helper: once a day, each approver gets one message listing what has waited past its target for them ---------- */
// The approver is the next level of the request's approval chain (Needs action > Rules), or the approver list when there is no chain.
export function chaseNotices(A: All, ctx: Ctx): Notice[] {
  const S = ctx.settings, O = ctx.ops || {}; const sla = { ...SLA_DEF, ...(O.sla || {}) };
  const emp = new Map(A.emps.map((e) => [e.id, e])); const by = new Map<string, string[]>();
  const one = (col: string, r: Doc, key: string) => { if (r.status !== "PENDING" || r.sample) return; const e = emp.get(r.empId); if (r.empId && (!e || e.separated)) return;
    const filed = day(r.filed) || day(r.d) || day(r.date); if (!filed) return; const kind = REQ[col][0]; const late = daysBetween(addDays(filed, Number(sla[kind]) || 3), ctx.today); if (late <= 0) return;
    const chain = O.chains?.[kind] || []; const done = (A.apprs?.get(`${kind}--${key}`)?.steps || []).length; const next = chain[done];
    const to = next ? [next.uid ? ctx.userEmail(next.uid) : null].filter(Boolean) as string[] : S.approverTo;
    for (const t of to.length ? to : S.approverTo) by.set(t, [...(by.get(t) || []), `• ${reqLabel(col, r)} from ${nameOf(e)}${reqWhat(col, r, ctx) ? ` (${reqWhat(col, r, ctx)})` : ""}, ${plural(late, "day")} past target\n  ${apvLink(S, kind, key)}`]); };
  for (const l of A.leaves) one("leaves", l, `${l.month}:${l.id}`);
  for (const [col, list] of Object.entries(A.reqs)) for (const r of list) one(col, r, String(r.id));
  return [...by].map(([to, lines]) => ({ id: `chase-${ctx.today}-${to}`, kind: "approval", to, subject: `Reminder: ${plural(lines.length, "request")} waiting for you`,
    text: `Good morning. These requests are past their target time and are waiting for your decision:\n\n${lines.slice(0, 30).join("\n")}${lines.length > 30 ? `\n…and ${lines.length - 30} more in the app` : ""}\n\nOpen each link to approve in one tap (sign in if asked).${footer(S)}`,
    chat: `Reminder: ${plural(lines.length, "request")} waiting for your decision, past target:\n${lines.slice(0, 10).map((l) => l.split("\n")[0]).join("\n")}${lines.length > 10 ? `\n…and ${lines.length - 10} more` : ""}\n\nApprove them in the HR app: Overview > Needs action.` }));
}

export function digestNotices(A: All, ctx: Ctx): { notices: Notice[]; count: number } {
  const S = ctx.settings; const sec = digestSections(A, ctx); const count = sec.reduce((a, s) => a + s.lines.length, 0);
  if (!S.kinds.digest || !count || !S.digestTo.length) return { notices: [], count };
  const MAX = 25; const body = sec.map((s) => `${s.title} (${s.lines.length})\n${s.lines.slice(0, MAX).map((l) => `  • ${l}`).join("\n")}${s.lines.length > MAX ? `\n  …and ${s.lines.length - MAX} more in the app` : ""}`).join("\n\n");
  const text = `Good morning. Here is what needs HR's attention today, ${fmt(ctx.today)}.\n\n${body}\n\nThe full list is on Overview > Needs action.${footer(S)}`;
  return { count, notices: S.digestTo.map((to) => ({ id: `dig-${ctx.today}-${to}`, kind: "digest", to, subject: `HR to-do for ${fmt(ctx.today)}: ${plural(count, "item")}`, text })) };
}

// Morning reminder for an employee whose time records have issues to fix before payroll.
export function fixReminder(sum: Doc | null): string | null {
  const it = (sum?.fix?.items || []).filter((i: Doc) => !i.wait); if (!it.length) return null;
  return `Hi ${sum?.first || ""}! Before payroll${sum?.fix?.due ? ` (cutoff ends ${fmt(sum.fix.due)})` : ""}, please fix:\n${it.slice(0, 8).map((i: Doc) => `• ${fmt(i.d)}: ${i.text}`).join("\n")}${it.length > 8 ? `\n…and ${it.length - 8} more` : ""}\n\nReply here, for example "I timed out at 5:30 pm on ${fmt(it[0].d)}", and I'll prepare the request for you.`.replace("Hi !", "Hi!");
}


/* ---------- message formats ---------- */
const escH = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
export const toHtml = (text: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#14213D;max-width:620px">${escH(text).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}</div>`;
// Philippine mobile numbers to the 09XXXXXXXXX form SMS gateways take; anything else is dropped.
export const phMobile = (s: unknown) => { const d = String(s || "").replace(/\D/g, ""); const m = d.startsWith("63") ? "0" + d.slice(2) : d.startsWith("9") && d.length === 10 ? "0" + d : d; return /^09\d{9}$/.test(m) ? m : null; };
// Outbox ids are kept to the characters the app allows in record ids.
export const outId = (id: string) => id.toLowerCase().replace(/[^a-z0-9_.@-]/g, "_").slice(0, 180);
