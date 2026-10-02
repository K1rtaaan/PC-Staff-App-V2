#!/usr/bin/env node
// Local Apps Script emulator for the TEST backend (used for end-to-end tests while the real TEST
// deployment waits for its one-time owner authorisation). Loads the built TEST backend (*.gs) into a
// Node VM with in-memory Sheets, Properties, Cache, Lock, Mail (captured, never sent) and triggers,
// and serves doGet over HTTP with CORS. It can also serve a static site folder.
//
//   node tools/test-env/gas-emulator.js --gs /workspace/pcr-test-backend --port 8790 [--site DIR --site-path /PC-Staff-App-V2-Test/]
// Debug endpoints: /__mail (captured mail), /__clock?offsetMs=N, /__run?fn=name, /__live-writes, /__sheet?name=Users
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), http = require('http'), url = require('url');
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GS = arg('--gs', '/workspace/pcr-test-backend'), PORT = Number(arg('--port', 8790));
const SITE = arg('--site', ''), SITE_PATH = arg('--site-path', '/PC-Staff-App-V2-Test/');
const LIVE_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM';
let clockOffset = 0; const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + clockOffset); else super(...a); } static now() { return RealDate.now() + clockOffset; } }

// ---------- time helpers
function tzParts(d, tz) {
  if (tz === 'UTC' || tz === 'GMT' || tz === 'Etc/UTC') { const x = new RealDate(d.getTime()); return { y: x.getUTCFullYear(), M: x.getUTCMonth() + 1, d: x.getUTCDate(), H: x.getUTCHours(), m: x.getUTCMinutes(), s: x.getUTCSeconds(), w: x.getUTCDay() }; }
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Pacific/Fiji', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const p = {}; f.formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, M: +p.month, d: +p.day, H: +p.hour % 24, m: +p.minute, s: +p.second, w: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const pad = (n, l = 2) => String(n).padStart(l, '0');
function formatDate(d, tz, fmt) {
  const p = tzParts(d, tz); const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return String(fmt).replace(/yyyy|MMM|MM|dd|HH|mm|ss|EEE|a|hh/g, t => ({ yyyy: p.y, MMM: MN[p.M - 1], MM: pad(p.M), dd: pad(p.d), HH: pad(p.H), mm: pad(p.m), ss: pad(p.s), EEE: DN[p.w], a: p.H < 12 ? 'AM' : 'PM', hh: pad(((p.H + 11) % 12) + 1) })[t]);
}
// Sheets-like coercion on write
function coerce(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof RealDate) return new RealDate(v.getTime());
  if (typeof v !== 'string') return v;
  if (v.charAt(0) === "'") return v.slice(1);
  if (v === 'TRUE' || v === 'true') return v === 'TRUE' ? true : v; // Sheets turns TRUE into a boolean; lowercase "true" too
  if (v === 'FALSE') return false;
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v)) return Number(v);
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new RealDate(RealDate.UTC(+m[1], +m[2] - 1, +m[3]) - 12 * 3600e3);
  return v;
}
const cloneCell = v => v instanceof RealDate ? new RealDate(v.getTime()) : v;
function display(v) { if (v instanceof RealDate) return formatDate(v, 'Pacific/Fiji', 'yyyy-MM-dd HH:mm:ss'); if (v === true) return 'TRUE'; if (v === false) return 'FALSE'; return String(v); }

// ---------- in-memory spreadsheets
const books = {}; const liveWrites = [];
function Book(id, name) { this.id = id; this.name = name; this.sheets = []; this.frozen = false; }
Book.prototype.guard = function () { if (this.frozen) { liveWrites.push(new RealDate().toISOString()); throw new Error('EMULATOR: write attempted on the LIVE stand-in'); } };
function Sheet(book, name) { this.book = book; this.name = name; this.rows = []; }
Sheet.prototype.width = function () { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); };
Sheet.prototype.cell = function (r, c) { const row = this.rows[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; };
Sheet.prototype.put = function (r, c, v) { this.book.guard(); while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c - 1) row.push(''); row[c - 1] = coerce(v); };
Sheet.prototype.lastRow = function () { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some(v => v !== '' && v !== null && v !== undefined)) return i; return 0; };
Sheet.prototype.lastCol = function () { let m = 0; this.rows.forEach(r => { for (let j = r.length; j > m; j--) if (r[j - 1] !== '' && r[j - 1] !== undefined) { m = j; break; } }); return m; };
function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; if (r < 1 || c < 1 || this.nr < 1 || this.nc < 1) throw new Error('The coordinates or dimensions of the range are invalid.'); }
Range.prototype.getValues = function () { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(cloneCell(this.sh.cell(this.r + i, this.c + j))); o.push(row); } return o; };
Range.prototype.getDisplayValues = function () { return this.getValues().map(r => r.map(display)); };
Range.prototype.getValue = function () { return cloneCell(this.sh.cell(this.r, this.c)); };
Range.prototype.setValue = function (v) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.put(this.r + i, this.c + j, v); return this; };
Range.prototype.setValues = function (vals) { if (vals.length !== this.nr || vals.some(r => r.length !== this.nc)) throw new Error('The number of rows or columns in the data does not match the range.'); vals.forEach((row, i) => row.forEach((v, j) => this.sh.put(this.r + i, this.c + j, v))); return this; };
Range.prototype.clearContent = function () { return this.setValue(''); };
Range.prototype.getRow = function () { return this.r; };
Range.prototype.setNumberFormat = function () { return this; };
Range.prototype.setFontWeight = function () { return this; };
Range.prototype.createTextFinder = function (text) { const self = this; let whole = false; return { matchEntireCell(b) { whole = !!b; return this; }, findNext() { for (let i = 0; i < self.nr; i++) for (let j = 0; j < self.nc; j++) { const v = display(self.sh.cell(self.r + i, self.c + j)); if (whole ? v === String(text) : v.indexOf(String(text)) >= 0) return new Range(self.sh, self.r + i, self.c + j); } return null; } }; };
const sheetApi = sh => ({
  getName: () => sh.name,
  getRange: (r, c, nr, nc) => { if (typeof r === 'string') throw new Error('A1 notation not supported in emulator'); return new Range(sh, r, c, nr, nc); },
  getLastRow: () => sh.lastRow(), getLastColumn: () => sh.lastCol(), getMaxColumns: () => Math.max(26, sh.width()), getMaxRows: () => Math.max(1000, sh.rows.length),
  getDataRange: () => new Range(sh, 1, 1, Math.max(1, sh.lastRow()), Math.max(1, sh.lastCol())),
  appendRow: (vals) => { sh.book.guard(); const r = sh.lastRow() + 1; vals.forEach((v, j) => sh.put(r, j + 1, v)); if (!vals.length) sh.put(r, 1, ''); return sheetApi(sh); },
  deleteRow: (r) => { sh.book.guard(); sh.rows.splice(r - 1, 1); }, deleteRows: (r, n) => { sh.book.guard(); sh.rows.splice(r - 1, n); },
  insertRowAfter: () => {}, setFrozenRows: () => {}, autoResizeColumns: () => {}, hideSheet: () => {}, setColumnWidth: () => {},
  clear: () => { sh.book.guard(); sh.rows = []; }, clearContents: () => { sh.book.guard(); sh.rows = []; },
  getSheetId: () => sh.book.sheets.indexOf(sh)
});
const bookApi = b => ({
  getId: () => b.id, getName: () => b.name, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + b.id + '/edit (emulated)',
  getSheetByName: (n) => { const s = b.sheets.find(x => x.name === n); return s ? sheetApi(s) : null; },
  getSheets: () => b.sheets.map(sheetApi),
  deleteSheet: (sa) => { b.guard(); const i = b.sheets.findIndex(x => x.name === sa.getName()); if (i >= 0) b.sheets.splice(i, 1); },
  insertSheet: (n) => { b.guard(); if (b.sheets.find(x => x.name === n)) throw new Error('A sheet with the name "' + n + '" already exists.'); const s = new Sheet(b, n); b.sheets.push(s); return sheetApi(s); },
  copy: (name) => { const id = 'TEST-' + crypto.randomBytes(8).toString('hex'); const nb = new Book(id, name); b.sheets.forEach(s => { const ns = new Sheet(nb, s.name); ns.rows = s.rows.map(r => r.map(cloneCell)); nb.sheets.push(ns); }); books[id] = nb; return bookApi(nb); }
});

// ---------- services
const props = {}, cache = {}, mail = [], triggers = [], logs = [];
const cacheApi = { get: k => { const e = cache[k]; if (!e) return null; if (e.exp < RealDate.now()) { delete cache[k]; return null; } return e.v; },
  put: (k, v, ttl) => { cache[k] = { v: String(v), exp: RealDate.now() + 1000 * Math.min(Number(ttl || 600), 21600) }; },
  remove: k => { delete cache[k]; }, removeAll: ks => ks.forEach(k => delete cache[k]),
  getAll: ks => { const o = {}; ks.forEach(k => { const v = cacheApi.get(k); if (v !== null) o[k] = v; }); return o; },
  putAll: (m, ttl) => Object.keys(m).forEach(k => cacheApi.put(k, m[k], ttl)) };
function capture(via, m) { mail.push(Object.assign({ at: new RealDate().toISOString(), via }, m)); }
const ctx = {
  console, JSON, Math, Date: FakeDate, Intl,
  SpreadsheetApp: { create: (name) => { const id = 'TEST-' + crypto.randomBytes(8).toString('hex'); const nb = new Book(id, name); nb.sheets.push(new Sheet(nb, 'Sheet1')); books[id] = nb; return bookApi(nb); }, openById: (id) => { const b = books[id]; if (!b) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp. (no such sheet ' + id + ')'); return bookApi(b); }, getActiveSpreadsheet: () => null, flush: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
  CacheService: { getScriptCache: () => cacheApi },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(), formatDate, sleep: () => {},
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', Buffer.from(k, 'utf8')).update(Buffer.from(v, 'utf8')).digest()).map(b => b > 127 ? b - 256 : b),
    computeDigest: (alg, v) => Array.from(crypto.createHash('sha256').update(String(v)).digest()).map(b => b > 127 ? b - 256 : b), DigestAlgorithm: { SHA_256: 'sha256' },
    base64EncodeWebSafe: v => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64Encode: v => Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64'),
    base64DecodeWebSafe: s => Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')).map(b => b > 127 ? b - 256 : b),
    newBlob: bytes => ({ getDataAsString: () => Buffer.from((typeof bytes === 'string' ? Array.from(Buffer.from(bytes)) : bytes).map(b => b & 255)).toString('utf8') })
  },
  MailApp: { sendEmail: (a, s, b, o) => capture('mailapp', typeof a === 'object' ? a : Object.assign({ to: a, subject: s, body: b }, o || {})), getRemainingDailyQuota: () => 100 },
  GmailApp: { sendEmail: (to, subject, body, o) => capture('gmail', Object.assign({ to, subject, body }, o || {})) },
  UrlFetchApp: { fetch: (u, o) => { capture('urlfetch', { to: u, subject: 'HTTP', body: o && o.payload }); return { getResponseCode: () => 201, getContentText: () => '{}' }; } },
  ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) },
  ScriptApp: { getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t.fn, _t: t })), deleteTrigger: (t) => { const i = triggers.indexOf(t._t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => { const t = { fn }; const b = { timeBased: () => b, everyDays: (n) => { t.everyDays = n; return b; }, atHour: (h) => { t.atHour = h; return b; }, nearMinute: (m) => { t.nearMinute = m; return b; }, everyMinutes: (m) => { t.everyMinutes = m; return b; }, everyHours: (h) => { t.everyHours = h; return b; }, inTimezone: (z) => { t.tz = z; return b; }, create: () => { triggers.push(t); return {}; } }; return b; } },
  Session: { getActiveUser: () => ({ getEmail: () => 'pcrstaffapp@gmail.com' }), getEffectiveUser: () => ({ getEmail: () => 'pcrstaffapp@gmail.com' }), getScriptTimeZone: () => 'Pacific/Fiji' },
  Logger: { log: (...a) => logs.push(a.join(' ')) }
};
vm.createContext(ctx);
const files = fs.readdirSync(GS).filter(f => f.endsWith('.gs')).sort((a, b) => (a === 'Code.gs' ? -1 : b === 'Code.gs' ? 1 : a.localeCompare(b)));
files.forEach(f => vm.runInContext(fs.readFileSync(path.join(GS, f), 'utf8'), ctx, { filename: f }));
const R = (code) => vm.runInContext(code, ctx);

// ---------- build the LIVE stand-in (fake "real" users; the real live sheet is never read) then run the real setup
function seedLiveStandIn() {
  const b = new Book('LIVE-STANDIN', 'PCR Staff App V2 (emulated live stand-in)'); books['LIVE-STANDIN'] = b;
  R("SHEET_ID = 'LIVE-STANDIN'; initializeSheets(); ensureSuperAdmin();");
  const people = [
    ['mere.hk@example.test', 'Mere', 'Tabua', 'Housekeeping', 'staff,hod'], ['ana.hk@example.test', 'Ana', 'Tui', 'Housekeeping', 'staff'],
    ['sami.fb@example.test', 'Sami', 'Koro', 'F&B', 'staff'], ['jone.kitchen@example.test', 'Jone', 'Ratu', 'Kitchen', 'staff,chef'],
    ['eroni.boat@example.test', 'Eroni', 'Vula', 'Boatman', 'staff,boat_manager,boat_captain'], ['vika.office@example.test', 'Vika', 'Lesi', 'IT/Office', 'staff'],
    ['nicola.mgmt@example.test', 'Nicola', 'Reid', 'Management', 'staff,hod,admin'], ['pita.maint@example.test', 'Pita', 'Nand', 'Maintenance', 'staff', { deptStatus: '' }]
  ];
  people.forEach(p => R('appendRow("Users", ' + JSON.stringify(Object.assign({ id: 'usr_' + p[1].toLowerCase(), email: p[0], password: 'real-pw-hidden', firstName: p[1], lastName: p[2], department: p[3], role: p[4].split(',').pop() === 'boat_captain' ? 'boat_manager' : p[4].split(',').pop(), permissions: p[4], active: true, verified: true, createdAt: new RealDate().toISOString() }, p[5] || {})) + ')'));
  books[LIVE_ID] = b; delete books['LIVE-STANDIN']; b.id = LIVE_ID; b.frozen = true;
  R("SHEET_ID = ''"); Object.keys(cache).forEach(k => delete cache[k]);
  const out = R('setupTestEnvironment()');
  console.log('[emulator] setupTestEnvironment():\n  ' + out.join('\n  '));
}
seedLiveStandIn();

function runDoGet(q) {
  const e = { parameter: q, parameters: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, [v]])) };
  ctx.__e = e; const out = R('doGet(__e)'); return out.getContent();
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const u = url.parse(req.url, true); const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  const json = (o) => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, Object.assign({ 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' }, cors)); return res.end(); }
    if (u.pathname === '/exec') { const t = runDoGet(u.query); res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(t); }
    if (u.pathname === '/__mail') return json(mail);
    if (u.pathname === '/__clock') { if (u.query.offsetMs !== undefined) clockOffset = Number(u.query.offsetMs) || 0; return json({ offsetMs: clockOffset, now: new FakeDate().toISOString() }); }
    if (u.pathname === '/__run') return json({ result: R(String(u.query.fn).replace(/[^A-Za-z0-9_]/g, '') + '()') });
    if (u.pathname === '/__live-writes') return json({ liveWrites, liveFrozen: books[LIVE_ID].frozen, props: Object.keys(props), triggers, sheetId: R('SHEET_ID') });
    if (u.pathname === '/__sheet') { const b = books[R('SHEET_ID')]; const s = b.sheets.find(x => x.name === u.query.name); return json(s ? s.rows.map(r => r.map(display)) : null); }
    if (u.pathname === '/__sheets') { const b = books[R('SHEET_ID')]; return json({ name: b.name, sheets: b.sheets.map(s => s.name) }); }
    if (SITE && u.pathname.startsWith(SITE_PATH)) {
      let rel = decodeURIComponent(u.pathname.slice(SITE_PATH.length)) || 'index.html'; if (rel.endsWith('/')) rel += 'index.html';
      const f = path.join(SITE, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(f)); }
    }
    res.writeHead(404, cors); res.end('not found');
  } catch (err) { res.writeHead(500, cors); res.end(String(err && err.stack || err)); }
}).listen(PORT, '127.0.0.1', () => console.log('[emulator] listening on http://127.0.0.1:' + PORT + '/exec' + (SITE ? ' · site http://127.0.0.1:' + PORT + SITE_PATH : '')));
