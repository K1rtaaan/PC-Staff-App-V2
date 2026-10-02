/**
 * PCR Staff App V2 (3.0) — TEST backend only. This file is NEVER part of apps-script/ (the live project).
 * make-test-backend.py adds it to the separate "PCR Staff App V2 TEST" Apps Script project.
 *
 * setupTestEnvironment() — run once from the Apps Script editor (it also shows the one-time Google authorisation).
 *   - creates a NEW, EMPTY Google Sheet "PCR Staff App V2 — TEST" (the live sheet is never opened or copied)
 *   - builds every tab with the app's own initializeSheets() (dinner menus, 14 days of boat runs, sample reminder)
 *   - adds one test account per role (fake names, +alias addresses of pcrstaffapp@gmail.com)
 *   - mail: everything is redirected to pcrstaffapp+t-mail, [TEST] subject prefix, Brevo disabled in code
 * Safe to run again: reuses the TEST sheet and only upserts the test accounts.
 * If it was never run, the first web request runs it automatically (testAutoSetup) once the project is authorised.
 */
var PCR_LIVE_V2_SHEET_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM';
var TEST_PASSWORD = '__TEST_PASSWORD__';
var TEST_MAIL_INBOX = 'pcrstaffapp+t-mail@gmail.com';
var TEST_USERS = [
  { key: 'staff', email: 'pcrstaffapp+t-staff@gmail.com', firstName: 'TEST', lastName: 'Staff', department: 'IT/Office', roles: [] },
  { key: 'hod', email: 'pcrstaffapp+t-hod@gmail.com', firstName: 'TEST', lastName: 'HOD', department: 'IT/Office', roles: ['hod'] },
  { key: 'assistant_hod', email: 'pcrstaffapp+t-asst@gmail.com', firstName: 'TEST', lastName: 'AsstHOD', department: 'IT/Office', roles: ['assistant_hod'] },
  { key: 'chef', email: 'pcrstaffapp+t-chef@gmail.com', firstName: 'TEST', lastName: 'Chef', department: 'Kitchen', roles: ['chef'] },
  { key: 'boat_manager', email: 'pcrstaffapp+t-boat@gmail.com', firstName: 'TEST', lastName: 'Boat', department: 'Boatman', roles: ['boat_manager'] },
  { key: 'admin', email: 'pcrstaffapp+t-admin@gmail.com', firstName: 'TEST', lastName: 'Admin', department: 'Management', roles: ['admin'] }
];

function testAutoSetup() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('TEST_SHEET_ID') || '').trim();
  if (id) { SHEET_ID = id; return; }
  var cache = CacheService.getScriptCache();
  if (cache.get('pcr_test_setup_running')) throw new Error('TEST backend is being set up — retry in a minute.');
  cache.put('pcr_test_setup_running', '1', 300);
  try { setupTestEnvironment(); } finally { cache.remove('pcr_test_setup_running'); }
}

function setupTestEnvironment() {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  // Brevo must never be configured on TEST (the code ignores it anyway)
  ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER', 'BREVO_SENDER_NAME'].forEach(function (k) { try { props.deleteProperty(k); } catch (e) {} });
  props.setProperty('MAIL_REDIRECT_TO', TEST_MAIL_INBOX);
  props.setProperty('MAIL_SUBJECT_PREFIX', '[TEST]');
  // 1. TEST sheet: reuse, or create a brand-new empty one (no live data)
  var id = String(props.getProperty('TEST_SHEET_ID') || '').trim();
  var ss = null;
  if (id && id !== PCR_LIVE_V2_SHEET_ID) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  var fresh = false;
  if (!ss) {
    ss = SpreadsheetApp.create('PCR Staff App V2 — TEST (test data only)');
    fresh = true;
    out.push('Created TEST sheet ' + ss.getUrl());
  } else out.push('Reusing TEST sheet ' + ss.getUrl());
  if (ss.getId() === PCR_LIVE_V2_SHEET_ID) throw new Error('Refusing: TEST sheet id equals the live sheet');
  props.setProperty('TEST_SHEET_ID', ss.getId());
  SHEET_ID = ss.getId();
  try { CacheService.getScriptCache().removeAll(['pcr_sheets_ready', 'pcr_v3_schema_300b', 'pcr_note_cols_v294']); } catch (eC) {}
  // 2. All tabs + seeds (dinner menus, boat runs for 14 days, sample reminder, alert emails = TEST admin)
  initializeSheets();
  if (fresh) { var s1 = ss.getSheetByName('Sheet1'); if (s1 && ss.getSheets().length > 1) { try { ss.deleteSheet(s1); } catch (eD) {} } }
  ensureSuperAdmin(); // SUPERADMIN_EMAIL is the TEST superadmin on this build
  var sa = findUserByEmail(SUPERADMIN_EMAIL);
  if (sa) updateRowById('Users', sa.id, Object.assign({ password: SUPERADMIN_PASSWORD, firstName: 'TEST', lastName: 'Superadmin', department: 'IT/Office',
    active: true, verified: true, deptStatus: 'approved' }, rolesPatch(['super_admin', 'admin'])));
  out.push('Test user super_admin: ' + SUPERADMIN_EMAIL);
  // 3. Test accounts (upsert)
  TEST_USERS.forEach(function (t) {
    var u = findUserByEmail(t.email);
    var patch = Object.assign({ password: TEST_PASSWORD, firstName: t.firstName, lastName: t.lastName, department: t.department,
      active: true, verified: true, village: 'Mainland', deptStatus: 'approved', deptDecidedBy: 'test setup', deptDecidedAt: nowIso() }, rolesPatch(t.roles));
    if (u) updateRowById('Users', u.id, patch);
    else appendRow('Users', Object.assign({ id: uid('usr'), email: t.email, contact: '', createdAt: nowIso() }, patch));
    out.push('Test user ' + t.key + ': ' + t.email);
  });
  // 4. Settings
  setSetting('mail_provider', 'mailapp', 'test setup');
  setSetting('mail_reply_to', 'pcrstaffapp@gmail.com', 'test setup');
  setSetting('feature_live_roster', 'false', 'test setup');
  setSetting('mail_sender_name', 'PCR Staff App TEST', 'test setup');
  try { scInvalidateSheet('Users'); scInvalidateSheet('App Settings'); } catch (eS) {}
  Logger.log(out.join('\n'));
  return out;
}

/** Editor helper: shows where the TEST backend points. */
function testEnvInfo() {
  var props = PropertiesService.getScriptProperties();
  var o = { version: APP_VERSION, sheetId: props.getProperty('TEST_SHEET_ID'), mailRedirect: props.getProperty('MAIL_REDIRECT_TO'),
    prefix: props.getProperty('MAIL_SUBJECT_PREFIX'), brevoKeySet: !!props.getProperty('BREVO_API_KEY') };
  Logger.log(JSON.stringify(o));
  return o;
}

/* 3.4.0 e2e: every mail the TEST backend sends is also written to the TEST sheet ("TEST Mail Log"), so the tests can
   read a one-time password. Only the TEST superadmin (signed in) can read it. Never in the live backend. */
function testMailLog_(list, subject, body) {
  var sh = ensureSheet(getSS(), 'TEST Mail Log', ['at', 'to', 'subject', 'body']);
  sh.appendRow([nowIso(), (list || []).join(','), String(subject || ''), String(body || '').substring(0, 4000)]);
}
function testMailLogAction(p) {
  var me = getRequester(p);
  if (!me || !isSuperPerm(me) || !(R3_AUTH && R3_AUTH.token)) return { success: false, error: 'TEST superadmin only' };
  if (p.moveInfo) { var pr = PropertiesService.getScriptProperties(); return { success: true, data: { moved: pr.getProperty('TEST_EMAILS_PCRSTAFFAPP') || '', redirect: pr.getProperty('MAIL_REDIRECT_TO') || '' } }; }
  var sh = getSS().getSheetByName('TEST Mail Log');
  if (!sh || sh.getLastRow() < 2) return { success: true, data: { mails: [] } };
  var n = Math.min(30, sh.getLastRow() - 1);
  var rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 4).getValues().map(function (r) { return { at: String(r[0]), to: String(r[1]), subject: String(r[2]), body: String(r[3]) }; });
  var want = String(p.to || '').toLowerCase();
  return { success: true, data: { mails: rows.filter(function (m) { return !want || m.to.toLowerCase().indexOf(want) >= 0 || m.body.toLowerCase().indexOf(want) >= 0; }).reverse() } };
}

/* 3.5.2 (Pranav): test logins moved from groupit.paradisecoveresortfiji+t-*@gmail.com to pcrstaffapp+t-*@gmail.com.
   Runs ONCE on the TEST sheet (Script Property TEST_EMAILS_PCRSTAFFAPP): every cell that holds an old test address is
   rewritten with the same +suffix, so each user keeps their id, roles, GL links, orders, leave and notifications.
   Also moves the TEST mail redirect + reply-to. Passwords are not touched. Never in the live backend. */
var TEST_OLD_ALIAS_RE = /groupit\.paradisecoveresortfiji\+/gi;
var TEST_MOVE_CHECKED = false;
function testMaybeMoveEmails_() { // called from getSS() on the TEST build, once per execution
  if (TEST_MOVE_CHECKED) return; TEST_MOVE_CHECKED = true;
  try { if (!PropertiesService.getScriptProperties().getProperty('TEST_EMAILS_PCRSTAFFAPP')) testMoveTestEmails_(); } catch (e) { console.warn('test email move: ' + e); }
}
function testMoveTestEmails_() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (props.getProperty('TEST_EMAILS_PCRSTAFFAPP')) return;
    var ss = getSS(); if (ss.getId() === PCR_LIVE_V2_SHEET_ID) throw new Error('Refusing: live sheet');
    var moved = {}, total = 0;
    ss.getSheets().forEach(function (sh) {
      var n = sh.getLastRow(), c = sh.getLastColumn(); if (n < 1 || c < 1) return;
      var rg = sh.getRange(1, 1, n, c), v = rg.getValues(), f = rg.getFormulas(), cnt = 0;
      for (var i = 0; i < n; i++) for (var j = 0; j < c; j++) {
        if (f[i][j] || typeof v[i][j] !== 'string' || v[i][j].toLowerCase().indexOf('groupit.paradisecoveresortfiji+') < 0) continue;
        var nv = v[i][j].replace(TEST_OLD_ALIAS_RE, 'pcrstaffapp+');
        if (nv !== v[i][j]) { sh.getRange(i + 1, j + 1).setValue(nv); cnt++; }
      }
      if (cnt) { moved[sh.getName()] = cnt; total += cnt; try { scInvalidateSheet(sh.getName()); } catch (eI) {} }
    });
    props.setProperty('MAIL_REDIRECT_TO', TEST_MAIL_INBOX);
    setSetting('mail_reply_to', 'pcrstaffapp@gmail.com', 'test: pcrstaffapp move');
    try { scInvalidateSheet('Users'); scInvalidateSheet('App Settings'); } catch (eS) {}
    props.setProperty('TEST_EMAILS_PCRSTAFFAPP', nowIso() + ' moved ' + total + ' cells ' + JSON.stringify(moved));
  } finally { lock.releaseLock(); }
}
