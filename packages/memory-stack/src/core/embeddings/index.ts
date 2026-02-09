/**
 * Core Embeddings Module
 *
 * Embeddings for semantic search and memory.
 * Supports both lightweight n-gram and neural transformer models.
 */

// Original n-gram engine (lightweight, no API required)
export {
  generateEmbedding,
  hashString,
  hashContent,
  cosineSimilarity,
  extractSemanticConcepts,
  createEmbeddingEngine,
  defaultEntityFormatters,
} from './embedding-engine';

// Neural embedding engine (transformer-based)
export {
  generateNeuralEmbedding,
  generateBatchEmbeddings,
  buildOrgVocabulary,
  applyVocabularyBoost,
  NeuralEmbeddings,
  type NeuralEmbeddingConfig,
  type EmbeddingModel,
  type EmbeddingResult,
} from './neural-embedding-engine';

// Temporal memory with decay, reinforcement, and consolidation
export {
  applyTemporalDecay,
  applyImportanceWeightedDecay,
  recordAccess,
  reinforceMemory,
  computeFinalRelevance,
  rankByRelevance,
  createTemporalMemory,
  runConsolidation,
  TemporalMemoryManager,
  DEFAULT_TEMPORAL_CONFIG,
  type TemporalMemory,
  type TemporalMemoryConfig,
  type MemoryType,
  type MemoryFeedback,
  type ConsolidationResult,
} from './temporal-memory';

// Embedding cache
export {
  createEmbeddingCache,
  createContentHashedCache,
  type EmbeddingCacheConfig,
  type CacheStats,
} from './embedding-cache';

// Fine-tuning pipeline
export {
  createFineTuningPipeline,
  type FineTuningConfig,
  type TrainingPair,
  type SynonymRelation,
  type FineTuningDataset,
} from './fine-tuning-pipeline';

// NEW: Embedding Router (n-gram ↔ neural with fallback)
export {
  reduceDimensions,
  generateNGramEmbeddingWithMeta,
  generateNeuralEmbedding as generateNeuralEmbeddingViaEdge,
  generateEmbeddingAuto,
  generateBatchEmbeddings as generateBatchEmbeddingsRouted,
  computeSimilarity,
  DEFAULT_NEURAL_CONFIG,
  type EmbeddingMode,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type NeuralEmbeddingConfig as RouterNeuralConfig,
} from './embedding-router';
