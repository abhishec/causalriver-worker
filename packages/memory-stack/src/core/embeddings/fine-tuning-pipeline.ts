/**
 * Fine-Tuning Pipeline Module
 * 
 * Enables learning organization-specific vocabulary and semantic
 * relationships to improve embedding quality over time.
 * 
 * Approach:
 * - Extract domain terms from organizational data
 * - Learn synonym relationships from co-occurrence
 * - Build contrastive pairs for fine-tuning
 * - Track vocabulary evolution over time
 * 
 * Note: Full fine-tuning requires external ML infrastructure.
 * This module prepares training data and manages vocabulary.
 */

import { 
  buildOrgVocabulary, 
  type OrgVocabulary, 
  type VocabularyTerm 
} from './neural-embedding-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface FineTuningConfig {
  /** Minimum term frequency to include in vocabulary */
  minTermFrequency: number;
  /** Maximum vocabulary size */
  maxVocabularySize: number;
  /** Co-occurrence window size for synonym detection */
  cooccurrenceWindow: number;
  /** Minimum co-occurrence for synonym relationship */
  minCooccurrence: number;
}

export interface TrainingPair {
  anchor: string;
  positive: string;
  negative?: string;
  domain: string;
  similarity: number;
}

export interface SynonymRelation {
  term1: string;
  term2: string;
  cooccurrenceCount: number;
  contextualSimilarity: number;
  domain: string;
}

export interface VocabularySnapshot {
  organizationId: string;
  timestamp: Date;
  termCount: number;
  terms: VocabularyTerm[];
  synonyms: SynonymRelation[];
  trainingPairs: TrainingPair[];
}

export interface FineTuningDataset {
  organizationId: string;
  createdAt: Date;
  trainingPairs: TrainingPair[];
  vocabulary: OrgVocabulary;
  synonyms: SynonymRelation[];
  stats: DatasetStats;
}

export interface DatasetStats {
  totalPairs: number;
  uniqueTerms: number;
  synonymCount: number;
  domainDistribution: Record<string, number>;
  averageSimilarity: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: FineTuningConfig = {
  minTermFrequency: 3,
  maxVocabularySize: 5000,
  cooccurrenceWindow: 5,
  minCooccurrence: 2
};

// ============================================================================
// FINE-TUNING PIPELINE
// ============================================================================

/**
 * Create a fine-tuning pipeline for organizational vocabulary
 */
export function createFineTuningPipeline(
  config: Partial<FineTuningConfig> = {}
) {
  const fullConfig: FineTuningConfig = { ...DEFAULT_CONFIG, ...config };
  
  let vocabulary: OrgVocabulary | null = null;
  let synonyms: SynonymRelation[] = [];
  let trainingPairs: TrainingPair[] = [];
  
  /**
   * Process organizational texts to build vocabulary
   */
  function processTexts(
    organizationId: string,
    texts: Array<{ text: string; domain: string; entityId?: string }>
  ): void {
    // Build base vocabulary
    vocabulary = buildOrgVocabulary(organizationId, texts);
    
    // Extract co-occurrences for synonym detection
    const cooccurrences = extractCooccurrences(texts, fullConfig.cooccurrenceWindow);
    
    // Identify synonyms
    synonyms = identifySynonyms(cooccurrences, fullConfig.minCooccurrence);
    
    // Generate training pairs
    trainingPairs = generateTrainingPairs(texts, vocabulary, synonyms);
  }
  
  /**
   * Extract co-occurrence counts between terms
   */
  function extractCooccurrences(
    texts: Array<{ text: string; domain: string }>,
    windowSize: number
  ): Map<string, Map<string, { count: number; domain: string }>> {
    const cooccurrences = new Map<string, Map<string, { count: number; domain: string }>>();
    
    for (const { text, domain } of texts) {
      const words = text.toLowerCase().split(/\s+/);
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.length < 2) continue;
        
        if (!cooccurrences.has(word)) {
          cooccurrences.set(word, new Map());
        }
        
        const wordMap = cooccurrences.get(word)!;
        
        // Look at surrounding window
        for (let j = Math.max(0, i - windowSize); j <= Math.min(words.length - 1, i + windowSize); j++) {
          if (i === j) continue;
          
          const neighbor = words[j];
          if (neighbor.length < 2) continue;
          
          const existing = wordMap.get(neighbor) || { count: 0, domain };
          existing.count++;
          wordMap.set(neighbor, existing);
        }
      }
    }
    
    return cooccurrences;
  }
  
  /**
   * Identify synonym relationships from co-occurrences
   */
  function identifySynonyms(
    cooccurrences: Map<string, Map<string, { count: number; domain: string }>>,
    minCount: number
  ): SynonymRelation[] {
    const synonyms: SynonymRelation[] = [];
    const seen = new Set<string>();
    
    for (const [term1, neighbors] of cooccurrences) {
      for (const [term2, { count, domain }] of neighbors) {
        if (count < minCount) continue;
        
        // Avoid duplicates
        const pairKey = [term1, term2].sort().join('|');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        
        // Compute contextual similarity (Jaccard on neighbors)
        const neighbors1 = new Set(cooccurrences.get(term1)?.keys() || []);
        const neighbors2 = new Set(cooccurrences.get(term2)?.keys() || []);
        
        const intersection = new Set([...neighbors1].filter(x => neighbors2.has(x)));
        const union = new Set([...neighbors1, ...neighbors2]);
        
        const similarity = union.size > 0 ? intersection.size / union.size : 0;
        
        if (similarity > 0.1) { // Threshold for synonym detection
          synonyms.push({
            term1,
            term2,
            cooccurrenceCount: count,
            contextualSimilarity: similarity,
            domain
          });
        }
      }
    }
    
    return synonyms.sort((a, b) => b.contextualSimilarity - a.contextualSimilarity);
  }
  
  /**
   * Generate training pairs for contrastive learning
   */
  function generateTrainingPairs(
    texts: Array<{ text: string; domain: string }>,
    vocab: OrgVocabulary,
    synonyms: SynonymRelation[]
  ): TrainingPair[] {
    const pairs: TrainingPair[] = [];
    
    // Synonym pairs (positive)
    for (const syn of synonyms.slice(0, 1000)) {
      pairs.push({
        anchor: syn.term1,
        positive: syn.term2,
        domain: syn.domain,
        similarity: syn.contextualSimilarity
      });
    }
    
    // Same-domain pairs from sentence co-occurrence
    const domainTexts = new Map<string, string[]>();
    for (const { text, domain } of texts) {
      if (!domainTexts.has(domain)) {
        domainTexts.set(domain, []);
      }
      domainTexts.get(domain)!.push(text);
    }
    
    for (const [domain, domTexts] of domainTexts) {
      // Sample sentences from same domain as positive pairs
      for (let i = 0; i < Math.min(domTexts.length, 500); i++) {
        const j = (i + 1) % domTexts.length;
        
        const words1 = extractKeyTerms(domTexts[i], vocab);
        const words2 = extractKeyTerms(domTexts[j], vocab);
        
        if (words1.length > 0 && words2.length > 0) {
          pairs.push({
            anchor: words1[0],
            positive: words2[0],
            domain,
            similarity: 0.5 // Same-domain similarity
          });
        }
      }
    }
    
    // Add negative pairs (different domains)
    const domains = Array.from(domainTexts.keys());
    for (const pair of pairs.slice(0, 500)) {
      const otherDomains = domains.filter(d => d !== pair.domain);
      if (otherDomains.length === 0) continue;
      
      const negativeDomain = otherDomains[Math.floor(Math.random() * otherDomains.length)];
      const negativeTexts = domainTexts.get(negativeDomain) || [];
      
      if (negativeTexts.length > 0) {
        const negText = negativeTexts[Math.floor(Math.random() * negativeTexts.length)];
        const negTerms = extractKeyTerms(negText, vocab);
        
        if (negTerms.length > 0) {
          pair.negative = negTerms[0];
        }
      }
    }
    
    return pairs;
  }
  
  /**
   * Extract key terms from text that are in vocabulary
   */
  function extractKeyTerms(text: string, vocab: OrgVocabulary): string[] {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(w => vocab.terms.has(w));
  }
  
  /**
   * Get current vocabulary
   */
  function getVocabulary(): OrgVocabulary | null {
    return vocabulary;
  }
  
  /**
   * Get synonyms
   */
  function getSynonyms(): SynonymRelation[] {
    return synonyms;
  }
  
  /**
   * Get training pairs
   */
  function getTrainingPairs(): TrainingPair[] {
    return trainingPairs;
  }
  
  /**
   * Build complete fine-tuning dataset
   */
  function buildDataset(organizationId: string): FineTuningDataset | null {
    if (!vocabulary) return null;
    
    const domainDistribution: Record<string, number> = {};
    for (const pair of trainingPairs) {
      domainDistribution[pair.domain] = (domainDistribution[pair.domain] || 0) + 1;
    }
    
    const avgSimilarity = trainingPairs.length > 0
      ? trainingPairs.reduce((sum, p) => sum + p.similarity, 0) / trainingPairs.length
      : 0;
    
    return {
      organizationId,
      createdAt: new Date(),
      trainingPairs,
      vocabulary,
      synonyms,
      stats: {
        totalPairs: trainingPairs.length,
        uniqueTerms: vocabulary.terms.size,
        synonymCount: synonyms.length,
        domainDistribution,
        averageSimilarity: avgSimilarity
      }
    };
  }
  
  /**
   * Export dataset to JSON format for external training
   */
  function exportDataset(): object {
    if (!vocabulary) {
      return { error: 'No vocabulary built' };
    }
    
    return {
      vocabulary: {
        terms: Array.from(vocabulary.terms.entries()).map(([key, term]) => ({
          key,
          ...term
        }))
      },
      synonyms: synonyms.slice(0, 1000),
      trainingPairs: trainingPairs.map(p => ({
        anchor: p.anchor,
        positive: p.positive,
        negative: p.negative,
        similarity: p.similarity
      })),
      format: 'contrastive',
      version: '1.0'
    };
  }
  
  /**
   * Create snapshot for versioning
   */
  function createSnapshot(): VocabularySnapshot | null {
    if (!vocabulary) return null;
    
    return {
      organizationId: vocabulary.organizationId,
      timestamp: new Date(),
      termCount: vocabulary.terms.size,
      terms: Array.from(vocabulary.terms.values()),
      synonyms: synonyms.slice(0, 500),
      trainingPairs: trainingPairs.slice(0, 1000)
    };
  }
  
  return {
    processTexts,
    getVocabulary,
    getSynonyms,
    getTrainingPairs,
    buildDataset,
    exportDataset,
    createSnapshot
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type FineTuningPipeline = ReturnType<typeof createFineTuningPipeline>;
