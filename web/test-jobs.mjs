// Tests for the automatic notices rules: node --experimental-strip-types web/test-jobs.mjs
import assert from "node:assert/strict";
import * as L from "../supabase/functions/hr-jobs/logic.ts";

const settings = L.readSettings({ on: true, digestTo: "hr@gd.test, bad-address", approverTo: ["boss@gd.test"], sms: true });
assert.deepEqual(settings.digestTo, ["hr@gd.test"]);
const emps = new Map([
  ["e1", { id: "e1", first: "Ana", last: "Reyes", no: "0-1", email: "Ana@x.test", mobile: "+63 917 123 4567", status: "PROBATIONARY", hire: "2026-04-20" }],
  ["e2", { id: "e2", first: "Ben", last: "Cruz", no: "0-2", email: "", status: "CONTRACTUAL", hire: "2025-01-01", contractEnd: "2026-10-20", docs: [{ name: "NBI clearance", exp: "2026-10-30" }] }],
  ["e3", { id: "e3", first: "Cy", last: "Lim", no: "0-3", email: "cy@x.test", status: "REGULAR", hire: "2020-01-01", separated: true }],
]);
const ctx = { today: "2026-10-16", settings, emps, jobs: new Map([["j1", { id: "j1", title: "HR Recruiter" }]]), ops: { chains: { leave: [{ uid: "u-lead" }] } },
  leaveTypes: { VL: "Vacation leave" }, userEmail: (u) => (u === "u-lead" ? "lead@gd.test" : null) };

// Leave filed -> approvers (chain lead + approver list); decided -> employee email + SMS
let n = L.eventNotices({ path: "leaves/2026-10", col: "leaves", old: { items: {} }, new: { items: { L1: { empId: "e1", type: "VL", from: "2026-10-20", to: "2026-10-21", status: "PENDING", filed: "2026-10-16" } } } }, ctx);
assert.deepEqual(n.map((x) => x.to).sort(), ["boss@gd.test", "lead@gd.test"]);
assert.match(n[0].text, /Vacation leave, Oct 20, 2026 to Oct 21, 2026/);
n = L.eventNotices({ path: "leaves/2026-10", col: "leaves", old: { items: { L1: { empId: "e1", status: "PENDING", type: "VL", from: "2026-10-20", to: "2026-10-20" } } }, new: { items: { L1: { empId: "e1", status: "APPROVED", type: "VL", from: "2026-10-20", to: "2026-10-20" } } } }, ctx);
assert.equal(n.length, 1); assert.equal(n[0].to, "ana@x.test"); assert.equal(n[0].id, "dec-leaves-L1-APPROVED"); assert.match(n[0].subject, /approved/); assert.equal(L.phMobile(n[0].mobile), "09171234567");
assert.doesNotMatch(n[0].text, /₱|peso|\d{3},\d{3}/i);
// No change in status -> nothing
assert.equal(L.eventNotices({ path: "otreqs/o1", col: "otreqs", old: { empId: "e1", status: "PENDING" }, new: { empId: "e1", status: "PENDING", hrs: 2 } }, ctx).length, 0);
// Attendance request kinds get their own label
n = L.eventNotices({ path: "attreq/a1", col: "attreq", old: { empId: "e1", status: "PENDING", kind: "OB" }, new: { empId: "e1", status: "REJECTED", kind: "OB", d: "2026-10-10" } }, ctx);
assert.match(n[0].text, /official business request \(for Oct 10, 2026\) was not approved/);
// Payslip: one per new line, none for someone without email or mobile
n = L.eventNotices({ path: "payruns/2026-10-1", col: "payruns", old: null, new: { start: "2026-10-01", end: "2026-10-15", lines: { e1: {}, e2: {} } } }, ctx);
assert.deepEqual(n.map((x) => x.id), ["pay-2026-10-1-e1"]); assert.doesNotMatch(n[0].text, /net|gross/i);
// Applicant: received, interview, rejected; sample applicants ignored
n = L.eventNotices({ path: "applicants/a9", col: "applicants", old: null, new: { first: "Dee", email: "dee@x.test", jobId: "j1", stage: "APPLIED" } }, ctx);
assert.equal(n[0].subject, "We received your application"); assert.match(n[0].text, /HR Recruiter/);
n = L.eventNotices({ path: "applicants/a9", col: "applicants", old: { stage: "SCREENING", ivs: [] }, new: { first: "Dee", email: "dee@x.test", jobId: "j1", stage: "INTERVIEW", ivs: [{ id: "i1", d: "2026-10-18", t: "10:00", kind: "Interview", result: "PENDING" }] } }, ctx);
assert.deepEqual(n.map((x) => x.id), ["iv-a9-i1"]); assert.match(n[0].text, /Oct 18, 2026 at 10:00/);
assert.equal(L.eventNotices({ path: "applicants/a8", col: "applicants", old: null, new: { email: "s@x.test", sample: true } }, ctx).length, 0);
// Switched-off kinds send nothing
assert.equal(L.eventNotices({ path: "applicants/a7", col: "applicants", old: null, new: { email: "z@x.test" } }, { ...ctx, settings: { ...settings, kinds: { ...settings.kinds, applicant: false } } }).length, 0);

// Digest
const A = { emps: [...emps.values()], leaves: [{ id: "L2", empId: "e1", status: "PENDING", filed: "2026-10-10", type: "VL" }],
  reqs: { otreqs: [{ id: "o2", empId: "e3", status: "PENDING", filed: "2026-10-01" }] }, offboard: [{ empId: "e3", last: "2026-09-20", released: null }],
  contracts: [], cases: [{ empId: "e1", nte: "2026-10-09", reply: null, decision: null, offense: "Tardiness" }], remit: new Map([["2026-09", { sss: true }]]), payruns: new Set(["2026-09-2"]), projects: new Map() };
const sec = L.digestSections(A, ctx); const txt = JSON.stringify(sec);
assert.match(txt, /Leave: Ana Reyes \(0-1\), filed Oct 10, 2026, 4 days past target/);
assert.doesNotMatch(txt, /Overtime request: Cy/); // separated people's requests are left out
assert.match(txt, /PhilHealth premiums for 2026-09: 1 day overdue/); assert.match(txt, /BIR 1601-C withholding tax for 2026-09: 6 days overdue/);
assert.doesNotMatch(txt, /SSS contributions for 2026-09/);
assert.match(txt, /Payroll for Oct 1, 2026 to Oct 15, 2026 is not finalized yet/);
assert.match(txt, /Final pay for Cy Lim \(0-3\): due Oct 20, 2026/);
assert.match(txt, /Regularization of Ana Reyes \(0-1\): due Oct 20, 2026/);
assert.match(txt, /Contract of Ben Cruz \(0-2\) ends Oct 20, 2026/);
assert.match(txt, /NBI clearance of Ben Cruz \(0-2\) expires Oct 30, 2026/);
assert.match(txt, /Written reply of Ana Reyes \(0-1\) to the notice to explain was due Oct 14, 2026/);
const d = L.digestNotices(A, ctx); assert.equal(d.notices.length, 1); assert.equal(d.notices[0].id, "dig-2026-10-16-hr@gd.test"); assert.match(d.notices[0].subject, /HR to-do for Oct 16, 2026: \d+ items/);
assert.equal(L.digestNotices(A, { ...ctx, settings: { ...settings, digestTo: [] } }).notices.length, 0);

// Helpers
assert.equal(L.addMonths("2026-08-31", 6), "2027-02-28"); assert.equal(L.remitDue("2026-12", "ph", { ph: 15 }), "2027-01-15"); assert.equal(L.remitDue("2026-01", "sss", { sss: 0 }), "2026-02-28");
assert.deepEqual(L.cutoffOf("2026-10-31"), { id: "2026-10-2", start: "2026-10-16", end: "2026-10-31" });
assert.equal(L.manila(new Date("2026-10-15T16:30:00Z")).date, "2026-10-16");
assert.equal(L.outId("dec-Leaves-L1/x:y"), "dec-leaves-l1_x_y");
assert.match(L.toHtml("<b>Hi</b> https://a.test/x"), /&lt;b&gt;Hi&lt;\/b&gt; <a href="https:\/\/a.test\/x">/);
assert.equal(L.phMobile("12345"), null);
console.log("hr-jobs rules: all checks passed");

// payroll cutoff ready -> one email to approvers and the digest list, only on the change to ready
{
  const st = L.readSettings({ on: true, approverTo: ["boss@gd.test"], digestTo: ["hr@gd.test"] });
  const c2 = { ...ctx, settings: st };
  const ev = (o, n) => L.eventNotices({ path: "periods/2026-10-1", col: "periods", old: o, new: n }, c2);
  const ready = { start: "2026-10-01", end: "2026-10-15", status: "OPEN", auto: { ready: true, count: 320 } };
  const ns = ev({ status: "OPEN", auto: { ready: false } }, ready);
  assert.equal(ns.length, 2); assert.ok(ns[0].subject.includes("ready for approval")); assert.ok(!/₱|\d{2},\d{3}/.test(ns[0].text));
  assert.equal(ev(ready, ready).length, 0);
  assert.equal(ev({ status: "OPEN", auto: { ready: false } }, { ...ready, status: "FINAL" }).length, 0);
  console.log("payroll ready notices: passed");
}

// government filing pack ready -> one email to the digest list when the pack first appears
{
  const st = L.readSettings({ on: true, digestTo: ["hr@gd.test", "acct@gd.test"] });
  const ev = (o, n) => L.eventNotices({ path: "remit/2026-09", col: "remit", old: o, new: n }, { ...ctx, settings: st });
  const pack = { at: "2026-10-01T00:00:00Z", heads: 318, missing: { sss: 2, ph: 0, hdmf: 0, bir: 1 }, total: { sss: 1149990 }, due: { sss: "2026-10-31", ph: "2026-10-15", hdmf: "2026-10-15", bir: "2026-10-10" } };
  const ns = ev(null, { month: "2026-09", pack });
  assert.equal(ns.length, 2); assert.ok(ns[0].subject.includes("September 2026")); assert.ok(ns[0].text.includes("Oct 15, 2026")); assert.ok(ns[0].text.includes("2 people without"));
  assert.ok(!/₱|1149990|1,149,990/.test(ns[0].text));
  assert.equal(ev({ month: "2026-09", pack }, { month: "2026-09", pack, sss: { at: "x" } }).length, 0);
  console.log("remittance ready notices: passed");
}

// one-tap links, endorsements to the next level, escalation
{
  const ctx3 = { ...ctx, ops: { chains: { leave: [{ uid: "u-lead", name: "Site supervisor" }, { name: "Ops manager", uid: "u-ops" }] }, escTo: "u-esc", escDays: 1 },
    userEmail: (u) => ({ "u-lead": "lead@gd.test", "u-ops": "ops@gd.test", "u-esc": "esc@gd.test" })[u] || null };
  let n = L.eventNotices({ path: "leaves/2026-10", col: "leaves", old: { items: {} }, new: { items: { L9: { empId: "e1", type: "VL", from: "2026-10-20", to: "2026-10-20", status: "PENDING", filed: "2026-10-16" } } } }, ctx3);
  assert.ok(n[0].text.includes("#apv=leave%3A2026-10%3AL9")); assert.ok(n.find((x) => x.to === "lead@gd.test").text.includes("endorsement as Site supervisor"));
  // first endorsement -> the second level only
  n = L.eventNotices({ path: "apprs/leave--2026-10_L9", col: "apprs", old: null, new: { kind: "leave", key: "2026-10:L9", steps: [{ i: 0, name: "Site supervisor" }] } }, ctx3);
  assert.deepEqual(n.map((x) => x.to), ["ops@gd.test"]); assert.match(n[0].subject, /needs Ops manager/);
  // last endorsement -> final approvers
  n = L.eventNotices({ path: "apprs/leave--2026-10_L9", col: "apprs", old: { kind: "leave", key: "2026-10:L9", steps: [{}] }, new: { kind: "leave", key: "2026-10:L9", steps: [{}, { name: "Ops manager" }] } }, ctx3);
  assert.deepEqual(n.map((x) => x.to), ["boss@gd.test"]); assert.match(n[0].subject, /ready for final approval/);
  // decided -> nothing more
  assert.equal(L.eventNotices({ path: "apprs/x", col: "apprs", old: { kind: "leave", key: "k", steps: [{}] }, new: { kind: "leave", key: "k", steps: [{}, {}], final: { st: "APPROVED" } } }, ctx3).length, 0);
  // escalation: leave filed Oct 10, target 2 days, escalate after 1 more day -> late on Oct 16
  const esc = L.escalationNotices({ ...A, leaves: [{ id: "L2", month: "2026-10", empId: "e1", status: "PENDING", filed: "2026-10-10", type: "VL" }] }, ctx3);
  assert.equal(esc.length, 1); assert.equal(esc[0].to, "esc@gd.test"); assert.equal(esc[0].id, "esc-leaves-2026-10:L2"); assert.ok(esc[0].text.includes("#apv=leave%3A2026-10%3AL2"));
  assert.equal(L.escalationNotices(A, { ...ctx3, ops: { ...ctx3.ops, escTo: null } }).length, 0);
  console.log("approval links, endorsements and escalation: passed");
}

// offer answered on the careers page -> HR; hired -> welcome with employee number and account steps
{
  const st = L.readSettings({ on: true, approverTo: ["boss@gd.test"], digestTo: ["hr@gd.test"] });
  const c4 = { ...ctx, settings: st, emps: new Map([...ctx.emps, ["e9", { id: "e9", no: "0-1254", hire: "2026-11-03" }]]) };
  const base = { first: "Rina", last: "Dela", email: "rina@x.test", jobId: "j1", stage: "OFFER", offer: { status: "SENT" } };
  let n = L.eventNotices({ path: "applicants/a1", col: "applicants", old: base, new: { ...base, offer: { status: "ACCEPTED", via: "careers" } } }, c4);
  assert.deepEqual(n.map((x) => x.to).sort(), ["boss@gd.test", "hr@gd.test"]); assert.match(n[0].subject, /accepted the job offer for HR Recruiter/);
  n = L.eventNotices({ path: "applicants/a1", col: "applicants", old: { ...base, offer: { status: "ACCEPTED", via: "careers" } }, new: { ...base, stage: "HIRED", empId: "e9", offer: { status: "ACCEPTED", via: "careers" } } }, c4);
  assert.equal(n.length, 1); assert.equal(n[0].to, "rina@x.test"); assert.ok(n[0].text.includes("0-1254")); assert.ok(n[0].text.includes("Nov 3, 2026"));
  console.log("offer and new hire notices: passed");
}

// exit clearance: signers get their steps, approvers hear when clearance is done
{
  const st = L.readSettings({ on: true, approverTo: ["boss@gd.test"] });
  const c5 = { ...ctx, settings: st, ops: { clrTo: { Admin: "u-adm", IT: "u-it" } }, userEmail: (u) => ({ "u-adm": "adm@gd.test", "u-it": "it@gd.test" })[u] || null };
  const items = [{ k: "notice", who: "HR", label: "Notice", done: "2026-10-01" }, { k: "assets", who: "Admin", label: "Return company property", done: null }, { k: "it", who: "IT", label: "Disable access", done: null }, { k: "finalpay", who: "Payroll", label: "Release final pay", done: null }];
  let n = L.eventNotices({ path: "offboard/e1", col: "offboard", old: null, new: { empId: "e1", last: "2026-10-31", items } }, c5);
  assert.deepEqual(n.map((x) => x.to).sort(), ["adm@gd.test", "it@gd.test"]); assert.ok(n.find((x) => x.to === "adm@gd.test").text.includes("#clr=e1%3Aassets"));
  const done = items.map((i) => (i.k === "finalpay" ? i : { ...i, done: "2026-10-20" }));
  n = L.eventNotices({ path: "offboard/e1", col: "offboard", old: { empId: "e1", items }, new: { empId: "e1", last: "2026-10-31", items: done } }, c5);
  assert.deepEqual(n.map((x) => x.to), ["boss@gd.test"]); assert.match(n[0].text, /Nov 30, 2026/);
  assert.equal(L.eventNotices({ path: "offboard/e1", col: "offboard", old: { empId: "e1", items: done }, new: { empId: "e1", items: done, released: "2026-10-21" } }, c5).length, 0);
  console.log("exit clearance notices: passed");
}
