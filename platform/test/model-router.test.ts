/**
 * Tests for lib/brain/model-router.ts — DAAO copilot model selection.
 * All tests are pure (no mocks needed — selectModel is a pure function).
 */
import { describe, it, expect } from "vitest";
import { selectModel } from "@/lib/brain/model-router";
import type { ModelSelectionContext } from "@/lib/brain/model-router";

const BASE_CTX: ModelSelectionContext = {
  hasDomainData: false,
  domainCount: 0,
  isFollowUp: false,
  brainIq: 50,
};

describe("selectModel — OPUS tier", () => {
  it("routes long debugging query to Opus", () => {
    const query = "Why is the early-warning domain not showing data for this engagement? I've checked the DB and the cron is running but nothing appears. root cause please investigate thoroughly across all systems and identify what is causing this failure in the pipeline";
    const result = selectModel(query, BASE_CTX);
    expect(result.tier).toBe("opus");
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.rationale).toMatch(/debugging/i);
  });

  it("routes high-IQ multi-domain query to Opus", () => {
    const ctx: ModelSelectionContext = {
      hasDomainData: true,
      domainCount: 3,
      isFollowUp: false,
      brainIq: 85,
    };
    const result = selectModel("Analyze delivery health across all domains", ctx);
    expect(result.tier).toBe("opus");
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.rationale).toMatch(/IQ/);
  });

  it("routes Opus when brainIq is exactly 71 with 2+ domains", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 2, isFollowUp: false, brainIq: 71 };
    const result = selectModel("Show me the delivery data", ctx);
    expect(result.tier).toBe("opus");
  });

  it("does NOT route to Opus when brainIq is exactly 70 (boundary)", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 2, isFollowUp: false, brainIq: 70 };
    const result = selectModel("Show me the delivery data", ctx);
    expect(result.tier).not.toBe("opus");
  });

  it("does NOT route short debugging message to Opus (length gate)", () => {
    const result = selectModel("why broken?", BASE_CTX);
    expect(result.tier).not.toBe("opus");
  });

  it("routes 'production error' debugging query to Opus when long", () => {
    const query = "There is a production issue in the early warning system that we cannot explain. The health scores are dropping even though all engineer activity metrics look normal. Please debug this thoroughly and find the root cause across all connected systems and components.";
    const result = selectModel(query, BASE_CTX);
    expect(result.tier).toBe("opus");
  });
});

describe("selectModel — HAIKU tier", () => {
  it("routes short query with no domain data to Haiku", () => {
    const result = selectModel("hello", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("routes 49-char query to Haiku (boundary: <50 chars)", () => {
    const q = "x".repeat(49);
    const result = selectModel(q, BASE_CTX);
    expect(result.tier).toBe("haiku");
  });

  it("does NOT route 50-char query to Haiku via length rule", () => {
    const q = "x".repeat(50);
    const result = selectModel(q, BASE_CTX);
    // 50 chars = not <50, so length rule does NOT fire — falls to sonnet
    expect(result.tier).toBe("sonnet");
  });

  it("routes follow-up with no domain data to Haiku", () => {
    const ctx: ModelSelectionContext = { ...BASE_CTX, isFollowUp: true };
    // Must be >=50 chars so short-query rule doesn't fire before follow-up rule
    const result = selectModel("Can you please elaborate further on what you said about the engineering metrics?", ctx);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/follow-up/i);
  });

  it("routes 'what is' question to Haiku (factual prefix)", () => {
    // Must be >=50 chars so the short-query Haiku rule doesn't fire first
    const result = selectModel("What is the overall engagement health status across all active client engagements?", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/factual/i);
  });

  it("routes 'how many' question to Haiku (factual prefix on long query)", () => {
    const result = selectModel("How many engineers across all active engagements are currently showing a flight risk score above threshold?", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/factual/i);
  });

  it("routes 'list' question to Haiku (factual prefix on long query)", () => {
    const result = selectModel("List all the active open engagements in the system that have a health score below 0.6", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/factual/i);
  });

  it("routes 'show me' to Haiku via factual prefix on long query", () => {
    const result = selectModel("Show me the engagement health dashboard data for all active client engagements in production", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/factual/i);
  });

  it("routes 'give me' to Haiku via factual prefix on long query", () => {
    const result = selectModel("Give me the list of all engineers who have a review burden score above 0.8", BASE_CTX);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/factual/i);
  });

  it("routes low brain IQ with no domain data to Haiku (long query to bypass length rule)", () => {
    const ctx: ModelSelectionContext = { ...BASE_CTX, brainIq: 5 };
    // Use a query >=50 chars that doesn't match factual prefix or "and/also/additionally"
    const result = selectModel("Tell me something genuinely useful about the current team performance metrics", ctx);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/IQ.*30|30.*IQ/i);
  });

  it("routes brainIq exactly 29 to Haiku (boundary: <30)", () => {
    const ctx: ModelSelectionContext = { ...BASE_CTX, brainIq: 29 };
    const result = selectModel("Provide a detailed analysis of the current system health metrics trends", ctx);
    expect(result.tier).toBe("haiku");
    expect(result.rationale).toMatch(/IQ.*30|30.*IQ/i);
  });

  it("does NOT route low IQ to Haiku when domain data present", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 1, isFollowUp: false, brainIq: 5 };
    const result = selectModel("Tell me something useful about the team", ctx);
    // Domain data takes precedence → Sonnet
    expect(result.tier).toBe("sonnet");
  });

  it("does NOT route follow-up to Haiku when domain data present", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 1, isFollowUp: true, brainIq: 50 };
    const result = selectModel("Can you elaborate?", ctx);
    // hasDomainData=true → Sonnet
    expect(result.tier).toBe("sonnet");
  });
});

describe("selectModel — SONNET tier", () => {
  it("routes query with domain data to Sonnet", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 1, isFollowUp: false, brainIq: 50 };
    const result = selectModel("Analyze the engagement health", ctx);
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.rationale).toMatch(/domain/i);
  });

  it("routes multi-step query with 'and' to Sonnet", () => {
    // Must be >=50 chars so the Haiku length rule doesn't fire first
    const result = selectModel("Please check the engagement pod match and the early warning signal for this sprint", BASE_CTX);
    expect(result.tier).toBe("sonnet");
    expect(result.rationale).toMatch(/multi-step/i);
  });

  it("routes query with 'also' to Sonnet", () => {
    const result = selectModel("Check the engagement health scores and also look at the pod recommendations for the team", BASE_CTX);
    expect(result.tier).toBe("sonnet");
  });

  it("routes query with 'additionally' to Sonnet", () => {
    const result = selectModel("Review the sprint progress and additionally check scope creep alerts for all active engagements", BASE_CTX);
    expect(result.tier).toBe("sonnet");
  });

  it("routes moderate-length query (50–200 chars) to Sonnet", () => {
    const q = "x".repeat(100);
    const result = selectModel(q, BASE_CTX);
    expect(result.tier).toBe("sonnet");
    expect(result.rationale).toMatch(/Moderate-length/i);
  });

  it("routes moderate-length query at exact 50 chars to Sonnet", () => {
    const q = "x".repeat(50);
    const result = selectModel(q, BASE_CTX);
    expect(result.tier).toBe("sonnet");
  });

  it("routes moderate-length query at exact 200 chars to Sonnet", () => {
    const q = "x".repeat(200);
    const result = selectModel(q, BASE_CTX);
    expect(result.tier).toBe("sonnet");
  });

  it("falls back to Sonnet for unclassified long query (>200 chars, no debug keywords)", () => {
    const q = "x".repeat(250);
    const result = selectModel(q, BASE_CTX);
    expect(result.tier).toBe("sonnet");
    expect(result.rationale).toMatch(/Default/i);
  });

  it("returns correct model ID string for Sonnet", () => {
    const ctx: ModelSelectionContext = { hasDomainData: true, domainCount: 1, isFollowUp: false, brainIq: 50 };
    const result = selectModel("Analyze this", ctx);
    expect(result.model).toBe("claude-sonnet-4-6");
  });
});

describe("selectModel — result shape", () => {
  it("always returns model, tier, and rationale", () => {
    const result = selectModel("test", BASE_CTX);
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("rationale");
    expect(typeof result.rationale).toBe("string");
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it("trimmed query length is used (leading/trailing whitespace)", () => {
    // "  hi  " is 6 chars untrimmed, 2 chars trimmed — still routes to Haiku (<50 chars, no domain)
    const result = selectModel("  hi  ", BASE_CTX);
    expect(result.tier).toBe("haiku");
  });
});
