const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  const apiSeen = [];
  ctx.on('request', r => { if (/script\.google/.test(r.url())) apiSeen.push({ url: r.url().slice(0, 80), sw: !!r.serviceWorker() }); });
  await page.goto('http://127.0.0.1:8766/?demo=1');
  await page.evaluate(() => { localStorage.setItem('pcr_v2_coach_done','1'); });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
  const keys = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, entries: (await c.keys()).map(r => r.url.replace(location.origin, '')) }; });
  console.log('caches after first open:', JSON.stringify(keys));
  // simulate a new release
  fs.writeFileSync('/tmp/swtest/sw.js', fs.readFileSync('/tmp/swtest/sw.js', 'utf8').replace("const VERSION = '3.0.0'", "const VERSION = '3.0.0-test2'"));
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await page.waitForSelector('#sw-update:not(.hidden)', { timeout: 20000 }).then(() => console.log('PASS update prompt shown')).catch(() => console.log('FAIL no update prompt'));
  await page.screenshot({ path: '/tmp/pcr-tests/out/sw-update-prompt.png' });
  const nav = page.waitForEvent('load', { timeout: 15000 });
  await page.click('#sw-update'); await nav.catch(() => {});
  await page.waitForTimeout(1500);
  const ks2 = await page.evaluate(() => caches.keys());
  console.log('after tap caches:', JSON.stringify(ks2), (ks2.length === 1 && ks2[0].endsWith('test2')) ? 'PASS new SW active, old cache removed' : 'FAIL');
  // real-mode: API goes to network, not SW
  await page.goto('http://127.0.0.1:8766/'); await page.waitForTimeout(4000);
  console.log('API requests seen:', apiSeen.length, 'handled by SW:', apiSeen.filter(x => x.sw).length);
  const apiCached = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) { const c = await caches.open(k); n += (await c.keys()).filter(r => /script\.google/.test(r.url)).length; } return n; });
  console.log('API responses in SW cache:', apiCached, apiCached === 0 ? 'PASS' : 'FAIL');
  console.log('errors', errs.filter(e => !/script\.google|Failed to load resource|CORS/i.test(e)));
  await b.close();
})();
