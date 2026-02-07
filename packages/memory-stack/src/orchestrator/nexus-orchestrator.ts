/**
 * Nexus Orchestrator
 *
 * The product layer that ties everything together.
 * Provides a single entry point for:
 *   - Querying organizational memory with causal context
 *   - Ingesting signals from external systems
 *   - Recording outcomes for feedback loop closure
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createEventBus, createOutcomeEvent } from '../causality/event-bus';
import { createSemanticSearch, type SemanticSearchConfig } from '../core/search';
import { wireNexusBridges, type BridgeConfig } from '../bridges';
import {
  formatCausalForPrompt,
  formatPatternsForPrompt,
  assembleContextPrompt,
} from './context-formatters';

// ============================================================================
// TYPES
// ============================================================================

export interface NexusOrchestratorConfig {
  /** Supabase client for persistence */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Bridge wiring configuration */
  bridges?: BridgeConfig;
  /** Semantic search configuration */
  search?: Partial<SemanticSearchConfig>;
}

export interface NexusQueryResult {
  /** Semantic search results */
  searchResults: Array<{
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
  /** Causal relationships relevant to the query domain */
  causalContext: string;
  /** Discovered patterns */
  patternContext: string;
  /** Full assembled prompt context */
  assembledContext: string;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Create the Nexus Orchestrator - the main entry point for the brain.
 *
 * @example
 * ```typescript
 * const nexus = createNexusOrchestrator({
 *   supabase,
 *   organizationId: 'org_123',
 * });
 *
 * // Query with full causal context
 * const result = await nexus.query('Why is churn increasing?', 'cs');
 *
 * // Ingest a signal
 * nexus.ingest([{ source_domain: 'finance', signal_type: 'payment_delay', ... }]);
 * ```
 */
export function createNexusOrchestrator(config: NexusOrchestratorConfig) {
  const { supabase, organizationId, bridges: bridgeConfig } = config;

  // Initialize event bus
  const eventBus = createEventBus();

  // Wire all bridges
  const {
    signalBridge,
    contextEnricher,
    getStats: getBridgeStats,
  } = wireNexusBridges(eventBus, bridgeConfig);

  // Initialize semantic search
  const semanticSearch = createSemanticSearch({
    ...config.search,
    organizationId,
  });

  return {
    /**
     * Query organizational memory with causal context enrichment
     */
    async query(
      queryText: string,
      domain?: string
    ): Promise<NexusQueryResult> {
      // 1. Semantic search
      const searchResults = await semanticSearch.search(supabase, queryText, {
        organizationId,
        limit: 5,
      });

      // 2. Get causal context from bridge cache
      const agentContext = contextEnricher.getContextForAgent(
        organizationId,
        domain
      );

      // 3. Format for LLM
      const causalContext = formatCausalForPrompt(
        agentContext.causalRelationships
      );
      const patternContext = formatPatternsForPrompt(agentContext.patterns);

      const ragText = searchResults
        .map((r: any) => r.content || r.text || '')
        .filter(Boolean)
        .join('\n---\n');

      const assembledContext = assembleContextPrompt({
        rag: ragText || undefined,
        causal: causalContext || undefined,
        patterns: patternContext || undefined,
      });

      return {
        searchResults: searchResults.map((r: any) => ({
          content: r.content || r.text || '',
          similarity: r.similarity || 0,
          metadata: r.metadata || {},
        })),
        causalContext,
        patternContext,
        assembledContext,
      };
    },

    /**
     * Ingest signals from external systems
     */
    ingest(signals: Array<{
      organization_id?: string;
      source_domain: string;
      signal_type: string;
      signal_value: number;
      entity_type?: string;
      entity_id?: string;
      client_id?: string;
      metadata?: Record<string, unknown>;
    }>) {
      signalBridge.onSignalsCollected(signals);
    },

    /**
     * Record an outcome for feedback loop closure
     */
    recordOutcome(outcome: {
      entityType: string;
      entityId: string;
      metricValue: number;
      domain: string;
      metadata?: Record<string, unknown>;
    }) {
      const event = createOutcomeEvent(organizationId, {
        entity_type: outcome.entityType,
        entity_id: outcome.entityId,
        metric_name: outcome.entityType,
        metric_value: outcome.metricValue,
      });
      eventBus.emit(event);
    },

    /** Get the event bus instance for direct access */
    getEventBus() {
      return eventBus;
    },

    /** Get context enricher for domain agents */
    getContextEnricher() {
      return contextEnricher;
    },

    /** Get stats from all layers */
    getStats() {
      return {
        bridges: getBridgeStats(),
        eventBus: eventBus.getStats(),
      };
    },
  };
}
