'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./preview.cjs');

const dir = path.resolve(__dirname, '../www-preview');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf' };

http.createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/') build(); // reconstrói ao abrir o índice
  let file = null;
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    file = path.resolve(dir, name);
  } catch { /* URL malformado: 404 */ }
  if (!file || !file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(4174, '127.0.0.1', () => console.log('Pré-visualização em http://localhost:4174'));

build();
