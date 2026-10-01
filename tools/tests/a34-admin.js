// PCR Staff App 3.2.0 backend unit tests: admin access to superadmin tools (d), one-time role migration + Leanne/Delai → Admin (e/f), About image (g). Harness from a31-backend.js.
// sheet store (harness copied from v300-backend.js). Run: node tools/tests/a31-backend.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); }

const U = (email, first, dept, perms, extra) => Object.assign({ id: 'u_' + email.split('@')[0].replace(/\W/g, ''), email, firstName: first, lastName: 'X', department: dept, role: perms.split(',').pop(), permissions: perms, password: 'pw-' + first, active: true, verified: true }, extra || {});
let store;
function reset() {
  store = {
    Users: [
      U('it@paradisecoveresortfiji.com', 'IT', 'IT', 'super_admin,admin', { password: '21slands', role: 'super_admin' }),
      U('it2.paradisecoveresort@gmail.com', 'Delai', 'IT', 'super_admin', { role: 'super_admin' }),
      U('ad1@x.com', 'Nicola', 'Management', 'staff,hod,admin'),
      U('chef1@x.com', 'Vicky', 'Kitchen', 'staff,chef'),
      U('paradisecovekitchen@gmail.com', 'Kitchen', 'Kitchen', 'kitchen', { role: 'kitchen', permissions: '' }),
      U('boat1@x.com', 'Akuila', 'Boat', 'boat', { role: 'boat', permissions: '' }),
      U('cap1@x.com', 'Jone', 'Boat', 'staff,boat_captain'),
      U('hod1@x.com', 'Praneel', 'Housekeeping', 'staff,hod'),
      U('ahod1@x.com', 'Mere', 'Housekeeping', 'staff', { assistantHod: true }),
      U('staff1@x.com', 'Ana', 'Housekeeping', 'staff'),
      U('staff2@x.com', 'Sami', 'Kitchen', 'staff')
    ],
    'Breakfast Orders': [], 'Lunch Orders': [], 'Dinner Orders': [], Notifications: [], 'Leave Requests': [], 'Verification Codes': [],
    'Dinner Menus': [], 'Dinner Prep Snapshots': [], 'App Settings': [], 'Chef Feedback': [], 'Role Changes': []
  };
}
reset();
let props = {}, cache = {}, mail = [], fetches = [], fetchCode = 201, snaps = [], copies = [];
let FAKE_NOW = '2026-09-28T21:00:00Z'; // Fiji wall clock
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Date, JSON, Math,
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') })
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, getKeys: () => Object.keys(props), deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] === undefined ? null : cache[k]), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { sendEmail: (m) => { mail.push(Object.assign({ via: 'mailapp' }, m)); } },
  GmailApp: { sendEmail: (to, subject, body, o) => { mail.push({ to, subject, body, via: 'gmail' }); } },
  UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); if (fetchCode === 'throw') throw new Error('no permission'); return { getResponseCode: () => fetchCode, getContentText: () => '{"message":"x"}' }; } },
  SpreadsheetApp: { flush() {} }
};
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(root, 'apps-script')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
// in-memory sheet layer
const clone = (o) => JSON.parse(JSON.stringify(o));
ctx.getFijiNow = () => new Date(Date.parse(FAKE_NOW));
ctx.sheetToObjects = (n) => (store[n] || []).map((r, i) => Object.assign(clone(r), { _row: i + 2 }));
ctx.cachedRows = ctx.sheetToObjects;
ctx.findUserByEmail = (e) => { const u = store.Users.find(x => x.email === String(e || '').trim().toLowerCase()); return u ? clone(u) : null; };
ctx.appendRow = (n, row) => { (store[n] = store[n] || []).push(clone(row)); };
ctx.updateRowById = (n, id, patch) => { const r = (store[n] || []).find(x => String(x.id) === String(id)); if (!r) return null; Object.assign(r, clone(patch)); return clone(r); };
ctx.ensureSheet = () => ({}); ctx.ensureColumns = () => {}; ctx.assertSheetsReady = () => {}; ctx.scInvalidateSheet = () => {};
ctx.getSS = () => ({ getSheetByName: (n) => /backup/.test(n) ? null : ({ copyTo: () => ({ setName: (nm) => { copies.push(nm); } }), deleteRow() {} }) });
ctx.r3NotifyMany = (rows) => rows.forEach(r => store.Notifications.push(r));
ctx.dsumSaveSnapshot = (d, auto, kind, by) => { const orders = store['Dinner Orders'].filter(o => String(o.serviceDate).slice(0, 10) === d && o.status !== 'cancelled' && o.status !== 'rejected'); const row = { id: 'snap' + snaps.length, serviceDate: d, kind, totalOrders: orders.length, statuses: orders.map(o => o.status) }; snaps.push(row); return row; };
ctx.dsumTryPdf = () => ({ ok: false, error: 'drive not authorised (test)' });
ctx.getDinnerMenus = () => ({ success: true, data: { items: [{ itemName: 'Beef Curry' }, { itemName: 'Chicken Pizza' }] } });
ctx.seedDinnerMenus = () => {};
ctx.markCodeUsed = (m) => { const r = store['Verification Codes'].find(x => x.code === m.code && x.email === m.email); if (r) r.used = true; };
const settings = {};
ctx.getSetting = (k, fb) => settings[k] !== undefined ? String(settings[k]) : (fb === undefined ? '' : String(fb));
ctx.setSetting = (k, v) => { settings[k] = String(v); };
const R = (code) => vm.runInContext(code, ctx);
const run = (fn, ...args) => ctx[fn].apply(null, args);
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
/** Simulate one client request: bind identity (token or claimed email) then route. */
function api(action, p) {
  p = Object.assign({ action }, p || {});
  const auth = run('bindRequestIdentity', action, p);
  if (auth && auth.error) { R('R3_AUTH = null'); return Object.assign({ success: false }, auth); }
  let res = run('routeAction', action, p);
  const sv = R('R3_AUTH && R3_AUTH.staffView');
  if (res && res.success === false && sv) res.needsSignIn = true;
  R('R3_AUTH = null');
  return res;
}
function login(email, pw) { const r = api('login', { email, password: pw }); return r.success ? r.data.token : null; }
const at = (iso) => { FAKE_NOW = iso; cache = {}; };
// deleteRow on Users really removes the row in this harness
ctx.findUserByEmail = (e) => { const i = store.Users.findIndex(x => x.email === String(e || '').trim().toLowerCase()); return i < 0 ? null : Object.assign(clone(store.Users[i]), { _row: i + 2 }); };
ctx.getSS = () => ({ getSheetByName: (n) => /backup/.test(n) ? null : ({ copyTo: () => ({ setName: (nm) => { copies.push(nm); } }), deleteRow(row) { if (store[n]) store[n].splice(row - 2, 1); } }) });
// A31IO over the in-memory store (App Settings live in `settings`)
const S31 = (n) => n === 'App Settings' ? Object.keys(settings).map(k => ({ key: k, value: settings[k] })) : (store[n] || []);
ctx.A31IO = {
  rows: (n) => clone(S31(n)),
  update: (n, kf, kv, fields) => { if (n === 'App Settings') { Object.assign(settings, { [kv]: fields.value }); return true; } const r = (store[n] || []).find(x => String(x[kf]).toLowerCase() === String(kv).toLowerCase()); if (!r) return false; Object.assign(r, clone(fields)); return true; },
  remove: (n, kf, kv) => { if (n === 'App Settings') { delete settings[kv]; return true; } const a = store[n] || []; const i = a.findIndex(x => String(x[kf]).toLowerCase() === String(kv).toLowerCase()); if (i < 0) return false; a.splice(i, 1); return true; },
  append: (n, row) => { if (n === 'App Settings') { settings[row.key] = row.value; return true; } (store[n] = store[n] || []).push(clone(row)); return true; },
  appendLog: (row) => { (store['Admin Log'] = store['Admin Log'] || []).push(clone(row)); },
  logRows: () => clone(store['Admin Log'] || []),
  updateLog: (id, patch) => { const r = (store['Admin Log'] || []).find(x => x.id === id); if (r) Object.assign(r, patch); return !!r; },
  saveImage: (name, d) => ({ id: name, url: 'https://drive.test/' + name, thumb: 'https://drive.test/t/' + name })
};
/** Full request path like handleRequest: bind identity, then a31Handle(routeAction). */
function req(action, p) {
  p = Object.assign({ action }, p || {});
  const auth = run('bindRequestIdentity', action, p);
  if (auth && auth.error) { R('R3_AUTH = null'); return Object.assign({ success: false }, auth); }
  const res = ctx.a31Handle(action, p, ctx.routeAction);
  R('R3_AUTH = null');
  return res;
}
/** the harness has no real sheets: an exception AFTER the permission gate means the gate let the call through */
const reqT = (a, p) => { try { return req(a, p); } catch (e) { R('R3_AUTH = null'); return { success: true, passedGate: true, err: e.message }; } };
const LOG = () => store['Admin Log'] || [];
const tSuper = login('it@paradisecoveresortfiji.com', '21slands');
const tDelai = login('it2.paradisecoveresort@gmail.com', 'pw-Delai');
const tChef = login('chef1@x.com', 'pw-Vicky');
const tHod = login('hod1@x.com', 'pw-Praneel');
const tAdmin = login('ad1@x.com', 'pw-Nicola');
const tStaff = login('staff1@x.com', 'pw-Ana');
store.Users.push(U('leanne@paradisecoveresortfiji.com', 'Leanne', 'Management', 'staff,super_admin,chef', { role: 'super_admin', roles: 'super_admin,chef' }));
const tLeanne = login('leanne@paradisecoveresortfiji.com', 'pw-Leanne');
check('APP_VERSION is 3.4.1', R('APP_VERSION') === '3.4.1');

// ---------- (d) admins get these tools ----------
let r = req('deleteUser', { sessionToken: tAdmin, targetEmail: 'staff2@x.com' });
check('admin delete user: asks for the admin code', r.success === false && r.needsCode === true && /admin code/.test(r.error), JSON.stringify(r));
r = req('deleteUser', { sessionToken: tAdmin, targetEmail: 'staff2@x.com', passcode: '2026' });
check('admin delete user: superadmin code is not the admin code', r.success === false && r.needsCode === true);
let lg0 = LOG().length;
r = req('deleteUser', { sessionToken: tAdmin, targetEmail: 'staff2@x.com', passcode: '2025' });
check('admin deletes a user with the admin code', r.success && !store.Users.find(u => u.email === 'staff2@x.com'), JSON.stringify(r));
const dl = LOG().slice(lg0).find(e => e.action === 'deleteUser');
check('delete logged in the Admin Log (area admin, by the admin)', !!dl && dl.area === 'admin' && dl.actorEmail === 'ad1@x.com', JSON.stringify(dl || {}).slice(0, 200));
r = req('deleteUser', { sessionToken: tAdmin, targetEmail: 'it2.paradisecoveresort@gmail.com', passcode: '2025' });
check('admin can never delete a superadmin account', r.success === false && store.Users.some(u => u.email === 'it2.paradisecoveresort@gmail.com'));
r = req('deleteUser', { sessionToken: tSuper, targetEmail: 'ahod1@x.com', passcode: '2025' });
check('superadmin still needs the superadmin code', r.success === false && r.needsCode === true);
r = req('deleteUser', { sessionToken: tHod, targetEmail: 'staff1@x.com', passcode: '2025' });
check('HOD cannot delete users', r.success === false && store.Users.some(u => u.email === 'staff1@x.com'));
r = req('getSuperDashboard', { sessionToken: tAdmin });
check('admin opens the overview (dashboard stats)', r.success && r.data && r.data.users, JSON.stringify(r).slice(0, 150));
r = req('getSuperDashboard', { sessionToken: tHod });
check('HOD: no overview', r.success === false);
store['Alert Emails'] = [];
r = reqT('saveAlertEmails', { sessionToken: tAdmin, emails: ['a@x.com', 'b@x.com'] });
check('admin saves alert emails', r.success !== false || !/only/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
r = req('saveAlertEmails', { sessionToken: tStaff, emails: ['a@x.com'] });
check('staff cannot save alert emails', r.success === false);
r = req('archiveOldRows', { sessionToken: tStaff, dryRun: 1 });
check('staff cannot archive', r.success === false && /Admin permission/.test(r.error));
r = req('archiveOldRows', { sessionToken: tAdmin });
check('admin archive (real move) asks for the admin code', r.success === false && r.needsCode === true && /admin code/.test(r.error), JSON.stringify(r).slice(0, 150));
r = req('backfillDinnerSummaries', { sessionToken: tChef });
check('chef cannot back-fill summaries', r.success === false);
r = reqT('backfillDinnerSummaries', { sessionToken: tAdmin });
check('admin back-fills kitchen summaries', r.success !== false || !/only/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
r = reqT('dinnerSummaryStatus', { sessionToken: tAdmin });
check('admin opens the kitchen summary status', r.success !== false || !/only/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
// still superadmin-only
r = req('setUserAccess', { sessionToken: tAdmin, targetEmail: 'staff1@x.com', roles: 'admin', passcode: '2025' });
check('admin cannot grant Admin', r.success === false && !/admin/.test(store.Users.find(u => u.email === 'staff1@x.com').permissions), JSON.stringify(r).slice(0, 150));
r = req('setAppSetting', { sessionToken: tAdmin, key: 'feature_my_schedule', value: 'true', passcode: '2025' });
check('admin cannot change App settings', r.success === false);
r = req('migrateRoles', { sessionToken: tAdmin, dryRun: 1 });
check('admin cannot open Role migration', r.success === false);
r = req('getAdminLog', { sessionToken: tAdmin, area: 'super' });
check('admin cannot read the Superadmin log', r.success === false);
r = req('getReports', { sessionToken: tAdmin });
check('admin has no Reports inbox', r.success === false);

// ---------- (g) About image ----------
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
r = req('setAboutImage', { sessionToken: tAdmin, image: IMG });
check('admin cannot change the About image', r.success === false);
lg0 = LOG().length;
r = req('setAboutImage', { sessionToken: tSuper, image: IMG });
check('superadmin uploads an About image → App setting about_image_url', r.success && /^https:\/\/drive\.google\.com\/thumbnail\?id=about-/.test(settings.about_image_url), JSON.stringify(r));
check('About image change logged (Superadmin log)', LOG().slice(lg0).some(e => e.action === 'setAboutImage' && e.bySuper === 'TRUE'));
r = req('setAboutImage', { sessionToken: tSuper, image: 'data:text/html;base64,AAAA' });
check('only images accepted', r.success === false);
r = req('setAboutImage', { sessionToken: tSuper, reset: true });
check('reset to default clears the setting', r.success && settings.about_image_url === '');

// ---------- (e)/(f) one-time role migration + Leanne / Delai → Admin ----------
check('handleRequest runs the one-time role update', /a320RolesOnce\(\)/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));
const permsBefore = {}; store.Users.forEach(u => { permsBefore[u.email] = R('a320PermKey')(u); });
delete props.A320_ROLES_DONE; copies.length = 0; lg0 = LOG().length;
let res = ctx.a320RolesOnce();
check('migration: backup tab made first ("Users backup …")', copies.length === 1 && /^Users backup \d{4}-\d{2}-\d{2} \d{4}$/.test(copies[0]) && res.migration.backupTab === copies[0], JSON.stringify(copies));
check('migration: nobody gained or lost a permission', res.migration.permissionChanges === 0, JSON.stringify(res.migration));
check('migration: counts', res.migration.withRoles >= 8 && res.migration.written + res.migration.unchanged === res.migration.withRoles, JSON.stringify(res.migration));
const ch = store.Users.find(u => u.email === 'chef1@x.com');
check('migration: roles column written (chef)', ch.roles === 'chef', ch.roles);
const lea = store.Users.find(u => u.email === 'leanne@paradisecoveresortfiji.com'), del = store.Users.find(u => u.email === 'it2.paradisecoveresort@gmail.com');
const lu = ctx.findUserByEmail(lea.email), du = ctx.findUserByEmail(del.email), mu = ctx.findUserByEmail('it@paradisecoveresortfiji.com');
check('Leanne: Superadmin → Admin, chef kept', !ctx.isSuperPerm(lu) && ctx.isAdminPerm(lu) && ctx.userRoles(lu).includes('chef'), JSON.stringify({ roles: lea.roles, perms: lea.permissions, role: lea.role }));
check('Delai: Superadmin → Admin', !ctx.isSuperPerm(du) && ctx.isAdminPerm(du), JSON.stringify({ roles: del.roles, perms: del.permissions, role: del.role }));
check('it@ stays superadmin', ctx.isSuperPerm(mu) && res.mainStillSuper === true);
check('other users unchanged by the role update', store.Users.filter(u => !/leanne|it2\./.test(u.email)).every(u => permsBefore[u.email] === R('a320PermKey')(u)));
const ol = LOG().slice(lg0);
check('logged: migration + 2 role changes (Superadmin log, not revertable)', ol.filter(e => e.bySuper === 'TRUE' && e.revertable === 'FALSE').length === 3 && ol.some(e => e.action === 'migrateRoles' && /backup tab/.test(e.summary)) && ol.filter(e => e.action === 'setUserAccess' && /Superadmin → Admin/.test(e.summary)).length === 2, JSON.stringify(ol.map(e => e.summary)).slice(0, 300));
check('result saved in App setting ops_320_result', /"permissionChanges":0/.test(settings.ops_320_result || '') && /"done":true/.test(settings.ops_320_result || ''));
check('runs only once', ctx.a320RolesOnce() === null && copies.length === 1);
// afterwards Leanne / Delai have staff features and no superadmin notice
r = req('placeDinnerOrder', { sessionToken: tLeanne, serviceDate: '2026-10-05', mainChoice: 'Beef Curry' });
check('Leanne (now admin) is not blocked from staff actions', !(r.superadminBlocked) && !/Superadmin accounts/.test(r.error || ''), JSON.stringify(r).slice(0, 150));
r = req('getSuperNotice', { sessionToken: tDelai });
check('Delai: no superadmin notice any more', r.success && r.data.show === false, JSON.stringify(r));
r = req('deleteUser', { sessionToken: tDelai, targetEmail: 'cap1@x.com', passcode: '2025' });
check('Delai (admin) deletes a user with the admin code', r.success, JSON.stringify(r));
r = req('getAdminLog', { sessionToken: tDelai, area: 'super' });
check('Delai: no Superadmin log any more', r.success === false);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
