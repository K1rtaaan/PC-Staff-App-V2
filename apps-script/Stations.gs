/**
 * PCR Staff App 3.0 — shared STATION logins ("Chef" and "Boat").
 *
 * - Each station has a username + password managed by superadmin (Manage → Station logins). The password is stored
 *   salted + hashed (HMAC-SHA256 stretched) in Script Properties, never in the Sheet and never in plain text.
 * - Signing in with station credentials gives a long-lived station token (no expiry). Setting / rotating the password
 *   or "Sign out all devices" bumps the station generation → every existing station session stops working.
 * - A station token may ONLY call that station's actions (STATION_ACTIONS). Mutating actions need the name of the
 *   person doing it (actorName, picked on the device) and are written to the "Station Log" sheet.
 * - Personal accounts: chef / boat tools are station-only; a superadmin can open both pages with their own account.
 *   Until a station has been set up (by the 3.0 migration) old chef / boat_manager permissions keep working.
 * This file is also bundled into the demo (tools/build-demo-server.js), so demo mode runs the same rules.
 */
var STATION_DEFS = {
  chef: { key: 'chef', label: 'Chef', defaultUsername: 'chef', perms: 'chef', department: 'Kitchen', email: 'station.chef@pcr.local',
    depts: ['kitchen', 'br kitchen', 'donu kitchen', 'f&b kitchen', 'bakery', 'pastry', 'staff kitchen'] },
  boat: { key: 'boat', label: 'Boat', defaultUsername: 'boat', perms: 'boat_manager', department: 'Boatman', email: 'station.boat@pcr.local',
    depts: ['boatman', 'boat', 'boats', 'marine', 'boat crew', 'captain', 'captains', 'transport'] }
};
var STATION_TOKEN_PREFIX = 'st1.';
var STATION_HASH_ROUNDS = 400;
var STATION_LOG_HEADERS = ['id', 'at', 'station', 'actor', 'actorDepartment', 'action', 'targetId', 'details'];
/* what each station page may call (reads + writes). Everything else is refused for a station token. */
var STATION_ACTIONS = {
  chef: {
    getCutoffInfo: 1, getAppSettings: 1, getStationHome: 1, getStationPeople: 1, getVersion: 1, health: 1,
    getKitchenDashboard: 1, getDinnerPrepList: 1, getMealStatistics: 1, getBreakfastOrderSheet: 1, getLunchOrderSheet: 1,
    getDinnerOrders: 1, getLunchOrders: 1, getBreakfastOrders: 1, getDinnerMenus: 1, getChefDashboard: 1, getMealReport: 1,
    getMealRequests: 1, getWeeklyMenu: 1, getChefFeedback: 1,
    markOrderStatus: 1, saveDinnerMenuItem: 1, deleteDinnerMenuItem: 1, approveLateDinnerOrder: 1, approveLateBreakfastOrder: 1,
    approveAllLateBreakfast: 1, processBreakfastWorkflow: 1, processDinnerWorkflow: 1, decideMealRequest: 1, decideAllMealRequests: 1,
    markChefFeedback: 1, placeMealOnBehalf: 1, placeSpecialMeal: 1,
    getOrderSnapshots: 1, getOrderSnapshot: 1, saveOrderSnapshot: 1
  },
  boat: {
    getCutoffInfo: 1, getAppSettings: 1, getStationHome: 1, getStationPeople: 1, getVersion: 1, health: 1,
    getBoatRuns: 1, getBoatBookings: 1, getBoatTripSummary: 1, getDailyOpsSummary: 1, getEmergencyTravel: 1,
    saveBoatRun: 1, deleteBoatRun: 1, dedupeBoatRuns: 1, reviewEmergencyTravel: 1, cancelBoatBooking: 1
  }
};
/* writes that need "Who's doing this?" (actorName) and are logged */
var STATION_MUTATIONS = {
  markOrderStatus: 1, saveDinnerMenuItem: 1, deleteDinnerMenuItem: 1, approveLateDinnerOrder: 1, approveLateBreakfastOrder: 1,
  approveAllLateBreakfast: 1, processBreakfastWorkflow: 1, processDinnerWorkflow: 1, decideMealRequest: 1, decideAllMealRequests: 1,
  markChefFeedback: 1, placeMealOnBehalf: 1, placeSpecialMeal: 1, saveOrderSnapshot: 1,
  saveBoatRun: 1, deleteBoatRun: 1, dedupeBoatRuns: 1, reviewEmergencyTravel: 1, cancelBoatBooking: 1
};
/* station-only tools: a personal account needs superadmin (or the legacy permission while that station is not set up yet) */
var STATION_ONLY_PERSONAL = {
  getKitchenDashboard: 'chef', getDinnerPrepList: 'chef', getMealStatistics: 'chef', getBreakfastOrderSheet: 'chef', getLunchOrderSheet: 'chef',
  getChefDashboard: 'chef', getMealReport: 'chef', getChefFeedback: 'chef', markOrderStatus: 'chef', saveDinnerMenuItem: 'chef',
  deleteDinnerMenuItem: 'chef', approveLateDinnerOrder: 'chef', approveLateBreakfastOrder: 'chef', approveAllLateBreakfast: 'chef',
  processBreakfastWorkflow: 'chef', processDinnerWorkflow: 'chef', decideAllMealRequests: 'chef', markChefFeedback: 'chef',
  saveBoatRun: 'boat', deleteBoatRun: 'boat', dedupeBoatRuns: 'boat', reviewEmergencyTravel: 'boat'
};

function stationProps() { return PropertiesService.getScriptProperties(); }
function stationGet(key) {
  if (!STATION_DEFS[key]) return null;
  try { var raw = stationProps().getProperty('PCR_STATION_' + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function stationPut(key, cfg) { stationProps().setProperty('PCR_STATION_' + key, JSON.stringify(cfg)); }
function stationConfigured(key) { var c = stationGet(key); return !!(c && c.hash && c.username); }
function stationSecret() {
  var props = stationProps();
  var s = props.getProperty('PCR_SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PCR_SESSION_SECRET', s); }
  return s;
}
function stationB64(bytesOrString) { return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, ''); }
function stationHash(password, salt) {
  var h = String(salt);
  for (var i = 0; i < STATION_HASH_ROUNDS; i++) h = stationB64(Utilities.computeHmacSha256Signature(h + '|' + i, String(password) + '|' + salt));
  return h;
}
function stationCleanUsername(u) { return String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, ''); }
function stationValidPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Station password must be at least 8 characters';
  if (pw === '2026' || /^(password|chef|boat|12345678)$/i.test(pw)) return 'Pick a less guessable station password';
  return '';
}
function stationGeneratePassword() {
  var words = ['manta', 'coral', 'reef', 'palm', 'lagoon', 'kava', 'yasawa', 'turtle', 'sunset', 'island', 'marlin', 'dolphin', 'bula', 'vinaka', 'coconut', 'wave'];
  var raw = Utilities.getUuid().replace(/[^0-9a-f]/g, '');
  var n = function (i) { return parseInt(raw.substr(i * 2, 2), 16); };
  return words[n(0) % words.length] + '-' + words[n(1) % words.length] + '-' + String(1000 + (n(2) * 256 + n(3)) % 9000);
}
/** Set (or rotate) a station password. Always signs out every device of that station. */
function stationSetPassword(key, username, password, by) {
  var def = STATION_DEFS[key];
  if (!def) throw new Error('Unknown station: ' + key);
  var bad = stationValidPassword(password);
  if (bad) throw new Error(bad);
  var cur = stationGet(key) || {};
  var user = stationCleanUsername(username || cur.username || def.defaultUsername);
  if (!user || user.indexOf('@') >= 0) throw new Error('Station username: letters, numbers, dot, dash only');
  Object.keys(STATION_DEFS).forEach(function (k) {
    if (k !== key) { var o = stationGet(k); if (o && o.username === user) throw new Error('Username "' + user + '" is already used by the ' + STATION_DEFS[k].label + ' station'); }
  });
  var salt = Utilities.getUuid();
  var cfg = { username: user, salt: salt, hash: stationHash(password, salt), gen: Number(cur.gen || 0) + 1, rotatedAt: nowIso(), rotatedBy: String(by || ''), createdAt: cur.createdAt || nowIso() };
  stationPut(key, cfg);
  return cfg;
}
function stationSignOutAll(key, by) {
  var cfg = stationGet(key);
  if (!cfg) throw new Error('Station not set up yet');
  cfg.gen = Number(cfg.gen || 0) + 1; cfg.signedOutAt = nowIso(); cfg.signedOutBy = String(by || '');
  stationPut(key, cfg);
  return cfg;
}
function stationSig(key, gen, iat, cfg) {
  return stationB64(Utilities.computeHmacSha256Signature(key + '|' + gen + '|' + iat, stationSecret() + '|station|' + cfg.hash));
}
function stationIssueToken(key, cfg) {
  var iat = Date.now();
  return STATION_TOKEN_PREFIX + stationB64(key + '|' + cfg.gen + '|' + iat + '|' + stationSig(key, cfg.gen, iat, cfg));
}
function isStationToken(t) { return String(t || '').indexOf(STATION_TOKEN_PREFIX) === 0; }
/** { key, cfg } for a valid station token, else null (wrong signature, rotated password or signed out). */
function stationVerifyToken(token) {
  if (!isStationToken(token)) return null;
  var body = String(token).slice(STATION_TOKEN_PREFIX.length), txt;
  try {
    var pad = body + '===='.substring(0, (4 - body.length % 4) % 4);
    txt = Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString();
  } catch (e) { return null; }
  var parts = String(txt).split('|');
  if (parts.length !== 4 || !STATION_DEFS[parts[0]]) return null;
  var cfg = stationGet(parts[0]);
  if (!cfg || !cfg.hash || String(cfg.gen) !== parts[1]) return null;
  if (stationSig(parts[0], parts[1], parts[2], cfg) !== parts[3]) return null;
  return { key: parts[0], cfg: cfg };
}
/** Who did it, for "…By" columns: a station write records the picked name ("Vicky M (Chef station)"), else the email. */
function requesterTag(r) {
  if (!r) return '';
  if (r.station && STATION_DEFS[r.station]) return String(r.actorName || r.firstName || '') + ' (' + STATION_DEFS[r.station].label + ' station)';
  return String(r.email || '').toLowerCase();
}
/** The request identity of a station ("Mere Tabua (Chef station)" when an actor is known). */
function stationUser(key, actor) {
  var def = STATION_DEFS[key];
  return { id: 'station-' + key, email: def.email, firstName: actor || def.label, lastName: actor ? '(' + def.label + ' station)' : 'station',
    preferredName: '', department: def.department, role: def.perms, permissions: def.perms, active: true, verified: true,
    station: key, stationLabel: def.label, actorName: actor || '' };
}
function stationPublicUser(key) {
  var def = STATION_DEFS[key];
  return { email: def.email, firstName: def.label, lastName: 'station', department: def.department, role: def.perms, permissions: def.perms,
    active: true, verified: true, station: key, stationLabel: def.label,
    stationActions: Object.keys(STATION_ACTIONS[key]), stationMutations: Object.keys(STATION_MUTATIONS).filter(function (a) { return STATION_ACTIONS[key][a]; }) };
}
function stationFailKey(user) { return 'pcr_stfail_' + user; }
/** login() hook: returns null when `username` is not a station username (normal personal login continues). */
function stationLogin(username, password) {
  var user = stationCleanUsername(username);
  if (!user || String(username).indexOf('@') >= 0) return null;
  var key = null, cfg = null;
  Object.keys(STATION_DEFS).forEach(function (k) { var c = stationGet(k); if (c && c.username === user) { key = k; cfg = c; } });
  if (!key) return { success: false, error: 'Invalid username or password' };
  var cache = null, fails = 0;
  try { cache = CacheService.getScriptCache(); fails = Number(cache.get(stationFailKey(user)) || 0); } catch (e) {}
  if (fails >= 10) return { success: false, error: 'Too many wrong passwords — try again in 15 minutes' };
  if (stationHash(password, cfg.salt) !== cfg.hash) {
    try { if (cache) cache.put(stationFailKey(user), String(fails + 1), 900); } catch (e2) {}
    return { success: false, error: 'Invalid username or password' };
  }
  try { if (cache) cache.remove(stationFailKey(user)); } catch (e3) {}
  return { success: true, data: { user: stationPublicUser(key), token: stationIssueToken(key, cfg), station: key } };
}
function stationActorClean(v) { return String(v == null ? '' : v).replace(/[\r\n\t<>]+/g, ' ').trim().substring(0, 60); }
/**
 * Gate for a request made with a station token. Returns '' (allowed) or an error object.
 * Sets p._stationUser (identity), p.requesterEmail, p._station, p._actor.
 */
function stationBindRequest(action, p, key) {
  var def = STATION_DEFS[key];
  if (!STATION_ACTIONS[key][action]) {
    return { error: 'The ' + def.label + ' station login can only use the ' + def.label + ' page — sign in with your own account for this.', stationDenied: true };
  }
  var actor = stationActorClean(p.actorName);
  if (STATION_MUTATIONS[action] && !actor) return { error: 'Who\'s doing this? Pick your name first.', needsActor: true };
  delete p.actorName;
  var u = stationUser(key, actor);
  p._stationUser = u; p._station = key; p._actor = actor;
  p.requesterEmail = u.email;
  if (p.userEmail && action !== 'placeMealOnBehalf' && action !== 'cancelBoatBooking') delete p.userEmail; // stations never act "as" a staff member
  return '';
}
/** Gate for a personal account calling a station-only tool. '' = allowed. */
function stationPersonalGate(action, u) {
  var key = STATION_ONLY_PERSONAL[action];
  if (!key) return '';
  if (isSuperPerm(u)) return '';
  if (!stationConfigured(key) && stationLegacyPerm(u, key)) return ''; // before the 3.0 migration created the station
  return STATION_DEFS[key].label + ' tools moved to the ' + STATION_DEFS[key].label + ' station login (or ask a superadmin).';
}
function stationLegacyPerm(u, key) {
  var p = userPermissions(u);
  if (key === 'chef') return p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0 || p.indexOf('admin') >= 0;
  return p.indexOf('boat_manager') >= 0 || p.indexOf('boat_captain') >= 0 || p.indexOf('boat') >= 0 || p.indexOf('admin') >= 0;
}
function stationLogWrite(p, action, result) {
  try {
    var d = (result && result.data) || {};
    var target = String(p.id || p.orderId || p.runId || p.itemId || p.bookingId || d.id || '').substring(0, 80);
    var details = [];
    ['status', 'decision', 'meal', 'serviceDate', 'kind', 'itemName', 'route', 'date', 'time'].forEach(function (k) { if (p[k] !== undefined && p[k] !== '') details.push(k + '=' + String(p[k]).substring(0, 60)); });
    appendRow('Station Log', { id: uid('stl'), at: nowIso(), station: p._station, actor: p._actor, actorDepartment: '', action: action, targetId: target, details: details.join('; ') }, STATION_LOG_HEADERS);
  } catch (e) {}
}
function stationPeopleFor(key) {
  var def = STATION_DEFS[key];
  return sheetToObjects('Users').filter(function (u) {
    return truthy(u.active) && def.depts.indexOf(String(u.department || '').trim().toLowerCase()) >= 0;
  }).map(function (u) {
    var pref = String(u.preferredName || '').trim();
    return { name: pref || (String(u.firstName || '') + ' ' + String(u.lastName || '')).trim(), department: u.department || '' };
  }).filter(function (x) { return x.name; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}
function stationCaller(p) {
  if (p._stationUser) return p._stationUser;
  return getRequester(p);
}
function stationStatus() {
  var out = {};
  Object.keys(STATION_DEFS).forEach(function (k) {
    var c = stationGet(k) || {};
    out[k] = { key: k, label: STATION_DEFS[k].label, configured: !!(c.hash && c.username), username: c.username || STATION_DEFS[k].defaultUsername,
      rotatedAt: c.rotatedAt || '', rotatedBy: c.rotatedBy || '', signedOutAt: c.signedOutAt || '', generation: Number(c.gen || 0) };
  });
  return out;
}
/* ---------- routable actions ---------- */
function routeStations(action, p) {
  var map = { getStations: getStations, setStationPassword: setStationPassword, signOutStation: signOutStation, getStationPeople: getStationPeople, getStationHome: getStationHome };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
function stationRequireSuper(p, needPassword) {
  var r = getRequester(p);
  if (!r || p._stationUser || !isSuperPerm(r)) return { success: false, error: 'Superadmin only' };
  if (needPassword && !isAdminPassword(p.passcode)) return { success: false, error: 'Admin password required (wrong or missing)', needsPassword: true };
  return null;
}
function getStations(p) {
  var bad = stationRequireSuper(p, false); if (bad) return bad;
  return { success: true, data: { stations: stationStatus() } };
}
/** Superadmin + admin password. generate=1 → a new random password is returned ONCE; else p.password is used. */
function setStationPassword(p) {
  var bad = stationRequireSuper(p, true); if (bad) return bad;
  var key = String(p.station || '');
  if (!STATION_DEFS[key]) return { success: false, error: 'Pick the Chef or Boat station' };
  var gen = truthy(p.generate);
  var pw = gen ? stationGeneratePassword() : String(p.password || '');
  var r = getRequester(p);
  try { stationSetPassword(key, p.username, pw, r.email); } catch (e) { return { success: false, error: String(e.message || e) }; }
  return { success: true, data: { station: stationStatus()[key], password: gen ? pw : undefined, generated: gen,
    message: STATION_DEFS[key].label + ' station password ' + (gen ? 'rotated' : 'set') + ' — every device signed in as ' + STATION_DEFS[key].label + ' is signed out.' } };
}
function signOutStation(p) {
  var bad = stationRequireSuper(p, true); if (bad) return bad;
  var key = String(p.station || '');
  if (!STATION_DEFS[key]) return { success: false, error: 'Pick the Chef or Boat station' };
  stationSignOutAll(key, getRequester(p).email);
  return { success: true, data: { station: stationStatus()[key], message: 'All ' + STATION_DEFS[key].label + ' station devices signed out' } };
}
/** Names for the "Who's doing this?" picker (station page or superadmin). */
function getStationPeople(p) {
  var key = p._station || String(p.station || '');
  if (!STATION_DEFS[key]) return { success: false, error: 'station required' };
  if (!p._stationUser) { var r = getRequester(p); if (!r || !isSuperPerm(r)) return { success: false, error: 'Station or superadmin only' }; }
  return { success: true, data: { station: key, people: stationPeopleFor(key) } };
}
function getStationHome(p) {
  var key = p._station || String(p.station || '');
  if (!STATION_DEFS[key]) return { success: false, error: 'station required' };
  if (!p._stationUser) { var r = getRequester(p); if (!r || !isSuperPerm(r)) return { success: false, error: 'Station or superadmin only' }; }
  return { success: true, data: { station: key, label: STATION_DEFS[key].label, fijiNow: nowIso(), version: APP_VERSION } };
}
