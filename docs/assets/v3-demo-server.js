/* GENERATED from apps-script/V3.gs + Stations.gs + Snapshots.gs by tools/build-demo-server.js — demo mode only. Do not edit. */
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
var buildPrepPayload = S.buildPrepPayload;
var preferredNameMap = S.preferredNameMap;
var decorateOrderNotes = S.decorateOrderNotes;
/**
 * PCR Staff App — 3.0 redesign backend.
 *  - Personal roles stay as in 2.x (permissions: super_admin, admin, hod, assistant_hod, chef, boat_manager, boat_captain, staff).
 *    Shared Chef / Boat STATION logins (Stations.gs) run in parallel; the superadmin switch-over (stations_exclusive) is
 *    prepared but OFF.
 *  - Department join approval (HOD / assistant HOD of that department).
 *  - Two-step leave (department HOD → management = admin/superadmin), cancel, escalate by email.
 *  - Late meal requests (staff) and special meal orders (HOD / chef / admin) → chef/HOD decisions.
 *  - Weekly dinner menu likes/dislikes, chef feedback, department updates (posts, comments, reactions).
 *  - My History, chef dashboard + reports, admin export, superadmin dashboard, leave calendar, cutoff reminders.
 * Everything new is added lazily (new tabs + columns appended at the END of row 1) so existing rows keep working.
 * All actions are GET-safe and check role/ownership on the server.
 */

/** Permissions an admin can assign (same set as 2.x ALL_PERMISSIONS). */
var V3_ASSIGNABLE_PERMS = ['staff', 'hod', 'assistant_hod', 'chef', 'boat_manager', 'boat_captain', 'admin', 'super_admin'];
var V3_ORDER_COLS = ['orderType', 'reason', 'requestedBy', 'guestName', 'guestCompany', 'decidedBy', 'decidedAt', 'cancelReason', 'cancelledAt'];
/** Lazy: Apps Script may load V3.gs before Code.gs, so never read another file's globals at load time. */
function v3OrderHeaders() { return ORDER_HEADERS.concat(V3_ORDER_COLS); }
var V3_USER_COLS = ['deptStatus', 'deptDecidedBy', 'deptDecidedAt', 'assistantHod'];
var V3_LEAVE_HEADERS = ['id', 'userEmail', 'userName', 'department', 'startDate', 'endDate', 'reason', 'status', 'reviewedBy', 'hodNote', 'managerNote', 'notifyNote', 'createdAt',
  'leaveType', 'hodStatus', 'hodBy', 'hodAt', 'mgmtStatus', 'mgmtBy', 'mgmtAt', 'cancelledAt', 'escalatedAt'];
var V3_SHEETS = {
  'Menu Votes': ['id', 'dishKey', 'dish', 'userEmail', 'vote', 'updatedAt'],
  'Chef Feedback': ['id', 'userEmail', 'userName', 'department', 'kind', 'message', 'status', 'chefNote', 'createdAt', 'handledBy', 'handledAt'],
  'Dept Updates': ['id', 'department', 'authorEmail', 'authorName', 'title', 'body', 'active', 'createdAt'],
  'Dept Update Activity': ['id', 'updateId', 'userEmail', 'userName', 'kind', 'text', 'createdAt'],
  'Station Log': ['id', 'at', 'station', 'actor', 'actorDepartment', 'action', 'targetId', 'details'],
  'Meal Snapshots': ['id', 'serviceDate', 'meal', 'kind', 'generatedAt', 'generatedBy', 'totalOrders', 'payloadJson'],
  'Role Backup': ['id', 'at', 'by', 'userEmail', 'role', 'permissions', 'note']
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
    if (!force && cache.get('pcr_v3_schema_303') === '1') return;
  } catch (eC) {}
  var lock = null, got = false;
  try { lock = LockService.getScriptLock(); got = lock.tryLock(10000); } catch (eL) {}
  if (!got) return; // another request is doing it; appendRow() also ensures columns
  try {
    ss = ss || getSS();
    Object.keys(V3_SHEETS).forEach(function (name) { ensureSheet(ss, name, V3_SHEETS[name]); });
    var users = ss.getSheetByName('Users');
    if (users && users.getLastRow() > 0) ensureColumns(users, V3_USER_COLS);
    ['Breakfast Orders', 'Lunch Orders', 'Dinner Orders'].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() > 0) ensureColumns(sh, V3_ORDER_COLS);
    });
    var lv = ss.getSheetByName('Leave Requests');
    if (lv && lv.getLastRow() > 0) ensureColumns(lv, V3_LEAVE_HEADERS);
    var rem = ss.getSheetByName('Reminders');
    if (rem && rem.getLastRow() > 0) ensureColumns(rem, ['updatedAt', 'updatedBy']);
    try { if (cache) cache.put('pcr_v3_schema_303', '1', 21600); } catch (eP) {}
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
  if (!u) return false;
  if (v3Role(u) !== 'staff') return true; // roles are assigned by admin
  if (isAsstHod(u)) return true;
  return deptStatusOf(u) === 'approved';
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
  if (stationsExclusive()) return [];
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
  pu.legacyStation = v3LegacyStation(u);
  pu.warnings = v3UserWarnings(u);
  pu.deptStatus = deptStatusOf(u);
  pu.deptDecidedBy = u.deptDecidedBy || '';
  pu.deptDecidedAt = u.deptDecidedAt || '';
  pu.createdAt = u.createdAt || '';
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
/** Admin / superadmin: permissions (the 2.x set incl. assistant HOD, chef, boat manager / captain), department, active,
 *  department status. Only a superadmin grants or removes admin / superadmin. No seat limits. */
function setUserAccess(p) {
  var r = v3Requester(p);
  if (!isAdminPerm(r)) return { success: false, error: 'Only admin or superadmin can change roles and departments' };
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  var isMain = String(t.email).toLowerCase() === SUPERADMIN_EMAIL;
  var patch = {};
  var oldPerms = userPermissions(t);
  if (p.permissions !== undefined && p.permissions !== '') {
    var raw = Array.isArray(p.permissions) ? p.permissions : String(p.permissions).split(/[,|]+/);
    var perms = [];
    raw.forEach(function (x) {
      x = String(x || '').trim().toLowerCase();
      if (x === 'kitchen') x = 'chef';
      if (x === 'boat') x = 'boat_manager';
      if (V3_ASSIGNABLE_PERMS.indexOf(x) >= 0 && perms.indexOf(x) < 0) perms.push(x);
    });
    if (!perms.length) perms = ['staff'];
    if (perms.indexOf('staff') < 0) perms.unshift('staff');
    if (perms.indexOf('super_admin') >= 0 && perms.indexOf('admin') < 0) perms.push('admin');
    var had = function (k) { return oldPerms.indexOf(k) >= 0; }, has = function (k) { return perms.indexOf(k) >= 0; };
    var touchesTop = had('super_admin') !== has('super_admin') || had('admin') !== has('admin');
    if (touchesTop && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can grant or remove admin / superadmin' };
    if (isSuperPerm(t) && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can change a superadmin account' };
    if (isMain && !has('super_admin')) return { success: false, error: 'The main superadmin account keeps its role' };
    if (stationsExclusive() && perms.some(function (x) { return x === 'chef' || x === 'boat_manager' || x === 'boat_captain'; }))
      return { success: false, error: 'Chef / boat are station logins now (switch-over done) — not personal roles' };
    var newStr = permissionsToString(perms);
    if (newStr !== String(t.permissions || '') || String(t.role || '') !== primaryRoleFromPermissions(perms)) {
      patch.permissions = newStr; patch.role = primaryRoleFromPermissions(perms);
    }
    if (truthy(t.assistantHod) !== has('assistant_hod')) patch.assistantHod = has('assistant_hod'); // keep the 3.0 column in step with the permission
  }
  if (p.department !== undefined && String(p.department) !== String(t.department)) {
    patch.department = v3Clean(p.department, 60);
    patch.deptStatus = 'approved'; patch.deptDecidedBy = r.email; patch.deptDecidedAt = nowIso();
  }
  if (p.deptStatus !== undefined && ['approved', 'pending', 'declined', 'removed'].indexOf(String(p.deptStatus)) >= 0 && String(p.deptStatus) !== deptStatusOf(t)) {
    patch.deptStatus = String(p.deptStatus); patch.deptDecidedBy = r.email; patch.deptDecidedAt = nowIso();
  }
  if (p.active !== undefined && truthy(p.active) !== truthy(t.active)) {
    if (isMain) return { success: false, error: 'Cannot deactivate the main superadmin' };
    if (isSuperPerm(t) && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can change a superadmin account' };
    patch.active = truthy(p.active);
  }
  if (!Object.keys(patch).length) return { success: true, data: { user: v3UserOut(t), unchanged: true, roleCounts: v3RoleCounts() } };
  updateRowById('Users', t.id, patch);
  var after = findUserByEmail(t.email);
  return { success: true, data: { user: v3UserOut(after), roleCounts: v3RoleCounts(), warnings: v3UserWarnings(after) } };
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
  var type = V3_LEAVE_TYPES.indexOf(String(p.leaveType)) >= 0 ? String(p.leaveType) : 'Other';
  var earliest = fijiDateString(addFijiDays(getFijiNow(), type === 'Sick sheet' ? -14 : -1));
  if (s < earliest) return { success: false, error: type === 'Sick sheet' ? 'Sick sheets can be back-dated up to 14 days' : 'Start date is in the past' };
  var reason = v3Clean(p.reason, 500);
  if (!reason) return { success: false, error: 'Please give a reason' };
  var open = sheetToObjects('Leave Requests').filter(function (l) {
    var st = String(l.status);
    return String(l.userEmail).toLowerCase() === String(u.email).toLowerCase() && (st === 'pending' || st === 'pending_hod' || st === 'pending_manager') &&
      !(v3Date(l.endDate) < s || v3Date(l.startDate) > e);
  });
  if (open.length) return { success: false, error: 'You already have a pending request for those dates' };
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
    if (!v3IsLeadOf(r, l.department) && !(isAdminPerm(r) && noLead)) {
      return { success: false, error: 'Waiting for the HOD / assistant HOD of ' + (l.department || 'the department') + ' (HODs only decide their own department)' };
    }
    if (!v3IsLeadOf(r, l.department)) note = (note ? note + ' ' : '') + '(department has no HOD — decided by admin)';
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
  if (!deptApproved(u)) return { success: false, error: 'Late meal requests open after your HOD accepts your department request' };
  var meal = String(p.meal || '').toLowerCase();
  var sheet = V3_MEAL_SHEETS[meal];
  if (!sheet) return { success: false, error: 'Pick breakfast, lunch or dinner' };
  var now = getFijiNow();
  var info = v3MealInfo(meal, now);
  var sd = v3Date(p.serviceDate) || info.serviceDate;
  if (sd !== v3Today() && sd !== v3Tomorrow()) return { success: false, error: 'Late requests are for today or tomorrow only' };
  if (sd === info.serviceDate && info.open) return { success: false, error: 'Ordering is still open — place a normal ' + meal + ' order' };
  var reason = v3Clean(p.reason, 300);
  if (!reason) return { success: false, error: 'Please give a reason' };
  var email = String(u.email).toLowerCase();
  var active = sheetToObjects(sheet).filter(function (o) {
    var st = String(o.status);
    return String(o.userEmail).toLowerCase() === email && v3Date(o.serviceDate) === sd && st !== 'cancelled' && st !== 'rejected' && st !== 'declined';
  });
  if (active.length) return { success: false, error: 'You already have a ' + meal + ' order for ' + sd + ' (' + active[0].status + ')' };
  var note = cleanSpecialNote(p.specialNote || '');
  var row = {
    id: uid(meal.slice(0, 3)), serviceDate: sd, userEmail: email, userName: v3Name(u), department: u.department || '',
    mealChoice: meal === 'dinner' ? (v3Clean(p.mealChoice, 80) || 'Standard') : (meal === 'lunch' ? 'Lunch' : 'Breakfast'),
    notes: '[Late request] ' + reason, specialNote: note, status: 'late_pending', late: true, createdAt: nowIso(),
    orderType: 'late_request', reason: reason, requestedBy: email
  };
  appendRow(sheet, row, v3OrderHeaders());
  var who = chefUsers().concat(adminUsers()).concat(deptLeads(u.department));
  who.forEach(function (x) { if (String(x.email).toLowerCase() !== email) v3Notify(x.email, 'Late ' + meal + ' request: ' + row.userName, sd + ' — ' + reason, 'late_meal', row.id); });
  return { success: true, data: { order: v3MealOut(row, meal) } };
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
  var row = { id: uid('cf'), userEmail: String(u.email).toLowerCase(), userName: v3Name(u), department: u.department || '', kind: kind, message: msg, status: 'new', chefNote: '', createdAt: nowIso(), handledBy: '', handledAt: '' };
  v3Append('Chef Feedback', row, V3_SHEETS['Chef Feedback']);
  chefUsers().forEach(function (c) { v3Notify(c.email, 'Food feedback (' + kind + ')', msg.slice(0, 120), 'chef_feedback', row.id); });
  return { success: true, data: { feedback: row } };
}
function getChefFeedback(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u))) return { success: false, error: 'Chef station (or superadmin) only' };
  var rows = sheetToObjects('Chef Feedback');
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  rows.forEach(function (r) { delete r._row; });
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
  if (!isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
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
      joins: users.filter(function (x) { return deptStatusOf(x) === 'pending' && (truthy(x.active) || truthy(x.verified)); }).length,
      feedback: chef.feedbackNew
    },
    boat: boat.slice(0, 8),
    users: { total: users.length, active: users.filter(function (x) { return truthy(x.active); }).length,
      newThisWeek: users.filter(function (x) { return v3Date(x.createdAt) >= weekAgo; }).length, byRole: roleCounts },
    health: { version: APP_VERSION, fijiNow: nowIso(), sheetId: SHEET_ID, verificationDelivery: 'email', mailProvider: getSetting('mail_provider', 'mailapp') || 'mailapp', mailFrom: getSetting('mail_from', '') || 'script account', stationsExclusive: stationsExclusive() },
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
      joins: sheetToObjects('Users').filter(function (x) { return deptStatusOf(x) === 'pending' && scope(x.department) && (truthy(x.active) || truthy(x.verified)); }).length
    };
  }
  if (isChefPerm(u)) out.chef = v3ChefDash();
  if (isSuperPerm(u)) out.superDash = v3SuperDash();
  // 3.0 stations run in parallel with personal chef / boat roles until the switch-over (stations_exclusive)
  out.stationsReady = { chef: stationConfigured('chef'), boat: stationConfigured('boat') };
  out.stationsExclusive = stationsExclusive();
  out.cutoffReminders = v3CutoffReminders(u, myMeals);
  return out;
}

/* ========== CUTOFF REMINDER (item 39) ==========
 * One hour before each cutoff (breakfast / lunch 1pm, dinner 8pm Fiji) the Home block carries a reminder for users who
 * have not ordered that meal yet. The app shows it as a banner + highlights the countdown. Nothing is emailed and nothing
 * is written to the Sheet (no per-user notification rows), so no trigger is needed. */
function v3CutoffReminders(u, myMeals) {
  var now = getFijiNow();
  var h = now.getUTCHours();
  var out = [];
  var checks = [];
  if (h === 12) checks = ['breakfast', 'lunch'];
  else if (h === 19) checks = ['dinner'];
  checks.forEach(function (meal) {
    var info = v3MealInfo(meal, now);
    if (!info || !info.open) return;
    var has = (myMeals || []).some(function (o) { return o.meal === meal && o.serviceDate === info.serviceDate && ['cancelled', 'rejected', 'declined'].indexOf(String(o.status)) < 0; });
    if (!has) out.push({ meal: meal, serviceDate: info.serviceDate, closesAt: meal === 'dinner' ? '8:00 PM' : '1:00 PM',
      minutesLeft: 60 - now.getUTCMinutes() });
  });
  return out;
}

/**
 * PCR Staff App 3.0 — shared STATION logins ("Chef" and "Boat").
 *
 * - Each station has a username + password managed by superadmin (Manage → Station logins). The password is stored
 *   salted + hashed (HMAC-SHA256 stretched) in Script Properties, never in the Sheet and never in plain text.
 * - Signing in with station credentials gives a long-lived station token (no expiry). Setting / rotating the password
 *   or "Sign out all devices" bumps the station generation → every existing station session stops working.
 * - A station token may ONLY call that station's actions (STATION_ACTIONS). Mutating actions need the name of the
 *   person doing it (actorName, picked on the device) and are written to the "Station Log" sheet.
 * - A superadmin can open both pages with their own account (actions recorded under their email, no name picker).
 * - The old setup runs IN PARALLEL: personal chef / kitchen / boat roles keep their tools. The prepared switch-over
 *   (stationsSwitchOver, superadmin, preview first) removes those personal roles and turns on stations_exclusive.
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
    markChefFeedback: 1,
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
  markChefFeedback: 1, saveOrderSnapshot: 1,
  saveBoatRun: 1, deleteBoatRun: 1, dedupeBoatRuns: 1, reviewEmergencyTravel: 1, cancelBoatBooking: 1
};
/* station tools: after the switch-over (stations_exclusive) a personal account needs superadmin for these */
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
  if (p.userEmail && action !== 'cancelBoatBooking') delete p.userEmail; // stations never act "as" a staff member
  return '';
}
/** Gate for a personal account calling a station-only tool. '' = allowed. */
function stationPersonalGate(action, u) {
  var key = STATION_ONLY_PERSONAL[action];
  if (!key) return '';
  if (isSuperPerm(u)) return '';
  if (!stationsExclusive()) return ''; // old setup in parallel: personal chef / boat / admin permissions still decide (in each action)
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
  var map = { getStations: getStations, setStationPassword: setStationPassword, signOutStation: signOutStation, getStationPeople: getStationPeople, getStationHome: getStationHome,
    stationsSwitchOver: stationsSwitchOver, stationsSwitchBack: stationsSwitchBack };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
function stationRequireSuper(p) {
  var r = getRequester(p);
  if (!r || p._stationUser || !isSuperPerm(r)) return { success: false, error: 'Superadmin only' };
  return null;
}
function getStations(p) {
  var bad = stationRequireSuper(p); if (bad) return bad;
  return { success: true, data: { stations: stationStatus(), exclusive: stationsExclusive() } };
}
/** Superadmin only. generate=1 → a new random password is returned ONCE; else p.password is used. */
function setStationPassword(p) {
  var bad = stationRequireSuper(p); if (bad) return bad;
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
  var bad = stationRequireSuper(p); if (bad) return bad;
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

/* ---------- switch-over (PREPARED, NOT RUN) ----------
 * After testing is approved a superadmin runs this once: every personal chef / kitchen / boat_manager / boat_captain / boat
 * permission is removed (HOD, assistant HOD, admin and superadmin rights are kept; nobody is deactivated), the old
 * permissions are copied to the "Role Backup" tab first, and App Setting stations_exclusive = true hides the chef / boat
 * tools from personal accounts (server-enforced by stationPersonalGate / isChefPerm / isBoatManagerPerm).
 * dryRun (default) only previews. apply=1 needs both station logins set up. stationsSwitchBack undoes it from the backup. */
var SWITCH_DROP = { chef: 1, kitchen: 1, boat_manager: 1, boat_captain: 1, boat: 1 };
function switchTarget(u) {
  var raw = String(u.permissions || u.role || '').toLowerCase();
  var before = raw.split(/[,|\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (!before.length) before = [String(u.role || 'staff')];
  var dropped = before.filter(function (x) { return SWITCH_DROP[x]; });
  var after = before.filter(function (x) { return !SWITCH_DROP[x]; });
  if (after.indexOf('staff') < 0) after.unshift('staff');
  return { before: before.join(','), after: after.join(','), role: primaryRoleFromPermissions(after), dropped: dropped };
}
function stationsSwitchOver(p) {
  var bad = stationRequireSuper(p); if (bad) return bad;
  var apply = truthy(p.apply) || p.dryRun === 'false' || p.dryRun === false;
  var users = sheetToObjects('Users');
  var changes = [];
  users.forEach(function (u) {
    var t = switchTarget(u);
    if (!t.dropped.length) return;
    changes.push({ email: String(u.email || '').toLowerCase(), name: v3Name(u), department: u.department || '', active: truthy(u.active),
      from: t.before, to: t.after, newRole: t.role, dropped: t.dropped, keeps: t.after.split(',').filter(function (x) { return x !== 'staff'; }) });
  });
  var st = stationStatus();
  var missing = Object.keys(st).filter(function (k) { return !st[k].configured; });
  var out = { applied: false, exclusive: stationsExclusive(), changes: changes, changeCount: changes.length, stations: st, stationsMissing: missing,
    summary: 'Removes personal chef / kitchen / boat roles from ' + changes.length + ' account(s) (HOD / assistant HOD / admin / superadmin kept), backs them up to "Role Backup", then chef / boat tools are station-only (superadmin can still open both pages).' };
  if (!apply) return { success: true, data: out };
  if (stationsExclusive()) return { success: false, error: 'Switch-over already done' };
  if (missing.length) return { success: false, error: 'Set up the ' + missing.map(function (k) { return STATION_DEFS[k].label; }).join(' and ') + ' station login first' };
  var r = getRequester(p);
  var at = nowIso();
  users.forEach(function (u) {
    var t = switchTarget(u);
    if (!t.dropped.length) return;
    v3Append('Role Backup', { id: uid('rb'), at: at, by: r.email, userEmail: String(u.email).toLowerCase(), role: u.role || '', permissions: u.permissions || '', note: 'switch-over' });
    updateRowById('Users', u.id, { permissions: t.after, role: t.role });
  });
  setSetting('stations_exclusive', 'true', r.email);
  out.applied = true; out.exclusive = true;
  return { success: true, data: out };
}
function stationsSwitchBack(p) {
  var bad = stationRequireSuper(p); if (bad) return bad;
  var r = getRequester(p);
  var rows = sheetToObjects('Role Backup').filter(function (x) { return String(x.note) === 'switch-over'; });
  var latest = {};
  rows.forEach(function (x) { latest[String(x.userEmail).toLowerCase()] = x; });
  var n = 0;
  Object.keys(latest).forEach(function (em) {
    var u = findUserByEmail(em); if (!u) return;
    updateRowById('Users', u.id, { permissions: latest[em].permissions, role: latest[em].role }); n++;
  });
  setSetting('stations_exclusive', 'false', r.email);
  return { success: true, data: { restored: n, exclusive: false } };
}

/**
 * PCR Staff App 3.0 — meal summaries ("Meal Snapshots" tab).
 *
 * - At each cutoff a snapshot of ALL orders for tomorrow's service is saved automatically: breakfast + lunch at 1:00 PM
 *   Fiji, dinner at 8:00 PM Fiji. A time-driven trigger calls mealSnapshotTick() ~1:05 PM and ~8:05 PM Fiji
 *   (installMealSnapshotTriggers), and as a fallback the first kitchen read / summary open after a cutoff creates it
 *   (idempotent — one "auto" snapshot per meal + service date).
 * - The payload is the same data the printable dinner order list uses (prep tally + byItem + every order row with notes),
 *   so the saved summary prints exactly like the live list, including "Allergies & special requests".
 * - Any date can be generated later: the saved snapshot if there is one, else built from the order rows (still there
 *   for ~60 days; archiveOldRows never touches this tab). Orders added after a snapshot show as an addendum.
 * - The Meal summaries page offers the last 5 days + today + tomorrow; archiveOldRows never touches this tab.
 * Also bundled into the demo (tools/build-demo-server.js).
 */
var SNAP_SHEET = 'Meal Snapshots';
var SNAP_HEADERS = ['id', 'serviceDate', 'meal', 'kind', 'generatedAt', 'generatedBy', 'totalOrders', 'payloadJson'];
var SNAP_MEAL_SHEETS = { dinner: 'Dinner Orders', breakfast: 'Breakfast Orders', lunch: 'Lunch Orders' };
var SNAP_CUTOFF_HOUR = 20; // dinner
var SNAP_CUTOFF = { dinner: 20, breakfast: 13, lunch: 13 };
var SNAP_DAYS_BACK = 5;

function snapDate(v) { var s = String(v == null ? '' : v); var m = s.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function snapRows() { try { return sheetToObjects(SNAP_SHEET); } catch (e) { return []; } }
/** Every order row of that meal + date (incl. late / cancelled — the print filters), with notes and display names. */
function snapOrders(meal, serviceDate) {
  var rows = sheetToObjects(SNAP_MEAL_SHEETS[meal]).filter(function (o) { return snapDate(o.serviceDate) === serviceDate; });
  var nameMap = preferredNameMap();
  decorateOrderNotes(rows, nameMap);
  return rows.map(function (o) {
    return { id: o.id, serviceDate: serviceDate, userEmail: o.userEmail, userName: o.userName, displayName: o.displayName, department: o.department || '',
      mealChoice: o.mealChoice || '', status: String(o.status || ''), late: truthy(o.late), createdAt: o.createdAt || '', timeOrdered: o.timeOrdered || o.createdAt || '',
      specialNote: o.specialNote || '', notes: o.notes || '', noteFlag: o.noteFlag || '', orderType: o.orderType || '' };
  });
}
function snapBuild(meal, serviceDate) {
  var orders = snapOrders(meal, serviceDate);
  if (meal === 'dinner') {
    var prep = buildPrepPayload(serviceDate);
    delete prep.orders;
    return { meal: 'dinner', serviceDate: serviceDate, prep: prep, orders: orders, total: prep.totalOrders };
  }
  var counted = orders.filter(function (o) { return countedMealStatus(o.status) && o.status !== 'late_pending'; }).length;
  return { meal: meal, serviceDate: serviceDate, orders: orders, totalCounted: counted, total: counted };
}
function snapFind(meal, serviceDate, kind) {
  return snapRows().filter(function (s) {
    return snapDate(s.serviceDate) === serviceDate && String(s.meal || 'dinner') === meal && (!kind || String(s.kind) === kind);
  });
}
function snapSave(meal, serviceDate, kind, by) {
  var payload = snapBuild(meal, serviceDate);
  var row = { id: uid('snap'), serviceDate: serviceDate, meal: meal, kind: kind, generatedAt: nowIso(), generatedBy: String(by || kind), totalOrders: payload.total || 0, payloadJson: JSON.stringify(payload) };
  try { ensureSheet(getSS(), SNAP_SHEET, SNAP_HEADERS); } catch (e) {}
  appendRow(SNAP_SHEET, row, SNAP_HEADERS);
  return row;
}
function snapLastClosedDinner(now) { return snapLastClosed('dinner', now); }
/** The service date whose books closed most recently for that meal (after the cutoff → tomorrow, else today). */
function snapLastClosed(meal, now) {
  now = now || getFijiNow();
  return now.getUTCHours() >= SNAP_CUTOFF[meal] ? fijiDateString(addFijiDays(now, 1)) : fijiDateString(now);
}
/** Idempotent: one automatic snapshot per meal + closed service date. Returns the row (existing or new). */
function snapEnsureAuto(serviceDate, by, meal) {
  meal = meal || 'dinner';
  var have = snapFind(meal, serviceDate, 'auto');
  if (have.length) return { row: have[0], created: false };
  var lock = null;
  try { lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) lock = null; } catch (e) { lock = null; }
  try {
    have = snapFind(meal, serviceDate, 'auto'); // re-check inside the lock
    if (have.length) return { row: have[0], created: false };
    return { row: snapSave(meal, serviceDate, 'auto', by || ('auto (' + (meal === 'dinner' ? '8:05pm' : '1:05pm') + ')')), created: true };
  } finally { try { if (lock) lock.releaseLock(); } catch (e2) {} }
}
function dinnerSnapshotTick() { return mealSnapshotTick(); }
/** Time-driven trigger (~1:05 PM and ~8:05 PM Fiji). Saves every meal whose cutoff has passed. Safe to run any number of times. */
function mealSnapshotTick() {
  var now = getFijiNow();
  var out = {};
  ['breakfast', 'lunch', 'dinner'].forEach(function (meal) {
    if (now.getUTCHours() < SNAP_CUTOFF[meal]) { out[meal] = 'before cutoff'; return; }
    var d = snapLastClosed(meal, now);
    var r = snapEnsureAuto(d, 'auto (' + (meal === 'dinner' ? '8:05pm' : '1:05pm') + ' trigger)', meal);
    out[meal] = { serviceDate: d, created: r.created, id: r.row.id };
  });
  return out;
}
function installDinnerSnapshotTrigger() { return installMealSnapshotTriggers(); }
/** Run once from the Apps Script editor (needs the script.scriptapp scope): daily triggers ~1:05 PM and ~8:05 PM Fiji. */
function installMealSnapshotTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'dinnerSnapshotTick' || h === 'mealSnapshotTick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('mealSnapshotTick').timeBased().everyDays(1).atHour(13).nearMinute(5).inTimezone('Pacific/Fiji').create();
  ScriptApp.newTrigger('mealSnapshotTick').timeBased().everyDays(1).atHour(20).nearMinute(5).inTimezone('Pacific/Fiji').create();
  return 'mealSnapshotTick triggers installed (daily ~1:05 PM and ~8:05 PM Fiji)';
}
/** Fallback used on kitchen reads: after each cutoff, make sure that meal's auto snapshot exists. Never throws. */
function snapFallback() {
  var created = false;
  try {
    var now = getFijiNow();
    ['breakfast', 'lunch', 'dinner'].forEach(function (meal) {
      var d = snapLastClosed(meal, now);
      if (snapFind(meal, d, 'auto').length) return;
      // the most recent closed service: only back-fill when orders exist for it
      if (!sheetToObjects(SNAP_MEAL_SHEETS[meal]).some(function (o) { return snapDate(o.serviceDate) === d; })) return;
      var r = snapEnsureAuto(d, 'auto (on open)', meal);
      if (r && r.created) created = true;
    });
  } catch (e) {}
  return { created: created };
}

function snapCaller(p) {
  var u = getRequester(p);
  if (!u) return null;
  return (isChefPerm(u) || isAdminPerm(u)) ? u : null;
}
function snapOut(s, withPayload) {
  var o = { id: s.id, serviceDate: snapDate(s.serviceDate), meal: String(s.meal || 'dinner'), kind: String(s.kind || ''), generatedAt: s.generatedAt || '', generatedBy: s.generatedBy || '', totalOrders: Number(s.totalOrders || 0) };
  if (withPayload) { try { o.payload = JSON.parse(s.payloadJson || '{}'); } catch (e) { o.payload = null; } }
  return o;
}
/** Orders that exist now but were not in the snapshot (e.g. late orders approved after the cutoff) + orders cancelled since. */
function snapAddendum(payload, meal, serviceDate) {
  var had = {}; ((payload && payload.orders) || []).forEach(function (o) { had[String(o.id)] = String(o.status || ''); });
  var now = snapOrders(meal, serviceDate);
  var added = now.filter(function (o) { return had[String(o.id)] === undefined && o.status !== 'cancelled' && o.status !== 'rejected'; });
  var changed = now.filter(function (o) { var was = had[String(o.id)]; return was !== undefined && was !== o.status && (o.status === 'cancelled' || o.status === 'rejected' || o.status === 'late_approved' || was === 'late_pending'); })
    .map(function (o) { return Object.assign({ was: had[String(o.id)] }, o); });
  return { added: added, changed: changed };
}
/** List (latest first) + the pickable days. Opening it also creates any missing auto snapshot for a closed meal. */
function getOrderSnapshots(p) {
  var u = snapCaller(p); if (!u) return { success: false, error: 'Chef station, admin or superadmin only' };
  var fb = snapFallback();
  var meal = String(p.meal || '');
  var list = snapRows().filter(function (s) { return !meal || String(s.meal || 'dinner') === meal; }).map(function (s) { return snapOut(s, false); })
    .sort(function (a, b) { return (b.serviceDate + b.generatedAt).localeCompare(a.serviceDate + a.generatedAt); });
  var lim = Math.min(Number(p.limit || 60), 200);
  // the pickable days: last 5 days + today + tomorrow (service dates), with what exists for each meal
  var now = getFijiNow(), days = [];
  for (var i = -SNAP_DAYS_BACK; i <= 1; i++) {
    var dd = fijiDateString(addFijiDays(now, i));
    var saved = {};
    ['breakfast', 'lunch', 'dinner'].forEach(function (m) { saved[m] = snapFind(m, dd, '').length > 0; });
    days.push({ date: dd, offset: i, saved: saved });
  }
  return { success: true, data: { snapshots: list.slice(0, lim), total: list.length, lastClosedDinner: snapLastClosedDinner(), lastClosed: {
    breakfast: snapLastClosed('breakfast'), lunch: snapLastClosed('lunch'), dinner: snapLastClosed('dinner') }, days: days,
    autoCreated: !!(fb && fb.created), fijiNow: nowIso() } };
}
/**
 * One summary: by id, or by serviceDate (+ meal). Uses the original auto snapshot (else the newest saved one) and adds an
 * addendum of changes since; with no snapshot it is built from the order rows ("live rows", not saved unless save=1).
 */
function getOrderSnapshot(p) {
  var u = snapCaller(p); if (!u) return { success: false, error: 'Chef station, admin or superadmin only' };
  var meal = SNAP_MEAL_SHEETS[String(p.meal || 'dinner')] ? String(p.meal || 'dinner') : 'dinner';
  var s = null;
  if (p.id) { s = snapRows().filter(function (x) { return String(x.id) === String(p.id); })[0] || null; if (!s) return { success: false, error: 'Summary not found' }; meal = String(s.meal || 'dinner'); }
  var date = s ? snapDate(s.serviceDate) : snapDate(p.serviceDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Pick a date' };
  if (!s) {
    var saved = snapFind(meal, date, '');
    var auto = saved.filter(function (x) { return String(x.kind) === 'auto'; });
    s = auto[0] || saved.sort(function (a, b) { return String(b.generatedAt).localeCompare(String(a.generatedAt)); })[0] || null;
  }
  if (s) {
    var out = snapOut(s, true);
    out.source = 'snapshot';
    out.addendum = snapAddendum(out.payload, meal, date);
    return { success: true, data: out };
  }
  var payload = snapBuild(meal, date);
  return { success: true, data: { id: '', serviceDate: date, meal: meal, kind: 'live', generatedAt: nowIso(), generatedBy: 'built from order rows', totalOrders: payload.total || 0, payload: payload, source: 'rows', addendum: { added: [], changed: [] } } };
}
/** Save a new summary now (keeps the original auto snapshot). Station writes carry the picked name. */
function saveOrderSnapshot(p) {
  var u = snapCaller(p); if (!u) return { success: false, error: 'Chef station, admin or superadmin only' };
  var meal = SNAP_MEAL_SHEETS[String(p.meal || 'dinner')] ? String(p.meal || 'dinner') : 'dinner';
  var date = snapDate(p.serviceDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Pick a date' };
  var row = snapSave(meal, date, 'manual', requesterTag(u) || 'manual');
  return { success: true, data: snapOut(row, true) };
}
function routeSnapshots(action, p) {
  var map = { getOrderSnapshots: getOrderSnapshots, getOrderSnapshot: getOrderSnapshot, saveOrderSnapshot: saveOrderSnapshot };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}

isChefPerm = function (u) { if (!u) return false; if (u.station) return u.station === 'chef'; if (isSuperPerm(u)) return true; if (stationsExclusive()) return false; var p = userPermissions(u); return p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0 || isAdminPerm(u); };
function isBoatManagerPerm(u) { if (!u) return false; if (u.station) return u.station === 'boat'; if (isSuperPerm(u)) return true; if (stationsExclusive()) return false; var p = userPermissions(u); return p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0 || isAdminPerm(u); }

return { routeV3: routeV3, getV3Home: getV3Home, v3Role: v3Role, isAsstHod: isAsstHod, deptStatusOf: deptStatusOf, deptApproved: deptApproved, v3Notify: v3Notify, deptLeads: deptLeads, canActForDept: canActForDept, v3RoleCounts: v3RoleCounts, v3UserOut: v3UserOut, v3UserWarnings: v3UserWarnings, v3CutoffReminders: v3CutoffReminders, getLeaveCalendar: getLeaveCalendar, routeStations: routeStations, stationLogin: stationLogin, stationVerifyToken: stationVerifyToken, isStationToken: isStationToken, stationBindRequest: stationBindRequest, stationPersonalGate: stationPersonalGate, stationSetPassword: stationSetPassword, stationStatus: stationStatus, stationUser: stationUser, stationPublicUser: stationPublicUser, stationConfigured: stationConfigured, stationLogWrite: stationLogWrite, requesterTag: requesterTag, STATION_MUTATIONS: STATION_MUTATIONS, STATION_ACTIONS: STATION_ACTIONS, STATION_DEFS: STATION_DEFS, isChefPerm: isChefPerm, isBoatManagerPerm: isBoatManagerPerm, routeSnapshots: routeSnapshots, dinnerSnapshotTick: dinnerSnapshotTick, mealSnapshotTick: mealSnapshotTick, snapFallback: snapFallback, snapLastClosed: snapLastClosed, stationsSwitchOver: stationsSwitchOver, stationsSwitchBack: stationsSwitchBack };
};
