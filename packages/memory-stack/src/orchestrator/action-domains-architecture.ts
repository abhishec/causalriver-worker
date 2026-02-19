/**
 * Architecture Extractor Domain (P1-15)
 * ======================================
 *
 * Extracts and visualizes system architecture from codebase context using
 * **Claude LLM** for intelligent service graph construction.
 *
 * **Cognitive Analog:** Cartographer (mapping uncharted territory from raw signals)
 *
 * **Capabilities:**
 * - Parse codebase / repo listing to identify all services and modules
 * - Map inter-service dependencies and data flows
 * - Generate Mermaid service graph (flowchart) and sequence diagram
 * - Identify tech stack, external integrations, and module ownership
 * - Surface architecture risks: SPOFs, tight coupling, missing error boundaries
 * - **Claude-powered**: Uses Claude API for accurate extraction
 *
 * **Integrates with:**
 * - Brain context (org-level service knowledge)
 * - **Claude LLM API** for extraction quality
 * - Kubernetes manifests, Dockerfiles, CI/CD configs
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { callDomainLLM } from './domain-llm-client';

// ============================================================================
// TYPES
// ============================================================================

export interface ArchitectureExtractRequest {
  /** File tree or repo listing */
  codebaseContext?: string;
  /** GitHub repo URL */
  repositoryUrl?: string;
  /** List of service file paths */
  serviceFiles?: string[];
  /** Kubernetes YAML content */
  kubernetesManifests?: string;
  /** Dockerfile contents */
  dockerfiles?: string;
  /** CI/CD config (e.g. GitHub Actions) */
  cicdConfigs?: string;
  /** Primary language of the codebase */
  language?: string;
  /** Aspect of architecture to focus on — default 'full' */
  focusArea?: 'full' | 'services' | 'data-flow' | 'dependencies' | 'ownership';
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface ServiceNode {
  name: string;
  type: 'api' | 'worker' | 'database' | 'queue' | 'cache' | 'frontend' | 'gateway' | 'unknown';
  language?: string;
  port?: number;
  /** Names of services this node depends on */
  dependencies: string[];
  /** Names of services that depend on this node */
  dependents: string[];
  ownerTeam?: string;
  description?: string;
}

export interface DataFlow {
  from: string;
  to: string;
  mechanism: 'http' | 'grpc' | 'kafka' | 'database' | 'queue' | 'websocket' | 'unknown';
  dataType?: string;
  async: boolean;
}

export interface ArchitectureExtractResult {
  services: ServiceNode[];
  dataFlows: DataFlow[];
  /** Mermaid flowchart of service dependencies */
  mermaidServiceGraph: string;
  /** Mermaid sequence diagram of data flows */
  mermaidDataFlow: string;
  /** service -> owner team */
  moduleOwnershipMap: Record<string, string>;
  externalIntegrations: Array<{ name: string; type: string; description: string }>;
  techStack: Array<{ name: string; version?: string; purpose: string }>;
  /** Key observations about the architecture */
  architectureInsights: string[];
  riskAreas: Array<{ area: string; risk: string; severity: 'high' | 'medium' | 'low' }>;
  summary: string;
  claudePowered: boolean;
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Architecture Extractor Domain
 *
 * Uses **Claude LLM** to extract and map system architecture intelligently.
 */
export const architectureExtractorDomain = {
  name: 'architecture-extractor' as const,
  description: 'Extract and visualise system architecture from codebase context with Claude LLM',
  cognitiveAnalog: 'Cartographer — mapping uncharted territory from raw signals',
  requires: ['claudeLLM', 'brainContext'] as const,

  /**
   * Execute architecture extraction
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as ArchitectureExtractRequest;

    // 1. Extract architecture with Claude or fallback
    const result = request.anthropicApiKey
      ? await extractWithClaude(request, ctx)
      : await extractWithHeuristics(request);

    // 2. Build Brain attribution
    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'architecture-extractor');

    // 3. Map high-severity risk areas to interventions
    const interventions = extractInterventions(result);

    // 4. Build narrative
    const techStackNames = result.techStack.map((t) => t.name).slice(0, 5).join(', ');
    const narrative =
      `Extracted ${result.services.length} services with ${result.dataFlows.length} data flows. ` +
      `Tech stack: ${techStackNames || 'unknown'}. ` +
      `${result.riskAreas.length} risk area${result.riskAreas.length !== 1 ? 's' : ''} identified.`;

    return {
      type: 'architecture-extractor',
      data: { ...result, ...brainAttribution },
      confidence: result.claudePowered ? 0.88 : 0.45,
      narrative,
      interventions,
      evidence: [
        {
          type: 'service_graph',
          description: `Mapped ${result.services.length} services and ${result.dataFlows.length} data flows`,
          weight: 1.0,
        },
        {
          type: 'claude_extraction',
          description: result.claudePowered
            ? 'Architecture extraction powered by Claude LLM for maximum accuracy'
            : 'Architecture extraction using heuristics',
          weight: result.claudePowered ? 1.0 : 0.5,
        },
        {
          type: 'risk_analysis',
          description: `${result.riskAreas.filter((r) => r.severity === 'high').length} high-severity risk areas surfaced`,
          weight: 0.85,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE LLM EXTRACTION
// ============================================================================

/**
 * Extract architecture using Claude LLM
 */
async function extractWithClaude(
  request: ArchitectureExtractRequest,
  ctx: ActionDomainContext
): Promise<ArchitectureExtractResult> {
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'architecture-extractor');
  const focusArea = request.focusArea || 'full';

  const prompt = `You are an expert Software Architect operating within NexusBrain's cognitive stack. \
Your task is to extract and map the system architecture from the provided codebase context.
${brainSection}

## Focus Area: ${focusArea}

## Inputs Provided:
${request.codebaseContext ? `### Codebase Context / File Tree:\n\`\`\`\n${request.codebaseContext}\n\`\`\`\n` : ''}
${request.repositoryUrl ? `### Repository URL: ${request.repositoryUrl}\n` : ''}
${request.serviceFiles?.length ? `### Service Files:\n${request.serviceFiles.join('\n')}\n` : ''}
${request.kubernetesManifests ? `### Kubernetes Manifests:\n\`\`\`yaml\n${request.kubernetesManifests}\n\`\`\`\n` : ''}
${request.dockerfiles ? `### Dockerfiles:\n\`\`\`\n${request.dockerfiles}\n\`\`\`\n` : ''}
${request.cicdConfigs ? `### CI/CD Configs:\n\`\`\`\n${request.cicdConfigs}\n\`\`\`\n` : ''}
${request.language ? `### Primary Language: ${request.language}\n` : ''}

## Required Analysis:
1. **Services / Modules**: Identify every service, worker, database, queue, cache, frontend, or gateway.
2. **Dependencies**: Map which services depend on which others (directed edges).
3. **Data Flows**: Identify how data moves between services (HTTP, gRPC, Kafka, DB reads, etc.).
4. **Mermaid Service Graph**: Generate a valid \`graph LR\` Mermaid flowchart showing service dependencies.
5. **Mermaid Sequence Diagram**: Generate a valid Mermaid sequence diagram for the top 3–5 critical data flows.
6. **Tech Stack**: List frameworks, languages, databases, cloud services with purpose.
7. **External Integrations**: Third-party APIs, SaaS products, external dependencies.
8. **Module Ownership**: Map each service to an owner team where inferable.
9. **Architecture Insights**: Key observations (e.g. monolith vs microservices, async patterns, etc.).
10. **Risk Areas**: SPOFs, tight coupling, missing error boundaries, circular dependencies — rated high/medium/low.

**Output Format (JSON only, no prose outside the code block):**
\`\`\`json
{
  "services": [
    {
      "name": "api-gateway",
      "type": "gateway",
      "language": "TypeScript",
      "port": 443,
      "dependencies": ["auth-service", "product-service"],
      "dependents": [],
      "ownerTeam": "platform",
      "description": "Public-facing API gateway handling auth and routing"
    }
  ],
  "dataFlows": [
    {
      "from": "api-gateway",
      "to": "auth-service",
      "mechanism": "http",
      "dataType": "JWT token request",
      "async": false
    }
  ],
  "mermaidServiceGraph": "graph LR\\n  api-gateway --> auth-service\\n  api-gateway --> product-service",
  "mermaidDataFlow": "sequenceDiagram\\n  Client->>api-gateway: POST /login\\n  api-gateway->>auth-service: ValidateCredentials",
  "moduleOwnershipMap": {
    "api-gateway": "platform",
    "auth-service": "identity"
  },
  "externalIntegrations": [
    { "name": "Stripe", "type": "payment", "description": "Payment processing" }
  ],
  "techStack": [
    { "name": "TypeScript", "version": "5.x", "purpose": "Primary language" },
    { "name": "PostgreSQL", "version": "15", "purpose": "Primary datastore" }
  ],
  "architectureInsights": [
    "Microservices architecture with event-driven async communication via Kafka",
    "Single API gateway acts as the sole public ingress point"
  ],
  "riskAreas": [
    {
      "area": "api-gateway",
      "risk": "Single point of failure — all traffic routes through one gateway with no redundancy config observed",
      "severity": "high"
    }
  ],
  "summary": "A microservices system with 8 services communicating via HTTP and Kafka. Primary risks are the single API gateway and tight coupling between product-service and inventory-service."
}
\`\`\``;

  try {
    const response = await callDomainLLM({ apiKey: request.anthropicApiKey!, taskType: 'reasoning', prompt });
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]) as Partial<ArchitectureExtractResult>;
      return {
        services: data.services || [],
        dataFlows: data.dataFlows || [],
        mermaidServiceGraph: data.mermaidServiceGraph || buildFallbackServiceGraph(data.services || []),
        mermaidDataFlow: data.mermaidDataFlow || buildFallbackSequenceDiagram(data.dataFlows || []),
        moduleOwnershipMap: data.moduleOwnershipMap || {},
        externalIntegrations: data.externalIntegrations || [],
        techStack: data.techStack || [],
        architectureInsights: data.architectureInsights || [],
        riskAreas: data.riskAreas || [],
        summary: data.summary || 'Architecture extracted successfully.',
        claudePowered: true,
      };
    }

    // No JSON block found — fall back to heuristics
    console.warn('[architecture-extractor] No JSON block in Claude response, using heuristic fallback');
    return extractWithHeuristics(request);
  } catch (error) {
    console.warn('[architecture-extractor] Claude extraction failed, using heuristic fallback:', error);
    return extractWithHeuristics(request);
  }
}

// ============================================================================
// HEURISTIC EXTRACTION (FALLBACK)
// ============================================================================

/**
 * Extract architecture using simple regex heuristics when no API key is present
 */
async function extractWithHeuristics(request: ArchitectureExtractRequest): Promise<ArchitectureExtractResult> {
  const services: ServiceNode[] = [];
  const context = [
    request.codebaseContext || '',
    (request.serviceFiles || []).join('\n'),
    request.kubernetesManifests || '',
    request.dockerfiles || '',
  ].join('\n');

  if (context.trim()) {
    // Extract top-level directories and likely service names from the file tree
    const dirMatches = context.match(/^[├└│ ]*[\w-]+(?:\/|\\)/gm) || [];
    const seen = new Set<string>();

    for (const match of dirMatches) {
      const name = match.replace(/[├└│ \/\\]/g, '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const lowerName = name.toLowerCase();
      let type: ServiceNode['type'] = 'unknown';
      if (/api|gateway|server|service/.test(lowerName)) type = 'api';
      else if (/worker|job|consumer|processor/.test(lowerName)) type = 'worker';
      else if (/db|database|postgres|mysql|mongo/.test(lowerName)) type = 'database';
      else if (/queue|kafka|rabbit|sqs/.test(lowerName)) type = 'queue';
      else if (/cache|redis/.test(lowerName)) type = 'cache';
      else if (/web|ui|frontend|client|app/.test(lowerName)) type = 'frontend';

      services.push({
        name,
        type,
        language: request.language,
        dependencies: [],
        dependents: [],
      });
    }
  }

  // If nothing extracted, produce a placeholder
  if (services.length === 0) {
    services.push({
      name: 'unknown-service',
      type: 'unknown',
      dependencies: [],
      dependents: [],
      description: 'No services could be detected — provide more codebase context',
    });
  }

  const mermaidServiceGraph = buildFallbackServiceGraph(services);

  return {
    services,
    dataFlows: [],
    mermaidServiceGraph,
    mermaidDataFlow: 'sequenceDiagram\n  Note over System: Insufficient context for sequence diagram',
    moduleOwnershipMap: {},
    externalIntegrations: [],
    techStack: request.language ? [{ name: request.language, purpose: 'Primary language' }] : [],
    architectureInsights: [
      'Heuristic extraction only — provide an Anthropic API key for full Claude-powered analysis',
    ],
    riskAreas: [],
    summary: `Heuristic extraction identified ${services.length} potential service(s). Provide an Anthropic API key for a full, Claude-powered architecture map.`,
    claudePowered: false,
  };
}

// ============================================================================
// MERMAID HELPERS
// ============================================================================

/**
 * Build a basic Mermaid flowchart from a service list
 */
function buildFallbackServiceGraph(services: ServiceNode[]): string {
  if (services.length === 0) return 'graph LR\n  NoServices[No services detected]';

  const lines: string[] = ['graph LR'];
  for (const svc of services) {
    for (const dep of svc.dependencies) {
      lines.push(`  ${sanitizeMermaidId(svc.name)} --> ${sanitizeMermaidId(dep)}`);
    }
    // If no edges, at least declare the node
    if (svc.dependencies.length === 0) {
      lines.push(`  ${sanitizeMermaidId(svc.name)}[${svc.name}]`);
    }
  }
  return lines.join('\n');
}

/**
 * Build a basic Mermaid sequence diagram from data flows
 */
function buildFallbackSequenceDiagram(flows: DataFlow[]): string {
  if (flows.length === 0) return 'sequenceDiagram\n  Note over System: No data flows detected';

  const lines: string[] = ['sequenceDiagram'];
  for (const flow of flows.slice(0, 5)) {
    const arrow = flow.async ? '-)>' : '->>';
    const label = flow.dataType || flow.mechanism;
    lines.push(`  ${sanitizeMermaidId(flow.from)}${arrow}${sanitizeMermaidId(flow.to)}: ${label}`);
  }
  return lines.join('\n');
}

/** Sanitise a string for use as a Mermaid node ID */
function sanitizeMermaidId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ============================================================================
// INTERVENTIONS
// ============================================================================

/**
 * Map high-severity risk areas to domain interventions
 */
function extractInterventions(result: ArchitectureExtractResult): any[] {
  const interventions: any[] = [];

  const highRisks = result.riskAreas.filter((r) => r.severity === 'high');

  for (const risk of highRisks) {
    interventions.push({
      action: `Resolve high-severity architecture risk in "${risk.area}": ${risk.risk}`,
      targetDomains: ['architecture', 'engineering'],
      confidence: 0.85,
      owner: result.moduleOwnershipMap[risk.area] || 'engineering',
      priority: 'high',
    });
  }

  // Surface a general review if there are medium risks and no high risks
  if (highRisks.length === 0 && result.riskAreas.some((r) => r.severity === 'medium')) {
    interventions.push({
      action: 'Review medium-severity architecture risks and prioritise remediation',
      targetDomains: ['architecture'],
      confidence: 0.7,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  return interventions;
}
