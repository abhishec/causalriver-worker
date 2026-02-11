/**
 * Tool Registry - Domain-Specific Tools for AI Agents
 * 
 * Defines and implements all tools available to domain agents
 * for autonomous data retrieval and action creation.
 * 
 * Part of Phase 8: Enterprise AI Agent Architecture Transformation
 * 
 * NOTE: This file passes the supabase client param for flexibility.
 * When USE_REMOTE_BRAIN=true in dual-client.ts, callers should pass
 * the appropriate client (Brain for ai_memory/causal_chains, OS for business).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateEmbedding } from "./rag-layer.ts";
import { isBrainTable, BRAIN_TABLES } from './get-brain-client.ts';
import { storeLearnedPattern, storePrediction } from './memory-tools.ts';
import type { Tool } from "./agent-loop.ts";

// ============================================================================
// TOOL DEFINITIONS BY DOMAIN
// ============================================================================

export const FINANCE_TOOLS: Tool[] = [
  {
    name: 'query_overdue_invoices',
    description: 'Get all overdue invoices for the organization, optionally filtered by client or days overdue',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional: Filter by specific client UUID' },
        min_days_overdue: { type: 'string', description: 'Minimum days overdue (default: 0)' },
        min_amount: { type: 'string', description: 'Minimum invoice amount' }
      }
    }
  },
  {
    name: 'get_client_financial_health',
    description: 'Get financial health metrics for a specific client including payment history and risk factors',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' }
      },
      required: ['client_id']
    }
  },
  {
    name: 'create_collection_action',
    description: 'Create a collection follow-up action in the action queue',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        title: { type: 'string', description: 'Action title' },
        description: { type: 'string', description: 'Detailed description' },
        priority: { type: 'string', description: 'Priority level', enum: ['critical', 'high', 'medium', 'low'] },
        due_date: { type: 'string', description: 'Due date in ISO format' }
      },
      required: ['client_id', 'title']
    }
  },
  {
    name: 'search_payment_patterns',
    description: 'Search memory for similar payment patterns and what actions worked',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the payment pattern to search for' }
      },
      required: ['query']
    }
  }
];

export const CS_TOOLS: Tool[] = [
  {
    name: 'get_client_health_scores',
    description: 'Get health scores and risk indicators for clients',
    input_schema: {
      type: 'object',
      properties: {
        health_status: { type: 'string', description: 'Filter by health status', enum: ['Critical', 'At Risk', 'Fair', 'Good', 'Excellent'] },
        limit: { type: 'string', description: 'Maximum number of results' }
      }
    }
  },
  {
    name: 'get_nps_trends',
    description: 'Get NPS history and trends for a client or across the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional: specific client UUID' },
        days: { type: 'string', description: 'Number of days to look back (default: 90)' }
      }
    }
  },
  {
    name: 'get_usage_analytics',
    description: 'Get platform usage metrics and engagement scores',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional: specific client UUID' },
        metric_type: { type: 'string', description: 'Type of usage metric', enum: ['sessions', 'features', 'api_calls', 'all'] }
      }
    }
  },
  {
    name: 'create_cs_intervention',
    description: 'Create a customer success intervention action',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        title: { type: 'string', description: 'Action title' },
        intervention_type: { type: 'string', description: 'Type of intervention', enum: ['health_review', 'nps_followup', 'usage_recovery', 'escalation'] },
        priority: { type: 'string', description: 'Priority level' }
      },
      required: ['client_id', 'title', 'intervention_type']
    }
  },
  {
    name: 'search_churn_patterns',
    description: 'Search memory for similar churn risk patterns and successful interventions',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the churn pattern' }
      },
      required: ['query']
    }
  }
];

export const REVENUE_TOOLS: Tool[] = [
  {
    name: 'get_pipeline_deals',
    description: 'Get deals in the pipeline with optional filtering',
    input_schema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Deal stage filter' },
        category: { type: 'string', description: 'Deal category', enum: ['new_logo', 'expansion', 'renewal'] },
        min_value: { type: 'string', description: 'Minimum deal value' },
        days_inactive: { type: 'string', description: 'Days since last activity' }
      }
    }
  },
  {
    name: 'get_deal_velocity',
    description: 'Get deal velocity metrics and stage conversion rates',
    input_schema: {
      type: 'object',
      properties: {
        period_days: { type: 'string', description: 'Analysis period in days' }
      }
    }
  },
  {
    name: 'create_deal_task',
    description: 'Create a deal-related action in the queue',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Deal UUID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', description: 'Priority level' }
      },
      required: ['deal_id', 'title']
    }
  },
  {
    name: 'search_win_patterns',
    description: 'Search memory for similar deal patterns and what drove wins',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the deal pattern' }
      },
      required: ['query']
    }
  }
];

export const AM_TOOLS: Tool[] = [
  {
    name: 'get_upcoming_renewals',
    description: 'Get clients with upcoming renewals',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'string', description: 'Days until renewal (default: 90)' },
        at_risk_only: { type: 'string', description: 'Filter to at-risk renewals only' }
      }
    }
  },
  {
    name: 'get_expansion_opportunities',
    description: 'Get clients with expansion potential based on usage and signals',
    input_schema: {
      type: 'object',
      properties: {
        min_potential_value: { type: 'string', description: 'Minimum expansion value' }
      }
    }
  },
  {
    name: 'get_client_360',
    description: 'Get comprehensive 360 view of a client including all metrics',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' }
      },
      required: ['client_id']
    }
  },
  {
    name: 'create_renewal_action',
    description: 'Create a renewal-related action',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        title: { type: 'string', description: 'Action title' },
        renewal_date: { type: 'string', description: 'Renewal date' },
        priority: { type: 'string', description: 'Priority level' }
      },
      required: ['client_id', 'title']
    }
  }
];

export const SERVICES_TOOLS: Tool[] = [
  {
    name: 'get_active_projects',
    description: 'Get active service projects with health status',
    input_schema: {
      type: 'object',
      properties: {
        health_status: { type: 'string', description: 'Filter by health', enum: ['Green', 'Yellow', 'Red'] },
        client_id: { type: 'string', description: 'Filter by client' }
      }
    }
  },
  {
    name: 'get_milestone_status',
    description: 'Get project milestones and delivery status',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project UUID' }
      }
    }
  },
  {
    name: 'create_project_action',
    description: 'Create a project-related action',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        title: { type: 'string', description: 'Action title' },
        action_type: { type: 'string', description: 'Type of action', enum: ['milestone_review', 'escalation', 'resource_request', 'scope_change'] }
      },
      required: ['project_id', 'title', 'action_type']
    }
  }
];

// Memory Stack Tools (Available to all domains)
export const MEMORY_TOOLS: Tool[] = [
  {
    name: 'search_similar_situations',
    description: 'Search memory for similar past situations and what actions worked',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the current situation' },
        entity_type: { type: 'string', description: 'Type of entity', enum: ['client', 'deal', 'invoice', 'project'] }
      },
      required: ['query']
    }
  },
  {
    name: 'retrieve_causal_chain',
    description: 'Get known causal chains that might apply to this situation',
    input_schema: {
      type: 'object',
      properties: {
        source_domain: { type: 'string', description: 'Source domain of the signal' },
        trigger_signal: { type: 'string', description: 'The triggering signal type' }
      },
      required: ['source_domain']
    }
  },
  {
    name: 'get_tacit_knowledge',
    description: 'Retrieve organizational wisdom patterns that apply to a decision context',
    input_schema: {
      type: 'object',
      properties: {
        decision_context: { type: 'string', description: 'Description of the decision being made' }
      },
      required: ['decision_context']
    }
  },
  {
    name: 'check_prediction_accuracy',
    description: 'Check historical accuracy of predictions for similar situations',
    input_schema: {
      type: 'object',
      properties: {
        prediction_type: { type: 'string', description: 'Type of prediction', enum: ['churn', 'expansion', 'collection', 'renewal'] }
      },
      required: ['prediction_type']
    }
  },
  // === WRITE TOOLS (L3/L5 Learning) ===
  {
    name: 'store_learned_pattern',
    description: 'Store a discovered pattern or insight into long-term memory (ai_memory) so the system learns and remembers it for future analysis',
    input_schema: {
      type: 'object',
      properties: {
        pattern_type: { type: 'string', description: 'Type of pattern', enum: ['pattern', 'anomaly', 'correlation', 'trend', 'risk_signal', 'opportunity'] },
        title: { type: 'string', description: 'Short descriptive title for the pattern' },
        content: { type: 'string', description: 'JSON string with pattern details including domain, entities, metrics, and business impact' },
        confidence: { type: 'string', description: 'Confidence score 0.0-1.0' },
        severity: { type: 'string', description: 'Severity level', enum: ['critical', 'high', 'medium', 'low', 'info'] }
      },
      required: ['pattern_type', 'title', 'content', 'confidence']
    }
  },
  {
    name: 'store_prediction',
    description: 'Record a prediction about a future outcome so it can be tracked and verified later, closing the learning loop',
    input_schema: {
      type: 'object',
      properties: {
        prediction_type: { type: 'string', description: 'Type of prediction', enum: ['churn', 'expansion', 'collection', 'renewal', 'deal_outcome', 'health_change', 'revenue_impact'] },
        entity_type: { type: 'string', description: 'Type of entity', enum: ['client', 'deal', 'invoice', 'project', 'employee', 'campaign'] },
        entity_id: { type: 'string', description: 'UUID of the entity' },
        predicted_outcome: { type: 'string', description: 'Description of the predicted outcome' },
        confidence: { type: 'string', description: 'Confidence score 0.0-1.0' },
        predicted_date: { type: 'string', description: 'When the outcome is expected (ISO date)' }
      },
      required: ['prediction_type', 'entity_type', 'entity_id', 'predicted_outcome', 'confidence']
    }
  }
];

// ============================================================================
// DOMAIN TOOL MAPPING
// ============================================================================

export function getToolsForDomain(domain: string): Tool[] {
  const baseTools = [...MEMORY_TOOLS];
  
  switch (domain) {
    case 'finance':
      return [...FINANCE_TOOLS, ...baseTools];
    case 'cs':
      return [...CS_TOOLS, ...baseTools];
    case 'revenue':
      return [...REVENUE_TOOLS, ...baseTools];
    case 'am':
    case 'account-management':
      return [...AM_TOOLS, ...baseTools];
    case 'services':
      return [...SERVICES_TOOLS, ...baseTools];
    case 'marketing':
    case 'people':
    case 'product':
    case 'engineering':
    case 'analyst':
    case 'executive':
      // These domains use memory-only tools (no specialized DB queries yet)
      return baseTools;
    default:
      return baseTools;
  }
}

// ============================================================================
// TOOL EXECUTION ENGINE
// ============================================================================

export async function executeAgentTool(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  toolName: string,
  toolInput: Record<string, any>,
  domain: string
): Promise<any> {
  console.log(`[ToolRegistry] Executing ${toolName} for ${domain}`, toolInput);
  
  switch (toolName) {
    // =========== FINANCE TOOLS ===========
    case 'query_overdue_invoices':
      return await queryOverdueInvoices(supabase, organizationId, toolInput);
    
    case 'get_client_financial_health':
      return await getClientFinancialHealth(supabase, organizationId, toolInput.client_id);
    
    case 'create_collection_action':
      return await createAction(supabase, organizationId, 'finance', 'collection', toolInput);
    
    case 'search_payment_patterns':
      return await searchMemory(supabase, organizationId, toolInput.query, 'payment');
    
    // =========== CS TOOLS ===========
    case 'get_client_health_scores':
      return await getClientHealthScores(supabase, organizationId, toolInput);
    
    case 'get_nps_trends':
      return await getNPSTrends(supabase, organizationId, toolInput);
    
    case 'get_usage_analytics':
      return await getUsageAnalytics(supabase, organizationId, toolInput);
    
    case 'create_cs_intervention':
      return await createAction(supabase, organizationId, 'cs', toolInput.intervention_type, toolInput);
    
    case 'search_churn_patterns':
      return await searchMemory(supabase, organizationId, toolInput.query, 'churn');
    
    // =========== REVENUE TOOLS ===========
    case 'get_pipeline_deals':
      return await getPipelineDeals(supabase, organizationId, toolInput);
    
    case 'get_deal_velocity':
      return await getDealVelocity(supabase, organizationId, toolInput);
    
    case 'create_deal_task':
      return await createAction(supabase, organizationId, 'revenue', 'deal_task', toolInput);
    
    case 'search_win_patterns':
      return await searchMemory(supabase, organizationId, toolInput.query, 'deal');
    
    // =========== AM TOOLS ===========
    case 'get_upcoming_renewals':
      return await getUpcomingRenewals(supabase, organizationId, toolInput);
    
    case 'get_expansion_opportunities':
      return await getExpansionOpportunities(supabase, organizationId, toolInput);
    
    case 'get_client_360':
      return await getClient360(supabase, organizationId, toolInput.client_id);
    
    case 'create_renewal_action':
      return await createAction(supabase, organizationId, 'account-management', 'renewal', toolInput);
    
    // =========== SERVICES TOOLS ===========
    case 'get_active_projects':
      return await getActiveProjects(supabase, organizationId, toolInput);
    
    case 'get_milestone_status':
      return await getMilestoneStatus(supabase, organizationId, toolInput.project_id);
    
    case 'create_project_action':
      return await createAction(supabase, organizationId, 'services', toolInput.action_type, toolInput);
    
    // =========== MEMORY TOOLS ===========
    case 'search_similar_situations':
      return await searchSimilarSituations(supabase, organizationId, toolInput.query, toolInput.entity_type);
    
    case 'retrieve_causal_chain':
      return await retrieveCausalChain(supabase, organizationId, toolInput.source_domain, toolInput.trigger_signal);
    
    case 'get_tacit_knowledge':
      return await getTacitKnowledge(supabase, organizationId, toolInput.decision_context);
    
    case 'check_prediction_accuracy':
      return await checkPredictionAccuracy(supabase, organizationId, toolInput.prediction_type);

    // =========== WRITE TOOLS (Learning) ===========
    case 'store_learned_pattern': {
      let contentObj: Record<string, any>;
      try {
        contentObj = typeof toolInput.content === 'string' ? JSON.parse(toolInput.content) : toolInput.content;
      } catch {
        contentObj = { raw: toolInput.content, domain };
      }
      const patternId = await storeLearnedPattern(supabase, organizationId, {
        type: toolInput.pattern_type || 'pattern',
        title: toolInput.title,
        content: { ...contentObj, agent_domain: domain, stored_by: 'agent_tool' },
        confidence: parseFloat(toolInput.confidence || '0.7'),
        severity: toolInput.severity || 'info'
      });
      return { success: !!patternId, pattern_id: patternId, message: `Stored pattern: ${toolInput.title}` };
    }

    case 'store_prediction': {
      const predId = await storePrediction(supabase, organizationId, {
        type: toolInput.prediction_type,
        entityType: toolInput.entity_type,
        entityId: toolInput.entity_id,
        predictedOutcome: toolInput.predicted_outcome,
        confidence: parseFloat(toolInput.confidence || '0.7'),
        predictedDate: toolInput.predicted_date
      });
      return { success: !!predId, prediction_id: predId, message: `Stored prediction: ${toolInput.predicted_outcome}` };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function queryOverdueInvoices(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  let query = supabase
    .from('invoices')
    .select('*, clients(name, account_manager_id)')
    .eq('organization_id', organizationId)
    .eq('status', 'overdue')
    .order('amount', { ascending: false });
  
  if (input.client_id) {
    query = query.eq('client_id', input.client_id);
  }
  if (input.min_amount) {
    query = query.gte('amount', parseFloat(input.min_amount));
  }
  
  const { data, error } = await query.limit(50);
  
  if (error) throw error;
  
  // Calculate days overdue
  const now = new Date();
  const enriched = (data || []).map((inv: any) => ({
    ...inv,
    days_overdue: Math.ceil((now.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
  }));
  
  const minDays = parseInt(input.min_days_overdue || '0');
  return enriched.filter((inv: any) => inv.days_overdue >= minDays);
}

async function getClientFinancialHealth(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  clientId: string
) {
  // Fetch client data separately
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', clientId)
    .single();
  
  if (clientError) throw clientError;
  
  // Fetch invoices separately
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, amount, status, due_date, paid_at')
    .eq('client_id', clientId);
  
  // Fetch contracts separately
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, contract_value, start_date, end_date, status')
    .eq('client_id', clientId);
  
  // Calculate financial metrics
  const invoiceList = invoices || [];
  const overdueInvoices = invoiceList.filter((i: any) => i.status === 'overdue');
  const totalOverdue = overdueInvoices.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
  const paidInvoices = invoiceList.filter((i: any) => i.status === 'paid');
  
  // Calculate average days to pay
  const paymentDays = paidInvoices
    .filter((i: any) => i.paid_at)
    .map((i: any) => {
      const due = new Date(i.due_date);
      const paid = new Date(i.paid_at);
      return Math.ceil((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    });
  
  const avgDaysToPay = paymentDays.length > 0 
    ? paymentDays.reduce((a: number, b: number) => a + b, 0) / paymentDays.length 
    : 0;
  
  return {
    client_name: client?.name,
    arr: client?.arr || 0,
    health_score: client?.health_score,
    total_overdue: totalOverdue,
    overdue_invoice_count: overdueInvoices.length,
    avg_days_to_pay: Math.round(avgDaysToPay),
    payment_risk: avgDaysToPay > 30 ? 'high' : avgDaysToPay > 15 ? 'medium' : 'low'
  };
}

async function getClientHealthScores(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  let query = supabase
    .from('clients')
    .select('id, name, health_score, health_status, arr, nps_score, last_engagement_date')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('health_score', { ascending: true });
  
  if (input.health_status) {
    query = query.eq('health_status', input.health_status);
  }
  
  const limit = parseInt(input.limit || '20');
  const { data, error } = await query.limit(limit);
  
  if (error) throw error;
  return data || [];
}

async function getNPSTrends(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const days = parseInt(input.days || '90');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let query = supabase
    .from('nps_surveys')
    .select('*, clients(name)')
    .eq('organization_id', organizationId)
    .gte('survey_date', startDate.toISOString())
    .order('survey_date', { ascending: true });
  
  if (input.client_id) {
    query = query.eq('client_id', input.client_id);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Calculate trends
  const scores = (data || []).map((s: any) => s.score);
  const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
  
  const promoters = scores.filter((s: number) => s >= 9).length;
  const detractors = scores.filter((s: number) => s <= 6).length;
  const nps = scores.length > 0 ? Math.round(((promoters - detractors) / scores.length) * 100) : 0;
  
  return {
    total_surveys: scores.length,
    average_score: Math.round(avgScore * 10) / 10,
    nps_score: nps,
    promoters,
    detractors,
    passives: scores.length - promoters - detractors,
    recent_surveys: data?.slice(-10) || []
  };
}

async function getUsageAnalytics(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  // This would query a usage_analytics table if it exists
  // For now, return engagement data from clients
  let query = supabase
    .from('clients')
    .select('id, name, engagement_score, last_engagement_date, arr')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('engagement_score', { ascending: true });
  
  if (input.client_id) {
    query = query.eq('id', input.client_id);
  }
  
  const { data, error } = await query.limit(20);
  if (error) throw error;
  
  return {
    low_engagement_clients: (data || []).filter((c: any) => (c.engagement_score || 0) < 50),
    average_engagement: (data || []).reduce((sum: number, c: any) => sum + (c.engagement_score || 0), 0) / ((data || []).length || 1)
  };
}

async function getPipelineDeals(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  let query = supabase
    .from('revenue_deals')
    .select('*, clients(name)')
    .eq('organization_id', organizationId)
    .neq('deal_status', 'won')
    .neq('deal_status', 'lost')
    .order('deal_value', { ascending: false });
  
  if (input.stage) {
    query = query.eq('stage', input.stage);
  }
  if (input.category) {
    query = query.eq('deal_category', input.category);
  }
  if (input.min_value) {
    query = query.gte('deal_value', parseFloat(input.min_value));
  }
  
  const { data, error } = await query.limit(50);
  if (error) throw error;
  
  // Filter by inactivity if requested
  if (input.days_inactive) {
    const threshold = parseInt(input.days_inactive);
    const now = new Date();
    return (data || []).filter((d: any) => {
      if (!d.last_activity_date) return true;
      const daysSince = (now.getTime() - new Date(d.last_activity_date).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= threshold;
    });
  }
  
  return data || [];
}

async function getDealVelocity(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const periodDays = parseInt(input.period_days || '90');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  const { data: deals, error } = await supabase
    .from('revenue_deals')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate.toISOString());
  
  if (error) throw error;
  
  const won = (deals || []).filter((d: any) => d.deal_status === 'won');
  const lost = (deals || []).filter((d: any) => d.deal_status === 'lost');
  const active = (deals || []).filter((d: any) => !['won', 'lost'].includes(d.deal_status));
  
  return {
    total_deals: (deals || []).length,
    won_count: won.length,
    won_value: won.reduce((sum: number, d: any) => sum + (d.deal_value || 0), 0),
    lost_count: lost.length,
    active_count: active.length,
    active_value: active.reduce((sum: number, d: any) => sum + (d.deal_value || 0), 0),
    win_rate: (deals || []).length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0
  };
}

async function getUpcomingRenewals(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const daysAhead = parseInt(input.days_ahead || '90');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  
  let query = supabase
    .from('contracts')
    .select('*, clients(name, health_score, arr)')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .lte('end_date', futureDate.toISOString())
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: true });
  
  const { data, error } = await query;
  if (error) throw error;
  
  const enriched = (data || []).map((c: any) => ({
    ...c,
    days_until_renewal: Math.ceil((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    at_risk: (c.clients?.health_score || 100) < 60
  }));
  
  if (input.at_risk_only === 'true') {
    return enriched.filter((c: any) => c.at_risk);
  }
  
  return enriched;
}

async function getExpansionOpportunities(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  // Clients with good health but expansion potential
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .gte('health_score', 70)
    .order('arr', { ascending: false })
    .limit(20);
  
  if (error) throw error;
  
  // Simple expansion potential calculation
  const enriched = (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    current_arr: c.arr || 0,
    health_score: c.health_score,
    expansion_potential: Math.round((c.arr || 0) * 0.3), // 30% expansion estimate
    signals: c.health_score >= 80 ? ['High engagement', 'Good health'] : ['Stable account']
  }));
  
  if (input.min_potential_value) {
    const minValue = parseFloat(input.min_potential_value);
    return enriched.filter((c: any) => c.expansion_potential >= minValue);
  }
  
  return enriched;
}

async function getClient360(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  clientId: string
) {
  // Fetch client data separately
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', clientId)
    .single();
  
  if (clientError) throw clientError;
  
  // Fetch related data separately
  const [invoicesResult, contractsResult, npsResult, projectsResult] = await Promise.all([
    supabase.from('invoices').select('id, amount, status, due_date').eq('client_id', clientId),
    supabase.from('contracts').select('id, contract_value, start_date, end_date, status').eq('client_id', clientId),
    supabase.from('nps_surveys').select('score, survey_date').eq('client_id', clientId).order('survey_date', { ascending: true }),
    supabase.from('service_projects').select('id, project_name, status, health').eq('client_id', clientId)
  ]);
  
  const invoices = invoicesResult.data || [];
  const contracts = contractsResult.data || [];
  const nps = npsResult.data || [];
  const projects = projectsResult.data || [];
  
  return {
    client_name: client?.name,
    arr: client?.arr || 0,
    health_score: client?.health_score,
    health_status: client?.health_status,
    account_manager: client?.account_manager_id,
    // Financial summary
    total_invoices: invoices.length,
    overdue_invoices: invoices.filter((i: any) => i.status === 'overdue').length,
    overdue_amount: invoices.filter((i: any) => i.status === 'overdue').reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
    // Contract summary
    active_contracts: contracts.filter((c: any) => c.status === 'active').length,
    total_contract_value: contracts.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0),
    // NPS summary
    latest_nps: nps.length > 0 ? (nps[nps.length - 1] as any).score : null,
    avg_nps: nps.length > 0 ? nps.reduce((sum: number, n: any) => sum + n.score, 0) / nps.length : null,
    // Projects summary
    active_projects: projects.filter((p: any) => p.status === 'Active').length,
    at_risk_projects: projects.filter((p: any) => p.health === 'Red').length
  };
}

async function getActiveProjects(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  let query = supabase
    .from('service_projects')
    .select('*, clients(name)')
    .eq('organization_id', organizationId)
    .eq('status', 'Active')
    .order('created_at', { ascending: false });
  
  if (input.health_status) {
    query = query.eq('health', input.health_status);
  }
  if (input.client_id) {
    query = query.eq('client_id', input.client_id);
  }
  
  const { data, error } = await query.limit(30);
  if (error) throw error;
  
  return data || [];
}

async function getMilestoneStatus(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  projectId: string
) {
  const { data: project, error } = await supabase
    .from('service_projects')
    .select('*, service_milestones(*)')
    .eq('organization_id', organizationId)
    .eq('id', projectId)
    .single();
  
  if (error) throw error;
  
  const milestones = project?.service_milestones || [];
  
  return {
    project_name: project?.project_name,
    health: project?.health,
    status: project?.status,
    total_milestones: Array.isArray(milestones) ? milestones.length : 0,
    completed: Array.isArray(milestones) ? milestones.filter((m: any) => m.status === 'completed').length : 0,
    overdue: Array.isArray(milestones) ? milestones.filter((m: any) => m.status === 'overdue').length : 0,
    upcoming: Array.isArray(milestones) ? milestones.filter((m: any) => m.status === 'pending').length : 0,
    milestones: Array.isArray(milestones) ? milestones.slice(0, 10) : []
  };
}

// ============================================================================
// MEMORY STACK TOOL IMPLEMENTATIONS
// ============================================================================

async function searchSimilarSituations(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  query: string,
  entityType?: string
) {
  const embedding = generateEmbedding(query);
  
  const { data, error } = await supabase.rpc('search_embeddings_temporal', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.4,
    entity_types: entityType ? [entityType] : null,
    decay_half_life_days: 90,
    org_id: organizationId
  });
  
  if (error) {
    // Fallback to simple search - use Brain client for ai_memory (Brain table)
    const brainClient = getClientForTableInEdge('ai_memory');
    const { data: fallback } = await brainClient
      .from('ai_memory')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .limit(5);
    
    return {
      matches: fallback || [],
      source: 'fallback'
    };
  }
  
  return {
    matches: data || [],
    source: 'vector_search'
  };
}

async function retrieveCausalChain(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  sourceDomain: string,
  triggerSignal?: string
) {
  // Use Brain client for causal_chains (Brain table)
  const brainClient = getClientForTableInEdge('causal_chains');
  
  let query = brainClient
    .from('causal_chains')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_domain', sourceDomain)
    .eq('validated', true)
    .order('confidence', { ascending: false });
  
  if (triggerSignal) {
    query = query.ilike('source_signal', `%${triggerSignal}%`);
  }
  
  const { data, error } = await query.limit(5);
  if (error) throw error;
  
  return {
    chains: data || [],
    count: (data || []).length
  };
}

async function getTacitKnowledge(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  decisionContext: string
) {
  const embedding = generateEmbedding(decisionContext);
  
  // Try vector search first
  const { data: vectorResults } = await supabase.rpc('search_tacit_knowledge', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.4,
    org_id: organizationId
  });
  
  if (vectorResults && vectorResults.length > 0) {
    return {
      patterns: vectorResults,
      source: 'vector_search'
    };
  }
  
  // Fallback to recent patterns
  const { data: fallback, error } = await supabase
    .from('tacit_knowledge_patterns')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .limit(5);
  
  if (error) throw error;
  
  return {
    patterns: fallback || [],
    source: 'recent_patterns'
  };
}

async function checkPredictionAccuracy(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  predictionType: string
) {
  const { data, error } = await supabase
    .from('prediction_records')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('prediction_type', predictionType)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) throw error;
  
  const verified = (data || []).filter((p: any) => p.outcome_verified);
  const accurate = verified.filter((p: any) => p.was_correct);
  
  return {
    total_predictions: (data || []).length,
    verified_count: verified.length,
    accurate_count: accurate.length,
    accuracy_rate: verified.length > 0 ? Math.round((accurate.length / verified.length) * 100) : null,
    recent_predictions: (data || []).slice(0, 5)
  };
}

async function searchMemory(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  query: string,
  memoryType: string
) {
  // Use Brain client for ai_memory (Brain table)
  const brainClient = getClientForTableInEdge('ai_memory');
  
  const { data, error } = await brainClient
    .from('ai_memory')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('memory_type', memoryType)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .limit(5);
  
  if (error) throw error;
  
  return {
    memories: data || [],
    count: (data || []).length
  };
}

async function createAction(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  domain: string,
  actionType: string,
  input: Record<string, any>
) {
  const { data, error } = await supabase
    .from('action_queue')
    .insert({
      organization_id: organizationId,
      domain,
      action_type: actionType,
      client_id: input.client_id || input.deal_id || input.project_id,
      title: input.title,
      description: input.description,
      priority: input.priority || 'medium',
      due_date: input.due_date || input.renewal_date,
      status: 'pending',
      source_type: 'ai_agent',
      metadata: { agent_created: true, tool_input: input }
    })
    .select()
    .single();
  
  if (error) throw error;
  
  return {
    success: true,
    action_id: data?.id,
    message: `Created ${actionType} action: ${input.title}`
  };
}
