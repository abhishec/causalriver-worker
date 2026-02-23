/**
 * LLM Response Layer Tests
 *
 * Tests the enhanced copilot with conversation memory, multi-turn support,
 * context injection, and persona integration.
 *
 * Uses mock fetch to simulate LLM API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMResponseLayer } from '../orchestrator/llm-response-layer';
import type { NexusQueryResult } from '../orchestrator/nexus-orchestrator';
import { MODEL_DEEP } from '../infra/smart-model-router';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockNexusContext: NexusQueryResult = {
  searchResults: [
    { content: 'Churn data shows 15% increase', similarity: 0.9, metadata: {} },
    { content: 'Support tickets correlated with pricing changes', similarity: 0.7, metadata: {} },
  ],
  causalContext: 'pricing_changes → churn_increase (p=0.01, effect=0.65)',
  patternContext: 'Pattern: Price increases > 10% lead to churn spikes [85% confidence]',
  assembledContext: `## Causal Relationships
pricing_changes → churn_increase (p=0.01, effect=0.65)

## Patterns
Pattern: Price increases > 10% lead to churn spikes [85% confidence]

## RAG Context
Churn data shows 15% increase
---
Support tickets correlated with pricing changes`,
};

const mockAnthropicResponse = {
  content: [{ text: 'Based on causal analysis, churn is increasing due to pricing changes.' }],
  usage: { input_tokens: 150, output_tokens: 50 },
};

const mockOpenAIResponse = {
  choices: [{ message: { content: 'Churn is caused by pricing changes, according to the data.' } }],
  usage: { prompt_tokens: 150, completion_tokens: 50 },
};

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ============================================================================
// TESTS
// ============================================================================

describe('LLM Response Layer', () => {
  describe('createLLMResponseLayer', () => {
    it('should return an object with all expected methods', () => {
      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      expect(typeof llm.query).toBe('function');
      expect(typeof llm.continueConversation).toBe('function');
      expect(typeof llm.getConversation).toBe('function');
      expect(typeof llm.clearConversation).toBe('function');
      expect(typeof llm.loadConversation).toBe('function');
      expect(typeof llm.getActiveConversations).toBe('function');
    });
  });

  // ============================================================================
  // QUERY (ANTHROPIC)
  // ============================================================================

  describe('query (Anthropic)', () => {
    it('should send a query to Anthropic and return formatted result', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.query('Why is churn up?', mockNexusContext);

      expect(result.text).toBe('Based on causal analysis, churn is increasing due to pricing changes.');
      expect(result.conversationId).toMatch(/^conv_/);
      expect(result.usage.inputTokens).toBe(150);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('should track context sections used', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.query('Why is churn up?', mockNexusContext);

      // The assembled context includes causal arrows and confidence patterns
      expect(result.contextUsed.causalRelationships).toBeGreaterThan(0);
      expect(result.contextUsed.patterns).toBeGreaterThan(0);
    });

    it('should call Anthropic API with correct headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        model: MODEL_DEEP,
      });

      await llm.query('Test query', mockNexusContext);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });
  });

  // ============================================================================
  // QUERY (OPENAI)
  // ============================================================================

  describe('query (OpenAI)', () => {
    it('should send a query to OpenAI and return formatted result', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockOpenAIResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'openai',
        apiKey: 'sk-openai-test',
      });

      const result = await llm.query('Why is churn up?', mockNexusContext);

      expect(result.text).toBe('Churn is caused by pricing changes, according to the data.');
      expect(result.usage.inputTokens).toBe(150);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('should call OpenAI API with correct headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockOpenAIResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'openai',
        apiKey: 'sk-openai-test',
      });

      await llm.query('Test query', mockNexusContext);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-openai-test',
          }),
        })
      );
    });
  });

  // ============================================================================
  // CONVERSATION MANAGEMENT
  // ============================================================================

  describe('Conversation Management', () => {
    it('should store conversation history in memory', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.query('Why is churn up?', mockNexusContext, {
        conversationId: 'conv_test',
      });

      const history = llm.getConversation('conv_test');
      expect(history).toHaveLength(2); // user + assistant
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Why is churn up?');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe(result.text);
    });

    it('should support multi-turn conversations', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          json: () => Promise.resolve({
            content: [{ text: `Response ${callCount}` }],
            usage: { input_tokens: 100, output_tokens: 30 },
          }),
        });
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      // First message
      await llm.query('Why is churn up?', mockNexusContext, {
        conversationId: 'multi_turn',
      });

      // Second message (continue conversation)
      await llm.continueConversation('multi_turn', 'What about support?', mockNexusContext);

      const history = llm.getConversation('multi_turn');
      expect(history).toHaveLength(4); // 2 user + 2 assistant
      expect(history[0].content).toBe('Why is churn up?');
      expect(history[2].content).toBe('What about support?');
    });

    it('should clear conversation history', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      await llm.query('Test', mockNexusContext, { conversationId: 'to_clear' });
      expect(llm.getConversation('to_clear')).toHaveLength(2);

      llm.clearConversation('to_clear');
      expect(llm.getConversation('to_clear')).toHaveLength(0);
    });

    it('should track active conversations', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      await llm.query('Q1', mockNexusContext, { conversationId: 'conv_a' });
      await llm.query('Q2', mockNexusContext, { conversationId: 'conv_b' });

      const active = llm.getActiveConversations();
      expect(active).toContain('conv_a');
      expect(active).toContain('conv_b');
      expect(active).toHaveLength(2);
    });

    it('should auto-generate conversation ID when not provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.query('Test', mockNexusContext);
      expect(result.conversationId).toMatch(/^conv_\d+_[a-z0-9]+$/);
    });
  });

  // ============================================================================
  // CONTEXT INJECTION
  // ============================================================================

  describe('Context Injection', () => {
    it('should include assembled context in system prompt', async () => {
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
        capturedBody = JSON.parse(options.body);
        return Promise.resolve({
          json: () => Promise.resolve(mockAnthropicResponse),
        });
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      await llm.query('Why is churn up?', mockNexusContext);

      // System prompt should include the assembled context (prompt caching wraps in array)
      const systemText = Array.isArray(capturedBody.system) ? capturedBody.system[0].text : capturedBody.system;
      expect(systemText).toContain('pricing_changes');
      expect(systemText).toContain('Causal Relationships');
    });

    it('should use custom system prompt prefix', async () => {
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
        capturedBody = JSON.parse(options.body);
        return Promise.resolve({
          json: () => Promise.resolve(mockAnthropicResponse),
        });
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
        systemPromptPrefix: 'You are a custom brain assistant.',
      });

      await llm.query('Test', mockNexusContext);

      // System prompt uses prompt caching format (array)
      const systemText2 = Array.isArray(capturedBody.system) ? capturedBody.system[0].text : capturedBody.system;
      expect(systemText2).toContain('You are a custom brain assistant.');
    });
  });

  // ============================================================================
  // LOAD CONVERSATION FROM DB
  // ============================================================================

  describe('loadConversation', () => {
    it('should return empty array when no repository configured', async () => {
      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.loadConversation('conv_123');
      expect(result).toEqual([]);
    });

    it('should load and store conversation from repository', async () => {
      const mockRepo = {
        getConversation: vi.fn().mockResolvedValue([
          { role: 'user', content: 'Hello', created_at: '2025-02-01T00:00:00Z', tokens_used: 5, context_snapshot: {} },
          { role: 'assistant', content: 'Hi there!', created_at: '2025-02-01T00:00:01Z', tokens_used: 8, context_snapshot: {} },
        ]),
        appendConversation: vi.fn(),
        logActivity: vi.fn().mockResolvedValue(undefined),
      };

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
        repository: mockRepo as any,
      });

      const messages = await llm.loadConversation('conv_db');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');

      // Should also be in memory now
      const history = llm.getConversation('conv_db');
      expect(history).toHaveLength(2);
    });
  });

  // ============================================================================
  // EMPTY CONTEXT
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty assembled context', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockAnthropicResponse),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const emptyContext: NexusQueryResult = {
        searchResults: [],
        causalContext: '',
        patternContext: '',
        assembledContext: '',
      };

      const result = await llm.query('Hello', emptyContext);
      expect(result.text).toBeTruthy();
      expect(result.contextUsed.causalRelationships).toBe(0);
      expect(result.contextUsed.patterns).toBe(0);
      expect(result.contextUsed.ragResults).toBe(0);
    });

    it('should handle API returning empty response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ content: [], usage: {} }),
      }) as any;

      const llm = createLLMResponseLayer({
        provider: 'anthropic',
        apiKey: 'test-key',
      });

      const result = await llm.query('Test', mockNexusContext);
      expect(result.text).toBe('');
      expect(result.usage.inputTokens).toBe(0);
    });
  });
});
