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
