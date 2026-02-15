/**
 * User Context Resolver V1 — Per-User Role, Persona & Data Access
 * =================================================================
 *
 * Brain Analog: Social Cognition Network (Theory of Mind)
 *   — models the user's perspective, adapts responses to their role
 *
 * Resolves:
 *   1. User identity → org membership, role, admin status
 *   2. Role → persona (CEO gets strategy, engineer gets code)
 *   3. Persona → data access permissions
 *   4. Data access → domain filter (strip unauthorized data from results)
 *
 * This is the missing piece that makes NexusBrain truly multi-tenant
 * and role-aware. Without it, every user sees the same data regardless
 * of their role or permissions.
 *
 * Design: Stateless resolver. Takes user info + org context → returns
 *         full user context for downstream use by Brain Commander.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/** User's role within an organization */
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

/** Persona determines the brain's communication style and focus */
export interface UserPersona {
  /** Display name for the persona */
  name: string;
  /** Description of how the brain should behave */
  description: string;
  /** Which domains this persona cares about most */
  primaryDomains: string[];
  /** Communication style: executive (concise), analyst (detailed), builder (actionable) */
  communicationStyle: 'executive' | 'analyst' | 'builder' | 'conversational';
  /** Default depth of analysis: shallow (metrics), moderate (trends), deep (causal) */
  analysisDepth: 'shallow' | 'moderate' | 'deep';
}

/** Data access permissions per domain */
export interface DataAccessPermissions {
  /** Domains this user can view data for */
  allowedDomains: string[];
  /** Whether this user can see financial data */
  canViewFinancials: boolean;
  /** Whether this user can see people/HR data */
  canViewPeopleData: boolean;
  /** Whether this user can execute actions (Slack alerts, tasks, etc.) */
  canExecuteActions: boolean;
  /** Whether this user can view cross-org data (platform admin) */
  canViewCrossOrg: boolean;
  /** Maximum data lookback period in days (90, 365, unlimited) */
  maxLookbackDays: number;
}

/** Full resolved user context */
export interface UserContext {
  /** User's Supabase auth ID */
  userId: string;
  /** Current organization ID */
  organizationId: string;
  /** User's role in the org */
  role: OrgRole;
  /** Whether this user is a platform admin */
  isPlatformAdmin: boolean;
  /** Resolved persona for this user */
  persona: UserPersona;
  /** Data access permissions */
  permissions: DataAccessPermissions;
  /** Resolution timestamp */
  resolvedAt: Date;
}

// ============================================================================
// ROLE → PERSONA MAPPING
// ============================================================================

/** Default personas by role. Can be overridden per-org via org_settings. */
const DEFAULT_PERSONAS: Record<OrgRole, UserPersona> = {
  owner: {
    name: 'Strategic Advisor',
    description: 'You are advising the company leadership. Focus on strategic implications, cross-domain cascades, and actionable recommendations. Be concise but thorough. Always surface risks and opportunities.',
    primaryDomains: ['strategy', 'finance', 'growth', 'revenue'],
    communicationStyle: 'executive',
    analysisDepth: 'deep',
  },
  admin: {
    name: 'Operations Intelligence',
    description: 'You are supporting operational leadership. Focus on metrics, trends, and operational efficiency. Surface anomalies and suggest process improvements. Include data-backed recommendations.',
    primaryDomains: ['finance', 'cs', 'marketing', 'engineering'],
    communicationStyle: 'analyst',
    analysisDepth: 'deep',
  },
  member: {
    name: 'Team Intelligence',
    description: 'You are helping a team member understand their domain. Focus on their area of responsibility. Provide clear explanations with relevant context. Suggest next steps they can take.',
    primaryDomains: ['engineering', 'product', 'cs'],
    communicationStyle: 'builder',
    analysisDepth: 'moderate',
  },
  viewer: {
    name: 'Insights Reader',
    description: 'You are providing read-only intelligence summaries. Focus on high-level trends and key metrics. Keep explanations accessible and avoid technical jargon.',
    primaryDomains: ['finance', 'strategy'],
    communicationStyle: 'conversational',
    analysisDepth: 'shallow',
  },
};

// ============================================================================
// ROLE → PERMISSIONS MAPPING
// ============================================================================

const DEFAULT_PERMISSIONS: Record<OrgRole, DataAccessPermissions> = {
  owner: {
    allowedDomains: ['finance', 'growth', 'cs', 'marketing', 'product', 'strategy', 'engineering', 'people', 'revenue', 'operations', 'compliance'],
    canViewFinancials: true,
    canViewPeopleData: true,
    canExecuteActions: true,
    canViewCrossOrg: false,
    maxLookbackDays: -1, // unlimited
  },
  admin: {
    allowedDomains: ['finance', 'growth', 'cs', 'marketing', 'product', 'strategy', 'engineering', 'people', 'revenue', 'operations', 'compliance'],
    canViewFinancials: true,
    canViewPeopleData: true,
    canExecuteActions: true,
    canViewCrossOrg: false,
    maxLookbackDays: -1,
  },
  member: {
    allowedDomains: ['cs', 'marketing', 'product', 'engineering', 'operations'],
    canViewFinancials: false,
    canViewPeopleData: false,
    canExecuteActions: false,
    canViewCrossOrg: false,
    maxLookbackDays: 365,
  },
  viewer: {
    allowedDomains: ['product', 'engineering'],
    canViewFinancials: false,
    canViewPeopleData: false,
    canExecuteActions: false,
    canViewCrossOrg: false,
    maxLookbackDays: 90,
  },
};

/** Platform admin override — can see everything everywhere */
const PLATFORM_ADMIN_PERMISSIONS: DataAccessPermissions = {
  allowedDomains: ['finance', 'growth', 'cs', 'marketing', 'product', 'strategy', 'engineering', 'people', 'revenue', 'operations', 'compliance'],
  canViewFinancials: true,
  canViewPeopleData: true,
  canExecuteActions: true,
  canViewCrossOrg: true,
  maxLookbackDays: -1,
};

// ============================================================================
// FACTORY
// ============================================================================

export interface UserContextResolverConfig {
  /** Supabase client for DB lookups */
  supabase: SupabaseClient;
}

/**
 * Create a User Context Resolver.
 *
 * Resolves user identity → role → persona → permissions.
 *
 * @example
 * ```typescript
 * const resolver = createUserContextResolver({ supabase });
 * const ctx = await resolver.resolve(userId, orgId);
 * // → { role: 'owner', persona: { name: 'Strategic Advisor', ... }, permissions: { ... } }
 * ```
 */
export function createUserContextResolver(config: UserContextResolverConfig) {
  const { supabase } = config;

  /**
   * Resolve full user context for a given user + org.
   * Falls back gracefully if DB queries fail.
   */
  async function resolve(userId: string, organizationId: string): Promise<UserContext> {
    // 1. Look up org membership
    let role: OrgRole = 'viewer'; // Safe default
    let isPlatformAdmin = false;

    try {
      const { data: membership } = await supabase
        .from('org_members')
        .select('role, is_platform_admin')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .single();

      if (membership) {
        role = (membership.role as OrgRole) || 'member';
        isPlatformAdmin = membership.is_platform_admin === true;
      } else {
        // Check if platform admin accessing another org
        const { data: adminCheck } = await supabase
          .from('org_members')
          .select('is_platform_admin')
          .eq('user_id', userId)
          .eq('is_platform_admin', true)
          .limit(1)
          .single();

        if (adminCheck) {
          isPlatformAdmin = true;
          role = 'admin'; // Platform admins get admin-level access to any org
        }
      }
    } catch (err) {
      // Non-critical: DB error — fall back to viewer (safest default) — err instanceof Error ? err.message : String(err) logged for debugging
    }

    // 2. Resolve persona (could be overridden per-org in future)
    const persona = resolvePersona(role, isPlatformAdmin);

    // 3. Resolve permissions
    const permissions = resolvePermissions(role, isPlatformAdmin);

    return {
      userId,
      organizationId,
      role,
      isPlatformAdmin,
      persona,
      permissions,
      resolvedAt: new Date(),
    };
  }

  /**
   * Quick resolve without DB lookup — use when you already know the role.
   */
  function resolveFromRole(
    userId: string,
    organizationId: string,
    role: OrgRole,
    isPlatformAdmin: boolean
  ): UserContext {
    return {
      userId,
      organizationId,
      role,
      isPlatformAdmin,
      persona: resolvePersona(role, isPlatformAdmin),
      permissions: resolvePermissions(role, isPlatformAdmin),
      resolvedAt: new Date(),
    };
  }

  /**
   * Filter domains based on user permissions.
   * Returns only the domains the user is allowed to see.
   */
  function filterDomains(domains: string[], permissions: DataAccessPermissions): string[] {
    if (permissions.canViewCrossOrg) return domains; // Platform admin — see everything
    return domains.filter(d => permissions.allowedDomains.includes(d));
  }

  /**
   * Check if a user can access a specific domain's data.
   */
  function canAccessDomain(domain: string, permissions: DataAccessPermissions): boolean {
    if (permissions.canViewCrossOrg) return true;
    return permissions.allowedDomains.includes(domain);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  function resolvePersona(role: OrgRole, isPlatformAdmin: boolean): UserPersona {
    if (isPlatformAdmin) {
      return {
        ...DEFAULT_PERSONAS.owner,
        name: 'Platform Intelligence',
        description: 'You are advising a platform administrator. They can see all organizations and all data. Focus on cross-org patterns, platform health, and strategic guidance. Be thorough and precise.',
      };
    }
    return { ...DEFAULT_PERSONAS[role] };
  }

  function resolvePermissions(role: OrgRole, isPlatformAdmin: boolean): DataAccessPermissions {
    if (isPlatformAdmin) {
      return { ...PLATFORM_ADMIN_PERMISSIONS };
    }
    return { ...DEFAULT_PERMISSIONS[role] };
  }

  // ── Public API ────────────────────────────────────────────────────────

  return {
    resolve,
    resolveFromRole,
    filterDomains,
    canAccessDomain,
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type UserContextResolverInstance = ReturnType<typeof createUserContextResolver>;
