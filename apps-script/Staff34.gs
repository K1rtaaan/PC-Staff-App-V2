/**
 * 3.4.0 (Pranav, TEST first): schedule access by employee code, link requests, department staff page,
 * HOD/admin staff registration with a one-time password, island estimate + meal blocking on leave,
 * special meal requests. Routed from routeRoster34 (Roster34.gs).
 */
var S34 = { LINK: 'Roster Link Requests', SPECIAL: 'Special Meal Requests' };
var S34_LINK_HEADERS = ['id', 'userEmail', 'userName', 'department', 'type', 'code', 'status', 'decidedBy', 'decidedAt', 'note', 'createdAt'];
var S34_SPECIAL_HEADERS = ['id', 'userEmail', 'userName', 'department', 'serviceDate', 'meal', 'reason', 'status', 'decidedBy', 'decidedAt', 'createdAt'];
/** Off-island leave types (Pranav 2 Oct 2026): leave only — not days off, sick, PH, training, SDD or ON. */
var S34_OFF_ISLAND_DEFAULT = ['Annual leave', 'Unpaid leave', 'Maternity / Paternity', 'Family / Bereavement'];
var S34_MEAL_BLOCK_DEFAULT = 'false'; // live default; the TEST builder turns it on
var S34_MEALS = { breakfast: 'Breakfast Orders', lunch: 'Lunch Orders', dinner: 'Dinner Orders' };

function s34Ensure() {
  var c = null;
  try { c = CacheService.getScriptCache(); if (c.get('pcr_s34_schema_1') === '1') return; } catch (e) {}
  var ss = getSS();
  ensureSheet(ss, S34.LINK, S34_LINK_HEADERS);
  ensureSheet(ss, S34.SPECIAL, S34_SPECIAL_HEADERS);
  try { var ush = ss.getSheetByName('Users'); if (ush) { ensureColumns(ush, ['employeeCode', 'mustChangePassword', 'tempPasswordAt']); scInvalidateSheet('Users'); } } catch (e1) {}
  var have = {};
  sheetToObjects('App Settings').forEach(function (r) { have[String(r.key)] = 1; });
  if (!have.meal_roster_block) setSetting('meal_roster_block', S34_MEAL_BLOCK_DEFAULT, 'system 3.4.0');
  if (!have.meal_off_island_leave) setSetting('meal_off_island_leave', JSON.stringify(S34_OFF_ISLAND_DEFAULT), 'system 3.4.0');
  if (!have.schedule_link_required) setSetting('schedule_link_required', 'true', 'system 3.4.0');
  try { if (c) c.put('pcr_s34_schema_1', '1', 21600); } catch (e2) {}
}
function s34Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function s34LinkRequired() { return String(getSetting('schedule_link_required', 'true')) !== 'false'; }
function s34Linked(u) { return !!(u && r34EmpCode(u.employeeCode)); }
function s34CanLead(me, dept) { return isAdminPerm(me) || (isDeptLead(me) && dept && r34DeptEq(me.department, dept)); }
function s34Name(u) { return r34UserName(u); }
/** HODs of the department + admins (no duplicates, not the actor). */
function s34Approvers(dept, exceptEmail) {
  var seen = {}, out = [];
  deptLeads(dept).concat(adminUsers()).forEach(function (u) {
    var em = s34Lower(u.email);
    if (!em || seen[em] || em === s34Lower(exceptEmail) || isSuperPerm(u)) return;
    seen[em] = 1; out.push(em);
  });
  return out;
}
function s34NotifyAll(emails, title, body, kind, rel) {
  var at = nowIso();
  r3NotifyMany(emails.map(function (em) { return { id: uid('ntf'), userEmail: em, title: title, body: body, kind: kind, relatedId: rel || '', read: false, createdAt: at }; }));
}
function s34Log(me, area, action, target, summary) {
  try { a31WriteLog({ actorEmail: s34Lower(me.email), actorName: displayUserName(me) || me.email, actorRole: a31RoleOf(me), actorDept: me.department || '', area: area, action: action,
    target: String(target || '').substring(0, 200), summary: String(summary || '').substring(0, 500), bySuper: isSuperPerm(me) ? 'TRUE' : 'FALSE', revertable: 'FALSE', noRevertReason: 'Change it again from the app.' }); } catch (e) {}
}
function s34CodeFree(code, email) {
  return !sheetToObjects('Users').some(function (x) { return r34EmpCode(x.employeeCode) === code && s34Lower(x.email) !== s34Lower(email); });
}

/* ---------- 2) schedule access: link requests ---------- */
function s34MyLinkRequest(email) {
  var l = sheetToObjects(S34.LINK).filter(function (r) { return s34Lower(r.userEmail) === s34Lower(email); })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0];
  return l ? { id: l.id, type: l.type, code: l.code, status: l.status, createdAt: l.createdAt, decidedAt: l.decidedAt, note: l.note } : null;
}
function s34LockedOut(me) {
  return { locked: true, department: me.department || '', linkRequest: s34MyLinkRequest(me.email), fijiNow: formatFiji(getFijiNow()) };
}
/** staff: type 'number' (I know my number) or 'unknown' (please find it). One open request per person. */
function requestScheduleLink(p) {
  var me = v3Requester(p);
  if (isSuperPerm(me)) return { success: false, error: A31_SUPER_BLOCK_MSG };
  s34Ensure(); r34Ensure();
  if (s34Linked(me)) return { success: false, error: 'Your schedule is already unlocked' };
  var type = String(p.type) === 'unknown' ? 'unknown' : 'number';
  var code = '';
  if (type === 'number') {
    code = r34EmpCode(p.code);
    if (!code) return { success: false, error: 'An employee number looks like GL018' };
    if (!s34CodeFree(code, me.email)) return { success: false, error: code + ' is already used by another account — ask your HOD' };
  }
  var now = nowIso(), id = uid('rlk');
  var old = sheetToObjects(S34.LINK).filter(function (r) { return s34Lower(r.userEmail) === s34Lower(me.email) && String(r.status) === 'pending'; });
  r34PatchRows(S34.LINK, old.map(function (r) { return { u: r, patch: { status: 'replaced', decidedAt: now } }; }));
  appendRow(S34.LINK, { id: id, userEmail: s34Lower(me.email), userName: s34Name(me), department: me.department || '', type: type, code: code, status: 'pending', decidedBy: '', decidedAt: '', note: String(p.note || '').substring(0, 200), createdAt: now }, S34_LINK_HEADERS);
  var who = s34Name(me) + ' (' + (me.department || 'no department') + ')';
  s34NotifyAll(s34Approvers(me.department, me.email), type === 'number' ? 'Schedule link to approve' : 'Employee number needed',
    type === 'number' ? who + ' entered employee number ' + code + '. Check it and approve (Department staff).' : who + " doesn't know their employee number. Enter it for them (Department staff).", 'roster_link', id);
  s34Log(me, 'dept', 'requestScheduleLink', me.email, (type === 'number' ? 'Asked to link employee number ' + code : 'Asked for their employee number') + ' · ' + (me.department || ''));
  return { success: true, data: { linkRequest: s34MyLinkRequest(me.email) } };
}
/** HOD (own department) / admin: approve (with code) or decline. */
function decideLinkRequest(p) {
  var me = v3Requester(p);
  s34Ensure();
  var r = sheetToObjects(S34.LINK).filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!r) return { success: false, error: 'Request not found' };
  if (String(r.status) !== 'pending') return { success: false, error: 'This request is already ' + r.status };
  if (!s34CanLead(me, r.department)) return { success: false, error: 'HODs decide requests for their own department only' };
  var u = findUserByEmail(r.userEmail);
  if (!u) return { success: false, error: 'Account not found' };
  var now = nowIso();
  if (String(p.decision) === 'decline') {
    updateRowById(S34.LINK, r.id, { status: 'declined', decidedBy: s34Lower(me.email), decidedAt: now, note: String(p.note || '').substring(0, 200) });
    v3Notify(u.email, 'Schedule link not approved', (p.note ? String(p.note).substring(0, 200) + ' ' : '') + 'Check your employee number with your HOD and try again.', 'roster_link', r.id);
    s34Log(me, 'dept', 'decideLinkRequest', u.email, 'Declined the schedule link request of ' + s34Name(u));
    return { success: true, data: { status: 'declined' } };
  }
  var code = r34EmpCode(p.code || r.code);
  if (!code) return { success: false, error: 'Enter the employee number (e.g. GL018)' };
  if (!s34CodeFree(code, u.email)) return { success: false, error: code + ' is already on another account' };
  var linked = s34ApplyLink(me, u, code, p.rosterName, p.rosterDept);
  if (!linked.success) return linked;
  updateRowById(S34.LINK, r.id, { status: 'approved', code: code, decidedBy: s34Lower(me.email), decidedAt: now });
  s34Log(me, 'dept', 'decideLinkRequest', u.email, 'Approved: ' + s34Name(u) + ' = ' + code + (linked.data.rosterName ? ' (roster name ' + linked.data.rosterName + ')' : ''));
  return { success: true, data: { status: 'approved', code: code, rosterName: linked.data.rosterName || '' } };
}
/** saves the code, optionally links a roster-only name, closes open requests, unlocks + notifies. */
function s34ApplyLink(me, u, code, rosterName, rosterDept) {
  r34EnsureCodeCol();
  r34SetCode(u, code, me.email);
  var rn = '';
  if (rosterName && String(rosterName).trim()) {
    var lr = linkRosterName({ requesterEmail: me.email, linkEmail: u.email, rosterName: String(rosterName).trim(), department: String(rosterDept || u.department || '') });
    if (!lr || !lr.success) return lr || { success: false, error: 'Could not link the roster name' };
    rn = lr.data.rosterName;
  }
  var now = nowIso();
  var open = sheetToObjects(S34.LINK).filter(function (x) { return s34Lower(x.userEmail) === s34Lower(u.email) && String(x.status) === 'pending'; });
  r34PatchRows(S34.LINK, open.map(function (x) { return { u: x, patch: { status: 'approved', code: code, decidedBy: s34Lower(me.email), decidedAt: now } }; }));
  v3Notify(u.email, 'Your schedule is unlocked', 'Employee number ' + code + ' is linked to your account. Open Schedule to see your roster.', 'roster_link', code);
  try { scInvalidateSheet('Users'); r34Bump(); } catch (e) {}
  return { success: true, data: { code: code, rosterName: rn } };
}
/** HOD (own department) / admin: set the code (and optionally a roster name) for an account — from the department staff page. */
function setStaffLink(p) {
  var me = v3Requester(p);
  s34Ensure();
  var u = findUserByEmail(s34Lower(p.targetEmail));
  if (!u) return { success: false, error: 'Account not found' };
  if (!s34CanLead(me, u.department)) return { success: false, error: 'HODs link staff of their own department only' };
  var code = r34EmpCode(p.code);
  if (!code) return { success: false, error: 'An employee number looks like GL018' };
  if (!s34CodeFree(code, u.email)) return { success: false, error: code + ' is already on another account' };
  var r = s34ApplyLink(me, u, code, p.rosterName, p.rosterDept);
  if (r.success) s34Log(me, 'dept', 'setStaffLink', u.email, 'Linked ' + s34Name(u) + ' = ' + code + (r.data.rosterName ? ' (roster name ' + r.data.rosterName + ')' : ''));
  return r;
}
function getLinkRequests(p) {
  var me = v3Requester(p);
  s34Ensure();
  var dept = isAdminPerm(me) ? String(p.department || '') : String(me.department || '');
  if (!isAdminPerm(me) && !isDeptLead(me)) return { success: false, error: 'HOD or admin only' };
  var list = sheetToObjects(S34.LINK).filter(function (r) { return String(r.status) === 'pending' && (!dept || r34DeptEq(r.department, dept)); })
    .map(function (r) { return { id: r.id, userEmail: r.userEmail, userName: r.userName, department: r.department, type: r.type, code: r.code, createdAt: r.createdAt }; });
  return { success: true, data: { requests: list } };
}

/* ---------- 3) department staff page ---------- */
/** roster names in the window (today … +13 days): matched e-mails + roster-only (unmatched) names */
function s34RosterPeople(from, to) {
  var uploads = r34Uploads(), active = r34ActiveIds(uploads);
  var idx = r34Index(r34AllRows(false), active, from, to);
  var on = {};
  Object.keys(idx).forEach(function (em) { var d = idx[em]; if (Object.keys(d).some(function (k) { return d[k] && !d[k].none; })) on[em] = 1; });
  var only = {};
  sheetToObjects(R34.UNM).forEach(function (u) {
    if (String(u.status) !== 'open' || !active[String(u.uploadId)] || String(u.kind) === 'archive') return;
    var sh = r34Json(u.shiftsJson, []).filter(function (s) { return s.date >= from && s.date <= to; });
    if (!sh.length) return;
    var k = r34MapKey(u.rawName, u.department);
    if (!only[k]) only[k] = { rosterName: u.rawName, department: u.department || '', shifts: 0, suggestions: r34Json(u.suggestionsJson, []) };
    only[k].shifts += sh.length;
  });
  return { on: on, only: only, idx: idx };
}
function getDeptRosterStaff(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me) && !isDeptLead(me)) return { success: false, error: 'HOD or admin only' };
  s34Ensure(); r34Ensure();
  var dept = isAdminPerm(me) ? String(p.department || '') : String(me.department || '');
  var today = r34Today(), rp = s34RosterPeople(r34Monday(today), r34Add(r34Monday(today), 13));
  var users = sheetToObjects('Users').filter(function (u) { return truthy(u.active) && !isSuperPerm(u) && String(u.email || '').indexOf('@') > 0 && (!dept || r34DeptEq(u.department, dept)); });
  var active = [], pending = [];
  users.forEach(function (u) {
    var em = s34Lower(u.email), o = { email: em, name: s34Name(u), department: u.department || '', code: r34EmpCode(u.employeeCode), onRoster: !!rp.on[em], firstLogin: truthy(u.mustChangePassword) };
    if (o.code && o.onRoster) active.push(o); else pending.push(o);
  });
  var rosterOnly = Object.keys(rp.only).map(function (k) { return rp.only[k]; }).filter(function (r) { return !dept || r34DeptEq(r.department, dept); })
    .sort(function (a, b) { return String(a.department + a.rosterName).localeCompare(String(b.department + b.rosterName)); });
  var reqs = sheetToObjects(S34.LINK).filter(function (r) { return String(r.status) === 'pending' && (!dept || r34DeptEq(r.department, dept)); })
    .map(function (r) { return { id: r.id, userEmail: r.userEmail, userName: r.userName, department: r.department, type: r.type, code: r.code, createdAt: r.createdAt }; });
  var by = function (a, b) { return String(a.name).localeCompare(String(b.name)); };
  return { success: true, data: { department: dept, isAdmin: isAdminPerm(me), departments: r34DeptList(), active: active.sort(by), pending: pending.sort(by), rosterOnly: rosterOnly, requests: reqs,
    counts: { active: active.length, pending: pending.length, rosterOnly: rosterOnly.length, requests: reqs.length }, window: { from: r34Monday(today), to: r34Add(r34Monday(today), 13) } } };
}
function s34TempPassword() {
  var a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 10; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
/** HOD (own department) / admin: create an account with a one-time password (emailed) that must be changed at first sign-in. */
function registerStaff(p) {
  var me = v3Requester(p);
  s34Ensure(); r34Ensure();
  var email = s34Lower(p.email), first = String(p.firstName || '').replace(/\s+/g, ' ').trim(), last = String(p.lastName || '').replace(/\s+/g, ' ').trim();
  var dept = String(p.department || '').trim();
  if (!isAdminPerm(me)) { if (!isDeptLead(me)) return { success: false, error: 'HOD or admin only' }; dept = String(me.department || ''); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'Enter a valid email' };
  if (!first || !last) return { success: false, error: 'First and last name required (as on the roster)' };
  if (!dept) return { success: false, error: 'Department is required' };
  if (findUserByEmail(email)) return { success: false, error: 'An account with that email already exists' };
  var code = p.employeeCode ? r34EmpCode(p.employeeCode) : '';
  if (p.employeeCode && !code) return { success: false, error: 'An employee number looks like GL018' };
  if (code && !s34CodeFree(code, email)) return { success: false, error: code + ' is already on another account' };
  var temp = s34TempPassword(), now = nowIso();
  appendRow('Users', { id: uid('usr'), email: email, password: temp, firstName: first, lastName: last, department: dept, contact: '', role: 'staff', permissions: 'staff',
    roster: '', village: '', active: true, createdAt: now, verified: true, deptStatus: 'approved', employeeCode: code, mustChangePassword: 'TRUE', tempPasswordAt: now },
    ['id', 'email', 'password', 'firstName', 'lastName', 'department', 'contact', 'role', 'permissions', 'roster', 'village', 'active', 'createdAt', 'verified', 'deptStatus', 'employeeCode', 'mustChangePassword', 'tempPasswordAt']);
  scInvalidateSheet('Users');
  var rn = '';
  if (p.rosterName) {
    var lr = linkRosterName({ requesterEmail: me.email, linkEmail: email, rosterName: String(p.rosterName), department: String(p.rosterDept || dept) });
    if (lr && lr.success) rn = lr.data.rosterName;
  }
  var body = 'Bula ' + first + ',\n\n' + s34Name(me) + ' created your PCR Staff App account (' + dept + ').\n\n' +
    'Email: ' + email + '\nOne-time password: ' + temp + '\n\nSign in with these, then choose your own password (the one-time password only works once and expires in 14 days).' +
    (code ? '\nYour employee number ' + code + ' is linked, so your Schedule is ready.' : '') + '\n\n— PCR Staff App';
  var mr = null;
  try { mr = sendAppMail(email, 'Your PCR Staff App account', body, 'account'); } catch (e) { mr = { sent: false, error: String(e) }; }
  s34Log(me, isAdminPerm(me) ? 'admin' : 'dept', 'registerStaff', email, 'Registered ' + first + ' ' + last + ' (' + dept + ')' + (code ? ' = ' + code : '') + (mr && mr.sent ? ' · login emailed' : ' · login email NOT sent'));
  return { success: true, data: { email: email, name: first + ' ' + last, department: dept, code: code, rosterName: rn, emailed: !!(mr && mr.sent), via: (mr && mr.via) || '', error: mr && !mr.sent ? (mr.error || '') : '' } };
}
/** public: one-time password → own password (first sign-in). Returns the normal login payload. */
function setFirstPassword(p) {
  var email = s34Lower(p.email), temp = String(p.password || ''), np = String(p.newPassword || '');
  var u = findUserByEmail(email);
  if (!u || !truthy(u.mustChangePassword) || String(u.password) !== temp) return { success: false, error: 'Invalid email or one-time password' };
  if (s34TempExpired(u)) return { success: false, error: 'This one-time password has expired — ask your HOD to register you again.' };
  if (np.length < 6) return { success: false, error: 'Choose a password with at least 6 characters' };
  if (np === temp) return { success: false, error: 'Choose a new password (not the one-time password)' };
  updateRowById('Users', u.id, { password: np, mustChangePassword: '', tempPasswordAt: '' });
  scInvalidateSheet('Users');
  return login({ email: email, password: np });
}
function s34TempExpired(u) { var t = v3ParseFiji(u.tempPasswordAt); return !!t && t < Date.now() - 14 * 86400000; }

/* ---------- 6) island estimate + meal blocking (leave only) + special meal requests ---------- */
function s34OffList() {
  var l = r34Json(getSetting('meal_off_island_leave', ''), null);
  if (!Array.isArray(l)) l = S34_OFF_ISLAND_DEFAULT;
  var o = {}; l.forEach(function (x) { var c = r34CanonLeaveType(x, true) || String(x); o[r34Lower(c)] = 1; o[r34Lower(x)] = 1; });
  return o;
}
function s34BlockOn() { return String(getSetting('meal_roster_block', S34_MEAL_BLOCK_DEFAULT)) === 'true'; }
/** 'on' | 'off' | '' (not on a roster that day). Days off, sick, PH, training, SDD, ON, unknown codes = on the island. */
function s34Island(e, off, appLeave) {
  if (appLeave && off[r34Lower(appLeave)]) return 'off';
  if (!e || e.none) return appLeave ? 'on' : '';
  if (r34IsReleased(e)) return 'off';
  if (e.leaveType && off[r34Lower(e.leaveType)]) return 'off';
  return 'on';
}
function s34ApprovedLeaveOn(date) {
  var o = {};
  sheetToObjects('Leave Requests').forEach(function (l) {
    if (String(l.status) !== 'approved') return;
    var s = v3Date(l.startDate), e = v3Date(l.endDate || l.startDate);
    if (date >= s && date <= e) o[s34Lower(l.userEmail)] = r34CanonLeaveType(l.leaveType || 'Other', true) || String(l.leaveType || '');
  });
  return o;
}
function s34Counted(o) { var st = String(o.status || ''); return st && st !== 'cancelled' && st !== 'rejected' && st !== 'declined' && st !== 'late_pending'; }
/** one service date: roster estimate (everyone on the roster, incl. names without an app account) vs counted orders per meal. */
function s34Estimate(date) {
  // the roster part is cached per roster version + the day's approved leave / boat trips / off-island list (all cheap to read)
  var off = s34OffList(), lv = s34ApprovedLeaveOn(date), trips = s34BoatTrips(date);
  var ck = null, r = null;
  try { ck = scKey('r34', 'isl341:' + date + ':' + s34Hash(JSON.stringify([off, lv, trips]))); r = scGetJson(ck); } catch (e) { ck = null; }
  if (!r) { r = s34IslandCount(date, off, lv, trips); if (ck) { try { scPutJson(ck, r, 3600); } catch (e2) {} } }
  var orders = {}, special = {};
  Object.keys(S34_MEALS).forEach(function (m) {
    orders[m] = sheetToObjects(S34_MEALS[m]).filter(function (o) { return dsumDate(o.serviceDate) === date && s34Counted(o); }).length;
    special[m] = 0;
  });
  sheetToObjects(S34.SPECIAL).forEach(function (x) { if (String(x.serviceDate).slice(0, 10) === date && String(x.status) === 'approved' && special[x.meal] !== undefined) special[x.meal]++; });
  return { date: date, label: r34Label(date), onIsland: r.on, offIsland: r.offN, rostered: r.on + r.offN, orders: orders, specialApproved: special, hasRoster: r.on + r.offN > 0, meals: r.meals };
}
function s34Hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + '.' + str.length; }
function s34IslandCount(date, off, lv, trips) {
  off = off || s34OffList(); lv = lv || s34ApprovedLeaveOn(date); trips = trips || s34BoatTrips(date);
  var uploads = r34Uploads(), active = r34ActiveIds(uploads);
  var idx = r34Index(r34AllRows(true), active, date, date);
  var on = 0, offN = 0, seen = {}, meals = {};
  S34_MEAL_ORDER.forEach(function (m) { meals[m] = { onIsland: 0, boatIn: 0, boatOut: 0 }; });
  Object.keys(idx).forEach(function (em) {
    seen[em] = 1;
    var st = s34Island(idx[em][date], off, lv[em]);
    if (st === 'on') on++; else if (st === 'off') offN++;
    if (!st) return;
    // 3.4.1: per meal — the roster status of the day, changed by a confirmed resort boat trip that day (leaves after breakfast / lunch, arrives before lunch / dinner)
    S34_MEAL_ORDER.forEach(function (m) {
      var t = trips[em], ms = t ? s34TripStatus(t, S34_MEAL_AT[m]) : st;
      if (ms === 'on') meals[m].onIsland++;
      if (t && ms !== st) { if (ms === 'on') meals[m].boatIn++; else meals[m].boatOut++; }
    });
  });
  Object.keys(lv).forEach(function (em) { if (!seen[em] && off[r34Lower(lv[em])]) offN++; });
  var wk = r34Monday(date), mk = r34MonthKey(date), only = {};
  sheetToObjects(R34.UNM).forEach(function (u) {
    if (String(u.status) !== 'open' || !active[String(u.uploadId)]) return;
    var pk = r34Pk(u.periodKey), kind = String(u.kind);
    if (!((kind === 'weekly' && pk === wk) || (kind !== 'weekly' && pk === mk))) return;
    var s = r34Json(u.shiftsJson, []).filter(function (x) { return x.date === date; })[0];
    var k = r34MapKey(u.rawName, u.department);
    if (!s || (only[k] && only[k].kind === 'weekly')) return;
    only[k] = { kind: kind, e: { date: date, dayOff: !!s.dayOff, code: s.code || '', leaveType: s.leaveType || '', start: s.start || '' } };
  });
  Object.keys(only).forEach(function (k) { var st = s34Island(only[k].e, off, ''); if (st === 'on') { on++; S34_MEAL_ORDER.forEach(function (m) { meals[m].onIsland++; }); } else if (st === 'off') offN++; });
  return { on: on, offN: offN, meals: meals };
}
/* 3.4.1: per-meal estimate. Meal times (Fiji) and the PCE resort boat: AM arrives ~10:00, AM leaves ~10:20, PM arrives ~15:00, PM leaves ~15:30. */
var S34_MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
var S34_MEAL_AT = { breakfast: 7 * 60, lunch: 12 * 60, dinner: 19 * 60 };
var S34_TRIP_AT = { 'AM|to_resort': 10 * 60, 'AM|to_naisoso': 10 * 60 + 20, 'PM|to_resort': 15 * 60, 'PM|to_naisoso': 15 * 60 + 30 };
/** confirmed resort boat trips on the date → { email: [{ at, dir }] } (sorted) */
function s34BoatTrips(date) {
  var o = {};
  try {
    if (typeof R33_SHEET === 'undefined') return o;
    sheetToObjects(R33_SHEET).forEach(function (x) {
      if (String(x.status) !== 'confirmed' || v3Date(x.date) !== date) return;
      var at = S34_TRIP_AT[String(x.run) + '|' + String(x.direction)]; if (at === undefined) return;
      var em = s34Lower(x.userEmail); (o[em] = o[em] || []).push({ at: at, dir: String(x.direction) });
    });
    Object.keys(o).forEach(function (em) { o[em].sort(function (a, b) { return a.at - b.at; }); });
  } catch (e) {}
  return o;
}
/** on / off the island at a time of day, from the boat trips of that day */
function s34TripStatus(trips, at) {
  var st = trips[0].dir === 'to_naisoso' ? 'on' : 'off';
  trips.forEach(function (t) { if (t.at < at) st = t.dir === 'to_resort' ? 'on' : 'off'; });
  return st;
}
function s34Wrap(res, meal) { try { if (res && res.success && res.data) s34AttachIsland(res.data, meal, String(res.data.serviceDate || '').slice(0, 10)); } catch (e) {} return res; }
/** 3.4.1: kitchen order sheets / prep list: the island estimate of that meal + approved special meals */
function s34AttachIsland(data, meal, date) {
  try { if (!data || !date) return data; data.island = s34Estimate(date); if (!data.specialMeals) data.specialMeals = s34SpecialFor(date)[meal] || []; } catch (e) {}
  return data;
}
function s34MyIsland(me, date) {
  if (!s34Linked(me)) return '';
  var days = r34UserDays(me.email), lv = s34ApprovedLeaveOn(date);
  return s34Island(days[date], s34OffList(), lv[s34Lower(me.email)]);
}
/** null = may order; else the blocked answer for place*Order. */
function s34MealBlock(u, meal, date) {
  try {
    if (!u || !s34BlockOn() || isSuperPerm(u) || !date) return null;
    if (s34MyIsland(u, date) !== 'off') return null;
    return { success: false, rosteredOff: true, meal: meal, serviceDate: date, error: 'You are rostered off on ' + r34Label(date) + ' (leave). Send a special meal request if you will be on the island.' };
  } catch (e) { return null; }
}
/** GET getIslandEstimate&dates=a,b — any signed-in user (numbers only) + my own status per date. */
function getIslandEstimate(p) {
  var me = v3Requester(p);
  r34Ensure(); s34Ensure();
  var dates = String(p.dates || p.serviceDate || r34Today()).split(',').map(function (d) { return v3Date(d); }).filter(r34IsoOk).slice(0, 4);
  var my = sheetToObjects(S34.SPECIAL).filter(function (r) { return s34Lower(r.userEmail) === s34Lower(me.email); });
  return { success: true, data: { blockOn: s34BlockOn(), linked: s34Linked(me), estimates: dates.map(function (d) {
    var e = s34Estimate(d);
    e.me = isSuperPerm(me) ? '' : s34MyIsland(me, d);
    e.mySpecial = my.filter(function (r) { return String(r.serviceDate).slice(0, 10) === d; }).map(function (r) { return { id: r.id, meal: r.meal, status: r.status, reason: r.reason }; });
    return e;
  }) } };
}
function requestSpecialMeal(p) {
  var me = v3Requester(p);
  if (isSuperPerm(me)) return { success: false, error: A31_SUPER_BLOCK_MSG };
  s34Ensure();
  var meal = String(p.meal || '').toLowerCase(), date = v3Date(p.serviceDate), reason = String(p.reason || '').trim();
  if (!S34_MEALS[meal]) return { success: false, error: 'Pick breakfast, lunch or dinner' };
  if (!r34IsoOk(date) || date < r34Today()) return { success: false, error: 'Pick today or a later date' };
  if (reason.length < 3) return { success: false, error: 'A reason is required' };
  var dup = sheetToObjects(S34.SPECIAL).some(function (r) { return s34Lower(r.userEmail) === s34Lower(me.email) && String(r.serviceDate).slice(0, 10) === date && r.meal === meal && (r.status === 'pending' || r.status === 'approved'); });
  if (dup) return { success: false, error: 'You already asked for this meal' };
  var id = uid('spm');
  appendRow(S34.SPECIAL, { id: id, userEmail: s34Lower(me.email), userName: s34Name(me), department: me.department || '', serviceDate: date, meal: meal, reason: reason.substring(0, 300), status: 'pending', decidedBy: '', decidedAt: '', createdAt: nowIso() }, S34_SPECIAL_HEADERS);
  var leads = deptLeads(me.department).map(function (u) { return s34Lower(u.email); }).filter(function (e) { return e !== s34Lower(me.email); });
  if (!leads.length) leads = adminUsers().filter(function (u) { return !isSuperPerm(u); }).map(function (u) { return s34Lower(u.email); });
  s34NotifyAll(leads, 'Special meal request to approve', s34Name(me) + ' (' + (me.department || '') + ') is rostered off but asks for ' + meal + ' on ' + r34Label(date) + ': ' + reason.substring(0, 120), 'special_meal', id);
  s34Log(me, 'dept', 'requestSpecialMeal', me.email, 'Special ' + meal + ' request for ' + date + ': ' + reason.substring(0, 120));
  return { success: true, data: { id: id, status: 'pending' } };
}
function getSpecialMeals(p) {
  var me = v3Requester(p);
  s34Ensure();
  var chef = isChefPerm(me) || isAdminPerm(me), lead = isDeptLead(me);
  var date = p.serviceDate ? v3Date(p.serviceDate) : '';
  var list = sheetToObjects(S34.SPECIAL).filter(function (r) {
    if (date && String(r.serviceDate).slice(0, 10) !== date) return false;
    if (isAdminPerm(me) || (chef && String(r.status) === 'approved')) return true;
    if (lead && r34DeptEq(r.department, me.department)) return true;
    return s34Lower(r.userEmail) === s34Lower(me.email);
  }).filter(function (r) { return String(r.serviceDate).slice(0, 10) >= r34Add(r34Today(), -7); })
    .map(function (r) { return { id: r.id, userEmail: r.userEmail, userName: r.userName, department: r.department, serviceDate: String(r.serviceDate).slice(0, 10), meal: r.meal, reason: r.reason, status: r.status, decidedBy: r.decidedBy, createdAt: r.createdAt }; })
    .sort(function (a, b) { return String(a.serviceDate + a.meal).localeCompare(String(b.serviceDate + b.meal)); });
  return { success: true, data: { requests: list } };
}
function decideSpecialMeal(p) {
  var me = v3Requester(p);
  s34Ensure();
  var r = sheetToObjects(S34.SPECIAL).filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!r) return { success: false, error: 'Request not found' };
  if (!s34CanLead(me, r.department)) return { success: false, error: 'The HOD of ' + r.department + ' decides this' };
  if (String(r.status) !== 'pending') return { success: false, error: 'Already ' + r.status };
  var ok = String(p.decision) !== 'decline';
  updateRowById(S34.SPECIAL, r.id, { status: ok ? 'approved' : 'declined', decidedBy: s34Lower(me.email), decidedAt: nowIso() });
  v3Notify(r.userEmail, ok ? 'Special meal approved' : 'Special meal not approved', (ok ? 'The kitchen will have your ' : 'Your request for ') + r.meal + ' on ' + r34Label(String(r.serviceDate).slice(0, 10)) + (ok ? '.' : ' was declined.'), 'special_meal', r.id);
  s34Log(me, 'dept', 'decideSpecialMeal', r.userEmail, (ok ? 'Approved' : 'Declined') + ' special ' + r.meal + ' for ' + r.userName + ' on ' + String(r.serviceDate).slice(0, 10));
  return { success: true, data: { status: ok ? 'approved' : 'declined' } };
}
/** staff: cancel my own special meal request (pending or approved) */
function cancelSpecialMeal(p) {
  var me = v3Requester(p);
  s34Ensure();
  var r = sheetToObjects(S34.SPECIAL).filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!r || s34Lower(r.userEmail) !== s34Lower(me.email)) return { success: false, error: 'Request not found' };
  if (String(r.status) !== 'pending' && String(r.status) !== 'approved') return { success: false, error: 'Already ' + r.status };
  updateRowById(S34.SPECIAL, r.id, { status: 'cancelled', decidedAt: nowIso() });
  s34Log(me, 'dept', 'cancelSpecialMeal', me.email, 'Cancelled the special ' + r.meal + ' request for ' + String(r.serviceDate).slice(0, 10));
  return { success: true, data: { status: 'cancelled' } };
}
/** for the kitchen summary / printouts: approved special meals of one date, by meal */
function s34SpecialFor(date) {
  var o = { breakfast: [], lunch: [], dinner: [] };
  try {
    sheetToObjects(S34.SPECIAL).forEach(function (r) {
      if (String(r.serviceDate).slice(0, 10) !== date || String(r.status) !== 'approved' || !o[r.meal]) return;
      o[r.meal].push({ name: r.userName, department: r.department, reason: r.reason, approvedBy: r.decidedBy });
    });
  } catch (e) {}
  return o;
}
/** 3.5.0: Kitchen Admin › Reports roster compare — expected staff per meal from the rosters already uploaded (no local file). Chef / admin, max 45 days. */
function getRosterExpected(p) {
  var me = v3Requester(p);
  if (!isChefPerm(me) && !isAdminPerm(me)) return { success: false, error: 'Kitchen or admin only' };
  r34Ensure(); s34Ensure();
  var from = v3Date(p.from || r34Today()), to = v3Date(p.to || from);
  if (!r34IsoOk(from) || !r34IsoOk(to) || to < from) return { success: false, error: 'Pick a valid date range' };
  var off = s34OffList(), days = [];
  for (var d = from, n = 0; d <= to && n < 45; d = r34Add(d, 1), n++) {
    var lv = s34ApprovedLeaveOn(d), trips = s34BoatTrips(d), ck = null, r = null;
    try { ck = scKey('r34', 'isl341:' + d + ':' + s34Hash(JSON.stringify([off, lv, trips]))); r = scGetJson(ck); } catch (e) { ck = null; }
    if (!r) { r = s34IslandCount(d, off, lv, trips); if (ck) { try { scPutJson(ck, r, 3600); } catch (e2) {} } }
    var meals = {};
    S34_MEAL_ORDER.forEach(function (m) { meals[m] = (r.meals && r.meals[m]) ? r.meals[m].onIsland : 0; });
    days.push({ date: d, hasRoster: r.on + r.offN > 0, onIsland: r.on, meals: meals });
  }
  return { success: true, data: { from: from, to: to, days: days, truncated: days.length >= 45 && r34Add(from, 45) <= to } };
}
function routeStaff34(action, p) {
  var map = { requestScheduleLink: requestScheduleLink, decideLinkRequest: decideLinkRequest, setStaffLink: setStaffLink, getLinkRequests: getLinkRequests,
    getDeptRosterStaff: getDeptRosterStaff, registerStaff: registerStaff, setFirstPassword: setFirstPassword,
    getIslandEstimate: getIslandEstimate, requestSpecialMeal: requestSpecialMeal, cancelSpecialMeal: cancelSpecialMeal, getSpecialMeals: getSpecialMeals, decideSpecialMeal: decideSpecialMeal, getRosterExpected: getRosterExpected };
  var fn = map[action];
  if (!fn && action === 'testMailLog' && typeof testMailLogAction === 'function') fn = testMailLogAction; // TEST backend only (TestEnv.gs)
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
