/**
 * Default Module Definitions
 *
 * 9 pre-defined modules for organizational intelligence:
 * - Finance, Revenue, CS, AM, Services (Core Operations)
 * - Product, Marketing, People (Extended Operations)
 * - Executive (Strategic/Cross-domain)
 */

import type { ModuleDefinition, ModuleRegistry } from '../types';

// =============================================================================
// FINANCE MODULE
// =============================================================================
export const financeModule: ModuleDefinition = {
  id: 'finance',
  name: 'Finance',
  description: 'Manage cash flow, invoicing, collections, and financial health',
  icon: '💰',
  category: 'core',
  keywords: [
    // Invoicing
    'invoice', 'invoicing', 'invoices', 'billing', 'billed',
    // Payments
    'payment', 'payments', 'paid', 'unpaid', 'overdue', 'outstanding',
    // Collections
    'collection', 'collections', 'collect', 'collecting', 'receivable', 'receivables',
    // Cash
    'cash', 'cash flow', 'cashflow', 'runway', 'burn', 'burn rate',
    // Metrics
    'DSO', 'days sales outstanding', 'AR', 'AP', 'payables',
    // Expenses
    'expense', 'expenses', 'spending', 'spend', 'cost', 'costs',
    // Budget
    'budget', 'budgeting', 'budgets', 'forecast', 'variance',
    // Revenue recognition
    'revenue recognition', 'deferred revenue', 'accrual',
    // Financial statements
    'profit', 'margin', 'P&L', 'balance sheet', 'financial', 'fiscal',
    // Recurring revenue
    'MRR', 'ARR', 'recurring revenue'
  ],
  capabilities: [
    'Invoice tracking & aging analysis',
    'Collections priority & automation',
    'Cash flow forecasting',
    'DSO monitoring & trends',
    'Budget vs actual tracking',
    'Expense categorization & alerts',
    'Revenue recognition scheduling',
    'Financial health scoring'
  ],
  tables: ['invoices', 'transactions', 'cash_projections', 'budgets', 'expenses'],
  personas: ['CFO', 'VP Finance', 'Controller', 'Finance Manager', 'AR Manager']
};

// =============================================================================
// REVENUE (SALES) MODULE
// =============================================================================
export const revenueModule: ModuleDefinition = {
  id: 'revenue',
  name: 'Revenue (Sales)',
  description: 'Track pipeline, manage deals, and forecast revenue',
  icon: '📈',
  category: 'core',
  keywords: [
    // Pipeline
    'pipeline', 'funnel', 'stage', 'stages',
    // Deals
    'deal', 'deals', 'opportunity', 'opportunities', 'opp', 'opps',
    // Sales actions
    'sales', 'selling', 'sell', 'close', 'closing', 'closed', 'won', 'lost',
    // Forecasting
    'forecast', 'forecasting', 'projection', 'projections',
    // Targets
    'quota', 'quotas', 'target', 'targets', 'attainment', 'goal',
    // Metrics
    'win rate', 'conversion', 'probability', 'weighted',
    // Deal value
    'ACV', 'TCV', 'deal size', 'deal value', 'ARR',
    // Velocity
    'sales cycle', 'velocity', 'time to close', 'days in stage',
    // Process
    'prospect', 'prospecting', 'qualification', 'discovery', 'demo', 'proposal',
    // Team
    'rep', 'reps', 'AE', 'SDR', 'BDR', 'sales team'
  ],
  capabilities: [
    'Pipeline management & visualization',
    'Deal tracking & stage progression',
    'Revenue forecasting (weighted & committed)',
    'Win/loss analysis & patterns',
    'Sales velocity metrics',
    'Quota tracking & attainment',
    'Rep performance analytics',
    'Deal risk identification'
  ],
  tables: ['revenue_deals', 'deal_stages', 'sales_forecasts', 'quotas'],
  personas: ['VP Sales', 'CRO', 'Sales Manager', 'AE', 'Sales Ops']
};

// =============================================================================
// CUSTOMER SUCCESS MODULE
// =============================================================================
export const csModule: ModuleDefinition = {
  id: 'cs',
  name: 'Customer Success',
  description: 'Monitor customer health, prevent churn, and drive satisfaction',
  icon: '💚',
  category: 'operational',
  keywords: [
    // Health
    'customer health', 'health score', 'client health', 'health',
    // Satisfaction
    'NPS', 'net promoter', 'CSAT', 'satisfaction', 'survey', 'feedback',
    // Churn
    'churn', 'churning', 'churned', 'attrition', 'cancel', 'cancellation',
    // Risk
    'at risk', 'at-risk', 'risk', 'risky', 'red account',
    // Retention
    'retention', 'retain', 'retained', 'save', 'saved',
    // Engagement
    'engagement', 'engaged', 'adoption', 'usage', 'active', 'inactive', 'dormant',
    // Onboarding
    'onboarding', 'onboard', 'implementation', 'go live', 'go-live',
    // Reviews
    'QBR', 'business review', 'EBR', 'check-in', 'touchpoint',
    // Success
    'success plan', 'CSM', 'customer success', 'CS',
    // Sentiment
    'sentiment', 'happy', 'unhappy', 'frustrated', 'escalation'
  ],
  capabilities: [
    'Health score tracking & trends',
    'Churn prediction & prevention',
    'NPS monitoring & analysis',
    'At-risk account alerts',
    'Engagement analytics',
    'Success playbook automation',
    'Onboarding tracking',
    'Customer sentiment analysis'
  ],
  tables: ['clients', 'client_health_scores', 'nps_surveys', 'client_interactions', 'client_events'],
  personas: ['VP CS', 'CSM', 'Customer Success Manager', 'Head of CS', 'CS Ops']
};

// =============================================================================
// ACCOUNT MANAGEMENT MODULE
// =============================================================================
export const amModule: ModuleDefinition = {
  id: 'am',
  name: 'Account Management',
  description: 'Drive renewals, expansions, and grow existing accounts',
  icon: '🤝',
  category: 'operational',
  keywords: [
    // Renewals
    'renewal', 'renew', 'renewing', 'renewals', 'renews',
    // Contracts
    'contract', 'contracts', 'agreement', 'term', 'terms',
    // Expansion
    'expansion', 'expand', 'expanding', 'growth', 'grow', 'growing',
    // Upsell/Cross-sell
    'upsell', 'up-sell', 'cross-sell', 'cross sell', 'crosssell',
    // Upgrade/Downgrade
    'upgrade', 'downgrade', 'downsell', 'contraction',
    // Retention metrics
    'NRR', 'net revenue retention', 'GRR', 'gross retention', 'dollar retention',
    // Account planning
    'account plan', 'strategic account', 'key account', 'named account',
    // Role
    'AM', 'account manager', 'account management', 'relationship',
    // White space
    'white space', 'whitespace', 'opportunity', 'land and expand'
  ],
  capabilities: [
    'Renewal tracking & forecasting',
    'Expansion pipeline management',
    'NRR/GRR metrics & trends',
    'Account planning & strategy',
    'Upsell opportunity identification',
    'Contract management',
    'White space analysis',
    'Renewal risk scoring'
  ],
  tables: ['clients', 'revenue_deals', 'contracts', 'arr_history', 'renewal_forecasts'],
  personas: ['VP AM', 'Account Manager', 'Director of AM', 'Strategic AM', 'Renewal Manager']
};

// =============================================================================
// SERVICES (DELIVERY) MODULE
// =============================================================================
export const servicesModule: ModuleDefinition = {
  id: 'services',
  name: 'Services (Delivery)',
  description: 'Manage projects, track delivery, and optimize utilization',
  icon: '🛠️',
  category: 'operational',
  keywords: [
    // Projects
    'project', 'projects', 'engagement', 'engagements',
    // Delivery
    'delivery', 'delivering', 'deliver', 'implementation', 'implementations',
    // Milestones
    'milestone', 'milestones', 'timeline', 'deadline', 'due date', 'deliverable',
    // Resources
    'resource', 'resources', 'allocation', 'allocations', 'capacity', 'bandwidth',
    // Utilization
    'utilization', 'utilized', 'billable', 'non-billable', 'bench', 'benched',
    // SOW
    'SOW', 'statement of work', 'scope', 'change request', 'CR',
    // Consulting
    'consultant', 'consultants', 'consulting', 'professional services', 'PS',
    // Time
    'hours', 'timesheet', 'time tracking', 'logged hours',
    // Status
    'on track', 'at risk', 'delayed', 'blocked', 'completed'
  ],
  capabilities: [
    'Project tracking & status',
    'Milestone management',
    'Resource utilization monitoring',
    'Capacity planning',
    'SOW management',
    'Delivery health scoring',
    'Time & expense tracking',
    'Project profitability analysis'
  ],
  tables: ['services', 'service_milestones', 'resource_allocations', 'timesheets', 'sows'],
  personas: ['VP Services', 'Delivery Manager', 'PS Director', 'Resource Manager', 'PMO']
};

// =============================================================================
// PRODUCT MODULE
// =============================================================================
export const productModule: ModuleDefinition = {
  id: 'product',
  name: 'Product',
  description: 'Manage roadmap, track features, and gather feedback',
  icon: '🚀',
  category: 'operational',
  keywords: [
    // Product
    'product', 'roadmap', 'roadmaps',
    // Features
    'feature', 'features', 'functionality', 'capability',
    // Releases
    'release', 'releases', 'version', 'versions', 'launch', 'ship', 'shipping',
    // Issues
    'bug', 'bugs', 'issue', 'issues', 'defect', 'defects', 'fix',
    // Feedback
    'feedback', 'request', 'feature request', 'enhancement', 'suggestion',
    // Agile
    'sprint', 'sprints', 'backlog', 'prioritization', 'priority', 'epic',
    // Usage
    'usage', 'adoption', 'analytics', 'telemetry', 'DAU', 'MAU',
    // Stages
    'beta', 'GA', 'alpha', 'preview',
    // Role
    'PM', 'product manager', 'product owner', 'PO'
  ],
  capabilities: [
    'Roadmap planning & visualization',
    'Feature tracking & prioritization',
    'Bug management & triage',
    'Customer feedback aggregation',
    'Usage analytics & insights',
    'Release management',
    'Feature adoption tracking',
    'Customer-driven prioritization'
  ],
  tables: ['product_features', 'product_feedback', 'product_releases', 'usage_analytics', 'bugs'],
  personas: ['VP Product', 'PM', 'Product Manager', 'CPO', 'Product Owner']
};

// =============================================================================
// MARKETING MODULE
// =============================================================================
export const marketingModule: ModuleDefinition = {
  id: 'marketing',
  name: 'Marketing',
  description: 'Track campaigns, manage leads, and measure ROI',
  icon: '📣',
  category: 'operational',
  keywords: [
    // Marketing
    'marketing', 'campaign', 'campaigns',
    // Leads
    'lead', 'leads', 'prospect', 'prospects',
    // Qualification
    'MQL', 'SQL', 'qualified', 'qualification', 'funnel', 'top of funnel', 'TOF',
    // Costs
    'CAC', 'customer acquisition cost', 'cost per', 'CPC', 'CPL', 'CPA',
    // Attribution
    'attribution', 'source', 'channel', 'channels', 'touchpoint',
    // Traffic
    'organic', 'paid', 'direct', 'referral', 'traffic',
    // Content
    'content', 'blog', 'webinar', 'event', 'conference', 'ebook', 'whitepaper',
    // Digital
    'SEO', 'SEM', 'PPC', 'ads', 'advertising', 'Google ads', 'LinkedIn',
    // Brand
    'brand', 'awareness', 'reach', 'impressions', 'visibility',
    // Email
    'email', 'newsletter', 'nurture', 'drip', 'sequence',
    // Performance
    'conversion rate', 'click rate', 'open rate', 'bounce rate'
  ],
  capabilities: [
    'Campaign tracking & performance',
    'Lead management & scoring',
    'MQL/SQL funnel analytics',
    'Attribution analysis',
    'CAC monitoring by channel',
    'Content performance tracking',
    'Email campaign analytics',
    'Marketing ROI calculation'
  ],
  tables: ['marketing_campaigns', 'leads', 'marketing_attribution', 'content_metrics', 'email_campaigns'],
  personas: ['VP Marketing', 'CMO', 'Demand Gen', 'Marketing Manager', 'Content Manager']
};

// =============================================================================
// PEOPLE (HR) MODULE
// =============================================================================
export const peopleModule: ModuleDefinition = {
  id: 'people',
  name: 'People (HR)',
  description: 'Manage workforce, track hiring, and monitor engagement',
  icon: '👥',
  category: 'operational',
  keywords: [
    // Employees
    'employee', 'employees', 'team', 'teams', 'staff', 'workforce', 'headcount',
    // Hiring
    'hiring', 'hire', 'hires', 'recruit', 'recruiting', 'recruitment', 'candidate',
    // Attrition
    'attrition', 'turnover', 'retention', 'leaving', 'quit', 'resign', 'departure',
    // Capacity
    'FTE', 'contractor', 'contractors', 'capacity', 'staffing',
    // Skills
    'skill', 'skills', 'competency', 'competencies', 'training', 'development', 'L&D',
    // Performance
    'performance', 'review', 'reviews', 'feedback', '360',
    // Goals
    'OKR', 'OKRs', 'goals', 'objectives', 'KPI',
    // Compensation
    'compensation', 'salary', 'salaries', 'benefits', 'equity', 'bonus',
    // Engagement
    'engagement', 'satisfaction', 'eNPS', 'culture', 'morale',
    // Role
    'HR', 'human resources', 'people ops', 'people operations', 'HRBP'
  ],
  capabilities: [
    'Headcount tracking & planning',
    'Hiring pipeline management',
    'Attrition monitoring & prediction',
    'Skills inventory & gap analysis',
    'Capacity planning',
    'Employee engagement surveys',
    'Performance tracking',
    'Compensation benchmarking'
  ],
  tables: ['employees', 'hiring_pipeline', 'skills_matrix', 'employee_surveys', 'performance_reviews'],
  personas: ['VP People', 'CHRO', 'HR Manager', 'People Ops', 'Talent Acquisition']
};

// =============================================================================
// EXECUTIVE MODULE
// =============================================================================
export const executiveModule: ModuleDefinition = {
  id: 'executive',
  name: 'Executive',
  description: 'Strategic insights, cross-domain analysis, and board metrics',
  icon: '👔',
  category: 'strategic',
  keywords: [
    // Executive
    'executive', 'strategic', 'strategy', 'leadership',
    // Board
    'board', 'investor', 'investors', 'shareholder',
    // Metrics
    'KPI', 'KPIs', 'metric', 'metrics', 'dashboard', 'report', 'reporting',
    // Goals
    'goal', 'goals', 'OKR', 'OKRs', 'objective', 'objectives', 'target', 'targets',
    // Company-wide
    'company', 'business', 'overall', 'holistic', 'big picture', 'organization',
    // Cross-domain
    'cross-domain', 'cross domain', 'systemic', 'blocker', 'blockers', 'dependency',
    // Roles
    'CEO', 'COO', 'C-suite', 'C-level', 'leadership team',
    // Planning
    'forecast', 'planning', 'annual', 'quarterly', 'Q1', 'Q2', 'Q3', 'Q4',
    // Health
    'company health', 'business health', 'org health',
    // Summary
    'summary', 'overview', 'briefing', 'update', 'status'
  ],
  capabilities: [
    'Cross-domain insights & correlation',
    'Company goal tracking (OKRs)',
    'Board metrics & reporting',
    'Systemic blocker identification',
    'Strategic forecasts',
    'Executive briefings',
    'Risk aggregation across domains',
    'Business health scoring'
  ],
  tables: ['company_goals', 'systemic_blockers', 'executive_metrics', 'board_reports'],
  personas: ['CEO', 'COO', 'Executive', 'Board Member', 'Chief of Staff'],
  dependsOn: ['finance', 'revenue', 'cs', 'am', 'services'] // Executive aggregates all domains
};

// =============================================================================
// DEFAULT MODULE REGISTRY
// =============================================================================

/**
 * Default registry containing all 9 modules
 */
export const DEFAULT_MODULES: ModuleRegistry = {
  finance: financeModule,
  revenue: revenueModule,
  cs: csModule,
  am: amModule,
  services: servicesModule,
  product: productModule,
  marketing: marketingModule,
  people: peopleModule,
  executive: executiveModule
};

/**
 * Module IDs for type safety
 */
export const MODULE_IDS = [
  'finance',
  'revenue',
  'cs',
  'am',
  'services',
  'product',
  'marketing',
  'people',
  'executive'
] as const;

/**
 * Get a module by ID
 */
export function getModule(id: string): ModuleDefinition | undefined {
  return DEFAULT_MODULES[id];
}

/**
 * Get all modules as an array
 */
export function getAllModules(): ModuleDefinition[] {
  return Object.values(DEFAULT_MODULES);
}

/**
 * Get modules by category
 */
export function getModulesByCategory(category: 'core' | 'operational' | 'strategic'): ModuleDefinition[] {
  return Object.values(DEFAULT_MODULES).filter(m => m.category === category);
}

/**
 * Get core business modules (Finance, Revenue)
 */
export function getCoreModules(): ModuleDefinition[] {
  return getModulesByCategory('core');
}

/**
 * Get operational modules (CS, AM, Services, Product, Marketing, People)
 */
export function getOperationalModules(): ModuleDefinition[] {
  return getModulesByCategory('operational');
}

/**
 * Get strategic modules (Executive)
 */
export function getStrategicModules(): ModuleDefinition[] {
  return getModulesByCategory('strategic');
}
