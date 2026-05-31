const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BANCO DE DADOS EM MEMÓRIA (Simulado) ---
// Nota: No Render Free, se o app dormir, os dados resetam. 
// Para persistência real sem DB, precisaríamos de um arquivo JSON, mas a memória é mais rápida para demo.

let users = [
    { id: 1, username: 'master', password: 'master', role: 'admin', balance: 999999, coins: 50000, history: [] },
    { id: 2, username: 'Ghost_Player', password: '123', role: 'user', balance: 15750.00, coins: 8250, history: [] }
];

let products = [
    { id: 1, name: 'Ghost Card Black', price: 500, rarity: 'lendario', image: 'https://cdn-icons-png.flaticon.com/512/6124/6124997.png' },
    { id: 2, name: 'Pacote Coins x1000', price: 100, rarity: 'comum', image: 'https://cdn-icons-png.flaticon.com/512/1292/1292744.png' }
];

let rechargeCodes = []; // { code: 'XYZ', value: 100, used: false }
let creditRequests = []; // { id, userId, username, amount, status: 'pending' }

// --- ROTAS ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        // Não envie a senha de volta
        const { password, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } else {
        res.json({ success: false, message: 'Credenciais inválidas' });
    }
});

// Registro
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Usuário já existe' });
    }
    const newUser = { 
        id: Date.now(),         username, 
        password, 
        role: 'user', 
        balance: 0, 
        coins: 100, // Bônus de boas-vindas
        history: [] 
    };
    users.push(newUser);
    res.json({ success: true, message: 'Conta criada!' });
});

// Dados da Loja
app.get('/api/products', (req, res) => res.json(products));

// Admin: Adicionar Produto
app.post('/api/products', (req, res) => {
    const { name, price, rarity, image } = req.body;
    products.push({ id: Date.now(), name, price, rarity, image });
    res.json({ success: true });
});

// Admin: Gerar Código
app.post('/api/generate-code', (req, res) => {
    const { value } = req.body;
    const code = 'GHOST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    rechargeCodes.push({ code, value: parseInt(value), used: false });
    res.json({ success: true, code });
});

// Usuário: Resgatar Código
app.post('/api/redeem-code', (req, res) => {
    const { userId, code } = req.body;
    const codeObj = rechargeCodes.find(c => c.code === code && !c.used);
    if (codeObj) {
        codeObj.used = true;
        const user = users.find(u => u.id === userId);
        if (user) {
            user.coins += codeObj.value;
            res.json({ success: true, message: `Sucesso! +${codeObj.value} Ghost Coins` });
        }
    } else {
        res.json({ success: false, message: 'Código inválido ou já usado' });
    }
});

// Usuário: Solicitar Crédito
app.post('/api/request-credit', (req, res) => {
    const { userId, username, amount } = req.body;
    creditRequests.push({ id: Date.now(), userId, username, amount, status: 'pending' });
    res.json({ success: true, message: 'Solicitação enviada ao Master.' });});

// Admin: Listar Pedidos
app.get('/api/requests', (req, res) => res.json(creditRequests));

// Admin: Aprovar/Recusar
app.post('/api/handle-request', (req, res) => {
    const { reqId, action } = req.body; // action: 'approve' or 'deny'
    const reqObj = creditRequests.find(r => r.id === reqId);
    if (reqObj) {
        reqObj.status = action;
        if (action === 'approve') {
            const user = users.find(u => u.id === reqObj.userId);
            if (user) user.coins += parseInt(reqObj.amount);
        }
        res.json({ success: true });
    }
});

// Usuário: Airdrop Diário
app.post('/api/airdrop', (req, res) => {
    const { userId } = req.body;
    const user = users.find(u => u.id === userId);
    if (user) {
        const reward = Math.floor(Math.random() * 50) + 10;
        user.coins += reward;
        res.json({ success: true, reward });
    }
});

// Atualizar usuário (genérico)
app.post('/api/update-user', (req, res) => {
    const { user } = req.body;
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
        users[index] = { ...users[index], ...user };
        res.json({ success: true, user: users[index] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Ghost Bank rodando na porta ${PORT}`));
