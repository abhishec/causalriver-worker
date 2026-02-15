/**
 * Freshdesk Connector
 * ===================
 * Ingests support tickets, conversations, and customer interactions.
 * Freshdesk uses API key authentication (not OAuth).
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface FreshdeskCredentials {
  apiKey: string;
  domain: string; // e.g., "company.freshdesk.com"
}

interface FreshdeskTicket {
  id: number;
  subject: string;
  description: string;
  description_text: string;
  status: number;
  priority: number;
  type: string;
  source: number;
  requester_id: number;
  responder_id: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  custom_fields: Record<string, any>;
}

export class FreshdeskConnector extends ConnectorBase {
  readonly connectorType = 'freshdesk';

  constructor(
    organizationId: string,
    private freshdeskCreds: FreshdeskCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, freshdeskCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerMinute: 100, // Freshdesk API limit (varies by plan)
      backoffMultiplier: 2,
      maxRetries: 3,
      initialBackoffMs: 1000,
    };
  }

  /**
   * Initial load: Fetch all tickets
   */
  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[Freshdesk] Starting initial load...');
    let totalTickets = 0;
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        // Fetch tickets page by page
        const tickets = await this.rateLimiter.throttle(() =>
          this.fetchTickets(page, perPage)
        );

        if (!tickets || tickets.length === 0) {
          break;
        }

        console.log(`[Freshdesk] Processing page ${page} (${tickets.length} tickets)`);

        // Process each ticket
        for (const ticket of tickets) {
          await this.ingestTicket(ticket);

          // Fetch conversations for this ticket
          await this.ingestTicketConversations(ticket.id);

          totalTickets++;
        }

        // Save checkpoint every 1000 tickets
        if (totalTickets % 1000 === 0) {
          await this.saveCheckpoint({
            lastTicketId: tickets[tickets.length - 1].id,
            ticketsProcessed: totalTickets,
            lastPage: page,
          });
        }

        page++;

        // Freshdesk returns empty array when no more pages
        if (tickets.length < perPage) {
          break;
        }
      }

      console.log(`[Freshdesk] Initial load complete: ${totalTickets} tickets`);
      return { success: true, signalsIngested: totalTickets };
    } catch (error: any) {
      console.error('[Freshdesk] Initial load failed:', error);
      return { success: false, signalsIngested: totalTickets, errors: [error.message] };
    }
  }

  /**
   * Incremental sync: Only tickets updated since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[Freshdesk] Starting incremental sync...');
    let totalTickets = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );

      const lastSyncTime = checkpoint?.updated_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch updated tickets
      const tickets = await this.rateLimiter.throttle(() =>
        this.fetchUpdatedTickets(lastSyncTime)
      );

      for (const ticket of tickets) {
        await this.ingestTicket(ticket);
        await this.ingestTicketConversations(ticket.id);
        totalTickets++;
      }

      console.log(`[Freshdesk] Incremental sync complete: ${totalTickets} updated tickets`);
      return { success: true, signalsIngested: totalTickets };
    } catch (error: any) {
      console.error('[Freshdesk] Incremental sync failed:', error);
      return { success: false, signalsIngested: totalTickets, errors: [error.message] };
    }
  }

  /**
   * Resume from checkpoint
   */
  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[Freshdesk] Resuming from checkpoint:', checkpoint.state);

    const lastPage = checkpoint.state.lastPage || 1;
    let totalTickets = checkpoint.state.ticketsProcessed || 0;
    let page = lastPage + 1;
    const perPage = 100;

    while (true) {
      const tickets = await this.rateLimiter.throttle(() =>
        this.fetchTickets(page, perPage)
      );

      if (!tickets || tickets.length === 0) {
        break;
      }

      for (const ticket of tickets) {
        await this.ingestTicket(ticket);
        await this.ingestTicketConversations(ticket.id);
        totalTickets++;
      }

      await this.saveCheckpoint({
        lastTicketId: tickets[tickets.length - 1].id,
        ticketsProcessed: totalTickets,
        lastPage: page,
      });

      page++;

      if (tickets.length < perPage) {
        break;
      }
    }

    return { success: true, signalsIngested: totalTickets };
  }

  /**
   * Fetch tickets (paginated)
   */
  private async fetchTickets(page: number, perPage: number): Promise<FreshdeskTicket[]> {
    return this.freshdeskFetch(`/api/v2/tickets?page=${page}&per_page=${perPage}&include=description`);
  }

  /**
   * Fetch tickets updated since timestamp
   */
  private async fetchUpdatedTickets(since: string): Promise<FreshdeskTicket[]> {
    // Freshdesk format: "2024-01-01T00:00:00Z"
    return this.freshdeskFetch(`/api/v2/tickets?updated_since=${since}&include=description`);
  }

  /**
   * Ingest single ticket
   */
  private async ingestTicket(ticket: FreshdeskTicket): Promise<void> {
    const signal: Signal = {
      source: 'freshdesk',
      type: 'ticket',
      content: `${ticket.subject}\n\n${ticket.description_text || ticket.description}`,
      metadata: {
        ticket_id: ticket.id,
        status: this.getStatusName(ticket.status),
        priority: this.getPriorityName(ticket.priority),
        type: ticket.type,
        tags: ticket.tags,
        requester_id: ticket.requester_id,
        responder_id: ticket.responder_id,
      },
      organization_id: this.organizationId,
      timestamp: ticket.updated_at,
    };

    await this.streamProcessor.addSignal(signal);
  }

  /**
   * Ingest ticket conversations
   */
  private async ingestTicketConversations(ticketId: number): Promise<void> {
    try {
      const conversations = await this.rateLimiter.throttle(() =>
        this.freshdeskFetch(`/api/v2/tickets/${ticketId}/conversations`)
      );

      for (const conv of conversations) {
        const signal: Signal = {
          source: 'freshdesk',
          type: 'conversation',
          content: conv.body_text || conv.body || '',
          metadata: {
            ticket_id: ticketId,
            conversation_id: conv.id,
            user_id: conv.user_id,
            is_private: conv.private,
          },
          organization_id: this.organizationId,
          timestamp: conv.created_at,
        };

        await this.streamProcessor.addSignal(signal);
      }
    } catch (error) {
      // Conversations might not exist or be accessible
      console.warn(`[Freshdesk] Failed to fetch conversations for ticket ${ticketId}`);
    }
  }

  /**
   * Freshdesk API fetch helper
   */
  private async freshdeskFetch(endpoint: string): Promise<any> {
    const url = `https://${this.freshdeskCreds.domain}${endpoint}`;

    const auth = Buffer.from(`${this.freshdeskCreds.apiKey}:X`).toString('base64');

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Freshdesk API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Map status code to name
   */
  private getStatusName(status: number): string {
    const statusMap: Record<number, string> = {
      2: 'Open',
      3: 'Pending',
      4: 'Resolved',
      5: 'Closed',
      6: 'Waiting on Customer',
      7: 'Waiting on Third Party',
    };
    return statusMap[status] || 'Unknown';
  }

  /**
   * Map priority code to name
   */
  private getPriorityName(priority: number): string {
    const priorityMap: Record<number, string> = {
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Urgent',
    };
    return priorityMap[priority] || 'Unknown';
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use ingestTicket');
  }
}
