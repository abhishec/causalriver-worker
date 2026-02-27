/**
 * POST /api/brain/kill-switch
 * ===========================
 * Emergency stop for rogue agents.
 *
 * Three scopes:
 *   job    — cancel a single job (caller must be org member who owns the job)
 *   org    — cancel ALL pending/running/blocked jobs for the org (admin/owner only)
 *   domain — cancel all pending/running/blocked jobs for a specific domain
 *            (admin/owner only)
 *
 * POST body:
 * {
 *   scope: 'job' | 'org' | 'domain';
 *   jobId?: string;          // required when scope='job'
 *   organizationId?: string; // required when scope='org' or 'domain'
 *   domain?: string;         // required when scope='domain'
 *   reason: string;          // written to error_message + decision log
 * }
 *
 * GET /api/brain/kill-switch
 * ==========================
 * Returns the last 10 kill-switch events from brain_decision_log
 * (decision_type='policy_blocked' where input_context contains a 'scope' key).
 *
 * Auth: org membership required for GET. POST rules per scope above.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logDecision } from "@/lib/brain/decision-log";
import { logger } from "@/lib/logger";

// Statuses that an active job can be in — these are eligible for cancellation
const CANCELLABLE_STATUSES = ["pending", "running", "blocked"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared auth helper — returns { user, admin } or a 401/403 response
// ─────────────────────────────────────────────────────────────────────────────

async function getAuthContext(): Promise<
  | { ok: true; user: { id: string }; admin: ReturnType<typeof getAdminClient> }
  | { ok: false; response: NextResponse }
> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true, user, admin };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — kill switch trigger
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { user, admin } = auth;

  // ── Parse & validate body ──────────────────────────────────────────────────
  let body: {
    scope?: string;
    jobId?: string;
    organizationId?: string;
    domain?: string;
    reason?: string;
  } = {};

  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scope, jobId, organizationId: bodyOrgId, domain, reason } = body;

  if (!scope || !["job", "org", "domain"].includes(scope)) {
    return NextResponse.json(
      { error: "scope must be 'job', 'org', or 'domain'" },
      { status: 400 }
    );
  }

  if (!reason || reason.trim().length === 0) {
    return NextResponse.json(
      { error: "reason is required for audit trail" },
      { status: 400 }
    );
  }

  if (scope === "job" && !jobId) {
    return NextResponse.json({ error: "jobId is required when scope='job'" }, { status: 400 });
  }

  if ((scope === "org" || scope === "domain") && !bodyOrgId) {
    return NextResponse.json(
      { error: "organizationId is required when scope='org' or 'domain'" },
      { status: 400 }
    );
  }

  if (scope === "domain" && !domain) {
    return NextResponse.json({ error: "domain is required when scope='domain'" }, { status: 400 });
  }

  const killedAt = new Date().toISOString();

  try {
    // ── scope = 'job' ─────────────────────────────────────────────────────────
    if (scope === "job") {
      // Resolve org from job — caller must be a member of the owning org
      const { data: job, error: jobErr } = await admin
        .from("agent_queue")
        .select("id, organization_id, status, agent_type")
        .eq("id", jobId!)
        .maybeSingle();

      if (jobErr || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      // Verify caller is a member of the job's org
      const membership = await verifyWorkspaceMembership(user.id, job.organization_id);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Update only if the job is in a cancellable state
      const { data: updated, error: updateErr } = await admin
        .from("agent_queue")
        .update({
          status: "cancelled",
          error_message: `Killed by user ${user.id}: ${reason}`,
          completed_at: killedAt,
        })
        .eq("id", jobId!)
        .eq("organization_id", job.organization_id)
        .in("status", [...CANCELLABLE_STATUSES])
        .select("id");

      if (updateErr) {
        logger.error("[kill-switch] Failed to cancel job", {
          jobId,
          error: updateErr.message,
        });
        return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
      }

      const cancelledCount = (updated ?? []).length;

      // Audit log — fire-and-forget
      void logDecision(admin, {
        organizationId: job.organization_id,
        decisionType: "policy_blocked",
        inputContext: { scope, reason, jobId, domain: job.agent_type },
        decisionMade: { action: "kill_switch", cancelledCount },
        rationale: reason,
        userId: user.id,
      });

      logger.warn("[kill-switch] Job cancelled", {
        jobId,
        cancelledCount,
        userId: user.id,
        orgId: job.organization_id,
        reason,
      });

      return NextResponse.json({
        cancelled: cancelledCount,
        scope,
        reason,
        killedAt,
        ...(cancelledCount === 0
          ? { note: "Job was not in a cancellable state (pending/running/blocked)" }
          : {}),
      });
    }

    // ── scope = 'org' or 'domain' ─────────────────────────────────────────────
    const orgId = bodyOrgId!;

    // Verify caller is admin or owner of this org
    const membership = await verifyWorkspaceMembership(user.id, orgId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdminOrOwner =
      membership.role === "owner" ||
      membership.role === "admin" ||
      membership.is_platform_admin;

    if (!isAdminOrOwner) {
      return NextResponse.json(
        { error: "Forbidden — org or domain kill switch requires admin or owner role" },
        { status: 403 }
      );
    }

    if (scope === "org") {
      // Cancel ALL non-completed jobs for the entire org
      const { data: updated, error: updateErr } = await admin
        .from("agent_queue")
        .update({
          status: "cancelled",
          error_message: `Org kill switch by ${user.id}: ${reason}`,
          completed_at: killedAt,
        })
        .eq("organization_id", orgId)
        .in("status", [...CANCELLABLE_STATUSES])
        .select("id");

      if (updateErr) {
        logger.error("[kill-switch] Failed org-wide cancel", {
          orgId,
          error: updateErr.message,
        });
        return NextResponse.json({ error: "Failed to cancel org jobs" }, { status: 500 });
      }

      const cancelledCount = (updated ?? []).length;

      void logDecision(admin, {
        organizationId: orgId,
        decisionType: "policy_blocked",
        inputContext: { scope, reason, organizationId: orgId },
        decisionMade: { action: "kill_switch", cancelledCount },
        rationale: reason,
        userId: user.id,
      });

      logger.warn("[kill-switch] Org-wide kill switch activated", {
        orgId,
        cancelledCount,
        userId: user.id,
        reason,
      });

      return NextResponse.json({ cancelled: cancelledCount, scope, reason, killedAt });
    }

    // scope === 'domain'
    const { data: updated, error: updateErr } = await admin
      .from("agent_queue")
      .update({
        status: "cancelled",
        error_message: `Domain kill switch (${domain}) by ${user.id}: ${reason}`,
        completed_at: killedAt,
      })
      .eq("organization_id", orgId)
      .eq("agent_type", domain!)
      .in("status", [...CANCELLABLE_STATUSES])
      .select("id");

    if (updateErr) {
      logger.error("[kill-switch] Failed domain cancel", {
        orgId,
        domain,
        error: updateErr.message,
      });
      return NextResponse.json({ error: "Failed to cancel domain jobs" }, { status: 500 });
    }

    const cancelledCount = (updated ?? []).length;

    void logDecision(admin, {
      organizationId: orgId,
      decisionType: "policy_blocked",
      inputContext: { scope, reason, organizationId: orgId, domain },
      decisionMade: { action: "kill_switch", cancelledCount },
      rationale: reason,
      userId: user.id,
    });

    logger.warn("[kill-switch] Domain kill switch activated", {
      orgId,
      domain,
      cancelledCount,
      userId: user.id,
      reason,
    });

    return NextResponse.json({ cancelled: cancelledCount, scope, reason, killedAt });
  } catch (err) {
    logger.error("[kill-switch] Unexpected error", {
      error: (err as Error)?.message ?? String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — kill switch history
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { user, admin } = auth;

  try {
    // Resolve org: accept explicit ?orgId param or fall back to workspace cookie
    const url = request.nextUrl;
    const requestedOrgId = url.searchParams.get("orgId");

    let organizationId: string | null = null;

    if (requestedOrgId) {
      const membership = await verifyWorkspaceMembership(user.id, requestedOrgId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      organizationId = requestedOrgId;
    } else {
      organizationId = (await getCurrentWorkspaceId()) || null;
      if (organizationId) {
        const membership = await verifyWorkspaceMembership(user.id, organizationId);
        if (!membership) organizationId = null;
      }
    }

    if (!organizationId) {
      return NextResponse.json({ history: [] });
    }

    // Query brain_decision_log for kill-switch events.
    // Filter: decision_type='policy_blocked'. Post-filter in JS to only return
    // rows where input_context contains a 'scope' key (kill-switch events),
    // distinguishing them from other policy_blocked entries (e.g. PolicyEnforcer).
    const { data: raw, error } = await admin
      .from("brain_decision_log")
      .select(
        "id, created_at, decision_type, input_context, decision_made, rationale, user_id"
      )
      .eq("organization_id", organizationId)
      .eq("decision_type", "policy_blocked")
      .order("created_at", { ascending: false })
      .limit(50); // over-fetch so post-filter can return 10

    if (error) {
      logger.warn("[kill-switch] History query failed", { error: error.message });
      return NextResponse.json({ history: [] });
    }

    // Post-filter: keep only rows written by kill switch (have a 'scope' key)
    const history = (raw ?? [])
      .filter(
        (row) =>
          row.input_context !== null &&
          typeof row.input_context === "object" &&
          "scope" in (row.input_context as Record<string, unknown>)
      )
      .slice(0, 10);

    return NextResponse.json({ history });
  } catch (err) {
    logger.warn("[kill-switch] GET unexpected error", {
      error: (err as Error)?.message ?? String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
