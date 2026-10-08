// 3.4.0 (Pranav's scope addition) TEST-environment flows at 390px on the TEST site + TEST backend:
//   HOD department staff page (active / pending / roster-only) → HOD registers a staff member → one-time password email
//   (read from the TEST-only mail log) → first sign-in forces a new password → Schedule locked → "Enter my employee number"
//   → HOD approves → unlocked; "I don't know my number" → HOD enters it; HOD links from the Pending list;
//   roster change notices only to people whose shifts changed; island estimate (real archive workbook + this week);
//   staff rostered on annual leave → meal blocked → special meal request → HOD approves → chef kitchen summary + print.
//   node tools/test-env/r341-staff-links.js SITE_URL [shotDir]
// Password: TEST_PASSWORD= in /workspace/test-env-accounts.txt. Never printed (nor the one-time password).
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/341') + '/';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'pcrstaffapp+t-' + k + '@gmail.com';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + String(x).slice(0, 400) : '')); };
const fjToday = () => new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10);
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = iso => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return add(iso, w === 0 ? -6 : 1 - w); };
const hide = s => String(s).split(PW).join('***');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + hide(m.text())); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + hide(e.message)));
  page.on('dialog', d => d.accept());
  const txt = s => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async t => { await page.evaluate(t => navigate(t), t); await page.waitForTimeout(2500); };
  // 3.5.0: link requests + meals-while-away are decided in the ONE Approvals inbox (chips gl / special)
  const apOpen = async chip => { await page.evaluate(c => { state._apChip = c; navigate('approvals'); }, chip); await page.waitForTimeout(2500); };
  const apSel = chip => '.ap-item[data-chip="' + chip + '"]';
  const shot = n => page.screenshot({ path: S + n + '.png', fullPage: true });
  const api = async (a, p) => { let e0; for (let i = 0; i < 4; i++) { try { return await page.evaluate(([a, p]) => api(a, p || {}), [a, p]); } catch (e) { e0 = e; await page.waitForTimeout(3000); } } throw e0; };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(700); } return false; };
  const noScroll = async () => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); return r.sw <= r.cw + 1; };
  async function signIn(email, pw, label) {
    cur = label;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(500);
    await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.click('#login-form button[type=submit]');
  }
  async function login(key) {
    await signIn(A(key), PW, key);
    let ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000);
    if (!ok && await page.isVisible('#login-email')) { await page.fill('#login-email', A(key)); await page.fill('#login-password', PW); await page.click('#login-form button[type=submit]'); ok = await until(() => page.evaluate(() => !!(state.user && state.user.email)), 60000); }
    check('login t-' + key, ok);
    await page.waitForTimeout(2000);
    await page.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(id => { const b = document.getElementById(id); if (b) b.click(); }); try { closeModal(); } catch (e) {} });
    return ok;
  }
  async function upload(kind, key, dept, rows, name) {
    const st = await api('rosterUploadStart', { kind, periodKey: key, department: dept, fileName: name || 'e2e.csv', fileType: 'csv', layout: 'rows', totalRows: rows.length, logArea: 'dept' });
    if (!st || !st.success) return st;
    const ch = await api('rosterUploadChunk', { uploadId: st.data.uploadId, chunkIndex: 0, shifts: rows });
    if (!ch || !ch.success) return ch;
    return api('rosterUploadFinish', { uploadId: st.data.uploadId, logArea: 'dept' });
  }
  const notes = async () => { const r = await api('getMyNotifications', {}); const d = (r && r.data) || {}; return d.notifications || d.items || []; };

  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  const ver = await api('getVersion', {});
  check('backend 3.5.2-test', /^3\.5\.2-test/.test(ver.version || ''), JSON.stringify(ver));
  const ts = Date.now().toString(36).slice(-5);
  const NEW = 'pcrstaffapp+t-n' + ts + '@gmail.com', NEWPW = PW + 'N1';

  // re-runnable: decline link requests left open by an earlier (crashed) run of this suite (TEST accounts t-n…)
  await login('admin');
  for (const it of (((await api('getDeptPending', {})).data || {}).items || [])) if (it.kind === 'link' && /\+t-n/.test(it.userEmail)) await api('decideOnBehalf', { kind: 'link', id: it.id, decision: 'decline' });
  // ================= HOD: department staff page + register a staff member
  await login('hod');
  const hodDept = await page.evaluate(() => state.user.department);
  await nav('peoplelinks');
  await until(() => page.isVisible('#ds-counts'), 90000);
  const counts = await txt('#ds-counts');
  console.log('  ' + hodDept + ':', counts.replace(/\n/g, ' '));
  check('department staff page: Active / Pending / Roster-only / Requests counts', /Active \d+/.test(counts) && /Pending \d+/.test(counts) && /Roster-only \d+/.test(counts), counts);
  check('HOD sees only their own department (no department picker)', !(await page.$('#ds-dept')));
  check('no horizontal scroll at 390px', await noScroll());
  await shot('01-hod-dept-staff');
  await page.fill('#ds-fn', 'Test'); await page.fill('#ds-ln', 'Newstaff ' + ts); await page.fill('#ds-email', NEW);
  await page.click('#ds-reg');
  await until(() => page.isVisible('#ds-reg-done'), 90000);
  const reg = await txt('#ds-reg-done');
  check('HOD registers a staff member → login emailed', /registered/.test(reg) && /Login emailed/.test(reg), reg);
  await shot('02-hod-registered-staff');
  // ================= one-time password from the TEST mail log (superadmin only; never printed)
  await login('super');
  let temp = '';
  await until(async () => { const r = await api('testMailLog', { to: NEW }); const m = ((r && r.data && r.data.mails) || []).find(x => /One-time password: (\S+)/.test(x.body)); if (m) temp = m.body.match(/One-time password: (\S+)/)[1]; return !!temp; }, 60000);
  check('login email (TEST mail log) has a one-time password', !!temp);
  // ================= first sign-in → choose a password
  await signIn(NEW, temp, 'new');
  await until(() => page.isVisible('#fp-new'), 60000);
  check('first sign-in asks for a new password', await page.isVisible('#fp-new'));
  await shot('03-new-staff-choose-password');
  await page.fill('#fp-new', NEWPW); await page.fill('#fp-new2', NEWPW); await page.click('#fp-save');
  const inApp = await until(() => page.evaluate(() => !!(state.user && state.user.email)), 60000);
  check('new password saved → signed in', inApp);
  await page.waitForTimeout(2000); await page.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(id => { const b = document.getElementById(id); if (b) b.click(); }); try { closeModal(); } catch (e) {} });
  check('one-time password no longer works', (await api('login', { email: NEW, password: temp })).success === false);
  // ================= Schedule locked → enter my number
  await nav('schedule');
  await until(() => page.isVisible('#s34-lock'), 60000);
  check('Schedule locked for an unlinked account', await page.isVisible('#s34-lock'));
  check('lock screen offers both options', await page.isVisible('#s34-send-code') && await page.isVisible('#s34-ask-code'));
  await shot('04-staff-schedule-locked');
  const CODE1 = 'GLT9' + String(Date.now() % 90000 + 10000); // 3.5.0: 5 digits — 2-digit codes collided with accounts left by earlier runs ("already used by another account")
  await page.fill('#s34-code', CODE1); await page.click('#s34-send-code');
  await until(() => page.isVisible('#s34-lock-pending'), 60000);
  check('request pending, shown on the lock screen', /Waiting for your HOD/.test(await txt('#s34-lock-pending')), await txt('#s34-lock'));
  await shot('05-staff-link-pending');
  // ================= HOD approves from the department staff page
  await login('hod');
  const hn = await notes();
  check('HOD notified of the link request', hn.some(n => /Schedule link to approve/.test(n.title) && n.body.indexOf(CODE1) >= 0), JSON.stringify(hn.slice(0, 3)).slice(0, 300));
  await nav('peoplelinks');
  await until(() => page.isVisible('#ds-reqs'), 90000);
  check('People › Roster links points to Approvals › GL links', /Approvals/.test(await txt('#ds-reqs')));
  await apOpen('gl');
  await until(() => page.isVisible(apSel('gl')), 90000);
  await shot('06-hod-link-request');
  check('GL request card has the code prefilled', (await page.$eval(apSel('gl') + ' .ap-code', e => e.value)) === CODE1);
  await page.click(apSel('gl') + ' .ap-yes');
  await until(async () => !(await page.$(apSel('gl'))), 90000);
  await nav('peoplelinks'); await until(() => page.isVisible('#ds-counts'), 90000);
  const act = await txt('#ds-active') + ' ' + await txt('#ds-pending');
  check('linked account now has the code', act.indexOf(CODE1) >= 0, act.slice(0, 300));
  // ================= staff: unlocked + notified
  await signIn(NEW, NEWPW, 'new');
  await until(() => page.evaluate(() => !!(state.user && state.user.email)), 60000); await page.waitForTimeout(1500);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  const sn = await notes();
  check('staff notified "Your schedule is unlocked"', sn.some(n => /unlocked/i.test(n.title)), JSON.stringify(sn.slice(0, 3)).slice(0, 300));
  await nav('schedule');
  await until(async () => !!(await page.$('#sch-body')) && !(await page.$('#s34-lock')) && !/Loading/.test(await txt('#sch-body')), 60000);
  check('Schedule unlocked after approval', !(await page.$('#s34-lock')));
  await shot('07-staff-schedule-unlocked');
  // ================= "I don't know my number" → HOD enters it
  await login('admin');
  await api('setEmployeeCode', { targetEmail: NEW, code: '' });
  await signIn(NEW, NEWPW, 'new');
  await until(() => page.evaluate(() => !!(state.user && state.user.email)), 60000); await page.waitForTimeout(1500); await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await nav('schedule'); await until(() => page.isVisible('#s34-ask-code'), 60000);
  await page.click('#s34-ask-code');
  await until(() => page.isVisible('#s34-lock-pending'), 60000);
  check('"I don\'t know my number" request pending', /will enter your employee number/.test(await txt('#s34-lock-pending')));
  await login('hod');
  await apOpen('gl'); await until(() => page.isVisible(apSel('gl')), 90000);
  const CODE2 = 'GLT8' + String(Date.now() % 90000 + 10000);
  await page.fill(apSel('gl') + ' .ap-code', CODE2); await page.click(apSel('gl') + ' .ap-yes');
  await until(async () => !(await page.$(apSel('gl'))), 90000);
  await login('admin');
  const u2 = (((await api('getUsers', { activeOnly: false })).data || {}).users || []).find(x => x.email === NEW) || {};
  check('HOD entered the number → saved', u2.employeeCode === CODE2, u2.employeeCode);
  // ================= HOD links from the Pending list (no request)
  await api('setEmployeeCode', { targetEmail: NEW, code: '' });
  await login('hod');
  await nav('peoplelinks'); await until(() => page.isVisible('#ds-pending'), 90000);
  const row = '.ds-person[data-email="' + NEW + '"]';
  await until(() => page.isVisible(row + ' .ds-code'), 20000);
  await page.fill(row + ' .ds-code', CODE1); await shot('08-hod-link-from-pending'); await page.click(row + ' .ds-link');
  await until(async () => (await txt('#ds-active') + await txt('#ds-pending')).indexOf(CODE1) >= 0, 90000);
  check('HOD links a pending account with the employee number', (await txt('#ds-active') + await txt('#ds-pending')).indexOf(CODE1) >= 0);

  // ================= roster change notices: a HOD re-upload notifies only people whose shifts changed
  const today = fjToday(), mon3 = add(monday(today), 21);
  const wk = (wedStart) => [0, 1, 2, 3, 4, 5, 6].flatMap(i => [
    { rawName: 'TEST Staff', employeeCode: 'GLT901', department: hodDept, date: add(mon3, i), start: i === 2 ? wedStart : '08:00', end: i === 2 ? (wedStart === '08:00' ? '16:00' : '18:00') : '16:00' },
    { rawName: 'TEST AsstHOD', employeeCode: 'GLT903', department: hodDept, date: add(mon3, i), start: '09:00', end: '17:00' }]);
  let up1 = await upload('weekly', mon3, hodDept, wk('08:00'), 'week-a.csv');
  check('HOD weekly upload (by employee code)', up1 && up1.success && up1.data.people === 2, JSON.stringify(up1).slice(0, 300));
  let up2 = await upload('weekly', mon3, hodDept, wk('10:00'), 'week-b.csv');
  const chg = (up2 && up2.data && up2.data.changedEmails) || [];
  check('mid-week re-upload: only the changed person is notified', up2 && up2.success && chg.length === 1 && chg[0] === A('staff').toLowerCase(), JSON.stringify(up2 && up2.data).slice(0, 300));
  await login('staff');
  const stn = (await notes()).find(n => /Your roster changed/.test(n.title) && up2 && up2.data && n.relatedId === up2.data.uploadId);
  check('the notice says what changed (Wed 10:00)', !!stn && /Wed .*10:00/.test(stn.body), JSON.stringify(stn));

  // ================= island estimate + meal block on leave + special meal request
  const dates = await page.evaluate(() => ['breakfast', 'lunch', 'dinner'].map(m => v3Info(m).serviceDate));
  const D = dates[2];
  await login('hod');
  const thisMon = monday(D);
  const wk2 = [0, 1, 2, 3, 4, 5, 6].flatMap(i => { const d = add(thisMon, i), lv = dates.indexOf(d) >= 0;
    return [{ rawName: 'TEST Staff', employeeCode: 'GLT901', department: hodDept, date: d, start: lv ? '' : '08:00', end: lv ? '' : '16:00', code: lv ? 'AL' : '' },
      { rawName: 'TEST AsstHOD', employeeCode: 'GLT903', department: hodDept, date: d, start: i === 6 ? '' : '09:00', end: i === 6 ? '' : '17:00', code: i === 6 ? 'OFF' : '', dayOff: i === 6 }]; });
  const up3 = await upload('weekly', thisMon, hodDept, wk2, 'this-week.csv');
  check('this week: t-staff on annual leave on the meal dates', up3 && up3.success, JSON.stringify(up3).slice(0, 200));
  const est = await api('getIslandEstimate', { dates: D });
  const e0 = est.data.estimates[0];
  console.log('  estimate ' + D + ': on island ~' + e0.onIsland + ', off ' + e0.offIsland + ', dinner orders ' + e0.orders.dinner);
  check('estimate: t-staff (annual leave) off island, t-asst on', e0.offIsland >= 1 && e0.onIsland >= 1, JSON.stringify(e0));
  const real = (await api('getIslandEstimate', { dates: '2026-08-26,2026-08-30' })).data.estimates;
  console.log('  real archive workbook (we 30 Aug): ' + real.map(x => x.date + ' on ~' + x.onIsland + ' / off ' + x.offIsland).join(' · '));
  check('estimate from the real archive workbook (names without accounts counted too)', real.every(x => x.onIsland > 50), JSON.stringify(real));
  await login('staff');
  for (const x of (((await api('getSpecialMeals', {})).data || {}).requests || [])) if (/auto-test/.test(x.reason) && (x.status === 'pending' || x.status === 'approved')) await api('cancelSpecialMeal', { id: x.id }); // re-runnable
  await api('cancelMealOrder', { meal: 'dinner', serviceDate: D }).catch(() => null); // re-runnable: an order left by the smoke / r330 run would hide the rostered-off card
  await page.reload({ waitUntil: 'load' }); await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000); await page.waitForTimeout(1500); // drop the phone's saved copy of that order
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await nav('meals');
  await page.evaluate(() => { try { r33PickMealTab('dinner'); } catch (e) { state._mealTab = 'dinner'; v3PaintMeals(); } });
  await until(() => page.isVisible('#s34-off-dinner'), 60000);
  const offTxt = await txt('#s34-off-dinner');
  check('Meals: staff rostered on leave sees "You are rostered off on …"', /You are rostered off/.test(offTxt), offTxt || await txt('#meal-panel'));
  check('Meals: orders vs estimated staff on island line', /orders vs ~\d+ staff on island/.test(await txt('#isl-dinner')), await txt('#isl-dinner'));
  const blocked = await api('placeDinnerOrder', { mealChoice: 'Standard' });
  check('server refuses the normal order (rostered off)', blocked && blocked.success === false && blocked.rosteredOff === true, JSON.stringify(blocked));
  await shot('09-staff-meal-blocked-on-leave');
  await page.click('.s34-sp-btn'); await until(() => page.isVisible('#s34-sp-reason'), 10000);
  await page.click('#s34-sp-send'); await page.waitForTimeout(800);
  check('reason required', await page.isVisible('#s34-sp-reason'));
  await page.fill('#s34-sp-reason', '[auto-test] staying on the island during leave');
  await shot('10-staff-special-meal-request');
  await page.click('#s34-sp-send');
  await until(() => page.isVisible('.s34-sp-status'), 60000);
  check('special meal request pending', /pending/.test(await txt('.s34-sp-status')), await txt('#s34-off-dinner'));
  await login('hod');
  const hn2 = await notes();
  check('HOD notified of the special meal request', hn2.some(n => /Special meal request/.test(n.title)));
  await apOpen('special'); await until(() => page.isVisible(apSel('special')), 90000);
  await shot('11-hod-special-meal-approve');
  await page.click(apSel('special') + ' .ap-yes'); await page.waitForTimeout(5000);
  await login('chef');
  const ks = await api('getKitchenDaySummary', { serviceDate: D });
  const spd = (ks.data.dinner.specialMeals || []);
  check('kitchen summary: approved special meal listed', spd.some(x => /auto-test/.test(x.reason)), JSON.stringify(ks.data.dinner.specialMeals));
  check('kitchen summary: island estimate', ks.data.island && ks.data.island.onIsland >= 1, JSON.stringify(ks.data.island));
  const ph = await page.evaluate(d => specialMealsPrintHtml(d.dinner.specialMeals) + kitPrepDataFor(d).specialMeals.length, ks.data);
  check('printout / PDF: "Meals while away" section (3.5.0 name)', /Meals while away \(1/.test(ph) && /auto-test/.test(ph), ph.slice(0, 200));
  await nav('kitchen');
  await until(() => page.isVisible('#kit-day-panel'), 60000);
  if (await page.$('.kit-day-chip[data-date="' + D + '"]')) await page.click('.kit-day-chip[data-date="' + D + '"]');
  await until(() => page.isVisible('#kit-day-special'), 60000);
  check('chef kitchen summary shows the special meal + "orders vs staff on island"', /auto-test/.test(await txt('#kit-day-special')) && /staff on island/.test(await txt('#kit-day-panel')), await txt('#kit-day-panel'));
  await shot('12-chef-kitchen-special-meals');
  // tidy: t-staff back to a normal week (no leave) so the TEST meals are open again for manual testing
  await login('hod');
  const up4 = await upload('weekly', thisMon, hodDept, wk2.map(r => r.code === 'AL' ? Object.assign({}, r, { start: '08:00', end: '16:00', code: '' }) : r), 'this-week-tidy.csv');
  check('tidy: this week re-uploaded without leave', up4 && up4.success);

  check('no live backend calls', liveCalls === 0, liveCalls);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\nRESULT pass=' + pass + ' fail=' + fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', hide(e && e.stack || e)); process.exit(2); });
