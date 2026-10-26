// GD Prime HR automatic jobs. Called every 10 minutes by the database scheduler (pg_cron), and by HR Admins from
// Users & Permissions > Automatic notices. Each run:
//  1. turns record changes noted by the hr_docs trigger (table hr_events) into messages in hr_outbox,
//  2. once a day after the digest hour (Philippine time) adds HR's morning to-do digest,
//  3. sends queued messages by email (Resend or Brevo) and, if switched on, SMS (Semaphore).
// Secrets: RESEND_API_KEY or BREVO_API_KEY, MAIL_FROM ("GD Prime HR <hr@your-domain>"); optional SEMAPHORE_API_KEY, SEMAPHORE_SENDER.
// Nothing is sent until an HR Admin ticks "Send automatic notices" (org/notify.on).
// HR helper bot (2026-10-24): messages for someone who linked Viber or Messenger (hr-bot) also go to that chat when the bots
// are on (org/bot.on); every morning approvers get one reminder of what waits past target for them, linked HR staff get the
// day's summary and employees get what to fix before payroll; org/helper keeps the latest summary for the app and the bot.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { aiScreen, genQuestions } from "./screen.ts";
import { type Doc, type Notice, type Ctx, type All, WATCHED, REQ, readSettings, readRules, ruleActions, manila, eventNotices, digestNotices, digestSections, escalationNotices, chaseNotices, fixReminder, toHtml, phMobile, outId, isEmail } from "./logic.ts";
import { type Target, chatKeys, sendChat } from "./chat.ts";
import { type IvState, IV_MODEL_SCORE, scorePrompt, parseScore, jobText as ivJobText } from "./iv.ts";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-hr-jobs", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const BASE = Deno.env.get("SUPABASE_URL") || "", SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const env = (k: string) => (Deno.env.get(k) || "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- database (service role; RLS does not apply) ---------- */
async function rest(path: string, init: RequestInit = {}, extra: Record<string, string> = {}) {
  // A slow database call gives up after 20 s instead of holding the whole run.
  const r = await fetch(`${BASE}/rest/v1/${path}`, { signal: AbortSignal.timeout(20_000), ...init, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...extra } });
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function docsOf(col: string): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (await rest(`hr_docs?select=path,data&col=eq.${encodeURIComponent(col)}&order=path`, {}, { range: `${from}-${from + 999}` })) as { path: string; data: Doc }[];
    for (const r of rows || []) if (r.path.split("/").length === 2) out.push({ ...r.data, id: r.path.split("/")[1] });
    if (!rows || rows.length < 1000) return out;
  }
}
async function getDoc(path: string): Promise<Doc | null> { const r = (await rest(`hr_docs?select=data&path=eq.${encodeURIComponent(path)}`)) as { data: Doc }[]; return r?.[0]?.data || null; }
const rpc = (fn: string, args: Doc, auth = `Bearer ${SVC}`, key = SVC) => fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: key, authorization: auth, "content-type": "application/json" }, body: JSON.stringify(args) })
  .then(async (r) => (r.ok ? r.json() : null)).catch(() => null);

/* ---------- AI screening (screen.ts) ---------- */
function screenDeps() {
  const key = env("ANTHROPIC_API_KEY");
  return { key, docsOf, getDoc,
    patch: (p: string, patch: Doc) => rest("rpc/hr_update", { method: "POST", body: JSON.stringify({ p, patch }) }),
    // Only plain stored-file names: no "..", so a resume id can't point at another file.
    fetchFile: async (id: string) => { if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/.test(id) || /(^|\/)\.\.?(\/|$)/.test(id)) return null; const r = await fetch(`${BASE}/storage/v1/object/hr-files/${id.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: SVC, authorization: `Bearer ${SVC}` }, signal: AbortSignal.timeout(20_000) });
      return r.ok ? { type: r.headers.get("content-type") || "", buf: await r.arrayBuffer() } : null; },
    claude: async (body: Doc) => { const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out?.error?.message || `Claude ${r.status}`); return out; } };
}

/* ---------- recruitment rules by score, and interviews whose scoring failed (logic.ts ruleActions, iv.ts) ---------- */
async function recruitRules(today: string) {
  const R = readRules((await getDoc("org/ops"))?.recRules); const apps = await docsOf("applicants"); const live = apps.filter((a) => a.ai || a.aiiv);
  if (!live.length) return { moved: 0, scored: 0 };
  const jobs = new Map((await docsOf("jobs")).map((j) => [j.id, j])); const key = env("ANTHROPIC_API_KEY"); const deps = screenDeps(); let moved = 0, scored = 0;
  const company = String((await getDoc("org/main"))?.companyName || "GD Prime Property Management Corporation");
  for (const a of live) {
    const path = `applicants/${a.id}`; const s = a.aiiv as IvState | undefined;
    if (key && s?.status === "DONE" && !s.result && (s.tries || 0) < 3 && scored < 3) { scored++;
      try { const out = await deps.claude({ model: IV_MODEL_SCORE, max_tokens: 1800, messages: [{ role: "user", content: scorePrompt({ company, jobText: ivJobText(jobs.get(a.jobId) || {}), s }) }] });
        const r = parseScore((out?.content || []).filter((c: Doc) => c.type === "text").map((c: Doc) => c.text).join("")); if (!r) throw new Error("The scoring answer couldn't be read.");
        await deps.patch(path, { aiiv: { result: { ...r, at: new Date().toISOString(), model: IV_MODEL_SCORE }, err: null } }); a.aiiv = { ...s, result: r };
      } catch (e) { await deps.patch(path, { aiiv: { err: String((e as Error)?.message || e).slice(0, 200), tries: (s.tries || 0) + 1 } }).catch(() => null); continue; } }
    const act = ruleActions(a, jobs.get(a.jobId) || null, R, today); if (!act) continue;
    try { await deps.patch(path, act.patch); moved++; } catch (e) { console.error("rule", a.id, e); }
  }
  return { moved, scored };
}

/* ---------- senders ---------- */
// A provider that hangs must not stall the whole run: each call gives up after 10 s and the message is tried again later.
const fetchT = (u: string, i: RequestInit) => fetch(u, { ...i, signal: AbortSignal.timeout(10_000) });
const sender = () => (env("RESEND_API_KEY") ? "resend" : env("BREVO_API_KEY") ? "brevo" : null);
async function sendEmail(to: string, subject: string, text: string, key?: string): Promise<{ ok: boolean; via: string | null; err?: string }> {
  const via = sender(); const from = env("MAIL_FROM");
  if (!via || !from) return { ok: false, via, err: !via ? "No email sender set up" : "MAIL_FROM is not set" };
  let r: Response;
  if (via === "resend") r = await fetchT("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json", ...(key ? { "idempotency-key": `hr-${key}`.slice(0, 256) } : {}) }, body: JSON.stringify({ from, to: [to], subject, text, html: toHtml(text) }) });
  else { const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/); r = await fetchT("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ sender: m ? { name: m[1] || "HR", email: m[2] } : { email: from }, to: [{ email: to }], subject, textContent: text, htmlContent: toHtml(text) }) }); }
  return r.ok ? { ok: true, via } : { ok: false, via, err: `${r.status} ${(await r.text()).slice(0, 160)}` };
}
async function sendSms(num: string, message: string): Promise<{ ok: boolean; err?: string }> {
  const key = env("SEMAPHORE_API_KEY"); if (!key) return { ok: false, err: "No SMS account set up" };
  const f = new URLSearchParams({ apikey: key, number: num, message: message.slice(0, 300) }); if (env("SEMAPHORE_SENDER")) f.set("sendername", env("SEMAPHORE_SENDER"));
  const r = await fetchT("https://api.semaphore.co/api/v4/messages", { method: "POST", body: f });
  return r.ok ? { ok: true } : { ok: false, err: `${r.status} ${(await r.text()).slice(0, 160)}` };
}

/* ---------- context ---------- */
async function context(today: string, settings: ReturnType<typeof readSettings>): Promise<Ctx> {
  const [emps, jobs, ops, set, prof] = await Promise.all([docsOf("employees"), docsOf("jobs"), getDoc("org/ops"), getDoc("org/settings"), rest("hr_profiles?select=user_id,email").catch(() => [])]);
  const leaveTypes: Record<string, string> = { VL: "Vacation leave", SL: "Sick leave", SIL: "Service incentive leave", ML: "Maternity leave", PL: "Paternity leave", SPL: "Solo parent leave", VAWC: "VAWC leave", MCW: "Special leave for women", BL: "Bereavement leave", LWOP: "Leave without pay", EL: "Emergency leave" };
  for (const t of set?.leaveTypes || []) if (t?.code) leaveTypes[t.code] = t.name || t.code;
  const mail = new Map(((prof as Doc[]) || []).map((p) => [p.user_id, p.email]));
  return { today, settings, emps: new Map(emps.map((e) => [e.id, e])), jobs: new Map(jobs.map((j) => [j.id, j])), ops: ops || {}, leaveTypes, userEmail: (u) => (isEmail(mail.get(u)) ? String(mail.get(u)).toLowerCase() : null) };
}
async function allData(ctx: Ctx): Promise<All> {
  const reqCols = Object.keys(REQ).filter((c) => c !== "leaves");
  const [leaveDocs, offboard, contracts, cases, remit, payruns, projects, pay, apprs, ...reqs] = await Promise.all([docsOf("leaves"), docsOf("offboard"), docsOf("contracts"), docsOf("cases"), docsOf("remit"),
    rest("hr_docs?select=path&col=eq.payruns", {}, { range: "0-999" }), docsOf("projects"), docsOf("pay"), docsOf("apprs"), ...reqCols.map(docsOf)]);
  const leaves = leaveDocs.flatMap((d) => Object.entries(d.items || {}).map(([id, l]) => ({ id, month: d.id, ...(l as Doc) })));
  return { emps: [...ctx.emps.values()], leaves, offboard, contracts, cases, remit: new Map(remit.map((r) => [r.id, r])), payruns: new Set(((payruns as Doc[]) || []).map((p) => String(p.path).split("/")[1])),
    projects: new Map(projects.map((p) => [p.id, p])), reqs: Object.fromEntries(reqCols.map((c, i) => [c, reqs[i]])),
    pay: new Map(pay.filter((p) => String(p.id).startsWith("employees--")).map((p) => [String(p.id).slice(11), p])), apprs: new Map(apprs.map((a) => [a.id, a])) };
}

/* ---------- linked chats (hr-bot) ---------- */
type Chats = { on: boolean; forEmail: (to: string) => Target[]; forEmp: (empId?: string) => Target[]; hr: Target[]; emp: { uid: string; t: Target }[] };
async function chats(): Promise<Chats> {
  const bot = (await getDoc("org/bot")) || {}; const keys = chatKeys(); const ok = (c: string) => (keys as Doc)[c] && bot[c] !== false;
  const none: Chats = { on: false, forEmail: () => [], forEmp: () => [], hr: [], emp: [] }; if (bot.on !== true || (!ok("viber") && !ok("messenger"))) return none;
  const [links, prof, eds, cl] = await Promise.all([rest("hr_chat_links?select=channel,sender,user_id"), rest("hr_profiles?select=user_id,email"), rest("hr_editors?select=user_id,revoked"), getDoc("org/clocklinks")]);
  const L = ((links as Doc[]) || []).filter((l) => ok(l.channel)).map((l) => ({ uid: l.user_id as string, t: { channel: l.channel, sender: l.sender } as Target }));
  const mail = new Map(((prof as Doc[]) || []).map((p) => [p.user_id, String(p.email || "").toLowerCase()])); const ed = new Set(((eds as Doc[]) || []).filter((e) => !e.revoked).map((e) => e.user_id)); const emp = cl?.links || {};
  return { on: L.length > 0, forEmail: (to) => (isEmail(to) ? L.filter((l) => mail.get(l.uid) === to.toLowerCase()).map((l) => l.t) : []), forEmp: (id) => (id ? L.filter((l) => emp[l.uid] === id).map((l) => l.t) : []),
    hr: L.filter((l) => ed.has(l.uid)).map((l) => l.t), emp: L.filter((l) => !ed.has(l.uid) && emp[l.uid]) };
}
const chatText = (n: Notice) => (n.chat || `${n.subject}\n\n${n.text.split("\n\nOpen the HR app:")[0]}`).slice(0, 1800);
async function putHelper(sections: { title: string; lines: string[] }[], at: string) {
  const cur = await getDoc("org/helper"); if (cur && JSON.stringify(cur.sections) === JSON.stringify(sections) && Date.now() - Date.parse(cur.at || 0) < 6 * 3600e3) return;
  await rest("hr_docs?on_conflict=path", { method: "POST", body: JSON.stringify([{ path: "org/helper", col: "org", data: { at, sections } }]) }, { prefer: "resolution=merge-duplicates,return=minimal" });
}

/* ---------- one run ---------- */
const putOut = (rows: Doc[]) => rows.length ? rest("hr_outbox?on_conflict=id", { method: "POST", body: JSON.stringify(rows) }, { prefer: "resolution=ignore-duplicates,return=minimal" }) : null;
async function run(force = false) {
  const now = new Date(), { date: today, hour } = manila(now); const at = now.toISOString();
  const settings = readSettings(await getDoc("org/notify"));
  const log: Doc = (((await rest(`hr_job_runs?select=data&day=eq.${today}`)) as Doc[]) || [])[0]?.data || {};
  const events = ((await rest("hr_events?select=id,path,col,old,new&order=id&limit=300")) as Doc[]) || [];
  let queued = 0, digestCount: number | null = null; const notices: Notice[] = [];
  const needDigest = settings.on && settings.kinds.digest && !log.digestAt && (hour >= settings.digestHour || force);
  const ch = await chats().catch((e) => { console.error("chats", e); return null; }); const chatOn = !!ch?.on;
  const morning = !log.botDayAt && (hour >= settings.digestHour || force); const bot = (await getDoc("org/bot").catch(() => null)) || {};
  const needDaily = morning && (settings.on || chatOn); const needHelper = !log.helperAt || now.getTime() - Date.parse(log.helperAt) > 55 * 60e3;
  let helperAt: string | null = null, botDayAt: string | null = null;
  if ((events.length && (settings.on || chatOn)) || needDigest || needDaily || needHelper) {
    const ctx = await context(today, settings);
    if (settings.on || chatOn) for (const ev of events) { if (!WATCHED.includes(ev.col)) continue; try { notices.push(...eventNotices(ev as any, ctx)); } catch (e) { console.error("event", ev.path, e); } }
    if (needDigest || needDaily || needHelper) { const all = await allData(ctx);
      if (needDigest) { const d = digestNotices(all, ctx); digestCount = d.count; notices.push(...d.notices, ...escalationNotices(all, ctx)); }
      const secs = digestSections(all, ctx); if (needHelper) { await putHelper(secs, at).catch((e) => console.error("helper", e)); helperAt = at; }
      if (needDaily) { botDayAt = at;
        // HR helper: approvers' daily reminder (email when notices are on, chat when linked), HR's summary and employees' to-fix list by chat.
        if (bot.chase !== false) notices.push(...chaseNotices(all, ctx));
        if (ch?.on && secs.length) { const n = secs.reduce((a, x) => a + x.lines.length, 0);
          notices.push({ id: `helper-${today}`, kind: "digest", to: "", subject: "HR summary", text: "", chat: `Good morning! HR summary for today (${n} item${n === 1 ? "" : "s"}):\n\n${secs.map((x) => `${x.title} (${x.lines.length})\n${x.lines.slice(0, 5).map((l) => `• ${l}`).join("\n")}${x.lines.length > 5 ? `\n…and ${x.lines.length - 5} more` : ""}`).join("\n\n")}\n\nAsk me for details, or open Overview > Needs action.`.slice(0, 1800), helper: true } as Notice); }
        if (ch?.on && bot.remind !== false) for (const { uid, t } of ch.emp) { const msg = fixReminder(await getDoc(`clockins/${uid}/me/summary`).catch(() => null)); if (msg) notices.push({ id: `fix-${today}-${t.channel}-${t.sender}`, kind: "decided", to: "", subject: "Fix before payroll", text: "", chat: msg, targets: [t] } as Notice); }
      }
    }
  }
  // Queue new messages. Each id is sent once, however often its record changes back and forth.
  const smsOn = settings.sms && !!env("SEMAPHORE_API_KEY");
  const rows = [...new Map(notices.map((n) => [outId(n.id), n])).entries()].map(([id, n]) => { const x = n as Notice & { helper?: boolean; targets?: Target[] }; const mob = settings.on && settings.sms ? phMobile(n.mobile) : null;
    // HR's emailed digest isn't repeated in chat: linked HR staff get the shorter helper summary instead.
    const to = !ch?.on || n.kind === "digest" && !x.helper ? [] : x.helper ? ch.hr : x.targets || [...ch.forEmp(n.empId), ...ch.forEmail(n.to)];
    const chat = [...new Map(to.map((t) => [`${t.channel}:${t.sender}`, t])).values()];
    return { id, kind: n.kind, to_email: settings.on && isEmail(n.to) ? n.to : null, mobile: mob, subject: n.subject, body: n.text || chatText(n), sms: mob ? n.sms || n.subject : null,
      status: !settings.on || !isEmail(n.to) ? "SKIPPED" : sender() && env("MAIL_FROM") ? "QUEUED" : "NO_SENDER", sms_status: mob ? (smsOn ? "QUEUED" : "NO_SENDER") : null,
      chat: chat.length ? { to: chat, text: chatText(n) } : null, chat_status: chat.length ? "QUEUED" : null }; })
    .filter((r) => r.to_email || r.mobile || r.chat);
  for (let i = 0; i < rows.length; i += 200) await putOut(rows.slice(i, i + 200)); queued = rows.length;
  // Delete exactly the events read: ids are not in commit order, so "up to the last id" could drop one committed later.
  for (let i = 0; i < events.length; i += 100) await rest(`hr_events?id=in.(${events.slice(i, i + 100).map((e) => Number(e.id)).join(",")})`, { method: "DELETE" }, { prefer: "return=minimal" });
  // Send what is waiting, about two a second so the email service doesn't refuse them.
  let sent = 0, failed = 0;
  if (settings.on || chatOn) {
    const due = ((await rpc("hr_outbox_claim", { n: 80 })) as Doc[]) || [];
    for (const m of due) { const upd: Doc = { updated_at: new Date().toISOString(), claim_at: null };
      const safe = async <T>(f: () => Promise<T>, err: (e: unknown) => T) => { try { return await f(); } catch (e) { return err(e); } };
      if (m.status === "QUEUED") { const r = await safe(() => sendEmail(m.to_email, m.subject, m.body, String(m.id)), (e) => ({ ok: false, via: sender(), err: String(e).slice(0, 160) })); upd.tries = (m.tries || 0) + 1; upd.via = r.via;
        if (r.ok) { upd.status = "SENT"; upd.sent_at = new Date().toISOString(); upd.err = null; sent++; } else { upd.err = r.err; upd.status = upd.tries >= 3 || !r.via ? "FAILED" : "QUEUED"; failed++; } }
      if (m.chat_status === "QUEUED") { const to: Target[] = Array.isArray(m.chat?.to) ? m.chat.to : [];
        const res = await Promise.all(to.map((t) => safe(() => sendChat(t, String(m.chat?.text || m.subject), [], true), (e) => ({ ok: false, err: String(e).slice(0, 160) })))); const bad = res.filter((r) => !r.ok);
        upd.chat_tries = (m.chat_tries || 0) + 1; upd.chat_status = !bad.length ? "SENT" : upd.chat_tries >= 3 ? "FAILED" : "QUEUED";
        if (bad.length) { upd.err = [upd.err, `Chat: ${bad[0].err}`].filter(Boolean).join("; "); failed++; } else if (m.status !== "QUEUED") sent++; }
      if (m.sms_status === "QUEUED") { const r = await safe(() => sendSms(m.mobile, m.sms || m.subject), (e) => ({ ok: false, err: String(e).slice(0, 160) })); upd.sms_tries = (m.sms_tries || 0) + 1; upd.sms_status = r.ok ? "SENT" : upd.sms_tries >= 3 ? "FAILED" : "QUEUED"; if (!r.ok) upd.err = [upd.err, `SMS: ${r.err}`].filter(Boolean).join("; "); }
      await rest(`hr_outbox?id=eq.${encodeURIComponent(m.id)}`, { method: "PATCH", body: JSON.stringify(upd) }, { prefer: "return=minimal" }); await sleep(550); }
  }
  // Keep 90 days of messages and run notes.
  if (needDigest) { const old = new Date(now.getTime() - 90 * 864e5).toISOString(); await rest(`hr_outbox?at=lt.${old}`, { method: "DELETE" }, { prefer: "return=minimal" }).catch(() => null); await rest(`hr_job_runs?day=lt.${old.slice(0, 10)}`, { method: "DELETE" }, { prefer: "return=minimal" }).catch(() => null); }
  // AI screening of new applications and qualification questions for open jobs (screen.ts), when the Claude key is set.
  let screen: Doc | null = null;
  if (env("ANTHROPIC_API_KEY")) { try { const deps = screenDeps(); const q = await genQuestions(deps); screen = { ...(await aiScreen(deps, 60_000)), questions: q }; } catch (e) { console.error("screen", e); screen = { error: String((e as Error)?.message || e).slice(0, 160) }; } }
  let rules: Doc | null = null; try { rules = await recruitRules(today); } catch (e) { console.error("rules", e); rules = { error: String((e as Error)?.message || e).slice(0, 160) }; }
  const entry = { date: today, runs: (log.runs || 0) + 1, lastAt: at, events: (log.events || 0) + events.length, queued: (log.queued || 0) + queued, sent: (log.sent || 0) + sent, failed: (log.failed || 0) + failed,
    digestAt: log.digestAt || (digestCount != null ? at : null), digestItems: digestCount ?? log.digestItems ?? null, on: settings.on, sender: sender(),
    helperAt: helperAt || log.helperAt || null, botDayAt: log.botDayAt || botDayAt, chat: chatOn,
    screened: (log.screened || 0) + (screen?.done || 0), ...(screen ? { screen } : {}), ...(rules ? { rules } : {}) };
  await rest("hr_job_runs?on_conflict=day", { method: "POST", body: JSON.stringify([{ day: today, data: entry, updated_at: at }]) }, { prefer: "resolution=merge-duplicates,return=minimal" });
  return entry;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BASE || !SVC) return json({ error: "Server keys missing" }, 500);
  let body: Doc = {}; try { body = await req.json(); } catch { /* empty body is a run */ }
  // The scheduler proves itself with the secret kept in the database vault; people must be HR Admins.
  const secret = req.headers.get("x-hr-jobs"); const auth = req.headers.get("authorization") || "";
  if (secret) { if ((await rpc("hr_jobs_secret_ok", { p: secret })) !== true) return json({ error: "Not allowed" }, 403); }
  else if (!/^Bearer .+/.test(auth) || (await rpc("hr_is_admin", {}, auth, ANON || SVC)) !== true) return json({ error: "Only HR Admins can run automatic jobs." }, 403);
  try {
    if (body.status) return json({ sender: sender(), from: env("MAIL_FROM") || null, sms: !!env("SEMAPHORE_API_KEY"), today: manila().date });
    if (body.test) { // a test email goes only to the signed-in admin's own address
      const u = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: ANON || SVC, authorization: auth } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!isEmail(u?.email)) return json({ error: "Couldn't read your email address." }, 400);
      const r = await sendEmail(u.email, "Test from the HR app", `This is a test of the HR app's automatic emails. If you can read this, emails are working.\n\nSent ${new Date().toISOString()}`);
      return json(r.ok ? { ok: true, to: u.email, via: r.via } : { ok: false, error: r.err }, r.ok ? 200 : 502);
    }
    return json({ ok: true, ...(await run(!!body.digest && !secret)) });
  } catch (e) { console.error(e); return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 500); }
});
