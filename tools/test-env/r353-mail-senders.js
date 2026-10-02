// 3.5.3 TEST: Superadmin › App settings › Email sender › Sender emails. Adds pcrstaffapp@gmail.com (kept — that is the wanted end state),
// adds + removes a throwaway address, checks the status / "Use this sender" guard (mail_from is never set by this test), layout at 390 + 320.
//   node tools/test-env/r353-mail-senders.js SITE_URL [shotDir]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/353') + '/';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'pcrstaffapp+t-' + k + '@gmail.com';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const hide = s => String(s).split(PW).join('***');
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + hide(x).slice(0, 300) : '')); };
// expected role pages (3.5.0)
const ROLE = {
  staff: { groups: [], pages: [] },
  hod:   { groups: ['dept'], pages: ['approvals', 'deptadmin', 'people', 'peoplelinks', 'leavecal'] },
  asst:  { groups: ['dept'], pages: ['approvals', 'deptadmin', 'people'] },
  chef:  { groups: ['kitchen'], pages: ['kitchenadmin', 'kitchenlists', 'kitchenapprovals', 'chefmenu', 'mealstats'] },
  boat:  { groups: ['boat'], pages: ['boatadmin', 'resortboat', 'boatemergency'] },
  admin: { groups: ['admin'], pages: ['approvals', 'adminhub', 'people', 'peoplelinks', 'leavecal', 'leavelist', 'system'] },
  super: { groups: [], pages: ['adminoverview', 'approvals', 'manage'] }
};
const OLD = { usersv3: 'people', gllink: 'people', deptstaff: 'peoplelinks', boatruns: 'boatadmin', kitchenreports: 'mealstats', nosuchpage: 'home' };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.dismiss());
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  const api = (a, p) => ev(([a, p]) => api(a, p || {}), [a, p]);
  const go = async t => { await ev(t => navigate(t), t); await page.waitForTimeout(1500); await until(() => ev(() => !/Loading/.test((document.getElementById('main-content') || {}).innerText || '')), 30000); };
  const noScroll = () => ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  async function login(key) {
    cur = key;
    await ev(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(500);
    await ev(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', PW);
    await page.click('#login-form button[type=submit]');
    const ok = await until(() => ev(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 45000);
    check('login', ok); await page.waitForTimeout(1500);
    await ev(() => { try { closeModal(); } catch (e) {} });
    return ok;
  }
  await page.goto(SITE, { waitUntil: 'load' });
  await ev(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  check('API_URL is the TEST backend', await ev(L => API_URL.indexOf(L) < 0 && API_URL.indexOf('AKfycbx41ef') >= 0, LIVE));
  check('frontend 3.5.x', /^3\.5\.\d+$/.test(await ev(() => APP_VERSION)));
  const ver = await ev(() => api('getVersion', {}).catch(e => ({ error: String(e) })));
  check('backend 3.5.x-test', /^3\.5\.\d+-test$/.test((ver && (ver.version || (ver.data && ver.data.version))) || ''), JSON.stringify(ver));

  if (await login('super')) {
    const before = await api('getAppSettings', {});
    const fromBefore = String((before && before.data && before.data.settings && before.data.settings.mail_from) || '');
    await go('system');
    check('Email sender card has a Sender emails box', await until(() => ev(() => !!document.querySelector('#st-mail-card #ms-card')), 20000));
    const loaded = await until(() => ev(() => !/Checking Gmail/.test((document.getElementById('ms-owner') || {}).innerText || '')), 45000);
    const ownTxt = await ev(() => (document.getElementById('ms-owner') || {}).innerText || '');
    check('alias status loaded (or a clear "re-authorise" / old-server message)', loaded && /Script account|re-authorise|3\.5\.3 server/.test(ownTxt), ownTxt);
    const tmp = 'pcrstaffapp+t-sender' + (Date.now() % 100000) + '@gmail.com';
    for (const e of ['pcrstaffapp@gmail.com', tmp]) {
      await page.fill('#ms-add-email', e); await page.click('#ms-add');
      check('added ' + e, await until(() => ev(e => !!document.querySelector('#ms-list .ms-row[data-email="' + e + '"]'), e), 45000));
    }
    const row = await ev(() => { const r = document.querySelector('#ms-list .ms-row[data-email="pcrstaffapp@gmail.com"]'); return r ? { st: r.dataset.status, use: !!r.querySelector('.ms-use'), txt: r.innerText } : null; });
    check('pcrstaffapp@gmail.com shows a status chip', !!row && /Verified|Pending|Not added|unknown/i.test(row.txt), JSON.stringify(row));
    check('"Use this sender" only offered when verified', !!row && row.use === (row.st === 'verified'), JSON.stringify(row));
    check('manual Gmail step explained (opened after Add)', await ev(() => { const h = document.getElementById('ms-howto'); return !!h && h.open && /Send mail as/.test(h.innerText) && /Workspace/.test(h.innerText); }));
    if (row && row.st !== 'verified') {
      const u = await api('useMailSender', { email: 'pcrstaffapp@gmail.com', passcode: 'wrong' });
      check('server refuses useMailSender without the superadmin code', u && !u.success, JSON.stringify(u));
    }
    await ev(() => document.getElementById('ms-card').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
    await page.screenshot({ path: S + 'super-sender-emails-390.png' });
    check('no sideways scroll at 390', await noScroll());
    await page.setViewportSize({ width: 320, height: 720 }); await page.waitForTimeout(600);
    await ev(() => document.getElementById('ms-card').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
    await page.screenshot({ path: S + 'super-sender-emails-320.png' });
    check('no sideways scroll at 320', await noScroll());
    check('Add button fits at 320', await ev(() => { const b = document.getElementById('ms-add').getBoundingClientRect(); return b.right <= window.innerWidth && b.width > 30; }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#ms-list .ms-del[data-email="' + tmp + '"]');
    check('removed the throwaway address', await until(() => ev(e => !document.querySelector('#ms-list .ms-row[data-email="' + e + '"]'), tmp), 45000));
    const after = await api('getAppSettings', {});
    check('mail_from unchanged by the test', String((after && after.data && after.data.settings && after.data.settings.mail_from) || '') === fromBefore, fromBefore);
    check('pcrstaffapp@gmail.com kept on the sender list', /pcrstaffapp@gmail\.com/.test(String((after && after.data && after.data.settings && after.data.settings.mail_sender_list) || '')));
  }
  cur = 'end';
  check('no live API calls', liveCalls === 0, liveCalls);
  check('no page errors', !errors.length, errors.join(' | '));
  console.log(pass + ' passed, ' + fail + ' failed · shots ' + S);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(2); });
