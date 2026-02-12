/**
 * PagerDuty Connector
 *
 * Syncs incident response signals from PagerDuty:
 *   - Incident triggered (with severity mapping)
 *   - Incident acknowledged (time to ack)
 *   - Incident resolved (MTTR calculation)
 *   - Escalation events
 *
 * These signals feed the causal graph to discover relationships like:
 *   incident_frequency → team_burnout → velocity_drop
 *   slow_ack_time → longer_mttr → customer_churn
 *
 * Also feeds the Contributor Expertise Graph via incident_response evidence.
 *
 * @example
 * ```typescript
 * const pd = createPagerDutyConnector({
 *   apiToken: process.env.PAGERDUTY_API_TOKEN!,
 * });
 * const result = await pd.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface PagerDutyConnectorConfig {
  /** PagerDuty API token (v2) */
  apiToken: string;
  /** Base URL (default: "https://api.pagerduty.com") */
  baseUrl?: string;
  /** Filter to specific service IDs */
  serviceIds?: string[];
  /** Max incidents per query (default: 100) */
  maxResults?: number;
}

interface PagerDutyIncident {
  id: string;
  incident_number: number;
  title: string;
  status: string; // 'triggered' | 'acknowledged' | 'resolved'
  urgency: string; // 'high' | 'low'
  priority?: { summary: string; name: string } | null;
  created_at: string;
  last_status_change_at: string;
  resolved_at?: string;
  service: { id: string; summary: string };
  assignments: Array<{
    at: string;
    assignee: { id: string; summary: string; type: string };
  }>;
  acknowledgements: Array<{
    at: string;
    acknowledger: { id: string; summary: string };
  }>;
  escalation_policy: { id: string; summary: string };
  teams?: Array<{ id: string; summary: string }>;
  first_trigger_log_entry?: {
    created_at: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function priorityToValue(incident: PagerDutyIncident): number {
  const priorityName = incident.priority?.name?.toLowerCase() || '';

  if (priorityName.includes('p1') || priorityName.includes('critical') || priorityName.includes('sev1')) {
    return -1;
  }
  if (priorityName.includes('p2') || priorityName.includes('high') || priorityName.includes('sev2')) {
    return -0.7;
  }
  if (priorityName.includes('p3') || priorityName.includes('medium') || priorityName.includes('sev3')) {
    return -0.3;
  }
  if (priorityName.includes('p4') || priorityName.includes('low') || priorityName.includes('sev4')) {
    return -0.1;
  }

  // Fall back to urgency
  return incident.urgency === 'high' ? -0.7 : -0.3;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPagerDutyConnector(config: PagerDutyConnectorConfig): NexusConnector {
  const {
    apiToken,
    baseUrl = 'https://api.pagerduty.com',
    serviceIds,
    maxResults = 100,
  } = config;

  const headers = {
    Authorization: `Token token=${apiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  // ── Fetch helpers ────────────────────────────────────────────────

  async function fetchJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async function fetchIncidents(since?: Date): Promise<PagerDutyIncident[]> {
    const params: Record<string, string> = {
      limit: String(maxResults),
      sort_by: 'created_at:desc',
      'statuses[]': 'triggered,acknowledged,resolved',
    };

    if (since) {
      params.since = since.toISOString();
    }

    if (serviceIds && serviceIds.length > 0) {
      params['service_ids[]'] = serviceIds.join(',');
    }

    const data = await fetchJSON<{ incidents: PagerDutyIncident[] }>('/incidents', params);
    return data.incidents || [];
  }

  // ── Signal transformers ──────────────────────────────────────────

  function incidentsToSignals(incidents: PagerDutyIncident[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const incident of incidents) {
      const baseMetadata: Record<string, unknown> = {
        incident_id: incident.id,
        incident_number: incident.incident_number,
        title: incident.title,
        service: incident.service.summary,
        service_id: incident.service.id,
        urgency: incident.urgency,
        priority: incident.priority?.name,
        escalation_policy: incident.escalation_policy.summary,
        teams: incident.teams?.map((t) => t.summary),
      };

      // Incident triggered signal
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering',
        signal_type: 'incident_triggered',
        signal_value: priorityToValue(incident),
        entity_type: 'incident',
        entity_id: `pd_${incident.id}`,
        signal_timestamp: incident.created_at,
        metadata: {
          ...baseMetadata,
          responder: incident.assignments[0]?.assignee.summary,
          responder_id: incident.assignments[0]?.assignee.id,
        },
      });

      // Incident acknowledged signal
      if (incident.acknowledgements.length > 0) {
        const firstAck = incident.acknowledgements[0];
        const timeToAckMs = new Date(firstAck.at).getTime() - new Date(incident.created_at).getTime();
        const timeToAckMinutes = Math.round(timeToAckMs / 60000);

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'incident_acknowledged',
          signal_value: 0.3,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          signal_timestamp: firstAck.at,
          metadata: {
            ...baseMetadata,
            responder: firstAck.acknowledger.summary,
            responder_id: firstAck.acknowledger.id,
            time_to_ack_minutes: timeToAckMinutes,
          },
        });
      }

      // Incident resolved signal
      if (incident.status === 'resolved' && incident.resolved_at) {
        const mttrMs = new Date(incident.resolved_at).getTime() - new Date(incident.created_at).getTime();
        const mttrMinutes = Math.round(mttrMs / 60000);

        // Find the resolver — last assignment or acknowledger
        const resolver =
          incident.assignments[incident.assignments.length - 1]?.assignee ||
          incident.acknowledgements[incident.acknowledgements.length - 1]?.acknowledger;

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'incident_resolved',
          signal_value: 1,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          signal_timestamp: incident.resolved_at,
          metadata: {
            ...baseMetadata,
            responder: resolver?.summary,
            responder_id: resolver?.id,
            service_name: incident.service.summary,
            mttr_minutes: mttrMinutes,
          },
        });
      }

      // Escalation detection: multiple assignments = escalation
      if (incident.assignments.length > 1) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'oncall_escalated',
          signal_value: -0.5,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          signal_timestamp: incident.assignments[incident.assignments.length - 1].at,
          metadata: {
            ...baseMetadata,
            escalation_level: incident.assignments.length,
          },
        });
      }
    }

    return signals;
  }

  // ── Connector Interface ──────────────────────────────────────────

  return {
    id: 'pagerduty',
    name: 'PagerDuty',
    domain: 'engineering',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];

      try {
        const incidents = await fetchIncidents();
        const signals = incidentsToSignals(incidents, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: incidents.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'pagerduty', organizationId, result);
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
      const errors: string[] = [];

      try {
        const incidents = await fetchIncidents(since);
        const signals = incidentsToSignals(incidents, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: incidents.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'pagerduty', organizationId, result);
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
      const event = payload as any;
      if (!event?.event?.data) return [];

      const signals: ConnectorSignal[] = [];
      const orgId = event.organization_id || '';
      const incident = event.event.data;
      const eventType = event.event.event_type || '';

      const baseMetadata: Record<string, unknown> = {
        incident_id: incident.id,
        title: incident.title,
        service: incident.service?.summary,
        service_id: incident.service?.id,
        urgency: incident.urgency,
        priority: incident.priority?.name,
      };

      if (eventType.includes('triggered')) {
        // Use priorityToValue when priority is available, else fall back to urgency
        const triggerValue = incident.priority?.name
          ? priorityToValue(incident as PagerDutyIncident)
          : (incident.urgency === 'high' ? -0.7 : -0.3);

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'incident_triggered',
          signal_value: triggerValue,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          metadata: baseMetadata,
        });
      }

      if (eventType.includes('acknowledged')) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'incident_acknowledged',
          signal_value: 0.3,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          metadata: {
            ...baseMetadata,
            responder: incident.assignee?.summary,
          },
        });
      }

      if (eventType.includes('resolved')) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'incident_resolved',
          signal_value: 1,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          metadata: {
            ...baseMetadata,
            service_name: incident.service?.summary,
          },
        });
      }

      if (eventType.includes('escalated')) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'oncall_escalated',
          signal_value: -0.5,
          entity_type: 'incident',
          entity_id: `pd_${incident.id}`,
          metadata: baseMetadata,
        });
      }

      return signals;
    },
  };
}
