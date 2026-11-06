// GD Prime HR: forwards the app's assistant requests to the Claude API with the company's key.
// Needs the ANTHROPIC_API_KEY secret; without it the app hides its Claude features.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODELS: Record<string, string> = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" };
// US$ per million tokens (input, output), for the monthly AI budget (hr_ai_log, migration 20261106b_hr_ai_agents.sql).
const PRICE: Record<string, [number, number]> = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };
const costOf = (model: string, u: any) => { const [pi, po] = PRICE[model] || [4, 20]; return ((Number(u?.input_tokens) || 0) * pi + (Number(u?.cache_creation_input_tokens) || 0) * pi * 1.25 + (Number(u?.cache_read_input_tokens) || 0) * pi * 0.1 + (Number(u?.output_tokens) || 0) * po) / 1e6; };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
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
  const call = async (fn: string, args: Record<string, unknown> = {}) => {
    const base = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!base || !anon || !/^Bearer .+/.test(auth)) return null;
    return await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: anon, authorization: auth, "content-type": "application/json" }, body: JSON.stringify(args) }).catch(() => null);
  };
  const rpc = async (fn: string) => { const r = await call(fn); return !!r?.ok && (await r.json().catch(() => false)) === true; };
  if (!(await rpc("hr_is_approved"))) return json({ error: "Your account can't use the assistant." }, 403);
  // Daily limit per person (hr_ai_tick, migration 20261017_hr_audit5.sql). Apply the migration before deploying this.
  // Daily limit per person and the company's monthly AI budget (hr_ai_tick also refuses when the budget is used up or AI is switched off).
  if (!(await rpc("hr_ai_tick"))) {
    const q = await (await call("hr_ai_quota"))?.json().catch(() => null);
    return json({ error: q?.why === "cap" ? "This month's AI budget has been used up. Ask the HR Manager to raise it in AI agents > AI usage." : q?.why === "off" ? "AI is switched off for the company." : "You've reached today's limit for the assistant. Try again tomorrow." }, 429);
  }
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
  const used = String(out.model || payload.model);
  await call("hr_ai_record", { p_model: used, p_purpose: String(body.purpose || "assistant").slice(0, 40), p_in: Number(out.usage?.input_tokens) || 0, p_out: Number(out.usage?.output_tokens) || 0, p_usd: costOf(String(payload.model), out.usage) });
  return json({ content: out.content, stop_reason: out.stop_reason });
});
