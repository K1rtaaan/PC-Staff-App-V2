/* PCR Staff App 3.4.0 — My Schedule tab, monthly / weekly rosters, roster archive, leave balances, roster reminders.
 *
 *  Rosters (shift rows, written in batches with setValues under the script lock):
 *   - monthly  : admins, all departments (or one department), periodKey YYYY-MM, before the 1st of the month
 *   - weekly   : HOD / assistant HOD for their own department (admins: any department), periodKey = Monday YYYY-MM-DD
 *   - archive  : superadmin, past months (Jan 2026 → now), periodKey YYYY-MM; stored in their own tab "Roster Archive",
 *                never shown as a current schedule; used for leave used + the department pattern summary.
 *  Resolution per staff per date: the weekly roster of the week if the person is on it, otherwise the monthly roster,
 *  otherwise (past dates only, for leave) the archive. Inside a period the person is on, a date with no entry = "no shift".
 *
 *  Upload = start (upload row "staging") → chunks (match + write rows) → finish (old rows of the same scope removed in one
 *  pass, change notices computed from the stored rows, upload "active"). Views only read rows of "active" uploads.
 *
 *  Matching = roster name AND department against Users: saved links (tab "Roster Name Map") first, then one exact full
 *  name in that department. First-name-only, ties, other-department names → "Roster Unmatched" with suggestions
 *  (HOD: own department, admin: any) — a manual link is saved and applied to this and every future upload.
 *
 *  Every tab / setting is created on first use (idempotent): live needs no manual setup. */

var R34 = {
  SHIFTS: 'Roster Shifts', ARCH: 'Roster Archive', UPLOADS: 'Roster Uploads', MAP: 'Roster Name Map',
  UNM: 'Roster Unmatched', ALLOW: 'Leave Allowances', REMLOG: 'Roster Reminder Log'
};
var R34_SHIFT_HEADERS = ['id', 'uploadId', 'period', 'userEmail', 'userName', 'department', 'date', 'start', 'end', 'dayOff', 'roleLabel',
  'rawName', 'createdAt', 'kind', 'periodKey', 'code', 'leaveType', 'rosterDept'];
var R34_UPLOAD_HEADERS = ['id', 'period', 'department', 'fileName', 'fileType', 'uploadedBy', 'uploadedAt', 'rowCount', 'matchedCount',
  'unmatchedJson', 'notes', 'kind', 'periodKey', 'periodStart', 'periodEnd', 'status', 'layout', 'unmatchedCount', 'changedCount',
  'finalizedAt', 'totalRows', 'chunksDone', 'skippedCount', 'replacedBy'];
var R34_MAP_HEADERS = ['rosterName', 'department', 'userEmail', 'createdBy', 'createdAt', 'id'];
var R34_UNM_HEADERS = ['id', 'uploadId', 'kind', 'periodKey', 'rawName', 'department', 'shiftsJson', 'suggestionsJson', 'reason', 'status',
  'resolvedEmail', 'resolvedBy', 'resolvedAt', 'createdAt'];
var R34_ALLOW_HEADERS = ['id', 'email', 'department', 'leaveType', 'daysPerYear', 'updatedBy', 'updatedAt'];
var R34_REMLOG_HEADERS = ['key', 'kind', 'userEmail', 'sentAt'];
var R34_BATCH = 2000;
var R34_ARCHIVE_FROM = '2026-01';
/** Leave types (App Setting leave_types, JSON). balance = shown on the leave balance card; dayOff = a normal day off, not leave. */
var R34_DEFAULT_LEAVE_TYPES = [
  { name: 'Annual leave', short: 'Annual', balance: true, aliases: ['Annual', 'AL'] },
  { name: 'Sick leave', short: 'Sick', balance: true, aliases: ['Sick sheet', 'Sick', 'SL', 'MC'] },
  { name: 'Family / Bereavement', short: 'Family', balance: true, aliases: ['Family', 'Bereavement', 'Compassionate', 'Family leave'] },
  { name: 'Public holiday', short: 'Public holiday', balance: true, aliases: ['PH', 'Holiday'] },
  { name: 'Maternity / Paternity', short: 'Parental', balance: true, aliases: ['Maternity', 'Paternity', 'Parental'] },
  { name: 'Unpaid leave', short: 'Unpaid', balance: true, aliases: ['Unpaid', 'LWP'] },
  { name: 'Day off', short: 'Day off', balance: false, dayOff: true, aliases: ['OFF', 'RDO'] },
  { name: 'Other', short: 'Other', balance: false, aliases: [] }
];
/** Roster leave codes (App Setting roster_leave_codes, JSON code → leave type name). */
var R34_DEFAULT_CODES = {
  'OFF': 'Day off', 'RDO': 'Day off', 'DO': 'Day off', 'DAY OFF': 'Day off', 'O': 'Day off',
  'AL': 'Annual leave', 'A/L': 'Annual leave',
  'SL': 'Sick leave', 'MC': 'Sick leave', 'S/L': 'Sick leave',
  'FL': 'Family / Bereavement', 'BL': 'Family / Bereavement', 'CL': 'Family / Bereavement',
  'PH': 'Public holiday',
  'ML': 'Maternity / Paternity', 'PL': 'Maternity / Paternity',
  'UL': 'Unpaid leave', 'LWP': 'Unpaid leave',
  // 3.4.0: codes seen in the real PCR weekly rosters (Jan–Aug 2026). Spaces are ignored around "/" and repeated spaces collapse.
  'DAYS OFF': 'Day off', 'DAYOFF': 'Day off', 'DAYSOFF': 'Day off', 'D/OFF': 'Day off', 'DSY OFF': 'Day off', 'OFF DAY': 'Day off',
  'ANNUAL LEAVE': 'Annual leave', 'ANNUAL': 'Annual leave', 'A/LEAVE': 'Annual leave', 'ANNUAL/LEAVE': 'Annual leave',
  'SICK': 'Sick leave', 'SICK LEAVE': 'Sick leave', 'S/LEAVE': 'Sick leave', 'SICK SHEET': 'Sick leave',
  'MATERNITY LEAVE': 'Maternity / Paternity', 'MATERNITY': 'Maternity / Paternity', 'M/L': 'Maternity / Paternity', 'M/LEAVE': 'Maternity / Paternity', 'PATERNITY': 'Maternity / Paternity',
  'B/LEAVE': 'Family / Bereavement', 'BEREAVEMENT': 'Family / Bereavement', 'FAMILY LEAVE': 'Family / Bereavement', 'COMPASSIONATE': 'Family / Bereavement',
  'LWOP': 'Unpaid leave', 'LOPW': 'Unpaid leave', 'LEAVE WITHOUT PAY': 'Unpaid leave',
  'PUBLIC HOLIDAY': 'Public holiday', 'P/H': 'Public holiday',
  'LEAVE': 'Other'
};
/** Normalised code key: upper case, single spaces, no spaces around "/" ("Annual/ Leave" = "ANNUAL/LEAVE", " DAY  OFF" = "DAY OFF"). */
/** Typos / variants in real rosters ("MARENITY LEAVE", "SICKLEAVE", "BREVEAMNET", "DAT OFF", "ANNUAL LEAVE (3)") → a known code. '' = not a leave/off code. */
function r34FuzzyCode(key, codes) {
  var k = r34CodeKey(key).replace(/\s*\(\d+\)$/, '');
  var rep = k.match(/^(.+?) \1$/); if (rep) k = rep[1]; // "DAY OFF DAY OFF" (label typed in both halves of a merged pair)
  if (codes[k] !== undefined) return k;
  var pick = function (type) { var c = Object.keys(codes).filter(function (x) { return codes[x] === type; })[0]; return c || ''; };
  if (/^(DAY|DAT|BAY|DAYS|D)\s?\/?\s?OFF$/.test(k) || /^OFF$/.test(k)) return pick('Day off');
  if (!/LEAVE|SICK|MATERN|MARENITY|PATERN|BEREAV|BREVEA|FUNERAL|WITHOUT PAY|LWOP|LOPW|ANNUAL/.test(k)) return '';
  if (/WITHOUT PAY|LWOP|LOPW|UNPAID/.test(k)) return pick('Unpaid leave');
  if (/SICK/.test(k)) return pick('Sick leave');
  if (/MATERN|MARENITY|PATERN/.test(k)) return pick('Maternity / Paternity');
  if (/BEREAV|BREVEA|FUNERAL|COMPASS|FAMILY/.test(k)) return pick('Family / Bereavement');
  if (/ANNUAL/.test(k)) return pick('Annual leave');
  return pick('Other');
}
function r34CodeKey(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim(); }
/** 3.4.0: the app's department list is an App Setting ("departments", JSON) so it can follow the real rosters.
 *  Base = the 3.3 list; R34_ROSTER_DEPTS = departments that have their own sheet in the real PCR weekly rosters but were missing. */
var R34_BASE_DEPTS = ['F&B', 'Bar', 'Kitchen', 'Boatman', 'Porters', 'Kids Club', 'BR Kitchen', 'Donu Kitchen', 'Housekeeping', 'Grounds', 'Spa', 'Maintenance', 'Diveshop', 'Activities', 'Security', 'Management', 'IT/Office', 'Other'];
var R34_ROSTER_DEPTS = ['Front Office', 'Stores'];
var R34_SETTINGS = {
  leave_types: function () { return JSON.stringify(R34_DEFAULT_LEAVE_TYPES); },
  roster_leave_codes: function () { return JSON.stringify(R34_DEFAULT_CODES); },
  roster_dayoff_heads_up: function () { return 'false'; },
  roster_back_reminder_time: function () { return '18:00'; }
};

/* ---------- schema + settings (idempotent) ---------- */
function r34Ensure(force) {
  var c = null;
  try { c = CacheService.getScriptCache(); if (!force && c.get('pcr_r34_schema_1') === '1') return; } catch (e) {}
  var ss = getSS();
  ensureSheet(ss, R34.SHIFTS, R34_SHIFT_HEADERS);
  ensureSheet(ss, R34.ARCH, R34_SHIFT_HEADERS);
  ensureSheet(ss, R34.UPLOADS, R34_UPLOAD_HEADERS);
  ensureSheet(ss, R34.MAP, R34_MAP_HEADERS);
  ensureSheet(ss, R34.UNM, R34_UNM_HEADERS);
  ensureSheet(ss, R34.ALLOW, R34_ALLOW_HEADERS);
  ensureSheet(ss, R34.REMLOG, R34_REMLOG_HEADERS);
  try { var ush = ss.getSheetByName('Users'); if (ush) ensureColumns(ush, ['employeeCode']); } catch (eu) {} // 3.4.0: payroll code (e.g. GL018)
  var have = {};
  sheetToObjects('App Settings').forEach(function (r) { have[String(r.key)] = 1; });
  Object.keys(R34_SETTINGS).forEach(function (k) { if (!have[k]) setSetting(k, R34_SETTINGS[k](), 'system 3.4.0'); });
  if (!have.departments_roster_340) { // once: add the roster departments that are missing (never renames or removes)
    var list = have.departments ? r34DeptList() : R34_BASE_DEPTS.slice();
    R34_ROSTER_DEPTS.forEach(function (d) {
      if (list.some(function (x) { return String(x).toLowerCase() === d.toLowerCase(); })) return;
      var oi = list.indexOf('Other'); if (oi >= 0) list.splice(oi, 0, d); else list.push(d);
    });
    setSetting('departments', JSON.stringify(list), 'system 3.4.0');
    setSetting('departments_roster_340', 'added: ' + R34_ROSTER_DEPTS.join(', '), 'system 3.4.0');
  }
  try { if (c) c.put('pcr_r34_schema_1', '1', 21600); } catch (e2) {}
}

function r34DeptList() {
  var v = r34Json(getSetting('departments', ''), null);
  if (!Array.isArray(v) || !v.length) v = R34_BASE_DEPTS.concat(R34_ROSTER_DEPTS);
  var seen = {};
  return v.map(function (x) { return String(x || '').trim(); }).filter(function (x) { var k = x.toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; });
}
/** Public (sign-up form needs it): the department list. */
function getDepartments() {
  try { r34Ensure(); } catch (e) {}
  return { success: true, data: { departments: r34DeptList() } };
}

/* ---------- small helpers ---------- */
function r34Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function r34Today() { return fijiDateString(getFijiNow()); }
function r34D(iso) { var p = String(iso).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function r34Iso(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
function r34Add(iso, n) { var d = r34D(iso); d.setUTCDate(d.getUTCDate() + n); return r34Iso(d); }
function r34Wd(iso) { return r34D(iso).getUTCDay(); }
function r34Monday(iso) { var w = r34Wd(iso); return r34Add(iso, w === 0 ? -6 : 1 - w); }
function r34DiffDays(a, b) { return Math.round((r34D(b) - r34D(a)) / 86400000); }
function r34MonthKey(iso) { return String(iso).slice(0, 7); }
function r34MonthAdd(key, n) { var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n; var d = new Date(Date.UTC(y, m, 1)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); }
function r34MonthEnd(key) { var y = +key.slice(0, 4), m = +key.slice(5, 7); return key + '-' + pad2(new Date(Date.UTC(y, m, 0)).getUTCDate()); }
var R34_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var R34_MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function r34Label(iso) { var d = r34D(iso); return R34_WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + R34_MN[d.getUTCMonth()]; }
function r34MonthLabel(key) { return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
function r34Clock(hhmm) { var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) + ':' + m[2] : String(hhmm || ''); }
function r34Bump() { try { scBump('r34'); } catch (e) {} }
function r34Json(s, fb) { try { var v = JSON.parse(String(s || '')); return v == null ? fb : v; } catch (e) { return fb; } }
function r34IsoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(r34D(s).getTime()) && r34Iso(r34D(s)) === s; }
function r34Pk(v) { return String(v == null ? '' : v).replace(/^'/, ''); }

/** Text-safe cell: Sheets must not turn 2026-10-05, 07:00, 24/8 or 08 into dates / numbers; formulas never run. */
function r34Cell(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number') return v;
  var s = String(v);
  if (!s) return '';
  if (s.charAt(0) === "'") return s;
  if (/^[=+\-@]/.test(s) || /^[\d\s.:\/\-]+$/.test(s) || /^(true|false)$/i.test(s)) return "'" + s;
  return s;
}
function r34Append(name, headers, objs) {
  if (!objs || !objs.length) return 0;
  var sh = ensureSheet(getSS(), name, headers);
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var start = sh.getLastRow() + 1;
  for (var i = 0; i < objs.length; i += R34_BATCH) {
    var part = objs.slice(i, i + R34_BATCH).map(function (o) { return hdr.map(function (h) { return r34Cell(o[h]); }); });
    sh.getRange(start + i, 1, part.length, hdr.length).setValues(part);
  }
  scInvalidateSheet(name);
  return objs.length;
}
/** Delete rows matching pred in one pass: a few contiguous blocks → deleteRows per block; otherwise filter + rewrite. */
function r34DeleteWhere(name, pred) {
  var sh = getSS().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return 0;
  var vals = sh.getDataRange().getValues(), hdr = vals[0].map(String);
  var keep = [], gone = [];
  for (var i = 1; i < vals.length; i++) {
    var o = {}, empty = true;
    for (var j = 0; j < hdr.length; j++) { o[hdr[j]] = sheetCellToValue(vals[i][j], hdr[j]); if (o[hdr[j]] !== '' && o[hdr[j]] !== null) empty = false; }
    if (!empty && pred(o)) gone.push(i + 1); else keep.push(vals[i]);
  }
  if (!gone.length) return 0;
  var runs = [];
  gone.forEach(function (r) { var last = runs[runs.length - 1]; if (last && last[0] + last[1] === r) last[1]++; else runs.push([r, 1]); });
  if (keep.length && runs.length <= 12) {
    for (var k = runs.length - 1; k >= 0; k--) sh.deleteRows(runs[k][0], runs[k][1]);
  } else {
    sh.getRange(2, 1, vals.length - 1, hdr.length).clearContent();
    for (var b = 0; b < keep.length; b += R34_BATCH) {
      var part = keep.slice(b, b + R34_BATCH).map(function (row) { return row.map(r34Cell); });
      sh.getRange(2 + b, 1, part.length, hdr.length).setValues(part);
    }
  }
  scInvalidateSheet(name);
  return gone.length;
}
/* 3.4.0: patch many rows in one pass (one header + id read) instead of one updateRowById per row,
   which re-reads the whole sheet each time and made whole-resort uploads time out. */
function r34PatchRows(sheetName, list) {
  if (!list || !list.length) return 0;
  var sh = getSS().getSheetByName(sheetName);
  if (list.length <= 3 || !sh || typeof sh.getRange !== 'function') {
    list.forEach(function (x) { updateRowById(sheetName, x.u.id, x.patch); }); return list.length;
  }
  var last = sh.getLastRow(), lc = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(String), idCol = headers.indexOf('id');
  var ids = last > 1 ? sh.getRange(2, idCol + 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var pos = {}; ids.forEach(function (id, i) { pos[id] = i + 2; });
  var n = 0;
  list.forEach(function (x) {
    var row = pos[String(x.u.id)]; if (!row) return;
    Object.keys(x.patch).forEach(function (k) { var c = headers.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(x.patch[k] === true ? 'TRUE' : x.patch[k] === false ? 'FALSE' : x.patch[k]); });
    n++;
  });
  scInvalidateSheet(sheetName);
  return n;
}
function r34Lock() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Server busy — another roster is being saved. Try again in a minute.');
  return lock;
}

/* ---------- settings: leave types + roster codes ---------- */
function r34LeaveTypes() {
  var list = r34Json(getSetting('leave_types', ''), null);
  if (!Array.isArray(list) || !list.length) list = R34_DEFAULT_LEAVE_TYPES;
  return list.filter(function (t) { return t && String(t.name || '').trim(); }).map(function (t) {
    return { name: String(t.name).trim().substring(0, 40), short: String(t.short || t.name).trim().substring(0, 20), balance: t.balance !== false && !t.dayOff,
      dayOff: !!t.dayOff, aliases: (Array.isArray(t.aliases) ? t.aliases : []).map(function (a) { return String(a).trim(); }).filter(Boolean) };
  });
}
function r34LeaveTypeNames() { return r34LeaveTypes().map(function (t) { return t.name; }); }
/** Canonical leave type name for a request / roster code value ('' when unknown and strict; 'Other' when loose). */
function r34CanonLeaveType(v, loose) {
  var s = r34Lower(v), list = r34LeaveTypes();
  for (var i = 0; i < list.length; i++) {
    if (r34Lower(list[i].name) === s || r34Lower(list[i].short) === s) return list[i].name;
    for (var j = 0; j < list[i].aliases.length; j++) if (r34Lower(list[i].aliases[j]) === s) return list[i].name;
  }
  if (!loose) return '';
  var other = list.filter(function (t) { return /^other$/i.test(t.name); })[0];
  return other ? other.name : 'Other';
}
function r34TypeInfo(name) { var n = r34Lower(name); return r34LeaveTypes().filter(function (t) { return r34Lower(t.name) === n; })[0] || null; }
function r34Codes() {
  var m = r34Json(getSetting('roster_leave_codes', ''), null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) m = R34_DEFAULT_CODES;
  var out = {};
  Object.keys(m).forEach(function (k) { var kk = r34CodeKey(k); if (kk) out[kk] = String(m[k]).trim(); });
  return out;
}

/* ---------- parsing a roster cell / time ---------- */
function r34Time(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/) || s.match(/^(\d{2})(\d{2})\s*(am|pm)?$/);
  if (!m) return '';
  var h = Number(m[1]), mi = Number(m[2] || 0), ap = m[3] || '';
  if (ap.charAt(0) === 'p' && h < 12) h += 12;
  if (ap.charAt(0) === 'a' && h === 12) h = 0;
  if (h > 24 || mi > 59) return '';
  return pad2(h % 24) + ':' + pad2(mi);
}
/** "07:00-15:00", "7-3", "0700-1500", "7am-3pm", "AM 6:00-14:00", "OFF", "AL", "PH" → { start, end, code, dayOff, leaveType, roleLabel, unknown } */
/** Pranav (2 Oct 2026): RELEASE / RELEASED / STAFF RELEASE = the person was let go or left — not leave; a separation marker.
 *  TRAINING (and typos) = a working / training day. ON = a working day of the Stores 12-on / 4-off rotation. SDD: unknown, kept as text. */
var R34_RELEASE_RE = /^(STAFF )?RELEASED?( FROM DUTY)?$/;
var R34_WORK_RE = /^(TRAI+N?I*NG|ON|ON DUTY)$/;
function r34IsReleased(e) { return !!e && String(e.code || '').toUpperCase() === 'RELEASED'; }
function r34ParseCell(cell, codes) {
  codes = codes || r34Codes();
  var s = String(cell == null ? '' : cell).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  var up = r34CodeKey(s);
  if (codes[up] !== undefined) return r34CodeEntry(up, codes[up]);
  if (R34_RELEASE_RE.test(up)) return { start: '', end: '', code: 'RELEASED', dayOff: false, leaveType: '', roleLabel: '', unknown: false, released: true };
  if (R34_WORK_RE.test(up)) return { start: '', end: '', code: up.substring(0, 16), dayOff: false, leaveType: '', roleLabel: /^ON/.test(up) ? 'On (rotation)' : 'Training', unknown: false };
  var fz = /\d/.test(up.replace(/\(\d+\)$/, '')) ? '' : r34FuzzyCode(up, codes);
  if (fz) { var fe = r34CodeEntry(fz, codes[fz]); fe.code = up.substring(0, 16); return fe; }
  var T = '(\\d{1,2}(?:[:.h]\\d{2})?\\s*(?:am|pm|a|p)?|\\d{4})';
  var re = new RegExp('^(?:([A-Za-z][A-Za-z /]{0,11}?)\\s+)?' + T + '\\s*(?:-|–|—|to)\\s*' + T + '$', 'i');
  var m = s.match(re);
  if (m) {
    var a = r34Time(m[2]), b = r34Time(m[3]);
    if (a && b) {
      var rawA = String(m[2]).trim(), rawB = String(m[3]).trim();
      // "7-3" (no minutes, no am/pm): an end before the start is in the afternoon
      if (/^\d{1,2}$/.test(rawA) && /^\d{1,2}$/.test(rawB) && b < a && Number(rawB) + 12 <= 24) b = r34Time(String(Number(rawB) + 12));
      var lab = String(m[1] || '').trim(), labUp = r34CodeKey(lab);
      if (lab && codes[labUp] !== undefined) return r34CodeEntry(labUp, codes[labUp]);
      return { start: a, end: b, code: '', dayOff: false, leaveType: '', roleLabel: lab, unknown: false };
    }
  }
  return { start: '', end: '', code: up.substring(0, 16), dayOff: false, leaveType: '', roleLabel: '', unknown: true };
}
function r34CodeEntry(code, typeName) {
  var canon = r34CanonLeaveType(typeName, false) || String(typeName || '');
  var info = r34TypeInfo(canon);
  var isOff = !info || info.dayOff;
  return { start: '', end: '', code: code, dayOff: true, leaveType: isOff ? '' : canon, roleLabel: '', unknown: false };
}
/** One uploaded row → normalised entry (rows layout: start/end/dayOff/code; grid layout: cell). */
function r34NormRow(row, codes) {
  var e = null;
  if (row.cell !== undefined && row.cell !== null && String(row.cell).trim() !== '') e = r34ParseCell(row.cell, codes);
  else if (String(row.code || '').trim()) e = r34ParseCell(row.code, codes);
  if (!e || (e.unknown && (row.start || row.end))) {
    var off = row.dayOff === true || /^(true|yes|y|1|off|day ?off|x)$/i.test(String(row.dayOff == null ? '' : row.dayOff).trim());
    var st = r34Time(row.start), en = r34Time(row.end);
    if (off) e = r34CodeEntry('OFF', codes['OFF'] || 'Day off');
    else if (st || en) e = { start: st, end: en, code: e ? e.code : '', dayOff: false, leaveType: '', roleLabel: '', unknown: false };
  }
  if (e && row.roleLabel && !e.roleLabel) e.roleLabel = String(row.roleLabel).substring(0, 80);
  return e;
}

/* ---------- matching names to Users (name AND department) ---------- */
function r34Norm(s) {
  var t = String(s == null ? '' : s);
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return t.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\b(mr|mrs|ms|miss|dr)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function r34Tokens(s) { var n = r34Norm(s); return n ? n.split(' ') : []; }
function r34Key(tokens) { return tokens.slice().sort().join(' '); }
function r34DeptKey(d) { return String(d == null ? '' : d).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]/g, ''); }
function r34DeptEq(a, b) {
  var x = r34DeptKey(a), y = r34DeptKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 3 && y.length >= 3 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
}
function r34MapKey(name, dept) { return r34Norm(name) + '|' + r34DeptKey(dept); }
function r34UserName(u) { return (String(u.firstName || '') + ' ' + String(u.lastName || '')).trim() || String(u.email || ''); }
function r34Matchable(u) { return truthy(u.active) && !isSuperPerm(u) && String(u.email || '').indexOf('@') > 0; }
/** Prepare users + saved links once per request. */
function r34MatchCtx(users) {
  users = (users || sheetToObjects('Users')).filter(r34Matchable);
  var byEmail = {}, byCode = {};
  users.forEach(function (u) {
    var f = r34Tokens(u.firstName), l = r34Tokens(u.lastName), pf = r34Tokens(u.preferredName);
    var v = {};
    if (f.length || l.length) v[r34Key(f.concat(l))] = 1;
    if (f.length > 1 && l.length) v[r34Key([f[0]].concat(l))] = 1;
    if (pf.length && l.length) v[r34Key(pf.concat(l))] = 1;
    u._variants = v; u._first = f.concat(pf); u._last = l;
    byEmail[r34Lower(u.email)] = u;
    var ec = r34EmpCode(u.employeeCode); if (ec) byCode[ec] = u;
  });
  var map = {};
  sheetToObjects(R34.MAP).forEach(function (m) { var u = byEmail[r34Lower(m.userEmail)]; if (u) map[r34MapKey(m.rosterName, m.department)] = u; });
  return { users: users, byEmail: byEmail, map: map, byCode: byCode };
}
function r34Sugg(u, why) { return { email: r34Lower(u.email), name: r34UserName(u), department: u.department || '', why: why }; }
/** → { user, how } or { user:null, reason, suggestions[] }. Only a saved link or ONE exact full name in the department auto-assigns. */
/** "GL018", "gl 18", "GL-018" → "GL018" ('' = not a code) */
function r34EmpCode(v) {
  var s = String(v == null ? '' : v).toUpperCase().replace(/[\s\-_.]/g, '');
  var m = s.match(/^([A-Z]{1,4})(\d{1,6})$/);
  return m ? m[1] + (m[2].length < 3 ? ('000' + m[2]).slice(-3) : m[2]) : '';
}
/** Order: employee code (when the roster has one) → the saved name link → one exact full name in the department. */
function r34Match(rawName, dept, mc, empCode) {
  var cm = String(rawName || '').match(/^\s*([A-Za-z]{1,4}[\s\-]?\d{2,6})\b[\s\-.:,]*(.*)$/); // "GL018 Solomoni N" (code typed in front of the name)
  if (cm && r34EmpCode(cm[1]) && /^[A-Za-z]{2}/.test(cm[1])) { if (!empCode) empCode = cm[1]; rawName = cm[2] || rawName; }
  var ec = r34EmpCode(empCode);
  if (ec && mc.byCode && mc.byCode[ec]) return { user: mc.byCode[ec], how: 'code' };
  var toks = r34Tokens(rawName);
  if (!toks.length) return { user: null, reason: 'blank name', suggestions: [] };
  var linked = mc.map[r34MapKey(rawName, dept)];
  if (linked) return { user: linked, how: 'link' };
  var key = r34Key(toks);
  var inDept = dept ? mc.users.filter(function (u) { return r34DeptEq(u.department, dept); }) : mc.users;
  var exact = inDept.filter(function (u) { return u._variants[key]; });
  if (exact.length === 1 && toks.length >= 2) return { user: exact[0], how: 'exact' };
  var sugg = [], seen = {};
  var add = function (u, why) { var k = r34Lower(u.email); if (seen[k] || sugg.length >= 6) return; seen[k] = 1; sugg.push(r34Sugg(u, why)); };
  exact.forEach(function (u) { add(u, 'same name'); });
  var reason;
  var initOnly = toks.length === 2 && (toks[0].length === 1 || toks[1].length === 1);
  if (initOnly) {
    var fn = toks[0].length === 1 ? toks[1] : toks[0], ini = toks[0].length === 1 ? toks[0] : toks[1];
    inDept.forEach(function (u) { if (u._first.indexOf(fn) >= 0 && u._last.some(function (l) { return l.charAt(0) === ini; })) add(u, 'first name + initial'); });
  }
  if (exact.length > 1) reason = 'Several people in ' + (dept || 'the resort') + ' have this name';
  else if (toks.length === 1) reason = 'First name only';
  else if (initOnly) reason = 'First name + initial only — please confirm';
  else reason = dept ? 'No exact match in ' + dept : 'No exact match (no department in the file)';
  inDept.forEach(function (u) {
    var hitF = toks.some(function (t) { return u._first.indexOf(t) >= 0; }), hitL = toks.some(function (t) { return u._last.indexOf(t) >= 0; });
    var init = toks.some(function (t) { return t.length === 1 && u._first.some(function (f) { return f.charAt(0) === t; }); });
    if ((hitF && hitL) || (hitL && init)) add(u, 'close match');
  });
  inDept.forEach(function (u) { if (toks.some(function (t) { return u._first.indexOf(t) >= 0 || u._last.indexOf(t) >= 0; })) add(u, toks.length === 1 ? 'first name' : 'part of the name'); });
  if (dept) mc.users.forEach(function (u) { if (u._variants[key] && !r34DeptEq(u.department, dept)) add(u, 'same name, other department (' + (u.department || '—') + ')'); });
  return { user: null, reason: reason, suggestions: sugg };
}

/* ---------- auth ---------- */
function r34FlagOn() { return isFeatureEnabled('feature_my_schedule'); }
function r34Need(p, kind, dept) {
  var me = v3Requester(p);
  if (kind === 'archive') { if (!isSuperPerm(me)) throw new Error('Roster archive: superadmin only'); return me; }
  if (!r34FlagOn()) throw new Error(featureOffMessage('feature_my_schedule'));
  if (kind === 'monthly') { if (!isAdminPerm(me)) throw new Error('Only admins upload the monthly resort roster'); return me; }
  if (kind === 'weekly') {
    if (isAdminPerm(me)) { if (!String(dept || '').trim()) throw new Error('Pick the department for the weekly roster (or All departments for the whole-resort workbook)'); return me; }
    if (!isDeptLead(me)) throw new Error('Only the HOD / assistant HOD uploads the weekly roster');
    if (dept && normDept(dept) !== normDept(me.department)) throw new Error('HODs upload the weekly roster for their own department only');
    return me;
  }
  throw new Error('Unknown roster kind');
}
function r34Uploads() { return sheetToObjects(R34.UPLOADS).filter(function (u) { return u.kind; }); }
function r34ActiveIds(uploads) { var o = {}; (uploads || r34Uploads()).forEach(function (u) { if (String(u.status) === 'active') o[String(u.id)] = u; }); return o; }
function r34Tab(kind) { return kind === 'archive' ? R34.ARCH : R34.SHIFTS; }
function r34Period(kind, key) {
  if (kind === 'weekly') return { start: key, end: r34Add(key, 6) };
  return { start: key + '-01', end: r34MonthEnd(key) };
}
function r34PeriodLabel(kind, key) { return kind === 'weekly' ? 'week of ' + r34Label(key) : r34MonthLabel(key); }
function r34FindUpload(id) { var s = String(id || ''); return sheetToObjects(R34.UPLOADS).filter(function (u) { return String(u.id) === s; })[0] || null; }
function r34ParseRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw === undefined || raw === null || raw === '') return [];
  var v = r34Json(raw, null);
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.shifts)) return v.shifts;
  throw new Error('Rows could not be read');
}

/* ---------- upload: start / chunk / finish ---------- */
function rosterUploadStart(p) {
  r34Ensure();
  var kind = String(p.kind || '').toLowerCase();
  var me = r34Need(p, kind, p.department);
  var key = String(p.periodKey || '').trim(), today = r34Today(), cur = r34MonthKey(today);
  var dept = String(p.department || '').trim();
  if (kind === 'weekly') {
    if (!r34IsoOk(key) || r34Wd(key) !== 1) return { success: false, error: 'Pick the Monday the week starts on' };
    var thisMon = r34Monday(today);
    if (key < r34Add(thisMon, -7) || key > r34Add(thisMon, 56)) return { success: false, error: 'Weekly rosters: last week up to 8 weeks ahead' };
    if (!isAdminPerm(me)) dept = String(me.department || '').trim();
    if (!dept) return { success: false, error: 'Your account has no department' };
  } else {
    if (!/^\d{4}-\d{2}$/.test(key)) return { success: false, error: 'Pick the month (YYYY-MM)' };
    if (kind === 'monthly' && (key < r34MonthAdd(cur, -1) || key > r34MonthAdd(cur, 3))) return { success: false, error: 'Monthly rosters: last month up to 3 months ahead' };
    if (kind === 'archive' && (key < R34_ARCHIVE_FROM || key > cur)) return { success: false, error: 'Archive: past months from January 2026 up to this month' };
    if (!dept) dept = 'ALL';
  }
  var per = r34Period(kind, key), id = uid('rup');
  r34Append(R34.UPLOADS, R34_UPLOAD_HEADERS, [{
    id: id, period: kind === 'weekly' ? 'week' : (kind === 'monthly' ? 'month' : 'archive'), department: dept,
    fileName: String(p.fileName || 'roster').substring(0, 120), fileType: String(p.fileType || '').substring(0, 10), uploadedBy: r34Lower(me.email), uploadedAt: nowIso(),
    rowCount: 0, matchedCount: 0, unmatchedJson: '[]', notes: String(p.notes || '').substring(0, 300), kind: kind, periodKey: key, periodStart: per.start, periodEnd: per.end,
    status: 'staging', layout: String(p.layout || '').substring(0, 20), unmatchedCount: 0, changedCount: 0, finalizedAt: '', totalRows: Number(p.totalRows || 0) || 0,
    chunksDone: '', skippedCount: 0, replacedBy: ''
  }]);
  return { success: true, data: { uploadId: id, kind: kind, periodKey: key, periodStart: per.start, periodEnd: per.end, department: dept, label: r34PeriodLabel(kind, key) } };
}
function rosterUploadChunk(p) {
  var up = r34FindUpload(p.uploadId);
  if (!up) return { success: false, error: 'Upload not found — start again' };
  var kind = String(up.kind);
  var me = r34Need(p, kind, kind === 'weekly' ? up.department : '');
  if (r34Lower(up.uploadedBy) !== r34Lower(me.email)) return { success: false, error: 'This upload was started by someone else' };
  if (String(up.status) !== 'staging') return { success: false, error: 'This upload is already ' + up.status };
  var idx = 'c' + Number(p.chunkIndex || 0);
  var done = String(up.chunksDone || '').split(',').filter(Boolean);
  if (done.indexOf(idx) >= 0) return { success: true, data: { duplicate: true, chunkIndex: Number(p.chunkIndex || 0) } };
  var rows = r34ParseRows(p.shifts !== undefined ? p.shifts : p.shiftsJson);
  if (rows.length > 3000) return { success: false, error: 'Too many rows in one part (max 3000)' };
  var lock = r34Lock();
  try {
    var key = r34Pk(up.periodKey), per = r34Period(kind, key), allDept = String(up.department).toUpperCase() === 'ALL';
    var codes = r34Codes(), mc = r34MatchCtx(), now = nowIso();
    var out = [], groups = {}, skipped = [], unknown = {}, people = {};
    rows.forEach(function (r, i) {
      r = r || {};
      var name = String(r.rawName || r.name || '').replace(/\s+/g, ' ').trim().substring(0, 80);
      var rowDept = (kind === 'weekly' && !allDept) ? String(up.department) : String(r.department || r.dept || (allDept ? '' : up.department)).trim();
      var date = String(r.date || '').trim().slice(0, 10), rn = r.row || (i + 1);
      if (!name) { skipped.push({ row: rn, why: 'no name' }); return; }
      if (!r34IsoOk(date)) { skipped.push({ row: rn, name: name, why: 'date not readable (' + String(r.date || '').substring(0, 20) + ')' }); return; }
      if (date < per.start || date > per.end) { skipped.push({ row: rn, name: name, why: date + ' is outside the ' + r34PeriodLabel(kind, key) }); return; }
      if (kind !== 'weekly' && !allDept && rowDept && !r34DeptEq(rowDept, up.department)) { skipped.push({ row: rn, name: name, why: 'department ' + rowDept + ' is not ' + up.department }); return; }
      var e = r34NormRow(r, codes);
      if (!e) return; // empty cell = nothing rostered that day
      if (e.unknown) unknown[e.code] = (unknown[e.code] || 0) + 1;
      var shift = { date: date, start: e.start, end: e.end, dayOff: e.dayOff, code: e.code, leaveType: e.leaveType, roleLabel: e.roleLabel };
      var m = r34Match(name, rowDept, mc, r.employeeCode || r.empCode || '');
      if (m.user) {
        people[r34Lower(m.user.email)] = 1;
        out.push({ id: uid('rsh'), uploadId: up.id, period: up.period, userEmail: r34Lower(m.user.email), userName: r34UserName(m.user), department: m.user.department || rowDept,
          date: date, start: shift.start, end: shift.end, dayOff: shift.dayOff, roleLabel: shift.roleLabel, rawName: name, createdAt: now, kind: kind, periodKey: key,
          code: shift.code, leaveType: shift.leaveType, rosterDept: rowDept });
      } else {
        var gk = r34MapKey(name, rowDept);
        if (!groups[gk]) groups[gk] = { rawName: name, department: rowDept, reason: m.reason, suggestions: m.suggestions, shifts: [] };
        groups[gk].shifts.push(shift);
      }
    });
    r34Append(r34Tab(kind), R34_SHIFT_HEADERS, out);
    // unmatched: one row per roster name + department in this upload (merged across parts)
    var existing = {};
    sheetToObjects(R34.UNM).forEach(function (u) { if (String(u.uploadId) === String(up.id)) existing[r34MapKey(u.rawName, u.department)] = u; });
    var newUnm = [];
    var unmPatch = [];
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk], ex = existing[gk];
      if (ex) unmPatch.push({ u: ex, patch: { shiftsJson: JSON.stringify(r34Json(ex.shiftsJson, []).concat(g.shifts)) } });
      else newUnm.push({ id: uid('run'), uploadId: up.id, kind: kind, periodKey: key, rawName: g.rawName, department: g.department, shiftsJson: JSON.stringify(g.shifts),
        suggestionsJson: JSON.stringify(g.suggestions), reason: g.reason, status: 'staging', resolvedEmail: '', resolvedBy: '', resolvedAt: '', createdAt: now });
    });
    r34PatchRows(R34.UNM, unmPatch);
    r34Append(R34.UNM, R34_UNM_HEADERS, newUnm);
    done.push(idx);
    updateRowById(R34.UPLOADS, up.id, { rowCount: Number(up.rowCount || 0) + out.length, skippedCount: Number(up.skippedCount || 0) + skipped.length, chunksDone: done.join(',') });
    return { success: true, data: { chunkIndex: Number(p.chunkIndex || 0), shifts: out.length, people: Object.keys(people).length, unmatchedNames: Object.keys(groups).length,
      skipped: skipped.slice(0, 30), skippedCount: skipped.length, unknownCodes: unknown } };
  } finally { lock.releaseLock(); }
}
function r34Fp(s) { return [r34Time(s.start) || '', r34Time(s.end) || '', truthy(s.dayOff) ? 'off' : '', String(s.code || '').toUpperCase(), s.leaveType || ''].join('|'); }
function r34EntryText(s) {
  if (!s) return 'no shift';
  if (s.leaveType) return s.leaveType;
  if (truthy(s.dayOff)) return 'day off';
  if (s.start) return r34Clock(s.start) + (s.end ? '–' + r34Clock(s.end) : '');
  return s.code || 'no shift';
}
function rosterUploadFinish(p) {
  var up = r34FindUpload(p.uploadId);
  if (!up) return { success: false, error: 'Upload not found — start again' };
  var kind = String(up.kind);
  var me = r34Need(p, kind, kind === 'weekly' ? up.department : '');
  if (r34Lower(up.uploadedBy) !== r34Lower(me.email)) return { success: false, error: 'This upload was started by someone else' };
  if (String(up.status) !== 'staging') return { success: false, error: 'This upload is already ' + up.status };
  var lock = r34Lock();
  try {
    var key = r34Pk(up.periodKey), tab = r34Tab(kind), today = r34Today();
    var uploads = r34Uploads(), active = r34ActiveIds(uploads);
    var allDept = String(up.department).toUpperCase() === 'ALL';
    var stale = {};
    uploads.forEach(function (u) { if (String(u.status) === 'staging' && String(u.id) !== String(up.id) && v3ParseFiji(u.uploadedAt) < Date.now() - 86400000) stale[String(u.id)] = 1; });
    var rows = sheetToObjects(tab).filter(function (s) { return s.kind; });
    var inScope = function (s) {
      return String(s.kind) === kind && r34Pk(s.periodKey) === key && String(s.uploadId) !== String(up.id) && active[String(s.uploadId)] &&
        (allDept || r34DeptEq(s.rosterDept || s.department, up.department) || (kind === 'weekly' && r34DeptEq(s.department, up.department)));
    };
    var oldRows = rows.filter(inScope), newRows = rows.filter(function (s) { return String(s.uploadId) === String(up.id); });
    // change notices: computed from the stored rows (old active scope vs this upload), today onwards, dates this roster decides
    var changed = [];
    if (kind !== 'archive') {
      var weeklyCover = {};
      if (kind === 'monthly') rows.forEach(function (s) { if (String(s.kind) === 'weekly' && active[String(s.uploadId)]) weeklyCover[r34Lower(s.userEmail) + '|' + r34Pk(s.periodKey)] = 1; });
      var by = function (list) { var o = {}; list.forEach(function (s) { var d = String(s.date).slice(0, 10); if (d < today) return; (o[r34Lower(s.userEmail)] = o[r34Lower(s.userEmail)] || {})[d] = s; }); return o; };
      var o1 = by(oldRows), n1 = by(newRows), emails = {};
      if (kind === 'weekly') { // nobody on an earlier weekly roster for this week → compare with what they saw (the monthly roster)
        var perW = r34Period(kind, key), base = rows.filter(function (s) {
          var d = String(s.date).slice(0, 10), em = r34Lower(s.userEmail);
          return String(s.kind) === 'monthly' && active[String(s.uploadId)] && d >= perW.start && d <= perW.end && n1[em] && !o1[em];
        }), bm = by(base);
        Object.keys(bm).forEach(function (em) { o1[em] = bm[em]; });
      }
      Object.keys(o1).concat(Object.keys(n1)).forEach(function (e) { emails[e] = 1; });
      var per = r34Period(kind, key), had = {};
      Object.keys(o1).forEach(function (em) { had[em] = 1; });
      Object.keys(emails).forEach(function (em) {
        var a = o1[em] || {}, b = n1[em] || {}, diffs = [];
        for (var d = per.start < today ? today : per.start; d <= per.end; d = r34Add(d, 1)) {
          if (kind === 'monthly' && weeklyCover[em + '|' + r34Monday(d)]) continue; // the weekly roster decides that date
          var fa = a[d] ? r34Fp(a[d]) : '', fb = b[d] ? r34Fp(b[d]) : '';
          if (fa !== fb) diffs.push(r34Label(d) + ': ' + r34EntryText(b[d]));
        }
        if (diffs.length) changed.push({ email: em, first: !had[em], diffs: diffs });
      });
    }
    var oldIds = {}; oldRows.forEach(function (s) { oldIds[String(s.id)] = 1; });
    r34DeleteWhere(tab, function (s) { return oldIds[String(s.id)] || stale[String(s.uploadId)]; });
    var left = {};
    rows.forEach(function (s) { if (!oldIds[String(s.id)]) left[String(s.uploadId)] = 1; });
    uploads.forEach(function (u) {
      if (String(u.id) === String(up.id)) return;
      if (stale[String(u.id)]) { updateRowById(R34.UPLOADS, u.id, { status: 'abandoned' }); return; }
      if (String(u.status) === 'active' && String(u.kind) === kind && r34Pk(u.periodKey) === key && (allDept || r34DeptEq(u.department, up.department) || !left[String(u.id)]))
        updateRowById(R34.UPLOADS, u.id, { status: 'replaced', replacedBy: up.id });
    });
    // unmatched of this upload → open; older open ones of the same scope → superseded
    var openList = [], unmSt = [];
    sheetToObjects(R34.UNM).forEach(function (u) {
      if (String(u.uploadId) === String(up.id) && String(u.status) === 'staging') { unmSt.push({ u: u, patch: { status: 'open' } }); openList.push(u); }
      else if (String(u.status) === 'open' && String(u.kind) === kind && r34Pk(u.periodKey) === key && (allDept || r34DeptEq(u.department, up.department)) && String(u.uploadId) !== String(up.id))
        unmSt.push({ u: u, patch: { status: 'superseded' } });
    });
    r34PatchRows(R34.UNM, unmSt);
    var people = {}; newRows.forEach(function (s) { people[r34Lower(s.userEmail)] = 1; });
    var dups = kind === 'weekly' ? r34SameShifts(newRows, rows, uploads, up) : [];
    var released = r34ReleasedList(newRows);
    updateRowById(R34.UPLOADS, up.id, { notes: dups.length ? ('possible duplicate of ' + dups.map(function (d) { return d.label; }).join(', ')).substring(0, 200) : String(up.notes || ''), status: 'active', finalizedAt: nowIso(), rowCount: newRows.length, matchedCount: Object.keys(people).length,
      unmatchedCount: openList.length, changedCount: changed.length, unmatchedJson: JSON.stringify(openList.map(function (u) { return u.rawName; }).slice(0, 100)) });
    var lbl = r34PeriodLabel(kind, key);
    var notes = changed.map(function (c) {
      return { id: uid('ntf'), userEmail: c.email, title: c.first ? 'Your roster for the ' + lbl + ' is in the app' : 'Your roster changed (' + lbl + ')',
        body: (c.first ? 'Open Schedule to see your shifts. ' : '') + c.diffs.slice(0, 3).join(' · ') + (c.diffs.length > 3 ? ' (+' + (c.diffs.length - 3) + ' more)' : ''),
        kind: 'roster', relatedId: up.id, read: false, createdAt: nowIso() };
    });
    if (notes.length) r3NotifyMany(notes);
    r34Bump();
    return { success: true, data: { uploadId: up.id, kind: kind, periodKey: key, label: lbl, department: up.department, shifts: newRows.length,
      people: Object.keys(people).length, possibleDuplicateOf: dups, released: released, replacedRows: oldRows.length, changed: changed.length, notified: notes.length, changedEmails: changed.map(function (c) { return c.email; }),
      unmatched: openList.map(function (u) { return { id: u.id, rawName: u.rawName, department: u.department, reason: u.reason, suggestions: r34Json(u.suggestionsJson, []) }; }) } };
  } finally { lock.releaseLock(); }
}

/** RELEASED on a roster → "possibly left from <date>" per active user (earliest date). Never changes the account; admins decide in Users. */
function r34ReleasedList(list) {
  var o = {};
  list.forEach(function (s) {
    if (String(s.code || '').toUpperCase() !== 'RELEASED') return;
    var em = r34Lower(s.userEmail), d = String(s.date).slice(0, 10);
    if (!em) return;
    if (!o[em] || d < o[em].from) o[em] = { email: em, name: s.userName || s.rawName, department: s.department, from: d, label: r34Label(d) };
  });
  return Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { var u = findUserByEmail(x.email); return u && truthy(u.active); }).sort(function (a, b) { return a.from < b.from ? -1 : 1; }).slice(0, 100);
}
/** "Possible duplicate": another active weekly upload (another week) has exactly the same shifts for the same people on the same weekdays
 *  (real files: "we 24 May" = "we 17 May" with only the dates changed). → [{ periodKey, label, department, uploadedBy }] */
function r34Sig(list, start, depts) {
  var a = [];
  list.forEach(function (s) {
    if (depts && !depts[r34DeptKey(s.rosterDept || s.department)]) return;
    var off = Math.round((Date.parse(String(s.date).slice(0, 10) + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
    a.push(r34Lower(s.userEmail) + '|' + off + '|' + r34Fp(s));
  });
  return a.sort().join('\n');
}
function r34SameShifts(newRows, rows, uploads, up) {
  if (newRows.length < 3) return [];
  var key = r34Pk(up.periodKey), depts = {};
  newRows.forEach(function (s) { depts[r34DeptKey(s.rosterDept || s.department)] = 1; });
  var mine = r34Sig(newRows, r34Period('weekly', key).start, null), by = {};
  rows.forEach(function (s) { if (String(s.kind) === 'weekly' && r34Pk(s.periodKey) !== key) (by[String(s.uploadId)] = by[String(s.uploadId)] || []).push(s); });
  var out = [];
  uploads.forEach(function (u) {
    if (String(u.kind) !== 'weekly' || String(u.status) !== 'active' || !by[String(u.id)]) return;
    var pk = r34Pk(u.periodKey);
    if (r34Sig(by[String(u.id)], r34Period('weekly', pk).start, depts) === mine) out.push({ periodKey: pk, label: r34PeriodLabel('weekly', pk), department: u.department, uploadedBy: u.uploadedBy });
  });
  return out.slice(0, 5);
}

/* ---------- resolution: weekly → monthly → archive ---------- */
/** rows (current + archive) → { email: { date: entry } } for [from, to]. */
function r34Index(rows, active, from, to, emailFilter) {
  var W = {}, M = {}, A = {}, wCover = {}, mCover = {}, aCover = {}, emails = {};
  rows.forEach(function (s) {
    if (!active[String(s.uploadId)]) return;
    var em = r34Lower(s.userEmail);
    if (!em || (emailFilter && !emailFilter[em])) return;
    var d = String(s.date).slice(0, 10), k = String(s.kind), pk = r34Pk(s.periodKey);
    var e = { date: d, start: r34Time(s.start) || String(s.start || ''), end: r34Time(s.end) || String(s.end || ''), dayOff: truthy(s.dayOff), code: String(s.code || ''),
      leaveType: String(s.leaveType || ''), role: String(s.roleLabel || ''), source: k };
    var inR = d >= from && d <= to;
    emails[em] = 1;
    if (k === 'weekly') { (wCover[em] = wCover[em] || {})[pk] = 1; if (inR) (W[em] = W[em] || {})[d] = e; }
    else if (k === 'monthly') { (mCover[em] = mCover[em] || {})[pk] = 1; if (inR) (M[em] = M[em] || {})[d] = e; }
    else if (k === 'archive') { (aCover[em] = aCover[em] || {})[pk] = 1; if (inR) (A[em] = A[em] || {})[d] = e; }
  });
  var out = {};
  Object.keys(emails).forEach(function (em) {
    var res = {};
    for (var d = from; d <= to; d = r34Add(d, 1)) {
      var wk = r34Monday(d), mk = r34MonthKey(d);
      if (wCover[em] && wCover[em][wk]) res[d] = (W[em] && W[em][d]) || { date: d, none: true, source: 'weekly' };
      else if (mCover[em] && mCover[em][mk]) res[d] = (M[em] && M[em][d]) || { date: d, none: true, source: 'monthly' };
      else if (aCover[em] && aCover[em][mk]) res[d] = (A[em] && A[em][d]) || { date: d, none: true, source: 'archive' };
    }
    out[em] = res;
  });
  return out;
}
function r34AllRows(withArchive) {
  var rows = sheetToObjects(R34.SHIFTS).filter(function (s) { return s.kind; });
  if (withArchive) rows = rows.concat(sheetToObjects(R34.ARCH).filter(function (s) { return s.kind; }));
  return rows;
}
/** This user's resolved days for the whole year (+62 days ahead), cached per roster version. */
function r34UserDays(email) {
  email = r34Lower(email);
  var today = r34Today(), from = today.slice(0, 4) + '-01-01', to = r34Add(today, 62);
  var ck = null;
  try { ck = scKey('r34', 'days:' + email + ':' + today); var hit = scGetJson(ck); if (hit) return hit; } catch (e) { ck = null; }
  var f = {}; f[email] = 1;
  var idx = r34Index(r34AllRows(true), r34ActiveIds(), from, to, f);
  var days = idx[email] || {};
  if (ck) { try { scPutJson(ck, days, 21600); } catch (e2) {} }
  return days;
}
function r34NonWorking(e) { return !!e && (!!e.none || truthy(e.dayOff) || !!e.leaveType || !!e.appLeave); }
function r34Working(e) { return !!e && !r34NonWorking(e) && !r34IsReleased(e) && !!(e.start || e.code); }
/** Leave in the app → approved { date: type } and pending { date: type }. */
function r34AppLeave(email, from, to) {
  var ok = {}, pend = {};
  sheetToObjects('Leave Requests').forEach(function (l) {
    if (r34Lower(l.userEmail) !== r34Lower(email)) return;
    var st = String(l.status), s = v3Date(l.startDate), e = v3Date(l.endDate || l.startDate);
    if (!r34IsoOk(s) || !r34IsoOk(e)) return;
    var bucket = st === 'approved' ? ok : (/^pending/.test(st) ? pend : null);
    if (!bucket) return;
    var t = r34CanonLeaveType(l.leaveType || 'Other', true);
    for (var d = s < from ? from : s; d <= e && d <= to; d = r34Add(d, 1)) bucket[d] = t;
  });
  return { approved: ok, pending: pend };
}
function r34Allowance(rows, email, dept, type) {
  var t = r34Lower(type), em = r34Lower(email);
  var pick = function (f) { var r = rows.filter(function (a) { return r34Lower(a.leaveType) === t && f(a); })[0]; return r && String(r.daysPerYear) !== '' && !isNaN(Number(r.daysPerYear)) ? Number(r.daysPerYear) : null; };
  var v = pick(function (a) { return em && r34Lower(a.email) === em; });
  if (v === null) v = pick(function (a) { return !String(a.email || '').trim() && String(a.department || '').trim() && String(a.department).toUpperCase() !== 'ALL' && r34DeptEq(a.department, dept); });
  if (v === null) v = pick(function (a) { return !String(a.email || '').trim() && (String(a.department || '').trim().toUpperCase() === 'ALL' || !String(a.department || '').trim()); });
  return v;
}
/** Used = approved leave in the app + leave codes in the rosters (archive too), one type per date (the app request wins). */
function r34Balances(user, days, app, year, today, allowRows) {
  var types = r34LeaveTypes().filter(function (t) { return t.balance; });
  var perDate = {};
  Object.keys(days).forEach(function (d) { var e = days[d]; if (d.slice(0, 4) === year && e && e.leaveType) perDate[d] = { type: r34CanonLeaveType(e.leaveType, true), src: 'roster' }; });
  Object.keys(app.approved).forEach(function (d) {
    if (d.slice(0, 4) !== year) return;
    var info = r34TypeInfo(app.approved[d]);
    if (!info || !info.balance) return;
    var e = days[d];
    if (e && truthy(e.dayOff) && !e.leaveType) return; // a normal roster day off inside the leave dates is not a leave day
    perDate[d] = { type: info.name, src: 'app' };
  });
  allowRows = allowRows || sheetToObjects(R34.ALLOW);
  return types.map(function (t) {
    var used = 0, booked = 0, fromRoster = 0, fromApp = 0;
    Object.keys(perDate).forEach(function (d) {
      if (perDate[d].type !== t.name) return;
      if (d <= today) used++; else booked++;
      if (perDate[d].src === 'roster') fromRoster++; else fromApp++;
    });
    var allow = r34Allowance(allowRows, user.email, user.department, t.name);
    return { type: t.name, short: t.short, used: used, booked: booked, fromRoster: fromRoster, fromApp: fromApp, allowance: allow,
      remaining: allow === null ? null : Math.max(0, allow - used - booked) };
  });
}
function r34Out(e, d) {
  if (!e) return { date: d, label: r34Label(d), status: 'unknown', text: 'Not on a roster yet' };
  var o = { date: d, label: r34Label(d), start: e.start || '', end: e.end || '', code: e.code || '', leaveType: e.leaveType || e.appLeave || '', source: e.source || '', role: e.role || '' };
  if (e.appLeave && !e.leaveType) { o.status = 'leave'; o.text = e.appLeave + ' (approved)'; }
  else if (e.leaveType) { o.status = 'leave'; o.text = e.leaveType + (e.code ? ' (' + e.code + ')' : ''); }
  else if (truthy(e.dayOff)) { o.status = 'off'; o.text = 'Day off' + (e.code && e.code !== 'OFF' ? ' (' + e.code + ')' : ''); }
  else if (e.none) { o.status = 'off'; o.text = 'No shift'; }
  else if (r34IsReleased(e)) { o.status = 'released'; o.text = 'Released (not rostered)'; }
  else if (e.start) { o.status = 'work'; o.text = r34Clock(e.start) + (e.end ? ' – ' + r34Clock(e.end) : ''); }
  else { o.status = 'work'; o.text = e.role || e.code || 'Rostered'; }
  if (e.pendingLeave) o.pending = e.pendingLeave;
  return o;
}
/** Countdown to the next day off, or the report-back date while off / on leave (pure). */
function r34Next(days, today, horizon) {
  horizon = horizon || 60;
  var t = days[today], res = { today: today };
  if (r34NonWorking(t)) {
    res.onBreak = true;
    for (var i = 1; i <= horizon; i++) {
      var d = r34Add(today, i), e = days[d];
      if (r34IsReleased(e)) { res.released = { date: d, label: r34Label(d) }; break; }
      if (r34Working(e)) { res.reportBack = { date: d, label: r34Label(d), start: e.start || '', startText: e.start ? r34Clock(e.start) : '', inDays: i }; break; }
      if (!e) break; // no roster that far yet
    }
  } else {
    for (var j = 1; j <= horizon; j++) {
      var d2 = r34Add(today, j), e2 = days[d2];
      if (r34IsReleased(e2)) { res.released = { date: d2, label: r34Label(d2) }; break; }
      if (r34NonWorking(e2)) { res.nextOff = { date: d2, label: r34Label(d2), inDays: j, text: r34Out(e2, d2).text }; break; }
      if (!e2) break;
    }
  }
  return res;
}
/** Users.roster (e.g. "24/8") that Sheets stored as a date → back to text ("24/8"). */
function r34PatternText(v) {
  if (v instanceof Date) return v.getDate() + '/' + (v.getMonth() + 1);
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00(?::00)?)?$/);
  if (m) return Number(m[3]) + '/' + Number(m[2]);
  return s;
}
function getMyRoster(p) {
  var me = v3Requester(p);
  if (isSuperPerm(me)) return { success: false, error: A31_SUPER_BLOCK_MSG, superBlocked: true };
  if (!r34FlagOn()) return { success: false, error: featureOffMessage('feature_my_schedule'), featureOff: true };
  r34Ensure();
  var today = r34Today(), year = today.slice(0, 4);
  var days = JSON.parse(JSON.stringify(r34UserDays(me.email)));
  var app = r34AppLeave(me.email, year + '-01-01', r34Add(today, 62));
  Object.keys(app.approved).forEach(function (d) { var e = days[d] || { date: d, source: 'leave' }; if (!e.leaveType) e.appLeave = app.approved[d]; days[d] = e; });
  Object.keys(app.pending).forEach(function (d) { if (days[d]) days[d].pendingLeave = app.pending[d]; });
  var mon = r34Monday(today), week = [], month = [];
  for (var i = 0; i < 7; i++) { var d = r34Add(mon, i); week.push(r34Out(days[d], d)); }
  var mk = r34MonthKey(today);
  for (var d2 = mk + '-01'; d2 <= r34MonthEnd(mk); d2 = r34Add(d2, 1)) month.push(r34Out(days[d2], d2));
  var leaves = sheetToObjects('Leave Requests').filter(function (l) { return r34Lower(l.userEmail) === r34Lower(me.email); }).map(v3LeaveOut)
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 40);
  var out = {
    today: r34Out(days[today], today), week: { start: mon, end: r34Add(mon, 6), days: week }, month: { key: mk, label: r34MonthLabel(mk), days: month },
    next: r34Next(days, today, 60), balances: r34Balances(me, days, app, year, today), year: year, leaveTypes: r34LeaveTypeNames(), leave: leaves,
    hasRoster: Object.keys(days).some(function (k) { return k >= today && days[k] && days[k].source && days[k].source !== 'leave'; }),
    pattern: r34PatternText(me.roster), department: me.department || '', fijiNow: formatFiji(getFijiNow())
  };
  if (isDeptLead(me) || isAdminPerm(me)) {
    var nextMon = r34Add(mon, 7), ups = r34Uploads();
    out.lead = { isLead: isDeptLead(me), isAdmin: isAdminPerm(me), nextWeek: nextMon, nextWeekLabel: r34Label(nextMon),
      nextWeekDone: ups.some(function (u) { return String(u.kind) === 'weekly' && String(u.status) === 'active' && r34Pk(u.periodKey) === nextMon && (r34DeptEq(u.department, me.department) || String(u.department).toUpperCase() === 'ALL'); }),
      unmatched: r34OpenUnmatched(me).length };
  }
  return { success: true, data: out };
}

/* ---------- unmatched names + saved links ---------- */
function r34OpenUnmatched(me) {
  var admin = isAdminPerm(me), active = r34ActiveIds();
  return sheetToObjects(R34.UNM).filter(function (u) {
    if (String(u.status) !== 'open' || !active[String(u.uploadId)]) return false;
    if (String(u.kind) === 'archive' && !isSuperPerm(me)) return false;
    return admin || (isDeptLead(me) && u.department && r34DeptEq(u.department, me.department));
  });
}
function r34People(me) {
  var admin = isAdminPerm(me);
  return sheetToObjects('Users').filter(r34Matchable).filter(function (u) { return admin || normDept(u.department) === normDept(me.department); })
    .map(function (u) { return { email: r34Lower(u.email), name: r34UserName(u), department: u.department || '' }; })
    .sort(function (a, b) { return (a.department + a.name).localeCompare(b.department + b.name); });
}
function getRosterUnmatched(p) {
  var me = v3Requester(p);
  if (!(isAdminPerm(me) || isDeptLead(me))) return { success: false, error: 'HOD / assistant HOD / admin only' };
  r34Ensure();
  var ups = {}; r34Uploads().forEach(function (u) { ups[String(u.id)] = u; });
  var list = r34OpenUnmatched(me).map(function (u) {
    var up = ups[String(u.uploadId)] || {}, pk = r34Pk(u.periodKey);
    return { id: u.id, rawName: u.rawName, department: u.department || '', reason: u.reason, kind: u.kind, periodKey: pk, label: r34PeriodLabel(String(u.kind), pk),
      shifts: r34Json(u.shiftsJson, []).length, uploadedBy: up.uploadedBy || '', suggestions: r34Json(u.suggestionsJson, []) };
  });
  var admin = isAdminPerm(me);
  var links = sheetToObjects(R34.MAP).filter(function (m) { return admin || r34DeptEq(m.department, me.department); })
    .map(function (m) { return { id: m.id, rosterName: m.rosterName, department: m.department, userEmail: m.userEmail, createdBy: m.createdBy, createdAt: m.createdAt }; });
  return { success: true, data: { unmatched: list, people: r34People(me), links: links, scope: admin ? 'all' : me.department } };
}
/** Link a roster name (+ department) to a user: saved in "Roster Name Map", applied now to every open upload and to future uploads. */
function linkRosterName(p) {
  var me = v3Requester(p);
  r34Ensure();
  var target = findUserByEmail(p.linkEmail);
  if (!target || !r34Matchable(target)) return { success: false, error: 'Pick an active staff account' };
  var unm = p.id ? sheetToObjects(R34.UNM).filter(function (u) { return String(u.id) === String(p.id); })[0] : null;
  if (p.id && !unm) return { success: false, error: 'That name is not in the list any more' };
  var name = unm ? String(unm.rawName) : String(p.rosterName || '').trim(), dept = unm ? String(unm.department || '') : String(p.department || '').trim();
  if (!r34Norm(name)) return { success: false, error: 'Roster name missing' };
  if (!isAdminPerm(me)) {
    if (!isDeptLead(me) || !dept || !r34DeptEq(dept, me.department)) return { success: false, error: 'HODs link names for their own department only' };
    if (normDept(target.department) !== normDept(me.department)) return { success: false, error: 'Pick someone in ' + me.department };
  }
  if (unm && String(unm.kind) === 'archive' && !isSuperPerm(me)) return { success: false, error: 'Archive names: superadmin only' };
  var lock = r34Lock();
  try {
    var mk = r34MapKey(name, dept);
    r34DeleteWhere(R34.MAP, function (m) { return r34MapKey(m.rosterName, m.department) === mk; });
    var linkId = uid('rnm'), now = nowIso();
    r34Append(R34.MAP, R34_MAP_HEADERS, [{ rosterName: name, department: dept, userEmail: r34Lower(target.email), createdBy: r34Lower(me.email), createdAt: now, id: linkId }]);
    var active = r34ActiveIds(), applied = 0, rowsAdded = 0, byTab = {}, notify = {};
    sheetToObjects(R34.UNM).forEach(function (u) {
      if (String(u.status) !== 'open' || r34MapKey(u.rawName, u.department) !== mk) return;
      var up = active[String(u.uploadId)];
      if (!up) { updateRowById(R34.UNM, u.id, { status: 'superseded' }); return; }
      var kind = String(u.kind), key = r34Pk(u.periodKey);
      r34Json(u.shiftsJson, []).forEach(function (s) {
        (byTab[r34Tab(kind)] = byTab[r34Tab(kind)] || []).push({ id: uid('rsh'), uploadId: u.uploadId, period: up.period, userEmail: r34Lower(target.email), userName: r34UserName(target),
          department: target.department || dept, date: s.date, start: s.start, end: s.end, dayOff: !!s.dayOff, roleLabel: s.roleLabel || '', rawName: name, createdAt: now,
          kind: kind, periodKey: key, code: s.code || '', leaveType: s.leaveType || '', rosterDept: dept });
        rowsAdded++;
      });
      updateRowById(R34.UNM, u.id, { status: 'linked', resolvedEmail: r34Lower(target.email), resolvedBy: r34Lower(me.email), resolvedAt: now });
      applied++;
      if (kind !== 'archive') notify[key] = r34PeriodLabel(kind, key);
    });
    Object.keys(byTab).forEach(function (t) { r34Append(t, R34_SHIFT_HEADERS, byTab[t]); });
    var lbls = Object.keys(notify).map(function (k) { return notify[k]; });
    if (lbls.length) v3Notify(target.email, 'Your roster is in the app', 'Your shifts for the ' + lbls.join(', ') + ' are now on your Schedule tab.', 'roster', linkId);
    r34Bump();
    return { success: true, data: { linkId: linkId, rosterName: name, department: dept, userEmail: r34Lower(target.email), userName: r34UserName(target), appliedUploads: applied, shiftsAdded: rowsAdded } };
  } finally { lock.releaseLock(); }
}
function ignoreRosterName(p) {
  var me = v3Requester(p);
  var u = sheetToObjects(R34.UNM).filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!u) return { success: false, error: 'Not found' };
  if (!isAdminPerm(me) && !(isDeptLead(me) && u.department && r34DeptEq(u.department, me.department))) return { success: false, error: 'Not your department' };
  updateRowById(R34.UNM, u.id, { status: 'ignored', resolvedBy: r34Lower(me.email), resolvedAt: nowIso() });
  return { success: true, data: { id: u.id } };
}
function unlinkRosterName(p) {
  var me = v3Requester(p);
  var m = sheetToObjects(R34.MAP).filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!m) return { success: false, error: 'Link not found' };
  if (!isAdminPerm(me) && !(isDeptLead(me) && r34DeptEq(m.department, me.department))) return { success: false, error: 'Not your department' };
  var lock = r34Lock();
  try { r34DeleteWhere(R34.MAP, function (x) { return String(x.id) === String(p.id); }); } finally { lock.releaseLock(); }
  return { success: true, data: { removed: p.id } };
}

/* ---------- admin pages: status, settings, allowances, archive ---------- */
function r34Departments() {
  var o = {};
  r34DeptList().forEach(function (d) { if (d !== 'Other') o[d] = 1; });
  sheetToObjects('Users').forEach(function (u) { var d = String(u.department || '').trim(); if (d && truthy(u.active)) o[d] = 1; });
  return Object.keys(o).sort();
}
function r34UploadOut(u) {
  var pk = r34Pk(u.periodKey);
  return { id: u.id, kind: u.kind, periodKey: pk, department: u.department, fileName: u.fileName, uploadedBy: u.uploadedBy, uploadedAt: u.uploadedAt,
    status: u.status, shifts: Number(u.rowCount || 0), people: Number(u.matchedCount || 0), unmatched: Number(u.unmatchedCount || 0), changed: Number(u.changedCount || 0),
    skipped: Number(u.skippedCount || 0), label: r34PeriodLabel(String(u.kind), pk), notes: String(u.notes || '').substring(0, 200) };
}
function getRosterAdmin(p) {
  var kind = String(p.kind || '').toLowerCase();
  var me = v3Requester(p);
  if (kind === 'archive') { if (!isSuperPerm(me)) return { success: false, error: 'Superadmin only' }; }
  else if (kind === 'monthly') { if (!isAdminPerm(me)) return { success: false, error: 'Admin only' }; }
  else if (kind === 'weekly') { if (!(isAdminPerm(me) || isDeptLead(me))) return { success: false, error: 'HOD / assistant HOD / admin only' }; }
  else return { success: false, error: 'Unknown roster kind' };
  if (kind !== 'archive' && !r34FlagOn()) return { success: false, error: featureOffMessage('feature_my_schedule'), featureOff: true };
  r34Ensure();
  var today = r34Today(), cur = r34MonthKey(today), ups = r34Uploads().filter(function (u) { return String(u.kind) === kind; });
  var dept = kind === 'weekly' ? (isAdminPerm(me) ? String(p.department || me.department || '') : String(me.department || '')) : '';
  if (kind === 'weekly' && dept && dept.toUpperCase() !== 'ALL') ups = ups.filter(function (u) { return r34DeptEq(u.department, dept) || String(u.department).toUpperCase() === 'ALL'; });
  var act = ups.filter(function (u) { return String(u.status) === 'active'; });
  var periods = [], hourNow = getFijiNow().getUTCHours();
  if (kind === 'weekly') {
    var mon = r34Monday(today);
    [-7, 0, 7, 14, 21].forEach(function (k) {
      var key = r34Add(mon, k), a = act.filter(function (u) { return r34Pk(u.periodKey) === key; });
      periods.push({ key: key, label: r34Label(key) + ' – ' + r34Label(r34Add(key, 6)), current: k === 0, next: k === 7, due: 'by ' + r34Label(r34Add(key, -2)) + ' 6:00pm',
        late: !a.length && k === 7 && ((r34Wd(today) === 6 && hourNow >= 18) || r34Wd(today) === 0), uploads: a.map(r34UploadOut) });
    });
  } else {
    var from = kind === 'archive' ? R34_ARCHIVE_FROM : r34MonthAdd(cur, -1), to = kind === 'archive' ? cur : r34MonthAdd(cur, 2);
    for (var m = from; m <= to; m = r34MonthAdd(m, 1)) {
      var a2 = act.filter(function (u) { return r34Pk(u.periodKey) === m; });
      periods.push({ key: m, label: r34MonthLabel(m), current: m === cur, next: m === r34MonthAdd(cur, 1), due: kind === 'monthly' ? 'before 1 ' + r34MonthLabel(m) : '',
        late: kind === 'monthly' && !a2.length && m === r34MonthAdd(cur, 1) && Number(today.slice(8, 10)) >= 28, uploads: a2.map(r34UploadOut) });
    }
    if (kind === 'archive') periods.reverse();
  }
  var recent = ups.filter(function (u) { return String(u.status) !== 'staging'; }).sort(function (a, b) { return String(b.uploadedAt).localeCompare(String(a.uploadedAt)); }).slice(0, 12).map(r34UploadOut);
  var out = { kind: kind, department: dept, myDepartment: me.department || '', departments: r34Departments(), periods: periods, recent: recent,
    unmatched: r34OpenUnmatched(me).filter(function (u) { return String(u.kind) === kind; }).length, codes: r34Codes(), today: today };
  if (kind === 'archive') out.patterns = r34Patterns();
  if (kind === 'monthly') { // admin "Rosters" page: whole-resort weekly workbooks (one per week, all departments)
    var wk = r34Uploads().filter(function (u) { return String(u.kind) === 'weekly' && String(u.status) === 'active'; }), mon0 = r34Monday(today);
    out.weeks = [-7, 0, 7, 14, 21, 28].map(function (k) { var key = r34Add(mon0, k), a = wk.filter(function (u) { return r34Pk(u.periodKey) === key; });
      return { key: key, label: r34Label(key) + ' – ' + r34Label(r34Add(key, 6)), current: k === 0, next: k === 7, all: a.some(function (u) { return String(u.department).toUpperCase() === 'ALL'; }), uploads: a.map(r34UploadOut) }; });
    out.weekWindow = { from: r34Add(mon0, -7), to: r34Add(mon0, 56) };
  }
  if (kind !== 'weekly' || isAdminPerm(me)) { // RELEASED on a roster (current or archive) → possibly left
    var act2 = r34ActiveIds();
    out.released = r34ReleasedList(sheetToObjects(R34.SHIFTS).concat(kind === 'archive' ? sheetToObjects(R34.ARCH) : []).filter(function (s) { return act2[String(s.uploadId)]; }));
  }
  return { success: true, data: out };
}
/** Simple per-department pattern from archive + past monthly rows: staff, typical days on/off per week, usual run, common days off and start times. */
function r34Patterns() {
  var active = r34ActiveIds(), today = r34Today();
  var rows = sheetToObjects(R34.ARCH).concat(sheetToObjects(R34.SHIFTS)).filter(function (s) {
    return s.kind && active[String(s.uploadId)] && (String(s.kind) === 'archive' || (String(s.kind) === 'monthly' && String(s.date).slice(0, 10) < today));
  });
  var D = {};
  rows.forEach(function (s) {
    var dep = String(s.department || s.rosterDept || '—'), em = r34Lower(s.userEmail), d = String(s.date).slice(0, 10);
    var x = D[dep] = D[dep] || { staff: {}, work: 0, off: 0, leave: 0, offWd: [0, 0, 0, 0, 0, 0, 0], starts: {}, months: {}, runs: {} };
    x.staff[em] = 1; x.months[r34Pk(s.periodKey)] = 1;
    if (s.leaveType) x.leave++;
    else if (truthy(s.dayOff)) { x.off++; x.offWd[r34Wd(d)]++; }
    else { x.work++; var st = r34Time(s.start); if (st) x.starts[st] = (x.starts[st] || 0) + 1; }
    (x.runs[em] = x.runs[em] || {})[d] = (s.leaveType || truthy(s.dayOff)) ? 0 : 1;
  });
  return Object.keys(D).sort().map(function (dep) {
    var x = D[dep], n = x.work + x.off + x.leave, nWO = x.work + x.off;
    var on = nWO ? Math.round(x.work / nWO * 7 * 10) / 10 : 0, off = nWO ? Math.round((7 - on) * 10) / 10 : 0;
    var wd = x.offWd.map(function (c, i) { return [c, i]; }).sort(function (a, b) { return b[0] - a[0]; }).filter(function (a) { return a[0] > 0; }).slice(0, 2).map(function (a) { return R34_WD[a[1]]; });
    var st = Object.keys(x.starts).sort(function (a, b) { return x.starts[b] - x.starts[a]; }).slice(0, 3).map(r34Clock);
    var runs = [];
    Object.keys(x.runs).forEach(function (em) {
      var ds = Object.keys(x.runs[em]).sort(), run = 0;
      ds.forEach(function (d, i) { if (x.runs[em][d]) run++; else { if (run) runs.push(run); run = 0; } if (i === ds.length - 1 && run) runs.push(run); });
    });
    var avgRun = runs.length ? Math.round(runs.reduce(function (a, b) { return a + b; }, 0) / runs.length * 10) / 10 : 0;
    return { department: dep, staff: Object.keys(x.staff).length, months: Object.keys(x.months).sort(), entries: n, daysOnPerWeek: on, daysOffPerWeek: off,
      commonDaysOff: wd, commonStarts: st, avgDaysInARow: avgRun, leaveDays: x.leave,
      summary: Object.keys(x.staff).length + ' staff · about ' + on + ' days on / ' + off + ' off a week' + (avgRun ? ' · usually ' + avgRun + ' days in a row' : '') +
        (wd.length ? ' · days off mostly ' + wd.join(', ') : '') + (st.length ? ' · starts ' + st.join(', ') : '') + (x.leave ? ' · ' + x.leave + ' leave days' : '') };
  });
}
function getRosterSettings(p) {
  var me = v3Requester(p);
  if (!(isAdminPerm(me) || isDeptLead(me))) return { success: false, error: 'Admin / HOD only' };
  r34Ensure();
  return { success: true, data: { leaveTypes: r34LeaveTypes(), codes: r34Codes(), dayOffHeadsUp: String(getSetting('roster_dayoff_heads_up', 'false')) === 'true',
    backTime: r34Time(getSetting('roster_back_reminder_time', '18:00')) || '18:00', canEdit: isAdminPerm(me) } };
}
function saveRosterSettings(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  if (p.leaveTypes !== undefined) {
    var lt = Array.isArray(p.leaveTypes) ? p.leaveTypes : r34Json(p.leaveTypes, null);
    if (!Array.isArray(lt) || !lt.length) return { success: false, error: 'Leave types list is empty' };
    var seen = {}, clean = [];
    lt.forEach(function (t) {
      var n = String(t && t.name || '').trim().substring(0, 40); if (!n || seen[n.toLowerCase()]) return; seen[n.toLowerCase()] = 1;
      var off = t.dayOff === true || t.dayOff === 'true';
      clean.push({ name: n, short: String(t.short || n).trim().substring(0, 20), balance: !off && t.balance !== false && t.balance !== 'false', dayOff: off,
        aliases: (Array.isArray(t.aliases) ? t.aliases : String(t.aliases || '').split(',')).map(function (a) { return String(a).trim(); }).filter(Boolean).slice(0, 10) });
    });
    if (!clean.some(function (t) { return t.dayOff; })) clean.push({ name: 'Day off', short: 'Day off', balance: false, dayOff: true, aliases: ['OFF', 'RDO'] });
    setSetting('leave_types', JSON.stringify(clean), me.email);
  }
  if (p.codes !== undefined) {
    var cm = typeof p.codes === 'object' && !Array.isArray(p.codes) ? p.codes : r34Json(p.codes, null);
    if (!cm || typeof cm !== 'object') return { success: false, error: 'Codes must be CODE → leave type' };
    var out = {}, bad = [];
    Object.keys(cm).forEach(function (k) {
      var code = String(k).trim().toUpperCase().replace(/\s+/g, ' ').substring(0, 12); if (!code) return;
      var t = r34CanonLeaveType(cm[k], false);
      if (!t) bad.push(code + ' → ' + cm[k]); else out[code] = t;
    });
    if (bad.length) return { success: false, error: 'Unknown leave type for: ' + bad.join(', ') + ' (types: ' + r34LeaveTypeNames().join(', ') + ')' };
    setSetting('roster_leave_codes', JSON.stringify(out), me.email);
  }
  if (p.dayOffHeadsUp !== undefined) setSetting('roster_dayoff_heads_up', truthy(p.dayOffHeadsUp) ? 'true' : 'false', me.email);
  if (p.backTime !== undefined) { var bt = r34Time(p.backTime); if (!bt) return { success: false, error: 'Time must be HH:MM' }; setSetting('roster_back_reminder_time', "'" + bt, me.email); }
  r34Bump();
  return getRosterSettings(p);
}
function getLeaveAllowances(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  return { success: true, data: { allowances: sheetToObjects(R34.ALLOW).map(function (a) { return { id: a.id, email: a.email || '', department: a.department || '', leaveType: a.leaveType, daysPerYear: a.daysPerYear, updatedBy: a.updatedBy, updatedAt: a.updatedAt }; }),
    types: r34LeaveTypes().filter(function (t) { return t.balance; }).map(function (t) { return t.name; }), departments: r34Departments(), people: r34People(me) } };
}
function saveLeaveAllowance(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  var type = r34CanonLeaveType(p.leaveType, false), info = r34TypeInfo(type);
  if (!info || !info.balance) return { success: false, error: 'Pick a leave type' };
  var days = Number(p.daysPerYear);
  if (String(p.daysPerYear == null ? '' : p.daysPerYear).trim() === '' || isNaN(days) || days < 0 || days > 366) return { success: false, error: 'Days per year: 0–366' };
  var email = r34Lower(p.allowEmail), dept = String(p.department || '').trim();
  if (email) { if (!findUserByEmail(email)) return { success: false, error: 'No account with that email' }; dept = ''; }
  else if (!dept) dept = 'ALL';
  var rows = sheetToObjects(R34.ALLOW);
  var same = rows.filter(function (a) { return r34Lower(a.leaveType) === r34Lower(type) && (email ? r34Lower(a.email) === email : (!String(a.email || '').trim() && r34Lower(a.department || 'ALL') === r34Lower(dept))); })[0];
  if (same) updateRowById(R34.ALLOW, same.id, { daysPerYear: days, updatedBy: r34Lower(me.email), updatedAt: nowIso() });
  else r34Append(R34.ALLOW, R34_ALLOW_HEADERS, [{ id: uid('lal'), email: email, department: email ? '' : dept, leaveType: type, daysPerYear: days, updatedBy: r34Lower(me.email), updatedAt: nowIso() }]);
  r34Bump();
  return getLeaveAllowances(p);
}
function deleteLeaveAllowance(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  var lock = r34Lock(), n = 0;
  try { n = r34DeleteWhere(R34.ALLOW, function (a) { return String(a.id) === String(p.id); }); } finally { lock.releaseLock(); }
  if (!n) return { success: false, error: 'Not found' };
  r34Bump();
  return getLeaveAllowances(p);
}

/* ---------- reminders (pushTick, every 10 minutes; each reminder is sent once — "Roster Reminder Log") ---------- */
/** Pure planner (unit-tested with mocked dates). ctx: today, hour, minute, users[{email,department,active,isSuper,isAdmin,isLead}],
 *  days(email)→{date:entry}, leave(email)→{date:type}, weeklyDone(dept, monday), monthlyDone(monthKey), sent{key:1}, backHour, backMinute, headsUp.
 *  → [{ key, kind, email, title, body }] */
function r34PlanReminders(ctx) {
  var out = [], today = ctx.today, tom = r34Add(today, 1), wd = r34Wd(today), mins = ctx.hour * 60 + (ctx.minute || 0);
  var add = function (key, kind, email, title, body) { if (ctx.sent[key]) return; ctx.sent[key] = 1; out.push({ key: key, kind: kind, email: email, title: title, body: body }); };
  var staff = ctx.users.filter(function (u) { return u.active && !u.isSuper; });
  if (mins >= ctx.backHour * 60 + (ctx.backMinute || 0)) {
    staff.forEach(function (u) {
      var days = ctx.days(u.email) || {}, lv = ctx.leave(u.email) || {};
      var t = days[today] ? Object.assign({}, days[today]) : null, n = days[tom] ? Object.assign({}, days[tom]) : null;
      if (lv[today]) t = Object.assign(t || { date: today }, { appLeave: lv[today] });
      if (lv[tom]) n = Object.assign(n || { date: tom }, { appLeave: lv[tom] });
      if (r34NonWorking(t) && r34Working(n)) {
        add('back|' + u.email + '|' + tom, 'back', u.email, "You're back at work tomorrow" + (n.start ? ' at ' + r34Clock(n.start) : ''),
          r34Label(tom) + (n.start ? ', ' + r34Clock(n.start) + (n.end ? '–' + r34Clock(n.end) : '') : '') + '. Enjoy the rest of your evening!');
      } else if (ctx.headsUp && r34Working(t) && r34NonWorking(n) && !n.none) {
        var lv2 = n.appLeave || n.leaveType;
        add('off|' + u.email + '|' + tom, 'dayoff', u.email, lv2 ? lv2 + ' starts tomorrow' : 'Tomorrow is your day off', r34Label(tom) + ' — enjoy it.');
      }
    });
  }
  // HODs: next week's weekly roster not uploaded by Saturday 6pm Fiji (checked Sat 18:00 → Sun 23:59)
  if ((wd === 6 && ctx.hour >= 18) || wd === 0) {
    var nextMon = r34Add(today, wd === 6 ? 2 : 1), byDept = {};
    staff.filter(function (u) { return u.isLead && u.department; }).forEach(function (u) { (byDept[r34DeptKey(u.department)] = byDept[r34DeptKey(u.department)] || []).push(u); });
    Object.keys(byDept).forEach(function (k) {
      var leads = byDept[k], dept = leads[0].department;
      if (ctx.weeklyDone(dept, nextMon)) return;
      leads.forEach(function (u) {
        add('wk|' + k + '|' + nextMon + '|' + u.email, 'weekly_due', u.email, 'Weekly roster for ' + dept + ' not uploaded',
          'Please upload the roster for ' + r34Label(nextMon) + ' – ' + r34Label(r34Add(nextMon, 6)) + ' (Department Admin → Weekly roster).');
      });
    });
  }
  // admins: next month's monthly roster not uploaded by the 28th
  if (Number(today.slice(8, 10)) >= 28) {
    var nm = r34MonthAdd(r34MonthKey(today), 1);
    if (!ctx.monthlyDone(nm)) ctx.users.filter(function (u) { return u.active && u.isAdmin; }).forEach(function (u) {
      add('mo|' + nm + '|' + u.email, 'monthly_due', u.email, 'Monthly roster for ' + r34MonthLabel(nm) + ' not uploaded',
        'Please upload the resort roster before 1 ' + r34MonthLabel(nm) + ' (Admin Settings → Monthly roster).');
    });
  }
  return out;
}
var R34_REM_KIND = { back: 'roster', dayoff: 'roster', weekly_due: 'roster_hod', monthly_due: 'roster_admin' };
function r34Tick() {
  if (!r34FlagOn()) return { off: true };
  r34Ensure();
  var now = getFijiNow(), today = r34Today(), hour = now.getUTCHours(), wd = r34Wd(today);
  var bt = (r34Time(getSetting('roster_back_reminder_time', '18:00')) || '18:00').split(':');
  var backHour = Number(bt[0]), backMinute = Number(bt[1]);
  var staffWindow = hour * 60 + now.getUTCMinutes() >= backHour * 60 + backMinute;
  var hodWindow = (wd === 6 && hour >= 18) || wd === 0, adminWindow = Number(today.slice(8, 10)) >= 28;
  if (!staffWindow && !hodWindow && !adminWindow) return { idle: true };
  var sent = {};
  sheetToObjects(R34.REMLOG).forEach(function (r) { sent[String(r.key)] = 1; });
  var users = sheetToObjects('Users').map(function (u) {
    return { email: r34Lower(u.email), department: u.department || '', active: truthy(u.active), isSuper: isSuperPerm(u), isAdmin: isAdminPerm(u), isLead: isDeptLead(u) };
  }).filter(function (u) { return u.email.indexOf('@') > 0; });
  var uploads = r34Uploads(), active = r34ActiveIds(uploads);
  var idx = staffWindow ? r34Index(r34AllRows(false), active, today, r34Add(today, 1)) : {};
  var leaveBy = {};
  if (staffWindow) sheetToObjects('Leave Requests').forEach(function (l) {
    if (String(l.status) !== 'approved') return;
    var s = v3Date(l.startDate), e = v3Date(l.endDate || l.startDate), em = r34Lower(l.userEmail);
    [today, r34Add(today, 1)].forEach(function (d) { if (d >= s && d <= e) (leaveBy[em] = leaveBy[em] || {})[d] = r34CanonLeaveType(l.leaveType || 'Other', true); });
  });
  var plan = r34PlanReminders({ today: today, hour: hour, minute: now.getUTCMinutes(), users: users, sent: sent, backHour: backHour, backMinute: backMinute,
    headsUp: String(getSetting('roster_dayoff_heads_up', 'false')) === 'true',
    days: function (em) { return idx[em] || {}; }, leave: function (em) { return leaveBy[em] || {}; },
    weeklyDone: function (dept, mon) { return uploads.some(function (u) { return String(u.kind) === 'weekly' && String(u.status) === 'active' && r34Pk(u.periodKey) === mon && (r34DeptEq(u.department, dept) || String(u.department).toUpperCase() === 'ALL'); }); },
    monthlyDone: function (mk) { return uploads.some(function (u) { return String(u.kind) === 'monthly' && String(u.status) === 'active' && r34Pk(u.periodKey) === mk; }); }
  });
  if (!plan.length) return { sent: 0 };
  var at = nowIso();
  r34Append(R34.REMLOG, R34_REMLOG_HEADERS, plan.map(function (x) { return { key: x.key, kind: x.kind, userEmail: x.email, sentAt: at }; })); // log first: never twice
  r3NotifyMany(plan.map(function (x) { return { id: uid('ntf'), userEmail: x.email, title: x.title, body: x.body, kind: R34_REM_KIND[x.kind] || 'roster', relatedId: x.key, read: false, createdAt: at }; }));
  if (Math.random() < 0.05) { var cut = r34Add(today, -60); try { r34DeleteWhere(R34.REMLOG, function (r) { return String(r.sentAt).slice(0, 10) < cut; }); } catch (e) {} }
  return { sent: plan.length, kinds: plan.map(function (x) { return x.kind; }) };
}

/* ---------- router ---------- */
/* ---------- employee codes (staff listing import; admin edit) ---------- */
/** listing department ("ELECTRICIAN", "GARDEN", "RESTAURANT", …) → app departments it may be (null = any) */
function r34ListDepts(d) {
  var k = String(d || '').toUpperCase().replace(/\s+/g, ' ').trim();
  var T = [[/ELECTRIC|MAINT|CONSTRUCT|PLUMB|JOINER|CARPENT|PAINT|MARINE|MECHANIC|WORKSHOP/, ['Maintenance']], [/GARDEN|GROUND/, ['Grounds']],
    [/RESTAURANT|F ?& ?B|WAIT|FOOD/, ['F&B', 'Bar']], [/\bBAR\b/, ['Bar', 'F&B']], [/BOAT|CAPTAIN|DECK/, ['Boatman']], [/HOUSEKEEP|LAUNDRY|ROOM/, ['Housekeeping']],
    [/KIDS/, ['Kids Club']], [/KITCHEN|CHEF|COOK|BAKER|PASTRY|STEWARD/, ['Kitchen', 'BR Kitchen', 'Donu Kitchen']], [/DIVE/, ['Diveshop']],
    [/FRONT|GUEST REL|RESERV|RECEPT/, ['Front Office', 'IT/Office']], [/^IT\b|INFORMATION/, ['IT/Office']], [/HUMAN|^HR\b|MANAGEMENT|ACCOUNT|FINANCE|ADMIN/, ['Management', 'IT/Office']],
    [/SECUR/, ['Security']], [/\bSPA\b/, ['Spa']], [/STORE/, ['Stores']], [/PORTER/, ['Porters']], [/ACTIVIT/, ['Activities']]];
  for (var i = 0; i < T.length; i++) if (T[i][0].test(k)) return T[i][1];
  return null;
}
function r34CodeUsers() { return sheetToObjects('Users').filter(function (u) { return truthy(u.active); }); }
function r34NameToks(s) { return r34Tokens(String(s || '').replace(/\bno\.?\s*\d+\b/ig, ' ')); }
/** Pure: listing rows → per row { code, name, department, status, email?, userName?, why, suggestions[] }.
 *  status: match (one person, department fits) · already (has this code) · check (one person, other department / has another code) ·
 *  ambiguous (several people) · taken (code already on someone else) · unmatched. Only "match" is pre-selected. */
function r34PlanCodes(rows, users) {
  var byCode = {}, ppl = users.map(function (u) {
    var f = r34Tokens(u.firstName), l = r34Tokens(u.lastName), pf = r34Tokens(u.preferredName);
    var o = { u: u, email: r34Lower(u.email), name: r34UserName(u), dept: u.department || '', code: r34EmpCode(u.employeeCode), first: f, last: l, pref: pf };
    if (o.code) byCode[o.code] = o; return o;
  });
  var seen = {}, out = [], hits = {};
  (rows || []).forEach(function (r) {
    var code = r34EmpCode(r.code); if (!code || seen[code]) return; seen[code] = 1;
    var toks = r34NameToks(r.name); if (!toks.length) return;
    var okDept = r34ListDepts(r.department);
    var has = function (t) { return toks.indexOf(t) >= 0; };
    var cands = ppl.filter(function (p) { return p.last.length && p.last.every(has) && (p.first.some(has) || p.pref.some(has)); });
    var o = { code: code, name: String(r.name || '').replace(/\s+/g, ' ').trim().substring(0, 80), department: String(r.department || '').trim().substring(0, 40), suggestions: [] };
    var deptOk = function (p) { return !okDept || okDept.some(function (d) { return r34DeptEq(d, p.dept); }); };
    var holder = byCode[code];
    if (holder && cands.indexOf(holder) >= 0) { o.status = 'already'; o.email = holder.email; o.userName = holder.name; o.why = 'already has this code'; }
    else if (holder) { o.status = 'taken'; o.email = ''; o.why = 'code already on ' + holder.name; o.suggestions = cands.slice(0, 4).map(function (p) { return { email: p.email, name: p.name, department: p.dept }; }); }
    else if (cands.length === 1) {
      var p = cands[0]; o.email = p.email; o.userName = p.name;
      if (p.code && p.code !== code) { o.status = 'check'; o.why = 'has another code (' + p.code + ')'; }
      else if (!deptOk(p)) { o.status = 'check'; o.why = 'department ' + (p.dept || '—') + ' vs ' + (o.department || '—'); }
      else { o.status = 'match'; o.why = 'name + department'; }
    } else if (cands.length > 1) {
      var inD = cands.filter(deptOk);
      if (inD.length === 1 && !inD[0].code) { o.status = 'match'; o.email = inD[0].email; o.userName = inD[0].name; o.why = 'name + department (others elsewhere)'; }
      else { o.status = 'ambiguous'; o.why = cands.length + ' people with this name'; o.suggestions = cands.slice(0, 6).map(function (p) { return { email: p.email, name: p.name, department: p.dept }; }); }
    } else {
      o.status = 'unmatched'; o.why = 'no account with this name';
      o.suggestions = ppl.filter(function (p) { return !p.code && (p.first.some(has) || p.last.some(has)) && deptOk(p); }).slice(0, 4).map(function (p) { return { email: p.email, name: p.name, department: p.dept }; });
    }
    if (o.email && (o.status === 'match' || o.status === 'check')) (hits[o.email] = hits[o.email] || []).push(o);
    out.push(o);
  });
  Object.keys(hits).forEach(function (em) { if (hits[em].length > 1) hits[em].forEach(function (o) { o.status = 'ambiguous'; o.why = 'several listing rows match ' + o.userName; o.suggestions = [{ email: o.email, name: o.userName, department: '' }]; o.email = ''; }); });
  var n = {}; out.forEach(function (o) { n[o.status] = (n[o.status] || 0) + 1; });
  return { rows: out, counts: n, total: out.length };
}
function previewEmployeeCodes(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  var rows = r34Json(p.rows, null); if (!Array.isArray(rows)) rows = Array.isArray(p.rows) ? p.rows : [];
  if (rows.length > 3000) return { success: false, error: 'Too many rows (max 3000)' };
  var users = r34CodeUsers(), plan = r34PlanCodes(rows, users);
  plan.people = users.map(function (u) { return { email: r34Lower(u.email), name: r34UserName(u), department: u.department || '', code: r34EmpCode(u.employeeCode) }; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return { success: true, data: plan };
}
function r34SetCode(u, code, by) {
  updateRowById('Users', u.id, { employeeCode: code });
  try { scInvalidateSheet('Users'); } catch (e) {}
}
/** items [{ code, email }] → saved / skipped with reasons. A code is never on two people; '' code is not allowed here. */
function applyEmployeeCodes(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  var items = r34Json(p.items, null); if (!Array.isArray(items)) items = Array.isArray(p.items) ? p.items : [];
  var lock = r34Lock();
  try {
    var users = sheetToObjects('Users'), byEmail = {}, holder = {};
    users.forEach(function (u) { byEmail[r34Lower(u.email)] = u; var c = r34EmpCode(u.employeeCode); if (c) holder[c] = r34Lower(u.email); });
    var saved = 0, skipped = [], used = {};
    items.forEach(function (it) {
      var code = r34EmpCode(it.code), em = r34Lower(it.email), u = byEmail[em];
      if (!code || !u) { skipped.push({ code: it.code, why: !code ? 'not a code' : 'no such user' }); return; }
      if (used[code] || used[em]) { skipped.push({ code: code, why: 'used twice in this import' }); return; }
      if (holder[code] && holder[code] !== em) { skipped.push({ code: code, why: 'already on another person' }); return; }
      used[code] = used[em] = 1;
      if (r34EmpCode(u.employeeCode) === code) return;
      if (holder[r34EmpCode(u.employeeCode)] === em) delete holder[r34EmpCode(u.employeeCode)];
      r34SetCode(u, code, me.email); holder[code] = em; saved++;
    });
    return { success: true, data: { saved: saved, skipped: skipped.slice(0, 50), skippedCount: skipped.length } };
  } finally { lock.releaseLock(); }
}
function setEmployeeCode(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure();
  var u = findUserByEmail(String(p.targetEmail || '').trim().toLowerCase());
  if (!u) return { success: false, error: 'User not found' };
  var raw = String(p.code == null ? '' : p.code).trim(), code = raw ? r34EmpCode(raw) : '';
  if (raw && !code) return { success: false, error: 'An employee code looks like GL018' };
  if (code) { var other = sheetToObjects('Users').filter(function (x) { return r34EmpCode(x.employeeCode) === code && r34Lower(x.email) !== r34Lower(u.email); })[0]; if (other) return { success: false, error: code + ' is already on ' + r34UserName(other) }; }
  r34SetCode(u, code, me.email);
  return { success: true, data: { email: r34Lower(u.email), employeeCode: code } };
}

function routeRoster34(action, p) {
  var map = {
    getMyRoster: getMyRoster, getDepartments: getDepartments, rosterUploadStart: rosterUploadStart, rosterUploadChunk: rosterUploadChunk, rosterUploadFinish: rosterUploadFinish,
    getRosterUnmatched: getRosterUnmatched, linkRosterName: linkRosterName, ignoreRosterName: ignoreRosterName, unlinkRosterName: unlinkRosterName,
    getRosterAdmin: getRosterAdmin, getRosterSettings: getRosterSettings, saveRosterSettings: saveRosterSettings,
    previewEmployeeCodes: previewEmployeeCodes, applyEmployeeCodes: applyEmployeeCodes, setEmployeeCode: setEmployeeCode,
    getLeaveAllowances: getLeaveAllowances, saveLeaveAllowance: saveLeaveAllowance, deleteLeaveAllowance: deleteLeaveAllowance
  };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
