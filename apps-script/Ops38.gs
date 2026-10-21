/**
 * PCR Staff App 3.8.0 (Pranav pack):
 *  - batch: several read calls in one request (one auth + one sheet read each via REQ_MEMO) — see handleRequest.
 *  - Dinner rating: next morning 👍/👎 (+ comment) for last night's dish → Chef Feedback (kind 'rating'); chef/admin per-dish summary.
 *  - Boat manifest: one daily list per run (PCE AM/PM both directions + village boat runs) with name, department, from/to, status.
 *  - HOD dashboard: on shift today/tomorrow, tomorrow's dinner ordered / not, pending leave + approvals, team boat movements.
 */
var R38_BATCH_READS = {
  getDinnerMenus: 1, myBoatBookings: 1, getEmergencyTravel: 1, getKitchenDaySummary: 1, getKitchenDashboard: 1, getBoatRuns: 1, getBoatBookings: 1,
  getMyOrdersSummary: 1, getLeaveRequests: 1, getMyNotifications: 1, getReminders: 1, getSuggestions: 1, getDinnerOrders: 1, getCutoffInfo: 1,
  getAppSettings: 1, getMySchedule: 1, getMyRoster: 1, getHodLeaveSummary: 1, getDailyOpsSummary: 1, getBoatTripSummary: 1, getPendingApprovals: 1,
  getDepartments: 1, getV3Home: 1, getAnnouncements: 1, getChefFeedback: 1, getDinnerPrepList: 1, getMyResortBoat: 1, getResortBoatManifest: 1,
  getDinnerRatingPrompt: 1, getDishRatings: 1, getBoatManifestDay: 1, getHodDashboard: 1, getMealStatistics: 1,
  getDeptUpdates: 1, getPushConfig: 1, getMyGuides: 1, getBreakfastOrders: 1, getLunchOrders: 1
};
var R38_BATCH_MAX = 12;
/** Called from handleRequest for action 'batch'. calls = [{a: action, p: params}] (JSON string or array). */
function r38Batch(payload) {
  var calls = payload.calls;
  if (typeof calls === 'string') { try { calls = JSON.parse(calls); } catch (e) { calls = []; } }
  if (!Array.isArray(calls) || !calls.length) return { success: false, error: 'No calls' };
  if (calls.length > R38_BATCH_MAX) return { success: false, error: 'Too many calls in one batch' };
  var t0 = Date.now(), results = [];
  REQ_MEMO = {};
  try {
    calls.forEach(function (c) {
      var a = String(c && c.a || '');
      if (!R38_BATCH_READS[a]) { results.push({ success: false, error: 'Not batchable: ' + a }); return; }
      var sub = Object.assign({}, (c && c.p) || {});
      ['requesterEmail', 'sessionToken', 'logArea'].forEach(function (k) { if (payload[k] !== undefined && sub[k] === undefined) sub[k] = payload[k]; });
      if (sub.userEmail === undefined && payload.userEmail !== undefined) sub.userEmail = payload.userEmail;
      try {
        var auth = bindRequestIdentity(a, sub);
        if (auth && auth.error) { results.push({ success: false, error: auth.error, sessionExpired: !!auth.sessionExpired, needsSignIn: !!auth.sessionExpired }); return; }
        var r = a31Handle(a, sub, routeAction);
        if (r && r.success === false && R3_AUTH && R3_AUTH.staffView) r.needsSignIn = true;
        results.push(r);
      } catch (e2) { results.push({ success: false, error: String(e2 && e2.message || e2) }); }
      R3_AUTH = null;
    });
  } finally { REQ_MEMO = null; }
  return { success: true, batch: true, results: results, ms: Date.now() - t0 };
}

/* ---------- dinner rating ---------- */
function r38Yesterday() { return fijiDateString(addFijiDays(getFijiNow(), -1)); }
function r38RatingRows() { return sheetToObjects('Chef Feedback').filter(function (r) { return String(r.kind) === 'rating'; }); }
function getDinnerRatingPrompt(p) {
  var u = v3Requester(p), em = String(u.email || '').toLowerCase();
  if (!em) return { success: true, data: { prompt: null } };
  var hour = getFijiNow().getUTCHours();
  if (hour < 5 || hour >= 15) return { success: true, data: { prompt: null } }; // the morning after (5am – 3pm)
  var y = r38Yesterday();
  var o = sheetToObjects('Dinner Orders').filter(function (x) {
    return String(x.userEmail).toLowerCase() === em && v3Date(x.serviceDate) === y && !/cancel|declin|reject/i.test(String(x.status)) && String(x.mealChoice || '').trim();
  })[0];
  if (!o) return { success: true, data: { prompt: null } };
  var done = r38RatingRows().some(function (r) { return String(r.userEmail).toLowerCase() === em && v3Date(r.mealDate) === y; });
  return { success: true, data: { prompt: done ? null : { date: y, dish: String(o.mealChoice), orderId: o.id } } };
}
function rateDinner(p) {
  var u = v3Requester(p), em = String(u.email || '').toLowerCase();
  if (!em) return { success: false, error: 'Sign in first' };
  var rating = String(p.rating) === 'down' ? 'down' : (String(p.rating) === 'up' ? 'up' : '');
  if (!rating) return { success: false, error: 'Pick 👍 or 👎' };
  var y = v3Date(p.date) || r38Yesterday();
  if (y !== r38Yesterday() && y !== fijiDateString(addFijiDays(getFijiNow(), -2))) return { success: false, error: 'You can rate last night’s dinner only' };
  var o = sheetToObjects('Dinner Orders').filter(function (x) { return String(x.userEmail).toLowerCase() === em && v3Date(x.serviceDate) === y && !/cancel|declin|reject/i.test(String(x.status)); })[0];
  if (!o) return { success: false, error: 'No dinner order found for that night' };
  var prev = r38RatingRows().filter(function (r) { return String(r.userEmail).toLowerCase() === em && v3Date(r.mealDate) === y; })[0];
  if (prev) return { success: true, data: { already: true, rating: prev.rating } };
  var comment = v3Clean(p.comment || '', 300);
  var row = { id: uid('cf'), userEmail: em, userName: v3Name(u), department: u.department || '', kind: 'rating',
    message: (rating === 'up' ? '👍' : '👎') + (comment ? ' ' + comment : ''), status: comment ? 'new' : 'done', chefNote: '', createdAt: nowIso(),
    handledBy: '', handledAt: '', meal: 'dinner', mealDate: "'" + y, dish: String(o.mealChoice || ''), rating: rating };
  v3Append('Chef Feedback', row, V3_SHEETS['Chef Feedback'].concat(['dish', 'rating']));
  return { success: true, data: { rating: rating, dish: row.dish, date: y } };
}
function getDishRatings(p) {
  var u = v3Requester(p);
  if (!(isChefPerm(u) || isAdminPerm(u))) return { success: false, error: 'Chef / admin only' };
  var days = Math.min(Math.max(Number(p.days) || 30, 1), 180), from = fijiDateString(addFijiDays(getFijiNow(), -days));
  var by = {};
  r38RatingRows().forEach(function (r) {
    var d = v3Date(r.mealDate); if (!d || d < from) return;
    var k = String(r.dish || '').trim() || '(dish not recorded)';
    var o = by[k] = by[k] || { dish: k, up: 0, down: 0, comments: [], last: '' };
    if (String(r.rating) === 'down') o.down++; else o.up++;
    if (d > o.last) o.last = d;
    var c = String(r.message || '').replace(/^(👍|👎)\s*/, '');
    if (c) o.comments.push({ date: d, rating: String(r.rating), text: c, by: String(r.userName || '') });
  });
  var list = Object.keys(by).map(function (k) { var o = by[k]; o.total = o.up + o.down; o.pct = o.total ? Math.round(100 * o.up / o.total) : 0;
    o.comments.sort(function (a, b) { return b.date.localeCompare(a.date); }); o.comments = o.comments.slice(0, 5); return o; });
  list.sort(function (a, b) { return b.total - a.total || a.dish.localeCompare(b.dish); });
  return { success: true, data: { days: days, from: from, dishes: list, ratings: list.reduce(function (s, o) { return s + o.total; }, 0) } };
}

/* ---------- boat manifest (all runs for one day) ---------- */
function getBoatManifestDay(p) {
  var u = v3Requester(p);
  if (!(isBoatCaptainPerm(u) || isAdminPerm(u))) return { success: false, error: 'Boat manager / admin only' };
  var date = v3Date(p.date) || v3Today();
  var users = {}; sheetToObjects('Users').forEach(function (x) { users[String(x.email).toLowerCase()] = x; });
  var dep = function (em, fb) { var x = users[String(em || '').toLowerCase()]; return (x && x.department) || fb || ''; };
  var runs = [];
  try {
    r33Ensure();
    var rr = r33Rows().filter(function (x) { return v3Date(x.date) === date && String(x.status) !== 'cancelled'; });
    [['AM', 'to_resort'], ['AM', 'to_naisoso'], ['PM', 'to_resort'], ['PM', 'to_naisoso']].forEach(function (k) {
      var t = R33_TIMES[k[0] + '|' + k[1]] || {};
      var from = k[1] === 'to_resort' ? 'Naisoso Marina' : 'Resort', to = k[1] === 'to_resort' ? 'Resort' : 'Naisoso Marina';
      var pax = rr.filter(function (x) { return String(x.run) === k[0] && String(x.direction) === k[1]; }).map(function (x) {
        return { name: String(x.userName || x.userEmail), department: x.department || dep(x.userEmail), from: from, to: to, seats: Number(x.pax || 1), status: String(x.status) };
      });
      runs.push({ key: 'pce-' + k[0] + '-' + k[1], kind: 'pce', title: 'PCE ' + k[0] + ' · ' + from + ' → ' + to, time: t.departs || '', passengers: pax });
    });
  } catch (e) {}
  var bk = sheetToObjects('Boat Bookings');
  cachedRows('Boat Runs').filter(function (r) { return v3Date(r.date) === date && String(r.active) !== 'false' && String(r.active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); }).forEach(function (r) {
      var parts = String(r.route || '').split(/\s*(?:→|->)\s*/), from = parts[0] || '', to = parts[1] || '';
      var pax = bk.filter(function (b) { return String(b.runId) === String(r.id) && !/cancel/i.test(String(b.status)); }).map(function (b) {
        return { name: String(b.userName || b.userEmail), department: dep(b.userEmail), from: from, to: to, seats: Number(b.seats || 1), status: String(b.status || 'booked') };
      });
      runs.push({ key: 'village-' + r.id, kind: 'village', title: 'Village boat · ' + (r.route || ''), time: r34Time(r.time) || String(r.time), capacity: Number(r.capacity) || 0, passengers: pax });
    });
  runs.forEach(function (r) { r.passengers.sort(function (a, b) { return a.name.localeCompare(b.name); }); r.seats = r.passengers.reduce(function (s, x) { return s + (x.seats || 1); }, 0); });
  return { success: true, data: { date: date, runs: runs } };
}

/* ---------- HOD dashboard ---------- */
function getHodDashboard(p) {
  var u = v3Requester(p);
  var admin = isAdminPerm(u) || isSuperPerm(u);
  if (!admin && !isDeptLead(u)) return { success: false, error: 'HOD / assistant HOD / admin only' };
  var dept = admin ? String(p.department || u.department || '').trim() : String(u.department || '').trim();
  if (!dept) return { success: false, error: 'Pick a department' };
  var today = v3Today(), tom = fijiDateString(addFijiDays(getFijiNow(), 1));
  var team = sheetToObjects('Users').filter(function (x) { return truthy(x.active) && normDept(x.department) === normDept(dept) && String(x.email).indexOf('@') > 0 && !/^merged\./.test(String(x.email)); });
  var teamBy = {}; team.forEach(function (x) { teamBy[String(x.email).toLowerCase()] = x; });
  var nm = function (x) { return v3Name(x) || x.email; };
  // roster
  var shifts = { today: [], tomorrow: [] };
  try {
    var active = r34ActiveIds();
    sheetToObjects(R34.SHIFTS).forEach(function (s) {
      if (!active[String(s.uploadId)]) return;
      var d = String(s.date).replace(/^'/, '').slice(0, 10); if (d !== today && d !== tom) return;
      var em = String(s.userEmail || '').toLowerCase();
      if (!(teamBy[em] || normDept(s.department) === normDept(dept))) return;
      var off = truthy(s.dayOff) || String(s.leaveType || '').trim();
      (d === today ? shifts.today : shifts.tomorrow).push({ name: String(s.userName || em), start: r34Time(s.start) || '', end: r34Time(s.end) || '', off: !!off, note: off ? (String(s.leaveType || '') || 'Day off') : String(s.roleLabel || '') });
    });
    ['today', 'tomorrow'].forEach(function (k) { shifts[k].sort(function (a, b) { return (a.off - b.off) || String(a.start).localeCompare(String(b.start)) || a.name.localeCompare(b.name); }); });
  } catch (e) {}
  // dinner tomorrow
  var ordered = {};
  sheetToObjects('Dinner Orders').forEach(function (o) { if (v3Date(o.serviceDate) === tom && !/cancel|declin|reject/i.test(String(o.status))) ordered[String(o.userEmail).toLowerCase()] = String(o.mealChoice || ''); });
  var dinner = { date: tom, ordered: [], notOrdered: [] };
  team.forEach(function (x) { var em = String(x.email).toLowerCase(); if (ordered[em] !== undefined) dinner.ordered.push({ name: nm(x), dish: ordered[em] }); else dinner.notOrdered.push({ name: nm(x) }); });
  dinner.ordered.sort(function (a, b) { return a.name.localeCompare(b.name); }); dinner.notOrdered.sort(function (a, b) { return a.name.localeCompare(b.name); });
  // pending leave + approvals
  var leave = sheetToObjects('Leave Requests').filter(function (l) { var st = String(l.status); return normDept(l.department) === normDept(dept) && (st === 'pending' || st === 'pending_hod' || st === 'pending_manager'); })
    .map(function (l) { return { id: l.id, name: String(l.userName || l.userEmail), from: v3Date(l.startDate), to: v3Date(l.endDate || l.startDate), status: String(l.status) === 'pending' ? 'pending_hod' : String(l.status), reason: String(l.reason || '').slice(0, 80) }; });
  var resortPending = 0, moves = { today: [], tomorrow: [] };
  try {
    r33Ensure();
    r33Rows().forEach(function (x) {
      if (normDept(x.department) !== normDept(dept)) return;
      if (String(x.status) === 'pending_hod') resortPending++;
      var d = v3Date(x.date); if ((d !== today && d !== tom) || String(x.status) === 'cancelled' || /reject/.test(String(x.status))) return;
      (d === today ? moves.today : moves.tomorrow).push({ name: String(x.userName || x.userEmail), boat: 'PCE ' + x.run, route: R33_DIRECTIONS[x.direction] || x.direction, status: String(x.status) });
    });
  } catch (e2) {}
  var runs = {}; cachedRows('Boat Runs').forEach(function (r) { var d = v3Date(r.date); if (d === today || d === tom) runs[String(r.id)] = r; });
  sheetToObjects('Boat Bookings').forEach(function (b) {
    var r = runs[String(b.runId)], em = String(b.userEmail).toLowerCase(); if (!r || !teamBy[em] || /cancel/i.test(String(b.status))) return;
    (v3Date(r.date) === today ? moves.today : moves.tomorrow).push({ name: nm(teamBy[em]), boat: 'Village ' + (r34Time(r.time) || String(r.time)), route: String(r.route || ''), status: String(b.status || 'booked') });
  });
  return { success: true, data: { department: dept, today: today, tomorrow: tom, teamSize: team.length, shifts: shifts, dinner: dinner, leave: leave,
    approvals: { leave: leave.filter(function (l) { return l.status === (admin ? 'pending_manager' : 'pending_hod') || (admin && l.status === 'pending_hod'); }).length, resortBoat: resortPending }, moves: moves, isAdmin: admin } };
}

function routeOps38(action, p) {
  var map = {
    getDinnerRatingPrompt: getDinnerRatingPrompt,
    rateDinner: function (q) { return withIdempotency('rateDinner', q, rateDinner); },
    getDishRatings: getDishRatings, getBoatManifestDay: getBoatManifestDay, getHodDashboard: getHodDashboard
  };
  return map[action] ? map[action](p) : null;
}
