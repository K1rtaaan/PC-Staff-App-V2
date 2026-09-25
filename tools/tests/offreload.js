const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
  const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
  const page = await ctx.newPage(); const errs=[]; page.on('pageerror', e=>errs.push(e.message));
  const L = process.argv[2];
  await page.goto(L + '?demo=1'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); }); await page.reload();
  await page.fill('#login-email', 'ana.tui@paradisecoveresortfiji.com'); await page.fill('#login-password', 'staff123'); await page.click('#login-form button[type=submit]');
  await page.waitForFunction(() => state.user); await page.waitForTimeout(6000);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(2500); await page.screenshot({ path:'/tmp/pcr-tests/out/offline-reload-live.png' }); console.log('url', page.url(), 'tab', await page.evaluate(() => state.tab).catch(e=>'ERR '+e.message));
  console.log('onLine', await page.evaluate(() => navigator.onLine), '| status:', await page.locator('#data-status').innerText(), '| home:', await page.evaluate(() => (document.querySelector('#main-content')||{}).innerText?.slice(0,120)));
  await page.evaluate(() => navigate('boat')); await page.waitForTimeout(800);
  console.log('boat status:', await page.locator('#data-status').innerText(), '| runs shown', await page.locator('#main-content button:has-text("Book")').count());
  await page.screenshot({ path:'/tmp/pcr-tests/out/offline-reload-live.png' });
  console.log('errors', errs); await b.close();
})();
