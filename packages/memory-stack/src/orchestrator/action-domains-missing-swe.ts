/**
 * Missing SWE-aaS Domains (Gap Closure)
 * ========================================
 *
 * Implements the 3 missing capabilities from the 17-capability SWE-aaS spec:
 *   1. PR Review Assistant
 *   2. Boilerplate & Scaffolding Generator
 *   3. Codebase Q&A
 *
 * All use Claude Sonnet 4 with Brain context enrichment.
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { callDomainLLM } from './domain-llm-client';

// ============================================================================
// DOMAIN 1: PR REVIEW ASSISTANT
// ============================================================================

export interface PRReviewRequest {
  /** Diff or changed file contents */
  diff: string;
  /** PR title */
  title?: string;
  /** PR description */
  description?: string;
  /** Target branch */
  targetBranch?: string;
  /** Programming language(s) */
  languages?: string[];
  /** Review focus areas */
  focus?: ('security' | 'performance' | 'correctness' | 'style' | 'tests' | 'all')[];
  /** Repository context */
  repositoryContext?: string;
  /** Files changed in this PR — used to match against causal graph bottleneck domains */
  changedFiles?: string[];
}

export interface PRReviewComment {
  file: string;
  line: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'security' | 'performance' | 'correctness' | 'style' | 'tests';
  message: string;
  suggestion?: string;
  confidence: number;
}

/** Causal cascade impact — added when Brain graph is available */
export interface CausalCascadeImpact {
  /** Domain affected (e.g. 'customer_success', 'revenue') */
  domain: string;
  /** The causal relationship in plain English */
  relationship: string;
  /** Effect size from Granger causal graph */
  effectSize: number;
  /** Confidence of the causal edge */
  confidence: number;
  /** Lag in days before downstream impact appears */
  lagDays: number;
  /** Severity label based on effectSize */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PRReviewResult {
  overallScore: number; // 0-100
  approved: boolean;
  summary: string;
  comments: PRReviewComment[];
  securityIssues: PRReviewComment[];
  performanceIssues: PRReviewComment[];
  testCoverage: {
    hasTests: boolean;
    testQuality: 'none' | 'poor' | 'adequate' | 'good' | 'excellent';
    missingTestCases: string[];
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  brainInsights?: {
    historicalRiskPatterns: string[];
    similarIncidents: string[];
  };
  /** Causal cascade: how changes in this PR ripple through the business.
   *  Populated when org has causal graph data in Brain L4. */
  causalCascade?: CausalCascadeImpact[];
  /** True when causal cascade was enriched from the Brain graph */
  brainCausalEnriched?: boolean;
}

export const prReviewDomain = {
  id: 'pr-review',
  name: 'PR Review Assistant',
  description: 'Automated code review with security, performance, and correctness analysis',
  version: '1.0.0',
  capabilities: ['code-review', 'security-scan', 'performance-check', 'test-coverage'],

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as PRReviewRequest;
    const anthropicApiKey = (ctx as any).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    const brainContext = formatBrainContextForDomain(ctx, 'engineering');
    const brainAttribution = buildBrainAttribution(ctx, 'pr-review');

    if (!anthropicApiKey) {
      return heuristicPRReview(request, brainAttribution);
    }

    try {
      const result = await reviewWithClaude(request, anthropicApiKey, brainContext);

      // ── CAUSAL CASCADE ENRICHMENT ─────────────────────────────────────────
      // Pull engineering causal edges from Brain L4 (causal_relationships_statistical).
      // These tell us how changes in the engineering domain ripple downstream:
      //   e.g. engineering → customer_success (NPS, effect_size 0.55, lag 45d)
      //        engineering → revenue (churn, effect_size -0.65, lag 75d)
      // We surface these in the PR review so devs understand business impact
      // of what they're merging — not just code quality.
      const causalCascade = buildCausalCascadeFromBrain(ctx);

      return {
        type: 'pr-review',
        data: {
          ...result,
          causalCascade,
          brainCausalEnriched: causalCascade.length > 0,
          claudePowered: true,
          ...brainAttribution,
        },
        confidence: result.overallScore / 100,
        narrative: causalCascade.length > 0
          ? `${result.summary}\n\n🧠 Brain causal cascade: This change to the engineering domain has ${causalCascade.length} downstream causal impact(s) — ${causalCascade.map(c => `${c.domain} (effect: ${c.effectSize.toFixed(2)}, lag: ${c.lagDays}d)`).join(', ')}.`
          : result.summary,
        interventions: [
          ...result.recommendations.map((r, i) => ({
            id: `rec-${i}`,
            type: 'recommendation',
            description: r,
            priority: i < 3 ? 'high' : 'medium',
          })),
          // Surface high-severity causal cascade items as interventions
          ...causalCascade
            .filter(c => c.severity === 'high' || c.severity === 'critical')
            .map((c, i) => ({
              id: `cascade-${i}`,
              type: 'causal_risk',
              description: `⚡ Causal risk: ${c.relationship} (${c.domain}, effect_size ${c.effectSize.toFixed(2)}, manifests in ~${c.lagDays} days)`,
              priority: c.severity === 'critical' ? 'critical' : 'high',
            })),
        ],
        evidence: [
          {
            type: 'claude_review',
            description: `Claude analyzed ${request.diff.split('\n').length} diff lines across ${result.comments.length} comments`,
            weight: 0.9,
          },
          ...(causalCascade.length > 0 ? [{
            type: 'brain_causal_graph',
            description: `Brain L4 causal graph: ${causalCascade.length} downstream causal edges from engineering domain`,
            weight: 0.85,
          }] : []),
        ],
      };
    } catch (err: any) {
      console.warn('[PR Review] Claude failed, using heuristic:', err.message);
      return heuristicPRReview(request, brainAttribution);
    }
  },
};

/**
 * Extract causal cascade impacts from the Brain context (L4 causal graph).
 *
 * The Brain's causal_relationships_statistical table holds edges like:
 *   engineering → customer_success (effect_size 0.55, lag 45d, confidence 0.84)
 *   engineering → revenue (effect_size -0.65, lag 75d, confidence 0.91)
 *
 * We surface these in PR reviews so developers see business-level ripple effects.
 * This is the "wow" insight: "This PR touches engineering which causally affects
 * NPS (effect 0.55) in ~45 days — make sure we have test coverage."
 */
function buildCausalCascadeFromBrain(ctx: ActionDomainContext): CausalCascadeImpact[] {
  // Brain context carries causal edges via ctx.brain.dag or ctx.brain.causalEdges
  const brain = ctx.brain as Record<string, any>;
  const edges: any[] = brain?.causalEdges ?? brain?.dag?.edges ?? [];

  // Filter to edges where source domain is engineering (this PR's domain)
  const engineeringEdges = edges.filter((e: any) =>
    (e.source_domain ?? e.sourceDomain ?? e.source ?? '').toLowerCase().includes('engineering')
  );

  return engineeringEdges
    .filter((e: any) => (e.effect_size ?? e.effectSize ?? 0) !== 0)
    .map((e: any): CausalCascadeImpact => {
      const effectSize = Math.abs(e.effect_size ?? e.effectSize ?? 0);
      const lagDays = e.lag ?? e.lag_days ?? e.lagDays ?? 0;
      const confidence = e.confidence ?? e.p_value ?? 0.5;
      const targetDomain = e.target_domain ?? e.targetDomain ?? e.target ?? 'unknown';
      const targetMetric = e.target_metric ?? e.targetMetric ?? '';
      const naturalLanguage = e.natural_language ?? e.naturalLanguage ?? `Engineering changes affect ${targetDomain}${targetMetric ? ` (${targetMetric})` : ''}`;

      const severity: CausalCascadeImpact['severity'] =
        effectSize >= 0.7 ? 'critical' :
        effectSize >= 0.5 ? 'high' :
        effectSize >= 0.3 ? 'medium' : 'low';

      return {
        domain: targetDomain,
        relationship: naturalLanguage,
        effectSize,
        confidence,
        lagDays,
        severity,
      };
    })
    // Sort by effect size descending — most impactful cascades first
    .sort((a, b) => b.effectSize - a.effectSize)
    .slice(0, 5); // Cap at 5 cascades to keep review focused
}

async function reviewWithClaude(
  request: PRReviewRequest,
  anthropicApiKey: string,
  brainContext: string
): Promise<PRReviewResult> {
  const focusAreas = request.focus?.join(', ') || 'security, performance, correctness, tests';
  const prompt = `You are an expert senior software engineer performing a thorough code review within NexusBrain's cognitive stack.

${brainContext}

⚡ IMPORTANT CONTEXT — BUSINESS CAUSAL IMPACT:
The Brain's causal graph (built from ${new Date().getFullYear()} of historical data) shows that
engineering changes causally affect downstream business metrics. As you review this PR,
consider that code quality issues, missing tests, or risky refactors in the engineering
domain have measurable causal effects on customer satisfaction, revenue, and operational
stability (captured in the Brain Context above). Flag issues that could cause cascading
downstream harm — not just technical debt.

Review the following code diff with focus on: ${focusAreas}

PR Title: ${request.title || 'Untitled PR'}
Description: ${request.description || 'No description'}
Target Branch: ${request.targetBranch || 'main'}
Languages: ${request.languages?.join(', ') || 'auto-detect'}
${request.changedFiles?.length ? `\nFiles changed: ${request.changedFiles.slice(0, 20).join(', ')}` : ''}

DIFF:
\`\`\`diff
${request.diff.slice(0, 8000)}
\`\`\`

Provide a comprehensive code review. Return ONLY valid JSON:
{
  "overallScore": 85,
  "approved": true,
  "summary": "Well-structured PR with minor security concern in auth middleware...",
  "comments": [
    {
      "file": "src/auth.ts",
      "line": 42,
      "severity": "error",
      "category": "security",
      "message": "JWT token not validated before use",
      "suggestion": "Add token.verify() before accessing payload",
      "confidence": 0.95
    }
  ],
  "securityIssues": [],
  "performanceIssues": [],
  "testCoverage": {
    "hasTests": true,
    "testQuality": "adequate",
    "missingTestCases": ["Test for invalid token handling"]
  },
  "riskLevel": "medium",
  "recommendations": ["Add token validation on line 42", "Consider rate limiting auth endpoints"]
}`;

  // Route through smart model router — analysis task uses Sonnet
  const text = await callDomainLLM({ apiKey: anthropicApiKey, taskType: 'analysis', prompt });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]) as PRReviewResult;
}

function heuristicPRReview(request: PRReviewRequest, brainAttribution: any): ActionDomainResult {
  const lines = request.diff.split('\n');
  const addedLines = lines.filter(l => l.startsWith('+')).length;
  const removedLines = lines.filter(l => l.startsWith('-')).length;
  const comments: PRReviewComment[] = [];

  // Basic heuristic checks
  if (request.diff.includes('eval(') || request.diff.includes('innerHTML')) {
    comments.push({ file: 'unknown', line: 0, severity: 'critical', category: 'security', message: 'Potential XSS vulnerability detected (eval/innerHTML)', confidence: 0.8 });
  }
  if (request.diff.includes('password') && !request.diff.includes('hash')) {
    comments.push({ file: 'unknown', line: 0, severity: 'error', category: 'security', message: 'Password may not be hashed', confidence: 0.7 });
  }
  if (request.diff.includes('SELECT *')) {
    comments.push({ file: 'unknown', line: 0, severity: 'warning', category: 'performance', message: 'SELECT * is inefficient, specify columns', confidence: 0.9 });
  }

  const score = Math.max(40, 95 - comments.filter(c => c.severity === 'critical').length * 20 - comments.filter(c => c.severity === 'error').length * 10);

  const result: PRReviewResult = {
    overallScore: score,
    approved: score >= 70,
    summary: `Heuristic review: ${addedLines} lines added, ${removedLines} removed. ${comments.length} issue(s) found.`,
    comments,
    securityIssues: comments.filter(c => c.category === 'security'),
    performanceIssues: comments.filter(c => c.category === 'performance'),
    testCoverage: { hasTests: request.diff.includes('test') || request.diff.includes('spec'), testQuality: 'adequate', missingTestCases: [] },
    riskLevel: score < 60 ? 'high' : score < 80 ? 'medium' : 'low',
    recommendations: comments.map(c => c.suggestion || c.message),
  };

  return {
    type: 'pr-review',
    data: { ...result, claudePowered: false, ...brainAttribution },
    confidence: 0.6,
    narrative: result.summary,
    interventions: [],
    evidence: [{ type: 'heuristic_review', description: 'Regex-based security and performance checks', weight: 0.6 }],
  };
}

// ============================================================================
// DOMAIN 2: BOILERPLATE & SCAFFOLDING GENERATOR
// ============================================================================

export interface BoilerplateRequest {
  /** Type of scaffolding to generate */
  type: 'rest-api' | 'graphql-api' | 'microservice' | 'react-component' | 'nextjs-page' | 'cli-tool' | 'library' | 'test-suite';
  /** Service or component name */
  name: string;
  /** Target language/framework */
  language: 'typescript' | 'python' | 'go' | 'java' | 'rust';
  framework?: string;
  /** Functional requirements */
  requirements?: string;
  /** Include tests */
  includeTests?: boolean;
  /** Include Docker/CI */
  includeInfra?: boolean;
  /** Follow existing patterns in codebase */
  codebaseContext?: string;
}

export interface BoilerplateFile {
  path: string;
  content: string;
  language: string;
  description: string;
}

export interface BoilerplateResult {
  files: BoilerplateFile[];
  structure: string; // Tree view of generated structure
  setupInstructions: string[];
  estimatedLinesOfCode: number;
  patterns: string[]; // Design patterns used
  nextSteps: string[];
}

export const boilerplateScaffoldDomain = {
  id: 'boilerplate-scaffold',
  name: 'Boilerplate & Scaffolding Generator',
  description: 'Generate production-ready boilerplate with correct patterns, types, and tests',
  version: '1.0.0',
  capabilities: ['code-generation', 'scaffolding', 'pattern-enforcement'],

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as BoilerplateRequest;
    const anthropicApiKey = (ctx as any).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    const brainContext = formatBrainContextForDomain(ctx, 'engineering');
    const brainAttribution = buildBrainAttribution(ctx, 'boilerplate-scaffold');

    if (!anthropicApiKey) {
      return heuristicBoilerplate(request, brainAttribution);
    }

    try {
      const result = await generateBoilerplateWithClaude(request, anthropicApiKey, brainContext);
      return {
        type: 'boilerplate-scaffold',
        data: { ...result, claudePowered: true, ...brainAttribution },
        confidence: 0.92,
        narrative: `Generated ${result.files.length} files (~${result.estimatedLinesOfCode} lines) for ${request.name} ${request.type} using ${request.language}`,
        interventions: result.nextSteps.map((step, i) => ({
          id: `step-${i}`,
          type: 'next-step',
          description: step,
          priority: 'medium',
        })),
        evidence: [
          {
            type: 'claude_generation',
            description: `Claude generated ${result.files.length} files following ${result.patterns.join(', ')} patterns`,
            weight: 0.92,
          },
        ],
      };
    } catch (err: any) {
      console.warn('[Boilerplate] Claude failed, using heuristic:', err.message);
      return heuristicBoilerplate(request, brainAttribution);
    }
  },
};

async function generateBoilerplateWithClaude(
  request: BoilerplateRequest,
  anthropicApiKey: string,
  brainContext: string
): Promise<BoilerplateResult> {
  const prompt = `You are an expert software architect within NexusBrain's cognitive stack. Generate production-ready boilerplate code.

${brainContext}

Generate a complete ${request.type} scaffold for:
Name: ${request.name}
Language: ${request.language}
Framework: ${request.framework || 'standard'}
Requirements: ${request.requirements || 'standard REST CRUD'}
Include tests: ${request.includeTests !== false}
Include infra (Docker/CI): ${request.includeInfra || false}
Codebase context: ${request.codebaseContext || 'standard patterns'}

Return ONLY valid JSON:
{
  "files": [
    {
      "path": "src/services/${request.name.toLowerCase()}.service.ts",
      "content": "// Service implementation\\nexport class ${request.name}Service {\\n  // ...",
      "language": "typescript",
      "description": "Main service class with CRUD operations"
    }
  ],
  "structure": "src/\\n  services/\\n    ${request.name.toLowerCase()}.service.ts\\n  routes/\\n    ${request.name.toLowerCase()}.routes.ts",
  "setupInstructions": ["npm install", "npx prisma migrate dev"],
  "estimatedLinesOfCode": 250,
  "patterns": ["Repository Pattern", "Dependency Injection", "DTO Pattern"],
  "nextSteps": ["Run tests: npm test", "Add authentication middleware", "Deploy to staging"]
}`;

  // Route through smart model router — generation task uses Sonnet (8192 tokens for code)
  const text = await callDomainLLM({ apiKey: anthropicApiKey, taskType: 'generation', prompt, maxTokens: 8192 });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]) as BoilerplateResult;
}

function heuristicBoilerplate(request: BoilerplateRequest, brainAttribution: any): ActionDomainResult {
  const name = request.name;
  const nameLower = name.toLowerCase();

  const files: BoilerplateFile[] = [
    {
      path: `src/services/${nameLower}.service.ts`,
      content: `import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class ${name}Service {\n  async findAll() {\n    return [];\n  }\n\n  async findOne(id: string) {\n    return { id };\n  }\n\n  async create(data: any) {\n    return data;\n  }\n\n  async update(id: string, data: any) {\n    return { id, ...data };\n  }\n\n  async remove(id: string) {\n    return { id, deleted: true };\n  }\n}`,
      language: request.language,
      description: `${name} service with CRUD operations`,
    },
    {
      path: `src/routes/${nameLower}.routes.ts`,
      content: `import { Router } from 'express';\nimport { ${name}Service } from '../services/${nameLower}.service';\n\nexport const ${nameLower}Router = Router();\nconst service = new ${name}Service();\n\n${nameLower}Router.get('/', async (req, res) => { res.json(await service.findAll()); });\n${nameLower}Router.get('/:id', async (req, res) => { res.json(await service.findOne(req.params.id)); });\n${nameLower}Router.post('/', async (req, res) => { res.json(await service.create(req.body)); });\n${nameLower}Router.put('/:id', async (req, res) => { res.json(await service.update(req.params.id, req.body)); });\n${nameLower}Router.delete('/:id', async (req, res) => { res.json(await service.remove(req.params.id)); });`,
      language: request.language,
      description: `${name} REST routes`,
    },
  ];

  if (request.includeTests !== false) {
    files.push({
      path: `src/__tests__/${nameLower}.service.test.ts`,
      content: `import { ${name}Service } from '../services/${nameLower}.service';\n\ndescribe('${name}Service', () => {\n  let service: ${name}Service;\n\n  beforeEach(() => {\n    service = new ${name}Service();\n  });\n\n  it('should return empty array for findAll', async () => {\n    const result = await service.findAll();\n    expect(result).toEqual([]);\n  });\n});`,
      language: request.language,
      description: `${name} service tests`,
    });
  }

  const result: BoilerplateResult = {
    files,
    structure: `src/\n  services/\n    ${nameLower}.service.ts\n  routes/\n    ${nameLower}.routes.ts\n  __tests__/\n    ${nameLower}.service.test.ts`,
    setupInstructions: ['npm install', `cd src && npx ts-node services/${nameLower}.service.ts`],
    estimatedLinesOfCode: files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
    patterns: ['Service Layer Pattern', 'Route Handler Pattern'],
    nextSteps: ['Run tests: npm test', 'Add authentication', 'Deploy to staging'],
  };

  return {
    type: 'boilerplate-scaffold',
    data: { ...result, claudePowered: false, ...brainAttribution },
    confidence: 0.7,
    narrative: `Generated ${files.length} scaffold files for ${name} ${request.type}`,
    interventions: [],
    evidence: [{ type: 'heuristic_scaffold', description: 'Template-based scaffolding', weight: 0.7 }],
  };
}

// ============================================================================
// DOMAIN 3: CODEBASE Q&A
// ============================================================================

export interface CodebaseQARequest {
  /** Natural language question about the codebase */
  question: string;
  /** Code context (file contents, snippets, or search results) */
  codeContext?: string;
  /** Specific files to focus on */
  files?: string[];
  /** Maximum context to provide */
  maxContextLength?: number;
}

export interface CodebaseQAResult {
  answer: string;
  confidence: number;
  relevantFiles: string[];
  codeSnippets: Array<{
    file: string;
    snippet: string;
    relevance: string;
  }>;
  followUpQuestions: string[];
  brainInsights?: string;
}

export const codebaseQADomain = {
  id: 'codebase-qa',
  name: 'Codebase Q&A',
  description: 'Ask natural language questions about your codebase. Brain-augmented with learned patterns.',
  version: '1.0.0',
  capabilities: ['code-understanding', 'natural-language-query', 'pattern-detection'],

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as CodebaseQARequest;
    const anthropicApiKey = (ctx as any).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    const brainContext = formatBrainContextForDomain(ctx, 'engineering');
    const brainAttribution = buildBrainAttribution(ctx, 'codebase-qa');

    if (!anthropicApiKey) {
      return {
        type: 'codebase-qa',
        data: {
          answer: 'Claude API key required for Codebase Q&A. Please configure your Anthropic API key.',
          confidence: 0,
          relevantFiles: [],
          codeSnippets: [],
          followUpQuestions: [],
          claudePowered: false,
          ...brainAttribution,
        },
        confidence: 0,
        narrative: 'API key required',
        interventions: [],
        evidence: [],
      };
    }

    try {
      const result = await answerWithClaude(request, anthropicApiKey, brainContext);
      return {
        type: 'codebase-qa',
        data: { ...result, claudePowered: true, ...brainAttribution },
        confidence: result.confidence,
        narrative: result.answer.slice(0, 200),
        interventions: result.followUpQuestions.map((q, i) => ({
          id: `followup-${i}`,
          type: 'follow-up-question',
          description: q,
          priority: 'low',
        })),
        evidence: [
          {
            type: 'claude_qa',
            description: `Claude answered question about ${result.relevantFiles.length} files`,
            weight: result.confidence,
          },
        ],
      };
    } catch (err: any) {
      console.warn('[Codebase Q&A] Claude failed:', err.message);
      return {
        type: 'codebase-qa',
        data: { answer: `Unable to answer: ${err.message}`, confidence: 0, relevantFiles: [], codeSnippets: [], followUpQuestions: [], claudePowered: false, ...brainAttribution },
        confidence: 0,
        narrative: 'Q&A failed',
        interventions: [],
        evidence: [],
      };
    }
  },
};

async function answerWithClaude(
  request: CodebaseQARequest,
  anthropicApiKey: string,
  brainContext: string
): Promise<CodebaseQAResult> {
  const contextSnippet = request.codeContext
    ? request.codeContext.slice(0, request.maxContextLength ?? 6000)
    : '(no code context provided)';

  const prompt = `You are an expert software engineer with deep codebase knowledge, operating within NexusBrain's cognitive stack.

${brainContext}

Answer the following question about this codebase:
QUESTION: ${request.question}

CODE CONTEXT:
\`\`\`
${contextSnippet}
\`\`\`

Provide a thorough, accurate answer. Return ONLY valid JSON:
{
  "answer": "The authentication system uses JWT tokens stored in...",
  "confidence": 0.88,
  "relevantFiles": ["src/auth/jwt.service.ts", "src/middleware/auth.middleware.ts"],
  "codeSnippets": [
    {
      "file": "src/auth/jwt.service.ts",
      "snippet": "export function verifyToken(token: string) {\\n  return jwt.verify(token, SECRET);\\n}",
      "relevance": "Core JWT verification function"
    }
  ],
  "followUpQuestions": [
    "How is the JWT secret managed in production?",
    "Are refresh tokens implemented?"
  ],
  "brainInsights": "Brain pattern: JWT expiry mismatches caused 3 incidents in last 90 days"
}`;

  // Route through smart model router — reasoning task uses Sonnet
  const text = await callDomainLLM({ apiKey: anthropicApiKey, taskType: 'reasoning', prompt });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]) as CodebaseQAResult;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ALL_MISSING_SWE_DOMAINS = [
  prReviewDomain,
  boilerplateScaffoldDomain,
  codebaseQADomain,
];
