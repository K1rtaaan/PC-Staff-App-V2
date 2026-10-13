/* 3.6.0 (demo ?demo=1): Home shortcuts for Order on behalf / Late meal request; order on behalf for a free-text contractor; Schedule leaders-only flag.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/360 node tools/tests/r360flows.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + x : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = []; let live = 0;
  await p.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  const login = async (email, pw) => {
    await p.goto(BASE + '?demo=1'); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(BASE + '?demo=1'); await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', email); await p.fill('#login-password', pw || 'staff123'); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 }); await p.waitForTimeout(2200);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} navigate('home'); }); await p.waitForTimeout(1800);
  };
  const tabs = () => p.evaluate(() => [...document.querySelectorAll('#home-role-actions [data-tab]')].map(e => e.dataset.tab));
  const shot = async (n) => { if (!SHOTS) return; const r = await p.$('#home-role-actions'); if (r) await r.scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
  // chef
  await login('kitchen@paradisecoveresortfiji.com');
  let t = await tabs(); check('chef: Order on behalf, no Late meal request', t.includes('mealbehalf') && !t.includes('latemeal'), t.join(','));
  await shot('home-chef-390');
  // admin
  await login('admin@paradisecoveresortfiji.com');
  t = await tabs(); check('admin: Order on behalf + Late meal request', t.includes('mealbehalf') && t.includes('latemeal'), t.join(','));
  await shot('home-admin-390');
  await p.click('#home-role-actions [data-tab="mealbehalf"]'); await p.waitForTimeout(2200);
  check('admin: Order on behalf page', await p.evaluate(() => state.tab === 'mealbehalf') && /Order on behalf/.test(await p.innerText('body')));
  const open = await p.$('#r36-go');
  if (open) {
    await p.selectOption('#r36-who', ''); await p.fill('#r36-name', 'Test Contractor Joe'); await p.selectOption('#r36-dept', '__contractor');
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/order-on-behalf-390.png`, fullPage: true });
    await p.click('#r36-go'); await p.waitForTimeout(2000);
    const row = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /demo/i.test(k) && /dinner|db/i.test(k)) || 'x') || 'null'); return db; });
    const ok = await p.evaluate(() => { try { const all = JSON.stringify(localStorage); return all.indexOf('Test Contractor Joe') >= 0 && all.indexOf('Ordered by') >= 0; } catch (e) { return false; } });
    check('order on behalf saved with "Ordered by"', ok);
    await p.click('#r36-go').catch(() => {}); await p.waitForTimeout(300);
    await p.selectOption('#r36-who', ''); await p.fill('#r36-name', 'Test Contractor Joe'); await p.selectOption('#r36-dept', '__contractor'); await p.click('#r36-go'); await p.waitForTimeout(1500);
    check('duplicate refused', /already has a dinner order/.test(await p.innerText('body')));
  } else console.log('NOTE ordering closed in demo clock — form not shown');
  await p.evaluate(() => navigate('latemeal')); await p.waitForTimeout(2200);
  check('admin: Late meal request page', /Late meal request/.test(await p.innerText('body')) && /4pm/.test(await p.innerText('body')));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/late-meal-request-390.png`, fullPage: true });
  // HOD
  await login('hod.fb@pcr.com');
  t = await tabs(); check('HOD: Order on behalf + Late meal request', t.includes('mealbehalf') && t.includes('latemeal'), t.join(','));
  await shot('home-hod-390');
  // staff
  await login('ana.tui@paradisecoveresortfiji.com');
  check('staff: no Order on behalf / Late request', (await tabs()).length === 0);
  check('staff: r36SchedAllowed with flag off', await p.evaluate(() => r36SchedAllowed()));
  check('staff: blocked when leaders-only on', await p.evaluate(() => { state.featureFlags.feature_schedule_leaders = true; return !r36SchedAllowed(); }));
  check('no page errors', errs.length === 0, errs.join(' | ')); check('no live backend calls', live === 0, live);
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
