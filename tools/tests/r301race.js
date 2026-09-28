/* 3.0.1 regression: leaving a page while its data is still loading must not throw
 * ("Cannot set properties of null (setting 'innerHTML')" in renderMyBookings) and must not paint over the new page.
 * Demo mode (?demo=1); slow API calls are simulated by delaying api(). node tools/tests/r301race.js */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
let pass = 0, fail = 0; const errors = [];
function check(name, ok, info){ if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : info); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let cur = '';
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); });
  await page.reload({ waitUntil: 'load' });
  const login = async (email, pw) => {
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForTimeout(300);
    await page.evaluate(() => { localStorage.setItem('pcr_v2_coach_done','1'); });
    await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  };
  // slow down the listed API actions (like the real Apps Script on a slow connection)
  const slow = (actions, ms) => page.evaluate(([a, ms]) => {
    if (!window._realApi) window._realApi = api;
    api = function(action){ const args = arguments; const p = window._realApi.apply(this, args); return a.includes(action) ? new Promise(function(res, rej){ setTimeout(function(){ p.then(res, rej); }, ms); }) : p; };
  }, [actions, ms]);
  const fast = () => page.evaluate(() => { if (window._realApi) api = window._realApi; });
  const leaveWhileLoading = async (from, to, check2) => {
    cur = cur.split(':')[0] + ':' + from + '->' + to;
    const n0 = errors.length;
    await page.evaluate(([a, b]) => { navigate(a); setTimeout(function(){ navigate(b); }, 150); }, [from, to]);
    await page.waitForTimeout(2600);
    check(cur + ': no console error', errors.length === n0, errors.slice(n0));
    check(cur + ': still on ' + to, await page.evaluate(t => state.tab === t, to));
    if (check2) check(cur + ': ' + check2[0], await page.evaluate(check2[1]));
  };
  const users = [['staff', 'ana.tui@paradisecoveresortfiji.com', 'staff123'], ['chef', 'kitchen@paradisecoveresortfiji.com', 'staff123'],
    ['boat', 'boat.mgr@paradisecoveresortfiji.com', 'staff123'], ['super', 'it@paradisecoveresortfiji.com', '21slands']];
  for (const [k, email, pw] of users) {
    cur = k; await login(email, pw);
    await slow(['myBoatBookings', 'getBoatRuns', 'getReminders', 'getSuggestions', 'getUsers'], 1200);
    await leaveWhileLoading('bookings', 'more', ['More page not replaced by bookings', () => !document.getElementById('mb-root')]);
    await leaveWhileLoading('bookings', 'home', ['Home not replaced by bookings', () => !document.getElementById('mb-root')]);
    await leaveWhileLoading('bookings', 'boat');
    await leaveWhileLoading('suggestions', 'more', ['More page not replaced by suggestions', () => !document.getElementById('sug-root')]);
    await page.evaluate(() => { try { cacheInvalidate(['boatRuns']); } catch (e) {} });
    await leaveWhileLoading('boat', 'more', ['More page not replaced by Boat', () => !document.getElementById('boat-root')]);
    if (k === 'super') await leaveWhileLoading('users', 'more');
    await fast();
    // normal open still works
    cur = k + ':bookings'; await page.evaluate(() => navigate('bookings')); await page.waitForTimeout(1200);
    check(cur + ': My boat bookings still renders', /My boat bookings/.test(await page.evaluate(() => (document.getElementById('mb-root') || {}).innerText || '')));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
