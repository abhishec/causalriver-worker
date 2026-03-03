/**
 * Style Extractor (ADR-029 Phase 5)
 * ==================================
 * Analyzes a corpus of document chunks to extract a writing style profile.
 * Used by Product Analyst agent to learn and replicate an organization's
 * writing conventions, terminology, and structural patterns.
 *
 * Flow:
 *   1. If corpusId given, load document_filter from agent_corpus
 *   2. Fetch up to sampleSize chunks from that filtered set
 *   3. Send concatenated sample to Haiku for structured style analysis
 *   4. Parse response into StyleProfile
 *   5. Persist the profile back to agent_corpus.style_profile
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { searchDocumentChunksScoped } from "@/lib/connectors/document-ingester";

// ── Env (static capture for Amplify Lambda) ───────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StyleProfile {
  /** Mean words per sentence across the sample. */
  avgSentenceLength: number;
  /** Mean sentences per paragraph across the sample. */
  avgParagraphLength: number;
  /** Top 20 domain-specific terms (proper nouns, acronyms, jargon). */
  vocabulary: string[];
  /**
   * Structural patterns detected, e.g.:
   * "As a [role], I want [goal] so that [reason]"
   * "Given / When / Then"
   */
  patterns: string[];
  /**
   * Formatting conventions, e.g.:
   * "bullet points", "numbered acceptance criteria", "bold headers"
   */
  formatting: string[];
  /**
   * Reusable template skeletons extracted from the documents, e.g.:
   * "## User Story\n**As a** <role>…\n**Acceptance Criteria**\n- [ ] …"
   */
  templates: string[];
  /** Overall tone: "formal" | "informal" | "technical" | "conversational" */
  tone: string;
  /** ISO timestamp of when this profile was created. */
  extractedAt: string;
}

interface DocumentFilter {
  documentIds?: string[];
  ingestionJobIds?: string[];
  sourceTypes?: string[];
}

interface CorpusRow {
  document_filter: unknown;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Load the document_filter from an agent_corpus row.
 * Returns null when the corpus doesn't exist or has no filter.
 */
async function loadDocumentFilter(
  supabase: SupabaseClient,
  corpusId: string
): Promise<DocumentFilter | null> {
  const { data, error } = await supabase
    .from("agent_corpus")
    .select("document_filter")
    .eq("id", corpusId)
    .single();

  if (error || !data) {
    logger.warn("[style-extractor] Could not load corpus document_filter", {
      corpusId,
      error: error?.message ?? "no data",
    });
    return null;
  }

  const row = data as CorpusRow;
  const filter = row.document_filter;
  if (!filter || typeof filter !== "object") return null;

  const f = filter as Record<string, unknown>;
  return {
    documentIds: Array.isArray(f["documentIds"]) ? (f["documentIds"] as string[]) : undefined,
    ingestionJobIds: Array.isArray(f["ingestionJobIds"])
      ? (f["ingestionJobIds"] as string[])
      : undefined,
    sourceTypes: Array.isArray(f["sourceTypes"]) ? (f["sourceTypes"] as string[]) : undefined,
  };
}

/**
 * Call Haiku with a style analysis prompt.
 * Returns the raw text from the model, or null on failure.
 */
async function callHaikuForStyleAnalysis(sampleText: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn("[style-extractor] ANTHROPIC_API_KEY not set — cannot extract style");
    return null;
  }

  const systemPrompt = `You are an expert technical writer and linguist.
Your task is to analyze a sample of documents and extract a precise, structured writing style profile.
Respond ONLY with a valid JSON object — no markdown fences, no prose before or after.`;

  const userContent = `Analyze the following document sample and return a JSON object with this exact shape:

{
  "avgSentenceLength": <number: average words per sentence>,
  "avgParagraphLength": <number: average sentences per paragraph>,
  "vocabulary": [<array of up to 20 domain-specific terms, acronyms, or proper nouns that appear frequently>],
  "patterns": [<array of structural writing patterns, e.g. "As a [role], I want [goal] so that [reason]", "Given/When/Then">],
  "formatting": [<array of formatting conventions used, e.g. "numbered acceptance criteria", "H2 section headers", "bold field labels">],
  "templates": [<array of up to 3 reusable template skeletons detected, preserving actual structure with placeholder markers>],
  "tone": <one of: "formal", "informal", "technical", "conversational">
}

DOCUMENT SAMPLE:
---
${sampleText.slice(0, 12000)}
---`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("[style-extractor] Haiku API error", {
        status: response.status,
        body: body.slice(0, 200),
      });
      return null;
    }

    const data = (await response.json()) as AnthropicResponse;
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    logger.warn("[style-extractor] Haiku fetch threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Parse the raw JSON string from Haiku into a StyleProfile.
 * Applies safe defaults for any missing or invalid fields.
 */
function parseStyleProfile(raw: string): StyleProfile | null {
  // Strip any accidental markdown fences
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (err) {
    logger.warn("[style-extractor] Failed to parse Haiku JSON response", {
      error: err instanceof Error ? err.message : String(err),
      rawSnippet: cleaned.slice(0, 200),
    });
    return null;
  }

  const profile: StyleProfile = {
    avgSentenceLength: typeof parsed["avgSentenceLength"] === "number"
      ? parsed["avgSentenceLength"]
      : 15,
    avgParagraphLength: typeof parsed["avgParagraphLength"] === "number"
      ? parsed["avgParagraphLength"]
      : 3,
    vocabulary: Array.isArray(parsed["vocabulary"])
      ? (parsed["vocabulary"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .slice(0, 20)
      : [],
    patterns: Array.isArray(parsed["patterns"])
      ? (parsed["patterns"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    formatting: Array.isArray(parsed["formatting"])
      ? (parsed["formatting"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    templates: Array.isArray(parsed["templates"])
      ? (parsed["templates"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .slice(0, 3)
      : [],
    tone: typeof parsed["tone"] === "string" ? parsed["tone"] : "formal",
    extractedAt: new Date().toISOString(),
  };

  return profile;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ExtractStyleProfileParams {
  organizationId: string;
  /** agent_corpus.id — fetch document_filter from here */
  corpusId?: string;
  /** Pass document filter directly (used when no corpus row exists yet) */
  documentFilter?: DocumentFilter;
  /** Number of chunks to sample (default: 30) */
  sampleSize?: number;
}

/**
 * Analyze a corpus of document chunks and extract a StyleProfile.
 *
 * When corpusId is provided, the profile is persisted back to agent_corpus.style_profile.
 * Returns null when insufficient data is available or the API call fails.
 */
export async function extractStyleProfile(
  supabase: SupabaseClient,
  params: ExtractStyleProfileParams
): Promise<StyleProfile | null> {
  const { organizationId, corpusId, sampleSize = 30 } = params;

  // ── 1. Resolve document filter ────────────────────────────────────────────────
  let documentFilter = params.documentFilter ?? null;

  if (!documentFilter && corpusId) {
    documentFilter = await loadDocumentFilter(supabase, corpusId);
  }

  // ── 2. Fetch sample chunks ────────────────────────────────────────────────────
  let chunks: Array<{ chunk_text: string; document_title: string | null }> = [];
  try {
    // Empty query with a large limit → returns most recent chunks from the scope
    chunks = await searchDocumentChunksScoped(
      supabase,
      organizationId,
      "", // empty query → recency fetch
      documentFilter ?? undefined,
      sampleSize
    );
  } catch (err) {
    logger.warn("[style-extractor] Failed to fetch document chunks", {
      organizationId,
      corpusId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (chunks.length === 0) {
    // Fallback: fetch globally from the org without scope filtering
    try {
      const { data } = await supabase
        .from("document_chunks")
        .select("chunk_text, document_title")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(sampleSize);

      chunks = (data ?? []) as Array<{ chunk_text: string; document_title: string | null }>;
    } catch (err) {
      logger.warn("[style-extractor] Global chunk fallback failed", {
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (chunks.length === 0) {
    logger.warn("[style-extractor] No document chunks available for style analysis", {
      organizationId,
      corpusId,
    });
    return null;
  }

  // ── 3. Build sample text ──────────────────────────────────────────────────────
  const sampleText = chunks
    .map((c) => {
      const title = c.document_title ? `## ${c.document_title}\n` : "";
      return `${title}${c.chunk_text}`;
    })
    .join("\n\n---\n\n");

  // ── 4. Call Haiku for analysis ────────────────────────────────────────────────
  const rawResponse = await callHaikuForStyleAnalysis(sampleText);
  if (!rawResponse) {
    return null;
  }

  // ── 5. Parse response ─────────────────────────────────────────────────────────
  const profile = parseStyleProfile(rawResponse);
  if (!profile) {
    return null;
  }

  logger.warn("[style-extractor] Style profile extracted", {
    organizationId,
    corpusId,
    chunksAnalyzed: chunks.length,
    tone: profile.tone,
    vocabularyTerms: profile.vocabulary.length,
    patternsFound: profile.patterns.length,
  });

  // ── 6. Persist to agent_corpus if corpusId provided ───────────────────────────
  if (corpusId) {
    const { error: updateErr } = await supabase
      .from("agent_corpus")
      .update({
        style_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", corpusId);

    if (updateErr) {
      logger.warn("[style-extractor] Failed to persist style_profile to agent_corpus", {
        corpusId,
        error: updateErr.message,
      });
      // Non-fatal — return the profile even if persistence fails
    }
  }

  return profile;
}
