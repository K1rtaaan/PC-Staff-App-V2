/* 3.0.1: superadmin code box. Making someone Admin (Users & roles → Edit → tick Admin → Save) asks for the superadmin
 * code; the box must appear ON TOP of the Edit window, accept typing, and the change must save. Wrong code = server error,
 * Edit window kept. Cancel = nothing sent. Demo mode. BASE=http://127.0.0.1:8765/ node tools/tests/r301code.js
 * (TEST site: SITE=https://k1rtaaan.github.io/PC-Staff-App-V2-Test/ EMAIL=... PW=... CODE=... TARGET=email — used by hand only) */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SITE = process.env.SITE || (BASE + '?demo=1');
const EMAIL = process.env.EMAIL || 'it@paradisecoveresortfiji.com', PW = process.env.PW || '21slands', CODE = process.env.CODE || '2026';
const TARGET = process.env.TARGET || 'ana.tui@paradisecoveresortfiji.com';
const LSP = process.env.LSP || 'pcr_';
let pass = 0, fail = 0; const errors = [];
function check(name, ok, info){ if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : info); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(p => { localStorage.setItem(p + 'v2_coach_done','1'); }, LSP);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  await page.fill('#login-email', EMAIL); await page.fill('#login-password', PW);
  await page.click('#login-form button[type=submit]');
  await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 45000 });
  await page.waitForTimeout(2000); await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  const openEdit = async () => {
    await page.evaluate(() => navigate('usersv3'));
    await page.waitForSelector('.v3-user', { timeout: 30000 });
    await page.evaluate(t => { const b = Array.from(document.querySelectorAll('.v3-user')).find(x => x.dataset.email === t); b.click(); }, TARGET);
    await page.waitForSelector('#eu3-save', { state: 'visible' });
  };
  const isAdmin = () => page.evaluate(t => api('getUsers', { activeOnly:false }).then(r => { const u = r.data.users.find(x => x.email === t); const l = [].concat(u.roles || u.permissions || u.role || []).join(',').split(/[,|]+/).map(x => x.trim()); return l.indexOf('admin') >= 0; }), TARGET);
  const tickAdmin = v => page.evaluate(v => { const c = document.querySelector('.eu3-perm[value=admin]'); if (c.checked !== v) c.click(); }, v);

  // 1) cancel → nothing saved, Edit window still there
  await openEdit(); const before = await isAdmin();
  await tickAdmin(!before); await page.click('#eu3-save');
  check('code box appears', await page.waitForSelector('#code-input', { state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
  check('code box is on top of Edit window', await page.evaluate(() => { const i = document.getElementById('code-input').getBoundingClientRect(); const el = document.elementFromPoint(i.left + 5, i.top + 5); return el && el.id === 'code-input'; }));
  check('Edit window still open underneath', await page.isVisible('#eu3-save'));
  await page.click('#code-cancel');
  check('cancel closes code box', !(await page.$('#code-modal')));
  check('cancel keeps Edit window and ticks', await page.isVisible('#eu3-save') && await page.evaluate(v => document.querySelector('.eu3-perm[value=admin]').checked === v, !before));
  // 2) wrong code → error, Edit window kept
  await page.click('#eu3-save'); await page.waitForSelector('#code-input', { state: 'visible' });
  await page.fill('#code-input', '0000'); await page.press('#code-input', 'Enter'); await page.waitForTimeout(2500);
  check('wrong code: change not saved', (await isAdmin()) === before);
  check('wrong code: Edit window kept', await page.isVisible('#eu3-save'));
  // 3) right code → saved
  await page.click('#eu3-save'); await page.waitForSelector('#code-input', { state: 'visible' });
  await page.type('#code-input', CODE); await page.click('#code-ok'); await page.waitForTimeout(3500);
  check('right code: role change saved', (await isAdmin()) === !before);
  // 4) put it back
  await openEdit(); await tickAdmin(before); await page.click('#eu3-save'); await page.waitForSelector('#code-input', { state: 'visible' });
  await page.type('#code-input', CODE); await page.click('#code-ok'); await page.waitForTimeout(3500);
  check('restored original role', (await isAdmin()) === before);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
