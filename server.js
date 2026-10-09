const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] },
  pingInterval: 25000,
  pingTimeout: 20000,
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(dataDir, 'db.json');
const sessions = new Map();

const now = () => new Date().toISOString();
const money = (value) => Number(Number(value || 0).toFixed(2));
const id = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const randomKey = () => `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`.toUpperCase();

function seedDatabase() {
  const created = now();
  return {
    version: 2,
    users: [
      {
        id: 'usr_master',
        username: 'master',
        password: 'master',
        fullName: 'Armin Master',
        role: 'admin',
        balance: 0,
        coins: 999999,
        creditLimit: 0,
        creditUsed: 0,
        score: 1000,
        cardNumber: '5298 4000 0099 0001',
        pixKeys: [{ id: 'key_master', type: 'email', value: 'armin@arminbank.rpg', createdAt: created }],
        createdAt: created,
        lastAirdrop: 0,
      },
      {
        id: 'usr_aventureiro',
        username: 'aventureiro',
        password: '1234',
        fullName: 'Lia Aventureira',
        role: 'user',
        balance: 1840.75,
        coins: 1280,
        creditLimit: 3200,
        creditUsed: 450,
        score: 782,
        cardNumber: '5298 4012 2410 7723',
        pixKeys: [
          { id: 'key_lia_email', type: 'email', value: 'lia@aventura.rpg', createdAt: created },
          { id: 'key_lia_random', type: 'aleatória', value: 'ARMIN-7F21-9A42', createdAt: created },
        ],
        createdAt: created,
        lastAirdrop: 0,
      },
    ],
    transactions: [
      { id: 'tx_seed_1', userId: 'usr_aventureiro', type: 'in', title: 'Recompensa de missão', detail: 'Guilda dos Exploradores', amount: 950, status: 'completed', createdAt: created },
      { id: 'tx_seed_2', userId: 'usr_aventureiro', type: 'out', title: 'Pix enviado', detail: 'taberna@rpg', amount: -86.4, status: 'completed', createdAt: created },
      { id: 'tx_seed_3', userId: 'usr_aventureiro', type: 'in', title: 'Bônus do Armin', detail: 'Evento de boas-vindas', amount: 320, status: 'completed', createdAt: created },
      { id: 'tx_seed_4', userId: 'usr_aventureiro', type: 'out', title: 'Compra na loja', detail: 'Poção de mana', amount: -42.9, status: 'completed', createdAt: created },
    ],
    creditRequests: [],
    supportMessages: [
      { id: 'msg_seed_1', userId: 'usr_aventureiro', author: 'Armin Master', role: 'support', text: 'Olá, Lia. Sou o Armin. Posso ajudar com Pix, score ou crédito.', createdAt: created },
    ],
    notifications: [],
  };
}

function normalizeDatabase(input) {
  const base = seedDatabase();
  if (!input || !Array.isArray(input.users)) return base;
  const users = input.users.map((user) => ({
    id: user.id || `usr_${user.username}`,
    username: user.username,
    password: user.password || '1234',
    fullName: user.fullName || (user.username === 'master' ? 'Armin Master' : user.username),
    role: user.role === 'admin' ? 'admin' : 'user',
    balance: money(user.balance),
    coins: Number(user.coins || 0),
    creditLimit: money(user.creditLimit || (user.username === 'master' ? 0 : 2500)),
    creditUsed: money(user.creditUsed),
    score: Number(user.score || (user.username === 'master' ? 1000 : 650)),
    cardNumber: user.cardNumber || `5298 40${String(user.id || Date.now()).slice(-10).padStart(10, '0')}`.slice(0, 19),
    pixKeys: Array.isArray(user.pixKeys) && user.pixKeys.length ? user.pixKeys : [{ id: id('key'), type: 'aleatória', value: `ARMIN-${randomKey()}`, createdAt: now() }],
    createdAt: user.createdAt || now(),
    lastAirdrop: user.lastAirdrop || 0,
  }));
  if (!users.some((user) => user.username === 'master')) users.unshift(base.users[0]);
  if (!users.some((user) => user.username === 'aventureiro')) users.push(base.users[1]);
  return {
    version: 2,
    users,
    transactions: Array.isArray(input.transactions) ? input.transactions : (input.purchases || []).map((purchase) => ({
      id: `tx_${purchase.id || Date.now()}`,
      userId: purchase.buyerId,
      type: 'out',
      title: purchase.productName || 'Compra na loja',
      detail: 'Loja RPG',
      amount: -money(purchase.productPrice),
      status: 'completed',
      createdAt: purchase.date || now(),
    })),
    creditRequests: Array.isArray(input.creditRequests) ? input.creditRequests : (input.requests || []).map((request) => ({
      id: String(request.id || id('credit')),
      userId: request.userId,
      username: request.username,
      amount: money(request.amount),
      purpose: request.type || 'Crédito RPG',
      status: request.status === 'approve' ? 'approved' : request.status === 'reject' ? 'rejected' : 'pending',
      decisionNote: '',
      createdAt: request.date || now(),
      decidedAt: null,
    })),
    supportMessages: Array.isArray(input.supportMessages) ? input.supportMessages : base.supportMessages,
    notifications: Array.isArray(input.notifications) ? input.notifications : [],
  };
}

let db;
try {
  db = normalizeDatabase(fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : null);
} catch (error) {
  console.warn('Banco local inválido, recriando:', error.message);
  db = seedDatabase();
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
saveDB();

function findUserById(userId) {
  return db.users.find((user) => user.id === userId);
}
function findUserByUsername(username) {
  return db.users.find((user) => user.username.toLowerCase() === String(username || '').trim().toLowerCase());
}
function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}
function userTransactions(userId) {
  return db.transactions.filter((item) => item.userId === userId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function userCreditRequests(userId) {
  return db.creditRequests.filter((item) => item.userId === userId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function userSupportMessages(userId) {
  return db.supportMessages.filter((item) => item.userId === userId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
function accountState(user) {
  return {
    user: publicUser(user),
    transactions: userTransactions(user.id).slice(0, 12),
    creditRequests: userCreditRequests(user.id),
    supportMessages: userSupportMessages(user.id),
    unread: db.notifications.filter((item) => item.userId === user.id && !item.read).length,
  };
}
function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  const userId = token && sessions.get(token);
  const user = userId && findUserById(userId);
  if (!user) return res.status(401).json({ ok: false, message: 'Sessão expirada. Entre novamente.' });
  req.currentUser = user;
  req.token = token;
  next();
}
function adminMiddleware(req, res, next) {
  if (req.currentUser.role !== 'admin') return res.status(403).json({ ok: false, message: 'Área exclusiva do Armin Master.' });
  next();
}
function addTransaction(userId, type, title, detail, amount) {
  const transaction = { id: id('tx'), userId, type, title, detail, amount: money(amount), status: 'completed', createdAt: now() };
  db.transactions.push(transaction);
  return transaction;
}
function addNotification(userId, title, text, type = 'info') {
  db.notifications.push({ id: id('note'), userId, title, text, type, read: false, createdAt: now() });
}
function broadcast(event = 'bank:refresh', payload = {}) {
  io.emit(event, { ...payload, at: now() });
}
function emitToUser(userId, event, payload = {}) {
  io.to(`user:${userId}`).emit(event, { ...payload, at: now() });
}

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const userId = token && sessions.get(token);
  socket.user = userId ? findUserById(userId) : null;
  next();
});
io.on('connection', (socket) => {
  socket.emit('bank:status', { online: true, support: true, at: now() });
  if (socket.user) socket.join(`user:${socket.user.id}`);
  socket.on('support:send', (payload = {}, callback = () => {}) => {
    const user = socket.user;
    const text = String(payload.text || '').trim();
    if (!user || !text) return callback({ ok: false, message: 'Mensagem vazia.' });
    const message = { id: id('msg'), userId: user.id, author: user.fullName, role: user.role, text: text.slice(0, 500), createdAt: now() };
    db.supportMessages.push(message);
    saveDB();
    emitToUser(user.id, 'support:new', { message });
    callback({ ok: true, message });
    setTimeout(() => {
      const reply = {
        id: id('msg'), userId: user.id, author: 'Armin Master', role: 'support',
        text: user.role === 'admin' ? 'Painel Master online. Selecione um jogador para acompanhar.' : 'Recebi sua mensagem. Vou conferir seu score e os detalhes da conta. Enquanto isso, fique de olho nas atualizações em tempo real.',
        createdAt: now(),
      };
      db.supportMessages.push(reply);
      saveDB();
      emitToUser(user.id, 'support:new', { message: reply });
    }, 900);
  });
  socket.on('support:reply', (payload = {}, callback = () => {}) => {
    const user = socket.user;
    const targetUserId = String(payload.userId || '');
    const text = String(payload.text || '').trim();
    if (!user || user.role !== 'admin' || !targetUserId || !text) return callback({ ok: false, message: 'Ação não autorizada.' });
    const target = findUserById(targetUserId);
    if (!target) return callback({ ok: false, message: 'Jogador não encontrado.' });
    const message = { id: id('msg'), userId: target.id, author: 'Armin Master', role: 'support', text: text.slice(0, 500), createdAt: now() };
    db.supportMessages.push(message);
    saveDB();
    emitToUser(target.id, 'support:new', { message });
    callback({ ok: true, message });
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok', bank: 'Armin Bank RPG', realtime: true, timestamp: now() }));
app.get('/api/public-config', (_req, res) => res.json({ ok: true, demo: true, websocket: true, bankName: 'Armin Bank' }));

app.post('/api/login', (req, res) => {
  const user = findUserByUsername(req.body.username);
  if (!user || user.password !== String(req.body.password || '')) return res.status(401).json({ ok: false, message: 'Usuário ou senha inválidos.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  res.json({ ok: true, token, state: accountState(user) });
});
app.post('/api/logout', authMiddleware, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});
app.get('/api/me', authMiddleware, (req, res) => res.json({ ok: true, state: accountState(req.currentUser) }));
app.get('/api/dashboard', authMiddleware, (req, res) => res.json({ ok: true, state: accountState(req.currentUser) }));

app.post('/api/pix/key', authMiddleware, (req, res) => {
  const user = req.currentUser;
  const type = String(req.body.type || 'aleatória');
  const value = type === 'email' ? String(req.body.value || '').trim().toLowerCase() : `ARMIN-${randomKey()}`;
  if (type === 'email' && (!value.includes('@') || value.length < 5)) return res.status(400).json({ ok: false, message: 'Informe um e-mail válido para a chave.' });
  if (user.pixKeys.some((key) => key.value === value)) return res.status(400).json({ ok: false, message: 'Essa chave já está cadastrada.' });
  const key = { id: id('key'), type, value, createdAt: now() };
  user.pixKeys.push(key);
  saveDB();
  broadcast('bank:refresh', { kind: 'pix-key' });
  res.json({ ok: true, key, state: accountState(user) });
});
app.delete('/api/pix/key/:keyId', authMiddleware, (req, res) => {
  const user = req.currentUser;
  if (user.pixKeys.length <= 1) return res.status(400).json({ ok: false, message: 'Mantenha ao menos uma chave Pix.' });
  user.pixKeys = user.pixKeys.filter((key) => key.id !== req.params.keyId);
  saveDB();
  res.json({ ok: true, state: accountState(user) });
});
app.post('/api/pix/send', authMiddleware, (req, res) => {
  const user = req.currentUser;
  const amount = money(req.body.amount);
  const recipientKey = String(req.body.recipientKey || '').trim();
  const description = String(req.body.description || 'Transferência Pix').trim().slice(0, 80) || 'Transferência Pix';
  if (!recipientKey) return res.status(400).json({ ok: false, message: 'Informe a chave Pix de destino.' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ ok: false, message: 'Digite um valor válido.' });
  if (amount > user.balance) return res.status(400).json({ ok: false, message: 'Saldo insuficiente para este Pix.' });
  user.balance = money(user.balance - amount);
  const transaction = addTransaction(user.id, 'out', 'Pix enviado', description, -amount);
  addNotification(user.id, 'Pix enviado', `R$ ${amount.toFixed(2).replace('.', ',')} para ${recipientKey}`, 'success');
  saveDB();
  broadcast('bank:refresh', { kind: 'pix' });
  emitToUser(user.id, 'account:updated', { state: accountState(user) });
  res.json({ ok: true, message: 'Pix simulado enviado com sucesso.', transaction, state: accountState(user) });
});

app.post('/api/airdrop', authMiddleware, (req, res) => {
  const user = req.currentUser;
  const cooldown = 20 * 60 * 60 * 1000;
  if (Date.now() - Number(user.lastAirdrop || 0) < cooldown) return res.status(400).json({ ok: false, message: 'Seu bônus diário ainda está recarregando.' });
  const reward = Math.floor(Math.random() * 180) + 120;
  user.coins += reward;
  user.lastAirdrop = Date.now();
  addTransaction(user.id, 'in', 'Bônus do Armin', 'Recompensa RPG', reward);
  saveDB();
  broadcast('bank:refresh', { kind: 'reward' });
  emitToUser(user.id, 'account:updated', { state: accountState(user) });
  res.json({ ok: true, reward, state: accountState(user) });
});

app.post('/api/credit/request', authMiddleware, (req, res) => {
  const user = req.currentUser;
  const amount = money(req.body.amount);
  const purpose = String(req.body.purpose || 'Evolução da jornada').trim().slice(0, 100);
  if (!Number.isFinite(amount) || amount < 100 || amount > 20000) return res.status(400).json({ ok: false, message: 'Peça entre R$ 100 e R$ 20.000.' });
  if (db.creditRequests.some((request) => request.userId === user.id && request.status === 'pending')) return res.status(400).json({ ok: false, message: 'Você já tem uma análise aguardando o Armin.' });
  const request = { id: id('credit'), userId: user.id, username: user.username, fullName: user.fullName, amount, purpose, score: user.score, status: 'pending', decisionNote: '', createdAt: now(), decidedAt: null };
  db.creditRequests.push(request);
  saveDB();
  broadcast('credit:updated', { kind: 'new-request' });
  emitToUser(user.id, 'account:updated', { state: accountState(user) });
  res.json({ ok: true, message: 'Análise enviada para o Armin Master.', request, state: accountState(user) });
});

app.get('/api/credit/requests', authMiddleware, (req, res) => res.json({ ok: true, requests: userCreditRequests(req.currentUser.id) }));
app.get('/api/support/messages', authMiddleware, (req, res) => res.json({ ok: true, messages: userSupportMessages(req.currentUser.id) }));
app.post('/api/support/messages', authMiddleware, (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, message: 'Escreva uma mensagem.' });
  const message = { id: id('msg'), userId: req.currentUser.id, author: req.currentUser.fullName, role: req.currentUser.role, text: text.slice(0, 500), createdAt: now() };
  db.supportMessages.push(message);
  saveDB();
  emitToUser(req.currentUser.id, 'support:new', { message });
  res.json({ ok: true, message });
});

app.get('/api/master/overview', authMiddleware, adminMiddleware, (_req, res) => {
  const players = db.users.filter((user) => user.role !== 'admin');
  res.json({
    ok: true,
    metrics: {
      players: players.length,
      pendingCredits: db.creditRequests.filter((request) => request.status === 'pending').length,
      moneyInPlay: money(players.reduce((sum, user) => sum + user.balance, 0)),
      avgScore: players.length ? Math.round(players.reduce((sum, user) => sum + user.score, 0) / players.length) : 0,
    },
    pending: db.creditRequests.filter((request) => request.status === 'pending').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    users: players.map(publicUser),
    support: db.supportMessages.slice(-30).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  });
});
app.post('/api/master/credit/:requestId/:action', authMiddleware, adminMiddleware, (req, res) => {
  const request = db.creditRequests.find((item) => item.id === req.params.requestId);
  if (!request || request.status !== 'pending') return res.status(404).json({ ok: false, message: 'Análise não encontrada ou já decidida.' });
  const action = req.params.action;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ ok: false, message: 'Decisão inválida.' });
  const target = findUserById(request.userId);
  request.status = action === 'approve' ? 'approved' : 'rejected';
  request.decisionNote = String(req.body.note || (action === 'approve' ? 'Aprovado pelo Armin Master.' : 'Reprovado nesta rodada. Continue evoluindo seu score.')).slice(0, 200);
  request.decidedAt = now();
  if (target) {
    if (action === 'approve') {
      target.creditLimit = money(Math.max(target.creditLimit, request.amount));
      addNotification(target.id, 'Crédito aprovado', `Seu limite RPG foi atualizado para R$ ${target.creditLimit.toFixed(2).replace('.', ',')}.`, 'success');
    } else {
      addNotification(target.id, 'Análise encerrada', request.decisionNote, 'warning');
    }
  }
  saveDB();
  broadcast('credit:updated', { kind: action, requestId: request.id });
  if (target) emitToUser(target.id, 'account:updated', { state: accountState(target) });
  res.json({ ok: true, request, target: target && publicUser(target) });
});
app.post('/api/master/support/reply', authMiddleware, adminMiddleware, (req, res) => {
  const target = findUserById(req.body.userId);
  const text = String(req.body.text || '').trim();
  if (!target || !text) return res.status(400).json({ ok: false, message: 'Jogador e mensagem são obrigatórios.' });
  const message = { id: id('msg'), userId: target.id, author: 'Armin Master', role: 'support', text: text.slice(0, 500), createdAt: now() };
  db.supportMessages.push(message);
  saveDB();
  emitToUser(target.id, 'support:new', { message });
  res.json({ ok: true, message });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Armin Bank RPG online na porta ${PORT}`);
  console.log(`WebSocket ativo | Banco local: ${DB_FILE}`);
});
