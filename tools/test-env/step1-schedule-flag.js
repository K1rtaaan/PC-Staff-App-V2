// 3.4.0 prep: TEST only — superadmin turns feature_my_schedule ON via the app's normal setAppSetting path, then t-staff checks More.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const OUT = process.argv[3] || '/workspace/v3-test-shots/340/00-schedule-as-is.png';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'groupit.paradisecoveresortfiji+t-' + k + '@gmail.com';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => r.abort());
  page.on('dialog', d => d.accept());
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  async function login(key) {
    await page.evaluate(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(800);
    await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', PW);
    await page.click('#login-form button[type=submit]');
    const ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 90000);
    await page.waitForTimeout(2000);
    await page.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(id => { const b = document.getElementById(id); if (b) b.click(); }); try { closeModal(); } catch (e) {} });
    console.log('login', key, ok); return ok;
  }
  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('pcrtest_v2_coach_done', '1')); await page.reload({ waitUntil: 'load' });
  await login('super');
  const r = await page.evaluate(() => api('setAppSetting', { key: 'feature_my_schedule', value: true, passcode: '2026' }));
  console.log('setAppSetting success', r && r.success, r && r.error || '', 'flag now', JSON.stringify(r && r.data && r.data.features));
  await login('staff');
  await page.evaluate(() => { try { cacheInvalidate && cacheInvalidate(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(5000);
  console.log('staff flag', await page.evaluate(() => featureOn('feature_my_schedule')));
  await page.evaluate(() => navigate('more')); await page.waitForTimeout(3000);
  const txt = await page.evaluate(() => document.getElementById('main-content').innerText);
  console.log('More has My schedule:', /My schedule/i.test(txt));
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
