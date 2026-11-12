/**
 * Audit trail for the YSA QR Check-In app.
 *
 * Every change made through the app is added as a row on a "Log" tab (created automatically):
 * when, which staff member (the name they typed in the app), which phone, what they did, and to whom.
 * Phones also fill in "Checked In By", "Lost By", "Pack Given By", "Shirt Given By" and "Picked Up By"
 * on the Registrants tab, so the app can say e.g. "Already checked in at 9:42 AM by Ella".
 *
 * The names come from each phone (Settings > This phone), so they're as good as what people typed:
 * a record, not proof.
 *
 * Setup: add this file next to Code.gs (+ next to Files > Script, name it "Log"). Then
 * Deploy > Manage deployments > Edit > New version.
 */

var SHEET_LOG = 'Log';
var LOG_HEADERS = ['Time', 'Staff', 'Device', 'Action', 'QR ID', 'Name', 'Detail'];

function logSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');   // keep "12 Nov, 9:42 AM" as text
  }
  return sh;
}

var LOG_LABELS = {
  checkin: 'Checked in', uncheckin: 'Check-in undone', setLost: 'Lost flag', toggleLost: 'Lost flag',
  markPrinted: 'Lanyards printed', markPickedUp: 'Airport pickup',
  markTask: 'Check-in list', resetPrinted: 'Reset printing', registerWalkin: 'Walk-in signed up'
};

function logAction_(body, out) {
  try {
    var r = out && out.registrant;
    var detail = '';
    var a = body.action;
    if (a === 'setLost' || a === 'toggleLost') detail = r && r.lost ? 'Marked LOST' : 'Marked found';
    else if (a === 'markTask') detail = (body.task === 'pack' ? 'Pack' : body.task === 'shirt' ? 'Shirt' : body.task) + (isTrue_(body.value) ? ' given' : ' untick');
    else if (a === 'markPickedUp') detail = isTrue_(body.value) ? 'Picked up' : 'Pickup undone';
    else if (a === 'markPrinted') detail = (body.ids ? body.ids.length : 1) + ' card(s)';
    else if (a === 'resetPrinted') detail = (out.reset || 0) + ' reset';
    var ids = a === 'markPrinted' ? '' : String(body.id || (r && r.id) || '');
    logSheet_().appendRow([
      nowStamp_(),
      String(body.by || '').slice(0, 60),
      String(body.deviceId || '').slice(0, 40),
      LOG_LABELS[a] || a,
      ids,
      r ? String(r.name || '').trim() : '',
      detail
    ]);
  } catch (err) { /* the change itself already worked; never fail it over the log */ }
}

function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }
