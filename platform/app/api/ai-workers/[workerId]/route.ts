/**
 * AI Worker detail + update API
 * ==============================
 *
 * GET   /api/ai-workers/[workerId]  → fetch single worker (org-scoped)
 * PATCH /api/ai-workers/[workerId]  → partial update (name, description, service_type, status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_SERVICE_TYPES = new Set(["se-aas", "aas", "pm-aas"]);
const VALID_STATUSES = new Set(["active", "provisioning", "paused", "archived"]);

// ── GET /api/ai-workers/[workerId] ───────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  try {
    const { workerId } = await params;

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let orgId: string;
    try {
      orgId = await getCurrentWorkspaceId();
      if (!orgId) throw new Error("No workspace");
    } catch {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    let service;
    try {
      service = await createServiceClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await service
      .from("ai_workers")
      .select("id, name, description, service_type, status, config, created_by, created_at, updated_at")
      .eq("id", workerId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ worker: data });
  } catch (err: unknown) {
    logger.error("[ai-workers/[workerId]/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── PATCH /api/ai-workers/[workerId] ─────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  try {
    const { workerId } = await params;

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let orgId: string;
    try {
      orgId = await getCurrentWorkspaceId();
      if (!orgId) throw new Error("No workspace");
    } catch {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, service_type, status } = body as {
      name?: string;
      description?: string;
      service_type?: string | null;
      status?: string;
    };

    // Validate provided fields
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
    }
    if (service_type !== undefined && service_type !== null && !VALID_SERVICE_TYPES.has(service_type)) {
      return NextResponse.json(
        { error: "service_type must be 'se-aas', 'aas', 'pm-aas', or null" },
        { status: 400 }
      );
    }
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "status must be 'active', 'provisioning', 'paused', or 'archived'" },
        { status: 400 }
      );
    }

    // Build update object — only include provided fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (service_type !== undefined) updates.service_type = service_type;
    if (status !== undefined) updates.status = status;

    let service;
    try {
      service = await createServiceClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await service
      .from("ai_workers")
      .update(updates)
      .eq("id", workerId)
      .eq("organization_id", orgId)
      .select("id, name, description, service_type, status, config, created_by, created_at, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ worker: data });
  } catch (err: unknown) {
    logger.error("[ai-workers/[workerId]/PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
