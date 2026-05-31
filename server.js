const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = 'db.json';
let db = {
    users: [
        { id: 1, username: 'master', password: 'master', role: 'admin', balance: 0, coins: 9999999, lastAirdrop: 0 },
        { id: 2, username: 'user', password: '123', role: 'user', balance: 15750, coins: 8250, lastAirdrop: 0 }
    ],
    products: [
        { id: 101, name: 'Ghost Card', price: 500, rarity: 'lendario', image: 'https://telegra.ph/file/6b3c8f8f8f8f8f8f8.png' } 
    ],
    codes: [],
    requests: []
};

// Carregar DB
if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) { console.log("Erro ao ler DB, resetando."); }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Socket.io para atualizar loja em tempo real
io.on('connection', (socket) => {
    socket.emit('refresh_store', db.products);
});

function broadcastStore() {
    io.emit('refresh_store', db.products);
}

// --- ROTAS ---

// Loginapp.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        const { password, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } else {
        res.json({ success: false, message: 'Usuário ou senha incorretos.' });
    }
});

// Registro (SEMPRE cria como 'user', nunca 'admin')
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (db.users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Usuário já existe.' });
    }
    const newUser = { id: Date.now(), username, password, role: 'user', balance: 0, coins: 50, lastAirdrop: 0 };
    db.users.push(newUser);
    saveDB();
    res.json({ success: true, message: 'Conta criada! Faça login.' });
});

// --- ADMIN (MASTER) ---

app.post('/api/admin/add-product', (req, res) => {
    const { name, price, rarity, image } = req.body;
    db.products.push({ id: Date.now(), name, price: Number(price), rarity, image });
    saveDB();
    broadcastStore();
    res.json({ success: true });
});

app.post('/api/admin/gen-code', (req, res) => {
    const { value } = req.body;
    const code = 'GHOST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    db.codes.push({ code, value: Number(value), used: false });
    saveDB();
    res.json({ success: true, code: code });
});

app.get('/api/admin/requests', (req, res) => {
    res.json(db.requests.filter(r => r.status === 'pending'));
});

app.post('/api/admin/handle-request', (req, res) => {
    const { reqId, action } = req.body;
    const reqObj = db.requests.find(r => r.id === reqId);
    if (reqObj) {
        reqObj.status = action;        if (action === 'approve') {
            const user = db.users.find(u => u.id === reqObj.userId);
            if (user) user.coins += Number(reqObj.amount);
        }
        saveDB();
        res.json({ success: true });
    }
});

// --- USUÁRIO ---

app.post('/api/buy', (req, res) => {
    const { userId, productId } = req.body;
    const product = db.products.find(p => p.id === productId);
    const user = db.users.find(u => u.id === userId);
    
    if (user && product) {
        if (user.coins >= product.price) {
            user.coins -= product.price;
            saveDB();
            res.json({ success: true, newCoins: user.coins, itemName: product.name });
        } else {
            res.json({ success: false, message: 'Saldo insuficiente!' });
        }
    } else {
        res.json({ success: false, message: 'Erro no produto.' });
    }
});

app.post('/api/redeem', (req, res) => {
    const { userId, code } = req.body;
    const codeObj = db.codes.find(c => c.code === code && !c.used);
    if (codeObj) {
        codeObj.used = true;
        const user = db.users.find(u => u.id === userId);
        if (user) {
            user.coins += codeObj.value;
            saveDB();
            res.json({ success: true, newCoins: user.coins });
        }
    } else {
        res.json({ success: false, message: 'Código inválido ou usado.' });
    }
});

app.post('/api/request-credit', (req, res) => {
    const { userId, username, amount } = req.body;
    db.requests.push({ id: Date.now(), userId, username, amount: Number(amount), status: 'pending' });
    saveDB();
    res.json({ success: true, message: 'Solicitação enviada!' });});

app.post('/api/airdrop', (req, res) => {
    const { userId } = req.body;
    const user = db.users.find(u => u.id === userId);
    const now = Date.now();
    // 24 horas em ms = 86400000. Para teste pode reduzir, mas deixei 1h para não travar testes (3600000)
    // Vou deixar 10 segundos para você testar rápido: 10000
    const cooldown = 10000; 

    if (now - user.lastAirdrop > cooldown) {
        const reward = Math.floor(Math.random() * 100) + 50;
        user.coins += reward;
        user.lastAirdrop = now;
        saveDB();
        res.json({ success: true, reward, newCoins: user.coins });
    } else {
        res.json({ success: false, message: 'Aguarde o próximo airdrop.' });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Ghost Bank Rodando em ${PORT}`));
