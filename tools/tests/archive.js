const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await page.goto(process.argv[2] + '?demo=1'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); }); await page.reload();
  await page.fill('#login-email', 'it@paradisecoveresortfiji.com'); await page.fill('#login-password', '21slands'); await page.click('#login-form button[type=submit]');
  await page.waitForFunction(() => state.user); await page.waitForTimeout(800); await page.evaluate(() => { try{closeModal()}catch(e){} });
  // add 3 old demo rows so there is something to archive
  await page.evaluate(() => { const db = loadDemo(); db.dinnerOrders.push({ id:'old1', userEmail:'x@y', serviceDate:'2026-06-01', mealChoice:'Standard', status:'confirmed' }, { id:'old2', userEmail:'x@y', serviceDate:'2026-05-01', mealChoice:'Standard', status:'confirmed' }); db.boatRuns.push({ id:'oldrun', date:'2026-06-10', time:'05:00', from:'Soso', to:'PC', capacity:20 }); saveDemo(db); });
  await page.evaluate(() => { state.adminTab = 'features'; navigate('admin'); }); await page.waitForTimeout(1200);
  if (!(await page.locator('#arch-dry').count())) { const t = page.locator('button:has-text("Settings")'); if (await t.count()) await t.first().click(); await page.waitForTimeout(800); }
  await page.click('#arch-dry'); await page.waitForTimeout(800);
  console.log('dry run:', (await page.locator('#arch-out').innerText()).replace(/\n/g, ' | '));
  const before = await page.evaluate(() => loadDemo().dinnerOrders.length);
  await page.click('#arch-run'); await page.waitForTimeout(400);
  console.log('confirm disabled before tick:', await page.locator('#arch-go').isDisabled());
  await page.check('#arch-ok'); await page.click('#arch-go'); await page.waitForTimeout(500);
  // 3.0: the real move asks for the admin password (wrong one first)
  await page.waitForSelector('#pass-ov-input', { state: 'visible' });
  await page.fill('#pass-ov-input', '2025'); await page.click('#pass-ov-ok'); await page.waitForTimeout(400);
  console.log('2025 rejected:', await page.locator('#pass-ov-err').isVisible());
  await page.fill('#pass-ov-input', '2026'); await page.click('#pass-ov-ok'); await page.waitForTimeout(900);
  console.log('result:', (await page.locator('#arch-out').innerText()).replace(/\n/g, ' | '));
  const after = await page.evaluate(() => { const d = loadDemo(); return { dinner: d.dinnerOrders.length, arch: Object.fromEntries(Object.entries(d.archive||{}).map(([k,v]) => [k, v.length])) }; });
  console.log('dinner rows', before, '->', after.dinner, 'archive', JSON.stringify(after.arch));
  await page.screenshot({ path: '/tmp/pcr-tests/out/archive-card.png', fullPage: true });
  console.log('errors', errs);
  await b.close();
})();
