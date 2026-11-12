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

// The app's own column names, plus the registration form's question wording for each, so the
// script also understands a sheet that still has the form's headers ("Ward/ Branch:", "Will you
// need transportation from the airport?" ...). An exact header always wins over an alias.
var HEADER_ALIASES = {
  'Registration Timestamp': [/^timestamp$/i],
  'First Name': [/^first name/i],
  'Last Name': [/^last name/i],
  'Preferred Name': [/^preferred name/i],
  'Email': [/^e-?mail/i],
  'Phone': [/^phone/i, /^mobile/i],
  'LDS Member': [/member of the church/i],
  'Ward': [/^ward/i],
  'Stake': [/^stake/i],
  'Emergency Contact Name': [/^emergency contact name/i],
  'Emergency Contact Relationship': [/relationship to emergency contact/i],
  'Emergency Contact Mobile': [/^emergency contact (mobile|phone|number)/i],
  'On-site / Off-site': [/on-?site attendee or off-?site/i],
  'Requested Roommates': [/roomed near/i],
  'Arrival Day/Time': [/what day and time do you plan on arriving/i],
  'Airport Pickup Needed': [/transportation from the airport/i],
  'Pickup Time': [/preferred pick-?up time/i],
  'Return Airport Transport Needed': [/return airport transport/i],
  'T-Shirt': [/convention t-?shirt/i],
  'Dietary Restrictions': [/do you have any dietary/i],
  'Dietary Detail': [/list your dietary/i],
  'Allergies': [/do you have any allergies/i],
  'Allergy Detail': [/list your allergies/i],
  'Medical / Disability Notes': [/medications you are currently taking/i, /^medical/i],
  'Other Needs for Convenors': [/other needs or considerations/i],
  'Interested in Temple Ordinances': [/participate in temple ordinances/i],
  'Brisbane Temple Worker': [/brisbane temple worker/i],
  'Gender': [/^gender/i],
  'DOB': [/^date of birth/i]
};

function headerMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { var k = String(h).trim(); if (k && !map[k]) map[k] = i + 1; }); // 1-based column index
  Object.keys(HEADER_ALIASES).forEach(function (canon) {
    if (map[canon]) return;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (HEADER_ALIASES[canon].some(function (re) { return re.test(h); })) { map[canon] = i + 1; return; }
    }
  });
  return map;
}

// A form answer that means yes: "Yes", "yes please", "Y". Anything else (blank, No, N/A) is no.
function isYes_(v) { return /^\s*y(es)?\b/i.test(String(v == null ? '' : v)); }
// A free-text answer that isn't just "no": "No", "none", "n/a", "-" and blanks count as nothing.
function realText_(v) {
  var t = String(v == null ? '' : v).trim();
  return /^(no|none|nil|n\/?a|na|-+|\.)$/i.test(t) ? '' : t;
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
  // Reading is forgiving: a column the sheet doesn't have just reads as blank. (Writes still
  // need their column, and QR ID is always required.)
  function g(name) { return map[name] ? row[map[name] - 1] : ''; }
  function opt(name) { return map[name] ? (String(row[map[name] - 1] || '').trim() || null) : null; }
  var yes = function (v) { return String(v).trim().toLowerCase() === 'yes'; };
  var bookingsStr = g('Activity Bookings');
  var bookings = bookingsStr ? String(bookingsStr).split(',').map(function (s) { return s.trim(); }).filter(String) : [];
  var dietDetail = realText_(g('Dietary Detail'));
  var dietAnswer = realText_(g('Dietary Restrictions'));
  var dietary = dietDetail || (isYes_(dietAnswer) ? 'Dietary requirement' : (dietAnswer && !/^y/i.test(dietAnswer) ? dietAnswer : '')) || null;
  var allergyDetail = realText_(g('Allergy Detail'));
  var allergyAnswer = realText_(g('Allergies'));
  var allergy = allergyDetail || (isYes_(allergyAnswer) ? 'Yes (see Details)' : (allergyAnswer && !/^y/i.test(allergyAnswer) ? allergyAnswer : '')) || null;
  return {
    id: String(row[col_(map, 'QR ID') - 1]).trim(),
    name: String((g('Preferred Name') || g('First Name')) + ' ' + g('Last Name')).trim(),
    firstName: g('First Name'),
    lastName: g('Last Name'),
    ward: g('Ward'),
    stake: g('Stake'),
    dietary: dietary,
    allergy: allergy,
    medical: !!realText_(g('Medical / Disability Notes')),
    checkedIn: yes(g('Checked In')),
    checkedInAt: asAppTime_(g('Checked In At')),
    qrPrinted: yes(g('QR Printed')),
    qrPrintedAt: asAppTime_(g('QR Printed At')),
    lost: yes(g('Lost')),
    lostAt: asAppTime_(g('Lost At')),
    needsPickup: isYes_(g('Airport Pickup Needed')),
    pickupTime: asAppTime_(g('Pickup Time')),
    team: g('Team') || null,
    bookings: bookings,
    photo: photoFor_(row, map),
    pickedUp: map['Picked Up'] ? yes(row[map['Picked Up'] - 1]) : false,
    pickedUpAt: map['Picked Up At'] ? asAppTime_(row[map['Picked Up At'] - 1]) : null,
    packGiven: map['Pack Given'] ? yes(row[map['Pack Given'] - 1]) : false,
    packGivenAt: map['Pack Given At'] ? asAppTime_(row[map['Pack Given At'] - 1]) : null,
    shirtGiven: map['Shirt Given'] ? yes(row[map['Shirt Given'] - 1]) : false,
    shirtGivenAt: map['Shirt Given At'] ? asAppTime_(row[map['Shirt Given At'] - 1]) : null,
    walkin: map['Walk-in'] ? yes(row[map['Walk-in'] - 1]) : false,
    checkedInBy: opt('Checked In By'),
    lostBy: opt('Lost By'),
    packGivenBy: opt('Pack Given By'),
    shirtGivenBy: opt('Shirt Given By'),
    pickedUpBy: opt('Picked Up By')
  };
}

function readActivities_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACTIVITIES);
  if (!sh) return [];   // activities are optional
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

function scriptTz_() {
  return Session.getScriptTimeZone() || 'Australia/Brisbane';
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), scriptTz_(), 'd MMM, h:mm a');
}

// Store stamps as plain text. A value like "2 Nov, 2:25 PM" is otherwise coerced
// into a date serial, and getValues() then hands the app a Date (JSON UTC).
function writeStamp_(sh, row, col, text) {
  var range = sh.getRange(row, col);
  if (!text) { range.setValue(''); return; }
  range.setNumberFormat('@');
  range.setValue(String(text));
}

// Brisbane-local text for the app. Time-only cells (pickup times) stay "h:mm a"
// so the phone can still sort them. Full stamps use "d MMM, h:mm a".
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

function asAppTime_(v) {
  if (v == null || v === '') return null;
  if (isDate_(v)) return formatSheetDate_(v, scriptTz_());
  if (typeof v === 'number' && isFinite(v)) {
    // Raw Sheets serial is a wall time, not a UTC instant.
    var utc = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    return formatSheetDate_(utc, 'UTC');
  }
  return v;
}

function formatSheetDate_(date, tz) {
  var year = Number(Utilities.formatDate(date, tz, 'yyyy'));
  if (year < 1970) return Utilities.formatDate(date, tz, 'h:mm a');
  return Utilities.formatDate(date, tz, 'd MMM, h:mm a');
}

// Pack + shirt are the check-in list. Set Checked In here once both are Yes so
// two phones can split the ticks and the person still ends up checked in.
var CHECKIN_TASK_HEADERS = ['Pack Given', 'Shirt Given'];

function cellIsYes_(sh, map, row, header) {
  if (!map[header]) return false;
  return String(sh.getRange(row, map[header]).getValue()).trim().toLowerCase() === 'yes';
}

function syncCheckedInFromTasks_(sh, map, row, body) {
  var allYes = true;
  for (var i = 0; i < CHECKIN_TASK_HEADERS.length; i++) {
    if (!cellIsYes_(sh, map, row, CHECKIN_TASK_HEADERS[i])) { allYes = false; break; }
  }
  if (!allYes || cellIsYes_(sh, map, row, 'Checked In')) return;
  sh.getRange(row, col_(map, 'Checked In')).setValue('Yes');
  writeStamp_(sh, row, col_(map, 'Checked In At'), nowStamp_());
  writeBy_(sh, map, row, 'Checked In By', body, true);
}

// "Who did it" columns: the staff name the phone sends as body.by. Blank when cleared.
function writeBy_(sh, map, row, header, body, on) {
  if (!map[header]) return;
  sh.getRange(row, map[header]).setValue(on ? String((body && body.by) || '').slice(0, 60) : '');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Optional access code: set Script Property ACCESS_CODE (Project Settings > Script Properties) and
// every request must carry the same code as "key", or it gets { ok:false, error:'locked' }.
// No ACCESS_CODE = open to anyone with the /exec link (the old behaviour).
function keyOk_(given) {
  var code = PropertiesService.getScriptProperties().getProperty('ACCESS_CODE');
  if (!code) return true;
  return String(given == null ? '' : given).trim() === String(code).trim();
}

// Admin check for risky actions (Reset printing): the phone's Device ID must be on the Staff tab
// with Role = Admin. If nobody is Admin yet, everyone is allowed (so a new Sheet isn't stuck).
function isAdminDevice_(deviceId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  if (!sh || sh.getLastRow() < 2) return true;
  var map = headerMap_(sh);
  if (!map['Role'] || !map['Device ID']) return true;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var anyAdmin = false, me = false;
  vals.forEach(function (row) {
    var admin = String(row[map['Role'] - 1]).trim() === 'Admin';
    if (admin) anyAdmin = true;
    if (admin && String(row[map['Device ID'] - 1]).trim() === String(deviceId || '').trim()) me = true;
  });
  return !anyAdmin || me;
}

function doGet(e) {
  try {
    if (!keyOk_(e.parameter.key)) return jsonOut_({ ok: false, error: 'locked' });
    var action = (e.parameter.action || 'list');
    if (action === 'list') {
      var reg = readRegistrants_();
      // Optional paging (offset / limit) so the app can show a "340 of 1,000 loaded" count on first load.
      // Without them, everyone comes back in one go (used by the quiet background refresh).
      if (e.parameter.limit) {
        var offset = Math.max(0, parseInt(e.parameter.offset, 10) || 0);
        var limit = Math.max(1, Math.min(1000, parseInt(e.parameter.limit, 10) || 100));
        var pageRows = reg.rows.slice(offset, offset + limit);
        var page = { ok: true, total: reg.rows.length, offset: offset, registrants: pageRows.map(function (row) { return rowToRegistrant_(row, reg.map); }) };
        if (offset === 0) { page.activities = readActivities_(); page.walkinPrintedTo = getWalkinPrintedTo_(); page.rev = getRevNumber_(); }
        return jsonOut_(page);
      }
      var rev = getRevNumber_();   // read before the rows, so a change made meanwhile still shows as new
      var registrants = reg.rows.map(function (row) { return rowToRegistrant_(row, reg.map); });
      syncLostFromRegistrants_(registrants);   // Live.gs
      var activities = readActivities_();
      return jsonOut_({ ok: true, rev: rev, registrants: registrants, activities: activities, walkinPrintedTo: getWalkinPrintedTo_() });
    }
    if (action === 'rev') return jsonOut_(revInfo_());   // Live.gs
    if (action === 'search') return jsonOut_(searchPeople_(e.parameter.q));
    if (action === 'person') {
      return jsonOut_(personDetails_(e.parameter.id));
    }
    if (action === 'photo') {
      return jsonOut_(photoDataUri_(e.parameter.id, e.parameter.size === 'full'));
    }
    if (action === 'problems') return jsonOut_(listProblems_());   // Problems.gs
    if (action === 'staff') return jsonOut_(listStaff_());         // Staff.gs
    if (action === 'heartbeat') return jsonOut_(staffHeartbeat_(e.parameter));   // Staff.gs
    return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // tryLock returns false instead of throwing, so a busy Sheet still answers in JSON
  // ("busy") and the phone keeps the change queued and retries it.
  if (!lock.tryLock(20000)) return jsonOut_({ ok: false, error: 'busy' });
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch (parseErr) {
      return jsonOut_({ ok: false, error: 'Bad JSON body: ' + parseErr });
    }
    if (!keyOk_(body.key)) return jsonOut_({ ok: false, error: 'locked' });
    var out = handlePost_(body);
    if (out && out.ok && REV_ACTIONS[body.action]) {
      bumpRev_(body, out);      // Live.gs
      logAction_(body, out);    // Log.gs
    }
    return jsonOut_(out);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function handlePost_(body) {
  var action = body.action;
  // These don't touch the Registrants tab, so skip reading it.
  if (action === 'walkinPrinted') return setWalkinPrintedTo_(body);   // Walkin.gs
  if (action === 'reportProblem') return reportProblem_(body);        // Problems.gs
  if (action === 'setProblemStatus') return setProblemStatus_(body);  // Problems.gs
  if (action === 'registerStaff') return registerStaff_(body);        // Staff.gs

  var reg = readRegistrants_();
  var sh = reg.sheet, map = reg.map;

  if (action === 'checkin') {
    var row = findRowByQrId_(reg, body.id);
    if (row === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    var alreadyIn = String(sh.getRange(row, col_(map, 'Checked In')).getValue()).trim().toLowerCase() === 'yes';
    if (!alreadyIn) {
      sh.getRange(row, col_(map, 'Checked In')).setValue('Yes');
      writeStamp_(sh, row, col_(map, 'Checked In At'), nowStamp_());
      writeBy_(sh, map, row, 'Checked In By', body, true);
    }
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  // setLost carries an explicit true/false (same idea as markPickedUp) so a retry
  // can't flip the flag. toggleLost without a value is kept for older phones.
  if (action === 'setLost' || action === 'toggleLost') {
    var row2 = findRowByQrId_(reg, body.id);
    if (row2 === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    var explicit = action === 'setLost' || body.value === true || body.value === false
      || String(body.value).toLowerCase() === 'true' || String(body.value).toLowerCase() === 'false';
    var newLost = explicit
      ? (body.value === true || String(body.value).toLowerCase() === 'true')
      : String(sh.getRange(row2, col_(map, 'Lost')).getValue()).trim().toLowerCase() !== 'yes';
    sh.getRange(row2, col_(map, 'Lost')).setValue(newLost ? 'Yes' : 'No');
    if (newLost) writeStamp_(sh, row2, col_(map, 'Lost At'), nowStamp_());
    else sh.getRange(row2, col_(map, 'Lost At')).setValue('');
    writeBy_(sh, map, row2, 'Lost By', body, newLost);
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(row2, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  // One read, one write per column: printing 1,000 cards used to be 2,000 single-cell
  // writes while holding the lock, which blocked every other phone.
  if (action === 'markPrinted') {
    var ids = body.ids || (body.id ? [body.id] : []);
    var stamp = nowStamp_();
    var wanted = {};
    ids.forEach(function (id) { wanted[String(id).trim()] = true; });
    var qrIdx = col_(map, 'QR ID') - 1, pCol = col_(map, 'QR Printed'), paCol = col_(map, 'QR Printed At');
    var pVals = [], paVals = [], changed = 0;
    reg.rows.forEach(function (row) {
      if (wanted[String(row[qrIdx]).trim()]) {
        pVals.push(['Yes']); paVals.push([stamp]); changed++;
      } else {
        pVals.push([row[pCol - 1]]); paVals.push([row[paCol - 1]]);
      }
    });
    if (changed) {
      sh.getRange(reg.firstDataRow, pCol, pVals.length, 1).setValues(pVals);
      sh.getRange(reg.firstDataRow, paCol, paVals.length, 1).setNumberFormat('@').setValues(paVals);
    }
    return ({ ok: true, printed: ids });
  }

  if (action === 'book') {
    var activities = readActivities_();
    var activity = activities.filter(function (a) { return a.id === body.activityId; })[0];
    if (!activity) return ({ ok: false, error: 'Unknown activity: ' + body.activityId });

    // recompute capacity fresh, inside the lock, to avoid overbooking on simultaneous scans
    var allRegistrants = reg.rows.map(function (row) { return rowToRegistrant_(row, map); });
    var taken = activity.otherBookings;
    allRegistrants.forEach(function (r) { if (r.bookings.indexOf(activity.id) !== -1) taken++; });
    if (taken >= activity.capacity) return ({ ok: false, error: 'full' });

    var row3 = findRowByQrId_(reg, body.id);
    if (row3 === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    var bCell = sh.getRange(row3, col_(map, 'Activity Bookings'));
    var current = String(bCell.getValue() || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    if (current.indexOf(body.activityId) === -1) {
      current.push(body.activityId);
      bCell.setValue(current.join(', '));
    }
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(row3, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  if (action === 'markPickedUp') {
    var rowP = findRowByQrId_(reg, body.id);
    if (rowP === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    var pickedOn = body.value === true || String(body.value).toLowerCase() === 'true';
    sh.getRange(rowP, col_(map, 'Picked Up')).setValue(pickedOn ? 'Yes' : 'No');
    if (pickedOn) writeStamp_(sh, rowP, col_(map, 'Picked Up At'), nowStamp_());
    else sh.getRange(rowP, col_(map, 'Picked Up At')).setValue('');
    writeBy_(sh, map, rowP, 'Picked Up By', body, pickedOn);
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(rowP, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  if (action === 'uncheckin') {
    var rowU = findRowByQrId_(reg, body.id);
    if (rowU === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    sh.getRange(rowU, col_(map, 'Checked In')).setValue('No');
    sh.getRange(rowU, col_(map, 'Checked In At')).setValue('');
    writeBy_(sh, map, rowU, 'Checked In By', body, false);
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(rowU, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  // Check-in list ticks: task "pack" -> Pack Given / Pack Given At, "shirt" -> Shirt Given / Shirt Given At
  if (action === 'markTask') {
    var TASK_COLUMNS = { pack: ['Pack Given', 'Pack Given At', 'Pack Given By'], shirt: ['Shirt Given', 'Shirt Given At', 'Shirt Given By'] };
    var cols = TASK_COLUMNS[body.task];
    if (!cols) return ({ ok: false, error: 'Unknown task: ' + body.task });
    var rowT = findRowByQrId_(reg, body.id);
    if (rowT === -1) return ({ ok: false, error: 'Unknown ID: ' + body.id });
    var on = body.value === true || String(body.value).toLowerCase() === 'true';
    sh.getRange(rowT, col_(map, cols[0])).setValue(on ? 'Yes' : 'No');
    if (on) writeStamp_(sh, rowT, col_(map, cols[1]), nowStamp_());
    else sh.getRange(rowT, col_(map, cols[1])).setValue('');
    writeBy_(sh, map, rowT, cols[2], body, on);
    syncCheckedInFromTasks_(sh, map, rowT, body);
    return ({ ok: true, registrant: rowToRegistrant_(sh.getRange(rowT, 1, 1, sh.getLastColumn()).getValues()[0], map) });
  }

  // Print tab "Reset printing": everyone back to not printed, except walk-ins (their blank card is their lanyard).
  if (action === 'resetPrinted') {
    if (!isAdminDevice_(body.deviceId)) return { ok: false, error: 'admin only' };
    var qpCol = col_(map, 'QR Printed'), qaCol = col_(map, 'QR Printed At'), wkCol = map['Walk-in'];
    if (!reg.rows.length) return ({ ok: true, reset: 0 });
    var resetCount = 0;
    var printedVals = [], printedAtVals = [];
    reg.rows.forEach(function (row) {
      var isWalkin = wkCol && String(row[wkCol - 1]).trim().toLowerCase() === 'yes';
      if (isWalkin) { printedVals.push([row[qpCol - 1]]); printedAtVals.push([row[qaCol - 1]]); return; }
      if (String(row[qpCol - 1]).trim().toLowerCase() === 'yes') resetCount++;
      printedVals.push(['No']); printedAtVals.push(['']);
    });
    sh.getRange(reg.firstDataRow, qpCol, printedVals.length, 1).setValues(printedVals);
    sh.getRange(reg.firstDataRow, qaCol, printedAtVals.length, 1).setValues(printedAtVals);
    return ({ ok: true, reset: resetCount });
  }

  if (action === 'registerWalkin') return registerWalkin_(body, reg);       // Walkin.gs

  return { ok: false, error: 'Unknown action: ' + action };
}

// ===================== Photo / pickup / full-details additions =====================
// Added columns are created automatically on the Registrants tab the first time the script runs.
// Columns the app writes to. Any that are missing get added to the right of the Registrants tab.
var EXTRA_COLUMNS = ['Team', 'QR Printed', 'QR Printed At', 'Checked In', 'Checked In At', 'Lost', 'Lost At', 'Activity Bookings',
  'Photo URL', 'Picked Up', 'Picked Up At', 'Pack Given', 'Pack Given At', 'Shirt Given', 'Shirt Given At',
  'Checked In By', 'Lost By', 'Pack Given By', 'Shirt Given By', 'Picked Up By'];
// Columns that are never sent to phones (government-style ID images etc.). Edit to suit.
var HIDE_COLUMNS = [/id photo/i, /passport/i, /licen[cs]e/i, /^please attach a clear/i];

// Checked at most every 10 minutes (CacheService), so a normal "list" request never writes.
function ensureColumns_() {
  var cache = CacheService.getScriptCache();
  var key = 'colsOk' + EXTRA_COLUMNS.length;
  if (cache.get(key)) return;
  var sh = getSheet_(SHEET_REGISTRANTS);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = EXTRA_COLUMNS.filter(function (c) { return headers.indexOf(c) === -1; });
  if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  cache.put(key, '1', 600);
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
// full = true is for the full-screen photo viewer: sends the original image (up to ~6 MB)
// instead of Drive's small thumbnail, so staff can actually recognise the person.
function photoDataUri_(regId, full) {
  var reg = readRegistrants_();
  var i = findRowByQrId_(reg, regId);
  if (i === -1) return { ok: false, error: 'Unknown ID: ' + regId };
  var raw = photoRaw_(reg.sheet.getRange(i, 1, 1, reg.sheet.getLastColumn()).getValues()[0], reg.map);
  if (!raw) return { ok: false, error: 'No photo' };
  try {
    var id = driveIdFrom_(raw);
    if (!id) return { ok: false, error: 'Not a Drive photo' };
    var file = DriveApp.getFileById(id);
    var blob = null;
    if (full && /^image\//i.test(file.getMimeType()) && file.getSize() <= 6000000) blob = file.getBlob();
    if (!blob) blob = file.getThumbnail() || file.getBlob();
    var bytes = blob.getBytes();
    if (bytes.length > 6000000) return { ok: false, error: 'Photo too large' };
    return { ok: true, dataUri: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Desk search for someone without their lanyard: phone number (any format, +61 or 0, spaces),
// email (any part), or name. Done here so phone numbers and emails aren't sent to every phone.
function digitsOnly_(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.indexOf('61') === 0 && d.length >= 11) d = '0' + d.slice(2);   // +61 4xx -> 04xx
  if (d.length === 9 && d.charAt(0) === '4') d = '0' + d;               // 4xx xxx xxx -> 04xx
  return d;
}
function searchPeople_(q) {
  q = String(q == null ? '' : q).trim();
  if (q.length < 3) return { ok: true, results: [] };
  var reg = readRegistrants_();
  var map = reg.map;
  var qDigits = digitsOnly_(q);
  var qLower = q.toLowerCase();
  var byPhone = qDigits.length >= 6 && qDigits.length >= q.replace(/[\s+()-]/g, '').length - 1;
  var out = [];
  for (var i = 0; i < reg.rows.length && out.length < 20; i++) {
    var row = reg.rows[i];
    var hit = '';
    if (byPhone) {
      ['Phone', 'Emergency Contact Mobile'].forEach(function (h) {
        if (hit || !map[h]) return;
        var d = digitsOnly_(row[map[h] - 1]);
        if (d && d.indexOf(qDigits) !== -1) hit = h === 'Phone' ? 'phone' : 'emergency contact phone';
      });
    } else {
      if (map['Email'] && String(row[map['Email'] - 1]).toLowerCase().indexOf(qLower) !== -1) hit = 'email';
      if (!hit) {
        var nm = [map['First Name'], map['Preferred Name'], map['Last Name']].map(function (c) { return c ? String(row[c - 1]) : ''; }).join(' ').toLowerCase();
        if (nm.indexOf(qLower) !== -1) hit = 'name';
      }
    }
    if (hit) {
      var r = rowToRegistrant_(row, map);
      r.matchedOn = hit;
      out.push(r);
    }
  }
  return { ok: true, results: out };
}

// One person's whole Sheet row, as [header, value] pairs in column order (for the Details tab).
function personDetails_(regId) {
  var reg = readRegistrants_();
  var i = findRowByQrId_(reg, regId);
  if (i === -1) return { ok: false, error: 'Unknown ID: ' + regId };
  var sh = reg.sheet;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rawVals = sh.getRange(i, 1, 1, lastCol).getValues()[0];
  var dispVals = sh.getRange(i, 1, 1, lastCol).getDisplayValues()[0];
  var out = [];
  for (var c = 0; c < lastCol; c++) {
    var h = String(headers[c]).trim();
    if (!h) continue;
    if (HIDE_COLUMNS.some(function (re) { return re.test(h); })) continue;
    var shown = dispVals[c];
    if (/ at$/i.test(h) || h === 'Pickup Time' || h === 'Registered At') {
      var friendly = asAppTime_(rawVals[c]);
      if (friendly) shown = String(friendly);
    }
    out.push([h, shown]);
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
