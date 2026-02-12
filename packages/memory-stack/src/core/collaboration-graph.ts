/**
 * Collaboration Graph
 *
 * Tracks cross-team interaction patterns between contributors.
 * Powers UC6 (Cross-Team Visibility): "Which teams collaborate most?",
 * "Who has cross-functional reach?", "What are our collaboration bottlenecks?"
 *
 * Fed by ANY connector — GitHub (reviewer↔author), Slack (thread replies),
 * Jira (assignee↔reporter), PagerDuty (responder↔escalator).
 *
 * Features:
 * - Bidirectional edge tracking (A reviews B = A↔B collaboration)
 * - Interaction type classification (review, discussion, incident, handoff)
 * - Team-level aggregation for org-wide visibility
 * - Recency-weighted strength (recent interactions count more)
 * - In-memory graph with Supabase persistence
 * - Zero external dependencies
 */

// =============================================================================
// TYPES
// =============================================================================

export type InteractionType =
  | 'code_review'     // Reviewer ↔ Author
  | 'pr_co_author'    // Co-authors on a PR
  | 'thread_reply'    // Slack thread back-and-forth
  | 'incident_collab' // Co-responders on an incident
  | 'issue_handoff'   // Issue reassignment or cross-team handoff
  | 'mention'         // @mention in Slack / GitHub
  | 'approval';       // PR approval, deployment approval

export interface CollaborationEdge {
  contributorA: string;  // Canonical contributor ID
  contributorB: string;  // Canonical contributor ID
  interactionType: InteractionType;
  weight: number;        // 0-1, recency-weighted
  count: number;         // Total interactions
  lastInteractionAt: Date;
  /** Optional: team tags for aggregation */
  teamA?: string;
  teamB?: string;
  /** Metadata: channels, repos, services where collaboration happened */
  contexts: string[];
}

export interface CollaborationInput {
  contributorA: string;
  contributorB: string;
  interactionType: InteractionType;
  timestamp?: Date;
  context?: string;  // e.g., channel name, repo name, service name
  teamA?: string;
  teamB?: string;
}

export interface CollaborationQuery {
  contributor?: string;  // Find collaborators for a specific person
  team?: string;         // Find collaborations involving a team
  interactionTypes?: InteractionType[];
  minWeight?: number;
  limit?: number;
}

export interface TeamCollaborationSummary {
  teamA: string;
  teamB: string;
  totalInteractions: number;
  uniqueContributorPairs: number;
  interactionTypes: Record<string, number>;
  topCollaborators: Array<{ a: string; b: string; count: number }>;
  lastInteractionAt: Date;
}

export interface CollaborationGraphConfig {
  /** Decay factor per 30 days of inactivity (default: 0.90) */
  decayFactor?: number;
  /** Weight increment per interaction (default: 0.08) */
  weightPerInteraction?: number;
  /** Maximum weight cap (default: 0.99) */
  maxWeight?: number;
}

export interface CollaborationGraphInstance {
  recordInteraction(input: CollaborationInput): void;
  recordBatch(inputs: CollaborationInput[]): void;
  getCollaborators(query: CollaborationQuery): CollaborationEdge[];
  getTeamSummary(): TeamCollaborationSummary[];
  getNetworkStats(): CollaborationNetworkStats;
  getCrossTeamEdges(): CollaborationEdge[];
  getBridgeContributors(topN?: number): Array<{ contributor: string; crossTeamEdges: number; teams: string[] }>;
  applyDecay(referenceDate?: Date): void;
  getEdges(): CollaborationEdge[];
  persist(supabase: any, organizationId: string): Promise<void>;
  load(supabase: any, organizationId: string): Promise<void>;
}

export interface CollaborationNetworkStats {
  totalEdges: number;
  uniqueContributors: number;
  uniqueTeams: number;
  crossTeamEdges: number;
  avgInteractionsPerEdge: number;
  density: number; // edges / max possible edges
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: Required<CollaborationGraphConfig> = {
  decayFactor: 0.90,
  weightPerInteraction: 0.08,
  maxWeight: 0.99,
};

// =============================================================================
// HELPERS
// =============================================================================

/** Canonical edge key (A < B to deduplicate direction) */
function edgeKey(a: string, b: string, type: InteractionType): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${first}::${second}::${type}`;
}

// =============================================================================
// COLLABORATION GRAPH
// =============================================================================

export function createCollaborationGraph(
  userConfig?: CollaborationGraphConfig
): CollaborationGraphInstance {
  const config: Required<CollaborationGraphConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  const edges = new Map<string, CollaborationEdge>();

  return {
    /**
     * Record a single collaboration interaction.
     * Bidirectional: A↔B is the same as B↔A for the same interaction type.
     */
    recordInteraction(input: CollaborationInput): void {
      // Skip self-interactions
      if (input.contributorA === input.contributorB) return;

      const key = edgeKey(input.contributorA, input.contributorB, input.interactionType);
      const [first, second] = input.contributorA < input.contributorB
        ? [input.contributorA, input.contributorB]
        : [input.contributorB, input.contributorA];
      const now = input.timestamp ?? new Date();
      const existing = edges.get(key);

      if (existing) {
        existing.count++;
        existing.weight = Math.min(
          config.maxWeight,
          existing.weight + config.weightPerInteraction * (1 - existing.weight)
        );
        existing.lastInteractionAt = now > existing.lastInteractionAt ? now : existing.lastInteractionAt;
        if (input.context && !existing.contexts.includes(input.context)) {
          existing.contexts.push(input.context);
          // Cap contexts at 20 to prevent memory bloat
          if (existing.contexts.length > 20) {
            existing.contexts = existing.contexts.slice(-20);
          }
        }
        // Update teams if newly provided
        if (input.teamA) {
          existing.teamA = input.contributorA < input.contributorB ? input.teamA : input.teamB || existing.teamB;
        }
        if (input.teamB) {
          existing.teamB = input.contributorA < input.contributorB ? input.teamB : input.teamA || existing.teamA;
        }
      } else {
        edges.set(key, {
          contributorA: first,
          contributorB: second,
          interactionType: input.interactionType,
          weight: Math.min(config.maxWeight, config.weightPerInteraction),
          count: 1,
          lastInteractionAt: now,
          teamA: input.contributorA < input.contributorB ? input.teamA : input.teamB,
          teamB: input.contributorA < input.contributorB ? input.teamB : input.teamA,
          contexts: input.context ? [input.context] : [],
        });
      }
    },

    recordBatch(inputs: CollaborationInput[]): void {
      for (const input of inputs) {
        this.recordInteraction(input);
      }
    },

    /**
     * Find collaborators for a person or team.
     */
    getCollaborators(query: CollaborationQuery): CollaborationEdge[] {
      const minWeight = query.minWeight ?? 0.05;
      const limit = query.limit ?? 10;

      let results = Array.from(edges.values())
        .filter(e => e.weight >= minWeight);

      // Filter by contributor
      if (query.contributor) {
        results = results.filter(e =>
          e.contributorA === query.contributor || e.contributorB === query.contributor
        );
      }

      // Filter by team
      if (query.team) {
        results = results.filter(e =>
          e.teamA === query.team || e.teamB === query.team
        );
      }

      // Filter by interaction types
      if (query.interactionTypes?.length) {
        results = results.filter(e =>
          query.interactionTypes!.includes(e.interactionType)
        );
      }

      return results
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit);
    },

    /**
     * Get team-level collaboration summary.
     * Groups edges by team pairs and aggregates.
     */
    getTeamSummary(): TeamCollaborationSummary[] {
      const teamPairs = new Map<string, {
        teamA: string;
        teamB: string;
        interactions: number;
        pairs: Set<string>;
        types: Record<string, number>;
        topCollab: Map<string, { a: string; b: string; count: number }>;
        lastAt: Date;
      }>();

      for (const edge of edges.values()) {
        if (!edge.teamA || !edge.teamB) continue;

        const [tA, tB] = edge.teamA < edge.teamB
          ? [edge.teamA, edge.teamB]
          : [edge.teamB, edge.teamA];
        const tKey = `${tA}::${tB}`;

        const existing = teamPairs.get(tKey);
        if (existing) {
          existing.interactions += edge.count;
          existing.pairs.add(`${edge.contributorA}::${edge.contributorB}`);
          existing.types[edge.interactionType] = (existing.types[edge.interactionType] || 0) + edge.count;
          const pairKey = `${edge.contributorA}::${edge.contributorB}`;
          const existingPair = existing.topCollab.get(pairKey);
          if (existingPair) {
            existingPair.count += edge.count;
          } else {
            existing.topCollab.set(pairKey, {
              a: edge.contributorA,
              b: edge.contributorB,
              count: edge.count,
            });
          }
          if (edge.lastInteractionAt > existing.lastAt) {
            existing.lastAt = edge.lastInteractionAt;
          }
        } else {
          const tc = new Map<string, { a: string; b: string; count: number }>();
          tc.set(`${edge.contributorA}::${edge.contributorB}`, {
            a: edge.contributorA,
            b: edge.contributorB,
            count: edge.count,
          });
          teamPairs.set(tKey, {
            teamA: tA,
            teamB: tB,
            interactions: edge.count,
            pairs: new Set([`${edge.contributorA}::${edge.contributorB}`]),
            types: { [edge.interactionType]: edge.count },
            topCollab: tc,
            lastAt: edge.lastInteractionAt,
          });
        }
      }

      return Array.from(teamPairs.values())
        .map(tp => ({
          teamA: tp.teamA,
          teamB: tp.teamB,
          totalInteractions: tp.interactions,
          uniqueContributorPairs: tp.pairs.size,
          interactionTypes: tp.types,
          topCollaborators: Array.from(tp.topCollab.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
          lastInteractionAt: tp.lastAt,
        }))
        .sort((a, b) => b.totalInteractions - a.totalInteractions);
    },

    /**
     * Network-level statistics for collaboration health.
     */
    getNetworkStats(): CollaborationNetworkStats {
      const contributors = new Set<string>();
      const teams = new Set<string>();
      let crossTeam = 0;
      let totalInteractions = 0;

      for (const edge of edges.values()) {
        contributors.add(edge.contributorA);
        contributors.add(edge.contributorB);
        if (edge.teamA) teams.add(edge.teamA);
        if (edge.teamB) teams.add(edge.teamB);
        if (edge.teamA && edge.teamB && edge.teamA !== edge.teamB) crossTeam++;
        totalInteractions += edge.count;
      }

      const n = contributors.size;
      const maxEdges = n > 1 ? (n * (n - 1)) / 2 : 1;
      const uniqueUndirectedEdges = new Set(
        Array.from(edges.values()).map(e =>
          e.contributorA < e.contributorB
            ? `${e.contributorA}::${e.contributorB}`
            : `${e.contributorB}::${e.contributorA}`
        )
      ).size;

      return {
        totalEdges: edges.size,
        uniqueContributors: contributors.size,
        uniqueTeams: teams.size,
        crossTeamEdges: crossTeam,
        avgInteractionsPerEdge: edges.size > 0 ? totalInteractions / edges.size : 0,
        density: uniqueUndirectedEdges / maxEdges,
      };
    },

    /**
     * Get all cross-team edges (where teamA ≠ teamB).
     * These are the "bridge" interactions that connect silos.
     */
    getCrossTeamEdges(): CollaborationEdge[] {
      return Array.from(edges.values())
        .filter(e => e.teamA && e.teamB && e.teamA !== e.teamB)
        .sort((a, b) => b.weight - a.weight);
    },

    /**
     * Find "bridge" contributors who connect multiple teams.
     * These are the organizational connectors who prevent silos.
     */
    getBridgeContributors(topN = 5): Array<{ contributor: string; crossTeamEdges: number; teams: string[] }> {
      const contributorTeams = new Map<string, { crossEdges: number; teams: Set<string> }>();

      for (const edge of edges.values()) {
        if (!edge.teamA || !edge.teamB || edge.teamA === edge.teamB) continue;

        // Contributor A bridges teams
        const aData = contributorTeams.get(edge.contributorA) || { crossEdges: 0, teams: new Set<string>() };
        aData.crossEdges++;
        if (edge.teamA) aData.teams.add(edge.teamA);
        if (edge.teamB) aData.teams.add(edge.teamB);
        contributorTeams.set(edge.contributorA, aData);

        // Contributor B bridges teams
        const bData = contributorTeams.get(edge.contributorB) || { crossEdges: 0, teams: new Set<string>() };
        bData.crossEdges++;
        if (edge.teamA) bData.teams.add(edge.teamA);
        if (edge.teamB) bData.teams.add(edge.teamB);
        contributorTeams.set(edge.contributorB, bData);
      }

      return Array.from(contributorTeams.entries())
        .map(([contributor, data]) => ({
          contributor,
          crossTeamEdges: data.crossEdges,
          teams: Array.from(data.teams),
        }))
        .filter(c => c.teams.length >= 2)
        .sort((a, b) => b.crossTeamEdges - a.crossTeamEdges)
        .slice(0, topN);
    },

    /**
     * Apply time-based decay to all collaboration edges.
     */
    applyDecay(referenceDate?: Date): void {
      const now = referenceDate ?? new Date();

      for (const [key, edge] of edges) {
        const daysSince = (now.getTime() - edge.lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 0) continue;

        const periods = daysSince / 30;
        edge.weight *= Math.pow(config.decayFactor, periods);

        if (edge.weight < 0.01) {
          edges.delete(key);
        }
      }
    },

    getEdges(): CollaborationEdge[] {
      return Array.from(edges.values());
    },

    /**
     * Persist collaboration graph to Supabase.
     * Uses the cross_domain_signals table with a special entity_type.
     */
    async persist(supabase: any, organizationId: string): Promise<void> {
      const rows = Array.from(edges.values()).map(edge => ({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'collaboration_edge',
        signal_value: edge.weight,
        entity_type: 'collaboration',
        entity_id: `${edge.contributorA}::${edge.contributorB}::${edge.interactionType}`,
        metadata: {
          contributor_a: edge.contributorA,
          contributor_b: edge.contributorB,
          interaction_type: edge.interactionType,
          count: edge.count,
          team_a: edge.teamA || null,
          team_b: edge.teamB || null,
          contexts: edge.contexts,
          last_interaction_at: edge.lastInteractionAt.toISOString(),
        },
      }));

      if (rows.length === 0) return;

      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('cross_domain_signals')
          .upsert(chunk, {
            onConflict: 'organization_id,entity_type,entity_id',
          });
        if (error) {
          throw new Error(`Failed to persist collaboration graph: ${error.message}`);
        }
      }
    },

    /**
     * Load collaboration graph from Supabase.
     */
    async load(supabase: any, organizationId: string): Promise<void> {
      edges.clear();

      const { data, error } = await supabase
        .from('cross_domain_signals')
        .select('signal_value, metadata, entity_id')
        .eq('organization_id', organizationId)
        .eq('signal_type', 'collaboration_edge')
        .eq('entity_type', 'collaboration');

      if (error) {
        throw new Error(`Failed to load collaboration graph: ${error.message}`);
      }

      if (data) {
        for (const row of data) {
          const meta = row.metadata || {};
          const key = edgeKey(
            meta.contributor_a,
            meta.contributor_b,
            meta.interaction_type as InteractionType
          );
          edges.set(key, {
            contributorA: meta.contributor_a,
            contributorB: meta.contributor_b,
            interactionType: meta.interaction_type as InteractionType,
            weight: Number(row.signal_value),
            count: meta.count || 1,
            lastInteractionAt: new Date(meta.last_interaction_at || Date.now()),
            teamA: meta.team_a || undefined,
            teamB: meta.team_b || undefined,
            contexts: meta.contexts || [],
          });
        }
      }
    },
  };
}
