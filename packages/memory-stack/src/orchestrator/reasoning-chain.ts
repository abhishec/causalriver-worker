/**
 * Reasoning Chain — Explicit Chain-of-Thought Surfacing
 * ══════════════════════════════════════════════════════════
 *
 * Claude-level capability: Makes the brain's reasoning process transparent
 * and inspectable. Collects reasoning steps from multiple brain regions,
 * links them into a coherent chain, and presents them alongside the final
 * answer so the LLM can show its work.
 *
 * Brain Analog: The Dorsolateral Prefrontal Cortex — working memory and
 * executive function that maintains and manipulates chains of thought.
 *
 * Features:
 * - Multi-region reasoning chain assembly
 * - Step-by-step evidence linking
 * - Confidence propagation through the chain
 * - Alternative path tracking (what else was considered?)
 * - Reasoning depth control (shallow → deep)
 * - Chain visualization (ASCII art + structured data)
 * - Integration with Multi-Hop Reasoner + Explanation Generator
 *
 * @example
 * ```typescript
 * const chain = createReasoningChain();
 *
 * chain.addStep({
 *   region: 'dependency-graph',
 *   reasoning: 'Found that auth-service depends on user-db',
 *   evidence: 'Graph query: 3 direct dependencies',
 *   confidence: 0.95,
 * });
 *
 * chain.addStep({
 *   region: 'multi-hop-reasoner',
 *   reasoning: 'Traced causal chain: user-db lag → auth failures → API 500s',
 *   evidence: 'Multi-hop path with 0.87 confidence',
 *   confidence: 0.87,
 * });
 *
 * const result = chain.finalize('API 500 errors caused by user-db latency');
 * console.log(result.chain);        // Step-by-step reasoning
 * console.log(result.promptText);   // Formatted for LLM
 * console.log(result.confidence);   // Propagated confidence
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for reasoning chains */
export interface ReasoningChainConfig {
  /** Maximum steps in a chain (default: 20) */
  maxSteps?: number;
  /** Minimum confidence to include a step (default: 0.1) */
  minStepConfidence?: number;
  /** Whether to track alternative paths (default: true) */
  trackAlternatives?: boolean;
  /** Reasoning depth: 'shallow' | 'moderate' | 'deep' (default: 'moderate') */
  depth?: 'shallow' | 'moderate' | 'deep';
  /** Verbose logging */
  verbose?: boolean;
}

/** A single step in a reasoning chain */
export interface ReasoningStep {
  /** Step number (auto-assigned) */
  stepNum: number;
  /** Which brain region contributed this step */
  region: string;
  /** The reasoning at this step */
  reasoning: string;
  /** Evidence supporting this step */
  evidence: string;
  /** Confidence in this step (0-1) */
  confidence: number;
  /** What this step depends on (step numbers) */
  dependsOn: number[];
  /** Timestamp */
  timestamp: Date;
  /** Alternative conclusions considered at this step */
  alternatives?: string[];
  /** Metadata from the brain region */
  metadata?: Record<string, unknown>;
}

/** An alternative reasoning path that was considered but not chosen */
export interface AlternativePath {
  /** Why this path was considered */
  description: string;
  /** Steps in this alternative */
  steps: Array<{ reasoning: string; confidence: number }>;
  /** Why it was not chosen */
  rejectionReason: string;
  /** Confidence of this alternative (lower than chosen path) */
  confidence: number;
}

/** The finalized reasoning chain */
export interface FinalizedChain {
  /** Ordered steps in the reasoning chain */
  chain: ReasoningStep[];
  /** Final conclusion */
  conclusion: string;
  /** Overall confidence (propagated through chain) */
  confidence: number;
  /** Alternative paths considered */
  alternatives: AlternativePath[];
  /** Chain depth (number of dependent steps) */
  depth: number;
  /** Brain regions that contributed */
  regionsUsed: string[];
  /** Chain strength assessment */
  strength: 'strong' | 'moderate' | 'weak' | 'speculative';
  /** Where the chain is weakest */
  weakestLink: {
    stepNum: number;
    confidence: number;
    reasoning: string;
  } | null;
  /** Formatted prompt text for LLM injection */
  promptText: string;
  /** ASCII visualization of the chain */
  visualization: string;
  /** Total evidence pieces */
  totalEvidence: number;
}

/** Input for adding a step */
export interface StepInput {
  /** Brain region name */
  region: string;
  /** Reasoning text */
  reasoning: string;
  /** Evidence text */
  evidence: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Dependencies (step numbers) */
  dependsOn?: number[];
  /** Alternatives considered */
  alternatives?: string[];
  /** Extra metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute propagated confidence through a chain.
 * Each step's confidence is attenuated by its dependencies.
 */
function propagateConfidence(steps: ReasoningStep[]): number {
  if (steps.length === 0) return 0;
  if (steps.length === 1) return steps[0].confidence;

  // For each step, confidence = min(own confidence, max(dependency confidences))
  // Overall = geometric mean of all steps
  let product = 1;
  for (const step of steps) {
    product *= step.confidence;
  }
  return Math.pow(product, 1 / steps.length);
}

/**
 * Compute the depth of the reasoning chain (longest dependency path).
 */
function computeChainDepth(steps: ReasoningStep[]): number {
  if (steps.length === 0) return 0;

  const depths = new Map<number, number>();
  for (const step of steps) {
    if (step.dependsOn.length === 0) {
      depths.set(step.stepNum, 1);
    } else {
      const maxDepDelta = Math.max(
        ...step.dependsOn.map((d) => depths.get(d) || 0),
      );
      depths.set(step.stepNum, maxDepDelta + 1);
    }
  }

  return Math.max(...Array.from(depths.values()), 0);
}

/**
 * Generate ASCII visualization of the reasoning chain.
 */
function visualizeChain(steps: ReasoningStep[], conclusion: string): string {
  if (steps.length === 0) return '(empty chain)';

  const lines: string[] = [];
  lines.push('┌─ Reasoning Chain ─────────────────────────────────────┐');

  for (const step of steps) {
    const confBar = '█'.repeat(Math.round(step.confidence * 10));
    const confEmpty = '░'.repeat(10 - Math.round(step.confidence * 10));
    const deps = step.dependsOn.length > 0 ? ` ← [${step.dependsOn.join(',')}]` : '';
    lines.push(`│ Step ${step.stepNum} [${step.region}]${deps}`);
    lines.push(`│   ${step.reasoning.slice(0, 60)}${step.reasoning.length > 60 ? '...' : ''}`);
    lines.push(`│   Confidence: [${confBar}${confEmpty}] ${(step.confidence * 100).toFixed(0)}%`);
    if (step.alternatives && step.alternatives.length > 0) {
      lines.push(`│   (${step.alternatives.length} alternative(s) considered)`);
    }
    lines.push('│');
  }

  lines.push('│ ▼');
  lines.push(`│ CONCLUSION: ${conclusion.slice(0, 55)}${conclusion.length > 55 ? '...' : ''}`);
  lines.push('└───────────────────────────────────────────────────────┘');

  return lines.join('\n');
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a reasoning chain builder for explicit chain-of-thought surfacing.
 *
 * Collects reasoning steps from multiple brain regions, links them into
 * a coherent chain, and presents them alongside the final answer.
 */
export function createReasoningChain(config: ReasoningChainConfig = {}) {
  const {
    maxSteps = 20,
    minStepConfidence = 0.1,
    trackAlternatives = true,
    depth = 'moderate',
    verbose = false,
  } = config;

  const steps: ReasoningStep[] = [];
  const alternatives: AlternativePath[] = [];
  let stepCounter = 0;

  return {
    /**
     * Add a reasoning step to the chain.
     */
    addStep(input: StepInput): ReasoningStep {
      if (steps.length >= maxSteps) {
        // Replace lowest-confidence step
        const lowestIdx = steps.reduce(
          (minIdx, s, idx) => (s.confidence < steps[minIdx].confidence ? idx : minIdx),
          0,
        );
        if (input.confidence > steps[lowestIdx].confidence) {
          steps.splice(lowestIdx, 1);
        } else {
          return steps[steps.length - 1]; // Don't add low-confidence step
        }
      }

      stepCounter++;
      const step: ReasoningStep = {
        stepNum: stepCounter,
        region: input.region,
        reasoning: input.reasoning,
        evidence: input.evidence,
        confidence: input.confidence,
        dependsOn: input.dependsOn || (steps.length > 0 ? [steps[steps.length - 1].stepNum] : []),
        timestamp: new Date(),
        alternatives: input.alternatives,
        metadata: input.metadata,
      };

      if (step.confidence >= minStepConfidence) {
        steps.push(step);
      }

      return step;
    },

    /**
     * Add an alternative path that was considered.
     */
    addAlternative(alt: AlternativePath): void {
      if (trackAlternatives) {
        alternatives.push(alt);
      }
    },

    /**
     * Finalize the chain with a conclusion.
     */
    finalize(conclusion: string): FinalizedChain {
      const confidence = propagateConfidence(steps);
      const chainDepth = computeChainDepth(steps);
      const regionsUsed = [...new Set(steps.map((s) => s.region))];

      // Determine chain strength
      let strength: FinalizedChain['strength'];
      if (confidence > 0.7 && steps.length >= 2) strength = 'strong';
      else if (confidence > 0.4) strength = 'moderate';
      else if (confidence > 0.2) strength = 'weak';
      else strength = 'speculative';

      // Find weakest link
      let weakestLink: FinalizedChain['weakestLink'] = null;
      if (steps.length > 0) {
        const weakest = steps.reduce((min, s) => (s.confidence < min.confidence ? s : min), steps[0]);
        weakestLink = {
          stepNum: weakest.stepNum,
          confidence: weakest.confidence,
          reasoning: weakest.reasoning,
        };
      }

      // Build prompt text
      const promptParts: string[] = [];
      promptParts.push('## Reasoning Chain (Show Your Work)');
      promptParts.push('');
      promptParts.push(`*Chain strength: ${strength} | Confidence: ${(confidence * 100).toFixed(0)}% | Depth: ${chainDepth} steps | Regions: ${regionsUsed.join(', ')}*`);
      promptParts.push('');

      // Include steps based on depth setting
      const maxDisplaySteps = depth === 'shallow' ? 3 : depth === 'deep' ? maxSteps : 7;
      const displaySteps = steps.slice(0, maxDisplaySteps);

      for (const step of displaySteps) {
        promptParts.push(`### Step ${step.stepNum}: ${step.region}`);
        promptParts.push(`**Reasoning:** ${step.reasoning}`);
        promptParts.push(`**Evidence:** ${step.evidence}`);
        promptParts.push(`**Confidence:** ${(step.confidence * 100).toFixed(0)}%`);
        if (step.alternatives && step.alternatives.length > 0 && depth === 'deep') {
          promptParts.push(`**Alternatives considered:** ${step.alternatives.join('; ')}`);
        }
        promptParts.push('');
      }

      if (steps.length > maxDisplaySteps) {
        promptParts.push(`*... ${steps.length - maxDisplaySteps} additional steps omitted for brevity ...*`);
        promptParts.push('');
      }

      promptParts.push(`### Conclusion`);
      promptParts.push(conclusion);
      promptParts.push('');

      if (weakestLink && weakestLink.confidence < 0.5) {
        promptParts.push(`⚠️ **Weakest link:** Step ${weakestLink.stepNum} (${(weakestLink.confidence * 100).toFixed(0)}% confidence) — ${weakestLink.reasoning.slice(0, 100)}`);
        promptParts.push('');
      }

      if (alternatives.length > 0 && depth !== 'shallow') {
        promptParts.push('### Alternative Explanations Considered');
        for (const alt of alternatives.slice(0, 3)) {
          promptParts.push(`- ${alt.description} (${(alt.confidence * 100).toFixed(0)}% confidence) — Rejected: ${alt.rejectionReason}`);
        }
        promptParts.push('');
      }

      promptParts.push('When presenting this reasoning to the user, show the step-by-step chain to build trust.');
      promptParts.push('If the chain has weak links, acknowledge uncertainty explicitly.');

      return {
        chain: [...steps],
        conclusion,
        confidence,
        alternatives: [...alternatives],
        depth: chainDepth,
        regionsUsed,
        strength,
        weakestLink,
        promptText: promptParts.join('\n'),
        visualization: visualizeChain(steps, conclusion),
        totalEvidence: steps.filter((s) => s.evidence.length > 0).length,
      };
    },

    /**
     * Get current steps without finalizing.
     */
    getSteps(): ReasoningStep[] {
      return [...steps];
    },

    /**
     * Reset the chain for a new question.
     */
    reset(): void {
      steps.length = 0;
      alternatives.length = 0;
      stepCounter = 0;
    },

    /**
     * Get chain statistics.
     */
    getStats(): {
      stepCount: number;
      avgConfidence: number;
      regions: string[];
      alternativesCount: number;
    } {
      return {
        stepCount: steps.length,
        avgConfidence: steps.length > 0
          ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length
          : 0,
        regions: [...new Set(steps.map((s) => s.region))],
        alternativesCount: alternatives.length,
      };
    },

    /**
     * Get configuration.
     */
    getConfig(): ReasoningChainConfig {
      return { maxSteps, minStepConfidence, trackAlternatives, depth, verbose };
    },
  };
}
