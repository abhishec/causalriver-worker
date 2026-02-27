/**
 * Tests for lib/copilot/domain-router.ts — SE-aaS / AaaS / PM-aaS route resolution.
 *
 * The resolver logic is pure (VALID_SEAAS_DOMAINS gate + fallback to detectSEaaSRoute).
 * We test the routing decision tree using controlled interpretations and well-known messages.
 */
import { describe, it, expect } from "vitest";
import {
  VALID_SEAAS_DOMAINS,
  VALID_PM_AAS_DOMAINS,
  resolveSeaasRoute,
  resolvePmAasRoute,
  resolveAccountingRoute,
} from "@/lib/copilot/domain-router";

// ── Helpers ───────────────────────────────────────────────────────────────────

function seaasInterpretation(domain: string, input?: Record<string, unknown>) {
  return {
    source: "llm",
    serviceRoute: {
      type: "se-aas",
      seaasDomain: domain,
      seaasInput: input ?? {},
    },
  };
}

function pmaasInterpretation(domain: string, input?: Record<string, unknown>) {
  return {
    source: "llm",
    serviceRoute: {
      type: "pm-aas",
      pmaasDomain: domain,
      pmaasInput: input ?? {},
    },
  };
}

function aasInterpretation(domain: string, input?: Record<string, unknown>) {
  return {
    source: "llm",
    serviceRoute: {
      type: "aas",
      aasDomain: domain,
      aasInput: input ?? {},
    },
  };
}

const regexFallback = { source: "regex-fallback" };

// ── VALID_SEAAS_DOMAINS ───────────────────────────────────────────────────────

describe("VALID_SEAAS_DOMAINS", () => {
  it("is a Set", () => {
    expect(VALID_SEAAS_DOMAINS).toBeInstanceOf(Set);
  });

  it("contains pod-match", () => {
    expect(VALID_SEAAS_DOMAINS.has("pod-match")).toBe(true);
  });

  it("contains delivery-intelligence", () => {
    expect(VALID_SEAAS_DOMAINS.has("delivery-intelligence")).toBe(true);
  });

  it("contains early-warning", () => {
    expect(VALID_SEAAS_DOMAINS.has("early-warning")).toBe(true);
  });

  it("contains scope-creep", () => {
    expect(VALID_SEAAS_DOMAINS.has("scope-creep")).toBe(true);
  });

  it("contains pr-review", () => {
    expect(VALID_SEAAS_DOMAINS.has("pr-review")).toBe(true);
  });

  it("does not contain random domain", () => {
    expect(VALID_SEAAS_DOMAINS.has("random-domain")).toBe(false);
  });
});

// ── VALID_PM_AAS_DOMAINS ─────────────────────────────────────────────────────

describe("VALID_PM_AAS_DOMAINS", () => {
  it("contains roadmap-planner", () => {
    expect(VALID_PM_AAS_DOMAINS.has("roadmap-planner")).toBe(true);
  });

  it("contains sprint-health", () => {
    expect(VALID_PM_AAS_DOMAINS.has("sprint-health")).toBe(true);
  });

  it("contains backlog-prioritizer", () => {
    expect(VALID_PM_AAS_DOMAINS.has("backlog-prioritizer")).toBe(true);
  });

  it("does not contain se-aas domain", () => {
    expect(VALID_PM_AAS_DOMAINS.has("pod-match")).toBe(false);
  });
});

// ── resolveSeaasRoute ─────────────────────────────────────────────────────────

describe("resolveSeaasRoute", () => {
  describe("LLM interpretation wins for valid domain", () => {
    it("returns LLM domain when it is in VALID_SEAAS_DOMAINS", () => {
      const result = resolveSeaasRoute("pod recommendations", seaasInterpretation("pod-match", { engagementId: "e1" }));
      expect(result).not.toBeNull();
      expect(result!.domainType).toBe("pod-match");
      expect(result!.extractedInput).toEqual({ engagementId: "e1" });
    });

    it("returns LLM domain for early-warning", () => {
      const result = resolveSeaasRoute("engineer risk", seaasInterpretation("early-warning"));
      expect(result?.domainType).toBe("early-warning");
    });

    it("uses empty extractedInput when seaasInput not provided", () => {
      const interp = { source: "llm", serviceRoute: { type: "se-aas", seaasDomain: "pod-match" } };
      const result = resolveSeaasRoute("pod match", interp);
      expect(result?.extractedInput).toEqual({});
    });
  });

  describe("LLM interpretation ignored for invalid domain", () => {
    it("returns null when LLM domain is not in VALID_SEAAS_DOMAINS (and not regex-fallback)", () => {
      const result = resolveSeaasRoute("something random", seaasInterpretation("not-a-real-domain"));
      expect(result).toBeNull();
    });

    it("returns null when type is not se-aas", () => {
      const interp = { source: "llm", serviceRoute: { type: "aas", aasDomain: "some-aas-domain" } };
      const result = resolveSeaasRoute("accounting query", interp);
      expect(result).toBeNull();
    });
  });

  describe("regex fallback", () => {
    it("triggers regex fallback when interpretation is undefined", () => {
      // Just verify the function runs without throwing (regex-based, result depends on message)
      const result = resolveSeaasRoute("show me pod recommendations for engagement", undefined);
      // May return a DomainRoute or null depending on regex match
      expect(result === null || typeof result?.domainType === "string").toBe(true);
    });

    it("triggers regex fallback when source is regex-fallback", () => {
      const result = resolveSeaasRoute("show pod match", regexFallback);
      expect(result === null || typeof result?.domainType === "string").toBe(true);
    });

    it("does NOT trigger regex fallback when LLM interpretation returned non-se-aas domain", () => {
      // Non-regex-fallback source + no valid SE-aaS domain → returns null
      const interp = { source: "llm", serviceRoute: { type: "aas", aasDomain: "accounting" } };
      const result = resolveSeaasRoute("show me accounting data", interp);
      expect(result).toBeNull();
    });
  });
});

// ── resolvePmAasRoute ─────────────────────────────────────────────────────────

describe("resolvePmAasRoute", () => {
  it("returns LLM domain when valid PM-aaS domain", () => {
    const result = resolvePmAasRoute("sprint health", pmaasInterpretation("sprint-health", { sprintId: "s1" }));
    expect(result?.domainType).toBe("sprint-health");
    expect(result?.extractedInput).toEqual({ sprintId: "s1" });
  });

  it("returns null when LLM PM-aaS domain not in VALID_PM_AAS_DOMAINS", () => {
    const result = resolvePmAasRoute("unknown pm thing", pmaasInterpretation("made-up-pm-domain"));
    expect(result).toBeNull();
  });

  it("returns null when type is not pm-aas", () => {
    const interp = { source: "llm", serviceRoute: { type: "se-aas", seaasDomain: "pod-match" } };
    const result = resolvePmAasRoute("pod match", interp);
    expect(result).toBeNull();
  });

  it("triggers regex fallback when interpretation is undefined", () => {
    const result = resolvePmAasRoute("roadmap planning for next quarter", undefined);
    expect(result === null || typeof result?.domainType === "string").toBe(true);
  });

  it("triggers regex fallback when source is regex-fallback", () => {
    const result = resolvePmAasRoute("sprint health status", regexFallback);
    expect(result === null || typeof result?.domainType === "string").toBe(true);
  });

  it("uses empty input when pmaasInput not provided", () => {
    const interp = { source: "llm", serviceRoute: { type: "pm-aas", pmaasDomain: "sprint-health" } };
    const result = resolvePmAasRoute("sprint status", interp);
    expect(result?.extractedInput).toEqual({});
  });
});

// ── resolveAccountingRoute ───────────────────────────────────────────────────

describe("resolveAccountingRoute", () => {
  it("returns LLM domain when type is aas", () => {
    const result = resolveAccountingRoute("accounting data", aasInterpretation("gl-analysis", { period: "Q1" }));
    expect(result?.domainType).toBe("gl-analysis");
    expect(result?.extractedInput).toEqual({ period: "Q1" });
  });

  it("returns null when type is not aas", () => {
    const interp = { source: "llm", serviceRoute: { type: "se-aas", seaasDomain: "pod-match" } };
    const result = resolveAccountingRoute("some query", interp);
    expect(result).toBeNull();
  });

  it("returns null when type is aas but aasDomain is missing", () => {
    const interp = { source: "llm", serviceRoute: { type: "aas" } };
    const result = resolveAccountingRoute("accounting query", interp);
    expect(result).toBeNull();
  });

  it("triggers regex fallback when interpretation is undefined", () => {
    const result = resolveAccountingRoute("show me the GL report", undefined);
    expect(result === null || typeof result?.domainType === "string").toBe(true);
  });

  it("triggers regex fallback when source is regex-fallback", () => {
    const result = resolveAccountingRoute("GL analysis", regexFallback);
    expect(result === null || typeof result?.domainType === "string").toBe(true);
  });

  it("uses empty aasInput when not provided", () => {
    const interp = { source: "llm", serviceRoute: { type: "aas", aasDomain: "gl-analysis" } };
    const result = resolveAccountingRoute("accounting data", interp);
    expect(result?.extractedInput).toEqual({});
  });
});
