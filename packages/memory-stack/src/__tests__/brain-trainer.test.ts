import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBrainTrainer,
  type TrainingPack,
} from '../learning/brain-trainer';
import {
  TRAINING_LIBRARY,
  getTrainingPackById,
  getTrainingPacksByIndustry,
  getTrainingPacksByDomain,
  getTrainingPacksByTag,
  getAllTrainingPacks,
} from '../learning/training-library';

// ============================================================================
// FIXTURES
// ============================================================================

function createMinimalPack(overrides: Partial<TrainingPack> = {}): TrainingPack {
  return {
    id: 'test-pack-1',
    title: 'Test Training Pack',
    source: 'Unit test',
    industry: 'SaaS',
    domains: ['finance', 'cs'],
    confidence: 0.85,
    causalChains: [
      { source: 'finance', target: 'cs', metric: 'health_score', effectSize: 0.45, lagDays: 14, pValue: 0.01 },
    ],
    businessRules: [
      {
        title: 'Test Rule',
        entityType: 'client',
        when: { logic: 'AND', conditions: [{ field: 'invoice.days_overdue', operator: 'greater_than', value: 30 }] },
        then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'Test alert' } }],
        naturalLanguage: 'Test rule for overdue invoices',
      },
    ],
    cascades: [
      { source: 'finance', target: 'cs', type: 'triggers', severity: 'high', keywords: { source: ['payment'], target: ['ticket'] } },
    ],
    patterns: [
      { name: 'Test Pattern', domains: ['finance', 'cs'], observed: 70, expected: 30, total: 100 },
    ],
    outcomes: [
      { predicted: 'churn', predictedConfidence: 0.80, actual: 'churn', wasCorrect: true },
    ],
    narrative: 'A test training pack for unit testing the brain trainer pipeline.',
    ...overrides,
  };
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('Brain Trainer', () => {
  let trainer: ReturnType<typeof createBrainTrainer>;

  beforeEach(() => {
    trainer = createBrainTrainer();
  });

  describe('validatePack', () => {
    it('should validate a minimal valid pack', () => {
      const result = trainer.validatePack(createMinimalPack());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject pack without id', () => {
      const result = trainer.validatePack(createMinimalPack({ id: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Training pack must have an id');
    });

    it('should reject pack without title', () => {
      const result = trainer.validatePack(createMinimalPack({ title: '' }));
      expect(result.valid).toBe(false);
    });

    it('should reject pack without source', () => {
      const result = trainer.validatePack(createMinimalPack({ source: '' }));
      expect(result.valid).toBe(false);
    });

    it('should reject pack with no domains', () => {
      const result = trainer.validatePack(createMinimalPack({ domains: [] }));
      expect(result.valid).toBe(false);
    });

    it('should reject pack with invalid confidence', () => {
      expect(trainer.validatePack(createMinimalPack({ confidence: -0.1 })).valid).toBe(false);
      expect(trainer.validatePack(createMinimalPack({ confidence: 1.5 })).valid).toBe(false);
    });

    it('should reject causal chain with missing source', () => {
      const result = trainer.validatePack(createMinimalPack({
        causalChains: [{ source: '', target: 'cs', metric: 'x', effectSize: 0.5, lagDays: 7 }],
      }));
      expect(result.valid).toBe(false);
    });

    it('should reject causal chain with negative lag', () => {
      const result = trainer.validatePack(createMinimalPack({
        causalChains: [{ source: 'a', target: 'b', metric: 'x', effectSize: 0.5, lagDays: -1 }],
      }));
      expect(result.valid).toBe(false);
    });

    it('should warn when same source and target domain', () => {
      const result = trainer.validatePack(createMinimalPack({
        causalChains: [{ source: 'finance', target: 'finance', metric: 'x', effectSize: 0.5, lagDays: 7 }],
      }));
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('same domain'))).toBe(true);
    });

    it('should reject business rule without title', () => {
      const result = trainer.validatePack(createMinimalPack({
        businessRules: [{
          title: '', entityType: 'client',
          when: { logic: 'AND', conditions: [] },
          then: [{ type: 'trigger_alert', params: {} }],
          naturalLanguage: 'x',
        }],
      }));
      expect(result.valid).toBe(false);
    });

    it('should reject pattern with invalid counts', () => {
      const result = trainer.validatePack(createMinimalPack({
        patterns: [{ name: 'Bad', domains: ['a'], observed: -1, expected: 0, total: 0 }],
      }));
      expect(result.valid).toBe(false);
    });

    it('should warn when no causal chains provided', () => {
      const result = trainer.validatePack(createMinimalPack({ causalChains: [] }));
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('No causal chains'))).toBe(true);
    });

    it('should warn when no narrative provided', () => {
      const result = trainer.validatePack(createMinimalPack({ narrative: undefined }));
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('No narrative'))).toBe(true);
    });
  });

  // ============================================================================
  // IN-MEMORY TRAINING TESTS
  // ============================================================================

  describe('trainInMemory', () => {
    it('should train a single pack successfully', () => {
      const result = trainer.trainInMemory(createMinimalPack());
      expect(result.success).toBe(true);
      expect(result.packId).toBe('test-pack-1');
      expect(result.causalEdges).toBe(1);
      expect(result.rules).toBe(1);
      expect(result.patterns).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid pack', () => {
      const result = trainer.trainInMemory(createMinimalPack({ id: '' }));
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should load causal edges into the graph', () => {
      trainer.trainInMemory(createMinimalPack({
        causalChains: [
          { source: 'finance', target: 'cs', metric: 'health', effectSize: 0.45, lagDays: 14, pValue: 0.01 },
          { source: 'cs', target: 'product', metric: 'bugs', effectSize: 0.30, lagDays: 7, pValue: 0.03 },
        ],
      }));
      const graph = trainer.getTrainedGraph();
      expect(graph.edges.length).toBe(2);
      expect(graph.nodes.has('finance')).toBe(true);
      expect(graph.nodes.has('cs')).toBe(true);
      expect(graph.nodes.has('product')).toBe(true);
    });

    it('should register patterns with statistical evidence', () => {
      trainer.trainInMemory(createMinimalPack({
        patterns: [
          { name: 'Pattern A', domains: ['finance', 'cs'], observed: 70, expected: 30, total: 100 },
          { name: 'Pattern B', domains: ['cs', 'product'], observed: 55, expected: 25, total: 100 },
        ],
      }));
      const patterns = trainer.getTrainedPatterns();
      expect(patterns.length).toBe(2);
      expect(patterns[0].name).toBe('Pattern A');
      expect(patterns[0].evidence.testType).toBe('chi-squared');
      expect(patterns[0].evidence.pValue).toBeLessThan(0.05);
    });

    it('should create brain grammar rules', () => {
      trainer.trainInMemory(createMinimalPack());
      const rules = trainer.getTrainedRules();
      expect(rules.length).toBe(1);
      expect(rules[0].title).toBe('Test Rule');
      expect(rules[0].created_by).toBe('ai');
      expect(rules[0].is_active).toBe(true);
    });

    it('should track stats across multiple packs', () => {
      trainer.trainInMemory(createMinimalPack({ id: 'pack-1' }));
      trainer.trainInMemory(createMinimalPack({
        id: 'pack-2',
        causalChains: [{ source: 'product', target: 'finance', metric: 'revenue', effectSize: 0.5, lagDays: 30, pValue: 0.01 }],
        patterns: [
          { name: 'P1', domains: ['product'], observed: 60, expected: 30, total: 100 },
          { name: 'P2', domains: ['finance'], observed: 55, expected: 25, total: 100 },
        ],
      }));
      const stats = trainer.getTrainingStats();
      expect(stats.casesLoaded).toBe(2);
      expect(stats.causalEdgesLoaded).toBe(2);
      expect(stats.patternsLoaded).toBe(3);
      expect(stats.rulesLoaded).toBe(2);
    });

    it('should handle pack with empty sections', () => {
      const result = trainer.trainInMemory(createMinimalPack({
        causalChains: [], businessRules: [], cascades: [],
        patterns: [], outcomes: [], narrative: undefined,
      }));
      expect(result.success).toBe(true);
      expect(result.causalEdges).toBe(0);
    });

    it('should generate embedding when narrative is provided', () => {
      trainer.trainInMemory(createMinimalPack({ narrative: 'Test narrative' }));
      expect(trainer.getTrainingStats().embeddingsGenerated).toBe(1);
    });

    it('should not generate embedding when narrative is missing', () => {
      trainer.trainInMemory(createMinimalPack({ narrative: undefined }));
      expect(trainer.getTrainingStats().embeddingsGenerated).toBe(0);
    });
  });

  // ============================================================================
  // CAUSAL EDGE DETAILS
  // ============================================================================

  describe('causal edge details', () => {
    it('should use absolute value for negative effect sizes', () => {
      trainer.trainInMemory(createMinimalPack({
        causalChains: [{ source: 'a', target: 'b', metric: 'x', effectSize: -0.45, lagDays: 10 }],
      }));
      expect(trainer.getTrainedGraph().edges[0].effectSize).toBeCloseTo(0.45, 2);
    });

    it('should default pValue to 0.01', () => {
      trainer.trainInMemory(createMinimalPack({
        causalChains: [{ source: 'a', target: 'b', metric: 'x', effectSize: 0.5, lagDays: 10 }],
      }));
      expect(trainer.getTrainedGraph().edges[0].pValue).toBe(0.01);
    });

    it('should set confidence interval with level 0.95', () => {
      trainer.trainInMemory(createMinimalPack({ confidence: 0.90 }));
      const ci = trainer.getTrainedGraph().edges[0].confidenceInterval;
      expect(ci.level).toBe(0.95);
      expect(ci.lower).toBeLessThan(ci.upper);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // CONFIG
  // ============================================================================

  describe('config', () => {
    it('should respect autoActivateRules = false', () => {
      const t = createBrainTrainer({ autoActivateRules: false });
      t.trainInMemory(createMinimalPack());
      expect(t.getTrainedRules()[0].is_active).toBe(false);
    });

    it('should respect custom sample size', () => {
      const t = createBrainTrainer({ defaultSampleSize: 500 });
      t.trainInMemory(createMinimalPack());
      expect(t.getTrainedGraph().edges[0].sampleSize).toBe(500);
    });

    it('should respect custom F-statistic', () => {
      const t = createBrainTrainer({ defaultFStatistic: 15.0 });
      t.trainInMemory(createMinimalPack());
      expect(t.getTrainedGraph().edges[0].fStatistic).toBe(15.0);
    });
  });

  // ============================================================================
  // RESET
  // ============================================================================

  describe('resetStats', () => {
    it('should reset all counters', () => {
      trainer.trainInMemory(createMinimalPack());
      expect(trainer.getTrainingStats().casesLoaded).toBe(1);
      trainer.resetStats();
      const stats = trainer.getTrainingStats();
      expect(stats.casesLoaded).toBe(0);
      expect(stats.causalEdgesLoaded).toBe(0);
      expect(stats.errors).toHaveLength(0);
    });
  });
});

// ============================================================================
// TRAINING LIBRARY TESTS
// ============================================================================

describe('Training Library', () => {
  it('should have 29 pre-built training packs', () => {
    expect(TRAINING_LIBRARY.length).toBe(29);
  });

  it('should have unique IDs for all packs', () => {
    const ids = TRAINING_LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have valid confidence for all packs', () => {
    for (const p of TRAINING_LIBRARY) {
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should have causal chains in all packs', () => {
    for (const p of TRAINING_LIBRARY) {
      expect(p.causalChains.length).toBeGreaterThan(0);
    }
  });

  it('should have at least one business rule in all packs', () => {
    for (const p of TRAINING_LIBRARY) {
      expect(p.businessRules.length).toBeGreaterThan(0);
    }
  });

  it('should pass validation for all library packs', () => {
    const trainer = createBrainTrainer();
    for (const p of TRAINING_LIBRARY) {
      const result = trainer.validatePack(p);
      expect(result.valid).toBe(true);
    }
  });

  it('should train all library packs in-memory without errors', () => {
    const trainer = createBrainTrainer();
    for (const p of TRAINING_LIBRARY) {
      const result = trainer.trainInMemory(p);
      expect(result.success).toBe(true);
    }
    const stats = trainer.getTrainingStats();
    expect(stats.casesLoaded).toBe(29);
    expect(stats.causalEdgesLoaded).toBeGreaterThan(20);
    expect(stats.patternsLoaded).toBeGreaterThan(10);
    expect(stats.rulesLoaded).toBeGreaterThan(10);
  });

  describe('getTrainingPackById', () => {
    it('should find pack by id', () => {
      const p = getTrainingPackById('payment-delinquency-spiral');
      expect(p).toBeDefined();
      expect(p!.title).toContain('Payment');
    });

    it('should return undefined for unknown id', () => {
      expect(getTrainingPackById('nonexistent')).toBeUndefined();
    });
  });

  describe('getTrainingPacksByIndustry', () => {
    it('should find SaaS packs', () => {
      expect(getTrainingPacksByIndustry('SaaS').length).toBeGreaterThan(5);
    });

    it('should be case-insensitive', () => {
      expect(getTrainingPacksByIndustry('saas').length).toBeGreaterThan(0);
    });

    it('should return empty for unknown industry', () => {
      expect(getTrainingPacksByIndustry('Unknown')).toHaveLength(0);
    });
  });

  describe('getTrainingPacksByDomain', () => {
    it('should find finance packs', () => {
      expect(getTrainingPacksByDomain('finance').length).toBeGreaterThan(5);
    });

    it('should find product packs', () => {
      expect(getTrainingPacksByDomain('product').length).toBeGreaterThan(3);
    });
  });

  describe('getTrainingPacksByTag', () => {
    it('should find packs by tag', () => {
      const packs = getTrainingPacksByTag('churn');
      expect(packs.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown tag', () => {
      expect(getTrainingPacksByTag('nonexistent')).toHaveLength(0);
    });
  });

  describe('getAllTrainingPacks', () => {
    it('should return a copy', () => {
      const all = getAllTrainingPacks();
      expect(all.length).toBe(TRAINING_LIBRARY.length);
      expect(all).not.toBe(TRAINING_LIBRARY);
    });
  });
});
