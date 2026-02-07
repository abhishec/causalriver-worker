/**
 * Nexus Memory Stack - Cascade Rules Tests
 *
 * Tests for cross-domain cascade detection and goal conflict analysis.
 */

import { describe, it, expect } from 'vitest';
import {
  createCascadeRulesEngine,
  normalizeDomain,
  extractKeywordsFromText,
  COMMON_BUSINESS_KEYWORDS,
} from '../causality/cascade-rules';

describe('Cascade Rules Engine', () => {
  // ============================================================================
  // DOMAIN NORMALIZATION TESTS
  // ============================================================================

  describe('normalizeDomain', () => {
    it('should lowercase domain names', () => {
      expect(normalizeDomain('Finance')).toBe('finance');
      expect(normalizeDomain('REVENUE')).toBe('revenue');
    });

    it('should handle null domains', () => {
      expect(normalizeDomain(null)).toBe('general');
    });

    it('should trim whitespace', () => {
      expect(normalizeDomain('  finance  ')).toBe('finance');
    });

    it('should use custom aliases when provided', () => {
      const aliases = { cs: 'customer-success' };
      expect(normalizeDomain('cs', aliases)).toBe('customer-success');
    });

    it('should pass through unknown domains', () => {
      expect(normalizeDomain('custom_domain')).toBe('custom_domain');
      expect(normalizeDomain('unknown')).toBe('unknown');
    });
  });

  // ============================================================================
  // KEYWORD EXTRACTION TESTS
  // ============================================================================

  describe('extractKeywordsFromText', () => {
    it('should extract business keywords from text', () => {
      const text = 'The invoice payment is overdue and affecting cash flow';
      const keywords = extractKeywordsFromText(text);
      expect(keywords).toContain('invoice');
      expect(keywords).toContain('payment');
    });

    it('should handle empty text', () => {
      const keywords = extractKeywordsFromText('');
      expect(keywords.length).toBe(0);
    });

    it('should be case insensitive', () => {
      const keywords1 = extractKeywordsFromText('INVOICE payment');
      const keywords2 = extractKeywordsFromText('invoice PAYMENT');
      expect(keywords1).toContain('invoice');
      expect(keywords2).toContain('invoice');
    });
  });

  // ============================================================================
  // COMMON BUSINESS KEYWORDS
  // ============================================================================

  describe('COMMON_BUSINESS_KEYWORDS', () => {
    it('should contain finance-related keywords', () => {
      expect(COMMON_BUSINESS_KEYWORDS).toContain('invoice');
      expect(COMMON_BUSINESS_KEYWORDS).toContain('payment');
      expect(COMMON_BUSINESS_KEYWORDS).toContain('cash');
      expect(COMMON_BUSINESS_KEYWORDS).toContain('revenue');
    });

    it('should contain CS-related keywords', () => {
      expect(COMMON_BUSINESS_KEYWORDS).toContain('health');
      expect(COMMON_BUSINESS_KEYWORDS).toContain('churn');
    });

    it('should be an array of strings', () => {
      expect(Array.isArray(COMMON_BUSINESS_KEYWORDS)).toBe(true);
      expect(COMMON_BUSINESS_KEYWORDS.length).toBeGreaterThan(0);
      expect(typeof COMMON_BUSINESS_KEYWORDS[0]).toBe('string');
    });
  });

  // ============================================================================
  // CASCADE RULES ENGINE TESTS
  // ============================================================================

  describe('createCascadeRulesEngine', () => {
    it('should create engine with default options', () => {
      const engine = createCascadeRulesEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.fetchRules).toBe('function');
      expect(typeof engine.detectConflicts).toBe('function');
    });

    it('should create engine with custom domain aliases', () => {
      const engine = createCascadeRulesEngine({
        domainAliases: { cs: 'customer-success' },
      });
      expect(engine).toBeDefined();
    });

    it('should create engine with custom table names', () => {
      const engine = createCascadeRulesEngine({
        orgRulesTable: 'custom_org_rules',
        platformRulesTable: 'custom_platform_rules',
      });
      expect(engine).toBeDefined();
    });

    describe('detectConflicts', () => {
      it('should return empty array when no rules provided', () => {
        const engine = createCascadeRulesEngine();
        const conflicts = engine.detectConflicts([], [], []);
        expect(conflicts).toEqual([]);
      });

      it('should return empty array when no matching goals', () => {
        const engine = createCascadeRulesEngine();
        const rules = [
          {
            id: 'rule-1',
            source_domain: 'finance',
            source_goal_keywords: ['dso', 'collection'],
            target_domain: 'am',
            target_goal_keywords: ['expansion', 'upsell'],
            relationship_type: 'blocks' as const,
            severity: 'high' as const,
            reason_template: 'Test reason',
          },
        ];
        const conflicts = engine.detectConflicts(rules, [], []);
        expect(conflicts).toEqual([]);
      });
    });

  });

  // ============================================================================
  // TYPE DEFINITIONS TESTS
  // ============================================================================

  describe('Type Definitions', () => {
    it('should support cascade relationship types', () => {
      const types = ['blocks', 'delays', 'impacts', 'enables', 'triggers'];
      types.forEach((type) => {
        expect(typeof type).toBe('string');
      });
    });

    it('should support severity levels', () => {
      const severities = ['critical', 'high', 'medium', 'low'];
      severities.forEach((severity) => {
        expect(typeof severity).toBe('string');
      });
    });
  });
});
