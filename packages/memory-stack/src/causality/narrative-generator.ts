/**
 * Narrative Generator — Causal Narrative Templates for P&L Variances
 *
 * Produces human-readable causal narratives for each P&L line item variance.
 * Template-based for consistency, with structured causal chain references.
 *
 * @packageDocumentation
 */

import type { CausalAttribution, Variance } from './variance-analysis-engine';

// ============================================================================
// VARIANCE NARRATIVE
// ============================================================================

/**
 * Generate a human-readable narrative for a single variance with causal attribution.
 */
export function generateVarianceNarrative(
  variance: Variance,
  attribution: CausalAttribution,
): string {
  const parts: string[] = [];
  const direction = variance.varianceAmount >= 0 ? 'increased' : 'decreased';
  const absVariance = Math.abs(variance.varianceAmount);
  const absPct = Math.abs(variance.variancePct);

  // Opening
  parts.push(
    `${variance.lineItem} ${direction} ${absPct.toFixed(1)}% (${formatCurrency(absVariance)}) vs prior period`
  );

  // Causal attributions
  if (attribution.attributions.length > 0) {
    const topCauses = attribution.attributions.slice(0, 3);
    const causeDescriptions = topCauses.map(a => {
      const sign = a.contribution >= 0 ? '+' : '';
      return `${a.cause} (${sign}${a.contributionPct.toFixed(0)}%, ${formatCurrency(Math.abs(a.contribution))})`;
    });

    parts.push(` — driven by: ${causeDescriptions.join(', ')}`);

    // Residual
    if (attribution.residualPct > 10) {
      parts.push(`. ${attribution.residualPct.toFixed(0)}% remains unexplained by current causal model.`);
    } else {
      parts.push('.');
    }
  } else {
    parts.push('. No causal drivers identified in the current model.');
  }

  return parts.join('');
}

// ============================================================================
// EXECUTIVE SUMMARY
// ============================================================================

/**
 * Generate a 3-5 sentence executive summary of all P&L movements.
 */
export function generateExecutiveSummary(
  variances: Variance[],
  attributions: CausalAttribution[],
): string {
  const significantVariances = variances.filter(v => v.materiality === 'significant');
  const totalRevVariance = variances
    .filter(v => v.accountType === 'revenue')
    .reduce((s, v) => s + v.varianceAmount, 0);
  const totalExpVariance = variances
    .filter(v => v.accountType === 'expense')
    .reduce((s, v) => s + v.varianceAmount, 0);
  const netIncomeVariance = totalRevVariance - totalExpVariance;

  const parts: string[] = [];

  // Overall direction
  if (netIncomeVariance > 0) {
    parts.push(`Net income improved by ${formatCurrency(Math.abs(netIncomeVariance))} period-over-period.`);
  } else if (netIncomeVariance < 0) {
    parts.push(`Net income declined by ${formatCurrency(Math.abs(netIncomeVariance))} period-over-period.`);
  } else {
    parts.push('Net income remained flat period-over-period.');
  }

  // Revenue movement
  if (totalRevVariance !== 0) {
    const revDirection = totalRevVariance > 0 ? 'grew' : 'declined';
    parts.push(`Revenue ${revDirection} by ${formatCurrency(Math.abs(totalRevVariance))}.`);
  }

  // Expense movement
  if (totalExpVariance !== 0) {
    const expDirection = totalExpVariance > 0 ? 'increased' : 'decreased';
    parts.push(`Total expenses ${expDirection} by ${formatCurrency(Math.abs(totalExpVariance))}.`);
  }

  // Top drivers
  const topDrivers = attributions
    .filter(a => a.attributions.length > 0)
    .flatMap(a => a.attributions)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  if (topDrivers.length > 0) {
    const driverNames = topDrivers.map(d => `${d.cause} (${formatCurrency(Math.abs(d.contribution))})`);
    parts.push(`Key causal drivers: ${driverNames.join(', ')}.`);
  }

  // Significant items requiring attention
  const unfavorableSignificant = significantVariances.filter(v => v.direction === 'unfavorable');
  if (unfavorableSignificant.length > 0) {
    parts.push(`${unfavorableSignificant.length} significant unfavorable variance(s) require attention.`);
  }

  return parts.join(' ');
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';
  if (absAmount >= 1_000_000) return `${prefix}$${(absAmount / 1_000_000).toFixed(1)}M`;
  if (absAmount >= 1_000) return `${prefix}$${(absAmount / 1_000).toFixed(0)}K`;
  return `${prefix}$${absAmount.toFixed(0)}`;
}
