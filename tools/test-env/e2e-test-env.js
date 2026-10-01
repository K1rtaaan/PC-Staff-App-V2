// End-to-end pass of the TEST build (test-site frontend + TEST backend code) at 390px.
// Runs against tools/test-env/gas-emulator.js (real TEST backend .gs code, in-memory TEST sheet, captured mail).
//   node tools/test-env/e2e-test-env.js [emulatorRoot] [shotDir]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = (process.argv[2] || 'http://127.0.0.1:8795').replace(/\/$/, '');
const SITE = ROOT + '/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/e2e') + '/';
fs.mkdirSync(S, { recursive: true });
const PW = 'TestPass-2026';
const T = { staff: 'groupit.paradisecoveresortfiji+t-staff@gmail.com', hod: 'groupit.paradisecoveresortfiji+t-hod@gmail.com', asst: 'groupit.paradisecoveresortfiji+t-asst@gmail.com',
  admin: 'groupit.paradisecoveresortfiji+t-admin@gmail.com', kitchen: 'groupit.paradisecoveresortfiji+t-kitchen@gmail.com', boat: 'groupit.paradisecoveresortfiji+t-boat@gmail.com',
  newbie: 'groupit.paradisecoveresortfiji+t-new1@gmail.com', super: 'it@paradisecoveresortfiji.com' };
let pass = 0, fail = 0; const errors = []; let cur = ''; const results = [];
function check(n, c, x) { c ? pass++ : fail++; results.push([cur, n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); }
const FJ = (d, hm) => new Date(d + 'T' + hm + ':00+12:00');
const j = async (u) => (await fetch(ROOT + u)).json();
const mails = () => j('/__mail');
async function setClock(page, d) { await page.clock.setSystemTime(d); await j('/__clock?offsetMs=' + (d.getTime() - Date.now())); }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  async function mk(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true }, opts || {}));
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(cur + ' [console] ' + m.text()); });
    page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Test reason' : undefined));
    return { ctx, page };
  }
  const { ctx, page } = await mk();
  await page.clock.install({ time: FJ('2026-09-27', '10:00') }); await setClock(page, FJ('2026-09-27', '10:00'));
  const wait = (ms) => page.waitForTimeout(ms || 700);
  const nav = async (t, p) => { await (p || page).evaluate(t => navigate(t), t); await (p || page).waitForTimeout(1100); };
  const txt = (s, p) => (p || page).evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const shot = (n, full, p) => (p || page).screenshot({ path: S + n + '.png', fullPage: full !== false });
  const api = (a, pl, p) => (p || page).evaluate(([a, pl]) => api(a, pl || {}), [a, pl]);
  async function login(email, pw, p) {
    p = p || page; cur = email.replace('groupit.paradisecoveresortfiji+', '').replace('@gmail.com', '');
    await p.evaluate(() => { try { doLogout(); } catch (e) {} });
    await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', email); await p.fill('#login-password', pw || PW);
    await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => state.user && state.user.email, null, { timeout: 20000 });
    await p.waitForTimeout(1500); await p.evaluate(() => { try { closeModal(); } catch (e) {} });
  }
  async function formFill(vals, p) { p = p || page; for (const k of Object.keys(vals)) { const sel = '#v3f-' + k; const tag = await p.evaluate(s => document.querySelector(s) && document.querySelector(s).tagName, sel); if (tag === 'SELECT') await p.selectOption(sel, vals[k]); else await p.fill(sel, vals[k]); } }
  const noSide = async (label, p) => { const r = await (p || page).evaluate(() => document.documentElement.scrollWidth); check(label + ': no sideways scroll at 390px', r <= 391, String(r)); };

  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  check('orange TEST SITE banner visible', await page.evaluate(() => { const b = document.getElementById('test-site-banner'); return !!b && getComputedStyle(b).backgroundColor === 'rgb(249, 115, 22)' && b.getBoundingClientRect().height > 10; }));
  check('talks to the TEST backend only', await page.evaluate(() => API_URL.indexOf('AKfycbzZFZhI') < 0));
  check('storage keys are test-only (pcrtest_)', await page.evaluate(() => Object.keys(localStorage).every(k => k.indexOf('pcr_') !== 0)));
  await shot('00-login-test-banner', false);

  // ---------- register (item 1 + 2): code by email only
  cur = 'register';
  await page.click('#tab-register'); await wait(300);
  check('no @pcr.com default email checkbox', await page.evaluate(() => !document.getElementById('reg-use-default-email') && !/@pcr\.com/i.test(document.getElementById('register-form').innerText)));
  await page.fill('#reg-firstName', 'TEST'); await page.fill('#reg-lastName', 'Newstarter');
  await page.selectOption('#reg-department', 'IT/Office'); await page.fill('#reg-contact', '9990001');
  await page.evaluate(() => { const v = document.getElementById('reg-village'); v.value = v.options[1] ? v.options[1].value : v.value; });
  await page.fill('#reg-email', T.newbie); await page.fill('#reg-password', PW); await page.fill('#reg-password2', PW);
  await page.click('#register-form button[type=submit]'); await wait(1500);
  let m = (await mails()).filter(x => x.to === T.newbie).pop();
  const code = m && (String(m.body).match(/\b(\d{6})\b/) || [])[1];
  check('verification code emailed to the registered address with [TEST]', !!code && /^\[TEST\]/.test(m.subject), m && m.subject);
  check('code NOT shown on screen', !(await page.evaluate(c => document.body.innerText.includes(c), code)));
  await shot('01-register-check-email', false);
  await page.fill('#verify-code', code); await page.click('#btn-verify'); await wait(2000);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  if (!(await page.evaluate(() => state.user && state.user.email))) await login(T.newbie);
  cur = 't-new1'; await nav('home');
  check('new sign-up: department pending banner', /waiting for the HOD/i.test(await txt('#v3-dept-banner')), await txt('#v3-dept-banner'));
  const lvBlocked = await api('submitLeave', { leaveType: 'Day off', startDate: '2026-10-05', endDate: '2026-10-05', reason: 'x' });
  check('pending: leave locked on the server', !lvBlocked.success && /HOD/i.test(lvBlocked.error), lvBlocked.error);
  await shot('02-new-staff-pending');

  // ---------- reset password (code by email)
  cur = 'reset';
  await page.evaluate(() => doLogout()); await wait(400);
  await page.evaluate(() => showForgotPanel()); await page.fill('#forgot-email', T.staff); await page.click('#btn-send-reset'); await wait(1500);
  m = (await mails()).filter(x => x.to === T.staff).pop();
  const rcode = m && (String(m.body).match(/\b(\d{6})\b/) || [])[1];
  check('reset code emailed to the registered address with [TEST]', !!rcode && /^\[TEST\]/.test(m.subject));
  check('reset code NOT on screen', !(await page.evaluate(c => document.body.innerText.includes(c), rcode)));
  await page.fill('#forgot-code', rcode); await page.fill('#forgot-new-pw', 'TestPass-2026r'); await page.fill('#forgot-new-pw2', 'TestPass-2026r');
  await shot('03-reset-code-step', false);
  await page.click('#btn-do-reset'); await wait(1500);
  await page.evaluate(() => { try { doLogout(); } catch (e) {} });
  await login(T.staff, 'TestPass-2026r');
  check('new password works', await page.evaluate(() => !!state.user));
  const old = await page.evaluate(([e]) => api('login', { email: e, password: 'TestPass-2026' }), [T.staff]);
  check('old password no longer works', !old.success);
  // put the documented test password back (same email-code flow, done over HTTP)
  await fetch(ROOT + '/exec?action=requestPasswordReset&email=' + encodeURIComponent(T.staff));
  const m2 = (await mails()).filter(x => x.to === T.staff).pop(); const rc2 = (String(m2.body).match(/\b(\d{6})\b/) || [])[1];
  const back = await fetch(ROOT + '/exec?action=resetPassword&email=' + encodeURIComponent(T.staff) + '&code=' + rc2 + '&newPassword=' + PW).then(r => r.json());
  check('reset back to the test password', back.success, back.error);

  // ---------- HOD: status bar, Approve all joins, Dept updates, Department Staff, special meal
  await login(T.hod);
  await nav('home'); await shot('10-hod-home');
  check('HOD status bar shows join requests', /Join/i.test(await txt('#v3-hodbar')), (await txt('#v3-hodbar')).replace(/\n/g, ' '));
  await nav('approvals'); await wait(800);
  check('approvals inbox lists the join request', /Newstarter/.test(await txt('#ap-joins')));
  await shot('11-hod-approvals-joins');
  await page.click('#ap-all-joins'); await wait(1800);
  check('Approve all (joins) accepted the new starter', /No one is waiting/.test(await txt('#ap-joins')));
  await nav('deptupdates'); await page.fill('#du-title', 'TEST: server room tidy-up'); await page.fill('#du-body', 'Please clear your desks by Friday (test post).'); await page.click('#du-send'); await wait(1200);
  check('HOD posted a department update', /server room/.test(await txt('#du-list'))); await shot('12-hod-dept-updates');
  await nav('deptstaff'); await wait(900);
  check('Department Staff lists accepted staff incl. the new starter', /Newstarter/.test(await txt('#ds-staff')) && /TEST Staff|Staff/.test(await txt('#ds-staff')));
  await shot('13-hod-department-staff');
  await nav('meals'); await page.evaluate(() => v3OpenSpecialForm()); await wait(800);
  await page.fill('#sp-name', 'TEST Visitor'); await page.fill('#sp-reason', 'Contractor on site'); await page.fill('#sp-note', 'Allergy: shellfish');
  await page.selectOption('#sp-meal', 'dinner'); await shot('14-hod-special-meal-form', false);
  await page.click('#sp-send'); await wait(1500);
  await nav('special'); check('special meal order waiting for chef', /TEST Visitor/.test(await txt('#sp-list')));

  // ---------- staff: Home card, Do this now, updates, suggestion, meals, votes, feedback, leave
  await login(T.staff);
  await nav('home'); await wait(600);
  check('Home greeting card with 3 meal statuses + countdowns', /breakfast/i.test(await txt('#home-myorders')) && /dinner/i.test(await txt('#home-myorders')) && /\d+h|\d+m/.test(await txt('#home-myorders')));
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#home-dothisnow .v3-tile')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  check('Do this now = Book a boat, My bookings, Request leave, Meals', tiles.length === 4, tiles.join(' | '));
  check('Home shows the department update', /server room/.test(await txt('#home-deptupdates')));
  check('Home has reminders + suggestion box', !!(await page.$('#home-reminders')) && !!(await page.$('#home-suggest')));
  await page.fill('#sug-title', 'TEST suggestion'); await page.fill('#sug-body', 'More shade at the jetty'); await page.click('#sug-send'); await wait(900);
  await shot('20-staff-home'); await noSide('staff home');
  await nav('meals'); await wait(1000);
  check('single Meals tab with breakfast, lunch, dinner', !!(await page.$('#meal-card-dinner')) && /Breakfast/.test(await txt('#main-content')) && /Lunch/.test(await txt('#main-content')));
  const voteDish = await page.evaluate(() => { const b = document.querySelector('#weekly-menu .v3-vote[data-v="1"]'); if (!b) return null; b.click(); return b.dataset.dish; }); await wait(900);
  check('weekly dinner like vote', !!voteDish && await page.evaluate(d => { const b = document.querySelector('#weekly-menu .v3-vote[data-v="1"][data-dish="' + d + '"]'); return b && /\b1\b/.test(b.innerText); }, voteDish), voteDish);
  check('burger / pizza not in the vote', await page.evaluate(() => ![...document.querySelectorAll('#weekly-menu .v3-vote')].some(b => /burger|pizza/i.test(b.dataset.dish))));
  for (let i = 1; i <= 3; i++) {
    const t = await page.evaluate(() => { const b = document.getElementById('btn-lunch'); return b ? b.textContent : ''; });
    if (/Count me in/.test(t)) { await page.click('#btn-lunch'); await wait(1200); }
    await page.click('#btn-lunch-cancel'); await wait(500);
    check('cancel asks for a reason (' + i + ')', !!(await page.$('#v3f-why')));
    await page.selectOption('#v3f-why', { index: 1 }); await page.click('#v3f-submit'); await wait(1400);
  }
  check('lunch locked after the 3rd cancel', !!(await page.$('#lu-blocked')));
  const l4 = await api('placeLunchOrder', {});
  check('server refuses a 4th lunch order', !l4.success && /3 times/.test(l4.error), l4.error);
  await page.evaluate(() => document.getElementById('meal-card-lunch').scrollIntoView()); await shot('21-lunch-locked', false);
  await page.click('#btn-dinner'); await wait(1400);
  check('dinner (tomorrow) ordered — one order per meal', /Your dinner/.test(await txt('#meal-card-dinner')));
  const d2 = await api('placeDinnerOrder', { mealChoice: 'x' });
  const dRows = (await j('/__sheet?name=Dinner%20Orders')).filter(r => r.includes(T.staff) && !r.includes('cancelled'));
  check('one order per meal: ordering again replaces the choice (still 1 dinner row)', d2.success && dRows.length === 1, dRows.length + ' rows');
  await page.fill('#fb-msg', 'TEST feedback: curry was great'); await page.click('#btn-feedback'); await wait(1000);
  await shot('22-staff-meals');
  await page.evaluate(() => v3OpenLeaveForm()); await wait(400);
  await formFill({ leaveType: 'Annual leave', startDate: '2026-10-12', endDate: '2026-10-14', reason: 'TEST family visit' });
  await page.click('#v3f-submit'); await wait(1500);
  await page.evaluate(() => v3OpenLeaveForm()); await wait(400);
  await formFill({ leaveType: 'Day off', startDate: '2026-10-20', endDate: '2026-10-20', reason: 'TEST to cancel' });
  await page.click('#v3f-submit'); await wait(1500);
  await nav('leave'); await wait(800);
  check('leave waiting for HOD', /TEST family visit/.test(await txt('#lv-list')) && /Waiting for HOD/.test(await txt('#lv-list')));
  const before = (await mails()).length;
  await page.evaluate(() => { const c = [...document.querySelectorAll('#lv-list article')].find(a => /family visit/.test(a.innerText)); c.querySelector('.v3-lv-esc').click(); }); await wait(1500);
  const esc = (await mails()).slice(before);
  check('escalate emails go ONLY to it@ with [TEST] (redirected)', esc.length >= 1 && esc.every(x => x.to === 'it@paradisecoveresortfiji.com' && /^\[TEST\]/.test(x.subject)) && /originally to:.*t-hod/.test(esc[0].body), esc.map(x => x.to + ' ' + x.subject).join(' ; '));
  await page.evaluate(() => { const c = [...document.querySelectorAll('#lv-list article')].find(a => /to cancel/.test(a.innerText)); c.querySelector('.v3-lv-cancel').click(); }); await wait(1500);
  check('leave cancelled', /Cancelled/i.test(await page.evaluate(() => { const c = [...document.querySelectorAll('#lv-list article')].find(a => /to cancel/.test(a.innerText)); return c ? c.innerText : ''; })));
  await shot('23-staff-leave');
  await nav('more'); check('Profile: department read-only', /Department \(read-only\)/.test(await txt('#more-profile'))); await shot('24-staff-more');
  await nav('history'); await wait(1000); check('My History lists orders, leave, feedback', /family visit/.test(await txt('#hi-leave')) && /curry/.test(await txt('#hi-feedback'))); await shot('25-staff-history');
  await nav('notifications'); await wait(800); await shot('26-staff-notifications');
  // new starter leave → HOD Approve all
  await login(T.newbie);
  const nl = await api('submitLeave', { leaveType: 'Day off', startDate: '2026-10-13', endDate: '2026-10-13', reason: 'TEST newbie day off' });
  check('accepted new starter can request leave', nl.success, nl.error);

  // ---------- assistant HOD single approve, HOD Approve all, admin final, calendar
  await login(T.asst);
  await nav('approvals'); await wait(900);
  check('assistant HOD sees both requests in the HOD step', /family visit/.test(await txt('#ap-leave')) && /newbie/.test(await txt('#ap-leave')));
  await page.evaluate(() => { const c = [...document.querySelectorAll('#ap-leave article')].find(a => /family visit/.test(a.innerText)); c.querySelector('.v3-lv-dec[data-d="approve"]').click(); }); await wait(400);
  await page.fill('#v3f-note', 'Covered by TEST HOD'); await page.click('#v3f-submit'); await wait(1500);
  await shot('30-asst-hod-approvals');
  await login(T.hod);
  await nav('approvals'); await wait(900);
  await page.click('#ap-all-leave'); await wait(1800);
  check('HOD Approve all (leave) cleared the HOD step', /No leave waiting/.test(await txt('#ap-leave')));
  const adminSkip = await j('/__sheet?name=Leave%20Requests');
  await nav('leavecal'); await wait(1200); await page.click('#lc-next'); await wait(1200);
  check('HOD leave calendar (own department, month view)', /family visit|Staff|Newstarter/.test(await txt('#leavecal-root') + await txt('#lc-list')) && !(await page.$('#lc-dsel')));
  await shot('31-hod-leave-calendar');
  await login(T.admin);
  await nav('approvals'); await wait(900);
  check('admin final approval lists both', /family visit/.test(await txt('#ap-final')) && /newbie/.test(await txt('#ap-final')));
  await shot('32-admin-approvals');
  await page.click('#ap-all-final'); await wait(1800);
  check('admin Approve all (final) done', /Nothing waiting/.test(await txt('#ap-final')));
  await nav('leavecal'); await wait(1200); await page.click('#lc-next'); await wait(1200);
  check('admin leave calendar (all departments + selector)', !!(await page.$('#lc-dsel')));
  await shot('33-admin-leave-calendar');
  const hodTry = await (async () => { await login(T.hod); return api('decideLeave', { id: 'nope', decision: 'approve' }); })();
  check('HOD cannot decide unknown/foreign leave', !hodTry.success);

  // ---------- admin: users (role counts), reminders CRUD, 12 CSV exports
  await login(T.admin);
  await nav('usersv3'); await wait(1200);
  check('Users shows role counts (no seat limits)', /Admin/.test(await txt('#role-counts')) && !/of \d+ used/.test(await txt('#role-counts')));
  await shot('40-admin-users-role-counts');
  await page.fill('#uf-q', '@').catch(() => {}); await page.waitForTimeout(400); await page.evaluate(() => [...document.querySelectorAll('.v3-user')].find(b => /Newstarter/.test(b.innerText)).click()); await wait(600);
  await shot('41-admin-edit-user', false);
  await page.click('#eu3-cancel');
  await nav('reminders'); await wait(900);
  await page.click('#rm-add'); await formFill({ title: 'TEST fire drill', body: 'Assemble at the beach deck' }); await page.click('#v3f-submit'); await wait(1400);
  check('reminder created', /TEST fire drill/.test(await txt('#rm-list')));
  await page.evaluate(() => [...document.querySelectorAll('.v3-rm[data-a="edit"]')].find(b => /TEST fire drill/.test(b.closest('article').innerText)).click()); await wait(400);
  await page.fill('#v3f-title', 'TEST fire drill 11am'); await page.click('#v3f-submit'); await wait(1400);
  check('reminder edited', /11am/.test(await txt('#rm-list')));
  await shot('42-admin-reminders');
  const delBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('.v3-rm')].find(b => /del|remove/i.test(b.dataset.a) && /11am/.test(b.closest('article').innerText)); if (b) { b.click(); return b.dataset.a; } return null; }); await wait(1400);
  check('reminder deleted', !!delBtn && !/11am/.test(await txt('#rm-list')), delBtn);
  await nav('adminstatus'); await page.click('#ex-go'); await wait(1800);
  const nEx = await page.evaluate(() => document.querySelectorAll('.v3-ex').length);
  const nonEmpty = await page.evaluate(() => state._exSets.map(s => (s[2] || []).length));
  const files = [];
  for (let i = 0; i < nEx; i++) { if (!nonEmpty[i]) continue; const w = page.waitForEvent('download', { timeout: 6000 }).catch(() => null); await page.click('.v3-ex[data-i="' + i + '"]'); const d = await w; if (d) { files.push(d.suggestedFilename()); await d.saveAs(S + 'csv-' + d.suggestedFilename()); } }
  check('Admin Status: 12 CSV reports, every non-empty one downloads', nEx === 12 && files.length === nonEmpty.filter(Boolean).length, nEx + ' reports; rows ' + nonEmpty.join(',') + '; files ' + files.length);
  check('users CSV never contains passwords', !fs.readdirSync(S).filter(f => /csv-pcr-users/.test(f)).some(f => /password/i.test(fs.readFileSync(S + f, 'utf8').split('\n')[0])));
  await shot('43-admin-status-exports');

  // ---------- cutoff reminder (1 hour before) + books closed + late meal request
  await login(T.newbie);
  await setClock(page, FJ('2026-09-27', '19:10')); await nav('home'); await wait(800);
  check('7:10pm: cutoff banner for dinner (not ordered yet)', /dinner/i.test(await txt('#v3-cutoff-banner')), await txt('#v3-cutoff-banner'));
  await shot('50-cutoff-reminder-dinner', false);
  await setClock(page, FJ('2026-09-27', '12:10')); await nav('home'); await wait(800);
  check('12:10pm: cutoff banner for breakfast / lunch', /breakfast|lunch/i.test(await txt('#v3-cutoff-banner')), await txt('#v3-cutoff-banner'));
  const notes = await api('getMyNotifications', {});
  check('cutoff reminder is in-app (no email to staff)', !(await mails()).some(x => x.to === T.newbie && /cutoff|reminder/i.test(x.subject)));
  await setClock(page, FJ('2026-09-27', '20:30')); await nav('home'); await wait(800);
  check('after 8pm: "Books closed" on Home', /Books closed/.test(await txt('#home-books-closed')));
  await shot('51-books-closed', false);
  await nav('meals'); await wait(1000);
  await page.selectOption('#late-slot', { index: 0 }); await page.fill('#late-reason', 'TEST missed the cutoff'); await page.click('#btn-late-meal'); await wait(1500);
  const my = await api('getMyHistory', { from: '2026-09-26', to: '2026-09-29' });
  check('Late Meal Request created (waiting for chef OK)', my.success && my.data.requests.some(x => /late_pending/.test(x.status)), my.success && my.data.requests.map(x => x.meal + ':' + x.status).join(','));
  await shot('52-late-meal-request');

  // ---------- Chef station
  const chef = await mk(); const cp = chef.page; await cp.clock.install({ time: FJ('2026-09-27', '20:40') }); await j('/__clock?offsetMs=' + (FJ('2026-09-27', '20:40').getTime() - Date.now()));
  await cp.goto(SITE, { waitUntil: 'load' }); await cp.evaluate(() => localStorage.setItem('pcrtest_v2_coach_done', '1'));
  const bad = await cp.evaluate(() => api('login', { email: 'chef', password: 'wrong-password' }));
  cur = 'chef-station'; check('wrong station password refused', !bad.success);
  await login('chef', 'ChefTest-2026', cp); cur = 'chef-station';
  check('Chef login opens ONLY the Chef page', await cp.evaluate(() => v3Station() === 'chef' && !navItems().some(n => ['meals', 'leave', 'manage', 'approvals'].includes(n.id))), await cp.evaluate(() => navItems().map(n => n.label).join(',')));
  await shot('60-chef-dashboard', true, cp);
  check('dashboard chart + Allergies & special requests card', !!(await cp.$('#v3-chefdash svg')) && /Allerg/i.test(await txt('#main-content', cp)));
  const deny = await cp.evaluate(async () => { const o = []; for (const [a, p] of [['placeDinnerOrder', { mealChoice: 'x' }], ['placeLunchOrder', {}], ['submitLeave', { startDate: '2026-10-10', endDate: '2026-10-10' }], ['getUsers', {}], ['setUserAccess', { targetEmail: 'x', permissions: 'admin' }], ['getMyHistory', {}], ['approveAllPending', { kind: 'leave' }], ['saveBoatRun', { date: '2026-09-30' }], ['placeSpecialMeal', { guestName: 'x', meal: 'dinner' }]]) { const r = await api(a, p); o.push(a + ':' + !!r.success); } return o; });
  check('server rejects ordering / leave / admin / boat actions for the Chef station', deny.every(x => /:false$/.test(x)), deny.join(','));
  const fakeStaff = await fetch(ROOT + '/exec?action=getUsers&requesterEmail=' + encodeURIComponent(T.staff)).then(r => r.json());
  check('personal staff account also refused admin reads', !fakeStaff.success);
  await nav('chefreq', cp); await wait(900);
  await shot('61-chef-requests', true, cp);
  await cp.evaluate(() => v3ForgetActor());
  await cp.click('#cr-acc-all'); await cp.waitForSelector('#actor-list', { timeout: 8000 }).catch(() => {});
  const pickNames = await cp.evaluate(() => [...document.querySelectorAll('#actor-overlay .v3-actor')].map(b => b.innerText.trim()));
  check('"Who\'s doing this?" picker lists Kitchen-department people + Other', pickNames.some(n => /TEST Kitchen|Jone/.test(n)) && !!(await cp.$('#actor-other')), pickNames.join(' | '));
  await shot('62-chef-who-is-doing-this', false, cp);
  await cp.evaluate(() => { const b = [...document.querySelectorAll('#actor-overlay .v3-actor')].find(b => /TEST Kitchen/.test(b.innerText)); b.click(); }); await cp.waitForTimeout(2000);
  const dinnerRows = await j('/__sheet?name=Dinner%20Orders');
  const h = dinnerRows[0]; const sIdx = h.indexOf('status'), bIdx = h.indexOf('decidedBy');
  check('Accept all (incl. HOD special) recorded with the picked name', dinnerRows.some(r => /TEST Visitor/.test(r.join('|')) && r[sIdx] === 'approved' && /TEST Kitchen.*Chef station/.test(r[bIdx])), dinnerRows.filter(r => /TEST Visitor/.test(r.join('|'))).map(r => r[sIdx] + ' ' + r[bIdx]).join(';'));
  const acted = await cp.evaluate(() => api('decideAllMealRequests', { decision: 'approve', kind: 'all' }));
  check('picker choice remembered (~15 min) — next action has no picker', acted.success && !(await cp.evaluate(() => { const o = document.getElementById('actor-overlay'); return o && !o.classList.contains('hidden'); })));
  await nav('kitchen', cp); await cp.waitForTimeout(1500); await shot('63-chef-orders-prep', true, cp);
  check('prep list with Allergies & special requests', /shellfish/i.test(await txt('#kit-notes-card', cp)), (await txt('#kit-notes-card', cp)).slice(0, 120));
  await nav('chefmenu', cp); await shot('64-chef-menu-votes', true, cp);
  check('menu editor shows votes', /👍|like|fa-thumbs-up/i.test(await cp.evaluate(() => document.getElementById('main-content').innerHTML)));
  await nav('chefcomments', cp); await cp.waitForTimeout(900); check('chef sees staff feedback', /curry was great/.test(await txt('#cc-list', cp))); await shot('65-chef-food-comments', true, cp);
  await nav('chefreports', cp); await cp.click('#rp-go'); await cp.waitForTimeout(1200); check('reports table', /Ord/.test(await txt('#rp-table', cp))); await shot('66-chef-reports', true, cp);
  await nav('special', cp); await cp.waitForTimeout(900); check('HOD special orders page (accept / decline, no ordering)', /TEST Visitor/.test(await txt('#sp-list', cp)) && !(await cp.$('#sp-send')));
  // meal summaries: after 8pm the dinner snapshot is saved on first open (fallback) — the trigger does the same at 8:05pm
  await j('/__run?fn=mealSnapshotTick');
  await nav('snapshots', cp); await cp.waitForTimeout(1800);
  const days = await cp.evaluate(() => [...document.querySelectorAll('.v3-snap-day')].map(b => b.dataset.d));
  check('meal summaries: 7 day chips (last 5 days + today + tomorrow)', days.length === 7 && days[0] === '2026-09-22' && days[6] === '2026-09-28', days.join(','));
  check('auto snapshot saved at the 8pm cutoff ("Meal Snapshots" tab)', /Auto 8pm/.test(await txt('#snap-list', cp)) && (await j('/__sheets')).sheets.includes('Meal Snapshots'));
  const sheetTxt = await txt('#snap-sheet', cp);
  check('preview = printable dinner list incl. Allergies & special requests', /Allergies & special requests/i.test(sheetTxt) && /Dinner Order List/i.test(sheetTxt), sheetTxt.slice(0, 120));
  await shot('67-meal-summary-dinner', true, cp);
  const dl = cp.waitForEvent('download', { timeout: 25000 }).catch(() => null); await cp.click('#snap-pdf'); const dd = await dl;
  let pdfOk = false; if (dd) { const p = await dd.path(); const b = fs.readFileSync(p); pdfOk = b.slice(0, 4).toString() === '%PDF'; fs.copyFileSync(p, S + 'meal-summary-dinner.pdf'); }
  check('Download PDF', pdfOk, dd && dd.suggestedFilename());
  const pp = cp.waitForEvent('popup', { timeout: 8000 }).catch(() => null); await cp.click('#snap-print'); const pop = await pp;
  check('Print view opens', !!pop && /Order List/.test(await pop.evaluate(() => document.body.innerText).catch(() => ''))); if (pop) await pop.close().catch(() => {});
  await cp.click('.v3-snap-day[data-d="2026-09-22"]'); await cp.waitForTimeout(1500);
  check('5 days back without a snapshot → built from order rows', /From order rows/.test(await txt('#snap-preview', cp)));
  await cp.click('.v3-snap-meal[data-m="breakfast"]'); await cp.waitForTimeout(1500); check('breakfast summary', /Breakfast Order List/.test(await txt('#snap-sheet', cp)));
  await cp.click('.v3-snap-meal[data-m="lunch"]'); await cp.waitForTimeout(1500); check('lunch summary', /Lunch Order List/.test(await txt('#snap-sheet', cp)));
  await shot('68-meal-summary-lunch', true, cp);
  await noSide('chef station', cp);

  // ---------- Boat station
  const boat = await mk(); const bp = boat.page; await bp.goto(SITE, { waitUntil: 'load' }); await bp.evaluate(() => localStorage.setItem('pcrtest_v2_coach_done', '1'));
  await login('boat', 'BoatTest-2026', bp); cur = 'boat-station';
  check('Boat login opens ONLY the Boat page', await bp.evaluate(() => v3Station() === 'boat' && !navItems().some(n => ['meals', 'chef', 'leave', 'manage'].includes(n.id))), await bp.evaluate(() => navItems().map(n => n.label).join(',')));
  await bp.waitForTimeout(800); await shot('70-boat-bookings', true, bp);
  check('Boat page: bookings / runs list + tools', !!(await bp.$('#stb-list')));
  const bdeny = await bp.evaluate(async () => { const o = []; for (const [a, p] of [['getOrderSnapshots', {}], ['placeDinnerOrder', { mealChoice: 'x' }], ['submitLeave', {}], ['getUsers', {}], ['decideAllMealRequests', { decision: 'approve' }]]) { const r = await api(a, p); o.push(a + ':' + !!r.success); } return o; });
  check('server rejects chef / personal / admin actions for the Boat station', bdeny.every(x => /:false$/.test(x)), bdeny.join(','));
  await bp.evaluate(() => v3ForgetActor());
  await bp.evaluate(() => { window.__p = api('dedupeBoatRuns', {}); }); await bp.waitForSelector('#actor-list', { timeout: 8000 }).catch(() => {});
  const bnames = await bp.evaluate(() => [...document.querySelectorAll('#actor-overlay .v3-actor')].map(b => b.innerText.trim()));
  check('Boat picker lists Boatman / boat people', bnames.some(n => /TEST Boatman|Eroni/.test(n)), bnames.join(' | '));
  await shot('71-boat-who-is-doing-this', false, bp);
  await bp.evaluate(() => document.querySelector('#actor-overlay .v3-actor').click()); await bp.waitForTimeout(1200);
  await nav('boat', bp); await shot('72-boat-runs', true, bp);
  await nav('station', bp); await shot('73-boat-more', true, bp);

  // ---------- superadmin: Manage, Settings, Chef + Boat pages, rotate
  await login(T.super, '21slands'); cur = 'superadmin';
  await nav('home'); await shot('80-superadmin-home');
  await nav('manage'); await wait(600); check('Manage hub has Stations (Chef page, Boat page, Station logins) + Settings', /Station logins/.test(await txt('#main-content')) && /Chef page/.test(await txt('#main-content')) && /settings/i.test(await txt('#main-content')));
  await shot('81-superadmin-manage');
  await nav('settings'); await wait(1000); check('Settings: email sender Google / Brevo', (await page.evaluate(() => [...document.querySelectorAll('#st-prov option')].map(o => o.value).join(','))) === 'mailapp,brevo');
  const flags = await api('getAppSettings', {});
  check('feature_my_schedule + feature_live_roster OFF, stations_exclusive OFF', flags.data.settings.feature_my_schedule !== 'true' && flags.data.settings.feature_live_roster !== 'true' && flags.data.settings.stations_exclusive !== 'true');
  await shot('82-superadmin-settings');
  await nav('chef'); check('superadmin opens the Chef page (no picker)', await page.evaluate(() => state.tab === 'chef') && !!(await page.$('#chef-as-super')));
  const su = await api('markChefFeedback', { id: 'none' }); check('superadmin station action needs no picker', !su.needsActor);
  await nav('stboat'); check('superadmin opens the Boat page', await page.evaluate(() => state.tab === 'stboat'));
  await shot('83-superadmin-boat-page');
  await nav('snapshots'); await wait(1400); check('superadmin sees meal summaries', /Auto 8pm/.test(await txt('#snap-list')));
  const chefTok = await cp.evaluate(() => loadToken());
  await nav('stations'); await wait(900); await shot('84-station-logins');
  await page.click('.v3-st-gen[data-k="chef"]'); await page.waitForSelector('#stl-pw', { timeout: 8000 }).catch(() => {});
  const newPw = await txt('#stl-pw'); check('rotate shows the new password once', newPw.length >= 10);
  await shot('85-station-rotated', false);
  const after = await cp.evaluate(() => api('getStationHome', {}));
  await cp.waitForTimeout(1200);
  check('rotate signs out every Chef device', !after.success && after.authRequired, JSON.stringify(after).slice(0, 120));
  check('Chef device is back at the login screen', await cp.evaluate(() => !state.user));
  const set = await api('setStationPassword', { station: 'chef', username: 'chef', password: 'ChefTest-2026' });
  check('station password set back to the test value', set.success, set.error);
  await page.click('#so-preview'); await wait(1400);
  check('switch-over preview only (nothing changed)', /Preview — nothing changed/.test(await txt('#so-out')));
  await shot('86-switch-over-preview');

  // ---------- 2025 / 2026 codes still work (live model)
  cur = 'codes';
  const q = (a, extra) => fetch(ROOT + '/exec?action=' + a + '&requesterEmail=' + encodeURIComponent(T.staff) + extra).then(r => r.json());
  const c1 = await q('dedupeBoatRuns', '&passcode=2025'), c0 = await q('dedupeBoatRuns', '');
  check('admin code 2025 works for admin actions (staff without code refused)', c1.success && !c0.success, JSON.stringify([c1.error, c0.error]));
  const c2 = await q('archiveOldRows', '&passcode=2026&dryRun=1'), c3 = await q('archiveOldRows', '&passcode=2025&dryRun=1');
  check('superadmin code 2026 works; 2025 is not superadmin', c2.success && !c3.success, JSON.stringify([c2.error, c3.error]));

  // ---------- offline queue + update prompt (service worker ON, test cache name)
  cur = 'offline+sw';
  const sw = await mk({ serviceWorkers: 'allow' }); const sp = sw.page;
  await j('/__clock?offsetMs=' + (FJ('2026-09-27', '10:30').getTime() - Date.now())); await sp.clock.install({ time: FJ('2026-09-27', '10:30') });
  const errBefore = errors.length;
  await sp.goto(SITE, { waitUntil: 'load' }); await sp.evaluate(() => localStorage.setItem('pcrtest_v2_coach_done', '1'));
  await sp.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await sp.reload({ waitUntil: 'load' });
  const ks = await sp.evaluate(() => caches.keys());
  check('service worker cache uses the TEST name (pcrtest-staff-*)', ks.length && ks.every(k => k.indexOf('pcrtest-staff-') === 0), ks.join(','));
  check('service worker scope is /PC-Staff-App-V2-Test/', await sp.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.scope)).then(s => /\/PC-Staff-App-V2-Test\/$/.test(s)));
  await login(T.asst, PW, sp); cur = 'offline+sw';
  await nav('meals', sp); await sp.waitForTimeout(800);
  await sw.ctx.setOffline(true); await sp.waitForTimeout(300);
  const hasDinnerBtn = !!(await sp.$('#btn-dinner'));
  if (hasDinnerBtn) { await sp.click('#btn-dinner'); await sp.waitForTimeout(900); }
  const ql = await sp.evaluate(() => queueItems().length);
  check('offline: order saved to the queue ("Waiting to send")', hasDinnerBtn && ql === 1, 'queue=' + ql);
  await shot('90-offline-queued', true, sp);
  // the browser itself logs "net::ERR_FAILED" for requests made while offline — expected here, not an app error
  for (let i = errors.length - 1; i >= errBefore; i--) if (/ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(errors[i])) errors.splice(i, 1);
  await sw.ctx.setOffline(false); await sp.waitForFunction(() => queueItems().length === 0, null, { timeout: 20000 }).catch(() => {});
  const rowsD = await j('/__sheet?name=Dinner%20Orders');
  check('back online: queue sent exactly once', (await sp.evaluate(() => queueItems().length)) === 0 && rowsD.filter(r => r.join('|').includes(T.asst) && !/cancelled/.test(r.join('|'))).length === 1);
  const swPath = '/tmp/testsite-emu/sw.js'; const orig = fs.readFileSync(swPath, 'utf8');
  fs.writeFileSync(swPath, orig.replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-e2e'"));
  await sp.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  const prompt = await sp.waitForSelector('#sw-update:not(.hidden)', { timeout: 20000 }).then(() => true).catch(() => false);
  check('update prompt appears for a new release', prompt);
  await shot('91-update-prompt', false, sp);
  fs.writeFileSync(swPath, orig);

  // ---------- safety + summary
  cur = 'safety';
  const lw = await j('/__live-writes');
  check('LIVE sheet (emulated stand-in) never written', lw.liveWrites.length === 0 && lw.sheetId !== '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM');
  const all = await mails();
  const nonCode = all.filter(x => !/code/i.test(x.subject));
  check('every non-code email went to it@ only, all with [TEST]', all.every(x => /^\[TEST\]/.test(x.subject)) && nonCode.every(x => x.to === 'it@paradisecoveresortfiji.com'), all.length + ' mails: ' + [...new Set(all.map(x => x.to))].join(','));
  check('0 console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  fs.writeFileSync(S + 'results.json', JSON.stringify({ pass, fail, results, errors, mails: all.map(x => ({ to: x.to, subject: x.subject, via: x.via })) }, null, 1));
  console.log('\nSUMMARY: ' + pass + '/' + (pass + fail));
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
