/**
 * Agent Swarm Patterns — Pre-defined multi-agent orchestration patterns
 *
 * Each pattern defines a sequence of agents that work together
 * to solve a specific class of problems. These are the "recipes"
 * that the system can suggest or auto-compose.
 */

import type { AgentChain, AgentChainStep } from "./chain-executor";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SwarmPattern {
  /** Unique pattern identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this pattern does */
  description: string;
  /** Icon path (SVG d attribute) */
  icon: string;
  /** The agent chain definition */
  chain: AgentChain;
  /** When to suggest this pattern (keywords) */
  triggerKeywords: string[];
  /** Category for grouping */
  category: "engineering" | "analysis" | "operations" | "quality";
}

// ── Pattern Definitions ────────────────────────────────────────────────────

export const SWARM_PATTERNS: SwarmPattern[] = [
  // ── 1. PR Review Pipeline ────────────────────────────────────────────
  {
    id: "pr-review-pipeline",
    name: "PR Review Pipeline",
    description: "Review code, assess blast radius, and generate missing tests.",
    icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75",
    chain: {
      name: "PR Review Pipeline",
      mode: "sequential",
      steps: [
        {
          agentType: "code-review",
          label: "Code Review",
          inputMapping: "original",
        },
        {
          agentType: "impact-analysis",
          label: "Impact Analysis",
          inputMapping: "previous_output",
          promptTemplate: "Based on this code review:\n\n{{previous_output}}\n\nAnalyze the blast radius and potential impact of these changes: {{original_input}}",
        },
        {
          agentType: "test-case",
          label: "Generate Tests",
          inputMapping: "previous_output",
          promptTemplate: "Based on the code review and impact analysis:\n\n{{previous_output}}\n\nGenerate test cases to cover the identified risk areas for: {{original_input}}",
        },
      ],
    },
    triggerKeywords: ["review", "pr", "pull request", "code review", "then test"],
    category: "quality",
  },

  // ── 2. Incident Response ─────────────────────────────────────────────
  {
    id: "incident-response",
    name: "Incident Response",
    description: "Diagnose incident, analyze logs, and review suspected code.",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    chain: {
      name: "Incident Response",
      mode: "sequential",
      steps: [
        {
          agentType: "incident-diagnosis",
          label: "Diagnose",
          inputMapping: "original",
        },
        {
          agentType: "log-analysis",
          label: "Analyze Logs",
          inputMapping: "previous_output",
          promptTemplate: "Based on the incident diagnosis:\n\n{{previous_output}}\n\nAnalyze relevant logs for: {{original_input}}",
        },
        {
          agentType: "code-review",
          label: "Review Code",
          inputMapping: "previous_output",
          promptTemplate: "Based on the diagnosis and log analysis:\n\n{{previous_output}}\n\nReview the suspected code areas for: {{original_input}}",
        },
      ],
    },
    triggerKeywords: ["incident", "outage", "down", "diagnose", "debug", "investigate"],
    category: "operations",
  },

  // ── 3. Tech Debt Sprint ──────────────────────────────────────────────
  {
    id: "tech-debt-sprint",
    name: "Tech Debt Sprint",
    description: "Audit tech debt, find dead code, and check dependencies.",
    icon: "M11.42 15.17l-5.592-3.209c-.495-.285-.495-.983 0-1.268l5.592-3.209c.389-.223.87-.223 1.259 0l5.592 3.209c.495.284.495.983 0 1.268l-5.592 3.209c-.389.222-.87.222-1.259 0z",
    chain: {
      name: "Tech Debt Sprint",
      mode: "parallel",
      steps: [
        {
          agentType: "tech-debt-audit",
          label: "Audit Tech Debt",
          inputMapping: "original",
        },
        {
          agentType: "dead-code",
          label: "Find Dead Code",
          inputMapping: "original",
        },
        {
          agentType: "dependency-upgrade",
          label: "Check Dependencies",
          inputMapping: "original",
        },
      ],
      synthesisPrompt: "Synthesize the findings from these parallel analyses into a prioritized tech debt action plan:\n\n{{merged_results}}",
    },
    triggerKeywords: ["tech debt", "cleanup", "refactor", "modernize", "maintenance"],
    category: "engineering",
  },

  // ── 4. Feature Build ─────────────────────────────────────────────────
  {
    id: "feature-build",
    name: "Feature Build",
    description: "Understand codebase, design architecture, generate tests, then review.",
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
    chain: {
      name: "Feature Build",
      mode: "sequential",
      steps: [
        {
          agentType: "codebase",
          label: "Understand Codebase",
          inputMapping: "original",
          promptTemplate: "Map the relevant parts of the codebase for implementing: {{original_input}}",
        },
        {
          agentType: "architecture",
          label: "Design Architecture",
          inputMapping: "previous_output",
          promptTemplate: "Based on the codebase analysis:\n\n{{previous_output}}\n\nDesign the architecture for: {{original_input}}",
        },
        {
          agentType: "tdd",
          label: "TDD Implementation",
          inputMapping: "previous_output",
          promptTemplate: "Based on the architecture design:\n\n{{previous_output}}\n\nGenerate test-driven implementation for: {{original_input}}",
        },
        {
          agentType: "code-review",
          label: "Review",
          inputMapping: "previous_output",
          promptTemplate: "Review the implementation:\n\n{{previous_output}}\n\nOriginal requirement: {{original_input}}",
        },
      ],
    },
    triggerKeywords: ["build", "implement", "create feature", "new feature", "develop"],
    category: "engineering",
  },

  // ── 5. Performance Audit ─────────────────────────────────────────────
  {
    id: "performance-audit",
    name: "Performance Audit",
    description: "Profile performance, optimize SQL, and analyze data lineage.",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    chain: {
      name: "Performance Audit",
      mode: "parallel",
      steps: [
        {
          agentType: "performance",
          label: "Profile Performance",
          inputMapping: "original",
        },
        {
          agentType: "sql-optimize",
          label: "Optimize SQL",
          inputMapping: "original",
        },
        {
          agentType: "data-lineage",
          label: "Data Lineage",
          inputMapping: "original",
        },
      ],
      synthesisPrompt: "Create a comprehensive performance improvement plan from these analyses:\n\n{{merged_results}}",
    },
    triggerKeywords: ["performance", "slow", "optimize", "bottleneck", "latency"],
    category: "analysis",
  },
];

// ── Pattern Detection ──────────────────────────────────────────────────────

/**
 * Detect which swarm pattern matches a user message.
 * Returns the best matching pattern, or null for single-agent tasks.
 */
export function detectSwarmPattern(userMessage: string): SwarmPattern | null {
  const lower = userMessage.toLowerCase();

  // Score each pattern based on keyword matches
  let bestMatch: SwarmPattern | null = null;
  let bestScore = 0;

  for (const pattern of SWARM_PATTERNS) {
    let score = 0;
    for (const keyword of pattern.triggerKeywords) {
      if (lower.includes(keyword)) {
        score += keyword.split(" ").length; // Multi-word keywords score higher
      }
    }

    // Explicit multi-agent indicators boost any match
    if (lower.includes("then") || lower.includes("and then") || lower.includes("first") || lower.includes("after that")) {
      score *= 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  // Only return if confidence is high enough (at least 1 keyword match)
  return bestScore >= 1 ? bestMatch : null;
}

/**
 * Get all available swarm patterns, optionally filtered by category.
 */
export function getSwarmPatterns(category?: string): SwarmPattern[] {
  if (!category) return SWARM_PATTERNS;
  return SWARM_PATTERNS.filter((p) => p.category === category);
}
