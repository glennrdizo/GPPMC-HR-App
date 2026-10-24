// Tests for the bots' rules: node --experimental-strip-types web/test-bots.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as B from "../supabase/functions/hr-bot/logic.ts";
import * as C from "../supabase/functions/hr-bot/chat.ts";
import * as L from "../supabase/functions/hr-jobs/logic.ts";

// The two functions carry the same chat file.
assert.equal(fs.readFileSync(new URL("../supabase/functions/hr-bot/chat.ts", import.meta.url), "utf8"), fs.readFileSync(new URL("../supabase/functions/hr-jobs/chat.ts", import.meta.url), "utf8"), "hr-jobs/chat.ts must be a copy of hr-bot/chat.ts");

// Signatures: Viber signs with the bot token, Meta with the app secret; anything else is refused.
const body = JSON.stringify({ event: "message", sender: { id: "v1", name: "Ana" }, message: { type: "text", text: "hi" } });
const sig = await C.hmacHex("tok", body);
assert.equal(await C.viberSigned(body, sig, "tok"), true);
assert.equal(await C.viberSigned(body, sig, "other"), false);
assert.equal(await C.viberSigned(body + " ", sig, "tok"), false);
assert.equal(await C.viberSigned(body, null, "tok"), false);
assert.equal(await C.viberSigned(body, sig, ""), false);
assert.equal(await C.metaSigned(body, "sha256=" + (await C.hmacHex("sec", body)), "sec"), true);
assert.equal(await C.metaSigned(body, sig, "sec"), false);
assert.equal(await C.metaSigned(body, "sha256=" + (await C.hmacHex("sec", body)), ""), false);
console.log("signatures: passed");

// Incoming events
assert.deepEqual(B.parseViber(JSON.parse(body)), [{ sender: "v1", name: "Ana", text: "hi" }]);
assert.deepEqual(B.parseViber({ event: "conversation_started", user: { id: "v2", name: "Ben" } }), [{ sender: "v2", name: "Ben", text: "", start: true }]);
assert.deepEqual(B.parseViber({ event: "message", sender: { id: "v1" }, message: { type: "picture" } })[0].text, "");
assert.deepEqual(B.parseViber({ event: "webhook" }), []);
assert.deepEqual(B.parseMessenger({ object: "page", entry: [{ messaging: [{ sender: { id: "p1" }, message: { text: "leave?" } }, { sender: { id: "p1" }, message: { is_echo: true, text: "x" } }, { sender: { id: "p2" }, message: { text: "x", quick_reply: { payload: "YES" } } }, { sender: { id: "p3" }, postback: { payload: "GET_STARTED" } }] }] }),
  [{ sender: "p1", text: "leave?" }, { sender: "p2", text: "YES" }, { sender: "p3", text: "", start: true }]);
assert.deepEqual(B.parseMessenger({ object: "user" }), []);
console.log("events: passed");

// Commands
assert.deepEqual(B.intent("LINK 123456"), { k: "link", code: "123456" });
assert.deepEqual(B.intent("123456"), { k: "link", code: "123456" });
assert.deepEqual(B.intent("code: 004512"), { k: "link", code: "004512" });
assert.equal(B.intent("1234567"), null);
for (const y of ["YES", "oo", "Sige", "yes, send it"]) assert.deepEqual(B.intent(y), { k: "yes" });
for (const n of ["no", "Cancel", "hindi"]) assert.deepEqual(B.intent(n), { k: "no" });
assert.deepEqual(B.intent("unlink"), { k: "unlink" });
assert.equal(B.intent("yes I want leave on Friday"), null);
console.log("commands: passed");

// What the assistant proposes is checked before the employee is asked to confirm.
const o = { today: "2026-10-24", leave: [["VL", "Vacation leave"], ["SL", "Sick leave"]] };
let r = B.checkProposal("file_request", { kind: "leave", leave_type: "vl", from: "2026-10-30", to: "2026-10-30", half_day: true, reason: "Family" }, o);
assert.equal(r.what, "req"); assert.deepEqual({ ...r.rec, at: 0 }, { kind: "leave", type: "VL", from: "2026-10-30", to: "2026-10-30", half: true, reason: "Family", at: 0 }); assert.match(r.summary, /Vacation leave on Oct 30, 2026 \(half day\)/);
assert.match(B.checkProposal("file_request", { kind: "leave", leave_type: "XX", from: "2026-10-30", reason: "x" }, o).error, /Ask which leave/);
assert.match(B.checkProposal("file_request", { kind: "leave", leave_type: "VL", from: "2026-10-30", to: "2026-10-29", reason: "x" }, o).error, /dates/);
assert.match(B.checkProposal("file_request", { kind: "leave", leave_type: "VL", from: "2026-10-30" }, o).error, /reason/);
assert.match(B.checkProposal("file_request", { kind: "leave", leave_type: "VL", from: "2028-10-30", reason: "x" }, o).error, /too far/);
r = B.checkProposal("file_request", { kind: "ot", date: "2026-10-23", hours: 2.3, reason: "Inventory" }, o); assert.equal(r.rec.hours, 2.5); assert.equal(r.rec.d, "2026-10-23");
assert.match(B.checkProposal("file_request", { kind: "ot", date: "2026-10-25", hours: 2, reason: "x" }, o).error, /today or earlier/);
assert.match(B.checkProposal("file_request", { kind: "ot", date: "2026-10-23", hours: 20, reason: "x" }, o).error, /hours/);
r = B.checkProposal("file_request", { kind: "adjust", date: "2026-10-22", time_out: "17:30", time_in: "25:00", reason: "Forgot" }, o); assert.deepEqual([r.rec.in, r.rec.out], [null, "17:30"]);
assert.match(B.checkProposal("file_request", { kind: "adjust", date: "2026-10-22", reason: "Forgot" }, o).error, /time in/);
r = B.checkProposal("file_request", { kind: "cert", cert_type: "COEC", purpose: "Bank loan", copies: 30 }, o); assert.deepEqual([r.rec.type, r.rec.copies, r.rec.need], ["COEC", 10, "2026-10-27"]);
assert.equal(B.checkProposal("file_request", { kind: "cert", cert_type: "HACK", purpose: "x" }, o).rec.type, "COE");
assert.match(B.checkProposal("file_request", { kind: "resign" }, o).error, /can't be filed/);
r = B.checkProposal("ask_hr", { subject: "Wrong deduction", message: "My SSS was deducted twice." }, o); assert.equal(r.what, "ticket");
assert.match(B.checkProposal("ask_hr", { subject: "", message: "x" }, o).error, /subject/);
console.log("proposals: passed");

// Chat memory and turns
let h = B.addHist([], { role: "user", content: "a" }, { role: "assistant", content: "b" });
for (let i = 0; i < 10; i++) h = B.addHist(h, { role: "user", content: "q" + i }, { role: "assistant", content: "x".repeat(900) });
assert.equal(h.length, 12); assert.equal(h[h.length - 1].content.length, 800);
assert.deepEqual(B.turnsFor([{ role: "assistant", content: "hi" }, { role: "user", content: "a" }], "b"), [{ role: "user", content: "a\nb" }]);
assert.deepEqual(B.careersTurns([{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: " jobs? " }]).map((t) => t.content), ["hi", "hello", "jobs?"]);
assert.equal(B.careersTurns([{ role: "system", content: "x" }]), null);
assert.equal(B.careersTurns([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), null);
assert.equal(B.careersTurns("x"), null);
assert.equal(B.cleanJobLinks("See [[JOB:j1]] and [[JOB:zz]]", new Set(["j1"])), "See [[JOB:j1]] and ");
const cs = B.careersSystem({ company: "GD Prime", jobs: [{ id: "j1", title: "Guard", rate: 650, payType: "DAILY", desc: "Night shift" }] }, "2026-10-24");
assert.match(cs, /"id":"j1"/); assert.match(cs, /PHP 650 a day/); assert.match(cs, /\[\[JOB:<id>\]\]/);
console.log("chat memory and careers: passed");

// Answers without the AI key, and the prompts
const sum = { first: "Ana", name: "Ana Reyes", leave: [{ name: "Vacation leave", left: 4 }], slips: [{ label: "Oct 1-15", net: 9123.5 }], week: [{ d: "2026-10-24", label: "Day shift" }], fix: { due: "2026-10-31", items: [{ d: "2026-10-22", text: "No time out", kind: "MISS" }, { d: "2026-10-21", text: "Outside", kind: "GEO", wait: "geo" }] } };
assert.match(B.quickAnswer("how many leave left?", sum), /Vacation leave 4/);
assert.match(B.quickAnswer("sweldo ko?", sum), /9,123\.50/);
assert.match(B.quickAnswer("may kulang ba? missing", sum), /Oct 22, 2026: No time out/);
assert.equal(B.quickAnswer("hello", sum), null);
assert.match(B.empSystem({ company: "GD", today: "2026-10-24", sum, kb: { text: "Payday 15th" }, leave: o.leave }), /Payday 15th[\s\S]*Ana Reyes/);
assert.doesNotMatch(B.empSystem({ company: "GD", today: "2026-10-24", sum: { ...sum, fix: { ...sum.fix, lv: [["VL", "x"]] } }, kb: null, leave: [] }), /"lv"/);
assert.match(B.hrSystem({ company: "GD", today: "2026-10-24", helper: { sections: [{ title: "Payroll", lines: ["3 employees without basic pay"] }] }, kb: null }), /3 employees without basic pay/);
assert.match(B.helperText({ sections: [{ title: "Payroll", lines: ["a", "b"] }] }, 1), /Payroll \(2\)\n• a\n…and 1 more/);
console.log("prompts and quick answers: passed");

// HR helper (hr-jobs): morning reminder to employees, approvers' reminder, payroll gaps
assert.match(L.fixReminder(sum), /Hi Ana! Before payroll \(cutoff ends Oct 31, 2026\)[\s\S]*Oct 22, 2026: No time out/);
assert.doesNotMatch(L.fixReminder(sum), /Outside/);
assert.equal(L.fixReminder({ fix: { items: [{ d: "2026-10-21", text: "x", wait: "geo" }] } }), null);
const settings = L.readSettings({ on: true, approverTo: ["boss@gd.test"] });
const emps = new Map([["e1", { id: "e1", first: "Ana", last: "Reyes", no: "1", status: "REGULAR", hire: "2020-01-01" }], ["e2", { id: "e2", first: "Ben", last: "Cruz", no: "2", status: "REGULAR", hire: "2020-01-01", basicPay: 20000 }], ["e3", { id: "e3", first: "Cy", last: "Lim", status: "REGULAR", hire: "2026-12-01" }]]);
const ctx = { today: "2026-10-30", settings, emps, jobs: new Map(), ops: { chains: { ot: [{ uid: "u-sup", name: "Supervisor" }, { uid: "u-mgr", name: "Manager" }] } }, leaveTypes: { VL: "Vacation leave" }, userEmail: (u) => ({ "u-sup": "sup@gd.test", "u-mgr": "mgr@gd.test" })[u] || null };
const A = { emps: [...emps.values()], leaves: [{ id: "L1", month: "2026-10", empId: "e1", status: "PENDING", filed: "2026-10-20", type: "VL", from: "2026-10-28", to: "2026-10-28" }],
  reqs: { otreqs: [{ id: "o1", empId: "e2", status: "PENDING", filed: "2026-10-20", d: "2026-10-19" }, { id: "o2", empId: "e2", status: "PENDING", filed: "2026-10-29", d: "2026-10-29" }] },
  offboard: [], contracts: [], cases: [], remit: new Map(), payruns: new Set(["2026-10-1"]), projects: new Map(), pay: new Map([["e1", { basicPay: 0 }]]), apprs: new Map([["ot--o1", { steps: [{ name: "Supervisor" }] }]]) };
const ch = L.chaseNotices(A, ctx);
assert.deepEqual(ch.map((n) => n.to).sort(), ["boss@gd.test", "mgr@gd.test"]);
assert.match(ch.find((n) => n.to === "mgr@gd.test").text, /Overtime request from Ben Cruz \(for Oct 19, 2026\), 8 days past target/);
assert.match(ch.find((n) => n.to === "boss@gd.test").text, /Leave from Ana Reyes/);
assert.ok(ch.every((n) => n.id === `chase-2026-10-30-${n.to}` && n.chat && !/https?:/.test(n.chat)));
const pay = L.digestSections(A, ctx).find((s) => s.title === "Payroll").lines.join("\n");
assert.match(pay, /1 employee without basic pay for the Oct 16, 2026 to Oct 31, 2026 payroll: Ana Reyes \(1\)/);
assert.match(pay, /3 leave, overtime or attendance requests for Oct 16, 2026 to Oct 31, 2026 still waiting/);
console.log("HR helper: passed");
console.log("bots: all checks passed");
