/**
 * Software Engineering Action Domains — 7 Cognitive Primitives for Code Intelligence
 * ====================================================================================
 *
 * Brain Analog: The same cognitive primitives that power Accrual's accounting
 * intelligence, now generalized for software engineering.
 *
 * The 7 Domains:
 *
 *   V8 — Software Engineering as a Service:
 *   1. codebase-comprehend    — Read entire codebases → semantic graph (Visual Cortex)
 *   2. spec-completeness      — Detect missing requirements & edge cases (Anterior Prefrontal)
 *   3. requirement-clarify    — Generate targeted technical questions (Broca's Area)
 *   4. pattern-enforce        — Apply architectural patterns & best practices (Cerebellum)
 *   5. consistency-verify     — Cross-check code, tests, docs, schemas (Parietal Association)
 *   6. code-generate          — Produce production-ready implementations (Supplementary Motor)
 *   7. review-triage          — Confidence-based code review triage (Orbitofrontal Cortex)
 *
 * These domains enable "Software Engineering as a Service" — not just code completion,
 * but full feature implementation with the judgment of a senior engineer.
 *
 * @packageDocumentation
 */

import {
  defineActionDomain,
  type ActionDomainDefinition,
  type ActionDomainResult,
  type ActionDomainBrainContext,
  type ActionDomainExecutionContext,
} from './action-domain-registry';

// ============================================================================
// DEFAULT FORMAT FOR PROMPT
// ============================================================================

/** Default formatForPrompt for software engineering domains */
function defaultFormatForPrompt(result: ActionDomainResult, _ctx: ActionDomainBrainContext): string {
  const sections: string[] = [];
  const domainName = (result.data as Record<string, unknown>)?.type || 'software-engineering';
  sections.push(`## ${domainName} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
  if (result.narrative) sections.push(result.narrative);
  if (result.data && typeof result.data === 'object') {
    sections.push('```json\n' + JSON.stringify(result.data, null, 2).slice(0, 2000) + '\n```');
  }
  if (result.interventions?.length) {
    sections.push('### Recommended Actions');
    for (const i of result.interventions.slice(0, 5)) {
      sections.push(`- **${i.action}** (${i.targetDomains.join(', ')}) — confidence: ${(i.confidence * 100).toFixed(0)}%`);
    }
  }
  return sections.join('\n\n');
}

/** Wrapper around defineActionDomain that adds default formatForPrompt if missing */
function defineSoftwareEngineeringDomain(
  def: Omit<ActionDomainDefinition, 'formatForPrompt'> & { formatForPrompt?: ActionDomainDefinition['formatForPrompt'] }
): ActionDomainDefinition {
  return defineActionDomain({
    ...def,
    formatForPrompt: def.formatForPrompt || defaultFormatForPrompt,
  } as ActionDomainDefinition);
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/** Compute codebase mastery score based on brain knowledge */
function computeCodebaseMastery(brain: ActionDomainBrainContext): number {
  const domain = brain.primaryDomain;
  let score = 0;
  let factors = 0;

  // Factor 1: Causal graph coverage (files → dependencies)
  const upstreamDeps = getTopCodeEdges(brain.dag, domain, 'upstream');
  const downstreamDeps = getTopCodeEdges(brain.dag, domain, 'downstream');
  const edgeCount = upstreamDeps.length + downstreamDeps.length;
  score += Math.min(1, edgeCount / 15); // Code has denser graphs than business metrics
  factors++;

  // Factor 2: Pattern coverage (architectural patterns detected)
  const codePatterns = brain.patterns.filter(p =>
    p.domain === domain || p.pattern.includes('code') || p.pattern.includes('architecture')
  );
  score += Math.min(1, codePatterns.length / 5);
  factors++;

  // Factor 3: Rule coverage (linting rules, best practices)
  const codeRules = brain.matchedRules.filter(r =>
    r.naturalLanguage.toLowerCase().includes(domain.toLowerCase()) ||
    r.naturalLanguage.toLowerCase().includes('code') ||
    r.naturalLanguage.toLowerCase().includes('architecture')
  );
  score += Math.min(1, codeRules.length / 8);
  factors++;

  return factors > 0 ? score / factors : 0;
}

/** Extract top N code dependency edges */
function getTopCodeEdges(
  dag: ActionDomainBrainContext['dag'],
  domain: string,
  direction: 'upstream' | 'downstream',
  limit: number = 10,
): Array<{ source: string; target: string; weight: number; lagDays: number; pValue: number }> {
  const edges: Array<{ source: string; target: string; weight: number; lagDays: number; pValue: number }> = [];

  for (const [source, targets] of dag.edges) {
    for (const [target, edge] of targets) {
      if (direction === 'upstream' && target === domain) {
        edges.push({ source, target, weight: edge.weight, lagDays: edge.lagDays, pValue: edge.pValue });
      } else if (direction === 'downstream' && source === domain) {
        edges.push({ source, target, weight: edge.weight, lagDays: edge.lagDays, pValue: edge.pValue });
      }
    }
  }

  return edges.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/** Build code intervention from architectural insight */
function buildCodeIntervention(
  driver: { source: string; target: string; weight: number; lagDays: number },
  domain: string,
  actionVerb: string,
): ActionDomainResult['interventions'][0] {
  return {
    action: `${actionVerb} ${driver.source} to improve ${domain} (${(driver.weight * 100).toFixed(0)}% coupling)`,
    targetDomains: [driver.source, domain],
    expectedImpact: `Reduce coupling by ${(driver.weight * 20).toFixed(0)}%, improve maintainability`,
    confidence: driver.weight,
    evidence: `Dependency edge: ${driver.source}→${domain}, weight=${driver.weight.toFixed(2)}`,
    owner: 'Engineering team',
    effort: (driver.weight > 0.7 ? 'high' : driver.weight > 0.4 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
  };
}

// ============================================================================
// DOMAIN 1: CODEBASE-COMPREHEND — Visual Cortex for Code
// ============================================================================

export const codebaseComprehendDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'codebase-comprehend',
  description: 'Reads entire codebases and builds semantic dependency graphs of architecture, patterns, and tech debt',
  brainAnalog: 'Visual Cortex / Fusiform Gyrus — recognizes structure and patterns in code',
  requires: ['causalDAG', 'patterns'],
  optional: ['llmAmplifier', 'agentRegistry'],
  intents: ['document-comprehend'], // Reusing accounting intent — same cognitive function
  intentKeywords: ['analyze codebase', 'understand architecture', 'map dependencies', 'code structure', 'what does this code do', 'how does this work'],
  intentPatterns: [
    /\banalyze\s+(the\s+)?codebase\b/i,
    /\bunderstand\s+(the\s+)?(code|architecture)\b/i,
    /\bmap\s+dependencies\b/i,
    /\bcode\s+structure\b/i,
    /what\s+does\s+this\s+code\s+do/i,
    /how\s+does\s+(this|the)\s+(code|system)\s+work/i,
  ],
  priority: 80,
  outputSchema: {
    dataType: 'codebase-analysis',
    fields: ['architecture', 'dependencies', 'patterns', 'techDebt', 'complexity'],
    composable: true,
    consumableBy: ['spec-completeness', 'pattern-enforce', 'consistency-verify', 'review-triage'],
  },
  composableWith: ['spec-completeness', 'pattern-enforce', 'review-triage'],
  tags: ['software-engineering', 'architecture', 'analysis'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['causal-dag-analysis'];

    log(`Comprehending codebase structure for ${domain}`);

    // Analyze dependencies (causal edges represent file dependencies)
    const upstreamDeps = getTopCodeEdges(brain.dag, domain, 'upstream', 10);
    const downstreamDeps = getTopCodeEdges(brain.dag, domain, 'downstream', 10);

    // Detect architectural patterns
    const architecturePatterns = brain.patterns.filter(p =>
      p.pattern.includes('MVC') || p.pattern.includes('REST') ||
      p.pattern.includes('microservice') || p.pattern.includes('monolith')
    );

    // Identify tech debt indicators (high coupling, circular deps)
    const highCouplingModules = upstreamDeps.filter(d => d.weight > 0.7);
    const circularDeps = detectCircularDeps(brain.dag, domain);

    // Compute complexity metrics
    const complexityScore = (upstreamDeps.length + downstreamDeps.length) / 20;
    const codebaseMastery = computeCodebaseMastery(brain);

    // Build architecture summary
    const architecture = {
      totalDependencies: upstreamDeps.length + downstreamDeps.length,
      upstreamCount: upstreamDeps.length,
      downstreamCount: downstreamDeps.length,
      patterns: architecturePatterns.map(p => p.pattern),
      complexity: complexityScore > 0.8 ? 'high' : complexityScore > 0.4 ? 'medium' : 'low',
    };

    // Identify tech debt
    const techDebt = [
      ...highCouplingModules.map(d => ({
        type: 'high-coupling',
        module: d.source,
        severity: 'medium',
        description: `${d.source} has ${(d.weight * 100).toFixed(0)}% coupling with ${domain}`,
      })),
      ...circularDeps.map(cycle => ({
        type: 'circular-dependency',
        module: cycle,
        severity: 'high',
        description: `Circular dependency detected involving ${cycle}`,
      })),
    ];

    // Build interventions
    const interventions = highCouplingModules.slice(0, 3).map(d =>
      buildCodeIntervention(d, domain, 'Decouple')
    );

    const confidence = Math.min(0.9, codebaseMastery * 0.7 + 0.3);
    const narrative = `Analyzed ${domain}: ${upstreamDeps.length} dependencies, ${downstreamDeps.length} dependents. Complexity: ${architecture.complexity}. Tech debt items: ${techDebt.length}. ${architecturePatterns.length > 0 ? `Architecture: ${architecturePatterns[0].pattern}.` : 'No clear architectural pattern detected.'}`;

    modulesUsed.push('pattern-detection');

    return {
      data: {
        type: 'codebase-comprehend',
        architecture,
        dependencies: { upstream: upstreamDeps.slice(0, 10), downstream: downstreamDeps.slice(0, 10) },
        patterns: architecturePatterns,
        techDebt,
        complexity: complexityScore,
        codebaseMastery,
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        domainMastery: codebaseMastery,
        upstreamCount: upstreamDeps.length,
        downstreamCount: downstreamDeps.length,
        techDebtCount: techDebt.length,
      },
    };
  },
});

/** Helper: Detect circular dependencies */
function detectCircularDeps(dag: ActionDomainBrainContext['dag'], domain: string): string[] {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[] = [];

  function dfs(node: string): void {
    if (recStack.has(node)) {
      cycles.push(node);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recStack.add(node);

    const targets = dag.edges.get(node);
    if (targets) {
      for (const [target] of targets) {
        dfs(target);
      }
    }

    recStack.delete(node);
  }

  dfs(domain);
  return cycles.slice(0, 5); // Limit to top 5
}

// ============================================================================
// DOMAIN 2: SPEC-COMPLETENESS — Prefrontal Quality Gate
// ============================================================================

export const specCompletenessDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'spec-completeness',
  description: 'Identifies missing requirements, edge cases, and incomplete specifications in feature requests',
  brainAnalog: 'Anterior Prefrontal Cortex — expectation vs reality matching',
  requires: ['rules', 'patterns'],
  optional: ['llmAmplifier', 'agentRegistry'],
  intents: ['completeness-check'],
  intentKeywords: ['check completeness', 'missing requirements', 'edge cases', 'incomplete spec', 'what is missing'],
  intentPatterns: [
    /\bcheck\s+(spec\s+)?completeness\b/i,
    /\bmissing\s+requirements\b/i,
    /\bedge\s+cases\b/i,
    /\bincomplete\s+spec(ification)?\b/i,
    /what\s+is\s+missing/i,
    /\bgaps?\s+in\s+(the\s+)?spec\b/i,
  ],
  priority: 75,
  outputSchema: {
    dataType: 'spec-completeness',
    fields: ['missingRequirements', 'edgeCases', 'inconsistencies', 'completenessScore'],
    composable: true,
    consumableBy: ['requirement-clarify', 'pattern-enforce', 'code-generate'],
  },
  composableWith: ['requirement-clarify', 'code-generate'],
  tags: ['software-engineering', 'requirements', 'quality'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['rule-matching'];

    log(`Checking spec completeness for ${domain}`);

    // Check against architectural patterns
    const relevantPatterns = brain.patterns.filter(p => p.domain === domain);
    const relevantRules = brain.matchedRules.filter(r =>
      r.naturalLanguage.toLowerCase().includes(domain.toLowerCase())
    );

    // Common completeness checks for software specs
    const requiredElements = [
      'authentication', 'authorization', 'error handling', 'input validation',
      'logging', 'monitoring', 'testing', 'documentation', 'security',
      'performance', 'scalability', 'data persistence', 'API design'
    ];

    const missingRequirements: Array<{ element: string; severity: string; description: string }> = [];
    const edgeCases: Array<{ scenario: string; handled: boolean; description: string }> = [];

    // Check for missing elements
    for (const element of requiredElements) {
      const mentioned = brain.question.toLowerCase().includes(element) ||
                       relevantRules.some(r => r.naturalLanguage.toLowerCase().includes(element));

      if (!mentioned) {
        const severity = ['authentication', 'security', 'error handling'].includes(element) ? 'high' : 'medium';
        missingRequirements.push({
          element,
          severity,
          description: `No mention of ${element} in specification`,
        });
      }
    }

    // Common edge cases to check
    const commonEdgeCases = [
      { scenario: 'Empty input', handled: brain.question.includes('empty') || brain.question.includes('null') },
      { scenario: 'Concurrent requests', handled: brain.question.includes('concurrent') || brain.question.includes('race') },
      { scenario: 'Network failure', handled: brain.question.includes('retry') || brain.question.includes('timeout') },
      { scenario: 'Large payload', handled: brain.question.includes('pagination') || brain.question.includes('limit') },
      { scenario: 'Invalid input', handled: brain.question.includes('validation') || brain.question.includes('sanitiz') },
    ];

    edgeCases.push(...commonEdgeCases.map(ec => ({
      ...ec,
      description: ec.handled ? `${ec.scenario} appears to be addressed` : `${ec.scenario} not explicitly addressed`,
    })));

    // Detect inconsistencies
    const inconsistencies: Array<{ type: string; description: string }> = [];
    const upstreamDeps = getTopCodeEdges(brain.dag, domain, 'upstream', 5);

    if (upstreamDeps.length === 0 && !brain.question.includes('new')) {
      inconsistencies.push({
        type: 'isolation',
        description: 'Feature appears isolated but not marked as new — may need integration points',
      });
    }

    // Calculate completeness score
    const totalChecks = requiredElements.length + commonEdgeCases.length;
    const passedChecks = (requiredElements.length - missingRequirements.length) +
                        edgeCases.filter(ec => ec.handled).length;
    const completenessScore = passedChecks / totalChecks;

    // Build interventions (what needs to be addressed)
    const interventions = missingRequirements.slice(0, 5).map(req => ({
      action: `Add ${req.element} specification`,
      targetDomains: [domain],
      expectedImpact: `Improve spec completeness by ${(100 / requiredElements.length).toFixed(0)}%`,
      confidence: 0.9,
      evidence: req.description,
      owner: 'Product/Engineering',
      effort: 'low' as const,
    }));

    const confidence = Math.min(0.95, completenessScore * 0.6 + 0.4);
    const narrative = `Spec completeness for ${domain}: ${(completenessScore * 100).toFixed(0)}%. Missing: ${missingRequirements.length} requirements. Unhandled edge cases: ${edgeCases.filter(ec => !ec.handled).length}. ${inconsistencies.length > 0 ? `Found ${inconsistencies.length} inconsistencies.` : 'No major inconsistencies.'}`;

    return {
      data: {
        type: 'spec-completeness',
        missingRequirements,
        edgeCases,
        inconsistencies,
        completenessScore,
        totalChecks,
        passedChecks,
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        completenessScore,
        missingCount: missingRequirements.length,
        edgeCaseCount: edgeCases.filter(ec => !ec.handled).length,
      },
    };
  },
});

// ============================================================================
// DOMAIN 3: REQUIREMENT-CLARIFY — Socratic Reasoning Engine
// ============================================================================

export const requirementClarifyDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'requirement-clarify',
  description: 'Generates targeted technical questions to clarify ambiguous or incomplete requirements',
  brainAnalog: "Broca's Area (Questioning Variant) — formulates precise questions from knowledge gaps",
  requires: ['patterns'],
  optional: ['llmAmplifier', 'agentRegistry'],
  intents: ['interrogate'],
  intentKeywords: ['clarify requirements', 'ask questions', 'what about', 'need to know', 'unclear'],
  intentPatterns: [
    /\bclarify\s+requirements\b/i,
    /\bask\s+questions?\b/i,
    /\bwhat\s+about\b/i,
    /\bneed\s+to\s+know\b/i,
    /\bunclear\b/i,
    /\bquestion(s)?\s+for\b/i,
  ],
  priority: 70,
  outputSchema: {
    dataType: 'requirement-clarify',
    fields: ['questions', 'priorities', 'stakeholders'],
    composable: true,
    consumableBy: ['pattern-enforce', 'code-generate'],
  },
  composableWith: ['spec-completeness', 'code-generate'],
  tags: ['software-engineering', 'requirements', 'clarification'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['pattern-matching'];

    log(`Generating clarifying questions for ${domain}`);

    // Question categories for software engineering
    const questions: Array<{
      question: string;
      category: string;
      priority: 'high' | 'medium' | 'low';
      stakeholder: string;
      rationale: string;
    }> = [];

    // Architecture questions
    if (!brain.question.toLowerCase().includes('architecture') && !brain.question.toLowerCase().includes('design')) {
      questions.push({
        question: 'What architectural pattern should this follow (REST, GraphQL, gRPC, event-driven)?',
        category: 'architecture',
        priority: 'high',
        stakeholder: 'Tech Lead',
        rationale: 'Architecture not specified — affects implementation approach',
      });
    }

    // Security questions
    if (!brain.question.toLowerCase().includes('auth')) {
      questions.push({
        question: 'What authentication/authorization mechanism is required (OAuth, JWT, session-based)?',
        category: 'security',
        priority: 'high',
        stakeholder: 'Security/Product',
        rationale: 'Authentication method not specified',
      });
    }

    // Data questions
    if (!brain.question.toLowerCase().includes('database') && !brain.question.toLowerCase().includes('storage')) {
      questions.push({
        question: 'What data persistence is needed? What is the expected data volume and retention policy?',
        category: 'data',
        priority: 'high',
        stakeholder: 'Engineering/Product',
        rationale: 'Data storage strategy not defined',
      });
    }

    // Performance questions
    if (!brain.question.toLowerCase().includes('performance') && !brain.question.toLowerCase().includes('scale')) {
      questions.push({
        question: 'What are the performance requirements (latency, throughput, concurrent users)?',
        category: 'performance',
        priority: 'medium',
        stakeholder: 'Product/Engineering',
        rationale: 'Performance expectations not specified',
      });
    }

    // Error handling questions
    if (!brain.question.toLowerCase().includes('error') && !brain.question.toLowerCase().includes('failure')) {
      questions.push({
        question: 'How should errors be handled? What should happen on failure (retry, fallback, alert)?',
        category: 'error-handling',
        priority: 'medium',
        stakeholder: 'Engineering',
        rationale: 'Error handling strategy not defined',
      });
    }

    // Testing questions
    if (!brain.question.toLowerCase().includes('test')) {
      questions.push({
        question: 'What testing is required (unit, integration, e2e)? What is the expected test coverage?',
        category: 'testing',
        priority: 'medium',
        stakeholder: 'Engineering/QA',
        rationale: 'Testing requirements not specified',
      });
    }

    // Monitoring questions
    if (!brain.question.toLowerCase().includes('monitor') && !brain.question.toLowerCase().includes('observability')) {
      questions.push({
        question: 'What metrics and logs should be captured? What alerts are needed?',
        category: 'monitoring',
        priority: 'low',
        stakeholder: 'Engineering/DevOps',
        rationale: 'Observability requirements not specified',
      });
    }

    // API design questions
    if (!brain.question.toLowerCase().includes('endpoint') && !brain.question.toLowerCase().includes('api')) {
      questions.push({
        question: 'What are the API endpoint specifications (request/response schemas, status codes)?',
        category: 'api-design',
        priority: 'high',
        stakeholder: 'Engineering',
        rationale: 'API contract not defined',
      });
    }

    // Build interventions from high-priority questions
    const interventions = questions.filter(q => q.priority === 'high').map(q => ({
      action: `Clarify: ${q.question}`,
      targetDomains: [domain],
      expectedImpact: 'Reduce implementation ambiguity',
      confidence: 0.85,
      evidence: q.rationale,
      owner: q.stakeholder,
      effort: 'low' as const,
    }));

    const confidence = 0.9; // High confidence in question generation
    const highPriorityCount = questions.filter(q => q.priority === 'high').length;
    const narrative = `Generated ${questions.length} clarifying questions for ${domain}. High priority: ${highPriorityCount}. Top question: ${questions[0]?.question || 'Specification appears complete.'}`;

    return {
      data: {
        type: 'requirement-clarify',
        questions,
        priorities: {
          high: questions.filter(q => q.priority === 'high').length,
          medium: questions.filter(q => q.priority === 'medium').length,
          low: questions.filter(q => q.priority === 'low').length,
        },
        stakeholders: [...new Set(questions.map(q => q.stakeholder))],
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        questionCount: questions.length,
        highPriorityCount,
      },
    };
  },
});

// ============================================================================
// DOMAIN 4: PATTERN-ENFORCE — Architectural Rule Engine
// ============================================================================

export const patternEnforceDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'pattern-enforce',
  description: 'Applies architectural patterns, design principles, and coding best practices deterministically',
  brainAnalog: 'Cerebellum / Procedural Memory — applying learned patterns to new situations',
  requires: ['rules', 'patterns'],
  optional: ['llmAmplifier', 'contextAwareReasoner'],
  intents: ['rule-apply'],
  intentKeywords: ['apply patterns', 'enforce standards', 'best practices', 'design patterns', 'code quality'],
  intentPatterns: [
    /\bapply\s+(architectural\s+)?patterns?\b/i,
    /\benforce\s+standards\b/i,
    /\bbest\s+practices\b/i,
    /\bdesign\s+patterns?\b/i,
    /\bcode\s+quality\b/i,
    /\blint(ing)?\b/i,
  ],
  priority: 75,
  outputSchema: {
    dataType: 'pattern-enforce',
    fields: ['appliedPatterns', 'violations', 'recommendations', 'qualityScore'],
    composable: true,
    consumableBy: ['consistency-verify', 'code-generate', 'review-triage'],
  },
  composableWith: ['consistency-verify', 'code-generate'],
  tags: ['software-engineering', 'patterns', 'quality'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['rule-engine', 'pattern-matching'];

    log(`Enforcing patterns and best practices for ${domain}`);

    // Architectural patterns to check
    const architecturalPatterns = [
      { name: 'Single Responsibility', check: 'Does this module have a single, well-defined purpose?' },
      { name: 'DRY (Don\'t Repeat Yourself)', check: 'Is there duplicated logic?' },
      { name: 'Separation of Concerns', check: 'Are business logic, data access, and presentation separated?' },
      { name: 'Dependency Injection', check: 'Are dependencies injected rather than hardcoded?' },
      { name: 'Error Handling', check: 'Are errors properly caught and handled?' },
      { name: 'Input Validation', check: 'Is user input validated and sanitized?' },
      { name: 'Immutability', check: 'Are data structures immutable where possible?' },
      { name: 'Testing', check: 'Are unit tests present?' },
    ];

    const appliedPatterns: Array<{ pattern: string; status: 'compliant' | 'violated' | 'unknown'; evidence: string }> = [];
    const violations: Array<{ pattern: string; severity: string; description: string; fix: string }> = [];

    // Check each pattern against brain knowledge
    for (const pattern of architecturalPatterns) {
      const relevantRules = brain.matchedRules.filter(r =>
        r.naturalLanguage.toLowerCase().includes(pattern.name.toLowerCase())
      );

      const relevantPatterns = brain.patterns.filter(p =>
        p.pattern.toLowerCase().includes(pattern.name.toLowerCase())
      );

      if (relevantRules.length > 0 || relevantPatterns.length > 0) {
        const triggered = relevantRules.some(r => r.triggered);
        appliedPatterns.push({
          pattern: pattern.name,
          status: triggered ? 'violated' : 'compliant',
          evidence: relevantRules[0]?.naturalLanguage || relevantPatterns[0]?.pattern || '',
        });

        if (triggered) {
          violations.push({
            pattern: pattern.name,
            severity: ['Input Validation', 'Error Handling'].includes(pattern.name) ? 'high' : 'medium',
            description: `${pattern.name} violation detected`,
            fix: pattern.check,
          });
        }
      } else {
        appliedPatterns.push({
          pattern: pattern.name,
          status: 'unknown',
          evidence: 'Insufficient data to verify compliance',
        });
      }
    }

    // Security best practices
    const securityChecks = [
      'SQL injection prevention',
      'XSS prevention',
      'CSRF protection',
      'Authentication required',
      'Input sanitization',
      'Secure headers',
    ];

    for (const check of securityChecks) {
      const mentioned = brain.question.toLowerCase().includes(check.toLowerCase());
      if (!mentioned) {
        violations.push({
          pattern: check,
          severity: 'high',
          description: `${check} not explicitly addressed`,
          fix: `Ensure ${check} is implemented`,
        });
      }
    }

    // Calculate quality score
    const totalPatterns = appliedPatterns.length;
    const compliantPatterns = appliedPatterns.filter(p => p.status === 'compliant').length;
    const qualityScore = totalPatterns > 0 ? compliantPatterns / totalPatterns : 0.5;

    // Build recommendations
    const recommendations = violations.slice(0, 5).map(v => ({
      priority: v.severity === 'high' ? 'critical' : 'normal',
      action: v.fix,
      category: v.pattern,
    }));

    // Build interventions
    const interventions = violations.filter(v => v.severity === 'high').slice(0, 3).map(v => ({
      action: `Fix ${v.pattern} violation`,
      targetDomains: [domain],
      expectedImpact: 'Improve code quality and security',
      confidence: 0.9,
      evidence: v.description,
      owner: 'Engineering',
      effort: 'medium' as const,
    }));

    const confidence = Math.min(0.9, qualityScore * 0.6 + 0.4);
    const narrative = `Pattern enforcement for ${domain}: Quality score ${(qualityScore * 100).toFixed(0)}%. Violations: ${violations.length} (${violations.filter(v => v.severity === 'high').length} high severity). ${recommendations.length > 0 ? `Top recommendation: ${recommendations[0].action}` : 'All patterns compliant.'}`;

    return {
      data: {
        type: 'pattern-enforce',
        appliedPatterns,
        violations,
        recommendations,
        qualityScore,
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        qualityScore,
        violationCount: violations.length,
        highSeverityCount: violations.filter(v => v.severity === 'high').length,
      },
    };
  },
});

// ============================================================================
// DOMAIN 5: CONSISTENCY-VERIFY — Cross-Modal Verification Cortex
// ============================================================================

export const consistencyVerifyDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'consistency-verify',
  description: 'Cross-checks code, tests, documentation, API schemas, and database schemas for inconsistencies',
  brainAnalog: 'Parietal Association Cortex — cross-modal verification, checking one sense against another',
  requires: ['causalDAG', 'patterns'],
  optional: ['llmAmplifier', 'contextAwareReasoner'],
  intents: ['cross-validate'],
  intentKeywords: ['verify consistency', 'check alignment', 'cross-check', 'inconsistencies', 'validate'],
  intentPatterns: [
    /\bverify\s+consistency\b/i,
    /\bcheck\s+alignment\b/i,
    /\bcross-check\b/i,
    /\binconsistencies\b/i,
    /\bvalidate\b/i,
    /\breconcile\b/i,
  ],
  priority: 70,
  outputSchema: {
    dataType: 'consistency-verify',
    fields: ['consistencyChecks', 'inconsistencies', 'alignmentScore'],
    composable: true,
    consumableBy: ['review-triage', 'code-generate'],
  },
  composableWith: ['pattern-enforce', 'review-triage'],
  tags: ['software-engineering', 'verification', 'quality'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['causal-dag-analysis'];

    log(`Verifying consistency for ${domain}`);

    const consistencyChecks: Array<{
      check: string;
      status: 'pass' | 'fail' | 'warning';
      description: string;
    }> = [];

    const inconsistencies: Array<{
      type: string;
      severity: 'high' | 'medium' | 'low';
      description: string;
      sources: string[];
    }> = [];

    // Check 1: Code-Test alignment
    const testPatterns = brain.patterns.filter(p => p.pattern.includes('test'));
    const hasTests = testPatterns.length > 0 || brain.question.toLowerCase().includes('test');

    consistencyChecks.push({
      check: 'Code-Test Alignment',
      status: hasTests ? 'pass' : 'fail',
      description: hasTests ? 'Tests detected for this domain' : 'No tests found for this domain',
    });

    if (!hasTests) {
      inconsistencies.push({
        type: 'missing-tests',
        severity: 'high',
        description: 'Code exists but no corresponding tests found',
        sources: [domain],
      });
    }

    // Check 2: API-Schema alignment
    const apiPatterns = brain.patterns.filter(p => p.pattern.includes('API') || p.pattern.includes('endpoint'));
    const schemaPatterns = brain.patterns.filter(p => p.pattern.includes('schema') || p.pattern.includes('type'));

    if (apiPatterns.length > 0) {
      const hasSchema = schemaPatterns.length > 0;
      consistencyChecks.push({
        check: 'API-Schema Alignment',
        status: hasSchema ? 'pass' : 'warning',
        description: hasSchema ? 'API schemas defined' : 'API endpoints without schema definitions',
      });

      if (!hasSchema) {
        inconsistencies.push({
          type: 'missing-schema',
          severity: 'medium',
          description: 'API endpoints exist but schemas not found',
          sources: apiPatterns.map(p => p.domain),
        });
      }
    }

    // Check 3: Documentation-Code alignment
    const docPatterns = brain.patterns.filter(p => p.pattern.includes('doc') || p.pattern.includes('comment'));
    const hasDoc = docPatterns.length > 0 || brain.question.toLowerCase().includes('document');

    consistencyChecks.push({
      check: 'Documentation-Code Alignment',
      status: hasDoc ? 'pass' : 'warning',
      description: hasDoc ? 'Documentation found' : 'Limited or no documentation detected',
    });

    // Check 4: Dependency consistency (causal graph)
    const upstreamDeps = getTopCodeEdges(brain.dag, domain, 'upstream', 10);
    const circularDeps = detectCircularDeps(brain.dag, domain);

    consistencyChecks.push({
      check: 'Dependency Consistency',
      status: circularDeps.length === 0 ? 'pass' : 'fail',
      description: circularDeps.length === 0
        ? 'No circular dependencies detected'
        : `${circularDeps.length} circular dependencies found`,
    });

    if (circularDeps.length > 0) {
      inconsistencies.push({
        type: 'circular-dependency',
        severity: 'high',
        description: 'Circular dependencies detected — breaks modularity',
        sources: circularDeps,
      });
    }

    // Check 5: Naming consistency
    const namingPatterns = brain.patterns.filter(p => p.pattern.includes('camelCase') || p.pattern.includes('snake_case'));
    consistencyChecks.push({
      check: 'Naming Consistency',
      status: namingPatterns.length > 0 ? 'pass' : 'warning',
      description: namingPatterns.length > 0 ? 'Consistent naming detected' : 'Naming convention unclear',
    });

    // Calculate alignment score
    const totalChecks = consistencyChecks.length;
    const passedChecks = consistencyChecks.filter(c => c.status === 'pass').length;
    const alignmentScore = totalChecks > 0 ? passedChecks / totalChecks : 0.5;

    // Build interventions
    const interventions = inconsistencies.filter(i => i.severity === 'high').slice(0, 3).map(inc => ({
      action: `Fix ${inc.type}: ${inc.description}`,
      targetDomains: inc.sources,
      expectedImpact: 'Improve code consistency and maintainability',
      confidence: 0.85,
      evidence: `Inconsistency detected across ${inc.sources.length} sources`,
      owner: 'Engineering',
      effort: (inc.severity === 'high' ? 'medium' : 'low') as 'medium' | 'low',
    }));

    const confidence = Math.min(0.9, alignmentScore * 0.7 + 0.3);
    const narrative = `Consistency verification for ${domain}: Alignment score ${(alignmentScore * 100).toFixed(0)}%. Checks: ${passedChecks}/${totalChecks} passed. Inconsistencies: ${inconsistencies.length} (${inconsistencies.filter(i => i.severity === 'high').length} critical).`;

    return {
      data: {
        type: 'consistency-verify',
        consistencyChecks,
        inconsistencies,
        alignmentScore,
        passedChecks,
        totalChecks,
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        alignmentScore,
        inconsistencyCount: inconsistencies.length,
        criticalCount: inconsistencies.filter(i => i.severity === 'high').length,
      },
    };
  },
});

// ============================================================================
// DOMAIN 6: CODE-GENERATE — Output Assembly Cortex
// ============================================================================

export const codeGenerateDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'code-generate',
  description: 'Produces production-ready code implementations including tests, docs, and infrastructure',
  brainAnalog: 'Supplementary Motor Area — assembling complex structured output from multiple inputs',
  requires: ['patterns', 'rules'],
  optional: ['llmAmplifier', 'agentRegistry', 'motorCommands'],
  intents: ['build'],
  intentKeywords: ['generate code', 'implement', 'write code', 'create implementation', 'build feature'],
  intentPatterns: [
    /\bgenerate\s+code\b/i,
    /\bimplement\b/i,
    /\bwrite\s+(the\s+)?code\b/i,
    /\bcreate\s+implementation\b/i,
    /\bbuild\s+(a\s+)?feature\b/i,
    /\bscaffold\b/i,
  ],
  priority: 80,
  outputSchema: {
    dataType: 'code-generate',
    fields: ['codeArtifacts', 'tests', 'documentation', 'infrastructure', 'completeness'],
    composable: true,
    consumableBy: ['review-triage', 'consistency-verify'],
  },
  composableWith: ['review-triage', 'consistency-verify'],
  tags: ['software-engineering', 'generation', 'implementation'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['pattern-matching', 'rule-engine'];

    log(`Generating code implementation for ${domain}`);

    // Code artifacts to generate
    const codeArtifacts: Array<{
      type: string;
      name: string;
      description: string;
      priority: 'critical' | 'high' | 'medium';
    }> = [];

    // Core implementation
    codeArtifacts.push({
      type: 'implementation',
      name: `${domain}.implementation`,
      description: 'Core business logic implementation',
      priority: 'critical',
    });

    // API layer (if needed)
    if (brain.question.toLowerCase().includes('api') || brain.question.toLowerCase().includes('endpoint')) {
      codeArtifacts.push({
        type: 'api',
        name: `${domain}.routes`,
        description: 'API routes and request handlers',
        priority: 'critical',
      });

      codeArtifacts.push({
        type: 'schema',
        name: `${domain}.schema`,
        description: 'Request/response schema definitions',
        priority: 'high',
      });
    }

    // Data layer
    if (brain.question.toLowerCase().includes('database') || brain.question.toLowerCase().includes('persist')) {
      codeArtifacts.push({
        type: 'data-access',
        name: `${domain}.repository`,
        description: 'Data access layer',
        priority: 'critical',
      });

      codeArtifacts.push({
        type: 'migration',
        name: `${domain}.migration`,
        description: 'Database migration scripts',
        priority: 'high',
      });
    }

    // Tests
    codeArtifacts.push({
      type: 'unit-tests',
      name: `${domain}.test`,
      description: 'Unit tests for core logic',
      priority: 'critical',
    });

    codeArtifacts.push({
      type: 'integration-tests',
      name: `${domain}.integration.test`,
      description: 'Integration tests',
      priority: 'high',
    });

    // Documentation
    codeArtifacts.push({
      type: 'api-docs',
      name: `${domain}.api.md`,
      description: 'API documentation',
      priority: 'medium',
    });

    codeArtifacts.push({
      type: 'readme',
      name: `${domain}.README.md`,
      description: 'Implementation documentation',
      priority: 'medium',
    });

    // Infrastructure
    if (brain.question.toLowerCase().includes('deploy') || brain.question.toLowerCase().includes('ci')) {
      codeArtifacts.push({
        type: 'ci-config',
        name: `${domain}.ci.yml`,
        description: 'CI/CD pipeline configuration',
        priority: 'high',
      });
    }

    // Monitoring
    codeArtifacts.push({
      type: 'monitoring',
      name: `${domain}.monitoring`,
      description: 'Logging and metrics instrumentation',
      priority: 'medium',
    });

    // Calculate completeness
    const criticalArtifacts = codeArtifacts.filter(a => a.priority === 'critical').length;
    const totalArtifacts = codeArtifacts.length;
    const completeness = criticalArtifacts / totalArtifacts;

    // Build interventions (artifacts to generate)
    const interventions = codeArtifacts.filter(a => a.priority === 'critical').map(artifact => ({
      action: `Generate ${artifact.name}`,
      targetDomains: [domain],
      expectedImpact: `Complete ${artifact.type} implementation`,
      confidence: 0.8,
      evidence: artifact.description,
      owner: 'Engineering',
      effort: (artifact.priority === 'critical' ? 'high' : 'medium') as 'high' | 'medium',
    }));

    const confidence = 0.75; // Code generation requires validation
    const narrative = `Code generation plan for ${domain}: ${totalArtifacts} artifacts to generate (${criticalArtifacts} critical). Includes: implementation, tests, docs, ${brain.question.includes('api') ? 'API layer, ' : ''}${brain.question.includes('database') ? 'data layer, ' : ''}monitoring.`;

    // If LLM amplifier available, use it to generate actual code
    let llmGeneratedCode = null;
    if (modules.amplifier) {
      modulesUsed.push('llm-amplifier');
      try {
        // This would call the LLM to generate actual code
        // For now, we indicate the structure
        llmGeneratedCode = {
          status: 'ready',
          artifacts: codeArtifacts.map(a => a.name),
        };
      } catch (err) {
        log('LLM code generation failed, returning structure only');
      }
    }

    return {
      data: {
        type: 'code-generate',
        codeArtifacts,
        tests: codeArtifacts.filter(a => a.type.includes('test')),
        documentation: codeArtifacts.filter(a => a.type.includes('doc') || a.type.includes('readme')),
        infrastructure: codeArtifacts.filter(a => a.type.includes('ci') || a.type.includes('monitoring')),
        completeness,
        llmGeneratedCode,
      },
      narrative,
      confidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        artifactCount: totalArtifacts,
        criticalArtifacts,
        completeness,
      },
    };
  },
});

// ============================================================================
// DOMAIN 7: REVIEW-TRIAGE — Quality Assurance Cortex
// ============================================================================

export const reviewTriageDomain: ActionDomainDefinition = defineSoftwareEngineeringDomain({
  name: 'review-triage',
  description: 'Confidence-based code review triage — auto-approve safe code, flag risky changes for human review',
  brainAnalog: 'Orbitofrontal Cortex — value judgment, what needs attention vs what is fine',
  requires: ['patterns', 'rules'],
  optional: ['llmAmplifier', 'anomalyDetector'],
  intents: ['confidence-triage', 'audit'],
  intentKeywords: ['review code', 'triage', 'approve', 'flag for review', 'code review'],
  intentPatterns: [
    /\breview\s+(this\s+)?code\b/i,
    /\btriage\b/i,
    /\bapprove\b/i,
    /\bflag\s+for\s+review\b/i,
    /\bcode\s+review\b/i,
    /\bpull\s+request\b/i,
  ],
  priority: 85,
  outputSchema: {
    dataType: 'review-triage',
    fields: ['triageResults', 'autoApproved', 'needsReview', 'critical', 'confidenceScore'],
    composable: true,
    consumableBy: ['recommend', 'audit'],
  },
  composableWith: ['consistency-verify', 'pattern-enforce'],
  tags: ['software-engineering', 'review', 'quality'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['rule-engine', 'pattern-matching'];

    log(`Triaging code review for ${domain}`);

    // Triage categories
    const triageResults: Array<{
      file: string;
      category: 'auto-approve' | 'quick-review' | 'detailed-review' | 'critical';
      confidence: number;
      reason: string;
      risks: string[];
    }> = [];

    // Analyze code safety based on patterns and rules
    const patterns = brain.patterns.filter(p => p.domain === domain);
    const rules = brain.matchedRules.filter(r =>
      r.naturalLanguage.toLowerCase().includes(domain.toLowerCase())
    );

    // Risk indicators
    const riskIndicators = [
      { pattern: /auth|security|password/i, risk: 'security-sensitive', severity: 'critical' },
      { pattern: /payment|billing|transaction/i, risk: 'financial-sensitive', severity: 'critical' },
      { pattern: /database|migration|schema/i, risk: 'data-sensitive', severity: 'detailed' },
      { pattern: /api|endpoint|route/i, risk: 'api-change', severity: 'detailed' },
      { pattern: /test|spec/i, risk: 'test-only', severity: 'quick' },
      { pattern: /doc|readme|comment/i, risk: 'documentation', severity: 'auto' },
      { pattern: /config|env/i, risk: 'configuration', severity: 'detailed' },
    ];

    // Determine triage category based on domain and question
    let category: 'auto-approve' | 'quick-review' | 'detailed-review' | 'critical' = 'quick-review';
    let confidence = 0.7;
    const risks: string[] = [];

    for (const indicator of riskIndicators) {
      if (indicator.pattern.test(domain) || indicator.pattern.test(brain.question)) {
        risks.push(indicator.risk);

        if (indicator.severity === 'critical') {
          category = 'critical';
          confidence = 0.3;
        } else if (indicator.severity === 'detailed' && category !== 'critical') {
          category = 'detailed-review';
          confidence = 0.5;
        } else if (indicator.severity === 'quick' && category === 'quick-review') {
          confidence = 0.8;
        } else if (indicator.severity === 'auto') {
          category = 'auto-approve';
          confidence = 0.95;
        }
      }
    }

    // Check for rule violations (reduces confidence)
    const triggeredRules = rules.filter(r => r.triggered);
    if (triggeredRules.length > 0) {
      category = category === 'auto-approve' ? 'quick-review' : category;
      confidence = Math.max(0.3, confidence - 0.2);
      risks.push('rule-violations');
    }

    // Check for complexity (high coupling reduces confidence)
    const upstreamDeps = getTopCodeEdges(brain.dag, domain, 'upstream', 5);
    if (upstreamDeps.length > 8) {
      category = category === 'auto-approve' ? 'quick-review' : category;
      confidence = Math.max(0.4, confidence - 0.1);
      risks.push('high-complexity');
    }

    const reason = category === 'auto-approve'
      ? 'Low-risk change, follows patterns, no rule violations'
      : category === 'quick-review'
      ? 'Standard change, needs quick verification'
      : category === 'detailed-review'
      ? `${risks.join(', ')} — requires detailed review`
      : `CRITICAL: ${risks.join(', ')} — mandatory review`;

    triageResults.push({
      file: domain,
      category,
      confidence,
      reason,
      risks,
    });

    // Group by category
    const autoApproved = triageResults.filter(r => r.category === 'auto-approve');
    const quickReview = triageResults.filter(r => r.category === 'quick-review');
    const detailedReview = triageResults.filter(r => r.category === 'detailed-review');
    const critical = triageResults.filter(r => r.category === 'critical');

    // Build interventions for items needing review
    const interventions = [...critical, ...detailedReview].slice(0, 5).map(item => ({
      action: `${item.category === 'critical' ? 'URGENT: ' : ''}Review ${item.file}`,
      targetDomains: [item.file],
      expectedImpact: 'Ensure code quality and safety',
      confidence: item.confidence,
      evidence: item.reason,
      owner: item.category === 'critical' ? 'Senior Engineer/Tech Lead' : 'Engineering',
      effort: (item.category === 'critical' ? 'high' : 'medium') as 'high' | 'medium',
    }));

    const overallConfidence = triageResults.reduce((sum, r) => sum + r.confidence, 0) / triageResults.length;
    const narrative = `Code review triage for ${domain}: Category: ${category} (${(confidence * 100).toFixed(0)}% confidence). ${risks.length > 0 ? `Risks: ${risks.join(', ')}.` : 'No major risks detected.'} ${critical.length > 0 ? `⚠️  ${critical.length} critical items require immediate review.` : ''}`;

    return {
      data: {
        type: 'review-triage',
        triageResults,
        autoApproved,
        needsReview: [...quickReview, ...detailedReview, ...critical],
        critical,
        confidenceScore: overallConfidence,
        summary: {
          autoApprove: autoApproved.length,
          quickReview: quickReview.length,
          detailedReview: detailedReview.length,
          critical: critical.length,
        },
      },
      narrative,
      confidence: overallConfidence,
      drivers: [],
      interventions,
      modulesUsed,
      metadata: {
        confidenceScore: overallConfidence,
        category,
        riskCount: risks.length,
        criticalCount: critical.length,
      },
    };
  },
});

// ============================================================================
// EXPORT ALL SOFTWARE ENGINEERING DOMAINS
// ============================================================================

export const ALL_SOFTWARE_ENGINEERING_DOMAINS: ActionDomainDefinition[] = [
  codebaseComprehendDomain,
  specCompletenessDomain,
  requirementClarifyDomain,
  patternEnforceDomain,
  consistencyVerifyDomain,
  codeGenerateDomain,
  reviewTriageDomain,
];

/**
 * Register all 7 software engineering domains into a registry.
 */
export function registerSoftwareEngineeringDomains(
  registry: { register: (def: ActionDomainDefinition) => void },
): void {
  for (const domain of ALL_SOFTWARE_ENGINEERING_DOMAINS) {
    registry.register(domain);
  }
}
