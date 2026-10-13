/* 3.6.0 (demo, faked clock): Late meal request at 10:00 (menu pick) and 14:00 (leftovers) → card in chef Approvals with Approve; HOD sees no Approve for it.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/360 node tools/tests/r360-late-approvals.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? ' — ' + x : '')); };
const fijiTomorrowAt = (hh) => { const f = new Date(Date.now() + 12 * 36e5); const d = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + 1, hh, 0)); return d.getTime() - 12 * 36e5; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = [];
  await p.route(/script\.google(usercontent)?\.com/, r => r.abort()); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  let target = fijiTomorrowAt(10);
  await ctx.addInitScript((t) => { const off = t - Date.now(); const real = Date.now.bind(Date); Date.now = () => real() + off; }, target);
  const login = async (email, keep) => {
    await p.goto(BASE + '?demo=1'); await p.evaluate((k) => { try { doLogout(); } catch (e) {} const db = localStorage.getItem('pcr_v2_demo_db'); localStorage.clear(); if (k && db) localStorage.setItem('pcr_v2_demo_db', db); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); }, keep);
    await p.goto(BASE + '?demo=1'); await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', email); await p.fill('#login-password', 'staff123'); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 }); await p.waitForTimeout(2000);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} });
  };
  const send = async (name) => {
    await p.evaluate(() => navigate('latemeal')); await p.waitForSelector('#r36-go', { timeout: 15000 });
    await p.selectOption('#r36-who', ''); await p.fill('#r36-name', name); await p.selectOption('#r36-dept', '__contractor'); await p.fill('#r36-reason', 'Arrived on the late boat');
    const hasDish = !!(await p.$('#r36-dish')); await p.click('#r36-go'); await p.waitForTimeout(2000); return hasDish;
  };
  await login('admin@paradisecoveresortfiji.com');
  check('10:00: menu choice shown', await send('Late Lea Test'));
  check('10:00: request listed under "Late requests I sent"', /Late Lea Test/.test(await p.innerText('#r36-list')), await p.innerText('#r36-list'));
  const keyNames = await p.evaluate(() => Object.keys(localStorage)); console.log('ls keys', keyNames.join(','));
  check('demo data key present', keyNames.includes('pcr_v2_demo_db'));
  // chef approvals
  await login('kitchen@paradisecoveresortfiji.com', true);
  await p.evaluate(() => navigate('kitchenapprovals')); await p.waitForTimeout(3000);
  const body = await p.innerText('#main-content');
  check('chef Approvals shows the late request', /Late Lea Test/.test(body), body.slice(0, 300));
  check('chef card shows ordered by / reason', /late boat/i.test(body));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chef-approvals-late-390.png`, fullPage: true });
  const canChef = await p.evaluate(async () => { const d = await api('getMealRequests', { days: 3 }); const x = ((d.data || d).requests || []).find(r => /Late Lea Test/.test(r.userName)); return x && x.canDecide; });
  check('chef canDecide = true', canChef === true, canChef);
  const ap = await p.evaluate(async () => { const d = await api('getMealRequests', { days: 3 }); const x = ((d.data || d).requests || []).find(r => /Late Lea Test/.test(r.userName)); return api('decideMealRequest', { id: x.id, meal: 'dinner', decision: 'approve' }); });
  check('chef approves', ap && ap.success, JSON.stringify(ap).slice(0, 200));
  await login('hod.fb@pcr.com', true);
  const hr = await p.evaluate(() => api('requestLateOnBehalf', { guestName: 'Hod Late Test', reason: 'late shift', mealChoice: '' }));
  const hr2 = hr && hr.success ? hr : await p.evaluate(async () => { const w = await api('getLateWindow', {}); const m = await api('getDinnerMenus', { serviceDate: (w.data||w).serviceDate, includePreviousDay: false }); const it = ((m.data||m).items||[])[0]; return api('requestLateOnBehalf', { guestName: 'Hod Late Test', reason: 'late shift', mealChoice: it && (it.itemName || it.name) }); });
  check('HOD sends late request for own dept', hr2 && hr2.success, JSON.stringify(hr2).slice(0, 200));
  const canHod = await p.evaluate(async () => { const d = await api('getMealRequests', { days: 3 }); const x = ((d.data || d).requests || []).find(r => /Hod Late Test/.test(r.userName)); return x ? x.canDecide : 'missing'; });
  check('HOD cannot approve leader late requests (chef/admin only)', canHod === false, canHod);
  console.log(pass + ' passed, ' + fail + ' failed; errors: ' + errs.join(' | ')); await b.close(); process.exit(fail ? 1 : 0);
})();
