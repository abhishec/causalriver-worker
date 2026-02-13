/**
 * Code Intelligence Context Builder — v2
 *
 * Builds context for the copilot from dependency graphs, expertise maps,
 * and collaboration networks. Supports 5 Developer Use Cases:
 * 1. Onboarding Memory — "How does X work?"
 * 2. Debugging Assistant — "Why does X fail?"
 * 3. Incident Response — "X is down, what's affected?"
 * 4. Knowledge Retention — "Who knows about X?"
 * 5. Code Review Intelligence — "What does this PR affect?"
 *
 * v2 fixes:
 *   - Fuzzy keyword extraction from natural language (not just exact patterns)
 *   - Fuzzy entity search via SDK: depGraph.fuzzySearchEntities()
 *   - Architecture hotspots via SDK: depGraph.getTopHubs()
 *   - Domain breakdown via SDK: depGraph.getDomainBreakdown()
 *   - Debugging/incident fallback: fuzzy upstream dep search
 *   - Collaboration graph wired for all use cases
 *   - Fixed collabGraph.getStats() → getNetworkStats()
 *   - Fixed getBridgeContributors().contributor → was .contributorId
 *
 * Architecture: All graph intelligence methods live in the brain SDK
 * (KnowledgeDependencyGraphInstance). This file is a thin context builder
 * that delegates to SDK methods and formats output for LLM consumption.
 */

import type {
  KnowledgeDependencyGraphInstance,
  ExpertiseGraphInstance,
  CollaborationGraphInstance,
} from "@nexus-ai/memory-stack";

// ── Developer Use Case Detection ─────────────────────────────────────

export type DeveloperUseCase =
  | "onboarding"
  | "debugging"
  | "incident"
  | "knowledge"
  | "review"
  | "general";

const USE_CASE_PATTERNS: Array<{
  useCase: DeveloperUseCase;
  patterns: RegExp[];
}> = [
  {
    useCase: "onboarding",
    patterns: [
      /how does .+ work/i,
      /explain .+ (code|module|service|function|class|system|flow|logic)/i,
      /new to .+ (codebase|repo|project)/i,
      /what (is|does) .+ (do|handle|manage)/i,
      /walk me through/i,
      /architecture of/i,
      /overview of/i,
      /getting started with/i,
      /understand .+ (code|codebase|system)/i,
      /tell me about .+ (module|service|code|system|feature)/i,
    ],
  },
  {
    useCase: "debugging",
    patterns: [
      /error in/i,
      /fails when/i,
      /root cause/i,
      /why (does|is|did) .+ (fail|break|crash|error)/i,
      /bug in/i,
      /debug/i,
      /trace .+ error/i,
      /stack trace/i,
      /what causes/i,
      /fix .+ issue/i,
      /not working/i,
    ],
  },
  {
    useCase: "incident",
    patterns: [
      /incident/i,
      /outage/i,
      /service .+ (down|unavailable)/i,
      /p[01] .+ (incident|issue|alert)/i,
      /production .+ (issue|error|failure)/i,
      /blast radius/i,
      /what .+ affected/i,
      /impact .+ (outage|failure)/i,
    ],
  },
  {
    useCase: "knowledge",
    patterns: [
      /who knows/i,
      /bus factor/i,
      /expertise/i,
      /expert on/i,
      /who (should|can) .+ (review|help|fix)/i,
      /knowledge .+ (transfer|retention|risk)/i,
      /single point of failure/i,
      /sole expert/i,
      /team .+ (knows|owns)/i,
    ],
  },
  {
    useCase: "review",
    patterns: [
      /review .+ (pr|pull request|change|commit)/i,
      /pr .+ (impact|affect|change)/i,
      /what (does|will) .+ (change|break|affect)/i,
      /impact (of|if) .+ change/i,
      /downstream .+ (impact|effect|consumers)/i,
      /who should review/i,
      /reviewer .+ (suggest|recommend)/i,
      /changes to/i,
      /what breaks/i,
    ],
  },
];

export function detectDeveloperUseCase(question: string): DeveloperUseCase {
  for (const { useCase, patterns } of USE_CASE_PATTERNS) {
    if (patterns.some((p) => p.test(question))) {
      return useCase;
    }
  }
  return "general";
}

// ── Entity Extraction (v2 — with fuzzy keyword fallback) ─────────────

// Stopwords that are never useful as entity keywords
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "ought",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their",
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "how", "when", "where", "why", "if", "then", "else", "so", "but",
  "and", "or", "not", "no", "nor", "for", "with", "without", "about",
  "from", "into", "through", "during", "before", "after", "above",
  "below", "to", "of", "in", "on", "at", "by", "up", "down", "out",
  "off", "over", "under", "again", "further", "all", "any", "both",
  "each", "few", "more", "most", "other", "some", "such", "only",
  "own", "same", "than", "too", "very", "just", "because", "as",
  "until", "while", "also", "between", "every", "tell",
  // question/action words
  "work", "works", "working", "explain", "show", "tell", "give",
  "help", "find", "look", "see", "know", "understand", "get",
  "make", "use", "using", "does", "happen", "happens",
  // code-generic words (too broad to be entities)
  "code", "codebase", "file", "files", "function", "class",
  "system", "project", "repo", "repository",
]);

/**
 * Extract potential code entities from the user's question.
 *
 * Strategy order:
 * 1. Exact file paths (e.g., src/auth/handler.ts)
 * 2. Quoted identifiers (e.g., "@calcom/prisma")
 * 3. Module-suffix patterns (e.g., "auth module", "payment service")
 * 4. Fuzzy keyword fallback — extract meaningful nouns from natural language
 */
export function extractCodeEntities(question: string): string[] {
  const entities: string[] = [];

  // Strategy 1: File paths (e.g., src/auth/handler.ts)
  const pathMatch = question.match(
    /[\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|vue|svelte)/gi
  );
  if (pathMatch) entities.push(...pathMatch);

  // Strategy 2: Quoted identifiers — highest precision
  const quotedMatch = question.match(/[`"']([^`"']+)[`"']/g);
  if (quotedMatch) {
    for (const q of quotedMatch) {
      entities.push(q.replace(/[`"']/g, ""));
    }
  }

  // Strategy 3: Module/directory suffix patterns (expanded suffix list)
  const moduleMatch = question.match(
    /(?:the\s+)?(\w[\w-]+)\s+(?:module|service|handler|component|controller|package|library|utility|helper|class|function|api|endpoint|system|feature|layer|page|route|middleware|schema|model|database|table|hook|context|provider|store|reducer|action|saga|slice|plugin|extension|integration|connector|adapter|factory|manager|engine|processor|worker|queue|job|scheduler|pipeline|flow|logic|domain)/gi
  );
  if (moduleMatch) {
    for (const m of moduleMatch) {
      const name = m
        .replace(
          /\s+(?:module|service|handler|component|controller|package|library|utility|helper|class|function|api|endpoint|system|feature|layer|page|route|middleware|schema|model|database|table|hook|context|provider|store|reducer|action|saga|slice|plugin|extension|integration|connector|adapter|factory|manager|engine|processor|worker|queue|job|scheduler|pipeline|flow|logic|domain)$/i,
          ""
        )
        .replace(/^the\s+/i, "")
        .trim();
      if (name.length > 1) entities.push(name);
    }
  }

  // Strategy 4: Fuzzy keyword fallback — extract meaningful nouns
  // Only if we haven't found anything from strategies 1-3
  if (entities.length === 0) {
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_@/]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    for (const word of words) {
      entities.push(word);
    }
  }

  return [...new Set(entities)];
}

// ── Fuzzy Entity Search, Hub Analysis, Domain Breakdown ──────────────
// These are now delegated to the brain SDK's KnowledgeDependencyGraphInstance
// methods: depGraph.fuzzySearchEntities(), depGraph.getTopHubs(), depGraph.getDomainBreakdown()
// No local implementations needed — the SDK handles it with O(N) entity iteration.

// ── Context Building ─────────────────────────────────────────────────

export interface CodeIntelligenceContext {
  useCase: DeveloperUseCase;
  entities: string[];
  dependencyContext: string;
  expertiseContext: string;
  collaborationContext: string;
  fullPrompt: string;
}

export function buildCodeIntelligencePrompt(
  depGraph: KnowledgeDependencyGraphInstance | null,
  expertiseGraph: ExpertiseGraphInstance | null,
  collabGraph: CollaborationGraphInstance | null,
  question: string,
  codeSymbols?: Array<{ symbol: string; filePath: string; kind: string; similarity: number }>,
): CodeIntelligenceContext {
  const useCase = detectDeveloperUseCase(question);
  const entities = extractCodeEntities(question);

  const sections: string[] = [];

  // ── Resolve entities: fuzzy search graph for real entity IDs ──────
  let resolvedEntityIds: string[] = [];
  if (depGraph && entities.length > 0) {
    // First try exact match (e.g., "@calcom/prisma" quoted)
    for (const entity of entities) {
      try {
        const impact = depGraph.analyzeImpact(entity);
        if (impact.totalImpactRadius > 0) {
          resolvedEntityIds.push(entity);
        }
      } catch {
        // not found exactly — will try fuzzy below
      }
    }

    // If no exact matches, do fuzzy search
    if (resolvedEntityIds.length === 0) {
      const fuzzyResults = depGraph.fuzzySearchEntities(entities, 10);
      resolvedEntityIds = fuzzyResults.map((r) => r.entityId);
    }
  }

  // ── Dependency context ──────────────────────────────────────────
  let dependencyContext = "";
  if (depGraph) {
    const depStats = depGraph.getStats();
    if (depStats.totalEdges > 0) {
      const lines: string[] = [
        `## Code Dependency Graph`,
        `- ${depStats.totalEdges} dependency edges across ${depStats.uniqueEntities} entities`,
        `- Domains: ${Object.entries(depStats.byDomain).map(([d, c]) => `${d}(${c})`).join(", ")}`,
        `- Cycles: ${depStats.cycleCount}`,
      ];

      // Impact analysis for resolved entities
      for (const entityId of resolvedEntityIds.slice(0, 3)) {
        try {
          const impact = depGraph.analyzeImpact(entityId);
          if (impact.totalImpactRadius > 0) {
            lines.push("");
            lines.push(`### Impact: ${entityId}`);
            lines.push(`- Direct dependents: ${impact.directDependents.length}`);
            lines.push(`- Transitive impact radius: ${impact.totalImpactRadius}`);
            lines.push(`- Risk score: ${(impact.riskScore * 100).toFixed(0)}%`);
            lines.push(`- Affected domains: ${impact.affectedDomains.join(", ")}`);
            if (impact.criticalPaths.length > 0) {
              lines.push(
                `- Critical paths: ${impact.criticalPaths
                  .slice(0, 3)
                  .map((p) => p.join(" → "))
                  .join("; ")}`
              );
            }
          }
        } catch {
          // Entity not found in graph
        }
      }

      // ── Use-case-specific dependency context ──

      if (useCase === "onboarding") {
        // ONBOARDING: Show architecture overview — top hubs, domain breakdown
        const hubs = depGraph.getTopHubs(10);
        if (hubs.length > 0) {
          lines.push("");
          lines.push(`### Architecture Hotspots (most connected entities):`);
          for (const hub of hubs) {
            const domainTag = hub.domain ? ` [${hub.domain}]` : "";
            lines.push(`  - ${hub.entityId} (fan-in: ${hub.fanIn}, fan-out: ${hub.fanOut})${domainTag}`);
          }
        }

        const domains = depGraph.getDomainBreakdown();
        if (domains.length > 0) {
          lines.push("");
          lines.push(`### Domain Architecture:`);
          for (const d of domains.slice(0, 8)) {
            lines.push(`  - ${d.domain}: ${d.entityCount} entities`);
          }
        }

        // If we found fuzzy entity matches, show them
        if (resolvedEntityIds.length > 0 && entities.length > 0) {
          lines.push("");
          lines.push(`### Entities matching "${entities.join(", ")}":`);
          for (const eid of resolvedEntityIds.slice(0, 8)) {
            const domain = depGraph.mapEntityToDomain(eid);
            lines.push(`  - ${eid}${domain ? ` [${domain}]` : ""}`);
          }
        }
      }

      if (useCase === "debugging" || useCase === "incident") {
        // Show upstream dependencies for root cause analysis
        const entitiesToTrace = resolvedEntityIds.length > 0 ? resolvedEntityIds : [];
        for (const entityId of entitiesToTrace.slice(0, 3)) {
          const upstream = depGraph.queryDependencies({
            entityId,
            direction: "upstream",
            limit: 10,
          });
          if (upstream.length > 0) {
            lines.push("");
            lines.push(`### Upstream dependencies of ${entityId} (potential root causes):`);
            for (const dep of upstream.slice(0, 8)) {
              lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
            }
          }

          // Also show downstream (blast radius)
          if (useCase === "incident") {
            const downstream = depGraph.queryDependencies({
              entityId,
              direction: "downstream",
              limit: 10,
            });
            if (downstream.length > 0) {
              lines.push("");
              lines.push(`### Downstream dependents of ${entityId} (blast radius):`);
              for (const dep of downstream.slice(0, 8)) {
                lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
              }
            }
          }
        }

        // If no resolved entities, still show hubs relevant to keywords
        if (resolvedEntityIds.length === 0 && entities.length > 0) {
          const fuzzy = depGraph.fuzzySearchEntities(entities, 5);
          if (fuzzy.length > 0) {
            lines.push("");
            lines.push(`### Files matching "${entities.join(", ")}" (possible locations):`);
            for (const f of fuzzy) {
              lines.push(`  - ${f.entityId}${f.domain ? ` [${f.domain}]` : ""}`);
            }
          }
        }
      }

      if (useCase === "review") {
        // Show downstream impact for review
        for (const entityId of resolvedEntityIds.slice(0, 2)) {
          const downstream = depGraph.queryDependencies({
            entityId,
            direction: "downstream",
            limit: 15,
          });
          if (downstream.length > 0) {
            lines.push("");
            lines.push(`### Downstream consumers of ${entityId} (affected by changes):`);
            for (const dep of downstream.slice(0, 10)) {
              lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType})`);
            }
          }
        }
      }

      dependencyContext = lines.join("\n");
      sections.push(dependencyContext);
    }
  }

  // ── Expertise context ──────────────────────────────────────────
  let expertiseContext = "";
  if (expertiseGraph) {
    const expStats = expertiseGraph.getStats();
    if (expStats.totalEdges > 0) {
      const lines: string[] = [
        `## Expertise Map`,
        `- ${expStats.uniqueContributors} contributors across ${expStats.uniqueTopics} topics`,
      ];

      // Find experts for each entity keyword (expertise graph has fuzzy matching)
      const queriedTopics = new Set<string>();
      for (const entity of entities.slice(0, 5)) {
        if (queriedTopics.has(entity.toLowerCase())) continue;
        queriedTopics.add(entity.toLowerCase());
        const experts = expertiseGraph.queryExperts({ topic: entity, limit: 5 });
        if (experts.length > 0) {
          lines.push("");
          lines.push(`### Experts for "${entity}":`);
          for (const exp of experts) {
            lines.push(
              `  - ${exp.contributorName || exp.contributorId} (strength: ${(exp.strength * 100).toFixed(0)}%, evidence: ${exp.evidenceCount} contributions)`
            );
          }
        }
      }

      // Bus factor warnings for knowledge retention use case
      if (useCase === "knowledge") {
        const heatmap = expertiseGraph.getHeatmap(30);
        const singleExpertTopics: string[] = [];
        for (const [topic, edges] of heatmap) {
          if (edges.length === 1 && edges[0].strength > 0.3) {
            singleExpertTopics.push(
              `${topic} (only: ${edges[0].contributorName || edges[0].contributorId})`
            );
          }
        }
        if (singleExpertTopics.length > 0) {
          lines.push("");
          lines.push(`### Bus Factor Warnings (single expert):`);
          for (const topic of singleExpertTopics.slice(0, 10)) {
            lines.push(`  - ⚠️ ${topic}`);
          }
        }
      }

      // Onboarding: show top expertise areas so new developers know who to ask
      if (useCase === "onboarding") {
        const heatmap = expertiseGraph.getHeatmap(15);
        if (heatmap.size > 0) {
          lines.push("");
          lines.push(`### Top Expertise Areas (who to ask):`);
          let shown = 0;
          for (const [topic, edges] of heatmap) {
            if (shown >= 10) break;
            const topExpert = edges[0];
            const expertCount = edges.length;
            lines.push(
              `  - ${topic}: ${expertCount} expert${expertCount > 1 ? "s" : ""}, top: ${topExpert.contributorName || topExpert.contributorId} (${(topExpert.strength * 100).toFixed(0)}%)`
            );
            shown++;
          }
        }
      }

      expertiseContext = lines.join("\n");
      sections.push(expertiseContext);
    }
  }

  // ── Collaboration context ──────────────────────────────────────
  let collaborationContext = "";
  if (collabGraph) {
    const networkStats = collabGraph.getNetworkStats();
    if (networkStats.totalEdges > 0) {
      const lines: string[] = [
        `## Collaboration Network`,
        `- ${networkStats.totalEdges} collaboration edges across ${networkStats.uniqueContributors} contributors`,
        `- Teams: ${networkStats.uniqueTeams}, Cross-team edges: ${networkStats.crossTeamEdges}`,
        `- Network density: ${(networkStats.density * 100).toFixed(1)}%`,
      ];

      // Bridge contributors — useful for all use cases involving people
      if (useCase === "incident" || useCase === "review" || useCase === "knowledge" || useCase === "onboarding") {
        const bridges = collabGraph.getBridgeContributors(5);
        if (bridges.length > 0) {
          lines.push("");
          lines.push(`### Bridge Contributors (connect teams):`);
          for (const b of bridges) {
            lines.push(`  - ${b.contributor}: bridges ${b.teams.join(", ")} (${b.crossTeamEdges} cross-team edges)`);
          }
        }
      }

      // Cross-team edges for onboarding (shows team structure)
      if (useCase === "onboarding") {
        const crossTeam = collabGraph.getCrossTeamEdges();
        if (crossTeam.length > 0) {
          lines.push("");
          lines.push(`### Cross-Team Collaboration (${crossTeam.length} edges):`);
          const teamPairs = new Map<string, number>();
          for (const edge of crossTeam.slice(0, 50)) {
            const pair = [edge.teamA || "unknown", edge.teamB || "unknown"].sort().join(" ↔ ");
            teamPairs.set(pair, (teamPairs.get(pair) || 0) + 1);
          }
          const sorted = Array.from(teamPairs.entries()).sort((a, b) => b[1] - a[1]);
          for (const [pair, count] of sorted.slice(0, 8)) {
            lines.push(`  - ${pair}: ${count} interactions`);
          }
        }
      }

      collaborationContext = lines.join("\n");
      sections.push(collaborationContext);
    }
  }

  // ── Code symbol search results ─────────────────────────────────
  if (codeSymbols && codeSymbols.length > 0) {
    const lines = [
      `## Relevant Code Symbols`,
      ...codeSymbols.slice(0, 8).map(
        (s) =>
          `- ${s.kind} \`${s.symbol}\` in \`${s.filePath}\` (relevance: ${(s.similarity * 100).toFixed(0)}%)`
      ),
    ];
    sections.push(lines.join("\n"));
  }

  // ── Build full prompt ──────────────────────────────────────────
  const useCaseHint = getUseCaseHint(useCase);
  const fullPrompt = sections.length > 0
    ? [
        `# Code Intelligence Context`,
        `**Developer use case detected:** ${useCase}`,
        useCaseHint ? `**Focus:** ${useCaseHint}` : "",
        "",
        ...sections,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return {
    useCase,
    entities,
    dependencyContext,
    expertiseContext,
    collaborationContext,
    fullPrompt,
  };
}

function getUseCaseHint(useCase: DeveloperUseCase): string {
  switch (useCase) {
    case "onboarding":
      return "Explain code architecture, key modules, and who to ask for help. Be welcoming and thorough.";
    case "debugging":
      return "Trace upstream dependencies for root cause analysis. Show error propagation paths.";
    case "incident":
      return "Assess blast radius, identify affected services, and suggest expert contacts for each affected area.";
    case "knowledge":
      return "Show bus factor risks, expertise distribution, and suggest knowledge transfer actions.";
    case "review":
      return "Analyze impact of changes, suggest reviewers based on expertise, and flag risky downstream effects.";
    default:
      return "";
  }
}
