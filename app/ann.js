/* ---------- company announcements ---------- */
Object.assign(TCOLS, { announcements: "anns" });
Object.assign(S, { anns: new Map(), annCat: "", annQ: "", annShow: "live" });
Object.assign(ICON, { mega: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>', pin2: '<path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z"/>' });
{
  const ov = NAV.find(([g]) => g === "Overview"); ov[1].splice(1, 0, ["ann", "Announcements", "mega"]);
  Object.assign(SECTION_OF, { ann: "ann", annForm: "ann" });
  const i = ESS_NAV.findIndex(([v]) => v === "esstime"); ESS_NAV.splice(i, 0, ["essann", "Announcements", "mega"]);
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("announcements").limit(500).onSnapshot((snap) => { S.anns = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); }, () => {}); }; }

const ANN_CATS = [["GENERAL", "General", "c-blue"], ["MEMO", "Memo", "c-gray"], ["POLICY", "Policy", "c-blue"], ["HOLIDAY", "Holiday", "c-ok"], ["EVENT", "Event", "c-ok"], ["SAFETY", "Safety", "c-warn"], ["URGENT", "Urgent", "c-bad"]];
const annCat = (k) => ANN_CATS.find((c) => c[0] === k) || ANN_CATS[0];
const annState = (a, d = todayISO()) => (a.from && a.from > d ? "SCHEDULED" : a.until && a.until < d ? "EXPIRED" : "LIVE");
function annAudience(a) {
  const t = a.aud || "all"; if (t === "all") return "Everyone"; if (t === "ho") return "Head Office"; if (t === "prj") return "All projects";
  const [k, id] = t.split(":"); return k === "p" ? S.projects.get(id)?.name || "A project" : k === "d" ? dept(id)?.name || "A department" : "Everyone";
}
function annFor(a, e) {
  const t = a.aud || "all"; if (t === "all") return true; if (t === "ho") return !e.projectId; if (t === "prj") return !!e.projectId;
  const [k, id] = t.split(":"); return k === "p" ? e.projectId === id : k === "d" ? e.deptId === id : true;
}
const annReach = (a) => active().filter((e) => annFor(a, e));
const annSort = (x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || String(y.from || y.at || "").localeCompare(String(x.from || x.at || ""));
function annText(a) { return `📢 ${a.title.toUpperCase()}\n\n${a.body}\n\n— ${S.org?.companyName || "HR"}${a.until ? ` (until ${fmtDate(a.until)})` : ""}`; }
function annCard(a, full = true) {
  const c = annCat(a.cat); const st = annState(a); const ed = S.canEdit; const reach = annReach(a).length; const acks = Object.keys(a.acks || {}).length;
  return `<article class="card ann${a.pinned ? " ann-pin" : ""}${a.cat === "URGENT" ? " ann-urgent" : ""}">
    <div class="ann-top"><span class="chip ${c[2]}">${c[1]}</span>${a.pinned ? `<span class="chip c-gold">${icon("pin2", 12)} Pinned</span>` : ""}${st !== "LIVE" ? `<span class="chip c-gray">${st === "SCHEDULED" ? `Shows from ${fmtDate(a.from)}` : "Expired"}</span>` : ""}
      <span class="t-muted ann-meta">${fmtDate(a.from || a.at)} · ${esc(annAudience(a))}</span></div>
    <h2 class="ann-t">${esc(a.title)}</h2>
    ${a.img ? `<img class="ann-img" src="/_blob/${esc(a.img.id)}" alt="${esc(a.img.name || a.title)}">` : ""}
    <div class="ann-body${full ? "" : " ann-clip"}">${esc(a.body)}</div>
    ${a.file ? `<a class="btn btn-ghost btn-sm" style="align-self:flex-start" href="/_blob/${esc(a.file.id)}" target="_blank" rel="noopener">${icon("clip", 16)}${esc(a.file.name || "Attachment")}</a>` : ""}
    ${full ? `<div class="ann-foot"><span class="t-muted" style="font-size:13px">${a.by ? `Posted by ${esc(recName(a.by).replace(/ \(you\)$/, ""))} · ` : ""}reaches ${reach} ${reach === 1 ? "employee" : "employees"}${a.ack ? ` · <b>${acks} of ${reach}</b> confirmed reading` : ""}</span>
      <span class="ann-acts"><button class="link" data-ann-copy="${a.id}">Copy for Viber / Facebook</button><button class="link" data-ann-print="${a.id}">Print notice</button>
      ${ed ? `<button class="link" data-ann-pin="${a.id}">${a.pinned ? "Unpin" : "Pin"}</button><button class="link" data-ann-edit="${a.id}">Edit</button><button class="link danger" data-ann-del="${a.id}">Delete</button>` : ""}</span></div>` : ""}
  </article>`;
}
VIEWS.ann = () => {
  const all = listOf(S.anns).sort(annSort); const q = (S.annQ || "").toLowerCase(); const show = S.annShow || "live";
  const list = all.filter((a) => (!S.annCat || a.cat === S.annCat) && (show === "all" || annState(a) === show.toUpperCase()) && (!q || `${a.title} ${a.body}`.toLowerCase().includes(q)));
  const n = (s) => all.filter((a) => annState(a) === s).length;
  return head("Company", "Announcements", S.canEdit ? `<button class="btn btn-primary" data-go="annForm">${icon("plus")}New announcement</button>` : "") + `
    <section class="card ann-filters">
      <input class="input" type="search" id="ann-q" value="${esc(S.annQ || "")}" placeholder="Search announcements" aria-label="Search announcements" style="flex:1;min-width:200px">
      <select class="input" id="ann-cat" aria-label="Category" style="width:auto">${opts(ANN_CATS.map(([k, l]) => [k, l]), S.annCat, "All categories")}</select>
      <div class="tabs" role="tablist">${[["live", `Showing now (${n("LIVE")})`], ["scheduled", `Scheduled (${n("SCHEDULED")})`], ["expired", `Expired (${n("EXPIRED")})`], ["all", "All"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${show === k}" data-ann-show="${k}">${l}</button>`).join("")}</div></section>
    ${list.length ? `<div class="ann-list">${list.map((a) => annCard(a)).join("")}</div>` : `<section class="card"><div class="empty-state"><span class="es-ic">${icon("mega", 22)}</span><p>${all.length ? "No announcements match." : "No announcements yet. Post memos, policies, holiday notices, events and safety reminders here."}</p></div></section>`}`;
};
VIEWS.annForm = () => {
  const a = S.view.id ? S.anns.get(S.view.id) : null; const v = a || { cat: "GENERAL", aud: "all", from: todayISO(), ack: false };
  const projs = listOf(S.projects).filter((p) => p.status !== "DONE"); const D = S.org?.departments || [];
  const aud = [["all", "Everyone"], ["ho", "Head Office only"], ["prj", "All project sites"], ...projs.map((p) => [`p:${p.id}`, `Project: ${p.name}`]), ...D.map((d) => [`d:${d.id}`, `Department: ${d.name}`])];
  return backLink('data-go="ann"', "Announcements") + head("Announcements", a ? "Edit announcement" : "New announcement") + `
    <form id="ann-form" class="card stack" style="gap:16px" data-keep novalidate>
      <div class="field"><label for="an-title">Title <span class="req">*</span></label><input class="input" id="an-title" required maxlength="140" value="${esc(v.title || "")}" placeholder="e.g. Office closed on November 1 (All Saints' Day)"></div>
      <div class="form-grid">
        <div class="field"><label for="an-cat">Category</label><select class="input" id="an-cat">${opts(ANN_CATS.map(([k, l]) => [k, l]), v.cat)}</select></div>
        <div class="field"><label for="an-aud">Who should see it</label><select class="input" id="an-aud">${opts(aud, v.aud)}</select></div>
        <div class="field"><label for="an-from">Show from</label><input class="input" id="an-from" type="date" value="${esc(v.from || todayISO())}"></div>
        <div class="field"><label for="an-until">Show until (optional)</label><input class="input" id="an-until" type="date" value="${esc(v.until || "")}"></div>
      </div>
      <div class="field"><label for="an-body">Message <span class="req">*</span></label><textarea class="input" id="an-body" rows="8" placeholder="Write the announcement">${esc(v.body || "")}</textarea></div>
      <div class="form-grid" style="align-items:center">
        <label class="check"><input type="checkbox" id="an-pin" ${v.pinned ? "checked" : ""}><span>Pin to the top and to the dashboard</span></label>
        <label class="check"><input type="checkbox" id="an-ack" ${v.ack ? "checked" : ""}><span>Ask employees to confirm they have read it</span></label>
      </div>
      ${S.assets ? `<div class="form-grid">
        <div class="field"><label>Picture (optional)</label>${v.img ? `<div class="t-muted" style="font-size:13px">${esc(v.img.name || "Picture")} · <label class="link" style="cursor:pointer">Change<input type="file" id="an-img" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label> · <button type="button" class="link danger" data-ann-rm="img">Remove</button></div>` : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;align-self:flex-start">${icon("camera", 16)}Add a picture<input type="file" id="an-img" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>`}<span id="an-img-name" class="t-muted" style="font-size:13px"></span></div>
        <div class="field"><label>Attachment (optional, PDF)</label>${v.file ? `<div class="t-muted" style="font-size:13px">${esc(v.file.name || "File")} · <label class="link" style="cursor:pointer">Change<input type="file" id="an-file" accept="application/pdf" hidden></label> · <button type="button" class="link danger" data-ann-rm="file">Remove</button></div>` : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;align-self:flex-start">${icon("clip", 16)}Attach a PDF<input type="file" id="an-file" accept="application/pdf" hidden></label>`}<span id="an-file-name" class="t-muted" style="font-size:13px"></span></div></div>` : ""}
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;align-items:center"><p class="err" id="an-err" style="margin:0 auto 0 0" hidden></p><button type="button" class="btn btn-ghost" data-go="ann">Cancel</button><button class="btn btn-primary">${a ? "Save changes" : "Post announcement"}</button></div></form>`;
};
/* dashboard card: pinned first, then newest that are showing now */
function annDash() {
  const live = listOf(S.anns).filter((a) => annState(a) === "LIVE").sort(annSort).slice(0, 3);
  if (!live.length && !S.canEdit) return "";
  return `<section class="card ann-dash"><div class="card-head"><h2>${icon("mega", 20)} Announcements</h2>${live.length ? `<button class="link" data-go="ann">See all</button>` : ""}</div>
    ${live.length ? `<div class="ann-dash-list">${live.map((a) => { const c = annCat(a.cat); return `<button class="ann-row" data-go="ann"><span class="chip ${c[2]}">${c[1]}</span><span class="ann-row-t"><b>${a.pinned ? "📌 " : ""}${esc(a.title)}</b><span class="t-muted">${esc(a.body.slice(0, 140))}${a.body.length > 140 ? "…" : ""}</span></span><span class="t-muted ann-row-d">${fmtDate(a.from || a.at)}</span></button>`; }).join("")}</div>`
      : `<div class="empty-state"><span class="es-ic">${icon("mega", 22)}</span><p>No announcements showing. <button class="link" data-go="annForm">Post one</button></p></div>`}</section>`;
}
ESS.essann = (e) => {
  const list = listOf(S.anns).filter((a) => annState(a) === "LIVE" && annFor(a, e)).sort(annSort);
  return head("Employee", "Announcements") + (list.length ? `<div class="ann-list">${list.map((a) => annCard(a, true).replace(/<span class="ann-acts">[^]*?<\/span><\/div>/, a.ack ? `<span class="ann-acts">${a.acks?.[e.id] ? `<span class="chip c-ok">Read on ${fmtDate(a.acks[e.id])}</span>` : `<button class="btn btn-primary btn-sm" disabled title="Employees tap this on their own account">I have read this</button>`}</span></div>` : "</div>")).join("")}</div>`
    : `<section class="card"><div class="empty-state"><span class="es-ic">${icon("mega", 22)}</span><p>No announcements for ${esc(e.first)} right now.</p></div></section>`);
};
async function annPrint(a) {
  const c = annCat(a.cat);
  return saveLetter(`Announcement-${(a.from || todayISO())}.html`, a.title, `<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555">${esc(c[1])} · ${fmtDate(a.from || a.at)}</p>
    <h2 style="font-size:26px;margin:4px 0 18px">${esc(a.title)}</h2><div style="white-space:pre-line;font-size:16px">${esc(a.body)}</div>
    <p style="margin-top:24px;font-size:14px;color:#555">For: ${esc(annAudience(a))}${a.until ? ` · Until ${fmtDate(a.until)}` : ""}</p><p style="margin-top:48px">${signer()}</p>`);
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ann-show],[data-ann-copy],[data-ann-print],[data-ann-pin],[data-ann-edit],[data-ann-del],[data-ann-rm]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.annShow) { S.annShow = d.annShow; render(); return; }
  if (d.annRm) { S.annRm = { ...(S.annRm || {}), [d.annRm]: true }; t.closest(".field").querySelector("div").innerHTML = '<span class="t-muted" style="font-size:13px">Will be removed when you save.</span>'; return; }
  const a = S.anns.get(d.annCopy || d.annPrint || d.annPin || d.annEdit || d.annDel); if (!a) return;
  if (d.annCopy) { const ok = await (typeof copyText === "function" ? copyText(annText(a)) : navigator.clipboard.writeText(annText(a)).then(() => true, () => false)); toast(ok ? "Copied. Paste it in Viber, Messenger, Facebook or email." : "Couldn't copy here."); return; }
  if (d.annPrint) return annPrint(a);
  if (!S.canEdit) return;
  if (d.annEdit) { S.annRm = null; return go("annForm", { id: a.id }); }
  try {
    if (d.annPin) { await put("announcements", { ...a, pinned: !a.pinned }); render(); return; }
    if (d.annDel) { if (!await askConfirm(`Delete "${a.title}"?`)) return; await drop("announcements", a.id); for (const x of [a.img, a.file]) if (x?.id) { try { await S.assets.delete(x.id); } catch {} } logActivity(`Deleted the announcement ${a.title}`); toast("Announcement deleted."); render(); }
  } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("input", (ev) => { if (ev.target.id === "ann-q") { S.annQ = ev.target.value; const p0 = ev.target.selectionStart; render(); const i = $("#ann-q"); if (i) { i.focus(); try { i.setSelectionRange(p0, p0); } catch {} } } });
document.addEventListener("change", (ev) => {
  if (ev.target.id === "ann-cat") { S.annCat = ev.target.value; render(); return; }
  if (ev.target.id === "an-img" || ev.target.id === "an-file") { const f = ev.target.files?.[0]; const n = $(`#${ev.target.id}-name`); if (n) n.textContent = f ? `Ready to upload: ${f.name}` : ""; }
});
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "ann-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const err = $("#an-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const title = $("#an-title").value.trim(); const body = $("#an-body").value.trim(); const from = $("#an-from").value || todayISO(); const until = $("#an-until").value || null;
  if (!title) return fail("Enter a title."); if (!body) return fail("Write the message."); if (until && until < from) return fail("The end date is before the start date.");
  const prev = S.view.id ? S.anns.get(S.view.id) : null;
  const a = { ...(prev || { id: uid(), at: todayISO(), by: S.myId || null, acks: {} }), title, body, from, until, cat: $("#an-cat").value, aud: $("#an-aud").value, pinned: $("#an-pin").checked, ack: $("#an-ack").checked };
  const btn = ev.target.querySelector("button.btn-primary"); btn.disabled = true;
  try {
    const old = [];
    for (const [k, id, re, max] of [["img", "an-img", /^image\/(jpeg|png|webp|gif)$/, 20], ["file", "an-file", /^application\/pdf$/, 20]]) {
      const f = $(`#${id}`)?.files?.[0];
      if (f) { if (!re.test(f.type)) { btn.disabled = false; return fail(k === "img" ? "Use a JPG, PNG, WebP or GIF picture." : "Attach a PDF file."); } if (f.size > max * 1048576) { btn.disabled = false; return fail(`That file is over ${max} MB.`); }
        const up = await S.assets.upload(f); if (a[k]) old.push(a[k].id); a[k] = { id: up.id, name: f.name.slice(0, 120) }; }
      else if (S.annRm?.[k] && a[k]) { old.push(a[k].id); delete a[k]; }
    }
    await put("announcements", a); for (const id of old) { try { await S.assets.delete(id); } catch {} } S.annRm = null;
    logActivity(`${prev ? "Updated" : "Posted"} the announcement ${title}`); toast(prev ? "Announcement saved." : from > todayISO() ? `Scheduled for ${fmtDate(from)}.` : "Announcement posted."); S.annShow = from > todayISO() ? "scheduled" : "live"; go("ann");
  } catch { btn.disabled = false; fail("Couldn't save. Try again."); }
}, true);
