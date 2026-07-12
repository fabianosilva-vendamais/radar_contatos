# Radar de Contatos e Decisores

Validação inteligente de contatos comerciais, cargos e decisores a partir de fontes públicas.
Aplicação 100% estática (HTML + JS) — não precisa de servidor, build nem banco externo.

## Como rodar

**Local:** sirva a pasta com qualquer servidor estático, ex.:

```bash
npx serve .
```

e abra `http://localhost:3000`. (Abrir o arquivo direto com `file://` não funciona — o navegador bloqueia módulos JS.)

**GitHub + Vercel:**
1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. Na Vercel, importe o repositório como projeto. Framework preset: **Other**. Sem build command e sem output directory (raiz).
3. Deploy. O `index.html` redireciona para o app.

## Configuração (equivalente às variáveis de ambiente)

Não há arquivo `.env`: por ser um app estático, as chaves são inseridas no botão **Configurações** dentro do app e ficam salvas apenas no navegador de quem usa (localStorage). Nunca são enviadas a nenhum servidor próprio.

| Configuração | Equivalente | Onde obter |
|---|---|---|
| Provedor de busca web | `WEB_SEARCH_PROVIDER` | Tavily / Google CSE / somente IA |
| Chave Tavily | `WEB_SEARCH_API_KEY` | https://tavily.com (recomendado — funciona direto do navegador) |
| Google API Key + cx | `WEB_SEARCH_API_KEY` | https://programmablesearchengine.google.com |
| Chave da API Anthropic (IA) | `AI_API_KEY` | https://console.anthropic.com — **obrigatória quando hospedado fora do ambiente original** (ex.: Vercel) |
| Modelo de IA | `AI_MODEL` | automático por modo, Haiku ou Sonnet |
| Máx. tentativas por contato | `MAX_ATTEMPTS_PER_CONTACT` | seletor em Configurações |
| Supabase URL + chave anon (opcional) | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | supabase.com — banco na nuvem, acessível de qualquer dispositivo |

O provedor padrão é **Tavily** — crie a chave gratuita e cole em Configurações antes da primeira análise.

## Onde cada integração está no código

- **Busca web** (`engine.js` → `runSearches`, `searchTavily`, `searchGoogle`): camada genérica de provedores. Para adicionar outro provedor (Bing, SerpAPI via proxy etc.), acrescente uma função que receba a query e retorne `[{titulo, url, trecho}]`.
- **IA** (`engine.js` → `callAI`, `analyzeContact`, `buildSystemPrompt`): monta o prompt conservador, chama a API e valida/normaliza o JSON retornado no schema obrigatório.
- **Banco de dados** (`engine.js` → `configureStorage`, `put`/`get`/`byIndex`): tabelas `jobs`, `contacts`, `analyses`. Por padrão usa IndexedDB (local, por navegador). Com Supabase configurado em Configurações (URL + chave anon), os dados vão para a nuvem — rode antes o `supabase-schema.sql` no SQL Editor do Supabase. Progresso salvo após cada contato, com retomada automática se o processamento for interrompido.
- **Exportação Excel** (`engine.js` → `exportExcel`): todas as colunas originais + resultado da análise.
- **Interface** (`Radar de Contatos e Decisores.dc.html`): upload, mapeamento de colunas, progresso com pausar/continuar, tabela com filtros, detalhe do contato e configurações.

## Compliance

- Usa apenas fontes públicas via API de busca (buscadores, sites institucionais, notícias).
- **Não** faz scraping do LinkedIn, não usa login automatizado, cookies, robôs ou bypass de captcha. URLs de LinkedIn são tratadas apenas como referência pública.
- A IA é instruída a não inventar dados, não tratar ausência de evidência como saída da empresa e marcar como inconclusivo quando não houver segurança.
- Dados originais são preservados; fontes de cada conclusão ficam registradas.

## Limitações conhecidas

- O processamento roda enquanto a aba estiver aberta; se fechar, a análise fica marcada como interrompida e pode ser retomada de onde parou.
- Sem Supabase, os dados ficam no navegador (IndexedDB) e presos ao domínio/navegador usado. Com Supabase, ficam na nuvem — mas a chave anon dá leitura/escrita a quem a tiver; use um projeto Supabase dedicado.
- As chaves de API continuam salvas por navegador (localStorage), por segurança.
- Arquivo de teste incluído: `exemplo-contatos.csv` (6 contatos fictícios).
