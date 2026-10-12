const { chromium } = require(process.env.PLAYWRIGHT || 'playwright'); const fs = require('fs');
const W = __dirname, S = process.env.HR_TEST_DATA || W;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const errs = [];
  const fake = fs.readFileSync(W + '/fake-sb.js', 'utf8');
  const mk = async (D, U, extra = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Manila' }); await ctx.route(/cdnjs|jsdelivr|google/, (r) => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.addInitScript(`window.__D=${JSON.stringify(D)};window.__U=${JSON.stringify(U)};window.__LOGIN=${JSON.stringify(extra.login || {})};window.__PEOPLE=${JSON.stringify(extra.people || [])};window.__SIGNUPS=${JSON.stringify(extra.signups || [])};localStorage.setItem('hr-lang','en');`);
    await p.addInitScript(fake);
    await p.goto('file://' + W + '/../public/index.html'); await p.waitForTimeout(4000); return p;
  };
  const D = JSON.parse(fs.readFileSync(S + '/mockdata6.json', 'utf8'));
  // 1. Signed out: gate, then sign in as owner.
  let p = await mk(D, null, { login: { 'glennrdizo@gmail.com': { id: 'u-glenn', name: 'Glenn Dizo', editor: true } } });
  console.log('gate shown:', await p.locator('.sb-gate').count(), await p.locator('.sb-card .sub').textContent());
  await p.screenshot({ path: W + '/t-gate.png' });
  await p.fill('#sb-email', 'nobody@x.com'); await p.fill('#sb-pw', 'password1'); await p.click('.sb-card button.go'); await p.waitForTimeout(300);
  console.log('no consent msg:', await p.locator('.sb-msg').textContent());
  await p.click('.sb-dpa a'); await p.waitForTimeout(300); console.log('notice open:', await p.locator('.sb-pn h2').textContent()); await p.screenshot({ path: W + '/t-notice.png' }); await p.click('[data-sb-pn-close]');
  await p.check('#sb-dpa'); await p.click('.sb-card button.go'); await p.waitForTimeout(400);
  console.log('bad login msg:', await p.locator('.sb-msg').textContent());
  await p.fill('#sb-email', 'glennrdizo@gmail.com'); await p.fill('#sb-pw', 'password1'); await p.check('#sb-dpa'); await p.click('.sb-card button.go'); await p.waitForTimeout(5000);
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
  console.log('consent gate for saved session:', await p.locator('.sb-card h1').textContent().catch(() => 'none')); await p.screenshot({ path: W + '/t-consent.png' });
  await p.check('#sb-dpa'); await p.click('.sb-card button.go'); await p.waitForTimeout(3000);
  console.log('emp self mode text:', (await p.locator('#main').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
  await p.screenshot({ path: W + '/t-emp.png' });
  await p.fill('input[autocomplete="name"], #sc-name, input[id*=name]', 'Rafael Aguilar').catch(()=>{}); const no = await p.locator('#main input').first(); await no.fill('EMP-0157'); await p.locator('#main button', { hasText: 'Link my account' }).click(); await p.waitForTimeout(1500);
  console.log('after link:', (await p.locator('#main').innerText()).slice(0, 200).replace(/\n+/g, ' | '));
  console.log('emp writes', JSON.stringify(await p.evaluate(() => window.__writes)));
  // 3. New account: must verify identity, then waits for HR.
  p = await mk(D, { id: 'u-new', email: 'new@x.com', name: 'Juan Cruz', editor: false, access: 'none', dpa: '2026-10-12' });
  await p.setViewportSize({ width: 390, height: 860 }); await p.waitForTimeout(300);
  console.log('new acct gate:', await p.locator('.sb-card h1').textContent().catch(() => 'none'), '| main visible:', await p.locator('.sb-gate').count());
  await p.screenshot({ path: W + '/t-verify.png', fullPage: true });
  await p.fill('#sb-vno', 'EMP-0157'); await p.fill('#sb-vpos', 'Security Guard, Riverside'); await p.fill('#sb-vmob', '0917 123 4567'); await p.click('.sb-card button.go'); await p.waitForTimeout(500);
  console.log('after request:', await p.locator('.sb-card h1').textContent(), '|', (await p.locator('.sb-wait').innerText()).replace(/\n+/g, ' '));
  await p.screenshot({ path: W + '/t-wait.png', fullPage: true });
  await p.click('.sb-card button.go'); await p.waitForTimeout(800); console.log('check again:', await p.locator('.sb-msg').textContent());
  const req = await p.evaluate(() => window.__writes.find((w) => w[0] === 'request')); console.log('request sent:', JSON.stringify(req));
  // 4. HR sees the request on the dashboard and in Users & permissions, and approves it.
  const emp = Object.values(D).find((x) => x && x.no === 'EMP-0157');
  p = await mk(D, { id: 'u-glenn', email: 'glennrdizo@gmail.com', name: 'Glenn Dizo', editor: true, owner: true, dpa: '2026-10-12' }, { signups: [{ user_id: 'u-new', status: 'pending', name: emp ? `${emp.first} ${emp.last}` : 'Juan Cruz', email: 'new@x.com', emp_no: 'EMP-0157', position: 'Guard', mobile: '0917 123 4567', requested_at: new Date().toISOString() }, { user_id: 'u-x', status: 'pending', name: 'Someone Else', email: 'x@x.com', emp_no: 'EMP-9999', position: 'Guard', mobile: '0918', requested_at: new Date().toISOString() }] });
  await p.waitForTimeout(1500); console.log('dash alert:', await p.locator('.su-alert').innerText().catch(() => 'none'));
  await p.evaluate(() => document.querySelector('#nav [data-go="perms"]')?.click()); await p.waitForTimeout(1200);
  console.log('requests card:', (await p.locator('#su-card').innerText().catch(() => 'none')).replace(/\n+/g, ' | ').slice(0, 400));
  await p.locator('#su-card').screenshot({ path: W + '/t-requests.png' });
  await p.click('[data-su-ok="u-new"]'); await p.waitForTimeout(300); await p.click('[data-ac="1"]'); await p.waitForTimeout(800);
  console.log('decide:', JSON.stringify(await p.evaluate(() => window.__writes.filter((w) => w[0] === 'decide'))), '| waiting now:', await p.locator('#su-card .chip.c-warn').first().textContent().catch(() => 'none'));
  console.log('ERRORS', errs);
  await b.close();
})();
