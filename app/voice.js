/* ---------- voice commands for employees: the Employee view and the phone time clock ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
S.voice = { on: false, heard: "", said: "", typing: false, err: "" };
let voiceRec = null;
const voiceHere = () => (S.viewAs === "emp" && S.realEdit) || (S.selfMode && S.self?.claim);
function voicePanel() {
  if (!voiceHere()) return "";
  const V = S.voice;
  return `<div class="voice-dock no-print" role="region" aria-label="Voice commands">
    ${V.heard || V.said || V.err ? `<div class="voice-bubble" aria-live="polite">${V.heard ? `<div class="t-muted">You said: “${esc(V.heard)}”</div>` : ""}${V.said ? `<div>${esc(V.said)}</div>` : ""}${V.err ? `<div class="t-warn">${esc(V.err)}</div>` : ""}<button class="link" data-voice="close" style="font-size:13px">Hide</button></div>` : ""}
    ${V.typing || !SpeechRec ? `<form id="voice-form" class="voice-type" data-keep><input class="input" id="voice-q" placeholder="Type a command, e.g. my leave balance" autocomplete="off" aria-label="Command"><button class="btn btn-primary btn-sm">Go</button></form>` : ""}
    <div class="voice-btns">${SpeechRec ? `<button class="voice-mic${V.on ? " on" : ""}" data-voice="mic" aria-pressed="${V.on}" aria-label="${V.on ? "Stop listening" : "Speak a command"}">${V.on ? "Listening…" : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>Speak`}</button>` : ""}
      <button class="voice-help" data-voice="help" aria-label="What can I say?">?</button>${SpeechRec ? `<button class="voice-help" data-voice="type" aria-label="Type a command instead">⌨</button>` : ""}</div></div>`;
}
function voiceSay(text) {
  S.voice.said = text; render();
  try { const u = new SpeechSynthesisUtterance(text); u.lang = "en-PH"; u.rate = 1; window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(u); } catch {}
}
const VOICE_HELP_EMP = "Try: my leave balance, my latest pay, what time did I time in, my shift, my supervisor, my training, or open payslips, time records, leave, training, profile, home.";
const VOICE_HELP_SELF = "Try: time in, time out, or last punch. Take the selfie first by tapping Take a selfie.";
function voiceRun(raw) {
  const q = String(raw || "").toLowerCase().trim(); S.voice.heard = raw; S.voice.err = "";
  if (!q) return voiceSay("I didn't catch that. Please try again.");
  const has = (...w) => w.some((x) => q.includes(x));
  if (has("help", "what can i say", "tulong")) return voiceSay(S.selfMode ? VOICE_HELP_SELF : VOICE_HELP_EMP);
  if (S.selfMode) {
    const M = S.self; const type = has("time out", "timeout", "clock out", "log out", "uwi", "out") ? "OUT" : has("time in", "timein", "clock in", "pasok", "in") ? "IN" : null;
    if (has("last", "huling")) { const t = Object.values(M.today?.punches || {}).sort((a, b) => a.t.localeCompare(b.t)).pop(); return voiceSay(t ? `Your last punch was ${t.type === "OUT" ? "time out" : "time in"} at ${timeFmt.format(new Date(t.t))}.` : "No punches yet today."); }
    if (type) { if (!M.photo) return voiceSay("Take your selfie first, then say time " + (type === "IN" ? "in" : "out") + " again."); if (M.busy) return voiceSay("Still saving your last punch."); voiceSay(type === "IN" ? "Timing you in." : "Timing you out."); selfPunch(type); return; }
    return voiceSay("Sorry, I didn't understand. " + VOICE_HELP_SELF);
  }
  const e = essEmp(); if (!e) return voiceSay("No employee is selected.");
  const goto = (v, msg) => { S.essView = v; voiceSay(msg); window.scrollTo({ top: 0 }); };
  const y = todayISO().slice(0, 4);
  if (has("balance", "how many leave", "leave left", "credits", "natitirang")) { const b = balances(e, leaveYear(todayISO())); const vl = b.find((x) => x.code === "VL"), sl = b.find((x) => x.code === "SL");
    return goto("essleave", `You have ${vl?.left ?? 0} vacation leave and ${sl?.left ?? 0} sick leave days left for ${y}.`); }
  if (has("latest pay", "net pay", "last pay", "how much", "magkano", "sweldo ko", "my pay")) { const s = essSlips(e)[0];
    return goto("esspay", s ? `Your net pay for ${s.p.label} is ${peso.format(s.l.net)}${s.final ? "" : ", still a draft"}.` : "You have no payslip yet."); }
  if (has("what time", "time in today", "did i time", "anong oras")) { const r = essToday(e); return goto("esstime", r.in ? `You timed in at ${hm(r.in)} today${r.out ? ` and out at ${hm(r.out)}` : ""}.` : "You haven't timed in today."); }
  if (has("shift", "schedule")) { const r = essToday(e); return voiceSay(r.shift ? `Your shift today is ${r.shift.start} to ${r.shift.end}.` : r.rest ? "Today is your rest day." : "You have no shift today."); }
  if (has("supervisor", "boss", "manager", "amo")) { const s = e.supervisorId ? S.emps.get(e.supervisorId) : null; return voiceSay(s ? `Your supervisor is ${fullName(s)}.` : "No supervisor is on file."); }
  if (has("payslip", "salary", "pay", "sweldo")) return goto("esspay", "Opening your payslips.");
  if (has("leave", "bakasyon", "absent")) return goto("essleave", "Opening your leave.");
  if (has("time record", "attendance", "dtr", "time", "oras")) return goto("esstime", "Opening your time records.");
  if (has("training", "course", "certificate", "seminar")) { const req = listOf(S.courses).filter((c) => needs(c, e)); const ok = req.filter((c) => trainState(c, e) === "OK").length; return goto("esstrain", req.length ? `${ok} of ${req.length} required trainings are current.` : "Opening your training."); }
  if (has("profile", "my info", "my details", "201")) return goto("essprofile", "Opening your profile.");
  if (has("home", "dashboard", "start")) return goto("esshome", "Going home.");
  return voiceSay("Sorry, I didn't understand. " + VOICE_HELP_EMP);
}
function voiceListen() {
  if (!SpeechRec) { S.voice.typing = true; render(); return; }
  if (S.voice.on) { try { voiceRec?.stop(); } catch {} return; }
  voiceRec = new SpeechRec(); voiceRec.lang = "en-PH"; voiceRec.interimResults = false; voiceRec.maxAlternatives = 1;
  voiceRec.onresult = (ev) => voiceRun(ev.results[0]?.[0]?.transcript || "");
  voiceRec.onerror = (ev) => { S.voice.err = ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "The microphone is blocked here. Allow it in the browser, or type your command instead." : ev.error === "no-speech" ? "I didn't hear anything. Tap Speak and try again." : "Voice isn't working right now. Type your command instead."; if (ev.error !== "no-speech") S.voice.typing = true; };
  voiceRec.onend = () => { S.voice.on = false; render(); };
  try { voiceRec.start(); S.voice = { ...S.voice, on: true, heard: "", said: "", err: "" }; render(); } catch { S.voice.typing = true; render(); }
}
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-voice]"); if (!t) return; ev.stopImmediatePropagation(); const a = t.dataset.voice;
  if (a === "mic") return voiceListen();
  if (a === "help") { S.voice.heard = ""; return voiceSay(S.selfMode ? VOICE_HELP_SELF : VOICE_HELP_EMP); }
  if (a === "type") { S.voice.typing = !S.voice.typing; render(); if (S.voice.typing) $("#voice-q")?.focus(); return; }
  if (a === "close") { S.voice = { ...S.voice, heard: "", said: "", err: "" }; try { window.speechSynthesis?.cancel(); } catch {} render(); }
}, true);
document.addEventListener("submit", (ev) => { if (ev.target.id !== "voice-form") return; ev.preventDefault(); ev.stopImmediatePropagation(); const v = $("#voice-q")?.value || ""; voiceRun(v); }, true);
