/**
 * Causal P&L Narrator Agent — Financial Statements That Explain Themselves
 * ========================================================================
 *
 * Brain agent that generates P&L statements with causal annotations
 * explaining WHY every significant line item changed.
 *
 * Composes the existing brainStatementGeneratorAgent for P&L generation,
 * then adds variance analysis and causal attribution on top.
 *
 * @packageDocumentation
 */

import { defineAgent, type AgentDefinition } from './agent-registry';
import {
  computeVariances,
  attributeVarianceCauses,
  type Variance,
  type CausalAttribution,
  type PLLineItem,
} from '../causality/variance-analysis-engine';
import {
  generateVarianceNarrative,
  generateExecutiveSummary,
} from '../causality/narrative-generator';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface CausalPLInput {
  organizationId: string;
  currentPeriod: { from: string; to: string };
  priorPeriod: { from: string; to: string };
  jurisdiction?: string;
  materialityThreshold?: number;
  /** Pre-computed P&L data (optional, otherwise fetched from signals) */
  currentPLData?: PLLineItem[];
  priorPLData?: PLLineItem[];
  supabase?: SupabaseClient;
}

export interface CausalPLOutput {
  currentPL: PLLineItem[];
  priorPL: PLLineItem[];
  variances: Variance[];
  causalAttributions: CausalAttribution[];
  lineNarratives: Array<{ lineItem: string; narrative: string; causalChain: string[] }>;
  executiveSummary: string;
  confidenceScore: number;
  periodLabel: string;
}

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export const brainCausalPLNarratorAgent: AgentDefinition<
  CausalPLInput,
  CausalPLOutput
> = defineAgent({
  name: 'brain-causal-pl-narrator',
  description: 'Generates P&L with causal annotations explaining WHY every line item changed',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['statement-synthesize', 'cross-validate'],
  triggers: ['schedule:monthly_3rd_business_day', 'command:causal_pl'],
  tools: ['statement-synthesize', 'cross-validate'],
  timeoutMs: 180000,
  maxRetries: 1,

  inputSchema: {
    organizationId: 'Organization ID',
    currentPeriod: 'Current period {from, to}',
    priorPeriod: 'Prior period for comparison {from, to}',
    materialityThreshold: 'Materiality threshold percentage (default: 5)',
  },
  outputSchema: {
    currentPL: 'Current period P&L',
    priorPL: 'Prior period P&L',
    variances: 'Computed variances',
    causalAttributions: 'Causal attributions per variance',
    lineNarratives: 'Human-readable narratives per line item',
    executiveSummary: 'Executive summary',
  },
  tags: ['accounting', 'p&l', 'causal', 'narrative'],

  execute: async (input, ctx) => {
    const {
      organizationId,
      currentPeriod,
      priorPeriod,
      materialityThreshold = 5,
    } = input;
    const supabase = input.supabase || (ctx as any).supabase;

    ctx.log(`[brain-causal-pl-narrator] Starting for org ${organizationId.slice(0, 8)}`);
    ctx.reportProgress(0.1, 'Loading financial data...');

    // ── Step 1: Get P&L data (use pre-computed or fetch from signals) ─────
    let currentPL = input.currentPLData || [];
    let priorPL = input.priorPLData || [];

    if (currentPL.length === 0 || priorPL.length === 0) {
      // Fetch from cross_domain_signals
      const [currentSignals, priorSignals] = await Promise.all([
        fetchPLSignals(supabase, organizationId, currentPeriod.from, currentPeriod.to),
        fetchPLSignals(supabase, organizationId, priorPeriod.from, priorPeriod.to),
      ]);
      if (currentPL.length === 0) currentPL = currentSignals;
      if (priorPL.length === 0) priorPL = priorSignals;
    }

    ctx.reportProgress(0.3, `Computing variances across ${currentPL.length} line items...`);

    // ── Step 2: Compute variances ────────────────────────────────────────
    const variances = computeVariances(currentPL, priorPL, materialityThreshold);
    const significantVariances = variances.filter(v => v.materiality !== 'minor');

    ctx.reportProgress(0.5, `Found ${significantVariances.length} significant variances. Attributing causes...`);

    // ── Step 3: Load causal edges and patterns ────────────────────────────
    const [causalEdgesResult, patternsResult, signalsResult] = await Promise.all([
      supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, optimal_lag_days, granger_p_value, natural_language')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .limit(100),
      supabase
        .from('ai_memory')
        .select('content, domain, importance')
        .eq('organization_id', organizationId)
        .in('memory_type', ['pattern', 'insight'])
        .order('importance', { ascending: false })
        .limit(50),
      supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value')
        .eq('organization_id', organizationId)
        .gte('created_at', priorPeriod.from)
        .limit(200),
    ]);

    const causalEdges = causalEdgesResult.data || [];
    const orgPatterns = patternsResult.data || [];
    const signals = signalsResult.data || [];

    // ── Step 4: Attribute causes for each significant variance ───────────
    ctx.reportProgress(0.6, 'Generating causal attributions...');
    const causalAttributions: CausalAttribution[] = [];
    for (const variance of significantVariances) {
      const attribution = attributeVarianceCauses(variance, causalEdges, signals, orgPatterns);
      causalAttributions.push(attribution);
    }

    // ── Step 5: Generate narratives ──────────────────────────────────────
    ctx.reportProgress(0.8, 'Writing causal narratives...');
    const lineNarratives: CausalPLOutput['lineNarratives'] = [];
    for (let i = 0; i < significantVariances.length; i++) {
      const variance = significantVariances[i];
      const attribution = causalAttributions[i];
      const narrative = generateVarianceNarrative(variance, attribution);
      lineNarratives.push({
        lineItem: variance.lineItem,
        narrative,
        causalChain: attribution.attributions.flatMap(a => a.causalPath),
      });
    }

    // ── Step 6: Executive summary ────────────────────────────────────────
    const executiveSummary = generateExecutiveSummary(variances, causalAttributions);

    // ── Step 7: Store analysis ───────────────────────────────────────────
    ctx.reportProgress(0.95, 'Storing analysis...');
    try {
      await supabase.from('pl_variance_analysis').insert({
        organization_id: organizationId,
        period_from: currentPeriod.from,
        period_to: currentPeriod.to,
        comparative_from: priorPeriod.from,
        comparative_to: priorPeriod.to,
        variances,
        causal_attributions: causalAttributions,
        summary_narrative: executiveSummary,
        confidence_score: computeConfidence(causalAttributions),
      });
    } catch (err) {
      ctx.log(`[brain-causal-pl-narrator] Failed to store analysis: ${err}`);
    }

    ctx.reportProgress(1.0, 'Causal P&L analysis complete');

    const periodLabel = `${currentPeriod.from} to ${currentPeriod.to} vs ${priorPeriod.from} to ${priorPeriod.to}`;

    return {
      currentPL,
      priorPL,
      variances,
      causalAttributions,
      lineNarratives,
      executiveSummary,
      confidenceScore: computeConfidence(causalAttributions),
      periodLabel,
    };
  },
});

// ============================================================================
// HELPERS
// ============================================================================

async function fetchPLSignals(
  supabase: SupabaseClient,
  organizationId: string,
  from: string,
  to: string,
): Promise<PLLineItem[]> {
  // Aggregate financial signals into P&L line items
  const { data } = await supabase
    .from('cross_domain_signals')
    .select('signal_value, signal_metadata, signal_type')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'finance')
    .gte('created_at', from)
    .lte('created_at', to)
    .in('signal_type', ['balance_sheet_line', 'invoice_created', 'invoice_paid', 'payment_sent', 'payment_received'])
    .limit(2000);

  if (!data || data.length === 0) return [];

  // Group by account/line item
  const lineItems = new Map<string, { amount: number; type: string }>();
  for (const sig of data) {
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    const lineItem = (meta?.line_item as string) || (meta?.account as string) || sig.signal_type;
    const section = (meta?.section as string) || '';
    const accountType = section.toLowerCase().includes('revenue') ? 'revenue'
      : section.toLowerCase().includes('expense') ? 'expense'
      : sig.signal_type.includes('payment_sent') ? 'expense'
      : sig.signal_type.includes('payment_received') ? 'revenue'
      : 'expense';

    const existing = lineItems.get(lineItem) || { amount: 0, type: accountType };
    existing.amount += sig.signal_value;
    lineItems.set(lineItem, existing);
  }

  return Array.from(lineItems.entries()).map(([lineItem, data]) => ({
    lineItem,
    accountType: data.type,
    amount: Math.round(data.amount * 100) / 100,
  }));
}

function computeConfidence(attributions: CausalAttribution[]): number {
  if (attributions.length === 0) return 0;

  const avgExplained = attributions.reduce((s, a) => s + (100 - a.residualPct), 0) / attributions.length;
  const avgEvidenceStrength = attributions
    .flatMap(a => a.attributions.map(attr => attr.evidenceStrength))
    .reduce((s, e, _, arr) => s + e / arr.length, 0);

  return Math.round(Math.min(1, (avgExplained / 100 * 0.6 + avgEvidenceStrength * 0.4)) * 100) / 100;
}
