# Integração da política de custo no Radar Contatos

## Objetivo
Reduzir fortemente o custo por contato sem perder confiabilidade comercial.

## Arquitetura escolhida
A política econômica não será implementada como simples troca de modelo no navegador. O caminho correto é a função server-side `supabase/functions/validar-contato-v2/index.ts`.

Isso evita:
- chave OpenAI exposta no navegador;
- usuário alterar limites de custo localmente;
- múltiplas buscas genéricas por contato;
- reprocessamento sem cache;
- falta de telemetria centralizada.

## Modelos da API
IDs confirmados da API OpenAI em 07/09/2026:
- fluxo normal/econômico: `gpt-5.6-luna`;
- escalada estratégica: `gpt-5.6-terra`.

Preços de referência:
- Luna: US$ 0,20 / 1M tokens de entrada; US$ 1,20 / 1M de saída;
- Terra: US$ 2,00 / 1M tokens de entrada; US$ 12,00 / 1M de saída;
- web search: US$ 10 / 1.000 web runs, além dos tokens de conteúdo da pesquisa cobrados pelo modelo.

## Fluxo de validação
1. Receber dados atuais do Bitrix.
2. Gerar fingerprint e procurar cache válido.
3. Se cache válido: custo zero de IA/pesquisa.
4. Sem cache: executar Luna com **no máximo 1 web run** no fluxo normal.
5. A própria resposta informa `precisa_escalada`.
6. Terra só é chamada em conta estratégica ou quando uma segunda investigação realmente pode mudar a decisão.
7. Persistir fontes, modelo, web calls, tokens, custo, validade e decisão.

## Regras de busca
- confirmar primeiro permanência na empresa e cargo atual;
- se o contato for analista/assistente/nível inadequado, usar a mesma investigação para procurar gerente/diretor/head/VP da área;
- se houver saída, tentar substituto apenas com fonte pública razoável;
- nunca deduzir e-mail por padrão;
- LinkedIn apenas como referência pública; sem scraping/login automatizado.

## Cache
- confirmado e estável: até 90 dias;
- estratégico: 45 dias;
- inconclusivo/homônimo: 30 dias;
- saída confirmada: 180 dias;
- mudança relevante no Bitrix muda o fingerprint e invalida naturalmente o cache.

## Benchmark obrigatório antes de produção
Usar 30–50 contatos reais já conhecidos e comparar:
- permanência;
- cargo;
- saída;
- qualidade do decisor sugerido;
- falsos positivos;
- inconclusivos;
- custo por contato;
- tempo por contato;
- percentual servido por cache;
- percentual que precisou de Terra.

Critério inicial: reduzir pelo menos 70% do custo do lote anterior sem perda comercial relevante.

## Estado atual
O Supabase `Radar_Contatos` de produção existe, mas atualmente não possui Edge Functions nem a tabela de cache da V2. Não faremos deploy/migration nele sem um ambiente de teste controlado ou um gate explícito de produção.

O `engine.js` antigo continua sendo legado do aplicativo de planilha e não deve ser a implementação do Revenue Engine. O Revenue Engine deverá chamar `validar-contato-v2` server-side.
