// Notes a sign-in or an opening of the HR website (Users & Sign-Ins, Users Activity Logs) with the network address and the
// city, region and country Vercel reports for it. The browser sends its own session token; this passes it on to
// hr_signin_note, so each person can only note their own sign-ins. Nothing is kept here.
const SB_URL = "https://dkrxetzvzxkmhdnvrnqd.supabase.co";
const hdr = (req, k) => { const v = String(req.headers[k] || ""); try { return decodeURIComponent(v); } catch { return v; } };
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  const auth = String(req.headers.authorization || ""); const key = String(req.headers.apikey || "");
  if (!/^Bearer [\w.-]{20,}$/.test(auth) || !/^[\w.-]{20,}$/.test(key)) { res.statusCode = 401; return res.end(); }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/hr_signin_note`, { method: "POST", headers: { "content-type": "application/json", apikey: key, authorization: auth },
      body: JSON.stringify({ p_kind: body.kind === "signin" ? "signin" : "open", p_ua: String(req.headers["user-agent"] || "").slice(0, 300), p_ip: ip.slice(0, 64),
        p_city: hdr(req, "x-vercel-ip-city").slice(0, 80), p_region: hdr(req, "x-vercel-ip-country-region").slice(0, 80), p_country: hdr(req, "x-vercel-ip-country").slice(0, 2) }) });
    res.statusCode = r.ok ? 204 : 502; return res.end();
  } catch { res.statusCode = 502; return res.end(); }
};
