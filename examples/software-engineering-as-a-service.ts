/**
 * Software Engineering as a Service (SE-aaS) — Integration Example
 * =================================================================
 *
 * This example demonstrates how to use NexusBrain's software engineering
 * cognitive primitives to build intelligent code review, feature implementation,
 * and tech debt optimization.
 *
 * ## The 7 Cognitive Primitives
 *
 * 1. **codebase-comprehend** — Understand architecture, dependencies, patterns
 * 2. **spec-completeness** — Detect missing requirements and edge cases
 * 3. **requirement-clarify** — Generate targeted technical questions
 * 4. **pattern-enforce** — Apply architectural patterns and best practices
 * 5. **consistency-verify** — Cross-check code, tests, docs, schemas
 * 6. **code-generate** — Produce production-ready implementations
 * 7. **review-triage** — Confidence-based code review triage
 *
 * ## The 4 Agents
 *
 * 1. **brain-code-reviewer** — AI code review with confidence triage
 * 2. **brain-feature-builder** — Feature implementation from specs
 * 3. **brain-codebase-mapper** — Codebase structure analysis
 * 4. **brain-tech-debt-optimizer** — Tech debt prioritization
 *
 * @example
 * ```typescript
 * // 1. Setup
 * import { createBrainStack } from '@nexus/memory-stack';
 * import { registerSoftwareEngineeringDomains } from '@nexus/memory-stack/orchestrator/action-domains-software-engineering';
 * import { registerSoftwareEngineeringAgents } from '@nexus/memory-stack/orchestrator/agents-software-engineering';
 *
 * const brain = await createBrainStack(supabase);
 * registerSoftwareEngineeringDomains(brain.actionRegistry);
 * registerSoftwareEngineeringAgents(brain.agentRegistry);
 *
 * // 2. Code Review
 * const review = await brain.agentRegistry.runAgent('brain-code-reviewer', {
 *   pullRequestId: 'PR-123',
 *   changedFiles: ['src/auth/login.ts'],
 *   description: 'Add OAuth login',
 * });
 *
 * console.log(review.result.triageDecision); // 'auto-approve' | 'detailed-review' | 'critical'
 * console.log(review.result.reviewComments);
 *
 * // 3. Feature Building
 * const feature = await brain.agentRegistry.runAgent('brain-feature-builder', {
 *   featureName: 'Two-Factor Auth',
 *   specification: 'Add 2FA with TOTP support',
 *   targetDomain: 'auth',
 * });
 *
 * console.log(feature.result.artifacts); // ['auth.2fa.ts', 'auth.2fa.test.ts', ...]
 *
 * // 4. Tech Debt Optimization
 * const techDebt = await brain.agentRegistry.runAgent('brain-tech-debt-optimizer', {
 *   scope: 'auth',
 * });
 *
 * console.log(techDebt.result.prioritizedBacklog);
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrainStack } from '../src/index';
import { registerSoftwareEngineeringDomains } from '../src/orchestrator/action-domains-software-engineering';
import { registerSoftwareEngineeringAgents } from '../src/orchestrator/agents-software-engineering';

// ============================================================================
// EXAMPLE 1: Code Review Automation
// ============================================================================

/**
 * Automated PR Review Pipeline
 *
 * This example shows how to integrate brain-code-reviewer into your CI/CD:
 * - Auto-approve low-risk PRs (documentation, tests)
 * - Flag medium-risk PRs for quick human review
 * - Block high-risk PRs (security, data, auth) until detailed review
 */
export async function codeReviewPipeline(
  supabase: SupabaseClient,
  prData: {
    id: string;
    changedFiles: string[];
    description: string;
    author: string;
  },
) {
  // Setup brain
  const brain = await createBrainStack(supabase);
  registerSoftwareEngineeringDomains(brain.actionRegistry);
  registerSoftwareEngineeringAgents(brain.agentRegistry);

  console.log(`🧠 Reviewing PR-${prData.id} by ${prData.author}...`);

  // Run code review agent
  const reviewResult = await brain.agentRegistry.runAgent('brain-code-reviewer', {
    pullRequestId: prData.id,
    changedFiles: prData.changedFiles,
    description: prData.description,
  });

  if (reviewResult.status !== 'completed') {
    throw new Error(`Review failed: ${reviewResult.error}`);
  }

  const review = reviewResult.result as {
    triageDecision: 'auto-approve' | 'quick-review' | 'detailed-review' | 'critical';
    confidence: number;
    reviewComments: string[];
    consistencyIssues: unknown[];
    patternViolations: unknown[];
  };

  console.log(`\n📊 Review Result: ${review.triageDecision} (${(review.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`\n💬 Comments:`);
  for (const comment of review.reviewComments) {
    console.log(`   ${comment}`);
  }

  // Take action based on triage
  if (review.triageDecision === 'auto-approve' && review.confidence > 0.85) {
    console.log('\n✅ Auto-approving PR (low risk, follows patterns)');
    // await github.approvePR(prData.id);
    // await github.mergePR(prData.id);
  } else if (review.triageDecision === 'quick-review') {
    console.log('\n👀 Flagging for quick review (standard change)');
    // await github.requestReview(prData.id, ['tech-lead']);
    // await github.addLabel(prData.id, 'needs-review');
  } else if (review.triageDecision === 'detailed-review') {
    console.log('\n🔍 Flagging for detailed review (complex change)');
    // await github.requestReview(prData.id, ['senior-engineers']);
    // await github.addLabel(prData.id, 'needs-detailed-review');
  } else {
    console.log('\n🚨 BLOCKING: Critical review required');
    // await github.blockMerge(prData.id);
    // await github.requestReview(prData.id, ['tech-leads', 'security-team']);
    // await github.addLabel(prData.id, 'critical-review-required');
  }

  return review;
}

// ============================================================================
// EXAMPLE 2: Feature Implementation from Spec
// ============================================================================

/**
 * Automated Feature Builder
 *
 * This example shows how to use brain-feature-builder to implement features:
 * - Check spec completeness
 * - Generate clarifying questions if incomplete
 * - Enforce architectural patterns
 * - Generate production-ready code (implementation + tests + docs)
 */
export async function featureBuilder(
  supabase: SupabaseClient,
  featureSpec: {
    name: string;
    description: string;
    requirements: string[];
    targetModule: string;
  },
) {
  const brain = await createBrainStack(supabase);
  registerSoftwareEngineeringDomains(brain.actionRegistry);
  registerSoftwareEngineeringAgents(brain.agentRegistry);

  console.log(`🔨 Building feature: ${featureSpec.name}...`);

  // Combine spec into a single specification string
  const specification = `
${featureSpec.description}

Requirements:
${featureSpec.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}
  `.trim();

  // Run feature builder agent
  const buildResult = await brain.agentRegistry.runAgent('brain-feature-builder', {
    featureName: featureSpec.name,
    specification,
    targetDomain: featureSpec.targetModule,
  });

  if (buildResult.status !== 'completed') {
    throw new Error(`Feature build failed: ${buildResult.error}`);
  }

  const build = buildResult.result as {
    completenessCheck: { completenessScore: number };
    questions: Array<{ question: string; priority: string }>;
    implementation: unknown;
    artifacts: string[];
    confidence: number;
  };

  console.log(`\n📊 Spec Completeness: ${(build.completenessCheck.completenessScore * 100).toFixed(0)}%`);

  // If spec is incomplete, return questions
  if (build.completenessCheck.completenessScore < 0.7) {
    console.log('\n❓ Spec incomplete. Clarifying questions:');
    for (const q of build.questions) {
      console.log(`   [${q.priority.toUpperCase()}] ${q.question}`);
    }
    return { status: 'needs-clarification', questions: build.questions };
  }

  // If spec is complete, show generated artifacts
  console.log(`\n📦 Generated Artifacts (${build.artifacts.length}):`);
  for (const artifact of build.artifacts) {
    console.log(`   - ${artifact}`);
  }

  console.log(`\n✅ Feature implementation ready (${(build.confidence * 100).toFixed(0)}% confidence)`);

  return { status: 'completed', artifacts: build.artifacts, confidence: build.confidence };
}

// ============================================================================
// EXAMPLE 3: Codebase Onboarding
// ============================================================================

/**
 * Onboard New Engineers to Codebase
 *
 * This example shows how to use brain-codebase-mapper to help new engineers
 * understand a codebase quickly (analogous to a senior engineer ramping up).
 */
export async function codebaseOnboarding(
  supabase: SupabaseClient,
  repository: string,
) {
  const brain = await createBrainStack(supabase);
  registerSoftwareEngineeringDomains(brain.actionRegistry);
  registerSoftwareEngineeringAgents(brain.agentRegistry);

  console.log(`🗺️  Mapping codebase: ${repository}...`);

  // Run codebase mapper agent
  const mapResult = await brain.agentRegistry.runAgent('brain-codebase-mapper', {
    repository,
    branch: 'main',
  });

  if (mapResult.status !== 'completed') {
    throw new Error(`Codebase mapping failed: ${mapResult.error}`);
  }

  const map = mapResult.result as {
    architecture: { patterns: string[]; complexity: string };
    dependencies: { upstream: unknown[]; downstream: unknown[] };
    techDebt: Array<{ type: string; severity: string; description: string }>;
    patterns: unknown[];
    complexity: number;
    recommendations: Array<{ priority: string; action: string }>;
  };

  console.log(`\n🏗️  Architecture:`);
  console.log(`   Patterns: ${map.architecture.patterns.join(', ')}`);
  console.log(`   Complexity: ${map.architecture.complexity}`);

  console.log(`\n🔗 Dependencies:`);
  console.log(`   Upstream: ${map.dependencies.upstream.length}`);
  console.log(`   Downstream: ${map.dependencies.downstream.length}`);

  console.log(`\n⚠️  Tech Debt (${map.techDebt.length} items):`);
  for (const debt of map.techDebt.slice(0, 5)) {
    console.log(`   [${debt.severity.toUpperCase()}] ${debt.type}: ${debt.description}`);
  }

  console.log(`\n💡 Recommendations:`);
  for (const rec of map.recommendations.slice(0, 3)) {
    console.log(`   [${rec.priority}] ${rec.action}`);
  }

  return map;
}

// ============================================================================
// EXAMPLE 4: Tech Debt Sprint Planning
// ============================================================================

/**
 * Automated Tech Debt Sprint Planning
 *
 * This example shows how to use brain-tech-debt-optimizer to prioritize
 * refactoring work based on risk and effort.
 */
export async function techDebtSprintPlanning(
  supabase: SupabaseClient,
  scope?: string,
) {
  const brain = await createBrainStack(supabase);
  registerSoftwareEngineeringDomains(brain.actionRegistry);
  registerSoftwareEngineeringAgents(brain.agentRegistry);

  console.log(`🔧 Optimizing tech debt${scope ? ` (scope: ${scope})` : ''}...`);

  // Run tech debt optimizer agent
  const optimizeResult = await brain.agentRegistry.runAgent('brain-tech-debt-optimizer', {
    scope,
  });

  if (optimizeResult.status !== 'completed') {
    throw new Error(`Tech debt optimization failed: ${optimizeResult.error}`);
  }

  const optimization = optimizeResult.result as {
    techDebtItems: unknown[];
    prioritizedBacklog: Array<{ priority: string; action: string; effort: string }>;
    riskCascades: Array<{ source: string; impact: string }>;
    estimatedEffort: string;
  };

  console.log(`\n📊 Tech Debt Summary:`);
  console.log(`   Total items: ${optimization.techDebtItems.length}`);
  console.log(`   Estimated effort: ${optimization.estimatedEffort}`);

  console.log(`\n🚨 Risk Cascades (${optimization.riskCascades.length}):`);
  for (const cascade of optimization.riskCascades.slice(0, 3)) {
    console.log(`   ${cascade.source} → Impact: ${cascade.impact}`);
  }

  console.log(`\n📋 Prioritized Backlog (Top 10):`);
  for (const item of optimization.prioritizedBacklog.slice(0, 10)) {
    console.log(`   [${item.priority}] ${item.action} (effort: ${item.effort})`);
  }

  // Group by effort for sprint planning
  const sprintCandidates = optimization.prioritizedBacklog.filter(
    item => item.effort === 'low' || item.effort === 'medium'
  ).slice(0, 5);

  console.log(`\n🎯 Sprint Candidates (low-medium effort):`);
  for (const candidate of sprintCandidates) {
    console.log(`   - ${candidate.action}`);
  }

  return optimization;
}

// ============================================================================
// EXAMPLE 5: End-to-End SE-aaS Workflow
// ============================================================================

/**
 * Complete Software Engineering as a Service Workflow
 *
 * This example demonstrates a full SE-aaS workflow:
 * 1. New repository → Codebase mapping
 * 2. Feature request → Feature building
 * 3. PR opened → Code review
 * 4. Weekly → Tech debt optimization
 */
export async function fullSEaaSWorkflow(supabase: SupabaseClient) {
  console.log('🚀 Starting SE-aaS Workflow...\n');

  // Step 1: Onboard to codebase
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Step 1: Codebase Onboarding');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const codebaseMap = await codebaseOnboarding(supabase, 'example-saas-app');

  // Step 2: Build a new feature
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Step 2: Feature Building');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const feature = await featureBuilder(supabase, {
    name: 'Two-Factor Authentication',
    description: 'Add TOTP-based 2FA to user authentication',
    requirements: [
      'Support Google Authenticator and Authy',
      'QR code generation for setup',
      'Backup codes for recovery',
      'Admin can enforce 2FA for organization',
      'Audit logging for 2FA events',
    ],
    targetModule: 'auth',
  });

  if (feature.status === 'needs-clarification') {
    console.log('\n⏸️  Feature building paused for clarification');
    return;
  }

  // Step 3: Review the PR
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Step 3: Code Review');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const review = await codeReviewPipeline(supabase, {
    id: 'PR-123',
    changedFiles: feature.artifacts || ['src/auth/2fa.ts'],
    description: 'Implement 2FA with TOTP',
    author: 'ai-engineer',
  });

  // Step 4: Optimize tech debt
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Step 4: Tech Debt Optimization');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const techDebt = await techDebtSprintPlanning(supabase, 'auth');

  console.log('\n✅ SE-aaS Workflow Complete!');

  return {
    codebaseMap,
    feature,
    review,
    techDebt,
  };
}

// ============================================================================
// RUN EXAMPLES (Uncomment to test)
// ============================================================================

/**
 * To run these examples:
 *
 * 1. Setup Supabase client:
 *    ```typescript
 *    import { createClient } from '@supabase/supabase-js';
 *    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *    ```
 *
 * 2. Run individual examples:
 *    ```typescript
 *    await codeReviewPipeline(supabase, { ... });
 *    await featureBuilder(supabase, { ... });
 *    await codebaseOnboarding(supabase, 'repo-url');
 *    await techDebtSprintPlanning(supabase);
 *    ```
 *
 * 3. Or run the full workflow:
 *    ```typescript
 *    await fullSEaaSWorkflow(supabase);
 *    ```
 */

// Example usage (uncomment to run):
// const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
// fullSEaaSWorkflow(supabase).catch(console.error);
