/* 3.0.0 browser flows on the demo (?demo=1). node tools/tests/r300flows.js [clockISO]
 * Screenshots → $SHOTS (default /tmp/pcr-tests/r300/). */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS || '/tmp/pcr-tests/r300/';
const clock = process.argv[2] || '2026-09-28T02:00:00Z'; // Mon 28 Sep 14:00 FJT
let pass = 0, fail = 0; const errors = [];
function check(name, ok, info){ if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : info); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(clock) });
  let cur = '';
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); });
  await page.reload({ waitUntil: 'load' });
  const txt = async sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, sel);
  const shot = async n => page.screenshot({ path: SHOTS + n + '.png', fullPage: true });
  const nav = async t => { await page.evaluate(t => navigate(t), t); await page.waitForTimeout(900); };
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const login = async (email, pw) => {
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForTimeout(300);
    await page.evaluate(() => { localStorage.setItem('pcr_v2_coach_done','1'); });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.waitForSelector('#login-email', { state: 'visible' }).catch(()=>{}); await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const m = document.querySelector('#modal-close, .modal-close'); if (m) m.click(); });
  };
  const navLabels = async () => page.evaluate(() => Array.from(document.querySelectorAll('#bottom-nav .nav-item span:first-of-type')).map(e => e.textContent));
  const roleBtns = async () => page.evaluate(() => Array.from(document.querySelectorAll('[data-rolebtn]')).map(e => e.dataset.rolebtn));

  // ---- staff
  cur = 'staff';
  await login('ana.tui@paradisecoveresortfiji.com', 'staff123');
  check('login label says Email', /^Email$/.test((await page.evaluate(() => { const l = document.querySelector('label[for="login-email"]'); return l ? l.textContent.trim() : 'Email'; }))));
  check('staff nav = Home Meals Boat More', JSON.stringify(await navLabels()) === JSON.stringify(['Home','Meals','Boat','More']), await navLabels());
  await shot('staff-home'); check('home: no overflow', !(await overflow()));
  await nav('meals'); await page.waitForTimeout(800); await shot('staff-meals');
  check('meals: dashboard + 3 cards', await page.evaluate(() => !!document.querySelector('#meal-dash') && ['dinner','lunch','breakfast'].every(m => document.querySelector('#meal-card-'+m))));
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#dinner-choice option')).map(o => o.textContent));
  check('dinner dropdown = Tuesday menu only (no Sunday dish)', opts.length > 0 && !opts.some(o => /Lamb Neck Curry|Roasted Chicken \/ Potato/i.test(o)), opts);
  check('cutoff text 11:55pm', /11:55pm/.test(await txt('#meal-card-dinner')));
  check('late close 8:00am mentioned', /8:00am/.test(await txt('#meal-card-dinner')));
  check('meals: no overflow', !(await overflow()));
  // order dinner → overlay
  if (await page.$('#btn-dinner')) {
    await page.click('#btn-dinner'); await page.waitForTimeout(1200);
    check('order overlay shown', /Your order is completed/.test(await txt('#v3-order-overlay')), await txt('#v3-order-overlay'));
    await shot('staff-overlay');
    await page.evaluate(() => { const o = document.getElementById('v3-order-overlay'); if (o) o.remove(); });
  } else check('order dinner button present', false);
  // feedback
  await page.fill('#fb-msg', 'Rice was a bit cold today'); await page.click('#btn-feedback'); await page.waitForTimeout(800);
  check('feedback sent (textarea cleared)', (await page.inputValue('#fb-msg')) === '');
  await nav('more'); await shot('staff-more');
  check('staff has no role buttons', (await roleBtns()).length === 0, await roleBtns());
  await nav('boat'); await page.waitForTimeout(1200);
  check('staff boat: no Add run', !(await page.$('#btn-add-run')));
  await nav('kitchenadmin'); check('staff blocked from Kitchen Admin', await page.evaluate(() => state.tab === 'home'));

  // ---- late window: Tue 00:30 FJT → breakfast/lunch closed? dinner for Tue late until 8am
  // ---- HOD
  cur = 'hod';
  await login('hod.hk@paradisecoveresortfiji.com', 'staff123');
  check('hod nav same as staff', JSON.stringify(await navLabels()) === JSON.stringify(['Home','Meals','Boat','More']));
  await nav('more'); check('hod role buttons = dept', JSON.stringify(await roleBtns()) === '["dept"]', await roleBtns()); await shot('hod-more');
  await nav('deptadmin'); await shot('hod-deptadmin'); check('dept admin tiles', !!(await page.$('#dept-tiles')));
  await nav('approvals'); await page.waitForTimeout(800); await shot('hod-approvals');
  check('approvals: no join requests section', !(await page.$('#ap-joins')));
  await nav('deptstaff'); await page.waitForTimeout(800); check('dept staff: no waiting-to-join', !(await page.$('#ds-pending')));

  // ---- assistant HOD
  cur = 'asst';
  await login('asst.hk@paradisecoveresortfiji.com', 'staff123');
  await nav('more'); check('asst HOD role buttons = dept', JSON.stringify(await roleBtns()) === '["dept"]', await roleBtns());

  // ---- chef (multi-role test user: staff,chef)
  cur = 'chef';
  await login('kitchen@paradisecoveresortfiji.com', 'staff123');
  await nav('more'); check('chef role buttons include kitchen', (await roleBtns()).includes('kitchen'), await roleBtns()); await shot('chef-more');
  await nav('kitchenadmin'); await page.waitForTimeout(1200); await shot('chef-kitchenadmin');
  check('kitchen admin tiles', !!(await page.$('#chef-shortcuts')));
  await nav('chefmenu'); await page.waitForTimeout(1200); await shot('chef-menu7');
  check('7-day menu editor shows 7 days', (await page.$$('#me-days section[data-wd]')).length === 7);
  await page.fill('#me-new-2', 'Test Fish / Chips'); await page.click('.v3-me-add[data-wd="2"]'); await page.waitForTimeout(1000);
  check('dish added on Tuesday', /Test Fish \/ Chips/.test(await txt('#me-day-2')));
  await nav('mealtimes'); await page.waitForTimeout(600); await shot('chef-mealtimes');
  check('meal times: dinner 23:55 & late 08:00', (await page.inputValue('#mt-dinner_cutoff')) === '23:55' && (await page.inputValue('#mt-late_close_dinner')) === '08:00');
  await nav('offmenu'); await page.waitForTimeout(900); await shot('chef-offmenu');
  check('off-menu page loads', !!(await page.$('#om-card')));
  await nav('kitchen'); await page.waitForTimeout(1500); await shot('chef-kitchen');
  await nav('meals'); check('chef can use Meals like staff', await page.evaluate(() => state.tab === 'meals'));

  // ---- boat manager
  cur = 'boat';
  await login('boat.mgr@paradisecoveresortfiji.com', 'staff123');
  await nav('more'); check('boat manager role buttons = boat', JSON.stringify(await roleBtns()) === '["boat"]', await roleBtns());
  await nav('boat'); await page.waitForTimeout(1200); check('boat manager staff Boat tab: no Add run', !(await page.$('#btn-add-run')));
  await nav('boatadmin'); await page.waitForTimeout(1200); await shot('boat-admin'); check('boat admin: Add run', !!(await page.$('#stb-add')));
  await nav('boatruns'); await page.waitForTimeout(1500); await shot('boat-runs'); check('boat runs admin: Add run shown', !!(await page.$('#btn-add-run')));
  await nav('emergency'); await page.waitForTimeout(900); check('emergency page', !!(await page.$('#emerg-card')));

  // ---- admin
  cur = 'admin';
  await login('admin@paradisecoveresortfiji.com', 'staff123');
  await nav('more'); const ab = await roleBtns(); check('admin role buttons incl admin', ab.includes('admin'), ab); await shot('admin-more');
  await nav('adminhub'); await shot('admin-hub');
  await nav('usersv3'); await page.waitForTimeout(1200); await shot('admin-users'); check('role counts shown', !!(await page.$('#role-counts')));
  await page.click('.v3-user'); await page.waitForTimeout(400); await shot('admin-edituser');
  check('edit user: role checkboxes', (await page.$$('.eu3-perm')).length >= 6);
  await page.evaluate(() => closeModal());

  // ---- superadmin
  cur = 'super';
  await login('it@paradisecoveresortfiji.com', '21slands');
  check('super nav', JSON.stringify(await navLabels()) === JSON.stringify(['Dashboard','Approvals','Manage','More']), await navLabels());
  await page.waitForTimeout(800); await shot('super-home');
  await nav('manage'); await shot('super-manage');
  await nav('settings'); await page.waitForTimeout(1000); await shot('super-settings'); check('settings: test email box', !!(await page.$('#st-test')));
  await nav('migrate'); await page.click('#mg-preview'); await page.waitForTimeout(1200); await shot('super-migrate'); check('migration preview', !!(await page.$('#mg-list')));

  // ---- late window after the dinner cutoff (Mon 23:58 FJT): tomorrow dinner = late request
  cur = 'late';
  await page.clock.setSystemTime(new Date('2026-09-28T11:58:00Z'));
  await login('ana.tui@paradisecoveresortfiji.com', 'staff123');
  await nav('meals'); await page.waitForTimeout(1000); await shot('staff-meals-late');
  const dtxt = await txt('#meal-card-dinner');
  check('after 11:55pm dinner shows Orders closed', /Orders closed/.test(dtxt), dtxt.slice(0, 300));

  console.log('\nerrors:', errors.length ? errors.join('\n') : 'none');
  console.log(pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
