/**
 * Intent Classifier
 *
 * Main intent classification engine that combines keyword matching
 * with optional AI fallback for ambiguous queries.
 */

import type {
  IntentClassification,
  IntentClassifierConfig,
  ModuleRegistry,
  AIClientAdapter
} from '../types';
import {
  buildKeywordIndex,
  matchKeywords,
  type KeywordIndex,
  type MatchingConfig
} from './keyword-matcher';

/**
 * Intent classifier instance
 */
export interface IntentClassifier {
  /** Classify using keywords only (fast, synchronous) */
  classifyByKeywords(query: string): IntentClassification;

  /** Classify using AI (slower, more accurate for ambiguous queries) */
  classifyWithAI(query: string): Promise<IntentClassification>;

  /** Combined classification (keywords first, AI fallback) */
  classify(query: string): Promise<IntentClassification>;

  /** Get the keyword index for debugging */
  getIndex(): KeywordIndex;

  /** Rebuild the index (e.g., after registry changes) */
  rebuildIndex(): void;
}

/**
 * Create an intent classifier
 */
export function createIntentClassifier(config: IntentClassifierConfig): IntentClassifier {
  const {
    modules,
    aiClient,
    keywordConfidenceThreshold = 0.6,
    useAIFallback = true
  } = config;

  let index = buildKeywordIndex(modules);

  const matchingConfig: MatchingConfig = {
    exactMatchWeight: 1.0,
    partialMatchWeight: 0.5,
    minConfidence: 0.3,
    multiWordBoost: 1.5
  };

  /**
   * Classify using keywords only
   */
  function classifyByKeywords(query: string): IntentClassification {
    return matchKeywords(query, index, modules, matchingConfig);
  }

  /**
   * Classify using AI
   */
  async function classifyWithAI(query: string): Promise<IntentClassification> {
    if (!aiClient) {
      // No AI client - fall back to keyword classification
      const result = classifyByKeywords(query);
      return { ...result, method: 'keyword' };
    }

    try {
      const prompt = buildAIClassificationPrompt(query, modules);
      const response = await aiClient.complete(prompt, {
        maxTokens: 500,
        temperature: 0.3
      });

      const parsed = parseAIResponse(response.content, modules);
      return {
        ...parsed,
        method: 'ai'
      };
    } catch (error) {
      // AI failed - fall back to keywords
      console.warn('[IntentClassifier] AI classification failed, using keywords:', error);
      const result = classifyByKeywords(query);
      return { ...result, method: 'keyword' };
    }
  }

  /**
   * Combined classification
   */
  async function classify(query: string): Promise<IntentClassification> {
    // First try keywords
    const keywordResult = classifyByKeywords(query);

    // If confidence is high enough, use keyword result
    if (keywordResult.confidence >= keywordConfidenceThreshold) {
      return keywordResult;
    }

    // If AI fallback is disabled or no client, return keyword result
    if (!useAIFallback || !aiClient) {
      return keywordResult;
    }

    // Try AI classification
    const aiResult = await classifyWithAI(query);

    // Use AI result if confidence is higher
    if (aiResult.confidence > keywordResult.confidence) {
      return { ...aiResult, method: 'hybrid' };
    }

    return keywordResult;
  }

  return {
    classifyByKeywords,
    classifyWithAI,
    classify,
    getIndex: () => index,
    rebuildIndex: () => {
      index = buildKeywordIndex(modules);
    }
  };
}

/**
 * Build the AI classification prompt
 */
function buildAIClassificationPrompt(query: string, modules: ModuleRegistry): string {
  const moduleDescriptions = Object.entries(modules)
    .map(([id, m]) => `- ${id}: ${m.name} - ${m.description}`)
    .join('\n');

  return `You are an intent classifier for a business intelligence system. Given a user query, determine which module(s) are most relevant.

Available modules:
${moduleDescriptions}

User query: "${query}"

Respond in JSON format:
{
  "primaryModule": "<most relevant module id>",
  "modules": ["<list of relevant module ids>"],
  "confidence": <0-1 confidence score>,
  "reasoning": "<brief explanation>"
}

Rules:
1. primaryModule must be one of the module IDs listed above
2. modules array should include primaryModule and any related modules
3. confidence should reflect how clearly the query maps to the module(s)
4. Use "executive" for cross-domain or strategic queries`;
}

/**
 * Parse the AI response
 */
function parseAIResponse(
  response: string,
  modules: ModuleRegistry
): IntentClassification {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate module IDs
    const validModuleIds = Object.keys(modules);
    const primaryModule = validModuleIds.includes(parsed.primaryModule)
      ? parsed.primaryModule
      : 'executive';

    const relevantModules = (parsed.modules || [parsed.primaryModule])
      .filter((m: string) => validModuleIds.includes(m));

    if (relevantModules.length === 0) {
      relevantModules.push('executive');
    }

    return {
      modules: relevantModules,
      primaryModule,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      matchedKeywords: [],
      suggestedPersona: getPrimaryPersonaId(primaryModule),
      isCrossDomain: relevantModules.length > 1,
      method: 'ai'
    };
  } catch (error) {
    // Parse failed - return low-confidence executive fallback
    return {
      modules: ['executive'],
      primaryModule: 'executive',
      confidence: 0.3,
      matchedKeywords: [],
      suggestedPersona: 'nexus-ai',
      isCrossDomain: false,
      method: 'ai'
    };
  }
}

/**
 * Get the primary persona ID for a module
 */
function getPrimaryPersonaId(moduleId: string): string {
  const mapping: Record<string, string> = {
    finance: 'cfo',
    revenue: 'vp-sales',
    cs: 'vp-cs',
    am: 'vp-am',
    services: 'vp-services',
    product: 'vp-product',
    marketing: 'vp-marketing',
    people: 'vp-people',
    executive: 'nexus-ai'
  };
  return mapping[moduleId] || 'nexus-ai';
}

/**
 * Simple classifier that only uses keywords (no async, no AI)
 */
export function createSimpleClassifier(modules: ModuleRegistry): (query: string) => IntentClassification {
  const index = buildKeywordIndex(modules);
  return (query: string) => matchKeywords(query, index, modules);
}
