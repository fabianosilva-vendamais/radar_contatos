# Integração da política de custo no Radar Contatos

## Objetivo
Reduzir fortemente o custo por contato sem perder confiabilidade comercial.

## Correção importante de arquitetura
Os nomes Luna, Terra e Sol são configurações do produto ChatGPT e **não** devem ser usados como IDs de modelo da API. Para esta versão do Radar, manteremos modelos já compatíveis com o código atual:
- padrão econômico: `gpt-4o-mini`;
- escalada avançada: `gpt-4o`.

## Ordem de integração
1. Importar `cost-policy.js` em `engine.js`.
2. Fazer o modo `completo` iniciar sempre com `gpt-4o-mini`.
3. Reduzir as buscas iniciais para no máximo 2 por contato no modo completo.
4. Limitar a saída estruturada a aproximadamente 750 tokens no modo completo.
5. Se a primeira análise ficar inconclusiva, ampliar a pesquisa mantendo `gpt-4o-mini`.
6. Usar `gpt-4o` somente em conta estratégica ou conflito difícil com confiança muito baixa.
7. Persistir: modelo, número de buscas, tokens, custo estimado, cache e motivo de escalada.
8. Reutilizar validações recentes; não pesquisar de novo sem mudança no Bitrix ou expiração do cache.
9. Separar `validar contato` de `buscar substituto/decisor`. A segunda etapa só roda quando necessária.

## Política inicial para benchmark
- Rápido: `gpt-4o-mini`, 1 busca inicial.
- Completo: `gpt-4o-mini`, 2 buscas iniciais; pesquisa adicional apenas por exceção.
- Estratégico: pesquisa ampliada; `gpt-4o` apenas quando justificado.
- Cache estável: 90 dias.
- Cache estratégico: 60 dias.
- Inconclusivo: 30 dias.

## Benchmark obrigatório antes de produção
Usar 30–50 contatos reais já analisados anteriormente e comparar:
- permanência na empresa;
- cargo atual;
- capacidade de detectar saída;
- qualidade do decisor sugerido;
- falsos positivos;
- inconclusivos;
- custo por contato;
- tempo por contato.

Critério para avançar: manter qualidade comercial aceitável e reduzir o custo em pelo menos 70% no lote de benchmark.

## Referência de custo usada no benchmark
Em 07/09/2026:
- `gpt-4o-mini`: US$ 0,15 / 1M tokens de entrada e US$ 0,60 / 1M de saída;
- `gpt-4o`: US$ 2,50 / 1M tokens de entrada e US$ 10,00 / 1M de saída;
- web search: US$ 10 / 1.000 execuções, além dos tokens de conteúdo de busca cobrados pelo modelo.

A cobrança de web search é separada da inferência; portanto, reduzir buscas desnecessárias é tão importante quanto trocar o modelo.