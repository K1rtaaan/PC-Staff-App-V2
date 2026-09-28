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

  // 6) first-time role page guide (chef → Kitchen Admin), remembered server-side, "?" reopens
  cur = 'chef-guide'; await login(CHEF);
  await go("navigate('kitchenadmin')"); await page.waitForTimeout(1200);
  check('Kitchen Admin guide shows the first time', await page.isVisible('#guide-root[data-guide="kitchen"]'));
  let steps = 0; while (await page.$('#guide-next')) { await page.click('#guide-next'); steps++; if (steps > 8) break; }
  check('guide has 3–6 steps', steps + 1 >= 3 && steps + 1 <= 6, steps + 1);
  await page.click('#guide-done'); await page.waitForTimeout(300);
  check('guide closed', !(await page.isVisible('#guide-root')));
  await go("navigate('more')"); await go("navigate('kitchenadmin')"); await page.waitForTimeout(1200);
  check('guide not shown again', !(await page.isVisible('#guide-root')));
  await page.evaluate(() => Object.keys(localStorage).filter(k => /^pcr_guide_/.test(k)).forEach(k => localStorage.removeItem(k)));
  await login(CHEF); await go("navigate('kitchenadmin')"); await page.waitForTimeout(1200);
  check('guide not shown on a "new device" (server remembers)', !(await page.isVisible('#guide-root')));
  check('"?" button visible on a role page', await page.isVisible('#btn-guide'));
  await page.click('#btn-guide'); await page.waitForTimeout(300);
  check('"?" reopens the guide', await page.isVisible('#guide-root[data-guide="kitchen"]'));
  await page.click('#guide-skip');
  await go("navigate('meals')");
  check('"?" hidden on staff pages', !(await page.isVisible('#btn-guide')));

  // 7) Report a problem (staff, with a screenshot) → superadmin inbox → reply → reporter notified
  cur = 'staff-report'; await login(STAFF);
  check('report button on every page (header)', await page.isVisible('#btn-report'));
  await page.click('#btn-report'); await page.waitForSelector('#rp31-form');
  await page.selectOption('#rp31-type', 'change');
  await page.fill('#rp31-desc', 'Please add a vegetarian filter on the dinner menu');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1600; const x = c.getContext('2d'); for (let i = 0; i < 400; i++) { x.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,50%)'; x.fillRect(Math.random() * 2400, Math.random() * 1600, 200, 120); } return c.toDataURL('image/png').split(',')[1]; });
  await page.setInputFiles('#rp31-file', { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('#rp31-thumbs img');
  const shrunk = await page.evaluate(() => document.querySelector('#rp31-thumbs img').src);
  check('screenshot shrunk on the phone (JPEG, < 400 KB)', /^data:image\/jpeg/.test(shrunk) && shrunk.length < 400000, shrunk.length + ' chars (png ' + png.length + ')');
  await page.click('#rp31-send'); await page.waitForSelector('#rp31-form', { state: 'hidden', timeout: 8000 }).catch(() => {});
  check('report form closes after sending', !(await page.isVisible('#rp31-form')), await page.evaluate(() => (document.getElementById('rp31-err')||{}).textContent + ' | ' + (document.getElementById('rp31-send')||{}).textContent));
  const reps = await page.evaluate(() => api('getMyReports', {}));
  const r0 = (reps.data && reps.data.reports[0]) || {};
  check('report saved with page/version/device + 1 screenshot', reps.success && reps.data.reports.length === 1 && r0.type === 'change' && r0.page === 'meals' && /^3\.\d+\.\d+$/.test(r0.appVersion) && r0.images.length === 1 && !!r0.device, JSON.stringify({ page: r0.page, v: r0.appVersion, imgs: (r0.images || []).length, dev: r0.device, n: reps.data && reps.data.reports.length }));
  cur = 'super-reports'; await login(SUPER);
  await page.waitForTimeout(1500);
  check('Manage tab shows a report badge', /1/.test(await page.evaluate(() => (document.querySelector('#bottom-nav [data-tab="manage"] .v3-nav-badge') || {}).textContent || '')));
  await go("navigate('reports')");
  check('Reports inbox lists the report', /vegetarian filter/.test(await page.innerText('#rep-body')));
  check('inbox shows the screenshot', !!(await page.$('#rep-body .rep-item img')));
  await page.selectOption('#rep-body .rep-item .rep-st', 'in_progress');
  await page.fill('#rep-body .rep-item .rep-reply', 'Good idea — on the list');
  await page.click('#rep-body .rep-item .rep-save'); await page.waitForTimeout(1800);
  check('status saved', /In progress/.test(await page.innerText('#rep-body')));
  cur = 'staff-reply'; await login(STAFF);
  const mr = await page.evaluate(() => api('getMyReports', {}));
  check('reporter sees status + reply', mr.success && mr.data.reports[0].status === 'in_progress' && /on the list/.test(mr.data.reports[0].reply));
  const nt = await page.evaluate(() => api('getMyNotifications', {}));
  check('reporter got an in-app notification', nt.success && JSON.stringify(nt.data).includes('Your report'), JSON.stringify(nt).slice(0, 200));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
