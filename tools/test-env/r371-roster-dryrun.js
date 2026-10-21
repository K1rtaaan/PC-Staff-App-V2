// 3.7.1: dry run of the live roster upload on TEST — the app's own r34Push (start / parts / finish) with rows parsed by the app parser (node). Admin "ALL" weekly.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/', ROWS = process.argv[3] || '/workspace/rosters-live/nov-rows.json', SHOTS = process.env.SHOTS || '';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const data = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })).newPage(); p.on('dialog', d => d.accept());
  const login = async (k) => {
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
    await p.fill('#login-email', 'pcrstaffapp+t-' + k + '@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 60000 }); await p.waitForTimeout(4000);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} });
  };
  await login('admin');
  const flags = await p.evaluate(() => api('getAppSettings', {}).then(r => r.data.features)); console.log('TEST flags', JSON.stringify(flags));
  const res = process.env.SKIPUP ? 'skipped' : await p.evaluate(async (d) => { const r = await r34Push({ kind: 'weekly', key: d.periodKey, department: 'ALL', file: d.fileName, layout: 'workbook', rows: d.rows }, function(){}); return r && { shifts: r.f.shifts, people: r.f.people, unmatched: r.f.unmatched.length, reasons: r.f.unmatched.reduce((o, u) => (o[u.reason.replace(/ in .*/, ' in <dept>')] = (o[u.reason.replace(/ in .*/, ' in <dept>')] || 0) + 1, o), {}), notified: r.f.notified, skippedN: r.skippedN, unknown: Object.keys(r.unknown) }; }, data);
  console.log('TEST upload', JSON.stringify(res));
  // HOD view: Schedule visible for leaders only
  for (const k of ['hod', 'staff']) {
    await login(k);
    await p.waitForFunction(() => state._flagsKnown, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2000);
    const v = await p.evaluate(() => ({ r34On: r34On(), leaveRow: (navigate('more'), !!document.querySelector('[onclick*="leave"]')), nav: !!document.querySelector('#bottom-nav [data-tab="schedule"], #bottom-nav [onclick*="schedule"]'), leaders: featureOn('feature_schedule_leaders'), sched: featureOn('feature_my_schedule') }));
    console.log(k, JSON.stringify(v));
    if (k === 'hod' && v.r34On) { await p.evaluate(() => navigate('schedule')); await p.waitForTimeout(6000); if (SHOTS) await p.screenshot({ path: SHOTS + '/hod-schedule-390.png', fullPage: true }); }
    if (SHOTS) { await p.evaluate(() => navigate('home')); await p.waitForTimeout(3000); await p.screenshot({ path: SHOTS + '/' + k + '-home-390.png' }); }
  }
  await b.close();
})();
