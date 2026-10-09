'use strict';
const path = require('path');
const { createBank } = require('./bank');

function registerRoutes(app, bank, rt) {
  const pub = (u) => { if (!u) return null; const c = { ...u }; delete c.password; return c; };
  const st = (u) => ({ state: bank.accountState(u) });
  const emit = (ids) => { if (rt && rt.users) rt.users(ids); };
  const wrap = (res, fn) => { try { return fn(); } catch (e) { return res.status(400).json({ ok: false, message: e.message }); } };
  const auth = (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    const u = t && bank.userFromToken(t);
    if (!u) return res.status(401).json({ ok: false, message: 'Sessão expirada. Entre novamente.' });
    req.user = u; next();
  };
  const admin = (req, res, next) => { if (req.user.role !== 'admin') return res.status(403).json({ ok: false, message: 'Área exclusiva do master.' }); next(); };

  app.post('/api/register', (req, res) => wrap(res, () => {
    const d = req.body || {};
    const { user } = bank.register(d);
    const { token } = bank.login(user.username, d.password);
    res.json({ ok: true, token, state: bank.accountState(user) });
  }));
  app.post('/api/login', (req, res) => { try {
    const { username, password } = req.body || {};
    const { token } = bank.login(username, password);
    res.json({ ok: true, token, state: bank.accountState(bank.userFromToken(token)) });
  } catch (e) { res.status(401).json({ ok: false, message: e.message }); } });
  app.get('/api/me', auth, (req, res) => res.json({ ok: true, ...st(req.user) }));
  app.post('/api/logout', auth, (req, res) => res.json({ ok: true }));
  app.post('/api/password', auth, (req, res) => wrap(res, () => { const d = req.body || {}; const token = bank.changePassword(req.user, d.current, d.next); res.json({ ok: true, token, ...st(req.user) }); }));

  app.post('/api/referral/apply', auth, (req, res) => wrap(res, () => { const r = bank.applyReferral(req.user, (req.body||{}).code); res.json({ ok: true, reward: r.reward, ...st(req.user) }); }));

  app.post('/api/pix/lookup', auth, (req, res) => { const u = bank.lookupKey(req.user, (req.body||{}).key); if (!u) return res.status(404).json({ ok: false, message: 'Chave não encontrada.' }); res.json({ ok: true, recipient: pub(u) }); });
  app.post('/api/pix/send', auth, (req, res) => wrap(res, () => { const d = req.body || {}; const rec = bank.lookupKey(req.user, d.key); bank.pixSend(req.user, d); res.json({ ok: true, ...st(req.user) }); emit([req.user.id, rec ? rec.id : '']); }));
  app.post('/api/pix/key', auth, (req, res) => wrap(res, () => { bank.addKey(req.user, req.body || {}); res.json({ ok: true, ...st(req.user) }); }));
  app.delete('/api/pix/key/:keyId', auth, (req, res) => wrap(res, () => { bank.removeKey(req.user, req.params.keyId); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/pix/installment/pay', auth, (req, res) => wrap(res, () => { bank.payInstallment(req.user, (req.body||{}).loanId); res.json({ ok: true, ...st(req.user) }); }));

  app.post('/api/savings/:dir', auth, (req, res) => wrap(res, () => { const d = req.params.dir; if (d !== 'in' && d !== 'out') return res.status(400).json({ ok: false, message: 'Direção inválida.' }); bank.savingsMove(req.user, d, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); emit([req.user.id]); }));

  app.get('/api/card/secret', auth, (req, res) => res.json({ ok: true, card: { number: req.user.cardNumber, cvv: req.user.cvv, expiry: req.user.expiry || '12/29', holder: req.user.fullName } }));
  app.post('/api/card/toggle', auth, (req, res) => wrap(res, () => { bank.toggleCard(req.user); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/card/purchase', auth, (req, res) => wrap(res, () => { const d = req.body || {}; bank.cardPurchase(req.user, d); res.json({ ok: true, ...st(req.user) }); }));

  app.post('/api/credit/pay', auth, (req, res) => wrap(res, () => { bank.payInvoice(req.user, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/credit/draw', auth, (req, res) => wrap(res, () => { bank.creditDraw(req.user, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/credit/request', auth, (req, res) => wrap(res, () => { const d = req.body || {}; bank.creditRequest(req.user, d); res.json({ ok: true, message: 'Análise enviada para o master.', ...st(req.user) }); }));

  app.get('/api/support/messages', auth, (req, res) => res.json({ ok: true, messages: bank.accountState(req.user).supportMessages }));
  app.post('/api/support/messages', auth, (req, res) => wrap(res, () => { bank.supportSend(req.user, (req.body||{}).text); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/notifications/read', auth, (req, res) => wrap(res, () => { bank.markNotifsRead(req.user); res.json({ ok: true, ...st(req.user) }); }));

  app.get('/api/master/overview', auth, admin, (req, res) => res.json({ ok: true, ...bank.masterOverview() }));
  app.post('/api/master/credit/:requestId/:action', auth, admin, (req, res) => wrap(res, () => {
    const action = req.params.action;
    if (!['approve','reject'].includes(action)) return res.status(400).json({ ok: false, message: 'Decisão inválida.' });
    const before = bank.masterOverview().pending.find(r => r.id === req.params.requestId);
    bank.creditDecide(req.params.requestId, action, (req.body||{}).note);
    res.json({ ok: true });
    if (before) emit([before.userId]);
    if (rt && rt.masters) rt.masters();
  }));
  app.post('/api/master/support/reply', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.supportReply(d.userId, d.text); res.json({ ok: true }); emit([d.userId]); }));
  app.post('/api/master/deposit', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterDeposit(d.userId, d.amount, d.note); res.json({ ok: true }); emit([d.userId]); }));
}

module.exports = { registerRoutes };

if (require.main === module) {
  const express = require('express');
  const http = require('http');
  const cors = require('cors');
  const { Server } = require('socket.io');

  const dataDir = process.env.DATA_DIR || __dirname;
  const bank = createBank({ file: process.env.DB_FILE || path.join(dataDir, 'db.json') });

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' }, pingInterval: 25000, pingTimeout: 20000 });
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

  const rt = {
    users(ids) {
      [...new Set(ids)].forEach((uid) => { const u = bank.byId(uid); if (!u) return; io.to(`user:${uid}`).emit('account:updated', { state: bank.accountState(u) }); });
      io.to('masters').emit('master:refresh');
    },
    masters() { io.to('masters').emit('master:refresh'); },
  };

  io.use((socket, next) => { const u = bank.userFromToken(socket.handshake.auth && socket.handshake.auth.token); if (!u) return next(new Error('AUTH')); socket.data.userId = u.id; socket.data.role = u.role; next(); });
  io.on('connection', (socket) => { socket.join(`user:${socket.data.userId}`); if (socket.data.role === 'admin') socket.join('masters'); });

  registerRoutes(app, bank, rt);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'Rota não encontrada.' }));
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => console.log(`Armin Bank online na porta ${PORT}`));
           }
