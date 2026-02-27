/**
 * Message Builder — Copilot chat system prompt construction helpers.
 *
 * Extracted from app/api/copilot/chat/route.ts to keep the route file
 * as a thin orchestrator. All prompt-building logic lives here.
 *
 * Exports:
 *   buildActionKnowledge() — adapts DB data for DomainActionEngine input format
 *   NO_HALLUCINATION_FALLBACK — base system prompt when brain context is unavailable
 *   injectMemoryCompression() — prepends compressed summary to system prompt
 *   injectCommandCenterPersona() — adds behavioral rules section
 *   injectZeroDataGuard() — adds expert-consultant mode when no brain data loaded
 */

// ── Types (inlined to avoid import chain issues in Lambda) ─────────────────
export interface TrainedCausalEdge {
  source_domain: string;
  target_domain: string;
  effect_size: number;
  optimal_lag_days: number;
  confidence: number;
  method: string;
  [k: string]: unknown;
}

export interface TrainedRule {
  id: string;
  title: string;
  natural_language: string;
  conditions: string[];
  content: string;
  [k: string]: unknown;
}

export type UserIntent = "build" | "explain" | "diagnose" | "predict" | "general";

export interface ActionKnowledgeResult {
  question: string;
  intent: UserIntent;
  extractedDomains: string[];
  primaryDomain: string;
  directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }>;
}

// ============================================================================
// ACTION KNOWLEDGE BUILDER
// Adapts DB data for DomainActionEngine input format.
// (DomainActionEngine has its own typed input; this bridges the gap.)
// ============================================================================

export function buildActionKnowledge(
  question: string,
  intent: string,
  domains: string[],
  causalEdges: TrainedCausalEdge[],
  rules: TrainedRule[],
  entityState?: Record<string, unknown>
): ActionKnowledgeResult {
  // Map BrainIntent → UserIntent for DomainActionEngine compatibility
  const intentMap: Record<string, UserIntent> = {
    build: "build", explain: "explain", diagnose: "diagnose",
    predict: "predict", whatif: "predict", cascade: "diagnose",
    debugging: "diagnose", incident: "diagnose", review: "explain",
    onboarding: "explain", knowledge: "explain", health: "general",
    uncertainty: "general", general: "general",
  };
  const actionIntent: UserIntent = intentMap[intent] || "general";

  // Build directCauses and directEffects from causal edges
  const directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};
  const directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};

  for (const edge of causalEdges) {
    const entry = {
      source: edge.source_domain,
      target: edge.target_domain,
      effectSize: edge.effect_size,
      lagDays: edge.optimal_lag_days,
    };

    if (!directCauses[edge.target_domain]) directCauses[edge.target_domain] = [];
    directCauses[edge.target_domain].push(entry);

    if (!directEffects[edge.source_domain]) directEffects[edge.source_domain] = [];
    directEffects[edge.source_domain].push(entry);
  }

  for (const domain of Object.keys(directCauses)) {
    directCauses[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }
  for (const domain of Object.keys(directEffects)) {
    directEffects[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }

  // Parse and evaluate rules for ActionEngine
  const matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }> = [];

  for (const r of rules) {
    try {
      const p = JSON.parse(r.content);
      if (p && p.when && p.entity_type) {
        const conditionStrs = (p.when.conditions || []).map(
          (c: { field: string; operator: string; value: unknown }) =>
            `${c.field} ${c.operator} ${c.value}`
        );

        let triggered = false;
        if (entityState && p.when.conditions?.length > 0) {
          triggered = p.when.conditions.some((c: { field: string; operator: string; value: unknown }) => {
            const parts = c.field.split(".");
            let val: unknown = entityState;
            for (const part of parts) {
              if (val == null || typeof val !== "object") return false;
              val = (val as Record<string, unknown>)[part];
            }
            return val !== undefined;
          });
        }

        matchedRules.push({
          title: p.title || "Untitled Rule",
          naturalLanguage: p.natural_language || p.naturalLanguage || p.description || "",
          conditions: conditionStrs,
          triggered,
        });
      }
    } catch {
      // Skip malformed rule JSON
    }
  }

  return {
    question,
    intent: actionIntent,
    extractedDomains: domains,
    primaryDomain: domains[0] || "finance",
    directCauses,
    directEffects,
    matchedRules,
  };
}

// ============================================================================
// SYSTEM PROMPT HELPERS
// These functions build discrete sections of the system prompt.
// The route keeps these calls visible so the prompt construction order is clear.
// ============================================================================

/**
 * Returns the base fallback prompt used when brain context is unavailable.
 * Inlined here so it can be shared with tests without importing the 5k-line route.
 */
export function getNoHallucinationFallback(
  causalEdges: number,
  rules: number,
  patterns: number,
  cascadeRules: number
): string {
  return `You are a BrainOS Copilot — an AI that specializes in engineering delivery intelligence, software engineering metrics, causal analysis, and organizational intelligence.

You currently have: ${causalEdges} causal edges, ${rules} business rules, ${patterns} patterns/insights, ${cascadeRules} cascade rules loaded.`;
}

/**
 * Prepends compressed conversation summary to the system prompt.
 * Enables "unlimited memory": summary + recent 10 turns = full continuity.
 */
export function injectMemoryCompression(
  prompt: string,
  compressedSummary?: string
): string {
  if (!compressedSummary || compressedSummary.trim().length === 0) return prompt;
  return `## CONVERSATION MEMORY (earlier turns summarized)\n${compressedSummary}\n\n---\n\n${prompt}`;
}

/**
 * Appends the command-center persona rules to the system prompt.
 * Always applied regardless of brain data state.
 */
export function injectCommandCenterPersona(prompt: string): string {
  return prompt + `\n\n## Your Role: AI Worker Intelligence Commander

You are BrainOS Copilot — an autonomous AI that manages delivery intelligence for software engineering organizations. You operate like a senior principal engineer running a command center.

BEHAVIORAL RULES (follow these always, regardless of brain data state):
1. Always orchestrate: When a query needs data you're still collecting, kick off the agent AND answer with what you know now. Never make users wait empty-handed.
2. Always be specific: Name the domains, metrics, and signals you're analyzing. "I'm analyzing velocity from your GitHub commits and Jira sprint data" not "analyzing your data."
3. Always give status: Reference what agents are running, what completed recently, what the brain currently knows.
4. Always add value even with no brain data: Use industry benchmarks, best practices, and your reasoning about what the data WOULD show based on the organization's context.
5. Async-first communication: "I've started X — here's what I know now, and here's what X will tell us in Y minutes."
6. Never passive: If you see a pattern or risk, surface it proactively. Don't wait for the user to ask.
7. Command-center tone: Decisive, specific, action-oriented. Not chatbot-generic.
8. Anti-silence rule: You NEVER respond with just "I don't have data on that." Always follow any gap acknowledgment with something substantive — a framework, a benchmark, a question that helps diagnose the situation, or a concrete next step.`;
}

/**
 * Appends the zero-data guard section.
 * Applied when no causal edges, rules, patterns, or cascade rules are loaded.
 */
export function injectZeroDataGuard(prompt: string): string {
  return prompt + `\n\n## Brain State: Initializing — Operate as Expert Consultant

The brain is still collecting organizational signals. Causal graph data is not yet loaded.

You have access to:
- Deep software engineering and delivery intelligence expertise
- Industry benchmarks, SRE/DevOps best practices, and delivery frameworks
- General knowledge about the organization's structure based on this conversation

Behavioral rules for this state:
1. ALWAYS provide substantive value — never say "I don't have data" without offering something useful as a substitute
2. Be specific about what data you would normally analyze (e.g., "Once your GitHub connector is active, I'd look at PR cycle time, reviewer distribution, and commit velocity")
3. Offer concrete recommendations grounded in industry best practices and the context you DO have
4. Tell the user exactly what data collection steps are needed and what insights will unlock
5. Behave like a senior delivery consultant who just joined the team — you have expertise even before the monitoring is fully set up
6. DO NOT fabricate specific numbers (commit counts, ticket counts, etc.) — but DO give frameworks, benchmarks, and directional guidance
7. When suggesting setup steps, be precise: "Connect GitHub at /connectors — once active, the brain ingests PR and commit data automatically"`;
}
