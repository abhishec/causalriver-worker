/**
 * Neural Embedding Engine
 * 
 * Provides real neural embeddings using external API providers,
 * replacing the n-gram hashing approach with transformer-based
 * semantic understanding.
 * 
 * Supports:
 * - OpenAI text-embedding-3-small (1536 dims)
 * - OpenAI text-embedding-ada-002 (1536 dims)
 * - Mixedbread mxbai-embed-large-v1 (1024 dims)
 * - Local fallback to enhanced n-gram (384 dims)
 * 
 * Features:
 * - Automatic batching for efficiency
 * - Caching to reduce API calls
 * - Dimension reduction when needed
 * - Organization-specific vocabulary boosting
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NeuralEmbeddingConfig {
  /** Embedding model to use */
  model: EmbeddingModel;
  /** API key for the provider */
  apiKey?: string;
  /** Custom API endpoint (for self-hosted models) */
  apiEndpoint?: string;
  /** Maximum batch size for API calls */
  batchSize?: number;
  /** Enable caching */
  enableCache?: boolean;
  /** Cache TTL in seconds */
  cacheTTL?: number;
  /** Target dimension for output (with reduction) */
  targetDimension?: number;
}

export type EmbeddingModel =
  | 'openai-text-embedding-3-small'
  | 'openai-text-embedding-ada-002'
  | 'mxbai-embed-large-v1'
  | 'ngram-fallback';

export interface EmbeddingResult {
  embedding: number[];
  model: EmbeddingModel;
  dimensions: number;
  tokenCount?: number;
  cached: boolean;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  processingTimeMs: number;
}

export interface OrgVocabulary {
  organizationId: string;
  terms: Map<string, VocabularyTerm>;
  updatedAt: Date;
}

export interface VocabularyTerm {
  term: string;
  synonyms: string[];
  domain: string;
  frequency: number;
  embedding?: number[];
}

// Model configurations
const MODEL_CONFIGS: Record<EmbeddingModel, {
  dimensions: number;
  maxTokens: number;
  provider: 'openai' | 'mixedbread' | 'local';
  endpoint?: string;
}> = {
  'openai-text-embedding-3-small': {
    dimensions: 1536,
    maxTokens: 8191,
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/embeddings'
  },
  'openai-text-embedding-ada-002': {
    dimensions: 1536,
    maxTokens: 8191,
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/embeddings'
  },
  'mxbai-embed-large-v1': {
    dimensions: 1024,
    maxTokens: 512,
    provider: 'mixedbread',
    endpoint: 'https://api.mixedbread.ai/v1/embeddings'
  },
  'ngram-fallback': {
    dimensions: 384,
    maxTokens: 10000,
    provider: 'local'
  }
};

// ============================================================================
// EMBEDDING CACHE
// ============================================================================

interface CacheEntry {
  embedding: number[];
  model: EmbeddingModel;
  createdAt: number;
}

const embeddingCache = new Map<string, CacheEntry>();

function getCacheKey(text: string, model: EmbeddingModel): string {
  // Simple hash for cache key
  let hash = 0;
  const str = `${model}:${text}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getFromCache(
  text: string,
  model: EmbeddingModel,
  ttlSeconds: number
): number[] | null {
  const key = getCacheKey(text, model);
  const entry = embeddingCache.get(key);
  
  if (!entry) return null;
  
  const age = (Date.now() - entry.createdAt) / 1000;
  if (age > ttlSeconds) {
    embeddingCache.delete(key);
    return null;
  }
  
  return entry.embedding;
}

function setCache(
  text: string,
  model: EmbeddingModel,
  embedding: number[]
): void {
  const key = getCacheKey(text, model);
  embeddingCache.set(key, {
    embedding,
    model,
    createdAt: Date.now()
  });
  
  // Limit cache size
  if (embeddingCache.size > 10000) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey) embeddingCache.delete(oldestKey);
  }
}

// ============================================================================
// NEURAL EMBEDDING GENERATION
// ============================================================================

/**
 * Generate a neural embedding for text
 */
export async function generateNeuralEmbedding(
  text: string,
  config: NeuralEmbeddingConfig
): Promise<EmbeddingResult> {
  const {
    model,
    apiKey,
    apiEndpoint,
    enableCache = true,
    cacheTTL = 3600,
    targetDimension
  } = config;
  
  // Check cache first
  if (enableCache) {
    const cached = getFromCache(text, model, cacheTTL);
    if (cached) {
      return {
        embedding: targetDimension ? reduceDimensions(cached, targetDimension) : cached,
        model,
        dimensions: targetDimension || cached.length,
        cached: true
      };
    }
  }
  
  // Generate embedding
  let embedding: number[];
  let tokenCount: number | undefined;
  
  const modelConfig = MODEL_CONFIGS[model];
  
  if (modelConfig.provider === 'local') {
    embedding = generateLocalEmbedding(text, modelConfig.dimensions);
  } else {
    const result = await callEmbeddingAPI(
      text,
      model,
      apiKey,
      apiEndpoint || modelConfig.endpoint
    );
    embedding = result.embedding;
    tokenCount = result.tokenCount;
  }
  
  // Cache the result
  if (enableCache) {
    setCache(text, model, embedding);
  }
  
  // Apply dimension reduction if needed
  if (targetDimension && targetDimension < embedding.length) {
    embedding = reduceDimensions(embedding, targetDimension);
  }
  
  return {
    embedding,
    model,
    dimensions: embedding.length,
    tokenCount,
    cached: false
  };
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateBatchEmbeddings(
  texts: string[],
  config: NeuralEmbeddingConfig
): Promise<BatchEmbeddingResult> {
  const startTime = Date.now();
  const { batchSize = 100 } = config;
  
  const results: EmbeddingResult[] = [];
  let totalTokens = 0;
  
  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // Check cache for each text
    const uncached: { index: number; text: string }[] = [];
    
    for (let j = 0; j < batch.length; j++) {
      const cached = config.enableCache
        ? getFromCache(batch[j], config.model, config.cacheTTL || 3600)
        : null;
      
      if (cached) {
        results[i + j] = {
          embedding: cached,
          model: config.model,
          dimensions: cached.length,
          cached: true
        };
      } else {
        uncached.push({ index: i + j, text: batch[j] });
      }
    }
    
    // Generate embeddings for uncached texts
    if (uncached.length > 0) {
      const batchResults = await Promise.all(
        uncached.map(({ text }) => generateNeuralEmbedding(text, config))
      );
      
      for (let k = 0; k < uncached.length; k++) {
        results[uncached[k].index] = batchResults[k];
        if (batchResults[k].tokenCount) {
          totalTokens += batchResults[k].tokenCount!;
        }
      }
    }
  }
  
  return {
    embeddings: results,
    totalTokens,
    processingTimeMs: Date.now() - startTime
  };
}

// ============================================================================
// API CALLS
// ============================================================================

async function callEmbeddingAPI(
  text: string,
  model: EmbeddingModel,
  apiKey?: string,
  endpoint?: string
): Promise<{ embedding: number[]; tokenCount?: number }> {
  if (!apiKey) {
    // Fall back to local embedding if no API key
    console.warn(`No API key for ${model}, falling back to local embedding`);
    return {
      embedding: generateLocalEmbedding(text, MODEL_CONFIGS[model].dimensions)
    };
  }
  
  if (!endpoint) {
    throw new Error(`No endpoint configured for model ${model}`);
  }
  
  const modelConfig = MODEL_CONFIGS[model];
  
  try {
    if (modelConfig.provider === 'openai') {
      return await callOpenAI(text, model, apiKey, endpoint);
    } else if (modelConfig.provider === 'mixedbread') {
      return await callMixedbread(text, model, apiKey, endpoint);
    } else {
      throw new Error(`Unknown provider for model ${model}`);
    }
  } catch (error) {
    console.error(`Embedding API error for ${model}:`, error);
    // Fall back to local embedding on error
    return {
      embedding: generateLocalEmbedding(text, modelConfig.dimensions)
    };
  }
}

async function callOpenAI(
  text: string,
  model: EmbeddingModel,
  apiKey: string,
  endpoint: string
): Promise<{ embedding: number[]; tokenCount?: number }> {
  const modelName = model.replace('openai-', '');
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      input: text
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    embedding: data.data[0].embedding,
    tokenCount: data.usage?.total_tokens
  };
}

async function callMixedbread(
  text: string,
  model: EmbeddingModel,
  apiKey: string,
  endpoint: string
): Promise<{ embedding: number[]; tokenCount?: number }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      input: [text]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Mixedbread API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    embedding: data.data[0].embedding,
    tokenCount: data.usage?.total_tokens
  };
}

// ============================================================================
// LOCAL EMBEDDING (ENHANCED N-GRAM)
// ============================================================================

/**
 * Generate a local embedding using enhanced n-gram approach
 * This serves as a fallback when API is unavailable
 */
function generateLocalEmbedding(text: string, dimensions: number): number[] {
  const normalizedText = text.toLowerCase().trim();
  const embedding = new Array(dimensions).fill(0);
  
  // Character trigrams
  for (let i = 0; i < normalizedText.length - 2; i++) {
    const trigram = normalizedText.substring(i, i + 3);
    const hash = hashString(trigram);
    const index = Math.abs(hash) % dimensions;
    embedding[index] += 1;
  }
  
  // Word unigrams and bigrams
  const words = normalizedText.split(/\s+/).filter(w => w.length > 1);
  for (let i = 0; i < words.length; i++) {
    // Unigram
    const uniHash = hashString(words[i]);
    embedding[Math.abs(uniHash) % dimensions] += 2;
    
    // Bigram
    if (i < words.length - 1) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      const biHash = hashString(bigram);
      embedding[Math.abs(biHash) % dimensions] += 1.5;
    }
  }
  
  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

// ============================================================================
// DIMENSION REDUCTION
// ============================================================================

/**
 * Reduce embedding dimensions using random projection
 * (Johnson-Lindenstrauss lemma guarantees distance preservation)
 */
function reduceDimensions(embedding: number[], targetDim: number): number[] {
  if (embedding.length <= targetDim) return embedding;
  
  // Generate deterministic random projection matrix
  const projectionMatrix: number[][] = [];
  const seed = 42; // Fixed seed for reproducibility
  
  for (let i = 0; i < targetDim; i++) {
    projectionMatrix[i] = [];
    for (let j = 0; j < embedding.length; j++) {
      // Pseudo-random based on seed and indices
      const rand = seededRandom(seed + i * embedding.length + j);
      // Sparse random projection: -1, 0, or 1 with probabilities 1/6, 2/3, 1/6
      if (rand < 1/6) {
        projectionMatrix[i][j] = -Math.sqrt(3);
      } else if (rand > 5/6) {
        projectionMatrix[i][j] = Math.sqrt(3);
      } else {
        projectionMatrix[i][j] = 0;
      }
    }
  }
  
  // Apply projection
  const reduced = new Array(targetDim).fill(0);
  for (let i = 0; i < targetDim; i++) {
    for (let j = 0; j < embedding.length; j++) {
      reduced[i] += projectionMatrix[i][j] * embedding[j];
    }
    reduced[i] /= Math.sqrt(embedding.length);
  }
  
  // Normalize
  const magnitude = Math.sqrt(reduced.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < reduced.length; i++) {
      reduced[i] /= magnitude;
    }
  }
  
  return reduced;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ============================================================================
// ORGANIZATION VOCABULARY
// ============================================================================

/**
 * Build organization-specific vocabulary from entity data
 */
export function buildOrgVocabulary(
  organizationId: string,
  entityTexts: Array<{ text: string; domain: string }>
): OrgVocabulary {
  const termCounts = new Map<string, { count: number; domains: Set<string> }>();
  
  for (const { text, domain } of entityTexts) {
    // Extract potential terms (capitalized words, acronyms, multi-word phrases)
    const terms = extractTerms(text);
    
    for (const term of terms) {
      const existing = termCounts.get(term) || { count: 0, domains: new Set() };
      existing.count++;
      existing.domains.add(domain);
      termCounts.set(term, existing);
    }
  }
  
  // Filter to significant terms (appear 3+ times)
  const vocabulary: OrgVocabulary = {
    organizationId,
    terms: new Map(),
    updatedAt: new Date()
  };
  
  for (const [term, { count, domains }] of termCounts) {
    if (count >= 3) {
      vocabulary.terms.set(term.toLowerCase(), {
        term,
        synonyms: [],
        domain: domains.size === 1 ? Array.from(domains)[0] : 'general',
        frequency: count
      });
    }
  }
  
  return vocabulary;
}

/**
 * Extract potential vocabulary terms from text
 */
function extractTerms(text: string): string[] {
  const terms: string[] = [];
  
  // Acronyms (2-5 uppercase letters)
  const acronymRegex = /\b[A-Z]{2,5}\b/g;
  let match;
  while ((match = acronymRegex.exec(text)) !== null) {
    terms.push(match[0]);
  }
  
  // Capitalized multi-word phrases
  const phraseRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  while ((match = phraseRegex.exec(text)) !== null) {
    terms.push(match[0]);
  }
  
  // CamelCase terms
  const camelRegex = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;
  while ((match = camelRegex.exec(text)) !== null) {
    terms.push(match[0]);
  }
  
  return terms;
}

/**
 * Boost embedding similarity for org-specific terms
 */
export function applyVocabularyBoost(
  text: string,
  embedding: number[],
  vocabulary: OrgVocabulary,
  boostFactor: number = 1.2
): number[] {
  const boosted = [...embedding];
  const normalizedText = text.toLowerCase();
  
  for (const [term, vocab] of vocabulary.terms) {
    if (normalizedText.includes(term)) {
      // Apply boost to dimensions associated with this term
      const termHash = hashString(term);
      const indices = [
        Math.abs(termHash) % embedding.length,
        Math.abs(termHash * 17) % embedding.length,
        Math.abs(termHash * 31) % embedding.length
      ];
      
      for (const idx of indices) {
        boosted[idx] *= boostFactor * (1 + Math.log(vocab.frequency) / 10);
      }
    }
  }
  
  // Re-normalize
  const magnitude = Math.sqrt(boosted.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < boosted.length; i++) {
      boosted[i] /= magnitude;
    }
  }
  
  return boosted;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const NeuralEmbeddings = {
  generateNeuralEmbedding,
  generateBatchEmbeddings,
  buildOrgVocabulary,
  applyVocabularyBoost,
  generateLocalEmbedding,
  reduceDimensions
};
