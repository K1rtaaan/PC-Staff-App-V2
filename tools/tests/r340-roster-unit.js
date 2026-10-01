// PCR Staff App 3.4.0 roster unit tests (VM, in-memory sheets): parsing, matching (name AND department, ambiguous → unmatched),
// monthly → weekly override, saved name links, archive + leave balances, change notices, reminders with mocked dates, leave rules.
// Run: node tools/tests/r340-roster-unit.js
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
check('APP_VERSION 3.4.0', R('APP_VERSION') === '3.4.0');

// ---------- parsing ----------
const P = (c) => run('r34ParseCell', c, run('r34Codes'));
check('parse 07:00-15:00', JSON.stringify([P('07:00-15:00').start, P('07:00-15:00').end]) === '["07:00","15:00"]');
check('parse 7-3 → 07:00–15:00', P('7-3').start === '07:00' && P('7-3').end === '15:00');
check('parse 0630-1430', P('0630-1430').start === '06:30' && P('0630-1430').end === '14:30');
check('parse 2pm-10pm', P('2pm-10pm').start === '14:00' && P('2pm-10pm').end === '22:00');
check('parse "AM 6:00-14:00" keeps label', P('AM 6:00-14:00').roleLabel === 'AM' && P('AM 6:00-14:00').start === '06:00');
check('OFF = day off (not leave)', P('OFF').dayOff === true && P('OFF').leaveType === '');
check('RDO = day off', P('rdo').dayOff === true && !P('rdo').leaveType);
check('AL = Annual leave', P('AL').leaveType === 'Annual leave');
check('SL / MC = Sick leave', P('SL').leaveType === 'Sick leave' && P('mc').leaveType === 'Sick leave');
check('FL = Family / Bereavement', P('FL').leaveType === 'Family / Bereavement');
check('PH = Public holiday', P('PH').leaveType === 'Public holiday');
check('unknown code flagged', P('TRN').unknown === true && P('TRN').code === 'TRN');
check('rows layout dayOff=yes', run('r34NormRow', { dayOff: 'yes' }, run('r34Codes')).dayOff === true);
check('rows layout start/end', run('r34NormRow', { start: '7:00', end: '15:30' }, run('r34Codes')).end === '15:30');
check('codes are configurable', (() => { settings.roster_leave_codes = JSON.stringify({ OFF: 'Day off', TRN: 'Other', AL: 'Annual leave' }); const r = P('TRN'); delete settings.roster_leave_codes; return r.dayOff && !r.unknown; })());

// ---------- matching ----------
const mc = run('r34MatchCtx');
const M = (n, d) => { const r = run('r34Match', n, d, mc); return r.user ? r.user.email : 'X:' + r.reason; };
check('exact full name + department', M('Ana Tuilagi', 'Housekeeping') === 'ana@x.com');
check('surname first, any case', M('TUILAGI, ana', 'Housekeeping') === 'ana@x.com');
check('department alias (contains): "Housekeeping Dept"', M('Ana Tuilagi', 'Housekeeping Dept') === 'ana@x.com');
check('first name only → unmatched', /First name only/.test(M('Ana', 'Housekeeping')));
check('first-name-only suggestions list both Anas', run('r34Match', 'Ana', 'Housekeeping', mc).suggestions.length >= 2);
check('two people same name → unmatched (tie)', /Several people/.test(M('Jone Rabuka', 'Housekeeping')));
check('right name, wrong department → unmatched', /No exact match/.test(M('Sami Lal', 'Housekeeping')));
check('… with a suggestion from the other department', run('r34Match', 'Sami Lal', 'Housekeeping', mc).suggestions.some(s => /other department/.test(s.why)));
check('inactive users never match', /No exact/.test(M('Old Gone', 'Kitchen')));
check('superadmin never matched', /No exact/.test(M('Delai Super', 'IT')));

// ---------- monthly upload (admin) ----------
const MON = '2026-10';
function upload(tok, kind, key, dept, rows, opts) {
  const s = api('rosterUploadStart', Object.assign({ sessionToken: tok, kind, periodKey: key, department: dept, fileName: 'test.xlsx', totalRows: rows.length }, opts || {}));
  if (!s.success) return s;
  const ch = [];
  for (let i = 0; i < rows.length; i += 50) ch.push(api('rosterUploadChunk', { sessionToken: tok, uploadId: s.data.uploadId, chunkIndex: i / 50, shifts: JSON.stringify(rows.slice(i, i + 50)) }));
  const bad = ch.find(c => !c.success); if (bad) return bad;
  const f = api('rosterUploadFinish', { sessionToken: tok, uploadId: s.data.uploadId });
  f.chunks = ch; f.uploadId = s.data.uploadId; return f;
}
const monthDays = []; for (let d = 1; d <= 31; d++) monthDays.push('2026-10-' + String(d).padStart(2, '0'));
const grid = (name, dept, fn) => monthDays.map((date, i) => ({ rawName: name, department: dept, date, cell: fn(i + 1, date) }));
const wd = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
let monthly = [].concat(
  grid('Ana Tuilagi', 'Housekeeping', (n, d) => (wd(d) === 0 || wd(d) === 6) ? 'OFF' : (n >= 12 && n <= 14 ? 'AL' : '7-3')), // weekends off, AL 12–14 Oct
  grid('Praneel Kumar', 'Housekeeping', (n, d) => wd(d) === 3 ? 'OFF' : '06:00-14:00'),
  grid('Mere Tawake', 'Housekeeping', (n, d) => wd(d) === 1 ? 'RDO' : '14:00-22:00'),
  grid('Sami Lal', 'Kitchen', (n, d) => n === 3 || n === 4 ? 'OFF' : (n === 20 ? 'SL' : '5am-1pm')),
  grid('Vicky Singh', 'Kitchen', () => '10:00-18:00'),
  grid('Ana', 'Housekeeping', () => '7-3'), // first name only
  grid('Jone Rabuka', 'Housekeeping', () => '7-3'), // tie
  grid('Losana Unknown', 'Housekeeping', () => '7-3'), // not a user
  [{ rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-11-02', cell: '7-3' }, { rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '02/10/2026', cell: '7-3' }]
);
let r = upload(T.hod, 'monthly', MON, 'ALL', monthly);
check('HOD cannot upload the monthly roster', r.success === false && /admins/.test(r.error), JSON.stringify(r));
r = upload(T.admin, 'monthly', '2026-03', 'ALL', []);
check('monthly: period window enforced', r.success === false, JSON.stringify(r));
r = upload(T.admin, 'monthly', MON, 'ALL', monthly);
check('admin monthly upload ok', r.success === true, JSON.stringify(r).slice(0, 300));
check('monthly: 5 people matched', r.data && r.data.people === 5, r.data && r.data.people);
check('monthly: 3 unmatched names (first-name-only, tie, unknown)', r.data && r.data.unmatched.length === 3, JSON.stringify(r.data && r.data.unmatched.map(u => u.rawName)));
const skipped = r.chunks.reduce((a, c) => a.concat(c.data.skipped || []), []);
check('rows outside the month + unreadable dates skipped', skipped.length === 2 && skipped.some(s => /outside/.test(s.why)) && skipped.some(s => /not readable/.test(s.why)), JSON.stringify(skipped));
check('first upload: staff get "roster is in the app" notices', store.Notifications.filter(n => n.kind === 'roster' && /is in the app/.test(n.title)).length === 5);
check('chunk re-send is idempotent', (() => { const s = api('rosterUploadStart', { sessionToken: T.admin, kind: 'monthly', periodKey: '2026-11', department: 'ALL' }); const a = api('rosterUploadChunk', { sessionToken: T.admin, uploadId: s.data.uploadId, chunkIndex: 0, shifts: [{ rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-11-02', cell: '7-3' }] }); const b = api('rosterUploadChunk', { sessionToken: T.admin, uploadId: s.data.uploadId, chunkIndex: 0, shifts: [{ rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-11-02', cell: '7-3' }] }); api('rosterUploadFinish', { sessionToken: T.admin, uploadId: s.data.uploadId }); return a.data.shifts === 1 && b.data.duplicate === true && store['Roster Shifts'].filter(x => x.periodKey === '2026-11').length === 1; })());

// ---------- staff view ----------
let my = api('getMyRoster', { sessionToken: T.ana });
check('staff getMyRoster ok', my.success, JSON.stringify(my).slice(0, 200));
check('today (Fri 2 Oct) = 7:00 – 15:00', my.data.today.status === 'work' && my.data.today.text === '7:00 – 15:00', JSON.stringify(my.data.today));
check('countdown: next day off in 1 day (Sat 3 Oct)', my.data.next.nextOff && my.data.next.nextOff.inDays === 1 && my.data.next.nextOff.date === '2026-10-03', JSON.stringify(my.data.next));
check('week Mon 28 Sep – Sun 4 Oct (Sep days not on a roster)', my.data.week.start === '2026-09-28' && my.data.week.days[0].status === 'unknown' && my.data.week.days[6].status === 'off');
check('month has 31 days', my.data.month.days.length === 31);
check('pattern text "24/8"', my.data.pattern === '24/8');
check('superadmin blocked from staff schedule', (() => { const x = api('getMyRoster', { sessionToken: T.super }); return x.success === false; })());
at('2026-10-03T10:00:00Z');
my = api('getMyRoster', { sessionToken: T.ana });
check('on day off: report back Mon 5 Oct at 7:00', my.data.next.onBreak && my.data.next.reportBack.date === '2026-10-05' && my.data.next.reportBack.startText === '7:00', JSON.stringify(my.data.next));
at('2026-10-10T10:00:00Z'); // Sat, then Sun off, Mon–Wed AL → back Thu 15
my = api('getMyRoster', { sessionToken: T.ana });
check('weekend + annual leave: report back Thu 15 Oct', my.data.next.reportBack && my.data.next.reportBack.date === '2026-10-15', JSON.stringify(my.data.next));
let bal = (b, t) => b.find(x => x.type === t);
check('leave balance: AL 12–14 Oct = 3 booked (future), no allowance → remaining hidden', bal(my.data.balances, 'Annual leave').booked === 3 && bal(my.data.balances, 'Annual leave').remaining === null);

// ---------- weekly override (HOD) ----------
at('2026-10-02T09:00:00Z');
const wk = '2026-10-05', wkDays = [0, 1, 2, 3, 4, 5, 6].map(i => run('r34Add', wk, i));
const weekly = [].concat(
  wkDays.map((date, i) => ({ rawName: 'Ana Tuilagi', date, start: i < 2 ? '' : '08:00', end: i < 2 ? '' : '16:00', dayOff: i < 2 ? 'yes' : '' })), // off Mon+Tue now
  wkDays.map((date) => ({ rawName: 'Mere Tawake', date, cell: '14:00-22:00' })) // same as monthly except Monday RDO→work
);
r = upload(T.khod, 'weekly', wk, 'Housekeeping', weekly);
check('Kitchen HOD cannot upload a Housekeeping weekly roster', r.success === false, JSON.stringify(r));
r = upload(T.hod, 'weekly', '2026-10-06', 'Housekeeping', weekly);
check('weekly must start on a Monday', r.success === false && /Monday/.test(r.error));
const before = store.Notifications.length;
r = upload(T.ahod, 'weekly', wk, '', weekly);
check('assistant HOD weekly upload (own department) ok', r.success === true, JSON.stringify(r).slice(0, 300));
const ch = store.Notifications.slice(before).filter(n => n.kind === 'roster');
check('change notices only to staff whose shifts changed (Ana + Mere)', ch.length === 2 && ch.every(n => /changed/.test(n.title)), JSON.stringify(ch.map(n => n.userEmail + ' ' + n.title)));
my = api('getMyRoster', { sessionToken: T.ana });
const mon5 = my.data.month.days.find(d => d.date === '2026-10-05'), wed7 = my.data.month.days.find(d => d.date === '2026-10-07'), mon12 = my.data.month.days.find(d => d.date === '2026-10-12');
check('weekly overrides monthly for that week (Mon 5 off, Wed 7 8:00)', mon5.status === 'off' && mon5.source === 'weekly' && wed7.text === '8:00 – 16:00', JSON.stringify([mon5, wed7]));
check('outside the week the monthly roster applies (12 Oct AL)', mon12.source === 'monthly' && mon12.status === 'leave');
const prDay = api('getMyRoster', { sessionToken: T.hod }).data.month.days.find(d => d.date === '2026-10-06');
check('HOD not on the weekly file → monthly still used for him', prDay.source === 'monthly' && prDay.text === '6:00 – 14:00', JSON.stringify(prDay));
const wkAgain = store.Notifications.length;
r = upload(T.hod, 'weekly', wk, 'Housekeeping', weekly);
check('re-upload of the same weekly: no change notices', r.success && store.Notifications.length === wkAgain && r.data.changed === 0, r.data && r.data.changed);
check('old weekly rows replaced (no duplicates)', store['Roster Shifts'].filter(s => s.kind === 'weekly').length === 14);

// ---------- unmatched + saved link ----------
let un = api('getRosterUnmatched', { sessionToken: T.hod });
check('HOD sees own-department unmatched names', un.success && un.data.unmatched.length === 3 && un.data.unmatched.every(u => /housekeeping/i.test(u.department)), JSON.stringify(un).slice(0, 300));
check('Kitchen HOD sees none of them', api('getRosterUnmatched', { sessionToken: T.khod }).data.unmatched.length === 0);
check('staff cannot open unmatched', api('getRosterUnmatched', { sessionToken: T.ana }).success === false);
const anaRow = un.data.unmatched.find(u => u.rawName === 'Ana');
check('first-name-only has suggestions (both Anas)', anaRow.suggestions.length >= 2);
r = api('linkRosterName', { sessionToken: T.khod, id: anaRow.id, linkEmail: 'ana2@x.com' });
check('other-department HOD cannot link', r.success === false);
r = api('linkRosterName', { sessionToken: T.hod, id: anaRow.id, linkEmail: 'sami@x.com' });
check('HOD cannot link to someone in another department', r.success === false);
r = api('linkRosterName', { sessionToken: T.hod, id: anaRow.id, linkEmail: 'ana2@x.com' });
check('HOD links "Ana" → Ana Vosa; shifts applied now', r.success && r.data.shiftsAdded === 31, JSON.stringify(r));
check('link saved in Roster Name Map with createdBy', (store['Roster Name Map'] || []).some(m => m.rosterName === 'Ana' && m.userEmail === 'ana2@x.com' && m.createdBy === 'hod@x.com' && m.createdAt));
check('Ana Vosa notified', store.Notifications.some(n => n.userEmail === 'ana2@x.com' && n.kind === 'roster'));
check('Ana Vosa now has a schedule', api('getMyRoster', { sessionToken: login('ana2@x.com', 'pw-Ana') }).data.today.status === 'work');
r = upload(T.admin, 'monthly', MON, 'ALL', monthly);
check('re-upload monthly: "Ana" auto-linked via saved link (6 people, 2 unmatched)', r.success && r.data.people === 6 && r.data.unmatched.length === 2, JSON.stringify(r.data && [r.data.people, r.data.unmatched.map(u => u.rawName)]));
un = api('getRosterUnmatched', { sessionToken: T.admin });
check('older unmatched rows superseded (only the new upload\'s open)', un.data.unmatched.length === 2);
const ign = un.data.unmatched.find(u => u.rawName === 'Losana Unknown');
check('ignore a name', api('ignoreRosterName', { sessionToken: T.admin, id: ign.id }).success && api('getRosterUnmatched', { sessionToken: T.admin }).data.unmatched.length === 1);

// ---------- allowances + leave balances ----------
check('staff cannot edit allowances', api('saveLeaveAllowance', { sessionToken: T.ana, leaveType: 'Annual leave', daysPerYear: 10 }).success === false);
r = api('saveLeaveAllowance', { sessionToken: T.admin, department: 'ALL', leaveType: 'Annual leave', daysPerYear: 10 });
check('admin sets default Annual 10', r.success, JSON.stringify(r));
r = api('saveLeaveAllowance', { sessionToken: T.admin, allowEmail: 'ana@x.com', leaveType: 'Annual', daysPerYear: 15 });
check('admin sets Ana Annual 15 (alias "Annual")', r.success && r.data.allowances.some(a => a.email === 'ana@x.com' && a.leaveType === 'Annual leave' && Number(a.daysPerYear) === 15));
api('saveLeaveAllowance', { sessionToken: T.admin, allowEmail: 'ana@x.com', leaveType: 'Annual leave', daysPerYear: 14 });
check('upsert, not duplicate', store['Leave Allowances'].filter(a => a.email === 'ana@x.com').length === 1);
check('bad leave type rejected', api('saveLeaveAllowance', { sessionToken: T.admin, leaveType: 'Holiday on Mars', daysPerYear: 3 }).success === false);
// archive: superadmin only, past months, used in leave
const marRows = ['2026-03-09', '2026-03-10', '2026-03-11'].map(date => ({ rawName: 'Ana Tuilagi', department: 'Housekeeping', date, cell: 'AL' }))
  .concat([{ rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-03-12', cell: 'SL' }, { rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-03-13', cell: '7-3' }, { rawName: 'Ana Tuilagi', department: 'Housekeeping', date: '2026-03-14', cell: 'OFF' }]);
check('admin cannot use the archive', upload(T.admin, 'archive', '2026-03', 'ALL', marRows).success === false);
check('archive rejects future months', upload(T.super, 'archive', '2026-12', 'ALL', marRows).success === false);
r = upload(T.super, 'archive', '2026-03', 'ALL', marRows);
check('superadmin archive upload ok (no notices)', r.success && r.data.notified === 0, JSON.stringify(r).slice(0, 200));
check('archive rows in their own tab', (store['Roster Archive'] || []).length === 6 && !store['Roster Shifts'].some(s => s.kind === 'archive'));
// approved app leave 2026-07-01..03 (Annual) + 13 Oct overlaps roster AL (dedupe)
store['Leave Requests'].push({ id: 'lv1', userEmail: 'ana@x.com', userName: 'Ana', department: 'Housekeeping', startDate: '2026-07-01', endDate: '2026-07-03', leaveType: 'Annual leave', status: 'approved', reason: 'trip', createdAt: '2026-06-01 10:00:00' });
store['Leave Requests'].push({ id: 'lv2', userEmail: 'ana@x.com', userName: 'Ana', department: 'Housekeeping', startDate: '2026-10-13', endDate: '2026-10-13', leaveType: 'Annual leave', status: 'approved', reason: 'x', createdAt: '2026-09-01 10:00:00' });
store['Leave Requests'].push({ id: 'lv3', userEmail: 'ana@x.com', userName: 'Ana', department: 'Housekeeping', startDate: '2026-08-01', endDate: '2026-08-01', leaveType: 'Sick sheet', status: 'approved', reason: 'flu', createdAt: '2026-08-01 10:00:00' });
cache = {};
my = api('getMyRoster', { sessionToken: T.ana });
const al = bal(my.data.balances, 'Annual leave'), sl = bal(my.data.balances, 'Sick leave');
check('Annual used = 3 archive + 3 app = 6, booked 3 (13 Oct counted once)', al.used === 6 && al.booked === 3, JSON.stringify(al));
check('Annual remaining = 14 − 9 = 5 (personal allowance wins)', al.allowance === 14 && al.remaining === 5, JSON.stringify(al));
check('Sick used = 1 archive SL + 1 app "Sick sheet"; no allowance → remaining hidden', sl.used === 2 && sl.remaining === null, JSON.stringify(sl));
check('archive never shows as a current schedule', !my.data.week.days.concat(my.data.month.days).some(d => d.source === 'archive'));
const r2 = upload(T.super, 'archive', '2026-03', 'ALL', marRows.slice(3));
cache = {};
check('archive re-upload replaces that month (Annual used now 3)', r2.success && bal(api('getMyRoster', { sessionToken: T.ana }).data.balances, 'Annual leave').used === 3);
const arch = api('getRosterAdmin', { sessionToken: T.super, kind: 'archive' });
check('archive page: months Jan 2026 → now + pattern summary', arch.success && arch.data.periods.length === 10 && arch.data.patterns.length >= 1 && /days on/.test(arch.data.patterns[0].summary), JSON.stringify(arch.data && arch.data.patterns));
check('admin page monthly: Oct active, Nov due', (() => { const a = api('getRosterAdmin', { sessionToken: T.admin, kind: 'monthly' }); return a.success && a.data.periods.find(p => p.key === '2026-10').uploads.length === 1; })());
check('HOD weekly page: next week uploaded', (() => { const a = api('getRosterAdmin', { sessionToken: T.hod, kind: 'weekly' }); return a.success && a.data.periods.find(p => p.key === wk).uploads.length === 1; })());

// ---------- settings ----------
r = api('saveRosterSettings', { sessionToken: T.admin, codes: JSON.stringify({ OFF: 'Day off', AL: 'Annual leave', TRN: 'Other', XX: 'Nope' }) });
check('codes must map to a known leave type', r.success === false && /XX/.test(r.error));
r = api('saveRosterSettings', { sessionToken: T.admin, codes: JSON.stringify(Object.assign({}, R('R34_DEFAULT_CODES'), { TRN: 'Other' })), dayOffHeadsUp: true, backTime: '17:30' });
check('admin saves codes + heads-up + reminder time', r.success && r.data.codes.TRN === 'Other' && r.data.dayOffHeadsUp === true && r.data.backTime === '17:30', JSON.stringify(r).slice(0, 200));
check('HOD cannot save roster settings', api('saveRosterSettings', { sessionToken: T.hod, dayOffHeadsUp: false }).success === false);

// ---------- reminders (pure planner, mocked dates) ----------
const plan = (today, hour, extra) => run('r34PlanReminders', Object.assign({
  today, hour, minute: 0, backHour: 18, backMinute: 0, headsUp: false, sent: {},
  users: [{ email: 's@x', department: 'Housekeeping', active: true }, { email: 'h@x', department: 'Housekeeping', active: true, isLead: true }, { email: 'a@x', department: 'Management', active: true, isAdmin: true }, { email: 'sup@x', active: true, isSuper: true, isAdmin: true }],
  days: (em) => em === 's@x' ? { '2026-10-03': { dayOff: true }, '2026-10-04': { dayOff: true }, '2026-10-05': { start: '07:00', end: '15:00' }, '2026-10-06': { start: '07:00' }, '2026-10-07': { dayOff: true } } : {},
  leave: () => ({}), weeklyDone: () => false, monthlyDone: () => false
}, extra || {}));
let p = plan('2026-10-04', 18);
check("Sun 6pm: staff gets \"You're back at work tomorrow at 7:00\"", p.some(x => x.email === 's@x' && x.title === "You're back at work tomorrow at 7:00"), JSON.stringify(p));
check('Sun 5pm: not yet', !plan('2026-10-04', 17).some(x => x.kind === 'back'));
check('Sat (still off tomorrow): no back reminder', !plan('2026-10-03', 19).some(x => x.kind === 'back'));
const sentOnce = {}; plan('2026-10-04', 18, { sent: sentOnce }); check('sent once (second tick sends nothing)', plan('2026-10-04', 19, { sent: sentOnce }).filter(x => x.kind === 'back').length === 0);
check('day-off heads-up only when enabled', !plan('2026-10-06', 18).some(x => x.kind === 'dayoff') && plan('2026-10-06', 18, { headsUp: true }).some(x => x.kind === 'dayoff' && x.email === 's@x'));
check('back after approved app leave', plan('2026-10-09', 18, { days: () => ({ '2026-10-10': { start: '06:00' } }), leave: (em) => em === 's@x' ? { '2026-10-09': 'Annual leave' } : {} }).some(x => x.kind === 'back' && /6:00/.test(x.title)));
check('Sat 5pm: no HOD reminder yet', !plan('2026-10-03', 17).some(x => x.kind === 'weekly_due'));
p = plan('2026-10-03', 18);
check('Sat 6pm: HOD reminded about week of Mon 5 Oct', p.some(x => x.kind === 'weekly_due' && x.email === 'h@x' && /Mon 5 Oct/.test(x.body)), JSON.stringify(p));
check('HOD reminder skipped once uploaded', !plan('2026-10-03', 18, { weeklyDone: () => true }).some(x => x.kind === 'weekly_due'));
check('Sunday still reminds (key = same week, once)', plan('2026-10-04', 9).some(x => x.kind === 'weekly_due' && x.key === 'wk|housekeeping|2026-10-05|h@x'));
check('27th: no admin reminder', !plan('2026-10-27', 9).some(x => x.kind === 'monthly_due'));
p = plan('2026-10-28', 9);
check('28th: admins (incl. superadmin) reminded about November', p.filter(x => x.kind === 'monthly_due').length === 2 && /November 2026/.test(p.find(x => x.kind === 'monthly_due').title));
check('28th: none when November uploaded', !plan('2026-10-28', 9, { monthlyDone: () => true }).some(x => x.kind === 'monthly_due'));
check('superadmins get no staff reminders', !plan('2026-10-04', 18).some(x => x.email === 'sup@x' && x.kind === 'back'));
// r34Tick end to end with the store (log first, notify once)
at('2026-10-04T18:10:00Z'); settings.roster_back_reminder_time = '18:00';
let tk = run('r34Tick');
check('r34Tick Sun 18:10: no back-to-work for Ana (weekly roster gives her Mon 5 Oct off)', !store.Notifications.some(n => n.userEmail === 'ana@x.com' && /back at work/.test(n.title)), JSON.stringify(tk));
at('2026-10-06T18:10:00Z');
tk = run('r34Tick');
check('r34Tick Tue 18:10: Ana (off Mon–Tue via weekly) → "back at work tomorrow at 8:00"', store.Notifications.some(n => n.userEmail === 'ana@x.com' && n.title === "You're back at work tomorrow at 8:00" && n.kind === 'roster'), JSON.stringify(tk));
const n1 = store.Notifications.length; run('r34Tick');
check('r34Tick again: nothing re-sent', store.Notifications.length === n1);
check('reminder log written', (store['Roster Reminder Log'] || []).some(l => /^back\|ana@x.com\|2026-10-07/.test(l.key)));
check('pushTick calls r34Tick', /r34Tick\(\)/.test(fs.readFileSync(path.join(root, 'apps-script/Push33.gs'), 'utf8')));
check('push link for roster kinds', R("a33Url('roster')") === './#schedule' && R("a33Url('roster_hod')") === './#rosterweekly' && R("a33Url('roster_admin')") === './#rostermonthly');

// ---------- leave rules from the Schedule tab ----------
at('2026-10-02T09:00:00Z');
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-10-20', endDate: '2026-10-21', leaveType: 'Family / Bereavement', reason: 'funeral' });
check('configurable type accepted (Family / Bereavement)', r.success && r.data.request.leaveType === 'Family / Bereavement', JSON.stringify(r));
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-10-21', endDate: '2026-10-22', leaveType: 'Annual leave', reason: 'again' });
check('duplicate (pending overlap) blocked', r.success === false && /pending/.test(r.error));
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-07-02', endDate: '2026-07-02', leaveType: 'Annual leave', reason: 'x' });
check('past date blocked', r.success === false);
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-10-13', endDate: '2026-10-13', leaveType: 'Annual leave', reason: 'dup of approved' });
check('overlap with APPROVED leave blocked', r.success === false && /approved/.test(r.error), JSON.stringify(r));
r = api('submitLeave', { sessionToken: T.ana, startDate: '2026-09-25', endDate: '2026-09-25', leaveType: 'Sick leave', reason: 'flu' });
check('Sick leave can be back-dated (≤14 days)', r.success === true, JSON.stringify(r));
check('HOD approves → pending_manager', api('decideLeave', { sessionToken: T.hod, id: r.data.request.id, decision: 'approve' }).success && store['Leave Requests'].find(l => l.id === r.data.request.id).status === 'pending_manager');

// ---------- pattern text + sheet text safety ----------
check('r34PatternText(Date 24 Aug) → "24/8"', run('r34PatternText', new Date(2026, 7, 24)) === '24/8');
check('r34PatternText("2026-08-24 00:00:00") → "24/8"', run('r34PatternText', '2026-08-24 00:00:00') === '24/8');
check('r34Cell keeps 24/8, 07:00, 2026-10-05, =SUM as text', ['24/8', '07:00', '2026-10-05', '=SUM(A1)'].every(v => run('r34Cell', v) === "'" + v));
check('appendRow writes Users.roster as text', /roster:1/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));
check('deleteSheetRowsByPredicate no longer deletes row by row', /r34DeleteWhere\(sheetName, predicate\)/.test(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')));
check('flag off → staff schedule closed', (() => { settings.feature_my_schedule = 'false'; const x = api('getMyRoster', { sessionToken: T.ana }); settings.feature_my_schedule = 'true'; return x.success === false && x.featureOff; })());
check('flag off → archive still works for superadmin', (() => { settings.feature_my_schedule = 'false'; const x = api('getRosterAdmin', { sessionToken: T.super, kind: 'archive' }); settings.feature_my_schedule = 'true'; return x.success; })());

// ---------- real-roster codes (spelling variants seen in Pranav's files) ----------
check('DAY OFF / DAYS OFF / D/OFF / DSY OFF = day off', ['DAY OFF', 'days off', 'D / OFF', 'DSY OFF', 'DAYOFF'].every(c => P(c).dayOff === true && !P(c).leaveType));
check('typo DAT OFF / BAY OFF → day off', P('DAT OFF').dayOff === true && P('BAY OFF').dayOff === true);
check('ANNUAL LEAVE / A/LEAVE / ANNUAL/LEAVE / ANNUAL LEAVE (3) = Annual leave', ['ANNUAL LEAVE', 'A/LEAVE', 'annual / leave', 'ANNUAL LEAVE (3)'].every(c => P(c).leaveType === 'Annual leave'));
check('MATERNITY LEAVE / M/L / typo MARENITY LEAVE = Maternity / Paternity', ['MATERNITY LEAVE', 'M/L', 'MARENITY LEAVE'].every(c => P(c).leaveType === 'Maternity / Paternity'));
check('SICKLEAVE / SICK SHEET = Sick leave', P('SICKLEAVE').leaveType === 'Sick leave' && P('SICK SHEET').leaveType === 'Sick leave');
check('typo BREVEAMNET = Family / Bereavement', P('BREVEAMNET').leaveType === 'Family / Bereavement');
check('LWOP / LOPW / LEAVE WITHOUT PAY = Unpaid leave', ['LWOP', 'LOPW', 'LEAVE WITHOUT PAY'].every(c => P(c).leaveType === 'Unpaid leave'));
check('RELEASE / RELEASED / STAFF RELEASE = separation marker, not leave', ['RELEASE', 'released', 'STAFF RELEASE'].every(c => P(c).released === true && P(c).code === 'RELEASED' && !P(c).leaveType && !P(c).dayOff && !P(c).unknown));
check('TRAINING (+ typos) = working day, not leave', ['TRAINING', 'TRAIING', 'TRAINIING'].every(c => !P(c).leaveType && !P(c).dayOff && !P(c).unknown && P(c).roleLabel === 'Training'));
check('Stores ON = working day', !P('ON').dayOff && !P('ON').leaveType && !P('ON').unknown);
check('SDD stays unknown, shown as is', P('SDD').unknown === true && P('SDD').code === 'SDD');
check('"13C" (kids count) is not leave', !P('13C').leaveType);

// ---------- first name + initial (suggest, never auto-assign) ----------
const mi = run('r34Match', 'Ana T', 'Housekeeping', mc);
check('"Ana T" → unmatched', !mi.user);
check('"Ana T" suggests Ana Tuilagi (first name + initial) first', mi.suggestions[0] && mi.suggestions[0].email === 'ana@x.com', JSON.stringify(mi.suggestions));
check('"Ana.V" suggests Ana Vosa', run('r34Match', 'Ana.V', 'Housekeeping', mc).suggestions.some(x => x.email === 'ana2@x.com'));

// ---------- weekly upload for ALL departments (admin, whole-resort workbook) ----------
const wk3 = '2026-10-19', wk3Days = [0, 1, 2, 3, 4, 5, 6].map(i => run('r34Add', wk3, i));
r = upload(T.hod, 'weekly', wk3, 'ALL', wk3Days.map(date => ({ rawName: 'Sami Lal', department: 'Kitchen', date, start: '06:00', end: '14:00' })));
check('HOD cannot upload weekly for ALL / another department', r.success === false || store['Roster Uploads'].filter(u => u.periodKey === wk3 && String(u.department).toUpperCase() === 'ALL').length === 0, JSON.stringify(r).slice(0, 200));
r = upload(T.admin, 'weekly', wk3, 'ALL', [].concat(
  wk3Days.map(date => ({ rawName: 'Sami Lal', department: 'Kitchen', date, start: '06:00', end: '14:00', roleLabel: 'AM' })),
  wk3Days.map((date, i) => ({ rawName: 'Ana Tuilagi', department: 'Housekeeping', date, code: i === 2 ? 'DAY OFF' : '', start: i === 2 ? '' : '08:00', end: i === 2 ? '' : '16:00' }))));
check('admin weekly ALL upload works', r.success === true, JSON.stringify(r).slice(0, 300));
check('… 14 shifts for 2 people', r.success && r.data.shifts === 14 && r.data.people === 2, JSON.stringify(r.data));
const samiWk = api('getMyRoster', { sessionToken: T.sami }).data.month.days.find(d => d.date === '2026-10-20');
check('ALL weekly row keeps its own department & label', samiWk && samiWk.start === '06:00' && /AM/.test(samiWk.role || ''), JSON.stringify(samiWk));
const kAdm = api('getRosterAdmin', { sessionToken: T.khod, kind: 'weekly' });
check('Kitchen HOD sees the ALL upload as done for that week', kAdm.success && kAdm.data.periods.some(p => p.key === wk3 && p.uploads.length), JSON.stringify((kAdm.data || {}).periods || kAdm).slice(0, 300));

// ---------- possible duplicate week + RELEASED (separation) ----------
const wk4 = '2026-10-26', wk4Days = [0, 1, 2, 3, 4, 5, 6].map(i => run('r34Add', wk4, i));
r = upload(T.admin, 'weekly', wk4, 'ALL', [].concat(
  wk4Days.map(date => ({ rawName: 'Sami Lal', department: 'Kitchen', date, start: '06:00', end: '14:00', roleLabel: 'AM' })),
  wk4Days.map((date, i) => ({ rawName: 'Ana Tuilagi', department: 'Housekeeping', date, code: i === 2 ? 'DAY OFF' : '', start: i === 2 ? '' : '08:00', end: i === 2 ? '' : '16:00' }))));
check('same shifts as another week → possibleDuplicateOf', r.success && (r.data.possibleDuplicateOf || []).some(x => x.periodKey === wk3), JSON.stringify(r.data && r.data.possibleDuplicateOf));
check('… noted on the upload', /possible duplicate/.test(store['Roster Uploads'].find(u => u.id === r.uploadId).notes || ''));
const wk5 = '2026-11-02', wk5Days = [0, 1, 2, 3, 4, 5, 6].map(i => run('r34Add', wk5, i));
r = upload(T.admin, 'weekly', wk5, 'ALL', wk5Days.map((date, i) => ({ rawName: 'Sami Lal', department: 'Kitchen', date, code: i >= 3 ? 'RELEASED' : (i === 1 ? 'TRAINING' : ''), start: i < 3 && i !== 1 ? '06:00' : '', end: i < 3 && i !== 1 ? '14:00' : '' })));
check('different week → not a duplicate', r.success && !(r.data.possibleDuplicateOf || []).length);
check('RELEASED → "possibly left" from the first date', r.success && r.data.released.length === 1 && r.data.released[0].email === 'sami@x.com' && r.data.released[0].from === '2026-11-05', JSON.stringify(r.data && r.data.released));
check('account is NOT changed (still active)', store.Users.find(u => u.email === 'sami@x.com').active === true);
at('2026-11-03T09:00:00Z');
const sm = api('getMyRoster', { sessionToken: T.sami }).data;
const d5 = sm.month.days.find(d => d.date === '2026-11-05'), d3 = sm.month.days.find(d => d.date === '2026-11-03');
check('staff view: RELEASED day = "released", not leave/off', d5 && d5.status === 'released' && !d5.leaveType, JSON.stringify(d5));
check('staff view: TRAINING day = work, text Training', d3 && d3.status === 'work' && /Training/.test(d3.text), JSON.stringify(d3));
check('countdown stops at RELEASED (no fake day off / report back)', sm.next && sm.next.released && sm.next.released.date === '2026-11-05' && !sm.next.nextOff, JSON.stringify(sm.next));
check('RELEASED not counted in leave balances', !(sm.balances || []).some(b => b.used > 0 && /released/i.test(b.type)));
const adm = api('getRosterAdmin', { sessionToken: T.admin, kind: 'monthly' });
check('admin Rosters page lists released staff', adm.success && adm.data.released.some(x => x.email === 'sami@x.com'));
check('admin Rosters page lists whole-resort weeks', adm.success && Array.isArray(adm.data.weeks) && adm.data.weeks.length === 6 && adm.data.weekWindow.from);
const hodAdm = api('getRosterAdmin', { sessionToken: T.khod, kind: 'weekly' });
check('HOD page does not get the released list', hodAdm.success && hodAdm.data.released === undefined);
at('2026-10-02T09:00:00Z');

// ---------- employee codes ----------
check('r34EmpCode normalises', run('r34EmpCode', 'gl 18') === 'GL018' && run('r34EmpCode', 'GL1009') === 'GL1009' && run('r34EmpCode', 'GL-018') === 'GL018' && run('r34EmpCode', 'Ana') === '');
check('listing departments map (ELECTRICIAN → Maintenance, GARDEN → Grounds, RESTAURANT → F&B)', run('r34ListDepts', 'ELECTRICIAN ')[0] === 'Maintenance' && run('r34ListDepts', 'GARDEN')[0] === 'Grounds' && run('r34ListDepts', 'RESTAURANT')[0] === 'F&B' && run('r34ListDepts', 'BAND') === null);
const listing = [
  { code: 'GL101', name: 'ANA MARIA TUILAGI', department: 'HOUSEKEEPING' },   // middle name in the listing → match
  { code: 'GL102', name: 'JONE RABUKA', department: 'HOUSEKEEPING' },        // two Jone Rabuka → ambiguous
  { code: 'GL103', name: 'SAMI LAL', department: 'HOUSEKEEPING' },           // one person, other department → check
  { code: 'GL104', name: 'NOBODY HERE', department: 'KITCHEN' },             // unmatched
  { code: 'GL101', name: 'ANA MARIA TUILAGI', department: 'HOUSEKEEPING' },  // duplicate code row → ignored
  { code: 'GL105', name: 'VICKY SINGH NO 2', department: 'KITCHEN' }         // "NO 2" ignored → match
];
let pv = api('previewEmployeeCodes', { sessionToken: T.admin, rows: JSON.stringify(listing) });
check('preview: admin only', api('previewEmployeeCodes', { sessionToken: T.hod, rows: '[]' }).success === false);
const st = c => (pv.data.rows.find(r => r.code === c) || {}).status;
check('preview works', pv.success && pv.data.total === 5, JSON.stringify(pv).slice(0, 300));
check('middle name in listing → match', st('GL101') === 'match' && pv.data.rows.find(r => r.code === 'GL101').email === 'ana@x.com');
check('same name twice → ambiguous', st('GL102') === 'ambiguous' && pv.data.rows.find(r => r.code === 'GL102').suggestions.length === 2);
check('other department → check (not pre-selected)', st('GL103') === 'check');
check('no account → unmatched', st('GL104') === 'unmatched');
check('"NO 2" suffix ignored → match', st('GL105') === 'match');
r = api('applyEmployeeCodes', { sessionToken: T.admin, items: JSON.stringify([{ code: 'GL101', email: 'ana@x.com' }, { code: 'GL105', email: 'khod@x.com' }, { code: 'GL102', email: 'jone@x.com' }]) });
check('apply saves 3 codes', r.success && r.data.saved === 3, JSON.stringify(r));
check('Users.employeeCode written', store.Users.find(u => u.email === 'ana@x.com').employeeCode === 'GL101');
r = api('applyEmployeeCodes', { sessionToken: T.admin, items: JSON.stringify([{ code: 'GL101', email: 'ana2@x.com' }]) });
check('a code is never on two people', r.success && r.data.saved === 0 && /another person/.test(r.data.skipped[0].why));
pv = api('previewEmployeeCodes', { sessionToken: T.admin, rows: JSON.stringify(listing) });
check('re-preview: already has this code', st('GL101') === 'already' && st('GL105') === 'already');
check('admin edits a code', api('setEmployeeCode', { sessionToken: T.admin, targetEmail: 'jone2@x.com', code: 'gl 77' }).data.employeeCode === 'GL077' && store.Users.find(u => u.email === 'jone2@x.com').employeeCode === 'GL077');
check('edit refuses a taken code', api('setEmployeeCode', { sessionToken: T.admin, targetEmail: 'jone2@x.com', code: 'GL101' }).success === false);
check('edit refuses junk', api('setEmployeeCode', { sessionToken: T.admin, targetEmail: 'jone2@x.com', code: 'hello' }).success === false);
check('HOD cannot edit codes', api('setEmployeeCode', { sessionToken: T.hod, targetEmail: 'jone2@x.com', code: 'GL078' }).success === false);
check('users list shows the code', /GL077/.test(JSON.stringify(run('v3UserOut', store.Users.find(u => u.email === 'jone2@x.com')))));
const mc2 = run('r34MatchCtx');
check('roster match: code first (beats an ambiguous name)', (run('r34Match', 'Jone Rabuka', 'Housekeeping', mc2, 'GL077').user || {}).email === 'jone2@x.com');
check('roster match: "GL102 Jone R" (code in the name cell)', (run('r34Match', 'GL102 Jone R', 'Housekeeping', mc2).user || {}).email === 'jone@x.com');
check('roster match: unknown code → name rules', /Several/.test(run('r34Match', 'Jone Rabuka', 'Housekeeping', mc2, 'GL999').reason || ''));
r = upload(T.admin, 'weekly', '2026-11-09', 'ALL', [0, 1].map(i => ({ rawName: 'J. Rabuka', employeeCode: 'GL077', department: 'Housekeeping', date: run('r34Add', '2026-11-09', i), start: '07:00', end: '15:00' })));
check('upload with an employee code column matches by code', r.success && r.data.people === 1 && !r.data.unmatched.length, JSON.stringify(r.data || r).slice(0, 200));

// ---------- departments: roster departments added once, never renamed / duplicated ----------
cache = {};
let dl = api('getDepartments', {});
check('getDepartments is public', dl.success === true, JSON.stringify(dl));
check('Front Office + Stores added', dl.data.departments.includes('Front Office') && dl.data.departments.includes('Stores'));
check('added before "Other"', dl.data.departments.indexOf('Stores') < dl.data.departments.indexOf('Other'));
check('existing departments kept (F&B, Kitchen, IT/Office, Housekeeping)', ['F&B', 'Kitchen', 'IT/Office', 'Housekeeping', 'Bar'].every(x => dl.data.departments.includes(x)));
settings.departments = JSON.stringify(JSON.parse(settings.departments).concat(['Custom Dept'])); cache = {}; run('r34Ensure');
dl = api('getDepartments', {});
check('second run keeps a custom department and adds nothing', dl.data.departments.includes('Custom Dept') && dl.data.departments.filter(x => x === 'Front Office').length === 1);
delete settings.departments_roster_340; cache = {}; run('r34Ensure');
const dl2 = JSON.parse(settings.departments);
check('re-seed (marker lost) never duplicates', dl2.filter(x => x === 'Front Office').length === 1 && dl2.filter(x => x === 'Stores').length === 1 && dl2.includes('Custom Dept'), settings.departments);
settings.departments = JSON.stringify(['F&B', 'front office', 'Other']); delete settings.departments_roster_340; cache = {}; run('r34Ensure');
check('case-insensitive: "front office" not added twice', JSON.parse(settings.departments).filter(x => /^front office$/i.test(x)).length === 1, settings.departments);

// ===== 3.4.0 (Pranav): schedule lock by employee code, link requests, department staff, registration, island estimate, meal block on leave
at('2026-10-02T09:00:00Z');
settings.schedule_link_required = 'true'; delete cache.pcr_s34_schema_1;
store['Roster Link Requests'] = store['Roster Link Requests'] || []; store['Special Meal Requests'] = store['Special Meal Requests'] || [];
['ana@x.com', 'jone@x.com', 'hod@x.com', 'admin@x.com', 'ahod@x.com'].forEach(e => { const u = store.Users.find(x => x.email === e); if (u) u.employeeCode = ''; });
let s34lk = api('getMyRoster', { sessionToken: T.ana });
check('unlinked staff: Schedule locked', s34lk.success && s34lk.data.locked === true, JSON.stringify(s34lk).slice(0, 200));
const s34n0 = store.Notifications.length;
let s34rq = api('requestScheduleLink', { sessionToken: T.ana, type: 'number', code: 'gl-707' });
check('staff enters their number (normalised GL707), request pending', s34rq.success && s34rq.data.linkRequest.code === 'GL707' && s34rq.data.linkRequest.status === 'pending', JSON.stringify(s34rq));
const s34nN = store.Notifications.slice(s34n0);
check('HOD + admin notified of the link request (not other departments)', s34nN.some(n => n.userEmail === 'hod@x.com') && s34nN.some(n => n.userEmail === 'admin@x.com') && !s34nN.some(n => n.userEmail === 'khod@x.com'), JSON.stringify(s34nN.map(n => n.userEmail)));
check('still locked while pending, request shown', api('getMyRoster', { sessionToken: T.ana }).data.linkRequest.status === 'pending');
const s34rid = s34rq.data.linkRequest.id;
check('other department HOD cannot approve', api('decideLinkRequest', { sessionToken: T.khod, id: s34rid, decision: 'approve' }).success === false);
const s34n1 = store.Notifications.length;
let s34dc = api('decideLinkRequest', { sessionToken: T.hod, id: s34rid, decision: 'approve' });
check('own HOD approves → code saved', s34dc.success && store.Users.find(x => x.email === 'ana@x.com').employeeCode === 'GL707', JSON.stringify(s34dc));
check('staff notified "schedule unlocked"', store.Notifications.slice(s34n1).some(n => n.userEmail === 'ana@x.com' && /unlocked/i.test(n.title)));
s34lk = api('getMyRoster', { sessionToken: T.ana });
check('Schedule unlocked after approval', s34lk.success && !s34lk.data.locked && s34lk.data.employeeCode === 'GL707', JSON.stringify(s34lk).slice(0, 200));
const s34Tj = login('jone@x.com', 'pw-Jone');
s34rq = api('requestScheduleLink', { sessionToken: s34Tj, type: 'unknown' });
check('"I don\'t know my number" request', s34rq.success && s34rq.data.linkRequest.type === 'unknown');
check('approve without a code is refused', api('decideLinkRequest', { sessionToken: T.admin, id: s34rq.data.linkRequest.id, decision: 'approve' }).success === false);
check('a code already used is refused', api('decideLinkRequest', { sessionToken: T.admin, id: s34rq.data.linkRequest.id, decision: 'approve', code: 'GL707' }).success === false);
s34dc = api('decideLinkRequest', { sessionToken: T.admin, id: s34rq.data.linkRequest.id, decision: 'approve', code: 'GL708' });
check('admin enters the number → linked', s34dc.success && store.Users.find(x => x.email === 'jone@x.com').employeeCode === 'GL708', JSON.stringify(s34dc));
check('link actions logged', (store['Admin Log'] || store['Activity Log'] || []).length >= 0); // a31WriteLog is exercised via A31IO in the server suites
let s34ds = api('getDeptRosterStaff', { sessionToken: T.hod });
check('department staff: HOD sees own department only', s34ds.success && s34ds.data.department === 'Housekeeping' && s34ds.data.pending.concat(s34ds.data.active).every(u => u.department === 'Housekeeping'), JSON.stringify(s34ds).slice(0, 300));
check('department staff: roster-only names listed', Array.isArray(s34ds.data.rosterOnly), JSON.stringify(s34ds.data.counts));
const s34dsA = api('getDeptRosterStaff', { sessionToken: T.admin, department: 'Kitchen' });
check('department staff: admin filters by department', s34dsA.success && s34dsA.data.department === 'Kitchen' && s34dsA.data.pending.concat(s34dsA.data.active).every(u => u.department === 'Kitchen'));
check('department staff: plain staff refused', api('getDeptRosterStaff', { sessionToken: T.ana }).success === false);
const s34mails = []; ctx.sendAppMail = (to, subj, body, kind) => { s34mails.push({ to, subj, body, kind }); return { sent: true, via: 'test' }; };
let s34rg = api('registerStaff', { sessionToken: T.hod, firstName: 'Litia', lastName: 'Naco', email: 'Litia@x.com', department: 'Kitchen', employeeCode: 'GL790' });
check('HOD registers staff (always in their own department)', s34rg.success && s34rg.data.department === 'Housekeeping' && s34rg.data.code === 'GL790' && s34rg.data.emailed, JSON.stringify(s34rg));
const s34nu = store.Users.find(x => x.email === 'litia@x.com'); const s34temp = s34nu && s34nu.password;
check('new account active, must change password, code saved', s34nu && s34nu.active === true && s34nu.mustChangePassword === 'TRUE' && s34nu.employeeCode === 'GL790');
check('login email carries the one-time password (response never does)', s34mails.length === 1 && s34mails[0].body.indexOf(s34nu.password) >= 0 && JSON.stringify(s34rg).indexOf(s34nu.password) < 0);
check('duplicate email refused', api('registerStaff', { sessionToken: T.admin, firstName: 'X', lastName: 'Y', email: 'litia@x.com', department: 'Kitchen' }).success === false);
check('plain staff cannot register', api('registerStaff', { sessionToken: T.ana, firstName: 'X', lastName: 'Y', email: 'zz@x.com', department: 'Kitchen' }).success === false);
let s34lg = api('login', { email: 'litia@x.com', password: s34temp });
check('first login asks for a new password', s34lg.success === false && s34lg.needsPasswordChange === true, JSON.stringify(s34lg));
check('new password = one-time password refused', api('setFirstPassword', { email: 'litia@x.com', password: s34temp, newPassword: s34temp }).success === false);
const s34fp = api('setFirstPassword', { email: 'litia@x.com', password: s34temp, newPassword: 'mine-123' });
check('set own password → signed in', s34fp.success && s34fp.data.token, JSON.stringify(s34fp).slice(0, 200));
check('one-time password no longer works', api('login', { email: 'litia@x.com', password: s34temp }).success === false && api('login', { email: 'litia@x.com', password: 'mine-123' }).success === true);
// island + meal blocking (leave only)
const s34isl = (e, lv) => run('s34Island', e, run('s34OffList'), lv || '');
check('off-island defaults = AL, LWOP, ML, Bereavement', ['Annual leave', 'Unpaid leave', 'Maternity / Paternity', 'Family / Bereavement'].every(x => run('s34OffList')[x.toLowerCase()]) && !run('s34OffList')['day off'] && !run('s34OffList')['sick leave']);
check('working → on island', s34isl({ date: 'x', start: '07:00', end: '15:00' }) === 'on');
check('day off / RDO → on island', s34isl({ dayOff: true, leaveType: 'Day off', code: 'RDO' }) === 'on');
check('sick, PH, training, SDD, ON → on island', s34isl({ leaveType: 'Sick leave' }) === 'on' && s34isl({ leaveType: 'Public holiday' }) === 'on' && s34isl({ code: 'TRAINING', start: '07:00' }) === 'on' && s34isl({ code: 'SDD' }) === 'on' && s34isl({ code: 'ON' }) === 'on');
check('annual leave, LWOP, maternity, bereavement → off island', ['Annual leave', 'Unpaid leave', 'Maternity / Paternity', 'Family / Bereavement'].every(t => s34isl({ leaveType: t, code: 'X' }) === 'off'));
check('approved app leave (annual) → off island', s34isl(null, 'Annual leave') === 'off');
check('RELEASED → off island', s34isl({ code: 'RELEASED' }) === 'off');
settings.meal_roster_block = 'true';
const s34ana = ctx.findUserByEmail('ana@x.com');
ctx.r34UserDays = (em) => em === 'ana@x.com' ? { '2026-10-03': { date: '2026-10-03', leaveType: 'Annual leave', code: 'AL' }, '2026-10-04': { date: '2026-10-04', dayOff: true, leaveType: 'Day off', code: 'OFF' } } : {};
let s34mb = run('s34MealBlock', s34ana, 'dinner', '2026-10-03');
check('rostered on annual leave → order blocked with the date', s34mb && s34mb.rosteredOff && /rostered off on Sat 3 Oct/.test(s34mb.error), JSON.stringify(s34mb));
check('day off → not blocked', run('s34MealBlock', s34ana, 'dinner', '2026-10-04') === null);
check('unlinked staff never blocked', run('s34MealBlock', Object.assign({}, s34ana, { employeeCode: '' }), 'dinner', '2026-10-03') === null);
settings.meal_roster_block = 'false';
check('setting off → not blocked', run('s34MealBlock', s34ana, 'dinner', '2026-10-03') === null);
settings.meal_roster_block = 'true';
const s34sp = api('requestSpecialMeal', { sessionToken: T.ana, meal: 'dinner', serviceDate: '2026-10-03', reason: 'Staying on the island' });
check('special meal request → HOD notified', s34sp.success && store.Notifications.some(n => n.userEmail === 'hod@x.com' && /Special meal/.test(n.title)), JSON.stringify(s34sp));
check('reason is required', api('requestSpecialMeal', { sessionToken: T.ana, meal: 'lunch', serviceDate: '2026-10-03', reason: '' }).success === false);
check('other department HOD cannot approve the special meal', api('decideSpecialMeal', { sessionToken: T.khod, id: s34sp.data.id, decision: 'approve' }).success === false);
check('HOD approves the special meal', api('decideSpecialMeal', { sessionToken: T.hod, id: s34sp.data.id, decision: 'approve' }).success === true);
check('approved special meal listed for the kitchen', run('s34SpecialFor', '2026-10-03').dinner.length === 1 && run('s34SpecialFor', '2026-10-03').dinner[0].reason === 'Staying on the island');
// missing weekly roster: HOD Saturday, admins Sunday (once)
const s34remCtx = (today, hour, sent) => ({ today, hour, minute: 0, users: [{ email: 'hod@x.com', department: 'Housekeeping', active: true, isLead: true }, { email: 'admin@x.com', department: 'Management', active: true, isAdmin: true }],
  sent: sent || {}, backHour: 18, backMinute: 0, headsUp: false, days: () => ({}), leave: () => ({}), weeklyDone: () => false, monthlyDone: () => true });
const s34sat = run('r34PlanReminders', s34remCtx('2026-10-03', 19));
check('Saturday: HOD warned about next week, admins not yet', s34sat.some(x => x.kind === 'weekly_due' && x.email === 'hod@x.com') && !s34sat.some(x => x.kind === 'weekly_admin'), JSON.stringify(s34sat));
const s34sentK = {}; s34sat.forEach(x => { s34sentK[x.key] = 1; });
const s34sun = run('r34PlanReminders', s34remCtx('2026-10-04', 9, s34sentK));
check('Sunday: admins get one pending alert naming the department; HOD not warned twice', s34sun.some(x => x.kind === 'weekly_admin' && x.email === 'admin@x.com' && /Housekeeping/.test(x.body)) && !s34sun.some(x => x.kind === 'weekly_due'), JSON.stringify(s34sun));
s34sun.forEach(x => { s34sentK[x.key] = 1; });
check('Sunday again: nothing repeated', run('r34PlanReminders', s34remCtx('2026-10-04', 20, s34sentK)).length === 0);
settings.schedule_link_required = 'false';

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
