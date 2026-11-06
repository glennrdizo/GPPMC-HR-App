// GD Prime HR chat channels: Viber, Facebook Messenger and Telegram. Sending, signature checks and webhook set-up.
// The same file is copied to hr-jobs/chat.ts (it sends HR notices to linked chats); web/test-bots.mjs checks the copies match.
// Secrets: VIBER_BOT_TOKEN; MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET, MESSENGER_VERIFY_TOKEN; TELEGRAM_BOT_TOKEN.

export type Button = { label: string; reply: string };
export type Channel = "viber" | "messenger" | "telegram";
export type Target = { channel: Channel; sender: string };
const env = (k: string) => ((globalThis as any).Deno?.env.get(k) || "").trim();
export const chatKeys = () => ({ viber: !!env("VIBER_BOT_TOKEN"), messenger: !!(env("MESSENGER_PAGE_TOKEN") && env("MESSENGER_APP_SECRET")), telegram: !!env("TELEGRAM_BOT_TOKEN") });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function hmacHex(secret: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
}
// Constant-time comparison of two hex strings.
export function sameHex(a: string, b: string) { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// Viber signs the raw body with the bot token (X-Viber-Content-Signature); Meta with the app secret (X-Hub-Signature-256: sha256=...).
export async function viberSigned(body: string, sig: string | null, token: string) { return !!token && !!sig && sameHex(sig.toLowerCase(), await hmacHex(token, body)); }
// Telegram sends back the secret_token given to setWebhook (X-Telegram-Bot-Api-Secret-Token). It is derived from the bot token,
// so there is no extra secret to keep: only someone with the bot token can make it.
export const telegramSecret = async (token: string) => (token ? (await hmacHex(token, "gd-prime-hr-telegram-webhook")).slice(0, 64) : "");
export async function telegramSigned(header: string | null, token: string) { return !!token && !!header && sameHex(header.toLowerCase(), await telegramSecret(token)); }
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
export async function sendTelegram(chatId: string, text: string, buttons: Button[] = []): Promise<{ ok: boolean; err?: string }> {
  const token = env("TELEGRAM_BOT_TOKEN"); if (!token) return { ok: false, err: "Telegram isn't set up" };
  const body: Record<string, unknown> = { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true,
    reply_markup: buttons.length ? { keyboard: [buttons.slice(0, 6).map((b) => ({ text: b.reply }))], resize_keyboard: true, one_time_keyboard: true } : { remove_keyboard: true } };
  const r = await fetchT(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, err: r.message.slice(0, 160) };
  const j = await r.json().catch(() => ({})); return j?.ok ? { ok: true } : { ok: false, err: `Telegram ${r.status}: ${String(j?.description || "").slice(0, 120)}` };
}
export const sendChat = (t: Target, text: string, buttons: Button[] = [], notice = false) =>
  t.channel === "viber" ? sendViber(t.sender, text, buttons) : t.channel === "telegram" ? sendTelegram(t.sender, text, buttons) : sendMessenger(t.sender, text, buttons, notice);
export async function setViberWebhook(url: string): Promise<{ ok: boolean; err?: string }> {
  const token = env("VIBER_BOT_TOKEN"); if (!token) return { ok: false, err: "Add the VIBER_BOT_TOKEN secret first." };
  const r = await fetchT("https://chatapi.viber.com/pa/set_webhook", { method: "POST", headers: { "X-Viber-Auth-Token": token, "content-type": "application/json" }, body: JSON.stringify({ url, event_types: ["subscribed", "unsubscribed", "conversation_started"], send_name: true, send_photo: false }) }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, err: r.message };
  const j = await r.json().catch(() => ({})); return j?.status === 0 ? { ok: true } : { ok: false, err: `Viber said: ${j?.status_message || r.status}` };
}
// Points the Telegram bot at hr-bot and returns the bot's username, for the t.me link on the Bots page.
export async function setTelegramWebhook(url: string): Promise<{ ok: boolean; err?: string; username?: string }> {
  const token = env("TELEGRAM_BOT_TOKEN"); if (!token) return { ok: false, err: "Add the TELEGRAM_BOT_TOKEN secret first." };
  const api = (m: string, b: unknown) => fetchT(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch((e) => ({ ok: false, description: (e as Error).message }));
  const me = await api("getMe", {}); if (!me?.ok) return { ok: false, err: `Telegram said: ${me?.description || "the token isn't right"}` };
  const r = await api("setWebhook", { url, secret_token: await telegramSecret(token), allowed_updates: ["message"], drop_pending_updates: true });
  return r?.ok ? { ok: true, username: String(me.result?.username || "") } : { ok: false, err: `Telegram said: ${r?.description || "couldn't set the webhook"}` };
}
