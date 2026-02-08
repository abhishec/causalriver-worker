/**
 * Industry Vertical Training Packs — Phase 2
 *
 * Domain-specific knowledge for vertical industries:
 * - Healthcare SaaS patterns
 * - FinTech patterns
 * - E-Commerce / Marketplace patterns
 * - Developer Tools patterns
 *
 * Sources: Industry reports, vertical benchmarks, regulatory research
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. HEALTHCARE SAAS — Compliance, Engagement, Retention
// ============================================================================

const healthcareSaasPatterns: TrainingPack = {
  id: 'healthcare-saas-patterns',
  title: 'Healthcare SaaS Compliance & Retention Patterns',
  source: 'Healthcare SaaS benchmarks, HIPAA research, Digital Health reports 2024-2025',
  industry: 'Healthcare',
  domains: ['product', 'cs', 'finance', 'engineering'],
  confidence: 0.80,
  tags: ['healthcare', 'hipaa', 'compliance', 'patient-engagement', 'digital-health'],

  causalChains: [
    { source: 'engineering', target: 'product', metric: 'hipaa_compliance_to_dev_velocity', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    { source: 'product', target: 'cs', metric: 'compliance_to_retention', effectSize: 0.55, lagDays: 90, pValue: 0.003 },
    { source: 'cs', target: 'finance', metric: 'healthcare_switching_cost_to_churn', effectSize: -0.65, lagDays: 0, pValue: 0.002 },
    { source: 'product', target: 'cs', metric: 'data_breach_to_user_abandonment', effectSize: 0.60, lagDays: 7, pValue: 0.002 },
    { source: 'product', target: 'finance', metric: 'patient_engagement_to_outcomes', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'ehr_integration_to_stickiness', effectSize: 0.55, lagDays: 120, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'HIPAA Compliance Investment Gate',
      entityType: 'healthcare_product',
      when: { logic: 'AND', conditions: [
        { field: 'compliance.hipaa_audit_score', operator: 'less_than', value: 80 },
        { field: 'customers.healthcare_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'HIPAA audit score below 80% with 30%+ healthcare customers. Compliant apps see 30% higher retention. A breach causes 60% user abandonment.' } },
      ],
      naturalLanguage: 'Healthcare SaaS products with HIPAA compliance gaps face 60% user abandonment after any data breach. Compliant apps retain 30% better.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'product', target: 'cs', type: 'triggers', severity: 'critical',
      keywords: { source: ['breach', 'hipaa', 'violation', 'security'], target: ['churn', 'abandonment', 'trust', 'lawsuit'] },
      reasonTemplate: '60% of healthcare app users abandon after a data breach. HIPAA violations cost $100-$50K per violation. Compliance is existential in healthcare.' },
    { source: 'engineering', target: 'product', type: 'delays', severity: 'medium',
      keywords: { source: ['compliance', 'audit', 'encryption', 'access-control'], target: ['feature', 'roadmap', 'release', 'velocity'] },
      reasonTemplate: 'HIPAA compliance requirements add 30-40% to development time but create 30% higher retention via trust and switching costs.' },
  ],

  patterns: [
    { name: 'Healthcare Switching Cost Moat', domains: ['cs', 'finance'], description: 'Healthcare SaaS has lower churn (~5% annually) due to deep EHR integrations, regulatory switching costs, and clinical workflow dependencies. Once embedded, switching cost is 6-12 months of implementation.', observed: 75, expected: 30, total: 100 },
    { name: 'Breach Trust Destruction', domains: ['product', 'cs'], description: '60% of healthcare users abandon apps after a data breach. HIPAA-compliant apps see 30% higher retention. Trust is the #1 competitive moat in healthcare SaaS.', observed: 72, expected: 30, total: 100 },
    { name: 'Patient Engagement ROI', domains: ['product', 'finance'], description: '80% of hospitals now offer digital patient engagement (view/download/message). Digital-first engagement reduces no-shows 25%, improves outcomes 15%, and increases satisfaction 20%.', observed: 68, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'low_churn', predictedConfidence: 0.78, actual: 'low_churn', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'compliance_retention_lift', predictedConfidence: 0.72, actual: 'retention_improved', wasCorrect: true, sourceDomain: 'product', targetDomain: 'cs' },
  ],

  narrative: 'Healthcare SaaS has unique dynamics: HIPAA compliance adds 30-40% to development cost but creates a massive retention moat — compliant apps see 30% higher retention, and 60% of users abandon after any breach. Annual churn is lower (~5%) due to deep EHR integrations and clinical workflow dependencies that create 6-12 month switching costs. Patient engagement is the growth lever: 80% of hospitals now offer digital engagement, reducing no-shows 25% and improving outcomes 15%. The trade-off: compliance slows velocity but builds trust that competitors can\'t easily replicate.',
};

// ============================================================================
// 2. FINTECH — Trust, Compliance, Security
// ============================================================================

const fintechPatterns: TrainingPack = {
  id: 'fintech-trust-compliance',
  title: 'FinTech Trust, Compliance & Security Cascade',
  source: 'SEC enforcement data, DeepStrike breach stats, DORA regulation, fintech compliance reports 2024-2025',
  industry: 'FinTech',
  domains: ['finance', 'engineering', 'cs', 'product', 'people'],
  confidence: 0.82,
  tags: ['fintech', 'compliance', 'security', 'trust', 'breach', 'regulation'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'security_incident_to_churn', effectSize: 0.70, lagDays: 14, pValue: 0.001 },
    { source: 'finance', target: 'finance', metric: 'compliance_cost_to_margin', effectSize: -0.50, lagDays: 0, pValue: 0.003 },
    { source: 'engineering', target: 'cs', metric: 'api_reliability_to_trust', effectSize: 0.60, lagDays: 7, pValue: 0.002 },
    { source: 'finance', target: 'people', metric: 'regulatory_burden_to_hiring', effectSize: 0.45, lagDays: 60, pValue: 0.008 },
    { source: 'product', target: 'finance', metric: 'compliance_automation_to_cost_reduction', effectSize: -0.50, lagDays: 90, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Security Incident Revenue Impact',
      entityType: 'fintech_company',
      when: { logic: 'AND', conditions: [
        { field: 'security.incidents_last_12m', operator: 'greater_than', value: 0 },
        { field: 'customers.financial_institutions_pct', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Security incident with financial institution customers. Average breach costs $4.88M. 33% of consumers stop doing business after compromise. Financial sector accounts for 27% of all breaches.' } },
      ],
      naturalLanguage: 'A single fintech security incident costs $4.88M average and 33% customer churn. Financial sector breaches increased 80% YoY.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'triggers', severity: 'critical',
      keywords: { source: ['breach', 'hack', 'vulnerability', 'incident', 'api-failure'], target: ['churn', 'fine', 'trust', 'revenue-loss'] },
      reasonTemplate: 'Fintech breaches: $4.88M average cost, 33% customer loss, 27% of all breaches. SEC imposed $8.2B in fines in 2024 alone (+67% YoY).' },
    { source: 'finance', target: 'engineering', type: 'impacts', severity: 'high',
      keywords: { source: ['regulation', 'compliance', 'audit', 'DORA'], target: ['development', 'velocity', 'roadmap', 'hiring'] },
      reasonTemplate: '93% of fintechs struggle with compliance. Non-compliance costs up to $5M/year. DORA (Jan 2025) requires operational resilience during extreme stress.' },
  ],

  patterns: [
    { name: 'Fintech Trust Fragility', domains: ['engineering', 'cs'], description: '33% of consumers stop business after account compromise. 18.4% of top fintechs had public breaches by 2024. Trust takes years to build and seconds to destroy in financial services.', observed: 78, expected: 30, total: 100 },
    { name: 'Compliance Cost Escalation', domains: ['finance', 'engineering'], description: 'SEC fines: $8.2B in 2024 (+67% YoY). GDPR: $5.65B+ in fines. AML fines: $8B+. Non-compliance costs up to $5M/year. 93% of fintechs struggle to meet requirements.', observed: 75, expected: 30, total: 100 },
    { name: 'API Reliability Trust Chain', domains: ['engineering', 'cs'], description: 'Fintech APIs are critical infrastructure. Banking API failures cascade to partner applications, eroding trust across the entire ecosystem. DORA mandates operational resilience.', observed: 70, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'breach_churn_spike', predictedConfidence: 0.80, actual: 'churn_increased', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'cs' },
    { predicted: 'compliance_cost_growth', predictedConfidence: 0.75, actual: 'costs_increased', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
  ],

  narrative: 'FinTech operates under extreme trust sensitivity. A single breach costs $4.88M average and causes 33% customer loss. The financial sector accounts for 27% of all breaches, with intrusions up 80% YoY. Regulatory pressure is intense: SEC imposed $8.2B in fines in 2024 (+67%), and 93% of fintechs struggle with compliance requirements costing up to $5M/year. The EU\'s DORA regulation (Jan 2025) mandates operational resilience. The cascade: security incident → trust destruction → mass churn → regulatory investigation → fines → valuation collapse. The moat: companies that invest early in compliance and security build defensible trust that competitors without regulatory infrastructure cannot match.',
};

// ============================================================================
// 3. MARKETPLACE DYNAMICS — Liquidity, Network Effects, Take Rates
// ============================================================================

const marketplaceDynamics: TrainingPack = {
  id: 'marketplace-liquidity-dynamics',
  title: 'Marketplace Liquidity & Network Effects',
  source: 'a16z Marketplace Metrics, Guru Startups, Phoenix Strategy Group, Sharetribe research',
  industry: 'Marketplace',
  domains: ['marketing', 'product', 'finance', 'cs'],
  confidence: 0.80,
  tags: ['marketplace', 'liquidity', 'network-effects', 'take-rate', 'gmv', 'two-sided'],

  causalChains: [
    { source: 'marketing', target: 'product', metric: 'supply_demand_to_liquidity', effectSize: 0.70, lagDays: 30, pValue: 0.002 },
    { source: 'product', target: 'finance', metric: 'liquidity_to_gmv_growth', effectSize: 0.65, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'cs', metric: 'take_rate_to_seller_churn', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
    { source: 'product', target: 'marketing', metric: 'network_effects_to_organic_growth', effectSize: 0.60, lagDays: 90, pValue: 0.003 },
    { source: 'cs', target: 'finance', metric: 'supply_retention_to_gmv', effectSize: 0.55, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Marketplace Liquidity Crisis',
      entityType: 'marketplace',
      when: { logic: 'AND', conditions: [
        { field: 'liquidity.search_to_fill_rate', operator: 'less_than', value: 0.25 },
        { field: 'supply.monthly_retention', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Liquidity below 25% fill rate with poor supply retention. Marketplace death spiral: low fill → seller leaves → less supply → worse fill. Focus supply-side acquisition.' } },
      ],
      naturalLanguage: 'Marketplaces need >25% search-to-fill rate and 50%+ supply retention. Below these, the marketplace enters a death spiral.',
      priority: 90,
    },
  ],

  cascades: [
    { source: 'marketing', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['supply', 'demand', 'liquidity', 'matching', 'network'], target: ['gmv', 'revenue', 'take-rate', 'growth'] },
      reasonTemplate: 'Marketplace liquidity drives everything: >60% liquidity score needed for Series A. Best marketplaces achieve 100%+ supply GMV retention within 12 months.' },
    { source: 'finance', target: 'cs', type: 'impacts', severity: 'medium',
      keywords: { source: ['take-rate', 'commission', 'pricing', 'monetization'], target: ['seller-churn', 'supply', 'satisfaction', 'competition'] },
      reasonTemplate: 'Take rate must balance monetization with seller retention. Aggressive take rates accelerate supply-side churn. Best offset through value-added services.' },
  ],

  patterns: [
    { name: 'Marketplace Liquidity Threshold', domains: ['product', 'finance'], description: 'Series A: $500K-$2M monthly GMV, 15-20% MoM growth, 80%+ quarterly retention, >25% fill rate, LTV:CAC 3:1+. Best marketplaces reach 100%+ supply GMV retention by month 12.', observed: 72, expected: 30, total: 100 },
    { name: 'Supply-Side Retention Curve', domains: ['cs', 'finance'], description: 'Supply GMV retention: 80-95% in first 3 months, drops to 45-50% by month 12. Best marketplaces reverse this: suppliers grow GMV 2-3x over time even though only 50-70% stick.', observed: 68, expected: 30, total: 100 },
    { name: 'Network Effect Compounding', domains: ['marketing', 'product'], description: 'Two-sided network effects compound: more supply → more demand → more supply. Marketplaces with diversified traffic and <40% channel concentration achieve 2-4x revenue multiples.', observed: 70, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'liquidity_drives_growth', predictedConfidence: 0.75, actual: 'growth_accelerated', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
    { predicted: 'network_effect_moat', predictedConfidence: 0.70, actual: 'moat_established', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'product' },
  ],

  narrative: 'Marketplaces live and die by liquidity — the speed and reliability of supply-demand matching. Series A investors expect >60% liquidity score, >25% fill rate, and 80%+ quarterly GMV retention. The supply-side is critical: retention starts at 80-95% but drops to 45-50% by month 12. Best marketplaces reverse this — suppliers grow GMV 2-3x over time. Network effects compound: more supply attracts more demand, which attracts more supply. Take rates must balance monetization with supply retention. Marketplaces with diversified traffic (<40% channel concentration) achieve 2-4x revenue multiples. The death spiral: low liquidity → poor fill rate → seller churn → less supply → worse fill rate.',
};

// ============================================================================
// 4. DEVELOPER TOOLS — API Adoption, Documentation, Activation
// ============================================================================

const devToolsAdoption: TrainingPack = {
  id: 'devtools-adoption-patterns',
  title: 'Developer Tools Adoption & Activation Patterns',
  source: 'Postman State of API 2024, DevEx research, API documentation benchmarks',
  industry: 'Developer Tools',
  domains: ['product', 'engineering', 'marketing', 'cs'],
  confidence: 0.80,
  tags: ['devtools', 'api', 'documentation', 'activation', 'developer-adoption', 'dx'],

  causalChains: [
    { source: 'product', target: 'marketing', metric: 'documentation_quality_to_adoption', effectSize: 0.65, lagDays: 14, pValue: 0.002 },
    { source: 'product', target: 'cs', metric: 'time_to_first_api_call_to_retention', effectSize: 0.60, lagDays: 7, pValue: 0.003 },
    { source: 'engineering', target: 'cs', metric: 'api_reliability_to_developer_trust', effectSize: 0.55, lagDays: 30, pValue: 0.005 },
    { source: 'product', target: 'marketing', metric: 'community_health_to_word_of_mouth', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
    { source: 'marketing', target: 'finance', metric: 'developer_adoption_to_revenue', effectSize: 0.45, lagDays: 90, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Documentation Barrier Alert',
      entityType: 'devtool_product',
      when: { logic: 'AND', conditions: [
        { field: 'docs.developer_satisfaction_score', operator: 'less_than', value: 60 },
        { field: 'activation.time_to_first_call_hours', operator: 'greater_than', value: 4 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: '45% of developers cite poor docs as #1 integration barrier. Time-to-first-API-call >4 hours kills adoption. Add interactive "try it out" docs.' } },
      ],
      naturalLanguage: '45% of developers abandon APIs due to poor documentation. Interactive docs with embedded testing reduce time-to-first-call from hours to minutes.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'product', target: 'marketing', type: 'enables', severity: 'high',
      keywords: { source: ['docs', 'sdk', 'quickstart', 'tutorial', 'playground'], target: ['adoption', 'developers', 'signups', 'community'] },
      reasonTemplate: '45% of developers cite poor docs as #1 barrier. 39% cite inconsistency. 43% say API integration is most time-consuming task. Great docs = great adoption.' },
  ],

  patterns: [
    { name: 'Documentation-Adoption Correlation', domains: ['product', 'marketing'], description: '45% of developers cite poor docs as primary barrier. 39% cite inconsistency. Interactive "try it out" functionality in docs dramatically accelerates adoption from hours to minutes.', observed: 75, expected: 30, total: 100 },
    { name: 'Time-to-First-Call Metric', domains: ['product', 'cs'], description: 'DevTools live and die by time-to-first-API-call. Best-in-class: <5 minutes (Stripe, Twilio). Average: hours to days. Every hour of delay reduces conversion by 10-15%.', observed: 70, expected: 30, total: 100 },
    { name: 'AI DevTools Wave', domains: ['product', 'engineering'], description: '89% of developers adopted AI tools by 2025. AI-assisted dev is now the norm. DevTool companies without AI features lose 2x faster to competitors that have them.', observed: 72, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'docs_improve_adoption', predictedConfidence: 0.78, actual: 'adoption_improved', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
    { predicted: 'ttfc_reduces_churn', predictedConfidence: 0.72, actual: 'churn_reduced', wasCorrect: true, sourceDomain: 'product', targetDomain: 'cs' },
  ],

  narrative: 'Developer tools have a unique adoption funnel: documentation IS the product experience. 45% of developers cite poor docs as their #1 barrier, and 43% say API integration is their most time-consuming task. The key metric is time-to-first-API-call — Stripe and Twilio achieve <5 minutes via interactive docs with "try it out" functionality. Every hour of delay reduces conversion 10-15%. Community health drives word-of-mouth (the primary acquisition channel for devtools). 89% of developers adopted AI tools by 2025, making AI features table stakes. The cascade: great docs → fast activation → developer trust → word-of-mouth → organic growth → revenue.',
};

// ============================================================================
// EXPORT
// ============================================================================

export const INDUSTRY_VERTICAL_PACKS: TrainingPack[] = [
  healthcareSaasPatterns,
  fintechPatterns,
  marketplaceDynamics,
  devToolsAdoption,
];
