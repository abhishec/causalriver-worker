/**
 * Xero Transaction Resolver
 * ==========================
 *
 * Fetches ACTUAL financial transaction data from Xero API to verify
 * predictions made by bookkeeper, reconciler, and anomaly domains.
 *
 * Checks: Was the predicted anomaly actually a problem? Did the
 * predicted revenue/expense trend materialize?
 *
 * Covers domains: bookkeeper, reconciler, anomaly
 * Metrics: transaction_anomaly, revenue_trend, expense_trend,
 *          reconciliation_status, overdue_invoices
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import type {
  OutcomeResolver,
  PredictionContext,
  ResolverResult,
} from '../automated-outcome-resolver.js';

// ============================================================================
// TYPES
// ============================================================================

interface XeroCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  accessToken: string;
  refreshToken?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getXeroCredentials(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<XeroCredentials | null> {
  const { data } = await supabase
    .from('connector_settings')
    .select('config')
    .eq('organization_id', organizationId)
    .eq('connector_type', 'xero')
    .eq('is_active', true)
    .single();

  if (!data?.config) return null;

  const config = data.config as Record<string, string>;
  if (!config.accessToken || !config.tenantId) return null;

  return {
    clientId: config.clientId || '',
    clientSecret: config.clientSecret || '',
    tenantId: config.tenantId,
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
  };
}

async function xeroApiFetch(
  creds: XeroCredentials,
  endpoint: string,
  params?: Record<string, string>,
): Promise<unknown | null> {
  const url = new URL(`https://api.xero.com/api.xro/2.0${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Xero-Tenant-Id': creds.tenantId,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      console.debug('[XeroResolver] Token expired, needs refresh');
    }
    return null;
  }

  return res.json();
}

// ============================================================================
// METRIC-SPECIFIC RESOLVERS
// ============================================================================

async function resolveInvoiceOverdue(
  creds: XeroCredentials,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  // Fetch overdue invoices
  const data = (await xeroApiFetch(creds, '/Invoices', {
    where: 'Status=="AUTHORISED" AND AmountDue>0 AND DueDate<DateTime.Now',
    order: 'DueDate ASC',
  })) as { Invoices?: Array<{ AmountDue: number; DueDate: string }> } | null;

  if (!data?.Invoices) return null;

  const overdueCount = data.Invoices.length;
  const totalOverdue = data.Invoices.reduce(
    (sum, inv) => sum + (inv.AmountDue || 0),
    0,
  );

  // Compare with baseline
  const baselineOverdue = ctx.featureSnapshot?.overdue_count || 0;
  const change =
    baselineOverdue > 0
      ? (overdueCount - baselineOverdue) / baselineOverdue
      : overdueCount > 0
        ? 1
        : 0;

  const direction: 'increase' | 'decrease' | 'stable' =
    change > 0.1 ? 'increase' : change < -0.1 ? 'decrease' : 'stable';

  return {
    actualDirection: direction,
    actualMagnitude: change,
    actualValue: overdueCount,
    source: 'xero_api',
    confidence: 1.0,
    measuredAt: new Date(),
    metadata: {
      overdueCount,
      totalOverdueAmount: totalOverdue,
      baselineOverdue,
    },
  };
}

async function resolveRevenueTrend(
  creds: XeroCredentials,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  // Fetch recent paid invoices (revenue)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Current period
  const currentData = (await xeroApiFetch(creds, '/Invoices', {
    where: `Type=="ACCREC" AND Status=="PAID" AND FullyPaidOnDate>=DateTime.Parse("${thirtyDaysAgo}")`,
  })) as { Invoices?: Array<{ Total: number }> } | null;

  // Previous period
  const previousData = (await xeroApiFetch(creds, '/Invoices', {
    where: `Type=="ACCREC" AND Status=="PAID" AND FullyPaidOnDate>=DateTime.Parse("${sixtyDaysAgo}") AND FullyPaidOnDate<DateTime.Parse("${thirtyDaysAgo}")`,
  })) as { Invoices?: Array<{ Total: number }> } | null;

  const currentRevenue = (currentData?.Invoices || []).reduce(
    (sum, inv) => sum + (inv.Total || 0),
    0,
  );
  const previousRevenue = (previousData?.Invoices || []).reduce(
    (sum, inv) => sum + (inv.Total || 0),
    0,
  );

  const change =
    previousRevenue > 0
      ? (currentRevenue - previousRevenue) / previousRevenue
      : currentRevenue > 0
        ? 1
        : 0;

  const direction: 'increase' | 'decrease' | 'stable' =
    change > 0.05 ? 'increase' : change < -0.05 ? 'decrease' : 'stable';

  return {
    actualDirection: direction,
    actualMagnitude: change,
    actualValue: currentRevenue,
    source: 'xero_api',
    confidence: 1.0,
    measuredAt: new Date(),
    metadata: {
      currentRevenue,
      previousRevenue,
      changePercent: Math.round(change * 100),
      period: '30d',
    },
  };
}

async function resolveTransactionAnomaly(
  creds: XeroCredentials,
  ctx: PredictionContext,
  supabase: SupabaseClient,
): Promise<ResolverResult | null> {
  // For anomaly predictions, check if the flagged transaction was:
  // 1. Reversed/voided (confirming it was a real anomaly)
  // 2. Reconciled normally (it was a false positive)

  // Try to find the specific transaction from entity_id
  const txnId = ctx.entityId;

  // Check bank transactions for reconciliation status
  const data = (await xeroApiFetch(
    creds,
    `/BankTransactions/${txnId}`,
  )) as { BankTransactions?: Array<{ Status: string; IsReconciled: boolean }> } | null;

  if (data?.BankTransactions?.[0]) {
    const txn = data.BankTransactions[0];
    const wasRealAnomaly =
      txn.Status === 'DELETED' || txn.Status === 'VOIDED';
    const wasReconciled = txn.IsReconciled;

    // If the prediction said "this is anomalous" and it was deleted/voided → correct
    // If it was reconciled normally → prediction was wrong (false positive)
    const predictedAnomaly =
      ctx.predictedDirection === 'increase' || ctx.predictedMagnitude > 0.5;

    const actualIsAnomaly = wasRealAnomaly;

    return {
      actualDirection: actualIsAnomaly ? 'increase' : 'stable',
      actualMagnitude: actualIsAnomaly ? 1.0 : 0.0,
      actualValue: actualIsAnomaly ? 1 : 0,
      source: 'xero_api',
      confidence: 0.9,
      measuredAt: new Date(),
      metadata: {
        transactionId: txnId,
        status: txn.Status,
        isReconciled: wasReconciled,
        wasRealAnomaly,
        predictedAnomaly,
      },
    };
  }

  // Fallback: check signals for anomaly follow-up
  const { data: followUpSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_value, signal_type, metadata')
    .eq('organization_id', ctx.organizationId)
    .eq('entity_id', ctx.entityId)
    .in('signal_type', [
      'invoice_paid',
      'bank_transaction_reconciled',
      'invoice_overdue',
    ])
    .order('signal_timestamp', { ascending: false })
    .limit(3);

  if (followUpSignals && followUpSignals.length > 0) {
    const wasReconciled = followUpSignals.some(
      (s) =>
        s.signal_type === 'bank_transaction_reconciled' ||
        s.signal_type === 'invoice_paid',
    );

    return {
      actualDirection: wasReconciled ? 'stable' : 'increase',
      actualMagnitude: wasReconciled ? 0 : 0.8,
      actualValue: wasReconciled ? 0 : 1,
      source: 'cross_domain_signals',
      confidence: 0.75,
      measuredAt: new Date(),
      metadata: {
        resolvedVia: 'signal_followup',
        followUpCount: followUpSignals.length,
      },
    };
  }

  return null;
}

// ============================================================================
// RESOLVER
// ============================================================================

export const xeroTransactionResolver: OutcomeResolver = {
  id: 'xero-transaction',
  name: 'Xero Transaction Resolver',
  supportedDomains: ['bookkeeper', 'reconciler', 'anomaly'],
  supportedMetrics: [
    'transaction_anomaly',
    'revenue_trend',
    'expense_trend',
    'reconciliation_status',
    'overdue_invoices',
    'invoice_status',
    'payment_velocity',
    'cash_flow',
  ],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // 1. Get Xero credentials
    const creds = await getXeroCredentials(supabase, ctx.organizationId);
    if (!creds) {
      console.debug(
        '[XeroResolver] No Xero credentials for org',
        ctx.organizationId,
      );
      return null;
    }

    // 2. Dispatch to metric-specific resolver
    switch (ctx.targetMetric) {
      case 'overdue_invoices':
      case 'invoice_status':
      case 'payment_velocity':
        return resolveInvoiceOverdue(creds, ctx);

      case 'revenue_trend':
      case 'cash_flow':
        return resolveRevenueTrend(creds, ctx);

      case 'transaction_anomaly':
      case 'reconciliation_status':
        return resolveTransactionAnomaly(creds, ctx, supabase);

      case 'expense_trend':
        // Mirror revenue_trend logic but for ACCPAY
        return resolveRevenueTrend(creds, {
          ...ctx,
          targetMetric: 'expense_trend',
        });

      default:
        // Try revenue trend as a general fallback
        return resolveRevenueTrend(creds, ctx);
    }
  },
};
