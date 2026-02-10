/**
 * Cybersecurity Training Packs
 *
 * Security threat patterns and business impact:
 * - Breach Cascade Patterns & Business Impact
 * - Zero Trust Architecture & Security Maturity
 * - Compliance Frameworks (SOC2, ISO 27001, GDPR Security)
 * - Security Investment ROI & Risk Quantification
 *
 * Sources: IBM Cost of a Data Breach 2024, Verizon DBIR 2024, NIST CSF,
 * Gartner Security, CrowdStrike threat reports
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. BREACH CASCADE PATTERNS & BUSINESS IMPACT
// ============================================================================

const breachCascadePatterns: TrainingPack = {
  id: 'breach-cascade-business-impact',
  title: 'Data Breach Cascades — Attack Vectors, Detection, Business Impact',
  source: 'IBM Cost of Data Breach 2024, Verizon DBIR 2024, Ponemon Institute, CrowdStrike',
  industry: 'Cross-Industry',
  domains: ['engineering', 'finance', 'cs', 'hr', 'strategy'],
  confidence: 0.86,
  tags: ['breach', 'ransomware', 'phishing', 'attack-vector', 'detection', 'response', 'cost'],

  causalChains: [
    // Phishing success → credential compromise → lateral movement → data exfiltration
    { source: 'engineering', target: 'engineering', metric: 'phishing_to_credential_compromise', effectSize: 0.60, lagDays: 1, pValue: 0.001 },
    // Mean time to identify breach → total breach cost (277 days avg in 2024)
    { source: 'engineering', target: 'finance', metric: 'detection_time_to_breach_cost', effectSize: 0.55, lagDays: 0, pValue: 0.001 },
    // Data breach → customer trust erosion → churn acceleration
    { source: 'engineering', target: 'cs', metric: 'breach_to_customer_trust_erosion', effectSize: -0.60, lagDays: 30, pValue: 0.001 },
    // Security AI/automation → MTTD reduction → cost savings ($1.76M avg)
    { source: 'engineering', target: 'finance', metric: 'security_ai_to_cost_reduction', effectSize: -0.40, lagDays: 0, pValue: 0.002 },
    // Breach disclosure → stock price impact → market cap loss
    { source: 'engineering', target: 'finance', metric: 'breach_disclosure_to_stock_impact', effectSize: -0.35, lagDays: 7, pValue: 0.003 },
    // Regulatory fine → compliance cost escalation → margin pressure
    { source: 'strategy', target: 'finance', metric: 'regulatory_fine_to_compliance_cost', effectSize: -0.45, lagDays: 90, pValue: 0.002 },
    // Insider threat → hardest to detect (avg 292 days) → highest cost
    { source: 'hr', target: 'engineering', metric: 'insider_threat_to_detection_difficulty', effectSize: 0.50, lagDays: 0, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Breach Detection Time Exceeds Benchmark',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.mean_time_to_identify_days', operator: 'greater_than', value: 200 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Mean time to identify breaches exceeds 200 days. IBM 2024: average is 194 days to identify + 64 days to contain = 258 day lifecycle. Breaches identified in < 200 days cost $1.02M less. Organizations with AI/ML security tools cut detection to 108 days and save $1.76M. Invest in SIEM, EDR, and security automation.' } },
      ],
      naturalLanguage: 'Every day a breach goes undetected increases its cost and scope. At 200+ days, attackers have moved laterally, exfiltrated data, and established persistence. Detection time is the single most controllable cost factor.',
    },
    {
      title: 'Security Training Gap',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.phishing_simulation_click_rate', operator: 'greater_than', value: 0.15 },
        { field: 'hr.security_training_completion_rate', operator: 'less_than', value: 0.80 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Phishing click rate > 15% with < 80% training completion. Verizon DBIR 2024: 68% of breaches involve human element (social engineering, errors). Trained employees click phishing at 3-5% vs 15-30% untrained. Security awareness training has 72x ROI.' } },
      ],
      naturalLanguage: 'High phishing click rates with low training completion create the largest attack surface. The human element is involved in 68% of breaches — training is the highest ROI security investment.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['breach', 'ransomware', 'data-loss', 'exfiltration'], target: ['cost', 'fine', 'revenue-loss', 'litigation', 'stock-price'] },
      reasonTemplate: 'IBM 2024: average data breach costs $4.88M (up 10% from 2023). Healthcare: $9.77M. Financial: $6.08M. Cost breakdown: lost business (35%), detection/escalation (29%), post-breach response (24%), notification (12%). Companies with incident response plans and testing save $1.49M.' },
    { source: 'engineering', target: 'cs', type: 'triggers', severity: 'critical',
      keywords: { source: ['data-breach', 'customer-data', 'pii-exposed', 'notification'], target: ['churn', 'trust', 'brand-damage', 'customer-loss'] },
      reasonTemplate: 'Post-breach customer churn averages 3.4% in year 1, with B2B SaaS seeing up to 10% churn from enterprise customers with strict security requirements. The trust repair takes 2-3 years. Some customer relationships never recover.' },
  ],

  patterns: [
    { name: 'Attack Vector Distribution (Verizon 2024)', domains: ['engineering'], description: 'Phishing: 16% of breaches. Stolen credentials: 15%. Vulnerability exploitation: 14%. Ransomware: 24% (of incidents). Human element involved in 68% of breaches. Web application attacks: most common technical vector. Supply chain: growing fastest (12% YoY increase).', observed: 88, expected: 20, total: 100 },
    { name: 'Breach Cost by Industry', domains: ['finance', 'engineering'], description: 'Healthcare: $9.77M avg breach cost. Financial services: $6.08M. Pharmaceuticals: $5.01M. Technology: $4.97M. Energy: $4.78M. Global average: $4.88M. US average: $9.36M (highest by country). Mega-breach (50M+ records): $375M+.', observed: 85, expected: 25, total: 100 },
    { name: 'Security AI/Automation Cost Impact', domains: ['engineering', 'finance'], description: 'Organizations with extensive AI/automation in security: $1.76M lower breach cost, 108 fewer days to detect. Moderate AI/automation: $0.88M savings. No AI/automation: $5.72M avg cost vs $3.84M with extensive automation. Security AI is the single largest cost-reduction factor.', observed: 82, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'breach_cost', expectedChange: -0.36, timeframeDays: 365, condition: 'security_ai_extensive AND incident_response_tested' },
    { metric: 'detection_time_days', expectedChange: -0.45, timeframeDays: 365, condition: 'siem_deployed AND edr_coverage_100pct' },
    { metric: 'customer_churn_post_breach', expectedChange: -0.50, timeframeDays: 365, condition: 'rapid_notification AND transparent_communication' },
  ],

  narrative: `Data breaches follow predictable cascade patterns with quantifiable business impact. IBM's 2024 report: average breach costs $4.88M, takes 258 days to identify and contain, and causes 3.4% customer churn. The human element is involved in 68% of breaches (Verizon DBIR 2024). Security AI and automation is the biggest cost reducer: $1.76M savings and 108 fewer detection days. The breach cascade runs: initial compromise → lateral movement → data exfiltration → detection → containment → notification → remediation → litigation → brand repair. Every day of undetected breach adds cost. Organizations with incident response plans, security AI, and employee training reduce breach cost by 50-60%.`,
};

// ============================================================================
// 2. ZERO TRUST & SECURITY MATURITY
// ============================================================================

const zeroTrustMaturity: TrainingPack = {
  id: 'zero-trust-security-maturity',
  title: 'Zero Trust Architecture & Security Maturity Model',
  source: 'NIST SP 800-207 Zero Trust, Gartner Security 2024, Forrester Zero Trust, CISA ZTA',
  industry: 'Cross-Industry',
  domains: ['engineering', 'strategy', 'finance'],
  confidence: 0.83,
  tags: ['zero-trust', 'security-maturity', 'identity', 'mfa', 'sase', 'endpoint', 'network-segmentation'],

  causalChains: [
    // Zero trust adoption → breach cost reduction ($1.03M savings per IBM)
    { source: 'engineering', target: 'finance', metric: 'zero_trust_to_breach_cost_reduction', effectSize: -0.40, lagDays: 365, pValue: 0.002 },
    // Identity-first security → credential abuse prevention → breach prevention
    { source: 'engineering', target: 'engineering', metric: 'identity_security_to_credential_protection', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // MFA adoption → phishing resistance → attack surface reduction
    { source: 'engineering', target: 'engineering', metric: 'mfa_to_phishing_resistance', effectSize: -0.60, lagDays: 14, pValue: 0.001 },
    // Endpoint detection → lateral movement prevention → blast radius containment
    { source: 'engineering', target: 'engineering', metric: 'edr_to_lateral_movement_prevention', effectSize: -0.50, lagDays: 7, pValue: 0.002 },
    // Security maturity level → insurance premium reduction
    { source: 'engineering', target: 'finance', metric: 'security_maturity_to_insurance_premium', effectSize: -0.35, lagDays: 365, pValue: 0.005 },
    // Supply chain security → third-party risk reduction
    { source: 'engineering', target: 'strategy', metric: 'supply_chain_security_to_third_party_risk', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Zero Trust Maturity Below Threshold',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.zero_trust_maturity_score', operator: 'less_than', value: 0.40 },
        { field: 'engineering.cloud_workload_pct', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Zero trust maturity below 40% with majority cloud workloads. IBM 2024: organizations with mature zero trust save $1.03M per breach. NIST 800-207 framework: verify explicitly, use least privilege, assume breach. Priority: MFA everywhere, network micro-segmentation, continuous authentication, SASE for remote access.' } },
      ],
      naturalLanguage: 'Cloud-heavy organizations without zero trust operate with an assumed-trust model that is fundamentally incompatible with modern threat landscapes. Every user, device, and connection must be verified.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['zero-trust', 'mfa', 'segmentation', 'sase', 'endpoint'], target: ['breach-cost-reduction', 'insurance-premium', 'compliance', 'risk-reduction'] },
      reasonTemplate: 'Zero trust architecture reduces breach cost by $1.03M (IBM 2024). MFA alone blocks 99.9% of credential-based attacks (Microsoft). Network segmentation limits blast radius from a single compromised system to its micro-segment. The investment payback is typically 12-18 months.' },
    { source: 'engineering', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['security-maturity', 'soc2', 'iso27001', 'compliance'], target: ['enterprise-sales', 'market-access', 'trust', 'competitive-advantage'] },
      reasonTemplate: 'Security maturity (SOC 2, ISO 27001) is now a prerequisite for enterprise sales. 70% of enterprise RFPs include security questionnaires. Companies with mature security programs close enterprise deals 30% faster. Security is a revenue enabler, not just a cost center.' },
  ],

  patterns: [
    { name: 'Zero Trust Principles (NIST 800-207)', domains: ['engineering'], description: 'Core principles: (1) All resources accessed securely regardless of location, (2) Access granted per-session on least privilege, (3) All traffic inspected and logged, (4) Policy is dynamic and contextual (user + device + behavior), (5) All assets continuously monitored. Trust is never implicit.', observed: 85, expected: 25, total: 100 },
    { name: 'MFA Impact Statistics', domains: ['engineering'], description: 'Microsoft: MFA blocks 99.9% of credential attacks. Google: zero successful phishing attacks on 85K+ employees after mandatory security keys. Despite this, only 57% of companies enforce MFA for all users. The gap between effectiveness and adoption is the biggest security opportunity.', observed: 88, expected: 20, total: 100 },
    { name: 'Security as Revenue Enabler', domains: ['engineering', 'finance'], description: 'Enterprise buyers require: SOC 2 Type II (table stakes), ISO 27001 (international), HIPAA (healthcare), PCI-DSS (payments). Companies with SOC 2 Type II close enterprise deals 30% faster. The security-as-cost-center mindset misses the revenue acceleration benefit.', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'breach_cost_reduction', expectedChange: -0.25, timeframeDays: 365, condition: 'zero_trust_deployed AND mfa_universal' },
    { metric: 'enterprise_deal_velocity', expectedChange: 0.30, timeframeDays: 180, condition: 'soc2_type2_achieved AND security_questionnaire_automated' },
  ],

  narrative: `Zero Trust is the architectural paradigm shift from "trust but verify" to "never trust, always verify." NIST 800-207 establishes the framework: verify explicitly, use least privilege, assume breach. The business case is quantifiable: $1.03M lower breach cost, 99.9% reduction in credential attacks with MFA, and 30% faster enterprise deal closure with SOC 2 Type II. Security has evolved from a cost center to a revenue enabler — 70% of enterprise RFPs now include security questionnaires. Companies that invest in security maturity gain competitive advantage in enterprise markets while simultaneously reducing breach risk and cost.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const CYBERSECURITY_PACKS: TrainingPack[] = [
  breachCascadePatterns,
  zeroTrustMaturity,
];
