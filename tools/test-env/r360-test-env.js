// 3.6.0 on TEST: HOD Order on behalf (own dept / other dept refused / duplicate refused), prep list shows "Ordered by", late request window.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + String(x).slice(0, 250) : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })).newPage();
  const login = async (k) => {
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
    await p.fill('#login-email', 'pcrstaffapp+t-' + k + '@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 30000 }); await p.waitForTimeout(2500);
  };
  await login('hod');
  check('TEST runs 3.6.0', await p.evaluate(() => APP_VERSION) === '3.6.0');
  const w = await p.evaluate(() => api('getLateWindow', {})); check('getLateWindow ok', w && w.success, JSON.stringify(w));
  const d = w.data || {}; const sd = d.behalfServiceDate;
  console.log('window', JSON.stringify({ open: d.open, pick: d.pick, sd: d.serviceDate, behalfOpen: d.behalfOpen, people: (d.people || []).length, myDept: d.myDept }));
  const m = await p.evaluate((s) => api('getDinnerMenus', { serviceDate: s, includePreviousDay: false }), sd); const dish = (((m && m.data) || {}).items || [])[0]; const dn = dish && (dish.itemName || dish.name);
  const nm = 'TEST Behalf ' + Date.now().toString(36);
  if (d.behalfOpen && dn) {
    const r1 = await p.evaluate(([n, dn]) => api('placeOrderOnBehalf', { guestName: n, mealChoice: dn }), [nm, dn]); check('HOD orders on behalf (own dept)', r1 && r1.success, JSON.stringify(r1));
    const r2 = await p.evaluate(([n, dn]) => api('placeOrderOnBehalf', { guestName: n, mealChoice: dn }), [nm, dn]); check('duplicate refused', r2 && !r2.success && /already/.test(r2.error), JSON.stringify(r2));
    const r3 = await p.evaluate(([n, dn]) => api('placeOrderOnBehalf', { guestName: n + 'x', department: 'Boat', mealChoice: dn }), [nm, dn]); check('HOD other dept refused', r3 && !r3.success, JSON.stringify(r3));
    const st = (d.people || []).find(x => /t-staff|t-asst/.test(x.email));
    if (st) { const r4 = await p.evaluate(([e, dn]) => api('placeOrderOnBehalf', { targetEmail: e, mealChoice: dn }), [st.email, dn]); check('HOD orders for a registered team member (' + st.email + ')', r4 && (r4.success || /already has/.test(r4.error)) && (!r4.success || r4.data.order.userEmail === st.email), JSON.stringify(r4).slice(0, 200)); }
    await login('chef');
    const pl = await p.evaluate((s) => api('getDinnerPrepList', { serviceDate: s }), sd);
    const js = JSON.stringify(pl); check('prep list has the order marked "Ordered by"', js.indexOf(nm) >= 0 && /Ordered by/.test(js), js.slice(0, 200));
  } else console.log('NOTE behalf ordering closed or no menu (' + sd + ', ' + dn + ')');
  await login('chef');
  const lr = await p.evaluate(() => api('requestLateOnBehalf', { guestName: 'x', reason: 'y' })); check('chef cannot send late meal requests', lr && !lr.success, JSON.stringify(lr));
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
