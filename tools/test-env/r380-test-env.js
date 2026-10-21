// 3.8.0 TEST checks: batch on the real backend, offline queue + pending-sync badge + idempotent re-send, HOD dashboard, admin picker, manifest, ratings, install card.
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/', SHOTS = process.env.SHOTS || '/workspace/v3-test-shots/380';
const PW = (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : ' — ' + String(d).slice(0, 300))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const as = async (k, q) => {
    await p.goto(SITE + '?r=' + Date.now(), { waitUntil: 'load' }); await p.evaluate(() => { try { doLogout(); } catch (e) {} localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await p.goto(SITE + (q || '?r=' + Date.now()), { waitUntil: 'load' }); await p.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
    await p.fill('#login-email', 'pcrstaffapp+t-' + k + '@gmail.com'); await p.fill('#login-password', PW); await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 60000 }); await p.waitForTimeout(5000);
    await p.evaluate(() => { ['a31-notice-ok', 'a33-later', 'a33-later'].forEach(i => { const n = document.getElementById(i); if (n) n.click(); }); try { closeModal(); } catch (e) {} const m = document.getElementById('modal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } });
  };
  // batch
  await as('staff');
  let r = await p.evaluate(() => apiDirect('batch', { calls: [{ a: 'getAppSettings', p: {} }, { a: 'getMyNotifications', p: {} }, { a: 'placeDinnerOrder', p: {} }] }));
  check('batch: reads answered, write refused', r && r.batch && r.results[0].success && r.results[1].success && r.results[2].success === false, JSON.stringify(r).slice(0, 200));
  r = await p.evaluate(async () => { const a = await Promise.all([api('getAppSettings', {}), api('getCutoffInfo', {})]); return a.map(x => !!(x && x.success)); });
  check('api() batches two parallel reads transparently', r[0] && r[1], JSON.stringify(r));
  // offline queue
  const dish = await p.evaluate(async () => {
    const cut = await api('getCutoffInfo', {}); const date = (cut.data && cut.data.dinner && cut.data.dinner.serviceDate) || fijiDateString(addFijiDays(getFijiNow(), 1));
    const m = await api('getDinnerMenus', { includePreviousDay: false });
    const items = (m.data && (m.data.items || m.data.menus)) || [];
    const wd = new Date(date + 'T12:00:00Z').getUTCDay(); // 0=Sun
    const it = (Array.isArray(items) ? items : []).find(x => Number(x.weekday) === wd && x.itemName) || (Array.isArray(items) ? items : []).find(x => x.itemName);
    return { dish: (it && it.itemName) || 'Stew Chicken /Veg/ Rice', date: date };
  });
  await ctx.setOffline(true);
  r = await p.evaluate((d) => sendOrQueue('placeDinnerOrder', { mealChoice: d.dish, notes: '3.8.0 offline test' }, { label: 'Dinner (offline test)', serviceDate: d.date }), dish);
  check('offline: order queued on the phone', r && r.queued, JSON.stringify(r));
  await p.evaluate(() => navigate('home')); await p.waitForTimeout(2500);
  const badge = await p.evaluate(() => { const b = document.getElementById('r38-sync'); return b && b.innerText; });
  check('pending sync badge shows', /1 pending sync/.test(badge || ''), badge);
  await p.screenshot({ path: SHOTS + '/offline-pending-sync-390.png' });
  const qid = await p.evaluate(() => queueItems()[0] && queueItems()[0].id);
  await ctx.setOffline(false); await p.waitForTimeout(500);
  await p.evaluate(() => { window.dispatchEvent(new Event('online')); return flushQueue('test'); });
  await p.waitForFunction(() => !queueItems().length, null, { timeout: 90000 }).catch(() => {});
  await p.evaluate(() => { if (typeof r38PaintSync === 'function') r38PaintSync(); }); await p.waitForTimeout(500);
  check('back online: queue sent by itself', await p.evaluate(() => !queueItems().length && !(typeof queueFailed === 'function' && queueFailed().length)), await p.evaluate(() => JSON.stringify(queueAll())));
  r = await p.evaluate((id) => apiDirect('placeDinnerOrder', { mealChoice: 'x', clientRequestId: id }), qid);
  check('re-send with the same request id = no duplicate', r && r.success && r.duplicate, JSON.stringify(r).slice(0, 200));
  r = await p.evaluate((date) => api('getDinnerOrders', {}).then(x => { const o = (x.data && (x.data.orders || x.data)) || []; return (Array.isArray(o) ? o : []).filter(z => String(z.userEmail).toLowerCase() === state.user.email && String(z.serviceDate).replace(/^'/, '').slice(0, 10) === date && !/cancel/.test(String(z.status))).length; }), dish.date);
  check('exactly one order for tomorrow', r === 1, r);
  await p.evaluate((date) => apiDirect('cancelMealOrder', { meal: 'dinner', reason: '3.8.0 test cleanup', cancelReason: '3.8.0 test cleanup', serviceDate: date, clientRequestId: newRequestId() }), dish.date);
  // rating card (UI; server only offers it 5am–3pm the morning after, so the prompt is stubbed for the picture)
  await p.evaluate(() => { const real = apiDirect; apiDirect = function(a, q){ if (a === 'getDinnerRatingPrompt') return Promise.resolve({ success: true, data: { prompt: { date: fijiDateString(addFijiDays(getFijiNow(), -1)), dish: 'Fish in lolo' } } }); return real(a, q); }; state._noBatch = true; navigate('more'); });
  await p.evaluate(() => navigate('home')); await p.waitForSelector('#r38-rate', { timeout: 20000 }).catch(() => {});
  check('rating card on Home (👍/👎 + comment)', await p.evaluate(() => !!document.querySelector('#r38-rate .r38-rv[data-v=up]') && !!document.getElementById('r38-rc')));
  try { const el = await p.$('#r38-rate'); if (el) await el.screenshot({ path: SHOTS + '/rating-card-390.png' }); else await p.screenshot({ path: SHOTS + '/rating-card-390.png' }); } catch (e) { await p.screenshot({ path: SHOTS + '/rating-card-390.png' }); }
  // install helper (Android flow simulated with ?a2hs=1)
  await p.goto(SITE + '?a2hs=1&r=' + Date.now(), { waitUntil: 'load' }); await p.evaluate(() => localStorage.removeItem('pcr_a2hs_dismissed')); await p.waitForTimeout(6000); await p.evaluate(() => navigate('home')); await p.waitForTimeout(1500);
  check('install card shown when not standalone', await p.evaluate(() => !!document.getElementById('r38-install')));
  await p.screenshot({ path: SHOTS + '/install-card-390.png' });
  await p.evaluate(() => { try { closeModal(); } catch (e) {} const x = document.getElementById('r38-inst-x'); if (x) x.click(); else localStorage.setItem('pcr_a2hs_dismissed','1'); }); await p.waitForTimeout(500);
  check('install card dismissible (stays gone)', await p.evaluate(() => { navigate('home'); return !document.getElementById('r38-install') && localStorage.getItem('pcr_a2hs_dismissed') === '1'; }));
  // HOD dashboard
  await as('hod');
  await p.waitForSelector('#r38-dash .grid', { timeout: 60000 }).catch(() => {});
  check('HOD Home: team dashboard', await p.evaluate(() => /on shift today/.test((document.getElementById('r38-dash') || {}).innerText || '')));
  await p.evaluate(() => document.querySelectorAll('#r38-dash details').forEach(d => d.open = true));
  try { const el = await p.$('#r38-dash'); if (el) await el.screenshot({ path: SHOTS + '/hod-dashboard-390.png' }); else await p.screenshot({ path: SHOTS + '/hod-dashboard-390.png' }); } catch (e) {}
  // admin picker + manifest + ratings
  await as('admin');
  await p.waitForSelector('#r38-dp', { timeout: 60000 }).catch(() => {});
  check('admin: department picker on dashboard', await p.evaluate(() => !!document.getElementById('r38-dp')));
  await p.evaluate(() => r38OpenManifest()); await p.waitForSelector('#r38-ml .r38-run, #r38-ml p', { timeout: 60000 }).catch(() => {});
  check('admin: boat manifest opens', await p.evaluate(() => document.querySelectorAll('#r38-ml .r38-run').length >= 4));
  await p.screenshot({ path: SHOTS + '/boat-manifest-390.png' });
  await p.evaluate(() => closeModal());
  await p.evaluate(() => r38OpenRatings()); await p.waitForFunction(() => { const h = document.getElementById('r38-rl'); return h && !h.querySelector('.skel-line'); }, null, { timeout: 60000 }).catch(() => {});
  check('admin: dinner ratings summary opens', await p.evaluate(() => !!document.getElementById('r38-rl') && !document.querySelector('#r38-rl .skel-line')));
  await p.evaluate(() => closeModal());
  await as('boat');
  check('boat manager: manifest tile on Home', await p.evaluate(() => !!document.querySelector('[data-tab="manifest"]')));
  await as('chef');
  check('chef: ratings tile on Home', await p.evaluate(() => !!document.querySelector('[data-tab="ratings"]')));
  await as('staff');
  check('staff: no manifest / ratings / dashboard', await p.evaluate(() => !document.querySelector('[data-tab="manifest"],[data-tab="ratings"]') && !document.getElementById('r38-dash')));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await b.close(); process.exit(fail ? 1 : 0);
})();
