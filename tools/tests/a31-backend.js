// PCR Staff App 3.1.0 backend unit tests: superadmin admin-only, admin log, superadmin revert, one-time notice (Admin31.gs).
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
const MSG = "Superadmin accounts can't place orders or bookings. Use a staff account.";
const LOG = () => store['Admin Log'] || [];
check('APP_VERSION is 3.3.0', R('APP_VERSION') === '3.3.0');
check('handleRequest goes through a31Handle', /a31Handle\(action, payload, routeAction\)/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));

const tSuper = login('it@paradisecoveresortfiji.com', '21slands');
const tDelai = login('it2.paradisecoveresort@gmail.com', 'pw-Delai');
const tChef = login('chef1@x.com', 'pw-Vicky');
const tHod = login('hod1@x.com', 'pw-Praneel');
const tAdmin = login('ad1@x.com', 'pw-Nicola');
const tStaff = login('staff1@x.com', 'pw-Ana');
check('logins', tSuper && tDelai && tChef && tHod && tAdmin && tStaff);

// ---------- 1) superadmin: no staff features (server-side)
const blocked = ['placeDinnerOrder', 'placeLunchOrder', 'placeBreakfastOrder', 'bookBoat', 'requestLeave', 'submitLeave', 'requestLateMeal', 'requestEmergencyTravel', 'getMySchedule', 'sendChefFeedback', 'voteMenuItem'];
blocked.forEach(a => { const r = req(a, { sessionToken: tSuper, mealChoice: 'Beef Curry', runId: 'x', seats: 1 }); check('super blocked: ' + a, r.success === false && r.error === MSG, JSON.stringify(r).slice(0, 120)); });
let r = req('placeDinnerOrder', { requesterEmail: 'it@paradisecoveresortfiji.com', mealChoice: 'Beef Curry' });
check('super blocked even WITHOUT a session token (claimed email)', r.success === false && r.error === MSG);
r = req('cancelMealOrder', { sessionToken: tSuper, meal: 'dinner' });
check('super blocked: cancel own meal order', r.success === false && r.error === MSG);
store['Leave Requests'].push({ id: 'lv_own', userEmail: 'it2.paradisecoveresort@gmail.com', status: 'pending_hod' });
r = req('cancelLeave', { sessionToken: tDelai, id: 'lv_own' });
check('super blocked: cancel own leave', r.success === false && r.error === MSG);
r = req('placeDinnerOrder', { sessionToken: tStaff, mealChoice: 'Beef Curry' });
check('staff NOT blocked (normal validation instead)', r.error !== MSG);
r = req('getSuperDashboard', { sessionToken: tSuper });
check('super still opens the dashboard', r.success === true);

// ---------- 2) one-time notice
r = req('getSuperNotice', { sessionToken: tSuper });
check('notice shown to superadmin first time', r.success && r.data.show === true && /admin-only account/.test(r.data.text));
r = req('getSuperNotice', { sessionToken: tStaff });
check('notice never shown to staff', r.success && r.data.show === false);
r = req('ackSuperNotice', { sessionToken: tSuper });
check('ack saved', r.success && r.data.saved === true && !!store.Users.find(u => u.email === 'it@paradisecoveresortfiji.com').superNotice31At);
r = req('getSuperNotice', { sessionToken: tSuper });
check('notice not shown again after ack (server-side, any device)', r.success && r.data.show === false);
r = req('getSuperNotice', { sessionToken: tDelai });
check('other superadmin still sees it', r.data.show === true);

// ---------- 3) admin log
r = req('setMealTimes', { sessionToken: tChef, dinner_cutoff: '23:30', logArea: 'kitchen' });
check('chef sets meal times', r.success, JSON.stringify(r).slice(0, 150));
let e = LOG().slice(-1)[0] || {};
check('log row: kitchen / setMealTimes / chef', e.area === 'kitchen' && e.action === 'setMealTimes' && e.actorEmail === 'chef1@x.com' && e.actorRole === 'chef' && /FJT$/.test(e.at), JSON.stringify(e).slice(0, 200));
check('log row has summary + before/after JSON', /dinner_cutoff → 23:30/.test(e.summary) && /23:30/.test(e.after) && Array.isArray(JSON.parse(e.before)), e.summary);
check('chef change is not a superadmin entry (no revert)', e.bySuper === 'FALSE' && e.revertable === 'FALSE' && !e.restore);
const nLog = LOG().length;
r = req('setMealTimes', { sessionToken: tChef, dinner_cutoff: '23:30' });
check('no-op change is not logged', LOG().length === nLog);
r = req('getMealTimes', { sessionToken: tChef });
check('reads are not logged', LOG().length === nLog);
r = req('setUserAccess', { sessionToken: tHod, targetEmail: 'staff1@x.com', roles: 'staff', department: 'Housekeeping', logArea: 'dept' });
r = req('updateDeptStaff', { sessionToken: tHod, targetEmail: 'staff1@x.com', village: 'Village', logArea: 'dept' });
e = LOG().slice(-1)[0] || {};
check('HOD staff edit logged in dept area', r.success && e.area === 'dept' && e.actorEmail === 'hod1@x.com' && e.target === 'staff1@x.com', JSON.stringify(r).slice(0, 150) + ' ' + JSON.stringify(e).slice(0, 150));
r = req('updateUser', { sessionToken: tStaff, targetEmail: 'staff1@x.com', firstName: 'Ana2' });
check('own profile edit is NOT an admin log entry', LOG().slice(-1)[0].actorEmail !== 'staff1@x.com');
// reading the log
r = req('getAdminLog', { sessionToken: tChef, area: 'kitchen' });
check('chef reads kitchen log, newest first', r.success && r.data.entries.length >= 1 && r.data.entries[0].action === 'setMealTimes');
check('log output never contains restore data / passwords', !/restore|pw-/.test(JSON.stringify(r.data.entries)));
r = req('getAdminLog', { sessionToken: tChef, area: 'admin' });
check('chef cannot read the admin log', r.success === false);
r = req('getAdminLog', { sessionToken: tHod, area: 'dept' });
check('HOD reads own-department log', r.success && r.data.entries.some(x => x.action === 'updateDeptStaff'));
r = req('getAdminLog', { sessionToken: tStaff, area: 'dept' });
check('staff cannot read any log', r.success === false);
r = req('getAdminLog', { sessionToken: tAdmin, area: 'super' });
check('admin cannot read the superadmin log', r.success === false);

// ---------- 4) superadmin log + revert
r = req('setUserAccess', { sessionToken: tSuper, targetEmail: 'staff2@x.com', roles: 'chef,admin', passcode: '2026', logArea: 'admin' });
check('super grants admin (with code)', r.success, JSON.stringify(r).slice(0, 150));
e = LOG().slice(-1)[0] || {};
check('super entry: bySuper + revertable + restore saved', e.bySuper === 'TRUE' && e.revertable === 'TRUE' && e.restore.length > 10 && e.actorRole === 'super_admin', JSON.stringify(e).slice(0, 300));
const grantId = e.id;
r = req('revertAdminLog', { sessionToken: tSuper, id: grantId });
check('revert refused while no revert owner is set', r.success === false && /revert owner/i.test(r.error));
r = req('setAppSetting', { sessionToken: tDelai, key: 'revert_owner_email', value: 'it@paradisecoveresortfiji.com', passcode: '2026' });
check('revert_owner_email set (while empty any superadmin may set it)', r.success && settings.revert_owner_email === 'it@paradisecoveresortfiji.com', JSON.stringify(r).slice(0, 150));
r = req('setAppSetting', { sessionToken: tDelai, key: 'revert_owner_email', value: 'it2.paradisecoveresort@gmail.com', passcode: '2026' });
check('another superadmin cannot take over revert_owner_email', r.success === false && settings.revert_owner_email === 'it@paradisecoveresortfiji.com');
r = req('revertAdminLog', { sessionToken: tDelai, id: grantId });
check('revert refused for a superadmin who is not the owner (server-side)', r.success === false && /Only the revert owner/.test(r.error));
r = req('revertAdminLog', { sessionToken: tAdmin, id: grantId });
check('revert refused for admin', r.success === false);
r = req('getAdminLog', { sessionToken: tDelai, area: 'super' });
check('non-owner sees the super log without revert rights', r.success && r.data.canRevert === false && r.data.entries.every(x => !x.canRevert));
r = req('getAdminLog', { sessionToken: tSuper, area: 'super' });
check('owner sees canRevert on revertable entries', r.success && r.data.canRevert === true && r.data.entries.some(x => x.id === grantId && x.canRevert));
r = req('revertAdminLog', { sessionToken: tSuper, id: grantId });
const s2 = store.Users.find(u => u.email === 'staff2@x.com');
check('owner reverts the role grant', r.success && !/admin/.test(String(s2.roles || '') + String(s2.permissions || '')), JSON.stringify(r) + ' ' + JSON.stringify(s2).slice(0, 200));
e = LOG().slice(-1)[0] || {};
check('revert is logged too (revertOf, not revertable)', e.action === 'revert' && e.revertOf === grantId && e.revertable === 'FALSE');
check('original entry marked reverted', !!LOG().find(x => x.id === grantId).revertedAt);
r = req('revertAdminLog', { sessionToken: tSuper, id: grantId });
check('cannot revert twice', r.success === false);
// conflict: changed again after the superadmin change
req('setUserAccess', { sessionToken: tSuper, targetEmail: 'staff2@x.com', roles: 'chef', department: 'Kitchen' });
const cid = LOG().slice(-1)[0].id;
req('setUserAccess', { sessionToken: tAdmin, targetEmail: 'staff2@x.com', roles: 'chef,hod' });
r = req('revertAdminLog', { sessionToken: tSuper, id: cid });
check('revert refused when the row changed again since', r.success === false && /Changed again/.test(r.error), JSON.stringify(r));
// delete user → revert restores the row (password kept, never shown)
const before = clone(store.Users.find(u => u.email === 'staff1@x.com'));
r = req('deleteUser', { sessionToken: tSuper, targetEmail: 'staff1@x.com', passcode: '2026' });
check('super deletes a user', r.success && !store.Users.find(u => u.email === 'staff1@x.com'), JSON.stringify(r));
const did = LOG().slice(-1)[0].id;
r = req('getAdminLog', { sessionToken: tSuper, area: 'super' });
check('deleted user password never in the log output', !/pw-Ana/.test(JSON.stringify(r)));
r = req('revertAdminLog', { sessionToken: tSuper, id: did });
const back = store.Users.find(u => u.email === 'staff1@x.com');
check('revert restores the deleted user (same password + roles)', r.success && back && back.password === before.password && back.department === before.department, JSON.stringify(r));
// app setting + meal times by superadmin are revertable
r = req('setAppSetting', { sessionToken: tSuper, key: 'mail_sender_name', value: 'PCR Test', passcode: '2026' });
const sid = LOG().slice(-1)[0].id;
r = req('revertAdminLog', { sessionToken: tSuper, id: sid });
check('revert app setting (created → removed)', r.success && settings.mail_sender_name === undefined, JSON.stringify(r));
// can't-revert entries
r = req('adminNotifyUser', { sessionToken: tSuper, targetEmail: 'staff2@x.com', title: 'Hi', body: 'Test' });
e = LOG().slice(-1)[0] || {};
check("notification entry: logged, can't be reverted", r.success && e.action === 'adminNotifyUser' && e.revertable === 'FALSE' && /cannot be taken back/.test(e.noRevertReason), JSON.stringify(r).slice(0, 100));
r = req('revertAdminLog', { sessionToken: tSuper, id: e.id });
check("revert of a sent notification refused", r.success === false);

// ---------- 3.1.0 Report a problem ----------
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
const out0 = mail.length + fetches.length, n0 = store.Notifications.length;
r = req('submitReport', { sessionToken: tStaff, type: 'problem', description: 'Dinner page shows an error', images: [IMG, IMG, IMG, IMG], page: 'meals', appVersion: '3.1.0', device: 'test UA' });
const rep = (store.Reports || [])[0] || {};
check('staff submits a report (max 3 screenshots saved)', r.success && r.data.images === 3 && JSON.parse(rep.images).length === 3 && rep.status === 'new' && rep.page === 'meals' && rep.appVersion === '3.1.0', JSON.stringify(r));
check('report owner (it@) notified in-app about the new report', store.Notifications.slice(n0).some(n => n.userEmail === 'it@paradisecoveresortfiji.com' && n.kind === 'report'));
check('3.2.0: other superadmins NOT notified about a new report', !store.Notifications.slice(n0).some(n => n.userEmail !== 'it@paradisecoveresortfiji.com' && n.kind === 'report'), JSON.stringify(store.Notifications.slice(n0).map(n => n.userEmail)));
check('3.2.0: no email to anyone on a new report', mail.length + fetches.length === out0, (mail.length + fetches.length - out0) + ' sent');
r = req('submitReport', { sessionToken: tStaff, description: 'x' });
check('empty description refused', r.success === false);
r = req('submitReport', { sessionToken: tSuper, type: 'feature', description: 'Superadmin can report too' });
check('superadmin can report (not a staff action)', r.success, JSON.stringify(r));
r = req('getReports', { sessionToken: tStaff });
check('staff cannot open the reports inbox', r.success === false);
r = req('getReports', { sessionToken: tSuper });
check('superadmin inbox: newest first + counts', r.success && r.data.reports[0].type === 'feature' && r.data.counts.new === 2, JSON.stringify(r).slice(0, 200));
r = req('getReportCount', { sessionToken: tSuper });
check('badge count = new reports', r.success && r.data.new === 2 && r.data.owner === true);
r = req('getReports', { sessionToken: tDelai });
check('3.2.0: another superadmin has no reports inbox', r.success === false && r.notOwner === true, JSON.stringify(r).slice(0, 120));
r = req('getReportCount', { sessionToken: tDelai });
check('3.2.0: another superadmin gets no badge (owner=false)', r.success && r.data.new === 0 && r.data.owner === false);
r = req('updateReport', { sessionToken: tDelai, id: (store.Reports[0] || {}).id, status: 'done' });
check('3.2.0: another superadmin cannot change a report', r.success === false);
const n1 = store.Notifications.length, m1 = mail.length + fetches.length;
r = req('updateReport', { sessionToken: tSuper, id: rep.id, status: 'in_progress', reply: 'Looking into it' });
check('superadmin sets status + reply', r.success && store.Reports[0].status === 'in_progress' && store.Reports[0].reply === 'Looking into it', JSON.stringify(r));
check('reporter notified in-app', store.Notifications.slice(n1).some(n => n.userEmail === 'staff1@x.com' && /In progress/.test(n.title)));
check('reporter emailed', mail.length + fetches.length > m1);
r = req('updateReport', { sessionToken: tAdmin, id: rep.id, status: 'done' });
check('admin (not super) cannot change a report', r.success === false);
r = req('getMyReports', { sessionToken: tStaff });
check('reporter sees own report with the reply', r.success && r.data.reports.length === 1 && r.data.reports[0].reply === 'Looking into it');
// ---------- 3.1.0 role page guides ----------
r = req('getMyGuides', { sessionToken: tChef });
check('guides: none seen at first', r.success && r.data.seen.length === 0);
r = req('markGuideSeen', { sessionToken: tChef, guide: 'kitchen' });
r = req('getMyGuides', { sessionToken: tChef });
check('guide seen remembered server-side', r.success && r.data.seen.join() === 'kitchen');
r = req('markGuideSeen', { sessionToken: tChef, guide: 'bogus' });
check('unknown guide refused', r.success === false);

// ---------- 3.2.0 one-time owner update (revert_owner_email = it@ when empty) ----------
check('handleRequest runs the one-time owner update', /a320OwnerOnce\(\)/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));
settings.revert_owner_email = ''; delete props.A320_OWNER_DONE; R("scInvalidateSheet('App Settings')");
let lg0 = LOG().length;
ctx.a320OwnerOnce();
check('3.2.0: empty revert_owner_email set to it@ once', settings.revert_owner_email === 'it@paradisecoveresortfiji.com' && !!props.A320_OWNER_DONE, settings.revert_owner_email);
const olog = LOG().slice(lg0)[0] || {};
check('3.2.0: owner update logged in the Superadmin log (not revertable)', olog.area === 'super' && olog.target === 'revert_owner_email' && /one-time 3\.2\.0/.test(olog.summary) && olog.revertable === 'FALSE', JSON.stringify(olog).slice(0, 200));
settings.revert_owner_email = ''; R("scInvalidateSheet('App Settings')");
ctx.a320OwnerOnce();
check('3.2.0: owner update never runs twice', settings.revert_owner_email === '');
settings.revert_owner_email = 'someone@x.com'; delete props.A320_OWNER_DONE; R("scInvalidateSheet('App Settings')");
ctx.a320OwnerOnce();
check('3.2.0: an existing revert owner is never overwritten', settings.revert_owner_email === 'someone@x.com');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
