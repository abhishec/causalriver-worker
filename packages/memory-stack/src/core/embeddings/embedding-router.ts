/**
 * Embedding Router
 *
 * Routes embedding requests between n-gram (lightweight) and neural
 * (transformer-based) implementations.
 *
 * The neural path uses OpenAI text-embedding-3-small via edge function,
 * with automatic fallback to n-gram if the API is unavailable.
 */

import { generateEmbedding as generateNGramEmbedding, hashContent } from './embedding-engine';

// ============================================================================
// TYPES
// ============================================================================

export type EmbeddingMode = 'ngram' | 'neural' | 'auto';

export interface EmbeddingRequest {
  text: string;
  mode?: EmbeddingMode;
  dimensions?: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  mode_used: EmbeddingMode;
  dimensions: number;
  content_hash: string;
  latency_ms?: number;
}

export interface NeuralEmbeddingConfig {
  /** Edge function URL for neural embeddings */
  edgeFunctionUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Timeout in ms */
  timeout: number;
  
  /** Model to use */
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  
  /** Target dimensions (will reduce if model outputs more) */
  targetDimensions: number;
}

export const DEFAULT_NEURAL_CONFIG: NeuralEmbeddingConfig = {
  edgeFunctionUrl: '', // Must be set
  timeout: 10000,
  model: 'text-embedding-3-small',
  targetDimensions: 384, // Match pgvector column
};

// ============================================================================
// DIMENSION REDUCTION
// ============================================================================

/**
 * Reduce embedding dimensions using PCA-like approach
 * 
 * OpenAI text-embedding-3-small outputs 1536 dims.
 * We need 384 dims for pgvector compatibility.
 * 
 * Simple approach: Average groups of adjacent dimensions.
 */
export function reduceDimensions(
  embedding: number[],
  targetDims: number
): number[] {
  if (embedding.length <= targetDims) {
    // Pad with zeros if needed
    const padded = [...embedding];
    while (padded.length < targetDims) {
      padded.push(0);
    }
    return padded;
  }
  
  const groupSize = Math.ceil(embedding.length / targetDims);
  const reduced: number[] = [];
  
  for (let i = 0; i < targetDims; i++) {
    const start = i * groupSize;
    const end = Math.min(start + groupSize, embedding.length);
    
    if (start >= embedding.length) {
      reduced.push(0);
      continue;
    }
    
    // Average the group
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += embedding[j];
      count++;
    }
    reduced.push(count > 0 ? sum / count : 0);
  }
  
  // L2 normalize
  const magnitude = Math.sqrt(reduced.reduce((s, v) => s + v * v, 0)) || 1;
  return reduced.map(v => v / magnitude);
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embedding using n-gram approach (always available)
 */
export function generateNGramEmbeddingWithMeta(
  text: string,
  dimensions: number = 384
): EmbeddingResponse {
  const start = Date.now();
  const embedding = generateNGramEmbedding(text, dimensions);
  
  return {
    embedding,
    mode_used: 'ngram',
    dimensions,
    content_hash: hashContent(text),
    latency_ms: Date.now() - start,
  };
}

/**
 * Generate embedding using neural model via edge function
 * 
 * This function is meant to be called from server-side code or edge functions.
 * It calls the generate-neural-embeddings edge function.
 */
export async function generateNeuralEmbedding(
  text: string,
  config: NeuralEmbeddingConfig
): Promise<EmbeddingResponse> {
  const start = Date.now();
  
  if (!config.edgeFunctionUrl) {
    throw new Error('Neural embedding requires edgeFunctionUrl');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);
  
  try {
    const response = await fetch(config.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        text,
        model: config.model,
        dimensions: config.targetDimensions,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Neural embedding failed: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    // Reduce dimensions if needed
    let embedding = data.embedding as number[];
    if (embedding.length !== config.targetDimensions) {
      embedding = reduceDimensions(embedding, config.targetDimensions);
    }
    
    return {
      embedding,
      mode_used: 'neural',
      dimensions: config.targetDimensions,
      content_hash: hashContent(text),
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Generate embedding with automatic fallback
 * 
 * Tries neural first, falls back to n-gram on failure.
 */
export async function generateEmbeddingAuto(
  text: string,
  neuralConfig?: NeuralEmbeddingConfig,
  dimensions: number = 384
): Promise<EmbeddingResponse> {
  // If no neural config, use n-gram
  if (!neuralConfig?.edgeFunctionUrl) {
    return generateNGramEmbeddingWithMeta(text, dimensions);
  }
  
  try {
    return await generateNeuralEmbedding(text, neuralConfig);
  } catch (error) {
    console.warn('Neural embedding failed, falling back to n-gram:', error);
    const result = generateNGramEmbeddingWithMeta(text, dimensions);
    result.mode_used = 'ngram'; // Mark as fallback
    return result;
  }
}

/**
 * Batch generate embeddings
 */
export async function generateBatchEmbeddings(
  texts: string[],
  mode: EmbeddingMode,
  config?: { neural?: NeuralEmbeddingConfig; dimensions?: number }
): Promise<EmbeddingResponse[]> {
  const dimensions = config?.dimensions || 384;
  
  if (mode === 'ngram') {
    return texts.map(text => generateNGramEmbeddingWithMeta(text, dimensions));
  }
  
  if (mode === 'neural' && config?.neural) {
    // Process in parallel with concurrency limit
    const batchSize = 5;
    const results: EmbeddingResponse[] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => generateNeuralEmbedding(text, config.neural!))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
  
  // Auto mode
  return Promise.all(
    texts.map(text => generateEmbeddingAuto(text, config?.neural, dimensions))
  );
}

/**
 * Compute cosine similarity between two embeddings
 */
export function computeSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimensions mismatch: ${a.length} vs ${b.length}`);
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
  return magnitude > 0 ? dotProduct / magnitude : 0;
}
