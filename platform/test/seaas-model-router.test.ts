/**
 * Tests for lib/se-aas/model-router.ts — domain-based model selection.
 * Pure functions, no mocks needed.
 */
import { describe, it, expect } from "vitest";
import {
  selectModelForDomain,
  getModelDisplayName,
  routeModelWithIq,
  routeModel,
  routeCallType,
} from "@/lib/se-aas/model-router";
import type { ClaudeModel } from "@/lib/se-aas/model-router";

describe("selectModelForDomain", () => {
  describe("Haiku domains (fast, cheap)", () => {
    const haikuDomains = [
      "pod-match",
      "scope-creep",
      "early-warning",
      "delivery-intelligence",
      "context-agent",
      "context-compress",
      "mem0-extract",
      "document-absorb",
      "cc-learning",
      "slack-process",
      "connector-analyze",
      "pm-aas-structured",
      "aas-artifact-simple",
    ];

    for (const domain of haikuDomains) {
      it(`routes ${domain} to Haiku`, () => {
        expect(selectModelForDomain(domain)).toBe("claude-haiku-4-5-20251001");
      });
    }
  });

  describe("Sonnet domains (reasoning, generation)", () => {
    const sonnetDomains = [
      "pr-review",
      "codebase-qa",
      "sql-analyzer",
      "test-data-generator",
      "incident-diagnosis",
      "tdd-code-generator",
      "tdd",
      "design-doc-generator",
      "architecture-extractor",
      "impact-analysis",
      "test-case-generator",
      "data-lineage",
      "log-query",
      "dependency-upgrade",
      "performance-profiler",
      "dead-code-detector",
      "boilerplate-scaffold",
      "copilot-complex",
      "agent-compose",
      "recovery-agent",
      "self-moa",
      "aas-artifact-complex",
      "pm-aas-analysis",
      "workspace-orchestrate",
    ];

    for (const domain of sonnetDomains) {
      it(`routes ${domain} to Sonnet`, () => {
        expect(selectModelForDomain(domain)).toBe("claude-sonnet-4-6");
      });
    }
  });

  describe("unknown domains", () => {
    it("defaults to Sonnet for unknown domain", () => {
      expect(selectModelForDomain("unknown-domain")).toBe("claude-sonnet-4-6");
    });

    it("defaults to Sonnet for empty string", () => {
      expect(selectModelForDomain("")).toBe("claude-sonnet-4-6");
    });

    it("defaults to Sonnet for gibberish", () => {
      expect(selectModelForDomain("xyz-abc-123")).toBe("claude-sonnet-4-6");
    });
  });
});

describe("getModelDisplayName", () => {
  it("returns display name for Haiku", () => {
    const name = getModelDisplayName("claude-haiku-4-5-20251001");
    expect(name).toBe("Claude Haiku 4.5");
  });

  it("returns display name for Sonnet", () => {
    const name = getModelDisplayName("claude-sonnet-4-6");
    expect(name).toBe("Claude Sonnet 4.6");
  });

  it("falls back to model ID for unknown model", () => {
    const unknownModel = "claude-unknown-model" as ClaudeModel;
    expect(getModelDisplayName(unknownModel)).toBe("claude-unknown-model");
  });
});

// ── routeModelWithIq ──────────────────────────────────────────────────────

describe("routeModelWithIq", () => {
  it("forces Haiku when IQ < 10 (brain not ready)", () => {
    const result = routeModelWithIq("pr-review", 5);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.brainCaveat).toBeTruthy();
    expect(result.rationale).toMatch(/below minimum threshold/i);
  });

  it("attaches brainCaveat with IQ value when IQ < 10", () => {
    const result = routeModelWithIq("pod-match", 3);
    expect(result.brainCaveat).toContain("3");
  });

  it("uses standard domain selection for IQ 10-29 (brain learning)", () => {
    // Haiku domain + IQ 15 = should still get Haiku (standard routing)
    const haikuResult = routeModelWithIq("pod-match", 15);
    expect(haikuResult.model).toBe("claude-haiku-4-5-20251001");
    expect(haikuResult.brainCaveat).toBeUndefined();

    // Sonnet domain + IQ 15 = should get Sonnet
    const sonnetResult = routeModelWithIq("pr-review", 20);
    expect(sonnetResult.model).toBe("claude-sonnet-4-6");
    expect(sonnetResult.brainCaveat).toBeUndefined();
  });

  it("uses Haiku for light domains at IQ >= 30", () => {
    const result = routeModelWithIq("pod-match", 50);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.rationale).toMatch(/fast and sufficient/i);
  });

  it("uses Sonnet for heavy domains at IQ >= 30", () => {
    const result = routeModelWithIq("pr-review", 50);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.rationale).toMatch(/IQ .* >= 30/);
  });

  it("has no brainCaveat when IQ >= 30", () => {
    const result = routeModelWithIq("pr-review", 80);
    expect(result.brainCaveat).toBeUndefined();
  });

  it("returns correct shape: model, displayName, domainType, rationale", () => {
    const result = routeModelWithIq("pod-match", 50);
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("displayName");
    expect(result).toHaveProperty("domainType", "pod-match");
    expect(result).toHaveProperty("rationale");
    expect(result.displayName).toBeTruthy();
  });

  it("handles IQ exactly at boundary 9 (still < 10 → Haiku forced)", () => {
    const result = routeModelWithIq("pr-review", 9);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.brainCaveat).toBeTruthy();
  });

  it("handles IQ exactly at boundary 10 (10-29 range → standard routing)", () => {
    const result = routeModelWithIq("pr-review", 10);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.brainCaveat).toBeUndefined();
  });

  it("handles IQ exactly at boundary 30 (>= 30 range)", () => {
    const result = routeModelWithIq("pr-review", 30);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.rationale).toMatch(/IQ .* >= 30/);
  });
});

// ── routeModel ────────────────────────────────────────────────────────────

describe("routeModel", () => {
  it("routes light domain to Haiku with correct rationale", () => {
    const result = routeModel("pod-match");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.rationale).toMatch(/fast and sufficient/i);
    expect(result.domainType).toBe("pod-match");
  });

  it("routes heavy domain to Sonnet with correct rationale", () => {
    const result = routeModel("pr-review");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.rationale).toMatch(/quality reasoning/i);
    expect(result.domainType).toBe("pr-review");
  });

  it("returns correct displayName string", () => {
    expect(routeModel("pod-match").displayName).toBe("Claude Haiku 4.5");
    expect(routeModel("pr-review").displayName).toBe("Claude Sonnet 4.6");
  });

  it("defaults unknown domain to Sonnet", () => {
    const result = routeModel("unknown-domain");
    expect(result.model).toBe("claude-sonnet-4-6");
  });
});

// ── routeCallType ─────────────────────────────────────────────────────────

describe("routeCallType", () => {
  it("delegates to routeModelWithIq with given callType and brainIq", () => {
    const result = routeCallType("pr-review", 50);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.domainType).toBe("pr-review");
  });

  it("uses default brainIq=50 when not provided", () => {
    const result = routeCallType("pod-match");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("passes low IQ through to trigger Haiku override", () => {
    const result = routeCallType("pr-review", 3);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.brainCaveat).toBeTruthy();
  });
});
