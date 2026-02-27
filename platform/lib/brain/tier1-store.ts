/**
 * Tier 1 — Raw Knowledge Store
 * =============================
 * Ingests verbatim content into `knowledge_chunks` with fire-and-forget
 * embedding generation. Raw text is never modified after insertion
 * (enforced by an immutability trigger on the DB side).
 *
 * Source types supported:
 *   git_commit | conversation_turn | code_file | ticket | pr_description | slack_message
 */

import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBEDDING_DIMS = 1536;
const MAX_TEXT_CHARS = 8000;

// ── Embedding helper ──────────────────────────────────────────────────────────

/**
 * Call OpenAI text-embedding-3-small to produce a 1536-dim vector.
 * Returns a zero vector on any failure — zero is better than noise
 * because it won't pollute cosine-similarity rankings.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[tier1-store] OPENAI_API_KEY not set — returning zero vector");
    return new Array(EMBEDDING_DIMS).fill(0);
  }
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, MAX_TEXT_CHARS),
        dimensions: EMBEDDING_DIMS,
      }),
    });
    if (!res.ok) {
      logger.warn("[tier1-store] OpenAI embedding request failed", {
        status: res.status,
        statusText: res.statusText,
      });
      return new Array(EMBEDDING_DIMS).fill(0);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? new Array(EMBEDDING_DIMS).fill(0);
  } catch (err) {
    logger.warn("[tier1-store] generateEmbedding threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Array(EMBEDDING_DIMS).fill(0);
  }
}

// ── Fire-and-forget embedder ──────────────────────────────────────────────────

/**
 * Generate an embedding for `text` and write it back to the `knowledge_chunks`
 * row identified by `chunkId`. Called with `void` so it never blocks the caller.
 */
async function embedChunkAsync(chunkId: string, text: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(text);
    const embeddingStr = `[${embedding.join(",")}]`;
    // Admin client bypasses RLS — knowledge_chunks has no user-scoped RLS; this is a
    // background async update called from a fire-and-forget embedding task.
    const admin = getAdminClient();
    const { error } = await admin
      .from("knowledge_chunks")
      .update({ embedding: embeddingStr })
      .eq("id", chunkId);
    if (error) {
      logger.warn("[tier1-store] embedChunkAsync update failed", {
        chunkId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[tier1-store] embedChunkAsync failed", {
      chunkId,
      error: String(err),
    });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type KnowledgeSourceType =
  | "git_commit"
  | "conversation_turn"
  | "code_file"
  | "ticket"
  | "pr_description"
  | "slack_message"
  | "causal_insight";

export interface RawChunkInput {
  source_type: KnowledgeSourceType;
  source_id?: string;
  source_url?: string;
  verbatim_text: string;
  metadata?: Record<string, unknown>;
  ingested_by?: string;
}

// ── Core insert ───────────────────────────────────────────────────────────────

/**
 * Insert a raw chunk into `knowledge_chunks` and fire-and-forget its embedding.
 * Returns the new chunk UUID, or null if the insert failed.
 */
export async function ingestRawChunk(
  orgId: string,
  input: RawChunkInput
): Promise<string | null> {
  try {
    const verbatim = input.verbatim_text.slice(0, MAX_TEXT_CHARS);
    // Admin client bypasses RLS — knowledge_chunks is a server-side write table with no
    // user-scoped RLS. orgId is validated by the caller before this library function is invoked.
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("knowledge_chunks")
      .insert({
        organization_id: orgId,
        source_type: input.source_type,
        source_id: input.source_id ?? null,
        source_url: input.source_url ?? null,
        verbatim_text: verbatim,
        metadata: input.metadata ?? {},
        ingested_by: input.ingested_by ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      logger.warn("[tier1-store] ingestRawChunk insert failed", {
        orgId,
        source_type: input.source_type,
        error: error?.message ?? "no data returned",
      });
      return null;
    }

    const chunkId: string = data.id;

    // Kick off embedding without blocking — intentional fire-and-forget
    void embedChunkAsync(chunkId, verbatim);

    return chunkId;
  } catch (err) {
    logger.warn("[tier1-store] ingestRawChunk threw", {
      orgId,
      error: String(err),
    });
    return null;
  }
}

// ── Typed convenience wrappers ────────────────────────────────────────────────

export interface GitCommitInput {
  sha: string;
  message: string;
  diff?: string;
  author?: string;
  repo: string;
  url?: string;
}

/**
 * Ingest a git commit. The verbatim text combines the commit message and diff
 * so semantic search can surface relevant commits from natural-language queries.
 */
export async function ingestGitCommit(
  orgId: string,
  commit: GitCommitInput
): Promise<string | null> {
  const { sha, message, diff, author, repo, url } = commit;
  const verbatim_text =
    `Commit ${sha} by ${author ?? "unknown"} in ${repo}:\n${message}\n\n${diff ?? ""}`.trimEnd();

  return ingestRawChunk(orgId, {
    source_type: "git_commit",
    source_id: sha,
    source_url: url,
    verbatim_text,
    metadata: { sha, repo, author: author ?? null },
  });
}

export interface ConversationTurnInput {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  /**
   * ProcessSession fields — set these when the conversation turn is part of a
   * workflow execution so the knowledge chunk is linked to the workflow run.
   * All fields are optional; omitting them is safe for non-workflow turns.
   */
  workflow_run_id?: string;
  process_step_id?: string;
  process_phase?: string;
}

/**
 * Ingest a single conversation turn (user prompt or assistant reply).
 * The role prefix lets semantic search distinguish intent from response.
 */
export async function ingestConversationTurn(
  orgId: string,
  turn: ConversationTurnInput
): Promise<string | null> {
  const { sessionId, role, content, metadata, workflow_run_id, process_step_id, process_phase } = turn;
  const verbatim_text = `[${role}]: ${content}`;

  // ProcessSession fields — only included when the turn is part of a workflow
  // run so the chunk can be linked back to the workflow execution record.
  const processSessionMeta: Record<string, unknown> = {};
  if (workflow_run_id) processSessionMeta.workflow_run_id = workflow_run_id;
  if (process_step_id) processSessionMeta.process_step_id = process_step_id;
  if (process_phase) processSessionMeta.process_phase = process_phase;

  return ingestRawChunk(orgId, {
    source_type: "conversation_turn",
    source_id: sessionId,
    verbatim_text,
    metadata: { sessionId, role, ...(metadata ?? {}), ...processSessionMeta },
  });
}

export interface CodeFileInput {
  path: string;
  content: string;
  repo: string;
  language?: string;
  commitSha?: string;
}

/**
 * Ingest a source code file. The path is prepended as a comment so the
 * semantic index understands which file the code belongs to.
 */
export async function ingestCodeFile(
  orgId: string,
  file: CodeFileInput
): Promise<string | null> {
  const { path, content, repo, language, commitSha } = file;
  const verbatim_text = `// ${path}\n${content}`;

  return ingestRawChunk(orgId, {
    source_type: "code_file",
    source_id: commitSha ? `${repo}@${commitSha}:${path}` : `${repo}:${path}`,
    verbatim_text,
    metadata: {
      path,
      repo,
      language: language ?? null,
      commitSha: commitSha ?? null,
    },
  });
}
