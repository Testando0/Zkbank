'use strict';
const path = require('path');
const { createBank, BankError } = require('./bank');

/**
 * Registra todas as rotas da API. Recebe `app` (express), o `bank` e um objeto
 * `rt` com helpers de tempo real — assim dá para testar sem subir servidor.
 */
function registerRoutes(app, bank, rt) {
  const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };
  const auth = (req, res, next) => {
    const user = bank.userFromToken(bearer(req));
    if (!user) return res.status(401).json({ ok: false, message: 'Sessão expirada. Entre novamente.' });
    req.user = user; req.token = bearer(req); next();
  };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ ok: false, message: 'Área exclusiva do Armin Master.' }));
  const wrap = (fn) => (req, res) => {
    try { fn(req, res); } catch (e) {
      if (e instanceof BankError) return res.status(e.status).json({ ok: false, message: e.message });
      console.error(e); res.status(500).json({ ok: false, message: 'Erro interno. Tente novamente.' });
    }
  };
  const state = (u) => bank.accountState(u);
  const body = (req) => req.body || {};

  app.get('/health', (_q, res) => res.json({ status: 'ok', bank: 'Armin Bank', time: new Date().toISOString() }));

  app.post('/api/login', wrap((req, res) => {
    const { token, user } = bank.login(body(req).username, body(req).password);
    res.json({ ok: true, token, state: state(user) });
  }));
  app.post('/api/register', wrap((req, res) => {
    const { token, user } = bank.register(body(req));
    rt.masters();
    res.json({ ok: true, token, state: state(user) });
  }));
  app.post('/api/logout', auth, wrap((req, res) => { bank.logout(req.token); res.json({ ok: true }); }));
  app.get('/api/me', auth, wrap((req, res) => res.json({ ok: true, state: state(req.user) })));

  app.post('/api/password', auth, wrap((req, res) => {
    const token = bank.changePassword(req.user, body(req).current, body(req).next);
    res.json({ ok: true, token, message: 'Senha alterada.', state: state(req.user) });
  }));

  /* Pix */
  app.post('/api/pix/lookup', auth, wrap((req, res) => res.json({ ok: true, recipient: bank.lookupKey(req.user, body(req).key) })));
  app.post('/api/pix/send', auth, wrap((req, res) => {
    const b = body(req);
    const out = bank.pixSend(req.user, { key: b.key, amount: b.amount, description: b.description });
    rt.users(out.affected.filter((id) => id !== req.user.id));
    res.json({ ok: true, message: 'Pix enviado com sucesso.', tx: out.tx, state: state(req.user) });
  }));
  app.post('/api/pix/key', auth, wrap((req, res) => {
    const key = bank.addKey(req.user, body(req));
    res.json({ ok: true, key, state: state(req.user) });
  }));
  app.delete('/api/pix/key/:id', auth, wrap((req, res) => { bank.removeKey(req.user, req.params.id); res.json({ ok: true, state: state(req.user) }); }));

  /* Cartão e crédito */
  app.post('/api/card/toggle', auth, wrap((req, res) => { bank.toggleCard(req.user); res.json({ ok: true, state: state(req.user) }); }));
  app.get('/api/card/secret', auth, wrap((req, res) => res.json({ ok: true, card: bank.cardSecret(req.user) })));
  app.post('/api/card/purchase', auth, wrap((req, res) => { bank.cardPurchase(req.user, body(req)); res.json({ ok: true, state: state(req.user) }); }));
  app.post('/api/credit/draw', auth, wrap((req, res) => { bank.creditDraw(req.user, body(req).amount); res.json({ ok: true, state: state(req.user) }); }));
  app.post('/api/credit/pay', auth, wrap((req, res) => { bank.payInvoice(req.user, body(req).amount); res.json({ ok: true, state: state(req.user) }); }));
  app.post('/api/credit/request', auth, wrap((req, res) => {
    bank.creditRequest(req.user, body(req)); rt.masters();
    res.json({ ok: true, message: 'Análise enviada para o Armin Master.', state: state(req.user) });
  }));

  /* Cofrinho e bônus */
  app.post('/api/savings/:dir', auth, wrap((req, res) => {
    if (!['in', 'out'].includes(req.params.dir)) return res.status(400).json({ ok: false, message: 'Operação inválida.' });
    bank.savingsMove(req.user, req.params.dir, body(req).amount);
    res.json({ ok: true, state: state(req.user) });
  }));
  app.post('/api/bonus', auth, wrap((req, res) => {
    const reward = bank.claimBonus(req.user);
    res.json({ ok: true, reward, state: state(req.user) });
  }));

  /* Notificações e suporte */
  app.post('/api/notifications/read', auth, wrap((req, res) => { bank.markRead(req.user); res.json({ ok: true, state: state(req.user) }); }));
  app.post('/api/support/messages', auth, wrap((req, res) => {
    const message = bank.supportSend(req.user, body(req).text);
    rt.masters();
    res.json({ ok: true, message, state: state(req.user) });
  }));

  /* Master */
  app.get('/api/master/overview', auth, admin, wrap((_req, res) => res.json({ ok: true, ...bank.masterOverview() })));
  app.post('/api/master/credit/:id/:action', auth, admin, wrap((req, res) => {
    const { request, target } = bank.creditDecide(req.params.id, req.params.action, body(req).note);
    if (target) rt.users([target.id]);
    res.json({ ok: true, request });
  }));
  app.post('/api/master/support/reply', auth, admin, wrap((req, res) => {
    const { message, target } = bank.supportReply(body(req).userId, body(req).text);
    rt.users([target.id]);
    res.json({ ok: true, message });
  }));
  app.post('/api/master/deposit', auth, admin, wrap((req, res) => {
    const target = bank.masterDeposit(body(req).userId, body(req).amount, body(req).note);
    rt.users([target.id]);
    res.json({ ok: true });
  }));
}

module.exports = { registerRoutes };

/* ---------- inicialização (só quando executado diretamente) ---------- */
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
      [...new Set(ids)].forEach((id) => {
        const u = bank.byId(id); if (!u) return;
        io.to(`user:${id}`).emit('account:updated', { state: bank.accountState(u) });
      });
      io.to('masters').emit('master:refresh');
    },
    masters() { io.to('masters').emit('master:refresh'); },
  };

  io.use((socket, next) => {
    const u = bank.userFromToken(socket.handshake.auth && socket.handshake.auth.token);
    if (!u) return next(new Error('AUTH'));
    socket.data.userId = u.id; socket.data.role = u.role; next();
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === 'admin') socket.join('masters');
  });

  registerRoutes(app, bank, rt);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'Rota não encontrada.' }));
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => console.log(`Armin Bank online na porta ${PORT}`));
}
