/**
 * Webhook Delivery — Layer 5 Protocol
 * ======================================
 * emitWebhookEvent() looks up all active webhook_subscriptions for an org
 * that subscribe to the given event type, then delivers the signed payload
 * to each endpoint (fire-and-forget per subscriber).
 *
 * Supported events:
 *   brain.decision        — Brain context mesh made a routing decision
 *   agent.completed       — SE-aaS / code-agent job completed successfully
 *   agent.failed          — Job failed after recovery attempts exhausted
 *   rl.signal             — RL closed loop emitted a dopamine/gaba signal
 *   flight_risk.detected  — Early warning: engineer flight risk detected
 *   scope_creep.detected  — Scope creep alert triggered
 *   policy.blocked        — PolicyEnforcer blocked a job
 *
 * HMAC signing: X-BrainOS-Signature: sha256=<hex> header added when
 * the subscription has a secret configured.
 *
 * Delivery log: every attempt (success or failure) is written to
 * webhook_subscription_delivery_log via the service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | "brain.decision"
  | "agent.completed"
  | "agent.failed"
  | "rl.signal"
  | "flight_risk.detected"
  | "scope_creep.detected"
  | "policy.blocked";

interface WebhookSubscription {
  id: string;
  url: string;
  secret?: string | null;
  events: string[];
}

interface EventEnvelope {
  event: WebhookEvent;
  timestamp: string;
  organizationId: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a webhook event to all active subscribers for the given org.
 *
 * This function is intentionally fire-and-forget: it never throws.
 * Call it without awaiting when you don't want it to block the hot path.
 *
 * @example
 *   void emitWebhookEvent(supabase, orgId, 'agent.completed', { jobId, domain });
 */
export async function emitWebhookEvent(
  supabase: SupabaseClient,
  orgId: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Find active subscriptions for this org that include this event type
    const { data: subs, error } = await supabase
      .from("webhook_subscriptions")
      .select("id, url, secret, events")
      .eq("organization_id", orgId)
      .eq("enabled", true)
      .contains("events", [eventType]);

    if (error) {
      logger.warn("[Webhooks] Failed to query subscriptions", { eventType, orgId, error: error.message });
      return;
    }

    if (!subs || subs.length === 0) return;

    const envelope: EventEnvelope = {
      event: eventType,
      timestamp: new Date().toISOString(),
      organizationId: orgId,
      data: payload,
    };

    // Deliver to each subscriber independently (non-blocking per subscriber)
    for (const sub of subs as WebhookSubscription[]) {
      void deliverToSubscriber(supabase, sub, envelope);
    }
  } catch (err) {
    logger.warn("[Webhooks] Failed to emit event", {
      eventType,
      orgId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal delivery
// ---------------------------------------------------------------------------

async function deliverToSubscriber(
  supabase: SupabaseClient,
  sub: WebhookSubscription,
  envelope: EventEnvelope
): Promise<void> {
  const body = JSON.stringify(envelope);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BrainOS-Webhooks/2.0",
    "X-BrainOS-Event": envelope.event,
    "X-BrainOS-Timestamp": envelope.timestamp,
  };

  // HMAC-SHA256 signature if the subscription has a secret configured
  if (sub.secret) {
    const sig = crypto
      .createHmac("sha256", sub.secret)
      .update(body)
      .digest("hex");
    headers["X-BrainOS-Signature"] = `sha256=${sig}`;
  }

  let status: "delivered" | "failed" = "failed";
  let responseStatus: number | undefined;
  let errorMsg: string | undefined;

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers,
      body,
      // AbortSignal.timeout is available in Node 17.3+ / Next.js 13+
      signal: AbortSignal.timeout(10_000),
    });

    responseStatus = res.status;

    if (res.ok) {
      status = "delivered";
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Write delivery log (best-effort — never throws)
  try {
    await supabase.from("webhook_subscription_delivery_log").insert({
      subscription_id: sub.id,
      event_type: envelope.event,
      payload: envelope as unknown as Record<string, unknown>,
      status,
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      response_status: responseStatus ?? null,
      error: errorMsg ?? null,
    });
  } catch (logErr) {
    logger.warn("[Webhooks] Failed to write delivery log", {
      subscriptionId: sub.id,
      err: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }
}
