/* ---------- GPPMC New hire onboarding checklist (Glenn 2026-10-13, from "00 ONBOARDING CHECKLIST.xlsx"): two forms, Head office (HR sheet) and Property / project (PROPERTY sheet),
   grouped by stage, with "If passed" / "If failed" outcomes at the end of probation. ---------- */
const OB_STAGES = [["offer", "Offer acceptance", -7], ["papers", "Paperwork and documentation", 0], ["welcome", "Warm welcome", 0], ["orient", "Orientation", 7], ["pre", "Pre-first day", -1], ["day1", "First day", 0],
  ["wk1", "First week", 7], ["m1", "First month", 30], ["m2", "Second month", 60], ["m4", "Fourth month", 120], ["m5", "Fifth month", 150], ["m6", "Sixth month", 180]];
const OB_ONLY = { project: "Project employees only", ho: "Head office employees only", acct: "Accounting employees only" };
const obI = (stage, k, label, who, x = {}) => ({ k, label, who, stage, ...x });
const OB_COMMON_HEAD = [
  obI("offer", "offer", "Give an official job offer", "Recruitment", { only: "project" }),
  obI("offer", "ctrgive", "Give an employment contract", "Recruitment"),
  obI("offer", "contract", "Collect signed job offer, employment contract, and any on-boarding documentation", "Recruitment"),
  obI("papers", "docs", "Ensure completion 201 Folder", "Recruitment"),
  obI("papers", "hris", "Encode to HRIS", "HR & Admin Staff"),
  obI("papers", "xls", "Encode to excel file masterlist", "HR Officer"),
  obI("papers", "bank", "Obtain ATM authorization and authority to deposit information", "Recruitment"),
  obI("papers", "gov", "Report to SSS (R-1A), PhilHealth (ER2) and Pag-IBIG within 30 days", "HR Officer"),
  obI("papers", "bir", "Get BIR 2316 from the previous employer, or register the TIN (BIR 1902)", "Payroll"),
  obI("papers", "tmpidprep", "Prepare of temporary ID (upon request by recruitment)", "IT"),
  obI("papers", "id", "Issuance of temporary ID", "Recruitment"),
  obI("welcome", "welproj", "Warm welcome for project employees", "Property Manager", { only: "project" }),
  obI("welcome", "welho", "Warm welcome for head office (in-house) employees", "HR Officer", { only: "ho" }),
  obI("orient", "orient", "Overview of company culture, values, and mission", "HR Officer"),
  obI("orient", "policy", "Company policy and code of conduct", "HR Officer"),
  obI("orient", "rules", "Workplace rules and regulation", "HR Officer"),
  obI("orient", "jd", "Review the employee's job description, responsibilities, and goals", "HR Officer"),
  obI("orient", "orgchart", "Explain the organizational chart", "HR Officer"),
  obI("orient", "hrisor", "HRIS Orientation", "HR Officer"),
  obI("orient", "acct", "Accounting rules and procedures", "Accounting Manager/ Staff", { only: "acct" }),
  obI("orient", "ops", "Operations rules and procedures", "BD Officer", { only: "project" }),
  obI("pre", "welmail", "Welcome email contains of first day instruction, schedule, location, and important things to bring", "Recruitment"),
  obI("pre", "workspace", "Prepare workspace, computer, and other necessary equipment", "IT"),
  obI("pre", "email", "Create corporate email (upon request by recruitment)", "IT"),
  obI("pre", "endorse", "Endorse employee to Property Management Office", "Recruitment", { only: "project" }),
  obI("day1", "login", "Provide log-in details of the company system and software", "HR and Admin Staff"),
  obI("day1", "bio", "Register in biometrics", "PM / PA"),
  obI("day1", "viber", "Add the employee to appropriate Viber group", "HR Officer"),
];
const OB_END = [
  obI("m6", "passlet", "Issue successful probationary letter", "HR Staff / Officer", { out: "pass" }),
  obI("m6", "hmo", "Issue HMO and Dental Card", "HR Staff / Officer", { out: "pass" }),
  obI("m6", "permid", "Issue permanent company ID", "HR Staff / Officer", { out: "pass" }),
  obI("m6", "leaveben", "Discuss to employee their leave benefits", "HR Staff / Officer", { out: "pass" }),
  obI("m6", "faillet", "Issue notice of failure letter", "HR Staff / Officer", { out: "fail" }),
];
const OB_PROP_MID = [
  obI("day1", "tour", "Tour employee to the property", "Property Manager", { only: "project" }),
  obI("day1", "intro", "Introduce the employee to their colleagues", "Property Manager", { only: "project" }),
  obI("day1", "house", "Review property house rules", "Property Manager", { only: "project" }),
  obI("day1", "propor", "Basic property orientation including the facilities and emergency procedures", "Property Manager", { only: "project" }),
  obI("wk1", "svc", "Overview on the company's services and clients", "Immediate Sup"),
  obI("wk1", "hier", "Explain the organization's hierarchy and reporting structure", "Immediate Sup"),
  obI("wk1", "expect", "Set clear expectations for performance, communication, and behavior", "Immediate Sup"),
  obI("wk1", "metrics", "Clarify performance metrics and how success will be measured", "Immediate Sup"),
  obI("wk1", "role", "Review the employee's role within larger team projects or departmental goals", "Immediate Sup"),
  obI("wk1", "tools", "Offer training sessions on any relevant software, tools, or processes", "HR Officer"),
  obI("wk1", "buddy", "To help the new employee adjust, assign a mentor or buddy", "Immediate Sup"),
  obI("wk1", "growth", "Discuss opportunities for growth and career development", "Immediate Sup"),
  obI("m1", "uniform", "Issuance of company uniform", "Executive Admin Officer"),
  obI("m1", "train1", "Continue training sessions as needed and provide additional training based on identified needs", "Immediate Sup / HR"),
  obI("m1", "prog1", "Review progress toward goals and offer constructive feedback", "Immediate Sup"),
  obI("m1", "goals1", "Set up a meeting to discuss the employee's goals and expectations", "Immediate Sup / HR"),
  obI("m1", "cross", "Introduce the employee to cross-functional teams and departments", "HR Officer"),
  obI("m1", "meet1", "Encourage participation in team meetings and activities", "Immediate Sup"),
  obI("m1", "tasks1", "Review any initial projects or tasks and offer guidance", "Immediate Sup"),
  obI("m1", "fb1", "Encourage the employee to provide feedback on their onboarding experience", "Immediate Sup"),
  obI("m2", "rev2", "Conduct a formal performance review, discussing strengths, areas for improvement, and goal-setting sessions", "Immediate Sup"),
  obI("m2", "exp2", "Review and set clear expectations for the upcoming 4th & 5th month evaluation", "Immediate Sup"),
  obI("m2", "train2", "Offer additional training or workshops to enhance skills", "Immediate Sup"),
  obI("m2", "ideas2", "Encourage the employee to share their insights and ideas for process improvement", "Immediate Sup"),
  obI("m2", "career2", "Discuss long-term career goals and opportunities for advancement", "Immediate Sup"),
  obI("m2", "voice2", "Encourage the employee to voice any concerns or suggestions for improvement", "Immediate Sup"),
  obI("m4", "rev4", "Conduct a formal performance review, discussing strengths, areas for improvement, and goal-setting session", "Immediate Sup"),
  obI("m4", "exp4", "Review and set clear expectations for the upcoming 5th-month evaluation", "Immediate Sup"),
  obI("m5", "rev5", "Conduct a formal performance review, discussing strengths, areas for improvement, and goal-setting session", "Immediate Sup"),
  obI("m5", "exp5", "Review and set clear expectations for the end of probationary", "Immediate Sup"),
];
TDEF.onboardHO = [...OB_COMMON_HEAD, ...OB_END];
TDEF.onboardProp = [...OB_COMMON_HEAD, ...OB_PROP_MID, ...OB_END];
const obIsAcct = (e) => /account|finance/i.test(`${dept(e.deptId)?.name || ""} ${pos(e.posId)?.title || ""}`);
const obFits = (i, e) => !i.only || (i.only === "project" ? !!e.projectId : i.only === "ho" ? !e.projectId : i.only === "acct" ? obIsAcct(e) : true);
const obStageOf = (k) => OB_STAGES.find((s) => s[0] === k);

startOnboarding = async (e) => {
  const T = TSET(); const tpl = e.projectId ? T.onboardProp : T.onboardHO;
  const items = tpl.filter((i) => obFits(i, e)).map(({ k, label, who, stage, out }) => ({ k, label, who, stage: stage || null, out: out || null, done: null }));
  await put("onboard", { id: e.id, empId: e.id, start: e.hire, form: e.projectId ? "prop" : "ho", items, done: null });
};

/* "If passed" and "If failed" are either-or: ticking one side marks the other side Not needed, so the checklist can finish. */
{ const b = toggleCheck; toggleCheck = async (kind, empId, i, on) => {
    const o = kind === "onboard" ? S.onb.get(empId) : null; const it = o?.items?.[i];
    if (!it?.out) return b(kind, empId, i, on);
    const today = todayISO(); let items = o.items.map((x, n) => (n === i ? { ...x, done: on ? today : null, na: false } : x));
    const mine = items.some((x) => x.out === it.out && x.done && !x.na);
    items = items.map((x) => (x.out && x.out !== it.out ? (mine ? (x.done ? x : { ...x, done: today, na: true }) : (x.na ? { ...x, done: null, na: false } : x)) : x));
    const all = items.every((x) => x.done);
    await put("onboard", { ...o, items, done: all ? today : null, result: mine ? it.out : null });
    if (all && !o.done) { logActivity(`Completed onboarding for ${empName(empId)}`); toast("Onboarding complete."); }
    render();
  }; }

/* Checklist page: the company's form, grouped by stage with a target date for each stage. */
VIEWS.onboard = () => {
  const o = S.onb.get(S.view.id); const e = S.emps.get(S.view.id); if (!o || !e) return notFound("Onboarding", "Checklist", "lifecycle");
  const p = S.projects.get(e.projectId); const ed = S.canEdit; const today = todayISO();
  const row = (it) => { const i = o.items.indexOf(it); return `<label class="check"><input type="checkbox" data-check="onboard:${e.id}:${i}" ${it.done ? "checked" : ""} ${ed ? "" : "disabled"}><span style="flex:1"><b style="font-weight:600${it.na ? ";text-decoration:line-through;color:var(--muted)" : ""}">${esc(it.label)}</b><div class="t-muted" style="font-size:13px">${esc(it.who)}${it.na ? " · not needed" : it.done ? " · done " + fmtDate(it.done) + (it.auto ? " (ticked by the system)" : "") : ""}</div></span></label>`; };
  const groups = []; for (const it of o.items) { const k = it.stage || "_"; let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, items: [] })); g.items.push(it); }
  const block = (g) => { const st = obStageOf(g.k); const due = st && o.start ? addDays(o.start, st[2]) : null; const open = g.items.some((x) => !x.done);
    const base = g.items.filter((x) => !x.out), pass = g.items.filter((x) => x.out === "pass"), fail = g.items.filter((x) => x.out === "fail");
    const sub = (t, l) => (l.length ? `<div style="margin:10px 0 2px;font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${t}</div>${l.map(row).join("")}` : "");
    return `<div class="ob-stage" style="padding:12px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><h3 style="margin:0;font-size:16px">${st ? st[1] : "Steps"}</h3>
      ${due ? `<span class="chip ${!open ? "c-ok" : due < today ? "c-bad" : "c-gray"}">${!open ? "Done" : (due < today ? "Was due " : st[2] < 0 ? "Before " : "By ") + fmtDate(st[2] < 0 ? o.start : due)}</span>` : ""}</div>
      ${base.map(row).join("")}${sub("If passed", pass)}${sub("If failed", fail)}</div>`; };
  const tm = p ? p.name : dept(e.deptId)?.name || "Head office";
  return backLink('data-go="lifecycle"', "Onboarding &amp; Offboarding") + `
    <section class="card" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">${avatar(e, 80)}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="t-muted" style="font-size:13px;font-weight:700">NEW HIRE ONBOARDING CHECKLIST · CONFIDENTIAL</span><h1 style="font-size:26px;font-weight:800">${esc(fullName(e))}</h1>
        <div class="t-muted" style="font-size:14px">Position: ${esc(pos(e.posId)?.title || "—")} · Team: ${esc(tm)} · Date of hire: ${fmtDate(o.start)}</div>
        <div class="t-muted" style="font-size:13px">${o.form === "prop" ? "Property / project form" : o.form === "ho" ? "Head office form" : "Older checklist"}${o.result ? ` · probation ${o.result === "pass" ? "passed" : "not passed"}` : ""}</div></div>
      <div style="min-width:200px">${progress(doneCount(o), o.items.length)}${o.done ? `<div class="okmsg" style="margin-top:6px">Completed ${fmtDate(o.done)}</div>` : ""}
        <div class="no-print" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-ob-print="1">Print</button>${ed && o.form ? "" : ed ? `<button class="btn btn-ghost btn-sm" data-ob-renew="${e.id}">Switch to the company form</button>` : ""}</div></div></section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Checklist</h2><span class="t-muted" style="font-size:13px">Responsible person under each step</span></div>${groups.map(block).join("")}</section>
      <div class="stack"><section class="card"><div class="card-head"><h2>Key dates</h2></div><ul class="list" style="font-size:14px">
        <li><b>${fmtDate(addDays(o.start, 30))}</b><div class="t-muted">Deadline to report to SSS, PhilHealth and Pag-IBIG</div></li>
        ${e.status === "PROBATIONARY" ? `<li><b>${fmtDate(regDue(e))}</b><div class="t-muted">End of probation. Evaluate before this date, or the law treats them as regular.</div></li>` : ""}
        ${e.projectUntil ? `<li><b>${fmtDate(e.projectUntil)}</b><div class="t-muted">Project assignment ends</div></li>` : ""}</ul></section>
        <section class="card"><div class="card-head"><h2>201 file</h2></div><p class="t-muted" style="margin:0 0 12px;font-size:14px">${(e.docs || []).length} documents on file. Government numbers: ${["tin", "sss", "philhealth", "pagibig"].filter((k) => e[k]).length} of 4 entered.</p>
          <button class="btn btn-ghost btn-sm" data-emp="${e.id}">Open 201 file</button></section></div>
    </div>`;
};

/* Checklists tab: the two company forms by stage; add a step to a stage, or remove one. */
{ const b = templatesTab; templatesTab = () => {
    const h = b(); const T = TSET(); const ed = S.canEdit;
    const card = (key, title, note) => { const list = T[key] || [];
      return `<section class="card"><div class="card-head"><h2>${title}</h2><span class="t-muted" style="font-size:13px">${note}</span></div>
      ${OB_STAGES.concat([["_", "Other steps"]]).map(([sk, sl]) => { const l = list.map((i, n) => [i, n]).filter(([i]) => (i.stage || "_") === sk); if (!l.length) return "";
        return `<h3 style="margin:14px 0 4px;font-size:15px">${sl}</h3><ul class="list" style="gap:0">${l.map(([i, n]) => `<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span><b style="font-weight:600">${esc(i.label)}</b> <span class="chip c-gray">${esc(i.who)}</span>${i.only ? ` <span class="chip c-blue">${OB_ONLY[i.only]}</span>` : ""}${i.out ? ` <span class="chip ${i.out === "pass" ? "c-ok" : "c-bad"}">If ${i.out === "pass" ? "passed" : "failed"}</span>` : ""}</span>${ed ? `<button class="link danger" data-tpl-del="${key}:${n}">Remove</button>` : ""}</li>`).join("")}</ul>`; }).join("")}
      ${ed ? `<form class="ob-tpl-form" data-tpl="${key}" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px" data-keep><div class="field" style="flex:1;min-width:220px"><label for="obt-${key}">New step</label><input class="input" id="obt-${key}" name="label" required></div>
        <div class="field" style="width:170px"><label for="obs-${key}">Stage</label><select class="input" id="obs-${key}" name="stage">${OB_STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div class="field" style="width:150px"><label for="obw-${key}">Responsible</label><input class="input" id="obw-${key}" name="who" value="HR Officer" required></div><button class="btn btn-ghost">Add step</button></form>` : ""}</section>`; };
    const i = h.indexOf("<section"); const j = h.indexOf("<section", h.indexOf("</section>", i));
    return card("onboardHO", "Onboarding checklist: Head office", "Used for new hires with no project assignment.") + card("onboardProp", "Onboarding checklist: Property / project", "Used for new hires assigned to a project.") + (i >= 0 && j > i ? h.slice(j) : h);
  }; }

document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest?.(".ob-tpl-form"); if (!f) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!S.canEdit) return;
  const key = f.dataset.tpl; const label = f.elements.label.value.trim(); const who = f.elements.who.value.trim() || "HR Officer"; const stage = f.elements.stage.value; if (!label) return;
  try { const T = TSET(); const list = [...T[key]]; let at = list.length; for (let n = list.length - 1; n >= 0; n--) if (list[n].stage === stage && !list[n].out) { at = n + 1; break; }
    if (at === list.length) { const order = OB_STAGES.map((s) => s[0]); const si = order.indexOf(stage); const nx = list.findIndex((x) => order.indexOf(x.stage) > si); if (nx >= 0) at = nx; }
    list.splice(at, 0, { k: uid(), label, who, stage }); const next = { ...T, [key]: list };
    await S.db.doc("org/talent").set(JSON.parse(JSON.stringify(next))); S.talent = next; logActivity(`Added "${label}" to the onboarding checklist`); toast("Step added."); render();
  } catch { toast("Couldn't save. Check your connection and try again."); }
}, true);

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-ob-print],[data-ob-renew]"); if (!t) return;
  if (t.dataset.obPrint) { window.print(); return; }
  const e = S.emps.get(t.dataset.obRenew); const o = S.onb.get(t.dataset.obRenew); if (!e || !o || !S.canEdit) return;
  const ok = await askConfirm(`Replace ${fullName(e)}'s checklist with the company form? Steps already done stay ticked where the same step is on the new form.`); if (!ok) return;
  const old = new Map(o.items.filter((x) => x.done).map((x) => [x.k, x])); await startOnboarding(e);
  const n = S.onb.get(e.id); const items = n.items.map((x) => (old.has(x.k) ? { ...x, done: old.get(x.k).done } : x));
  await put("onboard", { ...n, start: o.start, items }); logActivity(`Switched ${fullName(e)}'s onboarding to the company form`); toast("Checklist updated."); render();
});
