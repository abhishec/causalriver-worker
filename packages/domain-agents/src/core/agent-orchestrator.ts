/**
 * Agent Orchestrator - Enterprise AI Agent Coordination Layer
 * 
 * Coordinates parallel execution of domain agents and synthesizes results.
 * Implements concurrency control, cross-domain pattern detection, 
 * inter-agent blackboard communication, and executive synthesis.
 * 
 * Part of Phase 8.3: Enterprise AI Agent Transformation
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { type AgentResult } from "./agent-loop.ts";
import { blackboard, formatBlackboardContext, postDiscovery, postAlert } from "./agent-blackboard.ts";
import { getMetricKnowledgeForDomain } from "./nexus-brain-integration.ts";
import { processCompletedActions, applyConfidenceDecay } from "./outcome-learner.ts";

// Domain agent imports
import { runFinanceAgent, type FinanceAgentInput } from "../ai-batch-processor/domain-agents/finance-agent.ts";
import { runCSAgent, type CSAgentInput } from "../ai-batch-processor/domain-agents/cs-agent.ts";
import { runRevenueAgent, type RevenueAgentInput } from "../ai-batch-processor/domain-agents/revenue-agent.ts";
import { runAMAgent, type AMAgentInput } from "../ai-batch-processor/domain-agents/am-agent.ts";
import { runServicesAgent, type ServicesAgentInput } from "../ai-batch-processor/domain-agents/services-agent.ts";
import { runExecutiveAgent, type ExecutiveAgentInput, type DomainAgentOutput } from "../ai-batch-processor/domain-agents/executive-agent.ts";
// v11.5.0: Complete domain agent coverage
import { runMarketingAgent, type MarketingAgentInput } from "../ai-batch-processor/domain-agents/marketing-agent.ts";
import { runPeopleAgent, type PeopleAgentInput } from "../ai-batch-processor/domain-agents/people-agent.ts";
import { runProductAgent, type ProductAgentInput } from "../ai-batch-processor/domain-agents/product-agent.ts";
import { runAnalystAgent, type AnalystAgentInput } from "../ai-batch-processor/domain-agents/analyst-agent.ts";
import { runEngineeringAgent, type EngineeringAgentInput } from "../ai-batch-processor/domain-agents/engineering-agent.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestrationConfig {
  maxConcurrency: number;
  enableExecutiveSynthesis: boolean;
  timeoutMs: number;
  onProgress?: (domain: string, status: 'started' | 'completed' | 'failed') => void;
}

export interface OrchestrationResult {
  domainResults: Record<string, AgentResult>;
  crossDomainInsights: CrossDomainInsight[];
  executiveSummary: string;
  totalToolCalls: number;
  totalMemoryQueries: number;
  totalIterations: number;
  durationMs: number;
  success: boolean;
  blackboardEntries: number;  // Phase 8.3: Track inter-agent communication
}

export interface CrossDomainInsight {
  type: 'risk' | 'opportunity' | 'pattern' | 'correlation';
  sourceDomains: string[];
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}

export interface DataSnapshot {
  invoices?: any[];
  clients?: any[];
  contracts?: any[];
  healthScores?: any[];
  npsScores?: any[];
  usageData?: any[];
  deals?: any[];
  projects?: any[];
  milestones?: any[];
  resources?: any[];
  paymentHistory?: any[];
  supportTickets?: any[];
  quota?: number;
  organizationMetrics?: any;
  // v11.5.0: Marketing domain data
  marketingData?: { goals?: any[]; campaigns?: any[] };
  vpMarketingAnalysis?: any;
  // v11.5.0: People domain data
  peopleData?: { employees?: any[]; departments?: any[] };
  vpPeopleAnalysis?: any;
  // v11.5.0: Product domain data
  productFeatures?: any[];
  vpProductDelayAnalysis?: any;
  // v11.5.0: Cross-domain analysis data for Analyst
  summary?: any;
  cfoAnalysis?: any;
  vpSalesAnalysis?: any;
  vpCSAnalysis?: any;
  vpAMAnalysis?: any;
  vpServicesAnalysis?: any;
  criticalClients?: any[];
  atRiskClients?: any[];
  overdueInvoices?: any[];
  topDeals?: any[];
}

// ============================================================================
// ORCHESTRATOR CORE
// ============================================================================

const DEFAULT_CONFIG: OrchestrationConfig = {
  maxConcurrency: 3, // Run 3 agents in parallel to balance speed vs. resource usage
  enableExecutiveSynthesis: true,
  timeoutMs: 180000 // 3 minute total timeout
};

/**
 * Orchestrate domain agents in parallel with cross-domain synthesis
 */
export async function orchestrateDomainAgents(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  snapshot: DataSnapshot,
  domains: string[],
  config: Partial<OrchestrationConfig> = {},
  batchRunId?: string  // v11.3.0: Pass batch run ID for chunk tracking
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  console.log(`[Orchestrator] Starting orchestration for ${domains.length} domains (Phase 8.3 with Blackboard)${batchRunId ? ` [batch: ${batchRunId}]` : ''}`);
  
  // Phase 8.3: Clear blackboard for fresh run
  blackboard.clear();
  
  // Phase 8.3: Set up cross-domain subscriptions for real-time intelligence sharing
  setupBlackboardSubscriptions(domains);
  
  const domainResults: Record<string, AgentResult> = {};
  let totalToolCalls = 0;
  let totalMemoryQueries = 0;
  let totalIterations = 0;
  
  // Run domain agents with concurrency limit
  const chunks = chunkArray(domains, mergedConfig.maxConcurrency);
  
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (domain) => {
        const domainStartTime = Date.now();
        mergedConfig.onProgress?.(domain, 'started');
        
        // v11.3.0: Mark chunk as started before running agent
        if (batchRunId) {
          try {
            await supabase.from('ai_batch_chunks').update({
              status: 'running',
              started_at: new Date().toISOString()
            }).eq('batch_run_id', batchRunId).eq('domain', domain);
          } catch (dbErr) {
            console.warn(`[Orchestrator] Failed to update chunk started status for ${domain}:`, dbErr);
          }
        }
        
        try {
          // Phase 8.3: Get blackboard context for this agent
          const blackboardContext = formatBlackboardContext(domain);
          
          const result = await runDomainAgent(
            domain,
            supabase,
            organizationId,
            anthropicApiKey,
            snapshot,
            blackboardContext  // Pass blackboard context to agent
          );
          
          // v11.7.0: Enhanced debug logging for token flow and output tracking
          console.log(`[Orchestrator] ${domain} agent completed in ${Date.now() - domainStartTime}ms:`, {
            success: result.success,
            iterations: result.iterations.length,
            termination: result.terminationReason,
            tokensUsed: result.tokensUsed,
            hasOutput: !!result.finalOutput,
            outputKeys: result.finalOutput ? Object.keys(result.finalOutput) : null,
            summaryLength: result.finalOutput?.summary?.length || 0
          });
          
          // Phase 8.3: Post agent discoveries to blackboard for other agents
          postAgentDiscoveries(domain, result);
          
          // v11.3.0: Mark chunk as completed after agent returns
          // v11.4.0: Save token usage to ai_batch_chunks
          // v11.6.0: Save partial output on max_iterations (not just complete failure)
          if (batchRunId) {
            try {
              // v11.6.0: Determine if we have meaningful output even on failure
              const hasMeaningfulOutput = 
                (result.finalOutput?.summary?.length > 100) || 
                (result.finalOutput?.textOutput?.length > 100) ||
                (typeof result.finalOutput === 'string' && result.finalOutput.length > 100);
              
              // v11.6.0: Use 'partial' status when we have output but didn't complete normally
              const chunkStatus = result.success 
                ? 'completed' 
                : (hasMeaningfulOutput ? 'partial' : 'failed');
              
              await supabase.from('ai_batch_chunks').update({
                status: chunkStatus,
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - domainStartTime,
                error_message: result.success ? null : result.terminationReason,
                // v11.4.0: Save token tracking data
                tokens_input: result.tokensUsed?.input || 0,
                tokens_output: result.tokensUsed?.output || 0,
                // v11.6.0: Always save workspace summary if available (even on partial/failure)
                workspace_summary: result.finalOutput || null
              }).eq('batch_run_id', batchRunId).eq('domain', domain);
              
              console.log(`[Orchestrator] ${domain} chunk saved: status=${chunkStatus}, tokens=${result.tokensUsed?.input || 0}/${result.tokensUsed?.output || 0}`);
            } catch (dbErr) {
              console.warn(`[Orchestrator] Failed to update chunk completed status for ${domain}:`, dbErr);
            }
          }
          
          mergedConfig.onProgress?.(domain, 'completed');
          return { domain, result };
        } catch (error) {
          console.error(`[Orchestrator] Agent ${domain} failed:`, error);
          
          // v11.3.0: Mark chunk as failed on error
          if (batchRunId) {
            try {
              await supabase.from('ai_batch_chunks').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - domainStartTime,
                error_message: error instanceof Error ? error.message : 'Unknown error'
              }).eq('batch_run_id', batchRunId).eq('domain', domain);
            } catch (dbErr) {
              console.warn(`[Orchestrator] Failed to update chunk failed status for ${domain}:`, dbErr);
            }
          }
          
          // Phase 8.3: Post failure alert to blackboard
          postAlert(
            domain,
            domain,
            'agent_failure',
            `${domain} agent encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ['executive', 'all']
          );
          
          mergedConfig.onProgress?.(domain, 'failed');
          throw error;
        }
      })
    );
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { domain, result: agentResult } = result.value;
        domainResults[domain] = agentResult;
        totalToolCalls += agentResult.toolsUsed.length;
        totalMemoryQueries += agentResult.memoryQueriesCount;
        totalIterations += agentResult.iterations.length;
      }
    }
    
    // Check overall timeout
    if (Date.now() - startTime > mergedConfig.timeoutMs) {
      console.warn('[Orchestrator] Timeout reached, skipping remaining domains');
      break;
    }
  }
  
  // Detect cross-domain patterns (now enhanced with blackboard data)
  const crossDomainInsights = detectCrossDomainPatterns(domainResults, snapshot);
  
  // Phase 8.3: Add insights from blackboard
  const blackboardInsights = extractBlackboardInsights();
  crossDomainInsights.push(...blackboardInsights);
  
  // Generate executive synthesis
  let executiveSummary = '';
  if (mergedConfig.enableExecutiveSynthesis && Object.keys(domainResults).length > 0) {
    try {
      const executiveResult = await generateExecutiveSynthesis(
        supabase,
        organizationId,
        anthropicApiKey,
        domainResults,
        snapshot.organizationMetrics || {}
      );
      executiveSummary = executiveResult.finalOutput?.summary || extractSummaryFromResult(executiveResult);
      totalToolCalls += executiveResult.toolsUsed.length;
      totalMemoryQueries += executiveResult.memoryQueriesCount;
      totalIterations += executiveResult.iterations.length;
    } catch (error) {
      console.error('[Orchestrator] Executive synthesis failed:', error);
      executiveSummary = generateFallbackSummary(domainResults);
    }
  }
  
  // Phase 8.3: Get blackboard stats for observability
  const bbStats = blackboard.getStats();
  console.log(`[Orchestrator] Blackboard stats: ${bbStats.totalEntries} entries, ${Math.round(bbStats.consumptionRate * 100)}% consumed`);

  // v11.5.1: Persist blackboard to brain BEFORE clearing
  // This closes the learning loop: discoveries → cross_domain_signals + ai_memory
  try {
    const persistResult = await blackboard.persistToDatabase(supabase, organizationId);
    console.log(`[Orchestrator] Blackboard persisted: ${persistResult.signalsStored} signals, ${persistResult.patternsStored} patterns`);
  } catch (persistErr) {
    console.error('[Orchestrator] Blackboard persistence error (non-fatal):', persistErr);
  }

  // v11.5.1: L5 Learning Engine — process completed actions & apply confidence decay
  // This enables Bayesian confidence updates from action outcomes
  try {
    const learningStats = await processCompletedActions(supabase, organizationId, 7);
    const decayCount = await applyConfidenceDecay(supabase, organizationId);
    console.log(`[Orchestrator] L5 Learning: ${learningStats.patternsUpdated} patterns updated, ${decayCount} decayed, ${(learningStats.successRate * 100).toFixed(0)}% success rate`);
  } catch (learnErr) {
    console.error('[Orchestrator] L5 learning error (non-fatal):', learnErr);
  }

  // v11.6.0: PERCOLATION — promote high-confidence org patterns to CORE brain
  // This enables collective learning: org discoveries → anonymized → CORE baseline
  try {
    const { percolateToCore } = await import('./federated-brain.ts');
    const percolationResult = await percolateToCore(organizationId, {
      minConfidence: 0.9,
      minAccessCount: 5,
      maxPerBatch: 5
    });
    if (percolationResult.percolated > 0) {
      console.log(`[Orchestrator] Percolation: ${percolationResult.percolated} patterns promoted to CORE brain, ${percolationResult.skippedDuplicates} duplicates skipped`);
    }
  } catch (percolateErr) {
    console.error('[Orchestrator] Percolation error (non-fatal):', percolateErr);
  }

  return {
    domainResults,
    crossDomainInsights,
    executiveSummary,
    totalToolCalls,
    totalMemoryQueries,
    totalIterations,
    durationMs: Date.now() - startTime,
    success: Object.keys(domainResults).length > 0,
    blackboardEntries: bbStats.totalEntries
  };
}

// ============================================================================
// DOMAIN AGENT ROUTING
// ============================================================================

async function runDomainAgent(
  domain: string,
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  snapshot: DataSnapshot,
  blackboardContext?: string  // Phase 8.3: Cross-domain intelligence context
): Promise<AgentResult> {
  console.log(`[Orchestrator] Running ${domain} agent with blackboard context: ${blackboardContext ? 'yes' : 'no'}`);
  
  // Common options with blackboard context + domain metric knowledge
  const metricKnowledge = getMetricKnowledgeForDomain(domain);
  const nexusBrainContext = (snapshot as any).nexusBrainContext || '';
  const opts = { blackboardContext, metricKnowledge, nexusBrainContext };
  
  switch (domain) {
    case 'finance':
      return await runFinanceAgent(supabase, organizationId, anthropicApiKey, {
        invoices: snapshot.invoices,
        clients: snapshot.clients,
        contracts: snapshot.contracts,
        paymentHistory: snapshot.paymentHistory,
        healthScores: snapshot.healthScores,
        ...opts
      });
    
    case 'cs':
      return await runCSAgent(supabase, organizationId, anthropicApiKey, {
        clients: snapshot.clients,
        healthScores: snapshot.healthScores,
        npsScores: snapshot.npsScores,
        usageData: snapshot.usageData,
        supportTickets: snapshot.supportTickets,
        ...opts
      });
    
    case 'revenue':
      return await runRevenueAgent(supabase, organizationId, anthropicApiKey, {
        deals: snapshot.deals?.filter((d: any) => d.category === 'new_logo' || !d.category),
        quota: snapshot.quota,
        ...opts
      });
    
    case 'am':
    case 'account-management':
      return await runAMAgent(supabase, organizationId, anthropicApiKey, {
        clients: snapshot.clients,
        contracts: snapshot.contracts,
        healthScores: snapshot.healthScores,
        expansionDeals: snapshot.deals?.filter((d: any) => d.category === 'expansion'),
        renewalDeals: snapshot.deals?.filter((d: any) => d.category === 'renewal'),
        invoices: snapshot.invoices,
        ...opts
      });
    
    case 'services':
      return await runServicesAgent(supabase, organizationId, anthropicApiKey, {
        projects: snapshot.projects,
        milestones: snapshot.milestones,
        resources: snapshot.resources,
        ...opts
      });

    // v11.5.0: New domain agents for complete coverage
    case 'marketing':
      return await runMarketingAgent(supabase, organizationId, anthropicApiKey, {
        marketingGoals: snapshot.marketingData?.goals,
        campaigns: snapshot.marketingData?.campaigns,
        vpMarketingAnalysis: snapshot.vpMarketingAnalysis,
        deals: snapshot.deals,
        ...opts
      });

    case 'people':
      return await runPeopleAgent(supabase, organizationId, anthropicApiKey, {
        employees: snapshot.peopleData?.employees,
        departments: snapshot.peopleData?.departments,
        vpPeopleAnalysis: snapshot.vpPeopleAnalysis,
        ...opts
      });

    case 'product':
      return await runProductAgent(supabase, organizationId, anthropicApiKey, {
        productFeatures: snapshot.productFeatures,
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis,
        clients: snapshot.clients,
        ...opts
      });

    case 'analyst':
      return await runAnalystAgent(supabase, organizationId, anthropicApiKey, {
        summary: snapshot.summary,
        cfoAnalysis: snapshot.cfoAnalysis,
        vpSalesAnalysis: snapshot.vpSalesAnalysis,
        vpCSAnalysis: snapshot.vpCSAnalysis,
        vpAMAnalysis: snapshot.vpAMAnalysis,
        vpServicesAnalysis: snapshot.vpServicesAnalysis,
        vpMarketingAnalysis: snapshot.vpMarketingAnalysis,
        vpPeopleAnalysis: snapshot.vpPeopleAnalysis,
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis,
        criticalClients: snapshot.criticalClients,
        atRiskClients: snapshot.atRiskClients,
        overdueInvoices: snapshot.overdueInvoices,
        topDeals: snapshot.topDeals,
        ...opts
      });

    case 'engineering':
      return await runEngineeringAgent(supabase, organizationId, anthropicApiKey, {
        productFeatures: snapshot.productFeatures,
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis,
        ...opts
      });

    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}

// ============================================================================
// PHASE 8.3: BLACKBOARD INTEGRATION
// ============================================================================

/**
 * Set up cross-domain subscriptions for real-time intelligence sharing
 */
function setupBlackboardSubscriptions(domains: string[]): void {
  for (const domain of domains) {
    blackboard.subscribe(domain, (entry) => {
      console.log(`[Blackboard] ${domain} received: ${entry.entryType} from ${entry.agentId}`);
    });
  }
  
  // Executive agent subscribes to all
  blackboard.subscribe('executive', (entry) => {
    console.log(`[Blackboard] Executive monitoring: ${entry.entryType} from ${entry.agentId}`);
  });
}

/**
 * Post agent discoveries to blackboard for cross-domain awareness
 */
function postAgentDiscoveries(domain: string, result: AgentResult): void {
  if (!result.success || !result.finalOutput) return;
  
  const output = result.finalOutput;
  
  // Post overdue clients from finance
  if (domain === 'finance' && output.overdueClients?.length > 0) {
    postDiscovery(
      domain,
      domain,
      { 
        type: 'overdue_clients',
        clients: output.overdueClients.slice(0, 5),
        totalOverdue: output.totalOverdue
      },
      ['cs', 'am', 'account-management'],
      'high',
      0.9
    );
  }
  
  // Post at-risk clients from CS
  if (domain === 'cs' && output.atRiskClients?.length > 0) {
    postDiscovery(
      domain,
      domain,
      {
        type: 'health_alerts',
        clients: output.atRiskClients.slice(0, 5),
        avgHealthDrop: output.avgHealthDrop
      },
      ['finance', 'am', 'account-management', 'revenue'],
      'high',
      0.85
    );
  }
  
  // Post pipeline risks from revenue
  if (domain === 'revenue' && output.staleDeals?.length > 0) {
    postDiscovery(
      domain,
      domain,
      {
        type: 'stale_pipeline',
        deals: output.staleDeals.slice(0, 5),
        pipelineGap: output.pipelineGap
      },
      ['executive'],
      'medium',
      0.8
    );
  }
  
  // Post delivery risks from services
  if (domain === 'services' && output.delayedProjects?.length > 0) {
    postAlert(
      domain,
      domain,
      'delivery_risk',
      `${output.delayedProjects.length} projects at risk of delay`,
      ['cs', 'am', 'account-management', 'finance']
    );
  }

  // v11.5.0: Post feature delays from product
  if (domain === 'product' && output.delayedFeatures?.length > 0) {
    postDiscovery(
      domain,
      domain,
      {
        type: 'feature_delays',
        features: output.delayedFeatures.slice(0, 5),
        clientsAffected: output.clientsAffectedCount,
        arrAtRisk: output.totalArrAtRisk
      },
      ['services', 'am', 'account-management', 'cs'],
      'high',
      0.85
    );
  }

  // v11.5.0: Post attrition risks from people
  if (domain === 'people' && output.exitingCount > 0) {
    postAlert(
      domain,
      domain,
      'attrition_risk',
      `${output.exitingCount} employees exiting - capacity risk`,
      ['services', 'executive']
    );
  }

  // v11.5.0: Post marketing goal risks
  if (domain === 'marketing' && output.goalsAtRisk?.length > 0) {
    postDiscovery(
      domain,
      domain,
      {
        type: 'marketing_goals_at_risk',
        goals: output.goalsAtRisk.slice(0, 3)
      },
      ['revenue', 'executive'],
      'medium',
      0.75
    );
  }

  // v11.5.0: Post analyst discoveries
  if (domain === 'analyst' && output.discoveries?.length > 0) {
    for (const discovery of output.discoveries.slice(0, 3)) {
      postDiscovery(
        domain,
        domain,
        {
          type: 'cross_domain_pattern',
          title: discovery.title,
          impact: discovery.dollarImpact,
          confidence: discovery.confidence
        },
        ['executive'],
        discovery.dollarImpact > 50000 ? 'high' : 'medium',
        (discovery.confidence || 70) / 100
      );
    }
  }
}

/**
 * Extract cross-domain insights from blackboard entries
 */
function extractBlackboardInsights(): CrossDomainInsight[] {
  const insights: CrossDomainInsight[] = [];
  
  // Look for correlated discoveries
  const discoveries = blackboard.getEntriesByType('discovery');
  const alerts = blackboard.getEntriesByType('alert');
  
  // Pattern: Finance overdue + CS health drop on same clients
  const financeDiscoveries = discoveries.filter(d => d.domain === 'finance');
  const csDiscoveries = discoveries.filter(d => d.domain === 'cs');
  
  if (financeDiscoveries.length > 0 && csDiscoveries.length > 0) {
    insights.push({
      type: 'correlation',
      sourceDomains: ['finance', 'cs'],
      title: 'Cross-Domain Client Risk Detected via Blackboard',
      description: 'Finance and CS agents independently flagged client issues. Review clients appearing in both domains for coordinated intervention.',
      impact: 'high',
      suggestedAction: 'Prioritize joint Finance-CS review for overlapping at-risk clients'
    });
  }
  
  // Pattern: Multiple alerts indicate systemic issue
  if (alerts.length >= 3) {
    const uniqueDomains = [...new Set(alerts.map(a => a.domain))];
    if (uniqueDomains.length >= 2) {
      insights.push({
        type: 'pattern',
        sourceDomains: uniqueDomains,
        title: 'Multi-Domain Alert Pattern',
        description: `${alerts.length} alerts raised across ${uniqueDomains.length} domains. This may indicate a systemic issue requiring leadership attention.`,
        impact: 'high',
        suggestedAction: 'Schedule cross-functional review to identify root cause'
      });
    }
  }
  
  return insights;
}

// ============================================================================
// CROSS-DOMAIN PATTERN DETECTION
// ============================================================================

function detectCrossDomainPatterns(
  domainResults: Record<string, AgentResult>,
  snapshot: DataSnapshot
): CrossDomainInsight[] {
  const insights: CrossDomainInsight[] = [];
  
  // Pattern 1: Finance + CS correlation (overdue invoices + health drop)
  if (domainResults.finance && domainResults.cs) {
    const financeOutput = domainResults.finance.finalOutput;
    const csOutput = domainResults.cs.finalOutput;
    
    // Check for clients appearing in both finance issues and CS at-risk
    const overdueClients = extractClientIds(financeOutput, 'overdue');
    const atRiskClients = extractClientIds(csOutput, 'at_risk');
    const overlap = overdueClients.filter(id => atRiskClients.includes(id));
    
    if (overlap.length > 0) {
      insights.push({
        type: 'risk',
        sourceDomains: ['finance', 'cs'],
        title: 'Payment-Health Correlation Detected',
        description: `${overlap.length} clients appear in both overdue invoices and at-risk health status. This correlation suggests payment issues may be symptom of deeper relationship problems.`,
        impact: 'high',
        suggestedAction: 'Prioritize AM outreach to understand root cause before collection escalation'
      });
    }
  }
  
  // Pattern 2: Services + CS handoff risk
  if (domainResults.services && domainResults.cs) {
    const servicesOutput = domainResults.services.finalOutput;
    const csOutput = domainResults.cs.finalOutput;
    
    // Check for recently completed projects with declining health
    // This indicates handoff issues
    if (hasRecentGoLives(servicesOutput) && hasHealthDeclines(csOutput)) {
      insights.push({
        type: 'pattern',
        sourceDomains: ['services', 'cs'],
        title: 'Post Go-Live Health Decline Pattern',
        description: 'Clients with recent go-lives are showing health score declines. This may indicate handoff quality issues between Services and CS.',
        impact: 'medium',
        suggestedAction: 'Review handoff process and consider extended hypercare periods'
      });
    }
  }
  
  // Pattern 3: Revenue + AM pipeline balance
  if (domainResults.revenue && domainResults['am'] || domainResults['account-management']) {
    const amDomain = domainResults['am'] || domainResults['account-management'];
    
    // Check if expansion pipeline exceeds new logo pipeline
    // This could indicate market saturation or effective land-and-expand
    insights.push({
      type: 'opportunity',
      sourceDomains: ['revenue', 'account-management'],
      title: 'Pipeline Source Analysis',
      description: 'Review the balance between new logo and expansion pipeline to optimize resource allocation.',
      impact: 'medium',
      suggestedAction: 'Compare CAC for new logos vs. expansion to determine optimal investment mix'
    });
  }
  
  return insights;
}

// ============================================================================
// EXECUTIVE SYNTHESIS
// ============================================================================

async function generateExecutiveSynthesis(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  domainResults: Record<string, AgentResult>,
  organizationMetrics: any
): Promise<AgentResult> {
  // Transform domain results into executive input format
  const domainOutputs: Record<string, DomainAgentOutput> = {};
  
  for (const [domain, result] of Object.entries(domainResults)) {
    domainOutputs[domain] = {
      domain,
      success: result.success,
      summary: extractSummaryFromResult(result),
      keyFindings: result.finalOutput?.findings || result.finalOutput?.keyFindings || [],
      actionsCreated: countActionsCreated(result),
      alertsGenerated: countAlertsGenerated(result),
      toolsUsed: result.toolsUsed
    };
  }
  
  return await runExecutiveAgent(supabase, organizationId, anthropicApiKey, {
    domainOutputs,
    organizationMetrics,
    metricKnowledge: getMetricKnowledgeForDomain('executive'),
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function extractClientIds(output: any, type: string): string[] {
  if (!output) return [];
  
  // Try various common output formats
  const sources = [
    output.overdueInvoices,
    output.atRiskClients,
    output.clients,
    output.findings
  ];
  
  for (const source of sources) {
    if (Array.isArray(source)) {
      return source.map((item: any) => item.clientId || item.client_id).filter(Boolean);
    }
  }
  
  return [];
}

function hasRecentGoLives(output: any): boolean {
  if (!output) return false;
  // Check for indicators of recent go-lives
  return output.recentGoLives?.length > 0 || output.completedProjects?.length > 0;
}

function hasHealthDeclines(output: any): boolean {
  if (!output) return false;
  // Check for health decline indicators
  return output.healthDeclines?.length > 0 || output.decliningClients?.length > 0;
}

function extractSummaryFromResult(result: AgentResult): string {
  if (!result.finalOutput) return 'No summary available';
  
  if (typeof result.finalOutput === 'string') {
    return result.finalOutput.substring(0, 500);
  }
  
  if (result.finalOutput.summary) {
    return result.finalOutput.summary;
  }
  
  if (result.finalOutput.executiveSummary) {
    return result.finalOutput.executiveSummary;
  }
  
  return JSON.stringify(result.finalOutput).substring(0, 500);
}

function countActionsCreated(result: AgentResult): number {
  let count = 0;
  for (const iteration of result.iterations) {
    if (iteration.action?.toolName?.includes('create_')) {
      count++;
    }
  }
  return count;
}

function countAlertsGenerated(result: AgentResult): number {
  // Count alerts from output if available
  if (result.finalOutput?.alertsGenerated) {
    return result.finalOutput.alertsGenerated;
  }
  if (result.finalOutput?.alerts?.length) {
    return result.finalOutput.alerts.length;
  }
  return 0;
}

function generateFallbackSummary(domainResults: Record<string, AgentResult>): string {
  const successCount = Object.values(domainResults).filter(r => r.success).length;
  const totalCount = Object.keys(domainResults).length;
  
  const totalActions = Object.values(domainResults)
    .reduce((sum, r) => sum + countActionsCreated(r), 0);
  
  return `Completed ${successCount}/${totalCount} domain analyses. Created ${totalActions} actions. See domain-specific reports for details.`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  runDomainAgent,
  detectCrossDomainPatterns,
  generateExecutiveSynthesis
};
