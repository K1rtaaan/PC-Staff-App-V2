/**
 * PCR Staff App — Paradise Cove Resort Fiji
 * Google Apps Script Web App backend
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Paste the Web App URL into public/index.html as SCRIPT_URL / API_URL.
 *
 * Fiji time (critical):
 *   getFijiNow() always returns a Date representing "wall clock" in UTC+12.
 *   Business cutoffs NEVER use device/script local timezone for decisions.
 *
 * Cutoff examples (Fiji wall clock):
 *   Dinner: closes 20:00 Fiji TODAY for TOMORROW's service.
 *     e.g. Fri 19:59 Fiji → can still book Sat dinner
 *          Fri 20:00 Fiji → dinner booking closed for Sat
 *   Breakfast: closes 13:00 Fiji TODAY for TOMORROW (headcount). Late window 13:00–18:00 → late_pending (chef approve). After 18:00 fully closed.
 *   Lunch: closes 13:00 Fiji TODAY for TOMORROW's service (headcount only; no late path).
 */

var SHEET_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM'; // PCR Staff App V2 (not V1)
var APP_VERSION = '3.5.2';
var SUPER_PASS = '2026'; // superadmin code (kept from 2.x — role gates first, code accepted if sent)
var ADMIN_PASS = '2025'; // admin code (kept from 2.x)
var SUPERADMIN_EMAIL = 'it@paradisecoveresortfiji.com';
var SUPERADMIN_PASSWORD = '21slands';
var FIJI_OFFSET_MS = 12 * 60 * 60 * 1000; // UTC+12 (no DST for business rules)

var DEFAULT_ALERT_EMAILS = [
  'leanne@paradisecoveresortfiji.com',
  'agm@paradisecoveresortfiji.com',
  'cesare@paradisecoveresortfiji.com',
  'wood.nicolas@gmail.com',
  'pranav619kumar@gmail.com'
];

var ROLES = ['super_admin', 'admin', 'hod', 'assistant_hod', 'chef', 'kitchen', 'boat_manager', 'boat_captain', 'boat', 'staff'];
var ALL_PERMISSIONS = ['super_admin', 'admin', 'hod', 'assistant_hod', 'boat_manager', 'boat_captain', 'chef', 'staff'];
var FEATURE_DEFAULTS = {
  feature_live_roster: 'false',
  feature_leave_escalation: 'false',
  feature_my_schedule: 'false'
};
var LIVE_ROSTER_SHEET_ID = '1n5onxR-Ww-0oDdPWDDUvRWuzKd-UGF51tBERtZfAcZM';

var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Exact weekly dinner menus (Fiji weekday 0=Sun … 6=Sat) — one row per item */
var DEFAULT_DINNER_MENUS = {
  0: ['Lamb Neck Curry', 'Chicken Burger/Chips', 'Chicken cheese Pizza', 'Oven Roasted Chicken/ Patatoe Salad/Veggies'],
  1: ['Chicken Pizza', 'Beef Curry / Rice / Chutney', 'Chicken Burger', 'Sausages / Potato Salad / Gravy'],
  2: ['Oven Roasted Lamb neck / Vegs/ Cassava', 'Chicken In Black Bean Sauce / Rice', 'Chicken Pizza'],
  3: ['Chicken In Tomato sauce / Rice / Sliced cucumber', 'Chicken Pizza', 'Chicken Burger', 'Beef Soup / Veg / Kumala'],
  4: ['Stew Chicken /Veg/ Rice', 'Grilled Sausages / Kumala /Salad / Tomato Sauce', 'Chicken cheese Pizza', 'Chicken Fried Rice'],
  5: ['Fish Lolo / Cassava / Vegetables', 'Chicken Palau / Salad', 'Chicken Burger', 'Chicken Pizza'],
  6: ['Chicken Black Bean / Rice', 'Beef Curry /Rice/Papadum', 'Chicken Burger/Chips', 'Chicken cheese Pizza']
};


/* ========== CORS / ENTRY ========== */

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function parseRequestPayload(e, method) {
  var payload = {};
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    payload = JSON.parse(e.postData.contents);
  } else if (e && e.parameter) {
    payload = {};
    var keys = Object.keys(e.parameter);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = e.parameter[k];
      if (typeof v === 'string') {
        var trimmed = v.replace(/^\s+/, '');
        if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
          try { v = JSON.parse(v); } catch (err) {}
        }
      }
      payload[k] = v;
    }
    if (payload.payload) {
      try {
        var nested = (typeof payload.payload === 'string') ? JSON.parse(payload.payload) : payload.payload;
        payload = Object.assign({}, payload, nested);
      } catch (err) {}
    }
  }
  return payload;
}

function handleRequest(e, method) {
  try {
    var payload = parseRequestPayload(e, method);
    var action = payload.action || (e && e.parameter && e.parameter.action) || '';
    // C97: getVersion/health — pure fast path (no spreadsheet open, no seed)
    if (action === 'getVersion' || action === 'health') {
      return jsonOut({
        success: true,
        ok: true,
        version: APP_VERSION,
        sheetId: SHEET_ID,
        fijiNow: formatFiji(getFijiNow())
      });
    }
    // Explicit admin init keeps full initializeSheets (below in routeAction)
    if (action !== 'initSheets') {
      assertSheetsReady();
      dsumMaybeAutoSave(); // 2.10.1: first request after 8pm Fiji saves tomorrow's dinner summary (Summaries.gs)
    }
    // 3.0.0: signed session token binds the identity; role powers need the token (see Release3.gs)
    var auth = bindRequestIdentity(action, payload);
    if (auth && auth.error) {
      R3_AUTH = null;
      return jsonOut({ success: false, error: auth.error, sessionExpired: !!auth.sessionExpired, needsSignIn: !!auth.sessionExpired });
    }
    if (typeof a320OwnerOnce === 'function') a320OwnerOnce(); // 3.2.0 one-time: revert/report owner = it@ (Reports31.gs)
    if (typeof a320RolesOnce === 'function') a320RolesOnce(); // 3.2.0 one-time: role migration + Leanne/Delai → Admin (Ops320.gs)
    var result = a31Handle(action, payload, routeAction); // 3.1.0: superadmin staff-action block + admin activity log (Admin31.gs)
    if (result && result.success === false && R3_AUTH && R3_AUTH.staffView) { result.needsSignIn = true; }
    if (typeof a33AfterAction === 'function') { a33AfterAction(action, payload, result); try { a33Flush(); } catch (e) {} } // 3.2.0 phone notifications (Push33.gs)
    R3_AUTH = null;
    return jsonOut(result);
  } catch (err) {
    R3_AUTH = null;
    return jsonOut({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction(action, p) {
  switch (action) {
    case 'getVersion':
    case 'health':
      // Also reachable via routeAction; prefer handleRequest fast path
      return { success: true, ok: true, version: APP_VERSION, sheetId: SHEET_ID, fijiNow: formatFiji(getFijiNow()) };

    case 'login': return login(p);
    case 'register': return register(p);
    case 'verifyEmail': return verifyEmail(p);
    case 'requestVerification': return requestVerification(p);
    case 'requestPasswordReset': return requestPasswordReset(p);
    case 'resetPassword': return resetPassword(p);
    case 'deactivateAccount': return deactivateAccount(p);
    case 'updateProfile':
    case 'updateUser': return updateUser(p);
    case 'getUsers': return getUsers(p);
    case 'addUser': return addUser(p);
    case 'importUsersCSV': return importUsersCSV(p);
    case 'approveUser': return approveUser(p);
    case 'getPendingApprovals': return getPendingApprovals(p);
    case 'getAlertEmails': return getAlertEmails(p);
    case 'saveAlertEmails': return saveAlertEmails(p);
    case 'deleteUser': return deleteUser(p);

    case 'getBoatRuns': return getBoatRuns(p);
    case 'dedupeBoatRuns': return dedupeBoatRuns(p);
    case 'saveBoatRun': return saveBoatRun(p);
    case 'deleteBoatRun': return deleteBoatRun(p);
    case 'getBoatBookings': return getBoatBookings(p);
    case 'bookBoat': return withIdempotency('bookBoat', p, bookBoat); // 2.10.0 offline-queue safe
    case 'cancelBoatBooking': return withIdempotency('cancelBoatBooking', p, cancelBoatBooking); // 2.10.0 offline-queue safe
    case 'myBoatBookings': return myBoatBookings(p);
    case 'getDailyOpsSummary': return getDailyOpsSummary(p);
    case 'getBoatTripSummary': return getBoatTripSummary(p);
    case 'requestEmergencyTravel': return requestEmergencyTravel(p);
    case 'getEmergencyTravel': return getEmergencyTravel(p);
    case 'reviewEmergencyTravel': return reviewEmergencyTravel(p);
    case 'getHodLeaveSummary': return getHodLeaveSummary(p);

    case 'getDinnerOrders': return getDinnerOrders(p);
    case 'placeDinnerOrder': return withIdempotency('placeDinnerOrder', p, placeDinnerOrder); // 2.10.0 offline-queue safe
    case 'getLunchOrders': return getLunchOrders(p);
    case 'placeLunchOrder': return withIdempotency('placeLunchOrder', p, placeLunchOrder); // 2.10.0 offline-queue safe
    case 'getBreakfastOrders': return getBreakfastOrders(p);
    case 'placeBreakfastOrder': return withIdempotency('placeBreakfastOrder', p, placeBreakfastOrder); // 2.10.0 offline-queue safe
    case 'cancelMealOrder': return withIdempotency('cancelMealOrder', p, cancelMealOrder); // 2.10.0 offline-queue safe
    case 'getKitchenDashboard': return getKitchenDashboard(p);
    case 'markOrderStatus': return markOrderStatus(p);
    case 'getDinnerMenus': return getDinnerMenus(p);
    case 'saveDinnerMenuItem': return saveDinnerMenuItem(p);
    case 'deleteDinnerMenuItem': return deleteDinnerMenuItem(p);
    case 'approveLateDinnerOrder': return approveLateDinnerOrder(p);
    case 'approveLateBreakfastOrder': return approveLateBreakfastOrder(p);
    case 'approveAllLateBreakfast': return approveAllLateBreakfast(p);
    case 'processBreakfastWorkflow': return processBreakfastWorkflow(p);
    case 'processDinnerWorkflow': return processDinnerWorkflow(p);
    case 'getDinnerPrepList': return typeof s34Wrap === 'function' ? s34Wrap(getDinnerPrepList(p), 'dinner') : getDinnerPrepList(p); // 3.4.1 + island estimate, special meals
    case 'getKitchenDaySummary': return getKitchenDaySummary(p); // 2.10.1 Summaries.gs (read only)
    case 'getSavedSummaryPdf': return getSavedSummaryPdf(p); // 2.10.1
    case 'saveDinnerSummary': return saveDinnerSummary(p); // 2.10.1 admin
    case 'backfillDinnerSummaries': return backfillDinnerSummaries(p); // 2.10.1 superadmin
    case 'dinnerSummaryStatus': return dinnerSummaryStatus(p); // 2.10.1 superadmin
    case 'getMealStatistics': return getMealStatistics(p);
    case 'placeMealOnBehalf': return placeMealOnBehalf(p);
    case 'getBreakfastOrderSheet': return typeof s34Wrap === 'function' ? s34Wrap(getBreakfastOrderSheet(p), 'breakfast') : getBreakfastOrderSheet(p); // 3.4.1 + island estimate, special meals
    case 'getLunchOrderSheet': return typeof s34Wrap === 'function' ? s34Wrap(getLunchOrderSheet(p), 'lunch') : getLunchOrderSheet(p); // 3.4.1 + island estimate, special meals

    case 'getReminders': return getReminders(p);
    case 'addReminder': return addReminder(p);
    case 'completeReminder': return completeReminder(p);
    case 'deleteReminder': return deleteReminder(p);

    case 'getSuggestions': return getSuggestions(p);
    case 'addSuggestion': return addSuggestion(p);
    case 'voteSuggestion': return voteSuggestion(p);
    case 'approveSuggestion': return approveSuggestion(p);
    case 'rejectSuggestion': return rejectSuggestion(p);

    case 'getLeaveRequests': return getLeaveRequests(p);
    case 'requestLeave': return withIdempotency('submitLeave', p, submitLeave); // 3.0 two-step leave (V3.gs)
    case 'reviewLeave': return routeV3('decideLeave', p); // 3.0
    case 'getMySchedule': return getMySchedule(p);
    case 'uploadRosterParsed': return uploadRosterParsed(p);
    case 'getMyNotifications': return getMyNotifications(p);
    case 'markNotificationRead': return markNotificationRead(p);
    case 'listRosterUploads': return listRosterUploads(p);
    case 'getAppSettings': return getAppSettings(p);
    case 'setAppSetting': return setAppSetting(p);
    case 'getLiveRoster': return getLiveRoster(p);
    case 'getDepartmentRoster': return getDepartmentRoster(p);
    case 'unlockSuperadminPin': return unlockSuperadminPin(p);

    case 'getCutoffInfo': return getCutoffInfo(p);
    case 'getMyOrdersSummary': return getMyOrdersSummary(p);
    case 'getBootstrap': return getBootstrap(p); // 2.10.0 (Speed.gs)
    case 'archiveOldRows': return archiveOldRows(p); // 2.10.0 superadmin, dryRun=1 reports only
    case 'initSheets':
      requirePasscode(p, 'super');
      initializeSheets();
      ensureSuperAdmin();
      seedAlertEmails();
      seedDinnerMenus();
      seedSampleReminders();
      var boatSeed = seedVillageBoatRuns();
      markSheetsReady('initSheets');
      return { success: true, data: { message: 'Sheets initialized', version: APP_VERSION, boatRuns: boatSeed } };

    case 'seedVillageBoatSchedule':
    case 'seedStaffSamples': {
      requirePasscode(p, 'admin');
      var remStats = seedSampleReminders();
      var boatStats = seedVillageBoatRuns();
      return {
        success: true,
        data: {
          reminder: remStats,
          boatRuns: boatStats,
          version: APP_VERSION,
          message: 'Sample reminder + village boat schedule seeded (idempotent)'
        }
      };
    }

    default: {
      var v3res = routeV3(action, p); // 3.0 actions (V3.gs)
      if (v3res) return v3res;
      var r3res = routeRelease3(action, p); // 3.0.0 meal times, mail test, role migration (Release3.gs)
      if (r3res) return r3res;
      var a31res = routeAdmin31(action, p); // 3.1.0 admin log, revert, superadmin notice (Admin31.gs)
      if (a31res) return a31res;
      var r33res = typeof routeResort33 === 'function' ? routeResort33(action, p) : null; // 3.3.0 resort boat (Resort33.gs)
      if (r33res) return r33res;
      var r34res = typeof routeRoster34 === 'function' ? routeRoster34(action, p) : null; // 3.4.0 rosters, schedule tab, leave balances (Roster34.gs)
      if (r34res) return r34res;
      return { success: false, error: 'Unknown action: ' + action };
    }
  }
}

/* ========== FIJI TIME ========== */

/**
 * Returns a Date whose UTC getters reflect Fiji wall-clock (UTC+12).
 * Example: when true UTC is 2026-09-04 14:00, Fiji is 2026-09-05 02:00 —
 * getFijiNow().getUTCHours() === 2.
 */
function getFijiNow() {
  return new Date(Date.now() + FIJI_OFFSET_MS);
}

function formatFiji(d) {
  var y = d.getUTCFullYear();
  var m = pad2(d.getUTCMonth() + 1);
  var day = pad2(d.getUTCDate());
  var h = pad2(d.getUTCHours());
  var min = pad2(d.getUTCMinutes());
  return y + '-' + m + '-' + day + ' ' + h + ':' + min + ' FJT';
}

function fijiDateString(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function addFijiDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Dinner: for tomorrow's service, cutoff is 20:00 Fiji today.
 * Returns { open, serviceDate, cutoffLabel, fijiNow }
 */
function dinnerCutoffInfo(now) {
  return r3CutoffInfo('dinner', now);
}
/** 3.0.0: cutoffs are App Settings (dinner_cutoff default 23:55, breakfast/lunch 13:00; late close per meal). */
function r3CutoffInfo(meal, now) {
  now = now || getFijiNow();
  var t = mealTimes();
  var cut = t[meal + '_cutoff'];
  var mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  var open = mins < r3Min(cut);
  var serviceDate = fijiDateString(addFijiDays(now, 1));
  var w = mealWindow(meal, serviceDate, t);
  var phase = now.getTime() < w.cutoffAt ? 'open' : (now.getTime() < w.lateCloseAt ? 'late' : 'closed');
  return {
    open: open,
    lateOpen: !open && phase === 'late',
    fullyClosed: !open && phase !== 'late',
    serviceDate: serviceDate,
    cutoffHour: Math.floor(r3Min(cut) / 60),
    cutoffMinute: r3Min(cut) % 60,
    cutoff: cut,
    lateClose: t['late_close_' + meal],
    cutoffAt: w.cutoffAt,
    lateCloseAt: w.lateCloseAt,
    cutoffLabel: r3Label(cut) + ' Fiji (today for tomorrow\'s ' + meal + ')',
    lateCloseLabel: w.lateCloseLabel,
    fijiNow: formatFiji(now),
    fijiNowMs: now.getTime(),
    meal: meal
  };
}

/**
 * Breakfast: tomorrow's service.
 *   open (normal): before 13:00 Fiji — headcount → ordered
 *   lateOpen: 13:00–17:59 Fiji — late request → late_pending (chef/admin approve → late_approved)
 *   after 18:00: fully closed; unapproved late_pending auto-declined
 */
function breakfastCutoffInfo(now) {
  return r3CutoffInfo('breakfast', now);
}

/**
 * Lunch: tomorrow's service, cutoff 13:00 Fiji today. Headcount only.
 */
function lunchCutoffInfo(now) {
  return r3CutoffInfo('lunch', now);
}

function getCutoffInfo(p) {
  var now = getFijiNow();
  return {
    success: true,
    data: {
      fijiNow: formatFiji(now),
      breakfast: breakfastCutoffInfo(now),
      dinner: dinnerCutoffInfo(now),
      lunch: lunchCutoffInfo(now),
      mealTimes: mealTimesOut()
    }
  };
}

/* ========== SHEETS ========== */

function getSS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    SHEET_ID = ss.getId();
    return ss;
  }
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  throw new Error('No V2 spreadsheet bound. Open this script from the PCR Staff App V2 sheet.');
}

/** Core tabs that must exist before serving production reads (no auto-seed). */
var REQUIRED_SHEETS = [
  'Users', 'App Settings', 'Boat Runs', 'Boat Bookings',
  'Dinner Orders', 'Lunch Orders', 'Breakfast Orders',
  'Reminders', 'Suggestions', 'Leave Requests', 'Emergency Travel',
  'Alert Emails', 'Verification Codes', 'Dinner Menus',
  'Dinner Prep Snapshots', 'Roster Uploads', 'Roster Shifts', 'Notifications'
];

/**
 * Lightweight readiness check for hot-path requests.
 * Does NOT create columns or seed menus/boats/reminders.
 * If a required sheet is missing, returns a clear admin-init error.
 */
function assertSheetsReady() {
  var cache = CacheService.getScriptCache();
  try {
    if (cache.get('pcr_sheets_ready') === '1') {
      var ssCached = getSS();
      ensureOrderNoteColumns(ssCached);
      ensureV3Schema(ssCached); // 3.0: new tabs/columns, appended at the end (cached 6h)
      return ssCached;
    }
  } catch (eCache) {}

  var ss = getSS();
  var missing = [];
  for (var i = 0; i < REQUIRED_SHEETS.length; i++) {
    if (!ss.getSheetByName(REQUIRED_SHEETS[i])) missing.push(REQUIRED_SHEETS[i]);
  }
  if (missing.length) {
    throw new Error(
      'Sheets not initialized (missing: ' + missing.join(', ') +
      '). Ask an admin to run action initSheets once, then retry.'
    );
  }
  // Sheets exist — cache readiness. Flag sheets_ready is set only by initializeSheets / markSheetsReady.
  try { cache.put('pcr_sheets_ready', '1', 21600); } catch (ePut) {}
  ensureOrderNoteColumns(ss);
  ensureV3Schema(ss);
  return ss;
}

/**
 * C102: add the optional `specialNote` column to the three order sheets.
 * Appends a header at the END of row 1 only (existing rows/columns untouched,
 * old rows read as ''). Script-locked so parallel requests cannot add it twice;
 * result cached 6h so the hot path stays one cache read.
 */
var ORDER_NOTE_SHEETS = ['Breakfast Orders', 'Lunch Orders', 'Dinner Orders'];
function ensureOrderNoteColumns(ss) {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    if (cache.get('pcr_note_cols_v294') === '1') return;
  } catch (eC) {}
  var lock = null, got = false;
  try { lock = LockService.getScriptLock(); got = lock.tryLock(8000); } catch (eL) {}
  if (!got) return; // another request is adding it; appendRow() also ensures columns
  try {
    ss = ss || getSS();
    for (var i = 0; i < ORDER_NOTE_SHEETS.length; i++) {
      var sh = ss.getSheetByName(ORDER_NOTE_SHEETS[i]);
      if (sh && sh.getLastRow() > 0) ensureColumns(sh, ['specialNote']);
    }
    try { if (cache) cache.put('pcr_note_cols_v294', '1', 21600); } catch (eP) {}
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

function markSheetsReady(by) {
  try {
    setSetting('sheets_ready', 'true', by || 'system');
  } catch (e) {}
  try {
    CacheService.getScriptCache().put('pcr_sheets_ready', '1', 21600);
  } catch (e2) {}
}

function ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    try {
      sh = ss.insertSheet(name);
    } catch (e) {
      // Concurrent init or soft-created tab — re-fetch
      sh = ss.getSheetByName(name);
      if (!sh) throw e;
    }
  }
  if (!sh) throw new Error('Could not open sheet: ' + name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    ensureColumns(sh, headers);
  }
  return sh;
}

function ensureColumns(sh, headers) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  for (var i = 0; i < headers.length; i++) {
    if (existing.indexOf(headers[i]) === -1) {
      sh.getRange(1, existing.length + 1).setValue(headers[i]);
      existing.push(headers[i]);
    }
  }
}

function initializeSheets() {
  var ss = getSS();
  ensureSheet(ss, 'Users', [
    'id', 'email', 'password', 'firstName', 'lastName', 'preferredName', 'department', 'contact',
    'role', 'permissions', 'roster', 'village', 'active', 'createdAt', 'verified', 'photoUrl'
  ]);
  ensureSheet(ss, 'App Settings', ['key', 'value', 'updatedAt', 'updatedBy']);
  ensureFeatureDefaults();
  ensureSheet(ss, 'Boat Runs', [
    'id', 'date', 'time', 'route', 'capacity', 'notes', 'fullNotification', 'active', 'createdBy', 'createdAt'
  ]);
  ensureSheet(ss, 'Boat Bookings', [
    'id', 'runId', 'userEmail', 'userName', 'seats', 'status', 'notes', 'createdAt'
  ]);
  ensureSheet(ss, 'Dinner Orders', [
    'id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes',
    'status', 'late', 'createdAt', 'specialNote'
  ]);
  ensureSheet(ss, 'Lunch Orders', [
    'id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes',
    'status', 'late', 'createdAt', 'specialNote'
  ]);
  ensureSheet(ss, 'Breakfast Orders', [
    'id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes',
    'status', 'late', 'createdAt', 'specialNote'
  ]);
  ensureSheet(ss, 'Reminders', [
    'id', 'userEmail', 'title', 'body', 'dueDate', 'done', 'priority', 'important', 'audience', 'createdAt'
  ]);
  ensureSheet(ss, 'Suggestions', [
    'id', 'userEmail', 'userName', 'title', 'body', 'votes', 'likes', 'dislikes', 'voters', 'createdAt', 'status'
  ]);
  ensureSheet(ss, 'Leave Requests', [
    'id', 'userEmail', 'userName', 'department', 'startDate', 'endDate', 'reason',
    'status', 'reviewedBy', 'hodNote', 'managerNote', 'notifyNote', 'createdAt'
  ]);
  ensureSheet(ss, 'Emergency Travel', [
    'id', 'userEmail', 'userName', 'department', 'reason', 'seats', 'preferredTime',
    'status', 'reviewedBy', 'reviewNote', 'createdAt'
  ]);
  ensureSheet(ss, 'Alert Emails', ['email', 'label', 'active']);
  ensureSheet(ss, 'Verification Codes', [
    'email', 'code', 'expiresAt', 'used', 'purpose'
  ]);
  ensureSheet(ss, 'Dinner Menus', [
    'id', 'weekday', 'weekdayName', 'itemName', 'sortOrder', 'active', 'updatedAt'
  ]);
  ensureSheet(ss, 'Dinner Prep Snapshots', [
    'id', 'serviceDate', 'generatedAt', 'autoGenerated', 'totalOrders', 'payloadJson'
  ]);
  ensureSheet(ss, 'Roster Uploads', [
    'id', 'period', 'department', 'fileName', 'fileType', 'uploadedBy', 'uploadedAt',
    'rowCount', 'matchedCount', 'unmatchedJson', 'notes'
  ]);
  ensureSheet(ss, 'Roster Shifts', [
    'id', 'uploadId', 'period', 'userEmail', 'userName', 'department', 'date',
    'start', 'end', 'dayOff', 'roleLabel', 'rawName', 'createdAt'
  ]);
  ensureSheet(ss, 'Notifications', [
    'id', 'userEmail', 'title', 'body', 'kind', 'relatedId', 'read', 'createdAt'
  ]);
  ensureSheet(ss, 'Request Log', REQUEST_LOG_HEADERS); // 2.10.0 idempotent offline-queue writes
  ensureV3Schema(ss, true); // 3.0 tabs + columns
  seedAlertEmails();
  seedDinnerMenus();
  seedSampleReminders();
  seedVillageBoatRuns();
  markSheetsReady('initializeSheets');
}

function sheetCellToValue(v, headerName) {
  if (!(v instanceof Date)) return v;
  if (headerName === 'roster') return rosterPatternText(v); // 3.4.0: "24/8" that Sheets turned into a date → show as text again (data untouched)
  var utcYear = Number(Utilities.formatDate(v, 'UTC', 'yyyy'));
  // Time-only serials from Sheets land near 1899/1900
  if (utcYear < 1950 || headerName === 'time') {
    return Utilities.formatDate(v, 'UTC', 'HH:mm');
  }
  if (headerName === 'date' || headerName === 'dueDate' || headerName === 'serviceDate' || headerName === 'startDate' || headerName === 'endDate' || headerName === 'uploadedAt') {
    return Utilities.formatDate(v, 'Pacific/Fiji', 'yyyy-MM-dd');
  }
  return Utilities.formatDate(v, 'Pacific/Fiji', 'yyyy-MM-dd HH:mm:ss');
}

/** 2.10.0: per-request read memo — only switched on inside the read-only getBootstrap (Speed.gs). */
var REQ_MEMO = null;
function sheetToObjects(sheetName) {
  if (REQ_MEMO && REQ_MEMO[sheetName]) {
    return REQ_MEMO[sheetName].map(function (o) { return Object.assign({}, o); });
  }
  var rows = sheetToObjectsRaw(sheetName);
  if (REQ_MEMO) REQ_MEMO[sheetName] = rows.map(function (o) { return Object.assign({}, o); });
  return rows;
}

function sheetToObjectsRaw(sheetName) {
  var sh = getSS().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      var v = sheetCellToValue(values[i][j], headers[j]);
      obj[headers[j]] = v;
      if (v !== '' && v !== null && v !== undefined) empty = false;
    }
    if (!empty) {
      obj._row = i + 1;
      rows.push(obj);
    }
  }
  return rows;
}

/** 3.4.0: a roster-pattern cell Sheets auto-converted to a date → the text that was typed (d/m, or m/d if the sheet locale is US). */
function rosterPatternText(v) {
  var tz = 'Pacific/Fiji';
  try { tz = getSS().getSpreadsheetTimeZone() || tz; } catch (e) {}
  var d = Number(Utilities.formatDate(v, tz, 'd')), m = Number(Utilities.formatDate(v, tz, 'M'));
  var us = false;
  try { us = /^en_US/i.test(String(getSS().getSpreadsheetLocale() || '')); } catch (e2) {}
  return us ? m + '/' + d : d + '/' + m;
}

function appendRow(sheetName, obj, headers) {
  if (sheetName === 'Notifications' && typeof a33FromNotif === 'function') { try { a33FromNotif(obj); } catch (e) {} } // 3.2.0: in-app notification → phone
  var sh = getSS().getSheetByName(sheetName);
  if (headers && headers.length) ensureColumns(sh, headers);
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var sheetHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var useHeaders = sheetHeaders;
  if (!useHeaders.length || (useHeaders.length === 1 && !String(useHeaders[0] || '').trim())) {
    useHeaders = headers || Object.keys(obj || {});
  }
  var textKeys = { date:1, time:1, dueDate:1, serviceDate:1, startDate:1, endDate:1, roster:1 }; // 3.4.0: roster pattern stays plain text
  var row = useHeaders.map(function (h) {
    if (!h) return '';
    var v = obj[h];
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v === undefined || v === null) return '';
    if (textKeys[h] && typeof v === 'string' && v !== '' && v.charAt(0) !== "'") {
      return "'" + v; // force text — avoid Sheets date/time coercion
    }
    return v;
  });
  sh.appendRow(row);
  scInvalidateSheet(sheetName); // 2.10.0 server cache
}

function updateRowById(sheetName, id, patch) {
  var rows = sheetToObjects(sheetName);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) { found = rows[i]; break; }
  }
  if (!found) return null;
  var sh = getSS().getSheetByName(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  // 2.10.0: make sure the row still holds this id (rows can shift if old rows were archived meanwhile)
  var idCol = headers.indexOf('id');
  if (idCol >= 0 && String(sh.getRange(found._row, idCol + 1).getValue()) !== String(id)) {
    var fresh = sheetToObjectsRaw(sheetName);
    found = null;
    for (var fi = 0; fi < fresh.length; fi++) {
      if (String(fresh[fi].id) === String(id)) { found = fresh[fi]; break; }
    }
    if (!found) return null;
  }
  scInvalidateSheet(sheetName); // 2.10.0 server cache
  for (var k in patch) {
    if (!patch.hasOwnProperty(k)) continue;
    var col = headers.indexOf(k);
    if (col >= 0) {
      var v = patch[k];
      if (v === true) v = 'TRUE';
      if (v === false) v = 'FALSE';
      if (k === 'roster' && typeof v === 'string' && v !== '' && v.charAt(0) !== "'") v = "'" + v; // 3.4.0: plain text
      sh.getRange(found._row, col + 1).setValue(v);
    }
  }
  return Object.assign({}, found, patch);
}

function findUserByEmail(email) {
  email = String(email || '').trim().toLowerCase();
  var users = sheetToObjects('Users');
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).trim().toLowerCase() === email) return users[i];
  }
  return null;
}

function truthy(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function nowIso() {
  return formatFiji(getFijiNow());
}

/* ========== PERMISSIONS / FEATURE FLAGS (C38–C39) ========== */

function parsePermissions(raw, legacyRole) {
  var list = [];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    var s = String(raw).trim();
    if (s.charAt(0) === '[') {
      try {
        var arr = JSON.parse(s);
        if (Array.isArray(arr)) list = arr.map(String);
      } catch (e) {}
    } else {
      list = s.split(/[,|]+/).map(function (x) { return String(x).trim(); }).filter(Boolean);
    }
  }
  // legacy single role → permissions
  if (!list.length && legacyRole) {
    var lr = String(legacyRole);
    if (lr === 'kitchen') list = ['chef'];
    else if (lr === 'boat') list = ['boat_manager'];
    else if (ALL_PERMISSIONS.indexOf(lr) >= 0) list = [lr];
    else list = ['staff'];
  }
  if (!list.length) list = ['staff'];
  // dedupe
  var seen = {};
  var out = [];
  list.forEach(function (p) {
    var k = String(p).trim();
    if (!k || seen[k]) return;
    // map legacy kitchen/boat into new keys if present
    if (k === 'kitchen') k = 'chef';
    if (k === 'boat') k = 'boat_manager';
    if (seen[k]) return;
    seen[k] = true;
    out.push(k);
  });
  return out;
}

function permissionsToString(perms) {
  return (perms || []).join(',');
}

function primaryRoleFromPermissions(perms) {
  var order = ['super_admin', 'admin', 'hod', 'assistant_hod', 'chef', 'boat_manager', 'boat_captain', 'staff'];
  for (var i = 0; i < order.length; i++) {
    if (perms.indexOf(order[i]) >= 0) return order[i];
  }
  return 'staff';
}

function userPermissions(u) {
  if (!u) return ['staff'];
  var list = parsePermissions(u.permissions, u.role);
  // 3.0.0: roles column (multi-role list) is merged in; setUserAccess keeps both in step
  if (u.roles) r3ParseRoles(u.roles).forEach(function (r) { if (list.indexOf(r) < 0) list.push(r); });
  if (truthy(u.assistantHod) && list.indexOf('assistant_hod') < 0) list.push('assistant_hod');
  return list;
}

function userHasPermission(u, key) {
  var perms = userPermissions(u);
  if (perms.indexOf('super_admin') >= 0) return true; // super has all
  return perms.indexOf(key) >= 0;
}

function userHasAnyPermission(u, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (userHasPermission(u, keys[i]) || (keys[i] !== 'super_admin' && userPermissions(u).indexOf(keys[i]) >= 0)) {
      // careful: userHasPermission already treats super as all
    }
  }
  var perms = userPermissions(u);
  if (perms.indexOf('super_admin') >= 0) return true;
  for (var j = 0; j < keys.length; j++) {
    if (perms.indexOf(keys[j]) >= 0) return true;
  }
  // legacy role fallback already in parsePermissions
  return false;
}

function isSuperPerm(u) {
  return userPermissions(u).indexOf('super_admin') >= 0;
}

function isAdminPerm(u) {
  var p = userPermissions(u);
  return p.indexOf('super_admin') >= 0 || p.indexOf('admin') >= 0;
}

function isHodPerm(u) {
  var p = userPermissions(u);
  return p.indexOf('hod') >= 0 || p.indexOf('assistant_hod') >= 0 || isAdminPerm(u);
}

/* 3.0.0: stations removed. Admin / superadmin keep their 2.x oversight powers over kitchen and boat. */
function stationsExclusive() { return false; }
function isChefPerm(u) {
  if (!u) return false;
  var p = userPermissions(u);
  return p.indexOf('chef') >= 0 || isAdminPerm(u);
}

function isBoatManagerPerm(u) {
  if (!u) return false;
  var p = userPermissions(u);
  return p.indexOf('boat_manager') >= 0 || isAdminPerm(u);
}

function isBoatCaptainPerm(u) {
  if (!u) return false;
  if (userPermissions(u).indexOf('boat_captain') >= 0) return true;
  return isBoatManagerPerm(u);
}

function requireBoatManagerOrAdmin(p) {
  var u = getRequester(p);
  if (!u) throw new Error('Login required');
  if (isBoatManagerPerm(u)) return u;
  throw new Error('Boat manager / admin required');
}

function canSeeBoatOps(u) {
  if (!u) return false;
  return isBoatManagerPerm(u) || isBoatCaptainPerm(u);
}


function ensureFeatureDefaults() {
  var existing = cachedRows('App Settings');
  var map = {};
  existing.forEach(function (r) { map[String(r.key)] = r; });
  Object.keys(FEATURE_DEFAULTS).forEach(function (k) {
    if (!map[k]) {
      appendRow('App Settings', {
        key: k,
        value: FEATURE_DEFAULTS[k],
        updatedAt: nowIso(),
        updatedBy: 'system'
      }, ['key', 'value', 'updatedAt', 'updatedBy']);
    }
  });
}

function getSetting(key, fallback) {
  var rows = cachedRows('App Settings'); // 2.10.0 cached (invalidated by setSetting)
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) return String(rows[i].value);
  }
  if (FEATURE_DEFAULTS[key] !== undefined) return FEATURE_DEFAULTS[key];
  return fallback === undefined ? '' : String(fallback);
}

function setSetting(key, value, byEmail) {
  scInvalidateSheet('App Settings'); // 2.10.0 flag change → drop cached settings
  var rows = sheetToObjects('App Settings');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) { found = rows[i]; break; }
  }
  if (found) {
    // App Settings may not have id — update by row
    var sh = getSS().getSheetByName('App Settings');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var keyCol = headers.indexOf('key');
    var valCol = headers.indexOf('value');
    var atCol = headers.indexOf('updatedAt');
    var byCol = headers.indexOf('updatedBy');
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][keyCol]) === String(key)) {
        if (valCol >= 0) sh.getRange(r + 1, valCol + 1).setValue(String(value));
        if (atCol >= 0) sh.getRange(r + 1, atCol + 1).setValue(nowIso());
        if (byCol >= 0) sh.getRange(r + 1, byCol + 1).setValue(byEmail || '');
        scInvalidateSheet('App Settings');
        return;
      }
    }
  }
  appendRow('App Settings', {
    key: key,
    value: String(value),
    updatedAt: nowIso(),
    updatedBy: byEmail || ''
  }, ['key', 'value', 'updatedAt', 'updatedBy']);
}

function isFeatureEnabled(key) {
  var v = String(getSetting(key, FEATURE_DEFAULTS[key] || 'false')).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function featureOffMessage(feature) {
  return 'Feature disabled. Ask a superadmin to enable ' + feature + ' in Admin → Settings / Features.';
}

function getAppSettings(p) {
  ensureFeatureDefaults();
  var rows = cachedRows('App Settings');
  var settings = {};
  rows.forEach(function (r) {
    // never return pin hash to non-super in clear — still return presence
    if (String(r.key) === 'superadmin_pin') {
      settings.superadmin_pin_set = !!(r.value && String(r.value).length);
      return;
    }
    settings[String(r.key)] = String(r.value);
  });
  Object.keys(FEATURE_DEFAULTS).forEach(function (k) {
    if (settings[k] === undefined) settings[k] = FEATURE_DEFAULTS[k];
  });
  // 3.0: codes are always emailed (never shown on screen). Mail sender settings (see sendAppMail).
  settings.verification_delivery = 'email';
  Object.keys(MAIL_SETTING_DEFAULTS).forEach(function (k) { if (settings[k] === undefined) settings[k] = MAIL_SETTING_DEFAULTS[k]; });
  settings.brevo_key_set = !!mailBrevoKey(); // the key itself stays in Script Properties (never returned)
  var mt = mealTimes(); Object.keys(mt).forEach(function (k) { settings[k] = mt[k]; }); // 3.0.0 Kitchen Admin meal times
  if (settings.auth_role_token === undefined) settings.auth_role_token = 'true';
  return { success: true, data: { settings: settings, features: {
    feature_live_roster: isFeatureEnabled('feature_live_roster'),
    feature_leave_escalation: isFeatureEnabled('feature_leave_escalation'),
    feature_my_schedule: isFeatureEnabled('feature_my_schedule')
  } } };
}

function setAppSetting(p) {
  // 3.0.0: superadmin role (signed-in) + the superadmin code 2026 (2025 retired; the code alone never grants access)
  var requester;
  try { requester = requireSuperCode(p); } catch (eS) { return { success: false, error: eS.message, needsCode: !!eS.needsCode }; }
  var by = requester.email;
  var key = String(p.key || '').trim();
  if (!key) return { success: false, error: 'key required' };
  if (key.indexOf('feature_') === 0) {
    var val = String(p.value === true || p.value === 'true' || p.value === 1 || p.value === '1' ? 'true' : 'false');
    setSetting(key, val, by);
    return getAppSettings(p);
  }
  if (key === 'superadmin_pin') {
    return { success: false, error: 'Use unlockSuperadminPin to set PIN' };
  }
  var value = String(p.value == null ? '' : p.value).trim();
  if (key === 'verification_delivery') value = 'email'; // codes are never shown on screen
  if (key === 'mail_provider' && ['auto', 'mailapp', 'brevo'].indexOf(value) < 0) return { success: false, error: 'Mail provider must be auto, mailapp or brevo' };
  if ((key === 'mail_from' || key === 'brevo_sender_email' || key === 'mail_reply_to') && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { success: false, error: 'Must be an email address (or blank)' };
  if (key === 'auth_role_token') value = value === 'false' ? 'false' : 'true';
  if (R3_TIME_DEFAULTS[key] !== undefined) { value = r3HHMM(value, ''); if (!value) return { success: false, error: 'Time must be HH:MM (24h)' }; }
  if (key === 'mail_sender_name' || key === 'brevo_sender_name') value = value.substring(0, 60);
  setSetting(key, value, by);
  return getAppSettings(p);
}

/* ========== SUPERADMIN / ALERTS ========== */

/** C66: Superadmin first-access PIN removed — always unlocked via role */
function unlockSuperadminPin(p) {
  var requester = getRequester(p);
  if (!requester || !isSuperPerm(requester)) {
    try { requirePasscode(p, 'super'); } catch (e) {
      return { success: false, error: 'Superadmin permission required' };
    }
  }
  return { success: true, data: { unlocked: true, deprecated: true, message: 'PIN flow removed — role gates access' } };
}

function requireSuperadminPinIfSet(p) {
  // C66: no-op — PIN gate removed
  return;
}


function ensureSuperAdmin() {
  var u = findUserByEmail(SUPERADMIN_EMAIL);
  if (!u) {
    appendRow('Users', {
      id: uid('usr'),
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      firstName: 'IT',
      lastName: 'Admin',
      department: 'IT',
      contact: '',
      role: 'super_admin',
      permissions: 'super_admin,admin',
      roster: '',
      village: '',
      active: true,
      createdAt: nowIso(),
      verified: true
    }, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'permissions', 'roster', 'village', 'active', 'createdAt', 'verified']);
  } else {
    // 3.0.0: repair role / active / verified only when wrong — never reset the password (it was reset on every login before)
    var perms = parsePermissions(u.permissions, u.role);
    var ok = perms.indexOf('super_admin') >= 0 && perms.indexOf('admin') >= 0 && String(u.role) === 'super_admin' && truthy(u.active) && truthy(u.verified);
    if (ok) return;
    if (perms.indexOf('super_admin') < 0) perms.unshift('super_admin');
    if (perms.indexOf('admin') < 0) perms.push('admin');
    updateRowById('Users', u.id, {
      role: 'super_admin',
      permissions: permissionsToString(perms),
      active: true,
      verified: true
    });
  }
}

function seedAlertEmails() {
  var existing = sheetToObjects('Alert Emails');
  if (existing.length > 0) return;
  DEFAULT_ALERT_EMAILS.forEach(function (em, i) {
    appendRow('Alert Emails', {
      email: em,
      label: 'Default ' + (i + 1),
      active: true
    }, ['email', 'label', 'active']);
  });
}


/* ========== SAMPLE REMINDERS / VILLAGE BOAT (C54) ========== */

var SAMPLE_REMINDER_ID = 'rem_seed_high_occ_sep2026';
var SAMPLE_REMINDER_TITLE = 'High occupancy — weeks ending 20 & 27 Sep';

var VILLAGE_BOAT_SLOTS = [
  { time: '05:00', route: 'Soso → PC', notes: 'Soso Express — for 6:00 AM shift. Arrive a few minutes early.' },
  { time: '06:30', route: 'PC → Soso', notes: 'Soso Express — pick up 8:00 AM shift. Arrive a few minutes early.' },
  { time: '12:30', route: 'PC → Soso', notes: 'Soso Express — pick up 2:00 PM shift. Arrive a few minutes early.' },
  { time: '17:00', route: 'PC → Soso', notes: 'Soso Express — staff drop-off. Arrive a few minutes early.' },
  { time: '23:00', route: 'PC → Soso', notes: 'Soso Express — final staff drop-off. Arrive a few minutes early.' }
];

/**
 * Idempotent: skip if same title or fixed id marker already exists.
 * Returns { added: 0|1, skipped: boolean, reminder?: object }
 */
function normalizeDateKey(d) {
  var m = String(d || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(d || '');
}

function normalizeTimeKey(t) {
  t = String(t || '').trim();
  var m = t.match(/^(\d{1,2}):(\d{2})/);
  if (m && t.indexOf('1899') < 0 && t.length <= 8) {
    return (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2];
  }
  m = t.match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  return m ? m[1] + ':' + m[2] : t;
}

function sampleReminderBody() {
  return [
    'High occupancy continues across weeks ending 20 Sep & 27 Sep.',
    '',
    'HODs: build rosters for these numbers; submit completed rosters to HR by Friday 8:00 AM.',
    '',
    'Swim groups: first checks out Tue 15 Sep, second checks in same day. Daily room turnover very high during transition.',
    '',
    'Look after wellbeing: eat well, rest, supportive teamwork.'
  ].join('\n');
}

function seedSampleReminders() {
  var body = sampleReminderBody();
  var rows = sheetToObjects('Reminders');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.id) === SAMPLE_REMINDER_ID || String(r.title) === SAMPLE_REMINDER_TITLE) {
      var needsRepair = String(r.createdAt) === 'high' || r.priority === true || r.priority === 'TRUE' ||
        String(r.important) === 'all' || String(r.priority) !== 'high';
      if (needsRepair) {
        var fixed = updateRowById('Reminders', r.id, {
          title: SAMPLE_REMINDER_TITLE,
          body: body,
          dueDate: '2026-09-27',
          done: false,
          priority: 'high',
          important: true,
          audience: 'all',
          createdAt: (String(r.createdAt).indexOf('FJT') >= 0 ? r.createdAt : nowIso())
        });
        return { added: 0, repaired: true, skipped: false, reminder: fixed || r };
      }
      return { added: 0, skipped: true, repaired: false, reminder: r };
    }
  }
  var row = {
    id: SAMPLE_REMINDER_ID,
    userEmail: '',
    title: SAMPLE_REMINDER_TITLE,
    body: body,
    dueDate: '2026-09-27',
    done: false,
    priority: 'high',
    important: true,
    audience: 'all',
    createdAt: nowIso()
  };
  appendRow('Reminders', row, ['id', 'userEmail', 'title', 'body', 'dueDate', 'done', 'priority', 'important', 'audience', 'createdAt']);
  return { added: 1, skipped: false, repaired: false, reminder: row };
}

/**
 * Soft-deactivate misaligned Soso Express seed rows from positional append bug,
 * then seed today..+13 for each slot (idempotent on date+time+route active).
 */
function seedVillageBoatRuns() {
  var deactivated = deactivateBrokenSeedBoatRuns();
  var existing = sheetToObjects('Boat Runs');
  var headers = ['id', 'date', 'time', 'route', 'capacity', 'notes', 'fullNotification', 'active', 'createdBy', 'createdAt'];
  var added = 0;
  var skipped = 0;
  var skippedDatesWithRuns = 0;
  var today = getFijiNow();
  for (var d = 0; d < 14; d++) {
    var date = fijiDateString(addFijiDays(today, d));
    // C97: never seed a date that already has any active run (avoids recreating duplicates on re-init)
    var dateHasActive = false;
    for (var ei = 0; ei < existing.length; ei++) {
      var er = existing[ei];
      var erActive = truthy(er.active) || er.active === '' || er.active === undefined;
      if (erActive && normalizeDateKey(er.date) === date) { dateHasActive = true; break; }
    }
    if (dateHasActive) {
      skippedDatesWithRuns++;
      skipped += VILLAGE_BOAT_SLOTS.length;
      continue;
    }
    for (var s = 0; s < VILLAGE_BOAT_SLOTS.length; s++) {
      var slot = VILLAGE_BOAT_SLOTS[s];
      var found = false;
      for (var i = 0; i < existing.length; i++) {
        var r = existing[i];
        var sameDate = normalizeDateKey(r.date) === date;
        var sameTime = normalizeTimeKey(r.time) === slot.time;
        var sameRoute = String(r.route) === slot.route;
        var active = truthy(r.active) || r.active === '' || r.active === undefined;
        if (sameDate && sameTime && sameRoute && active) { found = true; break; }
      }
      if (found) { skipped++; continue; }
      var row = {
        id: uid('run'),
        date: date,
        time: slot.time,
        route: slot.route,
        capacity: 20,
        notes: slot.notes,
        fullNotification: false,
        active: true,
        createdBy: 'seed',
        createdAt: nowIso()
      };
      appendRow('Boat Runs', row, headers);
      existing.push(row);
      added++;
    }
  }
  return {
    added: added,
    skipped: skipped,
    skippedDatesWithRuns: skippedDatesWithRuns,
    deactivated: deactivated,
    days: 14,
    slotsPerDay: VILLAGE_BOAT_SLOTS.length
  };
}

function deactivateBrokenSeedBoatRuns() {
  var sh = getSS().getSheetByName('Boat Runs');
  if (!sh) return 0;
  var rows = sheetToObjects('Boat Runs');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var activeCol = headers.indexOf('active') + 1;
  if (activeCol < 1) return 0;
  var deactivated = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var notes = String(r.notes || '');
    var misaligned = String(r.createdAt) === 'seed' || r.createdBy === true || r.createdBy === 'TRUE' || r.createdBy === 'true';
    // Positional-append bug left createdAt='seed' / createdBy=TRUE on Soso Express rows
    if (misaligned && notes.indexOf('Soso Express') >= 0) {
      if (truthy(r.active) || r.active === '' || r.active === undefined) {
        sh.getRange(r._row, activeCol).setValue(false);
        deactivated++;
      }
      r.active = false;
    }
  }
  if (deactivated) scInvalidateSheet('Boat Runs'); // 2.10.0
  return deactivated;
}

/* ========== AUTH ========== */

function publicUser(u) {
  if (!u) return null;
  var perms = parsePermissions(u.permissions, u.role);
  var role = u.role || primaryRoleFromPermissions(perms);
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    preferredName: u.preferredName || '',
    department: u.department || '',
    contact: u.contact || '',
    role: role,
    permissions: perms,
    permissionsRaw: permissionsToString(perms),
    roster: u.roster || '',
    village: u.village || '',
    active: truthy(u.active),
    verified: truthy(u.verified),
    photoUrl: u.photoUrl || '',
    needsProfile: !(u.firstName && u.lastName && u.department),
    // 3.0
    role3: v3Role(u),
    assistantHod: isAsstHod(u),
    deptStatus: deptStatusOf(u),
    deptApproved: deptApproved(u),
    // 3.0.0 role model: roles list + the More-tab buttons they add
    roles: userRoles(u),
    roleButtons: roleButtons(userRoles(u)),
    isSuper: isSuperPerm(u)
  };
}

/** Prefer short preferredName when set (kitchen/boat lists + greetings). */
function displayUserName(u) {
  if (!u) return '';
  var pref = String(u.preferredName || '').trim();
  if (pref) return pref;
  return ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
}

function login(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var password = String(p.password || '');
  if (!email || !password) return { success: false, error: 'Email and password required' };

  if (email === SUPERADMIN_EMAIL) ensureSuperAdmin();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'Invalid email or password' };
  if (String(u.password) !== password) return { success: false, error: 'Invalid email or password' };

  var isSuper = email === SUPERADMIN_EMAIL;

  if (!isSuper && !truthy(u.verified) && !truthy(u.active)) {
    return {
      success: false,
      error: 'Email not verified',
      needsVerification: true,
      email: email
    };
  }
  if (!isSuper && !truthy(u.active)) {
    return { success: false, error: 'Account inactive. Contact admin.' };
  }
  // 3.4.0: accounts registered by a HOD / admin sign in once with a one-time password, then choose their own
  if (!isSuper && truthy(u.mustChangePassword)) {
    if (typeof s34TempExpired === 'function' && s34TempExpired(u)) return { success: false, error: 'This one-time password has expired — ask your HOD to register you again.' };
    return { success: false, needsPasswordChange: true, email: email, error: 'Choose your own password to finish signing in' };
  }

  return {
    success: true,
    data: {
      user: publicUser(u),
      token: makeSessionToken(u) // 3.0.0 signed session token (role pages need it)
    }
  };
}

/** Request-scoped identity (set by bindRequestIdentity for client requests; null for triggers / editor runs). */
var R3_AUTH = null;
var R3_PUBLIC_ACTIONS = { login: 1, register: 1, verifyEmail: 1, requestVerification: 1, requestPasswordReset: 1, resetPassword: 1, getVersion: 1, health: 1, getDepartments: 1, setFirstPassword: 1 }; // 3.4.0 first sign-in with a one-time password // 3.4.0 department list (sign-up form)
/**
 * 3.0.0: a valid signed session token (login) binds the requester. Without a token the claimed requesterEmail is used
 * as in 2.x, but role accounts then act as plain staff (role / admin actions answer needsSignIn). App Setting
 * auth_role_token=false switches that check off in an emergency.
 */
function bindRequestIdentity(action, p) {
  Object.keys(p).forEach(function (k) { if (k.charAt(0) === '_') delete p[k]; });
  delete p.actorName;
  var tok = String(p.sessionToken || '');
  delete p.sessionToken;
  if (R3_PUBLIC_ACTIONS[action]) { R3_AUTH = null; return null; }
  var claimed = String(p.requesterEmail || p.email || '').trim().toLowerCase();
  if (/^v3\./.test(tok)) {
    var tu = verifySessionToken(tok);
    if (!tu) { R3_AUTH = null; return { error: 'Your session has expired — please sign in again.', sessionExpired: true }; }
    var em = String(tu.email).toLowerCase();
    p.requesterEmail = em;
    R3_AUTH = { email: em, token: true };
  } else {
    if (claimed) p.requesterEmail = claimed;
    var cu = claimed ? findUserByEmail(claimed) : null;
    R3_AUTH = { email: claimed, token: false, staffView: !!(cu && roleTokenRequired() && hasAnyRole(cu)) };
  }
  // plain staff can only order / book / cancel for themselves
  var me = getRequester(p);
  if (me && p.userEmail && String(p.userEmail).toLowerCase() !== String(me.email).toLowerCase() &&
      !(isAdminPerm(me) || isDeptLead(me) || isChefPerm(me) || isBoatCaptainPerm(me))) {
    p.userEmail = String(me.email).toLowerCase();
  }
  return null;
}


function register(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var password = String(p.password || '');
  var firstName = String(p.firstName || '').trim();
  var lastName = String(p.lastName || '').trim();
  var department = String(p.department || '').trim();
  if (!email || !password) return { success: false, error: 'Email and password required' };
  if (!firstName || !lastName) return { success: false, error: 'First and last name required (must match department roster — no nicknames)' };
  if (!department) return { success: false, error: 'Department is required' };

  if (findUserByEmail(email)) {
    return { success: false, error: 'Account already exists — sign in instead' };
  }

  var villageVal = normalizeStaffLocation(p.village);
  // C30/C59: registration ALWAYS creates basic staff — ignore any client-supplied role
  // C59: no @pcr.com pending gate — verify email then active staff
  var photoUrl = String(p.photoUrl || '');
  if (photoUrl.length > 45000) photoUrl = ''; // Sheets cell limit safety; client keeps full in localStorage
  var row = {
    id: uid('usr'),
    email: email,
    password: password,
    firstName: firstName,
    lastName: lastName,
    department: department,
    contact: p.contact || '',
    role: 'staff',
    permissions: 'staff',
    roster: p.roster || p.rosterPattern || '',
    village: villageVal,
    active: false,
    createdAt: nowIso(),
    verified: false,
    photoUrl: photoUrl,
    deptStatus: 'approved' // 3.0.0: no department join step (item 12 not in this release)
  };
  appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'permissions', 'roster', 'village', 'active', 'createdAt', 'verified', 'photoUrl', 'deptStatus']);
  var vr = requestVerification({ email: email });
  var emailed = !!(vr && vr.success && vr.data && vr.data.emailed);
  return { success: true, data: {
    needsVerification: true,
    email: email,
    message: emailed ? 'Check your email (' + email + ') for a 6-digit verification code' : 'Account created, but the code email could not be sent — tap "Resend code" or ask an admin',
    emailed: emailed,
    delivery: 'email'
  } };
}

function normalizeStaffLocation(v) {
  if (v === undefined || v === null || v === '') return '';
  var s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'village') return 'Village';
  if (s === 'false' || s === 'no' || s === 'mainland' || s === 'resort') return 'Mainland';
  if (String(v) === 'Village' || String(v) === 'Mainland') return String(v);
  return String(v);
}

/** 3.0: verification / reset codes are ALWAYS emailed (never returned to the phone). */
function verificationDelivery() { return 'email'; }

var MAIL_SETTING_DEFAULTS = { mail_provider: 'auto', mail_from: '', mail_sender_name: 'PCR Staff App', brevo_sender_email: '', brevo_sender_name: 'PCR Staff App', mail_reply_to: 'it@paradisecoveresortfiji.com' };
function mailBrevoKey() {
  try { return PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY') || ''; } catch (e) { return ''; }
}
/**
 * Every app email goes through here. kind 'code' = verification / reset code (always to the registered address);
 * anything else = notifications (leave escalation, alerts, reminders ...).
 * Provider (App Setting mail_provider):
 *   mailapp (default) — MailApp from the account that runs the script; mail_from (optional) = a Gmail "Send mail as"
 *                       alias of that account, sent via GmailApp (needs the https://mail.google.com/ scope; falls back).
 *   brevo             — Brevo transactional API (UrlFetchApp). Key in Script Property BREVO_API_KEY, sender in
 *                       brevo_sender_email / brevo_sender_name (the sender must be verified in Brevo). Falls back to MailApp.
 * Test backends set Script Properties MAIL_REDIRECT_TO (all non-code mail goes there) and MAIL_SUBJECT_PREFIX ("[TEST]").
 * Returns { sent, via, error, warning }.
 */
function sendAppMail(to, subject, body, kind) {
  var props = null;
  try { props = PropertiesService.getScriptProperties(); } catch (eP) {}
  var redirect = props ? String(props.getProperty('MAIL_REDIRECT_TO') || '').trim() : '';
  var prefix = props ? String(props.getProperty('MAIL_SUBJECT_PREFIX') || '').trim() : '';
  var list = (Array.isArray(to) ? to : String(to || '').split(',')).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  if (!list.length) return { sent: false, error: 'no recipient' };
  if (redirect && kind !== 'code') {
    body = '[Test backend — originally to: ' + list.join(', ') + ']\n\n' + body;
    list = [redirect];
  }
  if (prefix) subject = prefix + ' ' + subject;
  var toStr = list.join(',');
  // 3.0.0: provider = App Setting mail_provider: auto (default: Brevo when Script Property BREVO_API_KEY is set, else
  // MailApp) | brevo | mailapp. Brevo sender: Script Properties BREVO_SENDER_EMAIL / BREVO_SENDER_NAME (or settings).
  var provider = String(getSetting('mail_provider', 'auto') || 'auto').toLowerCase();
  var name = String(getSetting('mail_sender_name', 'PCR Staff App') || 'PCR Staff App');
  var replyTo = String(getSetting('mail_reply_to', 'it@paradisecoveresortfiji.com') || '').trim();
  var warn = '';
  var key = mailBrevoKey();
  if (provider === 'brevo' || (provider === 'auto' && key)) {
    var sender = String((props && (props.getProperty('BREVO_SENDER_EMAIL') || props.getProperty('BREVO_SENDER'))) || getSetting('brevo_sender_email', '') || 'it@paradisecoveresortfiji.com').trim();
    var sName = String((props && props.getProperty('BREVO_SENDER_NAME')) || getSetting('brevo_sender_name', name) || name);
    if (key && sender) {
      try {
        var payload = { sender: { email: sender, name: sName }, to: list.map(function (e) { return { email: e }; }), subject: subject, textContent: body };
        if (replyTo) payload.replyTo = { email: replyTo };
        var res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { 'api-key': key, accept: 'application/json' },
          payload: JSON.stringify(payload)
        });
        var code = res.getResponseCode();
        if (code >= 200 && code < 300) return { sent: true, via: 'brevo', sender: sName + ' <' + sender + '>' };
        warn = 'Brevo HTTP ' + code + ': ' + String(res.getContentText()).substring(0, 200) + ' — sent with MailApp instead';
      } catch (eB) { warn = 'Brevo failed (' + String(eB.message || eB) + ') — sent with MailApp instead'; }
    } else {
      warn = 'Brevo selected but Script Property BREVO_API_KEY is missing — sent with MailApp instead';
    }
    try { console.warn('sendAppMail: ' + warn); if (props) props.setProperty('MAIL_LAST_WARNING', nowIso() + ' ' + warn); } catch (eW) {}
  }
  var from = String(getSetting('mail_from', '') || '').trim();
  if (from && provider === 'mailapp') {
    try {
      GmailApp.sendEmail(toStr, subject, body, { from: from, name: name, replyTo: replyTo || undefined });
      return { sent: true, via: 'gmail alias', sender: name + ' <' + from + '>' };
    } catch (eG) { warn = 'mail_from ' + from + ' failed (' + String(eG.message || eG) + '); sent from the script account instead'; }
  }
  try {
    var opts = { to: toStr, subject: subject, body: body, name: name };
    if (replyTo) opts.replyTo = replyTo;
    MailApp.sendEmail(opts);
    return { sent: true, via: 'mailapp', sender: name + ' (script owner account)', warning: warn || undefined };
  } catch (eM) {
    return { sent: false, error: String(eM.message || eM), warning: warn || undefined };
  }
}
function issueEmailCode(email, purpose) {
  var thr = codeThrottle(email); // 3.0.0 item 3: 1 code / minute, 5 / hour per email
  if (thr) return { success: false, error: thr, throttled: true };
  var code = String(Math.floor(100000 + Math.random() * 900000));
  var expires = new Date(Date.now() + 30 * 60 * 1000);
  appendRow('Verification Codes', { email: email, code: code, expiresAt: expires.toISOString(), used: false, purpose: purpose },
    ['email', 'code', 'expiresAt', 'used', 'purpose']);
  var subject = purpose === 'reset' ? 'PCR Staff App — Password Reset Code' : 'PCR Staff App — Verification Code';
  var body = 'Bula,\n\nYour Paradise Cove Resort staff ' + (purpose === 'reset' ? 'password reset' : 'verification') + ' code is: ' + code +
    '\n\nIt is valid for 30 minutes. If you did not ask for this code, you can ignore this email.\n\n— PCR Staff App';
  var m = sendAppMail(email, subject, body, 'code');
  if (!m.sent) return { success: false, error: 'Could not send the code email. Try again later or ask an admin to help.', mailError: m.error };
  return { success: true, data: { emailed: true, delivery: 'email', expiresInMin: 30, sentTo: email,
    message: (purpose === 'reset' ? 'Reset code' : 'Verification code') + ' sent to ' + email + ' — check your inbox (and spam folder)' } };
}

function requestVerification(p) {
  var email = String(p.email || '').trim().toLowerCase();
  if (!email) return { success: false, error: 'Email required' };
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User not found' };
  if (truthy(u.verified)) return { success: true, data: { emailed: false, alreadyVerified: true, message: 'This email is already verified — sign in' } };
  return issueEmailCode(email, 'verify');
}

function verifyEmail(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var code = String(p.code || '').trim();
  if (!email || !code) return { success: false, error: 'Email and code required' };

  if (codeLocked(email)) return { success: false, error: 'Too many wrong codes — this email is locked for 30 minutes.' };
  // 3.0: only a 'verify' code can verify an account (a password-reset code cannot)
  var match = findUnusedCode(email, code, 'verify');
  if (!match) { codeWrong(email); return { success: false, error: 'Invalid or expired code' }; }
  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    return { success: false, error: 'Code expired' };
  }
  markCodeUsed(match);

  var u = findUserByEmail(email);
  if (u) updateRowById('Users', u.id, { verified: true, active: true });
  var fresh = findUserByEmail(email);
  return { success: true, data: { verified: true, user: publicUser(fresh), token: fresh ? makeSessionToken(fresh) : '' } };
}

function findUnusedCode(email, code, purpose) {
  var rows = sheetToObjects('Verification Codes');
  var match = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    if (String(row.email).toLowerCase() !== email) continue;
    if (String(row.code) !== code) continue;
    if (truthy(row.used)) continue;
    var rowPurpose = String(row.purpose || 'verify').toLowerCase();
    if (purpose && rowPurpose !== String(purpose).toLowerCase()) continue;
    match = row;
    break;
  }
  return match;
}

function markCodeUsed(match) {
  var sh = getSS().getSheetByName('Verification Codes');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var usedCol = headers.indexOf('used');
  if (usedCol >= 0) sh.getRange(match._row, usedCol + 1).setValue('TRUE');
}

/** C59: send reset code only to existing Users emails */
function requestPasswordReset(p) {
  var email = String(p.email || '').trim().toLowerCase();
  if (!email) return { success: false, error: 'Email required' };
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'No account found for that email' };
  if (!truthy(u.active) && !truthy(u.verified)) {
    return { success: false, error: 'Account not active. Verify email or contact admin.' };
  }
  return issueEmailCode(email, 'reset');
}

function resetPassword(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var code = String(p.code || '').trim();
  var newPassword = String(p.newPassword || p.password || '');
  if (!email || !code || !newPassword) return { success: false, error: 'Email, code and new password required' };
  if (newPassword.length < 4) return { success: false, error: 'Password too short' };
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'No account found for that email' };
  if (codeLocked(email)) return { success: false, error: 'Too many wrong codes — this email is locked for 30 minutes.' };
  var match = findUnusedCode(email, code, 'reset');
  if (!match) { codeWrong(email); return { success: false, error: 'Invalid or expired code' }; }
  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    return { success: false, error: 'Code expired' };
  }
  markCodeUsed(match);
  updateRowById('Users', u.id, { password: newPassword });
  return { success: true, data: { message: 'Password updated — sign in with your new password', email: email } };
}

/** C59: soft-deactivate own account (active=false) for audit */
function deactivateAccount(p) {
  var email = String(p.userEmail || p.requesterEmail || p.email || '').trim().toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User not found' };
  var requester = getRequester(p);
  var self = requester && String(requester.email).toLowerCase() === email;
  if (!self && !(requester && isAdminPerm(requester))) {
    return { success: false, error: 'Not authorized' };
  }
  if (email === SUPERADMIN_EMAIL) return { success: false, error: 'Cannot deactivate superadmin' };
  updateRowById('Users', u.id, { active: false });
  return { success: true, data: { deactivated: email, active: false } };
}

/**
 * 3.0.0: role gates only. The old codes no longer grant anything on their own (2025 retired). Sensitive superadmin
 * actions additionally need the superadmin code 2026 — see requireSuperCode (Release3.gs).
 * level: 'admin' (admin / chef / HOD roles) or 'super'. Returns 'super' | 'admin'.
 */
function requirePasscode(p, level) {
  level = level || 'admin';
  var requester = getRequester(p);
  if (requester) {
    if (level === 'super') {
      if (isSuperPerm(requester)) return 'super';
    } else if (isAdminPerm(requester) || isChefPerm(requester) || isHodPerm(requester)) {
      return isSuperPerm(requester) ? 'super' : 'admin';
    }
  }
  throw new Error(level === 'super' ? 'Superadmin permission required' : 'Admin / chef / HOD permission required');
}
function canManageUsers(requester) {
  if (!requester) return false;
  return isAdminPerm(requester) || isHodPerm(requester);
}

function canAssignPermissions(requester) {
  return requester && isAdminPerm(requester);
}

function isPrivilegedRole(role) {
  return role === 'super_admin' || role === 'admin' || role === 'hod' || role === 'assistant_hod' || role === 'kitchen' || role === 'chef';
}

function requireKitchenOrAdmin(p) {
  var u = getRequester(p);
  if (!u) throw new Error('Login required');
  if (isChefPerm(u) || isHodPerm(u)) return u;
  try { requirePasscode(p, 'admin'); return u; } catch (e) {
    throw new Error('Kitchen access requires chef/admin permission');
  }
}

function canAccessAdminTab(u) {
  if (!u) return false;
  var p = userPermissions(u);
  return p.indexOf('super_admin') >= 0 || p.indexOf('admin') >= 0 ||
    p.indexOf('boat_manager') >= 0 || p.indexOf('chef') >= 0;
}

/** The caller (3.0.0): the session-token user; without a token a role account counts as plain staff (see Release3.gs). */
function getRequester(p) {
  var email = String((p && (p.requesterEmail || p.email)) || '').trim().toLowerCase();
  if (!email) return null;
  var u = findUserByEmail(email);
  if (u && R3_AUTH && !R3_AUTH.token && R3_AUTH.staffView && email === R3_AUTH.email) return staffView(u);
  return u;
}

/* ========== USERS ========== */

function getUsers(p) {
  var requester = getRequester(p);
  // 3.0: the user list is no longer public — admin sees all, HOD / assistant HOD see their department.
  if (!requester || !(isAdminPerm(requester) || isDeptLead(requester))) {
    return { success: false, error: 'Admin or department HOD required' };
  }
  if (!isAdminPerm(requester)) p.department = requester.department;
  var users = sheetToObjects('Users').map(function (u) { var o = v3UserOut(u); return o; });
  // HOD: limit to their department for edit context (still return all active for directory unless filtered)
  var filterDept = p.department || '';
  var filterRole = p.role || '';
  var q = String(p.search || '').toLowerCase();
  var activeOnly = p.activeOnly !== 'false' && p.activeOnly !== false;

  var list = users.filter(function (u) {
    if (activeOnly && !u.active) return false;
    if (filterDept && u.department !== filterDept) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (q) {
      var hay = (u.email + ' ' + u.firstName + ' ' + u.lastName + ' ' + u.department + ' ' + u.contact).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  return {
    success: true,
    data: {
      users: list,
      total: list.length,
      roleCounts: isAdminPerm(requester) ? v3RoleCounts() : undefined, // 3.0: role counts in Users & roles (no seat limits)
      fijiNow: formatFiji(getFijiNow()),
      version: APP_VERSION
    }
  };
}

function addUser(p) {
  var requester = getRequester(p);
  if (!canManageUsers(requester) && String(p.passcode || '') !== SUPER_PASS && String(p.passcode || '') !== ADMIN_PASS) {
    // allow self-register style add with passcode OR admin
  }
  if (requester && (requester.role === 'admin' || requester.role === 'super_admin' || requester.role === 'hod')) {
    requirePasscode(p);
  } else if (!requester) {
    requirePasscode(p);
  } else {
    requirePasscode(p);
  }

  var email = String(p.email || '').trim().toLowerCase();
  if (!email || !p.password) return { success: false, error: 'Email and password required' };
  if (findUserByEmail(email)) return { success: false, error: 'User already exists' };

  if (requester && isHodPerm(requester) && !isAdminPerm(requester)) {
    p.department = requester.department;
    if (p.role && p.role !== 'staff' && p.role !== 'kitchen' && p.role !== 'chef' && p.role !== 'boat' && p.role !== 'boat_manager' && p.role !== 'boat_captain') {
      return { success: false, error: 'HOD can only create staff/kitchen/boat in their department' };
    }
  }

  var isPcr = email.indexOf('@pcr.com') !== -1;
  var role = p.role || 'staff';
  if (ROLES.indexOf(role) === -1) role = 'staff';
  var perms = parsePermissions(p.permissions, role);
  if (requester && !isSuperPerm(requester) && perms.indexOf('super_admin') >= 0) {
    return { success: false, error: 'Only super_admin can create super_admin' };
  }
  // Only admin/super can assign non-staff permissions
  if (requester && !isAdminPerm(requester)) {
    perms = ['staff'];
    role = 'staff';
  }
  role = primaryRoleFromPermissions(perms);

  var active = p.active === true || p.active === 'true' || p.active === 'TRUE';
  var verified = true;
  if (isPcr && email !== SUPERADMIN_EMAIL) {
    if (p.active === undefined) active = false;
    verified = false;
  }
  if (p.active === true || p.active === 'true') active = true;

  var row = {
    id: uid('usr'),
    email: email,
    password: String(p.password),
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    department: p.department || '',
    contact: p.contact || '',
    role: role,
    permissions: permissionsToString(perms),
    roster: p.roster || '',
    village: p.village || '',
    active: active,
    createdAt: nowIso(),
    verified: verified || !isPcr,
    deptStatus: 'approved' // 3.0: added by admin / HOD = already in the department
  };
  appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'permissions', 'roster', 'village', 'active', 'createdAt', 'verified', 'deptStatus']);
  return { success: true, data: { user: publicUser(row) } };
}

function updateUser(p) {
  var requester = getRequester(p);
  var targetEmail = String(p.targetEmail || p.email || '').trim().toLowerCase();
  var u = findUserByEmail(targetEmail);
  if (!u) return { success: false, error: 'User not found' };

  var selfUpdate = requester && String(requester.email).toLowerCase() === targetEmail;
  var adminUpdate = requester && canManageUsers(requester);

  if (!selfUpdate && !adminUpdate) {
    return { success: false, error: 'Not authorized' };
  }

  if (adminUpdate && !selfUpdate) {
    requirePasscode(p);
    if (isHodPerm(requester) && !isAdminPerm(requester)) {
      if (String(u.department) !== String(requester.department)) {
        return { success: false, error: 'HOD can only edit users in their department' };
      }
    }
  }

  var patch = {};
  // C59: staff cannot change firstName, lastName, department (read-only on profile)
  if (selfUpdate && !adminUpdate) {
    ['contact', 'roster', 'village', 'preferredName'].forEach(function (k) {
      if (p[k] !== undefined) patch[k] = k === 'village' ? normalizeStaffLocation(p[k]) : (k === 'preferredName' ? String(p[k] || '').trim().slice(0, 40) : p[k]);
    });
    if (p.firstName !== undefined || p.lastName !== undefined || p.department !== undefined) {
      // silently ignore locked fields (UI should be read-only)
    }
  } else {
    ['firstName', 'lastName', 'preferredName', 'contact', 'department', 'roster', 'village'].forEach(function (k) {
      if (k === 'department' && !isAdminPerm(requester)) return; // 3.0: only admin changes a department after registration
      if (p[k] !== undefined) {
        if (k === 'village') patch[k] = normalizeStaffLocation(p[k]);
        else if (k === 'preferredName') patch[k] = String(p[k] || '').trim().slice(0, 40);
        else patch[k] = p[k];
      }
    });
  }
  if (selfUpdate && p.photoUrl !== undefined) {
    var ph = String(p.photoUrl || '');
    if (ph.length > 45000) ph = '';
    patch.photoUrl = ph;
  }
  if (selfUpdate && !adminUpdate && (p.role !== undefined || p.permissions !== undefined)) {
    return { success: false, error: 'Staff cannot change role/permissions' };
  }

  if (adminUpdate && !selfUpdate && (p.permissions !== undefined || p.role !== undefined || p.roles !== undefined)) {
    // 3.0.0: role changes go through setUserAccess (roles list + permission rules)
    var ra = setUserAccess(Object.assign({}, p, { targetEmail: targetEmail, roles: p.roles !== undefined ? p.roles : (p.permissions !== undefined ? p.permissions : p.role) }));
    if (!ra.success) return ra;
    delete p.permissions; delete p.role; delete p.roles;
  }
  if (adminUpdate && !selfUpdate) {
    // C39: permissions multi-select (admin/super only)
    if (p.permissions !== undefined) {
      if (!canAssignPermissions(requester)) {
        return { success: false, error: 'Only admin/superadmin can assign permissions' };
      }
      var newPerms = parsePermissions(p.permissions, p.role || u.role);
      var oldPerms = userPermissions(u);
      var grantingSuper = newPerms.indexOf('super_admin') >= 0 && oldPerms.indexOf('super_admin') < 0;
      var revokingSuper = newPerms.indexOf('super_admin') < 0 && oldPerms.indexOf('super_admin') >= 0;
      if ((grantingSuper || revokingSuper) && !isSuperPerm(requester)) {
        return { success: false, error: 'Only superadmin can grant/revoke super_admin' };
      }
      if (grantingSuper || revokingSuper || newPerms.indexOf('admin') >= 0) {
        requirePasscode(p, 'super');
      }
      patch.permissions = permissionsToString(newPerms);
      patch.role = primaryRoleFromPermissions(newPerms);
    } else if (p.role !== undefined) {
      if (isHodPerm(requester) && !isAdminPerm(requester) && ['super_admin', 'admin', 'hod', 'assistant_hod'].indexOf(p.role) >= 0) {
        return { success: false, error: 'HOD cannot assign that role' };
      }
      if (!isSuperPerm(requester) && p.role === 'super_admin') {
        return { success: false, error: 'Only super_admin can assign super_admin' };
      }
      if (['super_admin', 'admin', 'hod'].indexOf(String(p.role)) >= 0 && String(u.role) !== String(p.role)) {
        requirePasscode(p, 'super');
      }
      patch.role = p.role;
      // keep permissions in sync with primary role when only role sent
      var synced = parsePermissions(u.permissions, p.role);
      if (synced.indexOf(p.role) < 0 && p.role) {
        if (p.role === 'kitchen') synced = ['chef'];
        else if (p.role === 'boat') synced = ['boat_manager'];
        else synced = [p.role];
      }
      patch.permissions = permissionsToString(parsePermissions(synced.join(','), p.role));
    }
    if (p.active !== undefined) patch.active = p.active === true || p.active === 'true' || p.active === 'TRUE';
    if (p.password) patch.password = p.password;
  } else if (selfUpdate && p.password) {
    patch.password = p.password;
  }

  var updated = updateRowById('Users', u.id, patch);
  return { success: true, data: { user: publicUser(findUserByEmail(targetEmail)) } };
}

function importUsersCSV(p) {
  requirePasscode(p);
  var requester = getRequester(p);
  if (requester && !canManageUsers(requester) && requester.role !== 'super_admin') {
    // passcode alone ok for bootstrap
  }
  var csv = String(p.csv || p.text || '');
  if (!csv.trim()) return { success: false, error: 'CSV empty' };

  var lines = csv.split(/\r?\n/).filter(function (l) { return l.trim(); });
  var imported = [];
  var skipped = [];

  lines.forEach(function (line, idx) {
    if (idx === 0 && /email/i.test(line) && /password/i.test(line)) return; // header
    var parts = parseCsvLine(line);
    // email,password,firstName,lastName,department,contact
    var email = String(parts[0] || '').trim().toLowerCase();
    var password = String(parts[1] || '').trim();
    if (!email || !password) {
      skipped.push({ line: idx + 1, reason: 'missing email/password' });
      return;
    }
    if (findUserByEmail(email)) {
      skipped.push({ line: idx + 1, email: email, reason: 'exists' });
      return;
    }
    var isPcr = email.indexOf('@pcr.com') !== -1;
    var row = {
      id: uid('usr'),
      email: email,
      password: password,
      firstName: parts[2] || '',
      lastName: parts[3] || '',
      department: parts[4] || '',
      contact: parts[5] || '',
      role: 'staff',
      roster: '',
      village: '',
      active: true, // CSV import: can login immediately
      createdAt: nowIso(),
      verified: true,
      deptStatus: 'approved'
    };
    appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'roster', 'village', 'active', 'createdAt', 'verified', 'deptStatus']);
    imported.push(publicUser(row));
  });

  return { success: true, data: { imported: imported.length, skipped: skipped, users: imported } };
}

function parseCsvLine(line) {
  var result = [];
  var cur = '';
  var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line.charAt(i);
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

function getPendingApprovals(p) {
  requirePasscode(p);
  var users = sheetToObjects('Users').filter(function (u) {
    var email = String(u.email).toLowerCase();
    return email.indexOf('@pcr.com') !== -1 && !truthy(u.active);
  }).map(publicUser);
  return { success: true, data: { users: users } };
}

function approveUser(p) {
  requirePasscode(p);
  var requester = getRequester(p);
  if (requester && !(requester.role === 'super_admin' || requester.role === 'admin' || requester.role === 'hod')) {
    return { success: false, error: 'Not authorized' };
  }
  var email = String(p.targetEmail || p.email || '').trim().toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User not found' };
  updateRowById('Users', u.id, { active: true, verified: true });
  return { success: true, data: { user: publicUser(findUserByEmail(email)) } };
}

function deleteUser(p) {
  // 3.2.0: admins too (admin code); superadmin accounts are never deleted
  try { requireAdminCode(p); } catch (eS) { return { success: false, error: eS.message, needsCode: !!eS.needsCode }; }
  var email = String(p.targetEmail || '').trim().toLowerCase();
  if (email === SUPERADMIN_EMAIL) return { success: false, error: 'Cannot delete superadmin' };
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'Not found' };
  if (r3IsProtectedSuper(u) || isSuperPerm(u)) return { success: false, error: 'Superadmin accounts cannot be deleted here' };
  getSS().getSheetByName('Users').deleteRow(u._row);
  return { success: true, data: { deleted: email } };
}

function getAlertEmails(p) {
  seedAlertEmails();
  var rows = sheetToObjects('Alert Emails');
  return { success: true, data: { emails: rows } };
}

function saveAlertEmails(p) {
  var requester = getRequester(p);
  if (!requester || !isAdminPerm(requester)) { // 3.2.0: admins too
    return { success: false, error: 'Admin only' };
  }
  var emails = p.emails;
  if (typeof emails === 'string') {
    try { emails = JSON.parse(emails); } catch (e) { emails = emails.split(/[\n,]+/); }
  }
  if (!Array.isArray(emails)) return { success: false, error: 'emails array required' };

  var sh = getSS().getSheetByName('Alert Emails');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  // clear all data rows properly
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);

  emails.forEach(function (em, i) {
    var email = typeof em === 'string' ? em : em.email;
    email = String(email || '').trim().toLowerCase();
    if (!email) return;
    appendRow('Alert Emails', {
      email: email,
      label: (typeof em === 'object' && em.label) ? em.label : ('Alert ' + (i + 1)),
      active: true
    }, ['email', 'label', 'active']);
  });
  return getAlertEmails(p);
}

/* ========== BOAT ========== */

function boatDateInWindow(dateStr, fromDate, toDate) {
  var d = normalizeDateKey(dateStr);
  if (!d) return false;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

function getBoatRuns(p) {
  p = p || {};
  // 2.10.0: cached ~3 min per window; any Boat Runs / Boat Bookings write bumps the 'boat' namespace
  var cacheKey = scKey('boat', JSON.stringify([String(p.date || ''), String(p.fromDate || p.startDate || ''), String(p.toDate || p.endDate || ''),
    String(p.includeInactive || ''), String(p.allDates || p.includeAll || ''), fijiDateString(getFijiNow())]));
  var hitRuns = scGetJson(cacheKey);
  if (hitRuns) return { success: true, data: { runs: hitRuns, cached: true } };
  var runs = sheetToObjects('Boat Runs').filter(function (r) {
    return p.includeInactive || truthy(r.active) || r.active === '' || r.active === undefined;
  });
  var allDates = p.allDates === true || p.allDates === 'true' || p.includeAll === true || p.includeAll === 'true';
  if (p.date) {
    runs = runs.filter(function (r) { return String(r.date).indexOf(String(p.date)) === 0; });
  } else if (!allDates) {
    var today = fijiDateString(getFijiNow());
    var fromDate = normalizeDateKey(p.fromDate || p.startDate) || today;
    var toDate = normalizeDateKey(p.toDate || p.endDate) || fijiDateString(addFijiDays(getFijiNow(), 14));
    runs = runs.filter(function (r) { return boatDateInWindow(r.date, fromDate, toDate); });
  }
  var bookings = sheetToObjects('Boat Bookings');
  runs = runs.map(function (r) {
    var used = bookings.filter(function (b) {
      return b.runId === r.id && b.status !== 'cancelled';
    }).reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
    return Object.assign({}, r, {
      paxBooked: used,
      fullNotification: truthy(r.fullNotification)
    });
  });
  scPutJson(cacheKey, runs, 180);
  return { success: true, data: { runs: runs } };
}

/**
 * Soft-dedupe active Boat Runs by (date, time, route).
 * Keeps earliest createdAt (then lowest id); sets active:false on the rest.
 * Admin/super only.
 */
function dedupeBoatRuns(p) {
  p = p || {};
  // 3.0: Boat station (or superadmin) — see Stations.gs
  try { requireBoatManagerOrAdmin(p); } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
  var sh = getSS().getSheetByName('Boat Runs');
  if (!sh) return { success: false, error: 'Boat Runs sheet missing — run initSheets' };
  var rows = sheetToObjects('Boat Runs');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var activeCol = headers.indexOf('active') + 1;
  if (activeCol < 1) return { success: false, error: 'active column missing' };

  var groups = {};
  rows.forEach(function (r) {
    var active = truthy(r.active) || r.active === '' || r.active === undefined;
    if (!active) return;
    var key = normalizeDateKey(r.date) + '|' + normalizeTimeKey(r.time) + '|' + String(r.route || '').trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  function sortKeepFirst(a, b) {
    var ca = String(a.createdAt || '');
    var cb = String(b.createdAt || '');
    if (ca && cb && ca !== cb) return ca < cb ? -1 : 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  var deactivated = 0;
  var kept = 0;
  var duplicateGroups = 0;
  var samples = [];
  Object.keys(groups).forEach(function (key) {
    var list = groups[key];
    if (list.length < 2) { kept++; return; }
    duplicateGroups++;
    list.sort(sortKeepFirst);
    kept++;
    for (var i = 1; i < list.length; i++) {
      sh.getRange(list[i]._row, activeCol).setValue(false);
      list[i].active = false;
      deactivated++;
      if (samples.length < 20) {
        samples.push({ keptId: list[0].id, deactivatedId: list[i].id, key: key });
      }
    }
  });
  if (deactivated) scInvalidateSheet('Boat Runs'); // 2.10.0

  return {
    success: true,
    data: {
      deactivated: deactivated,
      keptActiveSlots: kept,
      duplicateGroups: duplicateGroups,
      samples: samples,
      message: deactivated
        ? ('Deactivated ' + deactivated + ' duplicate run(s) across ' + duplicateGroups + ' slot(s)')
        : 'No active duplicates found'
    }
  };
}

function saveBoatRun(p) {
  var requester = getRequester(p);
  var captainOnly = p.captainUpdate === true || p.captainUpdate === 'true' || p.limited === true || p.limited === 'true';
  if (captainOnly) {
    if (!requester || !isBoatCaptainPerm(requester)) {
      return { success: false, error: 'Boat captain permission required' };
    }
    if (!p.id) return { success: false, error: 'Run id required' };
    var capPatch = {};
    if (p.capacity !== undefined) capPatch.capacity = p.capacity;
    if (p.fullNotification !== undefined) {
      capPatch.fullNotification = p.fullNotification === true || p.fullNotification === 'true' || p.fullNotification === 'TRUE' || p.fullNotification === 1 || p.fullNotification === '1';
    }
    var capUpdated = updateRowById('Boat Runs', p.id, capPatch);
    return { success: !!capUpdated, data: { run: capUpdated }, error: capUpdated ? undefined : 'Not found' };
  }
  // C70: boat_manager / admin role-gated (no passcode UI)
  try { requireBoatManagerOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  if (p.id) {
    var patch = {};
    if (p.date !== undefined) patch.date = p.date;
    if (p.time !== undefined) patch.time = p.time;
    if (p.route !== undefined) patch.route = p.route;
    if (p.capacity !== undefined) patch.capacity = p.capacity;
    if (p.notes !== undefined) patch.notes = p.notes;
    if (p.fullNotification !== undefined) {
      patch.fullNotification = p.fullNotification === true || p.fullNotification === 'true' || p.fullNotification === 'TRUE';
    }
    if (p.active !== undefined) {
      patch.active = !(p.active === false || p.active === 'false' || p.active === 'FALSE' || p.active === 0 || p.active === '0');
    }
    var updated = updateRowById('Boat Runs', p.id, patch);
    return { success: !!updated, data: { run: updated }, error: updated ? undefined : 'Not found' };
  }
  var row = {
    id: uid('run'),
    date: p.date || fijiDateString(getFijiNow()),
    time: p.time || '',
    route: p.route || '',
    capacity: p.capacity || 20,
    notes: p.notes || '',
    fullNotification: false,
    active: true,
    createdBy: requesterTag(getRequester(p)) || p.requesterEmail || '',
    createdAt: nowIso()
  };
  appendRow('Boat Runs', row, ['id', 'date', 'time', 'route', 'capacity', 'notes', 'fullNotification', 'active', 'createdBy', 'createdAt']);
  return { success: true, data: { run: row } };
}

function deleteBoatRun(p) {
  try { requireBoatManagerOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  if (!p.id) return { success: false, error: 'Run id required' };
  updateRowById('Boat Runs', p.id, { active: false });
  return { success: true };
}

function getBoatBookings(p) {
  var bookings = sheetToObjects('Boat Bookings');
  if (p.runId) bookings = bookings.filter(function (b) { return b.runId === p.runId; });
  return { success: true, data: { bookings: bookings } };
}

function bookBoat(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var runId = p.runId;
  var runs = sheetToObjects('Boat Runs').filter(function (r) { return r.id === runId; });
  if (!runs.length) return { success: false, error: 'Run not found' };
  var run = runs[0];
  var existing = sheetToObjects('Boat Bookings').filter(function (b) {
    return b.runId === runId && b.status !== 'cancelled';
  });
  var mine = existing.filter(function (b) {
    return String(b.userEmail).toLowerCase() === email && String(b.status || 'confirmed') === 'confirmed';
  });
  if (mine.length) {
    return { success: false, error: 'You already have a confirmed booking on this run. Cancel it first — only one booking per run.' };
  }
  var seats = Number(p.seats || 1);
  var used = existing.reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  if (used + seats > Number(run.capacity || 20)) {
    return { success: false, error: 'Not enough seats (used ' + used + '/' + run.capacity + ')' };
  }
  var row = {
    id: uid('bb'),
    runId: runId,
    userEmail: email,
    userName: displayUserName(u),
    seats: seats,
    status: 'confirmed',
    notes: p.notes || '',
    emergency: false,
    createdAt: nowIso()
  };
  appendRow('Boat Bookings', row, ['id', 'runId', 'userEmail', 'userName', 'seats', 'status', 'notes', 'createdAt']);
  return { success: true, data: { booking: row } };
}

function cancelBoatBooking(p) {
  // 3.0: only the person who booked, or the Boat station / superadmin, may cancel a booking
  var requester = getRequester(p);
  if (!requester) return { success: false, error: 'Login required' };
  var cur = sheetToObjects('Boat Bookings').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!cur) return { success: false, error: 'Booking not found' };
  if (!isBoatManagerPerm(requester) && String(cur.userEmail).toLowerCase() !== String(requester.email).toLowerCase()) {
    return { success: false, error: 'You can only cancel your own booking' };
  }
  var patch = { status: 'cancelled' };
  if (requester.station) patch.cancelledBy = displayUserName(requester);
  var b = updateRowById('Boat Bookings', p.id, patch);
  return { success: !!b, data: { booking: b } };
}

function myBoatBookings(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var bookings = sheetToObjects('Boat Bookings').filter(function (b) {
    return String(b.userEmail).toLowerCase() === email;
  });
  var runs = sheetToObjects('Boat Runs');
  var runMap = {};
  runs.forEach(function (r) { runMap[r.id] = r; });
  bookings = bookings.map(function (b) {
    return Object.assign({}, b, { run: runMap[b.runId] || null });
  });
  return { success: true, data: { bookings: bookings } };
}

function countedMealStatus(st) {
  st = String(st || '');
  return st && st !== 'cancelled' && st !== 'rejected' && st !== 'declined' && st !== 'late_pending' && st !== 'special_pending'; // 3.0: pending requests never count
}

function getBoatTripSummary(p) {
  var requester = getRequester(p);
  var diveDept = requester && /dive/i.test(String(requester.department || ''));
  if (!requester || !(canSeeBoatOps(requester) || diveDept)) {
    return { success: false, error: 'Boat manager / captain / admin / Dive required' };
  }
  var runId = p.runId || p.id;
  if (!runId) return { success: false, error: 'runId required' };
  var runs = sheetToObjects('Boat Runs').filter(function (r) { return r.id === runId; });
  if (!runs.length) return { success: false, error: 'Run not found' };
  var run = runs[0];
  var bookings = sheetToObjects('Boat Bookings').filter(function (b) {
    return b.runId === runId && b.status !== 'cancelled';
  });
  var totalPax = bookings.reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  return {
    success: true,
    data: {
      run: run,
      bookings: bookings,
      totalPax: totalPax,
      title: 'Boat Trip Summary — Dive'
    }
  };
}

function getDailyOpsSummary(p) {
  var requester = getRequester(p);
  if (!requester || !(isAdminPerm(requester) || isHodPerm(requester))) {
    return { success: false, error: 'Admin / HOD required' };
  }
  var today = fijiDateString(getFijiNow());
  function mealCount(sheetName) {
    return sheetToObjects(sheetName).filter(function (o) {
      return String(o.serviceDate).indexOf(today) === 0 && countedMealStatus(o.status);
    }).length;
  }
  var breakfast = mealCount('Breakfast Orders');
  var lunch = mealCount('Lunch Orders');
  var dinner = mealCount('Dinner Orders');
  var runs = sheetToObjects('Boat Runs').filter(function (r) {
    return String(r.date).indexOf(today) === 0 && (truthy(r.active) || r.active === '' || r.active === undefined);
  });
  var runIds = {};
  runs.forEach(function (r) { runIds[r.id] = r; });
  var bookings = sheetToObjects('Boat Bookings').filter(function (b) {
    return runIds[b.runId] && b.status !== 'cancelled' && String(b.status || 'confirmed') === 'confirmed';
  });
  var boatPax = bookings.reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  var divePax = bookings.filter(function (b) {
    var run = runIds[b.runId] || {};
    var hay = String(run.route || '') + ' ' + String(run.notes || '');
    return /dive/i.test(hay);
  }).reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  // also count users with Dive/Diveshop department on today's boats
  var diveDeptPax = bookings.filter(function (b) {
    var u = findUserByEmail(b.userEmail);
    var dept = u ? String(u.department || '') : '';
    return /dive/i.test(dept);
  }).reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  if (divePax === 0 && diveDeptPax > 0) divePax = diveDeptPax;
  var leave = sheetToObjects('Leave Requests').filter(function (r) {
    var st = String(r.status || '');
    if (st !== 'approved' && st !== 'pending' && st !== 'pending_hod' && st !== 'pending_manager') return false;
    var start = String(r.startDate || '').slice(0, 10);
    var end = String(r.endDate || start).slice(0, 10);
    return start && end && start <= today && today <= end;
  });
  var emergencyPending = sheetToObjects('Emergency Travel').filter(function (r) {
    return String(r.status) === 'pending';
  }).length;
  return {
    success: true,
    data: {
      date: today,
      breakfast: breakfast,
      lunch: lunch,
      dinner: dinner,
      boatPax: boatPax,
      divePax: divePax,
      staffOnLeave: leave.length,
      leaveActive: leave,
      emergencyPending: emergencyPending
    }
  };
}

function requestEmergencyTravel(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var reason = String(p.reason || '').trim();
  if (!reason) return { success: false, error: 'Reason is required' };
  var seats = Number(p.seats || 1);
  if (!(seats > 0)) return { success: false, error: 'Seats must be at least 1' };
  var row = {
    id: uid('em'),
    userEmail: email,
    userName: displayUserName(u),
    department: u.department || '',
    reason: reason,
    seats: seats,
    preferredTime: String(p.preferredTime || '').trim(),
    status: 'pending',
    reviewedBy: '',
    reviewNote: '',
    createdAt: nowIso()
  };
  appendRow('Emergency Travel', row, [
    'id', 'userEmail', 'userName', 'department', 'reason', 'seats', 'preferredTime',
    'status', 'reviewedBy', 'reviewNote', 'createdAt'
  ]);
  return { success: true, data: { request: row } };
}

function getEmergencyTravel(p) {
  var requester = getRequester(p);
  if (!requester) return { success: false, error: 'Login required' };
  var rows = sheetToObjects('Emergency Travel');
  if (canSeeBoatOps(requester) || isAdminPerm(requester)) {
    // all
  } else {
    var email = String(requester.email || '').toLowerCase();
    rows = rows.filter(function (r) { return String(r.userEmail).toLowerCase() === email; });
  }
  if (p.status) rows = rows.filter(function (r) { return String(r.status) === String(p.status); });
  return { success: true, data: { requests: rows } };
}

function reviewEmergencyTravel(p) {
  var requester = getRequester(p);
  if (!requester || !canSeeBoatOps(requester)) {
    return { success: false, error: 'Boat captain / manager / admin required' };
  }
  if (!p.id) return { success: false, error: 'id required' };
  var action = String(p.status || p.action || '').toLowerCase();
  var status = (action === 'confirmed' || action === 'approve' || action === 'approved') ? 'confirmed' :
    (action === 'rejected' || action === 'reject' || action === 'declined') ? 'rejected' : '';
  if (!status) return { success: false, error: 'status must be confirmed or rejected' };
  var updated = updateRowById('Emergency Travel', p.id, {
    status: status,
    reviewedBy: requesterTag(requester),
    reviewNote: String(p.note || p.reviewNote || '')
  });
  return { success: !!updated, data: { request: updated }, error: updated ? undefined : 'Not found' };
}

function getHodLeaveSummary(p) {
  var requester = getRequester(p);
  if (!requester || !(isHodPerm(requester) || isAdminPerm(requester))) {
    return { success: false, error: 'HOD / admin required' };
  }
  var rows = sheetToObjects('Leave Requests');
  var deptLabel = 'All';
  if (isAdminPerm(requester) && p.department) {
    deptLabel = String(p.department);
    rows = rows.filter(function (r) { return String(r.department) === deptLabel; });
  } else if (!isAdminPerm(requester)) {
    deptLabel = String(p.department || requester.department || '');
    if (!deptLabel) return { success: false, error: 'Department required' };
    rows = rows.filter(function (r) { return String(r.department) === deptLabel; });
  }
  var counts = { pending: 0, pending_hod: 0, pending_manager: 0, approved: 0, rejected: 0, other: 0 };
  rows.forEach(function (r) {
    var st = String(r.status || 'other');
    if (counts[st] !== undefined) counts[st]++;
    else counts.other++;
  });
  return {
    success: true,
    data: {
      department: deptLabel,
      counts: counts,
      requests: rows,
      escalation: isFeatureEnabled('feature_leave_escalation')
    }
  };
}


/* ========== MEALS ========== */

function fijiWeekday(d) {
  d = d || getFijiNow();
  return d.getUTCDay(); // 0=Sun … 6=Sat (Fiji wall via getFijiNow)
}

function parseFijiHourFromCreatedAt(createdAt) {
  // "yyyy-MM-dd HH:mm FJT" or ISO-ish
  var s = String(createdAt || '');
  var m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return Number(m[4]);
  try {
    var dt = new Date(s);
    if (!isNaN(dt.getTime())) return new Date(dt.getTime() + FIJI_OFFSET_MS).getUTCHours();
  } catch (e) {}
  return 0;
}

function seedDinnerMenus() {
  var existing = sheetToObjects('Dinner Menus');
  if (existing.length > 0) return;
  var headers = ['id', 'weekday', 'weekdayName', 'itemName', 'sortOrder', 'active', 'updatedAt'];
  for (var wd = 0; wd <= 6; wd++) {
    var items = DEFAULT_DINNER_MENUS[wd] || [];
    for (var i = 0; i < items.length; i++) {
      appendRow('Dinner Menus', {
        id: uid('dmenu'),
        weekday: wd,
        weekdayName: WEEKDAY_NAMES[wd],
        itemName: items[i],
        sortOrder: i + 1,
        active: true,
        updatedAt: nowIso()
      }, headers);
    }
  }
}

function getDinnerMenus(p) {
  p = p || {};
  var menuRows = cachedRows('Dinner Menus'); // 2.10.0 cached ~10 min; menu edits invalidate
  if (!menuRows.length) { seedDinnerMenus(); menuRows = sheetToObjects('Dinner Menus'); }
  var allActive = menuRows.filter(function (r) {
    return p.includeInactive ? true : truthy(r.active);
  });
  var items = allActive.slice();
  var serviceWd = null;
  var prevWd = null;
  // C67: default false — staff dinner ordering shows tomorrow (service weekday) only
  var includePrev = p.includePreviousDay === true || p.includePreviousDay === 'true';

  if (p.weekday !== undefined && p.weekday !== null && p.weekday !== '' && !p.serviceDate) {
    var wdOnly = Number(p.weekday);
    items = items.filter(function (r) { return Number(r.weekday) === wdOnly; });
    serviceWd = wdOnly;
  }
  if (p.serviceDate) {
    var parts = String(p.serviceDate).split('-');
    if (parts.length >= 3) {
      var sd = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      serviceWd = sd.getUTCDay();
      prevWd = (serviceWd + 6) % 7; // weekday before service date
      if (includePrev) {
        items = allActive.filter(function (r) {
          var w = Number(r.weekday);
          return w === serviceWd || w === prevWd;
        });
      } else {
        items = allActive.filter(function (r) { return Number(r.weekday) === serviceWd; });
      }
    }
  }
  // Deduplicate by itemName (prefer service weekday copy)
  if (includePrev && serviceWd !== null && prevWd !== null) {
    var seen = {};
    var serviceItems = [];
    var prevItems = [];
    items.filter(function (r) { return Number(r.weekday) === serviceWd; })
      .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
      .forEach(function (it) {
        var key = String(it.itemName || '').toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        var copy = Object.assign({}, it);
        copy.menuGroup = 'service';
        serviceItems.push(copy);
      });
    items.filter(function (r) { return Number(r.weekday) === prevWd; })
      .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
      .forEach(function (it) {
        var key = String(it.itemName || '').toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        var copy = Object.assign({}, it);
        copy.menuGroup = 'previous';
        prevItems.push(copy);
      });
    items = serviceItems.concat(prevItems);
  } else {
    items.sort(function (a, b) {
      var aw = Number(a.weekday) - Number(b.weekday);
      if (aw !== 0) return aw;
      return Number(a.sortOrder) - Number(b.sortOrder);
    });
    items = items.map(function (it) {
      var copy = Object.assign({}, it);
      copy.menuGroup = 'service';
      return copy;
    });
  }
  var byWeekday = {};
  for (var i = 0; i < 7; i++) byWeekday[i] = [];
  allActive.forEach(function (it) {
    var w = Number(it.weekday);
    if (!byWeekday[w]) byWeekday[w] = [];
    byWeekday[w].push(it);
  });
  var info = dinnerCutoffInfo();
  var tomorrowWd = fijiWeekday(addFijiDays(getFijiNow(), 1));
  var resolvedServiceWd = serviceWd !== null ? serviceWd : tomorrowWd;
  var resolvedPrevWd = prevWd !== null ? prevWd : ((resolvedServiceWd + 6) % 7);
  return {
    success: true,
    data: {
      items: items,
      serviceItems: items.filter(function (x) { return x.menuGroup === 'service'; }),
      previousItems: items.filter(function (x) { return x.menuGroup === 'previous'; }),
      byWeekday: byWeekday,
      tomorrowWeekday: tomorrowWd,
      tomorrowWeekdayName: WEEKDAY_NAMES[tomorrowWd],
      serviceWeekday: resolvedServiceWd,
      serviceWeekdayName: WEEKDAY_NAMES[resolvedServiceWd],
      previousWeekday: resolvedPrevWd,
      previousWeekdayName: WEEKDAY_NAMES[resolvedPrevWd],
      serviceDate: p.serviceDate || info.serviceDate,
      cutoff: info
    }
  };
}

function saveDinnerMenuItem(p) {
  var menuEditor = getRequester(p); // 3.0: chef (and admin/superadmin) edit the menu
  if (!(menuEditor && isChefPerm(menuEditor))) requirePasscode(p, 'super');
  seedDinnerMenus();
  var headers = ['id', 'weekday', 'weekdayName', 'itemName', 'sortOrder', 'active', 'updatedAt'];
  var weekday = Number(p.weekday);
  if (isNaN(weekday) || weekday < 0 || weekday > 6) return { success: false, error: 'weekday 0-6 required' };
  var itemName = String(p.itemName || '').trim();
  if (!itemName) return { success: false, error: 'itemName required' };
  var sortOrder = p.sortOrder !== undefined && p.sortOrder !== '' ? Number(p.sortOrder) : 99;
  if (!isFinite(sortOrder)) sortOrder = 99; // 3.0.0 (from 2.10.2 diag): NaN was written as #NUM! in the sheet
  var active = p.active === false || p.active === 'false' ? false : true;

  if (p.id) {
    var updated = updateRowById('Dinner Menus', p.id, {
      weekday: weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      itemName: itemName,
      sortOrder: sortOrder,
      active: active,
      updatedAt: nowIso()
    });
    if (!updated) return { success: false, error: 'Menu item not found' };
    return { success: true, data: { item: findMenuItem(p.id) } };
  }
  var row = {
    id: uid('dmenu'),
    weekday: weekday,
    weekdayName: WEEKDAY_NAMES[weekday],
    itemName: itemName,
    sortOrder: sortOrder,
    active: active,
    updatedAt: nowIso()
  };
  appendRow('Dinner Menus', row, headers);
  return { success: true, data: { item: row } };
}

function findMenuItem(id) {
  var rows = sheetToObjects('Dinner Menus');
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

function deleteDinnerMenuItem(p) {
  var menuEditor = getRequester(p); // 3.0: chef (and admin/superadmin) edit the menu
  if (!(menuEditor && isChefPerm(menuEditor))) requirePasscode(p, 'super');
  var rows = sheetToObjects('Dinner Menus');
  var found = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(p.id)) found = rows[i];
  if (!found) return { success: false, error: 'Not found' };
  getSS().getSheetByName('Dinner Menus').deleteRow(found._row);
  scInvalidateSheet('Dinner Menus'); // 2.10.0
  return { success: true };
}

/**
 * Auto-approve waves + optional 8:30pm prep snapshot.
 * Safe to call from API routes or Apps Script time-driven triggers.
 */
function processDinnerWorkflow(p) {
  p = p || {};
  // C97: do not re-init/seed on kitchen hot path; menus already present in production
  assertSheetsReady();
  seedDinnerMenus();
  var now = getFijiNow();
  var hour = now.getUTCHours();
  var minute = now.getUTCMinutes();
  var info = dinnerCutoffInfo(now);
  var serviceDate = p.serviceDate || info.serviceDate;
  var approved = { wave12: 0, wave17: 0, wave19: 0 };
  var orders = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected';
  });

  var waveNotes = [];
  function approvePendingBefore(cutoffHour, waveKey) {
    orders.forEach(function (o) {
      if (String(o.status) !== 'pending') return;
      if (truthy(o.late)) return;
      var placedHour = parseFijiHourFromCreatedAt(o.createdAt);
      if (placedHour < cutoffHour) {
        updateRowById('Dinner Orders', o.id, { status: 'approved' });
        o.status = 'approved';
        approved[waveKey]++;
        waveNotes.push(r3ApproveNote(o, 'dinner', 'auto-approved'));
      }
    });
  }

  if (hour >= 12) approvePendingBefore(12, 'wave12');
  if (hour >= 17) approvePendingBefore(17, 'wave17');
  if (hour >= 19) approvePendingBefore(19, 'wave19');
  r3NotifyMany(waveNotes); // 3.0.0 in-app "order approved" notifications

  var snap = null;
  var autoReady = mealPhase('dinner', serviceDate, now) !== 'open'; // 3.0.0: after the (configurable) dinner cutoff
  if (autoReady) {
    snap = upsertDinnerPrepSnapshot(serviceDate, true);
  }

  return {
    success: true,
    data: {
      fijiNow: formatFiji(now),
      serviceDate: serviceDate,
      approved: approved,
      autoPrepReady: autoReady,
      snapshot: snap ? { id: snap.id, generatedAt: snap.generatedAt, autoGenerated: snap.autoGenerated, totalOrders: snap.totalOrders } : null,
      note: 'Apps Script time triggers can also call processDinnerWorkflow'
    }
  };
}

/* ========== C102: KITCHEN SPECIAL NOTES / ALLERGIES ========== */
var ORDER_HEADERS = ['id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes', 'status', 'late', 'createdAt', 'specialNote'];
var NOTE_ALLERGY_RE = /\b(allerg\w*|nuts?|peanuts?|gluten|dairy|lactose|shellfish|seafood|eggs?|prawns?|crabs?|lobsters?|fish|soy|soya|sesame|coconuts?)\b/i;
var NOTE_DIET_RE = /\b(vegetarian|vegan|halal|no\s*pork|no\s*beef|pescatarian)\b/i;

function cleanSpecialNote(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
}

/** Latest note sent by the client. '' (cleared) is a real value; undefined = keep fallback. */
function noteFromParams(p, fallback) {
  if (p && p.specialNote !== undefined && p.specialNote !== null) return cleanSpecialNote(p.specialNote);
  if (p && p.notes !== undefined && p.notes !== null) return cleanSpecialNote(p.notes);
  return cleanSpecialNote(fallback);
}

/** Staff-written note for the kitchen: specialNote, else legacy notes minus system text. */
function kitchenNoteOf(o) {
  if (!o) return '';
  var sn = cleanSpecialNote(o.specialNote);
  if (sn) return sn;
  var raw = String(o.notes || '')
    .replace(/\s*\|?\s*order declined please see hod or chef/gi, '')
    .replace(/^\s*\[On behalf by[^\]]*\]\s*/i, '')
    .replace(/^\s*\[(Late request|Special by[^\]]*)\].*$/i, ''); // 3.0: the request reason is not a kitchen note
  return cleanSpecialNote(raw);
}

/** 'allergy' (red) · 'diet' (amber) · 'request' (plain) · '' (no note) */
function noteFlag(text) {
  text = String(text || '');
  if (!text) return '';
  if (NOTE_ALLERGY_RE.test(text)) return 'allergy';
  if (NOTE_DIET_RE.test(text)) return 'diet';
  return 'request';
}

function preferredNameMap() {
  var map = {};
  try {
    sheetToObjects('Users').forEach(function (u) {
      var e = String(u.email || '').trim().toLowerCase();
      if (e) map[e] = displayUserName(u);
    });
  } catch (e) {}
  return map;
}

function kitchenDisplayName(o, nameMap) {
  var e = String((o && o.userEmail) || '').trim().toLowerCase();
  return (nameMap && e && nameMap[e]) || (o && o.userName) || '';
}

/** Adds specialNote / noteFlag / displayName to each order row (in place). */
function decorateOrderNotes(orders, nameMap) {
  (orders || []).forEach(function (o) {
    var n = kitchenNoteOf(o);
    o.specialNote = n;
    o.noteFlag = noteFlag(n);
    o.displayName = kitchenDisplayName(o, nameMap);
  });
  return orders;
}

/**
 * One entry per staff member with a note (cancelled/rejected excluded, late approved kept).
 * Uses the same row the place*Order functions update, so a changed order shows its latest note.
 */
function kitchenNoteEntries(meal, orders, nameMap) {
  var seen = {};
  var out = [];
  (orders || []).forEach(function (o) {
    var st = String(o.status || '');
    if (st === 'cancelled' || st === 'rejected' || st === 'declined') return;
    var note = kitchenNoteOf(o);
    if (!note) return;
    var key = String(o.userEmail || '').trim().toLowerCase() || String(o.id);
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      id: o.id,
      meal: meal,
      name: kitchenDisplayName(o, nameMap),
      department: o.department || '',
      dish: o.mealChoice || (meal === 'dinner' ? 'Standard' : (meal === 'lunch' ? 'Lunch' : 'Breakfast')),
      note: note,
      flag: noteFlag(note),
      status: st,
      late: truthy(o.late)
    });
  });
  var rank = { allergy: 0, diet: 1, request: 2 };
  out.sort(function (a, b) { return (rank[a.flag] - rank[b.flag]) || String(a.name).localeCompare(String(b.name)); });
  return out;
}

function buildPrepPayload(serviceDate, nameMap) {
  var orders = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 &&
      o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'special_pending';
  });
  nameMap = nameMap || preferredNameMap();
  decorateOrderNotes(orders, nameMap);
  var tally = {};
  orders.forEach(function (o) {
    var k = o.mealChoice || 'Standard';
    tally[k] = (tally[k] || 0) + 1;
  });
  var byItem = {};
  Object.keys(tally).sort().forEach(function (k) { byItem[k] = []; });
  orders.forEach(function (o) {
    var k = o.mealChoice || 'Standard';
    if (!byItem[k]) byItem[k] = [];
    byItem[k].push({
      id: o.id,
      userName: o.userName,
      displayName: o.displayName,
      department: o.department,
      foodSelection: o.mealChoice || k,
      orderedAt: o.createdAt,
      comments: o.specialNote || '',
      specialNote: o.specialNote || '',
      noteFlag: o.noteFlag || '',
      status: o.status,
      approved: o.status === 'approved' || o.status === 'late_approved' || o.status === 'prepared' || o.status === 'served',
      denied: o.status === 'rejected' || o.status === 'cancelled',
      late: truthy(o.late),
      servedCheck: '' // printable cross-off
    });
  });
  var pending = orders.filter(function (o) { return o.status === 'pending' || o.status === 'late_pending'; }).length;
  var approvedN = orders.filter(function (o) {
    return o.status === 'approved' || o.status === 'late_approved' || o.status === 'prepared' || o.status === 'served';
  }).length;
  var lateN = orders.filter(function (o) { return truthy(o.late); }).length;
  return flagOffMenu({
    serviceDate: serviceDate,
    totalOrders: orders.length,
    tally: tally,
    byItem: byItem,
    pending: pending,
    approved: approvedN,
    late: lateN,
    specialNotes: kitchenNoteEntries('dinner', orders, nameMap),
    orders: orders
  });
}

/**
 * 2.10.0 8:30pm auto-save, 2.10.1: delegates to dsumSaveSnapshot (Summaries.gs) — compact payload split across
 * cells (the old single-cell payload could pass the 50,000-char limit on busy nights) and never throws into the
 * kitchen screen.
 */
function upsertDinnerPrepSnapshot(serviceDate, autoGenerated) {
  try {
    return dsumSaveSnapshot(serviceDate, autoGenerated, autoGenerated ? 'auto' : 'manual', autoGenerated ? 'auto after 8:30pm (kitchen refresh)' : '');
  } catch (e) {
    return null;
  }
}

function getDinnerPrepList(p) {
  try { requireKitchenOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  processDinnerWorkflow(p);
  var info = dinnerCutoffInfo();
  var serviceDate = p.serviceDate || info.serviceDate;
  var payload = buildPrepPayload(serviceDate);
  var snaps = sheetToObjects('Dinner Prep Snapshots').filter(function (s) {
    return String(s.serviceDate).indexOf(serviceDate) === 0;
  });
  var snap = snaps.length ? snaps[snaps.length - 1] : null;
  var now = getFijiNow();
  var autoReady = mealPhase('dinner', serviceDate, now) !== 'open';
  return {
    success: true,
    data: {
      serviceDate: serviceDate,
      prep: payload,
      snapshot: snap ? { id: snap.id, generatedAt: snap.generatedAt, autoGenerated: truthy(snap.autoGenerated), totalOrders: snap.totalOrders } : null,
      autoGeneratedAt830: autoReady && snap && truthy(snap.autoGenerated),
      fijiNow: formatFiji(now),
      cutoff: info
    }
  };
}

function canApproveLateDinner(p) {
  var u = getRequester(p);
  if (u && (isChefPerm(u) || isAdminPerm(u) || isSuperPerm(u))) return u;
  try {
    requirePasscode(p, 'admin');
    return u || { email: p.requesterEmail || '' };
  } catch (e) {
    throw new Error('Chef / admin / superadmin required to approve late dinner');
  }
}

function approveLateDinnerOrder(p) {
  // C67: role-gated like breakfast late — no unlock/passcode UI
  try { canApproveLateDinner(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  var o = findOrder('Dinner Orders', p.id);
  if (!o) return { success: false, error: 'Order not found' };
  var status = p.status === 'rejected' ? 'rejected' : 'late_approved';
  var updated = updateRowById('Dinner Orders', p.id, {
    status: status,
    late: true
  });
  return { success: !!updated, data: { order: findOrder('Dinner Orders', p.id) } };
}

function mealRangeStats(daysBack) {
  var now = getFijiNow();
  var end = addFijiDays(now, 1); // include tomorrow service
  var dinners = sheetToObjects('Dinner Orders');
  var lunches = sheetToObjects('Lunch Orders');
  var breakfasts = sheetToObjects('Breakfast Orders');
  var boatBookings = sheetToObjects('Boat Bookings');
  var byDay = [];
  var totals = { breakfast: 0, lunch: 0, dinner: 0 };
  var dinnerItemCounts = {};
  for (var i = daysBack - 1; i >= 0; i--) {
    var d = addFijiDays(end, -i);
    var ds = fijiDateString(d);
    var b = breakfasts.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0 && countsInBreakfastTotal(o); }).length;
    var l = lunches.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0 && countedMealStatus(o.status); }).length;
    var dinRows = dinners.filter(function (o) {
      return String(o.serviceDate).indexOf(ds) === 0 && o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'special_pending';
    });
    dinRows.forEach(function (o) {
      var k = o.mealChoice || 'Standard';
      dinnerItemCounts[k] = (dinnerItemCounts[k] || 0) + 1;
    });
    var din = dinRows.length;
    totals.breakfast += b; totals.lunch += l; totals.dinner += din;
    byDay.push({ date: ds, breakfast: b, lunch: l, dinner: din, total: b + l + din });
  }
  var items = Object.keys(dinnerItemCounts).map(function (k) { return { item: k, count: dinnerItemCounts[k] }; });
  items.sort(function (a, b) { return b.count - a.count; });
  return {
    byDay: byDay,
    totals: totals,
    dinnerMostOrdered: items.slice(0, 5),
    dinnerLeastOrdered: items.slice().reverse().slice(0, 5),
    boatBookings: boatBookings.filter(function (b) { return b.status !== 'cancelled'; }).length
  };
}

function getMealStatistics(p) {
  var requester = getRequester(p);
  if (!requester || !(isAdminPerm(requester) || isChefPerm(requester) || isSuperPerm(requester) || isHodPerm(requester))) {
    try { requirePasscode(p, 'admin'); } catch (e) {
      return { success: false, error: 'Admin/chef access required' };
    }
  }
  var weekly = mealRangeStats(7);
  var monthly = mealRangeStats(30);
  return {
    success: true,
    data: {
      weekly: weekly,
      monthly: monthly,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

/** HOD / admin: order breakfast/lunch headcount or dinner menu on behalf of staff */
function placeMealOnBehalf(p) {
  var requester = getRequester(p);
  if (!requester || !(isHodPerm(requester) || isAdminPerm(requester) || isChefPerm(requester))) {
    return { success: false, error: 'HOD / admin / Chef station required' };
  }
  var meal = String(p.meal || '').toLowerCase();
  var staffName = String(p.staffName || p.userName || '').trim();
  var department = String(p.department || requester.department || '').trim();
  var comment = String(p.comment || p.notes || '');
  if (!staffName) return { success: false, error: 'Staff name required' };
  if (!department) return { success: false, error: 'Department required' };
  if (['breakfast', 'lunch', 'dinner'].indexOf(meal) < 0) {
    return { success: false, error: 'meal must be breakfast, lunch, or dinner' };
  }
  var email = String(p.userEmail || '').trim().toLowerCase();
  var u = email ? findUserByEmail(email) : null;
  if (!u) {
    // synthetic placeholder email for kitchen tracking
    email = 'behalf+' + staffName.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@pcr.local';
  }
  var notes = '[On behalf by ' + ((requester.firstName || '') + ' ' + (requester.lastName || '')).trim() + '] ' + comment;
  var specialNote = cleanSpecialNote(comment);
  if (meal === 'breakfast') {
    var bi = breakfastCutoffInfo();
    var bRow = {
      id: uid('brk'),
      serviceDate: p.serviceDate || bi.serviceDate,
      userEmail: email,
      userName: staffName,
      department: department,
      mealChoice: 'Breakfast',
      notes: notes,
      specialNote: specialNote,
      status: 'late_pending',
      late: true,
      createdAt: nowIso()
    };
    appendRow('Breakfast Orders', bRow, ORDER_HEADERS);
    return { success: true, data: { order: bRow, meal: meal, message: 'Sent to Kitchen for approval' } };
  }
  if (meal === 'lunch') {
    var li = lunchCutoffInfo();
    var lRow = {
      id: uid('lun'),
      serviceDate: p.serviceDate || li.serviceDate,
      userEmail: email,
      userName: staffName,
      department: department,
      mealChoice: 'Lunch',
      notes: notes,
      specialNote: specialNote,
      status: 'ordered',
      late: false,
      createdAt: nowIso()
    };
    appendRow('Lunch Orders', lRow, ORDER_HEADERS);
    return { success: true, data: { order: lRow, meal: meal, message: 'Lunch counted (headcount)' } };
  }
  // dinner → pending kitchen/auto workflow
  var di = dinnerCutoffInfo();
  var dMenuErr = dishMenuError(di.serviceDate, p.mealChoice || 'Standard');
  if (dMenuErr) return dMenuErr;
  var dRow = {
    id: uid('din'),
    serviceDate: di.serviceDate,
    userEmail: email,
    userName: staffName,
    department: department,
    mealChoice: p.mealChoice || 'Standard',
    notes: notes,
    specialNote: specialNote,
    status: di.open ? 'pending' : 'late_pending',
    late: !di.open,
    createdAt: nowIso()
  };
  appendRow('Dinner Orders', dRow, ORDER_HEADERS);
  processDinnerWorkflow({ serviceDate: dRow.serviceDate });
  return { success: true, data: { order: dRow, meal: meal, message: 'Dinner sent to Kitchen' } };
}

function getBreakfastOrderSheet(p) {
  try { requireKitchenOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  processBreakfastWorkflow(p || {});
  var info = breakfastCutoffInfo();
  var serviceDate = p.serviceDate || info.serviceDate;
  var orders = sheetToObjects('Breakfast Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled';
  });
  var nameMap = preferredNameMap();
  decorateOrderNotes(orders, nameMap);
  return {
    success: true,
    data: {
      serviceDate: serviceDate,
      totalCounted: orders.filter(countsInBreakfastTotal).length,
      orders: orders.map(function (o) {
        return {
          id: o.id,
          userName: o.userName,
          displayName: o.displayName,
          department: o.department,
          timeOrdered: o.createdAt,
          status: o.status,
          late: truthy(o.late),
          notes: o.notes || '',
          specialNote: o.specialNote || '',
          noteFlag: o.noteFlag || ''
        };
      }),
      specialNotes: kitchenNoteEntries('breakfast', orders, nameMap),
      cutoff: info
    }
  };
}

function getLunchOrderSheet(p) {
  try { requireKitchenOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  var info = lunchCutoffInfo();
  var serviceDate = p.serviceDate || info.serviceDate;
  var orders = sheetToObjects('Lunch Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 && countedMealStatus(o.status); // 3.0: pending late/special requests are not on the list
  });
  var nameMap = preferredNameMap();
  decorateOrderNotes(orders, nameMap);
  return {
    success: true,
    data: {
      serviceDate: serviceDate,
      totalCounted: orders.length,
      orders: orders.map(function (o) {
        return {
          id: o.id,
          userName: o.userName,
          displayName: o.displayName,
          department: o.department,
          timeOrdered: o.createdAt,
          status: o.status,
          late: truthy(o.late),
          notes: o.notes || '',
          specialNote: o.specialNote || '',
          noteFlag: o.noteFlag || ''
        };
      }),
      specialNotes: kitchenNoteEntries('lunch', orders, nameMap),
      cutoff: info
    }
  };
}


function placeDinnerOrder(p) {
  processDinnerWorkflow({});
  var info = dinnerCutoffInfo();
  var late = !info.open;
  if (late) {
    if (p.allowLate) return requestLateMeal(Object.assign({}, p, { meal: 'dinner', serviceDate: info.serviceDate, reason: p.reason || p.notes || 'Late dinner (older app)' }));
    return { success: false, error: 'Dinner orders closed at ' + r3Label(info.cutoff) + ' Fiji for tomorrow (' + info.serviceDate + '). Send a Late Meal Request instead.', cutoff: info, needsLateRequest: true };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var s34b = typeof s34MealBlock === 'function' ? s34MealBlock(u, 'dinner', info.serviceDate) : null; if (s34b) return s34b; // 3.4.0 rostered on leave
  // 3.0.0: normal orders are always for the next dinner date (a client-sent date can't move the order / skip the cutoff)
  var serviceDate = info.serviceDate;
  var status = late ? 'late_pending' : 'pending';
  var dNote = noteFromParams(p, '');
  var existing = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected';
  });
  // 3.0.0: the dish must be on the dinner date's weekday menu (bug fix: yesterday's dish was pre-selected and booked)
  var wantDish = p.mealChoice || (existing[0] && existing[0].mealChoice) || '';
  var sameAsNow = existing[0] && r3NormDish(wantDish) === r3NormDish(existing[0].mealChoice); // re-saving your current dish (e.g. note change) is allowed
  var menuErr = sameAsNow ? null : dishMenuError(serviceDate, wantDish);
  if (menuErr) return menuErr;

  existing = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected';
  });
  if (existing.length) {
    updateRowById('Dinner Orders', existing[0].id, {
      mealChoice: p.mealChoice || existing[0].mealChoice,
      notes: noteFromParams(p, kitchenNoteOf(existing[0])),
      specialNote: noteFromParams(p, kitchenNoteOf(existing[0])),
      late: late,
      status: status
    });
    processDinnerWorkflow({ serviceDate: serviceDate });
    return { success: true, data: { order: findOrder('Dinner Orders', existing[0].id), late: late, cutoff: info } };
  }
  var row = {
    id: uid('din'),
    serviceDate: serviceDate,
    userEmail: email,
    userName: displayUserName(u),
    department: u.department || '',
    mealChoice: p.mealChoice || 'Standard',
    notes: dNote,
    specialNote: dNote,
    status: status,
    late: late,
    createdAt: nowIso()
  };
  appendRow('Dinner Orders', row, ORDER_HEADERS);
  processDinnerWorkflow({ serviceDate: serviceDate });
  return { success: true, data: { order: findOrder('Dinner Orders', row.id) || row, late: late, cutoff: info } };
}

/** 2.10.2: '' if mealChoice is allowed for serviceDate, else a staff-facing error. */
function dinnerChoiceError(mealChoice, serviceDate, currentChoice) {
  var choice = String(mealChoice || '').trim();
  if (!choice) return '';
  var norm = function (x) { return String(x || '').replace(/\s+/g, ' ').trim().toLowerCase(); };
  if (currentChoice && norm(choice) === norm(currentChoice)) return '';
  var m = getDinnerMenus({ serviceDate: serviceDate, includePreviousDay: false });
  var items = (m && m.data && m.data.serviceItems) || [];
  if (!items.length) return ''; // no menu set for that weekday — keep old behaviour
  for (var i = 0; i < items.length; i++) if (norm(items[i].itemName) === norm(choice)) return '';
  return '"' + choice + '" is not on the ' + (m.data.serviceWeekdayName || '') + ' ' + serviceDate +
    ' dinner menu. Please pick from tomorrow\'s menu.';
}

function placeLunchOrder(p) {
  var info = lunchCutoffInfo();
  // Staff cannot late-order lunch. No late path for staff.
  if (!info.open) {
    if (p.allowLate) return requestLateMeal(Object.assign({}, p, { meal: 'lunch', serviceDate: info.serviceDate, reason: p.reason || p.notes || 'Late lunch' }));
    return { success: false, error: 'Lunch orders closed at ' + r3Label(info.cutoff) + ' Fiji for tomorrow (' + info.serviceDate + '). Send a Late Meal Request instead.', cutoff: info, needsLateRequest: true };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var s34b = typeof s34MealBlock === 'function' ? s34MealBlock(u, 'lunch', info.serviceDate) : null; if (s34b) return s34b; // 3.4.0 rostered on leave
  var serviceDate = p.serviceDate || info.serviceDate;
  var lNote = noteFromParams(p, '');

  // 3.0: after 3 cancellations for the same day the lunch option is blocked
  if (v3CancelCount('Lunch Orders', email, String(serviceDate).slice(0, 10)) >= V3_CANCEL_LIMIT) {
    return { success: false, error: 'You cancelled lunch ' + V3_CANCEL_LIMIT + ' times for ' + serviceDate + ' — ordering is blocked. Contact your HOD or chef.', blocked: true, cutoff: info };
  }
  var existing = sheetToObjects('Lunch Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled';
  });
  if (existing.length) {
    updateRowById('Lunch Orders', existing[0].id, {
      mealChoice: 'Lunch',
      notes: noteFromParams(p, kitchenNoteOf(existing[0])),
      specialNote: noteFromParams(p, kitchenNoteOf(existing[0])),
      late: false,
      status: 'ordered'
    });
    return { success: true, data: { order: findOrder('Lunch Orders', existing[0].id), late: false, cutoff: info } };
  }
  var row = {
    id: uid('lun'),
    serviceDate: serviceDate,
    userEmail: email,
    userName: displayUserName(u),
    department: u.department || '',
    mealChoice: 'Lunch',
    notes: lNote,
    specialNote: lNote,
    status: 'ordered',
    late: false,
    createdAt: nowIso()
  };
  appendRow('Lunch Orders', row, ORDER_HEADERS);
  return { success: true, data: { order: row, late: false, cutoff: info } };
}

function countsInBreakfastTotal(o) {
  if (!o) return false;
  var st = String(o.status || '');
  if (st === 'cancelled' || st === 'rejected' || st === 'declined' || st === 'late_pending') return false;
  return st === 'ordered' || st === 'late_approved' || st === 'approved' || st === 'prepared' || st === 'served';
}

function placeBreakfastOrder(p) {
  processBreakfastWorkflow({});
  var info = breakfastCutoffInfo();
  var late = false;
  if (!info.open) {
    // 3.0.0: after the cutoff only Late Meal Requests (auto-approved at the late close)
    if (p.allowLate) return requestLateMeal(Object.assign({}, p, { meal: 'breakfast', serviceDate: info.serviceDate, reason: p.reason || p.notes || 'Late breakfast (older app)' }));
    return { success: false, error: 'Breakfast orders closed at ' + r3Label(info.cutoff) + ' Fiji for tomorrow (' + info.serviceDate + '). Send a Late Meal Request instead.', cutoff: info, needsLate: true, needsLateRequest: true };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var s34b = typeof s34MealBlock === 'function' ? s34MealBlock(u, 'breakfast', info.serviceDate) : null; if (s34b) return s34b; // 3.4.0 rostered on leave
  var serviceDate = p.serviceDate || info.serviceDate;
  var status = late ? 'late_pending' : 'ordered';

  // 3.0: after 3 cancellations for the same day the breakfast option is blocked
  if (v3CancelCount('Breakfast Orders', email, String(serviceDate).slice(0, 10)) >= V3_CANCEL_LIMIT) {
    return { success: false, error: 'You cancelled breakfast ' + V3_CANCEL_LIMIT + ' times for ' + serviceDate + ' — ordering is blocked. Contact your HOD or chef.', blocked: true, cutoff: info };
  }
  var existing = sheetToObjects('Breakfast Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'declined';
  });
  if (existing.length) {
    updateRowById('Breakfast Orders', existing[0].id, {
      mealChoice: 'Breakfast',
      notes: noteFromParams(p, kitchenNoteOf(existing[0])),
      specialNote: noteFromParams(p, kitchenNoteOf(existing[0])),
      late: late,
      status: status
    });
    return { success: true, data: { order: findOrder('Breakfast Orders', existing[0].id), late: late, cutoff: info } };
  }
  var row = {
    id: uid('brk'),
    serviceDate: serviceDate,
    userEmail: email,
    userName: displayUserName(u),
    department: u.department || '',
    mealChoice: 'Breakfast',
    notes: noteFromParams(p, ''),
    specialNote: noteFromParams(p, ''),
    status: status,
    late: late,
    createdAt: nowIso()
  };
  appendRow('Breakfast Orders', row, ORDER_HEADERS);
  return { success: true, data: { order: row, late: late, cutoff: info } };
}

/** Auto-decline unapproved late breakfast after 6pm Fiji */
function processBreakfastWorkflow(p) {
  var info = breakfastCutoffInfo();
  var serviceDate = (p && p.serviceDate) || info.serviceDate;
  var now = getFijiNow();
  var declined = 0;
  if (false) { // 3.0.0: late breakfasts are no longer auto-declined at 6pm — they are auto-approved at the late close
    var rows = sheetToObjects('Breakfast Orders').filter(function (o) {
      return String(o.serviceDate).indexOf(serviceDate) === 0 && o.status === 'late_pending' &&
        String(o.orderType || '') !== 'late_request'; // 3.0: explicit late meal requests wait for chef / HOD
    });
    rows.forEach(function (o) {
      updateRowById('Breakfast Orders', o.id, {
        status: 'rejected',
        notes: (o.notes ? o.notes + ' | ' : '') + 'order declined please see hod or chef'
      });
      declined++;
      try {
        appendRow('Notifications', {
          id: uid('ntf'),
          userEmail: o.userEmail,
          title: 'Breakfast order declined',
          body: 'order declined please see hod or chef',
          kind: 'breakfast_late',
          relatedId: o.id,
          read: false,
          createdAt: nowIso()
        }, ['id', 'userEmail', 'title', 'body', 'kind', 'relatedId', 'read', 'createdAt']);
      } catch (e) {}
    });
  }
  return { success: true, data: { declined: declined, cutoff: info, serviceDate: serviceDate } };
}

function canApproveLateBreakfast(p) {
  var u = getRequester(p);
  if (u && (isChefPerm(u) || isAdminPerm(u) || isSuperPerm(u))) return u;
  try {
    requirePasscode(p, 'admin');
    return u || { email: p.requesterEmail || '' };
  } catch (e) {
    throw new Error('Chef / admin / superadmin required to approve late breakfast');
  }
}

function approveLateBreakfastOrder(p) {
  try { canApproveLateBreakfast(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  processBreakfastWorkflow(p);
  var o = findOrder('Breakfast Orders', p.id);
  if (!o) return { success: false, error: 'Order not found' };
  var status = (p.status === 'rejected' || p.action === 'reject') ? 'rejected' : 'late_approved';
  var patch = { status: status, late: true };
  if (status === 'rejected') {
    patch.notes = (o.notes ? o.notes + ' | ' : '') + 'order declined please see hod or chef';
  }
  updateRowById('Breakfast Orders', p.id, patch);
  return { success: true, data: { order: findOrder('Breakfast Orders', p.id) } };
}

function approveAllLateBreakfast(p) {
  try { canApproveLateBreakfast(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  processBreakfastWorkflow(p);
  var info = breakfastCutoffInfo();
  var serviceDate = p.serviceDate || info.serviceDate;
  var rows = sheetToObjects('Breakfast Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 && o.status === 'late_pending';
  });
  var n = 0;
  rows.forEach(function (o) {
    updateRowById('Breakfast Orders', o.id, { status: 'late_approved', late: true });
    n++;
  });
  return { success: true, data: { approved: n, serviceDate: serviceDate } };
}

function getBreakfastOrders(p) {
  processBreakfastWorkflow(p || {});
  var orders = sheetToObjects('Breakfast Orders');
  if (p.serviceDate) orders = orders.filter(function (o) { return String(o.serviceDate).indexOf(String(p.serviceDate)) === 0; });
  if (p.userEmail) orders = orders.filter(function (o) { return String(o.userEmail).toLowerCase() === String(p.userEmail).toLowerCase(); });
  return { success: true, data: { orders: orders, cutoff: breakfastCutoffInfo() } };
}

function cancelMealOrder(p) {
  var meal = String(p.meal || '').toLowerCase();
  if (meal !== 'breakfast' && meal !== 'lunch' && meal !== 'dinner') {
    return { success: false, error: 'meal must be breakfast, lunch, or dinner' };
  }
  var sheet = meal === 'breakfast' ? 'Breakfast Orders' : (meal === 'lunch' ? 'Lunch Orders' : 'Dinner Orders');
  var info = meal === 'breakfast' ? breakfastCutoffInfo() : (meal === 'lunch' ? lunchCutoffInfo() : dinnerCutoffInfo());
  {
    // 3.0.0: after the cutoff (setting) an order can't be changed or cancelled — except withdrawing your own pending late request
    if (!info.open || (p.serviceDate && String(p.serviceDate).slice(0, 10) !== info.serviceDate)) {
      var existingLate = sheetToObjects(sheet).filter(function (o) {
        return String(o.userEmail).toLowerCase() === String(p.userEmail || p.requesterEmail || '').toLowerCase()
          && String(o.serviceDate).indexOf(String(p.serviceDate || info.serviceDate)) === 0
          && o.status === 'late_pending';
      });
      if (!existingLate.length) {
        return { success: false, error: 'Orders closed at ' + r3Label(info.cutoff) + ' Fiji — this ' + meal + ' order can no longer be changed or cancelled', cutoff: info, needsLateRequest: true };
      }
    }
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  if (!email) return { success: false, error: 'User required' };
  var serviceDate = p.serviceDate || info.serviceDate;
  var existing = sheetToObjects(sheet).filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled';
  });
  if (!existing.length) {
    return { success: false, error: 'No active ' + meal + ' order to cancel', cutoff: info };
  }
  // 3.0: every cancel keeps a reason; breakfast / lunch allow 3 cancels per day
  var reason = String(p.cancelReason || p.reason || '').replace(/[\r\n\t]+/g, ' ').trim().substring(0, 200) || 'No reason given (older app)';
  var used = meal === 'dinner' ? 0 : v3CancelCount(sheet, email, String(serviceDate).slice(0, 10));
  if (meal !== 'dinner' && used >= V3_CANCEL_LIMIT) {
    return { success: false, error: 'Cancel limit reached for ' + meal + ' on ' + serviceDate, blocked: true, cutoff: info };
  }
  r3EnsureCancelCols(sheet); // 3.0.0: the reason column must exist or the reason is silently dropped
  var o = updateRowById(sheet, existing[0].id, { status: 'cancelled', cancelReason: reason, cancelledAt: nowIso(), cancelledBy: email });
  if (o && !o.cancelReason) o.cancelReason = reason;
  return { success: !!o, data: { order: o, reason: reason, cutoff: info, cancelsUsed: used + 1, cancelLimit: meal === 'dinner' ? null : V3_CANCEL_LIMIT } };
}

/* ========== C100: MY ORDERS SUMMARY (read-only) ========== */

/**
 * getMyOrdersSummary — the requester's own B/L/D + boat bookings for Fiji
 * yesterday / today / tomorrow in ONE call.
 * Read-only: no processDinnerWorkflow / processBreakfastWorkflow, no writes.
 * Each sheet is read once and filtered by email + the 3 service dates.
 * Uses requesterEmail (the logged-in user) — ignores any other userEmail.
 */
function getMyOrdersSummary(p) {
  var t0 = Date.now();
  p = p || {};
  var email = String(p.requesterEmail || p.email || p.userEmail || '').trim().toLowerCase();
  if (!email) return { success: false, error: 'requesterEmail required' };

  var now = getFijiNow();
  var hour = now.getUTCHours();
  var dates = {
    yesterday: fijiDateString(addFijiDays(now, -1)),
    today: fijiDateString(now),
    tomorrow: fijiDateString(addFijiDays(now, 1))
  };
  var dateList = [dates.yesterday, dates.today, dates.tomorrow];
  function keyOf(v) { return String(v || '').slice(0, 10); }
  function inDates(v) { return dateList.indexOf(keyOf(v)) >= 0; }
  function isMine(o) { return String(o.userEmail || '').trim().toLowerCase() === email; }
  function isInactive(st) { st = String(st || ''); return st === 'cancelled' || st === 'rejected' || st === 'declined'; }

  // Pick one row per date: latest active row, else latest (cancelled/rejected) row.
  function pickByDate(rows) {
    var out = {};
    rows.forEach(function (o) {
      var d = keyOf(o.serviceDate);
      var cur = out[d];
      if (!cur) { out[d] = o; return; }
      var curActive = !isInactive(cur.status), oActive = !isInactive(o.status);
      if (oActive && !curActive) out[d] = o;
      else if (oActive === curActive && (o._row || 0) > (cur._row || 0)) out[d] = o;
    });
    return out;
  }
  function readMine(sheet) {
    return sheetToObjects(sheet).filter(function (o) { return isMine(o) && inDates(o.serviceDate); });
  }

  var bRows = pickByDate(readMine('Breakfast Orders'));
  var lRows = pickByDate(readMine('Lunch Orders'));
  var dRows = pickByDate(readMine('Dinner Orders'));

  // Boat: bookings for this user, then runs only if needed.
  var myBookings = sheetToObjects('Boat Bookings').filter(isMine);
  var runMap = {};
  if (myBookings.length) {
    var wantRuns = {};
    myBookings.forEach(function (b) { wantRuns[String(b.runId)] = true; });
    sheetToObjects('Boat Runs').forEach(function (r) {
      if (wantRuns[String(r.id)] && inDates(r.date)) runMap[String(r.id)] = r;
    });
  }

  // Read-only projection of the dinner auto-approve waves (12/17/19 Fiji)
  function dinnerEffectiveStatus(o, serviceDate) {
    var st = String(o.status || '');
    if (st !== 'pending' || truthy(o.late)) return st;
    var h = serviceDate <= dates.today ? 24 : hour; // ordering day already over
    var threshold = h >= 19 ? 19 : (h >= 17 ? 17 : (h >= 12 ? 12 : 0));
    return parseFijiHourFromCreatedAt(o.createdAt) < threshold ? 'approved' : st;
  }
  function mealOut(o, meal, serviceDate) {
    if (!o) return { ordered: false, status: 'not_ordered', late: false };
    var st = String(o.status || '');
    var eff = meal === 'dinner' ? dinnerEffectiveStatus(o, serviceDate) : st;
    var out = {
      ordered: !isInactive(st),
      id: o.id,
      status: st,
      effectiveStatus: eff,
      late: truthy(o.late),
      notes: o.notes || '',
      specialNote: kitchenNoteOf(o),
      createdAt: o.createdAt || ''
    };
    if (meal === 'breakfast' || meal === 'lunch') {
      out.qty = out.ordered ? 1 : 0;
      out.counted = (meal === 'breakfast') ? countsInBreakfastTotal(o) : countedMealStatus(st);
    }
    if (meal === 'dinner') {
      out.items = o.mealChoice ? [{ name: String(o.mealChoice), qty: 1 }] : [];
    }
    return out;
  }

  var bi = breakfastCutoffInfo(now), li = lunchCutoffInfo(now), di = dinnerCutoffInfo(now);
  var days = {};
  ['yesterday', 'today', 'tomorrow'].forEach(function (k) {
    var d = dates[k];
    var boats = myBookings.filter(function (b) { return runMap[String(b.runId)] && keyOf(runMap[String(b.runId)].date) === d; })
      .map(function (b) {
        var r = runMap[String(b.runId)];
        return {
          id: b.id, runId: b.runId, date: keyOf(r.date), time: String(r.time || ''), route: r.route || '',
          seats: Number(b.seats || 1), status: String(b.status || 'confirmed'), notes: b.notes || ''
        };
      })
      .sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    days[k] = {
      key: k,
      date: d,
      weekday: WEEKDAY_NAMES[new Date(d + 'T12:00:00Z').getUTCDay()],
      readOnly: k !== 'tomorrow',
      breakfast: mealOut(bRows[d], 'breakfast', d),
      lunch: mealOut(lRows[d], 'lunch', d),
      dinner: mealOut(dRows[d], 'dinner', d),
      boats: boats
    };
  });

  return {
    success: true,
    data: {
      email: email,
      fijiNow: formatFiji(now),
      dates: dates,
      days: days,
      cutoffs: {
        serviceDate: dates.tomorrow,
        breakfast: { open: bi.open, lateOpen: bi.lateOpen, fullyClosed: bi.fullyClosed, label: bi.open ? 'Open until 1:00pm today' : (bi.lateOpen ? 'Late request until 6:00pm (needs chef OK)' : 'Closed after 6:00pm') },
        lunch: { open: li.open, label: li.open ? 'Open until 1:00pm today' : 'Closed at 1:00pm' },
        dinner: { open: di.open, label: di.open ? 'Open until 8:00pm today' : 'Closed at 8:00pm — late requests need chef OK' }
      },
      ms: Date.now() - t0
    }
  };
}

function findOrder(sheet, id) {
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

function getDinnerOrders(p) {
  var wf = processDinnerWorkflow(p);
  var orders = sheetToObjects('Dinner Orders');
  if (p.serviceDate) orders = orders.filter(function (o) { return String(o.serviceDate).indexOf(String(p.serviceDate)) === 0; });
  if (p.userEmail) orders = orders.filter(function (o) { return String(o.userEmail).toLowerCase() === String(p.userEmail).toLowerCase(); });
  var menus = getDinnerMenus({ serviceDate: (p.serviceDate || dinnerCutoffInfo().serviceDate) });
  return {
    success: true,
    data: {
      orders: orders,
      cutoff: dinnerCutoffInfo(),
      menus: (menus.data && menus.data.items) || [],
      workflow: wf.data
    }
  };
}

function getLunchOrders(p) {
  var orders = sheetToObjects('Lunch Orders');
  if (p.serviceDate) orders = orders.filter(function (o) { return String(o.serviceDate).indexOf(String(p.serviceDate)) === 0; });
  if (p.userEmail) orders = orders.filter(function (o) { return String(o.userEmail).toLowerCase() === String(p.userEmail).toLowerCase(); });
  return { success: true, data: { orders: orders, cutoff: lunchCutoffInfo() } };
}

function last7MealStats(serviceDate) {
  var dinners = sheetToObjects('Dinner Orders').filter(function (o) {
    return o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'special_pending';
  });
  var lunches = sheetToObjects('Lunch Orders').filter(function (o) {
    return countedMealStatus(o.status);
  });
  var breakfasts = sheetToObjects('Breakfast Orders');
  var parts = String(serviceDate).split('-');
  var end = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(end.getTime() - i * 86400000);
    var ds = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    var b = breakfasts.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0 && countsInBreakfastTotal(o); }).length;
    var l = lunches.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0; }).length;
    var din = dinners.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0; }).length;
    days.push({ date: ds, breakfast: b, lunch: l, dinner: din, total: b + l + din });
  }
  return days;
}

function getKitchenDashboard(p) {
  try { requireKitchenOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  var wf = processDinnerWorkflow(p);
  var bwf = processBreakfastWorkflow(p);
  var dinnerInfo = dinnerCutoffInfo();
  var lunchInfo = lunchCutoffInfo();
  var breakfastInfo = breakfastCutoffInfo();
  var dinnerDate = p.dinnerDate || dinnerInfo.serviceDate;
  var lunchDate = p.lunchDate || lunchInfo.serviceDate;
  var breakfastDate = p.breakfastDate || breakfastInfo.serviceDate;
  var dinners = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(dinnerDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'special_pending';
  });
  var lunches = sheetToObjects('Lunch Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(lunchDate) === 0 && countedMealStatus(o.status);
  });
  var breakfastsAll = sheetToObjects('Breakfast Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(breakfastDate) === 0 && o.status !== 'cancelled';
  });
  var kNameMap = preferredNameMap();
  decorateOrderNotes(dinners, kNameMap);
  decorateOrderNotes(lunches, kNameMap);
  decorateOrderNotes(breakfastsAll, kNameMap);
  var breakfasts = breakfastsAll.filter(countsInBreakfastTotal);
  var lateBreakfastPending = breakfastsAll.filter(function (o) { return o.status === 'late_pending'; });
  var lateBreakfast = breakfastsAll.filter(function (o) { return truthy(o.late); });
  var lateDinner = dinners.filter(function (o) { return truthy(o.late); });
  var lateLunch = lunches.filter(function (o) { return truthy(o.late); });

  function tally(orders) {
    var map = {};
    orders.forEach(function (o) {
      var k = o.mealChoice || 'Standard';
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  var pending = dinners.filter(function (o) { return o.status === 'pending' || o.status === 'late_pending'; });
  var approved = dinners.filter(function (o) {
    return o.status === 'approved' || o.status === 'late_approved' || o.status === 'prepared' || o.status === 'served';
  });
  var menus = getDinnerMenus({ serviceDate: dinnerDate });

  return {
    success: true,
    data: {
      breakfastDate: breakfastDate,
      dinnerDate: dinnerDate,
      lunchDate: lunchDate,
      breakfast: {
        total: breakfasts.length,
        orders: breakfastsAll,
        counted: breakfasts,
        late: lateBreakfast,
        latePending: lateBreakfastPending,
        lateCount: lateBreakfast.length,
        latePendingCount: lateBreakfastPending.length,
        cutoff: breakfastInfo,
        serviceDate: breakfastDate
      },
      dinner: {
        orders: dinners,
        late: lateDinner,
        tally: tally(dinners),
        cutoff: dinnerInfo,
        pendingCount: pending.length,
        approvedCount: approved.length,
        lateCount: lateDinner.length,
        total: dinners.length
      },
      lunch: {
        total: lunches.length,
        orders: lunches,
        late: lateLunch,
        tally: tally(lunches),
        cutoff: lunchInfo,
        serviceDate: lunchDate
      },
      stats: {
        tomorrowTotal: dinners.length,
        perItem: tally(dinners),
        lateCount: lateDinner.length,
        approved: approved.length,
        pending: pending.length,
        last7Days: last7MealStats(dinnerDate)
      },
      specialNotes: (function () {
        var sb = kitchenNoteEntries('breakfast', breakfastsAll, kNameMap);
        var sl = kitchenNoteEntries('lunch', lunches, kNameMap);
        var sd = kitchenNoteEntries('dinner', dinners, kNameMap);
        var all = sd.concat(sb, sl);
        return {
          breakfast: sb, lunch: sl, dinner: sd,
          total: all.length,
          allergyCount: all.filter(function (x) { return x.flag === 'allergy'; }).length
        };
      })(),
      menus: (menus.data && menus.data.items) || [],
      workflow: wf.data,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

function markOrderStatus(p) {
  var meal = String(p.meal || '').toLowerCase();
  var sheet = 'Dinner Orders';
  if (meal === 'lunch') sheet = 'Lunch Orders';
  else if (meal === 'breakfast') sheet = 'Breakfast Orders';
  // 3.0: Chef station (or superadmin) only; records who marked it (the name picked on the station device)
  var requester = getRequester(p);
  if (!requester || !isChefPerm(requester)) return { success: false, error: 'Chef station (or superadmin) only' };
  var st = String(p.status || 'prepared');
  if (['prepared', 'served', 'ordered'].indexOf(st) < 0) return { success: false, error: 'status must be prepared, served or ordered' };
  try { var msh = getSS().getSheetByName(sheet); if (msh && msh.getLastRow() > 0) ensureColumns(msh, ['statusBy', 'statusAt']); } catch (e) {}
  var o = updateRowById(sheet, p.id, { status: st, statusBy: requesterTag(requester), statusAt: nowIso() });
  return { success: !!o, data: { order: o } };
}

/* ========== REMINDERS ========== */

function reminderIsImportant(r) {
  return r.important === true || r.important === 'TRUE' || r.important === 1 ||
    String(r.priority || '').toLowerCase() === 'high';
}

function sortReminders(rows) {
  rows.sort(function (a, b) {
    var ai = reminderIsImportant(a) ? 1 : 0;
    var bi = reminderIsImportant(b) ? 1 : 0;
    if (bi !== ai) return bi - ai;
    return String(b.dueDate || b.createdAt || '').localeCompare(String(a.dueDate || a.createdAt || ''));
  });
  return rows;
}

function getReminders(p) {
  // C35: global broadcast reminders for all staff (active / not done)
  var rows = cachedRows('Reminders').filter(function (r) { // 2.10.0 cached ~5 min
    return !(r.done === true || r.done === 'TRUE' || r.done === 1);
  });
  sortReminders(rows);
  return { success: true, data: { reminders: rows } };
}

function addReminder(p) {
  var remBy = getRequester(p); // 3.0: only admin / superadmin manage reminders
  if (!remBy || !isAdminPerm(remBy)) return { success: false, error: 'Only admins manage reminders' };
  var priority = String(p.priority || 'normal').toLowerCase() === 'high' ? 'high' : 'normal';
  var important = p.important === true || p.important === 'true' || p.important === 'TRUE' || p.important === 1 || priority === 'high';
  var row = {
    id: uid('rem'),
    userEmail: '', // broadcast — not per-user
    title: p.title || '',
    body: p.body || '',
    dueDate: p.dueDate || '',
    done: false,
    priority: priority,
    important: important,
    audience: 'all',
    createdAt: nowIso()
  };
  appendRow('Reminders', row, ['id', 'userEmail', 'title', 'body', 'dueDate', 'done', 'priority', 'important', 'audience', 'createdAt']);
  return { success: true, data: { reminder: row } };
}

function completeReminder(p) {
  var remBy = getRequester(p); // 3.0: only admin / superadmin manage reminders
  if (!remBy || !isAdminPerm(remBy)) return { success: false, error: 'Only admins manage reminders' };
  var r = updateRowById('Reminders', p.id, { done: true });
  return { success: !!r, data: { reminder: r } };
}

function deleteReminder(p) {
  var remBy = getRequester(p); // 3.0: only admin / superadmin manage reminders
  if (!remBy || !isAdminPerm(remBy)) return { success: false, error: 'Only admins manage reminders' };
  var rows = sheetToObjects('Reminders');
  var found = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].id === p.id) found = rows[i];
  if (!found) return { success: false, error: 'Not found' };
  getSS().getSheetByName('Reminders').deleteRow(found._row);
  scInvalidateSheet('Reminders'); // 2.10.0
  return { success: true };
}

/* ========== SUGGESTIONS ========== */

function isAdminRequester(p) {
  var email = String(p.requesterEmail || p.userEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return false;
  var r = u.role;
  return r === 'super_admin' || r === 'admin' || r === 'hod';
}

function normalizeSuggestion(s) {
  var likes = Number(s.likes || 0);
  var dislikes = Number(s.dislikes || 0);
  if (!likes && !dislikes && s.voters) {
    String(s.voters).split(',').forEach(function (part) {
      part = String(part || '').trim();
      if (!part) return;
      if (part.indexOf(':dislike') >= 0) dislikes++;
      else likes++;
    });
  }
  s.likes = likes;
  s.dislikes = dislikes;
  s.votes = Number(s.votes != null && s.votes !== '' ? s.votes : (likes - dislikes));
  return s;
}

function getSuggestions(p) {
  var adminView = (p.adminView === true || p.adminView === 'true' || p.adminView === '1') && isAdminRequester(p);
  var rows = cachedRows('Suggestions').map(normalizeSuggestion); // 2.10.0 cached ~2 min
  if (!adminView) {
    rows = rows.filter(function (s) {
      var st = String(s.status || 'open').toLowerCase();
      return st === 'approved' || st === 'open'; // legacy open = approved
    }).map(function (s) {
      return {
        id: s.id,
        title: s.title,
        body: s.body,
        votes: s.votes,
        likes: s.likes,
        dislikes: s.dislikes,
        createdAt: s.createdAt,
        status: s.status === 'open' ? 'approved' : s.status
        // intentionally omit userEmail / userName (anonymous to staff)
      };
    });
  }
  rows.sort(function (a, b) {
    return Number(b.likes != null ? b.likes : b.votes || 0) - Number(a.likes != null ? a.likes : a.votes || 0);
  });
  return { success: true, data: { suggestions: rows, adminView: !!adminView } };
}

function addSuggestion(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  var row = {
    id: uid('sug'),
    userEmail: email,
    userName: u ? ((u.firstName || '') + ' ' + (u.lastName || '')).trim() : email,
    title: p.title || '',
    body: p.body || '',
    votes: 0,
    likes: 0,
    dislikes: 0,
    voters: '',
    createdAt: nowIso(),
    status: 'pending' // C36
  };
  appendRow('Suggestions', row, ['id', 'userEmail', 'userName', 'title', 'body', 'votes', 'likes', 'dislikes', 'voters', 'createdAt', 'status']);
  return {
    success: true,
    data: {
      suggestion: {
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        votes: 0,
        likes: 0,
        dislikes: 0
      }
    }
  };
}

function approveSuggestion(p) {
  requirePasscode(p, 'admin');
  var r = updateRowById('Suggestions', p.id, { status: 'approved' });
  return { success: !!r, data: { suggestion: r } };
}

function rejectSuggestion(p) {
  requirePasscode(p, 'admin');
  var r = updateRowById('Suggestions', p.id, { status: 'rejected' });
  return { success: !!r, data: { suggestion: r } };
}

function voteSuggestion(p) {
  var rows = sheetToObjects('Suggestions');
  var found = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(p.id)) found = rows[i];
  if (!found) return { success: false, error: 'Not found' };
  var st = String(found.status || 'open').toLowerCase();
  if (st !== 'approved' && st !== 'open') return { success: false, error: 'Suggestion not approved yet' };
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  if (!email) return { success: false, error: 'User required' };
  var dir = String(p.vote || p.direction || 'like').toLowerCase();
  if (dir === 'up' || dir === 'upvote') dir = 'like';
  if (dir === 'down' || dir === 'downvote') dir = 'dislike';
  if (dir !== 'like' && dir !== 'dislike') dir = 'like';

  var map = {};
  String(found.voters || '').split(',').forEach(function (part) {
    part = String(part || '').trim();
    if (!part) return;
    var bits = part.split(':');
    if (bits.length >= 2) map[bits[0].toLowerCase()] = bits[1];
    else map[bits[0].toLowerCase()] = 'like';
  });
  var prev = map[email];
  if (prev === dir) return { success: false, error: 'Already ' + dir + 'd' };
  map[email] = dir;

  var likes = 0, dislikes = 0;
  var voterParts = [];
  Object.keys(map).forEach(function (em) {
    voterParts.push(em + ':' + map[em]);
    if (map[em] === 'dislike') dislikes++; else likes++;
  });
  var votes = likes - dislikes;
  updateRowById('Suggestions', found.id, {
    votes: votes,
    likes: likes,
    dislikes: dislikes,
    voters: voterParts.join(',')
  });
  return { success: true, data: { votes: votes, likes: likes, dislikes: dislikes, myVote: dir } };
}

/* ========== LEAVE / SCHEDULE (C40 escalation) ========== */

function getLeaveRequests(p) {
  var requester = getRequester(p);
  if (!requester) return { success: false, error: 'Login required' };
  var rows = sheetToObjects('Leave Requests');
  // 3.0: staff only ever see their own leave; department leads see their department; admin all
  if (!isAdminPerm(requester)) {
    var meL = String(requester.email).toLowerCase();
    rows = rows.filter(function (r) {
      return String(r.userEmail).toLowerCase() === meL || (isDeptLead(requester) && normDept(r.department) === normDept(requester.department));
    });
  }
  if (p.userEmail) {
    rows = rows.filter(function (r) { return String(r.userEmail).toLowerCase() === String(p.userEmail).toLowerCase(); });
  }
  if (p.department) rows = rows.filter(function (r) { return r.department === p.department; });
  // HOD inbox: department only when escalation on
  if (p.inbox === 'hod' && requester && isHodPerm(requester) && !isAdminPerm(requester)) {
    rows = rows.filter(function (r) { return String(r.department) === String(requester.department); });
  }
  if (p.status) {
    var st = String(p.status);
    rows = rows.filter(function (r) { return String(r.status) === st; });
  }
  return {
    success: true,
    data: {
      requests: rows,
      escalation: isFeatureEnabled('feature_leave_escalation')
    }
  };
}

function getMySchedule(p) {
  if (!isFeatureEnabled('feature_my_schedule')) {
    return { success: false, error: featureOffMessage('feature_my_schedule'), featureOff: true };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  var leave = sheetToObjects('Leave Requests').filter(function (r) {
    return String(r.userEmail).toLowerCase() === email;
  });
  var live = null;
  var liveError = '';
  if (isFeatureEnabled('feature_live_roster') && u) {
    try {
      live = parseLiveRosterForUser(u);
    } catch (err) {
      liveError = String(err.message || err);
    }
  }
  var uploaded = getUploadedRosterForUser(email);
  var unread = sheetToObjects('Notifications').filter(function (n) {
    return String(n.userEmail).toLowerCase() === email && !truthy(n.read);
  });
  return {
    success: true,
    data: {
      user: publicUser(u),
      roster: u ? u.roster : '',
      leave: leave,
      liveRoster: live,
      liveRosterError: liveError || undefined,
      featureLiveRoster: isFeatureEnabled('feature_live_roster'),
      featureLeaveEscalation: isFeatureEnabled('feature_leave_escalation'),
      featureMySchedule: isFeatureEnabled('feature_my_schedule'),
      weeklyShifts: uploaded.weeklyShifts,
      monthlyShifts: uploaded.monthlyShifts,
      unreadNotifications: unread,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

/* ========== LIVE ROSTER (C41) — read-only external sheet ========== */

function getLiveRoster(p) {
  if (!isFeatureEnabled('feature_live_roster')) {
    return { success: false, error: featureOffMessage('feature_live_roster'), featureOff: true };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  try {
    var data = parseLiveRosterForUser(u);
    return { success: true, data: data };
  } catch (err) {
    return { success: false, error: 'Roster parse failed: ' + (err.message || err), canDisable: true };
  }
}

function getDepartmentRoster(p) {
  if (!isFeatureEnabled('feature_live_roster')) {
    return { success: false, error: featureOffMessage('feature_live_roster'), featureOff: true };
  }
  var requester = getRequester(p);
  if (!requester || !(isHodPerm(requester) || isAdminPerm(requester))) {
    return { success: false, error: 'HOD/admin required for department roster' };
  }
  var dept = p.department || requester.department || '';
  if (!isAdminPerm(requester)) dept = requester.department;
  try {
    var parsed = parseLiveRosterSheet(dept);
    return { success: true, data: { department: dept, roster: parsed, fijiNow: formatFiji(getFijiNow()) } };
  } catch (err) {
    return { success: false, error: 'Roster parse failed: ' + (err.message || err), canDisable: true };
  }
}

function openLiveRosterSS() {
  return SpreadsheetApp.openById(LIVE_ROSTER_SHEET_ID);
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(staffFirst, staffLast, cellName) {
  var cell = normalizeName(cellName);
  if (!cell) return false;
  var first = normalizeName(staffFirst);
  var last = normalizeName(staffLast);
  var full = (first + ' ' + last).trim();
  if (full && (cell === full || cell.indexOf(full) === 0 || full.indexOf(cell) === 0)) return true;
  if (first && (cell === first || cell.indexOf(first + ' ') === 0 || cell.split(' ')[0] === first)) return true;
  if (first && last && cell.indexOf(first) >= 0 && cell.indexOf(last) >= 0) return true;
  return false;
}

/**
 * Best-effort parser for CSV-like dept roster tabs:
 * dept header row, date row, name rows with Start/End pairs, DAY OFF.
 * Does NOT modify the roster spreadsheet.
 */
function parseLiveRosterSheet(departmentFilter) {
  var ss = openLiveRosterSS();
  var sheets = ss.getSheets();
  var result = { tabs: [], weeks: [], shifts: [], parseNotes: [] };
  var deptFilter = normalizeName(departmentFilter || '');

  sheets.forEach(function (sh) {
    var name = sh.getName();
    var values = sh.getDataRange().getDisplayValues();
    if (!values || values.length < 2) return;

    // Guess department from tab name or first non-empty cell
    var deptGuess = name;
    for (var r0 = 0; r0 < Math.min(5, values.length); r0++) {
      for (var c0 = 0; c0 < Math.min(8, values[r0].length); c0++) {
        var cell = String(values[r0][c0] || '').trim();
        if (cell && cell.length > 2 && !/^\d/.test(cell) && !/start|end|date|day/i.test(cell)) {
          deptGuess = cell;
          break;
        }
      }
      if (deptGuess !== name) break;
    }

    if (deptFilter) {
      var ng = normalizeName(deptGuess);
      var nn = normalizeName(name);
      if (ng.indexOf(deptFilter) === -1 && deptFilter.indexOf(ng) === -1 &&
          nn.indexOf(deptFilter) === -1 && deptFilter.indexOf(nn) === -1) {
        // also allow BAR vs Bar etc.
        if (nn !== deptFilter && ng !== deptFilter) return;
      }
    }

    var tabInfo = { tab: name, department: deptGuess, people: [] };
    // Find a date header row: cells that look like dates or weekdays
    var dateRowIdx = -1;
    var dates = [];
    for (var r = 0; r < Math.min(12, values.length); r++) {
      var dateHits = 0;
      var rowDates = [];
      for (var c = 0; c < values[r].length; c++) {
        var v = String(values[r][c] || '').trim();
        var d = tryParseRosterDate(v);
        rowDates.push(d);
        if (d) dateHits++;
      }
      if (dateHits >= 3) {
        dateRowIdx = r;
        dates = rowDates;
        break;
      }
    }
    if (dateRowIdx < 0) {
      result.parseNotes.push('No date row in tab ' + name);
      // still try name-based rows with DAY OFF / times
    }

    // Name column: usually col 0 or 1
    for (var r = (dateRowIdx >= 0 ? dateRowIdx + 1 : 1); r < values.length; r++) {
      var row = values[r];
      var personName = '';
      var nameCol = 0;
      for (var c = 0; c < Math.min(3, row.length); c++) {
        var cand = String(row[c] || '').trim();
        if (cand && !/^(start|end|am|pm|total)$/i.test(cand) && !/^\d{1,2}:\d{2}/.test(cand)) {
          personName = cand;
          nameCol = c;
          break;
        }
      }
      if (!personName || /^department|roster|name|staff$/i.test(personName)) continue;

      var dayShifts = [];
      var isDayOff = false;
      for (var c = nameCol + 1; c < row.length; c++) {
        var cellVal = String(row[c] || '').trim();
        if (!cellVal) continue;
        if (/day\s*off|off|rdo|leave/i.test(cellVal)) {
          isDayOff = true;
          dayShifts.push({
            date: dates[c] || '',
            start: '',
            end: '',
            dayOff: true,
            raw: cellVal
          });
          continue;
        }
        // Start/End pairs: either "07:00-16:00" or separate Start/End columns
        var range = cellVal.match(/(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})/i);
        if (range) {
          dayShifts.push({
            date: dates[c] || '',
            start: range[1],
            end: range[2],
            dayOff: false,
            raw: cellVal
          });
          continue;
        }
        var timeOnly = cellVal.match(/^(\d{1,2}:\d{2})\s*(am|pm)?$/i);
        if (timeOnly) {
          // look ahead for End
          var next = String(row[c + 1] || '').trim();
          var nextTime = next.match(/^(\d{1,2}:\d{2})/);
          dayShifts.push({
            date: dates[c] || dates[c - 1] || '',
            start: timeOnly[1] + (timeOnly[2] ? timeOnly[2] : ''),
            end: nextTime ? nextTime[1] : '',
            dayOff: false,
            raw: cellVal + (nextTime ? '-' + next : '')
          });
          if (nextTime) c++; // skip end col
        }
      }
      if (!dayShifts.length && !isDayOff) {
        // row may just be a label
        var joined = row.join(' ');
        if (/day\s*off/i.test(joined)) {
          dayShifts.push({ date: '', start: '', end: '', dayOff: true, raw: 'DAY OFF' });
        }
      }
      if (dayShifts.length) {
        tabInfo.people.push({ name: personName, shifts: dayShifts });
        dayShifts.forEach(function (s) {
          result.shifts.push({
            department: deptGuess,
            tab: name,
            name: personName,
            date: s.date,
            start: s.start,
            end: s.end,
            dayOff: !!s.dayOff,
            raw: s.raw
          });
        });
      }
    }
    result.tabs.push(tabInfo);
  });

  return result;
}

function tryParseRosterDate(v) {
  v = String(v || '').trim();
  if (!v) return '';
  // yyyy-mm-dd or dd/mm/yyyy or dd-mm-yyyy or "Mon 10/9"
  var iso = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var dmy = v.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    var y = dmy[3].length === 2 ? ('20' + dmy[3]) : dmy[3];
    return y + '-' + pad2(Number(dmy[2])) + '-' + pad2(Number(dmy[1]));
  }
  var md = v.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})[\/\-](\d{1,2})/i);
  if (md) {
    var now = getFijiNow();
    var year = now.getUTCFullYear();
    return year + '-' + pad2(Number(md[2])) + '-' + pad2(Number(md[1]));
  }
  return '';
}

function parseLiveRosterForUser(u) {
  var dept = u.department || '';
  var parsed = parseLiveRosterSheet(dept);
  var myShifts = [];
  parsed.shifts.forEach(function (s) {
    if (namesMatch(u.firstName, u.lastName, s.name)) myShifts.push(s);
  });
  // week window: today .. +6 Fiji
  var now = getFijiNow();
  var weekDates = [];
  for (var i = 0; i < 7; i++) {
    weekDates.push(fijiDateString(addFijiDays(now, i)));
  }
  var weekShifts = myShifts.filter(function (s) {
    if (!s.date) return true;
    return weekDates.indexOf(String(s.date).substring(0, 10)) >= 0;
  });
  return {
    department: dept,
    matchedName: myShifts.length ? myShifts[0].name : null,
    matched: myShifts.length > 0,
    weekDates: weekDates,
    shifts: weekShifts,
    allMatched: myShifts,
    tabsScanned: parsed.tabs.map(function (t) { return t.tab; }),
    parseNotes: parsed.parseNotes,
    fijiNow: formatFiji(now)
  };
}


/* ========== UPLOADED ROSTER (C55) — Excel/CSV parsed client-side ========== */

var ROSTER_UPLOAD_HEADERS = [
  'id', 'period', 'department', 'fileName', 'fileType', 'uploadedBy', 'uploadedAt',
  'rowCount', 'matchedCount', 'unmatchedJson', 'notes'
];
var ROSTER_SHIFT_HEADERS = [
  'id', 'uploadId', 'period', 'userEmail', 'userName', 'department', 'date',
  'start', 'end', 'dayOff', 'roleLabel', 'rawName', 'createdAt'
];
var NOTIFICATION_HEADERS = [
  'id', 'userEmail', 'title', 'body', 'kind', 'relatedId', 'read', 'createdAt'
];

function requireRosterUploadAuth(p) {
  var requester = getRequester(p);
  if (!requester) throw new Error('Login required');
  if (isAdminPerm(requester)) {
    requirePasscode(p, 'admin');
    return requester;
  }
  var perms = userPermissions(requester);
  if (perms.indexOf('hod') >= 0 || perms.indexOf('assistant_hod') >= 0) {
    return requester;
  }
  throw new Error('HOD / assistant_hod / admin required to upload roster');
}

function fijiWeekRange(now) {
  now = now || getFijiNow();
  var day = now.getUTCDay(); // 0=Sun
  var mondayOffset = day === 0 ? -6 : 1 - day;
  var monday = addFijiDays(now, mondayOffset);
  var days = [];
  for (var i = 0; i < 7; i++) days.push(fijiDateString(addFijiDays(monday, i)));
  return { start: days[0], end: days[6], dates: days };
}

function fijiMonthRange(now) {
  now = now || getFijiNow();
  var y = now.getUTCFullYear();
  var m = now.getUTCMonth(); // 0-based
  var lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  var start = y + '-' + pad2(m + 1) + '-01';
  var end = y + '-' + pad2(m + 1) + '-' + pad2(lastDay);
  return { start: start, end: end, year: y, month: m + 1 };
}

function shiftFingerprint(s) {
  return [
    String(s.date || '').substring(0, 10),
    String(s.start || ''),
    String(s.end || ''),
    truthy(s.dayOff) ? '1' : '0',
    String(s.roleLabel || '')
  ].join('|');
}

function shiftsFingerprintList(list) {
  return (list || []).map(shiftFingerprint).sort().join(';');
}

function deleteSheetRowsByPredicate(sheetName, predicate) {
  // 3.4.0: no row-by-row deletes — contiguous blocks, or keep-rows rewrite (Roster34.gs r34DeleteWhere)
  if (typeof r34DeleteWhere === 'function') return r34DeleteWhere(sheetName, predicate);
  var rows = sheetToObjects(sheetName);
  var sh = getSS().getSheetByName(sheetName);
  if (!sh) return 0;
  var toDelete = [];
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) toDelete.push(rows[i]._row);
  }
  toDelete.sort(function (a, b) { return b - a; });
  for (var j = 0; j < toDelete.length; j++) {
    sh.deleteRow(toDelete[j]);
  }
  return toDelete.length;
}

function parseShiftsJsonParam(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return [raw];
  var s = String(raw);
  try {
    var parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.shifts)) return parsed.shifts;
    return [];
  } catch (e) {
    throw new Error('Invalid shiftsJson');
  }
}

/**
 * Match raw roster name (+ optional dept) to a Users row.
 * Tries: "first last", "last first", email local-part; prefers same department when ambiguous.
 */
function matchRosterNameToUser(rawName, rowDept, users) {
  var cell = normalizeName(rawName);
  if (!cell) return null;
  var deptNorm = normalizeName(rowDept || '');
  var candidates = [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (!truthy(u.active) && u.active !== '' && u.active !== undefined) {
      // still allow inactive? prefer active — skip clearly inactive
      if (u.active === false || u.active === 'FALSE' || u.active === 'false') continue;
    }
    var first = normalizeName(u.firstName);
    var last = normalizeName(u.lastName);
    var full = (first + ' ' + last).trim();
    var rev = (last + ' ' + first).trim();
    var local = String(u.email || '').split('@')[0].toLowerCase().replace(/[._]/g, ' ');
    local = normalizeName(local);
    var score = 0;
    if (full && cell === full) score = 100;
    else if (rev && cell === rev) score = 95;
    else if (full && (cell.indexOf(full) === 0 || full.indexOf(cell) === 0) && cell.length >= 3) score = 80;
    else if (first && last && cell.indexOf(first) >= 0 && cell.indexOf(last) >= 0) score = 85;
    else if (local && (cell === local || cell.replace(/\s/g, '') === local.replace(/\s/g, ''))) score = 70;
    else if (namesMatch(u.firstName, u.lastName, rawName)) score = 75;
    else continue;
    if (deptNorm) {
      var ud = normalizeName(u.department);
      if (ud && (ud === deptNorm || ud.indexOf(deptNorm) >= 0 || deptNorm.indexOf(ud) >= 0)) {
        score += 20;
      }
    }
    candidates.push({ user: u, score: score });
  }
  if (!candidates.length) return null;
  candidates.sort(function (a, b) { return b.score - a.score; });
  // ambiguous: top two same score without dept preference
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    if (deptNorm) {
      var withDept = candidates.filter(function (c) {
        var ud = normalizeName(c.user.department);
        return ud && (ud === deptNorm || ud.indexOf(deptNorm) >= 0 || deptNorm.indexOf(ud) >= 0);
      });
      if (withDept.length === 1) return withDept[0].user;
      if (withDept.length > 1) {
        withDept.sort(function (a, b) { return b.score - a.score; });
        return withDept[0].user;
      }
    }
    // still ambiguous — pick highest score first (stable)
  }
  return candidates[0].user;
}

function rosterDeptMatches(shiftDept, uploadDept) {
  var up = String(uploadDept || 'ALL').trim();
  if (!up || up.toUpperCase() === 'ALL') return true;
  var a = normalizeName(shiftDept);
  var b = normalizeName(up);
  if (!a || !b) return false;
  return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
}

/**
 * Replace policy (C55):
 * For upload period P and department D (or ALL):
 *   remove prior Roster Shifts where period=P AND (department matches D OR userEmail in matched set).
 * Chunk 0 performs department-scoped wipe; per matched user we also clear their remaining P shifts
 * so a cross-dept match still gets a clean replace. Re-upload is therefore clean for that scope.
 */
function uploadRosterParsed(p) {
  if (!isFeatureEnabled('feature_my_schedule')) {
    return { success: false, error: featureOffMessage('feature_my_schedule'), featureOff: true };
  }
  var requester = requireRosterUploadAuth(p);
  var period = String(p.period || '').toLowerCase();
  if (period !== 'week' && period !== 'month') {
    return { success: false, error: 'period must be week or month' };
  }
  var department = String(p.department || '').trim();
  if (!isAdminPerm(requester)) {
    department = String(requester.department || '').trim();
    if (!department) return { success: false, error: 'HOD department required' };
  }
  if (!department) department = 'ALL';

  var chunkIndex = Number(p.chunkIndex || 0);
  if (isNaN(chunkIndex) || chunkIndex < 0) chunkIndex = 0;
  var totalChunks = Number(p.totalChunks || 1);
  if (isNaN(totalChunks) || totalChunks < 1) totalChunks = 1;
  var isFinal = chunkIndex >= totalChunks - 1 || p.isFinal === true || String(p.isFinal) === 'true';
  var shiftsIn = parseShiftsJsonParam(p.shiftsJson);
  var fileName = String(p.fileName || 'roster.csv');
  var fileType = String(p.fileType || '').toLowerCase();
  if (!fileType) {
    if (/\.csv$/i.test(fileName)) fileType = 'csv';
    else if (/\.xlsx?$/i.test(fileName)) fileType = 'excel';
    else if (/\.pdf$/i.test(fileName)) fileType = 'pdf';
    else fileType = 'parsed';
  }
  var notes = String(p.notes || '');

  assertSheetsReady();
  var users = sheetToObjects('Users');
  var uploadId = String(p.uploadId || '').trim();
  var cache = CacheService.getScriptCache();
  var matchedEmails = {};
  var unmatchedNames = [];
  var matchedCountChunk = 0;

  if (chunkIndex === 0 || !uploadId) {
    uploadId = uid('rup');
    // Snapshot old shifts in replacement scope, then wipe by period+department
    var allOld = sheetToObjects('Roster Shifts').filter(function (s) {
      return String(s.period).toLowerCase() === period && rosterDeptMatches(s.department, department);
    });
    // Also include later-matched users outside dept — handled per-user below.
    // For ALL dept, wipe entire period.
    if (String(department).toUpperCase() === 'ALL') {
      allOld = sheetToObjects('Roster Shifts').filter(function (s) {
        return String(s.period).toLowerCase() === period;
      });
    }
    var oldByUser = {};
    allOld.forEach(function (s) {
      var em = String(s.userEmail || '').toLowerCase();
      if (!em) return;
      if (!oldByUser[em]) oldByUser[em] = [];
      oldByUser[em].push({
        date: String(s.date || '').substring(0, 10),
        start: String(s.start || ''),
        end: String(s.end || ''),
        dayOff: truthy(s.dayOff),
        roleLabel: String(s.roleLabel || '')
      });
    });
    try {
      cache.put('rold_' + uploadId, JSON.stringify(oldByUser), 600);
    } catch (eCache) {}
    try {
      cache.put('rum_' + uploadId, JSON.stringify([]), 600);
    } catch (e2) {}

    deleteSheetRowsByPredicate('Roster Shifts', function (s) {
      if (String(s.period).toLowerCase() !== period) return false;
      if (String(department).toUpperCase() === 'ALL') return true;
      return rosterDeptMatches(s.department, department);
    });

    appendRow('Roster Uploads', {
      id: uploadId,
      period: period,
      department: department,
      fileName: fileName,
      fileType: fileType,
      uploadedBy: requester.email,
      uploadedAt: nowIso(),
      rowCount: 0,
      matchedCount: 0,
      unmatchedJson: '[]',
      notes: notes
    }, ROSTER_UPLOAD_HEADERS);
  } else {
    var uploads = sheetToObjects('Roster Uploads');
    var foundUp = null;
    for (var ui = 0; ui < uploads.length; ui++) {
      if (String(uploads[ui].id) === uploadId) { foundUp = uploads[ui]; break; }
    }
    if (!foundUp) return { success: false, error: 'Unknown uploadId — restart upload from chunk 0' };
  }

  // Track unmatched across chunks in cache
  var unmatchedAcc = [];
  try {
    unmatchedAcc = JSON.parse(cache.get('rum_' + uploadId) || '[]');
  } catch (eU) { unmatchedAcc = []; }
  var clearedUsers = {};
  try {
    clearedUsers = JSON.parse(cache.get('rclr_' + uploadId) || '{}');
  } catch (eC) { clearedUsers = {}; }

  var createdAt = nowIso();
  for (var i = 0; i < shiftsIn.length; i++) {
    var row = shiftsIn[i] || {};
    var rawName = String(row.rawName || row.name || row.staff || '').trim();
    var rowDept = String(row.department || row.dept || department).trim();
    if (String(department).toUpperCase() !== 'ALL' && !row.department && !row.dept) {
      rowDept = department;
    }
    var date = String(row.date || '').trim();
    // normalize date if possible
    var parsedDate = tryParseRosterDate(date) || date;
    if (parsedDate) parsedDate = String(parsedDate).substring(0, 10);
    var start = String(row.start || '').trim();
    var end = String(row.end || '').trim();
    var dayOff = row.dayOff === true || row.dayOff === 'TRUE' || row.dayOff === 'true' || row.dayOff === 1 ||
      /^(yes|y|off|day\s*off)$/i.test(String(row.dayOff || ''));
    var roleLabel = String(row.roleLabel || row.role || '').trim();

    if (!rawName) {
      unmatchedNames.push('(blank name)');
      continue;
    }
    var matched = matchRosterNameToUser(rawName, rowDept, users);
    if (!matched) {
      unmatchedNames.push(rawName);
      unmatchedAcc.push(rawName);
      continue;
    }
    var em = String(matched.email).toLowerCase();
    matchedEmails[em] = true;
    matchedCountChunk++;

    // Ensure clean replace for this user in this period (covers cross-dept matches)
    if (!clearedUsers[em]) {
      deleteSheetRowsByPredicate('Roster Shifts', function (s) {
        return String(s.period).toLowerCase() === period &&
          String(s.userEmail).toLowerCase() === em &&
          String(s.uploadId) !== uploadId;
      });
      clearedUsers[em] = true;
    }

    appendRow('Roster Shifts', {
      id: uid('rsh'),
      uploadId: uploadId,
      period: period,
      userEmail: em,
      userName: String(matched.firstName || '') + ' ' + String(matched.lastName || ''),
      department: matched.department || rowDept,
      date: parsedDate,
      start: start,
      end: end,
      dayOff: dayOff,
      roleLabel: roleLabel,
      rawName: rawName,
      createdAt: createdAt
    }, ROSTER_SHIFT_HEADERS);
  }

  try { cache.put('rclr_' + uploadId, JSON.stringify(clearedUsers), 600); } catch (e3) {}
  // unique unmatched
  var seenU = {};
  var unmatchedUnique = [];
  unmatchedAcc.forEach(function (n) {
    var k = normalizeName(n);
    if (!k || seenU[k]) return;
    seenU[k] = true;
    unmatchedUnique.push(n);
  });
  try { cache.put('rum_' + uploadId, JSON.stringify(unmatchedUnique), 600); } catch (e4) {}

  // Update upload counts (accumulate)
  var allForUpload = sheetToObjects('Roster Shifts').filter(function (s) {
    return String(s.uploadId) === uploadId;
  });
  var matchedUsersSet = {};
  allForUpload.forEach(function (s) {
    matchedUsersSet[String(s.userEmail).toLowerCase()] = true;
  });
  var matchedUserCount = Object.keys(matchedUsersSet).length;
  updateRowById('Roster Uploads', uploadId, {
    rowCount: allForUpload.length,
    matchedCount: matchedUserCount,
    unmatchedJson: JSON.stringify(unmatchedUnique.slice(0, 200))
  });

  var notified = 0;
  var changedUsers = [];
  if (isFinal) {
    var oldByUser = {};
    try { oldByUser = JSON.parse(cache.get('rold_' + uploadId) || '{}'); } catch (e5) { oldByUser = {}; }
    var newByUser = {};
    allForUpload.forEach(function (s) {
      var em = String(s.userEmail).toLowerCase();
      if (!newByUser[em]) newByUser[em] = [];
      newByUser[em].push(s);
    });
    var allEmails = {};
    Object.keys(oldByUser).forEach(function (k) { allEmails[k] = true; });
    Object.keys(newByUser).forEach(function (k) { allEmails[k] = true; });
    var periodLabel = period === 'week' ? 'weekly' : 'monthly';
    Object.keys(allEmails).forEach(function (em) {
      var oldFp = shiftsFingerprintList(oldByUser[em] || []);
      var newFp = shiftsFingerprintList(newByUser[em] || []);
      if (oldFp === newFp) return;
      var oldN = (oldByUser[em] || []).length;
      var newN = (newByUser[em] || []).length;
      var summary = 'Your ' + periodLabel + ' roster was updated (' + oldN + ' → ' + newN + ' shifts).';
      appendRow('Notifications', {
        id: uid('ntf'),
        userEmail: em,
        title: 'Roster updated',
        body: summary,
        kind: 'roster_change',
        relatedId: uploadId,
        read: false,
        createdAt: nowIso()
      }, NOTIFICATION_HEADERS);
      notified++;
      changedUsers.push(em);
    });
    try {
      cache.remove('rold_' + uploadId);
      cache.remove('rum_' + uploadId);
      cache.remove('rclr_' + uploadId);
    } catch (e6) {}
  }

  return {
    success: true,
    data: {
      uploadId: uploadId,
      period: period,
      department: department,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      isFinal: isFinal,
      rowCount: allForUpload.length,
      matchedCount: matchedUserCount,
      matchedThisChunk: matchedCountChunk,
      unmatched: unmatchedUnique.slice(0, 100),
      unmatchedCount: unmatchedUnique.length,
      notified: notified,
      changedUsers: isFinal ? changedUsers : undefined,
      replacePolicy: 'period + (department match OR matched userEmail); re-upload cleans prior shifts in that scope',
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

function getUploadedRosterForUser(email) {
  email = String(email || '').toLowerCase();
  var now = getFijiNow();
  var week = fijiWeekRange(now);
  var month = fijiMonthRange(now);
  var all = sheetToObjects('Roster Shifts').filter(function (s) {
    return String(s.userEmail).toLowerCase() === email;
  });
  function inRange(d, start, end) {
    d = String(d || '').substring(0, 10);
    if (!d) return true;
    return d >= start && d <= end;
  }
  var weeklyShifts = all.filter(function (s) {
    return String(s.period).toLowerCase() === 'week' && inRange(s.date, week.start, week.end);
  }).sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date));
  });
  var monthlyShifts = all.filter(function (s) {
    return String(s.period).toLowerCase() === 'month' && inRange(s.date, month.start, month.end);
  }).sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date));
  });
  // If weekly upload has dates outside Mon–Sun window, still show all period=week for user (latest upload)
  if (!weeklyShifts.length) {
    weeklyShifts = all.filter(function (s) {
      return String(s.period).toLowerCase() === 'week';
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }
  if (!monthlyShifts.length) {
    monthlyShifts = all.filter(function (s) {
      return String(s.period).toLowerCase() === 'month';
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }
  return { weeklyShifts: weeklyShifts, monthlyShifts: monthlyShifts, week: week, month: month };
}

function getMyNotifications(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  if (!email) return { success: false, error: 'Login required' };
  var rows = sheetToObjects('Notifications').filter(function (n) {
    return String(n.userEmail).toLowerCase() === email;
  });
  rows.sort(function (a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  var unread = rows.filter(function (n) { return !truthy(n.read); });
  return {
    success: true,
    data: {
      notifications: rows.slice(0, 50),
      unread: unread,
      unreadCount: unread.length,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

function markNotificationRead(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  if (!email) return { success: false, error: 'Login required' };
  if (p.markAll === true || String(p.markAll) === 'true') {
    var all = sheetToObjects('Notifications').filter(function (n) {
      return String(n.userEmail).toLowerCase() === email && !truthy(n.read);
    });
    all.forEach(function (n) {
      updateRowById('Notifications', n.id, { read: true });
    });
    return { success: true, data: { marked: all.length } };
  }
  var id = String(p.id || '');
  var rows = sheetToObjects('Notifications');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) { found = rows[i]; break; }
  }
  if (!found) return { success: false, error: 'Notification not found' };
  if (String(found.userEmail).toLowerCase() !== email) {
    return { success: false, error: 'Not your notification' };
  }
  var updated = updateRowById('Notifications', id, { read: true });
  return { success: true, data: { notification: updated } };
}

function listRosterUploads(p) {
  if (!isFeatureEnabled('feature_my_schedule')) {
    return { success: false, error: featureOffMessage('feature_my_schedule'), featureOff: true };
  }
  var requester = getRequester(p);
  if (!requester || !(isHodPerm(requester) || isAdminPerm(requester))) {
    return { success: false, error: 'HOD/admin required' };
  }
  var rows = sheetToObjects('Roster Uploads');
  if (!isAdminPerm(requester)) {
    var dept = normalizeName(requester.department);
    rows = rows.filter(function (r) {
      return rosterDeptMatches(r.department, requester.department) ||
        normalizeName(r.department) === dept;
    });
  }
  rows.sort(function (a, b) {
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });
  return {
    success: true,
    data: {
      uploads: rows.slice(0, 40),
      fijiNow: formatFiji(getFijiNow())
    }
  };
}
