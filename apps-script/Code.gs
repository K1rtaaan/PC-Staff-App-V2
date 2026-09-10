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
 *   Lunch / Duty Meal: closes 10:00 Fiji SAME day.
 *     e.g. Sat 09:59 → can book Sat lunch; Sat 10:00 → closed
 */

var SHEET_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM'; // PCR Staff App V2 (not V1)
var APP_VERSION = '2.5.2';
var SUPER_PASS = '2026';
var ADMIN_PASS = '2025';
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

var ROLES = ['super_admin', 'admin', 'hod', 'kitchen', 'boat', 'staff'];

var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Exact weekly dinner menus (Fiji weekday 0=Sun … 6=Sat) — one row per item */
var DEFAULT_DINNER_MENUS = {
  0: ['Lamb Neck Curry', 'Chicken Burger/Chips', 'Chicken cheese Pizza', 'Roasted Chicken / Potato Salad / Vegs'],
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

function handleRequest(e, method) {
  try {
    initializeSheets();
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
    var action = payload.action || (e && e.parameter && e.parameter.action) || '';
    var result = routeAction(action, payload);
    return jsonOut(result);
  } catch (err) {
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
      return { success: true, ok: true, version: APP_VERSION, sheetId: SHEET_ID, fijiNow: formatFiji(getFijiNow()) };

    case 'login': return login(p);
    case 'register': return register(p);
    case 'verifyEmail': return verifyEmail(p);
    case 'requestVerification': return requestVerification(p);
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
    case 'saveBoatRun': return saveBoatRun(p);
    case 'deleteBoatRun': return deleteBoatRun(p);
    case 'getBoatBookings': return getBoatBookings(p);
    case 'bookBoat': return bookBoat(p);
    case 'cancelBoatBooking': return cancelBoatBooking(p);
    case 'myBoatBookings': return myBoatBookings(p);

    case 'getDinnerOrders': return getDinnerOrders(p);
    case 'placeDinnerOrder': return placeDinnerOrder(p);
    case 'getLunchOrders': return getLunchOrders(p);
    case 'placeLunchOrder': return placeLunchOrder(p);
    case 'getKitchenDashboard': return getKitchenDashboard(p);
    case 'markOrderStatus': return markOrderStatus(p);
    case 'getDinnerMenus': return getDinnerMenus(p);
    case 'saveDinnerMenuItem': return saveDinnerMenuItem(p);
    case 'deleteDinnerMenuItem': return deleteDinnerMenuItem(p);
    case 'approveLateDinnerOrder': return approveLateDinnerOrder(p);
    case 'processDinnerWorkflow': return processDinnerWorkflow(p);
    case 'getDinnerPrepList': return getDinnerPrepList(p);

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
    case 'requestLeave': return requestLeave(p);
    case 'reviewLeave': return reviewLeave(p);
    case 'getMySchedule': return getMySchedule(p);

    case 'getCutoffInfo': return getCutoffInfo(p);
    case 'initSheets':
      initializeSheets();
      ensureSuperAdmin();
      seedAlertEmails();
      seedDinnerMenus();
      return { success: true, data: { message: 'Sheets initialized', version: APP_VERSION } };

    default:
      return { success: false, error: 'Unknown action: ' + action };
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
  now = now || getFijiNow();
  var hour = now.getUTCHours();
  var open = hour < 20;
  var serviceDate = fijiDateString(addFijiDays(now, 1));
  return {
    open: open,
    serviceDate: serviceDate,
    cutoffHour: 20,
    cutoffLabel: '8:00 PM Fiji (today for tomorrow\'s dinner)',
    fijiNow: formatFiji(now),
    meal: 'dinner'
  };
}

/**
 * Lunch / Duty Meal: same-day service, cutoff 10:00 Fiji.
 */
function lunchCutoffInfo(now) {
  now = now || getFijiNow();
  var hour = now.getUTCHours();
  var open = hour < 10;
  var serviceDate = fijiDateString(now);
  return {
    open: open,
    serviceDate: serviceDate,
    cutoffHour: 10,
    cutoffLabel: '10:00 AM Fiji (same day)',
    fijiNow: formatFiji(now),
    meal: 'lunch'
  };
}

function getCutoffInfo(p) {
  var now = getFijiNow();
  return {
    success: true,
    data: {
      fijiNow: formatFiji(now),
      dinner: dinnerCutoffInfo(now),
      lunch: lunchCutoffInfo(now)
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

function ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
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
    'id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact',
    'role', 'roster', 'village', 'active', 'createdAt', 'verified', 'photoUrl'
  ]);
  ensureSheet(ss, 'Boat Runs', [
    'id', 'date', 'time', 'route', 'capacity', 'notes', 'active', 'createdBy', 'createdAt'
  ]);
  ensureSheet(ss, 'Boat Bookings', [
    'id', 'runId', 'userEmail', 'userName', 'seats', 'status', 'notes', 'createdAt'
  ]);
  ensureSheet(ss, 'Dinner Orders', [
    'id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes',
    'status', 'late', 'createdAt'
  ]);
  ensureSheet(ss, 'Lunch Orders', [
    'id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes',
    'status', 'late', 'createdAt'
  ]);
  ensureSheet(ss, 'Reminders', [
    'id', 'userEmail', 'title', 'body', 'dueDate', 'done', 'priority', 'important', 'audience', 'createdAt'
  ]);
  ensureSheet(ss, 'Suggestions', [
    'id', 'userEmail', 'userName', 'title', 'body', 'votes', 'likes', 'dislikes', 'voters', 'createdAt', 'status'
  ]);
  ensureSheet(ss, 'Leave Requests', [
    'id', 'userEmail', 'userName', 'department', 'startDate', 'endDate', 'reason',
    'status', 'reviewedBy', 'createdAt'
  ]);
  ensureSheet(ss, 'Alert Emails', ['email', 'label', 'active']);
  ensureSheet(ss, 'Verification Codes', [
    'email', 'code', 'expiresAt', 'used'
  ]);
  ensureSheet(ss, 'Dinner Menus', [
    'id', 'weekday', 'weekdayName', 'itemName', 'sortOrder', 'active', 'updatedAt'
  ]);
  ensureSheet(ss, 'Dinner Prep Snapshots', [
    'id', 'serviceDate', 'generatedAt', 'autoGenerated', 'totalOrders', 'payloadJson'
  ]);
  seedAlertEmails();
  seedDinnerMenus();
}

function sheetToObjects(sheetName) {
  var sh = getSS().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      var v = values[i][j];
      if (v instanceof Date) v = Utilities.formatDate(v, 'Pacific/Fiji', 'yyyy-MM-dd HH:mm:ss');
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

function appendRow(sheetName, obj, headers) {
  var sh = getSS().getSheetByName(sheetName);
  var row = headers.map(function (h) {
    var v = obj[h];
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    return v === undefined || v === null ? '' : v;
  });
  sh.appendRow(row);
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
  for (var k in patch) {
    if (!patch.hasOwnProperty(k)) continue;
    var col = headers.indexOf(k);
    if (col >= 0) {
      var v = patch[k];
      if (v === true) v = 'TRUE';
      if (v === false) v = 'FALSE';
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

/* ========== SUPERADMIN / ALERTS ========== */

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
      roster: '',
      village: '',
      active: true,
      createdAt: nowIso(),
      verified: true
    }, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'roster', 'village', 'active', 'createdAt', 'verified']);
  } else {
    // keep role/password in sync for bootstrap account
    updateRowById('Users', u.id, {
      role: 'super_admin',
      active: true,
      verified: true,
      password: SUPERADMIN_PASSWORD,
      firstName: u.firstName || 'IT',
      lastName: u.lastName || 'Admin',
      department: u.department || 'IT'
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

/* ========== AUTH ========== */

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    department: u.department || '',
    contact: u.contact || '',
    role: u.role || 'staff',
    roster: u.roster || '',
    village: u.village || '',
    active: truthy(u.active),
    verified: truthy(u.verified),
    photoUrl: u.photoUrl || '',
    needsProfile: !(u.firstName && u.lastName && u.department)
  };
}

function login(p) {
  ensureSuperAdmin();
  var email = String(p.email || '').trim().toLowerCase();
  var password = String(p.password || '');
  if (!email || !password) return { success: false, error: 'Email and password required' };

  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'Invalid email or password' };
  if (String(u.password) !== password) return { success: false, error: 'Invalid email or password' };

  var isPcr = email.indexOf('@pcr.com') !== -1;
  var isSuper = email === SUPERADMIN_EMAIL;

  if (!isSuper && isPcr && !truthy(u.active)) {
    return { success: false, error: 'Your account is pending approval. Contact your HOD or IT.' };
  }
  if (!isSuper && !isPcr && !truthy(u.verified) && !truthy(u.active)) {
    return {
      success: false,
      error: 'Email not verified',
      needsVerification: true,
      email: email
    };
  }
  if (!isSuper && !truthy(u.active) && !isPcr) {
    // non-pcr verified but inactive
    if (!truthy(u.verified)) {
      return { success: false, error: 'Email not verified', needsVerification: true, email: email };
    }
  }
  if (!isSuper && !truthy(u.active)) {
    return { success: false, error: 'Account inactive. Contact admin.' };
  }

  return {
    success: true,
    data: {
      user: publicUser(u),
      token: Utilities.base64EncodeWebSafe(email + '|' + u.id + '|' + Date.now())
    }
  };
}


function register(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var password = String(p.password || '');
  if (!email || !password) return { success: false, error: 'Email and password required' };

  if (findUserByEmail(email)) {
    return { success: false, error: 'Account already exists — sign in instead' };
  }

  var isPcr = email.indexOf('@pcr.com') !== -1;
  var isSuper = email === SUPERADMIN_EMAIL;

  var villageVal = '';
  if (p.village !== undefined && p.village !== null && p.village !== '') {
    if (p.village === true || p.village === 'true' || String(p.village).toLowerCase() === 'yes') villageVal = 'Village';
    else if (p.village === false || p.village === 'false' || String(p.village).toLowerCase() === 'no') villageVal = 'Resort';
    else villageVal = String(p.village);
  }
  // C30: registration ALWAYS creates basic staff — ignore any client-supplied role
  var photoUrl = String(p.photoUrl || '');
  if (photoUrl.length > 45000) photoUrl = ''; // Sheets cell limit safety; client keeps full in localStorage
  var row = {
    id: uid('usr'),
    email: email,
    password: password,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    department: p.department || '',
    contact: p.contact || '',
    role: 'staff',
    roster: p.roster || p.rosterPattern || '',
    village: villageVal,
    active: false,
    createdAt: nowIso(),
    verified: false,
    photoUrl: photoUrl
  };
  appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'roster', 'village', 'active', 'createdAt', 'verified', 'photoUrl']);

  // @pcr.com (not superadmin): pending admin approval — no email code
  if (isPcr && !isSuper) {
    return {
      success: true,
      data: {
        pendingApproval: true,
        message: 'Account created. Pending admin approval.'
      }
    };
  }

  // Other emails: send verification code
  var vr = requestVerification({ email: email });
  var emailed = vr && vr.data && vr.data.emailed;
  var out = {
    needsVerification: true,
    email: email,
    message: 'Check your email for a verification code',
    emailed: !!emailed
  };
  if (vr && vr.data && vr.data.code) out.code = vr.data.code;
  return { success: true, data: out };
}

function requestVerification(p) {
  var email = String(p.email || '').trim().toLowerCase();
  if (!email) return { success: false, error: 'Email required' };
  if (email.indexOf('@pcr.com') !== -1) {
    return { success: false, error: '@pcr.com accounts use pending approval, not email codes.' };
  }
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User not found' };

  var code = String(Math.floor(100000 + Math.random() * 900000));
  var expires = new Date(Date.now() + 30 * 60 * 1000);
  appendRow('Verification Codes', {
    email: email,
    code: code,
    expiresAt: expires.toISOString(),
    used: false
  }, ['email', 'code', 'expiresAt', 'used']);

  var mailed = false;
  var mailError = '';
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'PCR Staff App — Verification Code',
      body: 'Your Paradise Cove Resort staff verification code is: ' + code + '\n\nValid for 30 minutes.\n\n— PCR Staff App'
    });
    mailed = true;
  } catch (err) {
    mailError = String(err.message || err);
  }
  return {
    success: true,
    data: {
      emailed: mailed,
      mailError: mailError || undefined,
      // code only returned when mail failed (test/dev) — still have API
      code: mailed ? undefined : code,
      message: mailed ? 'Verification code sent' : 'Mail failed; code returned for testing'
    }
  };
}

function verifyEmail(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var code = String(p.code || '').trim();
  if (!email || !code) return { success: false, error: 'Email and code required' };

  var rows = sheetToObjects('Verification Codes');
  var match = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].email).toLowerCase() === email && String(rows[i].code) === code && !truthy(rows[i].used)) {
      match = rows[i];
      break;
    }
  }
  if (!match) return { success: false, error: 'Invalid or expired code' };
  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    return { success: false, error: 'Code expired' };
  }

  var sh = getSS().getSheetByName('Verification Codes');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var usedCol = headers.indexOf('used');
  if (usedCol >= 0) sh.getRange(match._row, usedCol + 1).setValue('TRUE');

  var u = findUserByEmail(email);
  if (u) updateRowById('Users', u.id, { verified: true, active: true });

  return { success: true, data: { verified: true, user: publicUser(findUserByEmail(email)) } };
}

/**
 * Dual admin unlock:
 *   SUPER_PASS 2026 → full settings (alert emails, role promotion, delete users)
 *   ADMIN_PASS 2025 → limited (approve/import users, kitchen/boat ops, leave review)
 * level: 'admin' (default) or 'super'
 * Returns 'super' | 'admin'
 */
function requirePasscode(p, level) {
  level = level || 'admin';
  var code = String(p.passcode || '');
  var isSuper = code === SUPER_PASS;
  var isAdmin = code === ADMIN_PASS;
  if (level === 'super') {
    if (!isSuper) throw new Error('Superadmin passcode required (2026)');
    return 'super';
  }
  if (!isSuper && !isAdmin) {
    throw new Error('Admin passcode required (2025 or 2026)');
  }
  return isSuper ? 'super' : 'admin';
}

function canManageUsers(requester) {
  if (!requester) return false;
  var r = requester.role;
  return r === 'super_admin' || r === 'admin' || r === 'hod';
}

function isPrivilegedRole(role) {
  return role === 'super_admin' || role === 'admin' || role === 'hod' || role === 'kitchen';
}

function requireKitchenOrAdmin(p) {
  var u = getRequester(p);
  if (!u) throw new Error('Login required');
  var r = u.role;
  if (r === 'super_admin' || r === 'admin' || r === 'hod' || r === 'kitchen') return u;
  // passcode unlock still allows kitchen ops for admins calling without role match
  try { requirePasscode(p, 'admin'); return u; } catch (e) {
    throw new Error('Kitchen access requires kitchen/admin role');
  }
}

function getRequester(p) {
  var email = String(p.requesterEmail || p.email || '').trim().toLowerCase();
  if (!email) return null;
  return findUserByEmail(email);
}

/* ========== USERS ========== */

function getUsers(p) {
  ensureSuperAdmin();
  var requester = getRequester(p);
  var users = sheetToObjects('Users').map(publicUser);
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

  if (requester && requester.role === 'hod') {
    p.department = requester.department;
    if (p.role && p.role !== 'staff' && p.role !== 'kitchen' && p.role !== 'boat') {
      return { success: false, error: 'HOD can only create staff/kitchen/boat in their department' };
    }
  }

  var isPcr = email.indexOf('@pcr.com') !== -1;
  var role = p.role || 'staff';
  if (ROLES.indexOf(role) === -1) role = 'staff';
  if (requester && requester.role !== 'super_admin' && role === 'super_admin') {
    return { success: false, error: 'Only super_admin can create super_admin' };
  }

  var active = p.active === true || p.active === 'true' || p.active === 'TRUE';
  var verified = true;
  if (isPcr && email !== SUPERADMIN_EMAIL) {
    // @pcr.com default: pending approval
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
    roster: p.roster || '',
    village: p.village || '',
    active: active,
    createdAt: nowIso(),
    verified: verified || !isPcr
  };
  appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'roster', 'village', 'active', 'createdAt', 'verified']);
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
    if (requester.role === 'hod') {
      if (String(u.department) !== String(requester.department)) {
        return { success: false, error: 'HOD can only edit users in their department' };
      }
    }
  }

  var patch = {};
  ['firstName', 'lastName', 'contact', 'department', 'roster', 'village'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = p[k];
  });
  if (selfUpdate && p.photoUrl !== undefined) {
    var ph = String(p.photoUrl || '');
    if (ph.length > 45000) ph = '';
    patch.photoUrl = ph;
  }
  // Staff cannot change own role
  if (selfUpdate && !adminUpdate && p.role !== undefined) {
    return { success: false, error: 'Staff cannot change role' };
  }

  if (adminUpdate && !selfUpdate) {
    if (p.role !== undefined) {
      if (requester.role === 'hod' && ['super_admin', 'admin', 'hod'].indexOf(p.role) >= 0) {
        return { success: false, error: 'HOD cannot assign that role' };
      }
      if (requester.role !== 'super_admin' && p.role === 'super_admin') {
        return { success: false, error: 'Only super_admin can assign super_admin' };
      }
      if (['super_admin', 'admin', 'hod'].indexOf(String(p.role)) >= 0 && String(u.role) !== String(p.role)) {
        requirePasscode(p, 'super');
      }
      patch.role = p.role;
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
      verified: true
    };
    appendRow('Users', row, ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'roster', 'village', 'active', 'createdAt', 'verified']);
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
  requirePasscode(p, 'super');
  var requester = getRequester(p);
  if (!requester || requester.role !== 'super_admin') {
    return { success: false, error: 'Only super_admin can delete users' };
  }
  var email = String(p.targetEmail || '').trim().toLowerCase();
  if (email === SUPERADMIN_EMAIL) return { success: false, error: 'Cannot delete superadmin' };
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'Not found' };
  getSS().getSheetByName('Users').deleteRow(u._row);
  return { success: true, data: { deleted: email } };
}

function getAlertEmails(p) {
  seedAlertEmails();
  var rows = sheetToObjects('Alert Emails');
  return { success: true, data: { emails: rows } };
}

function saveAlertEmails(p) {
  requirePasscode(p, 'super');
  var requester = getRequester(p);
  if (!requester || requester.role !== 'super_admin') {
    return { success: false, error: 'super_admin only' };
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

function getBoatRuns(p) {
  var runs = sheetToObjects('Boat Runs').filter(function (r) {
    return p.includeInactive || truthy(r.active) || r.active === '' || r.active === undefined;
  });
  if (p.date) runs = runs.filter(function (r) { return String(r.date).indexOf(String(p.date)) === 0; });
  return { success: true, data: { runs: runs } };
}

function saveBoatRun(p) {
  requirePasscode(p);
  if (p.id) {
    var updated = updateRowById('Boat Runs', p.id, {
      date: p.date, time: p.time, route: p.route, capacity: p.capacity,
      notes: p.notes, active: p.active !== false
    });
    return { success: !!updated, data: { run: updated }, error: updated ? undefined : 'Not found' };
  }
  var row = {
    id: uid('run'),
    date: p.date || fijiDateString(getFijiNow()),
    time: p.time || '',
    route: p.route || '',
    capacity: p.capacity || 20,
    notes: p.notes || '',
    active: true,
    createdBy: p.requesterEmail || '',
    createdAt: nowIso()
  };
  appendRow('Boat Runs', row, ['id', 'date', 'time', 'route', 'capacity', 'notes', 'active', 'createdBy', 'createdAt']);
  return { success: true, data: { run: row } };
}

function deleteBoatRun(p) {
  requirePasscode(p);
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
  var seats = Number(p.seats || 1);
  var used = existing.reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
  if (used + seats > Number(run.capacity || 20)) {
    return { success: false, error: 'Not enough seats (used ' + used + '/' + run.capacity + ')' };
  }
  var row = {
    id: uid('bb'),
    runId: runId,
    userEmail: email,
    userName: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
    seats: seats,
    status: 'confirmed',
    notes: p.notes || '',
    createdAt: nowIso()
  };
  appendRow('Boat Bookings', row, ['id', 'runId', 'userEmail', 'userName', 'seats', 'status', 'notes', 'createdAt']);
  return { success: true, data: { booking: row } };
}

function cancelBoatBooking(p) {
  var b = updateRowById('Boat Bookings', p.id, { status: 'cancelled' });
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
  seedDinnerMenus();
  var items = sheetToObjects('Dinner Menus').filter(function (r) {
    return p.includeInactive ? true : truthy(r.active);
  });
  if (p.weekday !== undefined && p.weekday !== null && p.weekday !== '') {
    var wd = Number(p.weekday);
    items = items.filter(function (r) { return Number(r.weekday) === wd; });
  }
  if (p.serviceDate) {
    var parts = String(p.serviceDate).split('-');
    if (parts.length >= 3) {
      var sd = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      var w = sd.getUTCDay();
      items = items.filter(function (r) { return Number(r.weekday) === w; });
    }
  }
  items.sort(function (a, b) {
    var aw = Number(a.weekday) - Number(b.weekday);
    if (aw !== 0) return aw;
    return Number(a.sortOrder) - Number(b.sortOrder);
  });
  var byWeekday = {};
  for (var i = 0; i < 7; i++) byWeekday[i] = [];
  items.forEach(function (it) {
    var w = Number(it.weekday);
    if (!byWeekday[w]) byWeekday[w] = [];
    byWeekday[w].push(it);
  });
  var info = dinnerCutoffInfo();
  var tomorrowWd = fijiWeekday(addFijiDays(getFijiNow(), 1));
  return {
    success: true,
    data: {
      items: items,
      byWeekday: byWeekday,
      tomorrowWeekday: tomorrowWd,
      tomorrowWeekdayName: WEEKDAY_NAMES[tomorrowWd],
      serviceDate: info.serviceDate,
      cutoff: info
    }
  };
}

function saveDinnerMenuItem(p) {
  requirePasscode(p, 'super');
  seedDinnerMenus();
  var headers = ['id', 'weekday', 'weekdayName', 'itemName', 'sortOrder', 'active', 'updatedAt'];
  var weekday = Number(p.weekday);
  if (isNaN(weekday) || weekday < 0 || weekday > 6) return { success: false, error: 'weekday 0-6 required' };
  var itemName = String(p.itemName || '').trim();
  if (!itemName) return { success: false, error: 'itemName required' };
  var sortOrder = p.sortOrder !== undefined && p.sortOrder !== '' ? Number(p.sortOrder) : 99;
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
  requirePasscode(p, 'super');
  var rows = sheetToObjects('Dinner Menus');
  var found = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(p.id)) found = rows[i];
  if (!found) return { success: false, error: 'Not found' };
  getSS().getSheetByName('Dinner Menus').deleteRow(found._row);
  return { success: true };
}

/**
 * Auto-approve waves + optional 8:30pm prep snapshot.
 * Safe to call from API routes or Apps Script time-driven triggers.
 */
function processDinnerWorkflow(p) {
  p = p || {};
  initializeSheets();
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

  function approvePendingBefore(cutoffHour, waveKey) {
    orders.forEach(function (o) {
      if (String(o.status) !== 'pending') return;
      if (truthy(o.late)) return;
      var placedHour = parseFijiHourFromCreatedAt(o.createdAt);
      if (placedHour < cutoffHour) {
        updateRowById('Dinner Orders', o.id, { status: 'approved' });
        o.status = 'approved';
        approved[waveKey]++;
      }
    });
  }

  if (hour >= 12) approvePendingBefore(12, 'wave12');
  if (hour >= 17) approvePendingBefore(17, 'wave17');
  if (hour >= 19) approvePendingBefore(19, 'wave19');

  var snap = null;
  var autoReady = (hour > 20 || (hour === 20 && minute >= 30));
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

function buildPrepPayload(serviceDate) {
  var orders = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(serviceDate) === 0 &&
      o.status !== 'cancelled' && o.status !== 'rejected';
  });
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
      userName: o.userName,
      department: o.department,
      orderedAt: o.createdAt,
      status: o.status,
      late: truthy(o.late)
    });
  });
  var pending = orders.filter(function (o) { return o.status === 'pending' || o.status === 'late_pending'; }).length;
  var approvedN = orders.filter(function (o) {
    return o.status === 'approved' || o.status === 'late_approved' || o.status === 'prepared' || o.status === 'served';
  }).length;
  var lateN = orders.filter(function (o) { return truthy(o.late); }).length;
  return {
    serviceDate: serviceDate,
    totalOrders: orders.length,
    tally: tally,
    byItem: byItem,
    pending: pending,
    approved: approvedN,
    late: lateN,
    orders: orders
  };
}

function upsertDinnerPrepSnapshot(serviceDate, autoGenerated) {
  var payload = buildPrepPayload(serviceDate);
  var existing = sheetToObjects('Dinner Prep Snapshots').filter(function (s) {
    return String(s.serviceDate).indexOf(serviceDate) === 0;
  });
  var headers = ['id', 'serviceDate', 'generatedAt', 'autoGenerated', 'totalOrders', 'payloadJson'];
  var row = {
    id: existing.length ? existing[0].id : uid('dprep'),
    serviceDate: serviceDate,
    generatedAt: nowIso(),
    autoGenerated: !!autoGenerated,
    totalOrders: payload.totalOrders,
    payloadJson: JSON.stringify(payload)
  };
  if (existing.length) {
    updateRowById('Dinner Prep Snapshots', existing[0].id, {
      generatedAt: row.generatedAt,
      autoGenerated: row.autoGenerated,
      totalOrders: row.totalOrders,
      payloadJson: row.payloadJson
    });
  } else {
    appendRow('Dinner Prep Snapshots', row, headers);
  }
  return row;
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
  var autoReady = now.getUTCHours() > 20 || (now.getUTCHours() === 20 && now.getUTCMinutes() >= 30);
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

function approveLateDinnerOrder(p) {
  requirePasscode(p, 'admin'); // 2025 or 2026
  var o = findOrder('Dinner Orders', p.id);
  if (!o) return { success: false, error: 'Order not found' };
  var status = p.status === 'rejected' ? 'rejected' : 'late_approved';
  var updated = updateRowById('Dinner Orders', p.id, {
    status: status,
    late: true
  });
  return { success: !!updated, data: { order: findOrder('Dinner Orders', p.id) } };
}

function placeDinnerOrder(p) {
  processDinnerWorkflow({});
  var info = dinnerCutoffInfo();
  var late = !info.open;
  if (late && !p.allowLate) {
    return { success: false, error: 'Dinner ordering closed at 8pm Fiji for tomorrow\'s service. Service date would be ' + info.serviceDate, cutoff: info };
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var serviceDate = p.serviceDate || info.serviceDate;
  var status = late ? 'late_pending' : 'pending';

  var existing = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected';
  });
  if (existing.length) {
    updateRowById('Dinner Orders', existing[0].id, {
      mealChoice: p.mealChoice || existing[0].mealChoice,
      notes: p.notes || '',
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
    userName: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
    department: u.department || '',
    mealChoice: p.mealChoice || 'Standard',
    notes: p.notes || '',
    status: status,
    late: late,
    createdAt: nowIso()
  };
  appendRow('Dinner Orders', row, ['id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes', 'status', 'late', 'createdAt']);
  processDinnerWorkflow({ serviceDate: serviceDate });
  return { success: true, data: { order: findOrder('Dinner Orders', row.id) || row, late: late, cutoff: info } };
}

function placeLunchOrder(p) {
  var info = lunchCutoffInfo();
  var late = !info.open;
  // Staff cannot late-order lunch. allowLate is admin-only (passcode 2025/2026).
  if (late) {
    if (!p.allowLate) {
      return { success: false, error: 'Lunch ordering closed at 10am Fiji for today\'s service (' + info.serviceDate + ')', cutoff: info };
    }
    try {
      requirePasscode(p, 'admin');
    } catch (e) {
      return { success: false, error: 'Lunch ordering closed at 10am Fiji. Late lunch is not available to staff.', cutoff: info };
    }
  }
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var serviceDate = p.serviceDate || info.serviceDate;

  var existing = sheetToObjects('Lunch Orders').filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).indexOf(serviceDate) === 0 && o.status !== 'cancelled';
  });
  if (existing.length) {
    updateRowById('Lunch Orders', existing[0].id, {
      mealChoice: p.mealChoice || existing[0].mealChoice,
      notes: p.notes || '',
      late: late,
      status: 'ordered'
    });
    return { success: true, data: { order: findOrder('Lunch Orders', existing[0].id), late: late, cutoff: info } };
  }
  var row = {
    id: uid('lun'),
    serviceDate: serviceDate,
    userEmail: email,
    userName: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
    department: u.department || '',
    mealChoice: p.mealChoice || 'Duty Meal',
    notes: p.notes || '',
    status: 'ordered',
    late: late,
    createdAt: nowIso()
  };
  appendRow('Lunch Orders', row, ['id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes', 'status', 'late', 'createdAt']);
  return { success: true, data: { order: row, late: late, cutoff: info } };
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

function last7DinnerStats(serviceDate) {
  var all = sheetToObjects('Dinner Orders').filter(function (o) {
    return o.status !== 'cancelled' && o.status !== 'rejected';
  });
  var parts = String(serviceDate).split('-');
  var end = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(end.getTime() - i * 86400000);
    var ds = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    var n = all.filter(function (o) { return String(o.serviceDate).indexOf(ds) === 0; }).length;
    days.push({ date: ds, total: n });
  }
  return days;
}

function getKitchenDashboard(p) {
  try { requireKitchenOrAdmin(p); } catch (e) { return { success: false, error: String(e.message || e) }; }
  var wf = processDinnerWorkflow(p);
  var dinnerInfo = dinnerCutoffInfo();
  var lunchInfo = lunchCutoffInfo();
  var dinnerDate = p.dinnerDate || dinnerInfo.serviceDate;
  var lunchDate = p.lunchDate || lunchInfo.serviceDate;
  var dinners = sheetToObjects('Dinner Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(dinnerDate) === 0 && o.status !== 'cancelled' && o.status !== 'rejected';
  });
  var lunches = sheetToObjects('Lunch Orders').filter(function (o) {
    return String(o.serviceDate).indexOf(lunchDate) === 0 && o.status !== 'cancelled';
  });
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
      dinnerDate: dinnerDate,
      lunchDate: lunchDate,
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
      lunch: { orders: lunches, late: lateLunch, tally: tally(lunches), cutoff: lunchInfo, total: lunches.length },
      stats: {
        tomorrowTotal: dinners.length,
        perItem: tally(dinners),
        lateCount: lateDinner.length,
        approved: approved.length,
        pending: pending.length,
        last7Days: last7DinnerStats(dinnerDate)
      },
      menus: (menus.data && menus.data.items) || [],
      workflow: wf.data,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}

function markOrderStatus(p) {
  var sheet = p.meal === 'lunch' ? 'Lunch Orders' : 'Dinner Orders';
  var o = updateRowById(sheet, p.id, { status: p.status || 'prepared' });
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
  var rows = sheetToObjects('Reminders').filter(function (r) {
    return !(r.done === true || r.done === 'TRUE' || r.done === 1);
  });
  sortReminders(rows);
  return { success: true, data: { reminders: rows } };
}

function addReminder(p) {
  requirePasscode(p, 'admin'); // 2025 | 2026
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
  requirePasscode(p, 'admin');
  var r = updateRowById('Reminders', p.id, { done: true });
  return { success: !!r, data: { reminder: r } };
}

function deleteReminder(p) {
  requirePasscode(p, 'admin');
  var rows = sheetToObjects('Reminders');
  var found = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].id === p.id) found = rows[i];
  if (!found) return { success: false, error: 'Not found' };
  getSS().getSheetByName('Reminders').deleteRow(found._row);
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
  var rows = sheetToObjects('Suggestions').map(normalizeSuggestion);
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

/* ========== LEAVE / SCHEDULE ========== */

function getLeaveRequests(p) {
  var rows = sheetToObjects('Leave Requests');
  if (p.userEmail) {
    rows = rows.filter(function (r) { return String(r.userEmail).toLowerCase() === String(p.userEmail).toLowerCase(); });
  }
  if (p.department) rows = rows.filter(function (r) { return r.department === p.department; });
  return { success: true, data: { requests: rows } };
}

function requestLeave(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  if (!u) return { success: false, error: 'User required' };
  var row = {
    id: uid('lv'),
    userEmail: email,
    userName: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
    department: u.department || '',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    reason: p.reason || '',
    status: 'pending',
    reviewedBy: '',
    createdAt: nowIso()
  };
  appendRow('Leave Requests', row, ['id', 'userEmail', 'userName', 'department', 'startDate', 'endDate', 'reason', 'status', 'reviewedBy', 'createdAt']);
  return { success: true, data: { request: row } };
}

function reviewLeave(p) {
  requirePasscode(p);
  var status = p.status === 'approved' ? 'approved' : 'rejected';
  var r = updateRowById('Leave Requests', p.id, {
    status: status,
    reviewedBy: p.requesterEmail || ''
  });
  return { success: !!r, data: { request: r } };
}

function getMySchedule(p) {
  var email = String(p.userEmail || p.requesterEmail || '').toLowerCase();
  var u = findUserByEmail(email);
  var leave = sheetToObjects('Leave Requests').filter(function (r) {
    return String(r.userEmail).toLowerCase() === email;
  });
  return {
    success: true,
    data: {
      user: publicUser(u),
      roster: u ? u.roster : '',
      leave: leave,
      fijiNow: formatFiji(getFijiNow())
    }
  };
}
