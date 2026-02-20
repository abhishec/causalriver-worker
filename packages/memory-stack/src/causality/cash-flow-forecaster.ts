/**
 * Cash Flow Forecaster — 13-Week Causal Cash Flow Projections
 *
 * Builds on the existing temporal-forecaster.ts (Holt-Winters + DAG-informed)
 * but specializes for cash flow use case:
 *   - Decomposes into inflow/outflow streams
 *   - Applies receivable collection probabilities
 *   - Factors in deal pipeline with weighted probability
 *   - Accounts for payroll burn from hiring velocity
 *   - Provides per-week risk assessment and causal drivers
 *
 * @packageDocumentation
 */

import type { CashFlowInputs, CausalDriver, Receivable, PipelineDeal, HiringPlan } from './cash-flow-data-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export interface WeeklyProjection {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  projectedInflow: number;
  projectedOutflow: number;
  netCashPosition: number;
  lower95: number;
  upper95: number;
  riskLevel: 'safe' | 'watch' | 'critical';
  drivers: CashDriver[];
}

export interface CashDriver {
  factor: string;
  impact: number;
  direction: 'inflow' | 'outflow';
  confidence: number;
  causalPath?: string;
}

export interface CashFlowRisk {
  week: number;
  risk: string;
  severity: 'high' | 'medium' | 'low';
  mitigationSuggestion: string;
  dollarImpact: number;
}

export interface ForecastComparison {
  mape: number;
  directionalAccuracy: number;
  biasDirection: 'optimistic' | 'pessimistic' | 'neutral';
  weeklyErrors: Array<{ week: number; forecast: number; actual: number; error: number }>;
}

export interface CashFlowForecast {
  predictions: WeeklyProjection[];
  overallConfidence: number;
  runwayWeeks: number;
  criticalWeeks: number[];
  risks: CashFlowRisk[];
  comparisonToPrior?: ForecastComparison;
  causalNarrative: string;
  totalProjectedInflow: number;
  totalProjectedOutflow: number;
  minCashPosition: number;
  minCashWeek: number;
}

// ============================================================================
// FORECAST ENGINE
// ============================================================================

/**
 * Generate a 13-week cash flow forecast from assembled inputs.
 */
export function generateCashFlowForecast(
  inputs: CashFlowInputs,
  horizonWeeks: number = 13,
): CashFlowForecast {
  const startDate = new Date(inputs.asOfDate);
  const predictions: WeeklyProjection[] = [];
  const risks: CashFlowRisk[] = [];

  // ── Compute starting cash position ──────────────────────────────────────
  let currentCash = inputs.bankBalances.reduce((sum, b) => sum + b.balance, 0);
  if (currentCash === 0 && inputs.receivables.length > 0) {
    // Fallback: estimate from net receivables - payables
    currentCash = inputs.receivables.reduce((s, r) => s + r.amount * r.collectionProbability, 0)
                - inputs.payables.reduce((s, p) => s + p.amount, 0);
  }

  // ── Compute weekly baseline flows ───────────────────────────────────────
  const baselineWeeklyInflow = inputs.recurringInflows.reduce((s, f) => s + f.weeklyAmount * f.confidence, 0);
  const baselineWeeklyOutflow = inputs.recurringOutflows.reduce((s, f) => s + f.weeklyAmount * f.confidence, 0);

  // ── Project receivable collections by week ──────────────────────────────
  const receivablesByWeek = projectReceivablesByWeek(inputs.receivables, startDate, horizonWeeks);

  // ── Project pipeline deal inflows by week ───────────────────────────────
  const pipelineByWeek = projectPipelineByWeek(inputs.pipelineDeals, startDate, horizonWeeks);

  // ── Project hiring costs by week ────────────────────────────────────────
  const hiringCostsByWeek = projectHiringCostsByWeek(inputs.hiringPlan, startDate, horizonWeeks);

  // ── Apply trend adjustments from causal drivers ─────────────────────────
  const trendMultipliers = computeTrendMultipliers(inputs.causalDrivers);

  // ── Build weekly projections ────────────────────────────────────────────
  let runningCash = currentCash;

  for (let w = 0; w < horizonWeeks; w++) {
    const weekStart = new Date(startDate.getTime() + w * 7 * 86_400_000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000);

    // Inflows: baseline recurring + receivable collections + pipeline wins
    const recurringIn = baselineWeeklyInflow * (1 + (trendMultipliers.inflowTrend * w));
    const receivableIn = receivablesByWeek[w] || 0;
    const pipelineIn = pipelineByWeek[w] || 0;
    const totalInflow = recurringIn + receivableIn + pipelineIn;

    // Outflows: baseline recurring + hiring costs
    const recurringOut = baselineWeeklyOutflow * (1 + (trendMultipliers.outflowTrend * w));
    const hiringOut = hiringCostsByWeek[w] || 0;
    const totalOutflow = recurringOut + hiringOut;

    // Net position
    const netFlow = totalInflow - totalOutflow;
    runningCash += netFlow;

    // Confidence interval (widens with forecast horizon)
    const uncertaintyFactor = 1 + (w * 0.05); // 5% per week
    const baseUncertainty = Math.max(totalInflow, totalOutflow) * 0.15;
    const uncertainty = baseUncertainty * uncertaintyFactor;

    // Risk level
    let riskLevel: 'safe' | 'watch' | 'critical' = 'safe';
    if (runningCash < 0) riskLevel = 'critical';
    else if (runningCash < totalOutflow * 2) riskLevel = 'watch';

    // Build drivers for this week
    const drivers: CashDriver[] = [];
    if (recurringIn > 0) {
      drivers.push({ factor: 'Recurring revenue', impact: recurringIn, direction: 'inflow', confidence: 0.8 });
    }
    if (receivableIn > 0) {
      drivers.push({ factor: 'AR collections', impact: receivableIn, direction: 'inflow', confidence: 0.6 });
    }
    if (pipelineIn > 0) {
      drivers.push({ factor: 'Pipeline deals', impact: pipelineIn, direction: 'inflow', confidence: 0.4 });
    }
    if (recurringOut > 0) {
      drivers.push({ factor: 'Operating expenses', impact: recurringOut, direction: 'outflow', confidence: 0.85 });
    }
    if (hiringOut > 0) {
      drivers.push({ factor: 'New hires', impact: hiringOut, direction: 'outflow', confidence: 0.7 });
    }

    predictions.push({
      weekNumber: w + 1,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      projectedInflow: Math.round(totalInflow * 100) / 100,
      projectedOutflow: Math.round(totalOutflow * 100) / 100,
      netCashPosition: Math.round(runningCash * 100) / 100,
      lower95: Math.round((runningCash - uncertainty * 1.96) * 100) / 100,
      upper95: Math.round((runningCash + uncertainty * 1.96) * 100) / 100,
      riskLevel,
      drivers,
    });

    // Detect risks
    if (riskLevel === 'critical') {
      risks.push({
        week: w + 1,
        risk: `Cash position projected to reach ${formatCurrency(runningCash)} — below zero`,
        severity: 'high',
        mitigationSuggestion: 'Accelerate collections or defer non-essential expenses',
        dollarImpact: Math.abs(runningCash),
      });
    } else if (riskLevel === 'watch') {
      risks.push({
        week: w + 1,
        risk: `Cash position at ${formatCurrency(runningCash)} — less than 2 weeks of operating expenses`,
        severity: 'medium',
        mitigationSuggestion: 'Monitor closely and prepare contingency plan',
        dollarImpact: totalOutflow * 2 - runningCash,
      });
    }
  }

  // ── Pipeline slip risk ──────────────────────────────────────────────────
  const highValueDeals = inputs.pipelineDeals.filter(d => d.amount > 50000 && d.probability < 0.6);
  if (highValueDeals.length > 0) {
    const totalAtRisk = highValueDeals.reduce((s, d) => s + d.amount * d.probability, 0);
    risks.push({
      week: 0, // general risk
      risk: `${highValueDeals.length} high-value deal(s) with <60% probability (combined: ${formatCurrency(totalAtRisk)})`,
      severity: highValueDeals.some(d => d.amount > 100000) ? 'high' : 'medium',
      mitigationSuggestion: 'Review engagement signals and increase deal nurturing',
      dollarImpact: totalAtRisk,
    });
  }

  // ── Compute summary metrics ─────────────────────────────────────────────
  const totalProjectedInflow = predictions.reduce((s, p) => s + p.projectedInflow, 0);
  const totalProjectedOutflow = predictions.reduce((s, p) => s + p.projectedOutflow, 0);
  const minCashPosition = Math.min(...predictions.map(p => p.netCashPosition));
  const minCashWeek = predictions.findIndex(p => p.netCashPosition === minCashPosition) + 1;
  const criticalWeeks = predictions.filter(p => p.riskLevel === 'critical').map(p => p.weekNumber);

  // Runway: weeks until cash hits zero (or full horizon if never)
  let runwayWeeks = horizonWeeks;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i].netCashPosition <= 0) {
      runwayWeeks = i + 1;
      break;
    }
  }

  // Overall confidence: decays with number of risks and forecast uncertainty
  const riskPenalty = Math.min(0.4, risks.length * 0.05);
  const dataPenalty = inputs.bankBalances.length === 0 ? 0.2 : 0;
  const overallConfidence = Math.max(0.1, 0.85 - riskPenalty - dataPenalty);

  // ── Causal narrative ────────────────────────────────────────────────────
  const causalNarrative = generateCausalNarrative(inputs, predictions, risks, runwayWeeks);

  return {
    predictions,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    runwayWeeks,
    criticalWeeks,
    risks: risks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    causalNarrative,
    totalProjectedInflow: Math.round(totalProjectedInflow * 100) / 100,
    totalProjectedOutflow: Math.round(totalProjectedOutflow * 100) / 100,
    minCashPosition: Math.round(minCashPosition * 100) / 100,
    minCashWeek,
  };
}

// ============================================================================
// FORECAST ACCURACY
// ============================================================================

/**
 * Compare a prior forecast to actual data to compute accuracy metrics.
 */
export function compareForecastToActuals(
  priorForecast: WeeklyProjection[],
  actualCashPositions: Array<{ week: number; actual: number }>,
): ForecastComparison {
  const weeklyErrors: ForecastComparison['weeklyErrors'] = [];
  let totalAbsError = 0;
  let totalAbsPctError = 0;
  let correctDirection = 0;
  let totalBias = 0;
  let matchedWeeks = 0;

  for (const actual of actualCashPositions) {
    const forecast = priorForecast.find(p => p.weekNumber === actual.week);
    if (!forecast) continue;

    const error = forecast.netCashPosition - actual.actual;
    const pctError = actual.actual !== 0 ? Math.abs(error / actual.actual) : 0;

    weeklyErrors.push({
      week: actual.week,
      forecast: forecast.netCashPosition,
      actual: actual.actual,
      error,
    });

    totalAbsError += Math.abs(error);
    totalAbsPctError += pctError;
    totalBias += error;
    matchedWeeks++;

    // Directional accuracy: did we predict the right trend direction?
    if (actual.week > 1) {
      const prevActual = actualCashPositions.find(a => a.week === actual.week - 1);
      const prevForecast = priorForecast.find(p => p.weekNumber === actual.week - 1);
      if (prevActual && prevForecast) {
        const actualDirection = actual.actual - prevActual.actual;
        const forecastDirection = forecast.netCashPosition - prevForecast.netCashPosition;
        if ((actualDirection >= 0 && forecastDirection >= 0) || (actualDirection < 0 && forecastDirection < 0)) {
          correctDirection++;
        }
      }
    }
  }

  const mape = matchedWeeks > 0 ? (totalAbsPctError / matchedWeeks) * 100 : 0;
  const directionalAccuracy = matchedWeeks > 1 ? correctDirection / (matchedWeeks - 1) : 0;
  const biasDirection: 'optimistic' | 'pessimistic' | 'neutral' =
    totalBias > totalAbsError * 0.1 ? 'optimistic' :
    totalBias < -totalAbsError * 0.1 ? 'pessimistic' : 'neutral';

  return {
    mape: Math.round(mape * 10) / 10,
    directionalAccuracy: Math.round(directionalAccuracy * 100) / 100,
    biasDirection,
    weeklyErrors,
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function projectReceivablesByWeek(
  receivables: Receivable[],
  startDate: Date,
  horizonWeeks: number,
): number[] {
  const weeklyCollections = new Array(horizonWeeks).fill(0);

  for (const r of receivables) {
    const dueDate = new Date(r.dueDate);
    // If already overdue, expect collection within next 2-4 weeks (with probability)
    if (r.daysOverdue > 0) {
      const expectedCollectionWeek = Math.min(Math.floor(r.daysOverdue / 14), 3);
      if (expectedCollectionWeek < horizonWeeks) {
        weeklyCollections[expectedCollectionWeek] += r.amount * r.collectionProbability;
      }
    } else {
      // Not yet due — expect collection at due date
      const weeksUntilDue = Math.max(0, Math.floor((dueDate.getTime() - startDate.getTime()) / (7 * 86_400_000)));
      if (weeksUntilDue < horizonWeeks) {
        weeklyCollections[weeksUntilDue] += r.amount * r.collectionProbability;
      }
    }
  }

  return weeklyCollections;
}

function projectPipelineByWeek(
  deals: PipelineDeal[],
  startDate: Date,
  horizonWeeks: number,
): number[] {
  const weeklyInflows = new Array(horizonWeeks).fill(0);

  for (const deal of deals) {
    if (!deal.expectedCloseDate) continue;
    const closeDate = new Date(deal.expectedCloseDate);
    const weeksUntilClose = Math.max(0, Math.floor((closeDate.getTime() - startDate.getTime()) / (7 * 86_400_000)));

    if (weeksUntilClose < horizonWeeks) {
      // Weight deal amount by close probability
      weeklyInflows[weeksUntilClose] += deal.amount * deal.probability;
    }
  }

  return weeklyInflows;
}

function projectHiringCostsByWeek(
  hires: HiringPlan[],
  startDate: Date,
  horizonWeeks: number,
): number[] {
  const weeklyCosts = new Array(horizonWeeks).fill(0);

  for (const hire of hires) {
    const hireStartDate = new Date(hire.startDate);
    const weeksUntilStart = Math.max(0, Math.floor((hireStartDate.getTime() - startDate.getTime()) / (7 * 86_400_000)));

    // Add weekly cost (monthly / 4.33) starting from hire start week
    const weeklyCost = hire.monthlyCost / 4.33;
    for (let w = weeksUntilStart; w < horizonWeeks; w++) {
      weeklyCosts[w] += weeklyCost;
    }
  }

  return weeklyCosts;
}

function computeTrendMultipliers(
  causalDrivers: CausalDriver[],
): { inflowTrend: number; outflowTrend: number } {
  let inflowTrend = 0;
  let outflowTrend = 0;

  for (const driver of causalDrivers) {
    if (driver.target === 'finance' || driver.target === 'revenue') {
      // Positive effect on revenue → inflow trend
      if (driver.effectSize > 0) {
        inflowTrend += driver.effectSize * 0.01; // Scale to per-week
      } else {
        outflowTrend += Math.abs(driver.effectSize) * 0.01;
      }
    }
  }

  // Clamp to reasonable range
  return {
    inflowTrend: Math.max(-0.05, Math.min(0.05, inflowTrend)),
    outflowTrend: Math.max(-0.05, Math.min(0.05, outflowTrend)),
  };
}

function generateCausalNarrative(
  inputs: CashFlowInputs,
  predictions: WeeklyProjection[],
  risks: CashFlowRisk[],
  runwayWeeks: number,
): string {
  const parts: string[] = [];

  // Opening: current position
  const currentCash = inputs.bankBalances.reduce((s, b) => s + b.balance, 0);
  parts.push(`Starting cash position: ${formatCurrency(currentCash)}.`);

  // Runway
  if (runwayWeeks < 13) {
    parts.push(`Projected runway: ${runwayWeeks} weeks before cash reaches zero.`);
  } else {
    parts.push(`Cash position remains positive throughout the 13-week forecast horizon.`);
  }

  // Key inflow drivers
  const totalAR = inputs.receivables.reduce((s, r) => s + r.amount, 0);
  if (totalAR > 0) {
    const weightedAR = inputs.receivables.reduce((s, r) => s + r.amount * r.collectionProbability, 0);
    parts.push(`Outstanding receivables: ${formatCurrency(totalAR)} (probability-weighted: ${formatCurrency(weightedAR)}).`);
  }

  // Pipeline
  if (inputs.pipelineDeals.length > 0) {
    const totalPipeline = inputs.pipelineDeals.reduce((s, d) => s + d.amount * d.probability, 0);
    parts.push(`Weighted pipeline: ${formatCurrency(totalPipeline)} across ${inputs.pipelineDeals.length} deals.`);
  }

  // Hiring impact
  if (inputs.hiringPlan.length > 0) {
    const monthlyHiringCost = inputs.hiringPlan.reduce((s, h) => s + h.monthlyCost, 0);
    parts.push(`Planned hires will add ${formatCurrency(monthlyHiringCost)}/month to burn.`);
  }

  // Top risks
  const highRisks = risks.filter(r => r.severity === 'high');
  if (highRisks.length > 0) {
    parts.push(`High-severity risks: ${highRisks.map(r => r.risk).join('; ')}.`);
  }

  return parts.join(' ');
}

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';
  if (absAmount >= 1_000_000) return `${prefix}$${(absAmount / 1_000_000).toFixed(1)}M`;
  if (absAmount >= 1_000) return `${prefix}$${(absAmount / 1_000).toFixed(0)}K`;
  return `${prefix}$${absAmount.toFixed(0)}`;
}

function severityRank(s: string): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}
