// 3.0 backend unit tests (no network, no Sheet): loads apps-script/*.gs into a Node VM with small Apps Script stubs.
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
    U('chef1@x.com', 'Vicky', 'Kitchen', 'staff,chef'),
    U('chef2@x.com', 'Test', 'Maintenance', 'staff,chef'),
    U('chef3@x.com', 'Pranav', 'Management', 'staff,chef', { active: false }),
    U('staff1@x.com', 'Ana', 'Housekeeping', 'staff'),
    U('staff2@x.com', 'Sami', 'Kitchen', 'staff')
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
  MailApp: { sendEmail: (m) => { ctx._mail.push(m); } }, GmailApp: { sendEmail: () => {} },
  _mail: [], _writes: []
};
vm.createContext(ctx);
for (const f of ['Code.gs', 'Speed.gs', 'V3.gs']) vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
// Sheet access → the fake users list (read) and a write log (writes are applied to the fake list only)
vm.runInContext('1', ctx);
ctx.sheetToObjects = (n) => n === 'Users' ? users.map(u => Object.assign({}, u)) : [];
ctx.cachedRows = ctx.sheetToObjects;
ctx.findUserByEmail = (e) => { const u = users.find(x => x.email === String(e || '').toLowerCase()); return u ? Object.assign({}, u) : null; };
ctx.updateRowById = (n, id, patch) => { ctx._writes.push({ n, id, patch }); const u = users.find(x => x.id === id); if (u) Object.assign(u, patch); return u; };
ctx.getSetting = (k, fb) => fb === undefined ? '' : String(fb);
const R = (code) => vm.runInContext(code, ctx);
const run = (fn, args) => ctx[fn].apply(null, args);

// ---- 1. admin password
check('2026 is the admin password', run('isAdminPassword', ['2026']));
check('2025 is NOT accepted', !run('isAdminPassword', ['2025']));
check('empty / number-ish values rejected', !run('isAdminPassword', ['']) && !run('isAdminPassword', [null]) && !run('isAdminPassword', ['02026']));
const src = ['Code.gs', 'Speed.gs', 'V3.gs'].map(f => fs.readFileSync(path.join(root, 'apps-script', f), 'utf8')).join('\n');
check('no "2025" passcode left in backend code', !/['"]2025['"]/.test(src));
const front = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8') + fs.readFileSync(path.join(root, 'public', 'assets', 'v3.js'), 'utf8');
check('no "2025"/"2026" plain passcode in frontend (only a demo hash)', !/['"]202[56]['"]/.test(front));
const req = (email, extra) => Object.assign({ requesterEmail: email }, extra || {});
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
check('super gate: superadmin + 2026 ok', !throws(() => run('requirePasscode', [req('it@paradisecoveresortfiji.com', { passcode: '2026' }), 'super'])));
check('super gate: superadmin + 2025 refused', throws(() => run('requirePasscode', [req('it@paradisecoveresortfiji.com', { passcode: '2025' }), 'super'])));
check('super gate: admin (not super) + 2026 refused', throws(() => run('requirePasscode', [req('ad1@x.com', { passcode: '2026' }), 'super'])));
check('super gate: staff + 2026 refused (password alone grants nothing)', throws(() => run('requirePasscode', [req('staff1@x.com', { passcode: '2026' }), 'super'])));
check('admin gate: staff refused', throws(() => run('requirePasscode', [req('staff1@x.com'), 'admin'])));

// ---- 2. codes by email, never returned
check('verificationDelivery() is always email', run('verificationDelivery', []) === 'email');
ctx.appendRow = (n, row) => { ctx._writes.push({ n, row }); };
ctx._mail = [];
let rr = run('requestPasswordReset', [{ email: 'staff1@x.com' }]);
const mailed = ctx._mail.map(m => String(m.body || m.htmlBody || '')).join(' ');
const sent = (ctx._writes.find(w => w.n === 'Verification Codes') || { row: {} }).row.code;
check('reset code is emailed', rr.success && !!sent && mailed.indexOf(sent) >= 0, JSON.stringify(rr));
check('reset response does not contain the code', JSON.stringify(rr).indexOf(sent) < 0 && !/\b\d{6}\b/.test(JSON.stringify(rr)));
rr = run('requestPasswordReset', [{ email: 'staff1@x.com' }]);
check('second code within a minute is throttled', !rr.success || /wait|minute/i.test(JSON.stringify(rr)), JSON.stringify(rr));
ctx._writes = [];

// ---- 4. session tokens replace client requesterEmail
const it = users[0];
const tok = run('issueSessionToken', [it]);
check('token verifies for its user', (run('verifySessionToken', [tok]) || {}).email === it.email);
let p = { requesterEmail: 'staff1@x.com', sessionToken: tok };
run('bindRequestIdentity', ['getUsers', p]);
check('requesterEmail is replaced by the token identity', p.requesterEmail === it.email && p.sessionToken === undefined);
p = { requesterEmail: 'it@paradisecoveresortfiji.com' };
const b = run('bindRequestIdentity', ['deleteUser', p]);
check('spoofed requesterEmail without token is refused', b && b.error && p.requesterEmail === undefined);
check('public actions work without a token', run('bindRequestIdentity', ['login', { email: 'a@b.c' }]) === null);
const t2 = run('issueSessionToken', [users[11]]);
p = { sessionToken: t2, userEmail: 'staff2@x.com' };
run('bindRequestIdentity', ['placeDinnerOrder', p]);
check('staff cannot order for someone else', p.userEmail === 'staff1@x.com');
users[11].password = 'changed';
check('password change invalidates old tokens', run('verifySessionToken', [t2]) === null);
check('forged token rejected', run('verifySessionToken', [Buffer.from('it@paradisecoveresortfiji.com|' + Date.now() + '|abc').toString('base64')]) === null);

// ---- 3. seats
resetUsers();
const seats = run('v3SeatUsage', []);
check('seats: superadmin 3 of 3', seats.super_admin.used === 3 && seats.super_admin.limit === 3);
check('seats: admin 2 of 5', seats.admin.used === 2 && seats.admin.limit === 5);
check('seats: boat manager 2 of 2 (HOD + asst HOD captains)', seats.boat_manager.used === 2 && seats.boat_manager.limit === 2, JSON.stringify(seats.boat_manager.users.map(x => x.name)));
check('seats: chef 2 of 3 (inactive chef does not count)', seats.chef.used === 2 && seats.chef.limit === 3);
let r = run('setUserAccess', [req('it@paradisecoveresortfiji.com', { targetEmail: 'staff1@x.com', role: 'super_admin', passcode: '2026' })]);
check('4th superadmin refused with clear message', !r.success && /Superadmin seats are full \(3 of 3/.test(r.error), r.error);
r = run('setUserAccess', [req('it@paradisecoveresortfiji.com', { targetEmail: 'staff1@x.com', role: 'admin' })]);
check('granting admin without the password refused', !r.success && /password/i.test(r.error));
r = run('setUserAccess', [req('it@paradisecoveresortfiji.com', { targetEmail: 'staff1@x.com', role: 'admin', passcode: '2025' })]);
check('granting admin with 2025 refused', !r.success && /password/i.test(r.error));
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff1@x.com', role: 'admin', passcode: '2026' })]);
check('admin cannot grant admin', !r.success && /Only superadmin/.test(r.error));
r = run('setUserAccess', [req('it@paradisecoveresortfiji.com', { targetEmail: 'staff1@x.com', role: 'admin', passcode: '2026' })]);
check('superadmin + 2026 grants admin (3 of 5)', r.success && r.data.seats.admin.used === 3, r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff2@x.com', role: 'boat_manager' })]);
check('3rd boat manager refused', !r.success && /Boat manager seats are full \(2 of 2/.test(r.error), r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'hodother@x.com', boatManager: 'true' })]);
check('HOD "also boat manager" also counts against the boat seats', !r.success && /Boat manager seats are full/.test(r.error), r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff2@x.com', role: 'chef' })]);
check('3rd chef allowed (3 of 3)', r.success && r.data.seats.chef.used === 3, r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'chef3@x.com', active: 'true' })]);
check('re-activating a 4th chef refused', !r.success && /Chef seats are full/.test(r.error), r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'hodboat@x.com', department: 'Grounds' })]);
check('editing an existing boat manager (no new seat) still works when full', r.success, r.error);

// ---- migration
resetUsers();
ctx._writes = [];
let m = run('migrateRoles', [req('ad1@x.com', { dryRun: 'true' })]).data;
const tgt = (e) => run('v3MigrateTarget', [users.find(u => u.email === e)]);
check('HOD + captain → HOD + secondary boat manager', tgt('hodboat@x.com').role === 'hod' && tgt('hodboat@x.com').alsoBoat && tgt('hodboat@x.com').perms === 'hod,boat_manager');
check('asst HOD + captain → boat manager + assistant HOD flag', tgt('asstboat@x.com').role === 'boat_manager' && tgt('asstboat@x.com').assistantHod === true);
check('nobody loses rights', m.lostRights.length === 0, JSON.stringify(m.lostRights));
check('seats after migration fit (no problems)', m.seatProblems.length === 0, JSON.stringify(m.seatProblems));
check('HOD / asst HOD in "Other" flagged', m.warnings.filter(w => /department "Other"/.test(w.text)).map(w => w.email).sort().join() === 'asstboat@x.com,hodother@x.com');
check('chef outside kitchen flagged', m.warnings.some(w => w.email === 'chef2@x.com' && /not a kitchen/.test(w.text)));
check('dry run writes nothing', ctx._writes.length === 0);
r = run('migrateRoles', [req('ad1@x.com', { apply: 1 })]);
check('apply without password refused', !r.success && /password/i.test(r.error));
r = run('migrateRoles', [req('staff1@x.com', { apply: 1, passcode: '2026' })]);
check('apply by staff refused (password alone is not enough)', !r.success);
users.push(U('cap3@x.com', 'Cap', 'Boatman', 'staff,boat_captain'));
r = run('migrateRoles', [req('ad1@x.com', { apply: 1, passcode: '2026' })]);
check('apply refused while a seat limit would be exceeded', !r.success && /Boat manager: 3 of 2/.test(r.error), r.error);
users.pop();
r = run('migrateRoles', [req('ad1@x.com', { apply: 1, passcode: '2026' })]);
check('apply with admin + 2026 works', r.success && r.data.applied, r.error);
const after = run('v3SeatUsage', []);
check('after migration: boat 2/2, super 3/3, admin 2/5, chef 2/3', after.boat_manager.used === 2 && after.super_admin.used === 3 && after.admin.used === 2 && after.chef.used === 2);
const ak = users.find(u => u.email === 'hodboat@x.com'), na = users.find(u => u.email === 'asstboat@x.com');
check('Akuila-type keeps HOD + boat rights after apply', ak.permissions === 'hod,boat_manager' && ctx.isHodPerm(ak) && ctx.isBoatManagerPerm(ak));
check('Nanise-type keeps boat + asst HOD rights after apply', na.permissions === 'boat_manager' && na.assistantHod === true && ctx.isBoatManagerPerm(na) && ctx.isAsstHod(na));

console.log('\nSUMMARY: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
