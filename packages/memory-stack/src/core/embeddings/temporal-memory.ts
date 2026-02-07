/**
 * Temporal Memory Module
 * 
 * Implements memory decay and reinforcement based on access patterns.
 * Memories fade over time but strengthen with repeated use and
 * positive outcome feedback.
 * 
 * Key Concepts:
 * - Exponential Decay: relevance(t) = base × e^(-λt)
 * - Reinforcement: Boost when memory proves useful
 * - Spaced Repetition: More durable with distributed access
 * 
 * This creates "living" organizational memory that naturally
 * prioritizes recent and validated knowledge.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TemporalMemoryConfig {
  /** Base decay rate (λ) - higher = faster decay */
  decayRate: number;
  /** Minimum relevance floor (never goes below this) */
  minRelevance: number;
  /** Boost multiplier for positive feedback */
  reinforcementBoost: number;
  /** Penalty multiplier for negative feedback */
  reinforcementPenalty: number;
  /** Half-life in days for different memory types */
  halfLifeDays: Record<MemoryType, number>;
}

export type MemoryType = 
  | 'fact'        // Long-lasting facts about entities
  | 'pattern'     // Discovered patterns (moderate decay)
  | 'prediction'  // Short-lived predictions
  | 'insight'     // Context-dependent insights
  | 'rule'        // Business rules (slow decay)
  | 'anomaly';    // Detected anomalies (fast decay)

export interface TemporalMemory {
  id: string;
  type: MemoryType;
  
  // Core content
  content: unknown;
  embedding?: number[];
  
  // Temporal tracking
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  
  // Relevance scoring
  baseRelevance: number;
  currentRelevance: number;
  decayRate: number;
  
  // Reinforcement tracking
  reinforcementScore: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  accuracyHistory: number[]; // Recent accuracy scores
}

export interface DecayResult {
  previousRelevance: number;
  newRelevance: number;
  decayFactor: number;
  daysSinceAccess: number;
  shouldPrune: boolean;
}

export interface ReinforcementResult {
  previousScore: number;
  newScore: number;
  reinforcementDelta: number;
  feedbackType: 'positive' | 'negative' | 'neutral';
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_TEMPORAL_CONFIG: TemporalMemoryConfig = {
  decayRate: 0.01,
  minRelevance: 0.1,
  reinforcementBoost: 1.5,
  reinforcementPenalty: 0.7,
  halfLifeDays: {
    fact: 365,       // Facts persist for a year
    pattern: 90,     // Patterns last a quarter
    prediction: 30,  // Predictions fade in a month
    insight: 60,     // Insights last 2 months
    rule: 180,       // Rules last 6 months
    anomaly: 7       // Anomalies decay weekly
  }
};

// ============================================================================
// DECAY FUNCTIONS
// ============================================================================

/**
 * Apply temporal decay to a memory based on time since last access
 */
export function applyTemporalDecay(
  memory: TemporalMemory,
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): DecayResult {
  const now = new Date();
  const daysSinceAccess = 
    (now.getTime() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
  
  // Get decay rate for this memory type
  const halfLife = config.halfLifeDays[memory.type];
  const lambda = Math.log(2) / halfLife;
  
  // Apply exponential decay: R(t) = R₀ × e^(-λt)
  const decayFactor = Math.exp(-lambda * daysSinceAccess);
  const decayedRelevance = memory.baseRelevance * decayFactor;
  
  // Apply reinforcement boost
  const reinforcedRelevance = decayedRelevance * (1 + memory.reinforcementScore);
  
  // Floor at minimum relevance
  const newRelevance = Math.max(
    reinforcedRelevance,
    config.minRelevance
  );
  
  return {
    previousRelevance: memory.currentRelevance,
    newRelevance,
    decayFactor,
    daysSinceAccess,
    shouldPrune: newRelevance <= config.minRelevance && memory.accessCount < 3
  };
}

/**
 * Update memory after access (refreshes relevance)
 */
export function recordAccess(memory: TemporalMemory): TemporalMemory {
  const now = new Date();
  const daysSinceLastAccess = 
    (now.getTime() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
  
  // Spaced repetition bonus: more durable if accessed after a gap
  const spacingBonus = Math.min(daysSinceLastAccess / 7, 0.5); // Max 0.5 bonus
  
  return {
    ...memory,
    lastAccessedAt: now,
    accessCount: memory.accessCount + 1,
    currentRelevance: Math.min(
      memory.baseRelevance * (1 + spacingBonus),
      1.0
    ),
    reinforcementScore: memory.reinforcementScore + spacingBonus * 0.1
  };
}

/**
 * Batch apply decay to multiple memories
 */
export function batchApplyDecay(
  memories: TemporalMemory[],
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): Array<{ memory: TemporalMemory; result: DecayResult }> {
  return memories.map(memory => ({
    memory,
    result: applyTemporalDecay(memory, config)
  }));
}

// ============================================================================
// REINFORCEMENT FUNCTIONS
// ============================================================================

/**
 * Reinforce memory based on outcome feedback
 */
export function reinforceMemory(
  memory: TemporalMemory,
  feedback: MemoryFeedback,
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): ReinforcementResult {
  const previousScore = memory.reinforcementScore;
  let delta = 0;
  let feedbackType: 'positive' | 'negative' | 'neutral' = 'neutral';
  
  if (feedback.isPositive) {
    // Positive reinforcement
    delta = (1 - previousScore) * (config.reinforcementBoost - 1);
    feedbackType = 'positive';
    memory.positiveFeedbackCount++;
    memory.accuracyHistory.push(1);
  } else if (feedback.isNegative) {
    // Negative reinforcement (decay)
    delta = previousScore * (config.reinforcementPenalty - 1);
    feedbackType = 'negative';
    memory.negativeFeedbackCount++;
    memory.accuracyHistory.push(0);
  }
  
  // Apply confidence weighting
  delta *= feedback.confidence;
  
  // Update reinforcement score
  memory.reinforcementScore = Math.max(0, Math.min(2, previousScore + delta));
  
  // Keep only recent accuracy history
  if (memory.accuracyHistory.length > 10) {
    memory.accuracyHistory = memory.accuracyHistory.slice(-10);
  }
  
  return {
    previousScore,
    newScore: memory.reinforcementScore,
    reinforcementDelta: delta,
    feedbackType
  };
}

export interface MemoryFeedback {
  /** Was this memory useful/accurate? */
  isPositive: boolean;
  /** Was this memory wrong/misleading? */
  isNegative: boolean;
  /** Confidence in the feedback (0-1) */
  confidence: number;
  /** Optional outcome details */
  outcomeDetails?: string;
}

/**
 * Compute rolling accuracy for a memory
 */
export function computeAccuracy(memory: TemporalMemory): number {
  if (memory.accuracyHistory.length === 0) return 0.5; // Prior
  
  const sum = memory.accuracyHistory.reduce((a, b) => a + b, 0);
  return sum / memory.accuracyHistory.length;
}

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Compute final relevance score for retrieval ranking
 * Combines: base similarity × temporal decay × reinforcement × recency
 */
export function computeFinalRelevance(
  memory: TemporalMemory,
  baseSimilarity: number,
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): number {
  // Apply temporal decay
  const decayResult = applyTemporalDecay(memory, config);
  
  // Compute access frequency bonus (logarithmic)
  const frequencyBonus = Math.log(1 + memory.accessCount) / 10;
  
  // Compute accuracy bonus
  const accuracy = computeAccuracy(memory);
  const accuracyBonus = (accuracy - 0.5) * 0.5; // Range: -0.25 to +0.25
  
  // Final score
  const score = baseSimilarity * 
                decayResult.newRelevance * 
                (1 + memory.reinforcementScore) *
                (1 + frequencyBonus) *
                (1 + accuracyBonus);
  
  return Math.min(score, 1.0);
}

/**
 * Rank memories by temporal relevance
 */
export function rankByRelevance(
  memories: TemporalMemory[],
  querySimilarities: Map<string, number>,
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): TemporalMemory[] {
  return memories
    .map(memory => ({
      memory,
      score: computeFinalRelevance(
        memory,
        querySimilarities.get(memory.id) || 0,
        config
      )
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory);
}

// ============================================================================
// MEMORY LIFECYCLE
// ============================================================================

/**
 * Create a new temporal memory
 */
export function createTemporalMemory(
  id: string,
  type: MemoryType,
  content: unknown,
  embedding?: number[]
): TemporalMemory {
  const now = new Date();
  
  return {
    id,
    type,
    content,
    embedding,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    baseRelevance: 1.0,
    currentRelevance: 1.0,
    decayRate: DEFAULT_TEMPORAL_CONFIG.decayRate,
    reinforcementScore: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    accuracyHistory: []
  };
}

/**
 * Identify memories that should be pruned
 */
export function identifyPrunable(
  memories: TemporalMemory[],
  config: TemporalMemoryConfig = DEFAULT_TEMPORAL_CONFIG
): TemporalMemory[] {
  return memories.filter(memory => {
    const result = applyTemporalDecay(memory, config);
    return result.shouldPrune;
  });
}

/**
 * Consolidate similar memories
 * (Merge near-duplicate memories to reduce redundancy)
 */
export function consolidateMemories(
  memories: TemporalMemory[],
  similarityThreshold: number = 0.95
): TemporalMemory[] {
  if (!memories[0]?.embedding) return memories;
  
  const consolidated: TemporalMemory[] = [];
  const merged = new Set<string>();
  
  for (let i = 0; i < memories.length; i++) {
    if (merged.has(memories[i].id)) continue;
    
    let primary = memories[i];
    
    for (let j = i + 1; j < memories.length; j++) {
      if (merged.has(memories[j].id)) continue;
      
      const similarity = cosineSimilarity(
        primary.embedding!,
        memories[j].embedding!
      );
      
      if (similarity > similarityThreshold) {
        // Merge into primary
        primary = mergeMemories(primary, memories[j]);
        merged.add(memories[j].id);
      }
    }
    
    consolidated.push(primary);
  }
  
  return consolidated;
}

function mergeMemories(
  primary: TemporalMemory,
  secondary: TemporalMemory
): TemporalMemory {
  return {
    ...primary,
    accessCount: primary.accessCount + secondary.accessCount,
    reinforcementScore: Math.max(
      primary.reinforcementScore,
      secondary.reinforcementScore
    ),
    positiveFeedbackCount: 
      primary.positiveFeedbackCount + secondary.positiveFeedbackCount,
    negativeFeedbackCount: 
      primary.negativeFeedbackCount + secondary.negativeFeedbackCount,
    accuracyHistory: [
      ...primary.accuracyHistory,
      ...secondary.accuracyHistory
    ].slice(-10)
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const TemporalMemoryManager = {
  applyTemporalDecay,
  recordAccess,
  batchApplyDecay,
  reinforceMemory,
  computeAccuracy,
  computeFinalRelevance,
  rankByRelevance,
  createTemporalMemory,
  identifyPrunable,
  consolidateMemories
};
