/**
 * Nexus Webhook Edge Function
 *
 * Webhook receiver for HubSpot, Stripe, Intercom, and Slack events.
 * Routes incoming webhooks to the appropriate connector's signal transformer
 * and stores the resulting signals.
 *
 * Routes:
 *   POST /nexus-webhook?source=hubspot&org=<orgId>
 *   POST /nexus-webhook?source=stripe&org=<orgId>
 *   POST /nexus-webhook?source=intercom&org=<orgId>
 *   POST /nexus-webhook?source=slack&org=<orgId>
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
