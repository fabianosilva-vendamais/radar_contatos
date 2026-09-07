// Revenue Engine / Radar Contatos — política de custo e escalada
// Este módulo não altera a produção sozinho. Deve ser importado pelo engine.js após benchmark.

export const COST_POLICY = {
  version: '2026-09-07',
  models: {
    economy: 'gpt-5.6-luna',
    balanced: 'gpt-5.6-terra',
    advanced: 'gpt-5.6-sol',
  },
  queryLimits: {
    rapido: 1,
    completo: 2,
    estrategico: 4,
  },
  outputTokens: {
    rapido: 650,
    completo: 900,
    estrategico: 1400,
  },
  confidence: {
    accept: 78,
    escalate: 62,
  },
  cacheDays: {
    stable: 90,
    strategic: 60,
    inconclusive: 30,
  },
};

export function chooseModel({ mode = 'completo', confidence = null, strategic = false, conflict = false } = {}) {
  if (strategic || mode === 'estrategico' || conflict) return COST_POLICY.models.advanced;
  if (confidence != null && Number(confidence) < COST_POLICY.confidence.escalate) return COST_POLICY.models.balanced;
  return COST_POLICY.models.economy;
}

export function maxQueries(mode = 'completo') {
  return COST_POLICY.queryLimits[mode] || COST_POLICY.queryLimits.completo;
}

export function maxOutputTokens(mode = 'completo') {
  return COST_POLICY.outputTokens[mode] || COST_POLICY.outputTokens.completo;
}

export function cacheTtlDays({ strategic = false, status = '' } = {}) {
  if (status === 'inconclusivo' || status === 'risco_de_homonimo') return COST_POLICY.cacheDays.inconclusive;
  if (strategic) return COST_POLICY.cacheDays.strategic;
  return COST_POLICY.cacheDays.stable;
}

export function shouldEscalate(analysis = {}, context = {}) {
  if (context.strategic) return true;
  if (analysis.risco_homonimo) return true;
  if (analysis.status_validacao === 'provavel_saida_da_empresa') return true;
  if (analysis.status_validacao === 'saida_confirmada' && context.needReplacement) return true;
  if (analysis.acao_recomendada === 'tentar_novo_decisor') return true;
  if (analysis.score_confianca != null && Number(analysis.score_confianca) < COST_POLICY.confidence.accept) return true;
  return false;
}

export function buildEconomicQueries(o = {}, cleanEmpresaFn = (v) => String(v || '').trim()) {
  const nome = String(o.nome || '').trim();
  const empresa = cleanEmpresaFn(o.empresa);
  const queries = [];
  if (nome && empresa) queries.push(`\"${nome}\" \"${empresa}\"`);
  if (nome && empresa) queries.push(`\"${nome}\" \"${empresa}\" LinkedIn`);
  return queries;
}

export function validationCacheKey(o = {}) {
  const email = String(o.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const companyId = String(o.bitrix_company_id || o.company_id || '').trim();
  const name = String(o.nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `person:${companyId}:${name}`;
}
