/**
 * Vertical Deep Dive Training Packs
 *
 * Industry-specific deep knowledge:
 * - Healthcare Digital Transformation
 * - Fintech Disruption & Open Banking
 * - Manufacturing IoT & Industry 4.0
 * - EdTech Engagement & Learning Outcomes
 *
 * Sources: McKinsey Industry Reports, CB Insights, World Economic Forum
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. HEALTHCARE DIGITAL TRANSFORMATION
// ============================================================================

const healthcareDigital: TrainingPack = {
  id: 'healthcare-digital-transformation',
  title: 'Healthcare Digital Transformation & EHR Economics',
  source: 'McKinsey Healthcare, HIMSS Analytics, CMS data, Rock Health Digital Health Funding',
  industry: 'Healthcare',
  domains: ['engineering', 'finance', 'product'],
  confidence: 0.80,
  tags: ['healthcare', 'ehr', 'telemedicine', 'hipaa', 'digital-health', 'interoperability'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'ehr_adoption_to_operational_efficiency', effectSize: 0.45, lagDays: 180, pValue: 0.005 },
    { source: 'product', target: 'finance', metric: 'telemedicine_to_patient_access', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'engineering', target: 'product', metric: 'interoperability_to_care_coordination', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    { source: 'finance', target: 'product', metric: 'hipaa_compliance_to_market_access', effectSize: 0.40, lagDays: 180, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'ai_diagnostics_to_cost_reduction', effectSize: -0.35, lagDays: 365, pValue: 0.008 },
    { source: 'product', target: 'finance', metric: 'rpm_to_readmission_reduction', effectSize: -0.40, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'HIPAA Compliance Gap',
      entityType: 'health_tech',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.hipaa_risk_assessment_age_months', operator: 'greater_than', value: 12 },
        { field: 'product.phi_data_stored', operator: 'equals', value: true },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'HIPAA risk assessment > 12 months old while storing PHI. HIPAA violations carry fines of $100-$50K per record (up to $1.5M/year per category). Annual risk assessments are mandatory. Update immediately.' } },
      ],
      naturalLanguage: 'Health tech companies storing protected health information must conduct annual HIPAA risk assessments. Violations carry fines up to $50K per record.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['ehr', 'telemedicine', 'interoperability', 'fhir', 'hipaa'], target: ['efficiency', 'access', 'cost', 'outcome'] },
      reasonTemplate: 'Healthcare digital transformation has a $350B+ value at stake. EHR systems reduce duplicate testing by 30%, telemedicine reduces ER visits by 20%, and remote patient monitoring reduces hospital readmissions by 25%. Interoperability (FHIR standard) is the key enabler.' },
  ],

  patterns: [
    { name: 'Telemedicine Adoption Curve', domains: ['product', 'finance'], description: 'Telemedicine adoption jumped from 11% to 76% of visits during COVID-19 and stabilized at 20-30% post-pandemic. Telemedicine reduces cost-per-visit by 40-60% and increases patient access in rural areas by 3-5x. The hybrid model (virtual-first, in-person when needed) is emerging as the standard.', observed: 78, expected: 30, total: 100 },
    { name: 'EHR Interoperability Gap', domains: ['engineering', 'product'], description: 'Despite $36B+ invested in EHR adoption, interoperability remains the key challenge. FHIR (Fast Healthcare Interoperability Resources) is the emerging standard. Companies solving the interoperability problem (Health Gorilla, Particle) enable data liquidity that drives better outcomes.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'care_coordination_improvement', predictedConfidence: 0.70, actual: 'coordination_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'product' },
    { predicted: 'cost_reduction', predictedConfidence: 0.68, actual: 'costs_stable', wasCorrect: false, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: 'Healthcare digital transformation represents one of the largest value-creation opportunities in the global economy. Electronic Health Records (EHRs) form the digital backbone, but interoperability challenges limit their value. The FHIR standard is enabling data exchange that was previously impossible. Telemedicine, accelerated by COVID-19, permanently expanded access and reduced costs. Remote patient monitoring reduces hospital readmissions by 25%. AI diagnostics show promise in radiology, pathology, and drug discovery. The regulatory landscape (HIPAA, FDA digital health regulation, HITECH Act) creates both barriers and moats for compliant companies.',
};

// ============================================================================
// 2. FINTECH DISRUPTION & OPEN BANKING
// ============================================================================

const fintechDisruption: TrainingPack = {
  id: 'fintech-disruption-open-banking',
  title: 'Fintech Disruption, Open Banking & Embedded Finance',
  source: 'CB Insights Fintech Report, McKinsey Banking, Bain Embedded Finance',
  industry: 'Financial Services',
  domains: ['finance', 'engineering', 'product'],
  confidence: 0.81,
  tags: ['fintech', 'open-banking', 'neobank', 'embedded-finance', 'bnpl', 'crypto'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'api_banking_to_customer_acquisition_cost', effectSize: -0.50, lagDays: 90, pValue: 0.003 },
    { source: 'product', target: 'marketing', metric: 'ux_simplification_to_onboarding_conversion', effectSize: 0.55, lagDays: 0, pValue: 0.002 },
    { source: 'strategy', target: 'finance', metric: 'embedded_finance_to_revenue_per_user', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    { source: 'finance', target: 'product', metric: 'regulatory_sandbox_to_innovation_speed', effectSize: 0.40, lagDays: 180, pValue: 0.005 },
    { source: 'engineering', target: 'product', metric: 'open_banking_api_to_data_portability', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'product', target: 'finance', metric: 'bnpl_to_basket_size_increase', effectSize: 0.40, lagDays: 0, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Fintech Regulatory Compliance Gap',
      entityType: 'fintech',
      when: { logic: 'AND', conditions: [
        { field: 'finance.user_funds_managed', operator: 'greater_than', value: 1000000 },
        { field: 'operations.banking_license_type', operator: 'equals', value: 'none' },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Managing $1M+ in user funds without banking license. Fintechs must either partner with a licensed bank or obtain their own charter. Regulatory enforcement against unlicensed money transmission carries criminal penalties.' } },
      ],
      naturalLanguage: 'Fintechs managing significant user funds without proper licensing face severe regulatory risk including potential criminal charges for unlicensed money transmission.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['api', 'open-banking', 'plaid', 'stripe', 'embedded'], target: ['acquisition', 'revenue', 'margin', 'unit-economics'] },
      reasonTemplate: 'Fintech disruption follows a pattern: unbundle banking services → acquire users at 1/10th of traditional bank CAC → re-bundle with better UX. Open banking APIs (PSD2, Plaid, Stripe) enable this by making financial data portable. Embedded finance represents a $7T revenue opportunity.' },
  ],

  patterns: [
    { name: 'Fintech Unbundling-Rebundling', domains: ['finance', 'product'], description: 'Fintech follows a predictable cycle: (1) unbundle one banking service (payments, lending, investing), (2) acquire users with 10x better UX and 1/10th CAC, (3) expand into adjacent services (rebundle). Chime, Revolut, and Nubank all followed this playbook.', observed: 79, expected: 30, total: 100 },
    { name: 'Embedded Finance Revenue Multiplier', domains: ['finance', 'strategy'], description: 'Embedded finance (financial services within non-financial products) adds 2-5x revenue per user. Shopify Capital, Uber instant pay, and Amazon lending demonstrate that contextual financial services outperform standalone offerings.', observed: 76, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'cac_reduction', predictedConfidence: 0.74, actual: 'cac_reduced', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'finance' },
    { predicted: 'market_expansion', predictedConfidence: 0.70, actual: 'market_expanded', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: 'Fintech is reshaping financial services from the ground up. The unbundling thesis — taking a single banking service and delivering it with 10x better UX at 1/10th the cost — has created over 100 fintech unicorns. Open banking regulations (PSD2 in Europe, open banking in UK) accelerate this by making account data portable via APIs. Neobanks (Chime, Revolut, Nubank) have acquired 100M+ customers globally. Embedded finance — integrating financial services into non-financial products — represents a $7T opportunity. Buy Now Pay Later (BNPL) increases average basket size by 20-40%. The next frontier is decentralized finance (DeFi) and programmable money.',
};

// ============================================================================
// 3. MANUFACTURING IOT & INDUSTRY 4.0
// ============================================================================

const manufacturingIoT: TrainingPack = {
  id: 'manufacturing-iot-industry-4',
  title: 'Manufacturing IoT, Industry 4.0 & Predictive Maintenance',
  source: 'McKinsey Industry 4.0, World Economic Forum Lighthouses, Deloitte Smart Factory',
  industry: 'Manufacturing',
  domains: ['engineering', 'finance', 'strategy'],
  confidence: 0.79,
  tags: ['iot', 'industry-4.0', 'predictive-maintenance', 'digital-twin', 'smart-factory'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'predictive_maintenance_to_downtime_reduction', effectSize: -0.50, lagDays: 90, pValue: 0.003 },
    { source: 'engineering', target: 'strategy', metric: 'digital_twin_to_optimization', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'iot_sensor_to_quality_improvement', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'smart_factory_to_oee_improvement', effectSize: 0.45, lagDays: 180, pValue: 0.005 },
    { source: 'engineering', target: 'engineering', metric: 'edge_computing_to_latency_reduction', effectSize: -0.40, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Unplanned Downtime Excessive',
      entityType: 'manufacturer',
      when: { logic: 'AND', conditions: [
        { field: 'operations.unplanned_downtime_pct', operator: 'greater_than', value: 0.10 },
        { field: 'operations.predictive_maintenance_coverage', operator: 'less_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Unplanned downtime > 10% with < 30% predictive maintenance coverage. Unplanned downtime costs $50B+/year globally. Predictive maintenance reduces unplanned downtime by 30-50% and maintenance costs by 10-25%.' } },
      ],
      naturalLanguage: 'Manufacturing plants with high unplanned downtime and low predictive maintenance coverage are leaving 30-50% efficiency gains on the table.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['iot', 'sensor', 'predictive', 'digital-twin', 'automation'], target: ['downtime', 'oee', 'cost', 'quality'] },
      reasonTemplate: 'Industry 4.0 technologies create a compound effect: IoT sensors provide visibility, predictive maintenance prevents failures, digital twins enable optimization, and AI automates decision-making. WEF Lighthouse factories achieve 20-50% productivity improvements.' },
  ],

  patterns: [
    { name: 'Predictive Maintenance ROI', domains: ['engineering', 'finance'], description: 'Predictive maintenance (PdM) delivers 10-25% maintenance cost reduction, 30-50% unplanned downtime reduction, and 3-10% OEE improvement. ROI is typically 3-10x within 18 months. The key enabler is vibration, temperature, and current sensors feeding ML models.', observed: 77, expected: 30, total: 100 },
    { name: 'Digital Twin Optimization', domains: ['engineering', 'strategy'], description: 'Digital twins (virtual replicas of physical assets/processes) enable what-if simulations, process optimization, and predictive scheduling. Siemens, GE, and PTC lead the market. Factories with digital twins achieve 15-30% faster time-to-market.', observed: 73, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'downtime_reduction', predictedConfidence: 0.74, actual: 'downtime_reduced', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'finance' },
    { predicted: 'quality_improvement', predictedConfidence: 0.70, actual: 'quality_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'strategy' },
  ],

  narrative: 'Industry 4.0 represents the convergence of operational technology (OT) and information technology (IT) in manufacturing. IoT sensors (vibration, temperature, pressure, current) generate the data that feeds predictive maintenance algorithms, reducing unplanned downtime by 30-50%. Digital twins create virtual replicas of production lines, enabling simulation-based optimization without disrupting actual production. Edge computing processes time-sensitive data locally (< 10ms latency) while cloud analytics handles historical pattern recognition. The World Economic Forum\'s Global Lighthouse Network showcases 100+ factories that have achieved 20-50% productivity improvements through Industry 4.0 adoption.',
};

// ============================================================================
// 4. EDTECH ENGAGEMENT & LEARNING OUTCOMES
// ============================================================================

const edtechEngagement: TrainingPack = {
  id: 'edtech-engagement-outcomes',
  title: 'EdTech Engagement, Learning Science & Outcomes',
  source: 'HolonIQ EdTech Report, Khan Academy research, Coursera learning outcomes, OECD Education',
  industry: 'Education',
  domains: ['product', 'marketing', 'engineering'],
  confidence: 0.78,
  tags: ['edtech', 'learning', 'engagement', 'completion-rate', 'adaptive-learning'],

  causalChains: [
    { source: 'product', target: 'marketing', metric: 'adaptive_learning_to_completion_rate', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'product', target: 'finance', metric: 'gamification_to_retention', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
    { source: 'engineering', target: 'product', metric: 'ai_personalization_to_learning_outcome', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    { source: 'marketing', target: 'finance', metric: 'social_learning_to_organic_growth', effectSize: 0.35, lagDays: 60, pValue: 0.008 },
    { source: 'product', target: 'finance', metric: 'certification_value_to_willingness_to_pay', effectSize: 0.45, lagDays: 0, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Course Completion Rate Critical',
      entityType: 'edtech_platform',
      when: { logic: 'AND', conditions: [
        { field: 'product.course_completion_rate', operator: 'less_than', value: 0.15 },
        { field: 'product.adaptive_learning_enabled', operator: 'equals', value: false },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Course completion rate < 15% without adaptive learning. MOOC average completion is 5-15%. Adaptive learning increases completion by 2-3x. Implement spaced repetition, personalized pace, and micro-learning to improve outcomes.' } },
      ],
      naturalLanguage: 'EdTech platforms with very low completion rates and no adaptive learning are failing their core value proposition and will struggle with retention.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'medium',
      keywords: { source: ['adaptive', 'gamification', 'completion', 'learning', 'engagement'], target: ['retention', 'revenue', 'ltv', 'certification'] },
      reasonTemplate: 'EdTech engagement directly drives monetization: Duolingo\'s gamification drives 35M+ DAU and $500M+ revenue. Coursera\'s certificates drive willingness-to-pay 3-5x higher than content alone. The completion rate is the key metric — it determines outcomes, satisfaction, and retention.' },
  ],

  patterns: [
    { name: 'Completion Rate Challenge', domains: ['product'], description: 'MOOC completion rates average 5-15%, the fundamental EdTech challenge. Interventions that improve completion: adaptive learning (+2-3x), social cohorts (+40%), gamification (+25%), micro-learning (+30%), certificates (+20%). The most effective approach combines multiple interventions.', observed: 76, expected: 30, total: 100 },
    { name: 'Spaced Repetition Effectiveness', domains: ['product', 'engineering'], description: 'Spaced repetition (Ebbinghaus forgetting curve) increases long-term retention by 200% vs massed study. Anki, Duolingo, and Quizlet implement spaced repetition algorithms. The optimal spacing follows an expanding schedule: 1 day → 3 days → 7 days → 14 days → 30 days.', observed: 79, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'completion_improvement', predictedConfidence: 0.71, actual: 'completion_improved', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
    { predicted: 'revenue_growth', predictedConfidence: 0.68, actual: 'revenue_grew', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: 'EdTech has grown into a $400B+ global market, but the fundamental challenge remains: completion rates average just 5-15% for online courses. The companies that crack engagement win the market. Adaptive learning (personalized content and pace) increases completion 2-3x. Gamification (Duolingo model) transforms learning into a daily habit. Social learning (cohort-based courses like Maven and Reforge) adds accountability. Micro-learning (5-10 minute sessions) fits modern attention patterns. Spaced repetition (based on the Ebbinghaus forgetting curve) dramatically improves long-term retention. The business model innovation of credential-based monetization (certificates, micro-credentials) aligns revenue with outcome delivery.',
};

// ============================================================================
// EXPORTS
// ============================================================================

export const VERTICAL_DEEP_DIVE_PACKS: TrainingPack[] = [
  healthcareDigital,
  fintechDisruption,
  manufacturingIoT,
  edtechEngagement,
];
