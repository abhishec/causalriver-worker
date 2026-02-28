/**
 * Per-Worker API Key Management
 * ==============================
 * GET  /api/ai-workers/[workerId]/keys  — list API keys scoped to this worker
 * POST /api/ai-workers/[workerId]/keys  — create a new API key for this worker
 *
 * ADR-008: API keys scoped to a specific AI Worker.
 * Bearer token → lookup api_keys (by key_hash) → get ai_worker_id → scope A2A job to that worker.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/api-key-auth";
import { logger } from "@/lib/logger";

// ── GET: List API keys for a specific AI Worker ──────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    user = authData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workerId } = await params;

  try {
    const admin = getAdminClient();

    // Resolve ai_worker → organization_id
    const { data: worker, error: workerErr } = await admin
      .from("ai_workers")
      .select("id, organization_id, name")
      .eq("id", workerId)
      .maybeSingle();

    if (workerErr || !worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    // Verify caller belongs to this workspace
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", worker.organization_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // List keys for this worker — NEVER return key_hash
    const { data: keys, error: keysErr } = await admin
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, created_at, is_active")
      .eq("ai_worker_id", workerId)
      .eq("organization_id", worker.organization_id)
      .order("created_at", { ascending: false });

    if (keysErr) {
      logger.error("[ai-workers/keys GET] Query failed", { error: keysErr.message });
      return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
    }

    return NextResponse.json({ keys: keys ?? [] });
  } catch (err) {
    logger.error("[ai-workers/keys GET] Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: Create a new API key for a specific AI Worker ──────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    user = authData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workerId } = await params;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name } = body;
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const admin = getAdminClient();

    // Resolve ai_worker → organization_id
    const { data: worker, error: workerErr } = await admin
      .from("ai_workers")
      .select("id, organization_id")
      .eq("id", workerId)
      .maybeSingle();

    if (workerErr || !worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    // Verify caller belongs to this workspace (owner or admin)
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", worker.organization_id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden — owner or admin required" }, { status: 403 });
    }

    // Generate key: nxb_<32-hex-bytes>
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    // Insert using service client (bypasses RLS for insert)
    const service = await createServiceClient();
    const { data: newKey, error: insertErr } = await service
      .from("api_keys")
      .insert({
        organization_id: worker.organization_id,
        ai_worker_id: workerId,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions: ["read", "execute"],
        rate_limit_per_minute: 60,
        created_by: user.id,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertErr || !newKey) {
      logger.error("[ai-workers/keys POST] Insert failed", { error: insertErr?.message });
      return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
    }

    logger.warn(`[ai-workers/keys POST] Created key ${keyPrefix} for worker ${workerId}`);

    // Return the raw key ONCE — it is never stored in plaintext
    return NextResponse.json(
      {
        id: newKey.id,
        key: rawKey,
        key_prefix: keyPrefix,
        name: name.trim(),
        ai_worker_id: workerId,
        message: "Save this key now — it will not be shown again.",
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("[ai-workers/keys POST] Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
