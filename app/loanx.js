/* ---------- Loans: employees post approved SSS / Pag-IBIG loans with the document; the app reads it ---------- */
Object.assign(LIB, {
  pdfjs: [["pdf.js/3.11.174/pdf.min.js", "pdfjs-dist@3.11.174/build/pdf.min.js"], () => window.pdfjsLib],
  pdfjsWorker: [["pdf.js/3.11.174/pdf.worker.min.js", "pdfjs-dist@3.11.174/build/pdf.worker.min.js"], () => window.pdfjsWorker],
});
Object.assign(S, { lposts: new Map(), selfPosts: new Map(), lpLoaded: false, lpLoading: false, lpF: { st: "PENDING" }, lpOpen: null, lnRead: null, lpDraft: null, selfTab: "clock", sample: null });
Object.assign(TCOLS, { loanposts: "lposts" });
window.claude?.use?.("sample").then((s) => { S.sample = s || null; }).catch(() => {});
{
  const g = NAV.find(([, it]) => it.some(([v]) => v === "loans"));
  if (g) { const it = g[1]; it.splice(it.findIndex(([v]) => v === "loans") + 1, 0, ["loanposts", "Loan submissions", "upload"]); }
  Object.assign(SECTION_OF, { loanposts: "loanposts" });
  const i = ESS_NAV.findIndex(([v]) => v === "esspay"); ESS_NAV.splice(i >= 0 ? i + 1 : ESS_NAV.length, 0, ["essloans", "My loans", "wallet"]);
}
{ const b = bootIO; bootIO = (db) => { b(db); db.collection("loanposts").limit(2000).onSnapshot((snap) => { S.lposts = new Map(snap.docs.map((d) => [d.id, { id: d.id, src: "hr", ...d.data() }])); S.ver++; refresh(); }, () => {}); }; }

const LP_TYPES = PAY.LOAN_TYPES.filter(([k]) => /^(SSS|HDMF)/.test(k)).concat([["COMPANY", "Company loan"]]);
const LP_ST = { PENDING: ["Waiting for HR", "c-warn"], APPROVED: ["Approved, deducting", "c-ok"], REJECTED: ["Returned", "c-bad"] };
const ym = (s) => /^\d{4}-\d{2}$/.test(s || "") ? s : null;
const ymAdd = (m, n) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ymDiff = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const ymLabel = (m) => m ? parseISO(m + "-01").toLocaleDateString("en-PH", { month: "short", year: "numeric" }) : "—";

/* Payroll stops a loan after its last deduction month. */
{ const base = payExt; payExt = (pid) => { const x = base(pid); const lf = x.loansFor; return { ...x, loansFor: (e) => lf(e).filter((l) => { const ln = S.loans.get(l.id); return !ln?.end || pid <= `${ln.end}-2`; }) }; }; }

/* ---------- reading the document ---------- */
async function shrinkToJpeg(src, max = 1500) {
  const img = src instanceof HTMLCanvasElement ? src : await createImageBitmap(src);
  const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.72)); return { blob, url: c.toDataURL("image/jpeg", 0.72) };
}
async function docParts(file) {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    await loadLib("pdfjsWorker").catch(() => {}); const lib = await loadLib("pdfjs");
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; let text = ""; const pages = [];
    for (let i = 1; i <= Math.min(3, pdf.numPages); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n";
      const vp0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: Math.min(2.2, 1500 / vp0.width) }); const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; pages.push(await shrinkToJpeg(c)); }
    return { text: text.replace(/[ \t]+/g, " ").trim(), pages };
  }
  if (/^image\//.test(file.type)) return { text: "", pages: [await shrinkToJpeg(file)] };
  throw new Error("type");
}
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
function monthIn(s) { if (!s) return null; let m = s.match(new RegExp(`(${MONTHS})[a-z]*\\.?\\s*(?:\\d{1,2},?\\s*)?(\\d{4})`, "i")); if (m) return `${m[2]}-${String(MONTHS.split("|").indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}`; m = s.match(/(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : null; }
function parseLoanText(t) {
  const num = (re) => { const m = t.match(re); return m ? Number(m[m.length - 1].replace(/,/g, "")) : null; };
  const near = (re) => { const m = t.match(re); return m ? monthIn(t.slice(m.index, m.index + 80)) : null; };
  const type = /pag-?ibig|hdmf|home development/i.test(t) ? (/calamity/i.test(t) ? "HDMF_CAL" : /housing/i.test(t) ? "HDMF_HOU" : "HDMF_MPL") : /\bsss\b|social security/i.test(t) ? (/calamity/i.test(t) ? "SSS_CAL" : "SSS_SAL") : null;
  const ref = t.match(/(?:loan|application|reference|ref\.?)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9\-]{5,})/i)?.[1] || null;
  const months = num(/(?:term|payable\s+in|no\.?\s+of\s+(?:months|installments)|period)\D{0,25}(\d{1,3})\s*(?:months|mos)/i) || num(/(\d{1,3})\s*(?:monthly\s+)?(?:months|installments)/i);
  return { type, ref, principal: num(/(?:loan\s+amount|amount\s+of\s+loan|principal|loan\s+granted|approved\s+amount)\D{0,40}?([\d,]+\.\d{2})/i),
    monthly: num(/(?:monthly\s+amorti[sz]ation|amorti[sz]ation(?:\s+per\s+month)?|monthly\s+(?:payment|installment|deduction))\D{0,40}?([\d,]+\.\d{2})/i), months,
    start: near(/(?:start|first|begin\w*|effective)\w*\s+(?:of\s+)?(?:amorti[sz]ation|payment|deduction|due)/i), end: near(/(?:end|last|final|maturity)\w*\s+(?:of\s+)?(?:amorti[sz]ation|payment|deduction|due|date)/i) };
}
function finishRead(x) {
  const r = { type: LP_TYPES.some(([k]) => k === x.type) ? x.type : null, ref: x.ref ? String(x.ref).slice(0, 40) : null, principal: Number(x.principal) || null, monthly: Number(x.monthly) || null,
    months: Number(x.months) || null, start: ym(x.start), end: ym(x.end), borrower: x.borrower || null, note: x.note || x.notes || null };
  if (r.start && !r.end && r.months) r.end = ymAdd(r.start, r.months - 1);
  if (r.end && !r.start && r.months) r.start = ymAdd(r.end, -(r.months - 1));
  if (r.start && r.end && !r.months) r.months = ymDiff(r.start, r.end) + 1;
  if (!r.monthly && r.principal && r.months) r.monthly = PAY.r2(r.principal / r.months);
  return r;
}
async function readLoanDoc(file, onStep) {
  onStep?.("Opening the document…"); const parts = await docParts(file); let r = null, by = "none";
  const s = S.sample;
  if (s) {
    try { onStep?.("Reading the amounts and dates…"); const caps = await s.limits().catch(() => null); const imgs = caps?.images ? parts.pages.slice(0, caps.images.maxCount || 3).map((p) => p.blob) : [];
      if (parts.text.length > 40 || imgs.length) {
        const ans = await s.json(`You read Philippine government loan documents for an HR system. The attached ${imgs.length ? "image(s) and " : ""}text are from an employee's approved loan (SSS salary or calamity loan, Pag-IBIG multi-purpose, calamity or housing loan, or a company loan): an approval notice, disclosure statement, loan voucher or billing.
Find the monthly amortization and the months when deductions start and end. If only the term (number of months) and the start are given, work out the end month. If the first amortization is due in a month, that is the start month.
Reply with only one JSON object, no other text:
{"type": "SSS_SAL"|"SSS_CAL"|"HDMF_MPL"|"HDMF_CAL"|"HDMF_HOU"|"COMPANY"|null, "ref": loan or application number or null, "borrower": full name or null, "principal": loan amount in pesos as a number or null, "monthly": monthly amortization in pesos as a number or null, "months": number of monthly payments or null, "start": "YYYY-MM" or null, "end": "YYYY-MM" or null, "note": one short sentence on anything unclear, or null}
${parts.text ? `Text from the document:\n"""\n${parts.text.slice(0, 12000)}\n"""` : "The document is a scan or photo; read it from the image."}`, { images: imgs.length ? imgs : undefined, modelTier: "default" });
        if (ans && typeof ans === "object") { r = finishRead(ans); by = "claude"; } }
    } catch (e) { if (e?.code === "not_granted") S.sample = null; }
  }
  if (!r && parts.text.length > 40) { r = finishRead(parseLoanText(parts.text)); by = "text"; }
  return { r: r || finishRead({}), by, parts, text: parts.text };
}
const readNote = (by, r) => by === "emp" ? "Employee-entered figures from the phone. Open the document and check every figure before approving." : by === "claude" ? `Read by Claude from the document. Check the figures before sending.${r?.note ? ` ${r.note}` : ""}` : by === "text" ? "Read from the text in the PDF. Check the figures before sending." : "The document couldn't be read automatically. Type the figures from it.";

/* ---------- shared form ---------- */
function lpFields(v, idp) {
  return `<div class="form-grid">
    <div class="field"><label for="${idp}-type">Loan</label><select class="input" id="${idp}-type">${opts(LP_TYPES, v.type || "SSS_SAL")}</select></div>
    <div class="field"><label for="${idp}-ref">Loan no.</label><input class="input" id="${idp}-ref" value="${esc(v.ref || "")}"></div>
    <div class="field"><label for="${idp}-monthly">Monthly amortization (PHP) <span class="req">*</span></label><input class="input" id="${idp}-monthly" type="number" min="1" step="0.01" required value="${v.monthly ?? ""}"></div>
    <div class="field"><label for="${idp}-start">First deduction month <span class="req">*</span></label><input class="input" id="${idp}-start" type="month" required value="${esc(v.start || "")}"></div>
    <div class="field"><label for="${idp}-end">Last deduction month <span class="req">*</span></label><input class="input" id="${idp}-end" type="month" required value="${esc(v.end || "")}"></div>
    <div class="field"><label for="${idp}-amt">Loan amount (optional)</label><input class="input" id="${idp}-amt" type="number" min="0" step="0.01" value="${v.principal ?? ""}"></div></div>`;
}
const lpVals = (idp) => ({ type: $(`#${idp}-type`).value, ref: $(`#${idp}-ref`).value.trim() || null, monthly: Number($(`#${idp}-monthly`).value) || null, start: ym($(`#${idp}-start`).value), end: ym($(`#${idp}-end`).value), principal: Number($(`#${idp}-amt`).value) || null });
const lpCheck = (v) => !v.monthly ? "Enter the monthly amortization." : !v.start || !v.end ? "Enter the first and last deduction months." : v.end < v.start ? "The last month is before the first." : ymDiff(v.start, v.end) > 360 ? "Check the months: that is over 30 years." : null;
const dropBox = (id, label) => `<label class="ld-drop" data-drop="${id}" tabindex="0">${icon("upload", 26)}<b>${label}</b><span>Photo or PDF of the approved loan: approval notice, disclosure statement, voucher or billing</span><input type="file" id="${id}" accept="image/*,application/pdf" hidden></label>`;
const pagesHtml = (urls) => { urls = urls.filter(safeImgUrl); return urls.length ? `<div class="ld-pages">${urls.map((u, i) => `<img src="${esc(u)}" alt="Loan document page ${i + 1}">`).join("")}</div>` : ""; };

/* ---------- employee's own phone: My loans ---------- */
{ const bn = selfNav; selfNav = () => { const h = bn(); return S.self?.claim ? h.replace(/<button class="nav-item" aria-current="page">([\s\S]*?)<\/button>/, (m, inner) => `<button class="nav-item" data-self-tab="clock"${S.selfTab === "clock" ? ' aria-current="page"' : ""}>${inner}</button><button class="nav-item" data-self-tab="loans"${S.selfTab === "loans" ? ' aria-current="page"' : ""}>${icon("wallet")}My loans</button>`) : h; };
  const bv = selfView; selfView = () => S.selfTab === "loans" && S.self?.claim ? selfLoans() : bv(); }
function loadSelfPosts() { if (S.selfPostsSub || !S.self?.uid || !S.db) return; S.selfPostsSub = true;
  S.db.collection(`clockins/${S.self.uid}/loans`).limit(100).onSnapshot((snap) => { S.selfPosts = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); render(); }, () => {}); }
function selfLoans() {
  loadSelfPosts(); const D = S.lpDraft; const mine = listOf(S.selfPosts).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""));
  return head(`${esc(S.self.claim.name || "")} · ${esc(S.self.claim.empNo || "")}`, "My loans") + `
    <section class="card stack" style="gap:14px;max-width:640px"><h2 style="font-size:18px;margin:0">Post an approved loan</h2>
      <p class="t-muted" style="margin:0;font-size:14px">For SSS and Pag-IBIG loans already approved. HR checks it, then payroll deducts it from your pay every cutoff until the last month.</p>
      ${D?.busy ? `<p class="ld-busy">${esc(D.step || "Reading…")}</p>` : D?.r ? lpDraftForm(D, "sl") : dropBox("sl-file", "Take a photo or choose the file")}</section>
    <section class="card" style="max-width:640px"><h2 style="font-size:18px;margin:0 0 10px">My loan posts</h2>${mine.length ? `<ul class="list" style="font-size:14px">${mine.map((p) => `<li style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>${esc(LTYPE[p.type] || "Loan")}</b>${p.ref ? ` · ${esc(p.ref)}` : ""}<div class="t-muted" style="font-size:13px">${money(p.monthly)} a month · ${ymLabel(p.start)} to ${ymLabel(p.end)}</div>${p.reason ? `<div class="t-bad" style="font-size:13px">${esc(p.reason)}</div>` : ""}</span><span class="chip ${LP_ST[p.status]?.[1] || "c-gray"}">${LP_ST[p.status]?.[0] || ""}</span></li>`).join("")}</ul>` : '<p class="t-muted" style="margin:0">Nothing posted yet.</p>'}</section>`;
}
function lpDraftForm(D, idp) {
  return `<form id="${idp}-form" class="stack" style="gap:12px" data-keep><p class="ld-note ${D.by === "none" ? "t-warn" : ""}">${icon(D.by === "none" ? "alert" : "shield", 16)} ${esc(readNote(D.by, D.r))}</p>
    ${pagesHtml(D.parts.pages.map((p) => p.url))}${lpFields(D.r, idp)}
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-lp-reset="1">Choose another file</button><button class="btn btn-primary">Send to HR</button></div></form>`;
}
async function startRead(file, after) {
  if (!file) return; if (file.size > 25 * 1048576) { toast("That file is over 25 MB."); return; }
  if (!/^image\//.test(file.type) && !/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast("Use a photo or a PDF of the loan document."); return; }
  S.lpDraft = { busy: true, step: "Opening the document…", file }; render();
  try { const x = await readLoanDoc(file, (s) => { S.lpDraft.step = s; render(); }); S.lpDraft = { ...x, file, busy: false }; after?.(); }
  catch { S.lpDraft = null; toast("Couldn't open that file. Try a clear photo or the PDF."); }
  render();
}
async function savePages(base, id, pages) { const chunks = []; for (let p = 0; p < pages.length; p++) { const u = pages[p].url; const n = Math.ceil(u.length / 200000); chunks.push(n); for (let c = 0; c < n; c++) await S.db.doc(`${base}/${id}-${p}-${c}`).set({ d: u.slice(c * 200000, (c + 1) * 200000) }); } return chunks; }
async function loadPages(base, id, chunks) { const out = []; for (let p = 0; p < (chunks || []).length; p++) { let u = ""; for (let c = 0; c < chunks[p]; c++) { const d = await S.db.doc(`${base}/${id}-${p}-${c}`).get(); u += d.exists ? d.data().d : ""; } if (u) out.push(u); } return out; }

/* ---------- HR: Loan submissions ---------- */
async function loadLoanPosts(force) {
  if ((S.lpLoaded && !force) || S.lpLoading) return; S.lpLoading = true;
  try { const devs = [...S.clockDevs.values()].filter((d) => !d.kiosk && !d.bio); const m = new Map();
    await Promise.all(devs.map(async (d) => { const snap = await S.db.collection(`clockins/${d.id}/loans`).limit(100).get().catch(() => ({ docs: [] })); for (const x of snap.docs) m.set(`${d.id}:${x.id}`, { id: x.id, key: `${d.id}:${x.id}`, src: "self", dev: d.id, claim: d, ...x.data() }); }));
    S.selfAll = m; S.lpLoaded = true; } finally { S.lpLoading = false; render(); }
}
const lpEmp = (p) => S.emps.get(p.src === "self" ? p.dev && S.clockLinks[p.dev] : p.empId) || null; // phone posts count only through a phone link HR confirmed
const lpAll = () => [...listOf(S.lposts).map((p) => ({ ...p, key: `hr:${p.id}` })), ...(S.selfAll ? S.selfAll.values() : [])];
VIEWS.loanposts = () => {
  loadLoanPosts(); const F = S.lpF; const all = lpAll().sort((a, b) => (b.filed || "").localeCompare(a.filed || "")); const list = all.filter((p) => !F.st || p.status === F.st);
  const open = S.lpOpen ? all.find((p) => p.key === S.lpOpen) : null;
  return head("Payroll", "Loan submissions", `<button class="btn btn-ghost" data-lp-refresh="1">Check for new posts</button>`) + `
    <section class="stats">${dxTile("Waiting for HR", all.filter((p) => p.status === "PENDING").length, "approved loans posted by employees", "t-warn")}${dxTile("Approved", all.filter((p) => p.status === "APPROVED").length, "now deducted in payroll", "t-ok")}${dxTile("Monthly total", peso.format(PAY.r2(all.filter((p) => p.status === "APPROVED").reduce((s, p) => s + (p.monthly || 0), 0))), "approved amortizations")}${dxTile("Read automatically", all.filter((p) => p.read?.by && p.read.by !== "none").length, `of ${all.length} documents`)}</section>
    ${open ? lpReview(open) : ""}
    <section class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${stTabs(F.st, "lp-st", [["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Returned"], ["", "All"]])}${S.lpLoading ? '<span class="t-muted" style="font-size:13px">Checking employees\' phones…</span>' : ""}</section>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Loan</th><th class="num">Monthly</th><th>Deductions</th><th>Read</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((p) => { const e = lpEmp(p); return `<tr><td>${e ? empCell(e) : `<b>${esc(p.claim?.name || "Unlinked phone")}</b><div class="t-warn" style="font-size:12px">${esc(p.claim?.empNo || "")} · link the account in Phone clock-in</div>`}</td>
        <td><b>${esc(LTYPE[p.type] || "Loan")}</b><div class="t-muted" style="font-size:12px">${p.ref ? esc(p.ref) + " · " : ""}${p.src === "self" ? "posted from the employee's phone" : "posted by HR"}</div></td><td class="num">${money(p.monthly)}</td>
        <td style="white-space:nowrap">${ymLabel(p.start)} to ${ymLabel(p.end)}</td><td>${p.src === "self" ? '<span class="chip c-warn">Employee-entered</span>' : ""}<span class="chip ${p.src === "self" ? "c-gray" : ""} ${p.read?.by === "claude" ? "c-blue" : p.read?.by === "text" ? "c-gray" : "c-warn"}">${p.read?.by === "claude" ? "Claude" : p.read?.by === "text" ? "PDF text" : "Typed"}</span></td>
        <td><span class="chip ${LP_ST[p.status]?.[1] || "c-gray"}">${LP_ST[p.status]?.[0] || ""}</span></td><td class="num"><button class="btn btn-ghost btn-sm" data-lp-open="${esc(p.key)}">${p.status === "PENDING" ? "Review" : "View"}</button></td></tr>`; }).join("") || '<tr><td colspan="7" class="empty">No loan posts here.</td></tr>'}</tbody></table></div>
      <p class="t-muted" style="font-size:13px;margin:10px 0 0">Employees post from My loans on their phone time clock. HR can also post one from New loan, or for an employee in the Employee view. Approving adds the loan to Loans &amp; Deductions: half the monthly amortization each cutoff, from the first to the last month.</p></section>`;
};
function lpReview(p) {
  const e = lpEmp(p); if (!S.lpPages || S.lpPages.key !== p.key) { S.lpPages = { key: p.key, urls: null };
    (p.src === "self" ? loadPages(`clockins/${p.dev}/loanfiles`, p.id, p.file?.chunks) : Promise.resolve(p.file?.asset ? [`/_blob/${p.file.asset}`] : [])).then((u) => { if (S.lpPages?.key === p.key) { S.lpPages.urls = u; render(); } }).catch(() => {}); }
  const urls = S.lpPages.urls; const dup = e && listOf(S.loans).find((ln) => ln.empId === e.id && ["ACTIVE", "HOLD"].includes(ln.status) && (p.ref && ln.ref === p.ref || ln.type === p.type));
  const ed = S.canEdit && p.status === "PENDING";
  return `<section class="card"><div class="card-head"><h2>${esc(LTYPE[p.type] || "Loan")} · ${esc(e ? fullName(e) : p.claim?.name || "")}</h2><button class="link" data-lp-open="">Close</button></div>
    <div class="two" style="align-items:start"><div>${urls === null ? '<p class="t-muted">Loading the document…</p>' : urls.length ? (p.file?.asset && /pdf$/i.test(p.file.type || "") ? `<p><a class="btn btn-ghost btn-sm" href="${safeDocUrl(urls[0]) ? esc(urls[0]) : "#"}" target="_blank" rel="noopener">Open ${esc(p.file.name || "document")}</a></p>` : pagesHtml(urls)) : '<p class="t-muted">No document attached.</p>'}
      <p class="ld-note" style="margin-top:8px">${esc(readNote(p.src === "self" ? "emp" : p.read?.by || "none", p.read))}</p></div>
      <div>${ed ? `<form id="lpr-form" class="stack" style="gap:12px" data-key="${esc(p.key)}" data-keep>${lpFields(p, "lpr")}
          ${!e ? '<p class="t-warn" style="margin:0;font-size:14px">This phone isn\'t linked to an employee yet. Link it in Phone clock-in first.</p>' : ""}${dup ? `<p class="t-warn" style="margin:0;font-size:14px">${esc(fullName(e))} already has an active ${esc(LTYPE[dup.type].toLowerCase())}${dup.ref ? ` (${esc(dup.ref)})` : ""}. Check it isn't the same loan.</p>` : ""}
          <div class="field"><label for="lpr-why">Note to the employee if returned</label><input class="input" id="lpr-why" placeholder="e.g. Photo is blurred, please retake"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-lp-reject="${esc(p.key)}">Return to employee</button><button class="btn btn-primary"${e ? "" : " disabled"}>Approve and start deductions</button></div></form>`
        : `<dl class="facts">${tfact("Monthly amortization", money(p.monthly))}${tfact("Per cutoff", money(PAY.r2((p.monthly || 0) / 2)))}${tfact("First month", ymLabel(p.start))}${tfact("Last month", ymLabel(p.end))}${p.principal ? tfact("Loan amount", money(p.principal)) : ""}${p.loanId && S.loans.get(p.loanId) ? tfact("Loan record", `<button class="link" data-loan="${p.loanId}">Open</button>`) : ""}${p.reason ? tfact("Returned because", esc(p.reason)) : ""}</dl>`}</div></div></section>`;
}
function cutoffsBetween(startPid, endM) { let n = 0; for (let p = startPid; p <= `${endM}-2` && n < 800; p = PAY.shiftPeriod(p, 1)) n++; return n; }
async function approvePost(p, v) {
  const e = lpEmp(p); const cur = curPeriod(); const startPid = `${v.start}-1` < cur ? cur : `${v.start}-1`; const amort = PAY.r2(v.monthly / 2); const n = cutoffsBetween(startPid, v.end);
  if (!n) throw { msg: "The last deduction month has already passed." };
  const ln = { id: uid(), empId: e.id, type: v.type, ref: v.ref, granted: null, principal: PAY.r2(amort * n), paidBefore: 0, amort, start: startPid, end: v.end, monthly: v.monthly, payments: {}, status: "ACTIVE",
    docPrincipal: v.principal || null, post: { src: p.src, dev: p.dev || null, id: p.id }, notes: `Posted ${p.src === "self" ? "by the employee" : "by HR"} with the approved loan document. Monthly amortization ${peso.format(v.monthly)}, ${ymLabel(v.start)} to ${ymLabel(v.end)}.` };
  await put("loans", ln);
  const upd = { ...v, status: "APPROVED", loanId: ln.id, decided: todayISO(), reason: null };
  if (p.src === "self") { const { id, key, src, dev, claim, ...rest } = p; await S.db.doc(`clockins/${p.dev}/loans/${p.id}`).set(JSON.parse(JSON.stringify({ ...rest, ...upd }))); S.selfAll.set(p.key, { ...p, ...upd }); }
  else await saveRec("loanposts", p.id, { ...p, ...upd });
  logActivity(`Approved the ${LTYPE[v.type].toLowerCase()} posted for ${fullName(e)}`); return ln;
}

/* ---------- HR: read a document on the New loan form ---------- */
{ const base = VIEWS.loanForm; VIEWS.loanForm = () => { const h = base(); const R = S.lnRead; const ln = S.view.id ? S.loans.get(S.view.id) : null;
    const panel = `<section class="card" id="ln-read"><div class="card-head"><h2>Read from the loan document</h2>${R?.doc ? `<span class="chip c-ok">${esc(R.doc.name)}</span>` : ""}</div>
      ${R?.busy ? `<p class="ld-busy">${esc(R.step || "Reading…")}</p>` : `${R?.by ? `<p class="ld-note ${R.by === "none" ? "t-warn" : ""}">${esc(readNote(R.by, R.r))} The fields below are filled in.</p>` : ""}${S.canEdit ? dropBox("ln-file", R?.by ? "Read another document" : "Drop the approved loan here, or choose the file") : ""}`}</section>`;
    const extra = `<div class="form-grid" id="ln-extra"><div class="field"><label for="lf2-monthly">Monthly amortization</label><input class="input" id="lf2-monthly" type="number" min="0" step="0.01" value="${R?.r?.monthly ?? ln?.monthly ?? ""}" placeholder="Fills the per-cutoff amount"></div>
      <div class="field"><label for="lf2-end">Last deduction month</label><input class="input" id="lf2-end" type="month" value="${esc(R?.r?.end || ln?.end || "")}"></div></div>`;
    return h.replace('<form id="loan-form"', panel + '<form id="loan-form"').replace('<div class="field"><label for="lf2-notes">', extra + '<div class="field"><label for="lf2-notes">'); }; }
function fillLoanForm(r) {
  const set = (id, v) => { const x = $(`#${id}`); if (x && v != null && v !== "") x.value = v; };
  if (r.type) set("lf2-type", r.type); set("lf2-ref", r.ref); set("lf2-monthly", r.monthly); set("lf2-end", r.end);
  if (r.monthly) set("lf2-amort", PAY.r2(r.monthly / 2));
  if (r.start) { const sel = $("#lf2-start"); const pid = `${r.start}-1` < curPeriod() ? curPeriod() : `${r.start}-1`; if (sel && ![...sel.options].some((o) => o.value === pid)) sel.add(new Option(PAY.period(pid).label, pid)); set("lf2-start", pid);
    if (r.monthly && r.end) set("lf2-amt", PAY.r2(PAY.r2(r.monthly / 2) * cutoffsBetween(pid, r.end))); }
  else if (r.principal) set("lf2-amt", r.principal);
  const notes = $("#lf2-notes"); if (notes && !notes.value && r.monthly) notes.value = `Monthly amortization ${peso.format(r.monthly)}${r.start ? `, ${ymLabel(r.start)} to ${ymLabel(r.end)}` : ""}. Read from the loan document.`;
}
{ const base = submitLoan; submitLoan = async () => { const end = ym($("#lf2-end")?.value); const monthly = Number($("#lf2-monthly")?.value) || null; const doc = S.lnRead?.doc || null; const read = S.lnRead?.by || null;
    await base(); const id = S.view.name === "loan" ? S.view.id : null; const ln = id && S.loans.get(id);
    if (ln && (end || monthly || doc)) await put("loans", { ...ln, end: end || null, monthly: monthly || ln.monthly || null, ...(doc ? { doc, readBy: read } : {}) });
    S.lnRead = null; render(); }; }
{ const base = VIEWS.loan; VIEWS.loan = () => { const ln = S.loans.get(S.view.id); const h = base(); if (!ln || !(ln.end || ln.monthly || ln.doc || ln.post)) return h;
    const card = `<section class="card"><div class="card-head"><h2>Loan document</h2></div><dl class="facts">${ln.monthly ? tfact("Monthly amortization", money(ln.monthly)) : ""}${ln.end ? tfact("Last deduction month", ymLabel(ln.end)) : ""}${ln.docPrincipal ? tfact("Loan amount on the document", money(ln.docPrincipal)) : ""}</dl>
      ${ln.doc?.id ? `<p style="margin:10px 0 0"><a class="btn btn-ghost btn-sm" href="/_blob/${esc(ln.doc.id)}" target="_blank" rel="noopener">${icon("file", 16)} Open ${esc(ln.doc.name || "document")}</a></p>` : ln.post ? `<p style="margin:10px 0 0"><button class="btn btn-ghost btn-sm" data-lp-goto="${esc(ln.post.src === "self" ? `${ln.post.dev}:${ln.post.id}` : `hr:${ln.post.id}`)}">See the posted document</button></p>` : ""}</section>`;
    return h + card; }; }

/* ---------- Employee view (HR posting on behalf) ---------- */
ESS.essloans = (e) => {
  const mine = listOf(S.loans).filter((ln) => ln.empId === e.id).sort((a, b) => (b.start || "").localeCompare(a.start || "")); const posts = listOf(S.lposts).filter((p) => p.empId === e.id); const D = S.lpDraft;
  return head("Employee", "My loans") + `
    <section class="card"><div class="card-head"><h2>Loans deducted from my pay</h2></div><div class="table-wrap"><table><thead><tr><th>Loan</th><th class="num">Monthly</th><th class="num">Per cutoff</th><th>Until</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
      ${mine.map((ln) => `<tr><td><b>${esc(LTYPE[ln.type])}</b>${ln.ref ? `<div class="t-muted" style="font-size:12px">${esc(ln.ref)}</div>` : ""}</td><td class="num">${money(ln.monthly || ln.amort * 2)}</td><td class="num">${money(ln.amort)}</td><td>${ln.end ? ymLabel(ln.end) : "Until paid"}</td><td class="num"><b>${money(loanBal(ln))}</b></td><td><span class="chip ${LSTAT[ln.status][1]}">${LSTAT[ln.status][0]}</span></td></tr>`).join("") || '<tr><td colspan="6" class="empty">No loans.</td></tr>'}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>Post an approved loan</h2></div>${D?.busy ? `<p class="ld-busy">${esc(D.step || "Reading…")}</p>` : D?.r ? lpDraftForm(D, "el") : S.realEdit ? dropBox("el-file", "Drop the approved loan here, or choose the file") : ""}
      ${posts.length ? `<ul class="list" style="font-size:14px;margin-top:12px">${posts.map((p) => `<li style="display:flex;justify-content:space-between;gap:10px"><span>${esc(LTYPE[p.type] || "Loan")} · ${money(p.monthly)} a month · ${ymLabel(p.start)} to ${ymLabel(p.end)}</span><span class="chip ${LP_ST[p.status][1]}">${LP_ST[p.status][0]}</span></li>`).join("")}</ul>` : ""}</section>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-self-tab],[data-lp-reset],[data-lp-open],[data-lp-st],[data-lp-refresh],[data-lp-reject],[data-lp-goto]"); if (!t) return; ev.stopImmediatePropagation(); const d = t.dataset;
  if (d.selfTab) { S.selfTab = d.selfTab; S.navOpen = false; render(); return; }
  if (d.lpReset) { S.lpDraft = null; render(); return; }
  if (d.lpOpen !== undefined) { S.lpOpen = d.lpOpen || null; render(); if (d.lpOpen) window.scrollTo({ top: 0 }); return; }
  if (d.lpGoto) { S.lpOpen = d.lpGoto; S.lpF.st = ""; go("loanposts"); return; }
  if (d.lpSt !== undefined) { S.lpF.st = d.lpSt; render(); return; }
  if (d.lpRefresh) { loadLoanPosts(true); return; }
  if (d.lpReject && S.realEdit) { const p = lpAll().find((x) => x.key === d.lpReject); const reason = $("#lpr-why")?.value.trim() || "Please check the document and post it again.";
    try { const upd = { status: "REJECTED", reason, decided: todayISO() };
      if (p.src === "self") { const { id, key, src, dev, claim, ...rest } = p; await S.db.doc(`clockins/${p.dev}/loans/${p.id}`).set(JSON.parse(JSON.stringify({ ...rest, ...upd }))); S.selfAll.set(p.key, { ...p, ...upd }); } else await saveRec("loanposts", p.id, { ...p, ...upd });
      S.lpOpen = null; logActivity("Returned a loan post to the employee"); toast("Returned to the employee."); render(); } catch { toast("Couldn't save. Try again."); } }
}, true);
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "sl-file" || t.id === "el-file") { startRead(t.files?.[0]); return; }
  if (t.id === "ln-file") { readForLoanForm(t.files?.[0]); return; }
  if (t.id === "lf2-monthly" && Number(t.value) > 0) { const a = $("#lf2-amort"); if (a) a.value = PAY.r2(Number(t.value) / 2); }
});
async function readForLoanForm(file) {
  if (!file) return; const keep = () => { const f = $("#loan-form"); return f ? Object.fromEntries([...f.querySelectorAll("input,select,textarea")].filter((x) => x.id).map((x) => [x.id, x.value])) : {}; };
  const vals = keep(); S.lnRead = { busy: true, step: "Opening the document…" }; render(); for (const [k, v] of Object.entries(vals)) { const x = $(`#${k}`); if (x && v) x.value = v; }
  try { const x = await readLoanDoc(file, (s) => { S.lnRead.step = s; const p = $("#ln-read .ld-busy"); if (p) p.textContent = s; });
    let doc = null; if (S.assets) { try { const u = await S.assets.upload(file); doc = { id: u.id, name: file.name.slice(0, 120), type: file.type }; } catch {} }
    S.lnRead = { by: x.by, r: x.r, doc }; } catch { S.lnRead = null; toast("Couldn't open that file. Try a clear photo or the PDF."); }
  render(); for (const [k, v] of Object.entries(vals)) { const el = $(`#${k}`); if (el && v) el.value = v; } if (S.lnRead?.r) fillLoanForm(S.lnRead.r);
}
for (const type of ["dragenter", "dragover"]) document.addEventListener(type, (ev) => { const z = ev.target.closest?.(".ld-drop"); if (!z) return; ev.preventDefault(); z.classList.add("drag"); });
document.addEventListener("dragleave", (ev) => { const z = ev.target.closest?.(".ld-drop"); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", (ev) => { const z = ev.target.closest?.(".ld-drop"); if (!z) return; ev.preventDefault(); ev.stopImmediatePropagation(); const f = ev.dataTransfer?.files?.[0]; if (!f) return;
  if (z.dataset.drop === "ln-file") readForLoanForm(f); else startRead(f); }, true);
document.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList?.contains("ld-drop")) { ev.preventDefault(); ev.target.querySelector("input")?.click(); } });
window.addEventListener("submit", async (ev) => {
  const f = ev.target; if (!["sl-form", "el-form", "lpr-form"].includes(f.id)) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const idp = f.id.split("-")[0]; const v = lpVals(idp); const bad = lpCheck(v); if (bad) { toast(bad); return; }
  const btn = f.querySelector("button.btn-primary"); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    if (f.id === "lpr-form") { if (!S.realEdit) return; const p = lpAll().find((x) => x.key === f.dataset.key); const ln = await approvePost(p, v); S.lpOpen = null; toast(`Approved. ${peso.format(ln.amort)} comes off each cutoff from ${PAY.period(ln.start).label}.`); render(); return; }
    const D = S.lpDraft; const id = uid(); const read = { by: D.by, note: D.r?.note || null }; const months = ymDiff(v.start, v.end) + 1;
    if (f.id === "sl-form") { const base = `clockins/${S.self.uid}`; const chunks = await savePages(`${base}/loanfiles`, id, D.parts.pages);
      await S.db.doc(`${base}/loans/${id}`).set(JSON.parse(JSON.stringify({ ...v, months, read, file: { name: D.file.name.slice(0, 120), type: D.file.type, chunks }, status: "PENDING", filed: new Date().toISOString() })));
      S.lpDraft = null; toast("Sent to HR. You'll see the status here."); render(); return; }
    if (!S.realEdit) return; const e = essEmp(); let file = { name: D.file.name.slice(0, 120), type: D.file.type };
    if (S.assets) { const u = await S.assets.upload(D.file); file.asset = u.id; }
    await saveRec("loanposts", id, { ...v, months, read, file, empId: e.id, status: "PENDING", filed: new Date().toISOString(), by: S.myId || null }); logActivity(`Posted a ${LTYPE[v.type].toLowerCase()} for ${fullName(e)}`);
    S.lpDraft = null; toast("Sent to HR for approval."); render();
  } catch (x) { toast(x?.msg || "Couldn't save. Try again."); if (btn) { btn.disabled = false; btn.textContent = f.id === "lpr-form" ? "Approve and start deductions" : "Send to HR"; } }
}, true);
