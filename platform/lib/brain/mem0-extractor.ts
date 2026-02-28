/**
 * Mem0-Style Memory Extraction
 *
 * Research-backed: 90% token reduction, 26% accuracy gain vs raw memory storage.
 * Instead of storing raw conversation text, an LLM decides ADD/UPDATE/DELETE/NOOP
 * for each fact, then only the structured facts are stored.
 *
 * Reference: Mem0 paper — structured fact graph vs raw text dumps.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { routeCallType } from "@/lib/brain/call-type-router";
import { captureStreamedResponse as _captureMemExtraction } from "@/lib/brain/claude-learning-capture";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemoryOperation = "ADD" | "UPDATE" | "DELETE" | "NOOP";

interface MemoryFact {
  operation: MemoryOperation;
  factId?: string; // existing fact UUID for UPDATE/DELETE
  content: string; // the fact as a short statement
  category:
    | "preference"
    | "fact"
    | "pattern"
    | "relationship"
    | "skill"
    | "context";
  importance: number; // 0–1
  entities: string[]; // key entities: user names, system names, etc.
  conflictsWith?: string; // existing factId this contradicts
  reasoning: string; // why this operation was chosen
}

interface ExtractionResult {
  operations: MemoryFact[];
  tokensProcessed: number;
  factsAdded: number;
  factsUpdated: number;
  factsDeleted: number;
}

// Shape of rows returned from ai_memory
interface AiMemoryRow {
  id: string;
  content: string;
  importance: number;
}

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  existingFacts: string,
  conversationText: string
): string {
  return `You are a memory extraction system. Given new conversation text and existing facts, determine which memory operations to perform.

Existing facts in memory:
<existing_facts>
${existingFacts || "(none yet)"}
</existing_facts>

New conversation/content to process:
<new_content>
${conversationText}
</new_content>

Return a JSON array of memory operations. Only include operations that are ADD, UPDATE, or DELETE — skip facts that need no change (NOOP). If nothing meaningful can be extracted, return an empty array [].

Format:
[
  {
    "operation": "ADD|UPDATE|DELETE|NOOP",
    "factId": "existing-fact-uuid (for UPDATE/DELETE only, omit for ADD)",
    "content": "the specific fact as a short statement (omit for DELETE)",
    "category": "preference|fact|pattern|relationship|skill|context",
    "importance": 0.0-1.0,
    "entities": ["entity1", "entity2"],
    "reasoning": "brief explanation"
  }
]

Rules:
- ADD: genuinely new information not already captured in existing facts
- UPDATE: fact exists but needs correction or enrichment (must include factId)
- DELETE: fact is now incorrect or contradicted (must include factId)
- NOOP: already known, no change needed — omit from output entirely
- Focus on facts that will help future interactions
- Importance scale: 0.9 = critical system knowledge, 0.5 = useful context, 0.2 = minor detail
- Prefer concise facts (1–2 sentences each)
- Maximum 10 operations per call`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extract structured facts from a conversation turn and apply
 * ADD/UPDATE/DELETE operations to ai_memory.
 *
 * @param supabase - Supabase client (service role recommended for writes)
 * @param orgId    - Organization/workspace ID
 * @param conversationText - The new conversation text (e.g. "User: ...\nAssistant: ...")
 * @param domain   - Memory domain, e.g. 'copilot', 'delivery', 'code'
 * @returns ExtractionResult with operation counts
 */
export async function extractAndUpdateMemory(
  supabase: SupabaseClient,
  orgId: string,
  conversationText: string,
  domain: string
): Promise<ExtractionResult> {
  const empty: ExtractionResult = {
    operations: [],
    tokensProcessed: 0,
    factsAdded: 0,
    factsUpdated: 0,
    factsDeleted: 0,
  };

  if (!conversationText || conversationText.trim().length < 50) {
    return empty;
  }

  // ── Step 1: Fetch existing facts for this org+domain ──────────────────────
  let existingFacts = "";
  let existingRows: AiMemoryRow[] = [];

  try {
    const { data } = await supabase
      .from("ai_memory")
      .select("id, content, importance")
      .eq("organization_id", orgId)
      .eq("domain", domain)
      .eq("memory_type", "fact")
      .gt("importance", 0.05) // exclude soft-deleted (importance → 0)
      .order("importance", { ascending: false })
      .limit(50);

    existingRows = (data as AiMemoryRow[]) ?? [];
    existingFacts = existingRows
      .map((r) => `[${r.id}]: ${r.content} (importance: ${r.importance.toFixed(2)})`)
      .join("\n");
  } catch (err) {
    logger.warn(
      "[Mem0] Failed to fetch existing facts (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    // Continue with empty existing facts — we can still ADD new ones
  }

  // ── Step 2: Call claude-haiku to decide operations ────────────────────────
  const prompt = buildExtractionPrompt(
    existingFacts,
    conversationText.slice(0, 3000) // cap to keep tokens predictable
  );

  let operations: MemoryFact[] = [];
  let tokensProcessed = 0;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: routeCallType('mem0-extract').model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    tokensProcessed =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Capture extracted memory operations as a learning signal (fire-and-forget)
    if (text && text.length > 30) {
      _captureMemExtraction(text.slice(0, 500), 0, {
        supabase,
        organizationId: orgId,
        domain: `mem0.${domain}`,
        inputSummary: conversationText.slice(0, 200),
        qualityThreshold: 0.35,
      });
    }

    // Parse JSON — find the first [...] array in the response
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]) as unknown[];
      // Filter to valid shape
      operations = parsed.filter(
        (op): op is MemoryFact =>
          op !== null &&
          typeof op === "object" &&
          "operation" in op &&
          typeof (op as MemoryFact).operation === "string" &&
          ["ADD", "UPDATE", "DELETE", "NOOP"].includes(
            (op as MemoryFact).operation
          )
      );
    }
  } catch (err) {
    logger.warn(
      "[Mem0] LLM extraction failed (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    return { ...empty, tokensProcessed };
  }

  if (operations.length === 0) {
    return { ...empty, tokensProcessed };
  }

  // Build a set of valid existing IDs for safety checks
  const existingIds = new Set(existingRows.map((r) => r.id));

  // ── Step 3: Apply operations to ai_memory ─────────────────────────────────
  let factsAdded = 0;
  let factsUpdated = 0;
  let factsDeleted = 0;
  const extractedAt = new Date().toISOString();

  // Batch ADD operations — single insert instead of N inserts
  const addOps = operations.filter(
    (op) => op.operation === "ADD" && op.content && op.content.trim().length > 0
  );
  if (addOps.length > 0) {
    const addRows = addOps.map((op) => ({
      organization_id: orgId,
      domain,
      memory_type: "fact",
      content: op.content!.trim().slice(0, 1000),
      importance: Math.min(1, Math.max(0, op.importance ?? 0.5)),
      metadata: {
        category: op.category ?? "fact",
        entities: op.entities ?? [],
        reasoning: op.reasoning ?? "",
        source: "mem0_extractor",
        extractedAt,
      },
    }));
    try {
      await supabase.from("ai_memory").insert(addRows);
      factsAdded = addRows.length;
    } catch (err) {
      logger.warn("[Mem0] Batch ADD failed (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  }

  // UPDATE and DELETE must remain individual (each targets a specific row by factId)
  for (const op of operations) {
    if (op.operation !== "UPDATE" && op.operation !== "DELETE") continue;
    try {
      if (op.operation === "UPDATE") {
        if (!op.factId || !existingIds.has(op.factId)) continue;
        if (!op.content || op.content.trim().length === 0) continue;

        await supabase
          .from("ai_memory")
          .update({
            content: op.content.trim().slice(0, 1000),
            importance: Math.min(1, Math.max(0, op.importance ?? 0.5)),
            metadata: {
              category: op.category ?? "fact",
              entities: op.entities ?? [],
              reasoning: op.reasoning ?? "",
              source: "mem0_extractor",
              updatedAt: extractedAt,
            },
            updated_at: extractedAt,
          })
          .eq("id", op.factId)
          .eq("organization_id", orgId); // RLS safety: scope to org
        factsUpdated++;
      } else if (op.operation === "DELETE") {
        if (!op.factId || !existingIds.has(op.factId)) continue;

        // Soft delete: set importance to 0, never hard delete (preserves audit trail)
        await supabase
          .from("ai_memory")
          .update({
            importance: 0,
            metadata: {
              softDeleted: true,
              reasoning: op.reasoning ?? "",
              source: "mem0_extractor",
              deletedAt: extractedAt,
            },
            updated_at: extractedAt,
          })
          .eq("id", op.factId)
          .eq("organization_id", orgId); // RLS safety: scope to org
        factsDeleted++;
      }
    } catch (err) {
      logger.warn(
        `[Mem0] Failed to apply op ${op.operation} (non-fatal):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  logger.warn(
    `[Mem0] org=${orgId.slice(0, 8)} domain=${domain} ` +
      `tokens=${tokensProcessed} add=${factsAdded} update=${factsUpdated} delete=${factsDeleted}`
  );

  return {
    operations,
    tokensProcessed,
    factsAdded,
    factsUpdated,
    factsDeleted,
  };
}

// ---------------------------------------------------------------------------
// Convenience wrapper — Mem0-style signature with userMessage + assistantResponse
// ---------------------------------------------------------------------------

/**
 * Extract structured facts from a user/assistant conversation turn.
 *
 * Convenience wrapper over extractAndUpdateMemory() that accepts the
 * user message and assistant response as separate arguments (matching
 * the Mem0 paper interface) and combines them before extraction.
 *
 * 90% token reduction vs storing raw conversation.
 * 26% accuracy gain vs unstructured memory storage.
 *
 * Fire-and-forget safe — never throws. Use with void.
 *
 * @param supabase          - Supabase client (service role recommended)
 * @param orgId             - Organization/workspace ID
 * @param userId            - User ID for scoping (stored in metadata)
 * @param userMessage       - The user's input message
 * @param assistantResponse - The assistant's response
 */
export async function extractAndStoreMemories(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    const conversationText = `User: ${userMessage.slice(0, 1000)}\nAssistant: ${assistantResponse.slice(0, 2000)}`;
    await extractAndUpdateMemory(supabase, orgId, conversationText, `copilot.${userId.slice(0, 8)}`);
  } catch (err) {
    logger.warn("[Mem0] extractAndStoreMemories failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}
