/**
 * Per-Worker API Key Revocation
 * ==============================
 * DELETE /api/ai-workers/[workerId]/keys/[keyId]  — revoke (soft-delete) a worker API key
 *
 * ADR-008: Revocation sets is_active = false. The key hash remains in the table for audit.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── DELETE: Revoke a per-worker API key ──────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workerId: string; keyId: string }> }
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

  const { workerId, keyId } = await params;

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

    // Soft-revoke: set is_active = false, scoped to worker + org (prevents cross-worker revocation)
    const service = await createServiceClient();
    const { error: revokeErr } = await service
      .from("api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("ai_worker_id", workerId)
      .eq("organization_id", worker.organization_id);

    if (revokeErr) {
      logger.error("[ai-workers/keys DELETE] Revoke failed", { error: revokeErr.message });
      return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
    }

    logger.warn(`[ai-workers/keys DELETE] Revoked key ${keyId} for worker ${workerId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[ai-workers/keys DELETE] Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
