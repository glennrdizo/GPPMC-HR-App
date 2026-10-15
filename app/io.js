/* ---------- Excel export and import on every page, attachments on every page, the monthly report, project codes ---------- */
Object.assign(TCOLS, { attachments: "atts" });
Object.assign(S, { atts: new Map(), io: null, repMonth: null, repScope: "all" });
Object.assign(ICON, {
  xls: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  clip: '<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  slides: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M12 17v4M8 21h8"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h2a1.5 1.5 0 0 1 0 3H8v-5M14 11v5"/>',
});
{
  const ov = NAV.find(([g]) => g === "Overview"); if (ov) ov[1].push(["report", "Monthly report", "report"]);
  for (const [, items] of NAV) { const it = items.find(([v]) => v === "projects"); if (it) it[3] = [["projcodes", "Project codes", "tag"]]; }
  Object.assign(SECTION_OF, { report: "report", projcodes: "projcodes" });
}

/* Spreadsheet, slide and PDF libraries load from a CDN the first time they are needed. */
const LIB = {
  xlsx: [["xlsx/0.18.5/xlsx.full.min.js", "xlsx@0.18.5/dist/xlsx.full.min.js"], () => window.XLSX],
  pptx: [["pptxgenjs/3.12.0/pptxgen.bundle.js", "pptxgenjs@3.12.0/dist/pptxgen.bundle.js"], () => window.PptxGenJS],
  pdf: [["jspdf/2.5.1/jspdf.umd.min.js", "jspdf@2.5.1/dist/jspdf.umd.min.js"], () => window.jspdf?.jsPDF],
  pdfTable: [["jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js", "jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"], () => window.jspdf?.jsPDF?.API?.autoTable],
};
const libLoads = {};
// Fingerprints of the exact library files (npm builds), so a tampered CDN copy is refused.
const LIB_SRI = {
  "xlsx@0.18.5/dist/xlsx.full.min.js": "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw",
  "pptxgenjs@3.12.0/dist/pptxgen.bundle.js": "sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ",
  "jspdf@2.5.1/dist/jspdf.umd.min.js": "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
  "jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js": "sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3",
  "pdfjs-dist@3.11.174/build/pdf.min.js": "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e",
  "pdfjs-dist@3.11.174/build/pdf.worker.min.js": "sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2",
};
function loadLib(k) {
  const [[cdnjs, npm], ready] = LIB[k];
  if (ready()) return Promise.resolve(ready());
  return (libLoads[k] ||= (async () => {
    for (const url of ["https://cdnjs.cloudflare.com/ajax/libs/" + cdnjs, "https://cdn.jsdelivr.net/npm/" + npm]) {
      try { await new Promise((ok, no) => { const s = document.createElement("script"); if (LIB_SRI[npm]) { s.integrity = LIB_SRI[npm]; s.crossOrigin = "anonymous"; } s.src = url; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); if (ready()) return ready(); } catch {}
    }
    libLoads[k] = null; throw new Error("library");
  })());
}
async function saveBlob(filename, data) {
  if (!S.downloads) { toast("Downloads aren't available in this view."); return false; }
  try { await S.downloads.save({ filename, data }); return true; } catch { toast("The download was cancelled."); return false; }
}
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (s) => String(s || "page").toLowerCase().replace(/&amp;/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "page";
const sheetName = (n, used) => { let b = String(n || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Sheet"; let x = b, i = 2; while (used.has(x.toLowerCase())) x = `${b} ${i++}`; used.add(x.toLowerCase()); return x; };
async function saveBook(filename, sheets) {
  let X; try { X = await loadLib("xlsx"); } catch { toast("Couldn't load the Excel tools. Check your connection and try again."); return false; }
  const wb = X.utils.book_new(); const used = new Set();
  for (const sh of sheets) {
    if (!sh.rows?.length) continue;
    const ws = X.utils.aoa_to_sheet(sh.rows);
    ws["!cols"] = sh.rows[0].map((_, c) => ({ wch: Math.min(48, Math.max(8, ...sh.rows.slice(0, 300).map((r) => String(r[c] ?? "").length + 2))) }));
    X.utils.book_append_sheet(wb, ws, sheetName(sh.name, used));
  }
  if (!wb.SheetNames.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Nothing to export on this page yet."]]), "Sheet1");
  return saveBlob(filename, new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_TYPE }));
}

/* ---------- page toolbar ---------- */
const IO_SKIP = (n) => /Form$/.test(n) || ["import", "payslip", "report", "perms"].includes(n);
function pageLabel() {
  const b = baseView(S.view.name); const sec = SECTION_OF[S.view.name] || SECTION_OF[b] || b;
  for (const [, items] of NAV) for (const [v, l, , kids] of items) { if (v === sec) return l; const k = (kids || []).find(([kv]) => kv === sec); if (k) return `${l} ${k[1]}`; }
  return ($("#main h1")?.textContent || "Page").replace(/\s+/g, " ").trim();
}
const attKey = () => SECTION_OF[S.view.name] || SECTION_OF[baseView(S.view.name)] || baseView(S.view.name) || "dash";
const attsFor = (k) => listOf(S.atts).filter((a) => a.page === k).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
function ioBar() {
  const n = S.view.name; const form = /Form$/.test(baseView(n)); if (!form && IO_SKIP(baseView(n))) return "";
  const cnt = attsFor(attKey()).length;
  if (form) return `<div class="iobar no-print" role="toolbar" aria-label="Attachments"><button class="btn btn-ghost btn-sm" data-io="att">${icon("clip", 16)}Attachments${cnt ? `<span class="io-count">${cnt}</span>` : ""}</button></div>`;
  return `<div class="iobar no-print" role="toolbar" aria-label="Excel and attachments">
    <button class="btn btn-ghost btn-sm" data-io="export">${icon("download", 16)}Export to Excel</button>
    ${S.canEdit ? `<button class="btn btn-ghost btn-sm" data-io="import">${icon("upload", 16)}Import from Excel</button>` : ""}
    <button class="btn btn-ghost btn-sm" data-io="att">${icon("clip", 16)}Attachments${cnt ? `<span class="io-count">${cnt}</span>` : ""}</button></div>`;
}
function withIO(html) {
  if (S.io && S.io.view !== S.view.name) closeModal();
  const bar = ioBar(); if (!bar) return html;
  let i = html.indexOf("</header>"); if (i >= 0) return html.slice(0, i + 9) + bar + html.slice(i + 9);
  i = html.indexOf("</section>"); return i >= 0 && S.view.name === "dash" ? html.slice(0, i + 10) + bar + html.slice(i + 10) : bar + html;
}

/* ---------- export: every table on the page becomes a sheet, plus the page's records in the import layout ---------- */
function cellText(td) {
  const c = td.cloneNode(true);
  c.querySelectorAll("input").forEach((x) => x.replaceWith(x.type === "checkbox" ? (x.checked ? "Yes" : "No") : x.getAttribute("value") || ""));
  c.querySelectorAll("select").forEach((x) => x.replaceWith(x.querySelector("option[selected]")?.textContent || ""));
  c.querySelectorAll(".btn,.sr-only,svg,[data-io],.no-print").forEach((x) => x.remove());
  c.querySelectorAll("br,div,li,p").forEach((x) => x.before(" "));
  return c.textContent.replace(/\s+/g, " ").trim();
}
function toVal(s) {
  if (typeof s !== "string" || !s) return s;
  if (/^0\d/.test(s) || s.length > 18) return s;
  const m = s.match(/^(\(?)-?\s*₱?\s*([\d,]+(?:\.\d+)?)\)?\s*(%?)$/);
  if (!m || !/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(m[2])) return s;
  let v = Number(m[2].replace(/,/g, "")); if (m[1] || /^-/.test(s)) v = -v; return m[3] ? v / 100 : v;
}
function pageSheets() {
  const V = VIEWS[S.view.name] || VIEWS.dash; const keep = PAGE; PAGE = 1e6;
  let html; try { html = V(); } finally { PAGE = keep; }
  const box = document.createElement("div"); box.innerHTML = html;
  const title = (box.querySelector("h1")?.textContent || "Page").replace(/\s+/g, " ").trim();
  const sheets = [];
  box.querySelectorAll("table").forEach((tb) => {
    const sec = tb.closest("section,.card"); const h = sec?.querySelector("h2,h3")?.textContent?.replace(/\s+/g, " ").trim();
    let rows = [...tb.rows].filter((tr) => !(tr.cells.length === 1 && tr.cells[0].colSpan > 1)).map((tr) => [...tr.cells].map(cellText));
    rows = rows.filter((r) => r.some((x) => x));
    if (rows.length < 2) return;
    const width = Math.max(...rows.map((r) => r.length));
    const keepCol = [...Array(width).keys()].filter((c) => rows.some((r) => r[c]));
    sheets.push({ name: h || title, page: true, rows: rows.map((r, i) => keepCol.map((c) => (i ? toVal(r[c] ?? "") : r[c] ?? ""))) });
  });
  const stats = [...box.querySelectorAll(".stat")].map((s) => [s.querySelector(".label")?.textContent.trim(), s.querySelector(".value")?.textContent.replace(/\s+/g, " ").trim(), s.querySelector(".note")?.textContent.replace(/\s+/g, " ").trim() || ""]).filter((r) => r[0]);
  if (stats.length) sheets.unshift({ name: "Summary", rows: [["Figure", "Value", "Note"], ...stats.map(([a, b, c]) => [a, toVal(b), c])] });
  return { title, sheets };
}
async function exportPage() {
  const { title, sheets } = pageSheets(); const k = dsFor(S.view.name);
  if (k && dsAllowed(k)) { const d = DS[k]; for (const s of sheets) if (s.page && s.name.toLowerCase() === d.label.toLowerCase()) s.name += " (as shown)"; sheets.unshift({ name: d.label, rows: [d.cols.map(colName), ...d.rows().map((r) => r.map((v) => v ?? ""))] }); }
  const ok = await saveBook(`${slug(pageLabel())}-${todayISO()}.xlsx`, sheets); if (ok) toast("Excel file ready.");
}

/* ---------- datasets that can be imported from Excel ---------- */
const colName = (c) => (Array.isArray(c) ? c[0] : c);
const normH = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const byNo = (no) => { no = String(no || "").trim().toLowerCase(); if (!no) return null; for (const e of S.emps.values()) if (String(e.no).toLowerCase() === no) return e; return null; };
const projByCode = (c) => { c = String(c || "").trim().toLowerCase(); if (!c) return null; for (const p of S.projects.values()) if (String(p.code).toLowerCase() === c) return p; return null; };
const deptByCode = (c) => { c = String(c || "").trim().toLowerCase(); return c ? (S.org.departments || []).find((d) => d.code.toLowerCase() === c || d.name.toLowerCase() === c) : null; };
const empNo = (id) => S.emps.get(id)?.no || "";
const empNm = (id) => { const e = S.emps.get(id); return e ? fullName(e) : ""; };
const numv = (s) => { const v = Number(String(s ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(v) ? v : 0; };
const pickK = (list, s) => { s = String(s || "").trim().toLowerCase(); if (!s) return null; const f = list.find(([c, l]) => String(c).toLowerCase() === s || String(l).toLowerCase() === s) || list.find(([, l]) => String(l).toLowerCase().startsWith(s)); return f ? f[0] : null; };
const mapList = (m) => Object.entries(m).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
const lbl = (m, k) => (Array.isArray(m[k]) ? m[k][0] : m[k]) || k || "";
const dateIn = (s) => { s = String(s || "").trim(); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; const d = new Date(s); return isNaN(d) ? null : PAY.iso(d); };
const pidIn = (s) => { s = String(s || "").trim(); if (/^\d{4}-\d{2}-[12]$/.test(s)) return s; const d = dateIn(s); return d ? PAY.periodOf(d) : null; };
const tsPid = () => S.periodId || curPeriod();

/* Each dataset: label, module group, the pages it belongs to, columns, current rows for export, read(row) for one imported row, save(list). */
const DS = {
  employees: { label: "Employees", group: "People", pages: ["employees", "employee", "import"],
    cols: ["Employee No", "First Name", "Middle Name", "Last Name", "Suffix", "Title", "Position", "Department", "Status", "Hire Date", "Birth Date", "Sex", "Civil Status", "Mobile", "Email", "Address", "TIN", "SSS", "PhilHealth", "Pag-IBIG", "Pay Type", "Basic Pay", "Project Code"],
    note: "Adds new employees. Rows whose Employee No already exists are skipped, so change existing 201 files on the employee's page.",
    rows: () => [...S.emps.values()].filter((e) => !e.separated).sort((a, b) => String(a.no).localeCompare(String(b.no))).map((e) => [e.no, e.first, e.middle, e.last, e.suffix, e.title, pos(e.posId)?.title, dept(e.deptId)?.name, STATUS[e.status]?.[0], e.hire, e.birth, e.gender === "F" ? "Female" : e.gender === "M" ? "Male" : "", e.civil, e.mobile, e.email, e.address, e.tin, e.sss, e.philhealth, e.pagibig, e.payType === "DAILY" ? "Daily" : "Monthly", e.basicPay, S.projects.get(e.projectId)?.code]) },
  projects: { label: "Projects", group: "People", pages: ["projects", "project", "projcodes"], key: "Project Code",
    cols: ["Project Code", "Project Name", "Client", "Location", "Region", "Status", "Start Date", "End Date", "Description"],
    note: "Rows with an existing project code update that project; new codes are added.",
    rows: () => [...S.projects.values()].sort((a, b) => a.code.localeCompare(b.code)).map((p) => [p.code, p.name, p.client, p.location, p.region, lbl(PSTATUS, p.status), p.start, p.end, p.description]),
    read(g, v) {
      const code = g("Project Code"), name = g("Project Name"); const prev = projByCode(code);
      if (!code) return "needs a Project Code."; if (!name && !prev) return "needs a Project Name.";
      return { ...(prev || { id: uid(), req: {}, managerId: null }), code, name: name || prev.name, client: v("Client", prev?.client), location: v("Location", prev?.location), region: v("Region", prev?.region),
        status: pickK(mapList(PSTATUS), g("Status")) || prev?.status || "PLANNING", start: dateIn(g("Start Date")) || prev?.start || null, end: dateIn(g("End Date")) || prev?.end || null, description: v("Description", prev?.description), _upd: !!prev };
    },
    async save(list, prog) { let n = 0; for (const p of list) { const { id, _upd, ...body } = p; await S.db.doc("projects/" + id).set(JSON.parse(JSON.stringify(body))); S.projects.set(id, { id, ...body }); prog(++n); } } },
  departments: { label: "Departments", group: "People", pages: ["org", "orgho", "orgprj"],
    cols: ["Code", "Department", "Type"], note: "Type is Head Office or Project. Existing codes are renamed; new codes are added.",
    rows: () => (S.org.departments || []).map((d) => [d.code, d.name, isPrjDept(d) ? "Project" : "Head Office"]),
    read(g) { const code = g("Code").toUpperCase(), name = g("Department"); if (!code || !name) return "needs a Code and a Department name."; return { code, name, kind: /proj|site|prj/i.test(g("Type")) ? "project" : "ho" }; },
    async save(list) { const org = JSON.parse(JSON.stringify(S.org)); for (const x of list) { const d = org.departments.find((y) => y.code.toUpperCase() === x.code); if (d) Object.assign(d, x); else org.departments.push({ id: uid(), ...x }); } await S.db.doc("org/main").set(org); S.org = org; } },
  positions: { label: "Positions", group: "People", pages: [],
    cols: ["Position", "Department Code"], note: "Adds positions that don't exist yet under the department given.",
    rows: () => (S.org.positions || []).map((p) => [p.title, dept(p.deptId)?.code]),
    read(g) { const title = g("Position"); if (!title) return "needs a Position."; const d = deptByCode(g("Department Code")); if (g("Department Code") && !d) return `department ${g("Department Code")} isn't set up.`; return { title, deptId: d?.id || null }; },
    async save(list) { const org = JSON.parse(JSON.stringify(S.org)); for (const x of list) if (!org.positions.some((p) => p.title.toLowerCase() === x.title.toLowerCase() && p.deptId === x.deptId)) org.positions.push({ id: uid(), ...x }); await S.db.doc("org/main").set(org); S.org = org; } },
  timesheet: { label: "Time sheet", group: "Timekeeping", pages: ["attendance", "dtr", "tk", "punches", "payroll", "timeSettings"],
    get title() { return `Time sheet for ${PAY.period(tsPid()).label}`; },
    get cols() { return ["Employee No", "Employee Name", ...PAY.FIELDS.map(([, l]) => l)]; },
    get note() { return `Fills the time sheet for the pay period chosen on the page (${PAY.period(tsPid()).label}). Blank cells leave the current value.`; },
    rows: () => { const doc = periodDoc(tsPid()); return active().sort((a, b) => String(a.no).localeCompare(String(b.no))).map((e) => [e.no, fullName(e), ...PAY.FIELDS.map(([k]) => doc.rows?.[e.id]?.[k] || 0)]); },
    read(g) { if (isFinal(tsPid())) return "this payroll is already final. Reopen it first."; const e = byNo(g("Employee No")); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const r = {}; for (const [k, l] of PAY.FIELDS) { const x = g(l); if (x !== "" && x != null) r[k] = Math.max(0, numv(x)); } return { empId: e.id, r }; },
    async save(list) { const patch = {}; for (const x of list) patch[x.empId] = { ...(patch[x.empId] || {}), ...x.r }; await savePeriodRows(tsPid(), patch); } },
  leave: { label: "Leave", group: "Timekeeping", pages: ["leave"],
    cols: ["Employee No", "Employee Name", "Leave Type", "From", "To", "Days", "Status", "Reason", "Filed"], note: "Adds leave requests. Days are worked out from the dates when left blank.",
    rows: () => allLeaves().sort((a, b) => (b.from || "").localeCompare(a.from || "")).map((l) => [empNo(l.empId), empNm(l.empId), leaveType(l.type)?.name || l.type, l.from, l.to, l.days, lbl(LSTATUS, l.status), l.reason, l.filed]),
    read(g, v, seen) {
      const e = byNo(g("Employee No")); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const type = pickK(SET().leaveTypes.map((t) => [t.code, t.name]), g("Leave Type")); if (!type) return `leave type "${g("Leave Type")}" isn't set up.`;
      const from = dateIn(g("From")); const to = dateIn(g("To")) || from; if (!from) return "needs a From date."; if (to < from) return "the To date is before the From date.";
      const status = pickK(mapList(LSTATUS), g("Status")) || "PENDING";
      if (status === "APPROVED" && isFinal(PAY.periodOf(from))) return "payroll for that period is final; file it as pending.";
      const clash = [...allLeaves(), ...seen].find((l) => l.empId === e.id && ["PENDING", "APPROVED"].includes(l.status) && l.from <= to && l.to >= from);
      if (clash) return `${fullName(e)} already has leave on ${fmtDate(clash.from)}.`;
      const d = { empId: e.id, type, from, to, half: false, reason: g("Reason") || "", status };
      const days = numv(g("Days")) || PAY.leaveDays(d, SET(), leaveType(type)); if (!days) return "those dates are rest days or holidays only.";
      const item = { ...d, days, filed: dateIn(g("Filed")) || todayISO(), decided: status === "PENDING" ? null : todayISO() }; seen.push(item); return item;
    },
    async save(list) { const byM = {}; for (const x of list) (byM[x.from.slice(0, 7)] ||= {})[uid()] = x; for (const [m, items] of Object.entries(byM)) { if (S.leaveDocs.has(m)) await S.db.doc("leaves/" + m).update({ items }); else await S.db.doc("leaves/" + m).set({ month: m, items }); } } },
  otreqs: { label: "Overtime requests", group: "Timekeeping", pages: ["ot", "otForm"], col: "otreqs",
    cols: ["Employee No", "Employee Name", "Date", "Hours", "Reason", "Status", "Record ID"],
    rows: () => listOf(S.otReqs || new Map()).sort((a, b) => (b.d || "").localeCompare(a.d || "")).map((r) => [empNo(r.empId), empNm(r.empId), r.d, r.hours, r.reason, lbl(OT_STATUS, r.status), r.id]),
    read(g, v, _s, prev) {
      const e = byNo(g("Employee No")) || S.emps.get(prev?.empId); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const d = dateIn(g("Date")) || prev?.d; const hours = numv(g("Hours")) || prev?.hours; if (!d || !(hours > 0)) return "needs a Date and Hours.";
      const status = pickK(mapList(OT_STATUS), g("Status")) || prev?.status || "PENDING";
      return { ...(prev || { id: uid(), filed: todayISO() }), empId: e.id, d, hours: PAY.r2(hours), reason: v("Reason", prev?.reason) || "", status, decided: status === "PENDING" ? null : prev?.decided || todayISO() };
    } },
  loans: { label: "Loans", group: "Payroll", pages: ["loans", "loan"], col: "loans",
    cols: ["Employee No", "Employee Name", "Loan Type", "Reference", "Date Granted", "Principal", "Paid Before", "Deduction per Cutoff", "First Deduction Period", "Status", "Notes", "Record ID"],
    note: "First Deduction Period is like 2026-10-1 (1st to 15th) or 2026-10-2 (16th to end), or any date in that cutoff.",
    rows: () => listOf(S.loans).map((l) => [empNo(l.empId), empNm(l.empId), LTYPE[l.type] || l.type, l.ref, l.granted, l.principal, l.paidBefore, l.amort, l.start, lbl(LSTAT, l.status), l.notes, l.id]),
    read(g, v, _s, prev) {
      const e = byNo(g("Employee No")) || S.emps.get(prev?.empId); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const type = pickK(PAY.LOAN_TYPES, g("Loan Type")) || prev?.type; if (!type) return `loan type "${g("Loan Type")}" isn't recognized.`;
      const principal = numv(g("Principal")) || prev?.principal; const amort = numv(g("Deduction per Cutoff")) || prev?.amort; if (!(principal > 0) || !(amort > 0)) return "needs the Principal and the Deduction per Cutoff.";
      return { ...(prev || { id: uid(), payments: {}, status: "ACTIVE" }), empId: e.id, type, ref: v("Reference", prev?.ref), granted: dateIn(g("Date Granted")) || prev?.granted || null, principal, paidBefore: g("Paid Before") ? numv(g("Paid Before")) : prev?.paidBefore || 0, amort,
        start: pidIn(g("First Deduction Period")) || prev?.start || curPeriod(), status: pickK(mapList(LSTAT), g("Status")) || prev?.status || "ACTIVE", notes: v("Notes", prev?.notes) };
    } },
  flex: { label: "FlexBen claims", group: "Payroll", pages: ["flex"], col: "flex",
    cols: ["Employee No", "Employee Name", "Year", "Item", "Amount", "Date", "Note", "Status", "Record ID"], note: "New claims come in as Waiting. Approve them on the FlexBen page so each is paid in the right payroll.",
    rows: () => listOf(S.flex).map((c) => [empNo(c.empId), empNm(c.empId), c.year, (SET().flexItems || []).find((i) => i.code === c.item)?.name || c.item, c.amt, c.d, c.note, lbl(FSTAT, c.status), c.id]),
    read(g, v, _s, prev) {
      const e = byNo(g("Employee No")) || S.emps.get(prev?.empId); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const item = pickK((SET().flexItems || []).map((i) => [i.code, i.name]), g("Item")) || prev?.item; if (!item) return `FlexBen item "${g("Item")}" isn't set up.`;
      const amt = numv(g("Amount")) || prev?.amt; if (!(amt > 0)) return "needs an Amount.";
      const d = dateIn(g("Date")) || prev?.d || todayISO();
      return { ...(prev || { id: uid(), receipt: null, status: "PENDING", filed: todayISO() }), empId: e.id, year: String(g("Year") || prev?.year || d.slice(0, 4)), item, amt: PAY.r2(amt), d, note: v("Note", prev?.note) };
    } },
  jobs: { label: "Jobs", group: "Talent", pages: ["hiring", "hireho", "hireprj", "job"], col: "jobs",
    cols: ["Job Title", "Position", "Department Code", "Project Code", "People Needed", "Employment Type", "Pay Type", "Rate", "Status", "Date Opened", "Description", "Record ID"],
    rows: () => listOf(S.jobs).map((j) => [j.title, pos(j.posId)?.title, dept(j.deptId)?.code, S.projects.get(j.projectId)?.code, j.slots, lbl(STATUS, j.empType), j.payType === "DAILY" ? "Daily" : "Monthly", j.rate, lbl(JSTATUS, j.status), j.opened, j.desc, j.id]),
    read(g, v, _s, prev) {
      const title = g("Job Title") || prev?.title; if (!title) return "needs a Job Title.";
      const p = g("Position") ? (S.org.positions || []).find((x) => x.title.toLowerCase() === g("Position").toLowerCase()) : null;
      const pr = projByCode(g("Project Code")); if (g("Project Code") && !pr) return `project ${g("Project Code")} isn't on file.`;
      return { ...(prev || { id: uid(), mgrId: null }), title, posId: p?.id || prev?.posId || null, deptId: deptByCode(g("Department Code"))?.id || prev?.deptId || null, projectId: pr?.id || (g("Project Code") === "" ? prev?.projectId || null : null),
        slots: Math.max(1, Math.floor(numv(g("People Needed")) || prev?.slots || 1)), empType: pickK(mapList(STATUS), g("Employment Type")) || prev?.empType || "PROBATIONARY", payType: /^d/i.test(g("Pay Type")) ? "DAILY" : g("Pay Type") ? "MONTHLY" : prev?.payType || "MONTHLY",
        rate: numv(g("Rate")) || prev?.rate || 0, status: pickK(mapList(JSTATUS), g("Status")) || prev?.status || "OPEN", opened: dateIn(g("Date Opened")) || prev?.opened || todayISO(), desc: v("Description", prev?.desc) };
    } },
  applicants: { label: "Applicants", group: "Talent", pages: ["applicant"], col: "applicants",
    cols: ["Job Title", "First Name", "Middle Name", "Last Name", "Mobile", "Email", "Address", "Birth Date", "Sex", "Source", "Date Applied", "Expected Rate", "Notes", "Record ID"],
    note: "Job Title must match an open job on the Recruitment page.",
    rows: () => listOf(S.apps).map((a) => [S.jobs.get(a.jobId)?.title, a.first, a.middle, a.last, a.mobile, a.email, a.address, a.birth, a.gender === "F" ? "Female" : a.gender === "M" ? "Male" : "", a.source, a.applied, a.expRate, a.notes, a.id]),
    read(g, v, _s, prev) {
      const jt = g("Job Title").toLowerCase(); const j = jt ? listOf(S.jobs).filter((x) => x.title.toLowerCase() === jt).sort((a, b) => (a.status === "OPEN" ? -1 : 1))[0] : S.jobs.get(prev?.jobId);
      if (!j) return `job "${g("Job Title")}" isn't on the Recruitment page.`;
      const first = g("First Name") || prev?.first, last = g("Last Name") || prev?.last; if (!first || !last) return "needs a First Name and Last Name.";
      const applied = dateIn(g("Date Applied")) || prev?.applied || todayISO();
      return { ...(prev || { id: uid(), stage: "APPLIED", stageAt: applied, ivs: [], reqs: {} }), jobId: j.id, first, middle: v("Middle Name", prev?.middle), last, mobile: v("Mobile", prev?.mobile), email: v("Email", prev?.email), address: v("Address", prev?.address),
        birth: dateIn(g("Birth Date")) || prev?.birth || null, gender: /^f/i.test(g("Sex")) ? "F" : /^m/i.test(g("Sex")) ? "M" : prev?.gender || null, source: v("Source", prev?.source), applied, expRate: numv(g("Expected Rate")) || prev?.expRate || null, notes: v("Notes", prev?.notes) };
    } },
  property: { label: "Company assets", group: "Talent", pages: ["property", "asset"], col: "property", seq: true,
    cols: ["Tag", "Kind", "Item", "Serial No", "Value", "Date Bought", "Status", "Holder Employee No", "Notes"], note: "Rows with an existing tag update that item. Leave Tag blank to number new items automatically.",
    rows: () => listOf(S.prop).sort((a, b) => (a.tag || "").localeCompare(b.tag || "")).map((x) => [x.tag, x.kind, x.name, x.serial, x.value, x.bought, lbl(ASTATUS, x.status), empNo(x.holderId), x.notes]),
    read(g, v) {
      const tag = g("Tag").toUpperCase(); const prev = tag ? listOf(S.prop).find((x) => x.tag === tag) : null; const name = g("Item") || prev?.name; if (!name) return "needs the Item.";
      const kind = pickK(AKINDS.map(([k]) => [k, k]), g("Kind")) || prev?.kind || "Other"; const h = g("Holder Employee No") ? byNo(g("Holder Employee No")) : null; if (g("Holder Employee No") && !h) return `employee no. ${g("Holder Employee No")} isn't on file.`;
      const status = h ? "ASSIGNED" : pickK(mapList(ASTATUS), g("Status")) || prev?.status || "AVAILABLE";
      return { ...(prev || { id: uid(), status: "AVAILABLE", holderId: null, since: null, hist: [] }), tag, kind, name, serial: v("Serial No", prev?.serial), value: numv(g("Value")) || prev?.value || 0, bought: dateIn(g("Date Bought")) || prev?.bought || null, notes: v("Notes", prev?.notes),
        status, holderId: h ? h.id : status === "ASSIGNED" ? prev?.holderId || null : null, since: h && h.id !== prev?.holderId ? todayISO() : prev?.since || null };
    },
    async save(list, prog) { let n = 0; for (const x of list) { if (!x.tag) x.tag = nextTag(x.kind); x.hist = [...(x.hist || []), { d: todayISO(), text: "Updated from an Excel import" }]; await put("property", x); prog(++n); } } },
  courses: { label: "Courses", group: "Training", pages: ["trcourses", "course"], col: "courses",
    cols: ["Code", "Course", "Provider", "Hours", "Valid (months)", "Required For"], note: "Required For is Everyone, Everyone on a project site, Head office staff, or Specific positions. Existing codes update that course.",
    rows: () => listOf(S.courses).sort((a, b) => a.code.localeCompare(b.code)).map((c) => [c.code, c.title, c.provider, c.hours, c.valid, lbl(Object.fromEntries(SCOPES), c.scope)]),
    read(g, v) {
      const code = g("Code").toUpperCase().slice(0, 8); const prev = listOf(S.courses).find((c) => c.code === code); const title = g("Course") || prev?.title; if (!code || !title) return "needs a Code and the Course name.";
      const valid = g("Valid (months)") !== "" && g("Valid (months)") != null ? Math.max(0, Math.floor(numv(g("Valid (months)")))) : prev?.valid || 0;
      return { ...(prev || { id: uid(), recs: {}, pos: [] }), code, title, provider: v("Provider", prev?.provider), hours: numv(g("Hours")) || prev?.hours || null, valid, scope: pickK(SCOPES, g("Required For")) || prev?.scope || "ALL" };
    } },
  trainrecs: { label: "Training records", group: "Training", pages: ["training", "trhome", "trsessions"],
    cols: ["Course Code", "Course", "Employee No", "Employee Name", "Completed", "Expires"], note: "Records who completed which course. Expiry is worked out from the course's validity when blank.",
    rows: () => listOf(S.courses).flatMap((c) => Object.entries(c.recs || {}).map(([id, r]) => [c.code, c.title, empNo(id), empNm(id), r.d, r.exp])),
    read(g) {
      const c = listOf(S.courses).find((x) => x.code.toLowerCase() === g("Course Code").toLowerCase()); if (!c) return `course ${g("Course Code") || "(blank)"} isn't in the catalog.`;
      const e = byNo(g("Employee No")); if (!e) return `employee no. ${g("Employee No") || "(blank)"} isn't on file.`;
      const d = dateIn(g("Completed")); if (!d) return "needs the Completed date.";
      return { cid: c.id, empId: e.id, d, exp: dateIn(g("Expires")) || (c.valid ? addMonths(d, c.valid) : null) };
    },
    async save(list) { const by = {}; for (const x of list) (by[x.cid] ||= []).push(x); for (const [cid, xs] of Object.entries(by)) { const c = S.courses.get(cid); const recs = { ...(c.recs || {}) }; for (const x of xs) recs[x.empId] = { ...(recs[x.empId] || {}), d: x.d, exp: x.exp }; await put("courses", { ...c, recs }); } } },
  trmaterials: { label: "Training materials", group: "Training", pages: ["trmaterials"], col: "trmaterials",
    cols: ["Title", "Course Code", "Type", "Link", "Description", "Record ID"], note: "Imports links. Upload files one by one on the Training materials page.",
    rows: () => listOf(S.mats || new Map()).map((m) => [m.title, S.courses.get(m.courseId)?.code, MAT[m.type] || m.type, m.url, m.desc, m.id]),
    read(g, v, _s, prev) {
      const title = g("Title") || prev?.title; if (!title) return "needs a Title."; const url = g("Link") || prev?.url || null;
      if (url && !/^https?:\/\/\S+$/i.test(url)) return "the Link must start with https://"; if (!url && !prev?.file) return "needs a Link.";
      const c = g("Course Code") ? listOf(S.courses).find((x) => x.code.toLowerCase() === g("Course Code").toLowerCase()) : null;
      return { ...(prev || { id: uid(), at: todayISO(), file: null }), title, courseId: c?.id || prev?.courseId || null, type: pickK(mapList(MAT), g("Type")) || prev?.type || "LINK", desc: v("Description", prev?.desc), url };
    } },
  osh: { label: "Safety incidents", group: "Compliance", pages: ["safety", "osh"], col: "osh",
    cols: ["Date", "Kind", "Project Code", "Employee No", "Days Lost", "What Happened", "Cause", "Action Taken", "Reported to DOLE", "Record ID"],
    rows: () => listOf(S.osh).sort((a, b) => (b.d || "").localeCompare(a.d || "")).map((x) => [x.d, lbl(OSHK, x.kind), S.projects.get(x.projectId)?.code, empNo(x.empId), x.daysLost, x.desc, x.cause, x.action, x.reported, x.id]),
    read(g, v, _s, prev) {
      const d = dateIn(g("Date")) || prev?.d; const desc = g("What Happened") || prev?.desc; if (!d || !desc) return "needs the Date and What Happened.";
      const e = g("Employee No") ? byNo(g("Employee No")) : null; if (g("Employee No") && !e) return `employee no. ${g("Employee No")} isn't on file.`;
      return { ...(prev || { id: uid() }), d, kind: pickK(mapList(OSHK), g("Kind")) || prev?.kind || "NEAR_MISS", projectId: projByCode(g("Project Code"))?.id || prev?.projectId || null, empId: e?.id || prev?.empId || null,
        daysLost: numv(g("Days Lost")) || prev?.daysLost || 0, reported: dateIn(g("Reported to DOLE")) || prev?.reported || null, desc, cause: v("Cause", prev?.cause), action: v("Action Taken", prev?.action) };
    } },
};
const DS_GROUPS = (k) => DS[k].group;
const dsAllowed = (k) => navAllowed(DS_GROUPS(k)) && (k !== "trmaterials" || !!S.mats) && (k !== "otreqs" || !!S.otReqs);
function dsFor(name) { const b = baseView(name); const sec = SECTION_OF[b] || b; for (const [k, d] of Object.entries(DS)) if (d.pages.includes(b)) return k; for (const [k, d] of Object.entries(DS)) if (d.pages.includes(sec)) return k; return null; }
const dsTitle = (k) => DS[k].title || DS[k].label;

/* ---------- modal ---------- */
function openModal(html, kind) {
  let m = $("#io-modal"); if (!m) { m = document.createElement("div"); m.id = "io-modal"; m.className = "io-modal"; document.body.appendChild(m); }
  m.innerHTML = `<div class="io-dlg" role="dialog" aria-modal="true" aria-labelledby="io-title">${html}</div>`; m.hidden = false;
  S.io = { ...(S.io || {}), kind, view: S.view.name };
  setTimeout(() => m.querySelector(".io-dlg select, .io-dlg .io-drop, .io-dlg button")?.focus(), 0);
}
function closeModal() { const m = $("#io-modal"); if (m) { m.hidden = true; m.innerHTML = ""; } S.io = null; importRows = null; }
const modalHead = (t, sub = "") => `<div class="io-top"><div><h2 id="io-title">${t}</h2>${sub ? `<p class="t-muted">${sub}</p>` : ""}</div><button class="io-x" data-io="close" aria-label="Close">×</button></div>`;
const dropZone = (id, accept, text, multiple) => `<label class="io-drop" id="${id}-drop" tabindex="0">${icon("upload", 26)}<b>${text}</b><span class="t-muted">or click to choose a file</span><input type="file" id="${id}" accept="${accept}" ${multiple ? "multiple" : ""} hidden></label>`;

/* ---------- import ---------- */
let importRows = null;
function importModal(k) {
  const keys = Object.keys(DS).filter(dsAllowed); if (!keys.length) { toast("Your role has no records to import."); return; }
  k = keys.includes(k) ? k : keys.includes(dsFor(S.view.name)) ? dsFor(S.view.name) : keys[0]; const d = DS[k];
  openModal(modalHead("Import from Excel", "Drop an Excel (.xlsx, .xls) or CSV file. You'll see a preview before anything is saved.") + `
    <div class="field"><label for="io-ds">Import into</label><select class="input" id="io-ds">${keys.map((x) => `<option value="${x}" ${x === k ? "selected" : ""}>${esc(dsTitle(x))}</option>`).join("")}</select></div>
    <div class="io-cols"><span class="t-muted">Columns:</span> ${d.cols.map((c) => `<span class="chip c-gray">${esc(colName(c))}</span>`).join(" ")}</div>
    ${d.note ? `<p class="t-muted io-note">${esc(d.note)}</p>` : ""}
    <div><button class="btn btn-ghost btn-sm" data-io="tpl">${icon("download", 16)}Download template</button> <span class="t-muted" style="font-size:13px">Export to Excel gives the current records in the same layout.</span></div>
    ${dropZone("io-file", ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv", "Drag and drop your Excel file here")}
    <div id="io-prev" aria-live="polite"></div>${k === "employees" ? '<div id="imp-preview"></div>' : ""}`, "import");
  S.io.ds = k;
}
/* Cell values as plain text; date cells become YYYY-MM-DD whatever the sheet's own date format. */
function sheetRows(X, ws) {
  if (!ws?.["!ref"]) return []; const r = X.utils.decode_range(ws["!ref"]); const out = [];
  for (let y = r.s.r; y <= Math.min(r.e.r, r.s.r + 20000); y++) {
    const row = [];
    for (let x = r.s.c; x <= Math.min(r.e.c, r.s.c + 80); x++) {
      const c = ws[X.utils.encode_cell({ r: y, c: x })]; let v = "";
      if (c) { if (c.t === "n" && c.z && X.SSF.is_date(c.z)) { const d = X.SSF.parse_date_code(c.v); v = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
        else if (c.t === "d" && c.v instanceof Date) v = PAY.iso(c.v); else if (c.t === "n") v = String(Math.round(c.v * 1e6) / 1e6); else if (c.t === "b") v = c.v ? "Yes" : "No"; else v = c.w ?? String(c.v ?? ""); }
      row.push(v);
    }
    if (row.some((v) => String(v).trim())) out.push(row);
  }
  return out;
}
async function readSheet(file) {
  const X = await loadLib("xlsx"); const buf = await file.arrayBuffer();
  const wb = X.read(buf, { type: "array", cellDates: false, cellNF: true });
  const d = DS[S.io.ds]; const want = new Set(d.cols.map((c) => normH(colName(c))));
  let best = null;
  for (const n of wb.SheetNames) {
    const rows = sheetRows(X, wb.Sheets[n]);
    for (let h = 0; h < Math.min(6, rows.length); h++) { const hits = rows[h].filter((c) => want.has(normH(c))).length; if (hits && (!best || hits > best.hits)) best = { hits, rows: rows.slice(h), sheet: n }; }
  }
  return best;
}
async function previewFile(file) {
  const box = $("#io-prev"); if (!box || !S.io) return; const k = S.io.ds; const d = DS[k];
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { box.innerHTML = '<p class="err">Choose an Excel (.xlsx or .xls) or CSV file.</p>'; return; }
  box.innerHTML = `<p class="t-muted">Reading ${esc(file.name)}…</p>`;
  let got; try { got = await readSheet(file); } catch { box.innerHTML = '<p class="err">Couldn\'t read that file. Check that it opens in Excel, or check your connection.</p>'; return; }
  if (!got || got.rows.length < 2) { box.innerHTML = `<p class="err">No sheet in ${esc(file.name)} has the ${esc(d.label.toLowerCase())} columns with rows under them. Download the template to see the layout.</p>`; return; }
  const H = got.rows[0].map(normH); const body = got.rows.slice(1).filter((r) => r.some((x) => String(x).trim()));
  if (k === "employees") { box.innerHTML = `<p class="t-muted" style="margin:0">From sheet <b>${esc(got.sheet)}</b>.</p>`; previewImport(toCSV(got.rows.slice(0, 1).concat(body))); return; }
  const items = [], problems = [], seen = []; const col = d.col ? S[TCOLS[d.col]] : null; let upd = 0;
  body.forEach((r, i) => {
    const g = (h) => { const j = H.indexOf(normH(h)); return j < 0 ? null : String(r[j] ?? "").trim(); };
    const gs = (h) => g(h) ?? "";
    const v = (h, pv) => { const x = g(h); return x == null ? pv ?? null : x || null; };
    const prev = col && g("Record ID") ? col.get(g("Record ID")) || null : null;
    const out = d.read(gs, v, seen, prev);
    if (typeof out === "string") problems.push(`Row ${i + 2}: ${out}`); else { if (prev || out._upd) upd++; items.push(out); }
  });
  importRows = items;
  const show = body.slice(0, 5); const cols = got.rows[0].map((h, j) => [h, j]).filter(([h]) => String(h).trim()).slice(0, 6);
  box.innerHTML = `<p style="margin:0;font-weight:700">${items.length} ${items.length === 1 ? "row" : "rows"} ready${upd ? ` (${upd} update existing records)` : ""} from sheet ${esc(got.sheet)}.</p>
    ${problems.length ? `<ul class="err io-probs">${problems.slice(0, 8).map((p) => `<li>${esc(p)}</li>`).join("")}${problems.length > 8 ? `<li>…and ${problems.length - 8} more</li>` : ""}</ul>` : ""}
    ${items.length ? `<div class="table-wrap"><table><thead><tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${show.map((r) => `<tr>${cols.map(([, j]) => `<td>${esc(r[j])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="io-actions"><button class="btn btn-primary" data-io="run">Import ${items.length} ${items.length === 1 ? "row" : "rows"}</button><span id="io-progress" class="t-muted"></span></div>` : ""}`;
}
async function runIOImport(btn) {
  const items = importRows; const k = S.io?.ds; if (!items?.length || !k) return; const d = DS[k];
  btn.disabled = true; const prog = $("#io-progress"); const say = (n) => { if (prog) prog.textContent = `${n} of ${items.length} saved…`; };
  try {
    if (d.save) await d.save(items, say);
    else if (d.seq) { let n = 0; for (const x of items) { await put(d.col, x); say(++n); } }
    else for (let i = 0; i < items.length; i += 8) { await Promise.all(items.slice(i, i + 8).map((x) => { const { _upd, ...rec } = x; return put(d.col, rec); })); say(Math.min(items.length, i + 8)); }
    logActivity(`Imported ${items.length} ${d.label.toLowerCase()} rows from Excel`); toast(`${items.length} ${items.length === 1 ? "row" : "rows"} imported.`); closeModal(); S.ver++; render();
  } catch (x) { if (prog) prog.innerHTML = `<span class="err">${x?.code === "quota_exceeded" ? "The database is full; some rows were not saved." : "Import stopped partway. Rows saved so far are kept."}</span>`; btn.disabled = false; }
}

/* ---------- attachments ---------- */
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|pdf|csv|md|json|txt)$/i;
const CHUNK_EXT = /\.(docx|xlsx|pptx|zip)$/i;
const OLD_EXT = /\.(doc|xls|ppt|rtf)$/i;
const CHUNK = 180000, CHUNK_MAX = 5 * 1024 * 1024;
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
function attModal() {
  const k = attKey(); const list = attsFor(k); const title = pageLabel();
  const ed = S.canEdit && S.assets;
  openModal(modalHead("Attachments", `Files kept with <b>${esc(title)}</b>.`) + `
    ${ed ? dropZone("io-att", "image/*,video/*,application/pdf,text/plain,text/csv,text/markdown,application/json,.docx,.xlsx,.pptx,.zip", "Drag and drop files here", true) + '<p class="t-muted io-note">PDF, images, video and text up to 20 MB each. Word, Excel, PowerPoint (.docx, .xlsx, .pptx) and ZIP up to 5 MB each.</p><div id="io-att-msg" aria-live="polite"></div>' : ""}
    ${list.length ? `<ul class="io-list">${list.map((a) => `<li>${icon(/\.pdf$/i.test(a.name) ? "pdf" : /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name) ? "camera" : "file", 20)}
      <span class="io-fn">${a.asset ? `<a href="/_blob/${esc(a.asset)}" target="_blank" rel="noopener">${esc(a.name)}</a>` : `<button class="link" data-io-get="${a.id}">${esc(a.name)}</button>`}<small class="t-muted">${fmtSize(a.size || 0)} · ${esc(fmtDate((a.at || "").slice(0, 10)))}${a.by ? ` · ${esc(a.by)}` : ""}</small></span>
      ${a.asset ? `<a class="btn btn-ghost btn-sm" href="/_blob/${esc(a.asset)}" target="_blank" rel="noopener">Open</a>` : `<button class="btn btn-ghost btn-sm" data-io-get="${a.id}">Download</button>`}
      ${S.canEdit ? `<button class="btn btn-danger btn-sm" data-io-del="${a.id}">Delete</button>` : ""}</li>`).join("")}</ul>` : `<div class="empty-state"><span class="es-ic">${icon("clip", 22)}</span><p>No files attached to this page yet.${ed ? "" : S.canEdit ? " File uploads work when the app is opened on claude.ai." : ""}</p></div>`}`, "att");
}
const b64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = no; r.readAsDataURL(file); });
async function uploadAtts(files) {
  const msg = $("#io-att-msg"); const k = attKey(); let done = 0; const bad = [];
  for (const f of files) {
    if (msg) msg.innerHTML = `<p class="t-muted">Uploading ${esc(f.name)}…</p>`;
    const base = { id: uid(), page: k, name: f.name.slice(0, 160), size: f.size, type: f.type || "", at: new Date().toISOString(), by: S.meName || null };
    try {
      if (ASSET_EXT.test(f.name)) { if (f.size > 20 * 1048576) { bad.push(`${f.name} is over 20 MB.`); continue; } const up = await S.assets.upload(f); await put("attachments", { ...base, asset: up.id }); }
      else if (CHUNK_EXT.test(f.name)) {
        if (f.size > CHUNK_MAX) { bad.push(`${f.name} is over 5 MB. Save it as PDF, or zip it smaller.`); continue; }
        const s = await b64(f); const n = Math.ceil(s.length / CHUNK);
        for (let i = 0; i < n; i++) await S.db.doc(`attparts/${base.id}-${i}`).set({ b: s.slice(i * CHUNK, (i + 1) * CHUNK) });
        await put("attachments", { ...base, parts: n });
      } else { bad.push(OLD_EXT.test(f.name) ? `${f.name} is an older Office format. Save it as .docx, .xlsx, .pptx or PDF first.` : `${f.name} isn't a supported file type.`); continue; }
      done++;
    } catch (x) { bad.push(x?.code === "quota_exceeded" ? `${f.name}: storage is full.` : x?.code === "unsupported_type" ? `${f.name} isn't a supported file type.` : `${f.name} couldn't be uploaded.`); }
  }
  if (done) logActivity(`Attached ${done} ${done === 1 ? "file" : "files"} to ${pageLabel()}`);
  attModal(); render();
  const m2 = $("#io-att-msg"); if (m2) m2.innerHTML = (done ? `<p class="t-ok" style="margin:0">${done} ${done === 1 ? "file" : "files"} attached.</p>` : "") + (bad.length ? `<ul class="err io-probs">${bad.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "");
}
async function getAtt(id) {
  const a = S.atts.get(id); if (!a?.parts) return;
  try {
    let s = ""; for (let i = 0; i < a.parts; i++) { const d = await S.db.doc(`attparts/${a.id}-${i}`).get(); s += d.exists ? d.data().b || "" : ""; }
    const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await saveBlob(a.name, new Blob([u8], { type: a.type || "application/octet-stream" }));
  } catch { toast("Couldn't download that file. Try again."); }
}
async function delAtt(id) {
  const a = S.atts.get(id); if (!a) return;
  await drop("attachments", id);
  if (a.asset) { try { await S.assets?.delete(a.asset); } catch {} }
  for (let i = 0; i < (a.parts || 0); i++) { try { await S.db.doc(`attparts/${a.id}-${i}`).delete(); } catch {} }
  logActivity(`Deleted the attachment ${a.name}`); attModal(); render();
}
function bootIO(db) {
  db.collection("attachments").limit(3000).onSnapshot((snap) => { S.atts = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); refresh(); if (S.io?.kind === "att" && !$("#io-att-msg")?.textContent) attModal(); }, () => {});
}

/* ---------- monthly report ---------- */
const MONTH_FMT = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" });
const monthLabel = (m) => MONTH_FMT.format(parseISO(m + "-01"));
const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return PAY.iso(new Date(y, mo, 0)); };
const REP_SCOPES = [["all", "All company"], ["ho", "Head Office"], ["prj", "Projects"]];
function reportData(m, sc) {
  const start = m + "-01", end = monthEnd(m); const inM = (d) => !!d && d >= start && d <= end;
  const all = [...S.emps.values()]; const inSc = (e) => !!e && (sc === "all" || (sc === "prj" ? !!e.projectId : !e.projectId));
  const emps = all.filter(inSc); const ids = new Set(emps.map((e) => e.id)); const mine = (id) => ids.has(id);
  const on = (e, d) => e.hire <= d && !(e.separated?.date && e.separated.date < d);
  const startN = emps.filter((e) => e.hire < start && !(e.separated?.date && e.separated.date < start));
  const endN = emps.filter((e) => on(e, end)); const hires = emps.filter((e) => inM(e.hire)); const seps = emps.filter((e) => inM(e.separated?.date));
  const turn = (s, a, b) => (a + b ? PAY.r2((s / ((a + b) / 2)) * 100) : 0);
  const R = { month: m, label: monthLabel(m), scope: REP_SCOPES.find(([k]) => k === sc)[1], company: S.org?.companyName || CO_DEFAULT, kpis: [], sections: [] };
  const add = (group, title, head, rows, fmt = [], note = "") => { if (group && !navAllowed(group)) return; R.sections.push({ title, head, rows, fmt, note }); };
  const kpi = (group, label, value, note = "", f = "n") => { if (group && !navAllowed(group)) return; R.kpis.push({ label, value, note, f }); };

  kpi("People", "Headcount at month end", endN.length, `${startN.length} at the start of the month`);
  kpi("People", "New hires", hires.length); kpi("People", "Separations", seps.length, `Turnover ${turn(seps.length, startN.length, endN.length)}%`);
  const seg = (lab, f) => { const a = startN.filter(f).length, b = endN.filter(f).length, h = hires.filter(f).length, s = seps.filter(f).length; return [lab, a, h, s, b, turn(s, a, b) / 100]; };
  add("People", "Headcount", ["Group", "Start of month", "New hires", "Separations", "End of month", "Turnover"], [
    ...(sc !== "prj" ? [seg("Head Office", (e) => !e.projectId)] : []), ...(sc !== "ho" ? [seg("Projects", (e) => !!e.projectId)] : []), ...(sc === "all" ? [seg("Total", () => true)] : [])], ["t", "n", "n", "n", "n", "p"]);
  const byD = (S.org.departments || []).map((d) => [d.code, d.name, isPrjDept(d) ? "Project" : "Head Office", endN.filter((e) => e.deptId === d.id).length]).filter((r) => r[3]).sort((a, b) => b[3] - a[3]);
  const noD = endN.filter((e) => !dept(e.deptId)).length; if (noD) byD.push(["", "No department", "", noD]);
  add("People", "Headcount by department", ["Code", "Department", "Type", "Headcount"], byD, ["t", "t", "t", "n"]);
  add("People", "Employment status", ["Status", "Headcount", "Share"], Object.keys(STATUS).map((k) => [STATUS[k][0], endN.filter((e) => e.status === k).length]).filter((r) => r[1]).map((r) => [...r, endN.length ? r[1] / endN.length : 0]), ["t", "n", "p"]);
  if (sc !== "ho") {
    const projs = [...S.projects.values()].filter((p) => p.status !== "COMPLETED" || inM(p.end)).sort((a, b) => a.code.localeCompare(b.code));
    add("People", "Manpower per project", ["Code", "Project", "Location", "Status", "Needed", "Assigned", "Filled"], projs.map((p) => { const n = Object.values(p.req || {}).reduce((a, x) => a + x, 0); const h = endN.filter((e) => e.projectId === p.id).length; return [p.code, p.name, p.location || "", lbl(PSTATUS, p.status), n, h, n ? Math.min(1, h / n) : 0]; }), ["t", "t", "t", "t", "n", "n", "p"]);
  }
  const where = (e) => (e.projectId ? S.projects.get(e.projectId)?.name || "Project" : dept(e.deptId)?.name || "Head Office");
  add("People", "New hires", ["Employee No", "Name", "Position", "Department or project", "Hire date"], hires.sort((a, b) => a.hire.localeCompare(b.hire)).map((e) => [e.no, fullName(e), pos(e.posId)?.title || "", where(e), e.hire]), ["t", "t", "t", "t", "d"]);
  add("People", "Separations", ["Employee No", "Name", "Position", "Last day", "Reason"], seps.sort((a, b) => a.separated.date.localeCompare(b.separated.date)).map((e) => [e.no, fullName(e), pos(e.posId)?.title || "", e.separated.date, e.separated.reason || ""]), ["t", "t", "t", "d", "t"]);

  const pids = [m + "-1", m + "-2"];
  const att = pids.map((pid) => { const rows = periodDoc(pid).rows || {}; const t = { abs: 0, late: 0, ut: 0, ot: 0, nd: 0 }; for (const [id, r] of Object.entries(rows)) if (mine(id)) for (const k in t) t[k] += Number(r[k]) || 0; return [PAY.period(pid).label, t.abs, t.late, t.ut, PAY.r2(t.ot), PAY.r2(t.nd)]; });
  att.push(["Month", ...[1, 2, 3, 4, 5].map((i) => PAY.r2(att[0][i] + att[1][i]))]);
  add("Timekeeping", "Attendance", ["Cutoff", "Absent days", "Late (min)", "Undertime (min)", "Overtime (hrs)", "Night diff (hrs)"], att, ["t", "n", "n", "n", "n", "n"], "From the time sheets of each cutoff.");
  const ots = listOf(S.otReqs || new Map()).filter((r) => inM(r.d) && mine(r.empId));
  add("Timekeeping", "Overtime requests", ["Status", "Requests", "Hours"], Object.keys(OT_STATUS).map((k) => { const xs = ots.filter((r) => r.status === k); return [OT_STATUS[k][0], xs.length, PAY.r2(xs.reduce((a, r) => a + (r.hours || 0), 0))]; }), ["t", "n", "n"]);
  kpi("Timekeeping", "Overtime approved", PAY.r2(ots.filter((r) => r.status === "APPROVED").reduce((a, r) => a + (r.hours || 0), 0)), "hours");
  const lvs = allLeaves().filter((l) => inM(l.from) && mine(l.empId));
  add("Timekeeping", "Leave", ["Leave type", "Requests", "Approved days", "Waiting", "Rejected or cancelled"], SET().leaveTypes.map((t) => { const xs = lvs.filter((l) => l.type === t.code); return [t.name, xs.length, PAY.r2(xs.filter((l) => l.status === "APPROVED").reduce((a, l) => a + (l.days || 0), 0)), xs.filter((l) => l.status === "PENDING").length, xs.filter((l) => ["REJECTED", "CANCELLED"].includes(l.status)).length]; }).filter((r) => r[1]), ["t", "n", "n", "n", "n"]);
  kpi("Timekeeping", "Leave days approved", PAY.r2(lvs.filter((l) => l.status === "APPROVED").reduce((a, l) => a + (l.days || 0), 0)));

  for (const pid of pids) ensureRun(pid);
  const T = pids.map((pid) => { const r = payrun(pid); return { pid, final: r.final, t: scopeTotals(r.lines || {}, all.filter(inSc)) }; });
  const sumT = (k) => PAY.r2(T.reduce((a, x) => a + (x.t[k] || 0), 0));
  const payRow = (lab, st, g) => [lab, st, g("count"), g("gross"), PAY.r2(g("sss") + g("ph") + g("hd")), g("tax"), g("loanTot"), g("net"), g("employer"), g("cost")];
  add("Payroll", "Payroll", ["Cutoff", "Status", "Employees", "Gross pay", "Employee contributions", "Withholding tax", "Loan deductions", "Net pay", "Employer share", "Total cost"],
    [...T.map((x) => payRow(PAY.period(x.pid).label, x.final ? "Final" : "Draft", (k) => x.t[k] || 0)), payRow("Month", "", (k) => (k === "count" ? Math.max(T[0].t.count, T[1].t.count) : sumT(k)))], ["t", "t", "n", "m", "m", "m", "m", "m", "m", "m"],
    T.some((x) => !x.final) ? "Draft cutoffs are worked out live from time sheets and can still change." : "");
  kpi("Payroll", "Net payroll", sumT("net"), `Total cost ${money(sumT("cost"))}`, "m");
  add("Payroll", "Government contributions", ["Agency", "Employee share", "Employer share", "Total"], [["SSS (incl. EC)", sumT("sss"), PAY.r2(sumT("sssEr") + sumT("ec"))], ["PhilHealth", sumT("ph"), sumT("phEr")], ["Pag-IBIG", sumT("hd"), sumT("hdEr")]].map((r) => [...r, PAY.r2(r[1] + r[2])]), ["t", "m", "m", "m"]);
  const lns = listOf(S.loans).filter((l) => mine(l.empId));
  add("Payroll", "Loans", ["Item", "Count", "Amount"], [["Active loans, balance left", lns.filter((l) => l.status === "ACTIVE").length, PAY.r2(lns.filter((l) => l.status === "ACTIVE").reduce((a, l) => a + loanBal(l), 0))], ["Deducted in payroll this month", "", sumT("loanTot")], ["New loans granted this month", lns.filter((l) => inM(l.granted)).length, PAY.r2(lns.filter((l) => inM(l.granted)).reduce((a, l) => a + (l.principal || 0), 0))]], ["t", "n", "m"]);
  const fx = listOf(S.flex).filter((c) => inM(c.d) && mine(c.empId));
  add("Payroll", "FlexBen claims", ["Status", "Claims", "Amount"], Object.keys(FSTAT).map((k) => { const xs = fx.filter((c) => c.status === k); return [FSTAT[k][0], xs.length, PAY.r2(xs.reduce((a, c) => a + (c.amt || 0), 0))]; }), ["t", "n", "m"]);

  const jobs = listOf(S.jobs).filter((j) => sc === "all" || (sc === "prj" ? !!j.projectId : !j.projectId)); const jids = new Set(jobs.map((j) => j.id)); const apps = listOf(S.apps).filter((a) => jids.has(a.jobId));
  const openJ = jobs.filter((j) => j.status === "OPEN");
  add("Talent", "Recruitment", ["Item", "Count"], [["Open jobs", openJ.length], ["People still needed on open jobs", openJ.reduce((a, j) => a + Math.max(0, (j.slots || 0) - jobHired(j)), 0)], ["Applicants received this month", apps.filter((a) => inM(a.applied)).length], ["Interviews held this month", apps.reduce((a, x) => a + (x.ivs || []).filter((i) => inM(i.d)).length, 0)], ["Hired this month", apps.filter((a) => a.stage === "HIRED" && inM(a.stageAt)).length], ...STAGES.filter(([k]) => k !== "HIRED").map(([k, l]) => [`Now in ${l.toLowerCase()}`, apps.filter((a) => a.stage === k).length])], ["t", "n"]);
  kpi("Talent", "Open jobs", openJ.length, `${apps.filter((a) => inM(a.applied)).length} applicants this month`);
  const onb = listOf(S.onb).filter((o) => mine(o.empId)), off = listOf(S.offb).filter((o) => mine(o.empId));
  add("Talent", "Onboarding and offboarding", ["Item", "Count"], [["Onboarding started", onb.filter((o) => inM(o.start)).length], ["Onboarding still open", onb.filter((o) => (o.items || []).some((i) => !i.done)).length], ["Offboarding, last day this month", off.filter((o) => inM(o.last)).length], ["Final pay released this month", off.filter((o) => inM(o.released)).length]], ["t", "n"]);
  const revs = listOf(S.reviews).filter((r) => mine(r.empId) && r.status === "DONE" && inM(r.at)); const avg = revs.filter((r) => r.overall).length ? PAY.r2(revs.reduce((a, r) => a + (r.overall || 0), 0) / revs.filter((r) => r.overall).length) : 0;
  const cases = listOf(S.cases).filter((c) => mine(c.empId));
  add("Talent", "Performance and discipline", ["Item", "Count"], [["Reviews completed", revs.length], ["Average rating (1 to 5)", avg], ["Disciplinary cases opened", cases.filter((c) => inM(c.nte)).length], ["Cases decided", cases.filter((c) => inM(c.decision?.d)).length]], ["t", "n"]);
  const props = listOf(S.prop).filter((x) => sc === "all" || (x.holderId ? mine(x.holderId) : sc === "ho"));
  add("Talent", "Company assets", ["Status", "Items", "Value"], Object.keys(ASTATUS).map((k) => { const xs = props.filter((x) => x.status === k); return [ASTATUS[k][0], xs.length, PAY.r2(xs.reduce((a, x) => a + (x.value || 0), 0))]; }).filter((r) => r[1]), ["t", "n", "m"]);

  const tr = listOf(S.courses).map((c) => { const recs = Object.entries(c.recs || {}).filter(([id]) => mine(id)); return [c.code, c.title, recs.filter(([, r]) => inM(r.d)).length, recs.filter(([, r]) => r.exp && r.exp > end && r.exp <= addDays(end, 60)).length, recs.filter(([, r]) => r.exp && r.exp <= end).length]; }).filter((r) => r[2] || r[3] || r[4]);
  add("Training", "Training", ["Code", "Course", "Completed this month", "Expiring within 60 days", "Expired"], tr, ["t", "t", "n", "n", "n"]);
  kpi("Training", "Trainings completed", tr.reduce((a, r) => a + r[2], 0));

  const osh = listOf(S.osh).filter((x) => inM(x.d) && (sc === "all" || (x.empId ? mine(x.empId) : sc === "prj" ? !!x.projectId : !x.projectId)));
  add("Compliance", "Safety (OSH)", ["Kind", "Incidents", "Days lost"], Object.keys(OSHK).map((k) => { const xs = osh.filter((x) => x.kind === k); return [OSHK[k][0], xs.length, xs.reduce((a, x) => a + (x.daysLost || 0), 0)]; }).filter((r) => r[1]), ["t", "n", "n"]);
  kpi("Compliance", "Safety incidents", osh.length, `${osh.reduce((a, x) => a + (x.daysLost || 0), 0)} days lost`);
  let al = []; try { al = alerts(); } catch {}
  add("Compliance", "Compliance alerts", ["Level", "Area", "Alert"], al.slice(0, 40).map((a) => [a.sev === "crit" ? "Urgent" : a.sev === "warn" ? "Soon" : "Info", a.area, a.text]), ["t", "t", "t"], `As of ${fmtDate(todayISO())}${al.length > 40 ? `, first 40 of ${al.length}` : ""}.`);
  return R;
}
const fmtV = (v, f, pdf) => (v === "" || v == null ? "" : f === "m" ? (pdf ? "" : "₱") + money(v) : f === "p" ? `${Math.round(v * 1000) / 10}%` : f === "d" ? fmtDate(v) : typeof v === "number" ? v.toLocaleString("en-PH") : String(v));
VIEWS.report = () => {
  const m = S.repMonth || todayISO().slice(0, 7); const sc = S.repScope || "all"; const R = reportData(m, sc);
  return head(`${esc(R.company)} · ${esc(R.scope)}`, `Monthly HR report · ${esc(R.label)}`, `<label class="field rep-month"><span class="sr-only">Month</span><input class="input" type="month" id="rep-month" value="${m}" max="${todayISO().slice(0, 7)}"></label>`) + `
    <div class="iobar no-print" role="toolbar" aria-label="Report downloads">
      <span class="seg" role="group" aria-label="Report covers">${REP_SCOPES.map(([k, l]) => `<button data-rep-scope="${k}" aria-pressed="${sc === k}">${l}</button>`).join("")}</span>
      <button class="btn btn-ghost btn-sm" data-rep="xlsx">${icon("download", 16)}Export to Excel</button>
      <button class="btn btn-ghost btn-sm" data-rep="pptx">${icon("slides", 16)}Download PowerPoint</button>
      <button class="btn btn-ghost btn-sm" data-rep="pdf">${icon("pdf", 16)}Download PDF</button>
      ${S.canEdit ? `<button class="btn btn-ghost btn-sm" data-io="import">${icon("upload", 16)}Import from Excel</button>` : ""}
      <button class="btn btn-ghost btn-sm" data-io="att">${icon("clip", 16)}Attachments${attsFor("report").length ? `<span class="io-count">${attsFor("report").length}</span>` : ""}</button>
    </div>
    <section class="stats kpis" aria-label="Key figures">${R.kpis.map((k) => `<div class="card stat kpi"><span class="label">${esc(k.label)}</span><span class="value${k.f === "m" ? " rep-money" : ""}">${esc(fmtV(k.value, k.f))}</span>${k.note ? `<span class="note t-muted">${esc(k.note)}</span>` : ""}</div>`).join("")}</section>
    <div class="rep-grid">${R.sections.map((s) => `<section class="card rep-sec${s.head.length > 5 || s.title === "Compliance alerts" ? " rep-wide" : ""}"><div class="card-head"><h2>${esc(s.title)}</h2></div>
      ${s.rows.length ? `<div class="table-wrap"><table><thead><tr>${s.head.map((h, i) => `<th${s.fmt[i] && s.fmt[i] !== "t" && s.fmt[i] !== "d" ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((v, i) => `<td${s.fmt[i] && s.fmt[i] !== "t" && s.fmt[i] !== "d" ? ' class="num"' : ""}>${esc(fmtV(v, s.fmt[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">Nothing recorded for this month.</p>'}
      ${s.note ? `<p class="t-muted" style="margin:10px 0 0;font-size:13px">${esc(s.note)}</p>` : ""}</section>`).join("")}</div>`;
};
const repFile = (R, ext) => `HR-report-${R.month}${R.scope === "All company" ? "" : "-" + slug(R.scope)}.${ext}`;
async function reportXlsx(R) {
  const sum = [[`${R.company} · Monthly HR report`], [`${R.label} · ${R.scope}`], [`Generated ${fmtDate(todayISO())}`], [], ["Figure", "Value", "Note"], ...R.kpis.map((k) => [k.label, k.value, k.note])];
  const xl = (v, f) => (f === "d" && v ? v : v);
  return saveBook(repFile(R, "xlsx"), [{ name: "Summary", rows: sum }, ...R.sections.map((s) => ({ name: s.title, rows: [s.head, ...(s.rows.length ? s.rows.map((r) => r.map((v, i) => xl(v, s.fmt[i]))) : [["Nothing recorded for this month."]])] }))]);
}
async function reportPptx(R) {
  let P; try { P = await loadLib("pptx"); } catch { toast("Couldn't load the PowerPoint tools. Check your connection and try again."); return false; }
  const p = new P(); p.layout = "LAYOUT_WIDE"; p.title = `Monthly HR report ${R.label}`; p.company = R.company;
  const BLUE = "2348C7", INK = "14213D", MUTED = "5A6478";
  p.defineSlideMaster({ title: "BODY", background: { color: "FFFFFF" }, objects: [{ rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: BLUE } } }, { text: { text: `${R.company} · ${R.label} · ${R.scope}`, options: { x: 0.5, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: MUTED } } }], slideNumber: { x: 12.3, y: 7.0, fontSize: 10, color: MUTED } });
  const t = p.addSlide(); t.background = { color: BLUE };
  t.addText("Monthly HR report", { x: 0.7, y: 2.2, w: 12, h: 1, fontSize: 40, bold: true, color: "FFFFFF" });
  t.addText(`${R.label} · ${R.scope}`, { x: 0.7, y: 3.2, w: 12, h: 0.6, fontSize: 22, color: "D6E0FF" });
  t.addText(R.company, { x: 0.7, y: 5.6, w: 12, h: 0.5, fontSize: 16, color: "FFFFFF" });
  t.addText(`Generated ${fmtDate(todayISO())}`, { x: 0.7, y: 6.1, w: 12, h: 0.4, fontSize: 12, color: "D6E0FF" });
  if (R.kpis.length) {
    const s = p.addSlide({ masterName: "BODY" }); s.addText("Key figures", { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK });
    R.kpis.slice(0, 12).forEach((k, i) => { const x = 0.5 + (i % 4) * 3.1, y = 1.25 + Math.floor(i / 4) * 1.85;
      s.addShape(p.ShapeType.roundRect, { x, y, w: 2.9, h: 1.65, fill: { color: "EEF2FF" }, line: { color: "E1E6F2" }, rectRadius: 0.08 });
      s.addText(k.label, { x: x + 0.15, y: y + 0.1, w: 2.6, h: 0.4, fontSize: 12, color: MUTED });
      s.addText(fmtV(k.value, k.f), { x: x + 0.15, y: y + 0.5, w: 2.6, h: 0.6, fontSize: k.f === "m" ? 20 : 28, bold: true, color: INK });
      if (k.note) s.addText(k.note, { x: x + 0.15, y: y + 1.1, w: 2.6, h: 0.4, fontSize: 10, color: MUTED }); });
  }
  const chartOf = (title, labels, values, type) => { const s = p.addSlide({ masterName: "BODY" }); s.addText(title, { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK });
    s.addChart(type === "pie" ? p.ChartType.doughnut : p.ChartType.bar, [{ name: title, labels, values }], { x: 0.8, y: 1.2, w: 11.5, h: 5.5, showLegend: type === "pie", legendPos: "r", showValue: true, barDir: "bar", chartColors: ["2A78D6", "1BAF7A", "EDA100", "4A3AA7", "EB6834", "2348C7", "BE185D", "15803D"], dataLabelColor: INK, catAxisLabelFontSize: 11 }); };
  const st = R.sections.find((s) => s.title === "Employment status"); if (st?.rows.length) chartOf("Employment status", st.rows.map((r) => r[0]), st.rows.map((r) => r[1]), "pie");
  const bd = R.sections.find((s) => s.title === "Headcount by department"); if (bd?.rows.length) chartOf("Headcount by department", bd.rows.slice(0, 15).map((r) => r[1]), bd.rows.slice(0, 15).map((r) => r[3]));
  for (const sec of R.sections) {
    const s = p.addSlide({ masterName: "BODY" }); s.addText(sec.title, { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 24, bold: true, color: INK });
    if (!sec.rows.length) { s.addText("Nothing recorded for this month.", { x: 0.5, y: 1.3, w: 12, h: 0.5, fontSize: 16, color: MUTED }); continue; }
    const al = (i) => (sec.fmt[i] && sec.fmt[i] !== "t" && sec.fmt[i] !== "d" ? "right" : "left");
    const rows = [sec.head.map((h, i) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: BLUE }, align: al(i) } })), ...sec.rows.map((r) => r.map((v, i) => ({ text: fmtV(v, sec.fmt[i]), options: { align: al(i) } })))];
    s.addTable(rows, { x: 0.5, y: 1.15, w: 12.3, fontSize: sec.head.length > 7 ? 10 : 12, color: INK, border: { type: "solid", pt: 0.5, color: "E1E6F2" }, autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 1.15, newSlideStartY: 1.15, masterName: "BODY" });
    if (sec.note) s.addText(sec.note, { x: 0.5, y: 6.55, w: 12, h: 0.35, fontSize: 10, italic: true, color: MUTED });
  }
  const blob = await p.write({ outputType: "blob" });
  return saveBlob(repFile(R, "pptx"), blob);
}
async function reportPdf(R) {
  let J; try { J = await loadLib("pdf"); await loadLib("pdfTable"); } catch { toast("Couldn't load the PDF tools. Check your connection and try again."); return false; }
  const doc = new J({ orientation: "landscape", unit: "pt", format: "a4" }); const W = doc.internal.pageSize.getWidth();
  const blue = [35, 72, 199], ink = [20, 33, 61], muted = [90, 100, 120];
  doc.setFillColor(...blue); doc.rect(0, 0, W, 90, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text(`Monthly HR report · ${R.label}`, 40, 45);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text(`${R.company} · ${R.scope} · Generated ${fmtDate(todayISO())} · Amounts in PHP`, 40, 70);
  let y = 115;
  if (R.kpis.length) { doc.autoTable({ startY: y, head: [["Key figure", "Value", "Note"]], body: R.kpis.map((k) => [k.label, fmtV(k.value, k.f, true), k.note]), theme: "grid", headStyles: { fillColor: blue }, styles: { fontSize: 10, textColor: ink }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } }, margin: { left: 40, right: 40 } }); y = doc.lastAutoTable.finalY + 24; }
  for (const s of R.sections) {
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50; }
    doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(s.title, 40, y); y += 8;
    const cs = {}; s.fmt.forEach((f, i) => { if (f && f !== "t" && f !== "d") cs[i] = { halign: "right" }; });
    doc.autoTable({ startY: y, head: [s.head], body: s.rows.length ? s.rows.map((r) => r.map((v, i) => fmtV(v, s.fmt[i], true))) : [["Nothing recorded for this month."]], theme: "striped", headStyles: { fillColor: blue }, styles: { fontSize: 9, textColor: ink, cellPadding: 4 }, columnStyles: cs, didParseCell: (c) => { if (cs[c.column.index]) c.cell.styles.halign = "right"; }, margin: { left: 40, right: 40 } });
    y = doc.lastAutoTable.finalY + 8;
    if (s.note) { doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...muted); doc.text(s.note, 40, y + 8); y += 14; }
    y += 18;
  }
  const n = doc.internal.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...muted); doc.text(`Page ${i} of ${n}`, W - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" }); }
  return saveBlob(repFile(R, "pdf"), doc.output("blob"));
}

/* ---------- project codes ---------- */
function nextProjCode() {
  const codes = [...S.projects.values()].map((p) => String(p.code || "")); const pre = {};
  for (const c of codes) { const m = c.match(/^(.*?)(\d+)$/); if (m) { const k = m[1]; pre[k] = pre[k] || { n: 0, max: 0, w: m[2].length }; pre[k].n++; pre[k].max = Math.max(pre[k].max, Number(m[2])); pre[k].w = Math.max(pre[k].w, m[2].length); } }
  const best = Object.entries(pre).sort((a, b) => b[1].n - a[1].n)[0]; if (!best) return "PRJ-001";
  const [k, v] = best; let n = v.max + 1, c; do { c = k + String(n++).padStart(v.w, "0"); } while (projByCode(c)); return c;
}
VIEWS.projcodes = () => {
  const q = (S.pcQ || "").toLowerCase(); const rank = { ACTIVE: 0, PLANNING: 1, ON_HOLD: 2, COMPLETED: 3 };
  const all = [...S.projects.values()]; const list = all.filter((p) => !q || `${p.code} ${p.name} ${p.client || ""} ${p.location || ""}`.toLowerCase().includes(q)).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const heads = (p) => active().filter((e) => e.projectId === p.id).length;
  return head(`${all.length} ${all.length === 1 ? "code" : "codes"} · ${all.filter((p) => p.status === "ACTIVE").length} active`, "Project codes") + `
    ${S.canEdit ? `<section class="card"><div class="card-head"><h2>Add a project code</h2></div>
      <form id="pc-form" class="form-grid" style="align-items:end" data-keep>
        <div class="field"><label for="pc-code">Project code <span class="req">*</span></label><input class="input" id="pc-code" name="code" required value="${esc(nextProjCode())}" autocomplete="off"></div>
        <div class="field"><label for="pc-name">Project name <span class="req">*</span></label><input class="input" id="pc-name" name="name" required></div>
        <div class="field"><label for="pc-client">Client</label><input class="input" id="pc-client" name="client"></div>
        <div class="field"><label for="pc-loc">Location</label><input class="input" id="pc-loc" name="location"></div>
        <div class="field"><label for="pc-status">Status</label><select class="input" id="pc-status" name="status">${opts(mapList(PSTATUS), "PLANNING")}</select></div>
        <div style="display:flex;gap:12px;align-items:center"><button class="btn btn-primary">${icon("plus", 16)}Add code</button><p class="err" id="pc-err" style="margin:0" hidden></p></div>
      </form><p class="t-muted" style="margin:10px 0 0;font-size:13px">The next free code is filled in for you. Add manpower, dates and the project manager on the project's page.</p></section>` : ""}
    <section class="card"><div class="card-head"><h2>All project codes</h2><input class="input" type="search" id="pc-q" placeholder="Search code, project, client" value="${esc(S.pcQ || "")}" aria-label="Search project codes" style="max-width:280px"></div>
      <div class="table-wrap"><table><thead><tr><th>Code</th><th>Project</th><th>Client</th><th>Location</th><th>Status</th><th>Start</th><th>End</th><th class="num">People</th>${S.canEdit ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.code.localeCompare(b.code, undefined, { numeric: true })).map((p) => `<tr><td><b class="pc-code">${esc(p.code)}</b></td><td><button class="link" data-project="${p.id}">${esc(p.name)}</button></td><td>${esc(p.client || "")}</td><td>${esc(p.location || "")}</td>
        <td><span class="chip ${PSTATUS[p.status]?.[1] || "c-gray"}">${esc(lbl(PSTATUS, p.status))}</span></td><td>${p.start ? fmtDate(p.start) : ""}</td><td>${p.end ? fmtDate(p.end) : ""}</td><td class="num">${heads(p)}</td>
        ${S.canEdit ? `<td class="num"><button class="btn btn-ghost btn-sm" data-edit-project="${p.id}">Edit</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="9" class="empty">${q ? "No project codes match." : "No project codes yet."}</td></tr>`}
      </tbody></table></div></section>`;
};

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-io],[data-io-get],[data-io-del],[data-rep],[data-rep-scope]");
  if (!t) { if (ev.target.id === "io-modal") closeModal(); return; }
  if (t.dataset.ioGet) { getAtt(t.dataset.ioGet); return; }
  if (t.dataset.ioDel) { if (!armed(t)) return; delAtt(t.dataset.ioDel); return; }
  if (t.dataset.repScope) { S.repScope = t.dataset.repScope; render(); return; }
  if (t.dataset.rep) {
    const R = reportData(S.repMonth || todayISO().slice(0, 7), S.repScope || "all"); const was = t.innerHTML; t.disabled = true; t.textContent = "Preparing…";
    try { const ok = await (t.dataset.rep === "xlsx" ? reportXlsx(R) : t.dataset.rep === "pptx" ? reportPptx(R) : reportPdf(R)); if (ok) toast("Report ready."); } catch { toast("Couldn't build the report file. Try again."); }
    finally { if (t.isConnected) { t.disabled = false; t.innerHTML = was; } } return;
  }
  const a = t.dataset.io;
  if (a === "close") return closeModal();
  if (a === "export") { const was = t.innerHTML; t.disabled = true; t.textContent = "Preparing…"; try { await exportPage(); } catch { toast("Couldn't build the Excel file. Try again."); } finally { if (t.isConnected) { t.disabled = false; t.innerHTML = was; } } return; }
  if (a === "import") return importModal();
  if (a === "att") return attModal();
  if (a === "tpl") { const d = DS[S.io?.ds]; if (d) saveBook(`${slug(d.label)}-template.xlsx`, [{ name: d.label, rows: [d.cols.map(colName)] }]); return; }
  if (a === "run") return runIOImport(t);
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "io-ds") return importModal(t.value);
  if (t.id === "io-file" && t.files?.[0]) return previewFile(t.files[0]);
  if (t.id === "io-att" && t.files?.length) return uploadAtts([...t.files]);
  if (t.id === "rep-month" && t.value) { S.repMonth = t.value; render(); }
});
document.addEventListener("input", (ev) => { if (ev.target.id === "pc-q") { S.pcQ = ev.target.value; render(); } });
for (const type of ["dragenter", "dragover"]) document.addEventListener(type, (ev) => { const z = ev.target.closest?.(".io-drop"); if (!z) return; ev.preventDefault(); z.classList.add("drag"); });
document.addEventListener("dragleave", (ev) => { const z = ev.target.closest?.(".io-drop"); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", (ev) => {
  const z = ev.target.closest?.(".io-drop"); if (!z) { if (S.io) ev.preventDefault(); return; } ev.preventDefault(); z.classList.remove("drag");
  const files = [...(ev.dataTransfer?.files || [])]; if (!files.length) return;
  if (z.id === "io-file-drop") previewFile(files[0]); else if (z.id === "io-att-drop") uploadAtts(files);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.io) closeModal();
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList?.contains("io-drop")) { ev.preventDefault(); ev.target.querySelector("input")?.click(); }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; if (f.id !== "pc-form") return; ev.preventDefault();
  const val = (k) => (f.elements[k]?.value ?? "").trim(); const err = $("#pc-err"); const fail = (m) => { err.textContent = m; err.hidden = false; };
  const code = val("code"), name = val("name"); if (!code || !name) return fail("Enter the code and project name.");
  if (projByCode(code)) return fail("That project code is already used.");
  const p = { id: uid(), req: {}, code, name, client: val("client") || null, location: val("location") || null, status: val("status") || "PLANNING", managerId: null, start: null, end: null, region: null, description: null };
  try { const { id, ...body } = p; await S.db.doc("projects/" + id).set(body); S.projects.set(id, p); logActivity(`Added project code ${code} (${name})`); toast(`Added ${code}.`); S.ver++; render(); }
  catch { fail("Couldn't save. Try again."); }
});

/* ---------- drop files anywhere on a page to attach them to it ---------- */
const pageDropOk = () => S.canEdit && S.assets && !S.io && S.viewAs !== "emp" && !["import", "payslip", "perms", "kiosk"].includes(baseView(S.view.name));
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes("Files");
let pdDepth = 0;
const pdShow = (on) => { let o = $("#page-drop"); if (on && !o) { o = document.createElement("div"); o.id = "page-drop"; o.className = "page-drop no-print"; o.innerHTML = `<div>${icon("clip", 34)}<b>Drop to attach to ${esc(pageLabel())}</b><span>PDF, images, video, Word, Excel, PowerPoint or ZIP</span></div>`; document.body.appendChild(o); } if (!on && o) o.remove(); };
const otherZone = (t) => t.closest?.(".io-drop, #jp-photo-drop, input[type=file], [data-drop]");
window.addEventListener("dragenter", (ev) => { if (!hasFiles(ev) || !pageDropOk() || otherZone(ev.target)) return; pdDepth++; pdShow(true); });
window.addEventListener("dragleave", (ev) => { if (!hasFiles(ev)) return; pdDepth = Math.max(0, pdDepth - 1); if (!pdDepth) pdShow(false); });
window.addEventListener("dragover", (ev) => { if (hasFiles(ev) && pageDropOk() && !otherZone(ev.target)) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; } });
window.addEventListener("drop", (ev) => { pdDepth = 0; pdShow(false); if (!hasFiles(ev) || !pageDropOk() || otherZone(ev.target)) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const files = [...ev.dataTransfer.files]; if (!files.length) return; attModal(); uploadAtts(files); }, true);
