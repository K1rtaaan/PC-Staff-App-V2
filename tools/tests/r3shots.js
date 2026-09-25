// 3.0 review screenshots (390px, demo mode) + a few UI checks. node r3shots.js [baseUrl] [outDir]
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = process.argv[3] || '/tmp/pcr-tests/r3shots/';
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const errors = [];
function check(n, c, x) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+12:00') });
  page.on('console', m => { if (m.type() === 'error' && !/script\.google|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const wait = (ms) => page.waitForTimeout(ms || 700);
  const txt = (s) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const shot = (n, full) => page.screenshot({ path: OUT + n + '.png', fullPage: !!full });

  // live mode: a pre-3.0 session (no token) must sign in again; API is blocked here (never touches the real backend)
  await page.route('**/script.google.com/**', r => r.abort());
  await page.route('**/script.googleusercontent.com/**', r => r.abort());
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_v2_session', JSON.stringify({ email: 'ana.tui@paradisecoveresortfiji.com', role: 'staff', permissions: 'staff', firstName: 'Ana' })); });
  await page.reload({ waitUntil: 'load' }); await wait(1200);
  check('live: pre-3.0 session without token → sign in again', await page.evaluate(() => !state.user && !document.getElementById('login-email').closest('.hidden')) && /sign in again/i.test(await txt('#login-error')), await txt('#login-error'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // demo
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); });
  await page.reload({ waitUntil: 'load' }); await wait(600);
  // register → verify-by-email panel
  await page.click('#tab-register'); await wait(300);
  await page.fill('#reg-firstName', 'Salote'); await page.fill('#reg-lastName', 'Naqara');
  await page.selectOption('#reg-department', 'Housekeeping'); await page.fill('#reg-contact', '9123456');
  await page.evaluate(() => { const v = document.getElementById('reg-village'); v.value = v.options[1] ? v.options[1].value : v.value; });
  await page.fill('#reg-email', 'salote.n@paradisecoveresortfiji.com'); await page.fill('#reg-password', 'staff123'); await page.fill('#reg-password2', 'staff123');
  await page.click('#register-form button[type=submit]'); await wait(1000);
  const code = await page.evaluate(() => (loadDemo().demoMail || []).filter(m => m.purpose === 'verify').pop().code);
  check('register: code in the email outbox, not on screen', /^\d{6}$/.test(code) && !(await page.evaluate(c => document.body.innerText.includes(c), code)));
  await page.clock.runFor(4000); await wait(300);
  await shot('01-register-verify-code-by-email');
  // forgot password → reset code by email
  await page.evaluate(() => showForgotPanel()); await page.fill('#forgot-email', 'ana.tui@paradisecoveresortfiji.com');
  await page.click('#btn-send-reset'); await wait(900);
  const rcode = await page.evaluate(() => (loadDemo().demoMail || []).filter(m => m.purpose === 'reset').pop().code);
  check('reset: code emailed, not on screen', /^\d{6}$/.test(rcode) && !(await page.evaluate(c => document.body.innerText.includes(c), rcode)));
  await page.clock.runFor(4000); await wait(300);
  await shot('02-reset-password-code-by-email');
  await page.fill('#forgot-code', rcode); await page.fill('#forgot-new-password', 'newpass1').catch(() => {});
  // superadmin: users & roles with seats
  await page.evaluate(() => { try { showLoginPanel && showLoginPanel(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' }); await wait(500);
  await page.fill('#login-email', 'it@paradisecoveresortfiji.com'); await page.fill('#login-password', '21slands');
  await page.click('#login-form button[type=submit]'); await page.waitForFunction(() => state.user); await wait(1200);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await page.evaluate(() => navigate('usersv3')); await wait(1200);
  const seats = await txt('#seat-usage');
  check('users: seat chips "x of N used"', /of 3 used/.test(seats) && /of 5 used/.test(seats) && /of 2 used/.test(seats), seats.replace(/\n/g, ' '));
  await shot('03-admin-users-seat-counts');
  await shot('03b-admin-users-seat-counts-full', true);
  await page.evaluate(() => [...document.querySelectorAll('.v3-user')].find(b => /Akuila/.test(b.innerText)).click()); await wait(500);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#v3f-role option')].map(o => o.textContent + (o.disabled ? ' [disabled]' : '')));
  check('edit: role options show "x of N" and full roles are disabled', opts.some(o => /Superadmin \(\d of 3/.test(o)) && opts.some(o => /Boat manager \(\d of 2 — full\) \[disabled\]/.test(o)), opts.join(' | '));
  check('edit: "Also boat manager" ticked for HOD + boat', await page.evaluate(() => document.getElementById('v3f-boatManager').checked));
  await shot('04-admin-edit-user-seats');
  await page.click('#v3f-cancel');
  // demo data has more boat managers than seats → another one is refused by the (shared V3.gs) server logic
  const r = await page.evaluate(() => api('setUserAccess', { targetEmail: 'ana.tui@paradisecoveresortfiji.com', role: 'boat_manager' }));
  check('server refuses a boat manager over the limit', !r.success && /Boat manager seats are full/.test(r.error), r.error);
  const r1 = await page.evaluate(() => { state._demoPass = null; return api('setUserAccess', { targetEmail: 'ana.tui@paradisecoveresortfiji.com', role: 'admin', passcode: '2025' }); });
  check('granting admin with 2025 refused', !r1.success && /password/i.test(r1.error), r1.error);
  const r2 = await page.evaluate(() => { state._demoPass = null; return api('deleteUser', { targetEmail: 'ana.tui@paradisecoveresortfiji.com', passcode: '2025' }); });
  check('delete with 2025 refused', !r2.success);
  // migration preview
  await page.evaluate(() => navigate('migrate')); await wait(800);
  await page.click('#mg-dry'); await wait(1200);
  const mg = await txt('#mg-out');
  check('migration: seats + warnings + per-user changes shown', /Seats after migration/i.test(mg) && /Check before applying/i.test(mg) && /Changes per user/i.test(mg) && /department "Other"/.test(mg));
  await shot('05-migration-preview', true);
  await page.evaluate(() => document.querySelector('.mg-seats').scrollIntoView()); await wait(300);
  await shot('05b-migration-preview-seats-warnings');
  // settings: email only + sender
  await page.evaluate(() => navigate('settings')); await wait(1200);
  check('settings: codes sent by email + sender fields', /sent by email/i.test(await txt('#settings-root')) && !!(await page.$('#st-from')));
  await shot('06-settings-email-sender', true);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('no sideways scroll', sw <= 391, String(sw));
  check('no console errors', errors.length === 0, errors.join(' | '));
  console.log('\nSUMMARY: ' + pass + '/' + (pass + fail));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
