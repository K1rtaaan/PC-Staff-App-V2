// 2.10.2: demo-mode browser test — a saved stale "last dinner" dish (yesterday's menu) is NOT pre-filled,
// and an off-menu dish is rejected with "That dish isn't on <weekday>'s menu – please pick again".
// Usage: (cd public && python3 -m http.server 8771 &) ; node tools/tests/menu-day-demo.js http://127.0.0.1:8771/ [shotDir]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8771/';
const SHOTS = process.argv[3] || '';
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let live = 0;
  await page.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?demo=1');
  await page.waitForTimeout(1500);
  const staff = { id: 'usr_ana', email: 'ana.tui@paradisecoveresortfiji.com', firstName: 'Ana', lastName: 'Tui', department: 'Housekeeping', role: 'staff', permissions: ['staff'], active: true, verified: true };
  const stale = await page.evaluate((u) => {
    localStorage.setItem('pcr_v2_session', JSON.stringify(u)); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1');
    // today's (not tomorrow's) menu dish, saved as "last dinner" on this phone
    const todayWd = new Date(Date.now() + 12 * 3600e3).getUTCDay();
    const dish = DEFAULT_DINNER_MENUS[todayWd].find(d => !DEFAULT_DINNER_MENUS[(todayWd + 1) % 7].includes(d));
    localStorage.setItem('pcr_v2_last_dinner', JSON.stringify({ mealChoice: dish, notes: '', at: Date.now() }));
    const db = JSON.parse(localStorage.getItem('pcr_v2_demo_db') || '{}');
    db.dinnerOrders = (db.dinnerOrders || []).filter(o => o.userEmail !== u.email);
    localStorage.setItem('pcr_v2_demo_db', JSON.stringify(db));
    return dish;
  }, staff);
  await page.goto(BASE + '?demo=1');
  await page.waitForTimeout(2500);
  const ver = await page.evaluate(() => APP_VERSION);
  check('APP_VERSION 3.5.0', ver === '3.5.0', ver);
  await page.evaluate(() => { state.mealPill = 'dinner'; navigate('meals'); });
  await page.waitForSelector('#dinner-choice', { timeout: 20000 });
  await page.waitForTimeout(800);
  const opts = await page.$$eval('#dinner-choice option', els => els.map(e => e.value));
  const sel = await page.$eval('#dinner-choice', e => e.value);
  const tomorrow = await page.evaluate(() => DEFAULT_DINNER_MENUS[new Date(Date.now() + 36 * 3600e3).getUTCDay()]);
  console.log('stale dish:', stale, '| options:', opts.join(' ; '), '| selected:', sel);
  check('stale dish not in dropdown', !opts.includes(stale));
  check('dropdown = tomorrow\'s menu only', opts.join('|') === tomorrow.join('|'));
  check('stale dish not pre-selected', sel !== stale);
  check('no "Same as last time" for an off-menu dish', !(await page.$('#btn-dinner-same')));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/demo-dinner-no-stale-prefill.png' }); }
  // force an off-menu dish (as an old cached app would send) → rejected with friendly message
  await page.evaluate((d) => { const s = document.querySelector('#dinner-choice'); const o = document.createElement('option'); o.value = d; o.textContent = d; s.appendChild(o); s.value = d; }, stale);
  await page.click('#btn-dinner');
  await page.waitForTimeout(1200);
  const body = await page.textContent('body');
  const wdName = await page.evaluate(() => WEEKDAY_NAMES[new Date(Date.now() + 36 * 3600e3).getUTCDay()]);
  check('friendly rejection toast', body.includes("That dish isn't on " + wdName + "'s menu – please pick again"));
  const booked = await page.evaluate((e) => JSON.parse(localStorage.getItem('pcr_v2_demo_db')).dinnerOrders.filter(o => o.userEmail === e).length, staff.email);
  const bookedRows = await page.evaluate((e) => JSON.parse(localStorage.getItem('pcr_v2_demo_db')).dinnerOrders.filter(o => o.userEmail === e), staff.email);
  check('no order stored for the off-menu dish', !bookedRows.some(o => o.mealChoice === stale), JSON.stringify(bookedRows));
  check('menu re-rendered without the forced dish', !(await page.$$eval('#dinner-choice option', els => els.map(e => e.value))).includes(stale));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/demo-dinner-offmenu-rejected.png' });
  await page.selectOption('#dinner-choice', tomorrow[0]);
  await page.click('#btn-dinner');
  await page.waitForTimeout(1200);
  const ok = await page.evaluate((e) => JSON.parse(localStorage.getItem('pcr_v2_demo_db')).dinnerOrders.filter(o => o.userEmail === e).map(o => o.mealChoice), staff.email);
  check('tomorrow\'s dish books fine', ok.length === 1 && ok[0] === tomorrow[0], JSON.stringify(ok));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no live backend calls in demo', live === 0);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
