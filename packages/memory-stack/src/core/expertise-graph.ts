/**
 * Contributor Expertise Graph
 *
 * Generic "who knows what?" graph that maps contributors to code areas,
 * topics, and technologies. Not connector-specific — any connector can feed it:
 * - GitHub: PR merges → code_change, reviews → review
 * - Slack: discussions → discussion
 * - Jira: issue resolution → issue_resolution
 * - PagerDuty: incident response → incident_response
 * - Notion/Docs: documentation → documentation
 *
 * Features:
 * - Upsert-based recording (idempotent)
 * - Time-based exponential decay (stale expertise fades)
 * - Fuzzy topic matching for queries
 * - In-memory graph with Supabase persistence
 * - Zero external dependencies
 */

// =============================================================================
// TYPES
// =============================================================================

export type EvidenceType =
  | 'code_change'
  | 'review'
  | 'issue_resolution'
  | 'discussion'
  | 'documentation'
  | 'incident_response';

export interface ExpertiseEdge {
  contributorId: string;
  contributorName?: string;
  topic: string;
  evidenceType: EvidenceType;
  strength: number;
  evidenceCount: number;
  lastActivityAt: Date;
}

export interface ExpertiseInput {
  contributorId: string;
  contributorName?: string;
  topic: string;
  evidenceType: EvidenceType;
  timestamp?: Date;
}

export interface ExpertiseQuery {
  topic: string;
  minStrength?: number;
  limit?: number;
  evidenceTypes?: EvidenceType[];
}

export interface ExpertiseGraphConfig {
  /** Decay factor per 30 days of inactivity (default: 0.85) */
  decayFactor?: number;
  /** Minimum evidence count to be returned in queries (default: 2) */
  minEvidence?: number;
  /** Strength increment per evidence type */
  strengthPerEvent?: Partial<Record<EvidenceType, number>>;
  /** Maximum strength cap (default: 0.99) */
  maxStrength?: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_STRENGTH_PER_EVENT: Record<EvidenceType, number> = {
  code_change: 0.15,
  review: 0.10,
  issue_resolution: 0.12,
  discussion: 0.05,
  documentation: 0.08,
  incident_response: 0.12,
};

const DEFAULT_CONFIG: Required<ExpertiseGraphConfig> = {
  decayFactor: 0.85,
  minEvidence: 2,
  strengthPerEvent: DEFAULT_STRENGTH_PER_EVENT,
  maxStrength: 0.99,
};

// =============================================================================
// HELPERS
// =============================================================================

/** Composite key for deduplication */
function edgeKey(contributorId: string, topic: string, evidenceType: EvidenceType): string {
  return `${contributorId}::${topic}::${evidenceType}`;
}

/** Normalize topic for matching: lowercase, trim slashes, collapse whitespace */
function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim().replace(/\/+$/, '').replace(/\s+/g, ' ');
}

/** Fuzzy topic match: checks containment and prefix matching */
function topicMatches(edgeTopic: string, queryTopic: string): boolean {
  const a = normalizeTopic(edgeTopic);
  const b = normalizeTopic(queryTopic);

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Partial word matching for short queries
  const aWords = a.split(/[\s/\-_]+/);
  const bWords = b.split(/[\s/\-_]+/);
  const overlap = bWords.filter(w => w.length >= 3 && aWords.some(aw => aw.includes(w) || w.includes(aw)));
  return overlap.length > 0 && overlap.length >= bWords.length * 0.5;
}

// =============================================================================
// EXPERTISE GRAPH
// =============================================================================

export interface ExpertiseGraphInstance {
  recordExpertise(input: ExpertiseInput): void;
  recordBatch(inputs: ExpertiseInput[]): void;
  queryExperts(query: ExpertiseQuery): ExpertiseEdge[];
  getContributorExpertise(contributorId: string): ExpertiseEdge[];
  getHeatmap(topN?: number): Map<string, ExpertiseEdge[]>;
  applyDecay(referenceDate?: Date): void;
  getEdges(): ExpertiseEdge[];
  getStats(): { totalEdges: number; uniqueContributors: number; uniqueTopics: number };
  persist(supabase: any, organizationId: string): Promise<void>;
  load(supabase: any, organizationId: string): Promise<void>;
}

export function createExpertiseGraph(userConfig?: ExpertiseGraphConfig): ExpertiseGraphInstance {
  const config: Required<ExpertiseGraphConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    strengthPerEvent: {
      ...DEFAULT_STRENGTH_PER_EVENT,
      ...userConfig?.strengthPerEvent,
    },
  };

  const edges = new Map<string, ExpertiseEdge>();

  return {
    /**
     * Record a single expertise signal. Upserts: if the edge already exists,
     * increments evidence count and updates strength.
     */
    recordExpertise(input: ExpertiseInput): void {
      const key = edgeKey(input.contributorId, normalizeTopic(input.topic), input.evidenceType);
      const existing = edges.get(key);
      const increment = (config.strengthPerEvent as Record<EvidenceType, number>)[input.evidenceType] ?? 0.1;
      const now = input.timestamp ?? new Date();

      if (existing) {
        existing.evidenceCount++;
        existing.strength = Math.min(config.maxStrength, existing.strength + increment * (1 - existing.strength));
        existing.lastActivityAt = now > existing.lastActivityAt ? now : existing.lastActivityAt;
        if (input.contributorName) existing.contributorName = input.contributorName;
      } else {
        edges.set(key, {
          contributorId: input.contributorId,
          contributorName: input.contributorName,
          topic: normalizeTopic(input.topic),
          evidenceType: input.evidenceType,
          strength: Math.min(config.maxStrength, increment),
          evidenceCount: 1,
          lastActivityAt: now,
        });
      }
    },

    /**
     * Record a batch of expertise signals.
     */
    recordBatch(inputs: ExpertiseInput[]): void {
      for (const input of inputs) {
        this.recordExpertise(input);
      }
    },

    /**
     * Find top contributors for a given topic.
     * Uses fuzzy matching on topic names.
     */
    queryExperts(query: ExpertiseQuery): ExpertiseEdge[] {
      const minStrength = query.minStrength ?? 0.1;
      const limit = query.limit ?? 5;

      // Aggregate across evidence types per contributor for this topic
      const contributorScores = new Map<string, {
        totalStrength: number;
        totalEvidence: number;
        bestEdge: ExpertiseEdge;
        edges: ExpertiseEdge[];
      }>();

      for (const edge of edges.values()) {
        if (edge.strength < minStrength) continue;
        if (edge.evidenceCount < config.minEvidence) continue;
        if (query.evidenceTypes && !query.evidenceTypes.includes(edge.evidenceType)) continue;
        if (!topicMatches(edge.topic, query.topic)) continue;

        const existing = contributorScores.get(edge.contributorId);
        if (existing) {
          existing.totalStrength += edge.strength;
          existing.totalEvidence += edge.evidenceCount;
          existing.edges.push(edge);
          if (edge.strength > existing.bestEdge.strength) {
            existing.bestEdge = edge;
          }
        } else {
          contributorScores.set(edge.contributorId, {
            totalStrength: edge.strength,
            totalEvidence: edge.evidenceCount,
            bestEdge: edge,
            edges: [edge],
          });
        }
      }

      // Return the best edge per contributor, sorted by total strength
      return Array.from(contributorScores.values())
        .sort((a, b) => b.totalStrength - a.totalStrength)
        .slice(0, limit)
        .map(c => ({
          ...c.bestEdge,
          strength: Math.min(config.maxStrength, c.totalStrength / c.edges.length),
          evidenceCount: c.totalEvidence,
        }));
    },

    /**
     * Get all expertise edges for a specific contributor.
     */
    getContributorExpertise(contributorId: string): ExpertiseEdge[] {
      return Array.from(edges.values())
        .filter(e => e.contributorId === contributorId && e.evidenceCount >= config.minEvidence)
        .sort((a, b) => b.strength - a.strength);
    },

    /**
     * Get expertise heatmap: topic → top contributors.
     */
    getHeatmap(topN = 3): Map<string, ExpertiseEdge[]> {
      const topicMap = new Map<string, ExpertiseEdge[]>();

      for (const edge of edges.values()) {
        if (edge.evidenceCount < config.minEvidence) continue;
        const existing = topicMap.get(edge.topic) || [];
        existing.push(edge);
        topicMap.set(edge.topic, existing);
      }

      // Sort each topic's contributors by strength and limit
      for (const [topic, topicEdges] of topicMap) {
        topicMap.set(
          topic,
          topicEdges.sort((a, b) => b.strength - a.strength).slice(0, topN)
        );
      }

      return topicMap;
    },

    /**
     * Apply time-based decay to all expertise edges.
     * Strength decays exponentially based on time since last activity.
     */
    applyDecay(referenceDate?: Date): void {
      const now = referenceDate ?? new Date();

      for (const [key, edge] of edges) {
        const daysSinceActivity = (now.getTime() - edge.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceActivity <= 0) continue;

        const periods = daysSinceActivity / 30; // Decay per 30-day period
        edge.strength *= Math.pow(config.decayFactor, periods);

        // Remove edges that have decayed below threshold
        if (edge.strength < 0.01) {
          edges.delete(key);
        }
      }
    },

    /**
     * Get all edges (for serialization/debugging).
     */
    getEdges(): ExpertiseEdge[] {
      return Array.from(edges.values());
    },

    /**
     * Get graph statistics.
     */
    getStats() {
      const uniqueContributors = new Set<string>();
      const uniqueTopics = new Set<string>();
      for (const edge of edges.values()) {
        uniqueContributors.add(edge.contributorId);
        uniqueTopics.add(edge.topic);
      }
      return {
        totalEdges: edges.size,
        uniqueContributors: uniqueContributors.size,
        uniqueTopics: uniqueTopics.size,
      };
    },

    /**
     * Persist expertise graph to Supabase.
     */
    async persist(supabase: any, organizationId: string): Promise<void> {
      const rows = Array.from(edges.values()).map(edge => ({
        organization_id: organizationId,
        contributor_id: edge.contributorId,
        contributor_name: edge.contributorName || null,
        topic: edge.topic,
        evidence_type: edge.evidenceType,
        strength: Math.round(edge.strength * 10000) / 10000,
        evidence_count: edge.evidenceCount,
        last_activity_at: edge.lastActivityAt.toISOString(),
        updated_at: new Date().toISOString(),
      }));

      if (rows.length === 0) return;

      // Batch upsert (chunks of 100)
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('contributor_expertise')
          .upsert(chunk, {
            onConflict: 'organization_id,contributor_id,topic,evidence_type',
          });
        if (error) {
          throw new Error(`Failed to persist expertise graph: ${error.message}`);
        }
      }
    },

    /**
     * Load expertise graph from Supabase.
     */
    async load(supabase: any, organizationId: string): Promise<void> {
      edges.clear();

      const { data, error } = await supabase
        .from('contributor_expertise')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) {
        throw new Error(`Failed to load expertise graph: ${error.message}`);
      }

      if (data) {
        for (const row of data) {
          const key = edgeKey(row.contributor_id, row.topic, row.evidence_type);
          edges.set(key, {
            contributorId: row.contributor_id,
            contributorName: row.contributor_name,
            topic: row.topic,
            evidenceType: row.evidence_type as EvidenceType,
            strength: Number(row.strength),
            evidenceCount: row.evidence_count,
            lastActivityAt: new Date(row.last_activity_at),
          });
        }
      }
    },
  };
}
