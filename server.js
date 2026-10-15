'use strict';
const path = require('path');
const { createBank } = require('./bank');
const multer = require('multer');
const {
  requestMistralAssistant,
  requiresHumanSupport,
  redactSensitive,
  SUPPORT_HANDOFF_REPLY,
  SUPPORT_UNAVAILABLE_REPLY,
} = require('./support-ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)) });
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '599411b1c02c7129d1b0da9bd4634c09';

function registerRoutes(app, bank, rt) {
  const pub = (u) => { if (!u) return null; const c = { ...u }; delete c.password; delete c.token; return c; };
  const put = app.put ? app.put.bind(app) : app.post.bind(app);
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
  const storeManager = (req, res, next) => { if (!['admin','seller'].includes(req.user.role)) return res.status(403).json({ ok:false, message:'Apenas o master ou vendedores podem gerenciar a loja.' }); next(); };

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
  app.post('/api/upload/image', auth, (req, res) => upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ ok:false, message:err.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 32MB.' : 'Envie uma imagem válida.' });
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecione uma imagem primeiro.' });
    try {
      const form = new FormData(); form.append('image', new Blob([req.file.buffer], { type:req.file.mimetype }), req.file.originalname);
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method:'POST', body:form });
      const data = await response.json(); if (!response.ok || !data.success || !data.data || !data.data.url) throw new Error(data.error && data.error.message || 'Não foi possível enviar a imagem.');
      res.json({ ok:true, url:data.data.url, displayUrl:data.data.display_url || data.data.url });
    } catch (e) { res.status(502).json({ ok:false, message:`Erro ao enviar imagem: ${e.message}` }); }
  }));
  app.post('/api/profile/avatar', auth, (req, res) => wrap(res, () => { bank.updateAvatar(req.user, (req.body||{}).avatarUrl); res.json({ ok:true, ...st(req.user) }); }));
  app.post('/api/profile/name', auth, (req, res) => wrap(res, () => { bank.updateProfileName(req.user, (req.body||{}).fullName); res.json({ ok:true, ...st(req.user) }); }));

  app.post('/api/referral/apply', auth, (req, res) => wrap(res, () => { const r = bank.applyReferral(req.user, (req.body||{}).code); res.json({ ok: true, reward: r.reward, ...st(req.user) }); }));

  app.post('/api/pix/lookup', auth, (req, res) => { const d = req.body || {}; const target = bank.parsePixTarget(d.key); const u = bank.lookupKey(req.user, target.key); if (!u) return res.status(404).json({ ok: false, message: 'Chave não encontrada em nenhuma conta desta rede.' }); res.json({ ok: true, key:target.key, amount:target.amount, recipient: pub(u) }); });
  app.post('/api/pix/send', auth, (req, res) => { const d = req.body || {}; const target = bank.parsePixTarget(d.key); const rec = bank.lookupKey(req.user, target.key); if (!rec) return res.status(404).json({ ok:false, message:'Chave não encontrada em nenhuma conta desta rede.' }); return wrap(res, () => { bank.pixSend(req.user, d); res.json({ ok: true, ...st(req.user) }); emit([req.user.id, rec.id]); }); });
  app.post('/api/pix/key', auth, (req, res) => wrap(res, () => { bank.addKey(req.user, req.body || {}); res.json({ ok: true, ...st(req.user) }); }));
  app.delete('/api/pix/key/:keyId', auth, (req, res) => wrap(res, () => { bank.removeKey(req.user, req.params.keyId); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/pix/installment/pay', auth, (req, res) => wrap(res, () => { bank.payInstallment(req.user, (req.body||{}).loanId); res.json({ ok: true, ...st(req.user) }); }));

  app.post('/api/savings/:dir', auth, (req, res) => wrap(res, () => { const d = req.params.dir; if (d !== 'in' && d !== 'out') return res.status(400).json({ ok: false, message: 'Direção inválida.' }); bank.savingsMove(req.user, d, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); emit([req.user.id]); }));

  app.get('/api/card/secret', auth, (req, res) => res.json({ ok: true, card: { number: req.user.cardNumber, cvv: req.user.cvv, expiry: req.user.expiry || '12/29', holder: req.user.fullName } }));
  app.post('/api/card/black/request', auth, (req, res) => wrap(res, () => { bank.requestBlackCard(req.user); res.json({ ok:true, message:'Solicitação de Cartão Black enviada para análise.', ...st(req.user) }); }));
  app.post('/api/card/toggle', auth, (req, res) => wrap(res, () => { bank.toggleCard(req.user); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/card/purchase', auth, (req, res) => wrap(res, () => { const d = req.body || {}; bank.cardPurchase(req.user, d); res.json({ ok: true, ...st(req.user) }); }));

  app.post('/api/credit/pay', auth, (req, res) => wrap(res, () => { bank.payInvoice(req.user, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/credit/draw', auth, (req, res) => wrap(res, () => { bank.creditDraw(req.user, (req.body||{}).amount); res.json({ ok: true, ...st(req.user) }); }));
  app.post('/api/credit/pre-approved/accept', auth, (req, res) => wrap(res, () => { const limit = bank.acceptPreApproved(req.user); res.json({ ok:true, limit, ...st(req.user) }); }));
  app.post('/api/credit/request', auth, (req, res) => wrap(res, () => { const d = req.body || {}; bank.creditRequest(req.user, d); res.json({ ok: true, message: 'Análise enviada para o master.', ...st(req.user) }); }));
  app.get('/api/loans', auth, (req, res) => res.json({ ok:true, ...st(req.user) }));
  app.post('/api/loans/request', auth, (req, res) => wrap(res, () => { bank.loanRequest(req.user, req.body || {}); res.json({ ok:true, message:'Solicitação de empréstimo enviada para análise.', ...st(req.user) }); }));
  app.post('/api/loans/:loanId/pay', auth, (req, res) => wrap(res, () => { bank.loanPay(req.user, req.params.loanId); res.json({ ok:true, ...st(req.user) }); }));
  app.get('/api/vehicles', auth, (req, res) => res.json({ ok:true, vehicles:bank.vehicles(), financings:bank.accountState(req.user).vehicleFinancings }));
  app.post('/api/vehicles/:vehicleId/finance', auth, (req, res) => wrap(res, () => { bank.requestVehicleFinance(req.user, req.params.vehicleId, req.body || {}); res.json({ ok:true, message:'Financiamento enviado para análise.', ...st(req.user) }); }));
  app.post('/api/vehicle-financing/:financingId/pay', auth, (req, res) => wrap(res, () => { bank.payVehicleFinance(req.user, req.params.financingId); res.json({ ok:true, ...st(req.user) }); }));
  app.post('/api/insurance/life', auth, (req, res) => wrap(res, () => { bank.contractLifeInsurance(req.user, req.body || {}); res.json({ ok:true, message:'Seguro de vida contratado.', ...st(req.user) }); }));

  app.get('/api/support/messages', auth, (req, res) => res.json({ ok: true, messages: bank.accountState(req.user).supportMessages }));
  app.post('/api/support/messages', auth, async (req, res) => {
    const data = req.body || {};
    const rawText = String(data.text || '');
    let userMessage;
    try { userMessage = bank.supportSend(req.user, redactSensitive(rawText)); }
    catch (e) { return res.status(400).json({ ok:false, message:e.message }); }

    let handoff = requiresHumanSupport(rawText, data.forceHuman === true);
    let reply = handoff ? SUPPORT_HANDOFF_REPLY : '';
    if (!handoff) {
      try {
        const result = await requestMistralAssistant(bank.supportHistory(req.user.id));
        if (!result) {
          handoff = true;
          reply = SUPPORT_UNAVAILABLE_REPLY;
        } else if (result.escalate || /encaminh|suporte humano|fale com (?:um|uma) atendente|atendimento humano/i.test(result.reply)) {
          handoff = true;
          reply = SUPPORT_HANDOFF_REPLY;
        } else {
          reply = result.reply;
        }
      } catch (e) {
        handoff = true;
        reply = SUPPORT_UNAVAILABLE_REPLY;
        console.warn(`Assistente Mistral indisponível: ${e.message}`);
      }
    }

    bank.supportAiReply(req.user.id, reply, { userMessageId:userMessage.id, awaitingHuman:handoff });
    emit([req.user.id]);
    if (rt && rt.masters) rt.masters();
    return res.json({ ok:true, ...st(req.user), handoff });
  });
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
  app.post('/api/master/loans/:requestId/:action', auth, admin, (req, res) => wrap(res, () => { const action = req.params.action; if (!['approve','reject'].includes(action)) return res.status(400).json({ ok:false, message:'Decisão inválida.' }); const r = bank.loanDecide(req.user, req.params.requestId, action, (req.body||{}).note); res.json({ ok:true, request:r }); emit([r.userId]); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/vehicles', auth, admin, (req, res) => wrap(res, () => res.json({ ok:true, vehicle:bank.createVehicle(req.user, req.body || {}) })));
  app.post('/api/master/vehicle-financing/:financingId/:action', auth, admin, (req, res) => wrap(res, () => { const action=req.params.action; if (!['approve','reject'].includes(action)) return res.status(400).json({ok:false,message:'Decisão inválida.'}); const f=bank.decideVehicleFinance(req.user,req.params.financingId,action,(req.body||{}).note); res.json({ok:true,financing:f}); emit([f.userId]); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/black-cards/:userId/:action', auth, admin, (req, res) => wrap(res, () => { const action=req.params.action; if (!['approve','reject'].includes(action)) return res.status(400).json({ok:false,message:'Decisão inválida.'}); const u=bank.decideBlackCard(req.user,req.params.userId,action,(req.body||{}).note); res.json({ok:true,user:{id:u.id,blackCardStatus:u.blackCardStatus}}); emit([u.id]); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/support/reply', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.supportReply(d.userId, d.text); res.json({ ok: true }); emit([d.userId]); }));
  app.post('/api/master/deposit', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterDeposit(d.userId, d.amount, d.note); res.json({ ok: true }); emit([d.userId]); }));
  app.post('/api/master/users/:userId/balance', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterAdjustBalance(req.params.userId, d.amount, d.note); res.json({ ok:true }); emit([req.params.userId]); }));
  app.post('/api/master/users/:userId/ban', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterSetBan(req.user, req.params.userId, d.banned !== false, d.note); res.json({ ok:true }); emit([req.params.userId]); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/users/:userId/role', auth, admin, (req, res) => wrap(res, () => { bank.masterSetRole(req.user, req.params.userId, (req.body||{}).role); res.json({ ok:true }); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/users/:userId/credit-limit', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterAdjustCredit(req.params.userId, d.limit, d.note); res.json({ ok:true }); emit([req.params.userId]); if (rt && rt.masters) rt.masters(); }));
  app.post('/api/master/users/:userId/wallet', auth, admin, (req, res) => wrap(res, () => { const d = req.body || {}; bank.masterAdjustWallet(req.params.userId, d.wallet, d.amount, d.note); res.json({ ok:true }); emit([req.params.userId]); if (rt && rt.masters) rt.masters(); }));
  app.get('/api/payments', auth, (req, res) => res.json({ ok:true, ...bank.paymentCatalog(req.user) }));
  app.post('/api/payments/auto-debit', auth, (req, res) => wrap(res, () => { bank.configureAutoDebit(req.user, req.body || {}); res.json({ ok:true, ...st(req.user) }); }));
  app.get('/api/products', auth, (req, res) => res.json({ ok:true, products:bank.products() }));
  app.post('/api/products', auth, storeManager, (req, res) => wrap(res, () => res.json({ ok:true, product:bank.createProduct(req.user, req.body || {}) })));
  put('/api/products/:productId', auth, storeManager, (req, res) => wrap(res, () => res.json({ ok:true, product:bank.updateProduct(req.user, req.params.productId, req.body || {}) })));
  app.delete('/api/products/:productId', auth, storeManager, (req, res) => wrap(res, () => res.json({ ok:true, product:bank.deleteProduct(req.user, req.params.productId) })));
  app.post('/api/products/:productId/purchase', auth, (req, res) => wrap(res, () => { bank.purchaseProduct(req.user, req.params.productId, (req.body||{}).method); res.json({ ok:true, ...st(req.user) }); emit([req.user.id]); }));
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
  app.get('/health', (_req, res) => res.json({ status:'ok', bank:'GhostBank', timestamp:new Date().toISOString() }));

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
  server.listen(PORT, '0.0.0.0', () => console.log(`GhostBank online na porta ${PORT}`));
}
