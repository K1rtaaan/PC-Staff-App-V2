// 3.5.2a LIVE check, signed out: Register dropdown has Front Office / Stores / Medical, no Band / Naisoso (nothing submitted).
const { chromium } = require('playwright-core');
const BASE = 'https://k1rtaaan.github.io/PC-Staff-App-V2/', OUT = process.argv[2] || '/workspace/v3-test-shots/live-352/06-live-signup-fixed.png';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '?nc=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 60000 }); await p.waitForTimeout(4000);
  const ver = await p.evaluate(() => APP_VERSION), api = await p.evaluate(() => fetch(API_URL + '?action=getVersion').then(r => r.json()).then(j => j.version));
  await p.evaluate(() => { const t = [...document.querySelectorAll('button, a')].find(e => /^\s*register\s*$/i.test(e.textContent)); if (t) t.click(); }); await p.waitForTimeout(1200);
  const o = await p.evaluate(() => [...document.querySelectorAll('#reg-department option')].map(x => x.textContent.trim()));
  const ok = ['Front Office', 'Stores', 'Medical'].every(d => o.includes(d)) && !o.some(d => /^(band|naisoso)$/i.test(d));
  await p.evaluate(() => { const s = document.getElementById('reg-department'); if (s) { s.size = 22; s.style.height = 'auto'; s.value = 'Front Office'; s.scrollIntoView({ block: 'start' }); } });
  await p.waitForTimeout(400); await p.screenshot({ path: OUT });
  console.log(JSON.stringify({ ui: ver, api, options: o, errors: errs })); console.log(ok && ver === '3.5.2a' && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
