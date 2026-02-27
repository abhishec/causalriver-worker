/**
 * Autonomous Cognitive Planner
 * =============================
 *
 * The proactive self-driving orchestrator for BrainOS.
 * Runs every 30 minutes via the cognitive-cycle cron without human input.
 *
 * Architecture inspired by:
 * - Reflexion (Shinn 2023)  — episodic verbal reflection + memory
 * - CoALA (Sumers 2023)     — working/episodic/semantic memory distinction
 * - Voyager (Wang 2023)     — skill curriculum + self-improvement loop
 * - Generative Agents (Park 2023) — reflection + planning + memory retrieval
 *
 * 5-Phase Loop:
 *   Phase 0 — PRIME     Retrieve past reflections from episodic memory
 *   Phase 1 — ASSESS    Gap detection + RL signal analysis + stuck-domain detection
 *   Phase 2 — PLAN      One Claude Haiku call to decide which domains to run
 *   Phase 3 — EXECUTE   Dedup check + queue jobs to agent_queue
 *   Phase 4 — RECORD    Store this cycle's working memory for next cycle
 *   Phase 5 — REFLECT   (Start of each run) Verbal reflection on prior cycle outcomes
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlannerDecision {
  domain: string;
  priority: "high" | "normal" | "low";
  rationale: string;
}

export interface CognitivePlannerResult {
  cycleId: string;
  decisionsQueued: number;
  decisions: PlannerDecision[];
  coverageGaps: string[];
  poorQualityDomains: string[];
  stuckDomains: string[];
  reflected: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SE_AAS_DOMAINS = [
  "pod-match",
  "early-warning",
  "scope-creep",
  "delivery-intelligence",
  "tdd-code-generator",
  "pr-review",
  "incident-diagnosis",
  "impact-analysis",
  "dead-code-detector",
  "dependency-upgrade",
  "boilerplate-scaffold",
];

const PLANNER_MODEL = "claude-haiku-4-5-20251001";

// ── Reflection Helper ─────────────────────────────────────────────────────────

async function generateReflection(
  anthropic: Anthropic,
  priorDecisions: {
    decisions?: Array<{ domain: string; rationale: string }>;
    cycleId?: string;
  },
  jobs: Array<{ task_type: string; status: string; result: unknown }>,
  successes: number,
  failures: number
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are reflecting on past agent planning decisions for BrainOS.

Planned: ${JSON.stringify(priorDecisions.decisions?.map((d) => d.domain))}
Actual outcomes: ${successes} succeeded, ${failures} failed
Jobs: ${JSON.stringify(jobs.map((j) => ({ type: j.task_type, status: j.status })))}

Write a 2-3 sentence verbal reflection: what worked, what failed, and one specific lesson for next time. Be concrete.`,
        },
      ],
    });

    const firstBlock = response.content[0];
    return firstBlock.type === "text" ? firstBlock.text : "No reflection generated.";
  } catch (err) {
    logger.warn("[CognitivePlanner] generateReflection failed:", err);
    return "Reflection unavailable due to API error.";
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run one full cognitive planning cycle for a single org.
 * Never throws — all errors are caught and logged internally.
 */
export async function runCognitivePlanner(
  supabase: SupabaseClient,
  orgId: string
): Promise<CognitivePlannerResult> {
  const cycleId = crypto.randomUUID();
  const anthropic = new Anthropic();

  // Outer safety net — planners should never crash the cron
  try {
    return await _runCognitivePlannerInner(supabase, orgId, cycleId, anthropic);
  } catch (err) {
    logger.error(`[CognitivePlanner] Fatal error for org=${orgId} cycle=${cycleId}:`, err);
    return {
      cycleId,
      decisionsQueued: 0,
      decisions: [],
      coverageGaps: [],
      poorQualityDomains: [],
      stuckDomains: [],
      reflected: false,
    };
  }
}

// ── Inner Implementation ──────────────────────────────────────────────────────

async function _runCognitivePlannerInner(
  supabase: SupabaseClient,
  orgId: string,
  cycleId: string,
  anthropic: Anthropic
): Promise<CognitivePlannerResult> {
  logger.info(`[CognitivePlanner] Starting cycle=${cycleId} org=${orgId}`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — REFLECT (runs at start, reflects on PRIOR cycle outcomes)
  // Reflexion episodic buffer: bounded verbal reflection on past decisions
  // ══════════════════════════════════════════════════════════════════════════

  let reflected = false;

  try {
    const { data: priorCycle } = await supabase
      .from("ai_memory")
      .select("content, metadata")
      .eq("organization_id", orgId)
      .eq("domain", "cognitive-planner")
      .eq("memory_type", "working")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (priorCycle && !(priorCycle.metadata as Record<string, unknown> | null)?.reflected) {
      let priorDecisions: {
        decisions?: Array<{ domain: string; rationale: string }>;
        cycleId?: string;
      } = {};
      try {
        priorDecisions = JSON.parse(priorCycle.content as string) as typeof priorDecisions;
      } catch {
        logger.warn("[CognitivePlanner] Failed to parse prior cycle content");
      }

      const priorDomains = priorDecisions.decisions?.map((d) => d.domain) ?? [];

      if (priorDomains.length > 0) {
        const { data: priorJobs } = await supabase
          .from("agent_queue")
          .select("task_type, status, result")
          .eq("organization_id", orgId)
          .in("task_type", priorDomains)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

        if (priorJobs && priorJobs.length > 0) {
          const successCount = priorJobs.filter((j) => j.status === "success").length;
          const failCount = priorJobs.filter((j) => j.status === "error").length;

          const reflection = await generateReflection(
            anthropic,
            priorDecisions,
            priorJobs,
            successCount,
            failCount
          );

          // Store as episodic memory (Reflexion episodic buffer, bounded at 10)
          await supabase.from("ai_memory").insert({
            organization_id: orgId,
            domain: "cognitive-planner",
            memory_type: "episodic",
            content: reflection,
            importance: 0.8,
            metadata: {
              cycleId: priorDecisions.cycleId,
              successCount,
              failCount,
            },
          });

          // Mark prior cycle as reflected
          await supabase
            .from("ai_memory")
            .update({
              metadata: {
                ...(priorCycle.metadata as Record<string, unknown> | null ?? {}),
                reflected: true,
              },
            })
            .eq("content", priorCycle.content)
            .eq("organization_id", orgId)
            .eq("memory_type", "working")
            .eq("domain", "cognitive-planner");

          // Bound episodic memory at 10 entries (Reflexion: Ω=3-10)
          const { data: allReflections } = await supabase
            .from("ai_memory")
            .select("id, created_at")
            .eq("organization_id", orgId)
            .eq("domain", "cognitive-planner")
            .eq("memory_type", "episodic")
            .order("created_at", { ascending: false });

          if (allReflections && allReflections.length > 10) {
            const toDelete = allReflections.slice(10).map((r: { id: string }) => r.id);
            await supabase.from("ai_memory").delete().in("id", toDelete);
          }

          reflected = true;
          logger.info(
            `[CognitivePlanner] Reflected on prior cycle: ${successCount} successes, ${failCount} failures`
          );
        }
      }
    }
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 5 (reflect) failed:", err);
    // Non-fatal — continue to planning
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — PRIME (episodic memory retrieval)
  // Read the last 3 planner reflections to inform this cycle
  // ══════════════════════════════════════════════════════════════════════════

  let pastReflectionsText = "No prior planning history.";

  try {
    const { data: pastReflections } = await supabase
      .from("ai_memory")
      .select("content, importance, created_at")
      .eq("organization_id", orgId)
      .eq("domain", "cognitive-planner")
      .eq("memory_type", "episodic")
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3);

    if (pastReflections && pastReflections.length > 0) {
      pastReflectionsText = pastReflections
        .map((r: { content: string }) => r.content)
        .join("\n\n");
    }
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 0 (prime) failed:", err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — ASSESS (gap detection + RL signal)
  // ══════════════════════════════════════════════════════════════════════════

  let coverageGaps: string[] = [...SE_AAS_DOMAINS];
  let poorQualityDomains: string[] = [];
  let goodQualityDomains: string[] = [];
  let stuckDomains: string[] = [];
  let engagementCount: number = 0;

  // 1a. Coverage gaps — what domains haven't run recently (last 6h)
  try {
    const { data: recentJobs } = await supabase
      .from("agent_queue")
      .select("task_type, status, completed_at, created_at")
      .eq("organization_id", orgId)
      .in("status", ["success", "running", "pending"])
      .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    const recentlyRunDomains = new Set((recentJobs ?? []).map((j: { task_type: string }) => j.task_type));
    coverageGaps = SE_AAS_DOMAINS.filter((d) => !recentlyRunDomains.has(d));
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1a (coverage gaps) failed:", err);
  }

  // 1b. RL quality summary — per-domain avg quality over last 24h
  // NOTE: prediction_records uses "confidence" column (not "quality_score")
  try {
    const { data: qualityRows } = await supabase
      .from("prediction_records")
      .select("domain_type, confidence")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    const domainQuality: Record<string, { sum: number; count: number }> = {};
    for (const row of qualityRows ?? []) {
      const domain = (row as { domain_type: string | null }).domain_type ?? "unknown";
      if (!domainQuality[domain]) domainQuality[domain] = { sum: 0, count: 0 };
      domainQuality[domain].sum += (row as { confidence: number | null }).confidence ?? 0;
      domainQuality[domain].count++;
    }

    const domainAvgQuality: Record<string, number> = {};
    for (const [domain, { sum, count }] of Object.entries(domainQuality)) {
      domainAvgQuality[domain] = count > 0 ? sum / count : 0.5;
    }

    poorQualityDomains = Object.entries(domainAvgQuality)
      .filter(([, avg]) => avg < 0.4)
      .map(([domain]) => domain);

    goodQualityDomains = Object.entries(domainAvgQuality)
      .filter(([, avg]) => avg >= 0.7)
      .map(([domain]) => domain);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1b (RL quality) failed:", err);
  }

  // 1c. Active engagement count — are there engagements to serve?
  try {
    const { count } = await supabase
      .from("engagements")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active");
    engagementCount = count ?? 0;
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1c (engagement count) failed:", err);
  }

  // 1d. Stuck domain detection — domains with 5+ consecutive failures last 2h
  // Reflexion stuck-detection: don't keep retrying domains that are broken
  try {
    const { data: recentFailures } = await supabase
      .from("prediction_records")
      .select("domain_type, confidence")
      .eq("organization_id", orgId)
      .lt("confidence", 0.3)
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    const failureCounts: Record<string, number> = {};
    for (const row of recentFailures ?? []) {
      const domain = (row as { domain_type: string | null }).domain_type ?? "unknown";
      failureCounts[domain] = (failureCounts[domain] ?? 0) + 1;
    }

    stuckDomains = Object.entries(failureCounts)
      .filter(([, count]) => count >= 5)
      .map(([domain]) => domain);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1d (stuck domains) failed:", err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — PLAN (one Claude Haiku call)
  // ══════════════════════════════════════════════════════════════════════════

  const stateSnapshot = `## Current State
- Active engagements: ${engagementCount}
- Domains not run in >6h: ${coverageGaps.join(", ") || "none"}
- Poor quality domains (avg < 0.4 last 24h): ${poorQualityDomains.join(", ") || "none"}
- Good quality domains (avg >= 0.7 last 24h): ${goodQualityDomains.join(", ") || "none"}
- Stuck domains (5+ failures last 2h): ${stuckDomains.join(", ") || "none"}

## Past Planning Decisions and Lessons
${pastReflectionsText}`;

  let decisions: PlannerDecision[] = [];

  try {
    const response = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 400,
      system:
        "You are BrainOS's autonomous cognitive planner. You decide which agent domains to run next for an engineering organization. Be concise and practical. Never queue stuck domains. Prioritize coverage gaps over re-running recent domains. Output ONLY valid JSON.",
      messages: [
        {
          role: "user",
          content:
            stateSnapshot +
            '\n\nGiven this state, output a JSON array of at most 4 decisions:\n[{"domain": "domain-name", "priority": "high|normal|low", "rationale": "one sentence"}]\n\nRules:\n- Skip any domain in stuck list\n- Prefer domains in coverage gaps\n- Skip domains with avg quality < 0.4 unless >12h since last run\n- Max 4 decisions total',
        },
      ],
    });

    const firstBlock = response.content[0];
    const rawText = firstBlock.type === "text" ? firstBlock.text.trim() : "[]";

    try {
      // Strip markdown code fences if present
      const jsonText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      const parsed = JSON.parse(jsonText) as unknown;

      if (Array.isArray(parsed)) {
        decisions = parsed
          .filter(
            (d): d is PlannerDecision =>
              typeof d === "object" &&
              d !== null &&
              typeof (d as Record<string, unknown>).domain === "string" &&
              typeof (d as Record<string, unknown>).rationale === "string"
          )
          .map((d) => ({
            domain: d.domain,
            priority: (["high", "normal", "low"] as const).includes(
              d.priority as "high" | "normal" | "low"
            )
              ? (d.priority as "high" | "normal" | "low")
              : "normal",
            rationale: d.rationale,
          }))
          .slice(0, 4);
      }
    } catch (parseErr) {
      logger.warn("[CognitivePlanner] Phase 2 JSON parse failed, using coverage gap fallback:", parseErr);
      // Fallback: top 2 coverage gap domains
      decisions = coverageGaps
        .filter((d) => !stuckDomains.includes(d))
        .slice(0, 2)
        .map((domain) => ({
          domain,
          priority: "normal" as const,
          rationale: "Coverage gap: domain has not run in >6h (fallback plan)",
        }));
    }

    logger.info(
      `[CognitivePlanner] Phase 2 planned ${decisions.length} decisions for org=${orgId}`
    );
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 2 (plan) Haiku call failed:", err);
    // Fallback to coverage gaps
    decisions = coverageGaps
      .filter((d) => !stuckDomains.includes(d))
      .slice(0, 2)
      .map((domain) => ({
        domain,
        priority: "normal" as const,
        rationale: "Coverage gap: domain has not run in >6h (error fallback plan)",
      }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — EXECUTE (dedup + queue)
  // ══════════════════════════════════════════════════════════════════════════

  let decisionsQueued = 0;

  for (const decision of decisions) {
    try {
      // Dedup check: 2-hour cooldown per domain per org
      const dedupKey = `cognitive-planner:${decision.domain}:${orgId}`;
      const { count: existingMarker } = await supabase
        .from("ai_memory")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("domain", "cognitive-planner")
        .eq("memory_type", "dedup")
        .eq("content", dedupKey)
        .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

      if ((existingMarker ?? 0) > 0) {
        logger.info(
          `[CognitivePlanner] DEDUP skip — ${decision.domain} already queued in last 2h`
        );
        continue;
      }

      // Insert to agent_queue
      const { error: queueError } = await supabase.from("agent_queue").insert({
        organization_id: orgId,
        agent_type: "se-aas",
        task_type: decision.domain,
        priority: decision.priority === "high" ? "high" : "normal",
        status: "pending",
        payload: {
          triggeredBy: "cognitive-planner",
          rationale: decision.rationale,
          plannerCycleId: cycleId,
          coverageGap: coverageGaps.includes(decision.domain),
        },
      });

      if (queueError) {
        logger.warn(
          `[CognitivePlanner] agent_queue insert failed for ${decision.domain}:`,
          queueError
        );
        continue;
      }

      // Write dedup marker
      await supabase.from("ai_memory").insert({
        organization_id: orgId,
        domain: "cognitive-planner",
        memory_type: "dedup",
        content: dedupKey,
        importance: 0.1,
        metadata: { decision, cycleId },
      });

      decisionsQueued++;
      logger.info(
        `[CognitivePlanner] Queued ${decision.domain} (priority=${decision.priority}) for org=${orgId}`
      );
    } catch (err) {
      logger.warn(`[CognitivePlanner] Phase 3 failed for domain=${decision.domain}:`, err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — RECORD CYCLE (working memory for next cycle's Phase 5)
  // ══════════════════════════════════════════════════════════════════════════

  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      domain: "cognitive-planner",
      memory_type: "working",
      content: JSON.stringify({
        cycleId,
        decisions,
        assessedAt: new Date().toISOString(),
        coverageGaps,
        poorQualityDomains,
      }),
      importance: 0.6,
      metadata: {
        cycleId,
        decisionCount: decisions.length,
        reflected: false,
      },
    });
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 4 (record cycle) failed:", err);
  }

  logger.info(
    `[CognitivePlanner] Cycle complete: ` +
      `cycle=${cycleId} org=${orgId} ` +
      `queued=${decisionsQueued} gaps=${coverageGaps.length} ` +
      `stuck=${stuckDomains.length} reflected=${reflected}`
  );

  return {
    cycleId,
    decisionsQueued,
    decisions,
    coverageGaps,
    poorQualityDomains,
    stuckDomains,
    reflected,
  };
}
