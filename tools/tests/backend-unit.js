// v3-test backend unit tests (no network, no Sheet): loads apps-script/*.gs into a Node VM with small Apps Script stubs.
// Run: node tools/tests/backend-unit.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); }

// ---- fake Users sheet
const U = (email, first, dept, perms, extra) => Object.assign({ id: 'u_' + email.split('@')[0], email, firstName: first, lastName: 'X', department: dept, role: perms.split(',').pop(), permissions: perms, password: 'pw-' + first, active: true, verified: true }, extra || {});
let users;
function resetUsers() {
  users = [
    U('it@paradisecoveresortfiji.com', 'IT', 'IT', 'super_admin,admin'),
    U('sa2@x.com', 'Leanne', 'Management', 'staff,hod,boat_manager,super_admin'),
    U('sa3@x.com', 'Delai', 'IT', 'super_admin'),
    U('ad1@x.com', 'Nicola', 'Management', 'staff,hod,admin'),
    U('ad2@x.com', 'Apenisa', 'Kitchen', 'staff,hod,chef,admin'),
    U('hodboat@x.com', 'Akuila', 'Management', 'staff,hod,boat_manager,boat_captain'),
    U('asstboat@x.com', 'Nanise', 'Other', 'staff,assistant_hod,boat_manager,boat_captain'),
    U('hodother@x.com', 'Praneel', 'Other', 'staff,hod'),
    U('hodasst@x.com', 'Rajesh', 'Other', 'staff,hod,assistant_hod'),
    U('chef1@x.com', 'Vicky', 'Kitchen', 'staff,chef'),
    U('paradisecove679@gmail.com', 'Test', 'Maintenance', 'staff,chef', { lastName: 'Test' }),
    U('chef3@x.com', 'Pranav', 'Management', 'staff,chef', { active: false }),
    U('staff1@x.com', 'Ana', 'Housekeeping', 'staff'),
    U('staff2@x.com', 'Sami', 'Kitchen', 'staff'),
    U('staff3@x.com', 'Eroni', 'Boatman', 'staff')
  ];
}
resetUsers();
const props = {};
const ctx = {
  console, Date, JSON, Math,
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
    formatDate: (d) => d.toISOString()
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (ctx._cache[k] === undefined ? null : ctx._cache[k]), put: (k, v) => { ctx._cache[k] = v; }, remove: k => { delete ctx._cache[k]; } }) },
  _cache: {},
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { sendEmail: (m) => { ctx._mail.push(m); } }, GmailApp: { sendEmail: (to, subject, body, o) => { ctx._mail.push({ to, subject, body, from: o && o.from, via: 'gmail' }); } },
  UrlFetchApp: { fetch: (url, o) => { ctx._fetch.push({ url, o }); return { getResponseCode: () => ctx._fetchCode, getContentText: () => '{}' }; } }, _fetch: [], _fetchCode: 201,
  _mail: [], _writes: []
};
vm.createContext(ctx);
for (const f of ['Code.gs', 'Speed.gs', 'V3.gs', 'Stations.gs', 'Snapshots.gs']) vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
// Sheet access → the fake users list (read) and a write log (writes are applied to the fake list only)
vm.runInContext('1', ctx);
ctx.sheetToObjects = (n) => n === 'Users' ? users.map(u => Object.assign({}, u)) : [];
ctx.cachedRows = ctx.sheetToObjects;
ctx.findUserByEmail = (e) => { const u = users.find(x => x.email === String(e || '').toLowerCase()); return u ? Object.assign({}, u) : null; };
ctx.updateRowById = (n, id, patch) => { ctx._writes.push({ n, id, patch }); const u = users.find(x => x.id === id); if (u) Object.assign(u, patch); return u; };
const settings = {};
ctx.getSetting = (k, fb) => settings[k] !== undefined ? String(settings[k]) : (fb === undefined ? '' : String(fb));
ctx.setSetting = (k, v) => { settings[k] = String(v); };
const R = (code) => vm.runInContext(code, ctx);
const run = (fn, args) => ctx[fn].apply(null, args);

let r0;
// ---- 1. live passcodes kept (2025 admin, 2026 superadmin) + live role gate (items 4 / 6 NOT chosen)
check('SUPER_PASS is 2026 and ADMIN_PASS is 2025 (both kept)', R('SUPER_PASS') === '2026' && R('ADMIN_PASS') === '2025');
check('no 3.0 admin-password / session-token code left', typeof ctx.isAdminPassword === 'undefined' && typeof ctx.issueSessionToken === 'undefined' && typeof ctx.verifySessionToken === 'undefined');
const req = (email, extra) => Object.assign({ requesterEmail: email }, extra || {});
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
check('super gate: superadmin role alone ok (live)', !throws(() => run('requirePasscode', [req('it@paradisecoveresortfiji.com'), 'super'])));
check('super gate: code 2026 still works (live)', !throws(() => run('requirePasscode', [{ passcode: '2026' }, 'super'])));
check('super gate: code 2025 is not superadmin (live)', throws(() => run('requirePasscode', [{ passcode: '2025' }, 'super'])));
check('admin gate: code 2025 still works (live)', !throws(() => run('requirePasscode', [{ passcode: '2025' }, 'admin'])));
check('admin gate: code 2026 also works for admin (live)', !throws(() => run('requirePasscode', [{ passcode: '2026' }, 'admin'])));
check('admin gate: staff without a code refused', throws(() => run('requirePasscode', [req('staff1@x.com'), 'admin'])));
check('admin gate: HOD role ok (live)', !throws(() => run('requirePasscode', [req('hodother@x.com'), 'admin'])));
const front = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
check('frontend keeps SUPER_PASS 2026 / ADMIN_PASS 2025 (live)', /const SUPER_PASS = '2026'/.test(front) && /const ADMIN_PASS = '2025'/.test(front));
check('no admin-password overlay in the frontend', !/pass-overlay|askAdminPassword|DEMO_ADMIN_PASS_SHA256/.test(front));
check('item 1: no @pcr.com default email checkbox on Register', !/reg-use-default-email/.test(front));
check('item 30 reverted: Excel / PDF libs from the same CDNs as live', /cdn\.sheetjs\.com\/xlsx-0\.20\.3/.test(front) && /pdf\.js\/3\.11\.174\/pdf\.min\.js/.test(front) && /html2pdf\.js\/0\.14\.0/.test(front) && !/assets\/vendor\//.test(front));

// ---- 2. codes by email only, never returned; no throttle (item 3 reverted)
check('verificationDelivery() is always email', run('verificationDelivery', []) === 'email');
ctx.appendRow = (n, row) => { ctx._writes.push({ n, row }); };
ctx._mail = [];
let rr = run('requestPasswordReset', [{ email: 'staff1@x.com' }]);
const mailed = ctx._mail.map(m => String(m.body || m.htmlBody || '')).join(' ');
const sent = (ctx._writes.find(w => w.n === 'Verification Codes') || { row: {} }).row.code;
check('reset code is emailed to the registered address', rr.success && !!sent && mailed.indexOf(sent) >= 0 && ctx._mail[0].to === 'staff1@x.com', JSON.stringify(rr));
check('reset response does not contain the code', JSON.stringify(rr).indexOf(sent) < 0 && !/\b\d{6}\b/.test(JSON.stringify(rr)));
rr = run('requestPasswordReset', [{ email: 'staff1@x.com' }]);
check('second code right away still sends (no rate limit, item 3 not chosen)', rr.success);
rr = run('requestPasswordReset', [{ email: 'nobody@x.com' }]);
check('reset for an unknown email sends nothing', ctx._mail.length === 2);
ctx._writes = [];

// ---- 2b. mail sender: provider switch + test redirect
ctx._mail = []; ctx._fetch = [];
let ms = run('sendAppMail', ['staff1@x.com', 'Hello', 'Body', 'notify']);
check('default provider = MailApp (script account)', ms.sent && ms.via === 'mailapp' && ctx._mail[0].to === 'staff1@x.com');
settings.mail_from = 'noreply@pcr.example';
ctx._mail = []; ms = run('sendAppMail', ['staff1@x.com', 'Hello', 'Body', 'notify']);
check('mail_from alias uses GmailApp from the alias', ms.sent && ctx._mail[0].via === 'gmail' && ctx._mail[0].from === 'noreply@pcr.example');
delete settings.mail_from;
settings.mail_provider = 'brevo'; settings.brevo_sender_email = 'app@pcr.example';
ctx._mail = []; ms = run('sendAppMail', ['staff1@x.com', 'Hello', 'Body', 'notify']);
check('brevo without API key falls back to MailApp (warning)', ms.sent && ms.via === 'mailapp' && /BREVO_API_KEY/.test(ms.warning || ''));
props.BREVO_API_KEY = 'xkeysib-test';
ctx._mail = []; ctx._fetch = []; ms = run('sendAppMail', ['staff1@x.com', 'Hello', 'Body', 'notify']);
const bp = ctx._fetch[0] && JSON.parse(ctx._fetch[0].o.payload);
check('brevo with key posts to the Brevo API', ms.sent && ms.via === 'brevo' && ctx._fetch[0].url === 'https://api.brevo.com/v3/smtp/email' && ctx._fetch[0].o.headers['api-key'] === 'xkeysib-test' && bp.sender.email === 'app@pcr.example' && bp.to[0].email === 'staff1@x.com' && ctx._mail.length === 0);
ctx._fetchCode = 401; ctx._mail = []; ms = run('sendAppMail', ['staff1@x.com', 'Hello', 'Body', 'notify']);
check('brevo error falls back to MailApp', ms.sent && ms.via === 'mailapp' && /Brevo HTTP 401/.test(ms.warning || ''));
ctx._fetchCode = 201; delete props.BREVO_API_KEY; delete settings.mail_provider; delete settings.brevo_sender_email;
const gs = run('getAppSettings', [{}]).data.settings;
check('settings expose provider + "key set" flag, never the key', gs.mail_provider === 'mailapp' && gs.brevo_key_set === false && JSON.stringify(gs).indexOf('xkeysib') < 0);
r0 = run('setAppSetting', [req('it@paradisecoveresortfiji.com', { key: 'mail_provider', value: 'sendgrid' })]);
check('only mailapp | brevo accepted', !r0.success);
r0 = run('setAppSetting', [req('it@paradisecoveresortfiji.com', { key: 'stations_exclusive', value: 'true' })]);
check('stations_exclusive cannot be set directly (only by the switch-over)', !r0.success);
props.MAIL_REDIRECT_TO = 'it@paradisecoveresortfiji.com'; props.MAIL_SUBJECT_PREFIX = '[TEST]';
ctx._mail = []; run('sendAppMail', [['hod1@x.com', 'admin@x.com'], 'Leave escalated', 'Body', 'notify']);
check('test backend: other mail redirected to it@ with [TEST]', ctx._mail.length === 1 && ctx._mail[0].to === 'it@paradisecoveresortfiji.com' && /^\[TEST\] /.test(ctx._mail[0].subject) && /originally to: hod1@x.com, admin@x.com/.test(ctx._mail[0].body));
ctx._mail = []; run('requestPasswordReset', [{ email: 'staff2@x.com' }]);
check('test backend: codes still go to the registered address, with [TEST]', ctx._mail.length === 1 && ctx._mail[0].to === 'staff2@x.com' && /^\[TEST\] /.test(ctx._mail[0].subject));
delete props.MAIL_REDIRECT_TO; delete props.MAIL_SUBJECT_PREFIX; ctx._writes = [];

// ---- 3. live role set, user management, role counts (no seats — item 9 not chosen)
resetUsers();
check('no seat-limit / migration code (items 9, 10, 11 not chosen)', typeof ctx.v3SeatUsage === 'undefined' && typeof ctx.migrateRoles === 'undefined' && typeof ctx.V3_SEAT_LIMITS === 'undefined');
const rc = run('v3RoleCounts', []);
check('role counts: superadmin 3, admin 2, chef 2 active, inactive 1', rc.super_admin === 3 && rc.admin === 2 && rc.chef === 3 && rc.inactive === 1, JSON.stringify(rc));
let r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff1@x.com', permissions: 'staff,admin' })]);
check('admin cannot grant admin', !r.success && /Only superadmin/.test(r.error));
r = run('setUserAccess', [req('it@paradisecoveresortfiji.com', { targetEmail: 'staff1@x.com', permissions: 'staff,super_admin' })]);
check('superadmin grants superadmin — no seat limit (4th)', r.success && users.find(u => u.email === 'staff1@x.com').permissions.indexOf('super_admin') >= 0 && r.data.roleCounts.super_admin === 4, r.error);
resetUsers();
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff2@x.com', permissions: 'staff,chef' })]);
check('kitchen (chef) is still an assignable personal role (parallel)', r.success && users.find(u => u.email === 'staff2@x.com').role === 'chef');
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff3@x.com', permissions: 'staff,boat_manager,boat_captain' })]);
check('boat manager / captain still assignable (parallel)', r.success && ctx.isBoatManagerPerm(users.find(u => u.email === 'staff3@x.com')));
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff1@x.com', permissions: 'staff,assistant_hod' })]);
check('assistant HOD permission also sets the 3.0 flag', r.success && users.find(u => u.email === 'staff1@x.com').assistantHod === true && ctx.isAsstHod(users.find(u => u.email === 'staff1@x.com')));
r = run('setUserAccess', [req('hodother@x.com', { targetEmail: 'staff1@x.com', department: 'Other' })]);
check('HOD cannot use admin user management', !r.success);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'it@paradisecoveresortfiji.com', active: 'false' })]);
check('main superadmin cannot be deactivated', !r.success);
resetUsers();
r = run('updateUser', [req('staff1@x.com', { targetEmail: 'staff1@x.com', department: 'Kitchen' })]);
check('item 21: staff cannot change their own department', !r.success || users.find(u => u.email === 'staff1@x.com').department === 'Housekeeping', r && r.error);
r = run('getUsers', [req('ad1@x.com')]);
check('getUsers returns role counts (not seats)', r.success && r.data.roleCounts && !r.data.seats);

// ---- 4. department join (item 12): blank status = approved; pending blocks leave / late / updates
resetUsers();
check('existing user with blank deptStatus counts as approved', ctx.deptApproved(users.find(u => u.email === 'staff1@x.com')));
users.find(u => u.email === 'staff2@x.com').deptStatus = 'pending';
const lsheets = { 'Leave Requests': [], 'Dept Updates': [], 'Notifications': [], 'Lunch Orders': [], 'Dinner Orders': [], 'Breakfast Orders': [] };
const baseSTO0 = ctx.sheetToObjects;
ctx.sheetToObjects = (n) => lsheets[n] ? lsheets[n].map(x => Object.assign({}, x)) : baseSTO0(n);
ctx.cachedRows = ctx.sheetToObjects;
ctx.appendRow = (n, row) => { ctx._writes.push({ n, row }); if (lsheets[n]) lsheets[n].push(Object.assign({}, row)); };
ctx.v3Append = (n, row) => ctx.appendRow(n, row);
const baseUpd = ctx.updateRowById;
ctx.updateRowById = (n, id, patch) => { if (lsheets[n]) { const x = lsheets[n].find(o => String(o.id) === String(id)); if (x) Object.assign(x, patch); return x; } return baseUpd(n, id, patch); };
r = run('submitLeave', [req('staff2@x.com', { leaveType: 'Day off', startDate: '2026-10-10', endDate: '2026-10-10', reason: 'x' })]);
check('pending join: leave locked', !r.success && /HOD accepts/i.test(r.error), r.error);
r = run('requestLateMeal', [req('staff2@x.com', { meal: 'lunch', reason: 'late boat' })]);
check('pending join: late meal request locked', !r.success && /HOD accepts/i.test(r.error), r.error);
r = run('decideJoinRequest', [req('hodasst@x.com', { targetEmail: 'staff2@x.com', decision: 'approve' })]);
check('HOD of another department cannot accept the join', !r.success, r.error);
r = run('decideJoinRequest', [req('ad2@x.com', { targetEmail: 'staff2@x.com', decision: 'approve' })]);
check('Kitchen HOD accepts → approved', r.success && users.find(u => u.email === 'staff2@x.com').deptStatus === 'approved', r.error);

// ---- 5. 2-step leave (items 22 / 33): HOD step never skipped, HOD only own department
users.push(U('hk.hod@x.com', 'Mere', 'Housekeeping', 'staff,hod'), U('hk.asst@x.com', 'Vika', 'Housekeeping', 'staff,assistant_hod'));
r = run('submitLeave', [req('staff1@x.com', { leaveType: 'Annual leave', startDate: '2026-10-10', endDate: '2026-10-12', reason: 'wedding' })]);
const lvId = r.data && r.data.request && r.data.request.id;
check('staff leave starts at the HOD step', r.success && r.data.request.status === 'pending_hod', r.error);
r = run('decideLeave', [req('ad1@x.com', { id: lvId, decision: 'approve' })]);
check('admin cannot skip the HOD step when the department has a HOD', !r.success && /HOD/.test(r.error), r.error);
r = run('decideLeave', [req('hodother@x.com', { id: lvId, decision: 'approve' })]);
check('HOD of another department cannot decide', !r.success);
r = run('decideLeave', [req('hk.asst@x.com', { id: lvId, decision: 'approve' })]);
check('assistant HOD of the department approves step 1 → management', r.success && r.data.request.status === 'pending_manager', r.error);
r = run('decideLeave', [req('hk.hod@x.com', { id: lvId, decision: 'approve' })]);
check('HOD cannot give final approval', !r.success);
r = run('decideLeave', [req('ad1@x.com', { id: lvId, decision: 'approve' })]);
check('admin final approval → approved', r.success && r.data.request.status === 'approved', r.error);
r = run('submitLeave', [req('staff3@x.com', { leaveType: 'Day off', startDate: '2026-10-15', endDate: '2026-10-15', reason: 'x' })]);
const lv2 = r.data.request.id;
r = run('decideLeave', [req('ad1@x.com', { id: lv2, decision: 'approve' })]);
check('department with no HOD: admin may decide step 1 (noted)', r.success && /no HOD/.test(lsheets['Leave Requests'].find(x => x.id === lv2).hodNote), r.error);
ctx._mail = [];
r = run('escalateLeave', [req('staff3@x.com', { id: lv2 })]);
check('escalate emails (via sendAppMail)', r.success, r.error);
r = run('cancelLeave', [req('staff3@x.com', { id: lv2 })]);
check('staff can cancel their pending leave', r.success && lsheets['Leave Requests'].find(x => x.id === lv2).status === 'cancelled');
r = run('submitLeave', [req('staff1@x.com', { leaveType: 'Day off', startDate: '2026-10-20', endDate: '2026-10-20', reason: 'x' })]);
const cal = run('getLeaveCalendar', [req('hk.hod@x.com', { month: '2026-10' })]);
check('leave calendar (HOD): own department, approved + pending', cal.success && cal.data.leave.length === 2 && cal.data.leave.every(l => l.department === 'Housekeeping') && !cal.data.allDepartments, JSON.stringify(cal.data && cal.data.leave.map(l => l.status)));
const cal2 = run('getLeaveCalendar', [req('ad1@x.com', { month: '2026-10' })]);
check('leave calendar (admin): all departments, cancelled hidden', cal2.success && cal2.data.allDepartments && cal2.data.leave.length === 2);
check('leave calendar: staff refused', !run('getLeaveCalendar', [req('staff1@x.com', { month: '2026-10' })]).success);
// ---- item 37: Approve all (HOD step only in own department; server re-checks each item)
const la = run('submitLeave', [req('staff1@x.com', { leaveType: 'Day off', startDate: '2026-11-02', endDate: '2026-11-02', reason: 'a' })]).data.request.id;
const lb = run('submitLeave', [req('staff3@x.com', { leaveType: 'Day off', startDate: '2026-11-03', endDate: '2026-11-03', reason: 'b' })]).data.request.id;
users.find(u => u.email === 'hk.hod@x.com').deptStatus = 'approved';
r = run('approveAllPending', [req('hk.hod@x.com', { kind: 'leave' })]);
const stA = lsheets['Leave Requests'].find(x => x.id === la).status, stB = lsheets['Leave Requests'].find(x => x.id === lb).status;
check('Approve all (HOD): approves own-department HOD step only', r.success && stA === 'pending_manager' && stB === 'pending_hod', JSON.stringify(r.data) + ' ' + stA + '/' + stB);
check('Approve all: staff refused', !run('approveAllPending', [req('staff1@x.com', { kind: 'leave' })]).success);
check('Approve all final step: HOD refused, admin ok', !run('approveAllPending', [req('hk.hod@x.com', { kind: 'final' })]).success && run('approveAllPending', [req('ad1@x.com', { kind: 'final' })]).success && lsheets['Leave Requests'].find(x => x.id === la).status === 'approved');
users.find(u => u.email === 'staff2@x.com').deptStatus = 'pending'; users.push(U('hk.new@x.com', 'Tomasi', 'Housekeeping', 'staff', { deptStatus: 'pending' }));
r = run('approveAllPending', [req('hk.asst@x.com', { kind: 'joins' })]);
check('Approve all joins (assistant HOD): own department only', r.success && users.find(u => u.email === 'hk.new@x.com').deptStatus === 'approved' && users.find(u => u.email === 'staff2@x.com').deptStatus === 'pending', JSON.stringify(r.data));
ctx.sheetToObjects = baseSTO0; ctx.cachedRows = baseSTO0; ctx.updateRowById = baseUpd;

// ---- 6. cutoff reminder (item 39): in-app, no emails, only users who have not ordered
const realNow = ctx.getFijiNow;
ctx.getFijiNow = () => new Date(Date.UTC(2026, 8, 26, 19, 10));
let cr = run('v3CutoffReminders', [users[12], []]);
check('7:10pm: dinner reminder for someone who has not ordered', cr.length === 1 && cr[0].meal === 'dinner' && cr[0].minutesLeft === 50, JSON.stringify(cr));
cr = run('v3CutoffReminders', [users[12], [{ meal: 'dinner', serviceDate: '2026-09-27', status: 'approved' }]]);
check('…and none once they have ordered', cr.length === 0);
ctx.getFijiNow = () => new Date(Date.UTC(2026, 8, 26, 12, 30));
cr = run('v3CutoffReminders', [users[12], []]);
check('12:30pm: breakfast + lunch reminders', cr.map(x => x.meal).sort().join() === 'breakfast,lunch', JSON.stringify(cr));
ctx.getFijiNow = () => new Date(Date.UTC(2026, 8, 26, 15, 0));
check('3pm: no reminder', run('v3CutoffReminders', [users[12], []]).length === 0);
ctx.getFijiNow = realNow;

// ---- 7. stations (item 35) in PARALLEL with the old personal kitchen / boat roles
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
const personalChef = users.find(u => u.email === 'chef1@x.com');
check('parallel: personal chef keeps chef tools', ctx.isChefPerm(personalChef) === true);
check('parallel: admin keeps chef + boat tools (live)', ctx.isChefPerm(users.find(u => u.email === 'ad1@x.com')) && ctx.isBoatManagerPerm(users.find(u => u.email === 'ad1@x.com')));
r = run('setStationPassword', [req('ad1@x.com', { station: 'chef', password: 'kitchen-2026-x' })]);
check('admin (not super) cannot set station passwords', !r.success && /Superadmin only/.test(r.error));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'short' })]);
check('weak station password refused', !r.success && /8 characters/.test(r.error));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x' })]);
check('superadmin sets the Chef station password', r.success && r.data.station.configured && r.data.station.username === 'chef', r.error);
const cfgRaw = props.PCR_STATION_chef || '';
check('station password stored hashed (no plain text)', cfgRaw && cfgRaw.indexOf('kitchen-2026-x') < 0 && /"hash"/.test(cfgRaw) && /"salt"/.test(cfgRaw));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'boat', generate: 1 })]);
const boatPw = r.data && r.data.password;
check('one-tap rotate generates a password shown once', r.success && /^[a-z]+-[a-z]+-\d{4}$/.test(boatPw || ''), boatPw);
check('after station setup, personal chef STILL has tools (parallel until switch-over)', ctx.isChefPerm(personalChef) === true);
r = run('login', [{ email: 'chef', password: 'wrong-password' }]);
check('station login: wrong password refused', !r.success);
r = run('login', [{ email: 'chef', password: 'kitchen-2026-x' }]);
const chefTok = r.data && r.data.token;
check('station login: Chef credentials → station token', r.success && r.data.station === 'chef' && /^st1\./.test(chefTok || ''));
r = run('login', [{ email: 'boat', password: boatPw }]);
const boatTok = r.data && r.data.token;
check('station login: Boat credentials → station token', r.success && r.data.station === 'boat');
r = run('login', [{ email: 'staff1@x.com', password: 'pw-Ana' }]);
check('personal login unchanged (live token format, not a station token)', r.success && !/^st1\./.test(r.data.token || '') && !r.data.station);
const bindAs = (tok, action, extra) => { const q = Object.assign({ sessionToken: tok }, extra || {}); const b = run('bindRequestIdentity', [action, q]); return { b, q }; };
for (const a of ['placeDinnerOrder', 'placeLunchOrder', 'placeBreakfastOrder', 'placeMealOnBehalf', 'placeSpecialMeal', 'submitLeave', 'requestLeave', 'requestLateMeal', 'getUsers', 'setUserAccess', 'getV3Home', 'getBootstrap', 'updateProfile', 'deleteUser', 'getMyHistory', 'bookBoat', 'saveBoatRun', 'getAdminExport', 'setStationPassword', 'stationsSwitchOver']) {
  const { b } = bindAs(chefTok, a);
  check('Chef station refused: ' + a, b && b.error && b.stationDenied, b && b.error);
}
for (const a of ['markOrderStatus', 'placeDinnerOrder', 'getKitchenDashboard', 'submitLeave', 'getUsers', 'getOrderSnapshots']) {
  const { b } = bindAs(boatTok, a);
  check('Boat station refused: ' + a, b && b.error && b.stationDenied);
}
let x = bindAs(chefTok, 'getKitchenDashboard');
check('Chef station allowed: getKitchenDashboard (identity from token)', !x.b.error && x.q.requesterEmail === 'station.chef@pcr.local' && ctx.isChefPerm(run('getRequester', [x.q])));
x = bindAs(chefTok, 'getKitchenDashboard', { requesterEmail: 'it@paradisecoveresortfiji.com' });
check('station token ignores a spoofed requesterEmail', x.q.requesterEmail === 'station.chef@pcr.local');
x = bindAs(chefTok, 'markOrderStatus', { id: 'o1', status: 'served' });
check('station mutation without a name → "Who\'s doing this?"', x.b.error && x.b.needsActor);
x = bindAs(chefTok, 'markOrderStatus', { id: 'o1', status: 'served', actorName: 'Vicky Maheshwar' });
check('station mutation with a name is allowed and attributed', !x.b.error && run('getRequester', [x.q]).firstName === 'Vicky Maheshwar' && x.q._actor === 'Vicky Maheshwar');
x = bindAs(chefTok, 'getKitchenDashboard', { _stationUser: { station: 'chef' }, _station: 'boat' });
check('client cannot inject _station fields', x.q._station === 'chef');
x = bindAs(boatTok, 'saveBoatRun', { route: 'PC → Soso', actorName: 'Eroni Naua' });
check('Boat station can edit runs with a name', !x.b.error && ctx.isBoatManagerPerm(run('getRequester', [x.q])));
ctx._writes = [];
ctx.appendRow = (n, row) => { ctx._writes.push({ n, row }); };
ctx.stationLogWrite(x.q, 'saveBoatRun', { success: true, data: { id: 'run1' } });
check('station write is logged with the actor', ctx._writes.some(w => w.n === 'Station Log' && w.row.actor === 'Eroni Naua' && w.row.station === 'boat'));
x = { q: req('chef1@x.com', { id: 'o1' }) }; x.b = run('bindRequestIdentity', ['markOrderStatus', x.q]);
check('parallel: personal chef account still allowed chef actions', x.b === null);
x = { q: req('it@paradisecoveresortfiji.com', { actorName: 'ignored' }) }; x.b = run('bindRequestIdentity', ['markOrderStatus', x.q]);
check('superadmin uses chef tools as themselves (no picker)', x.b === null && x.q.actorName === undefined);
r = run('getStationPeople', [bindAs(chefTok, 'getStationPeople').q]);
check('Chef name picker lists active Kitchen staff only', r.success && r.data.people.map(p => p.name).includes('Sami X') && !r.data.people.some(p => /Pranav|Ana/.test(p.name)), JSON.stringify(r.data && r.data.people));
r = run('getStationPeople', [bindAs(boatTok, 'getStationPeople').q]);
check('Boat name picker lists Boatman staff', r.success && r.data.people.some(p => /Eroni/.test(p.name)));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', generate: 1 })]);
x = bindAs(chefTok, 'getKitchenDashboard');
check('rotating the Chef password signs out old Chef sessions', x.b && x.b.error && x.b.stationSignedOut);
x = bindAs(boatTok, 'getBoatRuns');
check('…but Boat sessions keep working', !(x.b && x.b.error));
r = run('signOutStation', [req('it@paradisecoveresortfiji.com', { station: 'boat' })]);
x = bindAs(boatTok, 'getBoatRuns');
check('"Sign out all devices" revokes Boat sessions', r.success && x.b && x.b.error);
check('same Boat password works again after sign-out-all', run('login', [{ email: 'boat', password: boatPw }]).success);
check('forged station token rejected', run('stationVerifyToken', ['st1.' + Buffer.from('chef|1|1|abc').toString('base64')]) === null);

// ---- 8. switch-over (prepared, NOT run): preview → apply → station-only → undo
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
ctx._writes = [];
let so = run('stationsSwitchOver', [req('ad1@x.com', { dryRun: 'true' })]);
check('switch-over preview: superadmin only', !so.success);
so = run('stationsSwitchOver', [req('it@paradisecoveresortfiji.com', { dryRun: 'true' })]).data;
const ch = (e) => so.changes.find(c => c.email === e);
check('preview: Apenisa (admin+HOD+chef) keeps admin + HOD, drops chef', ch('ad2@x.com') && ch('ad2@x.com').to.split(',').includes('admin') && ch('ad2@x.com').to.split(',').includes('hod') && !ch('ad2@x.com').to.includes('chef'));
check('preview: Vicky (chef) → staff', ch('chef1@x.com') && ch('chef1@x.com').to === 'staff');
check('preview: Akuila (HOD + boat) keeps HOD', ch('hodboat@x.com') && ch('hodboat@x.com').to.split(',').includes('hod') && !/boat/.test(ch('hodboat@x.com').to));
check('preview: Nanise keeps assistant HOD', ch('asstboat@x.com') && ch('asstboat@x.com').to.split(',').includes('assistant_hod'));
check('preview: Leanne keeps superadmin + HOD', ch('sa2@x.com') && ch('sa2@x.com').to.split(',').includes('super_admin') && ch('sa2@x.com').to.split(',').includes('hod'));
check('preview writes nothing and flag stays OFF', ctx._writes.length === 0 && settings.stations_exclusive === undefined && so.applied === false);
check('preview reports both stations missing', so.stationsMissing.sort().join() === 'boat,chef');
r = run('stationsSwitchOver', [req('it@paradisecoveresortfiji.com', { apply: 1 })]);
check('apply refused until both stations are set up', !r.success && /station login first/.test(r.error));
run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x' })]);
run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'boat', password: 'boats-2026-x' })]);
const rbRows = [];
const sto1 = ctx.sheetToObjects;
ctx.v3Append = (n, row) => { if (n === 'Role Backup') rbRows.push(Object.assign({}, row)); };
ctx.sheetToObjects = (n) => n === 'Role Backup' ? rbRows.map(x => Object.assign({}, x)) : sto1(n);
r = run('stationsSwitchOver', [req('it@paradisecoveresortfiji.com', { apply: 1 })]);
check('apply: flag ON, rows backed up', r.success && settings.stations_exclusive === 'true' && rbRows.length === so.changeCount, r.error);
const byE = e => users.find(u => u.email === e);
check('after: Apenisa is admin + HOD, no chef tools', ctx.isAdminPerm(byE('ad2@x.com')) && ctx.isHodPerm(byE('ad2@x.com')) && !ctx.isChefPerm(byE('ad2@x.com')));
check('after: personal chef / admin lose chef + boat tools', !ctx.isChefPerm(byE('chef1@x.com')) && !ctx.isBoatManagerPerm(byE('ad1@x.com')));
check('after: superadmin keeps both', ctx.isChefPerm(users[0]) && ctx.isBoatManagerPerm(users[0]));
x = { q: req('ad1@x.com') }; x.b = run('bindRequestIdentity', ['saveBoatRun', x.q]);
check('after: personal admin refused boat actions on the server', x.b && x.b.stationOnly);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff2@x.com', permissions: 'staff,chef' })]);
check('after: chef no longer assignable', !r.success && /station/.test(r.error));
r = run('stationsSwitchBack', [req('it@paradisecoveresortfiji.com')]);
check('undo restores personal roles and flag OFF', r.success && settings.stations_exclusive === 'false' && byE('chef1@x.com').permissions === 'staff,chef' && ctx.isChefPerm(byE('chef1@x.com')));
ctx.sheetToObjects = sto1; delete settings.stations_exclusive;

// ---- NEW: meal summaries (Meal Snapshots): dinner 8pm, breakfast / lunch 1pm, last 5 days
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
const sheets = { 'Dinner Orders': [], 'Breakfast Orders': [], 'Lunch Orders': [], 'Meal Snapshots': [] };
const baseSTO = ctx.sheetToObjects;
ctx.sheetToObjects = (n) => sheets[n] ? sheets[n].map(r => Object.assign({}, r)) : baseSTO(n);
ctx.cachedRows = ctx.sheetToObjects;
ctx.appendRow = (n, row) => { ctx._writes.push({ n, row }); if (sheets[n]) sheets[n].push(Object.assign({}, row)); };
ctx.ensureSheet = () => ({}); ctx.getSS = () => ({ getSheetByName: () => null });
let fakeNow = new Date(Date.UTC(2026, 8, 26, 20, 5)); // 26 Sep 2026 20:05 Fiji → tomorrow's (27th) dinner books closed
ctx.getFijiNow = () => new Date(fakeNow.getTime());
const D = (id, date, user, choice, status, extra) => Object.assign({ id, serviceDate: date, userEmail: user, userName: user.split('@')[0], department: 'Housekeeping', mealChoice: choice, status, late: false, notes: '', specialNote: '', createdAt: '2026-09-26 12:00' }, extra || {});
sheets['Dinner Orders'].push(D('d1', '2026-09-27', 'staff1@x.com', 'Fish curry', 'approved', { specialNote: 'Allergy: peanuts' }),
  D('d2', '2026-09-27', 'staff2@x.com', 'Chicken', 'approved'), D('d3', '2026-09-27', 'staff3@x.com', 'Chicken', 'cancelled'),
  D('d9', '2026-09-20', 'staff1@x.com', 'Pork', 'approved'));
const DS = () => sheets['Meal Snapshots'].filter(x => x.meal === 'dinner');
let t = run('dinnerSnapshotTick', []);
check('8:05pm trigger saves tomorrow\'s dinner snapshot', t.dinner.created === true && t.dinner.serviceDate === '2026-09-27' && DS().length === 1, JSON.stringify(t));
const snap1 = DS()[0], pay1 = JSON.parse(snap1.payloadJson);
check('snapshot = printable dinner list data (tally, byItem, all orders)', pay1.prep.totalOrders === 2 && pay1.prep.tally['Chicken'] === 1 && pay1.orders.length === 3 && snap1.kind === 'auto' && snap1.meal === 'dinner');
check('snapshot keeps the allergies & special requests', pay1.prep.specialNotes.some(n => /peanuts/.test(n.note) && n.flag === 'allergy'));
t = run('dinnerSnapshotTick', []);
check('trigger is idempotent (second run creates nothing)', t.dinner.created === false && DS().length === 1);
check('fallback on open is idempotent too', (run('snapFallback', []) || {}).created === false && DS().length === 1);
fakeNow = new Date(Date.UTC(2026, 8, 26, 15, 0));
check('before 8pm the dinner snapshot is not taken', !(run('dinnerSnapshotTick', []).dinner || {}).created && DS().length === 1);
fakeNow = new Date(Date.UTC(2026, 8, 27, 21, 30)); // next evening, the trigger did not run → first open saves it
sheets['Dinner Orders'].push(D('d4', '2026-09-28', 'staff1@x.com', 'Fish curry', 'approved'));
let lst = run('getOrderSnapshots', [req('it@paradisecoveresortfiji.com')]);
check('opening the list after a missed trigger saves the snapshot (fallback)', lst.success && lst.data.autoCreated && DS().some(x => x.serviceDate === '2026-09-28' && x.kind === 'auto'));
check('list is latest first', lst.data.snapshots[0].serviceDate === '2026-09-28' && lst.data.snapshots[1].serviceDate === '2026-09-27');
// a late order approved after the cutoff → addendum; the original auto snapshot is kept
sheets['Dinner Orders'].push(D('d5', '2026-09-27', 'staff2@x.com', 'Fish curry', 'late_approved', { late: true, createdAt: '2026-09-26 20:40' }));
sheets['Dinner Orders'].find(o => o.id === 'd2').status = 'cancelled';
let one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27', meal: 'dinner' })]);
check('date lookup returns the saved auto snapshot', one.success && one.data.source === 'snapshot' && one.data.kind === 'auto' && one.data.payload.prep.totalOrders === 2);
check('late order after the cutoff shows as an addendum', one.data.addendum.added.length === 1 && one.data.addendum.added[0].id === 'd5');
check('cancellation after the cutoff shows as an addendum change', one.data.addendum.changed.some(o => o.id === 'd2' && o.was === 'approved' && o.status === 'cancelled'));
let sv = run('saveOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27', meal: 'dinner' })]);
check('regenerating saves a new manual snapshot, original auto kept', sv.success && DS().filter(x => x.serviceDate === '2026-09-27').map(x => x.kind).sort().join() === 'auto,manual');
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27' })]);
check('date lookup still prefers the original auto snapshot', one.data.kind === 'auto');
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-20', meal: 'dinner' })]);
check('previous date without a snapshot is built from the order rows (not saved)', one.success && one.data.source === 'rows' && one.data.payload.prep.totalOrders === 1 && !sheets['Meal Snapshots'].some(x => x.serviceDate === '2026-09-20'));
sheets['Breakfast Orders'].push({ id: 'b1', serviceDate: '2026-09-25', userEmail: 'staff1@x.com', userName: 'Ana', status: 'ordered', notes: 'No egg' });
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-25', meal: 'breakfast' })]);
check('breakfast summary builds from rows too', one.success && one.data.meal === 'breakfast' && one.data.payload.totalCounted === 1);
check('staff cannot read summaries', !run('getOrderSnapshots', [req('staff1@x.com')]).success);
check('admin can read summaries', run('getOrderSnapshots', [req('ad1@x.com')]).success);
check('archiveOldRows never touches Meal Snapshots', !ctx.ARCHIVE_PLAN.some(x => /Snapshot/.test(x.name)));
run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x' })]);
const ct = run('login', [{ email: 'chef', password: 'kitchen-2026-x' }]).data.token;
let bq = { sessionToken: ct, serviceDate: '2026-09-27' }; let bb = run('bindRequestIdentity', ['saveOrderSnapshot', bq]);
check('Chef station saving a summary needs a name', bb && bb.needsActor);
bq = { sessionToken: ct, serviceDate: '2026-09-27', actorName: 'Vikash Chand' }; bb = run('bindRequestIdentity', ['saveOrderSnapshot', bq]);
sv = run('saveOrderSnapshot', [bq]);
check('Chef station summary is saved with the picked name', bb && bb.station === 'chef' && sv.success && /Vikash Chand \(Chef station\)/.test(sv.data.generatedBy), sv.data && sv.data.generatedBy);

// breakfast / lunch cutoff snapshots at 1pm + the 5-day picker
fakeNow = new Date(Date.UTC(2026, 8, 27, 13, 5)); // 27 Sep 13:05 → tomorrow (28th) breakfast + lunch closed
sheets['Lunch Orders'].push({ id: 'l1', serviceDate: '2026-09-28', userEmail: 'staff1@x.com', userName: 'Ana', status: 'ordered', notes: 'Allergy: shellfish' });
sheets['Breakfast Orders'].push({ id: 'b2', serviceDate: '2026-09-28', userEmail: 'staff2@x.com', userName: 'Sami', status: 'ordered', notes: '' });
t = run('mealSnapshotTick', []);
const bl = sheets['Meal Snapshots'].filter(x => x.serviceDate === '2026-09-28' && x.kind === 'auto').map(x => x.meal).sort().join();
check('1:05pm trigger saves tomorrow\'s breakfast + lunch snapshots', /breakfast/.test(bl) && /lunch/.test(bl), bl + ' ' + JSON.stringify(t));
const lpay = JSON.parse(sheets['Meal Snapshots'].find(x => x.meal === 'lunch' && x.serviceDate === '2026-09-28').payloadJson);
check('lunch snapshot keeps allergies & special requests', JSON.stringify(lpay).indexOf('shellfish') >= 0);
lst = run('getOrderSnapshots', [req('it@paradisecoveresortfiji.com', { meal: 'lunch' })]);
check('picker: last 5 days + today + tomorrow (7 days)', lst.success && lst.data.days.length === 7 && lst.data.days[0].offset === -5 && lst.data.days[6].offset === 1 && lst.data.days[6].date === '2026-09-28');
check('picker marks saved days per meal', lst.data.days[6].saved.lunch === true && lst.data.days[0].saved.lunch === false);
check('last closed per meal (lunch 28th closed at 1pm, dinner 28th still open)', lst.data.lastClosed.lunch === '2026-09-28' && lst.data.lastClosed.dinner === '2026-09-27');
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-22', meal: 'lunch' })]);
check('missing day 5 days back is generated from the order rows', one.success && one.data.source === 'rows');
check('kitchen role (parallel) can read summaries', run('getOrderSnapshots', [req('chef1@x.com')]).success);
check('triggers: 13:05 + 20:05 installer exists (dinner alias kept)', typeof ctx.installMealSnapshotTriggers === 'function' && typeof ctx.installDinnerSnapshotTrigger === 'function');

console.log('\nSUMMARY: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
