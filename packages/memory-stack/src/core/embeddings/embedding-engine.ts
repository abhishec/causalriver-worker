/**
 * Nexus Memory Stack - Embedding Engine
 *
 * Core embedding generation with automatic model routing.
 *
 * When a neural embedding API key is provided (OpenAI, Mixedbread),
 * the engine uses real transformer-based embeddings for true semantic
 * understanding. Otherwise, falls back to n-gram hashing for zero-config
 * edge function deployment.
 *
 * Model priority:
 * 1. OpenAI text-embedding-3-small (1536 dims → reduced to target)
 * 2. Mixedbread mxbai-embed-large-v1 (1024 dims → reduced to target)
 * 3. N-gram hashing fallback (384 dims, no API required)
 *
 * Algorithm (fallback):
 * 1. Character trigram hashing (weight: 1x)
 * 2. Word unigram hashing (weight: 2x)
 * 3. Word bigram hashing (weight: 1.5x)
 * 4. L2 normalization
 */

import type { EmbeddingConfig, EntityFormatter, SyncResult, EmbeddingMetadata } from '../../types';
import {
  generateNeuralEmbedding as generateNeural,
  type NeuralEmbeddingConfig,
  type EmbeddingModel,
} from './neural-embedding-engine';
import { MODEL_FAST } from '../../infra/smart-model-router';

// ============================================================================
// CORE HASHING FUNCTIONS
// ============================================================================

/**
 * DJB2 hash function - fast and good distribution
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Create content hash for change detection
 */
export function hashContent(content: string): string {
  const hash = hashString(content);
  return Math.abs(hash).toString(16);
}

/**
 * Generate embedding using n-gram hashing
 *
 * This is a simple but effective approach for semantic similarity.
 * It doesn't require any external services or GPU.
 *
 * @param text - Text to embed
 * @param dimensions - Number of dimensions (default: 384)
 * @returns Normalized embedding vector
 */
export function generateEmbedding(text: string, dimensions: number = 384): number[] {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const embedding = new Array(dimensions).fill(0);

  // Character trigram hashing
  for (let i = 0; i < normalizedText.length - 2; i++) {
    const trigram = normalizedText.slice(i, i + 3);
    const hash = hashString(trigram);
    const index = Math.abs(hash) % dimensions;
    embedding[index] += 1;
  }

  // Word unigram hashing with higher weight
  const words = normalizedText.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const hash = hashString(word);
    const index = Math.abs(hash) % dimensions;
    embedding[index] += 2;
  }

  // Word bigram hashing
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    const hash = hashString(bigram);
    const index = Math.abs(hash) % dimensions;
    embedding[index] += 1.5;
  }

  // L2 normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
  return embedding.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ============================================================================
// CLAUDE ENHANCEMENT (Optional)
// ============================================================================

/**
 * Extract semantic concepts using Claude for richer embeddings
 *
 * This is optional and adds latency/cost, but improves semantic understanding.
 * Only use when high-quality embeddings are needed.
 */
export async function extractSemanticConcepts(
  text: string,
  apiKey: string,
  model: string = MODEL_FAST
): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Extract the key semantic concepts, entities, and relationships from this text. Output only the concepts as a dense, keyword-rich summary suitable for semantic search. No explanations.

Text: ${text.substring(0, 500)}`
        }]
      })
    });

    if (!response.ok) {
      console.warn('Claude API error, using original text');
      return text;
    }

    const data = await response.json();
    const concepts = data.content?.[0]?.text || text;

    // Combine original text with Claude-extracted concepts for richer embedding
    return `${text} CONCEPTS: ${concepts}`;
  } catch (error) {
    console.warn('Claude extraction failed, using original text:', error);
    return text;
  }
}

// ============================================================================
// EMBEDDING ENGINE FACTORY
// ============================================================================

/**
 * Create an embedding engine with the given configuration
 *
 * @example
 * ```typescript
 * const engine = createEmbeddingEngine({
 *   entityFormatters: {
 *     user: (u) => `User: ${u.name}. Email: ${u.email}.`,
 *     post: (p) => `Post: ${p.title}. Content: ${p.body}.`,
 *   },
 *   dimensions: 384,
 * });
 *
 * const embedding = engine.generateEmbedding('search query');
 * const result = await engine.syncEntity(supabase, 'user', userEntity);
 * ```
 */
export function createEmbeddingEngine(config: EmbeddingConfig) {
  const {
    entityFormatters,
    dimensions = 384,
    useAIEnhancement = false,
    aiApiKey,
    aiModel = MODEL_FAST,
    embeddingModel,
    embeddingApiKey,
    embeddingApiEndpoint,
  } = config;

  // Build neural config if an embedding model + API key are provided
  const neuralConfig: NeuralEmbeddingConfig | null =
    embeddingModel && embeddingApiKey
      ? {
          model: embeddingModel as EmbeddingModel,
          apiKey: embeddingApiKey,
          apiEndpoint: embeddingApiEndpoint,
          targetDimension: dimensions,
          enableCache: true,
          cacheTTL: 3600,
        }
      : null;

  /**
   * Generate embedding — routes through neural model when configured,
   * falls back to n-gram hashing otherwise.
   */
  async function generateSmartEmbedding(text: string): Promise<number[]> {
    if (neuralConfig) {
      try {
        const result = await generateNeural(text, neuralConfig);
        return result.embedding;
      } catch (err) {
        // Non-critical: neural embedding generation failed — falling back to n-gram, errors here don't block the main flow
      }
    }
    return generateEmbedding(text, dimensions);
  }

  return {
    /**
     * Generate embedding for text (sync — n-gram only for backward compat)
     */
    generateEmbedding: (text: string): number[] => {
      return generateEmbedding(text, dimensions);
    },

    /**
     * Generate embedding with neural model routing.
     * Uses transformer-based model when configured, n-gram fallback otherwise.
     * This is the RECOMMENDED method for production use.
     */
    generateEmbeddingAsync: async (text: string): Promise<number[]> => {
      return generateSmartEmbedding(text);
    },

    /**
     * Generate embedding with optional Claude enhancement
     */
    generateEmbeddingEnhanced: async (text: string): Promise<number[]> => {
      let contentText = text;

      if (useAIEnhancement && aiApiKey) {
        contentText = await extractSemanticConcepts(text, aiApiKey, aiModel);
      }

      // Route through neural model if configured
      if (neuralConfig) {
        try {
          const result = await generateNeural(contentText, neuralConfig);
          return result.embedding;
        } catch (err) {
          // Non-critical: neural embedding generation failed — falling back to n-gram, errors here don't block the main flow
        }
      }

      return generateEmbedding(contentText, dimensions);
    },

    /**
     * Check if neural embeddings are configured and available
     */
    isNeuralEnabled: (): boolean => neuralConfig !== null,

    /**
     * Format an entity to embeddable text
     */
    formatEntity: (entityType: string, entity: any): string => {
      const formatter = entityFormatters[entityType];
      if (!formatter) {
        throw new Error(`No formatter registered for entity type: ${entityType}`);
      }
      return formatter(entity);
    },

    /**
     * Get content hash for change detection
     */
    hashContent: (content: string): string => {
      return hashContent(content);
    },

    /**
     * Calculate similarity between two embeddings
     */
    similarity: (a: number[], b: number[]): number => {
      return cosineSimilarity(a, b);
    },

    /**
     * Sync a single entity to embeddings table
     */
    syncEntity: async (
      supabase: any,
      entityType: string,
      entity: { id: string; [key: string]: any },
      options: { skipAIEnhancement?: boolean } = {}
    ): Promise<{ synced: boolean; skipped: boolean; error?: string }> => {
      try {
        const formatter = entityFormatters[entityType];
        if (!formatter) {
          return { synced: false, skipped: false, error: `No formatter for ${entityType}` };
        }

        let contentText = formatter(entity);

        // Optional Claude enhancement
        if (!options.skipAIEnhancement && useAIEnhancement && aiApiKey) {
          contentText = await extractSemanticConcepts(contentText, aiApiKey, aiModel);
        }

        const contentHash = hashContent(contentText);

        // Check if already exists with same hash
        const { data: existing } = await supabase
          .from('entity_embeddings')
          .select('content_hash')
          .eq('entity_type', entityType)
          .eq('entity_id', entity.id)
          .maybeSingle();

        if (existing?.content_hash === contentHash) {
          return { synced: false, skipped: true };
        }

        // Generate embedding — use neural when available
        const embedding = await generateSmartEmbedding(contentText);

        // Build metadata
        const metadata: EmbeddingMetadata = {
          name: entity.name || entity.title || entity.client_name || entity.invoice_number,
          synced_at: new Date().toISOString()
        };

        // Add memory-specific metadata for weighting in RAG
        if (entityType === 'memory' || entityType === 'knowledge') {
          metadata.confidence = entity.confidence || 0.8;
          metadata.access_count = entity.access_count || 0;
          metadata.memory_type = entity.memory_type || entity.fact_type;
          metadata.severity = entity.severity;
        }

        // Upsert to embeddings table
        const { error } = await supabase
          .from('entity_embeddings')
          .upsert({
            entity_type: entityType,
            entity_id: entity.id,
            content_text: contentText,
            content_hash: contentHash,
            embedding: `[${embedding.join(',')}]`,
            metadata
          }, { onConflict: 'entity_type,entity_id' });

        if (error) {
          return { synced: false, skipped: false, error: error.message };
        }

        return { synced: true, skipped: false };
      } catch (err: any) {
        return { synced: false, skipped: false, error: err.message };
      }
    },

    /**
     * Sync multiple entities in batches
     */
    syncEntities: async (
      supabase: any,
      entityType: string,
      entities: Array<{ id: string; [key: string]: any }>,
      options: { skipAIEnhancement?: boolean; batchSize?: number } = {}
    ): Promise<SyncResult> => {
      const { skipAIEnhancement = false, batchSize = 10 } = options;
      let synced = 0, skipped = 0, errors = 0;

      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);

        for (const entity of batch) {
          const result = await createEmbeddingEngine(config).syncEntity(
            supabase,
            entityType,
            entity,
            { skipAIEnhancement }
          );

          if (result.synced) synced++;
          else if (result.skipped) skipped++;
          else errors++;
        }
      }

      return { synced, skipped, errors };
    },

    /**
     * Get registered entity types
     */
    getEntityTypes: (): string[] => {
      return Object.keys(entityFormatters);
    },

    /**
     * Check if an entity type is registered
     */
    hasFormatter: (entityType: string): boolean => {
      return entityType in entityFormatters;
    },
  };
}

// ============================================================================
// DEFAULT ENTITY FORMATTERS (Examples)
// ============================================================================

/**
 * Example entity formatters for common entity types.
 * Override these with your own formatters when creating the engine.
 */
export const defaultEntityFormatters: Record<string, EntityFormatter> = {
  // Generic user
  user: (u) => `User: ${u.name || u.username}. Email: ${u.email || 'N/A'}.`.trim(),

  // Generic document
  document: (d) => `Document: ${d.title}. Category: ${d.category || 'General'}. Content: ${(d.content || '').substring(0, 500)}`.trim(),

  // Generic task/action
  task: (t) => `Task: ${t.title}. Status: ${t.status}. Priority: ${t.priority}. ${t.description || ''}`.trim(),

  // AI Memory
  memory: (m) => `Memory: ${m.title}. Type: ${m.memory_type}. Entity: ${m.entity_type}. ${JSON.stringify(m.content)}`.trim(),

  // AI Knowledge
  knowledge: (k) => `Knowledge: ${k.fact}. Type: ${k.fact_type}. Entity: ${k.entity_type}. Confidence: ${k.confidence}.`.trim(),
};
