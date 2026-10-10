/**
 * Staff access list for the YSA QR Check-In app.
 *
 * The first time a phone connects to this Sheet, the app asks for the person's name and role
 * (Admin, Security or Other). Each phone is then listed on a "Staff" tab (created automatically):
 * name, role, which phone/browser, when it
 * first connected and when it was last used. Settings > People with access shows this list.
 *
 * Note: this is a record of who has set the app up, not a lock. Anyone with the /exec URL can
 * still use it, so keep that link private.
 *
 * Setup: add this file next to Code.gs in the Sheet's Apps Script project (+ next to Files > Script).
 * Code.gs already routes the actions to it. Then Deploy > Manage deployments > Edit > New version.
 */

var SHEET_STAFF = 'Staff';
var STAFF_HEADERS = ['Name', 'Role', 'Device', 'First Connected', 'Last Seen', 'Device ID'];

function staffSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) {
    sh = ss.insertSheet(SHEET_STAFF);
    sh.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = STAFF_HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) sh.getRange(1, headers.filter(String).length + 1, 1, missing.length).setValues([missing]);
  return sh;
}

function listStaff_() {
  var sh = staffSheet_();
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, staff: [] };
  var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getDisplayValues();
  var staff = values.map(function (row) {
    function g(h) { return map[h] ? row[map[h] - 1] : ''; }
    return { name: g('Name'), role: g('Role'), device: g('Device'), firstConnected: g('First Connected'), lastSeen: g('Last Seen'), deviceId: g('Device ID') };
  }).filter(function (s) { return s.name || s.deviceId; });
  return { ok: true, staff: staff };
}

// Adds this phone to the Staff tab, or updates its name / last seen if it's already there.
function registerStaff_(body) {
  var deviceId = String(body.deviceId || '').trim();
  var name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!deviceId) return { ok: false, error: 'Missing device ID' };
  if (!name) return { ok: false, error: 'Name is required' };
  var sh = staffSheet_();
  var map = headerMap_(sh);
  var stamp = nowStamp_();
  var device = String(body.device || '').slice(0, 60);
  var role = ['Admin', 'Security', 'Other'].indexOf(String(body.role)) !== -1 ? String(body.role) : '';
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var ids = sh.getRange(2, map['Device ID'], lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === deviceId) {
        var r = i + 2;
        sh.getRange(r, map['Name']).setValue(name);
        if (role) sh.getRange(r, map['Role']).setValue(role);
        if (device) sh.getRange(r, map['Device']).setValue(device);
        sh.getRange(r, map['Last Seen']).setValue(stamp);
        return listStaff_();
      }
    }
  }
  var row = [];
  for (var c = 0; c < sh.getLastColumn(); c++) row.push('');
  function set(h, v) { if (map[h]) row[map[h] - 1] = v; }
  set('Name', name);
  set('Role', role);
  set('Device', device);
  set('First Connected', stamp);
  set('Last Seen', stamp);
  set('Device ID', deviceId);
  sh.appendRow(row);
  return listStaff_();
}
