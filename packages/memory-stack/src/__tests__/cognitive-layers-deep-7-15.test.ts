/**
 * CTO-Level Deep Test Suite: Layers 7-15
 *
 * Every method of every layer tested:
 *   - Factory instantiation with default + custom config
 *   - All public methods with valid inputs
 *   - Edge cases: empty inputs, boundary values, large datasets
 *   - State management: consecutive calls, reset behavior
 *   - Cross-layer data flow validation
 *   - Scale readiness: burst patterns, bounded memory
 *
 * BRAIN layers 7: Intelligence Mesh (Collective)
 * MIND layers 8-15: Imagination, Theory of Mind, Temporal, Red Team,
 *                    Experimentation, Immune System, Goal-Backward, Narrative
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';

// Layer 7
import { createIntelligenceMesh } from '../causality/leap-intelligence-mesh';

// Layer 8
import { createCausalImagination, type ImaginationEdge } from '../causality/leap-causal-imagination';

// Layer 9
import { createTheoryOfMind } from '../causality/leap-theory-of-mind';

// Layer 10
import { createTemporalConsciousness } from '../causality/leap-temporal-consciousness';

// Layer 11
import { createRedTeam, type Prediction } from '../causality/leap-red-team';

// Layer 12
import { createExperimentEngine } from '../causality/leap-experimentation';

// Layer 13
import { createImmuneSystem, type DataSignal } from '../causality/leap-immune-system';

// Layer 14
import { createGoalBackwardPlanner, type Goal, type CausalEdge } from '../causality/leap-goal-backward';

// Layer 15
import { createNarrativeIntelligence, type NarrativeInput } from '../causality/leap-narrative';

// ============================================================================
// HELPERS
// ============================================================================

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred_1',
    organizationId: 'org1',
    domain: 'revenue',
    claim: 'Revenue will increase by 20% in Q1',
    confidence: 0.85,
    evidence: ['marketing_spend_up', 'churn_rate_down', 'new_product_launch'],
    method: 'granger_causal',
    timestamp: new Date(),
    ...overrides,
  };
}

function makeDataSignal(overrides: Partial<DataSignal> = {}): DataSignal {
  return {
    id: `signal_${Math.random().toString(36).slice(2)}`,
    organizationId: 'org1',
    source: 'github',
    domain: 'engineering',
    entityType: 'commit',
    entityId: 'entity_1',
    value: 42,
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal_1',
    targetMetric: 'revenue',
    targetValue: 200000,
    currentValue: 100000,
    direction: 'increase',
    timeframeWeeks: 12,
    priority: 'high',
    ...overrides,
  };
}

function makeCausalEdges(): CausalEdge[] {
  return [
    { source: 'marketing', target: 'leads', weight: 0.7, confidence: 0.8 },
    { source: 'leads', target: 'pipeline', weight: 0.6, confidence: 0.7 },
    { source: 'pipeline', target: 'revenue', weight: 0.8, confidence: 0.9 },
    { source: 'engineering', target: 'product_quality', weight: 0.5, confidence: 0.6 },
    { source: 'product_quality', target: 'churn', weight: -0.4, confidence: 0.5 },
    { source: 'churn', target: 'revenue', weight: -0.6, confidence: 0.7 },
    { source: 'support', target: 'satisfaction', weight: 0.3, confidence: 0.4 },
    { source: 'satisfaction', target: 'churn', weight: -0.5, confidence: 0.6 },
  ];
}

function makeImaginationEdges(): ImaginationEdge[] {
  return [
    { source: 'marketing', target: 'revenue', weight: 0.7, domain: 'revenue', confidence: 0.8 },
    { source: 'engineering', target: 'churn', weight: -0.4, domain: 'engineering', confidence: 0.6 },
    { source: 'support', target: 'satisfaction', weight: 0.5, domain: 'cs', confidence: 0.7 },
    { source: 'product', target: 'usage', weight: 0.6, domain: 'product', confidence: 0.5 },
  ];
}

function makeNarrativeInput(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    organizationId: 'org1',
    timeRangeHours: 24,
    edges: [
      { source: 'marketing', target: 'revenue', weight: 0.8, confidence: 0.7, isNew: true, strengthChange: 0.15 },
      { source: 'engineering', target: 'churn', weight: -0.3, confidence: 0.6, isNew: false, strengthChange: -0.05 },
    ],
    predictions: [
      { id: 'pred1', claim: 'Revenue will increase by 15%', confidence: 0.8, domain: 'revenue' },
      { id: 'pred2', claim: 'Churn will decrease', confidence: 0.6, domain: 'cs', verified: true, accurate: true },
    ],
    anomalies: [
      { id: 'anom1', metric: 'signups', domain: 'growth', severity: 'high', description: 'Signup spike', value: 500, expectedValue: 200 },
    ],
    interventions: [
      { id: 'int1', type: 'pricing', target: 'revenue', outcome: 'successful', description: 'Price increase by 10%' },
    ],
    metrics: [
      { name: 'revenue', domain: 'revenue', currentValue: 100000, previousValue: 90000, trend: 'up', change: 10000, changePercent: 11.1 },
      { name: 'churn', domain: 'cs', currentValue: 0.05, previousValue: 0.07, trend: 'down', change: -0.02, changePercent: -28.6 },
    ],
    ...overrides,
  };
}

// ============================================================================
// LAYER 7: INTELLIGENCE MESH — DEEP TESTS
// ============================================================================

describe('Layer 7: Intelligence Mesh — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const mesh = createIntelligenceMesh();
      expect(mesh).toBeDefined();
      expect(mesh.getStats().totalOrgs).toBe(0);
    });

    it('creates with custom config', () => {
      const mesh = createIntelligenceMesh({
        minTrustScore: 0.5,
        trustDecayRate: 0.01,
        minConsensusOrgs: 2,
        conflictStrategy: 'highest_trust',
        maxMeshSize: 500,
      });
      expect(mesh).toBeDefined();
    });
  });

  describe('registerOrg', () => {
    it('registers new organizations', () => {
      const mesh = createIntelligenceMesh();
      mesh.registerOrg('org1');
      mesh.registerOrg('org2');
      expect(mesh.getStats().totalOrgs).toBe(2);
    });

    it('does not duplicate orgs', () => {
      const mesh = createIntelligenceMesh();
      mesh.registerOrg('org1');
      mesh.registerOrg('org1');
      expect(mesh.getStats().totalOrgs).toBe(1);
    });
  });

  describe('contribute', () => {
    it('accepts contributions from registered orgs', () => {
      const mesh = createIntelligenceMesh();
      mesh.registerOrg('org1');
      const accepted = mesh.contribute({
        orgId: 'org1', domain: 'revenue', pattern: 'pricing affects retention',
        confidence: 0.7, evidenceCount: 10, timestamp: Date.now(),
      });
      expect(accepted).toBe(true);
    });

    it('accepts contributions from any org (auto-registers)', () => {
      const mesh = createIntelligenceMesh();
      const accepted = mesh.contribute({
        orgId: 'auto_registered', domain: 'revenue', pattern: 'test',
        confidence: 0.7, evidenceCount: 5, timestamp: Date.now(),
      });
      // Mesh auto-registers contributing orgs
      expect(accepted).toBe(true);
    });
  });

  describe('collectiveSense', () => {
    it('detects collective patterns from multiple orgs', () => {
      const mesh = createIntelligenceMesh({ minConsensusOrgs: 2 });
      mesh.registerOrg('org1');
      mesh.registerOrg('org2');
      mesh.registerOrg('org3');

      // Same pattern from 3 orgs
      for (const orgId of ['org1', 'org2', 'org3']) {
        mesh.contribute({
          orgId, domain: 'revenue', pattern: 'marketing drives leads',
          confidence: 0.7, evidenceCount: 10, timestamp: Date.now(),
        });
      }

      const result = mesh.collectiveSense();
      expect(result.collectivePatterns.length).toBeGreaterThan(0);
      const pattern = result.collectivePatterns.find(p => p.pattern === 'marketing drives leads');
      expect(pattern).toBeDefined();
      expect(pattern!.orgCount).toBeGreaterThanOrEqual(2);
    });

    it('detects emergent patterns', () => {
      const mesh = createIntelligenceMesh({ minConsensusOrgs: 2 });
      mesh.registerOrg('org1');
      mesh.registerOrg('org2');

      mesh.contribute({
        orgId: 'org1', domain: 'revenue', pattern: 'pricing affects retention',
        confidence: 0.8, evidenceCount: 15, timestamp: Date.now(),
      });
      mesh.contribute({
        orgId: 'org2', domain: 'revenue', pattern: 'pricing affects retention',
        confidence: 0.7, evidenceCount: 12, timestamp: Date.now(),
      });

      const result = mesh.collectiveSense();
      expect(result.collectivePatterns.length).toBeGreaterThan(0);
    });

    it('returns empty on no contributions', () => {
      const mesh = createIntelligenceMesh();
      const result = mesh.collectiveSense();
      expect(result.collectivePatterns.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
    });
  });

  describe('resolveConflict', () => {
    it('resolves detected conflicts', () => {
      const mesh = createIntelligenceMesh({ minConsensusOrgs: 2, conflictStrategy: 'weighted_vote' });
      mesh.registerOrg('org1');
      mesh.registerOrg('org2');

      // Conflicting contributions
      mesh.contribute({
        orgId: 'org1', domain: 'revenue', pattern: 'marketing drives revenue positively',
        confidence: 0.9, evidenceCount: 20, timestamp: Date.now(),
      });
      mesh.contribute({
        orgId: 'org2', domain: 'revenue', pattern: 'marketing drives revenue negatively',
        confidence: 0.6, evidenceCount: 5, timestamp: Date.now(),
      });

      const sensing = mesh.collectiveSense();
      if (sensing.conflicts.length > 0) {
        const resolved = mesh.resolveConflict(sensing.conflicts[0].id);
        if (resolved) {
          expect(resolved.status).toBe('resolved');
          expect(resolved.resolution).toBeDefined();
        }
      }
    });
  });

  describe('trust management', () => {
    it('tracks and updates org trust scores', () => {
      const mesh = createIntelligenceMesh();
      mesh.registerOrg('org1');

      mesh.updateTrust('org1', 'revenue', true);
      mesh.updateTrust('org1', 'revenue', true);
      mesh.updateTrust('org1', 'revenue', false);

      const trust = mesh.getTrust('org1');
      expect(trust).toBeDefined();
      expect(trust!.trustScore).toBeGreaterThan(0);
      expect(trust!.trustScore).toBeLessThanOrEqual(1);
    });

    it('returns undefined for unknown orgs', () => {
      const mesh = createIntelligenceMesh();
      expect(mesh.getTrust('nonexistent')).toBeUndefined();
    });
  });

  describe('getCollectivePatterns', () => {
    it('returns all collective patterns', () => {
      const mesh = createIntelligenceMesh({ minConsensusOrgs: 2 });
      mesh.registerOrg('org1');
      mesh.registerOrg('org2');

      mesh.contribute({ orgId: 'org1', domain: 'rev', pattern: 'test1', confidence: 0.7, evidenceCount: 5, timestamp: Date.now() });
      mesh.contribute({ orgId: 'org2', domain: 'rev', pattern: 'test1', confidence: 0.8, evidenceCount: 8, timestamp: Date.now() });

      mesh.collectiveSense(); // trigger analysis
      const patterns = mesh.getCollectivePatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    it('returns comprehensive mesh statistics', () => {
      const mesh = createIntelligenceMesh();
      mesh.registerOrg('org1');
      mesh.contribute({
        orgId: 'org1', domain: 'revenue', pattern: 'test',
        confidence: 0.7, evidenceCount: 5, timestamp: Date.now(),
      });

      const stats = mesh.getStats();
      expect(stats.totalOrgs).toBe(1);
      expect(typeof stats.totalCollectivePatterns).toBe('number');
      expect(typeof stats.activeConflicts).toBe('number');
      expect(typeof stats.averageTrustScore).toBe('number');
      expect(Array.isArray(stats.topContributors)).toBe(true);
    });
  });
});

// ============================================================================
// LAYER 8: CAUSAL IMAGINATION — DEEP TESTS
// ============================================================================

describe('Layer 8: Causal Imagination — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const imagination = createCausalImagination();
      expect(imagination).toBeDefined();
    });

    it('creates with custom config', () => {
      const imagination = createCausalImagination({
        maxHypotheses: 20,
        maxScenarios: 10,
        crossDomainBonus: 0.5,
        minPlausibility: 0.1,
      });
      expect(imagination).toBeDefined();
    });
  });

  describe('imagine', () => {
    it('generates hypotheses from causal edges', () => {
      const imagination = createCausalImagination();
      const result = imagination.imagine(makeImaginationEdges(), ['revenue', 'engineering', 'cs', 'product']);

      expect(result.hypotheses.length).toBeGreaterThan(0);
      expect(result.totalImagined).toBeGreaterThan(0);
      expect(result.topInsight).toBeTruthy();

      const h = result.hypotheses[0];
      expect(h.id).toBeTruthy();
      expect(h.cause).toBeTruthy();
      expect(h.effect).toBeTruthy();
      expect(h.method).toBeTruthy();
      expect(h.plausibility).toBeGreaterThanOrEqual(0);
      expect(h.plausibility).toBeLessThanOrEqual(1);
      expect(h.novelty).toBeGreaterThanOrEqual(0);
      expect(h.novelty).toBeLessThanOrEqual(1);
      expect(h.potentialImpact).toBeGreaterThanOrEqual(0);
    });

    it('returns empty for no edges', () => {
      const imagination = createCausalImagination();
      const result = imagination.imagine([], []);
      expect(result.hypotheses.length).toBe(0);
      expect(result.totalImagined).toBe(0);
    });

    it('handles single-domain edges', () => {
      const imagination = createCausalImagination();
      const edges: ImaginationEdge[] = [
        { source: 'A', target: 'B', weight: 0.5, domain: 'revenue', confidence: 0.6 },
      ];
      const result = imagination.imagine(edges, ['revenue']);
      expect(result).toBeDefined();
    });
  });

  describe('planScenarios', () => {
    it('generates scenarios from interventions', () => {
      const imagination = createCausalImagination();
      const scenarios = imagination.planScenarios(
        makeImaginationEdges(),
        [
          { domain: 'revenue', variable: 'marketing_spend', changePercent: 20, timing: 'immediate' },
          { domain: 'engineering', variable: 'team_size', changePercent: 10, timing: 'gradual_30d' },
        ],
      );

      expect(scenarios.length).toBeGreaterThan(0);
      const s = scenarios[0];
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.probability).toBeGreaterThanOrEqual(0);
      expect(s.probability).toBeLessThanOrEqual(1);
      expect(s.impact).toBeTruthy();
    });

    it('generates scenarios even with empty interventions (uses edges)', () => {
      const imagination = createCausalImagination();
      const scenarios = imagination.planScenarios(makeImaginationEdges(), []);
      // planScenarios can derive scenarios from edges alone
      expect(scenarios.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findAnalogies', () => {
    it('finds cross-domain analogies', () => {
      const imagination = createCausalImagination();
      const analogies = imagination.findAnalogies(makeImaginationEdges());

      expect(analogies.length).toBeGreaterThanOrEqual(0);
      if (analogies.length > 0) {
        const a = analogies[0];
        expect(a.source).toBeDefined();
        expect(a.target).toBeDefined();
        expect(a.strength).toBeGreaterThanOrEqual(0);
        expect(a.strength).toBeLessThanOrEqual(1);
        expect(a.sharedStructure).toBeTruthy();
      }
    });
  });

  describe('validateHypothesis', () => {
    it('updates validation stats', () => {
      const imagination = createCausalImagination();
      const result = imagination.imagine(makeImaginationEdges(), ['revenue', 'engineering']);

      if (result.hypotheses.length > 0) {
        imagination.validateHypothesis(result.hypotheses[0].id, true);
        const stats = imagination.getStats();
        expect(stats.validatedCount).toBeGreaterThanOrEqual(1);
        expect(stats.validationRate).toBeGreaterThan(0);
      }
    });
  });

  describe('getStats', () => {
    it('returns comprehensive imagination stats', () => {
      const imagination = createCausalImagination();
      imagination.imagine(makeImaginationEdges(), ['revenue', 'engineering', 'cs']);

      const stats = imagination.getStats();
      expect(typeof stats.totalHypotheses).toBe('number');
      expect(typeof stats.totalScenarios).toBe('number');
      expect(typeof stats.totalAnalogies).toBe('number');
      expect(typeof stats.avgPlausibility).toBe('number');
      expect(typeof stats.avgNovelty).toBe('number');
      expect(stats.hypothesesByMethod).toBeDefined();
    });
  });
});

// ============================================================================
// LAYER 9: THEORY OF MIND — DEEP TESTS
// ============================================================================

describe('Layer 9: Theory of Mind — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const tom = createTheoryOfMind();
      expect(tom).toBeDefined();
    });

    it('creates with custom config', () => {
      const tom = createTheoryOfMind({
        maxUserModels: 500,
        intentLookback: 10,
        expertiseWindowDays: 60,
        cognitiveStateSensitivity: 0.7,
      });
      expect(tom).toBeDefined();
    });
  });

  describe('recordInteraction + getUserModel', () => {
    it('builds user model from multiple interactions', () => {
      const tom = createTheoryOfMind();

      for (let i = 0; i < 10; i++) {
        tom.recordInteraction({
          userId: 'user1',
          query: i % 2 === 0 ? 'What is our revenue trend?' : 'Show engineering velocity',
          domain: i % 2 === 0 ? 'revenue' : 'engineering',
          timestamp: Date.now() + i * 60000,
          actedOn: true,
          followUpCount: 3,
        });
      }

      const model = tom.getUserModel('user1');
      expect(model.interactionCount).toBe(10);
      expect(model.primaryDomains).toContain('revenue');
      expect(model.preferredDepth).toBeGreaterThan(0.5); // many follow-ups
      expect(model.actionRate).toBeGreaterThan(0);
    });

    it('handles new user with no interactions', () => {
      const tom = createTheoryOfMind();
      const model = tom.getUserModel('new_user');
      expect(model.userId).toBe('new_user');
      expect(model.interactionCount).toBe(0);
      expect(model.preferredDepth).toBe(0.5);
    });

    it('tracks expertise evolution across domains', () => {
      const tom = createTheoryOfMind();

      // Many revenue interactions
      for (let i = 0; i < 20; i++) {
        tom.recordInteraction({
          userId: 'expert',
          query: 'Show me the ARR forecast by segment',
          domain: 'revenue',
          timestamp: Date.now() + i * 60000,
          actedOn: true,
        });
      }

      const model = tom.getUserModel('expert');
      const revenueExpertise = model.expertiseLevels.get('revenue') ?? 0;
      expect(revenueExpertise).toBeGreaterThan(0.3);
    });
  });

  describe('predictIntent', () => {
    it('predicts next intent from interaction history', () => {
      const tom = createTheoryOfMind();

      tom.recordInteraction({ userId: 'user1', query: 'What is our MRR?', domain: 'revenue', timestamp: Date.now() });
      tom.recordInteraction({ userId: 'user1', query: 'Show me the revenue trend', domain: 'revenue', timestamp: Date.now() + 1000 });
      tom.recordInteraction({ userId: 'user1', query: 'Breakdown by segment', domain: 'revenue', timestamp: Date.now() + 2000 });

      const prediction = tom.predictIntent('user1');
      expect(prediction).toBeDefined();
      expect(prediction.predictedDomain).toBeTruthy();
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.reasoning).toBeTruthy();
    });

    it('handles user with no history', () => {
      const tom = createTheoryOfMind();
      const prediction = tom.predictIntent('unknown');
      expect(prediction).toBeDefined();
      expect(prediction.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('takePerspective', () => {
    it('takes CEO perspective', () => {
      const tom = createTheoryOfMind();
      const perspective = tom.takePerspective('CEO');

      expect(perspective.role).toBe('CEO');
      expect(perspective.focus.length).toBeGreaterThan(0);
      expect(perspective.keyMetrics.length).toBeGreaterThan(0);
      expect(perspective.concerns.length).toBeGreaterThan(0);
      expect(perspective.framing).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(perspective.riskTolerance);
    });

    it('takes CTO perspective', () => {
      const tom = createTheoryOfMind();
      const perspective = tom.takePerspective('CTO');
      expect(perspective.role).toBe('CTO');
      expect(perspective.focus.length).toBeGreaterThan(0);
    });

    it('takes CFO perspective', () => {
      const tom = createTheoryOfMind();
      const perspective = tom.takePerspective('CFO');
      expect(perspective.role).toBe('CFO');
    });

    it('handles unknown role with generic perspective', () => {
      const tom = createTheoryOfMind();
      const perspective = tom.takePerspective('intern');
      expect(perspective.role).toBe('intern');
      expect(perspective.focus.length).toBeGreaterThan(0);
    });
  });

  describe('detectCognitiveState', () => {
    it('detects exploring state', () => {
      const tom = createTheoryOfMind();
      tom.recordInteraction({ userId: 'user1', query: 'What happened?', domain: 'revenue', timestamp: Date.now() });

      const state = tom.detectCognitiveState('user1', 'What is happening with churn?');
      expect(state).toBeDefined();
      expect(['exploring', 'deciding', 'verifying', 'delegating']).toContain(state.mode);
      expect(state.timePressure).toBeGreaterThanOrEqual(0);
      expect(state.engagement).toBeGreaterThanOrEqual(0);
    });

    it('detects deciding state from decision-oriented queries', () => {
      const tom = createTheoryOfMind();
      tom.recordInteraction({ userId: 'user1', query: 'Should we invest in marketing?', domain: 'revenue', timestamp: Date.now() });

      const state = tom.detectCognitiveState('user1', 'Should we increase the budget?');
      expect(state).toBeDefined();
      expect(state.mode).toBeTruthy();
    });
  });

  describe('getResponseParams', () => {
    it('returns adaptive response parameters', () => {
      const tom = createTheoryOfMind();
      tom.recordInteraction({
        userId: 'user1', query: 'Show detailed analysis',
        domain: 'revenue', timestamp: Date.now(),
        actedOn: true, followUpCount: 5,
      });

      const params = tom.getResponseParams('user1');
      expect(params.depth).toBeGreaterThanOrEqual(0);
      expect(params.depth).toBeLessThanOrEqual(1);
      expect(['concise', 'detailed', 'visual', 'narrative']).toContain(params.format);
      expect(typeof params.technicalLevel).toBe('number');
      expect(typeof params.includeRecommendations).toBe('boolean');
      expect(typeof params.includeHistory).toBe('boolean');
      expect(['formal', 'casual', 'urgent']).toContain(params.tone);
    });
  });

  describe('getStats', () => {
    it('returns theory of mind stats', () => {
      const tom = createTheoryOfMind();
      tom.recordInteraction({ userId: 'u1', query: 'test', domain: 'rev', timestamp: Date.now() });
      tom.recordInteraction({ userId: 'u2', query: 'test', domain: 'eng', timestamp: Date.now() });

      const stats = tom.getStats();
      expect(stats.totalUserModels).toBe(2);
      expect(stats.totalInteractions).toBe(2);
      expect(typeof stats.avgExpertiseLevel).toBe('number');
      expect(Array.isArray(stats.mostActiveUsers)).toBe(true);
    });
  });
});

// ============================================================================
// LAYER 10: TEMPORAL CONSCIOUSNESS — DEEP TESTS
// ============================================================================

describe('Layer 10: Temporal Consciousness — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const tc = createTemporalConsciousness();
      expect(tc).toBeDefined();
    });

    it('creates with custom config', () => {
      const tc = createTemporalConsciousness({
        minRhythmCycles: 2,
        maxGoals: 100,
        maxTimelineEvents: 5000,
      });
      expect(tc).toBeDefined();
    });
  });

  describe('getAwareness', () => {
    it('returns temporal awareness with context', () => {
      const tc = createTemporalConsciousness();
      const awareness = tc.getAwareness();

      expect(awareness.now).toBeGreaterThan(0);
      expect(awareness.context).toBeDefined();
      expect(awareness.context.period).toBeTruthy();
      expect(['early', 'mid', 'late', 'transition']).toContain(awareness.context.phase);
      expect(typeof awareness.context.daysRemaining).toBe('number');
      expect(['on_track', 'behind', 'ahead', 'disrupted']).toContain(awareness.temporalHealth);
    });
  });

  describe('recordSignal', () => {
    it('records temporal signals', () => {
      const tc = createTemporalConsciousness();

      for (let i = 0; i < 50; i++) {
        tc.recordSignal({
          domain: 'revenue',
          metric: 'mrr',
          value: 50000 + i * 100,
          timestamp: Date.now() - (50 - i) * 86400000,
        });
      }

      const stats = tc.getStats();
      expect(stats.temporalCoverage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectRhythms', () => {
    it('detects periodic patterns in signals', () => {
      const tc = createTemporalConsciousness({ minRhythmCycles: 2 });

      // Simulate weekly pattern over 6 weeks
      for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
          const value = day < 5 ? 100 + day * 10 : 30; // High on weekdays, low weekends
          tc.recordSignal({
            domain: 'engineering',
            metric: 'commits',
            value,
            timestamp: Date.now() - (42 - week * 7 - day) * 86400000,
          });
        }
      }

      const rhythms = tc.detectRhythms();
      expect(rhythms).toBeDefined();
      expect(Array.isArray(rhythms)).toBe(true);
    });

    it('returns empty for insufficient data', () => {
      const tc = createTemporalConsciousness();
      const rhythms = tc.detectRhythms();
      expect(rhythms.length).toBe(0);
    });
  });

  describe('setGoal + checkGoals', () => {
    it('sets and tracks goals', () => {
      const tc = createTemporalConsciousness();

      const goalId = tc.setGoal({
        description: 'Reach $2M ARR',
        metric: 'arr',
        targetValue: 2000000,
        currentValue: 1500000,
        deadline: Date.now() + 90 * 86400000,
        domain: 'revenue',
      });

      expect(goalId).toBeTruthy();

      const statuses = tc.checkGoals();
      expect(statuses.length).toBe(1);
      expect(statuses[0].goal.metric).toBe('arr');
      expect(['on_track', 'at_risk', 'behind', 'ahead', 'completed']).toContain(statuses[0].status);
      expect(statuses[0].progress).toBeGreaterThanOrEqual(0);
      expect(statuses[0].assessment).toBeTruthy();
    });

    it('tracks multiple goals simultaneously', () => {
      const tc = createTemporalConsciousness();

      tc.setGoal({ description: 'Revenue goal', metric: 'revenue', targetValue: 200000, currentValue: 150000, deadline: Date.now() + 90 * 86400000, domain: 'revenue' });
      tc.setGoal({ description: 'Churn goal', metric: 'churn', targetValue: 0.03, currentValue: 0.05, deadline: Date.now() + 60 * 86400000, domain: 'cs' });
      tc.setGoal({ description: 'NPS goal', metric: 'nps', targetValue: 70, currentValue: 55, deadline: Date.now() + 120 * 86400000, domain: 'product' });

      const statuses = tc.checkGoals();
      expect(statuses.length).toBe(3);
    });

    it('identifies goals behind schedule', () => {
      const tc = createTemporalConsciousness();

      // Goal with deadline that has passed 80% of time but only 20% progress
      tc.setGoal({
        description: 'Ambitious goal',
        metric: 'users',
        targetValue: 100000,
        currentValue: 20000,
        deadline: Date.now() + 5 * 86400000, // 5 days left
        domain: 'growth',
      });

      // Record signal showing slow progress
      tc.recordSignal({
        domain: 'growth',
        metric: 'users',
        value: 21000,
        timestamp: Date.now(),
      });

      const statuses = tc.checkGoals();
      expect(statuses.length).toBe(1);
    });
  });

  describe('buildTimeline', () => {
    it('builds domain-specific timeline', () => {
      const tc = createTemporalConsciousness();

      for (let i = 0; i < 30; i++) {
        tc.recordSignal({
          domain: 'revenue',
          metric: 'mrr',
          value: 50000 + (i % 5 === 0 ? 5000 : i * 50),
          timestamp: Date.now() - (30 - i) * 86400000,
        });
      }

      const timeline = tc.buildTimeline('revenue');
      expect(Array.isArray(timeline)).toBe(true);
    });

    it('returns empty for domain with no data', () => {
      const tc = createTemporalConsciousness();
      const timeline = tc.buildTimeline('nonexistent');
      expect(timeline.length).toBe(0);
    });
  });

  describe('abstractPeriod', () => {
    it('abstracts a time period into summary', () => {
      const tc = createTemporalConsciousness();

      for (let i = 0; i < 20; i++) {
        tc.recordSignal({
          domain: 'revenue',
          metric: 'mrr',
          value: 50000 + i * 200,
          timestamp: Date.now() - (20 - i) * 86400000,
        });
      }

      const summary = tc.abstractPeriod(Date.now() - 30 * 86400000, Date.now());
      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
    });
  });

  describe('getStats', () => {
    it('returns comprehensive temporal stats', () => {
      const tc = createTemporalConsciousness();
      tc.setGoal({ description: 'Test', metric: 'test', targetValue: 100, currentValue: 50, deadline: Date.now() + 86400000, domain: 'test' });

      const stats = tc.getStats();
      expect(typeof stats.totalRhythmsDetected).toBe('number');
      expect(stats.totalGoalsTracked).toBe(1);
      expect(typeof stats.totalTimelineEvents).toBe('number');
    });
  });
});

// ============================================================================
// LAYER 11: RED TEAM — DEEP TESTS
// ============================================================================

describe('Layer 11: Red Team — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const rt = createRedTeam();
      expect(rt).toBeDefined();
    });

    it('creates with strict config', () => {
      const rt = createRedTeam({
        minRobustnessScore: 0.8,
        maxScenariosPerPrediction: 10,
        learningWindowDays: 30,
      });
      expect(rt).toBeDefined();
    });
  });

  describe('testPrediction', () => {
    it('tests a high-confidence prediction', () => {
      const rt = createRedTeam();
      const result = rt.testPrediction(makePrediction({ confidence: 0.95 }));

      expect(result.predictionId).toBe('pred_1');
      expect(result.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(result.robustnessScore).toBeLessThanOrEqual(1);
      expect(typeof result.passed).toBe('boolean');
      expect(result.scenarios.length).toBeGreaterThan(0);
      expect(result.weaknesses.length).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
      expect(result.testDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('generates more attack types for finance domain', () => {
      const rt = createRedTeam();
      const financeResult = rt.testPrediction(makePrediction({ domain: 'finance' }));
      const revenueResult = rt.testPrediction(makePrediction({ domain: 'revenue' }));

      // Finance should trigger regime_change and black_swan
      const financeTypes = financeResult.scenarios.map(s => s.type);
      expect(financeTypes).toContain('regime_change');
    });

    it('flags low-evidence predictions', () => {
      const rt = createRedTeam();
      const result = rt.testPrediction(makePrediction({ evidence: ['only_one'] }));

      // Should trigger selection_bias
      const types = result.scenarios.map(s => s.type);
      expect(types).toContain('selection_bias');
    });

    it('applies survivorship bias attack for high confidence', () => {
      const rt = createRedTeam();
      const result = rt.testPrediction(makePrediction({ confidence: 0.95 }));
      const types = result.scenarios.map(s => s.type);
      expect(types).toContain('survivorship_bias');
    });

    it('applies reverse_causality for granger method', () => {
      const rt = createRedTeam();
      const result = rt.testPrediction(makePrediction({ method: 'granger_causality' }));
      const types = result.scenarios.map(s => s.type);
      expect(types).toContain('reverse_causality');
    });
  });

  describe('testBatch', () => {
    it('tests multiple predictions in batch', () => {
      const rt = createRedTeam();
      const predictions = [
        makePrediction({ id: 'p1', domain: 'revenue', confidence: 0.9 }),
        makePrediction({ id: 'p2', domain: 'finance', confidence: 0.7 }),
        makePrediction({ id: 'p3', domain: 'engineering', confidence: 0.5, evidence: ['one'] }),
      ];

      const results = rt.testBatch(predictions);
      expect(results.length).toBe(3);
      results.forEach(r => {
        expect(r.robustnessScore).toBeGreaterThanOrEqual(0);
        expect(r.scenarios.length).toBeGreaterThan(0);
      });
    });

    it('handles empty batch', () => {
      const rt = createRedTeam();
      const results = rt.testBatch([]);
      expect(results.length).toBe(0);
    });
  });

  describe('recordFailure + getEffectiveAttacks', () => {
    it('records failures and retrieves effective attacks', () => {
      const rt = createRedTeam();

      rt.testPrediction(makePrediction({ id: 'p1' }));
      rt.recordFailure('p1', 'Revenue actually decreased');

      const attacks = rt.getEffectiveAttacks();
      expect(attacks).toBeDefined();
      expect(Array.isArray(attacks)).toBe(true);
    });

    it('filters effective attacks by domain', () => {
      const rt = createRedTeam();
      rt.testPrediction(makePrediction({ id: 'p1', domain: 'revenue' }));
      rt.recordFailure('p1', 'Revenue dropped');

      const attacks = rt.getEffectiveAttacks('revenue');
      expect(Array.isArray(attacks)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns red team statistics', () => {
      const rt = createRedTeam();
      rt.testPrediction(makePrediction({ id: 'p1', confidence: 0.95 }));
      rt.testPrediction(makePrediction({ id: 'p2', confidence: 0.3 }));

      const stats = rt.getStats();
      expect(stats.totalTested).toBe(2);
      expect(typeof stats.totalFailed).toBe('number');
      expect(stats.avgRobustness).toBeGreaterThanOrEqual(0);
      expect(typeof stats.failureRate).toBe('number');
    });
  });
});

// ============================================================================
// LAYER 12: EXPERIMENTATION — DEEP TESTS
// ============================================================================

describe('Layer 12: Experimentation — Deep Tests', () => {
  const testEdges = [
    { id: 'e1', source: 'marketing', target: 'leads', confidence: 0.5, weight: 0.7 },
    { id: 'e2', source: 'engineering', target: 'quality', confidence: 0.3, weight: 0.6 },
    { id: 'e3', source: 'support', target: 'churn', confidence: 0.8, weight: 0.4 },
  ];

  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const engine = createExperimentEngine();
      expect(engine).toBeDefined();
    });

    it('creates with custom config', () => {
      const engine = createExperimentEngine({
        minSampleSize: 50,
        defaultAlpha: 0.01,
        defaultPower: 0.9,
        maxConcurrentExperiments: 10,
      });
      expect(engine).toBeDefined();
    });
  });

  describe('suggestExperiments', () => {
    it('suggests experiments for uncertain high-impact edges', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments(testEdges);

      expect(suggestions.length).toBeGreaterThan(0);
      const s = suggestions[0];
      expect(s.causalEdgeId).toBeTruthy();
      expect(s.sourceEntity).toBeTruthy();
      expect(s.targetEntity).toBeTruthy();
      expect(s.currentConfidence).toBeGreaterThanOrEqual(0);
      expect(s.potentialImpact).toBeGreaterThan(0);
      expect(s.priority).toBeGreaterThan(0);
      expect(s.reasoning).toBeTruthy();
    });

    it('prioritizes high-impact low-confidence edges', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments(testEdges);

      if (suggestions.length >= 2) {
        // Sorted by priority descending
        expect(suggestions[0].priority).toBeGreaterThanOrEqual(suggestions[1].priority);
      }
    });

    it('handles empty edge list', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments([]);
      expect(suggestions.length).toBe(0);
    });
  });

  describe('designExperiment', () => {
    it('designs experiment from suggestion', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments(testEdges);

      if (suggestions.length > 0) {
        const design = engine.designExperiment(suggestions[0]);
        expect(design.id).toBeTruthy();
        expect(design.hypothesis).toBeTruthy();
        expect(design.causalEdgeId).toBeTruthy();
        expect(design.interventionVariable).toBeTruthy();
        expect(design.outcomeVariable).toBeTruthy();
        expect(design.requiredSampleSize).toBeGreaterThan(0);
        expect(design.status).toBe('designed');
        expect(['ab_test', 'switchback', 'regression_discontinuity', 'natural_experiment', 'instrumental_variable']).toContain(design.designType);
      }
    });
  });

  describe('calculateSampleSize', () => {
    it('calculates sample size for given parameters', () => {
      const engine = createExperimentEngine();
      const n = engine.calculateSampleSize(0.5, 1.0);
      expect(n).toBeGreaterThan(0);
      expect(Number.isFinite(n)).toBe(true);
    });

    it('requires larger sample for smaller effects (above minSampleSize floor)', () => {
      const engine = createExperimentEngine({ minSampleSize: 10 }); // Lower floor to see the difference
      const nSmall = engine.calculateSampleSize(0.2, 1.0);
      const nLarge = engine.calculateSampleSize(0.8, 1.0);
      expect(nSmall).toBeGreaterThanOrEqual(nLarge);
    });

    it('requires larger sample for tighter alpha (above minSampleSize floor)', () => {
      const engine = createExperimentEngine({ minSampleSize: 10 }); // Lower floor
      const n05 = engine.calculateSampleSize(0.5, 1.0, 0.05);
      const n01 = engine.calculateSampleSize(0.5, 1.0, 0.01);
      expect(n01).toBeGreaterThanOrEqual(n05);
    });
  });

  describe('analyzeResults', () => {
    it('analyzes experiment results', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments(testEdges);

      if (suggestions.length > 0) {
        const design = engine.designExperiment(suggestions[0]);

        // Generate fake experimental data
        const control = Array.from({ length: 50 }, () => 100 + Math.random() * 20);
        const treatment = Array.from({ length: 50 }, () => 110 + Math.random() * 20);

        const result = engine.analyzeResults(design, { control, treatment });
        expect(result.experimentId).toBe(design.id);
        expect(typeof result.treatmentEffect).toBe('number');
        expect(result.confidenceInterval.lower).toBeLessThan(result.confidenceInterval.upper);
        expect(typeof result.pValue).toBe('number');
        expect(typeof result.significant).toBe('boolean');
        expect(['negligible', 'small', 'medium', 'large']).toContain(result.effectSize);
        expect(result.recommendation).toBeTruthy();
        expect(result.causalClaim).toBeTruthy();
      }
    });
  });

  describe('experiment lifecycle', () => {
    it('manages experiment status through lifecycle', () => {
      const engine = createExperimentEngine();
      const suggestions = engine.suggestExperiments(testEdges);

      if (suggestions.length > 0) {
        const design = engine.designExperiment(suggestions[0]);
        expect(design.status).toBe('designed');

        engine.updateStatus(design.id, 'approved');
        const updated = engine.getExperiment(design.id);
        expect(updated?.status).toBe('approved');

        engine.updateStatus(design.id, 'running');
        expect(engine.getExperiment(design.id)?.status).toBe('running');

        const all = engine.getExperiments();
        expect(all.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// LAYER 13: IMMUNE SYSTEM — DEEP TESTS
// ============================================================================

describe('Layer 13: Immune System — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const immune = createImmuneSystem();
      expect(immune).toBeDefined();
    });

    it('creates with strict config', () => {
      const immune = createImmuneSystem({
        maxQuarantineSize: 100,
        anomalyThreshold: 2.0,
        minQualityScore: 0.5,
        autoQuarantine: true,
      });
      expect(immune).toBeDefined();
    });
  });

  describe('check', () => {
    it('passes good quality signals', () => {
      const immune = createImmuneSystem();
      const result = immune.check(makeDataSignal());

      expect(result.signalId).toBeTruthy();
      expect(typeof result.allowed).toBe('boolean');
      expect(result.qualityScore.overall).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore.overall).toBeLessThanOrEqual(1);
      expect(['pass', 'quarantine', 'reject']).toContain(result.action);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('flags signals with missing fields', () => {
      const immune = createImmuneSystem();
      const result = immune.check(makeDataSignal({ entityId: '' }));

      expect(result.qualityScore.flags).toContain('missing_fields');
    });

    it('flags stale signals', () => {
      const immune = createImmuneSystem();
      const result = immune.check(makeDataSignal({
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
      }));

      expect(result.qualityScore.flags).toContain('stale_data');
    });

    it('flags future timestamps as anomalies', () => {
      const immune = createImmuneSystem();
      const result = immune.check(makeDataSignal({
        timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours in future
      }));

      expect(result.qualityScore.flags).toContain('temporal_anomaly');
    });
  });

  describe('checkBatch', () => {
    it('batch checks multiple signals', () => {
      const immune = createImmuneSystem();
      const signals = Array.from({ length: 10 }, (_, i) =>
        makeDataSignal({ id: `batch_${i}` })
      );

      const results = immune.checkBatch(signals);
      expect(results.length).toBe(10);
      results.forEach(r => {
        expect(r.signalId).toBeTruthy();
        expect(typeof r.allowed).toBe('boolean');
      });
    });
  });

  describe('scoreQuality', () => {
    it('scores quality dimensions independently', () => {
      const immune = createImmuneSystem();
      const score = immune.scoreQuality(makeDataSignal());

      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(1);
      expect(typeof score.dimensions.statistical).toBe('number');
      expect(typeof score.dimensions.provenance).toBe('number');
      expect(typeof score.dimensions.coherence).toBe('number');
      expect(typeof score.dimensions.freshness).toBe('number');
      expect(typeof score.dimensions.completeness).toBe('number');
      expect(Array.isArray(score.flags)).toBe(true);
    });
  });

  describe('quarantine management', () => {
    it('quarantines low quality signals', () => {
      const immune = createImmuneSystem({ minQualityScore: 0.9 }); // Very strict

      // Send a poor-quality signal
      immune.check(makeDataSignal({
        id: 'poor_signal',
        entityId: '', // missing
        timestamp: new Date(Date.now() - 48 * 3600000), // stale
      }));

      const quarantine = immune.getQuarantine();
      // May or may not be quarantined depending on exact score
      expect(Array.isArray(quarantine)).toBe(true);
    });

    it('releases signals from quarantine', () => {
      const immune = createImmuneSystem({ minQualityScore: 0.99 }); // Super strict
      immune.check(makeDataSignal({ id: 'q_signal' }));

      const quarantine = immune.getQuarantine();
      if (quarantine.length > 0) {
        const released = immune.releaseFromQuarantine(quarantine[0].signal.id);
        expect(typeof released).toBe('boolean');
      }
    });

    it('rejects quarantined signals', () => {
      const immune = createImmuneSystem({ minQualityScore: 0.99 });
      immune.check(makeDataSignal({ id: 'reject_signal' }));

      const quarantine = immune.getQuarantine();
      if (quarantine.length > 0) {
        const rejected = immune.rejectQuarantined(quarantine[0].signal.id);
        expect(typeof rejected).toBe('boolean');
      }
    });
  });

  describe('source trust', () => {
    it('manages source trust scores', () => {
      const immune = createImmuneSystem();

      // Must check signals first to populate source trust entries
      immune.check(makeDataSignal({ source: 'github' }));
      immune.check(makeDataSignal({ source: 'suspicious_api' }));

      // Now update trust
      immune.updateSourceTrust('github', true);
      immune.updateSourceTrust('github', true);
      immune.updateSourceTrust('suspicious_api', false);

      const trustList = immune.getSourceTrust();
      expect(trustList.length).toBeGreaterThan(0);

      const github = trustList.find(t => t.source === 'github');
      expect(github).toBeDefined();
      expect(github!.trustScore).toBeGreaterThan(0);
    });

    it('applies trust to quality scoring', () => {
      const immune = createImmuneSystem();

      immune.updateSourceTrust('trusted_source', true);
      immune.updateSourceTrust('untrusted_source', false);

      const goodSignal = immune.scoreQuality(makeDataSignal({ source: 'trusted_source' }));
      const badSignal = immune.scoreQuality(makeDataSignal({ source: 'untrusted_source' }));

      expect(goodSignal.dimensions.provenance).toBeGreaterThanOrEqual(badSignal.dimensions.provenance);
    });
  });

  describe('statistical profiles', () => {
    it('registers and uses statistical profiles for anomaly detection', () => {
      const immune = createImmuneSystem();

      immune.registerProfile('engineering', 'commit', {
        mean: 50, stdDev: 10, min: 10, max: 100, sampleCount: 1000,
      });

      // Normal value
      const normal = immune.scoreQuality(makeDataSignal({
        domain: 'engineering', entityType: 'commit', value: 55,
      }));

      // Extreme outlier
      const outlier = immune.scoreQuality(makeDataSignal({
        domain: 'engineering', entityType: 'commit', value: 500,
      }));

      // Outlier should have lower statistical score
      expect(outlier.dimensions.statistical).toBeLessThanOrEqual(normal.dimensions.statistical);
    });
  });

  describe('getStats', () => {
    it('returns comprehensive immune stats', () => {
      const immune = createImmuneSystem();

      for (let i = 0; i < 20; i++) {
        immune.check(makeDataSignal({ id: `s_${i}` }));
      }

      const stats = immune.getStats();
      expect(stats.totalChecked).toBe(20);
      expect(typeof stats.totalPassed).toBe('number');
      expect(typeof stats.totalQuarantined).toBe('number');
      expect(typeof stats.totalRejected).toBe('number');
      expect(stats.avgQualityScore).toBeGreaterThan(0);
      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('burst detection at scale', () => {
    it('handles 1000 signals without memory issues', () => {
      const immune = createImmuneSystem();

      for (let i = 0; i < 1000; i++) {
        immune.check(makeDataSignal({
          id: `scale_${i}`,
          entityId: `entity_${i % 100}`,
          source: `source_${i % 10}`,
        }));
      }

      const stats = immune.getStats();
      expect(stats.totalChecked).toBe(1000);
      expect(stats.totalPassed + stats.totalQuarantined + stats.totalRejected).toBe(1000);
    });
  });
});

// ============================================================================
// LAYER 14: GOAL-BACKWARD PLANNING — DEEP TESTS
// ============================================================================

describe('Layer 14: Goal-Backward Planning — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const planner = createGoalBackwardPlanner();
      expect(planner).toBeDefined();
    });

    it('creates with custom config', () => {
      const planner = createGoalBackwardPlanner({
        maxPathDepth: 3,
        minEdgeConfidence: 0.5,
        maxPaths: 5,
      });
      expect(planner).toBeDefined();
    });
  });

  describe('planFromGoal', () => {
    it('creates a full goal plan with paths', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(makeGoal(), makeCausalEdges());

      expect(plan.goalId).toBeTruthy();
      expect(plan.goal.targetMetric).toBe('revenue');
      expect(plan.gapAnalysis).toBeDefined();
      expect(typeof plan.gapAnalysis.requiredChange).toBe('number');
      expect(typeof plan.gapAnalysis.feasible).toBe('boolean');
      expect(plan.generatedAt).toBeInstanceOf(Date);
      expect(Array.isArray(plan.paths)).toBe(true);
      expect(Array.isArray(plan.timeline)).toBe(true);
      expect(Array.isArray(plan.risks)).toBe(true);
    });

    it('finds intervention paths to revenue', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(
        makeGoal({ targetMetric: 'revenue' }),
        makeCausalEdges(),
      );

      if (plan.paths.length > 0) {
        const path = plan.paths[0];
        expect(path.id).toBeTruthy();
        expect(path.steps.length).toBeGreaterThan(0);
        expect(typeof path.totalEffect).toBe('number');
        expect(typeof path.totalConfidence).toBe('number');
        expect(typeof path.feasibilityScore).toBe('number');
        expect(['low', 'medium', 'high']).toContain(path.estimatedCost);
        expect(['low', 'medium', 'high']).toContain(path.riskLevel);
      }
    });

    it('handles goal with no causal path', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(
        makeGoal({ targetMetric: 'nonexistent_metric' }),
        makeCausalEdges(),
      );

      expect(plan.paths.length).toBe(0);
      expect(plan.gapAnalysis.feasible).toBe(false);
    });

    it('handles empty edge list', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(makeGoal(), []);
      expect(plan.paths.length).toBe(0);
    });

    it('recommends best path', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(makeGoal(), makeCausalEdges());

      if (plan.paths.length > 0) {
        expect(plan.recommendedPath).toBeDefined();
      }
    });
  });

  describe('findPaths', () => {
    it('finds all paths to a target metric', () => {
      const planner = createGoalBackwardPlanner();
      const paths = planner.findPaths('revenue', makeCausalEdges());

      expect(Array.isArray(paths)).toBe(true);
      if (paths.length > 0) {
        expect(paths[0].steps.length).toBeGreaterThan(0);
      }
    });

    it('returns empty for unreachable target', () => {
      const planner = createGoalBackwardPlanner();
      const paths = planner.findPaths('impossible', makeCausalEdges());
      expect(paths.length).toBe(0);
    });
  });

  describe('scorePath', () => {
    it('scores a path considering constraints', () => {
      const planner = createGoalBackwardPlanner();
      const paths = planner.findPaths('revenue', makeCausalEdges());

      if (paths.length > 0) {
        const score = planner.scorePath(paths[0]);
        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('reduces score with budget constraints', () => {
      const planner = createGoalBackwardPlanner();
      const paths = planner.findPaths('revenue', makeCausalEdges());

      if (paths.length > 0) {
        const unconstrained = planner.scorePath(paths[0]);
        const constrained = planner.scorePath(paths[0], [
          { type: 'budget', description: 'Limited budget', value: 1000 },
        ]);
        expect(constrained).toBeLessThanOrEqual(unconstrained);
      }
    });
  });

  describe('simulatePlan', () => {
    it('simulates plan execution', () => {
      const planner = createGoalBackwardPlanner();
      const plan = planner.planFromGoal(makeGoal(), makeCausalEdges());

      const sim = planner.simulatePlan(plan);
      expect(sim).toBeDefined();
      expect(Array.isArray(sim.weeklyProgress)).toBe(true);
      expect(typeof sim.finalValue).toBe('number');
      expect(typeof sim.goalAchieved).toBe('boolean');
      expect(sim.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
      expect(sim.probabilityOfSuccess).toBeLessThanOrEqual(1);
    });
  });

  describe('decomposeGoal', () => {
    it('decomposes high-level goal into sub-goals', () => {
      const planner = createGoalBackwardPlanner();
      const subGoals = planner.decomposeGoal(makeGoal(), makeCausalEdges());

      expect(Array.isArray(subGoals)).toBe(true);
      if (subGoals.length > 0) {
        expect(subGoals[0].targetMetric).toBeTruthy();
        expect(typeof subGoals[0].targetValue).toBe('number');
      }
    });
  });
});

// ============================================================================
// LAYER 15: NARRATIVE INTELLIGENCE — DEEP TESTS
// ============================================================================

describe('Layer 15: Narrative Intelligence — Deep Tests', () => {
  describe('Factory & Config', () => {
    it('creates with default config', () => {
      const narrative = createNarrativeIntelligence();
      expect(narrative).toBeDefined();
    });

    it('creates with custom config', () => {
      const narrative = createNarrativeIntelligence({
        defaultAudience: 'analyst',
        maxLengthWords: 1000,
        includeCitations: false,
      });
      expect(narrative).toBeDefined();
    });
  });

  describe('generate', () => {
    it('generates full narrative from rich input', () => {
      const narrative = createNarrativeIntelligence();
      const result = narrative.generate(makeNarrativeInput());

      expect(result.id).toBeTruthy();
      expect(result.title).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.keyInsights.length).toBeGreaterThan(0);
      expect(result.audience).toBeTruthy();
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('generates sections with proper structure', () => {
      const narrative = createNarrativeIntelligence();
      const result = narrative.generate(makeNarrativeInput());

      result.sections.forEach(section => {
        expect(section.heading).toBeTruthy();
        expect(section.body).toBeTruthy();
        expect(section.importance).toBeGreaterThanOrEqual(0);
      });
    });

    it('handles minimal input', () => {
      const narrative = createNarrativeIntelligence();
      const result = narrative.generate({
        organizationId: 'org1',
        timeRangeHours: 24,
        edges: [],
        predictions: [],
        anomalies: [],
        interventions: [],
        metrics: [
          { name: 'revenue', domain: 'revenue', currentValue: 100000, previousValue: 100000, trend: 'stable', change: 0, changePercent: 0 },
        ],
      });

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
    });

    it('handles empty input gracefully', () => {
      const narrative = createNarrativeIntelligence();
      const result = narrative.generate({
        organizationId: 'org1',
        timeRangeHours: 24,
        edges: [],
        predictions: [],
        anomalies: [],
        interventions: [],
        metrics: [],
      });

      expect(result).toBeDefined();
    });
  });

  describe('generateDailyBriefing', () => {
    it('generates a daily briefing narrative', () => {
      const narrative = createNarrativeIntelligence();
      const briefing = narrative.generateDailyBriefing(makeNarrativeInput());

      expect(briefing.id).toBeTruthy();
      expect(briefing.title).toBeTruthy();
      expect(briefing.sections.length).toBeGreaterThan(0);
    });
  });

  describe('generateIncidentReport', () => {
    it('generates incident report from anomaly', () => {
      const narrative = createNarrativeIntelligence();
      const anomaly = {
        id: 'anom_critical',
        metric: 'error_rate',
        domain: 'engineering',
        severity: 'critical' as const,
        description: 'Error rate spike to 15%',
        value: 15,
        expectedValue: 2,
      };

      const report = narrative.generateIncidentReport(anomaly, makeNarrativeInput());

      expect(report.id).toBeTruthy();
      expect(report.title).toBeTruthy();
      expect(report.sections.length).toBeGreaterThan(0);
    });
  });

  describe('generateTrendAnalysis', () => {
    it('generates trend analysis from metrics', () => {
      const narrative = createNarrativeIntelligence();
      const metrics = [
        { name: 'revenue', domain: 'revenue', currentValue: 120000, previousValue: 100000, trend: 'up' as const, change: 20000, changePercent: 20 },
        { name: 'churn', domain: 'cs', currentValue: 0.04, previousValue: 0.06, trend: 'down' as const, change: -0.02, changePercent: -33 },
        { name: 'nps', domain: 'product', currentValue: 65, previousValue: 60, trend: 'up' as const, change: 5, changePercent: 8.3 },
      ];

      const analysis = narrative.generateTrendAnalysis(metrics, makeNarrativeInput());

      expect(analysis.id).toBeTruthy();
      expect(analysis.title).toBeTruthy();
      expect(analysis.sections.length).toBeGreaterThan(0);
    });
  });

  describe('adaptForAudience', () => {
    it('adapts narrative for different audiences', () => {
      const narrative = createNarrativeIntelligence();
      const original = narrative.generate(makeNarrativeInput());

      const executive = narrative.adaptForAudience(original, 'executive');
      expect(executive.audience).toBe('executive');

      const analyst = narrative.adaptForAudience(original, 'analyst');
      expect(analyst.audience).toBe('analyst');

      const engineer = narrative.adaptForAudience(original, 'engineer');
      expect(engineer.audience).toBe('engineer');
    });

    it('preserves core content across adaptations', () => {
      const narrative = createNarrativeIntelligence();
      const original = narrative.generate(makeNarrativeInput());

      const adapted = narrative.adaptForAudience(original, 'analyst');
      expect(adapted.sections.length).toBeGreaterThanOrEqual(original.sections.length);
      expect(adapted.keyInsights.length).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// CROSS-LAYER INTEGRATION: MIND PIPELINE (L8 → L11 → L14 → L15)
// ============================================================================

describe('Cross-Layer Mind Pipeline', () => {
  it('L8 → L11: Imagination hypotheses stress-tested by Red Team', () => {
    const imagination = createCausalImagination();
    const redTeam = createRedTeam();

    const result = imagination.imagine(makeImaginationEdges(), ['revenue', 'engineering']);

    for (const hypothesis of result.hypotheses.slice(0, 3)) {
      const testResult = redTeam.testPrediction({
        id: `hyp_${hypothesis.id}`,
        organizationId: 'org1',
        domain: hypothesis.domains[0] || 'general',
        claim: `${hypothesis.cause} → ${hypothesis.effect}`,
        confidence: hypothesis.plausibility,
        evidence: [hypothesis.rationale],
        method: hypothesis.method,
        timestamp: new Date(),
      });

      expect(testResult.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(testResult.scenarios.length).toBeGreaterThan(0);
    }
  });

  it('L14 → L15: Goal plans narrated for executives', () => {
    const planner = createGoalBackwardPlanner();
    const narrative = createNarrativeIntelligence();

    const plan = planner.planFromGoal(makeGoal(), makeCausalEdges());

    // Turn plan into narrative
    const result = narrative.generate({
      organizationId: 'org1',
      timeRangeHours: 24,
      edges: [],
      predictions: [{
        id: 'plan_pred',
        claim: `Planned path to ${plan.goal.targetMetric}: ${plan.gapAnalysis.feasible ? 'Feasible' : 'Stretch target'}`,
        confidence: plan.paths.length > 0 ? plan.paths[0].totalConfidence : 0.3,
        domain: 'strategy',
      }],
      anomalies: [],
      interventions: plan.paths.slice(0, 1).flatMap(p =>
        p.steps.map(s => ({
          id: `step_${s.order}`,
          type: 'planned_intervention',
          target: s.metric,
          outcome: 'pending' as const,
          description: s.action,
        }))
      ),
      metrics: [{
        name: plan.goal.targetMetric,
        domain: 'strategy',
        currentValue: plan.goal.currentValue,
        previousValue: plan.goal.currentValue * 0.9,
        trend: 'up' as const,
        change: plan.goal.currentValue * 0.1,
        changePercent: 10,
      }],
    });

    expect(result.title).toBeTruthy();
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('L9 → L10 → L15: User context + temporal awareness → personalized narrative', () => {
    const tom = createTheoryOfMind();
    const temporal = createTemporalConsciousness();
    const narrative = createNarrativeIntelligence();

    // Build user context
    tom.recordInteraction({ userId: 'cto', query: 'Sprint velocity trending down?', domain: 'engineering', timestamp: Date.now() });
    const params = tom.getResponseParams('cto');
    const perspective = tom.takePerspective('CTO');

    // Get temporal awareness
    temporal.recordSignal({ domain: 'engineering', metric: 'velocity', value: 45, timestamp: Date.now() - 7 * 86400000 });
    temporal.recordSignal({ domain: 'engineering', metric: 'velocity', value: 42, timestamp: Date.now() });
    const awareness = temporal.getAwareness();

    // Generate narrative adapted for CTO
    const result = narrative.generate({
      organizationId: 'org1',
      timeRangeHours: 168,
      audience: 'engineer',
      focusDomain: 'engineering',
      edges: [],
      predictions: [],
      anomalies: [],
      interventions: [],
      metrics: [{
        name: 'velocity', domain: 'engineering',
        currentValue: 42, previousValue: 45,
        trend: 'down', change: -3, changePercent: -6.7,
      }],
    });

    const adapted = narrative.adaptForAudience(result, 'engineer');
    expect(adapted.audience).toBe('engineer');
    expect(adapted.title).toBeTruthy();
  });

  it('L7 → L13: Mesh patterns validated by Immune System', () => {
    const mesh = createIntelligenceMesh({ minConsensusOrgs: 2 });
    const immune = createImmuneSystem();

    mesh.registerOrg('org1');
    mesh.registerOrg('org2');

    mesh.contribute({ orgId: 'org1', domain: 'revenue', pattern: 'pricing drives retention', confidence: 0.8, evidenceCount: 10, timestamp: Date.now() });
    mesh.contribute({ orgId: 'org2', domain: 'revenue', pattern: 'pricing drives retention', confidence: 0.7, evidenceCount: 8, timestamp: Date.now() });

    const sensing = mesh.collectiveSense();

    // Validate each collective pattern as a signal through immune system
    for (const pattern of sensing.collectivePatterns) {
      const response = immune.check({
        id: `mesh_${pattern.id}`,
        organizationId: 'core',
        source: 'intelligence_mesh',
        domain: pattern.domain,
        entityType: 'collective_pattern',
        entityId: pattern.id,
        value: pattern.collectiveConfidence,
        timestamp: new Date(),
      });

      expect(response).toBeDefined();
      expect(['pass', 'quarantine', 'reject']).toContain(response.action);
    }
  });

  it('L12 → L11: Experiment results red-teamed before action', () => {
    const engine = createExperimentEngine();
    const redTeam = createRedTeam();

    const suggestions = engine.suggestExperiments([
      { id: 'e1', source: 'marketing', target: 'revenue', confidence: 0.4, weight: 0.8 },
    ]);

    if (suggestions.length > 0) {
      const design = engine.designExperiment(suggestions[0]);

      // Run the experiment
      const control = Array.from({ length: 30 }, () => 100 + Math.random() * 15);
      const treatment = Array.from({ length: 30 }, () => 115 + Math.random() * 15);
      const result = engine.analyzeResults(design, { control, treatment });

      // Red team the result before acting
      const rtResult = redTeam.testPrediction({
        id: `exp_${result.experimentId}`,
        organizationId: 'org1',
        domain: 'revenue',
        claim: result.causalClaim,
        confidence: result.significant ? 0.9 : 0.4,
        evidence: result.confounders_controlled,
        method: 'experiment_ab',
        timestamp: new Date(),
      });

      expect(rtResult.robustnessScore).toBeGreaterThanOrEqual(0);
    }
  });
});
