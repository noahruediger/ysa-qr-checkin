// Minimal in-memory stand-in for the Apps Script services the backend uses, so the .gs files
// can be exercised in node. Usage: const gas = require('./gas-mock'); const g = gas.load(); g.doGet(...)
// Not a full emulation: just enough for Code/Walkin/Problems/Staff/Live/Import.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name, rows) {
  let data = (rows || []).map(r => r.slice());
  const formats = {};
  function width() { return data.reduce((m, r) => Math.max(m, r.length), 0); }
  function ensure(r, c) {
    while (data.length < r) data.push([]);
    for (let i = 0; i < data.length; i++) while (data[i].length < c) data[i].push('');
  }
  const sheet = {
    _data: () => data,
    getName: () => name,
    getLastRow: () => { let n = data.length; while (n > 0 && data[n - 1].every(v => v === '' || v == null)) n--; return n; },
    getLastColumn: () => { let w = 0; data.forEach(r => { for (let i = r.length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] != null) { w = Math.max(w, i); break; } }); return w; },
    getRange: (row, col, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const rng = {
        getValues: () => { ensure(row + nr - 1, col + nc - 1); return data.slice(row - 1, row - 1 + nr).map(r => r.slice(col - 1, col - 1 + nc)); },
        getDisplayValues: () => rng.getValues().map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v))),
        getValue: () => rng.getValues()[0][0],
        setValues: (vals) => {
          if (vals.length !== nr || vals[0].length !== nc) throw new Error('setValues size mismatch ' + vals.length + 'x' + vals[0].length + ' vs ' + nr + 'x' + nc);
          ensure(row + nr - 1, col + nc - 1);
          vals.forEach((r, i) => r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; }));
          sheet._writes = (sheet._writes || 0) + 1;
          return rng;
        },
        setValue: (v) => { ensure(row, col); data[row - 1][col - 1] = v; sheet._writes = (sheet._writes || 0) + 1; return rng; },
        setNumberFormat: (f) => { formats[row + ':' + col] = f; return rng; },
        setFontWeight: () => rng,
        setFormula: (f) => { ensure(row, col); data[row - 1][col - 1] = f; return rng; },
        setFormulas: (fs2) => rng.setValues(fs2),
        clear: () => rng,
        getSheet: () => sheet
      };
      return rng;
    },
    appendRow: (r) => { const n = sheet.getLastRow(); ensure(n + 1, r.length); data[n] = r.slice(); while (data[n].length < width()) data[n].push(''); sheet._writes = (sheet._writes || 0) + 1; },
    setFrozenRows: () => {}, setColumnWidth: () => {}, clear: () => { data = []; },
    getMaxRows: () => Math.max(1000, data.length), getMaxColumns: () => Math.max(26, width())
  };
  return sheet;
}

function makeSpreadsheet(tabs) {
  const sheets = {};
  Object.keys(tabs || {}).forEach(k => { sheets[k] = makeSheet(k, tabs[k]); });
  return {
    _sheets: sheets,
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n, []); return sheets[n]; },
    getSheets: () => Object.values(sheets),
    getSpreadsheetTimeZone: () => 'Australia/Brisbane'
  };
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function formatDate(d, tz, fmt) {
  // Brisbane is UTC+10 with no DST; 'UTC' used for raw serial conversion.
  const off = tz === 'UTC' ? 0 : 10;
  const x = new Date(d.getTime() + off * 3600000);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = x.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return fmt
    .replace('yyyy', x.getUTCFullYear())
    .replace('d MMM', x.getUTCDate() + ' ' + M[x.getUTCMonth()])
    .replace('h:mm a', h + ':' + pad(x.getUTCMinutes()) + ' ' + ap)
    .replace('HH:mm', pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()));
}

function load(tabs, extraSpreadsheets) {
  const ss = makeSpreadsheet(tabs);
  const others = extraSpreadsheets || {};
  const props = {};
  const cache = {};
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: (id) => { if (!others[id]) throw new Error('No spreadsheet ' + id); return others[id]; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props)
    }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Australia/Brisbane' },
    Utilities: {
      formatDate,
      base64Decode: s => Array.from(Buffer.from(s, 'base64')),
      base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: () => ({})
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ _text: t, setMimeType() { return this; } }) },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: () => ({ getUrl: () => 'https://drive.google.com/file/d/FAKEFAKEFAKEFAKEFAKEFAKE/view' }) }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => ({}) }) }) }), deleteTrigger: () => {} }
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  });
  ctx._ss = ss; ctx._props = props; ctx._cache = cache;
  ctx.get = (params) => JSON.parse(ctx.doGet({ parameter: params || {} })._text);
  ctx.post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })._text);
  return ctx;
}

module.exports = { load, makeSpreadsheet, makeSheet };
