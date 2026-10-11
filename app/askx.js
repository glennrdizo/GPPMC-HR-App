/* ---------- Ask HR: employees raise questions, concerns and follow-ups; HR and tagged staff answer; unread badges notify everyone ---------- */
Object.assign(S, { tixHr: new Map(), tixPhone: new Map(), tixSelf: new Map(), staffPub: null, akF: { st: "OPEN", mine: false, q: "" }, akOpen: null, akNew: false, akSubs: new Set(), akKnown: null, ppl: {} });
Object.assign(TCOLS, { tickets: "tixHr" });
{
  const ov = NAV.find(([g]) => g === "Overview"); const i = ov[1].findIndex(([v]) => v === "ann"); ov[1].splice(i >= 0 ? i + 1 : 1, 0, ["askhr", "Ask HR", "mail"]);
  Object.assign(SECTION_OF, { askhr: "askhr" });
  const j = ESS_NAV.findIndex(([v]) => v === "essann"); ESS_NAV.splice(j >= 0 ? j + 1 : 1, 0, ["essask", "Ask HR", "mail"]);
}
const AK_CAT = [["PAY", "Pay and payslip"], ["LEAVE", "Leave"], ["TIME", "Attendance and overtime"], ["LOAN", "Loans and benefits"], ["GOV", "SSS, PhilHealth, Pag-IBIG"], ["DOCS", "Documents and certificates"], ["CONCERN", "Concern or complaint"], ["OTHER", "Other question"]];
const AK_ST = { OPEN: ["New", "c-warn"], ANSWERED: ["Answered", "c-blue"], FOLLOWUP: ["Follow-up", "c-warn"], CLOSED: ["Resolved", "c-ok"] };
const akCat = (k) => AK_CAT.find((c) => c[0] === k)?.[1] || "Question";
const lastMsg = (t) => (t.msgs || [])[(t.msgs || []).length - 1] || null;
const timeAgo = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(iso.slice(0, 10)); };
function personName(id) {
  if (!id) return "HR"; if (id === "emp") return "Employee"; const n = S.ppl[id]?.name || S.profiles?.[id]?.name; if (n) return id === (S.myId || S.self?.uid) ? `${n} (you)` : n;
  if (S.userCap?.profiles && !S.ppl[id]) { S.ppl[id] = { name: "" }; S.userCap.profiles([id]).then((ps) => { for (const [k, v] of Object.entries(ps || {})) if (v?.name) S.ppl[k] = v; render(); }).catch(() => {}); }
  return S.staffPub?.list?.find((x) => x.id === id)?.label || "HR staff";
}

/* ---------- staff that employees can tag (published by HR to pub/staff, readable by everyone) ---------- */
function staffList() {
  if (S.staffPub?.list) return S.staffPub.list;
  const a = S.access || {}; const ids = [...new Set([...Object.keys(a.users || {}), ...Object.keys(a.seen || {}), S.myId].filter(Boolean))];
  return ids.filter((id) => (a.users?.[id]?.role || "admin") !== "none").map((id) => ({ id, label: (ROLES[a.users?.[id]?.role || (a.defaultRole || "admin")] || {}).name || "HR staff" }));
}
let staffSynced = "";
function syncStaff() {
  if (!S.realEdit || !S.db || !S.access) return; const list = staffList().map((x) => ({ id: x.id, label: x.label })); const key = JSON.stringify(list); if (key === staffSynced || key === JSON.stringify(S.staffPub?.list || null)) { staffSynced = key; return; }
  staffSynced = key; S.db.doc("pub/staff").set({ list, at: todayISO() }).catch(() => {});
}

/* ---------- loading ---------- */
function watchPhones() {
  for (const d of S.clockDevs.values()) { if (d.kiosk || d.bio || S.akSubs.has(d.id)) continue; S.akSubs.add(d.id);
    S.db.collection(`clockins/${d.id}/tickets`).limit(200).onSnapshot((snap) => { for (const [k, t] of S.tixPhone) if (t.dev === d.id) S.tixPhone.delete(k);
      for (const x of snap.docs) S.tixPhone.set(`${d.id}:${x.id}`, { id: x.id, key: `${d.id}:${x.id}`, src: "self", dev: d.id, claim: d, ...x.data() }); akNotify(); refresh(); }, () => {}); }
}
{ const b = bootIO; bootIO = (db) => { b(db);
  db.collection("tickets").limit(1000).onSnapshot((snap) => { S.tixHr = new Map(snap.docs.map((d) => [d.id, { id: d.id, key: `hr:${d.id}`, src: "hr", ...d.data() }])); akNotify(); refresh(); }, () => {});
  db.doc("pub/staff").onSnapshot((d) => { S.staffPub = d.exists ? d.data() : null; }, () => {});
  setTimeout(function tick() { if (S.clockDevs?.size) watchPhones(); syncStaff(); setTimeout(tick, 15000); }, 1500); }; }
const akAll = () => [...S.tixHr.values(), ...[...S.tixPhone.values()].map(akClean)];
const akEmp = (t) => S.emps.get(t.src === "self" ? t.dev && S.clockLinks[t.dev] : t.empId) || null;
const akWho = (t) => { const e = akEmp(t); return e ? fullName(e) : t.name || t.claim?.name || "Employee"; };
/* Unread for staff: the last message is from someone else and came after this person last opened it. Tagged staff are always notified; HR staff for anything not closed. */
const akUnread = (t, me = S.myId) => { const m = lastMsg(t); return !!m && m.by !== me && (!t.seen?.[me] || t.seen[me] < m.t) && t.status !== "CLOSED" || (!!m && (t.tags || []).includes(me) && m.by !== me && (!t.seen?.[me] || t.seen[me] < m.t)); };
const akEmpUnread = (t) => { const m = lastMsg(t); return !!m && m.by !== "emp" && (!t.seenEmp || t.seenEmp < m.t); };
function akNotify() {
  const n = S.realEdit ? akAll().filter((t) => akUnread(t)).length : listOf(S.tixSelf).filter(akEmpUnread).length;
  if (S.akKnown != null && n > S.akKnown) toast(S.realEdit ? "New message in Ask HR." : "HR replied to your question.");
  S.akKnown = n; try { document.title = (n ? `(${n}) ` : "") + document.title.replace(/^\(\d+\) /, ""); } catch {}
}
{ const bn = renderNav; renderNav = () => { bn(); const n = S.selfMode ? listOf(S.tixSelf).filter(akEmpUnread).length : S.realEdit ? akAll().filter((t) => akUnread(t)).length : 0; document.getElementById("menu-toggle")?.classList.toggle("ak-has", n > 0); if (!n) return;
    for (const el of document.querySelectorAll('#nav [data-go="askhr"], #nav [data-ess="essask"], #nav [data-self-tab="ask"]')) el.insertAdjacentHTML("beforeend", `<span class="ak-badge" aria-label="${n} unread">${n}</span>`); }; }

/* ---------- saving ---------- */
const tixPath = (t) => t.src === "self" ? `clockins/${t.dev}/tickets/${t.id}` : t.src === "mine" ? `clockins/${S.self.uid}/tickets/${t.id}` : `tickets/${t.id}`;
async function saveTix(t, patch) { const { id, key, src, dev, claim, ...rest } = t; const next = { ...rest, ...patch }; await S.db.doc(tixPath(t)).set(JSON.parse(JSON.stringify(next)));
  const full = { ...t, ...patch }; if (src === "self") S.tixPhone.set(key, full); else if (src === "mine") S.tixSelf.set(id, full); else S.tixHr.set(id, full); S.ver++; return full; }
async function markSeen(t) { if (S.realEdit && S.myId && akUnread(t)) { await saveTix(t, { seen: { ...(t.seen || {}), [S.myId]: new Date().toISOString() } }).catch(() => {}); renderNav(); }
  if (t.src === "mine" && akEmpUnread(t)) { await saveTix(t, { seenEmp: new Date().toISOString() }).catch(() => {}); renderNav(); } }

/* ---------- shared pieces ---------- */
function akNewForm(idp, staff) {
  return `<form id="${idp}-new" class="stack" style="gap:12px" data-keep>
    <div class="form-grid"><div class="field"><label for="${idp}-cat">Topic</label><select class="input" id="${idp}-cat">${opts(AK_CAT, "PAY")}</select></div>
      <div class="field"><label for="${idp}-sub">Subject <span class="req">*</span></label><input class="input" id="${idp}-sub" required maxlength="120" placeholder="e.g. Overtime missing on my payslip"></div></div>
    <div class="field"><label for="${idp}-body">Your question or concern <span class="req">*</span></label><textarea class="input" id="${idp}-body" rows="4" required maxlength="3000" placeholder="Give the dates, amounts or names that help HR answer."></textarea></div>
    <fieldset class="or-fs"><legend>Tag the staff who should see this</legend>${staff.length ? staff.map((s) => `<label class="or-p"><input type="checkbox" name="${idp}-tag" value="${esc(s.id)}">${esc(personName(s.id))} <small class="t-muted">${esc(s.label)}</small></label>`).join("") : '<span class="t-muted" style="font-size:14px">The HR team sees every question.</span>'}</fieldset>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-ak-new="0">Cancel</button><button class="btn btn-primary">Send to HR</button></div></form>`;
}
function akThread(t, who) {
  const isEmp = who === "emp"; const st = AK_ST[t.status] || AK_ST.OPEN;
  return `<section class="card ak-thread"><div class="card-head"><h2>${esc(t.subject || "Question")}</h2><button class="link" data-ak-open="">Close</button></div>
    <p style="margin:0 0 10px;font-size:14px"><span class="chip ${st[1]}">${st[0]}</span> <span class="t-muted">${esc(akCat(t.cat))} · from ${esc(isEmp ? "you" : akWho(t))} · ${esc(timeAgo(t.created))}</span>${(t.tags || []).length ? `<br><span class="t-muted">Tagged: ${t.tags.map((id) => esc(personName(id))).join(", ")}</span>` : ""}</p>
    <ol class="ak-msgs">${(t.msgs || []).map((m) => { const mine = isEmp ? m.by === "emp" : m.by === S.myId; return `<li class="${mine ? "me" : ""} ${m.by === "emp" ? "emp" : "hr"}"><b>${esc(m.by === "emp" ? (isEmp ? "You" : akWho(t)) : personName(m.by))}</b><small class="t-muted"> ${esc(timeAgo(m.t))}</small><p>${esc(m.text)}</p></li>`; }).join("")}</ol>
    ${t.status === "CLOSED" ? `<p class="t-muted" style="font-size:14px;margin:8px 0">Marked resolved${t.closed ? ` on ${fmtDate(t.closed.slice(0, 10))}` : ""}.</p><button class="btn btn-ghost btn-sm" data-ak-st="${esc(t.key || t.id)}:${isEmp ? "FOLLOWUP" : "OPEN"}">${isEmp ? "Follow up again" : "Reopen"}</button>`
      : `<form id="ak-reply" class="stack" style="gap:8px;margin-top:10px" data-key="${esc(t.key || t.id)}" data-who="${who}" data-keep><label class="sr-only" for="ak-text">Reply</label><textarea class="input" id="ak-text" rows="3" required maxlength="3000" placeholder="${isEmp ? "Add a follow-up" : "Write your answer"}"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${!isEmp && S.realEdit ? `<select class="input" id="ak-tag" style="width:auto" aria-label="Tag another staff member">${opts(staffList().filter((s) => !(t.tags || []).includes(s.id)).map((s) => [s.id, personName(s.id)]), "", "Tag staff…")}</select>` : ""}
          <button type="button" class="btn btn-ghost" data-ak-st="${esc(t.key || t.id)}:CLOSED">${isEmp ? "My concern is resolved" : "Mark resolved"}</button><button class="btn btn-primary">${isEmp ? "Send follow-up" : "Send answer"}</button></div></form>`}</section>`;
}
const akRow = (t, who) => { const st = AK_ST[t.status] || AK_ST.OPEN; const un = who === "emp" ? akEmpUnread(t) : akUnread(t); const m = lastMsg(t); const tagged = (t.tags || []).includes(S.myId);
  return `<li><button class="ak-row${un ? " unread" : ""}" data-ak-open="${esc(t.key || t.id)}"><span class="ak-dot" aria-hidden="true"></span><span class="ak-main"><b>${esc(t.subject || "Question")}</b><small class="t-muted">${who === "emp" ? "" : `${esc(akWho(t))} · `}${esc(akCat(t.cat))}${tagged ? ' · <span class="t-warn">tagged you</span>' : ""}</small>${m ? `<small class="ak-last">${esc(m.by === "emp" ? (who === "emp" ? "You" : "Employee") : personName(m.by))}: ${esc(m.text.slice(0, 90))}</small>` : ""}</span>
    <span class="ak-side"><span class="chip ${st[1]}">${st[0]}</span><small class="t-muted">${esc(timeAgo(t.updated || t.created))}</small></span></button></li>`; };

/* ---------- HR page ---------- */
VIEWS.askhr = () => {
  if (S.clockDevs?.size) watchPhones(); const F = S.akF; const q = F.q.toLowerCase(); const all = akAll().sort((a, b) => (b.updated || b.created || "").localeCompare(a.updated || a.created || ""));
  const list = all.filter((t) => (F.st === "OPEN" ? t.status !== "CLOSED" : !F.st || t.status === F.st) && (!F.mine || (t.tags || []).includes(S.myId)) && (!q || `${t.subject} ${akWho(t)} ${(t.msgs || []).map((m) => m.text).join(" ")}`.toLowerCase().includes(q)));
  const open = S.akOpen ? all.find((t) => t.key === S.akOpen) : null; if (open) setTimeout(() => markSeen(open), 0);
  const fe = S.emps.get(S.empFor);
  return head("Questions, concerns and follow-ups from employees", "Ask HR", S.canEdit ? `<button class="btn btn-gold" data-ak-new="1">${icon("plus")}New on behalf of an employee</button>` : "") + `
    <section class="stats">${dxTile("Unread for you", all.filter((t) => akUnread(t)).length, "new questions and follow-ups", all.some((t) => akUnread(t)) ? "t-warn" : "t-muted")}${dxTile("Waiting for an answer", all.filter((t) => ["OPEN", "FOLLOWUP"].includes(t.status)).length, "new or followed up", "t-warn")}${dxTile("Tagged you", all.filter((t) => (t.tags || []).includes(S.myId) && t.status !== "CLOSED").length, "open questions")}${dxTile("Resolved in 30 days", all.filter((t) => t.status === "CLOSED" && (t.closed || "") >= addDays(todayISO(), -30)).length, "questions", "t-ok")}</section>
    ${S.akNew && S.canEdit ? `<section class="card"><div class="card-head"><h2>New question for an employee</h2></div><div class="field" style="margin-bottom:10px"><label for="emp-for">Employee</label><select class="input" id="emp-for">${opts(active().sort((a, b) => fullName(a).localeCompare(fullName(b))).map((e) => [e.id, fullName(e)]), S.empFor, "Choose employee…")}</select></div>${fe ? akNewForm("akh", staffList()) : ""}</section>` : ""}
    ${open ? akThread(open, "hr") : ""}
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${stTabs(F.st, "ak-f", [["OPEN", "Open"], ["CLOSED", "Resolved"], ["", "All"]])}
      <label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="ak-mine" ${F.mine ? "checked" : ""}> Tagged me</label><input class="input" type="search" id="ak-q" value="${esc(F.q)}" placeholder="Search" aria-label="Search questions" style="flex:1;min-width:160px"></div>
      ${list.length ? `<ul class="ak-list">${list.slice(0, 200).map((t) => akRow(t, "hr")).join("")}</ul>` : '<p class="empty">No questions here.</p>'}
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Employees ask from the Ask HR tab on their phone time clock. Everyone gets a red count on Ask HR when something new arrives: the employee when HR answers, HR and the tagged staff when the employee writes.</p></section>`;
};
function akDash() {
  if (!S.realEdit) return ""; const all = akAll(); const un = all.filter((t) => akUnread(t)).sort((a, b) => (lastMsg(b)?.t || "").localeCompare(lastMsg(a)?.t || "")); const waiting = all.filter((t) => ["OPEN", "FOLLOWUP"].includes(t.status)).length;
  return `<section class="card ak-dash"><div class="card-head"><h2>${icon("mail", 18)} Ask HR</h2><button class="link" data-go="askhr">Open Ask HR</button></div>
    <p style="margin:0 0 10px;font-size:14px">${un.length ? `<b class="t-warn">${un.length} unread</b> · ` : ""}${waiting} waiting for an answer · ${all.filter((t) => (t.tags || []).includes(S.myId) && t.status !== "CLOSED").length} tagged you</p>
    ${un.length ? `<ul class="ak-list">${un.slice(0, 4).map((t) => akRow(t, "hr")).join("")}</ul>` : '<p class="t-muted" style="margin:0;font-size:14px">Nothing new. Employees ask questions from their phone time clock.</p>'}</section>`;
}
{ const base = VIEWS.dash; VIEWS.dash = () => { const h = base(); const card = akDash(); if (!card) return h; const i = h.indexOf('<section class="card ann-dash'); return i >= 0 ? h.slice(0, i) + card + h.slice(i) : h + card; }; }

/* ---------- Employee view (HR preview) ---------- */
ESS.essask = (e) => {
  const mine = akAll().filter((t) => akEmp(t)?.id === e.id).sort((a, b) => (b.updated || "").localeCompare(a.updated || "")); const open = S.akOpen ? mine.find((t) => t.key === S.akOpen) : null;
  return head("Questions, concerns and follow-ups", "Ask HR", S.realEdit ? `<button class="btn btn-gold" data-ak-new="1">${icon("plus")}Ask a question</button>` : "") + `
    ${S.akNew && S.realEdit ? `<section class="card"><div class="card-head"><h2>Ask HR</h2></div>${akNewForm("ake", staffList())}</section>` : ""}${open ? akThread(open, "hr") : ""}
    <section class="card">${mine.length ? `<ul class="ak-list">${mine.map((t) => akRow(t, "hr")).join("")}</ul>` : '<p class="empty">No questions yet.</p>'}</section>`;
};

/* ---------- employee's own phone ---------- */
{ const bn = selfNav; selfNav = () => { const h = bn(); if (!S.self?.claim) return h; loadSelfTix(); const cur = S.selfTab === "ask" ? ' aria-current="page"' : "";
    return h.replace('<div class="me-card">', `<div class="nav-group" style="margin-top:-6px"><button class="nav-item" data-self-tab="ask"${cur}>${icon("mail")}Ask HR</button></div><div class="me-card">`).replace(/(data-self-tab="(?:clock|loans)") aria-current="page"/g, S.selfTab === "ask" ? "$1" : '$1 aria-current="page"'); };
  const bv = selfView; selfView = () => S.selfTab === "ask" && S.self?.claim ? selfAsk() : bv(); }
function loadSelfTix() { if (S.selfTixSub || !S.self?.uid || !S.db) return; S.selfTixSub = true;
  S.db.collection(`clockins/${S.self.uid}/tickets`).limit(200).onSnapshot((snap) => { S.tixSelf = new Map(snap.docs.map((d) => [d.id, { id: d.id, key: d.id, src: "mine", ...d.data() }])); akNotify(); render(); }, () => {});
  S.db.doc("pub/staff").onSnapshot((d) => { S.staffPub = d.exists ? d.data() : null; render(); }, () => {}); }
function selfAsk() {
  loadSelfTix(); const mine = listOf(S.tixSelf).sort((a, b) => (b.updated || "").localeCompare(a.updated || "")); const open = S.akOpen ? S.tixSelf.get(S.akOpen) : null; if (open) setTimeout(() => markSeen(open), 0);
  return head(`${esc(S.self.claim.name || "")} · ${esc(S.self.claim.empNo || "")}`, "Ask HR") + `<div style="max-width:680px" class="stack">
    ${S.akNew ? `<section class="card"><div class="card-head"><h2>Ask HR</h2></div>${akNewForm("aks", S.staffPub?.list || [])}</section>` : `<button class="btn btn-primary" data-ak-new="1" style="min-height:48px">${icon("plus")}Ask a question or raise a concern</button>`}
    ${open ? akThread(open, "emp") : ""}
    <section class="card"><h2 style="font-size:18px;margin:0 0 10px">My questions</h2>${mine.length ? `<ul class="ak-list">${mine.map((t) => akRow(t, "emp")).join("")}</ul>` : '<p class="t-muted" style="margin:0">Nothing yet. HR answers here, and you see a red count on Ask HR when they reply.</p>'}</section></div>`;
}

/* ---------- events ---------- */
const akFind = (key) => akAll().find((t) => t.key === key) || S.tixSelf.get(key);
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ak-new],[data-ak-open],[data-ak-f],[data-ak-st]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.akNew !== undefined) { S.akNew = d.akNew === "1"; S.akOpen = null; render(); return; }
  if (d.akOpen !== undefined) { S.akOpen = d.akOpen || null; S.akNew = false; render(); if (d.akOpen) window.scrollTo({ top: 0 }); return; }
  if (d.akF !== undefined) { S.akF.st = d.akF; render(); return; }
  if (d.akSt) { const i = d.akSt.lastIndexOf(":"); const tk = akFind(d.akSt.slice(0, i)); const st = d.akSt.slice(i + 1); if (!tk) return; const now = new Date().toISOString();
    try { await saveTix(tk, { status: st, updated: now, closed: st === "CLOSED" ? now : null, msgs: [...(tk.msgs || []), { by: S.selfMode ? "emp" : S.myId || "hr", t: now, text: st === "CLOSED" ? "Marked this resolved." : "Reopened this." }] });
      toast(st === "CLOSED" ? "Marked resolved." : "Reopened."); render(); } catch { toast("Couldn't save. Try again."); } }
}, true);
document.addEventListener("change", (ev) => { const t = ev.target;
  if (t.id === "ak-mine") { S.akF.mine = t.checked; render(); }
  if (t.id === "ak-tag" && t.value && S.realEdit) { const f = t.closest("form"); const tk = akFind(f.dataset.key); const id = t.value; const now = new Date().toISOString();
    saveTix(tk, { tags: [...new Set([...(tk.tags || []), id])], updated: now, msgs: [...(tk.msgs || []), { by: S.myId || "hr", t: now, text: `Tagged ${personName(id)}.` }] }).then(() => { toast("Tagged."); render(); }).catch(() => toast("Couldn't save. Try again.")); } });
document.addEventListener("input", (ev) => { if (ev.target.id !== "ak-q") return; S.akF.q = ev.target.value; const p0 = ev.target.selectionStart; render(); const i = $("#ak-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["aks-new", "ake-new", "akh-new", "ak-reply"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const btn = f.querySelector("button.btn-primary"); const now = new Date().toISOString();
  try {
    if (f.id === "ak-reply") { const tk = akFind(f.dataset.key); const text = $("#ak-text").value.trim(); if (!text || !tk) return; if (btn) btn.disabled = true; const emp = f.dataset.who === "emp";
      await saveTix(tk, { msgs: [...(tk.msgs || []), { by: emp ? "emp" : S.myId || "hr", t: now, text }], status: emp ? "FOLLOWUP" : "ANSWERED", updated: now, ...(emp ? { seenEmp: now } : { seen: { ...(tk.seen || {}), [S.myId]: now } }) });
      if (!emp) logActivity(`Answered "${tk.subject}" in Ask HR`); toast(emp ? "Follow-up sent to HR." : "Answer sent. The employee sees it on their phone."); render(); return; }
    const idp = f.id.split("-")[0]; const sub = $(`#${idp}-sub`).value.trim(); const body = $(`#${idp}-body`).value.trim(); if (!sub || !body) { toast("Write the subject and your question."); return; }
    if (btn) btn.disabled = true; const tags = [...f.querySelectorAll(`[name="${idp}-tag"]:checked`)].map((x) => x.value); const id = uid();
    const rec = { subject: sub, cat: $(`#${idp}-cat`).value, tags, status: "OPEN", created: now, updated: now, msgs: [{ by: "emp", t: now, text: body }], seenEmp: now };
    if (f.id === "aks-new") { await S.db.doc(`clockins/${S.self.uid}/tickets/${id}`).set(JSON.parse(JSON.stringify({ ...rec, empNo: S.self.claim.empNo || null, name: S.self.claim.name || null }))); toast("Sent. HR and the staff you tagged are notified."); }
    else { if (!S.realEdit) return; const e = idp === "ake" ? essEmp() : S.emps.get(S.empFor); if (!e) { toast("Choose the employee."); return; }
      await saveRec("tickets", id, { ...rec, empId: e.id, by: S.myId || null, seen: { [S.myId]: now } }); logActivity(`Logged an Ask HR question for ${fullName(e)}`); toast("Saved to Ask HR."); }
    S.akNew = false; render();
  } catch { toast("Couldn't send. Try again."); if (btn) btn.disabled = false; }
}, true);
