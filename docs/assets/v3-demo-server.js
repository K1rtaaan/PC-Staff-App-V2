/* GENERATED from apps-script/V3.gs + Release3.gs + Admin31.gs by tools/build-demo-server.js — demo mode only. Do not edit. */
window.PCRV3Server = function (S) {
var APP_VERSION = S.APP_VERSION;
var ORDER_HEADERS = S.ORDER_HEADERS;
var SHEET_ID = S.SHEET_ID;
var SUPERADMIN_EMAIL = S.SUPERADMIN_EMAIL;
var WEEKDAY_NAMES = S.WEEKDAY_NAMES;
var addFijiDays = S.addFijiDays;
var appendRow = S.appendRow;
var breakfastCutoffInfo = S.breakfastCutoffInfo;
var cachedRows = S.cachedRows;
var cleanSpecialNote = S.cleanSpecialNote;
var countedMealStatus = S.countedMealStatus;
var countsInBreakfastTotal = S.countsInBreakfastTotal;
var dinnerCutoffInfo = S.dinnerCutoffInfo;
var displayUserName = S.displayUserName;
var ensureColumns = S.ensureColumns;
var ensureSheet = S.ensureSheet;
var fijiDateString = S.fijiDateString;
var findOrder = S.findOrder;
var findUserByEmail = S.findUserByEmail;
var formatFiji = S.formatFiji;
var getDinnerMenus = S.getDinnerMenus;
var getFijiNow = S.getFijiNow;
var getRequester = S.getRequester;
var getSS = S.getSS;
var getSetting = S.getSetting;
var isAdminPerm = S.isAdminPerm;
var isChefPerm = S.isChefPerm;
var isSuperPerm = S.isSuperPerm;
var kitchenNoteOf = S.kitchenNoteOf;
var lunchCutoffInfo = S.lunchCutoffInfo;
var mealRangeStats = S.mealRangeStats;
var normalizeStaffLocation = S.normalizeStaffLocation;
var nowIso = S.nowIso;
var publicUser = S.publicUser;
var scBump = S.scBump;
var scGetJson = S.scGetJson;
var scKey = S.scKey;
var scPutJson = S.scPutJson;
var sheetToObjects = S.sheetToObjects;
var truthy = S.truthy;
var uid = S.uid;
var updateRowById = S.updateRowById;
var userPermissions = S.userPermissions;
var withIdempotency = S.withIdempotency;
var setSetting = S.setSetting;
var stationsExclusive = S.stationsExclusive;
var ALL_PERMISSIONS = S.ALL_PERMISSIONS;
var permissionsToString = S.permissionsToString;
var primaryRoleFromPermissions = S.primaryRoleFromPermissions;
var sendAppMail = S.sendAppMail;
var Utilities = S.Utilities;
var MailApp = S.MailApp;
var LockService = S.LockService;
var CacheService = S.CacheService;
var PropertiesService = S.PropertiesService;
var A31IO = S.A31IO;
var buildPrepPayload = S.buildPrepPayload;
var preferredNameMap = S.preferredNameMap;
var decorateOrderNotes = S.decorateOrderNotes;
var pad2 = S.pad2;
var dsumSaveSnapshot = S.dsumSaveSnapshot;
var dsumTryPdf = S.dsumTryPdf;
var scInvalidateSheet = S.scInvalidateSheet;
var SpreadsheetApp = S.SpreadsheetApp;
/**
 * PCR Staff App — 3.0 redesign backend.
 *  - 3.0.0 role model: everyone is staff; extra roles (admin, chef, boat manager, HOD, assistant HOD) are a list
 *    (Users.roles + legacy permissions) and add a role page button in More. See Release3.gs.
 *  - Two-step leave (department HOD → management = admin/superadmin), cancel, escalate by email.
 *  - Late meal requests (staff) and special meal orders (HOD / chef / admin) → chef/HOD decisions.
 *  - Weekly dinner menu likes/dislikes, chef feedback, department updates (posts, comments, reactions).
 *  - My History, chef dashboard + reports, admin export, superadmin dashboard, leave calendar, cutoff reminders.
 * Everything new is added lazily (new tabs + columns appended at the END of row 1) so existing rows keep working.
 * All actions are GET-safe and check role/ownership on the server.
 */

/** Permissions an admin can assign (same set as 2.x ALL_PERMISSIONS). */
var V3_ASSIGNABLE_PERMS = ['staff', 'hod', 'assistant_hod', 'chef', 'boat_manager', 'boat_captain', 'admin', 'super_admin'];
var V3_ORDER_COLS = ['orderType', 'reason', 'requestedBy', 'guestName', 'guestCompany', 'decidedBy', 'decidedAt', 'cancelReason', 'cancelledAt', 'cancelledBy'];
/** Lazy: Apps Script may load V3.gs before Code.gs, so never read another file's globals at load time. */
function v3OrderHeaders() { return ORDER_HEADERS.concat(V3_ORDER_COLS); }
var V3_USER_COLS = ['deptStatus', 'deptDecidedBy', 'deptDecidedAt', 'assistantHod', 'roles'];
var V3_LEAVE_HEADERS = ['id', 'userEmail', 'userName', 'department', 'startDate', 'endDate', 'reason', 'status', 'reviewedBy', 'hodNote', 'managerNote', 'notifyNote', 'createdAt',
  'leaveType', 'hodStatus', 'hodBy', 'hodAt', 'mgmtStatus', 'mgmtBy', 'mgmtAt', 'cancelledAt', 'escalatedAt'];
var V3_SHEETS = {
  'Menu Votes': ['id', 'dishKey', 'dish', 'userEmail', 'vote', 'updatedAt'],
  'Chef Feedback': ['id', 'userEmail', 'userName', 'department', 'kind', 'message', 'status', 'chefNote', 'createdAt', 'handledBy', 'handledAt', 'meal', 'mealDate'],
  'Dept Updates': ['id', 'department', 'authorEmail', 'authorName', 'title', 'body', 'active', 'createdAt'],
  'Dept Update Activity': ['id', 'updateId', 'userEmail', 'userName', 'kind', 'text', 'createdAt'],
  'Role Changes': ['id', 'at', 'by', 'userEmail', 'before', 'after']
};
var V3_MEAL_SHEETS = { breakfast: 'Breakfast Orders', lunch: 'Lunch Orders', dinner: 'Dinner Orders' };
var V3_CANCEL_LIMIT = 3;
var V3_LEAVE_TYPES = ['Day off', 'Annual leave', 'Sick sheet', 'Other'];
var NOTIF_HEADERS = ['id', 'userEmail', 'title', 'body', 'kind', 'relatedId', 'read', 'createdAt'];

/* ========== SCHEMA (lazy, locked, cached 6h) ========== */
function ensureV3Schema(ss, force) {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    if (!force && cache.get('pcr_v3_schema_300b') === '1') return;
  } catch (eC) {}
  var lock = null, got = false;
  try { lock = LockService.getScriptLock(); got = lock.tryLock(10000); } catch (eL) {}
  if (!got) return; // another request is doing it; appendRow() also ensures columns
  try {
    ss = ss || getSS();
    Object.keys(V3_SHEETS).forEach(function (name) { ensureSheet(ss, name, V3_SHEETS[name]); });
    var users = ss.getSheetByName('Users');
    if (users && users.getLastRow() > 0) {
      // 3.0.0 deploy safety: copy the Users tab once before the first 3.0 column is added
      try {
        var hdr = users.getRange(1, 1, 1, Math.max(users.getLastColumn(), 1)).getValues()[0].map(String);
        if (hdr.indexOf('roles') < 0 && !ss.getSheets().some(function (x) { return /^Users backup pre-3\.0/.test(x.getName()); })) {
          users.copyTo(ss).setName('Users backup pre-3.0 ' + fijiDateString(getFijiNow()));
        }
      } catch (eB) {}
      ensureColumns(users, V3_USER_COLS);
    }
    ['Breakfast Orders', 'Lunch Orders', 'Dinner Orders'].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() > 0) ensureColumns(sh, V3_ORDER_COLS);
    });
    var lv = ss.getSheetByName('Leave Requests');
    if (lv && lv.getLastRow() > 0) ensureColumns(lv, V3_LEAVE_HEADERS);
    var rem = ss.getSheetByName('Reminders');
    if (rem && rem.getLastRow() > 0) ensureColumns(rem, ['updatedAt', 'updatedBy']);
    try { if (cache) cache.put('pcr_v3_schema_300b', '1', 21600); } catch (eP) {}
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

/** Append to a 3.0 tab, creating it first if the lazy schema step has not run yet. */
function v3Append(name, row, headers) {
  var ss = getSS();
  if (!ss.getSheetByName(name)) ensureSheet(ss, name, headers || V3_SHEETS[name]);
  appendRow(name, row, headers || V3_SHEETS[name]);
}

/* ========== ROLE HELPERS ========== */
function v3Role(u) {
  if (!u) return 'staff';
  var p = userPermissions(u);
  if (p.indexOf('super_admin') >= 0) return 'super_admin';
  if (p.indexOf('admin') >= 0) return 'admin';
  if (p.indexOf('hod') >= 0) return 'hod';
  if (p.indexOf('chef') >= 0) return 'chef';
  if (p.indexOf('boat_manager') >= 0 || p.indexOf('boat_captain') >= 0) return 'boat_manager';
  return 'staff';
}
function v3HasHod(u) { return !!u && userPermissions(u).indexOf('hod') >= 0; }
/** 'chef' / 'boat' when the account carries a personal chef / boat permission (removed only by the switch-over). */
function v3LegacyStation(u) {
  var p = userPermissions(u);
  if (p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0) return 'chef';
  if (p.indexOf('boat_manager') >= 0 || p.indexOf('boat_captain') >= 0 || p.indexOf('boat') >= 0) return 'boat';
  return '';
}
function v3IsActiveUser(u) { return !!u && (truthy(u.active) || String(u.email).toLowerCase() === SUPERADMIN_EMAIL); }
function v3IsVagueDept(d) { var n = normDept(d); return !n || n === 'other' || n === 'others' || n === 'n/a' || n === '-'; }
/** Things an admin should look at for one user (HOD / assistant HOD in department "Other"). */
function v3UserWarnings(u) {
  var w = [];
  if ((v3HasHod(u) || isAsstHod(u)) && v3IsVagueDept(u.department)) w.push((v3HasHod(u) ? 'HOD' : 'Assistant HOD') + ' in department "' + (u.department || 'blank') + '" — set the real department so leave / join requests reach them');
  return w;
}
/** Active users per role (Users & roles counts; no limits). */
function v3RoleCounts(users) {
  users = users || sheetToObjects('Users');
  var out = { super_admin: 0, admin: 0, hod: 0, assistant_hod: 0, chef: 0, boat_manager: 0, boat_captain: 0, staff: 0, inactive: 0, total: users.length };
  users.forEach(function (u) {
    if (!v3IsActiveUser(u)) { out.inactive++; return; }
    var p = userPermissions(u);
    if (p.indexOf('super_admin') >= 0) out.super_admin++;
    else if (p.indexOf('admin') >= 0) out.admin++;
    if (p.indexOf('hod') >= 0) out.hod++;
    if (p.indexOf('assistant_hod') >= 0 || truthy(u.assistantHod)) out.assistant_hod++;
    if (p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0) out.chef++;
    if (p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0) out.boat_manager++;
    if (p.indexOf('boat_captain') >= 0) out.boat_captain++;
    if (!p.some(function (x) { return x !== 'staff'; })) out.staff++;
  });
  return out;
}
function isAsstHod(u) {
  if (!u) return false;
  return truthy(u.assistantHod) || userPermissions(u).indexOf('assistant_hod') >= 0;
}
function deptStatusOf(u) {
  if (!u) return 'none';
  var s = String(u.deptStatus || '').trim().toLowerCase();
  if (!s) return 'approved'; // rows created before 3.0 = already in their department
  return s;
}
/** Staff features (leave, late meal, dept updates) unlock after the department accepted the user. */
function deptApproved(u) {
  return !!u; // 3.0.0: no department join step (item 12 not in this release)
}
function normDept(d) { return String(d || '').trim().toLowerCase(); }
/** HOD / assistant HOD of `dept`, or admin/superadmin (all departments). */
function canActForDept(u, dept) {
  if (!u) return false;
  if (isAdminPerm(u)) return true;
  return v3IsLeadOf(u, dept);
}
/** HOD / assistant HOD of exactly this department (admins are NOT included). */
function v3IsLeadOf(u, dept) {
  if (!u || !normDept(dept) || normDept(u.department) !== normDept(dept)) return false;
  return v3HasHod(u) || isAsstHod(u);
}
function isDeptLead(u) { return !!u && (v3HasHod(u) || isAsstHod(u)); }
function v3Requester(p) {
  var u = getRequester(p || {});
  if (!u) throw new Error('Login required');
  if (!truthy(u.active) && String(u.email).toLowerCase() !== SUPERADMIN_EMAIL) throw new Error('Account inactive. Contact admin.');
  return u;
}
function v3Err(e) { return { success: false, error: String((e && e.message) || e) }; }
function v3Name(u) { return displayUserName(u) || String(u && u.email || ''); }
function v3Notify(email, title, body, kind, relatedId) {
  if (!email) return;
  try {
    appendRow('Notifications', {
      id: uid('ntf'), userEmail: String(email).toLowerCase(), title: title, body: body || '', kind: kind || 'v3',
      relatedId: relatedId || '', read: false, createdAt: nowIso()
    }, NOTIF_HEADERS);
  } catch (e) {}
}
function v3Mail(to, subject, body) {
  var list = (Array.isArray(to) ? to : [to]).map(function (x) { return String(x || '').trim().toLowerCase(); })
    .filter(function (x) { return x && x.indexOf('@') > 0 && !/@pcr\.local$/.test(x) && !/\.invalid$/.test(x); });
  var seen = {}; list = list.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  if (!list.length) return 0;
  var r = sendAppMail(list, subject, body + '\n\n— PCR Staff App', 'notify');
  return r && r.sent ? list.length : 0;
}
/** Active department leads (HOD + assistant HOD) of a department. */
function deptLeads(dept) {
  return sheetToObjects('Users').filter(function (u) {
    return truthy(u.active) && normDept(u.department) === normDept(dept) && normDept(dept) && (v3HasHod(u) || isAsstHod(u));
  });
}
function adminUsers() {
  return sheetToObjects('Users').filter(function (u) { return truthy(u.active) && isAdminPerm(u); });
}
/** Personal chef accounts (notified while the old setup runs in parallel; the Chef station sees counts on its dashboard). */
function chefUsers() {
  return sheetToObjects('Users').filter(function (u) { return truthy(u.active) && v3LegacyStation(u) === 'chef'; });
}
function v3Date(v) { return String(v || '').replace(/^'/, '').slice(0, 10); }
function v3Today() { return fijiDateString(getFijiNow()); }
function v3Tomorrow() { return fijiDateString(addFijiDays(getFijiNow(), 1)); }
/** '2026-09-25 10:00 FJT' (formatFiji) → epoch ms. */
function v3ParseFiji(v) {
  var m = String(v || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  return m ? Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':00+12:00') : NaN;
}
function v3Clean(v, max) { return String(v == null ? '' : v).replace(/[\r\t]+/g, ' ').trim().substring(0, max || 300); }

/* ========== ROUTER (called from routeAction default) ========== */
function routeV3(action, p) {
  var map = {
    getDeptStaff: getDeptStaff,
    decideJoinRequest: decideJoinRequest,
    updateDeptStaff: updateDeptStaff,
    removeFromDept: removeFromDept,
    setUserAccess: setUserAccess,
    getLeaveCalendar: getLeaveCalendar,
    submitLeave: function (q) { return withIdempotency('submitLeave', q, submitLeave); },
    decideLeave: decideLeave,
    cancelLeave: cancelLeave,
    escalateLeave: escalateLeave,
    getLeave: getLeave,
    requestLateMeal: function (q) { return withIdempotency('requestLateMeal', q, requestLateMeal); },
    placeSpecialMeal: function (q) { return withIdempotency('placeSpecialMeal', q, placeSpecialMeal); },
    getMealRequests: getMealRequests,
    decideMealRequest: decideMealRequest,
    decideAllMealRequests: decideAllMealRequests,
    approveAllPending: approveAllPending,
    getWeeklyMenu: getWeeklyMenu,
    voteMenuItem: voteMenuItem,
    sendChefFeedback: function (q) { return withIdempotency('sendChefFeedback', q, sendChefFeedback); },
    getChefFeedback: getChefFeedback,
    markChefFeedback: markChefFeedback,
    postDeptUpdate: postDeptUpdate,
    getDeptUpdates: getDeptUpdates,
    reactDeptUpdate: reactDeptUpdate,
    commentDeptUpdate: commentDeptUpdate,
    deleteDeptUpdate: deleteDeptUpdate,
    getMyHistory: getMyHistory,
    getChefDashboard: getChefDashboard,
    getMealReport: getMealReport,
    getAdminExport: getAdminExport,
    getSuperDashboard: getSuperDashboard,
    updateReminder: updateReminder,
    getV3Home: function (q) { try { return { success: true, data: getV3Home(v3Requester(q)) }; } catch (e) { return v3Err(e); } }
  };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return v3Err(e); }
}

/* ========== DEPARTMENTS ========== */
function v3UserOut(u) {
  var pu = publicUser(u);
  pu.warnings = v3UserWarnings(u);
  pu.deptStatus = deptStatusOf(u);
  pu.deptDecidedBy = u.deptDecidedBy || '';
  pu.deptDecidedAt = u.deptDecidedAt || '';
  pu.createdAt = u.createdAt || '';
  pu.position = String(u.position || ''); pu.payType = String(u.payType || ''); pu.dateStarted = String(u.dateStarted || '').replace(/^'/, ''); // 3.4.1 GL link fields
  pu.employeeCode = String(u.employeeCode || ''); // 3.4.0
  return pu;
}
function getDeptStaff(p) {
  var r = v3Requester(p);
  var dept = String(p.department || r.department || '');
  if (!canActForDept(r, dept)) return { success: false, error: 'Only the HOD / assistant HOD of ' + (dept || 'this department') + ' or admin can view department staff' };
  var all = sheetToObjects('Users').filter(function (u) { return normDept(u.department) === normDept(dept); });
  var out = { department: dept, pending: [], staff: [], declined: [] };
  all.forEach(function (u) {
    var s = deptStatusOf(u);
    if (!truthy(u.active) && !truthy(u.verified)) return; // unverified sign-ups are not requests yet
    var o = v3UserOut(u);
    if (s === 'pending') out.pending.push(o);
    else if (s === 'approved') out.staff.push(o);
    else out.declined.push(o);
  });
  out.staff.sort(function (a, b) { return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName); });
  return { success: true, data: out };
}
function decideJoinRequest(p) {
  var r = v3Requester(p);
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  if (!canActForDept(r, t.department)) return { success: false, error: 'Only the HOD / assistant HOD of ' + t.department + ' or admin can decide this request' };
  if (String(t.email).toLowerCase() === String(r.email).toLowerCase()) return { success: false, error: 'You cannot approve your own request' };
  var approve = /^(approve|approved|accept)$/i.test(String(p.decision || ''));
  var st = approve ? 'approved' : 'declined';
  updateRowById('Users', t.id, { deptStatus: st, deptDecidedBy: r.email, deptDecidedAt: nowIso() });
  v3Notify(t.email, approve ? ('Welcome to ' + t.department) : ('Department request declined'),
    approve ? 'Your department request was accepted by ' + v3Name(r) + '. Leave, late meal requests and department updates are now open.'
      : 'Your request to join ' + t.department + ' was declined' + (p.note ? ': ' + v3Clean(p.note, 200) : '') + '. Contact your HOD or admin.', 'dept_join', t.id);
  return { success: true, data: { user: v3UserOut(findUserByEmail(t.email)) } };
}
function updateDeptStaff(p) {
  var r = v3Requester(p);
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  if (!canActForDept(r, t.department)) return { success: false, error: 'Not your department' };
  if (!isAdminPerm(r) && v3Role(t) !== 'staff') return { success: false, error: 'HODs can only edit staff' };
  if (!isAdminPerm(r) && deptStatusOf(t) !== 'approved') return { success: false, error: 'Accept the join request first' };
  var patch = {};
  ['firstName', 'lastName', 'preferredName', 'contact', 'roster'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = v3Clean(p[k], k === 'preferredName' ? 40 : 80);
  });
  if (p.village !== undefined) patch.village = normalizeStaffLocation(p.village);
  if (!Object.keys(patch).length) return { success: false, error: 'Nothing to update' };
  updateRowById('Users', t.id, patch);
  return { success: true, data: { user: v3UserOut(findUserByEmail(t.email)) } };
}
function removeFromDept(p) {
  var r = v3Requester(p);
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  if (!canActForDept(r, t.department)) return { success: false, error: 'Not your department' };
  if (String(t.email).toLowerCase() === String(r.email).toLowerCase()) return { success: false, error: 'You cannot remove yourself' };
  if (!isAdminPerm(r) && v3Role(t) !== 'staff') return { success: false, error: 'HODs can only remove staff' };
  updateRowById('Users', t.id, { deptStatus: 'removed', deptDecidedBy: r.email, deptDecidedAt: nowIso(), assistantHod: false });
  v3Notify(t.email, 'Removed from ' + t.department, 'You were removed from the department by ' + v3Name(r) + '. Contact admin if this is wrong.', 'dept_join', t.id);
  return { success: true, data: { removed: t.email } };
}
/** 3.0.0 roles: Admin / superadmin set a user's role LIST (roles=admin,chef,boat_manager,boat_captain,hod,assistant_hod),
 *  department and active flag. Existing 2.x rules: only a superadmin grants or removes admin / superadmin (and that
 *  also needs the superadmin code); an admin assigns the other roles. Superadmin accounts are never demoted here. */
function setUserAccess(p) {
  var r = v3Requester(p);
  if (!isAdminPerm(r)) return { success: false, error: 'Only admin or superadmin can change roles and departments' };
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  var isMain = String(t.email).toLowerCase() === SUPERADMIN_EMAIL;
  var patch = {};
  var oldRoles = userRoles(t);
  var rawRoles = p.roles !== undefined ? p.roles : p.permissions;
  if (rawRoles !== undefined && rawRoles !== null) {
    var list = r3ParseRoles(Array.isArray(rawRoles) ? rawRoles.join(',') : rawRoles);
    var had = function (k) { return oldRoles.indexOf(k) >= 0; }, has = function (k) { return list.indexOf(k) >= 0; };
    var touchesTop = had('super_admin') !== has('super_admin') || had('admin') !== has('admin');
    if (isSuperPerm(t) && !has('super_admin') && (isMain || r3IsProtectedSuper(t))) return { success: false, error: 'This superadmin account keeps its role' };
    if (isSuperPerm(t) && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can change a superadmin account' };
    if (touchesTop) {
      if (!isSuperPerm(r)) return { success: false, error: 'Only superadmin can grant or remove admin / superadmin' };
      try { requireSuperCode(p); } catch (eC) { return { success: false, error: eC.message, needsCode: true }; }
    }
    if (has('super_admin') && !has('admin')) list.push('admin');
    var rp = rolesPatch(list);
    if (rp.roles !== String(t.roles || '') || rp.permissions !== String(t.permissions || '') || rp.role !== String(t.role || '') || rp.assistantHod !== truthy(t.assistantHod)) {
      ensureColumns(getSS().getSheetByName('Users'), ['roles']);
      patch.roles = rp.roles; patch.permissions = rp.permissions; patch.role = rp.role; patch.assistantHod = rp.assistantHod;
    }
  }
  if (p.department !== undefined && String(p.department) !== String(t.department)) {
    patch.department = v3Clean(p.department, 60);
    patch.deptStatus = 'approved'; patch.deptDecidedBy = r.email; patch.deptDecidedAt = nowIso();
  }
  if (p.active !== undefined && truthy(p.active) !== truthy(t.active)) {
    if (isMain) return { success: false, error: 'Cannot deactivate the main superadmin' };
    if (isSuperPerm(t) && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can change a superadmin account' };
    patch.active = truthy(p.active);
  }
  if (!Object.keys(patch).length) return { success: true, data: { user: v3UserOut(t), unchanged: true, roleCounts: v3RoleCounts() } };
  updateRowById('Users', t.id, patch);
  var after = findUserByEmail(t.email);
  if (patch.roles !== undefined) {
    try { v3Append('Role Changes', { id: uid('rc'), at: nowIso(), by: r.email, userEmail: t.email, before: oldRoles.join(','), after: userRoles(after).join(',') }); } catch (eL) {}
    var added = userRoles(after).filter(function (x) { return oldRoles.indexOf(x) < 0; });
    if (added.length) v3Notify(t.email, 'New role: ' + added.map(r3RoleLabel).join(', '), 'Open More to find your new page.', 'role', t.id);
  }
  return { success: true, data: { user: v3UserOut(after), roleCounts: v3RoleCounts(), warnings: v3UserWarnings(after) } };
}
function r3RoleLabel(k) {
  return { super_admin: 'Superadmin', admin: 'Admin', chef: 'Chef', boat_manager: 'Boat Manager', boat_captain: 'Boat Captain', hod: 'HOD', assistant_hod: 'Assistant HOD' }[k] || k;
}
/* ========== LEAVE (two step: department → management) ========== */
function v3LeaveOut(l) {
  var st = String(l.status || '');
  if (st === 'pending') st = 'pending_hod'; // legacy rows
  return {
    id: l.id, userEmail: l.userEmail, userName: l.userName, department: l.department,
    startDate: v3Date(l.startDate), endDate: v3Date(l.endDate), reason: l.reason || '', leaveType: l.leaveType || 'Other',
    status: st, hodStatus: l.hodStatus || '', hodBy: l.hodBy || (st !== 'pending_hod' ? l.reviewedBy || '' : ''), hodAt: l.hodAt || '', hodNote: l.hodNote || '',
    mgmtStatus: l.mgmtStatus || '', mgmtBy: l.mgmtBy || '', mgmtAt: l.mgmtAt || '', managerNote: l.managerNote || '',
    createdAt: l.createdAt || '', cancelledAt: l.cancelledAt || '', escalatedAt: l.escalatedAt || ''
  };
}
function submitLeave(p) {
  var u = v3Requester(p);
  if (!deptApproved(u)) return { success: false, error: 'Leave requests open after your HOD accepts your department request' };
  var s = v3Date(p.startDate), e = v3Date(p.endDate || p.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return { success: false, error: 'Pick a start and end date' };
  if (e < s) return { success: false, error: 'End date is before start date' };
  var type = V3_LEAVE_TYPES.indexOf(String(p.leaveType)) >= 0 ? String(p.leaveType)
    : ((typeof r34CanonLeaveType === 'function' && r34CanonLeaveType(p.leaveType, false)) || 'Other'); // 3.4.0: configurable leave types
  var sick = /sick/i.test(type);
  var earliest = fijiDateString(addFijiDays(getFijiNow(), sick ? -14 : -1));
  if (s < earliest) return { success: false, error: sick ? 'Sick leave can be back-dated up to 14 days' : 'Start date is in the past' };
  var reason = v3Clean(p.reason, 500);
  if (!reason) return { success: false, error: 'Please give a reason' };
  var open = sheetToObjects('Leave Requests').filter(function (l) {
    var st = String(l.status);
    return String(l.userEmail).toLowerCase() === String(u.email).toLowerCase() && (st === 'pending' || st === 'pending_hod' || st === 'pending_manager' || st === 'approved') &&
      !(v3Date(l.endDate) < s || v3Date(l.startDate) > e);
  });
  if (open.length) return { success: false, error: open.some(function (l) { return String(l.status) === 'approved'; }) ? 'You already have approved leave on those dates' : 'You already have a pending request for those dates' };
  // HODs (and admins) go straight to management — nobody approves their own leave.
  var lead = v3HasHod(u) || isAdminPerm(u);
  var row = {
    id: uid('lv'), userEmail: String(u.email).toLowerCase(), userName: v3Name(u), department: u.department || '',
    startDate: s, endDate: e, reason: reason, status: lead ? 'pending_manager' : 'pending_hod', reviewedBy: '', hodNote: '', managerNote: '', notifyNote: '',
    createdAt: nowIso(), leaveType: type, hodStatus: lead ? 'skipped' : 'pending', hodBy: '', hodAt: '', mgmtStatus: 'pending', mgmtBy: '', mgmtAt: '', cancelledAt: '', escalatedAt: ''
  };
  appendRow('Leave Requests', row, V3_LEAVE_HEADERS);
  var to = lead ? adminUsers() : deptLeads(u.department).filter(function (x) { return String(x.email).toLowerCase() !== row.userEmail; });
  to.forEach(function (x) { v3Notify(x.email, 'Leave request: ' + row.userName, type + ' ' + s + (e !== s ? ' → ' + e : '') + ' — ' + reason, 'leave', row.id); });
  return { success: true, data: { request: v3LeaveOut(row) } };
}
/** 3.4.1: true only while decideOnBehalf (GlLink341.gs, admin only) runs a HOD-step decision */
var A341_BEHALF = false;
function decideLeave(p) {
  var r = v3Requester(p);
  var l = sheetToObjects('Leave Requests').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!l) return { success: false, error: 'Leave request not found' };
  if (String(l.userEmail).toLowerCase() === String(r.email).toLowerCase()) return { success: false, error: 'You cannot decide your own leave' };
  var approve = /^(approve|approved|forward)$/i.test(String(p.decision || p.status || p.action || ''));
  var note = v3Clean(p.note, 300);
  var st = String(l.status);
  var patch;
  if (st === 'pending_hod' || st === 'pending') {
    // 3.0 (item 33): the department step is never skipped — only the HOD / assistant HOD of THAT department decides it.
    // An admin may act for the department only when it has no active HOD / assistant HOD (recorded as such).
    var noLead = !deptLeads(l.department).some(function (x) { return String(x.email).toLowerCase() !== String(l.userEmail).toLowerCase(); });
    var behalf = A341_BEHALF && isAdminPerm(r); // 3.4.1: admin approves on behalf of the HOD (People & roles → Pending department requests)
    if (!v3IsLeadOf(r, l.department) && !(isAdminPerm(r) && (noLead || behalf))) {
      return { success: false, error: 'Waiting for the HOD / assistant HOD of ' + (l.department || 'the department') + ' (HODs only decide their own department)' };
    }
    if (!v3IsLeadOf(r, l.department)) note = (note ? note + ' ' : '') + (behalf && !noLead ? '(' + (approve ? 'approved' : 'declined') + ' by admin on behalf of HOD)' : '(department has no HOD — decided by admin)');
    patch = { status: approve ? 'pending_manager' : 'rejected', hodStatus: approve ? 'approved' : 'declined', hodBy: r.email, hodAt: nowIso(), hodNote: note, reviewedBy: r.email };
    if (!approve) patch.notifyNote = note || 'Declined by HOD';
  } else if (st === 'pending_manager') {
    if (!isAdminPerm(r)) return { success: false, error: 'Waiting for management (admin) final approval' };
    patch = { status: approve ? 'approved' : 'rejected', mgmtStatus: approve ? 'approved' : 'declined', mgmtBy: r.email, mgmtAt: nowIso(), managerNote: note, reviewedBy: r.email };
  } else {
    return { success: false, error: 'This request is already ' + st };
  }
  updateRowById('Leave Requests', l.id, patch);
  var out = v3LeaveOut(Object.assign({}, l, patch));
  var stepTxt = patch.status === 'pending_manager' ? 'approved by your HOD and sent to management' : (patch.status === 'approved' ? 'approved by management' : 'declined');
  v3Notify(l.userEmail, 'Leave ' + (patch.status === 'rejected' ? 'declined' : 'update'), 'Your ' + (l.leaveType || 'leave') + ' ' + out.startDate + ' → ' + out.endDate + ' was ' + stepTxt + (note ? ' — ' + note : ''), 'leave', l.id);
  if (patch.status === 'pending_manager') adminUsers().forEach(function (a) { v3Notify(a.email, 'Leave for final approval: ' + l.userName, out.leaveType + ' ' + out.startDate + ' → ' + out.endDate, 'leave', l.id); });
  if (patch.status === 'approved' || patch.status === 'rejected') v3Mail(l.userEmail, 'PCR leave request ' + (patch.status === 'approved' ? 'approved' : 'declined'), 'Your ' + out.leaveType + ' ' + out.startDate + ' → ' + out.endDate + ' was ' + stepTxt + '.' + (note ? '\nNote: ' + note : ''));
  return { success: true, data: { request: out } };
}
function cancelLeave(p) {
  var u = v3Requester(p);
  var l = sheetToObjects('Leave Requests').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!l) return { success: false, error: 'Leave request not found' };
  if (String(l.userEmail).toLowerCase() !== String(u.email).toLowerCase()) return { success: false, error: 'You can only cancel your own leave' };
  var st = String(l.status);
  var future = v3Date(l.startDate) > v3Today();
  if (!(st === 'pending' || st === 'pending_hod' || st === 'pending_manager' || (st === 'approved' && future))) return { success: false, error: 'This request can no longer be cancelled' };
  updateRowById('Leave Requests', l.id, { status: 'cancelled', cancelledAt: nowIso() });
  if (st === 'approved') deptLeads(l.department).concat(adminUsers()).forEach(function (x) { v3Notify(x.email, 'Approved leave cancelled: ' + l.userName, v3Date(l.startDate) + ' → ' + v3Date(l.endDate), 'leave', l.id); });
  return { success: true, data: { request: v3LeaveOut(Object.assign({}, l, { status: 'cancelled', cancelledAt: nowIso() })) } };
}
function escalateLeave(p) {
  var u = v3Requester(p);
  var l = sheetToObjects('Leave Requests').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!l) return { success: false, error: 'Leave request not found' };
  if (String(l.userEmail).toLowerCase() !== String(u.email).toLowerCase()) return { success: false, error: 'You can only escalate your own leave' };
  var st = String(l.status);
  if (st !== 'pending' && st !== 'pending_hod' && st !== 'pending_manager') return { success: false, error: 'Only pending requests can be escalated' };
  if (l.escalatedAt) {
    var last = v3ParseFiji(l.escalatedAt);
    if (!isNaN(last) && Date.now() - last < 6 * 3600 * 1000) return { success: false, error: 'Already escalated in the last 6 hours' };
  }
  var recips = deptLeads(l.department).concat(adminUsers()).map(function (x) { return x.email; });
  var body = 'Leave request needs attention\n\nStaff: ' + l.userName + ' (' + l.department + ')\nType: ' + (l.leaveType || 'Leave') +
    '\nDates: ' + v3Date(l.startDate) + ' → ' + v3Date(l.endDate) + '\nReason: ' + (l.reason || '—') + '\nStatus: ' + (st === 'pending_manager' ? 'waiting for management' : 'waiting for HOD') +
    '\nRequested: ' + l.createdAt + '\n\nOpen the PCR Staff App → More → Leave requests to decide.';
  var sent = v3Mail(recips, 'Escalated leave request — ' + l.userName, body);
  recips.forEach(function (em) { v3Notify(em, 'Escalated leave: ' + l.userName, v3Date(l.startDate) + ' → ' + v3Date(l.endDate), 'leave', l.id); });
  updateRowById('Leave Requests', l.id, { escalatedAt: nowIso() });
  return { success: true, data: { emailed: sent, recipients: recips.length } };
}
function getLeave(p) {
  var u = v3Requester(p);
  var scope = String(p.scope || 'mine');
  var rows = sheetToObjects('Leave Requests').map(v3LeaveOut);
  var me = String(u.email).toLowerCase();
  if (scope === 'mine') rows = rows.filter(function (l) { return String(l.userEmail).toLowerCase() === me; });
  else if (scope === 'dept') {
    var dept = String(p.department || u.department || '');
    if (!canActForDept(u, dept)) return { success: false, error: 'HOD / assistant HOD / admin only' };
    rows = rows.filter(function (l) { return normDept(l.department) === normDept(dept); });
  } else if (scope === 'all') {
    if (!isAdminPerm(u)) return { success: false, error: 'Admin only' };
  } else return { success: false, error: 'Unknown scope' };
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { success: true, data: { requests: rows.slice(0, Number(p.limit) || 300) } };
}
/** Month view (item 38): approved + pending leave. HOD / assistant HOD: their department; admin / superadmin: all
 *  (optionally one department). month = 'YYYY-MM'. */
function getLeaveCalendar(p) {
  var u = v3Requester(p);
  var month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? String(p.month) : v3Today().slice(0, 7);
  var first = month + '-01';
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  var last = month + '-' + ('0' + new Date(Date.UTC(y, m, 0)).getUTCDate()).slice(-2);
  var dept = '';
  if (isAdminPerm(u)) dept = String(p.department || '');
  else if (isDeptLead(u)) dept = String(u.department || '');
  else return { success: false, error: 'HOD / assistant HOD / admin only' };
  var rows = sheetToObjects('Leave Requests').map(v3LeaveOut).filter(function (l) {
    if (['approved', 'pending_hod', 'pending_manager'].indexOf(l.status) < 0) return false;
    if (dept && normDept(l.department) !== normDept(dept)) return false;
    return !(l.endDate < first || l.startDate > last);
  });
  var depts = {};
  sheetToObjects('Leave Requests').forEach(function (l) { if (l.department) depts[String(l.department)] = 1; });
  return { success: true, data: { month: month, first: first, last: last, department: dept, allDepartments: isAdminPerm(u),
    departments: Object.keys(depts).sort(), leave: rows } };
}

/* ========== MEALS: cancel limit, late requests, special orders ========== */
function v3CancelCount(sheet, email, serviceDate) {
  email = String(email).toLowerCase();
  return sheetToObjects(sheet).filter(function (o) {
    return String(o.userEmail).toLowerCase() === email && v3Date(o.serviceDate) === serviceDate && String(o.status) === 'cancelled' && String(o.orderType || '') !== 'special';
  }).length;
}
function v3MealInfo(meal, now) {
  return meal === 'breakfast' ? breakfastCutoffInfo(now) : (meal === 'lunch' ? lunchCutoffInfo(now) : dinnerCutoffInfo(now));
}
function v3MealOut(o, meal) {
  return {
    id: o.id, meal: meal, serviceDate: v3Date(o.serviceDate), userEmail: o.userEmail, userName: o.userName, department: o.department,
    mealChoice: o.mealChoice, status: o.status, late: truthy(o.late), orderType: o.orderType || (truthy(o.late) ? 'late' : 'normal'),
    reason: o.reason || '', requestedBy: o.requestedBy || '', guestName: o.guestName || '', guestCompany: o.guestCompany || '',
    specialNote: kitchenNoteOf(o), createdAt: o.createdAt || '', decidedBy: o.decidedBy || '', decidedAt: o.decidedAt || '',
    cancelReason: o.cancelReason || '', cancelledAt: o.cancelledAt || ''
  };
}
function requestLateMeal(p) {
  var u = v3Requester(p);
  var meal = String(p.meal || '').toLowerCase();
  var sheet = V3_MEAL_SHEETS[meal];
  if (!sheet) return { success: false, error: 'Pick breakfast, lunch or dinner' };
  var now = getFijiNow();
  var info = v3MealInfo(meal, now);
  var sd = v3Date(p.serviceDate) || info.serviceDate;
  if (sd !== v3Today() && sd !== v3Tomorrow()) return { success: false, error: 'Late requests are for today or tomorrow only' };
  var s34b = typeof s34MealBlock === 'function' ? s34MealBlock(u, meal, sd) : null; if (s34b) return s34b; // 3.4.0 rostered on leave
  // 3.0.0: late window = after the cutoff until the late close (Kitchen Admin → Meal times)
  var w = mealWindow(meal, sd);
  var phase = mealPhase(meal, sd, now);
  if (phase === 'open') return { success: false, error: 'Ordering is still open — place a normal ' + meal + ' order' };
  if (phase === 'closed') return { success: false, error: 'Late requests for ' + meal + ' on ' + sd + ' closed at ' + w.lateCloseLabel + '. Please see the chef.', lateClosed: true };
  var reason = v3Clean(p.reason, 300);
  if (!reason) return { success: false, error: 'Please give a reason' };
  var email = String(u.email).toLowerCase();
  var active = sheetToObjects(sheet).filter(function (o) {
    var st = String(o.status);
    return String(o.userEmail).toLowerCase() === email && v3Date(o.serviceDate) === sd && st !== 'cancelled' && st !== 'rejected' && st !== 'declined';
  });
  if (active.length) return { success: false, error: 'You already have a ' + meal + ' order for ' + sd + ' (' + active[0].status + ')' };
  if (meal === 'dinner') { var mErr = dishMenuError(sd, v3Clean(p.mealChoice, 80) || 'Standard'); if (mErr) return mErr; }
  var note = cleanSpecialNote(p.specialNote || '');
  var row = {
    id: uid(meal.slice(0, 3)), serviceDate: sd, userEmail: email, userName: v3Name(u), department: u.department || '',
    mealChoice: meal === 'dinner' ? (v3Clean(p.mealChoice, 80) || 'Standard') : (meal === 'lunch' ? 'Lunch' : 'Breakfast'),
    notes: '[Late request] ' + reason, specialNote: note, status: 'late_pending', late: true, createdAt: nowIso(),
    orderType: 'late_request', reason: reason, requestedBy: email
  };
  appendRow(sheet, row, v3OrderHeaders());
  var who = chefUsers().concat(deptLeads(u.department));
  var seenN = {};
  who.forEach(function (x) { var em = String(x.email).toLowerCase(); if (em !== email && !seenN[em]) { seenN[em] = 1; v3Notify(x.email, 'Late ' + meal + ' request: ' + row.userName, sd + ' — ' + reason, 'late_meal', row.id); } });
  return { success: true, data: { order: v3MealOut(row, meal), autoApproveAt: w.lateCloseLabel } };
}
function placeSpecialMeal(p) {
  var r = v3Requester(p);
  if (!(isDeptLead(r) || isChefPerm(r) || isAdminPerm(r))) return { success: false, error: 'HOD / assistant HOD / chef / admin only' };
  var meal = String(p.meal || '').toLowerCase();
  var sheet = V3_MEAL_SHEETS[meal];
  if (!sheet) return { success: false, error: 'Pick breakfast, lunch or dinner' };
  var info = v3MealInfo(meal);
  if (!info.open) return { success: false, error: 'Booking for tomorrow\'s ' + meal + ' is closed — use a late meal request instead' };
  var name = v3Clean(p.guestName, 60);
  if (!name) return { success: false, error: 'Name is required' };
  var isContractor = String(p.guestType || '') === 'contractor';
  var company = v3Clean(p.guestCompany, 60);
  if (isContractor && !company) return { success: false, error: 'Company name is required for contractors' };
  var dept = isContractor ? 'Contractor' : (v3Clean(p.department, 60) || r.department || '');
  if (!isContractor && !isAdminPerm(r) && !isChefPerm(r) && normDept(dept) !== normDept(r.department)) return { success: false, error: 'HODs order specials for their own department (or contractors)' };
  var reason = v3Clean(p.reason, 300);
  if (!reason) return { success: false, error: 'Reason is required' };
  var choice = meal === 'dinner' ? v3Clean(p.mealChoice, 80) : (meal === 'lunch' ? 'Lunch' : 'Breakfast');
  if (meal === 'dinner') {
    var items = (getDinnerMenus({ serviceDate: info.serviceDate, includePreviousDay: false }).data.items || []).map(function (i) { return String(i.itemName || i.name || ''); });
    if (!choice || (items.length && items.indexOf(choice) < 0)) return { success: false, error: 'Pick a dish from tomorrow\'s menu' };
  }
  var note = cleanSpecialNote(p.specialNote || '');
  var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'guest';
  var row = {
    id: uid(meal.slice(0, 3)), serviceDate: info.serviceDate, userEmail: 'special+' + slug + '.' + Utilities.getUuid().slice(0, 4) + '@pcr.local',
    userName: name + (isContractor ? ' (' + company + ')' : ''), department: dept, mealChoice: choice,
    notes: '[Special by ' + v3Name(r) + '] ' + reason, specialNote: note, status: 'special_pending', late: false, createdAt: nowIso(),
    orderType: 'special', reason: reason, requestedBy: String(r.email).toLowerCase(), guestName: name, guestCompany: isContractor ? company : ''
  };
  appendRow(sheet, row, v3OrderHeaders());
  chefUsers().forEach(function (x) { v3Notify(x.email, 'Special ' + meal + ' request', row.userName + ' — ' + reason, 'special_meal', row.id); });
  return { success: true, data: { order: v3MealOut(row, meal) } };
}
function v3CanDecide(r, o) {
  var t = String(o.orderType || '');
  if (isChefPerm(r)) return true;
  if (t === 'special') return false;
  return canActForDept(r, o.department); // late requests: HOD / assistant HOD of that department
}
function getMealRequests(p) {
  var r = v3Requester(p);
  var chef = isChefPerm(r);
  if (!chef && !isDeptLead(r) && !isAdminPerm(r)) return { success: false, error: 'Chef / HOD / admin only' };
  var from = fijiDateString(addFijiDays(getFijiNow(), -(Number(p.days) || 3)));
  var me = String(r.email).toLowerCase();
  var out = [];
  Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      var st = String(o.status), t = String(o.orderType || '');
      var isReq = st === 'late_pending' || st === 'special_pending' || t === 'late_request' || t === 'special';
      if (!isReq || v3Date(o.serviceDate) < from) return;
      if (!chef) {
        var mine = String(o.requestedBy || '').toLowerCase() === me;
        if (!(mine || (t !== 'special' && canActForDept(r, o.department)))) return;
      }
      var x = v3MealOut(o, meal);
      x.kind = (t === 'special' || st === 'special_pending') ? 'special' : 'late';
      x.canDecide = (st === 'late_pending' || st === 'special_pending') && v3CanDecide(r, o);
      out.push(x);
    });
  });
  out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  var pend = out.filter(function (x) { return x.status === 'late_pending' || x.status === 'special_pending'; });
  return { success: true, data: { requests: out, pendingLate: pend.filter(function (x) { return x.kind === 'late'; }).length, pendingSpecial: pend.filter(function (x) { return x.kind === 'special'; }).length } };
}
function v3DecideOne(r, meal, o, approve) {
  var st = String(o.status);
  if (st !== 'late_pending' && st !== 'special_pending') return { ok: false, error: 'Already ' + st };
  if (!v3CanDecide(r, o)) return { ok: false, error: 'Not allowed' };
  var patch = { status: approve ? (st === 'special_pending' ? 'approved' : 'late_approved') : 'rejected', decidedBy: requesterTag(r), decidedAt: nowIso() };
  updateRowById(V3_MEAL_SHEETS[meal], o.id, patch);
  var target = String(o.orderType) === 'special' ? o.requestedBy : o.userEmail;
  v3Notify(target, (approve ? 'Approved: ' : 'Declined: ') + meal + ' ' + v3Date(o.serviceDate), (o.userName || '') + (approve ? ' — kitchen has it' : ' — contact your HOD or chef'), 'meal_request', o.id);
  return { ok: true, status: patch.status };
}
function decideMealRequest(p) {
  var r = v3Requester(p);
  var meal = String(p.meal || '').toLowerCase();
  if (!V3_MEAL_SHEETS[meal]) return { success: false, error: 'meal required' };
  var o = findOrder(V3_MEAL_SHEETS[meal], p.id);
  if (!o) return { success: false, error: 'Request not found' };
  var res = v3DecideOne(r, meal, o, /^(approve|approved|accept)$/i.test(String(p.decision || '')));
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, data: { id: o.id, status: res.status } };
}
function decideAllMealRequests(p) {
  var r = v3Requester(p);
  if (!(isChefPerm(r))) return { success: false, error: 'Chef station (or superadmin) only' };
  var approve = /^(approve|approved|accept)$/i.test(String(p.decision || ''));
  var kind = String(p.kind || 'all');
  var n = 0;
  Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
    if (p.meal && p.meal !== meal) return;
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      var st = String(o.status);
      if (st !== 'late_pending' && st !== 'special_pending') return;
      if (kind === 'late' && st !== 'late_pending') return;
      if (kind === 'special' && st !== 'special_pending') return;
      if (v3Date(o.serviceDate) < v3Today()) return;
      if (v3DecideOne(r, meal, o, approve).ok) n++;
    });
  });
  return { success: true, data: { decided: n, status: approve ? 'approved' : 'rejected' } };
}

/** Item 37: "Approve all" in the approvals inbox. Runs the normal one-by-one decision for every item the requester may
 *  decide (same checks as the single buttons: HODs / assistant HODs only their own department, never their own request).
 *  kind: 'leave' (HOD step) | 'final' (admin final step) | 'late' (late meal requests) | 'joins' (department join requests). */
function approveAllPending(p) {
  var r = v3Requester(p);
  var kind = String(p.kind || '');
  var me = String(r.email).toLowerCase();
  var ok = 0, skipped = 0;
  var q = function (extra) { return Object.assign({}, p, extra); };
  if (kind === 'leave' || kind === 'final') {
    if (kind === 'final' && !isAdminPerm(r)) return { success: false, error: 'Admin only' };
    if (kind === 'leave' && !isDeptLead(r) && !isAdminPerm(r)) return { success: false, error: 'HOD / assistant HOD only' };
    var want = kind === 'final' ? ['pending_manager'] : ['pending_hod', 'pending'];
    sheetToObjects('Leave Requests').forEach(function (l) {
      if (want.indexOf(String(l.status)) < 0 || String(l.userEmail).toLowerCase() === me) return;
      if (kind === 'leave' && !v3IsLeadOf(r, l.department)) { skipped++; return; } // HOD step: own department only
      var res = decideLeave(q({ id: l.id, decision: 'approve', note: String(p.note || '') }));
      if (res && res.success) ok++; else skipped++;
    });
  } else if (kind === 'late') {
    if (!isDeptLead(r) && !isAdminPerm(r) && !isChefPerm(r)) return { success: false, error: 'HOD / assistant HOD / admin only' };
    Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
      sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
        if (String(o.status) !== 'late_pending' || v3Date(o.serviceDate) < v3Today()) return;
        if (v3DecideOne(r, meal, o, true).ok) ok++; else skipped++;
      });
    });
  } else if (kind === 'joins') {
    if (!isDeptLead(r) && !isAdminPerm(r)) return { success: false, error: 'HOD / assistant HOD / admin only' };
    sheetToObjects('Users').forEach(function (u) {
      if (deptStatusOf(u) !== 'pending' || (!truthy(u.active) && !truthy(u.verified))) return;
      if (String(u.email).toLowerCase() === me || !canActForDept(r, u.department)) return;
      var res = decideJoinRequest(q({ targetEmail: u.email, decision: 'approve' }));
      if (res && res.success) ok++; else skipped++;
    });
  } else return { success: false, error: 'kind must be leave, final, late or joins' };
  return { success: true, data: { approved: ok, skipped: skipped } };
}

/* ========== WEEKLY MENU VOTES ========== */
function dishKeyOf(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function isDailyItem(name) { return /burger|pizza/i.test(String(name || '')); }
function v3VoteTally() {
  var key = scKey('rows:Menu Votes', 'tally');
  var t = scGetJson(key);
  if (t) return t;
  t = {};
  sheetToObjects('Menu Votes').forEach(function (v) {
    var k = String(v.dishKey); var n = Number(v.vote || 0);
    if (!t[k]) t[k] = { dish: v.dish, likes: 0, dislikes: 0 };
    if (n > 0) t[k].likes++; else if (n < 0) t[k].dislikes++;
  });
  scPutJson(key, t, 300);
  return t;
}
function getWeeklyMenu(p) {
  var u = getRequester(p || {});
  var me = u ? String(u.email).toLowerCase() : '';
  var tally = v3VoteTally();
  var mine = {};
  if (me) sheetToObjects('Menu Votes').forEach(function (v) { if (String(v.userEmail).toLowerCase() === me) mine[String(v.dishKey)] = Number(v.vote || 0); });
  var rows = cachedRows('Dinner Menus');
  var days = WEEKDAY_NAMES.map(function (n, i) { return { weekday: i, name: n, items: [] }; });
  var seen = {};
  rows.forEach(function (m) {
    var wd = Number(m.weekday);
    if (isNaN(wd) || wd < 0 || wd > 6) return;
    if (m.active !== undefined && m.active !== '' && !truthy(m.active)) return;
    var name = String(m.itemName || m.name || '').trim();
    if (!name || isDailyItem(name)) return;
    if (seen[wd + '|' + name]) return; seen[wd + '|' + name] = 1;
    var k = dishKeyOf(name), t = tally[k] || { likes: 0, dislikes: 0 };
    days[wd].items.push({ dish: name, dishKey: k, likes: t.likes, dislikes: t.dislikes, myVote: mine[k] || 0 });
  });
  // Monday first (resort week)
  days = days.slice(1).concat(days.slice(0, 1));
  return { success: true, data: { days: days, todayWeekday: getFijiNow().getUTCDay() } };
}
function voteMenuItem(p) {
  var u = v3Requester(p);
  var dish = v3Clean(p.dish, 80);
  if (!dish) return { success: false, error: 'Dish required' };
  if (isDailyItem(dish)) return { success: false, error: 'Daily items are not voted on' };
  var vote = Number(p.vote); vote = vote > 0 ? 1 : (vote < 0 ? -1 : 0);
  var k = dishKeyOf(dish), me = String(u.email).toLowerCase();
  var cur = sheetToObjects('Menu Votes').filter(function (v) { return String(v.dishKey) === k && String(v.userEmail).toLowerCase() === me; })[0];
  if (cur) updateRowById('Menu Votes', cur.id, { vote: vote, updatedAt: nowIso() });
  else v3Append('Menu Votes', { id: uid('mv'), dishKey: k, dish: dish, userEmail: me, vote: vote, updatedAt: nowIso() }, V3_SHEETS['Menu Votes']);
  scBump('rows:Menu Votes');
  var t = v3VoteTally()[k] || { likes: 0, dislikes: 0 };
  return { success: true, data: { dishKey: k, myVote: vote, likes: t.likes, dislikes: t.dislikes } };
}
function v3TopVotes(n) {
  var t = v3VoteTally();
  var list = Object.keys(t).map(function (k) { return { dish: t[k].dish, likes: t[k].likes, dislikes: t[k].dislikes }; });
  return {
    liked: list.filter(function (x) { return x.likes > 0; }).sort(function (a, b) { return b.likes - a.likes || a.dislikes - b.dislikes; }).slice(0, n),
    disliked: list.filter(function (x) { return x.dislikes > 0; }).sort(function (a, b) { return b.dislikes - a.dislikes || a.likes - b.likes; }).slice(0, n),
    all: list
  };
}

/* ========== CHEF FEEDBACK ========== */
function sendChefFeedback(p) {
  var u = v3Requester(p);
  var msg = v3Clean(p.message, 800);
  if (msg.length < 3) return { success: false, error: 'Write a short message' };
  var kind = ['issue', 'request', 'compliment'].indexOf(String(p.kind)) >= 0 ? String(p.kind) : 'issue';
  // 3.3.0: optional meal + date (My meals → Feedback to chef); columns are added to the tab on first use
  var meal = ['breakfast', 'lunch', 'dinner'].indexOf(String(p.meal || '').toLowerCase()) >= 0 ? String(p.meal).toLowerCase() : '';
  var mealDate = /^\d{4}-\d{2}-\d{2}$/.test(v3Date(p.mealDate)) ? v3Date(p.mealDate) : '';
  var row = { id: uid('cf'), userEmail: String(u.email).toLowerCase(), userName: v3Name(u), department: u.department || '', kind: kind, message: msg, status: 'new', chefNote: '', createdAt: nowIso(), handledBy: '', handledAt: '',
    meal: meal, mealDate: mealDate ? "'" + mealDate : '' };
  v3Append('Chef Feedback', row, V3_SHEETS['Chef Feedback']);
  var about = (meal ? meal.charAt(0).toUpperCase() + meal.slice(1) : '') + (mealDate ? ' ' + mealDate : '');
  chefUsers().forEach(function (c) { v3Notify(c.email, 'Food feedback (' + kind + ')' + (about ? ' · ' + about : ''), msg.slice(0, 120), 'chef_feedback', row.id); });
  row.mealDate = mealDate;
  return { success: true, data: { feedback: row } };
}
function getChefFeedback(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u))) return { success: false, error: 'Chef station (or superadmin) only' };
  var rows = sheetToObjects('Chef Feedback');
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  rows.forEach(function (r) { delete r._row; r.mealDate = v3Date(r.mealDate); });
  return { success: true, data: { feedback: rows.slice(0, 300), newCount: rows.filter(function (r) { return String(r.status) === 'new'; }).length } };
}
function markChefFeedback(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u))) return { success: false, error: 'Chef station (or superadmin) only' };
  var st = ['new', 'seen', 'done'].indexOf(String(p.status)) >= 0 ? String(p.status) : 'seen';
  var r = updateRowById('Chef Feedback', p.id, { status: st, chefNote: v3Clean(p.chefNote, 300), handledBy: requesterTag(u), handledAt: nowIso() });
  if (!r) return { success: false, error: 'Not found' };
  if (p.chefNote) v3Notify(r.userEmail, 'Chef replied to your feedback', v3Clean(p.chefNote, 200), 'chef_feedback', r.id);
  return { success: true, data: { id: p.id, status: st } };
}

/* ========== DEPARTMENT UPDATES ========== */
function v3CanReadDept(u, dept) {
  if (canActForDept(u, dept)) return true;
  return normDept(u.department) === normDept(dept) && deptApproved(u);
}
function postDeptUpdate(p) {
  var u = v3Requester(p);
  var dept = String(p.department || u.department || '');
  if (!canActForDept(u, dept)) return { success: false, error: 'Only the HOD / assistant HOD of ' + dept + ' (or admin) can post' };
  var title = v3Clean(p.title, 100), body = v3Clean(p.body, 1500);
  if (!title && !body) return { success: false, error: 'Write something first' };
  var row = { id: uid('du'), department: dept, authorEmail: String(u.email).toLowerCase(), authorName: v3Name(u), title: title, body: body, active: true, createdAt: nowIso() };
  v3Append('Dept Updates', row, V3_SHEETS['Dept Updates']);
  return { success: true, data: { update: row } };
}
function getDeptUpdates(p) {
  var u = v3Requester(p);
  var dept = String(p.department || u.department || '');
  if (!v3CanReadDept(u, dept)) return { success: true, data: { updates: [], locked: true, department: dept } };
  return { success: true, data: { updates: v3DeptUpdatesFor(u, dept, Number(p.limit) || 20), department: dept, canPost: canActForDept(u, dept) } };
}
function v3DeptUpdatesFor(u, dept, limit) {
  var me = String(u.email).toLowerCase();
  var posts = sheetToObjects('Dept Updates').filter(function (x) { return normDept(x.department) === normDept(dept) && truthy(x.active === '' ? true : x.active); });
  posts.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  posts = posts.slice(0, limit);
  if (!posts.length) return [];
  var ids = {}; posts.forEach(function (x) { ids[x.id] = { likes: 0, dislikes: 0, mine: '', comments: [] }; });
  sheetToObjects('Dept Update Activity').forEach(function (a) {
    var s = ids[a.updateId]; if (!s) return;
    if (a.kind === 'like' || a.kind === 'dislike') {
      if (a.kind === 'like') s.likes++; else s.dislikes++;
      if (String(a.userEmail).toLowerCase() === me) s.mine = a.kind;
    } else if (a.kind === 'comment') s.comments.push({ id: a.id, userName: a.userName, text: a.text, createdAt: a.createdAt, mine: String(a.userEmail).toLowerCase() === me });
  });
  var lead = canActForDept(u, dept);
  return posts.map(function (x) {
    var s = ids[x.id];
    return { id: x.id, department: x.department, authorName: x.authorName, title: x.title, body: x.body, createdAt: x.createdAt,
      likes: s.likes, dislikes: s.dislikes, myReaction: s.mine, comments: s.comments.slice(-30), canDelete: lead || String(x.authorEmail).toLowerCase() === me };
  });
}
function v3FindUpdate(id) { return sheetToObjects('Dept Updates').filter(function (x) { return String(x.id) === String(id); })[0]; }
function reactDeptUpdate(p) {
  var u = v3Requester(p);
  var up = v3FindUpdate(p.id);
  if (!up) return { success: false, error: 'Update not found' };
  if (!v3CanReadDept(u, up.department)) return { success: false, error: 'Department members only' };
  var kind = String(p.kind || '');
  var me = String(u.email).toLowerCase();
  var cur = sheetToObjects('Dept Update Activity').filter(function (a) { return a.updateId === up.id && String(a.userEmail).toLowerCase() === me && (a.kind === 'like' || a.kind === 'dislike' || a.kind === 'none'); })[0];
  var k = (kind === 'like' || kind === 'dislike') ? kind : 'none';
  if (cur) updateRowById('Dept Update Activity', cur.id, { kind: k, createdAt: nowIso() });
  else v3Append('Dept Update Activity', { id: uid('dua'), updateId: up.id, userEmail: me, userName: v3Name(u), kind: k, text: '', createdAt: nowIso() }, V3_SHEETS['Dept Update Activity']);
  return { success: true, data: { id: up.id, myReaction: k === 'none' ? '' : k } };
}
function commentDeptUpdate(p) {
  var u = v3Requester(p);
  var up = v3FindUpdate(p.id);
  if (!up) return { success: false, error: 'Update not found' };
  if (!v3CanReadDept(u, up.department)) return { success: false, error: 'Department members only' };
  var text = v3Clean(p.text, 400);
  if (!text) return { success: false, error: 'Write a comment' };
  var row = { id: uid('dua'), updateId: up.id, userEmail: String(u.email).toLowerCase(), userName: v3Name(u), kind: 'comment', text: text, createdAt: nowIso() };
  v3Append('Dept Update Activity', row, V3_SHEETS['Dept Update Activity']);
  if (String(up.authorEmail).toLowerCase() !== row.userEmail) v3Notify(up.authorEmail, 'New comment on "' + (up.title || 'update') + '"', row.userName + ': ' + text.slice(0, 100), 'dept_update', up.id);
  return { success: true, data: { comment: { id: row.id, userName: row.userName, text: text, createdAt: row.createdAt, mine: true } } };
}
function deleteDeptUpdate(p) {
  var u = v3Requester(p);
  var up = v3FindUpdate(p.id);
  if (!up) return { success: false, error: 'Update not found' };
  if (!(canActForDept(u, up.department) || String(up.authorEmail).toLowerCase() === String(u.email).toLowerCase())) return { success: false, error: 'Not allowed' };
  updateRowById('Dept Updates', up.id, { active: false });
  return { success: true, data: { id: up.id } };
}

/* ========== MY HISTORY ========== */
function getMyHistory(p) {
  var u = v3Requester(p);
  var me = String(u.email).toLowerCase();
  var from = v3Date(p.from) || fijiDateString(addFijiDays(getFijiNow(), -30));
  var to = v3Date(p.to) || fijiDateString(addFijiDays(getFijiNow(), 7));
  function inR(d) { d = v3Date(d); return d >= from && d <= to; }
  var orders = [], requests = [];
  Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      if (!inR(o.serviceDate)) return;
      var mine = String(o.userEmail).toLowerCase() === me, reqd = String(o.requestedBy || '').toLowerCase() === me;
      if (!mine && !reqd) return;
      var x = v3MealOut(o, meal);
      if (String(o.orderType) === 'special' || String(o.orderType) === 'late_request') requests.push(x); else orders.push(x);
    });
  });
  var runs = {}; sheetToObjects('Boat Runs').forEach(function (r) { runs[r.id] = r; });
  var boats = sheetToObjects('Boat Bookings').filter(function (b) { return String(b.userEmail).toLowerCase() === me; }).map(function (b) {
    var r = runs[b.runId] || {};
    return { id: b.id, date: v3Date(r.date || b.date), time: r.time || '', route: r.route || r.direction || r.title || '', seats: b.seats || 1, status: b.status || 'confirmed', createdAt: b.createdAt || '' };
  }).filter(function (b) { return !b.date || inR(b.date); });
  var leave = sheetToObjects('Leave Requests').filter(function (l) { return String(l.userEmail).toLowerCase() === me; }).map(v3LeaveOut)
    .filter(function (l) { return !(l.endDate < from || l.startDate > to) || inR(l.createdAt); });
  var fb = sheetToObjects('Chef Feedback').filter(function (f) { return String(f.userEmail).toLowerCase() === me && inR(f.createdAt); })
    .map(function (f) { return { id: f.id, kind: f.kind, message: f.message, status: f.status, chefNote: f.chefNote, createdAt: f.createdAt }; });
  var sug = sheetToObjects('Suggestions').filter(function (s) { return String(s.userEmail).toLowerCase() === me && inR(s.createdAt); })
    .map(function (s) { return { id: s.id, title: s.title, body: s.body, status: s.status, createdAt: s.createdAt }; });
  function byDate(k) { return function (a, b) { return String(b[k] || '').localeCompare(String(a[k] || '')); }; }
  orders.sort(byDate('serviceDate')); requests.sort(byDate('createdAt')); boats.sort(byDate('date')); leave.sort(byDate('createdAt'));
  return { success: true, data: { from: from, to: to, profile: v3UserOut(u), version: APP_VERSION, orders: orders, requests: requests, boats: boats, leave: leave, feedback: fb, suggestions: sug } };
}

/* ========== CHEF DASHBOARD + REPORTS ========== */
function v3CountRow(meal, o) {
  var st = String(o.status);
  if (meal === 'breakfast') return countsInBreakfastTotal(o);
  if (meal === 'lunch') return countedMealStatus(st);
  return st !== 'cancelled' && st !== 'rejected' && st !== 'declined' && st !== 'special_pending' && st !== 'late_pending';
}
function getChefDashboard(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u))) return { success: false, error: 'Chef station (or superadmin) only' };
  return { success: true, data: v3ChefDash() };
}
function v3ChefDash() {
  var today = v3Today(), tom = v3Tomorrow();
  var totals = { today: { breakfast: 0, lunch: 0, dinner: 0 }, tomorrow: { breakfast: 0, lunch: 0, dinner: 0 } };
  var pending = { late: 0, special: 0 };
  Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      var d = v3Date(o.serviceDate), st = String(o.status);
      if (d === today && v3CountRow(meal, o)) totals.today[meal]++;
      if (d === tom && v3CountRow(meal, o)) totals.tomorrow[meal]++;
      if (d >= today) { if (st === 'late_pending') pending.late++; if (st === 'special_pending') pending.special++; }
    });
  });
  var fbNew = 0;
  try { fbNew = sheetToObjects('Chef Feedback').filter(function (f) { return String(f.status) === 'new'; }).length; } catch (e) {}
  var votes = v3TopVotes(3);
  return { totals: totals, pending: pending, feedbackNew: fbNew, liked: votes.liked, disliked: votes.disliked, weekly: mealRangeStats(7).byDay, today: today, tomorrow: tom };
}
function getMealReport(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u))) return { success: false, error: 'Chef station (or superadmin) only' };
  var from = v3Date(p.from) || fijiDateString(addFijiDays(getFijiNow(), -6));
  var to = v3Date(p.to) || v3Tomorrow();
  if (to < from) return { success: false, error: 'End date is before start date' };
  var meals = p.meal && p.meal !== 'all' ? [String(p.meal)] : ['breakfast', 'lunch', 'dinner'];
  var days = {};
  var d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z'), guard = 0;
  while (d <= end && guard++ < 400) { var k = fijiDateString(d); days[k] = {}; meals.forEach(function (m) { days[k][m] = { counted: 0, served: 0, late: 0, special: 0, cancelled: 0, declined: 0, pending: 0 }; }); d = new Date(d.getTime() + 86400000); }
  var items = {};
  meals.forEach(function (meal) {
    if (!V3_MEAL_SHEETS[meal]) return;
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      var k = v3Date(o.serviceDate); if (!days[k]) return;
      var c = days[k][meal], st = String(o.status), t = String(o.orderType || '');
      if (st === 'cancelled') c.cancelled++;
      else if (st === 'rejected' || st === 'declined') c.declined++;
      else if (st === 'late_pending' || st === 'special_pending') c.pending++;
      if (v3CountRow(meal, o)) {
        c.counted++;
        if (st === 'served' || st === 'prepared') c.served++;
        if (t === 'special') c.special++; else if (truthy(o.late)) c.late++;
        if (meal === 'dinner') items[o.mealChoice || 'Standard'] = (items[o.mealChoice || 'Standard'] || 0) + 1;
      }
    });
  });
  var rows = Object.keys(days).sort().map(function (k) { return { date: k, meals: days[k] }; });
  var totals = {};
  meals.forEach(function (m) { totals[m] = { counted: 0, served: 0, late: 0, special: 0, cancelled: 0, declined: 0 }; rows.forEach(function (r) { Object.keys(totals[m]).forEach(function (f) { totals[m][f] += r.meals[m][f]; }); }); });
  var dishList = Object.keys(items).map(function (k) { return { item: k, count: items[k] }; }).sort(function (a, b) { return b.count - a.count; });
  return { success: true, data: { from: from, to: to, meals: meals, days: rows, totals: totals, dinnerItems: dishList } };
}

/* ========== ADMIN EXPORT / SUPER DASHBOARD ========== */
function getAdminExport(p) {
  var u = v3Requester(p);
  if (!isAdminPerm(u)) return { success: false, error: 'Admin only' };
  var from = v3Date(p.from) || fijiDateString(addFijiDays(getFijiNow(), -30));
  var to = v3Date(p.to) || v3Tomorrow();
  function inR(v) { var d = v3Date(v); return !d || (d >= from && d <= to); }
  function strip(rows) { return rows.map(function (r) { var o = Object.assign({}, r); delete o._row; delete o.password; return o; }); }
  var out = {
    from: from, to: to, generatedAt: nowIso(), version: APP_VERSION,
    users: strip(sheetToObjects('Users')).map(function (x) { x.role3 = v3Role(x); x.deptStatus = deptStatusOf(x); return x; }),
    breakfast: strip(sheetToObjects('Breakfast Orders').filter(function (o) { return inR(o.serviceDate); })),
    lunch: strip(sheetToObjects('Lunch Orders').filter(function (o) { return inR(o.serviceDate); })),
    dinner: strip(sheetToObjects('Dinner Orders').filter(function (o) { return inR(o.serviceDate); })),
    leave: strip(sheetToObjects('Leave Requests').filter(function (o) { return inR(o.startDate) || inR(o.createdAt); })),
    boatRuns: strip(sheetToObjects('Boat Runs').filter(function (o) { return inR(o.date); })),
    boatBookings: strip(sheetToObjects('Boat Bookings')),
    feedback: strip(sheetToObjects('Chef Feedback').filter(function (o) { return inR(o.createdAt); })),
    suggestions: strip(sheetToObjects('Suggestions')),
    menuVotes: v3TopVotes(1000).all
  };
  return { success: true, data: out };
}
function getSuperDashboard(p) {
  var u = v3Requester(p);
  if (!isAdminPerm(u)) return { success: false, error: 'Admin only' }; // 3.2.0: admins get the overview (Admin Settings → Overview)
  return { success: true, data: v3SuperDash() };
}
function v3SuperDash() {
  var chef = v3ChefDash();
  var users = sheetToObjects('Users');
  var weekAgo = fijiDateString(addFijiDays(getFijiNow(), -7));
  var roleCounts = {};
  users.forEach(function (x) { var r = v3Role(x); roleCounts[r] = (roleCounts[r] || 0) + 1; });
  var leave = sheetToObjects('Leave Requests');
  var today = v3Today(), tom = v3Tomorrow();
  var runs = sheetToObjects('Boat Runs').filter(function (r) { var d = v3Date(r.date); return (d === today || d === tom) && !/cancel/i.test(String(r.status || '')); });
  var bk = sheetToObjects('Boat Bookings');
  var boat = runs.map(function (r) {
    var pax = bk.filter(function (b) { return b.runId === r.id && b.status !== 'cancelled'; }).reduce(function (s, b) { return s + Number(b.seats || 1); }, 0);
    return { id: r.id, date: v3Date(r.date), time: r.time || '', route: r.route || r.direction || r.title || '', pax: pax, capacity: Number(r.capacity || r.seats || 0) };
  }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  return {
    meals: chef.totals,
    pending: {
      leaveHod: leave.filter(function (l) { return l.status === 'pending_hod' || l.status === 'pending'; }).length,
      leaveMgmt: leave.filter(function (l) { return l.status === 'pending_manager'; }).length,
      late: chef.pending.late, special: chef.pending.special,
      joins: 0,
      feedback: chef.feedbackNew
    },
    boat: boat.slice(0, 8),
    users: { total: users.length, active: users.filter(function (x) { return truthy(x.active); }).length,
      newThisWeek: users.filter(function (x) { return v3Date(x.createdAt) >= weekAgo; }).length, byRole: roleCounts },
    health: { version: APP_VERSION, fijiNow: nowIso(), sheetId: SHEET_ID, verificationDelivery: 'email', mail: mailStatus(), mealTimes: mealTimes(), rolesMigratedAt: getSetting('roles_migrated_at', '') },
    weekly: chef.weekly,
    roleCounts: v3RoleCounts(users)
  };
}
function updateReminder(p) {
  var u = v3Requester(p);
  if (!isAdminPerm(u)) return { success: false, error: 'Admin only' };
  var patch = { updatedAt: nowIso(), updatedBy: u.email };
  if (p.title !== undefined) patch.title = v3Clean(p.title, 120);
  if (p.body !== undefined) patch.body = v3Clean(p.body, 1000);
  if (p.dueDate !== undefined) patch.dueDate = v3Date(p.dueDate);
  if (p.important !== undefined) { patch.important = truthy(p.important); patch.priority = patch.important ? 'high' : 'normal'; }
  var r = updateRowById('Reminders', p.id, patch);
  if (!r) return { success: false, error: 'Reminder not found' };
  return { success: true, data: { reminder: r } };
}

/* ========== HOME BLOCK (added to getBootstrap) ========== */
function getV3Home(u) {
  var me = String(u.email).toLowerCase();
  var role = v3Role(u);
  var out = { role: role, assistantHod: isAsstHod(u), deptStatus: deptStatusOf(u), deptApproved: deptApproved(u), department: u.department || '',
    verificationDelivery: 'email' };
  var today = v3Today(), yest = fijiDateString(addFijiDays(getFijiNow(), -1)), tom = v3Tomorrow();
  var myMeals = [], cancels = {};
  Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
    cancels[meal] = 0;
    sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) {
      var d = v3Date(o.serviceDate);
      if (String(o.userEmail).toLowerCase() !== me || d < yest || d > tom) return;
      myMeals.push(v3MealOut(o, meal));
      if (d === tom && String(o.status) === 'cancelled') cancels[meal]++;
    });
  });
  out.myMeals = myMeals; out.cancelsTomorrow = cancels; out.cancelLimit = V3_CANCEL_LIMIT;
  out.myLeave = sheetToObjects('Leave Requests').filter(function (l) { return String(l.userEmail).toLowerCase() === me; }).map(v3LeaveOut)
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 5);
  out.deptUpdates = v3CanReadDept(u, u.department) ? v3DeptUpdatesFor(u, u.department, 3) : [];
  if (isDeptLead(u) || isAdminPerm(u)) {
    var scope = function (dept) { return isAdminPerm(u) ? true : normDept(dept) === normDept(u.department); };
    var lv = sheetToObjects('Leave Requests');
    var late = 0;
    Object.keys(V3_MEAL_SHEETS).forEach(function (meal) {
      sheetToObjects(V3_MEAL_SHEETS[meal]).forEach(function (o) { if (String(o.status) === 'late_pending' && v3Date(o.serviceDate) >= today && scope(o.department)) late++; });
    });
    out.hodBar = {
      leave: lv.filter(function (l) { return (l.status === 'pending_hod' || l.status === 'pending') && scope(l.department) && String(l.userEmail).toLowerCase() !== me; }).length,
      leaveMgmt: isAdminPerm(u) ? lv.filter(function (l) { return l.status === 'pending_manager' && String(l.userEmail).toLowerCase() !== me; }).length : 0,
      late: late,
      joins: 0
    };
  }
  if (isChefPerm(u)) out.chef = v3ChefDash();
  if (isSuperPerm(u)) out.superDash = v3SuperDash();
  out.roles = userRoles(u);
  out.roleButtons = roleButtons(out.roles);
  out.mealTimes = mealTimesOut();
  out.cutoffReminders = v3CutoffReminders(u, myMeals);
  if (typeof r33Counts === 'function') { try { out.resortBoat = r33Counts(u); } catch (eR) {} } // 3.3.0 resort boat badges
  return out;
}

/* ========== CUTOFF REMINDER (item 39) ==========
 * One hour before each cutoff (App Settings: breakfast / lunch 1pm, dinner 11:55pm Fiji by default) the Home block
 * carries a reminder for users who have not ordered that meal yet. The app shows it as a banner + notification bell
 * item. Nothing is emailed or written to the Sheet, so no trigger is needed. */
function v3CutoffReminders(u, myMeals) {
  var now = getFijiNow();
  var mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  var out = [];
  ['breakfast', 'lunch', 'dinner'].forEach(function (meal) {
    var info = v3MealInfo(meal, now);
    if (!info || !info.open) return;
    var left = (info.cutoffHour * 60 + info.cutoffMinute) - mins;
    if (left <= 0 || left > 60) return;
    var has = (myMeals || []).some(function (o) { return o.meal === meal && o.serviceDate === info.serviceDate && ['cancelled', 'rejected', 'declined'].indexOf(String(o.status)) < 0; });
    if (!has) out.push({ meal: meal, serviceDate: info.serviceDate, closesAt: r3Label(info.cutoff), minutesLeft: left });
  });
  return out;
}

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

/** 3.2.0: admin-level confirm. Superadmin → the superadmin code; admin (not super) → the admin code (ADMIN_PASS). */
function requireAdminCode(p) {
  var u = getRequester(p);
  if (!u || !isAdminPerm(u)) throw new Error('Admin only');
  if (isSuperPerm(u)) return requireSuperCode(p);
  if (String(p.passcode || '') !== ADMIN_PASS) { var e = new Error('Enter the admin code to confirm this change'); e.needsCode = true; throw e; }
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

/* PCR Staff App 3.1.0 — superadmin is an admin-only account, admin activity log, superadmin log + revert.
 * Shared by the Apps Script server and the ?demo=1 mode (tools/build-demo-server.js). Sheet reads/writes go through
 * A31IO (Admin31Io.gs on the server, the demo shim in assets/v3.js), so this file never touches SpreadsheetApp. */

var A31_SUPER_BLOCK_MSG = "Superadmin accounts can't place orders or bookings. Use a staff account.";
var A31_NOTICE_TEXT = 'Superadmin is now an admin-only account. To order meals, book the boat or apply for leave, please register a separate staff account with a different email.';
var A31_LOG_SHEET = 'Admin Log';
var A31_LOG_HEADERS = ['id', 'at', 'actorEmail', 'actorName', 'actorRole', 'actorDept', 'area', 'action', 'target', 'summary', 'before', 'after',
  'bySuper', 'revertable', 'noRevertReason', 'restore', 'revertedAt', 'revertedBy', 'revertOf'];
var A31_NOTICE_COL = 'superNotice31At';
var A31_MAX_ROWS = 300, A31_MAX_JSON = 45000;

/* ---------- 1) superadmin: no staff features (server-side) ---------- */
/** true = always blocked for a superadmin; 'own' = blocked when the record is the superadmin's own. */
var A31_STAFF_ACTIONS = { getMyRoster: true, placeDinnerOrder: true, placeLunchOrder: true, placeBreakfastOrder: true, bookBoat: true, requestLeave: true, submitLeave: true,
  requestLateMeal: true, requestEmergencyTravel: true, requestResortBoat: true, getMySchedule: true, sendChefFeedback: true, voteMenuItem: true,
  cancelMealOrder: 'own', cancelBoatBooking: 'own', cancelLeave: 'own', placeMealOnBehalf: 'own' };

function a31Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function a31RowBy(sheet, field, val) {
  var rows = A31IO.rows(sheet), v = String(val);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][field]) === v) return rows[i];
  return null;
}
/** '' = allowed; otherwise the error to return. */
function a31SuperBlock(action, p, me) {
  var rule = A31_STAFF_ACTIONS[action];
  if (!rule || !me || !isSuperPerm(me)) return '';
  if (rule === true) return A31_SUPER_BLOCK_MSG;
  var mine = a31Lower(me.email);
  if (action === 'cancelMealOrder' || action === 'placeMealOnBehalf') { var t = a31Lower(p.userEmail); return (!t || t === mine) ? A31_SUPER_BLOCK_MSG : ''; }
  if (action === 'cancelBoatBooking') { var b = a31RowBy('Boat Bookings', 'id', p.id); return b && a31Lower(b.userEmail) === mine ? A31_SUPER_BLOCK_MSG : ''; }
  if (action === 'cancelLeave') { var l = a31RowBy('Leave Requests', 'id', p.id); return l && a31Lower(l.userEmail) === mine ? A31_SUPER_BLOCK_MSG : ''; }
  return '';
}

/* ---------- 3/4) admin log ---------- */
var A31_MEAL_SHEETS = { breakfast: 'Breakfast Orders', lunch: 'Lunch Orders', dinner: 'Dinner Orders' };
function a31MealSheets(p) { var m = a31Lower(p.meal); return A31_MEAL_SHEETS[m] ? [A31_MEAL_SHEETS[m]] : ['Breakfast Orders', 'Lunch Orders', 'Dinner Orders']; }
/** action → [default area, sheets to compare (array or fn(p)), what cannot be undone ('' = revertable)] */
var A31_LOGGED = {
  // 3.4.0 rosters + leave allowances (big roster tabs are not snapshotted: upload again to change)
  rosterUploadFinish: ['admin', [], 'Upload the roster again to change it.'],
  linkRosterName: ['dept', ['Roster Name Map'], 'Use Unlink on the Unmatched names page.'],
  unlinkRosterName: ['dept', ['Roster Name Map'], ''],
  saveLeaveAllowance: ['admin', ['Leave Allowances'], ''],
  applyEmployeeCodes: ['admin', ['Users'], ''],
  setEmployeeCode: ['admin', ['Users'], ''],
  // 3.4.0 staff links / registration / special meals log themselves (s34Log; no Users snapshot so passwords never reach the log)
  deleteLeaveAllowance: ['admin', ['Leave Allowances'], ''],
  saveRosterSettings: ['admin', ['App Settings'], ''],
  // Kitchen Admin
  setMealTimes: ['kitchen', ['App Settings'], ''],
  saveDinnerMenuItem: ['kitchen', ['Dinner Menus'], ''],
  deleteDinnerMenuItem: ['kitchen', ['Dinner Menus'], ''],
  adminCancelMealOrder: ['kitchen', a31MealSheets, 'The staff member was already notified — the order row is restored only.'],
  markOrderStatus: ['kitchen', a31MealSheets, ''],
  approveLateDinnerOrder: ['kitchen', ['Dinner Orders'], ''],
  approveLateBreakfastOrder: ['kitchen', ['Breakfast Orders'], ''],
  approveAllLateBreakfast: ['kitchen', ['Breakfast Orders'], ''],
  decideMealRequest: ['kitchen', a31MealSheets, ''],
  decideAllMealRequests: ['kitchen', a31MealSheets, ''],
  markChefFeedback: ['kitchen', ['Chef Feedback'], ''],
  placeSpecialMeal: ['kitchen', a31MealSheets, ''],
  saveDinnerSummary: ['kitchen', [], 'A saved summary / PDF cannot be un-saved.'],
  // Boat Admin
  saveBoatRun: ['boat', ['Boat Runs'], ''],
  deleteBoatRun: ['boat', ['Boat Runs'], ''],
  dedupeBoatRuns: ['boat', ['Boat Runs'], ''],
  cancelBoatBooking: ['boat', ['Boat Bookings'], ''],
  reviewEmergencyTravel: ['boat', ['Emergency Travel'], ''],
  confirmResortBoat: ['boat', ['Resort Boat Bookings'], ''], // 3.3.0 resort boat: admin / boat manager confirm or reject
  // Department Admin
  decideLeave: ['dept', ['Leave Requests'], ''],
  escalateLeave: ['dept', ['Leave Requests'], ''],
  hodDecideResortBoat: ['dept', ['Resort Boat Bookings'], ''], // 3.3.0 resort boat: HOD approve or reject
  approveAllPending: ['dept', function (p) { return a31Lower(p.kind) === 'leave' ? ['Leave Requests'] : ['Leave Requests', 'Breakfast Orders', 'Lunch Orders', 'Dinner Orders']; }, ''],
  updateDeptStaff: ['dept', ['Users'], ''],
  removeFromDept: ['dept', ['Users'], ''],
  decideJoinRequest: ['dept', ['Users'], ''],
  postDeptUpdate: ['dept', ['Dept Updates'], ''],
  deleteDeptUpdate: ['dept', ['Dept Updates'], ''],
  placeMealOnBehalf: ['dept', a31MealSheets, ''],
  // Admin Settings / superadmin
  setUserAccess: ['admin', ['Users'], ''],
  updateUser: ['admin', ['Users'], ''],
  addUser: ['admin', ['Users'], ''],
  importUsersCSV: ['admin', ['Users'], ''],
  approveUser: ['admin', ['Users'], ''],
  deleteUser: ['admin', ['Users'], ''],
  addReminder: ['admin', ['Reminders'], ''],
  updateReminder: ['admin', ['Reminders'], ''],
  completeReminder: ['admin', ['Reminders'], ''],
  deleteReminder: ['admin', ['Reminders'], ''],
  approveSuggestion: ['admin', ['Suggestions'], ''],
  rejectSuggestion: ['admin', ['Suggestions'], ''],
  setAppSetting: ['admin', ['App Settings'], ''],
  saveAlertEmails: ['admin', ['Alert Emails'], ''],
  migrateRoles: ['admin', ['Users'], ''],
  adminNotifyUser: ['admin', [], 'A notification that was sent cannot be taken back.'],
  sendTestEmail: ['admin', [], 'An email that was sent cannot be taken back.'],
  archiveOldRows: ['admin', [], 'Archiving moves many rows to archive tabs — restore them from the archive tabs by hand.'],
  uploadRosterParsed: ['admin', [], 'Roster uploads are not reverted from here.'],
  backfillDinnerSummaries: ['admin', [], 'Saved summaries cannot be un-saved.'],
  runMealTick: ['kitchen', a31MealSheets, 'Automatic approvals already notified staff.'],
  updateReport: ['admin', ['Reports'], 'The reporter was already notified of the reply / status.'],
  setAboutImage: ['admin', ['App Settings'], '']
};
var A31_AREAS = ['kitchen', 'boat', 'dept', 'admin'];
var A31_KEYS = { 'Users': 'email', 'App Settings': 'key', 'Alert Emails': 'email' };
var A31_SECRET = { password: 1, sessionToken: 1, pinHash: 1, token: 1 };
var A31_SKIP_FIELDS = { _row: 1, updatedAt: 1, updatedBy: 1 };

function a31Val(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v);
}
function a31Snap(sheets) {
  var out = {};
  (sheets || []).forEach(function (s) {
    var key = A31_KEYS[s] || 'id', m = {};
    A31IO.rows(s).forEach(function (r) {
      var k = a31Val(r[key]); if (!k) return;
      var o = {}; Object.keys(r).forEach(function (f) { if (!A31_SKIP_FIELDS[f]) o[f] = a31Val(r[f]); });
      m[k] = o;
    });
    out[s] = m;
  });
  return out;
}
/** [{sheet, key, keyVal, kind:'created'|'deleted'|'updated', before, after}] (updated: only changed fields) */
function a31Diff(b, a) {
  var list = [];
  Object.keys(a).forEach(function (s) {
    var key = A31_KEYS[s] || 'id', B = b[s] || {}, A = a[s] || {};
    Object.keys(A).forEach(function (k) {
      if (!B[k]) { list.push({ sheet: s, key: key, keyVal: k, kind: 'created', before: null, after: A[k] }); return; }
      var bf = {}, af = {}, n = 0;
      Object.keys(A[k]).concat(Object.keys(B[k])).forEach(function (f) {
        if (bf[f] !== undefined || af[f] !== undefined) return;
        var x = B[k][f] === undefined ? '' : B[k][f], y = A[k][f] === undefined ? '' : A[k][f];
        if (x !== y) { bf[f] = x; af[f] = y; n++; }
      });
      if (n) list.push({ sheet: s, key: key, keyVal: k, kind: 'updated', before: bf, after: af });
    });
    Object.keys(B).forEach(function (k) { if (!A[k]) list.push({ sheet: s, key: key, keyVal: k, kind: 'deleted', before: B[k], after: null }); });
  });
  return list;
}
function a31Hide(o) {
  if (!o) return o;
  var c = {}; Object.keys(o).forEach(function (f) { c[f] = A31_SECRET[f] ? '•••' : o[f]; }); return c;
}
function a31Label(d) {
  var r = d.after || d.before || {}, full = (d.kind === 'updated') ? (a31RowBy(d.sheet, d.key, d.keyVal) || r) : r;
  if (d.sheet === 'Users') return d.keyVal;
  if (d.sheet === 'App Settings') return d.keyVal;
  if (d.sheet === 'Dinner Menus') return (full.itemName || d.keyVal) + (full.weekday !== undefined && full.weekday !== '' ? ' (' + (['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(full.weekday)] || full.weekday) + ')' : '');
  if (d.sheet === 'Boat Runs') return [String(full.date || '').slice(0, 10), full.time, full.route].filter(Boolean).join(' ') || d.keyVal;
  if (/Orders$/.test(d.sheet)) return (full.userName || full.guestName || full.userEmail || d.keyVal) + ' · ' + d.sheet.replace(' Orders', '').toLowerCase() + ' ' + String(full.serviceDate || '').replace(/^'/, '').slice(0, 10);
  if (d.sheet === 'Leave Requests') return (full.userName || full.userEmail || d.keyVal) + ' · ' + String(full.startDate || '').replace(/^'/, '').slice(0, 10) + (full.endDate ? '→' + String(full.endDate).replace(/^'/, '').slice(0, 10) : '');
  if (d.sheet === 'Boat Bookings' || d.sheet === 'Emergency Travel') return (full.userName || full.userEmail || d.keyVal);
  if (d.sheet === 'Resort Boat Bookings') return (full.userName || full.userEmail || d.keyVal) + ' · resort boat ' + String(full.date || '').replace(/^'/, '').slice(0, 10) + ' ' + (full.run || '') + ' ' + (full.direction === 'to_resort' ? 'Naisoso→Resort' : 'Resort→Naisoso');
  return full.title || full.name || full.email || d.keyVal;
}
function a31Summary(diff) {
  var verbs = { created: 'Added', deleted: 'Removed', updated: 'Changed' };
  var parts = diff.slice(0, 3).map(function (d) {
    if (d.sheet === 'App Settings' && d.kind !== 'deleted') return 'Set ' + d.keyVal + ' → ' + (d.after.value === '' ? '∅' : d.after.value) + (d.kind === 'updated' && d.before.value !== undefined ? ' (was ' + (d.before.value === '' ? '∅' : d.before.value) + ')' : '');
    var s = verbs[d.kind] + ' ' + a31Label(d);
    if (d.kind === 'updated') s += ': ' + Object.keys(d.after).filter(function (f) { return !A31_SECRET[f]; }).slice(0, 4).map(function (f) { return f + ' ' + (d.before[f] === '' ? '∅' : d.before[f]) + ' → ' + (d.after[f] === '' ? '∅' : d.after[f]); }).join('; ');
    return s;
  });
  if (diff.length > 3) parts.push('+' + (diff.length - 3) + ' more');
  return parts.join(' · ').substring(0, 900);
}
function a31RoleOf(u) {
  var p = userPermissions(u);
  var order = ['super_admin', 'admin', 'hod', 'assistant_hod', 'chef', 'boat_manager', 'boat_captain'];
  for (var i = 0; i < order.length; i++) if (p.indexOf(order[i]) >= 0) return order[i];
  return 'staff';
}
function a31HasRole(u) { return !!u && a31RoleOf(u) !== 'staff'; }
function a31Json(o) { try { return JSON.stringify(o); } catch (e) { return ''; } }
/** Write one log row (never throws). */
function a31WriteLog(e) {
  try {
    var row = {}; A31_LOG_HEADERS.forEach(function (h) { row[h] = e[h] === undefined ? '' : e[h]; });
    row.id = row.id || uid('alog');
    row.at = row.at || nowIso();
    A31IO.appendLog(row);
    return row;
  } catch (err) { return null; }
}

/** Wrap one request: block superadmin staff actions, snapshot → run → diff → log. inner(action, p) runs the real action. */
function a31Handle(action, p, inner) {
  var c = a31Pre(action, p || {});
  if (c.blocked) return c.blocked;
  var res = inner(action, c.p);
  return a31Post(c, res);
}
/** Phase 1 (before the action). Returns { blocked } or a context for a31Post. The demo runs the phases around its async action. */
function a31Pre(action, p) {
  var me = null, raw = null;
  try { me = getRequester(p); } catch (e) { me = null; }
  // the account itself (not the token-less "staff view"): a superadmin never gets staff features
  try { raw = p.requesterEmail ? findUserByEmail(p.requesterEmail) : null; } catch (e) { raw = null; }
  var area = String(p.logArea || '');
  delete p.logArea;
  var c = { action: action, p: p, me: me, area: area, log: false };
  var block = raw ? a31SuperBlock(action, p, raw) : '';
  if (block) { c.blocked = { success: false, error: block, superadminBlocked: true }; return c; }
  if (action === 'setAppSetting') { var ow = a31CheckOwnerSetting(p, me); if (ow) { c.blocked = { success: false, error: ow }; return c; } }
  var cfg = A31_LOGGED[action];
  if (!cfg || !me || !a31HasRole(me)) return c;
  // own-account edits and own cancels are staff actions, not admin changes
  if (action === 'updateUser' && (!p.targetEmail || a31Lower(p.targetEmail) === a31Lower(me.email))) return c;
  if (action === 'cancelBoatBooking') { var bk = a31RowBy('Boat Bookings', 'id', p.id); if (!bk || a31Lower(bk.userEmail) === a31Lower(me.email)) return c; }
  c.cfg = cfg;
  c.sheets = typeof cfg[1] === 'function' ? cfg[1](p) : cfg[1];
  try { c.before = c.sheets.length ? a31Snap(c.sheets) : null; } catch (e) { c.before = null; }
  c.log = true;
  return c;
}
/** Phase 2 (after the action): write the log row when something changed. Never breaks the action. */
function a31Post(c, res) {
  if (!c || !c.log || !res || res.success === false) return res;
  try {
    var p = c.p, me = c.me, cfg = c.cfg, sheets = c.sheets, action = c.action, area = c.area;
    var diff = [];
    if (c.before) diff = a31Diff(c.before, a31Snap(sheets));
    if (sheets.length && !diff.length) return res; // nothing changed (dry runs, previews, repeats)
    if (A31_AREAS.indexOf(area) < 0) area = cfg[0];
    var bySuper = isSuperPerm(me);
    var tooBig = diff.length > A31_MAX_ROWS;
    var restore = tooBig ? '' : a31Json(diff);
    if (restore.length > A31_MAX_JSON) { restore = ''; tooBig = true; }
    var reason = cfg[2] || (!sheets.length ? 'Nothing to undo.' : (tooBig ? 'Too many rows changed to undo from here.' : ''));
    var shown = diff.slice(0, 20).map(function (d) { return { sheet: d.sheet, key: d.keyVal, kind: d.kind, before: a31Hide(d.before), after: a31Hide(d.after) }; });
    var target = diff.length ? a31Label(diff[0]) + (diff.length > 1 ? ' +' + (diff.length - 1) : '') : String(p.targetEmail || p.to || p.key || p.id || '');
    var summary = diff.length ? a31Summary(diff) : a31NoSheetSummary(action, p, res);
    a31WriteLog({ actorEmail: a31Lower(me.email), actorName: displayUserName(me) || me.email, actorRole: a31RoleOf(me), actorDept: me.department || '',
      area: area, action: action, target: String(target).substring(0, 200), summary: summary,
      before: a31Json(shown.map(function (d) { return { sheet: d.sheet, key: d.key, kind: d.kind, v: d.before }; })).substring(0, 20000),
      after: a31Json(shown.map(function (d) { return { sheet: d.sheet, key: d.key, kind: d.kind, v: d.after }; })).substring(0, 20000),
      bySuper: bySuper ? 'TRUE' : 'FALSE', revertable: (bySuper && !reason && restore) ? 'TRUE' : 'FALSE', noRevertReason: reason,
      restore: (bySuper && !reason) ? restore : '' });
  } catch (e) { /* logging never breaks the action */ }
  return res;
}
function a31NoSheetSummary(action, p, res) {
  if (action === 'adminNotifyUser') return 'Sent a notification to ' + (p.targetEmail || '') + (p.title ? ': ' + String(p.title).substring(0, 80) : '');
  if (action === 'sendTestEmail') return 'Sent a test email to ' + (p.to || 'self');
  if (action === 'archiveOldRows') return 'Archived old rows' + (res && res.data && res.data.moved ? ' ' + a31Json(res.data.moved) : '');
  if (action === 'rosterUploadFinish' && res && res.data) return 'Uploaded the ' + (res.data.kind || '') + ' roster for the ' + (res.data.label || '') + (res.data.department && res.data.department !== 'ALL' ? ' (' + res.data.department + ')' : '') + ': ' + (res.data.shifts || 0) + ' shifts, ' + (res.data.people || 0) + ' people, ' + ((res.data.unmatched || []).length) + ' unmatched';
  if (action === 'saveDinnerSummary') return 'Saved the dinner summary for ' + (p.serviceDate || 'tomorrow');
  return action;
}

/* ---------- reading the log ---------- */
function a31CanReadArea(u, area) {
  if (!u) return false;
  if (area === 'super') return isSuperPerm(u);
  if (area === 'admin') return isAdminPerm(u);
  if (area === 'kitchen') return isChefPerm(u);
  if (area === 'boat') return isBoatCaptainPerm(u) || isAdminPerm(u);
  if (area === 'dept') return isAdminPerm(u) || isDeptLead(u);
  return false;
}
function a31RevertOwner() { return a31Lower(getSetting('revert_owner_email', '')); }
function a31IsRevertOwner(u) { var o = a31RevertOwner(); return !!u && !!o && isSuperPerm(u) && a31Lower(u.email) === o; }
function a31Out(r, canRevert) {
  var o = {};
  ['id', 'at', 'actorEmail', 'actorName', 'actorRole', 'area', 'action', 'target', 'summary', 'revertedAt', 'revertedBy', 'revertOf', 'noRevertReason'].forEach(function (k) { o[k] = r[k] === undefined ? '' : String(r[k]); });
  try { o.before = r.before ? JSON.parse(r.before) : []; } catch (e) { o.before = []; }
  try { o.after = r.after ? JSON.parse(r.after) : []; } catch (e) { o.after = []; }
  o.bySuper = truthy(r.bySuper);
  o.revertable = truthy(r.revertable) && !r.revertedAt && !r.revertOf;
  o.canRevert = !!canRevert && o.revertable;
  if (!o.revertable && !o.noRevertReason) o.noRevertReason = r.revertedAt ? 'Already reverted' : (r.revertOf ? 'This entry is a revert' : "Can't be reverted");
  return o;
}
/** getAdminLog { area: kitchen|boat|dept|admin|super, offset, limit (≤200) } — newest first. */
function getAdminLog(p) {
  var u = getRequester(p);
  var area = a31Lower(p.area || 'admin');
  if (!a31CanReadArea(u, area)) return { success: false, error: 'You don\u2019t have access to this log' };
  var rows = A31IO.logRows();
  var list = rows.filter(function (r) {
    if (area === 'super') return truthy(r.bySuper);
    if (String(r.area) !== area) return false;
    if (area === 'dept' && !isAdminPerm(u)) return a31Lower(r.actorDept) === a31Lower(u.department);
    return true;
  });
  list.reverse();
  var limit = Math.min(200, Math.max(1, Number(p.limit) || 50)), offset = Math.max(0, Number(p.offset) || 0);
  var owner = area === 'super' && a31IsRevertOwner(u);
  return { success: true, data: { area: area, total: list.length, offset: offset, limit: limit, canRevert: owner,
    revertOwnerSet: !!a31RevertOwner(), entries: list.slice(offset, offset + limit).map(function (r) { return a31Out(r, owner); }) } };
}

/* ---------- revert (superadmin entries; only the revert owner) ---------- */
function revertAdminLog(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (!a31RevertOwner()) return { success: false, error: 'No revert owner is set (App setting revert_owner_email).' };
  if (!a31IsRevertOwner(u)) return { success: false, error: 'Only the revert owner can undo superadmin changes.' };
  var rows = A31IO.logRows(), e = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(p.id)) { e = rows[i]; break; }
  if (!e) return { success: false, error: 'Log entry not found' };
  if (!truthy(e.bySuper)) return { success: false, error: 'Only superadmin changes can be reverted here' };
  if (e.revertedAt) return { success: false, error: 'Already reverted' };
  if (e.revertOf) return { success: false, error: 'A revert cannot be reverted — make the change again instead' };
  if (!truthy(e.revertable) || !e.restore) return { success: false, error: e.noRevertReason || "This change can't be reverted" };
  var diff; try { diff = JSON.parse(e.restore); } catch (x) { return { success: false, error: 'Saved state is unreadable' }; }
  // conflict check: everything must still look exactly like right after the change
  var conflicts = [];
  diff.forEach(function (d) {
    var cur = a31RowBy(d.sheet, d.key, d.keyVal);
    if (d.kind === 'created' && !cur) conflicts.push(a31Label(d) + ' is already gone');
    if (d.kind === 'deleted' && cur) conflicts.push(a31Label(d) + ' exists again');
    if (d.kind === 'updated') {
      if (!cur) { conflicts.push(a31Label(d) + ' no longer exists'); return; }
      Object.keys(d.after).forEach(function (f) { if (a31Val(cur[f]) !== d.after[f]) conflicts.push(a31Label(d) + ' · ' + f + ' was changed again'); });
    }
  });
  if (conflicts.length) return { success: false, error: 'Changed again since — revert by hand: ' + conflicts.slice(0, 3).join('; ') };
  diff.slice().reverse().forEach(function (d) {
    if (d.kind === 'created') A31IO.remove(d.sheet, d.key, d.keyVal);
    else if (d.kind === 'deleted') A31IO.append(d.sheet, d.before);
    else A31IO.update(d.sheet, d.key, d.keyVal, d.before);
  });
  var at = nowIso();
  A31IO.updateLog(e.id, { revertedAt: at, revertedBy: a31Lower(u.email) });
  var inv = diff.map(function (d) { return { sheet: d.sheet, key: d.keyVal, kind: d.kind === 'created' ? 'deleted' : (d.kind === 'deleted' ? 'created' : 'updated'), before: a31Hide(d.after), after: a31Hide(d.before) }; });
  a31WriteLog({ actorEmail: a31Lower(u.email), actorName: displayUserName(u) || u.email, actorRole: a31RoleOf(u), actorDept: u.department || '',
    area: String(e.area || 'admin'), action: 'revert', target: String(e.target || ''), summary: 'Reverted: ' + String(e.summary || e.action).substring(0, 800),
    before: a31Json(inv.map(function (d) { return { sheet: d.sheet, key: d.key, kind: d.kind, v: d.before }; })).substring(0, 20000),
    after: a31Json(inv.map(function (d) { return { sheet: d.sheet, key: d.key, kind: d.kind, v: d.after }; })).substring(0, 20000),
    bySuper: 'TRUE', revertable: 'FALSE', noRevertReason: 'This entry is a revert', revertOf: String(e.id) });
  return { success: true, data: { reverted: e.id, rows: diff.length } };
}

/* ---------- 2) one-time notice for superadmins ---------- */
function getSuperNotice(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: true, data: { show: false } };
  return { success: true, data: { show: !u[A31_NOTICE_COL], text: A31_NOTICE_TEXT, seenAt: String(u[A31_NOTICE_COL] || '') } };
}
function ackSuperNotice(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: true, data: { saved: false } };
  if (!u[A31_NOTICE_COL]) A31IO.update('Users', 'email', a31Lower(u.email), (function () { var o = {}; o[A31_NOTICE_COL] = nowIso(); return o; })(), [A31_NOTICE_COL]);
  return { success: true, data: { saved: true } };
}

/** revert_owner_email: once set, only that owner may change it (any superadmin may set it while empty). */
function a31CheckOwnerSetting(p, me) {
  if (String(p.key || '').trim() !== 'revert_owner_email') return '';
  var v = a31Lower(p.value);
  if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Must be an email address';
  var cur = a31RevertOwner();
  if (cur && (!me || a31Lower(me.email) !== cur)) return 'Only the current revert owner (' + cur + ') can change this setting.';
  return '';
}

function routeAdmin31(action, p) {
  var map = { getAdminLog: getAdminLog, revertAdminLog: revertAdminLog, getSuperNotice: getSuperNotice, ackSuperNotice: ackSuperNotice };
  var fn = map[action];
  if (!fn) return typeof routeReports31 === 'function' ? routeReports31(action, p) : null; // 3.1.0 reports + guides
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}

/* PCR Staff App 3.1.0 — "Report a problem" (Reports tab + superadmin inbox) and first-time role page guides.
 * Shared by the Apps Script server and the ?demo=1 mode (tools/build-demo-server.js). Sheet access through A31IO / appendRow. */

var A32_REPORTS_SHEET = 'Reports';
var A32_REPORT_HEADERS = ['id', 'createdAt', 'userEmail', 'userName', 'userRole', 'department', 'type', 'description', 'page', 'appVersion', 'device',
  'images', 'status', 'reply', 'repliedAt', 'repliedBy', 'updatedAt', 'updatedBy'];
var A32_TYPES = { problem: 'Problem / error', change: 'Change request', feature: 'New feature / other' };
var A32_STATUS = { 'new': 'New', noted: 'Noted', in_progress: 'In progress', done: 'Done' };
var A32_MAX_IMAGES = 3, A32_MAX_IMAGE_CHARS = 700000, A32_MAX_PER_DAY = 15;
var A32_GUIDE_COL = 'guidesSeen31';
var A32_GUIDES = { kitchen: 1, boat: 1, dept: 1, admin: 1, manage: 1 };

/** 3.2.0: reports belong to ONE owner account: App setting revert_owner_email, else the bootstrap IT account.
 * Only that superadmin sees the Reports inbox / badge / in-app + push alert. No emails on a new report. */
function a32ReportOwner() { return a31RevertOwner() || A320_OWNER; }
function a32IsReportOwner(u) { return !!u && isSuperPerm(u) && a31Lower(u.email) === a32ReportOwner(); }
var A32_OWNER_ONLY = 'Reports go to the owner account only.';
/** 3.2.0 one-time update (chosen by the owner): App setting revert_owner_email = it@… when it is still empty and that
 * account is an active superadmin. Runs once per project (Script Property A320_OWNER_DONE), logged in the Superadmin log. */
var A320_OWNER = 'it@paradisecoveresortfiji.com';
function a320OwnerOnce() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('A320_OWNER_DONE')) return;
    props.setProperty('A320_OWNER_DONE', nowIso());
    var cur = a31RevertOwner(), u = findUserByEmail(A320_OWNER), ok = !cur && !!u && truthy(u.active) && isSuperPerm(u);
    if (ok) setSetting('revert_owner_email', A320_OWNER, 'system');
    a31WriteLog({ actorEmail: 'system', actorName: 'App update 3.2.0', actorRole: 'system', area: 'super', action: 'setAppSetting', target: 'revert_owner_email',
      summary: ok ? 'Revert / report owner set to ' + A320_OWNER + ' (one-time 3.2.0 update, chosen by the owner)' : 'One-time 3.2.0 owner update skipped (' + (cur ? 'already set to ' + cur : 'account not an active superadmin') + ')',
      before: cur, after: ok ? A320_OWNER : cur, bySuper: 'TRUE', revertable: 'FALSE', noRevertReason: 'System update' });
  } catch (e) {}
}
function a32Out(r) {
  var o = {};
  A32_REPORT_HEADERS.forEach(function (h) { o[h] = r[h] === undefined || r[h] === null ? '' : String(r[h]); });
  try { o.images = r.images ? JSON.parse(r.images) : []; } catch (e) { o.images = []; }
  o.typeLabel = A32_TYPES[o.type] || o.type;
  o.statusLabel = A32_STATUS[o.status] || o.status;
  return o;
}

/** submitReport { type, description, images:[dataURL ≤3], page, appVersion, device } — any signed-in user. */
function submitReport(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var type = A32_TYPES[p.type] ? p.type : 'problem';
  var desc = String(p.description || '').replace(/\r/g, '').trim().substring(0, 3000);
  if (desc.length < 5) return { success: false, error: 'Please describe the problem (a few words at least).' };
  var mine = a31Lower(u.email), today = String(nowIso()).slice(0, 10);
  var n = A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return a31Lower(r.userEmail) === mine && String(r.createdAt).slice(0, 10) === today; }).length;
  if (n >= A32_MAX_PER_DAY) return { success: false, error: 'Too many reports today — please try again tomorrow.' };
  var id = uid('rep');
  var imgs = (Array.isArray(p.images) ? p.images : []).slice(0, A32_MAX_IMAGES);
  var links = [], imgErr = '';
  imgs.forEach(function (d, i) {
    d = String(d || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(d)) { imgErr = 'Only JPG / PNG / WebP images'; return; }
    if (d.length > A32_MAX_IMAGE_CHARS) { imgErr = 'An image was too big (it is shrunk on the phone first — try again)'; return; }
    try { var l = A31IO.saveImage(id + '-' + (i + 1), d); if (l) links.push(l); } catch (e) { imgErr = 'Screenshot could not be saved: ' + String(e && e.message || e).substring(0, 120); }
  });
  var row = { id: id, createdAt: nowIso(), userEmail: mine, userName: displayUserName(u) || u.email, userRole: a31RoleOf(u), department: u.department || '',
    type: type, description: desc, page: String(p.page || '').substring(0, 80), appVersion: String(p.appVersion || '').substring(0, 20),
    device: String(p.device || '').substring(0, 300), images: JSON.stringify(links), status: 'new', reply: '', repliedAt: '', repliedBy: '', updatedAt: '', updatedBy: '' };
  ensureSheet(getSS(), A32_REPORTS_SHEET, A32_REPORT_HEADERS);
  appendRow(A32_REPORTS_SHEET, row, A32_REPORT_HEADERS);
  // 3.2.0: only the report owner is alerted (in-app → phone push via the Notifications hook). No email.
  try {
    var own = a32ReportOwner();
    var ou = sheetToObjects('Users').filter(function (x) { return truthy(x.active) && isSuperPerm(x) && a31Lower(x.email) === own; })[0];
    if (ou) v3Notify(ou.email, 'New report: ' + A32_TYPES[type], row.userName + ': ' + desc.substring(0, 140), 'report', id);
  } catch (e) {}
  return { success: true, data: { id: id, images: links.length, imageError: imgErr } };
}

/** getReports { status?, offset, limit } — superadmin inbox (newest first) + counts. */
function getReports(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (!a32IsReportOwner(u)) return { success: false, error: A32_OWNER_ONLY, notOwner: true };
  var all = A31IO.rows(A32_REPORTS_SHEET).slice().reverse();
  var counts = { 'new': 0, noted: 0, in_progress: 0, done: 0, total: all.length };
  all.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
  var st = String(p.status || ''), list = st ? all.filter(function (r) { return r.status === st; }) : all;
  var limit = Math.min(100, Math.max(1, Number(p.limit) || 30)), offset = Math.max(0, Number(p.offset) || 0);
  return { success: true, data: { counts: counts, total: list.length, offset: offset, limit: limit, reports: list.slice(offset, offset + limit).map(a32Out) } };
}
/** Cheap badge count for the superadmin nav. */
function getReportCount(p) {
  var u = getRequester(p);
  if (!a32IsReportOwner(u)) return { success: true, data: { 'new': 0, owner: false } };
  return { success: true, data: { 'new': A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return r.status === 'new'; }).length, owner: true } };
}
/** My own reports (with replies) — any user. */
function getMyReports(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var mine = a31Lower(u.email);
  return { success: true, data: { reports: A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return a31Lower(r.userEmail) === mine; }).reverse().slice(0, 30).map(a32Out) } };
}
/** updateReport { id, status?, reply? } — report owner only. Notifies the reporter (in-app + email + push). */
function updateReport(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (!a32IsReportOwner(u)) return { success: false, error: A32_OWNER_ONLY };
  var r = a31RowBy(A32_REPORTS_SHEET, 'id', p.id);
  if (!r) return { success: false, error: 'Report not found' };
  var patch = {}, st = String(p.status || ''), reply = String(p.reply || '').trim().substring(0, 2000);
  if (st && !A32_STATUS[st]) return { success: false, error: 'Unknown status' };
  if (st && st !== r.status) patch.status = st;
  if (reply) { patch.reply = reply; patch.repliedAt = nowIso(); patch.repliedBy = displayUserName(u) || u.email; }
  if (!Object.keys(patch).length) return { success: false, error: 'Nothing to change' };
  patch.updatedAt = nowIso(); patch.updatedBy = a31Lower(u.email);
  A31IO.update(A32_REPORTS_SHEET, 'id', r.id, patch);
  var title = 'Your report: ' + (A32_STATUS[patch.status || r.status] || r.status);
  var body = (reply ? 'Reply: ' + reply + '\n' : '') + '“' + String(r.description).substring(0, 120) + '”';
  v3Notify(r.userEmail, title, body, 'report', r.id);
  try { v3Mail(r.userEmail, '[PCR Staff App] ' + title, 'Hi ' + (r.userName || '') + ',\n\n' + (patch.status ? 'Status: ' + A32_STATUS[patch.status] + '\n' : '') + (reply ? '\nReply from ' + patch.repliedBy + ':\n' + reply + '\n' : '') + '\nYour report (' + String(r.createdAt).slice(0, 16) + '):\n' + String(r.description).substring(0, 1000)); } catch (e) {}
  if (typeof a33PushEvent === 'function') { try { a33PushEvent('report_update', { email: r.userEmail, title: title, body: body, id: r.id }); } catch (e) {} }
  return { success: true, data: { report: a32Out(a31RowBy(A32_REPORTS_SHEET, 'id', r.id) || r) } };
}

/* ---------- 3.2.0 About image (footer "About" button). Superadmin uploads a replacement; stored like report screenshots. ---------- */
/** setAboutImage { image: dataURL } or { reset: true } — superadmin. App setting about_image_url ('' = the default poster). */
function setAboutImage(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (truthy(p.reset)) { setSetting('about_image_url', '', u.email); return { success: true, data: { url: '' } }; }
  var d = String(p.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(d)) return { success: false, error: 'Choose a JPG, PNG or WebP image' };
  if (d.length > A32_MAX_IMAGE_CHARS) return { success: false, error: 'The image is too big — try a smaller one' };
  var l = A31IO.saveImage('about-' + String(nowIso()).replace(/[^0-9]/g, '').slice(0, 12), d);
  if (!l) return { success: false, error: 'The image could not be saved' };
  var url = /^data:/.test(String(l.thumb || '')) ? l.thumb : 'https://drive.google.com/thumbnail?id=' + l.id + '&sz=w1200';
  setSetting('about_image_url', url, u.email);
  return { success: true, data: { url: url } };
}

/* ---------- first-time role page guides (seen per user on the server) ---------- */
function a32Seen(u) { return String((u && u[A32_GUIDE_COL]) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
function getMyGuides(p) {
  var u = getRequester(p);
  if (!u) return { success: true, data: { seen: [] } };
  return { success: true, data: { seen: a32Seen(u) } };
}
function markGuideSeen(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var g = String(p.guide || '');
  if (!A32_GUIDES[g]) return { success: false, error: 'Unknown guide' };
  var seen = a32Seen(u);
  if (seen.indexOf(g) < 0) {
    seen.push(g);
    var o = {}; o[A32_GUIDE_COL] = seen.join(',');
    A31IO.update('Users', 'email', a31Lower(u.email), o, [A32_GUIDE_COL]);
  }
  return { success: true, data: { seen: seen } };
}

function routeReports31(action, p) {
  var map = { setAboutImage: setAboutImage, submitReport: submitReport, getReports: getReports, getReportCount: getReportCount, getMyReports: getMyReports, updateReport: updateReport,
    getMyGuides: getMyGuides, markGuideSeen: markGuideSeen };
  var fn = map[action];
  if (!fn) return typeof routePush33 === 'function' ? routePush33(action, p) : null; // 3.2.0 push
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}

/* PCR Staff App 3.3.0 — Resort boat (Paradise Cove Express, PCE): Naisoso Marina <-> resort, AM and PM runs.
 * Staff request a seat → HOD / assistant HOD of their department approves (same rule as leave) → admin or boat
 * manager confirms (staff added to that run's manifest). Rejected at either step with an optional reason; staff can
 * cancel while pending. "Day off" creates a linked return request in the opposite direction (each leg is its own row
 * and is decided on its own; the approve / confirm screens offer "both legs" in one tap when both wait at the same step).
 * Sheet "Resort Boat Bookings" is created (and new columns added) on first use, so live needs no manual setup.
 * Shared by the Apps Script server and the ?demo=1 mode (tools/build-demo-server.js). */

var R33_SHEET = 'Resort Boat Bookings';
var R33_HEADERS = ['id', 'groupId', 'linkedId', 'leg', 'userEmail', 'userName', 'department', 'direction', 'date', 'run', 'pax',
  'purpose', 'reason', 'status', 'hodStatus', 'hodBy', 'hodAt', 'hodNote', 'adminStatus', 'adminBy', 'adminAt', 'adminNote',
  'cancelledAt', 'cancelledBy', 'createdAt', 'updatedAt'];
var R33_DIRECTIONS = { to_naisoso: 'Resort → Naisoso', to_resort: 'Naisoso → Resort' };
var R33_RUNS = ['AM', 'PM'];
var R33_MAX_PAX = 20, R33_MAX_DAYS = 90;
/** Timetable shown in the app (Fiji time). cut = minutes after midnight when same-day requests stop. */
var R33_TIMES = {
  'AM|to_resort': { departs: '9:00am', from: 'Naisoso Marina', reportBy: 'At Naisoso Marina before 8:15am', arrives: 'Arrives at the resort around 10:00am', cut: 8 * 60 + 15 },
  'AM|to_naisoso': { departs: '10:20–10:30am', from: 'the resort', reportBy: 'Departs the resort around 10:20–10:30am', arrives: 'Arrives at Naisoso about 1 hour after departure', cut: 10 * 60 + 20 },
  'PM|to_resort': { departs: '2:00pm', from: 'Naisoso Marina', reportBy: 'At Naisoso Marina before 1:00pm', arrives: 'Arrives at the resort by 3:00pm', cut: 13 * 60 },
  'PM|to_naisoso': { departs: '3:30pm', from: 'the resort', reportBy: 'At the Dive Shop by 2:30pm', arrives: 'Departs the resort around 3:30pm', cut: 14 * 60 + 30 }
};
var R33_ACTIVE = { pending_hod: 1, pending_admin: 1, confirmed: 1 };

function r33Ensure() {
  var c = null;
  try { c = CacheService.getScriptCache(); if (c.get('pcr_r33_schema_1') === '1') return; } catch (e) {}
  ensureSheet(getSS(), R33_SHEET, R33_HEADERS);
  try { if (c) c.put('pcr_r33_schema_1', '1', 21600); } catch (e2) {}
}
function r33Rows() { return sheetToObjects(R33_SHEET); }
function r33Find(id) { var s = String(id || ''); return r33Rows().filter(function (x) { return String(x.id) === s; })[0] || null; }
function r33Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function r33Label(row) { return (R33_DIRECTIONS[row.direction] || row.direction) + ' · ' + v3Date(row.date) + ' ' + row.run + ' run'; }
function r33Out(row, me, extra) {
  var t = R33_TIMES[row.run + '|' + row.direction] || {};
  var o = {
    id: row.id, groupId: row.groupId || '', linkedId: row.linkedId || '', leg: row.leg || 'single',
    userEmail: row.userEmail, userName: row.userName, department: row.department || '',
    direction: row.direction, directionLabel: R33_DIRECTIONS[row.direction] || row.direction, date: v3Date(row.date), run: row.run,
    pax: Number(row.pax || 1), purpose: row.purpose, purposeLabel: row.purpose === 'day_off' ? 'Day off' : 'Other reason', reason: row.reason || '',
    status: row.status, hodStatus: row.hodStatus || '', hodBy: row.hodBy || '', hodAt: row.hodAt || '', hodNote: row.hodNote || '',
    adminStatus: row.adminStatus || '', adminBy: row.adminBy || '', adminAt: row.adminAt || '', adminNote: row.adminNote || '',
    cancelledAt: row.cancelledAt || '', createdAt: row.createdAt || '', departs: t.departs || '', reportBy: t.reportBy || '', arrives: t.arrives || ''
  };
  if (me) o.mine = r33Lower(row.userEmail) === r33Lower(me.email);
  return extra ? Object.assign(o, extra) : o;
}
/** Boat managers + admins (they confirm). */
function r33Confirmers() {
  return sheetToObjects('Users').filter(function (u) {
    if (!truthy(u.active)) return false;
    var p = userPermissions(u);
    return p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0 || isAdminPerm(u);
  });
}
function r33NotifyAll(users, title, body, kind, id, except) {
  var seen = {}; var ex = r33Lower(except);
  (users || []).forEach(function (u) { var em = r33Lower(u.email); if (!em || em === ex || seen[em]) return; seen[em] = 1; v3Notify(em, title, body, kind, id); });
}
function r33NoLead(row) {
  return !deptLeads(row.department).some(function (x) { return r33Lower(x.email) !== r33Lower(row.userEmail); });
}
/** HOD step: the HOD / assistant HOD of that department; an admin only when the department has no other lead. */
function r33CanHod(r, row) {
  if (!r || r33Lower(r.email) === r33Lower(row.userEmail)) return false;
  return v3IsLeadOf(r, row.department) || (isAdminPerm(r) && (r33NoLead(row) || (typeof A341_BEHALF !== 'undefined' && A341_BEHALF))); // 3.4.1: admin on behalf of HOD
}
function r33CanConfirm(r, row) {
  if (!r || r33Lower(r.email) === r33Lower(row.userEmail)) return false;
  return isBoatManagerPerm(r);
}
function r33MinsNow() { var n = getFijiNow(); return n.getUTCHours() * 60 + n.getUTCMinutes(); }
function r33CheckLeg(date, run, direction) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick the date of travel';
  if (R33_RUNS.indexOf(run) < 0) return 'Pick the AM or PM run';
  if (!R33_DIRECTIONS[direction]) return 'Pick the direction';
  var today = v3Today(), last = fijiDateString(addFijiDays(getFijiNow(), R33_MAX_DAYS));
  if (date < today) return 'The date ' + date + ' is in the past';
  if (date > last) return 'Requests can be made up to ' + R33_MAX_DAYS + ' days ahead';
  var t = R33_TIMES[run + '|' + direction];
  if (date === today && t && r33MinsNow() >= t.cut) return 'Too late for today\'s ' + run + ' run (' + t.reportBy.replace(/^At /, 'at ') + ') — pick a later run';
  return '';
}
function r33Dup(email, date, run, direction) {
  return r33Rows().some(function (x) {
    return r33Lower(x.userEmail) === email && v3Date(x.date) === date && String(x.run) === run && String(x.direction) === direction && R33_ACTIVE[String(x.status)];
  });
}

/* ---------- staff: request / cancel / list ---------- */
function requestResortBoat(p) {
  var u = v3Requester(p);
  var direction = String(p.direction || ''), date = v3Date(p.date), run = String(p.run || '').toUpperCase();
  var pax = Math.floor(Number(p.pax || 1));
  var purpose = String(p.purpose || '') === 'day_off' ? 'day_off' : (String(p.purpose || '') === 'other' ? 'other' : '');
  if (!purpose) return { success: false, error: 'Pick the travel purpose' };
  var err = r33CheckLeg(date, run, direction);
  if (err) return { success: false, error: err };
  if (!(pax >= 1 && pax <= R33_MAX_PAX)) return { success: false, error: 'Number of pax must be 1 to ' + R33_MAX_PAX };
  var reason = v3Clean(p.reason, 300);
  if (purpose === 'other' && reason.length < 3) return { success: false, error: 'Please write the reason for travel' };
  var back = null;
  if (purpose === 'day_off') {
    var rDate = v3Date(p.returnDate), rRun = String(p.returnRun || '').toUpperCase();
    var rDir = direction === 'to_naisoso' ? 'to_resort' : 'to_naisoso';
    if (!rDate) return { success: false, error: 'Pick the return date' };
    var e2 = r33CheckLeg(rDate, rRun, rDir);
    if (e2) return { success: false, error: 'Return: ' + e2 };
    if (rDate < date) return { success: false, error: 'The return date is before the travel date' };
    if (rDate === date && !(run === 'AM' && rRun === 'PM')) return { success: false, error: 'Same-day return: go on the AM run and come back on the PM run' };
    back = { date: rDate, run: rRun, direction: rDir };
  }
  var email = r33Lower(u.email);
  if (r33Dup(email, date, run, direction)) return { success: false, error: 'You already have a request for ' + date + ' ' + run + ' (' + R33_DIRECTIONS[direction] + ')' };
  if (back && r33Dup(email, back.date, back.run, back.direction)) return { success: false, error: 'You already have a request for the return ' + back.date + ' ' + back.run };
  r33Ensure();
  var lead = v3HasHod(u) || isAdminPerm(u); // HODs / admins go straight to the confirm step (nobody approves their own)
  var now = nowIso(), gid = uid('rbg');
  var base = { groupId: gid, userEmail: email, userName: v3Name(u), department: u.department || '', pax: pax, purpose: purpose,
    reason: purpose === 'day_off' ? (reason || 'Day off') : reason, status: lead ? 'pending_admin' : 'pending_hod', hodStatus: lead ? 'skipped' : 'pending',
    hodBy: '', hodAt: '', hodNote: '', adminStatus: 'pending', adminBy: '', adminAt: '', adminNote: '', cancelledAt: '', cancelledBy: '', createdAt: now, updatedAt: now };
  var out = Object.assign({ id: uid('rb'), leg: back ? 'outbound' : 'single', direction: direction, date: date, run: run, linkedId: '' }, base);
  var ret = null;
  if (back) {
    ret = Object.assign({ id: uid('rb'), leg: 'return', direction: back.direction, date: back.date, run: back.run, linkedId: out.id }, base);
    out.linkedId = ret.id;
  }
  appendRow(R33_SHEET, out, R33_HEADERS);
  if (ret) appendRow(R33_SHEET, ret, R33_HEADERS);
  var what = r33Label(out) + (ret ? ' · return ' + r33Label(ret) : '') + ' · ' + pax + ' pax · ' + (purpose === 'day_off' ? 'Day off' : reason);
  v3Notify(email, 'Resort boat request sent', what + (lead ? ' — waiting for admin / boat manager' : ' — waiting for your HOD'), 'resort_boat', out.id);
  if (lead) r33NotifyAll(r33Confirmers(), 'Resort boat to confirm: ' + out.userName, what, 'resort_boat_admin', out.id, email);
  else {
    var leads = deptLeads(u.department).filter(function (x) { return r33Lower(x.email) !== email; });
    r33NotifyAll(leads.length ? leads : adminUsers(), 'Resort boat request: ' + out.userName, what, 'resort_boat_hod', out.id, email);
  }
  var list = [r33Out(out, u)]; if (ret) list.push(r33Out(ret, u));
  return { success: true, data: { requests: list } };
}
function cancelResortBoat(p) {
  var u = v3Requester(p);
  var row = r33Find(p.id);
  if (!row) return { success: false, error: 'Request not found' };
  if (r33Lower(row.userEmail) !== r33Lower(u.email)) return { success: false, error: 'You can only cancel your own request' };
  var targets = [row];
  if ((p.both === true || p.both === 'true') && row.linkedId) { var l = r33Find(row.linkedId); if (l) targets.push(l); }
  var done = [], now = nowIso();
  targets.forEach(function (x, i) {
    var st = String(x.status);
    if (st !== 'pending_hod' && st !== 'pending_admin') { if (i === 0) done.push({ error: 'Only pending requests can be cancelled (this one is ' + st + ')' }); return; }
    updateRowById(R33_SHEET, x.id, { status: 'cancelled', cancelledAt: now, cancelledBy: r33Lower(u.email), updatedAt: now });
    done.push(r33Out(Object.assign({}, x, { status: 'cancelled', cancelledAt: now }), u));
    // tell whoever was going to decide it
    var to = st === 'pending_hod' ? deptLeads(x.department) : r33Confirmers();
    r33NotifyAll(to, 'Resort boat request cancelled: ' + x.userName, r33Label(x), st === 'pending_hod' ? 'resort_boat_hod' : 'resort_boat_admin', x.id + 'c', u.email);
  });
  if (done[0] && done[0].error) return { success: false, error: done[0].error };
  return { success: true, data: { cancelled: done } };
}
/** scope: mine | hod (department leads; admins see all departments) | admin (boat manager / admin) */
function getResortBoat(p) {
  var u = v3Requester(p);
  var scope = String(p.scope || 'mine'), me = r33Lower(u.email);
  var from = fijiDateString(addFijiDays(getFijiNow(), -Number(p.days || 14)));
  var rows = r33Rows();
  var out = [];
  if (scope === 'mine') {
    out = rows.filter(function (x) { return r33Lower(x.userEmail) === me && (v3Date(x.date) >= from || R33_ACTIVE[String(x.status)]); }).map(function (x) { return r33Out(x, u); });
  } else if (scope === 'hod') {
    if (!isDeptLead(u) && !isAdminPerm(u)) return { success: false, error: 'HOD / assistant HOD / admin only' };
    out = rows.filter(function (x) {
      if (!isAdminPerm(u) && normDept(x.department) !== normDept(u.department)) return false;
      if (r33Lower(x.userEmail) === me) return false;
      return String(x.status) === 'pending_hod' || (v3Date(x.date) >= from && String(x.hodStatus) !== 'pending' && String(x.hodStatus) !== 'skipped');
    }).map(function (x) { return r33Out(x, u, { canDecide: String(x.status) === 'pending_hod' && r33CanHod(u, x) }); });
  } else if (scope === 'admin') {
    if (!isBoatCaptainPerm(u)) return { success: false, error: 'Boat manager / admin only' };
    out = rows.filter(function (x) {
      var st = String(x.status);
      return st === 'pending_admin' || (v3Date(x.date) >= from && (st === 'confirmed' || (st === 'rejected' && x.adminBy)));
    }).map(function (x) { return r33Out(x, u, { canDecide: String(x.status) === 'pending_admin' && r33CanConfirm(u, x) }); });
  } else return { success: false, error: 'Unknown scope' };
  out.sort(function (a, b) { return (a.date + a.run + a.createdAt).localeCompare(b.date + b.run + b.createdAt); });
  var counts = { hod: 0, admin: 0 };
  rows.forEach(function (x) {
    if (String(x.status) === 'pending_hod' && r33CanHod(u, x)) counts.hod++;
    if (String(x.status) === 'pending_admin' && r33CanConfirm(u, x)) counts.admin++;
  });
  return { success: true, data: { scope: scope, requests: out, counts: counts, times: r33TimesOut() } };
}
function r33TimesOut() {
  return Object.keys(R33_TIMES).map(function (k) { var t = R33_TIMES[k], q = k.split('|'); return { run: q[0], direction: q[1], directionLabel: R33_DIRECTIONS[q[1]], departs: t.departs, from: t.from, reportBy: t.reportBy, arrives: t.arrives }; });
}

/* ---------- HOD step ---------- */
function r33Decide(p, step) {
  var r = v3Requester(p);
  var row = r33Find(p.id);
  if (!row) return { success: false, error: 'Request not found' };
  var d = String(p.decision || '').toLowerCase();
  var approve = step === 'hod' ? /^(approve|approved|forward)$/.test(d) : /^(confirm|confirmed|approve|approved)$/.test(d);
  if (!approve && !/^(reject|rejected|decline|declined)$/.test(d)) return { success: false, error: 'decision must be ' + (step === 'hod' ? 'approve' : 'confirm') + ' or reject' };
  var want = step === 'hod' ? 'pending_hod' : 'pending_admin';
  var targets = [row];
  if ((p.both === true || p.both === 'true') && row.linkedId) { var l = r33Find(row.linkedId); if (l && String(l.status) === want) targets.push(l); }
  var note = v3Clean(p.note, 300), now = nowIso(), done = [];
  for (var i = 0; i < targets.length; i++) {
    var x = targets[i];
    if (String(x.status) !== want) return { success: false, error: 'This request is ' + String(x.status).replace('_', ' ') + ' — nothing to ' + (step === 'hod' ? 'approve' : 'confirm') };
    if (r33Lower(x.userEmail) === r33Lower(r.email)) return { success: false, error: 'You cannot decide your own request' };
    if (step === 'hod' && !r33CanHod(r, x)) return { success: false, error: 'Waiting for the HOD / assistant HOD of ' + (x.department || 'the department') + ' (HODs only decide their own department)' };
    if (step === 'admin' && !r33CanConfirm(r, x)) return { success: false, error: 'Only a boat manager or admin can confirm' };
  }
  targets.forEach(function (x) {
    var patch;
    if (step === 'hod') {
      var n2 = note; if (!v3IsLeadOf(r, x.department)) n2 = (n2 ? n2 + ' ' : '') + (!r33NoLead(x) ? '(' + (approve ? 'approved' : 'declined') + ' by admin on behalf of HOD)' : '(department has no HOD — decided by admin)');
      patch = { status: approve ? 'pending_admin' : 'rejected', hodStatus: approve ? 'approved' : 'declined', hodBy: r33Lower(r.email), hodAt: now, hodNote: n2, updatedAt: now };
    } else {
      patch = { status: approve ? 'confirmed' : 'rejected', adminStatus: approve ? 'confirmed' : 'declined', adminBy: r33Lower(r.email), adminAt: now, adminNote: note, updatedAt: now };
    }
    updateRowById(R33_SHEET, x.id, patch);
    done.push(Object.assign({}, x, patch));
  });
  var first = done[0], legs = done.map(r33Label).join(' + ');
  var who = v3Name(r);
  if (step === 'hod') {
    v3Notify(first.userEmail, approve ? 'Resort boat: HOD approved' : 'Resort boat request declined',
      legs + (approve ? ' — approved by ' + who + ', sent to admin / boat manager to confirm' : ' — declined by ' + who) + (note ? ' — ' + note : ''), 'resort_boat', first.id + (approve ? 'h' : 'x'));
    if (approve) r33NotifyAll(r33Confirmers(), 'Resort boat to confirm: ' + first.userName, legs + ' · ' + first.pax + ' pax · HOD ' + who, 'resort_boat_admin', first.id, r.email);
  } else {
    v3Notify(first.userEmail, approve ? 'Resort boat confirmed' : 'Resort boat request declined',
      legs + (approve ? ' — you are on the manifest. ' + (R33_TIMES[first.run + '|' + first.direction] || {}).reportBy : ' — declined by ' + who) + (note ? ' — ' + note : ''), 'resort_boat', first.id + (approve ? 'a' : 'x'));
    if (first.hodBy && r33Lower(first.hodBy) !== r33Lower(r.email)) v3Notify(first.hodBy, 'Resort boat ' + (approve ? 'confirmed' : 'declined') + ': ' + first.userName, legs, 'resort_boat_hod', first.id + 'f');
  }
  return { success: true, data: { requests: done.map(function (x) { return r33Out(x, r); }) } };
}
function hodDecideResortBoat(p) { return r33Decide(p, 'hod'); }
function confirmResortBoat(p) { return r33Decide(p, 'admin'); }

/* ---------- manifest (per date · run · direction) ---------- */
function getResortBoatManifest(p) {
  var u = v3Requester(p);
  if (!isBoatCaptainPerm(u)) return { success: false, error: 'Boat manager / captain / admin only' };
  var date = v3Date(p.date) || v3Today();
  var rows = r33Rows().filter(function (x) { return v3Date(x.date) === date; });
  var runs = [['AM', 'to_resort'], ['AM', 'to_naisoso'], ['PM', 'to_resort'], ['PM', 'to_naisoso']].map(function (k) {
    var t = R33_TIMES[k[0] + '|' + k[1]];
    var mine = rows.filter(function (x) { return String(x.run) === k[0] && String(x.direction) === k[1]; });
    var conf = mine.filter(function (x) { return String(x.status) === 'confirmed'; }).map(function (x) { return r33Out(x, u); })
      .sort(function (a, b) { return String(a.userName).localeCompare(String(b.userName)); });
    return { run: k[0], direction: k[1], directionLabel: R33_DIRECTIONS[k[1]], departs: t.departs, from: t.from, reportBy: t.reportBy, arrives: t.arrives,
      passengers: conf, pax: conf.reduce(function (s, x) { return s + Number(x.pax || 1); }, 0),
      waiting: mine.filter(function (x) { return String(x.status) === 'pending_admin' || String(x.status) === 'pending_hod'; }).length };
  });
  return { success: true, data: { date: date, runs: runs } };
}

function routeResort33(action, p) {
  var map = {
    requestResortBoat: function (q) { return withIdempotency('requestResortBoat', q, requestResortBoat); },
    cancelResortBoat: cancelResortBoat, getResortBoat: getResortBoat, hodDecideResortBoat: hodDecideResortBoat,
    confirmResortBoat: confirmResortBoat, getResortBoatManifest: getResortBoatManifest
  };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return v3Err(e); }
}
/** Badges for Home / More: requests this user can decide now. */
function r33Counts(u) {
  var lead = isDeptLead(u) || isAdminPerm(u), conf = isBoatManagerPerm(u);
  if (!lead && !conf) return { hod: 0, admin: 0 };
  var out = { hod: 0, admin: 0 };
  r33Rows().forEach(function (x) {
    if (lead && String(x.status) === 'pending_hod' && r33CanHod(u, x)) out.hod++;
    if (conf && String(x.status) === 'pending_admin' && r33CanConfirm(u, x)) out.admin++;
  });
  return out;
}

isChefPerm = function (u) { if (!u) return false; var p = userPermissions(u); return p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0 || isAdminPerm(u); };
function isBoatCaptainPerm(u) { if (!u) return false; return userPermissions(u).indexOf('boat_captain') >= 0 || isBoatManagerPerm(u); }
function isBoatManagerPerm(u) { if (!u) return false; var p = userPermissions(u); return p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0 || isAdminPerm(u); }
r3NotifyMany = function (rows) { (rows || []).forEach(function (r) { appendRow('Notifications', r); }); };

return { routeV3: routeV3, getV3Home: getV3Home, v3Role: v3Role, isAsstHod: isAsstHod, deptStatusOf: deptStatusOf, deptApproved: deptApproved, v3Notify: v3Notify, deptLeads: deptLeads, canActForDept: canActForDept, v3RoleCounts: v3RoleCounts, v3UserOut: v3UserOut, v3UserWarnings: v3UserWarnings, v3CutoffReminders: v3CutoffReminders, getLeaveCalendar: getLeaveCalendar, isChefPerm: isChefPerm, isBoatManagerPerm: isBoatManagerPerm, routeRelease3: routeRelease3, routeResort33: routeResort33, r33Counts: r33Counts, a31Handle: a31Handle, a31Pre: a31Pre, a31Post: a31Post, routeAdmin31: routeAdmin31, routeReports31: routeReports31, a31SuperBlock: a31SuperBlock, mealTick: mealTick, mealTimes: mealTimes, mealTimesOut: mealTimesOut, mealWindow: mealWindow, mealPhase: mealPhase, userRoles: userRoles, roleButtons: roleButtons, rolesPatch: rolesPatch };
};
