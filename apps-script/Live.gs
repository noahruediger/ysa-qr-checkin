/**
 * Live updates for the YSA QR Check-In app: a change counter ("rev") and the list of lost people.
 *
 * Every change made through the app (and any hand edit in the Sheet, via onEdit) bumps a number
 * kept in Script Properties. Phones ask for it every few seconds with doGet action=rev. That
 * request doesn't read the Sheet at all, so it's cheap. A phone only downloads the full people
 * list when the number has changed. The same answer carries everyone currently marked lost,
 * which is how the red "LOST" banner reaches every phone within seconds.
 *
 * Setup: add this file next to Code.gs (+ next to Files > Script, name it "Live"). Code.gs
 * already routes to it. Then Deploy > Manage deployments > Edit > New version.
 */

// App actions that change people. Anything else (problems, staff, walk-in card count) doesn't bump rev.
var REV_ACTIONS = {
  checkin: 1, uncheckin: 1, setLost: 1, toggleLost: 1, markPrinted: 1,
  markPickedUp: 1, markTask: 1, resetPrinted: 1, registerWalkin: 1
};

var LOST_PROP = 'lostPeople';   // JSON { "YSA-0001": { name, team, at, by } }
var REV_PROP = 'rev';

function getRevNumber_() {
  return parseInt(PropertiesService.getScriptProperties().getProperty(REV_PROP), 10) || 0;
}

// Called after a successful app write (inside the script lock) and from onEdit.
function bumpRev_(body, out) {
  var props = PropertiesService.getScriptProperties();
  var rev = (parseInt(props.getProperty(REV_PROP), 10) || 0) + 1;
  props.setProperty(REV_PROP, String(rev));
  if (body && (body.action === 'setLost' || body.action === 'toggleLost') && out && out.registrant) {
    var lost = readLostMap_();
    var r = out.registrant;
    if (r.lost) lost[r.id] = { name: r.name, team: r.team || '', at: r.lostAt || '', by: r.lostBy || '' };
    else delete lost[r.id];
    writeLostMap_(lost);
  }
  return rev;
}

function readLostMap_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(LOST_PROP) || '{}') || {}; }
  catch (e) { return {}; }
}

function writeLostMap_(map) {
  PropertiesService.getScriptProperties().setProperty(LOST_PROP, JSON.stringify(map));
}

// Rebuilt from the real data every time a phone downloads the full list, so the quick lost
// list can't drift from the Sheet for long (e.g. after someone edits the Lost column by hand).
function syncLostFromRegistrants_(registrants) {
  var lost = {};
  registrants.forEach(function (r) {
    if (r.lost) lost[r.id] = { name: r.name, team: r.team || '', at: r.lostAt || '', by: r.lostBy || '' };
  });
  var before = PropertiesService.getScriptProperties().getProperty(LOST_PROP) || '{}';
  var after = JSON.stringify(lost);
  if (before !== after) writeLostMap_(lost);
}

// doGet action=rev — cheap: no Sheet read.
function revInfo_() {
  var lost = readLostMap_();
  var list = Object.keys(lost).map(function (id) {
    var p = lost[id];
    return { id: id, name: p.name, team: p.team, at: p.at, by: p.by };
  });
  return { ok: true, rev: getRevNumber_(), lost: list, serverTime: new Date().getTime() };
}

// Simple trigger: a hand edit on the Registrants tab also counts as a change, so phones pick it up.
function onEdit(e) {
  try {
    var sh = e && e.range ? e.range.getSheet() : null;
    if (!sh || sh.getName() !== SHEET_REGISTRANTS) return;
    bumpRev_(null, null);
  } catch (err) { /* simple triggers must never throw at the user */ }
}
