// 3.8.0: server-time measure on TEST — per screen: number of API calls on load, each call's time, and wall time until the calls settle.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/', OUT = process.argv[3] || '';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const SCREENS = { staff: ['home', 'meals', 'boat'], hod: ['home'], chef: ['home', 'kitchen'], boat: ['home', 'boat'] };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const all = {};
  for (const who of Object.keys(SCREENS)) {
    const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept());
    let log = null; const start = new Map();
    p.on('request', r => { if (!/script\.google\.com\/macros/.test(r.url())) return; let a = (/[?&]action=([^&]+)/.exec(r.url()) || [])[1]; if (!a) { try { a = JSON.parse(r.postData() || '{}').action; } catch (e) {} } start.set(r, [a || '?', Date.now()]); });
    p.on('requestfinished', r => { let q = r; while (q.redirectedFrom()) q = q.redirectedFrom(); const s = start.get(q); if (s && log && q !== r || (s && log && !/script\.google\.com\/macros/.test(r.url()) === false && r.response)) { if (!s.done) { s.done = 1; log.push([s[0], Date.now() - s[1], Date.now()]); } } });
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' });
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); localStorage.setItem('pcr_a2hs_dismissed', '1'); });
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
    await p.fill('#login-email', 'pcrstaffapp+t-' + who + '@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 60000 }); await p.waitForTimeout(8000);
    const res = {};
    for (const scr of SCREENS[who]) {
      const runs = [];
      for (let i = 0; i < 2; i++) {
        log = []; const t = Date.now();
        if (scr === 'home') await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); else { await p.evaluate(() => { try { cacheInvalidateMealBoat(); } catch (e) {} navigate('more'); }); await p.waitForTimeout(300); log = []; await p.evaluate(s => navigate(s), scr); }
        let last = Date.now(); const t0 = Date.now(); let n = -1;
        while (Date.now() - t0 < 45000) { await p.waitForTimeout(500); if (log.length !== n) { n = log.length; last = Date.now(); } else if (Date.now() - last > (scr === 'home' ? 9000 : 4000)) break; }
        runs.push({ calls: log.length, wallMs: (log.length ? Math.max(...log.map(x => x[2])) - t : 0), serverMs: log.reduce((s, x) => s + x[1], 0), each: log.map(x => x[0] + ':' + x[1]) });
      }
      res[scr] = runs[1];
    }
    all[who] = res; await ctx.close();
  }
  const out = JSON.stringify({ site: SITE, at: new Date().toISOString(), ...all }, null, 1); console.log(out); if (OUT) fs.writeFileSync(OUT, out);
  await b.close();
})();
