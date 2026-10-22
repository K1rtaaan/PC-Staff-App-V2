/**
 * PCR Staff App 3.8.1: one meal order per person per date.
 *  - mealWriteLocked(): order writes run one at a time (no two taps / retries appending twice).
 *  - dedupeMealOrders(): every read of an order sheet shows only the LATEST active row per
 *    person + date (meal = sheet). Older copies stay in the sheet, untouched, but are hidden
 *    from prep list, summaries, PDFs, counts and "My orders".
 *  Key = serviceDate + userEmail; rows with no email (contractors / guests) use name + department.
 */
var ORDER_DEDUPE_SHEETS = { 'Dinner Orders': 1, 'Lunch Orders': 1, 'Breakfast Orders': 1 };
var MEAL_WRITE_ACTIONS = { placeDinnerOrder: 1, placeLunchOrder: 1, placeBreakfastOrder: 1, placeOrderOnBehalf: 1,
  requestLateMeal: 1, requestLateOnBehalf: 1, placeSpecialMeal: 1, cancelMealOrder: 1 };

function d381Date(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Pacific/Fiji', 'yyyy-MM-dd');
  return String(v || '').replace(/^'/, '').slice(0, 10);
}
function mealOrderKey(o) {
  var sd = d381Date(o.serviceDate);
  var em = String(o.userEmail || '').trim().toLowerCase();
  if (em) return sd + '|' + em;
  var nm = String(o.userName || o.guestName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!nm) return ''; // nothing to key on — never hide it
  return sd + '|name:' + nm + '|' + String(o.department || o.guestCompany || '').trim().toLowerCase();
}
function d381Inactive(st) { st = String(st || ''); return st === 'cancelled' || st === 'rejected' || st === 'declined'; }

/** Hide an active row when a LATER row for the same person+date exists (unless that later row was rejected/declined). */
function dedupeMealOrders(rows) {
  if (!rows || rows.length < 2) return rows;
  var lastIdx = {}, i, k;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].status) === 'rejected' || String(rows[i].status) === 'declined') continue;
    k = mealOrderKey(rows[i]);
    if (k) lastIdx[k] = i;
  }
  var out = [];
  for (i = 0; i < rows.length; i++) {
    var o = rows[i];
    k = mealOrderKey(o);
    if (k && !d381Inactive(o.status) && lastIdx[k] !== undefined && lastIdx[k] > i) continue; // superseded copy
    out.push(o);
  }
  return out;
}

/** Run a meal write while holding the meal-write lock (separate from the script lock used by schema/cache helpers). */
function mealWriteLocked(fn, p) {
  if (typeof LockService.getUserLock !== 'function') return fn(p); // test VMs without user locks
  var lock = LockService.getUserLock();
  if (!lock.tryLock(25000)) return { success: false, retry: true, error: 'Server busy — will retry automatically' };
  try {
    REQ_MEMO_reset381();
    return fn(p);
  } finally {
    try { SpreadsheetApp.flush(); } catch (eF) {}
    lock.releaseLock();
  }
}
/** Fresh sheet reads inside the lock (another request may have written just before we got it). */
function REQ_MEMO_reset381() {
  try {
    if (typeof REQ_MEMO !== 'undefined' && REQ_MEMO) { delete REQ_MEMO['Dinner Orders']; delete REQ_MEMO['Lunch Orders']; delete REQ_MEMO['Breakfast Orders']; }
  } catch (e) {}
}

/** Superadmin check: active duplicate rows from a date on (default today). Read-only. */
function findDuplicateMealOrders(p) {
  var from = d381Date((p && p.from) || fijiDateString(getFijiNow()));
  var out = [];
  Object.keys(ORDER_DEDUPE_SHEETS).forEach(function (sheet) {
    var g = {};
    sheetToObjectsRaw(sheet).forEach(function (o) {
      if (d381Inactive(o.status) || d381Date(o.serviceDate) < from) return;
      var k = mealOrderKey(o); if (!k) return;
      (g[k] = g[k] || []).push({ id: o.id, row: o._row, name: o.userName, choice: o.mealChoice, status: o.status, createdAt: o.createdAt });
    });
    Object.keys(g).forEach(function (k) { if (g[k].length > 1) out.push({ sheet: sheet, key: k, rows: g[k] }); });
  });
  return { success: true, data: { from: from, groups: out.length, duplicates: out } };
}
