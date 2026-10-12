/* ---------- v62 Monthly report follows the company presentation format (Glenn 2026-10-12, "HR System Monthly Report format.pptx") ----------
   One slide plan, two outputs: PowerPoint (pptxgenjs) and PDF (jsPDF) draw the same 10 x 5.625 in pages:
   cover, contents, numbered section dividers, white content pages, closing "Thank you" page. */
const RF = { navy: "0A1F44", blue: "3B82F6", blue2: "2563EB", sky: "60A5FA", deep: "1E3A8A", slate: "475569", mute: "94A3B8", pale: "CBD5E1", line: "E2E8F0", panel: "0F172A", ink: "1E293B",
  ok: "15803D", watch: "B7791F", bad: "B4462F", info: "64748B" };
const RF_JEWEL = ["1E3A8A", "0B7A5A", "A3204F", "6D28D9", "0F766E", "A3410F", "2B4FB8", "0A1F44"];
const RF_TONE = { good: RF.ok, watch: RF.watch, risk: RF.bad, info: RF.info };
const RF_CO = { offices: [["MANILA OFFICE", ["Unit 1204, Jollibee Center", "San Miguel Avenue", "Ortigas Center, Pasig City 1605"]], ["CEBU OFFICE", ["The Reef Mactan, Block 5 Lot 4", "Vistamar Subdivision, Angasil Road", "Mactan, Lapu-Lapu City"]]],
  contact: ["+63 917 829 4477", "(02) 5310 2016", "(02) 5310 2019"], digital: ["www.gd-prime.com", "info@gd-prime.com"] };
const RF_PARTS = [["Executive Summary", "What happened this month, in brief."], ["Key Figures", "Eight measures, compared with last month."], ["Six-Month Trends", "Headcount, movement, payroll cost and time."],
  ["Findings & Actions", "What needs attention, and what we will do."], ["Module Analysis", "Every module and submodule, reviewed."], ["Detailed Tables", "The records behind the figures."]];
const rfHex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
/* images the outputs can read: logo as PNG, app icons drawn white on a colored disk */
async function rfPng(src, size, draw) { const im = new Image(); im.src = src; await im.decode(); const cv = document.createElement("canvas"); cv.width = cv.height = size; const g = cv.getContext("2d"); if (draw) draw(g, size); g.drawImage(im, draw ? size * 0.25 : 0, draw ? size * 0.25 : 0, draw ? size * 0.5 : size, draw ? size * 0.5 : size); return cv.toDataURL("image/png"); }
async function rfAssets() {
  const logo = await rfPng(CO_LOGO, 160).catch(() => null);
  const ic = async (k, c) => rfPng("data:image/svg+xml;charset=utf-8," + encodeURIComponent(icon(k, 24).replace('stroke="currentColor"', 'stroke="#ffffff"').replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')), 128, (g, s) => { g.fillStyle = "rgba(255,255,255,0.2)"; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill(); }).catch(() => null);
  const keys = ["people", "plus", "door", "log", "cal", "clock", "pay", "project"]; const icons = [];
  for (let i = 0; i < keys.length; i++) icons.push(await ic(keys[i], RF_JEWEL[i]));
  return { logo, icons };
}
/* ---- the shared slide plan ---- */
function rfPlan(D, R, X, mods, A) {
  const { M, P, F, trend } = X; const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const fv = (v, f) => (f === "m" ? "₱" + money(v) : f === "p" ? pct(v) : Number(v).toLocaleString("en-PH"));
  const logo = () => { if (A.logo) D.img(A.logo, 9.18, 0.06, 0.66, 0.66); };
  const body = (part, eyebrow, title) => { D.slide({}); D.text("GD PRIME", 8.3, 0.22, 1.6, 0.25, { size: 9, color: RF.mute, font: "serif", bold: true, spacing: 4, align: "right" });
    D.text(eyebrow.toUpperCase(), 0.5, 0.42, 7.6, 0.25, { size: 9, color: RF.blue2, bold: true, spacing: 4 });
    D.text(title, 0.5, 0.68, 9, 0.6, { size: 24, color: RF.navy, font: "serif", bold: true });
    D.text(part.toUpperCase(), 0.5, 5.32, 6, 0.22, { size: 8, color: RF.mute, spacing: 3 }); };
  const band = (t, y = 4.72) => { D.rect(0.5, y, 9, 0.4, { fill: RF.navy }); D.rect(0.5, y, 0.06, 0.4, { fill: RF.blue }); D.text(t, 0.72, y, 8.6, 0.4, { size: 10.5, color: "FFFFFF", italic: true, valign: "middle" }); };
  const divider = (n) => { const [t, sub] = RF_PARTS[n - 1]; const nn = String(n).padStart(2, "0"); D.slide({ bg: RF_IMG.section });
    D.text(nn, 5.2, 0, 4.7, 5.6, { size: 180, color: RF.deep, font: "serif", bold: true, align: "right", valign: "middle" });
    D.text("SECTION", 0.5, 0.55, 3, 0.25, { size: 10, color: RF.sky, bold: true, spacing: 6 }); D.text(nn, 0.5, 0.95, 1.5, 0.5, { size: 28, color: RF.blue, font: "serif", bold: true });
    D.rect(0.5, 1.62, 0.4, 0.04, { fill: RF.blue }); D.text(t, 0.5, 1.85, 8, 1.1, { size: 46, color: "FFFFFF", font: "serif", bold: true, valign: "middle" });
    D.text([sub, `${R.label} · ${R.scope}`], 0.5, 3.2, 6, 1.0, { size: 16, color: RF.pale });
    D.text("GD  PRIME  ·  MONTHLY HR REPORT", 0.5, 5.27, 6, 0.22, { size: 8, color: RF.mute, spacing: 3 }); logo(); };
  // Cover
  D.slide({ bg: RF_IMG.cover }); logo();
  D.rect(0.48, 1.61, 0.05, 2.58, { fill: RF.blue });
  D.text("GD  PRIME", 0.5, 0.45, 6.5, 0.3, { size: 14, color: RF.sky, font: "serif", bold: true, spacing: 8 });
  D.text("PROPERTY MANAGEMENT CORPORATION", 0.5, 0.75, 8, 0.25, { size: 12, color: RF.pale, font: "serif", spacing: 4 });
  D.text("Monthly HR Report", 0.67, 1.45, 8.4, 0.8, { size: 42, color: "FFFFFF", font: "serif", bold: true });
  D.text(R.label, 0.67, 2.23, 8.4, 0.8, { size: 42, color: RF.sky, font: "serif", bold: true });
  D.text(`${R.scope} · Prepared ${fmtDate(todayISO())}`, 0.67, 3.11, 8, 0.35, { size: 16, color: RF.pale, font: "serif", bold: true });
  D.text("PREPARED FOR:  MANAGEMENT", 0.67, 3.88, 8, 0.3, { size: 14, color: "0096FF", font: "serif", bold: true, spacing: 4 });
  D.rect(0.5, 4.95, 0.5, 0.02, { fill: RF.blue });
  D.text("MONTHLY HR REPORT", 0.5, 5.05, 6.3, 0.22, { size: 9, color: RF.pale, font: "serif", bold: true, spacing: 3 });
  D.text("Workforce · Attendance · Payroll · Recruitment · Compliance", 0.5, 5.27, 6.3, 0.22, { size: 9, color: RF.mute, font: "serif" });
  D.text("www.gd-prime.com", 6.5, 5.05, 3, 0.22, { size: 9, color: RF.sky, font: "serif", bold: true, spacing: 2, align: "right" });
  D.text("info@gd-prime.com", 6.5, 5.27, 3, 0.22, { size: 9, color: RF.mute, font: "serif", align: "right" });
  // Contents
  D.slide({}); D.text("CONTENTS", 0.5, 0.5, 4, 0.3, { size: 10, color: RF.blue2, font: "serif", bold: true, spacing: 5 });
  D.text("What's inside.", 0.5, 0.8, 4, 0.6, { size: 32, color: RF.navy, font: "serif", bold: true });
  D.text([`${R.company}`, `${R.label} · ${R.scope}`], 0.5, 1.55, 3.8, 0.6, { size: 11, color: RF.slate });
  D.rect(4.55, 0.55, 0.01, 4.5, { fill: RF.line });
  RF_PARTS.forEach(([t, sub], i) => { const x = i % 2 ? 7.3 : 4.85, y = [0.48, 1.65, 2.91][Math.floor(i / 2)];
    D.text(String(i + 1).padStart(2, "0"), x, y, 0.6, 0.3, { size: 11, color: RF.blue, font: "serif", bold: true, spacing: 2 });
    D.text(t, x, y + 0.26, 2.4, 0.4, { size: 12.5, color: RF.navy, font: "serif", bold: true }); D.text(sub, x, y + 0.66, 2.4, 0.4, { size: 9, color: RF.slate, font: "serif" }); });
  D.text("CONTENTS", 0.5, 5.32, 5, 0.22, { size: 8, color: RF.mute, font: "serif", spacing: 3 });
  // 01 Executive summary
  divider(1); body("Executive Summary", "Executive summary", `What happened in ${R.label}`);
  D.text(X.sum, 0.5, 1.45, 9, 3.1, { size: 13, color: RF.ink, bullets: true, gap: 8 });
  const lead = F.find((f) => f.tone === "risk") || F.find((f) => f.tone === "watch"); band(lead ? `Priority: ${lead.area}. ${cut(lead.act || lead.text, 150)}` : "All areas are on track this month.");
  if (X.note?.ai) { body("Executive Summary", "Analysis", "A closer look at the month"); D.text(X.note.ai.split(/\n+/).filter(Boolean).map((t) => t.replace(/^[-*•]\s*/, "")), 0.5, 1.4, 9, 3.8, { size: 11, color: RF.ink, gap: 6 }); }
  // 02 Key figures
  divider(2); body("Key Figures", "Key figures", "The month in eight numbers");
  const kp = [["Active employees", M.end, P.end, "n", "up"], ["New hires", M.hires, P.hires, "n", "up"], ["Separations", M.seps, P.seps, "n", "down"], ["Turnover (month)", M.turnover, P.turnover, "p", "down"], ["Absence rate", M.absRate, P.absRate, "p", "down"], ["Overtime hours", M.ot, P.ot, "n", "down"], ["Payroll cost", M.cost, P.cost, "m", "down"], ["Projects staffed", M.fill ?? 0, P.fill ?? 0, "p", "up"]];
  kp.forEach(([l, v, pv, f, better], i) => { const w = 2.1, h = 1.5, x = 0.5 + (i % 4) * 2.3, y = 1.45 + Math.floor(i / 4) * 1.62, cx = x + w / 2; const c = pv ? chg(v, pv) : null; const good = c == null || c === 0 ? null : (c > 0) === (better === "up");
    D.rect(x, y, w, h, { fill: RF_JEWEL[i], line: "E4C98E", radius: 0.08 }); D.rect(x + 0.25, y, w - 0.5, 0.04, { fill: "E4C98E" });
    if (A.icons[i]) D.img(A.icons[i], cx - 0.17, y + 0.13, 0.34, 0.34);
    D.text(fv(v, f), x + 0.05, y + 0.5, w - 0.1, 0.42, { size: f === "m" ? 15 : 22, color: "FFFFFF", font: "serif", bold: true, align: "center", valign: "middle" });
    D.rect(cx - 0.2, y + 0.95, 0.4, 0.02, { fill: "E4C98E" });
    D.text(l, x + 0.05, y + 1.0, w - 0.1, 0.22, { size: 9.5, color: "E8ECF5", align: "center" });
    D.text(c == null ? "No figure last month" : c === 0 ? "Same as last month" : `${c > 0 ? "+" : "-"}${pct(Math.abs(c))} vs last month`, x + 0.05, y + 1.22, w - 0.1, 0.2, { size: 8.5, bold: true, color: good == null ? "E4C98E" : good ? "A7F3D0" : "FECDD3", align: "center" }); });
  band(X.sum[0] ? cut(X.sum[0], 160) : `${M.end} active employees at month end.`, 4.82);
  // 03 Trends
  divider(3); body("Six-Month Trends", "Six-month trends", "How the last six months moved"); const labs = trend.map((t) => mShort(t.month));
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));
  D.chart("line", "Active employees at month end", labs, [{ name: "Active employees", values: trend.map((t) => t.end), color: RF.navy }], 0.5, 1.35, 4.4, 1.8);
  D.chart("bar", "Hires and separations", labs, [{ name: "Hires", values: trend.map((t) => t.hires), color: RF.navy }, { name: "Separations", values: trend.map((t) => t.seps), color: RF.blue }], 5.1, 1.35, 4.4, 1.8);
  D.chart("bar", "Payroll cost (₱)", labs, [{ name: "Payroll cost", values: trend.map((t) => Math.round(t.cost)), color: RF.navy }], 0.5, 3.3, 4.4, 1.85, short);
  D.chart("bar", "Overtime hours and absence days", labs, [{ name: "Overtime hours", values: trend.map((t) => t.ot), color: RF.navy }, { name: "Absence days", values: trend.map((t) => t.abs), color: RF.blue }], 5.1, 3.3, 4.4, 1.85);
  // 04 Findings and actions
  divider(4); body("Findings & Actions", "Findings", "What the figures tell us");
  D.table(["Status", "Area", "Finding"], F.map((f) => [TONE[f.tone][0], f.area, f.text]), 0.5, 1.4, 9, { colW: [1.1, 1.5, 6.4], size: 9.5, color: (r, c) => (c === 0 ? RF_TONE[F[r].tone] : null), part: "Findings & Actions" });
  const acts = F.filter((f) => f.act && f.tone !== "good"); body("Findings & Actions", "Recommended actions", "What we will do next");
  if (!acts.length) D.text("Nothing needs action this month.", 0.5, 1.5, 9, 0.4, { size: 14, color: RF.slate });
  const rowH = Math.min(0.62, (X.note?.text ? 2.9 : 3.5) / Math.max(1, acts.length));
  acts.slice(0, 8).forEach((f, i) => { const y = 1.42 + i * rowH; D.text(String(i + 1).padStart(2, "0"), 0.5, y, 0.55, rowH, { size: 16, color: RF.blue, font: "serif", bold: true });
    D.text(f.area, 1.1, y, 1.9, rowH, { size: 11.5, color: RF.navy, font: "serif", bold: true }); D.text(cut(f.act, 190), 3.05, y, 6.45, rowH, { size: 10, color: RF.ink });
    if (i < acts.length - 1) D.rect(1.1, y + rowH - 0.06, 8.4, 0.005, { fill: RF.line }); });
  if (X.note?.text) band(`Management comments: ${cut(X.note.text, 200)}`, 4.62);
  // 05 Module analysis
  divider(5); body("Module Analysis", "Module analysis", "Every module at a glance");
  const per = 5, rows = Math.ceil(mods.length / per), ch = Math.min(1.5, (3.7 - (rows - 1) * 0.15) / rows);
  mods.forEach((g, i) => { const w = 1.68, x = 0.5 + (i % per) * (w + 0.15), y = 1.4 + Math.floor(i / per) * (ch + 0.15); const tc = RF_TONE[g.tone];
    D.rect(x, y, w, ch, { fill: "FFFFFF", line: RF.line, radius: 0.06 }); D.rect(x, y, w, 0.06, { fill: tc });
    D.text(g.label, x + 0.12, y + 0.14, w - 0.24, 0.42, { size: 12, color: RF.navy, font: "serif", bold: true });
    D.text(MR_TONE[g.tone][0].toUpperCase(), x + 0.12, y + 0.56, w - 0.24, 0.2, { size: 8.5, color: tc, bold: true, spacing: 2 });
    D.text(`${g.rows.length} submodules${g.risks ? ` · ${g.risks} act now` : ""}${g.watch ? ` · ${g.watch} to watch` : ""}`, x + 0.12, y + 0.78, w - 0.24, Math.max(0.3, ch - 0.86), { size: 8.5, color: RF.slate }); });
  const fig = (v, r) => (v == null ? "" : r.money ? "₱" + money(v) : Number(v).toLocaleString("en-PH"));
  for (const g of mods) { body("Module Analysis", `Module analysis · ${MR_TONE[g.tone][0]}`, g.label);
    D.table(["Submodule", "This month", "Last month", "Status", "Analysis and action"], g.rows.map((r) => [r.label, fig(r.n, r), fig(r.p, r), MR_TONE[r.tone][0], r.text + (r.act ? `  Action: ${r.act}` : "")]), 0.5, 1.35, 9,
      { colW: [1.7, 0.95, 0.95, 0.95, 4.45], size: 8.5, align: ["left", "right", "right", "left", "left"], color: (ri, c) => (c === 3 ? RF_TONE[g.rows[ri].tone] : null), part: "Module Analysis" }); }
  // 06 Detailed tables
  divider(6); const empty = R.sections.filter((s) => !s.rows.length).map((s) => s.title);
  for (const s of R.sections) { if (!s.rows.length) continue; body("Detailed Tables", "Detailed tables", s.title); const al = s.fmt.map((f) => (f && f !== "t" && f !== "d" ? "right" : "left"));
    D.table(s.head, s.rows.map((r) => r.map((v, i) => fmtV(v, s.fmt[i]))), 0.5, 1.35, 9, { size: s.head.length > 7 ? 7.5 : 8.5, align: al, part: "Detailed Tables" }); }
  if (empty.length) { body("Detailed Tables", "Detailed tables", "Nothing recorded this month"); D.text(empty, 0.5, 1.45, 9, 3.4, { size: 12, color: RF.slate, bullets: true, gap: 4 }); }
  // Closing
  D.slide({ bg: RF_IMG.thanks }); D.text("THANK YOU", 0.5, 0.95, 9, 0.4, { size: 14, color: RF.sky, bold: true, spacing: 8, align: "center" });
  D.text("Always there for you.", 0.5, 1.4, 9, 0.85, { size: 46, color: "FFFFFF", font: "serif", bold: true, align: "center", valign: "middle" }); D.rect(4.7, 2.4, 0.6, 0.04, { fill: RF.blue });
  D.text("Prepared by Human Resources from live records in the HR system. For questions about this report, please contact HR at the Head Office.", 1.2, 2.55, 7.6, 0.7, { size: 13, color: RF.pale, align: "center" });
  D.rect(0.5, 3.5, 9, 1.55, { fill: RF.panel }); D.rect(0.5, 3.5, 9, 0.04, { fill: RF.blue }); D.img(RF_IMG.qr, 0.84, 3.76, 1.05, 1.05);
  [[2.22, ...RF_CO.offices[0]], [4.31, ...RF_CO.offices[1]], [6.43, "CONTACT", RF_CO.contact], [7.87, "DIGITAL", RF_CO.digital]].forEach(([x, h, ls]) => { D.text(h, x, 3.73, 2.05, 0.22, { size: 10, color: RF.sky, bold: true, spacing: 4 }); D.rect(x, 3.98, 0.3, 0.03, { fill: RF.blue }); D.text(ls, x, 4.08, x > 7 ? 1.6 : 2.05, 0.95, { size: 10, color: RF.pale }); });
  D.text("GD PRIME PROPERTY MANAGEMENT CORPORATION  ·  MONTHLY HR REPORT", 0.5, 5.3, 9, 0.22, { size: 8, color: RF.mute, spacing: 4, align: "center" });
}
/* ---- PowerPoint backend ---- */
function rfPptDeck(Pp, R) {
  const p = new Pp(); p.layout = "LAYOUT_16x9"; p.title = `Monthly HR report ${R.label}`; p.company = R.company; let s;
  p.defineSlideMaster({ title: "RF", background: { color: "FFFFFF" }, objects: [], slideNumber: { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 8, color: RF.mute, fontFace: "Calibri", align: "right" } });
  const face = (o) => (o.font === "serif" ? "Georgia" : "Calibri");
  return { p,
    slide(o) { s = o.bg ? p.addSlide() : p.addSlide({ masterName: "RF" }); if (o.bg) s.background = { data: o.bg }; },
    rect(x, y, w, h, o) { s.addShape(o.radius ? p.ShapeType.roundRect : p.ShapeType.rect, { x, y, w, h, fill: { color: o.fill }, line: { color: o.line || o.fill, width: o.line ? 0.75 : 0 }, ...(o.radius ? { rectRadius: o.radius } : {}) }); },
    img(data, x, y, w, h) { try { s.addImage({ data, x, y, w, h }); } catch {} },
    text(t, x, y, w, h, o) { const base = { fontSize: o.size, color: o.color, fontFace: face(o), bold: !!o.bold, italic: !!o.italic };
      const val = Array.isArray(t) ? t.map((l) => ({ text: l, options: { ...base, bullet: o.bullets ? { indent: 14 } : false, breakLine: true, paraSpaceAfter: o.gap || 0 } })) : t;
      s.addText(val, { x, y, w, h, ...base, align: o.align || "left", valign: o.valign || "top", margin: 0, ...(o.spacing ? { charSpacing: o.spacing } : {}) }); },
    table(head, rows, x, y, w, o) { const al = (i) => (o.align ? o.align[i] : "left");
      const data = [head.map((h, i) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: RF.navy }, align: al(i) } })), ...rows.map((r, ri) => r.map((v, i) => { const c = o.color?.(ri, i); return { text: String(v ?? ""), options: { align: al(i), ...(c ? { color: c, bold: true } : {}), fill: { color: ri % 2 ? "F8FAFC" : "FFFFFF" } } }; }))];
      s.addTable(data, { x, y, w, ...(o.colW ? { colW: o.colW } : {}), fontSize: o.size || 9, fontFace: "Calibri", color: RF.ink, border: { type: "solid", pt: 0.5, color: RF.line }, margin: 0.05, valign: "middle", autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 0.6, newSlideStartY: 0.6, masterName: "RF" }); },
    chart(kind, title, labels, series, x, y, w, h) { s.addChart(kind === "line" ? p.ChartType.line : p.ChartType.bar, series.map((d) => ({ name: d.name, labels, values: d.values })),
      { x, y, w, h, barDir: "col", chartColors: series.map((d) => d.color), showLegend: series.length > 1, legendPos: "b", legendFontSize: 8, legendFontFace: "Calibri", showTitle: true, title, titleFontSize: 11, titleColor: RF.navy, titleFontFace: "Georgia",
        catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, catAxisLabelColor: RF.slate, valAxisLabelColor: RF.mute, valGridLine: { color: RF.line, size: 0.5 }, valAxisLabelFormatCode: "#,##0", lineSize: 2, lineDataSymbolSize: 6, barGapWidthPct: 60 }); },
    async out() { return p.write({ outputType: "blob" }); } };
}
/* ---- PDF backend: same page size (720 x 405 pt = 10 x 5.625 in) ---- */
function rfPdfDeck(J) {
  const I = 72, doc = new J({ orientation: "landscape", unit: "pt", format: [720, 405] }); let first = true; const chrome = []; // pages that get the slide number
  const clean = (t) => String(t ?? "").replace(/₱/g, "PHP ").replace(/…/g, "...").replace(/[▲]/g, "+").replace(/[▼]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  const font = (o) => { doc.setFont(o.font === "serif" ? "times" : "helvetica", o.bold && o.italic ? "bolditalic" : o.bold ? "bold" : o.italic ? "italic" : "normal"); doc.setFontSize(o.size || 11); doc.setTextColor(...rfHex(o.color || RF.ink)); };
  const D = { doc,
    slide(o) { if (!first) doc.addPage([720, 405], "landscape"); first = false; if (o.bg) doc.addImage(o.bg, "JPEG", 0, 0, 720, 405); else chrome.push(doc.getNumberOfPages()); },
    rect(x, y, w, h, o) { doc.setFillColor(...rfHex(o.fill)); if (o.line) { doc.setDrawColor(...rfHex(o.line)); doc.setLineWidth(0.75); }
      const st = o.line ? "FD" : "F"; if (o.radius) doc.roundedRect(x * I, y * I, w * I, h * I, o.radius * I, o.radius * I, st); else doc.rect(x * I, y * I, w * I, h * I, st); },
    img(data, x, y, w, h) { try { doc.addImage(data, /^data:image\/png/.test(data) ? "PNG" : "JPEG", x * I, y * I, w * I, h * I); } catch {} },
    text(t, x, y, w, h, o) { font(o); const sp = (o.spacing || 0) * 0.5; doc.setCharSpace(sp); const lh = (o.size || 11) * 1.22;
      const paras = (Array.isArray(t) ? t : [t]).map((l) => (o.bullets ? "•  " : "") + clean(l)); const lines = []; paras.forEach((pp, i) => { doc.splitTextToSize(pp, w * I - (o.bullets ? 0 : 0)).forEach((ln, j) => lines.push({ ln: j && o.bullets ? "    " + ln : ln, gap: 0 })); if (lines.length) lines[lines.length - 1].gap = (o.gap || 0); });
      const total = lines.reduce((a, l) => a + lh + l.gap, 0) - (lines.at(-1)?.gap || 0); let yy = y * I + (o.valign === "middle" ? Math.max(0, (h * I - total) / 2) : 0) + (o.size || 11) * 0.88;
      const ax = o.align === "center" ? (x + w / 2) * I : o.align === "right" ? (x + w) * I : x * I;
      for (const l of lines) { if (yy > (y + h) * I + lh * 2 && h < 5) break; if (sp && o.align && o.align !== "left") { const tw = doc.getTextWidth(l.ln) + sp * Math.max(0, l.ln.length - 1); doc.text(l.ln, o.align === "right" ? ax - tw : ax - tw / 2, yy); } else doc.text(l.ln, ax, yy, { align: o.align || "left" }); yy += lh + l.gap; } doc.setCharSpace(0); },
    table(head, rows, x, y, w, o) { const cs = {}; head.forEach((_, i) => { cs[i] = { halign: o.align ? o.align[i] : "left", ...(o.colW ? { cellWidth: o.colW[i] * I } : {}) }; }); const start = doc.getNumberOfPages();
      doc.autoTable({ startY: y * I, margin: { left: x * I, right: (10 - x - w) * I, top: 0.6 * I, bottom: 0.6 * I }, head: [head.map(clean)], body: rows.map((r) => r.map(clean)), theme: "grid",
        styles: { font: "helvetica", fontSize: o.size || 9, textColor: rfHex(RF.ink), cellPadding: 3.5, lineColor: rfHex(RF.line), lineWidth: 0.5, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: rfHex(RF.navy), textColor: [255, 255, 255], fontStyle: "bold" }, alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: cs,
        didParseCell: (d) => { if (d.section === "body" && o.color) { const c = o.color(d.row.index, d.column.index); if (c) { d.cell.styles.textColor = rfHex(c); d.cell.styles.fontStyle = "bold"; } } },
        didDrawPage: () => { const n = doc.getNumberOfPages(); if (n > start && !chrome.includes(n)) { chrome.push(n); font({ size: 8, color: RF.mute }); doc.setCharSpace(1.5); doc.text((o.part || "").toUpperCase(), 0.5 * I, 5.45 * I); font({ size: 9, color: RF.mute, font: "serif", bold: true }); doc.text("GD PRIME", 9.9 * I - doc.getTextWidth("GD PRIME") - 1.5 * 7, 0.38 * I); doc.setCharSpace(0); } } }); },
    chart(kind, title, labels, series, x, y, w, h, fmt = (v) => Number(v).toLocaleString("en-PH")) { font({ size: 11, color: RF.navy, font: "serif", bold: true }); doc.text(clean(title), x * I, y * I + 11);
      const top = y * I + 26, bot = (y + h) * I - (series.length > 1 ? 26 : 14), hh = bot - top, max = Math.max(1, ...series.flatMap((d) => d.values)), gw = (w * I) / labels.length;
      doc.setDrawColor(...rfHex(RF.line)); doc.setLineWidth(0.5); [0, 0.5, 1].forEach((f) => doc.line(x * I, bot - hh * f, (x + w) * I, bot - hh * f));
      if (kind === "line") { const d = series[0]; const pt = (i) => [x * I + gw * i + gw / 2, bot - (hh * d.values[i]) / max]; doc.setDrawColor(...rfHex(d.color)); doc.setLineWidth(2);
        for (let i = 1; i < labels.length; i++) doc.line(...pt(i - 1), ...pt(i)); doc.setFillColor(...rfHex(d.color)); labels.forEach((_, i) => doc.circle(...pt(i), 3, "F"));
        font({ size: 8, color: RF.ink, bold: true }); doc.text(clean(fmt(d.values.at(-1))), pt(labels.length - 1)[0], pt(labels.length - 1)[1] - 7, { align: "center" }); }
      else { const bw = (gw - 12) / series.length; series.forEach((d, si) => d.values.forEach((v, i) => { const bh = (hh * v) / max; doc.setFillColor(...rfHex(d.color)); doc.rect(x * I + gw * i + 6 + si * bw, bot - bh, bw - 2, bh, "F");
        if (series.length === 1) { font({ size: 7, color: RF.slate }); doc.text(clean(fmt(v)), x * I + gw * i + gw / 2, bot - bh - 3, { align: "center" }); } })); }
      font({ size: 8, color: RF.slate }); labels.forEach((l, i) => doc.text(l, x * I + gw * i + gw / 2, bot + 10, { align: "center" }));
      if (series.length > 1) { let lx = x * I; series.forEach((d) => { doc.setFillColor(...rfHex(d.color)); doc.rect(lx, bot + 17, 7, 7, "F"); font({ size: 8, color: RF.slate }); doc.text(d.name, lx + 10, bot + 23.5); lx += doc.getTextWidth(d.name) + 26; }); } },
    async out() { const n = doc.internal.getNumberOfPages(); for (const i of chrome) { doc.setPage(i); font({ size: 8, color: RF.mute }); doc.text(`${i}`, 9.5 * I, 5.45 * I, { align: "right" }); } return doc.output("blob"); } };
  return D;
}
async function rfPptx(R) {
  let Pp; try { Pp = await loadLib("pptx"); } catch { toast("Couldn't load the PowerPoint tools. Check your connection and try again."); return false; }
  const sc = S.repScope || "all"; const D = rfPptDeck(Pp, R); rfPlan(D, R, exData(R.month, sc), modData(R.month, sc), await rfAssets()); return saveBlob(repFile(R, "pptx"), await D.out());
}
async function rfPdf(R) {
  let J; try { J = await loadLib("pdf"); await loadLib("pdfTable"); } catch { toast("Couldn't load the PDF tools. Check your connection and try again."); return false; }
  const sc = S.repScope || "all"; const D = rfPdfDeck(J); rfPlan(D, R, exData(R.month, sc), modData(R.month, sc), await rfAssets()); return saveBlob(repFile(R, "pdf"), await D.out());
}
reportPdf = rfPdf; reportPptx = rfPptx;
/* ---- On-screen report in the same format: skyline cover, contents, numbered sections, blue accents, closing panel ---- */
EXC.navy = "#0A1F44"; EXC.gold = "#3B82F6"; EXC.grid = "#E2E8F0"; EXC.ink = "#1E293B"; EXC.mute = "#64748B";
{ const b = VIEWS.report; VIEWS.report = (...a) => { let h = b(...a); const m = S.repMonth || todayISO().slice(0, 7), sc = S.repScope || "all"; let R; try { R = reportData(m, sc); } catch { return h; }
  const sec = (n, id) => `<span class="rf-eyebrow" id="rf-${id}"><b>${String(n).padStart(2, "0")}</b>${esc(RF_PARTS[n - 1][0])}</span>`;
  h = h.replace(/<section class="ex-cover">[\s\S]*?<\/section>/, (c) => { const inp = (c.match(/<label class="field rep-month">[\s\S]*?<\/label>/) || [""])[0];
    return `<section class="ex-cover rf-cover"><img src="${CO_LOGO}" alt="" class="rf-logo"><div class="rf-cv"><span class="rf-brand">GD&nbsp;&nbsp;PRIME</span><span class="rf-corp">Property Management Corporation</span>
      <h1>Monthly HR Report<span>${esc(R.label)}</span></h1><p>${esc(R.scope)} · Prepared ${esc(fmtDate(todayISO()))}</p><span class="rf-for">Prepared for: Management</span></div>${inp}</section>`; });
  const toc = `<nav class="card rf-toc" aria-label="Report contents"><div><span class="rf-eyebrow">Contents</span><h2>What's inside.</h2></div><ol>${RF_PARTS.map(([t, s], i) => `<li><a href="#" data-rf-jump="${i + 1}"><b>${String(i + 1).padStart(2, "0")}</b><span>${esc(t)}<small>${esc(s)}</small></span></a></li>`).join("")}</ol></nav>`;
  h = h.replace(/(<\/div>\s*)(<section class="card ex-summary">)/, `$1${toc}$2`);
  h = h.replace('<section class="card ex-summary"><div class="card-head"><h2>Executive summary</h2>', `<section class="card ex-summary"><div class="card-head rf-head">${sec(1, 1)}<h2>Executive summary</h2>`);
  h = h.replace('<section class="ex-kpis">', `<div class="rf-kh">${sec(2, 2)}<h2>Key figures</h2></div><section class="ex-kpis">`);
  h = h.replace('<div class="card-head"><h2>Six-month trends</h2>', `<div class="card-head rf-head">${sec(3, 3)}<h2>Six-month trends</h2>`);
  h = h.replace('<div class="card-head"><h2>Analysis</h2>', `<div class="card-head rf-head">${sec(4, 4)}<h2>Findings</h2>`);
  h = h.replace('<div class="card-head"><h2>Recommended actions</h2>', '<div class="card-head rf-head"><span class="rf-eyebrow"><b>04</b>Findings &amp; Actions</span><h2>Recommended actions</h2>');
  h = h.replace('<div class="card-head"><h2>Analysis by module and submodule</h2>', `<div class="card-head rf-head">${sec(5, 5)}<h2>Analysis by module and submodule</h2>`);
  h = h.replace('<summary><h2 style="display:inline">Appendix: detailed tables</h2>', `<summary>${sec(6, 6)}<h2 style="display:inline">Detailed tables</h2>`);
  return h + `<section class="rf-close"><span class="rf-ty">Thank you</span><h2>Always there for you.</h2><p>Prepared by Human Resources from live records in the HR system. For questions about this report, please contact HR at the Head Office.</p>
    <div class="rf-panel"><img src="${RF_IMG.qr}" alt="Company QR code">${[...RF_CO.offices, ["CONTACT", RF_CO.contact], ["DIGITAL", RF_CO.digital]].map(([t, ls]) => `<div><b>${esc(t)}</b>${ls.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`).join("")}</div></section>`; }; }
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-rf-jump]"); if (!t) return; ev.preventDefault(); const n = +t.dataset.rfJump; const el = document.getElementById("rf-" + n); if (!el) return;
  const d = el.closest("details"); if (d) d.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); });
{ const st = document.createElement("style"); st.textContent = `
.rf-cover{position:relative;align-items:flex-end;min-height:260px;padding:30px 30px 26px 40px !important;background:#071226 url("${RF_IMG.cover}") center/cover no-repeat !important;border:0 !important;overflow:hidden}
.rf-cover::before{content:"";position:absolute;left:28px;top:70px;bottom:40px;width:4px;background:#3B82F6;border-radius:2px}
.rf-logo{position:absolute;right:22px;top:18px;width:58px;height:58px;border-radius:50%;background:#fff;padding:2px}
.rf-cv{flex:1;min-width:240px;display:flex;flex-direction:column;gap:2px}.rf-brand{font-family:Georgia,"Playfair Display",serif;font-weight:700;letter-spacing:.42em;color:#60A5FA;font-size:15px}
.rf-corp{font-family:Georgia,serif;letter-spacing:.24em;text-transform:uppercase;color:#CBD5E1;font-size:12.5px;margin-bottom:14px}
.rf-cover h1{font-family:Georgia,"Playfair Display",serif !important;font-size:42px !important;line-height:1.08;margin:0 0 8px !important;color:#fff !important}.rf-cover h1 span{display:block;color:#60A5FA}
.rf-cover p{color:#CBD5E1 !important;font-family:Georgia,serif;font-weight:700;font-size:15px !important}.rf-for{margin-top:12px;color:#0096FF;font-family:Georgia,serif;font-weight:700;letter-spacing:.2em;text-transform:uppercase;font-size:13px}
.rf-cover .rep-month{align-self:flex-start;margin-top:56px}
.rf-eyebrow{display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#2563EB}.rf-eyebrow b{font-family:Georgia,serif;font-size:15px;letter-spacing:.08em;color:#3B82F6}
.rf-head{flex-direction:column;align-items:flex-start !important;gap:4px}.rf-head h2,.rf-kh h2,.rf-toc h2{font-family:Georgia,"Playfair Display",serif;color:#0A1F44;margin:0}.rf-head h2::after,.rf-kh h2::after{content:"";display:block;width:44px;height:3px;background:#3B82F6;margin-top:8px;border-radius:2px}
.rf-kh{margin:4px 0 -4px}.rf-kh h2{font-size:22px}
.rf-toc{display:grid;grid-template-columns:minmax(200px,1fr) 2fr;gap:24px;align-items:center}.rf-toc h2{font-size:30px}.rf-toc ol{list-style:none;margin:0;padding:0 0 0 24px;border-left:1px solid #E2E8F0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px 24px}
.rf-toc a{display:flex;gap:12px;text-decoration:none;color:inherit}.rf-toc a b{font-family:Georgia,serif;color:#3B82F6;font-size:15px;letter-spacing:.08em}.rf-toc a span{display:flex;flex-direction:column;font-family:Georgia,serif;font-weight:700;color:#0A1F44;font-size:15px}.rf-toc a small{font-weight:400;color:#475569;font-size:12.5px;margin-top:2px}.rf-toc a:hover span{color:#2563EB}
.ex-appendix > summary{display:flex !important;flex-wrap:wrap;align-items:baseline;column-gap:8px;list-style:none !important}.ex-appendix > summary::-webkit-details-marker{display:none}.ex-appendix > summary .rf-eyebrow{flex-basis:100%;margin-bottom:4px}.ex-appendix > summary::after{content:"Show ▾";margin-left:auto;color:#2563EB;font-weight:700;font-size:13px}.ex-appendix[open] > summary::after{content:"Hide ▴"}
.rf-close{border-radius:20px;padding:34px 28px 28px;text-align:center;color:#fff;background:#071226 url("${RF_IMG.thanks}") center/cover no-repeat}
.rf-ty{font-weight:700;letter-spacing:.42em;text-transform:uppercase;color:#60A5FA;font-size:13px}.rf-close h2{font-family:Georgia,"Playfair Display",serif;font-size:38px;color:#fff;margin:8px 0 12px}.rf-close h2::after{content:"";display:block;width:56px;height:3px;background:#3B82F6;margin:14px auto 0}
.rf-close p{color:#CBD5E1;max-width:640px;margin:0 auto 22px;font-size:14.5px;line-height:1.55}
.rf-panel{display:grid;grid-template-columns:auto repeat(4,minmax(0,1fr));gap:18px;align-items:start;text-align:left;background:#0F172A;border-top:3px solid #3B82F6;border-radius:6px;padding:18px 20px}
.rf-panel img{width:92px;height:92px;border-radius:8px;background:#fff}.rf-panel b{display:block;color:#60A5FA;font-size:11.5px;letter-spacing:.2em;margin-bottom:8px}.rf-panel b::after{content:"";display:block;width:24px;height:2px;background:#3B82F6;margin-top:6px}.rf-panel span{display:block;color:#CBD5E1;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
html[data-theme="dark"] .rf-head h2,html[data-theme="dark"] .rf-kh h2,html[data-theme="dark"] .rf-toc h2,html[data-theme="dark"] .rf-toc a span{color:#E8EEF9}html[data-theme="dark"] .rf-eyebrow{color:#93C5FD}html[data-theme="dark"] .rf-toc a small{color:#AAB4C8}html[data-theme="dark"] .rf-toc ol{border-color:#33415A}
@media (max-width:760px){.rf-toc{grid-template-columns:1fr}.rf-toc ol{border-left:0;padding-left:0}.rf-panel{grid-template-columns:repeat(2,minmax(0,1fr))}.rf-panel img{grid-column:1/-1}}
@media (max-width:600px){.rf-cover{padding:24px 18px 20px 30px !important;min-height:0}.rf-cover::before{left:16px}.rf-cover h1{font-size:30px !important}.rf-logo{width:44px;height:44px}.rf-brand{font-size:13px}.rf-corp{font-size:10.5px;letter-spacing:.14em;padding-right:44px}.rf-cover .rep-month{margin-top:6px}.rf-close h2{font-size:28px}}
@media print{.rf-cover,.rf-close,.rf-panel{-webkit-print-color-adjust:exact;print-color-adjust:exact}.rf-toc{break-after:page}}`; document.head.appendChild(st); }
