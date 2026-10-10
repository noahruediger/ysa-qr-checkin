/**
 * Problem reports for the YSA QR Check-In app.
 *
 * Staff tap Settings > Submit problem in the app. Each report becomes a row on a "Problems"
 * tab in this Sheet (created automatically). Settings > View problems lists them, and staff can
 * mark them Resolved (or Reopen them) from the app or by editing the Status column here.
 *
 * Setup: add this file next to Code.gs in the Sheet's Apps Script project (+ next to Files > Script).
 * Code.gs already routes the actions to it. Then Deploy > Manage deployments > Edit > New version.
 */

var SHEET_PROBLEMS = 'Problems';
var PROBLEM_HEADERS = ['Problem ID', 'Reported At', 'Reported By', 'Problem', 'Status', 'Resolved At', 'Resolved By'];

function problemsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_PROBLEMS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PROBLEMS);
    sh.getRange(1, 1, 1, PROBLEM_HEADERS.length).setValues([PROBLEM_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 420);
    return sh;
  }
  // Add any header that's missing (e.g. if someone deleted a column).
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = PROBLEM_HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) sh.getRange(1, headers.filter(String).length + 1, 1, missing.length).setValues([missing]);
  return sh;
}

function listProblems_() {
  var sh = problemsSheet_();
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, problems: [] };
  var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getDisplayValues();
  var problems = values.map(function (row) {
    function g(h) { return map[h] ? row[map[h] - 1] : ''; }
    return {
      id: g('Problem ID'), at: g('Reported At'), by: g('Reported By'), text: g('Problem'),
      status: g('Status') || 'Open', resolvedAt: g('Resolved At'), resolvedBy: g('Resolved By')
    };
  }).filter(function (p) { return p.id || p.text; });
  problems.reverse(); // newest first
  return { ok: true, problems: problems };
}

function reportProblem_(body) {
  var text = String(body.text || '').trim();
  if (!text) return { ok: false, error: 'Problem text is required' };
  var sh = problemsSheet_();
  var map = headerMap_(sh);
  var row = [];
  for (var i = 0; i < sh.getLastColumn(); i++) row.push('');
  function set(h, v) { if (map[h]) row[map[h] - 1] = v; }
  var id = String(body.id || ('P-' + new Date().getTime().toString(36).toUpperCase()));
  set('Problem ID', id);
  set('Reported At', nowStamp_());
  set('Reported By', String(body.by || '').trim());
  set('Problem', text.slice(0, 2000));
  set('Status', 'Open');
  sh.appendRow(row);
  return { ok: true, id: id };
}

function setProblemStatus_(body) {
  var sh = problemsSheet_();
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Unknown problem: ' + body.id };
  var ids = sh.getRange(2, map['Problem ID'], lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(body.id).trim()) {
      var r = i + 2;
      var resolved = String(body.status).toLowerCase() === 'resolved';
      sh.getRange(r, map['Status']).setValue(resolved ? 'Resolved' : 'Open');
      sh.getRange(r, map['Resolved At']).setValue(resolved ? nowStamp_() : '');
      sh.getRange(r, map['Resolved By']).setValue(resolved ? String(body.by || '').trim() : '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Unknown problem: ' + body.id };
}
