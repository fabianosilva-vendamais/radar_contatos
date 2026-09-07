// Revenue Engine / Radar Contatos — política de custo e escalada
// Branch de benchmark. Não altera a produção enquanto não for integrada ao engine.js.
// Modelos abaixo são IDs reais da API e já compatíveis com o código atual do Radar.

export const COST_POLICY = {
  version: '2026-09-07.2',
  models: {
    economy: 'gpt-4o-mini',
    advanced: 'gpt-4o',
  },
  queryLimits: {
    rapido: 1,
    completo: 2,
    estrategico: 4,
  },
  outputTokens: {
    rapido: 550,
    completo: 750,
    estrategico: 1200,
  },
  confidence: {
    accept: 80,
    expandSearchBelow: 75,
    advancedBelow: 55,
  },
  cacheDays: {
    stable: 90,
    strategic: 60,
    inconclusive: 30,
  },
  // Preços públicos de referência da OpenAI em 07/09/2026, por 1M tokens.
  // Web search é cobrado separadamente por execução e deve ser medido no uso real.
  pricingUsdPerMillion: {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
  },
  webSearchUsdPerExecution: 0.01,
};

export function chooseModel({ mode = 'completo', confidence = null, strategic = false, conflict = false } = {}) {
  if (strategic || mode === 'estrategico') return COST_POLICY.models.advanced;
  if (conflict && confidence != null && Number(confidence) < COST_POLICY.confidence.advancedBelow) {
    return COST_POLICY.models.advanced;
  }
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

// Primeira escalada: ampliar a pesquisa, mantendo o modelo barato.
export function shouldExpandSearch(analysis = {}, context = {}) {
  if (context.strategic) return true;
  if (analysis.risco_homonimo) return true;
  if (analysis.status_validacao === 'provavel_saida_da_empresa') return true;
  if (analysis.status_validacao === 'saida_confirmada' && context.needReplacement) return true;
  if (analysis.acao_recomendada === 'tentar_novo_decisor') return true;
  if (analysis.score_confianca != null && Number(analysis.score_confianca) < COST_POLICY.confidence.expandSearchBelow) return true;
  return false;
}

// Segunda escalada: modelo caro somente para exceções justificadas.
export function shouldUseAdvancedModel(analysis = {}, context = {}) {
  if (context.strategic) return true;
  const score = Number(analysis.score_confianca ?? 100);
  const conflict = analysis.risco_homonimo || analysis.status_validacao === 'inconclusivo';
  return conflict && score < COST_POLICY.confidence.advancedBelow;
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

export function estimateOpenAiCost({ model = COST_POLICY.models.economy, inputTokens = 0, outputTokens = 0, webSearchExecutions = 0 } = {}) {
  const rate = COST_POLICY.pricingUsdPerMillion[model] || COST_POLICY.pricingUsdPerMillion[COST_POLICY.models.economy];
  return (Number(inputTokens) / 1e6) * rate.input +
    (Number(outputTokens) / 1e6) * rate.output +
    Number(webSearchExecutions) * COST_POLICY.webSearchUsdPerExecution;
}
