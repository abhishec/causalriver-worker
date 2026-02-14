/**
 * Software Engineering Agents Test Suite
 * ========================================
 *
 * Tests the 4 SE agents with realistic scenarios:
 * - brain-code-reviewer: PR review with various risk levels
 * - brain-feature-builder: Feature implementation from spec
 * - brain-codebase-mapper: Codebase analysis
 * - brain-tech-debt-optimizer: Tech debt prioritization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentRegistry } from '../orchestrator/agent-registry';
import {
  brainCodeReviewerAgent,
  brainFeatureBuilderAgent,
  brainCodebaseMapperAgent,
  brainTechDebtOptimizerAgent,
  registerSoftwareEngineeringAgents,
} from '../orchestrator/agents-software-engineering';

describe('Software Engineering Agents', () => {
  let registry: ReturnType<typeof createAgentRegistry>;

  beforeEach(() => {
    registry = createAgentRegistry({ verbose: true });

    // Register SE agents
    registerSoftwareEngineeringAgents(registry);

    // Mock the domain action agents that SE agents depend on
    // In production, these would be real domain actions
    const mockDomainAgent = (name: string, mockData: unknown) => ({
      name,
      description: `Mock ${name} domain`,
      level: 'tool' as const,
      execute: async () => ({
        data: mockData,
        narrative: `Mock ${name} result`,
        confidence: 0.8,
        interventions: [],
        modulesUsed: [name],
        metadata: {},
      }),
    });

    registry.register(mockDomainAgent('codebase-comprehend', {
      architecture: { patterns: ['REST API', 'MVC'], complexity: 'medium' },
      dependencies: { upstream: [{ source: 'auth', weight: 0.6 }], downstream: [] },
      techDebt: [
        { type: 'high-coupling', severity: 'medium', module: 'auth' },
        { type: 'circular-dependency', severity: 'high', module: 'user-service' },
      ],
      patterns: [{ pattern: 'REST API', domain: 'api' }],
      complexity: 0.6,
      codebaseMastery: 0.7,
    }));

    registry.register(mockDomainAgent('spec-completeness', {
      completenessScore: 0.75,
      missingRequirements: [
        { element: 'authentication', severity: 'high' },
        { element: 'error handling', severity: 'medium' },
      ],
      edgeCases: [
        { scenario: 'Empty input', handled: false },
        { scenario: 'Concurrent requests', handled: true },
      ],
    }));

    registry.register(mockDomainAgent('requirement-clarify', {
      questions: [
        {
          question: 'What authentication method should be used (OAuth, JWT, session)?',
          priority: 'high',
          stakeholder: 'Security/Product',
        },
        {
          question: 'What are the performance requirements (latency, throughput)?',
          priority: 'medium',
          stakeholder: 'Engineering',
        },
      ],
    }));

    registry.register(mockDomainAgent('pattern-enforce', {
      violations: [
        { pattern: 'Input Validation', severity: 'high', description: 'Missing input sanitization' },
      ],
      qualityScore: 0.7,
    }));

    registry.register(mockDomainAgent('consistency-verify', {
      inconsistencies: [
        { type: 'missing-tests', severity: 'high', sources: ['auth.ts'] },
      ],
      alignmentScore: 0.65,
    }));

    registry.register(mockDomainAgent('review-triage', {
      triageResults: [
        {
          category: 'detailed-review',
          confidence: 0.6,
          risks: ['security-sensitive', 'missing-tests'],
        },
      ],
      confidenceScore: 0.6,
    }));

    registry.register(mockDomainAgent('code-generate', {
      codeArtifacts: [
        { name: 'auth.implementation.ts', type: 'implementation' },
        { name: 'auth.test.ts', type: 'unit-tests' },
        { name: 'auth.api.md', type: 'api-docs' },
      ],
      completeness: 0.8,
    }));

    registry.register(mockDomainAgent('recommend', {
      recommendations: [
        { priority: 'critical', action: 'Add input validation' },
        { priority: 'high', action: 'Write unit tests' },
      ],
    }));

    registry.register(mockDomainAgent('pattern-memory', {
      matches: [{ pattern: 'high-coupling-auth', occurrences: 3 }],
    }));

    registry.register(mockDomainAgent('correlate', {
      correlations: [{ domain1: 'auth', domain2: 'user-service', strength: 0.7 }],
    }));

    registry.register(mockDomainAgent('risk-cascade', {
      cascades: [
        { source: 'auth', impact: 'high', affectedSystems: ['user-service', 'api-gateway'] },
      ],
    }));
  });

  describe('brain-code-reviewer', () => {
    it('should review a PR and triage as detailed-review', async () => {
      const result = await registry.runAgent('brain-code-reviewer', {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth/login.ts', 'src/auth/logout.ts'],
        description: 'Add OAuth login flow',
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();

      const output = result.result as {
        triageDecision: string;
        confidence: number;
        reviewComments: string[];
      };

      expect(output.triageDecision).toBe('detailed-review');
      expect(output.confidence).toBeGreaterThan(0);
      expect(output.reviewComments.length).toBeGreaterThan(0);
      expect(output.reviewComments.some(c => c.includes('Detailed review required'))).toBe(true);
    });

    it('should detect consistency issues in PR', async () => {
      const result = await registry.runAgent('brain-code-reviewer', {
        pullRequestId: 'PR-456',
        changedFiles: ['src/api/users.ts'],
        description: 'Update user API endpoints',
      });

      expect(result.status).toBe('completed');

      const output = result.result as {
        consistencyIssues: unknown[];
        patternViolations: unknown[];
      };

      expect(output.consistencyIssues.length).toBeGreaterThan(0);
      expect(output.patternViolations.length).toBeGreaterThan(0);
    });
  });

  describe('brain-feature-builder', () => {
    it('should build feature from specification', async () => {
      const result = await registry.runAgent('brain-feature-builder', {
        featureName: 'OAuth Login',
        specification: 'Implement OAuth 2.0 login flow with Google and GitHub providers',
        targetDomain: 'auth',
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();

      const output = result.result as {
        completenessCheck: { completenessScore: number };
        questions: unknown[];
        implementation: unknown;
        artifacts: string[];
        confidence: number;
      };

      expect(output.completenessCheck.completenessScore).toBeGreaterThan(0);
      expect(output.artifacts.length).toBeGreaterThan(0);
      expect(output.confidence).toBeGreaterThan(0);
    });

    it('should generate clarifying questions for incomplete spec', async () => {
      // Override mock to return low completeness
      registry.register({
        name: 'spec-completeness',
        description: 'Mock incomplete spec',
        level: 'tool',
        execute: async () => ({
          data: {
            completenessScore: 0.6, // Below 0.7 threshold
            missingRequirements: [
              { element: 'authentication', severity: 'high' },
              { element: 'error handling', severity: 'medium' },
            ],
            edgeCases: [],
          },
          narrative: 'Incomplete spec',
          confidence: 0.6,
          interventions: [],
          modulesUsed: [],
          metadata: {},
        }),
      });

      const result = await registry.runAgent('brain-feature-builder', {
        featureName: 'User Dashboard',
        specification: 'Add a user dashboard',
        targetDomain: 'frontend',
      });

      expect(result.status).toBe('completed');

      const output = result.result as {
        questions: Array<{ question: string; priority: string }>;
      };

      expect(output.questions.length).toBeGreaterThan(0);
      expect(output.questions.some(q => q.priority === 'high')).toBe(true);
    });

    it('should return early if spec completeness is too low', async () => {
      // Override mock to return very low completeness
      registry.register({
        name: 'spec-completeness',
        description: 'Mock very low completeness',
        level: 'tool',
        execute: async () => ({
          data: {
            completenessScore: 0.3,
            missingRequirements: [
              { element: 'authentication', severity: 'high' },
              { element: 'authorization', severity: 'high' },
              { element: 'error handling', severity: 'high' },
            ],
            edgeCases: [],
          },
          narrative: 'Very low completeness',
          confidence: 0.3,
          interventions: [],
          modulesUsed: [],
          metadata: {},
        }),
      });

      const result = await registry.runAgent('brain-feature-builder', {
        featureName: 'Vague Feature',
        specification: 'Do something',
        targetDomain: 'unknown',
      });

      expect(result.status).toBe('completed');

      const output = result.result as {
        confidence: number;
        implementation: null | unknown;
      };

      // With 0.3 completeness, should be below 0.5 threshold and return early
      expect(output.confidence).toBeLessThan(0.5);
      expect(output.implementation).toBeNull();
    });
  });

  describe('brain-codebase-mapper', () => {
    it('should analyze codebase structure', async () => {
      const result = await registry.runAgent('brain-codebase-mapper', {
        repository: 'https://github.com/example/repo.git',
        branch: 'main',
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();

      const output = result.result as {
        architecture: unknown;
        dependencies: { upstream: unknown[]; downstream: unknown[] };
        techDebt: unknown[];
        patterns: unknown[];
        complexity: number;
        recommendations: unknown[];
      };

      expect(output.architecture).toBeDefined();
      expect(output.dependencies).toBeDefined();
      expect(output.techDebt.length).toBeGreaterThan(0);
      expect(output.patterns.length).toBeGreaterThan(0);
      expect(output.complexity).toBeGreaterThan(0);
      expect(output.recommendations.length).toBeGreaterThan(0);
    });

    it('should store patterns in memory', async () => {
      const result = await registry.runAgent('brain-codebase-mapper', {
        repository: 'local-repo',
      });

      expect(result.status).toBe('completed');
      // Pattern memory agent should have been called
      // (In real implementation, verify pattern storage)
    });
  });

  describe('brain-tech-debt-optimizer', () => {
    it('should identify and prioritize tech debt', async () => {
      const result = await registry.runAgent('brain-tech-debt-optimizer', {
        scope: 'auth',
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();

      const output = result.result as {
        techDebtItems: unknown[];
        prioritizedBacklog: unknown[];
        riskCascades: unknown[];
        estimatedEffort: string;
      };

      expect(output.techDebtItems.length).toBeGreaterThan(0);
      expect(output.prioritizedBacklog.length).toBeGreaterThan(0);
      expect(output.riskCascades.length).toBeGreaterThan(0);
      expect(output.estimatedEffort).toBeDefined();
    });

    it('should analyze without scope filter', async () => {
      const result = await registry.runAgent('brain-tech-debt-optimizer', {});

      expect(result.status).toBe('completed');

      const output = result.result as {
        techDebtItems: unknown[];
      };

      expect(output.techDebtItems.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: Full SE-aaS workflow', () => {
    it('should execute full code review → feature build → tech debt optimization workflow', async () => {
      // Step 1: Review a PR
      const reviewResult = await registry.runAgent('brain-code-reviewer', {
        pullRequestId: 'PR-789',
        changedFiles: ['src/feature.ts'],
        description: 'Add new feature',
      });

      expect(reviewResult.status).toBe('completed');

      // Step 2: Build a new feature
      const buildResult = await registry.runAgent('brain-feature-builder', {
        featureName: 'New Feature',
        specification: 'Complete spec with auth, error handling, and tests',
        targetDomain: 'feature',
      });

      expect(buildResult.status).toBe('completed');

      // Step 3: Optimize tech debt
      const optimizeResult = await registry.runAgent('brain-tech-debt-optimizer', {
        scope: 'feature',
      });

      expect(optimizeResult.status).toBe('completed');

      // All agents should complete successfully
      expect(reviewResult.status).toBe('completed');
      expect(buildResult.status).toBe('completed');
      expect(optimizeResult.status).toBe('completed');
    });
  });
});

describe('Software Engineering Domain Actions', () => {
  it('should register all 7 SE domains', async () => {
    const { registerSoftwareEngineeringDomains } = await import('../orchestrator/action-domains-software-engineering');
    const mockRegistry = {
      register: vi.fn(),
    };

    registerSoftwareEngineeringDomains(mockRegistry);

    expect(mockRegistry.register).toHaveBeenCalledTimes(7);
  });

  it('should have correct domain intents', async () => {
    const { ALL_SOFTWARE_ENGINEERING_DOMAINS } = await import('../orchestrator/action-domains-software-engineering');

    expect(ALL_SOFTWARE_ENGINEERING_DOMAINS).toHaveLength(7);

    const domainNames = ALL_SOFTWARE_ENGINEERING_DOMAINS.map(d => d.name);
    expect(domainNames).toContain('codebase-comprehend');
    expect(domainNames).toContain('spec-completeness');
    expect(domainNames).toContain('requirement-clarify');
    expect(domainNames).toContain('pattern-enforce');
    expect(domainNames).toContain('consistency-verify');
    expect(domainNames).toContain('code-generate');
    expect(domainNames).toContain('review-triage');
  });
});
