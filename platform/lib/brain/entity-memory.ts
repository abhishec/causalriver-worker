/**
 * Entity Memory
 * ==============
 *
 * Extracts and persists named entities mentioned in copilot conversations.
 * Injects recently seen entities back into the system prompt for cross-query context.
 *
 * Design principles:
 * - Pure regex extraction — no LLM calls, zero cost on the hot path
 * - Fire-and-forget persistence — never blocks the streaming response
 * - 7-day TTL — stale entities are automatically excluded from injection
 * - Worker-scoped — entities tagged with ai_worker_id in metadata for per-worker isolation
 *
 * Usage:
 *   // After a copilot turn completes, extract and persist (fire-and-forget):
 *   const entities = extractEntities(userMessage + " " + responseText);
 *   persistEntities(entities, orgId, workerId).catch(() => {});
 *
 *   // Inject into system prompt before the next turn:
 *   const entityBlock = await getEntityContext(orgId, workerId);
 *   effectiveSystemPrompt = entityBlock + "\n\n" + effectiveSystemPrompt;
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedEntity {
  type: "person" | "project" | "team" | "amount" | "date" | "id" | "email" | "status";
  value: string;
  normalized: string;
  /** Up to 60 characters of surrounding text for context */
  context: string;
}

export interface EntityMemoryEntry {
  entity_type: string;
  entity_value: string;
  entity_normalized: string;
  seen_count: number;
  last_context: string;
  workspace_id: string;
  worker_id?: string;
}

// ── Regex Patterns ───────────────────────────────────────────────────────────

/**
 * All patterns are applied in declaration order. Earlier patterns take priority
 * so that more specific patterns (email, id) are matched before generic ones (person).
 */
const PATTERNS: Array<{
  type: ExtractedEntity["type"];
  regex: RegExp;
}> = [
  // Email — must come before person to prevent "john@example.com" matching as a name
  {
    type: "email",
    regex: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g,
  },

  // JIRA-style IDs and UUIDs
  {
    type: "id",
    regex:
      /\b[A-Z]{2,10}-\d{1,6}\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  },

  // Financial amounts: $1,234, £500, €1.2M, 87%, $1.2B
  {
    type: "amount",
    regex: /(?:[$£€¥])\s*\d[\d,]*(?:\.\d+)?(?:\s*[KMBkmb])?\b|\b\d+(?:\.\d+)?%/g,
  },

  // Dates: Q3 2025, March 2026, next week, yesterday, last month, next quarter
  {
    type: "date",
    regex:
      /\bQ[1-4]\s+\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b|\b(?:next|last)\s+(?:week|month|quarter|year)\b|\byesterday\b|\btoday\b|\btomorrow\b/gi,
  },

  // Status indicators
  {
    type: "status",
    regex: /\b(?:at risk|on track|blocked|completed|delayed|in progress|overdue|escalated)\b/gi,
  },

  // Projects: "Project X", "Sprint N", quoted engagement names, "Phase N"
  {
    type: "project",
    regex:
      /\b(?:Project\s+[A-Z]\w*|Sprint\s+\d+|Phase\s+\d+|Release\s+\d[\d.]*)\b|"([^"]{3,50})"/g,
  },

  // Teams: "Team X", "Squad Y", "Pod Z"
  {
    type: "team",
    regex: /\b(?:Team|Squad|Pod|Group|Chapter)\s+[A-Z]\w*\b/g,
  },

  // People: two adjacent title-cased words (e.g. "John Smith"), or common single first names
  {
    type: "person",
    regex:
      /\b[A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}\b/g,
  },
];

// Common English words that match the person pattern but are not names — skip them
const PERSON_STOPWORDS = new Set([
  "Project", "Sprint", "Phase", "Release", "Team", "Squad", "Pod", "Group",
  "Chapter", "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "New York", "San Francisco",
  "North America", "South America", "United States", "United Kingdom",
]);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pure regex extraction of entities from a text string.
 * Fast, synchronous, no I/O.
 *
 * Deduplicates by normalized value within a single call.
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const seen = new Set<string>();
  const results: ExtractedEntity[] = [];

  for (const { type, regex } of PATTERNS) {
    // Reset lastIndex for global regexes used across multiple calls
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].trim();
      if (!raw || raw.length < 2) continue;

      // For project pattern, prefer the captured group (quoted name) over the full match
      const value = (match[1] ?? raw).trim();
      if (!value || value.length < 2) continue;

      // Skip person matches that are actually project/team/date keywords
      if (type === "person") {
        const firstWord = value.split(/\s+/)[0];
        if (PERSON_STOPWORDS.has(firstWord) || PERSON_STOPWORDS.has(value)) continue;
      }

      const normalized = normalizeEntity(type, value);
      const dedupeKey = `${type}:${normalized}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Surrounding context: up to 30 chars before and after the match
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + raw.length + 30);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 60);

      results.push({ type, value, normalized, context });

      // Limit to 50 entities per call to prevent runaway extraction on long texts
      if (results.length >= 50) return results;
    }
  }

  return results;
}

/**
 * Upsert extracted entities to ai_memory. Fire-and-forget.
 *
 * Stores worker_id in metadata since ai_memory has no top-level ai_worker_id column.
 * Importance is recurrence-based: 0.3 + min(seenCount * 0.1, 0.5), capped at 0.8.
 *
 * Never throws.
 */
export async function persistEntities(
  entities: ExtractedEntity[],
  workspaceId: string,
  workerId?: string
): Promise<void> {
  if (!entities.length) return;

  const admin = getAdminClient();

  for (const entity of entities) {
    try {
      // Check if this entity was seen recently to compute seen_count for importance
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: existing } = await admin
        .from("ai_memory")
        .select("id, metadata, importance")
        .eq("organization_id", workspaceId)
        .eq("domain", "entity-memory")
        .eq("memory_type", entity.type)
        .eq("content", entity.value)
        .gte("updated_at", sevenDaysAgo)
        .maybeSingle();

      const existingMeta =
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : {};

      const seenCount = typeof existingMeta.seen_count === "number"
        ? existingMeta.seen_count + 1
        : 1;

      // Importance grows with recurrence: 0.3 base + 0.1 per additional sighting, max 0.8
      const importance = Math.min(0.8, 0.3 + Math.min(seenCount * 0.1, 0.5));

      const metadata: Record<string, unknown> = {
        normalized: entity.normalized,
        last_context: entity.context,
        seen_count: seenCount,
        source: "entity-memory",
        updatedAt: new Date().toISOString(),
      };
      if (workerId) metadata.worker_id = workerId;

      if (existing?.id) {
        // Update existing entry
        const { error } = await admin
          .from("ai_memory")
          .update({
            importance,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) {
          logger.warn("[entity-memory] update failed (non-fatal)", {
            entityType: entity.type,
            error: error.message,
          });
        }
      } else {
        // Insert new entry
        const row: Record<string, unknown> = {
          organization_id: workspaceId,
          domain: "entity-memory",
          memory_type: entity.type,
          content: entity.value,
          importance,
          metadata,
        };

        const { error } = await admin.from("ai_memory").insert(row);

        if (error) {
          logger.warn("[entity-memory] insert failed (non-fatal)", {
            entityType: entity.type,
            error: error.message,
          });
        }
      }
    } catch (err) {
      logger.warn("[entity-memory] persistEntities error (non-fatal)", {
        entityType: entity.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Returns a formatted entity context block for injection into the system prompt.
 *
 * Queries the 10 most important entity-memory entries from the last 7 days,
 * scoped to the workspace (and optionally the worker).
 *
 * Returns an empty string on error or when no entities are found.
 *
 * Format:
 * ## KNOWN ENTITIES (from recent conversations)
 * People: John Smith, Sarah Chen | Projects: Sprint 23 | Amounts: $1.2M | ...
 */
export async function getEntityContext(
  workspaceId: string,
  workerId?: string,
  limit = 10
): Promise<string> {
  try {
    const admin = getAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = admin
      .from("ai_memory")
      .select("memory_type, content, metadata, importance")
      .eq("organization_id", workspaceId)
      .eq("domain", "entity-memory")
      .gte("updated_at", sevenDaysAgo)
      .order("importance", { ascending: false })
      .limit(limit);

    // Filter by worker_id when provided — entities tagged with this worker or untagged (shared)
    // Worker-id is stored in metadata since ai_memory has no top-level ai_worker_id column
    if (workerId) {
      // Include rows where metadata->>'worker_id' matches OR is null (workspace-wide entities)
      query = query.or(
        `metadata->>'worker_id'.eq.${workerId},metadata->>'worker_id'.is.null`
      );
    }

    const { data, error } = await query;

    if (error) {
      logger.warn("[entity-memory] getEntityContext query failed (non-fatal)", {
        error: error.message,
        workspaceId,
      });
      return "";
    }

    if (!data || data.length === 0) return "";

    // Group by entity type
    const grouped: Record<string, string[]> = {};
    for (const row of data) {
      const type = String(row.memory_type ?? "other");
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(String(row.content));
    }

    // Build label map for display
    const LABEL_MAP: Record<string, string> = {
      person: "People",
      project: "Projects",
      team: "Teams",
      amount: "Amounts",
      date: "Dates",
      id: "IDs",
      email: "Emails",
      status: "Risks",
    };

    const parts: string[] = [];
    // Output in a stable order
    const ORDER: ExtractedEntity["type"][] = [
      "person", "project", "team", "amount", "date", "status", "id", "email",
    ];

    for (const type of ORDER) {
      const values = grouped[type];
      if (values && values.length > 0) {
        const label = LABEL_MAP[type] ?? type;
        parts.push(`${label}: ${values.join(", ")}`);
      }
    }

    // Any types not in ORDER (future-proofing)
    for (const [type, values] of Object.entries(grouped)) {
      if (!ORDER.includes(type as ExtractedEntity["type"]) && values.length > 0) {
        parts.push(`${type}: ${values.join(", ")}`);
      }
    }

    if (parts.length === 0) return "";

    return `## KNOWN ENTITIES (from recent conversations)\n${parts.join(" | ")}`;
  } catch (err) {
    logger.warn("[entity-memory] getEntityContext error (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      workspaceId,
    });
    return "";
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Normalize an extracted entity value for deduplication.
 * - Trims whitespace
 * - Lowercases amounts, dates, statuses, and IDs (case-insensitive domains)
 * - Preserves casing for people, projects, and teams (proper nouns)
 */
function normalizeEntity(type: ExtractedEntity["type"], value: string): string {
  const trimmed = value.trim();
  switch (type) {
    case "amount":
    case "date":
    case "status":
    case "id":
    case "email":
      return trimmed.toLowerCase();
    case "person":
    case "project":
    case "team":
    default:
      // Collapse internal whitespace but keep casing
      return trimmed.replace(/\s+/g, " ");
  }
}
