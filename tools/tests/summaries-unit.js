// 2.10.1 (updated for 3.0.0: configurable dinner cutoff 23:55, late close 08:00, signed session tokens) backend unit tests for Summaries.gs (kitchen order summaries by date, 8pm auto save, snapshots).
// No network, no real Sheet: Code.gs + Speed.gs + Summaries.gs run in a Node VM against an in-memory fake spreadsheet.
// Run: node tools/tests/summaries-unit.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); }

// ---- fake spreadsheet
function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const sh = {
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => ({ getValues: () => { const w = sh.getLastColumn(); return data.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); } }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < (nc || 1); j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
      getValue: () => ((data[r - 1] || [])[c - 1] === undefined ? '' : data[r - 1][c - 1]),
      setValue: (v) => { if (typeof v === 'string' && v.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.'); while (data.length < r) data.push([]); data[r - 1][c - 1] = v; },
      setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => { while (data.length < r + i) data.push([]); data[r - 1 + i][c - 1 + j] = v; })); }
    }),
    appendRow: (row) => { row.forEach(v => { if (typeof v === 'string' && v.length > 50000) throw new Error('cell > 50000'); }); data.push(row.map(v => (typeof v === 'string' && v.charAt(0) === "'") ? v.slice(1) : v)); },
    setFrozenRows: () => {},
    _data: data
  };
  return sh;
}
const sheets = {};
function addSheet(name, headers, objs) { sheets[name] = makeSheet(name, [headers].concat((objs || []).map(o => headers.map(h => o[h] === undefined ? '' : o[h])))); }
const ORDER_H = ['id', 'serviceDate', 'userEmail', 'userName', 'department', 'mealChoice', 'notes', 'status', 'late', 'createdAt', 'specialNote'];
function orders(date, n, extra) {
  const dishes = ['Chicken Pizza', 'Beef Curry / Rice / Chutney', 'Sausages / Potato Salad / Gravy'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Object.assign({ id: 'din_' + date + '_' + i, serviceDate: date, userEmail: 's' + i + '@x.com', userName: 'Staff Member Number ' + i, department: 'Housekeeping', mealChoice: dishes[i % 3], notes: '', status: 'approved', late: 'FALSE', createdAt: date + ' 10:' + String(i % 60).padStart(2, '0') + ' FJT', specialNote: i === 1 ? 'Allergic to peanuts' : (i === 2 ? 'vegetarian please' : '') }, extra || {}));
  return out;
}
addSheet('Users', ['id', 'email', 'firstName', 'lastName', 'preferredName', 'department', 'role', 'permissions', 'active', 'verified'], [
  { id: 'u1', email: 'it@paradisecoveresortfiji.com', firstName: 'IT', lastName: 'Admin', department: 'IT', role: 'super_admin', permissions: 'super_admin,admin', active: 'TRUE', verified: 'TRUE' },
  { id: 'u2', email: 'chef@x.com', firstName: 'Vicky', lastName: 'C', department: 'Kitchen', role: 'chef', permissions: 'staff,chef', active: 'TRUE', verified: 'TRUE' },
  { id: 'u3', email: 'staff@x.com', firstName: 'Ana', lastName: 'S', department: 'Housekeeping', role: 'staff', permissions: 'staff', active: 'TRUE', verified: 'TRUE' }
]);
const dinnerRows = [].concat(orders('2026-09-26', 5), orders('2026-09-27', 7), orders('2026-09-28', 400), orders('2026-09-29', 3),
  [{ id: 'din_cx', serviceDate: '2026-09-28', userEmail: 'cx@x.com', userName: 'Cancelled Person', department: 'Spa', mealChoice: 'Chicken Pizza', status: 'cancelled', late: 'FALSE', createdAt: '2026-09-27 09:00 FJT' }]);
addSheet('Dinner Orders', ORDER_H, dinnerRows);
addSheet('Breakfast Orders', ORDER_H, [{ id: 'b1', serviceDate: '2026-09-28', userEmail: 'staff@x.com', userName: 'Ana', department: 'Housekeeping', mealChoice: 'Breakfast', status: 'ordered', late: 'FALSE', createdAt: '2026-09-27 08:00 FJT' },
  { id: 'b2', serviceDate: '2026-09-28', userEmail: 'l@x.com', userName: 'Late Waiting', department: 'Spa', mealChoice: 'Breakfast', status: 'late_pending', late: 'TRUE', createdAt: '2026-09-27 15:00 FJT' }]);
addSheet('Lunch Orders', ORDER_H, [{ id: 'l1', serviceDate: '2026-09-28', userEmail: 'staff@x.com', userName: 'Ana', department: 'Housekeeping', mealChoice: 'Lunch', status: 'ordered', late: 'FALSE', createdAt: '2026-09-27 08:00 FJT' }]);
// an old-format 2.10.0 snapshot for the 26th (full payload in one cell)
addSheet('Dinner Prep Snapshots', ['id', 'serviceDate', 'generatedAt', 'autoGenerated', 'totalOrders', 'payloadJson'], [
  { id: 'dprep_old26', serviceDate: '2026-09-26', generatedAt: '2026-09-25 20:31 FJT', autoGenerated: 'TRUE', totalOrders: 4, payloadJson: JSON.stringify({ serviceDate: '2026-09-26', totalOrders: 4, tally: { 'Chicken Pizza': 4 }, byItem: { 'Chicken Pizza': [{ displayName: 'Old Snap', foodSelection: 'Chicken Pizza', status: 'approved', approved: true }] }, specialNotes: [] }) }]);
['App Settings', 'Boat Runs', 'Boat Bookings', 'Reminders', 'Suggestions', 'Leave Requests', 'Emergency Travel', 'Alert Emails', 'Verification Codes', 'Dinner Menus', 'Roster Uploads', 'Roster Shifts', 'Notifications'].forEach(n => addSheet(n, ['id']));

const ss = { getId: () => 'fake', getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => { sheets[n] = makeSheet(n, []); return sheets[n]; } };
const props = {}, cache = {};
let NOW = Date.parse('2026-09-27T22:50:00Z'); // 2026-09-28 10:50 Fiji
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const ctx = {
  console, JSON, Math, Date: FakeDate,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
  Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d) => d.toISOString(), base64Encode: (b) => Buffer.from(b).toString('base64'),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, getKeys: () => Object.keys(props), deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }, getAll: () => ({}), putAll: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  HtmlService: { createHtmlOutput: (h) => { ctx._html = h; return { getBlob: () => ({ getAs: () => ({ setName: (n) => ({ name: n }) }) }) }; } },
  DriveApp: { getFoldersByName: () => { throw new Error('You do not have permission to call DriveApp.getFoldersByName. Required permissions: https://www.googleapis.com/auth/drive'); } },
  ScriptApp: { getProjectTriggers: () => { throw new Error('no scriptapp permission'); } }
};
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(root, 'apps-script')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
const call = (action, p) => JSON.parse(ctx.handleRequest({ parameter: Object.assign({ action }, p || {}) }, 'GET').getContent ? ctx.handleRequest({ parameter: Object.assign({ action }, p || {}) }, 'GET').getContent() : '{}');
ctx.ContentService = undefined;
// jsonOut uses ContentService — stub it
ctx.ContentService = { createTextOutput: (t) => ({ setMimeType: function () { return this; }, getContent: () => t, _t: t }), MimeType: { JSON: 'json' } };
// 3.0.0: role calls carry the signed session token the app gets at login
const tok = (email) => ctx.makeSessionToken(ctx.findUserByEmail(email));
const api = (action, p) => { p = Object.assign({}, p || {}); if (p.requesterEmail) p.sessionToken = tok(p.requesterEmail); return JSON.parse(ctx.handleRequest({ parameter: Object.assign({ action }, p) }, 'GET').getContent()); };
const snapRows = () => { const d = sheets['Dinner Prep Snapshots']._data; const h = d[0]; return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const dinnerBefore = JSON.stringify(sheets['Dinner Orders']._data);

check('getVersion is 3.0.0', api('getVersion').version === '3.0.0');
let r = api('getKitchenDaySummary', { serviceDate: '2026-09-28', requesterEmail: 'staff@x.com' });
check('staff cannot read kitchen summaries', r.success === false);
r = api('getKitchenDaySummary', { serviceDate: '2026-09-28', requesterEmail: 'chef@x.com' });
check('chef reads 28 Sep summary', r.success === true, r.error);
check('28 Sep list saved by the lazy tick (cutoff 27 Sep 11:55pm passed; 400 orders, cancelled excluded)', r.data.dinner.source === 'snapshot' && r.data.dinner.prep.totalOrders === 400 && r.data.dinner.liveTotal === 400);
check('tally + byItem present', Object.keys(r.data.dinner.prep.tally).length === 3 && Object.keys(r.data.dinner.prep.byItem).length === 3);
check('allergy/diet notes flagged', r.data.dinner.prep.specialNotes.some(e => e.flag === 'allergy') && r.data.dinner.prep.specialNotes.some(e => e.flag === 'diet'));
check('days = 25..29 Sep (last 3 days, today, tomorrow)', r.data.days.map(d => d.date).join(',') === '2026-09-25,2026-09-26,2026-09-27,2026-09-28,2026-09-29', r.data.days.map(d => d.date).join(','));
check('day counts from rows', r.data.days.find(d => d.date === '2026-09-28').dinnerOrders === 400 && r.data.days.find(d => d.date === '2026-09-27').dinnerOrders === 7);
check('breakfast: late request auto-approved at the midnight late close → counted', r.data.breakfast.totalCounted === 2 && r.data.breakfast.orders.length === 2 && r.data.breakfast.orders.some(o => o.status === 'late_approved'));
check('lunch headcount', r.data.lunch.totalCounted === 1);
check('29 Sep still open before the 11:55pm cutoff', api('getKitchenDaySummary', { serviceDate: '2026-09-29', requesterEmail: 'chef@x.com' }).data.dinner.stillOpen === true);
r = api('getKitchenDaySummary', { serviceDate: '2026-09-26', requesterEmail: 'chef@x.com' });
check('26 Sep uses the old 2.10.0 snapshot format', r.data.dinner.source === 'snapshot' && r.data.dinner.prep.totalOrders === 4 && r.data.dinner.liveTotal === 5);
r = api('getKitchenDaySummary', { serviceDate: '2026-09-26', requesterEmail: 'chef@x.com', source: 'rows' });
check('source=rows forces live rows', r.data.dinner.source === 'rows' && r.data.dinner.prep.totalOrders === 5);
check('summary reads never touched Dinner Orders rows', JSON.stringify(sheets['Dinner Orders']._data.map(r => r.slice(0, 11))) === JSON.stringify(JSON.parse(dinnerBefore).map(r => r.slice(0, 11))));
check('29 Sep not saved before its cutoff; 28 Sep saved + final after 8am late close', !props['dsum_saved_2026-09-29'] && !!props['dsum_saved_2026-09-28'] && !!props['late_done_dinner_2026-09-28']);

// ---- after the 11:55pm cutoff: first request saves tomorrow's (29th) summary; 400-order payload > 50k chars must still save (split cells)
NOW = Date.parse('2026-09-28T11:56:00Z'); // 23:56 Fiji 28 Sep
api('getCutoffInfo', { requesterEmail: 'staff@x.com' });
let s29 = snapRows().find(s => String(s.serviceDate).indexOf('2026-09-29') >= 0);
check('first request after the 11:55pm cutoff saved the 29 Sep snapshot', !!s29 && Number(s29.totalOrders) === 3 && s29.kind === 'auto', JSON.stringify(props));
check('property marks the night done', !!props['dsum_saved_2026-09-29']);
const n1 = snapRows().length; api('getCutoffInfo', {}); api('getCutoffInfo', {});
check('later requests do not save again', snapRows().length === n1);
check('Drive not authorised → no pdf, no crash', !s29.pdfFileId);
// big day: save 28 Sep (400 orders) via admin action → split across cells
r = api('saveDinnerSummary', { serviceDate: '2026-09-28', requesterEmail: 'it@paradisecoveresortfiji.com' });
const s28 = snapRows().find(s => String(s.serviceDate).indexOf('2026-09-28') >= 0);
check('400-order snapshot saved despite 50k cell limit', r.success && !!s28 && String(s28.payloadJson2 || '').length > 0, r.error);
check('saveDinnerSummary reports pdf failure (Drive scope) without failing', r.success && r.data.pdf && r.data.pdf.ok === false);
r = api('getKitchenDaySummary', { serviceDate: '2026-09-28', requesterEmail: 'chef@x.com' });
check('28 Sep now read from the saved snapshot, same totals + notes', r.data.dinner.source === 'snapshot' && r.data.dinner.prep.totalOrders === 400 && r.data.dinner.prep.specialNotes.length === r.data.dinner.prep.specialNotes.length && r.data.dinner.prep.specialNotes.some(e => e.flag === 'allergy'));
check('staff cannot saveDinnerSummary; chef can (3.0.0 Kitchen Admin)', api('saveDinnerSummary', { serviceDate: '2026-09-28', requesterEmail: 'staff@x.com' }).success === false && api('saveDinnerSummary', { serviceDate: '2026-09-28', requesterEmail: 'chef@x.com' }).success === true);
// 2.10.0 8:30pm upsert still works and no longer throws for big payloads
NOW = Date.parse('2026-09-28T11:58:00Z'); // 23:58 Fiji
const up = ctx.upsertDinnerPrepSnapshot('2026-09-28', true);
check('upsertDinnerPrepSnapshot (8:30pm path) saves big payload, returns row', up && up.totalOrders === 400);
r = api('getDinnerPrepList', { requesterEmail: 'chef@x.com' });
check('getDinnerPrepList (2.10.0) still works after the cutoff', r.success === true && r.data.serviceDate === '2026-09-29' && r.data.snapshot && Number(r.data.snapshot.totalOrders) === 3, r.error || JSON.stringify(r.data && r.data.snapshot));
check('backfill needs superadmin', api('backfillDinnerSummaries', { requesterEmail: 'chef@x.com' }).success === false);
r = api('backfillDinnerSummaries', { requesterEmail: 'it@paradisecoveresortfiji.com' });
check('backfill keeps readable snapshots, adds missing (27th)', r.success && r.data.backfill.find(x => x.serviceDate === '2026-09-27').saved === true && !!r.data.backfill.find(x => x.serviceDate === '2026-09-26').kept, JSON.stringify(r.data && r.data.backfill));
check('prep HTML (PDF) builder has allergy section + dishes', /Allergies &amp; special requests/.test(ctx.dsumPrepHtml('2026-09-28', ctx.dsumPrepFromOrders('2026-09-28', ctx.dsumDinnerRows('2026-09-28')), 'x')));
check('Dinner Orders never modified by any summary code', JSON.stringify(sheets['Dinner Orders']._data.map(r => r.slice(0, 11))) === JSON.stringify(JSON.parse(dinnerBefore).map(r => r.slice(0, 11))));
const fe = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
check('frontend: date picker + api call present', /kit-days-card/.test(fe) && /getKitchenDaySummary/.test(fe) && /APP_VERSION = '3\.0\.1'/.test(fe));
check('docs mirrors public', fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8') === fe && fs.readFileSync(path.join(root, 'docs', 'sw.js'), 'utf8') === fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
