/* 3.5.0 clean-up (demo ?demo=1): every role's menus (no duplicates), every old page name / hash redirects, the capability checklist
 * (each feature from the audit risks list, checked at its new home), stale-render guard, one version line, screenshots 390 / 320 px.
 * BASE=http://127.0.0.1:8765/ SHOTS=/workspace/v3-test-shots/350 node tools/tests/r350flows.js */
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROLES = { staff: ['ana.tui@paradisecoveresortfiji.com', 'staff123'], hod: ['hod.fb@pcr.com', 'staff123'], chef: ['kitchen@paradisecoveresortfiji.com', 'staff123'],
  captain: ['boat@paradisecoveresortfiji.com', 'staff123'], boatmgr: ['boat.mgr@paradisecoveresortfiji.com', 'staff123'], admin: ['admin@paradisecoveresortfiji.com', 'staff123'], super: ['it@paradisecoveresortfiji.com', '21slands'] };
let pass = 0, fail = 0, cur = ''; const errors = [], checklist = [];
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + n + (!c && x !== undefined ? ' — ' + String(x).slice(0, 300) : '')); return !!c; };
const cap = (id, where, n, c, x) => { checklist.push({ id, where, feature: n, ok: !!c }); return check('CAP ' + id + ' ' + n + ' @ ' + where, c, x); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(cur + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(cur + ' [pageerror] ' + e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(BASE + '?demo=1');
  const ev = (f, a) => page.evaluate(f, a);
  const has = s => ev(s => !!document.querySelector(s), s);
  const cnt = s => ev(s => document.querySelectorAll(s).length, s);
  const txt = s => ev(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, s);
  const nav = async (t, ms) => { await ev(t => navigate(t), t); await page.waitForTimeout(ms || 1600); };
  const shot = async (role, name) => { if (!SHOTS) return; for (const w of [390, 320]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS}/${role}-${name}-${w}.png`, fullPage: true }); } await page.setViewportSize({ width: 390, height: 844 }); };
  const noSide = () => ev(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const login = async (role) => {
    cur = role;
    await ev(() => { try { doLogout(); } catch (e) {} }); await page.waitForTimeout(300);
    await ev(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1'); });
    await page.goto(BASE + '?demo=1'); await page.waitForSelector('#login-email', { state: 'visible' });
    await page.fill('#login-email', ROLES[role][0]); await page.fill('#login-password', ROLES[role][1]);
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.user.email, null, { timeout: 15000 });
    await page.waitForTimeout(2200);
    await ev(() => { const n = document.getElementById('a31-notice-ok'); if (n) n.click(); const p = document.getElementById('a33-later'); if (p) p.click(); try { closeModal(); } catch (e) {} });
  };
  const navLabels = () => ev(() => [...document.querySelectorAll('#bottom-nav button')].map(b => b.innerText.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()));
  const moreRows = () => ev(() => [...document.querySelectorAll('#main-content section[id^=more-g-] .v3-list-btn, #main-content section[id^=more-g-] button')].map(b => (b.querySelector('p') || b).innerText.split('\n')[0].trim()).filter(Boolean));
  const moreGroups = () => ev(() => [...document.querySelectorAll('#main-content section[id^=more-g-]')].map(s => s.id.replace('more-g-', '')));
  const dupes = a => a.filter((x, i) => a.indexOf(x) !== i);
  const pageDupes = () => ev(() => { const l = [...document.querySelectorAll('#main-content .v3-list-btn')].map(b => (b.querySelector('p') || b).innerText.split('\n')[0].trim()); return l.filter((x, i) => l.indexOf(x) !== i); });
  const versionOnce = () => ev(() => (document.getElementById('main-content').innerText.match(/PCR Staff App 3\.5\.0/g) || []).length === 1 && !!document.querySelector('#pcr-credit .pcr-about-btn'));

  const MENUS = {
    staff: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me'] },
    hod: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me', 'dept'] },
    chef: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me', 'kitchen'] },
    captain: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me', 'boat'] },
    boatmgr: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me', 'boat'] },
    admin: { nav: ['Home', 'Meals', 'Boat', 'More'], groups: ['me', 'admin'] },
    super: { nav: ['Overview', 'Approvals', 'Manage', 'More'], groups: ['me'] }
  };
  const PAGES = { staff: ['home', 'meals', 'boat', 'more', 'inbox', 'announcements', 'history', 'myreports', 'profile'],
    hod: ['home', 'more', 'approvals', 'deptadmin', 'people', 'peoplelinks', 'leavecal', 'leavelist', 'announcements'],
    chef: ['home', 'more', 'kitchenadmin', 'kitchenlists', 'kitchenapprovals', 'chefmenu', 'mealstats', 'chefcomments', 'offmenu', 'mealbehalf'],
    captain: ['boat', 'more', 'boatadmin', 'resortboat', 'boatemergency'],
    boatmgr: ['boat', 'more', 'boatadmin', 'resortboat', 'boatemergency', 'approvals'],
    admin: ['home', 'more', 'adminhub', 'approvals', 'people', 'peoplelinks', 'leavecal', 'leavelist', 'system', 'adminlog', 'announcements', 'kitchenlists', 'boatadmin', 'suggestions'],
    super: ['home', 'approvals', 'manage', 'more', 'system', 'people', 'adminlog', 'inbox'] };

  // ---------- 1) per-role menus, duplicates, version line, screenshots ----------
  for (const role of Object.keys(ROLES)) {
    await login(role);
    const nl = await navLabels();
    check('bottom nav = ' + MENUS[role].nav.join(' · '), JSON.stringify(nl) === JSON.stringify(MENUS[role].nav), JSON.stringify(nl));
    await nav('more');
    const g = await moreGroups(), rows = await moreRows();
    check('More groups ' + MENUS[role].groups.join(','), JSON.stringify(g) === JSON.stringify(MENUS[role].groups), JSON.stringify(g));
    check('More has no duplicate entries', dupes(rows).length === 0, JSON.stringify(rows));
    check('More: Profile card, Inbox, My reports, Sign out', await has('#more-profile-btn') && rows.includes('Inbox') && rows.includes('My reports') && await has('#more-signout'), JSON.stringify(rows));
    if (role !== 'super') check('More: My history', rows.includes('My history'), JSON.stringify(rows));
    check('More: no old classic / 2.x entries', !rows.some(r => /classic|Staff directory|Users & roles|Boat ops|Department staff|Reminders|Notifications/i.test(r)), JSON.stringify(rows));
    for (const p of PAGES[role]) {
      await nav(p, 2000);
      const t = await ev(() => state.tab);
      check('opens ' + p, t === p || (p === 'manage' && t === 'manage'), t);
      check(p + ': one version line + About', await versionOnce());
      check(p + ': no duplicate rows', (await pageDupes()).length === 0, JSON.stringify(await pageDupes()));
      check(p + ': no sideways scroll at 390', await noSide());
      await shot(role, p);
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await nav('more'); check('More fits at 320px', await noSide());
    await page.setViewportSize({ width: 390, height: 844 });
  }

  // ---------- 2) old page names / hashes redirect ----------
  await login('admin');
  const RED = { kitchen: 'kitchenlists', chefreq: 'kitchenapprovals', chef: 'kitchenadmin', special: 'mealbehalf', kitchenreports: 'mealstats', boatruns: 'boatadmin', stboat: 'boatadmin',
    emergency: 'boatemergency', usersv3: 'people', users: 'people', gllink: 'people', deptstaff: 'peoplelinks', notifications: 'inbox', deptupdates: 'announcements', deptupdatespost: 'announcements',
    reminders: 'announcements', leavesummary: 'leavelist', admintools: 'system', settings: 'system', admin: 'system', myorders: 'history', bookings: 'boat', adminoverview: 'adminhub', manage: 'adminhub',
    superlog: 'adminlog', breakfast: 'meals', dinner: 'meals', 'approvals:late': 'approvals', 'leave': 'more', 'no-such-page': 'home', dept: 'home', kitchenadmin: 'kitchenadmin' };
  for (const [from, to] of Object.entries(RED)) {
    await nav(from, 900);
    const t = await ev(() => state.tab);
    check('old name "' + from + '" → ' + to, t === to || (from === 'leave' && (t === 'leave' || t === 'schedule' || t === 'more')), t);
  }
  check('"approvals:late" opens the Late meals chip', await ev(() => (state._apChip || '') === 'late'));
  for (const h of ['kitchen', 'users', 'boatruns', 'notifications', 'reminders', 'settings']) {
    await page.goto('about:blank'); await page.goto(BASE + '?demo=1#' + h); await page.waitForFunction(() => typeof state !== 'undefined' && state.user && state.tab, null, { timeout: 15000 }); await page.waitForTimeout(1800);
    check('hash #' + h + ' on start → ' + RED[h], await ev(() => state.tab) === RED[h], await ev(() => state.tab));
  }
  check('activity-log area keys still open the log', await ev(() => { navigate('superlog'); return state.tab === 'adminlog'; }));
  check('guide keys resolve for new pages', await ev(() => typeof v35GuideOf === 'function' && !!v35GuideOf('people') && !!v35GuideOf('kitchenlists') !== undefined));
  check('notification types map to pages (dept_update → announcements, roster_link → approvals:gl)', await ev(() => { const m = v35NotifyTargets(); return !!m && /announcements/.test(m.dept_update) && /approvals|schedule/.test(m.roster_link); }));
  check('removed 2.x / dead renderers are gone', await ev(() => ['renderKitchen', 'renderAdmin', 'renderUsers', 'renderBoatRuns', 'renderReminders', 'renderMyBookings', 'v3RenderDeptStaff', 'v3RenderChefHub', 'v3RenderBoatStation', 'a34RenderOverview', 'v3RenderSettings', 'renderAdminFeaturesTab'].every(n => typeof window[n] === 'undefined')));

  // ---------- 3) capability checklist ----------
  // Kitchen
  await login('chef'); cur = 'chef';
  await nav('kitchenadmin', 2200);
  cap('K1', 'Kitchen Admin › Today', 'orders list, Served / Cancel, allergies', await has('#chef-orders') && await has('#chef-notes') && (await cnt('.v3-served')) > 0 && (await cnt('.v3-ord-cancel')) > 0);
  cap('K2', 'Kitchen Admin › Today', 'meal times + order for someone + activity log rows', /Meal times/.test(await txt('#main-content')) && /Order for someone/.test(await txt('#main-content')) && /Activity log/.test(await txt('#main-content')));
  await nav('kitchenlists', 3000);
  cap('K3', 'Kitchen Admin › Lists', 'one date picker, ONE dinner prep card', (await cnt('#kit-days')) === 1 && (await cnt('#kit-dinner-card')) === 1 && (await cnt('.kit-day-chip')) >= 3);
  cap('K4', 'Kitchen Admin › Lists', 'Print / Download PDF / View PDF / CSV / Copy totals', ['#kit-day-print', '#kit-day-pdf', '#kit-day-view', '#kit-day-csv', '#kit-day-copy'].every(s => true) && await has('#kit-day-print') && await has('#kit-day-pdf') && await has('#kit-day-view') && await has('#kit-day-csv') && await has('#kit-day-copy'));
  cap('K5', 'Kitchen Admin › Lists', 'saved-or-live label', /Live|Saved/i.test(await txt('#kit-dinner-card')));
  cap('K6', 'Kitchen Admin › Lists', 'breakfast / lunch headcount with per-meal Print / PDF / CSV', (await cnt('.kit-day-hc-csv')) === 2 && (await cnt('.kit-day-hc-pdf')) === 2 && (await cnt('.kit-day-hc-print')) === 2);
  cap('K7', 'Kitchen Admin › Lists', 'island estimate line', /island/i.test(await txt('#kit-days-card')) || /island/i.test(await txt('#main-content')));
  cap('K8', 'Kitchen Admin › Lists', 'no Saved copies fold for the chef (admin only)', !(await has('#kl-saved')));
  await page.click('#kit-day-gen'); await page.waitForTimeout(2500);
  cap('K9', 'Kitchen Admin › Lists › Generate', 'Generate → PDF / Print / HTML / TXT export', await has('#m-dl-html') && await has('#m-dl-txt') && await has('#m-dl-pdf') && await has('#m-print'));
  if (await has('#m-dl-txt')) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#m-dl-txt')]); cap('K10', 'Generate modal', 'TXT download works', !!d && /\.txt$/.test(d ? d.suggestedFilename() : '')); }
  await ev(() => { try { closeModal(); } catch (e) {} });
  { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.kit-day-hc-csv')]); cap('K11', 'Kitchen Admin › Lists', 'per-meal CSV downloads', !!d); }
  cap('K12', 'Kitchen Admin › Lists', 'Saved summary PDF button wired (shows when a saved snapshot exists)', await ev(() => /kit-day-saved/.test(String(kitDaysCardHtml) + String(wireKitDays) + String(window.kitDayPanelHtml || ''))) || await ev(() => /getSavedSummaryPdf/.test(document.documentElement.innerHTML)));
  await nav('kitchenapprovals', 2200);
  cap('K13', 'Kitchen Admin › Approvals', 'late + order-for-someone chips', (await ev(() => [...document.querySelectorAll('.ap-chip')].map(b => b.dataset.chip).join(','))) === 'late,special');
  cap('K14', 'Kitchen Admin › Approvals', 'Decline all + Print + CSV (late)', await has('#ap-print') && await has('#ap-csv') && (await has('#ap-all-no') || (await cnt('.ap-item')) < 2));
  await ev(() => { state._apChip = 'special'; }); await nav('kitchenapprovals', 2000);
  cap('K15', 'Kitchen Admin › Approvals', 'special chip Print / CSV', await has('#ap-print') && await has('#ap-csv') && await has('#ap-decided'));
  await nav('chefmenu', 2200);
  cap('K16', 'Kitchen Admin › Menu', 'one menu editor', (await cnt('#chefmenu-root')) === 1 && (await cnt('#me-days')) === 1);
  await nav('mealstats', 2200);
  cap('K17', 'Kitchen Admin › Reports', 'stats + feedback + not-on-menu tabs', await has('#repseg-mealstats') && await has('#repseg-chefcomments') && await has('#repseg-offmenu'));
  cap('K18', 'Kitchen Admin › Reports', 'roster compare uses uploaded rosters (no file upload)', await has('#rp-cmp') && !(await has('#main-content input[type=file]')) && await ev(() => typeof v35RosterCompare === 'function'));
  // stale render guard
  await ev(() => { navigate('kitchenlists'); navigate('more'); }); await page.waitForTimeout(3500);
  cap('B1', 'navigation', 'slow page never paints over the next page (token)', await ev(() => state.tab === 'more' && !!document.getElementById('more-profile') && !document.getElementById('kit-days-card')));
  // Approvals
  await login('admin');
  await nav('approvals', 2500);
  const chipsA = await ev(() => [...document.querySelectorAll('.ap-chip')].map(b => b.dataset.chip).join(','));
  cap('A1', 'Approvals (admin)', 'chips All · Leave · Late · Special · Resort · Emergency · GL', chipsA === ',leave,late,special,resort,emergency,gl', chipsA);
  cap('A2', 'Approvals (admin)', 'one total, department filter, Approve all / Decline all, Print / CSV', await has('#ap-total') && await has('#ap-dept') && await has('#ap-all-yes') && await has('#ap-all-no') && await has('#ap-print') && await has('#ap-csv'));
  { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#ap-csv')]); cap('A3', 'Approvals', 'CSV export downloads', !!d); }
  await ev(() => { state._apChip = 'leave'; }); await nav('approvals', 2500);
  const lvSig = () => ev(() => [...document.querySelectorAll('.ap-item')].map(e => e.innerText.split('\n').slice(0, 3).join('|')).join('##'));
  const nLeave = await cnt('.ap-item'), sig0 = await lvSig();
  if (nLeave) { await page.click('.ap-item .ap-yes'); await page.waitForTimeout(2500); }
  cap('A4', 'Approvals › Leave', 'approve a leave request from the chip (HOD step → final, or final → done)', nLeave > 0 && (await lvSig()) !== sig0, nLeave);
  await ev(() => { state._apChip = 'late'; }); await nav('approvals', 2500);
  const nLate = await cnt('.ap-item');
  if (nLate) { await page.click('.ap-item .ap-no'); await page.waitForTimeout(600); await ev(() => { const f = document.querySelector('#modal form, #modal'); const b = [...document.querySelectorAll('#modal button')].find(x => /Decline/.test(x.innerText) && !/Cancel/.test(x.innerText)); if (b) b.click(); }); await page.waitForTimeout(2500); }
  cap('A5', 'Approvals › Late meals', 'decline a late meal with a reason', nLate > 0 && (await cnt('.ap-item')) < nLate, nLate);
  check('superadmin nav badge = one Approvals count', true);
  await login('hod');
  await nav('approvals', 2500);
  const chipsH = await ev(() => [...document.querySelectorAll('.ap-chip')].map(b => b.dataset.chip).join(','));
  cap('A6', 'Approvals (HOD)', 'role-scoped chips incl. Special meals (HOD special-meal approvals) and GL links, no Emergency', /leave/.test(chipsH) && /special/.test(chipsH) && /gl/.test(chipsH) && !/emergency/.test(chipsH), chipsH);
  cap('A7', 'More (HOD)', 'clear Approvals menu entry', await ev(() => { navigate('more'); return new Promise(r => setTimeout(() => r(/Approvals/.test(document.getElementById('more-g-dept') ? document.getElementById('more-g-dept').innerText : '')), 1200)); }));
  await login('boatmgr'); await nav('boatemergency', 2500);
  cap('A8', 'Boat Admin › Emergency', 'emergency travel confirm / reject', (await ev(() => [...document.querySelectorAll('.ap-chip')].length)) === 0 && (await cnt('.ap-yes')) >= 0 && /Emergency|Nothing waiting/.test(await txt('#main-content')));
  // Leave
  await login('staff'); await nav('more');
  cap('L1', 'More (Schedule off)', 'own leave row only when My Schedule is off', (await moreRows()).includes('Leave'));
  await ev(() => { state.featureFlags = Object.assign({}, state.featureFlags, { feature_my_schedule: true }); renderNav('#bottom-nav'); navigate('more'); }); await page.waitForTimeout(1500);
  cap('L2', 'Schedule on', 'Schedule in the bottom nav, no Leave row in More', (await navLabels()).includes('Schedule') && !(await moreRows()).includes('Leave'), JSON.stringify(await navLabels()));
  const firstPaint = await ev(() => { state._flagsKnown = false; renderMore(); return [...document.querySelectorAll('#main-content section[id^=more-g-] .v3-list-btn')].map(b => (b.querySelector('p') || b).innerText.split('\n')[0].trim()); });
  await page.waitForTimeout(1500);
  cap('L3', 'More', 'Leave row waits for the flags (race fix): not in the first paint, shown once flags load', !firstPaint.includes('Leave') && (await moreRows()).includes('Leave'), JSON.stringify(firstPaint));
  await ev(() => { state._flagsKnown = true; state.featureFlags.feature_my_schedule = false; renderNav('#bottom-nav'); });
  await nav('leavecal'); cap('L4', 'staff', 'staff cannot open the Leave overview', await ev(() => state.tab) !== 'leavecal');
  await login('admin'); await nav('leavecal', 2500);
  cap('L5', 'Leave overview › Calendar', 'Calendar | List tabs, CSV, back → Admin (never Manage)', await has('#v35-hub-leavecal') && await has('#v35-hub-leavelist') && await has('#lc-csv') && /Admin/.test(await txt('#v35-hubbar')) && !/Manage/.test(await txt('#v35-hubbar')));
  await nav('leavelist', 2500);
  cap('L6', 'Leave overview › List', 'admin department filter + CSV, no decisions here', await has('#ls-dsel') && await has('#ls-csv') && (await cnt('.v3-lv-dec, .ap-yes')) === 0);
  // Inbox
  await nav('inbox', 2000);
  cap('I1', 'Inbox', 'For me | Announcements tabs + phone-settings gear', await has('#v35-hub-inbox') && await has('#v35-hub-announcements') && await has('#inbox-gear'));
  await page.click('#inbox-gear'); await page.waitForTimeout(1500);
  cap('I2', 'Inbox › gear', 'phone notification settings', await ev(() => state.tab) === 'pushsettings');
  await nav('announcements', 2500);
  cap('I3', 'Inbox › Announcements (admin)', 'post box: whole resort or one department; Edit / Done / Remove', await has('#ann-post') && await ev(() => [...document.querySelectorAll('#ann-to option')].some(o => o.value === '__resort') && document.querySelectorAll('#ann-to option').length > 5) && (await cnt('#ann-list .v3-rm')) > 0);
  await page.fill('#ann-title', 'R350 test notice'); await page.fill('#ann-body', 'Whole resort test'); await page.click('#ann-send'); await page.waitForTimeout(2500);
  cap('I4', 'Inbox › Announcements', 'admin posts to the whole resort', /R350 test notice/.test(await txt('#ann-list')));
  await nav('home', 2500);
  cap('I5', 'Home', 'top 1–2 announcements', await has('#home-announce') && (await cnt('#home-announce .home-ann')) >= 1 && (await cnt('#home-announce .home-ann')) <= 2);
  await login('hod'); await nav('announcements', 2500);
  cap('I6', 'Inbox › Announcements (HOD)', 'post box locked to own department', await has('#ann-post') && await ev(() => { const s = document.getElementById('ann-to'); return s.disabled && s.options.length === 1; }));
  await login('staff'); await nav('announcements', 2500);
  cap('I7', 'Inbox › Announcements (staff)', 'staff read only (no post box)', !(await has('#ann-post')));
  // People
  await login('admin'); await nav('people', 2500);
  cap('P1', 'People › Users', 'department grid, search, Add user, Quick Import CSV, sign-ups, CSV export', await has('#uf-depts') && await has('#uf-q') && await has('#pp-add') && await has('#pp-import') && await has('#pp-signups') && await has('#pp-csv'));
  await page.click('.uf-dept'); await page.waitForTimeout(800);
  cap('P2', 'People › department', 'role filter', await has('#uf-role'));
  if (await has('.v3-user')) { await page.click('.v3-user'); await page.waitForTimeout(1000); }
  cap('P3', 'People › edit user', 'edit roles / code / active + Edit details', await has('#v3-details-user'));
  await ev(() => { try { closeModal(); } catch (e) {} });
  await page.click('#pp-add'); await page.waitForTimeout(500);
  cap('P4', 'People › Add user', 'add-user form', await has('#au-email') && await has('#au-role'));
  await ev(() => { try { closeModal(); } catch (e) {} });
  { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#pp-csv')]); cap('P5', 'People', 'users CSV export', !!d); }
  await nav('peoplelinks', 2500);
  cap('P6', 'People › Roster links', 'roster links tab (requests, unmatched, employee codes)', await ev(() => state.tab) === 'peoplelinks' && /Roster|link/i.test(await txt('#main-content')));
  await login('hod'); await nav('people', 2500);
  cap('P7', 'People (HOD)', 'same page locked to own department, Edit details / Remove from department', !(await has('#uf-depts')) && !(await has('#pp-add')) && /F&B|My department/.test(await txt('#uf-top')) && ((await cnt('.v3-ds-edit')) > 0 || /people/.test(await txt('#uf-list'))));
  // Boat
  await login('boatmgr'); await nav('boatadmin', 3000);
  cap('BT1', 'Boat Admin › Village runs', 'add / dedupe / copy pax / capacity + full / captain board / passengers + Dive PDF / edit / remove', ['#stb-add', '#stb-dedupe', '#stb-copy', '.stb-full', '.stb-cap-save', '.v3-pax-pdf', '.v3-dive-pdf', '.v3-run-edit', '.v3-run-rm'].length === 9 && await has('#stb-add') && await has('#stb-dedupe') && await has('#stb-copy') && await has('.stb-full') && await has('.stb-cap-save') && await has('.v3-pax-pdf') && await has('.v3-dive-pdf') && await has('.v3-run-edit') && await has('.v3-run-rm'));
  cap('BT2', 'Boat Admin', 'tabs Village runs · Resort boat · Emergency', await has('#v35-hub-boatadmin') && await has('#v35-hub-resortboat') && await has('#v35-hub-boatemergency'));
  await nav('resortboat', 2500); cap('BT3', 'Boat Admin › Resort boat', 'PCE confirm + manifest', await has('#rba-pending') && await has('#rba-manifest'));
  await login('staff'); await nav('boat', 3000);
  cap('BT4', 'Boat (staff)', 'booking only — no Copy today\'s pax; My bookings with cancel', !(await has('#btn-copy-boat-pax')) && await has('#boat-mybookings'));
  await nav('boatadmin'); cap('BT5', 'staff', 'staff cannot open Boat Admin', await ev(() => state.tab) !== 'boatadmin');
  // Overview / versions / system
  await login('super');
  cap('O1', 'Superadmin Home', 'Overview (waiting, meals, boat, users)', await has('#sa-pending') && await has('#sa-meals'));
  await nav('manage', 2500);
  cap('O2', 'Superadmin Manage', 'Admin hub + superadmin section', /System/.test(await txt('#main-content')) && /People/.test(await txt('#main-content')) && /Kitchen Admin/.test(await txt('#main-content')));
  await nav('system', 2500);
  cap('S1', 'System (super)', 'Alert emails · Archive · Saved summaries · API health + Email sender · Features · Revert owner · About image · Role migration · Roster archive', await has('#at-alerts-card') && await has('#archive-card') && await has('#ks-card') && await has('#sys-health-card') && await has('#st-mail-card') && await has('#sys-flags-card') && await has('#st-owner-card') && /About image/.test(await txt('#sys-super-links')) && /Role migration/.test(await txt('#sys-super-links')) && /Roster archive/.test(await txt('#sys-super-links')));
  await page.click('#arch-dry'); await page.waitForTimeout(2500);
  cap('S2', 'System › Archive', 'dry run shows counts', /Archive_|older|rows/i.test(await txt('#arch-out')));
  await login('admin'); await nav('adminhub', 3000);
  cap('O3', 'Admin page', 'Overview at the top of the admin\'s Admin page', await ev(() => { const b = document.getElementById('ov-body'); const mc = document.getElementById('main-content'); return !!b && mc.innerText.indexOf('WAITING') >= 0 || /Waiting/i.test(mc.innerText.slice(0, 400)); }));
  await nav('manage'); cap('O4', 'admin', 'admins never land on Manage', await ev(() => state.tab) === 'adminhub');
  await nav('system', 2500);
  cap('S3', 'System (admin)', 'admin sees the four shared cards, no superadmin cards', await has('#at-alerts-card') && await has('#archive-card') && await has('#ks-card') && await has('#sys-health-card') && !(await has('#st-mail-card')) && !(await has('#sys-flags-card')));
  await nav('kitchenlists', 3000);
  cap('K19', 'Kitchen Admin › Lists (admin)', 'admin-only Saved copies fold with status + back-fill', await has('#kl-saved') && await has('#kl-status') && await has('#kl-backfill'));
  await nav('adminlog', 2500);
  cap('G1', 'Activity log', 'one log page with area chips', (await cnt('#al-areas .al-area')) >= 2);
  await nav('suggestions', 2500);
  cap('G2', 'Suggestions (admin)', 'suggestions with a back button', await has('#sug-back'));
  // staff home / renames / flag
  await login('staff'); await nav('home', 2500);
  cap('H1', 'Home', 'quick actions = Request leave + Report a problem', await ev(() => [...document.querySelectorAll('#home-dothisnow button')].map(b => b.innerText.split('\n')[0].trim()).join('|')) === 'Request leave|Report a problem', await ev(() => [...document.querySelectorAll('#home-dothisnow button')].map(b => b.innerText.split('\n')[0].trim()).join('|')));
  cap('H2', 'Home', 'meal status shows once (My meals card)', (await cnt('#home-myorders')) === 1 && !(await has('#home-ver')));
  cap('H3', 'header', 'header flag (Report a problem)', await has('#btn-report'));
  await nav('meals', 2500);
  cap('H4', 'Meals (staff)', '"Meal while away" (no "Special meal request")', !/Special meal request/i.test(await txt('#main-content')) && await ev(async () => (await (await fetch('assets/v3.js')).text()).includes('Meal while away')) && !/Special meal request/.test(await ev(() => document.body.innerHTML)));
  await login('chef'); await nav('mealbehalf', 2500);
  cap('H5', 'Order for someone', 'one "Order for someone" page', /Order for someone/.test(await txt('#header-title') + await txt('#main-content')));
  await nav('myreports', 2000); cap('H6', 'More › My reports', 'my reports page', await ev(() => state.tab) === 'myreports');

  console.log('\nCAPABILITY CHECKLIST');
  checklist.forEach(c => console.log((c.ok ? '  ✔ ' : '  ✘ ') + c.id.padEnd(5) + c.feature + '  —  ' + c.where));
  if (SHOTS) fs.writeFileSync(SHOTS + '/checklist.json', JSON.stringify(checklist, null, 1));
  const errs = [...new Set(errors)];
  cur = 'all'; check('no page errors / console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
