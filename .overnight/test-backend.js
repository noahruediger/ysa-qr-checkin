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
t('unknown action', () => { const g = fresh(); assert.strictEqual(g.post({ action: 'nope' }).ok, false); });

if (require.main === module) {
  const extra = process.argv[2]; if (extra) require(require('path').resolve(extra));
}
module.exports = { fresh, t, assert };
console.log(n + ' backend tests passed');
