/* 3.7.0 (Pranav): nightly sheet backup (~2am), 7pm missing-dinner nudge (setting nudge_7pm), Monday 7am weekly report (setting weekly_report_to).
 * All run from the existing 10-minute pushTick trigger (owner groupit today — moves with the pcrstaffapp cutover). Each job runs once per date. */
var R37_BACKUP_FOLDER = 'PCR App Backups', R37_KEEP = 30;
function r37Once_(key) { var p = PropertiesService.getScriptProperties(); if (p.getProperty(key)) return false; p.setProperty(key, nowIso()); return true; }
function r37Tick() {
  var now = getFijiNow(), h = now.getUTCHours(), d = fijiDateString(now), out = {};
  try { var pm = pwMigrateOnce_(); if (pm) out.pwMigrate = pm; } catch (e) { out.pwMigrateError = String(e.message || e); }
  try { var mg = r37MergeExactEmailDupsOnce(); if (mg) out.mergeExact = mg.length; } catch (e) { out.mergeError = String(e.message || e); }
  if (h === 2 && r37Once_('r37bk_' + d)) { try { out.backup = r37NightlyBackup(); } catch (e) { out.backupError = String(e.message || e); } }
  if (h === 19 && truthy(getSetting('nudge_7pm', 'false')) && r37Once_('r37nudge_' + d)) { try { out.nudge = r37MissingOrderNudge(); } catch (e) { out.nudgeError = String(e.message || e); } }
  if (h === 7 && now.getUTCDay() === 1 && String(getSetting('weekly_report_to', '')).trim() && r37Once_('r37wk_' + d)) { try { out.weekly = r37SendWeeklyReport(); } catch (e) { out.weeklyError = String(e.message || e); } }
  var p = PropertiesService.getScriptProperties(), old = fijiDateString(addFijiDays(now, -10));
  p.getKeys().forEach(function (k) { var m = k.match(/^r37(?:bk|nudge|wk)_(\d{4}-\d{2}-\d{2})$/); if (m && m[1] < old) p.deleteProperty(k); });
  return out;
}
/* ---------- nightly backup ---------- */
function r37BackupFolder_() {
  var it = DriveApp.getFoldersByName(R37_BACKUP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(R37_BACKUP_FOLDER);
}
function r37NightlyBackup() {
  var folder = r37BackupFolder_(), src = DriveApp.getFileById(getSS().getId());
  var name = src.getName() + ' backup ' + Utilities.formatDate(new Date(), 'Pacific/Fiji', 'yyyy-MM-dd HHmm');
  var copy = src.makeCopy(name, folder);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(src.getName() + ' backup ') === 0) files.push(f); }
  files.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  var trashed = 0; files.slice(R37_KEEP).forEach(function (f) { f.setTrashed(true); trashed++; });
  try { setSetting('last_backup_at', nowIso()); setSetting('last_backup_id', copy.getId()); } catch (e) {}
  return { id: copy.getId(), name: name, kept: Math.min(files.length, R37_KEEP), trashed: trashed };
}
/* ---------- 7pm nudge: active staff with push, no dinner order for tomorrow, pushOff respected ---------- */
function r37MissingOrderNudge() {
  var sd = fijiDateString(addFijiDays(getFijiNow(), 1)), ordered = {}, withSub = {}, n = 0;
  sheetToObjects('Dinner Orders').forEach(function (o) { var st = String(o.status || ''); if (v3Date(o.serviceDate) === sd && st !== 'cancelled' && st !== 'rejected') ordered[String(o.userEmail).toLowerCase()] = 1; });
  a33Subs().forEach(function (s) { withSub[String(s.userEmail).toLowerCase()] = 1; });
  a33ActiveUsers().forEach(function (u) {
    var em = String(u.email).toLowerCase();
    if (!withSub[em] || ordered[em] || truthy(u.pushOff) || isSuperPerm(u) || (typeof v3LegacyStation === 'function' && v3LegacyStation(u))) return;
    if (typeof s34MealBlock === 'function') { try { if (s34MealBlock(u, 'dinner', sd)) return; } catch (e) {} } // on leave
    a33Queue(em, 'No dinner order for tomorrow yet', 'Orders close at 11:55pm tonight. Tap to order.', 'nudge', 'nudge_' + sd, './#meals'); n++;
  });
  return { serviceDate: sd, recipients: n };
}
/* ---------- weekly report (last Mon–Sun) ---------- */
function r37WeeklyData(endDate) {
  var end = endDate || fijiDateString(addFijiDays(getFijiNow(), -1)), start = fijiDateString(addFijiDays(new Date(Date.parse(end + 'T12:00:00Z')), -6));
  var inR = function (d) { d = v3Date(d); return d >= start && d <= end; }, ok = function (o) { var s = String(o.status || ''); return s !== 'cancelled' && s !== 'rejected' && s !== 'declined'; };
  var out = { start: start, end: end, meals: {}, byDept: {}, late: 0, behalf: 0, approvals: { approved: 0, rejected: 0, pending: 0 }, boat: 0, activeUsers: 0, newUsers: 0 };
  ['breakfast', 'lunch', 'dinner'].forEach(function (m) {
    var n = 0;
    sheetToObjects(A33_MEAL_SHEETS[m]).forEach(function (o) {
      if (!inR(o.serviceDate)) return;
      var st = String(o.status || ''), t = String(o.orderType || '');
      if (t === 'late_request' || t === 'late_leader' || t === 'special') { if (st === 'late_approved' || (t === 'special' && st === 'approved') || st === 'approved' && t !== 'special') out.approvals.approved++; else if (st === 'rejected') out.approvals.rejected++; else if (/pending/.test(st)) out.approvals.pending++; }
      if (!ok(o)) return;
      n++; var dp = o.department || '(none)'; out.byDept[dp] = out.byDept[dp] || { breakfast: 0, lunch: 0, dinner: 0 }; out.byDept[dp][m]++;
      if (truthy(o.late)) out.late++;
      if (t === 'behalf' || /^\s*\[(On behalf|Ordered by)/i.test(String(o.notes || ''))) out.behalf++;
    });
    out.meals[m] = n;
  });
  sheetToObjects('Boat Bookings').forEach(function (b) { if (inR(b.travelDate || b.date || b.runDate || b.createdAt) && ok(b)) out.boat++; });
  sheetToObjects('Users').forEach(function (u) { if (truthy(u.active)) out.activeUsers++; if (u.createdAt && inR(String(u.createdAt).slice(0, 10))) out.newUsers++; });
  return out;
}
function r37WeeklyText(w) {
  var L = ['PCR Staff App — weekly report', w.start + ' to ' + w.end, '',
    'Meals ordered: dinner ' + w.meals.dinner + ' · lunch ' + w.meals.lunch + ' · breakfast ' + w.meals.breakfast,
    'Late orders: ' + w.late + ' · ordered on behalf: ' + w.behalf,
    'Requests (late / special): approved ' + w.approvals.approved + ' · declined ' + w.approvals.rejected + ' · still pending ' + w.approvals.pending,
    'Boat bookings: ' + w.boat, 'Active users: ' + w.activeUsers + ' · new registrations: ' + w.newUsers, '', 'By department (dinner / lunch / breakfast):'];
  Object.keys(w.byDept).sort().forEach(function (d) { var x = w.byDept[d]; L.push('  ' + d + ': ' + x.dinner + ' / ' + x.lunch + ' / ' + x.breakfast); });
  return L.join('\n');
}
function r37SendWeeklyReport(p) {
  if (p && p.requesterEmail !== undefined) { var r = getRequester(p); if (!r || !(isSuperPerm(r) || isAdminPerm(r))) return { success: false, error: 'Admin only' }; }
  var to = String(getSetting('weekly_report_to', '') || '').split(/[,;\s]+/).filter(Boolean);
  if (!to.length) return { success: false, error: 'Set weekly_report_to first' };
  var w = r37WeeklyData();
  var res = sendAppMail(to, 'PCR Staff App weekly report ' + w.start + ' – ' + w.end, r37WeeklyText(w), 'weekly_report');
  return { success: !!(res && res.sent !== false), data: { to: to.length, week: w.start + '..' + w.end, mail: res } };
}
