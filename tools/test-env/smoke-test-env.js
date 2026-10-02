// 3.0 TEST-environment smoke test at 390px: TEST site + TEST backend (real deployment or gas-emulator.js).
//   node tools/test-env/smoke-test-env.js SITE_URL [shotDir] [emulatorRoot]
//   e.g. node tools/test-env/smoke-test-env.js https://k1rtaaan.github.io/PC-Staff-App-V2-Test/
// Password: TEST_PASSWORD= line in /workspace/test-env-accounts.txt (or env TEST_PASSWORD).
// Flows: banner / test-only storage / TEST backend; every role logs in with the right role buttons; staff places +
// cancels a dinner and a lunch; boat booking + cancel; chef kitchen day summary Print + Download PDF.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/smoke') + '/';
const EMU = process.argv[4] || '';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'groupit.paradisecoveresortfiji+t-' + k + '@gmail.com';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + String(x).slice(0, 300) : '')); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (/seat/i.test(d.message()) ? '1' : 'TEST smoke reason') : undefined));
  const txt = s => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  // 3.3.0: Meals and Boat have sub-tabs — this smoke pass uses the Dinner tab and the Village boat tab
  const nav = async t => { await page.evaluate(t => { if (t === 'meals' && typeof r33PickMealTab === 'function') { state._mealTab = 'dinner'; try { localStorage.setItem('pcrtest_meals_tab', 'dinner'); } catch (e) {} } if (t === 'boat') { try { localStorage.setItem('pcrtest_boat_tab', 'village'); state._boatTab = 'village'; } catch (e) {} } navigate(t); }, t); await page.waitForTimeout(2500); };
  const shot = n => page.screenshot({ path: S + n + '.png', fullPage: true });
  const api = (a, p) => page.evaluate(([a, p]) => api(a, p || {}), [a, p]);
  const roleBtns = () => page.evaluate(() => Array.from(document.querySelectorAll('#main-content section[id^=more-g-]')).map(e => e.id.replace('more-g-', '')).filter(x => x !== 'me') /* 3.5.0: More role groups */);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  const formOk = async () => { if (await until(() => page.isVisible('#v3f-submit'), 3000)) { await page.click('#v3f-submit'); await page.waitForTimeout(500); } };
  async function login(key, pw) {
    cur = key;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForTimeout(500);
    await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', pw || PW);
    await page.click('#login-form button[type=submit]');
    const ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 45000);
    check('login ' + A(key), ok, await txt('#login-form'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const m = document.querySelector('#modal-close, .modal-close'); if (m) m.click(); try { closeModal(); } catch (e) {} });
    return ok;
  }
  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  check('orange TEST SITE banner visible', await page.evaluate(() => { const b = document.getElementById('test-site-banner'); return !!b && b.getBoundingClientRect().height > 10 && /TEST SITE/.test(b.innerText); }));
  check('title says TEST', /TEST/.test(await page.title()));
  check('API_URL is the TEST backend (not live)', await page.evaluate(L => API_URL.indexOf(L) < 0, LIVE));
  const ver = await page.evaluate(() => api('getVersion', {}).catch(e => ({ error: String(e.message || e) })));
  if (!ver || ver.error) { check('TEST backend reachable (owner must authorise the TEST project once)', false, JSON.stringify(ver)); await browser.close(); process.exit(1); }
  check('backend getVersion ends with -test', ver && /-test$/.test(ver.version || (ver.data && ver.data.version) || ''), JSON.stringify(ver));
  check('storage keys are test-only (pcrtest_)', await page.evaluate(() => Object.keys(localStorage).every(k => k.indexOf('pcr_') !== 0)), await page.evaluate(() => Object.keys(localStorage).join(',')));
  await shot('00-login');

  // ---------- roles
  const expect = { hod: ['dept'], assistant_hod: ['dept'], chef: ['kitchen'], boat: ['boat'], admin: ['admin'], super: ['admin'] };
  const keyOf = { hod: 'hod', assistant_hod: 'asst', chef: 'chef', boat: 'boat', admin: 'admin', super: 'super' };
  for (const r of Object.keys(expect)) {
    if (!(await login(keyOf[r]))) continue;
    if (r !== 'super') { await nav('more'); const b = await roleBtns(); check(r + ' role buttons ' + expect[r], expect[r].every(x => b.includes(x)), b); }
    else check('superadmin session', await page.evaluate(() => /super/.test(String(state.user.role) + JSON.stringify(state.user.permissions))));
    await shot('10-' + r);
  }

  // ---------- staff: meals
  if (await login('staff')) {
    await nav('more'); check('staff: no role buttons', (await roleBtns()).length === 0, await roleBtns());
    await nav('meals'); await until(() => page.$('#meal-card-dinner'), 20000); await page.waitForTimeout(1500);
    await shot('20-staff-meals');
    if (await page.$('#btn-dinner-cancel')) { await page.click('#btn-dinner-cancel'); await formOk(); await page.waitForTimeout(4000); await nav('meals'); }
    const hasBtn = !!(await page.$('#btn-dinner'));
    check('dinner order button present', hasBtn, (await txt('#meal-card-dinner')).slice(0, 200));
    if (hasBtn) {
      const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#dinner-choice option')).map(o => o.value).filter(Boolean));
      if (opts.length) await page.selectOption('#dinner-choice', opts[0]);
      await page.click('#btn-dinner');
      const placed = await until(() => page.$('#btn-dinner-cancel'), 30000);
      await page.evaluate(() => { const o = document.getElementById('v3-order-overlay'); if (o) o.remove(); });
      check('dinner placed (cancel button shown)', placed, (await txt('#meal-card-dinner')).slice(0, 200));
      await shot('21-staff-dinner-placed');
      if (placed) {
        await page.click('#btn-dinner-cancel'); await formOk();
        const gone = await until(async () => !!(await page.$('#btn-dinner')), 30000);
        check('dinner cancelled (order button back)', gone, (await txt('#meal-card-dinner')).slice(0, 200));
        await shot('22-staff-dinner-cancelled');
        // re-place so the kitchen summary has a row
        await nav('meals'); if (await page.$('#btn-dinner')) { await page.click('#btn-dinner'); await until(() => page.$('#btn-dinner-cancel'), 30000); }
        await page.evaluate(() => { const o = document.getElementById('v3-order-overlay'); if (o) o.remove(); });
      }
    }
    // ---------- boat
    await nav('boat'); await until(() => page.$('.book-run'), 20000);
    const runs = await page.$$('.book-run');
    check('boat runs listed (seeded schedule)', runs.length > 0, (await txt('#main-content')).slice(0, 200));
    if (runs.length) {
      await runs[runs.length - 1].click(); await page.waitForTimeout(5000);
      await nav('bookings'); await until(() => page.$('#boat-mybookings .mb-cancel'), 45000); await shot('30-staff-bookings'); // 3.5.0: My bookings live on the Boat tab
      const c = await page.$$('#boat-mybookings .mb-cancel');
      check('boat booking confirmed (in My bookings)', c.length > 0, (await txt('#main-content')).slice(0, 200));
      if (c.length) { const n = c.length; await c[0].click(); await formOk(); const ok = await until(async () => (await page.$$('#boat-mybookings .mb-cancel')).length < n, 30000); check('boat booking cancelled', ok); }
    }
  }
  // ---------- chef: kitchen day summary + PDF
  if (await login('chef')) {
    await nav('kitchen'); const card = await until(() => page.$('#kit-day-pdf'), 40000);
    check('kitchen day summary card', card); await page.waitForTimeout(2000);
    const tm = await page.evaluate(() => { const c = document.querySelectorAll('.kit-day-chip'); return c.length ? c[c.length - 1].dataset.date : ''; });
    if (tm) { await page.click('.kit-day-chip[data-date="' + tm + '"]'); await until(() => page.evaluate(d => !!document.querySelector('[data-kit-day="' + d + '"]'), tm), 30000); }
    const total = (await txt('#kit-day-total')).trim();
    check('tomorrow total shows the staff dinner (>=1)', Number(total) >= 1, total);
    await shot('40-chef-kitchen');
    if (card) {
      const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 15000 }).catch(() => null), page.click('#kit-day-print')]);
      check('Print window: Dinner Prep List', !!pop && /Dinner Prep List/.test(await pop.textContent('body').catch(() => '')));
      if (pop) await pop.close();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }).catch(() => null), page.click('#kit-day-pdf')]);
      const p = dl && await dl.path();
      check('Download PDF', !!p && fs.statSync(p).size > 3000, dl && dl.suggestedFilename());
      if (dl) await dl.saveAs(S + dl.suggestedFilename());
    }
    // tidy: cancel the staff dinner again? (left in place on purpose as sample data)
  }
  cur = 'end';
  check('no calls to the LIVE backend', liveCalls === 0, liveCalls);
  if (EMU) {
    const mail = await (await fetch(EMU + '/__mail')).json();
    check('emulator: every email went to a test address with [TEST]', mail.every(m => /^groupit\.paradisecoveresortfiji(\+[^@]+)?@gmail\.com$/i.test(String(m.to).split(',')[0]) && /^\[TEST\]/.test(m.subject || '')) && !mail.some(m => m.via === 'urlfetch'), JSON.stringify(mail.map(m => m.to + ' ' + m.subject)));
    const lw = await (await fetch(EMU + '/__live-writes')).json();
    check('emulator: no writes to the live stand-in', lw.liveWrites.length === 0 && lw.liveFrozen);
  }
  console.log('\nerrors:', errors.length ? '\n' + errors.join('\n') : 'none');
  console.log(pass + ' passed, ' + fail + ' failed · shots ' + S);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
