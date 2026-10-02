// 3.3.0 TEST-environment flows at 390px on the TEST site + TEST backend (real deployment or gas-emulator.js):
//   meals sub-tabs (remembered, 320px), My meals, chef feedback (meal + date → chef page),
//   resort boat (PCE): staff day off + return and other reason → HOD approve (both legs) → boat manager / admin confirm
//   → manifest + print; HOD reject, admin reject, staff cancel; notifications + admin/HOD logs.
//   node tools/test-env/r330-test-env.js SITE_URL [shotDir]
// Password: TEST_PASSWORD= line in /workspace/test-env-accounts.txt (or env TEST_PASSWORD). Never printed.
// Test data: requests use dates 40–89 days ahead (free slot picked automatically) and reasons start with "[auto-test]";
// everything left pending is cancelled at the end. Confirmed / rejected rows stay as history (marked [auto-test]).
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const SITE = process.argv[2] || 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/';
const S = (process.argv[3] || '/workspace/v3-test-shots/330') + '/';
const LIVE = 'AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8';
const PW = process.env.TEST_PASSWORD || (fs.readFileSync('/workspace/test-env-accounts.txt', 'utf8').match(/^TEST_PASSWORD=(\S+)/m) || [])[1];
const A = k => 'groupit.paradisecoveresortfiji+t-' + k + '@gmail.com';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0, cur = ''; const errors = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (x !== undefined && !c ? ' — ' + String(x).slice(0, 400) : '')); };
const TAG = '[auto-test] ' + new Date().toISOString().slice(0, 16);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let liveCalls = 0;
  await page.route(u => String(u).indexOf(LIVE) >= 0, r => { liveCalls++; r.abort(); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  const txt = s => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async t => { await page.evaluate(t => navigate(t), t); await page.waitForTimeout(2500); };
  const shot = n => page.screenshot({ path: S + n + '.png', fullPage: true });
  const api = async (a, p) => { let e0; for (let i = 0; i < 4; i++) { try { return await page.evaluate(([a, p]) => api(a, p || {}), [a, p]); } catch (e) { e0 = e; await page.waitForTimeout(3000); } } throw e0; };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  const noScroll = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  async function login(key) {
    cur = key;
    await page.evaluate(() => { try { doLogout(); } catch (e) {} });
    await page.waitForTimeout(500);
    await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); localStorage.setItem('pcrtest_guides_off', '1'); });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await page.fill('#login-email', A(key)); await page.fill('#login-password', PW);
    await page.click('#login-form button[type=submit]');
    let ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000);
    if (!ok && await page.isVisible('#login-email')) { // slow / flaky Apps Script: one retry
      await page.fill('#login-email', A(key)); await page.fill('#login-password', PW); await page.click('#login-form button[type=submit]');
      ok = await until(() => page.evaluate(() => typeof state !== 'undefined' && !!(state.user && state.user.email)), 60000);
    }
    check('login ' + A(key), ok, await txt('#login-form'));
    await page.waitForTimeout(2000);
    await page.evaluate(() => { ['a31-notice-ok', 'a33-later'].forEach(id => { const b = document.getElementById(id); if (b) b.click(); }); try { closeModal(); } catch (e) {} });
    return ok;
  }
  const mine = async () => ((await api('getResortBoat', { scope: 'mine' })).data || {}).requests || [];
  const formSubmit = async (note) => { await until(() => page.isVisible('#v3f-submit'), 5000); if (note) { const f = await page.$('#v3f-note'); if (f) await f.fill(note); } await page.click('#v3f-submit'); await page.waitForTimeout(3000); };
  const statusIs = async (id, re) => until(async () => { const x = (await mine()).find(r => r.id === id); return x && re.test(x.status); }, 45000);
  const fj = n => { const d = new Date(Date.now() + 12 * 3600e3 + n * 86400e3); return d.toISOString().slice(0, 10); };

  await page.goto(SITE, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('pcrtest_v2_coach_done', '1'); }); await page.reload({ waitUntil: 'load' });
  cur = 'site';
  const ver = await api('getVersion', {}).catch(e => ({ error: String(e.message || e) }));
  const vs = ver && (ver.version || (ver.data && ver.data.version)) || '';
  check('backend getVersion is 3.3.0+-test (or emulator)', /^3\.[345]\.\d+-test/.test(vs), JSON.stringify(ver));
  check('frontend APP_VERSION 3.3.0+', /^3\.[345]\.\d+$/.test(await page.evaluate(() => APP_VERSION)));

  // ================= meals sub-tabs + My meals + chef feedback (staff)
  await login('staff');
  await page.evaluate(() => { localStorage.removeItem('pcrtest_meals_tab'); state._mealTab = null; });
  await nav('meals');
  const tabs = await page.$$eval('#meal-tabs .r33-tab', x => x.map(e => e.textContent.trim()));
  check('meals: 4 sub-tabs in order', JSON.stringify(tabs) === JSON.stringify(['My meals', 'Dinner', 'Lunch', 'Breakfast']), JSON.stringify(tabs));
  check('meals: My meals is the default', await page.getAttribute('#meal-tabs-mine', 'aria-selected') === 'true');
  check('My meals: day switch + 3 meal rows', await page.$$eval('#my-meals-days button', x => x.length) === 3 && await page.$$eval('[data-mymeal]', x => x.length) === 3);
  check('My meals: feedback to chef form here', !!(await page.$('#meal-panel #fb-msg')) && !!(await page.$('#fb-meal')) && !!(await page.$('#fb-date')));
  await shot('01-meals-my-meals');
  for (const m of ['dinner', 'lunch', 'breakfast']) {
    await page.click('#meal-tabs-' + m); await page.waitForTimeout(800);
    const ids = await page.$$eval('#meal-panel [id^=meal-card-]', x => x.map(e => e.id));
    check('meals: ' + m + ' tab shows only the ' + m + ' card', ids.length === 1 && ids[0] === 'meal-card-' + m, JSON.stringify(ids));
    check('meals: ' + m + ' no feedback form', !(await page.$('#meal-panel #fb-msg')));
    await shot('02-meals-' + m);
  }
  await page.click('#meal-tabs-lunch'); await page.waitForTimeout(500);
  check('meals: last tab stored', await page.evaluate(() => localStorage.getItem('pcrtest_meals_tab')) === 'lunch');
  await nav('home'); await nav('meals');
  check('meals: tab remembered after navigating away', await page.getAttribute('#meal-tabs-lunch', 'aria-selected') === 'true');
  await page.reload({ waitUntil: 'load' }); await until(() => page.evaluate(() => !!(state.user && state.user.email)), 30000); await page.waitForTimeout(2000);
  await nav('meals');
  check('meals: tab remembered after reload', await page.getAttribute('#meal-tabs-lunch', 'aria-selected') === 'true');
  await page.setViewportSize({ width: 320, height: 700 });
  for (const m of ['mine', 'dinner', 'lunch', 'breakfast']) { await page.click('#meal-tabs-' + m); await page.waitForTimeout(700); const s = await noScroll(); check('320px: ' + m + ' no sideways scroll', s.sw <= s.cw, JSON.stringify(s)); }
  await page.setViewportSize({ width: 390, height: 844 });
  // chef feedback with meal + date
  await page.click('#meal-tabs-mine'); await page.waitForTimeout(800);
  const fbMsg = TAG + ' lunch rice was cold';
  await page.selectOption('#fb-meal', 'lunch'); await page.fill('#fb-date', fj(0)); await page.fill('#fb-msg', fbMsg);
  await shot('03-chef-feedback-form');
  await page.click('#btn-feedback');
  const fbOk = await until(async () => (await page.inputValue('#fb-msg').catch(() => '')) === '', 45000);
  check('chef feedback: form cleared after send', fbOk, await txt('#toast') + ' | ' + await txt('#data-status'));
  // My meals day switch
  await page.click('#my-meals-days button >> nth=0'); await page.waitForTimeout(600);
  check('My meals: yesterday selectable', /Yesterday/.test(await txt('#my-meals-days')));

  // ================= resort boat: staff requests
  await nav('boat');
  check('boat: Village / Resort sub-tabs', JSON.stringify(await page.$$eval('#boat-tabs .r33-tab', x => x.map(e => e.textContent.trim()))) === JSON.stringify(['Village boat', 'Resort boat']));
  await page.click('#boat-tabs-village'); await page.waitForTimeout(1500);
  check('boat: village tab keeps the village booking', !(await page.$('#rb-form')) && (await txt('#main-content')).length > 100);
  await shot('04-boat-village');
  await page.click('#boat-tabs-resort'); await page.waitForTimeout(3000);
  const tt = await txt('#pce-times');
  check('resort: timetable shows the PCE times + report-by', /9:00/.test(tt) && /8:15/.test(tt) && /2:00/.test(tt) && /1:00/.test(tt) && /3:30/.test(tt) && /Dive Shop/.test(tt) && /2:30/.test(tt), tt);
  await shot('05-boat-resort');
  // tidy: cancel pending auto-test leftovers (requests 40+ days ahead) from an earlier interrupted run
  for (const x of (await mine()).filter(x => /pending/.test(x.status) && x.date >= fj(40))) await api('cancelResortBoat', { id: x.id });
  // pick 7 free days
  const existing = await mine(); const busy = new Set(existing.filter(x => /pending|confirmed/.test(x.status)).map(x => x.date));
  let base = 40; while (base < 82 && [0, 1, 2, 3, 4, 5, 6].some(i => busy.has(fj(base + i)))) base++;
  const D = i => fj(base + i);
  const oldIds = new Set((await mine()).map(x => x.id)); const fresh = async () => (await mine()).filter(x => !oldIds.has(x.id)); // only this run's rows
  const fill = async (o) => {
    await page.check('input[name=rb-direction][value=' + o.dir + ']'); await page.fill('#rb-date', o.date); await page.dispatchEvent('#rb-date', 'change');
    await page.check('input[name=rb-run][value=' + o.run + ']'); await page.fill('#rb-pax', String(o.pax || 1));
    await page.selectOption('#rb-purpose', o.purpose); await page.waitForTimeout(200);
    if (o.purpose === 'day_off') { await page.fill('#rb-return-date', o.rdate); await page.dispatchEvent('#rb-return-date', 'change'); await page.check('input[name=rb-return-run][value=' + o.rrun + ']'); }
    else await page.fill('#rb-reason', o.reason || '');
  };
  const submit = async () => { const n = (await mine()).length; await page.click('#rb-submit'); await until(async () => (await mine()).length > n, 20000); await page.waitForTimeout(2500); };
  // validation: other reason without a reason
  await fill({ dir: 'to_resort', date: D(2), run: 'PM', purpose: 'other', reason: '' });
  check('resort form: other reason shows the reason box', await page.isVisible('#rb-reason') && !(await page.isVisible('#rb-return-date')));
  const before = (await mine()).length; await page.click('#rb-submit'); await page.waitForTimeout(1500);
  check('resort form: other without a reason is refused', (await mine()).length === before);
  const bad = await api('requestResortBoat', { direction: 'to_resort', date: D(2), run: 'PM', pax: 1, purpose: 'other', reason: '' });
  check('server: other without a reason refused', bad && bad.success === false, JSON.stringify(bad));
  const bad2 = await api('requestResortBoat', { direction: 'to_naisoso', date: D(2), run: 'AM', pax: 1, purpose: 'day_off', returnDate: D(1), returnRun: 'PM' });
  check('server: return before travel refused', bad2 && bad2.success === false, JSON.stringify(bad2));
  const bad3 = await api('requestResortBoat', { direction: 'to_naisoso', date: fj(-1), run: 'AM', pax: 1, purpose: 'other', reason: 'x past' });
  check('server: past date refused', bad3 && bad3.success === false, JSON.stringify(bad3));
  await fill({ dir: 'to_resort', date: D(2), run: 'PM', purpose: 'other', reason: TAG + ' training at head office' });
  await shot('06-resort-form-other-reason');
  await submit();
  // day off with return (out D0 AM to Naisoso, back D1 PM)
  await fill({ dir: 'to_naisoso', date: D(0), run: 'AM', purpose: 'day_off', rdate: D(1), rrun: 'PM', pax: 2 });
  check('resort form: day off shows return date + run', await page.isVisible('#rb-return-date') && !(await page.isVisible('#rb-reason')));
  check('resort form: return direction is the opposite', /Naisoso\s*→\s*Resort/.test(await txt('#rb-return-dir')), await txt('#rb-return-dir'));
  await shot('07-resort-form-day-off');
  await submit();
  // three more singles: D3 (HOD reject), D4 (admin reject), D5 (staff cancel), D6 day off (cancel both legs)
  for (const i of [3, 4, 5]) { await fill({ dir: 'to_naisoso', date: D(i), run: 'PM', purpose: 'other', reason: TAG + ' case ' + i }); await submit(); }
  await fill({ dir: 'to_naisoso', date: D(6), run: 'AM', purpose: 'day_off', rdate: D(6), rrun: 'PM' }); await submit();
  let rows = await fresh(); const at = (d, dir) => rows.find(x => x.date === d && (!dir || x.direction === dir) && x.status !== 'cancelled');
  const out0 = at(D(0), 'to_naisoso'), ret0 = at(D(1), 'to_resort'), oth = at(D(2), 'to_resort');
  check('day off: outbound + linked return created', out0 && ret0 && ret0.linkedId === out0.id && out0.leg === 'outbound' && ret0.leg === 'return', JSON.stringify([out0, ret0]));
  check('day off: pax 2 + both pending HOD', out0 && out0.pax == 2 && out0.status === 'pending_hod' && ret0.status === 'pending_hod');
  check('other reason: stored with reason, pending HOD', oth && oth.purpose === 'other' && /training/.test(oth.reason) && oth.status === 'pending_hod', JSON.stringify(oth));
  const dup = await api('requestResortBoat', { direction: 'to_resort', date: D(2), run: 'PM', pax: 1, purpose: 'other', reason: 'dup' });
  check('server: duplicate request refused', dup && dup.success === false, JSON.stringify(dup));
  await page.click('#boat-tabs-resort'); await page.waitForTimeout(2500);
  await until(async () => (await page.$$('#rb-mine [data-rb]')).length >= 7, 45000);
  check('staff list shows the requests', (await page.$$eval('#rb-mine [data-rb]', x => x.length)) >= 7);
  // staff cancel D5 (single) and D6 day off (both legs) through the UI
  const d5 = at(D(5)), d6 = at(D(6), 'to_naisoso');
  await page.click('#rb-mine [data-rb="' + d5.id + '"] .rb-cancel'); await statusIs(d5.id, /cancelled/);
  await until(() => page.$('#rb-mine [data-rb="' + d6.id + '"] .rb-cancel'), 30000);
  await page.click('#rb-mine [data-rb="' + d6.id + '"] .rb-cancel'); await statusIs(d6.id, /cancelled/); await page.waitForTimeout(2500);
  rows = await fresh();
  check('staff cancel: single cancelled', rows.find(x => x.date === D(5)).status === 'cancelled');
  check('staff cancel: day off cancels both legs', rows.filter(x => x.date === D(6)).every(x => x.status === 'cancelled') && rows.filter(x => x.date === D(6)).length === 2);
  await shot('08-resort-staff-requests');

  // ================= HOD step (t-hod approves both legs + other; rejects D3) — t-asst checks visibility
  await login('asst');
  const asst = ((await api('getResortBoat', { scope: 'hod' })).data || {}).requests || [];
  check('assistant HOD sees + can decide department requests', asst.some(x => x.id === out0.id && x.canDecide), JSON.stringify(asst.map(x => [x.id, x.canDecide])));
  await login('hod');
  // 3.5.0: resort boat requests are a chip in the ONE Approvals inbox, one card per leg
  const RB = id => '.ap-item[data-chip="resort"][data-id="' + id + '"]';
  await page.evaluate(() => { state._apChip = 'resort'; navigate('approvals'); });
  await until(async () => (await page.$$('.ap-item[data-chip="resort"]')).length >= 4, 45000);
  check('HOD: Resort boat chip on Approvals', !!(await page.$('.ap-chip[data-chip="resort"]')) && (await page.$$('.ap-item[data-chip="resort"]')).length >= 4);
  await shot('09-hod-approval');
  const hodGone = id => until(async () => !(await page.$(RB(id))), 45000);
  const tap = async (sel) => { await until(() => page.$(sel), 30000); await page.waitForTimeout(800); try { await page.click(sel, { timeout: 8000 }); } catch (e) { await page.$eval(sel, el => el.click()); } };
  const r3 = rows.find(x => x.date === D(3)), r4 = rows.find(x => x.date === D(4));
  await tap(RB(out0.id) + ' .ap-yes'); await hodGone(out0.id);
  await page.waitForTimeout(2000); await until(() => page.$(RB(ret0.id)), 30000); // per leg in 3.5.0
  await tap(RB(ret0.id) + ' .ap-yes'); await hodGone(ret0.id);
  await tap(RB(oth.id) + ' .ap-yes'); await hodGone(oth.id);
  await tap(RB(r3.id) + ' .ap-no'); await formSubmit('Short staffed that day'); await hodGone(r3.id);
  await tap(RB(r4.id) + ' .ap-yes'); await hodGone(r4.id);
  const own = await api('hodDecideResortBoat', { id: out0.id, decision: 'approve' });
  check('HOD cannot re-decide an approved request', own && own.success === false);
  const hlog = await api('getAdminLog', { area: 'dept', limit: 30 });
  check('HOD log (dept) has the resort boat decisions', hlog && hlog.success && (hlog.data.entries || []).some(e => /resort/i.test(JSON.stringify(e))), JSON.stringify(hlog).slice(0, 300));

  // staff sees statuses + notification
  await login('staff');
  rows = await fresh();
  check('after HOD: both legs pending admin', rows.find(x => x.id === out0.id).status === 'pending_admin' && rows.find(x => x.id === ret0.id).status === 'pending_admin');
  check('after HOD: D3 rejected with the note', rows.find(x => x.id === r3.id).status === 'rejected' && /Short staffed/.test(JSON.stringify(rows.find(x => x.id === r3.id))));
  const nt = await api('getMyNotifications', {});
  check('staff notified (in-app) of the HOD decision', JSON.stringify(nt).indexOf('resort_boat') >= 0, JSON.stringify(nt).slice(0, 300));

  // ================= boat manager confirms day off (both legs), rejects D4; admin confirms other reason
  await login('boat');
  await nav('resortboat'); await until(async () => (await page.$$('#rba-pending [data-rb]')).length >= 4, 45000);
  check('boat manager: confirm page lists HOD-approved', (await page.$$eval('#rba-pending [data-rb]', x => x.length)) >= 4);
  await shot('10-admin-confirm');
  const admGone = id => until(async () => !(await page.$('#rba-pending [data-rb="' + id + '"]')) && !!(await page.$('#rba-pending')), 45000);
  await tap('#rba-pending .rb-yes[data-id="' + out0.id + '"][data-both]'); await admGone(out0.id);
  await tap('#rba-pending .rb-no[data-id="' + r4.id + '"]'); await formSubmit('Run is full'); await admGone(r4.id);
  const blog = await api('getAdminLog', { area: 'boat', limit: 30 });
  check('boat log has the confirmation', blog && blog.success && (blog.data.entries || []).some(e => /resort/i.test(JSON.stringify(e))), JSON.stringify(blog).slice(0, 300));
  await login('admin');
  await nav('resortboat');
  await tap('#rba-pending .rb-yes[data-id="' + oth.id + '"]'); await admGone(oth.id);
  // manifest
  await page.fill('#rba-date', D(0)); await page.dispatchEvent('#rba-date', 'change');
  await until(async () => /TEST Staff/.test(await txt('#rba-man-body')), 45000); await page.waitForTimeout(800);
  const man = await page.$$eval('#rba-man-body [data-manifest]', x => x.map(e => [e.dataset.manifest, e.querySelector('[data-pax]').textContent, e.innerText]));
  const amOut = man.find(m => m[0] === 'AM|to_naisoso');
  check('manifest D0: AM Resort → Naisoso lists TEST Staff, 2 pax', amOut && /TEST Staff/.test(amOut[2]) && /2/.test(amOut[1]), JSON.stringify(man));
  check('manifest: print button', !!(await page.$('#rba-print')));
  await shot('11-manifest');
  const m1 = await api('getResortBoatManifest', { date: D(1) });
  const pmBack = ((m1.data || {}).runs || []).find(r => r.run === 'PM' && r.direction === 'to_resort');
  check('manifest D1: PM Naisoso → Resort has the return leg', pmBack && pmBack.passengers.some(p => p.id === ret0.id), JSON.stringify(m1).slice(0, 300));
  const m2 = await api('getResortBoatManifest', { date: D(2) });
  check('manifest D2: other-reason request confirmed', JSON.stringify(m2).indexOf(oth.id) >= 0);
  await login('staff');
  rows = await fresh();
  check('staff final: day off both legs confirmed', rows.find(x => x.id === out0.id).status === 'confirmed' && rows.find(x => x.id === ret0.id).status === 'confirmed');
  check('staff final: D4 rejected by admin', rows.find(x => x.date === D(4)).status === 'rejected');
  check('staff cannot cancel a confirmed request', ((await api('cancelResortBoat', { id: out0.id })) || {}).success === false);
  const fm = await api('getMyNotifications', {});
  check('staff notified of the confirmation', /confirm/i.test(JSON.stringify(fm)));
  await nav('boat'); await page.click('#boat-tabs-resort'); await page.waitForTimeout(3000);
  await shot('12-resort-staff-statuses');

  // ================= chef sees the feedback with meal + date
  await login('chef');
  const fb = await api('getChefFeedback', {});
  const item = JSON.stringify(fb).indexOf(fbMsg) >= 0 ? ((fb.data && (fb.data.items || fb.data.feedback || fb.data)) || []) : [];
  const it = Array.isArray(item) ? item.find(x => x.message === fbMsg) : null;
  check('chef: feedback received with meal + date', it && it.meal === 'lunch' && it.mealDate === fj(0), JSON.stringify(it || fb).slice(0, 300));
  await nav('chefcomments'); await until(async () => (await txt('#main-content')).indexOf('rice was cold') >= 0, 45000);
  check('chef page: shows meal + date', (await txt('#main-content')).indexOf('rice was cold') >= 0 && /Lunch/.test(await txt('#main-content')));
  await shot('13-chef-feedback-kitchen');

  // cleanup: cancel anything still pending from this run
  await login('staff');
  for (const x of (await mine()).filter(x => /pending/.test(x.status) && /auto-test/.test(x.reason || '') || (/pending/.test(x.status) && x.date >= D(0) && x.date <= D(6)))) await api('cancelResortBoat', { id: x.id });
  check('no live backend calls', liveCalls === 0, liveCalls);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('\nRESULT pass=' + pass + ' fail=' + fail + ' base=+' + base + 'd');
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(2); });
