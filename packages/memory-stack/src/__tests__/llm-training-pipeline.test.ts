/**
 * LLM Training Pipeline Tests — Sensory Cortex Exam
 * ===================================================
 *
 * Brain Analog: Testing the brain's perception system:
 *
 *   - Can the eyes capture raw input? (content fetcher)
 *   - Can the visual cortex parse images? (LLM extraction parser)
 *   - Can the hippocampus encode new memories? (training pack builder)
 *   - Can the full sensory-motor loop run? (pipeline integration)
 *   - Does the Corpus Callosum connect it? (brain pipeline wiring)
 *
 * Tests:
 * 1. LLM Knowledge Distiller: JSON parsing, pattern extraction
 * 2. Public Content Fetcher: topic rotation, source listing
 * 3. LLM Training Pipeline: full cycle integration
 * 4. Brain Pipeline: Sensory Cortex region in health report
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMKnowledgeDistiller } from '../learning/llm-knowledge-distiller';
import { createPublicContentFetcher } from '../learning/public-content-fetcher';
import { createLLMTrainingPipeline } from '../learning/llm-training-pipeline';
import { createBrainPipeline } from '../orchestrator/brain-pipeline';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase() {
  function createChainableQuery(): any {
    const result = { data: [], error: null };
    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    const chainMethods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'or',
      'filter', 'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps', 'match', 'ilike', 'like',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }

    const singleResult = { data: null, error: null };
    const singleQuery = {
      ...query,
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve(singleResult).then(onFulfilled, onRejected),
    };
    query.single = vi.fn().mockReturnValue(singleQuery);
    query.maybeSingle = vi.fn().mockReturnValue(singleQuery);

    return query;
  }

  return {
    from: vi.fn().mockImplementation(() => createChainableQuery()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

// ============================================================================
// SAMPLE LLM RESPONSES (Simulated extraction results)
// ============================================================================

const SAMPLE_LLM_RESPONSE = JSON.stringify({
  causal_patterns: [
    {
      source_domain: 'monetary_policy',
      target_domain: 'housing',
      effect_direction: 'negative',
      estimated_effect_size: 0.35,
      estimated_lag_days: 90,
      confidence: 0.8,
      explanation: 'Rising interest rates reduce housing demand',
    },
    {
      source_domain: 'employment',
      target_domain: 'consumer_spending',
      effect_direction: 'positive',
      estimated_effect_size: 0.6,
      estimated_lag_days: 30,
      confidence: 0.9,
      explanation: 'Higher employment drives consumer spending',
    },
  ],
  rules: [
    {
      title: 'Rate Hike Housing Alert',
      condition: 'Interest rate increases by >50bps',
      action: 'Monitor housing starts for decline within 90 days',
      domains: ['monetary_policy', 'housing'],
      confidence: 0.75,
    },
  ],
  cascades: [
    {
      chain: ['monetary_policy', 'lending', 'housing', 'construction_employment'],
      trigger: 'Federal Reserve rate hike',
      severity: 'high',
      explanation: 'Rate hikes reduce lending, which slows housing, which reduces construction jobs',
    },
  ],
  domains_found: ['monetary_policy', 'housing', 'employment', 'consumer_spending', 'lending', 'construction_employment'],
  extraction_confidence: 0.82,
});

const SAMPLE_MALFORMED_RESPONSE = 'This is not valid JSON at all';

const SAMPLE_MARKDOWN_WRAPPED = '```json\n' + SAMPLE_LLM_RESPONSE + '\n```';

// ============================================================================
// LLM KNOWLEDGE DISTILLER TESTS
// ============================================================================

describe('LLM Knowledge Distiller (Sensory Cortex)', () => {
  it('should parse well-formed LLM extraction response', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const result = distiller.parseExtraction(SAMPLE_LLM_RESPONSE);

    // Brain Analog: Sensory cortex correctly parses visual input
    expect(result.causalPatterns).toHaveLength(2);
    expect(result.rules).toHaveLength(1);
    expect(result.cascades).toHaveLength(1);
    expect(result.domainsFound).toHaveLength(6);
    expect(result.extractionConfidence).toBeCloseTo(0.82, 1);
  });

  it('should handle markdown-wrapped JSON responses', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const result = distiller.parseExtraction(SAMPLE_MARKDOWN_WRAPPED);

    // Brain Analog: Sensory cortex handles noisy input (wrapped in irrelevant context)
    expect(result.causalPatterns).toHaveLength(2);
    expect(result.rules).toHaveLength(1);
    expect(result.cascades).toHaveLength(1);
  });

  it('should gracefully handle malformed LLM responses', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const result = distiller.parseExtraction(SAMPLE_MALFORMED_RESPONSE);

    // Brain Analog: Sensory cortex reports "no signal" when input is pure noise
    expect(result.causalPatterns).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
    expect(result.cascades).toHaveLength(0);
    expect(result.extractionConfidence).toBe(0);
  });

  it('should clamp extracted values to valid ranges', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const overflowResponse = JSON.stringify({
      causal_patterns: [{
        source_domain: 'x',
        target_domain: 'y',
        effect_direction: 'positive',
        estimated_effect_size: 5.0, // Should clamp to 1.0
        estimated_lag_days: -10, // Should clamp to 0
        confidence: 2.0, // Should clamp to 1.0
        explanation: 'overflow test',
      }],
      rules: [],
      cascades: [],
      domains_found: [],
      extraction_confidence: 1.5, // Should clamp to 1.0
    });

    const result = distiller.parseExtraction(overflowResponse);

    expect(result.causalPatterns[0].estimated_effect_size).toBeLessThanOrEqual(1);
    expect(result.causalPatterns[0].estimated_lag_days).toBeGreaterThanOrEqual(0);
    expect(result.causalPatterns[0].confidence).toBeLessThanOrEqual(1);
    expect(result.extractionConfidence).toBeLessThanOrEqual(1);
  });

  it('should build training pack from extracted patterns', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const pack = distiller.buildTrainingPack(
      'test_batch',
      [
        {
          source_domain: 'marketing',
          target_domain: 'revenue',
          effect_direction: 'positive',
          estimated_effect_size: 0.5,
          estimated_lag_days: 14,
          confidence: 0.8,
          explanation: 'Marketing drives revenue',
        },
        {
          source_domain: 'support',
          target_domain: 'churn',
          effect_direction: 'negative',
          estimated_effect_size: 0.3,
          estimated_lag_days: 7,
          confidence: 0.7,
          explanation: 'Good support reduces churn',
        },
      ],
      [
        {
          title: 'Churn Alert',
          condition: 'NPS < 7',
          action: 'Assign CSM',
          domains: ['support', 'churn'],
          confidence: 0.9,
        },
      ],
      [
        {
          chain: ['engineering', 'product', 'churn'],
          trigger: 'Critical bug in production',
          severity: 'high',
          explanation: 'Bugs impact product quality leading to churn',
        },
      ],
      ['marketing', 'revenue', 'support', 'churn', 'engineering', 'product'],
      ['wikipedia', 'hackernews']
    );

    // Brain Analog: Memory consolidation produced a structured long-term memory
    expect(pack.id).toContain('llm_distilled_');
    expect(pack.causalChains).toHaveLength(2);
    expect(pack.businessRules).toHaveLength(1);
    expect(pack.cascades).toHaveLength(1);
    expect(pack.domains).toHaveLength(6);
    expect(pack.tags).toContain('llm-distilled');
    expect(pack.confidence).toBeGreaterThan(0);

    // Check effect direction: negative effect → negative effectSize
    const supportChurn = pack.causalChains.find(c => c.source === 'support');
    expect(supportChurn!.effectSize).toBeLessThan(0);

    // Check business rule structure
    expect(pack.businessRules[0].title).toBe('Churn Alert');
    expect(pack.businessRules[0].naturalLanguage).toContain('NPS < 7');
  });

  it('should de-duplicate causal patterns by source→target key', () => {
    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const pack = distiller.buildTrainingPack(
      'dedup_test',
      [
        {
          source_domain: 'marketing',
          target_domain: 'revenue',
          effect_direction: 'positive',
          estimated_effect_size: 0.3,
          estimated_lag_days: 14,
          confidence: 0.6,
          explanation: 'First mention',
        },
        {
          source_domain: 'marketing',
          target_domain: 'revenue',
          effect_direction: 'positive',
          estimated_effect_size: 0.5,
          estimated_lag_days: 14,
          confidence: 0.9, // Higher confidence → should win
          explanation: 'Second mention with more evidence',
        },
      ],
      [], [], ['marketing', 'revenue'], ['test']
    );

    // Brain Analog: The brain keeps the stronger memory, not duplicates
    expect(pack.causalChains).toHaveLength(1);
    expect(pack.causalChains[0].effectSize).toBeCloseTo(0.5);
  });
});

// ============================================================================
// PUBLIC CONTENT FETCHER TESTS
// ============================================================================

describe('Public Content Fetcher (Sensory Organs)', () => {
  it('should list available content sources', () => {
    const fetcher = createPublicContentFetcher();
    const sources = fetcher.getAvailableSources();

    expect(sources.length).toBeGreaterThanOrEqual(4);
    expect(sources.find(s => s.name === 'wikipedia')).toBeDefined();
    expect(sources.find(s => s.name === 'hackernews_articles')).toBeDefined();
    expect(sources.find(s => s.name === 'fred_commentary')).toBeDefined();
    expect(sources.find(s => s.name === 'github_readmes')).toBeDefined();
  });

  it('should expose Wikipedia topic categories', () => {
    const fetcher = createPublicContentFetcher();
    const categories = fetcher.getTopicCategories();

    // Brain Analog: The textbook library should have multiple subject areas
    expect(Object.keys(categories)).toContain('economics');
    expect(Object.keys(categories)).toContain('technology');
    expect(Object.keys(categories)).toContain('business');
    expect(Object.keys(categories)).toContain('causality');
    expect(Object.keys(categories)).toContain('people');
    expect(Object.keys(categories)).toContain('marketing');

    // Each category should have articles
    for (const [category, topics] of Object.entries(categories)) {
      expect(topics.length).toBeGreaterThan(0);
    }
  });

  it('should respect enabledSources configuration', () => {
    const fetcher = createPublicContentFetcher({
      enabledSources: ['wikipedia'],
    });

    const sources = fetcher.getAvailableSources();
    const enabled = sources.filter(s => s.enabled);

    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('wikipedia');
  });
});

// ============================================================================
// LLM TRAINING PIPELINE INTEGRATION TESTS
// ============================================================================

describe('LLM Training Pipeline (Sensory-Motor Learning Loop)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('should create a training pipeline', () => {
    const pipeline = createLLMTrainingPipeline({
      supabase,
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
    });

    expect(pipeline.runTrainingCycle).toBeDefined();
    expect(pipeline.distillCustomContent).toBeDefined();
    expect(pipeline.getContentSources).toBeDefined();
    expect(pipeline.getDataSources).toBeDefined();
    expect(pipeline.getTopicCategories).toBeDefined();
  });

  it('should list content and data sources', () => {
    const pipeline = createLLMTrainingPipeline({
      supabase,
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
    });

    const contentSources = pipeline.getContentSources();
    const dataSources = pipeline.getDataSources();
    const categories = pipeline.getTopicCategories();

    expect(contentSources.length).toBeGreaterThan(0);
    expect(dataSources.length).toBeGreaterThan(0);
    expect(Object.keys(categories).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// BRAIN PIPELINE WIRING TESTS
// ============================================================================

describe('Brain Pipeline Sensory Cortex Integration', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('should include Sensory Cortex in health report (9 regions)', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
    });

    const health = brain.getHealth();

    // Brain Analog: Neurological exam now tests 9 regions including Sensory Cortex
    expect(health.regions).toHaveLength(9);

    const sensoryRegion = health.regions.find(r => r.name === 'Public Data Training');
    expect(sensoryRegion).toBeDefined();
    expect(sensoryRegion!.brainAnalog).toBe('Sensory Cortex');
  });

  it('should report not_initialized when LLM training not configured', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
      // No llmTraining config
    });

    const health = brain.getHealth();
    const sensoryRegion = health.regions.find(r => r.name === 'Public Data Training');

    expect(sensoryRegion!.status).toBe('not_initialized');
    expect(sensoryRegion!.details).toContain('Not configured');
  });

  it('should report not_initialized when LLM training configured but not yet run', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
      llmTraining: {
        provider: 'anthropic',
        apiKey: 'test-key',
      },
    });

    const health = brain.getHealth();
    const sensoryRegion = health.regions.find(r => r.name === 'Public Data Training');

    expect(sensoryRegion!.status).toBe('not_initialized');
    expect(sensoryRegion!.details).toContain('configured but not yet run');
  });

  it('should expose runPublicDataTraining method', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
    });

    expect(brain.runPublicDataTraining).toBeDefined();
    expect(typeof brain.runPublicDataTraining).toBe('function');
  });

  it('should return error result when LLM training not configured', async () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
      // No llmTraining config
    });

    const result = await brain.runPublicDataTraining();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.narrative).toContain('not configured');
    expect(result.distillation).toBeNull();
  });

  it('should expose getLLMTrainingPipeline accessor', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
    });

    // Without config, pipeline should be null
    expect(brain.getLLMTrainingPipeline()).toBeNull();

    // With config, pipeline should exist
    const brainWithLLM = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
      llmTraining: {
        provider: 'anthropic',
        apiKey: 'test-key',
      },
    });

    expect(brainWithLLM.getLLMTrainingPipeline()).not.toBeNull();
  });

  it('should include publicDataTraining in full cycle report', async () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
      // No LLM training — publicDataTraining should be null
    });

    const report = await brain.runFullCycle();

    expect(report.publicDataTraining).toBeNull();
  });

  it('should have all 9 brain regions with correct analogs', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-test',
    });

    const health = brain.getHealth();
    const analogs = health.regions.map(r => r.brainAnalog);

    expect(analogs).toContain('Hippocampus → Neocortex');
    expect(analogs).toContain('Default Mode Network');
    expect(analogs).toContain('Amygdala');
    expect(analogs).toContain('Thalamus');
    expect(analogs).toContain('Cerebellum');
    expect(analogs).toContain('Active Inference');
    expect(analogs).toContain('Prefrontal Cortex');
    expect(analogs).toContain('Long-Term Potentiation');
    expect(analogs).toContain('Sensory Cortex');
  });
});

// ============================================================================
// BRAIN ANALOGY VALIDATION
// ============================================================================

describe('Brain Analogy: Sensory-Motor Learning Loop', () => {
  it('should model the complete perception pipeline', () => {
    // Brain Analog:
    // The human sensory-motor learning loop:
    //
    // 1. SENSE: Eyes capture light → optic nerve → visual cortex
    //    NexusBrain: Content fetcher captures text from Wikipedia, HN
    //
    // 2. PERCEIVE: Visual cortex recognizes objects, faces, text
    //    NexusBrain: LLM distiller extracts causal patterns from text
    //
    // 3. ENCODE: Hippocampus converts percepts to episodic memories
    //    NexusBrain: Training pack builder structures extracted knowledge
    //
    // 4. CONSOLIDATE: During sleep, hippocampus replays to neocortex
    //    NexusBrain: Brain trainer loads packs into causal graph
    //
    // 5. STRENGTHEN: LTP strengthens frequently-activated synapses
    //    NexusBrain: Bayesian updater strengthens verified edges
    //
    // This test validates the analogy is correctly implemented.

    const distiller = createLLMKnowledgeDistiller({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const fetcher = createPublicContentFetcher();

    // Sensory organs: multiple modalities available
    const sources = fetcher.getAvailableSources();
    expect(sources.length).toBeGreaterThanOrEqual(4); // Visual, auditory, etc.

    // Sensory cortex: can parse structured knowledge from raw text
    const parsed = distiller.parseExtraction(SAMPLE_LLM_RESPONSE);
    expect(parsed.causalPatterns.length).toBeGreaterThan(0);

    // Memory encoding: structured knowledge becomes a training pack
    const pack = distiller.buildTrainingPack(
      'analogy_test',
      parsed.causalPatterns,
      parsed.rules,
      parsed.cascades,
      parsed.domainsFound,
      ['test']
    );
    expect(pack.causalChains.length).toBeGreaterThan(0);
    expect(pack.id).toContain('llm_distilled_');

    // The training pack is ready for brain-trainer consumption
    expect(pack.causalChains[0].source).toBeDefined();
    expect(pack.causalChains[0].target).toBeDefined();
    expect(pack.causalChains[0].effectSize).toBeDefined();
    expect(pack.causalChains[0].lagDays).toBeDefined();
  });
});
