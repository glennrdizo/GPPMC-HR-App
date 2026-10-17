/* ---------- Clock-in selfie from the live camera (Glenn 2026-10-17) ---------- */
// "Take a selfie" opens the device camera (phone, laptop or desktop webcam) in the page and takes the picture there, so a saved
// photo from the gallery or a file can't be used. Phones whose browser can't show the camera in the page fall back to the phone's
// own camera (the input has capture="user"); a computer without a usable camera gets a message instead of a file picker.
Object.assign(TL, { "Camera": "Camera", "Take photo": "Kunan", "Starting the camera…": "Binubuksan ang camera…", "Switch camera": "Palitan ang camera",
  "Can't open the camera. Allow camera access for this site in your browser, then try again.": "Hindi mabuksan ang camera. Payagan ang camera para sa site na ito sa iyong browser, saka subukan muli.",
  "No camera was found on this device. Use a phone or a computer with a camera.": "Walang camera sa device na ito. Gumamit ng phone o computer na may camera." });
const scT = (s) => (S.lang === "tl" && TL[s]) || s;
const scMobile = () => matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
let scOpen = null;
function scClose() { if (!scOpen) return; scOpen.stream?.getTracks().forEach((t) => t.stop()); scOpen.back.remove(); document.removeEventListener("keydown", scOpen.key, true); try { scOpen.prev?.focus?.(); } catch {} scOpen = null; }
async function scStart(facing) {
  const o = scOpen; if (!o) return; o.stream?.getTracks().forEach((t) => t.stop()); o.msg.textContent = scT("Starting the camera…"); o.shot.disabled = true;
  try {
    o.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    if (scOpen !== o) { o.stream.getTracks().forEach((t) => t.stop()); return; }
    o.facing = facing; o.video.srcObject = o.stream; await o.video.play().catch(() => {}); o.video.style.transform = facing === "user" ? "scaleX(-1)" : "";
    o.msg.textContent = ""; o.shot.disabled = false; o.shot.focus();
    navigator.mediaDevices.enumerateDevices?.().then((ds) => { o.flip.hidden = ds.filter((d) => d.kind === "videoinput").length < 2; }).catch(() => {});
  } catch (err) {
    if (scOpen !== o) return;
    const none = err?.name === "NotFoundError" || err?.name === "OverconstrainedError";
    // A phone browser that can't show the camera in the page still has the phone's own camera.
    if (!none && scMobile() && o.input) { scClose(); o.input.dataset.scNative = "1"; o.input.click(); return; }
    o.msg.textContent = scT(none ? "No camera was found on this device. Use a phone or a computer with a camera." : "Can't open the camera. Allow camera access for this site in your browser, then try again.");
  }
}
function scOpenCam(input) {
  scClose();
  const back = document.createElement("div"); back.className = "ac-back sc-back";
  back.innerHTML = `<div class="ac-box sc-box" role="dialog" aria-modal="true" aria-label="${esc(scT("Camera"))}"><div class="sc-view"><video playsinline muted autoplay></video></div>
    <p class="sc-msg t-muted" aria-live="polite"></p><div class="ac-row sc-row"><button class="btn" data-sc="x">${esc(scT("Cancel"))}</button><button class="btn" data-sc="flip" hidden>${esc(scT("Switch camera"))}</button><button class="btn btn-primary" data-sc="shot" disabled>${icon("camera", 16)} ${esc(scT("Take photo"))}</button></div></div>`;
  document.body.appendChild(back);
  const o = scOpen = { back, input, prev: document.activeElement, video: back.querySelector("video"), msg: back.querySelector(".sc-msg"), shot: back.querySelector('[data-sc="shot"]'), flip: back.querySelector('[data-sc="flip"]'), facing: "user" };
  o.key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); scClose(); } };
  document.addEventListener("keydown", o.key, true);
  back.addEventListener("click", (ev) => { const b = ev.target.closest("[data-sc]"); if (ev.target === back || b?.dataset.sc === "x") return scClose();
    if (b?.dataset.sc === "flip") return scStart(o.facing === "user" ? "environment" : "user");
    if (b?.dataset.sc === "shot") scShot(); });
  scStart("user");
}
function scShot() {
  const o = scOpen; const v = o?.video; if (!v?.videoWidth) return;
  const w = Math.min(v.videoWidth, 1280), h = Math.round(v.videoHeight * (w / v.videoWidth)); const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (o.facing === "user") { g.translate(w, 0); g.scale(-1, 1); } g.drawImage(v, 0, 0, w, h);
  c.toBlob((blob) => { if (!blob) return; const M = o.input?.id === "kc-photo" ? S.kiosk : S.self; if (!M) return scClose();
    const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (M.photoUrl) URL.revokeObjectURL(M.photoUrl); M.photo = file; M.photoUrl = URL.createObjectURL(file); M.live = true; scClose(); render(); }, "image/jpeg", 0.85);
}
// The selfie buttons are labels around a file input: open the live camera instead of the file picker.
window.addEventListener("click", (ev) => {
  const lab = ev.target.closest?.("label"); const input = lab?.querySelector("#kc-photo, #sc-photo") || (ev.target.matches?.("#kc-photo, #sc-photo") ? ev.target : null); if (!input) return;
  if (input.dataset.scNative === "1") { delete input.dataset.scNative; return; }
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (navigator.mediaDevices?.getUserMedia) return scOpenCam(input);
  if (scMobile()) { input.dataset.scNative = "1"; input.click(); return; }
  toast(scT("Can't open the camera. Allow camera access for this site in your browser, then try again."));
}, true);
// A file chosen any other way on a computer is not a live selfie.
window.addEventListener("change", (ev) => { const t = ev.target; if ((t.id === "kc-photo" || t.id === "sc-photo") && !scMobile()) { ev.stopImmediatePropagation(); t.value = ""; } }, true);
{ const st = document.createElement("style"); st.textContent = `.sc-box{max-width:560px;width:100%}.sc-view{background:#0b1222;border-radius:10px;overflow:hidden;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center}
.sc-view video{width:100%;height:100%;object-fit:cover}.sc-msg{min-height:1.2em;margin:10px 0 0;font-size:14px}.sc-row{flex-wrap:wrap}`; document.head.appendChild(st); }
