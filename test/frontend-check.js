'use strict';
// Verifica estaticamente: todo botão/formulário do HTML tem handler (sem "funções fantasmas") e o JS compila.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const script = html.match(/<script>\n'use strict';([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // erro de sintaxe estoura aqui
const keysOf = (name) => { const m = script.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`)); return new Set([...m[1].matchAll(/(?:^|,)\s*(\w+):/gm)].map((x) => x[1])); };
const A = keysOf('A'), F = keysOf('F'), CH = new Set([...script.match(/const CH = \{([\s\S]*?)\};/)[1].matchAll(/(\w+):/g)].map((x) => x[1]));
A.add('closeSheet');
const used = (re) => new Set([...html.matchAll(re)].map((x) => x[1]));
let bad = 0;
for (const [label, set, have] of [['data-act', used(/data-act="(\w+)"/g), A], ['data-form', used(/data-form="(\w+)"/g), F], ['data-change', used(/data-change="(\w+)"/g), CH]]) {
  for (const k of set) if (!have.has(k)) { console.error(`FALTA handler para ${label}="${k}"`); bad++; }
}
// formulários dinâmicos: data-form="${reg ? 'register' : 'login'}"
for (const k of ['register', 'login']) if (!F.has(k)) { console.error('FALTA form', k); bad++; }
const unusedA = [...A].filter((k) => !new RegExp(`data-act="${k}"`).test(html) && !['closeSheet','password'].includes(k));
console.log(`ações: ${A.size}, formulários: ${F.size}. Handlers sem uso: ${unusedA.join(', ') || 'nenhum'}`);
if (bad) { console.error(`${bad} problema(s)`); process.exit(1); } else console.log('frontend ok — nenhum botão fantasma');
