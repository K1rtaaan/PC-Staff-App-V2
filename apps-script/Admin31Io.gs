/* 3.1.0: sheet access for Admin31.gs on the Apps Script server (the ?demo=1 mode has its own A31IO in assets/v3.js). */
var A31_TEXT_KEYS = { date: 1, time: 1, dueDate: 1, serviceDate: 1, startDate: 1, endDate: 1 };
function a31Cell(h, v) {
  if (v === null || v === undefined) return '';
  if (A31_TEXT_KEYS[h] && typeof v === 'string' && v !== '' && v.charAt(0) !== "'") return "'" + v;
  return v;
}
function a31Find(sheetName, keyField, keyVal) {
  var sh = getSS().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getDataRange().getValues(), headers = data[0].map(String), col = headers.indexOf(keyField);
  if (col < 0) return null;
  for (var r = 1; r < data.length; r++) {
    var v = data[r][col];
    var s = Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v);
    if (s.replace(/^'/, '').trim().toLowerCase() === String(keyVal).trim().toLowerCase()) return { sh: sh, row: r + 1, headers: headers };
  }
  return null;
}
var A31IO = {
  rows: function (sheetName) { try { return sheetToObjectsRaw(sheetName); } catch (e) { return []; } },
  update: function (sheetName, keyField, keyVal, fields, ensure) {
    var sh0 = getSS().getSheetByName(sheetName); if (!sh0) return false;
    ensureColumns(sh0, (ensure || []).concat(Object.keys(fields || {})));
    var f = a31Find(sheetName, keyField, keyVal); if (!f) return false;
    Object.keys(fields).forEach(function (h) { var c = f.headers.indexOf(h); if (c < 0) { f.headers = f.sh.getRange(1, 1, 1, f.sh.getLastColumn()).getValues()[0].map(String); c = f.headers.indexOf(h); } if (c >= 0) f.sh.getRange(f.row, c + 1).setValue(a31Cell(h, fields[h])); });
    scInvalidateSheet(sheetName);
    return true;
  },
  remove: function (sheetName, keyField, keyVal) {
    var f = a31Find(sheetName, keyField, keyVal); if (!f) return false;
    f.sh.deleteRow(f.row); scInvalidateSheet(sheetName); return true;
  },
  append: function (sheetName, row) {
    var sh = getSS().getSheetByName(sheetName); if (!sh) return false;
    appendRow(sheetName, row, Object.keys(row)); return true;
  },
  appendLog: function (row) { ensureSheet(getSS(), A31_LOG_SHEET, A31_LOG_HEADERS); appendRow(A31_LOG_SHEET, row, A31_LOG_HEADERS); },
  logRows: function () { try { return sheetToObjectsRaw(A31_LOG_SHEET); } catch (e) { return []; } },
  updateLog: function (id, patch) { return A31IO.update(A31_LOG_SHEET, 'id', id, patch); }
};
