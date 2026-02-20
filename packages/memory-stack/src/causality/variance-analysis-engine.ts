/**
 * Variance Analysis Engine — P&L Variance Computation + Causal Attribution
 *
 * Compares current period P&L to prior period, identifies significant variances,
 * and traces each variance through the causal DAG to find root causes.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PLLineItem {
  lineItem: string;
  accountType: string;
  amount: number;
  subType?: string;
}

export interface Variance {
  lineItem: string;
  accountType: string;
  currentAmount: number;
  priorAmount: number;
  varianceAmount: number;
  variancePct: number;
  direction: 'favorable' | 'unfavorable';
  materiality: 'significant' | 'moderate' | 'minor';
}

export interface CausalAttribution {
  lineItem: string;
  totalVariance: number;
  attributions: Attribution[];
  residualUnexplained: number;
  residualPct: number;
}

export interface Attribution {
  cause: string;
  domain: string;
  contribution: number;
  contributionPct: number;
  causalPath: string[];
  evidenceStrength: number;
  evidence: string;
}

export interface CausalEdge {
  source_domain?: string;
  source_signal?: string;
  target_domain?: string;
  target_signal?: string;
  effect_size: number;
  optimal_lag_days?: number;
  granger_p_value?: number;
  p_value?: number;
  strength?: number;
  lag?: number;
  natural_language?: string;
}

export interface OrgPattern {
  content: string;
  domain?: string;
  importance?: number;
}

// ============================================================================
// VARIANCE COMPUTATION
// ============================================================================

/**
 * Compare two P&L periods and identify material variances.
 */
export function computeVariances(
  currentPL: PLLineItem[],
  priorPL: PLLineItem[],
  materialityThresholdPct: number = 5,
): Variance[] {
  const variances: Variance[] = [];

  // Build map of prior period values
  const priorMap = new Map<string, PLLineItem>();
  for (const item of priorPL) {
    priorMap.set(item.lineItem, item);
  }

  for (const current of currentPL) {
    const prior = priorMap.get(current.lineItem);
    const priorAmount = prior?.amount || 0;
    const varianceAmount = current.amount - priorAmount;
    const variancePct = priorAmount !== 0
      ? (varianceAmount / Math.abs(priorAmount)) * 100
      : current.amount !== 0 ? 100 : 0;

    // Determine favorability based on account type
    let direction: 'favorable' | 'unfavorable';
    if (current.accountType === 'revenue') {
      direction = varianceAmount >= 0 ? 'favorable' : 'unfavorable';
    } else {
      // For expenses, decrease is favorable
      direction = varianceAmount <= 0 ? 'favorable' : 'unfavorable';
    }

    // Determine materiality
    const absVariancePct = Math.abs(variancePct);
    let materiality: 'significant' | 'moderate' | 'minor';
    if (absVariancePct >= materialityThresholdPct * 2) materiality = 'significant';
    else if (absVariancePct >= materialityThresholdPct) materiality = 'moderate';
    else materiality = 'minor';

    variances.push({
      lineItem: current.lineItem,
      accountType: current.accountType,
      currentAmount: current.amount,
      priorAmount: priorAmount,
      varianceAmount,
      variancePct: Math.round(variancePct * 10) / 10,
      direction,
      materiality,
    });
  }

  // Check for items in prior but not in current (discontinued)
  for (const [lineItem, prior] of priorMap) {
    if (!currentPL.find(c => c.lineItem === lineItem)) {
      variances.push({
        lineItem,
        accountType: prior.accountType,
        currentAmount: 0,
        priorAmount: prior.amount,
        varianceAmount: -prior.amount,
        variancePct: -100,
        direction: prior.accountType === 'revenue' ? 'unfavorable' : 'favorable',
        materiality: 'significant',
      });
    }
  }

  // Sort by absolute variance amount descending
  return variances.sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount));
}

// ============================================================================
// CAUSAL ATTRIBUTION
// ============================================================================

/**
 * For each significant variance, trace through the causal DAG to find root causes.
 */
export function attributeVarianceCauses(
  variance: Variance,
  causalEdges: CausalEdge[],
  signals: Array<{ source_domain: string; signal_type: string; signal_value: number }>,
  orgPatterns: OrgPattern[],
): CausalAttribution {
  const attributions: Attribution[] = [];
  let explainedAmount = 0;

  // Find edges that target finance/accounting domain
  const relevantEdges = causalEdges.filter(e => {
    const targetDomain = e.target_domain || e.target_signal || '';
    const sourceDomain = e.source_domain || e.source_signal || '';
    return targetDomain.toLowerCase().includes('finance') ||
           targetDomain.toLowerCase().includes('revenue') ||
           targetDomain.toLowerCase().includes('expense') ||
           sourceDomain.toLowerCase().includes(variance.accountType);
  });

  // Map each causal edge to a variance attribution
  for (const edge of relevantEdges) {
    const effectSize = edge.effect_size ?? edge.strength ?? 0;
    const sourceDomain = edge.source_domain || edge.source_signal || 'unknown';
    const targetDomain = edge.target_domain || edge.target_signal || 'unknown';
    const pValue = edge.granger_p_value ?? edge.p_value ?? 0.5;

    // Compute contribution as proportion of effect size
    const contribution = variance.varianceAmount * Math.abs(effectSize) * Math.min(1, 1 / (relevantEdges.length || 1));
    const contributionPct = variance.varianceAmount !== 0
      ? (Math.abs(contribution) / Math.abs(variance.varianceAmount)) * 100
      : 0;

    // Build evidence text
    const evidence = edge.natural_language ||
      `${sourceDomain} shows a ${effectSize > 0 ? 'positive' : 'negative'} causal effect on ${targetDomain} ` +
      `(effect size: ${effectSize.toFixed(3)}, p-value: ${pValue.toFixed(3)})`;

    // Check for corroborating patterns
    const matchingPatterns = orgPatterns.filter(p =>
      p.content.toLowerCase().includes(sourceDomain.toLowerCase()) ||
      p.content.toLowerCase().includes(variance.lineItem.toLowerCase())
    );
    const evidenceStrength = Math.min(1, (1 - pValue) + (matchingPatterns.length > 0 ? 0.1 : 0));

    attributions.push({
      cause: sourceDomain,
      domain: sourceDomain,
      contribution: Math.round(contribution * 100) / 100,
      contributionPct: Math.round(contributionPct * 10) / 10,
      causalPath: [sourceDomain, targetDomain, variance.lineItem],
      evidenceStrength: Math.round(evidenceStrength * 100) / 100,
      evidence,
    });

    explainedAmount += Math.abs(contribution);
  }

  // Normalize attributions so they sum to total variance (approximately)
  const totalExplained = attributions.reduce((s, a) => s + Math.abs(a.contribution), 0);
  if (totalExplained > 0 && Math.abs(variance.varianceAmount) > 0) {
    const scaleFactor = Math.abs(variance.varianceAmount) * 0.85 / totalExplained; // 85% explained target
    for (const attr of attributions) {
      attr.contribution = Math.round(attr.contribution * scaleFactor * 100) / 100;
      attr.contributionPct = Math.round(
        (Math.abs(attr.contribution) / Math.abs(variance.varianceAmount)) * 100 * 10
      ) / 10;
    }
  }

  const totalAttributed = attributions.reduce((s, a) => s + Math.abs(a.contribution), 0);
  const residualUnexplained = Math.abs(variance.varianceAmount) - totalAttributed;

  return {
    lineItem: variance.lineItem,
    totalVariance: variance.varianceAmount,
    attributions: attributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    residualUnexplained: Math.round(Math.max(0, residualUnexplained) * 100) / 100,
    residualPct: variance.varianceAmount !== 0
      ? Math.round((Math.max(0, residualUnexplained) / Math.abs(variance.varianceAmount)) * 100 * 10) / 10
      : 0,
  };
}
