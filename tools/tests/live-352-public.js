// 3.5.2 LIVE smoke, signed-out only (no orders, no bookings, no emails): site + backend versions, SW cache, sign-in screen,
// sign-up department list, forgot-password panel (not submitted), signed-out API refused. node tools/tests/live-352-public.js [shotDir]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const BASE = 'https://k1rtaaan.github.io/PC-Staff-App-V2/', OUT = process.argv[2] || '/workspace/v3-test-shots/live-352';
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ' — ' + String(x).slice(0, 300) : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errors = [], actions = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const m = r.url().match(/[?&]action=([A-Za-z0-9]+)/); if (m) actions.push(m[1]); });
  page.on('dialog', d => d.dismiss());
  await page.goto(BASE + '?nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(3000);
  check('site APP_VERSION 3.5.2', await page.evaluate(() => APP_VERSION) === '3.5.2', await page.evaluate(() => APP_VERSION));
  check('site talks to the live deployment', /AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8/.test(await page.evaluate(() => API_URL)));
  const v = await page.evaluate(() => fetch(API_URL + '?action=getVersion').then(r => r.json()));
  check('backend getVersion 3.5.2 (same as the site)', v.version === '3.5.2', JSON.stringify(v));
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  const keys = await page.evaluate(() => caches.keys());
  check('service worker cache pcr-staff-v3.5.2', keys.includes('pcr-staff-v3.5.2'), JSON.stringify(keys));
  check('sign-in screen shows the 3.5.2 version line', /3\.5\.2/.test(await page.evaluate(() => document.body.innerText)));
  await page.screenshot({ path: OUT + '/01-live-signin-3.5.2.png' });
  // sign-up form departments (public list; not submitted)
  const deps = await page.evaluate(() => fetch(API_URL + '?action=getDepartments').then(r => r.json()));
  const dl = (deps.data && deps.data.departments) || [];
  check('departments: + Front Office, Stores, Medical, Management', ['Front Office', 'Stores', 'Medical', 'Management'].every(d => dl.includes(d)), dl.join(', '));
  check('departments: no Band, Naisoso, Admin, HR, Construction', !dl.some(d => /^(band|naisoso|admin|hr|construction)$/i.test(d)));
  const opened = await page.evaluate(() => { const l = [...document.querySelectorAll('button, a')].find(e => /create account|sign up|register/i.test(e.textContent)); if (l) { l.click(); return true; } return false; });
  await page.waitForTimeout(1500);
  const sel = await page.evaluate(() => { const s = document.querySelector('#reg-department, select[name=department], #register-form select'); return s ? [...s.options].map(o => o.textContent.trim()) : []; });
  check('sign-up form opens with the new department list', opened && sel.includes('Front Office') && sel.includes('Medical') && !sel.some(o => /^(band|naisoso)$/i.test(o)), sel.join(', '));
  await page.screenshot({ path: OUT + '/02-live-signup-departments.png' });
  await page.goto(BASE + '?nc=' + Date.now(), { waitUntil: 'load' }); await page.waitForSelector('#login-email', { state: 'visible', timeout: 60000 });
  await page.evaluate(() => { try { showForgotPanel(); } catch (e) {} }); await page.waitForTimeout(800);
  check('forgot-password panel opens (not submitted)', await page.evaluate(() => { const e = document.getElementById('forgot-email'); return !!e && e.offsetParent !== null; }));
  await page.screenshot({ path: OUT + '/03-live-forgot-panel.png' });
  const anon = await page.evaluate(() => fetch(API_URL + '?action=getBootstrap&email=nobody%40example.com').then(r => r.json()));
  check('signed-out bootstrap carries no user data (user null, no orders / bookings)', !anon.success || (anon.data && anon.data.user === null && !anon.data.orders && !anon.data.myOrders && !anon.data.bookings), JSON.stringify(anon).slice(0, 200));
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('API actions called:', [...new Set(actions)].join(','));
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
