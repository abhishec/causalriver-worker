/**
 * Mock AI Client for testing domain-agents modules that require AI classification.
 * Used by: classifier, domain-router
 */

import type { AIClientAdapter } from '../../types';

export function createMockAIClient(responses: Record<string, string> = {}): AIClientAdapter {
  let callCount = 0;
  const defaultResponse = JSON.stringify({
    primaryModule: 'executive',
    modules: ['executive'],
    confidence: 0.5,
    reasoning: 'Mock AI classification'
  });

  return {
    complete: async (prompt: string, _options?: { maxTokens?: number; temperature?: number }) => {
      callCount++;

      // Check if we have a pre-configured response for this prompt
      for (const [key, response] of Object.entries(responses)) {
        if (prompt.includes(key)) {
          return { content: response };
        }
      }

      return { content: defaultResponse };
    }
  };
}

/**
 * Create a mock AI client that always fails
 */
export function createFailingAIClient(): AIClientAdapter {
  return {
    complete: async () => {
      throw new Error('AI service unavailable');
    }
  };
}
