/**
 * Impact Analysis Domain - Comprehensive Tests
 * ===============================================
 *
 * Tests impact analysis with Claude LLM integration.
 *
 * **Coverage:**
 * - Blast radius calculation
 * - Dependency chain traversal
 * - Risk scoring
 * - Claude LLM analysis
 * - Heuristic fallback
 * - Test coverage gap detection
 * - Reviewer recommendations
 */

import { describe, it, expect, vi } from 'vitest';
import { impactAnalysisDomain } from '../orchestrator/action-domains-impact-analysis';
import type { ActionDomainContext } from '../orchestrator/domain-action-engine';
import type {
  ImpactAnalysisRequest,
  ImpactAnalysisResult,
} from '../orchestrator/action-domains-impact-analysis';

// ============================================================================
// MOCK CONTEXT
// ============================================================================

function createMockContext(input: ImpactAnalysisRequest): ActionDomainContext {
  return {
    organizationId: 'org_test',
    userId: 'user_test',
    input,
    brain: {} as any,
    supabase: {} as any,
  };
}

// ============================================================================
// BLAST RADIUS TESTS
// ============================================================================

describe('Impact Analysis - Blast Radius', () => {
  it('should identify direct impacts from changed files', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/services/payment.ts', 'src/services/checkout.ts'],
      changeType: 'modify',
      changeDescription: 'Updated payment logic',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.affectedComponents.length).toBeGreaterThanOrEqual(2);
    const directImpacts = data.affectedComponents.filter(c => c.impactType === 'direct');
    expect(directImpacts.length).toBe(2);
  });

  it('should calculate blast radius', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/auth.ts'],
      changeType: 'modify',
      changeDescription: 'Changed auth module',
      dependencyGraph: {
        'src/api/users.ts': ['src/core/auth.ts'],
        'src/api/admin.ts': ['src/core/auth.ts'],
        'src/middleware/guard.ts': ['src/core/auth.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.blastRadius).toBeGreaterThan(1);
  });

  it('should track transitive dependencies', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/lib/utils.ts'],
      changeType: 'modify',
      changeDescription: 'Updated utility function',
      dependencyGraph: {
        'src/services/api.ts': ['src/lib/utils.ts'],
        'src/controllers/main.ts': ['src/services/api.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    const transitiveImpacts = data.affectedComponents.filter(c => c.impactType === 'transitive');
    expect(transitiveImpacts.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// RISK SCORING TESTS
// ============================================================================

describe('Impact Analysis - Risk Scoring', () => {
  it('should assign higher risk for delete changes', async () => {
    const ctxDelete = createMockContext({
      changedFiles: ['src/services/legacy.ts'],
      changeType: 'delete',
      changeDescription: 'Removed legacy service',
    });

    const ctxModify = createMockContext({
      changedFiles: ['src/services/legacy.ts'],
      changeType: 'modify',
      changeDescription: 'Modified legacy service',
    });

    const resultDelete = await impactAnalysisDomain.execute(ctxDelete);
    const resultModify = await impactAnalysisDomain.execute(ctxModify);

    const dataDelete = resultDelete.data as ImpactAnalysisResult;
    const dataModify = resultModify.data as ImpactAnalysisResult;

    expect(dataDelete.riskScore).toBeGreaterThan(dataModify.riskScore);
  });

  it('should return valid risk levels', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/index.ts'],
      changeType: 'modify',
      changeDescription: 'Minor change',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(['critical', 'high', 'medium', 'low']).toContain(data.riskLevel);
    expect(data.riskScore).toBeGreaterThanOrEqual(0);
    expect(data.riskScore).toBeLessThanOrEqual(100);
  });

  it('should increase risk with more dependencies', async () => {
    const ctxSmall = createMockContext({
      changedFiles: ['src/a.ts'],
      changeType: 'modify',
      changeDescription: 'Small change',
    });

    const ctxLarge = createMockContext({
      changedFiles: ['src/a.ts'],
      changeType: 'modify',
      changeDescription: 'Large change',
      dependencyGraph: {
        'src/b.ts': ['src/a.ts'],
        'src/c.ts': ['src/a.ts'],
        'src/d.ts': ['src/a.ts'],
        'src/e.ts': ['src/b.ts'],
        'src/f.ts': ['src/c.ts'],
      },
    });

    const resultSmall = await impactAnalysisDomain.execute(ctxSmall);
    const resultLarge = await impactAnalysisDomain.execute(ctxLarge);

    const dataSmall = resultSmall.data as ImpactAnalysisResult;
    const dataLarge = resultLarge.data as ImpactAnalysisResult;

    expect(dataLarge.riskScore).toBeGreaterThan(dataSmall.riskScore);
  });
});

// ============================================================================
// DEPENDENCY CHAIN TESTS
// ============================================================================

describe('Impact Analysis - Dependency Chains', () => {
  it('should build dependency chains', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/db.ts'],
      changeType: 'modify',
      changeDescription: 'Database change',
      dependencyGraph: {
        'src/services/user.ts': ['src/core/db.ts'],
        'src/api/routes.ts': ['src/services/user.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.dependencyChains.length).toBeGreaterThan(0);
  });

  it('should assign risk levels to chains', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/base.ts'],
      changeType: 'refactor',
      changeDescription: 'Refactoring base module',
      dependencyGraph: {
        'src/a.ts': ['src/core/base.ts'],
        'src/b.ts': ['src/a.ts'],
        'src/c.ts': ['src/b.ts'],
        'src/d.ts': ['src/c.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    data.dependencyChains.forEach(chain => {
      expect(['critical', 'high', 'medium', 'low']).toContain(chain.riskLevel);
    });
  });
});

// ============================================================================
// CLAUDE LLM INTEGRATION TESTS
// ============================================================================

describe('Impact Analysis - Claude Integration', () => {
  it('should use heuristics when no API key', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/service.ts'],
      changeType: 'modify',
      changeDescription: 'Service update',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.claudePowered).toBe(false);
    expect(data.affectedComponents.length).toBeGreaterThan(0);
  });

  it('should analyze with Claude when API key provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            text: `
\`\`\`json
{
  "affectedComponents": [
    {
      "path": "src/services/payment.ts",
      "impactType": "direct",
      "severity": "high",
      "reason": "Direct modification of payment logic",
      "distance": 0
    },
    {
      "path": "src/controllers/checkout.ts",
      "impactType": "transitive",
      "severity": "medium",
      "reason": "Depends on payment service",
      "distance": 1
    }
  ],
  "riskScore": 75,
  "dependencyChains": [
    {
      "chain": ["payment.ts", "checkout.ts", "order.ts"],
      "riskLevel": "high",
      "description": "Payment change cascades"
    }
  ],
  "summary": "High risk change"
}
\`\`\`
            `,
          },
        ],
      }),
    } as Response);

    const ctx = createMockContext({
      changedFiles: ['src/services/payment.ts'],
      changeType: 'modify',
      changeDescription: 'Payment logic change',
      anthropicApiKey: 'test-key',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.claudePowered).toBe(true);
    expect(data.affectedComponents.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should fallback gracefully when Claude fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('API error'));

    const ctx = createMockContext({
      changedFiles: ['src/service.ts'],
      changeType: 'modify',
      changeDescription: 'Update',
      anthropicApiKey: 'test-key',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.affectedComponents).toBeDefined();
    expect(data.riskScore).toBeDefined();
  });
});

// ============================================================================
// TEST COVERAGE GAP TESTS
// ============================================================================

describe('Impact Analysis - Test Coverage Gaps', () => {
  it('should detect missing tests for changed files', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/services/payment.ts'],
      changeType: 'modify',
      changeDescription: 'Payment logic change',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.testCoverageGaps.length).toBeGreaterThan(0);
    const noTests = data.testCoverageGaps.find(g => g.gapType === 'no-tests');
    expect(noTests).toBeDefined();
  });

  it('should detect integration gaps for transitive impacts', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/db.ts'],
      changeType: 'modify',
      changeDescription: 'DB change',
      dependencyGraph: {
        'src/services/user.ts': ['src/core/db.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    const integrationGaps = data.testCoverageGaps.filter(g => g.gapType === 'integration-gap');
    expect(integrationGaps.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// REVIEWER RECOMMENDATION TESTS
// ============================================================================

describe('Impact Analysis - Reviewer Recommendations', () => {
  it('should recommend reviewers based on affected domains', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/services/payment.ts'],
      changeType: 'modify',
      changeDescription: 'Payment change',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.recommendedReviewers.length).toBeGreaterThan(0);
  });

  it('should recommend architect for large blast radius', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/base.ts'],
      changeType: 'refactor',
      changeDescription: 'Major refactor',
      dependencyGraph: {
        'src/a.ts': ['src/core/base.ts'],
        'src/b.ts': ['src/core/base.ts'],
        'src/c.ts': ['src/core/base.ts'],
        'src/d.ts': ['src/core/base.ts'],
        'src/e.ts': ['src/core/base.ts'],
        'src/f.ts': ['src/core/base.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.recommendedReviewers).toContain('architect');
  });
});

// ============================================================================
// INTERVENTION TESTS
// ============================================================================

describe('Impact Analysis - Interventions', () => {
  it('should create intervention for high risk changes', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/core/auth.ts'],
      changeType: 'delete',
      changeDescription: 'Removing auth module',
      dependencyGraph: {
        'src/a.ts': ['src/core/auth.ts'],
        'src/b.ts': ['src/core/auth.ts'],
        'src/c.ts': ['src/core/auth.ts'],
      },
    });

    const result = await impactAnalysisDomain.execute(ctx);

    expect(result.interventions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Impact Analysis - Result Structure', () => {
  it('should return valid ActionDomainResult', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/index.ts'],
      changeType: 'modify',
      changeDescription: 'Minor update',
    });

    const result = await impactAnalysisDomain.execute(ctx);

    expect(result.type).toBe('impact-analysis');
    expect(result.data).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.narrative).toBeTruthy();
    expect(result.interventions).toBeDefined();
    expect(Array.isArray(result.interventions)).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(Array.isArray(result.evidence)).toBe(true);
  });

  it('should include proper evidence', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/service.ts'],
      changeType: 'modify',
      changeDescription: 'Update',
    });

    const result = await impactAnalysisDomain.execute(ctx);

    expect(result.evidence.length).toBeGreaterThan(0);
    result.evidence.forEach((ev: any) => {
      expect(ev.type).toBeTruthy();
      expect(ev.description).toBeTruthy();
      expect(ev.weight).toBeGreaterThan(0);
      expect(ev.weight).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Impact Analysis - Edge Cases', () => {
  it('should handle single file change', async () => {
    const ctx = createMockContext({
      changedFiles: ['README.md'],
      changeType: 'modify',
      changeDescription: 'Doc update',
    });

    const result = await impactAnalysisDomain.execute(ctx);
    const data = result.data as ImpactAnalysisResult;

    expect(data.affectedComponents.length).toBeGreaterThan(0);
    expect(data.riskLevel).toBe('low');
  });

  it('should handle empty dependency graph', async () => {
    const ctx = createMockContext({
      changedFiles: ['src/new-feature.ts'],
      changeType: 'add',
      changeDescription: 'New feature',
      dependencyGraph: {},
    });

    const result = await impactAnalysisDomain.execute(ctx);

    expect(result).toBeDefined();
    expect(result.type).toBe('impact-analysis');
  });
});
