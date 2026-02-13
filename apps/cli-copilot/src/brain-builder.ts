/**
 * Brain Builder — Assemble BrainRegions and build context
 * ═══════════════════════════════════════════════════════════
 * Mirrors the copilot route's V4 path (route.ts lines 362-488).
 * Creates BrainRegions from loaded knowledge, instantiates all brain region
 * factories, and calls createBrainContextBuilder().buildContext().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBrainContextBuilder,
  createEmptyDAG,
  createMultiHopReasoner,
  createExplanationGenerator,
  createCounterfactualSimulator,
  createUncertaintyQuantifier,
  createBrainHealthMonitor,
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
  createAgentLoop,
  createProactiveIntelligence,
  createSessionMemory,
  createReasoningChain,
  createMultiModalInference,
  type BrainRegions,
  type BrainContext,
} from '@nexus-ai/memory-stack';
import type { BrainKnowledge } from './brain-loader.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BrainBuilderConfig {
  orgId: string;
  orgName: string;
  userId?: string;
}

export interface BrainBuilderInstance {
  /** Build brain context for a question, including conversation history */
  buildContext(
    question: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): BrainContext;

  /** Re-initialize with fresh knowledge (for /reload) */
  reload(knowledge: BrainKnowledge): void;

  /** Load structural intelligence (code graphs) if available */
  loadStructuralIntelligence(supabase: SupabaseClient, orgId: string): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a BrainBuilder that assembles BrainRegions and builds context.
 * Same pattern as the copilot route V4 path.
 */
export function createBrainBuilder(
  knowledge: BrainKnowledge,
  config: BrainBuilderConfig,
): BrainBuilderInstance {
  let currentKnowledge = knowledge;

  // Pre-built structural intelligence (loaded async, optional)
  let structuralRegions: {
    dependencyGraph?: ReturnType<typeof createKnowledgeDependencyGraph>;
    expertiseGraph?: ReturnType<typeof createExpertiseGraph>;
    collaborationGraph?: ReturnType<typeof createCollaborationGraph>;
  } = {};

  return {
    buildContext(question, conversationHistory) {
      // ── Assemble BrainRegions ─────────────────────────────────────
      const brainRegions: Partial<BrainRegions> = {};

      // ── Structural Intelligence (if code was ingested) ───────────
      if (structuralRegions.dependencyGraph) {
        brainRegions.dependencyGraph = structuralRegions.dependencyGraph;
      }
      if (structuralRegions.expertiseGraph) {
        brainRegions.expertiseGraph = structuralRegions.expertiseGraph;
      }
      if (structuralRegions.collaborationGraph) {
        brainRegions.collaborationGraph = structuralRegions.collaborationGraph;
      }

      // ── Causal Intelligence (build DAG from loaded edges) ────────
      // Note: Factory return types don't exactly match BrainRegions inline shapes
      // (same situation as copilot route which uses dynamic imports to skip checks).
      // We cast via `as any` for the factories with minor type drift.
      if (currentKnowledge.causalEdges.length > 0) {
        // Collect unique domains for DAG initialization
        const domainSet = new Set<string>();
        for (const edge of currentKnowledge.causalEdges) {
          domainSet.add(edge.source_domain);
          domainSet.add(edge.target_domain);
        }
        const dag = createEmptyDAG([...domainSet]);
        for (const edge of currentKnowledge.causalEdges) {
          if (!dag.edges.has(edge.source_domain)) {
            dag.edges.set(edge.source_domain, new Map());
          }
          dag.edges.get(edge.source_domain)!.set(edge.target_domain, {
            weight: edge.effect_size,
            pValue: edge.granger_p_value,
            lagDays: edge.optimal_lag_days,
            lastUpdated: new Date(),
            sampleSize: edge.sample_size || 30,
          });
        }
        brainRegions.causalDAG = dag;
        brainRegions.multiHopReasoner = createMultiHopReasoner() as any;
        brainRegions.explanationGenerator = createExplanationGenerator() as any;
        brainRegions.counterfactualSimulator = createCounterfactualSimulator() as any;
        brainRegions.uncertaintyQuantifier = createUncertaintyQuantifier() as any;
        brainRegions.brainHealthMonitor = createBrainHealthMonitor();
      }

      // ── Trained Knowledge (from DB) ──────────────────────────────
      brainRegions.trainedKnowledge = {
        causalEdges: currentKnowledge.causalEdges,
        rules: currentKnowledge.rules,
        patterns: currentKnowledge.patterns,
        cascadeRules: currentKnowledge.cascadeRules,
      };

      // ── Conversation History ─────────────────────────────────────
      if (conversationHistory && conversationHistory.length > 0) {
        brainRegions.conversationHistory = conversationHistory;
      }

      // ── Persona ──────────────────────────────────────────────────
      brainRegions.persona = {
        name: config.orgName,
        description: `AI copilot for ${config.orgName}, powered by NexusBrain's 24-region intelligence engine.`,
      };

      // ── Claude-Aspirational Capabilities ─────────────────────────
      brainRegions.agentLoop = createAgentLoop({ maxSteps: 10 });
      brainRegions.proactiveIntelligence = createProactiveIntelligence();
      brainRegions.sessionMemory = createSessionMemory({
        userId: config.userId || 'cli-user',
        organizationId: config.orgId,
      });
      brainRegions.reasoningChain = createReasoningChain({ depth: 'moderate' });
      brainRegions.multiModalInference = createMultiModalInference();

      // ── Build Context ────────────────────────────────────────────
      const builder = createBrainContextBuilder(brainRegions as BrainRegions);
      return builder.buildContext(question);
    },

    reload(knowledge) {
      currentKnowledge = knowledge;
    },

    async loadStructuralIntelligence(supabase, orgId) {
      try {
        const depGraph = createKnowledgeDependencyGraph();
        const expertiseGraph = createExpertiseGraph();
        const collabGraph = createCollaborationGraph();

        await Promise.all([
          depGraph.load(supabase, orgId),
          expertiseGraph.load(supabase, orgId),
          collabGraph.load(supabase, orgId),
        ]);

        structuralRegions = {
          dependencyGraph: depGraph,
          expertiseGraph,
          collaborationGraph: collabGraph,
        };

        return true;
      } catch {
        // Non-fatal: structural intelligence not available
        return false;
      }
    },
  };
}
