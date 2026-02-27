/**
 * DAAO: Difficulty-Aware Adaptive Orchestration
 * Platform-level re-export of the DAAO model router from @nexus-ai/memory-stack.
 *
 * Research: 84% cost reduction, +11% quality vs single-model approach.
 * (DAAO paper, 2025 — Difficulty-Aware Adaptive Orchestration for LLMs)
 *
 * Three-tier routing:
 *   Haiku  ($0.80/M tokens) — simple queries, factual lookups, status checks
 *   Sonnet ($15/M tokens)   — moderate complexity, multi-domain, strategic
 *   Opus   ($75/M tokens)   — expert: 3+ system boundaries, architectural decisions
 *
 * The actual routing logic lives in packages/memory-stack/src/infra/smart-model-router.ts.
 * This file provides a stable platform-level import path.
 */

// NOTE: memory-stack uses dynamic require (TypeScript compiler inside).
// This file is imported at runtime via getMemoryStackSync() in the chat route.
// For direct use in other platform routes, use the dynamic import pattern:
//   const { routeQueryDAA } = await import('@nexus-ai/memory-stack');

export type { ModelTier, RoutingDecision } from '@nexus-ai/memory-stack';
export { routeQueryDAA, MODEL_FAST, MODEL_DEEP, MODEL_EXPERT } from '@nexus-ai/memory-stack';
