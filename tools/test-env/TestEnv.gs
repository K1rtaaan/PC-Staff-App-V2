/**
 * PCR Staff App V2 — TEST backend only. This file is NEVER part of apps-script/ (the live project).
 * It is added by tools/test-env/make-test-backend.py into the separate "PCR Staff App V2 TEST" project.
 *
 * Run setupTestEnvironment() once from the Apps Script editor (it also shows the one-time authorisation screen).
 * It is safe to run again: it reuses the existing TEST copy and only upserts the test accounts.
 */
var PCR_LIVE_V2_SHEET_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM';
var TEST_PASSWORD = 'TestPass-2026';
var TEST_USERS = [
  { key: 'staff', email: 'groupit.paradisecoveresortfiji+t-staff@gmail.com', firstName: 'TEST', lastName: 'Staff', department: 'IT/Office', permissions: 'staff' },
  { key: 'hod', email: 'groupit.paradisecoveresortfiji+t-hod@gmail.com', firstName: 'TEST', lastName: 'HOD', department: 'IT/Office', permissions: 'staff,hod' },
  { key: 'asst', email: 'groupit.paradisecoveresortfiji+t-asst@gmail.com', firstName: 'TEST', lastName: 'Asst HOD', department: 'IT/Office', permissions: 'staff,assistant_hod', assistantHod: true },
  { key: 'admin', email: 'groupit.paradisecoveresortfiji+t-admin@gmail.com', firstName: 'TEST', lastName: 'Admin', department: 'Management', permissions: 'staff,admin' },
  { key: 'kitchen', email: 'groupit.paradisecoveresortfiji+t-kitchen@gmail.com', firstName: 'TEST', lastName: 'Kitchen', department: 'Kitchen', permissions: 'staff,chef' },
  { key: 'boat', email: 'groupit.paradisecoveresortfiji+t-boat@gmail.com', firstName: 'TEST', lastName: 'Boatman', department: 'Boatman', permissions: 'staff,boat_manager,boat_captain' }
];

function setupTestEnvironment() {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  // 1. TEST sheet: reuse, or copy the live V2 sheet (read-only on live — copy() never modifies the source).
  var id = String(props.getProperty('TEST_SHEET_ID') || '').trim();
  var ss = null;
  if (id && id !== PCR_LIVE_V2_SHEET_ID) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    var stamp = Utilities.formatDate(new Date(), 'Pacific/Fiji', 'yyyy-MM-dd');
    ss = SpreadsheetApp.openById(PCR_LIVE_V2_SHEET_ID).copy('PCR Staff App V2 — TEST (copy ' + stamp + ')');
    out.push('Copied live sheet → ' + ss.getUrl());
  } else out.push('Reusing TEST sheet ' + ss.getUrl());
  if (ss.getId() === PCR_LIVE_V2_SHEET_ID) throw new Error('Refusing: TEST sheet id equals the live sheet');
  props.setProperty('TEST_SHEET_ID', ss.getId());
  SHEET_ID = ss.getId();
  // 2. Mail safety
  props.setProperty('MAIL_REDIRECT_TO', 'it@paradisecoveresortfiji.com');
  props.setProperty('MAIL_SUBJECT_PREFIX', '[TEST]');
  try { CacheService.getScriptCache().removeAll(['pcr_v3_schema_303']); } catch (eC) {}
  ensureV3Schema(ss, true);
  ensureSuperAdmin();
  // 3. Superadmin password on TEST only
  var sa = findUserByEmail(SUPERADMIN_EMAIL);
  if (sa) updateRowById('Users', sa.id, { password: '21slands', active: true, verified: true });
  // 4. Test accounts (upsert)
  TEST_USERS.forEach(function (t) {
    var u = findUserByEmail(t.email);
    var perms = parsePermissions(t.permissions, 'staff');
    var patch = { password: TEST_PASSWORD, firstName: t.firstName, lastName: t.lastName, department: t.department,
      role: primaryRoleFromPermissions(perms), permissions: permissionsToString(perms), active: true, verified: true,
      deptStatus: 'approved', deptDecidedBy: 'test setup', deptDecidedAt: nowIso(), assistantHod: t.assistantHod ? true : false };
    if (u) updateRowById('Users', u.id, patch);
    else appendRow('Users', Object.assign({ id: uid('usr'), email: t.email, contact: '', createdAt: nowIso() }, patch));
    out.push('Test user ' + t.key + ': ' + t.email);
  });
  // 5. Flags
  setSetting('feature_my_schedule', 'false', 'test setup');
  setSetting('feature_live_roster', 'false', 'test setup');
  setSetting('stations_exclusive', 'false', 'test setup');
  setSetting('mail_provider', 'mailapp', 'test setup');
  // 6. Station logins (test values)
  stationSetPassword('chef', 'chef', 'ChefTest-2026', 'test setup');
  stationSetPassword('boat', 'boat', 'BoatTest-2026', 'test setup');
  out.push('Stations: chef / ChefTest-2026 · boat / BoatTest-2026');
  // 7. Snapshot triggers (TEST project only)
  out.push(installMealSnapshotTriggers());
  try { scInvalidateSheet('Users'); scInvalidateSheet('App Settings'); } catch (eS) {}
  Logger.log(out.join('\n'));
  return out;
}
