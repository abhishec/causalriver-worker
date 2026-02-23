/**
 * Causal Graph Diff API — Brain Knowledge Evolution
 * ==================================================
 *
 * GET /api/brain/graph-diff?organizationId=xxx
 *   List available graph snapshots for the organization.
 *   Returns snapshot metadata (id, type, edge/node counts, dates).
 *
 * POST /api/brain/graph-diff
 *   Compute a diff between two graph states. Three modes:
 *
 *   1. Compare two snapshots by ID:
 *      { organizationId, snapshotIdA, snapshotIdB }
 *
 *   2. Compare current graph vs a specific snapshot:
 *      { organizationId, snapshotId }
 *
 *   3. Compare current graph vs N days ago:
 *      { organizationId, periodDays: 7 }
 *
 * POST /api/brain/graph-diff/snapshot
 *   Capture a manual snapshot of the current causal graph.
 *   { organizationId }
 *
 * Auth: Requires authenticated user with org membership.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();

    // Verify membership
    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const service = await createServiceClient();

    const { listSnapshots } = await import("@nexus-ai/memory-stack");

    const snapshots = await listSnapshots(service, organizationId);

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      snapshots,
      count: snapshots.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[GraphDiff] GET error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      snapshotIdA,
      snapshotIdB,
      snapshotId,
      periodDays,
      action,
      options,
    } = body as {
      organizationId?: string;
      snapshotIdA?: string;
      snapshotIdB?: string;
      snapshotId?: string;
      periodDays?: number;
      action?: 'snapshot' | 'diff';
      options?: { minEffectSizeDelta?: number; topChangesLimit?: number; significantOnly?: boolean };
    };

    const workspaceId = organizationId || await getCurrentWorkspaceId();

    // Verify membership
    const { data: postMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!postMember) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const service = await createServiceClient();

    // ── Action: Capture snapshot ─────────────────────────────
    if (action === 'snapshot') {
      const { captureGraphSnapshot } = await import("@nexus-ai/memory-stack");

      const { id, snapshot } = await captureGraphSnapshot(
        service,
        workspaceId,
        'manual',
      );

      return NextResponse.json({
        success: true,
        action: 'snapshot',
        snapshot_id: id,
        organization_id: workspaceId,
        metadata: snapshot.metadata,
      });
    }

    // ── Action: Compute diff ─────────────────────────────────
    const {
      diffSnapshotsById,
      diffCurrentVsSnapshot,
      diffByTimePeriod,
    } = await import("@nexus-ai/memory-stack");

    const startTime = Date.now();
    let diff;

    if (snapshotIdA && snapshotIdB) {
      // Mode 1: Compare two specific snapshots
      diff = await diffSnapshotsById(service, workspaceId, snapshotIdA, snapshotIdB, options);
    } else if (snapshotId) {
      // Mode 2: Compare current vs specific snapshot
      diff = await diffCurrentVsSnapshot(service, workspaceId, snapshotId, options);
    } else if (periodDays) {
      // Mode 3: Compare current vs N days ago
      diff = await diffByTimePeriod(service, workspaceId, periodDays, options);
    } else {
      // Default: Compare current vs most recent snapshot
      diff = await diffCurrentVsSnapshot(service, workspaceId, undefined, options);
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      action: 'diff',
      organization_id: workspaceId,
      duration_ms: durationMs,
      diff,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[GraphDiff] POST error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
