/* PCR Staff App 3.1.0 — "Report a problem" (Reports tab + superadmin inbox) and first-time role page guides.
 * Shared by the Apps Script server and the ?demo=1 mode (tools/build-demo-server.js). Sheet access through A31IO / appendRow. */

var A32_REPORTS_SHEET = 'Reports';
var A32_REPORT_HEADERS = ['id', 'createdAt', 'userEmail', 'userName', 'userRole', 'department', 'type', 'description', 'page', 'appVersion', 'device',
  'images', 'status', 'reply', 'repliedAt', 'repliedBy', 'updatedAt', 'updatedBy'];
var A32_TYPES = { problem: 'Problem / error', change: 'Change request', feature: 'New feature / other' };
var A32_STATUS = { 'new': 'New', noted: 'Noted', in_progress: 'In progress', done: 'Done' };
var A32_MAX_IMAGES = 3, A32_MAX_IMAGE_CHARS = 700000, A32_MAX_PER_DAY = 15;
var A32_GUIDE_COL = 'guidesSeen31';
var A32_GUIDES = { kitchen: 1, boat: 1, dept: 1, admin: 1, manage: 1 };

/** Who gets the "new report" email: App setting report_email, else the revert owner, else the bootstrap IT account. */
function a32DevEmail() {
  return a31Lower(getSetting('report_email', '')) || a31RevertOwner() || 'it@paradisecoveresortfiji.com';
}
function a32Out(r) {
  var o = {};
  A32_REPORT_HEADERS.forEach(function (h) { o[h] = r[h] === undefined || r[h] === null ? '' : String(r[h]); });
  try { o.images = r.images ? JSON.parse(r.images) : []; } catch (e) { o.images = []; }
  o.typeLabel = A32_TYPES[o.type] || o.type;
  o.statusLabel = A32_STATUS[o.status] || o.status;
  return o;
}

/** submitReport { type, description, images:[dataURL ≤3], page, appVersion, device } — any signed-in user. */
function submitReport(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var type = A32_TYPES[p.type] ? p.type : 'problem';
  var desc = String(p.description || '').replace(/\r/g, '').trim().substring(0, 3000);
  if (desc.length < 5) return { success: false, error: 'Please describe the problem (a few words at least).' };
  var mine = a31Lower(u.email), today = String(nowIso()).slice(0, 10);
  var n = A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return a31Lower(r.userEmail) === mine && String(r.createdAt).slice(0, 10) === today; }).length;
  if (n >= A32_MAX_PER_DAY) return { success: false, error: 'Too many reports today — please try again tomorrow.' };
  var id = uid('rep');
  var imgs = (Array.isArray(p.images) ? p.images : []).slice(0, A32_MAX_IMAGES);
  var links = [], imgErr = '';
  imgs.forEach(function (d, i) {
    d = String(d || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(d)) { imgErr = 'Only JPG / PNG / WebP images'; return; }
    if (d.length > A32_MAX_IMAGE_CHARS) { imgErr = 'An image was too big (it is shrunk on the phone first — try again)'; return; }
    try { var l = A31IO.saveImage(id + '-' + (i + 1), d); if (l) links.push(l); } catch (e) { imgErr = 'Screenshot could not be saved: ' + String(e && e.message || e).substring(0, 120); }
  });
  var row = { id: id, createdAt: nowIso(), userEmail: mine, userName: displayUserName(u) || u.email, userRole: a31RoleOf(u), department: u.department || '',
    type: type, description: desc, page: String(p.page || '').substring(0, 80), appVersion: String(p.appVersion || '').substring(0, 20),
    device: String(p.device || '').substring(0, 300), images: JSON.stringify(links), status: 'new', reply: '', repliedAt: '', repliedBy: '', updatedAt: '', updatedBy: '' };
  ensureSheet(getSS(), A32_REPORTS_SHEET, A32_REPORT_HEADERS);
  appendRow(A32_REPORTS_SHEET, row, A32_REPORT_HEADERS);
  // superadmins: in-app; developer: email
  try {
    sheetToObjects('Users').filter(function (x) { return truthy(x.active) && isSuperPerm(x); }).forEach(function (s) {
      v3Notify(s.email, 'New report: ' + A32_TYPES[type], row.userName + ': ' + desc.substring(0, 140), 'report', id);
    });
  } catch (e) {}
  try {
    v3Mail(a32DevEmail(), '[PCR Staff App] ' + A32_TYPES[type] + ' from ' + row.userName,
      'Type: ' + A32_TYPES[type] + '\nFrom: ' + row.userName + ' <' + mine + '> · ' + row.userRole + (row.department ? ' · ' + row.department : '') +
      '\nWhen: ' + row.createdAt + '\nPage: ' + row.page + '\nApp version: ' + row.appVersion + '\nDevice: ' + row.device +
      '\n\n' + desc + (links.length ? '\n\nScreenshots:\n' + links.map(function (l) { return l.url; }).join('\n') : '') +
      '\n\nReply / change the status in the app: Manage → Reports.');
  } catch (e) {}
  if (typeof a33PushEvent === 'function') { try { a33PushEvent('report_new', { report: row }); } catch (e) {} }
  return { success: true, data: { id: id, images: links.length, imageError: imgErr } };
}

/** getReports { status?, offset, limit } — superadmin inbox (newest first) + counts. */
function getReports(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  var all = A31IO.rows(A32_REPORTS_SHEET).slice().reverse();
  var counts = { 'new': 0, noted: 0, in_progress: 0, done: 0, total: all.length };
  all.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
  var st = String(p.status || ''), list = st ? all.filter(function (r) { return r.status === st; }) : all;
  var limit = Math.min(100, Math.max(1, Number(p.limit) || 30)), offset = Math.max(0, Number(p.offset) || 0);
  return { success: true, data: { counts: counts, total: list.length, offset: offset, limit: limit, reports: list.slice(offset, offset + limit).map(a32Out) } };
}
/** Cheap badge count for the superadmin nav. */
function getReportCount(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: true, data: { 'new': 0 } };
  return { success: true, data: { 'new': A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return r.status === 'new'; }).length } };
}
/** My own reports (with replies) — any user. */
function getMyReports(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var mine = a31Lower(u.email);
  return { success: true, data: { reports: A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return a31Lower(r.userEmail) === mine; }).reverse().slice(0, 30).map(a32Out) } };
}
/** updateReport { id, status?, reply? } — superadmin. Notifies the reporter (in-app + email + push). */
function updateReport(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  var r = a31RowBy(A32_REPORTS_SHEET, 'id', p.id);
  if (!r) return { success: false, error: 'Report not found' };
  var patch = {}, st = String(p.status || ''), reply = String(p.reply || '').trim().substring(0, 2000);
  if (st && !A32_STATUS[st]) return { success: false, error: 'Unknown status' };
  if (st && st !== r.status) patch.status = st;
  if (reply) { patch.reply = reply; patch.repliedAt = nowIso(); patch.repliedBy = displayUserName(u) || u.email; }
  if (!Object.keys(patch).length) return { success: false, error: 'Nothing to change' };
  patch.updatedAt = nowIso(); patch.updatedBy = a31Lower(u.email);
  A31IO.update(A32_REPORTS_SHEET, 'id', r.id, patch);
  var title = 'Your report: ' + (A32_STATUS[patch.status || r.status] || r.status);
  var body = (reply ? 'Reply: ' + reply + '\n' : '') + '“' + String(r.description).substring(0, 120) + '”';
  v3Notify(r.userEmail, title, body, 'report', r.id);
  try { v3Mail(r.userEmail, '[PCR Staff App] ' + title, 'Hi ' + (r.userName || '') + ',\n\n' + (patch.status ? 'Status: ' + A32_STATUS[patch.status] + '\n' : '') + (reply ? '\nReply from ' + patch.repliedBy + ':\n' + reply + '\n' : '') + '\nYour report (' + String(r.createdAt).slice(0, 16) + '):\n' + String(r.description).substring(0, 1000)); } catch (e) {}
  if (typeof a33PushEvent === 'function') { try { a33PushEvent('report_update', { email: r.userEmail, title: title, body: body, id: r.id }); } catch (e) {} }
  return { success: true, data: { report: a32Out(a31RowBy(A32_REPORTS_SHEET, 'id', r.id) || r) } };
}

/* ---------- first-time role page guides (seen per user on the server) ---------- */
function a32Seen(u) { return String((u && u[A32_GUIDE_COL]) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
function getMyGuides(p) {
  var u = getRequester(p);
  if (!u) return { success: true, data: { seen: [] } };
  return { success: true, data: { seen: a32Seen(u) } };
}
function markGuideSeen(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var g = String(p.guide || '');
  if (!A32_GUIDES[g]) return { success: false, error: 'Unknown guide' };
  var seen = a32Seen(u);
  if (seen.indexOf(g) < 0) {
    seen.push(g);
    var o = {}; o[A32_GUIDE_COL] = seen.join(',');
    A31IO.update('Users', 'email', a31Lower(u.email), o, [A32_GUIDE_COL]);
  }
  return { success: true, data: { seen: seen } };
}

function routeReports31(action, p) {
  var map = { submitReport: submitReport, getReports: getReports, getReportCount: getReportCount, getMyReports: getMyReports, updateReport: updateReport,
    getMyGuides: getMyGuides, markGuideSeen: markGuideSeen };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
