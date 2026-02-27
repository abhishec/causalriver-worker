/**
 * GET  /api/webhooks  — list webhook subscriptions for the current workspace
 * POST /api/webhooks  — create a new webhook subscription
 *
 * Auth: requires a valid Supabase session. The workspace is resolved from the
 * authenticated user's org membership (getCurrentWorkspaceId).
 *
 * POST body:
 *   { url: string, events: string[], secret?: string }
 *
 * Supported event types:
 *   brain.decision | agent.completed | agent.failed | rl.signal |
 *   flight_risk.detected | scope_creep.detected | policy.blocked
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_EVENTS = new Set([
  "brain.decision",
  "agent.completed",
  "agent.failed",
  "rl.signal",
  "flight_risk.detected",
  "scope_creep.detected",
  "policy.blocked",
]);

// ── GET — list subscriptions ─────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: user, error: authError } = await supabase.auth.getUser();
  if (authError || !user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace found for user" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("webhook_subscriptions")
    .select("id, url, events, enabled, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn("[webhooks] GET failed", { error: error.message });
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data ?? [] });
}

// ── POST — create subscription ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: user, error: authError } = await supabase.auth.getUser();
  if (authError || !user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace found for user" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, events, secret } = body as {
    url?: string;
    events?: string[];
    secret?: string;
  };

  // Validate required fields
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required and must be a string" }, { status: 400 });
  }

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http/https URLs allowed");
    }
    // SSRF protection: block private/internal IP ranges
    if (
      /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|localhost|::1)/i.test(
        parsed.hostname
      )
    ) {
      return NextResponse.json(
        { error: "Private/internal URLs are not allowed" },
        { status: 400 }
      );
    }
  } catch (urlErr) {
    return NextResponse.json(
      { error: urlErr instanceof Error ? urlErr.message : "Invalid URL" },
      { status: 400 }
    );
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { error: "events must be a non-empty array of event type strings" },
      { status: 400 }
    );
  }

  // Validate each event type
  const invalidEvents = events.filter((e) => !VALID_EVENTS.has(e));
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid event types: ${invalidEvents.join(", ")}. Valid types: ${Array.from(VALID_EVENTS).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("webhook_subscriptions")
    .insert({
      organization_id: orgId,
      url,
      events,
      secret: secret ?? null,
      enabled: true,
    })
    .select("id, url, events, enabled, created_at")
    .single();

  if (error) {
    logger.warn("[webhooks] POST insert failed", { error: error.message });
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }

  logger.warn("[webhooks] Subscription created", { id: data.id, orgId, events });

  return NextResponse.json({ subscription: data }, { status: 201 });
}
