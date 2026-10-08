/* 3.5.1 Home (demo ?demo=1): quick actions (village / resort boat, leave, report) + role shortcuts only for held roles, no duplicates,
 * 320 / 390 px, screenshots of each role's Home.  SHOTS=/workspace/v3-test-shots/351 node tools/tests/r351flows.js
 * (was: 3.5.0 clean-up (demo ?demo=1): every role's menus (no duplicates), every old page name / hash redirects, the capability checklist
 * (each feature from the audit risks list, checked at its new home), stale-render guard, one version line, screenshots 390 / 320 px.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/350 node tools/tests/r350flows.js */
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROLES = { staff: ['ana.tui@paradisecoveresortfiji.com', 'staff123'], hod: ['hod.fb@pcr.com', 'staff123'], chef: ['kitchen@paradisecoveresortfiji.com', 'staff123'],
  captain: ['boat@paradisecoveresortfiji.com', 'staff123'], boatmgr: ['boat.mgr@paradisecoveresortfiji.com', 'staff123'], admin: ['admin@paradisecoveresortfiji.com', 'staff123'], super: ['it@paradisecoveresortfiji.com', '21slands'] };
let pass = 0, fail = 0, cur = ''; const errors = [], checklist = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (!c && x !== undefined ? ' — ' + String(x).slice(0, 300) : '')); return !!c; };
const cap = (id, where, n, c, x) => { checklist.push({ id, where, feature: n, ok: !!c }); return check('CAP ' + id + ' ' + n + ' @ ' + where, c, x); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(BASE + '?demo=1');
  const ev = (f, a) => page.evaluate(f, a);
  const has = s => ev(s => !!document.querySelector(s), s);
  const cnt = s => ev(s => document.querySelectorAll(s).length, s);
  const txt = s => ev(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async (t, ms) => { await ev(t => navigate(t), t); await page.waitForTimeout(ms || 1600); };
  const shot = async (role, name) => { if (!SHOTS) return; for (const w of [390, 320]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS}/${role}-${name}-${w}.png`, fullPage: true }); } await page.setViewportSize({ width: 390, height: 844 }); };
  const noSide = () => ev(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const login = async (role) => {
    cur = role;
    await ev(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(300);
    await ev(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await page.goto(BASE + '?demo=1'); await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', ROLES[role][0]); await page.fill('#login-password', ROLES[role][1]);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(2200);
    await ev(() => { const n = document.getElementById('a31-notice-ok'); if (n) n.click(); const p = document.getElementById('a33-later'); if (p) p.click(); try { closeModal(); } catch (e) {} });
  };

  const EXP = { staff: [], hod: ['approvals', 'deptadmin'], chef: ['kitchenadmin'], captain: ['boatadmin'], boatmgr: ['boatadmin'], admin: ['approvals', 'adminhub'] };
  for (const role of Object.keys(EXP)) {
    await login(role);
    await nav('home', 1800);
    const qa = await ev(() => [...document.querySelectorAll('#home-dothisnow .v3-tile:not(.v351-role)')].map(b => b.innerText.split('\n')[0].trim()));
    check('quick actions: village boat · resort boat · leave · report', qa.join('|') === 'Book village boat|Book resort boat|Request leave|Report a problem', qa.join('|'));
    const rs = await ev(() => [...document.querySelectorAll('#home-role-actions .v351-role')].map(b => b.dataset.tab));
    const perms = await ev(() => v3Perms());
    check('role shortcuts = ' + (EXP[role].join(',') || 'none') + ' (perms ' + perms.join(',') + ')', rs.slice().sort().join(',') === EXP[role].slice().sort().join(','), rs.join(','));
    check('no duplicate shortcut', new Set(rs).size === rs.length, rs.join(','));
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(300);
      check(w + 'px: no horizontal scroll', await noSide());
      check(w + 'px: tiles fit (no clipped text)', await ev(() => [...document.querySelectorAll('#home-dothisnow .v3-tile')].every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)));
      check(w + 'px: tiles are two per row', await ev(() => { const t = [...document.querySelectorAll('#home-dothisnow .v3-tile')]; return t.length < 2 || Math.abs(t[0].getBoundingClientRect().top - t[1].getBoundingClientRect().top) < 2; }));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${role}-home-${w}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const t of rs) { await ev(t => document.querySelector('#home-role-actions [data-tab="' + t + '"]').click(), t); await page.waitForTimeout(1200);
      check('shortcut ' + t + ' opens its page', await ev(() => state.tab) === t, await ev(() => state.tab)); await nav('home', 1200); }
    if (role === 'staff') {
      await ev(() => document.querySelector('#home-dothisnow .v3-tile').click()); await page.waitForTimeout(2500);
      check('Book village boat → Boat › Village', await ev(() => state.tab === 'boat' && r33BoatTab() === 'village'));
      await nav('home', 1200);
      await ev(() => document.querySelectorAll('#home-dothisnow .v3-tile')[1].click()); await page.waitForTimeout(3000);
      check('Book resort boat → Boat › Resort boat form', await ev(() => state.tab === 'boat' && r33BoatTab() === 'resort' && !!document.querySelector('#rb-form')));
      await nav('home', 1200); check('demo: plain Bula card (no roster block — Schedule needs the server)', !(await has('#home-roster')) && /Bula,/.test(await txt('#v3-greet')));
    }
  }
  // several roles at once: each shortcut once (admin + HOD + chef + boat manager)
  cur = 'multi';
  const multi = await ev(() => { const keep = v3Has; window.v3Has = function(r){ return ['admin', 'hod', 'chef', 'boat_manager', 'boat_captain'].indexOf(r) >= 0 || keep(r); };
    try { return [...new DOMParser().parseFromString(v351RoleShortcuts().join(''), 'text/html').querySelectorAll('[data-tab]')].map(b => b.dataset.tab); } finally { window.v3Has = keep; } });
  check('admin + HOD + chef + boat: each shortcut once', multi.join(',') === 'approvals,adminhub,deptadmin,kitchenadmin,boatadmin', multi.join(','));
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(2); });
