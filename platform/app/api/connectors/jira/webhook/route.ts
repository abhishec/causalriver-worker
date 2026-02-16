/**
 * Jira Webhook Handler — Real-Time Issue Event Processing
 * ========================================================
 *
 * Receives Jira webhook events and converts them to Brain signals.
 *
 * Supported Events:
 * - jira:issue_created → ticket_created signal
 * - jira:issue_updated → ticket_updated signal (with status transitions)
 * - jira:issue_deleted → ticket_deleted signal
 * - comment_created → ticket_comment signal
 * - sprint_started / sprint_closed → sprint lifecycle signals
 *
 * Setup:
 *   1. Go to Jira Settings → System → Webhooks
 *   2. URL: https://platform.usebrainos.com/api/connectors/jira/webhook
 *   3. Select events: Issue created/updated/deleted, Sprint started/closed
 *   4. Optionally add shared secret for HMAC verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // ── Step 1: Verify webhook authenticity ─────────────────────────
    // Jira Cloud webhooks can use a shared secret
    const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;

    if (webhookSecret) {
      // If secret is configured, verify the request
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${webhookSecret}`) {
        console.error('[Jira Webhook] Invalid authorization');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const webhookEvent = payload.webhookEvent || payload.issue_event_type_name || '';

    console.log(`[Jira Webhook] Received event: ${webhookEvent}`);

    // ── Step 2: Resolve organization ────────────────────────────────
    const service = await createServiceClient();

    // Extract Jira instance info for org matching
    const issue = payload.issue;
    const issueUrl = issue?.self || '';
    // Extract base URL from issue self link: https://xyz.atlassian.net/rest/api/3/issue/123
    const jiraInstanceMatch = issueUrl.match(/https?:\/\/([^/]+)/);
    const jiraInstance = jiraInstanceMatch?.[1] || '';

    // Find org by Jira instance URL in connector config
    const { data: connectors } = await service
      .from('org_connectors')
      .select('organization_id, config, credentials')
      .eq('connector_type', 'jira')
      .eq('status', 'active')
      .limit(50);

    const matchedConnector = connectors?.find((c: any) => {
      const siteUrl = c.config?.site_url || c.config?.cloud_id || '';
      return siteUrl.includes(jiraInstance) || jiraInstance.includes(siteUrl);
    });

    if (!matchedConnector) {
      console.warn(`[Jira Webhook] No org found for Jira instance: ${jiraInstance}`);
      return NextResponse.json({ ok: true });
    }

    const orgId = matchedConnector.organization_id;

    // ── Step 3: Convert events to Brain signals ─────────────────────
    const signals: Array<Record<string, unknown>> = [];

    if (webhookEvent.startsWith('jira:issue_') && issue) {
      const fields = issue.fields || {};
      const isResolved = !!fields.resolutiondate;
      const cycleTimeHours = isResolved && fields.created
        ? (new Date(fields.resolutiondate).getTime() - new Date(fields.created).getTime()) / 3600000
        : null;

      const changelog = payload.changelog;
      const statusTransition = changelog?.items?.find((item: any) => item.field === 'status');

      let signalType = 'ticket_updated';
      if (webhookEvent === 'jira:issue_created') {
        signalType = 'ticket_created';
      } else if (webhookEvent === 'jira:issue_deleted') {
        signalType = 'ticket_deleted';
      } else if (isResolved) {
        signalType = 'ticket_resolved';
      }

      signals.push({
        organization_id: orgId,
        source_domain: 'product.jira',
        signal_type: signalType,
        signal_value: cycleTimeHours || 1,
        entity_type: 'jira_issue',
        entity_id: issue.key,
        signal_metadata: {
          issue_key: issue.key,
          project_key: fields.project?.key,
          summary: fields.summary,
          status: fields.status?.name,
          status_category: fields.status?.statusCategory?.name,
          issue_type: fields.issuetype?.name,
          priority: fields.priority?.name,
          assignee: fields.assignee?.displayName || null,
          reporter: fields.reporter?.displayName || null,
          cycle_time_hours: cycleTimeHours,
          story_points: fields.customfield_10016 || null,
          sprint: fields.sprint?.name || null,
          webhook_event: webhookEvent,
          status_from: statusTransition?.fromString || null,
          status_to: statusTransition?.toString || null,
          webhook_source: true,
        },
        created_at: fields.updated || fields.created || new Date().toISOString(),
      });

      // If there was a status transition, emit a separate transition signal
      if (statusTransition) {
        signals.push({
          organization_id: orgId,
          source_domain: 'product.jira',
          signal_type: 'status_transition',
          signal_value: 1,
          entity_type: 'jira_issue',
          entity_id: issue.key,
          signal_metadata: {
            issue_key: issue.key,
            from_status: statusTransition.fromString,
            to_status: statusTransition.toString,
            assignee: fields.assignee?.displayName || null,
            webhook_source: true,
          },
        });
      }
    }

    // Sprint events
    if (webhookEvent === 'sprint_started' || webhookEvent === 'sprint_closed') {
      const sprint = payload.sprint;
      if (sprint) {
        signals.push({
          organization_id: orgId,
          source_domain: 'product.jira',
          signal_type: webhookEvent === 'sprint_started' ? 'sprint_started' : 'sprint_completed',
          signal_value: sprint.completeDate
            ? (new Date(sprint.completeDate).getTime() - new Date(sprint.startDate).getTime()) / 86400000 // days
            : 1,
          entity_type: 'jira_sprint',
          entity_id: sprint.name || `sprint_${sprint.id}`,
          signal_metadata: {
            sprint_id: sprint.id,
            sprint_name: sprint.name,
            start_date: sprint.startDate,
            end_date: sprint.endDate,
            complete_date: sprint.completeDate,
            goal: sprint.goal,
            webhook_source: true,
          },
        });
      }
    }

    // Comment events
    if (webhookEvent === 'comment_created' && payload.comment) {
      const comment = payload.comment;
      signals.push({
        organization_id: orgId,
        source_domain: 'product.jira',
        signal_type: 'ticket_comment',
        signal_value: 1,
        entity_type: 'jira_issue',
        entity_id: issue?.key || 'unknown',
        signal_metadata: {
          issue_key: issue?.key,
          author: comment.author?.displayName,
          body_length: comment.body?.length || 0,
          webhook_source: true,
        },
      });
    }

    // ── Step 4: Insert signals to Brain ─────────────────────────────
    if (signals.length > 0) {
      const { error: insertError } = await service
        .from('cross_domain_signals')
        .insert(signals);

      if (insertError) {
        console.warn('[Jira Webhook] Signal insert error:', insertError.message);
      }
    }

    return NextResponse.json({ ok: true, signals: signals.length });
  } catch (error: any) {
    console.error('[Jira Webhook] Error:', error.message);
    return NextResponse.json({ ok: true, error: error.message });
  }
}
