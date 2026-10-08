// PCR Staff App 3.4.1 unit tests (VM, in-memory sheets): staff listing, GL lookup / link / override, Band + Naisoso skip, departments (HR → Admin),
// family leave codes, per-meal island estimate with resort boat trips, People & roles departments + pending HOD-step items decided by an admin on behalf of the HOD.
// Run: node tools/tests/r341-gl-unit.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? ' — ' + extra : '')); }
const U = (email, first, last, dept, perms, extra) => Object.assign({ id: 'u_' + email.split('@')[0].replace(/\W/g, ''), email, firstName: first, lastName: last, department: dept, role: perms.split(',').pop(), permissions: perms, password: 'pw-' + first, active: true, verified: true }, extra || {});
let store, settings = {}, props = {}, cache = {};
store = {
  Users: [
    U('super@x.com', 'Delai', 'Super', 'IT', 'super_admin', { role: 'super_admin' }),
    U('admin@x.com', 'Nicola', 'Brown', 'Management', 'staff,hod,admin'),
    U('hod@x.com', 'Praneel', 'Kumar', 'Housekeeping', 'staff,hod'),
    U('ahod@x.com', 'Mere', 'Tawake', 'Housekeeping', 'staff', { assistantHod: true }),
    U('ana@x.com', 'Ana', 'Tuilagi', 'Housekeeping', 'staff', { roster: '24/8' }),
    U('ana2@x.com', 'Ana', 'Vosa', 'Housekeeping', 'staff'),
    U('jone@x.com', 'Jone', 'Rabuka', 'Housekeeping', 'staff'),
    U('jone2@x.com', 'Jone', 'Rabuka', 'Housekeeping', 'staff'),
    U('sami@x.com', 'Sami', 'Lal', 'Kitchen', 'staff,chef'),
    U('khod@x.com', 'Vicky', 'Singh', 'Kitchen', 'staff,hod'),
    U('old@x.com', 'Old', 'Gone', 'Kitchen', 'staff', { active: false })
  ],
  'Leave Requests': [], Notifications: [], 'App Settings': []
};
let FAKE_NOW = '2026-10-02T09:00:00Z'; // Fiji wall clock, Fri 2 Oct 2026 09:00
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Date, JSON, Math, String: String,
  Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d) => d.toISOString(),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, getKeys: () => Object.keys(props), deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] === undefined ? null : cache[k]), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }, removeAll: ks => ks.forEach(k => delete cache[k]), getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k] !== undefined) o[k] = cache[k]; }); return o; }, putAll: o => Object.assign(cache, o) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { sendEmail() {} }, GmailApp: { sendEmail() {} }, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 201, getContentText: () => '{}' }) },
  SpreadsheetApp: { flush() {} }
};
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(root, 'apps-script')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
const clone = (o) => JSON.parse(JSON.stringify(o));
ctx.getFijiNow = () => new Date(Date.parse(FAKE_NOW));
ctx.sheetToObjects = (n) => n === 'App Settings' ? Object.keys(settings).map(k => ({ key: k, value: settings[k] })) : (store[n] || []).map((r, i) => Object.assign(clone(r), { _row: i + 2 }));
ctx.cachedRows = ctx.sheetToObjects;
ctx.findUserByEmail = (e) => { const u = store.Users.find(x => x.email === String(e || '').trim().toLowerCase()); return u ? clone(u) : null; };
ctx.appendRow = (n, row) => { (store[n] = store[n] || []).push(clone(row)); };
ctx.updateRowById = (n, id, patch) => { const r = (store[n] || []).find(x => String(x.id) === String(id)); if (!r) return null; Object.assign(r, clone(patch)); return clone(r); };
ctx.getSS = () => ({ getSheetByName: () => null, getSpreadsheetTimeZone: () => 'Pacific/Fiji', getSpreadsheetLocale: () => 'en_GB' });
ctx.ensureSheet = () => ({}); ctx.ensureColumns = () => {}; ctx.assertSheetsReady = () => {}; ctx.scInvalidateSheet = () => {};
ctx.getSetting = (k, fb) => settings[k] !== undefined ? String(settings[k]) : (fb === undefined ? '' : String(fb));
ctx.setSetting = (k, v) => { settings[k] = String(v).replace(/^'/, ''); };
ctx.r3NotifyMany = (rows) => rows.forEach(r => store.Notifications.push(clone(r)));
ctx.v3Notify = (email, title, body, kind, relatedId) => store.Notifications.push({ userEmail: email, title, body, kind, relatedId });
// 3.4.0 sheet writes over the store
ctx.r34Append = (n, h, objs) => { (store[n] = store[n] || []).push(...clone(objs)); return objs.length; };
ctx.r34DeleteWhere = (n, pred) => { const a = store[n] || []; const keep = a.filter(r => !pred(clone(r))); const gone = a.length - keep.length; store[n] = keep; return gone; };
const R = (code) => vm.runInContext(code, ctx);
const run = (fn, ...args) => ctx[fn].apply(null, args);
function api(action, p) {
  p = Object.assign({ action }, p || {});
  const auth = run('bindRequestIdentity', action, p);
  if (auth && auth.error) { R('R3_AUTH = null'); return Object.assign({ success: false }, auth); }
  const res = ctx.a31Handle(action, p, ctx.routeAction);
  R('R3_AUTH = null');
  return res;
}
const login = (email, pw) => { const r = api('login', { email, password: pw }); return r.success ? r.data.token : null; };
const at = (iso) => { FAKE_NOW = iso; cache = {}; };
settings.feature_my_schedule = 'true';
settings.schedule_link_required = 'false'; // the 3.4.0 lock is tested in its own block at the end
const T = { super: login('super@x.com', 'pw-Delai'), admin: login('admin@x.com', 'pw-Nicola'), hod: login('hod@x.com', 'pw-Praneel'), ahod: login('ahod@x.com', 'pw-Mere'),
  ana: login('ana@x.com', 'pw-Ana'), sami: login('sami@x.com', 'pw-Sami'), khod: login('khod@x.com', 'pw-Vicky') };
check('logins work', Object.values(T).every(Boolean), JSON.stringify(T));
check('APP_VERSION 3.5.2', R('APP_VERSION') === '3.5.2');
let r;
// extra people for GL linking
store.Users.push(U('mele@x.com', 'Mele', 'Naqa', 'Housekeeping', 'staff'), U('tevita@x.com', 'Tevita', 'Ravu', 'Kitchen', 'staff'), U('hrp@x.com', 'Seini', 'Waqa', '', 'staff'));
T.mele = login('mele@x.com', 'pw-Mele'); T.tevita = login('tevita@x.com', 'pw-Tevita');
function upload(tok, kind, key, dept, rows, opts) {
  const s = api('rosterUploadStart', Object.assign({ sessionToken: tok, kind, periodKey: key, department: dept, fileName: 'test.xlsx', totalRows: rows.length }, opts || {}));
  if (!s.success) return s;
  for (let i = 0; i < rows.length; i += 50) { const c = api('rosterUploadChunk', { sessionToken: tok, uploadId: s.data.uploadId, chunkIndex: i / 50, shifts: JSON.stringify(rows.slice(i, i + 50)) }); if (!c.success) return c; }
  return api('rosterUploadFinish', { sessionToken: tok, uploadId: s.data.uploadId });
}
// ---------- departments ----------
const L = (d) => JSON.stringify(run('r34ListDepts', d));
check('HR → Management (3.5.0)', L('HR') === '["Management"]' && L('Human Resources') === '["Management"]' && L('Admin') === '["Management"]', L('HR'));
check('Band / Naisoso → skipped (null)', run('r34ListDepts', 'Band') === null && run('r34ListDepts', 'Naisoso') === null);
check('Medical dept from Nurse', /Medical/.test(L('Nurse')), L('Nurse'));
const dl = run('r34DeptList');
check('department list has Medical + Management, no Admin / Band / Naisoso (3.5.0)', dl.indexOf('Admin') < 0 && dl.indexOf('Management') >= 0 && dl.indexOf('Medical') >= 0 && dl.indexOf('Band') < 0 && dl.indexOf('Naisoso') < 0, JSON.stringify(dl));
check('HR / Admin department = Management for matching (3.5.0)', run('r34DeptEq', 'HR', 'Management') && run('r34DeptEq', 'Admin', 'Management') && !run('r34DeptEq', 'Admin', 'IT/Office'));
// 3.5.0: an old "Admin" department (3.4.1) is moved to Management — list + records
store.Users.push(U('hradm@x.com', 'Ana', 'Hrr', 'Admin', 'staff'), U('hr2@x.com', 'Jone', 'Hrr', 'HR', 'staff'));
run('setSetting', 'departments', JSON.stringify(dl.slice(0, -1).concat(['Admin', 'Other'])), 'test');
const mv = run('r35MoveAdminDept');
const dl2 = run('r34DeptList');
check('migration: Admin removed from the department list, Management kept', dl2.indexOf('Admin') < 0 && dl2.indexOf('Management') >= 0, JSON.stringify(dl2));
check('migration: users with department Admin / HR → Management', mv.total >= 2 && run('findUserByEmail', 'hradm@x.com').department === 'Management' && run('findUserByEmail', 'hr2@x.com').department === 'Management', JSON.stringify(mv));
check('migration is idempotent', run('r35MoveAdminDept').total === 0);
check('Construction → Maintenance', run('r34DeptKey', 'Construction') === run('r34DeptKey', 'Maintenance'));
// ---------- family leave codes ----------
const C = run('r34Codes');
check('FAMILY / F/L / F/LEAVE → Family / Bereavement', ['FAMILY', 'F/L', 'F/LEAVE', 'family leave'].every(c => /Family/.test(run('r34ParseCell', c, C).leaveType || '')), JSON.stringify(run('r34ParseCell', 'F/L', C)));
// ---------- roster with pay type + position ----------
const wk = '2026-10-05', days = [0, 1, 2, 3, 4, 5, 6].map(i => run('r34Add', wk, i));
const rows = [].concat(
  days.map(d => ({ rawName: 'Mele Naqa', department: 'Housekeeping', date: d, cell: '7-3', payType: 'Hourly', position: 'Room attendant' })),
  days.map(d => ({ rawName: 'Tevita R', department: 'Kitchen', date: d, cell: '6-2', payType: 'Salary', position: 'Cook' })),
  days.map(d => ({ rawName: 'Jone Rabuka', department: 'Housekeeping', date: d, cell: 'OFF' })),
  days.map(d => ({ rawName: 'Seini Waqa', department: 'Admin', date: d, cell: '8-5', payType: 'Salary', position: 'HR officer' })));
r = upload(T.admin, 'monthly', '2026-10', 'ALL', rows);
check('roster upload ok', r.success, JSON.stringify(r).slice(0, 300));
const sh = (store[R('R34.SHIFTS')] || []).find(s => s.rawName === 'Mele Naqa');
check('shift keeps payType + position', sh && sh.payType === 'Hourly' && sh.position === 'Room attendant', JSON.stringify(sh));
// ---------- staff listing ----------
r = api('saveStaffListing', { sessionToken: T.hod, rows: '[]' });
check('HOD cannot save the listing', !r.success);
r = api('saveStaffListing', { sessionToken: T.admin, rows: JSON.stringify([
  { code: 'GL101', name: 'MELE NAQA', department: 'Housekeeping', started: '2021-03-01' },
  { code: 'GL102', name: 'Tevita Ravu', department: 'Kitchen', started: '2019-01-15' },
  { code: 'GL103', name: 'Ana Tuilagi', department: 'Housekeeping' },
  { code: 'GL104', name: 'Seini Waqa', department: 'HR' },
  { code: 'GL900', name: 'Band Guy', department: 'Band' }, { code: 'GL901', name: 'Naisoso Man', department: 'Naisoso' },
  { code: '', name: 'No Code' }, { code: 'GL101', name: 'Dup' }]) });
check('listing saved, Band + Naisoso skipped, bad rows skipped', r.success && r.data.saved === 4 && r.data.skippedDept === 2 && r.data.skippedBad === 2, JSON.stringify(r));
check('HR listing row → Management (3.5.0)', store[R('G341.LISTING')].find(x => x.code === 'GL104').department === 'Management');
r = api('getStaffListingInfo', { sessionToken: T.hod });
check('listing info (HOD)', r.success && r.data.count === 4, JSON.stringify(r));
r = api('getStaffListingRows', { sessionToken: T.hod });
check('listing rows export: HOD refused (admin only)', !r.success);
r = api('getStaffListingRows', { sessionToken: T.admin });
check('listing rows export (admin): 4 rows with the listing department', r.success && r.data.count === 4 && r.data.rows.find(x => x.code === 'GL104').department === 'HR', JSON.stringify(r).slice(0, 300));
const snapRows = r.data.rows;
r = api('saveStaffListing', { sessionToken: T.admin, rows: JSON.stringify([{ code: 'GL999', name: 'Fake Test', department: 'Kitchen' }]) });
r = api('saveStaffListing', { sessionToken: T.admin, rows: JSON.stringify(snapRows) });
check('snapshot → restore gives the same listing back', r.success && r.data.saved === 4 && store[R('G341.LISTING')].find(x => x.code === 'GL104').department === 'Management' && !store[R('G341.LISTING')].some(x => x.code === 'GL999'), JSON.stringify(r));
// ---------- lookup ----------
r = api('glLookup', { sessionToken: T.admin, targetEmail: 'mele@x.com', code: 'gl 101' });
check('lookup: listing found, exact roster name auto-picked', r.success && r.data.listing.name === 'MELE NAQA' && r.data.pick && r.data.candidates[0].rosterName === 'Mele Naqa', JSON.stringify(r).slice(0, 400));
check('lookup: proposed values from roster + listing', r.success && r.data.candidates[0].proposed.payType === 'Hourly' && r.data.candidates[0].proposed.position === 'Room attendant' && r.data.candidates[0].proposed.dateStarted === '2021-03-01');
const meleKey = r.data.pick;
r = api('glLookup', { sessionToken: T.admin, targetEmail: 'mele@x.com', code: 'GL555' });
check('lookup: unknown GL → notFound with message', r.success && r.data.notFound && /not in the staff listing/.test(r.data.message));
r = api('glLookup', { sessionToken: T.admin, targetEmail: 'tevita@x.com', code: 'GL102' });
check('lookup: initial name ("Tevita R") is a candidate, not auto-picked unless sure', r.success && r.data.candidates.some(c => c.rosterName === 'Tevita R' && /initial/.test(c.why)), JSON.stringify(r.data && r.data.candidates));
r = api('glLookup', { sessionToken: T.khod, targetEmail: 'mele@x.com', code: 'GL101' });
check('Kitchen HOD cannot look up a Housekeeping person', !r.success);
r = api('glLookup', { sessionToken: T.hod, targetEmail: 'mele@x.com', code: 'GL101' });
check('Housekeeping HOD can, cannot edit department, no override', r.success && r.data.canEditDept === false && r.data.canOverride === false);
// ---------- link ----------
ctx.getSS = () => ({ getSheetByName: (n) => (n === R('R34.SHIFTS') || n === R('R34.ARCH')) ? {} : null, getSpreadsheetTimeZone: () => 'Pacific/Fiji', getSpreadsheetLocale: () => 'en_GB' });
r = api('glLink', { sessionToken: T.hod, targetEmail: 'mele@x.com', code: 'GL101', rosterKey: meleKey, fields: JSON.stringify(['position', 'payType', 'dateStarted']) });
check('HOD links GL101 + updates 3 fields', r.success && r.data.code === 'GL101' && r.data.updated.length === 4 && r.data.updated[0] === 'GL number' && r.data.rosterName === 'Mele Naqa', JSON.stringify(r).slice(0, 400));
let mele = store.Users.find(u => u.email === 'mele@x.com');
check('user row updated', mele.employeeCode === 'GL101' && mele.position === 'Room attendant' && mele.payType === 'Hourly' && /2021-03-01/.test(mele.dateStarted), JSON.stringify(mele));
check('roster rows on the account', (store[R('R34.SHIFTS')] || []).filter(s => s.rawName === 'Mele Naqa').every(s => s.userEmail === 'mele@x.com'));
const glog = store[R('G341.LOG')] || [];
check('GL Link Log: link + 3 updates + roster link', glog.filter(x => x.targetEmail === 'mele@x.com').length >= 5 && glog.some(x => x.action === 'roster-link'), JSON.stringify(glog.map(x => x.action + ':' + x.field)));
r = api('glLink', { sessionToken: T.hod, targetEmail: 'ana@x.com', code: 'GL101', rosterKey: '' });
check('GL already on another account → blocked for HOD', !r.success && r.taken, JSON.stringify(r));
r = api('glLink', { sessionToken: T.admin, targetEmail: 'ana@x.com', code: 'GL101', rosterKey: '', override: 'true' });
check('admin (not super) override → still blocked', !r.success && r.taken);
r = api('glLookup', { sessionToken: T.super, targetEmail: 'ana@x.com', code: 'GL101' });
check('lookup shows the holder + superadmin can override', r.success && r.data.holder && r.data.holder.email === 'mele@x.com' && r.data.canOverride);
r = api('glLink', { sessionToken: T.super, targetEmail: 'ana@x.com', code: 'GL101', rosterKey: '', override: 'true' });
check('superadmin override moves the GL', r.success && r.data.overrideFrom && store.Users.find(u => u.email === 'ana@x.com').employeeCode === 'GL101' && !store.Users.find(u => u.email === 'mele@x.com').employeeCode, JSON.stringify(r).slice(0, 300));
check('override logged', (store[R('G341.LOG')] || []).some(x => x.action === 'override-remove' && x.override === 'TRUE'));
r = api('glLink', { sessionToken: T.admin, targetEmail: 'mele@x.com', code: 'GL555' });
check('link unknown GL → refused', !r.success && r.notFound);
r = api('glLink', { sessionToken: T.hod, targetEmail: 'hrp@x.com', code: 'GL104', fields: 'all' });
check('HOD cannot link someone outside their department', !r.success);
r = api('glLookup', { sessionToken: T.admin, targetEmail: 'hrp@x.com', code: 'GL104' });
const sk = r.data.pick;
r = api('glLink', { sessionToken: T.admin, targetEmail: 'hrp@x.com', code: 'GL104', rosterKey: sk, fields: JSON.stringify(['department', 'position']) });
check('admin link + department update → Admin', r.success && store.Users.find(u => u.email === 'hrp@x.com').department === 'Admin' && store.Users.find(u => u.email === 'hrp@x.com').position === 'HR officer', JSON.stringify(r).slice(0, 300));
r = api('glLink', { sessionToken: T.admin, targetEmail: 'tevita@x.com', code: 'GL102', rosterKey: '', fields: JSON.stringify(['name']) });
check('link only from listing name (no roster person): name title-cased', r.success && store.Users.find(u => u.email === 'tevita@x.com').employeeCode === 'GL102');
// ---------- pending HOD-step items + on behalf ----------
r = api('requestScheduleLink', { sessionToken: T.ana, type: 'unknown' });
const linkOk = r.success || /already/.test(r.error || '');
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-10-26', endDate: '2026-10-27', leaveType: 'Annual leave', reason: 'trip' });
check('leave submitted', r.success, JSON.stringify(r));
const leaveId = r.data && (r.data.id || (r.data.request && r.data.request.id));
r = api('requestSpecialMeal', { sessionToken: T.mele, meal: 'dinner', serviceDate: '2026-10-03', reason: 'working late' });
check('special meal requested', r.success, JSON.stringify(r));
r = api('getPeopleDepartments', { sessionToken: T.hod });
check('People departments: admin only', !r.success);
r = api('getPeopleDepartments', { sessionToken: T.admin });
const hk = r.success && r.data.departments.find(d => d.department === 'Housekeeping');
check('People departments: Housekeeping counts', hk && hk.registered >= 5 && hk.pending >= 2 && hk.onRoster >= 1, JSON.stringify(hk));
check('People departments: pending total', r.success && r.data.pendingTotal >= 2, JSON.stringify(r.data && r.data.pendingTotal));
r = api('getDeptPending', { sessionToken: T.admin, department: 'Housekeeping' });
const items = r.success ? r.data.items : [];
check('pending items list leave + special' + (linkOk ? ' + link' : ''), items.some(x => x.kind === 'leave') && items.some(x => x.kind === 'special'), JSON.stringify(items.map(x => x.kind)));
const lv = items.find(x => x.kind === 'leave');
r = api('decideOnBehalf', { sessionToken: T.hod, kind: 'leave', id: lv && lv.id, decision: 'approve' });
check('HOD cannot use decideOnBehalf', !r.success);
r = api('decideOnBehalf', { sessionToken: T.admin, kind: 'leave', id: lv && lv.id, decision: 'approve' });
check('admin approves leave on behalf of HOD', r.success && r.data.onBehalf, JSON.stringify(r));
const lrow = store['Leave Requests'].find(x => x.id === (lv && lv.id));
check('leave moved past the HOD step with the behalf note', lrow && lrow.status !== 'pending_hod' && /on behalf of HOD/i.test(JSON.stringify(lrow)), JSON.stringify(lrow));
const logTab = Object.keys(store).find(k => /Activity|Log/.test(k) && (store[k] || []).some(x => /on behalf of HOD/.test(JSON.stringify(x))));
check('activity log: "Approved by admin on behalf of HOD"', !!logTab, Object.keys(store).join(','));
const sp = items.find(x => x.kind === 'special');
r = api('decideOnBehalf', { sessionToken: T.admin, kind: 'special', id: sp && sp.id, decision: 'decline' });
check('admin declines special meal on behalf', r.success && store[R('S34.SPECIAL')].find(x => x.id === sp.id).status !== 'pending', JSON.stringify(r));
r = api('decideOnBehalf', { sessionToken: T.admin, kind: 'special', id: sp && sp.id, decision: 'approve' });
check('decided item cannot be decided again', !r.success);
const lk = items.find(x => x.kind === 'link');
if (lk) {
  r = api('decideOnBehalf', { sessionToken: T.admin, kind: 'link', id: lk.id, decision: 'approve', code: 'GL103' });
  check('admin approves a number request on behalf (with GL)', r.success, JSON.stringify(r));
}
check('HODs told about decisions made on their behalf', store.Notifications.some(n => n.kind === 'admin_behalf' || /decided by admin/.test(n.title || '')));
// ---------- per-meal island estimate with boat trips ----------
at('2026-10-02T09:00:00Z');
const base = run('s34Estimate', '2026-10-06');
check('estimate has per-meal numbers', base && base.meals && ['breakfast', 'lunch', 'dinner'].every(m => typeof base.meals[m].onIsland === 'number'), JSON.stringify(base).slice(0, 300));
store[R('R33_SHEET')] = (store[R('R33_SHEET')] || []).concat([{ id: 'rb1', status: 'confirmed', date: '2026-10-06', run: 'PM', direction: 'to_naisoso', userEmail: 'mele@x.com', pax: 1 }]);
cache = {};
const isl = run('s34Estimate', '2026-10-06');
check('PM boat out (15:30): on for breakfast + lunch, off for dinner', isl.meals.breakfast.onIsland === base.meals.breakfast.onIsland && isl.meals.lunch.onIsland === base.meals.lunch.onIsland && isl.meals.dinner.onIsland === base.meals.dinner.onIsland - 1 && isl.meals.dinner.boatOut === 1, JSON.stringify({ base: base.meals, isl: isl.meals }));
check('trip status: arrive AM (10:00) → off at breakfast, on at lunch', run('s34TripStatus', [{ at: 600, dir: 'to_resort' }], 420) === 'off' && run('s34TripStatus', [{ at: 600, dir: 'to_resort' }], 720) === 'on');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
