/**
 * Freshsales Connector
 * ====================
 * Ingests CRM contacts, deals, leads, and activities from Freshsales.
 * Freshsales uses API key authentication.
 *
 * Signal types emitted:
 *   - freshsales_contact:   CRM contact (lead or customer)
 *   - freshsales_deal:      Sales deal / opportunity
 *   - freshsales_activity:  Sales activity (call, email, meeting, task)
 *   - freshsales_lead:      Inbound leads
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface FreshsalesCredentials {
  apiKey: string;
  domain: string; // e.g. "company.myfreshworks.com"
}

interface FreshsalesContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
  company: { name: string } | null;
  lead_source: string | null;
  lifecycle_stage_id: number;
  created_at: string;
  updated_at: string;
  owner: { name: string } | null;
}

interface FreshsalesDeal {
  id: number;
  name: string;
  amount: number;
  base_currency_amount: number;
  expected_close: string | null;
  closed_date: string | null;
  stage: { name: string };
  pipeline: { name: string };
  deal_stage_id: number;
  probability: number;
  owner: { name: string } | null;
  created_at: string;
  updated_at: string;
  currency: string;
}

interface FreshsalesActivity {
  id: number;
  title: string;
  note: string | null;
  type: { name: string };
  created_at: string;
  updated_at: string;
  outcome: string | null;
  owner: { name: string } | null;
}

// Freshsales lifecycle stage IDs → names
const LIFECYCLE_STAGES: Record<number, string> = {
  1: 'Lead',
  2: 'Marketing Qualified Lead',
  3: 'Sales Qualified Lead',
  4: 'Opportunity',
  5: 'Customer',
  6: 'Evangelist',
  7: 'Other',
};

export class FreshsalesConnector extends ConnectorBase {
  readonly connectorType = 'freshsales';

  constructor(
    organizationId: string,
    private freshsalesCreds: FreshsalesCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, freshsalesCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerSecond: 5, // Freshsales API: up to 500 req/min on Growth plan
      backoffMultiplier: 2,
      maxRetries: 3,
      initialBackoffMs: 1000,
    };
  }

  // ─── Initial Load ──────────────────────────────────────────────────────────

  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[Freshsales] Starting initial load...');
    let total = 0;

    try {
      // Ingest contacts, deals, and activities in sequence
      total += await this.ingestContacts();
      total += await this.ingestDeals();
      total += await this.ingestActivities();

      console.log(`[Freshsales] Initial load complete: ${total} signals`);
      return { success: true, signalsIngested: total };
    } catch (error: any) {
      console.error('[Freshsales] Initial load failed:', error);
      return { success: false, signalsIngested: total, errors: [error.message] };
    }
  }

  // ─── Incremental Sync ─────────────────────────────────────────────────────

  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[Freshsales] Starting incremental sync...');
    let total = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );
      const since = checkpoint?.updated_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      total += await this.ingestContacts(since);
      total += await this.ingestDeals(since);
      total += await this.ingestActivities(since);

      console.log(`[Freshsales] Incremental sync complete: ${total} signals`);
      return { success: true, signalsIngested: total };
    } catch (error: any) {
      console.error('[Freshsales] Incremental sync failed:', error);
      return { success: false, signalsIngested: total, errors: [error.message] };
    }
  }

  // ─── Resume ───────────────────────────────────────────────────────────────

  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[Freshsales] Resuming from checkpoint:', checkpoint.state);
    // Simple strategy: re-run incremental from checkpoint updated_at
    return this.incrementalSync();
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  private async ingestContacts(since?: string): Promise<number> {
    let page = 1;
    let total = 0;

    while (true) {
      const endpoint = since
        ? `/crm/sales/api/contacts/filter?page=${page}&per_page=100&filter[updated_after]=${since}`
        : `/crm/sales/api/contacts?page=${page}&per_page=100&sort=updated_at&sort_type=asc`;

      const response = await this.rateLimiter.throttle(() =>
        this.freshsalesFetch(endpoint)
      );

      const contacts: FreshsalesContact[] = response.contacts || [];
      if (contacts.length === 0) break;

      for (const contact of contacts) {
        const signal: Signal = {
          source_domain: 'sales.freshsales',
          signal_type: 'freshsales_contact',
          signal_value: 1,
          entity_type: 'contact',
          entity_id: `freshsales#contact_${contact.id}`,
          signal_metadata: {
            source: 'freshsales',
            content: [
              `${contact.first_name} ${contact.last_name}`,
              contact.job_title,
              contact.company?.name,
              contact.email,
            ]
              .filter(Boolean)
              .join(' — '),
            contact_id: contact.id,
            name: `${contact.first_name} ${contact.last_name}`.trim(),
            email: contact.email,
            phone: contact.phone,
            job_title: contact.job_title,
            company: contact.company?.name || null,
            lead_source: contact.lead_source,
            lifecycle_stage: LIFECYCLE_STAGES[contact.lifecycle_stage_id] || 'Unknown',
            owner: contact.owner?.name || null,
          },
          organization_id: this.organizationId,
          created_at: contact.updated_at,
          signal_timestamp: contact.updated_at,
        };
        await this.streamProcessor.addSignal(signal);
        total++;
      }

      if (total % 1000 === 0) {
        await this.saveCheckpoint({ entity: 'contacts', page, contactsProcessed: total });
      }

      page++;
      if (contacts.length < 100) break;
    }

    return total;
  }

  // ─── Deals ────────────────────────────────────────────────────────────────

  private async ingestDeals(since?: string): Promise<number> {
    let page = 1;
    let total = 0;

    while (true) {
      const endpoint = since
        ? `/crm/sales/api/deals/filter?page=${page}&per_page=100&filter[updated_after]=${since}`
        : `/crm/sales/api/deals?page=${page}&per_page=100&sort=updated_at&sort_type=asc`;

      const response = await this.rateLimiter.throttle(() =>
        this.freshsalesFetch(endpoint)
      );

      const deals: FreshsalesDeal[] = response.deals || [];
      if (deals.length === 0) break;

      for (const deal of deals) {
        const isWon = deal.stage?.name?.toLowerCase().includes('won');
        const isLost = deal.stage?.name?.toLowerCase().includes('lost');

        const signal: Signal = {
          source_domain: 'sales.freshsales',
          signal_type: 'freshsales_deal',
          // signal_value = deal amount (useful for revenue trending)
          signal_value: deal.base_currency_amount || deal.amount || 1,
          entity_type: 'deal',
          entity_id: `freshsales#deal_${deal.id}`,
          signal_metadata: {
            source: 'freshsales',
            content: `Deal: ${deal.name} — ${deal.stage?.name} — $${deal.amount} ${deal.currency}`,
            deal_id: deal.id,
            name: deal.name,
            amount: deal.amount,
            currency: deal.currency,
            stage: deal.stage?.name,
            pipeline: deal.pipeline?.name,
            probability: deal.probability,
            expected_close: deal.expected_close,
            closed_date: deal.closed_date,
            is_won: isWon,
            is_lost: isLost,
            owner: deal.owner?.name || null,
          },
          organization_id: this.organizationId,
          created_at: deal.updated_at,
          signal_timestamp: deal.updated_at,
        };
        await this.streamProcessor.addSignal(signal);
        total++;
      }

      page++;
      if (deals.length < 100) break;
    }

    return total;
  }

  // ─── Activities ───────────────────────────────────────────────────────────

  private async ingestActivities(since?: string): Promise<number> {
    let page = 1;
    let total = 0;

    while (true) {
      const endpoint = since
        ? `/crm/sales/api/activities/filter?page=${page}&per_page=100&filter[updated_after]=${since}`
        : `/crm/sales/api/activities?page=${page}&per_page=100&sort=updated_at&sort_type=asc`;

      const response = await this.rateLimiter.throttle(() =>
        this.freshsalesFetch(endpoint)
      );

      const activities: FreshsalesActivity[] = response.activities || [];
      if (activities.length === 0) break;

      for (const activity of activities) {
        const signal: Signal = {
          source_domain: 'sales.freshsales',
          signal_type: 'freshsales_activity',
          signal_value: 1,
          entity_type: 'activity',
          entity_id: `freshsales#activity_${activity.id}`,
          signal_metadata: {
            source: 'freshsales',
            content: [activity.title, activity.note, activity.outcome]
              .filter(Boolean)
              .join(' — '),
            activity_id: activity.id,
            title: activity.title,
            type: activity.type?.name,
            outcome: activity.outcome,
            owner: activity.owner?.name || null,
          },
          organization_id: this.organizationId,
          created_at: activity.updated_at,
          signal_timestamp: activity.updated_at,
        };
        await this.streamProcessor.addSignal(signal);
        total++;
      }

      page++;
      if (activities.length < 100) break;
    }

    return total;
  }

  // ─── API Helper ───────────────────────────────────────────────────────────

  private async freshsalesFetch(endpoint: string): Promise<any> {
    const url = `https://${this.freshsalesCreds.domain}${endpoint}`;
    const auth = Buffer.from(`${this.freshsalesCreds.apiKey}:X`).toString('base64');

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Freshsales API error: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json();
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use ingestContacts/ingestDeals/ingestActivities');
  }
}
