// Tests for AI screening (supabase/functions/hr-jobs/screen.ts): node --experimental-strip-types web/test-screen.mjs
import assert from "node:assert/strict";
import * as X from "../supabase/functions/hr-jobs/screen.ts";
globalThis.__fflate = await import("fflate");

// parsing Claude's answer
const p = X.parseScreen('Here: {"score": 83.6, "rec": "INTERVIEW", "summary": "Fits.", "strengths": ["5 yrs guard"], "gaps": [], "answers": [{"q": "License?", "rating": 9, "note": "valid"}], "check": ["license expiry"], "ask": ["Shift?"], "years": 5}');
assert.equal(p.score, 84); assert.equal(p.rec, "INTERVIEW"); assert.equal(p.answers[0].rating, 5); assert.equal(p.years, 5);
assert.equal(X.parseScreen("no json"), null);
assert.equal(X.parseScreen('{"score": 30}').rec, "NOT_FIT");
assert.equal(X.parseScreen('{"score": 55, "rec": "maybe"}').rec, "KEEP");
// who needs screening
assert.ok(X.needsScreen({ stage: "APPLIED", resume: { id: "apply/u/r.pdf" } }));
assert.ok(!X.needsScreen({ stage: "APPLIED", resume: { id: "x" }, ai: { score: 1 } }));
assert.ok(!X.needsScreen({ stage: "INTERVIEW", resume: { id: "x" } }));
assert.ok(!X.needsScreen({ stage: "APPLIED" }));
assert.ok(!X.needsScreen({ stage: "APPLIED", resume: { id: "x" }, aiTries: 3 }));
// personal traits never reach the prompt
const a = { id: "a1", jobId: "j1", stage: "APPLIED", first: "Maria", last: "Santos", birth: "1990-01-01", gender: "F", address: "Cebu City", mobile: "0917", expRate: 18000, notes: "3 years security guard", answers: { "Do you have a license?": "Yes, valid until 2027" }, resume: { id: "apply/u/cv.pdf", name: "cv.pdf" } };
const j = { id: "j1", title: "Security Guard", desc: "Licensed guard for a mall site", rate: 17000, payType: "MONTHLY", status: "OPEN", questions: ["Do you have a license?"] };
const t = X.applicantText(a, j);
for (const bad of ["Maria", "Santos", "1990", "Cebu", "0917"]) assert.ok(!t.includes(bad), `leaked ${bad}`);
assert.ok(t.includes("Yes, valid until 2027") && t.includes("3 years security guard"));

// a full run with fakes
const writes = []; let sent;
const pdf = new TextEncoder().encode("%PDF-1.4 fake").buffer;
const deps = { key: "k", docsOf: async (c) => (c === "applicants" ? [a, { ...a, id: "a2", ai: { score: 1 } }] : [j, { id: "j2", title: "Janitor", status: "OPEN" }]),
  getDoc: async (path) => (path === "jobs/j1" ? j : null), patch: async (path, patch) => writes.push([path, patch]),
  fetchFile: async () => ({ type: "application/pdf", buf: pdf }),
  claude: async (body) => { sent = body; return body.model.includes("haiku") ? { content: [{ type: "text", text: "How many years have you worked as a janitor?\nDo you have a TESDA NC II?\nCan you work night shifts?" }] } : { content: [{ type: "text", text: '{"score": 72, "rec": "INTERVIEW", "summary": "Likely fit.", "strengths": [], "gaps": ["License copy"], "answers": [], "check": [], "ask": [], "years": 3}' }] }; } };
const r = await X.aiScreen(deps);
assert.deepEqual(r, { done: 1, failed: 0, waiting: 0 });
assert.equal(writes[0][0], "applicants/a1"); assert.equal(writes[0][1].ai.score, 72); assert.equal(writes[0][1].ai.resumeRead, true);
assert.equal(sent.messages[0].content[1].type, "document");
assert.ok(!JSON.stringify(sent).includes("Maria"));
// questions for a job that has none
writes.length = 0; assert.equal(await X.genQuestions(deps), 1);
assert.equal(writes[0][0], "jobs/j2"); assert.equal(writes[0][1].questions.length, 3); assert.equal(writes[0][1].qAuto, true);
// a Word resume is read as text; an unreadable type falls back to answers only
const { zipSync, strToU8 } = await import("fflate");
const docx = zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Guard at SM Mall 2019-2024</w:t></w:r></w:p></w:body></w:document>') });
const wb = await X.resumeBlock(async () => ({ type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buf: docx.buffer }), { resume: { id: "x", name: "cv.docx" } });
assert.ok(wb.block.text.includes("Guard at SM Mall 2019-2024"));
const hb = await X.resumeBlock(async () => ({ type: "image/heic", buf: pdf }), { resume: { id: "x", name: "cv.heic" } });
assert.equal(hb.block, null); assert.ok(hb.note.includes("can't be read"));
// a failure counts a try and doesn't stop the run
writes.length = 0; const bad = { ...deps, claude: async () => { throw new Error("overloaded"); } };
assert.deepEqual(await X.aiScreen(bad), { done: 0, failed: 1, waiting: 0 }); assert.equal(writes[0][1].aiTries, 1);
console.log("screen tests passed");
