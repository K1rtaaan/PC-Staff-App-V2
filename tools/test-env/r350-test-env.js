// 3.5.0 / 3.5.1 TEST-environment walk at 390px: TEST site + TEST backend. Every t-* account signs in; bottom nav + More role groups
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
    if (key !== 'super') { // 3.5.1: role shortcuts on Home only for held roles, once each
      const EXP = { staff: [], hod: ['approvals', 'deptadmin'], asst: ['approvals', 'deptadmin'], chef: ['kitchenadmin'], boat: ['boatadmin'], admin: ['approvals', 'adminhub'] }[key] || [];
      await go('home'); await page.waitForTimeout(1500);
      const rs = await ev(() => [...document.querySelectorAll('#home-role-actions .v351-role')].map(b => b.dataset.tab));
      const perms = await ev(() => v3Perms().join(','));
      check('Home role shortcuts (' + perms + ')', EXP.every(t => rs.indexOf(t) >= 0) && new Set(rs).size === rs.length && (EXP.length || !rs.length), rs.join(','));
      fs.mkdirSync('/workspace/v3-test-shots/352/', { recursive: true });
      await page.screenshot({ path: '/workspace/v3-test-shots/352/' + key + '-home-390.png', fullPage: true });
    }
    if (key === 'staff') { // 3.5.1: Home › My roster first + boat quick actions
      const S351 = '/workspace/v3-test-shots/352/'; fs.mkdirSync(S351, { recursive: true });
      await go('home');
      await until(() => ev(() => !!document.querySelector('#home-roster:not(.hidden)')), 45000);
      const want = await ev(() => r34On()); // after the flags have loaded
      const hr = await ev(() => { const m = document.getElementById('main-content'), r = document.getElementById('home-roster'), g = document.getElementById('v3-greet'); const first = m && m.querySelector('section');
        return { has: !!r, inGreet: !!(r && g && g.contains(r)), first: !!(first && first.id === 'v3-greet'), bula: !!(g && /Bula,/.test(g.innerText)), photo: !!(g && g.querySelector('img, .rounded-full, [class*=avatar]')), cards: m.querySelectorAll('#home-roster-card, #sch-today-card').length,
          locked: !!document.getElementById('home-roster-locked'), txt: r ? r.innerText.slice(0, 160) : '' }; });
      check('Home: one combined top card (Bula greeting first)', hr.first && hr.bula && hr.cards === 0, JSON.stringify(hr));
      if (want) { check('Home: My roster is inside the Bula card (Schedule on)', hr.has && hr.inGreet, JSON.stringify(hr));
        const sch = await ev(() => { const d = cachePeek('r34my'); return d && !d.locked ? (d.today || {}).text || '' : null; });
        if (sch !== null) check('Home roster card = Schedule › My roster first card (today text)', hr.txt.indexOf(sch) >= 0, sch + ' | ' + hr.txt); }
      else check('Home: plain Bula card when Schedule is off', !hr.has);
      const qa = await ev(() => [...document.querySelectorAll('#home-dothisnow .v3-tile')].map(b => b.innerText.split('\n')[0].trim()));
      check('Home quick actions: village boat, resort boat, leave, report', ['Book village boat', 'Book resort boat', 'Request leave', 'Report a problem'].every(x => qa.indexOf(x) >= 0) && qa.length === 4, qa.join('|'));
      for (const w of [390, 320]) { await page.setViewportSize({ width: w, height: w === 390 ? 844 : 700 }); await page.waitForTimeout(800);
        check('Home ' + w + 'px: no horizontal scroll', await noScroll());
        check('Home ' + w + 'px: quick action tiles do not overflow', await ev(() => [...document.querySelectorAll('#home-dothisnow .v3-tile')].every(b => b.scrollWidth <= b.clientWidth + 1)));
        await page.screenshot({ path: S351 + 'staff-home-' + w + '.png', fullPage: true });
        await page.screenshot({ path: S351 + 'staff-home-' + w + '-top.png' }); }
      await page.setViewportSize({ width: 390, height: 844 });
      if (hr.has) { await page.click('#home-roster'); await page.waitForTimeout(1500); check('tap My roster → Schedule', await ev(() => state.tab) === 'schedule'); await go('home'); }
      const e0 = errors.length;
      await page.click('#home-dothisnow .v3-tile:nth-child(1)'); await page.waitForTimeout(1500);
      await until(() => ev(() => !!document.querySelector('#boat-root .book-run') || /No (boat )?runs/i.test(document.getElementById('main-content').innerText)), 30000);
      check('"Book village boat" → Boat › Village boat', await ev(() => state.tab === 'boat' && r33BoatTab() === 'village'), await ev(() => state.tab + ' ' + r33BoatTab()));
      await page.screenshot({ path: S351 + 'staff-book-village-390.png' });
      await go('home'); await page.click('#home-dothisnow .v3-tile:nth-child(2)'); await page.waitForTimeout(1500);
      await until(() => ev(() => !!document.querySelector('#rb-form')), 30000); await page.waitForTimeout(1200);
      check('"Book resort boat" → Boat › Resort boat form (PCE)', await ev(() => state.tab === 'boat' && r33BoatTab() === 'resort' && !!document.querySelector('#rb-form')));
      check('resort form scrolled into view', await ev(() => { const r = document.querySelector('#rb-form').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }));
      await page.screenshot({ path: S351 + 'staff-book-resort-390.png' });
      check('quick actions: no page errors', errors.length === e0, errors.slice(e0).join(' | '));
      await ev(() => { state._boatTab = 'village'; r33Put('pcr_boat_tab', 'village'); });
    }
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
