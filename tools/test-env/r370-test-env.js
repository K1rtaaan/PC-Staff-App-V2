// 3.7.0 on TEST: hashed passwords (login all roles, migrate all, change password, register), duplicates list, settings, weekly report test send, backup now.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const CODE = process.env.SUPER_CODE || '';
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + String(x).slice(0, 300) : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForFunction(() => typeof api === 'function', null, { timeout: 30000 });
  const as = async (k, pw) => { const r = await p.evaluate(([e, pw]) => api('login', { email: e, password: pw }), ['pcrstaffapp+t-' + k + '@gmail.com', pw || PW]); if (r && r.success) await p.evaluate((d) => { state.user = d.user || d; state.token = d.sessionToken || d.token || (d.user && d.user.sessionToken); }, r.data); return r; };
  check('TEST runs 3.7.0', await p.evaluate(() => api('getVersion', {}).then(r => r.version)) === '3.7.0-test');
  for (const k of ['staff', 'hod', 'asst', 'chef', 'boat', 'admin', 'super']) { const r = await as(k); check('login ' + k, r && r.success, JSON.stringify(r)); }
  const bad = await p.evaluate(() => api('login', { email: 'pcrstaffapp+t-staff@gmail.com', password: 'wrong-pass-x' })); check('wrong password refused', bad && !bad.success);
  await as('super');
  let r = await p.evaluate(() => api('pwMigrateAll', {})); check('superadmin pwMigrateAll', r && r.success, JSON.stringify(r)); console.log('migrate', JSON.stringify(r && r.data));
  r = await p.evaluate(() => api('pwStatus', {})); check('no plain-text passwords left', r && r.success && r.data.plainLeft === 0, JSON.stringify(r));
  for (const k of ['staff', 'super']) { const x = await as(k); check('login after migration ' + k, x && x.success, JSON.stringify(x)); }
  // change password (self) and back
  await as('staff'); const tmp = PW + '-x7';
  r = await p.evaluate((np) => api('updateUser', { targetEmail: state.user.email, email: state.user.email, password: np }), tmp); check('staff changes own password', r && r.success, JSON.stringify(r));
  check('login with new password', (await as('staff', tmp)).success);
  r = await p.evaluate((np) => api('updateUser', { targetEmail: state.user.email, email: state.user.email, password: np }), PW); check('password changed back', r && r.success && (await as('staff')).success, JSON.stringify(r));
  // register (new TEST address)
  const em = 'pcrstaffapp+t-reg' + Date.now().toString(36) + '@gmail.com';
  r = await p.evaluate(([e, pw]) => { state.user = null; state.token = ''; return api('register', { email: e, password: pw, firstName: 'Reg', lastName: 'Test370', department: 'IT/Office' }); }, [em, PW]); check('register works', r && r.success, JSON.stringify(r));
  // duplicates (admin)
  await as('admin'); r = await p.evaluate(() => api('findDuplicateAccounts', {})); check('admin lists duplicates', r && r.success, JSON.stringify(r)); console.log('TEST dup groups', (r && r.data && r.data.groups || []).length);
  await as('staff'); r = await p.evaluate(() => api('findDuplicateAccounts', {})); check('staff cannot list duplicates', r && !r.success);
  // settings + weekly report + backup
  await as('super');
  if (CODE) {
    for (const [k, v] of [['nudge_7pm', 'true'], ['weekly_report_to', 'it@paradisecoveresortfiji.com']]) { const s = await p.evaluate(([k, v, c]) => api('setAppSetting', { key: k, value: v, passcode: c }), [k, v, CODE]); check('set ' + k, s && s.success, JSON.stringify(s)); }
    r = await p.evaluate(() => api('sendWeeklyReportNow', {})); check('weekly report test send (TEST redirect)', r && r.success, JSON.stringify(r)); console.log('weekly', JSON.stringify(r && r.data));
  } else console.log('NOTE no SUPER_CODE: settings + weekly send skipped');
  r = await p.evaluate(() => api('runBackupNow', {})); check('backup now → PCR App Backups', r && r.success, JSON.stringify(r)); console.log('backup', JSON.stringify(r && r.data));
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
