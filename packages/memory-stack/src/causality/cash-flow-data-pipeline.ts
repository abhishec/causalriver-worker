/**
 * Cash Flow Data Pipeline — Real Data Assembly for Cash Flow Prophet
 *
 * Queries actual financial data from the NexusBrain signal system
 * and assembles it into structured inputs for the 13-week forecaster.
 *
 * Data sources:
 *   - connector_signals: Xero invoices, payments, bank transactions
 *   - cross_domain_signals: HR hiring velocity, deal pipeline signals
 *   - causal_relationships_statistical: causal DAG edges
 *   - cash_flow_forecasts: prior forecasts for accuracy comparison
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface BankBalance {
  date: string;
  account: string;
  balance: number;
}

export interface Receivable {
  clientId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  /** Collection probability based on payment history patterns */
  collectionProbability: number;
}

export interface Payable {
  vendorId: string;
  vendorName: string;
  amount: number;
  dueDate: string;
}

export interface RecurringFlow {
  source: string;
  weeklyAmount: number;
  confidence: number;
  trend: 'stable' | 'increasing' | 'decreasing';
  trendRate?: number;
}

export interface PipelineDeal {
  dealId: string;
  dealName: string;
  amount: number;
  /** Weighted probability of closing */
  probability: number;
  expectedCloseDate: string;
  /** Monthly recurring revenue if won */
  monthlyRecurring?: number;
}

export interface HiringPlan {
  role: string;
  startDate: string;
  monthlyCost: number;
}

export interface CausalDriver {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  pValue: number;
}

export interface HistoricalForecast {
  forecastDate: string;
  forecastData: unknown;
  accuracyMetrics: unknown;
}

export interface CashFlowInputs {
  bankBalances: BankBalance[];
  receivables: Receivable[];
  payables: Payable[];
  recurringInflows: RecurringFlow[];
  recurringOutflows: RecurringFlow[];
  pipelineDeals: PipelineDeal[];
  hiringPlan: HiringPlan[];
  causalDrivers: CausalDriver[];
  historicalForecasts: HistoricalForecast[];
  /** Snapshot date for the pipeline assembly */
  asOfDate: string;
}

// ============================================================================
// DATA ASSEMBLY
// ============================================================================

/**
 * Assemble all cash flow inputs from the NexusBrain signal system.
 * Runs queries in parallel for performance.
 */
export async function assembleCashFlowInputs(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CashFlowInputs> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

  const [
    bankSignals,
    receivableSignals,
    payableSignals,
    paymentSignals,
    pipelineSignals,
    hiringSignals,
    causalEdges,
    priorForecasts,
  ] = await Promise.all([
    // Bank balances — most recent per account
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'finance')
      .in('signal_type', ['balance_sheet_line', 'bank_transaction_reconciled', 'cash_balance_change'])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200),

    // Outstanding receivables (overdue + upcoming)
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, entity_id, client_id, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'finance')
      .in('signal_type', ['invoice_overdue', 'invoice_created'])
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),

    // Outstanding payables
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, entity_id, client_id, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'finance')
      .in('signal_type', ['payment_sent'])
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(300),

    // Historical payment patterns (for computing collection probability)
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, client_id, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'finance')
      .in('signal_type', ['payment_received', 'invoice_paid'])
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),

    // Deal pipeline signals (from revenue/sales domain)
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, entity_id, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'revenue')
      .in('signal_type', ['deal_stage', 'deal_amount', 'deal_created', 'deal_won', 'deal_lost'])
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200),

    // Hiring velocity (from HR/people domain)
    supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, created_at')
      .eq('organization_id', organizationId)
      .in('source_domain', ['people', 'hr', 'engineering'])
      .in('signal_type', ['hiring_velocity', 'headcount_snapshot', 'new_hire', 'contractor_added'])
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100),

    // Causal DAG edges relevant to finance
    supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, optimal_lag_days, granger_p_value')
      .eq('organization_id', organizationId)
      .or('source_domain.eq.finance,target_domain.eq.finance,source_domain.eq.revenue,target_domain.eq.revenue')
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(50),

    // Prior forecasts for accuracy tracking
    supabase
      .from('cash_flow_forecasts')
      .select('forecast_date, forecast_data, accuracy_metrics')
      .eq('organization_id', organizationId)
      .order('forecast_date', { ascending: false })
      .limit(4),
  ]);

  // ── Transform bank signals → BankBalance[] ──────────────────────────────
  const bankBalances: BankBalance[] = [];
  const seenAccounts = new Set<string>();
  for (const sig of bankSignals.data || []) {
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    const account = (meta?.account as string) || (meta?.line_item as string) || 'primary';
    if (!seenAccounts.has(account)) {
      seenAccounts.add(account);
      bankBalances.push({
        date: sig.created_at,
        account,
        balance: sig.signal_value,
      });
    }
  }

  // ── Transform receivable signals → Receivable[] ─────────────────────────
  // Build payment history per client for collection probability
  const clientPaymentHistory = new Map<string, { totalPaid: number; totalInvoiced: number; avgDaysToPayment: number }>();
  for (const pmt of paymentSignals.data || []) {
    const clientId = pmt.client_id || 'unknown';
    const existing = clientPaymentHistory.get(clientId) || { totalPaid: 0, totalInvoiced: 0, avgDaysToPayment: 30 };
    existing.totalPaid += pmt.signal_value;
    clientPaymentHistory.set(clientId, existing);
  }

  const receivables: Receivable[] = [];
  const seenInvoices = new Set<string>();
  for (const sig of receivableSignals.data || []) {
    if (seenInvoices.has(sig.entity_id)) continue;
    seenInvoices.add(sig.entity_id);
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    const dueDate = (meta?.due_date as string) || sig.created_at;
    const dueDateObj = new Date(dueDate);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDateObj.getTime()) / 86_400_000));

    // Collection probability based on payment history
    const clientId = sig.client_id || 'unknown';
    const history = clientPaymentHistory.get(clientId);
    let collectionProbability = 0.7; // default
    if (history && history.totalPaid > 0) {
      collectionProbability = Math.min(0.95, history.totalPaid / (history.totalPaid + sig.signal_value));
    }
    // Decay probability with days overdue
    if (daysOverdue > 90) collectionProbability *= 0.3;
    else if (daysOverdue > 60) collectionProbability *= 0.5;
    else if (daysOverdue > 30) collectionProbability *= 0.7;

    receivables.push({
      clientId,
      clientName: (meta?.contact_name as string) || clientId,
      amount: sig.signal_value,
      dueDate,
      daysOverdue,
      collectionProbability,
    });
  }

  // ── Transform payable signals → Payable[] ───────────────────────────────
  const payables: Payable[] = [];
  for (const sig of payableSignals.data || []) {
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    payables.push({
      vendorId: sig.client_id || sig.entity_id,
      vendorName: (meta?.contact_name as string) || 'vendor',
      amount: sig.signal_value,
      dueDate: (meta?.due_date as string) || sig.created_at,
    });
  }

  // ── Compute recurring inflows/outflows from patterns ────────────────────
  const recurringInflows: RecurringFlow[] = computeRecurringFlows(
    (receivableSignals.data || []).filter(s => (s.signal_metadata as any)?.status === 'PAID'),
    'inflow',
  );
  const recurringOutflows: RecurringFlow[] = computeRecurringFlows(payableSignals.data || [], 'outflow');

  // ── Transform pipeline signals → PipelineDeal[] ─────────────────────────
  const pipelineDeals: PipelineDeal[] = [];
  const seenDeals = new Set<string>();
  for (const sig of pipelineSignals.data || []) {
    if (seenDeals.has(sig.entity_id)) continue;
    seenDeals.add(sig.entity_id);
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    pipelineDeals.push({
      dealId: sig.entity_id,
      dealName: (meta?.deal_name as string) || sig.entity_id,
      amount: sig.signal_value,
      probability: (meta?.probability as number) || 0.3,
      expectedCloseDate: (meta?.expected_close_date as string) || '',
      monthlyRecurring: meta?.monthly_recurring as number | undefined,
    });
  }

  // ── Transform hiring signals → HiringPlan[] ─────────────────────────────
  const hiringPlan: HiringPlan[] = [];
  for (const sig of hiringSignals.data || []) {
    const meta = sig.signal_metadata as Record<string, unknown> | null;
    if (meta?.role) {
      hiringPlan.push({
        role: meta.role as string,
        startDate: (meta?.start_date as string) || sig.created_at,
        monthlyCost: (meta?.monthly_cost as number) || sig.signal_value,
      });
    }
  }

  // ── Transform causal edges → CausalDriver[] ─────────────────────────────
  const causalDrivers: CausalDriver[] = (causalEdges.data || []).map(e => ({
    source: e.source_domain,
    target: e.target_domain,
    effectSize: e.effect_size,
    lagDays: e.optimal_lag_days,
    pValue: e.granger_p_value,
  }));

  // ── Prior forecasts ─────────────────────────────────────────────────────
  const historicalForecasts: HistoricalForecast[] = (priorForecasts.data || []).map(f => ({
    forecastDate: f.forecast_date,
    forecastData: f.forecast_data,
    accuracyMetrics: f.accuracy_metrics,
  }));

  return {
    bankBalances,
    receivables,
    payables,
    recurringInflows,
    recurringOutflows,
    pipelineDeals,
    hiringPlan,
    causalDrivers,
    historicalForecasts,
    asOfDate: now.toISOString().split('T')[0],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute recurring flow patterns from historical signals.
 * Groups by source/vendor and estimates weekly average + trend.
 */
function computeRecurringFlows(
  signals: Array<{ signal_value: number; signal_metadata: unknown; client_id?: string; created_at: string }>,
  _direction: 'inflow' | 'outflow',
): RecurringFlow[] {
  // Group by source (client_id or vendor)
  const grouped = new Map<string, Array<{ value: number; date: Date }>>();
  for (const sig of signals) {
    const source = sig.client_id || 'misc';
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source)!.push({
      value: sig.signal_value,
      date: new Date(sig.created_at),
    });
  }

  const flows: RecurringFlow[] = [];
  for (const [source, entries] of grouped) {
    if (entries.length < 2) continue; // need at least 2 data points for recurring

    // Sort by date
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Compute total and time span
    const totalValue = entries.reduce((s, e) => s + e.value, 0);
    const spanMs = entries[entries.length - 1].date.getTime() - entries[0].date.getTime();
    const spanWeeks = Math.max(1, spanMs / (7 * 86_400_000));
    const weeklyAmount = totalValue / spanWeeks;

    // Simple trend detection: compare first half to second half
    const mid = Math.floor(entries.length / 2);
    const firstHalfAvg = entries.slice(0, mid).reduce((s, e) => s + e.value, 0) / mid;
    const secondHalfAvg = entries.slice(mid).reduce((s, e) => s + e.value, 0) / (entries.length - mid);
    const trendRatio = secondHalfAvg / (firstHalfAvg || 1);

    let trend: 'stable' | 'increasing' | 'decreasing' = 'stable';
    if (trendRatio > 1.1) trend = 'increasing';
    else if (trendRatio < 0.9) trend = 'decreasing';

    // Confidence based on regularity (coefficient of variation)
    const mean = totalValue / entries.length;
    const variance = entries.reduce((s, e) => s + Math.pow(e.value - mean, 2), 0) / entries.length;
    const cv = Math.sqrt(variance) / (mean || 1);
    const confidence = Math.max(0.3, Math.min(0.95, 1 - cv));

    flows.push({
      source,
      weeklyAmount,
      confidence,
      trend,
      trendRate: trendRatio - 1,
    });
  }

  // Sort by weekly amount descending
  flows.sort((a, b) => b.weeklyAmount - a.weeklyAmount);
  return flows.slice(0, 20); // Top 20 recurring flows
}
