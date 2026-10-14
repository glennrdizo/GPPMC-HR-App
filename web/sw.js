/* GD Prime HR: serves /_blob/<id> (photos, selfies, documents) from private storage with the signed-in person's token. */
let cfg = null;
const CACHE = "hr-cfg";
const saveCfg = async (c) => { const k = await caches.open(CACHE); await k.put("/__hr_cfg", new Response(JSON.stringify(c))); };
const loadCfg = async () => { if (cfg) return cfg; try { const r = await (await caches.open(CACHE)).match("/__hr_cfg"); cfg = r ? await r.json() : null; } catch { cfg = null; } return cfg; };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("message", (e) => {
  const d = e.data || {}; if (!("hrToken" in d)) return;
  cfg = { token: d.hrToken, url: d.url, key: d.key, bucket: d.bucket }; e.waitUntil(saveCfg(cfg));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith("/_blob/")) return;
  e.respondWith((async () => {
    const c = await loadCfg();
    if (!c?.token) return new Response("Sign in to see this file.", { status: 401, headers: { "content-type": "text/plain" } });
    let id = ""; try { id = decodeURIComponent(u.pathname.slice(7)); } catch {}
    if (!id || id.split("/").some((x) => !x || x === "." || x === "..") || /[\\%?#]/.test(id)) return new Response("Bad file address.", { status: 400, headers: { "content-type": "text/plain" } });
    const r = await fetch(`${c.url}/storage/v1/object/authenticated/${c.bucket}/${id.split("/").map(encodeURIComponent).join("/")}`, { headers: { authorization: `Bearer ${c.token}`, apikey: c.key } });
    if (!r.ok) return new Response("File not found or not allowed.", { status: r.status, headers: { "content-type": "text/plain" } });
    // Uploads come from employees and applicants, so only plain media and PDF open in the page; anything else (HTML, SVG, scripts) downloads, sandboxed.
    const t = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const safe = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/.test(t);
    const h = { "content-type": safe ? t : "application/octet-stream", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'; object-src 'self'", "cache-control": "private, max-age=3600" };
    if (t === "application/pdf") delete h["content-security-policy"]; // Chrome's PDF viewer won't open in a sandboxed document; PDFs can't run page script anyway.
    if (!safe) h["content-disposition"] = `attachment; filename="${(id.split("/").pop() || "file").replace(/[^\w.-]+/g, "_")}"`;
    return new Response(r.body, { status: 200, headers: h });
  })());
});
