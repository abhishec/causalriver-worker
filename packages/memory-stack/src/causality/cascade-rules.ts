/**
 * Nexus Memory Stack - Cascade Rules Engine
 *
 * L4: Causal Graph Engine
 * Database-driven cascade rule detection and conflict resolution.
 *
 * The Innovation: Replace hardcoded conflict detection with dynamic,
 * AI-discoverable rules that learn from organizational patterns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Relationship types between domains
 */
export type CascadeRelationType = 'blocks' | 'delays' | 'impacts' | 'enables' | 'triggers';

/**
 * Severity levels for cascade effects
 */
export type CascadeSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A cascade rule defines how one domain affects another
 */
export interface CascadeRule {
  id: string;
  rule_key: string;
  source_domain: string;
  source_goal_keywords: string[];
  target_domain: string;
  target_goal_keywords: string[];
  relationship_type: CascadeRelationType;
  severity: CascadeSeverity;
  reason_template: string;
  priority: number;
  is_org_specific: boolean;
}

/**
 * A goal or objective that can be in conflict
 */
export interface GoalForConflict {
  id: string;
  goal_name: string;
  linked_domain: string | null;
  status: string;
  team_name?: string;
  primary_owner_id?: string | null;
  blocked_by_goal_ids?: string[] | null;
}

/**
 * A detected conflict between goals
 */
export interface GoalConflict {
  blocking_goal_id: string;
  blocked_goal_id: string;
  blocking_goal_name: string;
  blocked_goal_name: string;
  reason: string;
  severity: CascadeSeverity;
  rule_key: string;
  relationship_type: CascadeRelationType;
}

/**
 * AI-suggested cascade rule from pattern discovery
 */
export interface SuggestedCascadeRule {
  rule_key: string;
  source_domain: string;
  source_goal_keywords: string[];
  target_domain: string;
  target_goal_keywords: string[];
  relationship_type: CascadeRelationType;
  severity: CascadeSeverity;
  reason_template: string;
  ai_confidence: number;
}

// ============================================================================
// DOMAIN NORMALIZATION
// ============================================================================

/**
 * Domain aliases for normalization
 * Extend this for your organization's domain naming conventions
 */
const DEFAULT_DOMAIN_ALIASES: Record<string, string> = {
  // Customer Success
  cs: 'cs',
  'customer-success': 'cs',
  'customer success': 'cs',
  // Account Management
  am: 'account-management',
  'account management': 'account-management',
  'account-management': 'account-management',
  // People / HR — normalize 'hr' to 'people' (brain module ID)
  hr: 'people',
  'human resources': 'people',
  people: 'people',
  // Revenue / Sales
  sales: 'revenue',
  revenue: 'revenue',
  // Engineering
  eng: 'engineering',
  engineering: 'engineering',
  // Services / Operations
  ops: 'services',
  operations: 'services',
  'professional services': 'services',
  ps: 'services',
  services: 'services',
  // Strategy — maps to executive module
  strategy: 'strategy',
  executive: 'executive',
  // Core domains
  finance: 'finance',
  product: 'product',
  marketing: 'marketing',
};

/**
 * Normalize domain names for comparison
 */
export function normalizeDomain(
  domain: string | null,
  aliases: Record<string, string> = DEFAULT_DOMAIN_ALIASES
): string {
  if (!domain) return 'general';
  const d = domain.toLowerCase().trim();
  return aliases[d] || d;
}

// ============================================================================
// CASCADE RULES ENGINE
// ============================================================================

/**
 * Create a cascade rules engine
 *
 * @example
 * ```typescript
 * const engine = createCascadeRulesEngine({
 *   domainAliases: { 'cs': 'customer-success' },
 * });
 *
 * const rules = await engine.fetchRules(supabase, organizationId);
 * const conflicts = engine.detectConflicts(rules, atRiskGoals, allGoals);
 * ```
 */
export function createCascadeRulesEngine(options: {
  domainAliases?: Record<string, string>;
  orgRulesTable?: string;
  platformRulesTable?: string;
} = {}) {
  const {
    domainAliases = DEFAULT_DOMAIN_ALIASES,
    orgRulesTable = 'org_cascade_rules',
    platformRulesTable = 'platform_cascade_rules',
  } = options;

  const normalize = (domain: string | null) => normalizeDomain(domain, domainAliases);

  /**
   * Check if a goal name matches any keywords
   */
  const goalMatchesKeywords = (goalName: string, keywords: string[]): boolean => {
    const lowerName = goalName.toLowerCase();
    return keywords.some((kw) => lowerName.includes(kw.toLowerCase()));
  };

  return {
    /**
     * Fetch effective cascade rules for an organization
     * First checks org-specific rules, then falls back to platform defaults
     */
    fetchRules: async (
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<CascadeRule[]> => {
      try {
        // Try org-specific rules first
        const { data: orgRules, error: orgError } = await supabase
          .from(orgRulesTable)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('priority', { ascending: true });

        if (!orgError && orgRules && orgRules.length > 0) {
          return orgRules.map((r) => ({
            id: r.id,
            rule_key: r.rule_key,
            source_domain: r.source_domain,
            source_goal_keywords: r.source_goal_keywords || [],
            target_domain: r.target_domain,
            target_goal_keywords: r.target_goal_keywords || [],
            relationship_type: r.relationship_type as CascadeRelationType,
            severity: r.severity as CascadeSeverity,
            reason_template: r.reason_template,
            priority: r.priority || 100,
            is_org_specific: true,
          }));
        }

        // Fall back to platform defaults
        const { data: platformRules, error: platformError } = await supabase
          .from(platformRulesTable)
          .select('*')
          .eq('is_default', true)
          .eq('is_active', true);

        if (platformError) {
          console.error('[cascade-rules] Error fetching platform rules:', platformError);
          return [];
        }

        return (platformRules || []).map((r) => ({
          id: r.id,
          rule_key: r.rule_key,
          source_domain: r.source_domain,
          source_goal_keywords: r.source_goal_keywords || [],
          target_domain: r.target_domain,
          target_goal_keywords: r.target_goal_keywords || [],
          relationship_type: r.relationship_type as CascadeRelationType,
          severity: r.severity as CascadeSeverity,
          reason_template: r.reason_template,
          priority: 100,
          is_org_specific: false,
        }));
      } catch (err) {
        console.error('[cascade-rules] Failed to fetch rules:', err);
        return [];
      }
    },

    /**
     * Detect goal conflicts using cascade rules
     */
    detectConflicts: (
      rules: CascadeRule[],
      atRiskGoals: GoalForConflict[],
      allGoals: GoalForConflict[]
    ): GoalConflict[] => {
      const conflicts: GoalConflict[] = [];
      const seenConflicts = new Set<string>();

      for (const rule of rules) {
        // Find source goals (at-risk goals matching source criteria)
        const sourceGoals = atRiskGoals.filter((g) => {
          const goalDomain = normalize(g.linked_domain);
          const ruleDomain = normalize(rule.source_domain);
          if (goalDomain !== ruleDomain) return false;
          return goalMatchesKeywords(g.goal_name, rule.source_goal_keywords);
        });

        // Find target goals (any goals matching target criteria)
        const targetGoals = allGoals.filter((g) => {
          const goalDomain = normalize(g.linked_domain);
          const ruleDomain = normalize(rule.target_domain);
          if (goalDomain !== ruleDomain) return false;
          return goalMatchesKeywords(g.goal_name, rule.target_goal_keywords);
        });

        // Create conflicts for each source → target pair
        for (const source of sourceGoals) {
          for (const target of targetGoals) {
            // Skip self-references
            if (source.id === target.id) continue;

            // Skip if already tracking
            if (target.blocked_by_goal_ids?.includes(source.id)) continue;

            // Prevent duplicates
            const conflictKey = `${source.id}:${target.id}`;
            if (seenConflicts.has(conflictKey)) continue;
            seenConflicts.add(conflictKey);

            // Generate reason from template
            const reason = rule.reason_template
              .replace('{source}', source.goal_name)
              .replace('{target}', target.goal_name)
              .replace('{source_domain}', rule.source_domain)
              .replace('{target_domain}', rule.target_domain);

            conflicts.push({
              blocking_goal_id: source.id,
              blocked_goal_id: target.id,
              blocking_goal_name: source.goal_name,
              blocked_goal_name: target.goal_name,
              reason,
              severity: rule.severity,
              rule_key: rule.rule_key,
              relationship_type: rule.relationship_type,
            });
          }
        }
      }

      return conflicts;
    },

    /**
     * Record that a cascade rule was triggered (for learning)
     */
    recordTrigger: async (
      supabase: SupabaseClient,
      organizationId: string,
      ruleKey: string,
      blockingGoalId: string,
      blockedGoalId: string
    ): Promise<void> => {
      try {
        await supabase.rpc('record_cascade_rule_trigger', {
          p_organization_id: organizationId,
          p_rule_key: ruleKey,
          p_blocking_goal_id: blockingGoalId,
          p_blocked_goal_id: blockedGoalId,
        });
      } catch (err) {
        console.error('[cascade-rules] Failed to record trigger:', err);
      }
    },

    /**
     * Suggest a new cascade rule from AI discovery
     */
    suggestRule: async (
      supabase: SupabaseClient,
      organizationId: string,
      suggestion: SuggestedCascadeRule
    ): Promise<{ success: boolean; id?: string; error?: string }> => {
      try {
        const { data, error } = await supabase
          .from(orgRulesTable)
          .upsert(
            {
              organization_id: organizationId,
              rule_key: suggestion.rule_key,
              source_domain: suggestion.source_domain,
              source_goal_keywords: suggestion.source_goal_keywords,
              target_domain: suggestion.target_domain,
              target_goal_keywords: suggestion.target_goal_keywords,
              relationship_type: suggestion.relationship_type,
              severity: suggestion.severity,
              reason_template: suggestion.reason_template,
              ai_suggested: true,
              ai_confidence: suggestion.ai_confidence,
              is_active: false, // Requires admin approval
              priority: 200,
            },
            {
              onConflict: 'organization_id,rule_key',
              ignoreDuplicates: false,
            }
          )
          .select('id')
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, id: data?.id };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Common business keywords for pattern matching
 * Extend this for your organization's vocabulary
 */
export const COMMON_BUSINESS_KEYWORDS = [
  // Finance
  'collection', 'receivable', 'dso', 'overdue', 'aging', 'payment', 'invoice', 'billing',
  'cash', 'liquidity', 'recognition', 'revenue',
  // Customer Success
  'health', 'nps', 'satisfaction', 'csat', 'engagement', 'churn', 'retention',
  // People/HR
  'hiring', 'headcount', 'recruit', 'retention', 'staffing', 'capacity', 'bandwidth',
  // Services/Delivery
  'delivery', 'milestone', 'project', 'implementation', 'utilization', 'sow',
  // Product/Engineering
  'release', 'feature', 'roadmap', 'launch', 'deployment', 'bug', 'sprint',
  // Revenue/Sales
  'pipeline', 'forecast', 'arr', 'bookings', 'deals', 'quota', 'commission',
  // Account Management
  'renewal', 'expansion', 'upsell', 'nrr', 'growth', 'adoption',
  // Marketing
  'lead', 'mql', 'campaign', 'demand', 'funnel',
];

/**
 * Extract keywords from text for rule matching
 */
export function extractKeywordsFromText(
  text: string | Record<string, any>,
  customKeywords: string[] = []
): string[] {
  const content = typeof text === 'string' ? text : JSON.stringify(text);
  const lowerContent = content.toLowerCase();

  const allKeywords = [...COMMON_BUSINESS_KEYWORDS, ...customKeywords];
  return allKeywords.filter((kw) => lowerContent.includes(kw.toLowerCase()));
}

// ============================================================================
// EXAMPLE: DEFAULT PLATFORM RULES
// ============================================================================

/**
 * Example platform-default cascade rules
 * These represent common cross-domain dependencies
 */
export const examplePlatformRules: Omit<CascadeRule, 'id'>[] = [
  {
    rule_key: 'finance_blocks_expansion',
    source_domain: 'finance',
    source_goal_keywords: ['collection', 'receivable', 'overdue', 'dso'],
    target_domain: 'account-management',
    target_goal_keywords: ['expansion', 'upsell', 'growth'],
    relationship_type: 'blocks',
    severity: 'high',
    reason_template:
      'Finance issue "{source}" blocks commercial conversations for "{target}" - resolve payment issues first',
    priority: 10,
    is_org_specific: false,
  },
  {
    rule_key: 'services_blocks_billing',
    source_domain: 'services',
    source_goal_keywords: ['delivery', 'milestone', 'implementation'],
    target_domain: 'finance',
    target_goal_keywords: ['billing', 'invoice', 'recognition'],
    relationship_type: 'blocks',
    severity: 'medium',
    reason_template:
      'Delayed "{source}" blocks billing milestone for "{target}" - complete delivery first',
    priority: 20,
    is_org_specific: false,
  },
  {
    rule_key: 'health_impacts_renewal',
    source_domain: 'customer-success',
    source_goal_keywords: ['health', 'nps', 'engagement', 'satisfaction'],
    target_domain: 'account-management',
    target_goal_keywords: ['renewal', 'retention'],
    relationship_type: 'impacts',
    severity: 'high',
    reason_template:
      'Low "{source}" creates risk for "{target}" - prioritize relationship recovery',
    priority: 15,
    is_org_specific: false,
  },
  {
    rule_key: 'capacity_delays_delivery',
    source_domain: 'people',
    source_goal_keywords: ['capacity', 'hiring', 'headcount', 'bandwidth'],
    target_domain: 'services',
    target_goal_keywords: ['delivery', 'implementation', 'project'],
    relationship_type: 'delays',
    severity: 'medium',
    reason_template:
      'Capacity constraint "{source}" may delay "{target}" - adjust timelines or resources',
    priority: 25,
    is_org_specific: false,
  },
];
