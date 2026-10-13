/* ---------- 3.6.0 (Pranav): Order on behalf (D) + Late meal request (E), dinner only ---------- */
function r36Leader(r) { return !!r && (isDeptLead(r) || isAdminPerm(r) || (typeof isSuperPerm === 'function' && isSuperPerm(r))); }
function r36AnyDept(r) { return isAdminPerm(r) || isChefPerm(r) || (typeof isSuperPerm === 'function' && isSuperPerm(r)); }
/** Who the meal is for: registered user (userEmail) or free-text name + department / Contractor. Refuses duplicates for that dinner. */
function r36Target(r, p, sd) {
  var em = String(p.userEmail || '').trim().toLowerCase(), any = r36AnyDept(r), row = {};
  if (em) {
    var u = findUserByEmail(em);
    if (!u) return { error: 'Staff member not found' };
    if (!any && normDept(u.department) !== normDept(r.department)) return { error: 'HODs order only for staff in their own department' };
    row = { userEmail: String(u.email).toLowerCase(), userName: v3Name(u), department: u.department || '' };
  } else {
    var name = v3Clean(p.guestName, 60);
    if (!name) return { error: 'Pick a staff member or type a name' };
    var contractor = String(p.guestType || '') === 'contractor';
    var dept = contractor ? 'Contractor' : (v3Clean(p.department, 60) || r.department || '');
    if (!dept) return { error: 'Department is required' };
    if (!any && normDept(dept) !== normDept(r.department)) return { error: 'HODs order only for their own department' };
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'guest';
    row = { userEmail: 'behalf+' + slug + '.' + normDept(dept).replace(/[^a-z0-9]+/g, '') + '@pcr.local', userName: name + (contractor ? ' (Contractor)' : ''), department: dept, guestName: name };
  }
  var dup = sheetToObjects('Dinner Orders').filter(function (o) {
    var st = String(o.status);
    if (v3Date(o.serviceDate) !== sd || st === 'cancelled' || st === 'rejected' || st === 'declined') return false;
    return String(o.userEmail).toLowerCase() === row.userEmail || (!em && String(o.userName).toLowerCase() === row.userName.toLowerCase() && normDept(o.department) === normDept(row.department));
  });
  if (dup.length) return { error: row.userName + ' already has a dinner order for ' + sd + ' (' + dup[0].status + ')' };
  return { row: row };
}
function placeOrderOnBehalf(p) {
  var r = v3Requester(p);
  if (!(r36Leader(r) || isChefPerm(r))) return { success: false, error: 'HOD / assistant HOD / chef / admin only' };
  var info = dinnerCutoffInfo();
  if (!info.open) return { success: false, error: 'Tomorrow\'s dinner closed at 11:55pm — use Late meal request instead' };
  var sd = info.serviceDate, choice = v3Clean(p.mealChoice, 80);
  if (!choice) return { success: false, error: 'Pick a dish' };
  var mErr = dishMenuError(sd, choice); if (mErr) return mErr;
  var t = r36Target(r, p, sd); if (t.error) return { success: false, error: t.error };
  var by = v3Name(r);
  var row = Object.assign({ id: uid('din'), serviceDate: sd, mealChoice: choice,
    notes: '[Ordered by ' + by + ']', specialNote: cleanSpecialNote(p.specialNote || ''),
    status: 'pending', late: false, createdAt: nowIso(), orderType: 'behalf', requestedBy: String(r.email).toLowerCase(), orderedBy: by }, t.row);
  appendRow('Dinner Orders', row, v3OrderHeaders());
  if (typeof processDinnerWorkflow === 'function') { try { processDinnerWorkflow({ serviceDate: sd }); } catch (e) {} }
  return { success: true, data: { order: v3MealOut(row, 'dinner'), message: 'Ordered for ' + row.userName + ' (' + sd + ')' } };
}
/** Late window (E): from the dinner cutoff (11:55pm the day before) until 4pm on the dinner day; menu pick until 1pm. */
function r36LateWindow(now) {
  now = now || getFijiNow();
  var t = now.getTime(), today = fijiDateString(now), tom = fijiDateString(addFijiDays(now, 1)), times = mealTimes();
  if (t >= mealWindow('dinner', tom, times).cutoffAt) return { open: true, serviceDate: tom, pick: true };
  if (t >= mealWindow('dinner', today, times).cutoffAt && t < r3At(today, '16:00')) return { open: true, serviceDate: today, pick: t < r3At(today, '13:00') };
  return { open: false, serviceDate: today, pick: false };
}
var R36_LEFTOVER = 'Whatever\'s left / extra';
function requestLateOnBehalf(p) {
  var r = v3Requester(p);
  if (!r36Leader(r)) return { success: false, error: 'HOD / assistant HOD / admin only' };
  var w = r36LateWindow();
  if (!w.open) return { success: false, error: 'Late meal requests run from the 11:55pm cutoff until 4pm on the dinner day. Use Order on behalf for tomorrow.' };
  var sd = w.serviceDate, choice = R36_LEFTOVER;
  if (w.pick) { choice = v3Clean(p.mealChoice, 80); if (!choice) return { success: false, error: 'Pick a dish' }; var mErr = dishMenuError(sd, choice); if (mErr) return mErr; }
  var reason = v3Clean(p.reason, 300);
  if (!reason) return { success: false, error: 'Please give a reason' };
  var t = r36Target(r, p, sd); if (t.error) return { success: false, error: t.error };
  var by = v3Name(r);
  var row = Object.assign({ id: uid('din'), serviceDate: sd, mealChoice: choice,
    notes: '[Late request by ' + by + '] ' + reason, specialNote: cleanSpecialNote(p.specialNote || ''),
    status: 'late_pending', late: true, createdAt: nowIso(), orderType: 'late_leader', reason: reason, requestedBy: String(r.email).toLowerCase(), orderedBy: by }, t.row);
  appendRow('Dinner Orders', row, v3OrderHeaders());
  chefUsers().forEach(function (x) { if (String(x.email).toLowerCase() !== String(r.email).toLowerCase()) v3Notify(x.email, 'Late dinner request: ' + row.userName, sd + ' — ' + reason + ' (by ' + by + ')', 'late_meal', row.id); });
  return { success: true, data: { order: v3MealOut(row, 'dinner'), pick: w.pick, message: 'Sent to the chef for approval' } };
}
function getLateWindow(p) {
  var r = v3Requester(p);
  if (!(r36Leader(r) || isChefPerm(r))) return { success: false, error: 'HOD / assistant HOD / chef / admin only' };
  var w = r36LateWindow(), di = dinnerCutoffInfo(), any = r36AnyDept(r), depts = {};
  w.leftover = R36_LEFTOVER; w.behalfServiceDate = di.serviceDate; w.behalfOpen = !!di.open; w.anyDept = any; w.myDept = r.department || '';
  w.people = sheetToObjects('Users').filter(function (u) {
    if (!truthy(u.active) || String(u.email).toLowerCase() === String(r.email).toLowerCase()) return false;
    if (u.department) depts[u.department] = 1;
    return any || normDept(u.department) === normDept(r.department);
  }).map(function (u) { return { email: String(u.email).toLowerCase(), name: v3Name(u), department: u.department || '' }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  w.departments = Object.keys(depts).sort();
  return { success: true, data: w };
}
