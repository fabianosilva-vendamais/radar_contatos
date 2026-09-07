# Integração da política de custo no Radar Contatos

## Objetivo
Reduzir fortemente o custo por contato sem perder confiabilidade comercial.

## Ordem de integração
1. Importar `cost-policy.js` em `engine.js`.
2. Trocar o comportamento padrão de `openai_search` para busca econômica + classificação por `gpt-5.6-luna`.
3. No modo completo, começar com no máximo 2 consultas.
4. Executar análise inicial com Luna e saída limitada a ~900 tokens.
5. Escalar para Terra quando a confiança ficar baixa, houver conflito, provável saída, risco de homônimo ou necessidade de novo decisor.
6. Reservar Sol para contas estratégicas e conflitos difíceis.
7. Persistir no resultado: modelo usado, número de buscas, tokens de entrada/saída (quando fornecidos), custo estimado e motivo da escalada.
8. Reutilizar validação recente por cache; não pesquisar novamente sem motivo.
9. Separar validação da pessoa de busca de substituto/decisor. A segunda etapa só roda quando necessária.

## Política inicial para benchmark
- Rápido: Luna, 1 busca inicial.
- Completo: Luna, 2 buscas iniciais; Terra apenas por escalada.
- Estratégico: Terra inicialmente; Sol apenas quando necessário.
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

Critério para avançar: a versão econômica deve manter qualidade comercial aceitável e reduzir o custo em pelo menos 70% no lote de benchmark.

## Observação sobre preço
A cobrança de web search é separada da inferência do modelo; por isso, reduzir chamadas de busca é tão importante quanto trocar o modelo.
