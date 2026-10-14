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
const parsePixTarget = (value) => { const raw = String(value||'').trim(); if (raw.toUpperCase().startsWith('ZKPIX|')) { const [, key, amount] = raw.split('|'); return { key:String(key||'').trim(), amount:Number(amount) > 0 ? Number(amount) : 0 }; } return { key:raw, amount:0 }; };
const hashPassword = (pwd) => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(pwd, salt, 64).toString('hex')}`; };
const verifyPassword = (pwd, stored) => { if (!stored || !stored.startsWith('scrypt$')) return stored === pwd; const p = stored.split('$'); return crypto.scryptSync(pwd, p[1], 64).toString('hex') === p[2]; };

function createBank(options) {
  const file = (options && options.file) || 'db.json';
  let db = { version: 6, users: [], transactions: [], creditRequests: [], loanRequests: [], loans: [], vehicleListings: [], vehicleFinancings: [], lifePolicies: [], supportMessages: [], notifications: [], products: [] };

  if (fs.existsSync(file)) { try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {} }
  else {
    const created = now();
    db.users.push(
      { id:'usr_aventureiro', username:'aventureiro', password:hashPassword('1234'), fullName:'Lia Aventureira', role:'user', balance:5000, savings:0, creditLimit:500, creditUsed:0, score:650, cardNumber:'5298 4012 2410 7723', cvv:'123', expiry:'12/29', cardBlocked:false, blackCardStatus:'none', pixKeys:[{id:id('key'),type:'email',value:'lia@aventura.rpg',createdAt:created}], createdAt:created, savingsAt:created, lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 },
      { id:'usr_master', username:'master', password:hashPassword('master'), fullName:'Armin Master', role:'admin', unlimitedFunds:true, balance:0, savings:0, creditLimit:0, creditUsed:0, score:1000, cardNumber:'5298 4000 0099 0001', cvv:'999', expiry:'12/29', cardBlocked:false, blackCardStatus:'approved', pixKeys:[{id:id('key'),type:'email',value:'armin@arminbank.rpg',createdAt:created}], createdAt:created, savingsAt:created, lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 }
    );
  }

  if (!db.products) db.products = [];
  db.products.forEach(p => { if (!p.sellerId) p.sellerId = 'usr_master'; if (p.active === undefined) p.active = true; if (!p.imageUrl) p.imageUrl = ''; if (!p.category) p.category = 'item'; });
  if (!db.creditRequests) db.creditRequests = [];
  if (!db.loanRequests) db.loanRequests = [];
  if (!db.loans) db.loans = [];
  if (!db.vehicleListings) db.vehicleListings = [];
  if (!db.vehicleFinancings) db.vehicleFinancings = [];
  if (!db.lifePolicies) db.lifePolicies = [];
  if (!db.supportMessages) db.supportMessages = [];
  if (!db.notifications) db.notifications = [];
  if (!db.users.some(u => u.role === 'admin')) {
    const created = now();
    db.users.push({ id:'usr_master', username:'master', password:hashPassword('master'), fullName:'Armin Master', role:'admin', unlimitedFunds:true, balance:0, savings:0, creditLimit:0, creditUsed:0, score:1000, cardNumber:'5298 4000 0099 0001', cvv:'999', expiry:'12/29', cardBlocked:false, pixKeys:[{id:id('key'),type:'email',value:'armin@arminbank.rpg',createdAt:created}], createdAt:created, savingsAt:created, lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 });
  }
  db.users.forEach(u => {
    if (!u.password || !u.password.startsWith('scrypt$')) u.password = hashPassword(u.password === 'master' ? 'master' : '1234');
    if (u.loginAttempts === undefined) u.loginAttempts = 0;
    if (u.locked === undefined) u.locked = false;
    if (u.cvv === undefined) u.cvv = '123';
    if (u.expiry === undefined) u.expiry = '12/29';
    if (u.cardBlocked === undefined) u.cardBlocked = false;
    if (u.blackCardStatus === undefined) u.blackCardStatus = u.role === 'admin' ? 'approved' : 'none';
    if (u.savings === undefined) u.savings = 0;
    if (u.savingsAt === undefined) u.savingsAt = Date.now();
    else if (typeof u.savingsAt === 'string') u.savingsAt = Date.parse(u.savingsAt) || Date.now();
    if (!u.loans) u.loans = [];
    if (!u.refCode) u.refCode = genRef();
    if (u.refUsed === undefined) u.refUsed = false;
    if (u.refCount === undefined) u.refCount = 0;
    if (u.storeCredit === undefined) u.storeCredit = 0;
    if (u.virtualCoins === undefined) u.virtualCoins = 0;
    if (u.magicCoins === undefined) u.magicCoins = 0;
    if (u.autoDebit === undefined) u.autoDebit = { enabled:false, description:'', amount:0, nextRun:null };
    if (u.avatarUrl === undefined) u.avatarUrl = '';
    if (u.banned === undefined) u.banned = false;
    if (u.bannedAt === undefined) u.bannedAt = null;
    if (u.unlimitedFunds === undefined) u.unlimitedFunds = u.role === 'admin';
    if (!Array.isArray(u.tokens)) u.tokens = u.token ? [u.token] : [];
  });

  const saveDB = () => fs.writeFileSync(file, JSON.stringify(db, null, 2));
  saveDB();

  const byId = (uid) => db.users.find(u => u.id === uid);
  const userFromToken = (t) => t ? (db.users.find(u => u.token === t || (Array.isArray(u.tokens) && u.tokens.includes(t))) || null) : null;

  function login(nameOrKey, password) {
    const n = String(nameOrKey||'').trim().toLowerCase();
    const u = db.users.find(x => x.username.toLowerCase() === n || x.pixKeys.some(k => normKey(k.value) === normKey(n)));
    if (!u) throw new BankError('Credenciais inválidos');
    if (u.banned) throw new BankError('Conta banida pelo master.');
    if (u.locked) throw new BankError('Muitas tentativas. Conta bloqueada.');
    if (!verifyPassword(password, u.password)) {
      u.loginAttempts = (u.loginAttempts||0) + 1;
      if (u.loginAttempts >= 5) u.locked = true;
      saveDB(); throw new BankError('Credenciais inválidos');
    }
    u.loginAttempts = 0; u.token = crypto.randomBytes(32).toString('hex'); u.tokens = [...new Set([...(u.tokens||[]), u.token])].slice(-8); saveDB();
    return { token: u.token, user: u };
  }

  function register({ fullName, username, password }) {
    if (!fullName || !/^[^ ]+ [^ ]+/.test(fullName)) throw new BankError('Informe nome completo');
    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) throw new BankError('Usuário inválido');
    if (!password || String(password).length < 4) throw new BankError('senha muito curta');
    if (db.users.find(u => u.username.toLowerCase() === String(username).toLowerCase())) throw new BankError('Usuário já existe');
    const u = { id:id('usr'), username, password:hashPassword(password), fullName, role:'user', unlimitedFunds:false, balance:0, savings:0, creditLimit:500, creditUsed:0, score:650,
      cardNumber:`5298 ${String(Math.floor(Math.random()*9000)+1000)} ${String(Math.floor(Math.random()*9000)+1000)} ${String(Math.floor(Math.random()*9000)+1000)}`,
      cvv:String(Math.floor(Math.random()*900)+100), expiry:'12/29', cardBlocked:false,
      pixKeys:[{ id:id('key'), type:'aleatória', value:`ARMIN-${randomKey()}`, createdAt:now() }], avatarUrl:'', banned:false, bannedAt:null, blackCardStatus:'none', createdAt:now(), savingsAt:now(), lastBonus:0, loginAttempts:0, locked:false, loans:[], refCode:genRef(), refUsed:false, refCount:0 };
    db.users.push(u); saveDB(); return { user: u };
  }

  const lookupKey = (_u, val) => {
    const target = parsePixTarget(val); const n = normKey(target.key);
    return db.users.find(u => u.pixKeys.some(k => normKey(k.value) === n) || normKey(u.username) === n || normKey(u.id) === n) || null;
  };

  function pixSend(sender, { key, amount, description, installments }) {
    const v = Number(amount);
    const n = Math.min(12, Math.max(1, parseInt(installments, 10) || 1));
    if (!Number.isFinite(v) || v <= 0) throw new BankError('Digite um valor válido');
    const target = parsePixTarget(key); const rec = lookupKey(sender, target.key);
    if (!rec) throw new BankError('Chave não encontrada');
    if (rec.id === sender.id) throw new BankError('Não pode enviar para você mesmo');
    if (n > 1) {
      if (!sender.unlimitedFunds) {
        if (sender.creditUsed + v > sender.creditLimit) throw new BankError('Limite insuficiente para parcelar este Pix');
        sender.creditUsed = money(sender.creditUsed + v);
      }
      sender.loans.push({ id:id('loan'), total:money(v), n, paid:0, monthly:money(v/n), description:description||'Pix parcelado', recipient:rec.fullName, createdAt:now() });
      db.transactions.push({ id:id('tx'), userId:sender.id, kind:'pix_parcelado', amount:-money(v), description:`Pix parcelado em ${n}x para ${rec.fullName}`, createdAt:now() });
    } else {
      if (!sender.unlimitedFunds && v > sender.balance) throw new BankError('Saldo insuficiente');
      if (!sender.unlimitedFunds) sender.balance = money(sender.balance - v);
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
    if (user.unlimitedFunds) { loan.paid = loan.n; saveDB(); return; }
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
    let raw = String(value || '').trim();
    if (type === 'aleatória' && !raw) raw = `ARMIN-${randomKey()}`;
    if (type === 'email' && (!raw || !raw.includes('@'))) throw new BankError('e-mail inválido');
    if (type === 'cpf' && raw.replace(/\D/g,'').length !== 11) throw new BankError('CPF inválido');
    if (type === 'cnpj' && raw.replace(/\D/g,'').length !== 14) throw new BankError('CNPJ inválido');
    if (type === 'telefone' && ![10,11].includes(raw.replace(/\D/g,'').length)) throw new BankError('Telefone inválido');
    const nv = normKey(raw);
    if (db.users.some(u => u.pixKeys.some(k => normKey(k.value) === nv))) throw new BankError('Chave já está cadastrada');
    user.pixKeys.push({ id:id('key'), type, value:raw, createdAt:now() }); saveDB();
  }
  function removeKey(user, keyId) {
    if (user.pixKeys.length <= 1) throw new BankError('Mantenha ao menos uma chave');
    user.pixKeys = user.pixKeys.filter(k => k.id !== keyId); saveDB();
  }
  function cardPurchase(user, { merchant, amount }) {
    if (user.cardBlocked) throw new BankError('Cartão bloqueado');
    if (!user.unlimitedFunds) {
      if (user.creditUsed + Number(amount) > user.creditLimit) throw new BankError('Limite insuficiente');
      user.creditUsed = money(user.creditUsed + Number(amount));
    }
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'card', amount:-money(amount), description:merchant, createdAt:now() }); saveDB();
  }
  function requestBlackCard(user) {
    if (user.role === 'admin') { user.blackCardStatus = 'approved'; saveDB(); return user.blackCardStatus; }
    if (user.blackCardStatus === 'approved') throw new BankError('Seu Cartão Black já está aprovado');
    if (user.blackCardStatus === 'pending') throw new BankError('Sua solicitação já está em análise');
    user.blackCardStatus = 'pending'; db.notifications.push({ id:id('note'), userId:user.id, title:'Solicitação de Cartão Black', text:'Sua solicitação foi enviada para análise do master.', read:false, createdAt:now() }); saveDB(); return user.blackCardStatus;
  }
  function decideBlackCard(admin, userId, decision, reason) {
    if (!admin || admin.role !== 'admin') throw new BankError('Apenas o master pode aprovar Cartão Black'); const u = byId(userId); if (!u) throw new BankError('Usuário não encontrado'); if (!['approve','reject'].includes(decision)) throw new BankError('Decisão inválida'); u.blackCardStatus = decision === 'approve' ? 'approved' : 'rejected'; db.notifications.push({ id:id('note'), userId:u.id, title:decision === 'approve' ? 'Cartão Black aprovado' : 'Cartão Black não aprovado', text:decision === 'approve' ? 'Seu Cartão Black está disponível na área Meus cartões.' : (reason || 'Sua solicitação não foi aprovada.'), read:false, createdAt:now() }); saveDB(); return u;
  }
  const toggleCard = (user) => { user.cardBlocked = !user.cardBlocked; saveDB(); };
  function payInvoice(user, amount) {
    if (user.unlimitedFunds) { user.creditUsed = 0; saveDB(); return; }
    if (user.creditUsed === 0) throw new BankError('Fatura já zerada');
    if (Number(amount) > user.creditUsed) throw new BankError('valor informado maior que a fatura');
    if (Number(amount) > user.balance) throw new BankError('Saldo insuficiente para pagamento');
    user.balance = money(user.balance - Number(amount)); user.creditUsed = money(user.creditUsed - Number(amount)); user.score = (user.score||0) + 15; saveDB();
  }
  function creditDraw(user, amount) {
    if (!(Number(amount) >= 10)) throw new BankError('Valor mínimo R$ 10');
    if (user.unlimitedFunds) { saveDB(); return; }
    if (user.creditUsed + Number(amount) * 1.03 > user.creditLimit) throw new BankError('Limite insuficiente');
    user.balance = money(user.balance + Number(amount)); user.creditUsed = money(user.creditUsed + Number(amount) * 1.03); saveDB();
  }
  function savingsMove(user, dir, amount) {
    const v = Number(amount);
    if (!(v > 0)) throw new BankError('Informe um valor válido');
    if (dir === 'in') { if (!user.unlimitedFunds && v > user.balance) throw new BankError('Saldo insuficiente'); if (!user.unlimitedFunds) user.balance = money(user.balance - v); user.savings = money(user.savings + v); }
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
  function applyAutomaticDebtDiscount(user) {
    const a = user.autoDebit; if (!a || !a.enabled || user.unlimitedFunds || !(a.amount > 0) || !(user.balance > 0) || !(user.creditUsed > 0)) return 0;
    const value = money(Math.min(a.amount, user.balance, user.creditUsed)); user.balance = money(user.balance - value); user.creditUsed = money(user.creditUsed - value);
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'automatic_debt_payment', amount:-value, description:'Desconto automático da dívida de crédito', createdAt:now() }); saveDB(); return value;
  }
  function accountState(user) {
    applyYield(user);
    applyAutomaticDebtDiscount(user);
    const safe = { ...user }; delete safe.password; delete safe.token; delete safe.tokens;
    return {
      user: safe,
      score: scoreProfile(user),
      transactions: db.transactions.filter(t => t.userId === user.id).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      notifications: db.notifications.filter(n => n.userId === user.id),
      supportMessages: db.supportMessages.filter(m => m.userId === user.id),
      creditRequests: db.creditRequests.filter(r => r.userId === user.id),
      loanRequests: db.loanRequests.filter(r => r.userId === user.id),
      loanContracts: db.loans.filter(l => l.userId === user.id),
      vehicleFinancings: db.vehicleFinancings.filter(f => f.userId === user.id),
      lifePolicies: db.lifePolicies.filter(p => p.userId === user.id),
      unread: db.notifications.filter(n => n.userId === user.id && !n.read).length,
    };
  }
  function scoreProfile(user) {
    const score = Math.max(0, Math.min(1000, Number(user.score || 0)));
    const band = score >= 850 ? 'Excelente' : score >= 700 ? 'Muito bom' : score >= 550 ? 'Bom' : score >= 400 ? 'Regular' : 'Baixo';
    const preApprovedLimit = score >= 850 ? 5000 : score >= 750 ? 3000 : score >= 650 ? 1500 : score >= 550 ? 700 : 0;
    const usedRatio = user.creditLimit > 0 ? Math.min(1, (user.creditUsed || 0) / user.creditLimit) : 0;
    return { value:score, min:0, max:1000, band, preApprovedLimit:money(preApprovedLimit), availablePreApproved:money(Math.max(0, preApprovedLimit - (user.creditLimit || 0))), factors:[
      { label:'Pagamentos em dia', status:(user.score||0) >= 650 ? 'positivo' : 'em construção' },
      { label:'Uso do limite', status:usedRatio <= .3 ? 'baixo' : usedRatio <= .7 ? 'moderado' : 'alto' },
      { label:'Histórico no GhsotBank', status:(user.createdAt && Date.now() - new Date(user.createdAt).getTime() > 30*86400000) ? 'estável' : 'novo' },
    ] };
  }
  function acceptPreApproved(user) {
    const profile = scoreProfile(user); if (!(profile.availablePreApproved > 0)) throw new BankError('Seu limite atual já está no máximo pré-aprovado');
    user.creditLimit = money(profile.preApprovedLimit); user.preApprovedAcceptedAt = now();
    db.notifications.push({ id:id('note'), userId:user.id, title:'Limite pré-aprovado liberado', text:`Seu limite agora é R$ ${user.creditLimit.toFixed(2)}.`, read:false, createdAt:now() }); saveDB(); return user.creditLimit;
  }
  function loanTerms(user, amount, installments) {
    const score = Number(user.score || 0); const rate = score >= 850 ? 0.015 : score >= 750 ? 0.02 : score >= 650 ? 0.03 : 0.05;
    const total = money(Number(amount) * (1 + rate * installments));
    return { rate, total, monthly:money(total / installments) };
  }
  function loanRequest(user, { amount, installments, purpose }) {
    const v = money(amount); const n = Math.max(1, Math.min(24, parseInt(installments, 10) || 1));
    if (!(v >= 100 && v <= 50000)) throw new BankError('O empréstimo deve ficar entre R$ 100 e R$ 50.000');
    if (db.loanRequests.some(r => r.userId === user.id && r.status === 'pending')) throw new BankError('Você já tem uma solicitação em análise');
    if (db.loans.some(l => l.userId === user.id && l.status === 'active')) throw new BankError('Quite seu empréstimo atual antes de solicitar outro');
    const t = loanTerms(user, v, n); const r = { id:id('loanreq'), userId:user.id, fullName:user.fullName, username:user.username, amount:v, installments:n, rate:t.rate, total:t.total, monthly:t.monthly, purpose:String(purpose||'').trim().slice(0,120), status:'pending', createdAt:now() };
    db.loanRequests.push(r); saveDB(); return r;
  }
  function loanDecide(admin, requestId, decision, reason) {
    if (!admin || admin.role !== 'admin') throw new BankError('Apenas o master pode analisar empréstimos');
    const r = db.loanRequests.find(x => x.id === requestId); if (!r || r.status !== 'pending') throw new BankError('Solicitação de empréstimo inválida');
    r.status = decision; r.decidedAt = now(); r.decisionNote = String(reason||'').slice(0,160); const u = byId(r.userId);
    if (decision === 'approve') { const l = { id:id('loan'), requestId:r.id, userId:r.userId, principal:r.amount, total:r.total, paid:0, remaining:r.total, installments:r.installments, paidInstallments:0, monthly:r.monthly, rate:r.rate, purpose:r.purpose, status:'active', createdAt:now() }; db.loans.push(l); if (u && !u.unlimitedFunds) u.balance = money(u.balance + r.amount); if (u) db.notifications.push({ id:id('note'), userId:u.id, title:'Empréstimo aprovado', text:`R$ ${r.amount.toFixed(2)} liberados em ${r.installments} parcelas de R$ ${r.monthly.toFixed(2)}.`, read:false, createdAt:now() }); }
    else if (u) db.notifications.push({ id:id('note'), userId:u.id, title:'Empréstimo não aprovado', text:reason || 'Sua solicitação não foi aprovada nesta rodada.', read:false, createdAt:now() });
    saveDB(); return r;
  }
  function loanPay(user, loanId) {
    const l = db.loans.find(x => x.id === loanId && x.userId === user.id); if (!l) throw new BankError('Empréstimo não encontrado');
    if (l.status !== 'active') throw new BankError('Este empréstimo já foi quitado');
    const value = Math.min(l.monthly, l.remaining); if (!user.unlimitedFunds && user.balance < value) throw new BankError('Saldo insuficiente para pagar a parcela');
    if (!user.unlimitedFunds) user.balance = money(user.balance - value); l.paid = money(l.paid + value); l.remaining = money(Math.max(0, l.remaining - value)); l.paidInstallments += 1; if (l.remaining <= 0.01) { l.remaining = 0; l.status = 'paid'; }
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'loan_payment', amount:-value, description:`Parcela ${l.paidInstallments}/${l.installments} do empréstimo`, createdAt:now() }); saveDB(); return l;
  }
  function claimBonus(user) {
    if (Date.now() - (user.lastBonus||0) < 24*3600*1000) throw new BankError('O bônus volta em 24h');
    const reward = Math.floor(Math.random()*61) + 20;
    user.balance = money(user.balance + reward); user.lastBonus = Date.now(); saveDB(); return reward;
  }
  function creditRequest(user, { amount, purpose }) {
    if (!(Number(amount) > 50)) throw new BankError('mínimo R$ 50');
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
      metrics: { players: players.length, pendingCredits: db.creditRequests.filter(r => r.status==='pending').length, pendingLoans: db.loanRequests.filter(r => r.status==='pending').length, pendingFinancing: db.vehicleFinancings.filter(f => f.status==='pending').length, moneyInPlay: money(players.reduce((s,u)=>s+u.balance,0)), avgScore: players.length ? Math.round(players.reduce((s,u)=>s+u.score,0)/players.length) : 0 },
      pending: db.creditRequests.filter(r => r.status==='pending'),
      pendingLoans: db.loanRequests.filter(r => r.status==='pending'),
      pendingFinancing: db.vehicleFinancings.filter(f => f.status==='pending'),
      pendingBlackCards: players.filter(u => u.blackCardStatus === 'pending').map(u => ({ id:u.id, fullName:u.fullName, username:u.username, score:u.score })),
      users: players.map(u => { const c={...u}; delete c.password; delete c.token; delete c.tokens; return c; }),
      support: db.supportMessages.slice(-30),
    };
  }
  function masterDeposit(userId, amount, reason) {
    const u = byId(userId); if (!u) throw new BankError('Usuário não encontrado');
    u.balance = money(u.balance + Number(amount));
    db.transactions.push({ id:id('tx'), userId:u.id, kind:'deposit', amount:money(amount), description:reason||'Depósito master', createdAt:now() }); saveDB();
  }
  function updateAvatar(user, avatarUrl) { user.avatarUrl = String(avatarUrl || '').trim().slice(0,500); saveDB(); return user.avatarUrl; }
  function updateProfileName(user, fullName) {
    const name = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!/^[^ ]+ [^ ]+/.test(name) || name.length > 80) throw new BankError('Informe nome e sobrenome válidos');
    user.fullName = name; saveDB(); return user.fullName;
  }
  function masterAdjustBalance(userId, amount, reason) {
    const u = byId(userId); const v = Number(amount); if (!u) throw new BankError('Usuário não encontrado');
    if (!Number.isFinite(v) || v === 0) throw new BankError('Informe um valor diferente de zero');
    if (u.balance + v < 0) throw new BankError('Saldo do usuário não pode ficar negativo');
    u.balance = money(u.balance + v); db.transactions.push({ id:id('tx'), userId:u.id, kind:v > 0 ? 'master_credit' : 'master_debit', amount:money(v), description:reason || (v > 0 ? 'Saldo adicionado pelo master' : 'Saldo removido pelo master'), createdAt:now() }); saveDB(); return u;
  }
  function masterSetBan(admin, userId, banned, reason) {
    const u = byId(userId); if (!u) throw new BankError('Usuário não encontrado');
    if (u.id === admin.id || u.role === 'admin') throw new BankError('O master não pode banir outro master');
    u.banned = !!banned; u.bannedAt = u.banned ? now() : null; if (u.banned) u.token = null;
    db.notifications.push({ id:id('note'), userId:u.id, title:u.banned ? 'Conta banida' : 'Conta reativada', text:reason || (u.banned ? 'Sua conta foi banida pelo master.' : 'Sua conta foi reativada pelo master.'), read:false, createdAt:now() }); saveDB(); return u;
  }
  function masterSetRole(admin, userId, role) {
    const u = byId(userId); if (!u) throw new BankError('Usuário não encontrado');
    if (u.id === admin.id || u.role === 'admin') throw new BankError('O master não pode alterar o próprio cargo');
    if (!['user','seller'].includes(role)) throw new BankError('Cargo inválido');
    u.role = role; saveDB(); return u;
  }
  function masterAdjustCredit(userId, limit, reason) {
    const u = byId(userId); const v = Number(limit); if (!u) throw new BankError('Usuário não encontrado');
    if (!Number.isFinite(v) || v < 0 || v < u.creditUsed) throw new BankError('O limite não pode ser menor que o crédito usado');
    u.creditLimit = money(v); db.notifications.push({ id:id('note'), userId:u.id, title:'Limite de crédito atualizado', text:reason || `Seu limite agora é ${money(v).toFixed(2)}.`, read:false, createdAt:now() }); saveDB(); return u;
  }
  function masterAdjustWallet(userId, wallet, amount, reason) {
    const u = byId(userId); const v = Number(amount); if (!u) throw new BankError('Usuário não encontrado');
    if (!['storeCredit','virtualCoins','magicCoins'].includes(wallet)) throw new BankError('Moeda inválida');
    if (!Number.isFinite(v) || v === 0) throw new BankError('Informe um valor diferente de zero');
    const next = Number(u[wallet] || 0) + v; if (next < 0) throw new BankError('A carteira não pode ficar negativa');
    u[wallet] = wallet === 'storeCredit' ? money(next) : Math.floor(next);
    const labels = { storeCredit:'vale da loja', virtualCoins:'moedas virtuais', magicCoins:'moedas mágicas' };
    db.notifications.push({ id:id('note'), userId:u.id, title:'Carteira atualizada', text:reason || `${v > 0 ? 'Você recebeu' : 'Foi removido'} ${Math.abs(v)} ${labels[wallet]}.`, read:false, createdAt:now() }); saveDB(); return u;
  }
  const paymentMethods = [
    { id:'money', label:'Dinheiro', currency:'BRL', mode:'balance' }, { id:'debit_card', label:'Cartão de débito', currency:'BRL', mode:'balance' },
    { id:'credit_card', label:'Cartão de crédito', currency:'BRL', mode:'credit' }, { id:'pix', label:'PIX', currency:'BRL', mode:'balance' },
    { id:'installment', label:'Carnê / parcelado', currency:'BRL', mode:'credit' }, { id:'bank_transfer', label:'Transferência bancária', currency:'BRL', mode:'balance' },
    { id:'auto_debit', label:'Débito automático', currency:'BRL', mode:'balance' }, { id:'store_credit', label:'Vale / crédito da loja', currency:'STORE', mode:'store' },
    { id:'virtual_coin', label:'Moeda virtual do servidor', currency:'VIRTUAL', mode:'virtual' }, { id:'magic_coin', label:'Moeda mágica para a loja de itens', currency:'MAGIC', mode:'magic' },
  ];
  function paymentCatalog(user) { return { methods:paymentMethods, balances:{ money:user.unlimitedFunds ? null : money(user.balance), storeCredit:user.unlimitedFunds ? null : money(user.storeCredit), virtualCoins:user.unlimitedFunds ? null : user.virtualCoins, magicCoins:user.unlimitedFunds ? null : user.magicCoins }, autoDebit:user.autoDebit }; }
  function createProduct(admin, data) {
    if (!admin || !['admin','seller'].includes(admin.role)) throw new BankError('Apenas o master ou vendedores podem publicar produtos');
    if (!data.name || !(Number(data.price) > 0)) throw new BankError('Informe nome e preço válido');
    const p = { id:id('product'), name:String(data.name).trim().slice(0,80), description:String(data.description||'').trim().slice(0,240), imageUrl:String(data.imageUrl||'').trim().slice(0,500), category:['shirt','pants','shoes','accessory','item'].includes(data.category) ? data.category : 'item', price:money(data.price), currency:['BRL','STORE','VIRTUAL','MAGIC'].includes(data.currency) ? data.currency : 'BRL', stock:Math.max(0, parseInt(data.stock,10) || 0), active:data.active !== false, sellerId:admin.id, createdAt:now() };
    db.products.push(p); saveDB(); return p;
  }
  function canManageProduct(actor, product) { return actor && (actor.role === 'admin' || (actor.role === 'seller' && product.sellerId === actor.id)); }
  function updateProduct(actor, productId, data) {
    const p = db.products.find(x => x.id === productId); if (!p) throw new BankError('Produto não encontrado');
    if (!canManageProduct(actor, p)) throw new BankError('Você não pode editar este produto');
    if (!data.name || !(Number(data.price) > 0)) throw new BankError('Informe nome e preço válido');
    p.name = String(data.name).trim().slice(0,80); p.description = String(data.description||'').trim().slice(0,240); p.imageUrl = String(data.imageUrl||'').trim().slice(0,500); p.category = ['shirt','pants','shoes','accessory','item'].includes(data.category) ? data.category : (p.category || 'item'); p.price = money(data.price); p.currency = ['BRL','STORE','VIRTUAL','MAGIC'].includes(data.currency) ? data.currency : p.currency; p.stock = Math.max(0, parseInt(data.stock,10) || 0); saveDB(); return p;
  }
  function deleteProduct(actor, productId) {
    const p = db.products.find(x => x.id === productId); if (!p) throw new BankError('Produto não encontrado');
    if (!canManageProduct(actor, p)) throw new BankError('Você não pode excluir este produto');
    p.active = false; p.deletedAt = now(); saveDB(); return p;
  }
  function products() { return db.products.filter(p => p.active && p.stock >= 0).map(p => ({...p})); }
  function purchaseProduct(user, productId, method) {
    const p = db.products.find(x => x.id === productId && x.active && x.stock >= 0); if (!p) throw new BankError('Produto não encontrado ou sem estoque');
    const m = paymentMethods.find(x => x.id === method); if (!m) throw new BankError('Forma de pagamento inválida');
    if (p.currency === 'BRL' && m.currency !== 'BRL') throw new BankError('Use um meio em reais');
    if (p.currency !== m.currency) throw new BankError('A moeda não corresponde ao produto');
    const v = p.price;
    if (!user.unlimitedFunds) {
      if (m.mode === 'credit') { if (user.creditUsed + v > user.creditLimit) throw new BankError('Limite de crédito insuficiente'); user.creditUsed = money(user.creditUsed + v); }
      else if (m.mode === 'balance') { if (user.balance < v) throw new BankError('Saldo insuficiente'); user.balance = money(user.balance - v); }
      else if (m.mode === 'store') { if (user.storeCredit < v) throw new BankError('Vale/crédito da loja insuficiente'); user.storeCredit = money(user.storeCredit - v); }
      else if (m.mode === 'virtual') { if (user.virtualCoins < v) throw new BankError('Moeda virtual insuficiente'); user.virtualCoins -= v; }
      else if (m.mode === 'magic') { if (user.magicCoins < v) throw new BankError('Moeda mágica insuficiente'); user.magicCoins -= v; }
    }
    if (p.stock > 0) p.stock -= 1;
    db.transactions.push({ id:id('tx'), userId:user.id, kind:'product_purchase', amount:m.currency === 'BRL' ? -v : 0, description:`${p.name} — ${m.label}`, createdAt:now(), productId:p.id, paymentMethod:method }); saveDB(); return p;
  }
  function createVehicle(admin, data) {
    if (!admin || admin.role !== 'admin') throw new BankError('Apenas o master pode cadastrar veículos');
    if (!data.name || !(Number(data.price) > 0)) throw new BankError('Informe modelo e preço válido');
    const v = { id:id('vehicle'), name:String(data.name).trim().slice(0,100), description:String(data.description||'').trim().slice(0,240), imageUrl:String(data.imageUrl||'').trim().slice(0,500), price:money(data.price), year:String(data.year||'').slice(0,9), active:true, createdAt:now() }; db.vehicleListings.push(v); saveDB(); return v;
  }
  function vehicles() { return db.vehicleListings.filter(v => v.active).map(v => ({...v})); }
  function requestVehicleFinance(user, vehicleId, data) {
    const v = db.vehicleListings.find(x => x.id === vehicleId && x.active); if (!v) throw new BankError('Veículo não encontrado');
    if (db.vehicleFinancings.some(f => f.userId === user.id && ['pending','active'].includes(f.status))) throw new BankError('Você já possui um financiamento em análise ou ativo');
    const down = money(data.downPayment || 0); const n = Math.max(6, Math.min(72, parseInt(data.installments,10)||48)); if (down < 0 || down >= v.price) throw new BankError('Entrada inválida');
    const financed = money(v.price - down); const rate = Number(user.score||0) >= 750 ? .012 : .018; const total = money(financed * (1 + rate*n)); const f = { id:id('fin'), vehicleId:v.id, userId:user.id, vehicleName:v.name, imageUrl:v.imageUrl, vehiclePrice:v.price, downPayment:down, financed, installments:n, rate, total, monthly:money(total/n), paid:0, remaining:total, paidInstallments:0, status:'pending', createdAt:now() }; db.vehicleFinancings.push(f); saveDB(); return f;
  }
  function decideVehicleFinance(admin, financingId, decision, reason) {
    if (!admin || admin.role !== 'admin') throw new BankError('Apenas o master pode analisar financiamentos'); const f = db.vehicleFinancings.find(x => x.id === financingId); if (!f || f.status !== 'pending') throw new BankError('Financiamento inválido'); f.status = decision === 'approve' ? 'active' : 'rejected'; f.decisionNote = String(reason||'').slice(0,160); f.decidedAt = now(); const u = byId(f.userId); if (u) db.notifications.push({ id:id('note'), userId:u.id, title:decision === 'approve' ? 'Financiamento aprovado' : 'Financiamento reprovado', text:decision === 'approve' ? `${f.vehicleName} aprovado em ${f.installments} parcelas de R$ ${f.monthly.toFixed(2)}.` : (reason || 'Financiamento não aprovado.'), read:false, createdAt:now() }); saveDB(); return f;
  }
  function payVehicleFinance(user, financingId) {
    const f = db.vehicleFinancings.find(x => x.id === financingId && x.userId === user.id); if (!f) throw new BankError('Financiamento não encontrado'); if (f.status !== 'active') throw new BankError('Financiamento não está ativo'); const value = Math.min(f.monthly, f.remaining); if (!user.unlimitedFunds && user.balance < value) throw new BankError('Saldo insuficiente para a parcela'); if (!user.unlimitedFunds) user.balance = money(user.balance-value); f.paid = money(f.paid+value); f.remaining = money(Math.max(0,f.remaining-value)); f.paidInstallments += 1; if (f.remaining <= .01) { f.remaining=0; f.status='paid'; } db.transactions.push({ id:id('tx'), userId:user.id, kind:'vehicle_finance_payment', amount:-value, description:`Parcela ${f.paidInstallments}/${f.installments} — ${f.vehicleName}`, createdAt:now() }); saveDB(); return f;
  }
  function contractLifeInsurance(user, data) {
    if (db.lifePolicies.some(p => p.userId === user.id && p.status === 'active')) throw new BankError('Você já possui um seguro de vida ativo'); const plan = ['essencial','familia','premium'].includes(data.plan) ? data.plan : 'essencial'; const plans = { essencial:{premium:29.90,coverage:50000}, familia:{premium:59.90,coverage:150000}, premium:{premium:99.90,coverage:300000} }; const p = { id:id('life'), userId:user.id, plan, premium:plans[plan].premium, coverage:plans[plan].coverage, status:'active', createdAt:now() }; db.lifePolicies.push(p); saveDB(); return p;
  }
  function configureAutoDebit(user, data) {
    const amount = money(data.amount); if (data.enabled && amount <= 0) throw new BankError('Informe um valor válido');
    user.autoDebit = { enabled:!!data.enabled, description:String(data.description||'').slice(0,100), amount, nextRun:data.enabled ? (data.nextRun || now()) : null }; saveDB(); return user.autoDebit;
  }
  function changePassword(user, oldPassword, newPassword) {
    if (!verifyPassword(oldPassword, user.password)) throw new BankError('Senha atual incorreta');
    if (!newPassword || String(newPassword).length < 4) throw new BankError('Senha muito curta');
    user.password = hashPassword(newPassword); user.token = crypto.randomBytes(32).toString('hex'); user.tokens = [user.token]; saveDB(); return user.token;
  }

  return { byId, userFromToken, login, register, updateAvatar, updateProfileName, lookupKey, parsePixTarget, pixSend, payInstallment, applyReferral, addKey, removeKey, cardPurchase, requestBlackCard, decideBlackCard, toggleCard, payInvoice, creditDraw, savingsMove, accountState, scoreProfile, acceptPreApproved, loanRequest, loanDecide, loanPay, createVehicle, vehicles, requestVehicleFinance, decideVehicleFinance, payVehicleFinance, contractLifeInsurance, claimBonus, creditRequest, creditDecide, supportSend, supportReply, markNotifsRead, masterOverview, masterDeposit, masterAdjustBalance, masterSetBan, masterSetRole, masterAdjustCredit, masterAdjustWallet, paymentCatalog, createProduct, updateProduct, deleteProduct, products, purchaseProduct, configureAutoDebit, changePassword, db: () => db };
}

module.exports = { createBank, BankError };
