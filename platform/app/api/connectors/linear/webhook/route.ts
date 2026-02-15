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
    // 1. Verify Linear webhook signature (if configured)
    const signature = req.headers.get('linear-signature');
    const body = await req.text();

    // TODO: Implement signature verification when Linear provides signing secret
    // For now, Linear webhooks don't support signatures, rely on HTTPS + secret URL

    // 2. Parse webhook payload
    const event: LinearWebhookEvent = JSON.parse(body);

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Convert event to signal
    const signal = await convertLinearEventToSignal(event, organizationId);

    // 6. Ingest signal into brain
    if (signal) {
      const { error } = await supabase.from('connector_signals').insert({
        organization_id: organizationId,
        source: 'linear',
        signal_type: event.type.toLowerCase(),
        data: signal.data,
        metadata: signal.metadata,
        timestamp: event.createdAt,
      });

      if (error) {
        logger.error('Failed to ingest Linear signal', { error });
        return NextResponse.json({ error: 'Failed to ingest signal' }, { status: 500 });
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

    // 8. Return success
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
