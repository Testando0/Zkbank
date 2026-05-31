const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'db.json');
let db;

// Sessions em memória: token -> userId
const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Inicializa DB
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE));
    if (!db.users.find(u => u.username === 'master')) {
        db.users.unshift({ id: 1, username: 'master', password: 'master', role: 'admin', balance: 0, coins: 9999999, lastAirdrop: 0 });
        saveDB();
    }
} else {
    db = {
        users: [
            { id: 1, username: 'master', password: 'master', role: 'admin', balance: 0, coins: 9999999, lastAirdrop: 0 }
        ],
        products: [],
        codes: [],
        requests: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Middlewares de auth
function authMiddleware(req, res, next) {
    const h = req.headers['authorization'];
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ ok: false, msg: 'Não autenticado.' });
    const token = h.substring(7);
    const userId = sessions[token];
    if (!userId) return res.status(401).json({ ok: false, msg: 'Sessão expirada. Faça login.' });
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ ok: false, msg: 'Usuário não encontrado.' });
    req.currentUser = user;
    req.token = token;
    next();
}

function adminMiddleware(req, res, next) {
    if (req.currentUser.role !== 'admin') return res.status(403).json({ ok: false, msg: 'Acesso negado.' });
    next();
}

// Socket.io
io.on('connection', (socket) => {
    socket.emit('refresh_data', {
        products: db.products,
        requests: db.requests.filter(r => r.status === 'pending')
    });
});

function broadcastUpdate() {
    io.emit('refresh_data', {
        products: db.products,
        requests: db.requests.filter(r => r.status === 'pending')
    });
}

// ─── ROTAS PÚBLICAS ───────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.json({ ok: false, msg: 'Usuário ou senha inválidos.' });
    const token = generateToken();
    sessions[token] = user.id;
    const { password: _, ...safeUser } = user;
    res.json({ ok: true, user: safeUser, token });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, msg: 'Preencha tudo.' });
    if (username.toLowerCase() === 'master') return res.json({ ok: false, msg: 'Nome reservado.' });
    if (db.users.find(u => u.username === username)) return res.json({ ok: false, msg: 'Usuário já existe.' });
    const newUser = { id: Date.now(), username, password, role: 'user', balance: 0, coins: 50, lastAirdrop: 0 };
    db.users.push(newUser);
    saveDB();
    res.json({ ok: true, msg: 'Conta criada! Faça login.' });
});

app.post('/api/logout', authMiddleware, (req, res) => {
    delete sessions[req.token];
    res.json({ ok: true });
});

app.get('/api/products', (req, res) => res.json(db.products));

// ─── ROTAS USUÁRIO (autenticadas) ────────────────────────────
app.post('/api/buy', authMiddleware, (req, res) => {
    const { productId } = req.body;
    const u = req.currentUser;
    const p = db.products.find(x => x.id === Number(productId));
    if (!p) return res.json({ ok: false, msg: 'Produto não encontrado.' });
    if (u.coins < p.price) return res.json({ ok: false, msg: 'Saldo insuficiente!' });
    u.coins -= p.price;
    saveDB();
    res.json({ ok: true, coins: u.coins, name: p.name });
});

app.post('/api/redeem', authMiddleware, (req, res) => {
    const { code } = req.body;
    const c = db.codes.find(x => x.code === code && !x.used);
    if (!c) return res.json({ ok: false, msg: 'Código inválido ou já usado.' });
    c.used = true;
    req.currentUser.coins += c.value;
    saveDB();
    res.json({ ok: true, coins: req.currentUser.coins, value: c.value });
});

app.post('/api/request_credit', authMiddleware, (req, res) => {
    const { amount, type } = req.body;
    const u = req.currentUser;
    db.requests.push({
        id: Date.now(),
        userId: u.id,
        username: u.username,
        amount: Number(amount),
        type: type || 'credit',
        status: 'pending',
        date: new Date().toLocaleString('pt-BR')
    });
    saveDB();
    broadcastUpdate();
    res.json({ ok: true, msg: 'Solicitação enviada! Aguarde aprovação.' });
});

app.post('/api/airdrop', authMiddleware, (req, res) => {
    const u = req.currentUser;
    const now = Date.now();
    const cooldown = 86400000; // 24h
    if (now - (u.lastAirdrop || 0) < cooldown) {
        const remaining = Math.ceil((cooldown - (now - u.lastAirdrop)) / 3600000);
        return res.json({ ok: false, msg: `Volte em ${remaining}h para o próximo airdrop.` });
    }
    const reward = Math.floor(Math.random() * 200) + 100;
    u.coins += reward;
    u.lastAirdrop = now;
    saveDB();
    res.json({ ok: true, reward, coins: u.coins });
});

app.get('/api/me', authMiddleware, (req, res) => {
    const { password: _, ...safeUser } = req.currentUser;
    res.json({ ok: true, user: safeUser });
});

// ─── ROTAS ADMIN (autenticadas + admin) ──────────────────────
app.post('/api/admin/product', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, rarity, image } = req.body;
    if (!name || !price) return res.json({ ok: false, msg: 'Nome e preço obrigatórios.' });
    db.products.push({ id: Date.now(), name, price: Number(price), rarity: rarity || 'comum', image: image || '' });
    saveDB();
    broadcastUpdate();
    res.json({ ok: true });
});

app.delete('/api/admin/product/:id', authMiddleware, adminMiddleware, (req, res) => {
    db.products = db.products.filter(p => p.id !== Number(req.params.id));
    saveDB();
    broadcastUpdate();
    res.json({ ok: true });
});

app.post('/api/admin/code', authMiddleware, adminMiddleware, (req, res) => {
    const { value } = req.body;
    if (!value || isNaN(value)) return res.json({ ok: false, msg: 'Valor inválido.' });
    const code = 'GHOST-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    db.codes.push({ code, value: Number(value), used: false });
    saveDB();
    res.json({ ok: true, code });
});

app.get('/api/admin/requests', authMiddleware, adminMiddleware, (req, res) => {
    res.json(db.requests.filter(r => r.status === 'pending'));
});

app.post('/api/admin/request_action', authMiddleware, adminMiddleware, (req, res) => {
    const { reqId, action } = req.body;
    const r = db.requests.find(x => x.id === Number(reqId));
    if (!r) return res.json({ ok: false, msg: 'Solicitação não encontrada.' });
    r.status = action;
    if (action === 'approve') {
        const u = db.users.find(x => x.id === r.userId);
        if (u) u.coins += Number(r.amount);
    }
    saveDB();
    broadcastUpdate();
    res.json({ ok: true });
});

app.post('/api/admin/user', authMiddleware, adminMiddleware, (req, res) => {
    const { username, password, coins } = req.body;
    if (!username || !password) return res.json({ ok: false, msg: 'Usuário e senha obrigatórios.' });
    if (db.users.find(u => u.username === username)) return res.json({ ok: false, msg: 'Usuário já existe.' });
    const newUser = { id: Date.now(), username, password, role: 'user', balance: 0, coins: Number(coins) || 0, lastAirdrop: 0 };
    db.users.push(newUser);
    saveDB();
    res.json({ ok: true, msg: `Usuário ${username} criado com sucesso.` });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const safeUsers = db.users.filter(u => u.role !== 'admin').map(({ password: _, ...u }) => u);
    res.json(safeUsers);
});

app.delete('/api/admin/user/:id', authMiddleware, adminMiddleware, (req, res) => {
    db.users = db.users.filter(u => u.id !== Number(req.params.id));
    saveDB();
    res.json({ ok: true });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Ghost Bank Online na porta ${PORT}`));
