// 3.5.3 TEST cutover helper: node tools/test-env/owner-tool.js whoami|triggers|removeTriggers|installTriggers|testmail [SITE]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const MODE = process.argv[2] || 'whoami', SITE = process.argv[3] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  await p.goto(SITE, { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); }); await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  await p.fill('#login-email', 'pcrstaffapp+t-super@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
  await p.waitForFunction(() => state.user, null, { timeout: 150000 });
  const r = await p.evaluate(async m => {
    if (m === 'testmail') { const t = await api('sendTestEmail', {}); const l = await api('testMailLog', { to: '' }); return { send: t, lastLog: l && l.data && l.data.mails && l.data.mails[0] && { at: l.data.mails[0].at, to: l.data.mails[0].to, subject: l.data.mails[0].subject } }; }
    return api('testMailLog', { ownerTool: m });
  }, MODE);
  console.log(JSON.stringify({ site: await p.evaluate(() => API_URL), result: r }, null, 1));
  await b.close();
})();
