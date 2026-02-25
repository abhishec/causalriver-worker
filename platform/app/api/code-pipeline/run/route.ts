export const dynamic = "force-dynamic";
/**
 * Code Pipeline API
 *
 * POST /api/code-pipeline/run
 *   Trigger a code fix pipeline run for a detected issue.
 *   Body: { issue: CodeIssue, dryRun?: boolean, repository?: string }
 *   Auth: Admin or platform admin
 *
 * GET /api/code-pipeline/run?organizationId=X
 *   Get active and recent pipeline runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import {
  runCodePipeline,
  getActivePipelineRuns,
  getPipelineHistory,
} from "@/lib/code-pipeline/pipeline";
import type { CodeIssue } from "@/lib/code-pipeline/pipeline";
import { logger } from "@/lib/logger";

const VALID_ISSUE_TYPES = ["tech_debt", "vulnerability", "test_coverage", "performance", "lint"];
const VALID_SEVERITIES = ["critical", "high", "medium", "low"];
const VALID_SOURCES = ["health_monitor", "ci_failure", "agent_detection", "user_request"];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      issue,
      dryRun = true,
      repository,
      organizationId,
    } = body as {
      issue: CodeIssue;
      dryRun?: boolean;
      repository?: string;
      organizationId?: string;
    };

    const workspaceId = organizationId || await getCurrentWorkspaceId();

    // Validate issue
    if (!issue || !issue.type || !issue.description) {
      return NextResponse.json(
        { error: "Issue must have type and description" },
        { status: 400 },
      );
    }

    if (!VALID_ISSUE_TYPES.includes(issue.type)) {
      return NextResponse.json(
        { error: `Invalid issue type. Must be: ${VALID_ISSUE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (!VALID_SEVERITIES.includes(issue.severity || "")) {
      issue.severity = "medium"; // Default
    }

    if (!VALID_SOURCES.includes(issue.source || "")) {
      issue.source = "user_request"; // Default
    }

    // Verify admin role
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    const isAdmin = membership?.role === "admin" || membership?.role === "owner" || membership?.is_platform_admin;
    if (!membership && !isAdmin) {
      // Check platform admin
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .maybeSingle();

      if (!admin) {
        return NextResponse.json(
          { error: "Admin access required to trigger code pipeline" },
          { status: 403 },
        );
      }
    }

    // Run pipeline
    const result = await runCodePipeline(supabase, issue, workspaceId, user.id, {
      dryRun,
      repository,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error("[CodePipelineAPI] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();

    const [active, history] = await Promise.all([
      getActivePipelineRuns(supabase, workspaceId),
      getPipelineHistory(supabase, workspaceId, 10),
    ]);

    return NextResponse.json({
      active,
      history,
      organization_id: workspaceId,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
