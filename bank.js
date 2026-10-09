'use strict';
const fs = require('fs');
const crypto = require('crypto');

class BankError extends Error { constructor(m){ super(m); this.name='BankError'; } }

const now = () => new Date().toISOString();
const money = (v) => Number(Number(v || 0).toFixed(2));
const id = (p) => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const randomKey = () => `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const genRef = () => 'IND-' + crypto.randomBytes(3).toString('hex').toUpperCase();
const normKey = (v) => { const s = String(v||'').trim().toLowerCase(); return /^[0-9()+\s.\-]+$/.test(s) ? s.replace(/\D/g,'') : s; };
const hashPassword = (pwd) => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(pwd, salt, 64).toString('hex')}`; };
const verifyPassword = (pwd, stored) => { if (!stored || !stored.startsWith('scrypt$')) return stored === pwd; const p = stored.split('$'); return crypto.scryptSync(pwd, p[1], 64).toString('hex') === p[2]; };

function createBank(options) {
  const file = (options && options.file) || 'db.json';
  let db = { version: 2, users: [], transactions: [], creditRequests: [], supportMessages: [], notifications: [] };

  if (fs.existsSync(file)) { try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {} }
  else {
    const created = now();
    db.users.push(
      { id:'usr_aventureiro', username:'aventureiro', password:hashPassword('1234'), fullName:'Lia Aventureira', role:'user', balance:1000, savings:0, creditLimit:500, creditUsed:0, score:650, cardNumber:'5298 4012 2410 7723', cvv:'123', expiry:'12/29', cardBlocked:false, pixKeys:[{id:id('key'),type:'email',value:'lia@aventura.rpg',createdAt:created}], createdAt:created, savingsAt:created, lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 },
      { id:'usr_master', username:'master', password:hashPassword('master'), fullName:'Armin Master', role:'admin', balance:0, savings:0, creditLimit:0, creditUsed:0, score:1000, cardNumber:'5298 4000 0099 0001', cvv:'999', expiry:'12/29', cardBlocked:false, pixKeys:[{id:id('key'),type:'email',value:'armin@arminbank.rpg',createdAt:created}], createdAt:created, savingsAt:created, lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 }
    );
  }

  db.users.forEach(u => {
    if (!u.password || !u.password.startsWith('scrypt$')) u.password = hashPassword(u.password === 'master' ? 'master' : '1234');
    if (u.loginAttempts === undefined) u.loginAttempts = 0;
    if (u.locked === undefined) u.locked = false;
    if (u.cvv === undefined) u.cvv = '123';
    if (u.expiry === undefined) u.expiry = '12/29';
    if (u.cardBlocked === undefined) u.cardBlocked = false;
    if (u.savings === undefined) u.savings = 0;
    if (u.savingsAt === undefined) u.savingsAt = u.createdAt || now();
    if (!u.loans) u.loans = [];
    if (!u.refCode) u.refCode = genRef();
    if (u.refUsed === undefined) u.refUsed = false;
    if (u.refCount === undefined) u.refCount = 0;
  });

  const saveDB = () => fs.writeFileSync(file, JSON.stringify(db, null, 2));
  saveDB();

  const byId = (uid) => db.users.find(u => u.id === uid);
  const userFromToken = (t) => db.users.find(u => u.token === t) || null;

  function login(nameOrKey, password) {
    const n = String(nameOrKey||'').trim().toLowerCase();
    const u = db.users.find(x => x.username.toLowerCase() === n || x.pixKeys.some(k => normKey(k.value) === normKey(n)));
    if (!u) throw new BankError('Credenciais inválidas');
    if (u.locked) throw new BankError('Muitas tentativas. Conta bloqueada.');
    if (!verifyPassword(password, u.password)) {
      u.loginAttempts = (u.loginAttempts||0) + 1;
      if (u.loginAttempts >= 5) u.locked = true;
      saveDB(); throw new BankError('Credenciais inválidas');
    }
    u.loginAttempts = 0; u.token = crypto.randomBytes(32).toString('hex'); saveDB();
    return { token: u.token, user: u };
  }

  function register({ fullName, username, password }) {
    if (!fullName || !/^[^ ]+ [^ ]+/.test(fullName)) throw new BankError('Informe nome completo');
    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) throw new BankError('Usuário inválido');
    if (!password || String(password).length < 4) throw new BankError('Senha muito curta');
    if (db.users.find(u => u.username.toLowerCase() === String(username).toLowerCase())) throw new BankError('Usuário já existe');
    const u = { id:id('usr'), username, password:hashPassword(password), fullName, role:'user', balance:0, savings:0, creditLimit:500, creditUsed:0, score:650,
      cardNumber:`5298 ${String(Math.floor(Math.random()*9000)+1000)} ${String(Math.floor(Math.random()*9000)+1000)} ${String(Math.floor(Math.random()*9000)+1000)}`,
      cvv:String(Math.floor(Math.random()*900)+100), expiry:'12/29', cardBlocked:false,
      pixKeys:[{ id:id('key'), type:'aleatória', value:`ARMIN-${randomKey()}`, createdAt:now() }], createdAt:now(), savingsAt:now(), lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 };
    db.users.push(u); saveDB(); return { user: u };
  }

  const lookupKey = (_u, val) => db.users.find(u => u.pixKeys.some(k => normKey(k.value) === normKey(val)));

  function pixSend(sender, { key, amount, description, installments }) {
    const v = Number(amount);
    const n = Math.min(12, Math.max(1, parseInt(installments, 10) || 1));
    if (!Number.isFinite(v) || v <= 0) throw new BankError('Digite um valor válido');
    const rec = lookupKey(sender, key);
    if (!rec) throw new BankError('Chave não encontrada');
    if (rec.id === sender.id) throw new BankError('Não pode enviar para você mesmo');
    if (n > 1) {
      if (sender.creditUsed + v > sender.creditLimit) throw new BankError('Limite insuficiente para parcelar este Pix');
      sender.creditUsed = money(sender.creditUsed + v);
      sender.loans.push({ id:id('loan'), total:money(v), n, paid:0, monthly:money(v/n), description:description||'Pix parcelado', recipient:rec.fullName, createdAt:now() });
      db.transactions.push({ id:id('tx'), userId:sender.id, kind:'pix_parcelado', amount:-money(v), description:`Pix parcelado em ${n}x para ${rec.fullName}`, createdAt:now() });
    } else {
      if (v > sender.balance) throw new BankError('Saldo insuficiente');
      sender.balance = money(sender.balance - v);
      db.transactions.push({ id:id('tx'), userId:sender.id, kind:'pix_out', amount:-money(v), description, createdAt:now() });
    }
    rec.balance = money(rec.balance + v);
    db.transactions.push({ id:id('tx'), userId:rec.id, kind:'pix_in', amount:money(v), description, createdAt:now() });
    saveDB();
  }

  function payInstallment(user, loanId) {
    const loan = (user.loans||[]).find(l => l.id === loanId);
    if (!loan) throw new BankError('Parcelamento não encontrado');
    if (loan.paid >= loan.n) throw new BankError('Este Pix já está quitado');
    if (user.balance < loan.monthly) throw new BankError('Saldo insuficiente para pagar a parcela');
    user.balance = money(user.balance - loan.monthly);
    user.creditUsed = money(Math.max(0, user.creditUsed - loan.monthly));
    loan.paid += 1;
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'installment', amount:-loan.monthly, description:`Parcela ${loan.paid}/${loan.n} — ${loan.description}`, createdAt:now() });
    saveDB();
  }

  function applyReferral(user, code) {
    const c = String(code||'').trim().toUpperCase();
    if (!c) throw new BankError('Digite um código');
    const owner = db.users.find(u => u.refCode && u.refCode.toUpperCase() === c);
    if (!owner) throw new BankError('Código não encontrado');
    if (owner.id === user.id) throw new BankError('Você não pode usar seu próprio código');
    if (user.refUsed) throw new BankError('Você já usou um código de indicação');
    user.refUsed = true; owner.refCount = (owner.refCount||0) + 1;
    user.balance = money(user.balance + 25); owner.balance = money(owner.balance + 25);
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'referral', amount:25, description:'Bônus de indicação recebido', createdAt:now() });
    db.transactions.push({ id:id('tx'), userId:owner.id, kind:'referral', amount:25, description:`Indicação: ${user.fullName} entrou!`, createdAt:now() });
    saveDB();
    return { reward: 25 };
  }

  function addKey(user, { type, value }) {
    if (type === 'email' && (!value || !String(value).includes('@'))) throw new BankError('E-mail inválido');
    const nv = normKey(value);
    if (db.users.some(u => u.pixKeys.some(k => normKey(k.value) === nv))) throw new BankError('Chave já está cadastrada');
    user.pixKeys.push({ id:id('key'), type, value:String(value).trim(), createdAt:now() }); saveDB();
  }
  function removeKey(user, keyId) {
    if (user.pixKeys.length <= 1) throw new BankError('Mantenha ao menos uma chave');
    user.pixKeys = user.pixKeys.filter(k => k.id !== keyId); saveDB();
  }
  function cardPurchase(user, { merchant, amount }) {
    if (user.cardBlocked) throw new BankError('Cartão bloqueado');
    if (user.creditUsed + Number(amount) > user.creditLimit) throw new BankError('Limite insuficiente');
    user.creditUsed = money(user.creditUsed + Number(amount));
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'card', amount:-money(amount), description:merchant, createdAt:now() }); saveDB();
  }
  const toggleCard = (user) => { user.cardBlocked = !user.cardBlocked; saveDB(); };
  function payInvoice(user, amount) {
    if (user.creditUsed === 0) throw new BankError('Fatura já zerada');
    if (Number(amount) > user.creditUsed) throw new BankError('Valor informado maior que a fatura');
    if (Number(amount) > user.balance) throw new BankError('Saldo insuficiente para pagamento');
    user.balance = money(user.balance - Number(amount)); user.creditUsed = money(user.creditUsed - Number(amount)); user.score = (user.score||0) + 15; saveDB();
  }
  function creditDraw(user, amount) {
    if (!(Number(amount) >= 10)) throw new BankError('Valor mínimo R$ 10');
    if (user.creditUsed + Number(amount) * 1.03 > user.creditLimit) throw new BankError('Limite insuficiente');
    user.balance = money(user.balance + Number(amount)); user.creditUsed = money(user.creditUsed + Number(amount) * 1.03); saveDB();
  }
  function savingsMove(user, dir, amount) {
    const v = Number(amount);
    if (dir === 'in') { if (v > user.balance) throw new BankError('Saldo insuficiente'); user.balance = money(user.balance - v); user.savings = money(user.savings + v); }
    else { if (v > user.savings) throw new BankError('Valor maior que o guardado'); user.savings = money(user.savings - v); user.balance = money(user.balance + v); }
    saveDB();
  }
  function applyYield(user) {
    const months = (Date.now() - new Date(user.savingsAt || user.createdAt).getTime()) / (30*24*3600*1000);
    if (months > 0.05 && user.savings > 0) {
      const old = user.savings;
      user.savings = money(user.savings * Math.pow(1.01, months)); user.savingsAt = now();
      db.transactions.push({ id:id('tx'), userId:user.id, kind:'savings_yield', amount:money(user.savings - old), description:'Rendimento do cofrinho', createdAt:now() });
      saveDB();
    }
  }
  function accountState(user) {
    applyYield(user);
    const safe = { ...user }; delete safe.password;
    return {
      user: safe,
      transactions: db.transactions.filter(t => t.userId === user.id).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      notifications: db.notifications.filter(n => n.userId === user.id),
      supportMessages: db.supportMessages.filter(m => m.userId === user.id),
      creditRequests: db.creditRequests.filter(r => r.userId === user.id),
      unread: db.notifications.filter(n => n.userId === user.id && !n.read).length,
    };
  }
  function claimBonus(user) {
    if (Date.now() - (user.lastBonus||0) < 24*3600*1000) throw new BankError('O bônus volta em 24h');
    const reward = Math.floor(Math.random()*61) + 20;
    user.balance = money(user.balance + reward); user.lastBonus = Date.now(); saveDB(); return reward;
  }
  function creditRequest(user, { amount, purpose }) {
    if (!(Number(amount) >= 50)) throw new BankError('Mínimo R$ 50');
    if (db.creditRequests.some(r => r.userId === user.id && r.status === 'pending')) throw new BankError('Você já tem uma análise aguardando');
    const r = { id:id('req'), userId:user.id, username:user.username, fullName:user.fullName, amount:money(amount), purpose, status:'pending', createdAt:now() };
    db.creditRequests.push(r); saveDB(); return r;
  }
  function creditDecide(requestId, decision, reason) {
    const r = db.creditRequests.find(x => x.id === requestId);
    if (!r || r.status !== 'pending') throw new BankError('Análise já decidida ou não encontrada');
    r.status = decision; r.decidedAt = now(); r.decisionNote = reason || '';
    const u = byId(r.userId);
    if (u) {
      if (decision === 'approve') { u.creditLimit = Math.max(u.creditLimit, r.amount); db.notifications.push({ id:id('note'), userId:u.id, title:'Crédito aprovado', text:`Limite atualizado para ${money(r.amount).toFixed(2)}.`, read:false, createdAt:now() }); }
      else db.notifications.push({ id:id('note'), userId:u.id, title:'Análise encerrada', text:reason || 'Reprovado nesta rodada.', read:false, createdAt:now() });
    }
    saveDB();
  }
  function supportSend(user, message) {
    if (!message || !String(message).trim()) throw new BankError('Escreva uma mensagem');
    db.supportMessages.push({ id:id('msg'), userId:user.id, author:user.fullName, role:user.role, text:String(message).trim().slice(0,500), awaiting:true, createdAt:now() }); saveDB();
  }
  function supportReply(userId, message) {
    db.supportMessages.push({ id:id('msg'), userId, author:'Armin Master', role:'support', text:String(message).trim().slice(0,500), awaiting:false, createdAt:now() });
    const th = db.supportMessages.filter(m => m.userId === userId);
    for (let i = th.length-1; i >= 0; i--) if (th[i].awaiting) { th[i].awaiting = false; break; }
    saveDB();
  }
  const markNotifsRead = (user) => { db.notifications.forEach(n => { if (n.userId === user.id) n.read = true; }); saveDB(); };
  function masterOverview() {
    const players = db.users.filter(u => u.role !== 'admin');
    const threads = players.map(u => { const msgs = db.supportMessages.filter(m => m.userId === u.id); return msgs.length ? { userId:u.id, awaiting: msgs.some(m => m.awaiting) } : null; }).filter(Boolean);
    return {
      threads,
      metrics: { players: players.length, pendingCredits: db.creditRequests.filter(r => r.status==='pending').length, moneyInPlay: money(players.reduce((s,u)=>s+u.balance,0)), avgScore: players.length ? Math.round(players.reduce((s,u)=>s+u.score,0)/players.length) : 0 },
      pending: db.creditRequests.filter(r => r.status==='pending'),
      users: players.map(u => { const c={...u}; delete c.password; return c; }),
      support: db.supportMessages.slice(-30),
    };
  }
  function masterDeposit(userId, amount, reason) {
    const u = byId(userId); if (!u) throw new BankError('Usuário não encontrado');
    u.balance = money(u.balance + Number(amount));
    db.transactions.push({ id:id('tx'), userId:u.id, kind:'deposit', amount:money(amount), description:reason||'Depósito master', createdAt:now() }); saveDB();
  }
  function changePassword(user, oldPassword, newPassword) {
    if (!verifyPassword(oldPassword, user.password)) throw new BankError('Senha atual incorreta');
    if (!newPassword || String(newPassword).length < 4) throw new BankError('Senha muito curta');
    user.password = hashPassword(newPassword); user.token = crypto.randomBytes(32).toString('hex'); saveDB(); return user.token;
  }

  return { byId, userFromToken, login, register, lookupKey, pixSend, payInstallment, applyReferral, addKey, removeKey, cardPurchase, toggleCard, payInvoice, creditDraw, savingsMove, accountState, claimBonus, creditRequest, creditDecide, supportSend, supportReply, markNotifsRead, masterOverview, masterDeposit, changePassword, db: () => db };
}

module.exports = { createBank, BankError };
