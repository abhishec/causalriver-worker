export const dynamic = "force-dynamic";
/**
 * Slack Webhook Handler — Real-Time Event Processing
 * ===================================================
 *
 * Receives Slack Events API webhooks and converts them to Brain signals.
 *
 * Supported Events:
 * - message (new channel message) → channel_message_volume signal
 * - reaction_added → reaction_sentiment signal
 * - app_mention → direct mention tracking
 * - member_joined_channel / member_left_channel → team dynamics
 *
 * Also handles:
 * - url_verification (Slack challenge handshake)
 * - Signature verification (HMAC-SHA256 with signing secret)
 *
 * Setup:
 *   1. Create a Slack App with Events API
 *   2. Set Request URL to: https://platform.usebrainos.com/api/connectors/slack/webhook
 *   3. Subscribe to: message.channels, reaction_added, app_mention, member_joined_channel
 *   4. Set SLACK_SIGNING_SECRET in env
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { maybeTriggerBrainCycle } from '@/lib/brain-trigger';
import { logger } from "@/lib/logger";

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // ── Step 1: Verify Slack signature FIRST (security) ──────────
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      logger.error('[Slack Webhook] SLACK_SIGNING_SECRET not configured');
      // Allow url_verification challenge during initial Slack App setup only
      if (payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge });
      }
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const timestamp = req.headers.get('x-slack-request-timestamp');
    const slackSignature = req.headers.get('x-slack-signature');

    if (!timestamp || !slackSignature) {
      // Allow url_verification without sig headers (initial Slack handshake)
      if (payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge });
      }
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    // Reject if timestamp is more than 5 minutes old (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return NextResponse.json({ error: 'Request too old' }, { status: 401 });
    }

    const sigBaseString = `v0:${timestamp}:${body}`;
    const expectedSignature = `v0=${createHmac('sha256', signingSecret)
      .update(sigBaseString)
      .digest('hex')}`;

    const sigBuffer = Buffer.from(slackSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.error('[Slack Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── Step 2: Handle url_verification challenge (after sig verified) ──
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    // ── Step 3: Process event ──────────────────────────────────────
    if (payload.type !== 'event_callback') {
      return NextResponse.json({ ok: true });
    }

    const event = payload.event;
    if (!event) {
      return NextResponse.json({ ok: true });
    }

    // Find org by Slack team ID
    const service = await createServiceClient();
    const teamId = payload.team_id;

    const { data: connector } = await service
      .from('org_connectors')
      .select('organization_id, config')
      .eq('connector_type', 'slack')
      .eq('status', 'active')
      .limit(50);

    // Match by team_id in credentials or config
    const matchedConnector = connector?.find((c: any) =>
      c.config?.team_id === teamId
    );

    if (!matchedConnector) {
      logger.warn(`[Slack Webhook] No org found for team_id: ${teamId}`);
      return NextResponse.json({ ok: true });
    }

    const orgId = matchedConnector.organization_id;

    // ── Step 4: Convert events to Brain signals ────────────────────
    const signals: Array<Record<string, unknown>> = [];

    switch (event.type) {
      case 'message': {
        // Skip bot messages, edits, and deletions
        if (event.subtype && event.subtype !== 'thread_broadcast') break;
        if (event.bot_id) break;

        const hour = new Date(parseFloat(event.ts) * 1000).getUTCHours();
        const isAfterHours = hour < 8 || hour >= 19;

        signals.push({
          organization_id: orgId,
          source_domain: 'communication.slack',
          signal_type: 'channel_message_volume',
          signal_value: 1, // Each message = 1 signal, aggregated by Brain
          entity_type: 'slack_channel',
          entity_id: event.channel,
          signal_metadata: {
            channel: event.channel,
            user: event.user,
            has_thread: !!event.thread_ts,
            is_after_hours: isAfterHours,
            text_length: event.text?.length || 0,
            webhook_source: true,
          },
        });

        // Emit after-hours signal separately for causal tracking
        if (isAfterHours) {
          signals.push({
            organization_id: orgId,
            source_domain: 'communication.slack',
            signal_type: 'after_hours_activity',
            signal_value: 1,
            entity_type: 'slack_channel',
            entity_id: event.channel,
            signal_metadata: {
              channel: event.channel,
              user: event.user,
              hour,
              webhook_source: true,
            },
          });
        }

        // Thread engagement tracking
        if (event.thread_ts && event.thread_ts !== event.ts) {
          signals.push({
            organization_id: orgId,
            source_domain: 'communication.slack',
            signal_type: 'thread_engagement',
            signal_value: 1,
            entity_type: 'slack_channel',
            entity_id: event.channel,
            signal_metadata: {
              channel: event.channel,
              thread_ts: event.thread_ts,
              user: event.user,
              webhook_source: true,
            },
          });
        }
        break;
      }

      case 'reaction_added': {
        signals.push({
          organization_id: orgId,
          source_domain: 'communication.slack',
          signal_type: 'reaction_sentiment',
          signal_value: 1,
          entity_type: 'slack_channel',
          entity_id: event.item?.channel || 'unknown',
          signal_metadata: {
            reaction: event.reaction,
            user: event.user,
            item_user: event.item_user,
            webhook_source: true,
          },
        });
        break;
      }

      case 'member_joined_channel':
      case 'member_left_channel': {
        signals.push({
          organization_id: orgId,
          source_domain: 'communication.slack',
          signal_type: event.type === 'member_joined_channel'
            ? 'channel_member_join'
            : 'channel_member_leave',
          signal_value: 1,
          entity_type: 'slack_channel',
          entity_id: event.channel,
          signal_metadata: {
            user: event.user,
            channel: event.channel,
            webhook_source: true,
          },
        });
        break;
      }

      case 'app_mention': {
        signals.push({
          organization_id: orgId,
          source_domain: 'communication.slack',
          signal_type: 'bot_mention',
          signal_value: 1,
          entity_type: 'slack_channel',
          entity_id: event.channel,
          signal_metadata: {
            user: event.user,
            text: event.text?.slice(0, 200),
            webhook_source: true,
          },
        });
        break;
      }
    }

    // ── Step 5: Insert signals to Brain ────────────────────────────
    if (signals.length > 0) {
      // Ensure all signals have created_at + signal_timestamp for brain-trigger queries
      const eventTime = event.ts ? new Date(parseFloat(event.ts) * 1000).toISOString() : new Date().toISOString();
      const enrichedSignals = signals.map(s => ({
        ...s,
        created_at: s.created_at || eventTime,
        signal_timestamp: s.signal_timestamp || eventTime,
      }));
      const { error: insertError } = await service
        .from('cross_domain_signals')
        .insert(enrichedSignals);

      if (insertError) {
        logger.warn('[Slack Webhook] Signal insert error:', insertError.message);
      }
    }

    // ── Auto-trigger brain cycle if enough signals accumulated ──
    if (signals.length > 0) {
      maybeTriggerBrainCycle(orgId, service).catch((e: unknown) => logger.warn("[slack/webhook] maybeTriggerBrainCycle failed (non-fatal):", e));
    }

    // Always respond 200 quickly to prevent Slack retries
    return NextResponse.json({ ok: true, signals: signals.length });
  } catch (error: any) {
    logger.error('[Slack Webhook] Error:', error.message);
    // Always return 200 to prevent Slack from retrying failed events
    return NextResponse.json({ ok: true, error: "Internal error" });
  }
}
