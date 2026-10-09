'use strict';
// Servidor mínimo (sem express) só para testes locais de ponta a ponta. Usa as MESMAS rotas de server.js.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { createBank } = require('../bank'); const { registerRoutes } = require('../server');
const bank = createBank({ file: process.env.DB_FILE || '/tmp/armin-e2e.json' });
const routes = [];
const add = (method) => (p, ...h) => { const keys = []; const re = new RegExp('^' + p.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); routes.push({ method, re, keys, h }); };
registerRoutes({ get: add('GET'), post: add('POST'), delete: add('DELETE') }, bank, { users() {}, masters() {} });
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const r = routes.find((x) => x.method === req.method && x.re.test(url));
  if (r) {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      req.body = raw ? JSON.parse(raw) : {}; const m = url.match(r.re); req.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      res.status = (c) => { res.statusCode = c; return res; }; res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      let i = 0; const next = () => { const f = r.h[i++]; if (f) f(req, res, next); }; next();
    }); return;
  }
  if (url.startsWith('/api/')) { res.statusCode = 404; return res.end('{"ok":false,"message":"Rota não encontrada."}'); }
  if (url.startsWith('/socket.io')) { res.statusCode = 404; return res.end(); }
  const f = path.join(__dirname, '../public', url === '/' ? 'index.html' : url);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', types[path.extname(f)] || 'text/plain'); return res.end(fs.readFileSync(f)); }
  res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(__dirname, '../public/index.html')));
}).listen(3111, () => console.log('shim on 3111'));
