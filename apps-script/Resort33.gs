/* PCR Staff App 3.3.0 — Resort boat (Paradise Cove Express, PCE): Naisoso Marina <-> resort, AM and PM runs.
 * Staff request a seat → HOD / assistant HOD of their department approves (same rule as leave) → admin or boat
 * manager confirms (staff added to that run's manifest). Rejected at either step with an optional reason; staff can
 * cancel while pending. "Day off" creates a linked return request in the opposite direction (each leg is its own row
 * and is decided on its own; the approve / confirm screens offer "both legs" in one tap when both wait at the same step).
 * Sheet "Resort Boat Bookings" is created (and new columns added) on first use, so live needs no manual setup.
 * Shared by the Apps Script server and the ?demo=1 mode (tools/build-demo-server.js). */

var R33_SHEET = 'Resort Boat Bookings';
var R33_HEADERS = ['id', 'groupId', 'linkedId', 'leg', 'userEmail', 'userName', 'department', 'direction', 'date', 'run', 'pax',
  'purpose', 'reason', 'status', 'hodStatus', 'hodBy', 'hodAt', 'hodNote', 'adminStatus', 'adminBy', 'adminAt', 'adminNote',
  'cancelledAt', 'cancelledBy', 'createdAt', 'updatedAt'];
var R33_DIRECTIONS = { to_naisoso: 'Resort → Naisoso', to_resort: 'Naisoso → Resort' };
var R33_RUNS = ['AM', 'PM'];
var R33_MAX_PAX = 20, R33_MAX_DAYS = 90;
/** Timetable shown in the app (Fiji time). cut = minutes after midnight when same-day requests stop. */
var R33_TIMES = {
  'AM|to_resort': { departs: '9:00am', from: 'Naisoso Marina', reportBy: 'At Naisoso Marina before 8:15am', arrives: 'Arrives at the resort around 10:00am', cut: 8 * 60 + 15 },
  'AM|to_naisoso': { departs: '10:20–10:30am', from: 'the resort', reportBy: 'Departs the resort around 10:20–10:30am', arrives: 'Arrives at Naisoso about 1 hour after departure', cut: 10 * 60 + 20 },
  'PM|to_resort': { departs: '2:00pm', from: 'Naisoso Marina', reportBy: 'At Naisoso Marina before 1:00pm', arrives: 'Arrives at the resort by 3:00pm', cut: 13 * 60 },
  'PM|to_naisoso': { departs: '3:30pm', from: 'the resort', reportBy: 'At the Dive Shop by 2:30pm', arrives: 'Departs the resort around 3:30pm', cut: 14 * 60 + 30 }
};
var R33_ACTIVE = { pending_hod: 1, pending_admin: 1, confirmed: 1 };

function r33Ensure() {
  var c = null;
  try { c = CacheService.getScriptCache(); if (c.get('pcr_r33_schema_1') === '1') return; } catch (e) {}
  ensureSheet(getSS(), R33_SHEET, R33_HEADERS);
  try { if (c) c.put('pcr_r33_schema_1', '1', 21600); } catch (e2) {}
}
function r33Rows() { return sheetToObjects(R33_SHEET); }
function r33Find(id) { var s = String(id || ''); return r33Rows().filter(function (x) { return String(x.id) === s; })[0] || null; }
function r33Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function r33Label(row) { return (R33_DIRECTIONS[row.direction] || row.direction) + ' · ' + v3Date(row.date) + ' ' + row.run + ' run'; }
function r33Out(row, me, extra) {
  var t = R33_TIMES[row.run + '|' + row.direction] || {};
  var o = {
    id: row.id, groupId: row.groupId || '', linkedId: row.linkedId || '', leg: row.leg || 'single',
    userEmail: row.userEmail, userName: row.userName, department: row.department || '',
    direction: row.direction, directionLabel: R33_DIRECTIONS[row.direction] || row.direction, date: v3Date(row.date), run: row.run,
    pax: Number(row.pax || 1), purpose: row.purpose, purposeLabel: row.purpose === 'day_off' ? 'Day off' : 'Other reason', reason: row.reason || '',
    status: row.status, hodStatus: row.hodStatus || '', hodBy: row.hodBy || '', hodAt: row.hodAt || '', hodNote: row.hodNote || '',
    adminStatus: row.adminStatus || '', adminBy: row.adminBy || '', adminAt: row.adminAt || '', adminNote: row.adminNote || '',
    cancelledAt: row.cancelledAt || '', createdAt: row.createdAt || '', departs: t.departs || '', reportBy: t.reportBy || '', arrives: t.arrives || ''
  };
  if (me) o.mine = r33Lower(row.userEmail) === r33Lower(me.email);
  return extra ? Object.assign(o, extra) : o;
}
/** Boat managers + admins (they confirm). */
function r33Confirmers() {
  return sheetToObjects('Users').filter(function (u) {
    if (!truthy(u.active)) return false;
    var p = userPermissions(u);
    return p.indexOf('boat_manager') >= 0 || p.indexOf('boat') >= 0 || isAdminPerm(u);
  });
}
function r33NotifyAll(users, title, body, kind, id, except) {
  var seen = {}; var ex = r33Lower(except);
  (users || []).forEach(function (u) { var em = r33Lower(u.email); if (!em || em === ex || seen[em]) return; seen[em] = 1; v3Notify(em, title, body, kind, id); });
}
function r33NoLead(row) {
  return !deptLeads(row.department).some(function (x) { return r33Lower(x.email) !== r33Lower(row.userEmail); });
}
/** HOD step: the HOD / assistant HOD of that department; an admin only when the department has no other lead. */
function r33CanHod(r, row) {
  if (!r || r33Lower(r.email) === r33Lower(row.userEmail)) return false;
  return v3IsLeadOf(r, row.department) || (isAdminPerm(r) && (r33NoLead(row) || (typeof A341_BEHALF !== 'undefined' && A341_BEHALF))); // 3.4.1: admin on behalf of HOD
}
function r33CanConfirm(r, row) {
  if (!r || r33Lower(r.email) === r33Lower(row.userEmail)) return false;
  return isBoatManagerPerm(r);
}
function r33MinsNow() { var n = getFijiNow(); return n.getUTCHours() * 60 + n.getUTCMinutes(); }
function r33CheckLeg(date, run, direction) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick the date of travel';
  if (R33_RUNS.indexOf(run) < 0) return 'Pick the AM or PM run';
  if (!R33_DIRECTIONS[direction]) return 'Pick the direction';
  var today = v3Today(), last = fijiDateString(addFijiDays(getFijiNow(), R33_MAX_DAYS));
  if (date < today) return 'The date ' + date + ' is in the past';
  if (date > last) return 'Requests can be made up to ' + R33_MAX_DAYS + ' days ahead';
  var t = R33_TIMES[run + '|' + direction];
  if (date === today && t && r33MinsNow() >= t.cut) return 'Too late for today\'s ' + run + ' run (' + t.reportBy.replace(/^At /, 'at ') + ') — pick a later run';
  return '';
}
function r33Dup(email, date, run, direction) {
  return r33Rows().some(function (x) {
    return r33Lower(x.userEmail) === email && v3Date(x.date) === date && String(x.run) === run && String(x.direction) === direction && R33_ACTIVE[String(x.status)];
  });
}

/* ---------- staff: request / cancel / list ---------- */
function requestResortBoat(p) {
  var u = v3Requester(p);
  var direction = String(p.direction || ''), date = v3Date(p.date), run = String(p.run || '').toUpperCase();
  var pax = Math.floor(Number(p.pax || 1));
  var purpose = String(p.purpose || '') === 'day_off' ? 'day_off' : (String(p.purpose || '') === 'other' ? 'other' : '');
  if (!purpose) return { success: false, error: 'Pick the travel purpose' };
  var err = r33CheckLeg(date, run, direction);
  if (err) return { success: false, error: err };
  if (!(pax >= 1 && pax <= R33_MAX_PAX)) return { success: false, error: 'Number of pax must be 1 to ' + R33_MAX_PAX };
  var reason = v3Clean(p.reason, 300);
  if (purpose === 'other' && reason.length < 3) return { success: false, error: 'Please write the reason for travel' };
  var back = null;
  if (purpose === 'day_off') {
    var rDate = v3Date(p.returnDate), rRun = String(p.returnRun || '').toUpperCase();
    var rDir = direction === 'to_naisoso' ? 'to_resort' : 'to_naisoso';
    if (!rDate) return { success: false, error: 'Pick the return date' };
    var e2 = r33CheckLeg(rDate, rRun, rDir);
    if (e2) return { success: false, error: 'Return: ' + e2 };
    if (rDate < date) return { success: false, error: 'The return date is before the travel date' };
    if (rDate === date && !(run === 'AM' && rRun === 'PM')) return { success: false, error: 'Same-day return: go on the AM run and come back on the PM run' };
    back = { date: rDate, run: rRun, direction: rDir };
  }
  var email = r33Lower(u.email);
  if (r33Dup(email, date, run, direction)) return { success: false, error: 'You already have a request for ' + date + ' ' + run + ' (' + R33_DIRECTIONS[direction] + ')' };
  if (back && r33Dup(email, back.date, back.run, back.direction)) return { success: false, error: 'You already have a request for the return ' + back.date + ' ' + back.run };
  r33Ensure();
  var lead = v3HasHod(u) || isAdminPerm(u); // HODs / admins go straight to the confirm step (nobody approves their own)
  var now = nowIso(), gid = uid('rbg');
  var base = { groupId: gid, userEmail: email, userName: v3Name(u), department: u.department || '', pax: pax, purpose: purpose,
    reason: purpose === 'day_off' ? (reason || 'Day off') : reason, status: lead ? 'pending_admin' : 'pending_hod', hodStatus: lead ? 'skipped' : 'pending',
    hodBy: '', hodAt: '', hodNote: '', adminStatus: 'pending', adminBy: '', adminAt: '', adminNote: '', cancelledAt: '', cancelledBy: '', createdAt: now, updatedAt: now };
  var out = Object.assign({ id: uid('rb'), leg: back ? 'outbound' : 'single', direction: direction, date: date, run: run, linkedId: '' }, base);
  var ret = null;
  if (back) {
    ret = Object.assign({ id: uid('rb'), leg: 'return', direction: back.direction, date: back.date, run: back.run, linkedId: out.id }, base);
    out.linkedId = ret.id;
  }
  appendRow(R33_SHEET, out, R33_HEADERS);
  if (ret) appendRow(R33_SHEET, ret, R33_HEADERS);
  var what = r33Label(out) + (ret ? ' · return ' + r33Label(ret) : '') + ' · ' + pax + ' pax · ' + (purpose === 'day_off' ? 'Day off' : reason);
  v3Notify(email, 'Resort boat request sent', what + (lead ? ' — waiting for admin / boat manager' : ' — waiting for your HOD'), 'resort_boat', out.id);
  if (lead) r33NotifyAll(r33Confirmers(), 'Resort boat to confirm: ' + out.userName, what, 'resort_boat_admin', out.id, email);
  else {
    var leads = deptLeads(u.department).filter(function (x) { return r33Lower(x.email) !== email; });
    r33NotifyAll(leads.length ? leads : adminUsers(), 'Resort boat request: ' + out.userName, what, 'resort_boat_hod', out.id, email);
  }
  var list = [r33Out(out, u)]; if (ret) list.push(r33Out(ret, u));
  return { success: true, data: { requests: list } };
}
function cancelResortBoat(p) {
  var u = v3Requester(p);
  var row = r33Find(p.id);
  if (!row) return { success: false, error: 'Request not found' };
  if (r33Lower(row.userEmail) !== r33Lower(u.email)) return { success: false, error: 'You can only cancel your own request' };
  var targets = [row];
  if ((p.both === true || p.both === 'true') && row.linkedId) { var l = r33Find(row.linkedId); if (l) targets.push(l); }
  var done = [], now = nowIso();
  targets.forEach(function (x, i) {
    var st = String(x.status);
    if (st !== 'pending_hod' && st !== 'pending_admin') { if (i === 0) done.push({ error: 'Only pending requests can be cancelled (this one is ' + st + ')' }); return; }
    updateRowById(R33_SHEET, x.id, { status: 'cancelled', cancelledAt: now, cancelledBy: r33Lower(u.email), updatedAt: now });
    done.push(r33Out(Object.assign({}, x, { status: 'cancelled', cancelledAt: now }), u));
    // tell whoever was going to decide it
    var to = st === 'pending_hod' ? deptLeads(x.department) : r33Confirmers();
    r33NotifyAll(to, 'Resort boat request cancelled: ' + x.userName, r33Label(x), st === 'pending_hod' ? 'resort_boat_hod' : 'resort_boat_admin', x.id + 'c', u.email);
  });
  if (done[0] && done[0].error) return { success: false, error: done[0].error };
  return { success: true, data: { cancelled: done } };
}
/** scope: mine | hod (department leads; admins see all departments) | admin (boat manager / admin) */
function getResortBoat(p) {
  var u = v3Requester(p);
  var scope = String(p.scope || 'mine'), me = r33Lower(u.email);
  var from = fijiDateString(addFijiDays(getFijiNow(), -Number(p.days || 14)));
  var rows = r33Rows();
  var out = [];
  if (scope === 'mine') {
    out = rows.filter(function (x) { return r33Lower(x.userEmail) === me && (v3Date(x.date) >= from || R33_ACTIVE[String(x.status)]); }).map(function (x) { return r33Out(x, u); });
  } else if (scope === 'hod') {
    if (!isDeptLead(u) && !isAdminPerm(u)) return { success: false, error: 'HOD / assistant HOD / admin only' };
    out = rows.filter(function (x) {
      if (!isAdminPerm(u) && normDept(x.department) !== normDept(u.department)) return false;
      if (r33Lower(x.userEmail) === me) return false;
      return String(x.status) === 'pending_hod' || (v3Date(x.date) >= from && String(x.hodStatus) !== 'pending' && String(x.hodStatus) !== 'skipped');
    }).map(function (x) { return r33Out(x, u, { canDecide: String(x.status) === 'pending_hod' && r33CanHod(u, x) }); });
  } else if (scope === 'admin') {
    if (!isBoatCaptainPerm(u)) return { success: false, error: 'Boat manager / admin only' };
    out = rows.filter(function (x) {
      var st = String(x.status);
      return st === 'pending_admin' || (v3Date(x.date) >= from && (st === 'confirmed' || (st === 'rejected' && x.adminBy)));
    }).map(function (x) { return r33Out(x, u, { canDecide: String(x.status) === 'pending_admin' && r33CanConfirm(u, x) }); });
  } else return { success: false, error: 'Unknown scope' };
  out.sort(function (a, b) { return (a.date + a.run + a.createdAt).localeCompare(b.date + b.run + b.createdAt); });
  var counts = { hod: 0, admin: 0 };
  rows.forEach(function (x) {
    if (String(x.status) === 'pending_hod' && r33CanHod(u, x)) counts.hod++;
    if (String(x.status) === 'pending_admin' && r33CanConfirm(u, x)) counts.admin++;
  });
  return { success: true, data: { scope: scope, requests: out, counts: counts, times: r33TimesOut() } };
}
function r33TimesOut() {
  return Object.keys(R33_TIMES).map(function (k) { var t = R33_TIMES[k], q = k.split('|'); return { run: q[0], direction: q[1], directionLabel: R33_DIRECTIONS[q[1]], departs: t.departs, from: t.from, reportBy: t.reportBy, arrives: t.arrives }; });
}

/* ---------- HOD step ---------- */
function r33Decide(p, step) {
  var r = v3Requester(p);
  var row = r33Find(p.id);
  if (!row) return { success: false, error: 'Request not found' };
  var d = String(p.decision || '').toLowerCase();
  var approve = step === 'hod' ? /^(approve|approved|forward)$/.test(d) : /^(confirm|confirmed|approve|approved)$/.test(d);
  if (!approve && !/^(reject|rejected|decline|declined)$/.test(d)) return { success: false, error: 'decision must be ' + (step === 'hod' ? 'approve' : 'confirm') + ' or reject' };
  var want = step === 'hod' ? 'pending_hod' : 'pending_admin';
  var targets = [row];
  if ((p.both === true || p.both === 'true') && row.linkedId) { var l = r33Find(row.linkedId); if (l && String(l.status) === want) targets.push(l); }
  var note = v3Clean(p.note, 300), now = nowIso(), done = [];
  for (var i = 0; i < targets.length; i++) {
    var x = targets[i];
    if (String(x.status) !== want) return { success: false, error: 'This request is ' + String(x.status).replace('_', ' ') + ' — nothing to ' + (step === 'hod' ? 'approve' : 'confirm') };
    if (r33Lower(x.userEmail) === r33Lower(r.email)) return { success: false, error: 'You cannot decide your own request' };
    if (step === 'hod' && !r33CanHod(r, x)) return { success: false, error: 'Waiting for the HOD / assistant HOD of ' + (x.department || 'the department') + ' (HODs only decide their own department)' };
    if (step === 'admin' && !r33CanConfirm(r, x)) return { success: false, error: 'Only a boat manager or admin can confirm' };
  }
  targets.forEach(function (x) {
    var patch;
    if (step === 'hod') {
      var n2 = note; if (!v3IsLeadOf(r, x.department)) n2 = (n2 ? n2 + ' ' : '') + (!r33NoLead(x) ? '(' + (approve ? 'approved' : 'declined') + ' by admin on behalf of HOD)' : '(department has no HOD — decided by admin)');
      patch = { status: approve ? 'pending_admin' : 'rejected', hodStatus: approve ? 'approved' : 'declined', hodBy: r33Lower(r.email), hodAt: now, hodNote: n2, updatedAt: now };
    } else {
      patch = { status: approve ? 'confirmed' : 'rejected', adminStatus: approve ? 'confirmed' : 'declined', adminBy: r33Lower(r.email), adminAt: now, adminNote: note, updatedAt: now };
    }
    updateRowById(R33_SHEET, x.id, patch);
    done.push(Object.assign({}, x, patch));
  });
  var first = done[0], legs = done.map(r33Label).join(' + ');
  var who = v3Name(r);
  if (step === 'hod') {
    v3Notify(first.userEmail, approve ? 'Resort boat: HOD approved' : 'Resort boat request declined',
      legs + (approve ? ' — approved by ' + who + ', sent to admin / boat manager to confirm' : ' — declined by ' + who) + (note ? ' — ' + note : ''), 'resort_boat', first.id + (approve ? 'h' : 'x'));
    if (approve) r33NotifyAll(r33Confirmers(), 'Resort boat to confirm: ' + first.userName, legs + ' · ' + first.pax + ' pax · HOD ' + who, 'resort_boat_admin', first.id, r.email);
  } else {
    v3Notify(first.userEmail, approve ? 'Resort boat confirmed' : 'Resort boat request declined',
      legs + (approve ? ' — you are on the manifest. ' + (R33_TIMES[first.run + '|' + first.direction] || {}).reportBy : ' — declined by ' + who) + (note ? ' — ' + note : ''), 'resort_boat', first.id + (approve ? 'a' : 'x'));
    if (first.hodBy && r33Lower(first.hodBy) !== r33Lower(r.email)) v3Notify(first.hodBy, 'Resort boat ' + (approve ? 'confirmed' : 'declined') + ': ' + first.userName, legs, 'resort_boat_hod', first.id + 'f');
  }
  return { success: true, data: { requests: done.map(function (x) { return r33Out(x, r); }) } };
}
function hodDecideResortBoat(p) { return r33Decide(p, 'hod'); }
function confirmResortBoat(p) { return r33Decide(p, 'admin'); }

/* ---------- manifest (per date · run · direction) ---------- */
function getResortBoatManifest(p) {
  var u = v3Requester(p);
  if (!isBoatCaptainPerm(u)) return { success: false, error: 'Boat manager / captain / admin only' };
  var date = v3Date(p.date) || v3Today();
  var rows = r33Rows().filter(function (x) { return v3Date(x.date) === date; });
  var runs = [['AM', 'to_resort'], ['AM', 'to_naisoso'], ['PM', 'to_resort'], ['PM', 'to_naisoso']].map(function (k) {
    var t = R33_TIMES[k[0] + '|' + k[1]];
    var mine = rows.filter(function (x) { return String(x.run) === k[0] && String(x.direction) === k[1]; });
    var conf = mine.filter(function (x) { return String(x.status) === 'confirmed'; }).map(function (x) { return r33Out(x, u); })
      .sort(function (a, b) { return String(a.userName).localeCompare(String(b.userName)); });
    return { run: k[0], direction: k[1], directionLabel: R33_DIRECTIONS[k[1]], departs: t.departs, from: t.from, reportBy: t.reportBy, arrives: t.arrives,
      passengers: conf, pax: conf.reduce(function (s, x) { return s + Number(x.pax || 1); }, 0),
      waiting: mine.filter(function (x) { return String(x.status) === 'pending_admin' || String(x.status) === 'pending_hod'; }).length };
  });
  return { success: true, data: { date: date, runs: runs } };
}

function routeResort33(action, p) {
  var map = {
    requestResortBoat: function (q) { return withIdempotency('requestResortBoat', q, requestResortBoat); },
    cancelResortBoat: cancelResortBoat, getResortBoat: getResortBoat, hodDecideResortBoat: hodDecideResortBoat,
    confirmResortBoat: confirmResortBoat, getResortBoatManifest: getResortBoatManifest
  };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return v3Err(e); }
}
/** Badges for Home / More: requests this user can decide now. */
function r33Counts(u) {
  var lead = isDeptLead(u) || isAdminPerm(u), conf = isBoatManagerPerm(u);
  if (!lead && !conf) return { hod: 0, admin: 0 };
  var out = { hod: 0, admin: 0 };
  r33Rows().forEach(function (x) {
    if (lead && String(x.status) === 'pending_hod' && r33CanHod(u, x)) out.hod++;
    if (conf && String(x.status) === 'pending_admin' && r33CanConfirm(u, x)) out.admin++;
  });
  return out;
}
