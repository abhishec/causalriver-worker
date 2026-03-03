/**
 * Interactive Agent Executor
 * ==========================
 * Executes a single turn of an interactive agent session.
 *
 * Flow per turn:
 *   1. (Optional) Record feedback on the previous turn
 *   2. Load session context (history, knowledge scope, agent type)
 *   3. Retrieve scoped RAG results from the agent's document corpus
 *   4. Load few-shot examples from agent_corpus if available
 *   5. Build a structured prompt (system + conversation history + RAG + few-shots)
 *   6. Call Claude Haiku for cost-efficient generation
 *   7. Record the turn and return the result
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  getSessionContext,
  recordSessionTurn,
  updateSessionFeedback,
} from "@/lib/agents/session-manager";
import { searchDocumentChunksScoped } from "@/lib/connectors/document-ingester";

// ── Env var (static capture for Amplify Lambda compatibility) ─────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InteractiveAgentResult {
  output: string;
  turnId: string;
  turnNumber: number;
  sessionId: string;
  tokensUsed?: number;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

// ── Agent type → system prompt descriptions ───────────────────────────────────

const AGENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  "document-qa": "You are a document Q&A assistant. Answer questions accurately based on the provided documents. Cite relevant sections when possible.",
  "content-writer": "You are a professional content writer. Create clear, engaging, and well-structured content based on the user's brief and any provided reference documents.",
  "data-analyst": "You are a data analysis assistant. Interpret data, identify trends, and provide actionable insights. Be precise and support conclusions with evidence.",
  "code-reviewer": "You are an expert code reviewer. Analyze code for correctness, security vulnerabilities, performance issues, and style. Provide specific, actionable feedback.",
  "summarizer": "You are a precise summarization assistant. Extract the key points and essential information from documents or text, preserving the most important details.",
  "researcher": "You are a research assistant. Synthesize information from multiple sources, identify patterns, and provide well-reasoned analyses.",
  "custom": "You are a helpful AI assistant. Complete tasks accurately and thoughtfully based on the provided context and user instructions.",
};

function getAgentSystemDescription(agentType: string): string {
  return AGENT_TYPE_DESCRIPTIONS[agentType] ?? AGENT_TYPE_DESCRIPTIONS["custom"];
}

// ── Few-shot loading ───────────────────────────────────────────────────────────

interface FewShotExample {
  input: string;
  output: string;
  description?: string;
}

interface CorpusRow {
  few_shot_examples: unknown;
  style_profile: unknown;
}

async function loadCorpusForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ fewShotExamples: FewShotExample[]; styleProfile: string | null } | null> {
  const { data, error } = await supabase
    .from("agent_corpus")
    .select("few_shot_examples, style_profile")
    .eq("agent_session_id", sessionId)
    .limit(1)
    .single();

  if (error || !data) {
    // No corpus is normal — many sessions don't have one
    return null;
  }

  const row = data as CorpusRow;
  const rawExamples = Array.isArray(row.few_shot_examples) ? row.few_shot_examples : [];
  const fewShotExamples = rawExamples.filter(
    (ex): ex is FewShotExample =>
      typeof ex === "object" &&
      ex !== null &&
      "input" in ex &&
      "output" in ex
  );

  const styleProfile =
    typeof row.style_profile === "string" && row.style_profile.trim()
      ? row.style_profile
      : null;

  return { fewShotExamples, styleProfile };
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildSystemPrompt(params: {
  agentType: string;
  sessionName: string | null;
  styleProfile: string | null;
  ragResults: Array<{ chunk_text: string; document_title: string | null }>;
  fewShotExamples: FewShotExample[];
  sessionContext: Record<string, unknown>;
}): string {
  const parts: string[] = [];

  // 1. Agent identity
  parts.push(getAgentSystemDescription(params.agentType));

  // 2. Session name context (helps orient the agent)
  if (params.sessionName) {
    parts.push(`\nSession: "${params.sessionName}"`);
  }

  // 3. Style guide from corpus
  if (params.styleProfile) {
    parts.push(`\n## STYLE GUIDE\n${params.styleProfile}`);
  }

  // 4. Session context metadata (e.g., domain-specific flags set by the application)
  const contextKeys = Object.keys(params.sessionContext).filter(
    (k) => k !== "completed_at"
  );
  if (contextKeys.length > 0) {
    const contextLines = contextKeys
      .map((k) => `- ${k}: ${JSON.stringify(params.sessionContext[k])}`)
      .join("\n");
    parts.push(`\n## SESSION CONTEXT\n${contextLines}`);
  }

  // 5. RAG results — injected as system context, not user messages
  if (params.ragResults.length > 0) {
    const docSections = params.ragResults
      .map((r, i) => {
        const title = r.document_title ? `[${r.document_title}]` : `[Document ${i + 1}]`;
        return `${title}\n${r.chunk_text}`;
      })
      .join("\n\n---\n\n");
    parts.push(`\n## RELEVANT DOCUMENTS\n${docSections}`);
  }

  // 6. Few-shot examples from corpus
  if (params.fewShotExamples.length > 0) {
    const exampleLines = params.fewShotExamples
      .slice(0, 5) // cap at 5 to stay within token budget
      .map((ex, i) => {
        const header = ex.description ? `Example ${i + 1}: ${ex.description}` : `Example ${i + 1}`;
        return `${header}\nInput: ${ex.input}\nOutput: ${ex.output}`;
      })
      .join("\n\n");
    parts.push(`\n## EXAMPLES FROM PAST SESSIONS\n${exampleLines}`);
  }

  return parts.join("\n");
}

function buildConversationMessages(
  recentTurns: Array<{
    turnNumber: number;
    userInput: string | null;
    agentOutput: string | null;
    userFeedback: string | null;
    revisionNotes: string | null;
  }>,
  currentUserInput: string,
  maxHistoryTurns = 5
): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // Include last N turns as conversation history
  const historyTurns = recentTurns.slice(-maxHistoryTurns);

  for (const turn of historyTurns) {
    if (turn.userInput) {
      messages.push({ role: "user", content: turn.userInput });
    }
    if (turn.agentOutput) {
      let assistantContent = turn.agentOutput;
      // Annotate with feedback context so the agent knows what was approved/revised
      if (turn.userFeedback === "rejected") {
        assistantContent += "\n\n[Note: This response was rejected by the user.]";
        if (turn.revisionNotes) {
          assistantContent += ` Revision requested: ${turn.revisionNotes}`;
        }
      } else if (turn.userFeedback === "revised") {
        assistantContent += "\n\n[Note: This response was revised.]";
        if (turn.revisionNotes) {
          assistantContent += ` Revision notes: ${turn.revisionNotes}`;
        }
      }
      messages.push({ role: "assistant", content: assistantContent });
    }
  }

  // Append the current user input
  messages.push({ role: "user", content: currentUserInput });

  return messages;
}

// ── Main executor ──────────────────────────────────────────────────────────────

export async function executeInteractiveAgent(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    userInput: string;
    organizationId: string;
    userId: string;
    agentType: string;
    feedback?: { type: "approved" | "rejected" | "revised"; notes?: string };
  }
): Promise<InteractiveAgentResult> {
  const { sessionId, userInput, organizationId, agentType, feedback } = params;

  // ── Step 1: Record feedback on the previous turn if provided ─────────────────
  if (feedback?.type) {
    // The caller must pass the turnId of the previous turn. If it's missing,
    // we skip — don't block the new turn over a missing feedback update.
    const turnIdForFeedback = (feedback as { type: string; notes?: string; turnId?: string }).turnId;
    if (turnIdForFeedback) {
      const feedbackRecorded = await updateSessionFeedback(supabase, turnIdForFeedback, feedback);
      if (!feedbackRecorded) {
        logger.warn("[interactive-executor] Failed to record feedback (non-fatal)", {
          sessionId,
          turnId: turnIdForFeedback,
        });
      }
    }
  }

  // ── Step 2: Load session context ─────────────────────────────────────────────
  const sessionCtx = await getSessionContext(supabase, sessionId);
  if (!sessionCtx) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // ── Step 3: Scoped RAG retrieval ─────────────────────────────────────────────
  let ragResults: Array<{ chunk_text: string; document_title: string | null; chunk_index: number; source_type: string }> = [];
  try {
    ragResults = await searchDocumentChunksScoped(
      supabase,
      organizationId,
      userInput,
      sessionCtx.knowledgeScope,
      5
    );
  } catch (ragErr) {
    logger.warn("[interactive-executor] RAG search failed (non-fatal)", {
      sessionId,
      error: ragErr instanceof Error ? ragErr.message : String(ragErr),
    });
  }

  // ── Step 4: Load few-shot examples from corpus ───────────────────────────────
  let fewShotExamples: FewShotExample[] = [];
  let styleProfile: string | null = null;
  try {
    const corpus = await loadCorpusForSession(supabase, sessionId);
    if (corpus) {
      fewShotExamples = corpus.fewShotExamples;
      styleProfile = corpus.styleProfile;
    }
  } catch (corpusErr) {
    logger.warn("[interactive-executor] Corpus load failed (non-fatal)", {
      sessionId,
      error: corpusErr instanceof Error ? corpusErr.message : String(corpusErr),
    });
  }

  // ── Step 5: Build prompt ──────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    agentType,
    sessionName: sessionCtx.sessionName,
    styleProfile,
    ragResults,
    fewShotExamples,
    sessionContext: sessionCtx.sessionContext,
  });

  const conversationMessages = buildConversationMessages(
    sessionCtx.recentTurns,
    userInput,
    5
  );

  // ── Step 6: Call Claude Haiku ─────────────────────────────────────────────────
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  let agentOutput = "";
  let tokensUsed: number | undefined;

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
        max_tokens: 4096,
        system: systemPrompt,
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    agentOutput =
      data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("") || "[No output generated]";

    if (data.usage) {
      tokensUsed = data.usage.input_tokens + data.usage.output_tokens;
    }
  } catch (claudeErr) {
    logger.error("[interactive-executor] Claude API call failed", {
      sessionId,
      error: claudeErr instanceof Error ? claudeErr.message : String(claudeErr),
    });
    throw claudeErr;
  }

  // ── Step 7: Record the turn ───────────────────────────────────────────────────
  const turnResult = await recordSessionTurn(supabase, sessionId, {
    userInput,
    agentOutput,
  });

  if (!turnResult) {
    throw new Error(`Failed to record turn for session ${sessionId}`);
  }

  logger.warn("[interactive-executor] Turn executed", {
    sessionId,
    turnId: turnResult.turnId,
    turnNumber: turnResult.turnNumber,
    agentType,
    ragResultsUsed: ragResults.length,
    fewShotExamplesUsed: fewShotExamples.length,
    tokensUsed,
  });

  return {
    output: agentOutput,
    turnId: turnResult.turnId,
    turnNumber: turnResult.turnNumber,
    sessionId,
    tokensUsed,
  };
}
