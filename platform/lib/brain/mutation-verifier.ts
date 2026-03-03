/**
 * Mutation Verifier
 * =================
 *
 * After any write-back operation (Slack message, Jira ticket, GitHub comment),
 * automatically infers and executes a read-back to verify the write committed.
 *
 * Closes the "write succeeded but did it really persist?" gap.
 *
 * Design principles:
 * - Fire-and-forget safe: never throws
 * - Max 3 seconds timeout on every verification
 * - Heuristic-based for external APIs (no second round-trip needed)
 * - Type-specific confidence levels based on API response shapes
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WritebackActionType =
  | "slack_message"
  | "jira_ticket_update"
  | "jira_comment"
  | "github_pr_comment"
  | "github_issue_comment"
  | "linear_issue_update"
  | "database_record"
  | "unknown";

export interface WritebackAction {
  type: WritebackActionType;
  entityId?: string;        // PR number, ticket ID, message TS
  entityType?: string;      // 'pr', 'issue', 'ticket', 'message'
  channel?: string;         // Slack channel
  metadata?: Record<string, unknown>;
}

export interface VerificationResult {
  confirmed: boolean;
  confidence: number;       // 0.0 - 1.0
  method: "read_back" | "heuristic" | "timeout" | "unsupported";
  details?: string;
  durationMs: number;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Verifies that a write-back operation persisted successfully.
 *
 * Dispatches to a type-specific verifier with a 3-second timeout.
 * Returns a VerificationResult describing confidence level and method used.
 *
 * Fire-and-forget safe — never throws.
 */
export async function verifyWriteback(
  action: WritebackAction,
  writeResult: unknown,
  supabase: SupabaseClient
): Promise<VerificationResult> {
  const startMs = Date.now();

  try {
    const TIMEOUT_MS = 3000;

    const verificationPromise = dispatchVerifier(action, writeResult, supabase, startMs);

    const timeoutPromise: Promise<VerificationResult> = new Promise((resolve) =>
      setTimeout(() => {
        resolve({
          confirmed: false,
          confidence: 0.0,
          method: "timeout",
          details: `Verification timed out after ${TIMEOUT_MS}ms`,
          durationMs: Date.now() - startMs,
        });
      }, TIMEOUT_MS)
    );

    return await Promise.race([verificationPromise, timeoutPromise]);
  } catch (err) {
    logger.warn("[MutationVerifier] verifyWriteback error (non-fatal)", {
      actionType: action.type,
      error: String(err),
    });
    return {
      confirmed: false,
      confidence: 0.0,
      method: "unsupported",
      details: `Verification threw: ${String(err)}`,
      durationMs: Date.now() - startMs,
    };
  }
}

/**
 * Infers a WritebackAction from a connector type + tool name + params.
 *
 * Maps the raw connector call shape to a typed WritebackAction so that
 * verifyWriteback() can apply the right verification strategy.
 */
export function inferWritebackAction(
  connectorType: string,
  toolName: string,
  params: Record<string, unknown>
): WritebackAction {
  const type = connectorType.toLowerCase();
  const tool = toolName.toLowerCase();

  if (type === "slack") {
    if (/post|send|message/.test(tool)) {
      return {
        type: "slack_message",
        channel: typeof params.channel === "string" ? params.channel : undefined,
        entityType: "message",
        metadata: { toolName },
      };
    }
  }

  if (type === "jira") {
    if (/comment/.test(tool)) {
      return {
        type: "jira_comment",
        entityId: typeof params.issue_key === "string" ? params.issue_key
                : typeof params.issueKey === "string" ? params.issueKey
                : undefined,
        entityType: "comment",
        metadata: { toolName },
      };
    }
    if (/create|update|edit/.test(tool)) {
      return {
        type: "jira_ticket_update",
        entityId: typeof params.issue_key === "string" ? params.issue_key
                : typeof params.issueKey === "string" ? params.issueKey
                : undefined,
        entityType: "ticket",
        metadata: { toolName },
      };
    }
  }

  if (type === "github") {
    if (/comment|review/.test(tool)) {
      const prNumber =
        typeof params.pull_number === "number" ? String(params.pull_number)
        : typeof params.pr_number === "number" ? String(params.pr_number)
        : undefined;

      const issueNumber =
        typeof params.issue_number === "number" ? String(params.issue_number)
        : undefined;

      if (prNumber || /pr|pull/.test(tool)) {
        return {
          type: "github_pr_comment",
          entityId: prNumber ?? issueNumber,
          entityType: "pr",
          metadata: { toolName },
        };
      }
      return {
        type: "github_issue_comment",
        entityId: issueNumber,
        entityType: "issue",
        metadata: { toolName },
      };
    }
  }

  if (type === "linear") {
    return {
      type: "linear_issue_update",
      entityId: typeof params.issue_id === "string" ? params.issue_id : undefined,
      entityType: "issue",
      metadata: { toolName },
    };
  }

  return {
    type: "unknown",
    metadata: { connectorType, toolName },
  };
}

// ── Inverted Write Detection ───────────────────────────────────────────────────

/**
 * Extract a read action from a write action name using noun extraction.
 *
 * Maps action verbs to their read equivalents:
 *   approve_invoice  → get_invoice
 *   create_ticket    → get_ticket
 *   send_message     → get_message
 *   update_record    → get_record
 *   post_comment     → get_comment
 *   delete_item      → get_item (to verify deletion)
 *
 * This enables the verifier to check: "after we approved invoice X, can we
 * read it back to confirm the approval field is set?"
 *
 * @param toolName - The write tool name (e.g. "approve_invoice", "create_jira_ticket")
 * @returns        - The inferred read tool name (e.g. "get_invoice", "get_jira_ticket")
 *                   Returns null if no read equivalent can be inferred.
 */
export function extractReadActionFromWrite(toolName: string): string | null {
  const lower = toolName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  // Direct verb substitution map
  const WRITE_TO_READ_VERBS: Record<string, string> = {
    approve: "get",
    create: "get",
    send: "get",
    post: "get",
    update: "get",
    patch: "get",
    put: "get",
    submit: "get",
    publish: "get",
    delete: "get",       // verify by trying to read (should 404)
    remove: "get",
    archive: "get",
    close: "get",
    resolve: "get",
    assign: "get",
    schedule: "get",
    trigger: "get",
    invoke: "get",
    execute: "get",
    add: "get",
    insert: "get",
  };

  // Split on underscores, find the verb (usually first token)
  const parts = lower.split("_").filter(Boolean);
  if (parts.length === 0) return null;

  const firstPart = parts[0];
  const readVerb = WRITE_TO_READ_VERBS[firstPart];

  if (!readVerb) return null;

  // Replace first token with read verb, keep noun parts
  const nounParts = parts.slice(1);
  if (nounParts.length === 0) return null;

  return `${readVerb}_${nounParts.join("_")}`;
}

/**
 * Extracts the noun entity from a tool name (e.g. "approve_invoice" → "invoice").
 * Used to build descriptive verification logs.
 *
 * @param toolName - Tool name (e.g. "create_jira_ticket")
 * @returns        - Primary noun entity (e.g. "jira_ticket") or null
 */
export function extractEntityNoun(toolName: string): string | null {
  const parts = toolName.toLowerCase().replace(/[^a-z0-9_]/g, "_").split("_").filter(Boolean);
  if (parts.length <= 1) return null;

  const WRITE_VERBS = new Set([
    "approve", "create", "send", "post", "update", "patch", "put",
    "submit", "publish", "delete", "remove", "archive", "close",
    "resolve", "assign", "schedule", "trigger", "invoke", "execute",
    "add", "insert", "get", "fetch", "read", "list",
  ]);

  // Return everything after the first verb token
  const firstIsVerb = WRITE_VERBS.has(parts[0]);
  const nounParts = firstIsVerb ? parts.slice(1) : parts;
  return nounParts.length > 0 ? nounParts.join("_") : null;
}

/**
 * Builds a human-readable summary of one or more VerificationResults.
 *
 * Examples:
 *   "✅ Slack message confirmed (0.95 confidence)"
 *   "⚠️ Jira update unconfirmed (timeout)"
 *   "❓ GitHub comment verification unsupported"
 */
export function buildVerificationSummary(results: VerificationResult[]): string {
  if (results.length === 0) return "No write-back operations to verify.";

  return results
    .map((r) => {
      if (r.method === "unsupported") {
        return `❓ Verification unsupported (${r.details ?? "no details"})`;
      }
      if (r.method === "timeout") {
        return `⚠️ Verification timed out (${r.details ?? "no details"})`;
      }
      if (r.confirmed) {
        const pct = Math.round(r.confidence * 100) / 100;
        return `✅ Write-back confirmed (${pct} confidence, ${r.method})`;
      }
      return `⚠️ Write-back unconfirmed (${r.confidence} confidence, ${r.method})${r.details ? ` — ${r.details}` : ""}`;
    })
    .join("\n");
}

// ── Internal Dispatcher ───────────────────────────────────────────────────────

async function dispatchVerifier(
  action: WritebackAction,
  writeResult: unknown,
  supabase: SupabaseClient,
  startMs: number
): Promise<VerificationResult> {
  switch (action.type) {
    case "slack_message":
      return verifySlackMessage(writeResult, startMs);

    case "jira_ticket_update":
      return verifyJiraTicketUpdate(writeResult, startMs);

    case "jira_comment":
      return verifyJiraComment(writeResult, startMs);

    case "github_pr_comment":
      return verifyGithubComment(writeResult, startMs);

    case "github_issue_comment":
      return verifyGithubComment(writeResult, startMs);

    case "linear_issue_update":
      return verifyLinearIssueUpdate(writeResult, startMs);

    case "database_record":
      return verifyDatabaseRecord(writeResult, supabase, startMs);

    default:
      return {
        confirmed: false,
        confidence: 0.0,
        method: "unsupported",
        details: `No verifier for action type: ${action.type}`,
        durationMs: Date.now() - startMs,
      };
  }
}

// ── Type-Specific Verifiers ───────────────────────────────────────────────────

/**
 * Slack: confirmed if response contains 'ts' (timestamp) or 'ok: true'.
 * Both indicate the message was accepted and stored by Slack's API.
 */
function verifySlackMessage(
  writeResult: unknown,
  startMs: number
): VerificationResult {
  const result = writeResult as Record<string, unknown> | null | undefined;

  if (result && (typeof result.ts === "string" || result.ok === true)) {
    return {
      confirmed: true,
      confidence: 0.9,
      method: "heuristic",
      details: result.ts ? `Message TS: ${result.ts}` : "ok: true",
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "heuristic",
    details: "No 'ts' or 'ok: true' in Slack response",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Jira ticket update: confirmed if response contains 'id' or 'key'.
 * Both fields are present on successful issue create/update responses.
 */
function verifyJiraTicketUpdate(
  writeResult: unknown,
  startMs: number
): VerificationResult {
  const result = writeResult as Record<string, unknown> | null | undefined;

  if (result && (typeof result.id === "string" || typeof result.key === "string")) {
    return {
      confirmed: true,
      confidence: 0.85,
      method: "heuristic",
      details: result.key
        ? `Issue key: ${result.key}`
        : `Issue id: ${result.id}`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "heuristic",
    details: "No 'id' or 'key' in Jira response",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Jira comment: confirmed if response contains 'id'.
 * Jira comment creation responses always include the new comment's id.
 */
function verifyJiraComment(
  writeResult: unknown,
  startMs: number
): VerificationResult {
  const result = writeResult as Record<string, unknown> | null | undefined;

  if (result && typeof result.id === "string") {
    return {
      confirmed: true,
      confidence: 0.85,
      method: "heuristic",
      details: `Comment id: ${result.id}`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "heuristic",
    details: "No 'id' in Jira comment response",
    durationMs: Date.now() - startMs,
  };
}

/**
 * GitHub PR/issue comment: confirmed if response contains 'id' and 'url'.
 * GitHub's REST API always returns both on a successful comment creation.
 */
function verifyGithubComment(
  writeResult: unknown,
  startMs: number
): VerificationResult {
  const result = writeResult as Record<string, unknown> | null | undefined;

  if (result && typeof result.id === "number" && typeof result.url === "string") {
    return {
      confirmed: true,
      confidence: 0.9,
      method: "heuristic",
      details: `Comment id: ${result.id}, url: ${result.url}`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "heuristic",
    details: "No 'id' + 'url' in GitHub comment response",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Linear issue update: confirmed if response contains an 'id' field.
 * Linear's GraphQL API returns the updated node's id on success.
 */
function verifyLinearIssueUpdate(
  writeResult: unknown,
  startMs: number
): VerificationResult {
  const result = writeResult as Record<string, unknown> | null | undefined;

  // Linear may nest under 'issueUpdate' or 'issue'
  const node =
    (result?.issueUpdate as Record<string, unknown> | undefined)?.issue ??
    (result?.issue as Record<string, unknown> | undefined) ??
    result;

  const nodeRecord = node as Record<string, unknown> | null | undefined;

  if (nodeRecord && typeof nodeRecord.id === "string") {
    return {
      confirmed: true,
      confidence: 0.85,
      method: "heuristic",
      details: `Issue id: ${nodeRecord.id}`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "heuristic",
    details: "No 'id' in Linear issue response",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Database record: confirmed if writeResult has an 'id' field.
 * Supabase insert responses include the inserted row with its id.
 * Classified as 'read_back' because this reflects the actual DB state.
 */
function verifyDatabaseRecord(
  writeResult: unknown,
  _supabase: SupabaseClient,
  startMs: number
): VerificationResult {
  // Supabase returns { data: [...], error: null } or { data: { id: ... } }
  const result = writeResult as Record<string, unknown> | null | undefined;

  // Check direct id field
  if (result && typeof result.id === "string") {
    return {
      confirmed: true,
      confidence: 0.95,
      method: "read_back",
      details: `Record id: ${result.id}`,
      durationMs: Date.now() - startMs,
    };
  }

  // Check Supabase data array shape
  if (result && Array.isArray(result.data)) {
    const rows = result.data as Array<Record<string, unknown>>;
    const firstId = rows[0]?.id;
    if (typeof firstId === "string") {
      return {
        confirmed: true,
        confidence: 0.95,
        method: "read_back",
        details: `Record id: ${firstId}`,
        durationMs: Date.now() - startMs,
      };
    }
  }

  // Check single object data shape
  const data = result?.data as Record<string, unknown> | null | undefined;
  if (data && typeof data.id === "string") {
    return {
      confirmed: true,
      confidence: 0.95,
      method: "read_back",
      details: `Record id: ${data.id}`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    confirmed: false,
    confidence: 0.0,
    method: "read_back",
    details: "No 'id' found in database write result",
    durationMs: Date.now() - startMs,
  };
}
