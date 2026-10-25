// Tests for the AI first-round interview and the recruitment rules: node --experimental-strip-types web/test-iv.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as V from "../supabase/functions/hr-bot/iv.ts";
import * as L from "../supabase/functions/hr-jobs/logic.ts";

// Both functions carry the same interview file.
assert.equal(fs.readFileSync(new URL("../supabase/functions/hr-bot/iv.ts", import.meta.url), "utf8"), fs.readFileSync(new URL("../supabase/functions/hr-jobs/iv.ts", import.meta.url), "utf8"), "hr-jobs/iv.ts must be a copy of hr-bot/iv.ts");

// Questions: HR's own (3 or more), else the general ones; written ones are cleaned and capped.
assert.deepEqual(V.ivQuestions(null), V.IV_DEF_QS);
assert.deepEqual(V.ivQuestions({ aiivQs: ["Short?", "What did you do at your last job?"] }), V.IV_DEF_QS);
const own = ["What did you do at your last job?", "How do you handle a guest complaint?", "Can you work night shifts?"];
assert.deepEqual(V.ivQuestions({ aiivQs: own }), own);
assert.deepEqual(V.parseQs("1. What did you do at your last job?\n- Tell me about a hard day at work.\nok\nIntro line without end"), ["What did you do at your last job?", "Tell me about a hard day at work."]);

// Who may open an interview.
const today = "2026-10-25";
assert.deepEqual(V.openState({ stage: "SCREENING" }, today), { error: "not_invited" });
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "INVITED", until: "2026-10-30" } }, today), { ok: true });
assert.deepEqual(V.openState({ stage: "REJECTED", aiiv: { status: "INVITED", until: "2026-10-30" } }, today), { error: "application_closed" });
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "DONE" } }, today), { error: "already_done" });
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "DECLINED" } }, today), { error: "not_invited" });
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "INVITED", until: "2026-10-24" } }, today), { error: "expired" });
// One day of grace to finish an interview already started.
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "STARTED", until: "2026-10-24" } }, today), { ok: true });
assert.deepEqual(V.openState({ stage: "SCREENING", aiiv: { status: "STARTED", until: "2026-10-23" } }, today), { error: "expired" });

// The interview runs: welcome + Q1, at most one follow-up per question, then DONE after the last answer.
const now = "2026-10-25T02:00:00Z";
let s = V.startTurns({ status: "INVITED", qs: own, qi: 0, turns: [] }, "Ana", "Building Admin", now);
assert.equal(s.status, "STARTED"); assert.equal(s.turns.length, 1); assert.match(s.turns[0].text, /Hi Ana!.*Building Admin/); assert.match(s.turns[0].text, /Question 1 of 3: What did you do/);
s = V.answerTurns(s, "Admin.", { follow: true, say: "Can you give an example of a task?" }, now);
assert.equal(s.qi, 0); assert.equal(s.turns.at(-1).follow, true); assert.equal(s.turns.at(-1).text, "Can you give an example of a task?");
s = V.answerTurns(s, "I handled tenant concerns every day.", { follow: true, say: "Another follow-up?" }, now); // second follow-up refused
assert.equal(s.qi, 1); assert.match(s.turns.at(-1).text, /^Question 2 of 3/);
s = V.answerTurns(s, "I listen and fix it.", { follow: false, say: "Thank you." }, now);
assert.equal(s.qi, 2); assert.match(s.turns.at(-1).text, /^Thank you\.\n\nQuestion 3 of 3/);
s = V.answerTurns(s, "Yes, I can.", { follow: false, say: "" }, now);
assert.equal(s.status, "DONE"); assert.equal(s.done, now); assert.match(s.turns.at(-1).text, /That's all my questions/);
assert.equal(s.turns.filter((t) => t.role === "me").length, 4);
assert.match(V.transcript(s), /^Interviewer: Hi Ana!/); assert.match(V.transcript(s), /Applicant: Yes, I can\./);

// The model's replies are read defensively.
assert.deepEqual(V.parseTurn('Sure: {"follow": true, "say": "Which building?"}'), { follow: true, say: "Which building?" });
assert.deepEqual(V.parseTurn("not json"), { follow: false, say: "" });
assert.deepEqual(V.parseTurn('{"follow": "yes", "say": 5}'), { follow: false, say: "" });
const sc = V.parseScore('```json\n{"score": 120, "dims": {"skills": {"score": 80, "why": "Ran a tower."}, "comm": {"score": "x"}}, "strengths": ["a","b","c","d","e"], "summary": "Good."}\n```');
assert.equal(sc.score, 100); assert.equal(sc.rec, "NEXT"); assert.equal(sc.dims.skills.score, 80); assert.equal(sc.dims.comm.score, null); assert.equal(sc.dims.fit.score, null);
assert.equal(sc.strengths.length, 4); assert.deepEqual(sc.flags, []);
assert.equal(V.parseScore('{"score": 45, "rec": "MAYBE"}').rec, "MAYBE");
assert.equal(V.parseScore('{"score": 45}').rec, "NOT_FIT");
assert.equal(V.parseScore('{"rec": "NEXT"}'), null); assert.equal(V.parseScore("nothing"), null);

// The careers page never sees the score or HR's notes.
const pv = V.publicView("a1", { aiiv: { ...s, result: { score: 90 }, by: "u-hr" } }, { title: "Building Admin" });
assert.deepEqual(Object.keys(pv).sort(), ["app", "job", "n", "qi", "status", "turns", "until"]);
assert.ok(!JSON.stringify(pv).includes("90")); assert.deepEqual(Object.keys(pv.turns[0]).sort(), ["role", "text"]);

// Rules: off by default, and only expiry happens while off.
const R = L.readRules({ on: true }); assert.deepEqual(R, { on: true, aiiv: true, invite: 70, reject: 40, pass: 70 });
assert.equal(L.readRules(null).on, false); assert.equal(L.readRules({ invite: 50, reject: 80 }).reject, 50);
const job = { id: "j1", title: "Building Admin" };
assert.equal(L.ruleActions({ stage: "APPLIED", ai: { score: 90 } }, job, L.readRules(null), today, now), null);
let r = L.ruleActions({ stage: "SCREENING", aiiv: { status: "INVITED", until: "2026-10-24" } }, job, L.readRules(null), today, now);
assert.deepEqual(r.patch, { aiiv: { status: "EXPIRED" } });
// High screening score: invite to the online interview (once).
r = L.ruleActions({ stage: "APPLIED", ai: { score: 82 } }, job, R, today, now);
assert.equal(r.patch.stage, "SCREENING"); assert.equal(r.patch.aiiv.status, "INVITED"); assert.equal(r.patch.aiiv.until, "2026-11-01"); assert.equal(r.patch.rules.screen.act, "aiiv"); assert.equal(r.patch.ruleLog.length, 1);
assert.equal(L.ruleActions({ stage: "SCREENING", ai: { score: 82 }, rules: { screen: { act: "aiiv" } }, aiiv: { status: "INVITED", until: "2026-11-01" } }, job, R, today, now), null);
// ... or straight to Interview when the job or the rules don't use online interviews.
assert.equal(L.ruleActions({ stage: "APPLIED", ai: { score: 82 } }, { ...job, aiiv: false }, R, today, now).patch.stage, "INTERVIEW");
assert.equal(L.ruleActions({ stage: "APPLIED", ai: { score: 82 } }, job, L.readRules({ on: true, aiiv: false }), today, now).patch.stage, "INTERVIEW");
// Low score: only a suggestion; the stage is untouched.
r = L.ruleActions({ stage: "APPLIED", ai: { score: 20 } }, job, R, today, now);
assert.equal(r.patch.stage, undefined); assert.equal(r.patch.suggest.act, "REJECT"); assert.match(r.patch.suggest.why, /20 is under 40/);
// In between: left for HR, marked so it isn't checked again.
r = L.ruleActions({ stage: "APPLIED", ai: { score: 55 } }, job, R, today, now); assert.deepEqual(Object.keys(r.patch).sort(), ["ruleLog", "rules"]); assert.equal(r.patch.rules.screen.act, "none");
// Not touched: blacklisted, refused, later stages, no score, sample.
for (const a of [{ stage: "APPLIED", ai: { score: 90 }, blacklist: true }, { stage: "APPLIED", ai: { score: 90 }, refused: true }, { stage: "INTERVIEW", ai: { score: 90 } }, { stage: "APPLIED", ai: { error: "x" } }, { stage: "APPLIED", ai: { score: 90 }, sample: true }])
  assert.equal(L.ruleActions(a, job, R, today, now), null, JSON.stringify(a));
// A manual invitation under way is waited for; an expired one is left for HR.
assert.equal(L.ruleActions({ stage: "SCREENING", ai: { score: 90 }, aiiv: { status: "STARTED" } }, job, R, today, now), null);
assert.equal(L.ruleActions({ stage: "SCREENING", ai: { score: 90 }, aiiv: { status: "EXPIRED" } }, job, R, today, now).patch.rules.screen.act, "none");
// Interview score: pass moves to Interview; low only suggests; DONE without a score waits.
const ivA = (score) => ({ stage: "SCREENING", ai: { score: 80 }, rules: { screen: { act: "aiiv" } }, aiiv: { status: "DONE", result: { score } }, ruleLog: [{ at: "x", text: "old" }] });
r = L.ruleActions(ivA(75), job, R, today, now); assert.equal(r.patch.stage, "INTERVIEW"); assert.equal(r.patch.rules.iv.act, "interview"); assert.equal(r.patch.ruleLog.length, 2);
r = L.ruleActions(ivA(30), job, R, today, now); assert.equal(r.patch.stage, undefined); assert.equal(r.patch.suggest.act, "REJECT");
r = L.ruleActions(ivA(60), job, R, today, now); assert.equal(r.patch.rules.iv.act, "none");
assert.equal(L.ruleActions({ ...ivA(75), rules: { screen: {}, iv: {} } }, job, R, today, now), null);
assert.equal(L.ruleActions({ stage: "SCREENING", ai: { score: 80 }, rules: { screen: {} }, aiiv: { status: "DONE" } }, job, R, today, now), null);
// The log keeps the last 20.
assert.equal(L.ruleActions({ stage: "APPLIED", ai: { score: 55 }, ruleLog: Array.from({ length: 25 }, (_, i) => ({ text: String(i) })) }, job, R, today, now).patch.ruleLog.length, 20);

// Emails: the invitation, once; the Interview stage message.
const settings = L.readSettings({ on: true });
const ctx = { today, settings, emps: new Map(), jobs: new Map([["j1", job]]), ops: {}, leaveTypes: {}, userEmail: () => null };
const base = { first: "Ana", email: "ana@x.test", jobId: "j1", stage: "SCREENING" };
let n = L.eventNotices({ path: "applicants/a1", col: "applicants", old: { ...base, stage: "APPLIED" }, new: { ...base, aiiv: { status: "INVITED", at: now, until: "2026-11-01" } } }, ctx);
const inv = n.find((x) => x.id.startsWith("aiiv-")); assert.ok(inv); assert.equal(inv.subject, "Online interview for Building Admin"); assert.match(inv.text, /Nov 1, 2026|2026-11-01|November/); assert.match(inv.text, /a person in HR reads every interview/);
assert.equal(L.eventNotices({ path: "applicants/a1", col: "applicants", old: { ...base, aiiv: { status: "INVITED" } }, new: { ...base, aiiv: { status: "STARTED" } } }, ctx).length, 0);
n = L.eventNotices({ path: "applicants/a1", col: "applicants", old: base, new: { ...base, stage: "INTERVIEW" } }, ctx);
assert.equal(n.length, 1); assert.equal(n[0].subject, "Interview for Building Admin");

console.log("test-iv: all passed");
