// 3.7.0: speed measure on a site (default TEST): API time + payload size (signed in), and Home paint time cold vs warm (saved session).
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/', WHO = process.argv[3] || 'staff';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
  await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  await p.fill('#login-email', 'pcrstaffapp+t-' + WHO + '@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
  await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 60000 }); await p.waitForTimeout(4000);
  const res = {};
  for (const [a, pl] of [['getBootstrap', {}], ['getV3Home', {}], ['getAppSettings', {}], ['getDinnerMenus', { includePreviousDay: false }]]) {
    const ts = [], sz = [];
    for (let i = 0; i < 3; i++) { const r = await p.evaluate(async ([a, pl]) => { const t = performance.now(); const x = await api(a, pl); return [performance.now() - t, JSON.stringify(x).length]; }, [a, pl]); ts.push(r[0]); sz.push(r[1]); }
    ts.sort((x, y) => x - y); res[a] = { medianMs: Math.round(ts[1]), bytes: sz[1] };
  }
  const paint = async () => { const t = Date.now(); await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#home-dothisnow', { timeout: 90000 }); const a = Date.now() - t; await p.waitForTimeout(6000); return a; };
  const w = []; for (let i = 0; i < 3; i++) w.push(await paint()); w.sort((x, y) => x - y);
  res.homePaintWarmMs = w[1];
  res.mealsPaint = await (async () => { const t = Date.now(); await p.evaluate(() => navigate('meals')); await p.waitForFunction(() => /Dinner/.test(document.getElementById('main-content').innerText) && !document.querySelector('#main-content .skeleton, #main-content .animate-pulse'), null, { timeout: 60000 }).catch(() => {}); return Date.now() - t; })();
  console.log(JSON.stringify({ site: SITE, who: WHO, at: new Date().toISOString(), ...res }));
  await b.close();
})();
