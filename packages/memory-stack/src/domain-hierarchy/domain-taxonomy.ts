/**
 * Hierarchical Domain Taxonomy
 * ═══════════════════════════════
 *
 * THE FUNDAMENTAL MISSING PIECE.
 *
 * Problem:
 *   Slack is hardcoded to `communication.slack`. But #engineering-backend is
 *   engineering. #marketing-campaigns is marketing. #support-escalations is
 *   support. The brain CANNOT reason about organizational structure without
 *   understanding that the SAME tool serves DIFFERENT domains.
 *
 * Solution:
 *   4-level hierarchical domain taxonomy:
 *
 *   Organization
 *     └─ Domain (engineering, marketing, support, finance, ...)
 *         └─ Sub-domain (backend, frontend, campaigns, billing, ...)
 *             └─ Channel/Project/Resource (slack:#eng-backend, jira:BACKEND, ...)
 *
 * Auto-Classification:
 *   The brain LEARNS domain assignments. When a Slack channel is created or
 *   a Jira project appears, the system classifies it based on:
 *     1. Name patterns (regex)
 *     2. Content analysis (keywords in messages/issues)
 *     3. Participant analysis (who's in the channel?)
 *     4. Activity correlation (which other resources does it correlate with?)
 *     5. Explicit admin mapping (override)
 *
 * Multi-Domain Assignment:
 *   Resources can belong to MULTIPLE domains with weights.
 *   PagerDuty belongs to engineering (0.7) AND support (0.3).
 *   A Slack channel #incident-response belongs to engineering (0.5),
 *   support (0.3), and executive (0.2).
 *
 * Brain Learning Integration:
 *   The taxonomy is NOT static. The brain evolves it:
 *   - New channels auto-classified based on content patterns
 *   - Domain weights adjusted based on actual usage patterns
 *   - Sub-domains discovered automatically from clustering
 *   - Cross-domain bridges identified (resources spanning domains)
 *
 * @packageDocumentation
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Top-level organizational domain.
 * These are the 10 business functions that any company has.
 */
export type OrganizationalDomain =
  | 'engineering'
  | 'product'
  | 'marketing'
  | 'sales'
  | 'finance'
  | 'support'
  | 'people'        // HR
  | 'operations'
  | 'executive'
  | 'legal'
  | 'custom';       // User-defined domains

/**
 * A sub-domain within an organizational domain.
 * Discovered automatically or defined by admins.
 */
export interface SubDomain {
  id: string;
  name: string;
  parentDomain: OrganizationalDomain;
  description?: string;
  /** How was this sub-domain created? */
  origin: 'system_default' | 'auto_discovered' | 'admin_defined';
  /** Keywords that identify this sub-domain */
  keywords: string[];
  /** When was this sub-domain last active? */
  lastActiveAt?: number;
  createdAt: number;
}

/**
 * A resource (channel, project, repo, etc.) mapped to domains.
 * This is the LEAF node in the hierarchy.
 *
 * Key insight: Resources can belong to MULTIPLE domains with weights.
 */
export interface DomainResource {
  /** Unique ID: `${connector}:${resourceType}:${resourceId}` */
  id: string;
  /** Which connector this belongs to */
  connector: string;
  /** Type of resource (channel, project, repository, board, account, etc.) */
  resourceType: ResourceType;
  /** External ID from the source system */
  externalId: string;
  /** Human-readable name */
  name: string;
  /** Domain assignments with weights (sum = 1.0) */
  domainAssignments: DomainAssignment[];
  /** How was this resource classified? */
  classificationMethod: ClassificationMethod;
  /** Confidence in the classification (0-1) */
  classificationConfidence: number;
  /** Has an admin explicitly set or confirmed this? */
  isAdminVerified: boolean;
  /** When was classification last updated? */
  lastClassifiedAt: number;
  /** Raw metadata from the source system */
  metadata?: Record<string, unknown>;
}

export interface DomainAssignment {
  domain: OrganizationalDomain;
  subDomain?: string;
  /** Weight of this assignment (0-1, all weights for a resource sum to ~1.0) */
  weight: number;
  /** How was this specific assignment determined? */
  evidence: ClassificationEvidence[];
}

export interface ClassificationEvidence {
  type: 'name_pattern' | 'keyword_match' | 'participant_analysis' | 'content_analysis' | 'activity_correlation' | 'admin_override' | 'connector_default';
  detail: string;
  confidence: number;
}

export type ResourceType =
  | 'channel'         // Slack channel, Google Chat space
  | 'project'         // Jira project, Asana project, Linear team
  | 'repository'      // GitHub repo
  | 'board'           // Jira board, Trello board
  | 'pipeline'        // CI/CD pipeline
  | 'account'         // Financial account (Xero, Stripe)
  | 'queue'           // Support queue (Freshdesk, Zendesk)
  | 'team'            // PagerDuty team, organizational team
  | 'calendar'        // Google Calendar
  | 'document_space'  // Notion workspace, Confluence space
  | 'campaign'        // Marketing campaign
  | 'deal_pipeline'   // HubSpot pipeline
  | 'service'         // PagerDuty service, monitoring service
  | 'workspace'       // Generic workspace
  | 'custom';

export type ClassificationMethod =
  | 'auto_name'       // Classified by name pattern
  | 'auto_content'    // Classified by content analysis
  | 'auto_participant'// Classified by who participates
  | 'auto_correlation'// Classified by activity correlation
  | 'auto_hybrid'     // Multiple auto methods combined
  | 'admin_explicit'  // Admin manually assigned
  | 'connector_default'// Default from connector (fallback)
  | 'brain_learned';  // Brain evolved the classification

// ============================================================================
// DEFAULT SUB-DOMAINS
// ============================================================================

const DEFAULT_SUB_DOMAINS: SubDomain[] = [
  // Engineering
  { id: 'eng-backend', name: 'Backend', parentDomain: 'engineering', origin: 'system_default', keywords: ['backend', 'api', 'server', 'database', 'db', 'microservice'], createdAt: Date.now() },
  { id: 'eng-frontend', name: 'Frontend', parentDomain: 'engineering', origin: 'system_default', keywords: ['frontend', 'ui', 'ux', 'web', 'react', 'vue', 'angular', 'css'], createdAt: Date.now() },
  { id: 'eng-mobile', name: 'Mobile', parentDomain: 'engineering', origin: 'system_default', keywords: ['mobile', 'ios', 'android', 'react-native', 'flutter', 'app'], createdAt: Date.now() },
  { id: 'eng-devops', name: 'DevOps/SRE', parentDomain: 'engineering', origin: 'system_default', keywords: ['devops', 'sre', 'infra', 'infrastructure', 'ci', 'cd', 'deploy', 'kubernetes', 'k8s', 'docker', 'terraform'], createdAt: Date.now() },
  { id: 'eng-data', name: 'Data Engineering', parentDomain: 'engineering', origin: 'system_default', keywords: ['data', 'pipeline', 'etl', 'warehouse', 'analytics', 'bigquery', 'snowflake', 'dbt'], createdAt: Date.now() },
  { id: 'eng-security', name: 'Security', parentDomain: 'engineering', origin: 'system_default', keywords: ['security', 'infosec', 'vulnerability', 'pentest', 'soc', 'compliance'], createdAt: Date.now() },
  { id: 'eng-qa', name: 'QA/Testing', parentDomain: 'engineering', origin: 'system_default', keywords: ['qa', 'test', 'testing', 'quality', 'automation', 'e2e', 'regression'], createdAt: Date.now() },
  { id: 'eng-platform', name: 'Platform', parentDomain: 'engineering', origin: 'system_default', keywords: ['platform', 'core', 'foundation', 'sdk', 'framework', 'library'], createdAt: Date.now() },

  // Product
  { id: 'prod-design', name: 'Design', parentDomain: 'product', origin: 'system_default', keywords: ['design', 'figma', 'prototype', 'wireframe', 'ux', 'research'], createdAt: Date.now() },
  { id: 'prod-management', name: 'Product Management', parentDomain: 'product', origin: 'system_default', keywords: ['roadmap', 'feature', 'requirement', 'prd', 'sprint', 'backlog', 'epic'], createdAt: Date.now() },
  { id: 'prod-analytics', name: 'Product Analytics', parentDomain: 'product', origin: 'system_default', keywords: ['analytics', 'metrics', 'funnel', 'retention', 'engagement', 'mixpanel', 'amplitude'], createdAt: Date.now() },

  // Marketing
  { id: 'mkt-content', name: 'Content', parentDomain: 'marketing', origin: 'system_default', keywords: ['content', 'blog', 'seo', 'copywriting', 'social', 'media'], createdAt: Date.now() },
  { id: 'mkt-demand', name: 'Demand Generation', parentDomain: 'marketing', origin: 'system_default', keywords: ['demand', 'lead', 'campaign', 'ads', 'ppc', 'paid', 'advertising', 'growth'], createdAt: Date.now() },
  { id: 'mkt-brand', name: 'Brand', parentDomain: 'marketing', origin: 'system_default', keywords: ['brand', 'creative', 'visual', 'identity', 'pr', 'communications'], createdAt: Date.now() },
  { id: 'mkt-events', name: 'Events', parentDomain: 'marketing', origin: 'system_default', keywords: ['event', 'conference', 'webinar', 'meetup', 'summit', 'expo'], createdAt: Date.now() },

  // Sales
  { id: 'sales-sdr', name: 'SDR/BDR', parentDomain: 'sales', origin: 'system_default', keywords: ['sdr', 'bdr', 'outbound', 'prospecting', 'cold', 'outreach', 'pipeline'], createdAt: Date.now() },
  { id: 'sales-ae', name: 'Account Executives', parentDomain: 'sales', origin: 'system_default', keywords: ['ae', 'deal', 'opportunity', 'proposal', 'negotiation', 'close', 'quota'], createdAt: Date.now() },
  { id: 'sales-solutions', name: 'Solutions Engineering', parentDomain: 'sales', origin: 'system_default', keywords: ['solutions', 'presales', 'demo', 'poc', 'technical', 'se'], createdAt: Date.now() },
  { id: 'sales-partnerships', name: 'Partnerships', parentDomain: 'sales', origin: 'system_default', keywords: ['partner', 'channel', 'alliance', 'reseller', 'integration'], createdAt: Date.now() },

  // Finance
  { id: 'fin-accounting', name: 'Accounting', parentDomain: 'finance', origin: 'system_default', keywords: ['accounting', 'bookkeeping', 'ledger', 'journal', 'reconciliation', 'audit'], createdAt: Date.now() },
  { id: 'fin-billing', name: 'Billing/Revenue', parentDomain: 'finance', origin: 'system_default', keywords: ['billing', 'invoice', 'revenue', 'subscription', 'payment', 'collection'], createdAt: Date.now() },
  { id: 'fin-fp&a', name: 'FP&A', parentDomain: 'finance', origin: 'system_default', keywords: ['fpa', 'budget', 'forecast', 'planning', 'variance', 'model'], createdAt: Date.now() },
  { id: 'fin-treasury', name: 'Treasury', parentDomain: 'finance', origin: 'system_default', keywords: ['treasury', 'cash', 'banking', 'fx', 'currency', 'investment'], createdAt: Date.now() },

  // Support
  { id: 'sup-tier1', name: 'Tier 1 Support', parentDomain: 'support', origin: 'system_default', keywords: ['tier1', 'l1', 'helpdesk', 'ticket', 'general', 'inquiry'], createdAt: Date.now() },
  { id: 'sup-tier2', name: 'Tier 2 Technical', parentDomain: 'support', origin: 'system_default', keywords: ['tier2', 'l2', 'technical', 'escalation', 'debug', 'troubleshoot'], createdAt: Date.now() },
  { id: 'sup-success', name: 'Customer Success', parentDomain: 'support', origin: 'system_default', keywords: ['success', 'csm', 'onboarding', 'adoption', 'health', 'churn', 'retention', 'nps'], createdAt: Date.now() },
  { id: 'sup-implementation', name: 'Implementation', parentDomain: 'support', origin: 'system_default', keywords: ['implementation', 'deployment', 'migration', 'setup', 'configuration'], createdAt: Date.now() },

  // People/HR
  { id: 'ppl-recruiting', name: 'Recruiting', parentDomain: 'people', origin: 'system_default', keywords: ['recruiting', 'hiring', 'talent', 'candidate', 'interview', 'offer', 'sourcing'], createdAt: Date.now() },
  { id: 'ppl-culture', name: 'Culture/Engagement', parentDomain: 'people', origin: 'system_default', keywords: ['culture', 'engagement', 'wellness', 'dei', 'diversity', 'inclusion', 'team-building'], createdAt: Date.now() },
  { id: 'ppl-learning', name: 'Learning & Development', parentDomain: 'people', origin: 'system_default', keywords: ['learning', 'training', 'development', 'certification', 'mentoring', 'coaching'], createdAt: Date.now() },

  // Operations
  { id: 'ops-it', name: 'IT Operations', parentDomain: 'operations', origin: 'system_default', keywords: ['it', 'helpdesk', 'provisioning', 'access', 'hardware', 'software', 'license'], createdAt: Date.now() },
  { id: 'ops-business', name: 'Business Operations', parentDomain: 'operations', origin: 'system_default', keywords: ['operations', 'process', 'automation', 'workflow', 'efficiency', 'ops'], createdAt: Date.now() },

  // Executive
  { id: 'exec-leadership', name: 'Leadership', parentDomain: 'executive', origin: 'system_default', keywords: ['leadership', 'executive', 'c-suite', 'board', 'strategy', 'vision'], createdAt: Date.now() },
  { id: 'exec-all-hands', name: 'All Hands', parentDomain: 'executive', origin: 'system_default', keywords: ['all-hands', 'company', 'announcement', 'town-hall', 'update'], createdAt: Date.now() },

  // Legal
  { id: 'legal-contracts', name: 'Contracts', parentDomain: 'legal', origin: 'system_default', keywords: ['contract', 'agreement', 'nda', 'msa', 'sow', 'terms', 'legal'], createdAt: Date.now() },
  { id: 'legal-compliance', name: 'Compliance', parentDomain: 'legal', origin: 'system_default', keywords: ['compliance', 'gdpr', 'hipaa', 'sox', 'regulation', 'audit', 'privacy'], createdAt: Date.now() },
  { id: 'legal-ip', name: 'IP/Patents', parentDomain: 'legal', origin: 'system_default', keywords: ['patent', 'trademark', 'copyright', 'ip', 'intellectual', 'property'], createdAt: Date.now() },
];

// ============================================================================
// NAME-BASED CLASSIFICATION PATTERNS
// ============================================================================

interface ClassificationPattern {
  pattern: RegExp;
  domain: OrganizationalDomain;
  subDomain?: string;
  confidence: number;
}

/**
 * Ordered by specificity (most specific first).
 * Used for auto-classifying channels, projects, repos by name.
 */
const NAME_CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  // Engineering - specific sub-domains
  { pattern: /\b(backend|api|server|graphql|rest|grpc)\b/i, domain: 'engineering', subDomain: 'eng-backend', confidence: 0.85 },
  { pattern: /\b(frontend|ui|ux|web|react|vue|angular|css|design-system)\b/i, domain: 'engineering', subDomain: 'eng-frontend', confidence: 0.85 },
  { pattern: /\b(mobile|ios|android|react-native|flutter)\b/i, domain: 'engineering', subDomain: 'eng-mobile', confidence: 0.85 },
  { pattern: /\b(devops|sre|infra|infrastructure|ci-?cd|deploy|k8s|kubernetes|terraform|docker)\b/i, domain: 'engineering', subDomain: 'eng-devops', confidence: 0.85 },
  { pattern: /\b(data-?eng|etl|pipeline|warehouse|bigquery|snowflake|dbt|airflow)\b/i, domain: 'engineering', subDomain: 'eng-data', confidence: 0.85 },
  { pattern: /\b(security|infosec|vuln|pentest|soc)\b/i, domain: 'engineering', subDomain: 'eng-security', confidence: 0.85 },
  { pattern: /\b(qa|test|quality|automation|e2e|regression)\b/i, domain: 'engineering', subDomain: 'eng-qa', confidence: 0.80 },
  { pattern: /\b(platform|sdk|framework|core-?lib)\b/i, domain: 'engineering', subDomain: 'eng-platform', confidence: 0.75 },
  // Engineering - general
  { pattern: /\b(eng|engineering|dev|developer|code|tech|build|release|incident|oncall|on-call|outage|postmortem)\b/i, domain: 'engineering', confidence: 0.80 },

  // Product
  { pattern: /\b(design|figma|prototype|wireframe)\b/i, domain: 'product', subDomain: 'prod-design', confidence: 0.85 },
  { pattern: /\b(roadmap|feature|requirement|prd|backlog|epic|sprint-plan)\b/i, domain: 'product', subDomain: 'prod-management', confidence: 0.85 },
  { pattern: /\b(product|pm|prod-?mgmt)\b/i, domain: 'product', confidence: 0.75 },

  // Marketing
  { pattern: /\b(content|blog|seo|copywriting)\b/i, domain: 'marketing', subDomain: 'mkt-content', confidence: 0.85 },
  { pattern: /\b(demand|lead-?gen|campaign|ads|ppc|paid|growth)\b/i, domain: 'marketing', subDomain: 'mkt-demand', confidence: 0.85 },
  { pattern: /\b(brand|creative|pr|communications)\b/i, domain: 'marketing', subDomain: 'mkt-brand', confidence: 0.80 },
  { pattern: /\b(event|conference|webinar|meetup)\b/i, domain: 'marketing', subDomain: 'mkt-events', confidence: 0.80 },
  { pattern: /\b(marketing|mkt|social-?media)\b/i, domain: 'marketing', confidence: 0.80 },

  // Sales
  { pattern: /\b(sdr|bdr|outbound|prospecting)\b/i, domain: 'sales', subDomain: 'sales-sdr', confidence: 0.85 },
  { pattern: /\b(deal|opportunity|proposal|negotiation|close|quota)\b/i, domain: 'sales', subDomain: 'sales-ae', confidence: 0.80 },
  { pattern: /\b(presales|demo|poc|solutions-?eng)\b/i, domain: 'sales', subDomain: 'sales-solutions', confidence: 0.85 },
  { pattern: /\b(partner|channel|alliance|reseller)\b/i, domain: 'sales', subDomain: 'sales-partnerships', confidence: 0.80 },
  { pattern: /\b(sales|revenue|crm|pipeline)\b/i, domain: 'sales', confidence: 0.75 },

  // Finance
  { pattern: /\b(accounting|bookkeeping|ledger|reconciliation|audit)\b/i, domain: 'finance', subDomain: 'fin-accounting', confidence: 0.85 },
  { pattern: /\b(billing|invoice|subscription|payment|collection)\b/i, domain: 'finance', subDomain: 'fin-billing', confidence: 0.85 },
  { pattern: /\b(budget|forecast|fpa|variance|financial-?model)\b/i, domain: 'finance', subDomain: 'fin-fp&a', confidence: 0.85 },
  { pattern: /\b(treasury|cash|banking|fx)\b/i, domain: 'finance', subDomain: 'fin-treasury', confidence: 0.85 },
  { pattern: /\b(finance|fin|money|expense|cost)\b/i, domain: 'finance', confidence: 0.75 },

  // Support
  { pattern: /\b(tier-?1|l1-?support|helpdesk)\b/i, domain: 'support', subDomain: 'sup-tier1', confidence: 0.85 },
  { pattern: /\b(tier-?2|l2-?support|escalation|technical-?support)\b/i, domain: 'support', subDomain: 'sup-tier2', confidence: 0.85 },
  { pattern: /\b(customer-?success|csm|onboarding|adoption|health-?score|nps|churn)\b/i, domain: 'support', subDomain: 'sup-success', confidence: 0.85 },
  { pattern: /\b(implementation|migration|setup|deployment-?support)\b/i, domain: 'support', subDomain: 'sup-implementation', confidence: 0.80 },
  { pattern: /\b(support|ticket|customer|client|help)\b/i, domain: 'support', confidence: 0.75 },

  // People/HR
  { pattern: /\b(recruiting|hiring|talent|candidate|interview|offer)\b/i, domain: 'people', subDomain: 'ppl-recruiting', confidence: 0.85 },
  { pattern: /\b(culture|engagement|wellness|dei|diversity|inclusion)\b/i, domain: 'people', subDomain: 'ppl-culture', confidence: 0.80 },
  { pattern: /\b(learning|training|development|certification|mentoring)\b/i, domain: 'people', subDomain: 'ppl-learning', confidence: 0.80 },
  { pattern: /\b(hr|people|human-?resource|payroll|benefits)\b/i, domain: 'people', confidence: 0.80 },

  // Operations
  { pattern: /\b(it-?ops|it-?help|provisioning|access|hardware|license)\b/i, domain: 'operations', subDomain: 'ops-it', confidence: 0.80 },
  { pattern: /\b(biz-?ops|business-?ops|process|workflow|automation)\b/i, domain: 'operations', subDomain: 'ops-business', confidence: 0.80 },
  { pattern: /\b(operations|ops|admin)\b/i, domain: 'operations', confidence: 0.60 },

  // Executive
  { pattern: /\b(leadership|executive|c-suite|board|strategy)\b/i, domain: 'executive', subDomain: 'exec-leadership', confidence: 0.85 },
  { pattern: /\b(all-?hands|company|announcement|town-?hall)\b/i, domain: 'executive', subDomain: 'exec-all-hands', confidence: 0.80 },
  { pattern: /\b(exec|ceo|cto|cfo|coo|vp-?)\b/i, domain: 'executive', confidence: 0.70 },

  // Legal
  { pattern: /\b(contract|agreement|nda|msa|sow|terms)\b/i, domain: 'legal', subDomain: 'legal-contracts', confidence: 0.85 },
  { pattern: /\b(compliance|gdpr|hipaa|sox|regulation|privacy)\b/i, domain: 'legal', subDomain: 'legal-compliance', confidence: 0.85 },
  { pattern: /\b(patent|trademark|copyright|ip)\b/i, domain: 'legal', subDomain: 'legal-ip', confidence: 0.80 },
  { pattern: /\b(legal)\b/i, domain: 'legal', confidence: 0.80 },

  // Cross-domain patterns (lower confidence, multiple domains)
  { pattern: /\b(incident|outage|postmortem|rca)\b/i, domain: 'engineering', confidence: 0.60 },
  { pattern: /\b(standup|daily|retro|retrospective)\b/i, domain: 'engineering', confidence: 0.50 },
  { pattern: /\b(general|random|watercooler|social)\b/i, domain: 'executive', confidence: 0.30 },
];

// ============================================================================
// CONNECTOR DEFAULT DOMAIN ASSIGNMENTS
// ============================================================================

/**
 * When we can't classify a resource, these are the fallback domain assignments
 * based on the connector type. These have LOW confidence and should be
 * overridden by auto-classification.
 */
const CONNECTOR_DEFAULT_DOMAINS: Record<string, DomainAssignment[]> = {
  'github': [{ domain: 'engineering', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'GitHub is primarily engineering', confidence: 0.6 }] }],
  'jira': [{ domain: 'engineering', weight: 0.6, evidence: [{ type: 'connector_default', detail: 'Jira used across teams', confidence: 0.4 }] }, { domain: 'product', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'Jira used for product management', confidence: 0.4 }] }, { domain: 'support', weight: 0.1, evidence: [{ type: 'connector_default', detail: 'Jira used for support escalations', confidence: 0.3 }] }],
  'slack': [{ domain: 'executive', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Slack is cross-functional — classify by channel', confidence: 0.2 }] }],
  'pagerduty': [{ domain: 'engineering', weight: 0.7, evidence: [{ type: 'connector_default', detail: 'PagerDuty primarily engineering', confidence: 0.5 }] }, { domain: 'support', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'PagerDuty also used by support', confidence: 0.4 }] }],
  'freshdesk': [{ domain: 'support', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Freshdesk is support tooling', confidence: 0.8 }] }],
  'hubspot': [{ domain: 'sales', weight: 0.6, evidence: [{ type: 'connector_default', detail: 'HubSpot primarily sales', confidence: 0.6 }] }, { domain: 'marketing', weight: 0.4, evidence: [{ type: 'connector_default', detail: 'HubSpot also marketing', confidence: 0.5 }] }],
  'stripe': [{ domain: 'finance', weight: 0.7, evidence: [{ type: 'connector_default', detail: 'Stripe is payments', confidence: 0.7 }] }, { domain: 'sales', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'Stripe also revenue tracking', confidence: 0.4 }] }],
  'xero': [{ domain: 'finance', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Xero is accounting', confidence: 0.9 }] }],
  'volopay': [{ domain: 'finance', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Volopay is expense management', confidence: 0.9 }] }],
  'linear': [{ domain: 'engineering', weight: 0.7, evidence: [{ type: 'connector_default', detail: 'Linear primarily engineering', confidence: 0.5 }] }, { domain: 'product', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'Linear also product', confidence: 0.4 }] }],
  'asana': [{ domain: 'operations', weight: 0.4, evidence: [{ type: 'connector_default', detail: 'Asana is cross-functional', confidence: 0.3 }] }, { domain: 'marketing', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'Asana popular with marketing', confidence: 0.4 }] }, { domain: 'product', weight: 0.3, evidence: [{ type: 'connector_default', detail: 'Asana used by product', confidence: 0.3 }] }],
  'google-calendar': [{ domain: 'executive', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Calendar is cross-functional', confidence: 0.2 }] }],
  'google-chat': [{ domain: 'executive', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'Chat is cross-functional — classify by space', confidence: 0.2 }] }],
  'hr-system': [{ domain: 'people', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'HR system is people domain', confidence: 0.9 }] }],
};

// ============================================================================
// DOMAIN TAXONOMY ENGINE
// ============================================================================

export interface DomainTaxonomyConfig {
  /** Custom sub-domains to add beyond defaults */
  customSubDomains?: SubDomain[];
  /** Admin-defined resource overrides */
  adminOverrides?: Map<string, DomainAssignment[]>;
}

export interface DomainTaxonomyInstance {
  /** Classify a resource by its name, connector, and optional metadata */
  classifyResource(input: ClassifyResourceInput): DomainResource;

  /** Get the hierarchical domain path for a signal */
  resolveSignalDomain(connector: string, signalMetadata: Record<string, unknown>): ResolvedDomainPath;

  /** Register an admin override for a resource */
  setAdminOverride(resourceId: string, assignments: DomainAssignment[]): void;

  /** Get all resources for a given domain */
  getResourcesByDomain(domain: OrganizationalDomain, subDomain?: string): DomainResource[];

  /** Get domain assignments for a resource */
  getResourceDomains(resourceId: string): DomainAssignment[];

  /** Update classification based on content analysis */
  refineClassification(resourceId: string, contentKeywords: string[], participantDomains?: OrganizationalDomain[]): void;

  /** Get all sub-domains, optionally filtered by parent domain */
  getSubDomains(parentDomain?: OrganizationalDomain): SubDomain[];

  /** Add a new sub-domain (auto-discovered or admin-defined) */
  addSubDomain(subDomain: SubDomain): void;

  /** Get the full taxonomy tree */
  getTaxonomyTree(): TaxonomyTree;

  /** Get statistics */
  getStats(): TaxonomyStats;
}

export interface ClassifyResourceInput {
  connector: string;
  resourceType: ResourceType;
  externalId: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedDomainPath {
  /** Primary domain for the signal */
  primaryDomain: OrganizationalDomain;
  /** Primary sub-domain (if known) */
  primarySubDomain?: string;
  /** All domain assignments with weights */
  allDomains: DomainAssignment[];
  /** Full hierarchical path: org.domain.subdomain.resource */
  hierarchicalPath: string;
  /** Confidence in the resolution */
  confidence: number;
}

export interface TaxonomyTree {
  domains: Array<{
    domain: OrganizationalDomain;
    subDomains: SubDomain[];
    resources: DomainResource[];
    totalWeight: number;
  }>;
}

export interface TaxonomyStats {
  totalResources: number;
  totalSubDomains: number;
  resourcesByDomain: Record<string, number>;
  autoClassified: number;
  adminVerified: number;
  avgClassificationConfidence: number;
  crossDomainResources: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createDomainTaxonomy(config?: DomainTaxonomyConfig): DomainTaxonomyInstance {
  // Sub-domain registry
  const subDomains = new Map<string, SubDomain>();
  for (const sd of DEFAULT_SUB_DOMAINS) {
    subDomains.set(sd.id, sd);
  }
  if (config?.customSubDomains) {
    for (const sd of config.customSubDomains) {
      subDomains.set(sd.id, sd);
    }
  }

  // Resource registry
  const resources = new Map<string, DomainResource>();

  // Admin overrides
  const adminOverrides = new Map<string, DomainAssignment[]>(config?.adminOverrides);

  // Domain → resources index
  const domainIndex = new Map<OrganizationalDomain, Set<string>>();

  function _indexResource(resource: DomainResource): void {
    resources.set(resource.id, resource);
    for (const assignment of resource.domainAssignments) {
      let set = domainIndex.get(assignment.domain);
      if (!set) { set = new Set(); domainIndex.set(assignment.domain, set); }
      set.add(resource.id);
    }
  }

  /**
   * Classify a resource by its name, connector, and metadata.
   * Uses the pattern hierarchy: admin override > name patterns > connector defaults.
   */
  function classifyResource(input: ClassifyResourceInput): DomainResource {
    const resourceId = `${input.connector}:${input.resourceType}:${input.externalId}`;

    // Check if already classified
    const existing = resources.get(resourceId);
    if (existing?.isAdminVerified) return existing;

    // 1. Check admin overrides
    const override = adminOverrides.get(resourceId);
    if (override) {
      const resource: DomainResource = {
        id: resourceId,
        connector: input.connector,
        resourceType: input.resourceType,
        externalId: input.externalId,
        name: input.name,
        domainAssignments: override,
        classificationMethod: 'admin_explicit',
        classificationConfidence: 1.0,
        isAdminVerified: true,
        lastClassifiedAt: Date.now(),
        metadata: input.metadata,
      };
      _indexResource(resource);
      return resource;
    }

    // 2. Try name-based classification
    const textToClassify = [input.name, input.description || ''].join(' ');
    const nameMatches: Array<{ domain: OrganizationalDomain; subDomain?: string; confidence: number; detail: string }> = [];

    for (const pattern of NAME_CLASSIFICATION_PATTERNS) {
      if (pattern.pattern.test(textToClassify)) {
        nameMatches.push({
          domain: pattern.domain,
          subDomain: pattern.subDomain,
          confidence: pattern.confidence,
          detail: `Name matches pattern: ${pattern.pattern.source}`,
        });
      }
    }

    if (nameMatches.length > 0) {
      // Aggregate by domain (same domain from multiple patterns = higher confidence)
      const domainScores = new Map<OrganizationalDomain, { totalConfidence: number; bestSubDomain?: string; evidences: ClassificationEvidence[] }>();

      for (const match of nameMatches) {
        const existing = domainScores.get(match.domain) || { totalConfidence: 0, evidences: [] };
        existing.totalConfidence += match.confidence;
        if (match.subDomain && (!existing.bestSubDomain || match.confidence > (domainScores.get(match.domain)?.totalConfidence || 0))) {
          existing.bestSubDomain = match.subDomain;
        }
        existing.evidences.push({ type: 'name_pattern', detail: match.detail, confidence: match.confidence });
        domainScores.set(match.domain, existing);
      }

      // Normalize to weights summing to 1.0
      const totalScore = Array.from(domainScores.values()).reduce((s, v) => s + v.totalConfidence, 0);
      const assignments: DomainAssignment[] = Array.from(domainScores.entries())
        .map(([domain, data]) => ({
          domain,
          subDomain: data.bestSubDomain,
          weight: data.totalConfidence / totalScore,
          evidence: data.evidences,
        }))
        .sort((a, b) => b.weight - a.weight);

      const topConfidence = Math.min(0.95, assignments[0]?.evidence[0]?.confidence || 0.5);

      const resource: DomainResource = {
        id: resourceId,
        connector: input.connector,
        resourceType: input.resourceType,
        externalId: input.externalId,
        name: input.name,
        domainAssignments: assignments,
        classificationMethod: 'auto_name',
        classificationConfidence: topConfidence,
        isAdminVerified: false,
        lastClassifiedAt: Date.now(),
        metadata: input.metadata,
      };
      _indexResource(resource);
      return resource;
    }

    // 3. Fall back to connector defaults
    const defaults = CONNECTOR_DEFAULT_DOMAINS[input.connector] || [
      { domain: 'executive' as OrganizationalDomain, weight: 1.0, evidence: [{ type: 'connector_default' as const, detail: 'Unknown connector — defaulting to executive', confidence: 0.1 }] },
    ];

    const resource: DomainResource = {
      id: resourceId,
      connector: input.connector,
      resourceType: input.resourceType,
      externalId: input.externalId,
      name: input.name,
      domainAssignments: defaults,
      classificationMethod: 'connector_default',
      classificationConfidence: defaults[0]?.evidence[0]?.confidence || 0.2,
      isAdminVerified: false,
      lastClassifiedAt: Date.now(),
      metadata: input.metadata,
    };
    _indexResource(resource);
    return resource;
  }

  /**
   * Resolve the hierarchical domain path for a signal.
   * This is what the signal bridge calls instead of the flat CONNECTOR_TO_DOMAIN_MAP.
   */
  function resolveSignalDomain(connector: string, signalMetadata: Record<string, unknown>): ResolvedDomainPath {
    // Try to find the resource for this signal
    const resourceHints = [
      signalMetadata.channel_id,
      signalMetadata.channel_name,
      signalMetadata.project_key,
      signalMetadata.project_id,
      signalMetadata.repository,
      signalMetadata.repo_name,
      signalMetadata.team_id,
      signalMetadata.service_id,
      signalMetadata.queue_id,
      signalMetadata.pipeline_id,
      signalMetadata.board_id,
    ].filter(Boolean);

    // Try to find a matching resource
    for (const hint of resourceHints) {
      const hintStr = String(hint);
      // Check all resource types for this connector
      for (const [, resource] of resources) {
        if (resource.connector === connector && (resource.externalId === hintStr || resource.name.toLowerCase() === hintStr.toLowerCase())) {
          const primary = resource.domainAssignments[0];
          return {
            primaryDomain: primary?.domain || 'executive',
            primarySubDomain: primary?.subDomain,
            allDomains: resource.domainAssignments,
            hierarchicalPath: `${primary?.domain || 'unknown'}.${primary?.subDomain || connector}.${resource.name}`,
            confidence: resource.classificationConfidence,
          };
        }
      }

      // If no existing resource, try to auto-classify from the hint name
      const resourceName = signalMetadata.channel_name || signalMetadata.project_key || signalMetadata.repo_name || hintStr;
      if (typeof resourceName === 'string' && resourceName.length > 0) {
        const resourceType = _guessResourceType(connector, signalMetadata);
        const classified = classifyResource({
          connector,
          resourceType,
          externalId: hintStr,
          name: resourceName as string,
          metadata: signalMetadata,
        });

        const primary = classified.domainAssignments[0];
        return {
          primaryDomain: primary?.domain || 'executive',
          primarySubDomain: primary?.subDomain,
          allDomains: classified.domainAssignments,
          hierarchicalPath: `${primary?.domain || 'unknown'}.${primary?.subDomain || connector}.${classified.name}`,
          confidence: classified.classificationConfidence,
        };
      }
    }

    // Absolute fallback: use connector defaults
    const defaults = CONNECTOR_DEFAULT_DOMAINS[connector];
    if (defaults) {
      const primary = defaults[0];
      return {
        primaryDomain: primary?.domain || 'executive',
        allDomains: defaults,
        hierarchicalPath: `${primary?.domain || 'unknown'}.${connector}`,
        confidence: primary?.evidence[0]?.confidence || 0.2,
      };
    }

    return {
      primaryDomain: 'executive',
      allDomains: [{ domain: 'executive', weight: 1.0, evidence: [{ type: 'connector_default', detail: 'No classification available', confidence: 0.1 }] }],
      hierarchicalPath: `unknown.${connector}`,
      confidence: 0.1,
    };
  }

  function _guessResourceType(connector: string, metadata: Record<string, unknown>): ResourceType {
    if (metadata.channel_id || metadata.channel_name) return 'channel';
    if (metadata.project_key || metadata.project_id) return 'project';
    if (metadata.repository || metadata.repo_name) return 'repository';
    if (metadata.board_id) return 'board';
    if (metadata.pipeline_id) return 'pipeline';
    if (metadata.team_id) return 'team';
    if (metadata.service_id) return 'service';
    if (metadata.queue_id) return 'queue';

    // Connector-based guesses
    switch (connector) {
      case 'slack': case 'google-chat': return 'channel';
      case 'jira': case 'linear': case 'asana': return 'project';
      case 'github': return 'repository';
      case 'pagerduty': return 'service';
      case 'freshdesk': return 'queue';
      case 'stripe': case 'xero': case 'volopay': return 'account';
      case 'hubspot': return 'deal_pipeline';
      case 'google-calendar': return 'calendar';
      default: return 'workspace';
    }
  }

  function setAdminOverride(resourceId: string, assignments: DomainAssignment[]): void {
    adminOverrides.set(resourceId, assignments);
    const existing = resources.get(resourceId);
    if (existing) {
      existing.domainAssignments = assignments;
      existing.classificationMethod = 'admin_explicit';
      existing.classificationConfidence = 1.0;
      existing.isAdminVerified = true;
      existing.lastClassifiedAt = Date.now();
      _indexResource(existing);
    }
  }

  function getResourcesByDomain(domain: OrganizationalDomain, subDomain?: string): DomainResource[] {
    const resourceIds = domainIndex.get(domain);
    if (!resourceIds) return [];

    const result: DomainResource[] = [];
    for (const id of resourceIds) {
      const resource = resources.get(id);
      if (!resource) continue;
      if (subDomain) {
        const hasSubDomain = resource.domainAssignments.some(a => a.domain === domain && a.subDomain === subDomain);
        if (!hasSubDomain) continue;
      }
      result.push(resource);
    }
    return result;
  }

  function getResourceDomains(resourceId: string): DomainAssignment[] {
    return resources.get(resourceId)?.domainAssignments || [];
  }

  function refineClassification(resourceId: string, contentKeywords: string[], participantDomains?: OrganizationalDomain[]): void {
    const resource = resources.get(resourceId);
    if (!resource || resource.isAdminVerified) return;

    // Score keywords against sub-domain keywords
    const domainScores = new Map<OrganizationalDomain, number>();

    for (const keyword of contentKeywords) {
      const lowerKw = keyword.toLowerCase();
      for (const [, sd] of subDomains) {
        if (sd.keywords.some(k => lowerKw.includes(k) || k.includes(lowerKw))) {
          domainScores.set(sd.parentDomain, (domainScores.get(sd.parentDomain) || 0) + 1);
        }
      }
    }

    // Boost domains from participant analysis
    if (participantDomains) {
      for (const domain of participantDomains) {
        domainScores.set(domain, (domainScores.get(domain) || 0) + 2);
      }
    }

    if (domainScores.size === 0) return;

    // Merge with existing assignments (blend old and new)
    const totalScore = Array.from(domainScores.values()).reduce((s, v) => s + v, 0);
    const newAssignments: DomainAssignment[] = Array.from(domainScores.entries())
      .map(([domain, score]) => ({
        domain,
        weight: score / totalScore,
        evidence: [{ type: 'content_analysis' as const, detail: `Content keywords: ${contentKeywords.slice(0, 5).join(', ')}`, confidence: 0.7 }],
      }))
      .sort((a, b) => b.weight - a.weight);

    // Blend: 40% old, 60% new (content analysis is strong signal)
    const blended = _blendAssignments(resource.domainAssignments, newAssignments, 0.4, 0.6);
    resource.domainAssignments = blended;
    resource.classificationMethod = resource.classificationMethod === 'connector_default' ? 'auto_content' : 'auto_hybrid';
    resource.classificationConfidence = Math.min(0.95, resource.classificationConfidence + 0.1);
    resource.lastClassifiedAt = Date.now();
    _indexResource(resource);
  }

  function _blendAssignments(old: DomainAssignment[], newer: DomainAssignment[], oldWeight: number, newWeight: number): DomainAssignment[] {
    const merged = new Map<OrganizationalDomain, { weight: number; subDomain?: string; evidence: ClassificationEvidence[] }>();

    for (const a of old) {
      const existing = merged.get(a.domain) || { weight: 0, evidence: [] };
      existing.weight += a.weight * oldWeight;
      existing.subDomain = existing.subDomain || a.subDomain;
      existing.evidence.push(...a.evidence);
      merged.set(a.domain, existing);
    }

    for (const a of newer) {
      const existing = merged.get(a.domain) || { weight: 0, evidence: [] };
      existing.weight += a.weight * newWeight;
      existing.subDomain = existing.subDomain || a.subDomain;
      existing.evidence.push(...a.evidence);
      merged.set(a.domain, existing);
    }

    // Normalize
    const totalWeight = Array.from(merged.values()).reduce((s, v) => s + v.weight, 0);
    return Array.from(merged.entries())
      .map(([domain, data]) => ({
        domain,
        subDomain: data.subDomain,
        weight: totalWeight > 0 ? data.weight / totalWeight : 1 / merged.size,
        evidence: data.evidence,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  function getSubDomains(parentDomain?: OrganizationalDomain): SubDomain[] {
    const result: SubDomain[] = [];
    for (const [, sd] of subDomains) {
      if (!parentDomain || sd.parentDomain === parentDomain) {
        result.push(sd);
      }
    }
    return result;
  }

  function addSubDomain(subDomain: SubDomain): void {
    subDomains.set(subDomain.id, subDomain);
  }

  function getTaxonomyTree(): TaxonomyTree {
    const domains: OrganizationalDomain[] = ['engineering', 'product', 'marketing', 'sales', 'finance', 'support', 'people', 'operations', 'executive', 'legal'];

    return {
      domains: domains.map(domain => {
        const domainSubDomains = getSubDomains(domain);
        const domainResources = getResourcesByDomain(domain);
        const totalWeight = domainResources.reduce((sum, r) => {
          const assignment = r.domainAssignments.find(a => a.domain === domain);
          return sum + (assignment?.weight || 0);
        }, 0);

        return { domain, subDomains: domainSubDomains, resources: domainResources, totalWeight };
      }),
    };
  }

  function getStats(): TaxonomyStats {
    let autoClassified = 0;
    let adminVerified = 0;
    let totalConfidence = 0;
    let crossDomain = 0;
    const byDomain: Record<string, number> = {};

    for (const [, resource] of resources) {
      if (resource.isAdminVerified) adminVerified++;
      else autoClassified++;
      totalConfidence += resource.classificationConfidence;
      if (resource.domainAssignments.length > 1) crossDomain++;
      for (const a of resource.domainAssignments) {
        byDomain[a.domain] = (byDomain[a.domain] || 0) + 1;
      }
    }

    return {
      totalResources: resources.size,
      totalSubDomains: subDomains.size,
      resourcesByDomain: byDomain,
      autoClassified,
      adminVerified,
      avgClassificationConfidence: resources.size > 0 ? totalConfidence / resources.size : 0,
      crossDomainResources: crossDomain,
    };
  }

  return {
    classifyResource,
    resolveSignalDomain,
    setAdminOverride,
    getResourcesByDomain,
    getResourceDomains,
    refineClassification,
    getSubDomains,
    addSubDomain,
    getTaxonomyTree,
    getStats,
  };
}
