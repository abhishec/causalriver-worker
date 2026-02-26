/**
 * AI Workspace API
 * ================
 * GET  /api/brain/workspace  → returns AIWorkspace for the current org
 * PATCH /api/brain/workspace → update workspace config
 *
 * GET 200:
 *   { workspace: AIWorkspace }
 *
 * PATCH 200:
 *   { workspace: AIWorkspace }
 *
 * PATCH body (all fields optional):
 *   {
 *     activatedServices?: string[],
 *     brainConfig?: Partial<AIWorkspace['brainConfig']>,
 *     orchestratorConfig?: Partial<AIWorkspace['orchestratorConfig']>,
 *     seaasConfig?: Partial<AIWorkspace['seaasConfig']>,
 *     name?: string,
 *     status?: string,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import {
  getOrCreateAIWorkspace,
  updateWorkspaceConfig,
  type AIWorkspace,
} from "@/lib/brain/ai-workspace";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ── GET /api/brain/workspace ──────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const workspace = await getOrCreateAIWorkspace(workspaceId);
    return NextResponse.json({ workspace });
  } catch (err: any) {
    logger.error("[workspace/GET] Unexpected error:", err?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/brain/workspace ────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = body as Partial<AIWorkspace>;

    // Only allow safe fields — strip id, organizationId, createdAt, updatedAt
    const safePatch: Partial<AIWorkspace> = {};
    if (patch.name !== undefined) safePatch.name = patch.name;
    if (patch.status !== undefined) safePatch.status = patch.status;
    if (patch.activatedServices !== undefined)
      safePatch.activatedServices = patch.activatedServices;
    if (patch.seaasConfig !== undefined) safePatch.seaasConfig = patch.seaasConfig;
    if (patch.aaasConfig !== undefined) safePatch.aaasConfig = patch.aaasConfig;
    if (patch.brainConfig !== undefined) safePatch.brainConfig = patch.brainConfig;
    if (patch.orchestratorConfig !== undefined)
      safePatch.orchestratorConfig = patch.orchestratorConfig;

    await updateWorkspaceConfig(workspaceId, safePatch);

    const updated = await getOrCreateAIWorkspace(workspaceId);
    return NextResponse.json({ workspace: updated });
  } catch (err: any) {
    logger.error("[workspace/PATCH] Unexpected error:", err?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
