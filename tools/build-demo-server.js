// 3.0: wraps apps-script/V3.gs so the ?demo=1 mode runs the SAME server logic against the phone's demo data.
// Run: node tools/build-demo-server.js  (also part of `npm run build`)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'V3.gs'), 'utf8');
const shim = ['APP_VERSION','ORDER_HEADERS','SHEET_ID','SUPERADMIN_EMAIL','WEEKDAY_NAMES','addFijiDays','appendRow','breakfastCutoffInfo',
  'cachedRows','cleanSpecialNote','countedMealStatus','countsInBreakfastTotal','dinnerCutoffInfo','displayUserName','ensureColumns','ensureSheet',
  'fijiDateString','findOrder','findUserByEmail','formatFiji','getDinnerMenus','getFijiNow','getRequester','getSS','getSetting','isAdminPerm',
  'isChefPerm','isSuperPerm','kitchenNoteOf','lunchCutoffInfo','mealRangeStats','normalizeStaffLocation','nowIso','publicUser','scBump','scGetJson',
  'scKey','scPutJson','sheetToObjects','truthy','uid','updateRowById','userPermissions','withIdempotency','isAdminPassword','Utilities','MailApp','LockService','CacheService'];
const out = '/* GENERATED from apps-script/V3.gs by tools/build-demo-server.js — demo mode only. Do not edit. */\n' +
  'window.PCRV3Server = function (S) {\n' + shim.map(n => 'var ' + n + ' = S.' + n + ';').join('\n') + '\n' + src +
  '\nreturn { routeV3: routeV3, getV3Home: getV3Home, v3Role: v3Role, isAsstHod: isAsstHod, deptStatusOf: deptStatusOf, deptApproved: deptApproved, v3MigrateTarget: v3MigrateTarget, v3Notify: v3Notify, deptLeads: deptLeads, canActForDept: canActForDept, v3SeatUsage: v3SeatUsage, v3SeatCheck: v3SeatCheck, v3UserOut: v3UserOut, v3UserWarnings: v3UserWarnings, V3_SEAT_LIMITS: V3_SEAT_LIMITS };\n};\n';
fs.writeFileSync(path.join(__dirname, '..', 'public', 'assets', 'v3-demo-server.js'), out);
console.log('wrote public/assets/v3-demo-server.js', out.length, 'bytes');
