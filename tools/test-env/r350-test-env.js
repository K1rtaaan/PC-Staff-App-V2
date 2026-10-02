// 3.5.0 TEST-environment walk at 390px: TEST site + TEST backend. Every t-* account signs in; bottom nav + More role groups
// match the 3.5.0 layout, every role page opens without errors, old page names redirect, and (admin) the
// "Admin" department is gone (HR / Admin → Management, migration flag departments_350). Never touches live.
//   node tools/test-env/r350-test-env.js SITE_URL [shotDir]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/350-env/r350') + '/';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'groupit.paradisecoveresortfiji+t-' + k + '@gmail.com';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const hide = s => String(s).split(PW).join('***');
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + hide(x).slice(0, 300) : '')); };
// expected role pages (3.5.0)
const ROLE = {
  staff: { groups: [], pages: [] },
  hod:   { groups: ['dept'], pages: ['approvals', 'deptadmin', 'people', 'peoplelinks', 'leavecal'] },
  asst:  { groups: ['dept'], pages: ['approvals', 'deptadmin', 'people'] },
  chef:  { groups: ['kitchen'], pages: ['kitchenadmin', 'kitchenlists', 'kitchenapprovals', 'chefmenu', 'mealstats'] },
  boat:  { groups: ['boat'], pages: ['boatadmin', 'resortboat', 'boatemergency'] },
  admin: { groups: ['admin'], pages: ['approvals', 'adminhub', 'people', 'peoplelinks', 'leavecal', 'leavelist', 'system'] },
  super: { groups: [], pages: ['adminoverview', 'approvals', 'manage'] }
};
const OLD = { usersv3: 'people', gllink: 'people', deptstaff: 'peoplelinks', boatruns: 'boatadmin', kitchenreports: 'mealstats', nosuchpage: 'home' };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.dismiss());
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  const api = (a, p) => ev(([a, p]) => api(a, p || {}), [a, p]);
  const go = async t => { await ev(t => navigate(t), t); await page.waitForTimeout(1500); await until(() => ev(() => !/Loading/.test((document.getElementById('main-content') || {}).innerText || '')), 30000); };
  const noScroll = () => ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  async function login(key) {
    cur = key;
    await ev(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(500);
    await ev(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', PW);
    await page.click('#login-form button[type=submit]');
    const ok = await until(() => ev(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 45000);
    check('login', ok); await page.waitForTimeout(1500);
    await ev(() => { try { closeModal(); } catch (e) {} });
    return ok;
  }
  await page.goto(SITE, { waitUntil: 'load' });
  await ev(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  check('API_URL is the TEST backend', await ev(L => API_URL.indexOf(L) < 0 && API_URL.indexOf('AKfycbx41ef') >= 0, LIVE));
  check('frontend 3.5.x', /^3\.5\.\d+$/.test(await ev(() => APP_VERSION)));
  const ver = await ev(() => api('getVersion', {}).catch(e => ({ error: String(e) })));
  check('backend 3.5.x-test', /^3\.5\.\d+-test$/.test((ver && (ver.version || (ver.data && ver.data.version))) || ''), JSON.stringify(ver));
  for (const key of Object.keys(ROLE)) {
    if (!(await login(key))) continue;
    const nav = await ev(() => [...document.querySelectorAll('#bottom-nav button')].map(b => b.innerText.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()));
    if (key === 'super') check('super nav: Overview · Approvals · Manage · More', nav.join('|') === 'Overview|Approvals|Manage|More', nav.join('|'));
    else check('nav: Home · Meals · Boat · (Schedule) · More', /^Home\|Meals\|Boat\|(Schedule\|)?More$/.test(nav.join('|')), nav.join('|'));
    check('nav has no duplicates', new Set(nav).size === nav.length, nav.join('|'));
    await go('more');
    const groups = await ev(() => [...document.querySelectorAll('#main-content section[id^=more-g-]')].map(s => s.id.replace('more-g-', '')).filter(x => x !== 'me'));
    check('More role groups = ' + (ROLE[key].groups.join(',') || 'none'), ROLE[key].groups.every(g => groups.indexOf(g) >= 0) && (key !== 'staff' || groups.length === 0), groups.join(','));
    const rows = await ev(() => [...document.querySelectorAll('#main-content section[id^=more-g-] .v3-list-btn')].map(b => (b.querySelector('p') || b).innerText.split('\n')[0].trim()));
    check('More has no duplicate rows', new Set(rows).size === rows.length, rows.join('|'));
    check('More: no horizontal scroll', await noScroll());
    await page.screenshot({ path: S + key + '-more.png', fullPage: true });
    for (const t of ROLE[key].pages) {
      const e0 = errors.length;
      await go(t);
      const st = await ev(() => ({ tab: state.tab, text: (document.getElementById('main-content') || {}).innerText || '' }));
      check('opens ' + t, st.text.length > 20 && !/Not allowed|Admin only|Access denied/i.test(st.text.slice(0, 200)) && errors.length === e0, st.tab + ' ' + st.text.slice(0, 120));
      check(t + ': no horizontal scroll', await noScroll());
      await page.screenshot({ path: S + key + '-' + t + '.png', fullPage: true });
    }
    if (key === 'admin' || key === 'hod') for (const o of Object.keys(OLD)) {
      if (key === 'hod' && /^(gllink|boatruns|kitchenreports)$/.test(o)) continue; // not HOD pages → home is right
      await go(o);
      check('old page "' + o + '" → ' + OLD[o], await ev(() => state.tab) === OLD[o], await ev(() => state.tab));
    }
    if (key === 'admin') {
      const pd = await api('getPeopleDepartments', {});
      const names = ((pd && pd.data && pd.data.departments) || []).map(d => d.department);
      check('People grid has Management and no "Admin" department', names.indexOf('Management') >= 0 && names.indexOf('Admin') < 0, names.join(','));
      const us = ((await api('getUsers', { activeOnly: false })).data || {}).users || [];
      check('no TEST user is in department "Admin" / "HR"', !us.some(u => /^(admin|hr)$/i.test(String(u.department || '').trim())), us.filter(u => /^(admin|hr)$/i.test(String(u.department || ''))).map(u => u.email).join(','));
      check('client department list has no "Admin"', await ev(() => PCR_DEPARTMENTS.indexOf('Admin') < 0 && PCR_DEPARTMENTS.indexOf('Management') >= 0));
      const set = await api('getAppSettings', {});
      const flag = set && set.data ? (set.data.settings || set.data).departments_350 : undefined;
      console.log('INFO departments_350 = ' + flag);
      check('migration flag departments_350 written on TEST', !!flag, JSON.stringify(set).slice(0, 200));
    }
  }
  cur = 'end';
  check('no live backend calls', liveCalls === 0, liveCalls);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\nRESULT pass=' + pass + ' fail=' + fail + '\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', hide(e && e.stack || e)); process.exit(2); });
