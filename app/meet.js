
/* ---------- Meeting notes: record a meeting, live transcript, minutes written by Claude (Glenn 2026-10-12) ---------- */
// meetings/<id>: title, date, time, kind, place, attendees, agenda, notes, transcript, audio[], minutes {summary, discussion[], decisions[], actions[], next}, status, conf.
Object.assign(TCOLS, { meetings: "meets" });
Object.assign(S, { meets: new Map(), mtQ: "", mtD: null, mtDirty: false, mtRec: null, mtBusy: false, mtLang: "en-PH" });
Object.assign(ICON, { mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>' });
{ const ov = NAV.find(([n]) => n === "Overview"); if (ov) { const i = ov[1].findIndex(([v]) => v === "reminders"); ov[1].splice(i >= 0 ? i + 1 : ov[1].length, 0, ["meet", "Meeting notes", "mic"]); }
  Object.assign(SECTION_OF, { meet: "meet", meetRoom: "meet" }); }
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("meetings").limit(500).onSnapshot((snap) => { S.meets = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {}); }; }

const MT_KINDS = [["HR", "HR meeting"], ["MGMT", "Management meeting"], ["SITE", "Project site meeting"], ["TOOLBOX", "Toolbox / safety talk"], ["HEARING", "Administrative hearing"], ["CLIENT", "Client / owners' meeting"], ["OTHER", "Other"]];
const MT_LANGS = [["en-PH", "English (Philippines)"], ["fil-PH", "Filipino / Tagalog"], ["en-US", "English (US)"]];
const MtSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const mtKind = (k) => (MT_KINDS.find((x) => x[0] === k) || MT_KINDS[0])[1];
const mtMMSS = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0"); const ss = String(s % 60).padStart(2, "0"); return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`; };
const mtPeople = (m) => String(m.attendees || "").split(/\n|,|;/).map((x) => x.trim()).filter(Boolean);
const mtSees = (m) => !m.conf || isPermAdmin() || m.by === S.myId || S.isOwner;
const mtOpen = (m) => (m.minutes?.actions || []).filter((a) => !a.done && a.task);
const mtBy = (id) => (id && (S.access?.users?.[id]?.name || S.profiles?.[id]?.name)) || "";
const mtNowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function mtNew() { return { id: uid(), title: "", date: todayISO(), time: mtNowHM(), kind: "HR", place: "", attendees: "", agenda: "", notes: "", transcript: "", audio: [], minutes: null, status: "DRAFT", conf: false, by: S.myId || null, at: new Date().toISOString() }; }
// The meeting page edits a copy (S.mtD) so typing, recording and Claude's minutes never get lost when the page redraws.
function mtDraft(id) {
  if (S.mtD?.id === id) return S.mtD;
  const m = S.meets.get(id); S.mtD = m ? JSON.parse(JSON.stringify(m)) : { ...mtNew(), id }; S.mtDirty = !m; return S.mtD;
}
async function mtSave(quiet) {
  const m = S.mtD; if (!m) return false; if (!S.canEdit) { toast("You can't change records."); return false; }
  if (!m.title.trim()) m.title = `${mtKind(m.kind)} ${fmtDate(m.date)}`;
  try { const fresh = !S.meets.has(m.id); await put("meetings", m); S.mtDirty = false; if (fresh) logActivity(`Started the meeting notes ${m.title}`); if (!quiet) toast("Meeting saved."); return true; }
  catch { toast("Couldn't save the meeting. Try again."); return false; }
}

/* ---------- list ---------- */
VIEWS.meet = () => {
  const all = listOf(S.meets).filter(mtSees).sort((a, b) => `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`));
  const q = (S.mtQ || "").toLowerCase();
  const list = all.filter((m) => !q || `${m.title} ${m.attendees} ${m.agenda} ${m.place} ${mtKind(m.kind)}`.toLowerCase().includes(q));
  const open = all.flatMap((m) => mtOpen(m).map((a) => ({ m, a }))).sort((x, y) => (x.a.due || "9999").localeCompare(y.a.due || "9999"));
  const today = todayISO();
  return head("Company", "Meeting notes", S.canEdit ? `<button class="btn btn-primary" data-mt-new>${icon("plus")}New meeting</button>` : "") + `
    <section class="card mt-intro"><span class="mt-intro-ic">${icon("mic", 26)}</span><div><b>Record the meeting, and the minutes write themselves.</b>
      <p class="t-muted" style="margin:4px 0 0">Press Start recording at the start of the meeting. The words appear as people speak, then Claude writes the minutes: summary, decisions and action items with who and when. You can edit everything and download it as Word or PDF.</p></div></section>
    ${open.length ? `<section class="card"><div class="card-head"><h2>Open action items <span class="chip c-gold">${open.length}</span></h2></div>
      <div class="table-wrap"><table><thead><tr><th style="width:44px">Done</th><th>Task</th><th>Who</th><th>Due</th><th>From meeting</th></tr></thead><tbody>
      ${open.slice(0, 30).map(({ m, a }) => `<tr><td><input type="checkbox" data-mt-done="${esc(m.id)}|${esc(a.id)}" aria-label="Mark done" ${S.canEdit ? "" : "disabled"}></td><td>${esc(a.task)}</td><td>${esc(a.owner || "—")}</td>
        <td>${a.due ? `<span class="${a.due < today ? "chip c-bad" : ""}">${fmtDate(a.due)}</span>` : "—"}</td><td><button class="link" data-mt-open="${esc(m.id)}">${esc(m.title)}</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="card"><div class="card-head"><h2>Meetings</h2><input class="input" type="search" id="mt-q" value="${esc(S.mtQ || "")}" placeholder="Search meetings" aria-label="Search meetings" style="max-width:260px"></div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Meeting</th><th>Type</th><th class="num">People</th><th>Minutes</th><th class="num">Open items</th></tr></thead><tbody>
        ${list.map((m) => `<tr class="clickable" data-mt-open="${esc(m.id)}"><td style="white-space:nowrap">${fmtDate(m.date)}${m.time ? `<div class="t-muted" style="font-size:13px">${esc(m.time)}</div>` : ""}</td>
          <td><b>${esc(m.title)}</b>${m.conf ? ' <span class="chip c-gray">Confidential</span>' : ""}${m.place ? `<div class="t-muted" style="font-size:13px">${esc(m.place)}</div>` : ""}</td><td>${esc(mtKind(m.kind))}</td><td class="num">${mtPeople(m).length}</td>
          <td>${m.minutes ? `<span class="chip ${m.status === "FINAL" ? "c-ok" : "c-blue"}">${m.status === "FINAL" ? "Approved" : "Draft ready"}</span>` : m.transcript || m.notes ? '<span class="chip c-gold">Not written yet</span>' : '<span class="chip c-gray">Nothing recorded</span>'}</td>
          <td class="num">${mtOpen(m).length || "—"}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state"><span class="es-ic">${icon("mic", 22)}</span><p>${all.length ? "No meetings match." : `No meetings yet.${S.canEdit ? ' <button class="link" data-mt-new>Start the first one</button>' : ""}`}</p></div>`}</section>`;
};

/* ---------- one meeting ---------- */
const mtF = (k, label, html) => `<div class="field"><label for="mt-${k}">${label}</label>${html}</div>`;
const mtIn = (k, v, extra = "") => `<input class="input" id="mt-${k}" data-mt-f="${k}" value="${esc(v ?? "")}" ${extra}>`;
const mtTa = (k, v, rows, ph = "", extra = "") => `<textarea class="input" id="mt-${k}" data-mt-f="${k}" rows="${rows}" placeholder="${esc(ph)}" ${extra}>${esc(v ?? "")}</textarea>`;
function mtDiscText(d) { return (d || []).map((t) => [t.topic, ...(t.points || []).map((p) => `• ${p}`)].join("\n")).join("\n\n"); }
function mtDiscParse(s) { return String(s || "").split(/\n\s*\n/).map((b) => b.split("\n").map((x) => x.trim()).filter(Boolean)).filter((b) => b.length).map(([topic, ...pts]) => ({ topic: topic.replace(/^[•\-*]\s*/, ""), points: pts.map((p) => p.replace(/^[•\-*]\s*/, "")) })); }
function mtRecCard(m) {
  const R = S.mtRec && S.mtRec.id === m.id ? S.mtRec : null; const other = S.mtRec && !R;
  const canRec = !!(navigator.mediaDevices?.getUserMedia || MtSR);
  const lines = String(m.transcript || "").split("\n").filter(Boolean).slice(-12);
  return `<section class="card mt-rec${R ? " on" : ""}">
    <div class="mt-rec-top">
      ${!S.canEdit ? "" : R ? `<button type="button" class="btn mt-stop" data-mt-stop>${icon("mic", 18)}Stop and save</button><button type="button" class="btn btn-ghost" data-mt-pause>${R.paused ? "Resume" : "Pause"}</button>`
        : other ? `<span class="t-muted">Another meeting is being recorded. <button type="button" class="link" data-mt-open="${esc(S.mtRec.id)}">Go to it</button></span>`
        : canRec ? `<button type="button" class="btn btn-primary mt-start" data-mt-start>${icon("mic", 18)}${m.transcript ? "Record more" : "Start recording"}</button>` : `<span class="t-muted">This browser can't record. Use Chrome or Edge, or upload a transcript below.</span>`}
      <span class="mt-time" id="mt-clock" aria-live="off">${R ? mtMMSS(mtElapsed()) : ""}</span>
      ${R ? `<span class="mt-dot${R.paused ? " paused" : ""}" aria-hidden="true"></span><span class="t-muted" id="mt-state">${R.paused ? "Paused" : "Recording"}</span>` : ""}
      <span style="flex:1"></span>
      ${S.canEdit && !R ? `<label class="t-muted" style="font-size:13px" for="mt-lang">Language</label><select class="input" id="mt-lang" style="width:auto">${opts(MT_LANGS, S.mtLang)}</select>
        <label class="check" style="font-size:13px"><input type="checkbox" id="mt-keepaudio" ${S.mtKeepAudio !== false ? "checked" : ""}><span>Keep the audio</span></label>` : ""}
    </div>
    <div class="mt-live" id="mt-live" aria-live="polite">${lines.length ? lines.map((l) => `<div>${esc(l)}</div>`).join("") : `<div class="t-muted">${R ? "Listening… words appear here as people speak." : "The transcript appears here while you record."}</div>`}<div class="mt-interim" id="mt-interim"></div></div>
    ${R?.err ? `<p class="err" style="margin:8px 0 0">${esc(R.err)}</p>` : ""}
    <p class="t-muted" style="font-size:12.5px;margin:8px 0 0">Put the phone or laptop in the middle of the table. Speech-to-text works best in Chrome or Edge and with one person talking at a time. Ask everyone's permission before recording (Data Privacy Act).</p>
  </section>`;
}
function mtMinCard(m) {
  const M = m.minutes; const ed = S.canEdit; const busy = S.mtBusy;
  const gen = ed ? `<button type="button" class="btn ${M ? "btn-ghost" : "btn-primary"}" data-mt-gen ${busy ? "disabled" : ""}>${busy ? "Writing the minutes…" : M ? "Write again from the transcript" : "Write the minutes"}</button>` : "";
  if (!M) return `<section class="card"><div class="card-head"><h2>Minutes</h2>${gen}</div><p class="t-muted" style="margin:0">${S.sample ? "When the meeting ends, press Write the minutes. Claude reads the transcript and your notes and writes the summary, decisions and action items." : "Writing minutes needs Claude, which isn't switched on here. You can still record, keep the transcript and type the minutes yourself."}</p>
    ${ed && !S.sample ? '<button type="button" class="link" data-mt-blank style="margin-top:8px">Type the minutes myself</button>' : ""}</section>`;
  const dis = ed ? "" : "disabled";
  return `<section class="card mt-min"><div class="card-head"><h2>Minutes</h2><div class="mt-acts">${gen}
      <button type="button" class="btn btn-ghost btn-sm" data-mt-word>${icon("download", 16)}Word</button><button type="button" class="btn btn-ghost btn-sm" data-mt-pdf>${icon("pdf", 16)}PDF</button><button type="button" class="btn btn-ghost btn-sm" data-mt-copy>Copy text</button></div></div>
    <div class="stack" style="gap:14px">
      ${mtF("mstatus", "Status", `<select class="input" id="mt-mstatus" data-mt-f="status" style="max-width:240px" ${dis}>${opts([["DRAFT", "Draft"], ["FINAL", "Approved / final"]], m.status || "DRAFT")}</select>`)}
      ${mtF("msum", "Summary", `<textarea class="input" id="mt-msum" data-mt-m="summary" rows="4" ${dis}>${esc(M.summary || "")}</textarea>`)}
      ${mtF("mdisc", "Discussion <span class=\"t-muted\" style=\"font-weight:400\">(a topic on one line, its points below it, a blank line between topics)</span>", `<textarea class="input" id="mt-mdisc" data-mt-m="discussion" rows="9" ${dis}>${esc(mtDiscText(M.discussion))}</textarea>`)}
      ${mtF("mdec", "Decisions <span class=\"t-muted\" style=\"font-weight:400\">(one per line)</span>", `<textarea class="input" id="mt-mdec" data-mt-m="decisions" rows="4" ${dis}>${esc((M.decisions || []).join("\n"))}</textarea>`)}
      <div class="field"><label>Action items</label><div class="table-wrap"><table class="mt-act-t"><thead><tr><th style="width:44px">Done</th><th>Task</th><th style="width:200px">Who</th><th style="width:160px">Due</th>${ed ? '<th style="width:40px"></th>' : ""}</tr></thead><tbody>
        ${(M.actions || []).map((a) => `<tr><td><input type="checkbox" data-mt-a="${esc(a.id)}|done" ${a.done ? "checked" : ""} aria-label="Done" ${dis}></td><td><input class="input" data-mt-a="${esc(a.id)}|task" value="${esc(a.task || "")}" aria-label="Task" ${dis}></td>
          <td><input class="input" data-mt-a="${esc(a.id)}|owner" value="${esc(a.owner || "")}" list="mt-people" aria-label="Who" ${dis}></td><td><input class="input" type="date" data-mt-a="${esc(a.id)}|due" value="${esc(a.due || "")}" aria-label="Due" ${dis}></td>
          ${ed ? `<td><button type="button" class="link danger" data-mt-arm="${esc(a.id)}" aria-label="Remove">✕</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="t-muted">No action items.</td></tr>`}</tbody></table></div>
        ${ed ? '<button type="button" class="link" data-mt-aadd style="align-self:flex-start;margin-top:6px">+ Add action item</button>' : ""}</div>
      ${mtF("mnext", "Next meeting", `<input class="input" id="mt-mnext" data-mt-m="next" value="${esc(M.next || "")}" placeholder="e.g. October 26, 2026, 9:00 AM, Head Office" ${dis}>`)}
      ${M.at ? `<p class="t-muted" style="font-size:12.5px;margin:0">${M.by === "claude" ? "Written by Claude" : "Last written"} ${fmtDate(String(M.at).slice(0, 10))}. Check names, numbers and dates before you approve it.</p>` : ""}
    </div></section>`;
}
VIEWS.meetRoom = () => {
  const id = S.view.id; if (!id) return VIEWS.meet(); const saved = S.meets.get(id);
  if (saved && !mtSees(saved)) return backLink('data-go="meet"', "Meeting notes") + head("Meeting notes", "Confidential meeting") + '<section class="card"><p>Only HR Manager and the person who wrote it can open this meeting.</p></section>';
  const m = mtDraft(id); const ed = S.canEdit; const dis = ed ? "" : "disabled";
  const names = active().map((e) => fullName(e)).sort();
  return backLink('data-go="meet"', "Meeting notes") + head(mtKind(m.kind), esc(m.title || "New meeting"), ed ? `<span class="t-muted" id="mt-dirty" style="font-size:13px">${S.mtDirty ? "Not saved yet" : saved ? "Saved" : ""}</span><button type="button" class="btn btn-primary" data-mt-save>Save</button>${saved ? '<button type="button" class="btn btn-ghost" data-mt-del>Delete</button>' : ""}` : "") + `
    <form id="mt-form" class="stack" style="gap:16px" data-keep onsubmit="return false">
    <datalist id="mt-people">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    <section class="card"><div class="form-grid">
      <div class="field" style="grid-column:1/-1"><label for="mt-title">Meeting title</label>${mtIn("title", m.title, `placeholder="e.g. Monthly HR and admin meeting" maxlength="140" ${dis}`)}</div>
      ${mtF("kind", "Type", `<select class="input" id="mt-kind" data-mt-f="kind" ${dis}>${opts(MT_KINDS, m.kind)}</select>`)}
      ${mtF("date", "Date", mtIn("date", m.date, `type="date" ${dis}`))}
      ${mtF("time", "Start time", mtIn("time", m.time, `type="time" ${dis}`))}
      ${mtF("place", "Venue", mtIn("place", m.place, `placeholder="e.g. Head Office conference room, or Google Meet" ${dis}`))}
      <div class="field" style="grid-column:1/-1"><label for="mt-attendees">Attendees <span class="t-muted" style="font-weight:400">(one per line)</span></label>${mtTa("attendees", m.attendees, 3, "Type names, or add employees below", dis)}
        ${ed ? `<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><input class="input" id="mt-addp" list="mt-people" placeholder="Add an employee" style="max-width:280px" aria-label="Add an employee"><button type="button" class="btn btn-ghost btn-sm" data-mt-addp>Add</button></div>` : ""}</div>
      <div class="field" style="grid-column:1/-1"><label for="mt-agenda">Agenda <span class="t-muted" style="font-weight:400">(optional, helps Claude organize the minutes)</span></label>${mtTa("agenda", m.agenda, 3, "1. Attendance and overtime\n2. New hires for Riverside\n3. Other matters", dis)}</div>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" id="mt-conf" data-mt-f="conf" ${m.conf ? "checked" : ""} ${dis}><span>Confidential: only HR Manager and the person who wrote it can open it (e.g. administrative hearings)</span></label>
    </div></section>
    ${mtRecCard(m)}
    <section class="card"><div class="card-head"><h2>Transcript and notes</h2>${ed ? `<label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon("upload", 16)}Upload a transcript<input type="file" id="mt-txfile" accept=".txt,.vtt,.srt,text/plain,text/vtt" hidden></label>` : ""}</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label for="mt-transcript">Transcript <span class="t-muted" style="font-weight:400">(fix any wrong words here before writing the minutes)</span></label>${mtTa("transcript", m.transcript, 8, "Recorded speech appears here. You can also paste a transcript from Zoom, Teams or Google Meet.", `${dis} ${S.mtRec?.id === m.id ? "readonly" : ""}`)}</div>
        <div class="field" style="grid-column:1/-1"><label for="mt-notes">Your notes</label>${mtTa("notes", m.notes, 4, "Anything the recording may miss: who was absent, figures shown on screen, side agreements", dis)}</div>
      </div>
      ${(m.audio || []).length ? `<div class="mt-audio">${m.audio.map((a, i) => `<div class="mt-aud-row"><span class="t-muted" style="font-size:13px">Recording ${i + 1}${a.dur ? ` · ${mtMMSS(a.dur)}` : ""}</span><audio controls preload="none" src="/_blob/${esc(a.id)}"></audio>${ed ? `<button type="button" class="link danger" data-mt-adel="${esc(a.id)}">Delete</button>` : ""}</div>`).join("")}</div>` : ""}
    </section>
    ${mtMinCard(m)}
    </form>`;
};

/* ---------- recording: microphone audio (MediaRecorder) + live speech-to-text (browser) ---------- */
let mtStream = null, mtMR = null, mtChunks = [], mtSRi = null, mtTimer = null, mtAutosave = null;
const mtElapsed = () => { const R = S.mtRec; if (!R) return 0; return R.acc + (R.paused ? 0 : Date.now() - R.since); };
function mtLiveLine(text) {
  const box = $("#mt-live"); if (!box) return; box.querySelector(".t-muted")?.remove();
  const d = document.createElement("div"); d.textContent = text; box.insertBefore(d, $("#mt-interim")); while (box.children.length > 40) box.firstElementChild.remove(); box.scrollTop = box.scrollHeight;
}
function mtHeard(text) {
  const t = String(text || "").trim(); const R = S.mtRec; if (!t || !R) return; const line = `[${mtMMSS(mtElapsed())}] ${t}`;
  const m = S.mtD?.id === R.id ? S.mtD : null; if (!m) return;
  m.transcript = (m.transcript && !m.transcript.endsWith("\n") ? m.transcript + "\n" : m.transcript || "") + line + "\n"; S.mtDirty = true;
  mtLiveLine(line); const ta = $("#mt-transcript"); if (ta) { ta.value = m.transcript; ta.scrollTop = ta.scrollHeight; }
}
function mtStartSR() {
  if (!MtSR || !S.mtRec) return; const r = new MtSR(); r.lang = S.mtLang; r.continuous = true; r.interimResults = true; mtSRi = r;
  r.onresult = (ev) => { let interim = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) { const x = ev.results[i]; if (x.isFinal) mtHeard(x[0].transcript); else interim += x[0].transcript; } const el = $("#mt-interim"); if (el) el.textContent = interim; };
  r.onerror = (e) => { if (!S.mtRec) return; if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) { S.mtRec.srOff = true; S.mtRec.err = mtStream ? "Speech-to-text isn't allowed in this browser, so only the audio is being kept. Type or paste the transcript later, or use Chrome or Edge." : "The microphone isn't allowed here. Allow it in the browser's site settings and try again."; mtPaint(); } };
  r.onend = () => { const R = S.mtRec; if (R && !R.paused && !R.srOff && mtSRi === r) setTimeout(() => { if (S.mtRec && !S.mtRec.paused && mtSRi === r) try { r.start(); } catch {} }, 250); };
  try { r.start(); } catch {}
}
function mtStopSR() { const r = mtSRi; mtSRi = null; if (r) { try { r.stop(); } catch {} } const el = $("#mt-interim"); if (el) el.textContent = ""; }
function mtPaint() { const R = S.mtRec; const t = $("#mt-clock"); if (t) t.textContent = R ? mtMMSS(mtElapsed()) : ""; if (S.view.name === "meetRoom" && R && S.view.id === R.id) { const card = document.querySelector(".mt-rec"); if (card) { const w = document.createElement("div"); w.innerHTML = mtRecCard(S.mtD); card.replaceWith(w.firstElementChild); const box = $("#mt-live"); if (box) box.scrollTop = box.scrollHeight; } } }
async function mtStart() {
  const m = S.mtD; if (!m || S.mtRec) return; const keep = $("#mt-keepaudio")?.checked !== false; S.mtKeepAudio = keep;
  if (!MtSR && !keep) { toast("This browser can't turn speech into text. Tick Keep the audio, or use Chrome or Edge."); return; }
  if (keep && navigator.mediaDevices?.getUserMedia) {
    try { mtStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { mtStream = null; if (!MtSR) { toast("The microphone isn't allowed here. Allow it in the browser's site settings, or open the website version."); return; } toast("Couldn't keep the audio here, so only the transcript is recorded."); }
  }
  S.mtRec = { id: m.id, since: Date.now(), acc: 0, paused: false, err: "", srOff: false, startedAt: Date.now() };
  if (mtStream && window.MediaRecorder) {
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    try { mtMR = new MediaRecorder(mtStream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 16000 }); mtChunks = []; mtMR.ondataavailable = (e) => { if (e.data?.size) mtChunks.push(e.data); }; mtMR.start(10000); } catch { mtMR = null; }
  }
  mtStartSR(); clearInterval(mtTimer); mtTimer = setInterval(() => { const t = $("#mt-clock"); if (t && S.mtRec) t.textContent = mtMMSS(mtElapsed()); }, 1000);
  clearInterval(mtAutosave); mtAutosave = setInterval(() => { if (S.mtRec && S.mtDirty) mtSave(true); }, 60000);
  if (!S.meets.has(m.id)) mtSave(true);
  render();
}
function mtPause() {
  const R = S.mtRec; if (!R) return;
  if (R.paused) { R.paused = false; R.since = Date.now(); try { mtMR?.state === "paused" && mtMR.resume(); } catch {} mtStartSR(); }
  else { R.acc += Date.now() - R.since; R.paused = true; mtStopSR(); try { mtMR?.state === "recording" && mtMR.pause(); } catch {} }
  mtPaint();
}
async function mtStop() {
  const R = S.mtRec; if (!R) return; const dur = mtElapsed(); clearInterval(mtTimer); clearInterval(mtAutosave); mtStopSR();
  const blob = await new Promise((ok) => { if (!mtMR || mtMR.state === "inactive") return ok(null); mtMR.onstop = () => ok(mtChunks.length ? new Blob(mtChunks, { type: mtMR.mimeType || "audio/webm" }) : null); try { mtMR.stop(); } catch { ok(null); } });
  mtStream?.getTracks().forEach((t) => t.stop()); mtStream = null; mtMR = null; mtChunks = []; S.mtRec = null;
  const m = S.mtD?.id === R.id ? S.mtD : null; if (!m) { render(); return; }
  if (blob && S.assets) {
    if (blob.size > 19.5 * 1048576) toast("The audio is over 20 MB, so only the transcript is kept.");
    else { try { let up; try { up = await S.assets.upload(blob); } catch { up = await S.assets.upload(new Blob([blob], { type: blob.type.replace(/^audio\//, "video/").replace(/;.*$/, "") })); }
      m.audio = [...(m.audio || []), { id: up.id, type: blob.type, size: blob.size, dur }]; S.mtDirty = true; } catch { toast("Couldn't keep the audio file. The transcript is saved."); } }
  }
  await mtSave(true); toast(m.transcript ? "Recording saved. Check the transcript, then press Write the minutes." : "Recording saved."); render();
}
// While recording, the meeting page doesn't redraw for other people's changes; a small bar shows on other pages.
{ const b = refresh; refresh = (...a) => { if (S.mtRec && S.view.name === "meetRoom") { S.ver++; return; } return b(...a); }; }
{ const b = render; render = (...a) => { b(...a); const R = S.mtRec; if (R && S.view.name !== "meetRoom" && !S.selfMode) { const main = $("#main"); if (main && !main.querySelector(".mt-bar")) main.insertAdjacentHTML("afterbegin", `<div class="mt-bar" role="status"><span class="mt-dot${R.paused ? " paused" : ""}"></span><b>${R.paused ? "Recording paused" : "Recording a meeting"}</b><button class="link" data-mt-open="${esc(R.id)}">Go back to it</button></div>`); } }; }
window.addEventListener("beforeunload", (ev) => { if (S.mtRec || (S.mtDirty && S.view.name === "meetRoom")) { ev.preventDefault(); ev.returnValue = ""; } });

/* ---------- minutes by Claude ---------- */
async function mtWrite() {
  const m = S.mtD; if (!m || S.mtBusy) return;
  if (!S.sample) { toast(S.realEdit ? "Writing minutes needs Claude, which isn't switched on here." : "Writing minutes needs Claude."); return; }
  const tx = String(m.transcript || "").trim(), notes = String(m.notes || "").trim();
  if (!tx && !notes) { toast("Record the meeting or type some notes first."); return; }
  if (m.minutes && !await askConfirm("Write the minutes again? Your changes to the current minutes will be replaced.", "Write again")) return;
  S.mtBusy = true; render();
  const co = S.org?.companyName || CO_DEFAULT; const cut = (s, n) => (s.length > n ? s.slice(0, n) + "\n[...the rest was cut for length]" : s);
  const prompt = `You are the minutes secretary of ${co}, a property management company in the Philippines. Write formal minutes of the meeting below.
The transcript comes from automatic speech-to-text${m.src ? ` made by ${m.place || "the meeting platform"} (each line starts with the speaker's name)` : ""}: it may mix English and Tagalog (Taglish)${m.src ? "" : ", has no speaker names,"} and may contain recognition mistakes. Fix obvious mistakes from context. Write the minutes in clear, professional English (translate Tagalog). Never invent facts, names, figures, dates or decisions that the transcript or notes don't support. Name a person as the owner of an action item only when the text makes clear who will do it; otherwise leave owner empty. Today is ${todayISO()}; turn relative dates such as "next Friday" into YYYY-MM-DD.
Return only JSON, no other text:
{"summary": "3 to 6 sentences", "discussion": [{"topic": "short heading", "points": ["what was discussed or reported"]}], "decisions": ["each decision or agreement"], "actions": [{"task": "what will be done", "owner": "person or empty", "due": "YYYY-MM-DD or empty"}], "next": "next meeting date, time and place if mentioned, else empty"}

MEETING
Title: ${m.title || "(none)"}
Type: ${mtKind(m.kind)}
Date and time: ${m.date} ${m.time || ""}
Venue: ${m.place || "(not given)"}
Attendees: ${mtPeople(m).join("; ") || "(not listed)"}
Agenda:
${m.agenda || "(none)"}

NOTES TYPED DURING THE MEETING
${cut(notes, 20000) || "(none)"}

TRANSCRIPT
${cut(tx, 160000) || "(none)"}`;
  try {
    const r = await S.sample.json(prompt, { modelTier: "default" });
    const arr = (x) => (Array.isArray(x) ? x : []); const str = (x) => String(x ?? "").trim();
    const due = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(str(d)) ? str(d) : "");
    const cur = S.mtD?.id === m.id ? S.mtD : m;
    cur.minutes = { summary: str(r.summary), discussion: arr(r.discussion).map((t) => ({ topic: str(t?.topic), points: arr(t?.points).map(str).filter(Boolean) })).filter((t) => t.topic || t.points.length),
      decisions: arr(r.decisions).map(str).filter(Boolean), actions: arr(r.actions).map((a) => ({ id: uid(), task: str(a?.task), owner: str(a?.owner), due: due(a?.due), done: false })).filter((a) => a.task),
      next: str(r.next), at: new Date().toISOString(), by: "claude" };
    cur.status = "DRAFT"; S.mtDirty = true; S.mtBusy = false; await mtSave(true); logActivity(`Claude wrote the minutes of ${cur.title}`); toast("Minutes written. Check them, then download or approve.");
  } catch (e) { S.mtBusy = false; if (e?.code === "not_granted") toast("Claude wasn't allowed, so the minutes weren't written."); else toast("Couldn't write the minutes. Try again."); }
  render(); setTimeout(() => document.querySelector(".mt-min")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

/* ---------- downloads ---------- */
const mtFile = (m, ext) => `Minutes - ${String(m.title || "Meeting").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)} - ${m.date}.${ext}`;
function mtPlain(m) {
  const M = m.minutes || {}; const L = [];
  L.push(`MINUTES OF THE MEETING`, m.title, `${fmtDate(m.date)}${m.time ? `, ${m.time}` : ""}${m.place ? ` · ${m.place}` : ""}`, "");
  if (mtPeople(m).length) L.push(`Attendees: ${mtPeople(m).join(", ")}`, "");
  if (M.summary) L.push("SUMMARY", M.summary, "");
  if ((M.discussion || []).length) { L.push("DISCUSSION"); for (const t of M.discussion) { L.push(t.topic); for (const p of t.points || []) L.push(`• ${p}`); L.push(""); } }
  if ((M.decisions || []).length) { L.push("DECISIONS"); M.decisions.forEach((d, i) => L.push(`${i + 1}. ${d}`)); L.push(""); }
  if ((M.actions || []).length) { L.push("ACTION ITEMS"); for (const a of M.actions) L.push(`${a.done ? "☑" : "☐"} ${a.task}${a.owner ? ` (${a.owner})` : ""}${a.due ? ` · due ${fmtDate(a.due)}` : ""}`); L.push(""); }
  if (M.next) L.push(`Next meeting: ${M.next}`);
  return L.join("\n").trim();
}
function mtHtml(m) {
  const M = m.minutes || {}; const co = esc(S.org?.companyName || CO_DEFAULT); const P = mtPeople(m);
  const row = (k, v) => (v ? `<tr><td style="width:150px;font-weight:bold;background:#F4F1EA">${k}</td><td>${v}</td></tr>` : "");
  return `<p style="margin:0;font-size:10pt;color:#555;letter-spacing:1px">${co}</p><h1 style="font-family:Georgia,serif;font-size:20pt;margin:4pt 0 2pt">Minutes of the Meeting</h1><p style="margin:0 0 12pt;font-size:13pt"><b>${esc(m.title)}</b></p>
    <table>${row("Date and time", `${fmtDate(m.date)}${m.time ? `, ${esc(m.time)}` : ""}`)}${row("Type", esc(mtKind(m.kind)))}${row("Venue", esc(m.place || ""))}${row("Attendees", esc(P.join(", ")))}${row("Agenda", esc(m.agenda || "").replace(/\n/g, "<br>"))}</table>
    ${M.summary ? `<h2>Summary</h2><p>${esc(M.summary).replace(/\n/g, "<br>")}</p>` : ""}
    ${(M.discussion || []).length ? `<h2>Discussion</h2>${M.discussion.map((t) => `<h3>${esc(t.topic)}</h3>${(t.points || []).length ? `<ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}`).join("")}` : ""}
    ${(M.decisions || []).length ? `<h2>Decisions</h2><ol>${M.decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ol>` : ""}
    ${(M.actions || []).length ? `<h2>Action items</h2><table><tr><th>#</th><th>Task</th><th>Responsible</th><th>Due</th><th>Status</th></tr>${M.actions.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.task)}</td><td>${esc(a.owner || "")}</td><td>${a.due ? fmtDate(a.due) : ""}</td><td>${a.done ? "Done" : "Open"}</td></tr>`).join("")}</table>` : ""}
    ${M.next ? `<h2>Next meeting</h2><p>${esc(M.next)}</p>` : ""}
    <table style="margin-top:36pt;border:none"><tr><td style="border:none;width:50%;padding-top:30pt">Prepared by:<br><br>______________________________<br>${esc(mtBy(m.by))}</td><td style="border:none;padding-top:30pt">Noted by:<br><br>______________________________<br>HR Manager</td></tr></table>`;
}
async function mtWord(m) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
    <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#14213D}h2{font-family:Georgia,serif;font-size:14pt;color:#0E1A33;border-bottom:1px solid #C9A45C;padding-bottom:2pt;margin-top:16pt}h3{font-size:11.5pt;margin:10pt 0 2pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #BBB;padding:4pt 6pt;vertical-align:top;font-size:10.5pt}th{background:#0E1A33;color:#fff;text-align:left}</style></head><body>${mtHtml(m)}</body></html>`;
  if (await saveBlob(mtFile(m, "doc"), new Blob(["\ufeff", doc], { type: "application/msword" }))) toast("Minutes downloaded for Word.");
}
async function mtPdf(m) {
  let J; try { J = await loadLib("pdf"); await loadLib("pdfTable"); } catch { toast("Couldn't load the PDF tools. Check your connection and try again."); return; }
  const doc = new J({ unit: "pt", format: "a4" }); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(); const M = m.minutes || {};
  const navy = [14, 26, 51], gold = [201, 164, 92], ink = [20, 33, 61], muted = [90, 100, 120]; let y = 50;
  try { doc.addImage(CO_LOGO, "PNG", 40, 30, 40, 40); } catch {}
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(S.org?.companyName || CO_DEFAULT, 90, 46);
  doc.setFont("times", "bold"); doc.setFontSize(20); doc.setTextColor(...navy); doc.text("Minutes of the Meeting", 90, 68); y = 96;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...ink); doc.splitTextToSize(m.title || "", W - 80).forEach((l) => { doc.text(l, 40, y); y += 16; });
  doc.autoTable({ startY: y + 2, body: [["Date and time", `${fmtDate(m.date)}${m.time ? `, ${m.time}` : ""}`], ["Type", mtKind(m.kind)], ...(m.place ? [["Venue", m.place]] : []), ...(mtPeople(m).length ? [["Attendees", mtPeople(m).join(", ")]] : []), ...(m.agenda ? [["Agenda", m.agenda]] : [])],
    theme: "grid", styles: { fontSize: 10, textColor: ink, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 110, fontStyle: "bold", fillColor: [244, 241, 234] } }, margin: { left: 40, right: 40 } });
  y = doc.lastAutoTable.finalY + 22;
  const need = (h) => { if (y + h > H - 50) { doc.addPage(); y = 50; } };
  const h2 = (t) => { need(40); doc.setFont("times", "bold"); doc.setFontSize(14); doc.setTextColor(...navy); doc.text(t, 40, y); doc.setDrawColor(...gold); doc.setLineWidth(0.8); doc.line(40, y + 5, W - 40, y + 5); y += 22; };
  const para = (t, x = 40, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(10.5); doc.setTextColor(...ink); for (const l of doc.splitTextToSize(String(t), W - 40 - x)) { need(15); doc.text(l, x, y); y += 14; } };
  if (M.summary) { h2("Summary"); para(M.summary); y += 8; }
  if ((M.discussion || []).length) { h2("Discussion"); for (const t of M.discussion) { para(t.topic, 40, true); for (const p of t.points || []) { need(15); doc.setFont("helvetica", "normal"); doc.text("•", 50, y); para(p, 62); } y += 6; } }
  if ((M.decisions || []).length) { h2("Decisions"); M.decisions.forEach((d, i) => { need(15); doc.setFont("helvetica", "normal"); doc.text(`${i + 1}.`, 44, y); para(d, 62); }); y += 6; }
  if ((M.actions || []).length) { h2("Action items"); doc.autoTable({ startY: y, head: [["#", "Task", "Responsible", "Due", "Status"]], body: M.actions.map((a, i) => [i + 1, a.task, a.owner || "", a.due ? fmtDate(a.due) : "", a.done ? "Done" : "Open"]),
    theme: "grid", headStyles: { fillColor: navy }, styles: { fontSize: 9.5, textColor: ink }, columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 110 }, 3: { cellWidth: 80 }, 4: { cellWidth: 50 } }, margin: { left: 40, right: 40 } }); y = doc.lastAutoTable.finalY + 20; }
  if (M.next) { h2("Next meeting"); para(M.next); }
  need(90); y += 40; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text("Prepared by:", 40, y); doc.text("Noted by:", W / 2 + 10, y); y += 36; doc.line(40, y, W / 2 - 30, y); doc.line(W / 2 + 10, y, W - 40, y); y += 13;
  doc.text(mtBy(m.by), 40, y); doc.text("HR Manager", W / 2 + 10, y);
  const n = doc.internal.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(`${m.title} · Page ${i} of ${n}`, W - 40, H - 22, { align: "right" }); }
  if (await saveBlob(mtFile(m, "pdf"), doc.output("blob"))) toast("Minutes downloaded as PDF.");
}

/* ---------- events ---------- */
const mtMark = () => { S.mtDirty = true; const d = $("#mt-dirty"); if (d) d.textContent = "Not saved yet"; };
document.addEventListener("input", (ev) => {
  const t = ev.target; if (t.id === "mt-q") { S.mtQ = t.value; const p0 = t.selectionStart; render(); const i = $("#mt-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } return; }
  const m = S.mtD; if (!m || S.view.name !== "meetRoom") return;
  if (t.dataset.mtF) { m[t.dataset.mtF] = t.type === "checkbox" ? t.checked : t.value; mtMark(); if (t.dataset.mtF === "title") { const h = document.querySelector("#main h1"); if (h) h.textContent = t.value || "New meeting"; } return; }
  if (t.dataset.mtM && m.minutes) { const k = t.dataset.mtM; m.minutes = { ...m.minutes, [k]: k === "discussion" ? mtDiscParse(t.value) : k === "decisions" ? t.value.split("\n").map((x) => x.trim()).filter(Boolean) : t.value }; mtMark(); return; }
  if (t.dataset.mtA && m.minutes) { const [aid, f] = t.dataset.mtA.split("|"); m.minutes = { ...m.minutes, actions: (m.minutes.actions || []).map((a) => (a.id === aid ? { ...a, [f]: t.type === "checkbox" ? t.checked : t.value } : a)) }; mtMark(); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "mt-lang") { S.mtLang = t.value; return; }
  if (t.id === "mt-keepaudio") { S.mtKeepAudio = t.checked; return; }
  if (t.matches?.("[data-mt-f],[data-mt-a]") && (t.type === "checkbox" || t.tagName === "SELECT")) { t.dispatchEvent(new Event("input", { bubbles: true })); return; }
  if (t.dataset?.mtDone) { const [mid, aid] = t.dataset.mtDone.split("|"); const m = S.meets.get(mid); if (!m || !S.canEdit) return;
    const next = { ...m, minutes: { ...m.minutes, actions: m.minutes.actions.map((a) => (a.id === aid ? { ...a, done: true, doneAt: todayISO() } : a)) } };
    try { await put("meetings", next); if (S.mtD?.id === mid && !S.mtDirty) S.mtD = null; toast("Marked done."); render(); } catch { toast("Couldn't save. Try again."); } return; }
  if (t.id === "mt-txfile") { const f = t.files?.[0]; t.value = ""; if (!f || !S.mtD) return; if (f.size > 3 * 1048576) { toast("That file is too big for a transcript."); return; }
    let s = await f.text(); if (/\.(vtt|srt)$/i.test(f.name) || /^WEBVTT/.test(s)) s = s.replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "").replace(/^(\d\d:)?\d\d:\d\d[.,]\d+\s*-->\s*.*$/gm, "").replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
    const m = S.mtD; m.transcript = (m.transcript ? m.transcript.replace(/\n*$/, "\n\n") : "") + s.trim() + "\n"; mtMark(); const ta = $("#mt-transcript"); if (ta) ta.value = m.transcript; toast("Transcript added. Press Save to keep it."); }
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-mt-new],[data-mt-open],[data-mt-save],[data-mt-del],[data-mt-start],[data-mt-stop],[data-mt-pause],[data-mt-gen],[data-mt-blank],[data-mt-word],[data-mt-pdf],[data-mt-copy],[data-mt-aadd],[data-mt-arm],[data-mt-addp],[data-mt-adel]"); if (!t) return;
  if (t.matches("input")) return; const d = t.dataset;
  if (d.mtNew != null) { if (!S.canEdit) return; const m = mtNew(); S.mtD = m; S.mtDirty = true; go("meetRoom", { id: m.id }); setTimeout(() => $("#mt-title")?.focus(), 60); return; }
  if (d.mtOpen) { ev.stopPropagation(); if (S.mtD?.id !== d.mtOpen && S.mtDirty && S.mtD && S.meets.has(S.mtD.id)) await mtSave(true); if (S.mtD?.id !== d.mtOpen && !S.mtRec) S.mtD = null; go("meetRoom", { id: d.mtOpen }); return; }
  const m = S.mtD; if (!m) return;
  if (d.mtWord != null) return mtWord(m); if (d.mtPdf != null) return mtPdf(m);
  if (d.mtCopy != null) { const ok = await copyText(mtPlain(m)); toast(ok ? "Copied. Paste it in an email, Viber or Messenger." : "Couldn't copy here."); return; }
  if (!S.canEdit) return;
  if (d.mtSave != null) { if (await mtSave()) render(); return; }
  if (d.mtStart != null) return mtStart(); if (d.mtStop != null) return mtStop(); if (d.mtPause != null) return mtPause();
  if (d.mtGen != null) return mtWrite();
  if (d.mtBlank != null) { m.minutes = { summary: "", discussion: [], decisions: [], actions: [], next: "", at: new Date().toISOString(), by: S.myId }; mtMark(); render(); return; }
  if (d.mtAadd != null) { m.minutes = { ...m.minutes, actions: [...(m.minutes?.actions || []), { id: uid(), task: "", owner: "", due: "", done: false }] }; mtMark(); render(); const ins = document.querySelectorAll('.mt-act-t [data-mt-a$="|task"]'); ins[ins.length - 1]?.focus(); return; }
  if (d.mtArm) { m.minutes = { ...m.minutes, actions: (m.minutes?.actions || []).filter((a) => a.id !== d.mtArm) }; mtMark(); render(); return; }
  if (d.mtAddp != null) { const i = $("#mt-addp"); const n = i?.value.trim(); if (!n) return; if (!mtPeople(m).some((x) => x.toLowerCase() === n.toLowerCase())) { m.attendees = (m.attendees ? m.attendees.replace(/\n*$/, "\n") : "") + n; mtMark(); const ta = $("#mt-attendees"); if (ta) ta.value = m.attendees; } i.value = ""; i.focus(); return; }
  if (d.mtAdel) { if (!await askConfirm("Delete this audio recording? The transcript stays.", "Delete")) return; m.audio = (m.audio || []).filter((a) => a.id !== d.mtAdel); try { await S.assets?.delete(d.mtAdel); } catch {} await mtSave(true); render(); return; }
  if (d.mtDel != null) { if (S.mtRec?.id === m.id) { toast("Stop the recording first."); return; } if (!await askConfirm(`Delete the meeting "${m.title || "New meeting"}" with its transcript, audio and minutes?`, "Delete")) return;
    try { await drop("meetings", m.id); for (const a of m.audio || []) { try { await S.assets?.delete(a.id); } catch {} } logActivity(`Deleted the meeting notes ${m.title}`); S.mtD = null; S.mtDirty = false; toast("Meeting deleted."); go("meet"); } catch { toast("Couldn't delete. Try again."); } }
}, true);
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "mt-addp") { ev.preventDefault(); document.querySelector("[data-mt-addp]")?.click(); } });
// Leaving the meeting page keeps unsaved typing in the draft; opening the list again offers it back.
{ const b = VIEWS.meet; VIEWS.meet = (...x) => { let h = b(...x); const D = S.mtD; if (D && S.mtDirty && !S.mtRec && S.canEdit && (D.title || D.transcript || D.notes || D.attendees)) h = h.replace("</header>", `</header><div class="notice"><span>You have unsaved changes in <b>${esc(D.title || "a new meeting")}</b>.</span><button class="btn btn-ghost btn-sm" data-mt-open="${esc(D.id)}">Go back to it</button></div>`); return h; }; }
{ const st = document.createElement("style"); st.textContent = `.mt-intro{display:flex;gap:16px;align-items:flex-start}.mt-intro-ic{flex:none;width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:rgba(201,164,92,.16);color:#9A7430}
.mt-rec.on{border-color:#C0392B;box-shadow:0 0 0 3px rgba(192,57,43,.12)}.mt-rec-top{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}
.mt-start{font-size:16px;padding:12px 20px}.mt-stop{background:#C0392B !important;color:#fff !important;border-color:#C0392B !important;font-size:16px;padding:12px 20px}
.mt-time{font:600 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;min-width:70px}
.mt-dot{width:12px;height:12px;border-radius:50%;background:#C0392B;animation:mtPulse 1.2s ease-in-out infinite}.mt-dot.paused{background:#999;animation:none}
@keyframes mtPulse{0%,100%{opacity:1}50%{opacity:.25}}
.mt-live{margin-top:12px;max-height:260px;min-height:90px;overflow:auto;padding:12px 14px;border:1px solid var(--line,#E6E1D6);border-radius:12px;background:var(--panel,#FAF7F0);font-size:14.5px;line-height:1.55}
.mt-live>div+div{margin-top:4px}.mt-interim{color:var(--muted,#6A7080);font-style:italic}
.mt-audio{display:flex;flex-direction:column;gap:8px;margin-top:12px}.mt-aud-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.mt-aud-row audio{height:36px;max-width:100%}
.mt-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mt-act-t input.input{min-width:0;width:100%}.mt-act-t td{vertical-align:middle}
.mt-bar{display:flex;gap:10px;align-items:center;padding:10px 14px;margin-bottom:14px;border-radius:12px;background:#FDECEA;color:#7B1E14}
[data-theme=dark] .mt-live{background:rgba(255,255,255,.03)}[data-theme=dark] .mt-bar{background:rgba(192,57,43,.2);color:#F5C6C0}
@media (prefers-reduced-motion:reduce){.mt-dot{animation:none}}
@media (max-width:600px){.mt-act-t thead{display:none}.mt-act-t tr{display:grid;grid-template-columns:32px 1fr 28px;gap:6px;padding:8px 0;border-bottom:1px solid var(--line,#E6E1D6)}.mt-act-t td{border:0;padding:0}.mt-act-t td:nth-child(3),.mt-act-t td:nth-child(4){grid-column:2}.mt-act-t td:nth-child(5){grid-row:1;grid-column:3}}`; document.head.appendChild(st); }
