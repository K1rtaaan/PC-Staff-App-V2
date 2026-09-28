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

/** 3.2.0: reports belong to ONE owner account: App setting revert_owner_email, else the bootstrap IT account.
 * Only that superadmin sees the Reports inbox / badge / in-app + push alert. No emails on a new report. */
function a32ReportOwner() { return a31RevertOwner() || A320_OWNER; }
function a32IsReportOwner(u) { return !!u && isSuperPerm(u) && a31Lower(u.email) === a32ReportOwner(); }
var A32_OWNER_ONLY = 'Reports go to the owner account only.';
/** 3.2.0 one-time update (chosen by the owner): App setting revert_owner_email = it@… when it is still empty and that
 * account is an active superadmin. Runs once per project (Script Property A320_OWNER_DONE), logged in the Superadmin log. */
var A320_OWNER = 'it@paradisecoveresortfiji.com';
function a320OwnerOnce() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('A320_OWNER_DONE')) return;
    props.setProperty('A320_OWNER_DONE', nowIso());
    var cur = a31RevertOwner(), u = findUserByEmail(A320_OWNER), ok = !cur && !!u && truthy(u.active) && isSuperPerm(u);
    if (ok) setSetting('revert_owner_email', A320_OWNER, 'system');
    a31WriteLog({ actorEmail: 'system', actorName: 'App update 3.2.0', actorRole: 'system', area: 'super', action: 'setAppSetting', target: 'revert_owner_email',
      summary: ok ? 'Revert / report owner set to ' + A320_OWNER + ' (one-time 3.2.0 update, chosen by the owner)' : 'One-time 3.2.0 owner update skipped (' + (cur ? 'already set to ' + cur : 'account not an active superadmin') + ')',
      before: cur, after: ok ? A320_OWNER : cur, bySuper: 'TRUE', revertable: 'FALSE', noRevertReason: 'System update' });
  } catch (e) {}
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
  // 3.2.0: only the report owner is alerted (in-app → phone push via the Notifications hook). No email.
  try {
    var own = a32ReportOwner();
    var ou = sheetToObjects('Users').filter(function (x) { return truthy(x.active) && isSuperPerm(x) && a31Lower(x.email) === own; })[0];
    if (ou) v3Notify(ou.email, 'New report: ' + A32_TYPES[type], row.userName + ': ' + desc.substring(0, 140), 'report', id);
  } catch (e) {}
  return { success: true, data: { id: id, images: links.length, imageError: imgErr } };
}

/** getReports { status?, offset, limit } — superadmin inbox (newest first) + counts. */
function getReports(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (!a32IsReportOwner(u)) return { success: false, error: A32_OWNER_ONLY, notOwner: true };
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
  if (!a32IsReportOwner(u)) return { success: true, data: { 'new': 0, owner: false } };
  return { success: true, data: { 'new': A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return r.status === 'new'; }).length, owner: true } };
}
/** My own reports (with replies) — any user. */
function getMyReports(p) {
  var u = getRequester(p);
  if (!u) return { success: false, error: 'Login required' };
  var mine = a31Lower(u.email);
  return { success: true, data: { reports: A31IO.rows(A32_REPORTS_SHEET).filter(function (r) { return a31Lower(r.userEmail) === mine; }).reverse().slice(0, 30).map(a32Out) } };
}
/** updateReport { id, status?, reply? } — report owner only. Notifies the reporter (in-app + email + push). */
function updateReport(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (!a32IsReportOwner(u)) return { success: false, error: A32_OWNER_ONLY };
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

/* ---------- 3.2.0 About image (footer "About" button). Superadmin uploads a replacement; stored like report screenshots. ---------- */
/** setAboutImage { image: dataURL } or { reset: true } — superadmin. App setting about_image_url ('' = the default poster). */
function setAboutImage(p) {
  var u = getRequester(p);
  if (!u || !isSuperPerm(u)) return { success: false, error: 'Superadmin only' };
  if (truthy(p.reset)) { setSetting('about_image_url', '', u.email); return { success: true, data: { url: '' } }; }
  var d = String(p.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(d)) return { success: false, error: 'Choose a JPG, PNG or WebP image' };
  if (d.length > A32_MAX_IMAGE_CHARS) return { success: false, error: 'The image is too big — try a smaller one' };
  var l = A31IO.saveImage('about-' + String(nowIso()).replace(/[^0-9]/g, '').slice(0, 12), d);
  if (!l) return { success: false, error: 'The image could not be saved' };
  var url = /^data:/.test(String(l.thumb || '')) ? l.thumb : 'https://drive.google.com/thumbnail?id=' + l.id + '&sz=w1200';
  setSetting('about_image_url', url, u.email);
  return { success: true, data: { url: url } };
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
  var map = { setAboutImage: setAboutImage, submitReport: submitReport, getReports: getReports, getReportCount: getReportCount, getMyReports: getMyReports, updateReport: updateReport,
    getMyGuides: getMyGuides, markGuideSeen: markGuideSeen };
  var fn = map[action];
  if (!fn) return typeof routePush33 === 'function' ? routePush33(action, p) : null; // 3.2.0 push
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
