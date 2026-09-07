# Otimização de custo do Radar Contatos para o Revenue Engine

## Problema encontrado
O Radar legado trabalha contato a contato de forma quase uniforme e pode usar busca web integrada + modelo relativamente caro para centenas de contatos. Isso explica como um lote grande pode acumular custo rapidamente.

No Revenue Engine, uma conta simples não pode custar o mesmo que uma conta estratégica ou ambígua.

## Arquitetura V2
A validação passa a ser server-side pela função `validar-contato-v2`.

### Nível 0 — Bitrix + cache
Custo de IA: zero.
- Bitrix é a fonte oficial;
- gerar fingerprint por contato/empresa/dados atuais;
- reaproveitar validação recente;
- qualquer mudança relevante no Bitrix invalida naturalmente o cache.

### Nível 1 — Luna + uma pesquisa
Modelo: `gpt-5.6-luna`.
- no máximo **1 web run** no fluxo normal;
- saída JSON estruturada;
- confirmar empresa, cargo, senioridade e adequação como decisor;
- se o contato for analista/assistente, aproveitar a mesma investigação para procurar liderança adequada;
- registrar fontes e telemetria.

### Nível 2 — escalada
Somente quando `precisa_escalada=true` ou a conta já tiver sido classificada como estratégica.

Modelo: `gpt-5.6-terra`.
- no máximo 2 web runs;
- conflitos, homônimos, decisor difícil ou conta estratégica;
- nunca escalar por rotina.

## Cache
- estável/confiável: 90 dias;
- estratégico: 45 dias;
- inconclusivo/homônimo: 30 dias;
- saída confirmada: 180 dias;
- bounce exige nova validação antes de qualquer envio.

## Dados retornados ao Revenue Engine
- permanência na empresa;
- cargo atual provável;
- senioridade;
- decisor adequado;
- decisor sugerido quando houver evidência;
- e-mail/telefone/LinkedIn apenas quando encontrados publicamente;
- score de confiança;
- fontes;
- ação recomendada;
- necessidade de escalada;
- custo estimado e uso real de API.

## Telemetria obrigatória
- `model`
- `web_calls`
- `input_tokens`
- `output_tokens`
- `estimated_cost_usd`
- `cache_hit`
- `validated_at`
- `expires_at`

## Regras comerciais
1. Não abordar só porque o contato existe no CRM.
2. Ausência de evidência não significa que a pessoa saiu.
3. Analista/assistente normalmente não é o decisor final para as soluções VendaMais.
4. Não inventar substituto.
5. Não deduzir e-mail por padrão.
6. Não fazer scraping de LinkedIn.
7. Bitrix continua prevalecendo como histórico comercial; a web valida e enriquece cadastro.

## Integração
O Radar deixa de ser apenas uma tela que recebe planilha. Para o Revenue Engine ele vira um serviço de validação chamado depois que a empresa e seu histórico forem hidratados no Bitrix e antes de qualquer abordagem.

## Meta
Antes de rodar novamente centenas de contatos, comparar 30–50 casos reais com o lote anterior.

Gate inicial:
- redução mínima de 70% de custo;
- sem perda comercial relevante na precisão;
- Terra utilizada somente em pequena minoria;
- cache demonstrando economia em reprocessamentos.

## Preços de referência em 07/09/2026
- GPT-5.6 Luna: US$ 0,20 / 1M entrada e US$ 1,20 / 1M saída;
- GPT-5.6 Terra: US$ 2,00 / 1M entrada e US$ 12,00 / 1M saída;
- Web Search: US$ 10 / 1.000 web runs + tokens de conteúdo cobrados pelo modelo.
