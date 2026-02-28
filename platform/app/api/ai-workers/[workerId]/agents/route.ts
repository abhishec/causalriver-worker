/**
 * Per-Worker Agents List API
 * ==========================
 * GET /api/ai-workers/[workerId]/agents
 *   — list agents scoped to this AI Worker (org-scoped, newest first, limit 20)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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
      .from("agents")
      .select("id, name, purpose, status, created_by, created_at, completed_at")
      .eq("ai_worker_id", workerId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ agents: data ?? [] });
  } catch (err: unknown) {
    logger.error("[ai-workers/[workerId]/agents GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
