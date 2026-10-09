'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BankError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BankError';
  }
}

const now = () => new Date().toISOString();
const money = (v) => Number(Number(v || 0).toFixed(2));
const id = (p) => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const randomKey = () => `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`.toUpperCase();

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pwd, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return stored === pwd;
  const parts = stored.split('$');
  const hash = crypto.scryptSync(pwd, parts[1], 64).toString('hex');
  return parts[2] === hash;
}

function createBank(options) {
  const file = options.file || 'db.json';
  let db = {
    version: 2,
    users: [],
    transactions: [],
    creditRequests: [],
    supportMessages: [],
    notifications: []
  };

  if (fs.existsSync(file)) {
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
  } else {
    const created = now();
    db.users.push({
      id: 'usr_aventureiro', username: 'aventureiro', password: hashPassword('1234'),
      fullName: 'Lia Aventureira', role: 'user', balance: 1000, savings: 0,
      creditLimit: 500, creditUsed: 0, score: 650,
      cardNumber: '5298 4012 2410 7723', cvv: '123', cardBlocked: false,
      pixKeys: [{ id: id('key'), type: 'email', value: 'lia@aventura.rpg', createdAt: created }],
      createdAt: created, lastBonus: 0, loginAttempts: 0, locked: false
    });
    db.users.push({
      id: 'usr_master', username: 'master', password: hashPassword('master'),
      fullName: 'Armin Master', role: 'admin', balance: 0, savings: 0,
      creditLimit: 0, creditUsed: 0, score: 1000,
      cardNumber: '5298 4000 0099 0001', cvv: '999', cardBlocked: false,
      pixKeys: [{ id: id('key'), type: 'email', value: 'armin@arminbank.rpg', createdAt: created }],
      createdAt: created, lastBonus: 0, loginAttempts: 0, locked: false
    });
  }

  db.users.forEach(u => {
     if (!u.password.startsWith('scrypt$')) u.password = hashPassword(u.password === 'master' ? 'master' : '1234');
     if (u.loginAttempts === undefined) u.loginAttempts = 0;
     if (u.locked === undefined) u.locked = false;
     if (u.cvv === undefined) u.cvv = '123';
     if (u.cardBlocked === undefined) u.cardBlocked = false;
     if (u.savings === undefined) u.savings = 0;
     if (u.savingsAt === undefined) u.savingsAt = u.createdAt;
  });

  function saveDB() { fs.writeFileSync(file, JSON.stringify(db, null, 2)); }
  saveDB();

  function byId(id) { return db.users.find(u => u.id === id); }
  function userFromToken(token) { return db.users.find(u => u.token === token) || null; }

  function login(usernameOrEmail, password) {
    let u = db.users.find(x => x.username === usernameOrEmail || x.pixKeys.some(k => k.value.toLowerCase() === String(usernameOrEmail).toLowerCase()));
    if (!u) throw new BankError('Credenciais inválidas');
    if (u.locked) throw new BankError('Muitas tentativas. Conta bloqueada.');
    if (!verifyPassword(password, u.password)) {
      u.loginAttempts = (u.loginAttempts || 0) + 1;
      if (u.loginAttempts >= 5) u.locked = true;
      saveDB();
      throw new BankError('Credenciais inválidas');
    }
    u.loginAttempts = 0;
    u.token = crypto.randomBytes(32).toString('hex');
    saveDB();
    return { token: u.token, user: u };
  }

  function register({ fullName, username, password }) {
    if (!fullName || !/^[^ ]+ [^ ]+/.test(fullName)) throw new BankError('Informe nome completo');
    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) throw new BankError('Usuário inválido');
    if (!password || password.length < 4) throw new BankError('Senha muito curta');
    if (db.users.find(u => u.username === username)) throw new BankError('Usuário já existe');
    const u = {
      id: id('usr'), username, password: hashPassword(password), fullName, role: 'user',
      balance: 0, savings: 0, creditLimit: 500, creditUsed: 0, score: 650,
      cardNumber: '5298 ' + Math.random().toString().slice(2,6) + ' ' + Math.random().toString().slice(2,6) + ' ' + Math.random().toString().slice(2,6),
      cvv: Math.floor(Math.random()*900+100).toString(), cardBlocked: false,
      pixKeys: [{ id: id('key'), type: 'aleatória', value: 'ARMIN-' + randomKey(), createdAt: now() }],
      createdAt: now(), lastBonus: 0, loginAttempts: 0, locked: false, savingsAt: now()
    };
    db.users.push(u);
    saveDB();
    return { user: u };
  }

  function lookupKey(user, keyVal) {
    const val = String(keyVal).toLowerCase();
    return db.users.find(u => u.pixKeys.some(k => k.value.toLowerCase() === val));
  }

  function pixSend(sender, { key, amount, description }) {
    if (!Number.isFinite(amount) || amount <= 0) throw new BankError('Digite um valor válido');
    if (amount > sender.balance) throw new BankError('Saldo insuficiente');
    const val = String(key).toLowerCase();
    const recipient = db.users.find(u => u.pixKeys.some(k => k.value.toLowerCase() === val));
    if (!recipient) throw new BankError('Chave não encontrada');
    if (recipient.id === sender.id) throw new BankError('Não pode enviar para você mesmo');
    sender.balance = money(sender.balance - amount);
    recipient.balance = money(recipient.balance + amount);
    db.transactions.push({ id: id('tx'), userId: sender.id, kind: 'pix_out', amount: -money(amount), description, createdAt: now() });
    db.transactions.push({ id: id('tx'), userId: recipient.id, kind: 'pix_in', amount: money(amount), description, createdAt: now() });
    saveDB();
  }

  function addKey(user, { type, value }) {
    if (type === 'email' && (!value || !String(value).includes('@'))) throw new BankError('E-mail inválido');
    const val = String(value).toLowerCase();
    if (db.users.some(u => u.pixKeys.some(k => k.value.toLowerCase() === val))) throw new BankError('Chave já está cadastrada');
    user.pixKeys.push({ id: id('key'), type, value: val, createdAt: now() });
    saveDB();
  }

  function removeKey(user, keyId) {
    if (user.pixKeys.length <= 1) throw new BankError('Deve manter ao menos uma chave');
    user.pixKeys = user.pixKeys.filter(k => k.id !== keyId);
    saveDB();
  }

  function cardPurchase(user, { merchant, amount }) {
    if (user.cardBlocked) throw new BankError('Cartão bloqueado');
    if (user.creditUsed + amount > user.creditLimit) throw new BankError('Limite insuficiente');
    user.creditUsed = money(user.creditUsed + amount);
    db.transactions.push({ id: id('tx'), userId: user.id, kind: 'card', amount: -money(amount), description: merchant, createdAt: now() });
    saveDB();
  }

  function toggleCard(user) {
    user.cardBlocked = !user.cardBlocked;
    saveDB();
  }

  function payInvoice(user, amount) {
    if (user.creditUsed === 0) throw new BankError('Fatura já zerada');
    if (amount > user.creditUsed) throw new BankError('Valor informado maior que a fatura');
    if (amount > user.balance) throw new BankError('Saldo insuficiente para pagamento');
    user.balance = money(user.balance - amount);
    user.creditUsed = money(user.creditUsed - amount);
    user.score = (user.score || 0) + 15;
    saveDB();
  }

  function creditDraw(user, amount) {
    if (amount < 10) throw new BankError('Valor mínimo R$ 10');
    if (user.creditUsed + amount * 1.03 > user.creditLimit) throw new BankError('Limite insuficiente');
    user.balance = money(user.balance + amount);
    user.creditUsed = money(user.creditUsed + amount * 1.03);
    saveDB();
  }

  function savingsMove(user, dir, amount) {
    if (dir === 'in') {
      if (amount > user.balance) throw new BankError('Saldo insuficiente');
      user.balance = money(user.balance - amount);
      user.savings = money(user.savings + amount);
    } else {
      if (amount > user.savings) throw new BankError('Valor maior que o guardado');
      user.savings = money(user.savings - amount);
      user.balance = money(user.balance + amount);
    }
    saveDB();
  }

  function accountState(user) {
    const months = (Date.now() - new Date(user.savingsAt || user.createdAt).getTime()) / (30 * 24 * 3600 * 1000);
    if (months > 0.05 && user.savings > 0) {
       const oldSavings = user.savings;
       user.savings = money(user.savings * Math.pow(1.01, months));
       user.savingsAt = now();
       db.transactions.push({ id: id('tx'), userId: user.id, kind: 'savings_yield', amount: money(user.savings - oldSavings), description: 'Rendimento', createdAt: now() });
       saveDB();
    }
    return {
      user,
      transactions: db.transactions.filter(t => t.userId === user.id),
      notifications: db.notifications.filter(n => n.userId === user.id),
      supportMessages: db.supportMessages.filter(m => m.userId === user.id)
    };
  }

  function claimBonus(user) {
    const day = 24 * 3600 * 1000;
    if (Date.now() - (user.lastBonus || 0) < day) throw new BankError('Bônus volta em 24h');
    const reward = Math.floor(Math.random() * 61) + 20;
    user.balance = money(user.balance + reward);
    user.lastBonus = Date.now();
    saveDB();
    return reward;
  }

  function creditRequest(user, { amount, purpose }) {
    if (amount < 50) throw new BankError('Mínimo R$ 50');
    if (db.creditRequests.some(r => r.userId === user.id && r.status === 'pending')) throw new BankError('Já existe uma análise aguardando');
    const req = { id: id('req'), userId: user.id, amount, purpose, status: 'pending', createdAt: now() };
    db.creditRequests.push(req);
    saveDB();
    return req;
  }

  function creditDecide(requestId, decision, reason) {
    const req = db.creditRequests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') throw new BankError('Análise já decidida ou não encontrada');
    req.status = decision;
    req.decidedAt = now();
    req.reason = reason;
    if (decision === 'approve') {
      const u = byId(req.userId);
      if (u) {
        u.creditLimit = Math.max(u.creditLimit, req.amount);
        db.notifications.push({ id: id('note'), userId: u.id, title: 'Crédito aprovado', text: reason, createdAt: now() });
      }
    } else {
      const u = byId(req.userId);
      if (u) db.notifications.push({ id: id('note'), userId: u.id, title: 'Análise encerrada', text: reason, createdAt: now() });
    }
    saveDB();
  }

  function supportSend(user, message) {
    if (!message || !String(message).trim()) throw new BankError('Mensagem vazia');
    db.supportMessages.push({ id: id('msg'), userId: user.id, text: String(message).trim(), role: user.role, createdAt: now(), awaiting: true });
    saveDB();
  }

  function supportReply(userId, message) {
    db.supportMessages.push({ id: id('msg'), userId: userId, text: String(message), role: 'support', createdAt: now() });
    const thread = db.supportMessages.filter(m => m.userId === userId);
    if (thread.length > 0) {
      for(let i = thread.length-1; i>=0; i--) {
        if(thread[i].awaiting) { thread[i].awaiting = false; break; }
      }
    }
    saveDB();
  }

  function masterOverview() {
    const threads = [];
    const users = db.users.filter(u => u.role !== 'admin');
    for(const u of users) {
       const msgs = db.supportMessages.filter(m => m.userId === u.id);
       if(msgs.length > 0) {
         const last = msgs[msgs.length-1];
         threads.push({ userId: u.id, awaiting: !!last.awaiting });
       }
    }
    return { threads };
  }

  function masterDeposit(userId, amount, reason) {
    const u = byId(userId);
    if (!u) throw new BankError('Usuário não encontrado');
    u.balance = money(u.balance + amount);
    db.transactions.push({ id: id('tx'), userId: u.id, kind: 'deposit', amount: money(amount), description: reason, createdAt: now() });
    saveDB();
  }

  function changePassword(user, oldPassword, newPassword) {
    if (!verifyPassword(oldPassword, user.password)) throw new BankError('Senha incorreta');
    user.password = hashPassword(newPassword);
    user.token = crypto.randomBytes(32).toString('hex');
    saveDB();
    return user.token;
  }

  function dbRef() { return db; }

  return {
    byId, userFromToken, login, register, lookupKey, pixSend, addKey, removeKey,
    cardPurchase, toggleCard, payInvoice, creditDraw, savingsMove, accountState,
    claimBonus, creditRequest, creditDecide, supportSend, supportReply, masterOverview,
    masterDeposit, changePassword, db: dbRef
  };
}

module.exports = { createBank, BankError };
