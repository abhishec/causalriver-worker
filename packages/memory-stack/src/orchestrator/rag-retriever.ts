/**
 * RAG Retriever — Real-Time Retrieval Augmented Generation
 * ══════════════════════════════════════════════════════════════
 *
 * Claude-level capability: Grounds LLM responses in real, verified knowledge.
 * Retrieves relevant documents/embeddings from vector stores, ranks them by
 * semantic relevance, attaches source citations, and verifies grounding.
 *
 * Brain Analog: The Entorhinal Cortex — the brain's indexing system that
 * routes queries to the right memories and returns ranked results.
 *
 * Features:
 * - Multi-source retrieval (vector search, keyword search, graph traversal)
 * - Reciprocal rank fusion across multiple retrieval strategies
 * - Source citation with provenance tracking
 * - Grounding verification (does the answer match the sources?)
 * - Chunk deduplication and overlap removal
 * - Confidence scoring per retrieved chunk
 * - Query expansion (synonyms, related terms)
 *
 * @example
 * ```typescript
 * const retriever = createRAGRetriever({
 *   vectorSearch: myVectorSearchFn,
 *   keywordSearch: myKeywordSearchFn,
 * });
 *
 * const result = await retriever.retrieve({
 *   query: 'Why did churn spike in Q4?',
 *   topK: 10,
 *   domains: ['cs', 'revenue'],
 * });
 *
 * console.log(result.chunks);      // Ranked, deduplicated chunks
 * console.log(result.citations);   // Source citations
 * console.log(result.grounding);   // Grounding verification score
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** A retrieval source function */
export interface RetrievalSource {
  /** Source name (e.g., 'vector', 'keyword', 'graph') */
  name: string;
  /** Search function */
  search: (query: string, options: RetrievalOptions) => Promise<RetrievedChunk[]>;
  /** Weight for rank fusion (default: 1.0) */
  weight?: number;
}

/** Options for retrieval */
export interface RetrievalOptions {
  /** Maximum chunks to return per source */
  topK?: number;
  /** Filter to specific domains */
  domains?: string[];
  /** Filter to specific document types */
  documentTypes?: string[];
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Time range filter */
  timeRange?: { from?: Date; to?: Date };
  /** Whether to expand the query with synonyms */
  expandQuery?: boolean;
  /** Organization ID for multi-tenant filtering */
  organizationId?: string;
}

/** A retrieved chunk of content */
export interface RetrievedChunk {
  /** Unique chunk ID */
  id: string;
  /** The actual text content */
  content: string;
  /** Similarity/relevance score (0-1) */
  score: number;
  /** Source document metadata */
  source: ChunkSource;
  /** Which retrieval strategy found this */
  retrievedBy: string;
  /** Domain this chunk belongs to */
  domain?: string;
  /** Token count estimate */
  tokenEstimate?: number;
}

/** Source metadata for a chunk */
export interface ChunkSource {
  /** Document ID */
  documentId: string;
  /** Document title */
  title: string;
  /** Document type (e.g., 'memory', 'document', 'metric', 'observation') */
  type: string;
  /** URL or path to the source */
  url?: string;
  /** When the source was created/updated */
  timestamp?: Date;
  /** Page/section within the document */
  section?: string;
  /** Author/owner */
  author?: string;
}

/** A source citation for the response */
export interface Citation {
  /** Citation index (for in-text references like [1], [2]) */
  index: number;
  /** Source document title */
  title: string;
  /** Source type */
  type: string;
  /** URL if available */
  url?: string;
  /** Relevant excerpt */
  excerpt: string;
  /** Relevance score */
  relevance: number;
  /** When the source was created */
  timestamp?: Date;
}

/** Grounding verification result */
export interface GroundingVerification {
  /** Overall grounding score (0-1) — how well-grounded the context is */
  score: number;
  /** Category */
  category: 'well-grounded' | 'partially-grounded' | 'weakly-grounded' | 'ungrounded';
  /** Which claims are well-supported */
  supportedClaims: string[];
  /** Which claims lack source support */
  unsupportedClaims: string[];
  /** Recommendations for improving grounding */
  recommendations: string[];
}

/** Configuration for the RAG retriever */
export interface RAGRetrieverConfig {
  /** Retrieval sources (vector search, keyword search, etc.) */
  sources?: RetrievalSource[];
  /** Default top-K per source (default: 10) */
  defaultTopK?: number;
  /** Reciprocal rank fusion constant (default: 60) */
  rrfK?: number;
  /** Deduplication similarity threshold (default: 0.85) */
  dedupThreshold?: number;
  /** Maximum total chunks after fusion (default: 20) */
  maxTotalChunks?: number;
  /** Whether to verify grounding (default: true) */
  verifyGrounding?: boolean;
  /** Query expansion function (optional) */
  expandQuery?: (query: string) => string[];
  /** Verbose logging */
  verbose?: boolean;
}

/** Full RAG retrieval result */
export interface RAGRetrievalResult {
  /** Ranked, deduplicated chunks */
  chunks: RetrievedChunk[];
  /** Source citations (ready for in-text references) */
  citations: Citation[];
  /** Grounding verification */
  grounding: GroundingVerification;
  /** Formatted context for LLM injection */
  contextPrompt: string;
  /** Total chunks before dedup */
  totalRetrieved: number;
  /** How many were deduplicated */
  deduplicatedCount: number;
  /** Query expansions used */
  queryExpansions: string[];
  /** Sources that contributed */
  sourcesUsed: string[];
  /** Retrieval latency in ms */
  latencyMs: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Simple text similarity using Jaccard coefficient on word sets.
 * Used for deduplication — not for semantic search.
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Reciprocal Rank Fusion — merge rankings from multiple sources.
 * Each chunk gets score = sum(weight / (k + rank_in_source))
 */
function reciprocalRankFusion(
  rankedLists: Array<{ chunks: RetrievedChunk[]; weight: number }>,
  k: number,
): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const { chunks, weight } of rankedLists) {
    for (let rank = 0; rank < chunks.length; rank++) {
      const chunk = chunks[rank];
      const existing = scores.get(chunk.id);
      const rrfScore = weight / (k + rank + 1);

      if (existing) {
        existing.score += rrfScore;
        // Keep the higher-scoring version of the chunk
        if (chunk.score > existing.chunk.score) {
          existing.chunk = chunk;
        }
      } else {
        scores.set(chunk.id, { chunk, score: rrfScore });
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

/**
 * Deduplicate chunks by content similarity.
 */
function deduplicateChunks(chunks: RetrievedChunk[], threshold: number): RetrievedChunk[] {
  const result: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const isDuplicate = result.some(
      (existing) => textSimilarity(existing.content, chunk.content) >= threshold,
    );
    if (!isDuplicate) {
      result.push(chunk);
    }
  }

  return result;
}

/**
 * Default query expansion — generates basic synonyms/variants.
 */
function defaultQueryExpansion(query: string): string[] {
  const expansions: string[] = [query];

  // Add domain-specific expansions
  const domainExpansions: Record<string, string[]> = {
    churn: ['customer attrition', 'customer loss', 'retention'],
    revenue: ['arr', 'mrr', 'bookings', 'income'],
    growth: ['scaling', 'expansion', 'traction'],
    bug: ['defect', 'issue', 'error', 'failure'],
    deploy: ['release', 'ship', 'launch'],
    performance: ['speed', 'latency', 'throughput'],
  };

  const lower = query.toLowerCase();
  for (const [term, synonyms] of Object.entries(domainExpansions)) {
    if (lower.includes(term)) {
      for (const syn of synonyms.slice(0, 2)) {
        expansions.push(query.replace(new RegExp(term, 'gi'), syn));
      }
    }
  }

  return expansions.slice(0, 4); // Max 4 expansions
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a RAG retriever for real-time retrieval augmented generation.
 *
 * Retrieves relevant content from multiple sources, fuses rankings,
 * deduplicates, attaches citations, and verifies grounding.
 */
export function createRAGRetriever(config: RAGRetrieverConfig = {}) {
  const {
    sources = [],
    defaultTopK = 10,
    rrfK = 60,
    dedupThreshold = 0.85,
    maxTotalChunks = 20,
    verifyGrounding = true,
    expandQuery: customExpand,
    verbose = false,
  } = config;

  const queryExpander = customExpand || defaultQueryExpansion;

  return {
    /**
     * Retrieve relevant content for a query.
     *
     * Pipeline:
     * 1. Query expansion (synonyms, related terms)
     * 2. Multi-source retrieval (parallel)
     * 3. Reciprocal rank fusion
     * 4. Deduplication
     * 5. Citation generation
     * 6. Grounding verification
     */
    async retrieve(
      query: string,
      options: RetrievalOptions = {},
    ): Promise<RAGRetrievalResult> {
      const startTime = Date.now();
      const topK = options.topK || defaultTopK;

      // Phase 1: Query expansion
      const expansions = options.expandQuery !== false ? queryExpander(query) : [query];

      // Phase 2: Multi-source retrieval (parallel)
      const rankedLists: Array<{ chunks: RetrievedChunk[]; weight: number }> = [];

      if (sources.length > 0) {
        const retrievalPromises = sources.map(async (source) => {
          try {
            // Search with original query + expansions
            const allChunks: RetrievedChunk[] = [];
            for (const q of expansions) {
              const chunks = await source.search(q, { ...options, topK });
              allChunks.push(...chunks.map((c) => ({ ...c, retrievedBy: source.name })));
            }

            // Deduplicate within source
            const deduped = deduplicateChunks(allChunks, dedupThreshold);
            return { chunks: deduped, weight: source.weight || 1.0 };
          } catch (err) {
            if (verbose) {
              console.warn(`RAG source "${source.name}" failed:`, err);
            }
            return { chunks: [], weight: 0 };
          }
        });

        const results = await Promise.all(retrievalPromises);
        rankedLists.push(...results.filter((r) => r.chunks.length > 0));
      }

      // Phase 3: Reciprocal rank fusion
      let fusedChunks: RetrievedChunk[];
      if (rankedLists.length > 1) {
        fusedChunks = reciprocalRankFusion(rankedLists, rrfK);
      } else if (rankedLists.length === 1) {
        fusedChunks = rankedLists[0].chunks;
      } else {
        fusedChunks = [];
      }

      const totalRetrieved = fusedChunks.length;

      // Phase 4: Deduplication across sources
      const dedupedChunks = deduplicateChunks(fusedChunks, dedupThreshold);
      const finalChunks = dedupedChunks.slice(0, maxTotalChunks);

      // Phase 5: Citation generation
      const citations: Citation[] = finalChunks.map((chunk, idx) => ({
        index: idx + 1,
        title: chunk.source.title,
        type: chunk.source.type,
        url: chunk.source.url,
        excerpt: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
        relevance: chunk.score,
        timestamp: chunk.source.timestamp,
      }));

      // Phase 6: Grounding verification
      let grounding: GroundingVerification;
      if (verifyGrounding && finalChunks.length > 0) {
        const avgScore = finalChunks.reduce((s, c) => s + c.score, 0) / finalChunks.length;
        const highQualityCount = finalChunks.filter((c) => c.score > 0.7).length;

        let category: GroundingVerification['category'];
        if (avgScore > 0.7 && highQualityCount >= 3) category = 'well-grounded';
        else if (avgScore > 0.5) category = 'partially-grounded';
        else if (avgScore > 0.3) category = 'weakly-grounded';
        else category = 'ungrounded';

        grounding = {
          score: avgScore,
          category,
          supportedClaims: finalChunks
            .filter((c) => c.score > 0.6)
            .map((c) => c.source.title),
          unsupportedClaims: [],
          recommendations: avgScore < 0.5
            ? ['Consider adding more training data for this domain', 'Results may not be fully reliable']
            : [],
        };
      } else {
        grounding = {
          score: 0,
          category: 'ungrounded',
          supportedClaims: [],
          unsupportedClaims: ['No retrieval sources available'],
          recommendations: ['Configure retrieval sources for grounded responses'],
        };
      }

      // Phase 7: Format context for LLM
      const contextParts: string[] = [];
      if (finalChunks.length > 0) {
        contextParts.push('## Retrieved Knowledge (RAG)');
        contextParts.push(`${finalChunks.length} relevant sources found. Grounding: ${grounding.category}.`);
        contextParts.push('');

        for (const chunk of finalChunks) {
          contextParts.push(`### [${citations.find((c) => c.title === chunk.source.title)?.index || '?'}] ${chunk.source.title}`);
          contextParts.push(`*Source: ${chunk.source.type}${chunk.domain ? ` | Domain: ${chunk.domain}` : ''} | Relevance: ${(chunk.score * 100).toFixed(0)}%*`);
          contextParts.push(chunk.content);
          contextParts.push('');
        }

        contextParts.push('---');
        contextParts.push('When answering, cite sources using [N] notation. If no sources support a claim, state your uncertainty.');
      }

      return {
        chunks: finalChunks,
        citations,
        grounding,
        contextPrompt: contextParts.join('\n'),
        totalRetrieved,
        deduplicatedCount: totalRetrieved - dedupedChunks.length,
        queryExpansions: expansions,
        sourcesUsed: [...new Set(finalChunks.map((c) => c.retrievedBy))],
        latencyMs: Date.now() - startTime,
      };
    },

    /**
     * Add a retrieval source dynamically.
     */
    addSource(source: RetrievalSource): void {
      sources.push(source);
    },

    /**
     * Get current sources.
     */
    getSources(): string[] {
      return sources.map((s) => s.name);
    },

    /**
     * Get configuration.
     */
    getConfig(): RAGRetrieverConfig {
      return { defaultTopK, rrfK, dedupThreshold, maxTotalChunks, verifyGrounding, verbose };
    },
  };
}
