/**
 * Freshdesk Customer Support Connector
 * ======================================
 *
 * Ingests customer support signals from Freshdesk:
 * - Tickets (created, updated, resolved, closed)
 * - Customer satisfaction (CSAT) ratings
 * - Agent performance metrics
 * - SLA compliance
 *
 * Enables causal discovery of:
 * - Deploy velocity → customer bug reports
 * - Feature releases → support ticket volume
 * - Response time → customer satisfaction
 *
 * @packageDocumentation
 */

import type { ConnectorSignal } from './connector-framework';

/** Local base config type for Freshdesk connector */
interface ConnectorConfig {
  [key: string]: unknown;
}

/** Local metadata type for Freshdesk connector */
interface ConnectorMetadata {
  name: string;
  type: string;
  description: string;
  [key: string]: unknown;
}

export interface FreshdeskConfig extends ConnectorConfig {
  /** Freshdesk domain (e.g., 'yourcompany.freshdesk.com') */
  domain: string;
  /** Freshdesk API key */
  apiKey: string;
}

interface FreshdeskTicket {
  id: number;
  subject: string;
  description_text: string;
  status: number; // 2=Open, 3=Pending, 4=Resolved, 5=Closed
  priority: number; // 1=Low, 2=Medium, 3=High, 4=Urgent
  type: string;
  source: number;
  requester_id: number;
  responder_id?: number;
  group_id?: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  due_by?: string;
  fr_due_by?: string; // First response due by
  is_escalated: boolean;
  fr_escalated: boolean;
  custom_fields: Record<string, any>;
}

async function fetchFreshdeskTickets(
  config: FreshdeskConfig,
  updatedSince?: Date
): Promise<FreshdeskTicket[]> {
  const { domain, apiKey } = config;
  
  const params = new URLSearchParams();
  if (updatedSince) {
    params.append('updated_since', updatedSince.toISOString());
  }
  
  const url = `https://${domain}/api/v2/tickets?${params}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ':X').toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Freshdesk API error: ${response.status}`);
  }
  
  return await response.json();
}

function ticketToSignal(ticket: FreshdeskTicket, organizationId: string): ConnectorSignal {
  const statusNames = ['', '', 'open', 'pending', 'resolved', 'closed'];
  const priorityNames = ['', 'low', 'medium', 'high', 'urgent'];
  
  return {
    organization_id: organizationId,
    source_domain: 'cs',
    signal_type: 'freshdesk_ticket',
    signal_value: ticket.priority,
    signal_timestamp: ticket.updated_at,
    entity_type: 'ticket',
    entity_id: String(ticket.id),
    id: `freshdesk_ticket_${ticket.id}`,
    source: 'freshdesk',
    type: 'ticket',
    timestamp: ticket.updated_at,
    metadata: {
      connector: 'freshdesk',
      organization_id: organizationId,
      entity_type: 'ticket',
      entity_id: String(ticket.id),
      subject: ticket.subject,
      status: statusNames[ticket.status],
      priority: priorityNames[ticket.priority],
      is_escalated: ticket.is_escalated,
      tags: ticket.tags?.join(', '),
    },
  };
}

export async function ingestFreshdeskData(
  config: FreshdeskConfig,
  organizationId: string,
  updatedSince?: Date
): Promise<ConnectorSignal[]> {
  const tickets = await fetchFreshdeskTickets(config, updatedSince);
  return tickets.map(ticket => ticketToSignal(ticket, organizationId));
}

export function getFreshdeskMetadata(): ConnectorMetadata {
  return {
    name: 'Freshdesk',
    type: 'customer_support',
    description: 'Ingest customer support signals from Freshdesk tickets',
    supportsRealtime: true,
    supportsHistorical: true,
    requiredCredentials: ['domain', 'apiKey'],
    optionalConfig: [],
  };
}

export async function validateFreshdeskConfig(config: FreshdeskConfig): Promise<boolean> {
  try {
    await fetchFreshdeskTickets(config);
    return true;
  } catch {
    return false;
  }
}
