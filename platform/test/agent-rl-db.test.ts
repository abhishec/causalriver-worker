/**
 * Agent RL — DB-backed functions (mocked SupabaseClient)
 * =======================================================
 * Tests for recordAgentOutcome, getRecentQualityPatterns,
 * extractStructuredMemory, and getLearningStats.
 *
 * SupabaseClient is injected as a parameter — no vi.mock() of the supabase
 * module needed. We pass plain mock objects directly.
 *
 * Anthropic SDK is vi.mock()ed because extractStructuredMemory instantiates
 * it internally (cannot be injected).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Module mocks (hoisted by Vitest before imports) ────────────────────────

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/brain/tier2-signals", () => ({
  recordChunkUsage: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { recordChunkUsage } from "@/lib/brain/tier2-signals";
import {
  recordAgentOutcome,
  getRecentQualityPatterns,
  extractStructuredMemory,
  getLearningStats,
} from "@/lib/brain/agent-rl";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase mock where each table maps to a fixed result.
 * All filter/modifier methods return the same chain (thenable via .then).
 * Terminal methods (insert, limit) resolve directly.
 */
function makeSupabase(
  tableMap: Record<string, { data?: unknown; error?: unknown; count?: number | null }>
): SupabaseClient {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const result = tableMap[table] ?? { data: [], error: null };
      const resolved = Promise.resolve(result);

      const chain: Record<string, unknown> = {
        // Modifier methods — return chain (chainable)
        select: vi.fn(),
        eq: vi.fn(),
        neq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        not: vi.fn(),
        is: vi.fn(),
        order: vi.fn(),
        // Terminal methods — resolve directly
        insert: vi.fn().mockResolvedValue(result),
        in: vi.fn().mockResolvedValue(result),
        limit: vi.fn().mockResolvedValue(result),
        // delete returns a sub-chain with .in()
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue(result),
        }),
        // Make chain itself awaitable (for .select().eq()...order() without .limit())
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      };

      // All modifier methods return the same chain
      for (const m of ["select", "eq", "neq", "gte", "lte", "not", "is", "order"]) {
        (chain[m] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }

      return chain;
    }),
  } as unknown as SupabaseClient;
}

/** Base outcome params shared across tests */
const BASE_OUTCOME = {
  agentId: "agent-1",
  domain: "pod-match",
  taskDescription: "Find the best pod for engineer Alice",
  resultSummary: '{"data":[{"pod_name":"Alpha Pod","confidence":0.91}]}',
  quality: 0.85,
  executionMs: 2000,
  organizationId: "org-abc",
  userId: "user-xyz",
};

/** Base params for extractStructuredMemory */
const BASE_MEMORY_PARAMS = {
  organizationId: "org-abc",
  domain: "pod-match",
  inputQuery: "Find the best pod for the engineering team",
  resultSummary: '{"data":[{"pod_name":"Alpha Pod"}]}',
  quality: 0.85,
};

// ── recordAgentOutcome ─────────────────────────────────────────────────────

describe("recordAgentOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts prediction_record with correct fields for high quality", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, quality: 0.8 });

    const firstInsert = insertMock.mock.calls[0][0];
    expect(firstInsert.was_correct).toBe(true);
    expect(firstInsert.confidence).toBe(0.8);
    expect(firstInsert.prediction_type).toBe("agent_task_outcome");
    expect(firstInsert.organization_id).toBe("org-abc");
    expect(firstInsert.domain).toBe("pod-match");
    expect(firstInsert.entity_type).toBe("agent");
    expect(firstInsert.entity_id).toBe("agent-1");
  });

  it("emits dopamine signal (positive RL) for quality >= 0.7", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, quality: 0.9 });

    const signalInsert = insertMock.mock.calls[1][0]; // second call = cross_domain_signals
    expect(signalInsert.signal_type).toBe("dopamine");
    expect(signalInsert.signal_value).toBe(0.9);
    expect(signalInsert.signal_metadata.wasSuccess).toBe(true);
    expect(signalInsert.source_domain).toBe("se-aas.pod-match");
  });

  it("emits gaba signal (negative RL) for quality < 0.7", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, quality: 0.4 });

    const signalInsert = insertMock.mock.calls[1][0];
    expect(signalInsert.signal_type).toBe("gaba");
    expect(signalInsert.signal_value).toBeCloseTo(-(1 - 0.4));
    expect(signalInsert.signal_metadata.wasSuccess).toBe(false);
  });

  it("sets was_correct=false for quality exactly at threshold boundary (0.699)", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, quality: 0.699 });

    const predInsert = insertMock.mock.calls[0][0];
    expect(predInsert.was_correct).toBe(false);
    const signalInsert = insertMock.mock.calls[1][0];
    expect(signalInsert.signal_type).toBe("gaba");
  });

  it("sets was_correct=true for quality exactly 0.7", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, quality: 0.7 });

    const predInsert = insertMock.mock.calls[0][0];
    expect(predInsert.was_correct).toBe(true);
  });

  it("includes signal_timestamp in cross_domain_signals (required for rl-status)", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, BASE_OUTCOME);

    const signalInsert = insertMock.mock.calls[1][0];
    expect(signalInsert.signal_timestamp).toBeTruthy();
    expect(new Date(signalInsert.signal_timestamp).getTime()).toBeGreaterThan(0);
    expect(signalInsert.created_at).toBeTruthy();
  });

  it("swallows prediction_records insert failure (fire-and-forget)", async () => {
    let callCount = 0;
    const insertMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("DB down"));
      return Promise.resolve({ data: null, error: null });
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await expect(recordAgentOutcome(supabase, BASE_OUTCOME)).resolves.toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("prediction_records insert failed"),
      expect.any(Error)
    );
    // cross_domain_signals insert should still proceed
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("swallows cross_domain_signals insert failure (fire-and-forget)", async () => {
    let callCount = 0;
    const insertMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error("signals table down"));
      return Promise.resolve({ data: null, error: null });
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await expect(recordAgentOutcome(supabase, BASE_OUTCOME)).resolves.toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("cross_domain_signals insert failed"),
      expect.any(Error)
    );
  });

  it("calls tier2-signals recordChunkUsage for each provided chunkId", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, {
      ...BASE_OUTCOME,
      quality: 0.85,
      chunkIds: ["chunk-1", "chunk-2", "chunk-3"],
    });

    // Fire-and-forget — give the async void IIFE time to execute
    await new Promise(r => setTimeout(r, 20));

    expect(vi.mocked(recordChunkUsage)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordChunkUsage)).toHaveBeenCalledWith("chunk-1", 0.85, "knowledge_chunks");
    expect(vi.mocked(recordChunkUsage)).toHaveBeenCalledWith("chunk-2", 0.85, "knowledge_chunks");
    expect(vi.mocked(recordChunkUsage)).toHaveBeenCalledWith("chunk-3", 0.85, "knowledge_chunks");
  });

  it("does NOT call tier2-signals when chunkIds is empty array", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, chunkIds: [] });
    await new Promise(r => setTimeout(r, 20));

    expect(vi.mocked(recordChunkUsage)).not.toHaveBeenCalled();
  });

  it("does NOT call tier2-signals when chunkIds is undefined", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    const { chunkIds: _omit, ...noChunks } = { ...BASE_OUTCOME, chunkIds: undefined };
    await recordAgentOutcome(supabase, noChunks);
    await new Promise(r => setTimeout(r, 20));

    expect(vi.mocked(recordChunkUsage)).not.toHaveBeenCalled();
  });

  it("truncates long taskDescription to 200 chars in prediction_record", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    const longDesc = "x".repeat(500);
    await recordAgentOutcome(supabase, { ...BASE_OUTCOME, taskDescription: longDesc });

    const predInsert = insertMock.mock.calls[0][0];
    expect(predInsert.predicted_outcome.length).toBe(200);
  });
});

// ── getRecentQualityPatterns ───────────────────────────────────────────────

describe("getRecentQualityPatterns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when DB returns error", async () => {
    const supabase = makeSupabase({
      prediction_records: { data: null, error: { message: "connection failed" } },
    });
    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result).toEqual([]);
  });

  it("returns empty array when data array is empty", async () => {
    const supabase = makeSupabase({
      prediction_records: { data: [], error: null },
    });
    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result).toEqual([]);
  });

  it("groups records by domain and computes correct avgQuality", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.8, created_at: now },
          { domain: "pod-match", confidence: 0.9, created_at: now },
          { domain: "early-warning", confidence: 0.6, created_at: now },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");

    expect(result).toHaveLength(2);
    const pm = result.find(r => r.domain === "pod-match")!;
    expect(pm.avgQuality).toBe(0.85);
    expect(pm.sampleCount).toBe(2);
    const ew = result.find(r => r.domain === "early-warning")!;
    expect(ew.avgQuality).toBe(0.6);
    expect(ew.sampleCount).toBe(1);
  });

  it("detects improving trend when second half scores > first half by >0.05", async () => {
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.4, created_at: "2026-01-01T00:00:00Z" },
          { domain: "pod-match", confidence: 0.4, created_at: "2026-01-01T01:00:00Z" },
          { domain: "pod-match", confidence: 0.9, created_at: "2026-01-01T02:00:00Z" },
          { domain: "pod-match", confidence: 0.9, created_at: "2026-01-01T03:00:00Z" },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].trend).toBe("improving");
  });

  it("detects degrading trend when first half scores > second half by >0.05", async () => {
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.9, created_at: "2026-01-01T00:00:00Z" },
          { domain: "pod-match", confidence: 0.9, created_at: "2026-01-01T01:00:00Z" },
          { domain: "pod-match", confidence: 0.4, created_at: "2026-01-01T02:00:00Z" },
          { domain: "pod-match", confidence: 0.4, created_at: "2026-01-01T03:00:00Z" },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].trend).toBe("degrading");
  });

  it("returns 'stable' trend for fewer than 4 samples", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.8, created_at: now },
          { domain: "pod-match", confidence: 0.4, created_at: now },
          { domain: "pod-match", confidence: 0.9, created_at: now },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].trend).toBe("stable");
  });

  it("returns 'stable' trend when score difference is small (< 0.05)", async () => {
    // Difference = 0.73 - 0.7 = 0.03 — clearly below the 0.05 threshold
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.7, created_at: "2026-01-01T00:00:00Z" },
          { domain: "pod-match", confidence: 0.7, created_at: "2026-01-01T01:00:00Z" },
          { domain: "pod-match", confidence: 0.73, created_at: "2026-01-01T02:00:00Z" },
          { domain: "pod-match", confidence: 0.73, created_at: "2026-01-01T03:00:00Z" },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].trend).toBe("stable");
  });

  it("sorts results by avgQuality descending", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "low-domain", confidence: 0.3, created_at: now },
          { domain: "high-domain", confidence: 0.95, created_at: now },
          { domain: "mid-domain", confidence: 0.6, created_at: now },
        ],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].domain).toBe("high-domain");
    expect(result[1].domain).toBe("mid-domain");
    expect(result[2].domain).toBe("low-domain");
  });

  it("maps null domain to 'unknown'", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [{ domain: null, confidence: 0.7, created_at: now }],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].domain).toBe("unknown");
  });

  it("uses 0.5 as confidence fallback for non-numeric values", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [{ domain: "pod-match", confidence: null, created_at: now }],
        error: null,
      },
    });

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result[0].avgQuality).toBe(0.5);
  });

  it("returns empty array on thrown exception (catch block)", async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error("Connection refused");
      }),
    } as unknown as SupabaseClient;

    const result = await getRecentQualityPatterns(supabase, "org-abc");
    expect(result).toEqual([]);
  });

  it("accepts custom windowHours parameter", async () => {
    const fromSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const supabase = { from: fromSpy } as unknown as SupabaseClient;

    await getRecentQualityPatterns(supabase, "org-abc", 48);

    // The gte call should use a timestamp ~48h ago
    const gteArg = fromSpy.mock.results[0].value.gte.mock.calls[0][1];
    const expectedMin = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    const expectedMax = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString();
    expect(gteArg >= expectedMin).toBe(true);
    expect(gteArg <= expectedMax).toBe(true);
  });
});

// ── extractStructuredMemory ────────────────────────────────────────────────

describe("extractStructuredMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key-sk-ant-1234";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns early and logs warn when ANTHROPIC_API_KEY not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const supabase = makeSupabase({ ai_memory: { data: null, error: null } });

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("ANTHROPIC_API_KEY not set")
    );
    expect(vi.mocked(supabase.from)).not.toHaveBeenCalled();
  });

  it("inserts structured-outcome memory on successful Anthropic response", async () => {
    const mockResponse = {
      content: [{
        type: "text",
        text: JSON.stringify({
          worked: "Query matched pod via confidence scoring",
          failed: "nothing failed",
          pattern: "Alpha pod consistently top recommendation",
        }),
      }],
    };

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn().mockResolvedValue(mockResponse) },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) }),
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: "org-abc",
      domain: "pod-match",
      memory_type: "structured-outcome",
      importance: 0.85,
    }));
    const insertedContent = JSON.parse(insertMock.mock.calls[0][0].content);
    expect(insertedContent.worked).toBe("Query matched pod via confidence scoring");
    expect(insertedContent.failed).toBe("nothing failed");
    expect(insertedContent.pattern).toBe("Alpha pod consistently top recommendation");
  });

  it("strips markdown code fences from Anthropic response before JSON parsing", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '```json\n{"worked":"ok","failed":"none","pattern":"test"}\n```' }],
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) }),
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(insertMock).toHaveBeenCalled();
  });

  it("returns early on empty content array from Anthropic", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("empty response")
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns early when Anthropic response is not 'text' type", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", id: "tu-1", input: {} }],
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns early and logs when Anthropic returns invalid JSON", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "This is plain text, not JSON at all." }],
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("failed to parse"),
      expect.anything()
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns early and logs when JSON is missing required fields", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"worked":"ok"}' }], // missing "failed" + "pattern"
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("incomplete JSON")
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("prunes to MAX_STRUCTURED_OUTCOMES_PER_DOMAIN (20) when entries exceed limit", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({
            worked: "ok", failed: "nothing", pattern: "test pattern",
          }) }],
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    // 25 existing entries — should trigger pruning of 5
    const existing = Array.from({ length: 25 }, (_, i) => ({
      id: `mem-${i}`,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));

    const deleteMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) });
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    let orderCallCount = 0;

    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(() => {
          orderCallCount++;
          return Promise.resolve({ data: existing, error: null });
        }),
        delete: deleteMock,
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(deleteMock).toHaveBeenCalled();
    const inCall = deleteMock.mock.results[0].value.in;
    const deletedIds = inCall.mock.calls[0][1];
    expect(deletedIds).toHaveLength(5); // 25 - 20 = 5 to prune
  });

  it("does NOT prune when entries are within the limit", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({
            worked: "ok", failed: "nothing", pattern: "pattern",
          }) }],
        }),
      },
    }) as unknown as InstanceType<typeof Anthropic>);

    // Only 10 existing entries — no pruning needed
    const existing = Array.from({ length: 10 }, (_, i) => ({
      id: `mem-${i}`, created_at: `2026-01-01T00:00:00Z`,
    }));

    const deleteMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) });
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: existing, error: null }),
        delete: deleteMock,
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, BASE_MEMORY_PARAMS);

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("uses 'high' quality label for quality >= 0.8 in prompt", async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        worked: "ok", failed: "none", pattern: "test",
      }) }],
    });
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: createMock },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn().mockResolvedValue({});
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) }),
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, { ...BASE_MEMORY_PARAMS, quality: 0.9 });

    const promptArg = createMock.mock.calls[0][0].messages[0].content as string;
    expect(promptArg).toContain("high (0.90/1.0)");
  });

  it("uses 'low' quality label for quality < 0.5 in prompt", async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        worked: "some", failed: "data missing", pattern: "retry needed",
      }) }],
    });
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: createMock },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn().mockResolvedValue({});
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) }),
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, { ...BASE_MEMORY_PARAMS, quality: 0.3 });

    const promptArg = createMock.mock.calls[0][0].messages[0].content as string;
    expect(promptArg).toContain("low (0.30/1.0)");
  });

  it("swallows Anthropic API errors (fire-and-forget safe)", async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn().mockRejectedValue(new Error("API rate limit")) },
    }) as unknown as InstanceType<typeof Anthropic>);

    const supabase = makeSupabase({ ai_memory: { data: null, error: null } });

    await expect(extractStructuredMemory(supabase, BASE_MEMORY_PARAMS)).resolves.toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("extractStructuredMemory failed"),
      expect.any(Error)
    );
  });

  it("includes error context in prompt when error param is provided", async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        worked: "partial", failed: "DB timeout caused empty result", pattern: "retry improves quality",
      }) }],
    });
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: createMock },
    }) as unknown as InstanceType<typeof Anthropic>);

    const insertMock = vi.fn().mockResolvedValue({});
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({}) }),
      })),
    } as unknown as SupabaseClient;

    await extractStructuredMemory(supabase, {
      ...BASE_MEMORY_PARAMS,
      error: "Database connection timed out after 30s",
    });

    const promptArg = createMock.mock.calls[0][0].messages[0].content as string;
    expect(promptArg).toContain("Error encountered:");
    expect(promptArg).toContain("Database connection timed out");
  });
});

// ── getLearningStats ───────────────────────────────────────────────────────

describe("getLearningStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all-zero stats and null topDomain when no records exist", async () => {
    const supabase = makeSupabase({
      prediction_records: { data: [], error: null },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result).not.toBeNull();
    expect(result!.totalTasks).toBe(0);
    expect(result!.successRate).toBe(0);
    expect(result!.avgQuality).toBe(0);
    expect(result!.topDomain).toBeNull();
    expect(result!.learningVelocity).toBe(0);
    expect(result!.pendingFeedback).toBe(0);
    expect(result!.helpfulFeedback).toBe(0);
    expect(result!.notHelpfulFeedback).toBe(0);
  });

  it("computes successRate as fraction with was_correct === true", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.9, was_correct: true, created_at: now },
          { domain: "pod-match", confidence: 0.8, was_correct: true, created_at: now },
          { domain: "early-warning", confidence: 0.4, was_correct: false, created_at: now },
        ],
        error: null,
      },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.totalTasks).toBe(3);
    expect(result!.successRate).toBeCloseTo(0.67, 2);
  });

  it("computes avgQuality as mean of confidence values", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.9, was_correct: true, created_at: now },
          { domain: "pod-match", confidence: 0.6, was_correct: false, created_at: now },
        ],
        error: null,
      },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.avgQuality).toBe(0.75);
  });

  it("identifies topDomain as domain with most executions", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.8, was_correct: true, created_at: now },
          { domain: "pod-match", confidence: 0.7, was_correct: true, created_at: now },
          { domain: "pod-match", confidence: 0.9, was_correct: true, created_at: now },
          { domain: "early-warning", confidence: 0.6, was_correct: false, created_at: now },
        ],
        error: null,
      },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.topDomain).toBe("pod-match");
  });

  it("counts learningVelocity as records created in last 24h", async () => {
    const recent1h = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const recent3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const old48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: 0.8, was_correct: true, created_at: recent1h },
          { domain: "pod-match", confidence: 0.7, was_correct: true, created_at: recent3h },
          { domain: "early-warning", confidence: 0.6, was_correct: false, created_at: old48h },
        ],
        error: null,
      },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.learningVelocity).toBe(2); // 2 records within 24h
  });

  it("returns pendingFeedback from brain_feedback_queue count", async () => {
    const supabase = makeSupabase({
      prediction_records: { data: [], error: null },
      brain_feedback_queue: { count: 7, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.pendingFeedback).toBe(7);
  });

  it("handles null pendingFeedback count (brain_feedback_queue returns null count)", async () => {
    const supabase = makeSupabase({
      prediction_records: { data: [], error: null },
      brain_feedback_queue: { count: null, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.pendingFeedback).toBe(0);
  });

  it("counts helpfulFeedback and notHelpfulFeedback from copilot_response_feedback", async () => {
    const fb = [
      { rating: "helpful" },
      { rating: "helpful" },
      { rating: "helpful" },
      { rating: "not_helpful" },
    ];

    const supabase = makeSupabase({
      prediction_records: { data: [], error: null },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: fb, error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    expect(result!.helpfulFeedback).toBe(3);
    expect(result!.notHelpfulFeedback).toBe(1);
  });

  it("returns null on DB exception (outer catch)", async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error("DB connection pool exhausted");
      }),
    } as unknown as SupabaseClient;

    const result = await getLearningStats(supabase, "org-abc");

    expect(result).toBeNull();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("getLearningStats failed"),
      expect.any(Error)
    );
  });

  it("handles missing confidence values by treating them as 0 in avgQuality", async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      prediction_records: {
        data: [
          { domain: "pod-match", confidence: null, was_correct: false, created_at: now },
          { domain: "pod-match", confidence: 0.8, was_correct: true, created_at: now },
        ],
        error: null,
      },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    // avg of 0 + 0.8 = 0.4
    expect(result!.avgQuality).toBe(0.4);
  });

  it("rounds successRate and avgQuality to 2 decimal places", async () => {
    const now = new Date().toISOString();
    const records = Array.from({ length: 3 }, (_, i) => ({
      domain: "pod-match",
      confidence: [0.91, 0.82, 0.75][i],
      was_correct: [true, true, false][i],
      created_at: now,
    }));

    const supabase = makeSupabase({
      prediction_records: { data: records, error: null },
      brain_feedback_queue: { count: 0, error: null },
      copilot_response_feedback: { data: [], error: null },
    });

    const result = await getLearningStats(supabase, "org-abc");

    // successRate = 2/3 = 0.667 → rounded to 0.67
    expect(String(result!.successRate).length).toBeLessThanOrEqual(4);
    // avgQuality = (0.91+0.82+0.75)/3 = 0.8267 → rounded to 0.83
    expect(result!.avgQuality).toBe(0.83);
  });
});
