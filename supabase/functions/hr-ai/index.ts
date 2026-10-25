// GD Prime HR: forwards the app's assistant requests to the Claude API with the company's key.
// Needs the ANTHROPIC_API_KEY secret; without it the app hides its Claude features.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODELS: Record<string, string> = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (body?.ping) return json({ ok: !!key });
  if (!key) return json({ error: "The assistant isn't set up yet." }, 503);
  // Only approved accounts (HR staff and employees HR let in) may use the company's key; applicants and new sign-ups may not.
  const auth = req.headers.get("authorization") || "";
  const rpc = async (fn: string) => {
    const base = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!base || !anon || !/^Bearer .+/.test(auth)) return false;
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: anon, authorization: auth, "content-type": "application/json" }, body: "{}" }).catch(() => null);
    return !!r?.ok && (await r.json().catch(() => false)) === true;
  };
  if (!(await rpc("hr_is_approved"))) return json({ error: "Your account can't use the assistant." }, 403);
  // Daily limit per person (hr_ai_tick, migration 20261017_hr_audit5.sql). Apply the migration before deploying this.
  if (!(await rpc("hr_ai_tick"))) return json({ error: "You've reached today's limit for the assistant. Try again tomorrow." }, 429);
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages?.length || JSON.stringify(messages).length > 1_500_000) return json({ error: "Bad request" }, 400);
  // Employees chat in text only: big uploads (images, PDFs) are for HR staff reading documents (audit 2026-10-25).
  const editor = await rpc("hr_is_editor");
  if (!editor && JSON.stringify(messages).length > 200_000) return json({ error: "That message is too long for the assistant." }, 413);
  // Only the app's own page tools; server tools (web search, code execution and the like) would bill extra.
  const tools = Array.isArray(body.tools) && body.tools.length ? body.tools.slice(0, 20).filter((t: any) => t && typeof t.name === "string" && (t.type == null || t.type === "custom")) : undefined;
  const tier = body.tier === "complex" && !editor ? "default" : body.tier;
  const payload: Record<string, unknown> = {
    model: MODELS[tier] || MODELS.default,
    max_tokens: 4096,
    messages,
  };
  if (tools?.length) { payload.tools = tools; if (body.last) payload.tool_choice = { type: "none" }; }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null);
  if (!r) return json({ error: "The assistant took too long to answer. Try again." }, 504);
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: out?.error?.message || "The assistant couldn't answer." }, r.status === 429 ? 429 : 502);
  return json({ content: out.content, stop_reason: out.stop_reason });
});
