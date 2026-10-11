/* ---------- post a vacancy to job sites: writes the ad, copies it, opens the site's posting page, records where it went ---------- */
if (!SOURCES.includes("LinkedIn")) SOURCES.splice(SOURCES.indexOf("Indeed") + 1, 0, "LinkedIn");
const JOB_SITES = [
  ["indeed", "Indeed", "Indeed", () => "https://employers.indeed.com/"],
  ["linkedin", "LinkedIn", "LinkedIn", () => "https://www.linkedin.com/talent/post-a-job"],
  ["facebook", "Facebook Page", "Facebook", () => TSET().fbPage || "https://www.facebook.com/"],
  ["jobstreet", "JobStreet", "JobStreet", () => "https://ph.employer.seek.com/"],
  ["website", "Company website", "Company website", () => TSET().careersUrl || ""],
];
if (!SOURCES.includes("Company website")) SOURCES.push("Company website");
/* A job is Published once it has been posted on at least one site; otherwise it is Not yet posted. */
const jobPosted = (j) => JOB_SITES.filter(([k]) => j.posts?.[k]);
function pubChip(j) {
  const on = jobPosted(j); if (!on.length) return '<span class="chip c-gray" title="Not posted on any job site or the company website yet">Not yet posted</span>';
  return `<span class="chip c-ok" title="Posted on ${esc(on.map((s) => s[1]).join(", "))}">Published</span><div class="t-muted" style="font-size:12px;margin-top:2px">${esc(on.map((s) => s[2]).join(", "))}</div>`;
}
function jobAd(j) {
  const T = TSET(); const p = S.projects.get(j.projectId); const co = S.org?.companyName || "Our company";
  const where = p ? `${p.name}${p.location ? `, ${p.location}` : ""}` : T.hoAddress || "our Head Office";
  const n = Math.max(1, (j.slots || 1) - jobHired(j));
  return [`WE'RE HIRING: ${j.title.toUpperCase()}`, "",
    `${co} is looking for ${n === 1 ? "a" : n} ${j.title}${n === 1 ? "" : "s"} for ${where}.`, "",
    `Employment: ${STATUS[j.empType]?.[0] || "Full-time"}`, j.rate ? `Pay: ${payLabel(j.rate, j.payType)}` : "Pay: Competitive, based on experience", `Location: ${p?.location || T.hoAddress || "Head Office"}`, "",
    ...(j.desc ? ["Qualifications and duties:", j.desc, ""] : []),
    "How to apply:", T.applyHow || "Send your resume through this post or message us. Include your full name, mobile number and the position you are applying for.", "",
    `#hiring #jobs #${(j.title || "").replace(/[^A-Za-z0-9]/g, "")}${p?.location ? " #" + p.location.split(",").pop().replace(/[^A-Za-z]/g, "") : ""}`].join("\n");
}
function postCard(j) {
  const T = TSET(); const posts = j.posts || {}; const apps = listOf(S.apps).filter((a) => a.jobId === j.id);
  const bySrc = [...new Set(apps.map((a) => a.source || "Not recorded"))].map((s) => [s, apps.filter((a) => (a.source || "Not recorded") === s).length, apps.filter((a) => (a.source || "Not recorded") === s && a.stage === "HIRED").length]).sort((a, b) => b[1] - a[1]);
  return `<div class="two">
    <section class="card"><div class="card-head"><h2>Post this job</h2><span style="margin-right:auto;margin-left:10px">${pubChip(j).replace(/<div[^]*$/, "")}</span>${S.canEdit ? `<button class="link" data-jp-reset="${j.id}">Rewrite the ad</button>` : ""}</div>
      <p class="t-muted" style="margin:0 0 10px;font-size:14px">Edit the ad if you like. Each button copies it and opens that site's posting page, where you paste it.</p>
      <textarea class="input" id="jp-text" rows="14" style="width:100%;font-size:14px;line-height:1.5" aria-label="Job ad">${esc(S.jpDraft?.id === j.id ? S.jpDraft.text : jobAd(j))}</textarea>
      <div class="jp-photo">${j.photo ? `<img src="/_blob/${esc(j.photo.id)}" alt="Photo for the ${esc(j.title)} ad">
        <div class="jp-photo-acts"><b style="font-size:14px">${esc(j.photo.name || "Job photo")}</b><span class="t-muted" style="font-size:13px">Add this photo to your post on each site.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-jp-photo="dl">${icon("download", 16)}Download photo</button><button class="btn btn-ghost btn-sm" data-jp-photo="copy">${icon("file", 16)}Copy photo</button>
          ${S.canEdit && S.assets ? `<label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon("camera", 16)}Change<input type="file" id="jp-photo" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><button class="btn btn-danger btn-sm" data-jp-photo="del">Remove</button>` : ""}</div></div>`
        : S.canEdit && S.assets ? `<label class="io-drop jp-drop" id="jp-photo-drop" tabindex="0">${icon("camera", 26)}<b>Add photo</b><span class="t-muted">A hiring poster or a picture of the site or team. Drag it here or click to choose (JPG, PNG, WebP, up to 20 MB).</span><input type="file" id="jp-photo" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>`
        : '<p class="t-muted" style="margin:0;font-size:13px">No photo for this ad.</p>'}</div>
      <div class="jp-sites">${JOB_SITES.map(([k, l, , url]) => `<div class="jp-site"><a class="btn btn-primary btn-sm" href="${esc(url())}" target="_blank" rel="noopener" data-jp-post="${j.id}|${k}">${icon("door", 16)}Post on ${esc(l)}</a>
        ${posts[k] ? `<span class="chip c-ok">Published ${esc(fmtDate(posts[k]))}</span>${j.postLinks?.[k] ? `<a class="link" style="font-size:13px" href="${esc(j.postLinks[k])}" target="_blank" rel="noopener">View post</a>` : ""}${S.canEdit && S.jpLinkEdit === `${j.id}|${k}` ? `<form class="jp-link-form" data-jp-linkform="${j.id}|${k}" data-keep style="display:flex;gap:6px;flex:1 1 260px"><input class="input" type="url" name="u" value="${esc(j.postLinks?.[k] || "")}" placeholder="Paste the link to the ${esc(l)} post" aria-label="Link to the ${esc(l)} post" style="flex:1;min-width:0;padding:6px 10px;font-size:14px"><button class="btn btn-ghost btn-sm">Save</button></form>` : ""}${S.canEdit ? `<button class="link" style="font-size:13px" data-jp-link="${j.id}|${k}">${j.postLinks?.[k] ? "Change link" : "Add link to post"}</button><button class="link" style="font-size:13px" data-jp-clear="${j.id}|${k}">Clear</button>` : ""}` : '<span class="t-muted" style="font-size:13px">Not yet posted</span>'}</div>`).join("")}
        <div class="jp-site"><button class="btn btn-ghost btn-sm" data-jp-copy="1">${icon("file", 16)}Copy ad only</button></div></div>
      ${S.canEdit ? `<form id="jp-set" class="form-grid" style="margin-top:14px;align-items:end" data-keep>
        <div class="field"><label for="jp-how">How to apply (used in every ad)</label><input class="input" id="jp-how" value="${esc(T.applyHow || "")}" placeholder="Email your resume to hr@company.ph or message our Page"></div>
        <div class="field"><label for="jp-web">Company website careers page</label><input class="input" id="jp-web" type="url" value="${esc(T.careersUrl || "")}" placeholder="https://www.yourcompany.com/careers"></div>
        <div class="field"><label for="jp-fb">Your Facebook Page link</label><input class="input" id="jp-fb" type="url" value="${esc(T.fbPage || "")}" placeholder="https://www.facebook.com/yourcompany"></div>
        <div><button class="btn btn-ghost btn-sm">Save</button></div></form>` : ""}
    </section>
    <section class="card"><div class="card-head"><h2>Where applicants came from</h2></div>
      ${bySrc.length ? `<div class="table-wrap"><table><thead><tr><th>Source</th><th class="num">Applicants</th><th class="num">Hired</th></tr></thead><tbody>${bySrc.map(([s, n, h]) => `<tr><td><b>${esc(s)}</b></td><td class="num">${n}</td><td class="num">${h}</td></tr>`).join("")}</tbody></table></div>` : '<p class="t-muted" style="margin:0">No applicants yet. Set the Source when you add an applicant to see which site works best.</p>'}
    </section></div>`;
}
{ const base = VIEWS.job; VIEWS.job = () => { const j = S.jobs.get(S.view.id); const html = base(); return j ? html + postCard(j) : html; }; }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = $("#jp-text"); if (!ta) return false; ta.focus(); ta.select(); try { return document.execCommand("copy"); } catch { return false; }
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-jp-post],[data-jp-copy],[data-jp-clear],[data-jp-reset],[data-jp-link]"); if (!t) return; ev.stopImmediatePropagation();
  if (t.dataset.jpPost?.endsWith("|website") && !TSET().careersUrl) { ev.preventDefault(); toast(S.canEdit ? "Add your company website's careers page link below, then try again." : "The company website link isn't set yet."); $("#jp-web")?.focus(); return; }
  if (t.dataset.jpLink) { S.jpLinkEdit = S.jpLinkEdit === t.dataset.jpLink ? null : t.dataset.jpLink; render(); $(`[data-jp-linkform="${t.dataset.jpLink}"] input`)?.focus(); return; }
  const text = $("#jp-text")?.value || "";
  if (t.dataset.jpCopy) { toast((await copyText(text)) ? "Ad copied." : "Select the ad and copy it."); return; }
  if (t.dataset.jpReset) { S.jpDraft = null; const j = S.jobs.get(t.dataset.jpReset); const ta = $("#jp-text"); if (ta && j) ta.value = jobAd(j); return; }
  const [id, k] = (t.dataset.jpPost || t.dataset.jpClear).split("|"); const j = S.jobs.get(id); if (!j) return; const site = JOB_SITES.find((s) => s[0] === k);
  if (t.dataset.jpPost) {
    S.jpDraft = { id, text }; const ok = await copyText(text);
    toast((ok ? `Ad copied. Paste it on ${site[1]}.` : `Copy the ad, then paste it on ${site[1]}.`) + (j.photo ? " Download the photo to add it to the post." : ""));
    if (S.canEdit && j.posts?.[k] !== todayISO()) { try { await put("jobs", { ...j, posts: { ...(j.posts || {}), [k]: todayISO() } }); logActivity(`Posted ${j.title} on ${site[1]}`); render(); } catch {} }
    return;
  }
  if (t.dataset.jpClear && S.canEdit) { const posts = { ...(j.posts || {}) }; delete posts[k]; const postLinks = { ...(j.postLinks || {}) }; delete postLinks[k]; await put("jobs", { ...j, posts, postLinks }); render(); }
}, true);
document.addEventListener("input", (ev) => { if (ev.target.id === "jp-text") { const id = S.view.id; S.jpDraft = { id, text: ev.target.value }; } });
document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest?.("[data-jp-linkform]"); if (!f) return; ev.preventDefault(); ev.stopImmediatePropagation();
  const [id, k] = f.dataset.jpLinkform.split("|"); const j = S.jobs.get(id); if (!j || !S.canEdit) return; const site = JOB_SITES.find((s) => s[0] === k); const u = f.u.value.trim();
  if (u && !/^https?:\/\/\S+$/i.test(u)) { toast("That doesn't look like a web link. It should start with https://"); return; }
  const postLinks = { ...(j.postLinks || {}) }; if (u) postLinks[k] = u; else delete postLinks[k];
  try { await put("jobs", { ...j, postLinks }); S.jpLinkEdit = null; logActivity(`${u ? "Saved" : "Removed"} the ${site[1]} post link for ${j.title}`); toast(u ? "Link saved." : "Link removed."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "jp-set") return; ev.preventDefault(); ev.stopImmediatePropagation();
  const fb = $("#jp-fb").value.trim(); if (fb && !/^https:\/\/(www\.|m\.)?(facebook|fb)\.com\//i.test(fb)) { toast("Enter your Page link, like https://www.facebook.com/yourcompany"); return; }
  const web = $("#jp-web").value.trim(); if (web && !/^https?:\/\/\S+\.\S+/i.test(web)) { toast("Enter your website link, like https://www.yourcompany.com/careers"); return; }
  const next = { ...TSET(), applyHow: $("#jp-how").value.trim() || null, fbPage: fb || null, careersUrl: web || null };
  try { await S.db.doc("org/talent").set(JSON.parse(JSON.stringify(next))); S.talent = next; S.jpDraft = null; logActivity("Updated the job ad settings"); toast("Saved."); render(); } catch { toast("Couldn't save. Try again."); }
}, true);

/* Job ad photo: stored as an asset; it can be downloaded or copied to paste into each site's post. */
async function jobPhotoBlob(j) { const r = await fetch("/_blob/" + j.photo.id); if (!r.ok) throw new Error("fetch"); return r.blob(); }
async function setJobPhoto(file) {
  const j = S.jobs.get(S.view.id); if (!j || !file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast("Use a JPG, PNG, WebP or GIF picture."); return; }
  if (file.size > 20 * 1048576) { toast("That picture is over 20 MB."); return; }
  toast("Uploading the photo…");
  try { const up = await S.assets.upload(file); const old = j.photo; await put("jobs", { ...j, photo: { id: up.id, name: file.name.slice(0, 120) } }); if (old) { try { await S.assets.delete(old.id); } catch {} } logActivity(`Added a photo to the ${j.title} job ad`); toast("Photo added."); render(); }
  catch (x) { toast(x?.code === "unsupported_type" ? "That picture type isn't supported." : "Couldn't upload the photo. Try again."); }
}
document.addEventListener("change", (ev) => { if (ev.target.id === "jp-photo" && ev.target.files?.[0]) setJobPhoto(ev.target.files[0]); });
document.addEventListener("drop", (ev) => { const z = ev.target.closest?.("#jp-photo-drop"); if (!z) return; ev.preventDefault(); z.classList.remove("drag"); const f = ev.dataTransfer?.files?.[0]; if (f) setJobPhoto(f); });
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-jp-photo]"); if (!t) return; ev.stopImmediatePropagation(); const j = S.jobs.get(S.view.id); if (!j?.photo) return; const a = t.dataset.jpPhoto;
  if (a === "del") { if (!armed(t)) return; const old = j.photo; await put("jobs", { ...j, photo: null }); try { await S.assets?.delete(old.id); } catch {} logActivity(`Removed the photo from the ${j.title} job ad`); render(); return; }
  try {
    const blob = await jobPhotoBlob(j);
    if (a === "dl") { const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg"); const base = (j.photo.name || "job-photo").replace(/\.[^.]+$/, ""); await saveBlob(`${slug(base)}.${ext}`, blob); return; }
    if (a === "copy") {
      let png = blob; if (blob.type !== "image/png") { const bmp = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); png = await new Promise((ok) => c.toBlob(ok, "image/png")); }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); toast("Photo copied. Paste it into your post.");
    }
  } catch { toast(a === "copy" ? "This browser can't copy pictures. Use Download photo instead." : "Couldn't get the photo. Try again."); }
}, true);
