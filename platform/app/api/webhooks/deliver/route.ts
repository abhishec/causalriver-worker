/**
 * POST /api/webhooks/deliver
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enterprise webhook event delivery.
 *
 * Accepts an internal event, looks up all active webhook configs for the org,
 * signs the payload with HMAC-SHA256, and delivers to each registered endpoint.
 * Retries once on failure. Logs every attempt to webhook_delivery_log.
 *
 * Body:
 *   { event_type: string, payload: object, organization_id: string }
 *
 * Auth: requires a valid session OR the internal CRON_SECRET header (for
 * server-side event dispatch from cron jobs / agent pipelines).
 *
 * Responses:
 *   202 { delivered: number, failed: number, results: DeliveryResult[] }
 *   400 missing required fields
 *   403 feature disabled
 *   401 unauthorized
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/feature-flags";
import { logAuditEvent, AuditAction, extractRequestContext } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Types ────────────────────────────────────────────────────────────────────

interface DeliveryResult {
  webhookId: string;
  endpointUrl: string;
  success: boolean;
  httpStatus: number | null;
  attempts: number;
  errorMessage?: string;
}

interface WebhookConfig {
  id: string;
  organization_id: string;
  endpoint_url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

// ── HMAC signing ─────────────────────────────────────────────────────────────

async function signPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// ── Delivery with retry ───────────────────────────────────────────────────────

async function deliverToEndpoint(
  webhook: WebhookConfig,
  eventType: string,
  payload: Record<string, unknown>,
  deliveryId: string
): Promise<DeliveryResult> {
  const body = JSON.stringify({
    id: deliveryId,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    organization_id: webhook.organization_id,
    payload,
  });

  const signature = await signPayload(webhook.secret, body);

  const MAX_ATTEMPTS = 2;
  let lastStatus: number | null = null;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

      const res = await fetch(webhook.endpoint_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BrainOS-Signature": signature,
          "X-BrainOS-Event": eventType,
          "X-BrainOS-Delivery": deliveryId,
          "X-BrainOS-Timestamp": new Date().toISOString(),
          "User-Agent": "BrainOS-Webhook/1.0",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      lastStatus = res.status;

      if (res.ok) {
        return {
          webhookId: webhook.id,
          endpointUrl: webhook.endpoint_url,
          success: true,
          httpStatus: res.status,
          attempts: attempt,
        };
      }

      lastError = `HTTP ${res.status}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        // Brief back-off before retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  return {
    webhookId: webhook.id,
    endpointUrl: webhook.endpoint_url,
    success: false,
    httpStatus: lastStatus,
    attempts: MAX_ATTEMPTS,
    errorMessage: lastError,
  };
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Feature flag gate
  if (!isEnabled("WEBHOOK_DELIVERY")) {
    return NextResponse.json(
      { error: "Webhook delivery is not enabled for this instance" },
      { status: 403 }
    );
  }

  // Auth: accept session OR internal CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = request.headers.get("x-internal-secret");
  const isInternalCall = cronSecret && internalSecret === cronSecret;

  let userId: string | undefined;

  if (!isInternalCall) {
    let supabase;
    try {
      supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = data.user.id;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event_type, payload, organization_id } = body as {
    event_type?: string;
    payload?: Record<string, unknown>;
    organization_id?: string;
  };

  if (!event_type || !organization_id) {
    return NextResponse.json(
      { error: "event_type and organization_id are required" },
      { status: 400 }
    );
  }

  const eventPayload: Record<string, unknown> = payload ?? {};

  // Look up active webhook configs for this org
  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: configs, error: configErr } = await admin
    .from("webhook_configs")
    .select("id, organization_id, endpoint_url, secret, events, is_active")
    .eq("organization_id", organization_id)
    .eq("is_active", true);

  if (configErr) {
    logger.error("[webhooks/deliver] Failed to fetch webhook configs:", { error: configErr.message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json(
      { delivered: 0, failed: 0, results: [], message: "No active webhook configs for this org" },
      { status: 202 }
    );
  }

  // Filter to configs that subscribe to this event type
  const matching = (configs as WebhookConfig[]).filter((c) =>
    c.events.includes("*") || c.events.includes(event_type)
  );

  if (matching.length === 0) {
    return NextResponse.json(
      { delivered: 0, failed: 0, results: [], message: "No webhook configs subscribed to this event" },
      { status: 202 }
    );
  }

  const requestCtx = extractRequestContext(request);

  // Deliver to all matching endpoints in parallel
  const deliveryId = crypto.randomUUID();
  const results = await Promise.all(
    matching.map((wh) => deliverToEndpoint(wh, event_type, eventPayload, deliveryId))
  );

  const delivered = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // Log delivery attempts to webhook_delivery_log
  const logRows = results.map((r) => ({
    organization_id,
    webhook_id: r.webhookId,
    event_type,
    endpoint_url: r.endpointUrl,
    http_status: r.httpStatus,
    attempt_number: r.attempts,
    success: r.success,
    error_message: r.errorMessage ?? null,
  }));

  // Fire-and-forget — don't block the response on logging
  admin
    .from("webhook_delivery_log")
    .insert(logRows)
    .then(
      ({ error: logErr }) => {
        if (logErr) {
          logger.warn("[webhooks/deliver] Failed to insert delivery log:", { error: logErr.message });
        }
      },
      (err: unknown) => {
        logger.warn("[webhooks/deliver] Delivery log insert threw unexpectedly:", { error: String(err) });
      }
    );

  // Audit log the dispatch (fire-and-forget)
  logAuditEvent({
    organizationId: organization_id,
    userId,
    action: "webhook.event.dispatched",
    resourceType: "webhook",
    resourceId: deliveryId,
    metadata: {
      event_type,
      webhooksAttempted: matching.length,
      delivered,
      failed,
    },
    status: failed === 0 ? "success" : delivered > 0 ? "success" : "failure",
    ...requestCtx,
  });

  logger.warn(`[webhooks/deliver] Event "${event_type}" dispatched to ${matching.length} endpoints: ${delivered} ok, ${failed} failed`);

  return NextResponse.json(
    {
      delivered,
      failed,
      results: results.map((r) => ({
        webhookId: r.webhookId,
        success: r.success,
        httpStatus: r.httpStatus,
        attempts: r.attempts,
        ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
      })),
    },
    { status: 202 }
  );
}
