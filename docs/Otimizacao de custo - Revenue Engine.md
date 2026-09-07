# Otimização de custo do Radar Contatos para o Revenue Engine

## Diagnóstico do custo atual
O fluxo atual pode usar `openai_search` como provedor padrão. No modo `completo`, o código tende a escolher um modelo mais caro e entrega ao modelo várias sugestões de busca por contato. Para centenas de contatos, isso multiplica custo de pesquisa + inferência mesmo quando o dado poderia ser validado por fontes mais baratas.

O Radar também trabalha contato a contato de forma quase uniforme. Isso é inadequado para o Revenue Engine: uma conta com dados claros e recentes não deve custar o mesmo que uma conta estratégica, ambígua ou sem contato válido.

## Nova regra
**Nenhum contato começa no modelo mais caro.**

A validação passa a ser em cascata:

### Nível 0 — Bitrix e regras locais
Custo de IA: zero.
- ler contato atual no Bitrix;
- validar sintaxe de e-mail e domínio;
- aproveitar CNPJ/domínio/LinkedIn já existentes;
- checar data da última validação;
- não revalidar contatos recentemente confirmados sem novo sinal;
- deduplicar pessoa por e-mail/nome+empresa.

Se houver validação recente e confiável, retornar cache.

### Nível 1 — fontes estruturadas / busca econômica
- BrasilAPI para CNPJ quando aplicável;
- busca web básica por nome + empresa;
- no máximo 2 consultas iniciais no modo normal;
- priorizar site institucional, notícias, eventos e resultados públicos;
- armazenar evidências para reuso.

### Nível 2 — IA econômica
Usar um modelo de baixo custo para transformar os resultados encontrados em JSON estruturado e classificar:
- permanência;
- cargo;
- senioridade;
- confiança;
- adequação como decisor;
- necessidade de escalar.

### Nível 3 — pesquisa ampliada
Somente quando:
- confiança abaixo do limiar;
- risco de homônimo;
- provável saída;
- ausência de decisor adequado;
- conta classificada como prioritária/estratégica.

Executar buscas adicionais focadas, não uma lista genérica grande.

### Nível 4 — modelo avançado
Reservado para:
- conta estratégica;
- conflito entre evidências;
- decisão sobre substituto/decisor com impacto comercial relevante;
- casos inconclusivos que justificam o custo.

## Política de cache
Criar uma chave lógica por pessoa/empresa:
- Bitrix contact ID;
- e-mail normalizado;
- nome + Bitrix company ID como fallback.

Validade sugerida:
- confirmado na empresa e cargo estável: 90 dias;
- diretor/C-level ou conta estratégica: 45–60 dias;
- inconclusivo: 30 dias;
- saída confirmada: persistente até novo dado do Bitrix;
- bounce: exigir nova validação antes de qualquer envio.

Qualquer alteração no Bitrix (cargo, e-mail, empresa, novo contato) invalida o cache correspondente.

## Mudanças recomendadas no código
1. Alterar o comportamento padrão para modo econômico em vez de OpenAI Web Search avançada para todos.
2. No modo `completo`, usar modelo econômico; modelo avançado apenas no modo `estrategico` ou por escalada automática.
3. Reduzir o conjunto inicial de buscas:
   - rápido: 1–2;
   - completo: 2–3;
   - estratégico: 4–5 direcionadas.
4. Limitar saída estruturada; não gerar 4.000 tokens por contato quando o schema pode ser respondido de forma muito menor.
5. Separar `validar contato` de `buscar substituto`. O segundo só roda se o primeiro indicar necessidade.
6. Persistir resultado e evidências para evitar nova cobrança em reprocessamentos desnecessários.
7. Adicionar telemetria de custo por contato, por provedor e por etapa.
8. Adicionar orçamento máximo por job e pausa automática antes de ultrapassá-lo.

## Novos campos de telemetria sugeridos
Em `analyses.data` ou tabela própria:
- `pipeline_level_used`
- `search_calls`
- `ai_calls`
- `model_used`
- `input_tokens`
- `output_tokens`
- `estimated_cost_usd`
- `cache_hit`
- `escalated`
- `escalation_reason`

No `jobs.data`:
- `budget_limit_usd`
- `estimated_cost_usd`
- `average_cost_per_contact`
- `processed_from_cache`
- `processed_level_1`
- `processed_level_2`
- `processed_level_3_4`

## Integração com o Revenue Engine
O Radar deixa de receber obrigatoriamente planilhas como origem principal. O Revenue Engine poderá chamá-lo com um contrato simples:

```json
{
  "bitrix_company_id": "123",
  "bitrix_contact_id": "456",
  "nome": "Nome",
  "empresa": "Empresa",
  "cargo": "Cargo",
  "email": "email@empresa.com",
  "telefone": "...",
  "linkedin": "...",
  "priority": "normal|strategic"
}
```

Resposta:
```json
{
  "status": "validated|inconclusive|left_company",
  "continua_na_empresa": true,
  "cargo_atual": "...",
  "senioridade": "diretor",
  "decisor_adequado": true,
  "email_validado": "...",
  "telefone_publico": "...",
  "whatsapp_publico": "...",
  "linkedin_publico": "...",
  "substituto_sugerido": null,
  "score_confianca": 92,
  "fontes": [],
  "validado_em": "...",
  "custo_estimado_usd": 0.00
}
```

## Meta de custo
O objetivo não é apenas reduzir o custo médio. É evitar pagar pesquisa repetida e reservar modelos caros para a pequena parcela que realmente exige investigação.

Antes de rodar novamente centenas de contatos, executar um benchmark controlado de 30–50 contatos distribuídos entre:
- contatos fáceis;
- contatos desatualizados;
- pessoas que saíram;
- decisores corretos/incorretos;
- contas estratégicas.

Comparar precisão, inconclusivos, custo médio e tempo com o fluxo atual.