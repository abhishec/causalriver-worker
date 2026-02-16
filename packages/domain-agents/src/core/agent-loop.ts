/**
 * Agent Loop - Enterprise-Grade ReAct Execution Engine
 * 
 * Implements the Think → Act → Observe → Reflect pattern for
 * true autonomous agent behavior with tool use and memory integration.
 * 
 * Part of Phase 8: Enterprise AI Agent Architecture Transformation
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { CLAUDE_MODEL, ANTHROPIC_API_URL } from "./claude-config.ts";
import { generateEmbedding } from "./rag-layer.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface DomainAgent {
  domain: string;
  role: string;
  systemPrompt: string;
  tools: Tool[];
}

export interface MemoryContext {
  patterns: any[];
  causalChains: any[];
  tacitKnowledge: any[];
  predictions: any[];
  humanDecisions: any[];  // L7: Human decision rationales for learning
}

export interface AgentLoopConfig {
  goal: string;
  agent: DomainAgent;
  initialContext: string;
  supabase: ReturnType<typeof createClient>;
  anthropicApiKey: string;
  organizationId: string;
  maxIterations: number;
  reflectionEnabled: boolean;
  memoryEnabled: boolean;
  timeoutMs: number;
}

export interface ThoughtStep {
  reasoning: string;
  nextAction: string;
  confidence: number;
}

export interface ActionStep {
  toolName: string;
  toolInput: Record<string, any>;
  toolUseId: string;
}

export interface ObservationStep {
  result: any;
  success: boolean;
  errorMessage?: string;
}

export interface ReflectionStep {
  goalProgress: number;
  shouldContinue: boolean;
  adjustedStrategy?: string;
  learnings: string[];
}

export interface AgentIteration {
  iteration: number;
  thought: ThoughtStep;
  action?: ActionStep;
  observation?: ObservationStep;
  reflection?: ReflectionStep;
  durationMs: number;
}

export interface AgentResult {
  success: boolean;
  goal: string;
  iterations: AgentIteration[];
  finalOutput: any;
  toolsUsed: string[];
  memoryQueriesCount: number;
  totalDurationMs: number;
  terminationReason: 'goal_complete' | 'max_iterations' | 'timeout' | 'error' | 'no_progress';
  // v11.4.0: Add token tracking for cost visibility and debugging
  tokensUsed: {
    input: number;
    output: number;
  };
}

// ============================================================================
// REACT LOOP CORE
// ============================================================================

/**
 * Run a full ReAct agent loop with tool use and memory integration
 */
export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentResult> {
  const startTime = Date.now();
  const iterations: AgentIteration[] = [];
  const toolsUsed: Set<string> = new Set();
  let memoryQueriesCount = 0;
  let conversationHistory: any[] = [];
  
  // v11.4.0: Token tracking accumulators
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  
  // Initialize with goal and context
  let systemPrompt = buildAgentSystemPrompt(config.agent, config.goal);
  
  // Retrieve initial memory context if enabled
  let memoryContext: MemoryContext | null = null;
  if (config.memoryEnabled) {
    memoryContext = await retrieveMemoryContext(config.supabase, config.goal, config.organizationId);
    memoryQueriesCount++;
    
    if (memoryContext) {
      systemPrompt += buildMemoryContextSection(memoryContext);
    }
  }
  
  // Add initial context
  conversationHistory.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: `# Goal\n${config.goal}\n\n# Context\n${config.initialContext}`
      }
    ]
  });
  
  let terminationReason: AgentResult['terminationReason'] = 'max_iterations';
  let iteration = 0;
  
  while (iteration < config.maxIterations) {
    const iterationStart = Date.now();
    
    // Check timeout
    if (Date.now() - startTime > config.timeoutMs) {
      terminationReason = 'timeout';
      break;
    }
    
    // v11.7.0: Force synthesis on final iteration by REMOVING tools from API call
    const isLastIteration = iteration === config.maxIterations - 1;
    if (isLastIteration && iteration > 0) {
      console.log(`[AgentLoop] ${config.agent.domain} on FINAL iteration (${iteration + 1}/${config.maxIterations}) - FORCING TEXT-ONLY RESPONSE (no tools)`);
      
      // Inject a user message forcing Claude to produce final output
      conversationHistory.push({
        role: 'user',
        content: [{
          type: 'text',
          text: 'FINAL ITERATION: You MUST provide your complete analysis NOW. No more data gathering.\n\nStructure your response with:\n\n## Key Findings\n(List the most critical insights from your analysis)\n\n## Recommended Actions\n(List 3-5 specific, actionable recommendations)\n\n## Financial Impact\n(Quantify the potential impact of your recommendations)\n\nProvide a comprehensive summary of everything you have learned.'
        }]
      });
    }
    
    // v11.7.0: Remove tools on final iteration to FORCE text-only response
    // This is the only reliable way to prevent Claude from calling tools
    const toolsForThisIteration = (isLastIteration && iteration > 0) ? [] : config.agent.tools;
    
    try {
      // =========== THINK STEP ===========
      const thought = await thinkStep(
        config.anthropicApiKey,
        systemPrompt,
        conversationHistory,
        toolsForThisIteration  // v11.7.0: Use conditional tools
      );
      
      // v11.4.0: Accumulate tokens from each think step
      totalTokensInput += thought.tokensUsed.input;
      totalTokensOutput += thought.tokensUsed.output;
      
      // v11.5.0: Enhanced goal completion detection with explicit completion signals
      // Check for structured output (markdown formatting or long text)
      const hasStructuredOutput = 
        thought.textContent.includes('**') || 
        thought.textContent.includes('## ') ||
        thought.textContent.includes('### ') ||
        thought.textContent.length > 500;
      
      // v11.5.0: Phase 2 - Detect explicit agent completion signals in text
      // These phrases indicate the agent believes it has completed its analysis
      const agentSignalsComplete = 
        thought.textContent.includes('## Summary') ||
        thought.textContent.includes('**Recommendations:**') ||
        thought.textContent.includes('**Key Findings:**') ||
        thought.textContent.includes('**Recommended Actions:**') ||
        thought.textContent.includes('In conclusion') ||
        thought.textContent.includes('Based on my analysis') ||
        thought.textContent.includes('My analysis is complete') ||
        thought.textContent.includes('I have completed');
      
      // v11.5.0: Add logging for debugging iteration progress
      console.log(`[AgentLoop] ${config.agent.domain} iteration ${iteration}/${config.maxIterations}: ` +
        `tools=${thought.toolUses.length}, textLen=${thought.textContent.length}, ` +
        `hasStructuredOutput=${hasStructuredOutput}, agentSignalsComplete=${agentSignalsComplete}`);
      
      // Goal complete if: no tool use AND (structured output OR explicit completion signal)
      if (!thought.hasToolUse && (hasStructuredOutput || agentSignalsComplete)) {
        iterations.push({
          iteration,
          thought: {
            reasoning: thought.textContent,
            nextAction: 'complete',
            confidence: 1.0
          },
          durationMs: Date.now() - iterationStart
        });
        
        terminationReason = 'goal_complete';
        console.log(`[AgentLoop] ${config.agent.domain} completed with goal_complete at iteration ${iteration}`);
        break;
      }
      
      // If no tool use but NOT structured output, it might be partial thinking
      // Continue to next iteration to give Claude a chance to complete
      if (!thought.hasToolUse && !hasStructuredOutput) {
        iterations.push({
          iteration,
          thought: {
            reasoning: thought.textContent,
            nextAction: 'thinking',
            confidence: 0.6
          },
          durationMs: Date.now() - iterationStart
        });
        
        console.log(`[AgentLoop] ${config.agent.domain} iteration ${iteration}: no tool use, partial thinking - continuing`);
        
        // Add a prompt to continue to the conversation to nudge Claude
        conversationHistory.push({
          role: 'assistant',
          content: thought.rawContent
        });
        conversationHistory.push({
          role: 'user',
          content: [{ type: 'text', text: 'Please continue your analysis and provide your final structured output with **Key Findings**, **Recommended Actions**, and **Financial Impact** sections.' }]
        });
        
        iteration++;
        continue;
      }
      
      // =========== ACT STEP ===========
      const actions: ActionStep[] = [];
      const toolResults: ToolResult[] = [];
      
      for (const toolUse of thought.toolUses) {
        const action: ActionStep = {
          toolName: toolUse.name,
          toolInput: toolUse.input,
          toolUseId: toolUse.id
        };
        actions.push(action);
        toolsUsed.add(toolUse.name);
        
        // =========== OBSERVE STEP ===========
        const observation = await executeToolWithMemory(
          config.supabase,
          config.organizationId,
          toolUse.name,
          toolUse.input,
          config.agent.domain
        );
        
        if (observation.isMemoryQuery) {
          memoryQueriesCount++;
        }
        
        toolResults.push({
          tool_use_id: toolUse.id,
          content: JSON.stringify(observation.result),
          is_error: !observation.success
        });
      }
      
      // Add assistant response to history
      conversationHistory.push({
        role: 'assistant',
        content: thought.rawContent
      });
      
      // Add tool results to history
      conversationHistory.push({
        role: 'user',
        content: toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.tool_use_id,
          content: tr.content,
          is_error: tr.is_error
        }))
      });
      
      // =========== REFLECT STEP ===========
      // v12.0.0: Reduced reflection frequency - only on iteration 1 (not every 2 iterations)
      // This speeds up the agent loop while still allowing course correction
      let reflection: ReflectionStep | undefined;
      if (config.reflectionEnabled && iteration === 1) {
        reflection = await reflectStep(
          config.anthropicApiKey,
          config.goal,
          iterations,
          toolResults
        );
        
        // v12.0.0: Phase 4 - Early exit on 75%+ progress (faster completion)
        if (reflection.goalProgress >= 0.75) {
          console.log(`[AgentLoop] ${config.agent.domain} reflection shows ${(reflection.goalProgress * 100).toFixed(0)}% progress - completing early`);
          terminationReason = 'goal_complete';
          iterations.push({
            iteration,
            thought: {
              reasoning: thought.textContent,
              nextAction: actions[0]?.toolName || 'unknown',
              confidence: reflection.goalProgress
            },
            action: actions[0],
            observation: {
              result: toolResults[0]?.content,
              success: !toolResults[0]?.is_error
            },
            reflection,
            durationMs: Date.now() - iterationStart
          });
          break;
        }
        
        if (!reflection.shouldContinue) {
          terminationReason = reflection.goalProgress >= 0.9 ? 'goal_complete' : 'no_progress';
          iterations.push({
            iteration,
            thought: {
              reasoning: thought.textContent,
              nextAction: actions[0]?.toolName || 'unknown',
              confidence: reflection.goalProgress
            },
            action: actions[0],
            observation: {
              result: toolResults[0]?.content,
              success: !toolResults[0]?.is_error
            },
            reflection,
            durationMs: Date.now() - iterationStart
          });
          break;
        }
      }
      
      iterations.push({
        iteration,
        thought: {
          reasoning: thought.textContent,
          nextAction: actions[0]?.toolName || 'unknown',
          confidence: 0.8
        },
        action: actions[0],
        observation: {
          result: toolResults[0]?.content,
          success: !toolResults[0]?.is_error
        },
        reflection,
        durationMs: Date.now() - iterationStart
      });
      
      iteration++;
      
    } catch (error) {
      console.error(`[AgentLoop] Error in iteration ${iteration}:`, error);
      terminationReason = 'error';
      break;
    }
  }
  
  // Extract final output from last assistant message
  const lastAssistantMsg = conversationHistory.filter(m => m.role === 'assistant').pop();
  let finalOutput = extractFinalOutput(lastAssistantMsg);
  
  // v11.7.0: Enhanced output extraction with fallback to iteration data
  // If no text output, try to build summary from iterations
  if (!finalOutput || !finalOutput.summary) {
    console.log(`[AgentLoop] ${config.agent.domain} - no direct output found, building from iterations`);
    finalOutput = buildSummaryFromIterations(iterations, config.agent.domain);
  }
  
  // v11.5.0: Phase 3 - Force output extraction on max_iterations
  // Even if we hit max iterations, capture whatever work was done
  if (terminationReason === 'max_iterations' && lastAssistantMsg) {
    console.log(`[AgentLoop] ${config.agent.domain} reached max_iterations - forcing final output extraction`);
    
    // Try to extract output even if normal detection failed
    if (!finalOutput || !finalOutput.summary) {
      const forcedOutput = extractFinalOutput(lastAssistantMsg);
      if (forcedOutput && forcedOutput.summary && forcedOutput.summary.length > 100) {
        finalOutput = forcedOutput;
        // Upgrade to goal_complete if we actually have meaningful output
        terminationReason = 'goal_complete';
        console.log(`[AgentLoop] ${config.agent.domain} upgraded to goal_complete - found ${forcedOutput.summary.length} chars of output`);
      }
    }
  }
  
  // v11.5.1: Post-execution learning — persist agent reflections as patterns
  try {
    await persistAgentLearnings(config.supabase, config.organizationId, config.agent.domain, iterations, terminationReason);
  } catch (learnErr) {
    console.error(`[AgentLoop] Learning persistence error (non-fatal):`, learnErr);
  }

  // v11.4.0: Log final token usage
  console.log(`[AgentLoop] ${config.agent.domain} final tokens: input=${totalTokensInput}, output=${totalTokensOutput}, termination=${terminationReason}`);

  return {
    success: terminationReason === 'goal_complete',
    goal: config.goal,
    iterations,
    finalOutput,
    toolsUsed: Array.from(toolsUsed),
    memoryQueriesCount,
    totalDurationMs: Date.now() - startTime,
    terminationReason,
    // v11.4.0: Include token usage in result
    tokensUsed: {
      input: totalTokensInput,
      output: totalTokensOutput
    }
  };
}

// ============================================================================
// STEP IMPLEMENTATIONS
// ============================================================================

interface ThinkResult {
  textContent: string;
  hasToolUse: boolean;
  toolUses: Array<{ id: string; name: string; input: Record<string, any> }>;
  rawContent: any[];
  // v11.4.0: Token tracking from Claude response
  tokensUsed: {
    input: number;
    output: number;
  };
}

async function thinkStep(
  apiKey: string,
  systemPrompt: string,
  conversationHistory: any[],
  tools: Tool[]
): Promise<ThinkResult> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages: conversationHistory
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  const textBlocks = data.content.filter((b: any) => b.type === 'text');
  const toolBlocks = data.content.filter((b: any) => b.type === 'tool_use');
  
  // v11.4.0: Extract token usage from Claude response
  const tokensUsed = {
    input: data.usage?.input_tokens || 0,
    output: data.usage?.output_tokens || 0
  };
  
  console.log(`[AgentLoop] thinkStep tokens: input=${tokensUsed.input}, output=${tokensUsed.output}`);
  
  return {
    textContent: textBlocks.map((b: any) => b.text).join('\n'),
    hasToolUse: toolBlocks.length > 0,
    toolUses: toolBlocks.map((b: any) => ({
      id: b.id,
      name: b.name,
      input: b.input
    })),
    rawContent: data.content,
    tokensUsed
  };
}

interface ToolExecutionResult {
  result: any;
  success: boolean;
  isMemoryQuery: boolean;
  errorMessage?: string;
}

async function executeToolWithMemory(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  toolName: string,
  toolInput: Record<string, any>,
  domain: string
): Promise<ToolExecutionResult> {
  const isMemoryQuery = toolName.startsWith('search_') ||
                        toolName.startsWith('retrieve_') ||
                        toolName.startsWith('get_tacit') ||
                        toolName.startsWith('check_prediction') ||
                        toolName.startsWith('store_learned') ||
                        toolName.startsWith('store_prediction');
  
  try {
    // Import and execute from tool registry
    const { executeAgentTool } = await import('./tool-registry.ts');
    const result = await executeAgentTool(supabase, organizationId, toolName, toolInput, domain);
    
    return {
      result,
      success: true,
      isMemoryQuery
    };
  } catch (error) {
    return {
      result: null,
      success: false,
      isMemoryQuery,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function reflectStep(
  apiKey: string,
  goal: string,
  iterations: AgentIteration[],
  lastToolResults: ToolResult[]
): Promise<ReflectionStep> {
  // Summarize progress
  const progressSummary = iterations.map(it => 
    `Iteration ${it.iteration}: ${it.thought.nextAction} → ${it.observation?.success ? 'success' : 'failed'}`
  ).join('\n');
  
  const reflectionPrompt = `
You are reflecting on your progress toward a goal.

GOAL: ${goal}

PROGRESS SO FAR:
${progressSummary}

LAST ACTION RESULTS:
${lastToolResults.map(r => r.content.substring(0, 500)).join('\n')}

Evaluate your progress and respond in JSON:
{
  "goal_progress": 0.0-1.0,
  "should_continue": true/false,
  "adjusted_strategy": "string or null",
  "learnings": ["what you learned"]
}
`;
  
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: reflectionPrompt }]
      })
    });
    
    if (!response.ok) {
      return {
        goalProgress: 0.5,
        shouldContinue: true,
        learnings: []
      };
    }
    
    const data = await response.json();
    const text = data.content[0]?.text || '{}';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        goalProgress: parsed.goal_progress || 0.5,
        shouldContinue: parsed.should_continue !== false,
        adjustedStrategy: parsed.adjusted_strategy,
        learnings: parsed.learnings || []
      };
    }
    
    return {
      goalProgress: 0.5,
      shouldContinue: true,
      learnings: []
    };
  } catch (error) {
    console.error('[AgentLoop] Reflection error:', error);
    return {
      goalProgress: 0.5,
      shouldContinue: true,
      learnings: []
    };
  }
}

// ============================================================================
// MEMORY INTEGRATION
// ============================================================================

async function retrieveMemoryContext(
  supabase: ReturnType<typeof createClient>,
  goal: string,
  organizationId: string
): Promise<MemoryContext | null> {
  try {
    const embedding = generateEmbedding(goal);

    // v11.6.0: FEDERATED — query ORG + CORE Brain in parallel
    const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';

    // Helper: run a query for both ORG and CORE, merge results with labels
    const federatedFlatQuery = async (
      table: string,
      buildQuery: (orgId: string) => any,
      orgLimit: number = 5,
      coreLimit: number = 3
    ) => {
      const [orgRes, coreRes] = await Promise.all([
        buildQuery(organizationId),
        buildQuery(CORE_ORG_ID)
      ]);
      const orgData = (orgRes.data || []).map((d: any) => ({ ...d, _source: 'org' }));
      const coreData = (coreRes.data || []).slice(0, coreLimit).map((d: any) => ({ ...d, _source: 'core' }));
      return [...orgData, ...coreData];
    };

    // Parallel FEDERATED memory queries across L2-L7 INCLUDING human decisions
    const [patterns, causalChains, tacitKnowledge, predictions, humanDecisions] = await Promise.all([
      // L2-L3: Patterns — FEDERATED (ORG + CORE baseline patterns)
      federatedFlatQuery('ai_memory', (orgId) =>
        supabase.rpc('search_ai_memory', {
          query_embedding: `[${embedding.join(',')}]`,
          org_id: orgId,
          match_threshold: 0.4,
          match_count: 5,
        }).then((res: any) => {
          if (res.error) {
            return supabase
              .from('ai_memory')
              .select('*')
              .eq('organization_id', orgId)
              .eq('is_active', true)
              .order('confidence', { ascending: false })
              .limit(5);
          }
          return res;
        })
      ),

      // L4: Causal chains — FEDERATED (ORG chains + CORE baseline chains)
      federatedFlatQuery('causal_chains', (orgId) =>
        supabase
          .from('causal_chains')
          .select('*')
          .eq('organization_id', orgId)
          .eq('validated', true)
          .order('confidence', { ascending: false })
          .limit(5)
      ),

      // L7: Tacit knowledge — ORG only (human knowledge is org-specific)
      supabase.rpc('search_tacit_knowledge', {
        query_embedding: `[${embedding.join(',')}]`,
        match_threshold: 0.4,
        org_id: organizationId,
      }).then((res: any) => {
        if (res.error) {
          console.warn('[AgentLoop] Tacit knowledge fallback:', res.error.message);
          return supabase
            .from('tacit_knowledge_patterns')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('confidence', { ascending: false })
            .limit(5);
        }
        return res;
      }).then((res: any) => res.data || []),

      // L6: Recent predictions — ORG only (predictions are org-specific)
      supabase
        .from('prediction_records')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5)
        .then((res: any) => res.data || []),

      // L7 CRITICAL: Human decision rationales — ORG only
      supabase
        .from('decision_rationale')
        .select('decision_type, entity_type, recommendation_type, quick_reason, quick_reason_category, rationale_text, domain_knowledge_used, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20)
        .then((res: any) => res.data || [])
    ]);

    return {
      patterns,
      causalChains,
      tacitKnowledge,
      predictions,
      humanDecisions
    };
  } catch (error) {
    console.error('[AgentLoop] Memory retrieval error:', error);
    return null;
  }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildAgentSystemPrompt(agent: DomainAgent, goal: string): string {
  return `You are ${agent.role}, an expert AI agent specialized in ${agent.domain} analysis.

${agent.systemPrompt}

## Your Operating Mode: ReAct Loop

You operate in a Think → Act → Observe cycle:
1. THINK: Reason about what you need to do next to achieve the goal
2. ACT: Use the available tools to gather information or take action
3. OBSERVE: Process the results and update your understanding

## Available Tools

You have access to tools for:
- Querying databases for domain-specific data
- Creating actions and alerts
- Searching memory for similar past situations
- Retrieving causal chains and patterns
- Checking prediction accuracy

## Critical Instructions

1. USE TOOLS ACTIVELY - Don't guess, retrieve data
2. BE SPECIFIC - Always include exact numbers, client names, dollar amounts
3. LEARN FROM MEMORY - Check similar past situations before recommending
4. VALIDATE WITH DATA - Every claim must be backed by tool results
5. COMPLETE THE GOAL - Continue until you have a comprehensive analysis

## Goal

${goal}
`;
}

function buildMemoryContextSection(memory: MemoryContext): string {
  let section = '\n\n## Memory Stack Context (L2-L7 — Federated)\n';

  // v11.6.0: Split patterns into ORG vs CORE for labeled context
  const orgPatterns = memory.patterns.filter((p: any) => p._source !== 'core');
  const corePatterns = memory.patterns.filter((p: any) => p._source === 'core');
  const orgChains = memory.causalChains.filter((c: any) => c._source !== 'core');
  const coreChains = memory.causalChains.filter((c: any) => c._source === 'core');

  // L2-L3: Patterns — ORG first (priority)
  if (orgPatterns.length > 0) {
    section += '\n### YOUR ORGANIZATION — Learned Patterns (L2-L3, PRIORITY)\n';
    for (const p of orgPatterns.slice(0, 3)) {
      section += `- ${p.title}: ${JSON.stringify(p.content).substring(0, 200)}\n`;
    }
  }

  if (corePatterns.length > 0) {
    section += '\n### INDUSTRY BASELINE — Patterns (L2-L3, Reference)\n';
    for (const p of corePatterns.slice(0, 3)) {
      section += `- ${p.title}: ${JSON.stringify(p.content).substring(0, 200)}\n`;
    }
  }

  // L4: Causal Chains — ORG first
  if (orgChains.length > 0) {
    section += '\n### YOUR ORGANIZATION — Causal Chains (L4, PRIORITY)\n';
    for (const c of orgChains.slice(0, 3)) {
      section += `- ${c.source_domain}:${c.source_signal} \u2192 ${c.target_domain}:${c.target_effect} (${Math.round((c.confidence || 0) * 100)}% confidence)\n`;
    }
  }

  if (coreChains.length > 0) {
    section += '\n### INDUSTRY BASELINE — Causal Chains (L4, Reference)\n';
    for (const c of coreChains.slice(0, 3)) {
      section += `- ${c.source_domain}:${c.source_signal} \u2192 ${c.target_domain}:${c.target_effect} (${Math.round((c.confidence || 0) * 100)}% confidence)\n`;
    }
  }

  // L7: Tacit Knowledge — always ORG (human knowledge is org-specific)
  if (memory.tacitKnowledge.length > 0) {
    section += '\n### Organizational Wisdom (L7)\n';
    for (const t of memory.tacitKnowledge.slice(0, 3)) {
      section += `- ${t.knowledge_statement}\n`;
    }
  }

  if (memory.predictions.length > 0) {
    section += '\n### Recent Predictions (L6)\n';
    const accurate = memory.predictions.filter((p: any) => p.outcome_verified).length;
    section += `- Prediction accuracy: ${accurate}/${memory.predictions.length} verified\n`;
  }

  // L7 CRITICAL: Human Decision Rationales - Learning from human judgement
  if (memory.humanDecisions.length > 0) {
    section += '\n### Recent Human Decisions (L7 - CRITICAL LEARNING)\n';
    section += 'Learn from how humans handled similar situations:\n';

    for (const d of memory.humanDecisions.slice(0, 5)) {
      const decisionLabel = d.decision_type?.replace(/_/g, ' ') || 'decision';
      const category = d.quick_reason_category || 'general';
      section += `- ${decisionLabel}: "${d.quick_reason || 'No reason given'}" (${category})\n`;

      if (d.rationale_text) {
        section += `  Detailed context: ${d.rationale_text.substring(0, 150)}\n`;
      }

      if (d.domain_knowledge_used) {
        section += `  Unwritten rule: ${d.domain_knowledge_used.substring(0, 100)}\n`;
      }
    }

    // Aggregate patterns from decisions
    const acceptedCount = memory.humanDecisions.filter((d: any) =>
      d.decision_type?.includes('accepted') || d.quick_reason_category === 'completed'
    ).length;
    const rejectedCount = memory.humanDecisions.filter((d: any) =>
      d.decision_type?.includes('rejected') || d.quick_reason_category === 'not_needed'
    ).length;

    if (acceptedCount > 0 || rejectedCount > 0) {
      section += `\n  \u2192 Human acceptance rate: ${acceptedCount}/${memory.humanDecisions.length} (${Math.round(acceptedCount / memory.humanDecisions.length * 100)}%)\n`;
      section += '  \u2192 Adjust your recommendations based on what humans typically accept/reject\n';
    }
  }

  // Federation instruction for the agent
  section += '\nINSTRUCTION: Use YOUR ORGANIZATION data as primary guidance. Reference INDUSTRY BASELINE only when org data is insufficient or for benchmarking.\n';

  return section;
}

/**
 * v11.4.0: Enhanced final output extraction with robust structured output parsing
 */
function extractFinalOutput(lastMessage: any): any {
  if (!lastMessage?.content) return null;
  
  const textBlocks = lastMessage.content.filter((b: any) => b.type === 'text');
  if (textBlocks.length === 0) return null;
  
  const text = textBlocks.map((b: any) => b.text).join('\n');
  
  // v11.4.0: Log extraction attempt
  console.log(`[AgentLoop] extractFinalOutput: text length=${text.length}`);
  
  // Try to parse as JSON first
  try {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Try direct JSON parse
    if (text.trim().startsWith('{')) {
      return JSON.parse(text);
    }
  } catch {
    // Continue to structured text parsing
  }
  
  // v11.4.0: Parse structured markdown output
  // Agents produce markdown with headers like ## Key Findings, ## Recommended Actions, etc.
  const sections: Record<string, string> = {};
  let currentSection = 'summary';
  let currentContent: string[] = [];
  
  for (const line of text.split('\n')) {
    // Detect section headers
    const headerMatch = line.match(/^#+\s*\*?\*?([^*]+)\*?\*?\s*$/);
    if (headerMatch) {
      // Save previous section
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      // Start new section
      currentSection = headerMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  // v11.4.0: Return structured output if we found sections
  if (Object.keys(sections).length > 1) {
    return {
      format: 'structured_markdown',
      summary: text,
      sections,
      parsedAt: new Date().toISOString()
    };
  }
  
  // Fallback to simple text output
  return { 
    format: 'text',
    textOutput: text,
    length: text.length
  };
}

/**
 * v11.7.0: Build summary from iteration data when no final text output available
 * This ensures we capture work done even if Claude didn't provide a clean summary
 */
function buildSummaryFromIterations(iterations: AgentIteration[], domain: string): any {
  if (!iterations || iterations.length === 0) {
    return {
      summary: `${domain} agent completed but produced no output.`,
      textOutput: '',
      incomplete: true,
      format: 'fallback'
    };
  }
  
  // Collect tool names used
  const toolsUsed = iterations
    .filter(i => i.action?.toolName)
    .map(i => i.action!.toolName);
  
  // Collect any reasoning from iterations
  const reasoningParts = iterations
    .filter(i => i.thought?.reasoning && i.thought.reasoning.length > 50)
    .map(i => i.thought.reasoning)
    .slice(-3); // Take last 3 reasoning blocks
  
  // Look for any observation results that might be useful
  const successfulObservations = iterations
    .filter(i => i.observation?.success && i.observation.result)
    .map(i => {
      try {
        const result = typeof i.observation!.result === 'string' 
          ? JSON.parse(i.observation!.result) 
          : i.observation!.result;
        return result;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  
  // Build a summary from available data
  const summary = reasoningParts.length > 0 
    ? reasoningParts.join('\n\n---\n\n')
    : `${domain} agent completed ${iterations.length} iterations using ${toolsUsed.length} tool calls: ${[...new Set(toolsUsed)].join(', ')}`;
  
  console.log(`[AgentLoop] buildSummaryFromIterations: built ${summary.length} char summary from ${iterations.length} iterations`);
  
  return {
    summary: summary.substring(0, 2000),
    format: 'iteration_synthesis',
    toolsUsed: [...new Set(toolsUsed)],
    iterationCount: iterations.length,
    observationCount: successfulObservations.length,
    incomplete: true,
    textOutput: summary
  };
}

// ============================================================================
// POST-EXECUTION LEARNING (v11.5.1)
// ============================================================================

/**
 * Persist agent learnings back into the memory stack after execution.
 * Closes the learning loop: Agent reads memory → analyzes → writes discoveries back.
 *
 * What gets persisted:
 * 1. Reflection learnings → ai_memory as patterns (L3)
 * 2. Cross-domain signals for other agents (L7)
 */
async function persistAgentLearnings(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  domain: string,
  iterations: AgentIteration[],
  terminationReason: string
): Promise<void> {
  // Only persist if the agent completed successfully with meaningful work
  if (terminationReason === 'error' || iterations.length === 0) return;

  // v11.6.0 GUARD: Never write learnings to CORE brain
  const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
  if (organizationId === CORE_ORG_ID) {
    console.warn('[AgentLoop] Blocked write to CORE brain — learnings are org-scoped');
    return;
  }

  const { getClientForTableInEdge } = await import('./get-brain-client.ts');
  const brainClient = getClientForTableInEdge('ai_memory');

  // 1. Extract learnings from reflection steps and store as patterns
  const reflectionLearnings = iterations
    .filter(i => i.reflection?.learnings?.length)
    .flatMap(i => i.reflection!.learnings);

  if (reflectionLearnings.length > 0) {
    const learningsSummary = reflectionLearnings.join('; ');

    await brainClient.from('ai_memory').insert({
      organization_id: organizationId,
      memory_type: 'agent_learning',
      entity_type: 'agent_run',
      title: `${domain} agent learning: ${learningsSummary.substring(0, 80)}`,
      content: {
        domain,
        learnings: reflectionLearnings,
        iteration_count: iterations.length,
        termination: terminationReason,
        tools_used: [...new Set(iterations.filter(i => i.action).map(i => i.action!.toolName))],
        timestamp: new Date().toISOString()
      },
      confidence: 0.7,
      severity: 'info',
      is_active: true
    });

    console.log(`[AgentLoop] Persisted ${reflectionLearnings.length} learnings for ${domain}`);
  }

  // 2. Store a cross-domain signal so other agents benefit
  const signalClient = getClientForTableInEdge('cross_domain_signals');
  await signalClient.from('cross_domain_signals').insert({
    organization_id: organizationId,
    source_domain: domain,
    signal_type: 'agent_completion',
    signal_value: iterations.length,
    entity_type: 'agent_run',
    metadata: {
      termination: terminationReason,
      tools_used: [...new Set(iterations.filter(i => i.action).map(i => i.action!.toolName))],
      has_reflections: reflectionLearnings.length > 0,
      learning_count: reflectionLearnings.length,
      timestamp: new Date().toISOString()
    }
  });
}

// ============================================================================
// AGENT EXECUTION TRACKING
// ============================================================================

/**
 * Log agent execution to database for analysis and learning
 */
export async function logAgentExecution(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  result: AgentResult,
  agentType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('agent_executions')
      .insert({
        organization_id: organizationId,
        agent_type: agentType,
        goal: result.goal,
        execution_plan: null,
        iterations: result.iterations.length,
        tools_used: result.toolsUsed,
        memory_queries: result.memoryQueriesCount,
        reflection_count: result.iterations.filter(i => i.reflection).length,
        success: result.success,
        completed_at: new Date().toISOString(),
        result: result.finalOutput
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[AgentLoop] Failed to log execution:', error);
      return null;
    }
    
    // Log individual tool calls
    const executionId = data.id;
    const toolCalls = result.iterations
      .filter(it => it.action)
      .map(it => ({
        execution_id: executionId,
        tool_name: it.action!.toolName,
        tool_input: it.action!.toolInput,
        tool_output: it.observation?.result,
        duration_ms: it.durationMs
      }));
    
    if (toolCalls.length > 0) {
      await supabase.from('agent_tool_calls').insert(toolCalls);
    }
    
    // Log reflections
    const reflections = result.iterations
      .filter(it => it.reflection)
      .map(it => ({
        execution_id: executionId,
        iteration: it.iteration,
        goal_progress: it.reflection!.goalProgress,
        should_adjust: !!it.reflection!.adjustedStrategy,
        adjustment_reason: it.reflection!.adjustedStrategy
      }));
    
    if (reflections.length > 0) {
      await supabase.from('agent_reflections').insert(reflections);
    }
    
    return executionId as string | null;
  } catch (error) {
    console.error('[AgentLoop] Execution logging error:', error);
    return null;
  }
}
