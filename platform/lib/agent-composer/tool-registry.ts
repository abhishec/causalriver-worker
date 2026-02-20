/**
 * Unified Tool Registry — Enumerates all available capabilities
 * ==============================================================
 *
 * The Agent Composer uses this registry to select relevant tools
 * when composing an agent from natural language. Each entry is a
 * standardized descriptor that the LLM can reason about.
 *
 * Sources:
 *   - 18 SE-aaS domain executors (from domain-executor.ts DOMAIN_MAP)
 *   - 7 AAS accounting domains
 *   - 5 Brain intelligence tools
 *   - 21 MCP tools (from packages/mcp-server — OpenClaw-dependent)
 *   - 7 OpenClaw gateway RPC methods (gateway-dependent)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ToolDescriptor {
  /** Unique tool ID (e.g. "seaas:pr-review", "brain:query") */
  id: string;
  /** Human-readable name */
  name: string;
  /** What the tool does — used by LLM for selection */
  description: string;
  /** Source system */
  source: "se-aas" | "aas" | "brain" | "mcp" | "openclaw-rpc";
  /** Display category */
  category: string;
  /** Whether this tool requires the OpenClaw local daemon */
  requiresGateway?: boolean;
}

// ── Static Tool Definitions ────────────────────────────────────────────────────

const SEAAS_TOOLS: ToolDescriptor[] = [
  // P0: Delivery Intelligence
  { id: "seaas:early-warning",         name: "Early Warning",             description: "Velocity collapse prediction with ML, SPOF bottleneck risk detection",                    source: "se-aas", category: "Delivery Intelligence" },
  { id: "seaas:delivery-intelligence", name: "Engagement Health",         description: "Health score dashboard with delivery velocity, scope drift, team sentiment",               source: "se-aas", category: "Delivery Intelligence" },
  { id: "seaas:pod-match",            name: "Pod Match",                 description: "Recommend the best pod/team for an engagement based on tech stack, capacity",              source: "se-aas", category: "Delivery Intelligence" },
  { id: "seaas:scope-creep",          name: "Scope Creep Detector",      description: "Detect scope creep alerts — story point drift, sprint scope changes",                     source: "se-aas", category: "Delivery Intelligence" },

  // P1: Code Intelligence
  { id: "seaas:pr-review",            name: "PR Review",                 description: "Brain-augmented code review with causal business impact analysis",                        source: "se-aas", category: "Code Intelligence" },
  { id: "seaas:tdd",                  name: "TDD Agent",                 description: "Generate unit + integration tests with Red-Green-Refactor cycle",                         source: "se-aas", category: "Code Intelligence" },
  { id: "seaas:boilerplate-scaffold", name: "Boilerplate Scaffold",      description: "Generate project scaffolding, boilerplate code, and directory structure",                  source: "se-aas", category: "Code Intelligence" },
  { id: "seaas:dependency-upgrade",   name: "Dependency Upgrade",        description: "Analyze dependency upgrade paths, breaking changes, migration strategies",                 source: "se-aas", category: "Code Intelligence" },
  { id: "seaas:design-doc-generator", name: "Design Doc Generator",      description: "Generate HLD/LLD design documents from codebase analysis",                                source: "se-aas", category: "Code Intelligence" },

  // Test Intelligence
  { id: "seaas:test-case-generator",  name: "Test Case Generator",       description: "Generate comprehensive test cases from code and requirements",                             source: "se-aas", category: "Test Intelligence" },
  { id: "seaas:test-data-generator",  name: "Test Data Generator",       description: "Generate realistic test data matching schema constraints",                                 source: "se-aas", category: "Test Intelligence" },

  // SWE Codebase Intelligence
  { id: "seaas:codebase-qa",          name: "Codebase Q&A",              description: "Answer questions about codebase architecture, patterns, and conventions",                  source: "se-aas", category: "Codebase Intelligence" },
  { id: "seaas:dead-code-detector",   name: "Dead Code Detector",        description: "Find unused code, unreachable paths, and stale imports",                                  source: "se-aas", category: "Codebase Intelligence" },
  { id: "seaas:impact-analysis",      name: "Impact Analysis",           description: "Analyze blast radius of code changes across the dependency graph",                        source: "se-aas", category: "Codebase Intelligence" },
  { id: "seaas:architecture-extractor", name: "Architecture Extractor",  description: "Extract and visualize codebase architecture, module dependencies",                        source: "se-aas", category: "Codebase Intelligence" },

  // Observability
  { id: "seaas:incident-diagnosis",   name: "Incident Diagnosis",        description: "Root cause analysis for production incidents using logs, metrics, traces",                 source: "se-aas", category: "Observability" },
  { id: "seaas:log-query",            name: "Log Query",                 description: "Search and analyze application logs with natural language",                               source: "se-aas", category: "Observability" },
  { id: "seaas:performance-profiler", name: "Performance Profiler",      description: "Profile application performance, find bottlenecks, suggest optimizations",                source: "se-aas", category: "Observability" },

  // Data Intelligence
  { id: "seaas:sql-analyzer",         name: "SQL Analyzer",              description: "Analyze SQL queries for performance, correctness, and optimization",                      source: "se-aas", category: "Data Intelligence" },
  { id: "seaas:data-lineage",         name: "Data Lineage",              description: "Trace data flow and transformations across the pipeline",                                 source: "se-aas", category: "Data Intelligence" },
];

const AAS_TOOLS: ToolDescriptor[] = [
  { id: "aas:statements",     name: "Financial Statements",     description: "Generate P&L, Balance Sheet, and Trial Balance",                                   source: "aas", category: "Accounting" },
  { id: "aas:gst-review",     name: "GST Review",               description: "Check GST F5 compliance for quarterly filing",                                     source: "aas", category: "Compliance" },
  { id: "aas:anomaly-check",  name: "Transaction Anomalies",    description: "Detect unusual transaction patterns and risk factors",                              source: "aas", category: "Compliance" },
  { id: "aas:transactions",   name: "Transaction Summary",      description: "Show top transactions with classification and summary",                            source: "aas", category: "Accounting" },
  { id: "aas:benchmark",      name: "Benchmark Report",         description: "Generate benchmark comparison for manual validation",                               source: "aas", category: "Quality Assurance" },
];

const BRAIN_TOOLS: ToolDescriptor[] = [
  { id: "brain:query",         name: "Brain Query",              description: "Query the NexusBrain causal knowledge graph with natural language",                 source: "brain", category: "Intelligence" },
  { id: "brain:causal",        name: "Causal Analysis",          description: "Cross-domain cause-and-effect analysis with 9 causal methods",                     source: "brain", category: "Intelligence" },
  { id: "brain:anomaly",       name: "Anomaly Detection",        description: "Detect unusual patterns across all business signals",                              source: "brain", category: "Intelligence" },
  { id: "brain:predict",       name: "Prediction",               description: "Forecast key business outcomes using the causal graph",                            source: "brain", category: "Intelligence" },
  { id: "brain:what-if",       name: "What-If Simulation",       description: "Counterfactual simulation — trace cascading effects through causal graph",         source: "brain", category: "Intelligence" },
];

const MCP_TOOLS: ToolDescriptor[] = [
  { id: "mcp:nexus_query",             name: "Brain Query (MCP)",          description: "Natural language brain query via MCP protocol",                          source: "mcp", category: "Brain MCP",    requiresGateway: true },
  { id: "mcp:nexus_ingest",            name: "Signal Ingestion (MCP)",     description: "Send business signals for causal analysis",                              source: "mcp", category: "Brain MCP",    requiresGateway: true },
  { id: "mcp:nexus_relationships",     name: "Causal Edges (MCP)",         description: "Get discovered causal edges from the brain",                             source: "mcp", category: "Brain MCP",    requiresGateway: true },
  { id: "mcp:nexus_query_experts",     name: "Expert Finder",              description: "Find who knows about a topic in the org",                                source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_search_code",       name: "Code Search",                description: "Semantic code search across repositories",                               source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_incident_context",  name: "Incident Context",           description: "Full incident context for a service",                                    source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_analyze_pr",        name: "PR Risk Analysis",           description: "Analyze PR risk and blast radius",                                       source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_team_activity",     name: "Team Activity",              description: "Team activity summary and collaboration patterns",                       source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_search_ci_failures", name: "CI Failure Search",         description: "Search past CI/CD pipeline failures",                                   source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_impact_analysis",   name: "Impact Analysis (MCP)",      description: "Blast radius analysis for code changes",                                source: "mcp", category: "Engineering",  requiresGateway: true },
  { id: "mcp:nexus_dev_read_ticket",   name: "Jira Ticket Reader",         description: "Fetch Jira ticket details (title, description, status, assignee)",       source: "mcp", category: "Jira",         requiresGateway: true },
  { id: "mcp:nexus_dev_get_context",   name: "Ticket Brain Context",       description: "Get brain context (causal insights) for a Jira ticket",                  source: "mcp", category: "Jira",         requiresGateway: true },
];

const OPENCLAW_RPC_TOOLS: ToolDescriptor[] = [
  { id: "rpc:nexusbrain.query",         name: "Gateway Brain Query",       description: "Execute brain query via OpenClaw local daemon",                          source: "openclaw-rpc", category: "OpenClaw Gateway", requiresGateway: true },
  { id: "rpc:nexusbrain.ingest",        name: "Gateway Signal Ingest",     description: "Ingest signals via OpenClaw local daemon",                               source: "openclaw-rpc", category: "OpenClaw Gateway", requiresGateway: true },
  { id: "rpc:nexusbrain.services",      name: "List Gateway Services",     description: "List running background services on the local daemon",                   source: "openclaw-rpc", category: "OpenClaw Gateway", requiresGateway: true },
  { id: "rpc:nexusbrain.trigger",       name: "Trigger Service",           description: "Manually trigger a background service (consolidation, etc.)",            source: "openclaw-rpc", category: "OpenClaw Gateway", requiresGateway: true },
  { id: "rpc:nexusbrain.health",        name: "Gateway Health Check",      description: "Full health check of the local OpenClaw daemon",                         source: "openclaw-rpc", category: "OpenClaw Gateway", requiresGateway: true },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get all available tools, optionally filtering out gateway-dependent ones.
 */
export function getAvailableTools(hasOpenClawGateway: boolean = false): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [
    ...SEAAS_TOOLS,
    ...AAS_TOOLS,
    ...BRAIN_TOOLS,
  ];

  if (hasOpenClawGateway) {
    tools.push(...MCP_TOOLS, ...OPENCLAW_RPC_TOOLS);
  }

  return tools;
}

/**
 * Get a compact text summary of all tools for LLM prompting.
 * Each line: "tool_id: description"
 */
export function getToolCatalogueForLLM(hasOpenClawGateway: boolean = false): string {
  return getAvailableTools(hasOpenClawGateway)
    .map((t) => `- ${t.id}: ${t.name} — ${t.description}`)
    .join("\n");
}

/**
 * Look up a tool by ID.
 */
export function getToolById(toolId: string): ToolDescriptor | undefined {
  const allTools = [...SEAAS_TOOLS, ...AAS_TOOLS, ...BRAIN_TOOLS, ...MCP_TOOLS, ...OPENCLAW_RPC_TOOLS];
  return allTools.find((t) => t.id === toolId);
}
