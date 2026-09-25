const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS || '/tmp/pcr-tests/shots/';
const clock = process.argv[2] || '2026-09-25T22:00:00Z'; // Sat 26 Sep 10:00 FJT
const tag = process.argv[3] || '';
const errors = [];
const roles = [
  ['staff','ana.tui@paradisecoveresortfiji.com','staff123'],
  ['staff-pending','new.staff@paradisecoveresortfiji.com','staff123'],
  ['hod','hod.hk@paradisecoveresortfiji.com','staff123'],
  ['asst-hod','asst.hk@paradisecoveresortfiji.com','staff123'],
  ['chef','kitchen@paradisecoveresortfiji.com','staff123'],
  ['boat-manager','boat.mgr@paradisecoveresortfiji.com','staff123'],
  ['admin','admin@paradisecoveresortfiji.com','staff123'],
  ['superadmin','it@paradisecoveresortfiji.com','21slands'],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(clock) });
  let cur = '';
  page.on('console', m => { if (m.type() === 'error') errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); });
  await page.reload({ waitUntil: 'load' });
  for (const [name, email, pw] of roles) {
    cur = name;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    const tabs = await page.evaluate(() => navItems().map(n => n.id));
    for (const t of ['home'].concat(tabs.filter(x => x !== 'home'))) {
      await page.evaluate(t => navigate(t), t);
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, title: document.getElementById('header-title').textContent, len: document.getElementById('main-content').innerText.length }));
      const bad = r.sw > r.cw + 1 || r.bw > r.cw + 1;
      console.log((bad ? 'SIDESCROLL ' : 'ok ') + name + ' ' + t + ' ' + JSON.stringify(r));
      if (['home','meals','more','chef','manage','approvals'].includes(t)) await page.screenshot({ path: SHOTS + tag + name + '-' + t + '.png', fullPage: true });
    }
  }
  console.log('ERRORS', errors.length); errors.forEach(e => console.log(e));
  await browser.close();
})();
