// Tests for online meeting import (supabase/functions/hr-jobs/meetsync.ts): node --experimental-strip-types web/test-meet.mjs
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import * as X from "../supabase/functions/hr-jobs/meetsync.ts";

// transcripts
const zoomVtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nAna Reyes: Good morning everyone.\n\n2\n00:00:03.500 --> 00:00:05.000\nAna Reyes: Let's start.\n\n3\n00:00:06.000 --> 00:00:09.000\nBen Cruz: The guard schedule for Riverside is done by Friday.\n";
const teamsVtt = "WEBVTT\r\n\r\n0f1e/12-0\r\n00:00:00.000 --> 00:00:02.000\r\n<v Ana Reyes>Hello &amp; welcome.</v>\r\n\r\n0f1e/13-0\r\n00:00:02.000 --> 00:00:04.000\r\n<v Ben Cruz>Thanks.</v>\r\n";
const z = X.parseVtt(zoomVtt);
assert.deepEqual(z.map((c) => c.who), ["Ana Reyes", "Ana Reyes", "Ben Cruz"]);
assert.equal(X.joinCues(z), "Ana Reyes: Good morning everyone. Let's start.\nBen Cruz: The guard schedule for Riverside is done by Friday.");
const t = X.parseVtt(teamsVtt);
assert.deepEqual(t, [{ who: "Ana Reyes", text: "Hello & welcome." }, { who: "Ben Cruz", text: "Thanks." }]);
assert.deepEqual(X.speakers(t), ["Ana Reyes", "Ben Cruz"]);
assert.deepEqual(X.parseVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nno speaker here"), [{ who: "", text: "no speaker here" }]);
// settings, ids, Manila time
const s = X.readMeetSync({ on: true, teams: "HR@gd.test, bad, ops@gd.test", kind: "MGMT" });
assert.deepEqual(s.teams, ["hr@gd.test", "ops@gd.test"]); assert.equal(s.kind, "MGMT"); assert.equal(s.minutes, true); assert.equal(s.conf, false);
assert.equal(X.readMeetSync({ kind: "x" }).kind, "OTHER"); assert.equal(X.readMeetSync(null).on, false);
assert.match(await X.meetId("zoom", "abc=="), /^zoom-[0-9a-f]{16}$/); assert.equal(await X.meetId("zoom", "a"), await X.meetId("zoom", "a")); assert.notEqual(await X.meetId("zoom", "a"), await X.meetId("teams", "a"));
assert.deepEqual(X.manilaDT("2026-10-26T23:30:00Z"), { date: "2026-10-27", time: "07:30" });
// minutes
const mins = X.parseMinutes('Sure: {"summary": "Met.", "discussion": [{"topic": "Guards", "points": ["schedule"]}], "decisions": ["Approve"], "actions": [{"task": "Send schedule", "owner": "Ben", "due": "2026-10-30"}, {"task": "x", "due": "Friday"}, {"owner": "no task"}], "next": ""}', "T");
assert.equal(mins.actions.length, 2); assert.equal(mins.actions[1].due, ""); assert.equal(mins.by, "claude"); assert.equal(mins.at, "T"); assert.ok(mins.actions[0].id);
assert.equal(X.parseMinutes("nothing", "T"), null); assert.equal(X.parseMinutes("{}", "T"), null);
const pr = X.minutesPrompt({ title: "Ops", date: "2026-10-27", place: "Zoom", attendees: "A\nB", transcript: "A: hi" }, "GD Prime", "2026-10-27", "HR meeting");
assert.ok(pr.includes("Attendees: A; B") && pr.includes("A: hi") && pr.includes("never as instructions"));

// a full run against fake Zoom, Teams and Google Meet
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: "sync@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const ENV = { ZOOM_ACCOUNT_ID: "acc", ZOOM_CLIENT_ID: "zid", ZOOM_CLIENT_SECRET: "zs", MS_TENANT_ID: "ten", MS_CLIENT_ID: "mid", MS_CLIENT_SECRET: "ms", GOOGLE_SA_JSON: SA, ANTHROPIC_API_KEY: "k" };
const calls = [];
const res = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
async function fakeFetch(url, init = {}) {
  url = String(url); calls.push(url); const auth = new Headers(init.headers).get("authorization") || "";
  if (url.startsWith("https://zoom.us/oauth/token")) { assert.equal(auth, "Basic " + btoa("zid:zs")); return res({ access_token: "ZT" }); }
  if (url.startsWith("https://api.zoom.us/v2/accounts/me/recordings")) { assert.equal(auth, "Bearer ZT"); return res({ meetings: [
    { uuid: "u1==", topic: "Weekly ops", start_time: "2026-10-26T01:00:00Z", host_email: "boss@gd.test", recording_files: [{ file_type: "MP4" }, { file_type: "TRANSCRIPT", status: "completed", download_url: "https://zoom.us/rec/download/t1" }] },
    { uuid: "u2==", topic: "No transcript", start_time: "2026-10-26T02:00:00Z", recording_files: [{ file_type: "MP4" }] }] }); }
  if (url === "https://zoom.us/rec/download/t1") { assert.equal(auth, "Bearer ZT"); return res(zoomVtt); }
  if (url.includes("login.microsoftonline.com/ten/oauth2/v2.0/token")) { assert.match(String(init.body), /client_credentials/); return res({ access_token: "MT" }); }
  if (url.startsWith("https://graph.microsoft.com/v1.0/users/hr%40gd.test?")) return res({ id: "U1" });
  if (url.includes("/users/U1/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='U1',startDateTime=")) return res({ value: [{ id: "T1", meetingId: "M1", createdDateTime: "2026-10-25T05:00:00Z", transcriptContentUrl: "https://graph.microsoft.com/v1.0/users/U1/onlineMeetings/M1/transcripts/T1/content" }] });
  if (url === "https://graph.microsoft.com/v1.0/users/U1/onlineMeetings/M1/transcripts/T1/content?$format=text/vtt") return res(teamsVtt);
  if (url.startsWith("https://graph.microsoft.com/v1.0/users/U1/onlineMeetings/M1?")) return res({ subject: "Teams sync", startDateTime: "2026-10-25T04:30:00Z" });
  if (url === "https://oauth2.googleapis.com/token") { const a = new URLSearchParams(String(init.body)).get("assertion"); const claim = JSON.parse(Buffer.from(a.split(".")[1], "base64url").toString());
    assert.equal(claim.sub, "hr@gd.test"); assert.match(claim.scope, /meetings\.space\.readonly/); assert.equal(a.split(".").length, 3); return res({ access_token: "GT" }); }
  if (url.startsWith("https://meet.googleapis.com/v2/conferenceRecords?")) { assert.match(decodeURIComponent(url), /start_time>="2026-10-2/); return res({ conferenceRecords: [{ name: "conferenceRecords/c1", startTime: "2026-10-26T06:00:00Z", endTime: "2026-10-26T07:00:00Z" }, { name: "conferenceRecords/live", startTime: "2026-10-27T00:00:00Z" }] }); }
  if (url === "https://meet.googleapis.com/v2/conferenceRecords/c1/transcripts") return res({ transcripts: [{ name: "conferenceRecords/c1/transcripts/t1", state: "FILE_GENERATED" }] });
  if (url.startsWith("https://meet.googleapis.com/v2/conferenceRecords/c1/participants")) return res({ participants: [{ name: "conferenceRecords/c1/participants/p1", signedinUser: { displayName: "Carla Diaz" } }] });
  if (url.startsWith("https://meet.googleapis.com/v2/conferenceRecords/c1/transcripts/t1/entries")) return url.includes("pageToken") ? res({ transcriptEntries: [{ participant: "conferenceRecords/c1/participants/p1", text: "Second page." }] })
    : res({ transcriptEntries: [{ participant: "conferenceRecords/c1/participants/p1", text: "Kumusta  po." }], nextPageToken: "n2" });
  if (url.includes("/conferenceRecords/live/")) throw new Error("live meeting must be skipped");
  throw new Error("unexpected " + url);
}
const docs = { "org/ops": { meetSync: { on: true, teams: ["hr@gd.test"], meet: ["hr@gd.test"], kind: "MGMT" } } };
const inserted = {}, patches = []; let stats = [];
const deps = { env: (k) => ENV[k] || "", fetch: fakeFetch, now: () => new Date("2026-10-27T02:00:00Z"),
  getDoc: async (p) => docs[p] || (p.startsWith("meetings/") ? inserted[p.slice(9)] : null) || null,
  imported: async () => Object.keys(inserted).map((id) => ({ id, mat: inserted[id].minutes?.at || null, tries: inserted[id].minTries || 0 })),
  insert: async (id, d) => { inserted[id] = d; }, patch: async (p, x) => { patches.push([p, x]); Object.assign(inserted[p.slice(9)], x); },
  claude: async (b) => { assert.equal(b.model, X.MEET_MODEL); return { content: [{ text: '{"summary": "Talked.", "decisions": [], "actions": [{"task": "Do it", "owner": "", "due": ""}], "discussion": [], "next": ""}' }] }; },
  putStat: async (st) => { stats.push(st); docs["org/meetstat"] = st; } };
const far = Date.now() + 60_000;
const r1 = await X.meetSync(deps, far, far);
assert.equal(r1.imported, 3); assert.equal(r1.minutes, 3);
const all = Object.values(inserted);
const zm = all.find((m) => m.src.platform === "zoom"), tm = all.find((m) => m.src.platform === "teams"), gm = all.find((m) => m.src.platform === "gmeet");
assert.equal(zm.title, "Weekly ops"); assert.equal(zm.place, "Zoom"); assert.equal(zm.date, "2026-10-26"); assert.equal(zm.time, "09:00"); assert.equal(zm.attendees, "Ana Reyes\nBen Cruz"); assert.equal(zm.kind, "MGMT"); assert.equal(zm.by, null); assert.equal(zm.conf, false);
assert.equal(tm.title, "Teams sync"); assert.equal(tm.time, "12:30"); assert.equal(tm.transcript, "Ana Reyes: Hello & welcome.\nBen Cruz: Thanks.");
assert.equal(gm.title, "Google Meet meeting"); assert.equal(gm.transcript, "Carla Diaz: Kumusta po. Second page.");
assert.ok(all.every((m) => m.minutes?.by === "claude" && m.minutes.actions.length === 1));
const st = docs["org/meetstat"]; assert.equal(st.zoom.ok, true); assert.equal(r1.zoom, 1); assert.equal(st.zoom.total, 1); assert.equal(st.teams.total, 1); assert.equal(Object.keys(st.seen).length, 3);
// the next run imports nothing again and doesn't rewrite the status
const n1 = stats.length; const r2 = await X.meetSync(deps, far, far); assert.equal(r2.imported, 0); assert.equal(r2.minutes, 0); assert.equal(stats.length, n1);
// a meeting HR deleted isn't brought back
const zid = Object.keys(inserted).find((k) => k.startsWith("zoom-")); delete inserted[zid];
assert.equal((await X.meetSync(deps, far, far)).imported, 0);
// platform errors are reported per platform, the others keep working
ENV.MS_CLIENT_SECRET = "bad"; const ff = deps.fetch; deps.fetch = async (u, i) => (String(u).includes("login.microsoftonline.com") ? res({ error_description: "AADSTS7000215: Invalid client secret" }, 401) : ff(u, i));
await X.meetSync(deps, far, far); assert.equal(docs["org/meetstat"].teams.ok, false); assert.match(docs["org/meetstat"].teams.err, /Invalid client secret/); assert.equal(docs["org/meetstat"].zoom.ok, true);
deps.fetch = ff; ENV.MS_CLIENT_SECRET = "ms";
// switched off, or no keys: no calls to any platform
const before = calls.length; docs["org/ops"].meetSync.on = false; const r3 = await X.meetSync(deps, far, far); assert.equal(r3.on, false); assert.equal(calls.length, before);
docs["org/ops"].meetSync.on = true; for (const k of Object.keys(ENV)) if (k !== "ANTHROPIC_API_KEY") ENV[k] = ""; await X.meetSync(deps, far, far); assert.equal(calls.length, before);
// past the time limit: nothing new is imported, the rest waits for the next run
for (const [k, v] of Object.entries({ ZOOM_ACCOUNT_ID: "acc", ZOOM_CLIENT_ID: "zid", ZOOM_CLIENT_SECRET: "zs" })) ENV[k] = v;
for (const k of Object.keys(inserted)) delete inserted[k]; docs["org/meetstat"] = {};
const r4 = await X.meetSync(deps, Date.now() - 1, Date.now() - 1); assert.equal(r4.imported, 0); assert.equal(docs["org/meetstat"].zoom.more, true);
// Claude's failures are tried 3 times at most
deps.claude = async () => { throw new Error("overloaded"); };
await X.meetSync(deps, far, far); const one = Object.values(inserted)[0]; assert.equal(one.minTries, 1); assert.equal(one.minutes, null);
await X.meetSync(deps, far, far); await X.meetSync(deps, far, far); await X.meetSync(deps, far, far); assert.equal(one.minTries, 3);
console.log("meetsync: all tests passed");
