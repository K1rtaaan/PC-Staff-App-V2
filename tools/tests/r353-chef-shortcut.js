/* 3.5.3 (demo ?demo=1): chef Home › My roles has "Order for someone" once, it opens the Order for someone page; 320 / 390 px.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/354 node tools/tests/r353-chef-shortcut.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + x : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = []; let live = 0;
  await p.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  const login = async (email) => {
    await p.goto(BASE + '?demo=1'); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(BASE + '?demo=1'); await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', email); await p.fill('#login-password', 'staff123'); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 }); await p.waitForTimeout(2200);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} navigate('home'); }); await p.waitForTimeout(1800);
  };
  const tabs = () => p.evaluate(() => [...document.querySelectorAll('#home-role-actions [data-tab]')].map(e => e.dataset.tab));
  await login('kitchen@paradisecoveresortfiji.com');
  const t = await tabs();
  check('chef: My roles = Kitchen Admin + Order for someone', t.join(',') === 'mealbehalf,sharecount,kitchenadmin', t.join(','));
  check('chef: Order for someone once on Home', await p.evaluate(() => (document.getElementById('main-content').innerText.match(/Order on behalf/g) || []).length) === 1);
  for (const w of [390, 320]) {
    await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(300);
    check(w + 'px: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    check(w + 'px: role tiles side by side, inside the screen', await p.evaluate(() => { const r = [...document.querySelectorAll('#home-role-actions [data-tab]')].map(e => e.getBoundingClientRect()); return r.length === 3 && Math.abs(r[0].top - r[1].top) < 2 && r.every(x => x.left >= 0 && x.right <= innerWidth + 1); }));
    if (SHOTS) { await p.evaluate(() => document.getElementById('home-role-actions').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200); await p.screenshot({ path: `${SHOTS}/chef-home-${w}.png` }); }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#home-role-actions [data-tab="mealbehalf"]'); await p.waitForTimeout(1800);
  check('tap opens the Order for someone page', await p.evaluate(() => state.tab === 'mealbehalf') && /Order on behalf/.test(await p.innerText('body')), await p.evaluate(() => state.tab));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chef-order-for-someone-390.png` });
  await login('ana.tui@paradisecoveresortfiji.com');
  check('staff: no role shortcuts', (await tabs()).length === 0);
  await login('admin@paradisecoveresortfiji.com');
  check('admin (no chef role): unchanged Approvals + Admin', (await tabs()).join(',') === 'mealbehalf,latemeal,approvals,adminhub', (await tabs()).join(','));
  check('no page errors', errs.length === 0, errs.join(' | ')); check('no live backend calls', live === 0, live);
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
