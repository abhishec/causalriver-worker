/**
 * GET  /api/brain/circuit-breaker
 * POST /api/brain/circuit-breaker
 *
 * GET — returns current circuit breaker status for the requesting org:
 *   {
 *     broken: string[],                  // domains currently excluded from planning for this org
 *     status: CircuitBreakerStatus[],    // full metadata (failureCount, orgCount, isPoisoned, etc.)
 *     overrides: string[],               // domains this org has bypassed via POST
 *   }
 *
 * POST — add or remove a per-org override:
 *   Body: { domain: string, action: "bypass" | "restore" }
 *   - "bypass"  → domain is excluded from this org's global circuit breaker
 *   - "restore" → removes the bypass (org re-enters global exclusion)
 *   Auth: owner or admin role only
 *   Stored in ai_memory: domain='brain-config', memory_type='circuit-breaker-override'
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import {
  getGloballyBrokenDomains,
  type CircuitBreakerStatus,
} from "@/lib/brain/cognitive-planner";

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function authenticate() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }
  if (!user) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  let organizationId: string | null = null;
  try {
    organizationId = await getCurrentWorkspaceId();
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }
  if (!organizationId) {
    return { error: "No workspace found", status: 401 } as const;
  }

  return { supabase, user, organizationId } as const;
}

async function requireAdminRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    return !!membership && ["owner", "admin"].includes(membership.role);
  } catch {
    return false;
  }
}

// ── GET /api/brain/circuit-breaker ───────────────────────────────────────────

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, organizationId } = auth;

  try {
    // Fetch circuit breaker status with per-org override awareness
    const { broken, status } = await getGloballyBrokenDomains(supabase, organizationId);

    // Load which domains this org has explicitly bypassed
    const overrides: string[] = [];
    try {
      const { data: overrideRows } = await supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", organizationId)
        .eq("domain", "brain-config")
        .eq("memory_type", "circuit-breaker-override");

      if (overrideRows?.length) {
        for (const row of overrideRows) {
          try {
            const parsed = JSON.parse(row.content as string) as {
              domain?: string;
              action?: string;
            };
            if (parsed.domain && parsed.action === "bypass") {
              overrides.push(parsed.domain);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      broken,
      status: status as CircuitBreakerStatus[],
      overrides,
    });
  } catch (err) {
    logger.warn("[circuit-breaker GET] Error", {
      orgId: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/brain/circuit-breaker ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user, organizationId } = auth;

  // Only org owners and admins may add/remove circuit breaker overrides
  const isAdmin = await requireAdminRole(supabase, user.id, organizationId);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Insufficient permissions — owner or admin role required" },
      { status: 403 }
    );
  }

  // Parse and validate body
  let body: { domain?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { domain, action } = body;

  if (!domain || typeof domain !== "string" || domain.trim() === "") {
    return NextResponse.json(
      { error: "'domain' is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (action !== "bypass" && action !== "restore") {
    return NextResponse.json(
      { error: "'action' must be 'bypass' or 'restore'" },
      { status: 400 }
    );
  }

  const trimmedDomain = domain.trim();

  if (action === "bypass") {
    // Upsert a bypass override for this domain in this org
    // onConflict won't work well without unique constraint on content; use delete+insert instead
    try {
      // Remove any existing entry for this domain (bypass or restore)
      await supabase
        .from("ai_memory")
        .delete()
        .eq("organization_id", organizationId)
        .eq("domain", "brain-config")
        .eq("memory_type", "circuit-breaker-override")
        .ilike("content", `%"domain":"${trimmedDomain}"%`);
    } catch { /* non-fatal — continue to insert */ }

    const { error: insertErr } = await supabase.from("ai_memory").insert({
      organization_id: organizationId,
      domain: "brain-config",
      memory_type: "circuit-breaker-override",
      content: JSON.stringify({ domain: trimmedDomain, action: "bypass", setAt: new Date().toISOString() }),
      importance: 1.0,
    });

    if (insertErr) {
      logger.warn("[circuit-breaker POST] Failed to insert bypass override", {
        orgId: organizationId,
        domain: trimmedDomain,
        error: insertErr.message,
      });
      return NextResponse.json({ error: "Failed to save override" }, { status: 500 });
    }

    logger.warn("[circuit-breaker POST] Bypass override added", {
      orgId: organizationId,
      domain: trimmedDomain,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      action: "bypass",
      domain: trimmedDomain,
      message: `Domain '${trimmedDomain}' bypassed for this AI worker space. It will not be excluded by the global circuit breaker.`,
    });
  }

  // action === "restore" — remove any bypass for this domain
  const { error: deleteErr } = await supabase
    .from("ai_memory")
    .delete()
    .eq("organization_id", organizationId)
    .eq("domain", "brain-config")
    .eq("memory_type", "circuit-breaker-override")
    .ilike("content", `%"domain":"${trimmedDomain}"%`);

  if (deleteErr) {
    logger.warn("[circuit-breaker POST] Failed to delete override", {
      orgId: organizationId,
      domain: trimmedDomain,
      error: deleteErr.message,
    });
    return NextResponse.json({ error: "Failed to remove override" }, { status: 500 });
  }

  logger.warn("[circuit-breaker POST] Bypass override removed", {
    orgId: organizationId,
    domain: trimmedDomain,
    updatedBy: user.id,
  });

  return NextResponse.json({
    success: true,
    action: "restore",
    domain: trimmedDomain,
    message: `Domain '${trimmedDomain}' restored to global circuit breaker. It will be excluded if >10 failures occur fleet-wide.`,
  });
}
