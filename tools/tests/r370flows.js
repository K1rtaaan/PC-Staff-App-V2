/* 3.7.0 (demo): chef Share tonight's count → PNG download (no navigator.share in headless); admin People › Duplicate accounts opens; menu shown from cache.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/370 node tools/tests/r370flows.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + x : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true }); const p = await ctx.newPage(); const errs = []; let live = 0;
  await p.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const login = async (email) => {
    await p.goto(BASE + '?demo=1'); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(BASE + '?demo=1'); await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', email); await p.fill('#login-password', 'staff123'); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 }); await p.waitForTimeout(2200);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} navigate('home'); }); await p.waitForTimeout(1500);
  };
  await login('kitchen@paradisecoveresortfiji.com');
  check('chef Home has Share tonight\'s count', !!(await p.$('#home-role-actions [data-tab="sharecount"]')));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chef-home-390.png`, fullPage: true });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }).catch(() => null), p.click('#home-role-actions [data-tab="sharecount"]')]);
  check('share → PNG download', !!dl && /dinner-count-.*\.png$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  if (dl && SHOTS) await dl.saveAs(`${SHOTS}/${dl.suggestedFilename()}`);
  await login('admin@paradisecoveresortfiji.com');
  await p.evaluate(() => navigate('people')); await p.waitForTimeout(2500);
  check('People has Duplicate accounts', !!(await p.$('#uf-dups')));
  await p.click('#uf-dups'); await p.waitForTimeout(2500);
  check('Duplicate accounts modal opens', /Duplicate accounts/.test(await p.innerText('body')));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/admin-duplicates-390.png` });
  check('no page errors', errs.length === 0, errs.join(' | ')); check('no live backend calls', live === 0, live);
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
