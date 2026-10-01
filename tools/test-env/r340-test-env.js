// 3.4.0 TEST-environment flows at 390px on the TEST site + TEST backend:
//   departments (Front Office, Stores), admin uploads a whole-resort workbook (real PCR layout) on Rosters → staff Schedule,
//   possible-duplicate week, HOD weekly override for their department, unmatched → link → re-upload keeps the link,
//   staff Today / countdown / report-back / balances, leave from the Schedule tab → HOD approves,
//   superadmin archive: a real roster workbook + a small synthetic month whose A/L counts as leave used.
//   employee codes: admin imports a synthetic staff listing (preview, manual link, confirm), edits a code; a CSV with codes matches by code.
//   node tools/test-env/r340-test-env.js SITE_URL [shotDir] [realRosterFile]
// Password: TEST_PASSWORD= in /workspace/test-env-accounts.txt (or env TEST_PASSWORD). Never printed.
// Real roster files are real staff data: they are only ever uploaded to the TEST sheet (archive).
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs'), path = require('path');
const XLSX = require(process.env.XLSX_JS || '/workspace/tools-xlsx/xlsx.full.min.js');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/340') + '/';
const REAL = process.argv[4] || '/workspace/rosters-real/Aug 26/ROSTER WE 30TH AUGUST 2026.xlsx';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'groupit.paradisecoveresortfiji+t-' + k + '@gmail.com';
const TMP = '/tmp/r340-files/'; fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + String(x).slice(0, 400) : '')); };
// ---- dates (Fiji)
const fjToday = () => new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10);
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = iso => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return add(iso, w === 0 ? -6 : 1 - w); };
const serial = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000) + 25569;
const MN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const weName = (mon, pre) => (pre || 'Roster we ') + String(+add(mon, 6).slice(8)).padStart(2, '0') + ' ' + MN[+add(mon, 6).slice(5, 7) - 1] + ' ' + add(mon, 6).slice(2, 4) + '.xlsx';
const fr = hm => { const [h, m] = hm.split(':').map(Number); return (h * 60 + m) / 1440; };
/** a workbook in the real PCR layout: one sheet per department, Mon–Sun Start/End pairs in B–O, 4-row blocks */
function workbook(file, mon, people, opts) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Week ending'], [add(mon, 6)]]), 'Summary');
  const by = {}; people.forEach(p => (by[p.sheet] = by[p.sheet] || []).push(p));
  Object.keys(by).forEach(sheet => {
    const dates = [0, 1, 2, 3, 4, 5, 6].map(i => serial(add(opts && opts.sheetDatesFrom ? opts.sheetDatesFrom : mon, i)));
    const aoa = [[sheet.toUpperCase()], ['', 'Mon', '', 'Tues', '', 'Wed', '', 'Thurs', '', 'Fri', '', 'Sat', '', 'Sun', ''], [''].concat(...dates.map(d => [d, ''])), [''].concat(...dates.map(() => ['Start', 'End']))];
    by[sheet].forEach(p => {
      aoa.push([p.name].concat(...p.days.map(d => [d.label || '', ''])));
      aoa.push(['Hourly'].concat(...p.days.map(d => d.s ? [fr(d.s), fr(d.e)] : ['', ''])));
      aoa.push([p.role || 'Staff'].concat(...p.days.map(d => d.s2 ? [fr(d.s2), fr(d.e2)] : ['', ''])));
      aoa.push(['day total']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  });
  fs.writeFileSync(TMP + file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return TMP + file;
}
const W = (s, e, label) => ({ s, e, label }), OFF = { label: 'DAY OFF' }, AL = { label: 'ANNUAL LEAVE' };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  const txt = s => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async t => { await page.evaluate(t => navigate(t), t); await page.waitForTimeout(2500); };
  const shot = n => page.screenshot({ path: S + n + '.png', fullPage: true });
  const api = async (a, p) => { let e0; for (let i = 0; i < 4; i++) { try { return await page.evaluate(([a, p]) => api(a, p || {}), [a, p]); } catch (e) { e0 = e; await page.waitForTimeout(3000); } } throw e0; };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(700); } return false; };
  const noScroll = async () => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); return r.sw <= r.cw + 1; };
  async function login(key) {
    cur = key;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForTimeout(500);
    await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', PW);
    await page.click('#login-form button[type=submit]');
    let ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000);
    if (!ok && await page.isVisible('#login-email')) { await page.fill('#login-email', A(key)); await page.fill('#login-password', PW); await page.click('#login-form button[type=submit]'); ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000); }
    check('login t-' + key, ok);
    await page.waitForTimeout(2000);
    await page.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(id => { const b = document.getElementById(id); if (b) b.click(); }); try { closeModal(); } catch (e) {} });
    return ok;
  }
  const upload = async (files, btn, resultSel, ms) => {
    await until(() => page.isVisible('#r34-file'), 60000);
    await page.setInputFiles('#r34-file', files);
    await until(() => page.isVisible(btn), 90000);
    const prev = await txt('#r34-prev');
    await page.click(btn);
    await until(async () => /shifts for|not uploaded|Stopped/.test(await page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : ''; }, resultSel)), ms || 240000);
    await page.waitForTimeout(1200);
    return { prev, result: await page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText || e.textContent : ''; }, resultSel) };
  };

  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  const ver = await api('getVersion', {});
  check('backend 3.4.1-test', /^3\.4\.1-test/.test(ver.version || ''), JSON.stringify(ver));
  check('frontend 3.4.1', await page.evaluate(() => APP_VERSION) === '3.4.1');
  await until(() => page.evaluate(() => PCR_DEPARTMENTS.indexOf('Stores') >= 0), 30000);
  const dl = await api('getDepartments', {});
  check('departments (server) include Front Office + Stores, once each', ['Front Office', 'Stores'].every(d => dl.data.departments.filter(x => x === d).length === 1), JSON.stringify(dl));
  check('sign-up department list includes Front Office + Stores', await page.evaluate(() => PCR_DEPARTMENTS.indexOf('Front Office') >= 0 && PCR_DEPARTMENTS.indexOf('Stores') >= 0 && PCR_DEPARTMENTS.indexOf('Stores') < PCR_DEPARTMENTS.indexOf('Other')));

  // ================= admin: people + whole-resort workbook for next week
  await login('admin');
  const unm0 = await api('getRosterUnmatched', {});
  const people = (unm0.data && unm0.data.people) || [];
  const P = k => people.find(p => p.email.toLowerCase() === A(k).toLowerCase());
  const st = P('staff'), hod = P('hod'), boat = P('boat'), chef = P('chef'), asst = P('asst');
  check('test people found (staff, hod, boat, chef)', st && hod && boat && chef, JSON.stringify(people.map(p => p.department)));
  // re-runnable: drop the chef link a previous run saved, so "First I" is unmatched again
  for (const l of (unm0.data && unm0.data.links) || []) if (chef && String(l.userEmail).toLowerCase() === A('chef').toLowerCase()) await api('unlinkRosterName', { id: l.id });
  console.log('  people:', [st, hod, asst, boat, chef].filter(Boolean).map(p => p.name + ' · ' + p.department).join(' | '));
  const today = fjToday(), mon1 = add(monday(today), 7), mon2 = add(mon1, 7);
  const sheetOf = d => d === 'Housekeeping' ? 'Houskeeping' : d.replace(/[\\/?*:\[\]]/g, ' '); // real misspelt sheet name; '/' is not allowed in sheet names
  const first = n => n.split(' ')[0];
  const stDays = [W('07:00', '15:00', 'AM'), W('07:00', '15:00', 'AM'), OFF, OFF, W('14:00', '22:00', 'PM'), W('07:00', '15:00', 'TRAINING'), W('07:00', '15:00')];
  const wbPeople = [
    { name: st.name, sheet: sheetOf(st.department), days: stDays },
    { name: hod.name, sheet: sheetOf(hod.department), days: [W('06:00', '14:00'), W('06:00', '14:00'), W('06:00', '14:00'), W('06:00', '14:00'), W('06:00', '14:00'), OFF, OFF] },
    { name: boat.name, sheet: sheetOf(boat.department), days: [W('06:30', '10:30', 'PICK UP/DROP OFF CAPT'), W('06:30', '10:30'), { label: 'RDO' }, W('06:30', '10:30'), W('06:30', '10:30'), W('06:30', '10:30'), { label: 'SDD' }] },
    { name: first(chef.name) + ' ' + chef.name.split(' ').slice(-1)[0][0], sheet: sheetOf(chef.department), days: [W('05:00', '13:00'), W('05:00', '13:00'), W('05:00', '13:00'), OFF, OFF, W('05:00', '13:00'), W('05:00', '13:00')] }, // first name + initial → unmatched
    { name: 'Malelili Testperson', sheet: 'Stores', days: [{ label: 'ON' }, { label: 'ON' }, { label: 'ON' }, { label: 'ON' }, { label: 'OFF' }, { label: 'OFF' }, { label: 'ON' }] }
  ];
  const f1 = workbook(weName(mon1), mon1, wbPeople, { sheetDatesFrom: add(mon1, -7) }); // sheets still dated the week before (real quirk)
  await nav('rostermonthly');
  await until(() => page.isVisible('#r34-weeks-card'), 60000);
  check('Rosters page: whole-resort weeks card', await page.isVisible('#r34-weeks-card'));
  let u = await upload([f1], '#r34-send-many', '#r34-many-result .r34-result');
  check('preview: workbook week from the file name + stale-dates warning', /Week /.test(u.prev) && /dated another week|read Mon–Sun/.test(u.prev), u.prev);
  const nDept = new Set(wbPeople.map(p => p.sheet)).size;
  check('preview: ' + nDept + ' departments, 5 people, 35 entries', new RegExp(nDept + ' departments · 5 people · 35 entries').test(u.prev), u.prev);
  check('upload: saved for all departments', /all departments saved/.test(u.result) && /shifts for 3 people/.test(u.result), u.result);
  check('upload: first name + initial and unknown names → unmatched', /2 names not matched/.test(u.result), u.result);
  check('no horizontal scroll at 390px', await noScroll());
  await shot('01-admin-whole-resort-upload');
  // the same shifts again for the week after → possible duplicate
  const f2 = workbook(weName(mon2), mon2, wbPeople);
  u = await upload([f2], '#r34-send-many', '#r34-many-result .r34-result');
  check('second week with identical shifts → "possible duplicate"', /Possible duplicate/.test(u.result), u.result);
  await shot('02-admin-possible-duplicate');

  // ================= unmatched: link the chef's "First I" name (admin) → re-upload keeps it
  await nav('rosterunmatched');
  await until(async () => (await txt('#main-content')).indexOf(first(chef.name)) >= 0, 60000);
  const unm = (await api('getRosterUnmatched', {})).data.unmatched.filter(x => x.rawName.indexOf(first(chef.name)) === 0);
  check('chef "First I" unmatched with the chef suggested', unm.length && unm[0].suggestions.some(s => s.email.toLowerCase() === A('chef').toLowerCase()), JSON.stringify(unm[0] || {}).slice(0, 300));
  if (unm.length) {
    for (const x of unm) { await page.selectOption('.r34-pick[data-id="' + x.id + '"]', { value: unm[0].suggestions.find(s => s.email.toLowerCase() === A('chef').toLowerCase()).email }); await page.click('.r34-link[data-id="' + x.id + '"]'); await page.waitForTimeout(6000); }
  }
  await shot('03-unmatched-linked');
  const links = (await api('getRosterUnmatched', {})).data.links || [];
  check('saved link for the chef', links.some(l => l.userEmail.toLowerCase() === A('chef').toLowerCase()));
  await nav('rostermonthly');
  u = await upload([f2], '#r34-send-many', '#r34-many-result .r34-result');
  check('re-upload: the linked name is matched (4 people now)', /shifts for 4 people/.test(u.result) && /1 names? not matched/.test(u.result), u.result);

  // ================= employee codes (admin): import a synthetic staff listing → preview → manual link → confirm; edit one code
  cur = 'empcodes';
  const KEYS = ['staff', 'hod', 'asst', 'chef', 'boat', 'admin', 'super'];
  for (const k of KEYS) await api('setEmployeeCode', { targetEmail: A(k), code: '' }); // re-runnable: start with no codes
  const allU = ((await api('getUsers', { activeOnly: false })).data || {}).users || [];
  const U = k => allU.find(x => String(x.email).toLowerCase() === A(k).toLowerCase()) || {};
  const nm = x => [x.firstName, x.lastName].filter(Boolean).join(' ') || x.name || '';
  const CODE = { staff: 'GLT901', hod: 'GLT902', asst: 'GLT903', chef: 'GLT904', boat: 'GLT905', admin: 'GLT906', super: 'GLT907' };
  const lwb = XLSX.utils.book_new();
  const lrows = [['PARADISE COVE RESORT — STAFF LISTING (TEST)'], ['New Code', 'Name', 'Date Started', 'Department']];
  KEYS.forEach(k => { const x = U(k); lrows.push([CODE[k], k === 'chef' ? first(nm(x)) + ' ' + nm(x).split(' ').slice(-1)[0][0] : nm(x), '01/02/2024', x.department || '']); }); // chef: "First I" → manual link
  lrows.push(['GLT908', 'Malelili Testperson', '03/04/2025', 'Stores']); // no account
  XLSX.utils.book_append_sheet(lwb, XLSX.utils.aoa_to_sheet(lrows), 'Staff Listing');
  fs.writeFileSync(TMP + 'TEST staff listing.xlsx', XLSX.write(lwb, { type: 'buffer', bookType: 'xlsx' }));
  await nav('empcodes');
  await until(() => page.isVisible('#ec-file'), 60000);
  await page.setInputFiles('#ec-file', TMP + 'TEST staff listing.xlsx');
  await until(() => page.isVisible('#ec-preview'), 90000);
  const rate = await txt('#ec-rate');
  const autoN = await page.$$eval('.ec-ok:checked', l => l.length);
  console.log('  preview:', rate);
  check('preview: 8 codes, 6 auto-matched by name + department', /of 8 match/.test(rate) && autoN === 6, rate + ' · ticked ' + autoN);
  check('preview: the chef ("First I") goes to manual linking', await page.$('.ec-pick[data-code="GLT904"]') !== null);
  check('preview: chef ("First I") + the unknown listing name have no automatic account', /2 without an account/.test(rate), rate);
  await page.evaluate(() => { const d = document.getElementById('ec-unm'); if (d) d.open = true; });
  if (await page.$('.ec-pick[data-code="GLT904"]')) await page.selectOption('.ec-pick[data-code="GLT904"]', { value: U('chef').email });
  check('no horizontal scroll at 390px', await noScroll());
  await shot('10-admin-empcodes-preview');
  await page.click('#ec-apply');
  await until(() => page.isVisible('#ec-done'), 90000);
  const done = await txt('#ec-done');
  check('confirm: 7 codes saved (6 matched + 1 manual link)', /7 codes saved/.test(done), done);
  await shot('11-admin-empcodes-saved');
  const allU2 = ((await api('getUsers', { activeOnly: false })).data || {}).users || [];
  const codeOf = k => (allU2.find(x => String(x.email).toLowerCase() === A(k).toLowerCase()) || {}).employeeCode;
  check('codes stored on the TEST users', KEYS.every(k => codeOf(k) === CODE[k]), JSON.stringify(KEYS.map(k => k + '=' + codeOf(k))));
  // edit one code from Users → edit
  await nav('usersv3');
  await until(() => page.isVisible('#uf-q'), 60000);
  await page.fill('#uf-q', A('boat')); await page.waitForTimeout(800);
  await page.click('.v3-user[data-email="' + U('boat').email + '"]');
  await until(() => page.isVisible('#eu3-code'), 20000);
  check('edit user shows the code', (await page.inputValue('#eu3-code')) === 'GLT905');
  await page.fill('#eu3-code', 'glt-915');
  await shot('12-admin-edit-code');
  await page.click('#eu3-save'); await page.waitForTimeout(6000);
  const allU3 = ((await api('getUsers', { activeOnly: false })).data || {}).users || [];
  check('admin edits the code (normalised GLT915)', (allU3.find(x => String(x.email).toLowerCase() === A('boat').toLowerCase()) || {}).employeeCode === 'GLT915');
  const dupe = await api('setEmployeeCode', { targetEmail: A('boat'), code: 'GLT901' });
  check('a code cannot be on two people', dupe && dupe.success === false, JSON.stringify(dupe));
  await api('setEmployeeCode', { targetEmail: A('boat'), code: CODE.boat });

  // ================= HOD weekly override (own department, CSV rows)
  await login('hod');
  // 3.4.0: the CSV has an Employee code column and a nickname instead of the account name → matched by code first
  const csv = 'Employee code,Name,Department,Date,Start,End,Day off,Code,Notes\n' + [0, 1, 2, 3, 4, 5, 6].map(i => ['GLT901', 'Nickname ' + first(st.name), hod.department, add(mon1, i), i === 3 ? '' : '08:00', i === 3 ? '' : '16:00', i === 3 ? 'yes' : '', i === 4 ? 'A/L' : '', ''].join(',')).join('\n');
  const sameDept = st.department === hod.department;
  fs.writeFileSync(TMP + 'hod-week.csv', csv);
  await nav('rosterweekly');
  await until(() => page.isVisible('.r34-per[data-k="' + mon1 + '"]'), 60000);
  await page.click('.r34-per[data-k="' + mon1 + '"]'); await page.waitForTimeout(3000);
  await until(() => page.isVisible('#r34-file'), 60000);
  const wkTxt = await txt('#r34-periods');
  check('HOD sees next week as uploaded (whole-resort workbook counts)', /Uploaded/.test(wkTxt), wkTxt);
  await page.setInputFiles('#r34-file', TMP + 'hod-week.csv');
  await until(() => page.isVisible('#r34-send'), 60000);
  await page.click('#r34-send');
  await until(async () => !!(await page.$('#r34-result')), 180000);
  const hr = await txt('#r34-result');
  check('HOD weekly upload saved, matched by employee code (own department)', /saved/.test(hr) && (sameDept ? /7 shifts for 1 people/.test(hr) : /not matched|0 people|shifts/.test(hr)), hr);
  await shot('04-hod-weekly-override');

  // ================= staff: Schedule (weekly override wins for their department)
  await login('staff');
  await nav('schedule');
  await until(() => page.isVisible('#sch-today'), 60000);
  check('Schedule tab in the bottom bar', await page.evaluate(() => !!document.querySelector('[data-tab="schedule"], #nav-schedule, .nav-btn[data-t="schedule"]') || /Schedule/.test(document.querySelector('nav') ? document.querySelector('nav').innerText : '')));
  const my = (await api('getMyRoster', {})).data;
  const dmon = my.month.days.concat(my.week.days).find(d => d.date === mon1) || {};
  if (sameDept) check('weekly HOD override wins: 08:00 on ' + mon1, dmon.start === '08:00', JSON.stringify(dmon));
  else check('whole-resort week: 07:00 on ' + mon1, dmon.start === '07:00', JSON.stringify(dmon));
  const n = my.next || {};
  check('countdown or report-back shown', !!(n.nextOff || n.reportBack || n.onBreak) || !my.hasRoster === false, JSON.stringify(n));
  check('balances listed', Array.isArray(my.balances) && my.balances.some(b => b.type === 'Annual leave'), JSON.stringify(my.balances).slice(0, 200));
  check('no horizontal scroll at 390px', await noScroll());
  await shot('05-staff-schedule');
  await page.setViewportSize({ width: 320, height: 760 }); await page.waitForTimeout(800);
  check('Schedule fits 320px', await noScroll()); await shot('06-staff-schedule-320');
  await page.setViewportSize({ width: 390, height: 844 });
  // leave from the Schedule tab
  await page.evaluate(() => { state._schTab = 'leave'; r34RenderSchedule(); }); await page.waitForTimeout(4000);
  await until(() => page.isVisible('#sch-lv-new'), 60000);
  await shot('07-staff-leave-tab');
  await page.click('#sch-lv-new'); await until(() => page.isVisible('#v3f-submit'), 10000);
  const lvDay = add(mon2, 9);
  await page.fill('#v3f-startDate', lvDay); await page.fill('#v3f-endDate', lvDay);
  await page.fill('#v3f-reason', '[auto-test] 3.4.0 leave from Schedule');
  await page.click('#v3f-submit'); await page.waitForTimeout(5000);
  const mineL = ((await api('getLeave', { scope: 'mine' })).data || {});
  const lv = (mineL.requests || mineL.leave || []).find(l => String(l.startDate).slice(0, 10) === lvDay && /auto-test/.test(l.reason || ''));
  check('leave request sent from the Schedule tab', !!lv, JSON.stringify(mineL).slice(0, 300));
  // ================= HOD approves
  if (lv) {
    await login('hod');
    const r = await api('decideLeave', { id: lv.id, decision: 'approve' });
    check('HOD approves the leave', r && r.success, JSON.stringify(r));
    await login('staff');
    const b2 = (await api('getMyRoster', {})).data;
    check('staff sees the request after HOD approval', JSON.stringify(b2.leave || b2).indexOf(lvDay) >= 0);
    await api('cancelLeave', { id: lv.id }).catch(() => null); // tidy: leave pending at management is cancelled again
  }

  // ================= superadmin archive: a real workbook (TEST sheet only) + a synthetic month with A/L for t-staff
  await login('super');
  const before = (await api('getMyRoster', {})); // superadmin blocked
  check('superadmin has no personal schedule', before.success === false);
  await nav('rosterarchive');
  await until(() => page.isVisible('.r34-per'), 60000);
  await page.click('.r34-per[data-k="2026-08"]'); await page.waitForTimeout(3000);
  u = await upload([REAL], '#r34-send-many', '#r34-many-result .r34-result', 400000);
  check('archive: real workbook read (15 departments)', /15 departments/.test(u.prev), u.prev);
  check('archive: real workbook saved', /saved/.test(u.result), u.result);
  await shot('08-archive-real-workbook');
  const pm = add(today.slice(0, 8) + '01', -1).slice(0, 7); // last month
  const am = pm + '-07' > pm + '-01' ? monday(pm + '-08') : pm + '-08';
  const fA = workbook(weName(am), am, [{ name: st.name, sheet: sheetOf(st.department), days: [AL, AL, { label: 'A/L' }, W('07:00', '15:00'), W('07:00', '15:00'), OFF, OFF] }]);
  await page.click('.r34-per[data-k="' + pm + '"]'); await page.waitForTimeout(3000);
  u = await upload([fA], '#r34-send-many', '#r34-many-result .r34-result');
  check('archive: last month (synthetic) saved', /saved/.test(u.result), u.result);
  await login('staff');
  const bal = ((await api('getMyRoster', {})).data.balances || []).find(b => b.type === 'Annual leave') || {};
  check('archive A/L counts as leave used (≥3 roster days)', (bal.fromRoster || 0) >= 3, JSON.stringify(bal));
  await nav('schedule'); await page.evaluate(() => { state._schTab = 'leave'; r34RenderSchedule(); }); await page.waitForTimeout(5000);
  await shot('09-staff-balance-after-archive');

  check('no live backend calls', liveCalls === 0, liveCalls);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\nRESULT pass=' + pass + ' fail=' + fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(2); });
