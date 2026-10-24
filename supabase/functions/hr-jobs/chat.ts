// GD Prime HR chat channels: Viber and Facebook Messenger. Sending, signature checks and webhook set-up.
// The same file is copied to hr-jobs/chat.ts (it sends HR notices to linked chats); web/test-bots.mjs checks the copies match.
// Secrets: VIBER_BOT_TOKEN; MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET, MESSENGER_VERIFY_TOKEN.

export type Button = { label: string; reply: string };
export type Target = { channel: "viber" | "messenger"; sender: string };
const env = (k: string) => ((globalThis as any).Deno?.env.get(k) || "").trim();
export const chatKeys = () => ({ viber: !!env("VIBER_BOT_TOKEN"), messenger: !!(env("MESSENGER_PAGE_TOKEN") && env("MESSENGER_APP_SECRET")) });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function hmacHex(secret: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
}
// Constant-time comparison of two hex strings.
export function sameHex(a: string, b: string) { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// Viber signs the raw body with the bot token (X-Viber-Content-Signature); Meta with the app secret (X-Hub-Signature-256: sha256=...).
export async function viberSigned(body: string, sig: string | null, token: string) { return !!token && !!sig && sameHex(sig.toLowerCase(), await hmacHex(token, body)); }
export async function metaSigned(body: string, sig: string | null, secret: string) { const m = /^sha256=([0-9a-f]{64})$/i.exec(sig || ""); return !!secret && !!m && sameHex(m[1].toLowerCase(), await hmacHex(secret, body)); }

const fetchT = (u: string, i: RequestInit) => fetch(u, { ...i, signal: AbortSignal.timeout(10_000) });
export const SENDER_NAME = "GD Prime HR";

export async function sendViber(receiver: string, text: string, buttons: Button[] = []): Promise<{ ok: boolean; err?: string }> {
  const token = env("VIBER_BOT_TOKEN"); if (!token) return { ok: false, err: "Viber isn't set up" };
  const body: Record<string, unknown> = { receiver, type: "text", text: text.slice(0, 6500), sender: { name: SENDER_NAME }, min_api_version: 3 };
  if (buttons.length) body.keyboard = { Type: "keyboard", DefaultHeight: false, Buttons: buttons.slice(0, 6).map((b) => ({ ActionType: "reply", ActionBody: b.reply, Text: b.label, Columns: buttons.length === 1 ? 6 : 3, Rows: 1 })) };
  const r = await fetchT("https://chatapi.viber.com/pa/send_message", { method: "POST", headers: { "X-Viber-Auth-Token": token, "content-type": "application/json" }, body: JSON.stringify(body) }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, err: r.message.slice(0, 160) };
  const j = await r.json().catch(() => ({})); return j?.status === 0 ? { ok: true } : { ok: false, err: `Viber ${j?.status ?? r.status}: ${String(j?.status_message || "").slice(0, 120)}` };
}
// Messages the person didn't just ask for (notices, reminders) go out after Messenger's 24-hour reply window only with a tag;
// ACCOUNT_UPDATE covers changes to their requests and records.
export async function sendMessenger(psid: string, text: string, buttons: Button[] = [], notice = false): Promise<{ ok: boolean; err?: string }> {
  const token = env("MESSENGER_PAGE_TOKEN"); if (!token) return { ok: false, err: "Messenger isn't set up" };
  const message: Record<string, unknown> = { text: text.slice(0, 1990) };
  if (buttons.length) message.quick_replies = buttons.slice(0, 11).map((b) => ({ content_type: "text", title: b.label.slice(0, 20), payload: b.reply }));
  const body = { recipient: { id: psid }, message, ...(notice ? { messaging_type: "MESSAGE_TAG", tag: "ACCOUNT_UPDATE" } : { messaging_type: "RESPONSE" }) };
  const r = await fetchT(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, err: r.message.slice(0, 160) };
  if (r.ok) return { ok: true }; const j = await r.json().catch(() => ({})); return { ok: false, err: `Messenger ${r.status}: ${String(j?.error?.message || "").slice(0, 120)}` };
}
export const sendChat = (t: Target, text: string, buttons: Button[] = [], notice = false) => (t.channel === "viber" ? sendViber(t.sender, text, buttons) : sendMessenger(t.sender, text, buttons, notice));
export async function setViberWebhook(url: string): Promise<{ ok: boolean; err?: string }> {
  const token = env("VIBER_BOT_TOKEN"); if (!token) return { ok: false, err: "Add the VIBER_BOT_TOKEN secret first." };
  const r = await fetchT("https://chatapi.viber.com/pa/set_webhook", { method: "POST", headers: { "X-Viber-Auth-Token": token, "content-type": "application/json" }, body: JSON.stringify({ url, event_types: ["subscribed", "unsubscribed", "conversation_started"], send_name: true, send_photo: false }) }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, err: r.message };
  const j = await r.json().catch(() => ({})); return j?.status === 0 ? { ok: true } : { ok: false, err: `Viber said: ${j?.status_message || r.status}` };
}
