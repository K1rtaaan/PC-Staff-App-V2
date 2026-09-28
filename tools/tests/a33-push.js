// PCR Staff App 3.2.0 backend unit tests: Web Push (Push33.gs) — VAPID ES256, subscriptions, queue/inbox, events, cutoff reminders.
// sheet store (harness copied from a31-backend.js). Run: node tools/tests/a33-push.js
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
let triggers = [], pushSends = [], pushCode = 201;
let props = {}, cache = {}, mail = [], fetches = [], fetchCode = 201, snaps = [], copies = [];
let FAKE_NOW = '2026-09-28T21:00:00Z'; // Fiji wall clock
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Date, JSON, Math,
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8'), getBytes: () => Array.from(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes.map(b => b & 255))) }),
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, bytes) => Array.from(crypto.createHash('sha256').update(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes.map(b => b & 255))).digest())
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, getKeys: () => Object.keys(props), deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] === undefined ? null : cache[k]), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { sendEmail: (m) => { mail.push(Object.assign({ via: 'mailapp' }, m)); } },
  GmailApp: { sendEmail: (to, subject, body, o) => { mail.push({ to, subject, body, via: 'gmail' }); } },
  UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); if (fetchCode === 'throw') throw new Error('no permission'); return { getResponseCode: () => fetchCode, getContentText: () => '{"message":"x"}' }; } },
  SpreadsheetApp: { flush() {} },
  ScriptApp: { getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })), newTrigger: (h) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { triggers.push(h); } }) }) }) },
  BigInt
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
  ctx.a33AfterAction(action, p, res); ctx.a33Flush(); // same as handleRequest (3.2.0)
  R('R3_AUTH = null');
  return res;
}

const clone2 = (o) => JSON.parse(JSON.stringify(o));
{ const ap = ctx.appendRow; ctx.appendRow = (n, row, h) => { if (n === 'Notifications') ctx.a33FromNotif(row); return ap(n, row, h); }; }
ctx.r3NotifyMany = (rows) => rows.forEach(r => { ctx.a33FromNotif(r); store.Notifications.push(r); });
ctx.UrlFetchApp.fetchAll = (reqs) => reqs.map(r => { pushSends.push(r); const code = typeof pushCode === 'function' ? pushCode(r) : pushCode; return { getResponseCode: () => code, getContentText: () => '' }; });
store['Push Subscriptions'] = []; store['Push Queue'] = [];
const tSuper = login('it@paradisecoveresortfiji.com', '21slands'), tChef = login('chef1@x.com', 'pw-Vicky'), tStaff = login('staff1@x.com', 'pw-Ana'), tStaff2 = login('staff2@x.com', 'pw-Sami'), tHod = login('hod1@x.com', 'pw-Praneel'), tCap = login('cap1@x.com', 'pw-Jone');
check('logins', tSuper && tChef && tStaff && tStaff2 && tHod && tCap);
// keys + ES256
let r = req('getPushConfig', {});
check('public key made on first use (65-byte P-256 point)', r.success && Buffer.from(r.data.publicKey, 'base64url').length === 65 && Buffer.from(r.data.publicKey, 'base64url')[0] === 4);
check('private key only in Script Properties', !!props.VAPID_D && !JSON.stringify(r).includes(props.VAPID_D));
const pub = Buffer.from(r.data.publicKey, 'base64url');
const jwk = { kty: 'EC', crv: 'P-256', x: pub.slice(1, 33).toString('base64url'), y: pub.slice(33).toString('base64url') };
const pkey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
const priv = crypto.createPrivateKey({ key: Object.assign({ d: props.VAPID_D }, jwk), format: 'jwk' });
check('private/public keys are a matching P-256 pair', crypto.createPublicKey(priv).export({ format: 'jwk' }).x === jwk.x);
const jwt = ctx.a33Jwt('https://fcm.googleapis.com');
const [h, b, sg] = jwt.split('.');
check('VAPID JWT: ES256 header + aud/exp/sub claims', JSON.parse(Buffer.from(h, 'base64url')).alg === 'ES256' && JSON.parse(Buffer.from(b, 'base64url')).aud === 'https://fcm.googleapis.com' && /^mailto:/.test(JSON.parse(Buffer.from(b, 'base64url')).sub));
check('JWT signature verifies with node crypto (ES256)', crypto.verify('sha256', Buffer.from(h + '.' + b), { key: pkey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url')));
let okAll = true; for (let i = 0; i < 5; i++) { const m = Buffer.from('msg' + i); const sig = Buffer.from(ctx.a33Sign(Array.from(m), ctx.a33BytesToBig(Array.from(Buffer.from(props.VAPID_D, 'base64url')))).map(x => x & 255)); if (!crypto.verify('sha256', m, { key: pkey, dsaEncoding: 'ieee-p1363' }, sig)) okAll = false; }
check('5 more signatures verify', okAll);
// subscribe
const EP = (n) => 'https://fcm.googleapis.com/fcm/send/test-' + n;
r = req('pushSubscribe', { sessionToken: tStaff, endpoint: 'https://evil.example.com/x' });
check('unknown push host refused', r.success === false);
r = req('pushSubscribe', { sessionToken: tStaff, endpoint: EP('staff'), userAgent: 'test' });
check('staff subscribes', r.success && r.data.subId && r.data.key, JSON.stringify(r));
const staffSub = r.data;
check('10-minute trigger installed on first subscription', triggers.includes('pushTick'));
r = req('pushSubscribe', { sessionToken: tChef, endpoint: EP('chef') });
const chefSub = r.data;
req('pushSubscribe', { sessionToken: tHod, endpoint: EP('hod') });
req('pushSubscribe', { sessionToken: tCap, endpoint: EP('cap') });
req('pushSubscribe', { sessionToken: tSuper, endpoint: EP('super') });
req('pushSubscribe', { sessionToken: tStaff2, endpoint: EP('staff2') });
check('one row per device', store['Push Subscriptions'].length === 6);
r = req('pushSubscribe', { sessionToken: tStaff, endpoint: EP('staff') });
check('same device again = same row, new key', store['Push Subscriptions'].length === 6 && r.data.subId === staffSub.subId && r.data.key !== staffSub.key);
staffSub.key = r.data.key;
// test push
pushSends = [];
r = req('pushTest', { sessionToken: tStaff });
check('test push sent to my device', r.success && pushSends.length === 1 && pushSends[0].url === EP('staff'), JSON.stringify(r));
check('VAPID Authorization header + TTL + empty body', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/.test(pushSends[0].headers.Authorization) && pushSends[0].headers.TTL && pushSends[0].payload === '');
r = req('getPushInbox', { subId: staffSub.subId, key: staffSub.key });
check('service worker fetches the text', r.success && r.data.messages.length === 1 && r.data.messages[0].title === 'Test notification');
r = req('getPushInbox', { subId: staffSub.subId, key: staffSub.key });
check('no repeat on the next fetch', r.success && r.data.messages.length === 0);
r = req('getPushInbox', { subId: staffSub.subId, key: 'wrong' });
check('wrong device key refused', r.success === false);
// events → push
pushSends = [];
at('2026-09-28T09:00:00Z');
r = req('adminNotifyUser', { sessionToken: tSuper, targetEmail: 'staff1@x.com', title: 'Hello', body: 'Direct message' });
check('direct admin message → staff phone', r.success && pushSends.some(x => x.url === EP('staff')), JSON.stringify(r).slice(0, 150));
r = req('getPushInbox', { subId: staffSub.subId, key: staffSub.key });
check('message text fetched', r.success && r.data.messages.some(m => /Hello/.test(m.title + m.body)));
pushSends = [];
r = req('submitLeave', { sessionToken: tStaff, startDate: '2026-10-10', endDate: '2026-10-11', leaveType: 'annual', reason: 'family' });
check('new leave request → HOD phone', r.success && pushSends.some(x => x.url === EP('hod')), JSON.stringify(r).slice(0, 200));
// boat
store['Boat Runs'] = [{ id: 'run1', date: '2026-09-30', time: '08:00', route: 'Resort → Lautoka', capacity: 20, active: true }]; store['Boat Bookings'] = [];
pushSends = [];
r = req('bookBoat', { sessionToken: tStaff2, runId: 'run1' });
check('new boat booking → boat admin phone, not the booker', r.success && pushSends.some(x => x.url === EP('cap')) && !pushSends.some(x => x.url === EP('staff2')), JSON.stringify(r).slice(0, 150));
const bid = r.data && r.data.booking.id;
pushSends = [];
r = req('cancelBoatBooking', { sessionToken: tSuper, id: bid });
check('booking cancelled by boat admin → staff phone', r.success && pushSends.some(x => x.url === EP('staff2')), JSON.stringify(r).slice(0, 150));
req('bookBoat', { sessionToken: tStaff2, runId: 'run1' });
pushSends = [];
r = req('saveBoatRun', { sessionToken: tSuper, id: 'run1', time: '09:30' });
check('run time changed → booked staff phone', r.success && pushSends.some(x => x.url === EP('staff2')), JSON.stringify(r).slice(0, 150));
pushSends = [];
r = req('requestEmergencyTravel', { sessionToken: tStaff, reason: 'hospital', seats: 1 });
check('emergency travel request → boat admin phone', r.success && pushSends.some(x => x.url === EP('cap')));
pushSends = [];
r = req('reviewEmergencyTravel', { sessionToken: tCap, id: r.data.request.id, status: 'confirmed' });
check('emergency travel decided → staff phone', r.success && pushSends.some(x => x.url === EP('staff')));
// reports
pushSends = [];
r = req('submitReport', { sessionToken: tStaff, type: 'problem', description: 'Something broke here' });
check('new report → report owner phone only (3.2.0)', r.success && pushSends.length >= 1 && pushSends.every(x => x.url === EP('super')), JSON.stringify(pushSends.map(x => x.url)));
pushSends = [];
r = req('updateReport', { sessionToken: tSuper, id: r.data.id, status: 'done', reply: 'Fixed' });
check('report status update → reporter phone', r.success && pushSends.some(x => x.url === EP('staff')));
// per-user off
r = req('setPushPref', { sessionToken: tStaff, on: false });
pushSends = [];
req('adminNotifyUser', { sessionToken: tSuper, targetEmail: 'staff1@x.com', title: 'Hi', body: 'x' });
check('push off → nothing sent to that person', r.success && !pushSends.some(x => x.url === EP('staff')));
r = req('pushTest', { sessionToken: tStaff });
check('test refused while off', r.success === false);
req('setPushPref', { sessionToken: tStaff, on: true });
// dead subscription cleanup
pushCode = (rq) => rq.url === EP('staff2') ? 410 : 201;
pushSends = [];
req('adminNotifyUser', { sessionToken: tSuper, targetEmail: 'staff2@x.com', title: 'Hi', body: 'x' });
check('410 Gone → subscription removed', store['Push Subscriptions'].find(s => s.endpoint === EP('staff2')).active === false);
pushCode = 201;
// cutoff reminders: dinner cutoff 23:55 the day before → reminder window 22:55–23:15
store['Dinner Orders'] = [{ id: 'o1', serviceDate: '2026-09-30', userEmail: 'chef1@x.com', status: 'pending' }];
req('pushSubscribe', { sessionToken: tStaff2, endpoint: EP('staff2b') });
at('2026-09-29T22:00:00Z'); // 22:00 Fiji wall clock → too early
pushSends = [];
let t = ctx.pushTick();
check('no reminder 2 hours before', !(t.reminders || []).some(x => x.meal === 'dinner'), JSON.stringify(t));
at('2026-09-29T23:00:00Z'); // 23:00 wall clock (55 min before 23:55)
pushSends = [];
t = ctx.pushTick();
const din = (t.reminders || []).find(x => x.meal === 'dinner' && x.serviceDate === '2026-09-30');
check('dinner reminder 1 hour before the cutoff', !!din, JSON.stringify(t));
check('sent to staff who have not ordered (not to chef who ordered, not superadmin)', pushSends.some(x => x.url === EP('staff')) && pushSends.some(x => x.url === EP('staff2b')) && !pushSends.some(x => x.url === EP('chef')) && !pushSends.some(x => x.url === EP('super')), JSON.stringify(pushSends.map(x => x.url)));
r = req('getPushInbox', { subId: staffSub.subId, key: staffSub.key });
const rem = r.data.messages.find(m => /orders close/.test(m.title));
check('reminder text = default wording with meal + time', rem && rem.body === "\u23F0 Dinner orders close in 1 hour (11:55pm). If you don't order, you won't be counted and will have to wait until the end of service for any leftovers. Order now to get your share!", rem && rem.body);
at('2026-09-29T23:10:00Z');
pushSends = [];
t = ctx.pushTick();
check('no double send on the next tick', !(t.reminders || []).some(x => x.meal === 'dinner') && pushSends.length === 0, JSON.stringify(t));
settings.push_cutoff_text = '{Meal} closes at {time} — order now';
check('reminder text is an App Setting', ctx.a33ReminderText('lunch', '13:00') === 'Lunch closes at 1:00pm — order now');
r = req('pushStatus', { sessionToken: tSuper });
check('superadmin push status (no key material)', r.success && r.data.keys === true && r.data.trigger === true && !JSON.stringify(r).includes(props.VAPID_D));
r = req('pushStatus', { sessionToken: tStaff });
check('push status superadmin only', r.success === false);
r = req('pushUnsubscribe', { endpoint: EP('staff') });
check('unsubscribe marks the device inactive', r.success && store['Push Subscriptions'].find(s => s.endpoint === EP('staff')).active === false);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
