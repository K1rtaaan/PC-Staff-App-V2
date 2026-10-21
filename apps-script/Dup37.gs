/* 3.7.0 (Pranav): duplicate accounts — list likely duplicates and merge (keep one, move orders/bookings/leave, deactivate the other, log). Admin / superadmin. */
var R37_MOVE_SHEETS = ['Dinner Orders', 'Lunch Orders', 'Breakfast Orders', 'Boat Bookings', 'Leave Requests', 'Emergency Travel', 'Notifications'];
function r37DupAdmin_(p) { var r = getRequester(p); if (!r || !(isSuperPerm(r) || isAdminPerm(r))) throw new Error('Admin / superadmin only'); return r; }
function r37Norm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function r37UserBrief_(u) { return { id: u.id, email: String(u.email || '').trim(), name: ((u.firstName || '') + ' ' + (u.lastName || '')).trim(), department: u.department || '', active: truthy(u.active), createdAt: u.createdAt || '', role: u.role || '', permissions: u.permissions || '' }; }
function findDuplicateAccounts(p) {
  try { r37DupAdmin_(p); } catch (e) { return { success: false, error: e.message }; }
  var users = sheetToObjects('Users').filter(function (u) { return !/^merged\./.test(String(u.email || '')); });
  var byEmail = {}, byName = {}, groups = [];
  users.forEach(function (u) {
    var e = r37Norm_(u.email); if (e) (byEmail[e] = byEmail[e] || []).push(u);
    var n = r37Norm_(u.firstName) + '|' + r37Norm_(u.lastName) + '|' + r37Norm_(u.department);
    if (r37Norm_(u.firstName) && r37Norm_(u.lastName)) (byName[n] = byName[n] || []).push(u);
  });
  Object.keys(byEmail).forEach(function (k) { if (byEmail[k].length > 1) groups.push({ kind: 'same_email', key: k, users: byEmail[k].map(r37UserBrief_) }); });
  Object.keys(byName).forEach(function (k) {
    var g = byName[k]; if (g.length < 2) return;
    var emails = {}; g.forEach(function (u) { emails[r37Norm_(u.email)] = 1; }); if (Object.keys(emails).length < 2) return; // already listed as same email
    groups.push({ kind: 'same_name_dept', key: k, users: g.map(r37UserBrief_) });
  });
  return { success: true, data: { groups: groups } };
}
/** keepId stays; dropId is deactivated (email renamed merged.<id>.<email>) and its rows move to the kept email. */
function mergeAccounts(p, sys) {
  var r; if (sys) r = { email: 'system', firstName: 'System', lastName: '(3.7.0 one-off)', department: '' }; else { try { r = r37DupAdmin_(p); } catch (e) { return { success: false, error: e.message }; } }
  var keep = null, drop = null;
  sheetToObjects('Users').forEach(function (u) { if (String(u.id) === String(p.keepId)) keep = u; if (String(u.id) === String(p.dropId)) drop = u; });
  if (!keep || !drop || keep.id === drop.id) return { success: false, error: 'Pick two different accounts' };
  if (isSuperPerm(drop)) return { success: false, error: 'The superadmin account cannot be merged away' };
  try { ensureColumns(getSS().getSheetByName('Users'), ['mergedInto', 'mergedAt', 'mergedBy']); } catch (e) {}
  var ke = String(keep.email).trim().toLowerCase(), de = String(drop.email).trim().toLowerCase(), moved = {};
  if (ke !== de) {
    R37_MOVE_SHEETS.forEach(function (sh) {
      var n = 0;
      try { sheetToObjects(sh).forEach(function (o) { if (String(o.userEmail || '').trim().toLowerCase() === de) { updateRowById(sh, o.id, { userEmail: ke }); n++; } }); } catch (e) {}
      if (n) moved[sh] = n;
    });
  }
  updateRowById('Users', drop.id, { active: 'FALSE', email: 'merged.' + drop.id + '.' + de, mergedInto: keep.id, mergedAt: nowIso(), mergedBy: String(r.email).toLowerCase() });
  if (!truthy(keep.active) && truthy(drop.active)) updateRowById('Users', keep.id, { active: 'TRUE' });
  if (typeof scBump === 'function') { try { scBump('users'); } catch (e) {} }
  var summary = 'Merged ' + de + ' (' + drop.id + ') into ' + ke + ' (' + keep.id + '); moved ' + JSON.stringify(moved);
  try { a31WriteLog({ id: uid('log'), at: nowIso(), actorEmail: String(r.email).toLowerCase(), actorName: v3Name(r), actorRole: sys ? 'system' : (isSuperPerm(r) ? 'superadmin' : 'admin'), actorDept: r.department || '', area: 'admin', action: 'mergeAccounts', target: keep.id, summary: summary }); } catch (e) {}
  return { success: true, data: { keepId: keep.id, dropId: drop.id, moved: moved, summary: summary } };
}

/** 3.7.0 one-off (runs once from pushTick): merge only EXACT same-email duplicates (keep the active / oldest row). Name matches are never merged automatically. */
function r37MergeExactEmailDupsOnce() {
  var props = PropertiesService.getScriptProperties(); if (props.getProperty('R37_MERGE_EXACT')) return null;
  props.setProperty('R37_MERGE_EXACT', nowIso());
  var by = {}, out = [];
  sheetToObjects('Users').forEach(function (u) { var e = r37Norm_(u.email); if (e && !/^merged\./.test(e)) (by[e] = by[e] || []).push(u); });
  Object.keys(by).forEach(function (e) {
    var g = by[e]; if (g.length < 2) return;
    var keep = g.filter(function (u) { return truthy(u.active); })[0] || g[0];
    g.forEach(function (u) { if (u.id !== keep.id && !isSuperPerm(u)) { var r = mergeAccounts({ keepId: keep.id, dropId: u.id }, true); out.push({ email: e, keep: keep.id, drop: u.id, ok: !!(r && r.success) }); } });
  });
  props.setProperty('R37_MERGE_EXACT_RESULT', JSON.stringify(out).slice(0, 8000));
  return out;
}
