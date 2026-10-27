/* ---------- Online meetings into Meeting notes (Glenn 2026-10-27: "Zoom, Teams and any other online meeting", "All") ----------
   The scheduled job (supabase/functions/hr-jobs/meetsync.ts) brings in the transcripts of Zoom, Microsoft Teams and Google Meet
   meetings that ended in the last 3 days, saves each as a meeting and, when Claude is set up, writes the minutes. Each platform
   switches on by itself once its keys are added on the server. This card on Meeting notes switches the import on, picks the
   options (org/ops.meetSync) and shows how each platform is doing (org/meetstat, written by the job). Website only. */
Object.assign(S, { meetStat: null });
{ const b = bootIO; bootIO = (db) => { b(db); if (window.__hosted) db.doc("org/meetstat").onSnapshot((d) => { S.meetStat = d.exists ? d.data() : null; refresh(); }, () => {}); }; }
const MS_PLAT = [["zoom", "Zoom"], ["teams", "Microsoft Teams"], ["gmeet", "Google Meet"]];
const MS = () => { const o = S.ops?.meetSync || {}; return { on: o.on === true, minutes: o.minutes !== false, conf: o.conf === true, kind: o.kind || "OTHER", teams: o.teams || [], meet: o.meet || [], zoomHosts: o.zoomHosts || [] }; };
const msList = (v) => [...new Set(String(v || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))].slice(0, 50);
const MS_STEPS = {
  zoom: [`Use a paid Zoom plan (Pro or higher). In Zoom <b>Settings › Recording</b>, turn on <b>Cloud recording</b> and <b>Create audio transcript</b>. Meetings must be recorded to the cloud.`,
    `At <b>marketplace.zoom.us</b> choose <b>Develop › Build App › Server-to-Server OAuth</b>. Add the scope <b>cloud_recording:read:list_account_recordings:admin</b>, then activate the app.`,
    `In Supabase, <b>Edge Functions › Secrets</b>, add <b>ZOOM_ACCOUNT_ID</b>, <b>ZOOM_CLIENT_ID</b> and <b>ZOOM_CLIENT_SECRET</b> from the app's page.`],
  teams: [`Use Microsoft 365 Business Standard or higher, with transcription allowed in Teams meetings. Start the transcript in each meeting (or set meetings to transcribe automatically).`,
    `In the <b>Microsoft Entra admin center › App registrations</b>, add an app. Under <b>API permissions</b> add the Microsoft Graph <b>Application</b> permissions <b>OnlineMeetingTranscript.Read.All</b>, <b>OnlineMeetings.Read.All</b> and <b>User.Read.All</b>, then <b>Grant admin consent</b>. Create a client secret.`,
    `A Teams admin allows the app to read meetings, in PowerShell: <b>New-CsApplicationAccessPolicy -Identity HR-Meetings -AppIds "&lt;client id&gt;"</b> then <b>Grant-CsApplicationAccessPolicy -PolicyName HR-Meetings -Global</b>.`,
    `In Supabase, <b>Edge Functions › Secrets</b>, add <b>MS_TENANT_ID</b>, <b>MS_CLIENT_ID</b> and <b>MS_CLIENT_SECRET</b>. List below the people who organize the meetings.`],
  gmeet: [`Use Google Workspace Business Standard or higher, with <b>Transcripts</b> turned on for Meet. Start the transcript in each meeting.`,
    `In the <b>Google Cloud console</b>, turn on the <b>Google Meet REST API</b>, create a service account and download its JSON key.`,
    `In the <b>Google Admin console › Security › API controls › Domain-wide delegation</b>, add the service account's client ID with the scope <b>https://www.googleapis.com/auth/meetings.space.readonly</b>.`,
    `In Supabase, <b>Edge Functions › Secrets</b>, add <b>GOOGLE_SA_JSON</b> with the whole JSON key file. List below the Google accounts whose meetings to bring in.`],
};
function msChip(p, st, on) {
  const x = st?.[p]; const ago = (t) => (typeof timeAgo === "function" ? timeAgo(t) : fmtDate(String(t).slice(0, 10)));
  if (!x?.keys) return '<span class="chip c-gray">Not set up</span>';
  if (!on) return '<span class="chip c-gold">Ready, import is off</span>';
  if (x.ok === false) return `<span class="chip c-bad" title="${esc(x.err || "")}">Problem</span>`;
  if (x.ok) return `<span class="chip c-ok">Connected</span>${x.total ? ` <span class="t-muted" style="font-size:13px">${x.total} brought in${x.lastOk ? `, last ${esc(ago(x.lastOk))}` : ""}</span>` : ""}`;
  return '<span class="chip c-blue">Waiting for the first check</span>';
}
function msCard() {
  const R = MS(), st = S.meetStat, ed = S.canEdit;
  const kinds = MT_KINDS.map(([k, n]) => `<option value="${k}" ${R.kind === k ? "selected" : ""}>${esc(n)}</option>`).join("");
  const errs = MS_PLAT.filter(([p]) => st?.[p]?.ok === false && R.on).map(([p, n]) => `<div class="notice" style="margin-top:8px"><span><b>${n}:</b> ${esc(st[p].err || "couldn't connect")}</span></div>`).join("");
  return `<section class="card ms-card"><div class="card-head"><h2>${icon("mic", 18)} Online meetings</h2>${R.on ? '<span class="chip c-ok">On</span>' : '<span class="chip c-gray">Off</span>'}</div>
    <p class="t-muted" style="margin:0 0 10px">Zoom, Microsoft Teams and Google Meet meetings with a transcript are brought in here on their own, checked every 10 minutes, with the speakers' names. ${st?.claude ? "Claude then writes the minutes." : "The minutes are written once the Claude key is added."} Each platform starts working once its keys are added.</p>
    <div class="ms-plats">${MS_PLAT.map(([p, n]) => `<details class="ms-plat"><summary><b>${n}</b> ${msChip(p, st, R.on)}</summary><ol class="ms-steps">${MS_STEPS[p].map((s) => `<li>${s}</li>`).join("")}</ol></details>`).join("")}</div>${errs}
    ${ed ? `<form id="ms-form" class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:12px" data-keep>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="on" ${R.on ? "checked" : ""}><span><b>Bring in online meetings automatically</b><div class="t-muted" style="font-size:13px">Only meetings that ended in the last 3 days. Transcripts are only read, never changed on Zoom, Teams or Google.</div></span></label>
      <div class="field"><label for="ms-teams">Teams meeting organizers</label><textarea class="input" id="ms-teams" name="teams" rows="2" placeholder="name@gd-prime.com, one or more">${esc(R.teams.join(", "))}</textarea></div>
      <div class="field"><label for="ms-meet">Google accounts for Meet</label><textarea class="input" id="ms-meet" name="meet" rows="2" placeholder="name@gd-prime.com, one or more">${esc(R.meet.join(", "))}</textarea></div>
      <div class="field"><label for="ms-zoom">Zoom hosts (optional)</label><textarea class="input" id="ms-zoom" name="zoomHosts" rows="2" placeholder="Leave empty for every host in the account">${esc(R.zoomHosts.join(", "))}</textarea></div>
      <div class="field"><label for="ms-kind">Meeting type for imported meetings</label><select class="input" id="ms-kind" name="kind">${kinds}</select></div>
      <label class="check"><input type="checkbox" name="minutes" ${R.minutes ? "checked" : ""}><span>Write the minutes automatically<div class="t-muted" style="font-size:13px">A draft you check and approve, as with recorded meetings.</div></span></label>
      <label class="check"><input type="checkbox" name="conf" ${R.conf ? "checked" : ""}><span>Mark imported meetings Confidential<div class="t-muted" style="font-size:13px">Only HR Managers and Owners see them until you untick it on the meeting.</div></span></label>
      <div style="grid-column:1/-1"><button class="btn btn-primary">Save</button></div></form>` : ""}</section>`;
}
{ const b = VIEWS.meet; VIEWS.meet = (...x) => { const h = b(...x); if (!window.__hosted || !S.canEdit || S.view?.id) return h;
  const card = msCard(); const i = h.indexOf("</section>", h.indexOf("mt-intro")); return i < 0 ? h + card : h.slice(0, i + 10) + card + h.slice(i + 10); }; }
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "ms-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const q = (n) => f.querySelector(`[name=${n}]`);
  const ms = { on: q("on").checked, minutes: q("minutes").checked, conf: q("conf").checked, kind: MT_KINDS.some(([k]) => k === q("kind").value) ? q("kind").value : "OTHER",
    teams: msList(q("teams").value), meet: msList(q("meet").value), zoomHosts: msList(q("zoomHosts").value) };
  const next = { ...(S.ops || {}), meetSync: ms };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity(`${ms.on ? "Turned on" : "Updated"} the online meeting import`); toast(ms.on ? "Saved. New meetings come in within 10 minutes." : "Saved."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
{ const st = document.createElement("style"); st.textContent = `.ms-plats{display:flex;flex-direction:column;gap:6px}.ms-plat{border:1px solid var(--line,#E6E1D6);border-radius:10px;padding:8px 12px}
.ms-plat>summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:8px;align-items:center;list-style:none}.ms-plat>summary::-webkit-details-marker{display:none}
.ms-plat>summary::after{content:"How to set up";margin-left:auto;font-size:13px;color:var(--muted,#6A7080);text-decoration:underline}.ms-plat[open]>summary::after{content:"Hide"}
.ms-steps{margin:10px 0 4px;padding-left:20px;font-size:14px;line-height:1.55}.ms-steps li+li{margin-top:6px}.ms-steps b{word-break:break-word}`; document.head.appendChild(st); }
