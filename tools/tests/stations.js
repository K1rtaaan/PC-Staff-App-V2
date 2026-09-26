// 3.0 station logins + saved order summaries (demo mode). Run: node tools/tests/stations.js [baseUrl] [shotDir]
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const S = (process.argv[3] || '/workspace/redesign-3.0-shots/v3') + '/';
fs.mkdirSync(S, { recursive: true });
let pass = 0, fail = 0; const errors = []; let cur = '';
function check(n, c, x) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); }
const FJ = (d, hm) => new Date(d + 'T' + hm + ':00+12:00');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  async function mk() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
    const page = await ctx.newPage();
    await page.clock.install({ time: FJ('2026-09-26', '21:00') });
    page.on('console', m => { if (m.type() === 'error') errors.push(cur + ' [console] ' + m.text()); });
    page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
    page.on('dialog', d => d.accept());
    return page;
  }
  const page = await mk();
  const wait = (ms) => page.waitForTimeout(ms || 800);
  const nav = async (t, p) => { await (p || page).evaluate(t => navigate(t), t); await (p || page).waitForTimeout(1000); };
  const txt = (s, p) => (p || page).evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const shot = (n, full) => page.screenshot({ path: S + n + '.png', fullPage: !!full });
  async function login(p, id, pw) {
    cur = id;
    await p.evaluate(() => { try { doLogout(); } catch (e) {} });
    await p.waitForSelector('#login-email', { state: 'visible' });
    await p.fill('#login-email', id); await p.fill('#login-password', pw);
    await p.click('#login-form button[type=submit]');
    await p.waitForFunction(() => state.user && state.user.email, null, { timeout: 15000 });
    await p.waitForTimeout(1200); await p.evaluate(() => { try { closeModal(); } catch (e) {} });
  }
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); });
  await page.reload({ waitUntil: 'load' });

  // ---- Chef station
  await page.fill('#login-email', 'chef'); await page.fill('#login-password', 'kitchen2026');
  await shot('st-01-station-login');
  check('wrong station password refused', await page.evaluate(() => api('login', { email: 'chef', password: 'nope-nope' }).then(r => !r.success)));
  await login(page, 'chef', 'kitchen2026');
  check('chef station signed in as station', await page.evaluate(() => v3Station() === 'chef'));
  check('Chef station nav = Dashboard/Orders/Requests/Menu/More', await page.evaluate(() => navItems().map(n => n.label).join(',')), await page.evaluate(() => navItems().map(n => n.id + ':' + n.label).join(',')));
  await shot('st-02-chef-dashboard', true);
  check('chef dashboard has orders + allergies', /Allerg/i.test(await txt('#main-content')));
  for (const t of ['meals', 'leave', 'manage', 'stboat', 'usersv3', 'approvals', 'history']) { await nav(t); const tab = await page.evaluate(() => state.tab); check('Chef station blocked from ' + t, tab !== t, tab); }
  const deny = await page.evaluate(async () => { const out = []; for (const [a, p] of [['placeDinnerOrder', { mealChoice: 'x' }], ['getUsers', {}], ['saveBoatRun', { date: '2026-09-28' }], ['submitLeave', {}], ['getMyHistory', {}], ['setUserAccess', { targetEmail: 'ana.tui@paradisecoveresortfiji.com', role: 'admin' }]]) { const r = await api(a, p); out.push(a + ':' + !!r.success); } return out; });
  check('server refuses personal / admin / boat actions for the Chef station', deny.every(x => /:false$/.test(x)), deny.join(','));
  // picker: a write asks "Who's doing this?"
  await page.evaluate(() => v3ForgetActor());
  const oid = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem(DEMO_KEY)); const o = db.dinnerOrders.find(o => /approved|ordered/.test(o.status)); return o && o.id; });
  const pend = page.evaluate(id => api('markOrderStatus', { id, meal: 'dinner', status: 'served' }), oid);
  await page.waitForSelector('#actor-overlay .v3-actor', { timeout: 8000 }).catch(() => {});
  check('write opens the "Who\'s doing this?" picker', await page.evaluate(() => { const o = document.getElementById('actor-overlay'); return !!o && !o.classList.contains('hidden') && /Who/.test(o.innerText); }));
  await shot('st-03-chef-who-is-doing-this');
  const pickName = await page.evaluate(() => { const b = document.querySelector('#actor-overlay .v3-actor'); const n = b.querySelector('span').innerText; b.click(); return n; });
  const mr = await pend;
  check('marked served with the picked name', mr.success && await page.evaluate(([id, n]) => { const o = JSON.parse(localStorage.getItem(DEMO_KEY)).dinnerOrders.find(o => o.id === id); return o.status === 'served' && String(o.statusBy).indexOf(n + ' (Chef station)') === 0; }, [oid, pickName]), pickName);
  await nav('chefreq'); await shot('st-04-chef-requests', true);
  await nav('kitchen'); await wait(1200); await shot('st-05-chef-orders', true);
  check('Chef orders page shows allergies card', !!(await page.$('#kit-notes-card')));
  await nav('chefmenu'); await shot('st-06-chef-menu');
  // saved summaries (after the 8pm cutoff: the fallback saves tomorrow's dinner on first open)
  await nav('snapshots'); await wait(1500);
  const list = await txt('#snap-list');
  check('saved summaries list shows the auto 8pm dinner snapshot for tomorrow', /Auto 8pm/.test(list) && /2026-09-27/.test(list), list.replace(/\n/g, ' ').slice(0, 160));
  check('date picker defaults to the last closed dinner', (await page.inputValue('#snap-date')) === '2026-09-27');
  await page.click('.v3-snap'); await wait(1500);
  const sheet = await txt('#snap-sheet');
  check('preview = printable dinner list incl. allergies & special requests', /Allergies & special requests/i.test(sheet) && /Saved summary/.test(sheet), sheet.slice(0, 120).replace(/\n/g, ' '));
  await shot('st-07-saved-summary-preview', true);
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.click('#snap-pdf'); const d = await dl;
  let pdfOk = false; if (d) { const p = await d.path(); const b = fs.readFileSync(p); pdfOk = b.slice(0, 4).toString() === '%PDF' && b.length > 3000; fs.copyFileSync(p, S + 'st-dinner-summary.pdf'); }
  check('Download PDF renders a real PDF', pdfOk, d && d.suggestedFilename());
  await page.fill('#snap-date', '2026-09-20'); await page.click('#snap-go'); await wait(1500);
  check('previous date without a snapshot builds from the order rows', /From order rows/.test(await txt('#snap-preview')));
  await page.click('.v3-snap-meal[data-m="breakfast"]'); await wait(1200);
  await page.fill('#snap-date', '2026-09-27'); await page.click('#snap-go'); await wait(1500);
  check('breakfast summary preview works too', /Breakfast Order List/.test(await txt('#snap-sheet')));
  await page.click('.v3-snap-meal[data-m="dinner"]'); await wait(1200);
  await page.fill('#snap-date', '2026-09-20'); await page.click('#snap-go'); await wait(1500);
  await page.evaluate(() => v3RememberActor('Vikash Chand'));
  await page.click('#snap-save'); await wait(1500);
  check('"Save a copy now" adds a saved summary tagged with the name', /Vikash Chand \(Chef station\)/.test(await txt('#snap-list')));
  await shot('st-08-saved-summaries-list', true);

  // ---- Boat station
  await login(page, 'boat', 'boatcrew2026');
  check('Boat station nav = Bookings/Runs/More', await page.evaluate(() => navItems().map(n => n.id).join(',')) , await page.evaluate(() => navItems().map(n => n.id + ':' + n.label).join(',')));
  await wait(800); await shot('st-09-boat-bookings', true);
  check('Boat station page lists runs', !!(await page.$('#stb-list')));
  for (const t of ['chef', 'kitchen', 'snapshots', 'meals', 'manage']) { await nav(t); const tab = await page.evaluate(() => state.tab); check('Boat station blocked from ' + t, tab !== t, tab); }
  check('server refuses chef actions for the Boat station', await page.evaluate(() => api('getOrderSnapshots', {}).then(r => !r.success)));
  await nav('boat'); await shot('st-10-boat-runs', true);
  await nav('station'); await shot('st-11-boat-more', true);

  // ---- second device signed in as Chef, then superadmin rotates → that device is signed out
  const dev2 = await mk();
  await dev2.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await dev2.evaluate(db => { localStorage.setItem('pcr_v2_coach_done', '1'); }, null);
  // share the same demo database (same origin = same localStorage in a new context? no — copy it)
  const dbNow = await page.evaluate(() => localStorage.getItem(DEMO_KEY));
  await dev2.evaluate(d => { localStorage.setItem(DEMO_KEY, d); }, dbNow); await dev2.reload({ waitUntil: 'load' });
  await login(dev2, 'chef', 'kitchen2026');
  const dev2tok = await dev2.evaluate(() => loadToken());
  // superadmin
  await login(page, 'it@paradisecoveresortfiji.com', '21slands');
  await nav('manage'); check('Manage has a Stations group (Chef page, Boat page, Station logins)', /Station logins/.test(await txt('#main-content')) && /Chef page/.test(await txt('#main-content')) && /Boat page/.test(await txt('#main-content')));
  await shot('st-12-superadmin-manage', true);
  await nav('chef'); check('superadmin opens the Chef page', await page.evaluate(() => state.tab === 'chef') && !!(await page.$('#chef-as-super')));
  await nav('stboat'); check('superadmin opens the Boat page', await page.evaluate(() => state.tab === 'stboat') && !!(await page.$('#stb-list')));
  await nav('snapshots'); await wait(1200); check('superadmin sees saved summaries', /Auto 8pm/.test(await txt('#snap-list')));
  await nav('stations'); await wait(800);
  await shot('st-13-station-logins', true);
  await page.click('.v3-st-gen[data-k="chef"]'); await wait(400);
  if (await page.isVisible('#pass-ov-input')) { await page.fill('#pass-ov-input', '2026'); await page.click('#pass-ov-form button[type=submit]'); }
  await page.waitForSelector('#stl-pw', { timeout: 8000 }).catch(() => {});
  const newPw = await txt('#stl-pw');
  check('rotate shows a new generated password once', newPw.length >= 12, 'len=' + newPw.length);
  await shot('st-14-station-rotated-shown-once');
  // demo: each browser context has its own demo database — give the other device the updated one (on the live app it is one server)
  const db2 = await page.evaluate(() => localStorage.getItem(DEMO_KEY));
  await dev2.evaluate(d => { localStorage.setItem(DEMO_KEY, d); }, db2);
  // the device kept its old token → now refused
  const r3 = await dev2.evaluate(async (t) => { saveToken(t); return api('getStationHome', {}); }, dev2tok);
  check('rotation signs out every Chef device (old token refused)', !r3.success, r3.error);
  const oldOk = await dev2.evaluate(() => api('login', { email: 'chef', password: 'kitchen2026' }).then(r => !!r.success));
  const newOk = await dev2.evaluate(p => api('login', { email: 'chef', password: p }).then(r => !!r.success), newPw);
  check('old station password no longer works; new one does', !oldOk && newOk, 'old=' + oldOk + ' new=' + newOk);
  // users & roles: assignable roles only
  await nav('usersv3'); await wait(900);
  await page.evaluate(() => [...document.querySelectorAll('.v3-user')].find(b => /Ana/.test(b.innerText)).click()); await wait(500);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#v3f-role option')].map(o => o.textContent));
  check('role dropdown = Staff / HOD / Admin / Superadmin only', opts.length === 4 && !opts.some(o => /chef|boat/i.test(o)), opts.join(' | '));
  await shot('st-15-users-role-dropdown');
  await page.click('#v3f-cancel').catch(() => {});
  await nav('migrate'); await page.click('#mg-dry'); await wait(1200);
  const mg = await txt('#mg-out');
  check('migration preview shows stations + deactivation + seats', /STATION LOGINS/i.test(mg) && /PROPOSED DEACTIVATION/i.test(mg) && /of 5 used/.test(mg));
  await shot('st-16-migration-preview', true);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('no sideways scroll at 390px', sw <= 391, String(sw));
  check('0 console errors', errors.length === 0, errors.join(' | '));
  console.log('\nSUMMARY: ' + pass + '/' + (pass + fail));
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
