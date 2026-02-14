/**
 * Layer 4: Hierarchical Memory — Working / Episodic / Semantic Memory
 *
 * A 3-tier memory hierarchy inspired by cognitive science:
 *   - Working Memory:  Limited capacity (7±2 items), active maintenance, attention-gated
 *   - Episodic Memory: Event sequences with full context (who/what/when/where/why)
 *   - Semantic Memory:  Abstracted, durable knowledge distilled from repeated episodes
 *
 * Memory flows UPWARD: signals enter working memory → consolidated to episodic →
 * repeated episodic patterns distill into semantic knowledge.
 *
 * Brain Analog: Hippocampal Formation (CA1→CA3→DG→Entorhinal Cortex)
 * Compute Tier: background (continuous encoding, periodic consolidation)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HierarchicalMemoryConfig {
  /** Max items in working memory (default: 9 — the 7±2 rule) */
  workingMemoryCapacity?: number;
  /** Working memory decay rate in ms (default: 300000 — 5 min) */
  workingMemoryDecayMs?: number;
  /** Max episodes stored (default: 10000) */
  maxEpisodes?: number;
  /** Min episode occurrences before semantic distillation (default: 3) */
  semanticDistillationThreshold?: number;
  /** Semantic memory max entries (default: 5000) */
  maxSemanticEntries?: number;
  /** Episode boundary detection gap in ms (default: 3600000 — 1 hour) */
  episodeBoundaryGapMs?: number;
}

// --- Working Memory ---

export interface WorkingMemoryItem {
  id: string;
  content: string;
  domain: string;
  importance: number;
  activationLevel: number;
  enteredAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata?: Record<string, unknown>;
}

// --- Episodic Memory ---

export interface Episode {
  id: string;
  /** Who was involved */
  actors: string[];
  /** What happened */
  events: EpisodicEvent[];
  /** When (start and end timestamps) */
  startTime: number;
  endTime: number;
  /** Where (domain/context) */
  domain: string;
  context: string;
  /** Why (inferred cause, if known) */
  cause?: string;
  /** Outcome of this episode */
  outcome?: string;
  /** Emotional valence (-1 to 1: negative to positive) */
  valence: number;
  /** Number of times this episode pattern has repeated */
  recurrenceCount: number;
  /** Has this been distilled into semantic memory? */
  distilled: boolean;
  /** Tags for retrieval */
  tags: string[];
}

export interface EpisodicEvent {
  timestamp: number;
  type: string;
  description: string;
  signalId?: string;
  value?: number;
}

// --- Semantic Memory ---

export interface SemanticFact {
  id: string;
  /** The abstract knowledge */
  knowledge: string;
  /** Domain this applies to */
  domain: string;
  /** Confidence based on evidence count */
  confidence: number;
  /** Number of episodes that support this fact */
  evidenceCount: number;
  /** When first established */
  createdAt: number;
  /** Last time evidence was added */
  lastReinforced: number;
  /** Source episode IDs */
  sourceEpisodeIds: string[];
  /** Durability score (how resistant to decay) */
  durability: number;
}

// --- Results ---

export interface MemoryRetrievalResult {
  /** Items from working memory */
  workingMemory: WorkingMemoryItem[];
  /** Relevant episodes */
  episodes: Episode[];
  /** Relevant semantic facts */
  semanticFacts: SemanticFact[];
  /** Search latency */
  latencyMs: number;
}

export interface ConsolidationResult {
  /** Items moved from working to episodic */
  encodedEpisodes: number;
  /** Episodes distilled into semantic facts */
  distilledFacts: number;
  /** Decayed working memory items removed */
  decayedItems: number;
  /** New semantic facts created */
  newSemanticFacts: SemanticFact[];
}

export interface HierarchicalMemoryStats {
  workingMemoryUsage: number;
  workingMemoryCapacity: number;
  totalEpisodes: number;
  totalSemanticFacts: number;
  averageEpisodeLength: number;
  mostRecurringPatterns: { knowledge: string; count: number }[];
  oldestSemanticFact: number;
  consolidationCount: number;
}

export interface HierarchicalMemoryInstance {
  /** Encode a signal into working memory */
  encode: (item: Omit<WorkingMemoryItem, 'activationLevel' | 'enteredAt' | 'lastAccessedAt' | 'accessCount'>) => void;
  /** Retrieve memories across all tiers matching a query */
  retrieve: (query: string, domain?: string) => MemoryRetrievalResult;
  /** Consolidate: working → episodic → semantic */
  consolidate: () => ConsolidationResult;
  /** Record a complete episode directly */
  recordEpisode: (episode: Omit<Episode, 'id' | 'recurrenceCount' | 'distilled'>) => string;
  /** Get current working memory contents */
  getWorkingMemory: () => WorkingMemoryItem[];
  /** Get all episodes for a domain */
  getEpisodes: (domain?: string) => Episode[];
  /** Get all semantic facts */
  getSemanticFacts: (domain?: string) => SemanticFact[];
  /** Prospective memory — set a reminder for the future */
  setReminder: (description: string, triggerCondition: string, domain: string) => string;
  /** Check reminders against current state */
  checkReminders: (currentState: Record<string, unknown>) => string[];
  /** Get stats */
  getStats: () => HierarchicalMemoryStats;
}

// --- Internal ---

interface Reminder {
  id: string;
  description: string;
  triggerCondition: string;
  domain: string;
  createdAt: number;
  triggered: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<HierarchicalMemoryConfig> = {
  workingMemoryCapacity: 9,
  workingMemoryDecayMs: 300_000,
  maxEpisodes: 10_000,
  semanticDistillationThreshold: 3,
  maxSemanticEntries: 5_000,
  episodeBoundaryGapMs: 3_600_000,
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createHierarchicalMemory(config?: HierarchicalMemoryConfig): HierarchicalMemoryInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal stores
  const workingMemory: WorkingMemoryItem[] = [];
  const episodes: Map<string, Episode> = new Map();
  const semanticFacts: Map<string, SemanticFact> = new Map();
  const reminders: Map<string, Reminder> = new Map();
  let consolidationCount = 0;
  let episodeCounter = 0;
  let factCounter = 0;
  let reminderCounter = 0;

  // Buffer for episode detection (events not yet formed into episodes)
  const eventBuffer: EpisodicEvent[] = [];

  function generateId(prefix: string, counter: number): string {
    return `${prefix}_${Date.now()}_${counter}`;
  }

  /**
   * Encode a new item into working memory (attention-gated)
   */
  function encode(item: Omit<WorkingMemoryItem, 'activationLevel' | 'enteredAt' | 'lastAccessedAt' | 'accessCount'>): void {
    const now = Date.now();

    // Check if already in working memory (refresh if so)
    const existing = workingMemory.find(wm => wm.id === item.id);
    if (existing) {
      existing.activationLevel = Math.min(1, existing.activationLevel + 0.2);
      existing.lastAccessedAt = now;
      existing.accessCount++;
      return;
    }

    // If at capacity, evict lowest activation item
    if (workingMemory.length >= cfg.workingMemoryCapacity) {
      // Decay all items first
      for (const wm of workingMemory) {
        const elapsed = now - wm.lastAccessedAt;
        wm.activationLevel *= Math.exp(-elapsed / cfg.workingMemoryDecayMs);
      }

      // Find lowest activation
      let minIdx = 0;
      for (let i = 1; i < workingMemory.length; i++) {
        if (workingMemory[i].activationLevel < workingMemory[minIdx].activationLevel) {
          minIdx = i;
        }
      }

      // Move evicted item to event buffer for episodic encoding
      const evicted = workingMemory.splice(minIdx, 1)[0];
      eventBuffer.push({
        timestamp: evicted.enteredAt,
        type: evicted.domain,
        description: evicted.content,
        value: evicted.importance,
      });
    }

    workingMemory.push({
      ...item,
      activationLevel: Math.min(1, item.importance),
      enteredAt: now,
      lastAccessedAt: now,
      accessCount: 1,
    });
  }

  /**
   * Retrieve memories across all tiers
   */
  function retrieve(query: string, domain?: string): MemoryRetrievalResult {
    const start = Date.now();
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

    // Search working memory
    const wmResults = workingMemory.filter(wm => {
      const matchesDomain = !domain || wm.domain === domain;
      const matchesContent = queryTerms.some(t => wm.content.toLowerCase().includes(t));
      return matchesDomain && matchesContent;
    }).sort((a, b) => b.activationLevel - a.activationLevel);

    // Update access for retrieved working memory items
    const now = Date.now();
    for (const wm of wmResults) {
      wm.lastAccessedAt = now;
      wm.accessCount++;
      wm.activationLevel = Math.min(1, wm.activationLevel + 0.1);
    }

    // Search episodic memory
    const epResults = [...episodes.values()].filter(ep => {
      const matchesDomain = !domain || ep.domain === domain;
      const matchesContent = queryTerms.some(t =>
        ep.context.toLowerCase().includes(t) ||
        ep.events.some(e => e.description.toLowerCase().includes(t)) ||
        ep.tags.some(tag => tag.toLowerCase().includes(t))
      );
      return matchesDomain && matchesContent;
    }).sort((a, b) => b.endTime - a.endTime).slice(0, 20);

    // Search semantic memory
    const semResults = [...semanticFacts.values()].filter(sf => {
      const matchesDomain = !domain || sf.domain === domain;
      const matchesContent = queryTerms.some(t => sf.knowledge.toLowerCase().includes(t));
      return matchesDomain && matchesContent;
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 20);

    return {
      workingMemory: wmResults,
      episodes: epResults,
      semanticFacts: semResults,
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Consolidate: working → episodic → semantic
   */
  function consolidate(): ConsolidationResult {
    consolidationCount++;
    const now = Date.now();
    let encodedEpisodes = 0;
    let distilledFactsCount = 0;
    let decayedItems = 0;
    const newFacts: SemanticFact[] = [];

    // Step 1: Decay working memory, remove dead items
    for (let i = workingMemory.length - 1; i >= 0; i--) {
      const elapsed = now - workingMemory[i].lastAccessedAt;
      workingMemory[i].activationLevel *= Math.exp(-elapsed / cfg.workingMemoryDecayMs);

      if (workingMemory[i].activationLevel < 0.05) {
        const removed = workingMemory.splice(i, 1)[0];
        eventBuffer.push({
          timestamp: removed.enteredAt,
          type: removed.domain,
          description: removed.content,
          value: removed.importance,
        });
        decayedItems++;
      }
    }

    // Step 2: Form episodes from event buffer
    if (eventBuffer.length > 0) {
      // Sort by timestamp
      eventBuffer.sort((a, b) => a.timestamp - b.timestamp);

      // Detect episode boundaries (gap > threshold)
      let currentEpisodeEvents: EpisodicEvent[] = [eventBuffer[0]];

      for (let i = 1; i < eventBuffer.length; i++) {
        if (eventBuffer[i].timestamp - eventBuffer[i - 1].timestamp > cfg.episodeBoundaryGapMs) {
          // Boundary detected — form episode
          if (currentEpisodeEvents.length >= 2) {
            formEpisode(currentEpisodeEvents);
            encodedEpisodes++;
          }
          currentEpisodeEvents = [];
        }
        currentEpisodeEvents.push(eventBuffer[i]);
      }

      // Form last episode
      if (currentEpisodeEvents.length >= 2) {
        formEpisode(currentEpisodeEvents);
        encodedEpisodes++;
      }

      // Clear buffer
      eventBuffer.length = 0;
    }

    // Step 3: Distill recurring episodes into semantic facts
    const episodesByPattern = new Map<string, Episode[]>();
    for (const ep of episodes.values()) {
      if (ep.distilled) continue;
      // Create a pattern key from domain + event types
      const patternKey = `${ep.domain}:${ep.events.map(e => e.type).join(',')}`;
      const group = episodesByPattern.get(patternKey) || [];
      group.push(ep);
      episodesByPattern.set(patternKey, group);
    }

    for (const [patternKey, group] of episodesByPattern) {
      if (group.length >= cfg.semanticDistillationThreshold) {
        // Distill into a semantic fact
        const domain = group[0].domain;
        const eventTypes = group[0].events.map(e => e.type).join(' → ');
        const avgValence = group.reduce((sum, ep) => sum + ep.valence, 0) / group.length;

        factCounter++;
        const factId = generateId('fact', factCounter);
        const fact: SemanticFact = {
          id: factId,
          knowledge: `In ${domain}: ${eventTypes} pattern observed ${group.length} times (avg valence: ${avgValence.toFixed(2)})`,
          domain,
          confidence: Math.min(0.95, 0.5 + group.length * 0.1),
          evidenceCount: group.length,
          createdAt: now,
          lastReinforced: now,
          sourceEpisodeIds: group.map(ep => ep.id),
          durability: Math.min(1, group.length * 0.15),
        };

        semanticFacts.set(factId, fact);
        newFacts.push(fact);
        distilledFactsCount++;

        // Mark episodes as distilled
        for (const ep of group) {
          ep.distilled = true;
          ep.recurrenceCount = group.length;
        }
      }
    }

    // Trim episodes if over capacity
    if (episodes.size > cfg.maxEpisodes) {
      const sorted = [...episodes.entries()].sort((a, b) => a[1].endTime - b[1].endTime);
      const toRemove = sorted.slice(0, episodes.size - cfg.maxEpisodes);
      for (const [id] of toRemove) {
        episodes.delete(id);
      }
    }

    // Trim semantic facts if over capacity
    if (semanticFacts.size > cfg.maxSemanticEntries) {
      const sorted = [...semanticFacts.entries()].sort((a, b) => a[1].confidence - b[1].confidence);
      const toRemove = sorted.slice(0, semanticFacts.size - cfg.maxSemanticEntries);
      for (const [id] of toRemove) {
        semanticFacts.delete(id);
      }
    }

    return {
      encodedEpisodes,
      distilledFacts: distilledFactsCount,
      decayedItems,
      newSemanticFacts: newFacts,
    };
  }

  function formEpisode(events: EpisodicEvent[]): void {
    episodeCounter++;
    const id = generateId('ep', episodeCounter);
    const domain = events[0].type;
    const actors = [...new Set(events.map(e => e.type))];
    const values = events.filter(e => e.value != null).map(e => e.value!);
    const avgValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    // Valence based on average value trend
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstMean = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondMean = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    const valence = Math.max(-1, Math.min(1, (secondMean - firstMean) / (Math.abs(firstMean) + 1)));

    episodes.set(id, {
      id,
      actors,
      events,
      startTime: events[0].timestamp,
      endTime: events[events.length - 1].timestamp,
      domain,
      context: events.map(e => e.description).join('; '),
      valence,
      recurrenceCount: 1,
      distilled: false,
      tags: [...new Set([domain, ...actors])],
    });
  }

  function recordEpisode(episode: Omit<Episode, 'id' | 'recurrenceCount' | 'distilled'>): string {
    episodeCounter++;
    const id = generateId('ep', episodeCounter);
    episodes.set(id, {
      ...episode,
      id,
      recurrenceCount: 1,
      distilled: false,
    });
    return id;
  }

  function getWorkingMemory(): WorkingMemoryItem[] {
    return [...workingMemory];
  }

  function getEpisodes(domain?: string): Episode[] {
    const all = [...episodes.values()];
    return domain ? all.filter(ep => ep.domain === domain) : all;
  }

  function getSemanticFacts(domain?: string): SemanticFact[] {
    const all = [...semanticFacts.values()];
    return domain ? all.filter(sf => sf.domain === domain) : all;
  }

  function setReminder(description: string, triggerCondition: string, domain: string): string {
    reminderCounter++;
    const id = generateId('rem', reminderCounter);
    reminders.set(id, {
      id,
      description,
      triggerCondition,
      domain,
      createdAt: Date.now(),
      triggered: false,
    });
    return id;
  }

  function checkReminders(currentState: Record<string, unknown>): string[] {
    const triggered: string[] = [];
    const stateStr = JSON.stringify(currentState).toLowerCase();

    for (const [, rem] of reminders) {
      if (rem.triggered) continue;
      // Simple keyword matching against state
      const terms = rem.triggerCondition.toLowerCase().split(/\s+/);
      if (terms.some(t => stateStr.includes(t))) {
        rem.triggered = true;
        triggered.push(rem.description);
      }
    }

    return triggered;
  }

  function getStats(): HierarchicalMemoryStats {
    const allEpisodes = [...episodes.values()];
    const avgLength = allEpisodes.length > 0
      ? allEpisodes.reduce((sum, ep) => sum + ep.events.length, 0) / allEpisodes.length
      : 0;

    const factsByKnowledge = [...semanticFacts.values()]
      .sort((a, b) => b.evidenceCount - a.evidenceCount)
      .slice(0, 5)
      .map(f => ({ knowledge: f.knowledge, count: f.evidenceCount }));

    const oldestFact = [...semanticFacts.values()].reduce(
      (min, f) => f.createdAt < min ? f.createdAt : min,
      Date.now(),
    );

    return {
      workingMemoryUsage: workingMemory.length,
      workingMemoryCapacity: cfg.workingMemoryCapacity,
      totalEpisodes: episodes.size,
      totalSemanticFacts: semanticFacts.size,
      averageEpisodeLength: avgLength,
      mostRecurringPatterns: factsByKnowledge,
      oldestSemanticFact: oldestFact,
      consolidationCount,
    };
  }

  return {
    encode,
    retrieve,
    consolidate,
    recordEpisode,
    getWorkingMemory,
    getEpisodes,
    getSemanticFacts,
    setReminder,
    checkReminders,
    getStats,
  };
}
