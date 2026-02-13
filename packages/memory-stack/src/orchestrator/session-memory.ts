/**
 * Session Memory — Per-User Context Accumulation
 * ══════════════════════════════════════════════════════
 *
 * Claude-level capability: Maintains persistent memory across conversation
 * sessions, accumulating user preferences, learned patterns, and contextual
 * knowledge that improves over time.
 *
 * Brain Analog: The Hippocampus + Long-Term Memory — consolidates important
 * experiences from short-term into long-term memory, retrieves relevant
 * memories for new situations.
 *
 * Features:
 * - Per-user memory store (preferences, facts, decisions)
 * - Conversation distillation (compress long conversations into key takeaways)
 * - Preference learning (track what the user cares about)
 * - Context recall (bring relevant memories into current session)
 * - Memory importance scoring (prioritize memories by relevance)
 * - Memory decay (gradually forget low-importance memories)
 * - Cross-session learning (get better at answering user's questions)
 *
 * @example
 * ```typescript
 * const memory = createSessionMemory({ userId: 'user_123' });
 *
 * // Record memories from conversation
 * memory.remember({
 *   type: 'preference',
 *   content: 'User prefers concise answers with bullet points',
 *   importance: 0.8,
 * });
 *
 * memory.remember({
 *   type: 'fact',
 *   content: 'User is CTO of a fintech startup',
 *   importance: 0.9,
 * });
 *
 * // Recall relevant memories for new session
 * const context = memory.recall('technical question about scaling');
 * console.log(context.memories);     // Relevant past memories
 * console.log(context.preferences);  // User preferences
 * console.log(context.promptText);   // Ready for LLM injection
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for session memory */
export interface SessionMemoryConfig {
  /** User ID */
  userId?: string;
  /** Organization ID */
  organizationId?: string;
  /** Maximum memories to store (default: 500) */
  maxMemories?: number;
  /** Memory decay rate (0-1, default: 0.01 — 1% per session) */
  decayRate?: number;
  /** Minimum importance to retain (default: 0.1) */
  minImportance?: number;
  /** Maximum memories to recall per query (default: 20) */
  maxRecall?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** A memory entry */
export interface MemoryEntry {
  /** Unique memory ID */
  id: string;
  /** Memory type */
  type: 'preference' | 'fact' | 'decision' | 'correction' | 'context' | 'feedback' | 'goal';
  /** The memory content */
  content: string;
  /** Importance score (0-1) */
  importance: number;
  /** Domains this memory relates to */
  domains: string[];
  /** Keywords for retrieval */
  keywords: string[];
  /** When the memory was created */
  createdAt: Date;
  /** When the memory was last accessed */
  lastAccessedAt: Date;
  /** Access count */
  accessCount: number;
  /** Source (which session created this) */
  sessionId?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/** Input for creating a new memory */
export interface MemoryInput {
  /** Memory type */
  type: MemoryEntry['type'];
  /** Content */
  content: string;
  /** Importance (0-1, default: 0.5) */
  importance?: number;
  /** Related domains */
  domains?: string[];
  /** Session ID */
  sessionId?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/** Input for a conversation to distill */
export interface ConversationInput {
  /** Messages in the conversation */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Session ID */
  sessionId?: string;
  /** Which domains were discussed */
  domains?: string[];
}

/** Result of conversation distillation */
export interface DistillationResult {
  /** Extracted memories */
  memories: MemoryInput[];
  /** Key topics discussed */
  topics: string[];
  /** User preferences detected */
  preferences: string[];
  /** Decisions made */
  decisions: string[];
  /** Open questions / follow-ups */
  openQuestions: string[];
  /** Session summary */
  summary: string;
}

/** Result of memory recall */
export interface MemoryRecallResult {
  /** Relevant memories */
  memories: MemoryEntry[];
  /** User preferences */
  preferences: MemoryEntry[];
  /** Recent decisions */
  decisions: MemoryEntry[];
  /** Formatted prompt text for LLM injection */
  promptText: string;
  /** Total memories in store */
  totalMemories: number;
  /** Relevance score (how well memories match the query) */
  relevance: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract keywords from text for retrieval matching.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her',
    'this', 'that', 'what', 'which', 'who', 'how', 'when', 'where', 'why',
    'and', 'or', 'not', 'for', 'with', 'about', 'from', 'to', 'of', 'in', 'on',
    'at', 'by', 'up', 'out', 'if', 'so', 'but', 'as', 'than', 'too', 'very',
  ]);

  return text.toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);
}

/**
 * Score how relevant a memory is to a query.
 */
function scoreRelevance(memory: MemoryEntry, queryKeywords: string[]): number {
  if (queryKeywords.length === 0) return memory.importance;

  const memKeywords = new Set(memory.keywords);
  let matchCount = 0;
  for (const kw of queryKeywords) {
    if (memKeywords.has(kw)) matchCount++;
    // Also check content
    if (memory.content.toLowerCase().includes(kw)) matchCount += 0.5;
  }

  const keywordRelevance = matchCount / Math.max(queryKeywords.length, 1);

  // Recency boost (more recent = more relevant)
  const ageMs = Date.now() - memory.lastAccessedAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const recencyBoost = Math.max(0, 1 - ageDays / 365); // Decay over a year

  // Usage boost (frequently accessed = more important)
  const usageBoost = Math.min(1, memory.accessCount / 10);

  return (
    keywordRelevance * 0.4 +
    memory.importance * 0.3 +
    recencyBoost * 0.2 +
    usageBoost * 0.1
  );
}

// ============================================================================
// CONVERSATION DISTILLATION
// ============================================================================

/**
 * Distill a conversation into key memories.
 * Extracts preferences, decisions, facts, and follow-ups.
 */
function distillConversation(input: ConversationInput): DistillationResult {
  const memories: MemoryInput[] = [];
  const topics: string[] = [];
  const preferences: string[] = [];
  const decisions: string[] = [];
  const openQuestions: string[] = [];

  for (const msg of input.messages) {
    const content = msg.content;
    const lower = content.toLowerCase();

    if (msg.role === 'user') {
      // Detect preferences
      if (/i (?:prefer|like|want|need|always|usually)/i.test(content)) {
        const pref = content.length > 200 ? content.slice(0, 200) + '...' : content;
        preferences.push(pref);
        memories.push({
          type: 'preference',
          content: pref,
          importance: 0.8,
          domains: input.domains,
          sessionId: input.sessionId,
        });
      }

      // Detect corrections
      if (/(?:no|wrong|incorrect|actually|not what i meant|that.s not right)/i.test(content)) {
        memories.push({
          type: 'correction',
          content: content.length > 200 ? content.slice(0, 200) + '...' : content,
          importance: 0.9,
          domains: input.domains,
          sessionId: input.sessionId,
        });
      }

      // Detect goals
      if (/i (?:want to|need to|trying to|goal is|objective is)/i.test(content)) {
        memories.push({
          type: 'goal',
          content: content.length > 200 ? content.slice(0, 200) + '...' : content,
          importance: 0.85,
          domains: input.domains,
          sessionId: input.sessionId,
        });
      }

      // Detect open questions (questions that weren't fully answered)
      if (/\?$/.test(content.trim()) && content.length > 20) {
        openQuestions.push(content.length > 150 ? content.slice(0, 150) + '...' : content);
      }

      // Extract topics from nouns
      const topicMatches = content.match(/(?:about|regarding|concerning|on)\s+(\w[\w\s]{2,30})/gi);
      if (topicMatches) {
        for (const match of topicMatches) {
          const topic = match.replace(/(?:about|regarding|concerning|on)\s+/i, '').trim();
          if (topic.length > 2 && !topics.includes(topic)) topics.push(topic);
        }
      }
    }

    if (msg.role === 'assistant') {
      // Detect decisions/recommendations made
      if (/(?:recommend|suggest|should|decision|let.s|i.ll)/i.test(lower)) {
        const sentences = content.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (/(?:recommend|suggest|should|decision)/i.test(sentence) && sentence.length > 20) {
            decisions.push(sentence.length > 200 ? sentence.slice(0, 200) + '...' : sentence);
            memories.push({
              type: 'decision',
              content: sentence.length > 200 ? sentence.slice(0, 200) + '...' : sentence,
              importance: 0.7,
              domains: input.domains,
              sessionId: input.sessionId,
            });
            break;
          }
        }
      }

      // Detect key facts shared
      if (/\d/.test(content) && content.length > 30) {
        const factSentences = content.split(/(?<=[.!?])\s+/)
          .filter((s) => /\d/.test(s) && s.length > 20 && s.length < 300);
        for (const fact of factSentences.slice(0, 2)) {
          memories.push({
            type: 'fact',
            content: fact,
            importance: 0.6,
            domains: input.domains,
            sessionId: input.sessionId,
          });
        }
      }
    }
  }

  // Session summary
  const summaryParts: string[] = [];
  summaryParts.push(`Session with ${input.messages.length} messages.`);
  if (topics.length > 0) summaryParts.push(`Topics: ${topics.slice(0, 5).join(', ')}.`);
  if (preferences.length > 0) summaryParts.push(`${preferences.length} preference(s) detected.`);
  if (decisions.length > 0) summaryParts.push(`${decisions.length} decision(s) made.`);
  if (openQuestions.length > 0) summaryParts.push(`${openQuestions.length} open question(s).`);

  return {
    memories: memories.slice(0, 20),
    topics: topics.slice(0, 10),
    preferences,
    decisions,
    openQuestions: openQuestions.slice(0, 5),
    summary: summaryParts.join(' '),
  };
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a session memory manager for per-user context accumulation.
 *
 * Maintains persistent memory across sessions, learning user preferences,
 * tracking decisions, and recalling relevant context.
 */
export function createSessionMemory(config: SessionMemoryConfig = {}) {
  const {
    userId = 'anonymous',
    organizationId,
    maxMemories = 500,
    decayRate = 0.01,
    minImportance = 0.1,
    maxRecall = 20,
    verbose = false,
  } = config;

  const memories: Map<string, MemoryEntry> = new Map();

  /**
   * Apply memory decay — reduce importance of old, unused memories.
   */
  function applyDecay(): void {
    for (const [id, memory] of memories) {
      const ageMs = Date.now() - memory.lastAccessedAt.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const decay = Math.exp(-decayRate * ageDays);
      memory.importance *= decay;

      // Remove memories below threshold
      if (memory.importance < minImportance) {
        memories.delete(id);
      }
    }
  }

  /**
   * Enforce memory capacity limits.
   */
  function enforceCapacity(): void {
    if (memories.size <= maxMemories) return;

    // Sort by importance, remove lowest
    const sorted = Array.from(memories.entries())
      .sort(([, a], [, b]) => a.importance - b.importance);

    const toRemove = sorted.slice(0, sorted.length - maxMemories);
    for (const [id] of toRemove) {
      memories.delete(id);
    }
  }

  return {
    /**
     * Store a new memory.
     */
    remember(input: MemoryInput): MemoryEntry {
      const entry: MemoryEntry = {
        id: generateMemoryId(),
        type: input.type,
        content: input.content,
        importance: input.importance ?? 0.5,
        domains: input.domains || [],
        keywords: extractKeywords(input.content),
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        sessionId: input.sessionId,
        metadata: input.metadata,
      };

      memories.set(entry.id, entry);
      enforceCapacity();

      return entry;
    },

    /**
     * Recall relevant memories for a query.
     */
    recall(query: string, domains?: string[]): MemoryRecallResult {
      const queryKeywords = extractKeywords(query);

      // Score all memories
      const scored = Array.from(memories.values())
        .map((memory) => {
          // Domain filter boost
          let domainBoost = 0;
          if (domains && domains.length > 0) {
            const hasMatchingDomain = memory.domains.some((d) => domains.includes(d));
            domainBoost = hasMatchingDomain ? 0.2 : 0;
          }

          return {
            memory,
            score: scoreRelevance(memory, queryKeywords) + domainBoost,
          };
        })
        .filter((s) => s.score > 0.1)
        .sort((a, b) => b.score - a.score);

      // Update access counts
      const topMemories = scored.slice(0, maxRecall);
      for (const { memory } of topMemories) {
        memory.lastAccessedAt = new Date();
        memory.accessCount++;
      }

      const recalled = topMemories.map((s) => s.memory);
      const prefs = recalled.filter((m) => m.type === 'preference');
      const decs = recalled.filter((m) => m.type === 'decision');

      // Build prompt text
      const promptParts: string[] = [];
      promptParts.push('## Session Memory (What I Know About This User)');

      if (prefs.length > 0) {
        promptParts.push('', '### User Preferences');
        for (const pref of prefs.slice(0, 5)) {
          promptParts.push(`- ${pref.content}`);
        }
      }

      const goals = recalled.filter((m) => m.type === 'goal');
      if (goals.length > 0) {
        promptParts.push('', '### User Goals');
        for (const goal of goals.slice(0, 3)) {
          promptParts.push(`- ${goal.content}`);
        }
      }

      const corrections = recalled.filter((m) => m.type === 'correction');
      if (corrections.length > 0) {
        promptParts.push('', '### Previous Corrections (Learn From These)');
        for (const corr of corrections.slice(0, 3)) {
          promptParts.push(`- ${corr.content}`);
        }
      }

      const facts = recalled.filter((m) => m.type === 'fact');
      if (facts.length > 0) {
        promptParts.push('', '### Known Facts');
        for (const fact of facts.slice(0, 5)) {
          promptParts.push(`- ${fact.content}`);
        }
      }

      if (decs.length > 0) {
        promptParts.push('', '### Past Decisions');
        for (const dec of decs.slice(0, 3)) {
          promptParts.push(`- ${dec.content}`);
        }
      }

      const avgRelevance = topMemories.length > 0
        ? topMemories.reduce((sum, s) => sum + s.score, 0) / topMemories.length
        : 0;

      return {
        memories: recalled,
        preferences: prefs,
        decisions: decs,
        promptText: recalled.length > 0 ? promptParts.join('\n') : '',
        totalMemories: memories.size,
        relevance: avgRelevance,
      };
    },

    /**
     * Distill a conversation into key memories and store them.
     */
    distillAndStore(input: ConversationInput): DistillationResult {
      const result = distillConversation(input);

      // Store extracted memories
      for (const memInput of result.memories) {
        const entry: MemoryEntry = {
          id: generateMemoryId(),
          type: memInput.type,
          content: memInput.content,
          importance: memInput.importance ?? 0.5,
          domains: memInput.domains || [],
          keywords: extractKeywords(memInput.content),
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 0,
          sessionId: memInput.sessionId,
          metadata: memInput.metadata,
        };
        memories.set(entry.id, entry);
      }

      enforceCapacity();
      return result;
    },

    /**
     * Apply decay to all memories (call periodically or at session start).
     */
    applyDecay(): { removed: number; remaining: number } {
      const before = memories.size;
      applyDecay();
      return { removed: before - memories.size, remaining: memories.size };
    },

    /**
     * Get all memories (for persistence/debugging).
     */
    getAllMemories(): MemoryEntry[] {
      return Array.from(memories.values());
    },

    /**
     * Load memories from external store (for hydration).
     */
    loadMemories(entries: MemoryEntry[]): void {
      for (const entry of entries) {
        memories.set(entry.id, { ...entry });
      }
      enforceCapacity();
    },

    /**
     * Get memory statistics.
     */
    getStats(): {
      totalMemories: number;
      byType: Record<string, number>;
      avgImportance: number;
      oldestMemory: Date | null;
      newestMemory: Date | null;
    } {
      const all = Array.from(memories.values());
      const byType: Record<string, number> = {};
      for (const m of all) {
        byType[m.type] = (byType[m.type] || 0) + 1;
      }

      return {
        totalMemories: all.length,
        byType,
        avgImportance: all.length > 0
          ? all.reduce((sum, m) => sum + m.importance, 0) / all.length
          : 0,
        oldestMemory: all.length > 0
          ? new Date(Math.min(...all.map((m) => m.createdAt.getTime())))
          : null,
        newestMemory: all.length > 0
          ? new Date(Math.max(...all.map((m) => m.createdAt.getTime())))
          : null,
      };
    },

    /**
     * Forget a specific memory.
     */
    forget(memoryId: string): boolean {
      return memories.delete(memoryId);
    },

    /**
     * Clear all memories for this user.
     */
    clearAll(): number {
      const count = memories.size;
      memories.clear();
      return count;
    },

    /**
     * Get configuration.
     */
    getConfig(): SessionMemoryConfig {
      return { userId, organizationId, maxMemories, decayRate, minImportance, maxRecall, verbose };
    },
  };
}
