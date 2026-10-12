/* ---------- ID printing: front (logo, photo, complete name, position, ID no., signature) and back (address, government numbers, emergency contact, where to return it); and HR reminders for probation, regularization, APE, medical and 201 updates ---------- */
Object.assign(ICON, { idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2.2"/><path d="M5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h5M14 14h4"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' });
Object.assign(S, { idCards: new Map(), remDone: new Map(), idF: { q: "", unit: "", tab: "ALL", pick: [], show: null, layout: "pair" }, remF: { tab: "DUE", kind: "", q: "" }, remToasted: false });
{
  /* ID Printing is its own module in the menu, right after Employees. */
  const gi = NAV.findIndex(([n]) => n === "Employees");
  NAV.splice(gi >= 0 ? gi + 1 : 2, 0, ["ID Printing", [["idprint", "Print IDs", "idcard"], ["idmiss", "Missing details", "alert"], ["idhist", "Print history", "log"], ["idset", "Card design", "sliders"]]]);
  MOD_ICON["ID Printing"] = "idcard";
  if (!PERM_MODS.includes("ID Printing")) PERM_MODS.splice(PERM_MODS.indexOf("Employees") + 1 || 1, 0, "ID Printing");
  for (const k of Object.keys(ROLES)) if (ROLES[k].mods !== PERM_MODS && ROLES[k].mods.includes("Employees") && !ROLES[k].mods.includes("ID Printing")) ROLES[k].mods.push("ID Printing");
  Object.assign(SECTION_OF, { idmiss: "idmiss", idhist: "idhist", idset: "idset" });
  const ov = NAV.find(([n]) => n === "Overview"); if (ov) { const i = ov[1].findIndex(([v]) => v === "askhr"); ov[1].splice(i >= 0 ? i + 1 : 1, 0, ["reminders", "Reminders", "bell"]); }
  Object.assign(SECTION_OF, { idprint: "idprint", reminders: "reminders" });
}
{ const b = bootIO; bootIO = (db) => { b(db);
  for (const [col, key] of [["idcards", "idCards"], ["remind", "remDone"]])
    db.collection(col).limit(5000).onSnapshot((snap) => { S[key] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }

const completeName = (e) => [e.first, e.middle, e.last].filter(Boolean).join(" ") + (e.suffix ? ` ${e.suffix}` : "");
const idInfo = (e) => S.idCards.get(e.id) || null;
const idLast = (e) => { const l = idInfo(e)?.prints || []; return l[l.length - 1] || null; };
const govNo = (e) => [["TIN", e.tin], ["SSS", e.sss], ["PhilHealth", e.philhealth], ["Pag-IBIG", e.pagibig || e.hdmf]];
/* What an ID card still needs from the 201 file. */
const idMissing = (e) => [!e.photo && "Photo", !e.sig && "Signature", !e.address && "Address", !(e.emergencyName && e.emergencyPhone) && "Emergency contact", govNo(e).some(([, v]) => !v) && "Government numbers"].filter(Boolean);
const idSet = () => { const s = SET(); return { who: s.idRetWho || "HR Department", addr: s.idRetAddr || "", phone: s.idRetPhone || "", years: Number(s.idYears) || 2, signer: s.idSigner || "", signerTitle: s.idSignerTitle || "HR Manager" }; };
const monYr = (iso) => (iso ? new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric" }).format(parseISO(iso)) : "");
/* QR code on the back of the card: plain text any phone camera can read, even offline. */
const idQrOn = () => SET().idQr !== false;
function idQrText(e, until) { const st = idSet(); return [`${S.org?.companyName || CO_DEFAULT}`, `Employee ID: ${e.no || ""}`, `Name: ${completeName(e)}`, `Position: ${pos(e.posId)?.title || "Employee"}`, until ? `Valid until: ${monYr(until)}` : "", st.phone ? `If found, call: ${st.phone}` : ""].filter(Boolean).join("\n"); }
function idQr(e, until, cls) {
  if (!idQrOn()) return ""; let q;
  try { qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]; q = qrcode(0, "M"); q.addData(idQrText(e, until), "Byte"); q.make(); } catch { return ""; }
  const n = q.getModuleCount(); let d = ""; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(e.no || "")}"><rect width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function idFront(e, until) {
  const nm = completeName(e); const sz = nm.length > 30 ? 7 : nm.length > 22 ? 8 : 9.5;
  return `<div class="idc idc-front"><div class="idc-top"><img src="${CO_LOGO}" alt=""><div class="idc-co">${esc(S.org?.companyName || CO_DEFAULT)}</div></div>
    ${e.photo ? `<img class="idc-photo" src="/_blob/${esc(e.photo)}" alt="Photo of ${esc(nm)}">` : `<div class="idc-photo idc-nophoto">${esc((e.first || "?")[0] + (e.last || "")[0])}</div>`}
    <div class="idc-name" style="font-size:${sz}pt">${esc(nm)}</div><div class="idc-pos">${esc(pos(e.posId)?.title || "Employee")}</div>
    <div class="idc-no">ID No. <b>${esc(e.no || "")}</b></div>
    <div class="idc-sig">${e.sig ? `<img src="/_blob/${esc(e.sig)}" alt="Signature of ${esc(nm)}">` : ""}</div><div class="idc-sigl">Signature</div>
    <div class="idc-foot">${until ? `Valid until ${esc(monYr(until))}` : esc(unitName(e))}</div></div>`;
}
function idBack(e, until) {
  const st = idSet(); const blood = typeof mdProf === "function" ? mdProf(e).blood : "";
  return `<div class="idc idc-back"><div class="idc-sec"><h4>Address</h4><p>${esc(e.address || "—")}</p></div>
    <div class="idc-sec"><h4>Government numbers</h4><dl class="idc-gov">${govNo(e).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v || "—")}</dd>`).join("")}${blood ? `<dt>Blood type</dt><dd>${esc(blood)}</dd>` : ""}</dl></div>
    <div class="idc-sec idc-ice"><h4>In case of emergency, contact</h4><p><b>${esc(e.emergencyName || "—")}</b>${e.emergencyRelation ? ` (${esc(e.emergencyRelation)})` : ""}<br>${esc(e.emergencyPhone || "")}</p></div>
    <div class="idc-sec idc-ret"><h4>If found, please return to</h4><p><b>${esc(S.org?.companyName || CO_DEFAULT)}</b>, ${esc(st.who)}${st.addr ? `<br>${esc(st.addr)}` : ""}${st.phone ? `<br>or call <b>${esc(st.phone)}</b>` : ""}</p></div>
    <div class="idc-authrow">${idQr(e, until, "idc-qr")}<div class="idc-auth"><span>${esc(st.signer || " ")}</span><small>${esc(st.signerTitle)}</small></div></div>
    <div class="idc-foot2">This card is company property and not transferable.${until ? ` Valid until ${esc(monYr(until))}.` : ""}</div></div>`;
}

/* Company template (default): Glenn's GPPMC card, with each employee's details placed on it. */
const idStyle = () => SET().idStyle || "company";
function idFrontT(e) {
  const nm = completeName(e); const sz = nm.length > 30 ? 6.6 : nm.length > 22 ? 7.6 : 9;
  return `<div class="idc idt" style="background-image:url(${ID_TPL.front})">
    ${e.photo ? `<img class="idt-photo" src="/_blob/${esc(e.photo)}" alt="Photo of ${esc(nm)}">` : `<div class="idt-photo idc-nophoto">${esc((e.first || "?")[0] + (e.last || "")[0])}</div>`}
    <div class="idt-name" style="font-size:${sz}pt">${esc(nm)}</div><div class="idt-pos">${esc(pos(e.posId)?.title || "Employee")}</div><div class="idt-no">ID No. ${esc(e.no || "")}</div></div>`;
}
function idBackT(e, until) {
  const st = idSet(); const rows = [["TIN No", e.tin], ["SSS No", e.sss], ["PhilHealth", e.philhealth], ["Pag-IBIG", e.pagibig || e.hdmf], ["Joined Date", e.hire ? fmtDate(e.hire) : ""], ["Address", e.address]];
  return `<div class="idc idt" style="background-image:url(${ID_TPL.back})"><dl class="idt-rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>: ${esc(v || "")}</dd>`).join("")}</dl>
    <div class="idt-sig">${e.sig ? `<img src="/_blob/${esc(e.sig)}" alt="Signature of ${esc(completeName(e))}">` : ""}</div>
    <div class="idt-ice"><b>${esc(e.emergencyName || "")}</b>${e.emergencyRelation ? ` (${esc(e.emergencyRelation)})` : ""}<br>${esc(e.emergencyPhone || "")}
      ${st.phone || st.addr ? `<small>If found, please return to ${esc(st.who)}${st.addr ? `, ${esc(st.addr)}` : ""}${st.phone ? `, or call ${esc(st.phone)}` : ""}.</small>` : ""}</div>${idQr(e, until, "idt-qr")}</div>`;
}
{ const f = idFront, b = idBack; idFront = (e, u) => (idStyle() === "company" ? idFrontT(e, u) : f(e, u)); idBack = (e, u) => (idStyle() === "company" ? idBackT(e, u) : b(e, u)); }

function idSetForm(open) { const st = idSet(); const ed = S.canEdit;
  return `<details class="card idp-set"${open ? " open" : ""}><summary><b>Card design and return details</b> <span class="t-muted" style="font-size:13px">Template, return address, who to call, validity</span></summary>
      <form id="idp-set-form" class="stack" style="gap:10px;margin-top:12px"><div class="form-grid">
        <div class="field"><label for="ids-who">Return to (office or person)</label><input class="input" id="ids-who" value="${esc(st.who)}" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="ids-phone">Number to call when found</label><input class="input" id="ids-phone" type="tel" value="${esc(st.phone)}" placeholder="e.g. (02) 8123 4567 or 0917 123 4567" ${ed ? "" : "disabled"}></div>
        <div class="field" style="grid-column:1/-1"><label for="ids-addr">Return address</label><input class="input" id="ids-addr" value="${esc(st.addr)}" placeholder="Office address" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="ids-signer">Authorized signatory</label><input class="input" id="ids-signer" value="${esc(st.signer)}" placeholder="Name of the HR Manager" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="ids-title">Signatory's title</label><input class="input" id="ids-title" value="${esc(st.signerTitle)}" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="ids-style">Card design</label><select class="input" id="ids-style" ${ed ? "" : "disabled"}>${opts([["company", "Company template (GPPMC)"], ["modern", "Modern navy and gold"]], idStyle())}</select></div><div class="field"><label for="ids-qr">QR code on the back</label><select class="input" id="ids-qr" ${ed ? "" : "disabled"}>${opts([["1", "Show (name, ID no., position, validity, number to call)"], ["0", "Hide"]], idQrOn() ? "1" : "0")}</select></div><div class="field"><label for="ids-years">Card is valid for</label><select class="input" id="ids-years" ${ed ? "" : "disabled"}>${opts([1, 2, 3, 5].map((y) => [String(y), `${y} year${y > 1 ? "s" : ""}`]), String(st.years))}</select></div></div>
        ${ed ? '<div><button class="btn btn-primary">Save</button></div>' : ""}</form></details>`; }
VIEWS.idprint = () => {
  const F = S.idF; if (S.view.name === "idprint" && !S.view._idt) { S.view._idt = 1; if (S.idTabFrom !== "idprint") F.tab = "ALL"; } S.idTabFrom = S.view.name; const q = F.q.toLowerCase(); const ed = S.canEdit; const all = active().sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const units = [...new Set(all.map(unitName))].sort();
  const list = all.filter((e) => (!F.unit || unitName(e) === F.unit) && (!q || `${completeName(e)} ${e.no} ${pos(e.posId)?.title || ""}`.toLowerCase().includes(q))
    && (F.tab === "ALL" || (F.tab === "READY" && !idMissing(e).length && !idLast(e)) || (F.tab === "MISS" && idMissing(e).length) || (F.tab === "DONE" && idLast(e))));
  F.pick = F.pick.filter((id) => S.emps.has(id)); const picked = new Set(F.pick);
  const fkey = `${F.q}|${F.unit}|${F.tab}`; if (F.fkey !== fkey) { F.fkey = fkey; F.page = 1; } F.page = Math.max(1, Math.min(F.page || 1, Math.ceil(list.length / 25) || 1));
  const show = S.emps.get(F.show) || S.emps.get(F.pick[0]) || list[0]; const st = idSet(); const until = addDays(addMonths(todayISO(), st.years * 12), -1);
  const ready = all.filter((e) => !idMissing(e).length).length; const printed = all.filter((e) => idLast(e)).length;
  return head("Employee ID cards", S.view.name === "idmiss" ? "Missing details" : S.view.name === "idhist" ? "Print history" : "Print IDs", `${F.pick.length ? `<button class="btn btn-ghost" style="background:#fff" data-idp-clear>Clear selection</button>` : ""}<button class="btn btn-gold" data-idp-print ${F.pick.length ? "" : "disabled"}>${icon("idcard")}Print ${F.pick.length || ""} ID${F.pick.length === 1 ? "" : "s"}</button>`) + `
    <section class="stats">${dxTile("Employees", all.length, "active")}${dxTile("Ready to print", ready, "photo, signature and details complete", "t-ok")}${dxTile("Missing details", all.length - ready, "see the Missing details tab", all.length - ready ? "t-warn" : "t-muted")}${dxTile("IDs printed", printed, "at least once")}</section>
    ${!idSet().addr || !idSet().phone ? `<div class="notice"><span>${icon("alert", 16)} Add the return address and phone number for the back of the card in <button class="link" data-go="idset">Card design</button>.</span></div>` : ""}
    <div class="idp-grid"><section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <input class="input" type="search" id="idp-q" value="${esc(F.q)}" placeholder="Search name, ID no. or position" aria-label="Search employees" style="flex:1;min-width:180px">
        <select class="input" id="idp-unit" style="width:auto" aria-label="Department or project">${opts(units.map((u) => [u, u]), F.unit, "All departments and projects")}</select></div>
      ${stTabs(F.tab, "idp-tab", [["ALL", "All"], ["READY", "Ready, never printed"], ["MISS", "Missing details"], ["DONE", "Printed"]])}
      <div class="table-wrap" style="margin-top:10px"><table class="idp-table"><thead><tr><th><input type="checkbox" id="idp-all" aria-label="Select all shown" ${list.length && list.slice((F.page - 1) * 25, F.page * 25).every((e) => picked.has(e.id)) ? "checked" : ""}></th><th>Employee</th><th>Card details</th><th>Last printed</th></tr></thead><tbody>
      ${list.slice((F.page - 1) * 25, F.page * 25).map((e) => { const m = idMissing(e); const l = idLast(e);
        return `<tr class="${show && show.id === e.id ? "idp-cur" : ""}"><td><input type="checkbox" data-idp-pick="${e.id}" aria-label="Select ${esc(fullName(e))}" ${picked.has(e.id) ? "checked" : ""}></td>
          <td><button class="idp-who" data-idp-show="${e.id}">${avatar(e, 32)}<span><b>${esc(completeName(e))}</b><small>${esc(e.no || "")} · ${esc(pos(e.posId)?.title || "")}</small></span></button></td>
          <td>${m.length ? m.map((x) => `<span class="chip c-warn">${x}</span>`).join(" ") : '<span class="chip c-ok">Complete</span>'}</td>
          <td style="white-space:nowrap">${l ? `${fmtDate(l.d)}${l.until && l.until < todayISO() ? ' <span class="chip c-bad">Expired</span>' : l.until && l.until <= addDays(todayISO(), 30) ? ' <span class="chip c-warn">Expires soon</span>' : ""}` : '<span class="t-muted">Never</span>'}</td></tr>`; }).join("") || '<tr><td colspan="4" class="empty">No one matches.</td></tr>'}
      </tbody></table></div>${pagerN(F, list.length, "idp-pg")}</section>
    <section class="card idp-prev">${show ? `<div class="card-head"><h2>${esc(fullName(show))}</h2><button class="btn btn-ghost btn-sm" data-emp="${show.id}">Open 201 file</button></div>
      <div class="idp-cards"><div><small class="t-muted">Front</small>${idFront(show, until)}</div><div><small class="t-muted">Back</small>${idBack(show, until)}</div></div>
      ${idMissing(show).length ? `<p class="t-warn" style="font-size:14px;margin:10px 0 0">Missing: ${idMissing(show).join(", ")}. ${idMissing(show).some((x) => x !== "Photo" && x !== "Signature") ? "Add them in the 201 file." : ""}</p>` : ""}
      ${ed && S.assets ? `<div class="idp-tools"><div><b>Photo</b><label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon("camera", 16)}${show.photo ? "Change photo" : "Add photo"}<input type="file" id="idp-photo" accept="image/*" hidden></label><small class="t-muted">A clear face photo on a plain background. It is cropped square.</small></div>
        <div><b>Signature</b><canvas id="idp-pad" width="600" height="200" aria-label="Signature pad: sign with a finger, pen or mouse"></canvas>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-idp-sig-save="${show.id}">Save signature</button><button class="btn btn-ghost btn-sm" data-idp-sig-clear>Clear</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon("upload", 16)}Upload a photo of the signature<input type="file" id="idp-sig-file" accept="image/*" hidden></label>${show.sig ? `<button class="btn btn-ghost btn-sm" data-idp-sig-del="${show.id}">Remove signature</button>` : ""}</div>
        <small class="t-muted">Let the employee sign in the box above on a phone or tablet, or upload a photo of their signature in dark ink on white paper.</small></div></div>` : ""}
      <div class="idp-lay"><b>Print layout</b><label><input type="radio" name="idp-lay" value="pair" ${F.layout === "pair" ? "checked" : ""}> Front and back side by side, to cut, fold and laminate (4 per page)</label>
        <label><input type="radio" name="idp-lay" value="duplex" ${F.layout === "duplex" ? "checked" : ""}> Fronts on one page, backs on the next, for two-sided printing (9 per page)</label>
        <small class="t-muted">Print at 100% (actual size) on A4. Each card is 54 × 85.6 mm, the standard ID size. Turn on "Background graphics" in the print window.</small></div>`
      : '<p class="t-muted">Pick an employee to see their ID.</p>'}</section></div>`;
};

alias("idmiss", { before: () => (S.idF.tab = "MISS"), view: () => VIEWS.idprint() });
alias("idhist", { before: () => (S.idF.tab = "DONE"), view: () => VIEWS.idprint() });
VIEWS.idset = () => { const e = S.emps.get(S.idF.show) || active().sort((a, b) => fullName(a).localeCompare(fullName(b)))[0]; const st = idSet(); const until = addDays(addMonths(todayISO(), st.years * 12), -1);
  return head("Template, return details and validity", "Card design", `<button class="btn btn-gold" data-go="idprint">${icon("idcard")}Print IDs</button>`) + idSetForm(true)
    + (e ? `<section class="card"><div class="card-head"><h2>Preview</h2><span class="t-muted" style="font-size:13px">${esc(fullName(e))}</span></div><div class="idp-cards"><div><small class="t-muted">Front</small>${idFront(e, until)}</div><div><small class="t-muted">Back</small>${idBack(e, until)}</div></div></section>` : ""); };

/* ---------- printing: a sheet of cards at actual size, then a record of who got an ID and until when ---------- */
async function printSheet(html, landscape) {
  document.getElementById("idp-sheet")?.remove(); document.getElementById("idp-page")?.remove();
  const s = document.createElement("div"); s.id = "idp-sheet"; s.innerHTML = html; document.body.appendChild(s);
  const pg = document.createElement("style"); pg.id = "idp-page"; pg.textContent = `@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:8mm}`; document.head.appendChild(pg);
  await Promise.all([...s.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 4000); }))));
  document.documentElement.classList.add("idp-printing");
  const done = () => { document.documentElement.classList.remove("idp-printing"); s.remove(); pg.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); window.print(); setTimeout(() => { if (document.getElementById("idp-sheet")) done(); }, 60000);
}
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function printIds() {
  const es = S.idF.pick.map((id) => S.emps.get(id)).filter(Boolean); if (!es.length) return;
  const st = idSet(); const today = todayISO(); const until = addDays(addMonths(today, st.years * 12), -1);
  let html;
  if (S.idF.layout === "duplex") html = chunk(es, 9).map((pg) => { const rows = chunk(pg, 3);
      return `<div class="idp-page idp-duplex">${pg.map((e) => idFront(e, until)).join("")}</div><div class="idp-page idp-duplex">${rows.map((r) => [...r, ...Array(3 - r.length).fill(null)].reverse().map((e) => (e ? idBack(e, until) : '<div class="idc idc-blank"></div>')).join("")).join("")}</div>`; }).join("");
  else html = chunk(es, 4).map((pg) => `<div class="idp-page idp-pairs">${pg.map((e) => `<div class="idp-pair">${idFront(e, until)}${idBack(e, until)}</div>`).join("")}</div>`).join("");
  await printSheet(html, S.idF.layout !== "duplex");
  if (!S.realEdit || !S.db) return;
  for (const e of es) { const prev = idInfo(e); const prints = [...(prev?.prints || []), { d: today, until, by: S.myId || null }].slice(-20);
    try { await S.db.doc(`idcards/${e.id}`).set({ empId: e.id, prints }); S.idCards.set(e.id, { id: e.id, empId: e.id, prints }); } catch {} }
  logActivity(`Printed ID cards for ${es.length === 1 ? fullName(es[0]) : `${es.length} employees`}`); S.ver++; render();
}

/* ---------- signature pad and uploads ---------- */
function padInit() {
  const c = document.getElementById("idp-pad"); if (!c || c.dataset.on) return; c.dataset.on = "1"; const x = c.getContext("2d"); x.lineWidth = 4; x.lineCap = x.lineJoin = "round"; x.strokeStyle = "#0D1729";
  let down = false, last = null; const pt = (ev) => { const r = c.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * c.width, ((ev.clientY - r.top) / r.height) * c.height]; };
  c.addEventListener("pointerdown", (ev) => { down = true; last = pt(ev); c.setPointerCapture(ev.pointerId); c.dataset.inked = "1"; ev.preventDefault(); });
  c.addEventListener("pointermove", (ev) => { if (!down) return; const p = pt(ev); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; });
  const up = () => { down = false; }; c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
}
new MutationObserver(() => padInit()).observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
/* A photo of a signature on paper: fit it in, then make the paper see-through so only the ink prints. */
async function sigFromImage(file) {
  const img = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = 600; c.height = 200; const x = c.getContext("2d");
  const k = Math.min(c.width / img.width, c.height / img.height); const w = img.width * k, h = img.height * k; x.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; if (l > 165) p[i + 3] = 0; else { p[i] = 13; p[i + 1] = 23; p[i + 2] = 41; p[i + 3] = Math.min(255, (165 - l) * 3); } }
  x.putImageData(d, 0, 0); return c;
}
async function saveSig(e, canvas) {
  if (!S.assets) return toast("Uploads aren't available here.");
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  try { const up = await S.assets.upload(blob, { type: "image/png" }); const old = e.sig; const n = { ...e, sig: up.id }; await saveEmp(n); S.emps.set(n.id, n); if (old) { try { await S.assets.delete(old); } catch {} }
    logActivity(`Saved the signature of ${fullName(e)}`); toast("Signature saved."); S.ver++; render(); } catch { toast("Couldn't save the signature. Try again."); }
}
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "idp-set-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return; const v = (id) => $(id).value.trim();
  await saveSettings({ idRetWho: v("#ids-who"), idRetPhone: v("#ids-phone"), idRetAddr: v("#ids-addr"), idSigner: v("#ids-signer"), idSignerTitle: v("#ids-title"), idYears: Number($("#ids-years").value) || 2, idStyle: $("#ids-style").value, idQr: $("#ids-qr").value !== "0" }, "Updated the ID card details");
}, true);
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-idp-show],[data-idp-tab],[data-idp-clear],[data-idp-print],[data-idp-sig-save],[data-idp-sig-clear],[data-idp-sig-del]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset; const F = S.idF;
  if (d.idpShow) { F.show = d.idpShow; render(); return; }
  if (d.idpTab) { F.tab = d.idpTab; render(); return; }
  if ("idpClear" in d) { F.pick = []; render(); return; }
  if ("idpPrint" in d) return printIds();
  if ("idpSigClear" in d) { const c = $("#idp-pad"); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete c.dataset.inked; return; }
  if (!S.realEdit) return;
  if (d.idpSigSave) { const c = $("#idp-pad"); if (!c?.dataset.inked) return toast("Sign in the box first."); const e = S.emps.get(d.idpSigSave); if (e) await saveSig(e, c); return; }
  if (d.idpSigDel) { const e = S.emps.get(d.idpSigDel); if (!e) return; const old = e.sig; const n = { ...e, sig: null }; await saveEmp(n); S.emps.set(n.id, n); if (old) { try { await S.assets?.delete(old); } catch {} } logActivity(`Removed the signature of ${fullName(e)}`); S.ver++; render(); }
}, true);
document.addEventListener("change", async (ev) => {
  const t = ev.target; const F = S.idF;
  if (t.matches?.("[data-idp-pick]")) { const id = t.dataset.idpPick; F.pick = t.checked ? [...new Set([...F.pick, id])] : F.pick.filter((x) => x !== id); if (t.checked) F.show = id; render(); return; }
  if (t.id === "idp-all") { const ids = [...document.querySelectorAll("[data-idp-pick]")].map((x) => x.dataset.idpPick); F.pick = t.checked ? [...new Set([...F.pick, ...ids])] : F.pick.filter((x) => !ids.includes(x)); render(); return; }
  if (t.id === "idp-unit") { F.unit = t.value; render(); return; }
  if (t.name === "idp-lay") { F.layout = t.value; return; }
  const e = S.emps.get(F.show) || S.emps.get(F.pick[0]); const f = t.files?.[0];
  if ((t.id === "idp-photo" || t.id === "idp-sig-file") && f && e && S.realEdit && S.assets) {
    if (t.id === "idp-sig-file") { try { await saveSig(e, await sigFromImage(f)); } catch { toast("Couldn't read that picture."); } return; }
    try { const blob = await shrinkPhoto(f); const up = await S.assets.upload(blob, { type: "image/jpeg" }); const old = e.photo; const n = { ...e, photo: up.id }; await saveEmp(n); S.emps.set(n.id, n); if (old) { try { await S.assets.delete(old); } catch {} }
      logActivity(`Updated the photo of ${fullName(e)}`); toast("Photo saved."); S.ver++; render(); } catch { toast("Couldn't save the photo. Try again."); }
  }
});
document.addEventListener("input", (ev) => { if (ev.target.id !== "idp-q") return; S.idF.q = ev.target.value; clearTimeout(S.idQT); S.idQT = setTimeout(() => { const pos0 = ev.target.selectionStart; render(); const i = $("#idp-q"); if (i) { i.focus(); try { i.setSelectionRange(pos0, pos0); } catch {} } }, 250); });

/* ---------- reminders ---------- */
const ORD = (n) => ({ 1: "1st", 2: "2nd", 3: "3rd" })[n] || `${n}th`;
const REM_KIND = { EVAL: ["Probationary evaluation", "star"], REGNOTICE: ["Regularization notice", "file"], APE: ["Annual physical exam", "shield"], MED: ["Medical records update", "shield"], INFO: ["Yearly information update", "people"], MISSING: ["Missing 201 details", "alert"], CONTRACT: ["Contract ending", "file"], IDEXP: ["ID card renewal", "idcard"] };
const remLead = () => Number(SET().remLead) || 7;
const remKey = (k) => k.replace(/[^A-Za-z0-9_-]/g, "_");
let remCache = { v: -1, list: [] };
function remList() {
  if (remCache.v === S.ver) return remCache.list;
  const today = todayISO(); const lead = remLead(); const out = [];
  const add = (r) => { const dn = S.remDone.get(remKey(r.key)); out.push({ ...r, from: r.from || addDays(r.due, -lead), done: r.auto || dn?.done || null, by: dn?.by || null, sent: dn?.sent || [] }); };
  for (const e of active()) {
    const nm = fullName(e); const ps = pos(e.posId)?.title || "employee";
    if (e.status === "PROBATIONARY" && e.hire) {
      const revs = reviewsOf(e.id).filter((r) => r.type === "REGULARIZATION").sort((a, b) => (a.at || "").localeCompare(b.at || ""));
      const ev = S.emps.get([...revs].reverse().find((r) => r.reviewerId)?.reviewerId) || S.emps.get(e.supervisorId) || null; const evn = ev ? fullName(ev) : "the evaluator";
      const stages = [2, 4, 5].map((m) => ({ m, due: addMonths(e.hire, m), by: null }));
      for (const r of revs.filter((r) => r.status === "DONE")) { const d = (r.at || "").slice(0, 10); const s = [...stages].reverse().find((x) => !x.by && d >= addDays(x.due, -21)); if (s) s.by = r; }
      for (const s of stages) { if (s.due > addDays(today, lead) || s.due < addDays(e.hire, 0)) continue;
        add({ key: `EVAL${s.m}:${e.id}`, kind: "EVAL", e, ev, due: s.due, title: `${ORD(s.m)} month probationary evaluation`, to: ["HR", "EMP", "EVAL"], auto: s.by ? s.by.at : null, act: "eval",
          msg: { HR: `${nm}'s ${ORD(s.m)} month probationary evaluation is due on ${fmtDate(s.due)}. Evaluator: ${ev ? evn : "not set yet (add a supervisor in the 201 file)"}.`,
            EVAL: `Please evaluate ${nm} (${ps}) for the ${ORD(s.m)} month probationary review on or before ${fmtDate(s.due)}, and send the form to HR.`,
            EMP: `Your ${ORD(s.m)} month probationary evaluation${ev ? ` with ${evn}` : ""} is due on ${fmtDate(s.due)}.` } }); }
    }
    if (e.hire && (e.status === "PROBATIONARY" || (e.status === "REGULAR" && (e.history || []).some((h) => h.kind === "Regularized")))) { const rd = regDue(e);
      if (rd <= addDays(today, 30) && rd >= addDays(today, -30)) { const rv = reviewsOf(e.id).find((r) => r.type === "REGULARIZATION" && r.status === "DONE"); const end = rv?.rec === "END";
        add({ key: `REG:${e.id}`, kind: "REGNOTICE", e, ev: S.emps.get(e.supervisorId) || null, due: rd, from: addDays(rd, -30), title: end ? "Notice: probation not passed" : "Regularization notice", to: ["HR", "EMP"], act: "notice",
          msg: { HR: end ? `Serve ${nm} the written notice that probation ends without regularization, before ${fmtDate(rd)}.` : `Give ${nm} the regularization notice. Probation ends on ${fmtDate(rd)}${e.status === "REGULAR" ? "; already regularized in the system" : ""}.`,
            EMP: end ? `Please see HR about the result of your probationary evaluation before ${fmtDate(rd)}.` : `Your probation ends on ${fmtDate(rd)}. HR will give you your regularization notice.` } }); } }
    const noApe = typeof lastApe === "function" && !lastApe(e); const noProf = typeof mdProf === "function" && !mdProf(e).updated;
    if (typeof apeDue === "function" && !noApe) { const d = apeDue(e); if (d <= addDays(today, 30))
      add({ key: `APE:${e.id}:${d}`, kind: "APE", e, due: d, from: addDays(d, -30), title: "Annual physical exam (APE)", to: ["HR", "EMP"], act: "med",
        msg: { HR: `${nm}'s annual physical exam is due on ${fmtDate(d)}.`, EMP: `Your annual physical exam (APE) is due on ${fmtDate(d)}. HR will tell you the clinic and schedule. Bring the results to HR.` } }); }
    if (typeof mdProf === "function" && !noProf) { const base = mdProf(e).updated; const d = base ? addDays(base, 365) : null; if (d && d <= addDays(today, 14))
      add({ key: `MED:${e.id}:${d}`, kind: "MED", e, due: d, title: "Update medical records", to: ["HR", "EMP"], act: "med",
        msg: { HR: `${nm}'s health profile (blood type, allergies, conditions, maintenance medicines) was last updated ${mdProf(e).updated ? fmtDate(mdProf(e).updated) : "never"}. Ask them to confirm it.`,
          EMP: "Please update your medical records with HR: blood type, allergies, existing conditions and maintenance medicines." } }); }
    if (e.hire) { const y = today.slice(0, 4); const ann = `${y}${e.hire.slice(4)}`; if (ann > e.hire.slice(0, 4) + "-12-31" && today >= addDays(ann, -lead) && today <= addDays(ann, 30))
      add({ key: `INFO:${e.id}:${y}`, kind: "INFO", e, due: ann, title: "Yearly update of employee information", to: ["HR", "EMP"], act: "info",
        msg: { HR: `Yearly 201 check for ${y}: ask ${e.first} to confirm their details.`,
          EMP: "Time for your yearly information update. Please check your address, mobile number, civil status, dependents, emergency contact and government numbers, and tell HR of any change." } }); }
    const miss = [!e.photo && "photo", !e.birth && "birthday", !e.address && "address", !(e.emergencyName && e.emergencyPhone) && "emergency contact", !e.tin && "TIN", !e.sss && "SSS", !e.philhealth && "PhilHealth", !(e.pagibig || e.hdmf) && "Pag-IBIG", noApe && "medical exam record", noProf && "health profile"].filter(Boolean);
    if (miss.length) add({ key: `MISS:${e.id}:${miss.join(",")}`, kind: "MISSING", e, due: today, title: "Missing 201 details", to: ["HR", "EMP"], act: "info", missing: miss,
      msg: { HR: `${nm}'s 201 file is missing: ${miss.join(", ")}.`, EMP: `HR still needs your ${miss.join(", ")}. Please send them through Ask HR.` } });
    if (typeof ctrOf === "function" && e.status !== "PROBATIONARY") { const c = ctrOf(e); if (c.end && c.left != null && c.left <= 30 && c.left >= -7) { const sup = S.emps.get(e.supervisorId) || null;
      add({ key: `CTR:${e.id}:${c.end}`, kind: "CONTRACT", e, ev: sup, due: c.end, from: addDays(c.end, -30), title: `${STATUS[e.status]?.[0] || ""} contract ends`, to: ["HR", "EVAL"], act: "contract",
        msg: { HR: `${nm}'s ${(STATUS[e.status]?.[0] || "").toLowerCase()} contract ends on ${fmtDate(c.end)}. Renew, extend or end it with a notice.`, EVAL: `${nm}'s contract ends on ${fmtDate(c.end)}. Tell HR whether to renew or end it.` } }); } }
    const l = idLast(e); if (l?.until && l.until <= addDays(today, 30))
      add({ key: `ID:${e.id}:${l.until}`, kind: "IDEXP", e, due: l.until, from: addDays(l.until, -30), title: "ID card renewal", to: ["HR", "EMP"], act: "id",
        msg: { HR: `${nm}'s company ID expires on ${fmtDate(l.until)}. Print a new one.`, EMP: `Your company ID expires on ${fmtDate(l.until)}. HR will print you a new one; tell HR if your photo or details need updating.` } });
  }
  out.sort((a, b) => a.due.localeCompare(b.due)); remCache = { v: S.ver, list: out }; return out;
}
const remOpen = () => remList().filter((r) => !r.done && r.kind !== "MISSING");
const REM_ROUTINE = ["MISSING", "INFO", "MED"];
const remDueNow = () => remOpen().filter((r) => r.from <= todayISO());
const remUrgent = () => remDueNow().filter((r) => !REM_ROUTINE.includes(r.kind));
const remWho = (r) => r.to.map((k) => (k === "HR" ? "HR" : k === "EMP" ? "Employee" : r.ev ? `Evaluator: ${fullName(r.ev)}` : "Evaluator (not set)"));
const remState = (r) => r.done ? ["Done", "c-ok"] : r.due < todayISO() ? ["Overdue", "c-bad"] : r.due === todayISO() ? ["Due today", "c-warn"] : [`In ${daysBetween(todayISO(), r.due)} days`, "c-blue"];
function remMail(r) {
  const to = [r.to.includes("EMP") && r.e.email, r.to.includes("EVAL") && r.ev?.email].filter(Boolean); const cc = SET().remHrEmail || "";
  const lines = [r.to.includes("EVAL") && r.ev ? `To ${fullName(r.ev)}: ${r.msg.EVAL}` : "", r.to.includes("EMP") ? `To ${fullName(r.e)}: ${r.msg.EMP}` : "", !to.length ? r.msg.HR : ""].filter(Boolean);
  const body = `Good day,\n\n${lines.join("\n\n")}\n\nDue: ${fmtDate(r.due)}\n\nThank you,\n${SET().remSign || "HR Department"}\n${S.org?.companyName || CO_DEFAULT}`;
  return `mailto:${to.map(encodeURIComponent).join(",")}?${cc ? `cc=${encodeURIComponent(cc)}&` : ""}subject=${encodeURIComponent(`Reminder: ${r.title} – ${fullName(r.e)}`)}&body=${encodeURIComponent(body)}`;
}
function remSms(r) { const p = r.to.includes("EVAL") && r.ev?.mobile ? r.ev : r.e; const msg = p === r.ev ? r.msg.EVAL : r.msg.EMP;
  return p.mobile ? `sms:${String(p.mobile).replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`${S.org?.companyName || CO_DEFAULT} HR: ${msg}`)}` : ""; }

VIEWS.reminders = () => {
  const F = S.remF; const all = remList(); const q = F.q.toLowerCase(); const today = todayISO(); const lead = remLead(); const ed = S.canEdit;
  const open = all.filter((r) => !r.done); const due = open.filter((r) => r.kind !== "MISSING" && r.from <= today);
  const list = (F.tab === "DUE" ? due : F.tab === "SOON" ? open.filter((r) => r.kind !== "MISSING" && r.from > today) : F.tab === "MISS" ? open.filter((r) => r.kind === "MISSING") : all.filter((r) => r.done).reverse())
    .filter((r) => (!F.kind || r.kind === F.kind) && (!q || `${fullName(r.e)} ${r.e.no} ${r.title} ${r.ev ? fullName(r.ev) : ""}`.toLowerCase().includes(q)));
  const c = (k) => open.filter((r) => r.kind === k && r.due <= addDays(today, 30)).length;
  return head("Who needs to do what, and when", "Reminders", `<button class="btn btn-ghost" style="background:#fff" data-rem-copy>${icon("file")}Copy today's list</button>`) + `
    <section class="stats">${dxTile("Due now", due.length, "overdue or time to act", due.length ? "t-warn" : "t-ok")}${dxTile("Probation evaluations", c("EVAL"), "2nd, 4th and 5th month")}${dxTile("Regularization notices", c("REGNOTICE"), "probation ends within 30 days")}${dxTile("APE and medical", c("APE") + c("MED"), "due within 30 days")}</section>
    <div class="notice"><span>${icon("bell", 16)} Reminders show here, as a red count on the menu, and on each employee's and evaluator's phone dashboard. Use <b>Email</b> or <b>Text</b> to send one from your own email or phone; the app notes when it was sent.</span></div>
    <section class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${stTabs(F.tab, "rem-tab", [["DUE", `Due now (${due.length})`], ["SOON", "Coming up"], ["MISS", `Missing 201 details (${open.filter((r) => r.kind === "MISSING").length})`], ["DONE", "Done"]])}
      <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="rem-kind" style="width:auto" aria-label="Kind">${opts(Object.entries(REM_KIND).map(([k, v]) => [k, v[0]]), F.kind, "All kinds")}</select><input class="input" type="search" id="rem-q" value="${esc(F.q)}" placeholder="Search" aria-label="Search reminders" style="min-width:160px"></span></div>
      <div class="table-wrap"><table class="rem-table"><thead><tr><th>Reminder</th><th>Employee</th><th>Due</th><th>Notify</th><th>Message</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.slice(0, 300).map((r) => { const [sl, sc] = remState(r); const sms = remSms(r); const last = r.sent[r.sent.length - 1];
        return `<tr><td><span class="rem-k">${icon(REM_KIND[r.kind][1], 16)}<b>${esc(r.title)}</b></span></td><td>${empCell(r.e, `${r.e.no} · ${STATUS[r.e.status]?.[0] || ""}`)}</td>
          <td style="white-space:nowrap">${fmtDate(r.due)}<div><span class="chip ${sc}">${sl}</span></div></td>
          <td style="font-size:13px;white-space:nowrap">${remWho(r).map((w) => `<div>${esc(w)}</div>`).join("")}</td>
          <td style="min-width:240px;max-width:380px;font-size:14px">${esc(r.msg.HR)}${last ? `<div class="t-muted" style="font-size:12px">${last.how === "sms" ? "Texted" : "Emailed"} ${esc(fmtDate(last.d))}</div>` : ""}${r.done && !r.auto ? `<div class="t-muted" style="font-size:12px">Marked done ${esc(fmtDate(r.done))}${r.by ? ` by ${esc(empName(r.by))}` : ""}</div>` : r.auto ? '<div class="t-muted" style="font-size:12px">Done: the evaluation is completed</div>' : ""}</td>
          ${ed ? `<td class="num"><div class="rem-acts">${r.done ? (r.auto ? "" : `<button class="btn btn-ghost btn-sm" data-rem-undo="${esc(r.key)}">Undo</button>`) : `
            ${r.act === "eval" ? `<button class="btn btn-primary btn-sm" data-new-review="REGULARIZATION:${r.e.id}">Evaluate</button>` : r.act === "notice" ? `<button class="btn btn-primary btn-sm" data-rem-notice="${r.e.id}">Print notice</button>` : r.act === "med" ? `<button class="btn btn-primary btn-sm" data-rem-med="${r.e.id}">Medical history</button>` : r.act === "id" ? `<button class="btn btn-primary btn-sm" data-rem-id="${r.e.id}">Print ID</button>` : r.act === "contract" ? '<button class="btn btn-primary btn-sm" data-go="contracts">Contracts</button>' : r.act === "annual" ? `<button class="btn btn-primary btn-sm" data-new-review="ANNUAL:${r.e.id}">Evaluate</button>` : r.act === "train" ? '<button class="btn btn-primary btn-sm" data-go="training">Training</button>' : `<button class="btn btn-primary btn-sm" data-emp="${r.e.id}">201 file</button>`}
            <a class="btn btn-ghost btn-sm" href="${esc(remMail(r))}" data-rem-sent="${esc(r.key)}|mail" target="_blank" rel="noopener">${icon("mail", 14)}Email</a>${sms ? `<a class="btn btn-ghost btn-sm" href="${esc(sms)}" data-rem-sent="${esc(r.key)}|sms">${icon("phone", 14)}Text</a>` : ""}
            <button class="btn btn-ghost btn-sm" data-rem-done="${esc(r.key)}">Mark done</button>`}</div></td>` : ""}</tr>`; }).join("") || `<tr><td colspan="${ed ? 6 : 5}" class="empty">${F.tab === "DUE" ? "Nothing due. Nice." : "Nothing here."}</td></tr>`}
      </tbody></table></div></section>
    <details class="card"><summary><b>Reminder settings</b> <span class="t-muted" style="font-size:13px">How early to remind, and who is copied on emails</span></summary>
      <form id="rem-set-form" class="form-grid" style="margin-top:12px">
        <div class="field"><label for="rs-lead">Remind this many days before the due date</label><input class="input" id="rs-lead" type="number" min="1" max="60" value="${lead}" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="rs-hr">HR email to copy on reminders</label><input class="input" id="rs-hr" type="email" value="${esc(SET().remHrEmail || "")}" placeholder="hr@company.com" ${ed ? "" : "disabled"}></div>
        <div class="field"><label for="rs-sign">Sign emails as</label><input class="input" id="rs-sign" value="${esc(SET().remSign || "HR Department")}" ${ed ? "" : "disabled"}></div>
        ${ed ? '<div class="field" style="align-self:end"><button class="btn btn-primary">Save</button></div>' : ""}</form>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Schedule: probationary evaluations at the end of the 2nd, 4th and 5th month from hiring; the regularization notice before the 6th month ends (Labor Code Art. 296); the annual physical exam a year after the last one; medical records and 201 information once a year; contract ends 30 days ahead; ID cards 30 days before they expire.</p></details>`;
};
async function remMark(key, patch) {
  const id = remKey(key); const prev = S.remDone.get(id) || {}; const next = { key, sent: prev.sent || [], done: prev.done || null, by: prev.by || null, ...patch };
  try { await S.db.doc(`remind/${id}`).set(JSON.parse(JSON.stringify(next))); S.remDone.set(id, { id, ...next }); S.ver++; render(); } catch { toast("Couldn't save. Try again."); }
}
function printNotice(e) {
  const rd = regDue(e); const rv = reviewsOf(e.id).find((r) => r.type === "REGULARIZATION" && r.status === "DONE"); if (!rv) { toast("Finish the regularization evaluation first, so the notice matches the result."); go("review", { type: "REGULARIZATION", emp: e.id }); return; }
  const end = rv.rec === "END"; const st = idSet(); const co = S.org?.companyName || CO_DEFAULT;
  const body = end ? `<p>This is to inform you that, based on your probationary evaluation${rv?.at ? ` dated ${fmtDate(rv.at)}` : ""}, you did not meet the reasonable standards for regularization that were made known to you when you were hired.</p>
      <p>Your probationary employment as <b>${esc(pos(e.posId)?.title || "employee")}</b> will therefore end on <b>${fmtDate(addDays(rd, -1))}</b>. Please coordinate with HR for your clearance and final pay.</p>`
    : `<p>We are pleased to inform you that you have met the standards for regularization made known to you when you were hired${rv?.at ? `, as shown in your evaluation dated ${fmtDate(rv.at)}` : ""}.</p>
      <p>Effective <b>${fmtDate(rd)}</b>, you are a <b>regular employee</b> of ${esc(co)} as <b>${esc(pos(e.posId)?.title || "employee")}</b>, ${esc(unitName(e))}. All other terms of your employment stay the same.</p><p>Congratulations, and thank you for your work.</p>`;
  printSheet(`<div class="idp-letter"><div class="idp-lh"><img src="${CO_LOGO}" alt=""><b>${esc(co)}</b></div><p>${fmtDate(todayISO())}</p>
    <p><b>${esc(completeName(e))}</b><br>${esc(pos(e.posId)?.title || "")}<br>${esc(unitName(e))}<br>Employee No. ${esc(e.no || "")}</p>
    <h2>${end ? "Notice of End of Probationary Employment" : "Notice of Regularization"}</h2><p>Dear ${esc(e.first)},</p>${body}
    <div class="idp-signs"><div><span>${esc(st.signer || " ")}</span><small>${esc(st.signerTitle)}</small></div><div><span> </span><small>Received by ${esc(completeName(e))} · Date</small></div></div></div>`, false);
  logActivity(`Printed the ${end ? "end of probation notice" : "regularization notice"} of ${fullName(e)}`);
}
window.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "rem-set-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  await saveSettings({ remLead: Math.max(1, Math.min(60, Number($("#rs-lead").value) || 7)), remHrEmail: $("#rs-hr").value.trim(), remSign: $("#rs-sign").value.trim() || "HR Department" }, "Updated the reminder settings");
}, true);
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-rem-tab],[data-rem-done],[data-rem-undo],[data-rem-sent],[data-rem-notice],[data-rem-med],[data-rem-id],[data-rem-copy]"); if (!t) return; const d = t.dataset;
  if (d.remSent) { if (S.realEdit && S.db) { const [key, how] = d.remSent.split("|"); const prev = S.remDone.get(remKey(key)); setTimeout(() => remMark(key, { sent: [...(prev?.sent || []), { d: todayISO(), how, by: S.myId || null }].slice(-10) }), 300); } return; }
  ev.stopImmediatePropagation();
  if (d.remTab) { S.remF.tab = d.remTab; render(); return; }
  if ("remCopy" in d) { const l = remDueNow(); const txt = `${S.org?.companyName || CO_DEFAULT} HR reminders, ${fmtDate(todayISO())}\n\n` + (l.map((r) => `• ${fmtDate(r.due)}: ${r.msg.HR}`).join("\n") || "Nothing due.");
    try { await navigator.clipboard.writeText(txt); toast("Copied. Paste it in your HR group chat or email."); } catch { toast("Couldn't copy here."); } return; }
  if (d.remNotice) { const e = S.emps.get(d.remNotice); if (e) printNotice(e); return; }
  if (d.remMed) { S.empFor = d.remMed; go("medical"); return; }
  if (d.remId) { S.idF.pick = [d.remId]; S.idF.show = d.remId; go("idprint"); return; }
  if (!S.realEdit) return;
  if (d.remDone) return remMark(d.remDone, { done: todayISO(), by: S.myId || null });
  if (d.remUndo) return remMark(d.remUndo, { done: null, by: null });
}, true);
document.addEventListener("change", (ev) => { if (ev.target.id === "rem-kind") { S.remF.kind = ev.target.value; render(); } });
document.addEventListener("input", (ev) => { if (ev.target.id !== "rem-q") return; S.remF.q = ev.target.value; clearTimeout(S.remQT); S.remQT = setTimeout(() => { render(); const i = $("#rem-q"); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch {} } }, 250); });

/* HR: a red count on the menu, one note when the app opens, and a card on the dashboard. */
{ const bn = renderNav; renderNav = () => { bn(); if (S.selfMode || !S.realEdit || S.viewAs === "emp") return; let n = 0; try { n = remUrgent().length; } catch {} if (!n) return;
    for (const el of document.querySelectorAll('#nav [data-go="reminders"]')) el.insertAdjacentHTML("beforeend", `<span class="ak-badge" aria-label="${n} due">${n}</span>`);
    if (!S.remToasted && S.emps.size) { S.remToasted = true; setTimeout(() => toast(`${n} HR reminder${n === 1 ? "" : "s"} due. See Overview > Reminders.`), 2500); } }; }
{ const b = VIEWS.dash; VIEWS.dash = (...a) => { const h = b(...a); if (!S.realEdit || S.viewAs === "emp") return h; let l = []; try { l = remUrgent(); } catch { return h; } if (!l.length) return h;
    const card = `<section class="card rem-dash"><div class="card-head"><h2>${icon("bell", 18)} Reminders due</h2><button class="link" data-go="reminders">See all ${l.length}</button></div><ul class="ed-reqs">${l.slice(0, 5).map((r) => { const [sl, sc] = remState(r);
      return `<li><span><b>${esc(r.title)}</b> · ${esc(fullName(r.e))}<small class="t-muted"> · ${esc(remWho(r).join(", "))}</small></span><span class="chip ${sc}">${sl}</span></li>`; }).join("")}</ul></section>`;
    const i = h.indexOf('<section class="hero'); const j = i >= 0 ? h.indexOf("</section>", i) : -1; return j > 0 ? h.slice(0, j + 10) + card + h.slice(j + 10) : card + h; }; }

/* Employees and evaluators: their reminders ride on the phone dashboard summary. */
{ const b = buildSummary; buildSummary = (e) => { const s = b(e); let rem = [];
    try { rem = remList().filter((r) => !r.done && ((r.e.id === e.id && r.to.includes("EMP")) || (r.ev?.id === e.id && r.to.includes("EVAL"))))
      .map((r) => ({ t: r.ev?.id === e.id && r.e.id !== e.id ? r.msg.EVAL : r.msg.EMP, d: r.due, k: r.ev?.id === e.id && r.e.id !== e.id ? "To do" : REM_KIND[r.kind][0] })).slice(0, 8); } catch {}
    s.rem = rem; return s; }; }
{ const b = dashSections; dashSections = (s, go) => { const h = b(s, go); if (!s.rem?.length) return h;
    return `<section class="card rem-dash"><div class="card-head"><h2>${icon("bell", 18)} Reminders for you</h2></div><ul class="ed-reqs">${s.rem.map((r) => `<li><span><small class="t-muted">${esc(r.k)}</small><br>${esc(r.t)}</span><span class="chip ${r.d < todayISO() ? "c-bad" : "c-warn"}" style="white-space:nowrap">${esc(fmtDate(r.d))}</span></li>`).join("")}</ul></section>` + h; }; }
