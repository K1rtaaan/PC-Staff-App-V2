/* 3.1.0 browser flows on the demo (?demo=1): superadmin = admin-only account (tabs + server block), one-time notice,
 * activity logs per admin page, superadmin log + revert (owner only). BASE=http://127.0.0.1:8765/ node tools/tests/r310flows.js */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SUPER = ['it@paradisecoveresortfiji.com', '21slands'], CHEF = ['kitchen@paradisecoveresortfiji.com', 'staff123'], STAFF = ['ana.tui@paradisecoveresortfiji.com', 'staff123'];
const BLOCK = "Superadmin accounts can't place orders or bookings. Use a staff account.";
let pass = 0, fail = 0; const errors = []; let cur = '';
function check(name, ok, info){ if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : info); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); });
  const login = async ([email, pw]) => {
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' }); // fresh page state (the notice check is once per page session)
    await page.evaluate(() => { localStorage.setItem('pcr_v2_coach_done', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(2500);
  };
  const api = (a, p) => page.evaluate(([a, p]) => api(a, p), [a, p || {}]);
  const go = async (js) => { await page.evaluate(js); await page.waitForTimeout(1800); };

  // 1) one-time notice + admin-only layout
  cur = 'super'; await login(SUPER);
  check('notice shown at first superadmin login', await page.isVisible('#a31-notice'));
  check('notice has the exact text', /Superadmin is now an admin-only account\. To order meals, book the boat or apply for leave, please register a separate staff account with a different email\./.test(await page.evaluate(() => (document.getElementById('a31-notice') || {}).innerText || '')));
  await page.click('#a31-notice-ok'); await page.waitForTimeout(400);
  check('notice dismissed', !(await page.isVisible('#a31-notice')));
  check('small permanent note on superadmin Home', await page.isVisible('#a31-super-note'));
  check('superadmin nav = Dashboard/Approvals/Manage/More', (await page.evaluate(() => [...document.querySelectorAll('#bottom-nav .nav-item')].map(b => b.dataset.tab).join(','))) === 'home,approvals,manage,more');
  for (const t of ['meals', 'boat', 'bookings', 'history', 'schedule']) { await go(`navigate('${t}')`); check('superadmin cannot open ' + t + ' (sent Home)', await page.evaluate(() => state.tab === 'home')); }
  await go("navigate('more')");
  const moreTxt = await page.evaluate(() => document.getElementById('main-content').innerText);
  check('More has no staff rows (My orders / boat bookings / leave requests)', !/My orders & history|My boat bookings|Leave requests/.test(moreTxt), moreTxt.slice(0, 300));
  check('More has Superadmin log', /Superadmin log/.test(moreTxt));
  let r = await api('placeDinnerOrder', { serviceDate: '2026-09-29', mainChoice: 'x' });
  check('server blocks superadmin dinner order', r.success === false && r.error === BLOCK, JSON.stringify(r));
  r = await api('bookBoat', { runId: 'x' });
  check('server blocks superadmin boat booking', r.success === false && r.error === BLOCK, JSON.stringify(r));
  r = await api('submitLeave', { startDate: '2026-10-01', endDate: '2026-10-01', leaveType: 'annual' });
  check('server blocks superadmin leave', r.success === false && r.error === BLOCK, JSON.stringify(r));

  // 2) notice does not repeat (remembered server-side)
  await login(SUPER);
  check('notice NOT shown at the next login', !(await page.isVisible('#a31-notice')));

  // 3) superadmin changes are logged; revert only once an owner is set, and only by the owner
  r = await api('updateUser', { targetEmail: STAFF[0], contact: '1234567' });
  check('super edits a user', r.success, JSON.stringify(r));
  await go("navigate('superlog')");
  let first = await page.$('.a31-entry');
  check('superadmin log lists the change', first && /User edited/.test(await first.innerText()));
  check('no Revert button while no owner is set', (await page.$$('.a31-rev')).length === 0);
  check('meta explains no owner', /no revert owner set/.test(await page.innerText('#al-meta')));
  r = await api('setAppSetting', { key: 'revert_owner_email', value: SUPER[0], passcode: '2026' });
  check('revert owner set (setAppSetting with code)', r.success, JSON.stringify(r));
  await go("navigate('superlog')");
  const revs = await page.$$('.a31-rev');
  check('owner sees Revert buttons', revs.length >= 1);
  const edit = await page.$('.a31-entry[data-action="updateUser"] .a31-rev');
  check('Revert button on the user edit', !!edit);
  check("an app setting entry exists", !!(await page.$('.a31-entry[data-action="setAppSetting"]')));
  if (edit) { await edit.click(); await page.waitForTimeout(2500); }
  const ana = await page.evaluate(e => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /demo/.test(k) && /users/.test(localStorage.getItem(k) || '')) ) || '{}').users?.find(u => u.email === e), STAFF[0]);
  check('revert restored the old contact', ana && ana.contact === '6666666', ana && ana.contact);
  check('revert entry logged', !!(await page.$('.a31-entry[data-action="revert"]')));
  check('reverted entry shows "Reverted"', /Reverted/.test(await page.evaluate(() => (document.querySelector('.a31-entry[data-action="updateUser"]') || {}).innerText || '')));
  r = await api('addReminder', { title: 'r310 test', passcode: 'role' });
  await go("state.logArea='admin';navigate('adminlog')");
  check('Admin Settings activity log shows entries', (await page.$$('.a31-entry')).length >= 2, await page.innerText('#main-content'));
  await go("navigate('manage')");
  check('Manage has Logs group', /Superadmin log/.test(await page.innerText('#main-content')) && /Activity log · Kitchen Admin/.test(await page.innerText('#main-content')));

  // 4) chef: kitchen activity log only, cannot revert
  cur = 'chef'; await login(CHEF);
  check('no superadmin notice for chef', !(await page.isVisible('#a31-notice')));
  r = await api('setMealTimes', { dinner_cutoff: '22:15' });
  await go("state.logArea='kitchen';navigate('adminlog')");
  check('chef opens Kitchen activity log', await page.evaluate(() => state.tab === 'adminlog' && !!document.getElementById('al-body')));
  r = await api('getAdminLog', { area: 'admin' });
  check('chef cannot read the admin log', r.success === false);
  r = await api('getAdminLog', { area: 'super' });
  check('chef cannot read the superadmin log', r.success === false);
  const lg = await api('getAdminLog', { area: 'kitchen' });
  check('chef meal-time change in the kitchen log', lg.success && lg.data.entries.some(e => e.action === 'setMealTimes' && e.actorEmail === CHEF[0]), JSON.stringify(lg).slice(0, 300));
  r = await api('revertAdminLog', { id: 'x' });
  check('chef cannot revert (server-side)', r.success === false);
  // 5) staff: no log access, staff features still work
  cur = 'staff'; await login(STAFF);
  await go("navigate('meals')");
  check('staff still opens Meals', await page.evaluate(() => state.tab === 'meals'));
  r = await api('getAdminLog', { area: 'kitchen' });
  check('staff cannot read logs', r.success === false);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
