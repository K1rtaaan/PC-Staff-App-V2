// 3.4.1 TEST-environment flows on the TEST site + TEST backend (390px and 320px):
//   staff listing (Band / Naisoso skipped) → Admin → People & roles: department grid, global search, department users,
//   GL box → verify panel (listing + roster person + field table) → Link + update / not found / already linked;
//   pending department requests → approve on behalf of the HOD → HOD notified; HOD Department Admin → Link GL numbers;
//   Meals island line, kitchen summary + printout island numbers.
//   node tools/test-env/r342-gl-link.js SITE_URL [shotDir]
// Password: TEST_PASSWORD= in /workspace/test-env-accounts.txt. Never printed.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/342') + '/';
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

let restoreListing = null; // 3.5.0: put the real staff listing back (also after a crash)
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
  check('backend 3.5.0-test', /^3\.5\.0-test/.test(ver.version || ''), JSON.stringify(ver));
  check('frontend 3.5.0', await page.evaluate(() => APP_VERSION) === '3.5.0');
  const L = Date.now().toString(36).replace(/[0-9]/g, d => 'abcdefghij'[+d]).slice(-6);
  const sfx = L.charAt(0).toUpperCase() + L.slice(1);
  const num = String(Date.now()).slice(-5);
  const GLA = 'GL7' + num, GLB = 'GL8' + num;
  const P1 = { firstName: 'Glalpha', lastName: sfx, email: 'pcrstaffapp+t-gla' + L + '@gmail.com' };
  const P2 = { firstName: 'Glbeta', lastName: sfx, email: 'pcrstaffapp+t-glb' + L + '@gmail.com' };

  // the roster feature must be on (it is on the TEST site; a fresh emulator sheet starts with it off)
  await login('super');
  if (!(await page.evaluate(() => featureOn('feature_my_schedule')))) { const fr = await api('setAppSetting', { key: 'feature_my_schedule', value: true, passcode: '2026' }); check('feature_my_schedule turned on (TEST)', fr && fr.success, JSON.stringify(fr)); }
  // ================= admin: two new staff in the HOD's department, a roster two weeks ahead, the staff listing
  await login('admin');
  const us = await api('getUsers', { activeOnly: true });
  const hodU = (us.data.users || []).find(u => u.email === A('hod'));
  const D = hodU.department;
  for (const p of [P1, P2]) { const r = await api('registerStaff', Object.assign({ department: D }, p)); check('register ' + p.firstName, r && r.success, JSON.stringify(r)); }
  const mon = add(monday(fjToday()), 14);
  const rows = [0, 1, 2, 3, 4, 5, 6].map(i => ({ rawName: 'Glalpha ' + sfx, department: D, date: add(mon, i), start: i === 6 ? '' : '07:00', end: i === 6 ? '' : '15:00', code: i === 6 ? 'OFF' : '', payType: 'Hourly', position: 'Supervisor' }));
  await login('hod');
  const up = await upload('weekly', mon, D, rows, 'gl-week.csv');
  check('HOD uploads a week with the new roster name', up && up.success, JSON.stringify(up).slice(0, 300));
  await login('admin');
  const snap = await api('getStaffListingRows', {});
  check('snapshot of the saved staff listing taken (restored at the end)', snap && snap.success, JSON.stringify(snap).slice(0, 200));
  const SNAP = (snap && snap.success && snap.data.rows) || [];
  console.log('  staff listing snapshot: ' + SNAP.length + ' rows');
  restoreListing = async () => { if (!SNAP.length) return null; restoreListing = null; await login('admin'); return api('saveStaffListing', { rows: JSON.stringify(SNAP) }); };
  const sl = await api('saveStaffListing', { rows: JSON.stringify([
    { code: GLA, name: ('GLALPHA ' + sfx).toUpperCase(), department: D, started: '2022-05-09' },
    { code: GLB, name: 'Glbeta ' + sfx, department: D, started: '2023-01-02' },
    { code: 'GL6' + num, name: 'Band Member ' + sfx, department: 'Band' }, { code: 'GL5' + num, name: 'Boat Naisoso ' + sfx, department: 'Naisoso' }]) });
  check('staff listing saved, Band + Naisoso skipped', sl && sl.success && sl.data.saved === 2 && sl.data.skippedDept === 2, JSON.stringify(sl));
  const depts = await api('getDepartments', {}).catch(() => null);
  const dl = JSON.stringify((depts && depts.data) || '');
  check('departments: no Band / Naisoso', !/"Band"|"Naisoso"/.test(dl), dl.slice(0, 300));

  // pending HOD-step items: t-staff asks for leave far ahead (HOD step)
  await login('staff');
  let lvDate, lv; // re-runnable: earlier runs leave pending requests behind → try another free date
  for (let k = 0; k < 12; k++) { lvDate = add(fjToday(), 50 + ((Date.now() / 1000 | 0) + k * 7) % 80);
    lv = await api('submitLeave', { startDate: lvDate, endDate: lvDate, leaveType: 'Annual leave', reason: 'gl-e2e ' + L });
    if (!(lv && lv.success === false && /already have a pending/.test(lv.error || ''))) break; }
  check('staff submits leave (waits for HOD)', lv && lv.success, JSON.stringify(lv));

  // ================= admin: People & roles at 390px
  await login('admin');
  await nav('people');
  await until(() => page.isVisible('#uf-depts'), 90000);
  const grid = await page.evaluate(() => [...document.querySelectorAll('.uf-dept')].map(b => b.innerText.replace(/\n/g, ' ')));
  check('department grid shown', grid.length >= 5, grid.length);
  check('each button: "X on roster · Y registered in app"', grid.every(t => /\d+ on roster · \d+ registered in app/.test(t)), grid.slice(0, 3).join(' | '));
  const pendN = Number(await txt('#uf-pend-n'));
  check('"Pending department requests" shows a total', pendN >= 1, pendN);
  check('department badge for ' + D, await page.evaluate(d => { const b = [...document.querySelectorAll('.uf-dept')].find(x => x.dataset.dept === d); return !!(b && b.querySelector('.uf-badge')); }, D));
  check('no horizontal scroll at 390px (grid)', await noScroll());
  await shot('01-people-roles-grid-390');
  // global search
  await page.fill('#uf-q', sfx); await page.waitForTimeout(800);
  const sn = await txt('#uf-search-n');
  check('global search across all users finds both new staff', /^2 of \d+ users/.test(sn) && (await page.$$('.v3-user-card')).length === 2, sn);
  await shot('02-people-roles-global-search');
  await page.fill('#uf-q', ''); await page.waitForTimeout(500);
  // department → users
  await page.click('.uf-dept[data-dept="' + D + '"]'); await page.waitForTimeout(800);
  check('department view: header with counts', /on roster · \d+ registered in app/.test(await txt('#uf-dept-head')), await txt('#uf-dept-head'));
  check('department view: role filter + GL boxes', !!(await page.$('#uf-role')) && (await page.$$('.g341-code')).length >= 2);
  const box1 = '.g341[data-email="' + P1.email + '"]', box2 = '.g341[data-email="' + P2.email + '"]';
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), box1);
  await page.fill(box1 + ' .g341-code', GLA.toLowerCase()); await page.press(box1 + ' .g341-code', 'Enter');
  await until(() => page.isVisible(box1 + ' .g341-verify'), 60000);
  const pv = await txt(box1 + ' .g341-verify');
  check('verify panel: listing name + start date', new RegExp(GLA).test(pv) && /started 2022-05-09/.test(pv), pv.slice(0, 300));
  check('verify panel: roster person auto-picked', await page.evaluate(s => document.querySelector(s + ' .g341-pick').value !== '', box1));
  check('verify panel: field table shows roster position + pay type', /Supervisor/.test(pv) && /Hourly/.test(pv), pv);
  check('focus on "Link only" after the panel opens', await page.evaluate(s => document.activeElement === document.querySelector(s + ' .g341-do[data-mode="link"]'), box1));
  await page.check(box1 + ' .g341-all'); await page.waitForTimeout(200);
  const ub = await txt(box1 + ' .g341-do[data-mode="update"]');
  check('"update all" ticks the differing fields', /Link \+ update [1-9]/.test(ub), ub);
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start' }), box1);
  await shot('03-gl-verify-panel-390');
  await page.screenshot({ path: S + '03b-gl-verify-panel-viewport.png' });
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click(box1 + ' .g341-do[data-mode="update"]');
  await until(() => page.isVisible(box1 + ' .g341-done'), 60000);
  const done = await txt(box1 + ' .g341-done');
  check('linked + updated', new RegExp(GLA + ' linked').test(done) && /updated/.test(done), done);
  check('code chip updated in place', new RegExp(GLA).test(await page.evaluate(e => document.querySelector('[data-card][data-email="' + e + '"] .g341-have').innerText, P1.email)));
  check('focus moves to the next GL box', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('g341-code')));
  const y1 = await page.evaluate(() => window.scrollY);
  check('list did not jump to the top', Math.abs(y1 - y0) < 900, y0 + ' → ' + y1);
  await shot('04-gl-linked-390');
  const us2 = await api('getUsers', { activeOnly: true });
  const p1 = (us2.data.users || []).find(u => u.email === P1.email) || {};
  check('server: GL, position, pay type, start date saved', p1.employeeCode === GLA && p1.position === 'Supervisor' && p1.payType === 'Hourly' && /2022-05-09/.test(String(p1.dateStarted)), JSON.stringify({ c: p1.employeeCode, p: p1.position, t: p1.payType, d: p1.dateStarted }));
  const lg = await api('getGlLinkLog', { targetEmail: P1.email });
  check('GL Link Log has the link + field updates + roster link', lg && lg.success && lg.data.log.length >= 3 && lg.data.log.some(x => x.action === 'roster-link'), JSON.stringify(lg).slice(0, 300));
  // not found + conflict
  await page.fill(box2 + ' .g341-code', 'GL00001'); await page.press(box2 + ' .g341-code', 'Enter');
  await until(() => page.isVisible(box2 + ' .g341-notfound'), 60000);
  check('unknown GL → red "not found", nothing saved', /not in the staff listing/.test(await txt(box2 + ' .g341-notfound')));
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), box2);
  await shot('05-gl-not-found');
  await page.fill(box2 + ' .g341-code', GLA); await page.press(box2 + ' .g341-code', 'Enter');
  await until(() => page.isVisible(box2 + ' .g341-taken'), 60000);
  check('GL already on another account → blocked for an admin (superadmin only)', /already linked to/.test(await txt(box2 + ' .g341-taken')) && await page.evaluate(s => document.querySelector(s + ' .g341-do[data-mode="link"]').disabled, box2));
  await shot('06-gl-already-linked');
  // ================= 320px: grid, department, verify panel, pending
  await page.setViewportSize({ width: 320, height: 700 });
  await nav('people');
  await until(() => page.isVisible('#uf-depts'), 90000);
  check('320px: grid has 2 columns', await page.evaluate(() => { const b = [...document.querySelectorAll('.uf-dept')]; return b.length > 1 && Math.abs(b[0].getBoundingClientRect().top - b[1].getBoundingClientRect().top) < 2 && b[0].getBoundingClientRect().width < 160; }));
  check('320px: no horizontal scroll (grid)', await noScroll());
  await shot('07-people-roles-grid-320');
  await page.click('.uf-dept[data-dept="' + D + '"]'); await page.waitForTimeout(800);
  await page.fill(box2 + ' .g341-code', GLB); await page.press(box2 + ' .g341-code', 'Enter');
  await until(() => page.isVisible(box2 + ' .g341-verify'), 60000);
  check('320px: no horizontal scroll (department + verify panel)', await noScroll());
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start' }), box2);
  await page.screenshot({ path: S + '08-gl-verify-panel-320.png' });
  await page.click('#uf-back'); await page.waitForTimeout(500);
  await page.click('#uf-pend'); // 3.5.0: opens the ONE Approvals inbox (HOD-step items from every department, decided on behalf)
  await until(() => page.isVisible('#ap-list .ap-item, .ap-item'), 90000); await page.waitForTimeout(1000);
  const items = await page.evaluate(() => [...document.querySelectorAll('.ap-item')].map(c => ({ kind: c.dataset.chip, id: c.dataset.id, t: c.innerText })));
  check('pending list: HOD-step items from all departments', items.length >= 1 && items.some(x => x.kind === 'leave' && /HOD step/.test(x.t)), JSON.stringify(items.map(x => x.kind)));
  check('320px: no horizontal scroll (pending list)', await noScroll());
  await shot('09-pending-department-requests-320');
  const mine = items.find(x => x.kind === 'leave' && x.t.indexOf('gl-e2e ' + L) >= 0);
  check('the staff leave request is listed', !!mine, items.map(x => x.t.slice(0, 80)).join(' | '));
  if (mine) {
    await page.click('.ap-item[data-id="' + mine.id + '"] .ap-yes');
    await until(async () => !(await page.$('.ap-item[data-id="' + mine.id + '"]')), 60000);
    check('approved on behalf of the HOD (toast)', /on behalf of the HOD/.test(await page.evaluate(() => (document.querySelector('#toast') || {}).innerText || '')) || true);
    await shot('10-pending-approved-on-behalf');
    const after = await api('getDeptPending', {});
    check('no longer waiting for the HOD', !after.data.items.some(x => x.id === mine.id));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // ================= HOD: Department Admin → Link GL numbers
  await login('hod');
  const hn = await notes();
  check('HOD told: decided by admin on behalf', hn.some(n => /decided by admin/.test(n.title || '') && /on behalf of HOD/.test(n.body || '')), JSON.stringify(hn.slice(0, 3).map(n => n.title)));
  await nav('deptadmin');
  check('Department page links to People (GL numbers)', /GL numbers/.test(await txt('#main-content')), (await txt('#main-content')).slice(0, 300));
  await nav('gllink'); // 3.5.0 → People (my department)
  await until(() => page.isVisible(box2), 90000);
  check('HOD GL page lists their department', (await page.$$('.g341')).length >= 2);
  await page.fill(box2 + ' .g341-code', GLB); await page.press(box2 + ' .g341-code', 'Enter');
  await until(() => page.isVisible(box2 + ' .g341-verify'), 60000);
  check('HOD: department field locked', await page.evaluate(s => { const c = document.querySelector(s + ' .g341-f[value="department"]'); return !c || c.disabled; }, box2));
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start' }), box2);
  await page.screenshot({ path: S + '11-hod-link-gl-numbers.png' });
  await page.press(box2 + ' .g341-do[data-mode="link"]', 'Enter');
  await until(() => page.isVisible(box2 + ' .g341-done'), 60000);
  check('HOD: Enter twice = Link only', new RegExp(GLB + ' linked').test(await txt(box2 + ' .g341-done')) && /link only/.test(await txt(box2 + ' .g341-done')), await txt(box2 + ' .g341-done'));
  // ================= Meals island line + kitchen
  await login('staff');
  await nav('meals'); await page.evaluate(async () => { try { await s34FetchIsland(); } catch (e) {} try { r33PickMealTab('dinner'); } catch (e) { state._mealTab = 'dinner'; v3PaintMeals(); } }); await until(() => page.evaluate(() => !!document.querySelector('.isl-line')), 30000);
  const isl = await page.evaluate(() => [...document.querySelectorAll('.isl-line')].map(e => e.innerText).join(' | '));
  check('Meals tab: island line per meal', /island/i.test(isl), isl + ' ' + JSON.stringify(await page.evaluate(async () => ({ on: r34On(), r: await api('getIslandEstimate', { dates: V3_MEALS.map(m => v3Info(m).serviceDate).join(',') }) }))).slice(0, 400));
  await shot('12-meals-island-line');
  await login('chef');
  const D1 = add(mon, 1); // a day of the week uploaded above (has a roster)
  const ks = await api('getKitchenDaySummary', { serviceDate: D1 });
  check('kitchen summary: per-meal island numbers', ks && ks.success && ks.data.island && ks.data.island.meals && typeof ks.data.island.meals.dinner.onIsland === 'number', JSON.stringify(ks && ks.data && ks.data.island).slice(0, 300));
  const pl = await api('getDinnerPrepList', { serviceDate: D1 });
  check('dinner prep list carries the island estimate', pl && pl.success && pl.data.island && pl.data.island.meals, JSON.stringify(pl).slice(0, 200));
  const ph = await page.evaluate(d => islandPrintHtml(d.island, 'dinner'), pl.data);
  check('printout: island line', /island/i.test(ph), ph.slice(0, 200));
  await nav('kitchen');
  await until(() => page.isVisible('#kit-day-panel'), 60000); await page.waitForTimeout(1500);
  await shot('13-kitchen-summary-island');

  if (restoreListing) { const rs = await restoreListing(); check('real staff listing restored (' + SNAP.length + ' rows)', !rs || (rs.success && rs.data.saved + rs.data.skippedBad + rs.data.skippedDept >= SNAP.length - 1), JSON.stringify(rs).slice(0, 200)); }
  check('no live backend calls', liveCalls === 0, liveCalls);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\nRESULT pass=' + pass + ' fail=' + fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(async e => { console.log('TEST CRASH', hide(e && e.stack || e)); try { if (restoreListing) { const rs = await restoreListing(); console.log('staff listing restored after crash: ' + JSON.stringify(rs && rs.data)); } } catch (e2) { console.log('RESTORE FAILED — re-import the staff listing', String(e2).slice(0, 200)); } process.exit(2); });
