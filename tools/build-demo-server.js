// 3.0: wraps apps-script/V3.gs + Stations.gs so the ?demo=1 mode runs the SAME server logic against the phone's demo data.
// Run: node tools/build-demo-server.js  (also part of `npm run build`)
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8');
const src = read('V3.gs') + '\n' + read('Stations.gs') + '\n' + read('Snapshots.gs');
const shim = ['APP_VERSION','ORDER_HEADERS','SHEET_ID','SUPERADMIN_EMAIL','WEEKDAY_NAMES','addFijiDays','appendRow','breakfastCutoffInfo',
  'cachedRows','cleanSpecialNote','countedMealStatus','countsInBreakfastTotal','dinnerCutoffInfo','displayUserName','ensureColumns','ensureSheet',
  'fijiDateString','findOrder','findUserByEmail','formatFiji','getDinnerMenus','getFijiNow','getRequester','getSS','getSetting','isAdminPerm',
  'isChefPerm','isSuperPerm','kitchenNoteOf','lunchCutoffInfo','mealRangeStats','normalizeStaffLocation','nowIso','publicUser','scBump','scGetJson',
  'scKey','scPutJson','sheetToObjects','truthy','uid','updateRowById','userPermissions','withIdempotency','isAdminPassword','Utilities','MailApp',
  'LockService','CacheService','PropertiesService','buildPrepPayload','preferredNameMap','decorateOrderNotes'];
// same meaning as Code.gs isChefPerm / isBoatManagerPerm (station, superadmin, or the old permission until that station is set up)
const perms = `
isChefPerm = function (u) { if (!u) return false; if (u.station) return u.station === 'chef'; if (isSuperPerm(u)) return true; return !stationConfigured('chef') && stationLegacyPerm(u, 'chef'); };
function isBoatManagerPerm(u) { if (!u) return false; if (u.station) return u.station === 'boat'; if (isSuperPerm(u)) return true; return !stationConfigured('boat') && stationLegacyPerm(u, 'boat'); }
`;
const exportsList = ['routeV3','getV3Home','v3Role','isAsstHod','deptStatusOf','deptApproved','v3MigrateTarget','v3Notify','deptLeads','canActForDept',
  'v3SeatUsage','v3SeatCheck','v3UserOut','v3UserWarnings','V3_SEAT_LIMITS','V3_STATION_ROLES','V3_STATION_ROLE_MSG',
  'routeStations','stationLogin','stationVerifyToken','isStationToken','stationBindRequest','stationPersonalGate','stationSetPassword','stationStatus',
  'stationUser','stationPublicUser','stationConfigured','stationLogWrite','requesterTag','STATION_MUTATIONS','STATION_ACTIONS','STATION_DEFS',
  'isChefPerm','isBoatManagerPerm','routeSnapshots','dinnerSnapshotTick','snapFallback','snapLastClosedDinner'];
const out = '/* GENERATED from apps-script/V3.gs + Stations.gs + Snapshots.gs by tools/build-demo-server.js — demo mode only. Do not edit. */\n' +
  'window.PCRV3Server = function (S) {\n' + shim.map(n => 'var ' + n + ' = S.' + n + ';').join('\n') + '\n' + src + perms +
  '\nreturn { ' + exportsList.map(n => n + ': ' + n).join(', ') + ' };\n};\n';
fs.writeFileSync(path.join(__dirname, '..', 'public', 'assets', 'v3-demo-server.js'), out);
console.log('wrote public/assets/v3-demo-server.js', out.length, 'bytes');
