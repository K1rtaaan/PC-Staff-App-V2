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
