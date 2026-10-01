const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/?demo=1'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); }); await page.reload();
  await page.fill('#login-email', 'ana.tui@paradisecoveresortfiji.com'); await page.fill('#login-password', 'staff123'); await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(4000);
  await page.evaluate(() => navigate('more')); await page.waitForTimeout(2000);
  console.log(await page.evaluate(() => document.getElementById('main-content').innerText));
  console.log(await page.evaluate(() => JSON.stringify(navItems())), errs);
  await b.close();
})();
