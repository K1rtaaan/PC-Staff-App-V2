/**
 * 3.7.1 one-off: first live roster upload ("ROSTER W/E 01ST NOV 2026", parsed with the app's own parser) + Schedule leaders-only.
 * Runs once from pushTick as the script owner (no admin session needed), guarded by Script Property R371_IMPORT.
 * Same path as the admin upload: rosterUploadStart → rosterUploadChunk (500 rows) → rosterUploadFinish, as the superadmin account.
 */
var R371_FILE_ID = '14G5J9Xohk_KYO6IYt0r58eMFdDvuIi4q';
function r371ImportOnce() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('R371_IMPORT')) return { done: true };
  props.setProperty('R371_IMPORT', 'running ' + new Date().toISOString());
  var out = {};
  try {
    var file = DriveApp.getFileById(R371_FILE_ID);
    var d = JSON.parse(file.getBlob().getDataAsString());
    // flags first, so leaders-only filtering applies to the finish notices
    setSetting('feature_my_schedule', 'true', 'system (3.7.1)');
    setSetting('feature_schedule_leaders', 'true', 'system (3.7.1)');
    setSetting('meal_roster_block', 'false', 'system (3.7.1)');
    var actor = findUserByEmail(SUPERADMIN_EMAIL);
    if (!actor) throw new Error('superadmin account not found');
    var orig = r34Need;
    r34Need = function () { return actor; };
    try {
      var st = rosterUploadStart({ kind: 'weekly', periodKey: d.periodKey, department: 'ALL', fileName: d.fileName, fileType: 'xlsx', layout: 'workbook', totalRows: d.rows.length, logArea: 'admin' });
      if (!st || !st.success) throw new Error('start: ' + JSON.stringify(st));
      var id = st.data.uploadId, CH = 500, parts = Math.max(1, Math.ceil(d.rows.length / CH));
      for (var i = 0; i < parts; i++) {
        var c = rosterUploadChunk({ uploadId: id, chunkIndex: i, shifts: d.rows.slice(i * CH, (i + 1) * CH) });
        if (!c || !c.success) throw new Error('chunk ' + i + ': ' + JSON.stringify(c));
      }
      var f = rosterUploadFinish({ uploadId: id, logArea: 'admin' });
      if (!f || !f.success) throw new Error('finish: ' + JSON.stringify(f));
      out = { uploadId: id, shifts: f.data.shifts, people: f.data.people, unmatched: (f.data.unmatched || []).length, notified: f.data.notified };
    } finally { r34Need = orig; }
    try { file.setTrashed(true); } catch (e2) { out.trashError = String(e2); }
    props.setProperty('R371_IMPORT', JSON.stringify(out).slice(0, 8000));
  } catch (e) {
    props.setProperty('R371_IMPORT', 'error ' + String(e && e.message || e).slice(0, 4000));
    out.error = String(e && e.message || e);
  }
  try { setSetting('r371_import_result', props.getProperty('R371_IMPORT'), 'system (3.7.1)'); } catch (e3) {}
  return out;
}
