/**
 * HubSpot Connector
 *
 * Syncs deal pipeline data from HubSpot and transforms into signals:
 *   - deal_stage_change: When deals move between pipeline stages
 *   - deal_amount_change: When deal values change
 *   - deal_velocity: Days in current stage
 *   - deal_close: When deals are won/lost
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal } from './connector-framework';
import type { NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    closedate?: string;
    hs_lastmodifieddate?: string;
    hubspot_owner_id?: string;
    hs_deal_stage_probability?: string;
  };
  associations?: {
    companies?: Array<{ id: string }>;
  };
}

/**
 * Create a HubSpot connector
 */
export function createHubSpotConnector(apiKey: string): NexusConnector {
  const baseUrl = 'https://api.hubapi.com';

  async function fetchDeals(since?: Date): Promise<HubSpotDeal[]> {
    const url = `${baseUrl}/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate,hs_lastmodifieddate,hubspot_owner_id,hs_deal_stage_probability`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    let deals: HubSpotDeal[] = data.results || [];

    // Filter by modification date if incremental
    if (since) {
      deals = deals.filter((d) => {
        const modified = d.properties.hs_lastmodifieddate;
        return modified && new Date(modified) >= since;
      });
    }

    return deals;
  }

  function dealsToSignals(
    deals: HubSpotDeal[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const deal of deals) {
      const amount = parseFloat(deal.properties.amount || '0');
      const stage = deal.properties.dealstage || 'unknown';
      const companyId = deal.associations?.companies?.[0]?.id;

      // Deal stage signal
      signals.push({
        organization_id: organizationId,
        source_domain: 'revenue',
        signal_type: 'deal_stage',
        signal_value: stageToNumeric(stage),
        entity_type: 'deal',
        entity_id: deal.id,
        client_id: companyId,
        metadata: {
          deal_name: deal.properties.dealname,
          stage,
          amount,
          pipeline: deal.properties.pipeline,
        },
      });

      // Deal amount signal
      if (amount > 0) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'revenue',
          signal_type: 'deal_amount',
          signal_value: amount,
          entity_type: 'deal',
          entity_id: deal.id,
          client_id: companyId,
          metadata: {
            deal_name: deal.properties.dealname,
            stage,
          },
        });
      }

      // Probability signal
      const probability = parseFloat(
        deal.properties.hs_deal_stage_probability || '0'
      );
      if (probability > 0) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'revenue',
          signal_type: 'deal_probability',
          signal_value: probability,
          entity_type: 'deal',
          entity_id: deal.id,
          client_id: companyId,
          metadata: { stage },
        });
      }
    }

    return signals;
  }

  return {
    id: 'hubspot',
    name: 'HubSpot CRM',
    domain: 'revenue',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];

      try {
        const deals = await fetchDeals();
        const signals = dealsToSignals(deals, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: deals.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'hubspot', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();

      try {
        const deals = await fetchDeals(since);
        const signals = dealsToSignals(deals, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: deals.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'hubspot', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      // HubSpot webhook payload processing
      const event = payload as any;
      if (!event?.objectId || !event?.propertyName) return [];

      return [
        {
          organization_id: event.portalId?.toString() || '',
          source_domain: 'revenue',
          signal_type: `deal_${event.propertyName}_change`,
          signal_value: parseFloat(event.propertyValue) || 1,
          entity_type: 'deal',
          entity_id: event.objectId.toString(),
          metadata: {
            property: event.propertyName,
            previous_value: event.previousValue,
            new_value: event.propertyValue,
          },
        },
      ];
    },
  };
}

/**
 * Map HubSpot deal stages to numeric values for signal processing
 */
function stageToNumeric(stage: string): number {
  const stageMap: Record<string, number> = {
    appointmentscheduled: 0.1,
    qualifiedtobuy: 0.3,
    presentationscheduled: 0.4,
    decisionmakerboughtin: 0.6,
    contractsent: 0.8,
    closedwon: 1.0,
    closedlost: -1.0,
  };
  return stageMap[stage.toLowerCase()] || 0.5;
}
