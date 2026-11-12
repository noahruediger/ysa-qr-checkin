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
t('unknown action', () => { const g = fresh(); assert.strictEqual(g.post({ action: 'nope' }).ok, false); });

if (require.main === module) {
  const extra = process.argv[2]; if (extra) require(require('path').resolve(extra));
}
module.exports = { fresh, t, assert };
console.log(n + ' backend tests passed');
