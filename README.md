# GhostBank

## Assistente de suporte com Mistral

O chat de suporte usa a API Mistral no servidor, com o modelo `ministral-3b-2512` por padrão. A chave nunca deve ser colocada no frontend ou versionada no Git.

Configure `MISTRAL_API_KEY` como variável secreta do ambiente que executa o serviço. Em uma implantação Render, adicione a chave no painel do serviço em **Environment**; o `render.yaml` declara a variável como secreta e solicita que o valor seja configurado fora do repositório. O modelo pode ser trocado com `MISTRAL_MODEL`; se omitido, usa `ministral-3b-2512`.

Para executar localmente, exporte `MISTRAL_API_KEY` no shell antes de iniciar o servidor. O arquivo `.env.example` é apenas uma referência e não é carregado automaticamente pelo Node.js.

Se a chave estiver ausente ou a API falhar, o chat continua aceitando mensagens e mantém a conversa na fila do suporte humano. Pedidos explícitos de atendente, casos pessoais de conta, transações problemáticas e assuntos sensíveis também são encaminhados à equipe humana. O assistente não recebe saldo ou extrato, não executa operações e redige padrões comuns de dados sensíveis antes de persistir mensagens ou enviá-las à Mistral.

Execute os testes com `npm test`.
