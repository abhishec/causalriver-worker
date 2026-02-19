/**
 * Infrastructure Utilities — 10M Architecture
 *
 * Production-grade building blocks for resilience, observability, lifecycle,
 * and the complete 10M signal architecture:
 *
 * Core Resilience:
 * - Retry with exponential backoff
 * - Circuit breaker (closed → open → half-open)
 * - Health check aggregator
 * - Graceful shutdown lifecycle manager
 *
 * 10M Scale Infrastructure:
 * - Redis client (in-memory dev / ioredis production)
 * - Redis Streams event bus (persistent, 10K+ events/sec)
 * - Worker pool with 4 compute tiers (realtime/interactive/background/scheduled)
 * - LRU cache with Redis write-through (bounded blackboard, CORE snapshot, fast-path)
 * - LLM semantic cache (40-60% hit rate, $savings)
 * - Data tier manager (hot/warm/cold/archive lifecycle)
 * - Streaming micro-batcher (OOM-safe pagination)
 * - Hardened security (JWT, HMAC, API keys, rate limiting, AES-256-GCM)
 */

// Core Resilience
export { createRetry, type RetryConfig, type RetryStats } from './retry';
export {
  createCircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  type CircuitState,
} from './circuit-breaker';
export {
  createHealthCheck,
  type HealthCheckConfig,
  type HealthStatus,
  type CheckResult,
  type CheckStatus,
  type OverallStatus,
  type HealthCheckFn,
} from './health';
export {
  createLifecycleManager,
  type LifecycleConfig,
  type LifecycleManager,
} from './lifecycle';

// Redis Client
export {
  createRedisClient,
  createInMemoryRedis,
  getRedisHealth,
  type RedisConfig,
  type RedisClientInstance,
  type RedisPipeline,
  type RedisHealthStatus,
} from './redis-client';

// Redis Streams Event Bus (Bottleneck #1 & #9)
export {
  createRedisStreamsBus,
  type RedisStreamsBusConfig,
  type RedisStreamsBusInstance,
  type StreamConsumerStats,
} from './redis-streams-bus';

// Worker Pool with Compute Tiers (Bottleneck #5)
export {
  createWorkerPool,
  type WorkerPoolConfig,
  type WorkerPoolInstance,
  type JobDefinition,
  type Job,
  type JobStatus,
  type JobProcessor,
  type JobHelpers,
  type QueueStats,
} from './worker-pool';

// LRU Cache (Bottleneck #2, #8)
export {
  createLRUCache,
  createAgentBlackboard,
  createCoreSnapshotCache,
  createFastPathCache,
  type LRUCacheConfig,
  type LRUCacheInstance,
  type CacheStats,
} from './lru-cache';

// LLM Semantic Cache (Bottleneck #7)
export {
  createSemanticCache,
  type SemanticCacheConfig,
  type SemanticCacheInstance,
  type SemanticCacheStats,
  type CachedResponse,
} from './llm-semantic-cache';

// Data Tier Manager (Bottleneck #6, Phase 2)
export {
  createDataTierManager,
  generatePartitionKey,
  parsePartitionKey,
  type DataTierManagerConfig,
  type DataTierManagerInstance,
  type DataEntry,
  type TierStats,
  type DemotionResult,
} from './data-tier-manager';

// Streaming Micro-Batcher (Bottleneck #4)
export {
  streamInBatches,
  createBatchIterator,
  streamInParallelBatches,
  type StreamingBatcherConfig,
  type StreamingStats,
  type BatchResult,
  type DataFetcher,
  type BatchProcessor,
} from './streaming-batcher';

// Memory Pressure Monitor (Dynamic OOM Prevention)
export {
  createMemoryPressureMonitor,
  type MemoryPressureMonitor,
  type MemoryPressureMonitorConfig,
  type MemorySnapshot,
  type MemoryStats,
  type PressureLevel,
} from './memory-pressure-monitor';

// Hardened Security
export {
  createHardenedSecurity,
  type SecurityConfig as HardenedSecurityConfig,
  type HardenedSecurityInstance,
  type JWTPayload,
  type APIKey,
  type RateLimitResult,
  type RequestFingerprint,
  type AuditEntry,
} from './security-hardened';
