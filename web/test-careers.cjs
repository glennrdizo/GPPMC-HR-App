// Careers page and applicant portal test, against the in-memory Supabase double (fake-sb.js).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright'); const fs = require('fs');
const W = __dirname, S = process.env.HR_TEST_DATA || W;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const errs = [];
  const fake = fs.readFileSync(W + '/fake-sb.js', 'utf8');
  const D = JSON.parse(fs.readFileSync(S + '/mockdata6.json', 'utf8'));
  // Two open jobs that are not sample records, so the careers page lists them.
  for (const k of ['jobs/job-lag-se', 'jobs/job-lag-so']) D[k] = { ...D[k], sample: false };
  const proj = D['jobs/job-lag-se'].projectId; D['projects/' + proj] = { ...(D['projects/' + proj] || {}), name: D['projects/' + proj]?.name || 'Laguna Plant', location: 'Calamba, Laguna' };
  D['org/talent'] = { ...(D['org/talent'] || {}), portalForms: [{ id: 'f1', name: 'Application form', file: 'forms/app.pdf', note: 'Fill in and bring' }] };
  const mk = async (U, url, extra = {}, vp = { width: 1280, height: 900 }) => {
    const ctx = await b.newContext({ viewport: vp, timezoneId: 'Asia/Manila' }); await ctx.route(/cdnjs|jsdelivr|google/, (r) => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.addInitScript(`window.__D=${JSON.stringify(D)};window.__U=${JSON.stringify(U)};window.__LOGIN=${JSON.stringify(extra.login || {})};localStorage.setItem('hr-lang','en');`);
    await p.addInitScript(fake); await p.goto('file://' + W + '/../public/' + url); await p.waitForTimeout(extra.wait || 1500); return p;
  };
  // 1. Visitor from a LinkedIn post: sees the job, is asked to create an account, signs in, applies.
  let p = await mk(null, 'careers.html?job=job-lag-se&src=linkedin', { login: { 'ana@x.com': { id: 'u-ana', name: 'Ana Cruz' } } });
  console.log('job page:', await p.locator('main h1').textContent(), '|', (await p.locator('.meta').first().innerText()).replace(/\n/g, ' '));
  await p.screenshot({ path: W + '/t-c-job.png', fullPage: true });
  await p.click('[data-apply]'); await p.waitForTimeout(300); console.log('apply asks:', await p.locator('#auth h2').textContent());
  await p.fill('#a-name', 'Ana Cruz'); await p.fill('#a-email', 'ana@x.com'); await p.fill('#a-pw', 'password1'); await p.click('#auth button[type=submit]'); await p.waitForTimeout(300);
  console.log('after sign-up:', (await p.locator('#auth').innerText()).replace(/\n+/g, ' ').slice(0, 160));
  console.log('signup call:', JSON.stringify(await p.evaluate(() => window.__writes.find((w) => w[0] === 'signup'))));
  await p.click('[data-auth="in"]'); await p.fill('#a-email', 'ana@x.com'); await p.fill('#a-pw', 'password1'); await p.click('#auth button[type=submit]'); await p.waitForTimeout(800);
  console.log('after sign-in view:', await p.locator('main h2').first().textContent());
  await p.click('#apply button[type=submit]'); await p.waitForTimeout(200); console.log('no consent:', await p.locator('#p-consent-box.bad').count());
  await p.fill('#p-mobile', '0917 123 4567'); await p.fill('#p-notes', '4 years as site engineer'); await p.check('#p-consent'); await p.click('#apply button[type=submit]'); await p.waitForTimeout(300);
  console.log('no resume msg:', await p.locator('.msg.err').textContent());
  await p.setInputFiles('#p-file', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await p.check('#p-consent'); await p.click('#apply button[type=submit]'); await p.waitForTimeout(800);
  console.log('mine:', (await p.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
  const ap = await p.evaluate(() => Object.entries(window.__D).find(([k, v]) => k.startsWith('applicants/') && v.portalUid === 'u-ana'));
  console.log('stored applicant:', ap[0], ap[1].source, ap[1].first, ap[1].last, ap[1].stage, JSON.stringify(ap[1].resume));
  await p.screenshot({ path: W + '/t-c-mine.png', fullPage: true });
  // 2. Later: HR moved Ana to Requirements, scheduled nothing, shared an offer letter. Ana uploads and signs on her phone.
  const aid = ap[0]; D[aid] = { ...ap[1], stage: 'REQUIREMENTS', ivs: [{ id: 'i1', d: '2099-01-05', t: '14:00', kind: 'Final interview', by: 'Secret', notes: 'secret', result: 'PENDING' }], offer: { status: 'SENT', rate: 42000, start: '2026-11-03' }, portal: { ...ap[1].portal, shared: [{ id: 's1', name: 'Job offer letter', file: 'share/u-ana/o.pdf', sign: true, at: '2026-10-14' }], reqs: { nbi: { file: 'apply/u-ana/n.pdf', name: 'nbi.jpg', status: 'REDO', note: 'Photo is blurry', at: '2026-10-14T01:00:00Z' } } } };
  p = await mk({ id: 'u-ana', email: 'ana@x.com', name: 'Ana Cruz' }, 'careers.html?view=mine', {}, { width: 390, height: 860 });
  console.log('phone mine:', (await p.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
  console.log('has secret:', /Secret|secret/.test(await p.locator('main').innerText()));
  await p.screenshot({ path: W + '/t-c-phone.png', fullPage: true });
  await p.setInputFiles('[data-req$=":nbi"]', { name: 'nbi2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg') }); await p.waitForTimeout(600);
  await p.fill('[data-num$=":sss"]', '34-1234567-8'); await p.click('[data-save-num$=":sss"]'); await p.waitForTimeout(600);
  await p.setInputFiles('[data-back$=":s1"]', { name: 'signed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg') }); await p.waitForTimeout(600);
  const after = await p.evaluate((k) => window.__D[k].portal, aid); console.log('portal after:', JSON.stringify({ nbi: after.reqs.nbi.status, sss: after.reqs.sss, back: !!after.back?.s1 }));
  console.log('uploads:', JSON.stringify(await p.evaluate(() => window.__writes.filter((w) => w[0] === 'upload').map((w) => w[1].replace(/[a-z0-9]{10,}/, 'X')))));
  // 3. HR side: the applicant page shows the portal card; HR accepts the NBI, shares a contract; the job ad has the apply link per site.
  D[aid] = { ...(await p.evaluate((k) => window.__D[k], aid)), stage: 'OFFER' };
  p = await mk({ id: 'u-glenn', email: 'glennrdizo@gmail.com', name: 'Glenn Dizo', editor: true, owner: true, dpa: '2026-10-12' }, 'index.html', {}, { width: 1280, height: 900 });
  await p.waitForTimeout(3000);
  await p.evaluate((id) => { const x = document.createElement('button'); x.dataset.app = id; x.id = 'tgo'; document.body.appendChild(x); }, aid.split('/')[1]); await p.click('#tgo'); await p.waitForTimeout(800);
  console.log('portal card:', (await p.locator('#ap-portal').innerText().catch(() => 'none')).replace(/\n+/g, ' | ').slice(0, 500));
  await p.locator('#ap-portal').screenshot({ path: W + '/t-c-hr.png' });
  await p.click('[data-pr-ok$=":nbi"]'); await p.waitForTimeout(500);
  console.log('after accept:', JSON.stringify(await p.evaluate((k) => ({ st: window.__D[k].portal.reqs.nbi.status, tick: window.__D[k].reqs?.nbi }), aid)));
  await p.fill('#pr-sname', 'Employment contract'); await p.setInputFiles('#pr-sfile', { name: 'c.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') }); await p.click('.pr-share button'); await p.waitForTimeout(600);
  console.log('shared:', JSON.stringify(await p.evaluate((k) => window.__D[k].portal.shared.map((s) => [s.name, s.file.replace(/[a-z0-9]{10,}/, 'X'), s.sign]), aid)));
  await p.evaluate(() => { const x = document.createElement('button'); x.dataset.go = 'hiring'; x.id = 'tgo2'; document.body.appendChild(x); }); await p.click('#tgo2'); await p.waitForTimeout(600);
  console.log('careers card:', (await p.locator('#careers-card').innerText().catch(() => 'none')).replace(/\n+/g, ' | ').slice(0, 300));
  await p.evaluate(() => { const x = document.createElement('button'); x.dataset.job = 'job-lag-se'; x.id = 'tgo3'; document.body.appendChild(x); }); await p.click('#tgo3'); await p.waitForTimeout(600);
  console.log('ad line:', (await p.locator('#jp-text').inputValue()).split('\n').find((l) => l.startsWith('Apply online')));
  await p.evaluate(() => { navigator.clipboard.writeText = async () => {}; }); await p.locator('[data-jp-post="job-lag-se|linkedin"]').evaluate((a) => a.removeAttribute('target')).catch(() => {});
  await p.evaluate(() => window.addEventListener('click', (e) => { if (e.target.closest('[data-jp-post]')) e.preventDefault(); }, true)); await p.click('[data-jp-post="job-lag-se|linkedin"]'); await p.waitForTimeout(300);
  console.log('after LinkedIn post:', (await p.locator('#jp-text').inputValue()).split('\n').find((l) => l.startsWith('Apply online')));
  // 4. Hire: documents and numbers go to the 201 file.
  await p.evaluate((id) => document.querySelector('#tgo').dataset.app = id, aid.split('/')[1]); await p.click('#tgo'); await p.waitForTimeout(600);
  await p.fill('#hf-no', 'EMP-9001'); await p.click('#hire-form button.btn-gold'); await p.waitForTimeout(1500);
  const emp = await p.evaluate(() => Object.values(window.__D).find((x) => x && x.no === 'EMP-9001'));
  console.log('hired emp:', emp ? JSON.stringify({ sss: emp.sss, docs: (emp.docs || []).map((d) => d.kind + ':' + d.id.replace(/[a-z0-9]{10,}/, 'X')) }) : 'none');
  console.log('errors:', errs.length, errs.slice(0, 5));
  await b.close();
})();
