/**
 * Tests for lib/safe-json.ts — null-safe JSON parsing utility.
 * Pure function, no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { safeJsonParse } from "@/lib/safe-json";

describe("safeJsonParse", () => {
  describe("valid JSON", () => {
    it("parses a JSON object", () => {
      const result = safeJsonParse<{ key: string }>('{"key":"value"}', { key: "default" });
      expect(result).toEqual({ key: "value" });
    });

    it("parses a JSON array", () => {
      const result = safeJsonParse<number[]>("[1, 2, 3]", []);
      expect(result).toEqual([1, 2, 3]);
    });

    it("parses a JSON string", () => {
      const result = safeJsonParse<string>('"hello"', "default");
      expect(result).toBe("hello");
    });

    it("parses a JSON number", () => {
      const result = safeJsonParse<number>("42", 0);
      expect(result).toBe(42);
    });

    it("parses a JSON boolean true", () => {
      const result = safeJsonParse<boolean>("true", false);
      expect(result).toBe(true);
    });

    it("parses a JSON boolean false", () => {
      const result = safeJsonParse<boolean>("false", true);
      expect(result).toBe(false);
    });

    it("parses JSON null as null", () => {
      const result = safeJsonParse<null | string>("null", "fallback");
      expect(result).toBeNull();
    });

    it("parses nested objects", () => {
      const result = safeJsonParse<{ a: { b: number } }>('{"a":{"b":1}}', { a: { b: 0 } });
      expect(result).toEqual({ a: { b: 1 } });
    });
  });

  describe("invalid input returns fallback", () => {
    it("returns fallback for malformed JSON", () => {
      const result = safeJsonParse<string>("{bad json}", "fallback");
      expect(result).toBe("fallback");
    });

    it("returns fallback for empty string", () => {
      const result = safeJsonParse<string>("", "fallback");
      expect(result).toBe("fallback");
    });

    it("returns fallback for null input", () => {
      const result = safeJsonParse<string>(null, "fallback");
      expect(result).toBe("fallback");
    });

    it("returns fallback for undefined input", () => {
      const result = safeJsonParse<string>(undefined, "fallback");
      expect(result).toBe("fallback");
    });

    it("returns array fallback for malformed input", () => {
      const result = safeJsonParse<string[]>("not json", []);
      expect(result).toEqual([]);
    });

    it("returns object fallback for malformed input", () => {
      const result = safeJsonParse<Record<string, unknown>>("not json", { key: "default" });
      expect(result).toEqual({ key: "default" });
    });

    it("returns null fallback for malformed input", () => {
      const result = safeJsonParse<null>("not json", null);
      expect(result).toBeNull();
    });

    it("returns 0 as fallback (falsy but valid)", () => {
      const result = safeJsonParse<number>("not json", 0);
      expect(result).toBe(0);
    });
  });
});
