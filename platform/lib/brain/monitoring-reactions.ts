/**
 * Autonomous Monitoring Reactions System
 * ========================================
 *
 * After the cognitive planner detects issues, this module takes corrective
 * actions automatically — no human input required.
 *
 * Reactions implemented:
 *  1. HIGH RISK ENGAGEMENT     → auto-queue early-warning with HIGH priority (health_score < 0.3)
 *  2. STALLED AGENT            → mark status='failed', fire gaba RL signal (stuck > 30 min)
 *  3. DEAD LETTER QUEUE SPIKE  → insert ai_memory alert when > 5 dead letters in 24h
 *  4. BRAIN IQ DECAY           → insert ai_memory nudge when no signals in 48h
 *  5. DOMAIN BLACKOUT          → add to ai_memory as 'blacklisted' when 0 successful runs in 7 days
 *
 * All reactions are non-fatal: errors are caught per-reaction and logged as warnings.
 * Returns a ReactionsReport summarising what was done.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReactionRecord {
  type:
    | 'high-risk-engagement'
    | 'stalled-agent'
    | 'dead-letter-spike'
    | 'brain-iq-decay'
    | 'domain-blackout';
  description: string;
  /** True if the corrective action was taken successfully */
  actionTaken: boolean;
  detail?: string;
}

export interface ReactionsReport {
  orgId: string;
  reactions: ReactionRecord[];
  totalActioned: number;
  ranAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Engagement health score below this threshold triggers an early-warning job */
const HIGH_RISK_HEALTH_THRESHOLD = 0.3;

/** Agents running for longer than this are considered stalled */
const STALLED_AGENT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Dead letter spike threshold (within 24h) */
const DEAD_LETTER_SPIKE_THRESHOLD = 5;

/** IQ decay: no signals in this window triggers a nudge */
const BRAIN_IQ_DECAY_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Domain blackout: no successful runs in this window → blacklist */
const DOMAIN_BLACKOUT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Main Export ────────────────────────────────────────────────────────────────

/**
 * Run all monitoring reactions for a single organisation.
 *
 * Called after runCognitivePlanner() in the cognitive-cycle cron.
 * Never throws — all errors are caught internally.
 */
export async function runMonitoringReactions(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionsReport> {
  const reactions: ReactionRecord[] = [];

  // Run all reactions in parallel — they are independent of each other
  const [
    highRiskReactions,
    stalledAgentReactions,
    deadLetterReaction,
    brainDecayReaction,
    domainBlackoutReactions,
  ] = await Promise.all([
    reactHighRiskEngagements(supabase, orgId).catch((err) => {
      logger.warn(`[MonitoringReactions] high-risk-engagement failed for org=${orgId}:`, err);
      return [] as ReactionRecord[];
    }),
    reactStalledAgents(supabase, orgId).catch((err) => {
      logger.warn(`[MonitoringReactions] stalled-agent failed for org=${orgId}:`, err);
      return [] as ReactionRecord[];
    }),
    reactDeadLetterSpike(supabase, orgId).catch((err) => {
      logger.warn(`[MonitoringReactions] dead-letter-spike failed for org=${orgId}:`, err);
      return null as ReactionRecord | null;
    }),
    reactBrainIqDecay(supabase, orgId).catch((err) => {
      logger.warn(`[MonitoringReactions] brain-iq-decay failed for org=${orgId}:`, err);
      return null as ReactionRecord | null;
    }),
    reactDomainBlackout(supabase, orgId).catch((err) => {
      logger.warn(`[MonitoringReactions] domain-blackout failed for org=${orgId}:`, err);
      return [] as ReactionRecord[];
    }),
  ]);

  reactions.push(...highRiskReactions);
  reactions.push(...stalledAgentReactions);
  if (deadLetterReaction) reactions.push(deadLetterReaction);
  if (brainDecayReaction) reactions.push(brainDecayReaction);
  reactions.push(...domainBlackoutReactions);

  const report: ReactionsReport = {
    orgId,
    reactions,
    totalActioned: reactions.filter((r) => r.actionTaken).length,
    ranAt: new Date().toISOString(),
  };

  return report;
}

// ── Reaction 1: High-Risk Engagement ──────────────────────────────────────────

async function reactHighRiskEngagements(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionRecord[]> {
  const records: ReactionRecord[] = [];

  // Find engagements with health_score below threshold
  const { data: riskEngagements } = await supabase
    .from("engagement_health_scores")
    .select("engagement_id, health_score, computed_at")
    .eq("organization_id", orgId)
    .lt("health_score", HIGH_RISK_HEALTH_THRESHOLD)
    .order("computed_at", { ascending: false })
    .limit(5);

  if (!riskEngagements || riskEngagements.length === 0) return records;

  for (const eng of riskEngagements) {
    const engagementId = eng.engagement_id as string;
    const score = eng.health_score as number;

    // Cooldown check: skip if there's already an early-warning job for this engagement
    // queued or running in the last 2 hours
    const cooldownSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: existingJob } = await supabase
      .from("agent_queue")
      .select("id")
      .eq("organization_id", orgId)
      .eq("task_type", "early-warning")
      .in("status", ["pending", "running"])
      .gte("created_at", cooldownSince)
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      records.push({
        type: "high-risk-engagement",
        description: `Engagement ${engagementId} has health_score=${score.toFixed(2)} but early-warning job already queued — skipping`,
        actionTaken: false,
        detail: `cooldown active, job_id=${existingJob.id}`,
      });
      continue;
    }

    // Queue early-warning agent with HIGH priority
    const { error: insertErr } = await supabase.from("agent_queue").insert({
      organization_id: orgId,
      agent_type: "se-aas",
      task_type: "early-warning",
      priority: "high",
      status: "pending",
      payload: {
        engagement_id: engagementId,
        triggered_by: "monitoring-reactions",
        trigger_reason: `health_score=${score.toFixed(2)} < ${HIGH_RISK_HEALTH_THRESHOLD}`,
        auto_queued_at: new Date().toISOString(),
      },
    });

    if (insertErr) {
      logger.warn(
        `[MonitoringReactions] Failed to queue early-warning for engagement ${engagementId}:`,
        insertErr
      );
      records.push({
        type: "high-risk-engagement",
        description: `Failed to queue early-warning for engagement ${engagementId}`,
        actionTaken: false,
        detail: insertErr.message,
      });
    } else {
      records.push({
        type: "high-risk-engagement",
        description: `Queued early-warning (HIGH priority) for engagement ${engagementId} (health_score=${score.toFixed(2)})`,
        actionTaken: true,
      });
    }
  }

  return records;
}

// ── Reaction 2: Stalled Agents ─────────────────────────────────────────────────

async function reactStalledAgents(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionRecord[]> {
  const records: ReactionRecord[] = [];
  const stalledSince = new Date(Date.now() - STALLED_AGENT_THRESHOLD_MS).toISOString();

  // Find jobs that have been 'running' for > 30 minutes
  const { data: stalledJobs } = await supabase
    .from("agent_queue")
    .select("id, task_type, started_at")
    .eq("organization_id", orgId)
    .eq("status", "running")
    .lt("started_at", stalledSince)
    .limit(10);

  if (!stalledJobs || stalledJobs.length === 0) return records;

  for (const job of stalledJobs) {
    const jobId = job.id as string;
    const taskType = job.task_type as string;
    const startedAt = job.started_at as string;
    const runningMinutes = Math.round(
      (Date.now() - new Date(startedAt).getTime()) / 60_000
    );

    // Mark as failed with auto-recovery message
    const { error: updateErr } = await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `Stalled — auto-recovered by monitoring (ran for ${runningMinutes} min)`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("organization_id", orgId);

    if (updateErr) {
      logger.warn(
        `[MonitoringReactions] Failed to mark stalled job ${jobId} as failed:`,
        updateErr
      );
      records.push({
        type: "stalled-agent",
        description: `Failed to auto-recover stalled job ${jobId} (${taskType}, ${runningMinutes}min)`,
        actionTaken: false,
        detail: updateErr.message,
      });
      continue;
    }

    // Fire gaba RL signal — negative feedback for stalled execution
    const gabaErr = await supabase
      .from("cross_domain_signals")
      .insert({
        organization_id: orgId,
        source_domain: "brain.monitoring",
        signal_type: "gaba",
        signal_value: -0.3,
        signal_timestamp: new Date().toISOString(),
        entity_type: "agent_queue",
        entity_id: jobId,
        signal_metadata: {
          reason: "stalled_agent_auto_recovery",
          task_type: taskType,
          stalled_minutes: runningMinutes,
          recovered_by: "monitoring-reactions",
        },
      })
      .then((r) => r.error);

    if (gabaErr) {
      logger.warn(
        `[MonitoringReactions] Failed to emit gaba signal for stalled job ${jobId}:`,
        gabaErr
      );
    }

    records.push({
      type: "stalled-agent",
      description: `Auto-recovered stalled job ${jobId} (${taskType}, running ${runningMinutes}min) → status=failed + gaba RL signal`,
      actionTaken: true,
      detail: `stalled_minutes=${runningMinutes}`,
    });
  }

  return records;
}

// ── Reaction 3: Dead Letter Queue Buildup ─────────────────────────────────────

async function reactDeadLetterSpike(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionRecord | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("agent_queue")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "failed")
    .gte("completed_at", since);

  const deadLetterCount = count ?? 0;

  if (deadLetterCount <= DEAD_LETTER_SPIKE_THRESHOLD) return null;

  // Insert ai_memory alert so the Copilot and cognitive planner can see it
  const alertContent = `Dead letter spike detected: ${deadLetterCount} failed agent jobs in the last 24h. Review connector health and agent queue for systemic errors.`;

  const { error: memErr } = await supabase.from("ai_memory").insert({
    organization_id: orgId,
    memory_type: "alert",
    domain: "monitoring",
    content: alertContent,
    importance: 0.9,
    metadata: {
      trigger: "dead_letter_spike",
      count: deadLetterCount,
      threshold: DEAD_LETTER_SPIKE_THRESHOLD,
      detected_at: new Date().toISOString(),
    },
  });

  if (memErr) {
    logger.warn(
      `[MonitoringReactions] Failed to insert dead-letter alert for org=${orgId}:`,
      memErr
    );
    return {
      type: "dead-letter-spike",
      description: `Dead letter count=${deadLetterCount} exceeds threshold but ai_memory insert failed`,
      actionTaken: false,
      detail: memErr.message,
    };
  }

  return {
    type: "dead-letter-spike",
    description: `Dead letter spike (${deadLetterCount} failures in 24h) — inserted ai_memory alert`,
    actionTaken: true,
    detail: `count=${deadLetterCount}`,
  };
}

// ── Reaction 4: Brain IQ Decay ────────────────────────────────────────────────

async function reactBrainIqDecay(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionRecord | null> {
  const decaySince = new Date(Date.now() - BRAIN_IQ_DECAY_WINDOW_MS).toISOString();

  // Check if there are any new signals in the last 48h
  const { count } = await supabase
    .from("cross_domain_signals")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", decaySince);

  const recentSignalCount = count ?? 0;

  if (recentSignalCount > 0) return null;

  // No recent signals — brain is decaying. Insert nudge to ai_memory.
  const nudgeContent = `No recent learning signals detected in the last 48h. Run agents or connect data sources to keep the brain's knowledge current.`;

  const { error: memErr } = await supabase.from("ai_memory").insert({
    organization_id: orgId,
    memory_type: "alert",
    domain: "monitoring",
    content: nudgeContent,
    importance: 0.7,
    metadata: {
      trigger: "brain_iq_decay",
      window_hours: 48,
      detected_at: new Date().toISOString(),
    },
  });

  if (memErr) {
    logger.warn(
      `[MonitoringReactions] Failed to insert brain decay nudge for org=${orgId}:`,
      memErr
    );
    return {
      type: "brain-iq-decay",
      description: `Brain IQ decay detected (no signals in 48h) but ai_memory insert failed`,
      actionTaken: false,
      detail: memErr.message,
    };
  }

  return {
    type: "brain-iq-decay",
    description: `Brain IQ decay detected (0 signals in 48h) — inserted ai_memory nudge`,
    actionTaken: true,
    detail: `window_hours=48`,
  };
}

// ── Reaction 5: Domain Blackout ───────────────────────────────────────────────

/** Domains tracked for blackout detection */
const TRACKED_DOMAINS = [
  "early-warning",
  "scope-creep",
  "pod-match",
  "delivery-intelligence",
];

async function reactDomainBlackout(
  supabase: SupabaseClient,
  orgId: string
): Promise<ReactionRecord[]> {
  const records: ReactionRecord[] = [];
  const blackoutSince = new Date(Date.now() - DOMAIN_BLACKOUT_WINDOW_MS).toISOString();

  // Batch: fetch successful run counts for ALL tracked domains in one query.
  // Replaces N sequential COUNT queries (was 4 queries → now 1 + 1 dedup check).
  const { data: successfulJobRows } = await supabase
    .from("agent_queue")
    .select("task_type")
    .eq("organization_id", orgId)
    .in("task_type", TRACKED_DOMAINS)
    .eq("status", "completed")
    .gte("completed_at", blackoutSince)
    .limit(TRACKED_DOMAINS.length * 10);

  const domainsWithRuns = new Set(
    (successfulJobRows ?? []).map((r: { task_type: string }) => r.task_type)
  );
  const blackoutDomains = TRACKED_DOMAINS.filter((d) => !domainsWithRuns.has(d));

  if (blackoutDomains.length === 0) return records;

  // Batch: fetch existing dedup markers for all blackout domains in one query.
  const { data: existingMarkers } = await supabase
    .from("ai_memory")
    .select("content")
    .eq("organization_id", orgId)
    .eq("memory_type", "dedup")
    .eq("domain", "monitoring-blacklist")
    .in("content", blackoutDomains)
    .limit(blackoutDomains.length);

  const alreadyBlacklisted = new Set(
    (existingMarkers ?? []).map((m: { content: string }) => m.content)
  );
  const newBlackouts = blackoutDomains.filter((d) => !alreadyBlacklisted.has(d));

  if (newBlackouts.length === 0) return records;

  // Batch insert all alert + dedup rows in one round-trip.
  const detectedAt = new Date().toISOString();
  const memoryRows = newBlackouts.flatMap((domain) => [
    {
      organization_id: orgId,
      memory_type: "alert",
      domain: "monitoring",
      content: `Domain '${domain}' has had 0 successful runs in the last 7 days. Check agent configuration, data availability, and connector health for this domain.`,
      importance: 0.8,
      metadata: {
        trigger: "domain_blackout",
        affected_domain: domain,
        window_days: 7,
        detected_at: detectedAt,
      },
    },
    {
      organization_id: orgId,
      memory_type: "dedup",
      domain: "monitoring-blacklist",
      content: domain,
      importance: 0.1,
      metadata: {
        blacklisted_at: detectedAt,
        reason: "no_successful_runs_7d",
      },
    },
  ]);

  const { error: batchMemErr } = await supabase.from("ai_memory").insert(memoryRows);

  for (const domain of newBlackouts) {
    if (batchMemErr) {
      logger.warn(
        `[MonitoringReactions] Failed to insert domain blackout batch for org=${orgId}:`,
        batchMemErr
      );
      records.push({
        type: "domain-blackout",
        description: `Domain '${domain}' has 0 successful runs in 7 days but ai_memory insert failed`,
        actionTaken: false,
        detail: batchMemErr.message,
      });
    } else {
      records.push({
        type: "domain-blackout",
        description: `Domain '${domain}' blackout detected (0 successful runs in 7 days) — inserted ai_memory alert + dedup marker`,
        actionTaken: true,
        detail: `domain=${domain}`,
      });
    }
  }

  return records;
}
