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

// --- BANCO DE DADOS EM ARQUIVO (Persistência) ---
const DB_FILE = 'db.json';
let db = {
    users: [
        { id: 1, username: 'master', password: 'master', role: 'admin', balance: 0, coins: 999999, lastAirdrop: 0 },
        { id: 2, username: 'user', password: '123', role: 'user', balance: 15750, coins: 8250, lastAirdrop: 0 }
    ],
    products: [],
    codes: [],
    requests: []
};

// Carregar ou Criar DB
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE));
} else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// --- SOCKET.IO (Tempo Real) ---
io.on('connection', (socket) => {
    console.log('Usuário conectado:', socket.id);
    
    // Envia estado inicial
    socket.emit('init_data', { products: db.products });

    socket.on('disconnect', () => {});
});

function broadcastUpdate() {    io.emit('update_all', { products: db.products });
}

// --- ROTAS API ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        const { password, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } else {
        res.json({ success: false, message: 'Erro: Usuário ou senha inválidos.' });
    }
});

// Registro
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (db.users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Usuário já existe.' });
    }
    const newUser = { id: Date.now(), username, password, role: 'user', balance: 0, coins: 100, lastAirdrop: 0 };
    db.users.push(newUser);
    saveDB();
    res.json({ success: true });
});

// --- FUNÇÕES DA LOJA & ADMIN ---

// Admin: Criar Produto
app.post('/api/admin/product', (req, res) => {
    const { name, price, rarity, image } = req.body;
    db.products.push({ id: Date.now(), name, price: Number(price), rarity, image });
    saveDB();
    broadcastUpdate();
    res.json({ success: true });
});

// Admin: Gerar Código
app.post('/api/admin/code', (req, res) => {
    const { value } = req.body;
    const code = 'GHOST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    db.codes.push({ code, value: Number(value), used: false });
    saveDB();
    res.json({ success: true, code });
});

// Admin: Listar Pedidosapp.get('/api/admin/requests', (req, res) => {
    res.json(db.requests.filter(r => r.status === 'pending'));
});

// Admin: Aprovar/Recusar
app.post('/api/admin/request', (req, res) => {
    const { reqId, action } = req.body;
    const reqObj = db.requests.find(r => r.id === reqId);
    if (reqObj) {
        reqObj.status = action;
        if (action === 'approve') {
            const user = db.users.find(u => u.id === reqObj.userId);
            if (user) user.coins += Number(reqObj.amount);
        }
        saveDB();
        res.json({ success: true });
    }
});

// --- FUNÇÕES DO USUÁRIO ---

// Usuário: Resgatar Código
app.post('/api/redeem', (req, res) => {
    const { userId, code } = req.body;
    const codeObj = db.codes.find(c => c.code === code && !c.used);
    if (codeObj) {
        codeObj.used = true;
        const user = db.users.find(u => u.id === userId);
        if (user) {
            user.coins += codeObj.value;
            saveDB();
            res.json({ success: true, newBalance: user.coins });
        }
    } else {
        res.json({ success: false, message: 'Código inválido.' });
    }
});

// Usuário: Comprar Produto
app.post('/api/buy', (req, res) => {
    const { userId, productId } = req.body;
    const product = db.products.find(p => p.id === productId);
    const user = db.users.find(u => u.id === userId);
    
    if (user && product) {
        if (user.coins >= product.price) {
            user.coins -= product.price;
            saveDB();
            res.json({ success: true, newBalance: user.coins, item: product.name });
        } else {            res.json({ success: false, message: 'Saldo insuficiente.' });
        }
    }
});

// Usuário: Solicitar Crédito
app.post('/api/request', (req, res) => {
    const { userId, username, amount } = req.body;
    db.requests.push({ id: Date.now(), userId, username, amount, status: 'pending' });
    saveDB();
    res.json({ success: true });
});

// Usuário: Airdrop
app.post('/api/airdrop', (req, res) => {
    const { userId } = req.body;
    const user = db.users.find(u => u.id === userId);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - user.lastAirdrop > oneDay) {
        const reward = Math.floor(Math.random() * 500) + 100;
        user.coins += reward;
        user.lastAirdrop = now;
        saveDB();
        res.json({ success: true, reward, newBalance: user.coins });
    } else {
        res.json({ success: false, message: 'Airdrop apenas uma vez a cada 24h.' });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Ghost Bank Online na porta ${PORT}`));
