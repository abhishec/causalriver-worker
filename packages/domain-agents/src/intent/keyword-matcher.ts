/**
 * Keyword Matcher
 *
 * Fast keyword-based intent classification using tokenization and scoring.
 */

import type { ModuleDefinition, ModuleRegistry, IntentClassification } from '../types';

/**
 * Pre-processed keyword index for fast lookups
 */
export interface KeywordIndex {
  /** Map of normalized keyword -> module IDs */
  keywordToModules: Map<string, string[]>;

  /** Map of module ID -> its normalized keywords */
  moduleKeywords: Map<string, Set<string>>;

  /** All unique keywords */
  allKeywords: Set<string>;
}

/**
 * Build a keyword index from a module registry
 */
export function buildKeywordIndex(registry: ModuleRegistry): KeywordIndex {
  const keywordToModules = new Map<string, string[]>();
  const moduleKeywords = new Map<string, Set<string>>();
  const allKeywords = new Set<string>();

  for (const [moduleId, module] of Object.entries(registry)) {
    const normalizedKeywords = new Set<string>();

    for (const keyword of module.keywords) {
      const normalized = normalizeKeyword(keyword);
      normalizedKeywords.add(normalized);
      allKeywords.add(normalized);

      // Map keyword to modules
      const existingModules = keywordToModules.get(normalized) || [];
      if (!existingModules.includes(moduleId)) {
        existingModules.push(moduleId);
      }
      keywordToModules.set(normalized, existingModules);
    }

    moduleKeywords.set(moduleId, normalizedKeywords);
  }

  return { keywordToModules, moduleKeywords, allKeywords };
}

/**
 * Normalize a keyword for matching
 */
function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Tokenize a query into matchable terms
 */
export function tokenizeQuery(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ');
  const tokens: string[] = [];

  // Single words
  tokens.push(...words);

  // Bigrams (two-word phrases)
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }

  // Trigrams (three-word phrases)
  for (let i = 0; i < words.length - 2; i++) {
    tokens.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  return tokens;
}

/**
 * Score configuration
 */
export interface MatchingConfig {
  /** Weight for exact keyword matches (default: 1.0) */
  exactMatchWeight?: number;

  /** Weight for partial matches (default: 0.5) */
  partialMatchWeight?: number;

  /** Minimum confidence to accept (default: 0.3) */
  minConfidence?: number;

  /** Boost for multi-word matches (default: 1.5) */
  multiWordBoost?: number;
}

/**
 * Match score for a module
 */
interface ModuleScore {
  moduleId: string;
  score: number;
  matchedKeywords: string[];
  exactMatches: number;
  partialMatches: number;
}

/**
 * Match a query against the keyword index
 */
export function matchKeywords(
  query: string,
  index: KeywordIndex,
  registry: ModuleRegistry,
  config: MatchingConfig = {}
): IntentClassification {
  const {
    exactMatchWeight = 1.0,
    partialMatchWeight = 0.5,
    minConfidence = 0.3,
    multiWordBoost = 1.5
  } = config;

  const tokens = tokenizeQuery(query);
  const moduleScores = new Map<string, ModuleScore>();

  // Initialize scores for all modules
  for (const moduleId of Object.keys(registry)) {
    moduleScores.set(moduleId, {
      moduleId,
      score: 0,
      matchedKeywords: [],
      exactMatches: 0,
      partialMatches: 0
    });
  }

  // Score each token
  for (const token of tokens) {
    // Check for exact matches
    const exactModules = index.keywordToModules.get(token);
    if (exactModules) {
      const weight = token.includes(' ') ? exactMatchWeight * multiWordBoost : exactMatchWeight;
      for (const moduleId of exactModules) {
        const score = moduleScores.get(moduleId)!;
        score.score += weight;
        score.exactMatches++;
        if (!score.matchedKeywords.includes(token)) {
          score.matchedKeywords.push(token);
        }
      }
    }

    // Check for partial matches (token is part of a keyword or vice versa)
    for (const [keyword, modules] of index.keywordToModules.entries()) {
      if (keyword !== token && (keyword.includes(token) || token.includes(keyword))) {
        for (const moduleId of modules) {
          const score = moduleScores.get(moduleId)!;
          score.score += partialMatchWeight;
          score.partialMatches++;
        }
      }
    }
  }

  // Convert to sorted array
  const sortedScores = Array.from(moduleScores.values())
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (sortedScores.length === 0) {
    // No matches - return executive as default with low confidence
    return {
      modules: ['executive'],
      primaryModule: 'executive',
      confidence: 0.1,
      matchedKeywords: [],
      isCrossDomain: false,
      method: 'keyword'
    };
  }

  // Calculate normalized confidence
  const topScore = sortedScores[0].score;
  const maxPossibleScore = tokens.length * exactMatchWeight * multiWordBoost;
  const confidence = Math.min(topScore / Math.max(maxPossibleScore, 1), 1);

  // Determine if cross-domain (multiple modules with similar scores)
  const relevantModules = sortedScores
    .filter(s => s.score >= topScore * 0.5) // Within 50% of top score
    .map(s => s.moduleId);

  const isCrossDomain = relevantModules.length > 1;

  // Determine primary module
  const primaryModule = sortedScores[0].moduleId;

  // Get suggested persona
  const suggestedPersona = getPrimaryPersonaId(primaryModule);

  return {
    modules: relevantModules,
    primaryModule,
    confidence: Math.max(confidence, minConfidence),
    matchedKeywords: sortedScores[0].matchedKeywords,
    suggestedPersona,
    isCrossDomain,
    method: 'keyword'
  };
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
 * Quick check if a query might relate to a specific module
 */
export function quickModuleCheck(
  query: string,
  moduleId: string,
  index: KeywordIndex
): boolean {
  const moduleKeywords = index.moduleKeywords.get(moduleId);
  if (!moduleKeywords) return false;

  const tokens = tokenizeQuery(query);
  return tokens.some(token => moduleKeywords.has(token));
}

/**
 * Get all matching keywords for a query
 */
export function getMatchingKeywords(
  query: string,
  index: KeywordIndex
): { keyword: string; modules: string[] }[] {
  const tokens = tokenizeQuery(query);
  const matches: { keyword: string; modules: string[] }[] = [];

  for (const token of tokens) {
    const modules = index.keywordToModules.get(token);
    if (modules) {
      matches.push({ keyword: token, modules });
    }
  }

  return matches;
}
