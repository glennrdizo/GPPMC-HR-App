/* ---------- AI agents (Glenn 2026-11-06, "Build all" after comparing with the GD Prime One Portal) ----------
   Fifteen helpers built the One Portal way: the AI reads, drafts, fills in or flags, then stops at a person. Nothing it
   writes is saved, approved, paid or sent until someone checks it, and whatever it fills in stays outlined and marked
   "Filled by AI, check before saving" until that person changes or saves it.
   On every form:  1 Fill from a document · 8 Write with AI (English or Tagalog) · 13 incident and NTE writer (Discipline)
   In the HR assistant: 4 copilot that finds records and opens a filled-in form (case, job opening, applicant, announcement)
   Each morning (Automation runner, once a day): 2 HR briefing · 3 payroll watch · 6 document and licence checker ·
     7 attendance pattern watch · 10 Ask HR triage (every run) · 11 monthly HR report writer and 12 exit and survey
     themes (first week of the month)
   Live: 9 meeting action items appear in Reminders · 14 sign-in watch (website, HR Managers) · 15 workforce budget draft
   5 AI usage and the monthly budget: AI agents › AI usage (website, HR Managers; migration 20261106b_hr_ai_agents.sql).
   Results are kept in aiwatch/<kind>--<day> (payroll ones in pay/, which only Payroll roles can read). */
Object.assign(S, { aiTab: "brief", aiDocs: new Map(), aiBusy: new Set(), aiErr: {}, aiUse: null, aiSign: null, aiSignDay: "", aiBudgetRaise: 5 });
Object.assign(ICON, { spark: ICON.spark || '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', aiagent: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6"/>' });
const AI_DAY = () => todayISO();
const aiOn = () => !!S.sample;
const aiEd = () => !!(S.realEdit && S.canEdit && !S.selfMode);
const aiErrTxt = (e) => (e?.code === "rate_limited" ? (e.message || "The AI limit was reached. Try again later.") : e?.code === "not_granted" ? "AI isn't available for this account." : e?.code === "invalid_json" ? "The AI's answer couldn't be read. Try again." : e?.message || "The AI couldn't do this just now. Try again.");
const aiAsk = (prompt, o = {}) => S.sample(prompt, { modelTier: o.tier || "default", cache: false, purpose: o.purpose || "assistant", ...(o.images ? { images: o.images } : {}) });
const aiJson = (prompt, o = {}) => S.sample.json(prompt, { modelTier: o.tier || "default", cache: false, purpose: o.purpose || "assistant", ...(o.images ? { images: o.images } : {}) });
const aiCompany = () => S.org?.companyName || "GD Prime Property Management Corporation";
const aiPeso = (v) => `₱${money(v)}`;
const aiCanPay = () => typeof viewAllowed === "function" ? viewAllowed("payroll") : true;
const aiAdmin = () => typeof isPermAdmin === "function" && (isPermAdmin() || S.isOwner);
const aiPath = (kind, key) => (kind === "pay" || kind === "budget" ? `pay/ai${kind}--${key}` : `aiwatch/${kind}--${key}`);
async function aiGet(kind, key, force) {
  const p = aiPath(kind, key); if (!force && S.aiDocs.has(p)) return S.aiDocs.get(p); if (!S.db) return null;
  try { const d = await S.db.doc(p).get(); const v = d.exists ? d.data() : null; S.aiDocs.set(p, v); return v; } catch { S.aiDocs.set(p, null); return null; }
}
async function aiPut(kind, key, data) { const p = aiPath(kind, key); const v = JSON.parse(JSON.stringify({ ...data, at: new Date().toISOString(), by: S.myId || null })); await S.db.doc(p).set(v); S.aiDocs.set(p, v); S.ver++; return v; }
const aiAgo = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "");

/* ---------- reading files: PDF pages or a photo, as pictures the AI can read ---------- */
async function aiPages(file, n = 3) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) { if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Use a PDF or a photo (JPG or PNG)."); return [file]; }
  await loadLib("pdfjsWorker").catch(() => {}); const lib = await loadLib("pdfjs");
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; const out = [];
  try { for (let i = 1; i <= Math.min(n, doc.numPages); i++) { const pg = await doc.getPage(i); const v0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: Math.min(2.5, 1600 / Math.max(v0.width, v0.height)) });
    const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise; out.push(await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("A page couldn't be read."))), "image/jpeg", 0.85))); } }
  finally { doc.destroy?.(); }
  return out;
}
function aiPick(accept) {
  return new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.style.display = "none"; document.body.appendChild(i);
    i.addEventListener("change", () => { const f = i.files?.[0] || null; i.remove(); res(f); }); i.addEventListener("cancel", () => { i.remove(); res(null); }); i.click(); });
}

/* ---------- 1. Fill from a document, and 8. Write with AI, on the forms HR staff use ---------- */
const AI_SKIP_FORMS = new Set(["bot-form", "kb-form", "ak-reply", "gl-form", "ops-rules", "rl-new", "geo-rules-form", "ai-set-form"]);
function aiLabelOf(c) {
  let t = ""; if (c.id) { const l = document.querySelector(`label[for="${CSS.escape(c.id)}"]`); if (l) t = l.textContent; }
  if (!t) t = c.closest("label")?.textContent || c.getAttribute("aria-label") || c.placeholder || c.name || "";
  return String(t).replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
function aiFields(form) {
  return [...form.querySelectorAll("input, select, textarea")].filter((c) => !c.disabled && !c.readOnly && c.offsetParent !== null && !c.closest(".ai-bar")
    && (c.tagName !== "INPUT" || !/^(file|checkbox|radio|button|submit|hidden|password|search|reset|image|range|color)$/.test(c.type || "")) && aiLabelOf(c));
}
function aiFieldSpec(L) {
  return L.map((c, i) => { const o = { i, label: aiLabelOf(c), type: c.tagName === "SELECT" ? "choice" : c.tagName === "TEXTAREA" ? "long text" : c.type === "date" ? "date YYYY-MM-DD" : c.type === "number" ? "number" : c.type === "month" ? "month YYYY-MM" : c.type === "time" ? "time HH:MM" : "text" };
    if (c.tagName === "SELECT") o.options = [...c.options].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 80);
    else if (c.value) o.now = String(c.value).slice(0, 80);
    return o; });
}
function aiSetCtl(c, v) {
  if (v == null || v === "") return false;
  if (c.tagName === "SELECT") { const t = String(v).trim().toLowerCase(); const ops = [...c.options];
    const op = ops.find((x) => x.textContent.trim().toLowerCase() === t) || ops.find((x) => String(x.value).toLowerCase() === t) || ops.find((x) => t && x.textContent.trim().toLowerCase().includes(t)) || ops.find((x) => t && t.includes(x.textContent.trim().toLowerCase()) && x.textContent.trim().length > 2);
    if (!op || c.value === op.value) return false; c.value = op.value; }
  else { let s = String(v).trim();
    if (c.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    if (c.type === "month" && !/^\d{4}-\d{2}$/.test(s)) return false;
    if (c.type === "time" && !/^\d{2}:\d{2}$/.test(s)) return false;
    if (c.type === "number") { const n = parseFloat(s.replace(/[₱,\s]/g, "")); if (!isFinite(n)) return false; s = String(n); }
    if (c.maxLength > 0) s = s.slice(0, c.maxLength); c.value = s; }
  c.dispatchEvent(new Event("input", { bubbles: true })); c.dispatchEvent(new Event("change", { bubbles: true }));
  c.classList.add("ai-filled"); c.title = "Filled by AI. Check it before saving."; return true;
}
// Fills a form from { label or index: value } pairs; returns how many fields changed.
function aiFillForm(form, pairs, onlyEmpty) {
  const L = aiFields(form); let n = 0;
  for (const [k, v] of Object.entries(pairs || {})) {
    const c = /^\d+$/.test(k) ? L[Number(k)] : L.find((x) => aiLabelOf(x).toLowerCase() === String(k).toLowerCase()) || L.find((x) => aiLabelOf(x).toLowerCase().includes(String(k).toLowerCase()));
    if (!c) continue; const today = c.type === "date" && c.value === todayISO();
    if (onlyEmpty && c.value && c.tagName !== "SELECT" && !today) continue;
    if (aiSetCtl(c, v)) n++;
  }
  return n;
}
function aiDecorate() {
  if (!aiEd() || !aiOn()) return; const main = document.getElementById("main"); if (!main) return;
  for (const form of main.querySelectorAll("form")) {
    if (form.dataset.aiDone || AI_SKIP_FORMS.has(form.id) || form.getAttribute("role") === "search") continue; form.dataset.aiDone = "1";
    const L = aiFields(form); if (L.length >= 3) form.insertAdjacentHTML("afterbegin", `<div class="ai-bar"><button type="button" class="btn btn-ghost btn-sm" data-ai-fill>${icon("spark", 14)}Fill from a document</button><span class="ai-msg t-muted" role="status"></span></div>`);
    for (const ta of form.querySelectorAll("textarea")) { if (ta.disabled || ta.readOnly || (Number(ta.rows) || 2) < 3 || ta.dataset.aiW) continue; if (!ta.id) ta.id = "ai-ta-" + uid(); ta.dataset.aiW = "1";
      ta.insertAdjacentHTML("afterend", `<button type="button" class="link ai-write" data-ai-write="${esc(ta.id)}">${icon("spark", 12)}Write with AI</button>`); }
  }
  if (S.view?.name === "caseForm" && !main.querySelector("[data-ai-case]")) main.querySelector("#case-form")?.insertAdjacentHTML("beforebegin", `<div class="notice ai-case"><span>${icon("mic", 16)} Have a supervisor's voice note or rough notes? The AI turns them into the incident details and the facts for the notice to explain.</span><button type="button" class="btn btn-ghost btn-sm" data-ai-case>${icon("spark", 14)}Write from a voice note or notes</button></div>`);
}
{ const b = render; render = (...a) => { const r = b(...a); try { aiDecorate(); } catch (e) { console.warn("AI form tools", e); } return r; }; }
document.addEventListener("input", (ev) => { const c = ev.target; if (ev.isTrusted && c?.classList?.contains("ai-filled")) { c.classList.remove("ai-filled"); c.removeAttribute("title"); } }, true);

async function aiReadDoc(btn) {
  const form = btn.closest("form"); const msg = form.querySelector(".ai-msg"); const say = (t, bad) => { if (msg) { msg.textContent = t; msg.classList.toggle("t-warn", !!bad); } };
  const f = await aiPick("application/pdf,image/jpeg,image/png,image/webp"); if (!f) return;
  if (f.size > 20 * 1024 * 1024) return say(`${f.name} is larger than 20 MB.`, true);
  const L = aiFields(form); const spec = aiFieldSpec(L); if (!spec.length) return say("This form has no fields to fill in.", true);
  btn.disabled = true; say(`Reading ${f.name}…`);
  try {
    const pages = await aiPages(f, 3);
    const title = (document.querySelector("#main h1")?.textContent || "").trim();
    const r = await aiJson([`You fill in a form in the HR system of ${aiCompany()}, a Philippine property management company, from the attached document (an ID, a government card, a clearance, a medical or training certificate, a contract, a resume, a letter or similar). The form is "${title}".`,
      `FIELDS (index, label, type, options or current value):\n${JSON.stringify(spec)}`,
      "Give a value only where the document clearly states it. Dates as YYYY-MM-DD, amounts as plain numbers in pesos, a choice exactly as one of its options. Copy names and numbers exactly as printed. Never guess; leave a field out when the document doesn't say. Fill only fields that are empty, except a date that is today's date.",
      `Today is ${todayISO()}. Reply with one JSON object: {"fill": {"<index>": "<value>"}, "doc": "what the document is, in a few words", "note": "anything the person should check, or empty"}`].join("\n\n"), { images: pages, purpose: "doc-reader" });
    const n = aiFillForm(form, r?.fill || {}, true);
    say(n ? `Filled ${n} field${n === 1 ? "" : "s"} from ${r?.doc || f.name}. Outlined fields are the AI's: check them before saving.${r?.note ? " " + r.note : ""}` : `Nothing new to fill from ${r?.doc || f.name}.${r?.note ? " " + r.note : ""}`);
  } catch (e) { say(aiErrTxt(e), true); } finally { btn.disabled = false; }
}

function aiWriteDlg(taId) {
  const ta = document.getElementById(taId); if (!ta) return; const form = ta.closest("form");
  S.aiW = { taId, text: "" };
  openModal(`<h2 id="io-title">${icon("spark", 18)} Write with AI</h2>
    <form id="ai-w-form" class="stack" style="gap:12px">
      <div class="field"><label for="ai-w-ask">What should it say?</label><textarea class="input" id="ai-w-ask" rows="4" maxlength="2000" placeholder="e.g. Remind all guards at Riverside that uniforms are checked on Monday. Or: NTE for 3 days absent without leave, Oct 20-22.">${esc(ta.value ? "Improve this text:\n" + ta.value.slice(0, 1500) : "")}</textarea></div>
      <div class="form-grid"><div class="field"><label for="ai-w-lang">Language</label><select class="input" id="ai-w-lang"><option value="en">English</option><option value="tl">Tagalog</option><option value="taglish">Taglish</option></select></div>
        <div class="field"><label for="ai-w-tone">Tone</label><select class="input" id="ai-w-tone"><option value="formal">Formal (letters, notices)</option><option value="friendly">Friendly (announcements, replies)</option></select></div></div>
      <div id="ai-w-out" class="ai-out" hidden></div><p class="t-muted ai-w-msg" role="status" style="margin:0;font-size:13px"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-ai-close>Cancel</button><button type="button" class="btn btn-ghost" data-ai-w-use hidden>Use this text</button><button class="btn btn-primary">Write it</button></div>
    </form>`, "ai-write");
  S.aiW.ctx = { title: (document.querySelector("#main h1")?.textContent || "").trim(), field: aiLabelOf(ta), others: form ? aiFields(form).filter((c) => c !== ta && c.value).slice(0, 12).map((c) => `${aiLabelOf(c)}: ${c.tagName === "SELECT" ? c.options[c.selectedIndex]?.textContent || "" : c.value}`.slice(0, 160)) : [] };
}
async function aiWriteGo(form) {
  const ask = form.querySelector("#ai-w-ask").value.trim(); const lang = form.querySelector("#ai-w-lang").value; const tone = form.querySelector("#ai-w-tone").value; const msg = form.querySelector(".ai-w-msg"); const out = form.querySelector("#ai-w-out");
  if (!ask) { msg.textContent = "Say in a few words what it should say."; return; } const btn = form.querySelector(".btn-primary"); btn.disabled = true; msg.textContent = "Writing…";
  try {
    const L = lang === "tl" ? "natural, polite Tagalog as used in Metro Manila offices (keep English terms people use, such as payroll, leave, NTE)" : lang === "taglish" ? "Taglish, the way Filipino office staff write to each other" : "plain, clear English";
    const r = await aiAsk([`You write for the HR department of ${aiCompany()}, a Philippine property management company. Write the text for the field "${S.aiW.ctx.field}" on the page "${S.aiW.ctx.title}".`,
      S.aiW.ctx.others.length ? `Other details already on the form:\n${S.aiW.ctx.others.join("\n")}` : "",
      `What it should say: ${ask}`, `Write in ${L}, ${tone === "formal" ? "formal and respectful, fit for a letter or notice under Philippine labor practice" : "warm and friendly"}. Be specific and short. Don't invent names, dates, amounts or rules that weren't given; leave a [blank] where one is needed. Reply with the text only.`].filter(Boolean).join("\n\n"), { purpose: "writer" });
    S.aiW.text = String(r?.text || "").trim(); out.hidden = false; out.textContent = S.aiW.text; form.querySelector("[data-ai-w-use]").hidden = !S.aiW.text; msg.textContent = S.aiW.text ? "Check it, then use it. You can still edit it in the form." : "Nothing came back. Try again.";
  } catch (e) { msg.textContent = aiErrTxt(e); } finally { btn.disabled = false; }
}

/* ---------- 13. Incident and NTE writer: a voice note or rough notes become the case details ---------- */
function aiCaseDlg() {
  S.aiCase = { rec: null };
  openModal(`<h2 id="io-title">${icon("spark", 18)} Incident report from notes</h2>
    <form id="ai-case-form" class="stack" style="gap:12px">
      <p class="t-muted" style="margin:0;font-size:14px">Type, paste or speak what the supervisor reported. The AI fills in the date, offense, rule and the facts for the notice to explain. You check everything before saving.</p>
      <div class="field"><label for="ai-case-notes">Notes</label><textarea class="input" id="ai-case-notes" rows="7" maxlength="6000" placeholder="e.g. Si Juan hindi pumasok noong Oct 20 hanggang 22, walang paalam. Tinawagan ng supervisor pero hindi sumasagot. Rule 4.2 ng Code of Conduct."></textarea></div>
      ${typeof SpeechRec !== "undefined" && SpeechRec ? `<div><button type="button" class="btn btn-ghost btn-sm" data-ai-case-mic>${icon("mic", 14)}<span>Speak (English or Tagalog)</span></button></div>` : ""}
      <p class="t-muted ai-case-msg" role="status" style="margin:0;font-size:13px"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-ai-close>Cancel</button><button class="btn btn-primary">Fill in the case</button></div>
    </form>`, "ai-case");
}
function aiCaseMic(btn) {
  if (S.aiCase?.rec) { S.aiCase.rec.stop(); return; }
  const rec = new SpeechRec(); rec.lang = "fil-PH"; rec.continuous = true; rec.interimResults = false; const ta = document.getElementById("ai-case-notes");
  rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) ta.value = (ta.value ? ta.value + " " : "") + e.results[i][0].transcript.trim(); };
  rec.onend = () => { S.aiCase.rec = null; btn.querySelector("span").textContent = "Speak (English or Tagalog)"; };
  rec.onerror = () => { document.querySelector(".ai-case-msg").textContent = "The microphone couldn't be used. Type the notes instead."; };
  try { rec.start(); S.aiCase.rec = rec; btn.querySelector("span").textContent = "Stop listening"; } catch { document.querySelector(".ai-case-msg").textContent = "The microphone couldn't be used. Type the notes instead."; }
}
async function aiCaseGo(form) {
  const notes = form.querySelector("#ai-case-notes").value.trim(); const msg = form.querySelector(".ai-case-msg"); if (!notes) { msg.textContent = "Add the notes first."; return; }
  S.aiCase?.rec?.stop(); const btn = form.querySelector(".btn-primary"); btn.disabled = true; msg.textContent = "Writing…";
  try {
    const r = await aiJson([`You help HR of ${aiCompany()} (Philippines) open a disciplinary case from a supervisor's report. The report may be in English, Tagalog or Taglish.`,
      `REPORT:\n${notes}`,
      `Grounds to choose from (key = meaning): ${GROUNDS.map(([k, l]) => `${k || "NONE"} = ${l}`).join("; ")}.`,
      `Today is ${todayISO()}. Reply with one JSON object: {"incident_date": "YYYY-MM-DD or empty", "offense": "short name of the offense, e.g. Absent without leave", "rule": "rule or policy section if stated, else empty", "ground": "one key from the list, NONE when it is a company rule only", "facts": "the incident report in formal English: who, what, when, where, witnesses and what was done, in 3 to 6 sentences, only from the report; write [unknown] for missing facts", "missing": "what HR should still find out, or empty"}`].join("\n\n"), { purpose: "incident" });
    const f = document.getElementById("case-form"); if (!f) throw new Error("The case form is no longer open.");
    let n = 0; const set = (id, v) => { const c = document.getElementById(id); if (c && v != null && v !== "" && aiSetCtl(c, v)) n++; };
    set("cs-inc", /^\d{4}-\d{2}-\d{2}$/.test(r?.incident_date || "") ? r.incident_date : ""); set("cs-off", r?.offense); set("cs-rule", r?.rule);
    const g = GROUNDS.find(([k]) => k === (r?.ground === "NONE" ? "" : r?.ground)); if (g) { const c = document.getElementById("cs-ground"); if (c && c.value !== g[0]) { c.value = g[0]; c.classList.add("ai-filled"); n++; } }
    set("cs-det", r?.facts);
    closeModal(); toast(n ? `Filled ${n} field${n === 1 ? "" : "s"}. Check them before saving.${r?.missing ? " Still to find out: " + r.missing : ""}` : "Nothing could be filled from the notes.");
  } catch (e) { msg.textContent = aiErrTxt(e); btn.disabled = false; }
}

/* ---------- 4. Copilot: the HR assistant finds records and opens a form filled in from one sentence ---------- */
const AI_DRAFTS = {
  case: { label: "disciplinary case", open: (x) => go("caseForm", { emp: x.employee_id || "" }), fields: "Date of incident (YYYY-MM-DD), Offense, Rule violated, Ground under the Labor Code, Notice to explain served on, What happened" },
  job: { label: "job opening", open: () => go("jobForm", { pre: {} }), fields: "Job title, Department, Slots, Description and any other field on the job opening form" },
  applicant: { label: "applicant", open: (x) => go("applicantForm", { job: x.job_id || "" }), fields: "First name, Last name, Email, Mobile, Source and any other field on the applicant form" },
  announcement: { label: "announcement", open: () => go("annForm", {}), fields: "Title, Message, and audience fields on the announcement form" },
};
{ const base = hrTools; hrTools = (...a) => { const T = base(...a); const findE = (q) => { q = String(q || "").toLowerCase(); return active().filter((e) => `${fullName(e)} ${e.no}`.toLowerCase().includes(q)); };
  T.push(
    { name: "find_records", description: "Search HR records the user can see: leave, attendance requests, overtime, Ask HR tickets, disciplinary cases, loans, meetings and reminders. Filter by words (employee name, subject), status (PENDING, APPROVED, OPEN...) and a date range. Returns up to 25 of each kind asked.", inputSchema: { type: "object", properties: { kinds: { type: "array", items: { type: "string", enum: ["leave", "attendance", "overtime", "tickets", "cases", "loans", "meetings", "reminders"] } }, query: { type: "string" }, status: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["kinds"] },
      execute: ({ kinds, query, status, from, to }) => { const q = String(query || "").toLowerCase(); const st = String(status || "").toUpperCase(); const inR = (d) => (!from || !d || d >= from) && (!to || !d || d <= to);
        const nm = (id) => { const e = S.emps.get(id); return e ? fullName(e) : ""; }; const hit = (s) => !q || String(s).toLowerCase().includes(q); const out = {};
        const take = (k, arr) => { out[k] = { total: arr.length, items: arr.slice(0, 25) }; };
        for (const k of kinds || []) {
          if (k === "leave") take(k, allLeaves().filter((l) => (!st || l.status === st) && inR(l.from) && hit(`${nm(l.empId)} ${l.type}`)).map((l) => ({ employee: nm(l.empId), type: l.type, from: l.from, to: l.to, days: l.days, status: l.status })));
          if (k === "attendance") take(k, listOf(S.attReqs || new Map()).filter((r) => (!st || r.status === st) && inR(r.d || r.from) && hit(`${nm(r.empId)} ${r.kind}`)).map((r) => ({ employee: nm(r.empId), kind: r.kind, date: r.d || r.from, status: r.status, reason: r.reason })));
          if (k === "overtime") take(k, listOf(S.otReqs || new Map()).filter((r) => (!st || r.status === st) && inR(r.d) && hit(nm(r.empId))).map((r) => ({ employee: nm(r.empId), date: r.d, hours: r.hrs || r.hours, status: r.status })));
          if (k === "tickets" && typeof akAll === "function") take(k, akAll().filter((t) => (!st || t.status === st) && inR((t.created || "").slice(0, 10)) && hit(`${akWho(t)} ${t.subject}`)).map((t) => ({ from: akWho(t), subject: t.subject, topic: t.cat, status: t.status, created: (t.created || "").slice(0, 10), priority: t.prio || t.aiTri?.prio || "" })));
          if (k === "cases") take(k, listOf(S.cases || new Map()).filter((c) => inR(c.incident) && hit(`${nm(c.empId)} ${c.offense}`)).map((c) => ({ employee: nm(c.empId), offense: c.offense, incident: c.incident, status: typeof caseStatus === "function" ? caseStatus(c)[0] : "" })));
          if (k === "loans" && aiCanPay()) take(k, listOf(S.loans || new Map()).filter((l) => (!st || l.status === st) && hit(`${nm(l.empId)} ${l.type}`)).map((l) => ({ employee: nm(l.empId), type: l.type, status: l.status, start: l.start })));
          if (k === "meetings") take(k, listOf(S.meets || new Map()).filter((m) => (typeof mtSees !== "function" || mtSees(m)) && inR(m.date) && hit(`${m.title} ${m.attendees}`)).map((m) => ({ title: m.title, date: m.date, openActions: (m.minutes?.actions || []).filter((x) => !x.done).map((x) => `${x.task}${x.owner ? ` (${x.owner})` : ""}${x.due ? ` due ${x.due}` : ""}`).slice(0, 8) })));
          if (k === "reminders" && typeof remList === "function") take(k, remList().filter((r) => !r.done && inR(r.due) && hit(`${fullName(r.e)} ${r.title}`)).map((r) => ({ title: r.title, employee: fullName(r.e), due: r.due })));
        }
        return out; } },
    { name: "prepare_draft", description: `Prepare a new record from what the user said and open its real form filled in, for the user to check and save. Never says it was saved. Kinds: ${Object.entries(AI_DRAFTS).map(([k, d]) => `${k} (${d.label}: ${d.fields})`).join("; ")}. Use search_employees first to get employee_id for a case.`, inputSchema: { type: "object", properties: { kind: { type: "string", enum: Object.keys(AI_DRAFTS) }, employee_id: { type: "string" }, job_id: { type: "string" }, fields: { type: "object", description: "Form field label -> value. Dates YYYY-MM-DD." }, summary: { type: "string", description: "One line describing the draft" } }, required: ["kind", "fields"] },
      execute: ({ kind, employee_id, job_id, fields, summary }) => { if (!AI_DRAFTS[kind]) throw new Error("Unknown kind"); if (employee_id && !S.emps.get(employee_id)) throw new Error("No employee with that id; use search_employees.");
        S.aiDraft = { kind, employee_id: employee_id || "", job_id: job_id || "", fields: fields || {}, summary: String(summary || "").slice(0, 200) }; const m = S.bot?.hr?.[S.bot.hr.length - 1]; if (m) m.draft = S.aiDraft;
        return { prepared: true, note: "The user sees an 'Open the form' button. Tell them to check the form and press its save button; nothing is saved yet." }; } },
    { name: "find_employee_ids", description: "Employee ids for names (for prepare_draft).", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: ({ query }) => findE(query).slice(0, 10).map((e) => ({ id: e.id, name: fullName(e), no: e.no })) });
  return T; }; }
{ const b = botChat; botChat = (kind, ...a) => { let h = b(kind, ...a); if (kind !== "hr") return h; const list = S.bot.hr; let idx = 0;
  // an "Open the form" button under the assistant's answer that prepared a draft
  return h.replace(/<li class="bot"><div class="bot-txt">/g, (m) => { const i = idx++; const msg = list[i - 1]; return msg?.draft ? `<li class="bot"><div class="ai-draft"><button class="btn btn-primary btn-sm" data-ai-draft="${i - 1}">${icon("spark", 14)}Open the ${esc(AI_DRAFTS[msg.draft.kind]?.label || "form")} form, filled in</button>${msg.draft.summary ? `<small class="t-muted"> ${esc(msg.draft.summary)}</small>` : ""}</div><div class="bot-txt">` : m; }); }; }
function aiOpenDraft(d) {
  const D = AI_DRAFTS[d.kind]; if (!D) return; D.open(d); setTimeout(() => {
    const form = document.querySelector("#main form:not(#bot-form)"); if (!form) { toast("The form didn't open. Try again."); return; }
    const n = aiFillForm(form, d.fields, false); toast(n ? `Filled ${n} field${n === 1 ? "" : "s"}. Check them, then press the form's save button.` : "The form is open; fill it in."); }, 120);
}

/* ---------- 9. Meeting action items become reminders (with the owner and due date from the minutes) ---------- */
Object.assign(REM_KIND, { MEETACT: ["Meeting action item", "mic"] });
{ const base = remList; let cache = { v: -1, list: [] }; remList = () => { if (cache.v === S.ver) return cache.list; const out = [...base()]; const today = todayISO(); const lead = remLead();
  const byName = (s) => { const t = String(s || "").toLowerCase().trim(); if (t.length < 3) return null; return active().find((e) => fullName(e).toLowerCase() === t) || active().find((e) => `${e.first} ${e.last}`.toLowerCase() === t) || active().filter((e) => t.includes(String(e.last || "").toLowerCase()) && t.includes(String(e.first || "").split(" ")[0].toLowerCase())).find(Boolean) || null; };
  try { for (const m of listOf(S.meets || new Map())) { if (typeof mtSees === "function" && !mtSees(m)) continue;
    for (const a of m.minutes?.actions || []) { if (!a.task) continue; const due = a.due || addDays(m.date || today, 7); if (!a.done && due > addDays(today, 30)) continue;
      const e = byName(a.owner) || { id: "", first: a.owner || "Meeting", last: "", no: "", status: "", photo: null };
      const dn = S.remDone.get(remKey(`MEET:${m.id}:${a.id}`));
      out.push({ key: `MEET:${m.id}:${a.id}`, kind: "MEETACT", e, due, from: addDays(due, -Math.min(lead, 7)), title: a.task.slice(0, 90), to: e.id ? ["HR", "EMP"] : ["HR"], act: "meet",
        done: a.done ? a.doneAt || today : dn?.done || null, auto: a.done ? a.doneAt || today : null, by: dn?.by || null, sent: dn?.sent || [],
        msg: { HR: `Action item from "${m.title || "meeting"}" (${fmtDate(m.date)}): ${a.task}${a.owner ? `. Responsible: ${a.owner}` : ""}. Due ${fmtDate(due)}.`, EMP: `Reminder from the ${m.title || "meeting"} on ${fmtDate(m.date)}: ${a.task}, due ${fmtDate(due)}.` } }); } } } catch (e) { console.warn("meeting reminders", e); }
  out.sort((x, y) => x.due.localeCompare(y.due)); cache = { v: S.ver, list: out }; return out; }; }

/* ---------- 2. Morning briefing ---------- */
function aiToolRun(name, args = {}) { const t = hrTools().find((x) => x.name === name); return t ? t.execute(args) : null; }
async function aiBriefFigures() {
  const today = todayISO(), yday = addDays(today, -1); const F = { date: today };
  try { F.pending = aiToolRun("pending_approvals"); } catch {}
  try { F.yesterday = await aiToolRun("attendance_on", { date: yday }); } catch {}
  try { F.onLeaveToday = aiToolRun("leave_between", { from: today, to: today })?.filter?.((l) => l.status === "APPROVED")?.length ?? null; } catch {}
  try { const due = remList().filter((r) => !r.done && r.due <= addDays(today, 7)); const by = {}; for (const r of due) by[REM_KIND[r.kind]?.[0] || r.kind] = (by[REM_KIND[r.kind]?.[0] || r.kind] || 0) + 1; F.remindersThisWeek = by;
    F.contractsEnding = due.filter((r) => r.kind === "CONTRACT").slice(0, 8).map((r) => `${fullName(r.e)} ${fmtDate(r.due)}`); } catch {}
  try { const apps = listOf(S.apps || new Map()); F.newApplicants = apps.filter((a) => (a.applied || "") >= yday).length; F.interviewsToday = apps.flatMap((a) => (a.ivs || []).filter((i) => i.d === today)).length; } catch {}
  try { const iss = tkIssuesAll(); let miss = 0, abs = 0, ot = 0, geo = 0; for (const l of iss.values()) for (const x of l) { if (x.kind === "MISS") miss++; else if (x.kind === "ABS") abs++; else if (x.kind === "OT") ot++; else if (x.kind === "GEO") geo++; }
    F.timekeepingIssues = { people: iss.size, missingInOut: miss, absentNoLeave: abs, overtimeNotFiled: ot, outsideArea: geo }; F.cutoffs = tkOpenCutoffs().map((id) => PAY.period(id).label); } catch {}
  try { F.askHrUnanswered = akAll().filter((t) => t.status !== "CLOSED" && lastMsg(t)?.by === "emp").length; F.askHrUrgent = akAll().filter((t) => t.status !== "CLOSED" && (t.prio === "URGENT" || t.aiTri?.prio === "URGENT")).length; } catch {}
  return F;
}
function aiBriefLines(F) {
  const L = []; const p = F.pending || {}; const w = Object.entries(p).filter(([, n]) => n > 0);
  if (w.length) L.push(`Waiting for approval: ${w.map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(", ")}.`);
  if (F.yesterday?.counts) L.push(`Yesterday: ${F.yesterday.counts.present || 0} present, ${F.yesterday.counts.late || 0} late, ${F.yesterday.counts.absent || 0} absent, ${F.yesterday.counts.leave || 0} on leave.`);
  if (F.timekeepingIssues?.people) L.push(`To fix before payroll (${(F.cutoffs || []).join(", ")}): ${F.timekeepingIssues.missingInOut} missing time in/out, ${F.timekeepingIssues.absentNoLeave} absent with no leave, ${F.timekeepingIssues.overtimeNotFiled} overtime not filed.`);
  if (F.contractsEnding?.length) L.push(`Contracts ending this week: ${F.contractsEnding.join("; ")}.`);
  if (F.askHrUnanswered) L.push(`Ask HR: ${F.askHrUnanswered} waiting for an answer${F.askHrUrgent ? `, ${F.askHrUrgent} urgent` : ""}.`);
  if (F.newApplicants || F.interviewsToday) L.push(`Recruitment: ${F.newApplicants || 0} new applicants since yesterday, ${F.interviewsToday || 0} interviews today.`);
  return L;
}
async function aiRunBrief(force) {
  const day = AI_DAY(); const cur = await aiGet("brief", day, true); if (cur && !force) return cur;
  const F = await aiBriefFigures(); const lines = aiBriefLines(F); let summary = "", err = "";
  if (aiOn() && lines.length) { try { const r = await aiAsk(`Write the 7 am HR briefing for the HR Manager of ${aiCompany()} (Philippines, about 300 employees across many property sites). From these figures only, write 3 to 4 short sentences: lead with what needs action today and by whom (payroll, timekeeping, recruitment, HR), then what can wait. No greeting, no figures that aren't given.\n\nFIGURES: ${JSON.stringify(F).slice(0, 12000)}`, { tier: "quick", purpose: "brief" }); summary = String(r?.text || "").trim(); } catch (e) { err = aiErrTxt(e); } }
  return aiPut("brief", day, { day, figures: F, lines, summary, err });
}

/* ---------- 3. Payroll watch: before finalize, look for what shouldn't be paid ---------- */
async function aiRunPay(force) {
  if (!aiCanPay()) return null; const day = AI_DAY(); const cur = await aiGet("pay", day, true); if (cur && !force) return cur;
  const pid = curPeriod(); const prev = PAY.periodOf(addDays(PAY.period(pid).start, -1)); const prev2 = PAY.periodOf(addDays(PAY.period(prev).start, -1));
  await Promise.all([ensureRun(prev), ensureRun(prev2)]).catch(() => {});
  const runs = [[pid, payrun(pid)], [prev, payrun(prev)], [prev2, payrun(prev2)]]; const [now, last, last2] = runs.map(([, r]) => r?.lines || {});
  const emp = (id) => (S.allEmps || S.emps).get(id); const nm = (id) => { const e = emp(id); return e ? `${fullName(e)} (${e.no || "no ID"})` : id; };
  const F = []; const add = (sev, kind, id, text) => F.push({ sev, kind, id, who: nm(id), text });
  const P = PAY.period(pid);
  for (const [id, l] of Object.entries(now)) { const e = emp(id); const g = Number(l.gross) || 0, n = Number(l.net) || 0;
    if (e?.separated?.date && e.separated.date < P.start && g > 0) add("high", "Separated but paid", id, `Separated ${fmtDate(e.separated.date)}, still has ${aiPeso(g)} gross this cutoff.`);
    if (g > 0 && !(Number(e?.basicPay) > 0)) add("high", "No basic pay on file", id, `Gross ${aiPeso(g)} with no basic pay in the 201 file.`);
    if (n < 0) add("high", "Negative net pay", id, `Net pay ${aiPeso(n)}: deductions are more than pay.`);
    const pg = Number(last[id]?.gross) || 0; if (pg > 0 && g > pg * 1.2 && g - pg > 1000) add("medium", "Pay jump", id, `Gross ${aiPeso(g)} vs ${aiPeso(pg)} last cutoff (+${Math.round((g / pg - 1) * 100)}%).`);
    const ot = Number(l.ot) || 0; const otAvg = ((Number(last[id]?.ot) || 0) + (Number(last2[id]?.ot) || 0)) / 2; if (ot > 2000 && ot > otAvg * 2) add("medium", "Overtime spike", id, `Overtime pay ${aiPeso(ot)} vs ${aiPeso(otAvg)} average of the two cutoffs before.`);
    if (g > 0 && !last[id] && !last2[id] && e?.hire && e.hire < addDays(P.start, -45)) add("low", "Paid again after a gap", id, `Hired ${fmtDate(e.hire)} but not on the last two payrolls.`); }
  const byAcct = new Map(); for (const e of (S.allEmps || S.emps).values()) { if (e.separated) continue; const a = String(e.bankAcct || "").replace(/\D/g, ""); if (a.length < 6) continue; const k = `${String(e.bank || "").toLowerCase()}|${a}`; byAcct.set(k, [...(byAcct.get(k) || []), e]); }
  for (const list of byAcct.values()) if (list.length > 1) for (const e of list) add("high", "Shared bank account", e.id, `Same ${e.bank || "bank"} account as ${list.filter((x) => x !== e).map((x) => fullName(x)).join(", ")}.`);
  const byNo = new Map(); for (const e of active()) { if (!e.no) continue; byNo.set(e.no, [...(byNo.get(e.no) || []), e]); }
  for (const [no, list] of byNo) if (list.length > 1) add("high", "Duplicate employee number", list[0].id, `${no} is used by ${list.map(fullName).join(", ")}.`);
  const order = { high: 0, medium: 1, low: 2 }; F.sort((a, b) => order[a.sev] - order[b.sev] || a.kind.localeCompare(b.kind));
  let summary = "", err = "";
  if (aiOn() && F.length) { try { const r = await aiAsk(`You check a Philippine payroll before it is finalized. From these findings only (do not add any), write 2 to 3 sentences for the payroll officer: which to check first and why (money paid out wrongly, fraud risk, compliance), and what to look at. Findings: ${JSON.stringify(F.slice(0, 60).map((f) => `${f.sev} · ${f.kind} · ${f.text}`))}`, { tier: "quick", purpose: "pay-watch" }); summary = String(r?.text || "").trim(); } catch (e) { err = aiErrTxt(e); } }
  return aiPut("pay", day, { day, period: P.label, findings: F.slice(0, 200), summary, err });
}

/* ---------- 6. Document and licence checker ---------- */
async function aiRunDocs(force) {
  const day = AI_DAY(); const cur = await aiGet("docs", day, true); if (cur && !force) return cur; const today = todayISO();
  const keep = new Set(["DOCEXP", "CONTRACT", "IDEXP", "TRAINEXP", "MED", "MISSING", "REGNOTICE", "APE"]);
  const items = remList().filter((r) => keep.has(r.kind) && !r.done && r.due <= addDays(today, 30)).map((r) => ({ kind: REM_KIND[r.kind]?.[0] || r.kind, who: fullName(r.e), empId: r.e.id, due: r.due, late: r.due < today, text: r.msg?.HR || r.title }));
  items.sort((a, b) => (b.late - a.late) || a.due.localeCompare(b.due));
  const counts = {}; for (const x of items) counts[x.kind] = (counts[x.kind] || 0) + 1;
  let summary = "", err = "";
  if (aiOn() && items.length) { try { const r = await aiAsk(`You help the HR Manager of ${aiCompany()}, a Philippine property management company whose guards, technicians and site staff need valid documents (NBI clearance, security guard licence, medical certificates, contracts, IDs). From these findings only (do not add any), write 2 to 3 sentences: which to fix first and why (legal exposure under DOLE and PNP-SOSIA rules, safety, contracts lapsing into regular employment), and what to do this week. Counts: ${JSON.stringify(counts)}. First items: ${JSON.stringify(items.slice(0, 40).map((x) => `${x.late ? "OVERDUE " : ""}${x.kind}: ${x.text}`))}`, { tier: "quick", purpose: "doc-check" }); summary = String(r?.text || "").trim(); } catch (e) { err = aiErrTxt(e); } }
  return aiPut("docs", day, { day, counts, items: items.slice(0, 300), summary, err });
}

/* ---------- 7. Attendance pattern watch: each person against their own recent pattern ---------- */
async function aiRunAtt(force) {
  const day = AI_DAY(); const cur = await aiGet("att", day, true); if (cur && !force) return cur;
  const to = addDays(day, -1), mid = addDays(day, -14), from = addDays(day, -56);
  await loadClock(from, to).catch(() => {}); const pd = punchDays(from, to); const ctx = tkCtx(); const F = [];
  const leaves = allLeaves().filter((l) => l.status === "APPROVED" && l.from >= addDays(day, -90));
  for (const e of active()) { const days = pd.get(e.id); if (!days) continue;
    let lateR = 0, lateB = 0, absR = 0, absB = 0, workR = 0, workB = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { if (e.hire && d < e.hire) continue; let r; try { r = dayRec(e, d, days.get(d), ctx); } catch { continue; } if (!r || r.rest || r.hol?.length) continue;
      const recent = d >= mid; if (r.status === "in" || r.status === "late" || r.status === "absent") { if (recent) workR++; else workB++; }
      if (r.status === "late") { if (recent) lateR++; else lateB++; } if (r.status === "absent") { if (recent) absR++; else absB++; } }
    const rate = (n, w) => (w ? n / w : 0); const why = [];
    if (lateR >= 3 && rate(lateR, workR) >= 2 * rate(lateB, workB) + 0.1) why.push(`late ${lateR} of ${workR} work days in the last 2 weeks (before: ${lateB} of ${workB})`);
    if (absR >= 2 && rate(absR, workR) >= 2 * rate(absB, workB) + 0.1) why.push(`absent without leave ${absR} days in the last 2 weeks (before: ${absB} in 6 weeks)`);
    const mine = leaves.filter((l) => l.empId === e.id && l.from === l.to); const edge = mine.filter((l) => { const g = new Date(l.from + "T00:00:00").getDay(); return g === 1 || g === 5 || g === 6; });
    if (edge.length >= 3 && edge.length >= mine.length * 0.75) why.push(`${edge.length} of ${mine.length} one-day leaves in 90 days fall next to a weekend`);
    if (why.length) F.push({ empId: e.id, who: fullName(e), sup: S.emps.get(e.supervisorId) ? fullName(S.emps.get(e.supervisorId)) : "", site: e.projectId ? S.projects.get(e.projectId)?.name || "" : "Head Office", why }); }
  let summary = "", err = "";
  if (aiOn() && F.length) { try { const r = await aiAsk(`You help HR of a Philippine property management company spot attendance changes early, so supervisors can talk to people before it becomes a disciplinary matter. From these findings only, write 2 to 3 sentences: any pattern by site or supervisor, who to talk to first, and a fair next step (a conversation, not a sanction). Findings: ${JSON.stringify(F.slice(0, 50).map((f) => `${f.who} (${f.site}${f.sup ? `, supervisor ${f.sup}` : ""}): ${f.why.join("; ")}`))}`, { tier: "quick", purpose: "att-watch" }); summary = String(r?.text || "").trim(); } catch (e) { err = aiErrTxt(e); } }
  return aiPut("att", day, { day, people: F.slice(0, 200), checked: [...pd.keys()].length, summary, err });
}

/* ---------- 10. Ask HR triage: each new question gets a suggested topic, desk and priority ---------- */
const AI_DESK = { PAY: "PAYROLL", LOAN: "PAYROLL", GOV: "PAYROLL", TIME: "TIME", LEAVE: "TIME", DOCS: "HR", CONCERN: "HR", OTHER: "HR" };
async function aiRunTriage() {
  if (!aiOn() || typeof akAll !== "function") return 0; const todo = akAll().filter((t) => !t.aiTri && t.status !== "CLOSED" && (t.msgs || []).length && (t.created || "") >= addDays(todayISO(), -14)).slice(0, 15); let n = 0;
  for (const t of todo) { const first = String(t.msgs[0]?.text || "").slice(0, 1500);
    try { const r = await aiJson(`Sort an employee's question to HR at a Philippine property management company. Topics: ${AK_CAT.map(([k, l]) => `${k} = ${l}`).join("; ")}. Priority: URGENT = safety, harassment, no pay received or a deadline today; HIGH = wrong pay or a deadline this week; NORMAL; LOW. Reply with one JSON object: {"cat": "<topic key>", "prio": "LOW|NORMAL|HIGH|URGENT", "why": "one short line"}.\n\nSubject: ${t.subject || ""}\nMessage: ${first}`, { tier: "quick", purpose: "triage" });
      const cat = AK_CAT.some(([k]) => k === r?.cat) ? r.cat : "OTHER"; const prio = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(r?.prio) ? r.prio : "NORMAL";
      const aiTri = { cat, prio, desk: AI_DESK[cat] || "HR", why: String(r?.why || "").slice(0, 200), at: new Date().toISOString() };
      const path = t.src === "self" ? `clockins/${t.dev}/tickets/${t.id}` : `tickets/${t.id}`; await S.db.doc(path).update({ aiTri }); n++;
    } catch (e) { if (e?.code === "rate_limited") break; } }
  if (n) S.ver++; return n;
}
{ const b = VIEWS.askhr; if (b) VIEWS.askhr = (...a) => { const h = b(...a); if (!S.realEdit) return h; let open = []; try { open = akAll().filter((t) => t.status !== "CLOSED" && t.aiTri); } catch {} if (!open.length) return h;
  const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }; open.sort((x, y) => (rank[x.aiTri.prio] ?? 2) - (rank[y.aiTri.prio] ?? 2));
  const card = `<section class="card ai-tri"><div class="card-head"><h2>${icon("spark", 18)} AI triage of open questions</h2><span class="t-muted" style="font-size:13px">Suggestions only; the topic and owner stay as filed</span></div>
    <div class="table-wrap"><table><thead><tr><th>Question</th><th>From</th><th>Suggested topic</th><th>Desk</th><th>Priority</th><th>Why</th></tr></thead><tbody>
    ${open.slice(0, 12).map((t) => `<tr><td>${esc(t.subject || "")}</td><td>${esc(akWho(t))}</td><td>${esc(akCat(t.aiTri.cat))}${t.cat && t.cat !== t.aiTri.cat ? ` <small class="t-muted">(filed as ${esc(akCat(t.cat))})</small>` : ""}</td><td>${esc(typeof akDeskName === "function" ? akDeskName(t.aiTri.desk) : t.aiTri.desk)}</td><td><span class="chip ${t.aiTri.prio === "URGENT" ? "c-bad" : t.aiTri.prio === "HIGH" ? "c-warn" : "c-gray"}">${esc(t.aiTri.prio)}</span></td><td style="font-size:13px">${esc(t.aiTri.why || "")}</td></tr>`).join("")}</tbody></table></div></section>`;
  const i = h.indexOf("</header>"); return i >= 0 ? h.slice(0, i + 9) + card + h.slice(i + 9) : card + h; }; }

/* ---------- 11. Monthly HR report writer (the executive report's analysis, drafted after the month ends) ---------- */
async function aiRunReport(force) {
  if (!aiOn() || typeof exData !== "function") return null; const today = todayISO(); if (!force && Number(today.slice(8, 10)) > 7) return null;
  const m = addDays(today.slice(0, 7) + "-01", -1).slice(0, 7); const key = `${m}_all`; let cur = S.repNotes?.get?.(key);
  if (!cur) { try { const d = await S.db.doc(`repnotes/${key}`).get(); cur = d.exists ? d.data() : null; } catch {} }
  if (cur?.ai && !force) return cur;
  const X = exData(m, "all"); const brief = { month: X.M.label, scope: X.R.scope, thisMonth: X.M, lastMonth: X.P, sixMonths: X.trend.map((t) => ({ month: t.label, end: t.end, hires: t.hires, seps: t.seps, cost: Math.round(t.cost), ot: t.ot, abs: t.abs })), findings: X.F.map((f) => `${f.area}: ${f.text || f.t || ""}`) };
  const res = await aiAsk(`You are the HR analytics adviser to the President of ${aiCompany()}, a Philippine property management company. Write the analysis section of the monthly executive HR report from the figures below.
Write 4 to 6 short paragraphs in plain business English: the overall picture, workforce and turnover, manpower and recruitment, attendance and overtime, payroll cost, then risks and the 3 most important actions. Compare with last month and the six-month trend. Use only these figures; if a figure is missing, say so.
DATA: ${JSON.stringify(brief).slice(0, 30000)}`, { purpose: "report-writer" });
  const n = { ...(cur || {}), ai: String(res?.text || "").trim(), aiAt: new Date().toISOString(), aiAuto: true }; if (!n.ai) return cur;
  await S.db.doc(`repnotes/${key}`).set(JSON.parse(JSON.stringify(n))); S.repNotes?.set?.(key, n); S.ver++; return n;
}

/* ---------- 12. Exit interview and survey themes ---------- */
async function aiRunThemes(force) {
  if (!aiOn()) return null; const today = todayISO(); const m = force ? today.slice(0, 7) : addDays(today.slice(0, 7) + "-01", -1).slice(0, 7);
  if (!force && Number(today.slice(8, 10)) > 7) return null; const cur = await aiGet("themes", m, true); if (cur && !force) return cur;
  const texts = [];
  try { for (const [v, r] of Object.entries(HRD_REG)) { if (!/exit|survey|feedback|grievance|engagement|pulse|suggestion/i.test(r.label)) continue;
    for (const row of hrdRows(v)) { const t = Object.entries(row).filter(([k, x]) => typeof x === "string" && x.length > 15 && !/^(id|by|at|reg|date|d)$/.test(k)).map(([, x]) => x).join(" · "); if (t) texts.push(`[${r.label}] ${t.slice(0, 600)}`); } } } catch {}
  try { for (const t of akAll()) { if (t.cat !== "CONCERN" || (t.created || "") < addDays(today, -62)) continue; texts.push(`[Ask HR concern] ${t.subject || ""}: ${String(t.msgs?.[0]?.text || "").slice(0, 400)}`); } } catch {}
  try { for (const e of [...S.emps.values()]) { const s = e.separated; if (!s?.date || s.date < addDays(today, -92)) continue; const why = [s.reason, s.why, s.note, s.remarks].filter((x) => typeof x === "string" && x).join(" "); if (why) texts.push(`[Separation] ${why.slice(0, 300)}`); } } catch {}
  if (!texts.length) return aiPut("themes", m, { month: m, themes: [], count: 0, summary: "No exit interview, survey, separation reason or Ask HR concern text to group yet." });
  const prevM = addDays(m + "-01", -1).slice(0, 7); const prev = await aiGet("themes", prevM, true);
  const r = await aiJson(`Group what employees of a Philippine property management company said (exit interviews, surveys, separation reasons, concerns to HR) into themes such as pay, schedule and overtime, supervisor, workload, safety, benefits, career growth, commute, facilities. Reply with one JSON object: {"themes": [{"theme": "short name", "count": n, "tone": "negative|mixed|positive", "examples": ["short paraphrase", "..."], "action": "one suggested HR action"}], "summary": "2 to 3 sentences on what stands out${prev?.themes?.length ? " and what changed since last month" : ""}"}. Paraphrase, never quote names.\n${prev?.themes?.length ? `LAST MONTH: ${JSON.stringify(prev.themes.map((t) => `${t.theme} (${t.count})`))}\n` : ""}TEXTS (${texts.length}):\n${texts.slice(0, 150).join("\n").slice(0, 40000)}`, { purpose: "themes" });
  return aiPut("themes", m, { month: m, count: texts.length, themes: Array.isArray(r?.themes) ? r.themes.slice(0, 15) : [], summary: String(r?.summary || "") });
}

/* ---------- 15. Workforce budget draft for next year, per project ---------- */
async function aiRunBudget(raisePct) {
  if (!aiCanPay()) throw new Error("The workforce budget needs Payroll access.");
  const y = Number(todayISO().slice(0, 4)) + 1; const pid = PAY.periodOf(addDays(PAY.period(curPeriod()).start, -1)); const pid2 = PAY.periodOf(addDays(PAY.period(pid).start, -1));
  await Promise.all([ensureRun(pid), ensureRun(pid2)]).catch(() => {}); const rows = new Map(); const row = (cc) => rows.get(cc) || (rows.set(cc, { cc, heads: 0, monthCost: 0, basic: 0, ot: 0, open: 0 }), rows.get(cc));
  for (const e of active()) row(e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office").heads++;
  for (const id of [pid, pid2]) for (const [eid, l] of Object.entries(payrun(id)?.lines || {})) { const e = (S.allEmps || S.emps).get(eid); const cc = typeof chargeName === "function" ? chargeName(l, e) : e?.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office"; const r = row(cc); const n = (k) => Number(l[k]) || 0;
    r.monthCost += n("gross") + n("sssEr") + n("ec") + n("phEr") + n("hdEr"); r.ot += n("ot"); }
  for (const e of active()) { const r = row(e.projectId ? S.projects.get(e.projectId)?.name || "Project" : "Head Office"); const b = Number(e.basicPay) || 0; r.basic += e.payType === "MONTHLY" || e.payType === "SEMI" ? b : (b * (SET().factor || 313)) / 12; }
  for (const j of listOf(S.jobs || new Map()).filter((j) => j.status === "OPEN")) { const hired = listOf(S.apps || new Map()).filter((a) => a.jobId === j.id && a.stage === "HIRED").length; row(j.projectId ? S.projects.get(j.projectId)?.name || "Project" : "Head Office").open += Math.max(0, (Number(j.slots) || 1) - hired); }
  const k = 1 + (Number(raisePct) || 0) / 100;
  const lines = [...rows.values()].filter((r) => r.heads || r.monthCost || r.open).map((r) => { const per = r.heads ? r.monthCost / r.heads : 0; const plan = r.heads + r.open; const monthly = per * plan * k; const thirteenth = (r.heads ? r.basic / r.heads : 0) * plan * k;
    return { ...r, perHead: PAY.r2(per), plan, monthly: PAY.r2(monthly), year: PAY.r2(monthly * 12 + thirteenth), thirteenth: PAY.r2(thirteenth) }; }).sort((a, b) => b.year - a.year);
  const tot = lines.reduce((s, r) => ({ heads: s.heads + r.heads, plan: s.plan + r.plan, year: s.year + r.year, now: s.now + r.monthCost * 12 }), { heads: 0, plan: 0, year: 0, now: 0 });
  let notes = "", err = "";
  if (aiOn()) { try { const r = await aiAsk(`You help HR of ${aiCompany()} (Philippines) draft next year's (${y}) manpower and payroll budget. Below is a draft per project from the last month's payroll, current headcount, open job slots and a ${raisePct}% wage increase. Write 4 to 6 short bullet points: the main cost drivers, projects to question (high overtime, high cost per head, many open slots), risks (minimum wage orders by region, SSS/PhilHealth rate changes, 13th month) and what HR should confirm with each project before the budget is final. Use only these figures.\n${JSON.stringify(lines.slice(0, 60).map((r) => ({ project: r.cc, heads: r.heads, openSlots: r.open, monthCostNow: Math.round(r.monthCost), overtimeNow: Math.round(r.ot), perHead: Math.round(r.perHead), nextYear: Math.round(r.year) })))}`, { purpose: "budget" }); notes = String(r?.text || "").trim(); } catch (e) { err = aiErrTxt(e); } }
  return aiPut("budget", String(y), { year: y, raise: Number(raisePct) || 0, from: [PAY.period(pid2).label, PAY.period(pid).label], lines, tot, notes, err });
}

/* ---------- 14. Sign-in watch (website): HR Managers see yesterday's unusual sign-ins ---------- */
async function aiLoadSignins(day) {
  if (!window.__sb) return; S.aiSignDay = day; S.aiSign = { loading: true };
  const { data, error } = await window.__sb.rpc("hr_signin_watch", { p_day: day }); S.aiSign = error ? { err: "Couldn't load sign-ins. The database update for the AI agents may not be applied yet." } : data; render();
}
const aiSignWhy = (r) => [r.firstEver ? "first sign-in on record" : "", !r.firstEver && r.newNet ? "new network" : !r.firstEver && r.newIp ? "new address" : "", !r.firstEver && r.newDevice ? "new device" : "", r.night ? "between midnight and 5 am" : "", r.ipsToday >= 3 ? `${r.ipsToday} addresses in one day` : ""].filter(Boolean);
const aiDevice = (ua) => { const s = String(ua || ""); const os = /iPhone|iPad/.test(s) ? "iPhone/iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "Other"; const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "browser"; return `${br} on ${os}`; };

/* ---------- 5. AI usage and the monthly budget (website) ---------- */
async function aiLoadUse(month) { if (!window.__sb) return; S.aiUse = { loading: true }; const { data, error } = await window.__sb.rpc("hr_ai_report", { p_month: month || null }); S.aiUse = error ? { err: "Couldn't load AI usage. The database update for the AI agents may not be applied yet." } : data; render(); }

/* ---------- the daily run (Automation runner) ---------- */
async function aiDaily(force) {
  if (!S.realEdit || !S.db) return; const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Manila" }).format(new Date()));
  const errs = [];
  const step = async (k, fn) => { if (S.aiBusy.has(k)) return; S.aiBusy.add(k); try { await fn(); delete S.aiErr[k]; } catch (e) { S.aiErr[k] = aiErrTxt(e); errs.push(`${k}: ${S.aiErr[k]}`); } finally { S.aiBusy.delete(k); } };
  await step("triage", aiRunTriage);
  if (!force && hour < 6) return;
  await step("brief", () => aiRunBrief(force)); await step("docs", () => aiRunDocs(force)); await step("att", () => aiRunAtt(force));
  if (aiCanPay()) await step("pay", () => aiRunPay(force));
  await step("report", () => aiRunReport(false)); await step("themes", () => aiRunThemes(false));
  if (errs.length) throw new Error(errs.join(" · ").slice(0, 190));
}
(window.__hrExtraJobs = window.__hrExtraJobs || []).push(["ai", "AI agents (briefing, watches, triage, monthly report)", () => aiDaily(false)]);

/* ---------- the AI agents page ---------- */
{ const ov = NAV.find(([g]) => g === "Overview") || NAV[0]; const i = ov[1].findIndex(([v]) => v === "hrbot"); ov[1].splice(i >= 0 ? i + 1 : ov[1].length, 0, ["aiagents", "AI agents", "aiagent"]);
  SECTION_OF.aiagents = "aiagents"; try { HRD_PERM.aiagents = "Overview"; } catch {} }
const AI_TABS = () => [["brief", "Morning briefing"], ["docs", "Documents & licences"], ["att", "Attendance patterns"], ...(aiCanPay() ? [["pay", "Payroll watch"], ["budget", "Workforce budget"]] : []), ["themes", "Exit & survey themes"],
  ...(window.__hosted && aiAdmin() ? [["signin", "Sign-ins"], ["usage", "AI usage"]] : []), ["about", "All agents"]];
function aiRunBtn(k, label) { const busy = S.aiBusy.has(k); return S.canEdit ? `<button class="btn btn-ghost btn-sm" data-ai-run="${k}" ${busy ? "disabled" : ""}>${icon("spark", 14)}${busy ? "Working…" : label}</button>` : ""; }
function aiSumCard(d, k) {
  if (!d) return `<p class="t-muted" style="margin:0">Not run yet today. It runs on its own each morning with the Automation runner${S.canEdit ? ", or press Run now" : ""}.</p>`;
  return `${d.summary ? `<div class="ai-sum">${icon("spark", 16)}<p>${esc(d.summary)}</p></div>` : ""}${d.err ? `<p class="t-warn" style="font-size:13px">${esc(d.err)}</p>` : ""}<p class="t-muted" style="font-size:12px;margin:6px 0 0">Checked ${esc(aiAgo(d.at))}. ${aiOn() ? "The written summary is the AI's; the figures come from the records." : "AI is off here, so only the figures are shown."}</p>`;
}
function aiTabBody(tab) {
  const day = AI_DAY(); const card = (title, k, label, body) => `<section class="card"><div class="card-head"><h2>${title}</h2>${aiRunBtn(k, label)}</div>${S.aiErr[k] ? `<p class="t-warn">${esc(S.aiErr[k])}</p>` : ""}${body}</section>`;
  if (tab === "brief") { const d = S.aiDocs.get(aiPath("brief", day)); return card("Today's HR briefing", "brief", "Run now", `${aiSumCard(d)}${d?.lines?.length ? `<ul class="ai-list">${d.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : d ? '<p class="t-muted">Nothing needs action this morning.</p>' : ""}`); }
  if (tab === "pay") { const d = S.aiDocs.get(aiPath("pay", day)); const F = d?.findings || [];
    return card(`Payroll watch${d?.period ? ` · ${esc(d.period)}` : ""}`, "pay", "Check now", `${aiSumCard(d)}${d ? (F.length ? `<div class="table-wrap"><table><thead><tr><th>Check</th><th>Employee</th><th>Finding</th></tr></thead><tbody>${F.map((f) => `<tr><td><span class="chip ${f.sev === "high" ? "c-bad" : f.sev === "medium" ? "c-warn" : "c-gray"}">${esc(f.kind)}</span></td><td>${S.emps.get(f.id) ? `<button class="link" data-emp="${esc(f.id)}">${esc(f.who)}</button>` : esc(f.who)}</td><td>${esc(f.text)}</td></tr>`).join("")}</tbody></table></div>` : '<p><span class="chip c-ok">Nothing found</span> No separated staff paid, shared bank accounts, missing basic pay, pay jumps or overtime spikes.</p>') : ""}
      <p class="t-muted" style="font-size:13px;margin:8px 0 0">Compares this cutoff with the two before it, before you finalize. Nothing is changed; check each one on Payroll.</p>`); }
  if (tab === "docs") { const d = S.aiDocs.get(aiPath("docs", day)); const I = d?.items || [];
    return card("Documents and licences", "docs", "Check now", `${aiSumCard(d)}${d ? `${Object.keys(d.counts || {}).length ? `<div class="chips" style="margin:8px 0">${Object.entries(d.counts).map(([k, n]) => `<span class="chip c-gray">${esc(k)}: ${n}</span>`).join("")}</div>` : ""}${I.length ? `<div class="table-wrap"><table><thead><tr><th>Due</th><th>Employee</th><th>What</th></tr></thead><tbody>${I.slice(0, 150).map((x) => `<tr><td style="white-space:nowrap">${fmtDate(x.due)}${x.late ? ' <span class="chip c-bad">Overdue</span>' : ""}</td><td>${x.empId && S.emps.get(x.empId) ? `<button class="link" data-emp="${esc(x.empId)}">${esc(x.who)}</button>` : esc(x.who)}</td><td>${esc(x.text)}</td></tr>`).join("")}</tbody></table></div>` : '<p><span class="chip c-ok">All in order</span> Nothing expiring in the next 30 days.</p>'}` : ""}
      <p class="t-muted" style="font-size:13px;margin:8px 0 0">From Reminders: documents with an expiry date (NBI, licences, medical), contracts ending, ID cards, training certificates, medical exams and missing 201 details. Mark them done on Reminders.</p>`); }
  if (tab === "att") { const d = S.aiDocs.get(aiPath("att", day)); const P = d?.people || [];
    return card("Attendance patterns", "att", "Check now", `${aiSumCard(d)}${d ? (P.length ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Assignment</th><th>Supervisor</th><th>What changed</th></tr></thead><tbody>${P.map((p) => `<tr><td>${S.emps.get(p.empId) ? `<button class="link" data-emp="${esc(p.empId)}">${esc(p.who)}</button>` : esc(p.who)}</td><td>${esc(p.site)}</td><td>${esc(p.sup || "—")}</td><td>${p.why.map(esc).join("<br>")}</td></tr>`).join("")}</tbody></table></div>` : `<p><span class="chip c-ok">No unusual changes</span> Checked ${d.checked || 0} people on the clock.</p>`) : ""}
      <p class="t-muted" style="font-size:13px;margin:8px 0 0">Each person against their own last 8 weeks: lates and absences in the last 2 weeks, and one-day leaves next to weekends. Meant for a supervisor's conversation, not a sanction.</p>`); }
  if (tab === "themes") { const m = todayISO().slice(0, 7), pm = addDays(m + "-01", -1).slice(0, 7); const d = S.aiDocs.get(aiPath("themes", m)) || S.aiDocs.get(aiPath("themes", pm));
    return card(`Exit and survey themes${d?.month ? ` · ${esc(monthLabel(d.month))}` : ""}`, "themes", "Group now", `${d ? `${d.summary ? `<div class="ai-sum">${icon("spark", 16)}<p>${esc(d.summary)}</p></div>` : ""}${(d.themes || []).length ? `<div class="table-wrap"><table><thead><tr><th>Theme</th><th class="num">Mentions</th><th>Tone</th><th>What people said</th><th>Suggested action</th></tr></thead><tbody>${d.themes.map((t) => `<tr><td><b>${esc(t.theme)}</b></td><td class="num">${Number(t.count) || ""}</td><td>${esc(t.tone || "")}</td><td style="font-size:13px">${(t.examples || []).slice(0, 3).map(esc).join("<br>")}</td><td style="font-size:13px">${esc(t.action || "")}</td></tr>`).join("")}</tbody></table></div><p class="t-muted" style="font-size:12px">From ${d.count} texts. Grouped ${esc(aiAgo(d.at))}.</p>` : ""}` : '<p class="t-muted" style="margin:0">Grouped in the first week of each month from exit interviews, satisfaction surveys, separation reasons and Ask HR concerns.</p>'}`); }
  if (tab === "budget") { const y = String(Number(todayISO().slice(0, 4)) + 1); const d = S.aiDocs.get(aiPath("budget", y));
    return `<section class="card"><div class="card-head"><h2>Workforce budget ${esc(y)} (draft)</h2>${S.canEdit ? `<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label for="ai-raise" style="font-size:14px">Wage increase %</label><input class="input" id="ai-raise" type="number" min="0" max="50" step="0.5" value="${esc(d?.raise ?? S.aiBudgetRaise)}" style="width:90px">${aiRunBtn("budget", d ? "Redraft" : "Draft it")}${d ? '<button class="btn btn-ghost btn-sm" data-ai-budget-csv>Download (CSV)</button>' : ""}</span>` : ""}</div>
      ${S.aiErr.budget ? `<p class="t-warn">${esc(S.aiErr.budget)}</p>` : ""}
      ${d ? `${d.notes ? `<div class="ai-sum">${icon("spark", 16)}<div style="white-space:pre-wrap">${esc(d.notes)}</div></div>` : ""}<div class="table-wrap"><table><thead><tr><th>Project</th><th class="num">Headcount</th><th class="num">Open slots</th><th class="num">Cost a month now</th><th class="num">Cost per head</th><th class="num">Planned headcount</th><th class="num">${esc(y)} with 13th month</th></tr></thead><tbody>
        ${d.lines.map((r) => `<tr><td>${esc(r.cc)}</td><td class="num">${r.heads}</td><td class="num">${r.open || ""}</td><td class="num">${money(r.monthCost)}</td><td class="num">${money(r.perHead)}</td><td class="num">${r.plan}</td><td class="num">${money(r.year)}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="num"><b>${d.tot.heads}</b></td><td></td><td class="num"><b>${money(d.tot.now / 12)}</b></td><td></td><td class="num"><b>${d.tot.plan}</b></td><td class="num"><b>${money(d.tot.year)}</b></td></tr></tbody></table></div>
        <p class="t-muted" style="font-size:12px">From the payrolls of ${esc((d.from || []).join(" and "))} (pay plus the employer's SSS, EC, PhilHealth and Pag-IBIG), current headcount and open job slots, with a ${d.raise}% increase. A draft for HR to adjust with each project; nothing is approved here. Drafted ${esc(aiAgo(d.at))}.</p>`
        : '<p class="t-muted" style="margin:0">Drafts next year\'s manpower and payroll budget per project from the last month\'s payroll, headcount and open job slots, with notes from the AI on what to question.</p>'}</section>`; }
  if (tab === "signin") { const s = S.aiSign; const day1 = S.aiSignDay || addDays(todayISO(), -1); const rows = (s?.rows || []).map((r) => ({ ...r, why: aiSignWhy(r) })); const flagged = rows.filter((r) => r.why.length);
    return `<section class="card"><div class="card-head"><h2>Sign-ins</h2><span style="display:flex;gap:8px;align-items:center"><label for="ai-sday" style="font-size:14px">Day</label><input class="input" type="date" id="ai-sday" value="${esc(day1)}" max="${todayISO()}" style="width:auto"></span></div>
      ${s?.loading ? '<p class="t-muted">Loading…</p>' : s?.err ? `<p class="t-warn">${esc(s.err)}</p>` : s ? `<p style="margin:0 0 10px">${flagged.length ? `<span class="chip c-warn">${flagged.length} to look at</span>` : '<span class="chip c-ok">Nothing unusual</span>'} ${rows.length} sign-ins and openings on ${fmtDate(day1)}.</p>
        ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Who</th><th>Device</th><th>Network address</th><th>Why it stands out</th></tr></thead><tbody>${(flagged.length ? [...flagged, ...rows.filter((r) => !r.why.length)] : rows).slice(0, 200).map((r) => `<tr><td style="white-space:nowrap">${esc(new Date(r.at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" }))}</td><td>${esc(r.name || "Account")}${r.staff ? ' <span class="chip c-blue">HR</span>' : ""}</td><td>${esc(aiDevice(r.ua))}</td><td style="font-family:monospace;font-size:13px">${esc(r.ip || "—")}</td><td>${r.why.length ? r.why.map((w) => `<span class="chip c-warn">${esc(w)}</span>`).join(" ") : '<span class="t-muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>` : ""}` : ""}
      <p class="t-muted" style="font-size:13px;margin:8px 0 0">Each sign-in is compared with the same person's last 30 days. A new address alone is common on mobile data; look closer at HR or payroll accounts with a new device at night. Kept 13 months.</p></section>`; }
  if (tab === "usage") { const u = S.aiUse; const st = u?.settings || {};
    return `<section class="card"><div class="card-head"><h2>AI usage ${u?.month ? `· ${esc(monthLabel(u.month))}` : ""}</h2></div>
      ${u?.loading ? '<p class="t-muted">Loading…</p>' : u?.err ? `<p class="t-warn">${esc(u.err)}</p>` : u ? `<p style="font-size:18px;margin:0 0 6px"><b>US$${Number(u.spent || 0).toFixed(2)}</b> of US$${Number(st.monthly_cap_usd || 0).toFixed(2)} this month <span class="t-muted" style="font-size:14px">(about ₱${money(Number(u.spent || 0) * 58)}) · ${u.calls} requests</span></p>
        <div class="ai-meter" role="img" aria-label="${Math.round((u.spent / (st.monthly_cap_usd || 1)) * 100)}% of the monthly AI budget used"><i style="width:${Math.min(100, Math.round((u.spent / (st.monthly_cap_usd || 1)) * 100))}%"></i></div>
        <div class="ai-two"><div><h3>By feature</h3><div class="table-wrap"><table><thead><tr><th>Feature</th><th class="num">Requests</th><th class="num">US$</th></tr></thead><tbody>${(u.byPurpose || []).map((r) => `<tr><td>${esc(AI_PURPOSE[r.purpose] || r.purpose || "Assistant")}${r.src !== "app" ? ` <small class="t-muted">(${r.src === "bot" ? "chat bot" : "server"})</small>` : ""}</td><td class="num">${r.calls}</td><td class="num">${Number(r.usd).toFixed(2)}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">No AI requests yet this month.</td></tr>'}</tbody></table></div></div>
          <div><h3>By person</h3><div class="table-wrap"><table><thead><tr><th>Person</th><th class="num">Requests</th><th class="num">US$</th></tr></thead><tbody>${(u.byPerson || []).map((r) => `<tr><td>${esc(r.name || (r.uid ? "Account" : "Automatic"))}</td><td class="num">${r.calls}</td><td class="num">${Number(r.usd).toFixed(2)}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">—</td></tr>'}</tbody></table></div></div></div>` : ""}</section>
      ${u && !u.err && !u.loading ? `<section class="card"><div class="card-head"><h2>Limits</h2></div><form id="ai-set-form" class="form-grid" style="align-items:end">
        <div class="field"><label for="ai-on">AI features</label><select class="input" id="ai-on"><option value="1" ${st.enabled ? "selected" : ""}>On</option><option value="0" ${st.enabled ? "" : "selected"}>Off for everyone</option></select></div>
        <div class="field"><label for="ai-cap">Monthly budget (US$)</label><input class="input" id="ai-cap" type="number" min="0" max="5000" step="1" value="${esc(st.monthly_cap_usd)}"></div>
        <div class="field"><label for="ai-hrd">Requests a day, HR staff</label><input class="input" id="ai-hrd" type="number" min="0" max="5000" value="${esc(st.hr_daily)}"></div>
        <div class="field"><label for="ai-empd">Requests a day, employees</label><input class="input" id="ai-empd" type="number" min="0" max="1000" value="${esc(st.emp_daily)}"></div>
        <div><button class="btn btn-primary">Save limits</button></div></form>
        <p class="t-muted" style="font-size:13px;margin:8px 0 0">When the budget is used up, the HR assistant, readers and chat bots stop answering until the next month or until you raise it. Costs are estimates from the provider's prices per word.</p></section>` : ""}`; }
  // about
  const agents = [["Fill from a document", "Every form HR staff use", "Reads an ID, government card, clearance, certificate, contract or resume and fills the empty fields."], ["Write with AI", "Every long text box", "Writes NTEs, memos, announcements, letters and replies in English, Tagalog or Taglish."], ["Incident and NTE writer", "Discipline › New case", "Turns a supervisor's voice note or notes into the incident details and facts for the notice to explain."],
    ["HR copilot", "HR assistant", "Finds leave, requests, tickets, cases, loans, meetings and reminders, and opens a case, job opening, applicant or announcement form filled in."], ["Morning briefing", "This page, each morning", "What needs action today: approvals, attendance, timekeeping issues, contracts, Ask HR, recruitment."], ["Payroll watch", "This page, each morning", "Separated staff paid, shared bank accounts, missing basic pay, pay jumps, overtime spikes, duplicate employee numbers."],
    ["Document and licence checker", "This page, each morning", "Expiring NBI clearances, licences, medical certificates, contracts and IDs, and missing 201 details, with what to fix first."], ["Attendance pattern watch", "This page, each morning", "People whose lates, absences or weekend-adjacent leaves changed against their own pattern."], ["Ask HR triage", "Ask HR, and the Telegram, Viber and Messenger bot", "Suggests the topic, desk and priority of each question; the chat bot asks one follow-up when details are missing."],
    ["Meeting action items to reminders", "Reminders", "Each action item in the minutes shows in Reminders with its owner and due date until it's done."], ["Monthly HR report writer", "Reports › Executive report", "Drafts the analysis of last month's executive HR report in the first week of the month."], ["Exit and survey themes", "This page, monthly", "Groups exit interviews, surveys, separation reasons and concerns into themes with suggested actions."],
    ["Sign-in watch", "This page (website, HR Managers)", "Sign-ins from a new network or device, at night, or from many addresses in a day."], ["Workforce budget drafter", "This page (Payroll)", "Next year's manpower and payroll budget per project, with notes on what to question."], ["AI usage and budget", "This page (website, HR Managers)", "Monthly spending cap, daily limits per person, and spend by feature and person."]];
  return `<section class="card"><div class="card-head"><h2>The AI agents</h2><span class="chip ${aiOn() ? "c-ok" : "c-gray"}">${aiOn() ? "AI is on" : "AI is off here"}</span></div>
    <p style="margin:0 0 10px;font-size:14px">Each agent reads, drafts, fills in or flags, then stops at a person. Nothing is saved, approved, paid or sent by the AI; what it fills in stays outlined until someone checks it.</p>
    <div class="table-wrap"><table><thead><tr><th>Agent</th><th>Where</th><th>What it does</th></tr></thead><tbody>${agents.map(([a, w, d]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(w)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div></section>`;
}
const AI_PURPOSE = { assistant: "HR assistant", "doc-reader": "Fill from a document", writer: "Write with AI", incident: "Incident and NTE writer", brief: "Morning briefing", "pay-watch": "Payroll watch", "doc-check": "Document checker", "att-watch": "Attendance watch", triage: "Ask HR triage", "report-writer": "Monthly report writer", themes: "Exit and survey themes", budget: "Workforce budget", chat: "Chat bot", careers: "Careers page assistant", interview: "AI interview", recruit: "CV screening", minutes: "Meeting minutes", bot: "Chat bot" };
VIEWS.aiagents = () => {
  const tabs = AI_TABS(); if (!tabs.some(([k]) => k === S.aiTab)) S.aiTab = "brief"; const t = S.aiTab; const day = AI_DAY();
  if (["brief", "pay", "docs", "att"].includes(t) && !S.aiDocs.has(aiPath(t, day))) aiGet(t, day).then(render);
  if (t === "themes") { const m = todayISO().slice(0, 7), pm = addDays(m + "-01", -1).slice(0, 7); if (!S.aiDocs.has(aiPath("themes", m))) Promise.all([aiGet("themes", m), aiGet("themes", pm)]).then(render); }
  if (t === "budget") { const y = String(Number(todayISO().slice(0, 4)) + 1); if (!S.aiDocs.has(aiPath("budget", y))) aiGet("budget", y).then(render); }
  if (t === "signin" && !S.aiSign) aiLoadSignins(S.aiSignDay || addDays(todayISO(), -1));
  if (t === "usage" && !S.aiUse) aiLoadUse();
  return head("Overview", "AI agents", S.canEdit && ["brief", "docs", "att", "pay"].some((k) => tabs.some(([x]) => x === k)) ? `<button class="btn btn-ghost" data-ai-run="all">${icon("spark", 16)}Run all checks now</button>` : "") + `
    <div class="notice"><span>${aiOn() ? "Drafts and flags only: the AI never saves, approves, pays or sends. Check what it gives you." : "AI isn't switched on here, so the checks show their figures without the written summaries, and the form helpers are hidden."}</span></div>
    <div class="seg ai-tabs" role="tablist" aria-label="AI agents">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === t}" data-ai-tab="${k}">${esc(l)}</button>`).join("")}</div>
    ${aiTabBody(t)}`;
};
// a short briefing card on the HR dashboard
{ const b = VIEWS.dash; VIEWS.dash = (...a) => { const h = b(...a); if (!S.realEdit || S.viewAs === "emp") return h; const d = S.aiDocs.get(aiPath("brief", AI_DAY()));
  if (d === undefined) { aiGet("brief", AI_DAY()).then((v) => { if (v && S.view?.name === "dash") render(); }); return h; } if (!d || (!d.summary && !d.lines?.length)) return h;
  const card = `<section class="card ai-brief-dash"><div class="card-head"><h2>${icon("spark", 18)} This morning's briefing</h2><button class="link" data-go="aiagents">AI agents</button></div>${d.summary ? `<p style="margin:0 0 8px">${esc(d.summary)}</p>` : ""}${!d.summary && d.lines?.length ? `<ul class="ai-list">${d.lines.slice(0, 4).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</section>`;
  const i = h.indexOf("</header>"); return i >= 0 ? h.slice(0, i + 9) + card + h.slice(i + 9) : card + h; }; }

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest?.("[data-ai-fill],[data-ai-write],[data-ai-w-use],[data-ai-close],[data-ai-case],[data-ai-case-mic],[data-ai-draft],[data-ai-tab],[data-ai-run],[data-ai-budget-csv]"); if (!t) return; const d = t.dataset;
  if (d.aiFill !== undefined) { ev.preventDefault(); return aiReadDoc(t); }
  if (d.aiWrite) { ev.preventDefault(); return aiWriteDlg(d.aiWrite); }
  if (d.aiWUse !== undefined) { const ta = document.getElementById(S.aiW?.taId); if (ta && S.aiW.text) { ta.value = S.aiW.text; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.classList.add("ai-filled"); ta.title = "Written by AI. Check it before saving."; } closeModal(); ta?.focus(); return; }
  if (d.aiClose !== undefined) { S.aiCase?.rec?.stop(); closeModal(); return; }
  if (d.aiCase !== undefined) return aiCaseDlg();
  if (d.aiCaseMic !== undefined) return aiCaseMic(t);
  if (d.aiDraft) { ev.stopImmediatePropagation(); const m = S.bot?.hr?.[Number(d.aiDraft)]; if (m?.draft) aiOpenDraft(m.draft); return; }
  if (d.aiTab) { S.aiTab = d.aiTab; render(); return; }
  if (d.aiBudgetCsv !== undefined) { const y = String(Number(todayISO().slice(0, 4)) + 1); const b = S.aiDocs.get(aiPath("budget", y)); if (!b) return;
    return offer(`workforce-budget-${y}-draft.csv`, toCSV([["Project", "Headcount", "Open slots", "Cost a month now", "Cost per head", "Planned headcount", `${y} with 13th month`], ...b.lines.map((r) => [r.cc, r.heads, r.open, r.monthCost, r.perHead, r.plan, r.year]), ["Total", b.tot.heads, "", PAY.r2(b.tot.now / 12), "", b.tot.plan, PAY.r2(b.tot.year)]])); }
  if (d.aiRun) { if (!S.canEdit) return; const k = d.aiRun;
    const fn = { all: () => aiDaily(true), brief: () => aiRunBrief(true), pay: () => aiRunPay(true), docs: () => aiRunDocs(true), att: () => aiRunAtt(true), themes: () => aiRunThemes(true), budget: () => { const v = Number($("#ai-raise")?.value); S.aiBudgetRaise = isFinite(v) ? Math.max(0, Math.min(50, v)) : 5; return aiRunBudget(S.aiBudgetRaise); } }[k]; if (!fn) return;
    S.aiBusy.add(k); render(); try { await fn(); delete S.aiErr[k]; toast("Done."); } catch (e) { S.aiErr[k] = aiErrTxt(e); toast(S.aiErr[k]); } finally { S.aiBusy.delete(k); render(); } }
}, true);
document.addEventListener("change", (ev) => { if (ev.target?.id === "ai-sday" && ev.target.value) aiLoadSignins(ev.target.value); });
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["ai-w-form", "ai-case-form", "ai-set-form"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation();
  if (f.id === "ai-w-form") return aiWriteGo(f);
  if (f.id === "ai-case-form") return aiCaseGo(f);
  if (!aiAdmin() || !window.__sb) return; const num = (id) => { const v = Number(f.querySelector(id).value); return isFinite(v) ? v : null; };
  const { error } = await window.__sb.rpc("hr_ai_set", { p_enabled: f.querySelector("#ai-on").value === "1", p_cap: num("#ai-cap"), p_emp_daily: num("#ai-empd"), p_hr_daily: num("#ai-hrd") });
  if (error) { toast("Couldn't save the limits. Try again."); return; } logActivity("Changed the AI limits"); toast("Limits saved."); aiLoadUse(S.aiUse?.month);
}, true);
{ const st = document.createElement("style"); st.textContent = `.ai-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 6px;grid-column:1/-1}.ai-bar .ai-msg{font-size:13px}
.ai-write{display:inline-flex;gap:4px;align-items:center;font-size:13px;margin-top:4px}.ai-filled{outline:2px solid #C9A961 !important;outline-offset:1px;background:#FFFBEF !important}
.ai-out{white-space:pre-wrap;border:1px solid var(--line,#E3E1DA);border-radius:10px;padding:12px;max-height:280px;overflow:auto;font-size:14px;background:#FCFBF8}
.ai-sum{display:flex;gap:10px;align-items:flex-start;background:#F7F3E8;border:1px solid #E8DDBF;border-radius:10px;padding:10px 12px;margin:0 0 8px}.ai-sum p{margin:0}
.ai-list{margin:6px 0 0;padding-left:20px;display:grid;gap:4px;font-size:14px}.ai-tabs{margin:0 0 14px;flex-wrap:wrap}.ai-case{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.ai-draft{margin:0 0 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ai-meter{height:10px;border-radius:6px;background:#EEE;overflow:hidden;margin:6px 0 14px}.ai-meter i{display:block;height:100%;background:#C9A961}
.ai-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.ai-two h3{font-size:15px;margin:0 0 6px}
html[data-theme="dark"] .ai-filled{background:#3A3320 !important}html[data-theme="dark"] .ai-sum{background:#2B2718;border-color:#4A4128}html[data-theme="dark"] .ai-out{background:#1E2230}`; document.head.appendChild(st); }
