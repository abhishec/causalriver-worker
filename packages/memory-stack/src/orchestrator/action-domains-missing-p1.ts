/**
 * Missing P1 SE-aaS Domains — Gap Closure
 * =========================================
 *
 * From the CTO spec, these 4 domains were specified but not yet built:
 *
 * 1. Dependency Upgrade Assistant (1.4)
 * 2. HLD/LLD Document Generator (1.5)
 * 3. Performance Profiler (3.4)
 * 4. Dead Code Detector (4.3)
 *
 * All are Brain-augmented Claude domains following the same pattern
 * as the existing 8 SE-aaS domains.
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import type { ActionDomainDefinition } from './action-domain-registry';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';

/**
 * Adapter: converts registry-format execution context
 * to legacy P1 ActionDomainContext for backward compatibility.
 */
function adaptContext(ctx: any): ActionDomainContext {
  return {
    input: ctx.brain?.query || ctx.input || {},
    brain: ctx.brain || {},
    organizationId: ctx.brain?.organizationId || '',
    supabase: ctx.brain?.supabase || null,
  };
}

/**
 * Wraps a P1 domain execute function with registry-compatible signature.
 * Adapts context and ensures result has `drivers` + `modulesUsed` fields.
 */
function wrapExecute(executeFn: (ctx: ActionDomainContext) => Promise<ActionDomainResult>): any {
  return async (ctx: any) => {
    const result = await executeFn(adaptContext(ctx));
    return {
      ...result,
      drivers: result.drivers || [],
      modulesUsed: result.modulesUsed || [],
    };
  };
}

/** Wraps a formatForPrompt with registry-compatible signature */
function wrapFormat(fn: (data: any) => string): any {
  return (result: any, _ctx: any) => fn(result?.data || result || {});
}

// ============================================================================
// 1.4 DEPENDENCY UPGRADE ASSISTANT
// ============================================================================

export interface DependencyUpgradeRequest {
  /** Package manifest (package.json, requirements.txt, go.mod, etc.) */
  manifest: string;
  /** Lock file contents (optional) */
  lockFile?: string;
  /** Language/ecosystem */
  ecosystem: 'npm' | 'pip' | 'go' | 'maven' | 'cargo' | 'other';
  /** Current codebase for breaking change analysis */
  sourceCode?: string;
  /** Anthropic API key for Claude analysis */
  anthropicApiKey?: string;
}

export interface DependencyUpgradeResult {
  /** Outdated dependencies found */
  outdated: OutdatedDependency[];
  /** Breaking changes in upgrades */
  breakingChanges: BreakingChange[];
  /** Generated migration code */
  migrationSteps: MigrationStep[];
  /** Security vulnerabilities in current versions */
  securityIssues: SecurityVulnerability[];
  /** Recommended upgrade order (dependency-aware) */
  upgradeOrder: string[];
  /** Overall risk score (0-100) */
  upgradeRiskScore: number;
  claudePowered: boolean;
}

interface OutdatedDependency {
  name: string;
  currentVersion: string;
  latestVersion: string;
  semverJump: 'patch' | 'minor' | 'major';
  ageMonths: number;
  hasBreakingChanges: boolean;
  securityAdvisories: number;
}

interface BreakingChange {
  dependency: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  affectedApis: string[];
  migrationEffort: 'trivial' | 'moderate' | 'significant';
}

interface MigrationStep {
  order: number;
  dependency: string;
  action: string;
  code?: string;
  testCommand?: string;
}

interface SecurityVulnerability {
  dependency: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cve?: string;
  description: string;
  fixedInVersion: string;
}

export const dependencyUpgradeDomain = {
  name: 'dependency-upgrade',
  description: 'Analyze outdated dependencies, identify breaking changes, and generate migration code',

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as DependencyUpgradeRequest;
    const anthropicApiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string | undefined;

    let result: DependencyUpgradeResult;

    if (anthropicApiKey) {
      try {
        result = await analyzeDependenciesWithClaude(request, ctx);
      } catch {
        result = analyzeDependenciesHeuristic(request);
      }
    } else {
      result = analyzeDependenciesHeuristic(request);
    }

    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'dependency-upgrade');

    return {
      type: 'dependency-upgrade',
      data: { ...result, ...brainAttribution },
      confidence: result.claudePowered ? 0.85 : 0.6,
      narrative: `Found ${result.outdated.length} outdated dependencies (${result.securityIssues.length} security issues). ` +
        `${result.breakingChanges.length} breaking changes identified. Upgrade risk: ${result.upgradeRiskScore}/100.`,
      interventions: result.securityIssues
        .filter(s => s.severity === 'critical')
        .map(s => ({
          type: 'security_upgrade',
          description: `Critical: Upgrade ${s.dependency} to ${s.fixedInVersion} (${s.cve || 'security fix'})`,
          priority: 'critical' as const,
        })),
      evidence: [],
    };
  },
};

async function analyzeDependenciesWithClaude(
  request: DependencyUpgradeRequest,
  ctx: ActionDomainContext
): Promise<DependencyUpgradeResult> {
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'dependency-upgrade');
  const apiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string;

  const prompt = `You are an expert dependency management engineer operating within NexusBrain's cognitive stack. Analyze this ${request.ecosystem} project's dependencies and provide a comprehensive upgrade analysis.
${brainSection}

## Package Manifest:
\`\`\`
${request.manifest.slice(0, 5000)}
\`\`\`

${request.lockFile ? `## Lock File (first 2000 chars):\n\`\`\`\n${request.lockFile.slice(0, 2000)}\n\`\`\`\n` : ''}
${request.sourceCode ? `## Source Code (first 3000 chars):\n\`\`\`\n${request.sourceCode.slice(0, 3000)}\n\`\`\`\n` : ''}

Return JSON:
{
  "outdated": [{"name":"pkg","currentVersion":"1.0","latestVersion":"2.0","semverJump":"major","ageMonths":12,"hasBreakingChanges":true,"securityAdvisories":0}],
  "breakingChanges": [{"dependency":"pkg","fromVersion":"1.0","toVersion":"2.0","description":"...","affectedApis":["api1"],"migrationEffort":"moderate"}],
  "migrationSteps": [{"order":1,"dependency":"pkg","action":"...","code":"...","testCommand":"npm test"}],
  "securityIssues": [{"dependency":"pkg","severity":"high","cve":"CVE-2024-xxx","description":"...","fixedInVersion":"1.1"}],
  "upgradeOrder": ["pkg1","pkg2"],
  "upgradeRiskScore": 45
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] || '{}');

  return { ...parsed, claudePowered: true };
}

function analyzeDependenciesHeuristic(request: DependencyUpgradeRequest): DependencyUpgradeResult {
  // Parse package.json style manifests
  const deps: OutdatedDependency[] = [];
  try {
    const manifest = JSON.parse(request.manifest);
    const allDeps = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, version] of Object.entries(allDeps)) {
      const ver = String(version).replace(/[\^~>=<]/g, '');
      deps.push({
        name,
        currentVersion: ver,
        latestVersion: ver, // Heuristic: can't know latest without registry
        semverJump: 'patch',
        ageMonths: 0,
        hasBreakingChanges: false,
        securityAdvisories: 0,
      });
    }
  } catch {
    // Not JSON, try other formats
  }

  return {
    outdated: deps,
    breakingChanges: [],
    migrationSteps: [],
    securityIssues: [],
    upgradeOrder: deps.map(d => d.name),
    upgradeRiskScore: 30,
    claudePowered: false,
  };
}

// ============================================================================
// 1.5 HLD/LLD DOCUMENT GENERATOR
// ============================================================================

export interface DesignDocRequest {
  /** Direction: forward (requirements → design) or reverse (code → design) */
  direction: 'forward' | 'reverse';
  /** For forward: requirements text */
  requirements?: string;
  /** For reverse: codebase/source code */
  sourceCode?: string;
  /** Document level */
  level: 'hld' | 'lld' | 'both';
  /** Output format */
  format?: 'markdown' | 'confluence';
  /** Anthropic API key */
  anthropicApiKey?: string;
}

export interface DesignDocResult {
  /** High-Level Design document */
  hld?: DesignDocument;
  /** Low-Level Design document */
  lld?: DesignDocument;
  /** Technical decisions requiring input */
  openDecisions: TechnicalDecision[];
  /** Architecture patterns detected */
  patterns: string[];
  /** Design quality score (0-100) */
  qualityScore: number;
  claudePowered: boolean;
}

interface DesignDocument {
  title: string;
  sections: DesignSection[];
  diagrams: DiagramSpec[];
  fullMarkdown: string;
}

interface DesignSection {
  heading: string;
  content: string;
  subsections?: DesignSection[];
}

interface DiagramSpec {
  type: 'component' | 'sequence' | 'data_flow' | 'er' | 'class' | 'deployment';
  title: string;
  mermaidCode: string;
}

interface TechnicalDecision {
  question: string;
  options: string[];
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
}

export const designDocGeneratorDomain = {
  name: 'design-doc-generator',
  description: 'Generate HLD/LLD documents from requirements (forward) or code (reverse)',

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as DesignDocRequest;
    const anthropicApiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string | undefined;

    let result: DesignDocResult;

    if (anthropicApiKey) {
      try {
        result = await generateDesignDocWithClaude(request, ctx);
      } catch {
        result = generateDesignDocHeuristic(request);
      }
    } else {
      result = generateDesignDocHeuristic(request);
    }

    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'design-doc-generator');

    return {
      type: 'design-doc-generator',
      data: { ...result, ...brainAttribution },
      confidence: result.claudePowered ? 0.9 : 0.5,
      narrative: `Generated ${result.hld ? 'HLD' : ''}${result.hld && result.lld ? ' + ' : ''}${result.lld ? 'LLD' : ''} document. ` +
        `${result.openDecisions.length} open decisions. Quality score: ${result.qualityScore}/100.`,
      interventions: result.openDecisions
        .filter(d => d.impact === 'high')
        .map(d => ({
          type: 'design_decision',
          description: d.question,
          priority: 'high' as const,
        })),
      evidence: [],
    };
  },
};

async function generateDesignDocWithClaude(
  request: DesignDocRequest,
  ctx: ActionDomainContext
): Promise<DesignDocResult> {
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'design-doc-generator');
  const apiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string;

  const directionPrompt = request.direction === 'forward'
    ? `Generate ${request.level === 'both' ? 'HLD and LLD' : request.level.toUpperCase()} from these requirements:\n\n${request.requirements?.slice(0, 6000)}`
    : `Reverse-engineer ${request.level === 'both' ? 'HLD and LLD' : request.level.toUpperCase()} from this codebase:\n\n\`\`\`\n${request.sourceCode?.slice(0, 8000)}\n\`\`\``;

  const prompt = `You are an expert software architect operating within NexusBrain's cognitive stack. ${directionPrompt}
${brainSection}

Return JSON:
{
  "hld": {"title":"...","sections":[{"heading":"System Context","content":"..."}],"diagrams":[{"type":"component","title":"...","mermaidCode":"graph TD; A-->B"}],"fullMarkdown":"# HLD..."},
  "lld": {"title":"...","sections":[{"heading":"Class Design","content":"..."}],"diagrams":[{"type":"class","title":"...","mermaidCode":"classDiagram..."}],"fullMarkdown":"# LLD..."},
  "openDecisions": [{"question":"...","options":["A","B"],"recommendation":"A","impact":"high"}],
  "patterns": ["MVC","REST"],
  "qualityScore": 85
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] || '{}');

  return { ...parsed, claudePowered: true };
}

function generateDesignDocHeuristic(request: DesignDocRequest): DesignDocResult {
  const sections: DesignSection[] = [
    { heading: 'Overview', content: 'Design document generated from analysis.' },
    { heading: 'Architecture', content: request.direction === 'forward' ? 'Derived from requirements.' : 'Reverse-engineered from code.' },
  ];

  return {
    hld: request.level !== 'lld' ? { title: 'High-Level Design', sections, diagrams: [], fullMarkdown: '# HLD\n\n(Claude API key required for full generation)' } : undefined,
    lld: request.level !== 'hld' ? { title: 'Low-Level Design', sections, diagrams: [], fullMarkdown: '# LLD\n\n(Claude API key required for full generation)' } : undefined,
    openDecisions: [],
    patterns: [],
    qualityScore: 20,
    claudePowered: false,
  };
}

// ============================================================================
// 3.4 PERFORMANCE PROFILER
// ============================================================================

export interface PerformanceProfileRequest {
  /** APM/trace data (JSON or structured) */
  traceData?: string;
  /** Slow endpoints to analyze */
  endpoints?: EndpointMetric[];
  /** Database query performance data */
  queryMetrics?: QueryMetric[];
  /** Source code of slow functions */
  sourceCode?: string;
  /** Anthropic API key */
  anthropicApiKey?: string;
}

interface EndpointMetric {
  path: string;
  method: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  requestsPerSecond: number;
  errorRate: number;
}

interface QueryMetric {
  query: string;
  avgMs: number;
  maxMs: number;
  callCount: number;
  isSlowQuery: boolean;
}

export interface PerformanceProfileResult {
  /** Identified bottlenecks */
  bottlenecks: PerformanceBottleneck[];
  /** Optimization suggestions */
  optimizations: PerformanceOptimization[];
  /** Overall performance score (0-100) */
  performanceScore: number;
  /** Estimated improvement if all optimizations applied */
  estimatedImprovement: string;
  /** SLA risk assessment */
  slaRisk: 'safe' | 'at_risk' | 'breaching';
  claudePowered: boolean;
}

interface PerformanceBottleneck {
  location: string;
  type: 'endpoint' | 'database' | 'computation' | 'network' | 'memory';
  severity: 'critical' | 'high' | 'medium' | 'low';
  latencyMs: number;
  description: string;
  impact: string;
}

interface PerformanceOptimization {
  target: string;
  strategy: string;
  estimatedSpeedupPercent: number;
  effort: 'trivial' | 'moderate' | 'significant';
  code?: string;
}

export const performanceProfilerDomain = {
  name: 'performance-profiler',
  description: 'Analyze APM data, identify bottlenecks, and suggest performance optimizations',

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as PerformanceProfileRequest;
    const anthropicApiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string | undefined;

    let result: PerformanceProfileResult;

    if (anthropicApiKey) {
      try {
        result = await profileWithClaude(request, ctx);
      } catch {
        result = profileHeuristic(request);
      }
    } else {
      result = profileHeuristic(request);
    }

    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'performance-profiler');

    return {
      type: 'performance-profiler',
      data: { ...result, ...brainAttribution },
      confidence: result.claudePowered ? 0.85 : 0.6,
      narrative: `Identified ${result.bottlenecks.length} bottlenecks. Performance score: ${result.performanceScore}/100. ` +
        `${result.optimizations.length} optimizations suggested. SLA: ${result.slaRisk}.`,
      interventions: result.bottlenecks
        .filter(b => b.severity === 'critical')
        .map(b => ({
          type: 'performance_fix',
          description: `${b.type} bottleneck at ${b.location}: ${b.description}`,
          priority: 'critical' as const,
        })),
      evidence: [],
    };
  },
};

async function profileWithClaude(
  request: PerformanceProfileRequest,
  ctx: ActionDomainContext
): Promise<PerformanceProfileResult> {
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'performance-profiler');
  const apiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string;

  const endpointSection = request.endpoints?.length
    ? `## Endpoint Metrics:\n${request.endpoints.map(e => `${e.method} ${e.path}: p50=${e.p50Ms}ms p95=${e.p95Ms}ms p99=${e.p99Ms}ms rps=${e.requestsPerSecond} err=${e.errorRate}`).join('\n')}`
    : '';

  const querySection = request.queryMetrics?.length
    ? `## Slow Queries:\n${request.queryMetrics.filter(q => q.isSlowQuery).map(q => `avg=${q.avgMs}ms max=${q.maxMs}ms calls=${q.callCount}: ${q.query.slice(0, 200)}`).join('\n')}`
    : '';

  const prompt = `You are an expert performance engineer operating within NexusBrain's cognitive stack. Analyze the following performance data and identify bottlenecks.
${brainSection}

${endpointSection}
${querySection}
${request.traceData ? `## Trace Data:\n${request.traceData.slice(0, 4000)}` : ''}
${request.sourceCode ? `## Source Code:\n\`\`\`\n${request.sourceCode.slice(0, 4000)}\n\`\`\`` : ''}

Return JSON:
{
  "bottlenecks": [{"location":"...","type":"endpoint","severity":"high","latencyMs":500,"description":"...","impact":"..."}],
  "optimizations": [{"target":"...","strategy":"...","estimatedSpeedupPercent":40,"effort":"moderate","code":"..."}],
  "performanceScore": 65,
  "estimatedImprovement": "~45% latency reduction",
  "slaRisk": "at_risk"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] || '{}');

  return { ...parsed, claudePowered: true };
}

function profileHeuristic(request: PerformanceProfileRequest): PerformanceProfileResult {
  const bottlenecks: PerformanceBottleneck[] = [];

  // Analyze endpoints
  for (const endpoint of request.endpoints ?? []) {
    if (endpoint.p95Ms > 1000) {
      bottlenecks.push({
        location: `${endpoint.method} ${endpoint.path}`,
        type: 'endpoint',
        severity: endpoint.p95Ms > 5000 ? 'critical' : endpoint.p95Ms > 2000 ? 'high' : 'medium',
        latencyMs: endpoint.p95Ms,
        description: `p95 latency ${endpoint.p95Ms}ms exceeds threshold`,
        impact: `${endpoint.requestsPerSecond} req/s affected`,
      });
    }
  }

  // Analyze queries
  for (const query of request.queryMetrics ?? []) {
    if (query.isSlowQuery || query.avgMs > 500) {
      bottlenecks.push({
        location: query.query.slice(0, 80),
        type: 'database',
        severity: query.avgMs > 2000 ? 'critical' : query.avgMs > 1000 ? 'high' : 'medium',
        latencyMs: query.avgMs,
        description: `Slow query: avg ${query.avgMs}ms, ${query.callCount} calls`,
        impact: `Total: ${Math.round(query.avgMs * query.callCount / 1000)}s/day`,
      });
    }
  }

  const score = bottlenecks.length === 0 ? 90
    : bottlenecks.some(b => b.severity === 'critical') ? 30
      : bottlenecks.some(b => b.severity === 'high') ? 50
        : 70;

  return {
    bottlenecks,
    optimizations: [],
    performanceScore: score,
    estimatedImprovement: 'Claude API key required for optimization suggestions',
    slaRisk: score < 50 ? 'breaching' : score < 70 ? 'at_risk' : 'safe',
    claudePowered: false,
  };
}

// ============================================================================
// 4.3 DEAD CODE DETECTOR
// ============================================================================

export interface DeadCodeRequest {
  /** Source code to analyze */
  sourceCode: string;
  /** Language */
  language: string;
  /** Entry points (main files, route handlers, exports) */
  entryPoints?: string[];
  /** Import/export analysis data */
  importMap?: Record<string, string[]>;
  /** Anthropic API key */
  anthropicApiKey?: string;
}

export interface DeadCodeResult {
  /** Unreachable functions/methods */
  unreachableFunctions: DeadCodeItem[];
  /** Unused imports */
  unusedImports: DeadCodeItem[];
  /** Unused variables */
  unusedVariables: DeadCodeItem[];
  /** Unused exports */
  unusedExports: DeadCodeItem[];
  /** Dead files (not imported anywhere) */
  deadFiles: string[];
  /** Total dead code lines */
  totalDeadLines: number;
  /** Dead code percentage */
  deadCodePercentage: number;
  /** Safe removal confidence */
  safeRemovalConfidence: number;
  claudePowered: boolean;
}

interface DeadCodeItem {
  name: string;
  file?: string;
  line?: number;
  type: 'function' | 'class' | 'variable' | 'import' | 'export' | 'file';
  confidence: number;
  safeToRemove: boolean;
  reason: string;
}

export const deadCodeDetectorDomain = {
  name: 'dead-code-detector',
  description: 'Identify unreachable code, unused imports, and dead files for safe removal',

  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as DeadCodeRequest;
    const anthropicApiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string | undefined;

    let result: DeadCodeResult;

    if (anthropicApiKey) {
      try {
        result = await detectDeadCodeWithClaude(request, ctx);
      } catch {
        result = detectDeadCodeHeuristic(request);
      }
    } else {
      result = detectDeadCodeHeuristic(request);
    }

    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'dead-code-detector');

    return {
      type: 'dead-code-detector',
      data: { ...result, ...brainAttribution },
      confidence: result.claudePowered ? 0.85 : 0.6,
      narrative: `Found ${result.unreachableFunctions.length} unreachable functions, ` +
        `${result.unusedImports.length} unused imports, ${result.unusedVariables.length} unused variables. ` +
        `${result.deadCodePercentage.toFixed(1)}% dead code (${result.totalDeadLines} lines). ` +
        `Safe removal confidence: ${Math.round(result.safeRemovalConfidence * 100)}%.`,
      interventions: result.deadFiles.map(f => ({
        type: 'dead_code_removal',
        description: `Dead file: ${f} (not imported anywhere)`,
        priority: 'low' as const,
      })),
      evidence: [],
    };
  },
};

async function detectDeadCodeWithClaude(
  request: DeadCodeRequest,
  ctx: ActionDomainContext
): Promise<DeadCodeResult> {
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'dead-code-detector');
  const apiKey = (ctx.input as Record<string, unknown>)?.anthropicApiKey as string;

  const prompt = `You are an expert code quality engineer operating within NexusBrain's cognitive stack. Analyze this ${request.language} code for dead code, unused imports, unreachable functions, and unnecessary complexity.
${brainSection}

## Source Code:
\`\`\`${request.language}
${request.sourceCode.slice(0, 8000)}
\`\`\`

${request.entryPoints?.length ? `## Entry Points: ${request.entryPoints.join(', ')}` : ''}

Return JSON:
{
  "unreachableFunctions": [{"name":"fn","file":"...","line":10,"type":"function","confidence":0.9,"safeToRemove":true,"reason":"Never called from any entry point"}],
  "unusedImports": [{"name":"pkg","file":"...","line":1,"type":"import","confidence":0.95,"safeToRemove":true,"reason":"Imported but never referenced"}],
  "unusedVariables": [{"name":"x","file":"...","line":5,"type":"variable","confidence":0.9,"safeToRemove":true,"reason":"Assigned but never read"}],
  "unusedExports": [{"name":"fn","file":"...","line":20,"type":"export","confidence":0.7,"safeToRemove":false,"reason":"Exported but no internal consumers found"}],
  "deadFiles": ["old-util.ts"],
  "totalDeadLines": 150,
  "deadCodePercentage": 12.5,
  "safeRemovalConfidence": 0.85
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] || '{}');

  return { ...parsed, claudePowered: true };
}

function detectDeadCodeHeuristic(request: DeadCodeRequest): DeadCodeResult {
  const lines = request.sourceCode.split('\n');
  const totalLines = lines.length;

  // Simple heuristic: find unused imports
  const unusedImports: DeadCodeItem[] = [];
  const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from/g;
  let match;

  while ((match = importRegex.exec(request.sourceCode)) !== null) {
    const imports = match[1] ? match[1].split(',').map(s => s.trim()) : [match[2]];
    for (const imp of imports) {
      const cleanName = imp.replace(/\s+as\s+\w+/, '').trim();
      if (cleanName && !request.sourceCode.includes(cleanName + '(') && !request.sourceCode.includes(cleanName + '.')) {
        // Check if name appears only in import line
        const occurrences = request.sourceCode.split(cleanName).length - 1;
        if (occurrences <= 1) {
          unusedImports.push({
            name: cleanName,
            type: 'import',
            confidence: 0.7,
            safeToRemove: true,
            reason: 'Import appears only in import statement',
          });
        }
      }
    }
  }

  return {
    unreachableFunctions: [],
    unusedImports,
    unusedVariables: [],
    unusedExports: [],
    deadFiles: [],
    totalDeadLines: unusedImports.length,
    deadCodePercentage: totalLines > 0 ? (unusedImports.length / totalLines) * 100 : 0,
    safeRemovalConfidence: 0.5,
    claudePowered: false,
  };
}

// ============================================================================
// ACTION DOMAIN DEFINITION WRAPPERS (for registry compatibility)
// ============================================================================

/**
 * Wrap P1 domains as proper ActionDomainDefinition entries
 * so they can be registered alongside the core 35 + 7 SE domains.
 */

export const dependencyUpgradeDefinition: ActionDomainDefinition = {
  name: 'dependency-upgrade',
  description: 'Analyze outdated dependencies, identify breaking changes, generate migration code, and flag security vulnerabilities',
  brainAnalog: 'Immune System — scans for foreign/outdated dependencies like the immune system scans for pathogens',
  version: '1.0.0',
  requires: ['signalCollector'],
  optional: ['llmAmplifier', 'contextAwareReasoner'],
  intents: ['dependency-upgrade', 'audit'],
  intentKeywords: ['dependency', 'dependencies', 'upgrade', 'outdated', 'npm', 'package', 'security', 'vulnerability', 'cve', 'semver'],
  intentPatterns: [/(?:outdated|upgrade|update)\s+(?:dep|package|npm|lib)/i, /security\s+(?:vuln|audit|scan)/i],
  relevantDomains: ['engineering'],
  priority: 8,
  outputSchema: {
    dataType: 'dependency-upgrade-analysis',
    fields: ['outdated', 'breakingChanges', 'migrationSteps', 'securityIssues', 'upgradeOrder', 'upgradeRiskScore'],
    composable: true,
    consumableBy: ['code-generate', 'review-triage'],
  },
  execute: wrapExecute(dependencyUpgradeDomain.execute),
  formatForPrompt: wrapFormat((d: any) =>
    `Dependency Analysis: ${d?.outdated?.length || 0} outdated, ${d?.securityIssues?.length || 0} security issues, risk score ${d?.upgradeRiskScore || 'N/A'}/100`
  ),
};

export const designDocGeneratorDefinition: ActionDomainDefinition = {
  name: 'design-doc-generate',
  description: 'Generate High-Level Design (HLD) and Low-Level Design (LLD) documents from code or requirements',
  brainAnalog: 'Prefrontal Cortex — executive planning and abstract architectural reasoning',
  version: '1.0.0',
  requires: ['contextAwareReasoner'],
  optional: ['llmAmplifier', 'causalDAG'],
  intents: ['design-doc-generate', 'narrate'],
  intentKeywords: ['hld', 'lld', 'design', 'document', 'architecture', 'diagram', 'mermaid', 'system design', 'technical spec'],
  intentPatterns: [/(?:generate|create|write)\s+(?:hld|lld|design\s+doc)/i, /(?:architecture|system)\s+(?:doc|diagram|design)/i],
  relevantDomains: ['engineering', 'product'],
  priority: 7,
  outputSchema: {
    dataType: 'design-document',
    fields: ['title', 'overview', 'components', 'diagram', 'decisions', 'interfaces', 'patterns'],
    composable: true,
    consumableBy: ['code-generate', 'spec-completeness'],
  },
  execute: wrapExecute(designDocGeneratorDomain.execute),
  formatForPrompt: wrapFormat((d: any) =>
    `Design Doc: ${d?.title || 'Untitled'} — ${d?.components?.length || 0} components, ${d?.decisions?.length || 0} technical decisions`
  ),
};

export const performanceProfilerDefinition: ActionDomainDefinition = {
  name: 'performance-profile',
  description: 'Analyze APM data to identify performance bottlenecks, SLA risks, and optimization opportunities',
  brainAnalog: 'Sensory Cortex — perceives system performance characteristics and detects degradation patterns',
  version: '1.0.0',
  requires: ['signalCollector', 'anomalyDetector'],
  optional: ['llmAmplifier', 'temporalForecaster'],
  intents: ['performance-profile', 'diagnose', 'optimize'],
  intentKeywords: ['performance', 'latency', 'throughput', 'bottleneck', 'slow', 'apm', 'sla', 'p99', 'p50', 'response time'],
  intentPatterns: [/(?:performance|latency|throughput)\s+(?:issue|problem|bottleneck|analysis)/i, /(?:slow|degrad)/i],
  relevantDomains: ['engineering'],
  priority: 9,
  outputSchema: {
    dataType: 'performance-profile',
    fields: ['bottlenecks', 'slaStatus', 'optimizations', 'endpointBreakdown', 'queryAnalysis'],
    composable: true,
    consumableBy: ['diagnose', 'optimize', 'monitor'],
  },
  execute: wrapExecute(performanceProfilerDomain.execute),
  formatForPrompt: wrapFormat((d: any) =>
    `Performance Profile: ${d?.bottlenecks?.length || 0} bottlenecks found, SLA status: ${d?.slaStatus || 'unknown'}`
  ),
};

export const deadCodeDetectorDefinition: ActionDomainDefinition = {
  name: 'dead-code-detect',
  description: 'Identify unreachable functions, unused imports, dead files, and calculate safe removal candidates',
  brainAnalog: 'Autophagy System — cellular self-cleaning that removes damaged/unused components',
  version: '1.0.0',
  requires: ['signalCollector'],
  optional: ['llmAmplifier', 'contextAwareReasoner'],
  intents: ['dead-code-detect', 'audit'],
  intentKeywords: ['dead code', 'unused', 'unreachable', 'cleanup', 'remove', 'orphan', 'import'],
  intentPatterns: [/(?:dead|unused|unreachable)\s+(?:code|function|import|variable)/i, /code\s+cleanup/i],
  relevantDomains: ['engineering'],
  priority: 6,
  outputSchema: {
    dataType: 'dead-code-analysis',
    fields: ['unreachableFunctions', 'unusedImports', 'unusedVariables', 'unusedExports', 'deadFiles', 'deadCodePercentage'],
    composable: true,
    consumableBy: ['code-generate', 'review-triage'],
  },
  execute: wrapExecute(deadCodeDetectorDomain.execute),
  formatForPrompt: wrapFormat((d: any) =>
    `Dead Code: ${d?.deadCodePercentage?.toFixed(1) || 0}% dead code, ${d?.unreachableFunctions?.length || 0} unreachable functions, ${d?.unusedImports?.length || 0} unused imports`
  ),
};

/** All 4 P1 gap-closure domains as proper ActionDomainDefinitions */
export const ALL_P1_DOMAINS: ActionDomainDefinition[] = [
  dependencyUpgradeDefinition,
  designDocGeneratorDefinition,
  performanceProfilerDefinition,
  deadCodeDetectorDefinition,
];

/**
 * Register all 4 P1 domains into a registry.
 *
 * @example
 * ```typescript
 * import { registerP1Domains } from './action-domains-missing-p1';
 * const registry = createActionDomainRegistry();
 * registerP1Domains(registry); // +4 domains
 * ```
 */
export function registerP1Domains(
  registry: { register: (def: ActionDomainDefinition) => void },
): void {
  for (const domain of ALL_P1_DOMAINS) {
    registry.register(domain);
  }
}
