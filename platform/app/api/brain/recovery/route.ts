/**
 * Brain Recovery API
 * ==================
 *
 * POST /api/brain/recovery
 *   Manually trigger Recovery Agent for a failed or empty job.
 *   Useful for the UI "Retry with AI assistance" button.
 *
 * Request body:
 *   {
 *     jobId: string,    // agent_queue job ID to recover
 *     force?: boolean   // if true, attempt recovery even if job status is 'success'
 *   }
 *
 * Response: RecoveryResult
 *   {
 *     recovered: boolean,
 *     strategy: 'alternative-domain' | 'simplified-query' | 'graceful-degradation',
 *     result?: unknown,
 *     explanation: string,
 *     alternativeDomain?: string,
 *     attemptsCount: number,
 *   }
 *
 * Auth: Requires authenticated user who is a member of the job's organization.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { attemptRecovery } from "@/lib/brain/recovery-agent";

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
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

    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { jobId, force } = body as { jobId?: string; force?: boolean };

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { error: "jobId is required and must be a string" },
        { status: 400 }
      );
    }

    // ── Fetch the job ─────────────────────────────────────────────────────
    const admin = getAdminClient();

    const { data: job, error: jobError } = await admin
      .from("agent_queue")
      .select("id, organization_id, task_type, payload, status, error_message, result")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      logger.error("[POST /api/brain/recovery] DB error fetching job:", jobError);
      return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── Ownership check — job must belong to the user's workspace ─────────
    if (job.organization_id !== workspaceId) {
      return NextResponse.json({ error: "Forbidden — job belongs to a different workspace" }, { status: 403 });
    }

    // ── Guard: only recover failed or empty jobs (unless force=true) ──────
    const jobStatus = job.status as string;
    const isRecoverable =
      jobStatus === "error" ||
      jobStatus === "failed" ||
      jobStatus === "pending"; // stuck pending

    // Check if the successful job had an empty result (still worth recovering)
    const resultStr = JSON.stringify(job.result ?? {});
    const hadEmptyResult =
      jobStatus === "success" &&
      (resultStr === "{}" || resultStr === "[]" || resultStr.length < 30);

    if (!isRecoverable && !hadEmptyResult && !force) {
      return NextResponse.json(
        {
          error: `Job status is '${jobStatus}' — only failed or empty-result jobs can be recovered. Pass force=true to override.`,
          currentStatus: jobStatus,
        },
        { status: 409 }
      );
    }

    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const failureReason = job.error_message ?? (hadEmptyResult ? "empty result" : "unknown failure");

    logger.warn(
      `[POST /api/brain/recovery] Triggering recovery: job=${jobId} domain=${job.task_type} ` +
      `status=${jobStatus} force=${!!force}`
    );

    // ── Trigger recovery agent ────────────────────────────────────────────
    const recoveryResult = await attemptRecovery({
      jobId,
      originalDomain: job.task_type as string,
      originalPayload: payload,
      failureReason,
      orgId: workspaceId,
      emptyResult: hadEmptyResult,
      supabase: admin,
    });

    // ── If recovery succeeded, update the job status ──────────────────────
    if (recoveryResult.recovered && recoveryResult.result) {
      try {
        await admin
          .from("agent_queue")
          .update({
            status: "success",
            result: {
              ...(recoveryResult.result as Record<string, unknown>),
              _recoveryMeta: {
                recoveredAt: new Date().toISOString(),
                strategy: recoveryResult.strategy,
                alternativeDomain: recoveryResult.alternativeDomain ?? null,
                attemptsCount: recoveryResult.attemptsCount,
                triggeredBy: user.id,
              },
            },
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", jobId);
      } catch (updateErr: any) {
        // Non-fatal — return the recovery result even if the status update fails
        logger.warn("[POST /api/brain/recovery] Failed to update job status after recovery:", updateErr?.message);
      }
    }

    return NextResponse.json({
      jobId,
      originalDomain: job.task_type,
      previousStatus: jobStatus,
      ...recoveryResult,
    });
  } catch (err: any) {
    logger.error("[POST /api/brain/recovery] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET: Check recovery eligibility for a job ─────────────────────────────

export async function GET(req: NextRequest) {
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

    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId query param required" }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: job, error: jobError } = await admin
      .from("agent_queue")
      .select("id, organization_id, task_type, status, error_message, result, created_at, completed_at")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.organization_id !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resultStr = JSON.stringify(job.result ?? {});
    const hadEmptyResult =
      job.status === "success" &&
      (resultStr === "{}" || resultStr === "[]" || resultStr.length < 30);

    const isRecoverable =
      job.status === "error" ||
      job.status === "failed" ||
      job.status === "pending" ||
      hadEmptyResult;

    // Find applicable strategies from the manifest
    const { findApplicableStrategies, getDomainCapability, getAlternativeDomains } =
      await import("@/lib/brain/capabilities-manifest");

    const domainCap = getDomainCapability(job.task_type as string);
    const strategies = findApplicableStrategies(
      job.task_type as string,
      job.error_message ?? (hadEmptyResult ? "empty result" : "")
    );
    const alternatives = getAlternativeDomains(job.task_type as string);

    return NextResponse.json({
      jobId,
      domain: job.task_type,
      status: job.status,
      isRecoverable,
      hadEmptyResult,
      errorMessage: job.error_message ?? null,
      domainCapability: domainCap
        ? {
            name: domainCap.name,
            description: domainCap.description,
            failureModes: domainCap.failureModes,
          }
        : null,
      applicableStrategies: strategies.map(s => ({
        id: s.id,
        description: s.description,
        action: s.action,
        targetDomain: s.targetDomain ?? null,
        confidence: s.baseConfidence,
      })),
      alternativeDomains: alternatives.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
      })),
    });
  } catch (err: any) {
    logger.error("[GET /api/brain/recovery] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
