/**
 * DELETE /api/webhooks/[id]  — remove a webhook subscription
 * PATCH  /api/webhooks/[id]  — enable/disable or update a subscription
 *
 * Auth: requires a valid Supabase session. RLS enforces org scoping —
 * users can only manage subscriptions belonging to their own workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── DELETE — remove subscription ─────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  if (!id) {
    return NextResponse.json({ error: "Subscription ID is required" }, { status: 400 });
  }

  // RLS policy "org_members_manage_subs" ensures the user can only delete
  // subscriptions belonging to their own organization.
  const { error } = await supabase
    .from("webhook_subscriptions")
    .delete()
    .eq("id", id);

  if (error) {
    logger.warn("[webhooks] DELETE failed", { id, error: error.message });
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }

  logger.warn("[webhooks] Subscription deleted", { id });

  return NextResponse.json({ deleted: true, id });
}

// ── PATCH — enable/disable or update subscription ────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  if (!id) {
    return NextResponse.json({ error: "Subscription ID is required" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") allowedFields.enabled = body.enabled;
  if (Array.isArray(body.events)) allowedFields.events = body.events;
  if (typeof body.url === "string") allowedFields.url = body.url;

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update. Allowed: enabled, events, url" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("webhook_subscriptions")
    .update(allowedFields)
    .eq("id", id)
    .select("id, url, events, enabled, created_at")
    .single();

  if (error) {
    logger.warn("[webhooks] PATCH failed", { id, error: error.message });
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }

  return NextResponse.json({ subscription: data });
}
