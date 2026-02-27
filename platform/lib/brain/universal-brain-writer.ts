import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type BrainEventSource =
  | "connector.github"
  | "connector.jira"
  | "connector.slack"
  | "connector.confluence"
  | "connector.freshworks"
  | "llm.response" // Copilot final response
  | "llm.decision" // Routing/planning decisions
  | "llm.reasoning" // Chain of thought
  | "agent.output" // SE-aaS/AaaS/PM agent results
  | "agent.tool_call" // Agent tool use
  | "document.pdf" // Document absorption
  | "document.code" // Code/Git ingestion
  | "feedback.positive" // User thumbs up
  | "feedback.negative" // User thumbs down
  | "brain.evolution" // Self-modification events
  | "brain.causal" // New causal edge discovered
  | "system.cron"; // Scheduled insights

export interface BrainEvent {
  source: BrainEventSource;
  eventType: string; // 'pr_merged', 'response_generated', 'route_selected', etc.
  content: string; // Human-readable description of what happened
  entityId?: string; // External ID (PR#123, user:abc, etc.)
  entityType?: string; // 'user', 'pr', 'issue', 'response', 'decision', etc.
  importance: number; // 0.0-1.0, used for signal strength + memory ranking
  domain: string; // Which cognitive domain: 'github', 'delivery', 'routing', etc.
  metadata?: Record<string, unknown>;
}

// Threshold: when signal count crosses this, trigger a cognitive refresh
const COGNITIVE_REFRESH_THRESHOLD = 50;

// Track per-org write counts in memory (resets per Lambda invocation — that's fine)
const orgWriteCounts: Map<string, number> = new Map();

export async function universalBrainWrite(
  supabase: SupabaseClient,
  orgId: string,
  event: BrainEvent
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  // 1. Write to cross_domain_signals (always — for causal graph + signal strength)
  promises.push(
    Promise.resolve(
      supabase.from("cross_domain_signals").insert({
        organization_id: orgId,
        source_domain: event.source,
        signal_type: event.eventType,
        signal_value: event.importance,
        signal_strength: event.importance,
        target_domain: event.domain,
        entity_type: event.entityType ?? "event",
        entity_id: event.entityId ?? `${event.source}:${Date.now()}`,
        signal_metadata: {
          content: event.content.slice(0, 500),
          ...event.metadata,
        },
        payload: { full_content: event.content.slice(0, 2000) },
      })
    ).catch((err: unknown) => {
      logger.warn(`[universal-brain] signal write failed: ${String(err)}`);
    })
  );

  // 2. Write to ai_memory if importance >= 0.5 (for LLM context injection)
  if (event.importance >= 0.5) {
    const memoryType: string = event.source.startsWith("llm")
      ? "pattern"
      : event.source.startsWith("agent")
        ? "outcome"
        : event.source.startsWith("feedback")
          ? "correction"
          : event.source.startsWith("connector")
            ? "insight"
            : "knowledge";

    promises.push(
      Promise.resolve(
        supabase.from("ai_memory").upsert(
          {
            organization_id: orgId,
            domain: `${event.domain}.${event.eventType}`,
            memory_type: memoryType,
            content: event.content.slice(0, 1000),
            importance: event.importance,
            metadata: {
              source: event.source,
              entity_id: event.entityId,
              ...event.metadata,
            },
          },
          {
            onConflict: "organization_id,memory_type,domain",
            ignoreDuplicates: false,
          }
        )
      ).catch((err: unknown) => {
        logger.warn(`[universal-brain] memory write failed: ${String(err)}`);
      })
    );
  }

  await Promise.allSettled(promises);

  // 3. Track write counts for threshold-based cognitive refresh
  const count = (orgWriteCounts.get(orgId) ?? 0) + 1;
  orgWriteCounts.set(orgId, count);

  // Every N writes, log that cognitive refresh should be triggered
  // (Actual refresh happens via cron — this just tracks the signal)
  if (count % COGNITIVE_REFRESH_THRESHOLD === 0) {
    logger.warn(
      `[universal-brain] Org ${orgId}: ${count} events written to brain this session. Cognitive cycle will refresh on next cron run.`
    );
  }
}

// Batch write for connector syncs (avoids individual write overhead)
export async function universalBrainWriteBatch(
  supabase: SupabaseClient,
  orgId: string,
  events: BrainEvent[]
): Promise<void> {
  if (events.length === 0) return;

  // Write all signals in one insert
  const signals = events.map((event) => ({
    organization_id: orgId,
    source_domain: event.source,
    signal_type: event.eventType,
    signal_value: event.importance,
    signal_strength: event.importance,
    target_domain: event.domain,
    entity_type: event.entityType ?? "event",
    entity_id: event.entityId ?? `${event.source}:${Date.now()}`,
    signal_metadata: {
      content: event.content.slice(0, 500),
      ...event.metadata,
    },
    payload: { full_content: event.content.slice(0, 2000) },
  }));

  await Promise.resolve(
    supabase.from("cross_domain_signals").insert(signals)
  ).catch((err: unknown) => {
    logger.warn(
      `[universal-brain] batch signal write failed: ${String(err)}`
    );
  });

  // Write high-importance events to ai_memory — batch upsert (was N individual upserts)
  const highImportance = events.filter((e) => e.importance >= 0.5).slice(0, 20);
  if (highImportance.length > 0) {
    const memoryRows = highImportance.map((event) => ({
      organization_id: orgId,
      domain: `${event.domain}.${event.eventType}`,
      memory_type: event.source.startsWith("connector") ? "insight" : "knowledge",
      content: event.content.slice(0, 1000),
      importance: event.importance,
      metadata: { source: event.source, entity_id: event.entityId, ...event.metadata },
    }));
    await Promise.resolve(
      supabase
        .from("ai_memory")
        .upsert(memoryRows, { onConflict: "organization_id,memory_type,domain", ignoreDuplicates: false })
    ).catch(() => {});
  }

  const count = (orgWriteCounts.get(orgId) ?? 0) + events.length;
  orgWriteCounts.set(orgId, count);
  logger.warn(
    `[universal-brain] Batch wrote ${events.length} events to brain for org ${orgId}`
  );
}
