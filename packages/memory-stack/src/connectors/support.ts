/**
 * Support Connector
 *
 * Generic support system connector (Intercom/Zendesk pattern).
 * Transforms support tickets and conversations into signals:
 *   - ticket_created: New support tickets
 *   - ticket_escalation: Escalation events
 *   - response_time: Time to first response
 *   - satisfaction_score: CSAT/NPS scores
 *   - ticket_volume: Volume trends
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal } from './connector-framework';
import type { NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

interface SupportTicket {
  id: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  first_response_at?: string;
  resolved_at?: string;
  satisfaction_rating?: number;
  tags?: string[];
  assignee_id?: string;
  company_id?: string;
  subject?: string;
  escalated?: boolean;
}

interface SupportApiConfig {
  /** Base URL for the support API */
  baseUrl: string;
  /** API key or token */
  apiKey: string;
  /** Provider type */
  provider: 'intercom' | 'zendesk' | 'generic';
}

/**
 * Create a support system connector
 */
export function createSupportConnector(config: SupportApiConfig): NexusConnector {
  async function fetchTickets(since?: Date): Promise<SupportTicket[]> {
    let url = `${config.baseUrl}/tickets?limit=100`;
    if (since) {
      url += `&updated_after=${since.toISOString()}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Support API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.tickets || data.data || [];
  }

  function ticketsToSignals(
    tickets: SupportTicket[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const ticket of tickets) {
      // Ticket creation signal
      signals.push({
        organization_id: organizationId,
        source_domain: 'cs',
        signal_type: 'ticket_created',
        signal_value: priorityToNumeric(ticket.priority),
        entity_type: 'ticket',
        entity_id: ticket.id,
        client_id: ticket.company_id,
        metadata: {
          status: ticket.status,
          priority: ticket.priority,
          tags: ticket.tags,
          subject: ticket.subject,
          provider: config.provider,
        },
      });

      // Escalation signal
      if (ticket.escalated) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'cs',
          signal_type: 'ticket_escalation',
          signal_value: 1,
          entity_type: 'ticket',
          entity_id: ticket.id,
          client_id: ticket.company_id,
          metadata: {
            priority: ticket.priority,
            subject: ticket.subject,
          },
        });
      }

      // Response time signal (in hours)
      if (ticket.first_response_at && ticket.created_at) {
        const created = new Date(ticket.created_at).getTime();
        const responded = new Date(ticket.first_response_at).getTime();
        const responseHours = (responded - created) / (1000 * 60 * 60);

        signals.push({
          organization_id: organizationId,
          source_domain: 'cs',
          signal_type: 'response_time',
          signal_value: responseHours,
          entity_type: 'ticket',
          entity_id: ticket.id,
          client_id: ticket.company_id,
          metadata: {
            priority: ticket.priority,
          },
        });
      }

      // Satisfaction score signal
      if (
        ticket.satisfaction_rating !== undefined &&
        ticket.satisfaction_rating !== null
      ) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'cs',
          signal_type: 'satisfaction_score',
          signal_value: ticket.satisfaction_rating,
          entity_type: 'ticket',
          entity_id: ticket.id,
          client_id: ticket.company_id,
          metadata: {
            status: ticket.status,
          },
        });
      }

      // Resolution time signal (in hours)
      if (ticket.resolved_at && ticket.created_at) {
        const created = new Date(ticket.created_at).getTime();
        const resolved = new Date(ticket.resolved_at).getTime();
        const resolutionHours = (resolved - created) / (1000 * 60 * 60);

        signals.push({
          organization_id: organizationId,
          source_domain: 'cs',
          signal_type: 'resolution_time',
          signal_value: resolutionHours,
          entity_type: 'ticket',
          entity_id: ticket.id,
          client_id: ticket.company_id,
          metadata: {
            priority: ticket.priority,
          },
        });
      }
    }

    return signals;
  }

  return {
    id: `support_${config.provider}`,
    name: `${config.provider.charAt(0).toUpperCase() + config.provider.slice(1)} Support`,
    domain: 'cs',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();

      try {
        const tickets = await fetchTickets();
        const signals = ticketsToSignals(tickets, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: tickets.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(
          supabase,
          `support_${config.provider}`,
          organizationId,
          result
        );
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
        const tickets = await fetchTickets(since);
        const signals = ticketsToSignals(tickets, organizationId);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: tickets.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(
          supabase,
          `support_${config.provider}`,
          organizationId,
          result
        );
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
  };
}

/**
 * Map priority to numeric value
 */
function priorityToNumeric(priority: string): number {
  const map: Record<string, number> = {
    urgent: 1.0,
    high: 0.75,
    normal: 0.5,
    medium: 0.5,
    low: 0.25,
  };
  return map[priority.toLowerCase()] || 0.5;
}
