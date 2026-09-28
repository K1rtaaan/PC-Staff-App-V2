/* 3.2.0 browser flows on the demo (?demo=1): admins get Overview + System tools + delete user (admin code),
 * footer credit + About modal on every page, superadmin About image (upload / reset). BASE=http://127.0.0.1:8765/ node tools/tests/r320flows.js */
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SUPER = ['it@paradisecoveresortfiji.com', '21slands'], ADMIN = ['admin@paradisecoveresortfiji.com', 'staff123'], STAFF = ['ana.tui@paradisecoveresortfiji.com', 'staff123'];
let pass = 0, fail = 0; const errors = []; let cur = '';
function check(name, ok, info){ if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : info); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
  await page.reload({ waitUntil: 'load' });
  check('login screen shows the credit + About', await page.isVisible('#pcr-credit-login .pcr-rasta') && /Made by Pranav Kumar \(Group IT Manager\)/.test(await page.innerText('#pcr-credit-login')));
  const login = async ([email, pw]) => {
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => { localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', email); await page.fill('#login-password', pw);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const n = document.getElementById('a31-notice-ok'); if (n) n.click(); const p = document.getElementById('a33-later'); if (p) p.click(); });
  };
  const go = async (js) => { await page.evaluate(js); await page.waitForTimeout(1800); };
  const api = (a, p) => page.evaluate(([a, p]) => api(a, p), [a, p || {}]);

  // 1) footer credit on every page (staff)
  cur = 'staff'; await login(STAFF);
  for (const t of ['home', 'meals', 'boat', 'more', 'profile', 'myreports']) {
    await go(`navigate('${t}')`);
    const ok = await page.evaluate(() => { const mc = document.getElementById('main-content'), c = document.getElementById('pcr-credit'); return !!c && mc.lastElementChild === c && /Made by Pranav Kumar \(Group IT Manager\)/.test(c.innerText) && !!c.querySelector('.pcr-about-btn'); });
    check('credit + About at the bottom of ' + t, ok);
  }
  await go("navigate('more')");
  check('credit sits under the version info', await page.evaluate(() => { const c = document.getElementById('pcr-credit'); const t = document.getElementById('main-content').innerText; return /PCR Staff App 3\.2\.0/.test(t) && t.lastIndexOf('3.2.0') < t.indexOf('Made by Pranav'); }));
  const st = await page.evaluate(() => { const e = document.querySelector('#pcr-credit .pcr-credit'), t = document.querySelector('#pcr-credit .pcr-rasta'); const a = getComputedStyle(e), b = getComputedStyle(t); return { anim: a.animationName, clip: b.webkitBackgroundClip || b.backgroundClip, img: b.backgroundImage, shadow: a.boxShadow }; });
  check('Rasta gradient text (red/yellow/green, clipped to text)', /text/.test(st.clip) && /255, 77, 77/.test(st.img) && /255, 210, 63/.test(st.img) && /47, 211, 95/.test(st.img), JSON.stringify(st));
  check('golden glow animates', st.anim === 'pcrGlow' && /245, 215, 122/.test(st.shadow), JSON.stringify(st));
  await page.click('#pcr-credit .pcr-about-btn'); await page.waitForTimeout(800);
  const im = await page.evaluate(() => { const i = document.getElementById('about-img'); return i ? { src: i.getAttribute('src'), w: i.naturalWidth } : null; });
  check('About opens a modal with the default poster', im && /assets\/about-default\.jpg$/.test(im.src) && im.w > 100, JSON.stringify(im));
  await page.evaluate(() => closeModal());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check('prefers-reduced-motion: no animation', await page.evaluate(() => getComputedStyle(document.querySelector('#pcr-credit .pcr-credit')).animationName) === 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300);
  check('small phone (320px): credit fits, no sideways scroll', await page.evaluate(() => { const c = document.querySelector('#pcr-credit .pcr-credit').getBoundingClientRect(); return c.right <= 320 && c.left >= 0 && document.documentElement.scrollWidth <= 320; }));
  await page.setViewportSize({ width: 390, height: 844 });
  let r = await api('getSuperDashboard', {});
  check('staff: no overview from the server', r.success === false);

  // 2) admin tools
  cur = 'admin'; await login(ADMIN);
  await go("navigate('adminhub')");
  const hub = await page.innerText('#main-content');
  check('Admin Settings lists Overview + System tools', /Overview/.test(hub) && /System tools/.test(hub), hub.slice(0, 300));
  await go("navigate('adminoverview')");
  check('admin: Overview shows the dashboard stats', await page.isVisible('#sa-meals') && await page.isVisible('#sa-pending') && await page.isVisible('#sa-users'), (await page.innerText('#main-content')).slice(0, 200));
  await go("navigate('admintools')");
  check('admin: System tools page (alert emails, archive, kitchen summaries)', await page.isVisible('#at-alerts') && await page.isVisible('#arch-dry') && await page.isVisible('#ks-backfill'));
  await page.click('#arch-dry'); await page.waitForTimeout(1500);
  check('admin: archive dry run works', /Dry run — nothing moved/.test(await page.innerText('#arch-out')), await page.innerText('#arch-out'));
  await page.click('#at-alerts'); await page.waitForTimeout(1000);
  check('admin: alert emails editor opens', await page.isVisible('#al-text'));
  await page.fill('#al-text', 'alerts@x.com'); await page.click('#al-save'); await page.waitForTimeout(1200);
  r = await api('getAlertEmails', {});
  check('admin: alert emails saved', r.success && JSON.stringify(r.data).includes('alerts@x.com'), JSON.stringify(r).slice(0, 200));
  for (const t of ['settings', 'migrate', 'superlog', 'reports', 'aboutimage']) { await go(`navigate('${t}')`); check('admin cannot open ' + t, await page.evaluate((t) => state.tab !== t, t)); }
  // delete user with the admin code
  await go("navigate('usersv3')");
  const victim = await page.evaluate(() => { const b = [...document.querySelectorAll('.v3-user')].find(x => /staff/i.test(x.innerText) && !/Superadmin|it@/i.test(x.innerText) && x.dataset.email !== 'ana.tui@paradisecoveresortfiji.com'); return b ? b.dataset.email : ''; });
  await page.click(`.v3-user[data-email="${victim}"]`); await page.waitForTimeout(700);
  check('admin sees "Delete this user" for a staff account', await page.isVisible('#v3-del-user'), victim);
  await page.click('#v3-del-user'); await page.waitForTimeout(600);
  check('asks for the ADMIN code (not superadmin)', /Admin code/.test(await page.innerText('#code-modal-title')));
  await page.fill('#code-input', '2025'); await page.click('#code-ok'); await page.waitForTimeout(1800);
  r = await api('listUsers', {});
  const still = JSON.stringify(r).includes(victim);
  check('user deleted', !still, victim);
  await page.evaluate(() => closeModal && closeModal());
  await go("navigate('usersv3')");
  await page.click('.v3-user[data-email="it@paradisecoveresortfiji.com"]').catch(() => {}); await page.waitForTimeout(700);
  check('no delete button on a superadmin account', !(await page.isVisible('#v3-del-user')));
  await page.evaluate(() => closeModal && closeModal());
  const logR = await api('getAdminLog', { area: 'admin' });
  check('admin actions in the Activity log (delete, alert emails)', logR.success && JSON.stringify(logR.data).includes('deleteUser') && JSON.stringify(logR.data).includes('saveAlertEmails'), JSON.stringify((logR.data && logR.data.entries || []).map(e => [e.action, e.summary])));

  // 3) superadmin About image
  cur = 'super'; await login(SUPER);
  await go("navigate('manage')");
  check('Manage lists About image', /About image/.test(await page.innerText('#main-content')));
  await go("navigate('aboutimage')");
  check('About image page with preview (default)', /about-default\.jpg$/.test(await page.getAttribute('#ai-prev', 'src')) && /Default poster/.test(await page.innerText('#ai-state')));
  await page.setInputFiles('#ai-file', path.join(__dirname, '..', '..', 'public', 'assets', 'golden-logo.jpg')); await page.waitForTimeout(1500);
  check('picked image shrunk + previewed', /^data:image\/jpeg/.test(await page.getAttribute('#ai-prev', 'src')) && await page.isVisible('#ai-save'));
  await page.click('#ai-save'); await page.waitForTimeout(1800);
  check('saved → custom image', /Custom image/.test(await page.innerText('#ai-state')) && /^data:image/.test(await page.evaluate(() => state.appSettings.about_image_url || '')));
  await page.click('#pcr-credit .pcr-about-btn'); await page.waitForTimeout(700);
  check('About shows the new image', /^data:image/.test(await page.getAttribute('#about-img', 'src')));
  await page.evaluate(() => closeModal());
  await page.click('#ai-reset'); await page.waitForTimeout(1500);
  check('reset to default', /Default poster/.test(await page.innerText('#ai-state')) && !(await page.evaluate(() => state.appSettings.about_image_url || '')));
  r = await api('setAboutImage', { reset: true });
  check('server accepts superadmin reset', r.success, JSON.stringify(r));

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(1); });
