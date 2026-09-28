/**
 * PCR Staff App 3.0.0 — release helpers (roles, sessions, meal times, late window, mail test, migration).
 *
 *  - Meal times are App Settings (Kitchen Admin → Meal times), no redeploy:
 *      dinner_cutoff        '23:55'  (day before the dinner)        late_close_dinner    '08:00' (on the dinner day)
 *      breakfast_cutoff     '13:00'  (day before)                   late_close_breakfast '00:00' (= midnight before the day)
 *      lunch_cutoff         '13:00'  (day before)                   late_close_lunch     '00:00'
 *    Between the cutoff and the late close staff can send a Late Meal Request. At the late close every pending late
 *    request for that meal/date is approved automatically, the staff member is notified and (dinner) the saved order
 *    summary + PDF is re-saved. Everything runs lazily on the first request after the time (no trigger needed); the
 *    optional hourly trigger (setupDinnerSummaries) makes it punctual.
 *  - Roles: new Users column `roles` (comma list: admin, chef, boat_manager, boat_captain, hod, assistant_hod). The
 *    legacy `permissions` / `role` / `assistantHod` columns are written in step, so 2.x code and a rollback keep working.
 *  - Sessions: login returns a signed token (v3.<payload>.<sig>). Role / admin actions only count the roles of a
 *    requester who sends a valid token; without one the request is treated as plain staff (needsSignIn).
 */

var R3_TIME_DEFAULTS = {
  dinner_cutoff: '23:55', breakfast_cutoff: '13:00', lunch_cutoff: '13:00',
  late_close_dinner: '08:00', late_close_breakfast: '00:00', late_close_lunch: '00:00'
};
var R3_ROLE_KEYS = ['admin', 'chef', 'boat_manager', 'boat_captain', 'hod', 'assistant_hod'];

/* ---------- time helpers ---------- */
function r3HHMM(v, fallback) {
  var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return fallback;
  return pad2(Number(m[1])) + ':' + m[2];
}
function r3Min(hhmm) { var p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function r3Label(hhmm) {
  var m = r3Min(hhmm), h = Math.floor(m / 60), mi = m % 60;
  if (m === 0) return '12:00 AM (midnight)';
  if (m === 720) return '12:00 PM (noon)';
  return ((h % 12) || 12) + ':' + pad2(mi) + (h < 12 ? ' AM' : ' PM');
}
function mealTimes() {
  var out = {};
  Object.keys(R3_TIME_DEFAULTS).forEach(function (k) {
    var v = '';
    try { v = getSetting(k, R3_TIME_DEFAULTS[k]); } catch (e) { v = R3_TIME_DEFAULTS[k]; }
    out[k] = r3HHMM(v, R3_TIME_DEFAULTS[k]);
  });
  return out;
}
/** Epoch-like "Fiji wall clock" ms for date 'YYYY-MM-DD' + 'HH:MM' (comparable with getFijiNow().getTime()). */
function r3At(dateStr, hhmm) { return Date.parse(dateStr + 'T' + hhmm + ':00Z'); }
function r3AddDays(dateStr, n) { return fijiDateString(new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000)); }
/** Window for one meal / service date: cutoff (day before at X) and late close (service day at Y). */
function mealWindow(meal, serviceDate, times) {
  times = times || mealTimes();
  var cut = times[meal + '_cutoff'], lc = times['late_close_' + meal];
  var cutoffAt = r3At(r3AddDays(serviceDate, -1), cut);
  var lateCloseAt = r3At(serviceDate, lc);
  if (lateCloseAt < cutoffAt) lateCloseAt = cutoffAt; // late close before the cutoff = no late window
  return { meal: meal, serviceDate: serviceDate, cutoff: cut, lateClose: lc, cutoffAt: cutoffAt, lateCloseAt: lateCloseAt,
    cutoffLabel: r3Label(cut) + ' Fiji the day before', lateCloseLabel: r3Label(lc) + (r3Min(lc) === 0 ? ' Fiji (start of the meal day)' : ' Fiji on the meal day') };
}
/** Late request state for a meal/date right now: 'open' (normal ordering), 'late' (late requests), 'closed'. */
function mealPhase(meal, serviceDate, now) {
  var w = mealWindow(meal, serviceDate);
  var t = (now || getFijiNow()).getTime();
  return t < w.cutoffAt ? 'open' : (t < w.lateCloseAt ? 'late' : 'closed');
}
/** All meal times for the app (countdowns, banners). */
function mealTimesOut() {
  var t = mealTimes(), now = getFijiNow(), today = fijiDateString(now), tom = fijiDateString(addFijiDays(now, 1));
  var out = { times: t, fijiNowMs: now.getTime(), fijiNow: formatFiji(now), meals: {} };
  ['breakfast', 'lunch', 'dinner'].forEach(function (m) {
    out.meals[m] = [today, tom].map(function (d) {
      var w = mealWindow(m, d, t);
      return { serviceDate: d, phase: now.getTime() < w.cutoffAt ? 'open' : (now.getTime() < w.lateCloseAt ? 'late' : 'closed'),
        cutoffAt: w.cutoffAt, lateCloseAt: w.lateCloseAt, cutoffLabel: w.cutoffLabel, lateCloseLabel: w.lateCloseLabel };
    });
  });
  return out;
}

/* ---------- roles ---------- */
function r3ParseRoles(raw) {
  var out = [];
  String(raw == null ? '' : raw).split(/[,|\s]+/).forEach(function (x) {
    x = String(x || '').trim().toLowerCase();
    if (x === 'kitchen') x = 'chef';
    if (x === 'boat') x = 'boat_manager';
    if (x === 'superadmin') x = 'super_admin';
    if ((R3_ROLE_KEYS.indexOf(x) >= 0 || x === 'super_admin') && out.indexOf(x) < 0) out.push(x);
  });
  return out;
}
/** Role list shown in the app (More-tab buttons) from the legacy permissions + roles column. */
function userRoles(u) {
  var p = userPermissions(u), out = [];
  if (p.indexOf('super_admin') >= 0) out.push('super_admin');
  if (p.indexOf('admin') >= 0) out.push('admin');
  if (p.indexOf('chef') >= 0) out.push('chef');
  if (p.indexOf('boat_manager') >= 0) out.push('boat_manager');
  if (p.indexOf('boat_captain') >= 0) out.push('boat_captain');
  if (p.indexOf('hod') >= 0) out.push('hod');
  if (p.indexOf('assistant_hod') >= 0 || truthy(u && u.assistantHod)) out.push('assistant_hod');
  return out;
}
/** Buttons in the More tab for a role list. */
function roleButtons(roles) {
  var b = [];
  if (roles.indexOf('admin') >= 0 || roles.indexOf('super_admin') >= 0) b.push('admin');
  if (roles.indexOf('chef') >= 0) b.push('kitchen');
  if (roles.indexOf('boat_manager') >= 0 || roles.indexOf('boat_captain') >= 0) b.push('boat');
  if (roles.indexOf('hod') >= 0 || roles.indexOf('assistant_hod') >= 0) b.push('dept');
  return b;
}
/** Patch that writes a role list to all the role columns (roles, permissions, role, assistantHod). */
function rolesPatch(roles) {
  var perms = ['staff'].concat(roles.filter(function (r) { return r !== 'staff'; }));
  if (perms.indexOf('super_admin') >= 0 && perms.indexOf('admin') < 0) perms.push('admin');
  return { roles: roles.filter(function (r) { return r !== 'staff'; }).join(','), permissions: permissionsToString(perms),
    role: primaryRoleFromPermissions(perms), assistantHod: perms.indexOf('assistant_hod') >= 0 };
}
function r3IsProtectedSuper(u) {
  var em = String(u && u.email || '').toLowerCase();
  return em === SUPERADMIN_EMAIL || em === 'it2.paradisecoveresort@gmail.com';
}

/* ---------- sessions ---------- */
function r3Secret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('PCR_SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PCR_SESSION_SECRET', s); }
  return s;
}
function r3Sig(payload, u) {
  var raw = Utilities.computeHmacSha256Signature(payload, r3Secret() + '|' + String(u.password || '') + '|' + String(u.id || ''));
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}
function makeSessionToken(u) {
  var payload = Utilities.base64EncodeWebSafe(String(u.email).toLowerCase() + '|' + Date.now()).replace(/=+$/, '');
  return 'v3.' + payload + '.' + r3Sig(payload, u);
}
/** Returns the user for a valid token, else null. Tokens last 60 days and die when the password changes. */
function verifySessionToken(tok) {
  var m = String(tok || '').match(/^v3\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  var txt = '';
  try { var pad = m[1] + '===='.slice(0, (4 - m[1].length % 4) % 4); txt = Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString(); } catch (e) { return null; }
  var parts = txt.split('|');
  if (parts.length < 2) return null;
  var iat = Number(parts[1]);
  if (!iat || Date.now() - iat > 60 * 86400000) return null;
  var u = findUserByEmail(parts[0]);
  if (!u) return null;
  if (r3Sig(m[1], u) !== m[2]) return null;
  return u;
}
function roleTokenRequired() { return String(getSetting('auth_role_token', 'true')).toLowerCase() !== 'false'; }
/** Plain-staff view of a user (used when a role account calls without a valid session token). */
function staffView(u) {
  var o = {}; Object.keys(u).forEach(function (k) { o[k] = u[k]; });
  o.permissions = 'staff'; o.role = 'staff'; o.roles = ''; o.assistantHod = false; o._staffView = true;
  return o;
}
function hasAnyRole(u) { return userPermissions(u).some(function (x) { return x !== 'staff'; }) || truthy(u && u.assistantHod); }

/* ---------- item 3: code throttle ---------- */
function codeThrottle(email) {
  var c = CacheService.getScriptCache(), k = 'codes_' + email;
  if (c.get('codelock_' + email)) return 'Too many wrong codes — this email is locked for 30 minutes. Try again later.';
  if (c.get(k + '_1m')) return 'A code was just sent — wait one minute before asking again (check spam too).';
  var hour = Number(c.get(k + '_1h') || 0);
  if (hour >= 5) return 'Too many codes requested for this email in the last hour — try again later.';
  c.put(k + '_1m', '1', 60);
  c.put(k + '_1h', String(hour + 1), 3600);
  return '';
}
function codeLocked(email) { try { return !!CacheService.getScriptCache().get('codelock_' + email); } catch (e) { return false; } }
function codeWrong(email) {
  try {
    var c = CacheService.getScriptCache(), k = 'codebad_' + email;
    var n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), 1800);
    if (n >= 5) c.put('codelock_' + email, '1', 1800);
  } catch (e) {}
}

/* ---------- item 3/4: superadmin code (2026 only; 2025 retired; never grants access on its own) ---------- */
function requireSuperCode(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) throw new Error('Superadmin only');
  if (String(p.passcode || '') !== SUPER_PASS) { var e = new Error('Enter the superadmin code to confirm this change'); e.needsCode = true; throw e; }
  return u;
}

/* ---------- lazy meal tick: dinner cutoff save + late window auto-approve ---------- */
function r3PropDone(key) { try { return !!PropertiesService.getScriptProperties().getProperty(key); } catch (e) { return false; } }
function r3SetDone(key, v) { try { PropertiesService.getScriptProperties().setProperty(key, v || nowIso()); } catch (e) {} }
function r3NotifyMany(rows) {
  if (!rows.length) return;
  if (typeof a33FromNotif === 'function') rows.forEach(function (r) { try { a33FromNotif(r); } catch (e) {} }); // 3.2.0 phone notifications
  try {
    var sh = ensureSheet(getSS(), 'Notifications', NOTIF_HEADERS);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var vals = rows.map(function (r) { return headers.map(function (h) { return r[h] === undefined ? '' : r[h]; }); });
    sh.getRange(sh.getLastRow() + 1, 1, vals.length, headers.length).setValues(vals);
    scInvalidateSheet('Notifications');
  } catch (e) {}
}
function r3ApproveNote(o, meal, how) {
  return { id: uid('ntf'), userEmail: String(o.userEmail).toLowerCase(), title: 'Your ' + meal + ' order is approved',
    body: meal.charAt(0).toUpperCase() + meal.slice(1) + ' ' + v3Date(o.serviceDate) + (o.mealChoice && meal === 'dinner' ? ' — ' + o.mealChoice : '') + (how ? ' (' + how + ')' : ''),
    kind: 'order_approved', relatedId: o.id, read: false, createdAt: nowIso() };
}
/** Approves rows (batch), notifies owners. Returns count. */
function r3ApproveRows(meal, rows, status, how) {
  var sheet = V3_MEAL_SHEETS[meal], notes = [];
  rows.forEach(function (o) {
    var patch = { status: status };
    if (status === 'late_approved') { patch.decidedBy = how || 'auto'; patch.decidedAt = nowIso(); patch.late = true; }
    updateRowById(sheet, o.id, patch);
    if (String(o.userEmail).indexOf('@pcr.local') < 0) notes.push(r3ApproveNote(o, meal, how));
  });
  r3NotifyMany(notes);
  return rows.length;
}
/** Most recent service date whose moment (serviceDate offset days + hhmm) has passed. */
function r3LastPassed(now, dayOffset, hhmm) {
  var today = fijiDateString(now);
  // candidate: the service date D such that r3At(D + dayOffset, hhmm) <= now, largest D
  for (var i = 2; i >= -2; i--) {
    var d = r3AddDays(today, i);
    if (r3At(r3AddDays(d, dayOffset), hhmm) <= now.getTime()) return d;
  }
  return '';
}
function mealTick(force) {
  var out = {};
  var now = getFijiNow(), t = mealTimes();
  var cache = null; try { cache = CacheService.getScriptCache(); } catch (e) {}
  // 1) dinner cutoff passed → final approval wave for that date + saved summary (+ PDF when Drive is authorised)
  var dc = r3LastPassed(now, -1, t.dinner_cutoff);
  if (dc && (force || !(cache && cache.get('r3cut_' + dc)))) {
    if (!r3PropDone('dsum_saved_' + dc)) {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(15000)) {
        try {
          if (!r3PropDone('dsum_saved_' + dc)) {
            var pend = sheetToObjects('Dinner Orders').filter(function (o) { return v3Date(o.serviceDate) === dc && String(o.status) === 'pending' && !truthy(o.late); });
            out.cutoffApproved = r3ApproveRows('dinner', pend, 'approved', 'ordering closed');
            var row = dsumSaveSnapshot(dc, true, 'auto', 'auto at dinner cutoff ' + t.dinner_cutoff); if (typeof a33SummarySaved === 'function') a33SummarySaved(dc, 'cutoff');
            var pdf = dsumTryPdf(row);
            r3SetDone('dsum_saved_' + dc, nowIso() + (pdf.ok ? ' +pdf' : ''));
            out.cutoffSaved = dc;
          }
        } catch (eC) { out.cutoffError = String(eC.message || eC); } finally { lock.releaseLock(); }
      }
    }
    if (cache && !out.cutoffError) cache.put('r3cut_' + dc, '1', 21600);
  }
  // 2) late close passed → approve pending late requests (all meals); dinner re-saves the summary
  ['dinner', 'breakfast', 'lunch'].forEach(function (meal) {
    var d = r3LastPassed(now, 0, t['late_close_' + meal]);
    if (!d) return;
    var key = 'late_done_' + meal + '_' + d;
    if (!force && cache && cache.get(key)) return;
    if (!r3PropDone(key)) {
      var lock2 = LockService.getScriptLock();
      if (!lock2.tryLock(15000)) return;
      try {
        if (!r3PropDone(key)) {
          var rows = sheetToObjects(V3_MEAL_SHEETS[meal]).filter(function (o) { return v3Date(o.serviceDate) === d && String(o.status) === 'late_pending'; });
          var n = r3ApproveRows(meal, rows, 'late_approved', 'auto-approved at ' + r3Label(t['late_close_' + meal]));
          if (meal === 'dinner') {
            var row2 = dsumSaveSnapshot(d, true, 'final', 'final list after late requests (' + t.late_close_dinner + ')'); if (typeof a33SummarySaved === 'function') a33SummarySaved(d, 'final');
            dsumTryPdf(row2);
          }
          r3SetDone(key, nowIso() + ' approved ' + n);
          out[meal + 'LateApproved'] = n;
        }
      } catch (eL) { out[meal + 'Error'] = String(eL.message || eL); } finally { lock2.releaseLock(); }
    }
    if (cache && !out[meal + 'Error']) cache.put(key, '1', 21600);
  });
  // tidy old keys
  try {
    if (!(cache && cache.get('r3tidy'))) {
      var props = PropertiesService.getScriptProperties(), oldest = fijiDateString(addFijiDays(now, -14));
      props.getKeys().forEach(function (k) { var m = k.match(/^(dsum_saved_|late_done_\w+?_)(\d{4}-\d{2}-\d{2})$/); if (m && m[2] < oldest) props.deleteProperty(k); });
      if (cache) cache.put('r3tidy', '1', 21600);
    }
  } catch (eT) {}
  return out;
}
function mealTickSafe() { try { return mealTick(false); } catch (e) { return { error: String(e.message || e) }; } }

/* ---------- API: kitchen meal-time settings, mail test, role migration ---------- */
function setMealTimes(p) {
  var u = v3Requester(p);
  if (!isChefPerm(u)) return { success: false, error: 'Chef / admin only' };
  var changed = [];
  Object.keys(R3_TIME_DEFAULTS).forEach(function (k) {
    if (p[k] === undefined || p[k] === '') return;
    var v = r3HHMM(p[k], '');
    if (!v) throw new Error(k + ' must be HH:MM (24h)');
    setSetting(k, v, u.email); changed.push(k);
  });
  return { success: true, data: { changed: changed, mealTimes: mealTimesOut() } };
}
function getMealTimes(p) { return { success: true, data: mealTimesOut() }; }

function sendTestEmail(p) {
  var u = v3Requester(p);
  if (!isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  var to = String(p.to || u.email).trim().toLowerCase();
  var r = sendAppMail(to, 'PCR Staff App — test email', 'Bula,\n\nThis is a test email from the PCR Staff App (' + APP_VERSION + ') sent ' + nowIso() + '.\nIf you can read this, app emails (sign-up and reset codes) are working.\n\n— PCR Staff App', 'test');
  return { success: !!r.sent, error: r.sent ? undefined : ('Not sent: ' + (r.error || 'unknown')), data: { to: to, sent: !!r.sent, via: r.via || '', sender: r.sender || '', warning: r.warning || '', error: r.error || '', mail: mailStatus() } };
}
function mailStatus() {
  var props = PropertiesService.getScriptProperties();
  var key = !!props.getProperty('BREVO_API_KEY');
  var prov = String(getSetting('mail_provider', 'auto') || 'auto').toLowerCase();
  return { provider: prov, effective: (prov === 'brevo' || prov === 'auto') && key ? 'brevo' : 'mailapp', brevoKeySet: key,
    brevoSender: props.getProperty('BREVO_SENDER_EMAIL') || props.getProperty('BREVO_SENDER') || getSetting('brevo_sender_email', '') || 'it@paradisecoveresortfiji.com',
    brevoSenderName: props.getProperty('BREVO_SENDER_NAME') || 'PCR Staff App', replyTo: getSetting('mail_reply_to', 'it@paradisecoveresortfiji.com') || '',
    lastWarning: props.getProperty('MAIL_LAST_WARNING') || '' };
}

/** Superadmin: convert the old single role / permissions into the roles list. dryRun=1 only reports. Apply backs up the
 *  Users tab first (copy "Users backup YYYY-MM-DD HHMM"). Roles stay exactly as they were (no verification step). */
function migrateRoles(p) {
  var u = v3Requester(p);
  if (!isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  var dry = !(p.dryRun === false || p.dryRun === 'false' || p.dryRun === '0' || p.dryRun === 0);
  if (!dry) { try { requireSuperCode(p); } catch (e) { return { success: false, error: e.message, needsCode: true }; } }
  var ss = getSS(), sh = ss.getSheetByName('Users');
  var users = sheetToObjects('Users');
  var list = [];
  users.forEach(function (x) {
    var roles = userRoles(x);
    if (!roles.length) return;
    var legacy = { role: String(x.role || ''), permissions: String(x.permissions || ''), assistantHod: String(x.assistantHod || '') };
    var patch = rolesPatch(roles);
    var shared = /kitchen|chef|boat|captain|station|front|office|resort@|admin@|info@/i.test(String(x.email)) && !/^it2?\b|^it@/i.test(String(x.email));
    list.push({ email: x.email, name: displayUserName(x), department: x.department || '', active: truthy(x.active), legacy: legacy, roles: roles,
      buttons: roleButtons(roles), writes: patch, sharedLooking: shared, unchanged: String(x.roles || '') === patch.roles });
  });
  if (dry) return { success: true, data: { dryRun: true, count: list.length, users: list } };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, error: 'Busy — try again' };
  var backupName = 'Users backup ' + fijiDateString(getFijiNow()) + ' ' + nowIso().slice(11, 16).replace(':', '');
  try {
    if (!ss.getSheetByName(backupName)) sh.copyTo(ss).setName(backupName);
    ensureColumns(sh, ['roles']);
    list.forEach(function (x) { if (!x.unchanged) updateRowById('Users', findUserByEmail(x.email).id, { roles: x.writes.roles }); });
    setSetting('roles_migrated_at', nowIso(), u.email);
  } finally { lock.releaseLock(); }
  return { success: true, data: { dryRun: false, backupTab: backupName, count: list.length, users: list } };
}

function routeRelease3(action, p) {
  var map = { setMealTimes: setMealTimes, getMealTimes: getMealTimes, sendTestEmail: sendTestEmail, migrateRoles: migrateRoles,
    listOffMenuOrders: listOffMenuOrders, adminCancelMealOrder: adminCancelMealOrder, adminNotifyUser: adminNotifyUser,
    runMealTick: function (q) { var u = v3Requester(q); if (!isChefPerm(u)) return { success: false, error: 'Chef / admin only' }; return { success: true, data: mealTick(true) }; } };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { var r = v3Err(e); if (e && e.needsCode) r.needsCode = true; return r; }
}

/** Who did it (email) — used in …By columns. (Was in Stations.gs; stations are gone in 3.0.0.) */
function requesterTag(r) {
  if (!r) return '';
  return String(r.email || '').toLowerCase();
}

/* ---------- 3.0.0 dinner menu guard (bug: previous day's dish booked for the next day) ---------- */
/** Active dish names for the dinner date's weekday (Fiji date string → weekday via UTC, same as getDinnerMenus). */
function dinnerMenuNames(serviceDate) {
  var d = String(serviceDate || '').slice(0, 10), parts = d.split('-');
  if (parts.length < 3) return [];
  var wd = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay();
  var rows = [];
  try { rows = cachedRows('Dinner Menus'); } catch (e) { rows = sheetToObjects('Dinner Menus'); }
  return rows.filter(function (r) { return Number(r.weekday) === wd && truthy(r.active === undefined || r.active === '' ? true : r.active); })
    .map(function (r) { return String(r.itemName || '').trim(); }).filter(Boolean);
}
function r3NormDish(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
/** null when the dish is on that day's menu (or no menu is set for that weekday), else an error response. */
function dishMenuError(serviceDate, choice) {
  var names = dinnerMenuNames(serviceDate);
  if (!names.length) return null;
  var c = r3NormDish(choice);
  if (names.some(function (n) { return r3NormDish(n) === c; })) return null;
  var parts = String(serviceDate).slice(0, 10).split('-');
  var wdName = WEEKDAY_NAMES[new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay()];
  return { success: false, offMenu: true, notOnMenu: true, menu: names,
    error: '"' + String(choice || '') + '" is not on ' + wdName + '\'s dinner menu (' + String(serviceDate).slice(0, 10) + '). Choose one of: ' + names.join(', ') + '.' };
}
/** Marks prep-list orders whose dish is not on that date's menu (kept in the counts, flagged separately). */
function flagOffMenu(prep) {
  if (!prep || !prep.serviceDate) return prep;
  var names = dinnerMenuNames(prep.serviceDate);
  var set = {}; names.forEach(function (n) { set[r3NormDish(n)] = 1; });
  var off = [];
  if (names.length) {
    Object.keys(prep.byItem || {}).forEach(function (k) {
      if (set[r3NormDish(k)]) return;
      (prep.byItem[k] || []).forEach(function (o) { o.offMenu = true; off.push({ id: o.id, name: o.displayName || o.userName, department: o.department, dish: k, status: o.status }); });
    });
  }
  prep.menu = names;
  prep.offMenu = off;
  prep.offMenuCount = off.length;
  return prep;
}

/** Kitchen Admin: dinner orders for a date whose dish is not on that day's menu. */
function listOffMenuOrders(p) {
  var u = v3Requester(p);
  if (!isChefPerm(u)) return { success: false, error: 'Chef / admin only' };
  var sd = String(p.serviceDate || '').slice(0, 10) || dinnerCutoffInfo().serviceDate;
  var names = dinnerMenuNames(sd), set = {};
  names.forEach(function (n) { set[r3NormDish(n)] = 1; });
  var rows = !names.length ? [] : sheetToObjects('Dinner Orders').filter(function (o) {
    var st = String(o.status);
    return v3Date(o.serviceDate) === sd && st !== 'cancelled' && st !== 'rejected' && st !== 'declined' && !set[r3NormDish(o.mealChoice)];
  }).map(function (o) { return { id: o.id, userEmail: o.userEmail, userName: o.userName, department: o.department, mealChoice: o.mealChoice, status: o.status, createdAt: o.createdAt }; });
  return { success: true, data: { serviceDate: sd, menu: names, orders: rows } };
}
/** Kitchen Admin: cancel one order (any time) with a reason; the staff member gets an in-app notification (+ it is logged on the row). */
/** Make sure the order tab has the cancel columns (older tabs miss them and updateRowById skips unknown columns). */
function r3EnsureCancelCols(sheetName) {
  try { var sh = getSS().getSheetByName(sheetName); if (sh && sh.getLastRow() > 0) ensureColumns(sh, ['cancelReason', 'cancelledAt', 'cancelledBy', 'decidedBy', 'decidedAt']); } catch (e) {}
}
/** Kitchen Admin / admin: cancel one order with a reason (stored on the row). The staff member gets an in-app
 *  notification by default; admins / superadmin can also pick another user to notify (notifyEmail) and add a message.
 *  notify=false sends nothing. */
function adminCancelMealOrder(p) {
  var u = v3Requester(p);
  if (!isChefPerm(u)) return { success: false, error: 'Chef / admin only' };
  var meal = String(p.meal || 'dinner').toLowerCase();
  var sheet = V3_MEAL_SHEETS[meal];
  if (!sheet) return { success: false, error: 'meal must be breakfast, lunch or dinner' };
  var reason = v3Clean(p.reason, 200);
  if (!reason) return { success: false, error: 'A reason is required (the staff member sees it)' };
  var o = findOrder(sheet, p.id);
  if (!o) return { success: false, error: 'Order not found' };
  if (String(o.status) === 'cancelled') return { success: false, error: 'Already cancelled' };
  var owner = String(o.userEmail || '').toLowerCase();
  var targets = [];
  var notify = !(p.notify === false || p.notify === 'false' || p.notify === '0');
  if (notify) {
    var to = String(p.notifyEmail || '').trim().toLowerCase();
    if (to && to !== owner) {
      if (!isAdminPerm(u)) return { success: false, error: 'Only admin / superadmin can notify someone other than the staff member' };
      var tu = findUserByEmail(to);
      if (!tu) return { success: false, error: 'No user with the email ' + to };
      targets.push(to);
      if (!(p.alsoOwner === false || p.alsoOwner === 'false') && owner.indexOf('@pcr.local') < 0) targets.push(owner);
    } else if (owner && owner.indexOf('@pcr.local') < 0) targets.push(owner);
  }
  r3EnsureCancelCols(sheet);
  var r = updateRowById(sheet, o.id, { status: 'cancelled', cancelReason: reason, cancelledAt: nowIso(), cancelledBy: requesterTag(u), decidedBy: requesterTag(u), decidedAt: nowIso() });
  if (r && !r.cancelReason) r.cancelReason = reason;
  var msg = v3Clean(p.message, 300);
  var who = o.userName || owner;
  var body = meal.charAt(0).toUpperCase() + meal.slice(1) + ' ' + v3Date(o.serviceDate) + (o.mealChoice && meal === 'dinner' ? ' — ' + o.mealChoice : '') + ': ' + reason + (msg ? '\n' + msg : '');
  if (targets.length) {
    r3NotifyMany(targets.map(function (em) {
      return { id: uid('ntf'), userEmail: em, title: em === owner ? 'Your ' + meal + ' order was cancelled by the kitchen' : who + '\'s ' + meal + ' order was cancelled',
        body: body, kind: 'order_cancelled', relatedId: o.id, read: false, createdAt: nowIso() };
    }));
  }
  return { success: true, data: { order: r, reason: reason, notified: targets.length === 1 ? targets[0] : targets.join(','), notifiedList: targets, name: o.userName } };
}
/** Admin / superadmin: send an in-app notification to one user. */
function adminNotifyUser(p) {
  var u = v3Requester(p);
  if (!isAdminPerm(u)) return { success: false, error: 'Admin / superadmin only' };
  var to = String(p.targetEmail || '').trim().toLowerCase();
  var t = findUserByEmail(to);
  if (!t) return { success: false, error: 'No user with the email ' + to };
  var title = v3Clean(p.title, 100) || 'Message from admin', body = v3Clean(p.body, 600);
  if (!body) return { success: false, error: 'Write a message' };
  r3NotifyMany([{ id: uid('ntf'), userEmail: to, title: title, body: body, kind: 'admin_message', relatedId: '', read: false, createdAt: nowIso() }]);
  return { success: true, data: { to: to } };
}
