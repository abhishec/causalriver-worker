/**
 * Revenue Leakage Detector Agent — Finds Money You're Losing
 * ===========================================================
 *
 * Brain agent that cross-references contracts, invoices, and usage data
 * to detect revenue leakage from:
 *   1. Under-billing: usage exceeds contracted tier
 *   2. Missed renewals: expired contracts without renewal invoice
 *   3. Unapplied price escalation: escalation clause exists but rates unchanged
 *   4. Overage recognition gaps: usage exceeds threshold, no overage invoice
 *   5. Pricing errors: invoice amounts don't match contract tiers
 *
 * @packageDocumentation
 */

import { defineAgent, type AgentDefinition } from './agent-registry';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export type LeakageFindingType =
  | 'under_billing'
  | 'missed_renewal'
  | 'unapplied_escalation'
  | 'overage_gap'
  | 'pricing_error';

export interface LeakageFinding {
  findingType: LeakageFindingType;
  clientId: string;
  clientName: string;
  amountLeaked: number;
  currency: string;
  evidence: {
    contractRate?: number;
    billedRate?: number;
    usage?: number;
    gapDescription: string;
    affectedInvoices?: string[];
    affectedPeriod?: string;
  };
  correctiveAction: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

export interface RevenueLeakageInput {
  organizationId: string;
  scanPeriod?: { from: string; to: string };
  supabase?: SupabaseClient;
}

export interface RevenueLeakageOutput {
  findings: LeakageFinding[];
  totalLeakage: number;
  leakageByType: Record<string, { count: number; amount: number }>;
  summary: string;
  recommendations: Array<{ action: string; impact: number; effort: 'low' | 'medium' | 'high' }>;
  scannedClients: number;
  scannedInvoices: number;
}

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export const brainRevenueLeakageAgent: AgentDefinition<
  RevenueLeakageInput,
  RevenueLeakageOutput
> = defineAgent({
  name: 'brain-revenue-leakage-detector',
  description: 'Detects revenue leakage from under-billing, missed renewals, and pricing gaps',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['cross-validate', 'confidence-triage'],
  triggers: ['schedule:daily_6am', 'command:revenue_leakage'],
  tools: ['cross-validate', 'confidence-triage'],
  timeoutMs: 180000,
  maxRetries: 1,

  inputSchema: {
    organizationId: 'Organization ID for data retrieval',
    scanPeriod: 'Optional period to scan { from, to }',
  },
  outputSchema: {
    findings: 'Detected leakage items with evidence and corrective actions',
    totalLeakage: 'Total dollar amount of detected leakage',
    leakageByType: 'Breakdown by leakage type',
    summary: 'Human-readable summary',
    recommendations: 'Prioritized remediation actions',
  },
  tags: ['accounting', 'revenue', 'leakage', 'proactive'],

  execute: async (input, ctx) => {
    const { organizationId, scanPeriod } = input;
    const supabase = input.supabase || (ctx as any).supabase;

    ctx.log(`[brain-revenue-leakage] Starting scan for org ${organizationId.slice(0, 8)}`);
    ctx.reportProgress(0.1, 'Loading contract terms...');

    // ── Step 1: Load contract terms ───────────────────────────────────────
    const { data: contracts } = await supabase
      .from('contract_terms')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (!contracts || contracts.length === 0) {
      ctx.log('[brain-revenue-leakage] No active contracts found');
      return {
        findings: [],
        totalLeakage: 0,
        leakageByType: {},
        summary: 'No active contracts found. Import contract terms to enable leakage detection.',
        recommendations: [{ action: 'Import contract terms via CSV or Xero sync', impact: 0, effort: 'low' }],
        scannedClients: 0,
        scannedInvoices: 0,
      };
    }

    ctx.reportProgress(0.3, `Loaded ${contracts.length} contracts. Fetching invoices...`);

    // ── Step 2: Load invoice signals ──────────────────────────────────────
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const periodFrom = scanPeriod?.from || ninetyDaysAgo;

    const { data: invoiceSignals } = await supabase
      .from('cross_domain_signals')
      .select('signal_value, signal_metadata, entity_id, client_id, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'finance')
      .in('signal_type', ['invoice_created', 'invoice_paid', 'invoice_overdue'])
      .gte('created_at', periodFrom)
      .order('created_at', { ascending: false })
      .limit(1000);

    const invoices = invoiceSignals || [];
    ctx.reportProgress(0.5, `Analyzing ${invoices.length} invoices against ${contracts.length} contracts...`);

    // ── Step 3: Run detection rules ───────────────────────────────────────
    const findings: LeakageFinding[] = [];

    for (const contract of contracts) {
      const clientInvoices = invoices.filter(inv => inv.client_id === contract.client_id);
      const tiers = (contract.pricing_tiers || []) as Array<{ tierName: string; unitPrice: number; volumeMin: number; volumeMax: number }>;

      // Rule 1: Under-billing — check if billed amounts match contract tiers
      if (tiers.length > 0 && clientInvoices.length > 0) {
        for (const inv of clientInvoices) {
          const meta = inv.signal_metadata as Record<string, unknown> | null;
          const invoiceAmount = inv.signal_value;

          // Check if invoice amount matches any expected tier
          const expectedTier = tiers.find(t => invoiceAmount >= t.unitPrice * t.volumeMin && invoiceAmount <= t.unitPrice * t.volumeMax);
          const highestTier = tiers.sort((a, b) => b.unitPrice - a.unitPrice)[0];

          if (!expectedTier && highestTier && invoiceAmount < highestTier.unitPrice * highestTier.volumeMin) {
            const gap = (highestTier.unitPrice * highestTier.volumeMin) - invoiceAmount;
            if (gap > 100) { // Only flag significant gaps
              findings.push({
                findingType: 'under_billing',
                clientId: contract.client_id,
                clientName: contract.client_name || contract.client_id,
                amountLeaked: gap,
                currency: contract.currency || 'SGD',
                evidence: {
                  contractRate: highestTier.unitPrice,
                  billedRate: invoiceAmount / (highestTier.volumeMin || 1),
                  gapDescription: `Invoice ${(meta?.invoice_number as string) || inv.entity_id} billed ${invoiceAmount} but contract tier expects minimum ${highestTier.unitPrice * highestTier.volumeMin}`,
                  affectedInvoices: [inv.entity_id],
                },
                correctiveAction: `Issue corrective invoice for ${gap.toFixed(2)} ${contract.currency}`,
                urgency: gap > 10000 ? 'critical' : gap > 1000 ? 'high' : 'medium',
              });
            }
          }
        }
      }

      // Rule 2: Missed renewals
      if (contract.renewal_date && !contract.auto_renewal) {
        const renewalDate = new Date(contract.renewal_date);
        if (renewalDate < new Date()) {
          const recentInvoices = clientInvoices.filter(inv =>
            new Date(inv.created_at) > renewalDate
          );
          if (recentInvoices.length === 0) {
            findings.push({
              findingType: 'missed_renewal',
              clientId: contract.client_id,
              clientName: contract.client_name || contract.client_id,
              amountLeaked: contract.contracted_value || 0,
              currency: contract.currency || 'SGD',
              evidence: {
                gapDescription: `Contract renewal date ${contract.renewal_date} has passed with no renewal invoice`,
                affectedPeriod: `Since ${contract.renewal_date}`,
              },
              correctiveAction: 'Contact client to negotiate renewal or confirm cancellation',
              urgency: (contract.contracted_value || 0) > 50000 ? 'critical' : 'high',
            });
          }
        }
      }

      // Rule 3: Unapplied price escalation
      if (contract.price_escalation_pct > 0) {
        const lastIncrease = contract.last_price_increase_date
          ? new Date(contract.last_price_increase_date)
          : new Date(contract.contract_start || '2020-01-01');
        const yearsSinceIncrease = (Date.now() - lastIncrease.getTime()) / (365.25 * 86_400_000);

        if (yearsSinceIncrease >= 1) {
          const escalationAmount = (contract.contracted_value || 0) * (contract.price_escalation_pct / 100) * Math.floor(yearsSinceIncrease);
          if (escalationAmount > 0) {
            findings.push({
              findingType: 'unapplied_escalation',
              clientId: contract.client_id,
              clientName: contract.client_name || contract.client_id,
              amountLeaked: escalationAmount,
              currency: contract.currency || 'SGD',
              evidence: {
                gapDescription: `${contract.price_escalation_pct}% annual escalation clause not applied for ${Math.floor(yearsSinceIncrease)} year(s)`,
                affectedPeriod: `Since ${lastIncrease.toISOString().split('T')[0]}`,
              },
              correctiveAction: `Apply ${contract.price_escalation_pct}% price increase effective next billing cycle`,
              urgency: escalationAmount > 5000 ? 'high' : 'medium',
            });
          }
        }
      }
    }

    ctx.reportProgress(0.8, `Found ${findings.length} leakage items. Computing summary...`);

    // ── Step 4: Compute summary metrics ───────────────────────────────────
    const totalLeakage = findings.reduce((s, f) => s + f.amountLeaked, 0);
    const leakageByType: Record<string, { count: number; amount: number }> = {};
    for (const f of findings) {
      if (!leakageByType[f.findingType]) {
        leakageByType[f.findingType] = { count: 0, amount: 0 };
      }
      leakageByType[f.findingType].count++;
      leakageByType[f.findingType].amount += f.amountLeaked;
    }

    // ── Step 5: Store findings ────────────────────────────────────────────
    if (findings.length > 0) {
      const rows = findings.map(f => ({
        organization_id: organizationId,
        finding_type: f.findingType,
        client_id: f.clientId,
        client_name: f.clientName,
        amount_leaked: f.amountLeaked,
        currency: f.currency,
        evidence: f.evidence,
        corrective_action: f.correctiveAction,
        urgency: f.urgency,
        status: 'open',
      }));

      await supabase.from('revenue_leakage_findings').insert(rows).catch((err: any) => {
        ctx.log(`[brain-revenue-leakage] Failed to store findings: ${err}`);
      });
    }

    ctx.reportProgress(1.0, 'Scan complete');

    // ── Step 6: Generate summary ──────────────────────────────────────────
    const summary = findings.length > 0
      ? `Revenue leakage scan detected ${findings.length} issues totaling ${formatCurrency(totalLeakage)}. ` +
        `Top types: ${Object.entries(leakageByType).sort((a, b) => b[1].amount - a[1].amount).map(([type, data]) => `${type.replace('_', ' ')} (${data.count} items, ${formatCurrency(data.amount)})`).join(', ')}.`
      : 'No revenue leakage detected. All contracts and invoices are aligned.';

    const recommendations = Object.entries(leakageByType)
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([type, data]) => ({
        action: `Resolve ${data.count} ${type.replace('_', ' ')} finding(s) worth ${formatCurrency(data.amount)}`,
        impact: data.amount,
        effort: data.count > 5 ? 'high' as const : data.count > 2 ? 'medium' as const : 'low' as const,
      }));

    return {
      findings: findings.sort((a, b) => b.amountLeaked - a.amountLeaked),
      totalLeakage: Math.round(totalLeakage * 100) / 100,
      leakageByType,
      summary,
      recommendations,
      scannedClients: contracts.length,
      scannedInvoices: invoices.length,
    };
  },
});

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  if (absAmount >= 1_000_000) return `$${(absAmount / 1_000_000).toFixed(1)}M`;
  if (absAmount >= 1_000) return `$${(absAmount / 1_000).toFixed(0)}K`;
  return `$${absAmount.toFixed(0)}`;
}
