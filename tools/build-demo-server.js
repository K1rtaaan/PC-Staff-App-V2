// 3.0.0: wraps apps-script/V3.gs + Release3.gs so the ?demo=1 mode runs the SAME server logic against the phone's demo data.
// Run: node tools/build-demo-server.js  (also part of `npm run build`)
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8');
const src = read('V3.gs') + '\n' + read('Release3.gs');
const shim = ['APP_VERSION','ORDER_HEADERS','SHEET_ID','SUPERADMIN_EMAIL','WEEKDAY_NAMES','addFijiDays','appendRow','breakfastCutoffInfo',
  'cachedRows','cleanSpecialNote','countedMealStatus','countsInBreakfastTotal','dinnerCutoffInfo','displayUserName','ensureColumns','ensureSheet',
  'fijiDateString','findOrder','findUserByEmail','formatFiji','getDinnerMenus','getFijiNow','getRequester','getSS','getSetting','isAdminPerm',
  'isChefPerm','isSuperPerm','kitchenNoteOf','lunchCutoffInfo','mealRangeStats','normalizeStaffLocation','nowIso','publicUser','scBump','scGetJson',
  'scKey','scPutJson','sheetToObjects','truthy','uid','updateRowById','userPermissions','withIdempotency','setSetting','stationsExclusive','ALL_PERMISSIONS','permissionsToString','primaryRoleFromPermissions','sendAppMail','Utilities','MailApp',
  'LockService','CacheService','PropertiesService','buildPrepPayload','preferredNameMap','decorateOrderNotes','pad2','dsumSaveSnapshot','dsumTryPdf','scInvalidateSheet','SpreadsheetApp'];
// same meaning as Code.gs 3.0.0: chef or admin / boat_manager or admin (roles column merged by userPermissions)
const perms = `
isChefPerm = function (u) { if (!u) return false; var p = userPermissions(u); return p.indexOf('chef') >= 0 || p.indexOf('kitchen') >= 0 || isAdminPerm(u); };
function isBoatManagerPerm(u) { if (!u) return false; var p = userPermissions(u); return p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0 || isAdminPerm(u); }
r3NotifyMany = function (rows) { (rows || []).forEach(function (r) { appendRow('Notifications', r); }); };
`;
const exportsList = ['routeV3','getV3Home','v3Role','isAsstHod','deptStatusOf','deptApproved','v3Notify','deptLeads','canActForDept',
  'v3RoleCounts','v3UserOut','v3UserWarnings','v3CutoffReminders','getLeaveCalendar',
  'isChefPerm','isBoatManagerPerm','routeRelease3','mealTick','mealTimes','mealTimesOut','mealWindow','mealPhase','userRoles','roleButtons','rolesPatch'];
const out = '/* GENERATED from apps-script/V3.gs + Release3.gs by tools/build-demo-server.js — demo mode only. Do not edit. */\n' +
  'window.PCRV3Server = function (S) {\n' + shim.map(n => 'var ' + n + ' = S.' + n + ';').join('\n') + '\n' + src + perms +
  '\nreturn { ' + exportsList.map(n => n + ': ' + n).join(', ') + ' };\n};\n';
fs.writeFileSync(path.join(__dirname, '..', 'public', 'assets', 'v3-demo-server.js'), out);
console.log('wrote public/assets/v3-demo-server.js', out.length, 'bytes');
