/* ---------- v55 Language: English or Tagalog, chosen the first time someone opens the app ---------- */
S.lang = (() => { try { return localStorage.getItem("hr-lang") || ""; } catch { return ""; } })();
const TL = {
  // menu and common
  "My dashboard": "Aking dashboard", "My home": "Aking home", "Time clock": "Orasan", "My clock-in": "Aking time in", "My loans": "Aking mga loan", "Ask HR": "Magtanong sa HR", "HR assistant": "HR assistant",
  "My time records": "Aking time records", "My leave": "Aking leave", "My payslips": "Aking mga payslip", "My training": "Aking training", "My profile": "Aking profile", "Requests to HR": "Mga request sa HR",
  "My overtime": "Aking overtime", "My attendance": "Aking attendance", "My leave and loans": "Aking leave at loan", "My requests": "Aking mga request", "My questions": "Aking mga tanong",
  "Main menu": "Pangunahing menu", "Open menu": "Buksan ang menu", "Skip to content": "Lumaktaw sa nilalaman", "Viewing as": "Tinitingnan bilang", "Who is viewing": "Sino ang tumitingin",
  "Today": "Ngayon", "This month": "Ngayong buwan", "Date": "Petsa", "Time": "Oras", "Status": "Status", "Type": "Uri", "Reason": "Dahilan", "Amount": "Halaga", "Details": "Detalye",
  "Filed": "Na-file", "Approved": "Aprubado", "Rejected": "Hindi inaprubahan", "Cancelled": "Kinansela", "Waiting": "Naghihintay", "Waiting for approval": "Naghihintay ng approval", "Waiting for HR": "Naghihintay sa HR",
  "Completed": "Tapos na", "Draft": "Draft", "Scheduled": "Naka-schedule", "Missing": "Kulang", "Expired": "Expired", "Expires": "Mag-e-expire", "Until": "Hanggang", "From": "Mula", "To": "Hanggang",
  "Save": "I-save", "Cancel": "Kanselahin", "Submit": "Ipadala", "Send": "Ipadala", "Close": "Isara", "Delete": "Burahin", "Edit": "I-edit", "Back": "Bumalik", "Next ›": "Susunod ›", "‹ Previous": "‹ Nakaraan", "OK": "OK",
  "Preview": "Silipin", "Request": "Request", "New request": "Bagong request", "File a request": "Mag-file ng request", "Nothing yet.": "Wala pa.", "Nothing filed yet.": "Wala pang na-file.", "Nothing posted yet.": "Wala pang naka-post.",
  "No requests yet.": "Wala pang request.", "No requests in the last 60 days.": "Walang request sa nakaraang 60 araw.",
  // clock
  "Clock in or out": "Mag-time in o time out", "Time in": "Time in", "Time out": "Time out", "In": "Pasok", "Out": "Labas", "Not timed in": "Hindi pa nakapag-time in", "No punches yet today.": "Wala pang time in ngayong araw.",
  "Take a selfie": "Mag-selfie", "Take the selfie first.": "Mag-selfie muna.", "Refresh location": "I-refresh ang lokasyon", "Finding your location…": "Hinahanap ang iyong lokasyon…", "Location": "Lokasyon", "Site": "Site",
  "Your photo, time and location go to HR for your time sheet only.": "Ang iyong litrato, oras at lokasyon ay para lang sa time sheet mo sa HR.", "You can clock in and out": "Puwede kang mag-time in at time out",
  // dashboard
  "Latest net pay": "Pinakahuling net pay", "My week": "Aking linggo", "Coming holidays": "Mga paparating na holiday", "Announcements": "Mga anunsyo", "Reminders for you": "Mga paalala para sa iyo",
  "Required training": "Kailangang training", "13th month so far": "13th month sa ngayon", "estimate for the year": "tantiya para sa taon", "paid in payroll": "naibigay sa payroll", "days this month": "araw ngayong buwan",
  "Present": "Pumasok", "Late": "Late", "Absent": "Absent", "On leave": "Naka-leave", "Rest day": "Day off", "Shift": "Shift", "Hours": "Oras", "Hours worked": "Oras na nagtrabaho",
  "Your dashboard is on its way": "Darating na ang iyong dashboard", "HR needs to confirm your phone first. After that, your payslips, leave, schedule, requests and announcements show here. You can already clock in and ask HR.": "Kailangan munang kumpirmahin ng HR ang iyong phone. Pagkatapos, makikita mo rito ang payslip, leave, schedule, mga request at anunsyo. Puwede ka nang mag-time in at magtanong sa HR.",
  "No active loans.": "Walang aktibong loan.", "No loans.": "Walang loan.", "No leave requests yet.": "Wala pang leave request.", "No overtime requests.": "Walang overtime request.", "No questions yet.": "Wala pang tanong.",
  "No time records in the last 30 days.": "Walang time record sa nakaraang 30 araw.", "Your dashboard": "Iyong dashboard",
  // leave
  "Leave": "Leave", "Vacation leave": "Vacation leave", "Sick leave": "Sick leave", "Leave without pay": "Leave na walang bayad", "Balance": "Natitira", "Balances": "Mga natitirang leave", "Credits": "Credits", "Used": "Nagamit", "Left": "Natitira", "left": "natitira",
  "Vacation leave left": "Natitirang vacation leave", "File leave": "Mag-file ng leave", "Ask for extra credits": "Humingi ng dagdag na credits", "Cancel a leave": "Kanselahin ang leave", "Allocation and cancellation requests": "Mga request ng dagdag na credits at pagkansela",
  "Ask HR for extra leave credits, or to cancel a leave you already filed. Each request needs HR approval.": "Humingi sa HR ng dagdag na leave credits, o ipakansela ang leave na na-file mo na. Kailangan ng approval ng HR sa bawat request.",
  // pay
  "Earnings": "Kita", "Deductions": "Mga kaltas", "Total deductions": "Kabuuang kaltas", "Gross pay": "Gross pay", "Net pay": "Net pay", "Gross": "Gross", "Net": "Net", "Withholding tax": "Withholding tax",
  "Basic pay (half month)": "Basic pay (kalahating buwan)", "Less late and undertime": "Bawas sa late at undertime", "Pay period": "Cutoff", "Cutoff": "Cutoff", "Per cutoff": "Bawat cutoff", "Monthly": "Buwanan",
  "6 recent pay periods": "6 na huling cutoff", "Allowances, tax-free (de minimis)": "Allowance na walang tax (de minimis)", "Loans deducted from my pay": "Mga loan na kinakaltas sa sahod ko",
  "Post an approved loan": "I-post ang naaprubahang loan", "My loan posts": "Aking mga na-post na loan", "Take a photo or choose the file": "Kumuha ng litrato o pumili ng file",
  "Drop the approved loan here, or choose the file": "Ilagay dito ang naaprubahang loan, o pumili ng file",
  "For SSS and Pag-IBIG loans already approved. HR checks it, then payroll deducts it from your pay every cutoff until the last month.": "Para sa SSS at Pag-IBIG loan na aprubado na. Titingnan ito ng HR, at ikakaltas ng payroll sa sahod mo bawat cutoff hanggang sa huling buwan.",
  "Photo or PDF of the approved loan: approval notice, disclosure statement, voucher or billing": "Litrato o PDF ng naaprubahang loan: approval notice, disclosure statement, voucher o billing",
  "Reimbursements": "Mga reimbursement", "New reimbursement": "Bagong reimbursement", "Get back what you spent for work": "Ibalik ang ginastos mo para sa trabaho", "Receipt": "Resibo", "Expense": "Gastos",
  // overtime and attendance
  "Overtime": "Overtime", "My overtime requests": "Aking mga overtime request", "My actual overtime": "Aktuwal kong overtime", "actual overtime with no request": "aktuwal na overtime na walang request",
  "worked past the shift, last 45 days": "lumampas sa shift, nakaraang 45 araw", "No time worked past the shift in the last 45 days.": "Walang oras na lumampas sa shift sa nakaraang 45 araw.", "Undertime": "Undertime",
  "My attendance requests": "Aking mga attendance request", "Attendance change": "Pagbabago sa attendance", "Change schedule": "Palitan ang schedule", "Schedule exchange": "Palitan ng schedule", "Official business": "Official business",
  "My working calendar": "Aking work calendar", "My raw attendance": "Aking orihinal na attendance", "Planned shift, time in and time out": "Nakaplanong shift, time in at time out", "From my time in and time out": "Mula sa aking time in at time out",
  "Every time in and time out recorded in the last 30 days, exactly as captured.": "Lahat ng time in at time out sa nakaraang 30 araw, eksakto kung paano nakuha.",
  // profile and requests
  "About me": "Tungkol sa akin", "Address": "Address", "Birthday": "Kaarawan", "Civil status": "Civil status", "Married": "Kasal", "Single": "Walang asawa", "Mobile": "Mobile", "Email": "Email", "Emergency contact": "Taong tatawagan sa emergency",
  "Department": "Departamento", "Position": "Posisyon", "Assignment": "Assignment", "Supervisor": "Supervisor", "Date hired": "Petsa ng pagkaka-hire", "Employee no.": "Employee no.", "Bank account": "Bank account", "Add photo": "Magdagdag ng litrato",
  "Changes to my record": "Mga pagbabago sa aking record", "Request a change": "Humiling ng pagbabago", "Request a certificate": "Humiling ng certificate", "Certificates": "Mga certificate", "Submit a resignation": "Magpasa ng resignation", "Resignation notice": "Resignation notice",
  "Give HR at least 30 days' written notice.": "Magbigay sa HR ng nakasulat na abiso nang hindi bababa sa 30 araw bago umalis.",
  "New address, phone, civil status, name or government numbers. HR checks and approves each change.": "Bagong address, phone, civil status, pangalan o government numbers. Titingnan at aaprubahan ng HR ang bawat pagbabago.",
  "ID and bank numbers are masked in this view.": "Nakatago ang ID at bank numbers dito.", "Courses and certificates": "Mga kurso at certificate", "Required for my job": "Kailangan sa trabaho ko", "Course": "Kurso",
  // Ask HR and assistant
  "Ask a question": "Magtanong", "Ask a question or raise a concern": "Magtanong o magsabi ng concern", "Questions, concerns and follow-ups": "Mga tanong, concern at follow-up",
  "Nothing yet. HR answers here, and you see a red count on Ask HR when they reply.": "Wala pa. Dito sasagot ang HR, at may pulang bilang sa Magtanong sa HR kapag sumagot sila.",
  "Hi! I'm the HR assistant. Ask me about your pay, leave, schedule, loans or company policies.": "Hi! Ako ang HR assistant. Magtanong tungkol sa sahod, leave, schedule, loan o patakaran ng kumpanya.",
  "How much leave do I have left?": "Ilan pa ang natitira kong leave?", "When is the next payday?": "Kailan ang susunod na sahod?", "Why is my net pay lower this cutoff?": "Bakit mas mababa ang net pay ko ngayong cutoff?",
  "How is my 13th month computed?": "Paano kinukuwenta ang 13th month ko?", "What do I do if I forgot to time in?": "Ano ang gagawin ko kung nakalimutan kong mag-time in?",
  "Uses your own Claude account, so the first question asks your permission. Answers can be wrong; HR has the final say.": "Gumagamit ng sarili mong Claude account, kaya hihingi ito ng pahintulot sa unang tanong. Puwedeng magkamali ang sagot; ang HR pa rin ang masusunod.",
  "The assistant needs Claude, which isn't available in this view. Use Ask HR instead.": "Kailangan ng assistant ang Claude, na hindi available dito. Gamitin ang Magtanong sa HR.",
  "Speak": "Magsalita", "Speak a command": "Magsabi ng utos", "Type a command instead": "I-type na lang ang utos", "Voice commands": "Mga voice command", "What can I say?": "Ano ang puwede kong sabihin?",
  "Contributor": "Contributor", "Head Office": "Head Office",
  // language
  "Language": "Wika",
};
const TL_DAYS = { Mon: "Lun", Tue: "Mar", Wed: "Miy", Thu: "Huw", Fri: "Biy", Sat: "Sab", Sun: "Lin" };
const TL_WD = { Sunday: "Linggo", Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miyerkules", Thursday: "Huwebes", Friday: "Biyernes", Saturday: "Sabado" };
const TL_MO = { January: "Enero", February: "Pebrero", March: "Marso", April: "Abril", May: "Mayo", June: "Hunyo", July: "Hulyo", August: "Agosto", September: "Setyembre", October: "Oktubre", November: "Nobyembre", December: "Disyembre" };
const TL_RX = [
  [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d+), (\d{4})$/i, (m, d, mo, n, y) => `${TL_WD[d[0].toUpperCase() + d.slice(1).toLowerCase()]}, ${TL_MO[mo[0].toUpperCase() + mo.slice(1).toLowerCase()]} ${n}, ${y}`],
  [/^Good Morning, (.+)$/, "Magandang umaga, $1"], [/^Good Afternoon, (.+)$/, "Magandang hapon, $1"], [/^Good Evening, (.+)$/, "Magandang gabi, $1"],
  [/^Good Morning$/, "Magandang umaga"], [/^Good Afternoon$/, "Magandang hapon"], [/^Good Evening$/, "Magandang gabi"],
  [/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(,.*)?$/, (m, d, r) => TL_DAYS[d] + (r || "")],
  [/^(.+): ([\d.]+) left$/, (m, a, n) => `${tlStr(a)}: ${n} natitira`], [/^([\d.]+) days?$/, "$1 araw"], [/^([\d.]+) h$/, "$1 oras"], [/^\(([\d.]+) used\)$/, "($1 nagamit)"],
  [/^No announcements for (.+) right now\.$/, "Walang anunsyo para kay $1 ngayon."], [/^Usual shift (.+)$/, "Karaniwang shift $1"], [/^Day shift (.+)$/, "Day shift $1"],
  [/^HR still needs your (.+)\. Please send them through Ask HR\.$/, "Kailangan pa ng HR ang iyong $1. Pakipadala sa Magtanong sa HR."],
  [/^(\d+) requests?$/, "$1 request"], [/^(\d+) late · (\d+) absent$/, "$1 late · $2 absent"],
];
function tlStr(s) { if (TL[s]) return TL[s]; for (const [rx, to] of TL_RX) if (rx.test(s)) return s.replace(rx, to); return null; }
// Remember the English of anything translated, so switching back restores screens that are not re-drawn.
let tlUndo = [];
function tlApply(root) {
  if (S.lang !== "tl" || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const todo = [];
  while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest("script,style,textarea,[contenteditable],.no-tl,.bot-txt.user")) continue; const raw = n.textContent; const s = raw.replace(/\s+/g, " ").trim(); if (!s || !/[a-z]/i.test(s)) continue; const t = tlStr(s); if (t && t !== s) todo.push([n, raw.replace(s, t)]); }
  for (const [node, text] of todo) { tlUndo.push([node, null, node.textContent]); node.textContent = text; }
  for (const e of root.querySelectorAll?.("[placeholder],[aria-label],[title]") || []) for (const a of ["placeholder", "aria-label", "title"]) { const v = e.getAttribute(a); const t = v && tlStr(v.trim()); if (t && t !== v) { tlUndo.push([e, a, v]); e.setAttribute(a, t); } }
  if (tlUndo.length > 20000) tlUndo = tlUndo.filter(([n]) => n.isConnected);
}
let tlBusy = false;
new MutationObserver(() => { if (S.lang !== "tl" || tlBusy) return; tlBusy = true; try { tlApply(document.body); } finally { tlBusy = false; } }).observe(document.body, { childList: true, subtree: true, characterData: false });
{ const b = toast; toast = (msg) => b(S.lang === "tl" ? tlStr(String(msg)) || msg : msg); }
{ const b = askConfirm; askConfirm = (msg, ok = "OK", danger = false) => b(S.lang === "tl" ? tlStr(msg) || msg : msg, S.lang === "tl" ? tlStr(ok) || ok : ok, danger); }
// The HR assistant answers in the chosen language, and voice commands listen for Filipino.
{ const b = empPrompt; empPrompt = (...a) => b(...a) + (S.lang === "tl" ? "\n- Reply in Tagalog (Filipino), the way Filipino office staff write: plain and friendly. Keep common terms like payslip, leave, overtime, cutoff, SSS, PhilHealth and Pag-IBIG in English." : ""); }
{ const b = hrPrompt; hrPrompt = (...a) => b(...a) + (S.lang === "tl" ? "\n- Reply in Tagalog (Filipino), keeping common HR and payroll terms in English." : ""); }
function setLang(l) { S.lang = l; try { localStorage.setItem("hr-lang", l); } catch {} document.documentElement.lang = l === "tl" ? "fil" : "en";
  if (S.realEdit && S.myId && S.access && S.access.users?.[S.myId]?.lang !== l) S.db?.doc("org/access").update({ users: { [S.myId]: { lang: l } } }).catch(() => {});
  document.querySelector(".lang-back")?.remove();
  if (l !== "tl") { for (const [n, a, v] of tlUndo) if (n.isConnected) a ? n.setAttribute(a, v) : (n.textContent = v); tlUndo = []; }
  render(); renderNav?.(); }
function askLang() {
  if (S.lang || document.querySelector(".lang-back")) return;
  const back = document.createElement("div"); back.className = "ac-back lang-back no-tl";
  back.innerHTML = `<div class="ac-box" role="dialog" aria-modal="true" aria-labelledby="lang-h" style="text-align:center"><img src="${CO_LOGO}" alt="" width="56" height="56" style="border-radius:50%;margin-bottom:8px">
    <h2 id="lang-h" style="font-size:20px;margin:0 0 4px">Choose your language</h2><p style="margin:0 0 16px;color:#5F6472">Piliin ang iyong wika</p>
    <div style="display:grid;gap:10px"><button class="btn btn-primary" data-lang="en" style="justify-content:center;min-height:48px">English</button><button class="btn btn-gold" data-lang="tl" style="justify-content:center;min-height:48px">Tagalog</button></div>
    <p style="margin:14px 0 0;font-size:12.5px;color:#5F6472">You can change this anytime in the menu. · Puwede mo itong palitan anumang oras sa menu.</p></div>`;
  document.body.appendChild(back); back.querySelector('[data-lang="en"]').focus();
}
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-lang]"); if (!t) return; ev.preventDefault(); ev.stopImmediatePropagation(); setLang(t.dataset.lang); }, true);
// Ask once, after the app has loaded and the person's saved choice (if any) is known.
setTimeout(function chk(n = 0) { const saved = S.access?.users?.[S.myId]?.lang; if (!S.lang && saved) { setLang(saved); return; } if (!S.lang) { if (n < 4 && !S.access && S.realEdit) { setTimeout(() => chk(n + 1), 1500); return; } askLang(); } else document.documentElement.lang = S.lang === "tl" ? "fil" : "en"; }, 2500);
// A switch at the bottom of the menu.
{ const b = renderNav; renderNav = (...a) => { const r = b(...a); const nav = $("#nav"); if (nav && !nav.querySelector(".lang-sw")) nav.insertAdjacentHTML("beforeend", `<div class="lang-sw no-tl" role="group" aria-label="Language / Wika"><span>${S.lang === "tl" ? "Wika" : "Language"}</span><button data-lang="en" aria-pressed="${S.lang !== "tl"}">English</button><button data-lang="tl" aria-pressed="${S.lang === "tl"}">Tagalog</button></div>`); return r; }; }
{ const st = document.createElement("style"); st.textContent = `.lang-sw{display:flex;align-items:center;gap:6px;margin:14px 12px 18px;font-size:12.5px;color:#C9D2E6}.lang-sw span{margin-right:auto}
.lang-sw button{border:1px solid rgba(201,164,92,.45);background:transparent;color:#fff;border-radius:99px;padding:5px 11px;font:inherit;font-weight:700;cursor:pointer;min-height:32px}.lang-sw button[aria-pressed="true"]{background:#C9A45C;color:#0D1729;border-color:#C9A45C}`; document.head.appendChild(st); }
