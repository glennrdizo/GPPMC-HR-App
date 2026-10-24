// GD Prime HR bots: pure rules (no network), shared by the hr-bot function and web/test-bots.mjs.
// Reads chat events, recognises commands, builds the prompts and checks what the assistant proposes before anything is filed.

export type Doc = Record<string, any>;
export type ChatIn = { sender: string; name?: string; text: string; start?: boolean };

/* ---------- incoming events ---------- */
export function parseViber(j: Doc): ChatIn[] {
  if (!j || typeof j !== "object") return [];
  if (j.event === "message" && j.sender?.id) return [{ sender: String(j.sender.id), name: str(j.sender.name, 80), text: j.message?.type === "text" ? str(j.message.text, 1500) : "" }];
  if ((j.event === "conversation_started" || j.event === "subscribed") && j.user?.id) return [{ sender: String(j.user.id), name: str(j.user.name, 80), text: "", start: true }];
  return [];
}
export function parseMessenger(j: Doc): ChatIn[] {
  const out: ChatIn[] = [];
  if (j?.object !== "page") return out;
  for (const e of Array.isArray(j.entry) ? j.entry : []) for (const m of Array.isArray(e.messaging) ? e.messaging : []) {
    const id = m?.sender?.id; if (!id || m.message?.is_echo) continue;
    const text = m.message?.quick_reply?.payload || m.message?.text || m.postback?.payload || "";
    if (m.postback?.payload === "GET_STARTED") { out.push({ sender: String(id), text: "", start: true }); continue; }
    out.push({ sender: String(id), text: str(text, 1500) });
  }
  return out;
}
const str = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);

/* ---------- commands ---------- */
export type Intent = { k: "link"; code: string } | { k: "yes" } | { k: "no" } | { k: "unlink" } | { k: "help" } | null;
export function intent(text: string): Intent {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  const m = /^(?:link|code|ikonekta)?\s*[:#-]?\s*(\d{6})$/.exec(t); if (m) return { k: "link", code: m[1] };
  if (/^(yes|y|oo|opo|sige|send|send it|yes, send it|confirm|ok)$/.test(t)) return { k: "yes" };
  if (/^(no|n|hindi|cancel|huwag|wag|don'?t send)$/.test(t)) return { k: "no" };
  if (/^(unlink|disconnect|stop bot)$/.test(t)) return { k: "unlink" };
  if (/^(help|menu|tulong|hi|hello|start)$/.test(t)) return { k: "help" };
  return null;
}
export const YES_NO = [{ label: "Yes, send it", reply: "YES" }, { label: "Cancel", reply: "NO" }];
export const HELP_EMP = "I'm the GD Prime HR bot. You can ask me about your leave balance, payslips, schedule, loans and company policies, or tell me what to file: leave, overtime, a time correction or a certificate. I always ask before sending anything to HR.";
export const HELP_HR = "I'm the GD Prime HR helper. Ask me what's waiting for approval, who needs follow-up, or what to fix before payroll. I also send you the morning summary and approvals here.";
export const notLinkedText = (app: string) => `Hi! This is GD Prime HR. To use this chat, sign in to the HR app (${app}), open "Connect Viber or Messenger" on your home page or on Overview > Bots, and send me the 6-digit code it shows.`;

/* ---------- what the employee assistant can propose ---------- */
export const EMP_TOOLS = [
  { name: "file_request", description: "Prepare a request to send to HR for this employee. It is NOT sent yet: the employee confirms first. Use for leave, overtime, a time correction (attendance change) or a certificate. Ask for missing details first.",
    input_schema: { type: "object", properties: {
      kind: { type: "string", enum: ["leave", "ot", "adjust", "cert"] },
      leave_type: { type: "string", description: "Leave code from the list given, for kind=leave" },
      from: { type: "string", description: "YYYY-MM-DD, first day of leave" }, to: { type: "string", description: "YYYY-MM-DD, last day of leave" },
      half_day: { type: "boolean" }, date: { type: "string", description: "YYYY-MM-DD, for overtime or time correction" },
      hours: { type: "number", description: "Overtime hours" }, time_in: { type: "string", description: "HH:MM 24-hour, time correction" }, time_out: { type: "string", description: "HH:MM 24-hour, time correction" },
      cert_type: { type: "string", enum: ["COE", "COEC", "SERVICE", "CLEAR", "2316", "CONTRIB"], description: "COE = certificate of employment, COEC = with compensation, SERVICE = service record, CLEAR = clearance, 2316 = BIR 2316 copy, CONTRIB = SSS/PhilHealth/Pag-IBIG contributions" },
      purpose: { type: "string" }, copies: { type: "number" }, reason: { type: "string" } }, required: ["kind"] } },
  { name: "ask_hr", description: "Prepare a question or concern to send to a person in HR (Ask HR). Not sent until the employee confirms. Use when it needs a person: complaints, corrections, decisions, anything not in the data.",
    input_schema: { type: "object", properties: { subject: { type: "string" }, message: { type: "string" } }, required: ["subject", "message"] } },
];
const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmt = (d: string) => { if (!ISO.test(d || "")) return d || ""; const [y, m, dd] = d.split("-").map(Number); return `${MON[m - 1]} ${dd}, ${y}`; };
// Same codes as CERTS in app/empx.js.
const CERT_NAME: Record<string, string> = { COE: "Certificate of employment", COEC: "Certificate of employment with compensation", SERVICE: "Service record", CLEAR: "Clearance certificate", "2316": "BIR 2316 copy", CONTRIB: "Certificate of SSS, PhilHealth and Pag-IBIG contributions" };
export type Proposal = { what: "req"; rec: Doc; summary: string } | { what: "ticket"; subject: string; text: string; summary: string };
// Checks a proposal against the same rules the app's forms use; returns what to ask the employee to confirm, or what's wrong.
export function checkProposal(name: string, x: Doc, o: { today: string; leave: [string, string][] }): Proposal | { error: string } {
  if (name === "ask_hr") { const subject = str(x.subject, 110), text = str(x.message, 2000); if (!subject || !text) return { error: "Give a subject and the message." };
    return { what: "ticket", subject, text, summary: `Send this to HR (Ask HR)?\n\n"${subject}"\n${text.slice(0, 400)}` }; }
  if (name !== "file_request") return { error: "Unknown action." };
  const kind = x.kind, reason = str(x.reason, 200), at = new Date().toISOString(), T = o.today;
  if (kind === "leave") {
    const codes = new Map(o.leave); const type = String(x.leave_type || "").toUpperCase(); const from = String(x.from || ""), to = String(x.to || x.from || "");
    if (!codes.has(type)) return { error: `Ask which leave: ${o.leave.map(([c, n]) => `${n} (${c})`).join(", ")}.` };
    if (!ISO.test(from) || !ISO.test(to) || to < from) return { error: "Ask for the leave dates (first and last day)." };
    if (from < addDays(T, -60) || to > addDays(T, 366)) return { error: "Those dates are too far from today. Check them with the employee." };
    if (!reason) return { error: "Ask for the reason." };
    const half = !!x.half_day && from === to;
    return { what: "req", rec: { kind, type, from, to, half, reason, at }, summary: `File ${codes.get(type)} ${from === to ? `on ${fmt(from)}${half ? " (half day)" : ""}` : `from ${fmt(from)} to ${fmt(to)}`}?\nReason: ${reason}` };
  }
  if (kind === "ot") {
    const d = String(x.date || ""), h = Math.round(Number(x.hours) * 2) / 2;
    if (!ISO.test(d) || d > T || d < addDays(T, -45)) return { error: "Ask for the overtime date (today or earlier, within the last 45 days)." };
    if (!(h >= 0.5 && h <= 16)) return { error: "Ask how many overtime hours (0.5 to 16)." };
    if (!reason) return { error: "Ask what the overtime was for." };
    return { what: "req", rec: { kind, d, hours: h, reason, at }, summary: `File ${h} hour${h === 1 ? "" : "s"} of overtime on ${fmt(d)}?\nReason: ${reason}` };
  }
  if (kind === "adjust") {
    const d = String(x.date || ""), tin = HM.test(x.time_in || "") ? x.time_in : null, tout = HM.test(x.time_out || "") ? x.time_out : null;
    if (!ISO.test(d) || d > T || d < addDays(T, -45)) return { error: "Ask for the date to correct (today or earlier, within the last 45 days)." };
    if (!tin && !tout) return { error: "Ask for the correct time in and/or time out (like 08:00 or 17:30)." };
    if (!reason) return { error: "Ask why the time needs correcting (for example, forgot to time out)." };
    return { what: "req", rec: { kind, d, in: tin, out: tout, reason, at }, summary: `Ask HR to correct ${fmt(d)}: ${[tin && `time in ${tin}`, tout && `time out ${tout}`].filter(Boolean).join(", ")}?\nReason: ${reason}` };
  }
  if (kind === "cert") {
    const type = CERT_NAME[x.cert_type] ? x.cert_type : "COE"; const purpose = str(x.purpose, 120); const copies = Math.min(10, Math.max(1, Math.round(Number(x.copies) || 1)));
    if (!purpose) return { error: "Ask what the certificate is for (for example, bank loan, visa)." };
    return { what: "req", rec: { kind, type, purpose, copies, need: addDays(T, 3), at }, summary: `Request this from HR: ${CERT_NAME[type]}, ${copies} cop${copies === 1 ? "y" : "ies"}, for ${purpose}?` };
  }
  return { error: "That kind of request can't be filed here. Use the HR app or Ask HR." };
}

/* ---------- prompts ---------- */
const RULES = `Rules:
- Be brief, warm and clear: this is a chat on a phone. Plain text only, no markdown tables. Reply in the language the person writes in (English, Filipino/Tagalog, Cebuano or Taglish).
- Use only the data and policies given here and Philippine labor law. Never invent amounts, dates or policies. If something is not in the data, say so and offer to ask HR.
- Amounts are in Philippine pesos (PHP).`;
export function empSystem(o: { company: string; today: string; sum: Doc | null; kb: Doc | null; leave: [string, string][] }) {
  const sum = o.sum ? { ...o.sum, at: undefined, fix: o.sum.fix ? { ...o.sum.fix, lv: undefined } : undefined } : null;
  return `You are the HR assistant of ${o.company}, chatting on Viber or Messenger with employee ${o.sum?.name || "an employee"}. Today is ${o.today} (Philippine time).
${RULES}
- You only see this one employee's data. Never discuss other employees.
- You can PREPARE requests with the tools: leave, overtime, a time correction, a certificate, or a message to HR. The employee confirms before anything is sent, and HR or their supervisor approves it. Ask for missing details first, one short question at a time. Never say a request was sent or approved.
- Leave codes: ${o.leave.map(([c, n]) => `${c} = ${n}`).join("; ") || "(none set)"}.

COMPANY POLICIES (written by HR):
${String(o.kb?.text || "(none written yet)").slice(0, 12000)}

FACTS FROM SETTINGS:
${String(o.kb?.facts || "(not available)").slice(0, 4000)}

THIS EMPLOYEE'S DATA (as of ${o.sum?.at ? String(o.sum.at).slice(0, 16).replace("T", " ") : "unknown"}):
${sum ? JSON.stringify(sum).slice(0, 12000) : "(not available yet: HR hasn't shared this employee's records. Answer policy questions only.)"}`;
}
export function hrSystem(o: { company: string; today: string; helper: Doc | null; kb: Doc | null }) {
  const h = o.helper; const secs = Array.isArray(h?.sections) ? h.sections : [];
  return `You are the HR helper of ${o.company}, chatting on Viber or Messenger with a member of the HR team. Today is ${o.today} (Philippine time).
${RULES}
- Answer from today's HR summary below: requests waiting past their target, approvals, payroll gaps, filings, contracts, documents and cases. Keep it short; list names only when asked.
- You can't change records. Say which page of the HR app does it (Overview > Needs action, Payroll, Leave, Employees).

TODAY'S HR SUMMARY (${h?.at ? String(h.at).slice(0, 16).replace("T", " ") : "not made yet"}):
${secs.length ? secs.map((s: Doc) => `${s.title} (${(s.lines || []).length}):\n${(s.lines || []).slice(0, 40).map((l: string) => `- ${l}`).join("\n")}`).join("\n\n").slice(0, 14000) : "Nothing needs attention."}

COMPANY POLICIES:
${String(o.kb?.text || "(none)").slice(0, 6000)}`;
}
// Without the Claude key the bot still answers the common questions from the employee's summary.
export function quickAnswer(text: string, sum: Doc | null): string | null {
  const t = text.toLowerCase(); if (!sum) return null;
  if (/leave|bakasyon|vl|sl\b|balance/.test(t) && Array.isArray(sum.leave)) return sum.leave.length ? `Your leave left: ${sum.leave.map((l: Doc) => `${l.name} ${l.left}`).join(", ")}.` : "I don't have your leave balances yet.";
  if (/payslip|sahod|sweldo|net pay|pay\b/.test(t) && Array.isArray(sum.slips)) { const s = sum.slips[0]; return s ? `Your latest payslip (${s.label}): net pay PHP ${Number(s.net).toLocaleString("en-PH", { minimumFractionDigits: 2 })}. Open My payslips in the HR app for details.` : "No payslip yet."; }
  if (/schedule|shift|iskedyul|rest day/.test(t) && Array.isArray(sum.week)) return `Your next 7 days:\n${sum.week.map((w: Doc) => `${fmt(w.d)}: ${w.label}`).join("\n")}`;
  if (/fix|missing|time out|time in|absent/.test(t) && sum.fix) { const it = (sum.fix.items || []).filter((i: Doc) => !i.wait); return it.length ? `To fix before payroll:\n${it.map((i: Doc) => `${fmt(i.d)}: ${i.text}`).join("\n")}` : "Nothing to fix before payroll."; }
  return null;
}
// HR's summary as a chat message (HR helper without the Claude key, or the morning message).
export function helperText(h: Doc | null, max = 6): string {
  const secs = Array.isArray(h?.sections) ? h.sections : []; if (!secs.length) return "Nothing needs HR's attention right now.";
  return secs.map((x: Doc) => `${x.title} (${(x.lines || []).length})\n${(x.lines || []).slice(0, max).map((l: string) => `• ${l}`).join("\n")}${(x.lines || []).length > max ? `\n…and ${(x.lines || []).length - max} more` : ""}`).join("\n\n") + "\n\nFull list: Overview > Needs action in the HR app.";
}
/* ---------- chat memory ---------- */
export type Turn = { role: "user" | "assistant"; content: string };
export function addHist(hist: unknown, ...turns: Turn[]): Turn[] {
  const h = (Array.isArray(hist) ? hist : []).filter((x: Doc) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string") as Turn[];
  return [...h, ...turns.map((t) => ({ role: t.role, content: t.content.slice(0, 800) }))].slice(-12);
}
// Claude wants turns that alternate and start with the person.
export function turnsFor(hist: Turn[], text: string): Turn[] {
  const out: Turn[] = [];
  for (const t of [...hist, { role: "user" as const, content: text }]) { if (out.length && out[out.length - 1].role === t.role) out[out.length - 1] = { role: t.role, content: `${out[out.length - 1].content}\n${t.content}` }; else out.push({ ...t }); }
  while (out.length && out[0].role !== "user") out.shift(); return out;
}

/* ---------- careers page bot ---------- */
export function careersSystem(cfg: Doc, today: string) {
  const jobs = (Array.isArray(cfg?.jobs) ? cfg.jobs : []).slice(0, 60).map((j: Doc) => ({ id: j.id, title: j.title, where: [j.site, j.location].filter(Boolean).join(", ") || "Head Office", type: j.empType, pay: j.rate ? `PHP ${j.rate} ${j.payType === "DAILY" ? "a day" : "a month"}` : "not posted", openings: j.slots, posted: j.opened, about: String(j.desc || "").slice(0, 600) }));
  return `You are the careers assistant of ${cfg?.company || "GD Prime Property Management Corporation"}, a property management company in the Philippines, on its careers page. Today is ${today}.
Rules:
- Help job seekers: answer questions about the open jobs below, how to apply and the requirements, and suggest which jobs fit what they tell you. Be brief, friendly and plain. Reply in the language they write in (English, Filipino/Tagalog, Cebuano or Taglish).
- Use only the information below. Never promise a job, a salary, a schedule or an interview. HR decides. Don't invent jobs or details; if you don't know, say HR can answer after they apply.
- To point to a job, write [[JOB:<id>]] on its own line (it becomes an Apply button). Only use ids from the list.
- Don't ask for or accept government ID numbers, bank details or other sensitive data in this chat. The application form collects what's needed.
- If they ask about their own application, tell them to sign in with "My applications" on this page, where they can see their status, pick an interview time when HR offers them, and send requirements.

HOW TO APPLY: ${String(cfg?.how || "Choose a job, press Apply, create an account with your email, and fill in the form with your resume. You can follow your application on this page.").slice(0, 1500)}
REQUIREMENTS AFTER PASSING: ${(Array.isArray(cfg?.reqs) ? cfg.reqs.map((r: Doc) => r.label) : ["NBI clearance", "Medical exam result", "PSA birth certificate", "SSS, PhilHealth, Pag-IBIG and TIN numbers", "Diploma, TOR or TESDA certificate", "2x2 ID photo"]).join(", ")}
OPEN JOBS: ${jobs.length ? JSON.stringify(jobs) : "(no openings right now; they can check back later)"}`;
}
// What the careers page sends: up to the last 10 turns, plain text, alternating, starting with the visitor.
export function careersTurns(x: unknown): Turn[] | null {
  if (!Array.isArray(x)) return null; const t: Turn[] = [];
  for (const m of x.slice(-10)) { if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null; const c = m.content.trim().slice(0, 1000); if (c) t.push({ role: m.role, content: c }); }
  if (t[t.length - 1]?.role !== "user") return null;
  const out = turnsFor(t.slice(0, -1), t[t.length - 1].content);
  return out.length && out[out.length - 1].role === "user" && out[out.length - 1].content ? out : null;
}
// Keeps only [[JOB:id]] markers for jobs that are really open.
export const cleanJobLinks = (text: string, ids: Set<string>) => text.replace(/\[\[JOB:([^\]\s]{1,60})\]\]/g, (m, id) => (ids.has(id) ? m : ""));
