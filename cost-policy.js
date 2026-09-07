// Revenue Engine / Radar Contatos — política de custo e escalada
// Branch de benchmark. Não altera produção enquanto não houver merge explícito.
// Referência de preços/modelos revisada em 07/09/2026.

export const COST_POLICY = {
  version: '2026-09-07.3',
  models: {
    economy: 'gpt-5.6-luna',
    strategic: 'gpt-5.6-terra',
  },
  // O fluxo normal usa UMA execução de web search. A segunda investigação
  // só acontece quando o primeiro resultado sinaliza que vale o custo.
  webRuns: {
    rapido: 1,
    completo: 1,
    estrategico: 2,
  },
  outputTokens: {
    rapido: 750,
    completo: 1100,
    estrategico: 1800,
  },
  confidence: {
    accept: 80,
    escalateBelow: 55,
  },
  cacheDays: {
    stable: 90,
    strategic: 45,
    inconclusive: 30,
    confirmedExit: 180,
  },
  // Preços da API OpenAI em USD por 1M tokens em 07/09/2026.
  pricingUsdPerMillion: {
    'gpt-5.6-luna': { input: 0.20, cachedInput: 0.02, output: 1.20 },
    'gpt-5.6-terra': { input: 2.00, cachedInput: 0.20, output: 12.00 },
  },
  // US$10 / 1K web runs. Tokens do conteúdo da pesquisa são cobrados
  // adicionalmente às tarifas do modelo e devem ser capturados em usage.
  webSearchUsdPerExecution: 0.01,
};

export function chooseModel({ strategic = false } = {}) {
  return strategic ? COST_POLICY.models.strategic : COST_POLICY.models.economy;
}

export function maxWebRuns(mode = 'completo') {
  return COST_POLICY.webRuns[mode] || COST_POLICY.webRuns.completo;
}

export function maxOutputTokens(mode = 'completo') {
  return COST_POLICY.outputTokens[mode] || COST_POLICY.outputTokens.completo;
}

export function cacheTtlDays({ strategic = false, status = '', confidence = 0 } = {}) {
  if (status === 'saida_confirmada') return COST_POLICY.cacheDays.confirmedExit;
  if (status === 'inconclusivo' || status === 'risco_de_homonimo') return COST_POLICY.cacheDays.inconclusive;
  if (strategic) return COST_POLICY.cacheDays.strategic;
  if (Number(confidence) >= 85) return COST_POLICY.cacheDays.stable;
  return 45;
}

// A primeira execução nunca usa Terra por ser ambígua. Ela retorna
// precisa_escalada=true quando uma investigação adicional provavelmente muda a decisão.
export function shouldEscalate(analysis = {}, context = {}) {
  if (context.strategic) return true;
  if (analysis.precisa_escalada === true) return true;
  const score = Number(analysis.score_confianca ?? 100);
  const conflict = analysis.risco_homonimo || analysis.status_validacao === 'inconclusivo';
  return conflict && score < COST_POLICY.confidence.escalateBelow;
}

export function validationCacheKey(o = {}) {
  const email = String(o.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const companyId = String(o.bitrix_company_id || o.company_id || '').trim();
  const name = String(o.nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `person:${companyId}:${name}`;
}

export function estimateOpenAiCost({
  model = COST_POLICY.models.economy,
  inputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
  webSearchExecutions = 0,
} = {}) {
  const rate = COST_POLICY.pricingUsdPerMillion[model] || COST_POLICY.pricingUsdPerMillion[COST_POLICY.models.economy];
  return (Number(inputTokens) / 1e6) * rate.input +
    (Number(cachedInputTokens) / 1e6) * rate.cachedInput +
    (Number(outputTokens) / 1e6) * rate.output +
    Number(webSearchExecutions) * COST_POLICY.webSearchUsdPerExecution;
}
