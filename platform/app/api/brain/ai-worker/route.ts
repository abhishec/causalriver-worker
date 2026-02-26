/**
 * GET  /api/brain/ai-worker
 *   Returns the AI Worker config for the current workspace.
 *
 * PATCH /api/brain/ai-worker
 *   Partial update to AI Worker config.
 *   Body: { brainConfig?, enabledDomains?, orchestratorConfig?,
 *            contextAgentConfig?, recoveryConfig?, displayName?, status? }
 *
 * All fields are optional — only provided fields are updated (partial patch).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import {
  getAIWorkerConfig,
  updateAIWorkerConfig,
  type AIWorkerConfig,
} from "@/lib/brain/ai-worker-config";

export const dynamic = "force-dynamic";

// ── Shared auth helper ────────────────────────────────────────────────────

async function resolveWorkspace(): Promise<{
  workspaceId: string;
  error: NextResponse | null;
}> {
  let user = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[ai-worker] Auth failed:", authErr);
    return {
      workspaceId: "",
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!user) {
    return {
      workspaceId: "",
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let workspaceId: string;
  try {
    workspaceId = await getCurrentWorkspaceId();
  } catch {
    return {
      workspaceId: "",
      error: NextResponse.json(
        { error: "Could not resolve AI Worker workspace" },
        { status: 400 }
      ),
    };
  }

  if (!workspaceId) {
    return {
      workspaceId: "",
      error: NextResponse.json(
        { error: "No active AI Worker workspace" },
        { status: 400 }
      ),
    };
  }

  return { workspaceId, error: null };
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const { workspaceId, error } = await resolveWorkspace();
  if (error) return error;

  try {
    const config = await getAIWorkerConfig(workspaceId);

    logger.info(`[ai-worker] GET org=${workspaceId} status=${config.status}`);

    return NextResponse.json(config);
  } catch (err) {
    logger.error("[ai-worker] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { workspaceId, error } = await resolveWorkspace();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be an object" },
      { status: 400 }
    );
  }

  // Extract only allowed patch fields
  const patch: Partial<Omit<AIWorkerConfig, "organizationId">> = {};
  const raw = body as Record<string, unknown>;

  if (raw.displayName !== undefined) patch.displayName = String(raw.displayName);
  if (raw.brainConfig !== undefined && typeof raw.brainConfig === "object") {
    patch.brainConfig = raw.brainConfig as AIWorkerConfig["brainConfig"];
  }
  if (Array.isArray(raw.enabledDomains)) {
    patch.enabledDomains = raw.enabledDomains.map(String);
  }
  if (Array.isArray(raw.availableConnectors)) {
    patch.availableConnectors = raw.availableConnectors.map(String);
  }
  if (
    raw.orchestratorConfig !== undefined &&
    typeof raw.orchestratorConfig === "object"
  ) {
    patch.orchestratorConfig = raw.orchestratorConfig as AIWorkerConfig["orchestratorConfig"];
  }
  if (
    raw.contextAgentConfig !== undefined &&
    typeof raw.contextAgentConfig === "object"
  ) {
    patch.contextAgentConfig = raw.contextAgentConfig as AIWorkerConfig["contextAgentConfig"];
  }
  if (
    raw.recoveryConfig !== undefined &&
    typeof raw.recoveryConfig === "object"
  ) {
    patch.recoveryConfig = raw.recoveryConfig as AIWorkerConfig["recoveryConfig"];
  }
  if (
    raw.status !== undefined &&
    ["active", "paused", "archived"].includes(String(raw.status))
  ) {
    patch.status = raw.status as AIWorkerConfig["status"];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid patch fields provided" },
      { status: 400 }
    );
  }

  try {
    await updateAIWorkerConfig(workspaceId, patch);

    // Return updated config
    const updated = await getAIWorkerConfig(workspaceId);

    logger.info(
      `[ai-worker] PATCH org=${workspaceId} fields=${Object.keys(patch).join(",")}`
    );

    return NextResponse.json(updated);
  } catch (err) {
    logger.error("[ai-worker] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
