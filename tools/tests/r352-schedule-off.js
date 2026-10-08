/* 3.5.2 LIVE release check (demo ?demo=1, feature_my_schedule OFF as on live): Home / Meals / Boat / More for staff + HOD.
 * No Schedule tab, no roster / "Schedule is locked" card, no rostered-off meal block, own leave under More › Leave.
 * BASE=http://127.0.0.1:8765/ SHOTS=dir node tools/tests/r352-schedule-off.js */
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROLES = { staff: 'ana.tui@paradisecoveresortfiji.com', hod: 'hod.fb@pcr.com' };
let pass = 0, fail = 0, cur = ''; const errors = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (!c && x !== undefined ? ' — ' + String(x).slice(0, 300) : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); let live = 0;
  await page.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); });
  page.on('pageerror', e => errors.push(cur + ' ' + e.message));
  page.on('dialog', d => d.dismiss());
  const ev = (f, a) => page.evaluate(f, a);
  const txt = s => ev(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async t => { await ev(t => navigate(t), t); await page.waitForTimeout(1800); };
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${cur}-${n}.png` }); };
  for (const role of Object.keys(ROLES)) {
    cur = role;
    await page.goto(BASE + '?demo=1');
    await ev(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await page.goto(BASE + '?demo=1'); await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', ROLES[role]); await page.fill('#login-password', 'staff123'); await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 }); await page.waitForTimeout(2200);
    await ev(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} });
    check('Schedule flag is off', await ev(() => !featureOn('feature_my_schedule') && !r34On()));
    check('bottom nav has no Schedule', !/Schedule/.test(await txt('#bottom-nav')), await txt('#bottom-nav'));
    await nav('home');
    const home = await txt('#main-content');
    check('Home: Bula card first', await ev(() => { const g = document.getElementById('v3-greet'); return !!g; }));
    check('Home: no roster card / locked line', !(await ev(() => !!document.querySelector('#home-roster'))) && !/Schedule is locked|open Schedule to link|next day off/i.test(home), home.slice(0, 300));
    check('Home: Book village boat + Book resort boat quick actions', /Book village boat/i.test(home) && /Book resort boat/i.test(home), home.slice(0, 400));
    check('Home: Request leave quick action', /Request leave/i.test(home));
    await shot('home');
    await ev(() => { state._mealTab = 'dinner'; }); await nav('meals');
    const meals = await txt('#main-content');
    check('Meals › Dinner: order form, no rostered-off block', !!(await ev(() => document.querySelector('#dinner-choice'))) && !/rostered off|Meal while away/i.test(meals), meals.slice(0, 300));
    check('Meals: no island estimate line', !/on the island|island estimate/i.test(meals));
    await shot('meals-dinner');
    await nav('boat');
    const boat = await txt('#main-content');
    check('Boat: Village boat + Resort boat tabs', /Village boat/i.test(boat) && /Resort boat/i.test(boat), boat.slice(0, 300));
    await shot('boat');
    await nav('more');
    const more = await txt('#main-content');
    check('More: Leave row (own leave while Schedule is off)', /Leave\s*\n?\s*Request, track or cancel/i.test(more) || /Request, track or cancel/i.test(more), more.slice(0, 400));
    if (role === 'hod') check('HOD: Approvals reachable', /Approvals/.test(more) || /Approvals/.test(home));
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no live backend calls in demo', live === 0, live);
  console.log(pass + ' passed, ' + fail + ' failed');
  await b.close(); process.exit(fail ? 1 : 0);
})();
