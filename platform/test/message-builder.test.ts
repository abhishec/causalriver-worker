/**
 * Tests for lib/copilot/message-builder.ts — pure system prompt construction helpers.
 *
 * These are unit tests with zero I/O. All functions are pure transformations
 * on strings and structured data.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionKnowledge,
  getNoHallucinationFallback,
  injectMemoryCompression,
  injectCommandCenterPersona,
  injectZeroDataGuard,
  type TrainedCausalEdge,
  type TrainedRule,
} from "@/lib/copilot/message-builder";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const edge: TrainedCausalEdge = {
  source_domain: "engineering",
  target_domain: "delivery",
  effect_size: 0.72,
  optimal_lag_days: 3,
  confidence: 0.91,
  method: "granger",
};

const rule: TrainedRule = {
  id: "r1",
  title: "Sprint Velocity Alert",
  natural_language: "Flag when velocity drops 20%",
  conditions: ["velocity < threshold"],
  content: JSON.stringify({
    when: { conditions: [{ field: "velocity", operator: "<", value: 80 }] },
    entity_type: "sprint",
    title: "Sprint Velocity Alert",
    natural_language: "Flag when velocity drops 20%",
  }),
};

const malformedRule: TrainedRule = {
  id: "r2",
  title: "Bad Rule",
  natural_language: "",
  conditions: [],
  content: "not-valid-json",
};

// ── buildActionKnowledge ──────────────────────────────────────────────────────

describe("buildActionKnowledge", () => {
  it("maps known intent strings to UserIntent", () => {
    expect(buildActionKnowledge("q", "build", [], [], []).intent).toBe("build");
    expect(buildActionKnowledge("q", "explain", [], [], []).intent).toBe("explain");
    expect(buildActionKnowledge("q", "diagnose", [], [], []).intent).toBe("diagnose");
    expect(buildActionKnowledge("q", "predict", [], [], []).intent).toBe("predict");
    expect(buildActionKnowledge("q", "whatif", [], [], []).intent).toBe("predict");
    expect(buildActionKnowledge("q", "cascade", [], [], []).intent).toBe("diagnose");
    expect(buildActionKnowledge("q", "general", [], [], []).intent).toBe("general");
  });

  it("falls back to 'general' for unknown intent strings", () => {
    expect(buildActionKnowledge("q", "unknown-intent", [], [], []).intent).toBe("general");
  });

  it("passes question and domains through", () => {
    const result = buildActionKnowledge("How is delivery?", "general", ["delivery", "engineering"], [], []);
    expect(result.question).toBe("How is delivery?");
    expect(result.extractedDomains).toEqual(["delivery", "engineering"]);
    expect(result.primaryDomain).toBe("delivery");
  });

  it("defaults primaryDomain to 'finance' when no domains provided", () => {
    const result = buildActionKnowledge("q", "general", [], [], []);
    expect(result.primaryDomain).toBe("finance");
  });

  it("builds directCauses from causal edges", () => {
    const result = buildActionKnowledge("q", "general", [], [edge], []);
    expect(result.directCauses).toHaveProperty("delivery");
    expect(result.directCauses["delivery"]).toHaveLength(1);
    expect(result.directCauses["delivery"][0].effectSize).toBe(0.72);
    expect(result.directCauses["delivery"][0].lagDays).toBe(3);
  });

  it("builds directEffects from causal edges", () => {
    const result = buildActionKnowledge("q", "general", [], [edge], []);
    expect(result.directEffects).toHaveProperty("engineering");
    expect(result.directEffects["engineering"][0].source).toBe("engineering");
    expect(result.directEffects["engineering"][0].target).toBe("delivery");
  });

  it("sorts causal edges by absolute effect size descending", () => {
    const strong: TrainedCausalEdge = { ...edge, effect_size: 0.9 };
    const weak: TrainedCausalEdge = { ...edge, effect_size: 0.2 };
    const result = buildActionKnowledge("q", "general", [], [weak, strong], []);
    // directEffects["engineering"][0] should be the stronger edge
    expect(result.directEffects["engineering"][0].effectSize).toBe(0.9);
  });

  it("parses valid rule JSON and includes matched rules", () => {
    const result = buildActionKnowledge("q", "general", [], [], [rule]);
    expect(result.matchedRules).toHaveLength(1);
    expect(result.matchedRules[0].title).toBe("Sprint Velocity Alert");
    expect(result.matchedRules[0].conditions).toContain("velocity < 80");
  });

  it("skips malformed rule JSON without throwing", () => {
    const result = buildActionKnowledge("q", "general", [], [], [malformedRule]);
    expect(result.matchedRules).toHaveLength(0);
  });

  it("handles mix of valid and malformed rules", () => {
    const result = buildActionKnowledge("q", "general", [], [], [rule, malformedRule]);
    expect(result.matchedRules).toHaveLength(1);
    expect(result.matchedRules[0].title).toBe("Sprint Velocity Alert");
  });

  it("evaluates rule trigger when entityState matches condition field", () => {
    const entityState = { velocity: 70 }; // velocity field exists → triggered = true
    const result = buildActionKnowledge("q", "general", [], [], [rule], entityState);
    expect(result.matchedRules[0].triggered).toBe(true);
  });

  it("triggered=false when entityState does not contain rule field", () => {
    const entityState = { some_other_field: 100 };
    const result = buildActionKnowledge("q", "general", [], [], [rule], entityState);
    expect(result.matchedRules[0].triggered).toBe(false);
  });

  it("returns empty arrays when no edges or rules", () => {
    const result = buildActionKnowledge("q", "general", [], [], []);
    expect(result.directCauses).toEqual({});
    expect(result.directEffects).toEqual({});
    expect(result.matchedRules).toEqual([]);
  });
});

// ── getNoHallucinationFallback ────────────────────────────────────────────────

describe("getNoHallucinationFallback", () => {
  it("returns a string containing the counts", () => {
    const prompt = getNoHallucinationFallback(5, 3, 10, 2);
    expect(prompt).toContain("5 causal edges");
    expect(prompt).toContain("3 business rules");
    expect(prompt).toContain("10 patterns/insights");
    expect(prompt).toContain("2 cascade rules");
  });

  it("works with zero counts", () => {
    const prompt = getNoHallucinationFallback(0, 0, 0, 0);
    expect(prompt).toContain("0 causal edges");
    expect(prompt).toContain("0 business rules");
  });

  it("returns a non-empty string", () => {
    const prompt = getNoHallucinationFallback(1, 1, 1, 1);
    expect(prompt.length).toBeGreaterThan(10);
  });
});

// ── injectMemoryCompression ───────────────────────────────────────────────────

describe("injectMemoryCompression", () => {
  const base = "## Base Prompt\nCore instructions.";

  it("returns original prompt when no compressed summary", () => {
    expect(injectMemoryCompression(base)).toBe(base);
    expect(injectMemoryCompression(base, "")).toBe(base);
    expect(injectMemoryCompression(base, "   ")).toBe(base);
  });

  it("prepends summary before the base prompt", () => {
    const result = injectMemoryCompression(base, "User discussed velocity issues.");
    expect(result).toContain("CONVERSATION MEMORY");
    expect(result).toContain("User discussed velocity issues.");
    // Summary comes before base prompt
    const summaryPos = result.indexOf("User discussed velocity issues.");
    const basePos = result.indexOf("## Base Prompt");
    expect(summaryPos).toBeLessThan(basePos);
  });

  it("includes a separator between summary and base", () => {
    const result = injectMemoryCompression(base, "Some earlier context.");
    expect(result).toContain("---");
  });

  it("does not modify base prompt content", () => {
    const result = injectMemoryCompression(base, "Summary here.");
    expect(result).toContain("Core instructions.");
  });
});

// ── injectCommandCenterPersona ────────────────────────────────────────────────

describe("injectCommandCenterPersona", () => {
  it("appends command-center role section to the prompt", () => {
    const result = injectCommandCenterPersona("Base prompt.");
    expect(result).toContain("Base prompt.");
    expect(result).toContain("AI Worker Intelligence Commander");
    expect(result).toContain("BrainOS Copilot");
  });

  it("appends content after the original prompt", () => {
    const base = "ORIGINAL";
    const result = injectCommandCenterPersona(base);
    expect(result.indexOf("ORIGINAL")).toBe(0);
  });

  it("includes behavioral rules", () => {
    const result = injectCommandCenterPersona("Base.");
    expect(result).toContain("BEHAVIORAL RULES");
    expect(result).toContain("Always orchestrate");
    expect(result).toContain("Anti-silence rule");
  });
});

// ── injectZeroDataGuard ───────────────────────────────────────────────────────

describe("injectZeroDataGuard", () => {
  it("appends zero-data consulting mode instructions", () => {
    const result = injectZeroDataGuard("Base prompt.");
    expect(result).toContain("Base prompt.");
    expect(result).toContain("Expert Consultant");
    expect(result).toContain("Causal graph data is not yet loaded");
  });

  it("includes guidance about what data to collect", () => {
    const result = injectZeroDataGuard("Base.");
    expect(result).toContain("GitHub");
    expect(result).toContain("/connectors");
  });

  it("appends after original prompt, not before", () => {
    const base = "MARKER";
    const result = injectZeroDataGuard(base);
    expect(result.indexOf("MARKER")).toBe(0);
    expect(result.length).toBeGreaterThan(base.length);
  });
});
