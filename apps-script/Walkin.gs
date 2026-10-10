/**
 * Walk-in sign-ups for the YSA QR Check-In app.
 *
 * People who didn't register get a pre-printed blank card (QR code YSA-A0001, YSA-A0002 ...).
 * When staff scan one that isn't linked to anyone yet, the app sends the person's name,
 * optional ward and a photo here. This adds them as a new row on the Registrants tab and
 * saves the photo to a Drive folder, so every phone can look them up by scanning the card.
 *
 * Setup: add this file next to Code.gs in the Sheet's Apps Script project (+ next to Files > Script).
 * Code.gs already routes the actions to it. Then Deploy > Manage deployments > Edit > New version.
 */

var WALKIN_ID_RE = /^YSA-A\d{4}$/;
var WALKIN_PHOTO_FOLDER = 'YSA Walk-in Photos';
var WALKIN_COLUMNS = ['Walk-in', 'Registered At'];

function registerWalkin_(body, reg) {
  var id = String(body.id || '').trim().toUpperCase();
  var name = String(body.name || '').replace(/\s+/g, ' ').trim();
  var ward = String(body.ward || '').replace(/\s+/g, ' ').trim();
  if (!WALKIN_ID_RE.test(id)) return { ok: false, error: 'Not a walk-in card code: ' + id };
  if (!name) return { ok: false, error: 'Name is required' };

  var sh = reg.sheet;

  // Already linked? The same name means the phone is re-sending after a dropped connection — that's fine.
  var existingRow = findRowByQrId_(reg, id);
  if (existingRow !== -1) {
    var existing = rowToRegistrant_(sh.getRange(existingRow, 1, 1, sh.getLastColumn()).getValues()[0], reg.map);
    var sameName = String(existing.name).replace(/\s+/g, ' ').trim().toLowerCase() === name.toLowerCase();
    if (sameName) { existing.walkin = true; return { ok: true, registrant: existing }; }
    return { ok: false, error: 'taken', name: String(existing.name).trim() };
  }

  // Make sure the walk-in columns exist, then re-read the header positions.
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = WALKIN_COLUMNS.filter(function (c) { return headers.indexOf(c) === -1; });
  if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  var map = headerMap_(sh);
  lastCol = sh.getLastColumn();

  var photoUrl = '';
  if (body.photo) {
    try { photoUrl = saveWalkinPhoto_(body.photo, id, name); }
    catch (err) { photoUrl = ''; } // still sign them up; the photo can be added to the Sheet by hand
  }

  var parts = name.split(' ');
  var first = parts.shift();
  var last = parts.join(' ');
  var stamp = nowStamp_();

  var row = [];
  for (var i = 0; i < lastCol; i++) row.push('');
  function set(header, value) { if (map[header]) row[map[header] - 1] = value; }
  set('QR ID', id);
  set('First Name', first);
  set('Last Name', last);
  set('Ward', ward);
  set('Dietary Restrictions', 'No');
  set('Airport Pickup Needed', 'No');
  set('QR Printed', 'Yes');
  set('QR Printed At', 'Blank card');
  set('Checked In', 'No');
  set('Lost', 'No');
  set('Photo URL', photoUrl);
  set('Walk-in', 'Yes');
  set('Registered At', body.at ? stamp + ' (phone: ' + body.at + ')' : stamp);
  sh.appendRow(row);

  var newRow = sh.getLastRow();
  var registrant = rowToRegistrant_(sh.getRange(newRow, 1, 1, lastCol).getValues()[0], map);
  registrant.name = String(registrant.name).trim();
  registrant.walkin = true;
  return { ok: true, registrant: registrant };
}

// Saves a "data:image/jpeg;base64,..." photo from the app into the walk-in photo folder.
function saveWalkinPhoto_(dataUri, id, name) {
  var m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(dataUri));
  if (!m) return '';
  var bytes = Utilities.base64Decode(m[2]);
  var ext = m[1].toLowerCase().indexOf('png') !== -1 ? 'png' : 'jpg';
  var blob = Utilities.newBlob(bytes, m[1], id + ' - ' + name + '.' + ext);
  var folders = DriveApp.getFoldersByName(WALKIN_PHOTO_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(WALKIN_PHOTO_FOLDER);
  return folder.createFile(blob).getUrl();
}
