/* HRIS audit 2026-10-17 (phones and tablets).
   Privacy screen: when the app is hidden (app switcher, another tab, phone locked) the page is blurred, so the switcher's
   snapshot and a glance at a left-open screen don't show pay or personal details. Screenshots themselves can't be blocked
   from a web page.
   Tablet layout: dialogs scroll and fit the screen (the selfie "Take photo" button stays reachable with the phone sideways),
   the side menu uses the visible screen height on iPad Safari, and touch screens of any width get finger-sized links and
   buttons (before, only screens under 720 px did). */
{ const st = document.createElement("style"); st.textContent = `html.hr-hide #main,html.hr-hide .rail,html.hr-hide .ac-back{filter:blur(18px)}
.ac-back{overflow-y:auto;align-items:flex-start;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom))}
.ac-box{max-height:calc(100dvh - 32px);overflow:auto;margin:auto}
.sc-view{max-height:55dvh}
@supports (height:100dvh){.rail{height:100dvh;max-height:100dvh}}
@media (pointer:coarse){td .link{padding:10px 4px;min-height:44px;display:inline-flex;align-items:center}.btn-sm{min-height:44px}.check input,input[type=checkbox]{width:22px;height:22px}}`;
  document.head.appendChild(st);
  const hide = (on) => document.documentElement.classList.toggle("hr-hide", on);
  document.addEventListener("visibilitychange", () => hide(document.visibilityState === "hidden"));
  window.addEventListener("pagehide", () => hide(true)); window.addEventListener("pageshow", () => hide(false)); }
