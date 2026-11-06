// Website only: put the HR website on the phone's home screen like an app (manifest.webmanifest + sw.js).
// The employee home shows an "Install the HR app" card until it is installed or the person hides it.
let pwaPrompt = null;
const pwaInstalled = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch { return false; } };
const pwaHidden = () => { try { return localStorage.getItem("hr_pwa_hide") === "1"; } catch { return false; } };
const pwaIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
window.addEventListener("beforeinstallprompt", (ev) => { ev.preventDefault(); pwaPrompt = ev; try { render(); } catch {} });
window.addEventListener("appinstalled", () => { pwaPrompt = null; try { render(); } catch {} });
function pwaCard() {
  if (pwaInstalled() || pwaHidden()) return "";
  const how = pwaPrompt ? "" : pwaIos()
    ? '<p style="margin:0 0 10px;font-size:14px">In Safari, tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>.</p>'
    : '<p style="margin:0 0 10px;font-size:14px">Open your browser menu (<b>&#8942;</b>) and pick <b>Install app</b> or <b>Add to Home screen</b>.</p>';
  return `<section class="card" id="pwa-card"><div class="card-head"><h2>Put the HR app on your phone</h2></div>
    <p style="margin:0 0 10px;font-size:14px">Add GD Prime HR to your home screen to clock in, ask HR and see your payslips with one tap, like any other app.</p>${how}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${pwaPrompt ? '<button class="btn btn-primary btn-sm" data-pwa-install>Install the HR app</button>' : ""}<button class="btn btn-ghost btn-sm" data-pwa-hide>Not now</button></div></section>`;
}
{ const b = selfHome; selfHome = () => b() + pwaCard(); }
document.addEventListener("click", async (ev) => {
  if (ev.target.closest("[data-pwa-hide]")) { try { localStorage.setItem("hr_pwa_hide", "1"); } catch {} render(); return; }
  if (!ev.target.closest("[data-pwa-install]") || !pwaPrompt) return;
  const p = pwaPrompt; pwaPrompt = null;
  try { await p.prompt(); const r = await p.userChoice; if (r?.outcome !== "accepted") pwaPrompt = null; } catch {}
  render();
});
