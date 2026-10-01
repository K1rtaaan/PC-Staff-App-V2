/* PCR Staff App 3.4.1 (Pranav, 2 Oct 2026) — GL number linking.
 *
 *  The real PCR roster workbooks carry NO GL numbers (checked: 0 in all 35 files, Jan–Aug 2026). So a GL number is resolved
 *  through the payroll STAFF LISTING (New Code · Name · Date Started · Department), stored once in the tab "Staff Listing"
 *  by Admin → Employee codes. Then:
 *    GL number → listing person (by code, exact) → roster person (listing name + department vs the roster names; automatic
 *    only when it is unambiguous, otherwise the admin / HOD picks) → the app account.
 *  Link = the code is saved on the account, the roster name + department is linked to the account (Roster Name Map) and every
 *  roster row of that roster person (current + archive, matched or unmatched) moves to the account. Optionally app details are
 *  updated from the roster / listing (name, department, position, pay type, date started), per field. Every change is written
 *  to "GL Link Log" and the activity log.
 *  Admin: any account. HOD / assistant HOD: accounts of their own department (no department moves). A GL number already on
 *  another account is blocked; only a superadmin can move it (override).
 *  Listing rows of the departments Band and Naisoso are skipped (not app departments; Pranav). */
var G341 = { LISTING: 'Staff Listing', LOG: 'GL Link Log' };
var G341_LISTING_HEADERS = ['code', 'name', 'department', 'listingDepartment', 'dateStarted', 'importedAt', 'importedBy', 'id'];
var G341_LOG_HEADERS = ['id', 'at', 'actorEmail', 'actorName', 'targetEmail', 'targetName', 'code', 'action', 'field', 'oldValue', 'newValue', 'rosterName', 'rosterDept', 'override'];
var G341_FIELDS = ['name', 'department', 'position', 'payType', 'dateStarted'];
var G341_FIELD_LABEL = { name: 'Name', department: 'Department', position: 'Position / role', payType: 'Pay type', dateStarted: 'Date started' };

function g341Ensure() {
  var c = null;
  try { c = CacheService.getScriptCache(); if (c.get('pcr_g341_schema_1') === '1') return; } catch (e) {}
  var ss = getSS();
  ensureSheet(ss, G341.LISTING, G341_LISTING_HEADERS);
  ensureSheet(ss, G341.LOG, G341_LOG_HEADERS);
  try { var ush = ss.getSheetByName('Users'); if (ush) { ensureColumns(ush, ['employeeCode', 'position', 'payType', 'dateStarted']); scInvalidateSheet('Users'); } } catch (e1) {}
  try { if (c) c.put('pcr_g341_schema_1', '1', 21600); } catch (e2) {}
}
function g341Lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
/** listing department of Band / Naisoso → skipped (not offered for linking) */
function g341SkipDept(d) { return /^\s*(band|naisoso)\b/i.test(String(d || '')); }
/** "KITIONE VULUMA" → "Kitione Vuluma" (only when the text is all caps / all lower) */
function g341Title(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
}
function g341PayType(s) {
  var t = String(s || '').toLowerCase();
  if (/hour/.test(t)) return 'Hourly';
  if (/salar/.test(t)) return 'Salary';
  if (/wag/.test(t)) return 'Wage';
  return String(s || '').replace(/\s+/g, ' ').trim().substring(0, 30);
}
function g341CanLink(me, u) { return isAdminPerm(me) || (isDeptLead(me) && u && r34DeptEq(me.department, u.department)); }

/* ---------- staff listing ---------- */
function g341Listing() {
  var o = {};
  sheetToObjects(G341.LISTING).forEach(function (r) { var c = r34EmpCode(r.code); if (c && !o[c]) o[c] = r; });
  return o;
}
/** admin: replace the stored staff listing. rows [{ code, name, department, started }] */
function saveStaffListing(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure(); g341Ensure();
  var rows = r34Json(p.rows, null); if (!Array.isArray(rows)) rows = Array.isArray(p.rows) ? p.rows : [];
  if (!rows.length) return { success: false, error: 'No listing rows' };
  if (rows.length > 3000) return { success: false, error: 'Too many rows (max 3000)' };
  var now = nowIso(), seen = {}, out = [], skippedDept = 0, bad = 0;
  rows.forEach(function (r) {
    r = r || {};
    var code = r34EmpCode(r.code), name = String(r.name || '').replace(/\s+/g, ' ').trim().substring(0, 80), dept = String(r.department || '').replace(/\s+/g, ' ').trim().substring(0, 40);
    if (!code || !name) { bad++; return; }
    if (g341SkipDept(dept)) { skippedDept++; return; }
    if (seen[code]) { bad++; return; }
    seen[code] = 1;
    var okD = r34ListDepts(dept);
    out.push({ code: code, name: name, department: okD && okD.length === 1 ? okD[0] : (okD ? okD.join(' / ') : ''), listingDepartment: dept,
      dateStarted: String(r.started || r.dateStarted || '').trim().substring(0, 20), importedAt: now, importedBy: r34Lower(me.email), id: uid('gls') });
  });
  var lock = r34Lock();
  try {
    r34DeleteWhere(G341.LISTING, function () { return true; });
    r34Append(G341.LISTING, G341_LISTING_HEADERS, out);
  } finally { lock.releaseLock(); }
  s34Log(me, 'admin', 'saveStaffListing', 'Staff Listing', 'Staff listing saved: ' + out.length + ' people' + (skippedDept ? ', ' + skippedDept + ' Band / Naisoso rows skipped' : '') + (bad ? ', ' + bad + ' rows without a code / name / duplicates' : ''));
  return { success: true, data: { saved: out.length, skippedDept: skippedDept, skippedBad: bad, importedAt: now } };
}
function getStaffListingInfo(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me) && !isDeptLead(me)) return { success: false, error: 'HOD or admin only' };
  g341Ensure();
  var rows = sheetToObjects(G341.LISTING).filter(function (r) { return r34EmpCode(r.code); });
  var last = rows.map(function (r) { return String(r.importedAt || ''); }).sort().pop() || '';
  return { success: true, data: { count: rows.length, importedAt: last, importedBy: rows.length ? String(rows[rows.length - 1].importedBy || '') : '' } };
}

/* ---------- roster people (current + archive + unmatched), cached per roster version ---------- */
function g341RosterPeople() {
  var ck = null;
  try { ck = scKey('r34', 'g341ppl'); var hit = scGetJson(ck); if (hit) return hit; } catch (e) { ck = null; }
  var active = r34ActiveIds(), P = {};
  var put = function (name, dept, date, email, payType, position, src) {
    name = String(name || '').replace(/\s+/g, ' ').trim(); if (!r34Norm(name)) return;
    var k = r34MapKey(name, dept);
    var o = P[k] || (P[k] = { key: k, rosterName: name, department: String(dept || ''), lastDate: '', days: 0, emails: {}, payType: '', position: '', src: src });
    o.days++;
    if (email) o.emails[r34Lower(email)] = 1;
    var d = String(date || '').slice(0, 10);
    if (d >= o.lastDate) { o.lastDate = d; if (payType) o.payType = payType; if (position) o.position = position; }
    else { if (!o.payType && payType) o.payType = payType; if (!o.position && position) o.position = position; }
  };
  [R34.SHIFTS, R34.ARCH].forEach(function (tab) {
    sheetToObjects(tab).forEach(function (s) {
      if (!s.kind || !active[String(s.uploadId)]) return;
      put(s.rawName, s.rosterDept || s.department, s.date, s.userEmail, s.payType, s.position, String(s.kind));
    });
  });
  sheetToObjects(R34.UNM).forEach(function (u) {
    if (String(u.status) !== 'open' || !active[String(u.uploadId)]) return;
    r34Json(u.shiftsJson, []).forEach(function (s) { put(u.rawName, u.department, s.date, '', s.payType, s.position, String(u.kind)); });
  });
  var out = Object.keys(P).map(function (k) { var o = P[k]; o.emails = Object.keys(o.emails); return o; });
  if (ck) { try { scPutJson(ck, out, 21600); } catch (e2) {} }
  return out;
}
/** listing person → roster candidates, best first. score: name (exact 100 / contained 80 / initial 60 / shared word 30) + department 15 */
function g341Candidates(listing, user, people) {
  var lt = r34NameToks(listing.name);
  var okD = r34ListDepts(listing.listingDepartment || listing.department) || [];
  var has = function (arr, t) { return arr.indexOf(t) >= 0; };
  var out = [];
  people.forEach(function (p) {
    var rt = r34NameToks(p.rosterName); if (!rt.length) return;
    var s = 0, why = '';
    var full = rt.filter(function (t) { return t.length > 1; }), ini = rt.filter(function (t) { return t.length === 1; });
    if (r34Key(rt) === r34Key(lt)) { s = 100; why = 'same name'; }
    else if (rt.length >= 2 && rt.every(function (t) { return has(lt, t); })) { s = 80; why = 'roster name inside the listing name'; }
    else if (lt.length >= 2 && lt.every(function (t) { return has(rt, t); })) { s = 80; why = 'listing name inside the roster name'; }
    else if (full.length && ini.length && full.every(function (t) { return has(lt, t); }) && ini.every(function (i) { return lt.some(function (t) { return t.charAt(0) === i && !has(full, t); }); })) { s = 60; why = 'first name + initial'; }
    else if (full.some(function (t) { return t.length >= 3 && has(lt, t); })) { s = 30; why = 'part of the name'; }
    var mine = user && p.emails.indexOf(r34Lower(user.email)) >= 0;
    if (!s && !mine) return;
    var dOk = okD.some(function (d) { return r34DeptEq(d, p.department); }) || (!okD.length && user && r34DeptEq(user.department, p.department));
    if (dOk) { s += 15; why += (why ? ' + ' : '') + 'department'; }
    if (mine) { s += 10; why += (why ? ' · ' : '') + 'already linked to this account'; }
    out.push({ key: p.key, rosterName: p.rosterName, department: p.department, position: p.position || '', payType: g341PayType(p.payType), lastDate: p.lastDate, days: p.days, emails: p.emails, score: s, why: why, deptOk: !!dOk });
  });
  out.sort(function (a, b) { return b.score - a.score || String(b.lastDate).localeCompare(String(a.lastDate)); });
  return out.slice(0, 8);
}
/** the candidate to pre-select ('' = the admin / HOD picks): exact name + department, and no other exact name; or one close name + department */
function g341AutoPick(c) {
  var exact = c.filter(function (x) { return x.score >= 100; });
  if (exact.length === 1 && exact[0].deptOk) return exact[0].key;
  if (!exact.length) { var close = c.filter(function (x) { return x.score >= 75 && x.deptOk; }); if (close.length === 1 && !c.some(function (x) { return x !== close[0] && x.score >= 60; })) return close[0].key; }
  return '';
}
function g341AppValues(u) {
  return { name: r34UserName(u), firstName: String(u.firstName || ''), lastName: String(u.lastName || ''), department: String(u.department || ''), position: String(u.position || ''),
    payType: String(u.payType || ''), dateStarted: String(u.dateStarted || '').replace(/^'/, ''), code: r34EmpCode(u.employeeCode) };
}
/** proposed values from the roster person (or the listing when there is no roster person / the roster has no value) */
function g341Proposed(listing, cand) {
  var okD = r34ListDepts(listing.listingDepartment || listing.department) || [];
  return {
    name: g341Title(cand ? cand.rosterName : listing.name), nameSource: cand ? 'roster' : 'listing',
    department: cand ? cand.department : (okD.length === 1 ? okD[0] : ''), departmentSource: cand ? 'roster' : 'listing',
    position: cand ? cand.position : '', positionSource: 'roster',
    payType: cand ? cand.payType : '', payTypeSource: 'roster',
    dateStarted: String(listing.dateStarted || '').replace(/^'/, ''), dateStartedSource: 'listing'
  };
}
function g341Holder(code, email) {
  return sheetToObjects('Users').filter(function (x) { return r34EmpCode(x.employeeCode) === code && g341Lower(x.email) !== g341Lower(email); })[0] || null;
}
/** GET glLookup&targetEmail=&code= → listing person, roster candidates, app vs roster values, problems. Read only. */
function glLookup(p) {
  var me = v3Requester(p);
  r34Ensure(); g341Ensure();
  var u = findUserByEmail(g341Lower(p.targetEmail));
  if (!u) return { success: false, error: 'Account not found' };
  if (!g341CanLink(me, u)) return { success: false, error: 'HODs link GL numbers for their own department only' };
  var raw = String(p.code || '').trim(), code = r34EmpCode(raw);
  if (!code) return { success: false, error: 'A GL number looks like GL018', code: raw };
  var L = g341Listing(), listing = L[code];
  var app = g341AppValues(u), holder = g341Holder(code, u.email);
  var base = { code: code, app: app, email: g341Lower(u.email), canOverride: isSuperPerm(me), canEditDept: isAdminPerm(me), isAdmin: isAdminPerm(me),
    holder: holder ? { email: g341Lower(holder.email), name: r34UserName(holder), department: holder.department || '' } : null };
  if (!listing) {
    base.notFound = true; base.listingCount = Object.keys(L).length;
    base.message = Object.keys(L).length ? code + ' is not in the staff listing (' + Object.keys(L).length + ' people). Check the number, or upload the latest staff listing (Employee codes).'
      : 'No staff listing has been uploaded yet. An admin uploads it once on Admin Settings → Employee codes; then every GL number resolves.';
    return { success: true, data: base };
  }
  var cands = g341Candidates(listing, u, g341RosterPeople());
  base.listing = { code: code, name: listing.name, department: listing.department || '', listingDepartment: listing.listingDepartment || '', dateStarted: String(listing.dateStarted || '').replace(/^'/, '') };
  base.candidates = cands.map(function (c) { var o = Object.assign({}, c); o.proposed = g341Proposed(listing, c); o.linkedTo = c.emails.filter(function (e) { return e !== base.email; }).slice(0, 3); delete o.emails; return o; });
  base.pick = g341AutoPick(cands);
  base.noRoster = g341Proposed(listing, null);
  var okD = r34ListDepts(listing.listingDepartment || listing.department) || [];
  base.listingDeptOk = !okD.length || okD.some(function (d) { return r34DeptEq(d, app.department); });
  if (app.code === code) base.already = true;
  return { success: true, data: base };
}
function g341LogRow(me, u, code, action, field, oldV, newV, cand, override) {
  return { id: uid('glg'), at: nowIso(), actorEmail: r34Lower(me.email), actorName: displayUserName(me) || me.email, targetEmail: r34Lower(u.email), targetName: r34UserName(u), code: code,
    action: action, field: field || '', oldValue: String(oldV == null ? '' : oldV).substring(0, 120), newValue: String(newV == null ? '' : newV).substring(0, 120),
    rosterName: cand ? cand.rosterName : '', rosterDept: cand ? cand.department : '', override: override ? 'TRUE' : '' };
}
/** every roster row of the roster person (rawName + roster department) → this account (current + archive). One read + column writes per tab. */
function g341Relink(mk, target) {
  var moved = 0, from = {};
  [R34.SHIFTS, R34.ARCH].forEach(function (tab) {
    var sh = getSS().getSheetByName(tab);
    if (!sh) return;
    var rows = sheetToObjects(tab).filter(function (s) { return s.kind && r34MapKey(s.rawName, s.rosterDept || s.department) === mk && r34Lower(s.userEmail) !== r34Lower(target.email); });
    if (!rows.length) return;
    rows.forEach(function (s) { if (s.userEmail) from[r34Lower(s.userEmail)] = 1; });
    if (typeof sh.getRange !== 'function' || typeof sh.getLastRow !== 'function') {
      rows.forEach(function (s) { updateRowById(tab, s.id, { userEmail: r34Lower(target.email), userName: r34UserName(target), department: target.department || s.department }); });
      moved += rows.length; return;
    }
    var last = sh.getLastRow(), lc = sh.getLastColumn();
    var hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
    var ci = hdr.indexOf('id'), ce = hdr.indexOf('userEmail'), cn = hdr.indexOf('userName'), cd = hdr.indexOf('department');
    if (ci < 0 || ce < 0 || last < 2) return;
    var ids = {}; rows.forEach(function (s) { ids[String(s.id)] = 1; });
    var idv = sh.getRange(2, ci + 1, last - 1, 1).getValues();
    [[ce, r34Lower(target.email)], [cn, r34UserName(target)], [cd, target.department || '']].forEach(function (x) {
      if (x[0] < 0 || (x[0] === cd && !target.department)) return;
      var rg = sh.getRange(2, x[0] + 1, last - 1, 1), vals = rg.getValues(), ch = false;
      for (var i = 0; i < idv.length; i++) if (ids[String(idv[i][0])]) { vals[i][0] = x[1]; ch = true; }
      if (ch) rg.setValues(vals);
    });
    moved += rows.length;
    scInvalidateSheet(tab);
  });
  return { moved: moved, from: Object.keys(from) };
}
/** POST glLink { targetEmail, code, rosterKey ('' = no roster person), fields: ["name","department",…] or "all", override } */
function glLink(p) {
  var me = v3Requester(p);
  r34Ensure(); g341Ensure(); r34EnsureCodeCol();
  var u = findUserByEmail(g341Lower(p.targetEmail));
  if (!u) return { success: false, error: 'Account not found' };
  if (!g341CanLink(me, u)) return { success: false, error: 'HODs link GL numbers for their own department only' };
  var code = r34EmpCode(p.code);
  if (!code) return { success: false, error: 'A GL number looks like GL018' };
  var listing = g341Listing()[code];
  if (!listing) return { success: false, error: code + ' is not in the staff listing', notFound: true };
  var override = String(p.override) === 'true' || p.override === true;
  var holder = g341Holder(code, u.email);
  if (holder && !(override && isSuperPerm(me))) return { success: false, error: code + ' is already linked to ' + r34UserName(holder) + ' (' + (holder.department || '—') + ')' + (isSuperPerm(me) ? ' — tick Override to move it' : ' — only a superadmin can move it'), taken: true };
  var cand = null, key = String(p.rosterKey || '');
  if (key) {
    cand = g341Candidates(listing, u, g341RosterPeople()).filter(function (c) { return c.key === key; })[0];
    if (!cand) { var any = g341RosterPeople().filter(function (x) { return x.key === key; })[0]; if (any) cand = { key: any.key, rosterName: any.rosterName, department: any.department, position: any.position || '', payType: g341PayType(any.payType) }; }
    if (!cand) return { success: false, error: 'That roster person is not on any roster any more — look the number up again' };
    if (!isAdminPerm(me) && !r34DeptEq(cand.department, me.department)) return { success: false, error: 'The roster person is in ' + cand.department + ' — an admin links people across departments' };
  }
  var fields = String(p.fields || '') === 'all' ? G341_FIELDS.slice() : r34Json(p.fields, Array.isArray(p.fields) ? p.fields : []);
  fields = (fields || []).filter(function (f) { return G341_FIELDS.indexOf(f) >= 0 && (f !== 'department' || isAdminPerm(me) || String(p.fields) !== 'all'); });
  var prop = g341Proposed(listing, cand), app = g341AppValues(u), logs = [], patch = {}, changed = [];
  if (fields.indexOf('department') >= 0 && prop.department && !r34DeptEq(prop.department, app.department) && !isAdminPerm(me)) return { success: false, error: 'Only an admin can move someone to another department' };
  var lock = r34Lock(), relink = { moved: 0, from: [] };
  try {
    if (holder) { // superadmin override: the code moves from the other account
      updateRowById('Users', holder.id, { employeeCode: '' });
      logs.push(g341LogRow(me, holder, code, 'override-remove', 'employeeCode', code, '', cand, true));
    }
    if (app.code !== code) { patch.employeeCode = code; logs.push(g341LogRow(me, u, code, 'link', 'employeeCode', app.code, code, cand, override && !!holder)); changed.push('GL number'); }
    fields.forEach(function (f) {
      var nv = String(prop[f] == null ? '' : prop[f]).trim(); if (!nv) return;
      if (f === 'name') {
        var parts = nv.split(' '), ln = parts.length > 1 ? parts.pop() : '', fn = parts.join(' ');
        if (!ln) return;
        if (fn === app.firstName && ln === app.lastName) return;
        patch.firstName = fn; patch.lastName = ln;
        logs.push(g341LogRow(me, u, code, 'update', 'name', app.name, nv, cand)); changed.push('name');
        return;
      }
      var cur = app[f];
      if (f === 'department' ? r34DeptEq(cur, nv) && r34DeptKey(cur) === r34DeptKey(nv) : cur === nv) return;
      patch[f] = nv;
      logs.push(g341LogRow(me, u, code, 'update', f, cur, nv, cand)); changed.push(G341_FIELD_LABEL[f].toLowerCase());
    });
    if (Object.keys(patch).length) {
      var pw = {}; Object.keys(patch).forEach(function (k) { pw[k] = k === 'dateStarted' ? r34Cell(patch[k]) : patch[k]; });
      updateRowById('Users', u.id, pw);
      scInvalidateSheet('Users');
    }
  } finally { lock.releaseLock(); }
  var target = findUserByEmail(u.email) || u;
  var rn = '';
  if (cand) {
    var mk = r34MapKey(cand.rosterName, cand.department);
    var lr = linkRosterName({ requesterEmail: me.email, linkEmail: target.email, rosterName: cand.rosterName, department: cand.department });
    if (!lr || !lr.success) return { success: false, error: (lr && lr.error) || 'Could not link the roster name', partial: true };
    rn = lr.data.rosterName;
    var l2 = r34Lock();
    try { relink = g341Relink(mk, target); } finally { l2.releaseLock(); }
    logs.push(g341LogRow(me, u, code, 'roster-link', 'rosterName', relink.from.join(', '), cand.rosterName + ' · ' + cand.department + ' (' + (relink.moved + (lr.data.shiftsAdded || 0)) + ' roster days)', cand));
  }
  try { r34Append(G341.LOG, G341_LOG_HEADERS, logs); } catch (eL) {}
  // close open "link my schedule" requests + tell the person (same as an approved request)
  try {
    var now = nowIso();
    var open = sheetToObjects(S34.LINK).filter(function (x) { return g341Lower(x.userEmail) === g341Lower(u.email) && String(x.status) === 'pending'; });
    r34PatchRows(S34.LINK, open.map(function (x) { return { u: x, patch: { status: 'approved', code: code, decidedBy: r34Lower(me.email), decidedAt: now } }; }));
    if (app.code !== code) v3Notify(u.email, 'Your schedule is unlocked', 'GL number ' + code + ' is linked to your account. Open Schedule to see your roster.', 'roster_link', code);
    if (holder) v3Notify(holder.email, 'GL number moved', code + ' was moved to another account by a superadmin. Ask your HOD if this is wrong.', 'roster_link', code);
  } catch (eN) {}
  try { scInvalidateSheet('Users'); r34Bump(); } catch (eB) {}
  s34Log(me, isAdminPerm(me) ? 'admin' : 'dept', 'glLink', u.email, 'GL link ' + r34UserName(u) + ' = ' + code + (cand ? ' · roster ' + cand.rosterName + ' (' + cand.department + ')' : ' · no roster person') +
    (changed.length ? ' · updated ' + changed.join(', ') : ' · link only') + (holder ? ' · OVERRIDE: moved from ' + r34UserName(holder) : ''));
  var fresh = findUserByEmail(u.email) || u;
  return { success: true, data: { email: g341Lower(u.email), code: code, rosterName: rn, rosterDept: cand ? cand.department : '', updated: changed, movedDays: relink.moved, movedFrom: relink.from,
    overrideFrom: holder ? r34UserName(holder) : '', user: v3UserOut(fresh), app: g341AppValues(fresh) } };
}
/** GET getGlLinkLog&targetEmail= (admin: anyone; HOD: own department) */
function getGlLinkLog(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me) && !isDeptLead(me)) return { success: false, error: 'HOD or admin only' };
  g341Ensure();
  var t = g341Lower(p.targetEmail);
  var rows = sheetToObjects(G341.LOG).filter(function (r) { return !t || g341Lower(r.targetEmail) === t; });
  if (!isAdminPerm(me)) { var mine = {}; sheetToObjects('Users').forEach(function (u) { if (r34DeptEq(u.department, me.department)) mine[g341Lower(u.email)] = 1; }); rows = rows.filter(function (r) { return mine[g341Lower(r.targetEmail)]; }); }
  return { success: true, data: { log: rows.slice(-200).reverse() } };
}

/* ---------- 3.4.1: People & roles by department + pending HOD-step requests (admin on behalf of the HOD) ---------- */
/** every pending HOD-step item: GL link / number requests, leave (HOD step), resort boat (HOD step), special meals */
function g341PendingItems() {
  var out = [];
  try { s34Ensure(); } catch (e0) {}
  sheetToObjects(S34.LINK).forEach(function (r) {
    if (String(r.status) !== 'pending') return;
    out.push({ kind: 'link', id: r.id, department: r.department || '', userEmail: r34Lower(r.userEmail), userName: r.userName, code: r.code || '', createdAt: r.createdAt,
      title: String(r.type) === 'unknown' ? 'Number request' : 'GL link request', detail: String(r.type) === 'unknown' ? "Doesn't know their GL number — enter it" : 'Entered GL number ' + (r.code || '') });
  });
  sheetToObjects('Leave Requests').forEach(function (l) {
    var st = String(l.status); if (st !== 'pending_hod' && st !== 'pending') return;
    out.push({ kind: 'leave', id: l.id, department: l.department || '', userEmail: r34Lower(l.userEmail), userName: l.userName || l.userEmail, createdAt: l.createdAt,
      title: 'Leave', detail: (l.leaveType || 'Leave') + ' ' + v3Date(l.startDate) + (v3Date(l.endDate) && v3Date(l.endDate) !== v3Date(l.startDate) ? ' → ' + v3Date(l.endDate) : '') + (l.reason ? ' · ' + String(l.reason).substring(0, 80) : '') });
  });
  try {
    sheetToObjects(R33_SHEET).forEach(function (x) {
      if (String(x.status) !== 'pending_hod') return;
      out.push({ kind: 'resortboat', id: x.id, department: x.department || '', userEmail: r34Lower(x.userEmail), userName: x.userName || x.userEmail, createdAt: x.createdAt,
        title: 'Resort boat', detail: r33Label(x) + ' · ' + (x.pax || 1) + ' pax' + (x.reason ? ' · ' + String(x.reason).substring(0, 60) : '') });
    });
  } catch (eB) {}
  sheetToObjects(S34.SPECIAL).forEach(function (r) {
    if (String(r.status) !== 'pending') return;
    out.push({ kind: 'special', id: r.id, department: r.department || '', userEmail: r34Lower(r.userEmail), userName: r.userName, createdAt: r.createdAt,
      title: 'Special meal', detail: (r.meal || '') + ' · ' + String(r.serviceDate).slice(0, 10) + ' · ' + String(r.reason || '').substring(0, 80) });
  });
  return out.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
}
function g341DeptOf(list, d) {
  if (!String(d || '').trim()) return '';
  for (var i = 0; i < list.length; i++) if (r34DeptKey(list[i]) === r34DeptKey(d)) return list[i];
  for (var j = 0; j < list.length; j++) if (r34DeptEq(list[j], d)) return list[j];
  return String(d).trim();
}
/** admin: department buttons — X on the roster (this + next week) · Y registered in the app · pending HOD-step requests */
function getPeopleDepartments(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  r34Ensure(); s34Ensure();
  var list = r34DeptList(), D = {};
  var row = function (d) { var k = d || '—'; return D[k] || (D[k] = { department: d, onRoster: 0, registered: 0, pending: 0 }); };
  list.forEach(function (d) { row(d); });
  var users = sheetToObjects('Users').filter(function (u) { return truthy(u.active) && !isSuperPerm(u) && String(u.email || '').indexOf('@') > 0; });
  var byEmail = {};
  users.forEach(function (u) { var d = g341DeptOf(list, u.department); byEmail[r34Lower(u.email)] = d; row(d).registered++; });
  var today = r34Today(), from = r34Monday(today), to = r34Add(from, 13), rp = null;
  try { rp = s34RosterPeople(from, to); } catch (e) { rp = { on: {}, only: {} }; }
  Object.keys(rp.on).forEach(function (em) { if (byEmail[em] !== undefined) row(byEmail[em]).onRoster++; });
  Object.keys(rp.only).forEach(function (k) { row(g341DeptOf(list, rp.only[k].department)).onRoster++; });
  var items = g341PendingItems();
  items.forEach(function (it) { row(g341DeptOf(list, it.department)).pending++; });
  var out = Object.keys(D).map(function (k) { return D[k]; });
  var order = {}; list.forEach(function (d, i) { order[d] = i; });
  out.sort(function (a, b) { var x = order[a.department], y = order[b.department]; if (x === undefined) x = 999; if (y === undefined) y = 999; return x - y || String(a.department).localeCompare(String(b.department)); });
  return { success: true, data: { departments: out, pendingTotal: items.length, window: { from: from, to: to } } };
}
function getDeptPending(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  var items = g341PendingItems(), dept = String(p.department || '');
  if (dept) items = items.filter(function (x) { return r34DeptEq(x.department, dept); });
  return { success: true, data: { items: items, total: items.length } };
}
/** admin: decide a HOD-step item for the HOD. kind: link | leave | resortboat | special. Logged "approved by admin on behalf of HOD". */
function decideOnBehalf(p) {
  var me = v3Requester(p);
  if (!isAdminPerm(me)) return { success: false, error: 'Admin only' };
  var kind = String(p.kind || ''), dec = /^(decline|declined|reject|rejected)$/i.test(String(p.decision || '')) ? 'decline' : 'approve';
  var it = g341PendingItems().filter(function (x) { return x.kind === kind && String(x.id) === String(p.id); })[0];
  if (!it) return { success: false, error: 'This request is not waiting for the HOD any more' };
  var q = Object.assign({}, p, { id: p.id, note: String(p.note || '').substring(0, 200) }); delete q.kind; delete q.decision;
  var res;
  A341_BEHALF = true;
  try {
    if (kind === 'leave') res = decideLeave(Object.assign(q, { decision: dec === 'approve' ? 'approve' : 'reject' }));
    else if (kind === 'resortboat') res = r33Decide(Object.assign(q, { decision: dec === 'approve' ? 'approve' : 'reject' }), 'hod');
    else if (kind === 'special') res = decideSpecialMeal(Object.assign(q, { decision: dec }));
    else if (kind === 'link') res = decideLinkRequest(Object.assign(q, { decision: dec, code: p.code || it.code, rosterName: p.rosterName, rosterDept: p.rosterDept }));
    else res = { success: false, error: 'Unknown request type' };
  } catch (e) { res = { success: false, error: String((e && e.message) || e) }; }
  finally { A341_BEHALF = false; }
  if (res && res.success) {
    var txt = (dec === 'approve' ? 'Approved' : 'Declined') + ' by admin on behalf of HOD: ' + it.title + ' · ' + it.userName + ' (' + (it.department || '—') + ') · ' + it.detail;
    s34Log(me, 'admin', 'decideOnBehalf', it.userEmail, txt);
    try { s34NotifyAll(deptLeads(it.department).map(function (u) { return r34Lower(u.email); }).filter(function (e) { return e !== r34Lower(me.email); }), it.title + ' decided by admin', txt.substring(0, 300), 'admin_behalf', it.id); } catch (eN) {}
    res.data = Object.assign({}, res.data || {}, { onBehalf: true, kind: kind, id: it.id, decision: dec });
  }
  return res;
}

function routeG341(action, p) {
  var map = { saveStaffListing: saveStaffListing, getStaffListingInfo: getStaffListingInfo, glLookup: glLookup, glLink: glLink, getGlLinkLog: getGlLinkLog,
    getPeopleDepartments: getPeopleDepartments, getDeptPending: getDeptPending, decideOnBehalf: decideOnBehalf };
  var fn = map[action];
  if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return { success: false, error: String((e && e.message) || e) }; }
}
