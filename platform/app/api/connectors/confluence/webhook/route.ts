export const dynamic = "force-dynamic";
/**
 * Confluence Webhook Handler — Real-Time Page Event Processing
 * ============================================================
 *
 * Receives Confluence webhook events and converts them to Brain signals.
 *
 * Supported Events:
 * - page_created  → page_created signal
 * - page_updated  → page_updated signal
 * - page_removed  → page_deleted signal
 * - comment_created → comment_created signal (on a page)
 *
 * Setup:
 *   1. Go to Confluence Settings → Webhooks
 *   2. URL: https://platform.usebrainos.com/api/connectors/confluence/webhook
 *   3. Select events: Page created/updated/removed, Comment created
 *   4. Optionally add a secret for HMAC-SHA256 verification (X-Hub-Signature header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { maybeTriggerBrainCycle } from '@/lib/brain-trigger';
import { logger } from '@/lib/logger';

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // ── Step 1: Verify webhook authenticity (HMAC-SHA256) ───────────────
    // Confluence webhooks send X-Hub-Signature: sha256=<hex> when a secret
    // is configured. If CONFLUENCE_WEBHOOK_SECRET is not set, skip verification
    // (graceful degradation — allows testing without a secret).
    const webhookSecret = process.env.CONFLUENCE_WEBHOOK_SECRET;

    if (webhookSecret) {
      const signatureHeader = req.headers.get('x-hub-signature') ?? '';
      if (!signatureHeader) {
        logger.warn('[Confluence Webhook] Missing X-Hub-Signature header');
        return NextResponse.json({ ok: true }); // Ack to prevent retries
      }

      const [algorithm, providedHex] = signatureHeader.split('=');
      if (algorithm !== 'sha256' || !providedHex) {
        logger.warn('[Confluence Webhook] Invalid X-Hub-Signature format');
        return NextResponse.json({ ok: true });
      }

      const expected = createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'hex');
      const providedBuf = Buffer.from(providedHex, 'hex');

      if (
        expectedBuf.length !== providedBuf.length ||
        !timingSafeEqual(expectedBuf, providedBuf)
      ) {
        logger.warn('[Confluence Webhook] HMAC signature mismatch — rejecting');
        return NextResponse.json({ ok: true }); // Ack to prevent retries
      }
    }

    // ── Step 2: Parse payload ────────────────────────────────────────────
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      logger.warn('[Confluence Webhook] Malformed JSON payload');
      return NextResponse.json({ ok: true }); // Ack to prevent retries
    }

    const webhookEvent = (payload.webhookEvent as string) ?? '';
    logger.warn(`[Confluence Webhook] Received event: ${webhookEvent}`);

    // ── Step 3: Resolve organization by cloud_id ─────────────────────────
    // Confluence sends cloudId in the top-level payload. We match it against
    // the metadata field in org_connectors to find the owning organization.
    const cloudId = (payload.cloudId as string) ?? '';
    const adminClient = await createServiceClient();

    const { data: connector } = await adminClient
      .from('org_connectors')
      .select('organization_id')
      .eq('connector_type', 'confluence')
      .contains('metadata', { cloud_id: cloudId })
      .single();

    if (!connector) {
      logger.warn(`[Confluence Webhook] No org found for cloudId: ${cloudId}`);
      return NextResponse.json({ ok: true });
    }

    const orgId = connector.organization_id as string;

    // ── Step 4: Map event to signal ──────────────────────────────────────
    const signals: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();

    const page = (payload.page as Record<string, unknown>) ?? {};
    const actor = (payload.actor as Record<string, unknown>) ?? {};

    // Page lifecycle events
    if (
      webhookEvent === 'page_created' ||
      webhookEvent === 'page_updated' ||
      webhookEvent === 'page_removed'
    ) {
      let signalType: string;
      if (webhookEvent === 'page_created') {
        signalType = 'page_created';
      } else if (webhookEvent === 'page_updated') {
        signalType = 'page_updated';
      } else {
        signalType = 'page_deleted';
      }

      signals.push({
        organization_id: orgId,
        source_domain: 'knowledge.confluence',
        signal_type: signalType,
        signal_value: 1.0,
        signal_timestamp: now,
        entity_type: 'confluence_page',
        entity_id: String(page.id ?? ''),
        signal_metadata: {
          title: page.title ?? null,
          space_key: (page.space as Record<string, unknown>)?.key ?? null,
          url: (page._links as Record<string, unknown>)?.webui ?? null,
          author: actor.displayName ?? null,
          event_type: webhookEvent,
        },
        created_at: now,
      });
    }

    // Comment created event
    if (webhookEvent === 'comment_created') {
      const comment = (payload.comment as Record<string, unknown>) ?? {};
      const commentPage = (comment.page as Record<string, unknown>) ?? page;

      signals.push({
        organization_id: orgId,
        source_domain: 'knowledge.confluence',
        signal_type: 'comment_created',
        signal_value: 1.0,
        signal_timestamp: now,
        entity_type: 'confluence_page',
        entity_id: String(commentPage.id ?? page.id ?? ''),
        signal_metadata: {
          title: (commentPage.title ?? page.title) ?? null,
          space_key:
            ((commentPage.space as Record<string, unknown>)?.key ??
              (page.space as Record<string, unknown>)?.key) ??
            null,
          url:
            ((commentPage._links as Record<string, unknown>)?.webui ??
              (page._links as Record<string, unknown>)?.webui) ??
            null,
          author: actor.displayName ?? null,
          event_type: webhookEvent,
        },
        created_at: now,
      });
    }

    // ── Step 5: Insert signals into Brain ────────────────────────────────
    if (signals.length > 0) {
      const { error: insertError } = await adminClient
        .from('cross_domain_signals')
        .insert(signals);

      if (insertError) {
        logger.warn('[Confluence Webhook] Signal insert error:', insertError.message);
      }

      // Auto-trigger brain cycle if enough signals accumulated
      maybeTriggerBrainCycle(orgId, adminClient).catch((e: unknown) => logger.warn("[confluence/webhook] maybeTriggerBrainCycle failed (non-fatal):", e));
    }

    return NextResponse.json({ ok: true, signals: signals.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[Confluence Webhook] Unexpected error:', message);
    // Always return 200 — Confluence retries on non-200 responses
    return NextResponse.json({ ok: true, error: 'Internal error' });
  }
}
