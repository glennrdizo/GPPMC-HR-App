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
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages?.length || JSON.stringify(messages).length > 3_000_000) return json({ error: "Bad request" }, 400);
  const tools = Array.isArray(body.tools) && body.tools.length ? body.tools.slice(0, 20) : undefined;
  const payload: Record<string, unknown> = {
    model: MODELS[body.tier] || MODELS.default,
    max_tokens: 4096,
    messages,
  };
  if (tools) { payload.tools = tools; if (body.last) payload.tool_choice = { type: "none" }; }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: out?.error?.message || "The assistant couldn't answer." }, r.status === 429 ? 429 : 502);
  return json({ content: out.content, stop_reason: out.stop_reason });
});
