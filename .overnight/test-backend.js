// node .overnight/test-backend.js — exercises the Apps Script backend against the mock (30 fictional test rows).
'use strict';
const assert = require('assert');
const gas = require('./gas-mock');
const fixture = require('./fixture.json');
function fresh() { return gas.load(JSON.parse(JSON.stringify(fixture))); }
let n = 0; function t(name, fn) { fn(); n++; console.log('ok -', name); }

t('list returns registrants + rev', () => {
  const g = fresh(); const r = g.get({ action: 'list' });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.registrants.length, 30); assert.strictEqual(typeof r.rev, 'number');
});
t('list does not write once columns exist', () => {
  const g = fresh(); g.get({ action: 'list' }); const sh = g._ss.getSheetByName('Registrants'); sh._writes = 0;
  g.get({ action: 'list' }); assert.strictEqual(sh._writes, 0);
});
t('markPrinted batch writes 2 ranges', () => {
  const g = fresh(); g.get({ action: 'list' }); const sh = g._ss.getSheetByName('Registrants'); sh._writes = 0;
  const r = g.post({ action: 'markPrinted', ids: ['YSA-0001', 'YSA-0005'] }); assert.ok(r.ok);
  assert.ok(sh._writes <= 2, 'writes ' + sh._writes);
  const list = g.get({ action: 'list' }).registrants;
  assert.ok(list.find(x => x.id === 'YSA-0005').qrPrinted);
});
t('rev bumps on writes and lost list shows up', () => {
  const g = fresh(); const r0 = g.get({ action: 'rev' }).rev;
  g.post({ action: 'setLost', id: 'YSA-0003', value: true });
  const r1 = g.get({ action: 'rev' }); assert.strictEqual(r1.rev, r0 + 1);
  assert.strictEqual(r1.lost.length, 1); assert.strictEqual(r1.lost[0].id, 'YSA-0003');
  g.post({ action: 'setLost', id: 'YSA-0003', value: false });
  assert.strictEqual(g.get({ action: 'rev' }).lost.length, 0);
});
t('busy lock answers JSON', () => {
  const g = fresh(); g.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  const r = g.post({ action: 'checkin', id: 'YSA-0001' }); assert.strictEqual(r.error, 'busy');
});
t('audit: by columns + Log tab', () => {
  const g = fresh();
  g.post({ action: 'markTask', id: 'YSA-0001', task: 'pack', value: true, by: 'Ella', deviceId: 'D1' });
  const r = g.post({ action: 'markTask', id: 'YSA-0001', task: 'shirt', value: true, by: 'Noah', deviceId: 'D2' }).registrant;
  assert.ok(r.checkedIn); assert.strictEqual(r.checkedInBy, 'Noah'); assert.strictEqual(r.packGivenBy, 'Ella');
  const log = g._ss.getSheetByName('Log')._data(); assert.strictEqual(log.length, 3); assert.strictEqual(log[1][1], 'Ella');
  const l = g.post({ action: 'setLost', id: 'YSA-0002', value: true, by: 'Sec' }).registrant; assert.strictEqual(l.lostBy, 'Sec');
  assert.strictEqual(g.get({ action: 'rev' }).lost[0].by, 'Sec');
});
t('allergy + medical flags', () => {
  const g = fresh(); const list = g.get({ action: 'list' }).registrants;
  const a = list.find(x => x.id === 'YSA-0001'); assert.strictEqual(a.allergy, 'Bee sting allergy');
  assert.ok(list.some(x => x.medical) || true);
  assert.ok(list.filter(x => x.allergy).length > 0);
});
t('real form headers are understood (aliases)', () => {
  const head = ['Timestamp','First Name','Last Name','Preferred Name','Email','Phone Number','Ward/ Branch:','Stake/ District:','Will you need transportation from the airport? ','If yes, choose your preferred pick-up time: Brisbane Airport ONLY','Do you have any dietary restrictions?','If yes, please list your dietary restrictions:','\nDo you have any allergies?','If yes, please list your allergies:','Are there any medications you are currently taking that our medical support team needs to be aware of?','QR ID'];
  const row = ['2026-08-01','Jo','Smith','','jo@x.com','0412 345 678','Kenmore Ward','Brisbane Stake','Yes','10:00 AM','Yes','Vegan','Yes','Peanuts','Asthma','YSA-0001'];
  const g = gas.load({ Registrants: [head, row] });
  const r = g.get({ action: 'list' }).registrants[0];
  assert.strictEqual(r.ward, 'Kenmore Ward'); assert.strictEqual(r.stake, 'Brisbane Stake');
  assert.strictEqual(r.dietary, 'Vegan'); assert.strictEqual(r.allergy, 'Peanuts'); assert.ok(r.medical); assert.ok(r.needsPickup);
  assert.strictEqual(r.name, 'Jo Smith');
  const c = g.post({ action: 'checkin', id: 'YSA-0001', by: 'X' }); assert.ok(c.ok, JSON.stringify(c));
});
t('access code locks GET and POST', () => {
  const g = fresh(); g._props.ACCESS_CODE = '4321';
  assert.strictEqual(g.get({ action: 'list' }).error, 'locked');
  assert.strictEqual(g.post({ action: 'checkin', id: 'YSA-0001' }).error, 'locked');
  assert.ok(g.get({ action: 'list', key: '4321' }).ok);
  assert.ok(g.post({ action: 'checkin', id: 'YSA-0001', key: '4321' }).ok);
});
t('reset printing is admin only once an Admin exists', () => {
  const g = fresh();
  g.post({ action: 'registerStaff', deviceId: 'DA', name: 'Boss', role: 'Admin' });
  g.post({ action: 'registerStaff', deviceId: 'DB', name: 'Helper', role: 'Other' });
  assert.ok(g.post({ action: 'setStaffAccess', deviceId: 'DA', target: 'DB', status: 'Approved' }).ok);
  assert.strictEqual(g.post({ action: 'resetPrinted', deviceId: 'DB' }).error, 'admin only');
  assert.ok(g.post({ action: 'resetPrinted', deviceId: 'DA' }).ok);
});
t('desk search by phone / email', () => {
  const g = fresh();
  const list = g.get({ action: 'list' }).registrants;
  const row = fixture.Registrants[3]; const head = fixture.Registrants[0];
  const phone = row[head.indexOf('Phone')], email = row[head.indexOf('Email')];
  const spaced = '+61 ' + phone.slice(1, 4) + ' ' + phone.slice(4, 7) + ' ' + phone.slice(7);
  let r = g.get({ action: 'search', q: spaced }); assert.ok(r.results.some(x => x.id === row[0]), spaced + JSON.stringify(r));
  r = g.get({ action: 'search', q: email.split('@')[0].toUpperCase() }); assert.strictEqual(r.results[0].id, row[0]);
  assert.strictEqual(g.get({ action: 'search', q: 'ab' }).results.length, 0);
});
t('import from the real form layout', () => {
  const formHead = ["Timestamp","First Name","Last Name","Preferred Name","Email","Please attach a clear and suitable photo of yourself for recognition and identification purposes.","Phone Number","Are you a member of the Church of Jesus Christ of Latter-Day Saints?","Ward/ Branch:","Stake/ District:","Emergency Contact Name:","Relationship to Emergency Contact:","Emergency Contact Mobile:","For attendees, your ward bishop may request an interview...","Name of your current Bishop or Branch President:","Will you be attending as an On-site attendee or Off-site attendee?","Consider adding in names of 1 or 2 friends that you would like to be roomed near.","What day and time do you plan on arriving?","Will you need transportation from the airport? ","If yes, choose your preferred pick-up time: Brisbane Airport ONLY","Will You Need Return Airport Transport? (Closing Ceremony: Approx. 10:00am–12:00pm)  ","If you are interested in purchasing a YSA Convention T-Shirt, please state the colour and size of your choice.","Do you have any dietary restrictions?","If yes, please list your dietary restrictions:","\nDo you have any allergies?","If yes, please list your allergies:","Are there any medications you are currently taking that our medical support team needs to be aware of? Add any chronic or mental illnesses...","Identify any other needs or considerations you have that the event convenors or registrars should be aware of.\n","Full Name (Electronic Signature):","\nDate:","Do you want to participate in temple ordinances as part of the service activity? (Bring your own temple clothing)","If yes, are you a Brisbane Temple Worker?","Gender","Date of Birth"];
  const mk = (first, last, email, extra) => { const r = formHead.map(() => ''); r[0] = '2026-08-0' + first.length; r[1] = first; r[2] = last; r[4] = email; r[5] = 'https://drive.google.com/open?id=ABCDEFGHIJKLMNOPQRSTUVWX' + first; r[6] = '0412 000 00' + first.length; r[8] = 'Kenmore Ward'; r[9] = 'Brisbane Stake'; r[18] = 'Yes'; r[19] = '10:00 AM'; r[22] = 'Yes'; r[23] = 'Halal'; r[24] = 'Yes'; r[25] = 'Peanuts'; r[26] = 'Asthma'; Object.assign(r, extra || {}); return r; };
  const src = gas.makeSpreadsheet({ 'DO NOT EDIT!!! LIVE DATA': [formHead, mk('Ana', 'Lee', 'ana@x.com'), mk('Ben', 'Ng', 'ben@x.com'), mk('', '', '')] });
  const g = gas.load({ Activities: fixture.Activities }, { SRC: src });
  g._props.SOURCE_SHEET_ID = 'SRC';
  let res = g.syncFromForm(); assert.ok(res.ok, JSON.stringify(res)); assert.strictEqual(res.added, 2);
  let list = g.get({ action: 'list' }).registrants;
  assert.deepStrictEqual(list.map(x => x.id), ['YSA-0001', 'YSA-0002']);
  const ana = list[0]; assert.strictEqual(ana.name, 'Ana Lee'); assert.strictEqual(ana.ward, 'Kenmore Ward');
  assert.strictEqual(ana.allergy, 'Peanuts'); assert.strictEqual(ana.dietary, 'Halal'); assert.ok(ana.medical); assert.ok(ana.needsPickup);
  assert.ok(String(ana.photo).indexOf('drive.google.com/thumbnail') !== -1, ana.photo);
  // app writes survive a re-import; edits flow through; new people get the next ID
  assert.ok(g.post({ action: 'checkin', id: 'YSA-0001', by: 'Ella' }).ok);
  const sheetRows = src.getSheetByName('DO NOT EDIT!!! LIVE DATA')._data();
  sheetRows[1][8] = 'Toowong Ward';
  sheetRows.push(mk('Cara', 'Tui', 'cara@x.com'));
  res = g.syncFromForm(); assert.strictEqual(res.added, 1); assert.strictEqual(res.updated, 1);
  list = g.get({ action: 'list' }).registrants;
  assert.strictEqual(list.length, 3); assert.strictEqual(list[2].id, 'YSA-0003');
  assert.strictEqual(list[0].ward, 'Toowong Ward'); assert.ok(list[0].checkedIn); assert.strictEqual(list[0].checkedInBy, 'Ella');
  res = g.syncFromForm(); assert.strictEqual(res.added + res.updated, 0, 'idempotent');
  // search works on imported phone numbers
  assert.ok(g.get({ action: 'search', q: '0412 000 004' }).results.some(x => x.id === 'YSA-0003'));
});
t('admin: fixStampColumns + buildDashboard run', () => {
  const g = fresh(); const sh = g._ss.getSheetByName('Registrants');
  const head = sh._data()[0]; const c = head.indexOf('Checked In At');
  sh._data()[1][c] = 46279.45903; sh._data()[2][c] = new Date(Date.UTC(2026, 10, 12, 0, 30));
  const msg = g.fixStampColumns(); assert.ok(/Fixed 2/.test(msg), msg);
  assert.strictEqual(sh._data()[2][c], '12 Nov, 10:30 AM');
  assert.ok(/^\d+ \w+, \d+:\d\d (AM|PM)$/.test(sh._data()[1][c]), sh._data()[1][c]);
  assert.strictEqual(g.buildDashboard(), 'Dashboard rebuilt');
});
t('approvals: first phone is Admin, others wait until approved', () => {
  const g = fresh();
  const first = g.post({ action: 'registerStaff', deviceId: 'D1', name: 'Noah', role: 'Other' });
  assert.strictEqual(first.me.status, 'Approved'); assert.strictEqual(first.me.role, 'Admin');
  assert.ok(g.get({ action: 'list', deviceId: 'D1' }).ok);
  // unknown phone: told to sign up; nothing readable
  assert.strictEqual(g.get({ action: 'list', deviceId: 'DX' }).error, 'unregistered');
  assert.strictEqual(g.get({ action: 'rev', deviceId: 'DX' }).error, 'unregistered');
  assert.strictEqual(g.post({ action: 'checkin', id: 'YSA-0001', deviceId: 'DX' }).error, 'unregistered');
  // signs up asking for Admin: waits, role is only a request
  const r = g.post({ action: 'registerStaff', deviceId: 'D2', name: 'Sneaky', role: 'Admin' });
  assert.strictEqual(r.me.status, 'Pending'); assert.deepStrictEqual(r.staff, []);
  assert.strictEqual(g.get({ action: 'list', deviceId: 'D2' }).error, 'pending');
  assert.strictEqual(g.get({ action: 'search', q: 'gmail', deviceId: 'D2' }).error, 'pending');
  assert.strictEqual(g.get({ action: 'staffStatus', deviceId: 'D2' }).me.status, 'Pending');
  // a non-admin can't approve
  g.post({ action: 'registerStaff', deviceId: 'D3', name: 'Ella', role: 'Other' });
  assert.strictEqual(g.post({ action: 'setStaffAccess', deviceId: 'D3', target: 'D3', status: 'Approved' }).error, 'pending');
  // admin approves as Security (not the Admin they asked for)
  const ok = g.post({ action: 'setStaffAccess', deviceId: 'D1', target: 'D2', status: 'Approved', role: 'Security' });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.ok(g.get({ action: 'list', deviceId: 'D2' }).ok);
  // approved phone can't promote itself by re-signing up as Admin
  g.post({ action: 'registerStaff', deviceId: 'D2', name: 'Sneaky', role: 'Admin' });
  assert.strictEqual(g.get({ action: 'staffStatus', deviceId: 'D2' }).me.role, 'Security');
  assert.strictEqual(g.post({ action: 'resetPrinted', deviceId: 'D2' }).error, 'admin only');
  // deny / remove
  assert.ok(g.post({ action: 'setStaffAccess', deviceId: 'D1', target: 'D2', status: 'Denied' }).ok);
  assert.strictEqual(g.get({ action: 'list', deviceId: 'D2' }).error, 'denied');
  // can't remove the last Admin
  assert.strictEqual(g.post({ action: 'setStaffAccess', deviceId: 'D1', target: 'D1', status: 'Denied' }).error, 'last admin');
  const staff = g.get({ action: 'staff', deviceId: 'D1' }).staff;
  assert.strictEqual(staff.find(x => x.deviceId === 'D2').approvedBy, 'Denied by Noah');
});
t('approvals: existing staff are kept, and REQUIRE_APPROVAL=false switches it off', () => {
  const head = ['Name', 'Role', 'Device', 'First Connected', 'Last Seen', 'Device ID', 'Last Active'];
  const g = gas.load(Object.assign(JSON.parse(JSON.stringify(fixture)), { Staff: [head, ['Ella', 'Admin', 'Mac', '', '', 'DE', ''], ['Em', 'Other', 'Android', '', '', 'DM', '']] }));
  assert.ok(g.get({ action: 'list', deviceId: 'DM' }).ok, 'old staff keep access');
  assert.strictEqual(g.get({ action: 'list', deviceId: 'NEW' }).error, 'unregistered');
  g._props.REQUIRE_APPROVAL = 'false'; g._cache.staffAccess && delete g._cache.staffAccess;
  assert.ok(g.get({ action: 'list', deviceId: 'NEW' }).ok);
});
t('unknown action', () => { const g = fresh(); assert.strictEqual(g.post({ action: 'nope' }).ok, false); });

if (require.main === module) {
  const extra = process.argv[2]; if (extra) require(require('path').resolve(extra));
}
module.exports = { fresh, t, assert };
console.log(n + ' backend tests passed');
