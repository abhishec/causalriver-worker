/**
 * Service Health Writer
 * =====================
 * Writes cached health snapshots for each service layer (SE-aaS, AaaS,
 * Process Engine) to the service_health table.
 *
 * The brain reads from service_health (with fallback to direct queries).
 * This decouples brain-context.ts from service-specific domain tables.
 *
 * Called fire-and-forget from process-jobs cron after job processing.
 * Max 20 orgs per call to avoid Lambda timeout.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ── SE-aaS health writer (L26) ────────────────────────────────────────────────

export async function writeSeaasHealth(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const sevenDaysAgo = daysAgoISO(7);

    // Mirror exact queries from brain-context.ts L26 (5 sub-queries):
    // L26a: agent_queue SE-aaS task types last 7d (uses task_type filter, same as brain-context)
    // L26b: scope_creep_alerts unresolved count (acknowledged=false)
    // L26c: engagement_health_latest bottom 3 (includes engagement_name)
    // L26d: engineer_health_snapshots flight_risk_score > 50 (desc order)
    // L26e: pod_match_history latest 3 (recommended_pod_name only)

    const [jobsRow, scopeCreepRow, engHealthRow, engineerRiskRow, podMatchRow] =
      await Promise.all([
        // L26a — SE-aaS jobs: task_type IN [...] last 7d
        supabase
          .from("agent_queue")
          .select("task_type, status")
          .eq("organization_id", orgId)
          .in("task_type", [
            "pr-review",
            "tdd",
            "impact-analysis",
            "early-warning",
            "pod-match",
            "scope-creep",
            "delivery-intelligence",
          ])
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(30),

        // L26b — scope_creep_alerts unresolved count (acknowledged=false)
        supabase
          .from("scope_creep_alerts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("acknowledged", false),

        // L26c — engagement_health_latest bottom 3 health scores
        supabase
          .from("engagement_health_latest")
          .select("engagement_id, engagement_name, health_score")
          .eq("organization_id", orgId)
          .order("health_score", { ascending: true })
          .limit(3),

        // L26d — engineer_health_snapshots flight_risk_score > 50, desc order
        supabase
          .from("engineer_health_snapshots")
          .select("github_login, flight_risk_score")
          .eq("organization_id", orgId)
          .gt("flight_risk_score", 50)
          .order("flight_risk_score", { ascending: false })
          .limit(3),

        // L26e — pod_match_history latest 3
        supabase
          .from("pod_match_history")
          .select("recommended_pod_name")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

    const parts: string[] = [];

    // L26a: Job activity by domain (mirrors brain-context.ts assembly logic)
    if (jobsRow.data && jobsRow.data.length > 0) {
      const byDomain: Record<string, { total: number; success: number; error: number }> = {};
      for (const row of jobsRow.data as Array<{ task_type: string; status: string }>) {
        const d = row.task_type ?? "unknown";
        if (!byDomain[d]) byDomain[d] = { total: 0, success: 0, error: 0 };
        byDomain[d].total++;
        if (row.status === "success") byDomain[d].success++;
        if (row.status === "error") byDomain[d].error++;
      }
      const jobSummary = Object.entries(byDomain)
        .map(([d, c]) => `${d}:${c.total}r/${c.success}ok`)
        .join(", ");
      parts.push(`Jobs(7d): ${jobSummary}`);
    }

    // L26b: Scope creep count
    const scopeCount = scopeCreepRow.count ?? 0;
    parts.push(`Open scope alerts: ${scopeCount}`);

    // L26c: Critical engagements (low health)
    if (engHealthRow.data && engHealthRow.data.length > 0) {
      const engList = (
        engHealthRow.data as Array<{
          engagement_id: string;
          engagement_name: string | null;
          health_score: number;
        }>
      )
        .map(
          (e) =>
            `${e.engagement_name ?? e.engagement_id}: ${Math.round(e.health_score)}`
        )
        .join(", ");
      parts.push(`Critical engagements: ${engList}`);
    }

    // L26d: Flight risk engineers
    if (engineerRiskRow.data && engineerRiskRow.data.length > 0) {
      const riskList = (
        engineerRiskRow.data as Array<{
          github_login: string;
          flight_risk_score: number;
        }>
      )
        .map((e) => `${e.github_login}: ${Math.round(e.flight_risk_score)}%`)
        .join(", ");
      parts.push(`Engineer risk: ${riskList}`);
    }

    // L26e: Pod matches
    if (podMatchRow.data && podMatchRow.data.length > 0) {
      const podList = (
        podMatchRow.data as Array<{ recommended_pod_name: string | null }>
      )
        .map((m) => m.recommended_pod_name ?? "")
        .filter((n) => n.length > 0)
        .join(", ");
      if (podList) parts.push(`Pod matches: ${podList}`);
    }

    const contextString =
      parts.length > 0
        ? `## SE-aaS Service Layer\n${parts.join(" | ")}`.slice(0, 400)
        : "";

    // Supabase JS accepts any table name at runtime regardless of generated types
    await supabase
      .from("service_health" as string)
      .upsert(
        {
          organization_id: orgId,
          service_type: "se-aas",
          summary: {
            jobCount: jobsRow.data?.length ?? 0,
            scopeAlerts: scopeCount,
            criticalEngagements: engHealthRow.data?.length ?? 0,
            flightRiskEngineers: engineerRiskRow.data?.length ?? 0,
          },
          context_string: contextString,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,service_type" }
      );
  } catch (err) {
    logger.warn("[ServiceHealthWriter] writeSeaasHealth failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
  }
}

// ── AaaS health writer (L27) ──────────────────────────────────────────────────

export async function writeAaasHealth(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const sevenDaysAgo = daysAgoISO(7);
    const oneDayAgo = hoursAgoISO(24);

    // Mirror exact queries from brain-context.ts L27 (2 sub-queries):
    // L27a: se_aas_artifacts last 24h domain_type
    // L27b: agent_queue agent_type=aas last 7d status

    const [artifactsRow, agentQueueRow] = await Promise.all([
      supabase
        .from("se_aas_artifacts")
        .select("domain_type, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", oneDayAgo)
        .limit(50),

      supabase
        .from("agent_queue")
        .select("status")
        .eq("organization_id", orgId)
        .eq("agent_type", "aas")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const parts: string[] = [];

    if (artifactsRow.data && artifactsRow.data.length > 0) {
      const domainCounts: Record<string, number> = {};
      for (const row of artifactsRow.data as Array<{ domain_type: string }>) {
        const d = row.domain_type ?? "unknown";
        domainCounts[d] = (domainCounts[d] ?? 0) + 1;
      }
      const summary = Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([d, c]) => `${d}:${c}`)
        .join(", ");
      parts.push(`Artifacts(24h): ${summary}`);
    }

    if (agentQueueRow.data && agentQueueRow.data.length > 0) {
      const statusCounts: Record<string, number> = {};
      for (const row of agentQueueRow.data as Array<{ status: string }>) {
        const s = row.status ?? "unknown";
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      }
      const succeeded = statusCounts["success"] ?? 0;
      const failed = statusCounts["error"] ?? 0;
      const running = statusCounts["running"] ?? 0;
      parts.push(`Agents(7d): ${succeeded} succeeded, ${failed} failed, ${running} running`);
    }

    const contextString =
      parts.length > 0
        ? `## AaaS Service Layer\n${parts.join(" | ")}`.slice(0, 250)
        : "";

    // Supabase JS accepts any table name at runtime regardless of generated types
    await supabase
      .from("service_health" as string)
      .upsert(
        {
          organization_id: orgId,
          service_type: "aas",
          summary: {
            artifactCount24h: artifactsRow.data?.length ?? 0,
            agentCount7d: agentQueueRow.data?.length ?? 0,
          },
          context_string: contextString,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,service_type" }
      );
  } catch (err) {
    logger.warn("[ServiceHealthWriter] writeAaasHealth failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
  }
}

// ── Process Engine health writer (L28) ────────────────────────────────────────

export async function writeProcessEngineHealth(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const sevenDaysAgo = daysAgoISO(7);

    // Mirror exact queries from brain-context.ts L28 (2 sub-queries):
    // L28a: bpaas_process_instances current_state+status last 7d
    // L28b: agent_queue agent_type=bpaas task_type+status last 7d

    const [instancesRow, bpaasJobsRow, stateSignalsRow, topTemplatesRow] = await Promise.all([
      supabase
        .from("bpaas_process_instances")
        .select("current_state, status, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("agent_queue")
        .select("task_type, status, created_at")
        .eq("organization_id", orgId)
        .eq("agent_type", "bpaas")
        .gte("created_at", sevenDaysAgo)
        .limit(20),

      // L28c: State-level RL signals from cross_domain_signals (Phase 5)
      supabase
        .from("cross_domain_signals")
        .select("signal_metadata, signal_type, source_domain, signal_value")
        .eq("organization_id", orgId)
        .like("source_domain", "process.%")
        .gte("signal_timestamp", sevenDaysAgo)
        .limit(100),

      // L28d: Top 3 templates by fitness_score (Phase 7 — AlphaEvolve)
      supabase
        .from("process_templates")
        .select("name, fitness_score, success_rate")
        .eq("organization_id", orgId)
        .not("fitness_score", "is", null)
        .order("fitness_score", { ascending: false })
        .limit(3),
    ]);

    // Parse state patterns: per processType+state, what is the fail rate?
    const stateStats: Record<string, { total: number; failures: number }> = {};

    if (stateSignalsRow.data) {
      for (const signal of stateSignalsRow.data as Array<{
        source_domain: string;
        signal_type: string;
        signal_value: number | null;
      }>) {
        const domain = signal.source_domain;
        if (!domain?.startsWith("process.")) continue;
        // domain format: process.TYPE.STATE
        const parts_domain = domain.split(".");
        if (parts_domain.length < 3) continue;
        const key = `${parts_domain[1]}.${parts_domain[2]}`; // TYPE.STATE
        const stats = stateStats[key] ?? { total: 0, failures: 0 };
        stats.total++;
        if (signal.signal_type === "gaba" || (typeof signal.signal_value === "number" && signal.signal_value < 0)) {
          stats.failures++;
        }
        stateStats[key] = stats;
      }
    }

    // Build statePatterns array for summary JSONB
    const statePatterns = Object.entries(stateStats)
      .filter(([, s]) => s.total >= 3) // only meaningful patterns
      .map(([key, s]) => {
        const [processType, state] = key.split(".");
        return {
          processType,
          state,
          failRate: s.total > 0 ? s.failures / s.total : 0,
          sampleSize: s.total,
        };
      });

    const parts: string[] = [];

    if (instancesRow.data && instancesRow.data.length > 0) {
      // Aggregate by status (mirrors brain-context.ts L28 assembly)
      const statusCounts: Record<string, number> = {};
      for (const inst of instancesRow.data as Array<{
        current_state: string;
        status: string;
      }>) {
        const s = inst.status ?? "unknown";
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      }
      const statusSummary = Object.entries(statusCounts)
        .map(([s, n]) => `${n} ${s}`)
        .join(", ");
      if (statusSummary) parts.push(`Status(7d): ${statusSummary}`);
    }

    if (bpaasJobsRow.data && bpaasJobsRow.data.length > 0) {
      // Aggregate by template type (mirrors brain-context.ts L28 assembly)
      const templateCounts: Record<string, number> = {};
      for (const job of bpaasJobsRow.data as Array<{ task_type: string }>) {
        const t = job.task_type ?? "unknown";
        templateCounts[t] = (templateCounts[t] ?? 0) + 1;
      }
      const templateSummary = Object.entries(templateCounts)
        .map(([t, n]) => `${t}×${n}`)
        .join(", ");
      if (templateSummary) parts.push(`Templates: ${templateSummary}`);
    }

    // Add pattern summary to context_string
    if (statePatterns.length > 0) {
      const patternSummary = statePatterns
        .filter((p) => p.failRate > 0.3)
        .map((p) => `${p.processType} ${p.state} ${Math.round(p.failRate * 100)}% fail`)
        .join(" | ");
      if (patternSummary) parts.push(`Process patterns: ${patternSummary}`);
    }

    // L28d: Top templates by AlphaEvolve fitness score (Phase 7)
    if (topTemplatesRow.data && topTemplatesRow.data.length > 0) {
      const topTemplateList = (
        topTemplatesRow.data as Array<{
          name: string;
          fitness_score: number | null;
          success_rate: number;
        }>
      )
        .map((t) => {
          // Shorten the template name for compactness (strip success% suffix if present)
          const shortName = t.name.replace(/\s*\(\d+%\s+success\)\s*$/, "").trim();
          const fitness = t.fitness_score !== null ? t.fitness_score.toFixed(2) : "?";
          return `${shortName}(${fitness})`;
        })
        .join(", ");
      if (topTemplateList) parts.push(`Top templates: ${topTemplateList}`);
    }

    const contextString =
      parts.length > 0
        ? `## Process Engine (L28)\n${parts.join(" | ")}`.slice(0, 300)
        : "";

    // Supabase JS accepts any table name at runtime regardless of generated types
    await supabase
      .from("service_health" as string)
      .upsert(
        {
          organization_id: orgId,
          service_type: "pm-aas",
          summary: {
            processCount7d: instancesRow.data?.length ?? 0,
            jobCount7d: bpaasJobsRow.data?.length ?? 0,
            statePatterns, // Now populated with actual signal data
          },
          context_string: contextString,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,service_type" }
      );
  } catch (err) {
    logger.warn(
      "[ServiceHealthWriter] writeProcessEngineHealth failed (non-fatal)",
      {
        error: err instanceof Error ? err.message : String(err),
        orgId,
      }
    );
  }
}

// ── Batch writer for all active orgs ─────────────────────────────────────────

/**
 * Write health data for all orgs that have had agent activity recently.
 * Called fire-and-forget from process-jobs cron.
 * Capped at 20 orgs to stay within Lambda timeout.
 */
export async function writeAllServiceHealth(
  supabase: SupabaseClient
): Promise<{ orgsProcessed: number }> {
  try {
    // Find active orgs from last 24h of agent_queue activity
    const oneDayAgo = hoursAgoISO(24);
    const { data: activeOrgs } = await supabase
      .from("agent_queue")
      .select("organization_id")
      .gte("created_at", oneDayAgo)
      .limit(20);

    if (!activeOrgs || activeOrgs.length === 0) return { orgsProcessed: 0 };

    // Deduplicate org IDs
    const uniqueOrgIds = [
      ...new Set(
        (activeOrgs as Array<{ organization_id: string }>).map(
          (r) => r.organization_id
        )
      ),
    ].slice(0, 20);

    // Write health for each org — all 3 services — fire and forget per org
    for (const orgId of uniqueOrgIds) {
      writeSeaasHealth(supabase, orgId).catch((e: unknown) =>
        logger.warn("[ServiceHealth] org write failed (se-aas)", { orgId, error: String(e) })
      );
      writeAaasHealth(supabase, orgId).catch((e: unknown) =>
        logger.warn("[ServiceHealth] org write failed (aas)", { orgId, error: String(e) })
      );
      writeProcessEngineHealth(supabase, orgId).catch((e: unknown) =>
        logger.warn("[ServiceHealth] org write failed (process-engine)", { orgId, error: String(e) })
      );
    }

    return { orgsProcessed: uniqueOrgIds.length };
  } catch (err) {
    logger.warn(
      "[ServiceHealthWriter] writeAllServiceHealth failed (non-fatal)",
      {
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return { orgsProcessed: 0 };
  }
}
