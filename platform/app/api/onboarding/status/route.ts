/**
 * GET /api/onboarding/status
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enterprise onboarding checklist status.
 *
 * Returns the completion state of each onboarding step for the current org.
 * Designed to power an onboarding progress UI and customer-success dashboards.
 *
 * Response 200:
 *   {
 *     steps: OnboardingStep[],
 *     completionPct: number,        // 0-100
 *     isComplete: boolean,
 *     nextStep: OnboardingStep | null  // first incomplete step
 *   }
 *
 * Steps:
 *   has_connectors     — at least one org_connector row for this org
 *   has_agents         — at least one agent_queue or se_aas_artifacts row
 *   has_engagements    — at least one engagement in engagements table
 *   has_members        — more than one org_member (i.e. team, not solo)
 *   brain_activated    — ai_worker_config row exists and is_core_brain is set
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  ctaUrl?: string;       // where to navigate to complete this step
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEP_DEFS: Array<{
  id: string;
  label: string;
  description: string;
  ctaUrl: string;
}> = [
  {
    id: "has_connectors",
    label: "Connect your tools",
    description: "Connect at least one data source (GitHub, Jira, Slack, etc.) to power delivery intelligence.",
    ctaUrl: "/connectors",
  },
  {
    id: "has_engagements",
    label: "Create an engagement",
    description: "Add your first client engagement so BrainOS can track delivery health.",
    ctaUrl: "/se-aas",
  },
  {
    id: "has_members",
    label: "Invite your team",
    description: "Invite team members to your AI worker space for collaborative delivery management.",
    ctaUrl: "/settings",
  },
  {
    id: "has_agents",
    label: "Run your first agent",
    description: "Trigger a delivery intelligence agent to generate your first insights.",
    ctaUrl: "/agents",
  },
  {
    id: "brain_activated",
    label: "Activate the Brain",
    description: "The Brain context mesh aggregates signals from all domains. It activates automatically after your first agent run.",
    ctaUrl: "/brain",
  },
];

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentWorkspaceId();
    if (!orgId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // ── Query all step conditions in parallel ─────────────────────────────
    const [
      connectorsResult,
      engagementsResult,
      membersResult,
      agentsResult,
      brainResult,
    ] = await Promise.all([
      // has_connectors: any active connector for this org
      supabase
        .from("org_connectors")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .limit(1),

      // has_engagements: any engagement row
      supabase
        .from("engagements")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .limit(1),

      // has_members: more than 1 org member (team, not solo)
      supabase
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .limit(2),

      // has_agents: any agent ever queued for this org
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .limit(1),

      // brain_activated: ai_worker_config exists
      supabase
        .from("ai_worker_config")
        .select("organization_id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .limit(1),
    ]);

    // ── Evaluate each step ────────────────────────────────────────────────
    const completionMap: Record<string, boolean> = {
      has_connectors: (connectorsResult.count ?? 0) > 0,
      has_engagements: (engagementsResult.count ?? 0) > 0,
      // "has team" = more than 1 member
      has_members: (membersResult.count ?? 0) > 1,
      has_agents: (agentsResult.count ?? 0) > 0,
      brain_activated: (brainResult.count ?? 0) > 0,
    };

    // ── Build response ────────────────────────────────────────────────────
    const steps: OnboardingStep[] = STEP_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      complete: completionMap[def.id] ?? false,
      ctaUrl: def.ctaUrl,
    }));

    const completedCount = steps.filter((s) => s.complete).length;
    const completionPct = Math.round((completedCount / steps.length) * 100);
    const isComplete = completedCount === steps.length;
    const nextStep = steps.find((s) => !s.complete) ?? null;

    return NextResponse.json({
      steps,
      completionPct,
      isComplete,
      nextStep,
    });
  } catch (err: unknown) {
    logger.error("[onboarding/status] Unexpected error:", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/onboarding/status",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
