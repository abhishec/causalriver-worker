import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutonomousLearner } from '../learning/autonomous-learner';

// Mock Supabase client
// Uses per-table routing so cross_domain_signals always returns the test data
// regardless of how many other .from() calls (bandit state, org settings, etc.)
// happen before signals are fetched inside runLearningCycle().
function createMockSupabase(signals: any[] = []) {
  // Track how many times a terminal fetch (range/limit) has been called for
  // cross_domain_signals so pagination works: first call returns signals, rest return [].
  let signalFetchCount = 0;

  const makeChain = (table: string): any => {
    // Terminal resolvers — only these actually "consume" a page of data
    const resolveData = () => {
      if (table === 'cross_domain_signals') {
        signalFetchCount++;
        return Promise.resolve({ data: signalFetchCount === 1 ? signals : [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    const resolveSingle = () => Promise.resolve({ data: null, error: null });

    const chain: any = {
      data: [],
      error: null,
      eq:   vi.fn().mockImplementation(() => makeChain(table)),
      gte:  vi.fn().mockImplementation(() => makeChain(table)),
      lte:  vi.fn().mockImplementation(() => makeChain(table)),
      lt:   vi.fn().mockImplementation(() => makeChain(table)),
      in:   vi.fn().mockImplementation(() => makeChain(table)),
      order: vi.fn().mockImplementation(() => makeChain(table)),
      limit: vi.fn().mockImplementation(resolveData),
      range: vi.fn().mockImplementation(resolveData),
      maybeSingle: vi.fn().mockImplementation(resolveSingle),
      single:      vi.fn().mockImplementation(resolveSingle),
    };
    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockImplementation(() => makeChain(table)),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq:  vi.fn().mockResolvedValue({ error: null }),
        lt:  vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  } as any;
}

// Mock repository
function createMockRepository() {
  return {
    upsertMemory: vi.fn().mockResolvedValue(undefined),
    upsertRelationship: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    insertSignals: vi.fn().mockResolvedValue(undefined),
    getSignalsByDomain: vi.fn().mockResolvedValue([]),
    getSignalsByEntity: vi.fn().mockResolvedValue([]),
    upsertEmbedding: vi.fn().mockResolvedValue(undefined),
    getEmbeddingByEntity: vi.fn().mockResolvedValue(null),
    getMemories: vi.fn().mockResolvedValue([]),
    getSignificantRelationships: vi.fn().mockResolvedValue([]),
    persistCacheState: vi.fn().mockResolvedValue(undefined),
    loadCacheState: vi.fn().mockResolvedValue(null),
    persistTemporalMemories: vi.fn().mockResolvedValue(undefined),
    loadTemporalMemories: vi.fn().mockResolvedValue([]),
    appendConversation: vi.fn().mockResolvedValue(undefined),
    getConversation: vi.fn().mockResolvedValue([]),
    getOrganizationId: vi.fn().mockReturnValue('org_123'),
  } as any;
}

describe('Autonomous Learner', () => {
  describe('createAutonomousLearner', () => {
    it('should create a learner with all methods', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      expect(learner.runLearningCycle).toBeDefined();
      expect(learner.discoveriesToTrainingPack).toBeDefined();
      expect(learner.evaluateCurrentMaturity).toBeDefined();
      expect(learner.getTrainingStats).toBeDefined();
    });
  });

  describe('runLearningCycle', () => {
    it('should return empty result when no signals exist', async () => {
      const supabase = createMockSupabase([]);
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
        evaluateMaturity: false,
      });

      const result = await learner.runLearningCycle();

      expect(result.packsGenerated).toBe(0);
      expect(result.rulesPromoted).toBe(0);
      expect(result.memoriesCreated).toBe(0);
      expect(result.causalEdgesUpdated).toBe(0);
      expect(result.anomaliesDetected).toBe(0);
      expect(result.patternsRegistered).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should process signals and run discovery', async () => {
      // Generate enough signals to pass MIN_SIGNALS quality gate (500) and
      // cover at least 3 distinct source domains (MIN_DOMAINS=3).
      const domains = ['engineering', 'support', 'product', 'finance'];
      const signals = [];
      for (let i = 0; i < 600; i++) {
        signals.push({
          source_domain: domains[i % domains.length],
          signal_type: `signal_type_${i % 10}`,
          signal_value: Math.random(),
          signal_timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
          entity_type: 'metric',
          entity_id: `sig_${i}`,
        });
      }

      const supabase = createMockSupabase(signals);
      const repository = createMockRepository();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
        repository,
        evaluateMaturity: false,
        verbose: false,
      });

      const result = await learner.runLearningCycle();

      // Duration is measured with Date.now() — may be 0ms on fast machines so use >= 0
      expect(result.duration).toBeGreaterThanOrEqual(0);
      // Even if no causal edges found (depends on data), the cycle should complete
      expect(result.trainingStats).toBeDefined();
    });

    it('should log activity to repository when provided', async () => {
      // Need 500+ signals across 3+ domains to pass quality gate and reach logActivity call
      const domains = ['engineering', 'support', 'product', 'finance'];
      const manySignals = Array.from({ length: 600 }, (_, i) => ({
        source_domain: domains[i % domains.length],
        signal_type: `sig_type_${i % 8}`,
        signal_value: Math.random(),
        signal_timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
        entity_type: 'metric',
        entity_id: `sig_${i}`,
      }));
      const supabase = createMockSupabase(manySignals);

      const repository = createMockRepository();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
        repository,
        evaluateMaturity: false,
      });

      await learner.runLearningCycle();

      expect(repository.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'autonomous_learner',
          actionType: 'learning_cycle',
        })
      );
    });
  });

  describe('discoveriesToTrainingPack', () => {
    it('should convert relationships to causal chains', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const relationships = [
        {
          source_domain: 'engineering',
          target_domain: 'support',
          granger_p_value: 0.01,
          effect_size: 0.5,
          optimal_lag_days: 3,
          is_significant: true,
          natural_language: 'Deploy failures cause support spikes',
          sample_size: 100,
        },
      ] as any[];

      const pack = learner.discoveriesToTrainingPack(relationships, [], []);

      expect(pack.id).toContain('auto_org_123');
      expect(pack.causalChains.length).toBe(1);
      expect(pack.causalChains[0].source).toBe('engineering');
      expect(pack.causalChains[0].target).toBe('support');
      expect(pack.causalChains[0].effectSize).toBe(0.5);
      expect(pack.domains).toContain('engineering');
      expect(pack.domains).toContain('support');
    });

    it('should convert patterns to training patterns', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const patterns = [
        {
          id: 'p1',
          name: 'Deploy-Support Correlation',
          description: 'Deploy failures correlate with support tickets',
          domainsInvolved: ['engineering', 'support'],
          evidence: {
            testType: 'chi-squared',
            testStatistic: 12.5,
            pValue: 0.001,
            effectSize: 0.6,
            effectSizeCI: [0.3, 0.9],
            sampleSize: 200,
            survivesCorrection: true,
          },
          naturalLanguage: 'test',
          isNovel: true,
          isSignificant: true,
          discoveredAt: new Date(),
          confirmationCount: 10,
        },
      ] as any[];

      const pack = learner.discoveriesToTrainingPack([], patterns, []);

      expect(pack.patterns.length).toBe(1);
      expect(pack.patterns[0].name).toBe('Deploy-Support Correlation');
      expect(pack.patterns[0].domains).toEqual(['engineering', 'support']);
      expect(pack.patterns[0].total).toBe(200);
    });

    it('should convert high-severity anomalies to cascades', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const anomalies = [
        {
          entityType: 'finance',
          entityId: 'mrr_1',
          metricName: 'mrr_change',
          observedValue: -0.3,
          expectedValue: 0.05,
          zScore: -4.2,
          detectionMethod: 'zscore',
          explanation: 'MRR dropped significantly',
          severity: 'critical',
          detectedAt: new Date(),
          percentile: 0.01,
        },
        {
          entityType: 'support',
          entityId: 'tickets_1',
          metricName: 'ticket_volume',
          observedValue: 150,
          expectedValue: 50,
          zScore: 3.5,
          detectionMethod: 'zscore',
          explanation: 'Ticket spike',
          severity: 'high',
          detectedAt: new Date(),
          percentile: 0.99,
        },
        {
          entityType: 'engineering',
          entityId: 'ci_1',
          metricName: 'ci_pass_rate',
          observedValue: 0.9,
          expectedValue: 0.95,
          zScore: -1.2,
          detectionMethod: 'zscore',
          explanation: 'Slightly below average',
          severity: 'low',
          detectedAt: new Date(),
          percentile: 0.15,
        },
      ] as any[];

      const pack = learner.discoveriesToTrainingPack([], [], anomalies);

      // Only high/critical anomalies become cascades
      expect(pack.cascades.length).toBe(2);
      expect(pack.cascades[0].severity).toBe('critical');
      expect(pack.cascades[1].severity).toBe('high');
    });

    it('should generate pack with auto tags', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const pack = learner.discoveriesToTrainingPack([], [], []);

      expect(pack.tags).toContain('auto-generated');
      expect(pack.tags).toContain('living-brain');
      expect(pack.industry).toBe('auto-discovered');
    });
  });

  describe('evaluateCurrentMaturity', () => {
    it('should return a maturity report', async () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const maturity = await learner.evaluateCurrentMaturity();

      expect(maturity).toBeDefined();
      expect(maturity.overallLevel).toBeDefined();
      expect(maturity.overallScore).toBeDefined();
    });
  });

  describe('getTrainingStats', () => {
    it('should return training stats', () => {
      const supabase = createMockSupabase();
      const learner = createAutonomousLearner({
        supabase,
        organizationId: 'org_123',
      });

      const stats = learner.getTrainingStats();

      expect(stats).toBeDefined();
      expect(stats.casesLoaded).toBeDefined();
    });
  });
});
