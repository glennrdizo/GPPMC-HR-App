// Bots (Glenn 2026-10-24), website only: Overview > Bots, and "Chat with HR on Viber or Messenger" on the employee's home.
// The hr-bot function answers Viber, Messenger and the careers page; hr-jobs sends the HR helper's messages to linked chats.
// Settings: org/bot (HR Admins only); what employees need to see (on, the chat links) is copied to pub/bot.
S.bots = { cfg: null, pub: null, helper: null, status: null, counts: null, mine: null, code: null, codeAt: 0, busy: false, sub: false, at: 0 };
{ const g = NAV.find(([, items]) => items.some(([v]) => v === "autostat")) || NAV[0]; const i = g[1].findIndex(([v]) => v === "autostat");
  g[1].splice(i < 0 ? g[1].length : i + 1, 0, ["bots", "Bots", "chat"]); SECTION_OF.bots = "bots"; try { HRD_PERM.bots = HRD_PERM.autostat || HRD_PERM.needs || g[0]; } catch {} }
const BOT_DEF = { on: false, viber: true, messenger: true, careers: true, remind: true, chase: true, model: "quick", viberUri: "", messengerUrl: "" };
const botCfgNow = () => ({ ...BOT_DEF, ...(S.bots.cfg || {}) });
async function botFn(body) {
  const { data, error } = await window.__sb.functions.invoke("hr-bot", { body });
  if (!error) return data; let msg = error.message || "The bot server didn't answer."; try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch {}
  if (/not found|404|Failed to send/i.test(msg)) msg = "The bot server isn't installed yet."; throw new Error(msg);
}
function botsSub() {
  if (S.bots.sub || !S.db) return; S.bots.sub = true;
  S.db.doc("pub/bot").onSnapshot((d) => { S.bots.pub = d.exists ? d.data() : {}; refresh(); }, () => { S.bots.pub = {}; });
  if (!S.selfMode && S.realEdit) { S.db.doc("org/bot").onSnapshot((d) => { S.bots.cfg = d.exists ? d.data() : {}; refresh(); }, () => {}); S.db.doc("org/helper").onSnapshot((d) => { S.bots.helper = d.exists ? d.data() : null; refresh(); }, () => {}); }
}
async function botsLoad(force) {
  if (!window.__sb || S.bots.busy || (!force && Date.now() - S.bots.at < 30000)) return; S.bots.busy = true; S.bots.at = Date.now();
  try {
    const mine = await window.__sb.rpc("hr_chat_mine"); S.bots.mine = mine.error ? null : mine.data || [];
    if (!S.selfMode && S.realEdit) { const c = await window.__sb.rpc("hr_chat_counts"); S.bots.counts = c.error ? null : c.data; }
    if (isPermAdmin()) S.bots.status = await botFn({}).catch((e) => ({ error: e.message }));
  } finally { S.bots.busy = false; } refresh();
}
const botChip = (ok, yes, no) => `<span class="chip ${ok ? "c-ok" : "c-warn"}">${ok ? yes : no}</span>`;
// "Connect my chat": a code to send to the bot, the chats already linked, and buttons that open them.
function botConnect(selfCard) {
  const B = S.bots, P = B.pub || {}; const fresh = B.code && Date.now() - B.codeAt < 14 * 60000;
  const links = B.mine || []; const name = { viber: "Viber", messenger: "Messenger" };
  const open = [P.viber && P.viberUri ? `<a class="btn btn-ghost btn-sm" href="${esc(P.viberUri)}" target="_blank" rel="noopener">Open Viber</a>` : "", P.messenger && P.messengerUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(P.messengerUrl)}" target="_blank" rel="noopener">Open Messenger</a>` : ""].join("");
  return `<section class="card" id="bot-connect"><div class="card-head"><h2>${selfCard ? "Chat with HR on Viber or Messenger" : "Connect my Viber or Messenger"}</h2></div>
    <p style="margin:0 0 10px;font-size:14px">${selfCard ? "Ask about your leave, payslips and schedule, and file leave, overtime or a time correction by chat. You also get reminders there." : "Get the morning HR summary and approval reminders in your chat, and ask the HR helper what's waiting."}</p>
    ${links.length ? `<ul class="list" style="font-size:14px;margin:0 0 10px">${links.map((l) => `<li style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${botChip(true, "Connected", "")} ${name[l.channel] || esc(l.channel)}${l.name ? ` as ${esc(l.name)}` : ""}</span><button class="btn btn-ghost btn-sm" data-bot-unlink="${esc(l.channel)}">Disconnect</button></li>`).join("")}</ul>` : ""}
    ${fresh ? `<p style="margin:0 0 8px;font-size:15px">Send this code to the GD Prime HR bot within 15 minutes:</p><p style="font-size:30px;font-weight:800;letter-spacing:.2em;margin:0 0 10px">${esc(B.code)}</p>` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${open}<button class="btn btn-primary btn-sm" data-bot-code>${fresh ? "New code" : links.length ? "Connect another chat" : "Get my code"}</button></div>
    ${!open ? '<p class="t-muted" style="margin:8px 0 0;font-size:13px">HR hasn\'t shared the bot\'s Viber or Messenger link yet.</p>' : ""}</section>`;
}
VIEWS.bots = () => {
  botsSub(); botsLoad(false).catch(() => {}); const B = S.bots, c = botCfgNow(), st = B.status || {}, keys = st.keys || {}; const adm = isPermAdmin();
  const secs = Array.isArray(B.helper?.sections) ? B.helper.sections : [];
  const row = (title, ok, okText, noText, what) => `<li style="display:flex;gap:12px;align-items:flex-start;margin:0 0 12px"><span style="min-width:120px">${botChip(ok, okText, noText)}</span><div><b>${title}</b><div class="t-muted" style="font-size:13px">${what}</div></div></li>`;
  const claude = !!st.claude; const chk = (k, label, sub) => `<label class="check" style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" name="${k}" ${c[k] ? "checked" : ""} ${adm ? "" : "disabled"}><span><b>${label}</b><span class="t-muted" style="display:block;font-size:13px">${sub}</span></span></label>`;
  return head("Overview", "Bots", adm ? '<button class="btn btn-ghost" data-bot-refresh>Refresh</button>' : "") + `
  <section class="card"><div class="card-head"><h2>Your bots</h2></div>
    ${adm && st.error ? `<p class="t-warn" style="margin:0 0 10px">${esc(st.error)} Claude installs it when you say "execute".</p>` : ""}
    <ul style="list-style:none;padding:0;margin:0">
      ${row("Employee bot on Viber and Messenger", c.on && (keys.viber || keys.messenger), "Running", c.on ? "Needs keys" : "Off", `Employees ask about leave, payslips, schedule and policies, and file leave, overtime, time corrections and certificates by chat (they reply YES before anything is sent). ${B.counts ? `${B.counts.viber || 0} on Viber, ${B.counts.messenger || 0} on Messenger.` : ""}`)}
      ${row("HR assistant in the app", adm ? claude : true, "Ready", "Needs the AI key", "On the employee's HR assistant page it now prepares requests too; the employee presses Send to HR.")}
      ${row("HR helper", c.on || !!secs.length, "Running", "Off", "Every morning: approvers get one reminder of requests waiting past target, HR gets the day's summary, employees get what to fix before payroll. Payroll warnings (no basic pay, requests still waiting) are in the summary. By email when Automatic notices are on, and by chat when linked.")}
      ${row("Careers page assistant", c.on && c.careers && (adm ? claude : true), "Running", "Off", "Answers job seekers' questions about openings and how to apply, and points them to the right job. Applicants in the interview stage pick an interview time you offer on the job page.")}
    </ul></section>
  ${botConnect(false)}
  ${secs.length || B.helper ? `<section class="card"><div class="card-head"><h2>HR helper: today's summary</h2><span class="t-muted" style="font-size:13px">${B.helper?.at ? `Updated ${esc(timeAgo(B.helper.at))}` : ""}</span></div>
    ${secs.length ? secs.map((s) => `<h3 style="font-size:15px;margin:10px 0 4px">${esc(s.title)} (${s.lines.length})</h3><ul class="list" style="font-size:14px">${s.lines.slice(0, 12).map((l) => `<li>${esc(l)}</li>`).join("")}${s.lines.length > 12 ? `<li class="t-muted">…and ${s.lines.length - 12} more on <button class="link" data-go="needs">Needs action</button></li>` : ""}</ul>`).join("") : '<p class="t-muted" style="margin:0">Nothing needs attention.</p>'}</section>` : ""}
  <section class="card"><div class="card-head"><h2>Settings</h2></div>
    <form id="bot-form-cfg" style="display:grid;gap:12px;max-width:760px" data-keep>
      <label class="check" style="display:flex;gap:8px;align-items:center;font-size:16px"><input type="checkbox" name="on" ${c.on ? "checked" : ""} ${adm ? "" : "disabled"}><b>Switch the bots on</b></label>
      <div>${chk("viber", "Viber", "Answer employees and HR on Viber.")}${chk("messenger", "Messenger", "Answer employees and HR on Facebook Messenger.")}${chk("careers", "Careers page assistant", "Show the chat on the careers page.")}
        ${chk("remind", "Morning reminders to employees", "What to fix before payroll (missing time in or out, absences without leave, overtime not filed), by chat.")}${chk("chase", "Morning reminders to approvers", "One message a day listing requests waiting past their target time.")}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:240px"><span>Viber bot link</span><input class="input" name="viberUri" value="${esc(c.viberUri)}" placeholder="viber://pa?chatURI=gdprimehr" ${adm ? "" : "disabled"}></label>
        <label class="field" style="flex:1;min-width:240px"><span>Messenger link</span><input class="input" name="messengerUrl" value="${esc(c.messengerUrl)}" placeholder="https://m.me/gdprime" ${adm ? "" : "disabled"}></label></div>
      ${adm ? '<div><button class="btn btn-primary">Save settings</button></div>' : '<p class="t-muted" style="margin:0;font-size:13px">Only HR Admins change these.</p>'}</form></section>
  ${adm ? `<section class="card"><div class="card-head"><h2>Setup</h2></div><ol style="margin:0;padding-left:20px;font-size:14px;display:grid;gap:10px">
      <li><b>AI key.</b> ${botChip(claude, "Done", "To do")} ANTHROPIC_API_KEY in Supabase &gt; Edge Functions &gt; Secrets (the same key the HR assistant uses). Without it the chat bot still answers leave, payslip, schedule and to-fix questions.</li>
      <li><b>Viber.</b> ${botChip(!!keys.viber, "Key added", "To do")} Create a bot at partners.viber.com, copy its token into the secret VIBER_BOT_TOKEN, then press <button class="btn btn-ghost btn-sm" data-bot-viber ${keys.viber ? "" : "disabled"}>Connect Viber</button>. Put the bot's link above.</li>
      <li><b>Messenger.</b> ${botChip(!!keys.messenger && !!st.verify, "Keys added", "To do")} In a Meta app with your Facebook page, add the secrets MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET and MESSENGER_VERIFY_TOKEN (any phrase you choose). In the app's Messenger webhook, use the callback URL <code style="word-break:break-all">${esc(st.messengerUrl || "")}</code> and the same verify phrase, and subscribe to messages and messaging_postbacks. Messages after 24 hours of silence go out as account updates.</li>
      <li><b>Switch on</b> above, then connect your own chat to try it.</li></ol></section>` : ""}`;
};
{ const b = selfHome; selfHome = () => { const h = b(); botsSub(); const P = S.bots.pub || {}; if (!P.on || !(P.viber || P.messenger)) return h; if (!S.bots.mine) botsLoad(false).catch(() => {}); return h + botConnect(true); }; }
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-bot-code],[data-bot-unlink],[data-bot-viber],[data-bot-refresh]"); if (!t || !window.__sb) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.botRefresh !== undefined) { await botsLoad(true); toast("Refreshed."); return; }
  t.disabled = true;
  try {
    if (d.botCode !== undefined) { const { data, error } = await window.__sb.rpc("hr_chat_code"); if (error) throw new Error(/not_granted/.test(error.message) ? "Your account needs HR's approval first." : "Couldn't make a code. Try again."); S.bots.code = data; S.bots.codeAt = Date.now(); }
    if (d.botUnlink) { const { error } = await window.__sb.rpc("hr_chat_unlink", { p_channel: d.botUnlink }); if (error) throw new Error("Couldn't disconnect. Try again."); toast("Disconnected."); await botsLoad(true); }
    if (d.botViber !== undefined) { const r = await botFn({ setup: "viber" }); toast(r.ok ? "Viber is connected. Send the bot a message to try it." : r.err || "Viber didn't accept it."); }
  } catch (e) { toast(e.message); } finally { t.disabled = false; render(); }
}, true);
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "bot-form-cfg") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!isPermAdmin()) return;
  const v = (n) => f.elements[n]; const url = (s, re) => { s = String(s || "").trim(); return !s || re.test(s) ? s : null; };
  const viberUri = url(v("viberUri").value, /^viber:\/\/pa\?chatURI=[\w.-]{1,60}$/), messengerUrl = url(v("messengerUrl").value, /^https:\/\/(m\.me|www\.messenger\.com\/t)\/[\w.-]{1,80}$/);
  if (viberUri == null) { toast("The Viber link looks like viber://pa?chatURI=yourbot"); return; } if (messengerUrl == null) { toast("The Messenger link looks like https://m.me/yourpage"); return; }
  const cfg = { ...botCfgNow(), on: v("on").checked, viber: v("viber").checked, messenger: v("messenger").checked, careers: v("careers").checked, remind: v("remind").checked, chase: v("chase").checked, viberUri, messengerUrl, at: new Date().toISOString(), by: S.myId || null };
  try { await S.db.doc("org/bot").set(cfg); await S.db.doc("pub/bot").set({ on: cfg.on, viber: cfg.viber && !!viberUri, messenger: cfg.messenger && !!messengerUrl, viberUri, messengerUrl });
    S.bots.cfg = cfg; logActivity(`${cfg.on ? "Switched on" : "Updated"} the bots`); toast("Saved."); render(); } catch { toast("Couldn't save. Only HR Admins can change the bots."); }
}, true);
