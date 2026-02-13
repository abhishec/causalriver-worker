/**
 * Code Intelligence Context Builder — Thin Wrapper
 *
 * Delegates to the brain SDK's universal context builder.
 * This file exists for backward compatibility with the copilot chat route.
 *
 * All intelligence logic lives in:
 *   @nexus-ai/memory-stack → createBrainContextBuilder()
 */

import {
  createBrainContextBuilder,
  type BrainContext,
  type BrainIntent,
  type KnowledgeDependencyGraphInstance,
  type ExpertiseGraphInstance,
  type CollaborationGraphInstance,
} from "@nexus-ai/memory-stack";

// Re-export types for backward compatibility
export type DeveloperUseCase = BrainIntent;
export type CodeIntelligenceContext = BrainContext;

/**
 * Build code intelligence context using the brain SDK's universal context builder.
 * This is the same function signature the copilot route already imports.
 */
export function buildCodeIntelligencePrompt(
  depGraph: KnowledgeDependencyGraphInstance | null,
  expertiseGraph: ExpertiseGraphInstance | null,
  collabGraph: CollaborationGraphInstance | null,
  question: string,
  _codeSymbols?: Array<{ symbol: string; filePath: string; kind: string; similarity: number }>,
): BrainContext {
  const builder = createBrainContextBuilder({
    dependencyGraph: depGraph ?? undefined,
    expertiseGraph: expertiseGraph ?? undefined,
    collaborationGraph: collabGraph ?? undefined,
  });

  return builder.buildContext(question);
}
