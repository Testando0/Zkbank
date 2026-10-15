'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBank } = require('../bank');
const { registerRoutes } = require('../server');
const {
  API_URL,
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  buildConversation,
  redactSensitive,
  requiresHumanSupport,
} = require('../support-ai');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostbank-support-ai-'));
  const bank = createBank({ file: path.join(dir, 'db.json') });
  const { token, user } = bank.login('redzin', 'redzin012');
  const routes = {};
  const app = {
    get: (route, ...handlers) => { routes[`GET ${route}`] = handlers; },
    post: (route, ...handlers) => { routes[`POST ${route}`] = handlers; },
    delete: (route, ...handlers) => { routes[`DELETE ${route}`] = handlers; },
  };
  registerRoutes(app, bank, { users: () => {}, masters: () => {} });
  return { bank, routes, token, user };
}

async function callSupport(routes, token, text) {
  const chain = routes['POST /api/support/messages'];
  let output;
  const req = { headers: { authorization: `Bearer ${token}` }, body: { text } };
  const res = {
    status(code) { this.code = code; return this; },
    json(data) { output = { status: this.code || 200, ...data }; return this; },
  };
  chain[0](req, res, () => {});
  if (output) return output;
  await chain[1](req, res);
  return output;
}

function threadAwaiting(bank, userId) {
  const thread = bank.masterOverview().threads.find((item) => item.userId === userId);
  return Boolean(thread && thread.awaiting);
}

async function main() {
  assert.ok(SYSTEM_PROMPT.includes('não recebe saldo, extrato'));
  assert.ok(SYSTEM_PROMPT.includes('Pix'));
  assert.strictEqual(DEFAULT_MODEL, 'ministral-3b-2512');
  assert.strictEqual(requiresHumanSupport('Quero falar com uma atendente.'), true);
  assert.strictEqual(requiresHumanSupport('Meu Pix não caiu.'), true);
  assert.strictEqual(requiresHumanSupport('Meu CVV: 123'), true);
  assert.strictEqual(requiresHumanSupport('4111111111111111'), true);
  assert.strictEqual(requiresHumanSupport('Como criar uma chave Pix?'), false);

  const redacted = redactSensitive('CPF 123.456.789-00, cartão 4111111111111111, CVV: 123, senha: segredo123');
  for (const secret of ['123.456.789-00', '4111111111111111', 'CVV: 123', 'senha: segredo123']) {
    assert.ok(!redacted.includes(secret), `dado sensível deveria ter sido ocultado: ${secret}`);
  }
  const context = buildConversation([
    { role: 'assistant', text: 'resposta anterior' },
    { role: 'user', text: 'Cartão 4111111111111111' },
    { role: 'assistant', text: 'Não compartilhe esse dado.' },
    { role: 'user', text: 'Como vejo o Cofrinho?' },
  ]);
  assert.strictEqual(context[0].role, 'user');
  assert.ok(!JSON.stringify(context).includes('4111111111111111'));

  const originalFetch = global.fetch;
  const originalKey = process.env.MISTRAL_API_KEY;
  const originalModel = process.env.MISTRAL_MODEL;
  let requests = 0;
  let replies = [];
  global.fetch = async (url, options) => {
    requests++;
    assert.strictEqual(url, API_URL);
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers.Authorization, 'Bearer test-key-not-real');
    const body = JSON.parse(options.body);
    assert.strictEqual(body.model, DEFAULT_MODEL);
    assert.deepStrictEqual(body.response_format, { type: 'json_object' });
    assert.strictEqual(body.messages[0].role, 'system');
    const assistant = replies.shift();
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(assistant) } }] }) };
  };

  try {
    process.env.MISTRAL_API_KEY = 'test-key-not-real';
    delete process.env.MISTRAL_MODEL;
    const { bank, routes, token, user } = setup();
    replies = [
      { reply: 'O Cofrinho mostra o rendimento aproximado informado no app.', escalate: false },
      { reply: 'Precisa de análise humana.', escalate: true },
      { reply: 'Encaminhei para o suporte humano.', escalate: false },
    ];

    const answered = await callSupport(routes, token, 'Como funciona o Cofrinho?');
    assert.strictEqual(answered.status, 200);
    assert.strictEqual(answered.ok, true);
    assert.strictEqual(answered.handoff, false);
    assert.strictEqual(threadAwaiting(bank, user.id), false);
    assert.ok(answered.state.supportMessages.some((message) => message.role === 'assistant' && message.text.includes('Cofrinho')));

    const escalatedByAssistant = await callSupport(routes, token, 'Tenho uma dúvida que precisa de análise.');
    assert.strictEqual(escalatedByAssistant.handoff, true);
    assert.strictEqual(threadAwaiting(bank, user.id), true);
    assert.ok(escalatedByAssistant.state.supportMessages.some((message) => message.role === 'assistant' && message.text.includes('suporte humano')));

    const inconsistent = await callSupport(routes, token, 'Preciso de ajuda com uma situação que não está no app.');
    assert.strictEqual(inconsistent.handoff, true, 'afirmação de encaminhamento deve manter a conversa na fila');
    assert.strictEqual(threadAwaiting(bank, user.id), true);

    const requestsBeforeHumanIntent = requests;
    const human = await callSupport(routes, token, 'Quero falar com uma pessoa do suporte.');
    assert.strictEqual(human.handoff, true);
    assert.strictEqual(requests, requestsBeforeHumanIntent, 'pedido explícito de atendente não precisa chamar o modelo');
    assert.strictEqual(threadAwaiting(bank, user.id), true);

    const secretMessage = await callSupport(routes, token, 'Meu CVV: 123');
    assert.strictEqual(secretMessage.handoff, true);
    assert.ok(!secretMessage.state.supportMessages.some((message) => message.text.includes('CVV: 123')));
    assert.strictEqual(requests, requestsBeforeHumanIntent, 'dados sensíveis não são enviados à Mistral');

    const noKeySetup = setup();
    delete process.env.MISTRAL_API_KEY;
    const unavailable = await callSupport(noKeySetup.routes, noKeySetup.token, 'Como faço para ver as notificações?');
    assert.strictEqual(unavailable.status, 200);
    assert.strictEqual(unavailable.handoff, true);
    assert.strictEqual(threadAwaiting(noKeySetup.bank, noKeySetup.user.id), true);
    assert.strictEqual(requests, requestsBeforeHumanIntent, 'sem chave, nenhuma chamada externa deve ser feita');

    const pendingOne = noKeySetup.bank.supportSend(noKeySetup.user, 'Primeira solicitação pendente');
    const pendingTwo = noKeySetup.bank.supportSend(noKeySetup.user, 'Segunda solicitação pendente');
    assert.ok(pendingOne.id && pendingTwo.id);
    noKeySetup.bank.supportReply(noKeySetup.user.id, 'A equipe respondeu ao thread.');
    assert.strictEqual(threadAwaiting(noKeySetup.bank, noKeySetup.user.id), false, 'a resposta humana encerra todas as pendências do mesmo thread');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.MISTRAL_MODEL;
    else process.env.MISTRAL_MODEL = originalModel;
  }

  console.log('ok  - suporte IA Mistral, privacidade e escalonamento humano');
}

main().catch((error) => {
  console.error('FAIL - suporte IA Mistral', error);
  process.exitCode = 1;
});
