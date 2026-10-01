// 3.4.0: the client roster parser (v3.js "r34parse" blocks) over Pranav's real PCR roster workbooks, with SheetJS in node.
// node tools/tests/r340-realparse.js [/workspace/rosters-real] [/path/xlsx.full.min.js] [out.json]
// Real staff data: this test only reads the files and writes a summary (no names leave the box).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const dir = process.argv[2] || '/workspace/rosters-real', xlsxPath = process.argv[3] || '/workspace/tools-xlsx/xlsx.full.min.js', outPath = process.argv[4] || '';
if (!fs.existsSync(dir) || !fs.existsSync(xlsxPath)) { console.log('SKIP (no real rosters / SheetJS here)'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x && !c ? ' — ' + x : '')); };
const src = fs.readFileSync(path.join(root, 'public/assets/v3.js'), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ctx = { console, Date, Math, JSON, String, Number, Array, Object, RegExp };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(xlsxPath, 'utf8'), ctx);
vm.runInContext(cut('/* r34parse:begin-helpers */', '/* r34parse:end-helpers */') + cut('/* r34parse:begin */', '/* r34parse:end */').replace(/^async function r34ReadFile[\s\S]*?\n}\n/m, ''), ctx);
const gs = { getSetting: (k, fb) => (fb === undefined ? '' : String(fb)), console: { log() {}, warn() {} } }; vm.createContext(gs); vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Roster34.gs'), 'utf8'), gs);
const codes = {}; Object.keys(gs.R34_DEFAULT_CODES).forEach(k => { codes[gs.r34CodeKey(k)] = gs.R34_DEFAULT_CODES[k]; });
const depts = gs.R34_BASE_DEPTS.concat(gs.R34_ROSTER_DEPTS);
const files = [];
(function walk(d) { fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.xls[xm]?$/i.test(f)) files.push(p); }); })(dir);
const report = { files: [], sheetDepts: {}, codes: {}, leaveTypes: {}, otherTexts: {}, names: {}, duplicates: [] };
const sigs = [];
files.sort().forEach(f => {
  const rel = path.relative(dir, f);
  let wb; try { wb = ctx.XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: false, cellNF: true }); } catch (e) { report.files.push({ file: rel, error: e.message }); return; }
  const t = ctx.r34Sheets(wb);
  const w = ctx.r34WorkbookWeek(path.basename(f), t.sheets, { codes, departments: depts });
  if (!w.week) { report.files.push({ file: rel, note: 'not a weekly roster' }); return; }
  const per = { start: w.week, end: ctx.r34Add(w.week, 6), weekly: true };
  const res = ctx.r34ParseWorkbook(t.sheets, per, { codes, departments: depts, remapWeek: true });
  const rows = [].concat(...res.map(s => s.rows));
  const fr = { file: rel, week: w.week, fromName: w.fromName, sheetsWeek: w.sheetsWeek, warning: w.warning, people: res.reduce((a, s) => a + s.people, 0), entries: rows.length,
    sheets: res.map(s => ({ sheet: s.name, department: s.department, people: s.people, entries: s.rows.length, remappedFrom: s.remappedFrom, sections: s.sections })) };
  report.files.push(fr);
  if (rows.length > 20) { const sig = ctx.r34WeekSig(rows, per.start); const twin = sigs.find(x => x.sig === sig); if (twin) report.duplicates.push([twin.file, rel]); sigs.push({ sig, file: rel }); }
  res.forEach(s => {
    (report.sheetDepts[s.name] = report.sheetDepts[s.name] || { department: s.department, files: 0 }).files++;
    s.rows.forEach(r => {
      const k = r.code ? ctx.r34CodeKeyC(r.code) : '';
      if (r.code && ctx.r34IsCode(r.code, codes)) { report.codes[k] = (report.codes[k] || 0) + 1; const lt = gs.r34ParseCell(r.code, codes); const ty = lt.leaveType || (lt.dayOff ? 'Day off' : '?'); report.leaveTypes[ty] = (report.leaveTypes[ty] || 0) + 1; }
      else if (r.code && gs.r34ParseCell(r.code, codes).released) report.released = (report.released || 0) + 1;
      else if (r.code) report.otherTexts[k] = (report.otherTexts[k] || 0) + 1;
      report.names[s.department + ' | ' + r.rawName] = 1;
    });
  });
});
const F = (re) => report.files.find(f => re.test(f.file)) || {};
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
report.files.forEach(f => console.log('  ' + f.file + ' · ' + (f.week || '') + (f.error ? ' ERROR ' + f.error : f.note ? ' ' + f.note : ' · ' + f.people + ' people · ' + f.entries + ' entries' + (f.warning ? ' · ⚠ ' + f.warning : '') + ' · ' + f.sheets.map(s => s.department + ':' + s.people + (s.remappedFrom ? '(dates fixed)' : '')).join(' '))));
console.log('  leave/off types', JSON.stringify(report.leaveTypes));
console.log('  other day texts', JSON.stringify(top(report.otherTexts, 25)));
console.log('  duplicates', JSON.stringify(report.duplicates));

check('35 files read, none crashed (incl. the corrupt-style "we 08 Mar")', report.files.length === 35 && !report.files.some(f => f.error), JSON.stringify(report.files.filter(f => f.error)));
check('Rotation calendar and 4-week forecast are not rosters', /not a weekly/.test(F(/TEVITA/).note || '') && /not a weekly/.test(F(/FORECAST/).note || ''));
const deptSet = new Set(Object.values(report.sheetDepts).map(x => x.department));
check('15 roster departments found', deptSet.size === 15, [...deptSet].join(','));
check('every roster department is in the app list', [...deptSet].every(d => depts.includes(d)), [...deptSet].filter(d => !depts.includes(d)).join(','));
check('Houskeeping → Housekeeping, NEW F&B → F&B, BAR1 → Bar', report.sheetDepts['Houskeeping'].department === 'Housekeeping' && report.sheetDepts['NEW F&B'].department === 'F&B' && report.sheetDepts['BAR1'].department === 'Bar');
check('Summary / Man Hrs / Floor1 / Sheet4 skipped', !['Summary', 'Man Hrs', 'Man hrs Ratio', 'Floor1', 'Sheet4'].some(n => report.sheetDepts[n]));
const wk = (re, mon) => F(re).week === mon;
check('week from file name: we 05 APRIL 26 → Mon 30 Mar', wk(/05 APRIL/, '2026-03-30'));
check('year typo (we 11 Jan, dated 2025) → Mon 5 Jan 2026 + warning', wk(/11 Jan/, '2026-01-05') && /file name/.test(F(/11 Jan/).warning || ''), JSON.stringify(F(/11 Jan/)).slice(0, 300));
check('"WE 19TH JULY" (really dated 27 Jul) → week of 13 Jul + warning', wk(/19TH JULY/, '2026-07-13') && !!F(/19TH JULY/).warning);
check('"we 0326" (no date in the name) → sheets majority Mon 20 Apr', wk(/0326/, '2026-04-20'));
check('WE 02ND AUGUST: Sat/Sun typed as July → whole week kept (7 days)', F(/02ND AUGUST/).sheets.filter(s => s.entries).every(s => s.entries % 1 === 0) && F(/02ND AUGUST/).entries > 500, String(F(/02ND AUGUST/).entries));
const hk = F(/17 May/).sheets.find(s => s.department === 'Housekeeping');
check('we 17 May: Housekeeping 22–27 people, 7 days each', hk && hk.people >= 22 && hk.people <= 27 && hk.entries === hk.people * 7, JSON.stringify(hk));
check('typical file: 200–260 names listed', F(/17 May/).people >= 200 && F(/17 May/).people <= 260, String(F(/17 May/).people));
check('we 14 Jun (empty template) has few entries', F(/14 +Jun/).entries < 120, String(F(/14 +Jun/).entries));
check('DAY OFF is the main non-work label', report.leaveTypes['Day off'] > 8000, JSON.stringify(report.leaveTypes));
check('Annual / Unpaid / Maternity / Sick / Bereavement / PH all recognised', ['Annual leave', 'Unpaid leave', 'Maternity / Paternity', 'Sick leave', 'Family / Bereavement', 'Public holiday'].every(k => report.leaveTypes[k] > 0), JSON.stringify(report.leaveTypes));
check('typos counted: MARENITY LEAVE, BREVEAMNET, SICKLEAVE, DAT OFF', ['MARENITY LEAVE', 'BREVEAMNET', 'SICKLEAVE', 'DAT OFF'].every(k => report.codes[k]));
check('RELEASE / RELEASED / STAFF RELEASE read as separation markers', report.released > 20 && !report.otherTexts['RELEASE'] && !report.otherTexts['STAFF RELEASE'], String(report.released));
check('RELEASE / TRAINING / SDD / ON are not leave', !['RELEASE', 'TRAINING', 'SDD', 'ON'].some(k => report.codes[k]));
check('no occupancy / kids counts read as people', !Object.keys(report.names).some(k => /\| (occupancy|arriv|children|infants?|rooms)/i.test(k)));
const dupHas = (a, b) => report.duplicates.some(p => (a.test(p[0]) && b.test(p[1])) || (a.test(p[1]) && b.test(p[0])));
check('possible duplicate: we 0326 = we 26 APRIL', dupHas(/0326/, /26 APRIL/));
check('possible duplicate: we 24 May = we 17 May', dupHas(/24 May/, /17 May/));
check('possible duplicate: we 05 Jul = we 21 Jun', dupHas(/05 Jul/, /21 Jun/));
check('possible duplicate: WE 19TH JULY = WE 02ND AUGUST', dupHas(/19TH JULY/, /02ND AUGUST/));
check('possible duplicate: we 19 APRIL = we 12 APRIL', dupHas(/19 APRIL/, /12 APRIL/));
check('no false duplicates', report.duplicates.length <= 6, JSON.stringify(report.duplicates));
if (outPath) { const o = Object.assign({}, report, { names: Object.keys(report.names).length }); fs.writeFileSync(outPath, JSON.stringify(o, null, 1)); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
