/**
 * Contract Ingestion — Contract Terms Data Management
 *
 * Manages the contract_terms table for the Revenue Leakage Detector.
 * Provides upsert, Xero sync, and CSV import capabilities.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ContractTerm {
  clientId: string;
  clientName?: string;
  contractStart?: string;
  contractEnd?: string;
  renewalDate?: string;
  billingFrequency?: 'monthly' | 'quarterly' | 'annual';
  pricingTiers?: PricingTier[];
  contractedValue?: number;
  currency?: string;
  autoRenewal?: boolean;
  priceEscalationPct?: number;
  lastPriceIncreaseDate?: string;
  status?: 'active' | 'expired' | 'cancelled' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface PricingTier {
  tierName: string;
  unitPrice: number;
  volumeMin: number;
  volumeMax: number;
  metric?: string;
}

export interface ContractIngestionResult {
  upserted: number;
  errors: string[];
}

// ============================================================================
// UPSERT
// ============================================================================

/**
 * Upsert contract terms into the database.
 */
export async function ingestContractTerms(
  supabase: SupabaseClient,
  organizationId: string,
  contracts: ContractTerm[],
): Promise<ContractIngestionResult> {
  const errors: string[] = [];
  let upserted = 0;

  for (const contract of contracts) {
    try {
      const { error } = await supabase
        .from('contract_terms')
        .upsert(
          {
            organization_id: organizationId,
            client_id: contract.clientId,
            client_name: contract.clientName,
            contract_start: contract.contractStart,
            contract_end: contract.contractEnd,
            renewal_date: contract.renewalDate,
            billing_frequency: contract.billingFrequency || 'monthly',
            pricing_tiers: contract.pricingTiers || [],
            contracted_value: contract.contractedValue,
            currency: contract.currency || 'SGD',
            auto_renewal: contract.autoRenewal ?? false,
            price_escalation_pct: contract.priceEscalationPct ?? 0,
            last_price_increase_date: contract.lastPriceIncreaseDate,
            status: contract.status || 'active',
            metadata: contract.metadata || {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,client_id' },
        );

      if (error) {
        errors.push(`Contract ${contract.clientId}: ${error.message}`);
      } else {
        upserted++;
      }
    } catch (err: any) {
      errors.push(`Contract ${contract.clientId}: ${err.message}`);
    }
  }

  return { upserted, errors };
}

// ============================================================================
// XERO SYNC
// ============================================================================

/**
 * Extract contract-like data from Xero repeating invoices.
 * Maps Xero repeating invoice patterns to contract terms.
 */
export async function syncContractsFromXero(
  supabase: SupabaseClient,
  organizationId: string,
  xeroRepeatingInvoices: Array<{
    RepeatingInvoiceID: string;
    Contact: { ContactID: string; Name: string };
    Total: number;
    CurrencyCode: string;
    Schedule: { Period: number; Unit: string; StartDate: string; EndDate?: string };
    Status: string;
  }>,
): Promise<ContractIngestionResult> {
  const contracts: ContractTerm[] = xeroRepeatingInvoices.map(inv => {
    const schedule = inv.Schedule;
    let billingFrequency: 'monthly' | 'quarterly' | 'annual' = 'monthly';
    if (schedule.Unit === 'MONTHLY' && schedule.Period === 3) billingFrequency = 'quarterly';
    else if (schedule.Unit === 'MONTHLY' && schedule.Period >= 12) billingFrequency = 'annual';
    else if (schedule.Unit === 'YEARLY') billingFrequency = 'annual';

    return {
      clientId: inv.Contact.ContactID,
      clientName: inv.Contact.Name,
      contractStart: schedule.StartDate,
      contractEnd: schedule.EndDate,
      billingFrequency,
      contractedValue: inv.Total,
      currency: inv.CurrencyCode,
      autoRenewal: inv.Status === 'AUTHORISED',
      status: inv.Status === 'AUTHORISED' ? 'active' as const : 'expired' as const,
      metadata: { xeroRepeatingInvoiceId: inv.RepeatingInvoiceID },
    };
  });

  return ingestContractTerms(supabase, organizationId, contracts);
}

// ============================================================================
// CSV IMPORT
// ============================================================================

/**
 * Parse CSV data into contract terms and ingest.
 * Expected columns: client_id, client_name, contract_start, contract_end,
 * renewal_date, billing_frequency, contracted_value, currency, auto_renewal,
 * price_escalation_pct, tier_name, unit_price, volume_min, volume_max
 */
export async function importContractCSV(
  supabase: SupabaseClient,
  organizationId: string,
  csvRows: Array<Record<string, string>>,
): Promise<ContractIngestionResult> {
  // Group rows by client_id (multiple rows = multiple pricing tiers)
  const grouped = new Map<string, { base: Record<string, string>; tiers: PricingTier[] }>();

  for (const row of csvRows) {
    const clientId = row.client_id || row.clientId;
    if (!clientId) continue;

    if (!grouped.has(clientId)) {
      grouped.set(clientId, { base: row, tiers: [] });
    }

    // Add tier if tier columns exist
    if (row.tier_name || row.tierName) {
      grouped.get(clientId)!.tiers.push({
        tierName: row.tier_name || row.tierName || 'default',
        unitPrice: parseFloat(row.unit_price || row.unitPrice || '0'),
        volumeMin: parseFloat(row.volume_min || row.volumeMin || '0'),
        volumeMax: parseFloat(row.volume_max || row.volumeMax || '999999'),
        metric: row.metric,
      });
    }
  }

  const contracts: ContractTerm[] = [];
  for (const [clientId, { base, tiers }] of grouped) {
    contracts.push({
      clientId,
      clientName: base.client_name || base.clientName,
      contractStart: base.contract_start || base.contractStart,
      contractEnd: base.contract_end || base.contractEnd,
      renewalDate: base.renewal_date || base.renewalDate,
      billingFrequency: (base.billing_frequency || base.billingFrequency || 'monthly') as ContractTerm['billingFrequency'],
      pricingTiers: tiers.length > 0 ? tiers : undefined,
      contractedValue: base.contracted_value ? parseFloat(base.contracted_value) : undefined,
      currency: base.currency || 'SGD',
      autoRenewal: base.auto_renewal === 'true' || base.autoRenewal === 'true',
      priceEscalationPct: base.price_escalation_pct ? parseFloat(base.price_escalation_pct) : 0,
      status: 'active',
    });
  }

  return ingestContractTerms(supabase, organizationId, contracts);
}
