import { describe, it, expect } from "vitest";
import { ARTIFACT_TYPE_LABELS, ARTIFACT_TYPE_ICONS } from "../components/copilot/types";
import type { ArtifactType } from "../components/copilot/types";

describe("UnifiedArtifact type system", () => {
  const ALL_TYPES: ArtifactType[] = [
    "code",
    "analysis",
    "table",
    "chart",
    "document",
    "financial-statement",
    "engineering-analysis",
    "mermaid-diagram",
    "agent-execution",
    "presentation",
    "pdf",
    "infographic",
  ];

  it("should have labels for all artifact types", () => {
    for (const type of ALL_TYPES) {
      expect(ARTIFACT_TYPE_LABELS[type], `Missing label for type: ${type}`).toBeTruthy();
    }
  });

  it("should have SVG path icons for all artifact types", () => {
    for (const type of ALL_TYPES) {
      expect(ARTIFACT_TYPE_ICONS[type], `Missing icon for type: ${type}`).toBeTruthy();
      // SVG path data should start with M
      expect(ARTIFACT_TYPE_ICONS[type].startsWith("M"), `Invalid SVG path for type: ${type}`).toBe(true);
    }
  });

  it("should have all artifact types covered", () => {
    expect(Object.keys(ARTIFACT_TYPE_LABELS).length).toBe(ALL_TYPES.length);
    expect(Object.keys(ARTIFACT_TYPE_ICONS).length).toBe(ALL_TYPES.length);
  });

  it("financial-statement should be labeled correctly", () => {
    expect(ARTIFACT_TYPE_LABELS["financial-statement"]).toBe("Financial Statement");
  });

  it("engineering-analysis should be labeled correctly", () => {
    expect(ARTIFACT_TYPE_LABELS["engineering-analysis"]).toBe("Engineering Analysis");
  });
});
