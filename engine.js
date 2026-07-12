// ============================================================
// Radar de Contatos e Decisores — camada de dados e provedores
// Banco (IndexedDB), leitura de planilha, busca web, análise IA,
// exportação Excel. Sem scraping de LinkedIn: apenas APIs de
// busca públicas ou modo simulação.
// ============================================================

const DB_NAME = 'radar-contatos-db';
const DB_VERSION = 1;
let _db = null;

export function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('jobs')) d.createObjectStore('jobs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('contacts')) {
        const s = d.createObjectStore('contacts', { keyPath: 'id' });
        s.createIndex('job_id', 'job_id');
      }
      if (!d.objectStoreNames.contains('analyses')) {
        const s = d.createObjectStore('analyses', { keyPath: 'contact_id' });
        s.createIndex('job_id', 'job_id');
      }
    };
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}

async function store(name, mode) {
  const d = await openDb();
  return d.transaction(name, mode).objectStore(name);
}
function prom(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export async function put(name, val) { return prom((await store(name, 'readwrite')).put(val)); }
export async function get(name, key) { return prom((await store(name, 'readonly')).get(key)); }
export async function getAll(name) { return prom((await store(name, 'readonly')).getAll()); }
export async function del(name, key) { return prom((await store(name, 'readwrite')).delete(key)); }
export async function byIndex(name, index, key) {
  return prom((await store(name, 'readonly')).index(index).getAll(key));
}
export async function bulkPut(name, vals) {
  const s = await store(name, 'readwrite');
  for (const v of vals) s.put(v);
  return new Promise((res, rej) => {
    s.transaction.oncomplete = () => res();
    s.transaction.onerror = () => rej(s.transaction.error);
  });
}
export async function deleteJobCascade(jobId) {
  const contacts = await byIndex('contacts', 'job_id', jobId);
  for (const c of contacts) {
    await del('analyses', c.id).catch(() => {});
    await del('contacts', c.id);
  }
  await del('jobs', jobId);
}

// ------------------------------------------------------------
// Leitura de planilha (Excel via SheetJS, CSV com fallback)
// ------------------------------------------------------------
export async function parseFile(file) {
  const name = (file.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv') || name.endsWith('.txt');
  if (window.XLSX) {
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array', codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    return aoaToTable(aoa);
  }
  if (isCsv) {
    const text = await file.text();
    return aoaToTable(parseCsv(text));
  }
  throw new Error('Biblioteca de leitura de Excel não carregou (verifique a conexão). Arquivos .csv funcionam mesmo assim.');
}

function aoaToTable(aoa) {
  const rows = aoa.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length < 2) throw new Error('A planilha precisa ter um cabeçalho e ao menos uma linha de dados.');
  const columns = rows[0].map((c, i) => String(c ?? '').trim() || 'Coluna ' + (i + 1));
  const data = rows.slice(1).map((r) => {
    const o = {};
    columns.forEach((col, i) => { o[col] = String(r[i] ?? '').trim(); });
    return o;
  });
  return { columns, rows: data };
}

export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const out = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      out.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}

const GUESS = {
  nome: ['nome completo', 'nome', 'name', 'contato', 'full name'],
  sobrenome: ['sobrenome', 'last name', 'surname'],
  empresa: ['empresa', 'company', 'organiza', 'conta', 'account'],
  cargo: ['cargo', 'título', 'titulo', 'title', 'posição', 'posicao', 'função', 'funcao', 'position'],
  telefone: ['telefone', 'celular', 'phone', 'fone', 'whats'],
  email: ['e-mail', 'email', 'mail'],
  linkedin: ['linkedin', 'perfil'],
  cnpj: ['cnpj', 'cadastro nacional'],
  observacoes: ['observa', 'obs', 'nota', 'note', 'coment'],
};
export function guessMapping(columns) {
  const map = {};
  for (const [field, hints] of Object.entries(GUESS)) {
    const found = columns.find((c) => hints.some((h) => c.toLowerCase().includes(h)) && !Object.values(map).includes(c));
    if (found) map[field] = found;
  }
  return map;
}

// ------------------------------------------------------------
// Busca web (provedores plugáveis — nunca scraping de LinkedIn)
// ------------------------------------------------------------
const FREE_MAIL = ['gmail.', 'hotmail.', 'outlook.', 'yahoo.', 'icloud.', 'uol.', 'bol.', 'terra.', 'live.'];
function emailDomain(email) {
  const m = String(email || '').match(/@([a-z0-9.-]+)/i);
  if (!m) return null;
  const dom = m[1].toLowerCase();
  return FREE_MAIL.some((f) => dom.startsWith(f)) ? null : dom;
}

function areaTerms(cargo) {
  const c = String(cargo || '').toLowerCase();
  if (/(comercial|vendas|sales|revenue|business|negóc|negoc)/.test(c))
    return ['"Diretor Comercial" OR "Gerente Comercial" OR "Head of Sales"', '"Gerente de Vendas" OR "Business Development"'];
  if (/(rh|recursos humanos|people|gente|pessoas|dho|talent|treinamento|l&d)/.test(c))
    return ['"Gerente de RH" OR "Head de Pessoas" OR "People & Culture"', '"Gente e Gestão" OR "Treinamento e Desenvolvimento"'];
  if (/(marketing|growth|comunica|cmo|brand)/.test(c))
    return ['"Diretor de Marketing" OR "Head de Marketing" OR "CMO"', '"Growth" OR "Marketing Manager"'];
  if (/(compras|procurement|suprimentos|sourcing)/.test(c))
    return ['"Gerente de Compras" OR "Head de Suprimentos" OR "Procurement"', '"Comprador" OR "Sourcing Manager"'];
  if (/(financeiro|adm|administra|cfo|controlad)/.test(c))
    return ['"Diretor Financeiro" OR "Gerente Administrativo" OR "CFO"', '"Controller" OR "Controladoria"'];
  return ['"Diretor" OR "Gerente" OR "Head"', null];
}

// Limpa o nome da empresa para uso em buscas: remove anotações entre
// parênteses, sufixos societários e normaliza caixa alta excessiva.
export function cleanEmpresa(raw) {
  let e = String(raw || '').trim();
  e = e.replace(/\s*\([^)]*\)\s*/g, ' ');
  e = e.replace(/[,\s]+(ltda\.?|s\.?\/?a\.?|eireli|epp|me|s\.?s\.?|inc\.?|corp\.?)\s*$/i, '');
  e = e.replace(/\s{2,}/g, ' ').trim();
  if (e.length > 4 && e === e.toUpperCase()) {
    e = e.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  }
  return e || String(raw || '').trim();
}

export function buildQueries(o, mode) {
  const q = [];
  const nome = o.nome || '';
  const emp = cleanEmpresa(o.empresa);
  q.push(`"${nome}" "${emp}"`);
  q.push(`"${nome}" "${emp}" LinkedIn`);
  if (mode !== 'rapido') {
    // variação sem aspas na empresa: captura razão social/nome fantasia diferentes
    q.push(`"${nome}" ${emp}`);
    q.push(`"${emp}" CNPJ`);
    if (o.cargo) q.push(`"${nome}" "${o.cargo}"`);
    const dom = emailDomain(o.email);
    if (dom) q.push(`"${nome}" "${dom}"`);
  }
  if (mode === 'estrategico') q.push(`"${nome}" "${emp}" notícia OR entrevista OR evento`);
  if (mode !== 'rapido') {
    const terms = areaTerms(o.cargo);
    q.push(`"${emp}" ${terms[0]}`);
    if (mode === 'estrategico' && terms[1]) q.push(`"${emp}" ${terms[1]}`);
  }
  const limit = mode === 'rapido' ? 2 : mode === 'completo' ? 7 : 9;
  return q.slice(0, limit);
}

async function searchTavily(q, s) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.tavilyKey },
    body: JSON.stringify({ query: q, max_results: 5, search_depth: 'basic' }),
  });
  if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
  const j = await r.json();
  return (j.results || []).map((x) => ({ titulo: x.title, url: x.url, trecho: (x.content || '').slice(0, 400) }));
}

async function searchGoogle(q, s) {
  const u = 'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(s.googleKey) +
    '&cx=' + encodeURIComponent(s.googleCx) + '&q=' + encodeURIComponent(q) + '&num=5';
  const r = await fetch(u);
  if (!r.ok) throw new Error('Google CSE HTTP ' + r.status);
  const j = await r.json();
  return (j.items || []).map((x) => ({ titulo: x.title, url: x.link, trecho: (x.snippet || '').slice(0, 400) }));
}

function hashStr(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Modo simulação: gera resultados FICTÍCIOS e claramente marcados,
// apenas para testar o fluxo completo sem chave de API.
function searchDemo(q, o) {
  const h = hashStr(o.nome || '');
  const scen = h % 4; // 0 confirmado, 1 promovido, 2 saiu, 3 ambíguo
  const emp = o.empresa || 'Empresa';
  const nome = o.nome || 'Contato';
  const cargo = o.cargo || 'Gerente';
  const base = 'https://demo-simulado.exemplo';
  const isSubQuery = q.includes('Diretor') || q.includes('Gerente de RH') || q.includes('Head');
  if (q.includes('CNPJ')) {
    const d1 = String(10 + (h % 80));
    return [
      { titulo: `[SIMULADO] ${emp} — CNPJ e dados cadastrais`, url: base + '/cnpj', trecho: `[SIMULADO] ${emp} Ltda — CNPJ ${d1}.345.678/0001-${String(h % 90).padStart(2, '0')}, situação cadastral ativa.` },
    ];
  }
  if (isSubQuery && scen === 2) {
    return [
      { titulo: `[SIMULADO] ${emp} anuncia nova liderança comercial`, url: base + '/noticia-lideranca', trecho: `[SIMULADO] A ${emp} anunciou Marina Duarte como nova ${cargo}, assumindo a área após reestruturação do time.` },
    ];
  }
  if (scen === 0) {
    return [
      { titulo: `[SIMULADO] Página de equipe — ${emp}`, url: base + '/equipe', trecho: `[SIMULADO] ${nome} — ${cargo} na ${emp}. Página institucional atualizada em 2026.` },
      { titulo: `[SIMULADO] ${nome} participa de evento do setor`, url: base + '/evento-2026', trecho: `[SIMULADO] ${nome}, ${cargo} da ${emp}, participou como palestrante em maio de 2026.` },
    ];
  }
  if (scen === 1) {
    return [
      { titulo: `[SIMULADO] ${nome} é promovido na ${emp}`, url: base + '/promocao', trecho: `[SIMULADO] ${nome} assume novo cargo de Diretor na ${emp} a partir de janeiro de 2026, após atuar como ${cargo}.` },
    ];
  }
  if (scen === 2) {
    return [
      { titulo: `[SIMULADO] ${nome} anuncia novo desafio profissional`, url: base + '/mudanca', trecho: `[SIMULADO] Em publicação pública de março de 2026, ${nome} informou que deixou a ${emp} e ingressou na Nova Horizonte S.A.` },
    ];
  }
  return [
    { titulo: `[SIMULADO] Resultado genérico sobre "${nome}"`, url: base + '/generico', trecho: `[SIMULADO] Há mais de uma pessoa com o nome ${nome} em registros públicos; nenhuma menção clara à ${emp} foi encontrada.` },
  ];
}

export async function runSearches(queries, settings, original) {
  const out = [];
  let lastErr = null, ok = 0;
  for (const q of queries) {
    try {
      let results;
      if (settings.provider === 'tavily') {
        if (!settings.tavilyKey) throw new Error('Chave da API Tavily não configurada (abra Configurações).');
        results = await searchTavily(q, settings);
      } else if (settings.provider === 'google') {
        if (!settings.googleKey || !settings.googleCx) throw new Error('Chave/CX do Google não configurados (abra Configurações).');
        results = await searchGoogle(q, settings);
      } else {
        results = searchDemo(q, original);
      }
      ok++;
      out.push({ busca: q, resultados: results });
    } catch (e) {
      lastErr = e;
      out.push({ busca: q, erro: String(e.message || e) });
    }
  }
  if (ok === 0 && lastErr) throw new Error('Falha na busca web: ' + (lastErr.message || lastErr));
  return out;
}

// Consulta pública de CNPJ (BrasilAPI / Receita Federal) — falha é tolerada
export async function lookupCnpj(cnpjRaw) {
  const num = String(cnpjRaw || '').replace(/\D/g, '');
  if (num.length !== 14) return null;
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + num);
    if (!r.ok) return null;
    const j = await r.json();
    return {
      cnpj: j.cnpj || num,
      razao_social: j.razao_social || '',
      nome_fantasia: j.nome_fantasia || '',
      situacao_cadastral: j.descricao_situacao_cadastral || '',
      municipio: j.municipio || '',
      uf: j.uf || '',
      atividade_principal: j.cnae_fiscal_descricao || '',
    };
  } catch (e) { return null; }
}

// ------------------------------------------------------------
// Análise por IA (JSON estruturado, comportamento conservador)
// ------------------------------------------------------------
export const STATUS_VALIDACAO = ['confirmado_na_empresa', 'provavelmente_na_empresa', 'cargo_atualizado_na_mesma_empresa', 'provavel_saida_da_empresa', 'saida_confirmada', 'inconclusivo', 'risco_de_homonimo'];
export const EQUIVALENCIA = ['mesmo_cargo', 'cargo_equivalente', 'cargo_mais_alto', 'cargo_mais_baixo', 'mesma_area_cargo_diferente', 'outra_area', 'cargo_nao_identificado', 'mudou_de_empresa', 'inconclusivo'];
export const ACOES = ['manter_contato', 'atualizar_cargo', 'atualizar_empresa', 'revisar_manual', 'remover_abordagem_ativa', 'tentar_novo_decisor', 'validar_por_telefone', 'validar_por_email', 'reprocessar_depois', 'sem_acao'];

function buildSystemPrompt(mode) {
  const detail = mode === 'estrategico'
    ? 'Este é o MODO ESTRATÉGICO: escreva um resumo_analise mais detalhado (4 a 6 frases) e liste todas as evidências relevantes.'
    : mode === 'rapido'
      ? 'Este é o MODO RÁPIDO: há poucas buscas disponíveis; seja ainda mais conservador e prefira "inconclusivo" quando faltar evidência.'
      : 'Este é o MODO COMPLETO: equilibre custo e qualidade; avalie substituto quando houver sinais de saída.';
  return `Você é um analista de inteligência comercial especializado em validação de contatos B2B.
Sua tarefa é comparar os dados originais de um contato de CRM com informações públicas encontradas na internet (resultados de busca fornecidos) e avaliar:
- se a pessoa parece continuar na empresa original;
- se o cargo atual parece igual, equivalente, superior, inferior ou diferente;
- se há risco de homônimo;
- se há sinais de saída da empresa;
- o nível de confiança da análise (score 0 a 100);
- a ação comercial recomendada;
- e, se houver provável saída, um possível substituto na MESMA empresa, apenas se houver fonte pública razoável.

REGRAS OBRIGATÓRIAS:
1. Não invente informações. Toda conclusão deve se apoiar nos resultados de busca fornecidos.
2. NÃO trate ausência de evidência como confirmação de saída. Sem evidência = "inconclusivo".
3. DISCERNIMENTO DE CARGO — é quase certo que o cargo do CRM NÃO bata palavra por palavra com o cargo real. Avalie equivalência de FUNÇÃO e NÍVEL, nunca texto exato:
   - Considere sinônimos, traduções (português/inglês), abreviações e variações internas. Ex.: "Gerente" ≈ "Gerente Comercial"/"Gerente de Vendas"/"Sales Manager"/"Gerente de Negócios"; "Diretor" ≈ "Diretor Comercial"/"Commercial Director"/"Head Comercial"/"Head of Sales"/"VP Sales"; "RH" ≈ "DHO"/"Gente & Gestão"/"People"/"People & Culture"/"L&D"/"Treinamento e Desenvolvimento"; "Marketing" ≈ "CMO"/"Head de Marketing"/"Growth"/"Comunicação".
   - Um cargo compatível em função/área CONTA COMO CONFIRMAÇÃO da permanência, mesmo com nome diferente. Não rebaixe o score só porque o texto do cargo não é idêntico.
   - Diferença de nome de cargo dentro da MESMA área e nível = "mesmo_cargo" ou "cargo_equivalente", não "mesma_area_cargo_diferente".
3b. DISCERNIMENTO DE EMPRESA — o nome da empresa no CRM raramente é a razão social exata. Trate como A MESMA empresa:
   - razão social vs nome fantasia ("Metalúrgica Beta Ltda" ≈ "Beta"); sufixos societários (Ltda, S.A., ME, EIRELI, Group, Inc.); acentos, caixa e abreviações; sigla vs nome por extenso;
   - marca vs grupo controlador ou unidade/filial regional ("Beta Nordeste", "Grupo Beta"), quando o contexto (setor, cidade, domínio de e-mail) for coerente;
   - variação pós fusão/aquisição/rebranding: se as fontes indicarem que a empresa mudou de nome mas é a mesma organização, considere que a pessoa CONTINUA na empresa e registre o novo nome em empresa_atual_provavel, explicando em resumo_analise.
   - Só classifique como "mudou_de_empresa" quando for claramente OUTRA organização, não uma variação de nome. Na dúvida entre variação e mudança real, use "inconclusivo" e aponte em pontos_de_duvida.
4. Seja conservador com nomes comuns: sem confirmação forte (empresa/cidade/setor coerentes), marque risco_homonimo=true e/ou precisa_revisao_humana=true.
5. Score alto (>=90) só com evidência forte, recente e de mais de uma fonte. Uma única fonte fraca = score baixo.
6. Sempre explique o motivo da conclusão em resumo_analise (em português).
7. substituto_sugerido: apenas com fonte pública que ligue a pessoa à empresa; caso contrário retorne null. Nunca invente substituto.
7b. cnpj_empresa: informe o CNPJ da empresa original SOMENTE se constar nos dados oficiais fornecidos ou em alguma fonte de busca (formato 00.000.000/0000-00). Nunca invente ou complete dígitos; sem evidência, retorne "". Quando houver DADOS OFICIAIS DO CNPJ, use a razão social e o nome fantasia deles como âncora para o discernimento de nome de empresa.
8. Não use nem sugira scraping de LinkedIn; trate URLs de LinkedIn apenas como referência pública.
9. Fontes marcadas [SIMULADO] são dados fictícios de teste: analise-os normalmente, mas mencione em pontos_de_duvida que são simulados.
${detail}

Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON) exatamente neste schema:
{
 "status_validacao": "confirmado_na_empresa | provavelmente_na_empresa | cargo_atualizado_na_mesma_empresa | provavel_saida_da_empresa | saida_confirmada | inconclusivo | risco_de_homonimo",
 "continua_na_empresa": true | false | null,
 "empresa_atual_provavel": "",
 "cnpj_empresa": "",
 "cargo_atual_provavel": "",
 "equivalencia_cargo": "mesmo_cargo | cargo_equivalente | cargo_mais_alto | cargo_mais_baixo | mesma_area_cargo_diferente | outra_area | cargo_nao_identificado | mudou_de_empresa | inconclusivo",
 "score_confianca": 0,
 "risco_homonimo": false,
 "precisa_revisao_humana": false,
 "resumo_analise": "",
 "evidencias": [""],
 "fontes": [{"titulo": "", "url": "", "snippet_relevante": "", "tipo_fonte": "site_empresa | noticia | evento | linkedin_publico | buscador | outra", "forca_evidencia": "alta | media | baixa"}],
 "pontos_de_duvida": [""],
 "acao_recomendada": "manter_contato | atualizar_cargo | atualizar_empresa | revisar_manual | remover_abordagem_ativa | tentar_novo_decisor | validar_por_telefone | validar_por_email | reprocessar_depois | sem_acao",
 "substituto_sugerido": {"nome": "", "cargo": "", "empresa": "", "link_publico": "", "score_confianca": 0, "motivo_sugestao": ""}
}`;
}

function extractJson(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^```(json)?/i, '').replace(/```$/,'').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('A IA não retornou JSON válido.');
  return JSON.parse(t.slice(a, b + 1));
}

function normalizeAnalysis(j) {
  const a = {};
  a.status_validacao = STATUS_VALIDACAO.includes(j.status_validacao) ? j.status_validacao : 'inconclusivo';
  a.continua_na_empresa = typeof j.continua_na_empresa === 'boolean' ? j.continua_na_empresa : null;
  a.empresa_atual_provavel = String(j.empresa_atual_provavel || '');
  a.cnpj_empresa = String(j.cnpj_empresa || '');
  a.cargo_atual_provavel = String(j.cargo_atual_provavel || '');
  a.equivalencia_cargo = EQUIVALENCIA.includes(j.equivalencia_cargo) ? j.equivalencia_cargo : 'inconclusivo';
  a.score_confianca = Math.max(0, Math.min(100, Number(j.score_confianca) || 0));
  a.risco_homonimo = !!j.risco_homonimo;
  a.precisa_revisao_humana = !!j.precisa_revisao_humana;
  a.resumo_analise = String(j.resumo_analise || '');
  a.evidencias = Array.isArray(j.evidencias) ? j.evidencias.map(String) : [];
  a.fontes = Array.isArray(j.fontes) ? j.fontes.map((f) => ({
    titulo: String(f.titulo || ''), url: String(f.url || ''),
    snippet_relevante: String(f.snippet_relevante || ''),
    tipo_fonte: String(f.tipo_fonte || 'outra'), forca_evidencia: String(f.forca_evidencia || 'baixa'),
  })) : [];
  a.pontos_de_duvida = Array.isArray(j.pontos_de_duvida) ? j.pontos_de_duvida.map(String) : [];
  a.acao_recomendada = ACOES.includes(j.acao_recomendada) ? j.acao_recomendada : 'revisar_manual';
  const s = j.substituto_sugerido;
  a.substituto_sugerido = s && typeof s === 'object' && s.nome ? {
    nome: String(s.nome || ''), cargo: String(s.cargo || ''), empresa: String(s.empresa || ''),
    link_publico: String(s.link_publico || ''), score_confianca: Math.max(0, Math.min(100, Number(s.score_confianca) || 0)),
    motivo_sugestao: String(s.motivo_sugestao || ''),
  } : null;
  return a;
}

// Chamada de IA: usa a integração nativa (window.claude) quando disponível;
// fora deste ambiente (ex.: Vercel), usa a API Anthropic direto do navegador
// com a chave configurada em Configurações.
export function hasNativeAI() {
  return !!(window.claude && window.claude.complete);
}

// Resolve o modelo conforme o provedor de IA em uso
export function resolveModel(mode, settings) {
  const pref = settings.model || 'auto';
  if (hasNativeAI()) return pref === 'auto' ? (mode === 'rapido' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5') : pref;
  if ((settings.aiProvider || 'anthropic') === 'openai') {
    if (pref === 'gpt-4o-mini' || pref === 'gpt-4o') return pref;
    return mode === 'rapido' ? 'gpt-4o-mini' : 'gpt-4o';
  }
  if (pref !== 'auto' && pref.indexOf('claude') === 0) return pref;
  return mode === 'rapido' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5';
}

async function callOpenAI(body, settings) {
  const key = String((settings && settings.openaiKey) || '').trim();
  if (!key) throw new Error('Configure a chave da API OpenAI em Configurações.');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: body.model,
      max_tokens: body.max_tokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: body.system }].concat(body.messages),
    }),
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
    if (r.status === 429) msg = 'limite de requisições/créditos excedido — ' + msg;
    throw new Error('API OpenAI: ' + msg);
  }
  const j = await r.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('API OpenAI: resposta vazia.');
  return text;
}

async function callAI(body, settings) {
  if (hasNativeAI()) return window.claude.complete(body);
  if ((settings.aiProvider || 'anthropic') === 'openai') return callOpenAI(body, settings);
  const key = String((settings && settings.anthropicKey) || '').trim();
  if (!key) throw new Error('Configure a chave da API Anthropic em Configurações (necessária fora deste ambiente).');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: body.model, max_tokens: body.max_tokens, system: body.system, messages: body.messages }),
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
    if (r.status === 429) msg = 'limite de requisições excedido — tente novamente em instantes. (' + msg + ')';
    throw new Error('API Anthropic: ' + msg);
  }
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error('API Anthropic: resposta vazia.');
  return text;
}

export async function analyzeContact(contact, job, settings) {
  const mode = job.modo || 'completo';
  const o = contact.original || {};
  let searchBlock = '';
  let buscas = [];
  if (settings.provider === 'none') {
    searchBlock = 'NENHUM RESULTADO DE BUSCA WEB DISPONÍVEL (provedor de busca não configurado). Baseie-se apenas nos dados originais e seja extremamente conservador: prefira "inconclusivo" e recomende validação manual, por telefone ou por e-mail.';
  } else {
    const queries = buildQueries(o, mode);
    buscas = await runSearches(queries, settings, o);
    searchBlock = 'RESULTADOS DE BUSCA WEB (fontes públicas):\n' + JSON.stringify(buscas, null, 1);
    if (settings.provider === 'demo') {
      searchBlock = '[MODO SIMULAÇÃO ATIVO — os resultados abaixo são FICTÍCIOS, gerados para teste do fluxo]\n' + searchBlock;
    }
  }
  const model = resolveModel(mode, settings);
  // dados oficiais do CNPJ, quando a planilha tiver a coluna mapeada
  let cnpjBlock = '';
  const oficial = await lookupCnpj(o.cnpj);
  if (oficial) {
    cnpjBlock = '\nDADOS OFICIAIS DO CNPJ (fonte pública BrasilAPI / Receita Federal):\n' + JSON.stringify(oficial, null, 1) + '\n';
  }
  const user = `DADOS ORIGINAIS DO CONTATO (CRM):
${JSON.stringify({ nome: o.nome, empresa: o.empresa, cargo: o.cargo, email: o.email, telefone: o.telefone, linkedin: o.linkedin, cnpj: o.cnpj, observacoes: o.observacoes }, null, 1)}
${cnpjBlock}
MODO DE ANÁLISE: ${mode}
DATA ATUAL: ${new Date().toISOString().slice(0, 10)}

${searchBlock}

Analise e responda apenas com o JSON no schema definido.`;
  const raw = await callAI({
    model,
    max_tokens: 4000,
    system: buildSystemPrompt(mode),
    messages: [{ role: 'user', content: user }],
  }, settings);
  const analysis = normalizeAnalysis(extractJson(raw));
  return { analysis, buscas, raw };
}

// ------------------------------------------------------------
// Exportação Excel
// ------------------------------------------------------------
const SIM = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '');

export function exportExcel(job, merged) {
  if (!window.XLSX) throw new Error('Biblioteca de exportação Excel não carregou (verifique a conexão).');
  // colunas da planilha original que não foram mapeadas (ex.: ID) são preservadas
  const mappedCols = new Set(Object.values(job.mapping || {}).filter(Boolean));
  const extraCols = [];
  for (const m of merged) {
    const r = m.contact.original_row || {};
    for (const k of Object.keys(r)) if (!mappedCols.has(k) && !extraCols.includes(k)) extraCols.push(k);
  }
  const data = merged.map((m) => {
    const o = m.contact.original || {};
    const a = m.analysis || {};
    const s = a.substituto_sugerido;
    const out = {
      'Linha original': m.contact.row_number,
      'Nome original': o.nome || '',
      'Empresa original': o.empresa || '',
      'Cargo original': o.cargo || '',
      'E-mail original': o.email || '',
      'Telefone original': o.telefone || '',
      'LinkedIn original': o.linkedin || '',
      'CNPJ original': o.cnpj || '',
      'CNPJ da empresa (encontrado)': a.cnpj_empresa || '',
      'Empresa atual provável': a.empresa_atual_provavel || '',
      'Cargo atual provável': a.cargo_atual_provavel || '',
      'Continua na empresa?': SIM(a.continua_na_empresa),
      'Status de validação': a.status_validacao || '',
      'Score de confiança': a.score_confianca ?? '',
      'Equivalência de cargo': a.equivalencia_cargo || '',
      'Risco de homônimo': SIM(a.risco_homonimo),
      'Precisa revisão humana?': SIM(a.precisa_revisao_humana),
      'Resumo da análise': a.resumo_analise || '',
      'Evidências principais': (a.evidencias || []).join(' | '),
      'Links das fontes': (a.fontes || []).map((f) => f.url).filter(Boolean).join(' | '),
      'Ação recomendada': a.acao_recomendada || '',
      'Nome do substituto sugerido': s ? s.nome : '',
      'Cargo do substituto sugerido': s ? s.cargo : '',
      'Link do substituto': s ? s.link_publico : '',
      'Score do substituto': s ? s.score_confianca : '',
      'Observações': o.observacoes || '',
      'Data da análise': m.analysis ? (m.analysis.analyzed_at || '') : '',
      'Status do processamento': m.contact.status_processamento,
      'Erro': m.contact.last_error || '',
    };
    const orig = m.contact.original_row || {};
    for (const k of extraCols) out['Planilha: ' + k] = String(orig[k] ?? '');
    return out;
  });
  const ws = window.XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] || { a: 1 }).map((k) => ({ wch: Math.min(40, Math.max(12, k.length + 4)) }));  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  const base = (job.nome_arquivo || 'analise').replace(/\.(xlsx|xls|csv|txt)$/i, '');
  window.XLSX.writeFile(wb, 'radar-' + base + '-resultados.xlsx');
}
