/**
 * Staff access list for the YSA QR Check-In app.
 *
 * The first time a phone connects to this Sheet, the app asks for the person's name and role
 * (Admin, Security or Other). Each phone is then listed on a "Staff" tab (created automatically):
 * name, role, which phone/browser, when it
 * first connected and when it was last used. Settings > People with access shows this list.
 *
 * Approval: a new phone can't see or change anything until an Admin approves it (Settings >
 * People with access > Approve). Until then it only gets { ok:false, error:'pending' }. The very
 * first phone to sign up on a Sheet with no Admin is approved as Admin automatically, so a new
 * Sheet isn't locked out. Phones that were already on the Staff tab before approvals existed are
 * kept as Approved. Set Script Property REQUIRE_APPROVAL = false to switch approvals off.
 * People can't make themselves Admin: the role they pick is a request, and only an Admin can
 * change someone's role later.
 *
 * Who's online: while the app is open, each phone sends a "heartbeat" every couple of minutes
 * (doGet action=heartbeat). That updates its Last Seen / Last Active time, and the app's Dashboard
 * shows anyone active in the last 5 minutes as online.
 *
 * Setup: add this file next to Code.gs in the Sheet's Apps Script project (+ next to Files > Script).
 * Code.gs already routes the actions to it. Then Deploy > Manage deployments > Edit > New version.
 */

var SHEET_STAFF = 'Staff';
var STAFF_HEADERS = ['Name', 'Role', 'Device', 'First Connected', 'Last Seen', 'Device ID', 'Last Active', 'Status', 'Approved By', 'Approved At'];
var STAFF_STATUSES = ['Approved', 'Pending', 'Denied'];

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
  if (missing.length) {
    var startCol = headers.filter(String).length + 1;
    sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
    // Approvals are new: everyone already on the list keeps their access.
    var statusIdx = missing.indexOf('Status');
    if (statusIdx !== -1 && sh.getLastRow() >= 2) {
      var n = sh.getLastRow() - 1;
      var fill = [];
      for (var i = 0; i < n; i++) fill.push(['Approved']);
      sh.getRange(2, startCol + statusIdx, n, 1).setValues(fill);
    }
    clearStaffCache_();
  }
  return sh;
}

function approvalsOn_() {
  return String(PropertiesService.getScriptProperties().getProperty('REQUIRE_APPROVAL') || '').toLowerCase() !== 'false';
}

function clearStaffCache_() { try { CacheService.getScriptCache().remove('staffAccess'); } catch (e) { /* fine */ } }

// { deviceId: { status, role, name, row } } — cached for 30 s because every request checks it.
function staffAccessMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('staffAccess');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* rebuild */ } }
  var sh = staffSheet_();
  var map = headerMap_(sh);
  var out = {};
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    vals.forEach(function (row, i) {
      var id = String(row[map['Device ID'] - 1] || '').trim();
      if (!id) return;
      out[id] = {
        status: String((map['Status'] && row[map['Status'] - 1]) || 'Pending').trim() || 'Pending',
        role: String(row[map['Role'] - 1] || '').trim(),
        name: String(row[map['Name'] - 1] || '').trim(),
        row: i + 2
      };
    });
  }
  cache.put('staffAccess', JSON.stringify(out), 30);
  return out;
}

function hasApprovedAdmin_(access) {
  return Object.keys(access).some(function (id) { return access[id].status === 'Approved' && access[id].role === 'Admin'; });
}

// The gate every request goes through (Code.gs). Returns null when the phone may go ahead,
// or the error to send back: 'unregistered' (no name yet), 'pending' or 'denied'.
function accessError_(deviceId) {
  if (!approvalsOn_()) return null;
  var access = staffAccessMap_();
  var me = access[String(deviceId || '').trim()];
  if (!me) return hasApprovedAdmin_(access) ? 'unregistered' : null;   // brand-new Sheet: open until the first Admin exists
  if (me.status === 'Approved') return null;
  return me.status === 'Denied' ? 'denied' : 'pending';
}

// What a phone needs to know about itself: { status, role, name }.
function myAccess_(deviceId) {
  var access = staffAccessMap_();
  var me = access[String(deviceId || '').trim()];
  if (!me) return { status: approvalsOn_() && hasApprovedAdmin_(access) ? 'Unregistered' : 'Approved', role: '', name: '' };
  return { status: approvalsOn_() ? me.status : 'Approved', role: me.role, name: me.name };
}

// doGet action=staffStatus — allowed before approval, so a waiting phone can see when it's let in.
function staffStatus_(params) {
  return { ok: true, me: myAccess_(params && params.deviceId), approvals: approvalsOn_() };
}

// Admin only: approve / deny / remove someone, or change their role.
// body: { deviceId (the admin's phone), target (their Device ID), status?, role? }
function setStaffAccess_(body) {
  var access = staffAccessMap_();
  var admin = access[String(body.deviceId || '').trim()];
  if (!admin || admin.status !== 'Approved' || admin.role !== 'Admin') return { ok: false, error: 'admin only' };
  var target = String(body.target || '').trim();
  var who = access[target];
  if (!who) return { ok: false, error: 'Unknown phone' };
  var status = body.status ? String(body.status) : who.status;
  var role = body.role ? String(body.role) : who.role;
  if (STAFF_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  if (['Admin', 'Security', 'Other'].indexOf(role) === -1) return { ok: false, error: 'Bad role' };
  // Never leave the Sheet with no approved Admin (that would lock everyone out of approving).
  var adminsAfter = Object.keys(access).filter(function (id) {
    var s = id === target ? status : access[id].status;
    var r = id === target ? role : access[id].role;
    return s === 'Approved' && r === 'Admin';
  });
  if (!adminsAfter.length) return { ok: false, error: 'last admin' };
  var sh = staffSheet_();
  var map = headerMap_(sh);
  sh.getRange(who.row, map['Status']).setValue(status);
  sh.getRange(who.row, map['Role']).setValue(role);
  if (status !== who.status) {
    sh.getRange(who.row, map['Approved By']).setValue(status === 'Approved' ? admin.name : (status === 'Denied' ? 'Denied by ' + admin.name : ''));
    sh.getRange(who.row, map['Approved At']).setValue(nowStamp_());
  }
  clearStaffCache_();
  return listStaff_();
}

function listStaff_() {
  var sh = staffSheet_();
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, staff: [] };
  var range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  var values = range.getDisplayValues();
  var raw = range.getValues();
  var now = Date.now();
  var staff = values.map(function (row, i) {
    function g(h) { return map[h] ? row[map[h] - 1] : ''; }
    // Last Active is a real date/time, so the app can tell how long ago it was.
    // agoSec is worked out here, on the Sheet's clock, so a phone with the wrong time doesn't matter.
    var active = map['Last Active'] ? raw[i][map['Last Active'] - 1] : '';
    var agoSec = active instanceof Date ? Math.max(0, Math.round((now - active.getTime()) / 1000)) : null;
    return { name: g('Name'), role: g('Role'), device: g('Device'), firstConnected: g('First Connected'), lastSeen: g('Last Seen'), deviceId: g('Device ID'), agoSec: agoSec,
      status: g('Status') || 'Pending', approvedBy: g('Approved By'), approvedAt: g('Approved At') };
  }).filter(function (s) { return s.name || s.deviceId; });
  return { ok: true, staff: staff, approvals: approvalsOn_() };
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
        // The role is only a request while waiting; once approved, only an Admin can change it.
        var curStatus = map['Status'] ? String(sh.getRange(r, map['Status']).getValue()).trim() : 'Approved';
        if (role && curStatus !== 'Approved') sh.getRange(r, map['Role']).setValue(role);
        if (device) sh.getRange(r, map['Device']).setValue(device);
        sh.getRange(r, map['Last Seen']).setValue(stamp);
        sh.getRange(r, map['Last Active']).setValue(new Date());
        clearStaffCache_();
        return staffReply_(deviceId);
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
  set('Last Active', new Date());
  // First phone on a Sheet with no approved Admin becomes the Admin, so the Sheet can't get stuck.
  var bootstrap = !hasApprovedAdmin_(staffAccessMap_());
  if (bootstrap || !approvalsOn_()) {
    set('Status', 'Approved');
    if (bootstrap) { set('Role', 'Admin'); set('Approved By', 'First to sign up'); set('Approved At', stamp); }
  } else {
    set('Status', 'Pending');
  }
  sh.appendRow(row);
  clearStaffCache_();
  return staffReply_(deviceId);
}

// After signing up: approved phones get the whole list, waiting ones only their own status.
function staffReply_(deviceId) {
  var me = myAccess_(deviceId);
  if (me.status !== 'Approved') return { ok: true, me: me, staff: [] };
  var out = listStaff_();
  out.me = me;
  return out;
}

// "I'm still here" from a phone with the app open. Updates its times and sends back the whole list.
// A phone that hasn't typed its name yet (not on the tab) just gets the list.
function staffHeartbeat_(params) {
  var deviceId = String((params && params.deviceId) || '').trim();
  var sh = staffSheet_();
  var map = headerMap_(sh);
  var lastRow = sh.getLastRow();
  if (deviceId && lastRow >= 2) {
    var ids = sh.getRange(2, map['Device ID'], lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === deviceId) {
        sh.getRange(i + 2, map['Last Seen']).setValue(nowStamp_());
        sh.getRange(i + 2, map['Last Active']).setValue(new Date());
        break;
      }
    }
  }
  return listStaff_();
}
