'use strict';
// Rodar: node test/bank.test.js  (sem dependências externas)
const assert = require('assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
const { createBank, BankError } = require('../bank');
const { registerRoutes } = require('../server');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'armin-')), 'db.json');
const bank = createBank({ file });
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('ok  -', name); } catch (e) { console.error('FAIL -', name, '\n', e); process.exitCode = 1; } };
const throwsMsg = (fn, re) => assert.throws(fn, (e) => e instanceof BankError && re.test(e.message));

const lia = () => bank.byId('usr_aventureiro');
t('login com senha errada falha / correta funciona', () => {
  throwsMsg(() => bank.login('aventureiro', 'x'), /inválidos/);
  const { token } = bank.login('aventureiro', '1234'); assert.ok(token);
  assert.ok(bank.userFromToken(token));
  assert.ok(bank.db().users.every((u) => u.password.startsWith('scrypt$')), 'senhas com hash');
});
t('login pelo e-mail da chave Pix', () => { assert.strictEqual(bank.login('lia@aventura.rpg', '1234').user.id, 'usr_aventureiro'); });
t('cadastro valida e cria conta com chave Pix', () => {
  throwsMsg(() => bank.register({ fullName: 'Ze', username: 'ze', password: '123456' }), /nome completo/);
  throwsMsg(() => bank.register({ fullName: 'Zé Silva', username: 'Z!', password: '123456' }), /Usuário/);
  throwsMsg(() => bank.register({ fullName: 'Zé Silva', username: 'zesilva', password: '123' }), /senha/);
  const { user } = bank.register({ fullName: 'Zé Silva', username: 'zesilva', password: '123456' });
  assert.strictEqual(user.pixKeys.length, 1); assert.strictEqual(user.creditLimit, 500);
  throwsMsg(() => bank.register({ fullName: 'Zé Silva', username: 'zesilva', password: '123456' }), /já existe/);
});
t('Pix: valida, move dinheiro dos dois lados e gera extrato', () => {
  const ze = bank.db().users.find((u) => u.username === 'zesilva');
  const before = lia().balance;
  throwsMsg(() => bank.pixSend(lia(), { key: 'naoexiste', amount: 10 }), /não encontrada/);
  throwsMsg(() => bank.pixSend(lia(), { key: 'lia@aventura.rpg', amount: 10 }), /você mesmo/);
  throwsMsg(() => bank.pixSend(lia(), { key: ze.pixKeys[0].value, amount: 0 }), /valor válido/);
  throwsMsg(() => bank.pixSend(lia(), { key: ze.pixKeys[0].value, amount: -5 }), /valor válido/);
  throwsMsg(() => bank.pixSend(lia(), { key: ze.pixKeys[0].value, amount: 999999 }), /limite|Saldo/);
  bank.pixSend(lia(), { key: ze.pixKeys[0].value.toLowerCase(), amount: 100.55, description: 'teste' });
  assert.strictEqual(lia().balance, Math.round((before - 100.55) * 100) / 100);
  assert.strictEqual(ze.balance, 100.55);
  assert.ok(bank.accountState(ze).transactions.some((x) => x.kind === 'pix_in' && x.amount === 100.55));
  assert.ok(bank.accountState(lia()).transactions.some((x) => x.kind === 'pix_out' && x.amount === -100.55));
  throwsMsg(() => bank.pixSend(ze, { key: lia().pixKeys[0].value, amount: 100.56 }), /Saldo insuficiente/);
});
t('chaves Pix: adicionar, duplicada, inválida, remover, mínimo 1', () => {
  const ze = bank.db().users.find((u) => u.username === 'zesilva');
  throwsMsg(() => bank.addKey(ze, { type: 'email', value: 'x' }), /e-mail/);
  bank.addKey(ze, { type: 'email', value: 'Ze@Mail.com' });
  throwsMsg(() => bank.addKey(ze, { type: 'email', value: 'ze@mail.com' }), /já está/);
  bank.addKey(ze, { type: 'telefone', value: '(11) 91234-5678' });
  assert.ok(bank.lookupKey(lia(), '11912345678'));
  const [a, b, c] = ze.pixKeys; bank.removeKey(ze, b.id); bank.removeKey(ze, c.id);
  throwsMsg(() => bank.removeKey(ze, a.id), /ao menos uma/);
});
t('cartão: compra, limite, bloqueio, pagamento de fatura e score', () => {
  const u = lia(); const used = u.creditUsed;
  throwsMsg(() => bank.cardPurchase(u, { merchant: 'Loja', amount: 99999 }), /Limite insuficiente/);
  bank.cardPurchase(u, { merchant: 'Loja', amount: 100 });
  assert.strictEqual(u.creditUsed, used + 100);
  bank.toggleCard(u); throwsMsg(() => bank.cardPurchase(u, { merchant: 'Loja', amount: 1 }), /bloqueado/); bank.toggleCard(u);
  throwsMsg(() => bank.payInvoice(u, 999999), /valor informado|limite/);
  const score = u.score; bank.payInvoice(u, u.creditUsed);
  assert.strictEqual(u.creditUsed, 0); assert.strictEqual(u.score, score + 15);
  throwsMsg(() => bank.payInvoice(u, 10), /zerada/);
});
t('saque do crédito cobra 3% e respeita o limite', () => {
  const u = lia(); const bal = u.balance;
  bank.creditDraw(u, 100); assert.strictEqual(u.balance, bal + 100); assert.strictEqual(u.creditUsed, 103);
  throwsMsg(() => bank.creditDraw(u, 5), /valor|mínimo/);
  throwsMsg(() => bank.creditDraw(u, u.creditLimit), /Limite insuficiente/);
  bank.payInvoice(u, 103);
});
t('cofrinho: guardar, resgatar, rendimento por hora', () => {
  const u = lia(); const bal = u.balance;
  bank.savingsMove(u, 'in', 1000); assert.strictEqual(u.savings, 1000); assert.strictEqual(u.balance, Math.round((bal - 1000) * 100) / 100);
  throwsMsg(() => bank.savingsMove(u, 'out', 5000), /guardado/);
  u.savingsAt -= 720 * 3600000; // 1 mês
  const st = bank.accountState(u);
  assert.ok(Math.abs(u.savings - 1010) < 0.05, `rendimento ~1%/mês, veio ${u.savings}`);
  assert.ok(st.transactions.some((x) => x.kind === 'savings_yield'));
  bank.savingsMove(u, 'out', u.savings); assert.strictEqual(u.savings, 0);
});
t('bônus diário só 1 vez', () => {
  const u = lia(); const r = bank.claimBonus(u); assert.ok(r >= 20 && r <= 80);
  throwsMsg(() => bank.claimBonus(u), /volta em/);
});
t('crédito: pedido, duplicado, aprovação sobe limite, reprovação notifica', () => {
  const u = lia();
  throwsMsg(() => bank.creditRequest(u, { amount: 50, purpose: 'x' }), /mínimo/);
  const r = bank.creditRequest(u, { amount: 5000, purpose: 'Armadura' });
  throwsMsg(() => bank.creditRequest(u, { amount: 5000, purpose: 'x' }), /aguardando/);
  bank.creditDecide(r.id, 'approve'); assert.strictEqual(u.creditLimit, 5000);
  throwsMsg(() => bank.creditDecide(r.id, 'approve'), /já decidida/);
  const r2 = bank.creditRequest(u, { amount: 9000, purpose: 'Castelo' }); bank.creditDecide(r2.id, 'reject', 'Não por agora');
  assert.ok(bank.accountState(u).notifications.some((n) => n.title === 'Análise encerrada'));
});
t('suporte e master', () => {
  const u = lia(); bank.supportSend(u, 'Olá!'); throwsMsg(() => bank.supportSend(u, '   '), /mensagem/);
  const ov = bank.masterOverview(); assert.ok(ov.threads.find((x) => x.userId === u.id && x.awaiting));
  bank.supportReply(u.id, 'Oi Lia'); assert.ok(bank.accountState(u).supportMessages.some((m) => m.role === 'support'));
  const bal = u.balance; bank.masterDeposit(u.id, 250, 'prêmio'); assert.strictEqual(u.balance, bal + 250);
  throwsMsg(() => bank.masterDeposit('nao', 5), /não encontrado/);
});
t('troca de senha invalida sessões antigas', () => {
  const { token, user } = bank.login('aventureiro', '1234');
  throwsMsg(() => bank.changePassword(user, 'errada', 'novasenha'), /incorreta/);
  const n = bank.changePassword(user, '1234', 'novasenha');
  assert.strictEqual(bank.userFromToken(token), null); assert.ok(bank.userFromToken(n));
  bank.changePassword(user, 'novasenha', 'senha1234');
});
t('persistência: reabrir o arquivo mantém tudo', () => {
  const again = createBank({ file }); assert.strictEqual(again.byId('usr_aventureiro').creditLimit, 5000);
});
t('bloqueio após 5 logins errados', () => {
  for (let i = 0; i < 5; i++) { try { bank.login('master', 'errada'); } catch (_) {} }
  throwsMsg(() => bank.login('master', 'master'), /Muitas tentativas/);
});

/* ---- camada HTTP com app falso ---- */
t('rotas HTTP: auth, 401, 403 e fluxo Pix', () => {
  const routes = {};
  const app = { get: (p, ...h) => routes[`GET ${p}`] = h, post: (p, ...h) => routes[`POST ${p}`] = h, delete: (p, ...h) => routes[`DELETE ${p}`] = h };
  const emitted = []; registerRoutes(app, bank, { users: (i) => emitted.push(...i), masters: () => {} });
  const call = (key, { headers = {}, body = {}, params = {} } = {}) => {
    const req = { headers, body, params }; let out;
    const res = { status(c) { this.code = c; return this; }, json(o) { out = { code: this.code || 200, ...o }; return this; } };
    const chain = routes[key]; let i = 0; const next = () => { const f = chain[i++]; if (f) f(req, res, next); }; next(); return out;
  };
  assert.strictEqual(call('GET /api/me').code, 401);
  const login = call('POST /api/login', { body: { username: 'aventureiro', password: 'senha1234' } });
  const H = { authorization: `Bearer ${login.token}` };
  assert.strictEqual(call('GET /api/master/overview', { headers: H }).code, 403);
  const ze = bank.db().users.find((u) => u.username === 'zesilva');
  const r = call('POST /api/pix/send', { headers: H, body: { key: ze.pixKeys[0].value, amount: 1, description: 'x' } });
  assert.strictEqual(r.ok, true); assert.ok(emitted.includes(ze.id));
  assert.strictEqual(call('POST /api/pix/send', { headers: H, body: { key: 'zzz', amount: 1 } }).code, 404);
  assert.strictEqual(call('POST /api/savings/:dir', { headers: H, params: { dir: 'xx' }, body: { amount: 1 } }).code, 400);
  assert.strictEqual(call('GET /api/card/secret', { headers: H }).card.cvv.length, 3);
  assert.ok(!JSON.stringify(call('GET /api/me', { headers: H })).includes('scrypt'), 'nunca vaza hash');
});
console.log(`\n${passed} testes passaram`);
