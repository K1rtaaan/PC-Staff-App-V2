// PCR Staff App 3.0.0 backend unit tests (no network, no Sheet): loads apps-script/*.gs into a Node VM with an in-memory
// sheet store + Apps Script stubs. Run: node tools/tests/v300-backend.js
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

// ---------- version / basics
check('APP_VERSION is 3.5.2', R('APP_VERSION') === '3.5.2');
check('no stations / snapshots code left', typeof ctx.routeStations === 'undefined' && typeof ctx.routeSnapshots === 'undefined' && typeof ctx.stationLogin === 'undefined');
check('appsscript.json has script.external_request (Brevo)', /script\.external_request/.test(fs.readFileSync(path.join(root, 'apps-script/appsscript.json'), 'utf8')));

// ---------- roles
const roles = (e) => run('userRoles', ctx.findUserByEmail(e));
check('legacy kitchen → chef role / Kitchen Admin button', JSON.stringify(roles('paradisecovekitchen@gmail.com')) === '["chef"]' && run('roleButtons', roles('paradisecovekitchen@gmail.com')).join() === 'kitchen');
check('legacy boat → boat_manager / Boat Admin', run('roleButtons', roles('boat1@x.com')).join() === 'boat');
check('boat captain → Boat Admin button (captain powers unchanged)', run('roleButtons', roles('cap1@x.com')).join() === 'boat' && !run('isBoatManagerPerm', ctx.findUserByEmail('cap1@x.com')));
check('assistantHod flag → Department Admin', run('roleButtons', roles('ahod1@x.com')).join() === 'dept');
check('HOD + admin → Admin Settings + Department Admin', run('roleButtons', roles('ad1@x.com')).join() === 'admin,dept');
check('staff → no role buttons', run('roleButtons', roles('staff1@x.com')).length === 0);

// ---------- sessions: role powers need a signed token
const tSuper = login('it@paradisecoveresortfiji.com', '21slands');
check('login returns a signed v3 token', /^v3\./.test(tSuper || ''));
let r = api('getSuperDashboard', { requesterEmail: 'it@paradisecoveresortfiji.com' });
check('claimed superadmin email WITHOUT token is refused + needsSignIn', r.success === false && r.needsSignIn === true);
r = api('getSuperDashboard', { requesterEmail: 'staff1@x.com', sessionToken: tSuper });
check('token identity wins over the claimed email', r.success === true);
r = api('getSuperDashboard', { sessionToken: tSuper.slice(0, -3) + 'abc' });
check('tampered token → sessionExpired', r.success === false && r.sessionExpired === true);
const tStaff = login('staff1@x.com', 'pw-Ana');
r = api('getSuperDashboard', { sessionToken: tStaff });
check('staff token cannot open superadmin dashboard', r.success === false);
check('superadmin password NOT reset by login / ensureSuperAdmin', (run('ensureSuperAdmin'), store.Users[0].password === '21slands') && (store.Users[0].password = 'changed', run('ensureSuperAdmin'), store.Users[0].password === 'changed'));
store.Users[0].password = '21slands';
const tSuper2 = login('it@paradisecoveresortfiji.com', '21slands');
check('code 2025 / 2026 alone never grant access', throws(() => run('requirePasscode', { passcode: '2026' }, 'super')) && throws(() => run('requirePasscode', { passcode: '2025' }, 'admin')));

// ---------- role editing
const tAdmin = login('ad1@x.com', 'pw-Nicola');
r = api('setUserAccess', { sessionToken: tAdmin, targetEmail: 'staff2@x.com', roles: 'chef,boat_manager' });
check('admin adds multiple roles (chef + boat manager)', r.success && run('roleButtons', roles('staff2@x.com')).join() === 'kitchen,boat', JSON.stringify(r.error || ''));
check('roles column + legacy permissions written in step', store.Users.find(u => u.email === 'staff2@x.com').roles === 'chef,boat_manager' && /staff,chef,boat_manager/.test(store.Users.find(u => u.email === 'staff2@x.com').permissions));
r = api('setUserAccess', { sessionToken: tAdmin, targetEmail: 'staff2@x.com', roles: 'admin' });
check('admin cannot grant admin', r.success === false);
r = api('setUserAccess', { sessionToken: tSuper2, targetEmail: 'staff2@x.com', roles: 'admin,chef' });
check('superadmin granting admin needs the code', r.success === false && r.needsCode === true);
r = api('setUserAccess', { sessionToken: tSuper2, targetEmail: 'staff2@x.com', roles: 'admin,chef', passcode: '2026' });
check('superadmin + code 2026 grants admin', r.success === true && roles('staff2@x.com').indexOf('admin') >= 0);
r = api('setUserAccess', { sessionToken: tSuper2, targetEmail: 'staff2@x.com', roles: 'chef', passcode: '2025' });
check('code 2025 retired (refused)', r.success === false);
r = api('setUserAccess', { sessionToken: tSuper2, targetEmail: 'it2.paradisecoveresort@gmail.com', roles: 'admin', passcode: '2026' });
check('protected superadmin (Delai) cannot be demoted', r.success === false);
r = api('setUserAccess', { sessionToken: tSuper2, targetEmail: 'staff2@x.com', roles: '', passcode: '2026' });
check('roles can be cleared back to plain staff', r.success && roles('staff2@x.com').length === 0);
r = api('updateUser', { requesterEmail: 'ad1@x.com', targetEmail: 'staff1@x.com', permissions: 'chef' });
check('updateUser role change without token refused (staff view)', r.success === false);

// ---------- migration
r = api('migrateRoles', { sessionToken: tSuper2, dryRun: 1 });
check('migrateRoles dry run lists role holders', r.success && r.data.dryRun && r.data.users.some(x => x.email === 'paradisecovekitchen@gmail.com' && x.roles.join() === 'chef'), r.error);
check('dry run writes nothing', !store.Users.some(u => u.roles && u.email === 'hod1@x.com') && copies.length === 0);
r = api('migrateRoles', { sessionToken: tSuper2, dryRun: 0 });
check('apply needs the superadmin code', r.success === false && r.needsCode);
r = api('migrateRoles', { sessionToken: tSuper2, dryRun: 0, passcode: '2026' });
check('apply backs up Users first and writes roles', r.success && copies.length === 1 && /^Users backup 2026-/.test(copies[0]) && store.Users.find(u => u.email === 'hod1@x.com').roles === 'hod' && store.Users.find(u => u.email === 'ahod1@x.com').roles === 'assistant_hod');
check('migration keeps powers identical (captain stays captain)', store.Users.find(u => u.email === 'cap1@x.com').roles === 'boat_captain' && store.Users.find(u => u.email === 'boat1@x.com').roles === 'boat_manager');
check('superadmins keep super_admin after migration', run('isSuperPerm', ctx.findUserByEmail('it2.paradisecoveresort@gmail.com')) && run('isSuperPerm', ctx.findUserByEmail('it@paradisecoveresortfiji.com')));

// ---------- register / codes by email only / throttle (item 3)
at('2026-09-28T10:00:00Z');
r = api('register', { email: 'new1@x.com', password: 'abcd', firstName: 'New', lastName: 'One', department: 'Spa' });
check('register emails the code and never returns it', r.success && r.data.emailed === true && !JSON.stringify(r).match(/\b\d{6}\b/));
check('register: no department join step (item 12 excluded)', store.Users.find(u => u.email === 'new1@x.com').deptStatus === 'approved');
r = api('requestVerification', { email: 'new1@x.com' });
check('item 3: second code within a minute refused', r.success === false && r.throttled === true);
for (let i = 0; i < 5; i++) api('verifyEmail', { email: 'new1@x.com', code: '000000' });
const realCode = store['Verification Codes'][0].code;
r = api('verifyEmail', { email: 'new1@x.com', code: realCode });
check('item 3: 5 wrong codes lock the email for 30 minutes', r.success === false && /locked/.test(r.error));
cache = {};
r = api('verifyEmail', { email: 'new1@x.com', code: realCode });
check('verify returns a session token', r.success && /^v3\./.test(r.data.token));

// ---------- mail (Brevo via Script Properties, fallback)
mail = []; fetches = [];
r = run('sendAppMail', 'a@x.com', 'S', 'B', 'notify');
check('no BREVO_API_KEY → MailApp with name "PCR Staff App" + reply-to IT', r.via === 'mailapp' && mail[0].name === 'PCR Staff App' && mail[0].replyTo === 'it@paradisecoveresortfiji.com');
props.BREVO_API_KEY = 'k'; props.BREVO_SENDER_EMAIL = 'no-reply@paradisecoveresortfiji.com'; props.BREVO_SENDER_NAME = 'PCR Staff App';
mail = []; r = run('sendAppMail', 'a@x.com', 'S', 'B', 'code');
const pl = JSON.parse(fetches[0].o.payload);
check('BREVO_API_KEY set → Brevo (auto) with sender + reply-to', r.via === 'brevo' && pl.sender.email === 'no-reply@paradisecoveresortfiji.com' && pl.sender.name === 'PCR Staff App' && pl.replyTo.email === 'it@paradisecoveresortfiji.com' && mail.length === 0);
fetchCode = 401; mail = [];
r = run('sendAppMail', 'a@x.com', 'S', 'B', 'code');
check('Brevo error → MailApp fallback + logged warning', r.via === 'mailapp' && mail.length === 1 && /Brevo HTTP 401/.test(props.MAIL_LAST_WARNING));
fetchCode = 'throw'; mail = []; r = run('sendAppMail', 'a@x.com', 'S', 'B', 'code');
check('Brevo without external_request permission → MailApp fallback', r.via === 'mailapp' && mail.length === 1);
fetchCode = 201; settings.mail_provider = 'mailapp'; mail = []; fetches = [];
r = run('sendAppMail', 'a@x.com', 'S', 'B', 'code');
check('mail_provider=mailapp switch (no redeploy) skips Brevo', r.via === 'mailapp' && fetches.length === 0);
delete settings.mail_provider;
r = api('sendTestEmail', { sessionToken: tSuper2 });
check('superadmin "Send test email" reports the sender used', r.success && r.data.via === 'brevo' && /no-reply@/.test(r.data.sender));
r = api('sendTestEmail', { sessionToken: tAdmin });
check('test email is superadmin only', r.success === false);

// ---------- meal times: dinner cutoff 23:55, late until 8:00am
at('2026-09-28T23:00:00Z');
let ci = run('dinnerCutoffInfo');
check('dinner open at 11:00pm (cutoff 11:55pm) for tomorrow', ci.open === true && ci.serviceDate === '2026-09-29' && ci.cutoff === '23:55');
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Beef Curry' });
check('staff places dinner at 11pm → pending (awaiting approval)', r.success && r.data.order.status === 'pending');
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Chicken Pizza' });
check('one order per meal: second order changes the same row', r.success && store['Dinner Orders'].filter(o => o.userEmail === 'staff1@x.com').length === 1 && store['Dinner Orders'][0].mealChoice === 'Chicken Pizza');
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', userEmail: 'staff2@x.com', mealChoice: 'Beef Curry' });
check('plain staff cannot order for someone else', !store['Dinner Orders'].some(o => o.userEmail === 'staff2@x.com'));
r = api('cancelMealOrder', { requesterEmail: 'staff1@x.com', meal: 'dinner', cancelReason: 'Off island' });
check('dinner cancel before cutoff (with reason)', r.success && store['Dinner Orders'][0].cancelReason === 'Off island');
api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Beef Curry' });
check('re-order after cancel', store['Dinner Orders'].filter(o => o.userEmail === 'staff1@x.com' && o.status === 'pending').length === 1);
r = run('v3CutoffReminders', ctx.findUserByEmail('staff2@x.com'), []);
check('item 39: reminder 1 hour before the 11:55pm cutoff for non-orderers', r.some(x => x.meal === 'dinner' && x.minutesLeft === 55));
at('2026-09-28T23:56:00Z');
r = api('placeDinnerOrder', { requesterEmail: 'staff2@x.com', mealChoice: 'Beef Curry' });
check('after 11:55pm normal dinner order refused → late request', r.success === false && r.needsLateRequest === true);
r = api('cancelMealOrder', { requesterEmail: 'staff1@x.com', meal: 'dinner', cancelReason: 'x' });
check('no dinner change / cancel after the cutoff', r.success === false);
api('getMealTimes', { requesterEmail: 'staff1@x.com' });
run('mealTick', false);
check('cutoff tick: pending dinner approved + notified + summary saved', store['Dinner Orders'].find(o => o.userEmail === 'staff1@x.com' && o.status !== 'cancelled').status === 'approved' && store.Notifications.some(n => n.userEmail === 'staff1@x.com' && n.kind === 'order_approved') && snaps.some(s => s.serviceDate === '2026-09-29' && s.kind === 'auto'));
r = api('requestLateMeal', { requesterEmail: 'staff2@x.com', meal: 'dinner', serviceDate: '2026-09-29', reason: 'Worked late', mealChoice: 'Beef Curry' });
check('late dinner request at 11:56pm accepted (late_pending)', r.success && r.data.order.status === 'late_pending');
r = api('requestLateMeal', { requesterEmail: 'staff2@x.com', meal: 'dinner', serviceDate: '2026-09-29', reason: 'again' });
check('late request also one per meal', r.success === false);
at('2026-09-29T07:30:00Z');
r = api('requestLateMeal', { requesterEmail: 'hod1@x.com', meal: 'dinner', serviceDate: '2026-09-29', reason: 'Boat delay' });
check('late dinner request at 7:30am on the dinner day accepted', r.success);
run('mealTick', false);
check('late requests stay pending before 8am', store['Dinner Orders'].filter(o => o.status === 'late_pending').length === 2);
at('2026-09-29T08:01:00Z');
r = api('requestLateMeal', { requesterEmail: 'staff1@x.com', meal: 'dinner', serviceDate: '2026-09-29', reason: 'too late' });
check('after 8am late requests closed', r.success === false && r.lateClosed === true);
const nBefore = snaps.length;
run('mealTick', false);
check('8am: late requests auto-approved', store['Dinner Orders'].filter(o => o.status === 'late_approved').length === 2 && store['Dinner Orders'].every(o => o.status !== 'late_pending'));
check('8am: staff notified of approval', store.Notifications.some(n => n.userEmail === 'staff2@x.com' && n.kind === 'order_approved'));
const fin = snaps.slice(nBefore).find(s => s.kind === 'final');
check('8am: final summary re-saved incl. late orders', fin && fin.serviceDate === '2026-09-29' && fin.totalOrders === 3 && fin.statuses.filter(s => s === 'late_approved').length === 2);
run('mealTick', false);
check('tick is idempotent (no second final save)', snaps.slice(nBefore).filter(s => s.kind === 'final').length === 1);

// ---------- breakfast / lunch: cutoff 1pm, late until midnight
at('2026-09-29T12:00:00Z');
r = api('placeBreakfastOrder', { requesterEmail: 'staff1@x.com' });
check('breakfast before 1pm → ordered', r.success && r.data.order.status === 'ordered');
for (let i = 0; i < 3; i++) { api('cancelMealOrder', { requesterEmail: 'staff1@x.com', meal: 'breakfast', cancelReason: 'r' + i }); if (i < 2) api('placeBreakfastOrder', { requesterEmail: 'staff1@x.com' }); }
r = api('placeBreakfastOrder', { requesterEmail: 'staff1@x.com' });
check('item 17: breakfast locked after 3 cancels', r.success === false && r.blocked === true);
at('2026-09-29T14:00:00Z');
r = api('placeBreakfastOrder', { requesterEmail: 'staff2@x.com' });
check('after 1pm breakfast → Orders closed + late request', r.success === false && r.needsLateRequest);
r = api('requestLateMeal', { requesterEmail: 'staff2@x.com', meal: 'breakfast', reason: 'Night shift' });
check('late breakfast request at 2pm accepted', r.success && r.data.order.serviceDate === '2026-09-30');
at('2026-09-30T00:05:00Z');
r = api('requestLateMeal', { requesterEmail: 'staff1@x.com', meal: 'lunch', serviceDate: '2026-09-30', reason: 'x' });
check('late lunch for today refused after midnight', r.success === false && r.lateClosed);
run('mealTick', false);
check('midnight: late breakfast auto-approved', store['Breakfast Orders'].find(o => o.userEmail === 'staff2@x.com').status === 'late_approved');

// ---------- Kitchen Admin meal-time settings
r = api('setMealTimes', { requesterEmail: 'staff1@x.com', dinner_cutoff: '20:00' });
check('staff cannot change meal times', r.success === false);
const tChef = login('chef1@x.com', 'pw-Vicky');
r = api('setMealTimes', { sessionToken: tChef, dinner_cutoff: '22:00', late_close_breakfast: '06:00' });
check('chef changes dinner cutoff + late close (no redeploy)', r.success && run('mealTimes').dinner_cutoff === '22:00' && run('mealTimes').late_close_breakfast === '06:00');
at('2026-09-30T22:30:00Z');
check('new dinner cutoff applies', run('dinnerCutoffInfo').open === false);
r = api('setMealTimes', { sessionToken: tChef, dinner_cutoff: '25:00' });
check('bad time rejected', r.success === false);
settings.dinner_cutoff = '23:55'; settings.late_close_breakfast = '00:00';

// ---------- app settings need super + code
r = api('setAppSetting', { sessionToken: tSuper2, key: 'mail_provider', value: 'brevo' });
check('App settings change needs the code', r.success === false && r.needsCode);
r = api('setAppSetting', { sessionToken: tSuper2, key: 'mail_provider', value: 'brevo', passcode: '2026' });
check('superadmin + 2026 changes mail provider', r.success && settings.mail_provider === 'brevo');
r = api('setAppSetting', { sessionToken: tAdmin, key: 'mail_provider', value: 'mailapp', passcode: '2026' });
check('admin cannot change App settings even with the code', r.success === false);

// ---------- leave: HOD step never skipped, own department only
at('2026-10-01T09:00:00Z');
r = api('requestLeave', { requesterEmail: 'staff1@x.com', startDate: '2026-10-05', endDate: '2026-10-06', reason: 'Family', leaveType: 'Annual leave' });
const lvId = r.data && r.data.request.id;
check('leave starts at the HOD step', r.success && r.data.request.status === 'pending_hod');
const tHod = login('hod1@x.com', 'pw-Praneel');
r = api('decideLeave', { sessionToken: tAdmin, id: lvId, decision: 'approve' });
check('admin cannot skip the HOD step when the dept has an HOD', r.success === false);
r = api('decideLeave', { sessionToken: tHod, id: lvId, decision: 'approve' });
check('HOD of the department approves → management', r.success && r.data.request.status === 'pending_manager');
r = api('decideLeave', { requesterEmail: 'hod1@x.com', id: lvId, decision: 'approve' });
check('HOD without token is plain staff', r.success === false && r.needsSignIn);

// ---------- 3.0.0 bug fix: previous day's dish booked for the next dinner (menu = dinner date's weekday only)
reset(); at('2026-09-27T10:00:00Z'); // Sunday 27 Sep 10:00 Fiji → ordering for Monday 28
const M = (wd, names) => names.map((n, i) => ({ id: 'm' + wd + i, weekday: wd, itemName: n, sortOrder: i + 1, active: true }));
store['Dinner Menus'] = [].concat(
  M(0, ['Lamb Neck Curry', 'Chicken Burger/Chips', 'Chicken cheese Pizza', 'Roasted Chicken / Potato Salad / Vegs']),
  M(1, ['Chicken Pizza', 'Beef Curry / Rice / Chutney', 'Chicken Burger', 'Sausages / Potato Salad / Gravy']),
  M(2, ['Oven Roasted Lamb neck / Vegs/ Cassava', 'Chicken In Black Bean Sauce / Rice', 'Chicken Pizza']));
check('menu names come from the dinner date weekday (Mon 28 → Monday)', JSON.stringify(run('dinnerMenuNames', '2026-09-28')) === JSON.stringify(['Chicken Pizza', 'Beef Curry / Rice / Chutney', 'Chicken Burger', 'Sausages / Potato Salad / Gravy']));
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Roasted Chicken / Potato Salad / Vegs' });
check('Sunday dish rejected for Monday dinner', r.success === false && r.offMenu && /not on Monday/.test(r.error), r.error);
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Lamb Neck Curry' });
check('Sunday (today) dish rejected for tomorrow', r.success === false && r.offMenu);
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Beef Curry / Rice / Chutney', serviceDate: '2026-09-27' });
check('Monday dish accepted; client date ignored (always the next dinner)', r.success && store['Dinner Orders'].length === 1 && store['Dinner Orders'][0].serviceDate === '2026-09-28');
r = api('placeDinnerOrder', { requesterEmail: 'staff1@x.com', mealChoice: 'Lamb Neck Curry' });
check('changing to an off-menu dish rejected', r.success === false && store['Dinner Orders'][0].mealChoice === 'Beef Curry / Rice / Chutney');
r = api('placeDinnerOrder', { requesterEmail: 'staff2@x.com', mealChoice: 'chicken pizza ' });
check('case / space differences still match the menu', r.success === true);
r = api('placeMealOnBehalf', { sessionToken: login('hod1@x.com', 'pw-Praneel'), requesterEmail: 'hod1@x.com', staffName: 'No Phone', department: 'Housekeeping', meal: 'dinner', mealChoice: 'Standard' });
check('meal on behalf: "Standard" rejected when a menu is set', r.success === false && r.offMenu, r.error);
// old off-menu row (as on live) is flagged, not silently counted
store['Dinner Orders'].push({ id: 'old1', serviceDate: '2026-09-28', userEmail: 'ahod1@x.com', userName: 'Mere', department: 'Housekeeping', mealChoice: 'Roasted Chicken / Potato Salad / Vegs', status: 'approved', late: false });
const prep = run('buildPrepPayload', '2026-09-28', {});
check('prep list flags off-menu orders separately', prep.offMenuCount === 1 && prep.offMenu[0].dish === 'Roasted Chicken / Potato Salad / Vegs' && prep.totalOrders === 3);
check('dsum summary flags off-menu orders too', run('dsumPrepFromOrders', '2026-09-28', ctx.sheetToObjects('Dinner Orders').filter(o => o.serviceDate === '2026-09-28')).offMenuCount === 1);
// after midnight: Monday 00:10 → tomorrow is Tuesday, Monday's dinner is in the late window
at('2026-09-28T00:10:00Z');
r = api('placeDinnerOrder', { requesterEmail: 'hod1@x.com', mealChoice: 'Chicken In Black Bean Sauce / Rice' });
check('after midnight the order is for Tuesday with Tuesday\'s menu', r.success && store['Dinner Orders'].some(o => o.userEmail === 'hod1@x.com' && o.serviceDate === '2026-09-29'));
r = api('placeDinnerOrder', { requesterEmail: 'cap1@x.com', mealChoice: 'Roasted Chicken / Potato Salad / Vegs' });
check('Roasted Chicken rejected for Tuesday', r.success === false && /Tuesday/.test(r.error));
r = api('requestLateMeal', { requesterEmail: 'boat1@x.com', meal: 'dinner', serviceDate: '2026-09-28', reason: 'late boat', mealChoice: 'Lamb Neck Curry' });
check('late dinner request validates against the dinner date menu (Monday)', r.success === false && r.offMenu);
r = api('requestLateMeal', { requesterEmail: 'cap1@x.com', meal: 'dinner', serviceDate: '2026-09-28', reason: 'late boat', mealChoice: 'Sausages / Potato Salad / Gravy' });
check('late dinner request with a Monday dish accepted', r.success === true, r.error);
check('no hard-coded Roasted Chicken default in the order code', !/mealChoice:\s*p\.mealChoice\s*\|\|\s*'Roasted/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));

// Kitchen Admin cleanup: list + cancel off-menu orders with a reason + in-app notification
{
  const tokC = login('chef1@x.com', 'pw-Vicky');
  store['Dinner Orders'].push({ id: 'tue1', serviceDate: '2026-09-29', userEmail: 'staff2@x.com', userName: 'Sami', department: 'Kitchen', mealChoice: 'Roasted Chicken / Potato Salad / Vegs', status: 'approved', late: false });
  let l = api('listOffMenuOrders', { sessionToken: tokC, requesterEmail: 'chef1@x.com', serviceDate: '2026-09-29' });
  check('listOffMenuOrders finds the Tuesday Roasted Chicken order only', l.success && l.data.orders.length === 1 && l.data.orders[0].id === 'tue1');
  check('listOffMenuOrders needs a role token', api('listOffMenuOrders', { requesterEmail: 'chef1@x.com', serviceDate: '2026-09-29' }).success === false);
  const before = store.Notifications.length;
  let c = api('adminCancelMealOrder', { sessionToken: tokC, requesterEmail: 'chef1@x.com', meal: 'dinner', id: 'tue1', reason: 'Not on Tuesday\u2019s menu \u2013 please re-order from Tuesday\u2019s menu' });
  const row = store['Dinner Orders'].find(o => o.id === 'tue1');
  check('adminCancelMealOrder cancels with reason + notifies the staff member', c.success && row.status === 'cancelled' && /Tuesday/.test(row.cancelReason) && store.Notifications.length === before + 1 && store.Notifications[store.Notifications.length - 1].userEmail === 'staff2@x.com');
  check('other orders untouched', store['Dinner Orders'].filter(o => o.status === 'cancelled').length === 1);
  check('staff cannot use adminCancelMealOrder', api('adminCancelMealOrder', { requesterEmail: 'staff1@x.com', id: 'old1', reason: 'x' }).success === false);
}

// cancel-with-reason stores the reason; admin can notify a chosen user; chef cannot; admin direct message
{
  const tokS = login('it@paradisecoveresortfiji.com', '21slands'), tokC = login('chef1@x.com', 'pw-Vicky');
  store['Dinner Orders'].push({ id: 'tue2', serviceDate: '2026-09-29', userEmail: 'staff1@x.com', userName: 'Ana', department: 'Kitchen', mealChoice: 'Chicken Pizza', status: 'pending', late: false });
  store['Dinner Orders'].push({ id: 'tue3', serviceDate: '2026-09-29', userEmail: 'staff2@x.com', userName: 'Sami', department: 'Kitchen', mealChoice: 'Chicken Pizza', status: 'pending', late: false });
  let c = api('adminCancelMealOrder', { sessionToken: tokC, requesterEmail: 'chef1@x.com', meal: 'dinner', id: 'tue2', reason: 'x', notifyEmail: 'hod1@x.com' });
  check('chef cannot notify another user', c.success === false && store['Dinner Orders'].find(o => o.id === 'tue2').status === 'pending');
  const n0 = store.Notifications.length;
  c = api('adminCancelMealOrder', { sessionToken: tokS, requesterEmail: 'it@paradisecoveresortfiji.com', meal: 'dinner', id: 'tue2', reason: 'Kitchen closed for stocktake', notifyEmail: 'hod1@x.com', message: 'Please tell Ana' });
  const row2 = store['Dinner Orders'].find(o => o.id === 'tue2');
  const newN = store.Notifications.slice(n0);
  check('superadmin cancel stores the reason + who', c.success && row2.cancelReason === 'Kitchen closed for stocktake' && row2.cancelledBy === 'it@paradisecoveresortfiji.com');
  check('superadmin cancel notifies the chosen user and the owner', newN.length === 2 && newN.some(n => n.userEmail === 'hod1@x.com' && /Please tell Ana/.test(n.body)) && newN.some(n => n.userEmail === 'staff1@x.com'));
  const n1 = store.Notifications.length;
  c = api('adminCancelMealOrder', { sessionToken: tokS, requesterEmail: 'it@paradisecoveresortfiji.com', meal: 'dinner', id: 'tue3', reason: 'duplicate', notify: 'false' });
  check('notify=false sends nothing but stores the reason', c.success && store.Notifications.length === n1 && store['Dinner Orders'].find(o => o.id === 'tue3').cancelReason === 'duplicate');
  // own cancel stores the reason
  at('2026-09-28T02:00:00Z');
  store['Dinner Orders'].push({ id: 'own1', serviceDate: '2026-09-29', userEmail: 'cap1@x.com', userName: 'Cap', department: 'Boat', mealChoice: 'Chicken Pizza', status: 'pending', late: false });
  c = api('cancelMealOrder', { requesterEmail: 'cap1@x.com', meal: 'dinner', reason: 'Going to the mainland' });
  check('staff cancel stores the reason', c.success && store['Dinner Orders'].find(o => o.id === 'own1').cancelReason === 'Going to the mainland', c.error);
  check('adminNotifyUser: admin sends an in-app message', api('adminNotifyUser', { sessionToken: tokS, requesterEmail: 'it@paradisecoveresortfiji.com', targetEmail: 'staff1@x.com', body: 'Hello' }).success && store.Notifications.some(n => n.userEmail === 'staff1@x.com' && n.kind === 'admin_message'));
  check('adminNotifyUser: chef blocked', api('adminNotifyUser', { sessionToken: tokC, requesterEmail: 'chef1@x.com', targetEmail: 'staff1@x.com', body: 'x' }).success === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
