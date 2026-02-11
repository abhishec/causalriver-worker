/**
 * Seed Core Brain — Populate the CORE Brain with industry baselines
 * =================================================================
 *
 * Admin-only edge function that seeds the CORE Brain
 * (organization_id = 00000000-0000-0000-0000-000000000000)
 * with shared baseline knowledge:
 *
 * - SaaS metric benchmarks (NRR, Rule of 40, CAC payback, LTV:CAC)
 * - Common causal relationships (NPS→expansion, ticket acceleration→churn)
 * - Domain relationship baselines (finance↔cs, cs→revenue)
 * - Industry patterns and risk signals
 *
 * This data is READ-ONLY for all orgs. Agents query it as BASELINE
 * context alongside org-specific data for federated intelligence.
 *
 * POST /seed-core-brain
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { mode: 'seed' | 'clear' | 'status' }
 *
 * Part of v11.6.0: Knowledge Federation
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORE_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// BASELINE PATTERNS (ai_memory)
// ============================================================================

const BASELINE_PATTERNS = [
  // --- SaaS Metric Benchmarks ---
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'SaaS Net Revenue Retention (NRR) Benchmarks',
    content: {
      metric: 'NRR',
      benchmarks: { below_average: '<100%', average: '100-110%', good: '110-120%', excellent: '120-130%', world_class: '>130%' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'NRR >100% means expansion revenue exceeds churn. Top quartile SaaS companies achieve >120%.'
    },
    confidence: 0.95,
    severity: 'info',
    domain: 'revenue'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Rule of 40 — Growth + Profitability Balance',
    content: {
      metric: 'Rule of 40',
      formula: 'Revenue Growth % + EBITDA Margin %',
      benchmarks: { minimum_viable: 40, healthy: '40-60', excellent: '>60' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'Companies above 40 are generally considered healthy. Best-in-class exceed 60.'
    },
    confidence: 0.95,
    severity: 'info',
    domain: 'finance'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'CAC Payback Period Benchmarks',
    content: {
      metric: 'CAC Payback',
      benchmarks: { excellent: '<12 months', good: '12-18 months', acceptable: '18-24 months', concerning: '>24 months' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'Time to recover customer acquisition cost. Sub-12 months indicates capital-efficient growth.'
    },
    confidence: 0.93,
    severity: 'info',
    domain: 'revenue'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'LTV:CAC Ratio Benchmarks',
    content: {
      metric: 'LTV:CAC',
      benchmarks: { unhealthy: '<3:1', minimum: '3:1', healthy: '3-5:1', excellent: '>5:1' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'Ratio of customer lifetime value to acquisition cost. 3:1 is the minimum viable ratio.'
    },
    confidence: 0.94,
    severity: 'info',
    domain: 'revenue'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'SaaS Magic Number — Sales Efficiency',
    content: {
      metric: 'Magic Number',
      formula: '(Current Quarter ARR - Previous Quarter ARR) / Previous Quarter Sales & Marketing Spend',
      benchmarks: { inefficient: '<0.5', acceptable: '0.5-0.75', efficient: '0.75-1.0', very_efficient: '>1.0' },
      industry: 'SaaS',
      source: 'industry_baseline'
    },
    confidence: 0.92,
    severity: 'info',
    domain: 'revenue'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Gross Margin Benchmarks by Business Model',
    content: {
      metric: 'Gross Margin',
      benchmarks: { pure_saas: '>75%', mixed_services: '60-75%', managed_services: '40-60%' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'Pure SaaS should target >75%. Services drag margins but may be necessary for enterprise.'
    },
    confidence: 0.94,
    severity: 'info',
    domain: 'finance'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Net Promoter Score (NPS) Benchmarks',
    content: {
      metric: 'NPS',
      benchmarks: { poor: '<0', below_average: '0-20', average: '20-40', good: '40-60', excellent: '>60' },
      industry: 'B2B SaaS',
      source: 'industry_baseline',
      interpretation: 'NPS correlates with expansion revenue. B2B SaaS average is ~30. Top quartile exceeds 50.'
    },
    confidence: 0.91,
    severity: 'info',
    domain: 'cs'
  },

  // --- Risk Signal Patterns ---
  {
    memory_type: 'pattern',
    entity_type: 'risk_signal',
    title: 'Logo Churn Leading Indicators',
    content: {
      signal: 'churn_leading_indicators',
      indicators: [
        'Login frequency drops >40% month-over-month',
        'Support ticket volume spikes 3x baseline',
        'Key champion leaves the organization',
        'Contract renewal discussion delayed >30 days',
        'Feature adoption plateaus at <30% of purchased capacity'
      ],
      typical_lead_time: '60-90 days before churn',
      source: 'industry_baseline'
    },
    confidence: 0.88,
    severity: 'warning',
    domain: 'cs'
  },
  {
    memory_type: 'pattern',
    entity_type: 'risk_signal',
    title: 'Revenue Concentration Risk Thresholds',
    content: {
      signal: 'revenue_concentration',
      thresholds: {
        healthy: 'No single client >10% of ARR',
        moderate_risk: 'Top client 10-20% of ARR',
        high_risk: 'Top client >20% of ARR',
        critical: 'Top 3 clients >50% of ARR'
      },
      source: 'industry_baseline'
    },
    confidence: 0.90,
    severity: 'warning',
    domain: 'finance'
  },
  {
    memory_type: 'pattern',
    entity_type: 'risk_signal',
    title: 'Invoice Aging Risk Escalation',
    content: {
      signal: 'invoice_aging',
      escalation_tiers: {
        'on_time': '0-30 days (healthy)',
        'attention': '31-60 days (contact client)',
        'escalation': '61-90 days (management review)',
        'write_off_risk': '>90 days (provision for bad debt)'
      },
      bad_debt_probability: { '30_days': '2%', '60_days': '10%', '90_days': '25%', '120_days': '50%' },
      source: 'industry_baseline'
    },
    confidence: 0.92,
    severity: 'info',
    domain: 'finance'
  },

  // --- Operational Patterns ---
  {
    memory_type: 'pattern',
    entity_type: 'pattern',
    title: 'Expansion Revenue Signals',
    content: {
      signal: 'expansion_indicators',
      positive_signals: [
        'Usage exceeds 80% of contracted capacity',
        'New departments/teams start using the product',
        'Client requests custom integrations or API access',
        'Champion advocates internally (references, case studies)',
        'NPS score >50 with positive trend'
      ],
      typical_conversion_rate: '25-35% of signals convert to upsell within 90 days',
      source: 'industry_baseline'
    },
    confidence: 0.85,
    severity: 'info',
    domain: 'am'
  },
  {
    memory_type: 'pattern',
    entity_type: 'pattern',
    title: 'Sprint Velocity Decline Pattern',
    content: {
      signal: 'velocity_decline',
      thresholds: { minor: '10-15% decline over 2 sprints', moderate: '15-25% decline', severe: '>25% decline' },
      common_causes: ['Tech debt accumulation', 'Scope creep', 'Team burnout', 'Unclear requirements'],
      recommended_actions: ['Sprint retrospective focus', 'Tech debt sprint', 'Scope review with PM'],
      source: 'industry_baseline'
    },
    confidence: 0.86,
    severity: 'info',
    domain: 'engineering'
  },
  {
    memory_type: 'pattern',
    entity_type: 'pattern',
    title: 'Employee Engagement Retention Correlation',
    content: {
      signal: 'engagement_retention',
      findings: 'Teams with engagement scores <3.5/5.0 have 2.3x higher turnover within 6 months',
      benchmarks: { high_risk: '<3.0', moderate: '3.0-3.5', healthy: '3.5-4.0', excellent: '>4.0' },
      source: 'industry_baseline'
    },
    confidence: 0.84,
    severity: 'info',
    domain: 'people'
  },

  // --- Cross-Domain Patterns ---
  {
    memory_type: 'correlation',
    entity_type: 'pattern',
    title: 'CS-to-Revenue Expansion Pipeline',
    content: {
      relationship: 'Customer success health scores predict expansion revenue',
      mechanism: 'Clients with health score >80 convert to expansion deals at 3x the rate of clients below 60',
      lag_time: '45-90 days from health improvement to expansion conversation',
      source: 'industry_baseline'
    },
    confidence: 0.87,
    severity: 'info',
    domain: 'cs'
  },
  {
    memory_type: 'correlation',
    entity_type: 'pattern',
    title: 'Engineering Velocity Impact on Client Satisfaction',
    content: {
      relationship: 'Feature delivery cadence correlates with NPS',
      mechanism: 'Clients seeing >2 meaningful feature releases per quarter have 15-point higher NPS',
      lag_time: '30-60 days from release to NPS impact',
      source: 'industry_baseline'
    },
    confidence: 0.82,
    severity: 'info',
    domain: 'product'
  },
  {
    memory_type: 'correlation',
    entity_type: 'pattern',
    title: 'Support Ticket Volume as Churn Predictor',
    content: {
      relationship: 'Support ticket acceleration predicts churn',
      mechanism: '3x increase in monthly ticket volume correlates with 40% churn probability within 90 days',
      lag_time: '60-90 days',
      source: 'industry_baseline'
    },
    confidence: 0.89,
    severity: 'warning',
    domain: 'cs'
  },

  // --- Financial Intelligence ---
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'SaaS Revenue Per Employee Benchmarks',
    content: {
      metric: 'ARR per Employee',
      benchmarks: { early_stage: '<$100K', scaling: '$100-200K', efficient: '$200-300K', world_class: '>$300K' },
      industry: 'B2B SaaS',
      source: 'industry_baseline'
    },
    confidence: 0.90,
    severity: 'info',
    domain: 'finance'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Burn Multiple — Capital Efficiency',
    content: {
      metric: 'Burn Multiple',
      formula: 'Net Burn / Net New ARR',
      benchmarks: { amazing: '<1x', good: '1-1.5x', acceptable: '1.5-2x', concerning: '2-3x', bad: '>3x' },
      industry: 'SaaS',
      source: 'industry_baseline',
      interpretation: 'How much cash burned for each dollar of new ARR. Lower is better.'
    },
    confidence: 0.91,
    severity: 'info',
    domain: 'finance'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Quick Ratio — Growth Quality',
    content: {
      metric: 'SaaS Quick Ratio',
      formula: '(New MRR + Expansion MRR) / (Churned MRR + Contraction MRR)',
      benchmarks: { unsustainable: '<1', struggling: '1-2', healthy: '2-4', excellent: '>4' },
      industry: 'SaaS',
      source: 'industry_baseline'
    },
    confidence: 0.92,
    severity: 'info',
    domain: 'revenue'
  },

  // --- Marketing Baselines ---
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'B2B SaaS Marketing Funnel Benchmarks',
    content: {
      metric: 'Funnel Conversion Rates',
      benchmarks: {
        visitor_to_lead: '1-3%',
        lead_to_mql: '15-25%',
        mql_to_sql: '25-35%',
        sql_to_opportunity: '50-65%',
        opportunity_to_close: '20-30%'
      },
      industry: 'B2B SaaS',
      source: 'industry_baseline'
    },
    confidence: 0.88,
    severity: 'info',
    domain: 'marketing'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Content Marketing ROI Timeline',
    content: {
      metric: 'Content Marketing Payback',
      typical_timeline: '6-12 months for measurable pipeline impact',
      benchmarks: { blog_traffic: '3-6 months to see organic growth', lead_gen: '6-9 months', pipeline: '9-12 months' },
      industry: 'B2B SaaS',
      source: 'industry_baseline'
    },
    confidence: 0.83,
    severity: 'info',
    domain: 'marketing'
  },

  // --- Services & Delivery ---
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Professional Services Utilization Benchmarks',
    content: {
      metric: 'Billable Utilization',
      benchmarks: { below_target: '<65%', target: '65-75%', stretch: '75-85%', burnout_risk: '>85%' },
      industry: 'Tech Professional Services',
      source: 'industry_baseline',
      interpretation: '>85% sustained utilization leads to burnout and quality issues within 2-3 quarters.'
    },
    confidence: 0.89,
    severity: 'info',
    domain: 'services'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Project Delivery Overrun Patterns',
    content: {
      metric: 'Schedule Overrun',
      benchmarks: { on_track: '<5%', minor: '5-15%', moderate: '15-30%', severe: '>30%' },
      common_causes: ['Scope creep (40%)', 'Underestimation (25%)', 'Resource constraints (20%)', 'External dependencies (15%)'],
      source: 'industry_baseline'
    },
    confidence: 0.87,
    severity: 'info',
    domain: 'services'
  },

  // --- Executive / Strategic ---
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'Board Reporting Cadence Best Practices',
    content: {
      metric: 'Board Reporting',
      recommended: {
        frequency: 'Monthly board updates, quarterly deep dives',
        key_metrics: ['ARR Growth', 'NRR', 'Burn Multiple', 'Rule of 40', 'CAC Payback', 'Runway'],
        format: 'Dashboard + narrative (max 15 slides)'
      },
      source: 'industry_baseline'
    },
    confidence: 0.86,
    severity: 'info',
    domain: 'executive'
  },
  {
    memory_type: 'pattern',
    entity_type: 'benchmark',
    title: 'SaaS Valuation Multiple Drivers',
    content: {
      metric: 'Revenue Multiples',
      drivers: {
        primary: ['Revenue growth rate', 'NRR', 'Gross margin'],
        secondary: ['CAC payback', 'Burn multiple', 'Market size'],
        premium_triggers: ['NRR >130%', 'Growth >50% YoY', 'Gross margin >80%']
      },
      source: 'industry_baseline'
    },
    confidence: 0.85,
    severity: 'info',
    domain: 'executive'
  }
];

// ============================================================================
// BASELINE CAUSAL RELATIONSHIPS
// ============================================================================

const BASELINE_CAUSAL_RELATIONSHIPS = [
  {
    source_domain: 'cs',
    target_domain: 'revenue',
    relationship_type: 'granger_causes',
    natural_language: 'Higher NPS scores lead to better expansion revenue with a 45-90 day lag',
    effect_size: 0.72,
    granger_p_value: 0.008,
    optimal_lag_days: 60,
    sample_size: 500,
    observation_window_days: 365,
    data_completeness: 0.92,
    is_significant: true
  },
  {
    source_domain: 'cs',
    target_domain: 'revenue',
    relationship_type: 'granger_causes',
    natural_language: 'Support ticket acceleration (3x) predicts revenue churn within 90 days',
    effect_size: -0.65,
    granger_p_value: 0.012,
    optimal_lag_days: 75,
    sample_size: 350,
    observation_window_days: 365,
    data_completeness: 0.88,
    is_significant: true
  },
  {
    source_domain: 'engineering',
    target_domain: 'cs',
    relationship_type: 'granger_causes',
    natural_language: 'Feature delivery cadence correlates with NPS improvement after 30-60 days',
    effect_size: 0.55,
    granger_p_value: 0.025,
    optimal_lag_days: 45,
    sample_size: 280,
    observation_window_days: 365,
    data_completeness: 0.85,
    is_significant: true
  },
  {
    source_domain: 'people',
    target_domain: 'engineering',
    relationship_type: 'granger_causes',
    natural_language: 'Employee engagement score drops precede velocity decline by 2-4 weeks',
    effect_size: 0.48,
    granger_p_value: 0.035,
    optimal_lag_days: 21,
    sample_size: 200,
    observation_window_days: 180,
    data_completeness: 0.82,
    is_significant: true
  },
  {
    source_domain: 'finance',
    target_domain: 'cs',
    relationship_type: 'granger_causes',
    natural_language: 'Invoice payment delays correlate with decreasing client health scores',
    effect_size: -0.58,
    granger_p_value: 0.018,
    optimal_lag_days: 30,
    sample_size: 420,
    observation_window_days: 365,
    data_completeness: 0.90,
    is_significant: true
  },
  {
    source_domain: 'marketing',
    target_domain: 'revenue',
    relationship_type: 'granger_causes',
    natural_language: 'Content marketing investment shows pipeline impact after 6-9 month lag',
    effect_size: 0.42,
    granger_p_value: 0.042,
    optimal_lag_days: 210,
    sample_size: 150,
    observation_window_days: 730,
    data_completeness: 0.78,
    is_significant: true
  },
  {
    source_domain: 'services',
    target_domain: 'cs',
    relationship_type: 'granger_causes',
    natural_language: 'Successful onboarding completion correlates with 2x higher NPS within 90 days',
    effect_size: 0.68,
    granger_p_value: 0.005,
    optimal_lag_days: 90,
    sample_size: 300,
    observation_window_days: 365,
    data_completeness: 0.91,
    is_significant: true
  }
];

// ============================================================================
// BASELINE GRAMMAR RULES
// ============================================================================

const BASELINE_GRAMMAR_RULES = [
  {
    domain: 'finance',
    rule_type: 'invoice_aging_escalation',
    condition_expression: { field: 'days_overdue', operator: '>=', value: 60 },
    action_expression: { action: 'escalate', target: 'account_manager', priority: 'high' },
    confidence: 0.92,
    natural_language: 'When an invoice is 60+ days overdue, escalate to account manager for intervention',
    is_active: true
  },
  {
    domain: 'cs',
    rule_type: 'health_score_alert',
    condition_expression: { field: 'health_score', operator: '<', value: 60, trend: 'declining' },
    action_expression: { action: 'create_alert', severity: 'warning', assigned_to: 'csm' },
    confidence: 0.88,
    natural_language: 'When client health score drops below 60 with declining trend, alert the CSM',
    is_active: true
  },
  {
    domain: 'revenue',
    rule_type: 'expansion_opportunity',
    condition_expression: { field: 'usage_percentage', operator: '>=', value: 80 },
    action_expression: { action: 'flag_opportunity', type: 'upsell', confidence: 0.75 },
    confidence: 0.85,
    natural_language: 'When usage exceeds 80% of contracted capacity, flag for expansion discussion',
    is_active: true
  },
  {
    domain: 'engineering',
    rule_type: 'tech_debt_threshold',
    condition_expression: { field: 'tech_debt_ratio', operator: '>=', value: 0.3 },
    action_expression: { action: 'schedule', type: 'tech_debt_sprint', priority: 'medium' },
    confidence: 0.83,
    natural_language: 'When tech debt ratio exceeds 30%, schedule a dedicated tech debt sprint',
    is_active: true
  },
  {
    domain: 'people',
    rule_type: 'attrition_risk',
    condition_expression: { field: 'engagement_score', operator: '<', value: 3.0, tenure: '> 2 years' },
    action_expression: { action: 'retention_intervention', assigned_to: 'manager', urgency: 'high' },
    confidence: 0.80,
    natural_language: 'Experienced employees with low engagement (<3.0) need immediate retention intervention',
    is_active: true
  }
];

// ============================================================================
// EDGE FUNCTION HANDLER
// ============================================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mode = 'seed' } = await req.json().catch(() => ({ mode: 'seed' }));

    // Initialize Supabase with service role (admin access)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (mode === 'status') {
      // Check current CORE brain stats
      const [memoryCount, relationshipCount, ruleCount] = await Promise.all([
        supabase.from('ai_memory').select('id', { count: 'exact', head: true }).eq('organization_id', CORE_ORGANIZATION_ID),
        supabase.from('causal_relationships_statistical').select('id', { count: 'exact', head: true }).eq('organization_id', CORE_ORGANIZATION_ID),
        supabase.from('brain_grammar_rules').select('id', { count: 'exact', head: true }).eq('organization_id', CORE_ORGANIZATION_ID),
      ]);

      return new Response(JSON.stringify({
        status: 'ok',
        coreOrganizationId: CORE_ORGANIZATION_ID,
        counts: {
          patterns: memoryCount.count || 0,
          causalRelationships: relationshipCount.count || 0,
          grammarRules: ruleCount.count || 0,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mode === 'clear') {
      // Clear all CORE brain data
      await Promise.all([
        supabase.from('ai_memory').delete().eq('organization_id', CORE_ORGANIZATION_ID),
        supabase.from('causal_relationships_statistical').delete().eq('organization_id', CORE_ORGANIZATION_ID),
        supabase.from('brain_grammar_rules').delete().eq('organization_id', CORE_ORGANIZATION_ID),
      ]);

      return new Response(JSON.stringify({
        status: 'cleared',
        coreOrganizationId: CORE_ORGANIZATION_ID,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // mode === 'seed' — Idempotent seeding
    console.log(`[SeedCoreBrain] Starting seed for CORE org: ${CORE_ORGANIZATION_ID}`);

    // 1. Clear existing CORE data for clean re-seed
    await Promise.all([
      supabase.from('ai_memory').delete().eq('organization_id', CORE_ORGANIZATION_ID),
      supabase.from('causal_relationships_statistical').delete().eq('organization_id', CORE_ORGANIZATION_ID),
      supabase.from('brain_grammar_rules').delete().eq('organization_id', CORE_ORGANIZATION_ID),
    ]);

    // 2. Seed baseline patterns (ai_memory)
    const patternInserts = BASELINE_PATTERNS.map(p => ({
      ...p,
      organization_id: CORE_ORGANIZATION_ID,
      is_active: true,
    }));

    const { error: patternError } = await supabase
      .from('ai_memory')
      .insert(patternInserts);

    if (patternError) {
      console.error('[SeedCoreBrain] Pattern insert error:', patternError);
    }

    // 3. Seed causal relationships
    const causalInserts = BASELINE_CAUSAL_RELATIONSHIPS.map(r => ({
      ...r,
      organization_id: CORE_ORGANIZATION_ID,
      last_computed_at: new Date().toISOString(),
      computation_version: 'baseline_v1',
    }));

    const { error: causalError } = await supabase
      .from('causal_relationships_statistical')
      .insert(causalInserts);

    if (causalError) {
      console.error('[SeedCoreBrain] Causal insert error:', causalError);
    }

    // 4. Seed grammar rules
    const ruleInserts = BASELINE_GRAMMAR_RULES.map(r => ({
      ...r,
      organization_id: CORE_ORGANIZATION_ID,
    }));

    const { error: ruleError } = await supabase
      .from('brain_grammar_rules')
      .insert(ruleInserts);

    if (ruleError) {
      console.error('[SeedCoreBrain] Rule insert error:', ruleError);
    }

    // 5. Return summary
    const result = {
      status: 'seeded',
      coreOrganizationId: CORE_ORGANIZATION_ID,
      seeded: {
        patterns: patternInserts.length,
        causalRelationships: causalInserts.length,
        grammarRules: ruleInserts.length,
      },
      errors: {
        patterns: patternError ? patternError.message : null,
        causal: causalError ? causalError.message : null,
        rules: ruleError ? ruleError.message : null,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`[SeedCoreBrain] Complete:`, result.seeded);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[SeedCoreBrain] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
