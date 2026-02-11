/**
 * Chunk Processor - Domain-Parallel Processing with Cross-Domain Context
 * 
 * v5.0.0 - CRITICAL FIX for JSON Parsing and Token Limits
 * - Fixed string-aware brace matching for JSON parsing
 * - Added aggressive diagnostic logging
 * - Increased token limits: finance/cs/revenue=6000, am/services=5000
 * - Version timestamp: 2026-01-06T08:10:00Z
 */

import { DOMAIN_PERSONAS, buildDomainSystemPrompt, getDomainResponseFormat, PERSONA_VERSION, type GoalContextForPersona } from './domain-personas.ts';
import { classifyException, generateFallbackResponse, getExtendedTimeout, logShieldaEvent, ShieldaContext } from './shielda-handler.ts';
import { CLAUDE_MODEL, ANTHROPIC_API_URL } from './claude-config.ts';

// Goal loading utilities for Goal-Centric Intelligence Engine
export async function loadGoalsForDomain(
  supabase: any,
  organizationId: string,
  domain: string,
  fiscalYear?: string
): Promise<GoalContextForPersona | undefined> {
  try {
    // Map domain to linked_domain values in company_strategic_goals
    const domainMapping: Record<string, string[]> = {
      'finance': ['finance', 'Finance Team'],
      'revenue': ['revenue', 'Revenue Team', 'sales'],
      'cs': ['cs', 'CS Team', 'Customer Service Team', 'Client Success Team'],
      'am': ['am', 'account-management', 'Account Management'],
      'services': ['services', 'Services Team'],
      'product': ['product', 'Product Team'],
      'marketing': ['marketing', 'Marketing Team'],
      'people': ['people', 'People Team', 'HR Team'],
      'engineering': ['engineering', 'Engineering Team', 'Technology'],
      'analyst': ['analyst', 'Intelligence'],
      'executive': ['executive', 'company']
    };

    const linkedDomains = domainMapping[domain] || [domain];
    
    let query = supabase
      .from('company_strategic_goals')
      .select(`
        id, goal_name, target_value, current_value, progress_pct, 
        status, owner_names, priority, target_unit
      `)
      .eq('organization_id', organizationId)
      .neq('status', 'complete')
      .or(linkedDomains.map(d => `linked_domain.eq.${d}`).join(','));
    
    if (fiscalYear) {
      query = query.eq('fiscal_year', fiscalYear);
    }
    
    const { data: goals, error } = await query.limit(5);
    
    if (error || !goals?.length) {
      console.log(`[${domain}] No active goals found for goal-centric prompting`);
      return undefined;
    }
    
    console.log(`[${domain}] Loaded ${goals.length} goals for goal-centric prompting`);
    
    return {
      goals: goals.map((g: any) => ({
        id: g.id,
        goal_name: g.goal_name,
        target_value: g.target_value,
        current_value: g.current_value,
        progress_pct: g.progress_pct,
        status: g.status || 'not_started',
        owner_names: g.owner_names,
        priority: g.priority,
        target_unit: g.target_unit
      })),
      fiscalYear: fiscalYear || 'FY26'
    };
  } catch (err) {
    console.error(`[${domain}] Error loading goals:`, err);
    return undefined;
  }
}

// Fallback model for retry scenarios (same as main model for consistency)
const CLAUDE_MODEL_FALLBACK: typeof CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Token estimation constants
const CHARS_PER_TOKEN = 4;
const MAX_INPUT_TOKENS = 10000; // Increased for richer context
const SYSTEM_PROMPT_TOKEN_ESTIMATE = 2000; // Increased for enhanced prompts
const SAFE_PAYLOAD_TOKENS = MAX_INPUT_TOKENS - SYSTEM_PROMPT_TOKEN_ESTIMATE;

export interface ChunkConfig {
  domain: string;
  timeout: number;
  maxTokens: number;
  maxRetries: number;
}

// Callback for heartbeat updates during long-running chunk processing
export type HeartbeatCallback = (stage: string, progressPct: number) => Promise<void>;

export interface ChunkResult {
  domain: string;
  success: boolean;
  anomalies: any[];
  insights: any[];
  actions: any[];
  workspaceSummary: any;
  tokensUsed: { input: number; output: number };
  durationMs: number;
  attemptCount: number;
  modelUsed: string;
  subChunkCount?: number;
  error?: string;
  shieldaAction?: string;
  fallbackApplied?: boolean;
}

interface SubChunk {
  data: any;
  estimatedTokens: number;
  index: number;
  total: number;
}

// Domain chunk configurations - AGGRESSIVE TOKEN LIMITS to prevent truncation
// Claude 4.5 Sonnet can output up to 16K tokens, we need ~2-3K for structured responses
export const DOMAIN_CONFIGS: Record<string, ChunkConfig> = {
  finance: {
    domain: 'finance',
    timeout: 45000,
    maxTokens: 6000, // Increased significantly to prevent truncation
    maxRetries: 2
  },
  cs: {
    domain: 'cs',
    timeout: 45000,
    maxTokens: 6000,
    maxRetries: 2
  },
  revenue: {
    domain: 'revenue',
    timeout: 45000,
    maxTokens: 6000,
    maxRetries: 2
  },
  am: {
    domain: 'am',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  services: {
    domain: 'services',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  product: {
    domain: 'product',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  marketing: {
    domain: 'marketing',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  people: {
    domain: 'people',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  // v11.5.0: Engineering (CTO) and Analyst domains
  engineering: {
    domain: 'engineering',
    timeout: 45000,
    maxTokens: 5000,
    maxRetries: 2
  },
  analyst: {
    domain: 'analyst',
    timeout: 45000,
    maxTokens: 6000,
    maxRetries: 2
  }
};

/**
 * Estimate token count for a payload
 */
function estimateTokens(data: any): number {
  const jsonStr = JSON.stringify(data);
  return Math.ceil(jsonStr.length / CHARS_PER_TOKEN);
}

/**
 * Split array data into sub-chunks that fit within token limits
 */
function splitIntoSubChunks(domainData: any, domain: string): SubChunk[] {
  const baseTokens = estimateTokens({
    summary: domainData.summary,
    timestamp: domainData.timestamp
  });
  
  const arrayFields = getArrayFields(domainData, domain);
  
  if (arrayFields.length === 0) {
    return [{
      data: domainData,
      estimatedTokens: estimateTokens(domainData),
      index: 0,
      total: 1
    }];
  }
  
  const availableTokens = SAFE_PAYLOAD_TOKENS - baseTokens;
  const subChunks: SubChunk[] = [];
  
  const allItems: { field: string; item: any; tokens: number }[] = [];
  for (const field of arrayFields) {
    const items = domainData[field] || [];
    for (const item of items) {
      allItems.push({
        field,
        item,
        tokens: estimateTokens(item)
      });
    }
  }
  
  if (allItems.length === 0) {
    return [{
      data: domainData,
      estimatedTokens: estimateTokens(domainData),
      index: 0,
      total: 1
    }];
  }
  
  let currentChunk: { [field: string]: any[] } = {};
  let currentTokens = baseTokens;
  
  for (const { field, item, tokens } of allItems) {
    if (currentTokens + tokens > SAFE_PAYLOAD_TOKENS && Object.keys(currentChunk).length > 0) {
      subChunks.push({
        data: {
          summary: domainData.summary,
          timestamp: domainData.timestamp,
          crossDomainContext: domainData.crossDomainContext,
          ...currentChunk
        },
        estimatedTokens: currentTokens,
        index: subChunks.length,
        total: 0
      });
      currentChunk = {};
      currentTokens = baseTokens;
    }
    
    if (!currentChunk[field]) currentChunk[field] = [];
    currentChunk[field].push(item);
    currentTokens += tokens;
  }
  
  if (Object.keys(currentChunk).length > 0) {
    subChunks.push({
      data: {
        summary: domainData.summary,
        timestamp: domainData.timestamp,
        crossDomainContext: domainData.crossDomainContext,
        ...currentChunk
      },
      estimatedTokens: currentTokens,
      index: subChunks.length,
      total: 0
    });
  }
  
  const total = subChunks.length;
  for (const chunk of subChunks) {
    chunk.total = total;
  }
  
  console.log(`[${domain}] Split into ${total} sub-chunks (estimated tokens: ${subChunks.map(c => c.estimatedTokens).join(', ')})`);
  
  return subChunks.length > 0 ? subChunks : [{
    data: domainData,
    estimatedTokens: estimateTokens(domainData),
    index: 0,
    total: 1
  }];
}

/**
 * Get array field names for a domain that can be chunked
 */
function getArrayFields(domainData: any, domain: string): string[] {
  switch (domain) {
    case 'finance':
      return ['overdueInvoices'];
    case 'cs':
      return ['criticalClients', 'atRiskClients'];
    case 'revenue':
      return ['newLogoDeals'];
    case 'am':
      return ['expansionPipeline', 'renewalPipeline', 'upcomingRenewals'];
    case 'services':
      return ['activeProjects', 'criticalRisks', 'atRiskMilestones'];
    case 'product':
      return ['moduleDeployments', 'deprecatedVersions', 'upgradeOpportunities'];
    case 'marketing':
      return ['marketingGoals', 'marketingCampaigns'];
    case 'people':
      return ['employees', 'onboardingEmployees', 'exitingEmployees', 'recentEvaluations'];
    case 'engineering':
      return ['sprints', 'incidents', 'deployments', 'techDebtItems'];
    case 'analyst':
      return ['crossDomainSignals', 'correlations', 'anomalies'];
    default:
      return [];
  }
}

/**
 * Merge results from multiple sub-chunks
 */
function mergeSubChunkResults(results: ChunkResult[]): ChunkResult {
  if (results.length === 0) {
    throw new Error('No sub-chunk results to merge');
  }
  
  if (results.length === 1) {
    return results[0];
  }
  
  const domain = results[0].domain;
  const successfulResults = results.filter(r => r.success);
  
  const mergedAnomalies: any[] = [];
  const mergedInsights: any[] = [];
  const mergedActions: any[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalDuration = 0;
  let maxAttempts = 0;
  
  for (const result of results) {
    mergedAnomalies.push(...result.anomalies);
    mergedInsights.push(...result.insights);
    mergedActions.push(...result.actions);
    totalInputTokens += result.tokensUsed.input;
    totalOutputTokens += result.tokensUsed.output;
    totalDuration = Math.max(totalDuration, result.durationMs);
    maxAttempts = Math.max(maxAttempts, result.attemptCount);
  }
  
  const dedupeByField = (arr: any[], field: string) => {
    const seen = new Set();
    return arr.filter(item => {
      const key = item[field];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  
  const workspaceSummary = successfulResults[0]?.workspaceSummary || 
    generateFallbackResponse(domain).workspaceSummary;
  
  console.log(`[${domain}] Merged ${results.length} sub-chunks: ${mergedAnomalies.length} anomalies, ${mergedInsights.length} insights, ${mergedActions.length} actions`);
  
  return {
    domain,
    success: successfulResults.length > 0,
    anomalies: dedupeByField(mergedAnomalies, 'title').slice(0, 5),
    insights: dedupeByField(mergedInsights, 'title').slice(0, 5),
    actions: dedupeByField(mergedActions, 'title').slice(0, 5),
    workspaceSummary,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
    durationMs: totalDuration,
    attemptCount: maxAttempts,
    modelUsed: results[0].modelUsed,
    subChunkCount: results.length,
    error: successfulResults.length === 0 ? 'All sub-chunks failed' : undefined
  };
}

/**
 * Extract domain-specific data from the full snapshot
 * ENHANCED: Each domain now gets cross-domain context for connecting dots
 */
export function extractDomainData(snapshot: any, domain: string): any {
  const timestamp = snapshot.timestamp;
  
  // Helper: Extract compact client context for cross-domain awareness
  const extractClientContext = (clients: any[], limit: number = 5) => {
    return (clients || []).slice(0, limit).map((c: any) => ({
      name: c.name,
      healthScore: c.health_score || c.healthScore,
      arr: c.arr || c.contract_value,
      status: c.status,
      daysUntilRenewal: c.days_until_renewal
    }));
  };

  // Helper: Extract compact invoice context
  const extractInvoiceContext = (invoices: any[], limit: number = 5) => {
    return (invoices || []).slice(0, limit).map((inv: any) => ({
      clientName: inv.clientName || inv.client_name,
      amount: inv.amount,
      daysOverdue: inv.daysOverdue || inv.days_overdue,
      currency: inv.currency
    }));
  };

  // Helper: Extract previous AI insights for this domain
  const extractPreviousInsights = (insights: any[], domainFilter: string, limit: number = 5) => {
    return (insights || [])
      .filter((i: any) => i.entityType === domainFilter || i.entityType === 'portfolio')
      .slice(0, limit)
      .map((i: any) => ({
        title: i.title,
        content: typeof i.content === 'string' ? i.content : i.content?.description || '',
        confidence: i.confidence,
        ageInDays: i.created_at ? Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      }));
  };

  // Helper: Extract previous AI patterns for this domain
  const extractPreviousPatterns = (patterns: any[], domainFilter: string, limit: number = 3) => {
    return (patterns || [])
      .filter((p: any) => p.entityType === domainFilter || p.entityType === 'portfolio')
      .slice(0, limit)
      .map((p: any) => ({
        title: p.title,
        content: typeof p.content === 'string' ? p.content : p.content?.description || '',
        confidence: p.confidence
      }));
  };

  // v12.0.0: Context compression for faster agent processing
  // Smart sampling: Only send top 10 priority items to reduce tokens by ~50%
  // Agents can use tools to query more data if needed
  switch (domain) {
    case 'finance':
      return {
        summary: {
          totalARR: snapshot.summary?.totalARR || 0,
          overdueAmount: snapshot.summary?.overdueAmount || 0,
          overdueInvoiceCount: snapshot.summary?.overdueInvoiceCount || 0,
          activeClientCount: snapshot.summary?.activeClientCount || 0
        },
        // v12.0.0: Reduced from 25 to 10 for faster processing
        // Core finance data - top 10 by amount (highest priority)
        overdueInvoices: (snapshot.overdueInvoices || [])
          .sort((a: any, b: any) => (b.amount || 0) - (a.amount || 0))
          .slice(0, 10),
        // CFO PRE-COMPUTED ANALYSIS
        cfoAnalysis: snapshot.cfoAnalysis || {},
        // CROSS-DOMAIN CONTEXT - reduced to top 5 each
        crossDomainContext: {
          atRiskClients: extractClientContext(snapshot.atRiskClients, 5),
          criticalClients: extractClientContext(snapshot.criticalClients, 3),
          avgHealthScore: snapshot.summary?.avgHealthScore || 0,
          pipelineValue: snapshot.summary?.totalPipeline || 0,
          projectsAtRisk: snapshot.servicesData?.summary?.atRiskCount || 0,
          revenueAtRiskFromServices: snapshot.servicesData?.summary?.revenueAtRisk || 0,
          // Removed previousInsights/previousPatterns for token reduction (agents can query memory)
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'finance').slice(0, 3),
        timestamp
      };

    case 'cs':
      return {
        summary: {
          totalARR: snapshot.summary?.totalARR || 0,
          criticalClientCount: snapshot.summary?.criticalClientCount || 0,
          atRiskClientCount: snapshot.summary?.atRiskClientCount || 0,
          avgHealthScore: snapshot.summary?.avgHealthScore || 0,
          activeClientCount: snapshot.summary?.activeClientCount || 0
        },
        // v12.0.0: Reduced from 15 to 10 each for faster processing
        criticalClients: (snapshot.criticalClients || []).slice(0, 10),
        atRiskClients: (snapshot.atRiskClients || []).slice(0, 10),
        csToolsData: snapshot.csToolsData || {},
        // VP CS PRE-COMPUTED ANALYSIS
        vpCSAnalysis: snapshot.vpCSAnalysis || {},
        // CROSS-DOMAIN CONTEXT - reduced limits
        crossDomainContext: {
          overdueInvoices: extractInvoiceContext(snapshot.overdueInvoices, 5),
          totalOverdue: snapshot.summary?.overdueAmount || 0,
          dso: snapshot.cfoAnalysis?.dso?.current || 0,
          projectsAtRisk: (snapshot.servicesData?.activeProjects || [])
            .filter((p: any) => p.health === 'Red' || p.status === 'At Risk')
            .slice(0, 3)
            .map((p: any) => ({ name: p.name, clientName: p.clientName, status: p.status })),
          upcomingRenewals90d: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .filter((c: any) => c.days_until_renewal && c.days_until_renewal <= 90)
            .length,
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'cs').slice(0, 3),
        timestamp
      };

    case 'revenue':
      // v12.0.0: Reduced chunk size for faster processing
      const REVENUE_CHUNK_SIZE = 15; // Reduced from 25
      
      const allNewLogoDeals = (snapshot.topDeals || [])
        .filter((d: any) => d.category === 'new_logo' || d.pipeline_type === 'TOF');
      
      // Take first chunk - prioritized by value
      const newLogoDeals = allNewLogoDeals
        .sort((a: any, b: any) => (b.deal_value || 0) - (a.deal_value || 0))
        .slice(0, REVENUE_CHUNK_SIZE);
      
      return {
        summary: {
          totalPipeline: snapshot.summary?.totalPipeline || 0,
          openDealCount: snapshot.summary?.openDealCount || 0,
          weightedPipeline: snapshot.summary?.weightedPipeline || 0
        },
        // Core revenue data - top deals by value
        newLogoDeals,
        dealStageDistribution: calculateStageDistribution(newLogoDeals),
        // VP SALES PRE-COMPUTED ANALYSIS
        vpSalesAnalysis: snapshot.vpSalesAnalysis || {},
        // CROSS-DOMAIN CONTEXT - reduced
        crossDomainContext: {
          healthyClientCount: snapshot.summary?.healthyClientCount || 0,
          avgHealthScore: snapshot.summary?.avgHealthScore || 0,
          avgDSO: snapshot.cfoAnalysis?.dso?.current || 0,
          activeProjectCount: snapshot.servicesData?.summary?.totalProjects || 0,
          projectCapacityAvailable: (snapshot.servicesData?.summary?.totalProjects || 0) < 10,
          totalARR: snapshot.summary?.totalARR || 0,
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'revenue').slice(0, 3),
        timestamp,
        _chunking: {
          isChunked: allNewLogoDeals.length > REVENUE_CHUNK_SIZE,
          chunkIndex: 0,
          totalChunks: Math.ceil(allNewLogoDeals.length / REVENUE_CHUNK_SIZE),
          totalDeals: allNewLogoDeals.length,
          chunkSize: REVENUE_CHUNK_SIZE
        }
      };

    case 'account-management':
    case 'am': // Legacy alias
      // v12.0.0: Reduced limits for faster processing
      const amDeals = (snapshot.topDeals || [])
        .filter((d: any) => 
          d.category === 'expansion' || 
          d.category === 'renewal' || 
          d.category === 'upsell' ||
          d.pipeline_type === 'ABP'
        )
        .sort((a: any, b: any) => (b.deal_value || 0) - (a.deal_value || 0))
        .slice(0, 10); // Reduced from 12
      
      // Get clients with upcoming renewals - reduced limit
      const upcomingRenewals = (snapshot.criticalClients || [])
        .concat(snapshot.atRiskClients || [])
        .filter((c: any) => c.renewal_date || c.days_until_renewal)
        .slice(0, 8); // Reduced from 10

      return {
        summary: {
          totalARR: snapshot.summary?.totalARR || 0,
          activeClientCount: snapshot.summary?.activeClientCount || 0
        },
        // Core AM data - reduced limits
        expansionPipeline: amDeals.filter((d: any) => d.category === 'expansion').slice(0, 4),
        renewalPipeline: amDeals.filter((d: any) => d.category === 'renewal').slice(0, 4),
        upcomingRenewals,
        vpAMAnalysis: snapshot.vpAMAnalysis || {},
        // CROSS-DOMAIN CONTEXT - reduced
        crossDomainContext: {
          criticalClients: extractClientContext(snapshot.criticalClients, 5),
          atRiskClients: extractClientContext(snapshot.atRiskClients, 5),
          avgHealthScore: snapshot.summary?.avgHealthScore || 0,
          clientsWithOverdue: (snapshot.overdueInvoices || [])
            .map((inv: any) => inv.clientName || inv.client_name)
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
            .slice(0, 5), // Reduced from 10
          completedProjectsL30d: snapshot.servicesData?.summary?.completedCount || 0,
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'account-management' || g.domain === 'am').slice(0, 3),
        timestamp
      };

    case 'services':
      return {
        summary: snapshot.servicesData?.summary || {
          totalProjects: 0,
          atRiskCount: 0,
          delayedCount: 0,
          criticalRiskCount: 0,
          revenueAtRisk: 0
        },
        // Core services data - INCREASED LIMITS
        activeProjects: (snapshot.servicesData?.activeProjects || []).slice(0, 20),
        criticalRisks: (snapshot.servicesData?.criticalRisks || []).slice(0, 15),
        atRiskMilestones: (snapshot.servicesData?.atRiskMilestones || []).slice(0, 15),
        // VP SERVICES PRE-COMPUTED ANALYSIS (NEW)
        vpServicesAnalysis: snapshot.vpServicesAnalysis || {},
        // CROSS-DOMAIN CONTEXT
        crossDomainContext: {
          // Client ARR context - prioritize high-value implementations
          clientARRMap: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .slice(0, 20)
            .reduce((acc: any, c: any) => {
              acc[c.name] = c.arr || c.contract_value || 0;
              return acc;
            }, {}),
          // CS health context - implementation affects health
          clientHealthMap: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .slice(0, 20)
            .reduce((acc: any, c: any) => {
              acc[c.name] = c.health_score || c.healthScore || 0;
              return acc;
            }, {}),
          // Finance context - payment status
          overdueClients: (snapshot.overdueInvoices || [])
            .map((inv: any) => inv.clientName || inv.client_name)
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
          // AM context - renewal timing
          renewalsNext90d: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .filter((c: any) => c.days_until_renewal && c.days_until_renewal <= 90)
            .map((c: any) => c.name),
          // NEW: Previous AI insights for this domain
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'services'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'services')
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'services'),
        timestamp
      };

    case 'product':
      return {
        summary: {
          totalModules: snapshot.moduleStats?.totalDeployments || 0,
          activeModules: snapshot.moduleStats?.activeModules || 0,
          deprecatedVersionCount: snapshot.moduleStats?.deprecatedVersionCount || 0,
          upgradeEligibleCount: snapshot.moduleStats?.upgradeEligibleCount || 0,
          clientsOnDeprecated: snapshot.moduleStats?.clientsOnDeprecated || 0,
          // NEW: Feature delay metrics from vpProductDelayAnalysis
          totalFeaturesTracked: snapshot.vpProductDelayAnalysis?.totalFeaturesTracked || 0,
          delayedFeaturesCount: snapshot.vpProductDelayAnalysis?.delayedFeaturesCount || 0,
          featuresAtRiskCount: snapshot.vpProductDelayAnalysis?.featuresAtRiskCount || 0,
          clientsAffectedByDelays: snapshot.vpProductDelayAnalysis?.clientsAffectedCount || 0,
          arrAtRiskFromDelays: snapshot.vpProductDelayAnalysis?.totalArrAtRisk || 0
        },
        // Core product data
        moduleDeployments: (snapshot.moduleDeployments || []).slice(0, 20),
        deprecatedVersions: (snapshot.deprecatedVersions || []).slice(0, 15),
        upgradeOpportunities: (snapshot.upgradeOpportunities || []).slice(0, 15),
        productVersions: (snapshot.productVersions || []).slice(0, 10),
        // NEW: Feature roadmap data for VP Product persona
        productFeatures: (snapshot.productFeatures || []).slice(0, 20),
        delayedFeatures: snapshot.vpProductDelayAnalysis?.delayedFeatures || [],
        featuresAtRisk: snapshot.vpProductDelayAnalysis?.featuresAtRisk || [],
        clientsAffectedByDelays: snapshot.vpProductDelayAnalysis?.clientsAffected || [],
        // VP PRODUCT PRE-COMPUTED ANALYSIS
        vpProductAnalysis: snapshot.vpProductAnalysis || {},
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis || {},
        // CROSS-DOMAIN CONTEXT
        crossDomainContext: {
          // CS health context - version issues affect satisfaction
          clientHealthMap: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .slice(0, 20)
            .reduce((acc: any, c: any) => {
              acc[c.name] = c.health_score || c.healthScore || 0;
              return acc;
            }, {}),
          // Revenue context - upsell opportunities for new versions
          totalARR: snapshot.summary?.totalARR || 0,
          activeClientCount: snapshot.summary?.activeClientCount || 0,
          // AM context - renewals at risk from deprecated versions
          renewalsNext90d: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .filter((c: any) => c.days_until_renewal && c.days_until_renewal <= 90)
            .map((c: any) => c.name),
          // Previous AI insights for this domain
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'product'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'product'),
          // NEW: Cross-domain awareness for feature delays
          featureDelaysImpactingClients: snapshot.vpProductDelayAnalysis?.clientsAffected || [],
          arrAtRiskFromFeatureDelays: snapshot.vpProductDelayAnalysis?.totalArrAtRisk || 0
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'product'),
        timestamp
      };

    case 'marketing':
      // Marketing domain data extraction - goals, campaigns, MQLs
      // Case-insensitive status normalization (DB uses lowercase: 'on_track', 'at_risk', etc.)
      const normalizeMarketingStatus = (s: string | null) => (s || '').toLowerCase().trim();
      const marketingGoals = (snapshot.marketingGoals || []).slice(0, 20);
      const marketingCampaigns = (snapshot.marketingCampaigns || []).slice(0, 15);
      
      // Active goals include: on_track, active, in_progress (case-insensitive)
      const activeMarketingGoals = marketingGoals.filter((g: any) => 
        ['active', 'on_track', 'on-track', 'in_progress', 'in-progress'].includes(normalizeMarketingStatus(g.status))
      );
      
      return {
        summary: {
          activeGoalsCount: activeMarketingGoals.length,
          totalCampaignsCount: marketingCampaigns.length,
          goalsAtRisk: marketingGoals.filter((g: any) => {
            // Goals with at_risk status OR under 50% progress
            const isAtRiskStatus = ['at_risk', 'at-risk', 'behind'].includes(normalizeMarketingStatus(g.status));
            const progress = g.current_value && g.target_value ? 
              (g.current_value / g.target_value) * 100 : 0;
            return isAtRiskStatus || progress < 50;
          }).length,
          avgGoalProgress: marketingGoals.length > 0 ?
            Math.round(marketingGoals.reduce((acc: number, g: any) => {
              const progress = g.current_value && g.target_value ? 
                (g.current_value / g.target_value) * 100 : 0;
              return acc + progress;
            }, 0) / marketingGoals.length) : 0
        },
        // Core marketing data
        marketingGoals,
        marketingCampaigns,
        // VP MARKETING PRE-COMPUTED ANALYSIS
        vpMarketingAnalysis: snapshot.vpMarketingAnalysis || {},
        // CROSS-DOMAIN CONTEXT
        crossDomainContext: {
          // Revenue context - pipeline contribution from marketing
          totalPipeline: snapshot.summary?.totalPipeline || 0,
          newLogoDealCount: (snapshot.topDeals || []).filter((d: any) => d.category === 'new_logo').length,
          // CS context - client health for case studies/references
          healthyClientCount: snapshot.summary?.healthyClientCount || 0,
          referenceableClients: (snapshot.criticalClients || [])
            .concat(snapshot.atRiskClients || [])
            .filter((c: any) => (c.health_score || c.healthScore || 0) >= 80)
            .slice(0, 10)
            .map((c: any) => c.name),
          // Previous AI insights for this domain
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'marketing'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'marketing')
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'marketing'),
        timestamp
      };

    case 'people':
      // People domain data extraction - employees, onboarding, attrition
      // Case-insensitive status normalization (DB uses lowercase: 'active', 'onboarding', etc.)
      const normalizePeopleStatus = (s: string | null) => (s || '').toLowerCase().trim();
      const employees = (snapshot.employees || []).slice(0, 30);
      
      // Case-insensitive filtering for employee statuses
      const onboardingEmployees = employees.filter((e: any) => 
        ['onboarding', 'new hire', 'new_hire', 'probation'].includes(normalizePeopleStatus(e.employment_status))
      );
      const exitingEmployees = employees.filter((e: any) => 
        ['notice period', 'notice_period', 'exiting', 'resigned'].includes(normalizePeopleStatus(e.employment_status))
      );
      const activeEmployees = employees.filter((e: any) => 
        normalizePeopleStatus(e.employment_status) === 'active'
      );
      
      return {
        summary: {
          totalEmployeeCount: employees.length,
          activeEmployeeCount: activeEmployees.length,
          onboardingCount: onboardingEmployees.length,
          exitingCount: exitingEmployees.length,
          departmentDistribution: employees.reduce((acc: Record<string, number>, e: any) => {
            const dept = e.department_name || e.department_id || 'Unknown';
            acc[dept] = (acc[dept] || 0) + 1;
            return acc;
          }, {}),
          avgTenureMonths: employees.length > 0 ?
            Math.round(employees.reduce((acc: number, e: any) => {
              if (e.hire_date || e.date_of_joining) {
                const hireDate = new Date(e.hire_date || e.date_of_joining);
                const months = Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                return acc + months;
              }
              return acc;
            }, 0) / employees.length) : 0
        },
        // Core people data
        employees: employees.slice(0, 20),
        activeEmployees: activeEmployees.slice(0, 15),
        onboardingEmployees,
        exitingEmployees,
        // Performance data if available
        recentEvaluations: (snapshot.employeeEvaluations || []).slice(0, 15),
        // VP PEOPLE PRE-COMPUTED ANALYSIS
        vpPeopleAnalysis: snapshot.vpPeopleAnalysis || {},
        // CROSS-DOMAIN CONTEXT
        crossDomainContext: {
          // Services context - resource allocation for projects
          activeProjectCount: snapshot.servicesData?.summary?.totalProjects || 0,
          projectsAtRisk: snapshot.servicesData?.summary?.atRiskCount || 0,
          // CS context - client coverage by AM/CSM
          activeClientCount: snapshot.summary?.activeClientCount || 0,
          // Revenue context - sales team capacity
          openDealCount: snapshot.summary?.openDealCount || 0,
          // Previous AI insights for this domain
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'people'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'people')
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'people'),
        timestamp
      };

    case 'engineering':
      // Engineering/CTO domain - velocity, reliability, deployments, tech debt
      return {
        summary: {
          vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis || {},
          productFeaturesCount: snapshot.productFeatures?.length || 0,
          delayedFeaturesCount: snapshot.vpProductDelayAnalysis?.delayedFeaturesCount || 0,
          arrAtRisk: snapshot.vpProductDelayAnalysis?.totalArrAtRisk || 0
        },
        productFeatures: (snapshot.productFeatures || []).slice(0, 20),
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis || {},
        crossDomainContext: {
          servicesProjectHealth: snapshot.vpServicesAnalysis?.projectHealth || {},
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'engineering'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'engineering')
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'engineering'),
        timestamp
      };

    case 'analyst':
      // Analyst domain - cross-domain pattern discovery
      return {
        summary: snapshot.summary || {},
        cfoAnalysis: snapshot.cfoAnalysis || {},
        vpSalesAnalysis: snapshot.vpSalesAnalysis || {},
        vpCSAnalysis: snapshot.vpCSAnalysis || {},
        vpAMAnalysis: snapshot.vpAMAnalysis || {},
        vpServicesAnalysis: snapshot.vpServicesAnalysis || {},
        vpMarketingAnalysis: snapshot.vpMarketingAnalysis || {},
        vpPeopleAnalysis: snapshot.vpPeopleAnalysis || {},
        vpProductDelayAnalysis: snapshot.vpProductDelayAnalysis || {},
        criticalClients: (snapshot.criticalClients || []).slice(0, 10),
        atRiskClients: (snapshot.atRiskClients || []).slice(0, 10),
        overdueInvoices: (snapshot.overdueInvoices || []).slice(0, 10),
        topDeals: (snapshot.topDeals || []).slice(0, 10),
        crossDomainContext: {
          previousInsights: extractPreviousInsights(snapshot.previousInsights, 'analyst'),
          previousPatterns: extractPreviousPatterns(snapshot.previousPatterns, 'analyst')
        },
        activeGoals: (snapshot.activeGoals || []).filter((g: any) => g.domain === 'analyst' || g.domain === 'executive'),
        timestamp
      };

    default:
      return {
        summary: snapshot.summary || {},
        timestamp
      };
  }
}

/**
 * Process a single domain chunk with dynamic sub-chunking
 * @param onHeartbeat - Optional callback to update heartbeat during long AI calls
 * @param patternContext - Optional pattern context from platform_pattern_library
 * @param correctionContext - Optional recent corrections context
 * @param goalContext - Optional goal context for goal-centric intelligence
 */
export async function processDomainChunk(
  apiKey: string,
  domain: string,
  domainData: any,
  config: ChunkConfig,
  onHeartbeat?: HeartbeatCallback,
  patternContext?: string,
  correctionContext?: string,
  goalContext?: GoalContextForPersona
): Promise<ChunkResult> {
  const startTime = Date.now();
  
  const subChunks = splitIntoSubChunks(domainData, domain);
  
  if (subChunks.length === 1) {
    return processSingleSubChunk(apiKey, domain, subChunks[0], config, startTime, patternContext, correctionContext, goalContext);
  }
  
  console.log(`[${domain}] Processing ${subChunks.length} sub-chunks sequentially...`);
  const subResults: ChunkResult[] = [];
  
  for (const subChunk of subChunks) {
    console.log(`[${domain}] Sub-chunk ${subChunk.index + 1}/${subChunk.total} (~${subChunk.estimatedTokens} tokens)`);
    
    try {
      const result = await processSingleSubChunk(apiKey, domain, subChunk, config, startTime, patternContext, correctionContext, goalContext);
      subResults.push(result);
      
      // Call heartbeat after each sub-chunk completes
      if (onHeartbeat) {
        const progressPct = Math.round(((subChunk.index + 1) / subChunk.total) * 100);
        await onHeartbeat(`processing_${domain}_subchunk_${subChunk.index + 1}`, progressPct);
      }
      
      if (!result.success) {
        console.warn(`[${domain}] Sub-chunk ${subChunk.index + 1} failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[${domain}] Sub-chunk ${subChunk.index + 1} threw error:`, error);
      subResults.push({
        domain,
        success: false,
        anomalies: [],
        insights: [],
        actions: [],
        workspaceSummary: {},
        tokensUsed: { input: 0, output: 0 },
        durationMs: 0,
        attemptCount: 1,
        modelUsed: CLAUDE_MODEL,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return mergeSubChunkResults(subResults);
}

/**
 * Process a single sub-chunk with retry logic and graceful timeout handling
 * @param patternContext - Optional pattern context to inject into Claude prompts
 * @param correctionContext - Optional corrections context to inject into Claude prompts
 * @param goalContext - Optional goal context for goal-centric intelligence
 */
async function processSingleSubChunk(
  apiKey: string,
  domain: string,
  subChunk: SubChunk,
  config: ChunkConfig,
  startTime: number,
  patternContext?: string,
  correctionContext?: string,
  goalContext?: GoalContextForPersona
): Promise<ChunkResult> {
  let attemptCount = 0;
  let lastError: Error | null = null;
  let modelUsed = CLAUDE_MODEL;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    attemptCount = attempt;
    const context: ShieldaContext = {
      domain,
      attemptNumber: attempt,
      maxAttempts: config.maxRetries,
      timeoutMs: config.timeout
    };

    try {
      const timeout = attempt === 1 ? config.timeout : getExtendedTimeout(config.timeout, attempt);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const model = attempt >= 3 ? CLAUDE_MODEL_FALLBACK : CLAUDE_MODEL;
      modelUsed = model;

      // v9.0: Now passing pattern, correction, and GOAL context to Claude
      const claudePromise = callClaudeForDomain(
        apiKey,
        domain,
        subChunk.data,
        model,
        config.maxTokens,
        controller.signal,
        subChunk.index,
        subChunk.total,
        patternContext,    // Pattern library context
        correctionContext, // Recent corrections context
        goalContext        // Goal-Centric Intelligence context
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`Chunk timeout after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([claudePromise, timeoutPromise]);

      clearTimeout(timeoutId);

      return {
        domain,
        success: true,
        anomalies: result.analysis.anomalies || [],
        insights: result.analysis.insights || [],
        actions: result.analysis.actions || [],
        workspaceSummary: result.analysis.workspaceSummary || {},
        tokensUsed: { input: result.tokensInput, output: result.tokensOutput },
        durationMs: Date.now() - startTime,
        attemptCount,
        modelUsed
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const shieldaResult = classifyException(error, context);
      logShieldaEvent(shieldaResult.severity === 'critical' ? 'error' : 'warn', shieldaResult, context);

      if (shieldaResult.action === 'halt') {
        throw new Error(`SHIELDA_HALT: ${shieldaResult.reason}`);
      }

      if (shieldaResult.action === 'skip' || !shieldaResult.retry) {
        return {
          domain,
          success: false,
          anomalies: [],
          insights: [],
          actions: [],
          workspaceSummary: generateFallbackResponse(domain).workspaceSummary,
          tokensUsed: { input: 0, output: 0 },
          durationMs: Date.now() - startTime,
          attemptCount,
          modelUsed,
          error: shieldaResult.reason,
          shieldaAction: shieldaResult.action
        };
      }

      if (shieldaResult.action === 'degrade') {
        return {
          domain,
          success: false,
          anomalies: [],
          insights: [],
          actions: [],
          workspaceSummary: generateFallbackResponse(domain).workspaceSummary,
          tokensUsed: { input: 0, output: 0 },
          durationMs: Date.now() - startTime,
          attemptCount,
          modelUsed,
          error: shieldaResult.reason,
          shieldaAction: 'degrade'
        };
      }

      if (shieldaResult.retryDelayMs > 0 && attempt < config.maxRetries) {
        // Exponential backoff for rate limits
        const backoffMultiplier = Math.pow(1.5, attempt - 1);
        const backoffDelay = Math.min(shieldaResult.retryDelayMs * backoffMultiplier, 60000);
        console.log(`[${domain}] Rate limit backoff: ${backoffDelay}ms (attempt ${attempt}, base delay: ${shieldaResult.retryDelayMs}ms)`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  return {
    domain,
    success: false,
    anomalies: [],
    insights: [],
    actions: [],
    workspaceSummary: generateFallbackResponse(domain).workspaceSummary,
    tokensUsed: { input: 0, output: 0 },
    durationMs: Date.now() - startTime,
    attemptCount,
    modelUsed,
    error: lastError?.message || 'All retries exhausted',
    shieldaAction: 'skip'
  };
}

/**
 * Call Claude API for a specific domain (with sub-chunk context)
 * ENHANCED: Stronger JSON instruction to prevent truncation/markdown issues
 * v9.0: Added goal context for Goal-Centric Intelligence Engine
 */
async function callClaudeForDomain(
  apiKey: string,
  domain: string,
  domainData: any,
  model: string,
  maxTokens: number,
  signal: AbortSignal,
  subChunkIndex: number = 0,
  subChunkTotal: number = 1,
  patternContext?: string,
  correctionContext?: string,
  goalContext?: GoalContextForPersona
): Promise<{ analysis: any; tokensInput: number; tokensOutput: number }> {
  // v9.0 DIAGNOSTIC: Log goal context presence
  console.log(`[${domain}] ⚡ CLAUDE API CONFIG: model=${model}, maxTokens=${maxTokens}, goals=${goalContext?.goals?.length || 0}, version=v9.0.0`);
  
  const systemPrompt = buildDomainSystemPrompt(domain, patternContext, correctionContext, goalContext);
  const responseFormat = getDomainResponseFormat(domain);
  
  // Add sub-chunk context to the prompt if chunked
  const chunkContext = subChunkTotal > 1 
    ? `\n\nNOTE: This is batch ${subChunkIndex + 1} of ${subChunkTotal}. Focus on just the items provided - results will be merged.` 
    : '';

  // Enhanced user prompt with cross-domain awareness
  const userPrompt = `Analyze this ${domain.toUpperCase()} domain data and provide your expert assessment as the ${DOMAIN_PERSONAS[domain]?.role || domain}.${chunkContext}

=== ${domain.toUpperCase()} DOMAIN DATA ===
${JSON.stringify(domainData, null, 2)}

IMPORTANT:
1. Use the crossDomainContext to connect dots between domains
2. Quantify everything in $ and days
3. Name specific clients, not "some clients"
4. Provide MAX 3 items per category (anomalies, insights, actions), prioritized by impact
5. Include dollarImpact and daysUrgency for all alerts and actions
6. Keep descriptions under 50 words each`;

  // CRITICAL: Enhanced system prompt with explicit JSON-only instruction
  const enhancedSystemPrompt = `${systemPrompt}

${responseFormat}

ABSOLUTE REQUIREMENT - NO EXCEPTIONS:
- Return ONLY raw JSON starting with { and ending with }
- NO markdown code blocks (never use \`\`\`)  
- NO text before or after the JSON
- MAX 3 items per array (anomalies, insights, actions)
- Keep ALL descriptions under 40 words
- topInsights in workspaceSummary: MAX 2 bullet points, 15 words each
- Finish with a complete valid JSON object`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // REMOVED stop_sequences - was causing mid-JSON truncation when Claude's response contained backticks
      system: enhancedSystemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text || '';

  // v5.0.0 DIAGNOSTIC: Log token usage and response info
  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;
  console.log(`[${domain}] 📊 TOKENS: input=${inputTokens}, output=${outputTokens}, maxConfigured=${maxTokens}, contentLen=${content.length}`);
  console.log(`[${domain}] Raw Claude response (first 1000 chars): ${content.substring(0, 1000)}`);

  // Parse JSON response
  const analysis = safeParseJson(content, domain);

  return {
    analysis,
    tokensInput: result.usage?.input_tokens || 0,
    tokensOutput: result.usage?.output_tokens || 0
  };
}

/**
 * Find matching brace/bracket position, properly handling quoted strings
 * This is CRITICAL because JSON values can contain { } [ ] characters
 * v5.0 - String-aware brace matching with debug logging
 */
function findMatchingBrace(content: string, startPos: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = startPos; i < content.length; i++) {
    const char = content[i];
    
    // Handle escape sequences in strings
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    // Toggle string state on unescaped quotes
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    // Only count braces/brackets when NOT inside a string
    if (!inString) {
      if (char === openChar) depth++;
      if (char === closeChar) {
        depth--;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
  }
  
  // v5.0: Log failure details for debugging
  console.warn(`[findMatchingBrace] No match found: startPos=${startPos}, contentLen=${content.length}, finalDepth=${depth}, inString=${inString}`);
  return -1; // No match found
}

/**
 * Safe JSON parsing with robust extraction and repair logic
 * v5.0 - STRING-AWARE brace matching + aggressive diagnostics
 */
function safeParseJson(content: string, domain: string): any {
  console.log(`[${domain}] 🔍 safeParseJson v5.0 starting, content length: ${content.length}`);
  
  // STEP 0: Strip ALL text before first { (Claude often adds preamble like "Here is...")
  const firstBraceIndex = content.indexOf('{');
  if (firstBraceIndex === -1) {
    console.error(`[${domain}] ❌ No JSON object found in response`);
    console.error(`[${domain}] Response preview: ${content.substring(0, 500)}`);
    return generateFallbackResponse(domain);
  }
  
  if (firstBraceIndex > 0) {
    console.log(`[${domain}] Stripping ${firstBraceIndex} chars of preamble: "${content.substring(0, Math.min(firstBraceIndex, 100))}"`);
  }
  
  // STEP 1: Aggressively strip markdown and preamble
  let cleanContent = content.substring(firstBraceIndex).trim();
  
  // Strip markdown at end
  const lastBackticks = cleanContent.lastIndexOf('```');
  if (lastBackticks !== -1) {
    console.log(`[${domain}] Found trailing markdown at position ${lastBackticks}, stripping`);
    cleanContent = cleanContent.slice(0, lastBackticks).trim();
  }
  
  console.log(`[${domain}] Clean content length: ${cleanContent.length}`);
  console.log(`[${domain}] Clean content starts: ${cleanContent.substring(0, 100)}`);
  console.log(`[${domain}] Clean content ends: ${cleanContent.substring(Math.max(0, cleanContent.length - 100))}`);
  
  // STEP 2: Try direct parse (best case)
  try {
    const parsed = JSON.parse(cleanContent);
    if (parsed.workspaceSummary || parsed.anomalies || parsed.insights || parsed.actions) {
      console.log(`[${domain}] ✅ Direct parse SUCCESS - anomalies: ${parsed.anomalies?.length || 0}, insights: ${parsed.insights?.length || 0}, actions: ${parsed.actions?.length || 0}`);
      return parsed;
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.log(`[${domain}] Direct parse failed: ${errMsg}`);
    // Log position of parse error if available
    const posMatch = errMsg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      console.log(`[${domain}] Error at position ${pos}: "...${cleanContent.substring(Math.max(0, pos-20), pos+20)}..."`);
    }
  }
  
  // STEP 3: Use STRING-AWARE brace matching to find complete JSON
  const jsonEnd = findMatchingBrace(cleanContent, 0, '{', '}');
  if (jsonEnd > 0) {
    const extractedJson = cleanContent.substring(0, jsonEnd);
    console.log(`[${domain}] Brace-matched JSON: ${extractedJson.length} chars (of ${cleanContent.length})`);
    
    try {
      const parsed = JSON.parse(extractedJson);
      if (parsed.workspaceSummary || parsed.anomalies || parsed.insights || parsed.actions) {
        console.log(`[${domain}] ✅ Brace-matched parse SUCCESS - anomalies: ${parsed.anomalies?.length || 0}, insights: ${parsed.insights?.length || 0}, actions: ${parsed.actions?.length || 0}`);
        return parsed;
      }
    } catch (e) {
      console.log(`[${domain}] Brace-matched parse failed: ${e instanceof Error ? e.message : e}`);
      // Try repair on extracted
      try {
        const repaired = repairJson(extractedJson);
        const parsed = JSON.parse(repaired);
        if (parsed.workspaceSummary || parsed.anomalies || parsed.insights || parsed.actions) {
          console.log(`[${domain}] ✅ Brace-matched+repair SUCCESS`);
          return parsed;
        }
      } catch { /* continue */ }
    }
  }

  // STEP 4: Try repair on full cleaned content
  const repaired = repairJson(cleanContent);
  try {
    const parsed = JSON.parse(repaired);
    if (parsed.workspaceSummary || parsed.anomalies || parsed.insights || parsed.actions) {
      console.log(`[${domain}] ✅ Repair parse SUCCESS - anomalies: ${parsed.anomalies?.length || 0}`);
      return parsed;
    }
  } catch (e) {
    console.log(`[${domain}] Repair parse failed: ${e instanceof Error ? e.message : e}`);
  }

  // STEP 5: Partial extraction for severely truncated responses
  console.warn(`[${domain}] Full parse failed, attempting partial extraction...`);
  const partialResult = extractPartialResponse(cleanContent, domain);
  if (partialResult && (partialResult.workspaceSummary || partialResult.anomalies.length > 0 || partialResult.insights.length > 0 || partialResult.actions.length > 0)) {
    console.log(`[${domain}] ⚠️ Partial extraction recovered - anomalies: ${partialResult.anomalies.length}, insights: ${partialResult.insights.length}, actions: ${partialResult.actions.length}`);
    const fallback = generateFallbackResponse(domain);
    return {
      workspaceSummary: partialResult.workspaceSummary || fallback.workspaceSummary,
      anomalies: partialResult.anomalies,
      insights: partialResult.insights,
      actions: partialResult.actions
    };
  }

  // FINAL: Log full response for debugging
  console.error(`[${domain}] ❌ JSON parse FAILED completely`);
  console.error(`[${domain}] === RAW RESPONSE ===`);
  console.error(`[${domain}] Length: ${content.length}`);
  console.error(`[${domain}] First 800:\n${content.substring(0, 800)}`);
  console.error(`[${domain}] Last 400:\n${content.substring(Math.max(0, content.length - 400))}`);
  
  return generateFallbackResponse(domain);
}

/**
 * Attempt to repair common JSON issues - ENHANCED for truncation handling
 */
function repairJson(str: string): string {
  let repaired = str;
  
  // Step 1: Extract JSON portion
  const firstBrace = repaired.indexOf('{');
  const lastBrace = repaired.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    repaired = repaired.substring(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    // No closing brace - truncated response
    repaired = repaired.substring(firstBrace);
  }
  
  // Step 2: Detect and handle mid-string truncation
  // Find the last quote and last structure characters
  const lastQuote = repaired.lastIndexOf('"');
  const lastStructure = Math.max(repaired.lastIndexOf('}'), repaired.lastIndexOf(']'), repaired.lastIndexOf(','));
  
  // If we're in the middle of a string (quote after structure), close it
  if (lastQuote > lastStructure && lastQuote === repaired.length - 1) {
    // String is closed, but might be incomplete value - leave as is
  } else if (lastQuote > lastStructure) {
    // Truncated inside a string - close the string
    repaired = repaired + '"';
  }
  
  // Step 3: Remove incomplete key-value pairs aggressively
  // Pattern: trailing comma + partial key or value
  repaired = repaired.replace(/,\s*"[^"]*":\s*"[^"]*$/g, ''); // incomplete string value
  repaired = repaired.replace(/,\s*"[^"]*":\s*\d*$/g, ''); // incomplete number value  
  repaired = repaired.replace(/,\s*"[^"]*":\s*\[?$/g, ''); // incomplete array start
  repaired = repaired.replace(/,\s*"[^"]*":\s*{?$/g, ''); // incomplete object start
  repaired = repaired.replace(/,\s*"[^"]*":\s*$/g, ''); // key with no value
  repaired = repaired.replace(/,\s*"[^"]*$/g, ''); // incomplete key
  
  // Step 4: Clean up trailing commas before closing
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  
  // Step 5: Fix newlines in strings
  let prevLength = -1;
  while (prevLength !== repaired.length) {
    prevLength = repaired.length;
    repaired = repaired.replace(/"([^"\\]*)\n([^"\\]*)"/g, '"$1\\n$2"');
  }
  
  // Step 6: Remove control characters
  repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Step 7: Fix consecutive/dangling commas
  repaired = repaired.replace(/,\s*,/g, ',');
  repaired = repaired.replace(/\[\s*,/g, '[');
  repaired = repaired.replace(/,\s*\]/g, ']');
  repaired = repaired.replace(/{\s*,/g, '{');
  repaired = repaired.replace(/,\s*}/g, '}');
  
  // Step 8: Fix missing commas between elements
  repaired = repaired.replace(/"\s*\n\s*"/g, '",\n"');
  repaired = repaired.replace(/}\s*\n\s*"/g, '},\n"');
  repaired = repaired.replace(/]\s*\n\s*"/g, '],\n"');
  
  // Step 9: Balance braces and brackets
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;
  
  // Close brackets first, then braces
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }
  
  return repaired;
}

/**
 * Extract partial response when full JSON parsing fails
 * v4.0 - Uses STRING-AWARE brace matching
 */
function extractPartialResponse(content: string, domain: string): any {
  const result: any = {
    workspaceSummary: null,
    anomalies: [],
    insights: [],
    actions: []
  };
  
  // Try to extract workspaceSummary using string-aware matching
  const summaryStart = content.indexOf('"workspaceSummary"');
  if (summaryStart !== -1) {
    const openBrace = content.indexOf('{', summaryStart);
    if (openBrace !== -1) {
      const endPos = findMatchingBrace(content, openBrace, '{', '}');
      if (endPos > openBrace) {
        const summaryJson = content.substring(openBrace, endPos);
        try {
          result.workspaceSummary = JSON.parse(summaryJson);
          console.log(`[${domain}] Extracted workspaceSummary`);
        } catch {
          try {
            result.workspaceSummary = JSON.parse(repairJson(summaryJson));
            console.log(`[${domain}] Extracted workspaceSummary via repair`);
          } catch { /* ignore */ }
        }
      }
    }
  }
  
  // Extract arrays using string-aware bracket matching
  const extractArray = (arrayName: string): any[] => {
    const startMarker = `"${arrayName}"`;
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return [];
    
    const bracketStart = content.indexOf('[', startIdx);
    if (bracketStart === -1) return [];
    
    const endPos = findMatchingBrace(content, bracketStart, '[', ']');
    if (endPos <= bracketStart) return [];
    
    const arrayJson = content.substring(bracketStart, endPos);
    try {
      return JSON.parse(arrayJson);
    } catch {
      // Try to extract individual objects with string-aware matching
      const objects: any[] = [];
      let pos = 0;
      while (pos < arrayJson.length) {
        const objStart = arrayJson.indexOf('{', pos);
        if (objStart === -1) break;
        const objEnd = findMatchingBrace(arrayJson, objStart, '{', '}');
        if (objEnd <= objStart) break;
        try {
          objects.push(JSON.parse(arrayJson.substring(objStart, objEnd)));
        } catch { /* skip malformed */ }
        pos = objEnd;
      }
      return objects;
    }
  };
  
  result.anomalies = extractArray('anomalies');
  result.insights = extractArray('insights');
  result.actions = extractArray('actions');
  
  const hasContent = result.workspaceSummary || result.anomalies.length > 0 || 
                     result.insights.length > 0 || result.actions.length > 0;
  
  if (hasContent) {
    console.log(`[${domain}] Partial recovery: ws=${!!result.workspaceSummary}, anomalies=${result.anomalies.length}, insights=${result.insights.length}, actions=${result.actions.length}`);
    return result;
  }
  
  return null;
}

/**
 * Calculate stage distribution for deals
 */
function calculateStageDistribution(deals: any[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const deal of deals) {
    const stage = deal.stage || 'Unknown';
    distribution[stage] = (distribution[stage] || 0) + 1;
  }
  return distribution;
}

/**
 * Get all domain configurations
 */
export function getAllDomainConfigs(): ChunkConfig[] {
  return Object.values(DOMAIN_CONFIGS);
}

/**
 * Get persona version for tracking
 */
export function getPersonaVersion(): string {
  return PERSONA_VERSION;
}
