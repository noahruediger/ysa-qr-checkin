/**
 * QR Check-In & Activity Booking — TEST webhook backend.
 * Bound to the "Brisbane YSA Convention — QR Check-In TEST" Google Sheet.
 *
 * Deploy: Extensions > Apps Script (paste this whole file as Code.gs) >
 * Deploy > New deployment > type "Web app" > Execute as "Me" >
 * Who has access "Anyone" > Deploy > copy the /exec URL.
 *
 * Reads/writes are done by column HEADER NAME (not fixed column letters) so
 * this keeps working if columns get reordered later when it's pointed at
 * the real convention sheet.
 */

var SHEET_REGISTRANTS = 'Registrants';
var SHEET_ACTIVITIES = 'Activities';

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

function headerMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { map[String(h).trim()] = i + 1; }); // 1-based column index
  return map;
}

function readRegistrants_() {
  ensureColumns_();
  var sh = getSheet_(SHEET_REGISTRANTS);
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { sheet: sh, map: map, rows: [] };
  var lastCol = sh.getLastColumn();
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return { sheet: sh, map: map, rows: values, firstDataRow: 2 };
}

function col_(map, name) {
  var idx = map[name];
  if (!idx) throw new Error('Missing expected column: ' + name);
  return idx;
}

function rowToRegistrant_(row, map) {
  function g(name) { return row[col_(map, name) - 1]; }
  var yes = function (v) { return String(v).trim().toLowerCase() === 'yes'; };
  var bookingsStr = g('Activity Bookings');
  var bookings = bookingsStr ? String(bookingsStr).split(',').map(function (s) { return s.trim(); }).filter(String) : [];
  var dietaryYes = yes(g('Dietary Restrictions'));
  return {
    id: String(g('QR ID')).trim(),
    name: (g('Preferred Name') || g('First Name')) + ' ' + g('Last Name'),
    firstName: g('First Name'),
    lastName: g('Last Name'),
    ward: g('Ward'),
    stake: g('Stake'),
    dietary: dietaryYes ? (g('Dietary Detail') || 'Dietary requirement') : null,
    checkedIn: yes(g('Checked In')),
    checkedInAt: g('Checked In At') || null,
    qrPrinted: yes(g('QR Printed')),
    qrPrintedAt: g('QR Printed At') || null,
    lost: yes(g('Lost')),
    lostAt: g('Lost At') || null,
    needsPickup: yes(g('Airport Pickup Needed')),
    pickupTime: g('Pickup Time') || null,
    team: g('Team') || null,
    bookings: bookings,
    photo: photoFor_(row, map),
    pickedUp: map['Picked Up'] ? yes(row[map['Picked Up'] - 1]) : false,
    pickedUpAt: map['Picked Up At'] ? (row[map['Picked Up At'] - 1] || null) : null
  };
}

function readActivities_() {
  var sh = getSheet_(SHEET_ACTIVITIES);
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  return values.map(function (row) {
    function g(name) { return row[col_(map, name) - 1]; }
    return {
      id: String(g('Activity ID')).trim(),
      name: g('Activity Name'),
      time: g('Day/Time'),
      location: g('Location'),
      capacity: Number(g('Capacity')) || 0,
      otherBookings: Number(g('Baseline Bookings (non-test)')) || 0
    };
  });
}

function findRowByQrId_(reg, id) {
  var qrCol = col_(reg.map, 'QR ID') - 1;
  for (var i = 0; i < reg.rows.length; i++) {
    if (String(reg.rows[i][qrCol]).trim() === String(id).trim()) {
      return reg.firstDataRow + i; // absolute sheet row number
    }
  }
  return -1;
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Australia/Brisbane', 'd MMM, h:mm a');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = (e.parameter.action || 'list');
    if (action === 'list') {
      var reg = readRegistrants_();
      var registrants = reg.rows.map(function (row) { return rowToRegistrant_(row, reg.map); });
      var activities = readActivities_();
      return jsonOut_({ ok: true, registrants: registrants, activities: activities });
    }
    if (action === 'person') {
      return jsonOut_(personDetails_(e.parameter.id));
    }
    if (action === 'photo') {
      return jsonOut_(photoDataUri_(e.parameter.id));
    }
    return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch (parseErr) {
      return jsonOut_({ ok: false, error: 'Bad JSON body: ' + parseErr });
    }
    var action = body.action;
    var reg = readRegistrants_();
    var sh = reg.sheet, map = reg.map;

    if (action === 'checkin') {
      var row = findRowByQrId_(reg, body.id);
      if (row === -1) return jsonOut_({ ok: false, error: 'Unknown ID: ' + body.id });
      var alreadyIn = String(sh.getRange(row, col_(map, 'Checked In')).getValue()).trim().toLowerCase() === 'yes';
      if (!alreadyIn) {
        sh.getRange(row, col_(map, 'Checked In')).setValue('Yes');
        sh.getRange(row, col_(map, 'Checked In At')).setValue(nowStamp_());
      }
      return jsonOut_({ ok: true, registrant: rowToRegistrant_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], map) });
    }

    if (action === 'toggleLost') {
      var row2 = findRowByQrId_(reg, body.id);
      if (row2 === -1) return jsonOut_({ ok: false, error: 'Unknown ID: ' + body.id });
      var isLost = String(sh.getRange(row2, col_(map, 'Lost')).getValue()).trim().toLowerCase() === 'yes';
      var newLost = !isLost;
      sh.getRange(row2, col_(map, 'Lost')).setValue(newLost ? 'Yes' : 'No');
      sh.getRange(row2, col_(map, 'Lost At')).setValue(newLost ? nowStamp_() : '');
      return jsonOut_({ ok: true, registrant: rowToRegistrant_(sh.getRange(row2, 1, 1, sh.getLastColumn()).getValues()[0], map) });
    }

    if (action === 'markPrinted') {
      var ids = body.ids || (body.id ? [body.id] : []);
      var stamp = nowStamp_();
      ids.forEach(function (id) {
        var r = findRowByQrId_(reg, id);
        if (r !== -1) {
          sh.getRange(r, col_(map, 'QR Printed')).setValue('Yes');
          sh.getRange(r, col_(map, 'QR Printed At')).setValue(stamp);
        }
      });
      return jsonOut_({ ok: true, printed: ids });
    }

    if (action === 'book') {
      var activities = readActivities_();
      var activity = activities.filter(function (a) { return a.id === body.activityId; })[0];
      if (!activity) return jsonOut_({ ok: false, error: 'Unknown activity: ' + body.activityId });

      // recompute capacity fresh, inside the lock, to avoid overbooking on simultaneous scans
      var allRegistrants = reg.rows.map(function (row) { return rowToRegistrant_(row, map); });
      var taken = activity.otherBookings;
      allRegistrants.forEach(function (r) { if (r.bookings.indexOf(activity.id) !== -1) taken++; });
      if (taken >= activity.capacity) return jsonOut_({ ok: false, error: 'full' });

      var row3 = findRowByQrId_(reg, body.id);
      if (row3 === -1) return jsonOut_({ ok: false, error: 'Unknown ID: ' + body.id });
      var bCell = sh.getRange(row3, col_(map, 'Activity Bookings'));
      var current = String(bCell.getValue() || '').split(',').map(function (s) { return s.trim(); }).filter(String);
      if (current.indexOf(body.activityId) === -1) {
        current.push(body.activityId);
        bCell.setValue(current.join(', '));
      }
      return jsonOut_({ ok: true, registrant: rowToRegistrant_(sh.getRange(row3, 1, 1, sh.getLastColumn()).getValues()[0], map) });
    }

    if (action === 'markPickedUp') {
      var rowP = findRowByQrId_(reg, body.id);
      if (rowP === -1) return jsonOut_({ ok: false, error: 'Unknown ID: ' + body.id });
      var pickedOn = body.value === true || String(body.value).toLowerCase() === 'true';
      sh.getRange(rowP, col_(map, 'Picked Up')).setValue(pickedOn ? 'Yes' : 'No');
      sh.getRange(rowP, col_(map, 'Picked Up At')).setValue(pickedOn ? nowStamp_() : '');
      return jsonOut_({ ok: true, registrant: rowToRegistrant_(sh.getRange(rowP, 1, 1, sh.getLastColumn()).getValues()[0], map) });
    }

    return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ===================== Photo / pickup / full-details additions =====================
// Added columns are created automatically on the Registrants tab the first time the script runs.
var EXTRA_COLUMNS = ['Photo URL', 'Picked Up', 'Picked Up At'];
// Columns that are never sent to phones (government-style ID images etc.). Edit to suit.
var HIDE_COLUMNS = [/id photo/i, /passport/i, /licen[cs]e/i, /^please attach a clear/i];

function ensureColumns_() {
  var sh = getSheet_(SHEET_REGISTRANTS);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = EXTRA_COLUMNS.filter(function (c) { return headers.indexOf(c) === -1; });
  if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
}

function driveIdFrom_(url) {
  var m = String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : '';
}

// The photo link for a row: the "Photo URL" column if filled in, otherwise the form's own
// "Please attach a clear and suitable photo..." column (Drive links from the registration form).
function photoRaw_(row, map) {
  var cols = [map['Photo URL']];
  Object.keys(map).forEach(function (h) { if (/^please attach a clear/i.test(h)) cols.push(map[h]); });
  for (var i = 0; i < cols.length; i++) {
    if (!cols[i]) continue;
    var raw = String(row[cols[i] - 1] || '').trim();
    if (raw) return raw;
  }
  return '';
}

// URL the app can drop into an <img>. Plain links pass through; Drive links become thumbnails.
function photoFor_(row, map) {
  var raw = photoRaw_(row, map);
  if (!raw) return null;
  var id = driveIdFrom_(raw);
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w200' : raw;
}

// Fallback the app uses if a photo URL fails to load (e.g. a private Drive file): send it as base64.
function photoDataUri_(regId) {
  var reg = readRegistrants_();
  var i = findRowByQrId_(reg, regId);
  if (i === -1) return { ok: false, error: 'Unknown ID: ' + regId };
  var raw = photoRaw_(reg.sheet.getRange(i, 1, 1, reg.sheet.getLastColumn()).getValues()[0], reg.map);
  if (!raw) return { ok: false, error: 'No photo' };
  try {
    var id = driveIdFrom_(raw);
    if (!id) return { ok: false, error: 'Not a Drive photo' };
    var file = DriveApp.getFileById(id);
    var blob = file.getThumbnail() || file.getBlob();
    var bytes = blob.getBytes();
    if (bytes.length > 2000000) return { ok: false, error: 'Photo too large' };
    return { ok: true, dataUri: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// One person's whole Sheet row, as [header, value] pairs in column order (for the Details tab).
function personDetails_(regId) {
  var reg = readRegistrants_();
  var i = findRowByQrId_(reg, regId);
  if (i === -1) return { ok: false, error: 'Unknown ID: ' + regId };
  var sh = reg.sheet;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var vals = sh.getRange(i, 1, 1, lastCol).getDisplayValues()[0];
  var out = [];
  for (var c = 0; c < lastCol; c++) {
    var h = String(headers[c]).trim();
    if (!h) continue;
    if (HIDE_COLUMNS.some(function (re) { return re.test(h); })) continue;
    out.push([h, vals[c]]);
  }
  return { ok: true, details: out };
}

// Run this once from the editor to fill the Photo URL column with stock portraits (test data only).
function seedStockPhotos() {
  ensureColumns_();
  var reg = readRegistrants_();
  var c = reg.map['Photo URL'];
  var g = reg.map['Gender'];
  if (!reg.rows.length) return;
  var out = reg.rows.map(function (row, i) {
    if (String(row[c - 1] || '').trim()) return [row[c - 1]];
    var gender = g ? String(row[g - 1]).toLowerCase() : '';
    var folder = gender.indexOf('f') === 0 ? 'women' : (gender.indexOf('m') === 0 ? 'men' : (i % 2 ? 'women' : 'men'));
    return ['https://randomuser.me/api/portraits/' + folder + '/' + (i % 90) + '.jpg'];
  });
  reg.sheet.getRange(2, c, out.length, 1).setValues(out);
}

// Run once from the editor to grant Drive access (needed for private Drive photos).
function testDriveAccess() {
  return DriveApp.getRootFolder().getName();
}
