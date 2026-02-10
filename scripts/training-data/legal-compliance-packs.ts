/**
 * Legal & Compliance Training Packs
 *
 * Deep legal and compliance knowledge:
 * - Regulatory Cascade & Compliance Risk
 * - GDPR & Data Governance
 * - Intellectual Property Moat
 * - Contract Risk & Management
 *
 * Sources: GDPR enforcement data, USPTO/WIPO, ICC/IACCM contract research
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. REGULATORY CASCADE & COMPLIANCE RISK
// ============================================================================

const regulatoryCascade: TrainingPack = {
  id: 'regulatory-cascade-compliance',
  title: 'Regulatory Compliance Cascade & Enforcement Economics',
  source: 'SEC enforcement data, FCA fines database, EU regulatory actions, Deloitte compliance surveys',
  industry: 'Financial Services & Technology',
  domains: ['finance', 'engineering', 'strategy'],
  confidence: 0.82,
  tags: ['compliance', 'regulation', 'enforcement', 'sox', 'aml', 'kyc'],

  causalChains: [
    { source: 'finance', target: 'finance', metric: 'compliance_breach_to_regulatory_fine', effectSize: -0.65, lagDays: 90, pValue: 0.001 },
    { source: 'finance', target: 'marketing', metric: 'regulatory_action_to_brand_damage', effectSize: -0.55, lagDays: 7, pValue: 0.002 },
    { source: 'engineering', target: 'finance', metric: 'compliance_automation_to_cost_reduction', effectSize: -0.40, lagDays: 90, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'regulatory_moat_to_barrier_entry', effectSize: 0.45, lagDays: 365, pValue: 0.005 },
    { source: 'finance', target: 'hr', metric: 'compliance_culture_to_risk_reduction', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Compliance Program Maturity Gap',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'operations.compliance_program_maturity', operator: 'less_than', value: 3 },
        { field: 'finance.revenue', operator: 'greater_than', value: 10000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue > $10M with immature compliance program (< level 3/5). Average regulatory fine for non-compliance is 2.7% of revenue. SOX violations cost $1M-$25M in penalties. Invest in compliance before enforcement acts.' } },
      ],
      naturalLanguage: 'Companies with $10M+ revenue and immature compliance programs face disproportionate regulatory risk. The cost of compliance is always less than the cost of non-compliance.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'finance', target: 'marketing', type: 'blocks', severity: 'critical',
      keywords: { source: ['compliance', 'regulation', 'fine', 'breach', 'violation'], target: ['brand', 'trust', 'reputation', 'customer'] },
      reasonTemplate: 'Regulatory enforcement cascades through multiple channels: direct fines (2-4% of revenue), legal costs (2-5x the fine), customer trust erosion (15-25% churn spike), and talent flight. Wells Fargo, Equifax, and Meta demonstrated how compliance failures destroy billions in value.' },
  ],

  patterns: [
    { name: 'Compliance Cost vs Fine Ratio', domains: ['finance'], description: 'The cost of compliance is 2.7x less than the cost of non-compliance. Average compliance program costs 1-3% of revenue; average regulatory fine plus remediation costs 3-9% of revenue. Proactive compliance has clear ROI.', observed: 80, expected: 30, total: 100 },
    { name: 'Regulatory Moat Effect', domains: ['strategy', 'finance'], description: 'In regulated industries (banking, healthcare, insurance), compliance complexity creates natural barriers to entry. Companies that master compliance turn regulatory burden into competitive advantage, as smaller competitors cannot afford the same infrastructure.', observed: 76, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'compliance_fine_avoidance', predictedConfidence: 0.73, actual: 'fine_avoided', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'brand_damage', predictedConfidence: 0.70, actual: 'brand_damaged', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'marketing' },
  ],

  narrative: 'Regulatory compliance creates a cascading effect across the entire organization. Non-compliance penalties follow a power law: SOX violations cost $1M-$25M, GDPR fines reach 4% of global revenue, AML failures at banks have exceeded $10B in cumulative fines. The cascade extends beyond direct fines — legal costs multiply the fine by 2-5x, customer trust erosion increases churn 15-25%, and executive turnover follows 60% of major compliance failures. Smart companies treat compliance as a competitive advantage rather than a cost center.',
};

// ============================================================================
// 2. GDPR & DATA GOVERNANCE
// ============================================================================

const gdprGovernance: TrainingPack = {
  id: 'gdpr-data-governance',
  title: 'GDPR, Data Privacy & Governance Frameworks',
  source: 'EU GDPR enforcement tracker, IAPP research, Gartner Privacy Maturity',
  industry: 'Technology',
  domains: ['engineering', 'finance', 'strategy'],
  confidence: 0.81,
  tags: ['gdpr', 'privacy', 'data-governance', 'consent', 'dpo', 'dpia'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'gdpr_violation_to_financial_penalty', effectSize: -0.60, lagDays: 30, pValue: 0.001 },
    { source: 'engineering', target: 'marketing', metric: 'privacy_by_design_to_customer_trust', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    { source: 'engineering', target: 'engineering', metric: 'data_classification_to_breach_prevention', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    { source: 'strategy', target: 'marketing', metric: 'consent_management_to_data_quality', effectSize: 0.40, lagDays: 60, pValue: 0.005 },
    { source: 'engineering', target: 'strategy', metric: 'data_portability_to_customer_lock_in_reduction', effectSize: -0.35, lagDays: 90, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Data Breach Notification Obligation',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.data_breach_detected', operator: 'equals', value: true },
        { field: 'engineering.pii_records_exposed', operator: 'greater_than', value: 0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Data breach with PII exposure detected. GDPR Article 33 requires notification to supervisory authority within 72 hours. Article 34 requires individual notification for high-risk breaches. Activate incident response immediately.' } },
      ],
      naturalLanguage: 'Any data breach involving personal data triggers mandatory 72-hour notification under GDPR, with individual notification required for high-risk cases.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'blocks', severity: 'critical',
      keywords: { source: ['privacy', 'gdpr', 'data-breach', 'pii', 'consent'], target: ['fine', 'penalty', 'cost', 'revenue'] },
      reasonTemplate: 'GDPR violations carry fines up to 4% of global annual revenue or EUR 20M (whichever is higher). Meta was fined EUR 1.2B, Amazon EUR 746M. The cost extends beyond fines to remediation, legal, and lost business.' },
  ],

  patterns: [
    { name: 'Privacy as Competitive Advantage', domains: ['engineering', 'marketing'], description: 'Companies with strong privacy postures see 15-20% higher customer trust scores and 10% lower churn. Apple transformed privacy into a marketing advantage. Privacy-by-design reduces breach risk by 50% and remediation costs by 80%.', observed: 77, expected: 30, total: 100 },
    { name: 'GDPR Fine Escalation Pattern', domains: ['finance', 'engineering'], description: 'GDPR fines follow an escalation pattern: first offenses average EUR 50K-500K, repeat offenses EUR 5M-50M, systemic violations EUR 100M+. The highest fines target data transfers, consent violations, and inadequate security measures.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'privacy_trust_boost', predictedConfidence: 0.72, actual: 'trust_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'marketing' },
    { predicted: 'fine_risk_reduction', predictedConfidence: 0.70, actual: 'no_fine', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'finance' },
  ],

  narrative: 'GDPR transformed data privacy from a technical concern to a board-level strategic issue. The regulation establishes six lawful bases for processing personal data, with consent and legitimate interest being the most common. Privacy by Design (Article 25) requires data protection to be embedded into system architecture, not bolted on. Data Protection Impact Assessments (DPIAs) are mandatory for high-risk processing. The right to erasure, data portability, and consent withdrawal create ongoing compliance obligations. Companies embracing privacy as a feature (Apple, DuckDuckGo) demonstrate it can be a competitive differentiator.',
};

// ============================================================================
// 3. INTELLECTUAL PROPERTY MOAT
// ============================================================================

const ipMoat: TrainingPack = {
  id: 'intellectual-property-moat',
  title: 'IP Strategy, Patent Moats & Trade Secret Protection',
  source: 'USPTO data, WIPO Global IP Report, Stanford IP Research, BCG IP Monetization',
  industry: 'Technology',
  domains: ['strategy', 'finance', 'engineering'],
  confidence: 0.80,
  tags: ['ip', 'patent', 'trade-secret', 'copyright', 'moat', 'licensing'],

  causalChains: [
    { source: 'engineering', target: 'strategy', metric: 'patent_portfolio_to_competitive_moat', effectSize: 0.50, lagDays: 365, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'ip_licensing_to_revenue_diversification', effectSize: 0.45, lagDays: 180, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'trade_secret_protection_to_value_preservation', effectSize: 0.40, lagDays: 0, pValue: 0.005 },
    { source: 'finance', target: 'strategy', metric: 'patent_litigation_cost_to_barrier_entry', effectSize: 0.35, lagDays: 365, pValue: 0.008 },
    { source: 'strategy', target: 'finance', metric: 'ip_valuation_to_ma_premium', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'IP Portfolio Gap Alert',
      entityType: 'tech_company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.patent_count', operator: 'less_than', value: 5 },
        { field: 'finance.revenue', operator: 'greater_than', value: 5000000 },
        { field: 'engineering.proprietary_algorithm_count', operator: 'greater_than', value: 3 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Revenue > $5M with 3+ proprietary algorithms but < 5 patents. Unprotected IP is vulnerable to competitor replication. Patent filings cost $10K-$30K but protect billions in value.' } },
      ],
      naturalLanguage: 'Technology companies with significant revenue and proprietary technology but minimal patent protection are exposed to competitive copying.',
      priority: 70,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['patent', 'ip', 'trade-secret', 'copyright', 'invention'], target: ['licensing', 'valuation', 'moat', 'revenue'] },
      reasonTemplate: 'IP creates durable competitive advantage: Qualcomm earns $6B+ annually from licensing alone. IBM consistently tops 8,000 patents/year. Patent portfolios increase M&A valuations by 20-50% and deter competitive entry.' },
  ],

  patterns: [
    { name: 'Patent Portfolio Valuation Premium', domains: ['strategy', 'finance'], description: 'Companies with strong patent portfolios command 20-50% higher M&A valuations. Google acquired Motorola primarily for 17,000 patents ($12.5B). Patent portfolios serve as both offensive weapons and defensive shields.', observed: 76, expected: 30, total: 100 },
    { name: 'Trade Secret vs Patent Strategy', domains: ['strategy', 'engineering'], description: 'The patent-vs-trade-secret decision depends on reverse-engineerability. Coca-Cola\'s formula (trade secret, 130+ years) vs pharmaceutical compounds (patented, 20-year protection). Software companies increasingly use trade secrets for algorithms that are hard to reverse-engineer.', observed: 73, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'ip_revenue_generation', predictedConfidence: 0.70, actual: 'licensing_revenue', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
    { predicted: 'competitive_protection', predictedConfidence: 0.68, actual: 'competitor_blocked', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'strategy' },
  ],

  narrative: 'Intellectual property strategy is a critical moat-building tool for technology companies. Patents provide 20-year monopoly rights but require public disclosure; trade secrets offer unlimited duration but no protection against independent discovery. The optimal IP strategy combines patents for core innovations, trade secrets for processes and algorithms, copyrights for creative works, and NDAs/non-competes for employee knowledge retention. Patent trolls have complicated the landscape, but defensive patent portfolios remain essential for freedom to operate.',
};

// ============================================================================
// 4. CONTRACT RISK & MANAGEMENT
// ============================================================================

const contractRisk: TrainingPack = {
  id: 'contract-risk-management',
  title: 'Contract Risk Management & SLA Governance',
  source: 'IACCM contract research, Deloitte contract analytics, World Commerce & Contracting',
  industry: 'B2B SaaS',
  domains: ['finance', 'strategy', 'cs'],
  confidence: 0.79,
  tags: ['contract', 'sla', 'nda', 'liability', 'termination', 'renewal'],

  causalChains: [
    { source: 'cs', target: 'finance', metric: 'sla_breach_to_credit_obligation', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'auto_renewal_to_revenue_predictability', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    { source: 'finance', target: 'cs', metric: 'contract_complexity_to_dispute_probability', effectSize: 0.40, lagDays: 90, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'liability_cap_to_risk_exposure', effectSize: -0.40, lagDays: 0, pValue: 0.005 },
    { source: 'cs', target: 'finance', metric: 'termination_for_convenience_to_revenue_risk', effectSize: -0.35, lagDays: 30, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'SLA Performance at Risk',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.uptime_pct', operator: 'less_than', value: 0.999 },
        { field: 'cs.sla_99_9_contracts_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Actual uptime below 99.9% while 30%+ of contracts include 99.9% SLA. SLA credits typically 10-25% of monthly fees. Sustained breaches trigger termination for cause. Invest in reliability before credits erode margins.' } },
      ],
      naturalLanguage: 'When actual system uptime falls below contracted SLA levels on a significant portion of contracts, the company faces escalating credit obligations and termination risk.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'cs', target: 'finance', type: 'blocks', severity: 'medium',
      keywords: { source: ['sla', 'contract', 'breach', 'termination', 'renewal'], target: ['revenue', 'credit', 'churn', 'margin'] },
      reasonTemplate: 'Contract SLA breaches create a cascade: immediate service credits (10-25% of fees), customer escalation and trust erosion, termination for cause risk, and reputational damage in the market. Prevention through reliability investment costs 1/10th of the breach consequences.' },
  ],

  patterns: [
    { name: 'Auto-Renewal Revenue Stability', domains: ['finance', 'strategy'], description: 'Auto-renewal clauses increase retention rates by 15-25% by creating inertia. Companies with 80%+ auto-renewal contracts have 90%+ gross revenue retention. The notification period (typically 30-90 days) creates a predictable renewal cadence.', observed: 77, expected: 30, total: 100 },
    { name: 'Contract Complexity-Dispute Correlation', domains: ['finance', 'cs'], description: 'Contract complexity correlates with dispute probability: contracts with 50+ pages have 3x more disputes than those under 20 pages. The most disputed clauses are limitation of liability, indemnification, and termination provisions.', observed: 73, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'sla_credit_expense', predictedConfidence: 0.72, actual: 'credits_issued', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'renewal_rate_stability', predictedConfidence: 0.75, actual: 'renewal_stable', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: 'Contract risk management is the invisible infrastructure of B2B revenue. SLA governance determines the financial exposure from service underperformance. Auto-renewal mechanisms create revenue predictability but require careful notification period management. The most critical contract clauses — limitation of liability, indemnification, termination for cause vs convenience, and intellectual property ownership — determine the risk profile of every customer relationship. Companies with CLM (Contract Lifecycle Management) platforms reduce contract cycle times by 50% and improve compliance by 30%.',
};

// ============================================================================
// EXPORTS
// ============================================================================

export const LEGAL_COMPLIANCE_PACKS: TrainingPack[] = [
  regulatoryCascade,
  gdprGovernance,
  ipMoat,
  contractRisk,
];
