/**
 * Primitive Registry — ADR-030 Universal Capability Engine
 * =========================================================
 *
 * Standard atomic operations that workflow capabilities compose together.
 * Every capability in capability_library.workflow_definition references
 * primitives by name. The UCE resolves them here.
 *
 * Primitives:
 *   crawl       — BFS crawl of URLs, returns CrawledPage[]
 *   ingest      — Create a bulk ingestion job (returns jobId)
 *   call_llm    — Anthropic API call (Haiku/Sonnet/Opus), returns text
 *   persist     — Write a record to a Supabase table, returns id
 *   search      — Vector search document chunks scoped to a corpus
 *   session     — Create / continue an agent session
 *   inject      — Return messages to inject into the LLM conversation
 *   checkpoint  — Persist intermediate state for Lambda-safe resumption
 *
 * Each primitive takes a typed Params object and returns a typed Result.
 * The UCE resolves $params.X and $steps.Y.Z references before calling.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { crawlWebsitesToArray } from "@/lib/connectors/web-crawler";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import { createIngestionJob } from "@/lib/connectors/batch-ingestion-orchestrator";
import { searchDocumentChunksScoped } from "@/lib/connectors/document-ingester";
import {
  createAgentSession,
  recordSessionTurn,
  getSessionContext,
} from "@/lib/agents/session-manager";
import { extractStyleProfile } from "@/lib/agents/style-extractor";

// ── Static env capture (Amplify Lambda) ─────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

// ── Type: execution context passed to every primitive ────────────────────────

export interface PrimitiveContext {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  aiWorkerId?: string;
}

// ── Result type returned by every primitive ──────────────────────────────────

export type PrimitiveResult = Record<string, unknown>;

// ── Individual param/result interfaces ──────────────────────────────────────

export interface CrawlPrimitiveParams {
  urls: string[];
  maxDepth?: number;
  maxPages?: number;
  allowedDomains?: string[];
}

export interface IngestPrimitiveParams {
  connectorType: string;           // 'confluence' | 'google_drive' | 'web_crawler' | 'upload'
  sourceConfig: Record<string, unknown>;
}

export interface CallLlmPrimitiveParams {
  model?: string;                  // default: claude-3-5-haiku-20241022
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}

export interface PersistPrimitiveParams {
  table: string;
  data: Record<string, unknown>;
}

export interface SearchPrimitiveParams {
  query: string;
  documentIds?: string[];
  ingestionJobIds?: string[];
  limit?: number;
}

export interface SessionPrimitiveParams {
  action: "create" | "continue" | "create_corpus" | "extract_style";
  agentType?: string;
  sessionName?: string;
  knowledgeScope?: { documentIds?: string[]; ingestionJobIds?: string[] };
  corpusId?: string;
  userInput?: string;
  ingestionJobIds?: string[];
}

export interface InjectPrimitiveParams {
  messages: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface WebSearchPrimitiveParams {
  query: string;
  limit?: number;
}

export interface BrowserPrimitiveParams {
  action: "navigate" | "extract" | "screenshot";
  url: string;
  waitFor?: number;
  fullPage?: boolean;
}

// ── Primitive implementations ────────────────────────────────────────────────

/**
 * crawl — BFS crawl a list of URLs and return page content.
 */
async function executeCrawl(
  ctx: PrimitiveContext,
  params: CrawlPrimitiveParams,
): Promise<PrimitiveResult> {
  const { urls, maxDepth = 2, maxPages = 30, allowedDomains } = params;

  if (!urls?.length) {
    return { crawledPages: [], totalPages: 0 };
  }

  const seedUrls = urls.filter(Boolean);
  logger.warn("[primitive:crawl] Starting crawl", {
    seeds: seedUrls.length,
    maxDepth,
    maxPages,
    orgId: ctx.organizationId,
  });

  const pages = await crawlWebsitesToArray({
    seedUrls,
    maxDepth,
    maxPages,
    allowedDomains,
  });

  // Also ingest each page into document_chunks so the knowledge base grows
  let ingestedCount = 0;
  for (const page of pages) {
    try {
      await ingestDocument(ctx.supabase, {
        organizationId: ctx.organizationId,
        sourceUrl: page.url,
        sourceType: "text",  // "web" not in enum — use "text" for crawled pages
        documentTitle: page.title,
        content: page.textContent,
        metadata: { aiWorkerId: ctx.aiWorkerId, crawlDepth: page.depth },
      });
      ingestedCount++;
    } catch (err) {
      logger.warn("[primitive:crawl] Ingest failed for page (non-fatal)", {
        url: page.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.warn("[primitive:crawl] Crawl complete", {
    totalPages: pages.length,
    ingestedCount,
    orgId: ctx.organizationId,
  });

  return {
    crawledPages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      textContent: p.textContent.slice(0, 3000), // cap per page for LLM context
    })),
    totalPages: pages.length,
    ingestedCount,
  };
}

/**
 * ingest — Create a bulk ingestion job for a connector source.
 * Returns immediately with jobId — cron processes asynchronously.
 */
async function executeIngest(
  ctx: PrimitiveContext,
  params: IngestPrimitiveParams,
): Promise<PrimitiveResult> {
  const { connectorType, sourceConfig } = params;

  // Normalize connector type: hyphens → underscores (common typo guard)
  const normalizedType = connectorType.replace(/-/g, "_");

  const jobId = await createIngestionJob(ctx.supabase, {
    organizationId: ctx.organizationId,
    aiWorkerId: ctx.aiWorkerId,
    connectorType: normalizedType,
    sourceConfig,
    createdBy: ctx.userId,
  });

  if (!jobId) {
    logger.warn("[primitive:ingest] Failed to create ingestion job", {
      connectorType: normalizedType,
      orgId: ctx.organizationId,
    });
    return { jobId: null, created: false };
  }

  logger.warn("[primitive:ingest] Ingestion job created", {
    jobId,
    connectorType: normalizedType,
    orgId: ctx.organizationId,
  });

  return { jobId, created: true };
}

/**
 * call_llm — Call Anthropic API (any model) and return the text response.
 */
async function executeCallLlm(
  _ctx: PrimitiveContext,
  params: CallLlmPrimitiveParams,
): Promise<PrimitiveResult> {
  const {
    model = "claude-3-5-haiku-20241022",
    systemPrompt,
    userMessage,
    maxTokens = 2000,
  } = params;

  if (!ANTHROPIC_API_KEY) {
    logger.warn("[primitive:call_llm] ANTHROPIC_API_KEY not set");
    return { text: "", error: "API key not configured" };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      // Timeout: prevents Lambda from hanging if Anthropic is slow/overloaded
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("[primitive:call_llm] API error", {
        status: response.status,
        body: body.slice(0, 200),
      });
      return { text: "", error: `API error ${response.status}` };
    }

    let data: { content: Array<{ type: string; text: string }> };
    try {
      data = await response.json() as typeof data;
    } catch {
      logger.warn("[primitive:call_llm] JSON parse failed on Anthropic response");
      return { text: "", error: "Invalid API response (JSON parse failed)" };
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[primitive:call_llm] Fetch threw", { error: msg });
    return { text: "", error: msg };
  }
}

/**
 * persist — Insert a record into any Supabase table, return the inserted id.
 */
async function executePersist(
  ctx: PrimitiveContext,
  params: PersistPrimitiveParams,
): Promise<PrimitiveResult> {
  const { table, data } = params;

  const payload = {
    ...data,
    organization_id: ctx.organizationId,
    created_by: ctx.userId,
  };

  const { data: inserted, error } = await ctx.supabase
    .from(table)
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    logger.warn("[primitive:persist] Insert failed", {
      table,
      error: error.message,
      orgId: ctx.organizationId,
    });
    return { id: null, persisted: false };
  }

  return { id: (inserted as Record<string, unknown>)["id"] ?? null, persisted: true };
}

/**
 * search — Vector search document_chunks scoped to a corpus.
 */
async function executeSearch(
  ctx: PrimitiveContext,
  params: SearchPrimitiveParams,
): Promise<PrimitiveResult> {
  const { query, documentIds, ingestionJobIds, limit = 10 } = params;

  const chunks = await searchDocumentChunksScoped(
    ctx.supabase,
    ctx.organizationId,
    query,
    { documentIds, ingestionJobIds },
    limit,
  );

  return {
    chunks,
    count: chunks.length,
  };
}

/**
 * session — Create, continue, or augment an agent session.
 *
 * Actions:
 *   create         — create a new agent_sessions row
 *   continue       — run one interactive turn on the most recent active session
 *   create_corpus  — create an agent_corpus row tied to ingestion jobs
 *   extract_style  — extract writing style profile from a corpus
 */
async function executeSession(
  ctx: PrimitiveContext,
  params: SessionPrimitiveParams,
): Promise<PrimitiveResult> {
  const { action } = params;

  switch (action) {
    case "create": {
      const result = await createAgentSession(ctx.supabase, {
        organizationId: ctx.organizationId,
        aiWorkerId: ctx.aiWorkerId,
        agentType: params.agentType ?? "generic",
        sessionName: params.sessionName ?? "Session",
        knowledgeScope: params.knowledgeScope,
      });
      return { sessionId: result?.sessionId ?? null };
    }

    case "continue": {
      // Find the most recent active session for this org/worker
      const query = ctx.supabase
        .from("agent_sessions")
        .select("id, agent_type")
        .eq("organization_id", ctx.organizationId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);

      const { data: sessions } = await query;
      const activeSession = sessions?.[0] as
        | { id: string; agent_type: string }
        | undefined;

      if (!activeSession) {
        return {
          error: "No active session found. Start a new session first.",
          output: null,
          sessionId: null,
          turnNumber: 0,
        };
      }

      // Get session context for prompt building
      const sessionCtx = await getSessionContext(ctx.supabase, activeSession.id);
      if (!sessionCtx) {
        return { error: "Session context not found", output: null };
      }

      // Build conversation history from previous turns
      const historyMessages = sessionCtx.recentTurns.flatMap((t) => {
        const msgs: Array<{ role: string; content: string }> = [];
        if (t.userInput) msgs.push({ role: "user", content: t.userInput });
        if (t.agentOutput) msgs.push({ role: "assistant", content: t.agentOutput });
        if (t.userFeedback && t.userFeedback !== "approved") {
          msgs.push({
            role: "user",
            content: `[Feedback: ${t.userFeedback}${t.revisionNotes ? ` — ${t.revisionNotes}` : ""}]`,
          });
        }
        return msgs;
      });

      // Search scoped corpus for relevant context
      const relevantChunks = await searchDocumentChunksScoped(
        ctx.supabase,
        ctx.organizationId,
        params.userInput ?? "",
        sessionCtx.knowledgeScope,
        5,
      );

      const corpusContext = relevantChunks.length > 0
        ? `\n\n## Relevant Reference Material\n${relevantChunks
            .map((c) =>
              `### ${c.document_title ?? "Document"}\n${c.chunk_text}`)
            .join("\n\n")}`
        : "";

      // Build system prompt incorporating session context
      const systemPrompt =
        `You are a ${activeSession.agent_type} agent. You are in an active interactive session.\n` +
        `Session: ${sessionCtx.sessionName ?? activeSession.agent_type}\n` +
        `Turn: ${sessionCtx.turnCount + 1}\n` +
        corpusContext;

      // Call LLM with session history
      const messages = [
        ...historyMessages,
        { role: "user", content: params.userInput ?? "" },
      ];

      if (!ANTHROPIC_API_KEY) {
        return { error: "API key not configured", output: null };
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 3000,
          system: systemPrompt,
          messages,
        }),
        // Timeout: prevents Lambda from hanging if Anthropic is slow/overloaded
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        return { error: `LLM error ${response.status}`, output: null };
      }

      let data: { content: Array<{ type: string; text: string }> };
      try {
        data = await response.json() as typeof data;
      } catch {
        logger.warn("[primitive:session:continue] JSON parse failed on Anthropic response");
        return { error: "Invalid API response (JSON parse failed)", output: null };
      }
      const output = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // Record the turn
      const turn = await recordSessionTurn(ctx.supabase, activeSession.id, {
        userInput: params.userInput ?? "",
        agentOutput: output,
      });

      return {
        sessionId: activeSession.id,
        turnNumber: turn?.turnNumber ?? 0,
        turnId: turn?.turnId ?? null,
        output,
      };
    }

    case "create_corpus": {
      const jobIds = (params.ingestionJobIds ?? []).filter(Boolean);
      const docIds = (params.knowledgeScope?.documentIds ?? []).filter(Boolean);

      const { data: corpus, error } = await ctx.supabase
        .from("agent_corpus")
        .insert({
          organization_id: ctx.organizationId,
          ai_worker_id: ctx.aiWorkerId ?? null,
          corpus_name: "Ingested Corpus",
          document_filter: {
            ingestionJobIds: jobIds.length > 0 ? jobIds : undefined,
            documentIds: docIds.length > 0 ? docIds : undefined,
          },
          few_shot_examples: [],
          style_profile: {},
        })
        .select("id")
        .single();

      if (error || !corpus) {
        logger.warn("[primitive:session:create_corpus] Failed", { error: error?.message });
        return { corpusId: null };
      }

      return { corpusId: (corpus as Record<string, unknown>)["id"] };
    }

    case "extract_style": {
      if (!params.corpusId) {
        return { styleProfile: null, error: "corpusId required" };
      }

      const profile = await extractStyleProfile(ctx.supabase, {
        organizationId: ctx.organizationId,
        corpusId: params.corpusId,
        sampleSize: 30,
      });

      return { styleProfile: profile };
    }

    default:
      return { error: `Unknown session action: ${String(action)}` };
  }
}

/**
 * inject — Return injected messages for LLM context augmentation.
 * This primitive doesn't call any service — it just structures the output
 * so the UCE knows to inject these into the chat route's message stream.
 */
function executeInject(
  _ctx: PrimitiveContext,
  params: InjectPrimitiveParams,
): PrimitiveResult {
  return {
    injectedMessages: params.messages,
    metadata: params.metadata ?? {},
    injected: true,
  };
}

// ── Exponential backoff helper for external API calls ────────────────────────
// Retries on 429 (rate limit) and 5xx (transient server errors).
// Brave and Browserless both return 429 during high-traffic periods.
// Per-attempt 15s timeout prevents Lambda from hanging on slow upstream APIs.

const EXTERNAL_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  const delays = [1000, 2000];
  let lastResp: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Each attempt gets its own AbortController — timeout resets on retry
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) return resp;
      if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
        lastResp = resp;
        await new Promise((r) => setTimeout(r, delays[attempt] + Math.random() * 200));
        continue;
      }
      return resp; // non-retryable error — return as-is so caller handles it
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = (err as Error)?.name === "AbortError";
      if (isAbort && attempt < maxRetries) {
        logger.warn("[fetchWithRetry] Timeout — retrying", { attempt, url: url.slice(0, 80) });
        await new Promise((r) => setTimeout(r, delays[attempt] + Math.random() * 200));
        continue;
      }
      throw isAbort ? new Error(`External API timeout after ${EXTERNAL_FETCH_TIMEOUT_MS / 1000}s`) : err;
    }
  }
  return lastResp!;
}

/**
 * web_search — Enterprise real-time web search via Brave Search API.
 * Returns structured search results (title, url, description).
 * Retries 2× on 429/5xx with 1s/2s backoff.
 */
async function executeWebSearch(
  params: WebSearchPrimitiveParams,
): Promise<PrimitiveResult> {
  if (!BRAVE_SEARCH_API_KEY) {
    return { results: [], error: "BRAVE_SEARCH_API_KEY not configured" };
  }

  try {
    // Validate query — empty/null query causes 400 from Brave or meaningless results
    const query = String(params.query ?? "").trim();
    if (!query) return { results: [], error: "query is required" };

    const count = Math.min(params.limit ?? 5, 20);
    const resp = await fetchWithRetry(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
          Accept: "application/json",
        },
      },
    );

    if (!resp.ok) {
      logger.warn("[primitive:web_search] Brave API error after retries", { status: resp.status });
      return { results: [], error: `Brave Search API error ${resp.status}` };
    }

    let data: { web?: { results?: Array<{ title: string; url: string; description: string }> } };
    try {
      data = await resp.json() as typeof data;
    } catch {
      logger.warn("[primitive:web_search] JSON parse failed on Brave response");
      return { results: [], error: "Invalid API response (JSON parse failed)" };
    }

    const results = (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));

    return { results, count: results.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[primitive:web_search] Fetch threw", { error: msg });
    return { results: [], error: msg };
  }
}

/**
 * browser — Cloud browser automation via Browserless.io.
 * Lambda-compatible (no local Chromium needed).
 * Supports: navigate/extract (HTML content), screenshot (base64 image).
 * Retries 2× on 429/5xx with 1s/2s backoff.
 */
async function executeBrowser(
  params: BrowserPrimitiveParams,
): Promise<PrimitiveResult> {
  if (!BROWSERLESS_API_KEY) {
    return { error: "BROWSERLESS_API_KEY not configured" };
  }

  const { action, url, waitFor = 3000, fullPage = false } = params;

  try {
    if (action === "navigate" || action === "extract") {
      // Browserless uses token as query param (their API design, not a security concern)
      const resp = await fetchWithRetry(
        `https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, waitFor }),
        },
      );

      if (!resp.ok) {
        logger.warn("[primitive:browser] Extract API error after retries", { status: resp.status, url });
        return { error: `Browserless content API error ${resp.status}` };
      }

      const html = await resp.text();
      if (html.length > 50_000) {
        logger.warn("[primitive:browser] HTML truncated", { originalSize: html.length, url });
      }
      return { html: html.slice(0, 50_000), truncated: html.length > 50_000, originalSize: html.length };
    }

    if (action === "screenshot") {
      const resp = await fetchWithRetry(
        `https://chrome.browserless.io/screenshot?token=${BROWSERLESS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, options: { fullPage } }),
        },
      );

      if (!resp.ok) {
        logger.warn("[primitive:browser] Screenshot API error after retries", { status: resp.status, url });
        return { error: `Browserless screenshot API error ${resp.status}` };
      }

      const buffer = await resp.arrayBuffer();
      return { screenshot: Buffer.from(buffer).toString("base64"), format: "png" };
    }

    return { error: `Unknown browser action: ${action}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[primitive:browser] Fetch threw", { error: msg });
    return { error: msg };
  }
}

// ── Registry dispatch table ──────────────────────────────────────────────────

type PrimitiveHandler = (
  ctx: PrimitiveContext,
  params: Record<string, unknown>,
) => Promise<PrimitiveResult> | PrimitiveResult;

const PRIMITIVES: Record<string, PrimitiveHandler> = {
  crawl: (ctx, params) => executeCrawl(ctx, params as unknown as CrawlPrimitiveParams),
  ingest: (ctx, params) => executeIngest(ctx, params as unknown as IngestPrimitiveParams),
  call_llm: (ctx, params) => executeCallLlm(ctx, params as unknown as CallLlmPrimitiveParams),
  persist: (ctx, params) => executePersist(ctx, params as unknown as PersistPrimitiveParams),
  search: (ctx, params) => executeSearch(ctx, params as unknown as SearchPrimitiveParams),
  session: (ctx, params) => executeSession(ctx, params as unknown as SessionPrimitiveParams),
  inject: (ctx, params) => executeInject(ctx, params as unknown as InjectPrimitiveParams),
  web_search: (_ctx, params) => executeWebSearch(params as unknown as WebSearchPrimitiveParams),
  browser: (_ctx, params) => executeBrowser(params as unknown as BrowserPrimitiveParams),
};

/**
 * Execute a single primitive by name.
 * Returns a PrimitiveResult or an error result on unknown primitive.
 */
export async function executePrimitive(
  ctx: PrimitiveContext,
  primitiveName: string,
  params: Record<string, unknown>,
): Promise<PrimitiveResult> {
  const handler = PRIMITIVES[primitiveName];
  if (!handler) {
    logger.warn("[primitive-registry] Unknown primitive", { primitiveName });
    return { error: `Unknown primitive: ${primitiveName}` };
  }

  try {
    const result = await handler(ctx, params);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[primitive-registry] Primitive threw", { primitiveName, error: msg });
    return { error: msg };
  }
}

/**
 * List registered primitive names (for debugging / introspection).
 */
export function listPrimitives(): string[] {
  return Object.keys(PRIMITIVES);
}
