// 3.5.2: every TEST login (pcrstaffapp+t-*) signs in via the TEST site's api(); old groupit+t-* addresses are refused.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const KEYS = ['staff', 'hod', 'asst', 'chef', 'boat', 'admin', 'super'];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  await page.goto(SITE, { waitUntil: 'load' }); await page.waitForFunction(() => typeof api === 'function', null, { timeout: 30000 });
  let fail = 0;
  for (const k of KEYS) {
    const email = 'pcrstaffapp+t-' + k + '@gmail.com';
    const r = await page.evaluate(([e, p]) => api('login', { email: e, password: p }), [email, PW]);
    const u = (r && (r.data && (r.data.user || r.data))) || {};
    const ok = !!(r && r.success);
    if (!ok) fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + email + ' roles=' + JSON.stringify(u.roles || u.role || '') + ' dept=' + (u.department || '') + (ok ? '' : ' ' + JSON.stringify(r).slice(0, 200)));
  }
  const old = await page.evaluate(p => api('login', { email: 'groupit.paradisecoveresortfiji+t-staff@gmail.com', password: p }), PW);
  console.log((old && old.success ? 'FAIL old groupit+t-staff still logs in' : 'PASS old groupit+t-staff refused'));
  if (old && old.success) fail++;
  await b.close(); process.exit(fail ? 1 : 0);
})();
