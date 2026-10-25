/* ---------- Hiring to onboarding (Glenn 2026-10-20: full automation) ----------
   The applicant accepts the job offer on the careers page (hr_offer_respond). Once the offer is accepted, a start date is set
   and HR has accepted every pre-employment requirement, the scheduled run (runner.js) hires the applicant by itself: it creates
   the 201 file with the next employee number, copies the SSS, PhilHealth, Pag-IBIG and TIN numbers and the requirement files
   the applicant sent, starts the onboarding checklist and marks the applicant hired. The notice job then emails the new hire
   their employee number and how to open their employee account; on the website that account is approved and linked by itself
   when it is made with the same email (hosted.js). HR can switch hiring by itself off on Offer letter requests. */
const HA_DEF = { on: true };
const HA = () => ({ ...HA_DEF, ...(S.ops?.hireAuto || {}) });
/* Next employee number in the company's own pattern: the most common "<prefix><number>" among all employees, plus one. */
function hireNextNo() {
  const by = new Map();
  for (const e of (S.allEmps || S.emps).values()) { const m = /^(.*?)(\d+)$/.exec(String(e.no || "").trim()); if (!m) continue;
    const g = by.get(m[1]) || { n: 0, max: 0, w: 0 }; g.n++; g.max = Math.max(g.max, Number(m[2])); g.w = Math.max(g.w, m[2].length); by.set(m[1], g); }
  const [pre, g] = [...by.entries()].sort((a, b) => b[1].n - a[1].n)[0] || ["EMP-", { max: 0, w: 4 }];
  const taken = new Set([...(S.allEmps || S.emps).values()].map((e) => String(e.no || "").toLowerCase()));
  for (let k = g.max + 1; ; k++) { const no = pre + String(k).padStart(g.w, "0"); if (!taken.has(no.toLowerCase())) return no; }
}
const hireReqsDone = (a) => PRE_REQS.every(([k]) => a.reqs?.[k] || a.portal?.reqs?.[k]?.status === "ACCEPTED");
const hireWaits = (a) => {
  if (a.empId || ["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage) || a.sample) return null;
  if (a.offer?.status !== "ACCEPTED") return null; const w = [];
  if (!(a.offer.start || a.olr?.start)) w.push("a start date on the offer");
  const left = PRE_REQS.filter(([k]) => !(a.reqs?.[k] || a.portal?.reqs?.[k]?.status === "ACCEPTED")).map(([, l]) => l); if (left.length) w.push(`${left.length} ${left.length === 1 ? "requirement" : "requirements"} (${left.join(", ")})`);
  return w;
};
async function hireAuto(a) {
  const j = S.jobs.get(a.jobId); const o = { ...(a.olr || {}), ...(a.offer || {}) }; const start = o.start; const no = hireNextNo();
  const status = STATUS[a.olr?.empType] ? a.olr.empType : STATUS[j?.empType] ? j.empType : "PROBATIONARY";
  const proj = j?.projectId ? S.projects.get(j.projectId) : null; const title = a.olr?.title || pos(j?.posId)?.title || j?.title || "employee";
  const num = (k) => { const v = a.portal?.reqs?.[k]?.num; return v ? String(v).trim().slice(0, 40) : null; };
  const docs = [...(a.resume ? [{ id: a.resume.id, kind: "Resume", name: a.resume.name || "Resume", at: todayISO(), exp: null }] : []),
    ...PRE_REQS.filter(([k]) => a.portal?.reqs?.[k]?.file).map(([k, l]) => ({ id: a.portal.reqs[k].file, kind: l, name: a.portal.reqs[k].name || l, at: todayISO(), exp: null })),
    ...Object.entries(a.portal?.back || {}).filter(([, f]) => f?.file).map(([k, f]) => ({ id: f.file, kind: "Signed document", name: f.name || (a.portal?.shared || []).find((s) => s.id === k)?.name || "Signed document", at: todayISO(), exp: null }))];
  const e = { id: uid(), no, first: a.first, middle: a.middle || null, last: a.last, suffix: null, title: null, photo: null, birth: a.birth || null, gender: a.gender || null, civil: null, email: a.email || null, mobile: a.mobile || null, address: a.address || null,
    emergencyName: null, emergencyRelation: null, emergencyPhone: null, tin: num("tin"), sss: num("sss"), philhealth: num("philhealth"), pagibig: num("pagibig"), hire: start, status, payType: o.payType || j?.payType || "MONTHLY", basicPay: Number(o.rate) || 0,
    deptId: j?.deptId || null, posId: j?.posId || null, supervisorId: j?.mgrId || null, projectId: proj?.id || null, projectRole: proj ? title : null, projectSince: proj ? start : null, projectUntil: proj && status === "PROJECT_BASED" ? proj.end || null : null,
    separated: null, shiftId: "day", bank: null, bankAcct: null, docs, appId: a.id,
    history: [{ d: start, kind: "Hired", text: `Hired as ${title} (${STATUS[status][0]}) from the ${j?.title || ""} job opening; offer accepted on the careers page and hired by the scheduled run` }] };
  await saveEmp(e); S.emps.set(e.id, e); await startOnboarding(e);
  await put("applicants", { ...a, stage: "HIRED", stageAt: todayISO(), empId: e.id, autoHired: new Date().toISOString() });
  if (j && jobHired(j) >= j.slots && j.status === "OPEN") await put("jobs", { ...j, status: "FILLED" });
  logActivity(`Hired ${fullName(e)} (${e.no}) as ${title} by the scheduled run: offer accepted and requirements complete`);
  return e;
}
async function hireJob() {
  if (!S.realEdit || !S.canEdit || !HA().on || !S.apps) return;
  for (const a of listOf(S.apps)) { const w = hireWaits(a); if (!w || w.length) continue;
    if ([...(S.allEmps || S.emps).values()].some((e) => e.appId === a.id)) continue; // already made, the applicant save failed
    await hireAuto(a); }
}
RUN_JOBS.push(["hire", "Hiring accepted offers", () => hireJob()]);

/* Applicant page: what the automatic hire still waits for. */
{ const b = VIEWS.applicant; VIEWS.applicant = (...x) => { const h = b(...x); const a = S.apps.get(S.view.id); if (!a) return h; const w = hireWaits(a); if (!w) return h;
  const card = `<section class="card"><div class="card-head"><h2>${icon("door", 18)} Hiring by itself</h2>${w.length ? '<span class="chip c-warn">Waiting</span>' : '<span class="chip c-ok">Ready</span>'}</div>
    <p style="margin:0">${esc(a.first)} accepted the offer${a.offer?.via === "careers" ? " on the careers page" : ""}. ${!HA().on ? "Hiring by itself is switched off, so hire from this page." : w.length ? `The 201 file is made by itself once HR has ${esc(w.join(" and "))}.` : "The 201 file and onboarding will be made on the next scheduled run, with the next employee number."}</p></section>`;
  const i = h.indexOf('<section class="card"><div class="steps"'); return i >= 0 ? h.slice(0, i) + card + h.slice(i) : h + card; }; }
/* Offer letter requests: the switch */
{ const b = VIEWS.olr; if (b) VIEWS.olr = (...x) => { const h = b(...x); if (!S.canEdit) return h;
  const sw = `<section class="card"><label class="check"><input type="checkbox" data-ha-on ${HA().on ? "checked" : ""}><span><b>Hire by itself</b><div class="t-muted" style="font-size:13px">When the applicant accepts the offer and every requirement is accepted, the scheduled run makes the 201 file with the next employee number (${esc(hireNextNo())}), starts onboarding and emails the new hire how to open their employee account.</div></span></label></section>`;
  const i = h.indexOf('<div class="tabs'); return i >= 0 ? h.slice(0, i) + sw + h.slice(i) : h + sw; }; }
document.addEventListener("change", async (ev) => {
  const t = ev.target.closest?.("[data-ha-on]"); if (!t || !S.canEdit) return;
  const next = { ...(S.ops || {}), hireAuto: { ...HA(), on: t.checked } };
  try { await S.db.doc("org/ops").set(JSON.parse(JSON.stringify(next))); S.ops = next; S.ver++; logActivity(`${t.checked ? "Turned on" : "Turned off"} hiring by itself`); toast("Saved."); render(); } catch { toast("Couldn't save. Try again."); render(); }
});
