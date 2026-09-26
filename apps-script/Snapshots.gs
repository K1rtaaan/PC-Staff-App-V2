/**
 * PCR Staff App 3.0 — saved order summaries ("Dinner Snapshots" tab).
 *
 * - At the dinner cutoff (8:00 PM Fiji) a snapshot of ALL dinner orders for tomorrow's service is saved automatically:
 *   a time-driven trigger calls dinnerSnapshotTick() ~8:05 PM Fiji (installDinnerSnapshotTrigger), and as a fallback
 *   the first kitchen read / list open after the cutoff creates it (idempotent — one "auto" snapshot per service date).
 * - The payload is the same data the printable dinner order list uses (prep tally + byItem + every order row with notes),
 *   so the saved summary prints exactly like the live list, including "Allergies & special requests".
 * - Any date can be generated later: the saved snapshot if there is one, else built from the order rows (still there
 *   for ~60 days; archiveOldRows never touches this tab). Orders added after a snapshot show as an addendum.
 * - Breakfast / lunch use the same tab (meal column) for manual summaries.
 * Also bundled into the demo (tools/build-demo-server.js).
 */
var SNAP_SHEET = 'Dinner Snapshots';
var SNAP_HEADERS = ['id', 'serviceDate', 'meal', 'kind', 'generatedAt', 'generatedBy', 'totalOrders', 'payloadJson'];
var SNAP_MEAL_SHEETS = { dinner: 'Dinner Orders', breakfast: 'Breakfast Orders', lunch: 'Lunch Orders' };
var SNAP_CUTOFF_HOUR = 20;

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
/** The service date whose dinner books closed most recently (after 8pm → tomorrow, else today). */
function snapLastClosedDinner(now) {
  now = now || getFijiNow();
  return now.getUTCHours() >= SNAP_CUTOFF_HOUR ? fijiDateString(addFijiDays(now, 1)) : fijiDateString(now);
}
/** Idempotent: one automatic snapshot per closed dinner service date. Returns the row (existing or new). */
function snapEnsureAuto(serviceDate, by) {
  var have = snapFind('dinner', serviceDate, 'auto');
  if (have.length) return { row: have[0], created: false };
  var lock = null;
  try { lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) lock = null; } catch (e) { lock = null; }
  try {
    have = snapFind('dinner', serviceDate, 'auto'); // re-check inside the lock
    if (have.length) return { row: have[0], created: false };
    return { row: snapSave('dinner', serviceDate, 'auto', by || 'auto (8:05pm)'), created: true };
  } finally { try { if (lock) lock.releaseLock(); } catch (e2) {} }
}
/** Time-driven trigger (~8:05 PM Fiji daily). Safe to run any number of times. */
function dinnerSnapshotTick() {
  var now = getFijiNow();
  if (now.getUTCHours() < SNAP_CUTOFF_HOUR) return { skipped: 'before the 8pm cutoff', serviceDate: fijiDateString(now) };
  var d = snapLastClosedDinner(now);
  var r = snapEnsureAuto(d, 'auto (8:05pm trigger)');
  return { serviceDate: d, created: r.created, id: r.row.id };
}
/** Run once from the Apps Script editor (needs the script.scriptapp scope): daily trigger at ~8:05 PM Fiji. */
function installDinnerSnapshotTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dinnerSnapshotTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dinnerSnapshotTick').timeBased().everyDays(1).atHour(20).nearMinute(5).inTimezone('Pacific/Fiji').create();
  return 'dinnerSnapshotTick trigger installed (daily ~8:05 PM Fiji)';
}
/** Fallback used on kitchen reads: after the cutoff, make sure tonight's auto snapshot exists. Never throws. */
function snapFallback() {
  try {
    var now = getFijiNow();
    var d = snapLastClosedDinner(now);
    if (now.getUTCHours() < SNAP_CUTOFF_HOUR && !snapFind('dinner', d, 'auto').length) {
      // before 8pm the most recent closed service is today's dinner — only back-fill when orders exist for it
      if (!sheetToObjects('Dinner Orders').some(function (o) { return snapDate(o.serviceDate) === d; })) return null;
      return snapEnsureAuto(d, 'auto (on open)');
    }
    return snapEnsureAuto(d, now.getUTCHours() === SNAP_CUTOFF_HOUR && now.getUTCMinutes() < 15 ? 'auto (8:05pm)' : 'auto (on open)');
  } catch (e) { return null; }
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
/** List (latest first). Opening it also creates tonight's auto dinner snapshot if the trigger has not yet. */
function getOrderSnapshots(p) {
  var u = snapCaller(p); if (!u) return { success: false, error: 'Chef station, admin or superadmin only' };
  var fb = snapFallback();
  var meal = String(p.meal || '');
  var list = snapRows().filter(function (s) { return !meal || String(s.meal || 'dinner') === meal; }).map(function (s) { return snapOut(s, false); })
    .sort(function (a, b) { return (b.serviceDate + b.generatedAt).localeCompare(a.serviceDate + a.generatedAt); });
  var lim = Math.min(Number(p.limit || 60), 200);
  return { success: true, data: { snapshots: list.slice(0, lim), total: list.length, lastClosedDinner: snapLastClosedDinner(), autoCreated: !!(fb && fb.created), fijiNow: nowIso() } };
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
