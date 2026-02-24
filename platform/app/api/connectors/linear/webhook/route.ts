export const dynamic = "force-dynamic";
/**
 * Linear Webhook Handler
 * =======================
 *
 * Receives real-time events from Linear:
 * - Issue created/updated/deleted
 * - Status changes
 * - Priority changes
 * - Assignment changes
 * - Project updates
 * - Cycle (sprint) updates
 *
 * Converts events to signals and ingests into brain for causal discovery.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@nexus-ai/memory-stack';
import { maybeTriggerBrainCycle } from '@/lib/brain-trigger';

const logger = createLogger({ level: 'info' });

// ============================================================================
// TYPES
// ============================================================================

interface LinearWebhookEvent {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Project' | 'Cycle' | 'Comment';
  createdAt: string;
  data: any;
  url: string;
  webhookId: string;
  webhookTimestamp: number;
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Linear webhook — URL secret + optional signature
    const urlSecret = req.nextUrl.searchParams.get('secret');
    const configuredSecret = process.env.LINEAR_WEBHOOK_SECRET;
    if (configuredSecret && urlSecret !== configuredSecret) {
      logger.warn('Linear webhook: invalid URL secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signature = req.headers.get('linear-signature');
    const body = await req.text();

    // Verify HMAC signature if signing secret is configured
    if (process.env.LINEAR_SIGNING_SECRET && signature) {
      const { createHmac } = await import('crypto');
      const expected = createHmac('sha256', process.env.LINEAR_SIGNING_SECRET)
        .update(body)
        .digest('hex');
      if (signature !== expected) {
        logger.warn('Linear webhook: invalid HMAC signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 2. Parse webhook payload
    let event: LinearWebhookEvent;
    try {
      event = JSON.parse(body);
    } catch {
      logger.warn('Linear webhook: malformed JSON payload');
      return NextResponse.json({ ok: true }); // Ack to prevent retries
    }

    logger.info('Received Linear webhook', {
      type: event.type,
      action: event.action,
      webhookId: event.webhookId,
    });

    // 3. Get organization ID from webhook registration
    // In production, this would be stored when the webhook is created
    // For now, extract from URL params or default to environment
    const searchParams = req.nextUrl.searchParams;
    const organizationId = searchParams.get('org') || process.env.DEFAULT_ORG_ID || 'core';

    // 4. Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      logger.error('[Linear Webhook] Missing SUPABASE env vars — cannot persist signal');
      return NextResponse.json({ ok: true }); // ack webhook, don't retry
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Convert event to signal
    const signal = await convertLinearEventToSignal(event, organizationId);

    // 6. Ingest signal into brain via cross_domain_signals (canonical table)
    if (signal) {
      const crossDomainSignal = mapLinearToCrossDomainSignal(event, signal, organizationId);
      if (crossDomainSignal) {
        const { error: cdsError } = await supabase
          .from('cross_domain_signals')
          .insert(crossDomainSignal);
        if (cdsError) {
          logger.error('Failed to ingest Linear signal to cross_domain_signals', { error: cdsError });
        }
      }

      // 7. Record webhook activity
      await supabase.from('agent_activity_log').insert({
        organization_id: organizationId,
        agent_name: 'linear-webhook',
        activity_type: 'webhook_received',
        description: `${event.action} ${event.type}: ${signal.data.title || signal.data.name}`,
        metadata: {
          webhook_id: event.webhookId,
          event_type: event.type,
          action: event.action,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info('Linear signal ingested successfully', {
        type: event.type,
        action: event.action,
        signalId: signal.id,
      });
    }

    // 8. Auto-trigger brain cycle if enough signals accumulated
    if (signal) {
      maybeTriggerBrainCycle(organizationId, supabase).catch(() => {});
    }

    // 9. Return success
    return NextResponse.json({ success: true, signal: signal?.id });
  } catch (error) {
    logger.error('Linear webhook handler error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Linear webhook event to connector signal
 */
async function convertLinearEventToSignal(
  event: LinearWebhookEvent,
  organizationId: string
): Promise<{ id: string; data: any; metadata: any } | null> {
  const timestamp = event.createdAt;

  switch (event.type) {
    case 'Issue':
      return convertIssueEvent(event, organizationId, timestamp);

    case 'Project':
      return convertProjectEvent(event, organizationId, timestamp);

    case 'Cycle':
      return convertCycleEvent(event, organizationId, timestamp);

    case 'Comment':
      // Skip comments for now (can add later if needed)
      return null;

    default:
      logger.warn('Unknown Linear event type', { type: event.type });
      return null;
  }
}

/**
 * Convert Issue event to signal
 */
function convertIssueEvent(
  event: LinearWebhookEvent,
  organizationId: string,
  timestamp: string
) {
  const issue = event.data;

  return {
    id: `linear_issue_${issue.id}_${event.action}_${Date.now()}`,
    data: {
      issue_id: issue.id,
      issue_key: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: getPriorityName(issue.priority),
      priority_number: issue.priority,
      status: issue.state?.name,
      status_type: issue.state?.type,
      assignee_id: issue.assignee?.id,
      assignee_name: issue.assignee?.name,
      assignee_email: issue.assignee?.email,
      team_id: issue.team?.id,
      team_name: issue.team?.name,
      team_key: issue.team?.key,
      project_id: issue.project?.id,
      project_name: issue.project?.name,
      cycle_id: issue.cycle?.id,
      cycle_name: issue.cycle?.name,
      labels: issue.labels?.map((l: any) => l.name).join(', '),
      estimate: issue.estimate,
      action: event.action,
      updated_at: timestamp,
    },
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'issue',
      entity_id: issue.id,
      webhook_event: event.action,
    },
  };
}

/**
 * Convert Project event to signal
 */
function convertProjectEvent(
  event: LinearWebhookEvent,
  organizationId: string,
  timestamp: string
) {
  const project = event.data;

  return {
    id: `linear_project_${project.id}_${event.action}_${Date.now()}`,
    data: {
      project_id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      priority: project.priority,
      progress: project.progress,
      target_date: project.targetDate,
      action: event.action,
      updated_at: timestamp,
    },
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'project',
      entity_id: project.id,
      webhook_event: event.action,
    },
  };
}

/**
 * Convert Cycle event to signal
 */
function convertCycleEvent(
  event: LinearWebhookEvent,
  organizationId: string,
  timestamp: string
) {
  const cycle = event.data;

  return {
    id: `linear_cycle_${cycle.id}_${event.action}_${Date.now()}`,
    data: {
      cycle_id: cycle.id,
      cycle_number: cycle.number,
      name: cycle.name,
      starts_at: cycle.startsAt,
      ends_at: cycle.endsAt,
      completed_at: cycle.completedAt,
      progress: cycle.progress,
      completed_issues: cycle.completedIssueCount,
      total_issues: cycle.issueCount,
      action: event.action,
      updated_at: timestamp,
    },
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'cycle',
      entity_id: cycle.id,
      webhook_event: event.action,
    },
  };
}

/**
 * Get priority name from number
 */
function getPriorityName(priority: number): string {
  switch (priority) {
    case 0:
      return 'none';
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'unknown';
  }
}

/**
 * Map Linear event to cross_domain_signals format for Brain causal discovery
 */
function mapLinearToCrossDomainSignal(
  event: LinearWebhookEvent,
  signal: { data: any; metadata: any },
  organizationId: string
): Record<string, unknown> | null {
  const eventTime = event.createdAt || new Date().toISOString();

  if (event.type === 'Issue') {
    const statusType = signal.data.status_type;
    // Map status changes to meaningful signals
    if (event.action === 'create') {
      return {
        organization_id: organizationId,
        source_domain: 'product',
        signal_type: 'ticket_created',
        signal_value: signal.data.estimate || 1,
        entity_type: 'linear_issue',
        entity_id: signal.data.issue_key || signal.data.issue_id,
        signal_metadata: {
          source: 'linear',
          title: signal.data.title,
          priority: signal.data.priority,
          team: signal.data.team_name,
          assignee: signal.data.assignee_name,
          estimate: signal.data.estimate,
        },
        created_at: eventTime,
        signal_timestamp: eventTime,
      };
    }
    if (statusType === 'completed' || statusType === 'done') {
      return {
        organization_id: organizationId,
        source_domain: 'product',
        signal_type: 'ticket_resolved',
        signal_value: signal.data.estimate || 1,
        entity_type: 'linear_issue',
        entity_id: signal.data.issue_key || signal.data.issue_id,
        signal_metadata: {
          source: 'linear',
          title: signal.data.title,
          priority: signal.data.priority,
          team: signal.data.team_name,
          assignee: signal.data.assignee_name,
        },
        created_at: eventTime,
        signal_timestamp: eventTime,
      };
    }
    if (statusType === 'started' || statusType === 'inProgress') {
      return {
        organization_id: organizationId,
        source_domain: 'product',
        signal_type: 'ticket_in_progress',
        signal_value: signal.data.estimate || 1,
        entity_type: 'linear_issue',
        entity_id: signal.data.issue_key || signal.data.issue_id,
        signal_metadata: {
          source: 'linear',
          title: signal.data.title,
          priority: signal.data.priority,
          team: signal.data.team_name,
          assignee: signal.data.assignee_name,
        },
        created_at: eventTime,
        signal_timestamp: eventTime,
      };
    }
  }

  if (event.type === 'Cycle') {
    return {
      organization_id: organizationId,
      source_domain: 'product',
      signal_type: event.action === 'create' ? 'sprint_started' : 'sprint_updated',
      signal_value: signal.data.progress || 0,
      entity_type: 'linear_cycle',
      entity_id: signal.data.cycle_id,
      signal_metadata: {
        source: 'linear',
        name: signal.data.name,
        progress: signal.data.progress,
        completed_issues: signal.data.completed_issues,
        total_issues: signal.data.total_issues,
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  return null;
}
