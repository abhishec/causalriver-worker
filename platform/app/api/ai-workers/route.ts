/**
 * AI Workers CRUD API
 * ====================
 *
 * AI Worker = Workspace + Service pair. Stored in organizations.settings.ai_workers JSONB.
 *
 * GET  /api/ai-workers?workspaceId=xxx  → list workers for a workspace
 * POST /api/ai-workers                  → create a new AI Worker
 * PATCH /api/ai-workers                 → rename/update a worker
 * DELETE /api/ai-workers                → remove a worker
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface AIWorker {
  id: string;
  service: string;
  name: string;
  description?: string;
  status: "initializing" | "active" | "paused";
  created_at: string;
  created_by: string;
}

// ── GET: List AI Workers for a workspace ────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

    // Verify user belongs to this workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClient();

    // Fetch org settings
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    const settings = (org?.settings as Record<string, unknown>) ?? {};
    const workers: AIWorker[] = Array.isArray(settings.ai_workers)
      ? (settings.ai_workers as AIWorker[])
      : [];

    return NextResponse.json({ workers });
  } catch (err) {
    logger.warn("[ai-workers] GET failed:", err);
    return NextResponse.json({ workers: [] });
  }
}

// ── POST: Create AI Worker ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { workspaceId, service, name, description } = body as {
      workspaceId: string;
      service: string;
      name: string;
      description?: string;
    };

    if (!workspaceId || !service || !name) {
      return NextResponse.json({ error: "workspaceId, service, and name required" }, { status: 400 });
    }

    if (!["seaas", "aas", "general"].includes(service)) {
      return NextResponse.json({ error: "Invalid service type" }, { status: 400 });
    }

    // Verify user belongs to this workspace
    const { data: postMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();
    if (!postMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClient();

    // Fetch current settings
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = (org.settings as Record<string, unknown>) ?? {};
    const workers: AIWorker[] = Array.isArray(settings.ai_workers)
      ? (settings.ai_workers as AIWorker[])
      : [];

    // Check uniqueness: one worker per (workspace, service)
    if (workers.some((w) => w.service === service)) {
      return NextResponse.json(
        { error: `A ${service} worker already exists in this workspace` },
        { status: 409 }
      );
    }

    // Create the worker
    const worker: AIWorker = {
      id: `aw_${service}_${Date.now()}`,
      service,
      name,
      description: description || undefined,
      status: "active",
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    workers.push(worker);

    // Save to settings
    const { error: updateErr } = await admin
      .from("organizations")
      .update({ settings: { ...settings, ai_workers: workers } })
      .eq("id", workspaceId);

    if (updateErr) {
      logger.error("[ai-workers] POST update failed:", updateErr);
      return NextResponse.json({ error: "Failed to save worker" }, { status: 500 });
    }

    // Ensure brain_cortex_state exists for this workspace
    try {
      await admin.from("brain_cortex_state").upsert(
        { organization_id: workspaceId, cycle_count: 0, last_mode: "awake_full" },
        { onConflict: "organization_id" }
      );
    } catch {
      // Non-fatal: brain table may not exist yet
    }

    return NextResponse.json({ worker, workspaceId });
  } catch (err) {
    logger.error("[ai-workers] POST failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── PATCH: Update AI Worker (rename, status, description) ───────────────────

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { workspaceId, workerId, name, description, status } = body as {
      workspaceId: string;
      workerId: string;
      name?: string;
      description?: string;
      status?: "active" | "paused";
    };

    if (!workspaceId || !workerId) {
      return NextResponse.json({ error: "workspaceId and workerId required" }, { status: 400 });
    }

    // Verify membership + validate inputs
    const { data: patchMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();
    if (!patchMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (status !== undefined && !["active", "paused"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0 || name.length > 200)) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = (org.settings as Record<string, unknown>) ?? {};
    const workers: AIWorker[] = Array.isArray(settings.ai_workers)
      ? (settings.ai_workers as AIWorker[])
      : [];

    const idx = workers.findIndex((w) => w.id === workerId);
    if (idx === -1) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

    if (name !== undefined) workers[idx].name = name;
    if (description !== undefined) workers[idx].description = description;
    if (status !== undefined) workers[idx].status = status;

    const { error: updateErr } = await admin
      .from("organizations")
      .update({ settings: { ...settings, ai_workers: workers } })
      .eq("id", workspaceId);

    if (updateErr) {
      logger.error("[ai-workers] PATCH update failed:", updateErr);
      return NextResponse.json({ error: "Failed to update worker" }, { status: 500 });
    }

    return NextResponse.json({ success: true, worker: workers[idx] });
  } catch (err) {
    logger.error("[ai-workers] PATCH failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── DELETE: Remove AI Worker ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { workspaceId, workerId } = body as { workspaceId: string; workerId: string };

    if (!workspaceId || !workerId) {
      return NextResponse.json({ error: "workspaceId and workerId required" }, { status: 400 });
    }

    // Verify membership
    const { data: delMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();
    if (!delMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = (org.settings as Record<string, unknown>) ?? {};
    const workers: AIWorker[] = Array.isArray(settings.ai_workers)
      ? (settings.ai_workers as AIWorker[])
      : [];

    const filtered = workers.filter((w) => w.id !== workerId);

    const { error: deleteErr } = await admin
      .from("organizations")
      .update({ settings: { ...settings, ai_workers: filtered } })
      .eq("id", workspaceId);

    if (deleteErr) {
      logger.error("[ai-workers] DELETE update failed:", deleteErr);
      return NextResponse.json({ error: "Failed to delete worker" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[ai-workers] DELETE failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
