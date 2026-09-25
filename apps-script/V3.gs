/**
 * PCR Staff App — 3.0 redesign backend.
 *  - Six roles (super_admin, admin, chef, boat_manager, hod, staff) + assistant-HOD flag tied to a department.
 *  - Department join approval (HOD / assistant HOD of that department).
 *  - Two-step leave (department HOD → management = admin/superadmin), cancel, escalate by email.
 *  - Late meal requests (staff) and special meal orders (HOD / chef / admin) → chef/HOD decisions.
 *  - Weekly dinner menu likes/dislikes, chef feedback, department updates (posts, comments, reactions).
 *  - My History, chef dashboard + reports, admin export, superadmin dashboard, role migration.
 * Everything new is added lazily (new tabs + columns appended at the END of row 1) so existing rows keep working.
 * All actions are GET-safe and check role/ownership on the server.
 */

var V3_ROLES = ['super_admin', 'admin', 'hod', 'chef', 'boat_manager', 'staff'];
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
  'Dept Update Activity': ['id', 'updateId', 'userEmail', 'userName', 'kind', 'text', 'createdAt']
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
    if (!force && cache.get('pcr_v3_schema_300') === '1') return;
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
    try { if (cache) cache.put('pcr_v3_schema_300', '1', 21600); } catch (eP) {}
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
function v3PermsForRole(role) {
  if (role === 'super_admin') return 'super_admin,admin';
  if (V3_ROLES.indexOf(role) < 0) return 'staff';
  return role;
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
  if (normDept(u.department) !== normDept(dept) || !normDept(dept)) return false;
  return v3Role(u) === 'hod' || isAsstHod(u);
}
function isDeptLead(u) { return !!u && (v3Role(u) === 'hod' || isAsstHod(u)); }
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
  try { MailApp.sendEmail({ to: list.join(','), subject: subject, body: body + '\n\n— PCR Staff App' }); return list.length; } catch (e) { return 0; }
}
/** Active department leads (HOD + assistant HOD) of a department. */
function deptLeads(dept) {
  return sheetToObjects('Users').filter(function (u) {
    return truthy(u.active) && normDept(u.department) === normDept(dept) && normDept(dept) && (v3Role(u) === 'hod' || isAsstHod(u));
  });
}
function adminUsers() {
  return sheetToObjects('Users').filter(function (u) { return truthy(u.active) && isAdminPerm(u); });
}
function chefUsers() {
  return sheetToObjects('Users').filter(function (u) { return truthy(u.active) && v3Role(u) === 'chef'; });
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
    migrateRoles: migrateRoles,
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
/** Admin / superadmin: role, department, assistant-HOD flag, active, department status. */
function setUserAccess(p) {
  var r = v3Requester(p);
  if (!isAdminPerm(r)) return { success: false, error: 'Only admin or superadmin can change roles and departments' };
  var t = findUserByEmail(p.targetEmail);
  if (!t) return { success: false, error: 'User not found' };
  var patch = {};
  var oldRole = v3Role(t);
  if (p.role !== undefined && p.role !== '') {
    var role = String(p.role);
    if (V3_ROLES.indexOf(role) < 0) return { success: false, error: 'Unknown role: ' + role };
    var touchesTop = role === 'super_admin' || oldRole === 'super_admin' || ((role === 'admin' || oldRole === 'admin') && role !== oldRole);
    if (touchesTop && !isSuperPerm(r)) return { success: false, error: 'Only superadmin can grant or remove admin / superadmin' };
    if (String(t.email).toLowerCase() === SUPERADMIN_EMAIL && role !== 'super_admin') return { success: false, error: 'The main superadmin account keeps its role' };
    patch.role = role;
    patch.permissions = v3PermsForRole(role);
  }
  if (p.department !== undefined && String(p.department) !== String(t.department)) {
    patch.department = v3Clean(p.department, 60);
    patch.deptStatus = 'approved'; patch.deptDecidedBy = r.email; patch.deptDecidedAt = nowIso();
  }
  if (p.assistantHod !== undefined) patch.assistantHod = truthy(p.assistantHod) || p.assistantHod === 'on';
  if (p.deptStatus !== undefined && ['approved', 'pending', 'declined', 'removed'].indexOf(String(p.deptStatus)) >= 0) {
    patch.deptStatus = String(p.deptStatus); patch.deptDecidedBy = r.email; patch.deptDecidedAt = nowIso();
  }
  if (p.active !== undefined) {
    if (String(t.email).toLowerCase() === SUPERADMIN_EMAIL) return { success: false, error: 'Cannot deactivate the main superadmin' };
    patch.active = truthy(p.active);
  }
  if (!Object.keys(patch).length) return { success: false, error: 'Nothing to change' };
  updateRowById('Users', t.id, patch);
  return { success: true, data: { user: v3UserOut(findUserByEmail(t.email)) } };
}
/** 3.0 role migration. dryRun (default) only reports; apply=1 writes. Admin/superadmin only. */
function v3MigrateTarget(u) {
  var raw = String(u.permissions || u.role || '').toLowerCase();
  var perms = userPermissions(u);
  var role = v3Role(u);
  var asst = isAsstHod(u) && role === 'staff';
  return { role: role, assistantHod: asst || truthy(u.assistantHod), from: raw || 'staff' };
}
function migrateRoles(p) {
  var r = v3Requester(p);
  if (!isAdminPerm(r)) return { success: false, error: 'Admin or superadmin required' };
  var apply = truthy(p.apply) || p.dryRun === 'false' || p.dryRun === false;
  var users = sheetToObjects('Users');
  var counts = {}, changes = [], byTarget = {};
  users.forEach(function (u) {
    var t = v3MigrateTarget(u);
    var key = t.from + ' → ' + t.role + (t.assistantHod ? ' + assistant HOD flag' : '');
    counts[key] = (counts[key] || 0) + 1;
    byTarget[t.role] = (byTarget[t.role] || 0) + 1;
    var newPerms = v3PermsForRole(t.role);
    var needs = String(u.role || '') !== t.role || String(u.permissions || '') !== newPerms || (t.assistantHod && !truthy(u.assistantHod));
    if (needs) changes.push({ email: u.email, from: t.from, to: t.role, assistantHod: t.assistantHod });
    if (apply && needs) updateRowById('Users', u.id, { role: t.role, permissions: newPerms, assistantHod: t.assistantHod });
  });
  var asstCount = users.filter(function (u) { return v3MigrateTarget(u).assistantHod; }).length;
  return { success: true, data: { applied: apply, totalUsers: users.length, mapping: counts, byRole: byTarget, assistantHodFlags: asstCount,
    changes: apply ? changes.length : changes.slice(0, 200), changeCount: changes.length } };
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
  var lead = v3Role(u) === 'hod' || isAdminPerm(u);
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
    if (!canActForDept(r, l.department)) return { success: false, error: 'Only the HOD / assistant HOD of ' + l.department + ' (or admin) can review this' };
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
  if (isChefPerm(r) || isAdminPerm(r)) return true;
  if (t === 'special') return false;
  return canActForDept(r, o.department); // late requests: HOD / assistant HOD of that department
}
function getMealRequests(p) {
  var r = v3Requester(p);
  var chef = isChefPerm(r) || isAdminPerm(r);
  if (!chef && !isDeptLead(r)) return { success: false, error: 'Chef / HOD / admin only' };
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
  var patch = { status: approve ? (st === 'special_pending' ? 'approved' : 'late_approved') : 'rejected', decidedBy: String(r.email).toLowerCase(), decidedAt: nowIso() };
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
  if (!(isChefPerm(r) || isAdminPerm(r))) return { success: false, error: 'Chef / admin only' };
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
  if (!(isChefPerm(u) || isAdminPerm(u))) return { success: false, error: 'Chef / admin only' };
  var rows = sheetToObjects('Chef Feedback');
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  rows.forEach(function (r) { delete r._row; });
  return { success: true, data: { feedback: rows.slice(0, 300), newCount: rows.filter(function (r) { return String(r.status) === 'new'; }).length } };
}
function markChefFeedback(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u) || isAdminPerm(u))) return { success: false, error: 'Chef / admin only' };
  var st = ['new', 'seen', 'done'].indexOf(String(p.status)) >= 0 ? String(p.status) : 'seen';
  var r = updateRowById('Chef Feedback', p.id, { status: st, chefNote: v3Clean(p.chefNote, 300), handledBy: u.email, handledAt: nowIso() });
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
  if (!(isChefPerm(u) || isAdminPerm(u))) return { success: false, error: 'Chef / admin only' };
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
  if (!(isChefPerm(u) || isAdminPerm(u))) return { success: false, error: 'Chef / admin only' };
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
    health: { version: APP_VERSION, fijiNow: nowIso(), sheetId: SHEET_ID, verificationDelivery: getSetting('verification_delivery', 'screen') },
    weekly: chef.weekly
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
    verificationDelivery: getSetting('verification_delivery', 'screen') };
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
  if (isChefPerm(u) || isAdminPerm(u)) out.chef = v3ChefDash();
  if (isSuperPerm(u)) out.superDash = v3SuperDash();
  return out;
}
