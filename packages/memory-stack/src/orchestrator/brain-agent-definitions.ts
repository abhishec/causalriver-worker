/**
 * Brain Agent Definitions — 15 Claude-Powered Agents with Full L1-L30 Memory
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each Brain Agent is a Claude call augmented with the output of ALL 30 brain layers.
 * Unlike the old P1 SE-aaS domains that called Claude with only L1-L5 context,
 * these agents get the full cognitive stack: organizational topology (L18),
 * impact cascades (L19), strategic synthesis (L20), process mining (L23),
 * wisdom (L30), and everything in between.
 *
 * HOW IT WORKS:
 *   1. A P1 request arrives (e.g., code review, incident diagnosis)
 *   2. The Brain Agent Runtime runs a FULL L1-L30 cycle
 *   3. Layer outputs are formatted into Claude's system prompt, weighted by layerWeights
 *   4. Claude reasons with complete organizational intelligence
 *   5. Response is confidence-gated: high → auto-execute, low → human approval
 *   6. Outcomes feed back into the brain's closed-loop learning
 *
 * AGENT ANATOMY:
 *   - id: Maps to a P1 domain
 *   - systemPromptTemplate: Claude prompt with {{BRAIN_CONTEXT}} and {{INPUT}} placeholders
 *   - layerWeights: Which of the 30 layers are most relevant (0-1 per layer)
 *                   Controls prompt detail, NOT execution — all 30 layers always run
 *   - outputSchema: Expected JSON structure from Claude's response
 *   - confidenceThreshold: Below this → human approval required
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Definition of a Brain Agent — a Claude call backed by the full 30-layer brain */
export interface BrainAgentDefinition {
  /** Unique agent ID (kebab-case, maps to P1 domain) */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent does */
  description: string;
  /** Claude system prompt. {{BRAIN_CONTEXT}} replaced with L1-L30 output, {{INPUT}} replaced with request */
  systemPromptTemplate: string;
  /** Per-layer importance weights (0-1). Controls prompt detail, not execution. */
  layerWeights: Partial<Record<number, number>>;
  /** Expected JSON output fields from Claude */
  outputSchema: Record<string, string>;
  /** Above this confidence → auto-execute. Below → human approval. */
  confidenceThreshold: number;
  /** Claude model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Max tokens for Claude response */
  maxTokens?: number;
  /** Temperature for Claude (lower = more deterministic) */
  temperature?: number;
}

/** Minimal interface for the runtime to register agents into */
export interface BrainAgentRuntimeRegistrar {
  registerAgent(definition: BrainAgentDefinition): void;
}

// ============================================================================
// LAYER WEIGHT PRESETS (reusable building blocks)
// ============================================================================

/** L1-L2: Brainstem — always relevant */
const BRAINSTEM: Partial<Record<number, number>> = { 1: 0.3, 2: 0.5 };

/** L3-L7: Brain core — reasoning, memory, exploration */
const BRAIN_CORE: Partial<Record<number, number>> = {
  3: 0.4, 4: 0.3, 5: 0.6, 6: 0.4, 7: 0.3,
};

/** L8-L12: Mind — imagination, theory of mind, temporal, red team, experimentation */
const MIND: Partial<Record<number, number>> = {
  8: 0.7, 9: 0.3, 10: 0.4, 11: 0.7, 12: 0.3,
};

/** L13-L15: Immune, planning, narrative */
const EXECUTIVE: Partial<Record<number, number>> = {
  13: 0.2, 14: 0.5, 15: 0.5,
};

/** L16-L18: Soma — org structure */
const SOMA: Partial<Record<number, number>> = {
  16: 0.5, 17: 0.6, 18: 0.4,
};

/** L19-L21: Cortex — strategy */
const CORTEX: Partial<Record<number, number>> = {
  19: 0.7, 20: 0.5, 21: 0.4,
};

/** L22-L24: Cerebellum — operations */
const CEREBELLUM: Partial<Record<number, number>> = {
  22: 0.3, 23: 0.5, 24: 0.2,
};

/** L25-L30: Prefrontal + Corpus Callosum — wisdom */
const WISDOM: Partial<Record<number, number>> = {
  25: 0.1, 26: 0.3, 27: 0.3, 28: 0.2, 29: 0.6, 30: 0.5,
};

/** Merge multiple weight presets, with per-key overrides */
function mergeWeights(
  ...presets: Array<Partial<Record<number, number>>>
): Partial<Record<number, number>> {
  const result: Partial<Record<number, number>> = {};
  for (const preset of presets) {
    for (const [key, val] of Object.entries(preset)) {
      const k = Number(key);
      // Last write wins — overrides take precedence
      result[k] = val;
    }
  }
  return result;
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

// ── 1. CODE REVIEWER ─────────────────────────────────────────────────────────

export const BRAIN_AGENT_CODE_REVIEWER: BrainAgentDefinition = {
  id: 'code-reviewer',
  name: 'Brain Code Reviewer',
  description: 'Reviews code changes with full organizational context from L1-L30. Uses causal graph to predict downstream impact, red team to stress-test the change, and process mining to check workflow compliance.',
  systemPromptTemplate: `You are a Brain-Augmented Code Reviewer operating within NexusBrain's 30-layer cognitive stack. You are NOT a stateless LLM — you have access to this organization's complete learned intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Review the following code changes. Use the Brain's organizational intelligence to provide context-aware analysis that a stateless reviewer cannot.

## Code Changes
{{INPUT}}

## Required Output (JSON)
Return a JSON object with these fields:
- criticalIssues: Array of { severity: "critical"|"high"|"medium"|"low", description: string, location: string, suggestion: string }
- patternViolations: Array of { pattern: string, violation: string, orgEvidence: string }
- causalRiskAssessment: { riskLevel: "low"|"medium"|"high"|"critical", cascadeEffects: string[], affectedSystems: string[] }
- recommendations: Array of { action: string, confidence: number, effort: "trivial"|"small"|"medium"|"large", impact: string }
- triageDecision: "auto-approve" | "quick-review" | "detailed-review" | "block"
- overallConfidence: number (0-1)
- reasoning: string (explain your reasoning using Brain context)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    3: 0.4,  // L3: Dream — connecting unrelated code patterns
    5: 0.6,  // L5: Curiosity — what might break?
    8: 0.7,  // L8: Counterfactuals — what if this change causes X?
    11: 0.9, // L11: Red team — adversarial analysis of the change
    16: 0.5, // L16: Domain hierarchy — which domain is this code in?
    17: 0.6, // L17: Entity links — what connects to this code?
    18: 0.4, // L18: Org topology — who owns this code?
    19: 0.8, // L19: Impact cascade — what breaks downstream?
    20: 0.4, // L20: Strategic synthesis — alignment with org strategy
    23: 0.5, // L23: Process mining — does this follow team workflow?
    29: 0.7, // L29: Intervention — what should be changed?
    30: 0.3, // L30: Wisdom — org principles about code quality
  }),
  outputSchema: {
    criticalIssues: 'Array<{ severity, description, location, suggestion }>',
    patternViolations: 'Array<{ pattern, violation, orgEvidence }>',
    causalRiskAssessment: '{ riskLevel, cascadeEffects, affectedSystems }',
    recommendations: 'Array<{ action, confidence, effort, impact }>',
    triageDecision: 'string',
    overallConfidence: 'number',
    reasoning: 'string',
  },
  confidenceThreshold: 0.85,
  maxTokens: 4096,
  temperature: 0.3,
};

// ── 2. INCIDENT DIAGNOSER ────────────────────────────────────────────────────

export const BRAIN_AGENT_INCIDENT_DIAGNOSER: BrainAgentDefinition = {
  id: 'incident-diagnoser',
  name: 'Brain Incident Diagnoser',
  description: 'Diagnoses production incidents using the brain\'s causal graph, entity links, and impact cascade modeling. Traces root causes across systems.',
  systemPromptTemplate: `You are a Brain-Augmented Incident Diagnoser operating within NexusBrain's 30-layer cognitive stack. You have access to the organization's causal graph, cross-system entity links, and historical incident patterns.

{{BRAIN_CONTEXT}}

## Your Task
Diagnose the following incident. Use the Brain's causal relationships to trace root causes, entity links to find correlated systems, and impact cascade data to assess blast radius.

## Incident Details
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- rootCauses: Array of { cause: string, confidence: number, evidence: string, causalChain: string[] }
- diagnosis: string (comprehensive diagnosis using Brain context)
- severity: "SEV1"|"SEV2"|"SEV3"|"SEV4"
- blastRadius: { affectedSystems: string[], affectedTeams: string[], customerImpact: string }
- remediationSteps: Array of { step: string, priority: number, owner: string, estimatedMinutes: number }
- preventionRecommendations: Array of { action: string, reducesRisk: number }
- similarPatterns: string[] (past patterns from Brain memory that match)
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    2: 0.9,  // L2: Causal reasoner — critical for root cause
    3: 0.5,  // L3: Dream — surprising cross-domain correlations
    5: 0.5,  // L5: Curiosity — explore hypotheses
    8: 0.7,  // L8: Counterfactuals — what if we hadn't deployed X?
    10: 0.5, // L10: Temporal — timing patterns
    11: 0.6, // L11: Red team — stress test the diagnosis
    15: 0.4, // L15: Narrative — exec summary
    16: 0.5, // L16: Domain hierarchy — which domain is affected?
    17: 0.9, // L17: Entity links — PR → Jira → Slack → deployment
    18: 0.5, // L18: Org topology — who needs to be paged?
    19: 0.9, // L19: Impact cascade — blast radius
    20: 0.4, // L20: Strategic synthesis — business impact
    23: 0.5, // L23: Process mining — was the deployment process followed?
    29: 0.8, // L29: Intervention — what to do now
    30: 0.4, // L30: Wisdom — past incident learnings
  }),
  outputSchema: {
    rootCauses: 'Array<{ cause, confidence, evidence, causalChain }>',
    diagnosis: 'string',
    severity: 'string',
    blastRadius: '{ affectedSystems, affectedTeams, customerImpact }',
    remediationSteps: 'Array<{ step, priority, owner, estimatedMinutes }>',
    preventionRecommendations: 'Array<{ action, reducesRisk }>',
    similarPatterns: 'string[]',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.70,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 3. FEATURE BUILDER ───────────────────────────────────────────────────────

export const BRAIN_AGENT_FEATURE_BUILDER: BrainAgentDefinition = {
  id: 'feature-builder',
  name: 'Brain Feature Builder',
  description: 'Builds features from specifications with awareness of org architecture, team capacity, and strategic alignment.',
  systemPromptTemplate: `You are a Brain-Augmented Feature Builder operating within NexusBrain's 30-layer cognitive stack. You understand the organization's architecture, team capacity, coding patterns, and strategic direction.

{{BRAIN_CONTEXT}}

## Your Task
Implement the following feature specification. Use the Brain's knowledge of organizational patterns, team workflows, and strategic alignment.

## Feature Specification
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- implementation: { approach: string, architecture: string, components: Array<{ name, path, purpose }> }
- code: Array of { filePath: string, content: string, explanation: string }
- patternCompliance: Array of { pattern: string, compliant: boolean, note: string }
- strategicAlignment: { aligned: boolean, strategy: string, risk: string }
- testPlan: Array of { test: string, type: "unit"|"integration"|"e2e", priority: number }
- estimatedEffort: { hours: number, complexity: "low"|"medium"|"high", reasoning: string }
- dependencies: string[]
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, BRAIN_CORE, {
    8: 0.6,  // L8: Counterfactuals — what could go wrong?
    14: 0.7, // L14: Planning — implementation plan
    15: 0.5, // L15: Narrative — explain approach
    16: 0.6, // L16: Domain hierarchy — where does this feature live?
    17: 0.5, // L17: Entity links — what existing code connects?
    18: 0.4, // L18: Org topology — who will maintain this?
    19: 0.5, // L19: Impact cascade — downstream effects
    20: 0.6, // L20: Strategic synthesis — strategic alignment
    21: 0.5, // L21: Resource allocation — team capacity
    23: 0.6, // L23: Process mining — team's dev workflow
    30: 0.4, // L30: Wisdom — org coding principles
  }),
  outputSchema: {
    implementation: '{ approach, architecture, components }',
    code: 'Array<{ filePath, content, explanation }>',
    patternCompliance: 'Array<{ pattern, compliant, note }>',
    strategicAlignment: '{ aligned, strategy, risk }',
    testPlan: 'Array<{ test, type, priority }>',
    estimatedEffort: '{ hours, complexity, reasoning }',
    dependencies: 'string[]',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.75,
  maxTokens: 8192,
  temperature: 0.4,
};

// ── 4. TECH DEBT AUDITOR ─────────────────────────────────────────────────────

export const BRAIN_AGENT_TECH_DEBT_AUDITOR: BrainAgentDefinition = {
  id: 'tech-debt-auditor',
  name: 'Brain Tech Debt Auditor',
  description: 'Identifies and prioritizes technical debt using cross-system analysis, process mining, and resource allocation data.',
  systemPromptTemplate: `You are a Brain-Augmented Tech Debt Auditor with the full organizational intelligence of NexusBrain's 30-layer cognitive stack.

{{BRAIN_CONTEXT}}

## Your Task
Audit the following codebase/scope for technical debt. Use the Brain's process mining data, resource allocation insights, and strategic context to prioritize what matters most.

## Audit Scope
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- debtItems: Array of { id: string, category: "architecture"|"code"|"testing"|"infrastructure"|"documentation", description: string, severity: "critical"|"high"|"medium"|"low", businessImpact: string, estimatedHours: number, affectedSystems: string[] }
- prioritizedPlan: Array of { debtId: string, priority: number, reasoning: string, dependencies: string[] }
- riskAssessment: { totalDebtHours: number, criticalDebtRatio: number, velocityImpact: string }
- strategicAlignment: string (how debt reduction aligns with org goals)
- quickWins: Array of { action: string, effort: "hours"|"days", impact: string }>
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    3: 0.5,  // L3: Dream — hidden connections between debt items
    5: 0.5,  // L5: Curiosity — explore unknown debt
    10: 0.5, // L10: Temporal — debt accumulation trends
    16: 0.5, // L16: Domain hierarchy — which domains have most debt?
    17: 0.5, // L17: Entity links — what connects to the debt?
    19: 0.7, // L19: Impact cascade — what breaks if debt isn't paid?
    20: 0.6, // L20: Strategic synthesis — business impact of debt
    21: 0.7, // L21: Resource allocation — can the team handle this?
    23: 0.8, // L23: Process mining — where are the workflow bottlenecks?
    27: 0.6, // L27: Org learning rate — are we repeating debt patterns?
    29: 0.7, // L29: Intervention — what to fix first
    30: 0.5, // L30: Wisdom — learned principles about debt management
  }),
  outputSchema: {
    debtItems: 'Array<{ id, category, description, severity, businessImpact, estimatedHours, affectedSystems }>',
    prioritizedPlan: 'Array<{ debtId, priority, reasoning, dependencies }>',
    riskAssessment: '{ totalDebtHours, criticalDebtRatio, velocityImpact }',
    strategicAlignment: 'string',
    quickWins: 'Array<{ action, effort, impact }>',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.80,
  maxTokens: 4096,
  temperature: 0.3,
};

// ── 5. DEPENDENCY UPGRADER ───────────────────────────────────────────────────

export const BRAIN_AGENT_DEPENDENCY_UPGRADER: BrainAgentDefinition = {
  id: 'dependency-upgrader',
  name: 'Brain Dependency Upgrader',
  description: 'Analyzes dependency upgrade risk using entity links, impact cascade modeling, and red team stress testing.',
  systemPromptTemplate: `You are a Brain-Augmented Dependency Upgrade Analyst operating within NexusBrain's 30-layer cognitive stack.

{{BRAIN_CONTEXT}}

## Your Task
Analyze the following dependency manifest and recommend an upgrade strategy. Use the Brain's entity links to trace dependency usage, impact cascade to model upgrade risk, and red team to stress-test the plan.

## Dependency Information
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- outdated: Array of { name: string, currentVersion: string, latestVersion: string, semverJump: "patch"|"minor"|"major", riskLevel: "low"|"medium"|"high", securityAdvisories: number }
- breakingChanges: Array of { dependency: string, description: string, affectedFiles: string[], migrationEffort: "trivial"|"moderate"|"significant" }
- upgradeOrder: string[] (dependency-aware ordering)
- migrationSteps: Array of { order: number, dependency: string, action: string, testCommand: string }
- riskAssessment: { overallRisk: "low"|"medium"|"high", highestRiskDependency: string, reasoning: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    8: 0.6,  // L8: Counterfactuals — what if upgrade breaks X?
    11: 0.8, // L11: Red team — stress test upgrade plan
    17: 0.8, // L17: Entity links — trace dependency usage
    19: 0.8, // L19: Impact cascade — upgrade ripple effects
    23: 0.4, // L23: Process mining — past upgrade patterns
    26: 0.4, // L26: Decision audit — how did past upgrades go?
    29: 0.6, // L29: Intervention — upgrade strategy
  }),
  outputSchema: {
    outdated: 'Array<{ name, currentVersion, latestVersion, semverJump, riskLevel, securityAdvisories }>',
    breakingChanges: 'Array<{ dependency, description, affectedFiles, migrationEffort }>',
    upgradeOrder: 'string[]',
    migrationSteps: 'Array<{ order, dependency, action, testCommand }>',
    riskAssessment: '{ overallRisk, highestRiskDependency, reasoning }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.80,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 6. PERFORMANCE PROFILER ──────────────────────────────────────────────────

export const BRAIN_AGENT_PERFORMANCE_PROFILER: BrainAgentDefinition = {
  id: 'performance-profiler',
  name: 'Brain Performance Profiler',
  description: 'Profiles application performance bottlenecks using causal analysis, temporal patterns, and process mining.',
  systemPromptTemplate: `You are a Brain-Augmented Performance Profiler with access to NexusBrain's complete organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Profile and analyze the following performance data. Use the Brain's causal graph to trace performance bottlenecks, temporal consciousness for trend analysis, and process mining for workflow efficiency.

## Performance Data
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- bottlenecks: Array of { location: string, type: "cpu"|"memory"|"io"|"network"|"database"|"algorithm", severity: "critical"|"high"|"medium"|"low", impact: string, evidence: string }
- causalChains: Array of { trigger: string, chain: string[], finalImpact: string }
- optimizations: Array of { action: string, expectedImprovement: string, effort: "trivial"|"small"|"medium"|"large", confidence: number }
- trends: { improving: string[], degrading: string[], stable: string[] }
- architecturalConcerns: string[]
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    2: 0.9,  // L2: Causal reasoner — performance cause chains
    3: 0.3,  // L3: Dream — hidden performance connections
    10: 0.7, // L10: Temporal — performance trends over time
    17: 0.5, // L17: Entity links — system dependencies
    19: 0.7, // L19: Impact cascade — performance ripple effects
    21: 0.5, // L21: Resource allocation — capacity vs demand
    23: 0.8, // L23: Process mining — workflow bottlenecks
    29: 0.6, // L29: Intervention — optimization recommendations
  }),
  outputSchema: {
    bottlenecks: 'Array<{ location, type, severity, impact, evidence }>',
    causalChains: 'Array<{ trigger, chain, finalImpact }>',
    optimizations: 'Array<{ action, expectedImprovement, effort, confidence }>',
    trends: '{ improving, degrading, stable }',
    architecturalConcerns: 'string[]',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.75,
  maxTokens: 4096,
  temperature: 0.3,
};

// ── 7. DEAD CODE DETECTOR ────────────────────────────────────────────────────

export const BRAIN_AGENT_DEAD_CODE_DETECTOR: BrainAgentDefinition = {
  id: 'dead-code-detector',
  name: 'Brain Dead Code Detector',
  description: 'Identifies dead, unused, and unreachable code using entity links, domain hierarchy, and process mining.',
  systemPromptTemplate: `You are a Brain-Augmented Dead Code Detector with the full intelligence of NexusBrain's 30-layer cognitive stack.

{{BRAIN_CONTEXT}}

## Your Task
Analyze the following codebase for dead, unused, or unreachable code. Use the Brain's entity links to trace code dependencies, domain hierarchy to understand code ownership, and process mining to verify runtime usage.

## Codebase Information
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- deadCode: Array of { filePath: string, lineRange: string, type: "unused_function"|"unused_import"|"unreachable_branch"|"dead_variable"|"orphaned_file", confidence: number, safeToRemove: boolean, reason: string }
- riskAssessment: Array of { filePath: string, risk: "safe"|"caution"|"dangerous", reason: string }
- cleanupPlan: Array of { phase: number, files: string[], estimatedDeletions: number, riskLevel: string }
- metrics: { totalDeadLines: number, percentageOfCodebase: number, potentialSizeReduction: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    16: 0.7, // L16: Domain hierarchy — code organization
    17: 0.9, // L17: Entity links — code dependency graph
    18: 0.3, // L18: Org topology — who owns this code?
    23: 0.7, // L23: Process mining — is this code used in workflows?
    26: 0.3, // L26: Decision audit — why was this code written?
  }),
  outputSchema: {
    deadCode: 'Array<{ filePath, lineRange, type, confidence, safeToRemove, reason }>',
    riskAssessment: 'Array<{ filePath, risk, reason }>',
    cleanupPlan: 'Array<{ phase, files, estimatedDeletions, riskLevel }>',
    metrics: '{ totalDeadLines, percentageOfCodebase, potentialSizeReduction }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.90,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 8. TDD GENERATOR ─────────────────────────────────────────────────────────

export const BRAIN_AGENT_TDD_GENERATOR: BrainAgentDefinition = {
  id: 'tdd-generator',
  name: 'Brain TDD Generator',
  description: 'Generates test-driven development code from test specifications, using organizational patterns and counterfactual analysis.',
  systemPromptTemplate: `You are a Brain-Augmented TDD Generator with NexusBrain's complete organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Generate production code that satisfies the following test specifications using TDD methodology. Use the Brain's knowledge of organizational coding patterns, architectural decisions, and quality standards.

## Test Specifications
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- implementation: Array of { filePath: string, code: string, testsAddressed: string[] }
- patternAlignment: Array of { pattern: string, how: string }
- additionalTests: Array of { test: string, reason: string }
- edgeCases: Array of { case: string, handled: boolean, approach: string }
- qualityMetrics: { estimatedCoverage: number, complexityScore: number, maintainabilityScore: number }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    5: 0.7,  // L5: Curiosity — edge cases, unexplored scenarios
    8: 0.8,  // L8: Counterfactuals — what if tests miss X?
    11: 0.6, // L11: Red team — adversarial test scenarios
    14: 0.5, // L14: Planning — implementation approach
    16: 0.4, // L16: Domain hierarchy — where does this code belong?
    23: 0.4, // L23: Process mining — team's testing patterns
    30: 0.3, // L30: Wisdom — learned quality principles
  }),
  outputSchema: {
    implementation: 'Array<{ filePath, code, testsAddressed }>',
    patternAlignment: 'Array<{ pattern, how }>',
    additionalTests: 'Array<{ test, reason }>',
    edgeCases: 'Array<{ case, handled, approach }>',
    qualityMetrics: '{ estimatedCoverage, complexityScore, maintainabilityScore }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.80,
  maxTokens: 8192,
  temperature: 0.3,
};

// ── 9. TEST CASE GENERATOR ───────────────────────────────────────────────────

export const BRAIN_AGENT_TEST_CASE_GENERATOR: BrainAgentDefinition = {
  id: 'test-case-generator',
  name: 'Brain Test Case Generator',
  description: 'Generates comprehensive test cases using counterfactual analysis, red team stress testing, and impact cascade modeling.',
  systemPromptTemplate: `You are a Brain-Augmented Test Case Generator with NexusBrain's full 30-layer cognitive intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Generate comprehensive test cases for the following code/feature. Use the Brain's counterfactual engine to explore edge cases, red team to find adversarial scenarios, and impact cascade to ensure all downstream effects are tested.

## Code/Feature to Test
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- testCases: Array of { id: string, name: string, type: "unit"|"integration"|"e2e"|"performance"|"security", description: string, steps: string[], expectedResult: string, priority: "critical"|"high"|"medium"|"low", brainInsight: string }
- coverageAnalysis: { estimatedCoverage: number, uncoveredAreas: string[], riskAreas: string[] }
- adversarialTests: Array of { scenario: string, attackVector: string, expectedBehavior: string }
- regressionTests: Array of { test: string, protects: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    5: 0.6,  // L5: Curiosity — unexplored test scenarios
    8: 0.9,  // L8: Counterfactuals — what-if test scenarios
    11: 0.9, // L11: Red team — adversarial testing
    17: 0.5, // L17: Entity links — what connects to this code?
    19: 0.7, // L19: Impact cascade — downstream test coverage
    23: 0.4, // L23: Process mining — common failure patterns
  }),
  outputSchema: {
    testCases: 'Array<{ id, name, type, description, steps, expectedResult, priority, brainInsight }>',
    coverageAnalysis: '{ estimatedCoverage, uncoveredAreas, riskAreas }',
    adversarialTests: 'Array<{ scenario, attackVector, expectedBehavior }>',
    regressionTests: 'Array<{ test, protects }>',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.85,
  maxTokens: 4096,
  temperature: 0.3,
};

// ── 10. LOG ANALYZER ─────────────────────────────────────────────────────────

export const BRAIN_AGENT_LOG_ANALYZER: BrainAgentDefinition = {
  id: 'log-analyzer',
  name: 'Brain Log Analyzer',
  description: 'Analyzes log patterns using causal analysis, temporal consciousness, and cross-system entity correlation.',
  systemPromptTemplate: `You are a Brain-Augmented Log Analyzer with NexusBrain's complete organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Analyze the following log data. Use the Brain's causal graph to trace error cascades, temporal consciousness for timing patterns, and entity links for cross-system correlation.

## Log Data
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- patterns: Array of { pattern: string, frequency: number, severity: "info"|"warning"|"error"|"critical", trend: "increasing"|"decreasing"|"stable" }
- anomalies: Array of { description: string, timestamp: string, affectedSystems: string[], confidence: number }
- rootCauseChains: Array of { trigger: string, chain: string[], finalEffect: string }
- correlations: Array of { systemA: string, systemB: string, correlation: string, evidence: string }
- recommendations: Array of { action: string, priority: number, expectedReduction: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    2: 0.8,  // L2: Causal reasoner — error cause chains
    3: 0.5,  // L3: Dream — unexpected log correlations
    10: 0.8, // L10: Temporal — timing patterns in logs
    17: 0.7, // L17: Entity links — cross-system log correlation
    19: 0.6, // L19: Impact cascade — error propagation
    23: 0.5, // L23: Process mining — normal vs abnormal workflows
    29: 0.5, // L29: Intervention — remediation recommendations
  }),
  outputSchema: {
    patterns: 'Array<{ pattern, frequency, severity, trend }>',
    anomalies: 'Array<{ description, timestamp, affectedSystems, confidence }>',
    rootCauseChains: 'Array<{ trigger, chain, finalEffect }>',
    correlations: 'Array<{ systemA, systemB, correlation, evidence }>',
    recommendations: 'Array<{ action, priority, expectedReduction }>',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.75,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 11. IMPACT ANALYZER ──────────────────────────────────────────────────────

export const BRAIN_AGENT_IMPACT_ANALYZER: BrainAgentDefinition = {
  id: 'impact-analyzer',
  name: 'Brain Impact Analyzer',
  description: 'Predicts the full impact of changes using entity links, impact cascade modeling, strategic synthesis, and intervention analysis.',
  systemPromptTemplate: `You are a Brain-Augmented Impact Analyzer with NexusBrain's full 30-layer organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Analyze the full impact of the following proposed change. Use the Brain's entity links to trace dependencies, impact cascade to model ripple effects, and strategic synthesis for business alignment.

## Proposed Change
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- directImpact: Array of { system: string, impactType: "functional"|"performance"|"security"|"ux", severity: "none"|"low"|"medium"|"high"|"critical", description: string }
- cascadeEffects: Array of { fromSystem: string, toSystem: string, effect: string, probability: number, timeToManifest: string }
- teamImpact: Array of { team: string, workloadChange: "none"|"minor"|"moderate"|"major", skills: string[], blockedBy: string[] }
- businessImpact: { revenue: string, customers: string, compliance: string, strategy: string }
- mitigations: Array of { risk: string, mitigation: string, effort: string, confidence: number }
- goNoGoRecommendation: { decision: "go"|"go-with-conditions"|"no-go", conditions: string[], reasoning: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    8: 0.7,  // L8: Counterfactuals — what-if scenarios
    17: 0.9, // L17: Entity links — dependency tracing
    18: 0.6, // L18: Org topology — team impact
    19: 0.9, // L19: Impact cascade — the core capability
    20: 0.8, // L20: Strategic synthesis — business alignment
    21: 0.6, // L21: Resource allocation — team capacity
    29: 0.7, // L29: Intervention — mitigation strategies
    30: 0.4, // L30: Wisdom — past change learnings
  }),
  outputSchema: {
    directImpact: 'Array<{ system, impactType, severity, description }>',
    cascadeEffects: 'Array<{ fromSystem, toSystem, effect, probability, timeToManifest }>',
    teamImpact: 'Array<{ team, workloadChange, skills, blockedBy }>',
    businessImpact: '{ revenue, customers, compliance, strategy }',
    mitigations: 'Array<{ risk, mitigation, effort, confidence }>',
    goNoGoRecommendation: '{ decision, conditions, reasoning }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.70,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 12. SQL OPTIMIZER ────────────────────────────────────────────────────────

export const BRAIN_AGENT_SQL_OPTIMIZER: BrainAgentDefinition = {
  id: 'sql-optimizer',
  name: 'Brain SQL Optimizer',
  description: 'Optimizes SQL queries using causal analysis of performance bottlenecks, process mining of query patterns, and resource allocation awareness.',
  systemPromptTemplate: `You are a Brain-Augmented SQL Optimizer with NexusBrain's organizational intelligence about data access patterns and performance bottlenecks.

{{BRAIN_CONTEXT}}

## Your Task
Optimize the following SQL queries. Use the Brain's knowledge of data access patterns, performance bottlenecks, and table relationships.

## SQL Queries & Context
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- optimizedQueries: Array of { original: string, optimized: string, improvement: string, explanation: string }
- indexRecommendations: Array of { table: string, columns: string[], type: "btree"|"hash"|"gin"|"gist", expectedImprovement: string }
- antiPatterns: Array of { pattern: string, location: string, fix: string, severity: "minor"|"moderate"|"severe" }
- schemaRecommendations: Array of { table: string, recommendation: string, effort: string }
- estimatedPerformanceGain: { queryTimeReduction: string, throughputIncrease: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    2: 0.7,  // L2: Causal reasoner — performance cause chains
    17: 0.5, // L17: Entity links — table relationships
    21: 0.5, // L21: Resource allocation — database capacity
    23: 0.8, // L23: Process mining — query access patterns
    29: 0.5, // L29: Intervention — optimization recommendations
  }),
  outputSchema: {
    optimizedQueries: 'Array<{ original, optimized, improvement, explanation }>',
    indexRecommendations: 'Array<{ table, columns, type, expectedImprovement }>',
    antiPatterns: 'Array<{ pattern, location, fix, severity }>',
    schemaRecommendations: 'Array<{ table, recommendation, effort }>',
    estimatedPerformanceGain: '{ queryTimeReduction, throughputIncrease }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.85,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 13. DATA LINEAGE TRACER ──────────────────────────────────────────────────

export const BRAIN_AGENT_DATA_LINEAGE_TRACER: BrainAgentDefinition = {
  id: 'data-lineage-tracer',
  name: 'Brain Data Lineage Tracer',
  description: 'Traces data lineage across systems using entity links, domain hierarchy, and process mining.',
  systemPromptTemplate: `You are a Brain-Augmented Data Lineage Tracer with NexusBrain's cross-system entity intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Trace the lineage of the following data elements. Use the Brain's entity links to map data flow across systems, domain hierarchy for data ownership, and process mining for transformation patterns.

## Data Elements
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- lineage: Array of { dataElement: string, origin: { system: string, table: string, field: string }, transformations: Array<{ step: number, system: string, operation: string }>, destinations: Array<{ system: string, table: string, field: string }> }
- dataFlow: Array of { from: string, to: string, transformationType: string, frequency: string, latency: string }
- qualityCheckpoints: Array of { location: string, check: string, passingRate: number }
- ownership: Array of { dataElement: string, owner: string, steward: string, domain: string }
- risks: Array of { risk: string, severity: string, affectedData: string[], mitigation: string }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    16: 0.8, // L16: Domain hierarchy — data domain ownership
    17: 0.9, // L17: Entity links — cross-system data tracing
    18: 0.4, // L18: Org topology — data team structure
    23: 0.7, // L23: Process mining — data transformation patterns
    26: 0.3, // L26: Decision audit — data governance decisions
  }),
  outputSchema: {
    lineage: 'Array<{ dataElement, origin, transformations, destinations }>',
    dataFlow: 'Array<{ from, to, transformationType, frequency, latency }>',
    qualityCheckpoints: 'Array<{ location, check, passingRate }>',
    ownership: 'Array<{ dataElement, owner, steward, domain }>',
    risks: 'Array<{ risk, severity, affectedData, mitigation }>',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.80,
  maxTokens: 4096,
  temperature: 0.2,
};

// ── 14. HLD/LLD GENERATOR ────────────────────────────────────────────────────

export const BRAIN_AGENT_HLD_LLD_GENERATOR: BrainAgentDefinition = {
  id: 'hld-lld-generator',
  name: 'Brain HLD/LLD Generator',
  description: 'Generates high-level and low-level design documents with organizational context, strategic alignment, and wisdom-layer principles.',
  systemPromptTemplate: `You are a Brain-Augmented System Design Document Generator with NexusBrain's complete organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Generate a comprehensive design document (HLD/LLD) for the following system/feature. Use the Brain's strategic synthesis for alignment, domain hierarchy for placement, wisdom layer for proven patterns, and narrative intelligence for clear communication.

## Design Requirements
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- hld: { overview: string, architecture: string, components: Array<{ name, responsibility, interfaces }>, dataFlow: string, nonFunctionalRequirements: string[], constraints: string[], assumptions: string[] }
- lld: { detailedDesign: Array<{ component, classes, methods, dataModels }>, apiContracts: Array<{ endpoint, method, request, response }>, databaseDesign: Array<{ table, columns, indexes, relationships }>, sequenceDiagrams: string[] }
- strategicAlignment: { aligned: boolean, strategyFit: string, tradeoffs: string[] }
- riskAnalysis: Array of { risk: string, probability: string, impact: string, mitigation: string }
- implementationPlan: Array of { phase: number, scope: string, estimatedDays: number, dependencies: string[] }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, BRAIN_CORE, {
    14: 0.7, // L14: Planning — implementation approach
    15: 0.8, // L15: Narrative — clear documentation
    16: 0.7, // L16: Domain hierarchy — where does this fit?
    17: 0.5, // L17: Entity links — existing system connections
    18: 0.5, // L18: Org topology — team ownership
    19: 0.6, // L19: Impact cascade — design ripple effects
    20: 0.7, // L20: Strategic synthesis — business alignment
    21: 0.5, // L21: Resource allocation — implementation capacity
    30: 0.7, // L30: Wisdom — proven design principles
  }),
  outputSchema: {
    hld: '{ overview, architecture, components, dataFlow, nonFunctionalRequirements, constraints, assumptions }',
    lld: '{ detailedDesign, apiContracts, databaseDesign, sequenceDiagrams }',
    strategicAlignment: '{ aligned, strategyFit, tradeoffs }',
    riskAnalysis: 'Array<{ risk, probability, impact, mitigation }>',
    implementationPlan: 'Array<{ phase, scope, estimatedDays, dependencies }>',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.75,
  maxTokens: 8192,
  temperature: 0.4,
};

// ── 15. CODEBASE MAPPER ──────────────────────────────────────────────────────

export const BRAIN_AGENT_CODEBASE_MAPPER: BrainAgentDefinition = {
  id: 'codebase-mapper',
  name: 'Brain Codebase Mapper',
  description: 'Maps codebase architecture using domain hierarchy, entity links, org topology, and process mining.',
  systemPromptTemplate: `You are a Brain-Augmented Codebase Architecture Mapper with NexusBrain's complete organizational intelligence.

{{BRAIN_CONTEXT}}

## Your Task
Map the architecture of the following codebase. Use the Brain's domain hierarchy for classification, entity links for dependency tracing, org topology for ownership mapping, and process mining for runtime behavior analysis.

## Codebase Information
{{INPUT}}

## Required Output (JSON)
Return a JSON object with:
- architecture: { type: "monolith"|"microservices"|"modular-monolith"|"serverless"|"hybrid", description: string, layers: Array<{ name, purpose, components }> }
- modules: Array of { name: string, path: string, domain: string, responsibilities: string[], dependencies: string[], dependents: string[], healthScore: number }
- dependencyGraph: Array of { from: string, to: string, type: "import"|"api"|"event"|"data", strength: "tight"|"loose"|"optional" }
- ownership: Array of { module: string, team: string, primaryContact: string, busFactor: number }
- hotspots: Array of { location: string, issue: "high-coupling"|"circular-dependency"|"god-module"|"orphan"|"bottleneck", severity: string, recommendation: string }
- metrics: { totalModules: number, avgCoupling: number, avgCohesion: number, testCoverage: number }
- overallConfidence: number (0-1)`,
  layerWeights: mergeWeights(BRAINSTEM, {
    16: 0.9, // L16: Domain hierarchy — code domain classification
    17: 0.9, // L17: Entity links — dependency tracing
    18: 0.7, // L18: Org topology — team ownership mapping
    19: 0.5, // L19: Impact cascade — architectural risk
    20: 0.4, // L20: Strategic synthesis — architectural fitness
    23: 0.6, // L23: Process mining — runtime behavior
    30: 0.4, // L30: Wisdom — architectural principles
  }),
  outputSchema: {
    architecture: '{ type, description, layers }',
    modules: 'Array<{ name, path, domain, responsibilities, dependencies, dependents, healthScore }>',
    dependencyGraph: 'Array<{ from, to, type, strength }>',
    ownership: 'Array<{ module, team, primaryContact, busFactor }>',
    hotspots: 'Array<{ location, issue, severity, recommendation }>',
    metrics: '{ totalModules, avgCoupling, avgCohesion, testCoverage }',
    overallConfidence: 'number',
  },
  confidenceThreshold: 0.85,
  maxTokens: 4096,
  temperature: 0.3,
};

// ============================================================================
// ALL DEFINITIONS & REGISTRATION
// ============================================================================

/** All 15 Brain Agent definitions */
export const ALL_BRAIN_AGENT_DEFINITIONS: BrainAgentDefinition[] = [
  BRAIN_AGENT_CODE_REVIEWER,
  BRAIN_AGENT_INCIDENT_DIAGNOSER,
  BRAIN_AGENT_FEATURE_BUILDER,
  BRAIN_AGENT_TECH_DEBT_AUDITOR,
  BRAIN_AGENT_DEPENDENCY_UPGRADER,
  BRAIN_AGENT_PERFORMANCE_PROFILER,
  BRAIN_AGENT_DEAD_CODE_DETECTOR,
  BRAIN_AGENT_TDD_GENERATOR,
  BRAIN_AGENT_TEST_CASE_GENERATOR,
  BRAIN_AGENT_LOG_ANALYZER,
  BRAIN_AGENT_IMPACT_ANALYZER,
  BRAIN_AGENT_SQL_OPTIMIZER,
  BRAIN_AGENT_DATA_LINEAGE_TRACER,
  BRAIN_AGENT_HLD_LLD_GENERATOR,
  BRAIN_AGENT_CODEBASE_MAPPER,
];

/** Register all 15 Brain Agents with a runtime */
export function registerAllBrainAgents(runtime: BrainAgentRuntimeRegistrar): void {
  for (const definition of ALL_BRAIN_AGENT_DEFINITIONS) {
    runtime.registerAgent(definition);
  }
}

/** Layer name lookup for attribution */
export const BRAIN_LAYER_NAMES: Record<number, string> = {
  1: 'Episodic Memory',
  2: 'LLM Reasoner',
  3: 'Deep Dreaming',
  4: 'Hierarchical Memory',
  5: 'Curiosity Engine',
  6: 'Self-Modifying Cognition',
  7: 'Intelligence Mesh',
  8: 'Causal Imagination',
  9: 'Theory of Mind',
  10: 'Temporal Consciousness',
  11: 'Red Team',
  12: 'Experimentation',
  13: 'Immune System',
  14: 'Goal-Backward Planning',
  15: 'Narrative Intelligence',
  16: 'Domain Hierarchy Learning',
  17: 'Cross-System Entity Linker',
  18: 'Organizational Topology',
  19: 'Impact Cascade Modeler',
  20: 'Strategic Synthesis',
  21: 'Resource Allocation Optimizer',
  22: 'Knowledge Transfer Detector',
  23: 'Process Mining',
  24: 'Predictive Staffing',
  25: 'Competitive Intelligence',
  26: 'Decision Audit Trail',
  27: 'Organizational Learning Rate',
  28: 'Cross-Org Pattern Transfer',
  29: 'Intervention Recommender',
  30: 'Wisdom Layer',
};
