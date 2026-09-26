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
  MailApp: { sendEmail: (m) => { ctx._mail.push(m); } }, GmailApp: { sendEmail: () => {} },
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
ctx.getSetting = (k, fb) => fb === undefined ? '' : String(fb);
const R = (code) => vm.runInContext(code, ctx);
const run = (fn, args) => ctx[fn].apply(null, args);

// ---- 1. admin password
check('2026 is the admin password', run('isAdminPassword', ['2026']));
check('2025 is NOT accepted', !run('isAdminPassword', ['2025']));
check('empty / number-ish values rejected', !run('isAdminPassword', ['']) && !run('isAdminPassword', [null]) && !run('isAdminPassword', ['02026']));
const src = ['Code.gs', 'Speed.gs', 'V3.gs', 'Stations.gs', 'Snapshots.gs'].map(f => fs.readFileSync(path.join(root, 'apps-script', f), 'utf8')).join('\n');
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
const t2 = run('issueSessionToken', [users.find(u => u.email === 'staff1@x.com')]);
p = { sessionToken: t2, userEmail: 'staff2@x.com' };
run('bindRequestIdentity', ['placeDinnerOrder', p]);
check('staff cannot order for someone else', p.userEmail === 'staff1@x.com');
users.find(u => u.email === 'staff1@x.com').password = 'changed';
check('password change invalidates old tokens', run('verifySessionToken', [t2]) === null);
check('forged token rejected', run('verifySessionToken', [Buffer.from('it@paradisecoveresortfiji.com|' + Date.now() + '|abc').toString('base64')]) === null);

// ---- 3. seats (3.0 promotion model: only admin 5 / superadmin 3)
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
const seats = run('v3SeatUsage', []);
check('seats: only superadmin + admin are limited', Object.keys(seats).sort().join() === 'admin,super_admin');
check('seats: superadmin 3 of 3', seats.super_admin.used === 3 && seats.super_admin.limit === 3);
check('seats: admin 2 of 5', seats.admin.used === 2 && seats.admin.limit === 5);
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
for (const role of ['chef', 'boat_manager', 'boat_captain', 'kitchen']) {
  r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'staff2@x.com', role })]);
  check('role "' + role + '" is no longer assignable', !r.success && /station logins/.test(r.error), r.error);
}
r = run('addUser', [req('ad1@x.com', { email: 'new@x.com', password: 'pw123456', role: 'chef' })]);
check('addUser refuses chef role', !r.success && /station/.test(r.error), r && r.error);
r = run('updateUser', [req('ad1@x.com', { targetEmail: 'staff2@x.com', permissions: 'staff,boat_manager' })]);
check('updateUser refuses boat_manager permission', !r.success && /station/.test(r.error), r && r.error);
r = run('setUserAccess', [req('ad1@x.com', { targetEmail: 'chef1@x.com', department: 'Kitchen', deptStatus: 'approved', assistantHod: 'true' })]);
check('editing an old chef account turns it into staff (+ asst flag)', r.success && users.find(u => u.email === 'chef1@x.com').permissions === 'staff', r.error);

// ---- 5. stations
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
const personalChef = users.find(u => u.email === 'chef1@x.com');
check('before migration: old chef permission still works (station not set up)', ctx.isChefPerm(personalChef) === true);
check('before migration: admin keeps chef tools', ctx.isChefPerm(users.find(u => u.email === 'ad1@x.com')) === true);
r = run('setStationPassword', [req('ad1@x.com', { station: 'chef', password: 'kitchen-2026-x', passcode: '2026' })]);
check('admin (not super) cannot set station passwords', !r.success && /Superadmin only/.test(r.error));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x', passcode: '2025' })]);
check('station password needs the admin password 2026', !r.success && /password/i.test(r.error));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'short', passcode: '2026' })]);
check('weak station password refused', !r.success && /8 characters/.test(r.error));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x', passcode: '2026' })]);
check('superadmin + 2026 sets the Chef station password', r.success && r.data.station.configured && r.data.station.username === 'chef', r.error);
const cfgRaw = props.PCR_STATION_chef || '';
check('station password stored hashed (no plain text)', cfgRaw && cfgRaw.indexOf('kitchen-2026-x') < 0 && /"hash"/.test(cfgRaw) && /"salt"/.test(cfgRaw));
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'boat', generate: 1, passcode: '2026' })]);
const boatPw = r.data && r.data.password;
check('one-tap rotate generates a password shown once', r.success && /^[a-z]+-[a-z]+-\d{4}$/.test(boatPw || ''), boatPw);
check('after setup: old chef permission no longer gives chef tools', ctx.isChefPerm(personalChef) === false && ctx.isChefPerm(users.find(u => u.email === 'ad1@x.com')) === false);
check('superadmin still has chef + boat tools', ctx.isChefPerm(users[0]) && ctx.isBoatManagerPerm(users[0]));
r = run('login', [{ email: 'chef', password: 'wrong-password' }]);
check('station login: wrong password refused', !r.success);
r = run('login', [{ email: 'chef', password: 'kitchen-2026-x' }]);
const chefTok = r.data && r.data.token;
check('station login: Chef credentials → station token', r.success && r.data.station === 'chef' && /^st1\./.test(chefTok || ''), JSON.stringify(r).slice(0, 120));
r = run('login', [{ email: 'boat', password: boatPw }]);
const boatTok = r.data && r.data.token;
check('station login: Boat credentials → station token', r.success && r.data.station === 'boat');
const bindAs = (tok, action, extra) => { const q = Object.assign({ sessionToken: tok }, extra || {}); const b = run('bindRequestIdentity', [action, q]); return { b, q }; };
for (const a of ['placeDinnerOrder', 'submitLeave', 'requestLeave', 'getUsers', 'setUserAccess', 'getV3Home', 'getBootstrap', 'updateProfile', 'deleteUser', 'getMyHistory', 'bookBoat', 'saveBoatRun', 'getAdminExport', 'migrateRoles', 'setStationPassword']) {
  const { b } = bindAs(chefTok, a);
  check('Chef station token refused for ' + a, b && b.error && b.stationDenied, b && b.error);
}
for (const a of ['markOrderStatus', 'placeDinnerOrder', 'getKitchenDashboard', 'submitLeave', 'getUsers']) {
  const { b } = bindAs(boatTok, a);
  check('Boat station token refused for ' + a, b && b.error && b.stationDenied);
}
let x = bindAs(chefTok, 'getKitchenDashboard');
check('Chef station token allowed for getKitchenDashboard', !x.b.error && x.q.requesterEmail === 'station.chef@pcr.local' && ctx.isChefPerm(run('getRequester', [x.q])));
x = bindAs(chefTok, 'markOrderStatus', { id: 'o1', status: 'served' });
check('station mutation without a name → "Who\'s doing this?"', x.b.error && x.b.needsActor);
x = bindAs(chefTok, 'markOrderStatus', { id: 'o1', status: 'served', actorName: 'Vicky Maheshwar' });
check('station mutation with a name is allowed and attributed', !x.b.error && run('getRequester', [x.q]).firstName === 'Vicky Maheshwar' && x.q._actor === 'Vicky Maheshwar');
x = bindAs(chefTok, 'getKitchenDashboard', { _stationUser: { station: 'chef' }, _station: 'boat' });
check('client cannot inject _station fields', x.q._station === 'chef');
const fake = { sessionToken: 'x', _stationUser: 'x', requesterEmail: 'it@paradisecoveresortfiji.com' };
run('bindRequestIdentity', ['getUsers', fake]);
check('client-sent _stationUser is stripped', fake._stationUser === undefined);
x = bindAs(boatTok, 'saveBoatRun', { route: 'PC → Soso', actorName: 'Eroni Naua' });
check('Boat station can edit runs with a name', !x.b.error && ctx.isBoatManagerPerm(run('getRequester', [x.q])));
ctx._writes = [];
ctx.stationLogWrite(x.q, 'saveBoatRun', { success: true, data: { id: 'run1' } });
check('station write is logged with the actor', ctx._writes.some(w => w.n === 'Station Log' && w.row.actor === 'Eroni Naua' && w.row.station === 'boat'));
const staffTok = run('issueSessionToken', [users.find(u => u.email === 'staff1@x.com')]);
x = bindAs(staffTok, 'markOrderStatus');
check('personal staff account refused for chef tools', x.b && x.b.stationOnly);
x = bindAs(run('issueSessionToken', [users.find(u => u.email === 'ad1@x.com')]), 'saveBoatRun');
check('personal admin (management) refused for boat tools', x.b && x.b.stationOnly);
x = bindAs(run('issueSessionToken', [users[0]]), 'markOrderStatus', { actorName: 'ignored' });
check('superadmin can use chef tools, attributed to themselves (no picker)', !(x.b && x.b.error) && x.q.requesterEmail === 'it@paradisecoveresortfiji.com' && x.q.actorName === undefined);
x = bindAs(run('issueSessionToken', [users[0]]), 'saveBoatRun');
check('superadmin can use boat tools', !(x.b && x.b.error));
r = run('getStationPeople', [bindAs(chefTok, 'getStationPeople').q]);
check('name picker lists active Kitchen staff only', r.success && r.data.people.map(p => p.name).includes('Sami X') && !r.data.people.some(p => /Pranav|Ana/.test(p.name)), JSON.stringify(r.data && r.data.people));
r = run('getStationPeople', [bindAs(boatTok, 'getStationPeople').q]);
check('boat picker lists Boatman staff', r.success && r.data.people.some(p => /Eroni/.test(p.name)));
// rotation revokes sessions
r = run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', generate: 1, passcode: '2026' })]);
x = bindAs(chefTok, 'getKitchenDashboard');
check('rotating the Chef password signs out old Chef sessions', x.b && x.b.error && !x.b.stationDenied);
x = bindAs(boatTok, 'getBoatRuns');
check('…but Boat sessions keep working', !(x.b && x.b.error));
r = run('signOutStation', [req('it@paradisecoveresortfiji.com', { station: 'boat', passcode: '2026' })]);
x = bindAs(boatTok, 'getBoatRuns');
check('"Sign out all devices" revokes Boat sessions', r.success && x.b && x.b.error);
r = run('login', [{ email: 'boat', password: boatPw }]);
check('same Boat password works again after sign-out-all', r.success);
check('forged station token rejected', run('stationVerifyToken', ['st1.' + Buffer.from('chef|1|1|abc').toString('base64')]) === null);

// ---- migration (3.0 promotion model + stations)
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
ctx._writes = [];
let m = run('migrateRoles', [req('ad1@x.com', { dryRun: 'true' })]).data;
const tgt = (e) => run('v3MigrateTarget', [users.find(u => u.email === e)]);
check('Apenisa (admin+HOD+chef) → admin + HOD, chef dropped', tgt('ad2@x.com').role === 'admin' && tgt('ad2@x.com').perms === 'admin,hod' && tgt('ad2@x.com').toStation === 'chef');
check('Vicky (chef) → staff', tgt('chef1@x.com').role === 'staff' && tgt('chef1@x.com').perms === 'staff');
check('Akuila (HOD + captain) → HOD, no boat', tgt('hodboat@x.com').perms === 'hod');
check('Nanise (asst HOD + captain) → staff + assistant HOD flag', tgt('asstboat@x.com').perms === 'staff' && tgt('asstboat@x.com').assistantHod === true);
check('Rajesh (HOD + asst) → HOD', tgt('hodasst@x.com').perms === 'hod');
check('Leanne (super + HOD + boat) → superadmin', tgt('sa2@x.com').perms === 'super_admin,admin');
check('"Test Test" account proposed for deactivation', tgt('paradisecove679@gmail.com').deactivate === true && m.deactivate.some(d => d.email === 'paradisecove679@gmail.com'));
check('Pranav (inactive chef) → inactive staff', tgt('chef3@x.com').perms === 'staff' && m.changes.some(c => c.email === 'chef3@x.com' && c.active === false));
check('preview lists every change (Apenisa, Vicky, Akuila, Nanise, Test, Pranav)', ['ad2@x.com', 'chef1@x.com', 'hodboat@x.com', 'asstboat@x.com', 'paradisecove679@gmail.com', 'chef3@x.com'].every(e => m.changes.some(c => c.email === e)));
check('preview seat counts: admin 2 of 5, superadmin 3 of 3', m.seats.admin.used === 2 && m.seats.admin.limit === 5 && m.seats.super_admin.used === 3 && m.seats.super_admin.limit === 3 && !m.seats.chef && !m.seats.boat_manager);
check('nobody loses rights (chef / boat move to stations)', m.lostRights.length === 0, JSON.stringify(m.lostRights));
check('HOD / asst HOD in "Other" flagged (Praneel, Rajesh, Nanise)', ['hodother@x.com', 'hodasst@x.com', 'asstboat@x.com'].every(e => m.warnings.some(w => w.email === e && /department "Other"/.test(w.text))), JSON.stringify(m.warnings.map(w => w.email + ':' + w.text.slice(0, 30))));
check('preview says both stations will be created', m.stationsNeeded.sort().join() === 'boat,chef');
check('dry run writes nothing', ctx._writes.length === 0 && !props.PCR_STATION_chef);
r = run('migrateRoles', [req('ad1@x.com', { apply: 1, passcode: '2026', chefPassword: 'kitchen-2026-x', boatPassword: 'boats-2026-x' })]);
check('apply by admin (not super) refused', !r.success && /superadmin/i.test(r.error));
r = run('migrateRoles', [req('it@paradisecoveresortfiji.com', { apply: 1 })]);
check('apply without password refused', !r.success && /password/i.test(r.error));
r = run('migrateRoles', [req('staff1@x.com', { apply: 1, passcode: '2026' })]);
check('apply by staff refused (password alone is not enough)', !r.success);
r = run('migrateRoles', [req('it@paradisecoveresortfiji.com', { apply: 1, passcode: '2026' })]);
check('apply refused until the superadmin types both station passwords', !r.success && /station password/.test(r.error) && ctx._writes.length === 0, r.error);
users.push(U('ad6@x.com', 'Extra', 'Management', 'super_admin'));
r = run('migrateRoles', [req('it@paradisecoveresortfiji.com', { apply: 1, passcode: '2026', chefPassword: 'kitchen-2026-x', boatPassword: 'boats-2026-x' })]);
check('apply refused while a seat limit would be exceeded', !r.success && /Superadmin: 4 of 3/.test(r.error), r.error);
users.pop();
r = run('migrateRoles', [req('it@paradisecoveresortfiji.com', { apply: 1, passcode: '2026', chefPassword: 'kitchen-2026-x', boatPassword: 'boats-2026-x' })]);
check('apply with superadmin + 2026 + station passwords works', r.success && r.data.applied, r.error);
check('apply created both station logins', r.success && r.data.stations.chef.configured && r.data.stations.boat.configured);
check('station login works right after migration', run('login', [{ email: 'chef', password: 'kitchen-2026-x' }]).success && run('login', [{ email: 'boat', password: 'boats-2026-x' }]).success);
const after = run('v3SeatUsage', []);
check('after migration: superadmin 3/3, admin 2/5', after.super_admin.used === 3 && after.admin.used === 2);
const byE = e => users.find(u => u.email === e);
check('Test account deactivated, row kept', byE('paradisecove679@gmail.com') && byE('paradisecove679@gmail.com').active === false);
check('Apenisa keeps admin + HOD rights', ctx.isAdminPerm(byE('ad2@x.com')) && ctx.isHodPerm(byE('ad2@x.com')) && !ctx.isChefPerm(byE('ad2@x.com')));
check('Nanise keeps assistant HOD rights, no boat tools', ctx.isAsstHod(byE('asstboat@x.com')) && !ctx.isBoatManagerPerm(byE('asstboat@x.com')));
check('Vicky is staff, no chef tools', byE('chef1@x.com').permissions === 'staff' && !ctx.isChefPerm(byE('chef1@x.com')));
check('Pranav stays inactive', byE('chef3@x.com').active === false && byE('chef3@x.com').permissions === 'staff');
const m2 = run('migrateRoles', [req('ad1@x.com', { dryRun: 'true' })]).data;
check('second preview: nothing left to change', m2.changeCount === 0, JSON.stringify(m2.changes.map(c => c.email)));

// ---- saved order summaries (Dinner Snapshots)
resetUsers(); for (const k of Object.keys(props)) if (k.indexOf('PCR_STATION_') === 0) delete props[k];
const sheets = { 'Dinner Orders': [], 'Breakfast Orders': [], 'Lunch Orders': [], 'Dinner Snapshots': [] };
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
let t = run('dinnerSnapshotTick', []);
check('8:05pm trigger saves tomorrow\'s dinner snapshot', t.created === true && t.serviceDate === '2026-09-27' && sheets['Dinner Snapshots'].length === 1, JSON.stringify(t));
const snap1 = sheets['Dinner Snapshots'][0], pay1 = JSON.parse(snap1.payloadJson);
check('snapshot = printable dinner list data (tally, byItem, all orders)', pay1.prep.totalOrders === 2 && pay1.prep.tally['Chicken'] === 1 && pay1.orders.length === 3 && snap1.kind === 'auto' && snap1.meal === 'dinner');
check('snapshot keeps the allergies & special requests', pay1.prep.specialNotes.some(n => /peanuts/.test(n.note) && n.flag === 'allergy'));
t = run('dinnerSnapshotTick', []);
check('trigger is idempotent (second run creates nothing)', t.created === false && sheets['Dinner Snapshots'].length === 1);
check('fallback on open is idempotent too', (run('snapFallback', []) || {}).created === false && sheets['Dinner Snapshots'].length === 1);
fakeNow = new Date(Date.UTC(2026, 8, 26, 15, 0));
check('before 8pm the trigger does nothing', !!run('dinnerSnapshotTick', []).skipped && sheets['Dinner Snapshots'].length === 1);
fakeNow = new Date(Date.UTC(2026, 8, 27, 21, 30)); // next evening, the trigger did not run → first open saves it
sheets['Dinner Orders'].push(D('d4', '2026-09-28', 'staff1@x.com', 'Fish curry', 'approved'));
let lst = run('getOrderSnapshots', [req('it@paradisecoveresortfiji.com')]);
check('opening the list after a missed trigger saves the snapshot (fallback)', lst.success && lst.data.autoCreated && sheets['Dinner Snapshots'].some(x => x.serviceDate === '2026-09-28' && x.kind === 'auto'));
check('list is latest first', lst.data.snapshots[0].serviceDate === '2026-09-28' && lst.data.snapshots[1].serviceDate === '2026-09-27');
// a late order approved after the cutoff → addendum; the original auto snapshot is kept
sheets['Dinner Orders'].push(D('d5', '2026-09-27', 'staff2@x.com', 'Fish curry', 'late_approved', { late: true, createdAt: '2026-09-26 20:40' }));
sheets['Dinner Orders'].find(o => o.id === 'd2').status = 'cancelled';
let one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27', meal: 'dinner' })]);
check('date lookup returns the saved auto snapshot', one.success && one.data.source === 'snapshot' && one.data.kind === 'auto' && one.data.payload.prep.totalOrders === 2);
check('late order after the cutoff shows as an addendum', one.data.addendum.added.length === 1 && one.data.addendum.added[0].id === 'd5');
check('cancellation after the cutoff shows as an addendum change', one.data.addendum.changed.some(o => o.id === 'd2' && o.was === 'approved' && o.status === 'cancelled'));
let sv = run('saveOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27', meal: 'dinner' })]);
check('regenerating saves a new manual snapshot, original auto kept', sv.success && sheets['Dinner Snapshots'].filter(x => x.serviceDate === '2026-09-27').map(x => x.kind).sort().join() === 'auto,manual');
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27' })]);
check('date lookup still prefers the original auto snapshot', one.data.kind === 'auto');
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-20', meal: 'dinner' })]);
check('previous date without a snapshot is built from the order rows (not saved)', one.success && one.data.source === 'rows' && one.data.payload.prep.totalOrders === 1 && !sheets['Dinner Snapshots'].some(x => x.serviceDate === '2026-09-20'));
sheets['Breakfast Orders'].push({ id: 'b1', serviceDate: '2026-09-27', userEmail: 'staff1@x.com', userName: 'Ana', status: 'ordered', notes: 'No egg' });
one = run('getOrderSnapshot', [req('it@paradisecoveresortfiji.com', { serviceDate: '2026-09-27', meal: 'breakfast' })]);
check('breakfast summary builds from rows too', one.success && one.data.meal === 'breakfast' && one.data.payload.totalCounted === 1);
check('staff cannot read summaries', !run('getOrderSnapshots', [req('staff1@x.com')]).success);
check('admin can read summaries', run('getOrderSnapshots', [req('ad1@x.com')]).success);
check('archiveOldRows never touches Dinner Snapshots', !ctx.ARCHIVE_PLAN.some(x => /Snapshot/.test(x.name)));
run('setStationPassword', [req('it@paradisecoveresortfiji.com', { station: 'chef', password: 'kitchen-2026-x', passcode: '2026' })]);
const ct = run('login', [{ email: 'chef', password: 'kitchen-2026-x' }]).data.token;
let bq = { sessionToken: ct, serviceDate: '2026-09-27' }; let bb = run('bindRequestIdentity', ['saveOrderSnapshot', bq]);
check('Chef station saving a summary needs a name', bb && bb.needsActor);
bq = { sessionToken: ct, serviceDate: '2026-09-27', actorName: 'Vikash Chand' }; bb = run('bindRequestIdentity', ['saveOrderSnapshot', bq]);
sv = run('saveOrderSnapshot', [bq]);
check('Chef station summary is saved with the picked name', bb && bb.station === 'chef' && sv.success && /Vikash Chand \(Chef station\)/.test(sv.data.generatedBy), sv.data && sv.data.generatedBy);

console.log('\nSUMMARY: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
