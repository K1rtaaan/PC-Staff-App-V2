const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8765/';
const S = process.env.SHOTS || '/tmp/pcr-tests/shots/';
const results = [], errors = [];
let cur = '';
function check(name, cond, extra) { results.push({ name, ok: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); }
const FJ = (d, hm) => new Date(d + 'T' + hm + ':00+12:00');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read','clipboard-write'] });
  const page = await ctx.newPage();
  await page.clock.install({ time: FJ('2026-09-26', '10:00') });
  page.on('console', m => { if (m.type() === 'error') errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Wrong department' : undefined));
  const shot = (n) => page.screenshot({ path: S + n + '.png', fullPage: true });
  const shotView = (n) => page.screenshot({ path: S + n + '.png' });
  const wait = (ms) => page.waitForTimeout(ms || 700);
  const nav = async (t) => { await page.evaluate(t => navigate(t), t); await wait(900); };
  const txt = (sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, sel);
  const noSide = async (label) => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); check(label + ' no sideways scroll', r.sw <= r.cw + 1, JSON.stringify(r)); };
  async function login(email, pw) {
    cur = email;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', email); await page.fill('#login-password', pw || 'staff123');
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => state.user && state.user.email, null, { timeout: 15000 });
    await wait(1200);
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  }
  async function formFill(vals) { for (const k of Object.keys(vals)) { const sel = '#v3f-' + k; const tag = await page.evaluate(s => document.querySelector(s) && document.querySelector(s).tagName, sel); if (tag === 'SELECT') await page.selectOption(sel, vals[k]); else await page.fill(sel, vals[k]); } }
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); });
  await page.reload({ waitUntil: 'load' });

  // ---------- 1. Register + verification code overlay + department pending
  cur = 'register';
  await page.click('#tab-register'); await wait(300);
  check('register: no "@pcr.com default email" checkbox', await page.evaluate(() => !/default @pcr\.com|Use default/i.test(document.getElementById('register-panel').innerText)));
  await page.fill('#reg-firstName', 'Salote'); await page.fill('#reg-lastName', 'Naqara');
  await page.selectOption('#reg-department', 'Housekeeping');
  await page.fill('#reg-contact', '9123456');
  await page.evaluate(() => { const v = document.getElementById('reg-village'); v.value = v.options[1] ? v.options[1].value : v.value; });
  await page.fill('#reg-email', 'salote.n@paradisecoveresortfiji.com'); await page.fill('#reg-password', 'staff123'); await page.fill('#reg-password2', 'staff123');
  await page.click('#register-form button[type=submit]'); await wait(900);
  // 3.0: the code is EMAILED (demo: db.demoMail outbox) and never shown on screen
  const mail = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem(DEMO_KEY)); const m = (d.demoMail||[]).filter(x => x.to === 'salote.n@paradisecoveresortfiji.com' && x.purpose === 'verify').pop(); return m ? m.code : null; });
  const onScreen = await page.evaluate(c => !!c && document.body.innerText.indexOf(c) >= 0, mail);
  check('verification code emailed (demo outbox)', /^\d{6}$/.test(mail || ''), String(mail));
  check('verification code NOT shown on screen', !onScreen);
  check('no code overlay element in the page', await page.evaluate(() => !document.getElementById('code-overlay')));
  check('verify panel says check your email', /email/i.test(await txt('#verify-panel')));
  await shotView('flow-01-register-verify-email');
  await page.fill('#verify-code', mail || '');
  await page.click('#btn-verify'); await wait(1200);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  const loggedNew = await page.evaluate(() => state.user && state.user.email);
  if (!loggedNew) await login('salote.n@paradisecoveresortfiji.com');
  await nav('home');
  check('new user: role staff by default', await page.evaluate(() => v3RoleOf() === 'staff'));
  check('new user: department pending banner', /waiting for the HOD/i.test(await txt('#v3-dept-banner')));
  await shot('flow-02-new-staff-pending-home');
  await nav('meals');
  check('pending staff: late meal locked', /after your HOD accepts/i.test(await txt('#late-meal')));
  await page.evaluate(() => v3OpenLeaveForm()); await wait(300);
  check('pending staff: leave blocked', await page.evaluate(() => document.getElementById('modal').classList.contains('hidden')));
  // forgot password overlay
  await page.evaluate(() => doLogout()); await wait(400);
  await page.evaluate(() => showForgotPanel()); await page.fill('#forgot-email', 'ana.tui@paradisecoveresortfiji.com');
  await page.click('#btn-send-reset'); await wait(900);
  const rmail = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem(DEMO_KEY)); const m = (d.demoMail||[]).filter(x => x.to === 'ana.tui@paradisecoveresortfiji.com' && x.purpose === 'reset').pop(); return m ? m.code : null; });
  check('reset code emailed (demo outbox)', /^\d{6}$/.test(rmail || ''));
  check('reset code NOT shown on screen', !(await page.evaluate(c => !!c && document.body.innerText.indexOf(c) >= 0, rmail)));
  check('reset step asks for the emailed code', await page.evaluate(() => !document.getElementById('forgot-code-step').classList.contains('hidden')));
  await shotView('flow-03-reset-code-by-email');
  await page.click('#btn-forgot-back').catch(() => {});

  // ---------- 2. HOD accepts join requests
  await login('hod.hk@paradisecoveresortfiji.com');
  await nav('home'); await shot('hod-home');
  const bar = await txt('#v3-hodbar');
  check('HOD status bar shows join requests', /Join requests/.test(bar), bar.replace(/\n/g, ' '));
  await nav('deptstaff'); await wait(600);
  const pendTxt = await txt('#ds-pending');
  check('HOD sees Salote + Tomasi waiting', /Salote/.test(pendTxt) && /Tomasi/.test(pendTxt));
  await shot('flow-04-hod-department-staff-join-requests');
  await page.click('.v3-join[data-email="salote.n@paradisecoveresortfiji.com"][data-d="approve"]'); await wait(900);
  await page.click('.v3-join[data-email="new.staff@paradisecoveresortfiji.com"][data-d="decline"]'); await wait(900);
  check('Salote accepted into staff list', /Salote/.test(await txt('#ds-staff')));
  // dept update post
  await nav('deptupdates');
  await page.fill('#du-title', 'Linen count Friday'); await page.fill('#du-body', 'Please count linen in your villas before 3pm Friday.');
  await page.click('#du-send'); await wait(900);
  check('HOD posted a department update', /Linen count Friday/.test(await txt('#du-list')));
  // special meal order with allergy
  await nav('meals'); await shot('hod-meals');
  await page.evaluate(() => v3OpenSpecialForm()); await wait(700);
  await page.fill('#sp-name', 'Jone Tikoduadua');
  await page.fill('#sp-reason', 'Housekeeper has no phone');
  await page.fill('#sp-note', 'Peanut allergy - no nuts');
  await page.selectOption('#sp-meal', 'dinner');
  await shotView('flow-05-hod-special-meal-form');
  await page.click('#sp-send'); await wait(1000);
  await nav('special'); await wait(700);
  check('special order listed as waiting chef', /Jone Tikoduadua/.test(await txt('#sp-list')) && /waiting chef/i.test(await txt('#sp-list')));
  await nav('more'); await shot('hod-more');

  // ---------- 3. Staff: leave, likes, cancels, comments
  await login('salote.n@paradisecoveresortfiji.com');
  await nav('home');
  check('accepted staff: no pending banner', !(await txt('#v3-dept-banner')));
  check('accepted staff sees dept update', /Linen count Friday/.test(await txt('#home-deptupdates')));
  await page.click('#home-deptupdates .v3-react[data-kind="like"]'); await wait(800);
  await login('ana.tui@paradisecoveresortfiji.com');
  await nav('home'); await shot('staff-home');
  const grid = await txt('#home-myorders');
  check('home grid shows 3 meals with countdowns', /Breakfast/i.test(grid) && /Dinner/i.test(grid) && /\d+h/.test(grid));
  check('Do this now has only 4 staff tiles', await page.evaluate(() => document.querySelectorAll('#home-dothisnow .v3-tile').length === 4 && !document.getElementById('home-lead-tiles')));
  check('My Orders grid sits above Do this now', await page.evaluate(() => { const a = document.getElementById('home-myorders'), b = document.getElementById('home-dothisnow'); return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING; }));
  check('suggestion box on Home', !!(await page.$('#home-suggest')));
  await page.fill('#sug-title', 'Shade over the boat jetty'); await page.fill('#sug-body', 'A small roof for rainy mornings'); await page.click('#sug-send'); await wait(700);
  // leave
  await page.evaluate(() => v3OpenLeaveForm()); await wait(300);
  await formFill({ leaveType: 'Annual leave', startDate: '2026-10-20', endDate: '2026-10-22', reason: 'Cousin wedding in Labasa' });
  await shotView('flow-06-staff-leave-form');
  await page.click('#v3f-submit'); await wait(1000);
  await nav('leave'); await wait(600);
  check('staff leave waiting for HOD', /Cousin wedding/.test(await txt('#lv-list')) && /Waiting for HOD/.test(await txt('#lv-list')));
  await page.evaluate(() => { const b = [...document.querySelectorAll('.v3-lv-esc')].pop(); b && b.click(); }); await wait(900);
  const mails = await page.evaluate(() => (JSON.parse(localStorage.getItem(DEMO_KEY)).demoMail || []).length);
  check('Escalate sent an email (MailApp)', mails >= 1, 'mails=' + mails);
  await shot('flow-07-staff-leave-waiting-hod');
  // meals: likes / 3 cancels
  await nav('meals'); await wait(800);
  const likeBefore = await page.evaluate(() => { const b = document.querySelector('#weekly-menu details[open] .v3-vote[data-v="1"]'); return { dish: b.dataset.dish, n: Number(b.innerText.trim()) }; });
  await page.click('#weekly-menu details[open] .v3-vote[data-v="1"]'); await wait(700);
  const likeAfter = await page.evaluate(d => { const b = document.querySelector('#weekly-menu details[open] .v3-vote[data-v="1"][data-dish="' + d + '"]'); return Number(b.innerText.trim()); }, likeBefore.dish);
  check('like increments dish count', likeAfter === likeBefore.n + 1, likeBefore.dish + ' ' + likeBefore.n + '→' + likeAfter);
  await page.click('#weekly-menu details[open] .v3-vote[data-v="-1"][data-dish="' + likeBefore.dish + '"]'); await wait(700);
  check('switching to dislike moves the vote', await page.evaluate(d => Number(document.querySelector('#weekly-menu details[open] .v3-vote[data-v="1"][data-dish="' + d + '"]').innerText.trim()), likeBefore.dish) === likeBefore.n);
  // lunch: order + cancel 3x
  for (let i = 1; i <= 3; i++) {
    if (await page.$('#btn-lunch')) { const t = await page.evaluate(() => document.getElementById('btn-lunch').textContent); if (/Count me in/.test(t)) { await page.click('#btn-lunch'); await wait(900); } }
    await page.click('#btn-lunch-cancel'); await wait(400);
    check('cancel asks for a reason (' + i + ')', await page.evaluate(() => !!document.getElementById('v3f-why')));
    await page.selectOption('#v3f-why', 'Going to the mainland'); await page.click('#v3f-submit'); await wait(1100);
  }
  check('lunch locked after 3rd cancel', !!(await page.$('#lu-blocked')) && !(await page.$('#btn-lunch')));
  const r4 = await page.evaluate(() => api('placeLunchOrder', {}));
  check('server also refuses a 4th lunch order', r4 && r4.success === false && /3 times/.test(r4.error), r4 && r4.error);
  await page.evaluate(() => document.getElementById('meal-card-lunch').scrollIntoView()); await shotView('flow-08-lunch-locked-after-3-cancels');
  // dinner book
  await page.click('#btn-dinner'); await wait(900);
  check('dinner booked', /Your dinner/.test(await txt('#meal-card-dinner')));
  await page.fill('#fb-msg', 'Fish was a bit salty tonight'); await page.click('#btn-feedback'); await wait(700);
  await nav('meals'); await shot('staff-meals');
  await nav('more'); await shot('staff-more');
  check('More: no Reminders or Suggestion box for staff', !/Reminders|Suggestion/i.test(await txt('#more-root')));
  check('More: profile first, department read-only', /Department \(read-only\)/.test(await txt('#more-profile')));
  await nav('history'); await wait(900); await shot('flow-09-staff-my-history');
  check('History lists orders, leave, feedback', /Cousin wedding/.test(await txt('#hi-leave')) && /salty/.test(await txt('#hi-feedback')) && /cancel reason/i.test(await txt('#hi-orders')));

  // ---------- 4. Asst HOD approves leave (HOD step) → admin final
  await login('asst.hk@paradisecoveresortfiji.com');
  await nav('approvals'); await wait(600);
  check('assistant HOD sees Ana leave in HOD step', /Cousin wedding/.test(await txt('#ap-leave')));
  await page.evaluate(() => { const c = [...document.querySelectorAll('#ap-leave article')].find(a => /Cousin wedding/.test(a.innerText)); c.querySelector('.v3-lv-dec[data-d="approve"]').click(); }); await wait(400);
  await page.fill('#v3f-note', 'Covered by Vika'); await page.click('#v3f-submit'); await wait(1000);
  await shot('flow-10-assistant-hod-approvals');
  await login('admin@paradisecoveresortfiji.com');
  await nav('home'); await shot('admin-home');
  await nav('approvals'); await wait(700);
  check('admin sees leave in final approval', /Cousin wedding/.test(await txt('#ap-final')));
  await shot('flow-11-admin-approvals-inbox');
  await page.evaluate(() => { const c = [...document.querySelectorAll('#ap-final article')].find(a => /Cousin wedding/.test(a.innerText)); c.querySelector('.v3-lv-dec[data-d="approve"]').click(); }); await wait(400);
  await page.click('#v3f-submit'); await wait(1000);
  await login('ana.tui@paradisecoveresortfiji.com');
  await nav('leave'); await wait(700);
  const lv = await page.evaluate(() => { const c = [...document.querySelectorAll('#lv-list article')].find(a => /Cousin wedding/.test(a.innerText)); return c ? c.innerText : ''; });
  check('staff sees HOD + management approvals', /Approved/.test(lv) && /Management/.test(lv) && /Covered by Vika/.test(lv), lv.replace(/\n/g, ' | '));
  await shot('flow-12-staff-leave-approved-both-steps');
  const notes = await page.evaluate(() => api('getMyNotifications', {}).then(r => r.data.notifications.map(n => n.title).join(' | ')));
  check('staff notified at each leave step', /Leave update/.test(notes), notes);

  // ---------- 5. After 8pm: dinner locked, late meal request
  await page.clock.setSystemTime(FJ('2026-09-26', '20:30'));
  await nav('meals'); await wait(900);
  await page.click('#btn-dinner-cancel'); await wait(500);
  check('dinner cancel after 8pm → "Contact your HOD for a late meal request"', /Contact your HOD for a late meal request/.test(await txt('#dinner-closed-msg')));
  await page.evaluate(() => document.getElementById('meal-card-dinner').scrollIntoView()); await shotView('flow-13-dinner-after-8pm-contact-hod');
  await nav('home');
  check('home shows "Books closed" message', /Books closed — contact your department HOD, chef or management/.test(await txt('#home-books-closed')));
  await shotView('flow-14-home-books-closed');
  await nav('meals'); await wait(700);
  await page.selectOption('#late-slot', 'lunch|2026-09-27'); await wait(200);
  await page.fill('#late-reason', 'Arriving on the 5am boat, missed the cutoff');
  await page.fill('#late-note', 'No onions');
  await page.click('#btn-late-meal'); await wait(1000);
  const lateOk = await page.evaluate(() => (cachePeek('lunchOrders:2026-09-27') || []).some(o => o.status === 'late_pending'));
  // lunch for tomorrow is locked (3 cancels) — late request goes for... check server answer instead
  await page.selectOption('#late-slot', 'breakfast|2026-09-27').catch(() => {});
  await page.fill('#late-reason', 'Early shift, missed the cutoff'); await page.click('#btn-late-meal'); await wait(1000);
  const lateRows = await page.evaluate(() => api('getMyHistory', { from: '2026-09-25', to: '2026-09-28' }).then(r => r.data.requests.map(x => x.meal + ':' + x.status)));
  check('late meal request created (late_pending)', lateRows.some(x => /late_pending/.test(x)), lateRows.join(','));
  const hodN = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem(DEMO_KEY)); return db.notifications.filter(n => n.kind === 'late_meal').map(n => n.userEmail); });
  check('late request notified chef, admin, HOD and asst HOD', ['kitchen@paradisecoveresortfiji.com', 'admin@paradisecoveresortfiji.com', 'hod.hk@paradisecoveresortfiji.com', 'asst.hk@paradisecoveresortfiji.com'].every(e => hodN.includes(e)), hodN.join(','));

  // ---------- 6. Chef: accept special + late, kitchen list, report + roster
  await login('kitchen@paradisecoveresortfiji.com');
  await nav('home'); await shot('chef-home');
  check('chef dashboard with weekly chart', !!(await page.$('#v3-chefdash svg')));
  await nav('chefreq'); await wait(800);
  await shot('flow-15-chef-late-special-requests');
  const pendBefore = await page.evaluate(() => document.querySelectorAll('#cr-pending .v3-req[data-d="approve"]').length);
  await page.evaluate(() => { const c = [...document.querySelectorAll('#cr-pending article')].find(a => /Jone Tikoduadua/.test(a.innerText)); c.querySelector('.v3-req[data-d="approve"]').click(); }); await wait(900);
  await page.click('#cr-acc-all'); await wait(1000);
  check('Accept all cleared the queue', await page.evaluate(() => document.querySelectorAll('#cr-pending .v3-req').length === 0), 'before=' + pendBefore);
  await nav('kitchen'); await wait(1500);
  const kn = await txt('#kit-notes-card');
  check('special meal + allergy flows into kitchen notes', /Jone Tikoduadua/.test(kn) && /Peanut allergy/i.test(kn), kn.slice(0, 200).replace(/\n/g, ' '));
  await page.evaluate(() => document.getElementById('kit-notes-card').scrollIntoView()); await shotView('flow-16-kitchen-notes-with-special');
  await nav('chefcomments'); await wait(700); await shot('flow-17-chef-food-comments');
  check('chef sees staff feedback', /salty/.test(await txt('#cc-list')));
  await nav('chefmenu'); await wait(800); await shot('flow-18-chef-edit-menu-with-votes');
  await nav('chefreports'); await wait(500);
  await page.click('#rp-go'); await wait(1000);
  const csv = 'name,department,date,start,end,dayOff\n' + ['Ana Tui', 'Sami Koro', 'Vika Lesi', 'Mere Tabua', 'Jone Waqa'].map((n, i) => ['2026-09-26', '2026-09-27'].map(d => n + ',Housekeeping,' + d + ',07:00,16:00,' + (i === 4 && d === '2026-09-27' ? 'yes' : 'no')).join('\n')).join('\n') + '\n';
  fs.writeFileSync('/tmp/pcr-tests/roster-test.csv', csv);
  await page.setInputFiles('#rp-file', '/tmp/pcr-tests/roster-test.csv'); await wait(1000);
  const rep = await txt('#rp-table');
  check('report shows roster columns after upload', /Rost/.test(rep) && /Gap/.test(rep) && /26\/09\s+\S+(\s+\d+){5}\s+5\s+-?\d+/.test(rep), rep.replace(/\n/g, ' ').match(/26\/09[^\n]*/)?.[0] || rep.slice(0,200));
  await shot('flow-19-chef-report-with-roster');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#rp-csv'); const d1 = await dl;
  check('report CSV downloads', !!d1, d1 && d1.suggestedFilename());
  await nav('chef'); await shot('chef-chef');
  await nav('meals'); await shot('chef-meals');
  await nav('more'); await shot('chef-more');

  // ---------- 7. Admin tools
  await login('admin@paradisecoveresortfiji.com');
  await nav('usersv3'); await wait(900); await shot('flow-20-admin-users');
  const seatTxt = await txt('#seat-usage');
  check('users screen shows "x of N used" seat counts', /Admin\s+\d+ of 5 used/.test(seatTxt) && /Superadmin\s+\d+ of 3 used/.test(seatTxt) && /Boat manager\s+\d+ of 2 used/.test(seatTxt) && /Chef\s+\d+ of 3 used/.test(seatTxt), seatTxt.replace(/\n/g,' '));
  await page.evaluate(() => [...document.querySelectorAll('.v3-user')].find(b => /Sami Koro/.test(b.innerText)).click()); await wait(400);
  await shotView('flow-21-admin-edit-user-role-dept-asst');
  await page.check('#v3f-assistantHod'); await page.click('#v3f-submit'); await wait(900);
  check('admin set assistant HOD flag', await page.evaluate(() => JSON.parse(localStorage.getItem(DEMO_KEY)).users.find(u => u.email === 'sam.fb@paradisecoveresortfiji.com').assistantHod === true));
  await nav('migrate'); await page.click('#mg-dry'); await wait(900); await shot('flow-22-admin-role-migration-preview');
  const mg = await txt('#mg-out');
  check('migration keeps HOD + boat manager (secondary)', /hod \+ boat manager/.test(mg), mg.replace(/\n/g,' | ').slice(0,200));
  check('migration keeps assistant HOD + boat manager', /boat_manager \+ assistant HOD flag/.test(mg));
  check('migration flags HOD in department "Other"', /Pranil Rama[\s\S]*department "Other"/.test(mg));
  check('migration shows seats after migration', /of 2 used/.test(mg) && /of 5 used/.test(mg));
  check('migration: nobody loses rights', /Nobody loses rights/.test(mg));
  check('migration preview maps captain→boat manager and assistant HOD→staff+flag', /boat_captain → boat_manager/.test(await txt('#mg-out')) && /assistant_hod → staff \+ assistant HOD flag/.test(await txt('#mg-out')), (await txt('#mg-out')).replace(/\n/g, ' | ').slice(0, 300));
  await nav('reminders'); await wait(700);
  await page.click('#rm-add'); await formFill({ title: 'Fire drill Tuesday 10am', body: 'Assemble at the beach deck' }); await page.click('#v3f-submit'); await wait(900);
  check('admin added a reminder', /Fire drill/.test(await txt('#rm-list')));
  await page.evaluate(() => [...document.querySelectorAll('.v3-rm[data-a="edit"]')].find(b => /Fire drill/.test(b.closest('article').innerText)).click()); await wait(300);
  await page.fill('#v3f-title', 'Fire drill Tuesday 11am'); await page.click('#v3f-submit'); await wait(900);
  check('admin edited the reminder', /11am/.test(await txt('#rm-list')));
  await nav('adminstatus'); await page.click('#ex-go'); await wait(1000);
  check('admin status lists every report', /Meal orders/.test(await txt('#ex-list')) && /Menu likes/.test(await txt('#ex-list')) && /Leave requests/.test(await txt('#ex-list')));
  const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('.v3-ex[data-i="0"]'); const d2 = await dl2;
  check('admin export CSV downloads', !!d2, d2 && d2.suggestedFilename());
  await shot('flow-23-admin-status-reports');
  await nav('manage'); await shot('admin-manage');
  await nav('meals'); await shot('admin-meals');
  await nav('more'); await shot('admin-more');
  // staff cannot use admin actions (server checks)
  await login('ana.tui@paradisecoveresortfiji.com');
  const deny = await page.evaluate(async () => {
    const a = await api('setUserAccess', { targetEmail: 'ana.tui@paradisecoveresortfiji.com', role: 'admin' });
    const b = await api('decideMealRequest', { id: 'x', meal: 'lunch', decision: 'approve' });
    const c = await api('getDeptStaff', { department: 'Housekeeping' });
    const d = await api('getUsers', {});
    const e = await api('getChefFeedback', {});
    return [a.success, c.success, d.success, e.success];
  });
  check('staff blocked from admin / HOD / chef actions', deny.every(x => x === false), JSON.stringify(deny));

  // ---------- 8. Superadmin
  await login('it@paradisecoveresortfiji.com', '21slands');
  await nav('home'); await shot('superadmin-home');
  await nav('approvals'); await shot('superadmin-approvals');
  await nav('manage'); await shot('superadmin-manage');
  await nav('settings'); await wait(900); await shot('flow-24-superadmin-settings');
  await nav('more'); await shot('superadmin-more');
  check('superadmin nav has no staff Meals/Boat tabs', await page.evaluate(() => navItems().map(n => n.id).join(',') === 'home,approvals,manage,more'));

  console.log('\nRESULT', results.filter(r => r.ok).length + '/' + results.length, 'ERRORS', errors.length);
  errors.forEach(e => console.log(e));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
