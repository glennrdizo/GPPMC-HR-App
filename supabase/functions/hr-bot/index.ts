// GD Prime HR bots (Glenn 2026-10-24). One function, four doors:
//  ?ch=viber      Viber bot webhook: employees and HR chat with the HR bot after linking with a code from the app.
//  ?ch=messenger  Facebook Messenger webhook (GET answers Meta's verification).
//  ?ch=careers    the careers page assistant: anyone may ask about open jobs, a few questions a day each.
//  (no ch)        HR Admins: status of the keys, and connecting the Viber webhook.
// Nothing answers until an HR Admin switches the bots on in Overview > Bots (org/bot). Requests the bot prepares are filed
// only after the person replies YES; they then go into the same queue as the app's own forms (clockins/<uid>/reqs).
// Secrets: ANTHROPIC_API_KEY; VIBER_BOT_TOKEN; MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET, MESSENGER_VERIFY_TOKEN.
// Deploy with verify_jwt off: Viber and Meta don't send a Supabase sign-in; each door checks its own proof.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { type Doc, type ChatIn, type Proposal, type Turn, parseViber, parseMessenger, intent, YES_NO, HELP_EMP, HELP_HR, notLinkedText, EMP_TOOLS, checkProposal, empSystem, hrSystem, quickAnswer, helperText, addHist, turnsFor, careersSystem, careersTurns, cleanJobLinks } from "./logic.ts";
import { type Target, chatKeys, viberSigned, metaSigned, sendChat, setViberWebhook, hmacHex } from "./chat.ts";

const BASE = Deno.env.get("SUPABASE_URL") || "", SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const env = (k: string) => (Deno.env.get(k) || "").trim();
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const MODELS: Record<string, string> = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" };
const DAY_CAP = 80; // messages a chat may send the bot a day
const manilaDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- database (service role) ---------- */
async function rest(path: string, init: RequestInit = {}, extra: Record<string, string> = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...extra }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || r.status === 201 ? null : r.json().catch(() => null);
}
async function getDoc(path: string): Promise<Doc | null> { const r = (await rest(`hr_docs?select=data&path=eq.${encodeURIComponent(path)}`)) as { data: Doc }[]; return r?.[0]?.data || null; }
const putDoc = (path: string, data: Doc) => rest("hr_docs", { method: "POST", body: JSON.stringify([{ path, col: path.replace(/\/[^/]+$/, ""), data }]) }, { prefer: "return=minimal" });
const rpc = (fn: string, args: Doc, auth = `Bearer ${SVC}`, key = SVC) => fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: key, authorization: auth, "content-type": "application/json" }, body: JSON.stringify(args) })
  .then(async (r) => (r.ok ? r.json() : null)).catch(() => null);
const BOT_DEF = { on: false, viber: true, messenger: true, careers: true, remind: true, chase: true, model: "quick" };
const botCfg = async () => ({ ...BOT_DEF, ...((await getDoc("org/bot").catch(() => null)) || {}) });
const appUrl = async () => { const n = await getDoc("org/notify").catch(() => null); const u = String(n?.appUrl || ""); return /^https:\/\/(gppmc-hr-app1\.vercel\.app|hr\.gd-prime\.com)\b/.test(u) ? u : "https://gppmc-hr-app1.vercel.app"; };

/* ---------- Claude ---------- */
async function claude(body: Doc): Promise<Doc> {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out?.error?.message || `Claude ${r.status}`); return out;
}
const textOf = (c: Doc[]) => (c || []).filter((x) => x.type === "text").map((x) => x.text).join("").trim();

/* ---------- who is chatting ---------- */
type Who = { ok: boolean; hr: boolean; empId: string | null };
async function whoIs(uid: string): Promise<Who> {
  const [ed, su, links] = await Promise.all([rest(`hr_editors?select=revoked&user_id=eq.${uid}`), rest(`hr_signups?select=status&user_id=eq.${uid}`), getDoc("org/clocklinks")]);
  const hr = !!(ed as Doc[])?.[0] && !(ed as Doc[])[0].revoked; const ok = hr || (su as Doc[])?.[0]?.status === "approved";
  return { ok, hr, empId: (links?.links || {})[uid] || null };
}
async function leaveCodes(): Promise<[string, string][]> {
  const s = await getDoc("org/settings").catch(() => null); const lt = Array.isArray(s?.leaveTypes) ? s.leaveTypes.filter((t: Doc) => t?.code) : [];
  return lt.length ? lt.map((t: Doc) => [String(t.code), String(t.name || t.code)]) : [["VL", "Vacation leave"], ["SL", "Sick leave"], ["SIL", "Service incentive leave"], ["EL", "Emergency leave"]];
}

/* ---------- chat ---------- */
async function linkWith(t: Target, ev: ChatIn, code: string) {
  const rows = (await rest(`hr_chat_codes?select=user_id,expires_at&code=eq.${code}`)) as Doc[];
  const c = rows?.[0]; if (!c || Date.parse(c.expires_at) < Date.now()) return sendChat(t, "That code isn't right or has expired. Make a new one in the HR app and send it here.");
  await rest(`hr_chat_codes?code=eq.${code}`, { method: "DELETE" }, { prefer: "return=minimal" });
  const who = await whoIs(c.user_id); if (!who.ok) return sendChat(t, "Your HR account isn't approved yet. Ask HR to approve it, then try again.");
  // One chat per person per app: linking again moves the link here.
  await rest(`hr_chat_links?user_id=eq.${c.user_id}&channel=eq.${t.channel}`, { method: "DELETE" }, { prefer: "return=minimal" });
  await rest("hr_chat_links?on_conflict=channel,sender", { method: "POST", body: JSON.stringify([{ channel: t.channel, sender: t.sender, user_id: c.user_id, name: ev.name || null, linked_at: new Date().toISOString(), hist: [], pending: null }]) }, { prefer: "resolution=merge-duplicates,return=minimal" });
  return sendChat(t, `You're connected. ${who.hr ? HELP_HR : HELP_EMP}${who.hr || who.empId ? "" : "\n\nHR hasn't linked your account to your employee record yet, so for now I can answer policy questions only."}`);
}
async function applyProposal(uid: string, p: Proposal, channel: string, emp: Doc | null) {
  const now = new Date().toISOString(); const who = { empNo: emp?.no || null, name: emp ? [emp.first, emp.last].filter(Boolean).join(" ") : null };
  if (p.what === "req") return putDoc(`clockins/${uid}/reqs/${rid()}`, { ...p.rec, ...who, via: channel });
  return putDoc(`clockins/${uid}/tickets/${rid()}`, { subject: p.subject, cat: "OTHER", tags: [], status: "OPEN", created: now, updated: now, msgs: [{ by: "emp", t: now, text: `${p.text}\n\n(Sent from ${channel === "viber" ? "Viber" : "Messenger"})` }], seenEmp: now, ...who });
}
async function chat(channel: "viber" | "messenger", ev: ChatIn) {
  const t: Target = { channel, sender: ev.sender }; const cfg = await botCfg();
  if (!cfg.on || cfg[channel] === false) return;
  const rows = (await rest(`hr_chat_links?select=*&channel=eq.${channel}&sender=eq.${encodeURIComponent(ev.sender)}`)) as Doc[]; const link = rows?.[0];
  const it = intent(ev.text);
  if (it?.k === "link") return linkWith(t, ev, it.code);
  if (!link) return sendChat(t, notLinkedText(await appUrl()));
  const key = `channel=eq.${channel}&sender=eq.${encodeURIComponent(ev.sender)}`; const save = (x: Doc) => rest(`hr_chat_links?${key}`, { method: "PATCH", body: JSON.stringify({ ...x, last_at: new Date().toISOString() }) }, { prefer: "return=minimal" });
  const who = await whoIs(link.user_id);
  if (!who.ok) { await rest(`hr_chat_links?${key}`, { method: "DELETE" }, { prefer: "return=minimal" }); return sendChat(t, "Your HR account is no longer active, so this chat was disconnected. Contact HR if this is a mistake."); }
  if (ev.start || it?.k === "help") return sendChat(t, who.hr ? HELP_HR : HELP_EMP);
  if (it?.k === "unlink") { await rest(`hr_chat_links?${key}`, { method: "DELETE" }, { prefer: "return=minimal" }); return sendChat(t, "Disconnected. You can connect again anytime from the HR app."); }
  if (!ev.text) return;
  const today = manilaDate(); const n = link.day === today ? link.n || 0 : 0;
  if (n >= DAY_CAP) return sendChat(t, "That's a lot of messages today. Please continue in the HR app or try again tomorrow.");
  const emp = who.empId ? await getDoc(`employees/${who.empId}`) : null;
  if (link.pending && (it?.k === "yes" || it?.k === "no")) {
    if (it.k === "no") { await save({ pending: null, day: today, n: n + 1 }); return sendChat(t, "OK, I didn't send it."); }
    if (!emp && link.pending.what === "req") { await save({ pending: null }); return sendChat(t, "I can't file requests until HR links your account to your employee record."); }
    await applyProposal(link.user_id, link.pending as Proposal, channel, emp);
    await save({ pending: null, day: today, n: n + 1, hist: addHist(link.hist, { role: "user", content: ev.text }, { role: "assistant", content: "Sent to HR." }) });
    return sendChat(t, link.pending.what === "req" ? "Sent to HR. You'll get a message here when it's approved or declined, and you can follow it in the HR app." : "Sent to HR. Their answer will be in Ask HR in the HR app.");
  }
  const [sum, kb] = await Promise.all([getDoc(`clockins/${link.user_id}/me/summary`), getDoc("pub/kb")]);
  if (!env("ANTHROPIC_API_KEY")) { await save({ day: today, n: n + 1 });
    if (who.hr) return sendChat(t, helperText(await getDoc("org/helper")));
    return sendChat(t, quickAnswer(ev.text, sum) || "I can answer leave, payslip, schedule and to-fix questions for now. For anything else, use Ask HR in the HR app."); }
  const company = String((await getDoc("org/main"))?.companyName || "GD Prime Property Management Corporation"); const leave = await leaveCodes();
  let system = who.hr ? hrSystem({ company, today, helper: await getDoc("org/helper"), kb }) : empSystem({ company, today, sum, kb, leave });
  if (who.hr && who.empId) system += `\n\nThis HR team member is also an employee. Their own data:\n${JSON.stringify({ ...(sum || {}), at: undefined }).slice(0, 6000)}\nThey can file their own leave, overtime, time corrections and certificates with the tools (leave codes: ${leave.map(([c, x]) => `${c} = ${x}`).join("; ")}).`;
  const tools = who.empId ? EMP_TOOLS : undefined;
  let messages: Doc[] = turnsFor(link.hist || [], ev.text); let reply = ""; let prop: Proposal | null = null;
  for (let round = 0; round < 3 && !prop; round++) {
    const out = await claude({ model: MODELS[cfg.model] || MODELS.quick, max_tokens: 700, system, messages, ...(tools ? { tools } : {}) });
    reply = textOf(out.content); const use = (out.content || []).find((c: Doc) => c.type === "tool_use");
    if (!use || out.stop_reason !== "tool_use") break;
    const chk = checkProposal(use.name, use.input || {}, { today, leave });
    if ("error" in chk) { messages = [...messages, { role: "assistant", content: out.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: chk.error, is_error: true }] }]; continue; }
    prop = chk;
  }
  if (prop) { await save({ pending: prop, day: today, n: n + 1, hist: addHist(link.hist, { role: "user", content: ev.text }, { role: "assistant", content: prop.summary }) });
    return sendChat(t, `${prop.summary}\n\nReply YES to send it to HR, or NO to cancel.`, YES_NO); }
  reply = reply || "Sorry, I couldn't answer that. Try asking another way, or use Ask HR in the HR app.";
  // Anything else said after a proposal drops it: a later YES must answer the question just asked.
  await save({ pending: null, day: today, n: n + 1, hist: addHist(link.hist, { role: "user", content: ev.text }, { role: "assistant", content: reply }) });
  return sendChat(t, reply);
}

/* ---------- careers page ---------- */
async function careers(req: Request, body: Doc) {
  const cfg = await botCfg(); const on = cfg.on && cfg.careers !== false && !!env("ANTHROPIC_API_KEY");
  if (body.ping) return json({ ok: on });
  if (!on) return json({ error: "The assistant is off." }, 503);
  const turns = careersTurns(body.messages); if (!turns) return json({ error: "Bad request" }, 400);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const k = "ip:" + (await hmacHex(SVC, `${ip}|${req.headers.get("user-agent") || ""}`)).slice(0, 32);
  if ((await rpc("hr_bot_hit", { p_k: k, p_max: 30 })) !== true || (await rpc("hr_bot_hit", { p_k: "*", p_max: 1500 })) !== true) return json({ error: "That's all the questions for today. Please apply, or come back tomorrow." }, 429);
  const c = (await rpc("hr_careers", {}, `Bearer ${ANON || SVC}`, ANON || SVC)) || { jobs: [] };
  const out = await claude({ model: MODELS.quick, max_tokens: 600, system: careersSystem(c, manilaDate()), messages: turns });
  return json({ text: cleanJobLinks(textOf(out.content) || "Sorry, I couldn't answer that. Please try again.", new Set((c.jobs || []).map((j: Doc) => j.id))) });
}

/* ---------- requests ---------- */
const later = (p: Promise<unknown>) => { const w = (globalThis as any).EdgeRuntime?.waitUntil; const q = p.catch((e) => console.error("bot", e)); if (w) w.call((globalThis as any).EdgeRuntime, q); return q; };
Deno.serve(async (req) => {
  const url = new URL(req.url); const ch = url.searchParams.get("ch");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!BASE || !SVC) return json({ error: "Server keys missing" }, 500);
  // Meta checks the webhook with a GET that echoes the challenge when the verify token matches.
  if (req.method === "GET" && ch === "messenger") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && !!env("MESSENGER_VERIFY_TOKEN") && url.searchParams.get("hub.verify_token") === env("MESSENGER_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text(); if (raw.length > 200_000) return json({ error: "Too large" }, 413);
  let body: Doc = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Bad request" }, 400); }
  try {
    if (ch === "viber") {
      if (!(await viberSigned(raw, req.headers.get("x-viber-content-signature"), env("VIBER_BOT_TOKEN")))) return new Response("Forbidden", { status: 403 });
      // Answer Viber at once (it retries slow webhooks); the reply goes out on its own.
      for (const ev of parseViber(body)) later(chat("viber", ev));
      return new Response("ok");
    }
    if (ch === "messenger") {
      if (!(await metaSigned(raw, req.headers.get("x-hub-signature-256"), env("MESSENGER_APP_SECRET")))) return new Response("Forbidden", { status: 403 });
      for (const ev of parseMessenger(body)) later(chat("messenger", ev));
      return new Response("EVENT_RECEIVED");
    }
    if (ch === "careers") return await careers(req, body);
    // HR Admins only from here.
    const auth = req.headers.get("authorization") || "";
    if (!/^Bearer .+/.test(auth) || (await rpc("hr_is_admin", {}, auth, ANON || SVC)) !== true) return json({ error: "Only HR Admins can set up the bots." }, 403);
    const hook = `${BASE}/functions/v1/hr-bot`;
    if (body.setup === "viber") return json(await setViberWebhook(`${hook}?ch=viber`));
    return json({ keys: chatKeys(), claude: !!env("ANTHROPIC_API_KEY"), verify: !!env("MESSENGER_VERIFY_TOKEN"), viberUrl: `${hook}?ch=viber`, messengerUrl: `${hook}?ch=messenger` });
  } catch (e) { console.error(e); return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 500); }
});
