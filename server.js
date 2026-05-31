const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = 'db.json';
let db;

// Inicializa ou Carrega DB
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE));
} else {
    db = {
        users: [
            { id: 1, username: 'master', password: 'master', role: 'admin', balance: 0, coins: 9999999, lastAirdrop: 0 }
        ],
        products: [
            { id: 99, name: 'Ghost Card Black', price: 5000, rarity: 'lendario', image: 'https://telegra.ph/file/6b3c8f8f8f8f8f8f8.png' }
        ],
        codes: [],
        requests: [] // Pedidos de crédito e Pix
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Socket.io: Notificações em tempo real
io.on('connection', (socket) => {
    console.log('Cliente conectado');
    socket.emit('refresh_data', { products: db.products, requests: db.requests.filter(r => r.status === 'pending') });
});

function broadcastUpdate() {
    io.emit('refresh_data', { 
        products: db.products, 
        requests: db.requests.filter(r => r.status === 'pending') 
    });
}
// --- ROTAS PÚBLICAS ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        // Não envia senha
        const { password: _, ...safeUser } = user;
        res.json({ ok: true, user: safeUser });
    } else {
        res.json({ ok: false, msg: 'Usuário ou senha inválidos.' });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, msg: 'Preencha tudo.' });
    if (username.toLowerCase() === 'master') return res.json({ ok: false, msg: 'Nome reservado.' });
    if (db.users.find(u => u.username === username)) return res.json({ ok: false, msg: 'Usuário existe.' });
    
    const newUser = { id: Date.now(), username, password, role: 'user', balance: 0, coins: 50, lastAirdrop: 0 };
    db.users.push(newUser);
    saveDB();
    res.json({ ok: true, msg: 'Conta criada! Faça login.' });
});

app.get('/api/products', (req, res) => res.json(db.products));

// --- ROTAS USUÁRIO ---

app.post('/api/buy', (req, res) => {
    const { userId, productId } = req.body;
    const u = db.users.find(x => x.id === userId);
    const p = db.products.find(x => x.id === productId);
    
    if (!u || !p) return res.json({ ok: false, msg: 'Erro interno.' });
    if (u.coins < p.price) return res.json({ ok: false, msg: 'Saldo insuficiente!' });
    
    u.coins -= p.price;
    saveDB();
    res.json({ ok: true, coins: u.coins, name: p.name });
});

app.post('/api/redeem', (req, res) => {
    const { userId, code } = req.body;
    const c = db.codes.find(x => x.code === code && !x.used);
    if (!c) return res.json({ ok: false, msg: 'Código inválido.' });
    
    c.used = true;
    const u = db.users.find(x => x.id === userId);    if (u) { u.coins += c.value; saveDB(); }
    res.json({ ok: true, coins: u ? u.coins : 0 });
});

app.post('/api/request_credit', (req, res) => {
    const { userId, username, amount, type } = req.body; // type: 'credit' or 'pix'
    db.requests.push({ 
        id: Date.now(), 
        userId, 
        username, 
        amount: Number(amount), 
        type: type || 'credit', 
        status: 'pending',
        date: new Date().toLocaleString()
    });
    saveDB();
    broadcastUpdate(); // Avisa o Master na hora
    res.json({ ok: true, msg: 'Solicitação enviada!' });
});

app.post('/api/airdrop', (req, res) => {
    const { userId } = req.body;
    const u = db.users.find(x => x.id === userId);
    if (!u) return res.json({ ok: false });
    
    const now = Date.now();
    // 24 horas = 86400000ms. Para teste rápido deixe 10000 (10s), depois mude para 86400000
    const cooldown = 86400000; 

    if (now - u.lastAirdrop < cooldown) {
        const remaining = Math.ceil((cooldown - (now - u.lastAirdrop)) / 3600000);
        return res.json({ ok: false, msg: `Volte em ${remaining} horas.` });
    }
    
    const reward = Math.floor(Math.random() * 200) + 100;
    u.coins += reward;
    u.lastAirdrop = now;
    saveDB();
    res.json({ ok: true, reward, coins: u.coins });
});

// --- ROTAS ADMIN (MASTER) ---

app.post('/api/admin/product', (req, res) => {
    const { name, price, rarity, image } = req.body;
    db.products.push({ id: Date.now(), name, price: Number(price), rarity, image });
    saveDB();
    broadcastUpdate();
    res.json({ ok: true });
});
app.post('/api/admin/code', (req, res) => {
    const { value } = req.body;
    const code = 'GHOST-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    db.codes.push({ code, value: Number(value), used: false });
    saveDB();
    res.json({ ok: true, code });
});

app.get('/api/admin/requests', (req, res) => {
    res.json(db.requests.filter(r => r.status === 'pending'));
});

app.post('/api/admin/request_action', (req, res) => {
    const { reqId, action } = req.body;
    const r = db.requests.find(x => x.id === reqId);
    if (r) {
        r.status = action; // 'approve' or 'deny'
        if (action === 'approve') {
            const u = db.users.find(x => x.id === r.userId);
            if (u) u.coins += Number(r.amount);
        }
        saveDB();
        broadcastUpdate();
    }
    res.json({ ok: true });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Ghost Bank Online: ${PORT}`));
