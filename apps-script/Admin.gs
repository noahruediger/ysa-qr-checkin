/**
 * One-off admin tools for the YSA QR Check-In Sheet. Run these from the Apps Script editor
 * (pick the function in the toolbar, then Run). Neither is needed by the app itself.
 *
 *   fixStampColumns  Turns old timestamps stored as raw numbers (e.g. 46279.45903) in any
 *                    "... At" column into readable text like "14 Sep, 11:01 AM".
 *   buildDashboard   Rewrites the Dashboard tab with live counts that find their columns by
 *                    header name, so it keeps working whatever order the columns are in.
 */

function fixStampColumns() {
  var sh = getSheet_(SHEET_REGISTRANTS);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 'Nothing to fix';
  var map = headerMap_(sh);
  var fixed = 0;
  Object.keys(map).forEach(function (h) {
    if (!/ At$/.test(h)) return;
    var c = map[h];
    var range = sh.getRange(2, c, lastRow - 1, 1);
    var vals = range.getValues();
    var changed = false;
    var out = vals.map(function (row) {
      var v = row[0];
      if (isDate_(v) || (typeof v === 'number' && isFinite(v) && v > 30000)) {
        changed = true; fixed++;
        return [String(asAppTime_(v))];
      }
      return [v];
    });
    if (changed) { range.setNumberFormat('@'); range.setValues(out); }
  });
  return 'Fixed ' + fixed + ' timestamps';
}

// Column of Registrants by header, for formulas: INDEX(Registrants!A2:ZZ, 0, MATCH("Lost", Registrants!1:1, 0))
function dashCol_(header) {
  return 'INDEX(Registrants!$A$2:$ZZ, 0, MATCH("' + header + '", Registrants!$1:$1, 0))';
}

function buildDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  sh.clear();
  var id = dashCol_('QR ID');
  var yes = function (h) { return '=IFERROR(COUNTIF(' + dashCol_(h) + ', "Yes"), 0)'; };
  var rows = [
    ['YSA Convention: live counts', ''],
    ['', ''],
    ['Registered', '=IFERROR(COUNTA(' + id + '), 0)'],
    ['Checked in', yes('Checked In')],
    ['Still to arrive', '=B3-B4'],
    ['Lost right now', yes('Lost')],
    ['Lanyard printed', yes('QR Printed')],
    ['Pack given', yes('Pack Given')],
    ['Shirt given', yes('Shirt Given')],
    ['Need airport pickup', '=IFERROR(COUNTIF(' + dashCol_('Airport Pickup Needed') + ', "Y*"), 0)'],
    ['Picked up', yes('Picked Up')],
    ['With a dietary requirement', '=IFERROR(COUNTIF(' + dashCol_('Dietary Restrictions') + ', "Y*"), 0)'],
    ['With an allergy', '=IFERROR(COUNTIF(' + dashCol_('Allergies') + ', "Y*"), 0)'],
    ['Walk-ins', yes('Walk-in')],
    ['', ''],
    ['Counts update by themselves. Built by buildDashboard() in the Apps Script; run it again if columns are renamed.', '']
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows.map(function (r) { return [r[0], '']; }));
  rows.forEach(function (r, i) { if (r[1]) sh.getRange(i + 1, 2).setFormula(r[1]); });
  sh.getRange(1, 1).setFontWeight('bold');

  // Checked in per team (D:F), sorted by team name.
  var team = dashCol_('Team');
  sh.getRange(3, 4, 1, 3).setValues([['Team', 'People', 'Checked in']]).setFontWeight('bold');
  sh.getRange(4, 4).setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + team + ', ' + team + ' <> ""))), "No teams yet")');
  sh.getRange(4, 5).setFormula('=ARRAYFORMULA(IF(D4:D = "", , IFERROR(COUNTIF(' + team + ', D4:D), 0)))');
  sh.getRange(4, 6).setFormula('=ARRAYFORMULA(IF(D4:D = "", , IFERROR(COUNTIFS(' + team + ', D4:D, ' + dashCol_('Checked In') + ', "Yes"), 0)))');
  try { sh.setColumnWidth(1, 220); sh.setColumnWidth(4, 160); } catch (e) { /* fine */ }
  return 'Dashboard rebuilt';
}
