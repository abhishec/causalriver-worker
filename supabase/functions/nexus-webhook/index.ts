/**
 * Nexus Webhook Edge Function
 *
 * Webhook receiver for real-time signal ingestion from external sources.
 * Routes incoming webhooks to the appropriate connector's signal transformer
 * and stores the resulting signals.
 *
 * 10M SCALE: Webhook-first ingestion eliminates API polling bottlenecks.
 * Instead of Slack polling at 50 req/sec (5.5h for 10M messages),
 * webhooks deliver signals in real-time (~100ms per event).
 *
 * Routes:
 *   POST /nexus-webhook?source=hubspot&org=<orgId>
 *   POST /nexus-webhook?source=stripe&org=<orgId>
 *   POST /nexus-webhook?source=intercom&org=<orgId>
 *   POST /nexus-webhook?source=slack&org=<orgId>
 *   POST /nexus-webhook?source=github&org=<orgId>
 *   POST /nexus-webhook?source=jira&org=<orgId>
 *   POST /nexus-webhook?source=xero&org=<orgId>
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookSignal {
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  entity_type: string;
  entity_id: string;
  client_id?: string;
  metadata: Record<string, unknown>;
}

/**
 * Transform Stripe webhook events into signals
 */
function transformStripeEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const obj = payload?.data?.object;
  if (!obj) return signals;

  switch (payload.type) {
    case 'charge.succeeded':
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'payment_success',
        signal_value: (obj.amount || 0) / 100,
        entity_type: 'charge',
        entity_id: obj.id,
        client_id: obj.customer,
        metadata: { currency: obj.currency, status: obj.status },
      });
      break;

    case 'charge.failed':
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'payment_failed',
        signal_value: (obj.amount || 0) / 100,
        entity_type: 'charge',
        entity_id: obj.id,
        client_id: obj.customer,
        metadata: { failure_code: obj.failure_code, failure_message: obj.failure_message },
      });
      break;

    case 'customer.subscription.updated':
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'subscription_mrr',
        signal_value: (obj.items?.data?.[0]?.price?.unit_amount || 0) / 100,
        entity_type: 'subscription',
        entity_id: obj.id,
        client_id: obj.customer,
        metadata: { status: obj.status, cancel_at_period_end: obj.cancel_at_period_end },
      });

      if (obj.cancel_at_period_end || obj.status === 'past_due') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'finance',
          signal_type: 'churn_risk',
          signal_value: obj.status === 'past_due' ? 0.8 : 0.6,
          entity_type: 'subscription',
          entity_id: obj.id,
          client_id: obj.customer,
          metadata: { status: obj.status },
        });
      }
      break;

    case 'charge.refunded':
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'refund',
        signal_value: (obj.amount_refunded || 0) / 100,
        entity_type: 'charge',
        entity_id: obj.id,
        client_id: obj.customer,
        metadata: { reason: obj.refunds?.data?.[0]?.reason },
      });
      break;
  }

  return signals;
}

/**
 * Transform HubSpot webhook events into signals
 */
function transformHubSpotEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];

  // HubSpot sends arrays of subscription events
  const events = Array.isArray(payload) ? payload : [payload];

  for (const event of events) {
    const objectType = event.subscriptionType?.split('.')[0]; // 'deal', 'contact', etc.
    const changeType = event.subscriptionType?.split('.')[1]; // 'propertyChange', 'creation', etc.

    if (objectType === 'deal') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'revenue',
        signal_type: `deal_${changeType || 'update'}`,
        signal_value: 1,
        entity_type: 'deal',
        entity_id: String(event.objectId || ''),
        metadata: {
          propertyName: event.propertyName,
          propertyValue: event.propertyValue,
          changeSource: event.changeSource,
        },
      });
    }

    if (objectType === 'contact') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'cs',
        signal_type: `contact_${changeType || 'update'}`,
        signal_value: 1,
        entity_type: 'contact',
        entity_id: String(event.objectId || ''),
        metadata: {
          propertyName: event.propertyName,
          propertyValue: event.propertyValue,
        },
      });
    }
  }

  return signals;
}

/**
 * Transform Slack Events API webhook events into signals.
 *
 * Handles:
 *   - message (new message or thread reply)
 *   - reaction_added (emoji reaction)
 *   - app_mention (@mention of the bot)
 *
 * Slack Events API payload shape:
 *   { type: "event_callback", event: { type, channel, user, text, ts, ... } }
 */
function transformSlackEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const event = payload?.event;
  if (!event) return signals;

  switch (event.type) {
    case 'message':
      // Skip subtypes (bot messages, edits, deletes, etc.)
      if (!event.subtype) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'communication',
          signal_type: event.thread_ts ? 'thread_reply' : 'message_sent',
          signal_value: 1,
          entity_type: 'slack_message',
          entity_id: `${event.channel}_${event.ts}`,
          metadata: {
            channel: event.channel,
            user: event.user,
            text: (event.text || '').substring(0, 500),
            thread_ts: event.thread_ts,
          },
        });
      }
      break;

    case 'reaction_added':
      signals.push({
        organization_id: organizationId,
        source_domain: 'communication',
        signal_type: 'reaction_added',
        signal_value: 1,
        entity_type: 'slack_reaction',
        entity_id: `${event.item?.channel}_${event.item?.ts}_${event.reaction}`,
        metadata: {
          user: event.user,
          reaction: event.reaction,
          channel: event.item?.channel,
        },
      });
      break;

    case 'app_mention':
      signals.push({
        organization_id: organizationId,
        source_domain: 'communication',
        signal_type: 'mention_received',
        signal_value: 1,
        entity_type: 'slack_mention',
        entity_id: `${event.channel}_${event.ts}`,
        metadata: {
          channel: event.channel,
          user: event.user,
          text: (event.text || '').substring(0, 500),
        },
      });
      break;
  }

  return signals;
}

/**
 * Transform Intercom/support webhook events into signals
 */
function transformSupportEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const topic = payload.topic;
  const data = payload.data?.item || payload.data;

  if (!data) return signals;

  switch (topic) {
    case 'conversation.created':
    case 'ticket.created':
      signals.push({
        organization_id: organizationId,
        source_domain: 'cs',
        signal_type: 'ticket_created',
        signal_value: 1,
        entity_type: 'ticket',
        entity_id: data.id || '',
        client_id: data.contacts?.contacts?.[0]?.id,
        metadata: { priority: data.priority, state: data.state },
      });
      break;

    case 'conversation.rating.added':
      const rating = data.rating?.rating;
      signals.push({
        organization_id: organizationId,
        source_domain: 'cs',
        signal_type: 'satisfaction_score',
        signal_value: rating === 'happy' ? 1 : rating === 'sad' ? 0 : 0.5,
        entity_type: 'ticket',
        entity_id: data.conversation_id || data.id || '',
        metadata: { rating, remark: data.rating?.remark },
      });
      break;

    case 'ticket.state.updated':
      if (data.state === 'resolved' || data.state === 'closed') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'cs',
          signal_type: 'ticket_resolved',
          signal_value: 1,
          entity_type: 'ticket',
          entity_id: data.id || '',
          metadata: { state: data.state },
        });
      }
      break;
  }

  return signals;
}

/**
 * Transform GitHub webhook events into signals.
 *
 * 10M SCALE: Replaces polling at 1.4 req/sec (60h for 100K PRs).
 * With webhooks, each PR/issue/deploy event arrives in real-time.
 *
 * Handles:
 *   - pull_request (opened, merged, closed)
 *   - pull_request_review (submitted)
 *   - push (commit volume)
 *   - issues (opened, closed)
 *   - workflow_run (CI pass/fail)
 *   - deployment_status (deploy success/failure)
 */
function transformGitHubEvent(payload: any, organizationId: string, headers: Headers): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const ghEvent = headers.get('x-github-event') || '';

  switch (ghEvent) {
    case 'pull_request': {
      const pr = payload.pull_request;
      if (!pr) break;
      const action = payload.action; // opened, closed, merged, etc.

      if (action === 'opened' || action === 'reopened') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: 'pr_opened',
          signal_value: 1,
          entity_type: 'pull_request',
          entity_id: `${payload.repository?.full_name}#${pr.number}`,
          metadata: {
            title: (pr.title || '').substring(0, 200),
            author: pr.user?.login,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            repo: payload.repository?.full_name,
          },
        });
      }

      if (action === 'closed' && pr.merged) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: 'pr_merged',
          signal_value: 1,
          entity_type: 'pull_request',
          entity_id: `${payload.repository?.full_name}#${pr.number}`,
          metadata: {
            title: (pr.title || '').substring(0, 200),
            author: pr.user?.login,
            merged_by: pr.merged_by?.login,
            additions: pr.additions,
            deletions: pr.deletions,
            repo: payload.repository?.full_name,
          },
        });
      }

      if (action === 'closed' && !pr.merged) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: 'pr_abandoned',
          signal_value: -0.5,
          entity_type: 'pull_request',
          entity_id: `${payload.repository?.full_name}#${pr.number}`,
          metadata: { title: (pr.title || '').substring(0, 200), repo: payload.repository?.full_name },
        });
      }
      break;
    }

    case 'pull_request_review': {
      const review = payload.review;
      if (review && payload.action === 'submitted') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: 'pr_review_submitted',
          signal_value: review.state === 'approved' ? 1 : review.state === 'changes_requested' ? -0.3 : 0.5,
          entity_type: 'pull_request_review',
          entity_id: `${payload.repository?.full_name}#${payload.pull_request?.number}_review_${review.id}`,
          metadata: {
            state: review.state,
            reviewer: review.user?.login,
            repo: payload.repository?.full_name,
          },
        });
      }
      break;
    }

    case 'issues': {
      const issue = payload.issue;
      if (!issue) break;
      const isBug = (issue.labels || []).some((l: any) => l.name?.toLowerCase().includes('bug'));

      if (payload.action === 'opened') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: isBug ? 'bug_opened' : 'issue_opened',
          signal_value: isBug ? -0.5 : 0.3,
          entity_type: 'issue',
          entity_id: `${payload.repository?.full_name}#${issue.number}`,
          metadata: {
            title: (issue.title || '').substring(0, 200),
            author: issue.user?.login,
            labels: (issue.labels || []).map((l: any) => l.name),
            repo: payload.repository?.full_name,
          },
        });
      }

      if (payload.action === 'closed') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: isBug ? 'bug_closed' : 'issue_closed',
          signal_value: isBug ? 0.5 : 0.3,
          entity_type: 'issue',
          entity_id: `${payload.repository?.full_name}#${issue.number}`,
          metadata: {
            title: (issue.title || '').substring(0, 200),
            repo: payload.repository?.full_name,
          },
        });
      }
      break;
    }

    case 'workflow_run': {
      const run = payload.workflow_run;
      if (run && payload.action === 'completed') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering.github',
          signal_type: run.conclusion === 'success' ? 'ci_passed' : 'ci_failed',
          signal_value: run.conclusion === 'success' ? 0.3 : -0.5,
          entity_type: 'workflow_run',
          entity_id: `${payload.repository?.full_name}_run_${run.id}`,
          metadata: {
            workflow: run.name,
            conclusion: run.conclusion,
            branch: run.head_branch,
            repo: payload.repository?.full_name,
          },
        });
      }
      break;
    }

    case 'deployment_status': {
      const ds = payload.deployment_status;
      const dep = payload.deployment;
      if (ds) {
        const isSuccess = ds.state === 'success';
        const isFailure = ds.state === 'failure' || ds.state === 'error';
        if (isSuccess || isFailure) {
          signals.push({
            organization_id: organizationId,
            source_domain: 'engineering.github',
            signal_type: isSuccess ? 'deploy_success' : 'deploy_failure',
            signal_value: isSuccess ? 0.8 : -0.8,
            entity_type: 'deployment',
            entity_id: `${payload.repository?.full_name}_deploy_${dep?.id || ds.id}`,
            metadata: {
              environment: dep?.environment || ds.environment,
              state: ds.state,
              repo: payload.repository?.full_name,
            },
          });
        }
      }
      break;
    }
  }

  return signals;
}

/**
 * Transform Jira webhook events into signals.
 *
 * 10M SCALE: Replaces polling at 10 req/sec.
 * Jira Cloud webhooks deliver events in real-time.
 *
 * Handles:
 *   - jira:issue_created
 *   - jira:issue_updated (status transitions, assignments)
 *   - sprint_closed / sprint_started
 */
function transformJiraEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const webhookEvent = payload.webhookEvent || '';
  const issue = payload.issue;

  if (webhookEvent === 'jira:issue_created' && issue) {
    const isBug = issue.fields?.issuetype?.name?.toLowerCase() === 'bug';
    signals.push({
      organization_id: organizationId,
      source_domain: 'project_management',
      signal_type: isBug ? 'bug_opened' : 'issue_created',
      signal_value: isBug ? -0.5 : 0.3,
      entity_type: 'jira_issue',
      entity_id: issue.key || issue.id,
      metadata: {
        summary: (issue.fields?.summary || '').substring(0, 200),
        issueType: issue.fields?.issuetype?.name,
        priority: issue.fields?.priority?.name,
        project: issue.fields?.project?.key,
        assignee: issue.fields?.assignee?.displayName,
      },
    });
  }

  if (webhookEvent === 'jira:issue_updated' && issue) {
    const changelog = payload.changelog;
    const statusChange = (changelog?.items || []).find((item: any) => item.field === 'status');

    if (statusChange) {
      const isDone = ['done', 'closed', 'resolved'].includes(
        (statusChange.toString || '').toLowerCase()
      );

      signals.push({
        organization_id: organizationId,
        source_domain: 'project_management',
        signal_type: isDone ? 'issue_resolved' : 'issue_status_changed',
        signal_value: isDone ? 0.5 : 0,
        entity_type: 'jira_issue',
        entity_id: issue.key || issue.id,
        metadata: {
          summary: (issue.fields?.summary || '').substring(0, 200),
          from_status: statusChange.fromString,
          to_status: statusChange.toString,
          project: issue.fields?.project?.key,
        },
      });
    }

    // Blocked detection
    const blockedChange = (changelog?.items || []).find(
      (item: any) => item.field === 'Flagged' || item.field === 'flagged'
    );
    if (blockedChange && blockedChange.toString === 'Impediment') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'project_management',
        signal_type: 'issue_blocked',
        signal_value: -0.7,
        entity_type: 'jira_issue',
        entity_id: issue.key || issue.id,
        metadata: { summary: (issue.fields?.summary || '').substring(0, 200) },
      });
    }
  }

  // Sprint events
  if (webhookEvent.startsWith('sprint_') && payload.sprint) {
    const sprint = payload.sprint;
    if (webhookEvent === 'sprint_closed') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'project_management',
        signal_type: 'sprint_completed',
        signal_value: 0.5,
        entity_type: 'sprint',
        entity_id: `sprint_${sprint.id}`,
        metadata: {
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
        },
      });
    }
  }

  return signals;
}

/**
 * Transform Xero webhook events into signals.
 *
 * 10M SCALE: Design Partner 2 needs real-time financial signals.
 * Xero sends webhooks for invoice, payment, and bank transaction events.
 *
 * Handles:
 *   - INVOICE (created, updated, paid)
 *   - PAYMENT (created)
 *   - BANK_TRANSACTION (created)
 *   - CONTACT (updated)
 */
function transformXeroEvent(payload: any, organizationId: string): WebhookSignal[] {
  const signals: WebhookSignal[] = [];
  const events = payload.events || [];

  for (const event of events) {
    const resourceType = (event.resourceUrl || '').split('/').filter(Boolean).pop() || '';
    const eventType = event.eventType || '';
    const category = event.eventCategory || '';

    if (category === 'INVOICE') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: eventType === 'CREATE' ? 'invoice_created' : eventType === 'UPDATE' ? 'invoice_updated' : 'invoice_event',
        signal_value: eventType === 'CREATE' ? 0.3 : 0,
        entity_type: 'xero_invoice',
        entity_id: event.resourceId || resourceType,
        metadata: {
          eventType,
          tenantId: event.tenantId,
          category,
        },
      });
    }

    if (category === 'PAYMENT') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'payment_received',
        signal_value: 0.5,
        entity_type: 'xero_payment',
        entity_id: event.resourceId || resourceType,
        metadata: {
          eventType,
          tenantId: event.tenantId,
        },
      });
    }

    if (category === 'BANK_TRANSACTION') {
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'bank_transaction',
        signal_value: 0,
        entity_type: 'xero_bank_transaction',
        entity_id: event.resourceId || resourceType,
        metadata: {
          eventType,
          tenantId: event.tenantId,
        },
      });
    }
  }

  return signals;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const source = url.searchParams.get('source');
    const organizationId = url.searchParams.get('org');

    if (!source || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'source and org query parameters are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json();

    // Slack URL verification challenge — respond immediately
    // Slack sends this when you first configure the Events API webhook URL.
    if (source === 'slack' && payload?.type === 'url_verification') {
      return new Response(
        JSON.stringify({ challenge: payload.challenge }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform webhook payload to signals based on source
    let signals: WebhookSignal[] = [];

    switch (source) {
      case 'stripe':
        signals = transformStripeEvent(payload, organizationId);
        break;
      case 'hubspot':
        signals = transformHubSpotEvent(payload, organizationId);
        break;
      case 'intercom':
      case 'zendesk':
      case 'support':
        signals = transformSupportEvent(payload, organizationId);
        break;
      case 'slack':
        signals = transformSlackEvent(payload, organizationId);
        break;
      case 'github':
        signals = transformGitHubEvent(payload, organizationId, req.headers);
        break;
      case 'jira':
        signals = transformJiraEvent(payload, organizationId);
        break;
      case 'xero':
        signals = transformXeroEvent(payload, organizationId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown source: ${source}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, signalsGenerated: 0, message: 'No signals generated from this event' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store signals
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const signalRecords = signals.map((s) => ({
      organization_id: s.organization_id,
      source_domain: s.source_domain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      client_id: s.client_id || null,
      feature_vector: {},
      signal_metadata: s.metadata || {},
    }));

    const { error } = await supabase
      .from('cross_domain_signals')
      .insert(signalRecords);

    if (error) {
      throw new Error(`Signal storage failed: ${error.message}`);
    }

    // Also insert into event stream for real-time processing
    const eventRecords = signals.map((s, i) => ({
      id: `wh_${source}_${Date.now()}_${i}`,
      organization_id: s.organization_id,
      event_type: 'signal',
      domain: s.source_domain,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      client_id: s.client_id || null,
      payload: {
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        webhook_source: source,
        ...s.metadata,
      },
      vector_clock: Date.now() + i,
      priority: 2,
      processing_status: 'pending',
    }));

    await supabase
      .from('causal_event_stream')
      .upsert(eventRecords, { onConflict: 'id', ignoreDuplicates: true });

    return new Response(
      JSON.stringify({
        success: true,
        source,
        signalsGenerated: signals.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
