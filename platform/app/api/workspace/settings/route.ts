export const dynamic = "force-dynamic";
/**
 * GET  /api/workspace/settings
 * PATCH /api/workspace/settings
 *
 * Workspace-level settings that live directly on the organizations table.
 * Currently: brain_readiness_threshold (0.0–1.0, default 0.7)
 *
 * GET response:  { brain_readiness_threshold: number }
 * PATCH body:    { brain_readiness_threshold: number }
 * PATCH response: { success: true, brain_readiness_threshold: number }
 *
 * Auth: GET — any authenticated org member; PATCH — admin or owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { requireOrgRole } from "@/lib/auth/check-org-role";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/workspace/settings
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("organizations")
      .select("brain_readiness_threshold")
      .eq("id", workspaceId)
      .maybeSingle();

    if (error) {
      logger.warn("[workspace/settings/GET] Query error:", error.message);
      return NextResponse.json({ brain_readiness_threshold: 0.7 });
    }

    const threshold = typeof data?.brain_readiness_threshold === "number"
      ? data.brain_readiness_threshold
      : 0.7;

    return NextResponse.json({ brain_readiness_threshold: threshold });
  } catch (err) {
    logger.error("[workspace/settings/GET] Unexpected error:", err);
    return NextResponse.json({ brain_readiness_threshold: 0.7 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/workspace/settings
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Only admin/owner can change settings
    const { allowed } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only workspace admins can update settings" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.brain_readiness_threshold !== undefined) {
      const raw = Number(body.brain_readiness_threshold);
      if (isNaN(raw)) {
        return NextResponse.json(
          { error: "brain_readiness_threshold must be a number" },
          { status: 400 }
        );
      }
      // Clamp to [0.0, 1.0] and round to 1 decimal place
      const clamped = Math.min(1.0, Math.max(0.0, Math.round(raw * 10) / 10));
      updates.brain_readiness_threshold = clamped;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", workspaceId);

    if (updateError) {
      logger.error("[workspace/settings/PATCH] Update error:", updateError.message);
      return NextResponse.json(
        { error: updateError.message ?? "Failed to update settings" },
        { status: 500 }
      );
    }

    logger.warn("[workspace/settings/PATCH] Updated settings for workspace:", workspaceId, updates);

    return NextResponse.json({
      success: true,
      ...(updates.brain_readiness_threshold !== undefined && {
        brain_readiness_threshold: updates.brain_readiness_threshold,
      }),
    });
  } catch (err) {
    logger.error("[workspace/settings/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
