/**
 * Schema Drift Resilience Handler
 * =================================
 *
 * Handles CRM and external table column renames gracefully.
 * When a query fails with "column X does not exist", tries known aliases
 * automatically before propagating the error.
 *
 * Also provides context rot filtering: detects when brain context contains
 * stale or low-confidence signals and filters them out before LLM processing.
 *
 * Usage:
 *   const result = await executeQueryWithDriftResistance(supabase, {
 *     table: "engagements",
 *     select: "id, client_name, status",
 *     columnMappings: { client_name: ["customer_name", "account_name", "name"] },
 *   });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Known Column Aliases ───────────────────────────────────────────────────────
// Common CRM/external table column renames seen in production integrations.
// When a query fails with "column X does not exist", these aliases are tried
// in order before giving up.
export const KNOWN_COLUMN_ALIASES: Record<string, string[]> = {
  // Engagement / client relationship fields
  client_name: ["customer_name", "account_name", "company_name", "org_name", "client"],
  engagement_name: ["project_name", "deal_name", "opportunity_name", "engagement_title", "name"],
  pod_name: ["team_name", "squad_name", "group_name", "pod", "team"],

  // Health / scoring fields
  health_score: ["score", "risk_score", "overall_score", "wellness_score", "health"],
  confidence: ["confidence_score", "certainty", "probability", "quality_score", "score"],
  flight_risk_score: ["attrition_risk", "flight_risk", "risk_score", "churn_score"],
  velocity_index: ["velocity", "throughput_score", "delivery_velocity", "speed_index"],
  review_burden: ["review_load", "pr_burden", "code_review_burden", "review_count"],

  // Timestamp fields
  created_at: ["inserted_at", "created_date", "timestamp", "created_on", "date_created"],
  updated_at: ["modified_at", "last_updated", "updated_date", "date_modified"],
  computed_at: ["calculated_at", "generated_at", "snapshot_at", "evaluated_at"],

  // Identity fields
  github_login: ["username", "github_username", "login", "github_handle", "user_handle"],
  engagement_id: ["engagement_uuid", "project_id", "deal_id", "opportunity_id"],
  recommended_pod_name: ["matched_pod_name", "suggested_pod", "pod_recommendation", "pod_name"],

  // Status / flag fields
  overallocation_flag: ["overallocated", "overloaded", "capacity_exceeded", "at_capacity"],
  acknowledged: ["resolved", "dismissed", "read", "seen", "is_acknowledged"],

  // Relationship fields
  organization_id: ["org_id", "workspace_id", "tenant_id", "account_id"],
  domain_type: ["domain", "artifact_type", "type", "category"],
  signal_strength: ["strength", "confidence", "score", "signal_score", "weight"],
  signal_type: ["type", "event_type", "signal_name", "signal_category"],
  source_domain: ["domain", "source", "origin_domain", "source_system"],
};

// ── Levenshtein Distance ───────────────────────────────────────────────────────
// Self-contained implementation — no new dependencies.
// Returns the edit distance between two strings (insertions, deletions, substitutions).
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use two rows instead of full matrix to save memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    // Swap rows — reuse allocations
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ── Fuzzy Column Matcher ───────────────────────────────────────────────────────

/**
 * Attempts to find the best matching column name from a list of available columns.
 *
 * Resolution order:
 * 1. Exact match (case-insensitive)
 * 2. Known alias match (from KNOWN_COLUMN_ALIASES map)
 * 3. Levenshtein distance <= 2 match (typo tolerance)
 *
 * Returns the best match from `availableColumns`, or null if no match found.
 */
export function fuzzyMatchColumn(
  columnName: string,
  availableColumns: string[]
): string | null {
  if (availableColumns.length === 0) return null;

  const normalized = columnName.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  const exactMatch = availableColumns.find(
    (col) => col.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  // 2. Known alias match — check if any alias for this column exists in availableColumns
  const aliases = KNOWN_COLUMN_ALIASES[normalized] ?? [];
  for (const alias of aliases) {
    const aliasMatch = availableColumns.find(
      (col) => col.toLowerCase() === alias.toLowerCase()
    );
    if (aliasMatch) return aliasMatch;
  }

  // Also check reverse: if columnName is an alias of something in availableColumns
  for (const [canonical, canonicalAliases] of Object.entries(KNOWN_COLUMN_ALIASES)) {
    const isAlias = canonicalAliases.some(
      (a) => a.toLowerCase() === normalized
    );
    if (isAlias) {
      const canonicalMatch = availableColumns.find(
        (col) => col.toLowerCase() === canonical.toLowerCase()
      );
      if (canonicalMatch) return canonicalMatch;
    }
  }

  // 3. Levenshtein distance <= 2 — typo tolerance
  let bestMatch: string | null = null;
  let bestDistance = 3; // threshold: only accept distance <= 2
  for (const col of availableColumns) {
    const dist = levenshteinDistance(normalized, col.toLowerCase());
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = col;
    }
  }
  return bestMatch; // null if no match within threshold
}

// ── Query Params Type ──────────────────────────────────────────────────────────

export interface DriftResistantQueryParams {
  /** Target table name */
  table: string;
  /** Comma-separated column names (e.g., "id, client_name, status") */
  select: string;
  /** Optional equality filters applied via .eq() */
  filters?: Array<{ column: string; value: unknown }>;
  /** Optional row limit */
  limit?: number;
  /** Per-column fallback name lists (override/extend KNOWN_COLUMN_ALIASES) */
  columnMappings?: Record<string, string[]>;
}

// ── Column Name Extractor ──────────────────────────────────────────────────────

/**
 * Parse a Postgres/PostgREST error message to extract the failing column name.
 * Handles patterns like:
 *   column "client_name" does not exist
 *   column client_name of relation engagements does not exist
 */
function extractFailingColumnFromError(errorMessage: string): string | null {
  // Pattern 1: column "name" does not exist
  const quoted = errorMessage.match(/column\s+"([^"]+)"\s+does not exist/i);
  if (quoted) return quoted[1];

  // Pattern 2: column name does not exist (unquoted)
  const unquoted = errorMessage.match(/column\s+(\w+)\s+does not exist/i);
  if (unquoted) return unquoted[1];

  // Pattern 3: PostgREST: column "name" of relation
  const postgrest = errorMessage.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (postgrest) return postgrest[1];

  return null;
}

// ── Select String Rebuilder ────────────────────────────────────────────────────

/**
 * Rebuild a select string, replacing a failing column with its resolved alias.
 * Handles aliased columns ("client_name as name") and bare columns ("client_name").
 */
function rebuildSelectString(
  select: string,
  failingColumn: string,
  resolvedColumn: string
): string {
  // Split on comma, trim each, replace the failing column (case-insensitive)
  const parts = select.split(",").map((p) => p.trim());
  const rebuilt = parts.map((part) => {
    // Match bare column or start of "column as alias"
    const colPart = part.split(/\s+as\s+/i)[0].trim();
    if (colPart.toLowerCase() === failingColumn.toLowerCase()) {
      // Preserve the "as alias" part if present
      const aliasPart = part.includes(" as ") || part.includes(" AS ")
        ? " as " + part.split(/\s+as\s+/i)[1]
        : "";
      return resolvedColumn + aliasPart;
    }
    return part;
  });
  return rebuilt.join(", ");
}

// ── Main Query Executor ────────────────────────────────────────────────────────

/**
 * Executes a Supabase query with automatic schema drift recovery.
 *
 * On first error containing "column" or "does not exist":
 * 1. Parses the failing column name from the error message
 * 2. Tries fuzzyMatchColumn against KNOWN_COLUMN_ALIASES + caller-provided mappings
 * 3. Rebuilds the select string with the resolved column name
 * 4. Retries once
 *
 * NEVER throws — returns empty array on unrecoverable error.
 * Logs schema drift detection with logger.warn for observability.
 */
export async function executeQueryWithDriftResistance<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  params: DriftResistantQueryParams
): Promise<T[]> {
  const { table, filters = [], limit, columnMappings = {} } = params;
  let select = params.select;

  // Merge caller-provided mappings on top of KNOWN_COLUMN_ALIASES
  const mergedAliases: Record<string, string[]> = {
    ...KNOWN_COLUMN_ALIASES,
    ...Object.fromEntries(
      Object.entries(columnMappings).map(([col, aliases]) => [
        col,
        [...(KNOWN_COLUMN_ALIASES[col] ?? []), ...aliases],
      ])
    ),
  };

  // ── Helper: build and execute the query ───────────────────────────────────
  async function runQuery(currentSelect: string): Promise<{ data: T[] | null; error: { message: string; code?: string } | null }> {
    let q = supabase.from(table).select(currentSelect);
    for (const f of filters) {
      q = q.eq(f.column, f.value);
    }
    if (limit !== undefined) {
      q = q.limit(limit);
    }
    const result = await q;
    return result as { data: T[] | null; error: { message: string; code?: string } | null };
  }

  // ── First attempt ─────────────────────────────────────────────────────────
  try {
    const { data, error } = await runQuery(select);

    if (!error) {
      return data ?? [];
    }

    const errMsg = error.message ?? "";
    const isColumnError =
      errMsg.toLowerCase().includes("does not exist") ||
      errMsg.toLowerCase().includes("column");

    if (!isColumnError) {
      // Non-column error — not recoverable by drift handler
      logger.warn("[SchemaDrift] Non-column query error on table", {
        table,
        error: errMsg,
      });
      return [];
    }

    // ── Drift detected: try to resolve the failing column ────────────────────
    const failingColumn = extractFailingColumnFromError(errMsg);
    if (!failingColumn) {
      logger.warn("[SchemaDrift] Could not parse failing column from error", {
        table,
        error: errMsg,
      });
      return [];
    }

    // Build the list of candidate columns from all aliases
    const candidateAliases = mergedAliases[failingColumn.toLowerCase()] ?? [];
    // fuzzyMatchColumn needs the actual available columns — we don't have schema info,
    // so we use the alias list itself as the search space and try each one
    // by attempting to match against known aliases.
    const resolved = fuzzyMatchColumn(failingColumn, candidateAliases);

    if (!resolved) {
      logger.warn("[SchemaDrift] No alias found for failing column", {
        table,
        failingColumn,
        triedAliases: candidateAliases,
      });
      return [];
    }

    logger.warn("[SchemaDrift] Column renamed: retrying with alias", {
      table,
      original: failingColumn,
      resolved,
    });

    // Rebuild the select string with the resolved column name
    const rebuiltSelect = rebuildSelectString(select, failingColumn, resolved);
    select = rebuiltSelect;

    // ── Retry once with resolved column name ─────────────────────────────────
    const { data: retryData, error: retryError } = await runQuery(rebuiltSelect);

    if (retryError) {
      logger.warn("[SchemaDrift] Retry also failed after column resolution", {
        table,
        resolvedColumn: resolved,
        error: retryError.message,
      });
      return [];
    }

    return retryData ?? [];
  } catch (caught) {
    // Catch any unexpected throws (network errors, timeouts, etc.)
    logger.warn("[SchemaDrift] Unexpected error during drift-resistant query", {
      table,
      error: String(caught),
    });
    return [];
  }
}

// ── Context Rot Filter ─────────────────────────────────────────────────────────

/**
 * Filters stale or low-confidence signals from a brain context string.
 *
 * Removes lines/sections that contain:
 * - Timestamps older than `maxAgeDays` (from inline date strings)
 * - Confidence < 0.3 (e.g., "confidence: 0.21", "confidence_score: 0.15")
 * - Lines explicitly marked as "(stale)" or "(outdated)"
 * - Empty sections: a section header (## heading) followed immediately by another header
 *
 * Conservative by design: if less than 20% of the context would remain after
 * filtering, the original is returned unchanged (don't over-prune).
 *
 * @param contextString - The assembled brain context string
 * @param maxAgeDays    - Lines with dates older than this are pruned (default: 7)
 * @returns             - Cleaned context string (or original if too much would be removed)
 */
export function filterContextRot(
  contextString: string,
  maxAgeDays: number = 7
): string {
  if (!contextString || contextString.length === 0) return contextString;

  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const lines = contextString.split("\n");

  // ── Per-line rot detection ─────────────────────────────────────────────────
  const keptLines: string[] = [];
  let removedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Always keep empty lines (handled later during section dedup)
    if (trimmed.length === 0) {
      keptLines.push(line);
      continue;
    }

    // 1. Check for explicit staleness markers
    if (/(stale|outdated)/i.test(trimmed)) {
      removedCount++;
      continue;
    }

    // 2. Check for low confidence values
    // Matches: "confidence: 0.21", "confidence_score: 0.15", "certainty: 0.10"
    const confidenceMatch = trimmed.match(
      /\b(?:confidence|confidence_score|certainty|probability)\s*[=:]\s*([\d.]+)/i
    );
    if (confidenceMatch) {
      const value = parseFloat(confidenceMatch[1]);
      if (!isNaN(value) && value < 0.3) {
        removedCount++;
        continue;
      }
    }

    // 3. Check for stale timestamps in the line
    // Matches ISO dates: 2025-12-01, 2025-12-01T12:00:00Z, 2025-12-01T12:00:00.000Z
    const dateMatches = trimmed.matchAll(
      /\b(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)\b/g
    );
    let hasStaleDate = false;
    for (const match of dateMatches) {
      try {
        const ts = new Date(match[1]).getTime();
        if (!isNaN(ts) && ts < cutoffMs) {
          hasStaleDate = true;
          break;
        }
      } catch {
        // Ignore unparseable dates
      }
    }
    if (hasStaleDate) {
      removedCount++;
      continue;
    }

    keptLines.push(line);
  }

  // ── Remove empty sections: ## Header followed immediately by ## Header ────
  const withoutEmptySections: string[] = [];
  for (let i = 0; i < keptLines.length; i++) {
    const line = keptLines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) {
      // Look ahead: skip blank lines, check if next non-blank is another ## header
      let j = i + 1;
      while (j < keptLines.length && keptLines[j].trim().length === 0) {
        j++;
      }
      if (j < keptLines.length && keptLines[j].trim().startsWith("##")) {
        // Empty section — skip the header
        removedCount++;
        continue;
      }
    }
    withoutEmptySections.push(line);
  }

  // ── Conservative guard: don't over-prune ─────────────────────────────────
  // If less than 20% of original lines would remain, return original context.
  const originalLineCount = lines.length;
  const remainingLineCount = withoutEmptySections.filter(l => l.trim().length > 0).length;
  const originalNonEmptyCount = lines.filter(l => l.trim().length > 0).length;

  if (originalNonEmptyCount > 0 && remainingLineCount / originalNonEmptyCount < 0.2) {
    logger.warn("[SchemaDrift] filterContextRot: over-pruning guard triggered, returning original", {
      originalLines: originalLineCount,
      remainingLines: remainingLineCount,
      removedCount,
    });
    return contextString;
  }

  if (removedCount > 0) {
    logger.warn("[SchemaDrift] filterContextRot: removed stale/low-confidence signals", {
      removedCount,
      originalChars: contextString.length,
      cleanedChars: withoutEmptySections.join("\n").length,
    });
  }

  return withoutEmptySections.join("\n");
}
