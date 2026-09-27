// 2.10.1 LIVE smoke (read-only screens): opens the live site as the superadmin session, Kitchen → Order summaries by date.
// Usage: node tools/tests/live-kitchen-days.js [shotDir]   (only reads; Print/PDF are client-side)
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = 'https://k1rtaaan.github.io/PC-Staff-App-V2/';
const SHOTS = process.argv[2] || '/workspace/hotfix-2101-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const actions = []; page.on('request', r => { const m = r.url().match(/[?&]action=([A-Za-z]+)/); if (m) actions.push(m[1]); });
  await page.goto(BASE + '?nocache=' + Date.now());
  await page.evaluate(() => {
    localStorage.setItem('pcr_v2_session', JSON.stringify({ id: 'sa', email: 'it@paradisecoveresortfiji.com', firstName: 'IT', lastName: 'Admin', department: 'IT', role: 'super_admin', permissions: ['super_admin', 'admin'], active: true, verified: true }));
    localStorage.setItem('pcr_v2_coach_done', '1');
  });
  await page.goto(BASE + '?nocache=' + Date.now());
  await page.waitForTimeout(4000);
  const ver = await page.evaluate(() => typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?');
  check('live site serves 2.10.1', ver === '2.10.1', ver);
  await page.evaluate(() => navigate('kitchen'));
  await page.waitForSelector('#kit-days-card', { state: 'attached', timeout: 90000 });
  await page.waitForSelector('#kit-day-total', { state: 'attached', timeout: 90000 });
  const chips = await page.$$eval('.kit-day-chip', els => els.map(e => ({ d: e.dataset.date, t: e.textContent.trim(), on: e.getAttribute('aria-pressed') })));
  console.log(JSON.stringify(chips));
  check('chips include 26/27/28/29 Sep', ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].every(d => chips.some(c => c.d === d)));
  check('28 Sep (tonight) selected by default', (chips.find(c => c.d === '2026-09-28') || {}).on === 'true');
  const tot = (await page.textContent('#kit-day-total')).trim();
  check('28 Sep dinner total shows real orders (82)', tot === '82', tot);
  await page.evaluate(() => document.querySelector('#kit-days-card').scrollIntoView());
  await page.screenshot({ path: SHOTS + '/live-kitchen-28sep.png' });
  const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 15000 }), page.click('#kit-day-print')]);
  await pop.waitForLoadState();
  const txt = await pop.textContent('body');
  check('Print: Dinner Prep List — 2026-09-28, 82 orders', txt.includes('Dinner Prep List — 2026-09-28') && /Total dinner orders: 82/.test(txt));
  await pop.screenshot({ path: SHOTS + '/live-print-28sep.png', fullPage: false });
  await pop.close();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#kit-day-pdf')]);
  const fn = dl.suggestedFilename(); await dl.saveAs(SHOTS + '/live-' + fn);
  check('Download PDF works (dinner-prep-2026-09-28.pdf)', fn === 'dinner-prep-2026-09-28.pdf' && fs.statSync(SHOTS + '/live-' + fn).size > 20000, fn);
  for (const d of ['2026-09-27', '2026-09-26', '2026-09-29']) {
    await page.click('.kit-day-chip[data-date="' + d + '"]');
    await page.waitForFunction(x => document.querySelector('[data-kit-day="' + x + '"]'), d, { timeout: 90000 });
    const t = (await page.textContent('#kit-day-total')).trim();
    console.log(d, 'total', t);
    check(d + ' loads with a total', /^\d+$/.test(t), t);
    await page.screenshot({ path: SHOTS + '/live-kitchen-' + d + '.png' });
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('actions called:', JSON.stringify([...new Set(actions)]));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
