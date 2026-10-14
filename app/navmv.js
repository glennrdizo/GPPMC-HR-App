/* Menu (Glenn 2026-10-14): Performance and Company Assets move from Recruitment to People, right after Organization.
   Same pages and view names, so saved roles and links keep working. */
{ const ppl = NAV.find(([g]) => g === "People"); const tal = NAV.find(([g]) => g === "Talent");
  if (ppl && tal) { const moved = ["perf", "property"].map((v) => { const i = tal[1].findIndex(([x]) => x === v); return i >= 0 ? tal[1].splice(i, 1)[0] : null; }).filter(Boolean);
    const o = ppl[1].findIndex(([v]) => v === "org"); ppl[1].splice(o >= 0 ? o + 1 : ppl[1].length, 0, ...moved); } }

/* Project hiring by level (Glenn 2026-10-14): Officers and Managers, and Rank and File, as indented pages under Project hiring.
   A job's level is set on the job form; jobs without one are sorted by their title. */
const JOB_LEVELS = [["om", "Officers and Managers"], ["rf", "Rank and File"]];
const jobLevel = (j) => j?.level || (/manager|officer|supervisor|superintendent|head|chief|director|executive|lead|coordinator|engineer|architect|accountant|specialist|analyst/i.test(`${j?.title || ""} ${pos(j?.posId)?.title || ""}`) ? "om" : "rf");
{ const tal = NAV.find(([g]) => g === "Talent"); const h = tal?.[1].find(([v]) => v === "hiring"); const k = h?.[3]?.find(([v]) => v === "hireprj");
  if (k) k[3] = [["hireprj_om", "Officers and Managers", "star"], ["hireprj_rf", "Rank and File", "people"]];
  Object.assign(SECTION_OF, { hireprj_om: "hireprj", hireprj_rf: "hireprj" }); }
const lvTabs = () => `<div class="tabs" role="tablist" style="margin-top:-4px">${[["hireprj", "All project jobs"], ["hireprj_om", "Officers and Managers"], ["hireprj_rf", "Rank and File"]].map(([v, l]) => `<button class="tab" role="tab" data-go="${v}" aria-selected="${S.view.name === v}">${l}</button>`).join("")}</div>`;
function hiringByLevel(lv) {
  const all = { jobs: S.jobs, apps: S.apps }; const jobs = new Map([...S.jobs].filter(([, j]) => !j.projectId || jobLevel(j) === lv)); let html;
  try { S.jobs = jobs; S.apps = new Map([...S.apps].filter(([, a]) => jobs.has(a.jobId))); html = hiringScoped("prj"); } finally { S.jobs = all.jobs; S.apps = all.apps; }
  const name = JOB_LEVELS.find(([k]) => k === lv)[1];
  html = html.replace(/(<h1[^>]*>)Recruitment · Projects(<\/h1>)/, `$1Project hiring · ${name}$2`);
  const i = html.indexOf('<div class="tabs on-blue"'); const e = i >= 0 ? html.indexOf("</div>", i) + 6 : -1;
  return e > 5 ? html.slice(0, e) + lvTabs() + html.slice(e) : lvTabs() + html;
}
VIEWS.hireprj_om = () => hiringByLevel("om");
VIEWS.hireprj_rf = () => hiringByLevel("rf");
{ const b = VIEWS.hireprj; VIEWS.hireprj = (...x) => { const h = b(...x); const i = h.indexOf('<div class="tabs on-blue"'); const e = i >= 0 ? h.indexOf("</div>", i) + 6 : -1; return e > 5 ? h.slice(0, e) + lvTabs() + h.slice(e) : h; }; }
// Job form: Level (project jobs only use it for the split, but every job can carry it).
{ const b = VIEWS.jobForm; VIEWS.jobForm = (...x) => { const h = b(...x); const j = S.view.id ? S.jobs.get(S.view.id) : null; const cur = j?.level || "";
    const sel = `<div class="field"><label for="jf-level">Level</label><select class="input" id="jf-level" name="level"><option value="">Set by job title${j ? ` (now ${esc(JOB_LEVELS.find(([k]) => k === jobLevel(j))[1])})` : ""}</option>${JOB_LEVELS.map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
    const m = h.match(/<div class="field"><label for="[^"]*empType"/); return m ? h.replace(m[0], sel + m[0]) : h; }; }
{ const b = submitJob; submitJob = async (f) => { const lv = f.elements.level?.value || null; await b(f); const j = S.view.name === "job" ? S.jobs.get(S.view.id) : null; if (j && (j.level || null) !== lv) { try { await put("jobs", { ...j, level: lv }); render(); } catch {} } }; }
{ const b = VIEWS.job; VIEWS.job = (...x) => { const h = b(...x); const j = S.jobs.get(S.view.id); if (!j?.projectId) return h; return h.replace(/(<dl class="facts"[^>]*>)/, `$1${tfact("Level", esc(JOB_LEVELS.find(([k]) => k === jobLevel(j))[1]))}`); }; }
