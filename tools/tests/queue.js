const { chromium } = require('playwright-core');
const BASE = process.argv[2]; const TAG = process.argv[3] || 'local';
const results = []; const errors = [];
function check(n, c, x) { results.push({ n, ok: !!c }); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); }
const ANA = ['ana.tui@paradisecoveresortfiji.com', 'staff123'];
async function login(page, email, pw) {
  await page.evaluate(() => { try { doLogout(); } catch (e) {} });
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', email); await page.fill('#login-password', pw);
  await page.click('#login-form button[type=submit]');
  await page.waitForFunction(() => state.user && state.user.email, null, { timeout: 15000 });
  await page.waitForTimeout(800); await page.evaluate(() => { try { closeModal(); } catch (e) {} });
}
const dinnerCount = (page) => page.evaluate(() => { const db = loadDemo(); const sd = dinnerCutoffInfo().serviceDate;
  return db.dinnerOrders.filter(o => o.userEmail === state.user.email && o.serviceDate === sd && o.status !== 'cancelled').length; });
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-09-24T22:00:00Z') }); // 10:00 Fiji
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); });
  await page.reload({ waitUntil: 'load' });
  await login(page, ...ANA);
  // cancel any existing dinner so we start from zero
  await page.evaluate(async () => { const db = loadDemo(); const sd = dinnerCutoffInfo().serviceDate; db.dinnerOrders = db.dinnerOrders.filter(o => !(o.userEmail === state.user.email && o.serviceDate === sd)); saveDemo(db); cacheInvalidateMealBoat(); });
  await page.evaluate(() => navigate('dinner')); await page.waitForSelector('#btn-dinner'); await page.waitForTimeout(500);
  check('start: 0 dinner orders', (await dinnerCount(page)) === 0);
  // ---- offline: book dinner
  await ctx.setOffline(true); await page.waitForTimeout(300);
  await page.selectOption('#dinner-choice', { index: 0 });
  await page.click('#btn-dinner'); await page.waitForTimeout(800);
  const qlen = await page.evaluate(() => queueItems().length);
  check('offline: order saved to queue', qlen === 1, 'queue=' + qlen);
  check('offline: nothing reached the (demo) server', (await dinnerCount(page)) === 0);
  check('dinner tab shows "Waiting to send"', await page.locator('#main-content >> text=Waiting to send').count() > 0);
  const status = await page.locator('#data-status').innerText().catch(() => '');
  check('status line says offline', /offline/i.test(status), status.replace(/\s+/g, ' '));
  await page.evaluate(() => navigate('myorders')); await page.waitForTimeout(900);
  check('My Orders shows "Waiting to send"', await page.locator('#main-content >> text=Waiting to send').count() > 0);
  await page.screenshot({ path: '/tmp/pcr-tests/out/queue-' + TAG + '-myorders-offline.png', fullPage: true });
  const side1 = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check('My Orders offline: no sideways scroll', side1);
  const crid = await page.evaluate(() => queueItems()[0].id);
  // ---- back online → auto send (online event)
  await ctx.setOffline(false);
  await page.waitForFunction(() => queueItems().length === 0, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  check('online: queue drained automatically', (await page.evaluate(() => queueItems().length)) === 0);
  check('online: exactly ONE dinner order created', (await dinnerCount(page)) === 1, 'count=' + (await dinnerCount(page)));
  // ---- re-send the same request id (simulates a retry after a lost response) → no duplicate
  const dup = await page.evaluate(async (id) => api('placeDinnerOrder', { mealChoice: 'Standard', clientRequestId: id, queuedFor: dinnerCutoffInfo().serviceDate }), crid);
  check('re-send same clientRequestId returns duplicate:true', dup && dup.success && dup.duplicate === true, JSON.stringify({ s: dup.success, d: dup.duplicate }));
  // force flush with a copy of the item still in queue (as if the tab crashed before removing it)
  await page.evaluate((id) => { localStorage.setItem(queueKey(), JSON.stringify([{ id, action: 'placeDinnerOrder', payload: { mealChoice: 'Standard', clientRequestId: id }, kind: 'dinner', label: 'Dinner retry', serviceDate: dinnerCutoffInfo().serviceDate, createdAt: Date.now(), state: 'waiting' }])); }, crid);
  await page.evaluate(() => flushQueue('test')); await page.waitForTimeout(600);
  check('still exactly ONE dinner order after re-flush', (await dinnerCount(page)) === 1);
  // ---- cutoff passed at arrival
  await page.evaluate(() => { localStorage.setItem(queueKey(), JSON.stringify([{ id: newRequestId(), action: 'placeLunchOrder', payload: { status: 'in' }, kind: 'lunch', label: 'Lunch — in (2026-09-20)', serviceDate: '2026-09-20', createdAt: Date.now() - 86400000 * 5, state: 'waiting' }])); });
  await page.evaluate(() => flushQueue('test')); await page.waitForTimeout(600);
  const f = await page.evaluate(() => queueFailed());
  check('late queued order → failed with cutoffPassed', f.length === 1 && f[0].cutoffPassed === true, JSON.stringify(f.map(x => x.error)));
  await page.evaluate(() => navigate('myorders')); await page.waitForTimeout(700);
  check('My Orders shows "Didn\'t go through — cutoff passed"', await page.locator('#main-content >> text=cutoff passed').count() > 0);
  await page.screenshot({ path: '/tmp/pcr-tests/out/queue-' + TAG + '-cutoff.png', fullPage: true });
  // ---- boat booking offline
  await page.evaluate(() => { localStorage.setItem(queueKey(), '[]'); navigate('boat'); }); await page.waitForTimeout(1200);
  const hasBook = await page.locator('.boat-book, [data-book-run], button:has-text("Book seat"), button:has-text("Book")').count();
  console.log('boat book buttons:', hasBook);
  // ---- per-user cache: logout clears it; other user never sees Ana's
  const anaKeyBefore = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pcr_v2_pcache:')));
  check('Ana has a per-user cache key', anaKeyBefore.some(k => k.includes('ana.tui')), anaKeyBefore.join(','));
  await page.evaluate(() => doLogout()); await page.waitForTimeout(300);
  const after = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pcr_v2_pcache:')));
  check('logout clears Ana\'s cache', !after.some(k => k.includes('ana.tui')), after.join(','));
  const users = await page.evaluate(() => loadDemo().users.filter(u => /chef/.test((u.roles||u.role||'')+'')).map(u => u.email));
  await login(page, 'kitchen@paradisecoveresortfiji.com', 'staff123').catch(async () => { console.log('chef login failed; users', users); });
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pcr_v2_pcache:')));
  check('after chef login only chef cache key exists', keys.length === 1 && keys[0].includes('kitchen@'), keys.join(','));
  const owner = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pcr_v2_pcache:kitchen@paradisecoveresortfiji.com')).owner; } catch (e) { return 'n/a'; } });
  console.log('chef blob owner:', owner);
  console.log('\nERRORS (' + errors.length + ')\n' + errors.join('\n'));
  console.log('SUMMARY: ' + results.filter(r => r.ok).length + '/' + results.length);
  await browser.close();
})();
