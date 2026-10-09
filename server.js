'use strict';
const path = require('path');
const { createBank } = require('./bank');

function registerRoutes(app, bank, rt) {
  const auth = (req, res, next) => {
    const token = req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const user = token && bank.userFromToken(token);
    if (!user) return res.status(401).json({ ok: false, message: 'Não autenticado' });
    req.user = user;
    next();
  };

  const admin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, message: 'Acesso negado' });
    next();
  };

  app.post('/api/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      const result = bank.login(username, password);
      res.json({ ok: true, token: result.token });
    } catch (e) {
      res.status(401).json({ ok: false, message: e.message });
    }
  });

  app.post('/api/register', (req, res) => {
    try {
      const result = bank.register(req.body);
      res.json({ ok: true, user: result.user });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  app.get('/api/me', auth, (req, res) => {
    const state = bank.accountState(req.user);
    const safeState = JSON.parse(JSON.stringify(state));
    if (safeState.user) delete safeState.user.password;
    res.json({ ok: true, state: safeState });
  });

  app.get('/api/master/overview', auth, admin, (req, res) => {
    res.json({ ok: true, ...bank.masterOverview() });
  });

  app.post('/api/pix/send', auth, (req, res) => {
    try {
      const { key, amount, description } = req.body || {};
      bank.pixSend(req.user, { key, amount, description });
      res.json({ ok: true });
      if (rt && rt.users) {
        const recipient = bank.lookupKey(req.user, key);
        rt.users([req.user.id, recipient ? recipient.id : '']);
      }
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  app.post('/api/savings/:dir', auth, (req, res) => {
    try {
      const { dir } = req.params;
      if (dir !== 'in' && dir !== 'out') return res.status(400).json({ ok: false });
      const { amount } = req.body || {};
      bank.savingsMove(req.user, dir, amount);
      res.json({ ok: true });
      if (rt && rt.users) rt.users([req.user.id]);
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  app.get('/api/card/secret', auth, (req, res) => {
    res.json({ ok: true, card: { cvv: req.user.cvv || '123', number: req.user.cardNumber } });
  });

  app.delete('/api/pix/key/:id', auth, (req, res) => {
    try {
      bank.removeKey(req.user, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });
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
