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

// Engineering Tools
export const ENGINEERING_TOOLS: Tool[] = [
  {
    name: 'query_expertise',
    description: 'Find who has expertise on a specific topic, code area, or system. Returns ranked contributors by evidence strength. Use this when someone asks "who knows about X?" or "who should review this?"',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic, code path, or system to find experts for (e.g., "authentication", "src/payment-service", "CI/CD pipeline")' },
        evidence_types: { type: 'string', description: 'Comma-separated evidence types to filter: code_change,review,discussion,documentation,incident_response' },
        limit: { type: 'string', description: 'Max experts to return (default: 5)' }
      },
      required: ['topic']
    }
  },
  {
    name: 'search_code_context',
    description: 'Semantic search across indexed code symbols, files, and documentation. Returns relevant code files, functions, and their descriptions. Use for onboarding questions like "how does auth work?" or debugging "where is payment processing handled?"',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query about code (e.g., "authentication flow", "payment processing", "database migrations")' },
        language: { type: 'string', description: 'Optional: filter by language (typescript, python, go, etc.)' },
        limit: { type: 'string', description: 'Max results to return (default: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'query_incident_context',
    description: 'Get full incident context: recent deployments that may have caused it, relevant runbooks, on-call experts, and causal chains. Use when an incident fires or someone asks about production issues.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Affected service or component name (e.g., "payment-service", "auth", "api-gateway")' },
        hours_lookback: { type: 'string', description: 'Hours to look back for related deployments (default: 12)' },
        include_runbooks: { type: 'string', description: 'Whether to search for relevant runbooks (default: true)' }
      },
      required: ['service']
    }
  },
  {
    name: 'analyze_pr_risk',
    description: 'Analyze a PR for risk: find past incidents in the touched file paths, suggest reviewers who know those areas, and flag causal patterns. Use for code review intelligence.',
    input_schema: {
      type: 'object',
      properties: {
        file_paths: { type: 'string', description: 'Comma-separated file paths or directories touched by the PR (e.g., "src/payment,src/auth")' },
        pr_title: { type: 'string', description: 'PR title for context' },
        days_lookback: { type: 'string', description: 'Days to look back for incident history (default: 90)' }
      },
      required: ['file_paths']
    }
  },
  {
    name: 'get_team_activity',
    description: 'Get engineering team activity summary: recent signals, top topics, sentiment trends, active contributors, and cross-team collaboration. Use when PMs or leaders ask "what is engineering working on?"',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'string', description: 'Number of days to summarize (default: 7)' },
        include_sentiment: { type: 'string', description: 'Include sentiment analysis (default: true)' }
      }
    }
  },
  {
    name: 'search_ci_failures',
    description: 'Search for past CI/CD failures similar to the current one. Returns matching failures with their resolution (what PR fixed it), causal analysis, and timeline. Use for debugging CI issues.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the failure (e.g., "test timeout in payment module", "build fails on dependency update")' },
        provider: { type: 'string', description: 'CI provider filter: github_actions, jenkins, circleci, gitlab_ci' },
        days_lookback: { type: 'string', description: 'Days to look back (default: 30)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_collaboration_network',
    description: 'Get cross-team collaboration patterns: who works with whom, bridge contributors connecting teams, team interaction frequency, and collaboration bottlenecks. Use for org health, onboarding ("who should I work with?"), and leadership visibility.',
    input_schema: {
      type: 'object',
      properties: {
        contributor: { type: 'string', description: 'Optional: focus on a specific contributor\'s network' },
        team: { type: 'string', description: 'Optional: focus on a specific team\'s collaborations' },
        days: { type: 'string', description: 'Lookback period in days (default: 30)' }
      }
    }
  },
  {
    name: 'ingest_adr',
    description: 'Index an Architectural Decision Record (ADR) into brain memory. ADRs capture "why" decisions were made — the most valuable knowledge for onboarding and future decision-making. Stores as searchable memory with topic extraction.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'ADR title (e.g., "ADR-001: Use PostgreSQL for primary datastore")' },
        content: { type: 'string', description: 'Full ADR content including context, decision, consequences' },
        status: { type: 'string', description: 'ADR status: proposed, accepted, deprecated, superseded (default: accepted)' },
        tags: { type: 'string', description: 'Comma-separated tags (e.g., "database,infrastructure,performance")' },
        author: { type: 'string', description: 'Author of the ADR' },
        date: { type: 'string', description: 'Date of the decision (ISO format)' }
      },
      required: ['title', 'content']
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
    case 'engineering':
      return [...ENGINEERING_TOOLS, ...baseTools];
    case 'marketing':
    case 'people':
    case 'product':
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

    // =========== ENGINEERING TOOLS ===========
    case 'query_expertise':
      return await queryExpertise(supabase, organizationId, toolInput);

    case 'search_code_context':
      return await searchCodeContext(supabase, organizationId, toolInput);

    case 'query_incident_context':
      return await queryIncidentContext(supabase, organizationId, toolInput);

    case 'analyze_pr_risk':
      return await analyzePRRisk(supabase, organizationId, toolInput);

    case 'get_team_activity':
      return await getTeamActivity(supabase, organizationId, toolInput);

    case 'search_ci_failures':
      return await searchCIFailures(supabase, organizationId, toolInput);

    case 'get_collaboration_network':
      return await getCollaborationNetwork(supabase, organizationId, toolInput);

    case 'ingest_adr':
      return await ingestADR(supabase, organizationId, toolInput);

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

// ============================================================================
// ENGINEERING TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * UC1/UC3/UC5: Query expertise graph for contributors by topic.
 * Powers: "who knows about auth?", "who should review this?", "who is on-call expert?"
 */
async function queryExpertise(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const topic = input.topic;
  const limit = parseInt(input.limit || '5', 10);
  const evidenceFilter = input.evidence_types
    ? input.evidence_types.split(',').map((s: string) => s.trim())
    : undefined;

  // Query contributor_expertise table (populated by expertise graph + consolidation engine)
  const { data, error } = await supabase
    .from('contributor_expertise')
    .select('*')
    .eq('organization_id', organizationId)
    .ilike('topic', `%${topic}%`)
    .order('strength', { ascending: false })
    .limit(limit * 3); // Fetch extra for post-filtering

  if (error) throw error;

  let results = data || [];

  // Filter by evidence types if provided
  if (evidenceFilter && evidenceFilter.length > 0) {
    results = results.filter((r: any) =>
      evidenceFilter.includes(r.evidence_type)
    );
  }

  // Aggregate by contributor (may have multiple evidence types per person)
  const byContributor = new Map<string, any>();
  for (const row of results) {
    const existing = byContributor.get(row.contributor_id);
    if (existing) {
      existing.total_strength += row.strength;
      existing.evidence_types.push(row.evidence_type);
      existing.evidence_count += row.evidence_count || 1;
    } else {
      byContributor.set(row.contributor_id, {
        contributor_id: row.contributor_id,
        contributor_name: row.contributor_name || row.contributor_id,
        topic: row.topic,
        total_strength: row.strength,
        evidence_types: [row.evidence_type],
        evidence_count: row.evidence_count || 1,
        last_activity: row.last_activity_at
      });
    }
  }

  const ranked = [...byContributor.values()]
    .sort((a, b) => b.total_strength - a.total_strength)
    .slice(0, limit);

  return {
    experts: ranked,
    topic,
    total_found: ranked.length,
    message: ranked.length > 0
      ? `Found ${ranked.length} expert(s) for "${topic}". Top: ${ranked[0].contributor_name} (strength: ${ranked[0].total_strength.toFixed(2)}, evidence: ${ranked[0].evidence_types.join(', ')})`
      : `No experts found for "${topic}". The expertise graph may not have enough data yet for this topic.`
  };
}

/**
 * UC1/UC2: Enhanced semantic search across code symbols and documentation.
 * Powers: "how does auth work?", "where is payment processing?"
 *
 * Scoring model (TF-IDF-inspired, multi-field):
 *  - Exact entity_id match: +10 (e.g., query = "AuthService" matches entity_id)
 *  - Title/function name match: +5 per term
 *  - File path match: +3 per path segment hit
 *  - Content body match: +1 per term (reduced weight for verbose bodies)
 *  - Language filter bonus: +2 if language matches
 *  - Inverse frequency boost: rare terms across corpus score higher
 *  - importance_score baseline from indexer
 */
async function searchCodeContext(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const query = input.query;
  const limit = parseInt(input.limit || '10', 10);
  const languageFilter = input.language?.toLowerCase();

  // Search entity_embeddings for code_symbol entities
  const { data, error } = await supabase
    .from('entity_embeddings')
    .select('entity_id, content, metadata, importance_score')
    .eq('organization_id', organizationId)
    .eq('entity_type', 'code_symbol')
    .order('importance_score', { ascending: false })
    .limit(300); // Larger pool for better recall

  if (error) throw error;

  // Also search training_pack entities (runbooks, ADRs, documentation)
  const { data: docData } = await supabase
    .from('entity_embeddings')
    .select('entity_id, content, metadata, importance_score')
    .eq('organization_id', organizationId)
    .in('entity_type', ['training_pack', 'documentation', 'adr'])
    .order('importance_score', { ascending: false })
    .limit(100);

  // Also search ai_memory for learned architectural patterns
  const { data: memoryData } = await supabase
    .from('ai_memory')
    .select('id, memory_type, title, content, metadata, confidence')
    .eq('organization_id', organizationId)
    .in('memory_type', ['pattern', 'fact', 'runbook', 'adr'])
    .order('confidence', { ascending: false })
    .limit(50);

  // Build term frequency map for IDF-like scoring
  const allItems = [...(data || []), ...(docData || [])];
  const termDocFreq = new Map<string, number>();
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 2);

  for (const item of allItems) {
    const combined = ((item.content || '') + ' ' + JSON.stringify(item.metadata || {})).toLowerCase();
    for (const term of queryTerms) {
      if (combined.includes(term)) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
    }
  }

  const totalDocs = Math.max(allItems.length, 1);

  // Score function with multi-field weighting
  function scoreItem(item: any, isDoc = false): number {
    const entityId = (item.entity_id || '').toLowerCase();
    const content = (item.content || '').toLowerCase();
    const meta = item.metadata || {};
    const metaStr = JSON.stringify(meta).toLowerCase();
    const filePath = (meta.file_path || meta.filePath || '').toLowerCase();
    const funcName = (meta.function_name || meta.name || meta.symbol || '').toLowerCase();
    const lang = (meta.language || '').toLowerCase();
    const title = (meta.title || item.title || '').toLowerCase();

    let score = (item.importance_score || item.confidence || 0) * 0.5; // Baseline

    for (const term of queryTerms) {
      // IDF weight: rare terms score higher
      const df = termDocFreq.get(term) || 1;
      const idf = Math.log(totalDocs / df + 1);

      // Entity ID / function name exact match (highest signal)
      if (entityId.includes(term) || funcName.includes(term)) {
        score += 5 * idf;
      }

      // Title match (ADRs, runbooks)
      if (title.includes(term)) {
        score += 4 * idf;
      }

      // File path match
      if (filePath.includes(term)) {
        score += 3 * idf;
      }

      // Content body match (lower weight — content is verbose)
      if (content.includes(term)) {
        score += 1.0 * idf;
      }

      // Metadata fields match (tags, labels, etc.)
      if (metaStr.includes(term) && !content.includes(term) && !entityId.includes(term)) {
        score += 1.5 * idf;
      }
    }

    // Exact phrase match bonus
    if (content.includes(query.toLowerCase()) || entityId.includes(query.toLowerCase())) {
      score += 8;
    }

    // Language filter bonus
    if (languageFilter && lang === languageFilter) {
      score += 2;
    } else if (languageFilter && lang && lang !== languageFilter) {
      score *= 0.3; // Penalize wrong language
    }

    // Documentation type bonus (ADRs, runbooks are high-value for onboarding)
    if (isDoc) {
      score *= 1.2;
    }

    return score;
  }

  const scoredCode = (data || []).map((item: any) => ({
    ...item,
    relevance_score: scoreItem(item),
    source_type: 'code',
  }));

  const scoredDocs = (docData || []).map((item: any) => ({
    ...item,
    relevance_score: scoreItem(item, true),
    source_type: 'documentation',
  }));

  // Score memory items similarly
  const scoredMemory = (memoryData || []).map((item: any) => {
    const combined = ((item.title || '') + ' ' + (item.content || '') + ' ' + JSON.stringify(item.metadata || {})).toLowerCase();
    let score = (item.confidence || 0.5) * 0.5;
    for (const term of queryTerms) {
      if (combined.includes(term)) score += 2.0;
      if ((item.title || '').toLowerCase().includes(term)) score += 3.0;
    }
    return {
      entity_id: item.id,
      content: item.content,
      metadata: { ...item.metadata, memory_type: item.memory_type, title: item.title },
      relevance_score: score,
      source_type: item.memory_type === 'adr' ? 'adr' : 'memory',
    };
  });

  // Merge all sources and rank
  const allScored = [...scoredCode, ...scoredDocs, ...scoredMemory]
    .filter((s: any) => s.relevance_score > 0.1)
    .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
    .slice(0, limit);

  // Also search for related engineering signals
  const { data: signals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .order('created_at', { ascending: false })
    .limit(30);

  const relatedSignals = (signals || []).filter((s: any) => {
    const meta = JSON.stringify(s.metadata || '').toLowerCase();
    return queryTerms.some((term: string) => meta.includes(term));
  }).slice(0, 5);

  // Find experts who know about this topic
  const { data: experts } = await supabase
    .from('contributor_expertise')
    .select('contributor_id, contributor_name, topic, strength, evidence_type')
    .eq('organization_id', organizationId)
    .ilike('topic', `%${queryTerms[0] || query}%`)
    .order('strength', { ascending: false })
    .limit(3);

  return {
    code_results: allScored.map((r: any) => ({
      entity_id: r.entity_id,
      content: r.content?.substring(0, 500),
      metadata: r.metadata,
      relevance: parseFloat(r.relevance_score.toFixed(2)),
      source_type: r.source_type,
    })),
    related_signals: relatedSignals,
    related_experts: (experts || []).map((e: any) => ({
      name: e.contributor_name || e.contributor_id,
      topic: e.topic,
      strength: e.strength,
      evidence: e.evidence_type,
    })),
    total_code_results: allScored.filter((r: any) => r.source_type === 'code').length,
    total_doc_results: allScored.filter((r: any) => r.source_type !== 'code').length,
    total_related_signals: relatedSignals.length,
    total_related_experts: (experts || []).length,
    message: allScored.length > 0
      ? `Found ${allScored.length} result(s) for "${query}" (${allScored.filter((r: any) => r.source_type === 'code').length} code, ${allScored.filter((r: any) => r.source_type !== 'code').length} docs/ADRs/memory).${(experts || []).length > 0 ? ` Top expert: ${(experts || [])[0]?.contributor_name || (experts || [])[0]?.contributor_id}` : ''}`
      : `No indexed content found for "${query}". Code indexing or documentation ingestion may need to run first.`
  };
}

/**
 * UC3: Full incident context — deployments, runbooks, experts, causal chains.
 * Powers: "Alert fires in #incidents" → automatic correlation
 */
async function queryIncidentContext(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const service = input.service;
  const hoursLookback = parseInt(input.hours_lookback || '12', 10);
  const includeRunbooks = input.include_runbooks !== 'false';
  const cutoffTime = new Date(Date.now() - hoursLookback * 60 * 60 * 1000).toISOString();

  // Normalize service name for fuzzy matching (payment-service, paymentService, payment_service all match)
  const serviceNorm = service.toLowerCase().replace(/[-_\s]/g, '');
  const serviceTerms = service.toLowerCase().split(/[-_\s/]+/).filter((t: string) => t.length > 2);

  function matchesService(metaObj: any): boolean {
    const metaStr = JSON.stringify(metaObj || '').toLowerCase();
    // Exact normalized match
    const metaNorm = metaStr.replace(/[-_\s]/g, '');
    if (metaNorm.includes(serviceNorm)) return true;
    // Term-based match: all significant terms must appear
    if (serviceTerms.length > 0 && serviceTerms.every((t: string) => metaStr.includes(t))) return true;
    // Directory match: e.g. "payment-service" matches file_paths containing "payment" dir
    if (metaObj?.file_paths && Array.isArray(metaObj.file_paths)) {
      if (metaObj.file_paths.some((fp: string) => serviceTerms.some((t: string) => fp.toLowerCase().includes(t)))) return true;
    }
    if (metaObj?.directories_changed && Array.isArray(metaObj.directories_changed)) {
      if (metaObj.directories_changed.some((d: string) => serviceTerms.some((t: string) => d.toLowerCase().includes(t)))) return true;
    }
    return false;
  }

  // 1. Find recent deployments that might have caused this
  const { data: deployments } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .in('signal_type', ['deploy_success', 'deploy_failure', 'ci_failed'])
    .gte('created_at', cutoffTime)
    .order('created_at', { ascending: false })
    .limit(20);

  // Filter deployments related to this service (normalized fuzzy matching)
  const relatedDeploys = (deployments || []).filter((d: any) => matchesService(d.metadata));

  // 2. Find on-call experts for this service
  const { data: experts } = await supabase
    .from('contributor_expertise')
    .select('contributor_id, contributor_name, strength, evidence_type')
    .eq('organization_id', organizationId)
    .or(`topic.ilike.%${service}%,evidence_type.eq.incident_response`)
    .order('strength', { ascending: false })
    .limit(5);

  // 3. Find relevant causal chains
  const { data: chains } = await supabase
    .from('causal_chains')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('validated', true)
    .or(`source_domain.eq.engineering,metadata->service.eq.${service}`)
    .order('confidence', { ascending: false })
    .limit(10);

  // 4. Find past incidents for this service
  const { data: pastIncidents } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .in('signal_type', ['incident_triggered', 'incident_resolved'])
    .order('created_at', { ascending: false })
    .limit(20);

  const relatedPastIncidents = (pastIncidents || []).filter((i: any) => matchesService(i.metadata));

  // 5. Search for runbooks (if requested)
  let runbooks: any[] = [];
  if (includeRunbooks) {
    const { data: runbookData } = await supabase
      .from('entity_embeddings')
      .select('entity_id, content, metadata')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'training_pack')
      .ilike('content', `%${service}%`)
      .limit(5);
    runbooks = runbookData || [];
  }

  return {
    service,
    recent_deployments: relatedDeploys.length > 0 ? relatedDeploys : (deployments || []).slice(0, 5),
    deployment_correlation: relatedDeploys.length > 0
      ? `Found ${relatedDeploys.length} deployment(s) related to ${service} in the last ${hoursLookback}h. These may have caused the incident.`
      : `No deployments found specifically for ${service}. Showing last ${Math.min(5, (deployments || []).length)} general deployments.`,
    on_call_experts: (experts || []).map((e: any) => ({
      name: e.contributor_name || e.contributor_id,
      strength: e.strength,
      evidence: e.evidence_type
    })),
    causal_chains: chains || [],
    past_incidents: relatedPastIncidents.slice(0, 5),
    runbooks: runbooks.map((r: any) => ({
      id: r.entity_id,
      content_preview: r.content?.substring(0, 300),
      metadata: r.metadata
    })),
    summary: {
      deployments_found: relatedDeploys.length,
      experts_found: (experts || []).length,
      causal_chains_found: (chains || []).length,
      past_incidents_found: relatedPastIncidents.length,
      runbooks_found: runbooks.length
    }
  };
}

/**
 * UC5: PR risk analysis — incident history, reviewer suggestions, causal patterns.
 * Powers: "Last 3 PRs touching this dir caused incidents. @alice reviewed all."
 */
async function analyzePRRisk(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const filePaths = input.file_paths.split(',').map((p: string) => p.trim());
  const daysLookback = parseInt(input.days_lookback || '90', 10);
  const cutoffDate = new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000).toISOString();

  // Derive service-like terms from file paths for cross-signal matching
  // e.g. "src/payment-service/auth.ts" → ["payment", "service", "auth"]
  const pathTerms = new Set<string>();
  for (const fp of filePaths) {
    const segments = fp.toLowerCase().split(/[/\\.-_]+/).filter((s: string) => s.length > 2 && s !== 'src' && s !== 'lib' && s !== 'index' && s !== 'test');
    segments.forEach((s: string) => pathTerms.add(s));
  }

  // 1. Find past incidents related to these file paths OR derived service terms
  const { data: signals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false })
    .limit(300);

  // Filter signals related to our file paths (direct path match + service term match)
  const relatedSignals = (signals || []).filter((s: any) => {
    const meta = s.metadata || {};
    const metaStr = JSON.stringify(meta).toLowerCase();

    // Direct file path match (e.g., "src/payment" in metadata.file_paths)
    if (filePaths.some((fp: string) => metaStr.includes(fp.toLowerCase()))) return true;

    // Service name match (e.g., incident.service = "payment-service" matches PR touching "src/payment/")
    if (meta.service) {
      const svcNorm = meta.service.toLowerCase().replace(/[-_\s]/g, '');
      for (const term of pathTerms) {
        if (svcNorm.includes(term)) return true;
      }
    }

    // Pipeline/workflow name match (e.g., "payment-build" workflow matches "src/payment/")
    if (meta.pipeline || meta.workflow) {
      const pipeNorm = ((meta.pipeline || '') + (meta.workflow || '')).toLowerCase();
      for (const term of pathTerms) {
        if (pipeNorm.includes(term)) return true;
      }
    }

    return false;
  });

  const incidents = relatedSignals.filter((s: any) =>
    ['ci_failed', 'test_failed', 'deploy_failure', 'incident_triggered'].includes(s.signal_type)
  );

  // 2. Find expert reviewers for these paths
  const expertResults: any[] = [];
  for (const path of filePaths.slice(0, 3)) { // Check top 3 paths
    const { data: experts } = await supabase
      .from('contributor_expertise')
      .select('contributor_id, contributor_name, strength, evidence_type')
      .eq('organization_id', organizationId)
      .ilike('topic', `%${path}%`)
      .order('strength', { ascending: false })
      .limit(3);
    if (experts) expertResults.push(...experts);
  }

  // Deduplicate experts
  const uniqueExperts = new Map<string, any>();
  for (const e of expertResults) {
    const existing = uniqueExperts.get(e.contributor_id);
    if (existing) {
      existing.total_strength += e.strength;
    } else {
      uniqueExperts.set(e.contributor_id, {
        ...e,
        total_strength: e.strength
      });
    }
  }

  const suggestedReviewers = [...uniqueExperts.values()]
    .sort((a, b) => b.total_strength - a.total_strength)
    .slice(0, 3);

  // 3. Compute risk score
  const riskScore = Math.min(1.0,
    (incidents.length * 0.15) + // Each past incident adds 0.15
    (incidents.filter((i: any) => i.signal_type === 'incident_triggered').length * 0.25) // Production incidents are heavier
  );

  const riskLevel = riskScore >= 0.7 ? 'HIGH' : riskScore >= 0.3 ? 'MEDIUM' : 'LOW';

  return {
    file_paths: filePaths,
    risk_score: parseFloat(riskScore.toFixed(2)),
    risk_level: riskLevel,
    past_incidents: incidents.slice(0, 10).map((i: any) => ({
      type: i.signal_type,
      value: i.signal_value,
      date: i.created_at,
      metadata: i.metadata
    })),
    total_related_signals: relatedSignals.length,
    total_incidents: incidents.length,
    suggested_reviewers: suggestedReviewers.map((r: any) => ({
      name: r.contributor_name || r.contributor_id,
      strength: r.total_strength?.toFixed(2),
      evidence: r.evidence_type
    })),
    message: riskLevel === 'HIGH'
      ? `⚠️ HIGH RISK: ${incidents.length} incident(s) in these file paths over last ${daysLookback} days. Recommend thorough review by: ${suggestedReviewers.map((r: any) => r.contributor_name || r.contributor_id).join(', ')}.`
      : riskLevel === 'MEDIUM'
        ? `⚡ MEDIUM RISK: ${incidents.length} issue(s) found. Consider requesting review from: ${suggestedReviewers.map((r: any) => r.contributor_name || r.contributor_id).join(', ')}.`
        : `✅ LOW RISK: No significant incident history for these files.${suggestedReviewers.length > 0 ? ` Suggested reviewers: ${suggestedReviewers.map((r: any) => r.contributor_name || r.contributor_id).join(', ')}.` : ''}`
  };
}

/**
 * UC6: Team activity summary — signals, topics, sentiment, collaboration.
 * Powers: "What's the engineering team working on?"
 */
async function getTeamActivity(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const days = parseInt(input.days || '7', 10);
  const includeSentiment = input.include_sentiment !== 'false';
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Get recent engineering signals
  const { data: signals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false })
    .limit(500);

  // 1b. ALSO get communication signals (Slack) for engineering channels
  const { data: commSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'communication')
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false })
    .limit(200);

  const allSignals = [...(signals || []), ...(commSignals || [])];
  const engSignals = signals || [];

  // 2. Aggregate signal types
  const signalCounts: Record<string, number> = {};
  for (const s of engSignals) {
    signalCounts[s.signal_type] = (signalCounts[s.signal_type] || 0) + 1;
  }

  // 3. Extract active contributors from ALL signal metadata (engineering + Slack)
  const contributors = new Set<string>();
  for (const s of allSignals) {
    const meta = s.metadata as any;
    if (meta?.author) contributors.add(meta.author);
    if (meta?.reviewer) contributors.add(meta.reviewer);
    if (meta?.triggered_by) contributors.add(meta.triggered_by);
    if (meta?.responder) contributors.add(meta.responder);
    if (meta?.user) contributors.add(meta.user); // Slack users
  }

  // 4. Extract topics from signal metadata (engineering + Slack channels)
  const topicCounts: Record<string, number> = {};
  const channelActivity: Record<string, number> = {};
  for (const s of allSignals) {
    const meta = s.metadata as any;
    // CI pipelines / workflows
    if (meta?.pipeline) {
      topicCounts[meta.pipeline] = (topicCounts[meta.pipeline] || 0) + 1;
    }
    if (meta?.workflow) {
      topicCounts[`workflow:${meta.workflow}`] = (topicCounts[`workflow:${meta.workflow}`] || 0) + 1;
    }
    // File paths from PRs
    if (meta?.file_paths && Array.isArray(meta.file_paths)) {
      for (const fp of meta.file_paths.slice(0, 3)) {
        const dir = fp.split('/').slice(0, 2).join('/');
        topicCounts[dir] = (topicCounts[dir] || 0) + 1;
      }
    }
    // Directories changed
    if (meta?.directories_changed && Array.isArray(meta.directories_changed)) {
      for (const dir of meta.directories_changed.slice(0, 3)) {
        topicCounts[dir] = (topicCounts[dir] || 0) + 1;
      }
    }
    // Service names (from PagerDuty / incidents)
    if (meta?.service) {
      topicCounts[meta.service] = (topicCounts[meta.service] || 0) + 1;
    }
    // Slack channel activity (UC6: which channels are most active)
    if (meta?.channel) {
      channelActivity[meta.channel] = (channelActivity[meta.channel] || 0) + 1;
    }
  }

  // 5. Domain-aware engineering health (not raw sentiment — signal_value semantics differ by type)
  let healthSummary: any = null;
  if (includeSentiment && engSignals.length > 0) {
    // Categorize signals into outcome types for meaningful health assessment
    const successTypes = ['ci_passed', 'test_passed', 'deploy_success', 'pr_merged', 'incident_resolved'];
    const failureTypes = ['ci_failed', 'test_failed', 'deploy_failure', 'incident_triggered'];

    let successCount = 0;
    let failureCount = 0;
    for (const s of engSignals) {
      if (successTypes.includes(s.signal_type)) successCount++;
      if (failureTypes.includes(s.signal_type)) failureCount++;
    }

    const totalOutcomes = successCount + failureCount;
    const successRate = totalOutcomes > 0 ? successCount / totalOutcomes : 0;
    const ciFailRate = ((signalCounts['ci_failed'] || 0) + (signalCounts['test_failed'] || 0)) /
      Math.max(1, (signalCounts['ci_passed'] || 0) + (signalCounts['ci_failed'] || 0) + (signalCounts['test_failed'] || 0) + (signalCounts['test_passed'] || 0));

    healthSummary = {
      success_rate: parseFloat((successRate * 100).toFixed(1)),
      success_count: successCount,
      failure_count: failureCount,
      ci_failure_rate: parseFloat((ciFailRate * 100).toFixed(1)),
      health_label: successRate >= 0.8 ? 'healthy' : successRate >= 0.6 ? 'needs_attention' : 'critical',
      incident_load: signalCounts['incident_triggered'] || 0,
      deploy_frequency: (signalCounts['deploy_success'] || 0) + (signalCounts['deploy_failure'] || 0),
    };
  }

  // Sort topics and channels by count
  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  const activeChannels = Object.entries(channelActivity)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([channel, messageCount]) => ({ channel, messageCount }));

  return {
    period_days: days,
    total_signals: engSignals.length,
    total_communication_signals: (commSignals || []).length,
    signal_breakdown: signalCounts,
    active_contributors: [...contributors].slice(0, 20),
    contributor_count: contributors.size,
    top_topics: topTopics,
    active_channels: activeChannels,
    engineering_health: healthSummary,
    highlights: {
      deploys: (signalCounts['deploy_success'] || 0) + (signalCounts['deploy_failure'] || 0),
      incidents: signalCounts['incident_triggered'] || 0,
      prs_merged: signalCounts['pr_merged'] || 0,
      ci_failures: signalCounts['ci_failed'] || 0,
      tests_passed: signalCounts['test_passed'] || 0,
      slack_messages: (commSignals || []).length,
    },
    message: `Engineering activity over last ${days} days: ${engSignals.length} eng signals + ${(commSignals || []).length} comm signals, ${contributors.size} active contributors, ${topTopics.length > 0 ? `top focus areas: ${topTopics.slice(0, 3).map(t => t.topic).join(', ')}` : 'no dominant topics detected'}${activeChannels.length > 0 ? `, active channels: ${activeChannels.slice(0, 3).map(c => c.channel).join(', ')}` : ''}`
  };
}

/**
 * UC2: Search past CI/CD failures for similar patterns.
 * Powers: "Why are tests failing in CI?" → find similar past failures + fixes
 */
async function searchCIFailures(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const query = input.query;
  const daysLookback = parseInt(input.days_lookback || '30', 10);
  const cutoffDate = new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000).toISOString();

  const failureTypes = ['ci_failed', 'test_failed', 'deploy_failure'];
  const providerFilter = input.provider;

  // 1. Get recent CI failures
  const { data: failures } = await supabase
    .from('cross_domain_signals')
    .select('signal_type, signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .in('signal_type', failureTypes)
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false })
    .limit(100);

  // 2. Filter by provider if specified
  let results = failures || [];
  if (providerFilter) {
    results = results.filter((f: any) =>
      (f.metadata as any)?.provider === providerFilter
    );
  }

  // 3. Match against query — search metadata, failure_details.errorMessage, stackTrace, failedTests
  const queryTerms = query.toLowerCase().split(/\s+/);
  const scored = results.map((f: any) => {
    const meta = f.metadata || {};
    const metaStr = JSON.stringify(meta).toLowerCase();
    let score = 0;

    // Standard metadata keyword match
    for (const term of queryTerms) {
      if (metaStr.includes(term)) score += 1;
    }

    // Deep match on failure_details fields (UC2: error messages, stack traces, test names)
    const fd = meta.failure_details;
    if (fd) {
      const errorMsg = (fd.errorMessage || '').toLowerCase();
      const stackTrace = (fd.stackTrace || '').toLowerCase();
      const failedTests = (fd.failedTests || []).join(' ').toLowerCase();
      const assertionErrors = (fd.assertionErrors || []).join(' ').toLowerCase();
      const failedStep = (fd.failedStep || '').toLowerCase();

      for (const term of queryTerms) {
        if (errorMsg.includes(term)) score += 3;       // Error messages are highest signal
        if (failedTests.includes(term)) score += 2.5;  // Failed test names very relevant
        if (assertionErrors.includes(term)) score += 2; // Assertion details highly relevant
        if (stackTrace.includes(term)) score += 1.5;   // Stack traces useful but verbose
        if (failedStep.includes(term)) score += 1;     // Build step name
      }
    }

    return { ...f, relevance: score };
  });

  const matched = scored
    .filter((s: any) => s.relevance > 0)
    .sort((a: any, b: any) => b.relevance - a.relevance);

  // 4. Find PRs that resolved similar failures (PRs merged after failures)
  const resolvingPRs: any[] = [];
  if (matched.length > 0) {
    const oldestFailure = matched[matched.length - 1].created_at;
    const { data: prs } = await supabase
      .from('cross_domain_signals')
      .select('signal_type, signal_value, metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('source_domain', 'engineering')
      .eq('signal_type', 'pr_merged')
      .gte('created_at', oldestFailure)
      .order('created_at', { ascending: true })
      .limit(50);

    // Find PRs that touch similar areas as the failures
    for (const pr of (prs || [])) {
      const prMeta = JSON.stringify(pr.metadata || '').toLowerCase();
      if (queryTerms.some((term: string) => prMeta.includes(term))) {
        resolvingPRs.push(pr);
      }
    }
  }

  // 5. Look for causal chains involving CI failures
  const { data: chains } = await supabase
    .from('causal_chains')
    .select('source_domain, target_domain, natural_language, confidence, lag_days')
    .eq('organization_id', organizationId)
    .eq('validated', true)
    .or('source_domain.eq.engineering,target_domain.eq.engineering')
    .order('confidence', { ascending: false })
    .limit(5);

  return {
    query,
    matching_failures: matched.slice(0, 10).map((f: any) => {
      const fd = (f.metadata as any)?.failure_details;
      return {
        type: f.signal_type,
        date: f.created_at,
        pipeline: (f.metadata as any)?.pipeline || (f.metadata as any)?.workflow,
        branch: (f.metadata as any)?.git_ref || (f.metadata as any)?.branch,
        error_message: fd?.errorMessage || null,
        failed_tests: fd?.failedTests || null,
        failed_step: fd?.failedStep || (f.metadata as any)?.step_that_failed || null,
        provider: (f.metadata as any)?.provider,
        relevance: f.relevance,
        metadata: f.metadata,
      };
    }),
    total_failures_in_period: results.length,
    total_matching: matched.length,
    potential_fixes: resolvingPRs.slice(0, 5).map((pr: any) => ({
      type: pr.signal_type,
      date: pr.created_at,
      metadata: pr.metadata
    })),
    causal_chains: (chains || []).map((c: any) => ({
      explanation: c.natural_language,
      confidence: c.confidence,
      lag_days: c.lag_days
    })),
    message: matched.length > 0
      ? `Found ${matched.length} similar failure(s) in the last ${daysLookback} days.${resolvingPRs.length > 0 ? ` ${resolvingPRs.length} PR(s) may have fixed similar issues.` : ''}${(chains || []).length > 0 ? ` ${(chains || []).length} causal chain(s) detected.` : ''}`
      : `No matching failures found for "${query}" in the last ${daysLookback} days. Total CI failures in period: ${results.length}.`
  };
}

/**
 * UC6: Collaboration network — cross-team visibility, bridge contributors.
 * Powers: "Who works with the frontend team?", "Show me collaboration patterns"
 */
async function getCollaborationNetwork(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const contributor = input.contributor;
  const team = input.team;
  const days = parseInt(input.days || '30', 10);
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Get collaboration edges from cross_domain_signals (persisted by collaboration graph)
  const { data: collabEdges } = await supabase
    .from('cross_domain_signals')
    .select('signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'collaboration_edge')
    .eq('entity_type', 'collaboration')
    .gte('created_at', cutoffDate)
    .order('signal_value', { ascending: false })
    .limit(200);

  let edges = (collabEdges || []).map((e: any) => ({
    contributor_a: e.metadata?.contributor_a,
    contributor_b: e.metadata?.contributor_b,
    interaction_type: e.metadata?.interaction_type,
    weight: e.signal_value,
    count: e.metadata?.count || 1,
    team_a: e.metadata?.team_a,
    team_b: e.metadata?.team_b,
    contexts: e.metadata?.contexts || [],
    last_interaction_at: e.metadata?.last_interaction_at,
  }));

  // 2. Dynamically build collaboration from recent engineering signals if no persisted edges
  if (edges.length === 0) {
    const { data: engSignals } = await supabase
      .from('cross_domain_signals')
      .select('signal_type, signal_metadata, created_at')
      .eq('organization_id', organizationId)
      .like('source_domain', 'engineering%')
      .in('signal_type', ['pr_merged', 'prs_merged', 'pr_review_submitted', 'pr_reviewed', 'pr_opened'])
      .gte('created_at', cutoffDate)
      .limit(200);

    // Derive collaboration from PR signals (author ↔ reviewer)
    const dynamicEdges = new Map<string, any>();
    for (const s of (engSignals || [])) {
      const meta = (s as any).signal_metadata || {};
      const author = meta.author;
      const reviewer = meta.reviewer;
      if (author && reviewer && author !== reviewer) {
        const [a, b] = author < reviewer ? [author, reviewer] : [reviewer, author];
        const key = `${a}::${b}`;
        const existing = dynamicEdges.get(key);
        if (existing) {
          existing.count++;
        } else {
          dynamicEdges.set(key, {
            contributor_a: a,
            contributor_b: b,
            interaction_type: 'code_review',
            weight: 0.5,
            count: 1,
            team_a: null,
            team_b: null,
            contexts: [],
            last_interaction_at: s.created_at,
          });
        }
      }
    }
    edges = Array.from(dynamicEdges.values());
  }

  // 3. Filter by contributor or team
  if (contributor) {
    edges = edges.filter((e: any) =>
      e.contributor_a === contributor || e.contributor_b === contributor
    );
  }
  if (team) {
    edges = edges.filter((e: any) =>
      e.team_a === team || e.team_b === team
    );
  }

  // 4. Compute network stats
  const contributors = new Set<string>();
  const teams = new Set<string>();
  let crossTeam = 0;
  for (const e of edges) {
    if (e.contributor_a) contributors.add(e.contributor_a);
    if (e.contributor_b) contributors.add(e.contributor_b);
    if (e.team_a) teams.add(e.team_a);
    if (e.team_b) teams.add(e.team_b);
    if (e.team_a && e.team_b && e.team_a !== e.team_b) crossTeam++;
  }

  // 5. Find bridge contributors
  const bridgeMap = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!e.team_a || !e.team_b || e.team_a === e.team_b) continue;
    for (const c of [e.contributor_a, e.contributor_b]) {
      if (!c) continue;
      if (!bridgeMap.has(c)) bridgeMap.set(c, new Set());
      if (e.team_a) bridgeMap.get(c)!.add(e.team_a);
      if (e.team_b) bridgeMap.get(c)!.add(e.team_b);
    }
  }
  const bridges = Array.from(bridgeMap.entries())
    .filter(([, t]) => t.size >= 2)
    .map(([c, t]) => ({ contributor: c, teams: Array.from(t), teamCount: t.size }))
    .sort((a, b) => b.teamCount - a.teamCount)
    .slice(0, 5);

  // 6. Team pair summary
  const teamPairs = new Map<string, { count: number; interactions: number }>();
  for (const e of edges) {
    if (!e.team_a || !e.team_b) continue;
    const [tA, tB] = e.team_a < e.team_b ? [e.team_a, e.team_b] : [e.team_b, e.team_a];
    const key = `${tA} ↔ ${tB}`;
    const existing = teamPairs.get(key);
    if (existing) {
      existing.count++;
      existing.interactions += e.count;
    } else {
      teamPairs.set(key, { count: 1, interactions: e.count });
    }
  }
  const teamSummary = Array.from(teamPairs.entries())
    .map(([pair, data]) => ({ teams: pair, unique_pairs: data.count, total_interactions: data.interactions }))
    .sort((a, b) => b.total_interactions - a.total_interactions);

  return {
    edges: edges.slice(0, 50).map((e: any) => ({
      contributor_a: e.contributor_a,
      contributor_b: e.contributor_b,
      type: e.interaction_type,
      weight: e.weight,
      count: e.count,
      team_a: e.team_a,
      team_b: e.team_b,
    })),
    network_stats: {
      total_edges: edges.length,
      unique_contributors: contributors.size,
      unique_teams: teams.size,
      cross_team_edges: crossTeam,
    },
    bridge_contributors: bridges,
    team_collaboration: teamSummary,
    message: edges.length > 0
      ? `Collaboration network: ${edges.length} edges, ${contributors.size} contributors, ${teams.size} teams.${crossTeam > 0 ? ` ${crossTeam} cross-team interactions found.` : ''}${bridges.length > 0 ? ` Bridge connectors: ${bridges.map(b => b.contributor).join(', ')}` : ''}`
      : 'No collaboration data found for this period. Collaboration is tracked from PR reviews, Slack threads, and incident responses.',
  };
}

/**
 * UC4: Ingest an Architectural Decision Record into brain memory.
 * Powers: "Why did we choose PostgreSQL?", "What's our authentication strategy?"
 * ADRs are the HIGHEST VALUE knowledge for onboarding and future decision-making.
 */
async function ingestADR(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  input: Record<string, any>
) {
  const title = input.title;
  const content = input.content;
  const status = input.status || 'accepted';
  const tags = input.tags ? input.tags.split(',').map((t: string) => t.trim()) : [];
  const author = input.author;
  const date = input.date || new Date().toISOString();

  // 1. Extract topics from ADR content for searchability
  const words = content.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'that', 'this', 'these', 'those', 'and', 'but', 'or', 'not', 'no', 'we', 'our', 'it', 'its', 'they', 'their']);
  const wordCounts = new Map<string, number>();
  for (const w of words) {
    const clean = w.replace(/[^a-z0-9-_]/g, '');
    if (clean.length >= 3 && !stopWords.has(clean)) {
      wordCounts.set(clean, (wordCounts.get(clean) || 0) + 1);
    }
  }
  const extractedTopics = Array.from(wordCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([w]) => w);

  // 2. Store in ai_memory (long-term brain memory, searchable)
  const memoryId = `adr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const { error: memError } = await supabase
    .from('ai_memory')
    .upsert({
      id: memoryId,
      organization_id: organizationId,
      memory_type: 'adr',
      title,
      content: content.substring(0, 10000), // Cap at 10K chars
      metadata: {
        status,
        tags,
        author,
        decision_date: date,
        extracted_topics: extractedTopics,
        source: 'manual_ingestion',
      },
      confidence: status === 'accepted' ? 0.95 : status === 'proposed' ? 0.6 : 0.3,
      severity: 'info',
    });

  if (memError) throw memError;

  // 3. Also store as entity_embedding for code search discoverability
  const { error: embedError } = await supabase
    .from('entity_embeddings')
    .upsert({
      organization_id: organizationId,
      entity_type: 'adr',
      entity_id: memoryId,
      content: `${title}\n\n${content.substring(0, 5000)}`,
      metadata: {
        title,
        status,
        tags,
        author,
        decision_date: date,
        topics: extractedTopics,
      },
      importance_score: status === 'accepted' ? 0.9 : 0.5,
    }, {
      onConflict: 'organization_id,entity_type,entity_id',
    });

  if (embedError) throw embedError;

  // 4. Emit a signal so causal discovery knows about ADR ingestion
  await supabase
    .from('cross_domain_signals')
    .insert({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'adr_ingested',
      signal_value: 1,
      entity_type: 'adr',
      entity_id: memoryId,
      metadata: {
        title,
        status,
        tags,
        author,
        topics: extractedTopics,
      },
    });

  // 5. If author is provided, record expertise
  if (author) {
    for (const topic of extractedTopics.slice(0, 5)) {
      await supabase
        .from('contributor_expertise')
        .upsert({
          organization_id: organizationId,
          contributor_id: author,
          contributor_name: author,
          topic,
          evidence_type: 'documentation',
          strength: 0.15,
          evidence_count: 1,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,contributor_id,topic,evidence_type',
        });
    }
  }

  return {
    success: true,
    adr_id: memoryId,
    title,
    status,
    extracted_topics: extractedTopics,
    tags,
    message: `Indexed ADR "${title}" (${status}). Extracted ${extractedTopics.length} topics: ${extractedTopics.slice(0, 5).join(', ')}. This ADR is now searchable via search_code_context and will enhance onboarding queries.${author ? ` ${author} credited with documentation expertise.` : ''}`,
  };
}
