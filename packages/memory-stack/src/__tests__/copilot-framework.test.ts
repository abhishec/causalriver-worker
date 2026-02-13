/**
 * CopilotFramework V2 — Comprehensive Test Suite
 * ================================================
 *
 * Tests the pure-logic portions of the CopilotFramework:
 *   - formatDataPoint (8 format variants)
 *   - detectCopilotIntent (scored keyword detection)
 *   - buildNumberRegistry (quality-gate number extraction)
 *   - validateResponse (quality-gate post-gen validation)
 *   - createConversationManager (LRU/TTL eviction, message capping)
 *   - createCopilotSSEStream (write-after-close guards)
 *   - buildCopilotPrompt (3-layer prompt architect)
 *   - createCopilotInstance (factory validation)
 *
 * Does NOT test Anthropic SDK integration (requires live API key).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  COPILOT_FRAMEWORK_VERSION,
  createCopilotInstance,
  createConversationManager,
  createCopilotSSEStream,
  buildCopilotPrompt,
  detectCopilotIntent,
  formatDataPoint,
  buildNumberRegistry,
  validateResponse,
  type DomainAdapter,
  type CopilotPersona,
  type CopilotDataSnapshot,
  type CopilotInsightBundle,
  type CopilotIntent,
  type DataPoint,
  type BrainInsight,
  type OutputSection,
  type CopilotConfig,
} from '../orchestrator/copilot-framework';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockAdapter(overrides?: Partial<DomainAdapter>): DomainAdapter {
  const persona: CopilotPersona = {
    name: 'Test Copilot',
    role: 'Test Role',
    expertise: ['testing'],
    responseStyle: 'concise',
    dataSources: ['test-data'],
    rules: ['be accurate'],
  };

  return {
    domain: 'test',
    displayName: 'Test',
    persona,
    getDataSnapshot: () => ({
      kpis: [
        { key: 'revenue', label: 'Revenue', value: 1500000, format: 'currency' as const },
        { key: 'growth', label: 'Growth', value: 15.5, format: 'percentage' as const },
      ],
    }),
    getInsights: () => ({
      insights: [
        {
          id: 'i1',
          severity: 'high' as const,
          category: 'test',
          title: 'Test Insight',
          description: 'Revenue grew by 15.5% this quarter reaching $1.5M',
          confidence: 0.9,
          evidence: [{ key: 'rev', label: 'Revenue', value: 1500000, format: 'currency' as const }],
        },
      ],
      risks: [],
      actions: [],
      bottomLine: 'Test bottom line with $1.5M revenue',
    }),
    getOutputSections: (_intent) => [
      {
        id: 'summary',
        title: 'Summary',
        type: 'narrative' as const,
        priority: 1,
        required: true,
        instructions: 'Summarize the data',
        data: { narrative: 'Test narrative' },
      },
      {
        id: 'details',
        title: 'Details',
        type: 'table' as const,
        priority: 2,
        required: false,
        relevantIntents: ['analyze' as CopilotIntent, 'deep_dive' as CopilotIntent],
        instructions: 'Show details',
        data: { table: { columns: ['A', 'B'], rows: [['1', '2']] } },
      },
    ],
    getQualityRules: () => ['Rule 1: be accurate', 'Rule 2: cite numbers'],
    ...overrides,
  };
}

function createMockDataSnapshot(overrides?: Partial<CopilotDataSnapshot>): CopilotDataSnapshot {
  return {
    kpis: [
      { key: 'revenue', label: 'Revenue', value: 1500000, format: 'currency' as const },
      { key: 'growth', label: 'Growth', value: 15.5, format: 'percentage' as const },
    ],
    ...overrides,
  };
}

function createMockInsightBundle(overrides?: Partial<CopilotInsightBundle>): CopilotInsightBundle {
  return {
    insights: [
      {
        id: 'i1',
        severity: 'high' as const,
        category: 'test',
        title: 'Test Insight',
        description: 'Revenue grew by 15.5% this quarter reaching $1.5M',
        confidence: 0.9,
        evidence: [{ key: 'rev', label: 'Revenue', value: 1500000, format: 'currency' as const }],
      },
    ],
    risks: [],
    actions: [],
    bottomLine: 'Test bottom line with $1.5M revenue',
    ...overrides,
  };
}

// ============================================================================
// 1. formatDataPoint
// ============================================================================

describe('formatDataPoint', () => {
  it('formats small currency values without suffix', () => {
    const dp: DataPoint = { key: 'cost', label: 'Cost', value: 500, format: 'currency' };
    expect(formatDataPoint(dp)).toBe('$500');
  });

  it('formats medium currency values with K suffix', () => {
    const dp: DataPoint = { key: 'cost', label: 'Cost', value: 25000, format: 'currency' };
    expect(formatDataPoint(dp)).toBe('$25K');
  });

  it('formats large currency values with M suffix', () => {
    const dp: DataPoint = { key: 'revenue', label: 'Revenue', value: 1500000, format: 'currency' };
    expect(formatDataPoint(dp)).toBe('$1.50M');
  });

  it('uses custom currency symbol when provided', () => {
    const dp: DataPoint = { key: 'revenue', label: 'Revenue', value: 25000, format: 'currency', currencySymbol: '\u20ac' };
    expect(formatDataPoint(dp)).toBe('\u20ac25K');
  });

  it('formats percentage values to one decimal place', () => {
    const dp: DataPoint = { key: 'rate', label: 'Rate', value: 42.567, format: 'percentage' };
    expect(formatDataPoint(dp)).toBe('42.6%');
  });

  it('formats integer values by rounding', () => {
    const dp: DataPoint = { key: 'count', label: 'Count', value: 42.7, format: 'integer' };
    expect(formatDataPoint(dp)).toBe('43');
  });

  it('formats decimal values to two places', () => {
    const dp: DataPoint = { key: 'ratio', label: 'Ratio', value: 3.14159, format: 'decimal' };
    expect(formatDataPoint(dp)).toBe('3.14');
  });

  it('formats duration values with unit', () => {
    const dp: DataPoint = { key: 'runway', label: 'Runway', value: 18, format: 'duration', unit: 'months' };
    expect(formatDataPoint(dp)).toBe('18 months');
  });

  it('formats raw values with unit appended', () => {
    const dp: DataPoint = { key: 'dau', label: 'DAU', value: 42, unit: 'users' };
    expect(formatDataPoint(dp)).toBe('42 users');
  });

  it('returns N/A for null values', () => {
    const dp: DataPoint = { key: 'missing', label: 'Missing', value: null };
    expect(formatDataPoint(dp)).toBe('N/A');
  });
});

// ============================================================================
// 2. detectCopilotIntent
// ============================================================================

describe('detectCopilotIntent', () => {
  it('detects diagnose intent from declining keyword (weight 2) + why (weight 1)', () => {
    const intent = detectCopilotIntent('why is revenue declining');
    expect(intent).toBe('diagnose');
  });

  it('detects predict intent', () => {
    const intent = detectCopilotIntent('predict next quarter revenue');
    expect(intent).toBe('predict');
  });

  it('detects compare intent', () => {
    const intent = detectCopilotIntent('compare Q1 vs Q2 performance');
    expect(intent).toBe('compare');
  });

  it('detects recommend intent from multiple matching keywords', () => {
    const intent = detectCopilotIntent('should we cut marketing spend');
    expect(intent).toBe('recommend');
  });

  it('detects summarize intent', () => {
    const intent = detectCopilotIntent('give me a quick overview');
    expect(intent).toBe('summarize');
  });

  it('detects deep_dive intent', () => {
    const intent = detectCopilotIntent('comprehensive full analysis of all data');
    expect(intent).toBe('deep_dive');
  });

  it('falls back to general for unrecognized messages', () => {
    const intent = detectCopilotIntent('hello');
    expect(intent).toBe('general');
  });

  it('returns a valid intent when scores tie between predict and recommend', () => {
    // "should" (weight 2 for recommend) vs "predict" (weight 2 for predict)
    // Both score 2 — whichever comes first in the Map iteration wins
    const intent = detectCopilotIntent('should we predict');
    expect(['predict', 'recommend']).toContain(intent);
  });
});

// ============================================================================
// 3. buildNumberRegistry
// ============================================================================

describe('buildNumberRegistry', () => {
  it('contains exact KPI values as strings', () => {
    const data = createMockDataSnapshot();
    const insights = createMockInsightBundle({ insights: [], bottomLine: '' });
    const registry = buildNumberRegistry(data, insights);

    expect(registry.has('1500000')).toBe(true);
    expect(registry.has('15.5')).toBe(true);
  });

  it('contains formatted variants for large numbers', () => {
    const data = createMockDataSnapshot();
    const insights = createMockInsightBundle({ insights: [], bottomLine: '' });
    const registry = buildNumberRegistry(data, insights);

    // 1500000 -> /1000000 -> 1.50, 1.5
    expect(registry.has('1.50')).toBe(true);
    expect(registry.has('1.5')).toBe(true);
    // 1500000 -> /1000 -> 1500
    expect(registry.has('1500')).toBe(true);
  });

  it('extracts numbers from insight descriptions', () => {
    const data = createMockDataSnapshot({ kpis: [] });
    const insights = createMockInsightBundle();
    const registry = buildNumberRegistry(data, insights);

    // Description: 'Revenue grew by 15.5% this quarter reaching $1.5M'
    // Extracted: '15.5', '1.5'
    expect(registry.has('15.5')).toBe(true);
    expect(registry.has('1.5')).toBe(true);
  });

  it('contains evidence values from insights', () => {
    const data = createMockDataSnapshot({ kpis: [] });
    const insights = createMockInsightBundle();
    const registry = buildNumberRegistry(data, insights);

    // Evidence value: 1500000
    expect(registry.has('1500000')).toBe(true);
  });

  it('handles empty data without crashing', () => {
    const data: CopilotDataSnapshot = { kpis: [] };
    const insights: CopilotInsightBundle = {
      insights: [],
      risks: [],
      actions: [],
      bottomLine: '',
    };
    const registry = buildNumberRegistry(data, insights);
    expect(registry.size).toBe(0);
  });
});

// ============================================================================
// 4. validateResponse
// ============================================================================

describe('validateResponse', () => {
  it('passes when all numbers are grounded', () => {
    const registry = new Set(['1500000', '15.5', '1500', '1.50']);
    const response = 'Revenue is $1500000 with 15.5% growth reaching $1500K or $1.50M.';
    const result = validateResponse(response, registry, []);

    expect(result.passed).toBe(true);
    expect(result.groundingRatio).toBe(1.0);
  });

  it('passes when grounding ratio is at 70% threshold', () => {
    // 7 grounded, 3 ungrounded = 70%
    const registry = new Set(['10', '20', '30', '40', '50', '60', '70']);
    const response = 'Numbers: 10 20 30 40 50 60 70 999 888 777';
    const result = validateResponse(response, registry, []);

    expect(result.passed).toBe(true);
    expect(result.groundingRatio).toBeCloseTo(0.7, 1);
  });

  it('fails when grounding ratio is below 70%', () => {
    // 1 grounded out of 4 significant = 25%
    const registry = new Set(['100']);
    const response = 'Numbers: 100 200 300 400';
    const result = validateResponse(response, registry, []);

    expect(result.passed).toBe(false);
    expect(result.groundingRatio).toBeLessThan(0.7);
  });

  it('fails when required sections are missing', () => {
    const registry = new Set<string>();
    const response = 'Here is some text about the analysis.';
    const result = validateResponse(response, registry, ['Executive Summary', 'Risk Analysis']);

    expect(result.passed).toBe(false);
    expect(result.missingSections).toContain('Executive Summary');
    expect(result.missingSections).toContain('Risk Analysis');
  });

  it('filters out small numbers (1-9) from significance check', () => {
    const registry = new Set(['100']);
    // Integers 1, 2, 3 without decimals are small and should be filtered; 100 is grounded
    const response = 'Step 1 of 3 items, total 2 categories, Revenue is 100';
    const result = validateResponse(response, registry, []);

    expect(result.passed).toBe(true);
    expect(result.groundingRatio).toBe(1.0);
    // Only '100' counts as significant (1, 3, 2 are all < 10 without decimals)
    expect(result.totalNumbers).toBe(1);
  });

  it('passes for empty response (no numbers to validate)', () => {
    const registry = new Set(['100']);
    const result = validateResponse('', registry, []);

    expect(result.passed).toBe(true);
    expect(result.groundingRatio).toBe(1);
    expect(result.totalNumbers).toBe(0);
  });
});

// ============================================================================
// 5. createConversationManager
// ============================================================================

describe('createConversationManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new conversation on first access', () => {
    const manager = createConversationManager();
    const conv = manager.getOrCreate('conv-1');

    expect(conv.id).toBe('conv-1');
    expect(conv.messages).toHaveLength(0);
    expect(conv.topicsDiscussed).toHaveLength(0);
  });

  it('stores messages via addMessage', () => {
    const manager = createConversationManager();
    manager.addMessage('conv-1', 'user', 'Hello there', 'general');
    manager.addMessage('conv-1', 'assistant', 'Hi! How can I help?');

    const history = manager.getRecentHistory('conv-1', 10);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('Hello there');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toBe('Hi! How can I help?');
  });

  it('getRecentHistory returns only last N messages', () => {
    const manager = createConversationManager();
    for (let i = 0; i < 10; i++) {
      manager.addMessage('conv-1', 'user', `Message ${i}`);
    }

    const history = manager.getRecentHistory('conv-1', 3);
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('Message 7');
    expect(history[1].content).toBe('Message 8');
    expect(history[2].content).toBe('Message 9');
  });

  it('evicts conversations past TTL', () => {
    const ttlMs = 1000; // 1 second TTL
    const manager = createConversationManager({ ttlMs });

    // Create an old conversation at time T=1000
    const mockNow = vi.spyOn(Date, 'now');
    mockNow.mockReturnValue(1000);
    manager.addMessage('old-conv', 'user', 'old message');

    // Move time forward past TTL and create a new conversation
    mockNow.mockReturnValue(3000); // 2 seconds later, past 1s TTL
    manager.addMessage('new-conv', 'user', 'new message');

    // The old conversation should have been evicted during getOrCreate
    const stats = manager.getStats();
    // old-conv was evicted by TTL when new-conv was created
    expect(stats.activeConversations).toBe(1);

    // Accessing the old conversation creates a fresh one
    const oldConv = manager.getOrCreate('old-conv');
    expect(oldConv.messages).toHaveLength(0); // Fresh, no old messages
  });

  it('caps messages per conversation at maxMessagesPerConversation', () => {
    const manager = createConversationManager({ maxMessagesPerConversation: 50 });

    for (let i = 0; i < 60; i++) {
      manager.addMessage('conv-1', 'user', `Message ${i}`);
    }

    const conv = manager.getOrCreate('conv-1');
    expect(conv.messages).toHaveLength(50);
    // Should retain the last 50 (messages 10-59)
    expect(conv.messages[0].content).toBe('Message 10');
    expect(conv.messages[49].content).toBe('Message 59');
  });

  it('evicts oldest conversations via LRU when over maxEntries', () => {
    // maxEntries=2: when the 3rd conversation is created, evict() runs
    // and sees size=2 which is NOT > 2, so no LRU eviction yet.
    // After insertion, size becomes 3. But eviction only runs on next getOrCreate.
    // So with maxEntries=2, creating conv-3 triggers eviction with size=2 (not > 2).
    // We need to create enough that eviction actually triggers:
    // With maxEntries=2, creating conv-1 (size 0->1), conv-2 (size 1->2),
    // conv-3: evict() sees size=2, 2 > 2 is false, so creates (size=3).
    // conv-4: evict() sees size=3, 3 > 2 is true, LRU removes 1 (oldest), size=2, creates (size=3).
    const manager = createConversationManager({ maxEntries: 2, ttlMs: 999999 });

    const mockNow = vi.spyOn(Date, 'now');
    mockNow.mockReturnValue(1000);
    manager.addMessage('conv-1', 'user', 'First');

    mockNow.mockReturnValue(2000);
    manager.addMessage('conv-2', 'user', 'Second');

    mockNow.mockReturnValue(3000);
    manager.addMessage('conv-3', 'user', 'Third');

    // At this point, size=3 which is > maxEntries=2
    // Creating conv-4 triggers eviction: removes conv-1 (oldest), size goes to 2, then inserts conv-4 (size=3)
    mockNow.mockReturnValue(4000);
    manager.addMessage('conv-4', 'user', 'Fourth');

    // conv-1 should have been evicted (oldest lastAccessed=1000)
    // After eviction and insertion: conv-2, conv-3, conv-4 remain...
    // Actually eviction removes (3 - 2) = 1 entry, leaving 2, then adds 1 = 3
    // Let's just verify conv-1 was evicted
    const conv1 = manager.getOrCreate('conv-1');
    expect(conv1.messages).toHaveLength(0); // Fresh, no old messages = was evicted
  });

  it('clear() removes a conversation', () => {
    const manager = createConversationManager();
    manager.addMessage('conv-1', 'user', 'Hello');
    manager.clear('conv-1');

    const stats = manager.getStats();
    expect(stats.activeConversations).toBe(0);

    // Accessing it again creates a fresh conversation
    const conv = manager.getOrCreate('conv-1');
    expect(conv.messages).toHaveLength(0);
  });

  it('getStats() returns correct counts and config', () => {
    const manager = createConversationManager({ maxEntries: 100, ttlMs: 60000 });
    manager.addMessage('conv-1', 'user', 'Hello');
    manager.addMessage('conv-2', 'user', 'World');

    const stats = manager.getStats();
    expect(stats.activeConversations).toBe(2);
    expect(stats.maxEntries).toBe(100);
    expect(stats.ttlMs).toBe(60000);
  });
});

// ============================================================================
// 6. createCopilotSSEStream
// ============================================================================

describe('createCopilotSSEStream', () => {
  it('sendText sends JSON with text field', async () => {
    const sse = createCopilotSSEStream();
    sse.sendText('Hello World');
    sse.close();

    const reader = sse.stream.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('data: ');
    const jsonStr = text.replace('data: ', '').trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.text).toBe('Hello World');
  });

  it('sendError sends JSON with error field', async () => {
    const sse = createCopilotSSEStream();
    sse.sendError('Something went wrong');
    sse.close();

    const reader = sse.stream.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    const jsonStr = text.replace('data: ', '').trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.error).toBe('Something went wrong');
  });

  it('close() sends [DONE] marker and prevents further writes', async () => {
    const sse = createCopilotSSEStream();
    sse.sendText('Before close');
    sse.close();

    const reader = sse.stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    const fullOutput = chunks.join('');
    expect(fullOutput).toContain('[DONE]');
  });

  it('sendText after close is a no-op (does not throw)', () => {
    const sse = createCopilotSSEStream();
    sse.close();

    // Should not throw
    expect(() => sse.sendText('After close')).not.toThrow();
    expect(() => sse.sendError('After close error')).not.toThrow();
  });

  it('isOpen() returns true initially and false after close', () => {
    const sse = createCopilotSSEStream();
    expect(sse.isOpen()).toBe(true);

    sse.close();
    expect(sse.isOpen()).toBe(false);
  });
});

// ============================================================================
// 7. buildCopilotPrompt
// ============================================================================

describe('buildCopilotPrompt', () => {
  it('includes persona name in the prompt', () => {
    const adapter = createMockAdapter();
    const prompt = buildCopilotPrompt(adapter, 'general');

    expect(prompt).toContain('Test Copilot');
  });

  it('includes KPI data in the prompt', () => {
    const adapter = createMockAdapter();
    const prompt = buildCopilotPrompt(adapter, 'general');

    // Revenue: $1.50M
    expect(prompt).toContain('Revenue');
    expect(prompt).toContain('$1.50M');
    // Growth: 15.5%
    expect(prompt).toContain('Growth');
    expect(prompt).toContain('15.5%');
  });

  it('includes quality rules in the prompt', () => {
    const adapter = createMockAdapter();
    const prompt = buildCopilotPrompt(adapter, 'general');

    expect(prompt).toContain('Rule 1: be accurate');
    expect(prompt).toContain('Rule 2: cite numbers');
    expect(prompt).toContain('CRITICAL QUALITY RULES');
  });

  it('includes section instructions in the prompt', () => {
    const adapter = createMockAdapter();
    const prompt = buildCopilotPrompt(adapter, 'general');

    expect(prompt).toContain('Summarize the data');
  });

  it('filters sections by relevantIntents when intent is not deep_dive or general', () => {
    const adapter = createMockAdapter();

    // 'summarize' intent: the 'Details' section has relevantIntents=['analyze','deep_dive']
    // so it should NOT appear for 'summarize'
    const prompt = buildCopilotPrompt(adapter, 'summarize');
    expect(prompt).toContain('Summary'); // No relevantIntents filter -> shown for all
    expect(prompt).not.toContain('Show details'); // 'Details' section filtered out

    // 'deep_dive' intent: all sections shown (deep_dive bypasses relevantIntents filter)
    const deepDivePrompt = buildCopilotPrompt(adapter, 'deep_dive');
    expect(deepDivePrompt).toContain('Show details');

    // 'analyze' intent: 'Details' section explicitly includes 'analyze'
    const analyzePrompt = buildCopilotPrompt(adapter, 'analyze');
    expect(analyzePrompt).toContain('Show details');
  });
});

// ============================================================================
// 8. createCopilotInstance
// ============================================================================

describe('createCopilotInstance', () => {
  it('throws on unsupported provider', () => {
    const adapter = createMockAdapter();
    expect(() =>
      createCopilotInstance({
        adapter,
        provider: 'openai' as any,
        apiKey: 'test-key',
      })
    ).toThrow('Unsupported LLM provider: "openai"');
  });

  it('getSystemPrompt returns a string containing persona name', () => {
    const adapter = createMockAdapter();
    const instance = createCopilotInstance({
      adapter,
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    const prompt = instance.getSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('Test Copilot');
  });

  it('getAdapter returns the adapter', () => {
    const adapter = createMockAdapter();
    const instance = createCopilotInstance({
      adapter,
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    expect(instance.getAdapter()).toBe(adapter);
    expect(instance.getAdapter().domain).toBe('test');
  });
});

// ============================================================================
// EXTRA: Framework version constant
// ============================================================================

describe('COPILOT_FRAMEWORK_VERSION', () => {
  it('is a valid semver string', () => {
    expect(COPILOT_FRAMEWORK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is version 2.x.x', () => {
    expect(COPILOT_FRAMEWORK_VERSION.startsWith('2.')).toBe(true);
  });
});

// ============================================================================
// EXTRA: Edge cases and integration-level pure logic
// ============================================================================

describe('buildNumberRegistry — section and trend data', () => {
  it('registers numbers from sections data', () => {
    const data = createMockDataSnapshot({
      kpis: [],
      sections: {
        'Unit Economics': [
          { key: 'cac', label: 'CAC', value: 350, format: 'currency' as const },
        ],
      },
    });
    const insights = createMockInsightBundle({ insights: [], bottomLine: '' });
    const registry = buildNumberRegistry(data, insights);

    expect(registry.has('350')).toBe(true);
  });

  it('registers numbers from trend data', () => {
    const data = createMockDataSnapshot({
      kpis: [],
      trends: [
        {
          period: 'Q1 2025',
          metrics: [
            { key: 'mrr', label: 'MRR', value: 42000, format: 'currency' as const },
          ],
        },
      ],
    });
    const insights = createMockInsightBundle({ insights: [], bottomLine: '' });
    const registry = buildNumberRegistry(data, insights);

    expect(registry.has('42000')).toBe(true);
    expect(registry.has('42')).toBe(true); // 42000/1000 = 42
  });
});

describe('validateResponse — edge cases', () => {
  it('detects required sections case-insensitively', () => {
    const registry = new Set<string>();
    const response = 'executive summary: Everything looks good.';
    const result = validateResponse(response, registry, ['Executive Summary']);

    expect(result.missingSections).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('caps ungrounded numbers at 20 for readability', () => {
    const registry = new Set<string>();
    // Generate a response with 25 ungrounded significant numbers
    const numbers = Array.from({ length: 25 }, (_, i) => `${(i + 1) * 100}`);
    const response = numbers.join(' ');
    const result = validateResponse(response, registry, []);

    expect(result.ungroundedNumbers.length).toBeLessThanOrEqual(20);
  });
});

describe('createConversationManager — topic extraction', () => {
  it('extracts topic keywords from user messages', () => {
    const manager = createConversationManager();
    manager.addMessage('conv-1', 'user', 'Tell me about revenue growth trends');

    const conv = manager.getOrCreate('conv-1');
    // Words > 4 chars, excluding stopwords: 'about' is excluded, 'revenue', 'growth', 'trends' qualify
    expect(conv.topicsDiscussed).toContain('revenue');
    expect(conv.topicsDiscussed).toContain('growth');
    expect(conv.topicsDiscussed).toContain('trends');
  });
});

describe('buildCopilotPrompt — data source attribution', () => {
  it('includes data source information from persona', () => {
    const adapter = createMockAdapter();
    const prompt = buildCopilotPrompt(adapter, 'general');

    expect(prompt).toContain('test-data');
    expect(prompt).toContain('REAL data from');
  });
});

describe('createCopilotSSEStream — additional methods', () => {
  it('sendMetadata sends JSON with metadata field', async () => {
    const sse = createCopilotSSEStream();
    sse.sendMetadata({ intent: 'analyze', domain: 'test' });
    sse.close();

    const reader = sse.stream.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    const jsonStr = text.replace('data: ', '').trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.metadata).toEqual({ intent: 'analyze', domain: 'test' });
  });
});

describe('detectCopilotIntent — additional patterns', () => {
  it('detects analyze intent from "analyze" keyword', () => {
    const intent = detectCopilotIntent('analyze our marketing performance');
    expect(intent).toBe('analyze');
  });

  it('prioritizes higher-weight matches over lower-weight', () => {
    // "root cause" has weight 2 for diagnose, "analyze" has weight 1
    const intent = detectCopilotIntent('analyze the root cause of churn');
    expect(intent).toBe('diagnose');
  });
});

describe('formatDataPoint — string values', () => {
  it('handles string value with currency format', () => {
    const dp: DataPoint = { key: 'rev', label: 'Revenue', value: 'TBD', format: 'currency' };
    expect(formatDataPoint(dp)).toBe('$TBD');
  });

  it('handles duration format with default unit when no unit specified', () => {
    const dp: DataPoint = { key: 'time', label: 'Time', value: 12, format: 'duration' };
    expect(formatDataPoint(dp)).toBe('12 months');
  });

  it('handles raw format without unit', () => {
    const dp: DataPoint = { key: 'count', label: 'Count', value: 42 };
    expect(formatDataPoint(dp)).toBe('42');
  });
});

describe('createCopilotInstance — brainContext appended', () => {
  it('appends brainContext to system prompt', () => {
    const adapter = createMockAdapter();
    const instance = createCopilotInstance({
      adapter,
      provider: 'anthropic',
      apiKey: 'test-key',
      brainContext: 'Additional brain context: the company is a B2B SaaS startup',
    });

    const prompt = instance.getSystemPrompt();
    expect(prompt).toContain('Additional brain context: the company is a B2B SaaS startup');
  });
});
