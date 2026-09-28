/* PCR Staff App 3.2.0 — phone notifications with standard Web Push (VAPID, RFC 8030/8292). No Firebase.
 * - The VAPID key pair is made ON THE SERVER the first time it is needed and kept only in Script Properties
 *   (VAPID_D = private scalar, VAPID_PUB = public key). The private key never leaves this project.
 * - Pushes carry NO payload (Apps Script has no AES-GCM/ECDH for payload encryption): the phone's service worker
 *   wakes up, fetches the text with getPushInbox (per-device secret key) and shows it.
 * - ES256 (ECDSA P-256 + SHA-256) signing for the VAPID JWT is done here with BigInt.
 * Sheets: "Push Subscriptions" (one row per phone/browser), "Push Queue" (texts waiting to be fetched). */

var A33_SUBS = 'Push Subscriptions';
var A33_SUB_HEADERS = ['id', 'userEmail', 'endpoint', 'key', 'userAgent', 'active', 'createdAt', 'lastOkAt', 'lastFetchAt', 'fails', 'lastError'];
var A33_QUEUE = 'Push Queue';
var A33_QUEUE_HEADERS = ['id', 'ts', 'userEmail', 'title', 'body', 'url', 'tag', 'kind', 'createdAt'];
var A33_DEFAULT_REMINDER = "\u23F0 {Meal} orders close in 1 hour ({time}). If you don't order, you won't be counted and will have to wait until the end of service for any leftovers. Order now to get your share!";
var A33_PUSH_HOSTS = /^https:\/\/([a-z0-9.-]+\.)?(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;
var A33_PENDING = [];
var A33_SENT_LOG = null; // tests: last flush results

/* ---------- P-256 arithmetic (BigInt) ---------- */
var A33_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
var A33_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
var A33_G = [BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'), BigInt(1)];
var A33_0 = BigInt(0), A33_1 = BigInt(1), A33_2 = BigInt(2), A33_3 = BigInt(3), A33_4 = BigInt(4), A33_8 = BigInt(8);
function a33Mod(a, m) { var r = a % m; return r < A33_0 ? r + m : r; }
function a33Inv(a, m) {
  var lm = A33_1, hm = A33_0, low = a33Mod(a, m), high = m;
  while (low > A33_1) { var r = high / low, nm = hm - lm * r, nw = high - low * r; hm = lm; high = low; lm = nm; low = nw; }
  return a33Mod(lm, m);
}
function a33Dbl(Pt) {
  if (!Pt || Pt[1] === A33_0) return null;
  var P = A33_P, X = Pt[0], Y = Pt[1], Z = Pt[2];
  var delta = Z * Z % P, gamma = Y * Y % P, beta = X * gamma % P;
  var alpha = A33_3 * a33Mod(X - delta, P) % P * ((X + delta) % P) % P;
  var X3 = a33Mod(alpha * alpha - A33_8 * beta, P);
  var Z3 = a33Mod((Y + Z) * (Y + Z) - gamma - delta, P);
  var Y3 = a33Mod(alpha * a33Mod(A33_4 * beta - X3, P) - A33_8 * (gamma * gamma % P), P);
  return [X3, Y3, Z3];
}
function a33Add(A, B) {
  if (!A) return B; if (!B) return A;
  var P = A33_P;
  var Z1Z1 = A[2] * A[2] % P, Z2Z2 = B[2] * B[2] % P;
  var U1 = A[0] * Z2Z2 % P, U2 = B[0] * Z1Z1 % P;
  var S1 = A[1] * B[2] % P * Z2Z2 % P, S2 = B[1] * A[2] % P * Z1Z1 % P;
  if (U1 === U2) return S1 === S2 ? a33Dbl(A) : null;
  var H = a33Mod(U2 - U1, P), R = a33Mod(S2 - S1, P), H2 = H * H % P, H3 = H * H2 % P, U1H2 = U1 * H2 % P;
  var X3 = a33Mod(R * R - H3 - A33_2 * U1H2, P);
  var Y3 = a33Mod(R * a33Mod(U1H2 - X3, P) - S1 * H3, P);
  return [X3, Y3, H * A[2] % P * B[2] % P];
}
function a33Mul(k, Pt) {
  var R = null, bits = k.toString(2);
  for (var i = 0; i < bits.length; i++) { R = a33Dbl(R); if (bits.charAt(i) === '1') R = a33Add(R, Pt); }
  return R;
}
function a33Affine(Pt) { var zi = a33Inv(Pt[2], A33_P), zi2 = zi * zi % A33_P; return [Pt[0] * zi2 % A33_P, Pt[1] * zi2 % A33_P * zi % A33_P]; }
function a33BytesToBig(b) { var h = ''; for (var i = 0; i < b.length; i++) h += ('0' + (b[i] & 255).toString(16)).slice(-2); return BigInt('0x' + (h || '0')); }
function a33BigToBytes(x, len) { var h = x.toString(16); while (h.length < len * 2) h = '0' + h; var out = []; for (var i = 0; i < len; i++) out.push(parseInt(h.substr(i * 2, 2), 16)); return out; }
function a33B64u(bytes) { return Utilities.base64EncodeWebSafe(bytes.map(function (b) { return b > 127 ? b - 256 : b; })).replace(/=+$/, ''); }
function a33B64uDecode(s) { s = String(s); while (s.length % 4) s += '='; return Utilities.base64DecodeWebSafe(s).map(function (b) { return b & 255; }); }
function a33Utf8(s) { return Utilities.newBlob(String(s)).getBytes().map(function (b) { return b & 255; }); }
function a33Sha(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.map(function (b) { return b > 127 ? b - 256 : b; })).map(function (b) { return b & 255; }); }
function a33Rand32(extra) {
  var seed = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), String(Date.now()), String(Math.random()), String(extra || '')].join('|');
  return a33Sha(a33Utf8(seed));
}
/** ES256 signature (raw r||s, 64 bytes) of msg bytes with private scalar d. */
function a33Sign(msg, d) {
  var z = a33BytesToBig(a33Sha(msg));
  for (var tries = 0; tries < 8; tries++) {
    var k = a33Mod(a33BytesToBig(a33Rand32(d.toString(16) + tries)), A33_N);
    if (k === A33_0) continue;
    var R = a33Affine(a33Mul(k, A33_G)), r = a33Mod(R[0], A33_N);
    if (r === A33_0) continue;
    var s = a33Mod(a33Inv(k, A33_N) * (z + r * d), A33_N);
    if (s === A33_0) continue;
    return a33BigToBytes(r, 32).concat(a33BigToBytes(s, 32));
  }
  throw new Error('signing failed');
}

/* ---------- VAPID keys (Script Properties only) ---------- */
function a33Keys() {
  var props = PropertiesService.getScriptProperties();
  var d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (d && pub) return { d: a33BytesToBig(a33B64uDecode(d)), pub: pub };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    d = props.getProperty('VAPID_D'); pub = props.getProperty('VAPID_PUB');
    if (d && pub) return { d: a33BytesToBig(a33B64uDecode(d)), pub: pub };
    var dn = A33_0;
    while (dn === A33_0) dn = a33Mod(a33BytesToBig(a33Rand32('key')), A33_N);
    var Q = a33Affine(a33Mul(dn, A33_G));
    pub = a33B64u([4].concat(a33BigToBytes(Q[0], 32), a33BigToBytes(Q[1], 32)));
    props.setProperty('VAPID_D', a33B64u(a33BigToBytes(dn, 32)));
    props.setProperty('VAPID_PUB', pub);
    return { d: dn, pub: pub };
  } finally { lock.releaseLock(); }
}
function a33Jwt(aud) {
  var cache = CacheService.getScriptCache(), ck = 'a33jwt_' + a33B64u(a33Sha(a33Utf8(aud))).slice(0, 20);
  var hit = cache.get(ck); if (hit) return hit;
  var keys = a33Keys();
  var sub = String(getSetting('push_contact', '') || 'it@paradisecoveresortfiji.com');
  var head = a33B64u(a33Utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var body = a33B64u(a33Utf8(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + sub.replace(/^mailto:/, '') })));
  var jwt = head + '.' + body + '.' + a33B64u(a33Sign(a33Utf8(head + '.' + body), keys.d));
  try { cache.put(ck, jwt, 10 * 3600); } catch (e) {}
  return jwt;
}

/* ---------- queue + send ---------- */
function a33Url(kind, email) {
  if (kind === 'report') { var u = findUserByEmail(email); return (typeof a32IsReportOwner === 'function' ? a32IsReportOwner(u) : (u && isSuperPerm(u))) ? './#reports' : './#myreports'; }
  if (kind === 'cutoff') return './#meals';
  if (kind === 'boat' || kind === 'boat_admin') return kind === 'boat' ? './#bookings' : './#boatadmin';
  return './#notifications';
}
/** Queue one phone notification for this request (sent at the end by a33Flush). */
function a33Queue(email, title, body, kind, tag, url) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1 || A33_PENDING.length > 400) return;
  var k = email + '|' + (tag || '') + '|' + title;
  for (var i = 0; i < A33_PENDING.length; i++) if (A33_PENDING[i].k === k || (tag && A33_PENDING[i].email === email && A33_PENDING[i].tag === tag && A33_PENDING[i].kind === kind)) return;
  A33_PENDING.push({ k: k, email: email, title: String(title || 'PCR Staff App').substring(0, 120), body: String(body || '').substring(0, 300), kind: kind || '', tag: tag || '', url: url || '' });
}
/** Every in-app notification is mirrored to the person's phones. */
function a33FromNotif(row) { if (row) a33Queue(row.userEmail, row.title, row.body, row.kind, row.relatedId || row.id); }
function a33PushUsers(users, title, body, kind, tag, exceptEmail) {
  var ex = String(exceptEmail || '').toLowerCase();
  (users || []).forEach(function (u) { if (String(u.email).toLowerCase() !== ex) a33Queue(u.email, title, body, kind, tag); });
}
function a33ActiveUsers() { return sheetToObjects('Users').filter(function (u) { return truthy(u.active); }); }
function a33HasRole(u, roles) { var p = userPermissions(u); for (var i = 0; i < roles.length; i++) if (p.indexOf(roles[i]) >= 0) return true; return false; }
function a33Chefs() { return a33ActiveUsers().filter(function (u) { return a33HasRole(u, ['chef', 'kitchen']); }); }
function a33BoatAdmins() { return a33ActiveUsers().filter(function (u) { return a33HasRole(u, ['boat_manager', 'boat_captain', 'boat']); }); }
function a33Subs() { try { ensureSheet(getSS(), A33_SUBS, A33_SUB_HEADERS); } catch (e) {} return sheetToObjects(A33_SUBS).filter(function (s) { return truthy(s.active); }); }

function a33Flush() {
  if (!A33_PENDING.length) return null;
  var list = A33_PENDING; A33_PENDING = [];
  try {
    var off = {};
    sheetToObjects('Users').forEach(function (u) { if (truthy(u.pushOff) || !truthy(u.active)) off[String(u.email).toLowerCase()] = 1; });
    list = list.filter(function (m) { return !off[m.email]; });
    if (!list.length) return null;
    var want = {}; list.forEach(function (m) { want[m.email] = 1; });
    var subs = a33Subs().filter(function (s) { return want[String(s.userEmail).toLowerCase()]; });
    if (!subs.length) return { sent: 0, queued: 0 };
    var has = {}; subs.forEach(function (s) { has[String(s.userEmail).toLowerCase()] = 1; });
    var now = Date.now(), rows = list.filter(function (m) { return has[m.email]; }).map(function (m, i) {
      return { id: uid('pq'), ts: now + i, userEmail: m.email, title: m.title, body: m.body, url: m.url || a33Url(m.kind, m.email), tag: m.tag, kind: m.kind, createdAt: nowIso() };
    });
    ensureSheet(getSS(), A33_QUEUE, A33_QUEUE_HEADERS);
    rows.forEach(function (r) { appendRow(A33_QUEUE, r, A33_QUEUE_HEADERS); });
    return a33Ping(subs);
  } catch (e) { return { error: String(e && e.message || e) }; }
}
/** Send an empty push to each subscription; drop dead ones (404/410). */
function a33Ping(subs) {
  var keys = a33Keys(), out = { sent: 0, ok: 0, gone: 0, failed: 0, codes: [] };
  var reqs = subs.map(function (s) {
    var aud = String(s.endpoint).match(/^https:\/\/[^\/]+/)[0];
    return { url: s.endpoint, method: 'post', muteHttpExceptions: true, followRedirects: false, payload: '',
      headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + a33Jwt(aud) + ', k=' + keys.pub } };
  });
  var res = [];
  try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { res = reqs.map(function () { return null; }); out.error = String(e && e.message || e); }
  res.forEach(function (r, i) {
    var s = subs[i], code = r ? r.getResponseCode() : 0;
    out.sent++; out.codes.push(code);
    if (code >= 200 && code < 300) { out.ok++; if (Number(s.fails || 0) > 0) updateRowById(A33_SUBS, s.id, { fails: 0, lastOkAt: nowIso(), lastError: '' }); return; }
    var fails = Number(s.fails || 0) + 1, dead = code === 404 || code === 410 || fails >= 5;
    if (dead) out.gone++; else out.failed++;
    var txt = ''; try { txt = r ? String(r.getContentText()).substring(0, 120) : 'no response'; } catch (e) {}
    updateRowById(A33_SUBS, s.id, { fails: fails, lastError: code + ' ' + txt, active: dead ? false : true });
  });
  A33_SENT_LOG = out;
  return out;
}

/* ---------- events that have no in-app notification of their own ---------- */
function a33AfterAction(action, p, res) {
  if (!res || res.success === false) return;
  try {
    var me = null; try { me = getRequester(p); } catch (e) {}
    var myEmail = me ? String(me.email).toLowerCase() : '';
    var d = res.data || {};
    var runLabel = function (runId) { var r = sheetToObjects('Boat Runs').filter(function (x) { return String(x.id) === String(runId); })[0]; return r ? [v3Date(r.date), r.time, r.route].filter(Boolean).join(' ') : ''; };
    if (action === 'bookBoat' && d.booking) {
      var b = d.booking, lbl = runLabel(b.runId);
      a33PushUsers(a33BoatAdmins(), 'New boat booking: ' + b.userName, lbl + ' · ' + b.seats + ' seat(s)', 'boat_admin', b.id, myEmail);
      if (b.userEmail !== myEmail) a33Queue(b.userEmail, 'Boat booking confirmed', lbl, 'boat', b.id);
    }
    if (action === 'cancelBoatBooking' && d.booking) {
      var c = d.booking, l2 = runLabel(c.runId);
      a33PushUsers(a33BoatAdmins(), 'Boat booking cancelled: ' + (c.userName || c.userEmail), l2, 'boat_admin', c.id + 'x', myEmail);
      if (String(c.userEmail).toLowerCase() !== myEmail) a33Queue(c.userEmail, 'Your boat booking was cancelled', l2, 'boat', c.id + 'x');
    }
    if ((action === 'saveBoatRun' && p.id && !(p.captainUpdate === true || p.captainUpdate === 'true') && (p.date !== undefined || p.time !== undefined || p.route !== undefined || p.active !== undefined)) || action === 'deleteBoatRun') {
      var cancelled = action === 'deleteBoatRun' || p.active === false || p.active === 'false';
      var l3 = runLabel(p.id);
      sheetToObjects('Boat Bookings').filter(function (x) { return String(x.runId) === String(p.id) && String(x.status || 'confirmed') === 'confirmed'; }).forEach(function (x) {
        a33Queue(x.userEmail, cancelled ? 'Boat run cancelled' : 'Boat run changed', (cancelled ? 'Cancelled: ' : 'Now: ') + l3, 'boat', p.id + (cancelled ? 'c' : 'm'));
      });
    }
    if (action === 'requestEmergencyTravel' && d.request) a33PushUsers(a33BoatAdmins(), 'Emergency travel request: ' + d.request.userName, String(d.request.reason).substring(0, 140), 'boat_admin', d.request.id, myEmail);
    if (action === 'reviewEmergencyTravel' && d.request) a33Queue(d.request.userEmail, 'Emergency travel ' + (d.request.status === 'confirmed' ? 'confirmed' : 'declined'), String(d.request.reviewNote || ''), 'boat', d.request.id);
    if (action === 'requestLateMeal' || action === 'placeSpecialMeal') {
      var o = d.order || d.request || {};
      var meal = String(p.meal || 'dinner');
      a33PushUsers(a33Chefs(), (action === 'placeSpecialMeal' ? 'Special ' : 'Late ') + meal + ' request' + (o.userName ? ': ' + o.userName : ''), String(p.reason || o.reason || '').substring(0, 140), action === 'placeSpecialMeal' ? 'special_meal' : 'late_meal', o.id || '', myEmail);
    }
  } catch (e) {}
}
/** Kitchen: the dinner summary was saved automatically at the cutoff / after the late window. */
function a33SummarySaved(serviceDate, which) {
  try { a33PushUsers(a33Chefs(), 'Dinner summary saved', 'Dinner ' + serviceDate + ': ' + (which === 'final' ? 'final list after late requests' : 'list saved at the cutoff') + ' — open Kitchen Admin for the PDF.', 'summary', 'dsum' + serviceDate + which); } catch (e) {}
}

/* ---------- 1 hour before each cutoff: remind staff who have not ordered ---------- */
function a33Time12(hhmm) { var m = String(hhmm).match(/^(\d{1,2}):(\d{2})/); if (!m) return hhmm; var h = Number(m[1]), ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + m[2] + ap; }
function a33ReminderText(meal, hhmm) {
  var t = String(getSetting('push_cutoff_text', '') || A33_DEFAULT_REMINDER);
  var M = meal.charAt(0).toUpperCase() + meal.slice(1);
  return t.replace(/\{Meal\}/g, M).replace(/\{meal\}/g, meal).replace(/\{time\}/g, a33Time12(hhmm));
}
var A33_MEAL_SHEETS = { breakfast: 'Breakfast Orders', lunch: 'Lunch Orders', dinner: 'Dinner Orders' };
function a33CutoffReminders() {
  var props = PropertiesService.getScriptProperties(), out = [];
  var now = getFijiNow(), nowMs = now.getTime(), t = mealTimes();
  var days = [0, 1, 2].map(function (i) { return fijiDateString(addFijiDays(now, i)); });
  ['breakfast', 'lunch', 'dinner'].forEach(function (meal) {
    days.forEach(function (sd) {
      var w = mealWindow(meal, sd, t), left = w.cutoffAt - nowMs;
      if (!(left <= 60 * 60000 && left > 40 * 60000)) return;
      var key = 'a33rem_' + meal + '_' + sd;
      if (props.getProperty(key)) return;
      props.setProperty(key, nowIso()); // mark first: never twice even if the send below fails half-way
      var ordered = {};
      sheetToObjects(A33_MEAL_SHEETS[meal]).forEach(function (o) {
        var st = String(o.status || '');
        if (v3Date(o.serviceDate) === sd && st !== 'cancelled' && st !== 'rejected') ordered[String(o.userEmail).toLowerCase()] = 1;
      });
      var withSub = {}; a33Subs().forEach(function (s) { withSub[String(s.userEmail).toLowerCase()] = 1; });
      var text = a33ReminderText(meal, w.cutoff), n = 0;
      a33ActiveUsers().forEach(function (u) {
        var em = String(u.email).toLowerCase();
        if (!withSub[em] || ordered[em] || truthy(u.pushOff) || isSuperPerm(u) || (typeof v3LegacyStation === 'function' && v3LegacyStation(u))) return;
        a33Queue(em, meal.charAt(0).toUpperCase() + meal.slice(1) + ' orders close in 1 hour', text, 'cutoff', 'cut_' + meal + '_' + sd, './#meals'); n++;
      });
      out.push({ meal: meal, serviceDate: sd, recipients: n });
    });
  });
  return out;
}
/** Time trigger (every 10 minutes): cutoff reminders, clean-up, send. */
function pushTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { busy: true };
  var out = {};
  try {
    out.reminders = a33CutoffReminders();
    out.sent = a33Flush();
    PropertiesService.getScriptProperties().setProperty('a33_tick_at', nowIso());
    a33Prune();
  } catch (e) { out.error = String(e && e.message || e); }
  finally { lock.releaseLock(); }
  return out;
}
function a33Prune() {
  var props = PropertiesService.getScriptProperties();
  var oldest = fijiDateString(addFijiDays(getFijiNow(), -3));
  props.getKeys().forEach(function (k) { var m = k.match(/^a33rem_\w+_(\d{4}-\d{2}-\d{2})$/); if (m && m[1] < oldest) props.deleteProperty(k); });
  try { // keep the queue small: texts older than 3 days are never fetched any more
    var sh = getSS().getSheetByName(A33_QUEUE); if (!sh || sh.getLastRow() < 800) return;
    var vals = sh.getDataRange().getValues(), h = vals[0], ti = h.indexOf('ts'), cut = Date.now() - 3 * 86400000;
    var keep = vals.slice(1).filter(function (r) { return Number(r[ti]) >= cut; });
    sh.getRange(2, 1, sh.getLastRow() - 1, h.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, h.length).setValues(keep);
    scInvalidateSheet(A33_QUEUE);
  } catch (e) {}
}
function a33EnsureTrigger() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('A33_TRIGGER')) return true;
  try {
    var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'pushTick'; });
    if (!have) ScriptApp.newTrigger('pushTick').timeBased().everyMinutes(10).create();
    props.setProperty('A33_TRIGGER', nowIso());
    return true;
  } catch (e) { return false; }
}

/* ---------- API ---------- */
function getPushConfig(p) {
  var u = null; try { u = getRequester(p); } catch (e) {}
  var out = { publicKey: a33Keys().pub, on: !!u && !truthy(u.pushOff), devices: 0 };
  if (u) out.devices = a33Subs().filter(function (s) { return String(s.userEmail).toLowerCase() === String(u.email).toLowerCase(); }).length;
  return { success: true, data: out };
}
function pushSubscribe(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var ep = String(p.endpoint || '').trim();
  if (!A33_PUSH_HOSTS.test(ep) || ep.length > 1200) return { success: false, error: 'Unsupported push service' };
  ensureSheet(getSS(), A33_SUBS, A33_SUB_HEADERS);
  var email = String(u.email).toLowerCase(), key = a33B64u(a33Rand32('sub')).slice(0, 32);
  var cur = sheetToObjects(A33_SUBS).filter(function (s) { return String(s.endpoint) === ep; })[0], id;
  if (cur) { id = cur.id; updateRowById(A33_SUBS, id, { userEmail: email, key: key, active: true, fails: 0, lastError: '', userAgent: String(p.userAgent || '').substring(0, 200), lastFetchAt: '' }); }
  else { id = uid('psub'); appendRow(A33_SUBS, { id: id, userEmail: email, endpoint: ep, key: key, userAgent: String(p.userAgent || '').substring(0, 200), active: true, createdAt: nowIso(), lastOkAt: '', lastFetchAt: '', fails: 0, lastError: '' }, A33_SUB_HEADERS); }
  if (truthy(u.pushOff)) A31IO.update('Users', 'email', email, { pushOff: '' }, ['pushOff']);
  a33EnsureTrigger();
  return { success: true, data: { subId: id, key: key } };
}
function pushUnsubscribe(p) {
  var ep = String(p.endpoint || '');
  var cur = ep ? sheetToObjects(A33_SUBS).filter(function (s) { return String(s.endpoint) === ep; })[0] : null;
  if (cur) updateRowById(A33_SUBS, cur.id, { active: false, lastError: 'unsubscribed ' + nowIso() });
  return { success: true, data: { removed: !!cur } };
}
function setPushPref(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var on = !(p.on === false || p.on === 'false' || p.on === 0 || p.on === '0');
  A31IO.update('Users', 'email', String(u.email).toLowerCase(), { pushOff: on ? '' : 'TRUE' }, ['pushOff']);
  return { success: true, data: { on: on } };
}
function pushTest(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  if (truthy(u.pushOff)) return { success: false, error: 'Phone notifications are off for your account — turn them on first.' };
  a33Queue(u.email, 'Test notification', 'Phone notifications work on this device. \uD83D\uDC4D', 'test', 'test' + Date.now(), './#pushsettings');
  var r = a33Flush();
  if (!r || !r.sent) return { success: false, error: 'No device is registered for your account yet — tap “Turn on for this phone”.' };
  return { success: true, data: { devices: r.sent, delivered: r.ok, removed: r.gone } };
}
/** Called by the phone's service worker after a push (no session there: the per-device key proves it). */
function getPushInbox(p) {
  var id = String(p.subId || ''), key = String(p.key || '');
  if (!id || !key) return { success: false, error: 'missing' };
  var s = sheetToObjects(A33_SUBS).filter(function (x) { return String(x.id) === id; })[0];
  if (!s || String(s.key) !== key || !truthy(s.active)) return { success: false, error: 'unknown device' };
  var since = Number(s.lastFetchAt) || (Date.now() - 15 * 60000), email = String(s.userEmail).toLowerCase();
  var msgs = sheetToObjects(A33_QUEUE).filter(function (m) { return String(m.userEmail).toLowerCase() === email && Number(m.ts) > since; })
    .sort(function (a, b) { return Number(b.ts) - Number(a.ts); });
  var latest = msgs.length ? Number(msgs[0].ts) : since;
  updateRowById(A33_SUBS, s.id, { lastFetchAt: latest });
  return { success: true, data: { more: Math.max(0, msgs.length - 3), messages: msgs.slice(0, 3).map(function (m) { return { title: String(m.title), body: String(m.body), url: String(m.url || './'), tag: String(m.tag || m.id) }; }) } };
}
function pushStatus(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  var props = PropertiesService.getScriptProperties(), subs = a33Subs();
  var users = {}; subs.forEach(function (s) { users[String(s.userEmail).toLowerCase()] = 1; });
  return { success: true, data: { keys: !!props.getProperty('VAPID_PUB'), trigger: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'pushTick'; }),
    lastTick: props.getProperty('a33_tick_at') || '', devices: subs.length, users: Object.keys(users).length } };
}
function routePush33(action, p) {
  var map = { getPushConfig: getPushConfig, pushSubscribe: pushSubscribe, pushUnsubscribe: pushUnsubscribe, setPushPref: setPushPref, pushTest: pushTest, getPushInbox: getPushInbox, pushStatus: pushStatus };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
