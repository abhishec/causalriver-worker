/**
 * ARCHITECTURE-10M.ts — NexusBrain 10M Signal Architecture Specification
 *
 * This file defines the COMPLETE typed architecture for scaling NexusBrain
 * from 1K signals/sec to 10K+ signals/sec with 10M+ signals per org.
 *
 * 9 Bottlenecks That Break at 10M:
 * ┌───┬─────────────────────────────────┬──────────────────────┬──────────────────────────────────┐
 * │ # │ What Breaks                     │ How Fast             │ Fix                              │
 * ├───┼─────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
 * │ 1 │ Event bus (1K cap)              │ 0.5s — drops 99.9%   │ Redis Streams                    │
 * │ 2 │ Agent blackboard (unbounded)    │ 1min — OOM           │ LRU with 10K cap                 │
 * │ 3 │ PC algorithm O(n^4)             │ 5hrs — timeout       │ Incremental Granger + rebuild    │
 * │ 4 │ No pagination (all rows)        │ 10s — OOM            │ Streaming micro-batches          │
 * │ 5 │ Single Node.js process          │ hours — blocks loop  │ BullMQ worker pool               │
 * │ 6 │ pgvector untuned (122GB/org)    │ O(n) — irrelevant    │ Partitioned + 128d world model   │
 * │ 7 │ No LLM caching                 │ $200K/mo — limits    │ Semantic prompt cache (40-60%)   │
 * │ 8 │ CORE thundering herd           │ 30s — timeouts       │ Redis snapshot cache             │
 * │ 9 │ In-memory event bus             │ restart — all lost   │ Persistent Redis Streams         │
 * └───┴─────────────────────────────────┴──────────────────────┴──────────────────────────────────┘
 *
 * @packageDocumentation
 */

// ============================================================================
// 1. STORAGE TIERS — 4-tier hot/warm/cold/archive
// ============================================================================

export type StorageTier = 'hot' | 'warm' | 'cold' | 'archive';

export interface StorageTierConfig {
  /** Hot: Redis — sub-10ms reads, 10K writes/sec */
  hot: {
    engine: 'redis';
    maxMemoryMB: number;
    evictionPolicy: 'allkeys-lru' | 'volatile-lru' | 'volatile-ttl';
    ttlSeconds: number;
    dataTypes: ('event_stream' | 'core_snapshot' | 'llm_cache' | 'agent_blackboard' | 'session')[];
  };
  /** Warm: PostgreSQL partitioned — <100ms queries, org x month partitions */
  warm: {
    engine: 'postgresql';
    partitionStrategy: 'org_month';
    retentionMonths: number;
    indexStrategy: 'btree_gin_composite';
    dataTypes: ('signals' | 'causal_edges' | 'patterns' | 'rules' | 'predictions' | 'outcomes')[];
  };
  /** Cold: Parquet on disk or S3 — batch analytics, ML training */
  cold: {
    engine: 'parquet';
    compressionCodec: 'snappy' | 'zstd' | 'gzip';
    retentionMonths: number;
    dataTypes: ('historical_signals' | 'training_data' | 'audit_logs')[];
  };
  /** Archive: S3/GCS — compliance, long-term retention */
  archive: {
    engine: 's3' | 'gcs';
    storageClass: 'GLACIER' | 'DEEP_ARCHIVE' | 'COLDLINE';
    retentionYears: number;
    dataTypes: ('compliance_exports' | 'full_backups')[];
  };
}

export const DEFAULT_STORAGE_TIERS: StorageTierConfig = {
  hot: {
    engine: 'redis',
    maxMemoryMB: 512,
    evictionPolicy: 'allkeys-lru',
    ttlSeconds: 3600,
    dataTypes: ['event_stream', 'core_snapshot', 'llm_cache', 'agent_blackboard', 'session'],
  },
  warm: {
    engine: 'postgresql',
    partitionStrategy: 'org_month',
    retentionMonths: 12,
    indexStrategy: 'btree_gin_composite',
    dataTypes: ['signals', 'causal_edges', 'patterns', 'rules', 'predictions', 'outcomes'],
  },
  cold: {
    engine: 'parquet',
    compressionCodec: 'zstd',
    retentionMonths: 36,
    dataTypes: ['historical_signals', 'training_data', 'audit_logs'],
  },
  archive: {
    engine: 's3',
    storageClass: 'GLACIER',
    retentionYears: 7,
    dataTypes: ['compliance_exports', 'full_backups'],
  },
};

// ============================================================================
// 2. COMPUTE TIERS — 4-tier realtime/interactive/background/scheduled
// ============================================================================

export type ComputeTier = 'realtime' | 'interactive' | 'background' | 'scheduled';

export interface ComputeTierConfig {
  /** Realtime: <100ms — event bus routing, cache lookups, fast-path queries */
  realtime: {
    maxLatencyMs: 100;
    concurrency: number;
    operations: ('event_routing' | 'cache_lookup' | 'fast_path_query' | 'health_check')[];
  };
  /** Interactive: <5s — brain queries, action domains, agent dispatch */
  interactive: {
    maxLatencyMs: 5000;
    concurrency: number;
    operations: ('brain_query' | 'action_domain' | 'agent_dispatch' | 'llm_call')[];
  };
  /** Background: <5min — causal discovery, pattern mining, consolidation */
  background: {
    maxLatencyMs: 300000;
    concurrency: number;
    operations: ('causal_discovery' | 'pattern_mining' | 'anomaly_sweep' | 'embedding_generation')[];
  };
  /** Scheduled: <2hr — nightly consolidation, training, data demotion */
  scheduled: {
    maxLatencyMs: 7200000;
    concurrency: number;
    operations: ('nightly_consolidation' | 'brain_training' | 'data_demotion' | 'backup')[];
  };
}

export const DEFAULT_COMPUTE_TIERS: ComputeTierConfig = {
  realtime: { maxLatencyMs: 100, concurrency: 100, operations: ['event_routing', 'cache_lookup', 'fast_path_query', 'health_check'] },
  interactive: { maxLatencyMs: 5000, concurrency: 20, operations: ['brain_query', 'action_domain', 'agent_dispatch', 'llm_call'] },
  background: { maxLatencyMs: 300000, concurrency: 10, operations: ['causal_discovery', 'pattern_mining', 'anomaly_sweep', 'embedding_generation'] },
  scheduled: { maxLatencyMs: 7200000, concurrency: 2, operations: ['nightly_consolidation', 'brain_training', 'data_demotion', 'backup'] },
};

// ============================================================================
// 3. INGESTION — Redis Streams + micro-batch workers
// ============================================================================

export interface IngestionConfig {
  /** Redis Streams consumer group for persistent event ingestion */
  stream: {
    streamKey: string;
    consumerGroup: string;
    maxStreamLength: number;
    blockTimeMs: number;
    batchSize: number;
  };
  /** Worker pool for micro-batch processing */
  workers: {
    count: number;
    targetThroughput: number;
    maxBatchSize: number;
    flushIntervalMs: number;
  };
  /** Backpressure configuration */
  backpressure: {
    maxPendingMessages: number;
    strategy: 'drop_oldest' | 'reject_new' | 'spill_to_disk';
    spillPath?: string;
  };
}

export const DEFAULT_INGESTION: IngestionConfig = {
  stream: {
    streamKey: 'nexus:events',
    consumerGroup: 'nexus-workers',
    maxStreamLength: 100_000,
    blockTimeMs: 2000,
    batchSize: 100,
  },
  workers: {
    count: 10,
    targetThroughput: 10_000,
    maxBatchSize: 100,
    flushIntervalMs: 1000,
  },
  backpressure: {
    maxPendingMessages: 50_000,
    strategy: 'drop_oldest',
  },
};

// ============================================================================
// 4. FEDERATION — CORE as pre-computed snapshot, NOT live queries
// ============================================================================

export interface FederationConfig {
  /** CORE brain snapshot cached in Redis */
  coreSnapshot: {
    cacheKey: string;
    refreshIntervalMs: number;
    maxEdges: number;
    maxMemories: number;
    compressionEnabled: boolean;
  };
  /** Cross-org validation */
  crossValidation: {
    enabled: boolean;
    minOrgsForConsensus: number;
    confidenceThreshold: number;
    privacyPreserving: boolean;
  };
  /** World model — 384d representation (aligned with pgvector column and embedding-router) */
  worldModel: {
    dimensions: 384;
    maxEntities: number;
    updateFrequencyMs: number;
    storageEngine: 'redis';
  };
}

export const DEFAULT_FEDERATION: FederationConfig = {
  coreSnapshot: {
    cacheKey: 'nexus:core:snapshot',
    refreshIntervalMs: 300_000,
    maxEdges: 200,
    maxMemories: 50_000,
    compressionEnabled: true,
  },
  crossValidation: {
    enabled: true,
    minOrgsForConsensus: 3,
    confidenceThreshold: 0.7,
    privacyPreserving: true,
  },
  worldModel: {
    dimensions: 384,
    maxEntities: 100_000,
    updateFrequencyMs: 60_000,
    storageEngine: 'redis',
  },
};

// ============================================================================
// 5. THE 15 LEAPS — Each mapped to compute tier
// ============================================================================

export type LeapId =
  | 'world_model'
  | 'reasoning'
  | 'dreaming'
  | 'memory'
  | 'curiosity'
  | 'self_modification'
  | 'federation'
  | 'imagination'
  | 'theory_of_mind'
  | 'temporal'
  | 'red_team'
  | 'experimentation'
  | 'immune_system'
  | 'goal_backward'
  | 'narrative';

export type LeapStatus = 'implemented' | 'paper_only' | 'in_progress';

export interface LeapDefinition {
  id: LeapId;
  name: string;
  description: string;
  computeTier: ComputeTier;
  status: LeapStatus;
  brainRegion: string;
  operatesOn: string;
}

export const LEAPS: LeapDefinition[] = [
  // Done (1-10)
  { id: 'world_model', name: 'World Model', description: 'Compressed causal graph of ~200 edges representing organizational state', computeTier: 'background', status: 'implemented', brainRegion: 'Hippocampus', operatesOn: '~200 edges' },
  { id: 'reasoning', name: 'Causal Reasoning', description: 'Multi-hop reasoning across causal DAG with uncertainty propagation', computeTier: 'interactive', status: 'implemented', brainRegion: 'Prefrontal Cortex', operatesOn: '~200 edges' },
  { id: 'dreaming', name: 'Dreaming (Consolidation)', description: 'Nightly consolidation — prune weak edges, strengthen confirmed ones', computeTier: 'scheduled', status: 'implemented', brainRegion: 'Default Mode Network', operatesOn: '50K memories' },
  { id: 'memory', name: 'Episodic Memory', description: 'Signal→outcome→learning pipeline with multi-checkpoint tracking', computeTier: 'background', status: 'implemented', brainRegion: 'Hippocampus', operatesOn: '50K memories' },
  { id: 'curiosity', name: 'Active Curiosity', description: 'Information-seeking behavior — identifies knowledge gaps and requests data', computeTier: 'background', status: 'implemented', brainRegion: 'Anterior Cingulate', operatesOn: 'Knowledge gaps' },
  { id: 'self_modification', name: 'Self-Modification', description: 'Bayesian weight updates, threshold optimization, attention policy learning', computeTier: 'background', status: 'implemented', brainRegion: 'Cerebellum', operatesOn: 'Model weights' },
  { id: 'federation', name: 'Federation', description: 'Multi-org knowledge sharing with PII sanitization and upstream promotion', computeTier: 'scheduled', status: 'implemented', brainRegion: 'Corpus Callosum', operatesOn: 'Cross-org edges' },
  { id: 'imagination', name: 'Imagination (What-If)', description: 'Counterfactual simulation with uncertainty propagation', computeTier: 'interactive', status: 'implemented', brainRegion: 'Prefrontal Cortex', operatesOn: '~200 edges' },
  { id: 'theory_of_mind', name: 'Theory of Mind', description: 'User persona modeling — role, expertise, attention preferences', computeTier: 'realtime', status: 'implemented', brainRegion: 'TPJ', operatesOn: 'User context' },
  { id: 'temporal', name: 'Temporal Reasoning', description: 'DAG-informed time-series forecasting with backtesting', computeTier: 'interactive', status: 'implemented', brainRegion: 'Predictive Cortex', operatesOn: 'Time series' },

  // Done (11-15) — Mind layers: fully implemented
  { id: 'red_team', name: 'Red Team (Adversarial)', description: 'Adversarial self-testing — generates attack scenarios to stress-test predictions', computeTier: 'scheduled', status: 'implemented', brainRegion: 'Amygdala', operatesOn: 'Predictions' },
  { id: 'experimentation', name: 'Experimentation', description: 'A/B test design from causal graph — suggests interventions and measures outcomes', computeTier: 'background', status: 'implemented', brainRegion: 'Scientific Method', operatesOn: 'Interventions' },
  { id: 'immune_system', name: 'Immune System', description: 'Anomaly quarantine, data quality scoring, poison detection', computeTier: 'realtime', status: 'implemented', brainRegion: 'Immune Response', operatesOn: 'All signals' },
  { id: 'goal_backward', name: 'Goal-Backward Planning', description: 'Given a target metric, reverse-engineer the causal chain to find interventions', computeTier: 'interactive', status: 'implemented', brainRegion: 'Prefrontal Planning', operatesOn: '~200 edges' },
  { id: 'narrative', name: 'Narrative Intelligence', description: 'Generates executive narratives from causal insights — the "story" of what happened', computeTier: 'interactive', status: 'implemented', brainRegion: 'Broca+Wernicke', operatesOn: 'Insights' },
];

// ============================================================================
// 6. COST MODEL
// ============================================================================

export interface CostModel {
  perOrgPerMonth: {
    at100Orgs: number;
    at1000Orgs: number;
  };
  breakdown: {
    redis: number;
    postgresql: number;
    compute: number;
    llm: number;
    storage: number;
    bandwidth: number;
  };
}

export const DEFAULT_COST_MODEL: CostModel = {
  perOrgPerMonth: {
    at100Orgs: 117,
    at1000Orgs: 55,
  },
  breakdown: {
    redis: 15,
    postgresql: 30,
    compute: 25,
    llm: 35,
    storage: 7,
    bandwidth: 5,
  },
};

// ============================================================================
// 7. MIGRATION PHASES
// ============================================================================

export type MigrationPhase = 1 | 2 | 3 | 4 | 5;
export type MigrationStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface MigrationPhaseDefinition {
  phase: MigrationPhase;
  name: string;
  description: string;
  weekStart: number;
  weekEnd: number;
  deliverables: string[];
  status: MigrationStatus;
  completionPct: number;
}

export const MIGRATION_PHASES: MigrationPhaseDefinition[] = [
  {
    phase: 1,
    name: 'Stop the Bleeding',
    description: 'Redis Streams event bus, BullMQ workers, bounded agent blackboard',
    weekStart: 1,
    weekEnd: 3,
    deliverables: [
      'Redis Streams event bus replacing in-memory bus',
      'BullMQ worker pool for background jobs',
      'LRU-bounded agent blackboard (10K cap)',
      'Streaming micro-batch pagination',
    ],
    status: 'completed',
    completionPct: 100,
  },
  {
    phase: 2,
    name: 'Partition + Tier',
    description: 'PostgreSQL partitioning, tiered storage, pgvector optimization',
    weekStart: 3,
    weekEnd: 6,
    deliverables: [
      'PG table partitioning (org x month)',
      'Data demotion pipeline (hot → warm → cold)',
      'pgvector with 128d world model in Redis',
      'Parquet export for cold storage',
    ],
    status: 'completed',
    completionPct: 100,
  },
  {
    phase: 3,
    name: 'Worker Architecture',
    description: 'Multi-process compute with BullMQ, 4 compute tiers',
    weekStart: 5,
    weekEnd: 8,
    deliverables: [
      'BullMQ job queues per compute tier',
      'Worker pool with auto-scaling',
      'Job priority, retry, dead-letter queues',
      'Compute tier routing',
    ],
    status: 'completed',
    completionPct: 100,
  },
  {
    phase: 4,
    name: 'Federation Redesign',
    description: 'CORE snapshot cache, cross-org validation, world model',
    weekStart: 7,
    weekEnd: 10,
    deliverables: [
      'CORE brain snapshot in Redis (<1ms reads)',
      'Cross-org validation pipeline',
      '128d world model in Redis',
      'Federated learning without raw data sharing',
    ],
    status: 'completed',
    completionPct: 100,
  },
  {
    phase: 5,
    name: '15 Leaps Complete',
    description: 'All 15 cognitive layers implemented: Brain (1-7) + Mind (8-15)',
    weekStart: 9,
    weekEnd: 12,
    deliverables: [
      'Layer 3-10: Deep Dreaming, Hierarchical Memory, Curiosity Engine, Self-Modifying Cognition, Intelligence Mesh, Causal Imagination, Theory of Mind, Temporal Consciousness',
      'Layer 11: Red Team adversarial self-testing',
      'Layer 12: Experimentation engine',
      'Layer 13: Immune System (anomaly quarantine)',
      'Layer 14: Goal-Backward planning',
      'Layer 15: Narrative Intelligence',
    ],
    status: 'completed',
    completionPct: 100,
  },
];

// ============================================================================
// 8. BOTTLENECK REGISTRY
// ============================================================================

export type BottleneckSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BottleneckStatus = 'open' | 'mitigated' | 'resolved';

export interface Bottleneck {
  id: number;
  name: string;
  severity: BottleneckSeverity;
  whatBreaks: string;
  howFast: string;
  fix: string;
  status: BottleneckStatus;
  migrationPhase: MigrationPhase;
}

export const BOTTLENECKS: Bottleneck[] = [
  { id: 1, name: 'Event Bus Cap', severity: 'critical', whatBreaks: 'Event bus (1K cap)', howFast: '0.5s — drops 99.9%', fix: 'Redis Streams', status: 'resolved', migrationPhase: 1 },
  { id: 2, name: 'Agent Blackboard OOM', severity: 'critical', whatBreaks: 'Agent blackboard (unbounded)', howFast: '1min — OOM', fix: 'LRU with 10K cap', status: 'resolved', migrationPhase: 1 },
  { id: 3, name: 'PC Algorithm Timeout', severity: 'high', whatBreaks: 'PC algorithm O(n^4)', howFast: '5hrs — timeout', fix: 'Incremental Granger + weekly rebuild', status: 'resolved', migrationPhase: 2 },
  { id: 4, name: 'No Pagination OOM', severity: 'high', whatBreaks: 'No pagination (all rows)', howFast: '10s — OOM', fix: 'Streaming micro-batches', status: 'resolved', migrationPhase: 1 },
  { id: 5, name: 'Single Process Block', severity: 'critical', whatBreaks: 'Single Node.js process', howFast: 'hours — blocks loop', fix: 'BullMQ worker pool', status: 'resolved', migrationPhase: 3 },
  { id: 6, name: 'pgvector Untuned', severity: 'high', whatBreaks: 'pgvector untuned (122GB/org)', howFast: 'O(n) — irrelevant', fix: 'Partitioned + 128d world model', status: 'resolved', migrationPhase: 2 },
  { id: 7, name: 'No LLM Cache', severity: 'high', whatBreaks: 'No LLM caching', howFast: '$200K/mo — limits', fix: 'Semantic prompt cache (40-60%)', status: 'resolved', migrationPhase: 3 },
  { id: 8, name: 'CORE Thundering Herd', severity: 'high', whatBreaks: 'CORE thundering herd', howFast: '30s — timeouts', fix: 'Redis snapshot cache', status: 'resolved', migrationPhase: 4 },
  { id: 9, name: 'In-Memory Bus No Persist', severity: 'critical', whatBreaks: 'In-memory event bus', howFast: 'restart — all lost', fix: 'Persistent Redis Streams', status: 'resolved', migrationPhase: 1 },
];

// ============================================================================
// 9. SECURITY HARDENING
// ============================================================================

export interface SecurityConfig {
  /** Authentication */
  auth: {
    method: 'jwt' | 'api_key' | 'both';
    jwtAlgorithm: 'RS256' | 'ES256';
    apiKeyRotationDays: number;
    sessionTTLMinutes: number;
  };
  /** Encryption */
  encryption: {
    atRest: 'AES-256-GCM';
    inTransit: 'TLS-1.3';
    keyManagement: 'envelope' | 'kms';
    fieldLevel: boolean;
  };
  /** Rate limiting */
  rateLimiting: {
    requestsPerMinute: number;
    tokensPerDay: number;
    burstMultiplier: number;
    perOrg: boolean;
    perUser: boolean;
  };
  /** Audit */
  audit: {
    enabled: boolean;
    immutable: boolean;
    retentionDays: number;
    alertOnSuspicious: boolean;
  };
  /** Network */
  network: {
    corsOrigins: string[];
    ipWhitelist: boolean;
    ddosProtection: boolean;
    requestSigning: boolean;
  };
}

export const DEFAULT_SECURITY: SecurityConfig = {
  auth: {
    method: 'both',
    jwtAlgorithm: 'RS256',
    apiKeyRotationDays: 90,
    sessionTTLMinutes: 60,
  },
  encryption: {
    atRest: 'AES-256-GCM',
    inTransit: 'TLS-1.3',
    keyManagement: 'envelope',
    fieldLevel: true,
  },
  rateLimiting: {
    requestsPerMinute: 100,
    tokensPerDay: 100_000,
    burstMultiplier: 3,
    perOrg: true,
    perUser: true,
  },
  audit: {
    enabled: true,
    immutable: true,
    retentionDays: 365,
    alertOnSuspicious: true,
  },
  network: {
    corsOrigins: [],
    ipWhitelist: false,
    ddosProtection: true,
    requestSigning: true,
  },
};

// ============================================================================
// 10. COMPLETE ARCHITECTURE — The Master Config
// ============================================================================

export interface Architecture10M {
  version: string;
  storage: StorageTierConfig;
  compute: ComputeTierConfig;
  ingestion: IngestionConfig;
  federation: FederationConfig;
  leaps: LeapDefinition[];
  cost: CostModel;
  migration: MigrationPhaseDefinition[];
  bottlenecks: Bottleneck[];
  security: SecurityConfig;
}

export const ARCHITECTURE_10M: Architecture10M = {
  version: '1.0.0',
  storage: DEFAULT_STORAGE_TIERS,
  compute: DEFAULT_COMPUTE_TIERS,
  ingestion: DEFAULT_INGESTION,
  federation: DEFAULT_FEDERATION,
  leaps: LEAPS,
  cost: DEFAULT_COST_MODEL,
  migration: MIGRATION_PHASES,
  bottlenecks: BOTTLENECKS,
  security: DEFAULT_SECURITY,
};

// ============================================================================
// HELPERS
// ============================================================================

export function getOpenBottlenecks(): Bottleneck[] {
  return BOTTLENECKS.filter(b => b.status === 'open');
}

export function getCriticalBottlenecks(): Bottleneck[] {
  return BOTTLENECKS.filter(b => b.severity === 'critical' && b.status === 'open');
}

export function getLeapsByStatus(status: LeapStatus): LeapDefinition[] {
  return LEAPS.filter(l => l.status === status);
}

export function getMigrationProgress(): { phase: number; name: string; pct: number }[] {
  return MIGRATION_PHASES.map(p => ({ phase: p.phase, name: p.name, pct: p.completionPct }));
}

export function getArchitectureScore(): {
  bottlenecksResolved: number;
  bottlenecksTotal: number;
  leapsImplemented: number;
  leapsTotal: number;
  migrationPct: number;
  overallScore: string;
} {
  const resolved = BOTTLENECKS.filter(b => b.status === 'resolved').length;
  const implemented = LEAPS.filter(l => l.status === 'implemented').length;
  const migrationPct = Math.round(
    MIGRATION_PHASES.reduce((sum, p) => sum + p.completionPct, 0) / MIGRATION_PHASES.length
  );
  const score = Math.round(
    (resolved / BOTTLENECKS.length) * 33 +
    (implemented / LEAPS.length) * 34 +
    (migrationPct / 100) * 33
  );
  return {
    bottlenecksResolved: resolved,
    bottlenecksTotal: BOTTLENECKS.length,
    leapsImplemented: implemented,
    leapsTotal: LEAPS.length,
    migrationPct,
    overallScore: `${score}/100`,
  };
}
