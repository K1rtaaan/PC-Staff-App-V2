// 3.8.1 TEST: concurrent double submit → one row; same-id resend → duplicate; double tap → one request; queue keeps one waiting order per meal.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : ' — ' + String(d).slice(0, 300))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
  await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  check('site is 3.8.1', await p.evaluate(() => APP_VERSION) === '3.8.1');
  await p.fill('#login-email', 'pcrstaffapp+t-staff@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
  await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 60000 }); await p.waitForTimeout(4000);
  const v = await p.evaluate(() => apiDirect('getVersion', {})); check('backend 3.8.1', JSON.stringify(v).includes('3.8.1'), JSON.stringify(v).slice(0, 120));
  const d = await p.evaluate(async () => {
    const cut = await api('getCutoffInfo', {}); const date = (cut.data && cut.data.dinner && cut.data.dinner.serviceDate) || fijiDateString(addFijiDays(getFijiNow(), 1));
    const m = await api('getDinnerMenus', { serviceDate: date, includePreviousDay: false });
    const it = ((m.data && m.data.serviceItems) || [])[0]; return { date, dish: it ? it.itemName : 'Standard' };
  });
  const count = () => p.evaluate((date) => apiDirect('getDinnerOrders', { serviceDate: date }).then(x => (x.data.orders || []).filter(z => String(z.userEmail).toLowerCase() === state.user.email && !/cancel|reject/.test(String(z.status))).length), d.date);
  const cancel = () => p.evaluate((date) => apiDirect('cancelMealOrder', { meal: 'dinner', reason: '3.8.1 test', cancelReason: '3.8.1 test', serviceDate: date, clientRequestId: newRequestId() }), d.date);
  await cancel();
  // 1) two different request ids at the same moment (double tap on two devices / retry with a new id)
  let r = await p.evaluate((d) => Promise.all([1, 2, 3].map(() => apiDirect('placeDinnerOrder', { mealChoice: d.dish, notes: '3.8.1 race', clientRequestId: newRequestId() }))), d);
  check('3 parallel submits all succeed', r.every(x => x && x.success), JSON.stringify(r.map(x => x && (x.success || x.error))));
  check('…and leave exactly ONE order', (await count()) === 1, await count());
  // 2) same id again (offline queue retry)
  const id = await p.evaluate(() => newRequestId());
  r = await p.evaluate(([d, id]) => Promise.all([apiDirect('placeDinnerOrder', { mealChoice: d.dish, clientRequestId: id }), apiDirect('placeDinnerOrder', { mealChoice: d.dish, clientRequestId: id })]), [d, id]);
  const again = await p.evaluate(([d, id]) => apiDirect('placeDinnerOrder', { mealChoice: d.dish, clientRequestId: id }), [d, id]);
  check('same request id resent → duplicate:true', again && again.success && again.duplicate, JSON.stringify(again).slice(0, 150));
  check('still ONE order', (await count()) === 1, await count());
  // 3) UI double tap → one request
  await p.evaluate(() => navigate('meals')); await p.waitForTimeout(3000);
  await p.evaluate(() => { const t = document.querySelector('[data-mtab=dinner],[data-sub=dinner]'); if (t) t.click(); }); await p.waitForTimeout(2000);
  const has = await p.evaluate(() => !!document.getElementById('btn-dinner'));
  if (has) {
    await p.evaluate(() => { window._n381 = 0; const real = apiDirect; apiDirect = function (a, q) { if (a === 'placeDinnerOrder') window._n381++; return real(a, q); }; const btn = document.getElementById('btn-dinner'); btn.click(); btn.click(); btn.click(); });
    await p.waitForTimeout(12000);
    check('double/triple tap sends ONE request', await p.evaluate(() => window._n381) === 1, await p.evaluate(() => window._n381));
    check('still ONE order after taps', (await count()) === 1, await count());
  } else check('dinner button found', false, 'no #btn-dinner');
  // 4) offline: two queued dinner orders for the same date → one waiting
  await ctx.setOffline(true);
  await p.evaluate((d) => sendOrQueue('placeDinnerOrder', { mealChoice: d.dish }, { label: 'Dinner A', serviceDate: d.date, requestId: newRequestId() }), d);
  await p.evaluate((d) => sendOrQueue('placeDinnerOrder', { mealChoice: d.dish, notes: 'B' }, { label: 'Dinner B', serviceDate: d.date, requestId: newRequestId() }), d);
  const q = await p.evaluate(() => queueItems('dinner').map(x => x.label));
  check('offline queue keeps one waiting dinner per date (latest)', q.length === 1 && q[0] === 'Dinner B', JSON.stringify(q));
  await ctx.setOffline(false); await p.evaluate(() => { window.dispatchEvent(new Event('online')); return flushQueue('t'); });
  await p.waitForFunction(() => !queueItems().length, null, { timeout: 90000 }).catch(() => {});
  check('queue flushed', await p.evaluate(() => !queueItems().length));
  check('still ONE order after queue flush', (await count()) === 1, await count());
  await cancel();
  check('cancel leaves zero active', (await count()) === 0, await count());
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
