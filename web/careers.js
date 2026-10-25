/* GD Prime careers page and applicant portal (website only, /careers).
   Anyone can browse open jobs. Applicants create an account, apply with their resume, then follow their application,
   send requirements, download forms and sign documents HR shares. Every read and write goes through hr_* functions
   that only return the applicant's own records. Loaded after supabase.js. */
(() => {
  const SB_URL = "https://dkrxetzvzxkmhdnvrnqd.supabase.co";
  const SB_KEY = "sb_publishable_BacTOm5RH5cw7ruQO9KHUw_ocKoTBkX";
  const BUCKET = "hr-files"; const DPA_V = "2026-10-14-app";
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.__sb = sb;
  const LOGO = window.CO_LOGO_URL || "";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
  const fmtDate = (d) => { if (!d) return ""; const x = new Date(String(d).length === 10 ? d + "T00:00:00+08:00" : d); return isNaN(x) ? "" : x.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }); };
  const fmtDay = (d) => { const x = new Date(d + "T00:00:00+08:00"); return isNaN(x) ? d : x.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Manila" }); };
  const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const pay = (j) => (j.rate ? `${peso.format(j.rate)} ${j.payType === "DAILY" ? "a day" : "a month"}` : "");
  const empType = (t) => ({ PROBATIONARY: "Full-time, probationary", REGULAR: "Full-time, regular", PROJECT_BASED: "Project-based", CONTRACTUAL: "Contractual", SEASONAL: "Seasonal", PART_TIME: "Part-time" }[t] || (t ? t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : "Full-time"));
  const STAGES = [["APPLIED", "Applied"], ["SCREENING", "Screening"], ["INTERVIEW", "Interview"], ["REQUIREMENTS", "Requirements"], ["OFFER", "Job offer"], ["HIRED", "Hired"]];
  const STAGE_TXT = {
    APPLIED: "We received your application. HR will review it and contact you.", SCREENING: "HR is reviewing your application.",
    INTERVIEW: "You're in the interview stage. See your schedule below.", REQUIREMENTS: "Congratulations, you passed! Please send your pre-employment requirements below.",
    OFFER: "You have a job offer. Please check the documents from HR below.", HIRED: "Welcome to GD Prime! HR will guide you through your first days.",
    REJECTED: "Thank you for applying. We have chosen other applicants for this opening, but we'll keep your application on file for future openings.", WITHDRAWN: "You withdrew this application." };
  const DEF_REQS = [["nbi", "NBI clearance"], ["medical", "Medical exam result"], ["birth", "PSA birth certificate"], ["sss", "SSS number", 1], ["philhealth", "PhilHealth number", 1], ["pagibig", "Pag-IBIG MID number", 1], ["tin", "TIN", 1], ["school", "Diploma, TOR or TESDA certificate"], ["photo", "2x2 ID photo"]];
  const reqList = () => (Array.isArray(cfg?.reqs) && cfg.reqs.length ? cfg.reqs.map((r) => [r.k, r.label, r.num ? 1 : 0]) : DEF_REQS);
  const isOpen = (a) => !["HIRED", "REJECTED", "WITHDRAWN"].includes(a.stage);

  let cfg = null, cfgErr = false, session = null, apps = null, view = { v: "jobs" }, q = "", busy = false, flash = null;
  const params = new URLSearchParams(location.search);
  const SRC_KEY = "gdp-apply";
  const pending = { get: () => { try { return JSON.parse(localStorage.getItem(SRC_KEY) || "null"); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(SRC_KEY, JSON.stringify(v)) : localStorage.removeItem(SRC_KEY); } catch {} } };
  if (params.get("src")) pending.set({ ...(pending.get() || {}), src: params.get("src").toLowerCase().slice(0, 20), job: params.get("job") || pending.get()?.job || null });
  if (params.get("job")) view = { v: "job", id: params.get("job") };
  if (params.get("view") === "mine") view = { v: "mine" };
  if (params.get("iv")) view = { v: "iv", id: params.get("iv") };

  /* ---------- data ---------- */
  const CO = "GD Prime Property Management Corporation";
  async function loadCfg() { const { data, error } = await sb.rpc("hr_careers"); if (error) { cfgErr = true; cfg = { jobs: [], forms: [] }; } else { cfg = data || { jobs: [] }; cfgErr = false; } if (!/gd\s*prime/i.test(cfg.company || "")) cfg.company = CO; }
  async function loadApps() { if (!session) { apps = null; return; } const [{ data, error }] = await Promise.all([sb.rpc("hr_my_apps"), loadIv()]); apps = error ? [] : data || []; }
  const jobOf = (id) => cfg?.jobs?.find((j) => j.id === id);
  const appFor = (jobId) => (apps || []).find((a) => a.jobId === jobId);
  const myName = () => session?.user?.user_metadata?.full_name || "";

  async function upload(file) {
    if (!session) throw new Error("Sign in first.");
    if (file.size > 10 * 1048576) throw new Error("That file is over 10 MB. Take a smaller photo or scan.");
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type] || "bin").toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx"].includes(ext)) throw new Error("Use a PDF, a photo (JPG or PNG) or a Word file.");
    const id = `apply/${session.user.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(id, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw new Error("Couldn't upload the file. Check your connection and try again.");
    return { id, name: file.name.slice(0, 120) };
  }
  async function download(path, name) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error || !data) { toast("Couldn't open the file. Try again."); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(data); a.download = name || path.split("/").pop(); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  const errText = (e) => { const m = String(e?.message || e || ""); return /job_closed/.test(m) ? "This job is no longer open." : /consent_required/.test(m) ? "Please tick the privacy consent box." : /missing_fields/.test(m) ? "Fill in your first name, last name and mobile number."
    : /email_not_confirmed|not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you." : /too_many/.test(m) ? "You already have 5 applications in progress. Withdraw one to apply for another job."
    : /already_accepted/.test(m) ? "HR already accepted this requirement." : /slot_taken/.test(m) ? "Someone just picked that time. Please choose another." : /slot_gone/.test(m) ? "That time is no longer offered. Please choose another."
    : /already_scheduled/.test(m) ? "HR already set your interview schedule." : /not_interview_stage/.test(m) ? "Interview times open when HR moves your application to the interview stage." : /application_closed/.test(m) ? "This application is closed." : /Invalid login/i.test(m) ? "Wrong email or password." : m || "Something went wrong. Try again."; };

  /* ---------- page ---------- */
  const css = `
:root{--navy:#0D1729;--navy2:#16264A;--gold:#C9A45C;--gold2:#E0BE7A;--ink:#14213D;--muted:#5E6678;--line:#E6E1D6;--bg:#FBF9F4;--card:#fff;--ok:#1E6B3A;--okbg:#EAF6EE;--warn:#8A5A00;--warnbg:#FFF4DC;--bad:#9B1C1C;--badbg:#FDECEC;--blue:#1F4E9A;--bluebg:#EAF0FB}
*{box-sizing:border-box}html,body{margin:0}body{font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit}button{font:inherit;cursor:pointer}h1,h2,h3{font-family:"Playfair Display",Georgia,serif;line-height:1.15;margin:0}
.top{background:var(--navy);color:#fff;position:sticky;top:0;z-index:20;box-shadow:0 1px 0 rgba(224,190,122,.25)}
.top .in{max-width:1080px;margin:0 auto;display:flex;align-items:center;gap:12px;padding:10px 16px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0;background:none;border:0;color:#fff;padding:0;text-align:left}.brand img{width:40px;height:40px;border-radius:50%;box-shadow:0 0 0 1px rgba(224,190,122,.6)}
.brand b{display:block;font-family:"Playfair Display",Georgia,serif;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand span{display:block;font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold2);font-weight:700}
.top .sp{flex:1}.tbtn{border:1px solid rgba(224,190,122,.7);background:transparent;color:#F3E3BF;border-radius:99px;padding:8px 14px;font-weight:700;font-size:14px;white-space:nowrap}.tbtn:hover,.tbtn:focus-visible{background:var(--gold2);color:var(--navy);outline:none}
.tbtn.solid{background:var(--gold2);color:var(--navy);border-color:var(--gold2)}
.hero{background:linear-gradient(160deg,#0A1222 0%,#132447 60%,#0B1427 100%);color:#fff;padding:44px 16px 64px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset:0;background:radial-gradient(600px 300px at 85% 0%,rgba(201,164,92,.18),transparent 70%);pointer-events:none}
.hero .in{max-width:1080px;margin:0 auto;position:relative;z-index:1}.eyebrow{font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold2);font-weight:700}
.hero h1{font-size:clamp(30px,5vw,52px);margin:10px 0 12px;color:#fff}.hero h1 em{font-style:italic;color:var(--gold2)}.hero p{max-width:60ch;color:#C8CFDE;margin:0;font-size:16.5px}
.search{margin-top:22px;display:flex;gap:8px;max-width:620px}.search input{flex:1;min-width:0;border:0;border-radius:12px;padding:14px 16px;font:inherit;font-size:16px;color:var(--ink)}
main{max-width:1080px;margin:-36px auto 0;padding:0 16px 48px;position:relative;z-index:2}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 10px 30px -18px rgba(13,23,41,.25)}
.stack{display:flex;flex-direction:column;gap:14px}.jobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.job{display:flex;flex-direction:column;gap:8px;text-align:left;border:1px solid var(--line);background:#fff;border-radius:18px;padding:18px;transition:transform .15s,box-shadow .15s,border-color .15s;color:var(--ink)}
.job:hover,.job:focus-visible{transform:translateY(-2px);border-color:var(--gold);box-shadow:0 14px 30px -18px rgba(13,23,41,.45);outline:none}
.job h3{font-size:20px}.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:14px}.meta span{display:inline-flex;gap:6px;align-items:center}
.chip{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12.5px;font-weight:700;background:var(--bluebg);color:var(--blue);white-space:nowrap}.chip.ok{background:var(--okbg);color:var(--ok)}.chip.warn{background:var(--warnbg);color:var(--warn)}.chip.bad{background:var(--badbg);color:var(--bad)}.chip.gray{background:#EFEDE8;color:#555}.chip.gold{background:#F6EBD3;color:#7A5A12}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 18px;border-radius:12px;border:1px solid var(--line);background:#fff;color:var(--ink);font-weight:800;font-size:15px;text-decoration:none}
.btn.primary{background:linear-gradient(135deg,#0F1B33,#22365F);color:#fff;border:0;box-shadow:inset 0 -2px 0 rgba(224,190,122,.6)}.btn.gold{background:var(--gold2);border-color:var(--gold2);color:var(--navy)}.btn.sm{min-height:36px;padding:6px 12px;font-size:14px;border-radius:10px}
.btn:disabled{opacity:.6;cursor:wait}.btn.link{border:0;background:none;padding:0;min-height:0;color:#8A6A1F;text-decoration:underline;font-weight:700}
.back{border:0;background:none;color:var(--muted);font-weight:700;padding:6px 0;display:inline-flex;gap:6px;align-items:center}
.detail h1{font-size:clamp(26px,4vw,38px)}.desc{white-space:pre-line}
label.f{display:block;font-weight:700;font-size:13px;margin:0 0 6px;color:#2A3550}label.f small{font-weight:500;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
input.i,select.i,textarea.i{width:100%;border:1px solid #D9DCE5;border-radius:12px;padding:12px 14px;font:inherit;font-size:16px;color:var(--ink);background:#fff}
input.i:focus,select.i:focus,textarea.i:focus{outline:0;border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,164,92,.18)}
.drop{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px dashed #D5C7A4;border-radius:14px;padding:18px;text-align:center;background:#FFFCF5;cursor:pointer}.drop.has{border-style:solid;border-color:var(--ok);background:var(--okbg)}
.consent{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:#F6F1E4;border:1px solid #E8DCBC;font-size:14px;cursor:pointer}.consent input{width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:var(--navy2)}
.consent.bad{border-color:#D9534F;background:#FDF1F0}
.msg{padding:10px 12px;border-radius:10px;font-size:14px}.msg.err{background:var(--badbg);color:var(--bad)}.msg.ok{background:var(--okbg);color:var(--ok)}.msg.info{background:var(--bluebg);color:var(--blue)}
.auth{max-width:440px;margin:0 auto}.auth h2{font-size:28px;margin-bottom:4px}
.steps{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.step{flex:1 1 0;min-width:0;font-size:12px;font-weight:700;color:#8A8F9C;border-top:4px solid #E6E1D6;padding-top:6px}.step.done{color:var(--ok);border-color:#6FB58A}.step.cur{color:var(--navy2);border-color:var(--gold)}
.reqs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}.reqs li{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.reqs li:last-child{border:0}
.reqs .nm{flex:1 1 200px;min-width:0}.reqs .nm b{display:block}.reqs .nm small{color:var(--muted)}.reqs .act{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.reqs input.i{width:170px;padding:8px 10px;font-size:15px}
.upl{position:relative;overflow:hidden}.upl input{position:absolute;inset:0;opacity:0;cursor:pointer}
.sec h2{font-size:22px;margin-bottom:6px}.sub{color:var(--muted);margin:0;font-size:14.5px}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.iv{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;background:var(--bluebg)}.iv b{display:block}
.empty{text-align:center;padding:36px 16px;color:var(--muted)}
@media (max-width:600px){body footer a,body footer button{display:inline-block;padding:10px 0;min-height:40px}}footer{max-width:1080px;margin:0 auto;padding:22px 16px 40px;color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between}footer a,footer button{color:#8A6A1F;font-weight:700;background:none;border:0;padding:0;text-decoration:underline}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--navy);color:#fff;padding:12px 18px;border-radius:12px;z-index:50;font-size:14.5px;max-width:calc(100% - 32px);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.modal{position:fixed;inset:0;z-index:40;background:rgba(6,11,22,.7);display:grid;place-items:center;padding:16px}.modal>div{background:#FFFDF8;max-width:640px;width:100%;max-height:86vh;overflow:auto;border-radius:18px;padding:24px;font-size:14.5px}
.modal h2{font-size:24px;margin-bottom:6px}.modal h3{font-size:15px;margin:14px 0 4px;font-family:inherit}.modal ul{padding-left:20px;margin:0 0 8px}
@media (max-width:600px){.step{font-size:0;padding-top:0;border-top-width:6px;border-radius:3px}.step.cur{font-size:11px;padding-top:4px;flex:3 1 0}.brand b{font-size:13px;max-width:44vw}.brand span{display:none}.hero{padding:30px 16px 56px}.card{padding:16px}.tbtn{padding:7px 11px;font-size:13px}.reqs input.i{width:100%}}
@media (prefers-reduced-motion:reduce){.job{transition:none}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const root = document.getElementById("app");

  const setUrl = (qs, push) => { try { const u = new URL(location.href); u.search = qs; u.hash = ""; history[push ? "pushState" : "replaceState"](null, "", u); } catch {} };
  const toast = (m) => { $(".toast")?.remove(); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4200); };
  function go(v) { view = v; flash = null; const u = new URL(location.href); u.search = ""; if (v.v === "job" || v.v === "apply") u.searchParams.set("job", v.id); if (v.v === "mine") u.searchParams.set("view", "mine"); if (v.v === "iv") u.searchParams.set("iv", v.id); try { history.pushState(null, "", u); } catch {} render(); scrollTo(0, 0); }
  addEventListener("popstate", () => { const p = new URLSearchParams(location.search); view = p.get("iv") ? { v: "iv", id: p.get("iv") } : p.get("job") ? { v: "job", id: p.get("job") } : p.get("view") === "mine" ? { v: session ? "mine" : "auth", mode: "in" } : { v: "jobs" }; render(); });

  const header = () => `<header class="top"><div class="in"><button class="brand" data-go="jobs" aria-label="All job openings">${LOGO ? `<img src="${LOGO}" alt="" width="40" height="40">` : ""}<span><b>${esc(cfg?.company || "GD Prime Property Management Corporation")}</b><span>Careers</span></span></button><span class="sp"></span>
    ${session ? `<button class="tbtn ${view.v === "mine" ? "solid" : ""}" data-go="mine">My applications</button><button class="tbtn" data-out>Sign out</button>` : `<button class="tbtn" data-auth="in">Sign in</button>`}</div></header>`;
  const footer = () => `<footer><span>© ${new Date().getFullYear()} ${esc(cfg?.company || "GD Prime Property Management Corporation")} · <a href="https://gd-prime.com/" target="_blank" rel="noopener">gd-prime.com</a></span><span><button data-notice>Privacy Notice</button> · <a href="/?staff=1">Employee portal</a></span></footer>`;

  function jobsView() {
    const list = (cfg?.jobs || []).filter((j) => !q || `${j.title} ${j.site || ""} ${j.location || ""}`.toLowerCase().includes(q.toLowerCase()));
    return `<section class="hero"><div class="in"><span class="eyebrow">Careers at GD Prime</span><h1>Build your career <em>with us</em>.</h1>
      <p>We manage properties across the Philippines and are always looking for reliable, caring people. Find an opening, apply online, and follow your application from your phone.</p>
      <div class="search"><input id="q" type="search" placeholder="Search jobs or locations" aria-label="Search jobs or locations" value="${esc(q)}"></div></div></section>
      <main><div class="stack">${flash ? `<div class="msg ${flash[1]}" role="status">${esc(flash[0])}</div>` : ""}
      ${cfg === null ? `<div class="card empty">Loading openings…</div>` : list.length ? `<div class="jobs">${list.map(jobCard).join("")}</div>`
        : `<div class="card empty">${cfgErr ? "Our job openings will appear here soon." : q ? "No openings match your search." : "There are no openings right now. Please check again soon."}</div>`}
      ${(cfg?.forms || []).length ? formsCard() : ""}</div></main>`;
  }
  function jobCard(j) {
    const mine = appFor(j.id);
    return `<button class="job" data-job="${esc(j.id)}"><span class="row" style="justify-content:space-between;width:100%"><span class="chip gold">${esc(empType(j.empType))}</span>${mine ? `<span class="chip ok">Applied</span>` : ""}</span>
      <h3>${esc(j.title)}</h3><span class="meta"><span>📍 ${esc([j.site, j.location].filter(Boolean).join(", ") || "Head Office")}</span>${pay(j) ? `<span>💰 ${esc(pay(j))}</span>` : ""}</span>
      ${j.desc ? `<span class="sub" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(j.desc)}</span>` : ""}<span style="color:#8A6A1F;font-weight:800;font-size:14px">View and apply →</span></button>`;
  }
  function jobView() {
    const j = jobOf(view.id);
    if (!j) return `<main style="margin-top:24px"><button class="back" data-go="jobs">← All openings</button><div class="card empty">${cfg === null ? "Loading…" : "This job is no longer open. See our other openings."}</div></main>`;
    const mine = appFor(j.id);
    return `<main style="margin-top:24px"><button class="back" data-go="jobs">← All openings</button><article class="card detail stack">
      <span class="chip gold" style="align-self:flex-start">${esc(empType(j.empType))}</span><h1>${esc(j.title)}</h1>
      <div class="meta"><span>📍 ${esc([j.site, j.location].filter(Boolean).join(", ") || "Head Office")}</span>${pay(j) ? `<span>💰 ${esc(pay(j))}</span>` : ""}${j.slots > 1 ? `<span>👥 ${j.slots} openings</span>` : ""}${j.opened ? `<span>Posted ${esc(fmtDate(j.opened))}</span>` : ""}</div>
      ${j.desc ? `<div><h3 style="font-size:18px;margin:6px 0">Qualifications and duties</h3><div class="desc">${esc(j.desc)}</div></div>` : ""}
      <div><h3 style="font-size:18px;margin:6px 0">How to apply</h3><p style="margin:0">Apply online here: create your account, fill in the form and attach your resume. You can follow your application, see your interview schedule and send your requirements on this website.</p></div>
      <div class="row">${mine ? `<span class="chip ok">You applied on ${esc(fmtDate(mine.applied))}</span><button class="btn primary" data-go="mine">See my application</button>` : `<button class="btn primary" data-apply="${esc(j.id)}">Apply now</button>`}<button class="btn" data-share="${esc(j.id)}">Copy link</button></div></article></main>`;
  }
  function authView() {
    const m = view.mode || "in"; const j = jobOf(pending.get()?.job);
    const T = { in: ["Sign in", "Sign in to apply and follow your applications."], up: ["Create your account", "One account for all your applications. Use an email you check often."], reset: ["Reset your password", "We'll email you a link."], newpw: ["Set a new password", "Choose at least 8 characters."], sent: ["Check your email", ""] }[m];
    return `<main style="margin-top:24px"><button class="back" data-go="jobs">← All openings</button><form class="card auth stack" id="auth" data-mode="${m}" novalidate>
      <div><h2>${T[0]}</h2><p class="sub">${j && m !== "sent" ? `Applying for <b>${esc(j.title)}</b>. ` : ""}${T[1]}</p></div>
      ${m === "sent" ? `<div class="msg ok">We sent a confirmation link to <b>${esc(view.email || "your email")}</b>. Open it on this phone or computer to continue${j ? ` your application for ${esc(j.title)}` : ""}.</div><p class="sub">No email? Check your spam folder, or <button type="button" class="btn link" data-auth="up">try again</button>.</p>` : `
      ${m === "up" ? `<div><label class="f" for="a-name">Full name</label><input class="i" id="a-name" autocomplete="name" required></div>` : ""}
      ${m !== "newpw" ? `<div><label class="f" for="a-email">Email</label><input class="i" id="a-email" type="email" autocomplete="email" required></div>` : ""}
      ${m !== "reset" ? `<div><label class="f" for="a-pw">${m === "newpw" ? "New password" : "Password"} ${m !== "in" ? "<small>(at least 8 characters)</small>" : ""}</label><input class="i" id="a-pw" type="password" minlength="8" autocomplete="${m === "in" ? "current-password" : "new-password"}" required></div>` : ""}
      ${flash ? `<div class="msg ${flash[1]}" role="status">${esc(flash[0])}</div>` : ""}
      <button class="btn primary" type="submit">${{ in: "Sign in", up: "Create account", reset: "Send reset link", newpw: "Save password" }[m]}</button>
      <div class="row" style="justify-content:space-between;font-size:14px">${m === "in" ? `<button type="button" class="btn link" data-auth="up">Create an account</button><button type="button" class="btn link" data-auth="reset">Forgot password?</button>` : m !== "newpw" ? `<button type="button" class="btn link" data-auth="in">I already have an account</button>` : ""}</div>`}
      </form></main>`;
  }
  function applyView() {
    const j = jobOf(view.id); if (!j) return jobView();
    const prev = appFor(j.id) || (apps || [])[0] || {}; const nm = myName().trim().split(/\s+/); const v = { first: prev.first || (nm.length > 1 ? nm.slice(0, -1).join(" ") : nm[0] || ""), last: prev.last || (nm.length > 1 ? nm[nm.length - 1] : ""), ...prev };
    const F = (k, l, type = "text", req, extra = "") => `<div><label class="f" for="p-${k}">${l}${req ? "" : " <small>(optional)</small>"}</label><input class="i" id="p-${k}" name="${k}" type="${type}" value="${esc(v[k] ?? "")}" ${req ? "required" : ""} ${extra}></div>`;
    const edit = !!appFor(j.id);
    return `<main style="margin-top:24px"><button class="back" data-job="${esc(j.id)}">← ${esc(j.title)}</button><form class="card stack" id="apply" novalidate>
      <div><h2 style="font-size:28px">${edit ? "Update your application" : "Apply"} for ${esc(j.title)}</h2><p class="sub">${esc([j.site, j.location].filter(Boolean).join(", "))}${pay(j) ? ` · ${esc(pay(j))}` : ""}</p></div>
      <div class="grid">${F("first", "First name", "text", 1, 'autocomplete="given-name"')}${F("middle", "Middle name", "text", 0, 'autocomplete="additional-name"')}${F("last", "Last name", "text", 1, 'autocomplete="family-name"')}
        ${F("mobile", "Mobile number", "tel", 1, 'autocomplete="tel" placeholder="09XX XXX XXXX"')}<div><label class="f">Email</label><input class="i" value="${esc(session.user.email)}" disabled></div>
        ${F("birth", "Birth date", "date", 0)}<div><label class="f" for="p-gender">Sex <small>(optional)</small></label><select class="i" id="p-gender" name="gender"><option value="">—</option><option value="F" ${v.gender === "F" ? "selected" : ""}>Female</option><option value="M" ${v.gender === "M" ? "selected" : ""}>Male</option></select></div>
        ${F("expRate", `Expected pay (PHP ${j.payType === "DAILY" ? "a day" : "a month"})`, "number", 0, 'min="0" step="1" inputmode="numeric"')}</div>
      ${F("address", "Home address", "text", 0, 'autocomplete="street-address"')}
      <div><label class="f" for="p-notes">Work experience, skills and licenses <small>(optional)</small></label><textarea class="i" id="p-notes" name="notes" rows="4" placeholder="For example: 3 years as a security guard at a mall; valid security guard license until 2027">${esc(v.notes || "")}</textarea></div>
      ${qsOf(j).length ? `<fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="f" style="font-weight:700;font-size:15px;margin-bottom:4px">A few questions about this job</legend><p class="sub" style="margin:0 0 6px">Your answers and resume are checked first by our screening system, then by HR. HR makes every decision.</p>
        ${qsOf(j).map((q, i) => `<div><label class="f" for="p-q${i}">${esc(q)}</label><textarea class="i" id="p-q${i}" data-q="${i}" rows="2" maxlength="1500" required>${esc(v.answers?.[q] || "")}</textarea></div>`).join("")}</fieldset>` : ""}
      <div><span class="f" style="display:block;font-weight:700;font-size:13px;margin-bottom:6px">Resume or CV ${edit && v.resume ? "<small>(already attached; choose a file to replace it)</small>" : ""}</span>
        <label class="drop ${S.file || v.resume ? "has" : ""}" id="p-drop" tabindex="0"><b>${S.file ? esc(S.file.name) : v.resume ? esc(v.resume.name || "Resume attached") : "Attach your resume"}</b><span class="sub">PDF, Word or a clear photo, up to 10 MB</span><input type="file" id="p-file" accept="application/pdf,image/*,.doc,.docx" hidden></label></div>
      <label class="consent" id="p-consent-box"><input type="checkbox" id="p-consent" ${edit ? "checked" : ""}><span>I have read the <button type="button" class="btn link" data-notice>Privacy Notice</button> and agree to GD Prime processing my personal information for this and future job openings, under the Data Privacy Act of 2012 (RA 10173).</span></label>
      ${flash ? `<div class="msg ${flash[1]}" role="status">${esc(flash[0])}</div>` : ""}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-job="${esc(j.id)}">Cancel</button><button class="btn primary" type="submit">${edit ? "Save changes" : "Send my application"}</button></div></form></main>`;
  }
  const S = { file: null };
  // Qualification questions: the job's own, or the standard ones (same as the HR app's DEF_QUESTIONS in app/recx.js).
  const DEF_QS = ["How many years of experience do you have in this kind of work?", "Do you have the license, NC or certificate this job needs?", "When can you start?", "Are you willing to be assigned to any project site?"];
  const qsOf = (j) => (Array.isArray(j.questions) && j.questions.length ? j.questions : DEF_QS).slice(0, 12).map(String);
  function stageChip(a) { const s = a.stage; return s === "HIRED" ? `<span class="chip ok">Hired</span>` : s === "REJECTED" ? `<span class="chip gray">Not selected</span>` : s === "WITHDRAWN" ? `<span class="chip gray">Withdrawn</span>` : `<span class="chip">${esc(STAGES.find((x) => x[0] === s)?.[1] || s)}</span>`; }
  function reqState(a, k) {
    const r = a.portal?.reqs?.[k];
    if (a.reqs?.[k] || r?.status === "ACCEPTED") return ["Accepted", "ok", r];
    if (r?.status === "REDO") return ["Please send again", "bad", r];
    if (r) return ["Sent, HR is checking", "warn", r];
    return ["Not sent yet", "gray", null];
  }
  function appCard(a) {
    const idx = STAGES.findIndex((x) => x[0] === a.stage); const open = isOpen(a); const out = ["REJECTED", "WITHDRAWN"].includes(a.stage);
    const ivs = (a.ivs || []).filter((i) => i.result === "PENDING" && i.d >= today()).sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
    const RL = reqList(); const nAcc = RL.filter(([k]) => reqState(a, k)[1] === "ok").length; const showReqs = !out && (idx >= 3 || Object.keys(a.portal?.reqs || {}).length || Object.keys(a.reqs || {}).length);
    const shared = (a.portal?.shared || []);
    return `<article class="card stack" id="app-${esc(a.id)}"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="font-size:24px">${esc(a.job || "Job opening")}</h2><p class="sub">${esc([a.site, a.location].filter(Boolean).join(", "))}${a.applied ? ` · Applied ${esc(fmtDate(a.applied))}` : ""}</p></div>${stageChip(a)}</div>
      ${out ? "" : `<div class="steps" aria-label="Application progress">${STAGES.map(([, l], i) => `<span class="step ${i < idx ? "done" : i === idx ? "cur" : ""}">${l}</span>`).join("")}</div>`}
      <p style="margin:0">${esc(STAGE_TXT[a.stage] || "")}</p>
      ${ivBox(a)}
      ${ivs.map((i) => `<div class="iv"><span style="font-size:24px" aria-hidden="true">🗓️</span><span><b>${esc(i.kind || "Interview")}</b>${esc(fmtDay(i.d))}${i.t ? ` at ${esc(fmtTime(i.t))}` : ""}<br><small class="sub">Please come 15 minutes early and bring a valid ID and a copy of your resume.</small></span></div>`).join("")}
      ${open && (a.slots || []).length ? slotPicker(a) : ""}
      ${a.offer ? `<div class="iv" style="background:${a.offer.status === "DECLINED" ? "var(--badbg)" : "var(--okbg)"}"><span style="font-size:24px" aria-hidden="true">📄</span><span><b>Job offer ${a.offer.status === "ACCEPTED" ? "accepted" : a.offer.status === "DECLINED" ? "declined" : "sent to you"}</b>${a.offer.rate ? `Pay: ${esc(peso.format(a.offer.rate))} ${a.offer.payType === "DAILY" ? "a day" : "a month"}` : ""}${a.offer?.status === "SENT" && a.stage !== "HIRED" ? `<div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn gold" data-offer="${esc(a.id)}:1">Accept the offer</button><button class="btn" data-offer="${esc(a.id)}:0">Decline</button></div>` : ""}${a.offer.start ? ` · Start date: ${esc(fmtDate(a.offer.start))}` : ""}</span></div>` : ""}
      ${shared.length ? `<section class="sec"><h3 style="font-size:18px;margin-bottom:4px">Documents from HR</h3><p class="sub">Download each one. If it needs your signature, print and sign it, then upload a photo or scan of the signed copy.</p><ul class="reqs">${shared.map((s) => { const b = a.portal?.back?.[s.id];
        return `<li><span class="nm"><b>${esc(s.name)}</b><small>${s.sign ? (b ? `Signed copy sent ${esc(fmtDate(b.at))}` : "Needs your signature") : "For your information"}${s.note ? ` · ${esc(s.note)}` : ""}</small></span><span class="act"><button class="btn sm" data-dl="${esc(s.file)}" data-name="${esc(s.name)}">Download</button>
          ${s.sign && open ? `<label class="btn sm ${b ? "" : "gold"} upl">${b ? "Replace signed copy" : "Upload signed copy"}<input type="file" accept="application/pdf,image/*" data-back="${esc(a.id)}:${esc(s.id)}"></label>` : ""}${b ? `<span class="chip ok">Sent</span>` : ""}</span></li>`; }).join("")}</ul></section>` : ""}
      ${showReqs ? `<section class="sec"><div class="row" style="justify-content:space-between"><h3 style="font-size:18px">Pre-employment requirements</h3><span class="chip ${nAcc === RL.length ? "ok" : "gold"}">${nAcc} of ${RL.length} accepted</span></div>
        <p class="sub">Upload a clear photo or scan of each one. For government numbers, type the number and, if you have it, add a photo of the ID or card.</p><ul class="reqs">${RL.map(([k, l, num]) => { const [txt, cls, r] = reqState(a, k); const done = cls === "ok";
          return `<li><span class="nm"><b>${esc(l)}</b><small><span class="chip ${cls}">${esc(txt)}</span>${r?.at ? ` ${esc(fmtDate(r.at))}` : ""}${r?.num ? ` · ${esc(r.num)}` : ""}${r?.name ? ` · ${esc(r.name)}` : ""}${r?.status === "REDO" && r.note ? `<br>HR's note: ${esc(r.note)}` : ""}</small></span>
            ${open && !done ? `<span class="act">${num ? `<input class="i" data-num="${esc(a.id)}:${esc(k)}" value="${esc(r?.num || "")}" placeholder="Type the number" aria-label="${esc(l)}"><button class="btn sm" data-save-num="${esc(a.id)}:${esc(k)}">Save</button>` : ""}<label class="btn sm ${r ? "" : "gold"} upl">${r?.file ? "Replace file" : num ? "Add photo" : "Upload"}<input type="file" accept="application/pdf,image/*" data-req="${esc(a.id)}:${esc(k)}"></label></span>` : ""}</li>`; }).join("")}</ul></section>`
        : !out ? `<p class="sub" style="margin:0">After you pass the interview, you'll send your pre-employment requirements here (NBI clearance, medical, PSA birth certificate, SSS, PhilHealth, Pag-IBIG, TIN and others).</p>` : ""}
      ${open ? `<div class="row" style="justify-content:flex-end">${a.stage === "APPLIED" && jobOf(a.jobId) ? `<button class="btn sm" data-edit-app="${esc(a.jobId)}">Edit my application</button>` : ""}<button class="btn sm" data-withdraw="${esc(a.id)}" style="color:var(--bad)">Withdraw</button></div>` : ""}</article>`;
  }
  // Interview times HR offers on the job (hr_my_apps slots); the applicant picks one, and can change it until the day before.
  function slotPicker(a) {
    const mine = (a.ivs || []).find((i) => i.slot && i.result === "PENDING" && i.d > today()); const days = {};
    for (const s of a.slots) (days[s.d] = days[s.d] || []).push(s);
    return `<section class="sec"><h3 style="font-size:18px;margin-bottom:4px">${mine ? "Your interview time" : "Pick your interview time"}</h3>
      <p class="sub">${mine ? `You picked ${esc(fmtDay(mine.d))} at ${esc(fmtTime(mine.t))}. You can change it until the day before.` : "Choose the time that works best for you. Each time is for one applicant, so pick soon."}</p>
      ${Object.entries(days).map(([d, list]) => `<p style="margin:10px 0 6px;font-weight:700">${esc(fmtDay(d))}</p><div class="row">${list.map((s) => { const cur = mine?.slot === s.id;
        return `<button class="btn sm ${cur ? "primary" : ""}" data-book="${esc(a.id)}:${esc(s.id)}" ${cur ? 'aria-pressed="true" disabled' : ""}>${esc(fmtTime(s.t))}${s.kind && s.kind !== "Interview" ? ` · ${esc(s.kind)}` : ""}</button>`; }).join("")}</div>`).join("")}</section>`;
  }
  function formsCard() {
    return `<section class="card sec"><h2>Forms to download</h2><p class="sub">${session ? "Fill these in and bring them, or upload them with your requirements." : "Sign in to download the forms."}</p><ul class="reqs">${cfg.forms.map((f) => `<li><span class="nm"><b>${esc(f.name)}</b>${f.note ? `<small>${esc(f.note)}</small>` : ""}</span><span class="act">${session ? `<button class="btn sm" data-dl="${esc(f.file)}" data-name="${esc(f.name)}">Download</button>` : `<button class="btn sm" data-auth="in">Sign in to download</button>`}</span></li>`).join("")}</ul></section>`;
  }
  function mineView() {
    return `<main style="margin-top:24px"><div class="stack"><div class="row" style="justify-content:space-between"><div><h1 style="font-size:32px">My applications</h1><p class="sub">${esc(session.user.email)}</p></div><button class="btn" data-go="jobs">See all openings</button></div>
      ${flash ? `<div class="msg ${flash[1]}" role="status">${esc(flash[0])}</div>` : ""}
      ${apps === null ? `<div class="card empty">Loading…</div>` : apps.length ? apps.map(appCard).join("") : `<div class="card empty">You haven't applied yet. <button class="btn link" data-go="jobs">Find a job opening</button></div>`}
      ${(cfg?.forms || []).length ? formsCard() : ""}</div></main>`;
  }
  function render() {
    const keep = document.activeElement?.id; const pos = document.activeElement?.selectionStart;
    const v = view.v; const body = v === "job" ? jobView() : v === "apply" ? (session ? applyView() : authView()) : v === "auth" ? authView() : v === "mine" ? (session ? mineView() : authView()) : v === "iv" ? (session ? ivView() : authView()) : jobsView();
    root.innerHTML = header() + body + footer();
    document.title = v === "job" && jobOf(view.id) ? `${jobOf(view.id).title} · Careers at GD Prime` : v === "mine" ? "My applications · GD Prime Careers" : v === "iv" ? "Online interview · GD Prime Careers" : "Careers · GD Prime";
    if (keep === "q") { const i = $("#q"); i?.focus(); try { i?.setSelectionRange(pos, pos); } catch {} }
  }

  /* ---------- privacy notice for applicants ---------- */
  function notice() {
    const d = document.createElement("div"); d.className = "modal"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Privacy Notice");
    d.innerHTML = `<div tabindex="-1"><h2>Privacy Notice for Applicants</h2><p class="sub">GD Prime Property Management Corporation · Version ${DPA_V.slice(0, 10)}</p>
      <p>We protect your personal information under the <b>Data Privacy Act of 2012 (RA 10173)</b> and the rules of the National Privacy Commission.</p>
      <h3>What we collect</h3><ul><li>Your name, contact details, birth date, sex and address.</li><li>Your resume, work history, skills, and expected pay.</li><li>Pre-employment requirements you send: NBI clearance, medical results, PSA birth certificate, government numbers, school records and ID photo. Medical results are sensitive personal information and are handled with extra care.</li></ul>
      <h3>Why we use it</h3><ul><li>To assess your application, schedule interviews and tests, and contact you.</li><li>To prepare your job offer and, if hired, your employment records.</li><li>To consider you for future openings that fit you.</li></ul>
      <h3>Who sees it</h3><p>Only GD Prime's HR and hiring staff, and managers involved in the hiring decision. We do not sell your data or share it outside GD Prime except as the law requires.</p>
      <h3>How long we keep it</h3><p>If you are hired, your records move to your employee file. If not, we keep your application only as long as needed for recruitment and as the law requires, then dispose of it securely.</p>
      <h3>Your rights</h3><p>You may access, correct, or ask us to delete your data, withdraw your consent, and file a complaint with the National Privacy Commission (privacy.gov.ph). Contact HR at the Head Office for any request.</p>
      <button class="btn primary" style="width:100%;margin-top:10px" data-close>I understand</button></div>`;
    document.body.appendChild(d); d.firstChild.focus();
  }
  function askConfirm(text, yes) {
    return new Promise((ok) => { const d = document.createElement("div"); d.className = "modal"; d.setAttribute("role", "alertdialog"); d.setAttribute("aria-modal", "true");
      d.innerHTML = `<div tabindex="-1" style="max-width:420px"><p style="font-size:16px;margin:0 0 16px">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-no>Cancel</button><button class="btn primary" data-yes>${esc(yes)}</button></div></div>`;
      document.body.appendChild(d); d.querySelector("[data-yes]").focus();
      d.addEventListener("click", (e) => { if (e.target.closest("[data-yes]")) { d.remove(); ok(true); } else if (e.target.closest("[data-no]") || e.target === d) { d.remove(); ok(false); } }); });
  }

  /* ---------- events ---------- */
  document.addEventListener("input", (e) => { if (e.target.id === "q") { q = e.target.value; render(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector(".modal")?.remove(); });
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button,[data-job],[data-go],[data-close]"); if (!t) return;
    const d = t.dataset;
    if (d.close !== undefined || e.target.classList.contains("modal")) { t.closest(".modal")?.remove(); return; }
    if (d.notice !== undefined) { e.preventDefault(); notice(); return; }
    if (d.go) { if (d.go === "mine" && !session) { go({ v: "auth", mode: "in" }); return; } go({ v: d.go }); return; }
    if (d.job) { go({ v: "job", id: d.job }); return; }
    if (d.auth) { e.preventDefault(); flash = null; view = { ...view, v: "auth", mode: d.auth }; render(); $("#auth input")?.focus(); return; }
    if (d.apply || d.editApp) { const id = d.apply || d.editApp; pending.set({ ...(pending.get() || {}), job: id }); S.file = null; if (!session) { view = { v: "auth", mode: "up" }; render(); return; } go({ v: "apply", id }); return; }
    if (d.share) { const u = `${location.origin}/careers?job=${encodeURIComponent(d.share)}`; try { await navigator.clipboard.writeText(u); toast("Link copied."); } catch { toast(u); } return; }
    if (d.out !== undefined) { await sb.auth.signOut({ scope: "local" }).catch(() => {}); try { navigator.serviceWorker?.controller?.postMessage({ hrToken: null }); } catch {} session = null; apps = null; go({ v: "jobs" }); return; }
    if (d.dl) { await download(d.dl, d.name); return; }
    if (d.saveNum) { const [aid, k] = d.saveNum.split(":"); const v = $(`[data-num="${d.saveNum}"]`)?.value.trim(); if (!v) { toast("Type the number first."); return; }
      t.disabled = true; const { error } = await sb.rpc("hr_portal_put", { p_app: aid, p_kind: "req", p_key: k, p_val: { num: v, ...(curReq(aid, k)?.file ? { file: curReq(aid, k).file, name: curReq(aid, k).name } : {}) } });
      if (error) { t.disabled = false; toast(errText(error)); return; } toast("Saved. HR will check it."); await loadApps(); render(); return; }
    if (d.offer) { const [aid, yes] = d.offer.split(":"); if (!await askConfirm(yes === "1" ? "Accept this job offer? HR will prepare your first day." : "Decline this job offer?", yes === "1" ? "Accept" : "Decline")) return;
      t.disabled = true; const { error } = await sb.rpc("hr_offer_respond", { p_app: aid, p_accept: yes === "1" }); t.disabled = false; if (error) { toast(errText(error)); return; }
      toast(yes === "1" ? "Thank you! You accepted the offer. Please finish your requirements below." : "You declined the offer. Thank you for letting us know."); await loadApps(); render(); return; }
    if (d.book) { const [aid, k] = d.book.split(":"); const s = apps?.find((x) => x.id === aid)?.slots?.find((x) => x.id === k); if (!s) return;
      if (!await askConfirm(`Pick ${fmtDay(s.d)} at ${fmtTime(s.t)} for your ${(s.kind || "interview").toLowerCase()}?`, "Pick this time")) return;
      t.disabled = true; const { error } = await sb.rpc("hr_portal_put", { p_app: aid, p_kind: "book", p_key: k }); t.disabled = false;
      if (error) { toast(errText(error)); await loadApps(); render(); return; } toast("Done. We'll email you the schedule. Please come 15 minutes early."); await loadApps(); render(); return; }
    if (d.withdraw) { const a = apps.find((x) => x.id === d.withdraw); if (!await askConfirm(`Withdraw your application for ${a?.job || "this job"}? HR will stop processing it.`, "Withdraw")) return;
      const { error } = await sb.rpc("hr_portal_put", { p_app: d.withdraw, p_kind: "withdraw" }); if (error) { toast(errText(error)); return; } toast("Your application was withdrawn."); await loadApps(); render(); return; }
  });
  const curReq = (aid, k) => apps?.find((a) => a.id === aid)?.portal?.reqs?.[k];
  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.id === "p-file") { S.file = el.files?.[0] || null; const z = $("#p-drop"); if (z && S.file) { z.classList.add("has"); z.querySelector("b").textContent = S.file.name; } return; }
    const key = el.dataset?.req || el.dataset?.back; if (!key || !el.files?.[0]) return; const [aid, k] = key.split(":"); const f = el.files[0]; el.value = "";
    toast("Uploading…");
    try {
      const up = await upload(f); const num = el.dataset.req ? ($(`[data-num="${aid}:${k}"]`)?.value.trim() || curReq(aid, k)?.num || undefined) : undefined;
      const { error } = await sb.rpc("hr_portal_put", { p_app: aid, p_kind: el.dataset.req ? "req" : "back", p_key: k, p_val: { file: up.id, name: up.name, ...(num ? { num } : {}) } });
      if (error) throw error; toast(el.dataset.req ? "Sent. HR will check it." : "Signed copy sent to HR."); await loadApps(); render();
    } catch (x) { toast(errText(x)); }
  });
  document.addEventListener("dragover", (e) => { if (e.target.closest?.("#p-drop")) e.preventDefault(); });
  document.addEventListener("drop", (e) => { const z = e.target.closest?.("#p-drop"); if (!z) return; e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) { S.file = f; z.classList.add("has"); z.querySelector("b").textContent = f.name; } });
  document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.id === "p-drop") { e.preventDefault(); $("#p-file").click(); } });

  document.addEventListener("submit", async (e) => {
    const f = e.target; e.preventDefault(); if (busy) return; const btn = f.querySelector("button[type=submit]"); const val = (id) => f.querySelector(id)?.value.trim() || "";
    const fail = (m, kind = "err") => { busy = false; if (btn) btn.disabled = false; let el = f.querySelector(".msg"); if (!el) { el = document.createElement("div"); btn?.closest(".row")?.before(el) || btn?.before(el); }
      el.className = `msg ${kind}`; el.setAttribute("role", "status"); el.textContent = m; };
    busy = true; if (btn) btn.disabled = true;
    try {
      if (f.id === "auth") {
        const m = f.dataset.mode; const job = pending.get();
        const back = `${location.origin}/careers${job?.job ? `?job=${encodeURIComponent(job.job)}${job.src ? `&src=${encodeURIComponent(job.src)}` : ""}` : "?view=mine"}`;
        if (m === "in") { const { error } = await sb.auth.signInWithPassword({ email: val("#a-email"), password: $("#a-pw").value }); if (error) throw error; busy = false; return; }
        if (m === "up") {
          if (!val("#a-name")) return fail("Enter your full name."); if (!/^\S+@\S+\.\S+$/.test(val("#a-email"))) return fail("Enter a valid email."); if ($("#a-pw").value.length < 8) return fail("Use at least 8 characters for your password.");
          const { data, error } = await sb.auth.signUp({ email: val("#a-email"), password: $("#a-pw").value, options: { data: { full_name: val("#a-name"), applicant: true }, emailRedirectTo: back } });
          if (error) throw error;
          if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { busy = false; flash = ["This email already has an account. Sign in, or tap Forgot password?", "err"]; view = { v: "auth", mode: "in" }; render(); return; }
          if (!data.session) { busy = false; view = { v: "auth", mode: "sent", email: val("#a-email") }; render(); return; }
          busy = false; return;
        }
        if (m === "reset") { const { error } = await sb.auth.resetPasswordForEmail(val("#a-email"), { redirectTo: `${location.origin}/careers` }); if (error) throw error; busy = false; flash = ["If that email has an account, a reset link is on its way.", "ok"]; view = { v: "auth", mode: "in" }; render(); return; }
        if (m === "newpw") { const { error } = await sb.auth.updateUser({ password: $("#a-pw").value }); if (error) throw error; busy = false; flash = ["Password saved.", "ok"]; go({ v: "mine" }); return; }
      }
      if (f.id === "apply") {
        const j = jobOf(view.id); const ck = $("#p-consent");
        if (!ck.checked) { busy = false; btn.disabled = false; $("#p-consent-box").classList.add("bad"); ck.focus(); toast("Please tick the privacy consent box."); return; }
        if (!val("#p-first") || !val("#p-last") || !val("#p-mobile")) return fail("Fill in your first name, last name and mobile number.");
        if (!/^[+\d][\d\s-]{6,}$/.test(val("#p-mobile"))) return fail("Check your mobile number.");
        const had = appFor(j.id); if (!S.file && !had?.resume) return fail("Attach your resume or CV.");
        const answers = {}; for (const [i, q] of qsOf(j).entries()) { const a = ($(`#p-q${i}`)?.value || "").trim(); if (!a) { $(`#p-q${i}`)?.focus(); return fail("Please answer every question about the job."); } answers[q] = a; }
        const p = { first: val("#p-first"), middle: val("#p-middle"), last: val("#p-last"), mobile: val("#p-mobile"), birth: val("#p-birth"), gender: val("#p-gender"), expRate: val("#p-expRate"), address: val("#p-address"), notes: val("#p-notes"), consent: true, dpaV: DPA_V, src: pending.get()?.src || "", answers };
        if (S.file) p.resume = await upload(S.file);
        const { error } = await sb.rpc("hr_apply", { p_job: j.id, p }); if (error) throw error;
        S.file = null; pending.set(null); await loadApps(); busy = false; view = { v: "mine" }; setUrl("?view=mine", true); flash = [had ? "Your application was updated." : `Thank you! Your application for ${j.title} was sent. We'll update you here.`, "ok"]; render(); scrollTo(0, 0); return;
      }
      busy = false;
    } catch (x) { fail(errText(x)); }
  });

  /* ---------- careers assistant (Glenn 2026-10-24): job seekers ask about openings; answers come from hr-bot ?ch=careers ---------- */
  const CB = { on: false, open: false, busy: false, msgs: [] };
  const cbCss = `.cb-btn{position:fixed;right:16px;bottom:16px;z-index:30;display:flex;gap:8px;align-items:center;background:var(--navy);color:#fff;border:0;border-radius:999px;padding:12px 18px;font-weight:700;box-shadow:0 8px 24px rgba(13,23,41,.25)}
.cb{position:fixed;right:16px;bottom:16px;z-index:31;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 32px));display:flex;flex-direction:column;background:#FFFDF8;border:1px solid var(--line);border-radius:16px;box-shadow:0 16px 48px rgba(13,23,41,.3);overflow:hidden}
.cb header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--navy);color:#fff}.cb header b{font-family:"Playfair Display",Georgia,serif;font-size:17px}.cb header button{background:none;border:0;color:#fff;font-size:22px;line-height:1;min-width:40px;min-height:40px}
.cb ol{list-style:none;margin:0;padding:12px;flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px}.cb li{max-width:88%;padding:9px 12px;border-radius:12px;font-size:14.5px;white-space:pre-wrap;overflow-wrap:anywhere}
.cb li.u{align-self:flex-end;background:var(--navy);color:#fff}.cb li.b{align-self:flex-start;background:var(--bluebg)}.cb li .btn{margin-top:6px}
.cb form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.cb textarea{flex:1;resize:none;font:inherit;font-size:16px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;min-height:44px}.cb small{display:block;padding:0 12px 8px;color:var(--muted);font-size:12px}`;
  { const x = document.createElement("style"); x.textContent = cbCss; document.head.appendChild(x); }
  const cbHost = document.createElement("div"); document.body.appendChild(cbHost);
  const cbFmt = (t) => esc(t).replace(/\[\[JOB:([^\]\s]+)\]\]\n?/g, (m, id) => { const j = jobOf(id); return j ? `<button class="btn sm gold" data-cb-job="${esc(id)}">${esc(j.title)} →</button>\n` : ""; }).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  function cbRender() {
    if (!CB.on) { cbHost.innerHTML = ""; return; }
    if (!CB.open) { cbHost.innerHTML = `<button class="cb-btn" data-cb="open" aria-label="Ask about our jobs"><span aria-hidden="true">💬</span>Ask about our jobs</button>`; return; }
    cbHost.innerHTML = `<section class="cb" role="dialog" aria-label="Careers assistant"><header><b>Ask about our jobs</b><button data-cb="close" aria-label="Close">×</button></header>
      <ol aria-live="polite"><li class="b">Hi! I can tell you about our openings, how to apply and the requirements. What kind of work are you looking for?</li>${CB.msgs.map((m) => `<li class="${m.role === "user" ? "u" : "b"}">${m.role === "user" ? esc(m.content) : cbFmt(m.content)}</li>`).join("")}${CB.busy ? '<li class="b"><i>Typing…</i></li>' : ""}</ol>
      <form id="cb-f"><label class="sr" for="cb-in" style="position:absolute;left:-9999px">Your question</label><textarea id="cb-in" rows="1" maxlength="800" placeholder="Type your question" ${CB.busy ? "disabled" : ""}></textarea><button class="btn primary" ${CB.busy ? "disabled" : ""}>Send</button></form>
      <small>Answers come from an AI assistant and can be wrong. HR makes every hiring decision. Please don't share ID numbers here.</small></section>`;
    const ol = cbHost.querySelector("ol"); if (ol) ol.scrollTop = ol.scrollHeight; if (!CB.busy) cbHost.querySelector("#cb-in")?.focus();
  }
  async function cbCall(body) {
    const r = await fetch(`${SB_URL}/functions/v1/hr-bot?ch=careers`, { method: "POST", headers: { "content-type": "application/json", apikey: SB_KEY }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "The assistant couldn't answer. Try again."); return j;
  }
  async function cbAsk(text) {
    CB.msgs.push({ role: "user", content: text }); CB.busy = true; cbRender();
    try { const r = await cbCall({ messages: CB.msgs.slice(-10) }); CB.msgs.push({ role: "assistant", content: r.text || "" }); }
    catch (x) { CB.msgs.push({ role: "assistant", content: x.message }); } finally { CB.busy = false; cbRender(); }
  }
  cbHost.addEventListener("click", (e) => { const t = e.target.closest("[data-cb],[data-cb-job]"); if (!t) return; e.stopPropagation();
    if (t.dataset.cbJob) { CB.open = false; cbRender(); go({ v: "job", id: t.dataset.cbJob }); return; } CB.open = t.dataset.cb === "open"; cbRender(); });
  cbHost.addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); const i = cbHost.querySelector("#cb-in"); const q = i?.value.trim(); if (q && !CB.busy) cbAsk(q); });
  cbHost.addEventListener("keydown", (e) => { if (e.target.id === "cb-in" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form?.requestSubmit(); } if (e.key === "Escape" && CB.open) { CB.open = false; cbRender(); } });
  cbCall({ ping: true }).then((r) => { CB.on = !!r.ok; cbRender(); }).catch(() => {});

  /* ---------- AI first-round interview (Glenn 2026-10-25): HR or a rule invites the applicant; the questions and follow-ups come
     from hr-bot ?ch=iv, which keeps the transcript on the application. The score is never sent to this page. ---------- */
  const IV = { by: {}, busy: false, draft: "", lang: "en-PH", rec: null };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  { const x = document.createElement("style"); x.textContent = `.ivx{background:#F6F1E4;border:1px solid #E8DCBC;border-radius:14px;padding:14px 16px}.ivx h3{font-size:18px;margin-bottom:4px}
.ivchat{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.ivchat li{max-width:86%;padding:10px 14px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.ivchat li.ai{align-self:flex-start;background:var(--bluebg)}.ivchat li.me{align-self:flex-end;background:var(--navy);color:#fff}.ivchat li.wait{opacity:.7;font-style:italic}
.ivbar{height:8px;border-radius:99px;background:#E6E1D6;overflow:hidden}.ivbar span{display:block;height:100%;background:var(--gold)}
#iv-in{min-height:110px;resize:vertical}.mic.on{background:var(--badbg);border-color:var(--bad);color:var(--bad)}`; document.head.appendChild(x); }
  async function ivCall(body) {
    const tok = (await sb.auth.getSession()).data.session?.access_token || session?.access_token || "";
    const r = await fetch(`${SB_URL}/functions/v1/hr-bot?ch=iv`, { method: "POST", headers: { "content-type": "application/json", apikey: SB_KEY, authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || "failed"); e.data = j; throw e; } return j;
  }
  async function loadIv() { if (!session) { IV.by = {}; return; } try { const r = await ivCall({ op: "mine" }); IV.by = {}; for (const x of r.list || []) IV.by[x.app] = x; } catch { /* interviews off or offline: the rest of the page works */ } }
  const ivErr = (e) => { const m = String(e?.message || e || ""); return /expired/.test(m) ? "The time for this online interview has passed. HR may contact you." : /already_done/.test(m) ? "You already finished this interview. Thank you!"
    : /not_invited|not_found/.test(m) ? "This online interview is no longer open." : /application_closed/.test(m) ? "This application is closed." : /consent_required/.test(m) ? "Please tick the box to agree first."
    : /too_many/.test(m) ? "Too many tries today. Please continue tomorrow." : /too_long/.test(m) ? "This interview is already long enough. HR will review it." : /out_of_date/.test(m) ? "Your interview was updated in another window. Here is the latest."
    : /not_signed_in/.test(m) ? "Please sign in again." : /off/.test(m) ? "Online interviews aren't available right now. Please try again later." : "Couldn't send. Check your connection and try again."; };
  function ivBox(a) {
    const s = IV.by[a.id]; if (!s || !isOpen(a)) return ""; const id = esc(a.id);
    if (s.status === "INVITED") return `<section class="ivx stack" style="gap:10px"><h3>Online interview</h3><p class="sub" style="color:var(--ink)">You're invited to a short first-round interview. An AI interviewer asks you ${s.n} questions about your work in a chat, and you answer by typing or speaking, in English or Filipino. It takes about 15 to 20 minutes, any time${s.until ? ` until ${esc(fmtDate(s.until))}` : ""}. A person in HR reads every interview and makes the decision.</p>
      <label class="consent"><input type="checkbox" id="ivc-${id}"><span>I agree that my answers are recorded and reviewed by an AI tool and by GD Prime HR to assess my application, as the <button class="btn link" data-notice>Privacy Notice</button> explains.</span></label>
      <div class="row"><button class="btn gold" data-iv-start="${id}">Start the interview</button><button class="btn sm" data-iv-decline="${id}">I prefer an interview with a person</button></div></section>`;
    if (s.status === "STARTED") return `<section class="ivx stack" style="gap:10px"><h3>Online interview</h3><p class="sub" style="color:var(--ink)">You're on question ${Math.min(s.qi + 1, s.n)} of ${s.n}. Your answers so far are saved${s.until ? `. Please finish by ${esc(fmtDate(s.until))}` : ""}.</p><div class="row"><button class="btn gold" data-iv-open="${id}">Continue the interview</button></div></section>`;
    const txt = { DONE: "Thank you! You finished your online interview. HR will review it and update you here and by email.", DECLINED: "You asked for an interview with a person. HR will contact you.", EXPIRED: "The time for your online interview has passed. HR may still contact you." }[s.status];
    return txt ? `<div class="iv"><span style="font-size:24px" aria-hidden="true">💬</span><span><b>Online interview</b>${esc(txt)}${s.status === "DONE" ? ` <button class="btn link" data-iv-open="${id}">See my answers</button>` : ""}</span></div>` : "";
  }
  function ivView() {
    const s = IV.by[view.id]; const back = `<button class="back" data-go="mine">← My applications</button>`;
    if (!s) return `<main style="margin-top:24px"><div class="stack">${back}<div class="card empty">${apps === null ? "Loading…" : "This online interview isn't open."}</div></div></main>`;
    const live = s.status === "STARTED"; const pct = Math.round((100 * (s.status === "DONE" ? s.n : s.qi)) / Math.max(1, s.n));
    return `<main style="margin-top:24px"><div class="stack" style="max-width:760px;margin:0 auto">${back}<article class="card stack"><div><h1 style="font-size:28px">Online interview</h1><p class="sub">${esc(s.job || "")}${live ? ` · Question ${Math.min(s.qi + 1, s.n)} of ${s.n}` : s.status === "DONE" ? " · Finished" : ""}</p></div>
      <div class="ivbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Interview progress"><span style="width:${pct}%"></span></div>
      <ol class="ivchat" aria-live="polite">${s.turns.map((t) => `<li class="${t.role === "me" ? "me" : "ai"}">${esc(t.text)}</li>`).join("")}${IV.busy ? `<li class="ai wait">Reading your answer…</li>` : ""}</ol>
      ${live ? `<form id="iv-f" class="stack" style="gap:8px"><label class="f" for="iv-in">Your answer <small>Type, or press the microphone and speak. You can fix the words before sending.</small></label>
        <textarea class="i" id="iv-in" maxlength="2000" ${IV.busy ? "disabled" : ""}>${esc(IV.draft)}</textarea>
        <div class="row" style="justify-content:space-between">${SR ? `<span class="row" style="gap:8px"><button type="button" class="btn sm mic ${IV.rec ? "on" : ""}" data-iv-mic aria-pressed="${IV.rec ? "true" : "false"}">${IV.rec ? "⏹ Stop" : "🎤 Speak"}</button>
          <select class="i" id="iv-lang" style="width:auto;padding:6px 10px" aria-label="Language you speak"><option value="en-PH" ${IV.lang === "en-PH" ? "selected" : ""}>English</option><option value="fil-PH" ${IV.lang === "fil-PH" ? "selected" : ""}>Filipino</option></select></span>` : "<span></span>"}
          <button class="btn primary" type="submit" ${IV.busy ? "disabled" : ""}>Send answer</button></div></form>
        <p class="sub" style="font-size:13px">The interviewer is an AI. It doesn't decide; HR reads your answers. Please don't share ID numbers or bank details here.</p>`
      : s.status === "DONE" ? `<div class="msg ok">Thank you! HR will review your interview and update you on the careers page and by email.</div>` : ""}</article></div></main>`;
  }
  function ivAfter() { const ol = $(".ivchat"); if (ol) ol.lastElementChild?.scrollIntoView({ block: "nearest" }); if (!IV.busy) $("#iv-in")?.focus(); }
  function micStop() { try { IV.rec?.stop(); } catch {} IV.rec = null; }
  function micStart() {
    const r = new SR(); r.lang = IV.lang; r.continuous = true; r.interimResults = true; let base = $("#iv-in")?.value || "";
    r.onresult = (ev) => { let fin = "", tmp = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) (ev.results[i].isFinal ? (fin += ev.results[i][0].transcript) : (tmp += ev.results[i][0].transcript));
      if (fin) base = (base ? base.replace(/\s*$/, " ") : "") + fin.trim(); const el = $("#iv-in"); if (el) { el.value = (base + (tmp ? (base ? " " : "") + tmp : "")).slice(0, 2000); IV.draft = el.value; } };
    r.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast("Allow the microphone for this site to speak your answer, or type it."); };
    r.onend = () => { if (IV.rec === r) { IV.rec = null; render(); } };
    try { r.start(); IV.rec = r; } catch { toast("The microphone couldn't start. Please type your answer."); }
  }
  document.addEventListener("input", (e) => { if (e.target.id === "iv-in") IV.draft = e.target.value; });
  document.addEventListener("change", (e) => { if (e.target.id === "iv-lang") { IV.lang = e.target.value; if (IV.rec) { micStop(); micStart(); render(); } } });
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-iv-start],[data-iv-open],[data-iv-decline],[data-iv-mic]"); if (!t) return; const d = t.dataset;
    if (d.ivMic !== undefined) { if (IV.rec) micStop(); else micStart(); render(); return; }
    if (d.ivOpen) { go({ v: "iv", id: d.ivOpen }); return; }
    if (d.ivDecline) { if (!await askConfirm("Skip the online interview and ask for an interview with a person instead? HR will contact you.", "Ask for a person")) return;
      t.disabled = true; try { await ivCall({ op: "decline", app: d.ivDecline }); toast("Done. HR will contact you for an interview."); } catch (x) { toast(ivErr(x)); } await loadIv(); render(); return; }
    if (d.ivStart) { if (!$(`#ivc-${CSS.escape(d.ivStart)}`)?.checked) { toast("Please tick the box to agree first."); $(`#ivc-${CSS.escape(d.ivStart)}`)?.closest(".consent")?.classList.add("bad"); return; }
      t.disabled = true; toast("Getting your questions ready…");
      try { const r = await ivCall({ op: "start", app: d.ivStart, consent: true }); IV.by[d.ivStart] = r; IV.draft = ""; $(".toast")?.remove(); go({ v: "iv", id: d.ivStart }); ivAfter(); }
      catch (x) { t.disabled = false; toast(ivErr(x)); await loadIv(); render(); } }
  });
  // Runs before the page's own submit handler (capture), so the interview form never reaches it.
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "iv-f") return; e.preventDefault(); e.stopPropagation(); if (IV.busy) return;
    const id = view.id, s = IV.by[id]; const text = ($("#iv-in")?.value || "").trim(); if (!s || !text) { toast("Type or speak your answer first."); return; }
    micStop(); IV.busy = true; IV.draft = text; s.turns = [...s.turns, { role: "me", text }]; render(); ivAfter();
    try { const r = await ivCall({ op: "answer", app: id, text, n: s.turns.length - 1 }); IV.by[id] = r; IV.draft = ""; }
    catch (x) { s.turns = s.turns.slice(0, -1); const dt = x.data; if (dt?.turns) { const { error, ...rest } = dt; IV.by[id] = rest; } toast(ivErr(x)); if (/expired|not_invited|already_done|closed/.test(x.message)) await loadIv(); }
    finally { IV.busy = false; render(); ivAfter(); }
  }, true);
  document.addEventListener("keydown", (e) => { if (e.target.id === "iv-in" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.form?.requestSubmit(); } });

  /* ---------- start ---------- */
  async function signedIn(s) {
    session = s; await sb.rpc("hr_portal_link").catch(() => {}); await loadApps();
    const p = pending.get();
    if (view.v === "auth" || (view.v === "mine")) { if (p?.job && jobOf(p.job) && !appFor(p.job)) { view = { v: "apply", id: p.job }; setUrl(`?job=${encodeURIComponent(p.job)}`); } else view = { v: "mine" }; }
    else if (view.v === "job" && p?.job === view.id && jobOf(view.id) && !appFor(view.id)) view = { v: "apply", id: view.id };
    render();
  }
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "PASSWORD_RECOVERY") { session = s; view = { v: "auth", mode: "newpw" }; render(); return; }
    if (ev === "SIGNED_OUT") { session = null; apps = null; render(); return; }
    if (s && (!session || s.user.id !== session.user.id)) setTimeout(() => signedIn(s), 0); else if (s) session = s;
  });
  (async () => {
    render(); await loadCfg();
    const { data } = await sb.auth.getSession(); if (data.session && !session) { await signedIn(data.session); return; }
    if (view.v === "mine" && !session) view = { v: "auth", mode: "in" };
    render();
  })();
})();
