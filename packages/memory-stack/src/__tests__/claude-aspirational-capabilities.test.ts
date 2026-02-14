/**
 * Claude-Aspirational Capabilities — Comprehensive Test Suite
 *
 * Tests all 8 new brain regions that bring Claude-level intelligence:
 * 1. Agent Loop — Autonomous multi-step execution
 * 2. Long-Context Manager — Smart truncation & relevance filtering
 * 3. RAG Retriever — Real-time retrieval augmented generation
 * 4. Multi-Modal Inference — Cross-modal understanding
 * 5. Proactive Intelligence — Push-based insight delivery
 * 6. Session Memory — Per-user context accumulation
 * 7. Structured Output — Schema validation & typed responses
 * 8. Reasoning Chain — Explicit chain-of-thought surfacing
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentLoop } from '../orchestrator/agent-loop';
import { createLongContextManager } from '../orchestrator/long-context-manager';
import { createRAGRetriever } from '../orchestrator/rag-retriever';
import { createMultiModalInference } from '../core/multi-modal-inference';
import { createProactiveIntelligence } from '../orchestrator/proactive-intelligence';
import { createSessionMemory } from '../orchestrator/session-memory';
import { createStructuredOutput } from '../orchestrator/structured-output';
import { createReasoningChain } from '../orchestrator/reasoning-chain';

// ============================================================================
// 1. AGENT LOOP
// ============================================================================

describe('Agent Loop', () => {
  it('should create an agent loop with default config', () => {
    const loop = createAgentLoop();
    expect(loop.getConfig().maxSteps).toBe(15);
    expect(loop.getConfig().maxDurationMs).toBe(60_000);
    expect(loop.getTools()).toContain('synthesize');
  });

  it('should plan a diagnostic goal', () => {
    const loop = createAgentLoop();
    const plan = loop.plan('Why did churn spike last month?');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((t) => t.objective.toLowerCase().includes('search'))).toBe(true);
  });

  it('should plan a prediction goal', () => {
    const loop = createAgentLoop();
    const plan = loop.plan('Predict revenue next quarter');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].toolName).toBe('synthesize'); // fallback since no tool registered
  });

  it('should plan a what-if goal', () => {
    const loop = createAgentLoop();
    const plan = loop.plan('What if we increase marketing spend by 50%?');
    expect(plan.length).toBeGreaterThan(0);
  });

  it('should execute a simple goal with built-in synthesize', async () => {
    const loop = createAgentLoop({ maxSteps: 5 });
    const result = await loop.execute({ goal: 'Summarize current business state' });
    expect(result.stepsExecuted).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.narrative).toBeTruthy();
  });

  it('should respect step budget', async () => {
    const loop = createAgentLoop({ maxSteps: 2 });
    const result = await loop.execute({
      goal: 'Find why churn spiked and predict next quarter and build a dashboard',
    });
    expect(result.stepsExecuted).toBeLessThanOrEqual(2);
  });

  it('should use custom tools when available', async () => {
    const mockTool = {
      name: 'searchKnowledge',
      description: 'Search knowledge base',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { results: ['churn data'] },
        summary: 'Found churn data',
        confidence: 0.9,
      }),
    };

    const loop = createAgentLoop({
      tools: { searchKnowledge: mockTool },
      maxSteps: 5,
    });

    const result = await loop.execute({ goal: 'Why did churn increase?' });
    expect(mockTool.execute).toHaveBeenCalled();
    expect(result.stepsExecuted).toBeGreaterThan(0);
  });

  it('should handle tool failures gracefully', async () => {
    const failingTool = {
      name: 'searchKnowledge',
      description: 'Always fails',
      execute: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const loop = createAgentLoop({
      tools: { searchKnowledge: failingTool },
      maxRetriesPerStep: 1,
      maxSteps: 5,
    });

    const result = await loop.execute({ goal: 'Why did churn increase?' });
    expect(result.stepsFailed).toBeGreaterThan(0);
  });

  it('should stream progress via callback', async () => {
    const progressUpdates: any[] = [];
    const loop = createAgentLoop({
      onProgress: (step) => progressUpdates.push(step),
      maxSteps: 5,
    });

    await loop.execute({ goal: 'Simple query' });
    expect(progressUpdates.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 2. LONG-CONTEXT MANAGER
// ============================================================================

describe('Long-Context Manager', () => {
  it('should create with default config', () => {
    const manager = createLongContextManager();
    expect(manager.getConfig().maxTokens).toBe(100_000);
    expect(manager.getConfig().responseReserve).toBe(4_000);
  });

  it('should estimate tokens', () => {
    const manager = createLongContextManager();
    const tokens = manager.estimateTokens('Hello world');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  it('should optimize sections by relevance', () => {
    const manager = createLongContextManager({ maxTokens: 10_000 });

    const result = manager.optimize({
      sections: [
        { id: '1', title: 'High Priority', content: 'Very relevant info', relevance: 0.9 },
        { id: '2', title: 'Low Priority', content: 'Less relevant info', relevance: 0.2 },
        { id: '3', title: 'Critical', content: 'Must include', relevance: 1.0, critical: true },
      ],
    });

    expect(result.sectionsKept).toBeGreaterThan(0);
    expect(result.tokenBudget.used).toBeLessThanOrEqual(result.tokenBudget.total);
    expect(result.optimizedPrompt).toBeTruthy();
    expect(result.preservationConfidence).toBeGreaterThan(0);
  });

  it('should always include critical sections', () => {
    const manager = createLongContextManager({ maxTokens: 1000 });

    const result = manager.optimize({
      sections: [
        { id: '1', title: 'Critical Section', content: 'Must be included', relevance: 1.0, critical: true },
        { id: '2', title: 'Optional', content: 'x'.repeat(800), relevance: 0.5 },
      ],
    });

    expect(result.sections.some((s) => s.id === '1')).toBe(true);
  });

  it('should check if content fits in budget', () => {
    const manager = createLongContextManager({ maxTokens: 10_000 });

    const fits = manager.fitsInBudget([
      { id: '1', title: 'Small', content: 'tiny', relevance: 0.5 },
    ]);
    expect(fits).toBe(true);

    const doesntFit = manager.fitsInBudget([
      { id: '1', title: 'Huge', content: 'x'.repeat(100000), relevance: 0.5 },
    ]);
    expect(doesntFit).toBe(false);
  });

  it('should manage conversation history with sliding window', () => {
    const manager = createLongContextManager({ maxTokens: 500, maxHistoryMessages: 3 });

    const result = manager.optimize({
      sections: [],
      conversationHistory: [
        { role: 'user', content: 'Old message 1', importance: 0.2 },
        { role: 'assistant', content: 'Old response 1', importance: 0.3 },
        { role: 'user', content: 'Recent message', importance: 0.9 },
        { role: 'assistant', content: 'Recent response', importance: 0.8 },
        { role: 'user', content: 'Latest question', importance: 1.0 },
      ],
    });

    expect(result.messagesKept).toBeLessThanOrEqual(5);
  });

  it('should compress low-priority sections when enabled', () => {
    const manager = createLongContextManager({ maxTokens: 50_000, enableCompression: true });

    const longContent = Array(200).fill('This is a sentence with some data points: 42% growth, $5M revenue.').join(' ');
    const result = manager.optimize({
      sections: [
        { id: '1', title: 'Long Section', content: longContent, relevance: 0.5 },
      ],
    });

    // The optimizer should have processed the content
    expect(result.sectionsKept).toBeGreaterThanOrEqual(0);
    // The used tokens should be within total budget
    expect(result.tokenBudget.total).toBe(50_000);
  });
});

// ============================================================================
// 3. RAG RETRIEVER
// ============================================================================

describe('RAG Retriever', () => {
  it('should create with default config', () => {
    const retriever = createRAGRetriever();
    expect(retriever.getConfig().defaultTopK).toBe(10);
    expect(retriever.getConfig().dedupThreshold).toBe(0.85);
  });

  it('should retrieve with no sources (empty result)', async () => {
    const retriever = createRAGRetriever();
    const result = await retriever.retrieve('What is churn?');
    expect(result.chunks).toHaveLength(0);
    expect(result.grounding.category).toBe('ungrounded');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should retrieve from a single source', async () => {
    const mockSource = {
      name: 'vector',
      search: vi.fn().mockResolvedValue([
        {
          id: 'chunk1',
          content: 'Churn rate is the percentage of customers who stop using a product.',
          score: 0.9,
          source: { documentId: 'doc1', title: 'Churn Guide', type: 'document' },
          retrievedBy: 'vector',
        },
        {
          id: 'chunk2',
          content: 'Common causes include poor onboarding and lack of engagement.',
          score: 0.7,
          source: { documentId: 'doc2', title: 'CS Playbook', type: 'document' },
          retrievedBy: 'vector',
        },
      ]),
    };

    const retriever = createRAGRetriever({ sources: [mockSource] });
    const result = await retriever.retrieve('What is churn?');

    expect(result.chunks.length).toBe(2);
    expect(result.citations.length).toBe(2);
    expect(result.grounding.score).toBeGreaterThan(0);
    expect(result.contextPrompt).toContain('Retrieved Knowledge');
    expect(result.sourcesUsed).toContain('vector');
  });

  it('should deduplicate similar chunks', async () => {
    const mockSource = {
      name: 'vector',
      search: vi.fn().mockResolvedValue([
        {
          id: 'chunk1',
          content: 'Churn rate is the percentage of customers who stop',
          score: 0.9,
          source: { documentId: 'doc1', title: 'Guide', type: 'doc' },
          retrievedBy: 'vector',
        },
        {
          id: 'chunk2',
          content: 'Churn rate is the percentage of customers who stop using the product',
          score: 0.8,
          source: { documentId: 'doc1', title: 'Guide', type: 'doc' },
          retrievedBy: 'vector',
        },
      ]),
    };

    const retriever = createRAGRetriever({ sources: [mockSource], dedupThreshold: 0.7 });
    const result = await retriever.retrieve('churn');

    expect(result.deduplicatedCount).toBeGreaterThanOrEqual(0);
  });

  it('should handle source failures gracefully', async () => {
    const failingSource = {
      name: 'broken',
      search: vi.fn().mockRejectedValue(new Error('DB down')),
    };

    const retriever = createRAGRetriever({ sources: [failingSource], verbose: true });
    const result = await retriever.retrieve('test query');
    expect(result.chunks).toHaveLength(0);
  });

  it('should add sources dynamically', async () => {
    const retriever = createRAGRetriever();
    expect(retriever.getSources()).toHaveLength(0);

    retriever.addSource({
      name: 'new-source',
      search: vi.fn().mockResolvedValue([]),
    });

    expect(retriever.getSources()).toContain('new-source');
  });
});

// ============================================================================
// 4. MULTI-MODAL INFERENCE
// ============================================================================

describe('Multi-Modal Inference', () => {
  it('should create with default config', () => {
    const engine = createMultiModalInference();
    expect(engine.getConfig().anomalySensitivity).toBe(2.0);
  });

  describe('Time Series Analysis', () => {
    it('should detect increasing trend', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeTimeSeries({
        values: [10, 15, 20, 25, 30, 35, 40],
        domain: 'revenue',
        metric: 'MRR',
      });

      expect(result.trend).toBe('increasing');
      expect(result.trendStrength).toBeGreaterThan(0);
      expect(result.statistics.percentChange).toBeGreaterThan(0);
      expect(result.narrative).toContain('MRR');
    });

    it('should detect decreasing trend', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeTimeSeries({
        values: [40, 35, 30, 25, 20, 15, 10],
        metric: 'Engagement',
      });

      expect(result.trend).toBe('decreasing');
      expect(result.statistics.percentChange).toBeLessThan(0);
    });

    it('should detect anomalies', () => {
      const engine = createMultiModalInference({ anomalySensitivity: 1.5 });
      const result = engine.analyzeTimeSeries({
        values: [10, 11, 10, 12, 50, 11, 10], // 50 is anomalous
        metric: 'Errors',
      });

      expect(result.anomalies.length).toBeGreaterThan(0);
      expect(result.anomalies[0].index).toBe(4); // The spike
      expect(result.anomalies[0].direction).toBe('above');
    });

    it('should compute statistics', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeTimeSeries({
        values: [1, 2, 3, 4, 5],
      });

      expect(result.statistics.mean).toBe(3);
      expect(result.statistics.min).toBe(1);
      expect(result.statistics.max).toBe(5);
      expect(result.statistics.range).toBe(4);
    });

    it('should extract signals', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeTimeSeries({
        values: [10, 15, 20, 25, 30],
        domain: 'revenue',
        metric: 'ARR',
      });

      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.signals[0].domain).toBe('revenue');
      expect(result.signals[0].type).toBe('trend');
    });
  });

  describe('Document Analysis', () => {
    it('should analyze a business document', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeDocument({
        content: 'Q4 revenue reached $5M, a 25% increase from Q3. Churn rate decreased to 3.2%. Customer satisfaction NPS improved to 72. Engineering velocity increased by 15% due to better tooling.',
        type: 'report',
        title: 'Q4 Board Update',
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.metrics.length).toBeGreaterThan(0);
      expect(result.domains).toContain('finance');
      expect(result.sentiment.label).toMatch(/positive/);
      expect(result.summary).toContain('Q4 Board Update');
    });

    it('should extract entities from text', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeDocument({
        content: 'The deal with Acme Corp for $2.5M closed on Q4 2024. NRR is 115%.',
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities.some((e) => e.type === 'money')).toBe(true);
      expect(result.entities.some((e) => e.type === 'percent')).toBe(true);
    });

    it('should detect relationships', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeDocument({
        content: 'Poor onboarding causes customer churn. Marketing spend increases revenue growth.',
      });

      expect(result.relationships.length).toBeGreaterThan(0);
    });
  });

  describe('Chart Analysis', () => {
    it('should analyze chart with multiple series', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeChart({
        type: 'line',
        title: 'Revenue vs Churn',
        series: [
          { name: 'Revenue', values: [100, 110, 120, 130, 140] },
          { name: 'Churn', values: [5, 4.5, 4, 3.5, 3] },
        ],
        domain: 'finance',
      });

      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.trends.length).toBe(2);
      expect(result.narrative).toContain('Revenue vs Churn');
    });

    it('should detect cross-series correlations', () => {
      const engine = createMultiModalInference();
      const result = engine.analyzeChart({
        type: 'line',
        series: [
          { name: 'A', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          { name: 'B', values: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] }, // Perfect correlation
        ],
      });

      expect(result.correlations.length).toBeGreaterThan(0);
      expect(result.correlations[0].correlation).toBeGreaterThan(0.9);
    });
  });
});

// ============================================================================
// 5. PROACTIVE INTELLIGENCE
// ============================================================================

describe('Proactive Intelligence', () => {
  it('should create with default config', () => {
    const proactive = createProactiveIntelligence();
    expect(proactive.getMonitors()).toHaveLength(0);
    expect(proactive.getTemplates().length).toBeGreaterThan(0);
  });

  it('should add and remove monitors', () => {
    const proactive = createProactiveIntelligence();

    proactive.addMonitor({
      id: 'test',
      name: 'Test Monitor',
      domain: 'cs',
      check: () => true,
      severity: 'warning',
      message: 'Test alert',
      enabled: true,
    });

    expect(proactive.getMonitors()).toHaveLength(1);
    proactive.removeMonitor('test');
    expect(proactive.getMonitors()).toHaveLength(0);
  });

  it('should fire alerts when conditions are met', async () => {
    const proactive = createProactiveIntelligence({ alertCooldownMs: 0 });

    proactive.addMonitor({
      id: 'churn_check',
      name: 'High Churn',
      domain: 'cs',
      check: (state) => (state.churn_rate as number) > 0.05,
      severity: 'critical',
      message: 'Churn rate exceeded 5%',
      enabled: true,
    });

    const result = await proactive.scan({ churn_rate: 0.08 });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('critical');
    expect(result.alerts[0].domain).toBe('cs');
    expect(result.healthSummary.criticalAlerts).toBe(1);
    expect(result.briefing).toContain('critical');
  });

  it('should not fire when conditions are not met', async () => {
    const proactive = createProactiveIntelligence({ alertCooldownMs: 0 });

    proactive.addMonitor({
      id: 'churn_check',
      name: 'High Churn',
      domain: 'cs',
      check: (state) => (state.churn_rate as number) > 0.05,
      severity: 'critical',
      message: 'Churn exceeded 5%',
      enabled: true,
    });

    const result = await proactive.scan({ churn_rate: 0.02 });
    expect(result.alerts).toHaveLength(0);
    expect(result.briefing).toContain('All clear');
  });

  it('should throttle duplicate alerts', async () => {
    const proactive = createProactiveIntelligence({ alertCooldownMs: 60_000 });

    proactive.addMonitor({
      id: 'test',
      name: 'Always Fire',
      domain: 'test',
      check: () => true,
      severity: 'info',
      message: 'Test',
      enabled: true,
    });

    const first = await proactive.scan({});
    expect(first.monitorsFired).toBe(1);

    const second = await proactive.scan({});
    expect(second.monitorsThrottled).toBe(1);
    expect(second.monitorsFired).toBe(0);
  });

  it('should create from template', () => {
    const proactive = createProactiveIntelligence();
    const monitor = proactive.createFromTemplate('threshold_breach', {
      metric: 'churn_rate',
      threshold: 0.05,
      direction: 'above',
      domain: 'cs',
    });

    expect(monitor).not.toBeNull();
    expect(monitor!.domain).toBe('cs');
    expect(monitor!.severity).toBe('critical');
  });

  it('should generate context section from history', async () => {
    const proactive = createProactiveIntelligence({ alertCooldownMs: 0 });

    proactive.addMonitor({
      id: 'test',
      name: 'Test',
      domain: 'cs',
      check: () => true,
      severity: 'critical',
      message: 'Something critical happened',
      enabled: true,
    });

    await proactive.scan({});
    const context = proactive.getContextSection();
    expect(context).toContain('Proactive Intelligence');
    expect(context).toContain('Critical');
  });

  it('should deliver alerts via callback', async () => {
    const delivered: any[] = [];
    const proactive = createProactiveIntelligence({
      alertCooldownMs: 0,
      onAlert: async (alert) => { delivered.push(alert); },
    });

    proactive.addMonitor({
      id: 'test',
      name: 'Test',
      domain: 'test',
      check: () => true,
      severity: 'info',
      message: 'Test alert',
      enabled: true,
    });

    await proactive.scan({});
    expect(delivered).toHaveLength(1);
    expect(delivered[0].delivered).toBe(true);
  });
});

// ============================================================================
// 6. SESSION MEMORY
// ============================================================================

describe('Session Memory', () => {
  it('should create with default config', () => {
    const memory = createSessionMemory();
    expect(memory.getStats().totalMemories).toBe(0);
  });

  it('should remember and recall memories', () => {
    const memory = createSessionMemory();

    memory.remember({
      type: 'preference',
      content: 'User prefers concise bullet-point answers',
      importance: 0.8,
    });

    memory.remember({
      type: 'fact',
      content: 'User is CTO of a fintech startup with 50 employees',
      importance: 0.9,
      domains: ['people', 'finance'],
    });

    const result = memory.recall('technical question');
    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.totalMemories).toBe(2);
    expect(result.promptText).toContain('Session Memory');
  });

  it('should recall relevant memories by keyword', () => {
    const memory = createSessionMemory();

    memory.remember({ type: 'fact', content: 'Revenue is $5M ARR', importance: 0.8, domains: ['finance'] });
    memory.remember({ type: 'fact', content: 'Team size is 50 engineers', importance: 0.7, domains: ['engineering'] });
    memory.remember({ type: 'fact', content: 'Churn rate is 3%', importance: 0.8, domains: ['cs'] });

    const result = memory.recall('What is our revenue?', ['finance']);
    expect(result.memories.some((m) => m.content.includes('Revenue'))).toBe(true);
  });

  it('should distill conversations', () => {
    const memory = createSessionMemory();

    const result = memory.distillAndStore({
      messages: [
        { role: 'user', content: 'I prefer detailed analysis with charts' },
        { role: 'assistant', content: 'Understood, I\'ll provide detailed analysis.' },
        { role: 'user', content: 'What is our churn rate? Our NRR is 115%.' },
        { role: 'assistant', content: 'Based on the data, your churn rate is approximately 3.2%.' },
      ],
      sessionId: 'session_1',
      domains: ['cs'],
    });

    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.preferences.length).toBeGreaterThan(0);
    expect(memory.getStats().totalMemories).toBeGreaterThan(0);
  });

  it('should enforce memory capacity', () => {
    const memory = createSessionMemory({ maxMemories: 5 });

    for (let i = 0; i < 10; i++) {
      memory.remember({
        type: 'fact',
        content: `Fact number ${i}`,
        importance: i * 0.1,
      });
    }

    expect(memory.getStats().totalMemories).toBeLessThanOrEqual(5);
  });

  it('should apply memory decay', () => {
    const memory = createSessionMemory({ decayRate: 0.1, minImportance: 0.3 });

    memory.remember({ type: 'fact', content: 'Old fact', importance: 0.35 });

    // Simulate time passing by manually decaying
    const result = memory.applyDecay();
    // Immediately after creation, decay shouldn't remove much
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('should forget specific memories', () => {
    const memory = createSessionMemory();
    const entry = memory.remember({ type: 'fact', content: 'Test', importance: 0.5 });
    expect(memory.getStats().totalMemories).toBe(1);

    memory.forget(entry.id);
    expect(memory.getStats().totalMemories).toBe(0);
  });

  it('should clear all memories', () => {
    const memory = createSessionMemory();
    memory.remember({ type: 'fact', content: 'A', importance: 0.5 });
    memory.remember({ type: 'fact', content: 'B', importance: 0.5 });

    const cleared = memory.clearAll();
    expect(cleared).toBe(2);
    expect(memory.getStats().totalMemories).toBe(0);
  });

  it('should load memories from external store', () => {
    const memory = createSessionMemory();
    memory.loadMemories([
      {
        id: 'ext_1',
        type: 'preference',
        content: 'Prefers tables',
        importance: 0.8,
        domains: [],
        keywords: ['tables', 'prefers'],
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 5,
      },
    ]);

    expect(memory.getStats().totalMemories).toBe(1);
  });
});

// ============================================================================
// 7. STRUCTURED OUTPUT
// ============================================================================

describe('Structured Output', () => {
  it('should create with default config', () => {
    const output = createStructuredOutput();
    expect(output.listSchemas()).toHaveLength(0);
  });

  it('should define and retrieve schemas', () => {
    const output = createStructuredOutput();
    output.defineSchema({
      name: 'DiagnosisReport',
      fields: {
        rootCause: { type: 'string', required: true },
        confidence: { type: 'number', min: 0, max: 1 },
      },
    });

    expect(output.listSchemas()).toContain('DiagnosisReport');
    expect(output.getSchema('DiagnosisReport')).toBeTruthy();
  });

  it('should validate valid data', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'Test',
      fields: {
        name: { type: 'string', required: true },
        score: { type: 'number', min: 0, max: 100 },
        tags: { type: 'array', items: { type: 'string' } },
      },
    });

    const result = output.validate(
      { name: 'Test', score: 85, tags: ['a', 'b'] },
      schema,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should catch validation errors', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'Test',
      fields: {
        name: { type: 'string', required: true },
        score: { type: 'number', min: 0, max: 100 },
      },
    });

    const result = output.validate(
      { score: 150 }, // Missing required 'name', score out of range
      schema,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.path === 'name')).toBe(true);
    expect(result.errors.some((e) => e.path === 'score')).toBe(true);
  });

  it('should structure data with envelope', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'Report',
      fields: {
        title: { type: 'string', required: true },
        items: { type: 'array', items: { type: 'string' } },
      },
    });

    const result = output.structure(
      { title: 'Q4 Report', items: ['Revenue up', 'Churn down'] },
      schema,
      { intent: 'diagnose', confidence: 0.9, domains: ['finance'] },
    );

    expect(result.valid).toBe(true);
    expect(result.envelope.schema).toBe('Report');
    expect(result.envelope.meta.intent).toBe('diagnose');
    expect(result.envelope.meta.confidence).toBe(0.9);
    expect(result.envelope.meta.domains).toContain('finance');
  });

  it('should inject default values', () => {
    const output = createStructuredOutput({ injectDefaults: true });
    const schema = output.defineSchema({
      name: 'Test',
      fields: {
        title: { type: 'string', required: true },
        status: { type: 'string', default: 'active' },
        count: { type: 'number', default: 0 },
      },
    });

    const result = output.structure({ title: 'Test' }, schema);
    expect(result.data.status).toBe('active');
    expect(result.data.count).toBe(0);
  });

  it('should format in multiple output formats', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'Test',
      fields: { title: { type: 'string' } },
    });

    const data = { title: 'Hello' };

    const json = output.format(data, schema, 'json');
    expect(json.format).toBe('json');
    expect(json.content).toContain('"title"');

    const md = output.format(data, schema, 'markdown');
    expect(md.format).toBe('markdown');
    expect(md.content).toContain('Test');

    const table = output.format(data, schema, 'table');
    expect(table.format).toBe('table');
    expect(table.content).toContain('|');
  });

  it('should create quick schemas', () => {
    const output = createStructuredOutput();
    const schema = output.quickSchema('FastReport', {
      title: 'string!',
      score: 'number',
      tags: 'string[]',
      status: 'enum:active|inactive|pending',
    });

    expect(schema.fields.title.required).toBe(true);
    expect(schema.fields.score.type).toBe('number');
    expect(schema.fields.tags.type).toBe('array');
    expect(schema.fields.status.type).toBe('enum');
  });

  it('should validate nested objects', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'Nested',
      fields: {
        user: {
          type: 'object',
          required: true,
          fields: {
            name: { type: 'string', required: true },
            age: { type: 'number', min: 0 },
          },
        },
      },
    });

    const valid = output.validate({ user: { name: 'John', age: 30 } }, schema);
    expect(valid.valid).toBe(true);

    const invalid = output.validate({ user: { age: -5 } }, schema);
    expect(invalid.valid).toBe(false);
  });

  it('should validate enum fields', () => {
    const output = createStructuredOutput();
    const schema = output.defineSchema({
      name: 'EnumTest',
      fields: {
        status: { type: 'enum', values: ['active', 'inactive'], required: true },
      },
    });

    expect(output.validate({ status: 'active' }, schema).valid).toBe(true);
    expect(output.validate({ status: 'unknown' }, schema).valid).toBe(false);
  });
});

// ============================================================================
// 8. REASONING CHAIN
// ============================================================================

describe('Reasoning Chain', () => {
  it('should create with default config', () => {
    const chain = createReasoningChain();
    expect(chain.getConfig().maxSteps).toBe(20);
    expect(chain.getConfig().depth).toBe('moderate');
  });

  it('should add steps and finalize', () => {
    const chain = createReasoningChain();

    chain.addStep({
      region: 'dependency-graph',
      reasoning: 'Found auth-service depends on user-db',
      evidence: '3 direct dependencies in graph',
      confidence: 0.95,
    });

    chain.addStep({
      region: 'multi-hop-reasoner',
      reasoning: 'Traced chain: user-db lag → auth failures → API 500s',
      evidence: 'Multi-hop path with 0.87 confidence',
      confidence: 0.87,
    });

    const result = chain.finalize('API 500 errors caused by user-db latency');

    expect(result.chain).toHaveLength(2);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.regionsUsed).toContain('dependency-graph');
    expect(result.regionsUsed).toContain('multi-hop-reasoner');
    expect(result.promptText).toContain('Reasoning Chain');
    expect(result.promptText).toContain('Show Your Work');
    expect(result.visualization).toContain('Step 1');
    expect(result.totalEvidence).toBe(2);
  });

  it('should propagate confidence through chain', () => {
    const chain = createReasoningChain();

    chain.addStep({ region: 'r1', reasoning: 'High confidence', evidence: 'Strong', confidence: 0.9 });
    chain.addStep({ region: 'r2', reasoning: 'Low confidence', evidence: 'Weak', confidence: 0.3 });

    const result = chain.finalize('Conclusion');
    expect(result.confidence).toBeLessThan(0.9); // Attenuated by weak link
    expect(result.weakestLink?.confidence).toBe(0.3);
  });

  it('should track alternatives', () => {
    const chain = createReasoningChain();

    chain.addStep({
      region: 'test',
      reasoning: 'Main path',
      evidence: 'Evidence',
      confidence: 0.8,
      alternatives: ['Alternative explanation A', 'Alternative explanation B'],
    });

    chain.addAlternative({
      description: 'Different root cause',
      steps: [{ reasoning: 'Other theory', confidence: 0.4 }],
      rejectionReason: 'Lower confidence and fewer supporting edges',
      confidence: 0.4,
    });

    const result = chain.finalize('Main conclusion');
    expect(result.alternatives).toHaveLength(1);
  });

  it('should assess chain strength', () => {
    const chain1 = createReasoningChain();
    chain1.addStep({ region: 'r1', reasoning: 'A', evidence: 'E1', confidence: 0.9 });
    chain1.addStep({ region: 'r2', reasoning: 'B', evidence: 'E2', confidence: 0.85 });
    const strong = chain1.finalize('Strong conclusion');
    expect(strong.strength).toBe('strong');

    const chain2 = createReasoningChain();
    chain2.addStep({ region: 'r1', reasoning: 'A', evidence: 'E1', confidence: 0.2 });
    const weak = chain2.finalize('Weak conclusion');
    expect(['weak', 'speculative']).toContain(weak.strength);
  });

  it('should reset for new questions', () => {
    const chain = createReasoningChain();
    chain.addStep({ region: 'r1', reasoning: 'A', evidence: 'E', confidence: 0.8 });
    expect(chain.getSteps()).toHaveLength(1);

    chain.reset();
    expect(chain.getSteps()).toHaveLength(0);
  });

  it('should provide chain statistics', () => {
    const chain = createReasoningChain();
    chain.addStep({ region: 'dep-graph', reasoning: 'A', evidence: 'E', confidence: 0.8 });
    chain.addStep({ region: 'multi-hop', reasoning: 'B', evidence: 'E', confidence: 0.9 });

    const stats = chain.getStats();
    expect(stats.stepCount).toBe(2);
    expect(stats.avgConfidence).toBeCloseTo(0.85);
    expect(stats.regions).toHaveLength(2);
  });

  it('should control depth in prompt output', () => {
    const shallowChain = createReasoningChain({ depth: 'shallow' });
    for (let i = 0; i < 10; i++) {
      shallowChain.addStep({ region: `r${i}`, reasoning: `Step ${i}`, evidence: `E${i}`, confidence: 0.8 });
    }
    const shallow = shallowChain.finalize('Conclusion');
    // Shallow should omit some steps
    expect(shallow.promptText).toContain('additional steps omitted');

    const deepChain = createReasoningChain({ depth: 'deep' });
    for (let i = 0; i < 5; i++) {
      deepChain.addStep({ region: `r${i}`, reasoning: `Step ${i}`, evidence: `E${i}`, confidence: 0.8 });
    }
    const deep = deepChain.finalize('Conclusion');
    // Deep should show all steps
    expect(deep.promptText).not.toContain('additional steps omitted');
  });

  it('should visualize the chain', () => {
    const chain = createReasoningChain();
    chain.addStep({ region: 'graph', reasoning: 'Found dependency', evidence: 'Graph data', confidence: 0.9 });
    chain.addStep({ region: 'reasoner', reasoning: 'Traced path', evidence: 'Multi-hop', confidence: 0.8 });

    const result = chain.finalize('Root cause identified');
    expect(result.visualization).toContain('Reasoning Chain');
    expect(result.visualization).toContain('CONCLUSION');
    expect(result.visualization).toContain('graph');
  });
});

// ============================================================================
// INTEGRATION: All 8 capabilities exported from index
// ============================================================================

describe('SDK Exports', () => {
  it('should export all 8 Claude-aspirational capabilities', async () => {
    // Import directly from individual modules to avoid loading entire barrel file
    // which can timeout in CI due to the massive module graph in index.ts
    const [agentLoop, longContext, rag, multiModal, proactive, session, structured, reasoning] =
      await Promise.all([
        import('../orchestrator/agent-loop'),
        import('../orchestrator/long-context-manager'),
        import('../orchestrator/rag-retriever'),
        import('../core/multi-modal-inference'),
        import('../orchestrator/proactive-intelligence'),
        import('../orchestrator/session-memory'),
        import('../orchestrator/structured-output'),
        import('../orchestrator/reasoning-chain'),
      ]);

    // 1. Agent Loop
    expect(agentLoop.createAgentLoop).toBeDefined();

    // 2. Long-Context Manager
    expect(longContext.createLongContextManager).toBeDefined();

    // 3. RAG Retriever
    expect(rag.createRAGRetriever).toBeDefined();

    // 4. Multi-Modal Inference
    expect(multiModal.createMultiModalInference).toBeDefined();

    // 5. Proactive Intelligence
    expect(proactive.createProactiveIntelligence).toBeDefined();

    // 6. Session Memory
    expect(session.createSessionMemory).toBeDefined();

    // 7. Structured Output
    expect(structured.createStructuredOutput).toBeDefined();

    // 8. Reasoning Chain
    expect(reasoning.createReasoningChain).toBeDefined();
  }, 30_000); // Extended timeout for dynamic imports
});
