// node .overnight/mock-server.js [port] — serves the repo's files and answers /exec with the
// Apps Script backend running on the in-memory mock (fictional test rows). For browser smoke tests.
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path'); const url = require('url');
const gas = require('./gas-mock');
const g = gas.load(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')));
const root = path.join(__dirname, '..');
const port = +process.argv[2] || 8765;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/exec') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let out;
      try { out = req.method === 'POST' ? g.doPost({ postData: { contents: body } })._text : g.doGet({ parameter: u.query })._text; }
      catch (e) { out = JSON.stringify({ ok: false, error: String(e) }); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out);
    });
    return;
  }
  let p = path.join(root, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
}).listen(port, () => console.log('mock server on http://localhost:' + port));
