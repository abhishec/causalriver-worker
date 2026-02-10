/**
 * Nexus Memory Stack - Reasoning Framework
 *
 * Claude-optimized prompting structure for AI reasoning.
 * Provides structured thinking patterns for complex analysis.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reasoning stage in the analysis
 */
export interface ReasoningStage {
  name: string;
  description: string;
  prompts: string[];
}

/**
 * Intent classification for user queries
 */
export interface IntentGuide {
  intent: string;
  keywords: string[];
  suggestedActions: string[];
  dataNeeded: string[];
}

/**
 * Uncertainty level for AI responses
 */
export type UncertaintyLevel = 'high' | 'medium' | 'low' | 'none';

/**
 * Structured response format
 */
export interface StructuredResponse {
  summary: string;
  analysis: string[];
  recommendations: Array<{
    action: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
    owner?: string;
  }>;
  uncertainties: Array<{
    area: string;
    level: UncertaintyLevel;
    mitigation?: string;
  }>;
  dataGaps?: string[];
}

// ============================================================================
// REASONING STAGES
// ============================================================================

/**
 * A causal edge for reasoning context injection.
 */
export interface ReasoningCausalEdge {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  lagDays: number;
  naturalLanguage: string;
  isLikelyConfounded?: boolean;
  knockoutScore?: number;
  coefficientSign?: number;
}

/**
 * Default reasoning stages for structured analysis.
 * Now includes a dedicated Causal Reasoning stage between
 * Pattern Analysis and Cross-Domain Connection.
 */
export const defaultReasoningStages: ReasoningStage[] = [
  {
    name: 'Understanding',
    description: 'Understand the core question and intent',
    prompts: [
      'What is the user really asking?',
      'What outcome do they want to achieve?',
      'What context is important here?',
    ],
  },
  {
    name: 'Data Assessment',
    description: 'Evaluate available data quality and completeness',
    prompts: [
      'What data do we have access to?',
      'How confident are we in this data?',
      'What data gaps exist?',
    ],
  },
  {
    name: 'Pattern Analysis',
    description: 'Identify patterns, trends, and anomalies',
    prompts: [
      'What patterns emerge from the data?',
      'Are there any anomalies or outliers?',
      'What trends are significant?',
    ],
  },
  {
    name: 'Causal Reasoning',
    description: 'Apply causal intelligence to trace root causes and predict effects',
    prompts: [
      'What causal relationships from the brain graph are relevant here?',
      'Which relationships are KNOCKOUT-VALIDATED (true causes) vs POSSIBLY CONFOUNDED?',
      'Can we trace a causal chain from root cause to observed effect using only validated edges?',
      'What lag times should we expect between cause and effect?',
      'Is this a correlation or a verified causal relationship? (Check knockout score)',
      'What interventions would break or strengthen this causal chain?',
      'Are any relevant edges confounded? If so, what might the hidden confounder be?',
    ],
  },
  {
    name: 'Cross-Domain Connection',
    description: 'Connect insights across domains using causal graph',
    prompts: [
      'How do different domains interact here?',
      'What cascade effects might occur based on causal edges?',
      'Who else should be involved based on downstream effects?',
      'Are there second-order effects that cross domain boundaries?',
    ],
  },
  {
    name: 'Recommendation',
    description: 'Provide actionable recommendations',
    prompts: [
      'What specific actions should be taken?',
      'Who should own each action?',
      'What is the priority order?',
      'What is the expected time-to-effect based on causal lag?',
    ],
  },
];

// ============================================================================
// FRAMEWORK BUILDER
// ============================================================================

/**
 * Build a reasoning framework prompt
 *
 * @example
 * ```typescript
 * const framework = buildReasoningFramework({
 *   stages: defaultReasoningStages,
 *   requireExplicitUncertainty: true,
 * });
 *
 * const systemPrompt = framework.buildPrompt(context);
 * ```
 */
export function buildReasoningFramework(options: {
  stages?: ReasoningStage[];
  requireExplicitUncertainty?: boolean;
  maxRecommendations?: number;
  includeDataGaps?: boolean;
  /** When provided, causal graph data is injected into the reasoning prompt */
  causalEdges?: ReasoningCausalEdge[];
} = {}) {
  const {
    stages = defaultReasoningStages,
    requireExplicitUncertainty = true,
    maxRecommendations = 5,
    includeDataGaps = true,
    causalEdges,
  } = options;

  return {
    /**
     * Build the reasoning framework prompt.
     * When causal edges are provided (via config or parameter),
     * a live causal graph section is injected to ground reasoning
     * in empirically-discovered cause-and-effect relationships.
     */
    buildPrompt: (additionalContext?: string, runtimeCausalEdges?: ReasoningCausalEdge[]): string => {
      const sections: string[] = [];
      const edges = runtimeCausalEdges || causalEdges;

      // Introduction
      sections.push('## Reasoning Framework\n');
      sections.push(
        'Follow this structured approach to analyze and respond:\n'
      );

      // Stages
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        sections.push(`### ${i + 1}. ${stage.name}`);
        sections.push(stage.description);
        sections.push('Consider:');
        for (const prompt of stage.prompts) {
          sections.push(`- ${prompt}`);
        }
        sections.push('');
      }

      // CAUSAL GRAPH INJECTION: Ground reasoning in discovered relationships
      if (edges && edges.length > 0) {
        sections.push('### Live Causal Graph (Discovered by Brain)');
        sections.push('The following causal relationships have been empirically discovered from organizational data:');
        sections.push('');
        const sorted = [...edges].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
        for (const edge of sorted.slice(0, 15)) {
          const direction = edge.effectSize > 0 ? '+' : '-';
          const validation = edge.isLikelyConfounded
            ? ' [POSSIBLY CONFOUNDED]'
            : (edge.knockoutScore !== undefined && edge.knockoutScore > 0.3)
            ? ' [KNOCKOUT-VALIDATED]'
            : '';
          sections.push(
            `- **${edge.sourceDomain} → ${edge.targetDomain}** (${direction}${Math.abs(edge.effectSize).toFixed(2)}, ${edge.lagDays}d lag)${validation}: ${edge.naturalLanguage}`
          );
        }
        sections.push('');
        sections.push('Use these verified relationships to:');
        sections.push('- Ground your causal reasoning in empirical evidence');
        sections.push('- Trace multi-hop causal chains (A → B → C)');
        sections.push('- Estimate time-to-impact using lag days');
        sections.push('- Distinguish correlation from causation');
        sections.push('');
      }

      // Uncertainty handling
      if (requireExplicitUncertainty) {
        sections.push('### Uncertainty Handling');
        sections.push('Always explicitly state:');
        sections.push('- What you are confident about (and why)');
        sections.push('- What you are uncertain about (and why)');
        sections.push('- What data would improve your confidence');
        sections.push('');
      }

      // Recommendation format
      sections.push('### Recommendation Format');
      sections.push(`Provide up to ${maxRecommendations} prioritized recommendations.`);
      sections.push('For each recommendation:');
      sections.push('- State the specific action');
      sections.push('- Explain the rationale');
      sections.push('- Assign priority (high/medium/low)');
      sections.push('- Suggest an owner if possible');
      if (edges && edges.length > 0) {
        sections.push('- Cite the causal relationship that supports this recommendation');
      }
      sections.push('');

      // Data gaps
      if (includeDataGaps) {
        sections.push('### Data Gaps');
        sections.push('If data is missing or incomplete:');
        sections.push('- Note what data would help');
        sections.push('- Explain how it would improve the analysis');
        sections.push('- Suggest how to obtain it');
        sections.push('');
      }

      // Additional context
      if (additionalContext) {
        sections.push('### Additional Context');
        sections.push(additionalContext);
      }

      return sections.join('\n');
    },

    /**
     * Parse a structured response from AI output
     */
    parseResponse: (text: string): Partial<StructuredResponse> => {
      // Basic parsing - can be enhanced with more sophisticated extraction
      const response: Partial<StructuredResponse> = {
        analysis: [],
        recommendations: [],
        uncertainties: [],
      };

      // Extract summary (first paragraph or sentence)
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length > 0) {
        response.summary = lines[0];
      }

      // Look for recommendation patterns
      const recommendationPattern = /(?:recommend|suggest|should|action).*?:/gi;
      const matches = text.match(recommendationPattern);
      if (matches) {
        // Basic extraction - would need more sophisticated parsing for production
        response.recommendations = matches.map((m, i) => ({
          action: m.replace(/:/g, '').trim(),
          rationale: 'See full analysis',
          priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low',
        }));
      }

      return response;
    },

    /**
     * Get the reasoning stages
     */
    getStages: (): ReasoningStage[] => stages,
  };
}

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

/**
 * Default intent guides for common query types
 */
export const defaultIntentGuides: IntentGuide[] = [
  {
    intent: 'status_check',
    keywords: ['how is', 'what is the status', 'update on', 'where are we'],
    suggestedActions: ['Summarize current state', 'Highlight key metrics', 'Note any issues'],
    dataNeeded: ['current metrics', 'recent changes', 'comparison to targets'],
  },
  {
    intent: 'root_cause',
    keywords: ['why', 'what caused', 'reason for', 'explain'],
    suggestedActions: ['Identify root cause', 'Trace causal chain', 'Find contributing factors'],
    dataNeeded: ['historical data', 'event timeline', 'related changes'],
  },
  {
    intent: 'prediction',
    keywords: ['will', 'forecast', 'predict', 'expect', 'what if'],
    suggestedActions: ['Project trends', 'Identify risks', 'Model scenarios'],
    dataNeeded: ['historical patterns', 'current trajectory', 'external factors'],
  },
  {
    intent: 'recommendation',
    keywords: ['should', 'recommend', 'suggest', 'what to do', 'how to'],
    suggestedActions: ['Propose actions', 'Prioritize options', 'Assign owners'],
    dataNeeded: ['current state', 'goals', 'constraints', 'resources'],
  },
  {
    intent: 'comparison',
    keywords: ['compare', 'difference', 'versus', 'better', 'worse'],
    suggestedActions: ['List differences', 'Analyze trade-offs', 'Recommend choice'],
    dataNeeded: ['metrics for both', 'criteria', 'context'],
  },
];

/**
 * Classify user intent from query text
 */
export function classifyIntent(query: string): IntentGuide | null {
  const queryLower = query.toLowerCase();

  for (const guide of defaultIntentGuides) {
    for (const keyword of guide.keywords) {
      if (queryLower.includes(keyword)) {
        return guide;
      }
    }
  }

  return null;
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Format a structured response for display
 */
export function formatStructuredResponse(response: StructuredResponse): string {
  const sections: string[] = [];

  // Summary
  sections.push('## Summary');
  sections.push(response.summary);
  sections.push('');

  // Analysis
  if (response.analysis.length > 0) {
    sections.push('## Analysis');
    for (const point of response.analysis) {
      sections.push(`- ${point}`);
    }
    sections.push('');
  }

  // Recommendations
  if (response.recommendations.length > 0) {
    sections.push('## Recommendations');
    for (const rec of response.recommendations) {
      const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      sections.push(`${priority} **${rec.action}**`);
      sections.push(`   _Rationale:_ ${rec.rationale}`);
      if (rec.owner) {
        sections.push(`   _Owner:_ ${rec.owner}`);
      }
    }
    sections.push('');
  }

  // Uncertainties
  if (response.uncertainties.length > 0) {
    sections.push('## Uncertainties');
    for (const unc of response.uncertainties) {
      const level =
        unc.level === 'high' ? '⚠️' : unc.level === 'medium' ? '⚡' : 'ℹ️';
      sections.push(`${level} **${unc.area}** (${unc.level} uncertainty)`);
      if (unc.mitigation) {
        sections.push(`   _Mitigation:_ ${unc.mitigation}`);
      }
    }
    sections.push('');
  }

  // Data gaps
  if (response.dataGaps && response.dataGaps.length > 0) {
    sections.push('## Data Gaps');
    for (const gap of response.dataGaps) {
      sections.push(`- ${gap}`);
    }
  }

  return sections.join('\n');
}
