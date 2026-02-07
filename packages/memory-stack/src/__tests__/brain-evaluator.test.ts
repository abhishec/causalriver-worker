/**
 * Nexus Memory Stack - Brain Evaluator Tests
 *
 * Tests for the Brain Grammar Rules evaluation engine.
 * Validates condition evaluation, rule matching, and action execution.
 */

import { describe, it, expect } from 'vitest';
import {
  createBrainEvaluator,
  evaluateCondition,
  evaluateConditionGroup,
  getNestedValue,
} from '../learning/brain-evaluator';
import type {
  RuleCondition,
  ConditionGroup,
  EvaluationContext,
} from '../types';

describe('Brain Evaluator', () => {
  // ============================================================================
  // NESTED VALUE ACCESS TESTS
  // ============================================================================

  describe('getNestedValue', () => {
    const testObj = {
      name: 'Acme Corp',
      metrics: {
        revenue: 100000,
        health: {
          score: 85,
          trend: 'up',
        },
      },
      tags: ['enterprise', 'tech'],
    };

    it('should access top-level properties', () => {
      expect(getNestedValue(testObj, 'name')).toBe('Acme Corp');
    });

    it('should access nested properties with dot notation', () => {
      expect(getNestedValue(testObj, 'metrics.revenue')).toBe(100000);
      expect(getNestedValue(testObj, 'metrics.health.score')).toBe(85);
    });

    it('should return undefined for non-existent paths', () => {
      expect(getNestedValue(testObj, 'nonexistent')).toBeUndefined();
      expect(getNestedValue(testObj, 'metrics.nonexistent')).toBeUndefined();
    });

    it('should handle array access', () => {
      expect(getNestedValue(testObj, 'tags')).toEqual(['enterprise', 'tech']);
    });

    it('should handle null/undefined objects', () => {
      expect(getNestedValue(null, 'field')).toBeUndefined();
      expect(getNestedValue(undefined, 'field')).toBeUndefined();
    });
  });

  // ============================================================================
  // CONDITION EVALUATION TESTS
  // ============================================================================

  describe('evaluateCondition', () => {
    const context: EvaluationContext = {
      client: {
        name: 'Acme Corp',
        revenue: 500000,
        healthScore: 75,
        status: 'active',
        owner: null,
      },
    };

    describe('equals operator', () => {
      it('should match equal string values', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'equals',
          value: 'active',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should match equal numeric values', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'equals',
          value: 500000,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false for non-matching values', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'equals',
          value: 'inactive',
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('not_equals operator', () => {
      it('should return true for non-matching values', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'not_equals',
          value: 'inactive',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false for matching values', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'not_equals',
          value: 'active',
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('greater_than operator', () => {
      it('should return true when value is greater', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'greater_than',
          value: 400000,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false when value is equal', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'greater_than',
          value: 500000,
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });

      it('should return false when value is less', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'greater_than',
          value: 600000,
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('less_than operator', () => {
      it('should return true when value is less', () => {
        const condition: RuleCondition = {
          field: 'client.healthScore',
          operator: 'less_than',
          value: 80,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false when value is greater or equal', () => {
        const condition: RuleCondition = {
          field: 'client.healthScore',
          operator: 'less_than',
          value: 75,
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('greater_than_or_equals operator', () => {
      it('should return true when value is greater', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'greater_than_or_equals',
          value: 400000,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return true when value is equal', () => {
        const condition: RuleCondition = {
          field: 'client.revenue',
          operator: 'greater_than_or_equals',
          value: 500000,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe('less_than_or_equals operator', () => {
      it('should return true when value is less or equal', () => {
        const condition: RuleCondition = {
          field: 'client.healthScore',
          operator: 'less_than_or_equals',
          value: 75,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe('in operator', () => {
      it('should return true when value is in array', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'in',
          value: ['active', 'pending', 'trial'],
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false when value is not in array', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'in',
          value: ['inactive', 'churned'],
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('not_in operator', () => {
      it('should return true when value is not in array', () => {
        const condition: RuleCondition = {
          field: 'client.status',
          operator: 'not_in',
          value: ['inactive', 'churned'],
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe('contains operator', () => {
      it('should return true when string contains substring', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'contains',
          value: 'Acme',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false when not contained', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'contains',
          value: 'Beta',
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('not_contains operator', () => {
      it('should return true when string does not contain substring', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'not_contains',
          value: 'Beta',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe('is_null operator', () => {
      it('should return true for null values', () => {
        const condition: RuleCondition = {
          field: 'client.owner',
          operator: 'is_null',
          value: null,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false for non-null values', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'is_null',
          value: null,
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('is_not_null operator', () => {
      it('should return true for non-null values', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'is_not_null',
          value: null,
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe('starts_with operator', () => {
      it('should return true when string starts with prefix', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'starts_with',
          value: 'Acme',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it('should return false when string does not start with prefix', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'starts_with',
          value: 'Corp',
        };
        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe('ends_with operator', () => {
      it('should return true when string ends with suffix', () => {
        const condition: RuleCondition = {
          field: 'client.name',
          operator: 'ends_with',
          value: 'Corp',
        };
        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });
  });

  // ============================================================================
  // CONDITION GROUP TESTS
  // ============================================================================

  describe('evaluateConditionGroup', () => {
    const context: EvaluationContext = {
      client: {
        revenue: 500000,
        healthScore: 75,
        status: 'active',
      },
    };

    describe('AND logic', () => {
      it('should return true when all conditions match', () => {
        const group: ConditionGroup = {
          logic: 'AND',
          conditions: [
            { field: 'client.status', operator: 'equals', value: 'active' },
            { field: 'client.revenue', operator: 'greater_than', value: 100000 },
          ],
        };
        expect(evaluateConditionGroup(group, context)).toBe(true);
      });

      it('should return false when any condition fails', () => {
        const group: ConditionGroup = {
          logic: 'AND',
          conditions: [
            { field: 'client.status', operator: 'equals', value: 'active' },
            { field: 'client.revenue', operator: 'greater_than', value: 1000000 },
          ],
        };
        expect(evaluateConditionGroup(group, context)).toBe(false);
      });
    });

    describe('OR logic', () => {
      it('should return true when any condition matches', () => {
        const group: ConditionGroup = {
          logic: 'OR',
          conditions: [
            { field: 'client.status', operator: 'equals', value: 'inactive' },
            { field: 'client.revenue', operator: 'greater_than', value: 100000 },
          ],
        };
        expect(evaluateConditionGroup(group, context)).toBe(true);
      });

      it('should return false when no conditions match', () => {
        const group: ConditionGroup = {
          logic: 'OR',
          conditions: [
            { field: 'client.status', operator: 'equals', value: 'inactive' },
            { field: 'client.revenue', operator: 'greater_than', value: 1000000 },
          ],
        };
        expect(evaluateConditionGroup(group, context)).toBe(false);
      });
    });

    describe('NOT logic', () => {
      it('should negate the result of conditions', () => {
        const group: ConditionGroup = {
          logic: 'NOT',
          conditions: [
            { field: 'client.status', operator: 'equals', value: 'inactive' },
          ],
        };
        expect(evaluateConditionGroup(group, context)).toBe(true);
      });
    });

    describe('Nested condition groups', () => {
      it('should handle nested AND within OR', () => {
        const group: ConditionGroup = {
          logic: 'OR',
          conditions: [
            {
              logic: 'AND',
              conditions: [
                { field: 'client.status', operator: 'equals', value: 'active' },
                { field: 'client.healthScore', operator: 'less_than', value: 50 },
              ],
            },
            {
              logic: 'AND',
              conditions: [
                { field: 'client.status', operator: 'equals', value: 'active' },
                { field: 'client.revenue', operator: 'greater_than', value: 400000 },
              ],
            },
          ],
        };
        // First AND group fails (healthScore >= 50)
        // Second AND group passes (active AND revenue > 400000)
        expect(evaluateConditionGroup(group, context)).toBe(true);
      });
    });
  });

  // ============================================================================
  // BRAIN EVALUATOR FACTORY TESTS
  // ============================================================================

  describe('createBrainEvaluator', () => {
    it('should create evaluator with default config', () => {
      const evaluator = createBrainEvaluator({});
      expect(evaluator).toBeDefined();
      expect(typeof evaluator.evaluateRules).toBe('function');
    });

  });
});
