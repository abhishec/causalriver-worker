/**
 * Long-Context Manager — Smart Truncation & Relevance Filtering
 * ══════════════════════════════════════════════════════════════════
 *
 * Claude-level capability: Manages the brain's working memory window.
 * When the total context exceeds LLM limits, this module intelligently
 * prioritizes, truncates, and compresses context sections to fit
 * within budget while preserving the most relevant information.
 *
 * Brain Analog: The Hippocampus — decides what to keep in short-term
 * memory vs. what to consolidate/discard. Prioritizes by recency,
 * relevance, and emotional salience (importance).
 *
 * Features:
 * - Token-aware budgeting (estimates token count from text)
 * - Relevance-weighted section prioritization
 * - Sliding window with importance weighting for conversation history
 * - Lossy compression for low-priority sections (summarize instead of full)
 * - Guaranteed inclusion of critical sections (high-relevance)
 * - Overflow detection and graceful degradation
 *
 * @example
 * ```typescript
 * const manager = createLongContextManager({ maxTokens: 100_000 });
 *
 * const optimized = manager.optimize({
 *   sections: brainContext.sections,
 *   conversationHistory: messages,
 *   systemPromptBase: identityPrompt,
 * });
 *
 * console.log(optimized.tokenBudget);     // { used: 87000, available: 100000 }
 * console.log(optimized.sectionsKept);    // 12 of 16
 * console.log(optimized.compressionLog);  // What was truncated and why
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for the long-context manager */
export interface LongContextConfig {
  /** Maximum tokens for the entire context (default: 100_000) */
  maxTokens?: number;
  /** Tokens reserved for the LLM's response (default: 4_000) */
  responseReserve?: number;
  /** Tokens reserved for system prompt base (identity, instructions) */
  systemPromptReserve?: number;
  /** Minimum relevance score to include a section (default: 0.1) */
  minRelevance?: number;
  /** Maximum conversation history messages to keep (default: 20) */
  maxHistoryMessages?: number;
  /** Whether to compress low-priority sections (default: true) */
  enableCompression?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/** A context section with metadata for prioritization */
export interface ContextSection {
  /** Section identifier */
  id: string;
  /** Section title */
  title: string;
  /** Full content */
  content: string;
  /** Relevance to the current query (0-1) */
  relevance: number;
  /** Whether this section is critical (must be included) */
  critical?: boolean;
  /** Estimated token count (computed if not provided) */
  tokenEstimate?: number;
  /** Source brain region */
  source?: string;
}

/** Conversation message for sliding window */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Importance weight (0-1, default 0.5) */
  importance?: number;
  /** Timestamp for recency scoring */
  timestamp?: Date;
}

/** Input to the context optimizer */
export interface ContextOptimizeInput {
  /** Brain context sections to include */
  sections: ContextSection[];
  /** Conversation history (most recent last) */
  conversationHistory?: ContextMessage[];
  /** Base system prompt text (identity, instructions) */
  systemPromptBase?: string;
  /** Additional fixed text that must be included */
  fixedInclusions?: string[];
}

/** Result of context optimization */
export interface ContextOptimizeResult {
  /** Optimized sections (in priority order) */
  sections: ContextSection[];
  /** Optimized conversation history */
  conversationHistory: ContextMessage[];
  /** Token budget breakdown */
  tokenBudget: {
    total: number;
    used: number;
    remaining: number;
    systemPrompt: number;
    sections: number;
    conversation: number;
    responseReserve: number;
  };
  /** How many sections were kept vs. dropped */
  sectionsKept: number;
  sectionsDropped: number;
  sectionsCompressed: number;
  /** How many conversation messages were kept */
  messagesKept: number;
  messagesDropped: number;
  /** Compression/truncation log */
  compressionLog: string[];
  /** Whether any critical sections were dropped (should never happen) */
  criticalSectionsDropped: boolean;
  /** Combined optimized text (ready for LLM) */
  optimizedPrompt: string;
  /** Confidence that the optimized context preserves essential information */
  preservationConfidence: number;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimate token count from text.
 * Uses the ~4 chars per token heuristic (conservative for English).
 * For code-heavy content, uses ~3.5 chars per token.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Code-heavy heuristic: more tokens per character
  const codeIndicators = /[{}\[\]();=><!&|+\-*/%^~`@#$]/g;
  const codeRatio = (text.match(codeIndicators) || []).length / text.length;
  const charsPerToken = codeRatio > 0.05 ? 3.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Compress a section by extracting key sentences.
 * Keeps first sentence, sentences with numbers/metrics, and last sentence.
 */
function compressSection(content: string, targetTokens: number): string {
  const sentences = content.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 3) return content;

  const selected: string[] = [];
  let currentTokens = 0;

  // Always keep first sentence (topic)
  selected.push(sentences[0]);
  currentTokens += estimateTokens(sentences[0]);

  // Prioritize sentences with numbers, metrics, key phrases
  const scoredSentences = sentences.slice(1, -1).map((s) => {
    let score = 0;
    if (/\d+/.test(s)) score += 2;  // Has numbers
    if (/%|percent|increase|decrease|grow|decline|spike|drop/i.test(s)) score += 3;
    if (/because|therefore|however|critical|important|key|note/i.test(s)) score += 2;
    if (/→|→|causes?|affects?|impacts?|leads? to/i.test(s)) score += 2;
    if (/confidence|uncertain|risk|warning/i.test(s)) score += 1;
    return { sentence: s, score };
  });

  scoredSentences.sort((a, b) => b.score - a.score);

  for (const { sentence } of scoredSentences) {
    const tokens = estimateTokens(sentence);
    if (currentTokens + tokens <= targetTokens - estimateTokens(sentences[sentences.length - 1])) {
      selected.push(sentence);
      currentTokens += tokens;
    }
  }

  // Always keep last sentence (conclusion)
  if (sentences.length > 1) {
    selected.push(sentences[sentences.length - 1]);
  }

  return selected.join(' ') + '\n[... compressed for context window ...]';
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a long-context manager for intelligent context window optimization.
 *
 * Manages the brain's working memory by prioritizing, compressing, and
 * truncating context sections to fit within LLM token limits.
 */
export function createLongContextManager(config: LongContextConfig = {}) {
  const {
    maxTokens = 100_000,
    responseReserve = 4_000,
    systemPromptReserve = 2_000,
    minRelevance = 0.1,
    maxHistoryMessages = 20,
    enableCompression = true,
    verbose = false,
  } = config;

  return {
    /**
     * Optimize context to fit within token budget.
     *
     * Priority order:
     * 1. System prompt base (always included)
     * 2. Critical sections (always included)
     * 3. High-relevance sections (sorted by relevance)
     * 4. Recent conversation messages (sliding window)
     * 5. Lower-relevance sections (compressed if space allows)
     */
    optimize(input: ContextOptimizeInput): ContextOptimizeResult {
      const log: string[] = [];
      const availableBudget = maxTokens - responseReserve;

      // Phase 1: Account for system prompt base
      const systemTokens = estimateTokens(input.systemPromptBase || '') + systemPromptReserve;
      let remainingBudget = availableBudget - systemTokens;
      log.push(`Token budget: ${maxTokens} total, ${responseReserve} reserved for response, ${systemTokens} for system prompt`);

      // Phase 2: Estimate all section tokens
      const enrichedSections = input.sections.map((s) => ({
        ...s,
        tokenEstimate: s.tokenEstimate || estimateTokens(s.content),
      }));

      // Phase 3: Critical sections first (must be included)
      const criticalSections = enrichedSections.filter((s) => s.critical);
      const nonCriticalSections = enrichedSections.filter((s) => !s.critical);
      const criticalTokens = criticalSections.reduce((sum, s) => sum + s.tokenEstimate!, 0);
      remainingBudget -= criticalTokens;
      const criticalDropped = remainingBudget < 0;

      if (criticalDropped) {
        log.push(`⚠️ CRITICAL: Even critical sections exceed budget by ${-remainingBudget} tokens`);
      } else {
        log.push(`Critical sections: ${criticalSections.length} sections, ${criticalTokens} tokens`);
      }

      // Phase 4: Conversation history — sliding window with importance
      const historyBudget = Math.min(remainingBudget * 0.3, maxHistoryMessages * 200);
      const keptMessages: ContextMessage[] = [];
      let historyTokens = 0;

      if (input.conversationHistory) {
        // Always keep the most recent message
        const history = [...input.conversationHistory].slice(-maxHistoryMessages);

        // Score messages: recency + importance
        const scored = history.map((msg, idx) => ({
          msg,
          score: ((idx + 1) / history.length) * 0.6 + (msg.importance || 0.5) * 0.4,
          tokens: estimateTokens(msg.content),
        }));

        // Sort by score descending, take what fits
        scored.sort((a, b) => b.score - a.score);

        for (const { msg, tokens } of scored) {
          if (historyTokens + tokens <= historyBudget) {
            keptMessages.push(msg);
            historyTokens += tokens;
          }
        }

        // Re-sort by original order (chronological)
        const originalOrder = input.conversationHistory;
        keptMessages.sort((a, b) => {
          const idxA = originalOrder.indexOf(a);
          const idxB = originalOrder.indexOf(b);
          return idxA - idxB;
        });

        const dropped = (input.conversationHistory?.length || 0) - keptMessages.length;
        if (dropped > 0) {
          log.push(`Conversation: kept ${keptMessages.length}, dropped ${dropped} older/less important messages`);
        }
      }

      remainingBudget -= historyTokens;

      // Phase 5: Non-critical sections — sorted by relevance
      const sortedSections = [...nonCriticalSections]
        .filter((s) => s.relevance >= minRelevance)
        .sort((a, b) => b.relevance - a.relevance);

      const keptSections: ContextSection[] = [...criticalSections];
      let sectionTokens = criticalTokens;
      let droppedCount = 0;
      let compressedCount = 0;
      const droppedSections = nonCriticalSections.filter((s) => s.relevance < minRelevance);
      droppedCount += droppedSections.length;

      for (const section of sortedSections) {
        if (sectionTokens + section.tokenEstimate! <= remainingBudget + historyBudget * 0.5) {
          keptSections.push(section);
          sectionTokens += section.tokenEstimate!;
        } else if (enableCompression && section.relevance >= 0.3) {
          // Compress instead of dropping
          const targetTokens = Math.max(50, Math.floor(section.tokenEstimate! * 0.3));
          const compressed = compressSection(section.content, targetTokens);
          const compressedTokens = estimateTokens(compressed);

          if (sectionTokens + compressedTokens <= remainingBudget + historyBudget * 0.5) {
            keptSections.push({
              ...section,
              content: compressed,
              tokenEstimate: compressedTokens,
            });
            sectionTokens += compressedTokens;
            compressedCount++;
            log.push(`Compressed "${section.title}" from ${section.tokenEstimate} to ${compressedTokens} tokens`);
          } else {
            droppedCount++;
            log.push(`Dropped "${section.title}" (${section.tokenEstimate} tokens, relevance: ${section.relevance.toFixed(2)})`);
          }
        } else {
          droppedCount++;
          log.push(`Dropped "${section.title}" (relevance ${section.relevance.toFixed(2)} below threshold or no budget)`);
        }
      }

      // Phase 6: Build the optimized prompt
      const promptParts: string[] = [];
      if (input.systemPromptBase) promptParts.push(input.systemPromptBase);
      if (input.fixedInclusions) promptParts.push(...input.fixedInclusions);

      // Add sections in relevance order
      for (const section of keptSections) {
        promptParts.push(`${section.title}\n${section.content}`);
      }

      // Add conversation summary if history was truncated
      if (keptMessages.length < (input.conversationHistory?.length || 0)) {
        promptParts.push(`\n[Conversation: showing ${keptMessages.length} of ${input.conversationHistory?.length || 0} most relevant messages]`);
      }

      const totalUsed = systemTokens + sectionTokens + historyTokens;
      const totalRelevance = enrichedSections.reduce((sum, s) => sum + s.relevance, 0);
      const preservationScore = keptSections.length > 0 && totalRelevance > 0
        ? keptSections.reduce((sum, s) => sum + s.relevance, 0) / totalRelevance
        : 0;

      return {
        sections: keptSections,
        conversationHistory: keptMessages,
        tokenBudget: {
          total: maxTokens,
          used: totalUsed,
          remaining: maxTokens - totalUsed,
          systemPrompt: systemTokens,
          sections: sectionTokens,
          conversation: historyTokens,
          responseReserve,
        },
        sectionsKept: keptSections.length,
        sectionsDropped: droppedCount,
        sectionsCompressed: compressedCount,
        messagesKept: keptMessages.length,
        messagesDropped: (input.conversationHistory?.length || 0) - keptMessages.length,
        compressionLog: log,
        criticalSectionsDropped: criticalDropped,
        optimizedPrompt: promptParts.join('\n\n'),
        preservationConfidence: Math.min(1, preservationScore),
      };
    },

    /**
     * Estimate total tokens for a set of sections.
     */
    estimateTokens(text: string): number {
      return estimateTokens(text);
    },

    /**
     * Check if content fits within budget.
     */
    fitsInBudget(sections: ContextSection[], extraText?: string): boolean {
      const sectionTokens = sections.reduce(
        (sum, s) => sum + (s.tokenEstimate || estimateTokens(s.content)),
        0,
      );
      const extraTokens = extraText ? estimateTokens(extraText) : 0;
      return sectionTokens + extraTokens <= maxTokens - responseReserve - systemPromptReserve;
    },

    /**
     * Get configuration.
     */
    getConfig(): LongContextConfig {
      return { maxTokens, responseReserve, systemPromptReserve, minRelevance, maxHistoryMessages, enableCompression, verbose };
    },
  };
}
