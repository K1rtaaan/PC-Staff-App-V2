/* PCR Staff App 3.2.0 — one-time live operations chosen by the owner, run on the first request after the 3.2.0 deploy
 * (Script Property A320_ROLES_DONE; under the script lock; results in the Superadmin log + App setting ops_320_result):
 *  1) Role migration (same as Manage → Role migration → Apply): back up the Users tab, write the roles column. Checks that
 *     nobody gained or lost a permission (compares every user's permissions before / after).
 *  2) Leanne and Delai: Superadmin → Admin (every other role kept). it@ stays superadmin. */
var A320_DEMOTE = ['leanne@paradisecoveresortfiji.com', 'it2.paradisecoveresort@gmail.com'];
function a320PermKey(u) { return userPermissions(u).map(String).filter(function (x) { return x && x !== 'staff'; }).sort().join(','); }
function a320RolesOnce() {
  var props;
  try { props = PropertiesService.getScriptProperties(); if (props.getProperty('A320_ROLES_DONE')) return null; } catch (e) { return null; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return null;
  var result = { at: nowIso() };
  try {
    if (props.getProperty('A320_ROLES_DONE')) return null;
    props.setProperty('A320_ROLES_DONE', nowIso());
    result.migration = a320Migrate();
    result.roleChanges = A320_DEMOTE.map(a320Demote);
    var main = findUserByEmail(SUPERADMIN_EMAIL);
    result.mainStillSuper = !!main && isSuperPerm(main);
  } catch (e) {
    result.error = String((e && e.message) || e).substring(0, 300);
  } finally {
    try { setSetting('ops_320_result', JSON.stringify(result), 'system'); } catch (e2) {}
    lock.releaseLock();
  }
  return result;
}
function a320Migrate() {
  var ss = getSS(), sh = ss.getSheetByName('Users');
  var users = sheetToObjects('Users'), before = {};
  users.forEach(function (x) { before[String(x.email).toLowerCase()] = a320PermKey(x); });
  var backupName = 'Users backup ' + fijiDateString(getFijiNow()) + ' ' + nowIso().slice(11, 16).replace(':', '');
  if (!ss.getSheetByName(backupName)) sh.copyTo(ss).setName(backupName);
  ensureColumns(sh, ['roles']);
  var withRoles = 0, written = 0, unchanged = 0;
  users.forEach(function (x) {
    var roles = userRoles(x);
    if (!roles.length) return;
    withRoles++;
    var r = rolesPatch(roles).roles;
    if (String(x.roles || '') === r) { unchanged++; return; }
    var f = findUserByEmail(x.email);
    if (f && f.id) { updateRowById('Users', f.id, { roles: r }); written++; }
  });
  setSetting('roles_migrated_at', nowIso(), 'system');
  try { scInvalidateSheet('Users'); } catch (e) {}
  var after = sheetToObjects('Users'), changed = [];
  after.forEach(function (x) { var k = String(x.email).toLowerCase(); if (before[k] !== undefined && before[k] !== a320PermKey(x)) changed.push(k + ': ' + before[k] + ' → ' + a320PermKey(x)); });
  var out = { backupTab: backupName, users: users.length, withRoles: withRoles, written: written, unchanged: unchanged, permissionChanges: changed.length };
  a31WriteLog({ actorEmail: 'system', actorName: 'App update 3.2.0', actorRole: 'system', area: 'super', action: 'migrateRoles', target: 'Users',
    summary: 'Role migration applied (one-time 3.2.0 update): backup tab "' + backupName + '", ' + withRoles + ' users with roles, ' + written + ' written, ' + unchanged + ' already up to date, ' + changed.length + ' permission changes' + (changed.length ? ' — ' + changed.join('; ') : ''),
    before: '', after: a31Json(out), bySuper: 'TRUE', revertable: 'FALSE', noRevertReason: 'Restore from the backup tab "' + backupName + '"' });
  return out;
}
function a320Demote(email) {
  var u = findUserByEmail(email), who = email.split('@')[0];
  if (!u) return { who: who, done: false, note: 'not found' };
  var beforeRoles = userRoles(u).join(',');
  if (!isSuperPerm(u)) return { who: who, done: false, note: 'not a superadmin', roles: beforeRoles };
  var perms = userPermissions(u).filter(function (x) { return x !== 'super_admin'; });
  if (perms.indexOf('staff') < 0) perms.unshift('staff');
  if (perms.indexOf('admin') < 0) perms.push('admin');
  var roles = userRoles(u).filter(function (x) { return x !== 'super_admin'; });
  if (roles.indexOf('admin') < 0) roles.unshift('admin');
  updateRowById('Users', u.id, { roles: roles.join(','), permissions: permissionsToString(perms), role: primaryRoleFromPermissions(perms) });
  try { scInvalidateSheet('Users'); } catch (e) {}
  var nu = findUserByEmail(email), afterRoles = nu ? userRoles(nu).join(',') : '';
  var ok = !!nu && !isSuperPerm(nu) && isAdminPerm(nu);
  a31WriteLog({ actorEmail: 'system', actorName: 'App update 3.2.0', actorRole: 'system', area: 'super', action: 'setUserAccess', target: String(email).toLowerCase(),
    summary: 'Superadmin → Admin (one-time 3.2.0 update, chosen by the owner). Roles ' + beforeRoles + ' → ' + afterRoles, before: beforeRoles, after: afterRoles,
    bySuper: 'TRUE', revertable: 'FALSE', noRevertReason: 'Give the role back in Users & roles' });
  return { who: who, done: ok, before: beforeRoles, after: afterRoles };
}
