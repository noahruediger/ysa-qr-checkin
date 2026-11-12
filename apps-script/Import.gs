/**
 * Import people from the registration form's responses sheet into this check-in Sheet.
 *
 * Why: the form's responses sheet belongs to the convention admin account and has the form's long
 * question headers. The check-in app needs its own Sheet it can write to, with a QR ID for everyone.
 * This copies each form response into the Registrants tab here, gives every new person the next
 * QR ID (YSA-0001, YSA-0002 ...), and keeps their answers up to date if they edit the form.
 *
 * It never touches the columns the app owns (Checked In, Lost, Pack/Shirt Given, QR Printed,
 * Picked Up, Team, Activity Bookings, the "By" columns ...), so running it again is always safe.
 * People are matched by email address (or by timestamp + name if there's no email). Nobody is
 * ever deleted here: if a response disappears from the form sheet, their row stays.
 *
 * Setup (once):
 *   1. Project Settings > Script Properties > add SOURCE_SHEET_ID = the ID of the responses
 *      spreadsheet (the long code in its URL between /d/ and /edit).
 *      Optional: SOURCE_TAB = the tab name (default "DO NOT EDIT!!! LIVE DATA").
 *   2. Run syncFromForm once from the editor (approve permissions). Check the Registrants tab.
 *   3. Run installSyncTrigger once: it re-runs syncFromForm every 5 minutes, so late
 *      registrations show up on everyone's phone without anyone touching the Sheet.
 *   Your Google account only needs VIEW access to the responses sheet.
 */

var DEFAULT_SOURCE_TAB = 'DO NOT EDIT!!! LIVE DATA';
var QR_PREFIX = 'YSA-';
var IMPORT_KEY_HEADER = 'Import Key';

// Form answers copied into Registrants (canonical names from HEADER_ALIASES in Code.gs).
// The form's photo upload goes into "Photo URL".
var IMPORT_FIELDS = [
  'Registration Timestamp', 'First Name', 'Last Name', 'Preferred Name', 'Email', 'Phone', 'LDS Member',
  'Ward', 'Stake', 'Emergency Contact Name', 'Emergency Contact Relationship', 'Emergency Contact Mobile',
  'On-site / Off-site', 'Requested Roommates', 'Arrival Day/Time', 'Airport Pickup Needed', 'Pickup Time',
  'Return Airport Transport Needed', 'T-Shirt', 'Dietary Restrictions', 'Dietary Detail', 'Allergies',
  'Allergy Detail', 'Medical / Disability Notes', 'Other Needs for Convenors', 'Interested in Temple Ordinances',
  'Brisbane Temple Worker', 'Gender', 'DOB', 'Photo URL'
];

function importKeyFor_(rec) {
  var email = String(rec['Email'] || '').trim().toLowerCase();
  if (email) return 'email:' + email;
  var ts = rec['Registration Timestamp'];
  var tsText = ts instanceof Date ? String(ts.getTime()) : String(ts || '');
  return 'row:' + tsText + '|' + String(rec['First Name'] || '').trim().toLowerCase() + '|' + String(rec['Last Name'] || '').trim().toLowerCase();
}

function sourceSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SOURCE_SHEET_ID');
  if (!id) throw new Error('Set the SOURCE_SHEET_ID script property first (Project Settings > Script Properties).');
  var tab = props.getProperty('SOURCE_TAB') || DEFAULT_SOURCE_TAB;
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(tab);
  if (!sh) throw new Error('No tab called "' + tab + '" in the source spreadsheet. Set SOURCE_TAB.');
  return sh;
}

// Reads one form response into { canonical header: value }.
function readFormRecord_(row, srcMap, srcHeaders) {
  var rec = {};
  IMPORT_FIELDS.forEach(function (f) {
    if (f === 'Photo URL') return;
    if (srcMap[f]) rec[f] = row[srcMap[f] - 1];
  });
  for (var i = 0; i < srcHeaders.length; i++) {
    if (/^please attach a clear/i.test(String(srcHeaders[i]).trim())) { rec['Photo URL'] = row[i]; break; }
  }
  return rec;
}

function nextQrNumber_(existingIds) {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty('nextQrNumber'), 10) || 1;
  existingIds.forEach(function (id) {
    var m = new RegExp('^' + QR_PREFIX + '(\\d+)$').exec(String(id).trim());
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  return n;
}

function padQr_(n) { var s = String(n); while (s.length < 4) s = '0' + s; return QR_PREFIX + s; }

function syncFromForm() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    var src = sourceSheet_();
    var srcLastRow = src.getLastRow(), srcLastCol = src.getLastColumn();
    if (srcLastRow < 2) return { ok: true, added: 0, updated: 0, note: 'No responses yet' };
    var srcHeaders = src.getRange(1, 1, 1, srcLastCol).getValues()[0];
    var srcMap = headerMap_(src);
    var srcRows = src.getRange(2, 1, srcLastRow - 1, srcLastCol).getValues();

    // Make sure Registrants has every column we need (QR ID first if the tab is brand new).
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_REGISTRANTS) || ss.insertSheet(SHEET_REGISTRANTS);
    var lastCol = sh.getLastColumn();
    var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    var want = ['QR ID', IMPORT_KEY_HEADER].concat(IMPORT_FIELDS).concat(EXTRA_COLUMNS);
    var missing = want.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
      if (!headers.length) sh.setFrozenRows(1);
      headers = headers.concat(missing);
      try { CacheService.getScriptCache().remove('colsOk' + EXTRA_COLUMNS.length); } catch (e) { /* fine */ }
    }
    var map = {};
    headers.forEach(function (h, i) { if (h && !map[h]) map[h] = i + 1; });
    var width = headers.length;

    var lastRow = sh.getLastRow();
    var data = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];
    var byKey = {};
    data.forEach(function (row, i) {
      var k = String(row[map[IMPORT_KEY_HEADER] - 1] || '').trim();
      if (!k) {
        // Rows made before importing (or walk-ins): match by email so they aren't duplicated.
        var em = String(map['Email'] ? row[map['Email'] - 1] : '').trim().toLowerCase();
        if (em) k = 'email:' + em;
      }
      if (k && byKey[k] === undefined) byKey[k] = i;
    });

    var nextNum = nextQrNumber_(data.map(function (row) { return row[map['QR ID'] - 1]; }));
    var added = 0, updated = 0, changedCols = {};
    var newRows = [];

    srcRows.forEach(function (srow) {
      var rec = readFormRecord_(srow, srcMap, srcHeaders);
      if (!String(rec['First Name'] || '').trim() && !String(rec['Last Name'] || '').trim() && !String(rec['Email'] || '').trim()) return;   // blank row
      var key = importKeyFor_(rec);   // same person submitted twice: the later response wins
      var idx = byKey[key];
      if (idx !== undefined && idx < data.length) {
        var row = data[idx];
        var rowChanged = false;
        if (!String(row[map[IMPORT_KEY_HEADER] - 1] || '').trim()) { row[map[IMPORT_KEY_HEADER] - 1] = key; changedCols[IMPORT_KEY_HEADER] = true; rowChanged = true; }
        IMPORT_FIELDS.forEach(function (f) {
          if (!(f in rec)) return;
          var c = map[f] - 1;
          var before = row[c], after = rec[f] == null ? '' : rec[f];
          var same = before instanceof Date && after instanceof Date ? before.getTime() === after.getTime() : String(before) === String(after);
          if (!same) { row[c] = after; changedCols[f] = true; rowChanged = true; }
        });
        if (rowChanged) updated++;
        return;
      }
      if (idx !== undefined) {
        // Added earlier in this same run (a duplicate response): update that pending new row.
        var pending = newRows[idx - data.length];
        IMPORT_FIELDS.forEach(function (f) { if (f in rec) pending[map[f] - 1] = rec[f] == null ? '' : rec[f]; });
        return;
      }
      var fresh = [];
      for (var c2 = 0; c2 < width; c2++) fresh.push('');
      fresh[map['QR ID'] - 1] = padQr_(nextNum++);
      fresh[map[IMPORT_KEY_HEADER] - 1] = key;
      IMPORT_FIELDS.forEach(function (f) { if (f in rec) fresh[map[f] - 1] = rec[f] == null ? '' : rec[f]; });
      ['Checked In', 'Lost', 'QR Printed'].forEach(function (h) { if (map[h]) fresh[map[h] - 1] = 'No'; });
      byKey[key] = data.length + newRows.length;
      newRows.push(fresh);
      added++;
    });

    // Write back only the form columns that changed (whole column in one go), never the app's columns.
    if (data.length) Object.keys(changedCols).forEach(function (f) {
      var c = map[f];
      sh.getRange(2, c, data.length, 1).setValues(data.map(function (row) { return [row[c - 1]]; }));
    });
    if (newRows.length) {
      var start = (lastRow >= 2 ? lastRow : 1) + 1;
      sh.getRange(start, 1, newRows.length, width).setValues(newRows);
      // QR IDs as plain text, so "YSA-0007" never turns into something else.
      sh.getRange(start, map['QR ID'], newRows.length, 1).setNumberFormat('@');
    }
    PropertiesService.getScriptProperties().setProperty('nextQrNumber', String(nextNum));
    if (added || updated) bumpRev_(null, null);   // Live.gs: phones pick up the new people within seconds

    var result = { ok: true, added: added, updated: updated, total: data.length + newRows.length, at: nowStamp_() };
    PropertiesService.getScriptProperties().setProperty('lastImport', JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

// Run once from the editor: re-imports every 5 minutes from now on.
function installSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'syncFromForm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncFromForm').timeBased().everyMinutes(5).create();
  return 'syncFromForm will run every 5 minutes';
}

// Run once from the editor to stop the automatic import.
function removeSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'syncFromForm') ScriptApp.deleteTrigger(t);
  });
  return 'Automatic import stopped';
}
