const { chromium } = require(process.env.PLAYWRIGHT || 'playwright'); const fs = require('fs');
const W = __dirname, S = process.env.HR_TEST_DATA || W;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const errs = [];
  const fake = fs.readFileSync(W + '/fake-sb.js', 'utf8');
  const mk = async (D, U, extra = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Manila' }); await ctx.route(/cdnjs|jsdelivr|google/, (r) => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.addInitScript(`window.__D=${JSON.stringify(D)};window.__U=${JSON.stringify(U)};window.__LOGIN=${JSON.stringify(extra.login || {})};window.__PEOPLE=${JSON.stringify(extra.people || [])};localStorage.setItem('hr-lang','en');`);
    await p.addInitScript(fake);
    await p.goto('file://' + W + '/../public/index.html'); await p.waitForTimeout(4000); return p;
  };
  const D = JSON.parse(fs.readFileSync(S + '/mockdata6.json', 'utf8'));
  // 1. Signed out: gate, then sign in as owner.
  let p = await mk(D, null, { login: { 'glennrdizo@gmail.com': { id: 'u-glenn', name: 'Glenn Dizo', editor: true } } });
  console.log('gate shown:', await p.locator('.sb-gate').count(), await p.locator('.sb-card .sub').textContent());
  await p.screenshot({ path: W + '/t-gate.png' });
  await p.fill('#sb-email', 'nobody@x.com'); await p.fill('#sb-pw', 'password1'); await p.click('.sb-card button.go'); await p.waitForTimeout(400);
  console.log('bad login msg:', await p.locator('.sb-msg').textContent());
  await p.fill('#sb-email', 'glennrdizo@gmail.com'); await p.fill('#sb-pw', 'password1'); await p.click('.sb-card button.go'); await p.waitForTimeout(5000);
  console.log('gate after:', await p.locator('.sb-gate').count(), 'h1:', await p.locator('#main h1').first().textContent().catch(() => '?'));
  console.log('signout btn:', await p.locator('.sb-out').textContent().catch(() => 'none'));
  await p.screenshot({ path: W + '/t-dash.png' });
  // visit pages
  const views = await p.evaluate(() => [...new Set([...document.querySelectorAll('#nav [data-go]')].map((a) => a.dataset.go))]);
  const t0 = Date.now(); for (const v of views) { await p.evaluate((v) => document.querySelector(`#nav [data-go="${v}"]`)?.click(), v); await p.waitForTimeout(250); }
  console.log('visited', views.length, 'pages in', Date.now() - t0, 'ms; errors so far', errs.length);
  // a write: add a project code/edit org? Use activity log via saving settings: change dash scope not db. Do an employee edit save.
  await p.evaluate(() => document.querySelector('#nav [data-go="perms"]')?.click()); await p.waitForTimeout(500);
  await p.screenshot({ path: W + '/t-perms.png', fullPage: false });
  console.log('perms text has claude.ai:', /claude\.ai/.test(await p.locator('#main').innerText()));
  console.log('writes', JSON.stringify(await p.evaluate(() => window.__writes.slice(0, 10))));
  // 2. Employee (not editor), already signed in: phone clock only.
  p = await mk(D, { id: 'u-emp', email: 'emp@x.com', name: 'Rafael Aguilar', editor: false });
  await p.setViewportSize({ width: 390, height: 860 }); await p.waitForTimeout(500);
  console.log('emp self mode text:', (await p.locator('#main').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
  await p.screenshot({ path: W + '/t-emp.png' });
  await p.fill('input[autocomplete="name"], #sc-name, input[id*=name]', 'Rafael Aguilar').catch(()=>{}); const no = await p.locator('#main input').first(); await no.fill('EMP-0157'); await p.locator('#main button', { hasText: 'Link my account' }).click(); await p.waitForTimeout(1500);
  console.log('after link:', (await p.locator('#main').innerText()).slice(0, 200).replace(/\n+/g, ' | '));
  console.log('emp writes', JSON.stringify(await p.evaluate(() => window.__writes)));
  console.log('ERRORS', errs);
  await b.close();
})();
